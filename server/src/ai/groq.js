// ─────────────────────────────────────────────────────────────
//  groq.js — the one place the app talks to the AI.
//
//  Uses the Groq key(s) from .env (never sent to the browser).
//  With several keys, requests rotate across them; a key that hits
//  its rate limit (429) rests until Groq says it's ready, and an
//  invalid key (401) is set aside. With no key the app runs in MOCK
//  mode and callers fall back to scripted output (see mock.js).
// ─────────────────────────────────────────────────────────────
import { config } from '../config.js';

export const aiMode = () => (config.groqKeys.length ? 'groq' : 'mock');
export const keyCount = () => config.groqKeys.length;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Key rotation ─────────────────────────────────────────────
const restingUntil = new Map(); // key → timestamp it can be used again
let nextIndex = 0;
const label = (key) => `key #${config.groqKeys.indexOf(key) + 1}`;

/** Next usable key in rotation, or the time to wait for the soonest one. */
function pickKey() {
  const keys = config.groqKeys;
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const idx = (nextIndex + i) % keys.length;
    if ((restingUntil.get(keys[idx]) || 0) <= now) {
      nextIndex = (idx + 1) % keys.length;
      return { key: keys[idx] };
    }
  }
  const soonest = Math.min(...keys.map((k) => restingUntil.get(k) || 0));
  return { waitMs: Math.max(250, soonest - now) };
}

export function keyStatus() {
  const now = Date.now();
  return config.groqKeys.map((k) => ({ key: label(k), ready: (restingUntil.get(k) || 0) <= now }));
}

// ── Concurrency: ~2 requests in flight per key ───────────────
let inFlight = 0;
const waiting = [];
const maxInFlight = () => Math.min(8, Math.max(2, config.groqKeys.length * 2));
async function slot() {
  if (inFlight < maxInFlight()) return void inFlight++;
  await new Promise((r) => waiting.push(r));
  inFlight++;
}
function release() {
  inFlight--;
  waiting.shift()?.();
}

/**
 * @param {Array<{role:string, content:string}>} messages
 * @param {{maxTokens?:number, temperature?:number, json?:boolean}} opts
 * @returns {Promise<string>} the model's reply text
 */
export async function chat(messages, { maxTokens = 600, temperature = 0.4, json = false } = {}) {
  if (!config.groqKeys.length) throw new Error('No GROQ_API_KEY set (mock mode)');
  await slot();
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const pick = pickKey();
      if (!pick.key) {
        if (pick.waitMs > 20000) throw new Error('All Groq keys are rate-limited — try again shortly');
        await sleep(pick.waitMs);
        continue;
      }
      const key = pick.key;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      let res;
      try {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: config.groqModel,
            messages,
            max_tokens: maxTokens,
            temperature,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429) {
        const wait = (Number(res.headers.get('retry-after')) || 5) * 1000;
        restingUntil.set(key, Date.now() + wait);
        console.warn(`[groq] ${label(key)} rate-limited, resting ${Math.round(wait / 1000)}s`);
        continue; // try the next key straight away
      }
      if (res.status === 401 || res.status === 403) {
        restingUntil.set(key, Date.now() + 10 * 60_000);
        console.warn(`[groq] ${label(key)} was rejected (invalid or revoked) — skipping it for 10 min`);
        continue;
      }
      if (res.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Groq error ${res.status}`);
      return data.choices[0].message.content.trim();
    }
    throw new Error('Groq request failed after retries');
  } finally {
    release();
  }
}

/** Ask for JSON and parse it, tolerating ```json fences. */
export async function chatJson(messages, opts = {}) {
  let raw;
  try {
    raw = await chat(messages, { ...opts, json: true, temperature: 0.1 });
  } catch (e) {
    // Some models reject response_format — retry as plain text.
    if (!/response_format|json/i.test(e.message)) throw e;
    raw = await chat(messages, { ...opts, temperature: 0.1 });
  }
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  return JSON.parse(clean.slice(start, end + 1));
}
