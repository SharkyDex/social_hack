// ─────────────────────────────────────────────────────────────
//  store.js — the single in-memory source of truth.
//
//  people     → loaded from the dataset file (read-only facts)
//  cases      → one per person: live status, findings, card, notes
//  calls      → every call/text with its transcript
//  responders → units the dispatcher can assign
//
//  Everything that changes goes through these functions, which
//  re-score the case and push the update to every dashboard.
//  (For the 100k dataset, swap this file for a database; the
//  rest of the server only talks to these functions.)
// ─────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs';
import { config } from './config.js';
import { broadcast } from './events.js';
import { deriveNeeds } from '../../shared/needs.js';
import { scoreCase, compareCases } from '../../shared/priority.js';

let people = new Map();
let scenarios = {};
let cases = new Map();
let calls = new Map();
let responders = new Map();
let callSeq = 0;
let inboundSeq = 0;

// ── Loading ──────────────────────────────────────────────────

// Accept whatever key style the dataset generator uses:
// "emergency_contact_name", "Emergency Contact Name", "emergencyContactName"…
const ALIASES = {
  id: 'id', personid: 'id',
  name: 'name', fullname: 'name',
  age: 'age',
  gender: 'gender', sex: 'gender',
  phone: 'phone', phonenumber: 'phone', number: 'phone',
  address: 'address',
  medicalhistory: 'medicalHistory', medical: 'medicalHistory', conditions: 'medicalHistory',
  emergencycontactname: 'emergencyContactName', emergencycontact: 'emergencyContactName',
  emergencycontactnumber: 'emergencyContactNumber', emergencycontactphone: 'emergencyContactNumber',
  emergencycontact1: 'emergencyContact1', emergencycontact2: 'emergencyContact2',
  livesalone: 'livesAlone',
  mobility: 'mobility',
  preferredcontact: 'preferredContact',
  location: 'location',
};

// The generated dataset stores medical history as true/false flags.
const MEDICAL_FLAG_LABELS = {
  asthma: 'Asthma',
  diabetes: 'Diabetes',
  hypertension: 'Hypertension',
  heart_disease: 'Heart disease',
  pacemaker_installed: 'Pacemaker',
  on_ventilator: 'Ventilator dependent',
  chronic_kidney_disease: 'Chronic kidney disease',
  copd: 'COPD',
  mobility_impairment: 'Mobility impairment',
  cancer_history: 'Cancer history',
};

function medicalList(h) {
  if (!h) return [];
  if (Array.isArray(h)) return h.map(String).filter(Boolean);
  if (typeof h === 'string') return h.split(/[;|\n]/).map((s) => s.trim()).filter(Boolean);
  // { on_ventilator: true, copd: false, … } → ['Ventilator dependent']
  return Object.entries(h)
    .filter(([, v]) => v === true || v === 'true' || v === 1)
    .map(([k]) => MEDICAL_FLAG_LABELS[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
}

const toE164 = (n) => {
  if (!n) return null;
  const d = String(n).replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return String(n);
};

export function normalizePerson(raw, i) {
  const p = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = ALIASES[k.toLowerCase().replace(/[^a-z0-9]/g, '')] || k;
    p[key] = v;
  }
  p.id = String(p.id ?? `P${String(i + 1).padStart(5, '0')}`);
  p.medicalHistory = medicalList(p.medicalHistory);
  p.age = p.age != null ? Number(p.age) : null;
  if (typeof p.gender === 'string') p.gender = p.gender.charAt(0).toUpperCase() + p.gender.slice(1);
  p.address = p.address || null;

  // Emergency contacts: "emergency_contact_1": { name, number }, "emergency_contact_2": …
  const contacts = [p.emergencyContact1, p.emergencyContact2]
    .filter((c) => c && c.name && c.number)
    .map((c) => ({ name: c.name, number: toE164(c.number) }));
  delete p.emergencyContact1;
  delete p.emergencyContact2;
  if (!p.emergencyContactName && contacts[0]) {
    p.emergencyContactName = contacts[0].name;
    p.emergencyContactNumber = contacts[0].number;
  }
  p.emergencyContacts = contacts.length
    ? contacts
    : p.emergencyContactName
      ? [{ name: p.emergencyContactName, number: toE164(p.emergencyContactNumber) }]
      : [];
  p.phone = toE164(p.phone);
  p.emergencyContactNumber = toE164(p.emergencyContactNumber);
  return p;
}

// Small seeded random generator, so "a sample of 30" is the same 30 every run.
function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick N people from a big dataset: some highest-risk, the rest random. */
function samplePeople(list, n, mode, seed) {
  if (!n || list.length <= n) return list;
  const rand = seeded(seed);
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  if (mode === 'random') return shuffle(list).slice(0, n);
  const ranked = list
    .map((p) => ({ p, s: scoreCase(p, {}).score + rand() })) // tiny jitter breaks ties
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
  if (mode === 'risk') return ranked.slice(0, n);
  const top = ranked.slice(0, Math.ceil(n / 3));
  const rest = shuffle(ranked.slice(top.length)).slice(0, n - top.length);
  return [...top, ...rest];
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function newCase(person) {
  const scenario = scenarios[person.id];
  return {
    personId: person.id,
    status: 'not_contacted',
    attempts: 0,
    failedAttempts: 0,
    contactReached: false,
    lastAttemptAt: null,
    lastContactAt: null,
    needs: deriveNeeds(person),
    // PLACEHOLDER: danger at home. The 3D simulation will push real values
    // through POST /api/hazards; until then the sample scenario fills it.
    hazard: scenario?.hazard ? { ...scenario.hazard, source: 'sample' } : { source: 'none' },
    findings: {},
    card: {
      summary: null,
      problems: [],
      alerts: [],
      immediateActions: [],
      doNot: [],
      communicationGuide: null,
      resourcesNeeded: null,
      timeSensitive: null,
    },
    assignedResponderId: null,
    notes: [],
    timeline: [],
    callIds: [],
    origin: 'registry',
    updatedAt: new Date().toISOString(),
  };
}

let datasetSize = 0;

export function load() {
  const raw = readJson(config.peopleFile, []);
  const rawPeople = Array.isArray(raw) ? raw : raw.people || []; // { metadata, people: [...] } also works
  datasetSize = rawPeople.length;
  scenarios = readJson(config.scenariosFile, {});
  const all = rawPeople.map((r, i) => normalizePerson(r, i));
  const chosen = samplePeople(all, config.peopleSample, config.peopleSampleMode, config.peopleSampleSeed);
  people = new Map(chosen.map((p) => [p.id, p]));
  cases = new Map([...people.values()].map((p) => [p.id, withPriority(newCase(p))]));
  calls = new Map();
  responders = new Map(
    readJson(config.respondersFile, []).map((r) => [r.id, { ...r, status: 'available', assignedTo: null }]),
  );
  callSeq = 0;
  inboundSeq = 0;
  return { people: people.size, datasetSize, responders: responders.size };
}

export const getDatasetInfo = () => ({ file: config.peopleFile.split(/[\\/]/).pop(), size: datasetSize, loaded: people.size });

// ── Reads ────────────────────────────────────────────────────

export const getPerson = (id) => people.get(id);
export const getScenario = (id) => scenarios[id] || null;
export const getCaseRaw = (id) => cases.get(id);
export const getCall = (id) => calls.get(id);
export const getResponder = (id) => responders.get(id);

function withPriority(c) {
  c.priority = scoreCase(people.get(c.personId), c);
  return c;
}

/** What the dashboard receives for one person. */
export function caseView(id) {
  const c = cases.get(id);
  if (!c) return null;
  return { ...c, person: people.get(id) };
}

export function listCases() {
  return [...cases.keys()].map(caseView).sort(compareCases);
}

export const ACTIVE_CALL_STATUSES = ['dialing', 'ringing', 'sending', 'forwarding', 'in_progress'];

export function listCalls() {
  return [...calls.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function listResponders() {
  return [...responders.values()];
}

export function activeCallFor(personId, target) {
  return [...calls.values()].find(
    (c) => c.personId === personId && c.target === target && ACTIVE_CALL_STATUSES.includes(c.status),
  );
}

// ── Writes ───────────────────────────────────────────────────

export function updateCase(id, patchOrFn) {
  const c = cases.get(id);
  if (!c) throw new Error(`No case ${id}`);
  const patch = typeof patchOrFn === 'function' ? patchOrFn(c) : patchOrFn;
  const before = c.priority?.level;
  Object.assign(c, patch, { updatedAt: new Date().toISOString() });
  withPriority(c);
  if (before && before !== c.priority.level) {
    c.timeline = [...c.timeline, { at: new Date().toISOString(), kind: 'priority', text: `Priority ${before} → ${c.priority.level}` }];
  }
  broadcast('case', caseView(id));
  return c;
}

export function addTimeline(id, text, kind = 'info') {
  return updateCase(id, (c) => ({
    timeline: [...c.timeline, { at: new Date().toISOString(), kind, text }],
  }));
}

/** Add a person who wasn't in the dataset (e.g. from an inbound call). */
export function addPerson(raw) {
  const id = `IN-${String(++inboundSeq).padStart(3, '0')}`;
  const person = normalizePerson({ ...raw, id }, 0);
  people.set(id, person);
  const c = withPriority({ ...newCase(person), origin: 'inbound' });
  cases.set(id, c);
  broadcast('case', caseView(id));
  return person;
}

export function createCall(fields) {
  const id = `C${String(++callSeq).padStart(4, '0')}`;
  const call = {
    id,
    status: 'dialing',
    turns: [],
    extracted: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    ...fields,
  };
  calls.set(id, call);
  if (call.personId && cases.has(call.personId)) {
    const c = cases.get(call.personId);
    c.callIds = [...c.callIds, id];
  }
  broadcast('call', call);
  return call;
}

export function updateCall(id, patch) {
  const call = calls.get(id);
  if (!call) return null; // call was wiped by a reset
  Object.assign(call, patch);
  broadcast('call', call);
  return call;
}

export function addTurn(id, speaker, text) {
  const call = calls.get(id);
  if (!call) return null;
  call.turns.push({ speaker, text, at: new Date().toISOString() });
  broadcast('turn', { callId: id, turn: call.turns.at(-1), index: call.turns.length - 1 });
  return call;
}

export function setResponder(id, patch) {
  const r = responders.get(id);
  if (!r) return null;
  Object.assign(r, patch);
  broadcast('responder', r);
  return r;
}

/** Re-score everyone (the "silence since last contact" factor changes with time). */
export function rescoreAll() {
  for (const [id, c] of cases) {
    const before = `${c.priority.score}|${c.priority.level}`;
    withPriority(c);
    if (`${c.priority.score}|${c.priority.level}` !== before) broadcast('case', caseView(id));
  }
}
