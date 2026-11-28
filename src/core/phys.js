// Rapier physics for Core: a heightfield collider that mirrors the sculpted terrain, a kinematic character controller,
// dynamic boulders (balls) and static props. Rapier is the same lazy, pinned build the Studio simulation uses (src/sim.js),
// so it is only fetched when Core opens. Until it is ready (or if it cannot load) simlite.js keeps things walkable.
import { RAPIER_CDN } from '../sim.js';
import { W, S, N } from './terrain.js';
import { clamp } from './util.js';

const HALF = 0.5, RAD = 0.35, FOOT = HALF + RAD;      // capsule: half-segment .5 + radius .35 = 1.7 m tall, centre .85 above the feet
const WATER_DRAG = 2.4, BUOY = 6.0;

let rapierP = null;
export function loadRapier() {
  return rapierP || (rapierP = import(/* webpackIgnore: true */ RAPIER_CDN).then(async m => { const R = m.default || m; await R.init(); return R; }));
}

export class Phys {
  constructor(app) {
    this.a = app; this.ready = false; this.failed = false; this.R = null; this.world = null; this.hf = null; this.hfRev = -1; this.hfAt = 0;
    this.static = []; this.actors = []; this.splash = null; this.onImpact = null; this.stats = { bodies: 0 };
  }
  async init() {
    try {
      const R = this.R = await loadRapier(), a = this.a;
      this.world = new R.World({ x: 0, y: -9.81, z: 0 });
      this.buildHeightfield();
      this.cc = this.world.createCharacterController(0.02);
      this.cc.setUp({ x: 0, y: 1, z: 0 }); this.cc.enableAutostep(0.38, 0.18, true); this.cc.enableSnapToGround(0.4);
      this.cc.setMaxSlopeClimbAngle(56 * Math.PI / 180); this.cc.setMinSlopeSlideAngle(64 * Math.PI / 180);
      this.cc.setApplyImpulsesToDynamicBodies(true); this.cc.setCharacterMass(70);
      this.setProps(this.propDefs || []);
      a.boulders.items.forEach(b => this.addBoulder(b));
      a.boulders.phys = this; this.ready = true; this.actors.forEach(x => this.makeActorBody(x)); this.refreshQueries();
      return true;
    } catch (e) { this.failed = true; this.error = String(e && e.message || e); return false; }
  }
  // ray casts see new colliders only after the scene queries are rebuilt; do it right away instead of waiting for the next step
  refreshQueries() { try { if (this.world.updateSceneQueries) this.world.updateSceneQueries(); else this.world.step(); } catch (e) { /* the next step rebuilds them */ } }
  // ---- terrain ----
  buildHeightfield() {
    const R = this.R, T = this.a.terrain, h = new Float32Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) h[z + x * W] = T.h[z * W + x];      // Rapier wants column-major: rows run along z, columns along x
    if (this.hf) this.world.removeCollider(this.hf, false);
    this.hf = this.world.createCollider(R.ColliderDesc.heightfield(N, N, h, { x: S, y: 1, z: S }).setFriction(0.9).setRestitution(0.1));
    this.hfRev = T.rev; this.hfAt = 0; if (this.ready) this.refreshQueries();
  }
  // called every frame: rebuilds the collider shortly after sculpting stops (a rebuild is ~66k heights, so not once per brush tick)
  syncTerrain(stroking) {
    if (!this.ready) return;
    const T = this.a.terrain;
    if (T.rev === this.hfRev) { this.hfAt = 0; return; }
    if (stroking) return;
    const now = performance.now(); if (!this.hfAt) { this.hfAt = now + 120; return; }
    if (now < this.hfAt) return;
    this.buildHeightfield(); this.wakeAll();
    // a heightfield has no volume: anything now below the new surface would fall through, so lift props (and actors, below) onto it
    for (const b of this.a.boulders.items) {
      if (!b.body) continue; const t = b.body.translation(), g = T.hAt(t.x, t.z), ext = (b.kind === 'boulder' || !b.kind) ? b.r : b.r * 1.05;
      if (t.y - ext < g - 0.02) { const y = g + ext + 0.02, v = b.body.linvel(); b.body.setTranslation({ x: t.x, y, z: t.z }, true); b.body.setLinvel({ x: v.x, y: Math.max(0, v.y), z: v.z }, true); if (b.cp) { b.cp.set(t.x, y, t.z); b.pp.copy(b.cp); } }
    }
    for (const a of this.actors) { const g = T.hAt(a.pos.x, a.pos.z); if (a.pos.y < g - 0.2) a.pos.y = g; }
  }
  setProps(defs) {
    this.propDefs = defs; if (!this.ready) return;
    const R = this.R; this.static.forEach(c => this.world.removeCollider(c, false)); this.static = [];
    for (const d of defs) {
      const desc = R.ColliderDesc.cuboid(d.h[0], d.h[1], d.h[2]).setTranslation(d.c[0], d.c[1], d.c[2]).setFriction(0.8);
      if (d.q) desc.setRotation({ x: d.q[0], y: d.q[1], z: d.q[2], w: d.q[3] });
      this.static.push(this.world.createCollider(desc));
    }
  }
  // ---- dynamic props: boulder (ball), crate (cuboid), barrel (cylinder), all with explicit masses and CCD ----
  addBoulder(b) {
    const R = this.R, boul = b.kind === 'boulder' || !b.kind, body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(b.p.x, b.p.y, b.p.z).setRotation({ x: b.q.x, y: b.q.y, z: b.q.z, w: b.q.w })
      .setLinearDamping(boul ? 0.05 : 0.12).setAngularDamping(boul ? 0.35 : 0.5).setCcdEnabled(true));
    let desc; const mass = b.mass || 45 * b.r ** 3;
    if (b.kind === 'crate') desc = R.ColliderDesc.cuboid(b.r, b.r, b.r).setFriction(0.8).setRestitution(0.12);
    else if (b.kind === 'barrel') desc = R.ColliderDesc.cylinder(b.r * 1.05, b.r * 0.78).setFriction(0.7).setRestitution(0.18);
    else desc = R.ColliderDesc.ball(b.r * 0.92).setFriction(0.9).setRestitution(0.16);
    desc.setMass(mass); b.col = this.world.createCollider(desc, body); b.body = body; b.mass = mass; b.wasWet = false; b.lastSp = 0;
    if (b.cp) { b.cp.copy(b.p); b.pp.copy(b.p); b.cq.copy(b.q); b.pq.copy(b.q); }
  }
  removeBoulder(b) { if (b.body) { this.world.removeRigidBody(b.body); b.body = null; } }
  wakeAll() { this.a.boulders.items.forEach(b => b.body && b.body.wakeUp()); }
  // ---- actors: the player and every fighter share one kinematic capsule + the one CharacterController ----
  addActor(a, scale = 1) { a.footY = FOOT * scale; a.fscale = scale; if (!this.actors.includes(a)) this.actors.push(a); if (this.ready) this.makeActorBody(a); }
  makeActorBody(a) {
    if (a.body) return; const R = this.R, sc = a.fscale || 1;
    a.body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(a.pos.x, a.pos.y + FOOT * sc, a.pos.z));
    a.col = this.world.createCollider(R.ColliderDesc.capsule(HALF * sc, RAD * sc).setFriction(0), a.body);
  }
  removeActor(a) { const i = this.actors.indexOf(a); if (i >= 0) this.actors.splice(i, 1); if (a.body && this.world) { this.world.removeRigidBody(a.body); } a.body = null; a.col = null; }
  // a.vel is a full velocity (gravity included). Updates a.pos and ground contact. Without Rapier it falls back to the sculpted ground plus decks (no solid props).
  moveActor(a, dt) {
    const T = this.a.terrain;
    if (!this.ready || !a.body) {
      a.wasGround = a.onGround; const nx = a.pos.x + a.vel.x * dt, nz = a.pos.z + a.vel.z * dt; a.pos.x = nx; a.pos.z = nz; a.pos.y += a.vel.y * dt;
      const g = a.groundAt ? a.groundAt(a.pos.x, a.pos.z) : T.hAt(a.pos.x, a.pos.z);
      if (a.pos.y <= g + 0.01 || (a.onGround && g - a.pos.y < 0.75 && a.vel.y <= 0)) { a.pos.y = g; a.vel.y = 0; a.onGround = true; } else a.onGround = false;
      for (const c of a.circles || []) { const dx = a.pos.x - c.x, dz = a.pos.z - c.z, L = Math.hypot(dx, dz), m = c.r + 0.4; if (L < m && L > 1e-4) { a.pos.x = c.x + dx / L * m; a.pos.z = c.z + dz / L * m; } }
      return;
    }
    const want = { x: a.vel.x * dt, y: a.vel.y * dt, z: a.vel.z * dt };
    this.cc.computeColliderMovement(a.col, want);
    const m = this.cc.computedMovement(), grounded = this.cc.computedGrounded();
    a.pos.x += m.x; a.pos.y += m.y; a.pos.z += m.z; a.wasGround = a.onGround;
    if (grounded && a.vel.y <= 0) { a.vel.y = 0; a.onGround = true; } else if (!grounded) a.onGround = false;
    if (a.vel.y > 0 && m.y < want.y - 1e-3) a.vel.y = 0;                       // bumped a ceiling
    const g = T.hAt(a.pos.x, a.pos.z); if (a.pos.y < g - 0.6) { a.pos.y = g; a.vel.y = 0; }   // safety net while the heightfield is rebuilding
    a.body.setNextKinematicTranslation({ x: a.pos.x, y: a.pos.y + a.footY, z: a.pos.z });
  }
  teleport(a) { if (a && a.body) a.body.setTranslation({ x: a.pos.x, y: a.pos.y + a.footY, z: a.pos.z }, true); }
  // ---- step ----
  step(dt, level) {
    if (!this.ready) return;
    const items = this.a.boulders.items;
    for (const b of items) {
      if (!b.body || b.held || b.body.isSleeping()) continue;
      const t = b.body.translation(), v = b.body.linvel(), ext = b.r, sub = clamp((level - (t.y - ext)) / (2 * ext), 0, 1), sp = Math.hypot(v.x, v.y, v.z);
      if (sub > 0) {
        const k = 1 - Math.min(0.9, sub * WATER_DRAG * dt), m = b.body.mass();
        b.body.setLinvel({ x: v.x * k, y: v.y * k + (b.kind === 'boulder' || !b.kind ? BUOY : BUOY * 1.35) * sub * dt, z: v.z * k }, true);
        if (!b.wasWet && sp > 1.8 && this.splash) this.splash(t.x, t.z, clamp(b.r * 0.9 + sp * 0.06, 0.5, 2.5));
        void m;
      }
      b.wasWet = sub > 0;
    }
    this.world.timestep = dt; this.world.step();
    for (const b of items) {
      if (!b.body) continue; if (b.pp) { b.pp.copy(b.cp); b.pq.copy(b.cq); }
      let t = b.body.translation(); const q = b.body.rotation(), v = b.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
      { const g = this.a.terrain.hAt(t.x, t.z), ext = (b.kind === 'boulder' || !b.kind) ? b.r : b.r * 1.05;   // safety net: a prop that tunnelled below the ground is put back on it
        const out = Math.abs(t.x) > 126 || Math.abs(t.z) > 126 || t.y < -25;   // thrown off the edge of the world, or fell below it
        if (out || t.y + ext < g - 0.3) { const x = clamp(t.x, -120, 120), z = clamp(t.z, -120, 120), gg = out ? this.a.terrain.hAt(x, z) : g; b.body.setTranslation({ x, y: gg + ext + 0.05, z }, true); b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); t = b.body.translation(); if (b.cp) { b.cp.set(t.x, t.y, t.z); b.pp.copy(b.cp); } } }
      if (b.cp) { b.cp.set(t.x, t.y, t.z); b.cq.set(q.x, q.y, q.z, q.w); } else { b.p.set(t.x, t.y, t.z); b.q.set(q.x, q.y, q.z, q.w); }
      b.v.set(v.x, v.y, v.z); b.sp = sp;
      // a hard landing on dry ground kicks up grains
      if (this.onImpact) { const near = t.y - b.r - this.a.terrain.hAt(t.x, t.z) < 0.3; if (near && sp > 2.2 && (b.lastSp || 0) - sp > 1.4 && t.y > level + 0.1) this.onImpact(t.x, t.y - b.r, t.z, Math.min(14, (b.lastSp || 0) * 1.1), b); }
      b.lastSp = sp;
    }
  }
  // render: blend the last two fixed-step transforms so motion is smooth at any refresh rate
  interp(alpha) { if (!this.ready) return; for (const b of this.a.boulders.items) { if (!b.body || !b.cp) continue; b.p.lerpVectors(b.pp, b.cp, alpha); b.q.slerpQuaternions(b.pq, b.cq, alpha); } }
  // sample the physics surface straight down; used by the self-check
  castDown(x, z) {
    if (!this.ready) return null; const R = this.R, ray = new R.Ray({ x, y: 300, z }, { x: 0, y: -1, z: 0 });
    const pl = this.a.player, hit = this.world.castRay(ray, 700, true, undefined, undefined, undefined, pl && pl.body || undefined); return hit ? 300 - hit.timeOfImpact : null;
  }
}
