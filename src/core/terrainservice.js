// TerrainService: the one interface gameplay code uses to ask "what is the ground here?", whichever terrain is active.
//   heightAt(x, z)   ground height in metres (the surface you would stand on, ignoring buildings)
//   normalAt(x, z)   unit up-vector [x, y, z] of the surface
//   materialAt(x, z) 'water' | 'sand' | 'grass' | 'rock' | 'floor'
// Core's island/level terrain (terrain.js) and the streamed world (geo/manager.js) both keep their own data and their own methods; this file adapts them.
// Honest status: new code should use app.ground (this interface). Older callers still use terrain.hAt and geo.heightAt directly.
const EPS = 0.5;
export function normalFrom(heightAt, x, z) {
  const dx = heightAt(x + EPS, z) - heightAt(x - EPS, z), dz = heightAt(x, z + EPS) - heightAt(x, z - EPS), l = Math.hypot(dx, 2 * EPS, dz);
  return [-dx / l, 2 * EPS / l, -dz / l];
}
export function coreTerrainService(app) {
  const T = app.terrain;
  return {
    name: 'core',
    heightAt: (x, z) => T.hAt(x, z),
    normalAt: (x, z) => normalFrom((a, b) => T.hAt(a, b), x, z),
    materialAt: (x, z) => { if (app.level) return 'floor'; const h = T.hAt(x, z); return h < app.water.level + 0.3 ? 'water' : h < 2.4 ? 'sand' : normalFrom((a, b) => T.hAt(a, b), x, z)[1] < 0.8 ? 'rock' : 'grass'; },
  };
}
export function geoTerrainService(geo) {
  return {
    name: 'geo',
    heightAt: (x, z) => geo.heightAt(x, z),
    normalAt: (x, z) => normalFrom((a, b) => geo.heightAt(a, b), x, z),
    materialAt: (x, z) => { const h = geo.heightAt(x, z); return h < 0.2 ? 'water' : normalFrom((a, b) => geo.heightAt(a, b), x, z)[1] < 0.8 ? 'rock' : 'grass'; },
  };
}
// the active service: the streamed world while it is on, otherwise Core's terrain
export function activeGround(app, core, geo) { return app.geo && app.geo.active ? geo : core; }
