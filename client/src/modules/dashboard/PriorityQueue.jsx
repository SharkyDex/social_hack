// The ordered list of people. Highest score first; resolved at the bottom.
import { useEffect, useMemo, useState } from 'react';
import { useActiveCalls, useLive } from '../../LiveState.jsx';
import { STATUS, timeAgo } from '../../format.js';

const FILTERS = [
  ['open', 'Open', (c) => c.status !== 'safe'],
  ['help', 'Needs help', (c) => c.status === 'needs_help'],
  ['unreachable', 'Unreachable', (c) => c.status === 'unreachable' || c.status === 'no_answer'],
  ['assigned', 'Assigned', (c) => c.status === 'responder_assigned'],
  ['new', 'Not contacted', (c) => c.status === 'not_contacted'],
  ['safe', 'Safe', (c) => c.status === 'safe'],
  ['all', 'All', () => true],
];

export default function PriorityQueue({ cases, selectedId, onSelect }) {
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [, tick] = useState(0);
  const { responders } = useLive();
  const activeCalls = useActiveCalls();
  const onCall = useMemo(() => new Set(activeCalls.map((c) => c.personId)), [activeCalls]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000); // refresh "5m ago"
    return () => clearInterval(t);
  }, []);

  const test = FILTERS.find((f) => f[0] === filter)[2];
  const needle = q.trim().toLowerCase();
  const shown = cases.filter(
    (c) =>
      test(c) &&
      (!needle ||
        c.person.name.toLowerCase().includes(needle) ||
        (c.person.address || '').toLowerCase().includes(needle) ||
        c.person.medicalHistory.join(' ').toLowerCase().includes(needle)),
  );

  return (
    <section className="panel queue" aria-label="Priority queue">
      <div className="queue-head">
        <div className="tabs small">
          {FILTERS.map(([k, label, fn]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
              {label} <span className="count">{cases.filter(fn).length}</span>
            </button>
          ))}
        </div>
        <input className="search" placeholder="Search name, street or condition" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <ol className="rows">
        {shown.map((c) => {
          const rank = cases.indexOf(c) + 1;
          const st = STATUS[c.status] || { label: c.status, tone: 'muted' };
          const responder = c.assignedResponderId ? responders[c.assignedResponderId] : null;
          return (
            <li key={c.personId}>
              <button
                className={`row lvl-${c.priority.level} ${selectedId === c.personId ? 'selected' : ''}`}
                onClick={() => onSelect(c.personId)}
              >
                <span className="rank mono">{c.priority.level === 'RESOLVED' ? '✓' : rank}</span>
                <span className="row-main">
                  <span className="row-top">
                    <span className="name">{c.person.name}</span>
                    <span className="muted small">
                      {c.person.age ?? 'age ?'}
                      {c.person.gender ? ` · ${c.person.gender[0]}` : ''}
                    </span>
                    {c.origin === 'inbound' && <span className="tag new">NEW · inbound</span>}
                    {c.origin === 'answered_call' && <span className="tag new">NEW · answered call</span>}
                    {['unverified', 'matched_name'].includes(c.identity?.status) && (
                      <span className="tag warn" title="Identity not verified">ID?</span>
                    )}
                    {onCall.has(c.personId) && (
                      <span className="tag live">
                        <i className="dot pulse" /> on call
                      </span>
                    )}
                  </span>
                  <span className="chips">
                    {c.needs.flags.slice(0, 5).map((f) => (
                      <span key={f.id} className={`chip ${f.power ? 'power' : ''}`} title={f.label}>
                        {f.chip}
                      </span>
                    ))}
                    {c.needs.preferredContact === 'sms' && (
                      <span className="chip sms" title="Contact by text">
                        SMS
                      </span>
                    )}
                  </span>
                  <span className="reason">{c.card.summary && c.status !== 'not_contacted' ? c.card.summary : c.priority.reason}</span>
                </span>
                <span className="row-side">
                  <span className={`level-badge lvl-${c.priority.level}`}>
                    {c.priority.level} <b className="mono">{c.priority.score}</b>
                  </span>
                  <span className={`status-pill tone-${st.tone}`}>{st.label}</span>
                  <span className="meta small muted">
                    {responder ? responder.id : <Attempts n={c.failedAttempts} reached={!!c.lastContactAt} />}
                    {' · '}
                    {timeAgo(c.lastContactAt || c.lastAttemptAt) || '—'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="muted empty">Nobody here.</li>}
      </ol>
    </section>
  );
}

function Attempts({ n, reached }) {
  return (
    <span className="attempts" title={`${n} unanswered attempt${n === 1 ? '' : 's'}`}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < n ? 'miss' : reached && i === n ? 'hit' : ''} />
      ))}
    </span>
  );
}
