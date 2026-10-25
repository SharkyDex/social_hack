// ─────────────────────────────────────────────────────────────
//  webcall-protocol.js — the WebSocket message vocabulary for live
//  web calls, shared by the server (telephony/webcall.js) and the
//  phone client (resident app, and later the Android APK, which is
//  the same web code). Keep both sides in step by importing from here
//  instead of hard-coding the strings.
// ─────────────────────────────────────────────────────────────

/** Messages the phone sends to the server. */
export const FromPhone = Object.freeze({
  REGISTER: 'register', // { name }
  ACCEPT: 'accept', // { callId }
  DECLINE: 'decline', // { callId }
  UTTERANCE: 'utterance', // { callId, mime, audio(base64) }
  BUTTON: 'button', // { callId, value: 'safe' | 'help' }  — spoken-word fallback
  HANGUP: 'hangup', // { callId }
  PING: 'ping',
});

/** Messages the server sends to the phone. */
export const ToPhone = Object.freeze({
  HELLO: 'hello', // { deviceId }
  REGISTERED: 'registered', // { deviceId, name }
  INCOMING_CALL: 'incoming_call', // { callId, from }
  CALL_TIMEOUT: 'call_timeout', // { callId }
  SAY: 'say', // { callId, text }   — speak this on the phone (TTS)
  HEARD: 'heard', // { callId, text } — what we transcribed (for display)
  STT_ERROR: 'stt_error', // { callId, message }
  CALL_ENDED: 'call_ended', // { callId }
  PONG: 'pong',
});

/** Urgent words to flag straight away even if the transcript is otherwise poor. */
export const URGENT_KEYWORDS = Object.freeze([
  'help', 'trapped', 'stuck', 'gas', 'fire', 'smoke', 'bleeding', 'blood',
  'hurt', 'injured', 'broken', "can't breathe", 'cant breathe', 'chest pain',
  'collapsed', 'unconscious', 'not breathing', 'emergency',
]);
