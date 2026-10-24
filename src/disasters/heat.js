import { Disaster } from './base.js';
import { CONFIG } from '../config.js';
import { makeNoise2D } from '../utils/random.js';

// Heat wave: ambient temperature climbs over time; each zone's hazard rises
// faster if it has lots of concrete and little tree cover — the urban heat
// island effect. Density/cover here are a noise-based placeholder (see
// CONTRIBUTING.md for swapping in real OSM building/landuse data for
// Minneapolis). No roads are blocked; the danger is thermal load on people
// and devices.

const densityNoise = makeNoise2D(CONFIG.seed + 55);
const coverNoise = makeNoise2D(CONFIG.seed + 99);

function densityAt(lon, lat) {
  return Math.max(0, Math.min(1, densityNoise(lon * 300, lat * 300, 3) * 1.1 - 0.05));
}
function coverAt(lon, lat) {
  return Math.max(0, Math.min(1, coverNoise(lon * 400, lat * 400, 4) * 1.4 - 0.25));
}

export class HeatWave extends Disaster {
  get name() {
    return 'heat';
  }

  init() {
    this.ambient = 0;
    this.rampRate = 0.07; // per second — tuned for a demo-length run
  }

  step(dt, _world, zones) {
    this.ambient = Math.min(1, this.ambient + this.rampRate * dt);

    for (const z of zones) {
      const { cx, cz } = z.bounds; // cx=lon, cz=lat
      const density = densityAt(cx, cz);
      const cover = coverAt(cx, cz);
      const islandEffect = Math.max(0, density * 0.6 - cover * 0.4);
      z.hazard = Math.min(1, this.ambient * (0.6 + islandEffect));
      z.roadBlocked = false;
    }
  }

  render() {}

  reset() {
    this.ambient = 0;
  }
}
