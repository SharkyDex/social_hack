// Phones connected over the internet (the resident PWA, /resident.html).
// The dispatcher can place a live web call to any of them — no phone number.
import { useState } from 'react';
import { useLive } from '../../LiveState.jsx';
import { api } from '../../api.js';

export default function DevicesPanel() {
  const { devices, meta } = useLive();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  const call = async (d) => {
    setErr('');
    setBusy(d.id);
    try {
      await api.webCall(d.id, d.name);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const noAi = meta && meta.aiMode !== 'groq';

  return (
    <section className="panel devices-panel">
      <header className="devices-head">
        <h3>Connected phones · {devices.length}</h3>
        <span className="muted small">Live web calls over the internet</span>
      </header>

      {noAi && (
        <p className="muted small">Live web calls need a <code>GROQ_API_KEY</code> (speech-to-text + AI). Add one to <code>.env</code> and restart.</p>
      )}

      {devices.length === 0 ? (
        <p className="muted empty">
          No phones connected. Open <code>/resident.html</code> on a phone (over the HTTPS tunnel) and tap <strong>Go online</strong>.
        </p>
      ) : (
        <ul className="device-list">
          {devices.map((d) => (
            <li key={d.id}>
              <span className="device-dot" aria-hidden />
              <span className="device-name">{d.name || d.id}</span>
              {d.inCall ? (
                <span className="badge live"><i className="dot pulse" /> on call</span>
              ) : (
                <button className="btn small" disabled={busy === d.id || noAi} onClick={() => call(d)}>
                  {busy === d.id ? 'Ringing…' : 'Call'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {err && <p className="err-line small">{err}</p>}
    </section>
  );
}
