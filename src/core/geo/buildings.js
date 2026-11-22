// Building pipeline: OSM footprint -> extruded mesh with a roof form, merged per tile. The facade (windows, doors, lit windows at night) is a shader on the wall normals,
// so near detail costs no extra geometry. Heights come from tags where mapped; the rest are inferred by the importer and flagged hs:"inferred" (never shown as verified).
import * as THREE from 'three';

const WALL = { house: [0xe8e1d2, 0xdcd0bb, 0xf0ece4, 0xd7c3a3], apartments: [0xd9cdb8, 0xc9bfae, 0xe0d6c4], commercial: [0xa9acaf, 0xb8bcc0, 0x9a9da0], office: [0x8f979d, 0xa3abb2, 0x7f878d], industrial: [0xa9a79f, 0x9b9a93], retail: [0xd0c7b6, 0xc2b8a6], yes: [0xe2d9c8, 0xd2c8b4, 0xc4bba9, 0xeae5db] };
const ROOF = [0x9a5a45, 0x6b6560, 0x7a4a3c, 0x555a5e, 0x8a6a52];
const PITCHED = new Set(['house', 'detached', 'residential', 'yes', 'semidetached_house', 'terrace', 'bungalow', 'villa']);
const hash = id => ((id * 2654435761) >>> 0) / 4294967296;
const col = new THREE.Color();

export function wallColor(b) {
  if (b.col) { try { col.set(b.col); return col.clone(); } catch {} }
  const pal = WALL[b.k] || (['house', 'detached', 'terrace', 'bungalow', 'villa', 'semidetached_house'].includes(b.k) ? WALL.house : WALL.yes);
  return new THREE.Color(pal[Math.floor(hash(b.id) * pal.length)]).offsetHSL(0, 0, (hash(b.id * 7) - 0.5) * 0.05);
}

/* Geometry for the buildings of one tile. filter(b) can drop some (skyline LOD, the interactive store). Returns {geometry, count, triangles, ground} or null. */
export function buildGeometry(tile, height, filter) {
  const pos = [], nor = [], colr = [], base = [], idx = [];
  const T = new THREE.Vector2(); let count = 0;
  for (const b of tile.buildings) {
    if (filter && !filter(b)) continue;
    const n = b.p.length / 2; if (n < 3) continue;
    const xs = [], zs = []; for (let i = 0; i < n; i++) { xs.push(b.p[i * 2] / 10); zs.push(b.p[i * 2 + 1] / 10); }
    let A = 0, cx = 0, cz = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += xs[i] * zs[j] - xs[j] * zs[i]; cx += xs[i]; cz += zs[i]; } A /= 2; cx /= n; cz /= n;
    if (Math.abs(A) < 4) continue;
    let gmin = 1e9, gmax = -1e9; for (let i = 0; i < n; i++) { const g = height(xs[i], zs[i]); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
    const bottom = gmin - 0.6, top = gmin + b.h, wc = wallColor(b);
    const sign = A > 0 ? 1 : -1, v0 = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = xs[j] - xs[i], dz = zs[j] - zs[i], L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const nx = sign * dz / L, nz = -sign * dx / L, q = pos.length / 3;
      pos.push(xs[i], bottom, zs[i], xs[j], bottom, zs[j], xs[j], top, zs[j], xs[i], top, zs[i]);
      for (let k = 0; k < 4; k++) { nor.push(nx, 0, nz); colr.push(wc.r, wc.g, wc.b); base.push(gmin); }
      idx.push(q, q + 1, q + 2, q, q + 2, q + 3);
    }
    const area = Math.abs(A), pitched = PITCHED.has(b.k) && area < 260 && n <= 10 && b.h < 11 && b.rs !== 'flat';
    const rc = new THREE.Color(ROOF[Math.floor(hash(b.id * 13) * ROOF.length)]);
    if (pitched) {
      let minSide = 1e9; for (let i = 0; i < n; i++) { const j = (i + 1) % n; minSide = Math.min(minSide, Math.hypot(xs[j] - xs[i], zs[j] - zs[i])); }
      const apex = top + Math.min(3.2, 0.32 * Math.max(3, Math.sqrt(area))), ac = pos.length / 3;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; const q = pos.length / 3; pos.push(xs[i], top, zs[i], xs[j], top, zs[j], cx, apex, cz);
        const ux = xs[j] - xs[i], uz = zs[j] - zs[i], vx = cx - xs[i], vz = cz - zs[i], vy = apex - top; let ny = ux * vz - uz * vx, nx = -(uz * vy), nz = ux * vy; const l = Math.hypot(nx, ny, nz) || 1; if (ny * sign < 0) { nx = -nx; ny = -ny; nz = -nz; }
        for (let k = 0; k < 3; k++) { nor.push(nx / l, ny / l, nz / l); colr.push(rc.r, rc.g, rc.b); base.push(gmin); }
        if (sign > 0) idx.push(q, q + 2, q + 1); else idx.push(q, q + 1, q + 2); }
      void ac;
    } else {
      const contour = []; for (let i = 0; i < n; i++) contour.push(T.clone().set(xs[i], zs[i]));
      let tri; try { tri = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tri = []; }
      const q = pos.length / 3, rr = rc.clone().lerp(new THREE.Color(0x77746f), 0.7);
      for (let i = 0; i < n; i++) { pos.push(xs[i], top, zs[i]); nor.push(0, 1, 0); colr.push(rr.r, rr.g, rr.b); base.push(gmin); }
      for (const t of tri) { const [a, b2, c] = t; const cr = (xs[b2] - xs[a]) * (zs[c] - zs[a]) - (zs[b2] - zs[a]) * (xs[c] - xs[a]); if (cr > 0) idx.push(q + a, q + c, q + b2); else idx.push(q + a, q + b2, q + c); }
    }
    count++; void v0;
  }
  if (!count) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1)); g.setIndex(idx);
  return { geometry: g, count, triangles: idx.length / 3 };
}

/* One material recipe for terrain, roads and buildings: vertex colours, a dithered fade-in (no popping when a tile streams in), and for buildings the facade shader. */
export function tileMaterial({ windows = false, side = THREE.FrontSide, rough = 0.92, polygonOffset = 0, pit = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0.02, side });
  if (polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -polygonOffset; m.polygonOffsetUnits = -polygonOffset; }
  const u = { uFade: { value: 0 }, uDetail: { value: 0 }, uNight: { value: 0 } }; m.userData.u = u;
  if (pit) Object.assign(u, pit);
  m.customProgramCacheKey = () => (windows ? 'geo-tile-windows' : 'geo-tile') + (pit ? '-pit' : '');   // the closure differs but its source text does not, so say so explicitly
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBase;\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying float vBase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP=(modelMatrix*vec4(position,1.0)).xyz; vWN=normalize(mat3(modelMatrix)*normal); vBase=aBase;');
    const pitCode = pit ? 'vec2 pd=vWP.xz-uPit.xy; float pc=cos(uPitYaw), ps=sin(uPitYaw); vec2 pl=vec2(pd.x*pc-pd.y*ps, pd.x*ps+pd.y*pc); if(abs(pl.x)<uPit.z && abs(pl.y)<uPit.w) discard;\n' : '';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFade; uniform float uDetail; uniform float uNight;' + (pit ? '\nuniform vec4 uPit; uniform float uPitYaw;' : '') + '\nvarying vec3 vWP; varying vec3 vWN; varying float vBase;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + pitCode + 'if(uFade<0.999){ float d=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715)))); if(d>uFade) discard; }\nfloat winLit=0.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += winLit*vec3(1.0,0.78,0.45)*1.7;');
    if (windows) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (abs(vWN.y) < 0.35) diffuseColor.rgb *= mix(0.7, 1.0, smoothstep(0.0, 9.0, vWP.y - vBase));
      if (uDetail > 0.5 && abs(vWN.y) < 0.35) {
        vec2 t = normalize(vec2(-vWN.z, vWN.x)); float u = dot(vWP.xz, t); float v = vWP.y - vBase;
        float cu = u / 3.1, cv = v / 3.3; float fu = fract(cu), fv = fract(cv); float row = floor(cv), colm = floor(cu);
        float ground = step(row, 0.5);
        float win = step(0.2,fu)*step(fu,0.8)*step(0.3,fv)*step(fv,0.82);
        float h = fract(sin(dot(vec2(colm,row)+floor(vBase),vec2(12.9898,78.233)))*43758.5453);
        float door = ground*step(0.72,h)*step(0.22,fu)*step(fu,0.78)*step(fv,0.8);
        float m = max(win*(1.0-ground*0.5), door);
        vec3 glass = vec3(0.13,0.17,0.21);
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, m*0.9);
        winLit = m*step(0.55,h)*uNight;
      }`);
  };
  return m;
}
export const fadeIn = (mats, dt, speed = 1.6) => { let done = true; for (const m of mats) { const f = m.userData.u.uFade; if (f.value < 1) { f.value = Math.min(1, f.value + dt * speed); done = false; } } return done; };

/* Footprints in region metres for collision. Spatial hash of 64 m cells; add/remove per tile. */
export class BuildingIndex {
  constructor() { this.cells = new Map(); this.byTile = new Map(); this.byId = new Map(); }
  addTile(tk, tile, ox, oz) {
    const list = [];
    for (const b of tile.buildings) {
      const pts = b.p.map((v, i) => v / 10 + (i % 2 ? oz : ox)); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]); }
      const rec = { id: b.id, pts, b, x0, x1, z0, z1, tile: tk }; list.push(rec); this.byId.set(b.id, rec);
      for (let cx = Math.floor(x0 / 64); cx <= Math.floor(x1 / 64); cx++) for (let cz = Math.floor(z0 / 64); cz <= Math.floor(z1 / 64); cz++) { const k = cx + ',' + cz; let c = this.cells.get(k); if (!c) this.cells.set(k, c = new Set()); c.add(rec); }
    }
    this.byTile.set(tk, list);
  }
  removeTile(tk) {
    for (const rec of this.byTile.get(tk) || []) { this.byId.delete(rec.id); for (let cx = Math.floor(rec.x0 / 64); cx <= Math.floor(rec.x1 / 64); cx++) for (let cz = Math.floor(rec.z0 / 64); cz <= Math.floor(rec.z1 / 64); cz++) { const c = this.cells.get(cx + ',' + cz); if (c) { c.delete(rec); if (!c.size) this.cells.delete(cx + ',' + cz); } } }
    this.byTile.delete(tk);
  }
  near(x, z, r = 0) { const out = new Set(); for (let cx = Math.floor((x - r) / 64); cx <= Math.floor((x + r) / 64); cx++) for (let cz = Math.floor((z - r) / 64); cz <= Math.floor((z + r) / 64); cz++) { const c = this.cells.get(cx + ',' + cz); if (c) for (const rec of c) out.add(rec); } return out; }
  /* Push a circle (x,z,rad) out of any footprint. Returns the corrected position and whether it moved. `skip` ignores one building (the one being entered). */
  resolve(x, z, rad, skip) {
    let moved = false;
    for (const rec of this.near(x, z, rad + 2)) {
      if (rec.id === skip || x < rec.x0 - rad || x > rec.x1 + rad || z < rec.z0 - rad || z > rec.z1 + rad) continue;
      const p = rec.pts; let inside = false, bestD = 1e9, bx = 0, bz = 0;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
        const dx = xj - xi, dz = zj - zi, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / L2)), px = xi + dx * t, pz = zi + dz * t, d = Math.hypot(x - px, z - pz);
        if (d < bestD) { bestD = d; bx = px; bz = pz; }
      }
      if (inside || bestD < rad) { const d = bestD || 1e-3, nx = (x - bx) / d, nz = (z - bz) / d, push = inside ? bestD + rad : rad - bestD; x += (inside ? -nx : nx) * push; z += (inside ? -nz : nz) * push; moved = true; }
    }
    return { x, z, moved };
  }
  inside(x, z) { for (const rec of this.near(x, z)) { if (x < rec.x0 || x > rec.x1 || z < rec.z0 || z > rec.z1) continue; const p = rec.pts; let ins = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) ins = !ins; } if (ins) return rec; } return null; }
}

/* Street furniture and trees for the near ring: lamp posts along roads with a pavement, trees in parks. Deterministic from OSM ids. */
export function streetProps(tile, height, roadsOk) {
  const lamps = [], trees = [];
  for (const r of tile.roads) {
    if (!roadsOk(r) || r.p.length < 4) continue;
    let acc = hash(r.id) * 30; const side = hash(r.id * 3) > 0.5 ? 1 : -1;
    for (let i = 0; i < r.p.length - 2; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az); if (L < 1) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let d = acc; d < L; d += 38) { const x = ax + (bx - ax) * d / L + nx * 4.6 * side, z = az + (bz - az) * d / L + nz * 4.6 * side; lamps.push([x, height(x, z), z]); acc = d + 38 - L; }
      acc = Math.max(0, acc - 0);
    }
  }
  for (const a of tile.areas || []) {
    if (a.k !== 'park' && a.k !== 'wood') continue;
    const p = a.p.map(v => v / 10); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
    const step = a.k === 'wood' ? 7 : 11; let seed = a.id;
    for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
      seed = (seed * 1103515245 + 12345) >>> 0; const jx = x + ((seed >>> 8) % 100) / 100 * step, jz = z + ((seed >>> 16) % 100) / 100 * step;
      let ins = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > jz) !== (p[j + 1] > jz) && jx < (p[j] - p[i]) * (jz - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) ins = !ins;
      if (ins && trees.length < 900) trees.push([jx, height(jx, jz), jz, 0.8 + ((seed >>> 4) % 60) / 100]);
    }
  }
  return { lamps: lamps.slice(0, 700), trees };
}
