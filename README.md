# DisasterBridge

Disaster response for people with disabilities. An AI places welfare-check calls after an earthquake, turns each conversation into a responder card, and keeps a dispatcher's queue ordered by who needs help first.

Built for the Social Coding Social Hack hackathon.

## Run it

Needs **Node 20.19+** (or 22+).

```bash
npm install
cp .env.example .env      # add GROQ_API_KEY, or leave it empty for mock mode
npm run dev
```

Open **http://localhost:5173**. The API runs on :3001; the React app forwards `/api` to it.

With no `GROQ_API_KEY` the app runs in **mock mode**: calls follow a script, so everything works offline. That's also the backup if the Wi-Fi drops during the demo.

## How a welfare check works

1. The AI calls the person, or texts them if they're Deaf or non-verbal.
2. **No answer:** it retries up to 3 times. Missed attempts update the Bayesian contact evidence and can increase uncertainty; after the first miss it also calls the emergency contact. After 3 misses the person is marked *Unreachable* so the dispatcher can send someone.
3. **Answered:** the conversation runs, then the AI pulls out the problems (injured, equipment battery left, wants evacuation…). Those update the responder card and the priority.
4. The dispatcher decides: assign a unit, call again, text, add a note, or mark safe.

**Incoming calls** from people not in the registry ring 911 first. The AI intake only answers if no operator picks up, and the caller becomes a new card.

**Interactive mode** ("Call — I'll answer"): you type the resident's replies. This is good for the live demo.

## Earthquake triage priority

The queue now uses a transparent, scenario-based Bayesian evidence model in `shared/bayesian-risk.js`, wrapped by `shared/priority.js`. It estimates the probability of serious harm within 15, 30 and 60 minutes, and the displayed risk score is shown on a 0–10 scale (the underlying model still computes an illustrative probability). This is a hackathon decision-support model, **not a clinically validated or empirically calibrated casualty predictor**.

- `shared/bayesian-risk.js` exposes all baseline priors, likelihood ratios, thresholds and uncertainty assumptions in `BAYESIAN_ASSUMPTIONS`.
- Evidence is grouped (structural, acute, environmental, vulnerability, contact) to reduce double-counting of correlated signals. Structural damage and acute-call signals use the strongest signal in their group; environmental/vulnerability evidence is capped.
- Confirmed trapped reports and building-collapse reports trigger deterministic `CRITICAL` overrides. A reported `OK` can never cancel severe hazard evidence.
- Missing or stale hazard/contact information produces an explicit uncertainty level and may trigger a **VERIFY / HUMAN REVIEW** flag. The displayed upper-bound sensitivity estimate is a scenario stress check, **not a statistical confidence interval**.
- The dashboard shows 15/30/60-minute risk scores on a 0–10 display scale, evidence likelihood ratios, uncertainty sources and the assumptions notice. Evidence uncertainty remains a separate percentage.
- The Simulation tab includes an accelerated 60-minute scenario: 1 real second advances 1 simulated minute, with scripted evidence updates at minutes 15, 30, 45 and 60. During the run, the dashboard shows a non-mutating prioritisation preview for all residents and reorders the preview queue; underlying live case records and dispatch actions are unchanged.
- `POST /api/hazards` stamps simulation updates with `observedAt`; old observations can be flagged as stale.

The initial 2% / 4% / 8% horizon priors and all likelihood ratios are illustrative scenario assumptions chosen for transparent demo behavior. They must be reviewed against domain-expert input and validated data before any real-world use. The synthetic scenarios test software behavior and relative ordering, not real-world predictive accuracy.

Run the scenario validation tests with:

```bash
npm run test:priority
```

## Data

- `synthetic_population_100k.json`: the team's generated population. Load it with `PEOPLE_FILE=synthetic_population_100k.json` and `PEOPLE_SAMPLE=30` in `.env` (see `shared/FORMATS.md`).
- `shared/data/people.sample.json`: 30 curated people. This is the default because it pairs with scripted scenarios, which make the best demo.
- `shared/data/scenarios.sample.json`: **simulation only.** What is "really" happening to each sample person, so simulated calls have something to say. It also holds placeholder building damage, gas and power values until the 3D simulation is connected.
- `shared/data/responders.sample.json`: 8 units.
- Regenerate the curated sample with `npm run generate:sample`.

## Real phone calls (placeholder)

`TELEPHONY_PROVIDER=simulated` costs nothing and is the default. `server/src/telephony/twilio.js` is a stub with step-by-step notes for Twilio ConversationRelay.

Safety rails already in place:
- With a live provider, **every** call and text goes to `DEMO_PHONE_NUMBER`, never to dataset numbers.
- Never put 911 in `INBOUND_FORWARD_NUMBER` while testing. Use a teammate's phone.

## API (for the other modules)

| Method | Path | What |
|---|---|---|
| GET | `/api/state` | Everything: cases, calls, responders |
| GET | `/api/events` | Live updates (Server-Sent Events) |
| GET | `/api/cases?limit=&offset=` | Sorted queue, paginated |
| POST | `/api/cases/:id/call` | `{ mode: 'auto' \| 'interactive' }` |
| POST | `/api/cases/:id/text` | Text check-in |
| POST | `/api/cases/:id/call-contact` | Call the emergency contact |
| POST | `/api/calls/:id/reply` | `{ text }`: your reply in interactive mode |
| POST | `/api/calls/:id/hangup` | |
| POST | `/api/rounds/start` | Check everyone not yet contacted |
| POST | `/api/inbound/simulate` | `{ mode, operatorAvailable }` |
| POST | `/api/cases/:id/assign` | `{ responderId }` |
| POST | `/api/cases/:id/safe` · `/reopen` · `/release` · `/notes` | Dispatcher actions |
| POST | `/api/hazards` | Simulation → dashboard: danger at each home |
| POST | `/api/reset` | Reload everything |

## Demo day

`npm start` builds the React app and serves everything from one port (:3001). That makes it easy to tunnel with ngrok once real calls are added.
