import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useLive } from '../../LiveState.jsx';
import InboundControls from '../calls/InboundControls.jsx';

export default function ControlBar() {
  const { cases, responders, round, meta } = useLive();
  const ds = meta?.dataset;
  const [confirmReset, setConfirmReset] = useState(false);

  const stats = useMemo(() => {
    const list = Object.values(cases);
    const by = (fn) => list.filter(fn).length;
    return {
      CRITICAL: by((c) => c.priority.level === 'CRITICAL'),
      HIGH: by((c) => c.priority.level === 'HIGH'),
      STANDARD: by((c) => c.priority.level === 'STANDARD'),
      needsHelp: by((c) => c.status === 'needs_help'),
      unreachable: by((c) => c.status === 'unreachable'),
      notContacted: by((c) => c.status === 'not_contacted'),
      safe: by((c) => c.status === 'safe'),
      total: list.length,
    };
  }, [cases]);

  const free = Object.values(responders).filter((r) => r.status === 'available').length;
  const total = Object.values(responders).length;

  return (
    <div className="controlbar">
      <div className="stats">
        <Stat label="Critical" value={stats.CRITICAL} tone="critical" />
        <Stat label="High" value={stats.HIGH} tone="high" />
        <Stat label="Standard" value={stats.STANDARD} tone="standard" />
        <span className="stat-sep" />
        <Stat label="Need help" value={stats.needsHelp} />
        <Stat label="Unreachable" value={stats.unreachable} />
        <Stat label="Not contacted" value={stats.notContacted} />
        <Stat label="Safe" value={stats.safe} />
        <span className="stat-sep" />
        <Stat label="Units free" value={`${free}/${total}`} />
        {ds && ds.size > ds.loaded && (
          <>
            <span className="stat-sep" />
            <Stat label={`of ${ds.size.toLocaleString()} people`} value={ds.loaded} />
          </>
        )}
      </div>
      <div className="controls">
        {round?.active ? (
          <div className="round-progress">
            <div className="bar">
              <span style={{ width: `${round.total ? (round.done / round.total) * 100 : 0}%` }} />
            </div>
            <span className="small mono">
              Checking {round.done}/{round.total}
            </span>
            <button className="btn ghost small" onClick={api.stopRound}>
              Stop
            </button>
          </div>
        ) : (
          <button className="btn primary" onClick={() => api.startRound()} disabled={!stats.notContacted}>
            Run welfare checks{stats.notContacted ? ` (${stats.notContacted})` : ''}
          </button>
        )}
        <InboundControls />
        {confirmReset ? (
          <span className="confirm">
            <button
              className="btn danger small"
              onClick={() => {
                api.reset();
                setConfirmReset(false);
              }}
            >
              Reset everything
            </button>
            <button className="btn ghost small" onClick={() => setConfirmReset(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button className="btn ghost" onClick={() => setConfirmReset(true)} title="Reload the dataset and clear all calls">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`stat ${tone ? `t-${tone}` : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
