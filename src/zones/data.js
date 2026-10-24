import { CONFIG } from '../config.js';
import { mulberry32 } from '../utils/random.js';
import { zoneCoords, zoneBounds, zoneLabel } from '../utils/grid.js';

// Static per-zone data: population, vulnerable %, hospital access.
// This is the "who lives here" layer — generated once, independent of any
// disaster. Replace generateZoneData() with real city data later; every
// other module only depends on the shape returned here.

export function generateZoneData(heightAt) {
  const rand = mulberry32(CONFIG.seed + 7);
  const total = CONFIG.zonesX * CONFIG.zonesZ;
  const zones = [];

  // Pick a few zones to host hospitals (roughly spread out).
  const hospitalZones = new Set();
  const hospitalCount = Math.max(2, Math.round(total / 14));
  while (hospitalZones.size < hospitalCount) {
    hospitalZones.add(Math.floor(rand() * total));
  }

  for (let id = 0; id < total; id++) {
    const { cx, cz } = zoneBounds(id);
    const elevation = heightAt(cx, cz);

    const population = Math.round(300 + rand() * 2200);
    const vulnerablePct = 0.06 + rand() * 0.22; // elderly, device-dependent, mobility-limited
    const hasHospital = hospitalZones.has(id);

    zones.push({
      id,
      label: zoneLabel(id),
      coords: zoneCoords(id),
      bounds: zoneBounds(id),
      elevation,
      population,
      vulnerablePct,
      hasHospital,
      // filled in later by disasters/zones/scoring:
      hazard: 0,
      roadBlocked: false,
      hospitalReachable: true,
      severity: 'safe',
      score: 0,
    });
  }

  return zones;
}
