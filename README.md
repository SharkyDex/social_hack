# DisasterBridge

Disaster response for people with disabilities. An AI places welfare-check calls during a flood, turns each conversation into a responder card, and keeps a dispatcher's queue ordered by who needs help first.

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
2. **No answer:** it retries up to 3 times and adds +8 priority after each miss. After the first miss it also calls the emergency contact. After 3 misses the person is marked *Unreachable* so the dispatcher can send someone.
3. **Answered:** the conversation runs, then the AI pulls out the problems (injured, equipment battery left, wants evacuation…). Those update the responder card and the priority.
4. The dispatcher decides: assign a unit, call again, text, add a note, or mark safe.

**Incoming calls** from people not in the registry ring 911 first. The AI intake only answers if no operator picks up, and the caller becomes a new card.

**Interactive mode** ("Call — I'll answer"): you type the resident's replies. This is good for the live demo.

## Priority

Fixed rules in `shared/priority.js`, not AI, so the same inputs always give the same rank and every point is explained on screen. Tune the numbers in `WEIGHTS`. CRITICAL ≥ 60, HIGH ≥ 35.

Factors: medical needs (power-dependent equipment counts most), age, living alone, danger at home (from the simulation), unanswered attempts, what the call found, and time since last contact.

## Data

- `synthetic_population_100k.json`: the team's generated population. Load it with `PEOPLE_FILE=synthetic_population_100k.json` and `PEOPLE_SAMPLE=30` in `.env` (see `shared/FORMATS.md`).
- `shared/data/people.sample.json`: 30 curated people. This is the default because it pairs with scripted scenarios, which make the best demo.
- `shared/data/scenarios.sample.json`: **simulation only.** What is "really" happening to each sample person, so simulated calls have something to say. It also holds placeholder flood timings until the 3D simulation is connected.
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
