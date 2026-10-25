import { CONFIG } from '../config.js';

// Zone ids are integers: id = ix + iz * zonesX.
// Note: "x" here means longitude and "z" means latitude — kept as x/z (and
// bounds.cx/cz, minX/minZ etc.) to match the rest of the codebase, which
// just treats these as "horizontal" and "depth" coordinates and doesn't
// care what they represent.

export function zoneIdOf(lon, lat) {
  const { west, south, east, north } = CONFIG.aoi;
  const ix = Math.floor(((lon - west) / (east - west)) * CONFIG.zonesX);
  const iz = Math.floor(((lat - south) / (north - south)) * CONFIG.zonesZ);
  if (ix < 0 || iz < 0 || ix >= CONFIG.zonesX || iz >= CONFIG.zonesZ) return -1;
  return ix + iz * CONFIG.zonesX;
}

export function zoneCoords(id) {
  return { ix: id % CONFIG.zonesX, iz: Math.floor(id / CONFIG.zonesX) };
}

export function zoneBounds(id) {
  const { west, south, east, north } = CONFIG.aoi;
  const { ix, iz } = zoneCoords(id);
  const lonStep = (east - west) / CONFIG.zonesX;
  const latStep = (north - south) / CONFIG.zonesZ;
  const minX = west + ix * lonStep;
  const minZ = south + iz * latStep;
  return { minX, minZ, maxX: minX + lonStep, maxZ: minZ + latStep, cx: minX + lonStep / 2, cz: minZ + latStep / 2 };
}

export function zoneNeighbors(id) {
  const { ix, iz } = zoneCoords(id);
  const out = [];
  if (ix > 0) out.push(id - 1);
  if (ix < CONFIG.zonesX - 1) out.push(id + 1);
  if (iz > 0) out.push(id - CONFIG.zonesX);
  if (iz < CONFIG.zonesZ - 1) out.push(id + CONFIG.zonesX);
  return out;
}

// Human-friendly label, e.g. "C4".
export function zoneLabel(id) {
  const { ix, iz } = zoneCoords(id);
  return String.fromCharCode(65 + ix) + (iz + 1);
}
