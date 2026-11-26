// GeoOcean: reuses Core's Water (Gerstner waves, shoaling, foam, swash, CPU heightAt) for GeoWorld.
// Water reads ground height from a texture; here that texture is a camera-centred window sampled from GeoWorld.heightAt (the authoritative terrain),
// so coast, shoaling and foam follow the real DEM. Wind/sea/tide come from the shared Environment. Beyond the window, the cheap far plane in the manager takes over.
import * as THREE from 'three';
import { Water } from '../water.js';

const N = 384, S = 8000, W = N + 1, REBUILD = 1500, ROWS = 48;   // 20.8 m texels over an 8 km window; rebuilt after 1.5 km of travel, 48 rows per frame

export class GeoOcean {
  constructor(geo) {
    this.geo = geo; this.cx = 0; this.cz = 0; this.job = null; this.ready = false;
    this.h = new Float32Array(W * W).fill(-50);
    this.tex = new THREE.DataTexture(this.h, W, W, THREE.RedFormat, THREE.FloatType); this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.needsUpdate = true;
    this.src = { uniforms: { uHeight: { value: this.tex }, uN: { value: N }, uS: { value: S }, uTC: { value: new THREE.Vector2() } }, hAt: (x, z) => this.hAt(x, z) };
    const a = geo.a; this.water = new Water(a.shared, this.src, a.env); this.mesh = this.water.mesh; geo.group.add(this.mesh); this.mesh.visible = true;
    this.stats = { rebuilds: 0 };
  }
  /* render-space ground height (same space the shader uses); window is stored in world metres so floating-origin rebases never invalidate it */
  hAt(x, z) { return this.geo.heightAt(x + this.geo.origin.x, z + this.geo.origin.z); }
  /* CPU wave height at world metres, for buoyancy/physics: the same query the shader mirrors */
  heightAt(x, z, t = this.geo.a.shared.uTime.value) { return this.water.heightAt(x - this.geo.origin.x, z - this.geo.origin.z, t); }
  start(wx, wz) { this.job = { cx: Math.round(wx / 20.8) * 20.8, cz: Math.round(wz / 20.8) * 20.8, row: 0, h: new Float32Array(W * W) }; }
  step() {
    const j = this.job, g = this.geo, cell = S / N, x0 = j.cx - S / 2, z0 = j.cz - S / 2, end = Math.min(W, j.row + ROWS);
    for (let r = j.row; r < end; r++) for (let c = 0; c < W; c++) j.h[r * W + c] = g.heightAt(x0 + c * cell, z0 + r * cell);
    j.row = end;
    if (end >= W) { this.h.set(j.h); this.tex.needsUpdate = true; this.cx = j.cx; this.cz = j.cz; this.job = null; this.ready = true; this.stats.rebuilds++; }
  }
  update(dt, cam) {
    const g = this.geo, o = g.origin, wx = cam.position.x + o.x, wz = cam.position.z + o.z;
    if (!this.job && (!this.ready || Math.hypot(wx - this.cx, wz - this.cz) > REBUILD)) this.start(wx, wz);
    if (this.job) this.step();
    this.src.uniforms.uTC.value.set(this.cx - o.x, this.cz - o.z);
    this.water.u.uTC.value.copy(this.src.uniforms.uTC.value);
    const env = g.a.env; this.water.update(dt, cam, env.p, env);
  }
  dispose() { this.tex.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
