# Working as a team on this repo

## The shared contract (read this before writing code)

Every module reads and writes the same **zone object** shape. Don't invent a
new field without telling the team — add it to this list.

```js
zone = {
  id, label,            // e.g. 12, "E2"
  coords, bounds,        // grid position + world-space box
  elevation,             // terrain height at zone center

  population,            // static, from zones/data.js
  vulnerablePct,         // 0..1, static
  hasHospital,           // bool, static

  hazard,                // 0..1, set every frame by the ACTIVE disaster
  roadBlocked,           // bool, set every frame by the ACTIVE disaster
  hospitalReachable,     // bool, computed by zones/access.js (don't set this yourself)

  score, severity,       // "critical" | "dangerous" | "moderate" | "safe"
                          // both computed by zones/scoring.js — don't set these yourself
}
```

Every **disaster** implements the same interface (`src/disasters/base.js`):

```js
init(world, zones)       // called once on Start
step(dt, world, zones)   // called every frame — mutate zone.hazard / roadBlocked
render(scene, world)     // called every frame — update your visual (Cesium entity, etc.)
reset(scene, world)      // called on Reset / switching disasters — clean up your visual
```

`world` gives you `world.heightAt(lon, lat)` (real terrain elevation in
meters, pre-sampled from Cesium World Terrain) and `world.viewer` (the
Cesium Viewer, for adding/removing entities). Note: zone `bounds` fields are
named `minX/minZ/maxX/maxZ/cx/cz` for historical reasons but hold
**longitude/latitude**, not world units — `x` = longitude, `z` = latitude.

## What's real data vs. placeholder (pick one up if you have time)

- **Terrain + buildings**: real (Cesium World Terrain + OSM 3D Buildings).
  Nothing to do here unless you want to change the AOI (`CONFIG.aoi` in
  `src/config.js`).
- **Fire fuel grid** (`src/disasters/fire.js`): the vegetation/canopy density
  is currently a noise function standing in for real data. Swapping this for
  real data means fetching OSM `natural=wood`/`landuse=forest` polygons for
  the AOI (e.g. via the Overpass API) and rasterizing them into the same
  `fuel` grid shape the file already uses — the rest of the fire logic
  doesn't need to change. The water mask (`isWater`) already uses real
  terrain elevation as a proxy for the river/floodplain; swapping that for
  real OSM water polygons would be more precise but isn't required.
- **Population & vulnerability per zone** (`src/zones/data.js`): currently
  randomly generated. The repo has `synthetic_population_100k.json` (100k
  synthetic people with age + medical-condition flags, no real addresses —
  see its own `metadata` block for the exact policy) sitting at the repo
  root. The plan is to distribute those records across zones (weighted by
  building density per zone) and compute `population`/`vulnerablePct` from
  the real `medical_history` flags instead of `Math.random()`. This only
  needs to change `generateZoneData()` — nothing downstream cares where the
  numbers came from.

If you stick to these two contracts, your branch almost never conflicts with
anyone else's.

## Suggested task split

| Area | Files | Good for |
|---|---|---|
| **World** | `src/world/*` | terrain, buildings, trees, roads |
| **Disasters** | `src/disasters/*` | flood / fire / heat simulation logic |
| **Zones** | `src/zones/*` | scoring formula, hospital-access BFS, zone data |
| **UI** | `src/ui/*`, `src/style.css` | side panel, zone color overlay, legend |

`src/main.js` and `src/config.js` are shared — keep changes to them small
and pull before editing.

## Git workflow

- `main` stays runnable at all times. Don't push to it directly.
- One branch per task: `feature/flood`, `feature/zone-scoring`, `feature/ui-panel`, etc.
- Open a PR to merge into `main`; get a quick look from one teammate before merging.
- Pull `main` into your branch often so you don't drift:

  ```bash
  git checkout feature/your-task
  git pull origin main
  ```

- Commit small and often — a branch that's 40 commits behind `main` at hour 20
  is how hackathons die.

## Setup

```bash
git clone https://github.com/SharkyDex/social_hack.git
cd social_hack
git checkout -b feature/your-task
npm install
npm run dev
```

Track tasks as GitHub Issues, one per person, so everyone can see who owns what.
