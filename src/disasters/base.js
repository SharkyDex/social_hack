// Every disaster implements this interface so main.js and the UI never need
// to know which one is active:
//
//   init(world, zones)         — called once when the disaster is selected/started
//   step(dt, world, zones)     — called every frame; mutate zone.hazard (0..1)
//                                 and zone.roadBlocked (bool) in place
//   render(scene, world)       — update/create any visual (water entity,
//                                 fire overlay, etc.); called every frame.
//                                 `scene` is viewer.scene, `world` carries
//                                 `world.viewer` for adding Cesium entities.
//   reset(scene, world)        — remove visuals and zero out hazard, for
//                                 switching disasters without reloading
//   isFinished(zones)          — true once the event has run its course, so
//                                 the app can stop the loop and export the
//                                 zone report. Defaults to never.
//
// world = { viewer, heightAt } — heightAt(lon, lat) returns real terrain
// elevation in meters (see src/world/cesiumWorld.js).

export class Disaster {
  get name() {
    return 'unnamed';
  }
  init(_world, _zones) {}
  step(_dt, _world, _zones) {}
  render(_scene, _world) {}
  reset(_scene, _world) {}
  isFinished(_zones) {
    return false;
  }
}
