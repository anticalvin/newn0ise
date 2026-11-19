// TerrainService: editable 256 x 256 m heightfield (1 m cells) + paint masks + footprints.
// Single source of truth for rendering, collision, placement and (later) navmesh queries.
import * as THREE from 'three';
import { patchStandard } from './glsl.js';
import { makeNoise, clamp, lerp, smooth, zip, unzip, b64, unb64 } from './util.js';

export const N = 256, S = 256, PN = 512, FN = 1024, W = N + 1;

const VHEAD = `uniform sampler2D uHeight; uniform float uN; uniform float uS; varying vec3 vWP; varying vec3 vONorm;
float n0H(ivec2 p){ return texelFetch(uHeight, clamp(p, ivec2(0), ivec2(int(uN))), 0).r; }`;
const VNORMAL = `
vec2 n0g = (position.xz / uS + 0.5) * uN; ivec2 n0i = ivec2(floor(n0g + 0.5));
float n0c = n0H(n0i);
float n0l = n0H(n0i + ivec2(-1,0)), n0r = n0H(n0i + ivec2(1,0)), n0d = n0H(n0i + ivec2(0,-1)), n0u = n0H(n0i + ivec2(0,1));
vec3 objectNormal = normalize(vec3(n0l - n0r, 2.0 * uS / uN, n0d - n0u));`;
const VBEGIN = `vec3 transformed = vec3(position.x, n0c, position.z); vWP = transformed; vONorm = objectNormal;`;

const FHEAD = `uniform sampler2D uPaint; uniform sampler2D uPrints; uniform float uS; uniform float uTime; uniform float uWater; uniform float uSwash;
varying vec3 vWP; varying vec3 vONorm;`;
const FCOLOR = `
vec3 n0N = normalize(vONorm);
vec2 n0uv = vWP.xz / uS + 0.5;
vec4 n0p = texture2D(uPaint, n0uv);
float n0pr = texture2D(uPrints, n0uv).r;
float n0slope = 1.0 - n0N.y;
float n0h = vWP.y;
float n0dist = length(vViewPosition);
float n0near = 1.0 - smoothstep(18.0, 70.0, n0dist);
float n0nz = n0fbm(vWP.xz * 0.35);
float n0nz2 = n0fbm(vWP.xz * 2.3 + 11.0);
float n0run = uWater + uSwash * (0.5 + 0.5 * sin(uTime * 0.55 + n0nz * 4.0));
float n0wet = 1.0 - smoothstep(n0run - 0.02, n0run + 0.30 + 0.30 * n0nz, n0h);
float n0sub = 1.0 - smoothstep(uWater - 0.15, uWater + 0.02, n0h);
vec3 n0sandD = mix(vec3(0.50, 0.38, 0.22), vec3(0.66, 0.53, 0.33), n0nz) * (0.90 + 0.20 * n0nz2);
float n0ph = (vWP.x * 0.9 + vWP.z * 0.35) * 3.0 + n0nz * 9.0;
float n0rip = sin(n0ph) * 0.5 + 0.5;
n0sandD *= 0.94 + 0.09 * n0rip * (1.0 - n0wet) * n0near;
vec3 n0sandW = n0sandD * vec3(0.50, 0.46, 0.43);
vec3 n0col = mix(n0sandD, n0sandW, n0wet);
vec3 n0rock = mix(vec3(0.09, 0.085, 0.08), vec3(0.24, 0.21, 0.18), n0fbm(vWP.xz * 0.9 + vWP.y * 0.8)) * (0.75 + 0.5 * n0nz2);
vec3 n0grass = mix(vec3(0.040, 0.075, 0.020), vec3(0.115, 0.150, 0.040), n0nz) * (0.8 + 0.4 * n0nz2);
float n0force = n0p.b;
float n0rockW = clamp(smoothstep(0.30, 0.48, n0slope + n0p.r * 0.7 - n0force * 0.7 + (n0nz - 0.5) * 0.12), 0.0, 1.0);
float n0grassW = clamp(smoothstep(1.5, 2.8, n0h + (n0nz - 0.5) * 1.8) * (1.0 - smoothstep(0.20, 0.34, n0slope)) + n0p.g, 0.0, 1.0) * (1.0 - n0force);
n0grassW *= 1.0 - n0rockW;
n0col = mix(n0col, n0grass, n0grassW);
n0col = mix(n0col, n0rock, n0rockW);
float n0foamL = exp(-pow((n0h - n0run) / 0.07, 2.0)) * (0.35 + 0.65 * n0fbm(vWP.xz * 1.7 + uTime * 0.1));
n0col = mix(n0col, vec3(0.85, 0.88, 0.86), clamp(n0foamL * 0.5, 0.0, 0.6) * (1.0 - n0rockW));
n0col = mix(n0col, n0col * vec3(0.55, 0.74, 0.72), n0sub * 0.6);
n0col *= 1.0 - 0.40 * n0pr * (1.0 - n0wet * 0.5) * (1.0 - n0rockW) * (1.0 - n0grassW);
diffuseColor.rgb = n0col;
float n0rough = mix(mix(0.97, 0.38, n0wet), 0.9, n0rockW);
n0rough = mix(n0rough, 0.95, n0grassW);`;
const FROUGH = `float roughnessFactor = n0rough;`;
const FNORMAL = `{
  vec3 dn = vec3(0.0);
  float sandOnly = (1.0 - n0wet) * (1.0 - n0rockW) * (1.0 - n0grassW);
  dn += vec3(0.9, 0.0, 0.35) * cos(n0ph) * 3.0 * 0.04 * sandOnly * n0near;
  dn += vec3(n0noise(vWP.xz * 14.0) - 0.5, 0.0, n0noise(vWP.xz * 14.0 + 31.0) - 0.5) * 0.22 * n0near;
  dn += vec3(n0noise(vWP.xz * 3.1) - 0.5, 0.0, n0noise(vWP.xz * 3.1 + 7.0) - 0.5) * 0.9 * n0rockW;
  vec2 pe = vec2(1.0 / 1024.0, 0.0);
  float fa = texture2D(uPrints, n0uv - pe.xy).r, fb = texture2D(uPrints, n0uv + pe.xy).r, fc = texture2D(uPrints, n0uv - pe.yx).r, fd = texture2D(uPrints, n0uv + pe.yx).r;
  dn += vec3(fa - fb, 0.0, fc - fd) * 3.0;
  normal = normalize(normal + (viewMatrix * vec4(dn, 0.0)).xyz);
}`;

export class Terrain {
  constructor(shared) {
    this.shared = shared;
    this.h = new Float32Array(W * W); this.base = new Float32Array(W * W);
    this.paint = new Uint8Array(PN * PN * 4); this.p32 = new Uint32Array(this.paint.buffer);
    this.prints = new Uint8Array(FN * FN);
    this.hTex = new THREE.DataTexture(this.h, W, W, THREE.RedFormat, THREE.FloatType);
    this.hTex.minFilter = this.hTex.magFilter = THREE.NearestFilter;
    this.pTex = new THREE.DataTexture(this.paint, PN, PN, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.pTex.minFilter = this.pTex.magFilter = THREE.LinearFilter;
    this.fTex = new THREE.DataTexture(this.prints, FN, FN, THREE.RedFormat, THREE.UnsignedByteType);
    this.fTex.minFilter = this.fTex.magFilter = THREE.LinearFilter;
    this.uniforms = { uHeight: { value: this.hTex }, uPaint: { value: this.pTex }, uPrints: { value: this.fTex }, uN: { value: N }, uS: { value: S } };
    // grid geometry: vertex positions only, height is displaced in the shader from uHeight
    const pos = new Float32Array(W * W * 3); let k = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { pos[k++] = (i / N - 0.5) * S; pos[k++] = 0; pos[k++] = (j / N - 0.5) * S; }
    const idx = new Uint32Array(N * N * 6); k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.set([a, c, b, b, c, d], k); k += 6; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
    const mat = patchStandard(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), shared,
      { uniforms: this.uniforms, vHead: VHEAD, vNormal: VNORMAL, vBegin: VBEGIN, fHead: FHEAD, fColor: FCOLOR, fRough: FROUGH, fNormal: FNORMAL }, 'terrain');
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = true;
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    dm.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform sampler2D uHeight; uniform float uN; uniform float uS;')
        .replace('#include <begin_vertex>', `ivec2 ti = ivec2(floor((position.xz / uS + 0.5) * uN + 0.5));
         vec3 transformed = vec3(position.x, texelFetch(uHeight, clamp(ti, ivec2(0), ivec2(int(uN))), 0).r, position.z);`); };
    dm.customProgramCacheKey = () => 'n0_terrain_depth';
    this.mesh.customDepthMaterial = dm;
    this.stroke = null; this.dirtyH = false; this.dirtyP = false; this.dirtyF = false; this.rev = 0;
    this.generate(101);
  }

  // ---- generation: island with a west-facing cove, sandy beach, dunes, hills and rocky flanks ----
  generate(seed) {
    this.seed = seed;
    const nz = makeNoise(seed), nz2 = makeNoise(seed + 99);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = (i / N - 0.5) * S, z = (j / N - 0.5) * S;
      const wx = x + 36 * nz.fbm(x * 0.006 + 3.1, z * 0.006, 3), wz = z + 36 * nz.fbm(x * 0.006, z * 0.006 + 8.7, 3);
      let d = Math.hypot(wx - 18, wz * 1.05) / 112;
      d += 0.55 * Math.exp(-((wx + 88) ** 2 + wz ** 2) / (2 * 46 * 46));
      const t = 1 - smooth(0.16, 1.14, d);
      const hb = lerp(-6.5, 0.95, Math.pow(smooth(0.0, 0.56, t), 0.92));
      const hills = smooth(0.50, 0.92, t) * (3 + 24 * Math.pow(Math.max(0, nz.fbm(x * 0.008, z * 0.008, 5) * 1.3 + 0.2), 1.3) + 7 * Math.abs(nz2.fbm(x * 0.02, z * 0.02, 3)));
      const dunes = 0.55 * nz2.fbm(x * 0.045 + 5, z * 0.045, 3) * smooth(0.38, 0.55, t) * (1 - smooth(0.55, 0.80, t)) + 0.12 * nz.fbm(x * 0.2, z * 0.2, 2) * smooth(0.4, 0.6, t);
      this.h[j * W + i] = hb + hills + dunes;
    }
    this.base.set(this.h); this.paint.fill(0); this.prints.fill(0);
    this.dirtyH = this.dirtyP = this.dirtyF = true; this.rev++;
  }

  // ---- CPU queries (used by physics, placement, camera, brush) ----
  hAt(x, z) {
    let gx = (x / S + 0.5) * N, gz = (z / S + 0.5) * N;
    gx = clamp(gx, 0, N - 1e-3); gz = clamp(gz, 0, N - 1e-3);
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, h = this.h, a = j * W + i;
    return lerp(lerp(h[a], h[a + 1], fx), lerp(h[a + W], h[a + W + 1], fx), fz);
  }
  nAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0, hl = this.hAt(x - e, z), hr = this.hAt(x + e, z), hd = this.hAt(x, z - e), hu = this.hAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }
  ray(o, d, max = 700) {
    let t = 0, prev = 0, pv = o.y - this.hAt(o.x, o.z);
    const step = 1.5;
    while (t < max) {
      t += step; const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (Math.abs(x) > S / 2 + 4 || Math.abs(z) > S / 2 + 4) { if (y < 0 && d.y < 0) break; continue; }
      const v = y - this.hAt(x, z);
      if (v < 0 && pv >= 0) { let a = prev, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (o.y + d.y * m - this.hAt(o.x + d.x * m, o.z + d.z * m) > 0) a = m; else b = m; }
        const tt = (a + b) / 2; return new THREE.Vector3(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt); }
      prev = t; pv = v;
    }
    return null;
  }

  // ---- brushes: raise/lower/smooth/flatten (height) and sand/rock/grass (paint) ----
  beginStroke() { this.stroke = { hMap: new Map(), pMap: new Map(), flat: null }; }
  brush(tool, x, z, R, strength, dt, invert) {
    if (!this.stroke) this.beginStroke();
    const st = this.stroke;
    if (tool === 'raise' || tool === 'lower' || tool === 'smooth' || tool === 'flatten') {
      const ci = (x / S + 0.5) * N, cj = (z / S + 0.5) * N, r = R / (S / N);
      if (tool === 'flatten' && st.flat == null) st.flat = this.hAt(x, z);
      for (let j = Math.max(1, Math.floor(cj - r)); j <= Math.min(N - 1, Math.ceil(cj + r)); j++)
        for (let i = Math.max(1, Math.floor(ci - r)); i <= Math.min(N - 1, Math.ceil(ci + r)); i++) {
          const dd = Math.hypot(i - ci, j - cj) / r; if (dd >= 1) continue;
          const f = (1 - dd * dd) ** 2, id = j * W + i;
          if (!st.hMap.has(id)) st.hMap.set(id, this.h[id]);
          if (tool === 'raise' || tool === 'lower') this.h[id] += strength * 5 * dt * f * ((tool === 'raise') !== invert ? 1 : -1);
          else if (tool === 'smooth') { const a = (this.h[id - 1] + this.h[id + 1] + this.h[id - W] + this.h[id + W]) / 4; this.h[id] += (a - this.h[id]) * clamp(strength * 10 * dt * f, 0, 1); }
          else this.h[id] += (st.flat - this.h[id]) * clamp(strength * 8 * dt * f, 0, 1);
        }
      this.dirtyH = true; this.rev++;
    } else if (tool === 'sand' || tool === 'rock' || tool === 'grass') {
      const ci = (x / S + 0.5) * PN, cj = (z / S + 0.5) * PN, r = R / (S / PN), amt = strength * dt * 3.5;
      for (let j = Math.max(0, Math.floor(cj - r)); j <= Math.min(PN - 1, Math.ceil(cj + r)); j++)
        for (let i = Math.max(0, Math.floor(ci - r)); i <= Math.min(PN - 1, Math.ceil(ci + r)); i++) {
          const dd = Math.hypot(i - ci, j - cj) / r; if (dd >= 1) continue;
          const f = (1 - dd * dd) ** 2 * amt * 255, id = j * PN + i, o = id * 4, P = this.paint;
          if (!st.pMap.has(id)) st.pMap.set(id, this.p32[id]);
          const s = invert ? -1 : 1;
          if (tool === 'rock') { P[o] = clamp(P[o] + s * f, 0, 255); if (!invert) P[o + 2] = clamp(P[o + 2] - f, 0, 255); }
          else if (tool === 'grass') { P[o + 1] = clamp(P[o + 1] + s * f, 0, 255); if (!invert) { P[o] = clamp(P[o] - f, 0, 255); P[o + 2] = clamp(P[o + 2] - f, 0, 255); } }
          else { P[o + 2] = clamp(P[o + 2] + s * f, 0, 255); if (!invert) { P[o] = clamp(P[o] - f, 0, 255); P[o + 1] = clamp(P[o + 1] - f, 0, 255); } }
        }
      this.dirtyP = true;
    }
  }
  endStroke() {
    const st = this.stroke; this.stroke = null; if (!st) return null;
    const patch = {};
    if (st.hMap.size) { const idx = Int32Array.from(st.hMap.keys()); patch.h = { idx, before: Float32Array.from(st.hMap.values()), after: Float32Array.from(idx, i => this.h[i]) }; }
    if (st.pMap.size) { const idx = Int32Array.from(st.pMap.keys()); patch.p = { idx, before: Uint32Array.from(st.pMap.values()), after: Uint32Array.from(idx, i => this.p32[i]) }; }
    return (patch.h || patch.p) ? patch : null;
  }
  applyPatch(patch, which) {
    if (patch.h) { const v = patch.h[which]; patch.h.idx.forEach((id, k) => { this.h[id] = v[k]; }); this.dirtyH = true; this.rev++; }
    if (patch.p) { const v = patch.p[which]; patch.p.idx.forEach((id, k) => { this.p32[id] = v[k]; }); this.dirtyP = true; }
  }
  // footprint stamp (visual only; not saved)
  stamp(x, z, r = 0.3, a = 1) {
    const ci = (x / S + 0.5) * FN, cj = (z / S + 0.5) * FN, rr = r / (S / FN);
    for (let j = Math.floor(cj - rr); j <= Math.ceil(cj + rr); j++) for (let i = Math.floor(ci - rr); i <= Math.ceil(ci + rr); i++) {
      if (i < 0 || j < 0 || i >= FN || j >= FN) continue;
      const dd = Math.hypot(i - ci, (j - cj) * 1.0) / rr; if (dd >= 1) continue;
      const id = j * FN + i; this.prints[id] = Math.max(this.prints[id], (1 - dd * dd) * 255 * a);
    }
    this.dirtyF = true;
  }
  flush() {
    if (this.dirtyH) { this.hTex.needsUpdate = true; this.dirtyH = false; }
    if (this.dirtyP) { this.pTex.needsUpdate = true; this.dirtyP = false; }
    if (this.dirtyF) { this.fTex.needsUpdate = true; this.dirtyF = false; }
  }
  // ---- persistence: only the delta from the seeded base, compressed ----
  async pack() {
    const idx = []; for (let i = 0; i < this.h.length; i++) if (Math.abs(this.h[i] - this.base[i]) > 1e-3) idx.push(i);
    const iu = Uint32Array.from(idx), vu = Float32Array.from(idx, i => this.h[i]);
    const merged = new Uint8Array(4 + iu.byteLength + vu.byteLength); new DataView(merged.buffer).setUint32(0, idx.length, true);
    merged.set(new Uint8Array(iu.buffer), 4); merged.set(new Uint8Array(vu.buffer), 4 + iu.byteLength);
    return { seed: this.seed, h: await zip(merged), paint: await zip(this.paint) };
  }
  async unpack(o) {
    this.generate(o.seed);
    const m = await unzip(o.h), n = new DataView(m.buffer, m.byteOffset).getUint32(0, true);
    const iu = new Uint32Array(m.slice(4, 4 + n * 4).buffer), vu = new Float32Array(m.slice(4 + n * 4, 4 + n * 8).buffer);
    iu.forEach((id, k) => { this.h[id] = vu[k]; });
    this.paint.set(await unzip(o.paint)); this.dirtyH = this.dirtyP = true; this.rev++;
  }
}
