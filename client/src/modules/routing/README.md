# Routing module (open paths for responders)

**Owner:** routing teammate

Put the path engine and its test view here (`RoutingPage.jsx` is the entry point, already linked in the nav).
Keep the engine itself plain JavaScript (no React) so the server or the 3D view can call it too.

## Likely hand-off with the dashboard (integration — later)

The dispatcher assigns units manually. Once a unit is assigned, the dashboard can show a route:

```
route({ from, to, vehicle, departAt }) → { path, etaMinutes, closesAt }
```

Units are in `shared/data/responders.sample.json` (`type` tells you the vehicle: ambulance, high-clearance truck, boat…).
