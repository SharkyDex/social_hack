import { CONFIG } from '../config.js';
import { mulberry32 } from '../utils/random.js';
import { zoneCoords, zoneBounds, zoneLabel } from '../utils/grid.js';

// Static per-zone data: population, vulnerable %, and key facilities.
// This is the "what's here" layer — generated once, independent of any
// disaster. Replace generateZoneData() with real city data later; every
// other module only depends on the shape returned here.

// How many of each facility to scatter across the grid. Each facility lands
// in its own distinct zone (no zone holds two), so a zone's `facility` is a
// single value or null. Change the counts here to taste.
const FACILITY_COUNTS = {
  hospital: 7,
  school: 5,
  college: 4,
  special_care: 9,
};

export function generateZoneData(heightAt) {
  const rand = mulberry32(CONFIG.seed + 7);
  const total = CONFIG.zonesX * CONFIG.zonesZ;

  // Assign facilities to distinct random zones. Shuffle all zone ids, then
  // hand them out in blocks — hospitals first, then schools, etc.
  const shuffled = [...Array(total).keys()];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const facilityOf = new Array(total).fill(null);
  let ptr = 0;
  for (const [type, count] of Object.entries(FACILITY_COUNTS)) {
    for (let k = 0; k < count; k++) facilityOf[shuffled[ptr++]] = type;
  }

  const zones = [];
  for (let id = 0; id < total; id++) {
    const { cx, cz } = zoneBounds(id);
    const elevation = heightAt(cx, cz);

    const population = Math.round(300 + rand() * 2200);
    const vulnerablePct = 0.06 + rand() * 0.22; // elderly, device-dependent, mobility-limited
    const facility = facilityOf[id];

    zones.push({
      id,
      label: zoneLabel(id),
      coords: zoneCoords(id),
      bounds: zoneBounds(id),
      elevation,
      population,
      vulnerablePct,
      facility, // 'hospital' | 'school' | 'college' | 'special_care' | null
      hasHospital: facility === 'hospital', // used by hospital-access routing
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
