// Simulation: fixed-step boulders (sphere vs heightfield) and the walkable player.
// PROTOTYPE physics: in the real app this is replaced by the existing Rapier world + a heightfield collider.
import * as THREE from 'three';
import { makeBoulderMesh } from './nature.js';
import { clamp, lerp } from './util.js';

export class Boulders {
  constructor(scene, shared, terrain, water) { this.scene = scene; this.shared = shared; this.T = terrain; this.W = water; this.items = []; this.nextSeed = 11; this.splash = null; }
  add(x, y, z, r, seed = this.nextSeed++) {
    const mesh = makeBoulderMesh(this.shared, r, seed); mesh.position.set(x, y, z); this.scene.add(mesh);
    const b = { mesh, r, seed, p: mesh.position, v: new THREE.Vector3(), q: mesh.quaternion, sleep: 0, wasWet: false, id: 'b' + seed + '_' + this.items.length };
    this.items.push(b); return b;
  }
  remove(b) { const i = this.items.indexOf(b); if (i >= 0) { this.items.splice(i, 1); this.scene.remove(b.mesh); b.mesh.geometry.dispose(); } }
  wake() { this.items.forEach(b => { b.sleep = 0; }); }
  step(dt, player, level, t) {
    const n = new THREE.Vector3(), tmp = new THREE.Vector3(), ax = new THREE.Vector3(), dq = new THREE.Quaternion();
    for (const b of this.items) {
      if (b.sleep > 0.8) continue;
      b.v.y -= 9.81 * dt; b.p.addScaledVector(b.v, dt);
      const g = this.T.hAt(b.p.x, b.p.z); this.T.nAt(b.p.x, b.p.z, n);
      const dist = (b.p.y - g) * n.y; let ground = false;
      if (dist < b.r * 0.92) {
        b.p.addScaledVector(n, b.r * 0.92 - dist); const vn = b.v.dot(n);
        if (vn < 0) { b.v.addScaledVector(n, -(1 + 0.16) * vn); }
        tmp.copy(b.v).addScaledVector(n, -b.v.dot(n)); b.v.addScaledVector(tmp, -Math.min(1, 0.55 * dt));
        ground = true;
        if (b.v.length() > 0.02) { ax.crossVectors(n, b.v); const w = ax.length() / b.r; if (w > 1e-4) { dq.setFromAxisAngle(ax.normalize(), w * dt); b.q.premultiply(dq); } }
      }
      const sub = clamp((level - (b.p.y - b.r)) / (2 * b.r), 0, 1);
      if (sub > 0) { b.v.multiplyScalar(1 - Math.min(0.9, sub * 2.4 * dt)); b.v.y += 6.0 * sub * dt;
        if (!b.wasWet && b.v.length() > 1.8 && this.splash) this.splash(b.p.x, b.p.z, clamp(b.r * 0.9 + b.v.length() * 0.06, 0.5, 2.5)); }
      b.wasWet = sub > 0;
      b.sleep = (ground && b.v.length() < 0.12) ? b.sleep + dt : 0; if (b.sleep > 0.8) b.v.set(0, 0, 0);
    }
    for (let i = 0; i < this.items.length; i++) for (let j = i + 1; j < this.items.length; j++) {
      const a = this.items[i], c = this.items[j], d = tmp.subVectors(c.p, a.p), L = d.length(), min = (a.r + c.r) * 0.9;
      if (L < min && L > 1e-4) { d.multiplyScalar(1 / L); const pen = min - L, ma = a.r ** 3, mc = c.r ** 3, tot = ma + mc;
        a.p.addScaledVector(d, -pen * mc / tot); c.p.addScaledVector(d, pen * ma / tot);
        const rel = c.v.clone().sub(a.v).dot(d); if (rel < 0) { const jv = -(1.2) * rel / (1 / ma + 1 / mc); a.v.addScaledVector(d, -jv / ma); c.v.addScaledVector(d, jv / mc); a.sleep = c.sleep = 0; } }
    }
    if (player) for (const b of this.items) {
      const dx = b.p.x - player.pos.x, dz = b.p.z - player.pos.z, L = Math.hypot(dx, dz), min = b.r * 0.9 + 0.42;
      if (L < min && Math.abs(b.p.y - player.pos.y - 0.9) < b.r + 0.9 && L > 1e-4) {
        const nx = dx / L, nz = dz / L, sp = Math.hypot(player.vel.x, player.vel.z) * Math.max(0, (player.vel.x * nx + player.vel.z * nz) / (Math.hypot(player.vel.x, player.vel.z) + 1e-4));
        if (sp > 0.3) { b.v.x += nx * sp * 0.9 / b.r; b.v.z += nz * sp * 0.9 / b.r; b.sleep = 0; }
        const push = (min - L) * (b.r > 0.9 ? 1 : 0.4); player.pos.x -= nx * push; player.pos.z -= nz * push;
      }
    }
  }
}

export class Player {
  constructor(T) { this.T = T; this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = Math.PI; this.onGround = true; this.depth = 0; this.speed = 0; this.circles = []; this.decks = []; this.stepT = 0; this.stepSide = 1; this.onStep = null; }
  groundAt(x, z) { let g = this.T.hAt(x, z); for (const d of this.decks) if (Math.abs(x - d.x) < d.hx && Math.abs(z - d.z) < d.hz && this.pos.y > d.y - 0.9) g = Math.max(g, d.y); return g; }
  update(dt, mv, run, jump, level) {
    const g = this.groundAt(this.pos.x, this.pos.z), depth = Math.max(0, level - g); this.depth = depth;
    let top = (run ? 5.4 : 2.7) * (1 - clamp((depth - 0.25) / 1.4, 0, 0.62));
    const want = new THREE.Vector3(mv.x, 0, mv.z); const mag = Math.min(1, want.length()); if (mag > 1) want.normalize();
    want.multiplyScalar(top * mag);
    const acc = 1 - Math.exp(-(this.onGround ? 12 : 3) * dt);
    this.vel.x = lerp(this.vel.x, want.x, acc); this.vel.z = lerp(this.vel.z, want.z, acc);
    // refuse steep uphill + deep water
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt, n = this.T.nAt(nx, nz);
    const gN = this.groundAt(nx, nz);
    if (n.y < 0.62 && gN > g + 0.02) { this.vel.x *= 0.1; this.vel.z *= 0.1; }
    else if (level - gN > 1.9 && level - gN > depth) { this.vel.x *= 0.05; this.vel.z *= 0.05; }
    else if (Math.abs(nx) > 124 || Math.abs(nz) > 124) { this.vel.x = this.vel.z = 0; }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    for (const c of this.circles) { const dx = this.pos.x - c.x, dz = this.pos.z - c.z, L = Math.hypot(dx, dz), m = c.r + 0.4; if (L < m && L > 1e-4) { this.pos.x = c.x + dx / L * m; this.pos.z = c.z + dz / L * m; } }
    const g2 = this.groundAt(this.pos.x, this.pos.z);
    if (jump && this.onGround && depth < 1.0) { this.vel.y = 5.0; this.onGround = false; }
    this.vel.y -= 9.81 * dt; this.pos.y += this.vel.y * dt;
    if (this.pos.y <= g2 + 0.01 || (this.onGround && g2 - this.pos.y < 0.75 && this.vel.y <= 0)) {
      const target = g2; this.pos.y = this.pos.y < target ? lerp(this.pos.y, target, 1 - Math.exp(-22 * dt)) : target; if (Math.abs(this.pos.y - target) < 0.02) this.pos.y = target;
      this.vel.y = 0; this.onGround = true;
    } else this.onGround = false;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.4) { const ty = Math.atan2(this.vel.x, this.vel.z); let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-12 * dt)); }
    if (this.onGround && this.speed > 0.5) { this.stepT += dt * this.speed; if (this.stepT > 0.95) { this.stepT = 0; this.stepSide *= -1; this.onStep && this.onStep(this.pos.x + Math.cos(this.yaw) * 0.12 * this.stepSide, this.pos.z - Math.sin(this.yaw) * 0.12 * this.stepSide, depth); } }
  }
}
