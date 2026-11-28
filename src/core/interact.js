// Interaction foundation: affordances.
// An AFFORDANCE says what an entity lets an actor do (open, sit, carry, consume ...). Prefabs DECLARE them as data (`affordances(rec)` -> [{type, anchor, reach, ...}]);
// this module is the one runtime that executes them, for the player, fighters/NPCs (any Actor) and Core commands (`interact.discover`, `interact.perform`).
// No chair, door or cup has code of its own here. A door is a hinged part + an `open` affordance; a cup is a `carry` + a `consume`.
//
// Lifecycle of one interaction: discover -> availability -> reserve -> execute -> (animate in tick) -> finish/release. Each step publishes an event on app.events.
// State split (see docs/INTERACTION.md): the authored record (rec.state, rec.transform) is NEVER written. Runtime state lives in this world and dies on Stop.
import * as THREE from 'three';

export class Events {
  constructor() { this.h = new Map(); this.log = []; }
  on(type, fn) { (this.h.get(type) || this.h.set(type, []).get(type)).push(fn); return () => this.off(type, fn); }
  off(type, fn) { const l = this.h.get(type); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(type, data) { this.log.push({ type, ...data }); if (this.log.length > 200) this.log.shift(); for (const f of this.h.get(type) || []) f(data); for (const f of this.h.get('*') || []) f({ type, ...data }); }
}

const D2R = Math.PI / 180, V = new THREE.Vector3(), V2 = new THREE.Vector3();
const fwd = yaw => [Math.sin(yaw), Math.cos(yaw)];

// ---- affordance types: label, availability and execution live here, once ----
// ctx: {w: world, actor, st: actor state, e: entry, aff}. `reason` strings are what the player sees when something is unavailable.
export const TYPES = {
  open: {
    verb: ctx => ctx.e.st.open ? 'Close' : 'Open',
    can: () => null,
    run({ w, actor, e, aff }) {
      const part = e.rt.parts && e.rt.parts[aff.part || 'leaf']; if (!part) return 'This door has no moving part.';
      if (!e.st.open) { const local = e.obj.worldToLocal(V.set(actor.pos.x, actor.pos.y, actor.pos.z)); e.st.side = local.z >= 0 ? 1 : -1; }   // swing away from the person opening it
      e.st.open = !e.st.open; e.st.target = e.st.open ? e.st.side * (aff.angle ?? 100) * D2R : 0; e.moving = e.rt.moving = true; w.refresh();
      w.emit(e.st.open ? 'opened' : 'closed', { entity: e.id, actor: actor.id }); return null;
    },
    tick(w, e, aff, dt) {
      const part = e.rt.parts[aff.part || 'leaf']; if (!e.moving) return;
      e.st.angle += (e.st.target - e.st.angle) * (1 - Math.exp(-9 * dt)); part.rotation.y = e.st.angle;
      if (Math.abs(e.st.target - e.st.angle) < 0.004) { e.st.angle = e.st.target; part.rotation.y = e.st.angle; e.moving = e.rt.moving = false; w.refresh(); w.emit('settled', { entity: e.id, open: e.st.open }); }
    },
  },
  sit: {
    verb: () => 'Sit',
    can: ({ st, e }) => st.seat ? 'Already sitting.' : st.carrying ? 'Put that down first.' : e.by ? 'Someone is sitting there.' : null,
    run({ w, actor, st, e, aff }) {
      const a = w.world(e, aff.anchor || [0, 0.45, 0]), face = e.obj.rotation.y + (aff.facing ?? 0) * D2R;
      st.seat = { id: e.id, aff, back: { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z, frozen: !!actor.frozen } }; e.by = actor.id;
      actor.frozen = true; actor.pos.set(a.x, a.y - (aff.hip ?? 0.55), a.z); actor.prev.copy(actor.pos); actor.vel.set(0, 0, 0); actor.yaw = actor.prevYaw = face; w.teleport(actor);
      w.emit('sat', { entity: e.id, actor: actor.id }); return null;
    },
  },
  carry: {
    verb: () => 'Pick up',
    can: ({ st, e, aff }) => st.carrying ? 'Your hands are full.' : st.seat ? 'Stand up first.' : e.by ? 'Someone has that.' : null,
    run({ w, actor, st, e, aff }) {
      const p = aff.profile || {}; st.carrying = { id: e.id, aff, profile: { mass: 1, hands: 1, upright: true, ...p }, pos: new THREE.Vector3() }; e.by = actor.id;
      st.speed0 = actor.speedMul; actor.speedMul = st.speed0 * (1 - Math.min(0.4, st.carrying.profile.mass * 0.05));   // heavier things slow you down, up to 40%
      e.obj.getWorldPosition(st.carrying.pos); w.emit('picked', { entity: e.id, actor: actor.id, mass: st.carrying.profile.mass }); return null;
    },
  },
  consume: {
    verb: () => 'Drink',
    needsHeld: true,
    can: ({ e }) => e.st.left <= 0 ? 'It is empty.' : null,
    run({ w, actor, e, aff }) { e.st.left = e.st.left - 1 / (aff.sips || 3); if (e.st.left < 1e-6) e.st.left = 0;   // snap float dust so the last sip really empties it
      w.emit('consumed', { entity: e.id, actor: actor.id, left: +e.st.left.toFixed(3) }); return null; },
  },
};

// ---- the world: every interactive entity in the running scene ----
export class InteractWorld {
  constructor(app) {
    this.a = app; this.entries = new Map(); this.actors = new WeakMap(); this.touched = new Set(); this.hint = null;
    this.events = app.events || (app.events = new Events());
    const E = app.entities; E.recs.forEach((r, id) => { const def = E.prefabs.get(r.prefab); if (!def || !def.affordances) return; const rt = E.rt.get(id); if (rt) this.add(r, def, rt); });
  }
  add(rec, def, rt) {
    const affs = def.affordances(rec).map(a => ({ reach: 1.8, ...a }));
    // runtime state starts from the authored record and is never copied back
    const st = { open: !!(rec.state && rec.state.open), side: 1, angle: 0, target: 0, left: rec.state && rec.state.left != null ? rec.state.left : 1 };
    if (st.open) { const a = (affs.find(x => x.type === 'open') || {}).angle ?? 100; st.angle = st.target = a * D2R; }
    const e = { id: rec.id, rec, rt, obj: rt.object, affs, st, by: null, moving: false, home: { pos: rt.object.position.clone(), quat: rt.object.quaternion.clone() } };
    this.entries.set(rec.id, e); this.applyVisual(e);
  }
  applyVisual(e) { const a = e.affs.find(x => x.type === 'open'), part = a && e.rt.parts && e.rt.parts[a.part || 'leaf']; if (part) part.rotation.y = e.st.angle; if (e.rt.setLevel) e.rt.setLevel(e.st.left); }
  state(actor) { let s = this.actors.get(actor); if (!s) { s = { carrying: null, seat: null }; this.actors.set(actor, s); this.touched.add(actor); } return s; }
  emit(type, data) { this.events.emit('interaction.' + type, data); }
  refresh() { this.a.entities.changed(); }
  teleport(actor) { if (this.a.phys && this.a.phys.ready) this.a.phys.teleport(actor); }
  world(e, local) { e.obj.updateMatrixWorld(true); return V2.set(...local).applyMatrix4(e.obj.matrixWorld).clone(); }

  // ---- 1. discovery + 2. availability ----
  discover(actor) {
    const st = this.state(actor), out = [], [fx, fz] = fwd(actor.yaw);
    if (st.seat) return [{ entity: st.seat.id, type: 'stand', verb: 'Stand', dist: 0, available: true, reason: null }];
    const consider = (e, aff) => {
      const T = TYPES[aff.type]; if (!T) return;
      const held = st.carrying && st.carrying.id === e.id; if (T.needsHeld ? !held : held) return;
      const a = this.world(e, aff.anchor || [0, 0.5, 0]), dx = a.x - actor.pos.x, dz = a.z - actor.pos.z, dist = Math.hypot(dx, dz), dy = Math.abs(a.y - (actor.pos.y + 0.9));
      if (dist > aff.reach || dy > 1.8) return;
      const facing = dist < 0.01 ? 1 : (dx * fx + dz * fz) / dist;   // 1 = straight ahead; things beside you still count, things behind you do not
      if (facing < -0.1 && dist > 0.8) return;
      const reason = T.can({ w: this, actor, st, e, aff });
      out.push({ entity: e.id, type: aff.type, verb: T.verb({ e, aff }), dist: +(dist - facing * 0.3).toFixed(3), available: !reason, reason, aff });
    };
    if (st.carrying) { const e = this.entries.get(st.carrying.id); out.push({ entity: e.id, type: 'place', verb: 'Put down', dist: -1, available: true, reason: null }); e.affs.forEach(aff => consider(e, aff)); }
    this.entries.forEach(e => { if (e.by === actor.id) return; e.affs.forEach(aff => consider(e, aff)); });   // other things stay listed (unavailable, with the reason) so the actor is told why
    return out.sort((a, b) => a.dist - b.dist);
  }

  // ---- 3..10. reserve, execute, release, publish ----
  perform(actor, entityId, type) {
    const st = this.state(actor);
    if (type === 'stand') return this.stand(actor);
    if (type === 'place') return this.place(actor);
    const e = this.entries.get(entityId); if (!e) return { ok: false, code: 'interact.unknown', msg: `No interactive entity "${entityId}" in the running scene. Press Play first.` };
    const d = this.discover(actor).find(x => x.entity === entityId && x.type === type);
    if (!d) return { ok: false, code: 'interact.range', msg: `Too far from ${entityId} to ${type}. Walk up to it and face it.` };
    if (!d.available) { this.emit('refused', { entity: entityId, actor: actor.id, type, reason: d.reason }); return { ok: false, code: 'interact.busy', msg: d.reason }; }
    this.emit('started', { entity: entityId, actor: actor.id, type });
    const err = TYPES[type].run({ w: this, actor, st, e, aff: d.aff });
    if (err) { this.emit('failed', { entity: entityId, actor: actor.id, type, reason: err }); return { ok: false, code: 'interact.failed', msg: err }; }
    return { ok: true, msg: d.verb };
  }
  // the best thing the Use key should do right now
  use(actor) { const d = this.discover(actor).find(x => x.available) || null; return d ? this.perform(actor, d.entity, d.type) : { ok: false, code: 'interact.none', msg: 'Nothing to use here.' }; }

  stand(actor) {
    const st = this.state(actor), s = st.seat; if (!s) return { ok: false, code: 'interact.none', msg: 'Not sitting.' };
    const e = this.entries.get(s.id), x = this.world(e, s.aff.exit || [0, 0, 0.8]); st.seat = null; e.by = null;
    actor.pos.set(x.x, s.back.y, x.z); actor.prev.copy(actor.pos); actor.vel.set(0, 0, 0); actor.frozen = s.back.frozen; this.teleport(actor);
    this.emit('stood', { entity: s.id, actor: actor.id }); return { ok: true, msg: 'Stood up' };
  }
  place(actor) {
    const st = this.state(actor), c = st.carrying; if (!c) return { ok: false, code: 'interact.none', msg: 'Not carrying anything.' };
    const e = this.entries.get(c.id), [fx, fz] = fwd(actor.yaw), x = actor.pos.x + fx * 0.75, z = actor.pos.z + fz * 0.75, y = this.surfaceY(x, z, actor.pos.y + 1.5, actor.pos.y);
    this.setWorld(e, x, y, z, e.obj.rotation.y); actor.speedMul = st.speed0; st.carrying = null; e.by = null; this.refresh();
    this.emit('placed', { entity: c.id, actor: actor.id, at: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)] }); return { ok: true, msg: 'Put down' };
  }
  // top of whatever is under (x,z), found with a Rapier ray from `from`; falls back to `floor`
  surfaceY(x, z, from, floor) {
    const P = this.a.phys; if (!P || !P.ready) return floor;
    const R = P.R, ray = new R.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 }), pl = this.a.player, hit = P.world.castRay(ray, 6, true, undefined, undefined, undefined, pl && pl.body || undefined);
    return hit ? from - hit.timeOfImpact : floor;
  }
  setWorld(e, x, y, z, yaw) { const o = e.obj; V.set(x, y, z); if (o.parent) o.parent.worldToLocal(V); o.position.copy(V); o.rotation.set(0, yaw, 0); o.updateMatrixWorld(true); }
  release(actor) { const st = this.state(actor); if (st.seat) this.stand(actor); if (st.carrying) this.place(actor); }   // interruption: dying, being teleported, Stop

  // ---- fixed step: animate moving parts, keep carried things in the hands ----
  tick(dt) {
    this.entries.forEach(e => { for (const aff of e.affs) { const T = TYPES[aff.type]; if (T && T.tick && e.moving) T.tick(this, e, aff, dt); } if (e.rt.setLevel) e.rt.setLevel(e.st.left); });
    for (const actor of this.touched) {
      const st = this.actors.get(actor), c = st && st.carrying; if (!c) continue; const e = this.entries.get(c.id), P = c.profile, [fx, fz] = fwd(actor.yaw);
      const side = P.hands === 1 ? 0.3 : 0, up = P.hands === 1 ? 1.0 : 1.12, out = P.hands === 1 ? 0.28 : 0.5, rx = Math.cos(actor.yaw), rz = -Math.sin(actor.yaw);   // one hand: beside the hip; two hands: hugged at the chest
      const tx = actor.pos.x + fx * out + rx * side, ty = actor.pos.y + up - (P.height || 0.1), tz = actor.pos.z + fz * out + rz * side, k = 1 - Math.exp(-18 * dt);
      c.pos.x += (tx - c.pos.x) * k; c.pos.y += (ty - c.pos.y) * k; c.pos.z += (tz - c.pos.z) * k;
      this.setWorld(e, c.pos.x, c.pos.y, c.pos.z, actor.yaw);   // the profile's `upright` flag is for tilt under physics (later); today every carried thing stays level
    }
    // the on-screen prompt for the player
    const pl = this.a.player; if (pl) { const d = this.discover(pl).find(x => x.available) || this.discover(pl)[0]; this.hint = d || null; this.showHint(d); }
  }
  showHint(d) {
    if (!this.el) { const el = this.el = document.createElement('div'); el.className = 'ix-hint'; el.setAttribute('role', 'status'); el.style.cssText = 'position:fixed;left:50%;bottom:calc(120px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:9px 16px;border-radius:999px;font:600 13px/1 system-ui,sans-serif;color:#f4efe6;background:rgba(18,18,20,.62);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.18);pointer-events:none;transition:opacity .15s;opacity:0;z-index:30;white-space:nowrap'; document.body.appendChild(el); }
    const txt = d ? (d.available ? `F  ${d.verb}${d.type === 'place' ? '' : ' · ' + d.entity.replace(/_\d+$/, '').replace(/^(interact|prop|pickup)[._]/, '').replace(/_/g, ' ')}` : d.reason) : ''; if (txt !== this.lastTxt) { this.el.textContent = txt; this.lastTxt = txt; } this.el.style.opacity = txt ? 1 : 0;
  }
  // Stop: give everything back exactly as authored
  dispose() {
    for (const actor of [...this.touched]) this.release(actor);
    this.entries.forEach(e => { e.obj.position.copy(e.home.pos); e.obj.quaternion.copy(e.home.quat); e.st.angle = 0; e.st.open = !!(e.rec.state && e.rec.state.open); e.st.left = e.rec.state && e.rec.state.left != null ? e.rec.state.left : 1; const a = e.affs.find(x => x.type === 'open'); if (e.st.open && a) e.st.angle = (a.angle ?? 100) * D2R; this.applyVisual(e); });
    this.refresh(); this.entries.clear(); if (this.el) { this.el.remove(); this.el = null; }
  }
  describe() { const out = []; this.entries.forEach(e => out.push({ entity: e.id, affordances: e.affs.map(a => a.type), open: e.st.open, by: e.by, left: e.st.left })); return out; }
}
