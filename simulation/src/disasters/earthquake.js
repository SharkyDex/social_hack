import { Disaster } from './base.js';
import { CONFIG } from '../config.js';
import { distanceMeters, sampleElevationRange } from '../utils/geo.js';

// A seismic wave radiates outward from a fixed epicenter. Each zone's
// shaking intensity:
//   1. Doesn't arrive until the wave (traveling at `waveSpeed`) reaches it —
//      so you can watch the shaking spread outward in real time.
//   2. Attenuates with distance from the epicenter (an inverse-square-style
//      falloff, the standard shape of real ground-motion attenuation) —
//      so severity genuinely decreases away from the origin instead of
//      eventually reaching everywhere equally.
//   3. Is amplified on real low-lying ground near the river (soft
//      alluvial soil shakes harder than bedrock/high ground — this uses
//      actual sampled terrain elevation, not a placeholder).
// The DAMAGE a zone takes is permanent: once the wave shakes a zone, that
// zone's damage level stays put (collapsed/cracked structures don't repair
// themselves during the event). So unlike a fire that burns out, the final
// map IS the damage assessment. The run ends once the wave has swept past
// the farthest zone, at which point the whole damage map has settled.

export class Earthquake extends Disaster {
  get name() {
    return 'earthquake';
  }

  init(world, zones) {
    const { centerLon, centerLat } = CONFIG.aoi;
    this.epicenter = { lon: centerLon, lat: centerLat };

    const { min: minElev, max: maxElev } = sampleElevationRange(world.heightAt, CONFIG.aoi, 16);
    this.minElev = minElev;
    this.maxElev = Math.max(maxElev, minElev + 1);

    this.zoneInfo = zones.map((z) => ({
      distance: distanceMeters(this.epicenter.lon, this.epicenter.lat, z.bounds.cx, z.bounds.cz),
      elevation: world.heightAt(z.bounds.cx, z.bounds.cz),
    }));

    this.damage = new Float32Array(zones.length);
    this.clock = 0;
    this.waveSpeed = 500; // m/s — slowed way down from a real S-wave (~3-4 km/s) so the spread is watchable
    this.attenuationScale = 1300; // meters — larger = shaking reaches farther before fading
    this.farthest = Math.max(...this.zoneInfo.map((z) => z.distance));
  }

  step(_dt, _world, zones) {
    this.clock += _dt;
    const waveRadius = this.clock * this.waveSpeed;

    zones.forEach((z, i) => {
      const { distance, elevation } = this.zoneInfo[i];

      if (distance <= waveRadius) {
        const attenuation = 1 / (1 + (distance / this.attenuationScale) ** 2);
        const normElev = (elevation - this.minElev) / (this.maxElev - this.minElev);
        const soilAmplification = 1 + 0.5 * (1 - normElev); // lower/softer ground shakes harder
        const intensity = Math.min(1, attenuation * soilAmplification);
        // Damage is permanent — a zone's level only ever ratchets up as the
        // wave reaches it; it never heals back down during the event.
        this.damage[i] = Math.max(this.damage[i], intensity);
      }

      z.hazard = this.damage[i];
      z.roadBlocked = z.hazard > 0.5;
    });
  }

  render() {}

  // Done once the wave has swept past the farthest zone (plus ~1s so the
  // final damage map is visible before export). The damage map is already
  // its final state at that point — nothing recovers.
  isFinished() {
    return this.clock > this.farthest / this.waveSpeed + 1;
  }

  reset() {
    this.damage?.fill(0);
    this.clock = 0;
  }
}
