// Living-world simulation in three tiers. Actors are persistent records {id, kind, edge keys, t, dir, speed}; their identity never depends on what is loaded.
//  near   (< 160 m)  stepped every frame, cars keep distance to the car ahead
//  medium (< 650 m)  stepped at 4 Hz and interpolated between steps
//  far    (beyond / tile unloaded)  not stepped at all; when they come back into range they are fast-forwarded along the graph with their own seeded turns
// So nothing teleports, nothing duplicates, and the cost scales with what you can see.
import * as THREE from 'three';

export const NEAR = 160, MEDIUM = 650;
const rgb = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const SKIN = [0xf1c8a5, 0xd9a67e, 0xb97a57, 0x8d5a3c, 0x6a4129, 0x4a2c1c].map(rgb), HAIR = [0x171210, 0x2a1b10, 0x5a3a1f, 0xb9a070, 0x8a8a8a, 0x0e0c0b].map(rgb), TROUSERS = [0x23303f, 0x2c2c30, 0x6a5d44, 0x3a4a5e, 0x1c1c1e, 0x57616b].map(rgb);
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

export class Sim {
  constructor(graph) { this.graph = graph; this.actors = new Map(); this.time = 0; this.maxActors = 700; this.stats = { near: 0, medium: 0, far: 0, cars: 0, peds: 0 };
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, 320); m.count = 0; m.frustumCulled = false; m.castShadow = true; return m; };
    const body = new THREE.BoxGeometry(1.8, 0.7, 4.1); body.translate(0, 0.55, 0); const cab = new THREE.BoxGeometry(1.6, 0.55, 2.0); cab.translate(0, 1.15, -0.2);
    const car = mergeTwo(body, cab);
    this.cars = mk(car, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 }));
    // people are small articulated figures: head, hair, torso, two arms and two legs, each its own instanced mesh so limbs can swing. Skin, hair, shirt and trousers vary per person.
    const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z), std = () => new THREE.MeshStandardMaterial({ roughness: 0.78 });
    const P = this.parts = {
      head: mk(new THREE.SphereGeometry(0.118, 10, 8).translate(0, 1.64, 0), std()), hair: mk(new THREE.SphereGeometry(0.128, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.67, -0.005), std()),
      torso: mk(box(0.42, 0.6, 0.23, 0, 1.17, 0), std()), armL: mk(box(0.1, 0.58, 0.11, 0, -0.29, 0), std()), armR: mk(box(0.1, 0.58, 0.11, 0, -0.29, 0), std()),
      legL: mk(box(0.175, 0.86, 0.2, 0, -0.43, 0), std()), legR: mk(box(0.175, 0.86, 0.2, 0, -0.43, 0), std())
    };
    for (const m of Object.values(P)) m.castShadow = false; P.torso.castShadow = true;
    this.peds = P.torso;
    this.group = new THREE.Group(); this.group.add(this.cars, ...Object.values(P));
  }
  /* deterministic population for a freshly loaded tile; ids like "3_-2#c4", so reloading never duplicates */
  populate(tk, density = 1) {
    const edges = this.graph.byTile.get(tk) || [], drive = edges.filter(e => e.cls.car && e.len > 12 && e.c !== 'service'), walk = edges.filter(e => e.len > 8 && (!e.cls.car || e.c === 'residential' || e.c === 'tertiary' || e.c === 'secondary' || e.c === 'primary' || e.c === 'pedestrian'));
    let km = 0; for (const e of drive) km += e.len;
    const nc = Math.min(14, Math.floor(km / 260 * density)), np = Math.min(18, Math.floor(walk.length / 14 * density));
    const put = (kind, i, pool) => {
      const id = tk + '#' + kind + i; if (this.actors.has(id) || this.actors.size >= this.maxActors || !pool.length) return;
      const r = hash(id), e = pool[Math.floor(r * pool.length) % pool.length];
      this.actors.set(id, { id, kind: kind === 'c' ? 'car' : 'ped', ak: e.a.k, bk: e.b.k, t: hash(id + 't'), dir: hash(id + 'd') > 0.5 ? 1 : -1, speed: kind === 'car' ? 0.75 + hash(id + 's') * 0.5 : 1.1 + hash(id + 's') * 0.5, seed: Math.floor(r * 2 ** 31), x: 0, z: 0, px: 0, pz: 0, yaw: 0, tier: 'far', last: this.time, acc: 0, hue: hash(id + 'c'), tile: tk, fresh: true });
    };
    for (let i = 0; i < nc; i++) put('c', i, drive); for (let i = 0; i < np; i++) put('p', i, walk);
  }
  edgeOf(a) {
    const A = this.graph.nodes.get(a.ak); if (!A) return null;
    for (const e of A.edges) if ((e.a.k === a.ak && e.b.k === a.bk) || (e.b.k === a.ak && e.a.k === a.bk)) return e;
    return null;
  }
  rng(a) { a.seed = (Math.imul(a.seed, 1664525) + 1013904223) >>> 0; return a.seed / 4294967296; }
  /* advance along the graph by dt seconds; false if the actor's edge is not loaded (it stays frozen) */
  advance(a, dt) {
    let e = this.edgeOf(a); if (!e) return false;
    const cls = e.cls, v = (a.kind === 'car' ? Math.min(cls.speed, 14) * a.speed : a.speed) * (a.slow ? 0.0 : 1);
    let dist = v * dt;
    for (let guard = 0; dist > 0 && guard < 8; guard++) {
      const L = e.len, fwd = a.ak === e.a.k ? 1 : -1;            // t grows from ak toward bk
      const room = a.dir > 0 ? (1 - a.t) * L : a.t * L;
      if (dist < room) { a.t += (a.dir > 0 ? dist : -dist) / L; dist = 0; break; }
      dist -= room;
      const node = a.dir > 0 ? this.graph.nodes.get(a.bk) : this.graph.nodes.get(a.ak);
      if (!node) return false;
      const here = a.dir > 0 ? a.bk : a.ak, opts = [...node.edges].filter(o => o !== e && (a.kind === 'ped' || o.cls.car) && !this.graph.closed.has(o.way) && (a.kind === 'ped' || !(o.r.oneway === 'yes' && o.b.k === here)));
      const pick = opts.length ? opts[Math.floor(this.rng(a) * opts.length)] : e;
      if (pick === e) { a.dir = -a.dir; a.t = a.dir > 0 ? 0 : 1; continue; }
      a.ak = pick.a.k === here ? pick.a.k : pick.b.k; a.bk = a.ak === pick.a.k ? pick.b.k : pick.a.k; a.dir = 1; a.t = 0; e = pick; void fwd;
    }
    return true;
  }
  place(a) {
    const e = this.edgeOf(a); if (!e) return false;
    const A = this.graph.nodes.get(a.ak), B = this.graph.nodes.get(a.bk); if (!A || !B) return false;
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1, hx = dx / L * a.dir, hz = dz / L * a.dir;
    const side = a.kind === 'car' ? (e.cls.w / 4) : (e.cls.car ? e.cls.w / 2 + 0.9 : 0.3);   // drive on the left, as in South Africa; walk on the pavement
    const lx = hz, lz = -hx;                                                                  // left of the heading (x east, z south)
    a.x = A.x + dx * a.t + lx * side * (a.kind === 'car' ? 1 : -1); a.z = A.z + dz * a.t + lz * side * (a.kind === 'car' ? 1 : -1);
    a.yaw = Math.atan2(hx, hz); return true;
  }
  update(dt, fx, fz) {
    this.time += dt; const S = this.stats; S.near = S.medium = S.far = S.cars = S.peds = 0;
    const cells = new Map();
    for (const a of this.actors.values()) {
      const d = Math.hypot(a.x - fx, a.z - fz), live = a.x !== 0 || a.z !== 0;
      let tier = !live ? 'unknown' : d < NEAR ? 'near' : d < MEDIUM ? 'medium' : 'far';
      if (!live) { if (this.place(a)) { tier = 'far'; a.last = this.time; } else { S.far++; continue; } }
      if (tier === 'far') { a.tier = 'far'; a.last = this.time; a.frozenAt = this.time; this.place(a); S.far++; continue; }
      if (a.tier === 'far' && a.frozenAt && this.edgeOf(a)) { const skip = Math.min(150, this.time - a.frozenAt); for (let s = 0; s < skip; s += 2) this.advance(a, 2); a.frozenAt = 0; a.px = a.x; a.pz = a.z; }
      a.tier = tier;
      if (tier === 'near') { a.slow = false; if (a.kind === 'car') { const k = Math.floor(a.x / 14) + ',' + Math.floor(a.z / 14); (cells.get(k) || cells.set(k, []).get(k)).push(a); }
        this.advance(a, dt); this.place(a); a.px = a.x; a.pz = a.z; a.acc = 0; S.near++; }
      else { a.acc += dt; if (a.acc >= 0.25) { a.px = a.x; a.pz = a.z; this.advance(a, a.acc); this.place(a); a.acc = 0; } S.medium++; }
      if (a.kind === 'car') S.cars++; else S.peds++;
    }
    // keep distance: a near car stops if another car is within 7 m in front of it
    for (const list of cells.values()) for (const a of list) {
      const hx = Math.sin(a.yaw), hz = Math.cos(a.yaw);
      for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const o = cells.get((Math.floor(a.x / 14) + dx) + ',' + (Math.floor(a.z / 14) + dz)); if (o) for (const b of o) { if (b === a) continue; const rx = b.x - a.x, rz = b.z - a.z, d = Math.hypot(rx, rz); if (d < 7 && (rx * hx + rz * hz) / (d || 1) > 0.8) a.slow = true; } }
    }
  }
  /* write instances in scene space (origin subtracted). height(x,z) -> metres. */
  render(ox, oz, height, camLimit = 650) {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let nc = 0, np = 0;
    for (const a of this.actors.values()) {
      if (a.tier === 'far' || a.tier === 'unknown' || (a.x === 0 && a.z === 0)) continue;
      let x = a.x, z = a.z; if (a.tier === 'medium') { const k = Math.min(1, a.acc / 0.25); x = a.px + (a.x - a.px) * k; z = a.pz + (a.z - a.pz) * k; }
      p.set(x - ox, height(x, z) + (a.kind === 'car' ? 0.02 : 0), z - oz); q.setFromAxisAngle(up, a.yaw); M.compose(p, q, s);
      if (a.kind === 'car') { if (nc >= 320) continue; this.cars.setMatrixAt(nc, M); this.cars.setColorAt(nc++, c.setHSL(a.hue, a.hue > 0.6 ? 0.05 : 0.45, a.hue > 0.6 ? 0.55 : 0.4)); }
      else { if (np >= 320) continue; this.person(np++, x - ox, p.y, z - oz, a, M, q, p, s, up, c); }
    }
    this.cars.count = nc; for (const m of Object.values(this.parts)) m.count = np;
    for (const m of [this.cars, ...Object.values(this.parts)]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  person(i, x, y, z, a, M, q, p, s, up, c) {
    const P = this.parts, ph = this.time * (3.2 + a.speed * 2.4) + a.seed % 628 / 100, sw = Math.sin(ph) * 0.62, bob = Math.abs(Math.cos(ph)) * 0.025, h = (n) => hash(a.id + n);
    const base = new THREE.Matrix4().compose(p.set(x, y + bob, z), q.setFromAxisAngle(up, a.yaw), s.set(1, 1, 1)), tmp = new THREE.Matrix4(), rot = new THREE.Matrix4();
    const limb = (m, ox, oy, ang) => { tmp.makeTranslation(ox, oy, 0); rot.makeRotationX(ang); m.setMatrixAt(i, M.multiplyMatrices(base, tmp).multiply(rot)); };
    for (const k of ['head', 'hair', 'torso']) P[k].setMatrixAt(i, base);
    limb(P.legL, -0.1, 0.86, sw); limb(P.legR, 0.1, 0.86, -sw); limb(P.armL, -0.27, 1.46, -sw * 0.9); limb(P.armR, 0.27, 1.46, sw * 0.9);
    const sk = SKIN[Math.floor(h('k') * SKIN.length)], hr = HAIR[Math.floor(h('h') * HAIR.length)], tone = 0.9 + h('l') * 0.2;
    P.head.setColorAt(i, c.setRGB(sk[0] * tone, sk[1] * tone, sk[2] * tone)); P.hair.setColorAt(i, c.setRGB(hr[0], hr[1], hr[2]));
    P.torso.setColorAt(i, c.setHSL(a.hue, 0.15 + h('s') * 0.5, 0.28 + h('v') * 0.34)); P.armL.setColorAt(i, c); P.armR.setColorAt(i, c);
    const tr = TROUSERS[Math.floor(h('t') * TROUSERS.length)]; P.legL.setColorAt(i, c.setRGB(tr[0], tr[1], tr[2])); P.legR.setColorAt(i, c);
  }
  serialize() { return [...this.actors.values()].map(a => ({ id: a.id, k: a.kind, ak: a.ak, bk: a.bk, t: +a.t.toFixed(4), d: a.dir, s: +a.speed.toFixed(3), r: a.seed, h: +a.hue.toFixed(3) })); }
  load(list) { for (const a of list || []) this.actors.set(a.id, { id: a.id, kind: a.k, ak: a.ak, bk: a.bk, t: a.t, dir: a.d, speed: a.s, seed: a.r, hue: a.h, x: 0, z: 0, px: 0, pz: 0, yaw: 0, tier: 'far', last: 0, acc: 0, tile: a.id.split('#')[0] }); }
  inspect() { return { ...this.stats, total: this.actors.size, sample: [...this.actors.values()].slice(0, 5).map(a => ({ id: a.id, kind: a.kind, tier: a.tier, edge: a.ak + '>' + a.bk })) }; }
  dispose() { this.cars.geometry.dispose(); this.cars.material.dispose(); for (const m of Object.values(this.parts)) { m.geometry.dispose(); m.material.dispose(); } }
}
function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry(), pa = a.attributes.position, pb = b.attributes.position, na = a.attributes.normal, nb = b.attributes.normal;
  const pos = new Float32Array((pa.count + pb.count) * 3), nor = new Float32Array((pa.count + pb.count) * 3); pos.set(pa.array); pos.set(pb.array, pa.count * 3); nor.set(na.array); nor.set(nb.array, pa.count * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const ia = a.index.array, ib = b.index.array, idx = new Uint32Array(ia.length + ib.length); idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + pa.count; g.setIndex(new THREE.BufferAttribute(idx, 1)); return g;
}
