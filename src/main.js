import { createWorld } from './world/cesiumWorld.js';
import { generateZoneData } from './zones/data.js';
import { scoreZones } from './zones/scoring.js';
import { createZoneOverlay } from './ui/zoneOverlay.js';
import { createPanel } from './ui/panel.js';
import { Earthquake } from './disasters/earthquake.js';
import { buildZoneReport, saveZoneReport, countSeverities } from './zones/export.js';

async function main() {
  const panelRoot = document.getElementById('panel');

  let world;
  try {
    world = await createWorld();
  } catch (err) {
    const message = err?.message || err?.toString?.() || 'Unknown error — check the browser console.';
    panelRoot.innerHTML = `<div class="error">
      <h1>Can't start</h1>
      <p>${message}</p>
      <p>Check the browser console (F12) for the full error.</p>
    </div>`;
    console.error(err);
    return;
  }

  // --- Zones --------------------------------------------------------------
  let zones = generateZoneData(world.heightAt);
  scoreZones(zones);
  const overlay = createZoneOverlay(world, zones);
  overlay.update(zones);

  // --- Disasters ------------------------------------------------------------
  const disasters = { earthquake: new Earthquake() };
  let active = null;
  let running = false;

  function selectDisaster(key) {
    active?.reset(world.viewer.scene, world);
    active = disasters[key];
    running = false;
  }
  selectDisaster('earthquake');

  function start() {
    active.init(world, zones);
    running = true;
    panel.setStatus(`${cap(active.name)} running…`);
  }

  async function finish() {
    running = false;
    const report = buildZoneReport(zones, active.name);
    const c = countSeverities(zones);
    const base =
      `${cap(active.name)} complete — ` +
      `${c.critical} critical, ${c.dangerous} dangerous, ` +
      `${c.moderate} moderate, ${c.safe} safe.`;
    panel.setStatus(base + ' Saving report…');
    const where = await saveZoneReport(report);
    panel.setStatus(
      base +
        (where.mode === 'file'
          ? ` Saved to ${where.path} in your project.`
          : ` Downloaded ${where.path}.`)
    );
  }

  function reset() {
    running = false;
    active?.reset(world.viewer.scene, world);
    zones = generateZoneData(world.heightAt);
    scoreZones(zones);
    overlay.update(zones);
    panel.update(zones);
    panel.setStatus('');
  }

  // --- UI -------------------------------------------------------------------
  const panel = createPanel(panelRoot, {
    onSelectDisaster: selectDisaster,
    onStart: start,
    onReset: reset,
  });
  panel.update(zones);

  // --- Main loop --------------------------------------------------------------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (running && active) {
      active.step(dt, world, zones);
      active.render(world.viewer.scene, world);
      scoreZones(zones);
      overlay.update(zones);
      panel.update(zones);

      if (active.isFinished(zones)) finish();
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

main();
