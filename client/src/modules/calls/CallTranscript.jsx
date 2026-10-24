// A call or text thread as it happens. Used by the dashboard and the Calls page.
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { ACTIVE_CALL } from '../../LiveState.jsx';
import { CALL_STATUS, clock, firstName, formatPhone } from '../../format.js';

const SPEAKER_LABEL = {
  dispatcher: 'AI dispatcher',
  resident: 'Resident',
  contact: 'Emergency contact',
  caller: 'Caller',
  other: 'Answered by',
  system: 'System',
};

export function callTitle(call, person) {
  if (call.target === 'inbound') return person ? `Inbound · ${person.name}` : 'Inbound call';
  const who = call.target === 'emergency_contact' ? `${person?.emergencyContactName || 'Emergency contact'} → re ${firstName(person?.name)}` : person?.name;
  return `${call.channel === 'sms' ? 'Text' : 'Call'} · ${who || call.personId}`;
}

export default function CallTranscript({ call, person, compact = false }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const listRef = useRef(null);
  const active = ACTIVE_CALL.includes(call.status);
  const waitingForYou =
    call.mode === 'interactive' && call.status === 'in_progress' && !call.extracting && call.turns.at(-1)?.speaker === 'dispatcher';

  // Keep the newest line in view without scrolling the whole page.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [call.turns.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setErr(null);
    const text = reply;
    setReply('');
    try {
      await api.reply(call.id, text);
    } catch (e2) {
      setErr(e2.message);
      setReply(text);
    } finally {
      setBusy(false);
    }
  };

  const youAre = call.target === 'inbound' ? 'the caller' : call.target === 'emergency_contact' ? person?.emergencyContactName : firstName(person?.name);

  return (
    <div className={`transcript ${compact ? 'compact' : ''} ${active ? 'is-active' : ''}`}>
      <div className="transcript-head">
        <span className={`call-status s-${call.status}`}>
          {active && <i className="dot pulse" />}
          {call.extracting ? 'Updating card…' : CALL_STATUS[call.status] || call.status}
        </span>
        <span className="muted mono small">
          {call.id} · {call.channel === 'sms' ? 'SMS' : 'Voice'}
          {call.target !== 'inbound' && call.attempt ? ` · attempt ${call.attempt}` : ''}
          {call.mode === 'interactive' ? ' · interactive' : ''}
          {call.to && call.target !== 'inbound' ? ` · ${formatPhone(call.to)}` : ''}
          {' · '}
          {clock(call.startedAt)}
        </span>
      </div>

      <ol className="turns" ref={listRef}>
        {call.turns.map((t, i) => (
          <li key={i} className={`turn t-${t.speaker}`}>
            {t.speaker !== 'system' && <span className="who">{SPEAKER_LABEL[t.speaker] || t.speaker}</span>}
            <span className="what">{t.text}</span>
          </li>
        ))}
        {['ringing', 'dialing'].includes(call.status) && <li className="turn t-system typing">Ringing…</li>}
        {call.status === 'in_progress' && !waitingForYou && call.mode === 'auto' && <li className="turn t-system typing">…</li>}
      </ol>

      {waitingForYou && (
        <form className="reply" onSubmit={send}>
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={`Answer as ${youAre || 'the resident'}…`}
            disabled={busy}
          />
          <button className="btn primary" disabled={busy || !reply.trim()}>
            Send
          </button>
        </form>
      )}
      {err && <p className="error small">{err}</p>}

      {active && call.status !== 'forwarding' && (
        <div className="transcript-actions">
          <button className="btn ghost small" onClick={() => api.hangUp(call.id)}>
            {call.status === 'in_progress' ? 'Hang up' : 'Cancel'}
          </button>
        </div>
      )}

      {!compact && call.extracted?.problems?.length > 0 && (
        <div className="extracted">
          <span className="label">Problems found</span>
          <ul>
            {call.extracted.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
