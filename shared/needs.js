// ─────────────────────────────────────────────────────────────
//  needs.js — turns a person's free-text medical history into
//  structured flags the priority rules and call scripts can use.
//
//  Pure keyword rules: fast enough for a 100k-person dataset and
//  gives the same answer every time. Swap in AI tagging later if
//  you want, but keep this as the fallback.
// ─────────────────────────────────────────────────────────────

/** Each rule: id, regex over medical history, points, short label for the dashboard. */
export const NEED_RULES = [
  // Power-dependent life support — the most time-critical group
  { id: 'ventilator', re: /ventilator|tracheostomy|\btrach\b|bipap/i, points: 60, label: 'Ventilator dependent', chip: 'VENT', power: true },
  { id: 'oxygen', re: /oxygen|o2 concentrator|concentrator/i, points: 38, label: 'Home oxygen', chip: 'O₂', power: true },
  { id: 'dialysis', re: /dialysis/i, points: 34, label: 'Dialysis', chip: 'DIAL', power: true },
  { id: 'suction', re: /suction|feeding pump|feeding tube|peg tube/i, points: 20, label: 'Powered feeding / suction', chip: 'PUMP', power: true },
  { id: 'cpap', re: /\bcpap\b/i, points: 10, label: 'CPAP (sleep apnea)', chip: 'CPAP', power: true },

  // Medication that fails without power or supply
  { id: 'insulin', re: /insulin|type 1 diabetes/i, points: 14, label: 'Insulin dependent (needs refrigeration)', chip: 'INS' },

  // Mobility — can they leave on their own?
  { id: 'bedbound', re: /bed[- ]?bound|bedridden|quadripleg|tetrapleg|\bALS\b/i, points: 22, label: 'Bed-bound / cannot self-evacuate', chip: 'BED', mobility: 'bedbound' },
  { id: 'wheelchair', re: /wheelchair|parapleg|spinal cord|amputee|amputation/i, points: 15, label: 'Wheelchair user — can\'t use stairs', chip: '♿', mobility: 'wheelchair' },
  { id: 'mobility', re: /mobility impairment|limited mobility/i, points: 12, label: 'Mobility impairment', chip: 'MOB', mobility: 'walker' },
  { id: 'walker', re: /walker|\bcane\b|parkinson|multiple sclerosis|hip replacement|frail/i, points: 8, label: 'Limited mobility', chip: 'MOB', mobility: 'walker' },

  // Understanding warnings
  { id: 'dementia', re: /dementia|alzheimer/i, points: 16, label: 'Dementia — may not follow warnings', chip: 'DEM' },
  { id: 'cognitive', re: /intellectual disability|down syndrome|autis|developmental disability|traumatic brain/i, points: 10, label: 'Cognitive / developmental disability', chip: 'COG' },

  // Communication — changes HOW we reach them
  { id: 'deaf', re: /\bdeaf\b|profound hearing loss/i, points: 8, label: 'Deaf — text, do not call', chip: 'DEAF', comm: 'sms' },
  { id: 'hoh', re: /hard of hearing|hearing aid|hearing loss/i, points: 4, label: 'Hard of hearing — speak slowly', chip: 'HOH' },
  { id: 'speech', re: /non-?verbal|aphasia|speech impairment|\bmute\b|\bAAC\b/i, points: 8, label: 'Non-verbal — text or reach caregiver', chip: 'NV', comm: 'sms' },
  { id: 'blind', re: /\bblind\b|low vision|visual impairment|macular/i, points: 8, label: 'Blind / low vision', chip: 'VIS' },

  // Other risk
  { id: 'cardiac', re: /heart failure|heart disease|copd|emphysema|pacemaker/i, points: 10, label: 'Chronic heart / lung condition', chip: 'CARD' },
  { id: 'kidney', re: /kidney disease|renal failure/i, points: 10, label: 'Chronic kidney disease', chip: 'KID' },
  { id: 'diabetes', re: /diabet/i, points: 6, label: 'Diabetes', chip: 'DIAB' },
  { id: 'asthma', re: /asthma/i, points: 5, label: 'Asthma', chip: 'ASTH' },
  { id: 'cancer', re: /cancer/i, points: 3, label: 'Cancer history', chip: 'CA' },
  { id: 'pregnancy', re: /pregnan/i, points: 8, label: 'Pregnant', chip: 'PREG' },
  { id: 'mental', re: /schizophrenia|bipolar|ptsd|severe anxiety|panic disorder/i, points: 5, label: 'Mental health — may be distressed', chip: 'MH' },
];

const MOBILITY_RANK = { independent: 0, walker: 1, wheelchair: 2, bedbound: 3 };

/** Medical history may arrive as an array or a single string ("COPD; Home oxygen"). */
export function historyText(person) {
  const h = person.medicalHistory ?? person.medical_history ?? '';
  return Array.isArray(h) ? h.join('; ') : String(h);
}

/**
 * Derive structured needs from a person record.
 * Explicit fields (mobility, preferredContact) win over keyword guesses.
 */
export function deriveNeeds(person) {
  const text = historyText(person);
  const matched = NEED_RULES.filter((r) => r.re.test(text));

  // "Deaf" also matches "hearing loss" rule — keep only the stronger one.
  const ids = new Set(matched.map((r) => r.id));
  const flags = matched.filter((r) => !(r.id === 'hoh' && ids.has('deaf')));

  let mobility = person.mobility || 'independent';
  for (const f of flags) {
    if (f.mobility && MOBILITY_RANK[f.mobility] > MOBILITY_RANK[mobility]) mobility = f.mobility;
  }

  const preferredContact =
    person.preferredContact || (flags.some((f) => f.comm === 'sms') ? 'sms' : 'voice');

  return {
    flags: flags.map(({ id, points, label, chip, power }) => ({ id, points, label, chip, power: !!power })),
    powerDependent: flags.some((f) => f.power),
    mobility,
    preferredContact,
    livesAlone: person.livesAlone ?? null,
  };
}
