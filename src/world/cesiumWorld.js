import * as Cesium from 'cesium';
import { CONFIG } from '../config.js';

// Sets up the real-world view: Cesium World Terrain (real elevation data)
// and OSM 3D Buildings, flown to the chosen AOI (src/config.js). Also builds
// a synchronous heightAt(lon, lat) sampler so the rest of the app (flood,
// zone scoring) doesn't need to deal with Cesium's async terrain queries
// every frame — we sample a grid once up front and interpolate.

export async function createWorld() {
  if (!CONFIG.cesiumToken) {
    throw new Error(
      'Missing Cesium ion token. Copy .env.example to .env and set VITE_CESIUM_ION_TOKEN (see README).'
    );
  }
  Cesium.Ion.defaultAccessToken = CONFIG.cesiumToken;

  const viewer = new Cesium.Viewer('cesiumContainer', {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    baseLayerPicker: false,
    timeline: false,
    animation: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });
  viewer.scene.globe.depthTestAgainstTerrain = true;

  const osmBuildings = await Cesium.createOsmBuildingsAsync();
  viewer.scene.primitives.add(osmBuildings);

  const { west, south, east, north, centerLon, centerLat } = CONFIG.aoi;
  viewer.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
  });
  // Nudge into a nicer angled view after the initial fit.
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 3200),
    orientation: { heading: Cesium.Math.toRadians(20), pitch: Cesium.Math.toRadians(-40), roll: 0 },
    duration: 1.5,
  });

  const heightAt = await buildHeightSampler(viewer.terrainProvider);

  return { viewer, heightAt };
}

async function buildHeightSampler(terrainProvider) {
  const res = CONFIG.heightSampleRes;
  const { west, south, east, north } = CONFIG.aoi;

  const positions = [];
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const lon = west + ((east - west) * i) / (res - 1);
      const lat = south + ((north - south) * j) / (res - 1);
      positions.push(Cesium.Cartographic.fromDegrees(lon, lat));
    }
  }

  const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, positions);
  const grid = new Float32Array(res * res);
  sampled.forEach((c, idx) => {
    grid[idx] = c.height;
  });

  // Bilinear interpolation, lon/lat in, meters out.
  return function heightAt(lon, lat) {
    const fx = Math.max(0, Math.min(res - 1.0001, ((lon - west) / (east - west)) * (res - 1)));
    const fy = Math.max(0, Math.min(res - 1.0001, ((lat - south) / (north - south)) * (res - 1)));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const h00 = grid[y0 * res + x0];
    const h10 = grid[y0 * res + x0 + 1];
    const h01 = grid[(y0 + 1) * res + x0];
    const h11 = grid[(y0 + 1) * res + x0 + 1];
    return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
  };
}
