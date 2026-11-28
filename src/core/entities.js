// EntityRegistry: the authoritative list of placed things. A record is plain JSON (id, prefab, parent, transform, parameters, components, state, tags);
// the three.js objects and Rapier colliders are DERIVED from records and rebuilt on load, never saved. Every mutation is validated and returns
// structured errors {ok:false, code, msg, path}; Core.exec wraps each one in a single undo entry.
// Prefabs register {validate(params)->params|throws, build(rec, ctx)->runtime}. A runtime is {object, colliders(), instanceCount?(), dispose?()}.
import * as THREE from 'three';
import { patchStandard } from './glsl.js';
import { registerBuildKit } from './buildkit.js';
import { registerLevelKit } from './levelkit.js';

export const LIMIT = 2000;
const ID = /^[A-Za-z0-9_.-]{1,64}$/;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const hexOk = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
export class EntityError extends Error { constructor(code, msg, path) { super(msg); this.code = code; this.path = path; } }
const bad = (code, msg, path) => { throw new EntityError(code, msg, path); };
const vec3 = (v, path, lo, hi, d) => { if (v == null) return d.slice(); if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) bad('entity.invalid', `${path} must be [x,y,z] numbers`, path); return v.map(n => Math.min(hi, Math.max(lo, n))); };

// local-space boxes {c,h} on an object -> world-space {c,h,q} for Rapier
export function toWorld(obj, boxes) {
  obj.updateMatrixWorld(true); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); obj.matrixWorld.decompose(p, q, s);
  return boxes.map(b => { const c = new THREE.Vector3(...b.c).applyMatrix4(obj.matrixWorld); return { c: [c.x, c.y, c.z], h: [Math.max(0.01, b.h[0] * Math.abs(s.x)), Math.max(0.01, b.h[1] * Math.abs(s.y)), Math.max(0.01, b.h[2] * Math.abs(s.z))], q: [q.x, q.y, q.z, q.w] }; });
}

export class Entities {
  constructor(app) {
    this.a = app; this.recs = new Map(); this.rt = new Map(); this.prefabs = new Map(); this.group = new THREE.Group(); this.group.name = 'entities'; app.scene.add(this.group);
    this.mats = {}; this._cols = false; this.nextId = 1;
    this.register('prim.box', primPrefab('box')); this.register('prim.sphere', primPrefab('sphere')); this.register('prim.cylinder', primPrefab('cylinder'));
    this.register('asset', assetPrefab); registerBuildKit(this, { toWorld, bad, vec3, hexOk, isNum }); registerLevelKit(this, { vec3, bad });
  }
  get size() { return this.recs.size; }
  register(name, def) { this.prefabs.set(name, def); }
  instanceCount() { let n = 0; this.rt.forEach(r => { n += r.instanceCount ? r.instanceCount() : 0; }); return n; }
  ctx() { return { app: this.a, assets: this.a.assets, shared: this.a.shared, entities: this, material: (c, r = 0.7) => this.mats[c + r] || (this.mats[c + r] = patchStandard(new THREE.MeshStandardMaterial({ color: c, roughness: r }), this.a.shared, {}, 'ent')) }; }
  changed() { if (this._cols) return; this._cols = true; queueMicrotask(() => { this._cols = false; this.a.refreshColliders && this.a.refreshColliders(); }); }
  colliders() { const out = []; this.rt.forEach((r, id) => { const rec = this.recs.get(id); if (rec.visible !== false && !(rec.components.collider && rec.components.collider.type === 'dynamic')) out.push(...r.colliders()); }); return out; }

  // ---- validation: turns a loose spec into a canonical record or throws EntityError ----
  normalize(spec, base) {
    if (!spec || typeof spec !== 'object') bad('entity.invalid', 'Pass an object like {"prefab":"prim.box"}', '');
    const r = base ? structuredClone(base) : { id: null, prefab: null, parent: null, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, parameters: {}, components: {}, state: {}, tags: [] };
    if (spec.prefab != null && !base) { if (!this.prefabs.has(spec.prefab)) bad('entity.prefab', `Unknown prefab "${spec.prefab}" (have: ${[...this.prefabs.keys()].join(', ')})`, 'prefab'); r.prefab = spec.prefab; }
    if (!base && !r.prefab) bad('entity.invalid', 'prefab is required', 'prefab');
    if (spec.id != null && !base) { if (!ID.test(String(spec.id))) bad('entity.id', 'id must be 1-64 characters: letters, digits, . _ -', 'id'); r.id = String(spec.id); }
    if (!base && !r.id) { do { r.id = r.prefab.replace(/[^A-Za-z0-9]+/g, '_') + '_' + (this.nextId++); } while (this.recs.has(r.id)); }
    if (spec.parent !== undefined) { if (spec.parent === null) r.parent = null; else { if (!this.recs.has(spec.parent)) bad('entity.parent', `parent "${spec.parent}" does not exist`, 'parent'); if (spec.parent === r.id) bad('entity.parent', 'an entity cannot be its own parent', 'parent'); r.parent = spec.parent; } }
    const t = spec.transform || {}, T = r.transform;
    const pos = t.position ?? spec.position, rot = t.rotation ?? spec.rotation, deg = t.rotationDeg ?? spec.rotationDeg, scl = t.scale ?? spec.scale;
    if (pos !== undefined) T.position = vec3(pos, 'transform.position', -1000, 1000, [0, 0, 0]);
    if (rot !== undefined) T.rotation = vec3(rot, 'transform.rotation', -100, 100, [0, 0, 0]);   // radians
    if (deg !== undefined) T.rotation = vec3(deg, 'transform.rotationDeg', -36000, 36000, [0, 0, 0]).map(d => d * Math.PI / 180);
    if (scl !== undefined) T.scale = isNum(scl) ? vec3([scl, scl, scl], 'transform.scale', 0.01, 100, [1, 1, 1]) : vec3(scl, 'transform.scale', 0.01, 100, [1, 1, 1]);
    const def = this.prefabs.get(r.prefab);
    if (spec.parameters !== undefined || !base) r.parameters = def.validate({ ...(base ? base.parameters : {}), ...(spec.parameters || {}) }, this.ctx());
    if (spec.components !== undefined) {
      const c = spec.components; if (!c || typeof c !== 'object') bad('entity.invalid', 'components must be an object', 'components');
      const col = c.collider; if (col !== undefined && !(col && ['static', 'none', 'dynamic'].includes(col.type))) bad('entity.invalid', 'components.collider.type must be "static", "dynamic" or "none"', 'components.collider.type');
      if (col && col.mass !== undefined && !(isNum(col.mass) && col.mass >= 0.5 && col.mass <= 5000)) bad('entity.invalid', 'components.collider.mass must be 0.5 to 5000 (kg)', 'components.collider.mass');
      if (c.render !== undefined && !(c.render && typeof c.render === 'object')) bad('entity.invalid', 'components.render must be an object', 'components.render');
      r.components = { ...r.components, ...(col ? { collider: { type: col.type, ...(col.mass !== undefined ? { mass: col.mass } : {}) } } : {}), ...(c.render ? { render: { visible: c.render.visible !== false } } : {}), ...(c.interaction ? { interaction: { type: String(c.interaction.type || 'inspect').slice(0, 24) } } : {}) };
    }
    if (spec.state !== undefined) { if (!spec.state || typeof spec.state !== 'object') bad('entity.invalid', 'state must be an object', 'state'); r.state = def.validateState ? def.validateState(spec.state, r) : spec.state; }
    else if (!base && def.initState) r.state = def.initState(r);
    if (spec.tags !== undefined) { if (!Array.isArray(spec.tags) || spec.tags.length > 16) bad('entity.invalid', 'tags must be a list of up to 16 strings', 'tags'); r.tags = spec.tags.map(s => String(s).slice(0, 24)); }
    return r;
  }
  parentObject(r) { return r.parent ? (this.rt.get(r.parent) || {}).object || this.group : this.group; }
  apply(r, obj) { const T = r.transform; obj.position.set(...T.position); obj.rotation.set(T.rotation[0], T.rotation[1], T.rotation[2], 'YXZ'); obj.scale.set(...T.scale); obj.visible = !(r.components.render && r.components.render.visible === false); obj.userData.entityId = r.id; }
  buildRT(r) { const rt = this.prefabs.get(r.prefab).build(r, this.ctx()); this.apply(r, rt.object); this.parentObject(r).add(rt.object); return rt; }

  create(spec) {
    if (this.recs.size >= LIMIT) bad('entity.limit', `Entity limit reached (${LIMIT})`, '');
    const r = this.normalize(spec); if (this.recs.has(r.id)) bad('entity.duplicate', `id "${r.id}" already exists`, 'id');
    const rt = this.buildRT(r); this.recs.set(r.id, r); this.rt.set(r.id, rt); this.a.dyn && this.a.dyn.refresh(r.id); this.changed(); return r;
  }
  get(id) { const r = this.recs.get(id); if (!r) bad('entity.unknown', `No entity "${id}"`, 'id'); return r; }
  set(id, patch) {
    this.get(id); this.a.dyn && this.a.dyn.detach(id);
    const old = this.get(id), r = this.normalize(patch, old), prev = this.rt.get(id);
    if (patch.parent !== undefined && patch.parent !== old.parent) { let p = patch.parent; while (p) { if (p === id) bad('entity.parent', 'that would make a loop', 'parent'); p = this.recs.get(p).parent; } }
    const rebuild = patch.parameters !== undefined || patch.state !== undefined;
    this.recs.set(id, r);
    if (rebuild) {
      const kids = [...prev.object.children].filter(c => c.userData.entityId && this.recs.has(c.userData.entityId));
      let rt; try { rt = this.buildRT(r); } catch (e) { this.recs.set(id, old); throw e; }
      kids.forEach(k => rt.object.add(k)); prev.object.removeFromParent(); prev.dispose && prev.dispose(); this.rt.set(id, rt);
    } else { this.apply(r, prev.object); if (patch.parent !== undefined) this.parentObject(r).add(prev.object); }
    this.a.dyn && this.a.dyn.refresh(id); this.changed(); return r;
  }
  // remove an entity and everything parented to it; returns the removed records (parents first) so undo can restore them
  remove(id) {
    this.get(id); if (this.a.dyn) { this.a.dyn.sync(id); this.a.dyn.detach(id); } const out = [], walk = i => { out.push(structuredClone(this.recs.get(i))); this.recs.forEach(r => { if (r.parent === i) walk(r.id); }); }; walk(id);
    for (const r of out.slice().reverse()) { const rt = this.rt.get(r.id); rt.object.removeFromParent(); rt.dispose && rt.dispose(); this.rt.delete(r.id); this.recs.delete(r.id); }
    this.changed(); return out;
  }
  restore(list) { for (const r of list) { const c = structuredClone(r); const rt = this.buildRT(c); this.recs.set(c.id, c); this.rt.set(c.id, rt); this.a.dyn && this.a.dyn.refresh(c.id); } this.changed(); }
  inspect(id) { const r = this.get(id), rt = this.rt.get(id), b = new THREE.Box3().setFromObject(rt.object); return { ...structuredClone(r), bounds: b.isEmpty() ? null : [...b.min.toArray().map(n => +n.toFixed(3)), ...b.max.toArray().map(n => +n.toFixed(3))], instances: rt.instanceCount ? rt.instanceCount() : 0, colliders: rt.colliders().length, ...(rt.info ? { info: rt.info() } : {}) }; }
  list() { return [...this.recs.values()].map(r => ({ id: r.id, prefab: r.prefab, parent: r.parent, position: r.transform.position, tags: r.tags })); }
  clear() { if (this.a.dyn) [...this.a.dyn.live.keys()].forEach(i => this.a.dyn.detach(i)); [...this.recs.keys()].reverse().forEach(id => { const rt = this.rt.get(id); rt.object.removeFromParent(); rt.dispose && rt.dispose(); }); this.recs.clear(); this.rt.clear(); this.changed(); }
  serialize() { this.a.dyn && this.a.dyn.sync(); return [...this.recs.values()].map(r => structuredClone(r)); }
  // load saved records; parents first. Returns a list of problems (never throws for one bad record, so one broken entity cannot lose a whole scene)
  load(list) {
    this.clear(); const probs = [], todo = (list || []).map(r => structuredClone(r)), done = new Set(); let guard = todo.length + 1;
    while (todo.length && guard--) for (let i = 0; i < todo.length;) { const r = todo[i]; if (r.parent && !done.has(r.parent) && todo.some(o => o.id === r.parent)) { i++; continue; } todo.splice(i, 1);
      try { const spec = { prefab: r.prefab, id: r.id, parent: r.parent, transform: r.transform, parameters: r.parameters, components: r.components, state: r.state, tags: r.tags }; this.create(spec); done.add(r.id); } catch (e) { probs.push({ id: r.id, code: e.code || 'entity.load', msg: e.message }); } }
    todo.forEach(r => probs.push({ id: r.id, code: 'entity.parent', msg: 'parent missing' })); return probs;
  }
  tick(dt, t) { this.rt.forEach(r => r.tick && r.tick(dt, t)); }
}

function primPrefab(shape) {
  return {
    validate(p) {
      const size = vec3(p.size, 'parameters.size', 0.01, 200, [1, 1, 1]); const color = p.color == null ? '#b9b4ac' : p.color; if (!hexOk(color)) bad('entity.invalid', 'parameters.color must look like "#c9c1b3"', 'parameters.color');
      return { size, color };
    },
    build(r, ctx) {
      const [w, h, d] = r.parameters.size, g = shape === 'box' ? new THREE.BoxGeometry(1, 1, 1) : shape === 'sphere' ? new THREE.SphereGeometry(0.5, 24, 16) : new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      const m = new THREE.Mesh(g, ctx.material(new THREE.Color(r.parameters.color).getHex())); m.scale.set(w, h, d); m.position.y = h / 2; m.castShadow = m.receiveShadow = true;
      const o = new THREE.Group(); o.add(m);
      return { object: o, colliders: () => (r.components.collider && r.components.collider.type === 'none') ? [] : toWorld(o, [{ c: [0, h / 2, 0], h: [w / 2, h / 2, d / 2] }]), dispose: () => g.dispose() };
    },
  };
}

const assetPrefab = {
  validate(p, ctx) { if (!p.assetId) bad('entity.invalid', 'parameters.assetId is required', 'parameters.assetId'); try { ctx.assets.meta(p.assetId); } catch (e) { throw new EntityError(e.code || 'asset.unknown', e.message, 'parameters.assetId'); } return { assetId: String(p.assetId) }; },
  build(r, ctx) {
    const a = ctx.assets, id = r.parameters.assetId, o = new THREE.Group(), inner = a.instantiate(id); o.add(inner);
    if (inner.userData.pending) a.ensure(id).then(() => { if (!o.parent) return; o.remove(inner); o.add(a.instantiate(id)); ctx.entities.changed(); }).catch(e => { console.warn('asset ' + id, e.message); });
    const m = a.meta(id), size = a.size(id);
    return { object: o, colliders: () => (m.collider === 'box' && !(r.components.collider && r.components.collider.type === 'none')) ? toWorld(o, [{ c: [0, size[1] / 2, 0], h: [size[0] / 2, size[1] / 2, size[2] / 2] }]) : [] };
  },
};
