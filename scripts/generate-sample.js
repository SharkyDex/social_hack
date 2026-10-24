// ─────────────────────────────────────────────────────────────
//  generate-sample.js — writes the 30-person development sample.
//
//    node scripts/generate-sample.js
//
//  Outputs (in shared/data/):
//    people.sample.json      ← same fields as the real generated dataset
//    scenarios.sample.json   ← SIMULATION ONLY: what is "really" happening to
//                              each person, so simulated calls have something
//                              to say. The real dataset never has this.
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
const phone = (n) => `+1713555${String(n).padStart(4, '0')}`;

// name, age, gender, medicalHistory[], street address, livesAlone, contact [name, relation] | null,
// scenario: a = answers per attempt, ca = contact answers, sit = situation, t = truth, hz = hazard, ck = what contact knows
const P = [
  ['Margaret Thompson', 78, 'Female', ['COPD', 'Home oxygen concentrator', 'Hard of hearing', 'Uses walker'], '142 Bayou Ln', true, ['Sarah Thompson', 'daughter'],
    { a: [true], sit: 'Power has been out since 2pm. Portable oxygen battery has about 4 hours left. Water is covering the street. Anxious. Has a small dog named Buddy and will not leave without him.', t: { needsHelp: true, distress: true, equipmentHoursLeft: 4, wantsEvacuation: true }, hz: { minutesUntilFlood: 45 } }],
  ['James Robinson', 58, 'Male', ['C4 quadriplegia', 'Ventilator dependent', 'Requires suction every 2 hours'], '18 Heron St', false, ['Carol Robinson', 'wife'],
    { a: [true], sit: 'Caregiver could not get through flooded roads. Ventilator running on battery, about 6 hours left. Calm, direct, medically precise.', t: { needsHelp: true, equipmentHoursLeft: 6, wantsEvacuation: true }, hz: { minutesUntilFlood: 90, roadsCutOff: true } }],
  ['Aisha Mensah', 31, 'Female', ['Autism spectrum', 'Non-verbal (uses AAC device)', 'Sensory sensitivity to noise and crowds'], '77 Magnolia Ave', false, ['Grace Mensah', 'mother'],
    { a: [true], sit: 'Her mother Grace replies from Aisha\'s phone. Power is out, Aisha is overwhelmed by the storm noise. They need a quiet, autism-friendly shelter, not a crowded one.', t: { needsHelp: true, distress: true, wantsEvacuation: true }, hz: { minutesUntilFlood: 150 } }],
  ['Robert Chen', 84, 'Male', ["Alzheimer's disease (moderate)", 'Type 2 diabetes'], '9 Levee Rd', true, ['Kevin Chen', 'son'],
    { a: [false, false, false], ca: true, ck: 'Kevin has not reached his father since 8am. Robert often does not answer the phone and may not understand evacuation warnings. Kevin is two hours away and cannot get there.', t: {}, hz: { minutesUntilFlood: 30 } }],
  ['Dolores Ramirez', 71, 'Female', ['End-stage kidney disease', 'Home dialysis', 'Hypertension'], '230 Willow Creek Dr', false, ['Elena Ramirez', 'daughter'],
    { a: [false, true], ca: true, ck: 'Elena spoke to her mother last night; she was worried about missing dialysis.', sit: 'Missed today\'s dialysis because the power is out. Feels weak and swollen. Husband is with her but cannot drive in the flooding.', t: { needsHelp: true, wantsEvacuation: true }, hz: {} }],
  ['Thomas Okafor', 45, 'Male', ['Deaf (profound hearing loss)', 'Type 1 diabetes — insulin'], '51 Pecan Ct', true, ['Ngozi Okafor', 'sister'],
    { a: [true], sit: 'Fridge is off, insulin getting warm, about a day of supply. Water rising in the yard. Otherwise OK.', t: { needsHelp: true, wantsEvacuation: false }, hz: { minutesUntilFlood: 60 } }],
  ['Evelyn Brooks', 89, 'Female', ['Heart failure', 'Pacemaker', 'Uses wheelchair'], '3 Oak Hollow Way', true, ['Diane Brooks', 'niece'],
    { a: [true], sit: 'Slipped while moving from bed to wheelchair this morning. Ankle swollen, cannot transfer on her own. Short of breath when upset.', t: { needsHelp: true, injured: true, distress: true, wantsEvacuation: true }, hz: { minutesUntilFlood: 120 } }],
  ['Marcus Williams', 34, 'Male', ['T6 paraplegia — wheelchair user'], '88 Mill St', true, ['Jasmine Williams', 'partner'],
    { a: [true], sit: 'Fine. Has his own accessible van and is driving to a friend\'s house on Ridge Rd within the hour.', t: { reportedOk: true }, hz: { minutesUntilFlood: 180 } }],
  ['Linda Park', 67, 'Female', ['Blind (retinitis pigmentosa)', 'Has a guide dog'], '120 Heron St', true, ['Daniel Park', 'son'],
    { a: [true], sit: 'Safe for now but cannot read the evacuation notices or see the water level. Wants to evacuate with her guide dog and needs someone to guide her.', t: { wantsEvacuation: true, needsHelp: true }, hz: { minutesUntilFlood: 75 } }],
  ['George Novak', 92, 'Male', ["Parkinson's disease", 'Uses walker', 'Hard of hearing'], '15 Bayou Ln', false, ['Peter Novak', 'son'],
    { a: [false, false, true], ca: false, sit: 'Water is coming in on the ground floor. He and his wife Helen (88) are trying to get upstairs but he cannot manage the stairs quickly.', t: { needsHelp: true, distress: true, wantsEvacuation: true }, hz: { homeFlooded: true } }],
  ['Priya Shah', 29, 'Female', ['Pregnant (36 weeks)', 'Gestational diabetes'], '64 Magnolia Ave', false, ['Raj Shah', 'husband'],
    { a: [true], sit: 'Alone at home — husband stuck across town at work. Some tightening in her belly, probably practice contractions, but scared. Wants to get to higher ground near the hospital.', t: { distress: true, wantsEvacuation: true }, hz: { minutesUntilFlood: 100 } }],
  ['Harold Jenkins', 76, 'Male', ['COPD', 'CPAP for sleep apnea'], '201 Ridge Rd', true, ['Mary Jenkins', 'daughter'],
    { a: [true], sit: 'Power is out but he has a generator running and plenty of supplies. On high ground. Gruff but fine.', t: { reportedOk: true }, hz: {} }],
  ['Rosa Delgado', 81, 'Female', ['Dementia (early stage)', 'Hip replacement'], '42 Levee Rd', true, ['Carmen Delgado', 'daughter'],
    { a: [true], sit: 'Confused about who is calling, worried it is a scam. Does not realise the street is flooding. Keeps asking for her daughter Carmen.', t: { distress: true, needsHelp: true }, hz: { minutesUntilFlood: 40 } }],
  ['Samuel Adeyemi', 63, 'Male', ['Stroke with aphasia', 'Right-side weakness, uses cane'], '19 Willow Creek Dr', false, ['Funmi Adeyemi', 'wife'],
    { a: [false, false, false], ca: true, ck: 'Funmi is working a hospital shift and cannot reach him. He struggles to use the phone since his stroke. She is very worried.', t: {}, hz: { minutesUntilFlood: 70 } }],
  ['Betty Lou Harper', 87, 'Female', ['Bed-bound after stroke', 'Feeding tube (PEG) with pump', 'Requires home health aide'], '6 Oak Hollow Way', false, ['Ray Harper', 'son'],
    { a: [true], sit: 'Her home health aide did not come today. Feeding pump battery has about 8 hours. Speaks slowly and weakly. Cannot get out of bed alone.', t: { needsHelp: true, equipmentHoursLeft: 8, wantsEvacuation: true }, hz: { minutesUntilFlood: 110 } }],
  ['Daniel Kim', 52, 'Male', ['Multiple sclerosis', 'Uses wheelchair part-time'], '33 Pecan Ct', true, ['Grace Kim', 'sister'],
    { a: [true], sit: 'Staying put, has food, water and medication for three days. Feels OK.', t: { reportedOk: true }, hz: { minutesUntilFlood: 160 } }],
  ['Mary O\'Brien', 73, 'Female', ['Type 1 diabetes — insulin', 'Low vision (macular degeneration)'], '99 Mill St', true, ['Sean O\'Brien', 'son'],
    { a: [false, true], ca: true, ck: 'Sean talked to her an hour ago, she was fine.', sit: 'Insulin is in a cooler with ice. Fine, but cannot see how high the water is outside.', t: { reportedOk: true }, hz: { minutesUntilFlood: 140 } }],
  ['Jerome Washington', 69, 'Male', ['Leg amputee (left)', 'Uses wheelchair', 'Heart failure'], '27 Bayou Ln', true, ['Tasha Washington', 'daughter'],
    { a: [false, false, false], ca: true, ck: 'Tasha last talked to her father yesterday evening. His phone goes straight to voicemail. He cannot leave the house without help.', t: {}, hz: { minutesUntilFlood: 20 } }],
  ['Nancy Fields', 58, 'Female', ['Bipolar disorder', 'Severe anxiety'], '71 Heron St', true, ['Paul Fields', 'brother'],
    { a: [true], sit: 'Physically fine but panicking about the storm, talking fast, has not slept. Wants someone to tell her what to do and would go to a shelter.', t: { distress: true, wantsEvacuation: true }, hz: { minutesUntilFlood: 130 } }],
  ['Walter Schmidt', 80, 'Male', ['Home oxygen at night', 'Wears hearing aid'], '150 Willow Creek Dr', false, ['Karen Schmidt', 'daughter'],
    { a: [true], sit: 'Has backup oxygen cylinders for about 12 hours. Wife Ingrid is with him. Fine for now.', t: { equipmentHoursLeft: 12, reportedOk: true }, hz: {} }],
  ['Layla Hassan', 19, 'Female', ['Down syndrome', 'Congenital heart condition'], '11 Magnolia Ave', false, ['Fatima Hassan', 'mother'],
    { a: [true], sit: 'Home alone, mum is at work and the roads are closed. Cheerful but a little scared of the thunder. Water is in the garden.', t: { needsHelp: true, distress: true }, hz: { minutesUntilFlood: 80 } }],
  ['Kenneth Moore', 66, 'Male', ['Recent hip replacement', 'Uses walker'], '210 Ridge Rd', false, ['Sharon Moore', 'wife'],
    { a: [true], sit: 'Fine. On high ground with his wife.', t: { reportedOk: true }, hz: {} }],
  ['Patricia Young', 74, 'Female', ['Hypertension', 'Arthritis'], '58 Mill St', true, ['Mark Young', 'son'],
    { a: [true], sit: 'Fine, son is coming to pick her up.', t: { reportedOk: true }, hz: { minutesUntilFlood: 170 } }],
  ['Luis Hernandez', 38, 'Male', ['Spinal cord injury — wheelchair user', 'Pressure sores'], '12 Levee Rd', true, ['Ana Hernandez', 'sister'],
    { a: [true], sit: 'Water is coming into the ground floor and his power chair cannot go through it. He is on the couch with his phone, about 10 cm of water on the floor and rising.', t: { needsHelp: true, distress: true, wantsEvacuation: true }, hz: { homeFlooded: true } }],
  ['Agnes Wright', 95, 'Female', ['Frail elderly', 'Hard of hearing', 'Heart failure'], '4 Magnolia Ave', false, ['Tom Wright', 'son'],
    { a: [true], sit: 'Her son Tom is with her and they are fine. She speaks very slowly.', t: { reportedOk: true }, hz: { minutesUntilFlood: 150 } }],
  ['Brian Foster', 47, 'Male', ['PTSD', 'Traumatic brain injury'], '140 Pecan Ct', true, ['Kelly Foster', 'sister'],
    { a: [false, false, true], ca: false, sit: 'Disoriented, the storm is bringing back memories. Not sure what to do. Has not eaten.', t: { distress: true, needsHelp: true }, hz: { minutesUntilFlood: 95 } }],
  ['Chloe Martin', 26, 'Female', ['Deaf', 'Uses ASL'], '85 Willow Creek Dr', false, ['Emma Martin', 'mother'],
    { a: [true], sit: 'With her roommate, both fine, heading to the Ridge Rd shelter now.', t: { reportedOk: true }, hz: { minutesUntilFlood: 120 } }],
  ['Henry Liu', 79, 'Male', ['Home dialysis (peritoneal)', 'Type 2 diabetes'], '23 Oak Hollow Way', true, ['Amy Liu', 'daughter'],
    { a: [true], sit: 'His dialysis machine cannot run without power and he needs tonight\'s session. Polite, understates the problem.', t: { needsHelp: true, equipmentHoursLeft: 2, wantsEvacuation: true }, hz: { minutesUntilFlood: 100 } }],
  ['Joan Patel', 70, 'Female', ["Parkinson's disease"], '190 Ridge Rd', true, null,
    { a: [false, false, false], t: {}, hz: {} }],
  ['Frank Russo', 83, 'Male', ['BiPAP ventilation at night', 'ALS (early stage)'], '36 Heron St', false, ['Angela Russo', 'daughter'],
    { a: [true], sit: 'Power is out. BiPAP battery has about 3 hours and he needs it to sleep. Wife Maria is with him, both elderly.', t: { needsHelp: true, equipmentHoursLeft: 3, wantsEvacuation: true }, hz: { minutesUntilFlood: 85 } }],
];

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
  });
  scenarios[id] = {
    answers: sc.a,
    contactAnswers: sc.ca ?? true,
    situation: sc.sit || null,
    contactKnows: sc.ck || null,
    truth: { needsHelp: false, injured: false, distress: false, equipmentHoursLeft: null, wantsEvacuation: false, reportedOk: false, ...sc.t },
    hazard: { minutesUntilFlood: null, homeFlooded: false, roadsCutOff: false, ...sc.hz },
  };
});

const responders = [
  ['E-12', 'Engine 12', 'Fire engine'],
  ['M-4', 'Medic 4', 'Ambulance (advanced life support)'],
  ['M-7', 'Medic 7', 'Ambulance'],
  ['HW-2', 'High-Water Rescue 2', 'High-clearance truck'],
  ['B-1', 'Boat 1', 'Rescue boat'],
  ['PT-3', 'Paratransit 3', 'Wheelchair-accessible van'],
  ['P-21', 'Patrol 21', 'Police'],
  ['CERT-5', 'CERT Team 5', 'Volunteer welfare team'],
].map(([id, name, type]) => ({ id, name, type }));

writeFileSync(join(OUT, 'people.sample.json'), JSON.stringify(people, null, 2) + '\n');
writeFileSync(join(OUT, 'scenarios.sample.json'), JSON.stringify(scenarios, null, 2) + '\n');
writeFileSync(join(OUT, 'responders.sample.json'), JSON.stringify(responders, null, 2) + '\n');
console.log(`Wrote ${people.length} people, ${Object.keys(scenarios).length} scenarios, ${responders.length} responders to ${OUT}`);
