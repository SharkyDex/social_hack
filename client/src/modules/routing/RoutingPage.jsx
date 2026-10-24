// PLACEHOLDER — owned by the routing teammate.
// The path engine (open routes for responders) goes in this folder.

export default function RoutingPage() {
  return (
    <main className="page placeholder-page">
      <h1>Responder routing</h1>
      <p className="muted">Owned by the routing teammate. Finds open roads for a responder to reach a person, then a shelter or hospital.</p>
      <section className="panel">
        <h3 className="section-title">Likely hand-off with the dashboard (decide at integration)</h3>
        <p>
          When the dispatcher assigns a unit, the dashboard could ask for a route:
        </p>
        <pre>{`route({ from: unit.location, to: person.location, vehicle: unit.type, departAt })
→ { path: [...], etaMinutes, closesAt }`}</pre>
        <p className="muted small">Responder units live in shared/data/responders.sample.json.</p>
      </section>
    </main>
  );
}
