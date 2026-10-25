// ─────────────────────────────────────────────────────────────
//  webcall.js — live calls over the internet, no phone number.
//
//  A resident's phone opens the PWA (/resident) and connects here over
//  a WebSocket as a "device". The dispatcher rings it; on Accept, the
//  person's speech is transcribed (Groq Whisper, with confidence) and
//  fed into the same turn loop a phone call would use. The AI's replies
//  come back as text and are spoken by the phone.
//
//  Transport only: the engine drives the conversation and calls
//  ring()/say()/end(); inbound events (accept, speech, button, hangup)
//  are handed back through the handlers set with setHandlers().
//
//  Nothing is saved: devices live in memory and vanish on disconnect.
//  Message shapes are defined in shared/webcall-protocol.js.
// ─────────────────────────────────────────────────────────────
import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { broadcast } from '../events.js';
import { transcribe } from '../ai/groq.js';
import { FromPhone, ToPhone } from '../../../shared/webcall-protocol.js';

const devices = new Map(); // deviceId → { id, name, ws, connectedAt, inCallId }
const pendingRings = new Map(); // callId → { resolve, deviceId, timer }
const callDevice = new Map(); // callId → deviceId
const callHints = new Map(); // callId → { prompt?, language? } for STT biasing

const RING_TIMEOUT_MS = 30_000;
const MIN_CLIP_BYTES = 1600;
const MIN_CONFIDENCE = 0.25; // below this we don't feed the words to the AI as-is

let handlers = { onUtterance() {}, onHangup() {}, onButton() {} };
export function setHandlers(h) {
  handlers = { ...handlers, ...h };
}

/** The engine sets a per-call STT hint (domain words + language) to sharpen recognition. */
export function setCallHint(callId, hint) {
  callHints.set(callId, hint || {});
}

const newId = () => 'D' + randomBytes(3).toString('hex');
const send = (ws, obj) => {
  try {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  } catch {
    /* socket went away */
  }
};

export function listDevices() {
  return [...devices.values()].map((d) => ({ id: d.id, name: d.name, connectedAt: d.connectedAt, inCall: Boolean(d.inCallId) }));
}
const announce = () => broadcast('devices', listDevices());

/** Ring a connected device. Resolves true on Accept, false on decline / no device / timeout. */
export function ring(callId, deviceId, { from = config.agencyName } = {}) {
  const device = devices.get(deviceId);
  if (!device || device.ws.readyState !== device.ws.OPEN) return Promise.resolve(false);
  if (device.inCallId) return Promise.resolve(false);

  device.inCallId = callId;
  callDevice.set(callId, deviceId);
  announce();
  send(device.ws, { type: ToPhone.INCOMING_CALL, callId, from });

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRings.delete(callId);
      send(device.ws, { type: ToPhone.CALL_TIMEOUT, callId });
      resolve(false);
    }, RING_TIMEOUT_MS);
    pendingRings.set(callId, { resolve, deviceId, timer });
  });
}

function settleRing(callId, answered) {
  const p = pendingRings.get(callId);
  if (!p) return;
  clearTimeout(p.timer);
  pendingRings.delete(callId);
  p.resolve(answered);
}

/** Speak a line on the device (its browser reads it aloud). */
export function say(callId, text) {
  const deviceId = callDevice.get(callId);
  const device = deviceId && devices.get(deviceId);
  if (device) send(device.ws, { type: ToPhone.SAY, callId, text });
}

/** End the call on the device side and clean up. */
export function end(callId) {
  settleRing(callId, false);
  callHints.delete(callId);
  const deviceId = callDevice.get(callId);
  callDevice.delete(callId);
  const device = deviceId && devices.get(deviceId);
  if (device) {
    if (device.inCallId === callId) device.inCallId = null;
    send(device.ws, { type: ToPhone.CALL_ENDED, callId });
    announce();
  }
}

async function onUtterance(device, msg) {
  const callId = msg.callId;
  if (!callId || device.inCallId !== callId || !callDevice.has(callId)) return;
  if (!msg.audio) return;
  let result;
  try {
    const buf = Buffer.from(msg.audio, 'base64');
    if (buf.length < MIN_CLIP_BYTES) return; // too short to be speech
    const hint = callHints.get(callId) || {};
    result = await transcribe(buf, { mime: msg.mime || 'audio/webm', language: hint.language || config.sttLanguage, prompt: hint.prompt });
  } catch (e) {
    console.warn('[webcall] transcription failed:', e.message);
    send(device.ws, { type: ToPhone.STT_ERROR, callId, message: e.message });
    return;
  }
  if (!result.text || result.confidence < MIN_CONFIDENCE) {
    // Heard something but couldn't make it out — let the phone show it, and let the engine
    // decide to ask for a repeat (low-confidence utterances flow through with the flag).
    if (result.text) send(device.ws, { type: ToPhone.HEARD, callId, text: result.text, unsure: true });
    if (result.text) safe(() => handlers.onUtterance(callId, result.text, { confidence: result.confidence, unsure: true }));
    return;
  }
  send(device.ws, { type: ToPhone.HEARD, callId, text: result.text });
  safe(() => handlers.onUtterance(callId, result.text, { confidence: result.confidence }));
}

const safe = (fn) => Promise.resolve().then(fn).catch((e) => console.error('[webcall] handler error:', e));

function onMessage(device, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  switch (msg.type) {
    case FromPhone.REGISTER: {
      device.name = String(msg.name || '').trim().slice(0, 40) || `Phone ${device.id.slice(1, 5)}`;
      send(device.ws, { type: ToPhone.REGISTERED, deviceId: device.id, name: device.name });
      announce();
      break;
    }
    case FromPhone.ACCEPT:
      settleRing(msg.callId, true);
      break;
    case FromPhone.DECLINE:
      settleRing(msg.callId, false);
      break;
    case FromPhone.UTTERANCE:
      onUtterance(device, msg);
      break;
    case FromPhone.BUTTON: {
      const callId = msg.callId;
      if (callId && device.inCallId === callId && callDevice.has(callId) && (msg.value === 'safe' || msg.value === 'help')) {
        const text = msg.value === 'help' ? 'I need help.' : 'I am safe.';
        send(device.ws, { type: ToPhone.HEARD, callId, text: `[${msg.value.toUpperCase()}] ${text}` });
        safe(() => handlers.onButton(callId, msg.value, text));
      }
      break;
    }
    case FromPhone.HANGUP: {
      const callId = msg.callId;
      settleRing(callId, false);
      if (callId && device.inCallId === callId) {
        device.inCallId = null;
        callDevice.delete(callId);
        callHints.delete(callId);
        announce();
        safe(() => handlers.onHangup(callId));
      }
      break;
    }
    case FromPhone.PING:
      send(device.ws, { type: ToPhone.PONG });
      break;
    default:
      break;
  }
}

/** Attach the WebSocket server to the HTTP server. Call once at startup. */
export function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    const device = { id: newId(), name: null, ws, connectedAt: new Date().toISOString(), inCallId: null };
    devices.set(device.id, device);
    send(ws, { type: ToPhone.HELLO, deviceId: device.id });

    ws.on('message', (raw) => onMessage(device, raw.toString()));
    ws.on('close', () => {
      devices.delete(device.id);
      const callId = device.inCallId;
      if (callId) {
        settleRing(callId, false);
        callDevice.delete(callId);
        callHints.delete(callId);
        safe(() => handlers.onHangup(callId));
      }
      announce();
    });
    ws.on('error', () => {});
  });
  console.log('  web-call WebSocket ready on /ws');
  return wss;
}
