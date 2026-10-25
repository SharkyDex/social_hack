// Shared settings. Change values here instead of hard-coding them in modules.

export const CONFIG = {
  seed: 42,

  // Cesium ion access token — read from .env (see .env.example). Needed for
  // real terrain + imagery + OSM 3D Buildings.
  cesiumToken: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_CESIUM_ION_TOKEN) || '',

  // Area of interest: centered on the University of Minnesota (Twin
  // Cities) campus, which straddles the Mississippi river — same size box
  // as before, just recentered. Change these to simulate a different area.
  aoi: {
    west: -93.2744,
    south: 44.9442,
    east: -93.1794,
    north: 45.0042,
    centerLon: -93.2269,
    centerLat: 44.9742,
  },

  // Zone grid overlaid on the AOI: a clean 10x10 square (100 zones).
  zonesX: 10,
  zonesZ: 10,

  // Resolution of the pre-sampled real-terrain heightmap (res x res points
  // across the AOI, bilinearly interpolated at query time).
  heightSampleRes: 48,

  // Severity thresholds on the combined 0-1 score (see src/zones/scoring.js)
  thresholds: {
    critical: 0.6,
    dangerous: 0.4,
    moderate: 0.2,
  },

  // Weights for the combined score. Should add up to 1.
  weights: {
    hazard: 0.55,
    vulnerability: 0.25,
    access: 0.2,
  },

  colors: {
    critical: 0xd7263d,
    dangerous: 0xf46036,
    moderate: 0xf2c14e,
    safe: 0x3ba55c,
  },
};
