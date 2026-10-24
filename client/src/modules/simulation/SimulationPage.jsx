// PLACEHOLDER — owned by the 3D simulation teammate.
// Build the 3D flood view here (Three.js or react-three-fiber).
// See ./README.md for what the dashboard expects from this module.

export default function SimulationPage() {
  return (
    <main className="page placeholder-page">
      <h1>3D flood simulation</h1>
      <p className="muted">Owned by the simulation teammate. This page is where the 3D view goes.</p>
      <section className="panel">
        <h3 className="section-title">What the dashboard needs from this module</h3>
        <p>
          Danger at each person's home, pushed to <code>POST /api/hazards</code>:
        </p>
        <pre>{`[
  { "personId": "P004", "minutesUntilFlood": 25 },
  { "personId": "P010", "homeFlooded": true },
  { "personId": "P002", "roadsCutOff": true }
]`}</pre>
        <p className="muted small">
          Until then the dashboard uses placeholder values from <code>shared/data/scenarios.sample.json</code>.
        </p>
      </section>
    </main>
  );
}
