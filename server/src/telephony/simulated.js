// Simulated phone service: nothing leaves the app, costs $0.
// Whether someone "picks up" comes from the sample scenario file,
// so the demo is the same every time (e.g. Robert never answers).
import { getScenario } from '../store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stable pseudo-random answer for people with no scenario (e.g. the real dataset).
function hashAnswers(id, attempt) {
  let h = 0;
  for (const ch of `${id}:${attempt}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 6 !== 0; // ~83% pick up
}

function answers(personId, attempt, target) {
  const s = getScenario(personId);
  if (target === 'emergency_contact') return s ? s.contactAnswers !== false : hashAnswers(`${personId}-ec`, attempt);
  if (!s) return hashAnswers(personId, attempt);
  const a = s.answers || [true];
  return a[Math.min(attempt - 1, a.length - 1)] !== false;
}

export const simulated = {
  name: 'simulated',
  live: false,
  async placeCall({ personId, attempt, target }) {
    await sleep(2500); // ringing
    return { answered: answers(personId, attempt, target) };
  },
  async sendSms({ personId, attempt, target }) {
    await sleep(1500);
    return { replied: answers(personId, attempt, target) };
  },
};
