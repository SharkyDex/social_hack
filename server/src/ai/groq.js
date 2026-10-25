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

// Phrases Whisper tends to invent on silence/noise — dropped when confidence is low.
const HALLUCINATIONS = [
  /^thank you\.?$/i, /^thanks for watching\.?$/i, /^please subscribe\.?$/i,
  /^you\.?$/i, /^\.+$/, /^bye\.?$/i, /^okay\.?$/i, /^\s*♪.*♪\s*$/,
];

/** Turn a verbose_json response into { text, confidence, noSpeech }, filtering likely hallucinations. */
function scoreTranscript(data) {
  const text = (data.text || '').trim();
  const segs = data.segments || [];
  const noSpeech = segs.length ? Math.max(...segs.map((s) => s.no_speech_prob ?? 0)) : text ? 0 : 1;
  const avgLogprob = segs.length ? segs.reduce((a, s) => a + (s.avg_logprob ?? -1), 0) / segs.length : -1;
  const compression = segs.length ? Math.max(...segs.map((s) => s.compression_ratio ?? 0)) : 0;
  let confidence = Math.max(0, Math.min(1, (avgLogprob + 1.2) / 1.1)); // ~-0.1 good … ~-1.2 poor
  if (compression > 2.4) confidence = Math.min(confidence, 0.3); // runaway repetition
  if (noSpeech > 0.6) confidence = Math.min(confidence, 0.2);
  const dropped = !text || (confidence < 0.5 && HALLUCINATIONS.some((r) => r.test(text)));
  return { text: dropped ? '' : text, confidence: dropped ? 0 : Number(confidence.toFixed(2)), noSpeech };
}

/**
 * Speech-to-text with Groq Whisper, for live web calls. Returns the transcript
 * plus a confidence score (from Whisper's own segment stats) so the caller can
 * treat noisy, low-confidence audio differently — important in a disaster where
 * voices won't be clear. `prompt` biases recognition toward expected words
 * (the person's name, "trapped", "gas", …).
 * @param {Buffer|Uint8Array} audio
 * @param {{mime?:string, filename?:string, language?:string, prompt?:string}} opts
 * @returns {Promise<{text:string, confidence:number, noSpeech:number}>}
 */
export async function transcribe(audio, { mime = 'audio/webm', filename = 'clip.webm', language, prompt } = {}) {
  if (!config.groqKey) throw new Error('No GROQ_API_KEY set (mock mode) — speech-to-text needs a key');
  await slot();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const form = new FormData();
      form.append('file', new Blob([audio], { type: mime }), filename);
      form.append('model', config.whisperModel);
      form.append('response_format', 'verbose_json');
      if (language && language !== 'auto') form.append('language', language);
      if (prompt) form.append('prompt', prompt);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      let res;
      try {
        res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.groqKey}` }, // FormData sets its own Content-Type
          body: form,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * (attempt + 1);
        console.warn(`[groq] STT ${res.status}, retrying in ${wait}ms`);
        await sleep(Math.min(wait, 15000));
        continue;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Groq STT error ${res.status}`);
      return scoreTranscript(data);
    }
    throw new Error('Groq STT rate limit — gave up after retries');
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

// ── Separate reasoning provider (OpenAI-compatible, e.g. GLM 5.3 on Baseten) ──
//  Used only for extraction AFTER a live call, where latency doesn't matter and
//  a stronger reasoning model gives better findings. Off unless configured.
export const reasoningEnabled = () =>
  Boolean(config.reasoning.baseUrl && config.reasoning.key && config.reasoning.model);

let effortSupported = true; // some providers reject the reasoning_effort field

async function reasoningChat(messages, { maxTokens = 900, json = false } = {}) {
  const r = config.reasoning;
  const body = { model: r.model, messages, max_tokens: maxTokens, temperature: 0.1, ...(json ? { response_format: { type: 'json_object' } } : {}) };
  if (effortSupported && r.effort) body.reasoning_effort = r.effort; // low/high/max — low keeps cost + latency down
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000); // reasoning is slow, but it's post-call
  let res;
  try {
    res = await fetch(`${r.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r.key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Reasoning provider error ${res.status}`;
    if (res.status === 400 && effortSupported && /reasoning_effort|unrecognized|unexpected|unknown|parameter|not permitted/i.test(msg)) {
      effortSupported = false; // drop the field and retry once
      return reasoningChat(messages, { maxTokens, json });
    }
    throw new Error(msg);
  }
  return (data.choices?.[0]?.message?.content || '').trim();
}

/** JSON extraction via the reasoning provider, tolerating ```json fences and <think> blocks. */
export async function reasoningChatJson(messages, opts = {}) {
  let raw;
  try {
    raw = await reasoningChat(messages, { ...opts, json: true });
  } catch (e) {
    if (!/response_format|json/i.test(e.message)) throw e;
    raw = await reasoningChat(messages, { ...opts });
  }
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  return JSON.parse(clean.slice(start, end + 1));
}
