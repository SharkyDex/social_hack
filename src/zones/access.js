import { zoneNeighbors } from '../utils/grid.js';

// Hospital reachability: BFS over the zone grid, where an edge is "blocked"
// if either zone touching it is cut off (flooded road, burned-through, etc).
// zone.roadBlocked is set by the active disaster before this runs.

export function updateHospitalAccess(zones) {
  const hospitalIds = zones.filter((z) => z.hasHospital).map((z) => z.id);

  // reachable[] starts false; BFS outward from each hospital zone.
  const reachable = new Array(zones.length).fill(false);
  const queue = [];
  for (const id of hospitalIds) {
    if (!zones[id].roadBlocked) {
      reachable[id] = true;
      queue.push(id);
    }
  }

  while (queue.length) {
    const current = queue.shift();
    for (const n of zoneNeighbors(current)) {
      if (reachable[n] || zones[n].roadBlocked) continue;
      reachable[n] = true;
      queue.push(n);
    }
  }

  for (const z of zones) z.hospitalReachable = reachable[z.id];
  return zones;
}
