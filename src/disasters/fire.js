import { Disaster } from './base.js';
import { CONFIG } from '../config.js';
import { makeNoise2D } from '../utils/random.js';
import { sampleElevationRange } from '../utils/geo.js';

// Fire spreads on its own fine grid over the AOI as a cellular automaton,
// with three realism constraints on top of plain neighbor-to-neighbor
// spread:
//
// 1. WATER BLOCKS FIRE. Cells near the lowest sampled elevation (a proxy for
//    the Mississippi riverbed/floodplain — see CONTRIBUTING.md for swapping
//    in real OSM water polygons) have zero fuel and can never ignite.
// 2. MORE FUEL UNDER CANOPY. The noise-based fuel placeholder represents
//    vegetation density — denser "canopy" cells burn hotter and spread
//    faster, consistent with how a real urban fire would behave.
// 3. INTENSITY DECAYS WITH DISTANCE FROM THE IGNITION POINT, with a hard
//    radius cap. A real fire's growth is bounded by finite fuel, wind and
//    suppression effort over time — it doesn't march indefinitely across an
//    entire city. Burned cells also cool down (see COOL_SECONDS) instead of
//    staying hazardous forever, so severity rises, peaks, then recedes.

const GRID_RES = 56; // cells across the AOI's longer side
const COOL_SECONDS = 50; // how long a burned cell stays elevated before fully cooling
const WATER_ELEV_MARGIN = 2.5; // meters above the AOI's lowest point treated as water
const MAX_RADIUS_FRACTION = 0.75; // fire can reach at most this fraction of the grid's shorter side
const BURN_RAMP_PER_TICK = 0.18; // lower = each cell stays at full "burning" intensity longer

const fuelNoise = makeNoise2D(CONFIG.seed + 99);

export class Fire extends Disaster {
  get name() {
    return 'fire';
  }

  init(world) {
    const { west, south, east, north } = CONFIG.aoi;
    const lonSpan = east - west;
    const latSpan = north - south;
    const aspect = lonSpan / latSpan;
    this.cols = aspect >= 1 ? GRID_RES : Math.round(GRID_RES * aspect);
    this.rows = aspect >= 1 ? Math.round(GRID_RES / aspect) : GRID_RES;

    const n = this.cols * this.rows;
    this.state = new Float32Array(n); // 0 unburned, 1 burning, 2 cooling
    this.fuel = new Float32Array(n);
    this.isWater = new Uint8Array(n);
    this.burnIntensity = new Float32Array(n);
    this.burnedAt = new Float32Array(n).fill(-Infinity);
    this.distFromOrigin = new Float32Array(n).fill(Infinity); // in cells

    const { min: minElev } = sampleElevationRange(world.heightAt, CONFIG.aoi, 20);
    const waterCutoff = minElev + WATER_ELEV_MARGIN;

    for (let gz = 0; gz < this.rows; gz++) {
      for (let gx = 0; gx < this.cols; gx++) {
        const i = gz * this.cols + gx;
        const { lon, lat } = this.toWorld(gx, gz);
        const elevation = world.heightAt(lon, lat);

        if (elevation <= waterCutoff) {
          this.isWater[i] = 1;
          this.fuel[i] = 0;
          continue;
        }
        // Placeholder vegetation/canopy density — swap for real OSM
        // landuse/tree-canopy data when available (see CONTRIBUTING.md).
        const canopy = Math.max(0, Math.min(1, fuelNoise(lon * 400, lat * 400, 4) * 1.3 - 0.15));
        this.fuel[i] = canopy;
      }
    }

    // Ignite near the densest non-water fuel found.
    let best = -1;
    let bestFuel = -1;
    for (let i = 0; i < this.fuel.length; i++) {
      if (!this.isWater[i] && this.fuel[i] > bestFuel) {
        bestFuel = this.fuel[i];
        best = i;
      }
    }
    if (best === -1) best = Math.floor(this.fuel.length / 2); // fallback, shouldn't happen
    this.state[best] = 1;
    this.ignition = { gx: best % this.cols, gz: Math.floor(best / this.cols) };

    this.maxRadius = Math.min(this.cols, this.rows) * MAX_RADIUS_FRACTION;
    for (let gz = 0; gz < this.rows; gz++) {
      for (let gx = 0; gx < this.cols; gx++) {
        const dx = gx - this.ignition.gx;
        const dz = gz - this.ignition.gz;
        this.distFromOrigin[gz * this.cols + gx] = Math.sqrt(dx * dx + dz * dz);
      }
    }

    this.wind = { x: 0.8, z: 0.3 };
    this.clock = 0;
    this.spreadTimer = 0;
  }

  toWorld(gx, gz) {
    const { west, south, east, north } = CONFIG.aoi;
    return {
      lon: west + ((gx + 0.5) / this.cols) * (east - west),
      lat: south + ((gz + 0.5) / this.rows) * (north - south),
    };
  }

  step(dt, _world, zones) {
    this.clock += dt;
    this.spreadTimer += dt;

    const SPREAD_INTERVAL = 0.4;
    while (this.spreadTimer > SPREAD_INTERVAL) {
      this.spreadTimer -= SPREAD_INTERVAL;
      this.tickSpread();
    }

    const zoneBurn = new Float32Array(zones.length);
    const zoneRoadWet = new Float32Array(zones.length);
    const zoneTotal = new Float32Array(zones.length);

    for (let gz = 0; gz < this.rows; gz++) {
      for (let gx = 0; gx < this.cols; gx++) {
        const { lon, lat } = this.toWorld(gx, gz);
        const id = zoneIdFor(lon, lat);
        if (id < 0) continue;
        const i = gz * this.cols + gx;
        zoneTotal[id]++;

        if (this.state[i] === 1) {
          zoneBurn[id] += 1;
          zoneRoadWet[id] += 1;
        } else if (this.state[i] === 2) {
          // Debris/structural damage blocks roads for a while after the
          // flames themselves move on — not just during active burning.
          const age = this.clock - this.burnedAt[i];
          const cooled = Math.max(0, 1 - age / COOL_SECONDS);
          zoneBurn[id] += 0.6 * cooled;
          zoneRoadWet[id] += cooled;
        }
      }
    }

    for (const z of zones) {
      z.hazard = zoneTotal[z.id] ? zoneBurn[z.id] / zoneTotal[z.id] : 0;
      z.roadBlocked = zoneTotal[z.id] ? zoneRoadWet[z.id] / zoneTotal[z.id] > 0.3 : false;
    }
  }

  tickSpread() {
    const next = this.state.slice();
    for (let gz = 0; gz < this.rows; gz++) {
      for (let gx = 0; gx < this.cols; gx++) {
        const i = gz * this.cols + gx;
        if (this.state[i] !== 1) continue;

        this.burnIntensity[i] = Math.min(1, this.burnIntensity[i] + BURN_RAMP_PER_TICK);
        if (this.burnIntensity[i] >= 1) {
          next[i] = 2;
          this.burnedAt[i] = this.clock;
        }

        for (const [dx, dz] of NEIGHBORS) {
          const nx = gx + dx;
          const nz = gz + dz;
          if (nx < 0 || nz < 0 || nx >= this.cols || nz >= this.rows) continue;
          const ni = nz * this.cols + nx;
          if (this.state[ni] !== 0 || this.isWater[ni] || this.fuel[ni] < 0.08) continue;

          const distCells = this.distFromOrigin[ni];
          if (distCells > this.maxRadius) continue; // beyond the fire's reach
          const distanceDecay = Math.max(0, 1 - distCells / this.maxRadius);

          const windBias = Math.max(0, dx * this.wind.x + dz * this.wind.z) * 0.5 + 0.5;
          const chance = this.fuel[ni] * windBias * 0.5 * distanceDecay;
          if (Math.random() < chance) next[ni] = 1;
        }
      }
    }
    this.state = next;
  }

  render() {}

  reset() {
    this.state?.fill(0);
    this.burnIntensity?.fill(0);
    this.burnedAt?.fill(-Infinity);
    this.clock = 0;
  }
}

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function zoneIdFor(lon, lat) {
  const { west, south, east, north } = CONFIG.aoi;
  const ix = Math.floor(((lon - west) / (east - west)) * CONFIG.zonesX);
  const iz = Math.floor(((lat - south) / (north - south)) * CONFIG.zonesZ);
  if (ix < 0 || iz < 0 || ix >= CONFIG.zonesX || iz >= CONFIG.zonesZ) return -1;
  return ix + iz * CONFIG.zonesX;
}
