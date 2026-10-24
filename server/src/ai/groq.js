// ─────────────────────────────────────────────────────────────
//  groq.js — the one place the app talks to the AI.
//
//  Uses the shared GROQ_API_KEY from .env (never sent to the
//  browser). With no key the app runs in MOCK mode and the
//  callers fall back to scripted output (see mock.js).
//
//  The free tier has per-minute limits shared by everyone using
//  the same key, so requests go through a small queue and are
//  retried when Groq says "slow down" (HTTP 429).
// ─────────────────────────────────────────────────────────────
import { config } from '../config.js';

export const aiMode = () => (config.groqKey ? 'groq' : 'mock');

const MAX_IN_FLIGHT = 2;
let inFlight = 0;
const waiting = [];

async function slot() {
  if (inFlight < MAX_IN_FLIGHT) return void inFlight++;
  await new Promise((r) => waiting.push(r));
  inFlight++;
}
function release() {
  inFlight--;
  waiting.shift()?.();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {Array<{role:string, content:string}>} messages
 * @param {{maxTokens?:number, temperature?:number, json?:boolean}} opts
 * @returns {Promise<string>} the model's reply text
 */
export async function chat(messages, { maxTokens = 600, temperature = 0.4, json = false } = {}) {
  if (!config.groqKey) throw new Error('No GROQ_API_KEY set (mock mode)');
  await slot();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const body = {
        model: config.groqModel,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      let res;
      try {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groqKey}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * (attempt + 1);
        console.warn(`[groq] ${res.status}, retrying in ${wait}ms`);
        await sleep(Math.min(wait, 15000));
        continue;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Groq error ${res.status}`);
      return data.choices[0].message.content.trim();
    }
    throw new Error('Groq rate limit — gave up after retries');
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
