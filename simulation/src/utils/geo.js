// Small geo helpers shared across disasters. The AOI is only a few
// kilometers across, so a flat equirectangular approximation is accurate
// enough — no need for full haversine.

const R = 6371000; // Earth radius, meters

export function distanceMeters(lon1, lat1, lon2, lat2) {
  const avgLatRad = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const dx = (lon2 - lon1) * (Math.PI / 180) * R * Math.cos(avgLatRad);
  const dy = (lat2 - lat1) * (Math.PI / 180) * R;
  return Math.sqrt(dx * dx + dy * dy);
}

// Samples heightAt over a grid across the AOI and returns {min, max}.
export function sampleElevationRange(heightAt, aoi, n = 12) {
  const { west, south, east, north } = aoi;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const lon = west + ((east - west) * i) / n;
      const lat = south + ((north - south) * j) / n;
      const h = heightAt(lon, lat);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { min, max };
}
