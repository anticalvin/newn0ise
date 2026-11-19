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
    this.static = []; this.player = null; this.splash = null; this.onImpact = null; this.stats = { bodies: 0 };
  }
  async init() {
    try {
      const R = this.R = await loadRapier(), a = this.a;
      this.world = new R.World({ x: 0, y: -9.81, z: 0 });
      this.buildHeightfield();
      this.cc = this.world.createCharacterController(0.02);
      this.cc.setUp({ x: 0, y: 1, z: 0 }); this.cc.enableAutostep(0.35, 0.2, true); this.cc.enableSnapToGround(0.35);
      this.cc.setMaxSlopeClimbAngle(58 * Math.PI / 180); this.cc.setMinSlopeSlideAngle(66 * Math.PI / 180);
      this.cc.setApplyImpulsesToDynamicBodies(true); this.cc.setCharacterMass(70);
      const p = a.player;
      this.pBody = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.pos.x, p.pos.y + FOOT, p.pos.z));
      this.pCol = this.world.createCollider(R.ColliderDesc.capsule(HALF, RAD).setFriction(0), this.pBody);
      this.setProps(this.propDefs || []);
      a.boulders.items.forEach(b => this.addBoulder(b));
      a.boulders.phys = this; p.phys = this; this.ready = true;
      return true;
    } catch (e) { this.failed = true; this.error = String(e && e.message || e); return false; }
  }
  // ---- terrain ----
  buildHeightfield() {
    const R = this.R, T = this.a.terrain, h = new Float32Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) h[z + x * W] = T.h[z * W + x];      // Rapier wants column-major: rows run along z, columns along x
    if (this.hf) this.world.removeCollider(this.hf, false);
    this.hf = this.world.createCollider(R.ColliderDesc.heightfield(N, N, h, { x: S, y: 1, z: S }).setFriction(0.9).setRestitution(0.1));
    this.hfRev = T.rev; this.hfAt = 0;
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
    const p = this.a.player, g = T.hAt(p.pos.x, p.pos.z); if (p.pos.y < g - 0.2) p.pos.y = g;
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
  // ---- boulders ----
  addBoulder(b) {
    const R = this.R, body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(b.p.x, b.p.y, b.p.z).setRotation({ x: b.q.x, y: b.q.y, z: b.q.z, w: b.q.w })
      .setLinearDamping(0.05).setAngularDamping(0.35).setCcdEnabled(true));
    const col = this.world.createCollider(R.ColliderDesc.ball(b.r * 0.92).setDensity(2.4).setFriction(0.9).setRestitution(0.16), body);
    b.body = body; b.col = col; b.wasWet = false; b.hit = 0;
  }
  removeBoulder(b) { if (b.body) { this.world.removeRigidBody(b.body); b.body = null; } }
  wakeAll() { this.a.boulders.items.forEach(b => b.body && b.body.wakeUp()); }
  // ---- character ----
  movePlayer(p, dt, mv, run, jump, level) {
    const T = this.a.terrain, g = T.hAt(p.pos.x, p.pos.z), depth = clamp(level - p.pos.y, 0, 3);
    p.depth = depth;
    const top = (run ? 5.4 : 2.7) * (1 - clamp((depth - 0.25) / 1.4, 0, 0.62));
    const mag = Math.min(1, Math.hypot(mv.x, mv.z)), L = Math.hypot(mv.x, mv.z) || 1;
    const acc = 1 - Math.exp(-(p.onGround ? 12 : 3) * dt);
    p.vel.x += (mv.x / L * top * mag - p.vel.x) * acc; p.vel.z += (mv.z / L * top * mag - p.vel.z) * acc;
    // refuse deep water when walking on the sea floor (a pier or a boulder keeps you above it)
    const nx = p.pos.x + p.vel.x * dt, nz = p.pos.z + p.vel.z * dt, gN = T.hAt(nx, nz);
    if (p.pos.y < level + 0.4 && level - gN > 1.9 && level - gN > level - g) { p.vel.x *= 0.05; p.vel.z *= 0.05; }
    if (Math.abs(nx) > 124 || Math.abs(nz) > 124) { p.vel.x = p.vel.z = 0; }
    if (jump && p.onGround && depth < 1.0) { p.vel.y = 5.0; p.onGround = false; }
    p.vel.y = p.onGround && p.vel.y <= 0 ? -1.5 : p.vel.y - 9.81 * dt;
    const want = { x: p.vel.x * dt, y: p.vel.y * dt, z: p.vel.z * dt };
    this.cc.computeColliderMovement(this.pCol, want);
    const m = this.cc.computedMovement(), grounded = this.cc.computedGrounded();
    const before = p.onGround;
    p.pos.x += m.x; p.pos.y += m.y; p.pos.z += m.z;
    if (grounded && p.vel.y <= 0) { p.vel.y = 0; p.onGround = true; } else if (!grounded) p.onGround = false;
    if (p.vel.y > 0 && m.y < want.y - 1e-3) p.vel.y = 0;       // bumped a ceiling
    if (p.pos.y < g - 0.6) { p.pos.y = g; p.vel.y = 0; }        // safety net if the collider is mid-rebuild
    this.pBody.setNextKinematicTranslation({ x: p.pos.x, y: p.pos.y + FOOT, z: p.pos.z });
    p.speed = Math.hypot(p.vel.x, p.vel.z);
    if (p.speed > 0.4) { const ty = Math.atan2(p.vel.x, p.vel.z); let d = ty - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += d * (1 - Math.exp(-12 * dt)); }
    if (p.onGround && p.speed > 0.5) { p.stepT += dt * p.speed; if (p.stepT > 0.95) { p.stepT = 0; p.stepSide *= -1; p.onStep && p.onStep(p.pos.x + Math.cos(p.yaw) * 0.12 * p.stepSide, p.pos.z - Math.sin(p.yaw) * 0.12 * p.stepSide, depth); } }
    if (!before && p.onGround && this.onImpact) this.onImpact(p.pos.x, p.pos.y, p.pos.z, 3);
  }
  teleport(p) { if (!this.ready) return; this.pBody.setTranslation({ x: p.pos.x, y: p.pos.y + FOOT, z: p.pos.z }, true); }
  // ---- step ----
  step(dt, level) {
    if (!this.ready) return;
    const items = this.a.boulders.items;
    for (const b of items) {
      if (!b.body || b.body.isSleeping()) continue;
      const t = b.body.translation(), v = b.body.linvel(), sub = clamp((level - (t.y - b.r)) / (2 * b.r), 0, 1), sp = Math.hypot(v.x, v.y, v.z);
      if (sub > 0) {
        const k = 1 - Math.min(0.9, sub * WATER_DRAG * dt), m = b.body.mass();
        b.body.setLinvel({ x: v.x * k, y: v.y * k + BUOY * sub * dt, z: v.z * k }, true);
        if (!b.wasWet && sp > 1.8 && this.splash) this.splash(t.x, t.z, clamp(b.r * 0.9 + sp * 0.06, 0.5, 2.5));
        void m;
      }
      b.wasWet = sub > 0;
    }
    this.world.timestep = dt; this.world.step();
    for (const b of items) {
      if (!b.body) continue;
      const t = b.body.translation(), q = b.body.rotation(), v = b.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
      b.p.set(t.x, t.y, t.z); b.q.set(q.x, q.y, q.z, q.w);
      // a hard landing on dry ground kicks up grains
      if (this.onImpact) { const near = t.y - b.r - this.a.terrain.hAt(t.x, t.z) < 0.25; if (near && sp > 2.5 && (b.lastSp || 0) - sp > 1.5 && t.y > level + 0.1) this.onImpact(t.x, t.y - b.r, t.z, Math.min(14, sp * 1.4)); }
      b.lastSp = sp;
    }
  }
  // sample the physics surface straight down; used by the self-check
  castDown(x, z) {
    if (!this.ready) return null; const R = this.R, ray = new R.Ray({ x, y: 300, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, 700, true, undefined, undefined, undefined, this.pBody); return hit ? 300 - hit.timeOfImpact : null;
  }
}
