import { CONFIG } from '../config.js';
import { updateHospitalAccess } from './access.js';

// Combines hazard + vulnerability + access-to-care into one 0..1 score per
// zone, then labels it Critical / Dangerous / Moderate / Safe.
//
//   zone.hazard          0..1, set by the active disaster each tick
//   zone.vulnerablePct   0..1, static (from zones/data.js)
//   zone.roadBlocked     bool, set by the active disaster each tick
//   zone.hospitalReachable  bool, computed here via BFS

export function scoreZones(zones) {
  updateHospitalAccess(zones);

  const w = CONFIG.weights;
  for (const z of zones) {
    const accessPenalty = z.hospitalReachable ? 0 : 1;
    z.score = w.hazard * z.hazard + w.vulnerability * z.vulnerablePct * (0.5 + 0.5 * z.hazard) + w.access * accessPenalty;
    z.score = Math.min(1, z.score);
    z.severity = severityFor(z.score);
  }
  return zones;
}

function severityFor(score) {
  const t = CONFIG.thresholds;
  if (score >= t.critical) return 'critical';
  if (score >= t.dangerous) return 'dangerous';
  if (score >= t.moderate) return 'moderate';
  return 'safe';
}
