// The resident's phone screen: a PWA that behaves like a phone receiving a
// welfare-check call — ring, accept, talk hands-free, hang up. No phone number;
// it's all over the internet. Open /resident.html on the phone.
import { useEffect, useRef, useState } from 'react';
import { createWebCall } from './callClient.js';
import './resident.css';

const AGENCY = 'Emergency Services';
const params = new URLSearchParams(location.search);
const LANG = params.get('lang') || 'en-US';

export default function ResidentApp() {
  const [phase, setPhase] = useState('name'); // name → ready/incoming/connecting/in_call/ended/offline
  const [detail, setDetail] = useState({});
  const [name, setName] = useState('');
  const [said, setSaid] = useState('');
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const ctl = useRef(null);
  const ring = useRef(null);

  useEffect(() => {
    ctl.current = createWebCall({
      lang: LANG,
      onStatus: (s, extra) => {
        setDetail((d) => ({ ...d, ...extra }));
        if (s === 'ready') {
          setSaid('');
          setHeard('');
          setError('');
        }
        // Stay on the name screen until the person has gone online.
        setPhase((prev) => (prev === 'name' && s !== 'incoming' ? 'name' : s));
      },
      onSaid: (t) => setSaid(t),
      onHeard: (t) => setHeard(t),
      onError: (m) => setError(m),
    });
    return () => ctl.current?.destroy();
  }, []);

  // Ring + vibrate while a call is incoming.
  useEffect(() => {
    if (phase !== 'incoming') {
      stopRing(ring);
      return;
    }
    startRing(ring);
    const v = setInterval(() => navigator.vibrate?.([500, 300, 500]), 1400);
    navigator.vibrate?.([500, 300, 500]);
    return () => {
      stopRing(ring);
      clearInterval(v);
      navigator.vibrate?.(0);
    };
  }, [phase]);

  function goOnline(e) {
    e.preventDefault();
    // This tap unlocks audio + speech for the rest of the session.
    ring.current = makeAudio();
    primeSpeech();
    ctl.current.register(name);
    setPhase('ready');
  }

  if (phase === 'name') {
    return (
      <div className="screen name-screen">
        <div className="logo-dot" aria-hidden />
        <h1>DisasterBridge</h1>
        <p className="sub">Resident line — demo</p>
        <form onSubmit={goOnline}>
          <label htmlFor="nm">Your name</label>
          <input id="nm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Robert Chen" autoComplete="name" />
          <button className="big primary" type="submit">Go online</button>
        </form>
        <p className="fineprint">Going online lets this phone receive a welfare-check call. Your mic is used only during a call, and nothing is saved.</p>
      </div>
    );
  }

  if (phase === 'incoming') {
    return (
      <div className="screen call-screen ringing">
        <div className="caller">
          <div className="avatar pulse">☎</div>
          <div className="caller-name">{detail.from || AGENCY}</div>
          <div className="caller-sub">Incoming welfare check…</div>
        </div>
        <div className="call-actions">
          <button className="round decline" onClick={() => ctl.current.decline()} aria-label="Decline">✕</button>
          <button className="round accept" onClick={() => ctl.current.accept()} aria-label="Accept">✓</button>
        </div>
      </div>
    );
  }

  if (phase === 'connecting' || phase === 'in_call' || phase === 'ended') {
    const ended = phase === 'ended';
    return (
      <div className={`screen call-screen ${ended ? 'ended' : 'active'}`}>
        <div className="caller">
          <div className="avatar">☎</div>
          <div className="caller-name">{detail.from || AGENCY}</div>
          <div className="caller-sub">
            {ended ? 'Call ended' : phase === 'connecting' ? 'Connecting…' : <LiveIndicator saidActive={!!said} />}
          </div>
        </div>

        {!ended && (
          <div className="bubbles">
            {said && <div className="bubble them"><span className="who">{AGENCY}</span>{said}</div>}
            {heard && <div className="bubble me"><span className="who">You said</span>{heard}</div>}
            {!said && !heard && <div className="hint">Speak normally — say “hello”. Hold the phone to your ear or use speaker.</div>}
          </div>
        )}
        {error && <div className="err">{error}</div>}

        {phase === 'in_call' && (
          <div className="quick-replies">
            <span className="qr-label">Can't talk? Tap:</span>
            <button className="pill safe" onClick={() => ctl.current.button('safe')}>I'm safe</button>
            <button className="pill help" onClick={() => ctl.current.button('help')}>I need help</button>
          </div>
        )}

        {!ended && (
          <div className="call-actions one">
            <button className="round decline" onClick={() => ctl.current.hangup()} aria-label="Hang up">✕</button>
          </div>
        )}
      </div>
    );
  }

  // ready / offline
  const online = phase === 'ready';
  return (
    <div className="screen ready-screen">
      <div className={`status-dot ${online ? 'on' : 'off'}`} />
      <h2>{online ? "You're online" : 'Reconnecting…'}</h2>
      <p className="sub">{online ? 'Waiting for a welfare-check call.' : 'Trying to reach the server.'}</p>
      {detail.name && <p className="device">This phone: <strong>{detail.name}</strong></p>}
      <p className="fineprint">Keep this screen open. When the dispatcher calls, your phone will ring.</p>
    </div>
  );
}

function LiveIndicator() {
  return (
    <span className="live-ind">
      <i className="bar" /><i className="bar" /><i className="bar" /> On call
    </span>
  );
}

// ── Ringtone (WebAudio, no asset) ─────────────────────────────
function makeAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return { ctx, timer: null };
  } catch {
    return null;
  }
}
function startRing(ref) {
  const a = ref.current;
  if (!a?.ctx) return;
  const beep = () => {
    const { ctx } = a;
    const t0 = ctx.currentTime;
    [0, 0.4].forEach((off) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 480 + off * 0; // classic double-ring, two tones
      o.frequency.setValueAtTime(off === 0 ? 480 : 620, t0 + off);
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.33);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + off);
      o.stop(t0 + off + 0.35);
    });
  };
  beep();
  a.timer = setInterval(beep, 2000);
}
function stopRing(ref) {
  const a = ref.current;
  if (a?.timer) clearInterval(a.timer);
  if (a) a.timer = null;
}
function primeSpeech() {
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {
    /* ignore */
  }
}
