// PLACEHOLDER — owned by the 3D simulation teammate.
// Build the 3D earthquake view here (Three.js or react-three-fiber).
// See ./README.md for what the dashboard expects from this module.

export default function SimulationPage() {
  return (
    <main className="page placeholder-page">
      <h1>3D earthquake simulation</h1>
      <p className="muted">Owned by the simulation teammate. This page is where the 3D view goes.</p>
      <section className="panel">
        <h3 className="section-title">What the dashboard needs from this module</h3>
        <p>
          Danger at each person's home, pushed to <code>POST /api/hazards</code>:
        </p>
        <pre>{`[
  { "personId": "P004", "buildingDamage": "severe", "intensity": 8 },
  { "personId": "P013", "gasLeak": true },
  { "personId": "P002", "roadsBlocked": true, "powerOut": true }
]`}</pre>
        <p className="muted small">
          buildingDamage: none | minor | moderate | severe | collapsed · intensity: MMI 1–10 · gasLeak, fire, roadsBlocked, powerOut: true/false
        </p>
        <p className="muted small">
          Until then the dashboard uses placeholder values from <code>shared/data/scenarios.sample.json</code>.
        </p>
      </section>
    </main>
  );
}
