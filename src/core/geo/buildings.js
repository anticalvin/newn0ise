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

/* WorldTruth view of a building record: every significant field with where it came from. The runtime mesh is derived from this, never the other way round. */
export const TIERS = { 1: 'T1 real footprint', 2: 'T2 real footprint + sourced massing', 3: 'T3 sourced massing + appearance', 4: 'T4 authored landmark' };
export function truthOf(b, landmark) {
  const ps = b.ps || {}, hsrc = b.hs || 'inferred', pitchedGuess = !b.rs && PITCHED.has(b.k);
  return {
    id: b.id, tier: landmark ? 4 : (b.tt || 1), tierName: TIERS[landmark ? 4 : (b.tt || 1)],
    fields: {
      footprint: { value: (b.p.length / 2) + ' vertices', source: 'osm' },
      height: { value: b.h, source: hsrc, verified: hsrc === 'tag' || hsrc === 'levels' },
      levels: b.lv ? { value: +b.lv, source: 'tag' } : null,
      minHeight: b.mh != null ? { value: b.mh, source: ps.mh || 'tag' } : null,
      roofShape: { value: b.rs || (pitchedGuess ? 'inferred:pitched-or-flat' : 'inferred:flat'), source: b.rs ? 'tag' : 'inferred' },
      roofHeight: b.rh != null ? { value: b.rh, source: 'tag' } : null, roofDirection: b.rd != null ? { value: b.rd, source: 'tag' } : null,
      facadeColour: { value: b.col || null, source: b.col ? 'tag' : 'inferred:palette' }, roofColour: { value: b.rc || null, source: b.rc ? 'tag' : 'inferred:palette' },
      material: b.mat ? { value: b.mat, source: 'tag' } : null,
      parts: b.parts ? { value: b.parts.length, source: 'osm building:part', heights: b.parts.map(p => ({ id: p.id, h: p.h, source: p.hs })) } : null,
    },
    landmark: !!landmark
  };
}

function ringArea(xs, zs) { let A = 0; for (let i = 0; i < xs.length; i++) { const j = (i + 1) % xs.length; A += xs[i] * zs[j] - xs[j] * zs[i]; } return A / 2; }
const parseCol = (c, fallback) => { if (c) { try { return new THREE.Color(c); } catch {} } return fallback; };

/* Roof form for a footprint: flat, pyramidal/hipped (apex at centroid), gabled (ridge along the long axis of the oriented box), skillion (one slope). Tags win; otherwise a guess for small houses only. */
function roofForm(b, area, n, top, xs, zs, cx, cz, hTotal) {
  let shape = b.rs; if (shape === 'gable') shape = 'gabled'; if (shape === 'pyramid') shape = 'pyramidal';
  if (!shape) shape = PITCHED.has(b.k) && area < 260 && n <= 10 && hTotal < 11 ? 'pyramidal' : 'flat';   // the old inferred rule, kept as the explicit fallback
  if (shape === 'flat') return { shape };
  const rh = b.rh != null ? b.rh : Math.min(3.2, 0.32 * Math.max(3, Math.sqrt(area)));
  return { shape, rh: Math.max(0.5, rh) };
}

function pushWalls(S, xs, zs, bottom, top, wc, gmin, sign) {
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = xs[j] - xs[i], dz = zs[j] - zs[i], L = Math.hypot(dx, dz); if (L < 0.05) continue;
    const nx = sign * dz / L, nz = -sign * dx / L, q = S.pos.length / 3;
    S.pos.push(xs[i], bottom, zs[i], xs[j], bottom, zs[j], xs[j], top, zs[j], xs[i], top, zs[i]);
    for (let k = 0; k < 4; k++) { S.nor.push(nx, 0, nz); S.col.push(wc.r, wc.g, wc.b); S.base.push(gmin); }
    S.idx.push(q, q + 1, q + 2, q, q + 2, q + 3);
  }
}
function tri(S, a, b, c, col, gmin, sign) {   // one roof triangle, normal flipped to face up
  const q = S.pos.length / 3; S.pos.push(...a, ...b, ...c);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; let flip = ny < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  for (let k = 0; k < 3; k++) { S.nor.push(nx / l, ny / l, nz / l); S.col.push(col.r, col.g, col.b); S.base.push(gmin); }
  if (flip) S.idx.push(q, q + 2, q + 1); else S.idx.push(q, q + 1, q + 2);
  void sign;
}
function pushRoof(S, xs, zs, top, form, b, rc, gmin, sign, cx, cz) {
  const n = xs.length;
  if (form.shape === 'flat' || n < 3) {
    const contour = []; for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(xs[i], zs[i]));
    let t; try { t = THREE.ShapeUtils.triangulateShape(contour, []); } catch { t = []; }
    const q = S.pos.length / 3, rr = rc.clone().lerp(new THREE.Color(0x77746f), 0.7);
    for (let i = 0; i < n; i++) { S.pos.push(xs[i], top, zs[i]); S.nor.push(0, 1, 0); S.col.push(rr.r, rr.g, rr.b); S.base.push(gmin); }
    for (const [a, b2, c] of t) { const cr = (xs[b2] - xs[a]) * (zs[c] - zs[a]) - (zs[b2] - zs[a]) * (xs[c] - xs[a]); if (cr > 0) S.idx.push(q + a, q + c, q + b2); else S.idx.push(q + a, q + b2, q + c); }
    return;
  }
  const apexY = top + form.rh;
  if (form.shape === 'gabled' || form.shape === 'hipped' || form.shape === 'skillion') {
    // oriented axis: roof:direction (degrees, direction the slope faces) when mapped, else the longest footprint edge
    let ax, az;
    if (b.rd != null) { const r = b.rd * Math.PI / 180; ax = Math.cos(r); az = Math.sin(r); } else { let best = 0; ax = 1; az = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n, L = Math.hypot(xs[j] - xs[i], zs[j] - zs[i]); if (L > best) { best = L; ax = (xs[j] - xs[i]) / L; az = (zs[j] - zs[i]) / L; } } }
    const px = -az, pz = ax;   // across-ridge axis
    let lo = 1e9, hi = -1e9; for (let i = 0; i < n; i++) { const c = (xs[i] - cx) * px + (zs[i] - cz) * pz; lo = Math.min(lo, c); hi = Math.max(hi, c); }
    const half = Math.max(0.5, (hi - lo) / 2), mid = (hi + lo) / 2;
    // height of the roof over each vertex: gabled/hipped rise to the ridge across the short axis, skillion rises along it
    const ry = i => { const c = (xs[i] - cx) * px + (zs[i] - cz) * pz; return form.shape === 'skillion' ? top + form.rh * (c - lo) / (hi - lo || 1) : top + form.rh * (1 - Math.min(1, Math.abs(c - mid) / half)); };
    if (form.shape === 'gabled' && n === 4) {
      // true gable: two slopes meeting at a ridge over the middle of the short axis, triangular gable ends
      const cs = xs.map((x, i) => (x - cx) * px + (zs[i] - cz) * pz), low = [], high = [];
      for (let i = 0; i < 4; i++) (cs[i] < mid ? low : high).push(i);
      if (low.length === 2 && high.length === 2) {
        const R = i => [xs[i] - (cs[i] - mid) * px, apexY, zs[i] - (cs[i] - mid) * pz], V = i => [xs[i], top, zs[i]];
        for (const side of [low, high]) { const [i, j] = side; tri(S, V(i), V(j), R(j), rc, gmin, sign); tri(S, V(i), R(j), R(i), rc, gmin, sign); }
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; if ((cs[i] < mid) !== (cs[j] < mid)) { const a1 = R(i), a2 = R(j); tri(S, V(i), V(j), [(a1[0] + a2[0]) / 2, apexY, (a1[2] + a2[2]) / 2], rc, gmin, sign); } }
        return;
      }
    } else if (form.shape !== 'gabled') {
      const ryC = form.shape === 'skillion' ? top + form.rh * (0 - lo) / (hi - lo || 1) : apexY; const c0 = [cx, ryC, cz];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(S, [xs[i], ry(i), zs[i]], [xs[j], ry(j), zs[j]], c0, rc, gmin, sign); }
      return;
    }
  }
  // pyramidal (and anything we cannot do better): apex at the centroid
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(S, [xs[i], top, zs[i]], [xs[j], top, zs[j]], [cx, apexY, cz], rc, gmin, sign); }
}

/* Geometry for the buildings of one tile. filter(b) can drop some (skyline LOD, the interactive store, authored landmarks).
   Parts replace the outline when present. mid=true builds massing only (no roof forms), for the mid LOD ring. Returns {geometry, count, triangles, parts} or null. */
export function buildGeometry(tile, height, filter, opt = {}) {
  const S = { pos: [], nor: [], col: [], base: [], idx: [] }; let count = 0, parts = 0;
  const emit = (b, p, owner, isPart) => {
    const n = p.length / 2; if (n < 3) return;
    const xs = [], zs = []; for (let i = 0; i < n; i++) { xs.push(p[i * 2] / 10); zs.push(p[i * 2 + 1] / 10); }
    const A = ringArea(xs, zs); if (Math.abs(A) < (isPart ? 1.5 : 4)) return;
    let cx = 0, cz = 0, gmin = 1e9; for (let i = 0; i < n; i++) { cx += xs[i]; cz += zs[i]; gmin = Math.min(gmin, height(xs[i], zs[i])); } cx /= n; cz /= n;
    const mh = b.mh || 0, bottom = mh > 0 ? gmin + mh : gmin - 0.6, top = gmin + b.h, sign = A > 0 ? 1 : -1;
    if (top - bottom < 0.8) return;
    const wc = parseCol(owner.col, wallColor(owner)), rc = parseCol(owner.rc, new THREE.Color(ROOF[Math.floor(hash(owner.id * 13) * ROOF.length)]));
    pushWalls(S, xs, zs, bottom, top, wc, gmin, sign);
    const form = opt.mid ? { shape: 'flat' } : roofForm(b, Math.abs(A), n, top, xs, zs, cx, cz, b.h);
    pushRoof(S, xs, zs, top, form, b, rc, gmin, sign, cx, cz);
    if (isPart) parts++;
  };
  for (const b of tile.buildings) {
    if (filter && !filter(b)) continue;
    if (b.parts && b.parts.length) { for (const q of b.parts) emit({ ...q, k: b.k, id: q.id }, q.p, { ...b, col: q.col || b.col, rc: q.rc || b.rc }, true); count++; }
    else { emit(b, b.p, b, false); count++; }
  }
  if (!count) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(S.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(S.col, 3)); g.setAttribute('aBase', new THREE.Float32BufferAttribute(S.base, 1)); g.setIndex(S.idx);
  return { geometry: g, count, parts, triangles: S.idx.length / 3 };
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
