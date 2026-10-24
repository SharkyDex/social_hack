// Everything about one person: why they rank where they do, the responder
// card built from calls, live call, actions, notes and history.
import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { ACTIVE_CALL, useLive } from '../../LiveState.jsx';
import { STATUS, clock, firstName, formatPhone } from '../../format.js';
import CallTranscript, { callTitle } from '../calls/CallTranscript.jsx';

export default function CaseDetail({ c }) {
  const { calls, responders } = useLive();
  const p = c.person;
  const st = STATUS[c.status] || { label: c.status, tone: 'muted' };
  const personCalls = useMemo(
    () => c.callIds.map((id) => calls[id]).filter(Boolean).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [c.callIds, calls],
  );
  const live = personCalls.filter((x) => ACTIVE_CALL.includes(x.status) || x.extracting);
  const past = personCalls.filter((x) => !live.includes(x));

  return (
    <section className={`panel detail lvl-${c.priority.level}`} aria-label={`${p.name} details`}>
      <header className="detail-head">
        <div>
          <h2>
            {p.name}
            {c.origin === 'inbound' && <span className="tag new">from inbound call</span>}
          </h2>
          <p className="muted">
            {[p.age != null && `${p.age}`, p.gender, p.address || 'Address not set'].filter(Boolean).join(' · ')}
          </p>
          <p className="muted small mono">
            {formatPhone(p.phone)}
            {c.needs.preferredContact === 'sms' ? ' · prefers text' : ''}
            {p.livesAlone ? ' · lives alone' : ''}
            {` · mobility: ${c.needs.mobility}`}
          </p>
        </div>
        <div className="detail-head-side">
          <span className={`level-badge big lvl-${c.priority.level}`}>
            {c.priority.level} <b className="mono">{c.priority.score}</b>
          </span>
          <span className={`status-pill tone-${st.tone}`}>{st.label}</span>
        </div>
      </header>

      <Actions c={c} responders={responders} hasLive={live.length > 0} />

      {live.map((call) => (
        <div key={call.id} className="live-call">
          <h3 className="section-title">
            <i className="dot pulse" /> {callTitle(call, p)}
          </h3>
          <CallTranscript call={call} person={p} />
        </div>
      ))}

      <div className="detail-grid">
        <ResponderCard c={c} responders={responders} />
        <PriorityBreakdown priority={c.priority} hazard={c.hazard} />
      </div>

      <Notes c={c} />

      <div className="detail-grid">
        <section className="sub">
          <h3 className="section-title">Calls &amp; texts · {past.length}</h3>
          {past.length === 0 && <p className="muted small">None yet.</p>}
          {past.map((call) => (
            <details key={call.id} className="past-call">
              <summary>
                <span>{callTitle(call, p)}</span>
                <span className={`call-status s-${call.status}`}>{call.status.replace('_', ' ')}</span>
                <span className="muted small mono">{clock(call.startedAt)}</span>
              </summary>
              <CallTranscript call={call} person={p} compact />
            </details>
          ))}
        </section>
        <Timeline items={c.timeline} />
      </div>
    </section>
  );
}

function Actions({ c, responders, hasLive }) {
  const [err, setErr] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const id = c.personId;
  const p = c.person;
  const run = (fn) => async () => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    }
  };
  const free = Object.values(responders).filter((r) => r.status === 'available');
  const assigned = c.assignedResponderId ? responders[c.assignedResponderId] : null;
  const prefersText = c.needs.preferredContact === 'sms';

  return (
    <div className="actions">
      <div className="action-group">
        <button className="btn primary" disabled={hasLive} onClick={run(() => (prefersText ? api.text(id) : api.call(id)))}>
          {prefersText ? 'Text (AI)' : 'Call (AI)'}
        </button>
        <button
          className="btn"
          disabled={hasLive}
          onClick={run(() => (prefersText ? api.text(id, 'interactive') : api.call(id, 'interactive')))}
          title={`You type ${firstName(p.name)}'s answers`}
        >
          {prefersText ? 'Text — I reply' : "Call — I'll answer"}
        </button>
        {!prefersText && (
          <button className="btn" disabled={hasLive} onClick={run(() => api.text(id))}>
            Send text
          </button>
        )}
        <button className="btn" disabled={!p.emergencyContactNumber} onClick={run(() => api.callContact(id))} title={p.emergencyContacts?.[0]?.name || p.emergencyContactName || 'No emergency contact'}>
          Call contact
        </button>
      </div>
      <div className="action-group">
        {assigned ? (
          <>
            <span className="assigned">
              <b>{assigned.name}</b> <span className="muted small">{assigned.type}</span>
            </span>
            <button className="btn ghost small" onClick={run(() => api.release(id))}>
              Release
            </button>
          </>
        ) : assigning ? (
          <select
            autoFocus
            className="select"
            defaultValue=""
            onBlur={() => setAssigning(false)}
            onChange={(e) => {
              setAssigning(false);
              if (e.target.value) run(() => api.assign(id, e.target.value))();
            }}
          >
            <option value="" disabled>
              Choose a unit…
            </option>
            {free.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.type}
              </option>
            ))}
          </select>
        ) : (
          <button className="btn" disabled={!free.length || c.status === 'safe'} onClick={() => setAssigning(true)}>
            Assign responder{free.length ? '' : ' (none free)'}
          </button>
        )}
        {c.status === 'safe' ? (
          <button className="btn ghost" onClick={run(() => api.reopen(id))}>
            Reopen
          </button>
        ) : (
          <button className="btn ok" onClick={run(() => api.markSafe(id))}>
            Mark safe
          </button>
        )}
      </div>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

function ResponderCard({ c, responders }) {
  const p = c.person;
  const card = c.card;
  const nothingYet = !card.summary && !card.problems.length;
  return (
    <section className="sub card">
      <h3 className="section-title">Responder card</h3>
      {card.summary ? <p className="summary">{card.summary}</p> : <p className="muted small">Nothing from calls yet — run a welfare check.</p>}

      {card.timeSensitive && (
        <p className="time-sensitive">
          <span className="label">Time-sensitive</span> {card.timeSensitive}
        </p>
      )}
      <List label="Problems" items={card.problems} tone="danger" />
      <List label="Alerts" items={card.alerts} tone="warn" />
      <List label="Do now" items={card.immediateActions} />
      <List label="Do not" items={card.doNot} tone="muted" />
      {card.communicationGuide && <Field label="How to communicate" value={card.communicationGuide} />}
      {card.resourcesNeeded && <Field label="Resources needed" value={card.resourcesNeeded} />}

      <div className={`facts ${nothingYet ? '' : 'sep'}`}>
        <Field label="Medical history" value={p.medicalHistory.join(' · ') || 'None recorded'} />
        <div className="chips">
          {c.needs.flags.map((f) => (
            <span key={f.id} className={`chip ${f.power ? 'power' : ''}`}>
              {f.chip} <span className="chip-label">{f.label}</span>
            </span>
          ))}
        </div>
        <Field
          label={p.emergencyContacts?.length > 1 ? 'Emergency contacts' : 'Emergency contact'}
          value={
            p.emergencyContacts?.length
              ? p.emergencyContacts.map((ec) => `${ec.name} · ${formatPhone(ec.number)}`).join('  ·  ') + (c.contactReached ? ' · reached' : '')
              : 'None on file'
          }
        />
        {c.assignedResponderId && <Field label="Assigned" value={`${responders[c.assignedResponderId]?.name} (${responders[c.assignedResponderId]?.type})`} />}
      </div>
    </section>
  );
}

function PriorityBreakdown({ priority, hazard }) {
  const max = Math.max(...priority.factors.map((f) => Math.abs(f.points)), 1);
  return (
    <section className="sub">
      <h3 className="section-title">Why this priority</h3>
      <ul className="factors">
        {priority.factors.map((f, i) => (
          <li key={i} className={`k-${f.kind} ${f.points < 0 ? 'neg' : ''}`}>
            <span className="f-label">{f.label}</span>
            <span className="f-bar">
              <span style={{ width: `${(Math.abs(f.points) / max) * 100}%` }} />
            </span>
            <span className="f-pts mono">
              {f.points > 0 ? '+' : ''}
              {f.points}
            </span>
          </li>
        ))}
        {priority.factors.length === 0 && <li className="muted small">No risk factors.</li>}
      </ul>
      <p className="muted small total">
        Total <b className="mono">{priority.score}</b> · CRITICAL ≥ 60 · HIGH ≥ 35
      </p>
      <p className="muted small hazard-note">
        Damage at home:{' '}
        {[
          hazard?.buildingDamage && hazard.buildingDamage !== 'none' ? `building ${hazard.buildingDamage}` : null,
          hazard?.intensity ? `shaking MMI ${hazard.intensity}` : null,
          hazard?.gasLeak ? 'gas leak' : null,
          hazard?.fire ? 'fire' : null,
          hazard?.powerOut ? 'power out' : null,
          hazard?.roadsBlocked ? 'roads blocked' : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'none reported'}
        {' — '}
        {hazard?.source === 'simulation' ? 'live from the simulation' : hazard?.source === 'sample' ? 'sample placeholder until the simulation is connected' : 'no data'}
      </p>
    </section>
  );
}

function Notes({ c }) {
  const [text, setText] = useState('');
  const save = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await api.addNote(c.personId, text);
    setText('');
  };
  return (
    <section className="sub notes">
      <h3 className="section-title">Dispatcher notes</h3>
      {c.notes.map((n, i) => (
        <p key={i} className="note">
          <span className="muted small mono">{clock(n.at)}</span> {n.text}
        </p>
      ))}
      <form onSubmit={save} className="reply">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" />
        <button className="btn" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

function Timeline({ items }) {
  return (
    <section className="sub">
      <h3 className="section-title">Timeline</h3>
      <ol className="timeline">
        {[...items].reverse().map((t, i) => (
          <li key={i} className={`tl-${t.kind}`}>
            <span className="muted small mono">{clock(t.at)}</span>
            <span>{t.text}</span>
          </li>
        ))}
        {items.length === 0 && <li className="muted small">Nothing yet.</li>}
      </ol>
    </section>
  );
}

function List({ label, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className={`list tone-${tone || 'default'}`}>
      <span className="label">{label}</span>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <p className="field">
      <span className="label">{label}</span> {value}
    </p>
  );
}
