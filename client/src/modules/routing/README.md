# Routing module (open paths for responders after the earthquake)

**Owner:** routing teammate

Roads are blocked by debris, collapsed buildings, closed bridges and gas or fire zones, and aftershocks can close more. Put the path engine and its test view here (`RoutingPage.jsx` is the entry point, already linked in the nav).
Keep the engine itself plain JavaScript (no React) so the server or the 3D view can call it too.

## Likely hand-off with the dashboard (integration — later)

The dispatcher assigns units manually. Once a unit is assigned, the dashboard can show a route:

```
route({ from, to, vehicle, departAt }) → { path, etaMinutes, closesAt }
```

Units are in `shared/data/responders.sample.json` (`type` tells you the unit: fire engine, search & rescue, ambulance, wheelchair van…).
