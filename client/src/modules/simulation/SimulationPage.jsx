// Earthquake simulation handoff page plus a local, non-mutating triage scenario lab.
// The comparison tool previews how evidence changes risk; it does not write hazards
// back to the live dispatcher state or replace the teammate-owned 3D simulation.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLive } from '../../LiveState.jsx';
import { scoreCase } from '../../../../shared/priority.js';
import { api } from '../../api.js';

const PRESETS = [
  {
    id: 'current',
    label: 'Current conditions',
    description: 'Use the case exactly as it is in the live dashboard.',
    hazard: null,
    findings: null,
  },
  {
    id: 'severe-shaking',
    label: 'Severe shaking',
    description: 'Strong shaking reported; building damage has not yet been inspected.',
    hazard: { buildingDamage: 'none', intensity: 8, gasLeak: false, fire: false, roadsBlocked: false, powerOut: false },
    findings: {},
  },
  {
    id: 'collapse-trapped',
    label: 'Collapse + trapped resident',
    description: 'A collapse report and a direct trapped-person report arrive.',
    hazard: { buildingDamage: 'collapsed', intensity: 9, gasLeak: false, fire: false, roadsBlocked: true, powerOut: true },
    findings: { trapped: true },
  },
  {
    id: 'aftershock-access',
    label: 'Aftershock / access blocked',
    description: 'Severe damage is confirmed, access is blocked, and power is out.',
    hazard: { buildingDamage: 'severe', intensity: 8, gasLeak: false, fire: false, roadsBlocked: true, powerOut: true },
    findings: {},
  },
  {
    id: 'reassuring-contact',
    label: 'Resident reached and OK',
    description: 'A recent contact reports OK; this cannot cancel direct danger signals.',
    hazard: null,
    findings: { reportedOk: true },
  },
];

const DAMAGE_OPTIONS = ['none', 'minor', 'moderate', 'severe', 'collapsed'];
const formatRisk10 = (n) => `${(Number(n || 0) * 10).toFixed(1)}/10`;
const signedRisk10 = (n) => `${n > 0 ? '+' : ''}${Number(n || 0).toFixed(1)} /10`;
const priority10 = (scorePercent) => Number(scorePercent || 0) / 10;

const ACCELERATED_STAGES = [
  { minute: 15, label: 'Strong shaking detected', description: 'MMI 7 and moderate structural damage reported.', hazard: { buildingDamage: 'moderate', intensity: 7, gasLeak: false, fire: false, roadsBlocked: false, powerOut: false }, findings: {} },
  { minute: 30, label: 'Damage and access worsen', description: 'Severe building damage, blocked roads and power outage reported.', hazard: { buildingDamage: 'severe', intensity: 8, gasLeak: false, fire: false, roadsBlocked: true, powerOut: true }, findings: {} },
  { minute: 45, label: 'Aftershock / secondary hazard', description: 'A gas leak is reported and the resident says the building is unsafe.', hazard: { buildingDamage: 'severe', intensity: 8, gasLeak: true, fire: false, roadsBlocked: true, powerOut: true }, findings: { buildingUnsafe: true } },
  { minute: 60, label: 'Resident reports trapped', description: 'Direct trapped-person report triggers the immediate-response safeguard.', hazard: { buildingDamage: 'collapsed', intensity: 9, gasLeak: true, fire: false, roadsBlocked: true, powerOut: true }, findings: { trapped: true, needsHelp: true } },
];
const levelClass = (level) => `scenario-level level-${String(level || 'STANDARD').toLowerCase()}`;

function RiskCard({ title, result, baseline, isBaseline = false }) {
  const delta = baseline ? result.riskByHorizon[30] - baseline.riskByHorizon[30] : null;
  return (
    <section className="panel scenario-result-card">
      <div className="scenario-result-head">
        <div>
          <div className="section-title">{title}</div>
          <div className="scenario-main-number">{priority10(result.score).toFixed(1)}<span>/10</span></div>
          <p className="muted small">Risk score · 30-minute horizon</p>
        </div>
        <div className={levelClass(result.level)}>{result.immediateOverride ? 'IMMEDIATE' : result.level}</div>
      </div>
      {result.immediateOverride && <div className="scenario-override"><b>Emergency override</b><span>{result.immediateOverride}</span></div>}
      <div className="risk-horizons scenario-horizons">
        {[15, 30, 60].map((minute) => (
          <div className={`risk-horizon ${minute === 30 ? 'active' : ''}`} key={minute}>
            <span className="muted small">{minute} min</span>
            <b>{formatRisk10(result.riskByHorizon[minute])}</b>
          </div>
        ))}
      </div>
      {!isBaseline && baseline && <div className={`scenario-change ${delta > 0.0001 ? 'up' : delta < -0.0001 ? 'down' : ''}`}>
        <span>30-minute risk score change</span><strong>{signedRisk10(delta * 10)}</strong>
      </div>}
      <div className="scenario-meta-row">
        <span>Uncertainty</span><b>{Math.round(result.uncertainty.score * 100)}% · {result.uncertainty.level}</b>
      </div>
      <div className="scenario-meta-row">
        <span>Human review</span><b>{result.reviewRequired ? 'Recommended' : 'Not flagged'}</b>
      </div>
    </section>
  );
}

export default function SimulationPage() {
  const { cases, simulation, startSimulation, stopSimulation, resetSimulation } = useLive();
  const caseList = useMemo(() => Object.values(cases).sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, STANDARD: 2, RESOLVED: 3 };
    return (order[a.priority?.level] ?? 2) - (order[b.priority?.level] ?? 2) || (b.priority?.score || 0) - (a.priority?.score || 0);
  }), [cases]);
  const [selectedId, setSelectedId] = useState('');
  const [presetId, setPresetId] = useState('current');
  const [hazard, setHazard] = useState({});
  const [findings, setFindings] = useState({});
  const simulationRunning = simulation.running;
  const simulationMinute = simulation.minute;
  const [simulationSnapshots, setSimulationSnapshots] = useState([]);
  const processedStages = useRef(new Set());
  const zoneSimulationFrame = useRef(null);
  const [zoneReportSync, setZoneReportSync] = useState({ state: 'idle', message: '' });

  useEffect(() => {
    if (!selectedId || !cases[selectedId]) {
      const firstOpen = caseList.find((c) => c.status !== 'safe') || caseList[0];
      if (firstOpen) setSelectedId(firstOpen.personId);
    }
  }, [selectedId, cases, caseList]);

  const selectedCase = cases[selectedId];

  useEffect(() => {
    const onZoneReport = async (event) => {
      if (event.source !== zoneSimulationFrame.current?.contentWindow) return;
      if (event.data?.type !== 'disasterbridge:zone-report' || !event.data.report) return;
      setZoneReportSync({ state: 'syncing', message: 'Simulation complete — applying zone results to resident cases…' });
      try {
        const result = await api.applyZoneReport(event.data.report);
        setZoneReportSync({
          state: 'success',
          message: `Applied ${result.zonesReceived} zones to ${result.loadedResidentsUpdated.toLocaleString()} loaded residents across ${result.zonesMatchedToLoadedResidents} matched zones. Risk and priority are recalculated live.`,
        });
      } catch (error) {
        setZoneReportSync({ state: 'error', message: `Could not update resident priorities: ${error.message}` });
      }
    };
    window.addEventListener('message', onZoneReport);
    return () => window.removeEventListener('message', onZoneReport);
  }, []);

  useEffect(() => {
    if ((!simulationRunning && simulationMinute !== 60) || !selectedCase || simulationMinute === 0) return;
    const stage = ACCELERATED_STAGES.find((item) => item.minute === simulationMinute);
    if (stage && !processedStages.current.has(stage.minute)) {
      processedStages.current.add(stage.minute);
      const stageHazard = { ...(selectedCase.hazard || {}), ...stage.hazard, source: 'accelerated-simulation' };
      const stageFindings = { ...(selectedCase.findings || {}), ...stage.findings };
      setPresetId('custom');
      setHazard(stageHazard);
      setFindings(stageFindings);
      const simulatedCase = { ...selectedCase, status: selectedCase.status === 'safe' ? 'not_contacted' : selectedCase.status, hazard: stageHazard, findings: stageFindings };
      const result = scoreCase(selectedCase.person, simulatedCase, Date.now());
      setSimulationSnapshots((items) => [...items, { minute: stage.minute, label: stage.label, description: stage.description, score: result.score, level: result.level, override: result.immediateOverride }]);
    }
    if (simulationMinute >= 60) stopSimulation();
  }, [simulationMinute, simulationRunning, selectedId]);

  const applyPreset = (id) => {
    stopSimulation();
    setPresetId(id);
    const preset = PRESETS.find((x) => x.id === id) || PRESETS[0];
    if (id === 'current') {
      setHazard({ ...(selectedCase?.hazard || {}) });
      setFindings({ ...(selectedCase?.findings || {}) });
    } else {
      setHazard({ ...(preset.hazard || selectedCase?.hazard || {}) });
      setFindings({ ...(selectedCase?.findings || {}), ...(preset.findings || {}) });
    }
  };

  useEffect(() => {
    if (!selectedCase) return;
    const preset = PRESETS.find((x) => x.id === presetId);
    if (!preset || presetId === 'current') {
      setHazard({ ...(selectedCase.hazard || {}) });
      setFindings({ ...(selectedCase.findings || {}) });
    } else {
      setHazard({ ...(preset.hazard || selectedCase.hazard || {}) });
      setFindings({ ...(selectedCase.findings || {}), ...(preset.findings || {}) });
    }
    // Case changes intentionally reset the hypothetical controls to the selected preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const results = useMemo(() => {
    if (!selectedCase?.person) return null;
    const now = Date.now();
    const baseline = scoreCase(selectedCase.person, selectedCase, now);
    const hypotheticalCase = {
      ...selectedCase,
      // Preview an open response case even if the live record was marked safe.
      status: selectedCase.status === 'safe' ? 'not_contacted' : selectedCase.status,
      hazard: { ...(selectedCase.hazard || {}), ...hazard, source: 'scenario-preview' },
      findings: { ...(selectedCase.findings || {}), ...findings },
    };
    const hypothetical = scoreCase(selectedCase.person, hypotheticalCase, now);
    return { baseline, hypothetical };
  }, [selectedCase, hazard, findings]);

  const setHazardValue = (key, value) => {
    stopSimulation();
    setPresetId('custom');
    setHazard((prev) => ({ ...prev, [key]: value }));
  };
  const setFinding = (key, value) => {
    stopSimulation();
    setPresetId('custom');
    setFindings((prev) => ({ ...prev, [key]: value }));
  };
  const resetToCurrent = () => {
    stopSimulation();
    resetSimulation();
    setSimulationSnapshots([]);
    processedStages.current.clear();
    setPresetId('current');
    setHazard({ ...(selectedCase?.hazard || {}) });
    setFindings({ ...(selectedCase?.findings || {}) });
  };

  const startAcceleratedSimulation = () => {
    if (!selectedCase?.person) return;
    processedStages.current.clear();
    const initialHazard = { ...(selectedCase.hazard || {}), source: 'accelerated-simulation' };
    const initialFindings = { ...(selectedCase.findings || {}) };
    const initialCase = { ...selectedCase, status: selectedCase.status === 'safe' ? 'not_contacted' : selectedCase.status, hazard: initialHazard, findings: initialFindings };
    const initialResult = scoreCase(selectedCase.person, initialCase, Date.now());
    setSimulationSnapshots([{ minute: 0, label: 'Earthquake begins', description: 'Starting conditions from the selected case.', score: initialResult.score, level: initialResult.level, override: initialResult.immediateOverride }]);
    setHazard(initialHazard);
    setFindings(initialFindings);
    setPresetId('custom');
    resetSimulation();
    startSimulation();
  };

  const stopAcceleratedSimulation = () => stopSimulation();

  return (
    <main className="page simulation-page">
      <div className="page-head">
        <div>
          <h1>Earthquake simulation & triage lab</h1>
          <p className="muted">Explore how earthquake evidence changes risk assessment and dispatcher priority over time.</p>
        </div>
        <span className="badge info">3D zone integration</span>
      </div>

      <section className="panel embedded-earthquake-sim">
        <div className="embedded-sim-head">
          <div>
            <div className="section-title">Twin Cities · Minneapolis earthquake simulation</div>
            <h2>Run the city simulation</h2>
            <p className="muted small">Start the earthquake simulation below. When it finishes, its 100 zone statuses and facility categories are sent to DisasterBridge and matched against each resident's zone (0–99). The live queue and risk assessment then recalculate automatically.</p>
          </div>
          <span className="badge info">100 zones · 0–99</span>
        </div>
        <div className="zone-report-sync" data-state={zoneReportSync.state} role="status">
          {zoneReportSync.state === 'success' ? '✓ ' : zoneReportSync.state === 'error' ? '⚠ ' : zoneReportSync.state === 'syncing' ? '↻ ' : 'ℹ '}
          {zoneReportSync.message || 'Run the simulation and press Start in the simulation panel. A zone report is generated when the run completes.'}
        </div>
        <iframe
          ref={zoneSimulationFrame}
          className="earthquake-sim-frame"
          src={import.meta.env.DEV ? 'http://127.0.0.1:5174/' : '/sim/'}
          title="Minneapolis Twin Cities earthquake simulation"
          allow="fullscreen"
        />
        <p className="muted small">If the simulation is blank: it needs a Cesium ion token in <code>simulation/.env</code> (<code>VITE_CESIUM_ION_TOKEN</code>). In dev (<code>npm run dev</code>) it also needs <code>npm install --prefix simulation</code> once. Under <code>npm start</code> / a tunnel it is built and served at <code>/sim</code> — set the token before building.</p>
      </section>

      <section className="scenario-lab panel">
        <div className="scenario-lab-head">
          <div>
            <div className="section-title">Live scenario comparison</div>
            <h2>What changes if conditions worsen?</h2>
            <p className="muted small">Pick a person, apply a scenario, or adjust evidence manually. Scores recalculate immediately.</p>
          </div>
          <label className="scenario-person-picker">
            <span className="label">Person / case</span>
            <select value={selectedId} disabled={simulationRunning} onChange={(e) => { stopSimulation(); resetSimulation(); setSimulationSnapshots([]); processedStages.current.clear(); setSelectedId(e.target.value); }}>
              {caseList.map((c) => <option key={c.personId} value={c.personId}>{c.person?.name || c.personId} · {c.personId} · {c.priority?.level || 'STANDARD'}</option>)}
            </select>
          </label>
        </div>

        {selectedCase && results ? <>
          <div className="scenario-person-summary">
            <div><span className="label">Selected resident</span><strong>{selectedCase.person?.name || selectedCase.personId}</strong><span className="muted small">{selectedCase.person?.age ? `${selectedCase.person.age} years` : 'Age unknown'} · Zone {selectedCase.person?.zone ?? 'unassigned'} · Status: {selectedCase.status?.replaceAll('_', ' ') || 'unknown'}</span></div>
            <div><span className="label">Current live hazard</span><strong>{selectedCase.hazard?.zoneStatus ? `Zone ${selectedCase.hazard.zoneStatus}` : (selectedCase.hazard?.buildingDamage || 'Damage unknown')}</strong><span className="muted small">Facility: {selectedCase.hazard?.zoneCategory || 'none'} · MMI {selectedCase.hazard?.intensity ?? 'unknown'} · {selectedCase.hazard?.source || 'no source metadata'}</span></div>
            <div><span className="label">Model</span><strong>earthquake-demo-v1</strong><span className="muted small">Scenario assumptions, not calibrated predictions</span></div>
          </div>

          <div className="scenario-presets">
            <span className="label">Scenario presets</span>
            <div className="scenario-preset-buttons">
              {PRESETS.map((preset) => <button key={preset.id} type="button" disabled={simulationRunning} className={`btn ${presetId === preset.id ? 'primary' : ''}`} onClick={() => applyPreset(preset.id)}>{preset.label}</button>)}
              {presetId === 'custom' && <span className="badge warn">Custom scenario</span>}
            </div>
            <p className="muted small">{PRESETS.find((x) => x.id === presetId)?.description || 'Custom edits are applied to this case only for comparison.'}</p>
          </div>

          <section className="accelerated-sim" aria-label="Accelerated earthquake simulation">
            <div className="accelerated-sim-head">
              <div>
                <div className="section-title">Accelerated simulation</div>
                <p className="muted small">Run 60 simulated minutes in 60 real seconds. Watch the risk score and priority update at 15, 30, 45 and 60 minutes.</p>
              </div>
              <div className="accelerated-sim-actions">
                <button className="btn primary" type="button" onClick={startAcceleratedSimulation} disabled={simulationRunning}>{simulationRunning ? 'Simulation running…' : '▶ Run 60-minute simulation'}</button>
                {simulationRunning && <button className="btn" type="button" onClick={stopAcceleratedSimulation}>Stop</button>}
              </div>
            </div>
            <div className="sim-progress-row"><span className="muted small">Simulated time</span><strong>{simulationMinute} / 60 min</strong></div>
            <div className="sim-progress-track"><div className="sim-progress-fill" style={{ width: `${(simulationMinute / 60) * 100}%` }} /></div>
            {simulationSnapshots.length > 0 && <div className="sim-timeline">{simulationSnapshots.map((snapshot) => <div className="sim-timeline-item" key={snapshot.minute}><div className="sim-timeline-time">T+{snapshot.minute} min</div><div className="sim-timeline-content"><strong>{snapshot.label}</strong><p className="muted small">{snapshot.description}</p><div className="sim-timeline-score"><b>{priority10(snapshot.score).toFixed(1)}/10</b><span className={levelClass(snapshot.level)}>{snapshot.override ? 'IMMEDIATE' : snapshot.level}</span></div></div></div>)}</div>}
            {!simulationRunning && simulationMinute === 60 && <p className="sim-complete">60-minute scenario complete. Restart to replay from the selected case's starting conditions.</p>}
            <p className="muted small">Demo scenario only: scripted events are illustrative. The dashboard shows a non-mutating prioritisation preview for all residents; live case records and dispatch actions are unchanged.</p>
          </section>

          <div className="scenario-editor-grid">
            <section className="sub scenario-editor">
              <h3 className="section-title">Earthquake conditions</h3>
              <label className="scenario-field"><span>Building damage</span><select value={hazard.buildingDamage || 'unknown'} onChange={(e) => setHazardValue('buildingDamage', e.target.value === 'unknown' ? undefined : e.target.value)}><option value="unknown">Unknown / not inspected</option>{DAMAGE_OPTIONS.map((d) => <option value={d} key={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></label>
              <label className="scenario-field"><span>Shaking intensity (MMI)</span><div className="scenario-range"><input type="range" min="1" max="10" value={Number(hazard.intensity ?? 5)} onChange={(e) => setHazardValue('intensity', Number(e.target.value))}/><strong>{hazard.intensity ?? '—'}</strong></div></label>
              <div className="scenario-checks">
                {[['gasLeak', 'Gas leak reported'], ['fire', 'Fire reported'], ['roadsBlocked', 'Roads blocked'], ['powerOut', 'Power outage']].map(([key, label]) => <label key={key}><input type="checkbox" checked={!!hazard[key]} onChange={(e) => setHazardValue(key, e.target.checked)}/><span>{label}</span></label>)}
              </div>
            </section>
            <section className="sub scenario-editor">
              <h3 className="section-title">Resident / contact evidence</h3>
              <div className="scenario-checks">
                {[
                  ['trapped', 'Resident reports trapped'],
                  ['injured', 'Injury reported'],
                  ['needsHelp', 'Asked for help'],
                  ['distress', 'Distress reported'],
                  ['buildingUnsafe', 'Resident says building is unsafe'],
                  ['reportedOk', 'Recent contact: reports OK'],
                ].map(([key, label]) => <label key={key}><input type="checkbox" checked={!!findings[key]} onChange={(e) => setFinding(key, e.target.checked)}/><span>{label}</span></label>)}
              </div>
              <div className="scenario-editor-note">Direct life-threat evidence can trigger an emergency override. A reassuring report never cancels confirmed collapse, injury, fire or gas danger.</div>
            </section>
          </div>

          <div className="scenario-results-grid">
            <RiskCard title="Baseline · current case" result={results.baseline} isBaseline />
            <RiskCard title="Hypothetical · edited evidence" result={results.hypothetical} baseline={results.baseline} />
          </div>

          <section className="sub scenario-evidence-diff">
            <div className="scenario-evidence-head"><h3 className="section-title">Why did the estimate change?</h3><button className="btn small" type="button" onClick={resetToCurrent}>Reset to current case</button></div>
            {results.hypothetical.immediateOverride && <div className="scenario-override"><b>Immediate-response rule</b><span>{results.hypothetical.immediateOverride}</span></div>}
            <div className="scenario-factor-list">
              {results.hypothetical.factors.length ? results.hypothetical.factors.map((factor) => <div className="scenario-factor" key={`${factor.kind}-${factor.label}`}><span className={`scenario-factor-dot kind-${factor.kind}`}/><div><strong>{factor.label}</strong><p className="muted small">{factor.explanation}</p></div><code>LR ×{factor.likelihoodRatio.toFixed(2)}</code></div>) : <p className="muted small">No significant evidence factors are active in this scenario.</p>}
            </div>
            <div className="scenario-caveat">Risk scores use a 0–10 display scale derived from transparent illustrative assumptions for a hackathon demo; they are not validated casualty predictions or medical advice. Scenario edits are local previews only and do not update the live dispatcher queue.</div>
          </section>
        </> : <p className="muted">Waiting for case data from the backend…</p>}
      </section>
    </main>
  );
}
