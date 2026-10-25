import * as Cesium from 'cesium';
import { CONFIG } from '../config.js';
import { makeNoise2D } from '../utils/random.js';

// Zone severity heatmap, drawn as a 2D canvas on top of the Cesium canvas and
// projected through the live camera so it stays locked to the tilted city.
//
// Realism techniques (vs. a plain radial gradient, which looks Gaussian):
//   • DOMAIN WARPING — the sample coordinates are bent by low-frequency noise
//     before lookup, so class boundaries flow and filament instead of rounding
//     into circles. This is the big "organic map" win.
//   • MULTI-OCTAVE + FINE GRAIN NOISE — a broad noise sets the overall patch
//     shape, a finer noise adds speckle, like a real land-cover raster.
//   • LAYERED COLOR RAMP — a continuous yellow→orange→red→dark-red ramp,
//     lightly quantized into bands, so intensity reads as stacked layers
//     rather than 3 flat colors.
//   • SEE-THROUGH — the whole field is composited opaquely offscreen then
//     blitted once at a low alpha, so streets/buildings stay readable.
//
// Detail is decoupled from projection cost: we project a COARSE grid of AOI
// corners through Cesium, then subdivide each quad in screen space (cheap
// bilinear interpolation, no extra projection) and sample the field there.

const PROJ_N = 22; // coarse projected grid (Cesium projections = (PROJ_N+1)^2)
const SUB = 3; // screen-space subdivisions per coarse cell (detail multiplier)
const NOISE_AMP = 0.2; // broad noise push on the score
const FINE_AMP = 0.1; // fine speckle push
const NOISE_SCALE = 260; // broad patch frequency
const FINE_SCALE = 700; // speckle frequency
const WARP_SCALE = 170; // domain-warp frequency
const WARP_ZONES = 0.7; // domain-warp strength, in zone widths
const LAYER_ALPHA = 0.5; // overall transparency of the field (0..1)
const N_BANDS = 7; // ramp quantization steps (layered look)

const FACILITY_SYMBOL = {
  hospital: '🏥',
  school: '🏫',
  college: '🎓',
  special_care: '🩺',
};

const fieldNoise = makeNoise2D(CONFIG.seed + 777);

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

  const field = document.createElement('canvas');
  const fctx = field.getContext('2d');

  let currentZones = zones;
  const { west, south, east, north } = CONFIG.aoi;
  const zoneWidthDeg = (east - west) / CONFIG.zonesX;

  const toWindow =
    Cesium.SceneTransforms.worldToWindowCoordinates ||
    Cesium.SceneTransforms.wgs84ToWindowCoordinates;

  function syncSize() {
    const w = sceneCanvas.clientWidth;
    const h = sceneCanvas.clientHeight;
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
      field.width = w;
      field.height = h;
    }
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
  }

  function project(lon, lat) {
    const h = world.heightAt(lon, lat);
    const cart = Cesium.Cartesian3.fromDegrees(lon, lat, h);
    return toWindow(viewer.scene, cart) || null;
  }

  // Interpolate the per-zone score at a lon/lat (no noise — just the smooth
  // underlying field).
  function baseScore(lon, lat, grid) {
    const zx = CONFIG.zonesX;
    const zz = CONFIG.zonesZ;
    const fx = ((lon - west) / (east - west)) * zx - 0.5;
    const fy = ((lat - south) / (north - south)) * zz - 0.5;
    const ix0 = Math.max(0, Math.min(zx - 1, Math.floor(fx)));
    const iy0 = Math.max(0, Math.min(zz - 1, Math.floor(fy)));
    const ix1 = Math.min(zx - 1, ix0 + 1);
    const iy1 = Math.min(zz - 1, iy0 + 1);
    const tx = Math.max(0, Math.min(1, fx - ix0));
    const ty = Math.max(0, Math.min(1, fy - iy0));
    const s00 = grid[iy0 * zx + ix0];
    const s10 = grid[iy0 * zx + ix1];
    const s01 = grid[iy1 * zx + ix0];
    const s11 = grid[iy1 * zx + ix1];
    return s00 * (1 - tx) * (1 - ty) + s10 * tx * (1 - ty) + s01 * (1 - tx) * ty + s11 * tx * ty;
  }

  // Full field score: domain-warped base + broad noise + fine speckle.
  function fieldScore(lon, lat, grid) {
    const wAmt = WARP_ZONES * zoneWidthDeg;
    const wlon = lon + (fieldNoise(lon * WARP_SCALE, lat * WARP_SCALE, 3) - 0.5) * wAmt;
    const wlat = lat + (fieldNoise((lon + 11.3) * WARP_SCALE, (lat + 5.7) * WARP_SCALE, 3) - 0.5) * wAmt;
    const base = baseScore(wlon, wlat, grid);
    const broad = (fieldNoise(lon * NOISE_SCALE, lat * NOISE_SCALE, 5) - 0.5) * NOISE_AMP;
    const fine = (fieldNoise(lon * FINE_SCALE, lat * FINE_SCALE, 2) - 0.5) * FINE_AMP;
    return base + broad + fine;
  }

  function render() {
    syncSize();
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const zx = CONFIG.zonesX;
    const zz = CONFIG.zonesZ;
    const scoreGrid = new Float32Array(zx * zz);
    for (const z of currentZones) scoreGrid[z.coords.iz * zx + z.coords.ix] = z.score;

    // Project the coarse corner grid.
    const cols = PROJ_N + 1;
    const corners = new Array(cols * cols);
    for (let j = 0; j <= PROJ_N; j++) {
      for (let i = 0; i <= PROJ_N; i++) {
        const lon = west + (i / PROJ_N) * (east - west);
        const lat = south + (j / PROJ_N) * (north - south);
        corners[j * cols + i] = project(lon, lat);
      }
    }

    fctx.clearRect(0, 0, field.width, field.height);
    let anyPainted = false;

    for (let cj = 0; cj < PROJ_N; cj++) {
      for (let ci = 0; ci < PROJ_N; ci++) {
        const A = corners[cj * cols + ci]; // u0,v0
        const B = corners[cj * cols + ci + 1]; // u1,v0
        const C = corners[(cj + 1) * cols + ci + 1]; // u1,v1
        const D = corners[(cj + 1) * cols + ci]; // u0,v1
        if (!A || !B || !C || !D) continue;

        const lonL = west + (ci / PROJ_N) * (east - west);
        const lonR = west + ((ci + 1) / PROJ_N) * (east - west);
        const latT = south + (cj / PROJ_N) * (north - south);
        const latB = south + ((cj + 1) / PROJ_N) * (north - south);

        for (let sj = 0; sj < SUB; sj++) {
          for (let si = 0; si < SUB; si++) {
            const u0 = si / SUB;
            const u1 = (si + 1) / SUB;
            const v0 = sj / SUB;
            const v1 = (sj + 1) / SUB;
            const uc = (si + 0.5) / SUB;
            const vc = (sj + 0.5) / SUB;

            const lon = lonL + (lonR - lonL) * uc;
            const lat = latT + (latB - latT) * vc;
            const col = bandColor(fieldScore(lon, lat, scoreGrid));
            if (!col) continue;

            const p0 = bilerp(A, B, C, D, u0, v0);
            const p1 = bilerp(A, B, C, D, u1, v0);
            const p2 = bilerp(A, B, C, D, u1, v1);
            const p3 = bilerp(A, B, C, D, u0, v1);

            fctx.fillStyle = col;
            fctx.strokeStyle = col; // hide hairline seams between sub-cells
            fctx.lineWidth = 1;
            fctx.beginPath();
            fctx.moveTo(p0.x, p0.y);
            fctx.lineTo(p1.x, p1.y);
            fctx.lineTo(p2.x, p2.y);
            fctx.lineTo(p3.x, p3.y);
            fctx.closePath();
            fctx.fill();
            fctx.stroke();
            anyPainted = true;
          }
        }
      }
    }

    if (anyPainted) {
      ctx.globalAlpha = LAYER_ALPHA;
      ctx.drawImage(field, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Facility symbols + severity labels, crisp on top.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const z of currentZones) {
      const sym = z.facility ? FACILITY_SYMBOL[z.facility] : null;
      const showLabel = z.severity !== 'safe';
      if (!sym && !showLabel) continue;

      const c = project(z.bounds.cx, z.bounds.cz);
      if (!c) continue;

      if (sym) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(10,14,20,0.7)';
        ctx.arc(c.x, c.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = '15px -apple-system, system-ui, sans-serif';
        ctx.fillText(sym, c.x, c.y + 1);
      }

      if (showLabel) {
        const ly = c.y + (sym ? 20 : 0);
        ctx.font = '11px -apple-system, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(z.label, c.x + 0.6, ly + 0.6);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillText(z.label, c.x, ly);
      }
    }
  }

  const removeListener = viewer.scene.postRender.addEventListener(render);

  function update(zones) {
    currentZones = zones;
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

// Bilinear interpolation of a screen point inside a quad.
// A=top-left (u0,v0), B=top-right (u1,v0), C=bottom-right (u1,v1), D=bottom-left (u0,v1).
function bilerp(A, B, C, D, u, v) {
  const a = (1 - u) * (1 - v);
  const b = u * (1 - v);
  const c = u * v;
  const d = (1 - u) * v;
  return { x: A.x * a + B.x * b + C.x * c + D.x * d, y: A.y * a + B.y * b + C.y * c + D.y * d };
}

// Continuous yellow→orange→red→dark-red ramp, lightly quantized into bands.
// Scores below the "moderate" threshold return null (left see-through).
function bandColor(s) {
  const t0 = CONFIG.thresholds.moderate;
  if (s < t0) return null;
  const t = Math.min(1, (s - t0) / (1 - t0));
  const q = Math.min(1, Math.floor(t * N_BANDS) / (N_BANDS - 1)); // quantize into layers
  const [r, g, b] = ramp(q);
  return `rgb(${r},${g},${b})`;
}

function ramp(t) {
  const stops = [
    [0.0, [242, 193, 78]], // moderate yellow
    [0.4, [244, 96, 54]], // dangerous orange
    [0.72, [215, 38, 61]], // critical red
    [1.0, [120, 16, 28]], // deep red (worst)
  ];
  for (let i = 1; i < stops.length; i++) {
    const [a0, c0] = stops[i - 1];
    const [a1, c1] = stops[i];
    if (t <= a1 || i === stops.length - 1) {
      const f = a1 === a0 ? 0 : (t - a0) / (a1 - a0);
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)];
    }
  }
  return stops[stops.length - 1][1];
}

function lerp(a, b, f) {
  return Math.round(a + (b - a) * Math.min(1, Math.max(0, f)));
}
