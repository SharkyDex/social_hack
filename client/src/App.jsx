import { NavLink, Route, Routes } from 'react-router-dom';
import { useActiveCalls, useLive } from './LiveState.jsx';
import DashboardPage from './modules/dashboard/DashboardPage.jsx';
import CallsPage from './modules/calls/CallsPage.jsx';
import SimulationPage from './modules/simulation/SimulationPage.jsx';
import RoutingPage from './modules/routing/RoutingPage.jsx';

function StatusBadges() {
  const { meta, connected } = useLive();
  const active = useActiveCalls();
  if (!meta) return null;
  return (
    <div className="badges">
      <span className={`badge ${connected ? 'ok' : 'danger'}`} title="Live connection to the server">
        <i className="dot" /> {connected ? 'Live' : 'Reconnecting'}
      </span>
      <span className={`badge ${meta.aiMode === 'groq' ? 'info' : 'warn'}`} title={meta.aiMode === 'groq' ? meta.model : 'No GROQ_API_KEY — scripted calls'}>
        AI · {meta.aiMode === 'groq' ? `Groq${meta.aiKeys > 1 ? ` ×${meta.aiKeys}` : ''}` : 'Mock'}
      </span>
      <span className="badge muted" title="Phone service">
        Phone · {meta.telephony === 'simulated' ? 'Simulated' : meta.telephony}
      </span>
      <NavLink to="/calls" className={`badge ${active.length ? 'live' : 'muted'}`}>
        {active.length ? <i className="dot pulse" /> : null} {active.length} active call{active.length === 1 ? '' : 's'}
      </NavLink>
    </div>
  );
}

export default function App() {
  const { loaded, error } = useLive();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M2 17c3-5 6-5 10 0s7 5 10 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M6 13V7h12v6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand-name">DisasterBridge</span>
          <span className="brand-sub">Dispatch</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/calls">Calls</NavLink>
          <NavLink to="/simulation">Simulation</NavLink>
          <NavLink to="/routing">Routing</NavLink>
        </nav>
        <StatusBadges />
      </header>

      {error && !loaded ? (
        <div className="fullpage-msg">
          <h2>Can't reach the server</h2>
          <p>{error}</p>
          <p className="muted">Start it with <code>npm run dev</code> from the repo root.</p>
        </div>
      ) : !loaded ? (
        <div className="fullpage-msg muted">Loading…</div>
      ) : (
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/routing" element={<RoutingPage />} />
        </Routes>
      )}
    </div>
  );
}
