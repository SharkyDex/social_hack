// The ordered list of people. Highest score first; resolved at the bottom.
import { useEffect, useMemo, useState } from 'react';
import { useActiveCalls, useLive } from '../../LiveState.jsx';
import { STATUS, timeAgo } from '../../format.js';
import { scoreCase } from '../../../../shared/priority.js';

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
  const { responders, simulation } = useLive();
  const activeCalls = useActiveCalls();
  const onCall = useMemo(() => new Set(activeCalls.map((c) => c.personId)), [activeCalls]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000); // refresh "5m ago"
    return () => clearInterval(t);
  }, []);

  const test = FILTERS.find((f) => f[0] === filter)[2];
  const needle = q.trim().toLowerCase();

  // This is a non-mutating preview: real case records and dispatch actions stay untouched.
  const simulationStage = simulation.minute >= 60
    ? { minute: 60, label: 'Collapse + secondary hazards', hazard: { buildingDamage: 'collapsed', intensity: 9, gasLeak: true, fire: false, roadsBlocked: true, powerOut: true } }
    : simulation.minute >= 45
      ? { minute: 45, label: 'Gas leak / unsafe building', hazard: { buildingDamage: 'severe', intensity: 8, gasLeak: true, fire: false, roadsBlocked: true, powerOut: true } }
      : simulation.minute >= 30
        ? { minute: 30, label: 'Severe damage / access blocked', hazard: { buildingDamage: 'severe', intensity: 8, gasLeak: false, fire: false, roadsBlocked: true, powerOut: true } }
        : simulation.minute >= 15
          ? { minute: 15, label: 'Strong shaking / moderate damage', hazard: { buildingDamage: 'moderate', intensity: 7, gasLeak: false, fire: false, roadsBlocked: false, powerOut: false } }
          : null;

  const displayCases = simulationStage
    ? cases.map((c) => {
        const base = scoreCase(c.person, c, Date.now());
        const previewCase = {
          ...c,
          status: c.status === 'safe' ? 'not_contacted' : c.status,
          hazard: { ...(c.hazard || {}), ...simulationStage.hazard, source: 'accelerated-simulation-preview' },
          // Hazards are shared across the scenario; person-specific findings remain person-specific.
          findings: { ...(c.findings || {}) },
        };
        const preview = scoreCase(c.person, previewCase, Date.now());
        return { ...c, simulationPreview: { base, result: preview, stage: simulationStage } };
      }).sort((a, b) => {
        const pa = a.simulationPreview.result;
        const pb = b.simulationPreview.result;
        const order = { CRITICAL: 0, HIGH: 1, STANDARD: 2, RESOLVED: 3 };
        return (order[pa.level] ?? 2) - (order[pb.level] ?? 2)
          || Number(pb.reviewRequired) - Number(pa.reviewRequired)
          || pb.score - pa.score;
      })
    : cases;

  const shown = displayCases.filter(
    (c) =>
      test(c) &&
      (!needle ||
        c.person.name.toLowerCase().includes(needle) ||
        (c.person.address || '').toLowerCase().includes(needle) ||
        c.person.medicalHistory.join(' ').toLowerCase().includes(needle)),
  );

  return (
    <section className="panel queue" aria-label="Priority queue">
      {simulation.running || simulation.minute > 0 ? (
        <div className="queue-sim-banner">
          <strong>{simulation.running ? '60-minute simulation running' : 'Simulation complete'}</strong>
          <span>T+{simulation.minute}/60 min · prioritisation preview for all residents · live records unchanged</span>
        </div>
      ) : null}
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
          const rank = displayCases.indexOf(c) + 1;
          const st = STATUS[c.status] || { label: c.status, tone: 'muted' };
          const rowLevel = c.simulationPreview?.result.level || c.priority.level;
          const responder = c.assignedResponderId ? responders[c.assignedResponderId] : null;
          return (
            <li key={c.personId}>
              <button
                className={`row lvl-${rowLevel} ${selectedId === c.personId ? 'selected' : ''}`}
                onClick={() => onSelect(c.personId)}
              >
                <span className="rank mono">{rowLevel === 'RESOLVED' ? '✓' : rank}</span>
                <span className="row-main">
                  <span className="row-top">
                    <span className="name">{c.person.name}</span>
                    <span className="muted small">
                      {c.person.age ?? '?'}
                      {c.person.gender ? ` · ${c.person.gender[0]}` : ''}
                    </span>
                    {c.origin === 'inbound' && <span className="tag new">NEW · inbound</span>}
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
                  <span className="reason">{c.simulationPreview
                    ? `Simulation T+${c.simulationPreview.stage.minute}: ${c.simulationPreview.stage.label}. ${((c.simulationPreview.result.score - c.simulationPreview.base.score) / 10) > 0.05 ? `Risk +${((c.simulationPreview.result.score - c.simulationPreview.base.score) / 10).toFixed(1)}/10` : ((c.simulationPreview.result.score - c.simulationPreview.base.score) / 10) < -0.05 ? `Risk ${((c.simulationPreview.result.score - c.simulationPreview.base.score) / 10).toFixed(1)}/10` : 'Risk unchanged'} · preview only`
                    : `${c.priority.reviewRequired ? '⚠ Verify uncertain case · ' : ''}${c.card.summary && c.status !== 'not_contacted' ? c.card.summary : c.priority.reason}`}</span>
                </span>
                <span className="row-side">
                  <span className={`level-badge lvl-${c.simulationPreview ? c.simulationPreview.result.level : c.priority.level}`}>
                    {c.simulationPreview ? c.simulationPreview.result.level : c.priority.level} <b className="mono">{(Number(c.simulationPreview ? c.simulationPreview.result.score : c.priority.score) / 10).toFixed(1)}/10</b>
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
