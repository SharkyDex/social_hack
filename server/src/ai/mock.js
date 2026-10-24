// ─────────────────────────────────────────────────────────────
//  mock.js — scripted stand-ins for the AI when there is no key.
//  Keeps the whole app demoable offline (bad hackathon Wi-Fi!).
// ─────────────────────────────────────────────────────────────
import { config } from '../config.js';

const first = (n = '') => n.split(' ')[0];

export function mockConversation(person, needs, scenario, { target = 'resident', channel = 'voice' } = {}) {
  const t = scenario?.truth || {};
  const D = (text) => ({ speaker: 'dispatcher', text });
  const name = first(person.name);

  if (target === 'emergency_contact') {
    const R = (text) => ({ speaker: 'contact', text });
    return [
      D(`Hello, this is an automated assistant from ${config.agencyName}. Am I speaking with ${person.emergencyContactName?.replace(/ \(.*\)/, '')}?`),
      R('Yes, that\'s me. Is everything OK?'),
      D(`We're doing welfare checks during ${config.disasterName} and haven't been able to reach ${name}. When did you last hear from them?`),
      R(scenario?.contactKnows || `Not since this morning. I'm worried.`),
      D(`Thank you. Is there anything responders should know before visiting?`),
      R(needs.flags.length ? `Please remember: ${needs.flags.map((f) => f.label.split(' —')[0].toLowerCase()).join(', ')}.` : 'Not that I can think of.'),
      D('Thank you. A human dispatcher has this information and will follow up. [END]'),
    ];
  }

  const R = (text) => ({ speaker: 'resident', text });
  const sit = scenario?.says || scenario?.situation || 'I\'m alright. Things fell off the shelves but the house looks OK.';

  if (channel === 'sms') {
    return [
      D(`${config.agencyName} (automated welfare check): Hi ${name}, are you safe? Reply SAFE or HELP, or tell us what's happening. If in immediate danger, contact 911.`),
      R(t.reportedOk ? `SAFE. ${sit}` : `HELP. ${sit}`),
      D(t.reportedOk ? 'Thanks for letting us know. Do you need anything at all?' : 'Thank you. Are you injured or trapped, and do you need to leave the building?'),
      R(t.reportedOk ? 'No, all good.' : `${t.trapped ? 'I can\'t get out.' : t.injured ? 'I\'m hurt.' : 'Not injured.'} ${t.wantsEvacuation ? 'Yes, I need to get out.' : 'I can stay but need help.'}`),
      D('Got it. A human dispatcher has your details and will follow up. [END]'),
    ];
  }

  const lines = [
    D(`Hello, this is an automated assistant from ${config.agencyName}, calling to check on ${person.name}. Is this ${name}?`),
    R('Yes, speaking.'),
    D('Are you safe right now? Is your building damaged, and are you able to move around?'),
    R(sit),
  ];
  lines.push(D('Do you smell gas, or see any smoke or fire?'));
  lines.push(R(t.gasOrFire ? 'Yes, I think so.' : 'No, I don\'t think so.'));
  if (t.gasOrFire) {
    lines.push(D('If you can do it safely, please leave the building now. Don\'t use light switches or flames. I\'m flagging this for a gas and fire crew.'));
    lines.push(R('OK. OK, I\'ll try.'));
  }
  if (needs.powerDependent) {
    lines.push(D('How many hours of battery or supply do you have left for your medical equipment?'));
    lines.push(R(t.equipmentHoursLeft != null ? `About ${t.equipmentHoursLeft} hours, I think.` : 'I\'m not sure exactly.'));
  }
  lines.push(D('Are you hurt at all, and do you need help getting out of the building?'));
  lines.push(R(`${t.injured ? 'Yes, I\'m hurt.' : 'I\'m not hurt.'} ${t.trapped ? 'I can\'t get out on my own.' : t.wantsEvacuation ? 'Yes, please, I want to get out.' : 'I\'d rather stay here.'}`));
  lines.push(D('Thank you. If there\'s an aftershock, drop, cover and hold on. A human dispatcher has this and will follow up. If things get worse, call 911. [END]'));
  return lines;
}

export function mockExtraction(person, needs, scenario, { target = 'resident', answered = true } = {}) {
  const t = scenario?.truth || {};
  if (target === 'emergency_contact') {
    return {
      reached_person: false, needs_help: false, trapped: false, injured: false, distress: false,
      gas_or_fire: false, building_unsafe: false, power_out: null,
      equipment_hours_left: null, wants_evacuation: null, reported_ok: false,
      summary: scenario?.contactKnows || `Has not heard from ${first(person.name)} today.`,
      problems: [`Cannot confirm ${first(person.name)} is safe`],
      alerts: [], immediate_actions: ['Consider a responder welfare visit'], do_not: [],
      communication_guide: null, resources_needed: null, time_sensitive: null,
    };
  }
  const problems = [];
  if (t.trapped) problems.push('Trapped — cannot get out');
  if (t.gasOrFire) problems.push('Smells gas / sees fire');
  if (t.buildingUnsafe) problems.push('Building badly damaged');
  if (t.injured) problems.push('Injured');
  if (t.equipmentHoursLeft != null) problems.push(`Medical equipment ~${t.equipmentHoursLeft}h of power left`);
  if (t.needsHelp) problems.push('Needs assistance');
  if (t.wantsEvacuation) problems.push('Needs to leave the building');
  if (t.distress) problems.push('Distressed');
  return {
    reached_person: answered,
    needs_help: !!t.needsHelp || !!t.trapped,
    trapped: !!t.trapped,
    injured: !!t.injured,
    gas_or_fire: !!t.gasOrFire,
    building_unsafe: !!t.buildingUnsafe,
    power_out: t.powerOut ?? null,
    distress: !!t.distress,
    equipment_hours_left: t.equipmentHoursLeft ?? null,
    wants_evacuation: t.wantsEvacuation ?? null,
    reported_ok: !!t.reportedOk,
    summary: scenario?.situation || 'Reached; no details recorded.',
    problems,
    alerts: [
      ...(t.trapped ? ['Trapped'] : []),
      ...(t.gasOrFire ? ['Gas / fire reported'] : []),
      ...(t.equipmentHoursLeft != null && t.equipmentHoursLeft <= 6 ? [`Equipment power ~${t.equipmentHoursLeft}h`] : []),
    ],
    immediate_actions: [
      ...(t.trapped ? ['Send search and rescue'] : []),
      ...(t.wantsEvacuation ? ['Arrange accessible transport out of the building'] : []),
    ],
    do_not: [],
    communication_guide: null,
    resources_needed: needs.mobility === 'wheelchair' || needs.mobility === 'bedbound' ? 'Wheelchair-accessible transport' : null,
    time_sensitive: t.equipmentHoursLeft != null ? `Equipment power ~${t.equipmentHoursLeft}h` : null,
  };
}

export function mockIntake() {
  const D = (text) => ({ speaker: 'dispatcher', text });
  const C = (text) => ({ speaker: 'caller', text });
  const transcript = [
    D(`This is an automated assistant from ${config.agencyName}. No 911 operator is free right now, so I'm answering. If anyone is in immediate danger, please stay on the line. What's your name?`),
    C('It\'s Dorothy Evans. I\'m 76.'),
    D('Thank you, Dorothy. What is your address, and what is happening?'),
    C('14 Cedar Ave, apartment 5C. The building shook badly, there are cracks in the stairwell and the elevator is dead. I use a wheelchair.'),
    D('Are you hurt, and do you smell gas or see smoke?'),
    C('I\'m not hurt. No gas that I can smell.'),
    D('Do you have any medical equipment or medicines you depend on?'),
    C('I take insulin, it\'s in the fridge but the power is out.'),
    D('Is anyone with you, and who is your emergency contact?'),
    C('I\'m alone. My son is Paul Evans, 612-555-0188.'),
    D('Do you need help getting out of the building?'),
    C('Yes, I can\'t do the stairs on my own.'),
    D('Thank you, Dorothy. If there\'s an aftershock, stay away from windows. A human dispatcher has your details and will follow up. [END]'),
  ];
  const extracted = {
    name: 'Dorothy Evans', age: 76, gender: 'Female', address: '14 Cedar Ave, Apt 5C',
    medical_history: ['Uses wheelchair', 'Insulin dependent diabetes'],
    emergency_contact_name: 'Paul Evans (son)', emergency_contact_number: '+16125550188',
    lives_alone: true, needs_help: true, trapped: false, injured: false, distress: false,
    gas_or_fire: false, building_unsafe: true, power_out: true,
    equipment_hours_left: null, wants_evacuation: true, reported_ok: false,
    summary: 'Wheelchair user alone on the 5th floor, elevator out and stairwell cracked; insulin without refrigeration.',
    problems: ['Cannot get down from 5th floor — elevator out', 'Stairwell cracked', 'Insulin without refrigeration'],
    alerts: ['Building damage reported'], immediate_actions: ['Send a team able to carry a wheelchair user down stairs'], do_not: [],
    communication_guide: null, resources_needed: 'Evacuation chair or 2-person carry, cooler for insulin', time_sensitive: null,
  };
  return { transcript, extracted };
}

// Goals are written about "them" for the AI prompt; mock mode asks them directly.
function toSecondPerson(q) {
  return q
    .replace(/\bAre they\b/g, 'Are you')
    .replace(/\bHave they\b/g, 'Have you')
    .replace(/\bCould they\b/g, 'Could you')
    .replace(/\bDo they\b/g, 'Do you')
    .replace(/\bIs their\b/g, 'Is your')
    .replace(/\bwith them\b/g, 'with you')
    .replace(/\btheir\b/g, 'your')
    .replace(/\bthey\b/g, 'you')
    .replace(/the home/g, 'your home');
}

/** Mock-mode dispatcher for interactive calls: walks through the call goals. */
export function mockNextDispatcherTurn(goals, turnIndex, { intake = false } = {}) {
  const intakeQs = [
    `This is an automated assistant from ${config.agencyName}. No 911 operator is free right now, so I'm answering. If anyone is in immediate danger, stay on the line. What's your name and age?`,
    'What is your address, and what is happening right now? Is your building damaged?',
    'Are you hurt or trapped? Do you smell gas or see smoke?',
    'Do you have a disability, medical condition or equipment you depend on?',
    'Is anyone with you? Who is your emergency contact, and their number?',
    'Do you need help getting out of the building?',
  ];
  const asked = goals.map(toSecondPerson);
  const qs = intake
    ? intakeQs
    : [`Hello, this is an automated assistant from ${config.agencyName} doing a welfare check. ${asked[0]}`, ...asked.slice(1)];
  if (turnIndex < qs.length) return qs[turnIndex];
  return 'Thank you. A human dispatcher has your details and will follow up. If things get worse, call 911. [END]';
}

/** Mock-mode extraction from a real transcript (interactive or live calls). */
export function heuristicExtraction(transcript) {
  const said = transcript
    .split('\n')
    .filter((l) => !/^DISPATCHER:/i.test(l))
    .join(' ')
    .toLowerCase();
  const hours = said.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  const trapped = /trapped|pinned|stuck under|can'?t get out|buried|blocked in/.test(said);
  const gasOrFire = /\bgas\b|smoke|fire|burning/.test(said) && !/no gas|don'?t smell|no smoke|no fire/.test(said);
  const buildingUnsafe = /collaps|crack|ceiling (fell|came down)|wall (fell|came down)|caved/.test(said);
  const powerOut = /power('s| is)? (out|off|gone)|no power|blackout/.test(said);
  const needsHelp = trapped || /\bhelp\b|need|can'?t (get|move|leave)|stuck/.test(said);
  const injured = /hurt|injur|\bi fell\b|bleed|broke my|broken (arm|leg|hip|wrist)|cut (my|myself)/.test(said);
  const distress = /scared|panic|afraid|terrified|confus|don'?t know what to do/.test(said);
  const evac = /evacuat|get (me |us )?out|leave|shelter|pick (me|us) up/.test(said) && !/don'?t want to leave|rather stay/.test(said);
  const ok = /\b(i'?m|we'?re) (fine|ok|okay|safe|alright)\b|all good|\bsafe\b/.test(said) && !needsHelp && !injured && !trapped;
  const problems = [];
  if (trapped) problems.push('Trapped');
  if (gasOrFire) problems.push('Gas smell / fire reported');
  if (buildingUnsafe) problems.push('Building damage reported');
  if (injured) problems.push('Reports an injury');
  if (hours) problems.push(`Equipment/supply ~${hours[1]}h left`);
  if (needsHelp) problems.push('Asked for help');
  if (evac) problems.push('Wants evacuation');
  if (distress) problems.push('Distressed');
  return {
    reached_person: true, needs_help: needsHelp, trapped, injured, distress,
    gas_or_fire: gasOrFire, building_unsafe: buildingUnsafe, power_out: powerOut || null,
    equipment_hours_left: hours ? Number(hours[1]) : null,
    wants_evacuation: evac || null, reported_ok: ok,
    summary: ok ? 'Reports being safe.' : problems.length ? problems.join('; ') + '.' : 'Reached; details unclear — review transcript.',
    problems,
    alerts: [...(trapped ? ['Trapped'] : []), ...(gasOrFire ? ['Gas / fire'] : []), ...(injured ? ['Injury reported'] : [])],
    immediate_actions: trapped ? ['Send search and rescue'] : [], do_not: [],
    communication_guide: null, resources_needed: null, time_sensitive: hours ? `~${hours[1]}h left` : null,
  };
}
