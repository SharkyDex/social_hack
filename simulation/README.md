> **This is a standalone app inside the monorepo.** Run it from this folder:
> `cd simulation && npm install && npm run dev` (needs a Cesium ion token in `simulation/.env` — see `.env.example`).

# City Disaster Sim — Minneapolis

A real 3D Minneapolis (real terrain elevation + real OSM buildings via
CesiumJS) that you can hit with a disaster — **flood**, **fire**, or
**earthquake** — and watch each zone get scored and labeled **Critical**,
**Dangerous**, or **Moderate** in real time.

Each disaster is a point-origin event whose severity decreases with
distance/time, not a uniform wash across the whole map:
- **Fire** ignites at one point and spreads outward, blocked by real water
  (the river), fed more by denser canopy, and bounded to a finite radius —
  then burned cells cool back down, so severity rises, peaks, and recedes
  instead of creeping toward "everything critical."
- **Flood** rises from the river and only submerges genuinely low real
  terrain — it crests well below the AOI's highest ground, so high elevation
  stays safe.
- **Earthquake** radiates outward from an epicenter with real
  distance-based attenuation, amplified on real low-lying/soft ground near
  the river, and settles gradually after the shaking passes.

The severity of a zone isn't just "how hard the disaster hit it." It's a mix
of three things:

1. **Hazard** — how intense the disaster is there right now (water depth,
   fire spread, heat buildup).
2. **Vulnerability** — who lives there (population, % needing continuous
   medical devices like insulin pumps, CGMs, pacemakers, home oxygen).
3. **Access to care** — whether the zone can still reach a hospital, or
   whether flooded/burning roads have cut it off.

A zone with only moderate flooding can still be rated **Critical** if it's
full of medically vulnerable people and its only route to a hospital is
underwater.

## Setup

1. Get a free Cesium ion access token at https://ion.cesium.com/signup
   (Access Tokens page — no credit card needed).
2. Copy `.env.example` to `.env` and paste your token in:
   ```bash
   cp .env.example .env
   ```
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```
4. Open the printed `localhost` URL. Drag to rotate/pan, scroll to zoom
   (standard Cesium camera controls). Pick a disaster in the side panel and
   hit **Start**. **Reset** regenerates the zone data.

## Project structure

```
src/
├── world/cesiumWorld.js  # Cesium viewer setup: real terrain + OSM buildings,
│                          # plus a synchronous heightAt(lon, lat) sampler
├── disasters/             # flood.js, fire.js, heat.js — each disaster is self-contained
├── zones/                 # the zone grid, severity scoring, hospital-access logic
├── ui/                    # side panel + the zone-color overlay (Cesium entities)
└── main.js                # wires it all together
```

See `CONTRIBUTING.md` for how the team splits this up, the shared data
contract every module relies on, and what's still a placeholder vs. real
data.

## Severity formula

```
score = hazard_weight * hazard
      + vulnerability_weight * vulnerablePct * (0.5 + 0.5 * hazard)
      + access_weight * (hospital unreachable ? 1 : 0)
```

Weights and thresholds live in `src/config.js` — tune them there, not in the
scoring code. The AOI (area of interest — currently downtown Minneapolis +
the riverfront + UMN campus) also lives there as `CONFIG.aoi`.

## What's real data vs. placeholder right now

- **Terrain elevation**: real (Cesium World Terrain).
- **Buildings**: real (OSM 3D Buildings).
- **Fire fuel (vegetation/canopy density)**: still a noise-based placeholder
  — see CONTRIBUTING.md for swapping in real OSM landuse/tree-canopy data.
  Water masking (fire can't cross the river) and earthquake soil
  amplification already use real sampled terrain elevation, not a
  placeholder.
- **Population & vulnerability per zone**: still the random placeholder in
  `src/zones/data.js` — the team has a `synthetic_population_100k.json`
  dataset (synthetic-only, see its own `metadata` block) to map onto zones
  instead; not wired in yet.
