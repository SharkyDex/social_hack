// ─────────────────────────────────────────────────────────────
//  callClient.js — the resident phone's side of a web call.
//
//  Talks to the server over a WebSocket (/ws): registers the device,
//  shows an incoming call, and once accepted streams the person's
//  speech up as short clips (the server transcribes them) while the
//  AI's replies come back as text and are spoken aloud here.
//
//  Hands-free, no headphones: the mic uses the browser's echo
//  cancellation, and while the AI is talking the mic is muted so it
//  never hears itself. Turn-taking is by simple silence detection.
// ─────────────────────────────────────────────────────────────

import { FromPhone } from '../../shared/webcall-protocol.js';

const START_THRESHOLD = 0.018; // volume to count as "speaking"
const END_SILENCE_MS = 750; // quiet for this long ends an utterance
const MAX_UTTERANCE_MS = 13000; // hard cap so nothing runs away
const MIN_CLIP_BYTES = 1600; // smaller than this is noise, not speech
const PING_MS = 20000;

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of types) if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  return '';
}

export function createWebCall({ onStatus, onHeard, onSaid, onError, lang = 'en-US' } = {}) {
  let ws = null;
  let deviceId = null;
  let name = '';
  let callId = null;
  let open = false;
  let closedByUs = false;
  let reconnectTimer = null;
  let pingTimer = null;
  const outbox = [];

  // audio state
  let stream = null;
  let audioCtx = null;
  let analyser = null;
  let vadTimer = null;
  let recorder = null;
  let chunks = [];
  let recMime = '';
  let speaking = false;
  let lastLoud = 0;
  let recStart = 0;
  let aiSpeaking = false;
  const sayQueue = [];

  const status = (s, extra) => onStatus?.(s, extra);

  // ── WebSocket ──────────────────────────────────────────────
  function sendWhenOpen(obj) {
    if (open && ws) ws.send(JSON.stringify(obj));
    else outbox.push(obj);
  }
  function flush() {
    while (outbox.length && open) ws.send(JSON.stringify(outbox.shift()));
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      open = true;
      status('connected');
      if (name) sendWhenOpen({ type: 'register', name }); // re-register after a reconnect
      flush();
      clearInterval(pingTimer);
      pingTimer = setInterval(() => sendWhenOpen({ type: 'ping' }), PING_MS);
    };
    ws.onclose = () => {
      open = false;
      clearInterval(pingTimer);
      if (closedByUs) return;
      status('offline');
      reconnectTimer = setTimeout(connect, 1500);
    };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      handle(msg);
    };
  }

  function handle(msg) {
    switch (msg.type) {
      case 'hello':
        deviceId = msg.deviceId;
        break;
      case 'registered':
        deviceId = msg.deviceId;
        name = msg.name;
        status('ready', { deviceId, name });
        break;
      case 'incoming_call':
        callId = msg.callId;
        status('incoming', { from: msg.from });
        break;
      case 'call_timeout':
        callId = null;
        status('ready', { deviceId, name });
        break;
      case 'say':
        enqueueSay(msg.text);
        break;
      case 'heard':
        onHeard?.(msg.text);
        break;
      case 'stt_error':
        onError?.(`Could not hear that (${msg.message})`);
        break;
      case 'call_ended':
        endCallLocal();
        break;
      default:
        break;
    }
  }

  // ── Call control ───────────────────────────────────────────
  function register(nm) {
    name = String(nm || '').trim().slice(0, 40);
    sendWhenOpen({ type: 'register', name });
  }

  async function accept() {
    if (!callId) return;
    sendWhenOpen({ type: 'accept', callId });
    status('connecting');
    try {
      await startAudio();
      status('in_call');
    } catch (e) {
      onError?.('Microphone blocked. Allow mic access and try again.');
      sendWhenOpen({ type: 'hangup', callId });
      callId = null;
      status('ready', { deviceId, name });
    }
  }

  function decline() {
    if (callId) sendWhenOpen({ type: 'decline', callId });
    callId = null;
    status('ready', { deviceId, name });
  }

  function hangup() {
    if (callId) sendWhenOpen({ type: 'hangup', callId });
    endCallLocal();
  }

  // SAFE / HELP buttons — a reliable channel when speech can't be heard.
  function button(value) {
    if (callId) sendWhenOpen({ type: FromPhone.BUTTON, callId, value });
  }

  function endCallLocal() {
    stopAudio();
    const had = callId;
    callId = null;
    status('ended');
    setTimeout(() => status('ready', { deviceId, name }), 1800);
    return had;
  }

  // ── Text-to-speech (the AI's voice) ────────────────────────
  function enqueueSay(text) {
    if (!text) return;
    sayQueue.push(text);
    if (!aiSpeaking) speakNext();
  }
  function speakNext() {
    const text = sayQueue.shift();
    if (text == null) {
      // done speaking — reopen the mic shortly (avoid catching the tail)
      setTimeout(() => {
        aiSpeaking = false;
        setMicEnabled(true);
      }, 300);
      return;
    }
    onSaid?.(text);
    aiSpeaking = true;
    setMicEnabled(false); // don't let the mic hear the AI
    if (!('speechSynthesis' in window)) {
      setTimeout(speakNext, Math.min(6000, 400 + text.length * 45));
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1;
    u.onend = speakNext;
    u.onerror = speakNext;
    try {
      window.speechSynthesis.speak(u);
    } catch {
      speakNext();
    }
  }

  // ── Microphone capture + silence detection ─────────────────
  function setMicEnabled(on) {
    stream?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  async function startAudio() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    recMime = pickMime();
    const buf = new Uint8Array(analyser.fftSize);

    vadTimer = setInterval(() => {
      if (aiSpeaking) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const vol = Math.sqrt(sum / buf.length);
      const now = Date.now();

      if (vol > START_THRESHOLD) {
        lastLoud = now;
        if (!speaking) {
          speaking = true;
          startSegment();
        }
      } else if (speaking && now - lastLoud > END_SILENCE_MS) {
        speaking = false;
        endSegment();
      }
      if (recorder && recorder.state === 'recording' && now - recStart > MAX_UTTERANCE_MS) {
        speaking = false;
        endSegment();
      }
    }, 50);
  }

  function startSegment() {
    try {
      chunks = [];
      recorder = new MediaRecorder(stream, recMime ? { mimeType: recMime } : undefined);
      recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recMime || 'audio/webm' });
        chunks = [];
        if (blob.size >= MIN_CLIP_BYTES && callId && !aiSpeaking) sendClip(blob);
      };
      recorder.start();
      recStart = Date.now();
    } catch (e) {
      onError?.('Recording failed on this browser.');
    }
  }

  function endSegment() {
    if (recorder && recorder.state === 'recording') recorder.stop();
  }

  async function sendClip(blob) {
    const b64 = await blobToBase64(blob);
    sendWhenOpen({ type: 'utterance', callId, mime: blob.type || recMime || 'audio/webm', audio: b64 });
  }

  function stopAudio() {
    clearInterval(vadTimer);
    vadTimer = null;
    speaking = false;
    aiSpeaking = false;
    sayQueue.length = 0;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      recorder.stop();
    }
    recorder = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    audioCtx?.close().catch(() => {});
    audioCtx = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────
  connect();
  return {
    register,
    accept,
    decline,
    hangup,
    button,
    get deviceId() {
      return deviceId;
    },
    destroy() {
      closedByUs = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      stopAudio();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
