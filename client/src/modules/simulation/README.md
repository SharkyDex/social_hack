# Simulation module (3D flood)

**Owner:** simulation teammate

Put the 3D view in this folder (`SimulationPage.jsx` is the entry point, already linked in the nav).
`npm i three` (or `@react-three/fiber @react-three/drei`) from the repo root with `-w client`.

## Feeding the dashboard (integration — later)

The dashboard's priority rules already score "danger at home". Push values with:

```
POST /api/hazards
[
  { "personId": "P004", "minutesUntilFlood": 25 },
  { "personId": "P010", "homeFlooded": true },
  { "personId": "P002", "roadsCutOff": true }
]
```

All fields optional. Scoring (see `shared/priority.js`): flooding now +35, floods within 30/60/120 min +30/+20/+10, roads cut off +10.
