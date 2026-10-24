import * as Cesium from 'cesium';
import { CONFIG } from '../config.js';

// Zone severity heatmap, drawn as a 2D canvas laid directly ON TOP of the
// Cesium WebGL canvas (NOAA storm-map style: black-transparent background
// with a blurred red/orange/yellow glow over the hottest zones).
//
// Why a screen-space overlay instead of a 3D rectangle floating above the
// city: a flat sheet hovering in 3D space is easy to miss, gets occluded,
// and reads at a weird angle. Instead we project each zone's REAL lon/lat
// through the live camera every frame to get its screen pixel, then draw a
// soft glowing blob there. The result stays locked to the tilted 3D city as
// you pan/zoom, is always drawn on top, and looks like the reference map.
//
// Per frame:
//   1. Project every zone center (and a 1-cell-east offset, to size the
//      blob in screen pixels under the current zoom/perspective).
//   2. Draw a soft radial gradient per zone, additively blended, so
//      overlapping hot zones brighten into one continuous glow.
//   3. Color comes from a continuous black->red->orange->yellow->white ramp
//      driven by each zone's 0..1 score, not just its 4-way severity bucket.

const BLOB_RADIUS_CELLS = 1.3; // glow reach, in zone-cell widths
const MIN_BLOB_PX = 26;
const SCORE_FLOOR = 0.04; // don't draw essentially-cold zones

export function createZoneOverlay(world, zones) {
  const viewer = world.viewer;
  const sceneCanvas = viewer.scene.canvas;
  const parent = sceneCanvas.parentNode;

  const overlay = document.createElement('canvas');
  Object.assign(overlay.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    zIndex: '10',
  });
  parent.appendChild(overlay);
  const ctx = overlay.getContext('2d');

  let currentZones = zones;
  const lonStep = (CONFIG.aoi.east - CONFIG.aoi.west) / CONFIG.zonesX;

  // Cesium renamed this helper over versions — support both.
  const toWindow =
    Cesium.SceneTransforms.worldToWindowCoordinates ||
    Cesium.SceneTransforms.wgs84ToWindowCoordinates;

  function syncSize() {
    const w = sceneCanvas.clientWidth;
    const h = sceneCanvas.clientHeight;
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
  }

  function project(lon, lat) {
    const h = world.heightAt(lon, lat);
    const cart = Cesium.Cartesian3.fromDegrees(lon, lat, h);
    const win = toWindow(viewer.scene, cart);
    return win || null;
  }

  function render() {
    syncSize();
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Pass 1: additive glow blobs.
    ctx.globalCompositeOperation = 'lighter';
    const labelPts = [];

    for (const z of currentZones) {
      if (z.score < SCORE_FLOOR) continue;
      const { cx, cz } = z.bounds; // cx = lon, cz = lat

      const c = project(cx, cz);
      if (!c) continue;
      const e = project(cx + lonStep, cz);

      let cellPx = MIN_BLOB_PX;
      if (e) cellPx = Math.max(MIN_BLOB_PX, Math.hypot(e.x - c.x, e.y - c.y));
      const blobR = cellPx * BLOB_RADIUS_CELLS;

      const [r, g, b] = heatColor(z.score);
      const peakAlpha = 0.3 + 0.55 * z.score;
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, blobR);
      grad.addColorStop(0, `rgba(${r},${g},${b},${peakAlpha})`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${peakAlpha * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, blobR, 0, Math.PI * 2);
      ctx.fill();

      if (z.severity !== 'safe') labelPts.push({ x: c.x, y: c.y, label: z.label });
    }

    // Pass 2: crisp zone labels on top of the glow.
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of labelPts) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(p.label, p.x + 0.6, p.y + 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(p.label, p.x, p.y);
    }
  }

  // Redraw every rendered frame so the glow tracks the camera as it moves,
  // not just when the simulation steps.
  const removeListener = viewer.scene.postRender.addEventListener(render);

  function update(zones) {
    currentZones = zones;
    // next postRender picks it up; also draw now for immediate feedback
    render();
  }

  render();

  return {
    update,
    destroy() {
      removeListener();
      overlay.remove();
    },
  };
}

// Continuous black -> deep red -> red -> orange -> yellow -> near-white ramp,
// matching NOAA-style storm/risk heatmaps. t is 0..1.
function heatColor(t) {
  const stops = [
    [0.0, [40, 0, 0]],
    [0.25, [120, 0, 0]],
    [0.5, [214, 39, 61]], // CONFIG.colors.critical
    [0.72, [244, 96, 54]], // CONFIG.colors.dangerous
    [0.88, [242, 193, 78]], // CONFIG.colors.moderate
    [1.0, [255, 255, 220]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [t0, c0] = stops[i - 1];
    const [t1, c1] = stops[i];
    if (t <= t1 || i === stops.length - 1) {
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)];
    }
  }
  return stops[stops.length - 1][1];
}

function lerp(a, b, f) {
  return Math.round(a + (b - a) * Math.min(1, Math.max(0, f)));
}
