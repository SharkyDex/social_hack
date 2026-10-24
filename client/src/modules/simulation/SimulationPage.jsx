// Earthquake simulation handoff page plus a local, non-mutating triage scenario lab.
// The comparison tool previews how evidence changes risk; it does not write hazards
// back to the live dispatcher state or replace the teammate-owned 3D simulation.
import { useEffect, useMemo, useState } from 'react';
import { useLive } from '../../LiveState.jsx';
import { scoreCase } from '../../../../shared/priority.js';

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
const formatPct = (n) => `${(Number(n || 0) * 100).toFixed(1)}%`;
const signedPct = (n) => `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)} pp`;
const levelClass = (level) => `scenario-level level-${String(level || 'STANDARD').toLowerCase()}`;

function RiskStat({ label, value, delta, emphasis = false }) {
  return (
    <div className={`scenario-stat ${emphasis ? 'emphasis' : ''}`}>
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
      {delta != null && <span className={`scenario-delta ${delta > 0.0001 ? 'up' : delta < -0.0001 ? 'down' : ''}`}>{signedPct(delta)}</span>}
    </div>
  );
}

function RiskCard({ title, result, baseline, isBaseline = false }) {
  const delta = baseline ? result.riskByHorizon[30] - baseline.riskByHorizon[30] : null;
  return (
    <section className="panel scenario-result-card">
      <div className="scenario-result-head">
        <div>
          <div className="section-title">{title}</div>
          <div className="scenario-main-number">{result.score.toFixed(1)}<span>%</span></div>
          <p className="muted small">Illustrative serious-harm risk within 30 min</p>
        </div>
        <div className={levelClass(result.level)}>{result.immediateOverride ? 'IMMEDIATE' : result.level}</div>
      </div>
      {result.immediateOverride && <div className="scenario-override"><b>Emergency override</b><span>{result.immediateOverride}</span></div>}
      <div className="risk-horizons scenario-horizons">
        {[15, 30, 60].map((minute) => (
          <div className={`risk-horizon ${minute === 30 ? 'active' : ''}`} key={minute}>
            <span className="muted small">{minute} min</span>
            <b>{formatPct(result.riskByHorizon[minute])}</b>
          </div>
        ))}
      </div>
      {!isBaseline && baseline && <div className={`scenario-change ${delta > 0.0001 ? 'up' : delta < -0.0001 ? 'down' : ''}`}>
        <span>30-minute risk change</span><strong>{signedPct(delta)}</strong>
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
  const { cases } = useLive();
  const caseList = useMemo(() => Object.values(cases).sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, STANDARD: 2, RESOLVED: 3 };
    return (order[a.priority?.level] ?? 2) - (order[b.priority?.level] ?? 2) || (b.priority?.score || 0) - (a.priority?.score || 0);
  }), [cases]);
  const [selectedId, setSelectedId] = useState('');
  const [presetId, setPresetId] = useState('current');
  const [hazard, setHazard] = useState({});
  const [findings, setFindings] = useState({});

  useEffect(() => {
    if (!selectedId || !cases[selectedId]) {
      const firstOpen = caseList.find((c) => c.status !== 'safe') || caseList[0];
      if (firstOpen) setSelectedId(firstOpen.personId);
    }
  }, [selectedId, cases, caseList]);

  const selectedCase = cases[selectedId];

  const applyPreset = (id) => {
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
    setPresetId('custom');
    setHazard((prev) => ({ ...prev, [key]: value }));
  };
  const setFinding = (key, value) => {
    setPresetId('custom');
    setFindings((prev) => ({ ...prev, [key]: value }));
  };
  const resetToCurrent = () => {
    setPresetId('current');
    setHazard({ ...(selectedCase?.hazard || {}) });
    setFindings({ ...(selectedCase?.findings || {}) });
  };

  return (
    <main className="page simulation-page">
      <div className="page-head">
        <div>
          <h1>Earthquake simulation & triage lab</h1>
          <p className="muted">Explore how new earthquake evidence changes the Bayesian risk estimate and dispatcher priority.</p>
        </div>
        <span className="badge info">Local scenario preview</span>
      </div>

      <section className="panel simulation-handoff">
        <div className="section-title">3D simulation integration</div>
        <p>When the 3D simulation is connected, it can send each resident's earthquake hazard through <code>POST /api/hazards</code>. The comparison below is a local, non-mutating preview: it does not change live cases or dispatch anyone.</p>
        <p className="muted small">Expected hazard fields: buildingDamage, intensity (MMI 1–10), gasLeak, fire, roadsBlocked and powerOut.</p>
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
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {caseList.map((c) => <option key={c.personId} value={c.personId}>{c.person?.name || c.personId} · {c.personId} · {c.priority?.level || 'STANDARD'}</option>)}
            </select>
          </label>
        </div>

        {selectedCase && results ? <>
          <div className="scenario-person-summary">
            <div><span className="label">Selected resident</span><strong>{selectedCase.person?.name || selectedCase.personId}</strong><span className="muted small">{selectedCase.person?.age ? `${selectedCase.person.age} years` : 'Age unknown'} · Status: {selectedCase.status?.replaceAll('_', ' ') || 'unknown'}</span></div>
            <div><span className="label">Current live hazard</span><strong>{selectedCase.hazard?.buildingDamage || 'Damage unknown'}</strong><span className="muted small">MMI {selectedCase.hazard?.intensity ?? 'unknown'} · {selectedCase.hazard?.source || 'no source metadata'}</span></div>
            <div><span className="label">Model</span><strong>earthquake-demo-v1</strong><span className="muted small">Scenario assumptions, not calibrated predictions</span></div>
          </div>

          <div className="scenario-presets">
            <span className="label">Scenario presets</span>
            <div className="scenario-preset-buttons">
              {PRESETS.map((preset) => <button key={preset.id} type="button" className={`btn ${presetId === preset.id ? 'primary' : ''}`} onClick={() => applyPreset(preset.id)}>{preset.label}</button>)}
              {presetId === 'custom' && <span className="badge warn">Custom scenario</span>}
            </div>
            <p className="muted small">{PRESETS.find((x) => x.id === presetId)?.description || 'Custom edits are applied to this case only for comparison.'}</p>
          </div>

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
            <div className="scenario-caveat">These percentages are outputs of transparent illustrative assumptions for a hackathon demo, not validated casualty probabilities or medical advice. Scenario edits are local previews only and do not update the live dispatcher queue.</div>
          </section>
        </> : <p className="muted">Waiting for case data from the backend…</p>}
      </section>
    </main>
  );
}
