// retail.convenience: a small roadside store compiled from {width, depth, height, stock, seed, condition}.
// Deterministic: the same record always gives the same shelves and the same product at every slot, because each slot's presence and look come from a hash of
// (seed, slot key), not from Math.random or the order things were built in. Products are InstancedMesh batches (one draw call per product type), and each has a
// stable key like "store001/s02/t3/c17d1" that survives reloads. Picked-up products are saved as a sparse list of keys in the record's `state`.
import * as THREE from 'three';
import { buildRoom, overlaps } from './room.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EntityError, toWorld } from '../entities.js';

// many boxes -> one BufferGeometry (one draw call). boxes: [{c, h, color?}]
function mergeBoxes(boxes, tint) {
  const parts = boxes.map(b => { const g = new THREE.BoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2); g.translate(...b.c); const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(b.color == null ? 0xffffff : b.color); if (tint) c.multiplyScalar(tint); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; });
  const g = mergeGeometries(parts, false); parts.forEach(p => p.dispose()); return g;
}

const T = 0.2;              // wall thickness
const AISLE = 0.9;          // half-width of the clear central walkway
const FRONT = 3.2;          // depth kept clear inside the entrance for the door swing and counter
const DEPTH_ROWS = 2;       // products stacked two deep on each tier
const err = (m, p) => { throw new EntityError('entity.invalid', m, p); };
const num = (v, lo, hi, d, path) => { if (v == null) return d; if (typeof v !== 'number' || !isFinite(v)) err(path + ' must be a number', path); return Math.min(hi, Math.max(lo, v)); };
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; }

/* Pure layout: where the shelves and counter go, in store-local metres. Exported so tests can check clearances without building any meshes. */
export function layout(p, SHELF) {
  const W = p.width, D = p.depth, shelves = [], x0 = AISLE, spanX = W / 2 - T - 0.6 - AISLE, perSide = Math.max(0, Math.floor(spanX / (SHELF.w + 0.05)));
  const zFirst = -D / 2 + T + 0.2 + SHELF.d / 2, zMax = D / 2 - T - FRONT;
  let row = 0;
  for (let z = zFirst; z <= zMax + 1e-6; z += 2.2, row++) for (const side of [-1, 1]) for (let u = 0; u < perSide; u++) {
    const x = side * (x0 + SHELF.w / 2 + u * (SHELF.w + 0.05));
    shelves.push({ index: shelves.length, row, side, unit: u, c: [x, SHELF.h / 2, z], h: [SHELF.w / 2, SHELF.h / 2, SHELF.d / 2] });
  }
  const counter = { c: [W / 2 - T - 1.5, 0.5, D / 2 - T - 1.0], h: [0.9, 0.5, 0.35] };
  const door = { x: 0, width: 1.2, height: 2.1 };
  return { shelves, counter, door, clearance: { c: [0, 1, D / 2 - FRONT / 2], h: [AISLE, 1, FRONT / 2] }, aisle: { c: [0, 1, 0], h: [AISLE, 1, D / 2 - T] } };
}

export const retailPrefab = {
  validate(p) {
    const o = { width: num(p.width, 8, 24, 12, 'parameters.width'), depth: num(p.depth, 6, 16, 8, 'parameters.depth'), height: num(p.height, 2.4, 5, 3, 'parameters.height'), stock: num(p.stock, 0, 1, 0.85, 'parameters.stock'), seed: Math.floor(num(p.seed, 0, 2147483647, 42, 'parameters.seed')), condition: p.condition == null ? 'new' : p.condition, wallColor: p.wallColor == null ? '#d8d2c4' : p.wallColor };
    if (!['new', 'worn'].includes(o.condition)) err('parameters.condition must be "new" or "worn"', 'parameters.condition');
    if (!/^#[0-9a-fA-F]{6}$/.test(o.wallColor)) err('parameters.wallColor must look like "#d8d2c4"', 'parameters.wallColor');
    return o;
  },
  initState: () => ({ doorOpen: false, removed: [] }),
  validateState(s) {
    const removed = Array.isArray(s.removed) ? s.removed.filter(k => typeof k === 'string').slice(0, 5000) : [];
    return { doorOpen: !!s.doorOpen, removed: [...new Set(removed)] };
  },
  build(rec, ctx) { return new StoreRT(rec, ctx); },
};

class StoreRT {
  constructor(rec, ctx) {
    this.rec = rec; this.ctx = ctx; const lib = ctx.assets.lib, P = rec.parameters, W = P.width, D = P.depth, H = P.height;
    this.lib = lib; this.object = new THREE.Group(); const root = this.object;
    this.L = layout(P, lib.SHELF);
    // ---- room shell with real door and window openings ----
    const wallMat = ctx.material(new THREE.Color(P.wallColor).multiplyScalar(P.condition === 'worn' ? 0.82 : 1).getHex(), 0.9);
    const openings = { s: [{ offset: 0, width: this.L.door.width, sill: 0, top: this.L.door.height, kind: 'door' }], n: [], e: [], w: [] };
    if (W >= 10) for (const sx of [-1, 1]) openings.s.push({ offset: sx * W * 0.3, width: 2.0, sill: 0.9, top: 2.3, kind: 'window' });
    this.boxes = buildRoom({ width: W, depth: D, height: H, wall: T, floor: false, ceiling: true, openings });
    this.local = [{ c: [0, -0.75, 0], h: [W / 2 + 0.2, 0.75, D / 2 + 0.2] }];   // foundation slab: hides the terrain under the building
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ctx.material(0x8a877f, 0.95)); slab.scale.set(W + 0.4, 1.5, D + 0.4); slab.position.y = -0.75; slab.receiveShadow = true; root.add(slab);
    const tile = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ctx.material(0xb6b0a4, 0.5)); tile.scale.set(W - 2 * T, 0.02, D - 2 * T); tile.position.y = 0.01; tile.receiveShadow = true; root.add(tile);
    const vmat = lib.mat('vcol', 0xffffff, 0.8, 0.05, { vertexColors: true });
    const shell = new THREE.Mesh(mergeBoxes(this.boxes.filter(b => b.kind !== 'ceiling').map(b => ({ ...b, color: new THREE.Color(P.wallColor).getHex() })), P.condition === 'worn' ? 0.82 : 1), vmat); shell.castShadow = shell.receiveShadow = true; root.add(shell);
    this.roof = new THREE.Mesh(mergeBoxes(this.boxes.filter(b => b.kind === 'ceiling').map(b => ({ ...b, color: 0xc9c4b8 }))), vmat); this.roof.castShadow = true; root.add(this.roof);
    for (const b of this.boxes) this.local.push({ c: b.c, h: b.h });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d4, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25 });
    if (W >= 10) for (const sx of [-1, 1]) { const g = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.03), glass); g.position.set(sx * W * 0.3, 1.6, D / 2 - T / 2); root.add(g); }
    // ---- door leaf on a hinge at the left jamb ----
    this.zFront = D / 2 - T / 2; this.hinge = new THREE.Group(); this.hinge.position.set(-this.L.door.width / 2, 0, this.zFront); this.hinge.add(lib.gen['retail.door']()); root.add(this.hinge); this.hinge.children[0].position.x = 0;
    // ---- shelves + counter ----
    const SHx = lib.SHELF, sb = [{ c: [0, SHx.h / 2 + 0.03, -SHx.d / 2 + 0.02], h: [(SHx.w - 0.04) / 2, (SHx.h - 0.1) / 2, 0.01], color: 0x2d3035 }];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sb.push({ c: [sx * (SHx.w / 2 - 0.02), SHx.h / 2, sz * (SHx.d / 2 - 0.02)], h: [0.02, SHx.h / 2, 0.02], color: 0x4a4d52 });
    for (let i = 0; i < SHx.tiers; i++) sb.push({ c: [0, SHx.firstY + i * SHx.pitch - 0.015, 0], h: [(SHx.w - 0.04) / 2, 0.015, (SHx.d - 0.04) / 2], color: 0xb9b4ac });
    this.shelfMesh = new THREE.InstancedMesh(mergeBoxes(sb), vmat, Math.max(1, this.L.shelves.length)); this.shelfMesh.castShadow = this.shelfMesh.receiveShadow = true;
    this.L.shelves.forEach((s, i) => { this.shelfMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(s.c[0], 0, s.c[2])); this.local.push({ c: s.c, h: s.h }); }); this.shelfMesh.count = this.L.shelves.length; this.shelfMesh.computeBoundingSphere(); root.add(this.shelfMesh);
    const counter = lib.gen['retail.checkout'](); counter.position.set(this.L.counter.c[0], 0, this.L.counter.c[2]); root.add(counter); this.local.push(this.L.counter);
    // ---- products: one InstancedMesh per type, slot keys are stable ----
    this.types = ['can', 'bottle', 'box']; this.slots = []; this.index = new Map(); this.meshes = {};
    const SH = lib.SHELF, pid = rec.id;
    this.L.shelves.forEach(s => { for (let tier = 0; tier < SH.tiers; tier++) {
      const type = this.types[Math.floor(hash(`${P.seed}:t:${s.index}:${tier}`) * 3)], pr = lib.product[type], cols = Math.floor((SH.w - 0.1) / (pr.w + 0.015)), y = SH.firstY + tier * SH.pitch;
      for (let d = 0; d < DEPTH_ROWS; d++) for (let c = 0; c < cols; c++) {
        const key = `${pid}/s${String(s.index).padStart(2, '0')}/t${tier}/c${c}d${d}`; if (hash(`${P.seed}:p:${key}`) >= P.stock) continue;
        const jit = P.condition === 'worn' ? 1 : 0, j1 = hash(key + 'x') - 0.5, j2 = hash(key + 'r') - 0.5;
        const lx = -SH.w / 2 + 0.05 + (c + 0.5) * ((SH.w - 0.1) / cols) + j1 * 0.01 * jit, lz = SH.d / 2 - 0.1 - d * (pr.d + 0.02) + j1 * 0.01 * jit;
        this.slots.push({ key, type, pos: [s.c[0] + lx, y, s.c[2] + lz], yaw: j2 * 0.8 * jit, tint: hash(key + 'c') }); } } });
    for (const type of this.types) {
      const list = this.slots.filter(s => s.type === type); if (!list.length) continue; const pr = lib.product[type];
      const im = new THREE.InstancedMesh(pr.geometry(), pr.material(), list.length); im.castShadow = true; im.receiveShadow = true; im.userData.type = type; root.add(im); this.meshes[type] = im;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      list.forEach((s, i) => { s.i = i; m4.compose(new THREE.Vector3(...s.pos), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); im.setColorAt(i, c.setHSL(type === 'can' ? s.tint * 0.08 : type === 'bottle' ? 0.35 + s.tint * 0.3 : 0.1 + s.tint * 0.08, 0.5, 0.45 + s.tint * 0.2)); this.index.set(s.key, s); });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox();
    }
    // ---- interior lights (no shadows: cheap) ----
    for (const sx of [-1, 1]) { const l = new THREE.PointLight(0xfff1d6, 7, 12, 2); l.position.set(sx * W / 4, H - 0.4, 0); root.add(l); }
    this.hidden = new Set(); this.doorAngle = 0; this.doorTarget = 0; this.applyState(rec.state, true);
  }
  // ---- state ----
  applyState(st, instant) {
    this.doorTarget = st.doorOpen ? -Math.PI * 0.55 : 0; if (instant) { this.doorAngle = this.doorTarget; this.hinge.rotation.y = this.doorAngle; }
    const want = new Set(st.removed.filter(k => this.index.has(k))), m4 = new THREE.Matrix4(), z = new THREE.Matrix4().makeScale(0, 0, 0);
    const touch = k => { const s = this.index.get(k), im = this.meshes[s.type]; if (want.has(k)) im.setMatrixAt(s.i, z); else { m4.compose(new THREE.Vector3(...s.pos), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(1, 1, 1)); im.setMatrixAt(s.i, m4); } im.instanceMatrix.needsUpdate = true; };
    new Set([...this.hidden, ...want]).forEach(touch); this.hidden = want;
  }
  tick(dt) { this.roof.visible = this.ctx.app.mode !== 'edit'; if (Math.abs(this.doorAngle - this.doorTarget) > 1e-3) { this.doorAngle += (this.doorTarget - this.doorAngle) * (1 - Math.exp(-9 * dt)); this.hinge.rotation.y = this.doorAngle; } }
  instanceCount() { return this.slots.length - this.hidden.size; }
  info() { return { slots: this.slots.length, taken: this.hidden.size, shelves: this.L.shelves.length, doorOpen: !!this.rec.state.doorOpen, drawCallsProducts: Object.keys(this.meshes).length }; }
  colliders() {
    const open = this.rec.state.doorOpen, boxes = this.local.slice();
    if (!open) boxes.push({ c: [0, this.L.door.height / 2, this.zFront], h: [this.L.door.width / 2, this.L.door.height / 2, 0.04] });
    return toWorld(this.object, boxes);
  }
  // nearest product within reach of a world point (player chest), skipping ones already taken
  nearestProduct(world, reach = 1.4) {
    const p = this.object.worldToLocal(world.clone()); let best = null, bd = reach * reach;
    for (const s of this.slots) { if (this.hidden.has(s.key)) continue; const dx = s.pos[0] - p.x, dy = s.pos[1] + 0.1 - p.y, dz = s.pos[2] - p.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = s; } }
    return best && { key: best.key, type: best.type, name: this.lib.product[best.type].name, distance: Math.sqrt(bd) };
  }
  nearDoor(world, reach = 2.3) { const p = this.object.worldToLocal(world.clone()); return Math.hypot(p.x, p.z - this.zFront) < reach && p.y < 3; }
  dispose() { this.shelfMesh.dispose(); Object.values(this.meshes).forEach(m => m.dispose()); }
}
export { overlaps };
