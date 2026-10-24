// ─────────────────────────────────────────────────────────────
//  priority.js — the rules that order the dispatcher's queue.
//
//  Deliberately NOT AI: the same inputs always give the same score,
//  and every point is explained, so a dispatcher (or a judge) can
//  see exactly why someone is at the top. AI writes the one-line
//  summary on the card; it never sets the rank.
//
//  Tune the numbers in WEIGHTS / THRESHOLDS — nothing else needs
//  to change.
// ─────────────────────────────────────────────────────────────
import { deriveNeeds } from './needs.js';

export const THRESHOLDS = { CRITICAL: 60, HIGH: 35 };

export const WEIGHTS = {
  age85: 12,
  age75: 8,
  age65: 4,
  livesAlone: 10,
  // Danger at home — fed by the 3D simulation once integrated
  homeFlooded: 35,
  floodWithin30: 30,
  floodWithin60: 20,
  floodWithin120: 10,
  roadsCutOff: 10,
  // Contact status
  perFailedAttempt: 8,
  unreachable: 12,
  // What the welfare call found
  needsHelp: 25,
  injured: 20,
  distress: 10,
  equipmentUnder2h: 30,
  equipmentUnder6h: 20,
  equipmentUnder12h: 10,
  wantsEvacuation: 8,
  reportedOk: -25,
  // Silence since last contact
  silentOver60m: 5,
  silentOver120m: 10,
};

// Within these groups only the strongest match counts (no double counting
// "wheelchair" + "walker", or "ventilator" + "oxygen").
const GROUPS = {
  power: ['ventilator', 'oxygen', 'dialysis', 'suction', 'cpap'],
  mobility: ['bedbound', 'wheelchair', 'mobility', 'walker'],
  diabetes: ['insulin', 'diabetes'],
};

function medicalFactors(needs) {
  const factors = [];
  const used = new Set();
  for (const ids of Object.values(GROUPS)) {
    const inGroup = needs.flags.filter((f) => ids.includes(f.id));
    if (inGroup.length) {
      const top = inGroup.reduce((a, b) => (b.points > a.points ? b : a));
      factors.push({ label: top.label, points: top.points, kind: 'medical' });
      inGroup.forEach((f) => used.add(f.id));
    }
  }
  for (const f of needs.flags) {
    if (!used.has(f.id)) factors.push({ label: f.label, points: f.points, kind: 'medical' });
  }
  return factors;
}

/**
 * @param person  record from the population dataset
 * @param c       the live case for that person (status, attempts, findings, hazard…)
 * @param now     Date.now(), injectable for tests
 * @returns {{score:number, level:string, factors:Array, reason:string}}
 */
export function scoreCase(person, c = {}, now = Date.now()) {
  const needs = c.needs || deriveNeeds(person);
  const W = WEIGHTS;
  const factors = [...medicalFactors(needs)];
  const add = (label, points, kind) => factors.push({ label, points, kind });

  // Age
  const age = Number(person.age) || 0;
  if (age >= 85) add(`Age ${age}`, W.age85, 'person');
  else if (age >= 75) add(`Age ${age}`, W.age75, 'person');
  else if (age >= 65) add(`Age ${age}`, W.age65, 'person');

  if (person.livesAlone) add('Lives alone', W.livesAlone, 'person');

  // Danger at home (placeholder until the simulation feeds real values)
  const h = c.hazard || {};
  if (h.homeFlooded) add('Home flooding now', W.homeFlooded, 'hazard');
  else if (h.minutesUntilFlood != null) {
    const m = h.minutesUntilFlood;
    if (m <= 30) add(`Home floods in ~${m} min`, W.floodWithin30, 'hazard');
    else if (m <= 60) add(`Home floods in ~${m} min`, W.floodWithin60, 'hazard');
    else if (m <= 120) add(`Home floods in ~${m} min`, W.floodWithin120, 'hazard');
  }
  if (h.roadsCutOff) add('Roads to home cut off', W.roadsCutOff, 'hazard');

  // Contact attempts
  const failed = c.failedAttempts || 0;
  if (failed > 0) add(`${failed} unanswered attempt${failed > 1 ? 's' : ''}`, failed * W.perFailedAttempt, 'contact');
  if (c.status === 'unreachable') add('Unreachable — all attempts failed', W.unreachable, 'contact');

  // What the call found
  const f = c.findings || {};
  if (f.needsHelp) add('Asked for help on call', W.needsHelp, 'call');
  if (f.injured) add('Injured', W.injured, 'call');
  if (f.distress) add('Distressed on call', W.distress, 'call');
  if (f.equipmentHoursLeft != null) {
    const hrs = f.equipmentHoursLeft;
    if (hrs <= 2) add(`Equipment power ~${hrs}h left`, W.equipmentUnder2h, 'call');
    else if (hrs <= 6) add(`Equipment power ~${hrs}h left`, W.equipmentUnder6h, 'call');
    else if (hrs <= 12) add(`Equipment power ~${hrs}h left`, W.equipmentUnder12h, 'call');
  }
  if (f.wantsEvacuation) add('Wants evacuation', W.wantsEvacuation, 'call');
  if (f.reportedOk && !f.needsHelp) add('Reached — reports OK', W.reportedOk, 'call');

  // Silence
  if (c.lastContactAt && c.status !== 'safe') {
    const mins = (now - new Date(c.lastContactAt).getTime()) / 60000;
    if (mins > 120) add('No contact for 2h+', W.silentOver120m, 'contact');
    else if (mins > 60) add('No contact for 1h+', W.silentOver60m, 'contact');
  }

  const score = Math.max(0, factors.reduce((s, x) => s + x.points, 0));
  let level = score >= THRESHOLDS.CRITICAL ? 'CRITICAL' : score >= THRESHOLDS.HIGH ? 'HIGH' : 'STANDARD';
  if (c.status === 'safe') level = 'RESOLVED';

  const top = factors
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((x) => x.label);

  return {
    score,
    level,
    factors: factors.sort((a, b) => b.points - a.points),
    reason: top.join(' · ') || 'No risk factors recorded',
  };
}

/** Sort order for the queue: open cases by score, resolved at the bottom. */
export function compareCases(a, b) {
  const ra = a.priority.level === 'RESOLVED' ? 1 : 0;
  const rb = b.priority.level === 'RESOLVED' ? 1 : 0;
  if (ra !== rb) return ra - rb;
  return b.priority.score - a.priority.score;
}
