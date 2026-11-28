// Camera rig: critically damped follow with look-ahead, smoothed look input, soft lock-on framing, terrain-aware boom, speed FOV, and trauma shake.
import * as THREE from 'three';
import { TUNE } from './tune.js';
import { clamp } from './util.js';

const TAU = Math.PI * 2, wrap = a => a - TAU * Math.round(a / TAU), sstep = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
function damp(cur, vel, tgt, st, dt) { const om = 2 / st, x = om * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), ch = cur - tgt, tp = (vel.v + om * ch) * dt; vel.v = (vel.v - om * tp) * ex; return tgt + (ch + tp) * ex; }

export class CamRig {
  // The rig works ON the shared app.cam object ({yaw, pitch, dist, target}) that the editor, shooter, geo world and tests also read and write.
  // yaw/pitch/dist hold the smoothed values; tYaw/tPitch/tDist are the targets. If anything else writes yaw/pitch/dist directly, the rig adopts the write as both.
  constructor(app) {
    this.a = app; this.c = app.cam; this.tYaw = this.c.yaw; this.tPitch = this.c.pitch; this.tDist = this.c.dist; this.f = new THREE.Vector3(); this.f.copy(this.c.target); this.vx = { v: 0 }; this.vy = { v: 0 }; this.vz = { v: 0 };
    this.trauma = 0; this.t = 0; this.fov = TUNE.fov; this.eff = this.c.dist; this.lookIdle = 9; this.ahead = new THREE.Vector3(); this.w = { yaw: this.c.yaw, pitch: this.c.pitch, dist: this.c.dist };
  }
  get yaw() { return this.c.yaw; } set yaw(v) { this.c.yaw = v; } get pitch() { return this.c.pitch; } set pitch(v) { this.c.pitch = v; } get dist() { return this.c.dist; } set dist(v) { this.c.dist = v; } get target() { return this.c.target; }
  adopt() { const c = this.c, w = this.w; if (c.yaw !== w.yaw) { this.tYaw = c.yaw; } if (c.pitch !== w.pitch) { this.tPitch = c.pitch; } if (c.dist !== w.dist) { this.tDist = c.dist; this.eff = Math.min(this.eff, c.dist); } }
  commit() { const c = this.c; this.w.yaw = c.yaw; this.w.pitch = c.pitch; this.w.dist = c.dist; }
  orbit(dx, dy) { this.tYaw -= dx * 0.005; this.tPitch = clamp(this.tPitch + dy * 0.005, 0.03, 1.45); this.lookIdle = 0; }
  look(dyaw, dpitch) { this.tYaw -= dyaw; this.tPitch = clamp(this.tPitch + dpitch, 0.03, 1.45); this.lookIdle = 0; }
  zoom(f, lo, hi) { this.tDist = clamp(this.tDist * f, lo, hi); }
  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v); }
  setView(yaw, pitch, dist) { this.yaw = this.tYaw = yaw; this.tPitch = this.pitch = pitch; this.tDist = this.dist = this.eff = dist; this.commit(); }
  snap() { this.f.copy(this.target); this.vx.v = this.vy.v = this.vz.v = 0; }
  update(dt, c) {
    const A = this.a, cam = A.camera; this.t += dt; this.lookIdle += dt; this.adopt();
    // targets
    if (c.explore) {
      if (c.lock) { const dx = c.lock.x - c.player.x, dz = c.lock.z - c.player.z, d = Math.hypot(dx, dz) || 1; const want = Math.atan2(-dx, -dz); this.tYaw += wrap(want - this.tYaw) * (1 - Math.exp(-3.5 * dt)); this.tPitch += (0.3 + Math.min(0.15, d * 0.01) - this.tPitch) * (1 - Math.exp(-2 * dt)); this.tDist += (clamp(5.6 + d * 0.28, 5.2, 9) - this.tDist) * (1 - Math.exp(-2 * dt)); }
      else if (this.lookIdle > 1.1 && c.speed > 2.2 && !c.combat) { const want = Math.atan2(-c.vel.x, -c.vel.z), diff = wrap(want - this.tYaw), w = sstep((Math.cos(diff) - 0.15) / 0.5); this.tYaw += diff * w * Math.min(1, dt * 0.9); }
    }
    this.yaw += wrap(this.tYaw - this.yaw) * (1 - Math.exp(-TUNE.camRot * dt)); this.pitch += (this.tPitch - this.pitch) * (1 - Math.exp(-TUNE.camRot * dt)); this.dist += (this.tDist - this.dist) * (1 - Math.exp(-TUNE.camZoom * dt));
    // focus: critically damped, vertical slower so stairs and hops don't jolt the view
    const la = c.explore ? 0.14 : 0; this.ahead.set(clamp(c.vel.x * la, -1.2, 1.2), 0, clamp(c.vel.z * la, -1.2, 1.2));
    const fx = this.target.x + this.ahead.x, fy = this.target.y, fz = this.target.z + this.ahead.z, st = c.explore ? TUNE.camFollow : 0.06;
    this.f.x = damp(this.f.x, this.vx, fx, st, dt); this.f.z = damp(this.f.z, this.vz, fz, st, dt); this.f.y = damp(this.f.y, this.vy, fy, c.explore ? TUNE.camFollowY : 0.08, dt);
    // boom with terrain check (shrinks instantly, grows back slowly)
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), dx = Math.sin(this.yaw) * cp, dz = Math.cos(this.yaw) * cp; let allow = this.dist;
    for (let i = 1; i <= 8; i++) { const t = i / 8 * this.dist, x = this.f.x + dx * t, z = this.f.z + dz * t, y = this.f.y + sp * t, floor = Math.max(A.terrain.hAt(x, z), c.explore ? A.water.level : -99) + 0.4; if (y < floor) { allow = Math.max(1.2, t - this.dist / 8); break; } }
    if (A.level && A.phys && A.phys.ready) { const t = A.phys.castBoom(this.f, dx, sp, dz, this.dist); if (t !== null) allow = Math.min(allow, Math.max(1.2, t - 0.4)); }   // level geometry (fixed bodies only) pushes the boom in
    this.eff = allow < this.eff ? allow : this.eff + (allow - this.eff) * (1 - Math.exp(-3 * dt));
    cam.position.set(this.f.x + dx * this.eff, this.f.y + sp * this.eff, this.f.z + dz * this.eff);
    const floor = Math.max(A.terrain.hAt(cam.position.x, cam.position.z), c.explore ? A.water.level : -99) + 0.45; if (cam.position.y < floor) cam.position.y = floor;
    // trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.7); const s = this.trauma * this.trauma * TUNE.shake, t = this.t;
    if (s > 0.0005) cam.position.add(new THREE.Vector3(Math.sin(t * 53) * s * 0.18, Math.sin(t * 61 + 1) * s * 0.14, Math.sin(t * 47 + 2) * s * 0.18));
    cam.up.set(0, 1, 0); cam.lookAt(this.f); if (s > 0.0005) cam.rotateZ(Math.sin(t * 39) * s * 0.04);
    // FOV: wider when fast / dodging, tighter on heavy impacts
    const tf = TUNE.fov + 6 * sstep((c.speed - 3) / 3) + (c.dodge ? 5 : 0) - this.trauma * 2.5; this.fov += (tf - this.fov) * (1 - Math.exp(-6 * dt)); if (!(A.shooter && A.shooter.active) && Math.abs(cam.fov - this.fov) > 0.02) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.commit();
  }
}
