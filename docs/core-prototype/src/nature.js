// Vegetation + rocks. Palms and grass are INSTANCED FIELDS (stable ids per field, not one node per leaf).
import * as THREE from 'three';
import { patchStandard } from './glsl.js';
import { makeNoise, mulberry32, clamp, smooth } from './util.js';

function leafTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256); g.strokeStyle = '#5f9a3c'; g.lineCap = 'round';
  g.lineWidth = 7; g.beginPath(); g.moveTo(64, 256); g.lineTo(64, 0); g.stroke();
  for (let k = 0; k < 27; k++) {
    const y = 250 - k * 9, len = 60 * Math.sin(Math.PI * Math.min(1, (k / 27) * 0.95 + 0.05)) ** 0.8 + 4, drop = 16 + k * 0.2;
    g.lineWidth = 9.5 - k * 0.1;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.5, y - 5, 64 + s * len, y + drop); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  const r = mulberry32(7); g.fillStyle = '#8fb458';
  for (let k = 0; k < 15; k++) { const x = 8 + r() * 48, h = 28 + r() * 34, lean = (r() - 0.5) * 22;
    g.beginPath(); g.moveTo(x - 2.4, 64); g.quadraticCurveTo(x + lean * 0.3, 64 - h * 0.6, x + lean, 64 - h); g.quadraticCurveTo(x + lean * 0.3 + 1, 64 - h * 0.6, x + 2.4, 64); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildPalmGeometry() {
  const P = [], C = [], U = [], I = [], rnd = mulberry32(5);
  const H = 8.5, segs = 14, rad = 9, bend = 1.15;
  const center = t => [bend * t * t, H * t, 0.28 * bend * Math.sin(t * 3) * t];
  for (let s = 0; s <= segs; s++) { const t = s / segs, c = center(t), r = 0.30 * (1 - 0.55 * t) + 0.16 * Math.exp(-t * 16);
    const band = Math.sin(t * H * 6.2) > 0.25 ? 0.7 : 1.0;
    for (let k = 0; k <= rad; k++) { const a = k / rad * Math.PI * 2; P.push(c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r);
      C.push(0.17 * band, 0.12 * band, 0.075 * band); U.push(k / rad, t); } }
  for (let s = 0; s < segs; s++) for (let k = 0; k < rad; k++) { const a = s * (rad + 1) + k, b = a + 1, c = a + rad + 1, d = c + 1; I.push(a, b, c, b, d, c); }
  const trunkIdx = I.length, vBase = P.length / 3, crown = center(1);
  const F = 13;
  for (let f = 0; f < F; f++) {
    const yaw = f / F * Math.PI * 2 + (rnd() - 0.5) * 0.35, tier = f % 3, pitch0 = [1.0, 0.45, -0.05][tier] + (rnd() - 0.5) * 0.2;
    const L = 3.7 + rnd() * 1.1 + (tier === 2 ? 0.3 : 0), segsL = 8, droop = 1.55 + tier * 0.25;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), side = [-sy, 0, cy];
    let px = crown[0], py = crown[1] - 0.1, pz = crown[2];
    const v0 = P.length / 3;
    for (let k = 0; k <= segsL; k++) {
      const u = k / segsL, w = 0.82 * Math.sin(Math.PI * Math.pow(Math.max(u, 0.001), 0.62)) + 0.04;
      for (const s of [-1, 1]) { P.push(px + side[0] * w * s, py - 0.20 * w, pz + side[2] * w * s);
        const g = 0.55 + 0.45 * u; C.push(0.07 * g, 0.19 * g, 0.045 * g); U.push(s < 0 ? 0 : 1, u); }
      const ang = pitch0 - droop * u, step = L / segsL;
      px += Math.cos(ang) * cy * step; py += Math.sin(ang) * step; pz += Math.cos(ang) * sy * step;
    }
    for (let k = 0; k < segsL; k++) { const a = v0 + k * 2, b = a + 1, c = a + 2, d = a + 3; I.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  g.addGroup(0, trunkIdx, 0); g.addGroup(trunkIdx, I.length - trunkIdx, 1); g.computeVertexNormals();
  return g;
}

const SWAY = `float n0sw = pow(max(position.y, 0.0) / 9.0, 1.7);
 vec4 n0ip = instanceMatrix * vec4(0.,0.,0.,1.);
 transformed.x += sin(uTime * 1.35 + n0ip.x * 0.3 + n0ip.z * 0.2) * 0.30 * n0sw * (0.3 + uWind);
 transformed.z += cos(uTime * 1.1 + n0ip.z * 0.3) * 0.22 * n0sw * (0.3 + uWind);
 transformed.y += sin(uTime * 3.2 + position.x * 2.0 + n0ip.x) * 0.05 * n0sw * uWind * step(8.0, position.y);`;

export class Palms {
  constructor(shared, terrain, max = 1600) {
    this.terrain = terrain; this.items = []; this.max = max;
    const geo = buildPalmGeometry();
    const hd = 'uniform float uTime; uniform float uWind;';
    const trunk = patchStandard(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), shared, { vHead: hd, vAfter: SWAY }, 'palmTrunk');
    const leaf = patchStandard(new THREE.MeshStandardMaterial({ vertexColors: true, map: leafTexture(), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.65 }), shared, { vHead: hd, vAfter: SWAY }, 'palmLeaf');
    this.mesh = new THREE.InstancedMesh(geo, [trunk, leaf], max);
    this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler();
  }
  add(x, z, s = 1, yaw = 0) { if (this.items.length >= this.max) return null; const it = { x, z, s, yaw }; this.items.push(it); this.rebuild(); return it; }
  remove(it) { const i = this.items.indexOf(it); if (i >= 0) { this.items.splice(i, 1); this.rebuild(); } }
  removeIn(x, z, r) { const gone = this.items.filter(p => Math.hypot(p.x - x, p.z - z) < r); gone.forEach(p => this.items.splice(this.items.indexOf(p), 1)); if (gone.length) this.rebuild(); return gone; }
  rebuild() {
    const c = new THREE.Color(), m = this.m;
    this.items.forEach((p, i) => {
      const y = this.terrain.hAt(p.x, p.z) - 0.15; this.q.setFromEuler(this.e.set(0, p.yaw, 0));
      m.compose(new THREE.Vector3(p.x, y, p.z), this.q, new THREE.Vector3(p.s, p.s, p.s)); this.mesh.setMatrixAt(i, m);
      const v = 0.82 + ((i * 37) % 17) / 17 * 0.3; this.mesh.setColorAt(i, c.setRGB(v, v, v));
    });
    this.mesh.count = this.items.length; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// Grass tufts: a deterministic FIELD derived from terrain + seed (regenerated after terrain edits).
export class Grass {
  constructor(shared, terrain, max = 9000) {
    this.terrain = terrain; this.max = max;
    const g = new THREE.BufferGeometry(), P = [], U = [], I = [], C = [];
    for (let q = 0; q < 3; q++) { const a = q * Math.PI / 3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = P.length / 3;
      P.push(-cx, 0, -cz, cx, 0, cz, -cx, 0.85, -cz, cx, 0.85, cz); U.push(0, 0, 1, 0, 0, 1, 1, 1); C.push(0.35, 0.4, 0.2, 0.35, 0.4, 0.2, 1, 1, 1, 1, 1, 1);
      I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
    const sway = `float n0g = position.y; vec4 n0ip = instanceMatrix * vec4(0.,0.,0.,1.);
      transformed.x += sin(uTime * 2.0 + n0ip.x * 0.7 + n0ip.z * 0.5) * 0.12 * n0g * (0.3 + uWind);
      transformed.z += cos(uTime * 1.7 + n0ip.z * 0.6) * 0.09 * n0g * (0.3 + uWind);`;
    const mat = patchStandard(new THREE.MeshStandardMaterial({ vertexColors: true, map: bladeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), shared,
      { vHead: 'uniform float uTime; uniform float uWind;', vAfter: sway }, 'grass');
    this.mesh = new THREE.InstancedMesh(g, mat, max); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }
  scatter(seed, T) {
    const rnd = mulberry32(seed + 5), nz = makeNoise(seed + 3), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    let n = 0; const n3 = new THREE.Vector3();
    for (let z = -124; z < 124 && n < this.max; z += 2) for (let x = -124; x < 124 && n < this.max; x += 2) {
      const px = x + rnd() * 2, pz = z + rnd() * 2, h = T.hAt(px, pz); T.nAt(px, pz, n3);
      const pi = ((px / 256 + 0.5) * 512) | 0, pj = ((pz / 256 + 0.5) * 512) | 0, o = (pj * 512 + pi) * 4;
      const green = smooth(1.3, 2.6, h + nz.fbm(px * 0.03, pz * 0.03, 2) * 1.4) * (1 - smooth(0.2, 0.34, 1 - n3.y)) + T.paint[o + 1] / 255;
      const tuft = smooth(0.95, 1.5, h) * smooth(0.3, 0.8, nz.fbm(px * 0.06, pz * 0.06, 2) + 0.55);   // dune grass clumps on dry sand
      const dens = Math.max(green, tuft * 0.8) * (1 - T.paint[o + 2] / 255) * (1 - T.paint[o] / 255);
      if (rnd() > dens * 0.9 || n3.y < 0.7 || h < 0.9) continue;
      const s = 0.8 + rnd() * 1.0; q.setFromEuler(e.set(0, rnd() * 6.28, 0));
      m.compose(new THREE.Vector3(px, h - 0.03, pz), q, new THREE.Vector3(s * 0.55, s * (0.35 + rnd() * 0.35), s * 0.55)); this.mesh.setMatrixAt(n, m);
      const v = 0.7 + rnd() * 0.5; this.mesh.setColorAt(n, c.setRGB(v * 0.9, v, v * 0.7)); n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export function makeBoulderMesh(shared, r, seed) {
  const g = new THREE.IcosahedronGeometry(1, 4), nz = makeNoise(seed), p = g.attributes.position, col = [];
  const sx = 0.85 + (seed % 7) / 25, sy = 0.78 + (seed % 5) / 22, sz = 0.9 + (seed % 3) / 12;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + 0.20 * nz.fbm(x * 1.6 + y * 0.9, z * 1.6 - y * 1.1, 3) + 0.06 * nz.n2(x * 5 + 3, z * 5 - y * 4);
    const fl = Math.abs(nz.n2(x * 1.1 + 9, y * 1.1)) > 0.55 ? 0.93 : 1;
    p.setXYZ(i, x * d * sx * fl * r, y * d * sy * r, z * d * sz * fl * r);
    const v = 0.55 + 0.35 * nz.fbm(x * 3, z * 3 + y * 2, 3); col.push(0.20 * v, 0.19 * v, 0.17 * v);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const mat = patchStandard(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), shared, {
    vHead: 'varying vec3 vObj;', vAfter: 'vObj = transformed;', fHead: 'varying vec3 vObj;',
    fColor: 'float n0rn = n0fbm(vObj.xy * 2.4 + vObj.z * 1.7); diffuseColor.rgb *= 0.55 + 0.9 * n0rn; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.25, 1.15, 0.95), smoothstep(0.55, 0.8, n0fbm(vObj.zy * 3.3)));',
  }, 'boulder');
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
