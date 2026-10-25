// ─────────────────────────────────────────────────────────────
//  generate-sample.js — writes the 30-person development sample.
//
//    node scripts/generate-sample.js
//
//  Outputs (in shared/data/):
//    people.sample.json      ← person records (flat format, see shared/FORMATS.md)
//    scenarios.sample.json   ← SIMULATION ONLY: what is "really" happening to
//                              each person after the earthquake, so simulated
//                              calls have something to say. Real data never has this.
//    responders.sample.json  ← units the dispatcher can assign
//
//  Phone numbers use 555-0100…0199, the range reserved for fiction,
//  so nothing here can ring a real person.
// ─────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'data');
mkdirSync(OUT, { recursive: true });

const TOWN = 'Cypress Bend';
const phone = (n) => `+1612555${String(n).padStart(4, '0')}`;

// Reproducible pseudorandom zone assignment for the 100-zone simulation.
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const zoneRandom = seededRandom(20261025);

// name, age, gender, medicalHistory[], street address, livesAlone, contact [name, relation] | null,
// scenario: a = answers per attempt, ca = contact answers, sit = situation, t = truth,
//           hz = hazard at home (placeholder for the 3D simulation), ck = what the contact knows
const P = [
  ['Margaret Thompson', 78, 'Female', ['COPD', 'Home oxygen concentrator', 'Hard of hearing', 'Uses walker'], '142 Birch Ln', true, ['Sarah Thompson', 'daughter'],
    { a: [true], sit: 'The power went out with the earthquake. Her portable oxygen battery has about 4 hours left. A bookcase fell across the hallway and she can\'t get past it with her walker. Anxious. Has a small dog named Buddy and won\'t leave without him.', t: { needsHelp: true, distress: true, equipmentHoursLeft: 4, wantsEvacuation: true, powerOut: true }, hz: { buildingDamage: 'moderate', intensity: 7, powerOut: true } }],
  ['James Robinson', 58, 'Male', ['C4 quadriplegia', 'Ventilator dependent', 'Requires suction every 2 hours'], '18 Heron St', false, ['Carol Robinson', 'wife'],
    { a: [true], sit: 'His caregiver can\'t get through — the road is blocked by a fallen building front. The power is out and the ventilator is on battery, about 6 hours left. The house itself is fine. Calm, direct, medically precise.', t: { needsHelp: true, equipmentHoursLeft: 6, wantsEvacuation: true, powerOut: true }, hz: { buildingDamage: 'minor', intensity: 7, roadsBlocked: true, powerOut: true } }],
  ['Aisha Mensah', 31, 'Female', ['Autism spectrum', 'Non-verbal (uses AAC device)', 'Sensory sensitivity to noise and crowds'], '77 Magnolia Ave', false, ['Grace Mensah', 'mother'],
    { a: [true], sit: 'Her mother Grace replies from Aisha\'s phone. There are new cracks in the walls and every aftershock sets off car alarms; Aisha is overwhelmed. They need a quiet, low-stimulation shelter, not a crowded gym.', t: { needsHelp: true, distress: true, wantsEvacuation: true, buildingUnsafe: true }, hz: { buildingDamage: 'moderate', intensity: 7 } }],
  ['Robert Chen', 84, 'Male', ["Alzheimer's disease (moderate)", 'Type 2 diabetes'], '9 Lakeview Rd', true, ['Kevin Chen', 'son'],
    { a: [false, false, false], ca: true, ck: 'Kevin hasn\'t reached his father since the earthquake. Robert lives alone in an old brick house and often doesn\'t answer or understand the phone. Kevin is two hours away and the highway is closed.', t: {}, hz: { buildingDamage: 'severe', intensity: 8 } }],
  ['Dolores Ramirez', 71, 'Female', ['End-stage kidney disease', 'Home dialysis', 'Hypertension'], '230 Willow Creek Dr', false, ['Elena Ramirez', 'daughter'],
    { a: [false, true], ca: true, ck: 'Elena spoke to her mother last night; she was worried about missing dialysis.', sit: 'The power is out so her dialysis machine won\'t run, and she has missed today\'s session. Feels weak and swollen. Her husband is with her but the garage door collapsed on their car.', t: { needsHelp: true, wantsEvacuation: true, powerOut: true }, hz: { buildingDamage: 'minor', powerOut: true } }],
  ['Thomas Okafor', 45, 'Male', ['Deaf (profound hearing loss)', 'Type 1 diabetes — insulin'], '51 Pecan Ct', true, ['Ngozi Okafor', 'sister'],
    { a: [true], sit: 'He can\'t hear alarms, but he can see smoke down the street. The power is out and his insulin is getting warm, about a day\'s supply. House looks OK.', t: { needsHelp: true, gasOrFire: true, powerOut: true }, hz: { buildingDamage: 'minor', fire: true, powerOut: true } }],
  ['Evelyn Brooks', 89, 'Female', ['Heart failure', 'Pacemaker', 'Uses wheelchair'], '3 Oak Hollow Way', true, ['Diane Brooks', 'niece'],
    { a: [true], sit: 'She fell out of her wheelchair when the shaking started. Her ankle is swollen and she can\'t get back into the chair. Short of breath when upset. Dishes and pictures smashed everywhere.', t: { needsHelp: true, injured: true, distress: true, wantsEvacuation: true }, hz: { buildingDamage: 'moderate', intensity: 7 } }],
  ['Marcus Williams', 34, 'Male', ['T6 paraplegia — wheelchair user'], '88 Mill St, Apt 7B', true, ['Jasmine Williams', 'partner'],
    { a: [true], sit: 'He\'s fine and has supplies. The elevator is out so he\'s staying in his 7th-floor apartment; the building manager says the structure is OK.', t: { reportedOk: true }, hz: { buildingDamage: 'minor', intensity: 6 } }],
  ['Linda Park', 67, 'Female', ['Blind (retinitis pigmentosa)', 'Has a guide dog'], '120 Heron St', true, ['Daniel Park', 'son'],
    { a: [true], sit: 'Windows broke and there is glass all over the floor; she can\'t tell where it is and her guide dog is frightened. Not hurt yet. Wants someone to guide her out with the dog.', t: { needsHelp: true, wantsEvacuation: true }, hz: { buildingDamage: 'moderate', intensity: 7 } }],
  ['George Novak', 92, 'Male', ["Parkinson's disease", 'Uses walker', 'Hard of hearing'], '15 Birch Ln', false, ['Peter Novak', 'son'],
    { a: [false, false, true], ca: false, sit: 'Part of the living room ceiling came down. His wife Helen (88) is pinned under a fallen dresser in the bedroom and he isn\'t strong enough to move it. He\'s shaking and frightened.', t: { needsHelp: true, trapped: true, injured: true, distress: true, buildingUnsafe: true }, hz: { buildingDamage: 'severe', intensity: 8 } }],
  ['Priya Shah', 29, 'Female', ['Pregnant (36 weeks)', 'Gestational diabetes'], '64 Magnolia Ave', false, ['Raj Shah', 'husband'],
    { a: [true], sit: 'Alone — her husband is stuck across town because the bridge is closed. Some tightening in her belly, probably practice contractions, but she\'s scared. Wants to get to the hospital.', t: { distress: true, wantsEvacuation: true }, hz: { buildingDamage: 'minor', roadsBlocked: true } }],
  ['Harold Jenkins', 76, 'Male', ['COPD', 'CPAP for sleep apnea'], '201 Ridge Rd', true, ['Mary Jenkins', 'daughter'],
    { a: [true], sit: 'House came through fine. Power is out but he has a generator running and plenty of supplies. Gruff but fine.', t: { reportedOk: true, powerOut: true }, hz: { buildingDamage: 'none', powerOut: true } }],
  ['Rosa Delgado', 81, 'Female', ['Dementia (early stage)', 'Hip replacement'], '42 Lakeview Rd', true, ['Carmen Delgado', 'daughter'],
    { a: [true], sit: 'Confused about who is calling, worried it\'s a scam. Mentions a funny smell in the kitchen "like when the stove is on" but doesn\'t know why. Keeps asking for her daughter Carmen.', t: { distress: true, needsHelp: true, gasOrFire: true }, hz: { buildingDamage: 'moderate', gasLeak: true } }],
  ['Samuel Adeyemi', 63, 'Male', ['Stroke with aphasia', 'Right-side weakness, uses cane'], '19 Willow Creek Dr', false, ['Funmi Adeyemi', 'wife'],
    { a: [false, false, false], ca: true, ck: 'Funmi is working a hospital shift and can\'t reach him. Since his stroke he struggles to use the phone. Their house is old and she\'s very worried.', t: {}, hz: { buildingDamage: 'severe', intensity: 8 } }],
  ['Betty Lou Harper', 87, 'Female', ['Bed-bound after stroke', 'Feeding tube (PEG) with pump', 'Requires home health aide'], '6 Oak Hollow Way', false, ['Ray Harper', 'son'],
    { a: [true], sit: 'Her home health aide didn\'t come. The power is out and the feeding pump battery has about 8 hours. Speaks slowly and weakly. Can\'t get out of bed alone.', t: { needsHelp: true, equipmentHoursLeft: 8, wantsEvacuation: true, powerOut: true }, hz: { buildingDamage: 'minor', powerOut: true } }],
  ['Daniel Kim', 52, 'Male', ['Multiple sclerosis', 'Uses wheelchair part-time'], '33 Pecan Ct', true, ['Grace Kim', 'sister'],
    { a: [true], sit: 'Staying put, house is OK, has food, water and medication for three days.', t: { reportedOk: true }, hz: { buildingDamage: 'minor' } }],
  ['Mary O\'Brien', 73, 'Female', ['Type 1 diabetes — insulin', 'Low vision (macular degeneration)'], '99 Mill St', true, ['Sean O\'Brien', 'son'],
    { a: [false, true], ca: true, ck: 'Sean talked to her an hour ago, she was fine.', sit: 'Insulin is in a cooler with ice. She\'s fine, but can\'t see well enough to tell if anything is damaged.', t: { reportedOk: true }, hz: { buildingDamage: 'minor' } }],
  ['Jerome Washington', 69, 'Male', ['Leg amputee (left)', 'Uses wheelchair', 'Heart failure'], '27 Birch Ln', true, ['Tasha Washington', 'daughter'],
    { a: [false, false, false], ca: true, ck: 'Tasha last talked to her father yesterday evening. Since the quake his phone goes straight to voicemail. He lives in an old wood-frame house and can\'t leave without help.', t: {}, hz: { buildingDamage: 'severe', intensity: 8 } }],
  ['Nancy Fields', 58, 'Female', ['Bipolar disorder', 'Severe anxiety'], '71 Heron St', true, ['Paul Fields', 'brother'],
    { a: [true], sit: 'Physically fine but panicking about aftershocks, talking fast, hasn\'t slept. Wants someone to tell her what to do and would go to a shelter.', t: { distress: true, wantsEvacuation: true }, hz: { buildingDamage: 'minor' } }],
  ['Walter Schmidt', 80, 'Male', ['Home oxygen at night', 'Wears hearing aid'], '150 Willow Creek Dr', false, ['Karen Schmidt', 'daughter'],
    { a: [true], sit: 'Power is out but he has backup oxygen cylinders for about 12 hours. His wife Ingrid is with him. Fine for now.', t: { equipmentHoursLeft: 12, reportedOk: true, powerOut: true }, hz: { buildingDamage: 'none', powerOut: true } }],
  ['Layla Hassan', 19, 'Female', ['Down syndrome', 'Congenital heart condition'], '11 Magnolia Ave', false, ['Fatima Hassan', 'mother'],
    { a: [true], sit: 'Home alone — mum is at work and can\'t get back because roads are blocked. Cheerful but scared of the aftershocks. Picture frames broke in the hallway.', t: { needsHelp: true, distress: true }, hz: { buildingDamage: 'minor', roadsBlocked: true } }],
  ['Kenneth Moore', 66, 'Male', ['Recent hip replacement', 'Uses walker'], '210 Ridge Rd', false, ['Sharon Moore', 'wife'],
    { a: [true], sit: 'Fine. House is OK and his wife is with him.', t: { reportedOk: true }, hz: { buildingDamage: 'none' } }],
  ['Patricia Young', 74, 'Female', ['Hypertension', 'Arthritis'], '58 Mill St', true, ['Mark Young', 'son'],
    { a: [true], sit: 'Fine, a few broken plates. Her son is coming to pick her up.', t: { reportedOk: true }, hz: { buildingDamage: 'minor' } }],
  ['Luis Hernandez', 38, 'Male', ['Spinal cord injury — wheelchair user', 'Pressure sores'], '12 Lakeview Rd, Apt 4D', true, ['Ana Hernandez', 'sister'],
    { a: [true], sit: 'He\'s on the 4th floor, the elevator is dead and there are big cracks in the stairwell. He can smell smoke somewhere in the building and can\'t get down the stairs in his chair.', t: { needsHelp: true, distress: true, wantsEvacuation: true, gasOrFire: true, buildingUnsafe: true }, hz: { buildingDamage: 'severe', intensity: 8, fire: true } }],
  ['Agnes Wright', 95, 'Female', ['Frail elderly', 'Hard of hearing', 'Heart failure'], '4 Magnolia Ave', false, ['Tom Wright', 'son'],
    { a: [true], sit: 'Her son Tom is with her and they are fine. She speaks very slowly.', t: { reportedOk: true }, hz: { buildingDamage: 'minor' } }],
  ['Brian Foster', 47, 'Male', ['PTSD', 'Traumatic brain injury'], '140 Pecan Ct', true, ['Kelly Foster', 'sister'],
    { a: [false, false, true], ca: false, sit: 'Disoriented; the shaking is bringing back bad memories. Not sure what to do. Hasn\'t eaten.', t: { distress: true, needsHelp: true }, hz: { buildingDamage: 'moderate' } }],
  ['Chloe Martin', 26, 'Female', ['Deaf', 'Uses ASL'], '85 Willow Creek Dr', false, ['Emma Martin', 'mother'],
    { a: [true], sit: 'With her roommate, both fine, heading to the Ridge Rd shelter now.', t: { reportedOk: true }, hz: { buildingDamage: 'minor' } }],
  ['Henry Liu', 79, 'Male', ['Home dialysis (peritoneal)', 'Type 2 diabetes'], '23 Oak Hollow Way', true, ['Amy Liu', 'daughter'],
    { a: [true], sit: 'His dialysis machine can\'t run without power and he needs tonight\'s session. Polite, understates the problem.', t: { needsHelp: true, equipmentHoursLeft: 2, wantsEvacuation: true, powerOut: true }, hz: { buildingDamage: 'minor', powerOut: true } }],
  ['Joan Patel', 70, 'Female', ["Parkinson's disease"], '190 Ridge Rd', true, null,
    { a: [false, false, false], t: {}, hz: { buildingDamage: 'moderate' } }],
  ['Frank Russo', 83, 'Male', ['BiPAP ventilation at night', 'ALS (early stage)'], '36 Heron St', false, ['Angela Russo', 'daughter'],
    { a: [true], sit: 'The power is out. His BiPAP battery has about 3 hours and he needs it to sleep. His wife Maria is with him; both elderly.', t: { needsHelp: true, equipmentHoursLeft: 3, wantsEvacuation: true, powerOut: true }, hz: { buildingDamage: 'minor', powerOut: true } }],
];

// First-person version of the situation, spoken by the resident in mock mode (no AI key).
const SAYS = {
  'Margaret Thompson': 'The power went out with the quake. My oxygen battery has maybe four hours. A bookcase fell in the hallway and I can\'t get past it with my walker. I\'m scared, and I won\'t leave Buddy.',
  'James Robinson': 'My caregiver can\'t get through, the road\'s blocked. Power\'s out, the ventilator is on battery, roughly six hours left. The house itself is fine.',
  'Aisha Mensah': 'This is Grace, Aisha\'s mother. There are new cracks in the walls and every aftershock sets off the alarms. Aisha is overwhelmed. We need somewhere quiet, not a crowded gym.',
  'Dolores Ramirez': 'The power is out so my dialysis machine won\'t run. I missed today\'s session and I feel weak. My husband is here but the garage door fell on our car.',
  'Thomas Okafor': 'I\'m OK but I can see smoke down the street. Power is out and my insulin is getting warm. I have about a day of it.',
  'Evelyn Brooks': 'I fell out of my chair when it started shaking. My ankle is swollen and I can\'t get back in the chair. Everything is broken on the floor.',
  'Marcus Williams': 'I\'m fine. The elevator is out so I\'m staying up here on the seventh floor. The manager says the building is OK and I have supplies.',
  'Linda Park': 'The windows broke and there\'s glass on the floor but I can\'t see where. My guide dog is frightened. I\'m not hurt, but I need someone to walk us out.',
  'George Novak': 'Part of the ceiling came down. My wife Helen is stuck under the dresser in the bedroom and I can\'t lift it. Please, I\'m shaking.',
  'Priya Shah': 'I\'m on my own, my husband can\'t get back because the bridge is closed. I\'m 36 weeks and I keep getting tightening. I\'m scared. I want to get to the hospital.',
  'Harold Jenkins': 'House is fine. Power\'s out but the generator is running and I\'ve got plenty. Don\'t worry about me.',
  'Rosa Delgado': 'Who is this? Is this a scam? There\'s a funny smell in the kitchen, like when the stove is on. Where is Carmen? Can you get Carmen?',
  'Betty Lou Harper': 'My aide... didn\'t come today. The power is off. The feeding pump says eight hours. I can\'t get out of bed.',
  'Daniel Kim': 'I\'m staying put. The house is OK and I have food, water and my meds for three days.',
  'Mary O\'Brien': 'I\'m fine, my insulin is in a cooler with ice. I just can\'t see well enough to tell if anything is damaged.',
  'Nancy Fields': 'I can\'t stop shaking, every aftershock I think it\'s happening again. I haven\'t slept. Just tell me what to do. I\'ll go to a shelter.',
  'Walter Schmidt': 'Power is out but I have oxygen cylinders for about twelve hours. Ingrid is with me. We\'re alright for now.',
  'Layla Hassan': 'Mum is at work and she can\'t come home, the roads are blocked. The pictures fell down. I don\'t like the shaking.',
  'Kenneth Moore': 'We\'re fine, the house is OK and my wife is here.',
  'Patricia Young': 'I\'m fine, just some broken plates. My son is coming to get me.',
  'Luis Hernandez': 'I\'m on the fourth floor, the elevator is dead and there are big cracks in the stairwell. I can smell smoke somewhere in the building. I can\'t get down the stairs in my chair.',
  'Agnes Wright': 'My son Tom is here with me. We are... fine, dear.',
  'Brian Foster': 'I don\'t know. The shaking... it brought it all back. I don\'t know what to do. I haven\'t eaten.',
  'Chloe Martin': 'I\'m with my roommate, we\'re both fine. Heading to the Ridge Rd shelter now.',
  'Henry Liu': 'My dialysis machine needs power and I have a session tonight. I\'m sure it will be fine, but I thought I should mention it.',
  'Frank Russo': 'The power is out. My BiPAP battery has about three hours and I need it to sleep. Maria is here with me.',
};

const people = [];
const scenarios = {};
let contactNo = 131;

P.forEach(([name, age, gender, medicalHistory, street, livesAlone, contact, sc], i) => {
  const id = `P${String(i + 1).padStart(3, '0')}`;
  people.push({
    id,
    name,
    age,
    gender,
    phone: phone(101 + i),
    address: `${street}, ${TOWN}`,
    medicalHistory,
    emergencyContactName: contact ? `${contact[0]} (${contact[1]})` : null,
    emergencyContactNumber: contact ? phone(contactNo++) : null,
    livesAlone,
    zone: Math.floor(zoneRandom() * 100),
  });
  scenarios[id] = {
    answers: sc.a,
    contactAnswers: sc.ca ?? true,
    situation: sc.sit || null,
    says: SAYS[name] || null,
    contactKnows: sc.ck || null,
    truth: {
      needsHelp: false, trapped: false, injured: false, distress: false, gasOrFire: false,
      buildingUnsafe: false, powerOut: null, equipmentHoursLeft: null, wantsEvacuation: false, reportedOk: false,
      ...sc.t,
    },
    hazard: {
      buildingDamage: 'none', intensity: null, gasLeak: false, fire: false, roadsBlocked: false, powerOut: false,
      ...sc.hz,
    },
  };
});

const responders = [
  ['E-12', 'Engine 12', 'Fire engine'],
  ['USAR-1', 'Rescue 1', 'Urban search & rescue team'],
  ['M-4', 'Medic 4', 'Ambulance (advanced life support)'],
  ['M-7', 'Medic 7', 'Ambulance'],
  ['GAS-2', 'Utility 2', 'Gas & electric crew'],
  ['PT-3', 'Paratransit 3', 'Wheelchair-accessible van'],
  ['P-21', 'Patrol 21', 'Police'],
  ['CERT-5', 'CERT Team 5', 'Volunteer welfare team'],
].map(([id, name, type]) => ({ id, name, type }));

writeFileSync(join(OUT, 'people.sample.json'), JSON.stringify(people, null, 2) + '\n');
writeFileSync(join(OUT, 'scenarios.sample.json'), JSON.stringify(scenarios, null, 2) + '\n');
writeFileSync(join(OUT, 'responders.sample.json'), JSON.stringify(responders, null, 2) + '\n');
console.log(`Wrote ${people.length} people, ${Object.keys(scenarios).length} scenarios, ${responders.length} responders to ${OUT}`);
