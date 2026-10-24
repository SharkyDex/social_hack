// ─────────────────────────────────────────────────────────────
//  prompts.js — everything the AI is told. Edit wording here.
// ─────────────────────────────────────────────────────────────
import { config } from '../config.js';

const first = (name = '') => name.split(' ')[0];

/** How to talk to this person, based on their needs. */
export function communicationTips(needs) {
  const ids = new Set(needs.flags.map((f) => f.id));
  const tips = [];
  if (ids.has('hoh')) tips.push('They are hard of hearing: speak slowly, use short sentences, repeat key points.');
  if (ids.has('dementia')) tips.push('They have dementia: use very simple words, one question at a time, reassure often, ask who is with them, never argue.');
  if (ids.has('cognitive')) tips.push('They have a cognitive or developmental disability: use plain, concrete language and check understanding.');
  if (ids.has('blind')) tips.push('They are blind or have low vision: never refer to things they would need to see; describe directions in words.');
  if (ids.has('mental')) tips.push('They may be anxious or distressed: stay calm and warm, acknowledge feelings before asking questions.');
  if (ids.has('speech')) tips.push('They may not be able to speak: accept short answers, offer yes/no questions.');
  return tips;
}

/** What this call must find out, based on their needs. */
export function callGoals(needs) {
  const ids = new Set(needs.flags.map((f) => f.id));
  const goals = ['Are they safe right now? Is water getting into the home?', 'Are they injured or unwell?'];
  if (needs.powerDependent) goals.push('Is their medical equipment working? Exactly how many hours of battery or supply are left?');
  if (ids.has('insulin')) goals.push('Is their insulin being kept cold? How much supply do they have?');
  if (ids.has('dialysis')) goals.push('Have they missed dialysis? When is the next session due?');
  if (needs.mobility !== 'independent') goals.push('Could they leave the home on their own if needed?');
  goals.push('Who is with them? Do they have medication and supplies?', 'Do they want to be evacuated to a shelter?');
  return goals;
}

function personFacts(person, needs) {
  return [
    `Name: ${person.name}${person.age ? `, ${person.age}` : ''}${person.gender ? `, ${person.gender}` : ''}`,
    `Address: ${person.address || 'unknown'}`,
    `Medical history: ${person.medicalHistory.join('; ') || 'none recorded'}`,
    `Mobility: ${needs.mobility}${person.livesAlone ? ' · lives alone' : ''}`,
  ].join('\n');
}

/** System prompt for the AI dispatcher (used turn-by-turn in interactive/live calls). */
export function dispatcherSystem(person, needs, { target = 'resident', channel = 'voice' } = {}) {
  const contact = target === 'emergency_contact';
  const who = contact
    ? `You are calling ${person.emergencyContactName}, the emergency contact for ${person.name}, because ${first(person.name)} could not be reached.`
    : `You are ${channel === 'sms' ? 'texting' : 'calling'} ${person.name} for a welfare check.`;
  const goals = contact
    ? ['When did they last hear from the person, and were they OK?', 'Do they know where the person is and who is with them?', 'Anything responders must know (medical needs, access, pets)?', 'Can they get to the person, or should we send someone?']
    : callGoals(needs);
  return `You are an automated welfare-check assistant for ${config.agencyName} during ${config.disasterName}.
${who}
Start by saying you are an automated assistant from ${config.agencyName}.
If anyone is in immediate danger, tell them to call 911 now.

About the person:
${personFacts(person, needs)}

Find out:
${goals.map((g) => `- ${g}`).join('\n')}

${communicationTips(needs).join('\n')}
Rules: this is a ${channel === 'sms' ? 'text message conversation — keep each message under 300 characters' : 'phone call — at most 2-3 short sentences per turn'}. Ask one or two questions at a time. Never promise a specific arrival time. Tell them their information is going to a human dispatcher.
When you have what you need, thank them, say a dispatcher will follow up, and end your final message with [END].`;
}

/**
 * One request that writes the whole simulated conversation (used in
 * simulated auto mode — far cheaper on rate limits than turn-by-turn).
 */
export function simulatedConversationPrompt(person, needs, scenario, { target = 'resident', channel = 'voice' } = {}) {
  const contact = target === 'emergency_contact';
  const other = contact ? 'CONTACT' : 'RESIDENT';
  const truth = contact
    ? scenario?.contactKnows || `The contact has not heard from ${first(person.name)} today and is worried.`
    : scenario?.situation || 'Invent a realistic situation consistent with their medical history during a flood.';
  const medium = channel === 'sms' ? 'text message exchange (4-7 short messages)' : 'phone call (10-14 lines)';
  return [
    { role: 'system', content: dispatcherSystem(person, needs, { target, channel }) },
    {
      role: 'user',
      content: `Write the full ${medium} between the DISPATCHER (you, the automated assistant) and the ${other}${contact ? ` (${person.emergencyContactName})` : ` (${person.name})`}.
The ${other}'s real situation — they reveal it naturally when asked, in their own voice:
${truth}

Format: one line per turn, each starting with "DISPATCHER:" or "${other}:". No stage directions, no narration, nothing else.
The dispatcher's last line ends with [END].`,
    },
  ];
}

/** Turn transcript → structured findings + card fields. */
export function extractionPrompt(person, transcript, { target = 'resident' } = {}) {
  const contact = target === 'emergency_contact';
  return [
    {
      role: 'system',
      content: 'You extract structured emergency data from welfare-check transcripts. Only use facts stated in the transcript. Never invent. Return only JSON.',
    },
    {
      role: 'user',
      content: `Person: ${person.name}${person.age ? `, ${person.age}` : ''}. Known medical history: ${person.medicalHistory.join('; ') || 'none'}.
${contact ? `This was a call with their emergency contact, ${person.emergencyContactName}, NOT with the person.` : 'This was a conversation with the person (or someone answering their phone).'}

Transcript:
${transcript}

Return JSON with exactly these keys:
{
  "reached_person": boolean,          // did we actually talk to ${first(person.name)} (or their phone)?
  "needs_help": boolean,              // they need responders or supplies sent
  "injured": boolean,
  "distress": boolean,                // panicking, confused or very scared
  "equipment_hours_left": number|null,// hours of battery/supply for medical equipment, if stated
  "wants_evacuation": boolean|null,
  "reported_ok": boolean,             // they say they are safe and need nothing
  "summary": "one sentence a dispatcher reads first",
  "problems": ["short problem statements, most urgent first"],
  "alerts": ["urgent hazards only — water inside, equipment failing, injury"],
  "immediate_actions": ["what responders should do"],
  "do_not": ["things responders must avoid"],
  "communication_guide": "how to talk to this person, or null",
  "resources_needed": "equipment/transport/shelter type needed, or null",
  "time_sensitive": "the most time-critical fact, or null"
}`,
    },
  ];
}

// ── Inbound calls (unknown caller → AI intake) ──────────────

export function intakeSystem() {
  return `You are the automated intake assistant for ${config.agencyName} during ${config.disasterName}. No 911 operator was available, so you are answering.
First say you are an automated assistant and that if anyone is in immediate danger they should stay on the line for 911 or call back.
Then gather: full name and age, address, what is happening, any disability, medical needs or equipment, who is with them, an emergency contact name and number, and whether they need evacuation.
Be warm and calm. One or two questions at a time, at most 2-3 short sentences per turn. When done, say a dispatcher will follow up and end with [END].`;
}

export function simulatedIntakePrompt() {
  return [
    { role: 'system', content: intakeSystem() },
    {
      role: 'user',
      content: `Write the full inbound phone call (12-16 lines) between DISPATCHER (you) and CALLER. The caller is not in the registry: invent a realistic person during a flood who has a disability or medical need and some problem that needs help. They give their name, age, address on a street in Cypress Bend, conditions, and an emergency contact with a 713-555-01XX number.
Format: one line per turn starting with "DISPATCHER:" or "CALLER:". Nothing else. The last dispatcher line ends with [END].`,
    },
  ];
}

export function intakeExtractionPrompt(transcript) {
  return [
    { role: 'system', content: 'You extract structured data from emergency intake calls. Only use stated facts. Return only JSON.' },
    {
      role: 'user',
      content: `Transcript:
${transcript}

Return JSON:
{
  "name": string|null, "age": number|null, "gender": string|null, "address": string|null,
  "medical_history": ["conditions, disabilities, equipment"],
  "emergency_contact_name": string|null, "emergency_contact_number": string|null,
  "lives_alone": boolean|null,
  "needs_help": boolean, "injured": boolean, "distress": boolean,
  "equipment_hours_left": number|null, "wants_evacuation": boolean|null, "reported_ok": boolean,
  "summary": "one sentence", "problems": [], "alerts": [], "immediate_actions": [], "do_not": [],
  "communication_guide": string|null, "resources_needed": string|null, "time_sensitive": string|null
}`,
    },
  ];
}
