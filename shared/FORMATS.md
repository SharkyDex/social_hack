# Shared data formats

## Person (the generated population dataset)

The team's `synthetic_population_100k.json` is read as-is:

```json
{
  "metadata": { … },
  "people": [
    {
      "person_id": "SIM-000001",
      "name": "Natalie Larson",
      "phone_number": "(612) 555-0136",
      "age": 36,
      "gender": "female",
      "medical_history": { "on_ventilator": false, "copd": true, "mobility_impairment": false, … },
      "address": "",
      "emergency_contact_1": { "name": "Alexander Walker", "number": "(612) 555-0142" },
      "emergency_contact_2": { "name": "", "number": "" }
    }
  ]
}
```

- `medical_history` true/false flags become readable conditions ("Ventilator dependent", "COPD"…) and then priority points through the keyword rules in `shared/needs.js`.
- Both emergency contacts are used: if the first doesn't answer, the AI calls the second.
- `address` is blank for now, so the dashboard shows "Address not set". Fill it with fictional-city addresses when the town exists.
- Phone numbers are `555-01xx`, the range reserved for fiction, so they can't ring anyone real. Live calling always redirects to `DEMO_PHONE_NUMBER` anyway.

Load it with a 30-person sample in `.env`:

```
PEOPLE_FILE=synthetic_population_100k.json
PEOPLE_SAMPLE=30
PEOPLE_SAMPLE_MODE=mixed   # a third highest-risk, the rest random
```

The curated `shared/data/people.sample.json` (the default) uses a simpler flat format: `id, name, age, gender, phone, address, medicalHistory[], emergencyContactName, emergencyContactNumber, livesAlone`. It pairs with `scenarios.sample.json`, which scripts what each person says, so it gives the most dramatic demo. Optional extra fields either format can carry: `livesAlone`, `mobility` (`independent` / `walker` / `wheelchair` / `bedbound`), `preferredContact` (`voice` / `sms`), `location`.

## Hazard (from the 3D earthquake simulation → dashboard)

`POST /api/hazards`

```json
[
  { "personId": "P004", "buildingDamage": "severe", "intensity": 8 },
  { "personId": "P013", "gasLeak": true },
  { "personId": "P002", "roadsBlocked": true, "powerOut": true }
]
```

`buildingDamage`: `none` / `minor` / `moderate` / `severe` / `collapsed` · `intensity`: MMI 1–10 · `gasLeak`, `fire`, `roadsBlocked`, `powerOut`: true/false. Points are in `client/src/modules/simulation/README.md`.

## Case (what the dashboard shows per person)

```js
{
  personId, person,                 // the dataset record
  status,                           // not_contacted | in_progress | no_answer | unreachable |
                                    // needs_help | reached | reached_ok | responder_assigned | safe
  attempts, failedAttempts, lastAttemptAt, lastContactAt, contactReached,
  needs: { flags[], powerDependent, mobility, preferredContact },
  hazard: { buildingDamage, intensity, gasLeak, fire, roadsBlocked, powerOut, source },
  findings: { needsHelp, trapped, injured, distress, gasOrFire, buildingUnsafe, powerOut,
              equipmentHoursLeft, wantsEvacuation, reportedOk },
  card: { summary, problems[], alerts[], immediateActions[], doNot[],
          communicationGuide, resourcesNeeded, timeSensitive },
  priority: { score, level, factors[{label, points, kind}], reason },
  assignedResponderId, notes[], timeline[], callIds[], origin   // registry | inbound
}
```

## Call

```js
{ id, personId, target /* resident | emergency_contact | inbound */, channel /* voice | sms */,
  mode /* auto | interactive */, attempt, to, status, turns[{speaker, text, at}], extracted }
```
