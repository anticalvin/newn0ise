// Physical models: turns any placed model entity (a catalog asset or a primitive) into a real dynamic rigid body, so it can be shoved, punched, shot at,
// grabbed, thrown, knocked over and stacked like the crates and barrels. The body is a box fitted to the model's measured size (an approximation: no
// per-mesh convex hulls yet). The entity record stays the source of truth: it saves collider {type:"dynamic", mass?} and its transform is written back
// from the body whenever the scene is saved, so a reload puts every model where it came to rest.
import * as THREE from 'three';
import { clamp } from './util.js';

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _e = new THREE.Euler();
export const isDynamic = rec => !!(rec && rec.components && rec.components.collider && rec.components.collider.type === 'dynamic');
const PREFABS = new Set(['asset', 'prim.box', 'prim.sphere', 'prim.cylinder']);

export class DynEnts {
  constructor(app) { this.a = app; this.live = new Map(); }       // entity id -> { b: prop item, pivot }
  get count() { return this.live.size; }
  eligible(rec) { return !!rec && PREFABS.has(rec.prefab) && !rec.parent; }
  // measured local size [w,h,d] (before the entity's scale) of the model; origin is at the floor centre
  localSize(rec) {
    if (rec.prefab === 'asset') { try { return this.a.assets.size(rec.parameters.assetId); } catch { return [1, 1, 1]; } }
    return rec.parameters.size || [1, 1, 1];
  }
  attach(rec) {
    const E = this.a.entities; if (!this.eligible(rec) || this.live.has(rec.id)) return false;
    const rt = E.rt.get(rec.id); if (!rt) return false; const obj = rt.object, sc = rec.transform.scale || [1, 1, 1], ls = this.localSize(rec);
    const h = [Math.max(0.05, ls[0] * Math.abs(sc[0]) / 2), Math.max(0.05, ls[1] * Math.abs(sc[1]) / 2), Math.max(0.05, ls[2] * Math.abs(sc[2]) / 2)];
    obj.updateMatrixWorld(true); obj.getWorldQuaternion(_q); obj.getWorldPosition(_p);
    const centre = new THREE.Vector3(0, h[1], 0).applyQuaternion(_q).add(_p), pivot = new THREE.Group(); pivot.name = 'dyn:' + rec.id; pivot.position.copy(centre); pivot.quaternion.copy(_q);
    this.a.scene.add(pivot); pivot.add(obj); obj.position.set(0, -h[1], 0); obj.quaternion.identity(); obj.updateMatrixWorld(true);
    const col = rec.components.collider || {}, vol = 8 * h[0] * h[1] * h[2], mass = clamp(col.mass || vol * 220, 2, 3000);
    const b = this.a.boulders.addModel(pivot, h, mass, rec.id); b.detach = () => this.release(rec.id, b);
    pivot.traverse(o => { o.userData.prop = b; }); pivot.userData.prop = b;
    this.live.set(rec.id, { b, pivot }); return true;
  }
  // write the body's transform back into the record (position is the entity origin, i.e. the floor centre of the model)
  sync(id) {
    const E = this.a.entities, ids = id ? [id] : [...this.live.keys()];
    for (const i of ids) { const L = this.live.get(i), rec = E.recs.get(i); if (!L || !rec) continue; const o = E.rt.get(i).object; o.updateMatrixWorld(true); o.getWorldPosition(_p); o.getWorldQuaternion(_q); _e.setFromQuaternion(_q, 'YXZ');
      const r = n => +n.toFixed(3); rec.transform.position = [r(_p.x), r(_p.y), r(_p.z)]; rec.transform.rotation = [r(_e.x), r(_e.y), r(_e.z)]; }
  }
  // take the body away and put the entity back where it lies, as an ordinary (static or unphysical) entity
  detach(id) { const L = this.live.get(id); if (!L) return false; this.a.boulders.remove(L.b); return true; }
  release(id, b) {
    const L = this.live.get(id); if (!L) return; this.sync(id); const E = this.a.entities, rt = E.rt.get(id); this.live.delete(id);
    if (rt) { E.group.add(rt.object); E.apply(E.recs.get(id), rt.object); rt.object.traverse(o => { if (o.userData.prop === b) delete o.userData.prop; }); }
    L.pivot.removeFromParent();
  }
  // make the entity match its record: attach when it says dynamic, detach when it no longer does
  refresh(id) { const rec = this.a.entities.recs.get(id), on = isDynamic(rec); if (on && !this.live.has(id)) return this.attach(rec); if (!on && this.live.has(id)) return this.detach(id); return false; }
  // every eligible model (or all that match `only`) -> dynamic / static; returns the number changed
  setAll(mode, only) {
    const E = this.a.entities; let n = 0;
    for (const rec of [...E.recs.values()]) { if (!this.eligible(rec) || (only && !only(rec))) continue; if ((mode === 'dynamic') === isDynamic(rec)) continue;
      if (mode !== 'dynamic') this.detach(rec.id); const col = { ...(rec.components.collider || {}), type: mode === 'dynamic' ? 'dynamic' : 'static' }; E.set(rec.id, { components: { collider: col } }); n++; }
    return n;
  }
}
