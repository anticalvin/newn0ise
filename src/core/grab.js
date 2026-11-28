// Grab: pick props up with the cursor (or the gamepad reticle). A held prop is velocity-driven toward a point on the cursor ray, so it LIFTS off the
// floor, swings, collides with everything and can be thrown by letting go mid-swing. Heavy props can only be lifted a little: they drag and slide.
import * as THREE from 'three';
import { clamp } from './util.js';

const sstep = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export class Grab {
  constructor(app) {
    this.a = app; this.held = null; this.hover = null; this.dist = 8; this.ray = new THREE.Raycaster(); this.target = new THREE.Vector3(); this.ndc = new THREE.Vector2(0, 0); this.reach = 15; this.tmp = new THREE.Vector3(); this.liftBias = 0;
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.65, depthTest: false, fog: false })); this.line.renderOrder = 40; this.line.frustumCulled = false; this.line.visible = false; app.scene.add(this.line);
    const rg = new THREE.RingGeometry(0.82, 1, 40); rg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false, fog: false })); this.shadow.renderOrder = 39; this.shadow.visible = false; app.scene.add(this.shadow);
  }
  glow(p, v) { const m = p && p.mesh.material; if (m && m.emissive) { m.emissive.setRGB(v * 0.9, v * 0.75, v * 0.45); } }
  pick(ndc, limit = true) {
    const A = this.a, items = A.boulders.items.filter(b => b.body); this.ray.setFromCamera(ndc, A.camera); const hits = this.ray.intersectObjects(items.map(b => b.mesh), true);
    for (const h of hits) { let o = h.object, p = null; while (o && !(p = o.userData.prop)) o = o.parent; if (!p || !p.body) continue; if (limit && A.mode === 'explore') { const pl = A.player; if (Math.hypot(p.p.x - pl.pos.x, p.p.z - pl.pos.z) > this.reach + p.r) continue; } return { p, point: h.point, dist: h.distance }; }
    return null;
  }
  setHover(ndc, enabled) {
    if (this.held) return; if (!this.a.input.ptr.in && !this.a.padMode) enabled = false; const h = enabled ? this.pick(ndc) : null, p = h && h.p; if (p !== this.hover) { this.glow(this.hover, 0); this.hover = p; this.glow(p, 0.16); this.a.canvas.style.cursor = p ? 'grab' : ''; }
  }
  start(ndc, force) {
    const h = force || this.pick(ndc); if (!h) return false; const p = h.p, A = this.a; if (this.held) this.release();
    this.held = p; p.held = true; p.body.setGravityScale(0, true); p.body.wakeUp(); p.body.setLinearDamping(2.5); p.body.setAngularDamping(3);
    this.dist = clamp(A.camera.position.distanceTo(p.p), 3, 60); this.ndc.copy(ndc); this.liftBias = 0; this.glow(p, 0.3); this.line.visible = true; this.shadow.visible = true; A.canvas.style.cursor = 'grabbing'; A.fx.play('grab', 0.8); return true;
  }
  adjust(dy) { if (!this.held) return; this.liftBias = clamp(this.liftBias - dy * 0.0025, -1, 4); }
  release() {
    const p = this.held; if (!p) return; this.held = null; p.held = false;
    if (p.body) { p.body.setGravityScale(1, true); p.body.setLinearDamping(p.kind === 'boulder' ? 0.05 : 0.12); p.body.setAngularDamping(p.kind === 'boulder' ? 0.35 : 0.5); const v = p.body.linvel(), s = Math.hypot(v.x, v.y, v.z); if (s > 26) p.body.setLinvel({ x: v.x * 26 / s, y: v.y * 26 / s, z: v.z * 26 / s }, true); p.body.wakeUp(); }
    this.glow(p, 0); this.line.visible = false; this.shadow.visible = false; this.a.canvas.style.cursor = ''; this.hover = null;
  }
  // fixed step: steer the held body
  control(dt, ndc) {
    const p = this.held, A = this.a; if (!p) return; if (!p.body) { this.release(); return; }
    if (ndc) this.ndc.copy(ndc); this.ray.setFromCamera(this.ndc, A.camera); const o = this.ray.ray.origin, d = this.ray.ray.direction, T = A.terrain;
    this.target.copy(o).addScaledVector(d, this.dist); const gy = T.hAt(this.target.x, this.target.z), ext = p.ext || (p.kind === 'boulder' ? p.r * 0.95 : p.r * 1.05);
    const heavy = sstep((p.mass - 25) / 200), maxLift = 4.2 * (1 - heavy) + 0.25 * heavy + Math.max(0, this.liftBias) * (1 - heavy * 0.8), minY = gy + ext + 0.05;
    this.target.y = clamp(this.target.y + this.liftBias * (1 - heavy), minY, gy + ext + maxLift);
    if (A.mode === 'explore') { const pl = A.player, dx = this.target.x - pl.pos.x, dz = this.target.z - pl.pos.z, L = Math.hypot(dx, dz), R = this.reach + 3; if (L > R) { this.target.x = pl.pos.x + dx / L * R; this.target.z = pl.pos.z + dz / L * R; } }
    const t = p.body.translation(), speed = clamp(26 / (1 + p.mass / 70), 5, 26), k = 11 - heavy * 6;
    let vx = (this.target.x - t.x) * k, vy = (this.target.y - t.y) * k, vz = (this.target.z - t.z) * k; const s = Math.hypot(vx, vy, vz); if (s > speed) { const f = speed / s; vx *= f; vy *= f; vz *= f; }
    p.body.setLinvel({ x: vx, y: vy, z: vz }, true); const w = p.body.angvel(), dk = Math.exp(-3 * dt); p.body.setAngvel({ x: w.x * dk, y: w.y * dk, z: w.z * dk }, true); p.body.wakeUp();
  }
  // render: hand line + ground ring under the object
  render(t) {
    const p = this.held; if (!p) return; const A = this.a, hand = A.player.character.limb('handR', this.tmp), a = this.line.geometry.attributes.position;
    a.setXYZ(0, hand.x, hand.y, hand.z); a.setXYZ(1, p.p.x, p.p.y, p.p.z); a.needsUpdate = true;
    const g = A.terrain.hAt(p.p.x, p.p.z), h = Math.max(0, p.p.y - p.r - g); this.shadow.position.set(p.p.x, Math.max(g, A.water.level) + 0.06, p.p.z); const s = p.r * (1.1 + h * 0.08); this.shadow.scale.set(s, 1, s); this.shadow.material.opacity = 0.55 * Math.exp(-h * 0.3) + 0.08; void t;
  }
}
