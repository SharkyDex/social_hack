// Earthquake-aware triage priority.
// The Bayesian evidence model uses transparent scenario assumptions; it is not
// an empirically calibrated casualty predictor. Hard safety overrides remain deterministic.
import { deriveNeeds } from './needs.js';
import { assessBayesianRisk, BAYESIAN_ASSUMPTIONS } from './bayesian-risk.js';

export const THRESHOLDS = BAYESIAN_ASSUMPTIONS.thresholdsPercent;

/**
 * @param person record from the population dataset
 * @param c live case (status, attempts, findings, earthquake hazard…)
 * @param now injectable timestamp for deterministic tests
 */
export function scoreCase(person, c = {}, now = Date.now()) {
  const needs = c.needs || deriveNeeds(person);
  const caseWithNeeds = { ...c, needs };
  const risk = assessBayesianRisk(person, caseWithNeeds, now);
  const score = Math.round(risk.riskScore * 10) / 10; // percentage, P(serious harm within 30 min)
  let level = score >= THRESHOLDS.CRITICAL ? 'CRITICAL' : score >= THRESHOLDS.HIGH ? 'HIGH' : 'STANDARD';
  const category = String(c.hazard?.zoneCategory || '').toLowerCase();
  const facilityPriorityOrder = { hospital: 4, special_care: 3, school: 2, college: 1, none: 0 };
  const facilityPriority = facilityPriorityOrder[category] ?? 0;
  // Facility zones are operationally escalated at least to HIGH, while the
  // displayed risk score remains the Bayesian scenario estimate. This is an
  // explicit demo policy, not a claim that facility presence proves harm.
  if (facilityPriority > 0 && level === 'STANDARD') level = 'HIGH';
  if (risk.immediateOverride) level = 'CRITICAL';
  if (c.status === 'safe') level = 'RESOLVED';

  const topEvidence = [...risk.evidence].sort((a, b) => b.likelihoodRatio - a.likelihoodRatio).slice(0, 2).map((x) => x.label);
  const facilityLabel = ({ hospital: 'Hospital zone', special_care: 'Special-care facility zone', school: 'School zone', college: 'College zone' })[category];
  const reason = risk.immediateOverride || (facilityLabel ? `${facilityLabel}${topEvidence.length ? ` · ${topEvidence.join(' · ')}` : ''}` : (topEvidence.join(' · ') || 'No significant risk evidence recorded'));
  const factors = risk.evidence.map((item) => ({
    label: item.label,
    likelihoodRatio: Math.round(item.likelihoodRatio * 100) / 100,
    kind: item.group,
    explanation: item.explanation,
  }));

  return {
    score,
    level,
    facilityPriority,
    facilityCategory: category || 'none',
    factors,
    reason,
    riskByHorizon: risk.riskByHorizon,
    uncertainty: risk.uncertainty,
    reviewRequired: risk.reviewRequired,
    immediateOverride: risk.immediateOverride,
    model: risk.model,
    likelihoodRatio: Math.round(risk.likelihoodRatio * 100) / 100,
    assumptionsNotice: risk.assumptionsNotice,
  };
}

/** Open cases needing review rank ahead of other cases at the same level, then by risk. */
export function compareCases(a, b) {
  const ra = a.priority.level === 'RESOLVED' ? 1 : 0;
  const rb = b.priority.level === 'RESOLVED' ? 1 : 0;
  if (ra !== rb) return ra - rb;
  const levelOrder = { CRITICAL: 0, HIGH: 1, STANDARD: 2, RESOLVED: 3 };
  const levelDiff = (levelOrder[a.priority.level] ?? 2) - (levelOrder[b.priority.level] ?? 2);
  if (levelDiff) return levelDiff;
  if (!!a.priority.immediateOverride !== !!b.priority.immediateOverride) return a.priority.immediateOverride ? -1 : 1;
  if (!!a.priority.reviewRequired !== !!b.priority.reviewRequired) return a.priority.reviewRequired ? -1 : 1;
  const facilityDiff = (b.priority.facilityPriority || 0) - (a.priority.facilityPriority || 0);
  if (facilityDiff) return facilityDiff;
  return b.priority.score - a.priority.score;
}
