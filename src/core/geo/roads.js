// Road graph + procedural road meshes from OSM centrelines. The graph is vertex level: every OSM vertex is a node, keyed by its exact decimetre position,
// so tile pieces cut at a tile edge share their end node and the network is continuous across tiles. Lane layouts are inferred unless OSM maps them.
import * as THREE from 'three';

export const CLASSES = {
  motorway: { w: 14, speed: 30, col: 0x38393b, car: 1 }, trunk: { w: 12, speed: 24, col: 0x3a3b3d, car: 1 }, primary: { w: 11, speed: 19, col: 0x3c3d3f, car: 1 },
  secondary: { w: 9, speed: 16, col: 0x3e3f41, car: 1 }, tertiary: { w: 8, speed: 14, col: 0x404143, car: 1 }, unclassified: { w: 6.5, speed: 12, col: 0x444547, car: 1 },
  residential: { w: 6, speed: 10, col: 0x464749, car: 1 }, living_street: { w: 5, speed: 6, col: 0x4a4b4c, car: 1 }, service: { w: 4, speed: 6, col: 0x4c4d4e, car: 1 },
  motorway_link: { w: 6, speed: 18, col: 0x38393b, car: 1 }, trunk_link: { w: 6, speed: 16, col: 0x3a3b3d, car: 1 }, primary_link: { w: 6, speed: 14, col: 0x3c3d3f, car: 1 }, secondary_link: { w: 6, speed: 12, col: 0x3e3f41, car: 1 }, tertiary_link: { w: 6, speed: 12, col: 0x404143, car: 1 },
  pedestrian: { w: 4, speed: 1.5, col: 0x8d887d, car: 0 }, footway: { w: 2, speed: 1.5, col: 0x8d887d, car: 0 }, path: { w: 1.6, speed: 1.5, col: 0x7d7566, car: 0 }, cycleway: { w: 2.4, speed: 4, col: 0x7a6f66, car: 0 }, steps: { w: 2, speed: 1, col: 0x8d887d, car: 0 }, track: { w: 3, speed: 5, col: 0x7d7152, car: 1 }
};
export const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link']);
const SIDEWALK = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);

export function laneInfo(r) {
  const cls = CLASSES[r.c] || CLASSES.residential, oneway = r.oneway === 'yes' || r.c === 'motorway' || r.c === 'motorway_link';
  const mapped = r.lanes != null && /^\d+$/.test(String(r.lanes));
  if (!cls.car) return { lanes: 0, source: 'n/a', oneway: false, speed: cls.speed, speedSource: 'inferred', sidewalk: 'none' };
  const lanes = mapped ? +r.lanes : oneway ? (cls.w >= 9 ? 2 : 1) : (cls.w >= 8 ? 4 : 2);
  return { lanes, source: mapped ? 'mapped' : 'inferred', oneway, speed: r.maxspeed && parseFloat(r.maxspeed) ? parseFloat(r.maxspeed) / 3.6 : cls.speed, speedSource: r.maxspeed ? 'mapped' : 'inferred', sidewalk: r.sidewalk ? 'mapped' : SIDEWALK.has(r.c) && r.c !== 'living_street' ? 'inferred' : 'none' };
}

const key = (gx, gz) => gx + ',' + gz;
export class RoadGraph {
  constructor() { this.nodes = new Map(); this.byTile = new Map(); this.cells = new Map(); this.closed = new Set(); }
  /* tile: parsed tile json, ox/oz: tile origin in region metres. Edges are indexed in 64 m cells for nearest queries. */
  addTile(tk, tile, ox, oz) {
    const edges = [];
    for (const r of tile.roads) {
      const cls = CLASSES[r.c]; if (!cls) continue;
      let prev = null;
      for (let i = 0; i < r.p.length; i += 2) {
        const gx = Math.round(ox * 10 + r.p[i]), gz = Math.round(oz * 10 + r.p[i + 1]), k = key(gx, gz);
        let n = this.nodes.get(k); if (!n) { n = { k, x: gx / 10, z: gz / 10, edges: new Set() }; this.nodes.set(k, n); }
        if (prev && prev !== n) {
          const e = { a: prev, b: n, len: Math.hypot(n.x - prev.x, n.z - prev.z), way: r.id, c: r.c, cls, r, tile: tk };
          prev.edges.add(e); n.edges.add(e); edges.push(e);
          e.cellKeys = []; for (let cx = Math.floor(Math.min(prev.x, n.x) / 128); cx <= Math.floor(Math.max(prev.x, n.x) / 128); cx++) for (let cz = Math.floor(Math.min(prev.z, n.z) / 128); cz <= Math.floor(Math.max(prev.z, n.z) / 128); cz++) { const ck = cx + ',' + cz; let cell = this.cells.get(ck); if (!cell) this.cells.set(ck, cell = new Set()); cell.add(e); e.cellKeys.push(ck); }
        }
        prev = n;
      }
    }
    this.byTile.set(tk, edges);
  }
  removeTile(tk) {
    const edges = this.byTile.get(tk); if (!edges) return;
    for (const e of edges) { e.a.edges.delete(e); e.b.edges.delete(e); if (!e.a.edges.size) this.nodes.delete(e.a.k); if (!e.b.edges.size) this.nodes.delete(e.b.k); for (const ck of e.cellKeys || []) { const c = this.cells.get(ck); if (c) { c.delete(e); if (!c.size) this.cells.delete(ck); } } }
    this.byTile.delete(tk);
  }
  get edgeCount() { let n = 0; for (const e of this.byTile.values()) n += e.length; return n; }
  /* nearest drivable-or-not edge within radius; returns {edge, t, x, z, d} */
  nearest(x, z, radius = 40, carOnly = false) {
    let best = null; const r = Math.ceil(radius / 128);
    const cx = Math.floor(x / 128), cz = Math.floor(z / 128);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const cell = this.cells.get((cx + i) + ',' + (cz + j)); if (!cell) continue;
      for (const e of cell) {
        if (carOnly && !e.cls.car) continue;
        const ax = e.a.x, az = e.a.z, dx = e.b.x - ax, dz = e.b.z - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
        if (d < radius && (!best || d < best.d)) best = { edge: e, t, x: px, z: pz, d };
      }
    }
    return best;
  }
  /* A* over loaded edges (cars only unless walk). Returns [{x,z}] or null. */
  route(from, to, { walk = false, maxNodes = 8000 } = {}) {
    const a = this.nearest(from.x, from.z, 120, !walk), b = this.nearest(to.x, to.z, 120, !walk);
    if (!a || !b) return null;
    const start = a.t < 0.5 ? a.edge.a : a.edge.b, goal = b.t < 0.5 ? b.edge.a : b.edge.b;
    const open = new Map([[start.k, { n: start, g: 0, f: 0, from: null }]]), closed = new Set(); let count = 0;
    while (open.size && count++ < maxNodes) {
      let cur = null; for (const o of open.values()) if (!cur || o.f < cur.f) cur = o;
      if (cur.n === goal) { const out = []; for (let o = cur; o; o = o.from) out.push({ x: o.n.x, z: o.n.z }); return out.reverse(); }
      open.delete(cur.n.k); closed.add(cur.n.k);
      for (const e of cur.n.edges) {
        if (!walk && !e.cls.car) continue; if (this.closed.has(e.way)) continue;
        if (!walk && e.r.oneway === 'yes' && e.a !== cur.n) continue;
        const nb = e.a === cur.n ? e.b : e.a; if (closed.has(nb.k)) continue;
        const g = cur.g + e.len / (walk ? 1.5 : e.cls.speed), prev = open.get(nb.k);
        if (!prev || g < prev.g) open.set(nb.k, { n: nb, g, f: g + Math.hypot(nb.x - goal.x, nb.z - goal.z) / (walk ? 1.5 : 25), from: cur });
      }
    }
    return null;
  }
}

/* Road, sidewalk and centre-line ribbons for one tile, draped on `height(x,z)` (tile-local metres). Two merged meshes: major and minor. */
export function roadGeometries(tile, height, closed) {
  const out = { major: acc(), minor: acc() };
  for (const r of tile.roads) {
    const cls = CLASSES[r.c]; if (!cls || r.tunnel === 'yes' || r.tunnel === 'building_passage') continue;
    const a = (MAJOR.has(r.c) ? out.major : out.minor), info = laneInfo(r), width = (info.lanes >= 4 && cls.w < 11 ? cls.w + 2 : cls.w);
    const pts = []; for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    const sub = resample(pts, 16); if (sub.length < 2) continue;
    const bridge = r.bridge && r.bridge !== 'no';
    const h0 = height(sub[0][0], sub[0][1]), h1 = height(sub.at(-1)[0], sub.at(-1)[1]);
    const ys = sub.map((p, i) => bridge ? h0 + (h1 - h0) * (i / (sub.length - 1)) + 0.4 : height(p[0], p[1]) + 0.07);
    const col = new THREE.Color(closed.has(r.id) ? 0x7a2e2a : cls.col);
    ribbon(a, sub, ys, width, 0, col, 0);
    if (cls.car && cls.w >= 4) {
      if (info.sidewalk !== 'none' && !bridge) { const sc = new THREE.Color(0x8e8a80); ribbon(a, sub, ys, 1.6, width / 2 + 0.9, sc, 0.07); ribbon(a, sub, ys, 1.6, -width / 2 - 0.9, sc, 0.07); }
      if (cls.w >= 6 && !info.oneway) dashed(a, sub, ys, 0.16, new THREE.Color(0xd9d3c0), 0.03);
    }
  }
  return out;
}
const acc = () => ({ p: [], c: [], i: [] });
function resample(pts, maxLen) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / maxLen)); for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  return out;
}
function ribbon(a, pts, ys, w, offset, col, lift) {
  const base = a.p.length / 3;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)]; let dx = p1[0] - p0[0], dz = p1[1] - p0[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz, nz = dx, y = ys[i] + lift;
    for (const s of [-1, 1]) { a.p.push(pts[i][0] + nx * (offset + s * w / 2), y, pts[i][1] + nz * (offset + s * w / 2)); a.c.push(col.r, col.g, col.b); }
  }
  for (let i = 0; i < pts.length - 1; i++) { const q = base + i * 2; a.i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
}
function dashed(a, pts, ys, w, col, lift) {
  let acc2 = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (Math.floor(acc2 / 4.5) % 2 === 0) ribbon(a, [pts[i], pts[i + 1]], [ys[i], ys[i + 1]], w, 0, col, lift);
    acc2 += seg;
  }
}
export function toGeometry(a) {
  if (!a.i.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(a.c, 3)); g.setIndex(a.i);
  const n = new Float32Array(a.p.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g;
}
