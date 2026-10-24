// ─────────────────────────────────────────────────────────────
//  engine.js — welfare checks from start to finish.
//
//  startWelfareCheck → ring/text → (no answer → retry ×3, raise
//  priority each time, reach the emergency contact) or (answered →
//  conversation → extract problems → update the card → re-score).
//
//  Also: interactive calls (a human plays the resident), inbound
//  calls (911 first, AI intake as fallback), welfare rounds, and
//  the dispatcher's actions.
// ─────────────────────────────────────────────────────────────
import { config } from '../config.js';
import * as store from '../store.js';
import { broadcast } from '../events.js';
import { provider, destination } from '../telephony/index.js';
import { aiMode, chat, chatJson } from '../ai/groq.js';
import * as P from '../ai/prompts.js';
import * as mock from '../ai/mock.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const first = (n = '') => n.split(' ')[0];

let generation = 0; // bumps on reset so in-flight work stops
const retryTimers = new Map(); // personId → timeout
const live = new Map(); // callId → { messages, intake, done(resolve) }
let round = { active: false, total: 0, done: 0 };

/** The person as the AI should see them for this call (which emergency contact is on the line). */
function personFor(call) {
  const person = store.getPerson(call.personId);
  return call.contactName ? { ...person, emergencyContactName: call.contactName } : person;
}

const SPEAKER = { DISPATCHER: 'dispatcher', RESIDENT: 'resident', CONTACT: 'contact', CALLER: 'caller', ANSWERER: 'other' };

function pace(text, channel) {
  const ms = channel === 'sms' ? 1800 : Math.min(3200, 650 + text.length * 22);
  return ms / Math.max(0.1, config.playbackSpeed);
}

/** "DISPATCHER: hello\nRESIDENT: hi" → [{speaker, text}] */
export function parseTranscript(raw) {
  const out = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*[*_]*\s*(DISPATCHER|RESIDENT|CONTACT|CALLER|ANSWERER)\s*[*_]*\s*:\s*[*_]*\s*(.+)$/i);
    if (m) out.push({ speaker: SPEAKER[m[1].toUpperCase()], text: m[2].trim() });
    else if (out.length && line.trim()) out.at(-1).text += ' ' + line.trim();
  }
  return out;
}

const transcriptText = (call) =>
  call.turns
    .filter((t) => t.speaker !== 'system')
    .map((t) => `${t.speaker.toUpperCase()}: ${t.text}`)
    .join('\n');

const smsOpening = (person) =>
  `${config.agencyName} (automated welfare check): Hi ${first(person.name)}, are you safe? Reply SAFE or HELP, or tell us what's happening. If you are in immediate danger, contact 911.`;

// ── Starting a check ────────────────────────────────────────

/**
 * @param {string} personId
 * @param {{mode?:'auto'|'interactive', target?:'resident'|'emergency_contact', channel?:'voice'|'sms', reason?:string}} opts
 * @returns {{call:object|null, done:Promise}}
 */
export function startWelfareCheck(personId, { mode = 'auto', target = 'resident', channel, reason = 'manual', contactIndex = 0 } = {}) {
  const person = store.getPerson(personId);
  const c = store.getCaseRaw(personId);
  if (!person || !c) throw Object.assign(new Error('Unknown person'), { status: 404 });

  const existing = store.activeCallFor(personId, target);
  if (existing) return { call: existing, done: Promise.resolve() };
  if (reason !== 'manual' && c.status === 'safe') return { call: null, done: Promise.resolve() };
  if (target === 'resident') clearRetry(personId);

  const ch = channel || (target === 'resident' ? (c.needs.preferredContact === 'sms' ? 'sms' : config.firstContact) : 'voice');
  const contacts = person.emergencyContacts?.length
    ? person.emergencyContacts
    : person.emergencyContactNumber ? [{ name: person.emergencyContactName, number: person.emergencyContactNumber }] : [];
  const contact = target === 'emergency_contact' ? contacts[contactIndex] : null;
  const number = target === 'resident' ? person.phone : contact?.number;
  if (!number) {
    store.addTimeline(personId, target === 'resident' ? 'No phone number on file — cannot contact' : 'No emergency contact on file', 'alert');
    return { call: null, done: Promise.resolve() };
  }

  let to;
  try {
    to = destination(number);
  } catch (e) {
    store.addTimeline(personId, e.message, 'alert');
    return { call: null, done: Promise.resolve() };
  }

  const attempt = target === 'resident' ? c.attempts + 1 : 1;
  const call = store.createCall({
    personId,
    target,
    channel: ch,
    mode,
    attempt,
    to,
    dialedFor: number,
    contactIndex: contact ? contactIndex : undefined,
    contactName: contact?.name,
    provider: provider().name,
    status: ch === 'sms' ? 'sending' : 'ringing',
  });

  const who = target === 'resident' ? '' : ` emergency contact ${contact.name}`;
  const verb = ch === 'sms' ? 'Texting' : 'Calling';
  const attemptText = target === 'resident' ? ` (attempt ${attempt}/${config.maxAttempts})` : '';
  if (target === 'resident') store.updateCase(personId, { status: 'in_progress', lastAttemptAt: now() });
  store.addTimeline(personId, `${verb}${who}${attemptText}${mode === 'interactive' ? ' — interactive' : ''}`, 'call');

  const done = runCall(call.id, generation).catch((e) => {
    console.error('[engine]', e);
    store.updateCall(call.id, { status: 'failed', error: e.message, endedAt: now() });
    store.addTimeline(personId, `Call failed: ${e.message}`, 'alert');
  });
  return { call, done };
}

async function runCall(callId, gen) {
  const call = store.getCall(callId);
  const person = store.getPerson(call.personId);
  const p = provider();

  if (call.channel === 'sms') store.addTurn(callId, 'dispatcher', smsOpening(person));

  let reached;
  if (call.mode === 'interactive') {
    await sleep(1200);
    reached = true;
  } else if (call.channel === 'sms') {
    ({ replied: reached } = await p.sendSms({ to: call.to, body: smsOpening(person), callId, personId: call.personId, attempt: call.attempt, target: call.target }));
  } else {
    ({ answered: reached } = await p.placeCall({ to: call.to, callId, personId: call.personId, attempt: call.attempt, target: call.target }));
  }
  if (gen !== generation) return;
  if (!reached) return onNoAnswer(callId);

  store.updateCall(callId, { status: 'in_progress', answeredAt: now() });

  if (call.mode === 'interactive') return startInteractive(callId);
  if (p.live) return; // a live provider feeds turns through webhooks, then calls finishCall

  await playSimulatedConversation(callId, gen);
  if (gen !== generation) return;
  await finishCall(callId);
}

async function playSimulatedConversation(callId, gen) {
  const call = store.getCall(callId);
  const person = personFor(call);
  const c = store.getCaseRaw(call.personId);
  const scenario = store.getScenario(call.personId);
  const opts = { target: call.target, channel: call.channel };

  let turns = null;
  if (aiMode() === 'groq') {
    try {
      const msgs = P.simulatedConversationPrompt(person, c.needs, scenario, opts);
      if (call.channel === 'sms') msgs[1].content += `\nThe first DISPATCHER message was already sent: "${smsOpening(person)}". Do not repeat it — start with the RESIDENT's reply.`;
      turns = parseTranscript(await chat(msgs, { maxTokens: 900, temperature: 0.7 }));
    } catch (e) {
      console.warn('[engine] AI conversation failed, using mock:', e.message);
    }
  }
  if (!turns || turns.length < 2) {
    turns = mock.mockConversation(person, c.needs, scenario, opts);
    if (call.channel === 'sms') turns = turns.slice(1);
  }

  for (const t of turns) {
    await sleep(pace(t.text, call.channel));
    if (gen !== generation || store.getCall(callId)?.status !== 'in_progress') return;
    store.addTurn(callId, t.speaker, t.text.replace(/\[END\]/g, '').trim());
  }
}

function onNoAnswer(callId) {
  const call = store.getCall(callId);
  const person = store.getPerson(call.personId);
  const id = call.personId;
  store.addTurn(callId, 'system', call.channel === 'sms' ? 'No reply.' : 'No answer.');
  store.updateCall(callId, { status: 'no_answer', endedAt: now() });

  if (call.target === 'emergency_contact') {
    store.addTimeline(id, `Emergency contact ${call.contactName} did not answer`, 'alert');
    const next = (call.contactIndex || 0) + 1;
    const nextContact = person.emergencyContacts?.[next];
    if (nextContact) {
      store.addTimeline(id, `Trying the next emergency contact, ${nextContact.name}`, 'call');
      startWelfareCheck(id, { target: 'emergency_contact', contactIndex: next, reason: 'escalation' });
    }
    return;
  }

  const c = store.getCaseRaw(id);
  const failed = c.failedAttempts + 1;
  const exhausted = failed >= config.maxAttempts;
  store.updateCase(id, { attempts: c.attempts + 1, failedAttempts: failed, status: exhausted ? 'unreachable' : 'no_answer' });

  if (exhausted) {
    store.addTimeline(id, `Unreachable after ${failed} attempts — consider sending a responder`, 'alert');
  } else {
    store.addTimeline(id, `No answer (attempt ${failed}/${config.maxAttempts}) — priority raised, retrying in ${Math.round(config.retryDelayMs / 1000)}s`, 'alert');
    const gen = generation;
    retryTimers.set(
      id,
      setTimeout(() => {
        retryTimers.delete(id);
        if (gen === generation) startWelfareCheck(id, { reason: 'retry' });
      }, config.retryDelayMs),
    );
  }

  if (failed === config.contactEmergencyAfter) {
    if (person.emergencyContactNumber || person.emergencyContacts?.length) {
      store.addTimeline(id, `Reaching emergency contact ${person.emergencyContacts?.[0]?.name || person.emergencyContactName}`, 'call');
      startWelfareCheck(id, { target: 'emergency_contact', reason: 'escalation' });
    } else {
      store.addTimeline(id, 'No emergency contact on file', 'alert');
    }
  }
}

function clearRetry(personId) {
  clearTimeout(retryTimers.get(personId));
  retryTimers.delete(personId);
}

// ── Interactive calls (you play the resident / caller) ──────

async function dispatcherTurn(callId) {
  const call = store.getCall(callId);
  const state = live.get(callId);
  let text;
  if (aiMode() === 'groq') {
    try {
      text = await chat(state.messages, { maxTokens: 160, temperature: 0.4 });
    } catch (e) {
      console.warn('[engine] AI turn failed, using mock:', e.message);
    }
  }
  if (!text) {
    const c = call.personId ? store.getCaseRaw(call.personId) : null;
    const goals = c ? P.callGoals(c.needs) : [];
    text = mock.mockNextDispatcherTurn(goals, state.turn, { intake: state.intake });
  }
  state.turn++;
  state.messages.push({ role: 'assistant', content: text });
  const ended = text.includes('[END]');
  store.addTurn(callId, 'dispatcher', text.replace(/\[END\]/g, '').trim());
  if (ended) await finishCall(callId);
}

async function startInteractive(callId, { intake = false } = {}) {
  const call = store.getCall(callId);
  let system;
  if (intake) system = P.intakeSystem();
  else {
    const person = personFor(call);
    const c = store.getCaseRaw(call.personId);
    system = P.dispatcherSystem(person, c.needs, { target: call.target, channel: call.channel });
  }
  live.set(callId, {
    intake,
    turn: 0,
    messages: [
      { role: 'system', content: system + '\nReply with ONLY your next message — no labels.' },
      { role: 'user', content: '(The call has connected. Say your opening line.)' },
    ],
  });
  // SMS already shows the fixed opening text; voice gets an AI opening line.
  if (call.channel === 'sms') {
    const state = live.get(callId);
    state.turn = 1;
    state.messages.push({ role: 'assistant', content: call.turns.find((t) => t.speaker === 'dispatcher')?.text || '' });
  } else {
    await dispatcherTurn(callId);
  }
}

export async function replyToCall(callId, text) {
  const call = store.getCall(callId);
  if (!call || call.status !== 'in_progress' || !live.has(callId)) {
    throw Object.assign(new Error('That call is not waiting for a reply'), { status: 409 });
  }
  const speaker = call.target === 'inbound' ? 'caller' : call.target === 'emergency_contact' ? 'contact' : 'resident';
  store.addTurn(callId, speaker, text);
  live.get(callId).messages.push({ role: 'user', content: text });
  await dispatcherTurn(callId);
  return store.getCall(callId);
}

/** Dispatcher hangs up. Whatever was said still gets extracted. */
export async function hangUp(callId) {
  const call = store.getCall(callId);
  if (!call) throw Object.assign(new Error('Unknown call'), { status: 404 });
  if (call.status === 'in_progress') {
    store.addTurn(callId, 'system', 'Call ended by dispatcher.');
    await finishCall(callId);
  } else if (['ringing', 'sending', 'dialing', 'forwarding'].includes(call.status)) {
    store.updateCall(callId, { status: 'canceled', endedAt: now() });
  }
  return store.getCall(callId);
}

// ── Finishing: transcript → problems → card ─────────────────

export async function finishCall(callId) {
  const call = store.getCall(callId);
  if (!call || call.extracting || ['completed', 'canceled'].includes(call.status)) return;
  store.updateCall(callId, { extracting: true });
  live.delete(callId);

  if (call.target === 'inbound') return finishInbound(callId);

  const person = personFor(call);
  const c = store.getCaseRaw(call.personId);
  const transcript = transcriptText(call);

  let ex = null;
  if (aiMode() === 'groq' && transcript) {
    try {
      ex = await chatJson(P.extractionPrompt(person, transcript, { target: call.target }), { maxTokens: 700 });
    } catch (e) {
      console.warn('[engine] extraction failed, using fallback:', e.message);
    }
  }
  if (!ex) {
    const scripted = call.mode === 'auto' && !provider().live;
    ex = scripted
      ? mock.mockExtraction(person, c.needs, store.getScenario(call.personId), { target: call.target })
      : mock.heuristicExtraction(transcript);
  }

  store.updateCall(callId, { status: 'completed', endedAt: now(), extracted: ex, extracting: false });
  applyExtraction(call.personId, ex, call);
}

function uniqMerge(a = [], b = []) {
  const seen = new Set(a.map((x) => x.toLowerCase()));
  const out = [...a];
  for (const x of b) {
    if (x && typeof x === 'string' && !seen.has(x.toLowerCase())) {
      seen.add(x.toLowerCase());
      out.push(x);
    }
  }
  return out;
}

function applyExtraction(personId, ex, call) {
  const isContact = call.target === 'emergency_contact';
  // Did we speak to the person themselves, or did someone else pick up?
  const direct = !isContact && ex.reached_person !== false;
  const answerer = !isContact && !direct ? ex.answered_by || {} : null;
  const prefix = isContact
    ? `${first(call.contactName || 'Contact')} (contact): `
    : answerer
      ? `Via ${first(answerer.name || 'someone else')}: `
      : '';

  store.updateCase(personId, (c) => {
    const card = {
      summary: isContact ? c.card.summary || `${prefix}${ex.summary || ''}` : ex.summary || c.card.summary,
      problems: uniqMerge(c.card.problems, (ex.problems || []).map((p) => prefix + p)),
      alerts: uniqMerge(c.card.alerts, ex.alerts),
      immediateActions: uniqMerge(c.card.immediateActions, ex.immediate_actions),
      doNot: uniqMerge(c.card.doNot, ex.do_not),
      communicationGuide: ex.communication_guide || c.card.communicationGuide,
      resourcesNeeded: ex.resources_needed || c.card.resourcesNeeded,
      timeSensitive: ex.time_sensitive || c.card.timeSensitive,
    };
    if (isContact) return { card, contactReached: true };

    const f = { ...c.findings };
    if (ex.needs_help) f.needsHelp = true;
    if (ex.trapped) f.trapped = true;
    if (ex.injured) f.injured = true;
    if (ex.gas_or_fire) f.gasOrFire = true;
    if (ex.building_unsafe) f.buildingUnsafe = true;
    if (ex.power_out != null) f.powerOut = !!ex.power_out;
    if (ex.distress) f.distress = true;
    if (ex.wants_evacuation != null) f.wantsEvacuation = !!ex.wants_evacuation;
    if (ex.equipment_hours_left != null && !Number.isNaN(Number(ex.equipment_hours_left))) {
      f.equipmentHoursLeft = Number(ex.equipment_hours_left);
    }
    // "They're fine" from someone else isn't the same as hearing it from them.
    f.reportedOk = direct && !!ex.reported_ok && !f.needsHelp && !f.injured && !f.trapped;

    const urgent = f.needsHelp || f.injured || f.trapped || f.gasOrFire;
    const status = c.status === 'safe' ? 'safe'
      : c.assignedResponderId ? 'responder_assigned'
      : urgent ? 'needs_help'
      : !direct ? 'reached_other'
      : f.reportedOk ? 'reached_ok'
      : 'reached';
    return {
      card,
      findings: f,
      status,
      attempts: c.attempts + 1,
      lastContactAt: now(),
      reachedVia: direct ? null : answerer.name || 'someone else',
    };
  });

  if (!isContact) clearRetry(personId);
  const label = isContact
    ? 'Emergency contact reached'
    : answerer
      ? `Answered by ${answerer.name || 'someone else'}${answerer.relationship ? ` (${answerer.relationship})` : ''}, not ${first(store.getPerson(personId).name)}`
      : `Reached by ${call.channel === 'sms' ? 'text' : 'phone'}`;
  const urgent = ex.needs_help || ex.injured || ex.trapped || ex.gas_or_fire;
  store.addTimeline(personId, `${label} — ${ex.summary || 'see transcript'}`, urgent ? 'alert' : answerer ? 'info' : 'success');

  if (answerer) cardForAnswerer(personId, answerer, call);
}

/**
 * Someone else answered the person's phone. If they're in the disaster area
 * (with the person, or elsewhere in the affected area), they get a card too.
 */
function cardForAnswerer(personId, ab, call) {
  const person = store.getPerson(personId);
  if (!ab.name) {
    store.addTimeline(personId, 'Whoever answered did not give a name — no card created for them', 'info');
    return;
  }
  const inArea = ab.at_same_location || ab.in_affected_area;
  if (!inArea) {
    store.addTimeline(personId, `${ab.name} answered from outside the affected area — no card created for them`, 'info');
    return;
  }

  const match = store.findPersonMatch({ phone: ab.phone, name: ab.name, age: ab.age });
  if (match?.person.id === personId) return; // extraction confused them with the person
  let otherId;
  if (match) {
    store.ensureCase(match.person, `Added from the registry: answered ${person.name}'s phone`);
    otherId = match.person.id;
  } else {
    otherId = store.addPerson(
      {
        name: ab.name,
        age: ab.age,
        gender: ab.gender || null,
        phone: ab.phone || (ab.at_same_location ? person.phone : null),
        address: ab.at_same_location ? person.address : null,
        medicalHistory: ab.medical_history || [],
      },
      { origin: 'answered_call', identity: { status: 'unverified', note: `Gave their details while answering ${person.name}'s phone` } },
    ).id;
  }

  store.updateCase(otherId, (c) => ({ callIds: [...new Set([...c.callIds, call.id])] }));
  // "{link}" is replaced by the other person's name (as a link) on the dashboard
  store.link(personId, otherId, `{link} answered the phone${ab.relationship ? ` (${ab.relationship})` : ''}`, `Answered {link}'s phone`);
  if (ab.at_same_location) {
    // Same building → same damage, gas, power situation
    store.updateCase(otherId, { hazard: { ...store.getCaseRaw(personId).hazard } });
  }
  store.addTimeline(personId, `${match ? 'Linked' : 'Card created'} for ${ab.name}, who answered and is ${ab.at_same_location ? 'at the same address' : 'in the affected area'}`, 'info');

  const problems = [
    ab.trapped && 'Trapped',
    ab.injured && 'Injured',
    ab.needs_help && 'Needs help',
    ab.distress && 'Distressed',
  ].filter(Boolean);
  const okay = !ab.needs_help && !ab.injured && !ab.trapped;
  applyExtraction(
    otherId,
    {
      reached_person: true,
      needs_help: !!ab.needs_help,
      trapped: !!ab.trapped,
      injured: !!ab.injured,
      distress: !!ab.distress,
      reported_ok: okay && !ab.distress,
      summary: ab.summary || `Answered ${person.name}'s phone.`,
      problems,
    },
    { ...call, target: 'resident' },
  );
}

// ── Inbound calls: 911 first, AI intake if nobody answers ───

const UNREGISTERED_CALLER = '+16125550199';

/**
 * @param {{mode?:'auto'|'interactive', operatorAvailable?:boolean, registered?:boolean}} opts
 *   registered: a person from the registry calls in (shows caller matching)
 */
export function simulateInbound({ mode = 'auto', operatorAvailable = false, registered = false } = {}) {
  const gen = generation;
  let caller = null;
  if (registered) {
    const pool = store.listCases().filter((c) => {
      const sc = store.getScenario(c.personId);
      return c.origin === 'registry' && c.status !== 'safe' && sc?.says && !sc.answeredBy;
    });
    const pick = pool[Math.floor(Math.random() * pool.length)];
    caller = pick ? store.getPerson(pick.personId) : null;
  }
  const from = caller?.phone || UNREGISTERED_CALLER;
  const call = store.createCall({
    personId: null,
    target: 'inbound',
    channel: 'voice',
    mode,
    attempt: 1,
    from,
    simulatedCallerId: caller?.id || null, // simulation only — lets mock mode script the caller
    to: config.agencyName,
    provider: provider().name,
    status: 'forwarding',
  });
  (async () => {
    store.addTurn(call.id, 'system', `Incoming call from ${from.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}.`);
    await sleep(1200);
    const target = config.inboundForwardNumber ? `forwarding to ${config.inboundForwardNumber}` : 'simulated — INBOUND_FORWARD_NUMBER not set';
    store.addTurn(call.id, 'system', `Ringing 911 dispatch first (${target})…`);
    await sleep(3500);
    if (gen !== generation) return;
    if (operatorAvailable) {
      store.addTurn(call.id, 'system', '911 operator answered — call handed over. AI not used.');
      store.updateCall(call.id, { status: 'completed', endedAt: now(), handedTo911: true });
      return;
    }
    store.addTurn(call.id, 'system', `No 911 operator answered within ${config.inboundForwardTimeout}s — AI intake assistant answering.`);
    store.updateCall(call.id, { status: 'in_progress', answeredAt: now() });

    if (mode === 'interactive') return startInteractive(call.id, { intake: true });

    const scenario = caller ? store.getScenario(caller.id) : null;
    let turns = null;
    if (aiMode() === 'groq') {
      try {
        turns = parseTranscript(await chat(P.simulatedIntakePrompt(caller, scenario?.situation), { maxTokens: 1000, temperature: 0.8 }));
      } catch (e) {
        console.warn('[engine] AI intake failed, using mock:', e.message);
      }
    }
    if (!turns || turns.length < 2) turns = mock.mockIntake(caller, scenario).transcript;
    for (const t of turns) {
      await sleep(pace(t.text, 'voice'));
      if (gen !== generation || store.getCall(call.id)?.status !== 'in_progress') return;
      store.addTurn(call.id, t.speaker, t.text.replace(/\[END\]/g, '').trim());
    }
    await finishCall(call.id);
  })().catch((e) => {
    console.error('[engine] inbound', e);
    store.updateCall(call.id, { status: 'failed', error: e.message, endedAt: now() });
  });
  return call;
}

async function finishInbound(callId) {
  const call = store.getCall(callId);
  const transcript = transcriptText(call);
  let ex = null;
  if (aiMode() === 'groq' && transcript) {
    try {
      ex = await chatJson(P.intakeExtractionPrompt(transcript), { maxTokens: 800 });
    } catch (e) {
      console.warn('[engine] intake extraction failed:', e.message);
    }
  }
  if (!ex) {
    if (call.mode === 'auto') {
      const caller = call.simulatedCallerId ? store.getPerson(call.simulatedCallerId) : null;
      ex = mock.mockIntake(caller, caller ? store.getScenario(caller.id) : null).extracted;
    } else {
      ex = { ...mock.heuristicExtraction(transcript), ...mock.parseNameAge(transcript), medical_history: [] };
    }
  }
  ex.age = store.validAge(ex.age);

  // Is this someone we already know? Caller ID first, then name + age.
  const match = store.findPersonMatch({ phone: call.from, name: ex.name, age: ex.age });
  let personId;
  if (match) {
    const by = { phone: 'caller ID', name_age: 'name and age', name: 'name only' }[match.by];
    store.ensureCase(match.person, 'Added from the registry after calling in');
    personId = match.person.id;
    store.updateCase(personId, (c) => ({
      callIds: [...c.callIds, callId],
      identity: { status: match.by === 'phone' ? 'matched_phone' : 'matched_name', note: `Caller matched by ${by}` },
    }));
    store.addTimeline(personId, `Called in — matched to the registry by ${by}${match.by === 'phone' ? '' : '; confirm identity'}`, 'call');
  } else {
    const person = store.addPerson(
      {
        name: ex.name || `Unknown caller (${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`,
        age: ex.age,
        gender: ex.gender ?? null,
        phone: call.from,
        address: ex.address || null,
        medicalHistory: ex.medical_history || [],
        emergencyContactName: ex.emergency_contact_name || null,
        emergencyContactNumber: ex.emergency_contact_number || null,
        livesAlone: ex.lives_alone ?? null,
      },
      { origin: 'inbound', identity: { status: 'unverified', note: 'Not found in the registry' } },
    );
    personId = person.id;
    store.updateCase(personId, (c) => ({ callIds: [...c.callIds, callId] }));
    store.addTimeline(personId, 'Added from an inbound call — not in the registry, identity not verified', 'call');
  }
  store.updateCall(callId, { personId, status: 'completed', endedAt: now(), extracted: ex, extracting: false });
  applyExtraction(personId, { ...ex, reached_person: true }, { ...call, target: 'resident' });
}

// ── Welfare rounds: check everyone not yet contacted ────────

function broadcastRound() {
  const { token, ...pub } = round;
  broadcast('round', pub);
}

export function startRound({ limit } = {}) {
  if (round.active) return round;
  const gen = generation;
  const token = {};
  const queue = store
    .listCases()
    .filter((c) => c.status === 'not_contacted')
    .slice(0, limit || undefined)
    .map((c) => c.personId);
  round = { active: true, total: queue.length, done: 0, token };
  broadcastRound();

  const running = () => gen === generation && round.token === token;
  const worker = async () => {
    while (queue.length && running()) {
      const id = queue.shift();
      const { done } = startWelfareCheck(id, { reason: 'round' });
      await done;
      if (!running()) return;
      round.done++;
      broadcastRound();
    }
  };
  Promise.all(Array.from({ length: Math.max(1, config.checkConcurrency) }, worker)).then(() => {
    if (!running()) return;
    round = { ...round, active: false, token: null };
    broadcastRound();
  });
  return round;
}

/** Stops starting new checks; calls already in progress finish normally. */
export function stopRound() {
  round = { ...round, active: false, token: null };
  broadcastRound();
  return round;
}

export const getRound = () => {
  const { token, ...pub } = round;
  return pub;
};

// ── Dispatcher actions ──────────────────────────────────────

export function assignResponder(personId, responderId) {
  const r = store.getResponder(responderId);
  if (!r) throw Object.assign(new Error('Unknown responder'), { status: 404 });
  if (r.assignedTo && r.assignedTo !== personId) {
    throw Object.assign(new Error(`${r.name} is already assigned`), { status: 409 });
  }
  const c = store.getCaseRaw(personId);
  if (c.assignedResponderId && c.assignedResponderId !== responderId) releaseResponder(personId, { quiet: true });
  store.setResponder(responderId, { status: 'assigned', assignedTo: personId, assignedAt: now() });
  store.updateCase(personId, { assignedResponderId: responderId, status: 'responder_assigned' });
  store.addTimeline(personId, `${r.name} (${r.type}) assigned by dispatcher`, 'responder');
  clearRetry(personId);
  return store.caseView(personId);
}

export function releaseResponder(personId, { quiet = false } = {}) {
  const c = store.getCaseRaw(personId);
  if (!c.assignedResponderId) return store.caseView(personId);
  const r = store.getResponder(c.assignedResponderId);
  store.setResponder(c.assignedResponderId, { status: 'available', assignedTo: null, assignedAt: null });
  const fallback = c.findings.needsHelp || c.findings.injured || c.findings.trapped ? 'needs_help' : c.lastContactAt ? 'reached' : 'not_contacted';
  store.updateCase(personId, { assignedResponderId: null, status: c.status === 'safe' ? 'safe' : fallback });
  if (!quiet) store.addTimeline(personId, `${r?.name || 'Responder'} released`, 'responder');
  return store.caseView(personId);
}

export function markSafe(personId) {
  releaseResponder(personId, { quiet: true });
  clearRetry(personId);
  store.updateCase(personId, { status: 'safe' });
  store.addTimeline(personId, 'Marked safe by dispatcher', 'success');
  return store.caseView(personId);
}

export function reopen(personId) {
  const c = store.getCaseRaw(personId);
  const status = c.findings.needsHelp || c.findings.injured || c.findings.trapped ? 'needs_help' : c.lastContactAt ? 'reached' : 'not_contacted';
  store.updateCase(personId, { status });
  store.addTimeline(personId, 'Case reopened by dispatcher', 'info');
  return store.caseView(personId);
}

export function verifyIdentity(personId) {
  store.updateCase(personId, { identity: { status: 'verified', note: 'Confirmed by dispatcher' } });
  store.addTimeline(personId, 'Identity confirmed by dispatcher', 'success');
  return store.caseView(personId);
}

export function addNote(personId, text) {
  const t = String(text || '').trim();
  if (!t) throw Object.assign(new Error('Note is empty'), { status: 400 });
  store.updateCase(personId, (c) => ({ notes: [...c.notes, { at: now(), text: t }] }));
  return store.caseView(personId);
}

/**
 * Integration hook for the 3D simulation: push danger-at-home values.
 * [{ personId, buildingDamage: 'none'|'minor'|'moderate'|'severe'|'collapsed',
 *    intensity (MMI 1-10), gasLeak, fire, roadsBlocked, powerOut }]
 */
export function applyHazards(list = []) {
  let n = 0;
  for (const h of list) {
    if (!store.getCaseRaw(h.personId)) continue;
    const { personId, ...hazard } = h;
    store.updateCase(personId, (c) => ({ hazard: { ...c.hazard, ...hazard, source: 'simulation' } }));
    n++;
  }
  return { updated: n };
}

export function reset() {
  generation++;
  for (const t of retryTimers.values()) clearTimeout(t);
  retryTimers.clear();
  live.clear();
  round = { active: false, total: 0, done: 0 };
  const loaded = store.load();
  broadcast('reset', {});
  return loaded;
}
