// The rest of South Africa: country-scale ground outside the detailed regions. Ground comes from the national DEM (about 2.7 km grid) plus deterministic fractal detail
// that is tied to latitude and longitude (so it never changes when the frame moves), trunk and primary roads come from OSM, towns become small settlements sized by population.
// Everything here is generated, not surveyed: it makes the whole country walkable and drivable at true scale while only the detailed regions have real streets and buildings.
import * as THREE from 'three';
import { terrainGeometry, HeightField } from './terrain.js';
import { CLASSES, ribbon, bank, resample, acc, toGeometry } from './roads.js';

const S = 1000, G = 20, STEP = S / G;
const lerp = (a, b, t) => a + (b - a) * t, sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const h2 = (x, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); return lerp(lerp(h2(xi, zi), h2(xi + 1, zi), u), lerp(h2(xi, zi + 1), h2(xi + 1, zi + 1), u), v); };
const fbm = (x, z) => { let a = 1, f = 1 / 700, s = 0, n = 0; for (let i = 0; i < 5; i++) { s += a * (vn(x * f, z * f) - 0.5); n += a; a *= 0.5; f *= 2.07; } return s / n * 2; };
export const LOAD = 6500, KEEP = 8200;

/* a plain grid with the same bilinear lookup as a region tile */
class GridField { constructor(h) { this.n = G + 1; this.size = S; this.step = STEP; this.h = h; } }
GridField.prototype.at = HeightField.prototype.at;

export class Wilds {
  constructor(world) {
    this.w = world; this.group = new THREE.Group(); this.group.name = 'wilds'; world.group.add(this.group); this.chunks = new Map(); this.roads = null; this.queue = [];
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    this.rmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.hmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const tr = new THREE.ConeGeometry(2.1, 6.5, 6); tr.translate(0, 3.9, 0); this.treeGeo = tr; this.treeMat = new THREE.MeshStandardMaterial({ color: 0x4c6a3a, roughness: 1 });
    this.houseGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.stats = { chunks: 0, built: 0, made: 0, freed: 0 };
  }
  async ensureRoads() {
    if (this.roads) return; const nat = this.w.provider.national; if (!nat) return;
    this.roads = nat.roads.map(r => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [lo, la] of r.p) { a = Math.min(a, la); b = Math.min(b, lo); c = Math.max(c, la); d = Math.max(d, lo); } return { c: r.c, n: r.n, p: r.p, s: a, w: b, nn: c, e: d }; });
    this.places = nat.places;
  }
  reset() { for (const k of [...this.chunks.keys()]) this.drop(k); this.queue.length = 0; }
  key(tx, tz) { return tx + '_' + tz; }
  /* ground height at region metres if its chunk is built, else undefined */
  at(x, z) { const c = this.chunks.get(this.key(Math.floor(x / S), Math.floor(z / S))); return c && c.hf ? c.hf.at(x - c.ox, z - c.oz) : undefined; }
  roadAt(x, z, rad = 30) {
    let best = null;
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      const c = this.chunks.get(this.key(Math.floor(x / S) + dx, Math.floor(z / S) + dz)); if (!c || !c.segs) continue;
      for (const s of c.segs) { const ax = s[0], az = s[1], bx = s[2], bz = s[3], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)), px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz); if (d < rad && (!best || d < best.d)) best = { d, x: px, z: pz, edge: { cls: CLASSES[s[4]], r: { name: s[5] || '' }, a: { x: ax, z: az }, b: { x: bx, z: bz } } }; }
    }
    return best;
  }
  height(lat, lon, dem) {                                // the one ground function: DEM plus fractal detail, identical for every chunk edge
    const d0 = this.w.provider.demAt(lat, lon); if (d0 <= 1) return Math.max(d0, -30);
    const gx = this.w.provider.demAt(lat, lon + 0.03) - this.w.provider.demAt(lat, lon - 0.03), gz = this.w.provider.demAt(lat + 0.03, lon) - this.w.provider.demAt(lat - 0.03, lon);
    const rough = Math.min(1, Math.hypot(gx, gz) / 260), amp = (6 + 46 * rough) * sm(0, 60, d0);
    return d0 + fbm(lon * 96000, lat * 111000) * amp;
  }
  build(c) {
    const w = this.w, f = w.frame, v = new Float32Array((G + 1) * (G + 1)), mask = [];
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const p = f.toLatLon(c.ox + i * STEP, c.oz + j * STEP), h = this.height(p.lat, p.lon); v[j * (G + 1) + i] = h;
      let kind = '';
      if (p.lat > -33 && p.lon < 25 && p.lat < -27.5) kind = 'dry'; else if (p.lon > 28.2 && p.lat < -24) kind = 'lush'; else if (p.lat > -30 && p.lon < 22) kind = 'dry';
      mask[j * (G + 1) + i] = kind;
    }
    c.hf = new GridField(v); c.mask = mask; c.terr = {};
    c.group = new THREE.Group(); c.group.position.set(c.ox - w.origin.x, 0, c.oz - w.origin.z); this.group.add(c.group);
    this.mesh(c, 1);
    this.stats.built++;
  }
  mesh(c, stride) {
    if (!c.terr[stride]) { c.terr[stride] = terrainGeometry(c.hf, c.mask, stride); this.stats.made++; }
    if (!c.terrain) { c.terrain = new THREE.Mesh(c.terr[stride], this.mat); c.terrain.receiveShadow = true; c.group.add(c.terrain); } else c.terrain.geometry = c.terr[stride];
    c.stride = stride;
  }
  details(c) {
    const w = this.w, f = w.frame, H = (x, z) => c.hf.at(Math.max(0, Math.min(S, x)), Math.max(0, Math.min(S, z)));
    const lo = [f.toLatLon(c.ox, c.oz), f.toLatLon(c.ox + S, c.oz), f.toLatLon(c.ox, c.oz + S), f.toLatLon(c.ox + S, c.oz + S)], s0 = Math.min(...lo.map(p => p.lat)) - 0.003, n0 = Math.max(...lo.map(p => p.lat)) + 0.003, w0 = Math.min(...lo.map(p => p.lon)) - 0.003, e0 = Math.max(...lo.map(p => p.lon)) + 0.003;
    c.segs = []; const a = acc();
    for (const r of this.roads || []) {
      if (r.s > n0 || r.nn < s0 || r.w > e0 || r.e < w0) continue;
      const cls = CLASSES[r.c]; if (!cls) continue;
      const pts = r.p.map(([lo2, la]) => { const q = f.toLocal(la, lo2); return [q.x - c.ox, q.z - c.oz]; });
      let run = [];
      const flush = () => { if (run.length > 1) this.strip(a, run, cls, H); run = []; };
      for (let i = 0; i + 1 < pts.length; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
        if (mx >= 0 && mx < S && mz >= 0 && mz < S) { if (!run.length) run.push(pts[i]); run.push(pts[i + 1]); c.segs.push([pts[i][0] + c.ox, pts[i][1] + c.oz, pts[i + 1][0] + c.ox, pts[i + 1][1] + c.oz, r.c, r.n || '']); } else flush();
      }
      flush();
    }
    const g = toGeometry(a); if (g) { this.stats.made++; const m = new THREE.Mesh(g, this.rmat); m.receiveShadow = true; c.group.add(m); c.road = m; }
    // trees: sparse in the dry west and interior, denser toward the wet east and the Cape
    const T = [], rnd = (i, k) => h2(c.tx * 131 + i * 7 + k, c.tz * 197 + k * 13);
    const dryness = c.mask[Math.floor((G + 1) * (G + 1) / 2)] === 'dry' ? 0.25 : c.mask[Math.floor((G + 1) * (G + 1) / 2)] === 'lush' ? 1.2 : 0.7;
    for (let i = 0; i < 140 * dryness; i++) { const x = rnd(i, 1) * S, z = rnd(i, 2) * S, h = H(x, z); if (h < 2 || h > 1900) continue; if (w.roadNear && w.roadNear(c.ox + x, c.oz + z)) continue; T.push([x, h, z, 0.6 + rnd(i, 3) * 1.1]); }
    if (T.length) { const im = new THREE.InstancedMesh(this.treeGeo, this.treeMat, T.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(); T.forEach((t, i) => im.setMatrixAt(i, M.compose(p.set(t[0], t[1], t[2]), q, s.set(t[3], t[3], t[3])))); im.castShadow = false; c.group.add(im); c.trees = im; }
    // settlements: a town or city centred in this chunk becomes a cluster of simple buildings sized by population
    const houses = [];
    for (const pl of this.places || []) {
      if (pl.lat < s0 || pl.lat > n0 || pl.lon < w0 || pl.lon > e0) continue; const q = f.toLocal(pl.lat, pl.lon), cx = q.x - c.ox, cz = q.z - c.oz; if (cx < 0 || cx >= S || cz < 0 || cz >= S) continue;
      const n = Math.max(8, Math.min(220, Math.round((pl.pop || 4000) / 3500))), R = Math.sqrt(n) * 24;
      for (let i = 0; i < n; i++) { const ang = h2(pl.id + i, 5) * 6.283, d = Math.sqrt(h2(pl.id + i, 6)) * R, x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d; if (x < 0 || x >= S || z < 0 || z >= S) continue; const wd = 9 + h2(pl.id + i, 7) * 14, hh = (pl.k === 'city' && d < R * 0.4 ? 14 : 3.2) + h2(pl.id + i, 8) * (pl.k === 'city' ? 22 : 4); houses.push([x, H(x, z), z, wd, hh, 8 + h2(pl.id + i, 9) * 10, h2(pl.id + i, 10) * 6.283, h2(pl.id + i, 11)]); }
    }
    if (houses.length) { const im = new THREE.InstancedMesh(this.houseGeo, this.hmat, houses.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
      houses.forEach((h, i) => { im.setMatrixAt(i, M.compose(p.set(h[0], h[1] - 0.2, h[2]), q.setFromAxisAngle(up, h[6]), s.set(h[3], h[4], h[5]))); im.setColorAt(i, col.setHSL(0.08 + h[7] * 0.05, 0.12 + h[7] * 0.15, 0.62 + h[7] * 0.22)); }); im.castShadow = true; im.receiveShadow = true; c.group.add(im); c.houses = im; }
    c.detail = true;
  }
  strip(a, pts, cls, H) {
    const sub = resample(pts, 16); if (sub.length < 2) return; const width = cls.w, reach = width / 2 + 2.6;
    const ys = sub.map((p, i) => { const q0 = sub[Math.max(0, i - 1)], q1 = sub[Math.min(sub.length - 1, i + 1)]; let dx = q1[0] - q0[0], dz = q1[1] - q0[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; let y = H(p[0], p[1]); for (const s of [-1, 1]) y = Math.max(y, H(p[0] - dz * reach * s, p[1] + dx * reach * s)); return y + 0.14; });
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] - 0.5);
    ribbon(a, sub, ys, width, 0, new THREE.Color(cls.col), 0); bank(a, sub, ys, width / 2 + 0.2, new THREE.Color(0x6c685f));
    ribbon(a, sub, ys, 0.18, 0, new THREE.Color(0xd9d3c0), 0.03);
  }
  drop(k) {
    const c = this.chunks.get(k); if (!c) return; this.chunks.delete(k); if (!c.group) return; this.group.remove(c.group);
    c.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o === c.road) { o.geometry.dispose(); this.stats.freed++; } });
    Object.values(c.terr || {}).forEach(g => { g.dispose(); this.stats.freed++; });
  }
  rebase() { for (const c of this.chunks.values()) if (c.group) c.group.position.set(c.ox - this.w.origin.x, 0, c.oz - this.w.origin.z); }
  /* every few frames: want the chunks around the focus that no detailed region covers, build a few per call, drop the rest */
  update(fx, fz, budget = 2) {
    const w = this.w, tx0 = Math.floor(fx / S), tz0 = Math.floor(fz / S), R = Math.ceil(LOAD / S), want = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const tx = tx0 + i, tz = tz0 + j, d = Math.hypot(Math.max(tx * S - fx, 0, fx - (tx + 1) * S), Math.max(tz * S - fz, 0, fz - (tz + 1) * S)); if (d > LOAD) continue;
      if (w.tiles.has(tx + '_' + tz)) continue;          // a real region tile is loaded or loading here
      want.push({ tx, tz, d });
    }
    want.sort((a, b) => a.d - b.d); let built = 0;
    for (const t of want) { const k = this.key(t.tx, t.tz); let c = this.chunks.get(k); if (!c) { if (built >= budget) continue; c = { tx: t.tx, tz: t.tz, ox: t.tx * S, oz: t.tz * S }; this.chunks.set(k, c); this.build(c); built++; }
      if (!c.detail && t.d < 3200 && built < budget + 1) { this.details(c); built++; }
      const st = t.d > 2600 ? 2 : 1; if (c.stride !== st) this.mesh(c, st); }
    for (const [k, c] of [...this.chunks]) if (w.tiles.has(k) || Math.hypot(Math.max(c.ox - fx, 0, fx - c.ox - S), Math.max(c.oz - fz, 0, fz - c.oz - S)) > KEEP) this.drop(k);
    this.stats.chunks = this.chunks.size;
  }
}
