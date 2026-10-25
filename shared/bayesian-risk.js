// Transparent, scenario-based Bayesian evidence model for earthquake triage.
// IMPORTANT: Priors and likelihood ratios below are illustrative assumptions for
// a hackathon simulation, NOT empirically calibrated casualty probabilities.
// Replace them only with documented, locally validated evidence when available.

export const BAYESIAN_ASSUMPTIONS = Object.freeze({
  version: 'earthquake-demo-v1',
  horizonsMinutes: [15, 30, 60],
  // Assumed baseline probability of serious harm in an earthquake-affected area.
  // These are intentionally visible so reviewers can challenge/change them.
  baselinePrior: { 15: 0.02, 30: 0.04, 60: 0.08 },
  likelihoodRatios: {
    structural: { collapsed: 20, severe: 8, moderate: 3, minor: 1.5, mmi9: 6, mmi8: 4, mmi7: 2.5, mmi6: 1.5, unsafeReport: 3 },
    acute: { trapped: 25, injured: 8, needsHelp: 2.5, distress: 1.4 },
    environment: { gasOrFire: 3, roadsBlocked: 1.5, powerOutForDependent: 2 },
    vulnerability: { powerDependent: 2.5, bedbound: 2.2, wheelchair: 1.6, limitedMobility: 1.35, age85: 1.5, age75: 1.3, livesAlone: 1.4 },
    contact: { failedAttempt: 1.3, unreachable: 2.2, silenceOver60m: 1.2, silenceOver120m: 1.4, reportedOk: 0.4 },
    zoneStatus: { severe: 6, danger: 3, moderate: 1.6, safe: 1 },
    zoneCategory: { hospital: 1.8, special_care: 1.6, school: 1.35, college: 1.2, none: 1 },
  },
  thresholdsPercent: { CRITICAL: 35, HIGH: 15 },
  uncertaintyReviewThreshold: 0.45,
  // Scenario sensitivity multiplier, not a statistical confidence interval.
  uncertaintyUpperBoundMultiplier: 2,
});

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const odds = (p) => p / (1 - p);
const probability = (o) => o / (1 + o);

function strongest(label, likelihoodRatio, group, explanation) {
  return { label, likelihoodRatio, group, explanation };
}

function structuralEvidence(hazard = {}, findings = {}) {
  const lr = BAYESIAN_ASSUMPTIONS.likelihoodRatios.structural;
  const options = [];
  const damage = hazard.buildingDamage;
  if (damage && Object.hasOwn(lr, damage)) options.push(strongest(`Building ${damage}`, lr[damage], 'structural', 'Use the strongest structural signal once to reduce correlated-evidence double counting.'));
  else if (hazard.intensity != null && Number.isFinite(Number(hazard.intensity))) {
    const mmi = Number(hazard.intensity);
    if (mmi >= 9) options.push(strongest(`Extreme shaking (MMI ${mmi})`, lr.mmi9, 'structural', 'Intensity used because a building-damage estimate is unavailable.'));
    else if (mmi >= 8) options.push(strongest(`Severe shaking (MMI ${mmi})`, lr.mmi8, 'structural', 'Intensity used because a building-damage estimate is unavailable.'));
    else if (mmi >= 7) options.push(strongest(`Strong shaking (MMI ${mmi})`, lr.mmi7, 'structural', 'Intensity used because a building-damage estimate is unavailable.'));
    else if (mmi >= 6) options.push(strongest(`Noticeable shaking (MMI ${mmi})`, lr.mmi6, 'structural', 'Intensity used because a building-damage estimate is unavailable.'));
  }
  if (findings.buildingUnsafe) options.push(strongest('Resident reports building unsafe', lr.unsafeReport, 'structural', 'Resident report is used only as the structural signal when it is stronger than available damage evidence.'));
  return options.sort((a, b) => b.likelihoodRatio - a.likelihoodRatio)[0] || null;
}

function acuteEvidence(findings = {}) {
  const lr = BAYESIAN_ASSUMPTIONS.likelihoodRatios.acute;
  const options = [];
  if (findings.trapped) options.push(strongest('Reported trapped', lr.trapped, 'acute', 'Direct life-threatening report; triggers immediate-response override.'));
  if (findings.injured) options.push(strongest('Reported injury', lr.injured, 'acute', 'Injury is a high-risk signal.'));
  if (findings.needsHelp) options.push(strongest('Asked for help', lr.needsHelp, 'acute', 'Explicit request for assistance.'));
  if (findings.distress) options.push(strongest('Distress reported', lr.distress, 'acute', 'Concern signal; weaker than direct injury/trapping evidence.'));
  return options.sort((a, b) => b.likelihoodRatio - a.likelihoodRatio)[0] || null;
}

function environmentEvidence(hazard = {}, needs = {}) {
  const lr = BAYESIAN_ASSUMPTIONS.likelihoodRatios.environment;
  const options = [];
  if (hazard.gasLeak || hazard.fire) options.push(strongest(hazard.fire && hazard.gasLeak ? 'Fire and gas hazard' : hazard.fire ? 'Fire nearby' : 'Gas leak nearby', lr.gasOrFire, 'environment', 'Fire/gas signals share one capped evidence group.'));
  if (hazard.roadsBlocked) options.push(strongest('Roads blocked', lr.roadsBlocked, 'environment', 'May delay access; not treated as proof of injury.'));
  if (hazard.powerOut && needs.powerDependent) options.push(strongest('Power outage + powered medical equipment', lr.powerOutForDependent, 'environment', 'Power outage is risk-relevant when powered medical equipment is needed.'));
  if (!options.length) return [];
  // Keep distinct signals, but cap their combined LR to avoid runaway multiplication.
  const product = options.reduce((p, x) => p * x.likelihoodRatio, 1);
  const cap = 5;
  const scale = product > cap ? Math.pow(cap / product, 1 / options.length) : 1;
  return options.map((x) => ({ ...x, likelihoodRatio: Math.max(1, x.likelihoodRatio * scale), explanation: `${x.explanation} Combined environmental evidence is capped at LR ${cap}.` }));
}

function vulnerabilityEvidence(person = {}, needs = {}) {
  const lr = BAYESIAN_ASSUMPTIONS.likelihoodRatios.vulnerability;
  const options = [];
  if (needs.powerDependent) options.push(strongest('Powered medical dependency', lr.powerDependent, 'vulnerability', 'Vulnerability signal; not itself evidence that injury has occurred.'));
  const mobility = needs.mobility || person.mobility || 'independent';
  if (mobility === 'bedbound') options.push(strongest('Bed-bound / cannot self-evacuate', lr.bedbound, 'vulnerability', 'Mobility group uses only its strongest signal.'));
  else if (mobility === 'wheelchair') options.push(strongest('Wheelchair user', lr.wheelchair, 'vulnerability', 'Mobility group uses only its strongest signal.'));
  else if (mobility === 'walker') options.push(strongest('Limited mobility', lr.limitedMobility, 'vulnerability', 'Mobility group uses only its strongest signal.'));
  const age = Number(person.age) || 0;
  if (age >= 85) options.push(strongest('Age 85+', lr.age85, 'vulnerability', 'Age is a vulnerability modifier, not a standalone emergency.'));
  else if (age >= 75) options.push(strongest('Age 75–84', lr.age75, 'vulnerability', 'Age is a vulnerability modifier, not a standalone emergency.'));
  if (person.livesAlone === true || needs.livesAlone === true) options.push(strongest('Lives alone', lr.livesAlone, 'vulnerability', 'May reduce immediate access to assistance.'));
  const flags = Array.isArray(needs.flags) ? needs.flags : [];
  if (flags.some((f) => f.id === 'dementia' || f.id === 'cognitive')) options.push(strongest('Cognitive support need', lr.cognitive, 'vulnerability', 'May make warnings, wayfinding or independent evacuation harder.'));
  if (flags.some((f) => ['deaf', 'speech', 'blind', 'hoh'].includes(f.id))) options.push(strongest('Communication / sensory access need', lr.communicationBarrier, 'vulnerability', 'May require an accessible contact or warning channel.'));
  if (flags.some((f) => ['cardiac', 'kidney', 'diabetes', 'asthma', 'cancer', 'pregnancy'].includes(f.id))) options.push(strongest('Additional health vulnerability', flags.some((f) => f.id === 'pregnancy') ? lr.pregnancy : lr.chronicCondition, 'vulnerability', 'Broad scenario modifier; not a clinical risk estimate.'));
  // Mobility signals are mutually exclusive; combine other vulnerability modifiers with a cap.
  const mobilitySignal = options.find((x) => x.label === 'Bed-bound / cannot self-evacuate' || x.label === 'Wheelchair user' || x.label === 'Limited mobility');
  const others = options.filter((x) => x !== mobilitySignal);
  const otherProduct = others.reduce((p, x) => p * x.likelihoodRatio, 1);
  const maxOther = 3;
  const otherScale = otherProduct > maxOther ? Math.pow(maxOther / otherProduct, 1 / Math.max(others.length, 1)) : 1;
  const normalizedOthers = others.map((x) => ({ ...x, likelihoodRatio: Math.max(1, x.likelihoodRatio * otherScale), explanation: `${x.explanation} Combined vulnerability modifiers are capped at LR ${maxOther}.` }));
  return [...(mobilitySignal ? [mobilitySignal] : []), ...normalizedOthers];
}

function contactEvidence(c = {}, now = Date.now()) {
  const lr = BAYESIAN_ASSUMPTIONS.likelihoodRatios.contact;
  const evidence = [];
  const failed = Math.max(0, Number(c.failedAttempts) || 0);
  if (failed > 0) evidence.push(strongest(`${failed} unanswered attempt${failed === 1 ? '' : 's'}`, Math.min(lr.failedAttempt ** failed, 2), 'contact', 'Repeated non-response raises concern but does not prove the person is trapped.'));
  if (c.status === 'unreachable') evidence.push(strongest('Unreachable after retries', lr.unreachable, 'contact', 'Escalates concern while keeping non-response distinct from confirmed harm.'));
  const lastContact = c.lastContactAt ? new Date(c.lastContactAt).getTime() : NaN;
  if (Number.isFinite(lastContact) && c.status !== 'safe') {
    const mins = Math.max(0, (now - lastContact) / 60000);
    if (mins > 120) evidence.push(strongest('No contact for 2h+', lr.silenceOver120m, 'contact', 'Silence is weak evidence and should be interpreted with hazard context.'));
    else if (mins > 60) evidence.push(strongest('No contact for 1h+', lr.silenceOver60m, 'contact', 'Silence is weak evidence and should be interpreted with hazard context.'));
  }
  const f = c.findings || {};
  const h = c.hazard || {};
  const severeDanger = ['collapsed', 'severe'].includes(h.buildingDamage) || h.fire || h.gasLeak || f.trapped || f.injured || f.needsHelp;
  if (f.reportedOk && !severeDanger && !f.needsHelp && !f.trapped) evidence.push(strongest('Recent contact: reports OK', lr.reportedOk, 'contact', 'Reassuring evidence only reduces the contact component; it never cancels hazard or vulnerability evidence.'));
  // Use one strongest contact signal rather than multiplying correlated missed-call signals.
  return evidence.sort((a, b) => b.likelihoodRatio - a.likelihoodRatio).slice(0, 1);
}

function zoneEvidence(hazard = {}) {
  const evidence = [];
  const status = String(hazard.zoneStatus || '').toLowerCase();
  const statusLR = BAYESIAN_ASSUMPTIONS.likelihoodRatios.zoneStatus[status];
  if (statusLR != null && statusLR > 1) {
    const label = status === 'severe' ? 'Zone status: severe' : status === 'danger' ? 'Zone status: danger' : 'Zone status: moderate';
    evidence.push(strongest(label, statusLR, 'zone-status', `Earthquake simulation severity for zone ${hazard.zoneId ?? 'unknown'}; higher severity raises the scenario risk estimate.`));
  }
  const category = String(hazard.zoneCategory || '').toLowerCase();
  const categoryLR = BAYESIAN_ASSUMPTIONS.likelihoodRatios.zoneCategory[category];
  if (category && category !== 'none' && categoryLR != null) {
    const labels = { hospital: 'Zone contains a hospital', special_care: 'Zone contains a special-care facility', school: 'Zone contains a school', college: 'Zone contains a college' };
    evidence.push(strongest(labels[category] || `Zone facility: ${category}`, categoryLR, 'zone-category', `Facility in zone ${hazard.zoneId ?? 'unknown'} receives a configurable protection/response-priority modifier. This is a zone-level proxy, not proof the resident is affiliated with the facility.`));
  }
  return evidence;
}

function uncertaintyAssessment(person = {}, c = {}, needs = {}, now = Date.now()) {
  let uncertainty = 0.05; // small floor: every scenario is still an approximation
  const reasons = [];
  const h = c.hazard || {};
  if (!h.buildingDamage && !h.zoneStatus && (h.intensity == null || !Number.isFinite(Number(h.intensity)))) {
    uncertainty += 0.25;
    reasons.push('No building-damage estimate or shaking intensity');
  }
  if (!h.source || h.source === 'none') {
    uncertainty += 0.2;
    reasons.push('No earthquake hazard source');
  }
  const observedAt = h.observedAt || h.updatedAt || h.timestamp;
  if (!observedAt) {
    uncertainty += 0.12;
    reasons.push('Hazard observation time unavailable');
  } else {
    const ageMinutes = Math.max(0, (now - new Date(observedAt).getTime()) / 60000);
    if (!Number.isFinite(ageMinutes)) {
      uncertainty += 0.12;
      reasons.push('Hazard observation timestamp invalid');
    } else if (ageMinutes > 60) {
      uncertainty += 0.25;
      reasons.push('Hazard observation older than 60 minutes');
    } else if (ageMinutes > 30) {
      uncertainty += 0.15;
      reasons.push('Hazard observation older than 30 minutes');
    }
  }
  const hasCallEvidence = c.lastContactAt || Object.keys(c.findings || {}).length > 0;
  if (!hasCallEvidence && c.status !== 'safe') {
    uncertainty += 0.18;
    reasons.push('Resident status not yet verified');
  }
  if (needs.powerDependent && !h.powerOut && !h.source) {
    uncertainty += 0.08;
    reasons.push('Power status unknown for a power-dependent resident');
  }
  if (!person.address && !person.location && !person.coordinates) {
    uncertainty += 0.05;
    reasons.push('Location precision unavailable');
  }
  uncertainty = clamp(uncertainty, 0, 0.95);
  const level = uncertainty >= 0.6 ? 'HIGH' : uncertainty >= 0.3 ? 'MODERATE' : 'LOW';
  return { score: uncertainty, level, reasons };
}

/**
 * Estimate scenario-based P(serious harm by horizon | observed evidence).
 * This is a transparent, illustrative likelihood-ratio model, not a validated
 * real-world casualty predictor. Correlated signals are grouped/capped.
 */
export function assessBayesianRisk(person = {}, c = {}, now = Date.now()) {
  const needs = c.needs || {};
  const hazard = c.hazard || {};
  const findings = c.findings || {};
  const evidence = [];
  const structural = structuralEvidence(hazard, findings);
  const acute = acuteEvidence(findings);
  const environmental = environmentEvidence(hazard, needs);
  const vulnerability = vulnerabilityEvidence(person, needs);
  const contact = contactEvidence(c, now);
  const zone = zoneEvidence(hazard);
  if (structural) evidence.push(structural);
  if (acute) evidence.push(acute);
  evidence.push(...environmental, ...vulnerability, ...contact, ...zone);

  const groupedLR = {};
  for (const item of evidence) {
    // Structural and acute groups deliberately contribute only their strongest item.
    if (['structural', 'acute', 'contact', 'zone-status', 'zone-category'].includes(item.group)) {
      groupedLR[item.group] = groupedLR[item.group] == null ? item.likelihoodRatio : Math.max(groupedLR[item.group], item.likelihoodRatio);
    } else groupedLR[item.group] = (groupedLR[item.group] || 1) * item.likelihoodRatio;
  }
  // Cap combined evidence within broad groups to keep demo assumptions bounded.
  groupedLR.environment = Math.min(groupedLR.environment || 1, 5);
  groupedLR.vulnerability = Math.min(groupedLR.vulnerability || 1, 4);
  groupedLR['zone-status'] = Math.min(groupedLR['zone-status'] || 1, 6);
  groupedLR['zone-category'] = Math.min(groupedLR['zone-category'] || 1, 1.8);
  const totalLR = Object.values(groupedLR).reduce((product, value) => product * value, 1);
  const riskByHorizon = {};
  for (const minutes of BAYESIAN_ASSUMPTIONS.horizonsMinutes) {
    const prior = BAYESIAN_ASSUMPTIONS.baselinePrior[minutes];
    riskByHorizon[minutes] = probability(odds(prior) * totalLR);
  }

  const uncertainty = uncertaintyAssessment(person, c, needs, now);
  const base30 = riskByHorizon[30];
  const upperLR = 1 + uncertainty.score * BAYESIAN_ASSUMPTIONS.uncertaintyUpperBoundMultiplier;
  const scenarioUpperBound30 = probability(odds(base30) * upperLR);
  const immediateOverride = findings.trapped
    ? 'Resident reports being trapped'
    : hazard.buildingDamage === 'collapsed'
      ? 'Building collapse reported'
      : findings.injured && (hazard.fire || hazard.gasLeak || hazard.buildingDamage === 'severe')
        ? 'Injury combined with a severe environmental/structural hazard'
        : null;
  const reviewRequired = c.status !== 'safe' && !immediateOverride && uncertainty.score >= BAYESIAN_ASSUMPTIONS.uncertaintyReviewThreshold && (base30 >= 0.03 || vulnerability.length > 0 || c.status === 'unreachable');

  return {
    model: BAYESIAN_ASSUMPTIONS.version,
    riskByHorizon,
    riskScore: base30 * 100,
    uncertainty: { ...uncertainty, scenarioUpperBound30 },
    evidence,
    likelihoodRatio: totalLR,
    immediateOverride,
    reviewRequired,
    assumptionsNotice: 'Scenario-based assumptions; not clinically validated or calibrated for real-world casualty prediction.',
  };
}
