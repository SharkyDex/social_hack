# Simulation module (3D earthquake)

**Owner:** simulation teammate

Put the 3D view in this folder (`SimulationPage.jsx` is the entry point, already linked in the nav).
`npm i three` (or `@react-three/fiber @react-three/drei`) from the repo root with `-w client`.

## Feeding the dashboard (integration — later)

The dashboard's priority rules already score "danger at home". Push values with:

```
POST /api/hazards
[
  { "personId": "P004", "buildingDamage": "severe", "intensity": 8 },
  { "personId": "P013", "gasLeak": true },
  { "personId": "P002", "roadsBlocked": true, "powerOut": true }
]
```

All fields optional:

| Field | Values | Priority points |
|---|---|---|
| `buildingDamage` | `none` / `minor` / `moderate` / `severe` / `collapsed` | 0 / +5 / +15 / +30 / +45 |
| `intensity` | shaking at the home, MMI 1–10 (used only if no damage estimate) | ≥7 +5, ≥8 +10 |
| `gasLeak` or `fire` | true / false | +20 |
| `roadsBlocked` | true / false | +10 |
| `powerOut` | true / false | +20 if they rely on powered medical equipment |

Weights live in `shared/priority.js`.
