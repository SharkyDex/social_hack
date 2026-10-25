import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreCase, compareCases } from '../shared/priority.js';
import { deriveNeeds } from '../shared/needs.js';
import { buildZoneReport } from '../simulation/src/zones/export.js';

const people = JSON.parse(readFileSync(new URL('../shared/data/people.sample.json', import.meta.url), 'utf8'));
const scenarios = JSON.parse(readFileSync(new URL('../shared/data/scenarios.sample.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-10-24T20:00:00Z');
const person = (overrides = {}) => ({ id: 'TEST', name: 'Test Person', age: 42, livesAlone: false, medicalHistory: '', address: '1 Test St', ...overrides });
const caseOf = (overrides = {}) => ({ status: 'not_contacted', failedAttempts: 0, needs: deriveNeeds(person()), hazard: { source: 'simulation', buildingDamage: 'minor', intensity: 6, observedAt: new Date(now).toISOString() }, findings: {}, ...overrides });

test('risk is monotonic across the configured time horizons', () => {
  const p = person();
  const result = scoreCase(p, caseOf({ hazard: { source: 'simulation', buildingDamage: 'moderate', intensity: 7, observedAt: new Date(now).toISOString() } }), now);
  assert.ok(result.riskByHorizon[15] <= result.riskByHorizon[30]);
  assert.ok(result.riskByHorizon[30] <= result.riskByHorizon[60]);
});

test('reported trapped triggers a deterministic CRITICAL override', () => {
  const result = scoreCase(person(), caseOf({ findings: { trapped: true } }), now);
  assert.equal(result.level, 'CRITICAL');
  assert.match(result.immediateOverride, /trapped/i);
});

test('reported building collapse triggers a deterministic CRITICAL override', () => {
  const result = scoreCase(person(), caseOf({ hazard: { source: 'simulation', buildingDamage: 'collapsed', observedAt: new Date(now).toISOString() } }), now);
  assert.equal(result.level, 'CRITICAL');
  assert.match(result.immediateOverride, /collapse/i);
});

test('new severe structural evidence increases risk versus a minor-damage baseline', () => {
  const p = person();
  const minor = scoreCase(p, caseOf({ hazard: { source: 'simulation', buildingDamage: 'minor', observedAt: new Date(now).toISOString() } }), now);
  const severe = scoreCase(p, caseOf({ hazard: { source: 'simulation', buildingDamage: 'severe', observedAt: new Date(now).toISOString() } }), now);
  assert.ok(severe.riskByHorizon[30] > minor.riskByHorizon[30]);
});

test('missed contacts increase risk but do not prove entrapment', () => {
  const p = person();
  const baseline = scoreCase(p, caseOf(), now);
  const missed = scoreCase(p, caseOf({ failedAttempts: 2 }), now);
  assert.ok(missed.riskByHorizon[30] > baseline.riskByHorizon[30]);
  assert.equal(missed.immediateOverride, null);
});

test('reported OK does not cancel severe hazard evidence', () => {
  const p = person();
  const severe = scoreCase(p, caseOf({ hazard: { source: 'simulation', buildingDamage: 'severe', observedAt: new Date(now).toISOString() } }), now);
  const reassuring = scoreCase(p, caseOf({ hazard: { source: 'simulation', buildingDamage: 'severe', observedAt: new Date(now).toISOString() }, findings: { reportedOk: true } }), now);
  assert.equal(reassuring.riskByHorizon[30], severe.riskByHorizon[30]);
});

test('missing/stale evidence is surfaced as uncertainty and can request human review', () => {
  const p = person({ medicalHistory: 'wheelchair user' });
  const result = scoreCase(p, caseOf({ status: 'not_contacted', needs: deriveNeeds(p), hazard: { source: 'none' }, findings: {} }), now);
  assert.ok(result.uncertainty.score >= 0.45);
  assert.equal(result.reviewRequired, true);
  assert.ok(result.uncertainty.reasons.length > 0);
});

test('safe cases are resolved and do not remain in review queue', () => {
  const p = person();
  const result = scoreCase(p, caseOf({ status: 'safe', findings: { reportedOk: true } }), now);
  assert.equal(result.level, 'RESOLVED');
  assert.equal(result.reviewRequired, false);
});

test('sample earthquake scenarios produce finite, monotonic estimates', () => {
  for (const p of people) {
    const scenario = scenarios[p.id];
    const c = caseOf({ needs: deriveNeeds(p), ...(scenario?.hazard ? { hazard: { ...scenario.hazard, source: 'sample', observedAt: new Date(now).toISOString() } } : {}) });
    const result = scoreCase(p, c, now);
    assert.ok(Number.isFinite(result.score), `${p.id} score should be finite`);
    assert.ok(result.riskByHorizon[15] <= result.riskByHorizon[30], `${p.id}: 15m <= 30m`);
    assert.ok(result.riskByHorizon[30] <= result.riskByHorizon[60], `${p.id}: 30m <= 60m`);
  }
});

test('queue ordering prioritizes level, then uncertainty review, then risk', () => {
  const standardRisky = { priority: { level: 'STANDARD', score: 12, reviewRequired: false } };
  const standardReview = { priority: { level: 'STANDARD', score: 8, reviewRequired: true } };
  const high = { priority: { level: 'HIGH', score: 15, reviewRequired: false } };
  assert.ok(compareCases(high, standardReview) < 0);
  assert.ok(compareCases(standardReview, standardRisky) < 0);
});

test('curated scenario validation: trapped resident outranks vulnerable but untrapped resident, both outrank a low-evidence case', () => {
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const makeScenarioCase = (id, findings = {}) => {
    const p = byId[id];
    const scenario = scenarios[id];
    return scoreCase(p, {
      status: 'needs_help',
      failedAttempts: 0,
      needs: deriveNeeds(p),
      hazard: { ...(scenario?.hazard || {}), source: 'sample', observedAt: new Date(now).toISOString() },
      findings,
    }, now);
  };
  const trapped = makeScenarioCase('P010', { trapped: true, injured: true, needsHelp: true });
  const vulnerable = makeScenarioCase('P001', { needsHelp: true, equipmentHoursLeft: 4, distress: true });
  const lowEvidence = makeScenarioCase('P020', { reportedOk: true });
  assert.equal(trapped.level, 'CRITICAL');
  assert.ok(trapped.score > vulnerable.score);
  assert.ok(vulnerable.score > lowEvidence.score);
});


test('earthquake zone severity increases Bayesian risk in ascending order', () => {
  const p = person({ zone: 42 });
  const make = (zoneStatus) => scoreCase(p, caseOf({
    hazard: { source: 'minneapolis-earthquake-simulation', zoneId: 42, zoneStatus, zoneCategory: 'none', observedAt: new Date(now).toISOString() },
  }), now);
  const safe = make('safe');
  const moderate = make('moderate');
  const danger = make('danger');
  const severe = make('severe');
  assert.ok(safe.riskByHorizon[30] < moderate.riskByHorizon[30]);
  assert.ok(moderate.riskByHorizon[30] < danger.riskByHorizon[30]);
  assert.ok(danger.riskByHorizon[30] < severe.riskByHorizon[30]);
});

test('facility categories raise operational priority and hospitals rank above schools', () => {
  const p = person({ zone: 12 });
  const make = (zoneCategory) => scoreCase(p, caseOf({
    hazard: { source: 'minneapolis-earthquake-simulation', zoneId: 12, zoneStatus: 'safe', zoneCategory, buildingDamage: 'none', intensity: 4, observedAt: new Date(now).toISOString() },
  }), now);
  const none = make('none');
  const college = make('college');
  const school = make('school');
  const specialCare = make('special_care');
  const hospital = make('hospital');
  assert.equal(none.level, 'STANDARD');
  for (const result of [college, school, specialCare, hospital]) assert.equal(result.level, 'HIGH');
  assert.ok(hospital.score >= none.score);
  assert.ok(hospital.facilityPriority > specialCare.facilityPriority);
  assert.ok(specialCare.facilityPriority > school.facilityPriority);
  assert.ok(school.facilityPriority > college.facilityPriority);
});


test('simulation exports the canonical zone/status/category contract with legacy aliases', () => {
  const report = buildZoneReport([
    { id: 1, facility: 'hospital', severity: 'critical' },
    { id: 2, facility: null, severity: 'dangerous' },
    { id: 3, facility: 'school', severity: 'moderate' },
    { id: 0, facility: 'college', severity: 'safe' },
  ], 'earthquake');
  assert.deepEqual(report.zones.map(({ zone, status, category }) => ({ zone, status, category })), [
    { zone: 0, status: 'safe', category: 'college' },
    { zone: 1, status: 'severe', category: 'hospital' },
    { zone: 2, status: 'danger', category: 'none' },
    { zone: 3, status: 'moderate', category: 'school' },
  ]);
  assert.equal(report.zones[1].severity, 'critical');
  assert.equal(report.zones[1].facility, 'hospital');
});
