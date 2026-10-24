import * as Cesium from 'cesium';
import { Disaster } from './base.js';
import { CONFIG } from '../config.js';
import { sampleElevationRange } from '../utils/geo.js';

// Water level rises steadily, up to a crest. Because we're on Cesium World
// Terrain (real elevation data), low-lying real ground — the Mississippi
// riverbed and floodplain — floods first on its own; no synthetic river
// carving needed. A zone's hazard is the fraction of its sampled points
// below the current water level.
//
// The crest is capped at a fraction of the AOI's real elevation range
// (CREST_FRACTION) instead of rising forever — an uncapped flood will
// eventually submerge even the highest real ground, which isn't a realistic
// "normal" flood event. Raise CREST_FRACTION to simulate a more extreme
// flood.

const CREST_FRACTION = 0.3;

export class Flood extends Disaster {
  get name() {
    return 'flood';
  }

  init(world) {
    const { min, max } = sampleElevationRange(world.heightAt, CONFIG.aoi, 16);
    // Start just above the lowest point we sampled in the AOI, so the flood
    // visibly begins at the river instead of an arbitrary fixed number.
    this.level = min + 1;
    this.maxLevel = min + Math.max(3, (max - min) * CREST_FRACTION);
    this.riseRate = 0.6; // meters per second — tuned for a demo-length run
    this.entity = null;
  }

  step(dt, world, zones) {
    this.level = Math.min(this.maxLevel, this.level + this.riseRate * dt);

    const SAMPLES = 4; // per zone edge, i.e. 16 sample points per zone
    for (const z of zones) {
      let wet = 0;
      const { minX, minZ, maxX, maxZ } = z.bounds;
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const lon = minX + ((maxX - minX) * (i + 0.5)) / SAMPLES;
          const lat = minZ + ((maxZ - minZ) * (j + 0.5)) / SAMPLES;
          const h = world.heightAt(lon, lat);
          if (h < this.level) wet++;
        }
      }
      z.hazard = wet / (SAMPLES * SAMPLES);
      // No real street-network data wired in yet — approximate "cut off" as
      // "most of the zone itself is underwater" (see CONTRIBUTING.md).
      z.roadBlocked = z.hazard > 0.6;
    }
  }

  render(_scene, world) {
    const { west, south, east, north } = CONFIG.aoi;
    if (!this.entity) {
      this.entity = world.viewer.entities.add({
        name: 'Flood water',
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
          material: Cesium.Color.fromCssColorString('#2f6fb0').withAlpha(0.55),
          height: this.level,
        },
      });
    }
    this.entity.rectangle.height = this.level;
  }

  reset(_scene, world) {
    if (this.entity) {
      world.viewer.entities.remove(this.entity);
      this.entity = null;
    }
  }
}
