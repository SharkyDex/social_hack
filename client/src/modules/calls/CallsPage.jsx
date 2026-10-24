// Every call and text: live ones on top, history below.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACTIVE_CALL, useLive } from '../../LiveState.jsx';
import CallTranscript, { callTitle } from './CallTranscript.jsx';
import InboundControls from './InboundControls.jsx';

export default function CallsPage() {
  const { calls, cases } = useLive();
  const [filter, setFilter] = useState('all');

  const list = useMemo(() => {
    const all = Object.values(calls).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return all.filter((c) =>
      filter === 'all' ? true : filter === 'inbound' ? c.target === 'inbound' : filter === 'sms' ? c.channel === 'sms' : c.status === 'no_answer',
    );
  }, [calls, filter]);

  const active = list.filter((c) => ACTIVE_CALL.includes(c.status) || c.extracting);
  const done = list.filter((c) => !(ACTIVE_CALL.includes(c.status) || c.extracting));

  return (
    <main className="page calls-page">
      <div className="page-head">
        <div>
          <h1>Calls &amp; texts</h1>
          <p className="muted">Welfare checks placed by the AI, and incoming calls (911 first, AI intake only if nobody answers).</p>
        </div>
        <InboundControls />
      </div>

      <div className="tabs">
        {[
          ['all', 'All'],
          ['inbound', 'Inbound'],
          ['sms', 'Texts'],
          ['no_answer', 'No answer'],
        ].map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      <h2 className="section-title">Live now · {active.length}</h2>
      {active.length === 0 && <p className="muted empty">No live calls. Start a welfare check round from the dashboard.</p>}
      <div className="call-grid">
        {active.map((c) => (
          <CallCard key={c.id} call={c} person={cases[c.personId]?.person} />
        ))}
      </div>

      <h2 className="section-title">History · {done.length}</h2>
      <div className="call-grid">
        {done.map((c) => (
          <CallCard key={c.id} call={c} person={cases[c.personId]?.person} compact />
        ))}
      </div>
    </main>
  );
}

function CallCard({ call, person, compact }) {
  return (
    <section className="panel call-card">
      <header>
        <h3>{callTitle(call, person)}</h3>
        {call.personId && (
          <Link className="small" to={`/?person=${call.personId}`}>
            Open card →
          </Link>
        )}
      </header>
      <CallTranscript call={call} person={person} compact={compact} />
    </section>
  );
}
