// Player on foot and one drivable car. Both are kinematic controllers on the streamed terrain: they sample the tile heightfields, collide with building footprints and
// store colliders, and carry on across tile edges because they live in region metres, not in a tile. (A Rapier raycast vehicle was not benchmarked; see docs/WORLD.md.)
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export class Walker {
  constructor() { this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.yaw = 0; this.speed = 0; this.onGround = true; this.vx = 0; this.vz = 0; }
  update(dt, mx, mz, run, jump, w) {
    const want = Math.hypot(mx, mz), top = run ? 5.2 : 1.9;
    const tx = want ? mx / want * top : 0, tz = want ? mz / want * top : 0, k = 1 - Math.exp(-10 * dt);
    this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k; this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.2) this.yaw = Math.atan2(this.vx, this.vz);
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const r = w.resolve(nx, nz, 0.38, null); nx = r.x; nz = r.z;
    const g0 = w.groundAt(this.x, this.z, this.y), g1 = w.groundAt(nx, nz, this.y), run1 = Math.hypot(nx - this.x, nz - this.z);
    if (g1 < -1.1 || (this.onGround && run1 > 1e-4 && (g1 - g0) / run1 > 1.1 && g1 - g0 > 0.5)) { this.vx = this.vz = 0; this.speed = 0; }   // deep sea or a cliff: stop
    else { this.x = nx; this.z = nz; }
    const ground = w.groundAt(this.x, this.z, this.y);
    if (jump && this.onGround) { this.vy = 5.2; this.onGround = false; }
    this.vy -= 18 * dt; this.y += this.vy * dt;
    if (this.y <= ground) { this.y = ground; this.vy = 0; this.onGround = true; } else if (this.y > ground + 0.05) this.onGround = false;
    if (this.onGround && ground - this.y < 0.6) this.y = ground;
  }
}

export class Car {
  constructor() {
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.speed = 0; this.steer = 0; this.pitch = 0; this.roll = 0; this.wheelSpin = 0; this.hue = 0.58; this.onRoad = true;
    const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.35 });
    this.bodyMat = M(0x2d5fa8);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.62, 4.2), this.bodyMat); body.position.y = 0.62; body.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.56, 2.1), new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.12, metalness: 0.7 })); cab.position.set(0, 1.2, -0.25); cab.castShadow = true;
    g.add(body, cab);
    this.wheels = []; const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14); wg.rotateZ(Math.PI / 2); const wm = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) { const m = new THREE.Mesh(wg, wm); m.position.set(x, 0.34, z); g.add(m); this.wheels.push(m); }
    const lm = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xfff1c9, emissiveIntensity: 0.9 }), tm = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xaa1111, emissiveIntensity: 0.7 });
    for (const sx of [-0.65, 0.65]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.06), lm); h.position.set(sx, 0.7, 2.12); const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.06), tm); t.position.set(sx, 0.7, -2.12); g.add(h, t); }
    this.root = new THREE.Group(); this.root.add(g); this.model = g; this.root.visible = false;
  }
  setHue(h) { this.hue = h; this.bodyMat.color.setHSL(h, 0.55, 0.38); }
  update(dt, throttle, steerIn, brake, w) {
    const road = w.roadAt(this.x, this.z), onRoad = !!road && road.d < road.edge.cls.w / 2 + 2.5; this.onRoad = onRoad;
    const top = onRoad ? Math.min(40, Math.max(14, road.edge.cls.speed * 1.5)) : 9;
    let a;
    if (throttle > 0) a = 7.5 * throttle * (1 - Math.max(0, this.speed) / top);
    else if (throttle < 0) a = (this.speed > 0.5 ? -13 : -4.5) * -throttle;
    else a = -Math.sign(this.speed) * Math.min(Math.abs(this.speed) / dt, 2.6);
    this.speed += a * dt;
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 20 * dt);
    if (!onRoad) this.speed -= this.speed * 0.6 * dt;
    this.speed = clamp(this.speed, -7, top);
    const maxSteer = 0.55 / (1 + Math.abs(this.speed) * 0.09), k = 1 - Math.exp(-7 * dt); this.steer += (steerIn * maxSteer - this.steer) * k;
    this.yaw += this.speed / 2.7 * Math.tan(this.steer) * dt;
    const hx = Math.sin(this.yaw), hz = Math.cos(this.yaw);
    let nx = this.x + hx * this.speed * dt, nz = this.z + hz * this.speed * dt, hit = false;
    for (const off of [1.5, -1.5]) { const r = w.resolve(nx + hx * off, nz + hz * off, 1.0, null); if (r.moved) { hit = true; nx += r.x - (nx + hx * off); nz += r.z - (nz + hz * off); } }
    if (w.groundAt(nx, nz, this.y) < -0.9) { hit = true; nx = this.x; nz = this.z; }
    if (hit) { this.speed *= -0.25; w.onImpact?.(); }
    this.x = nx; this.z = nz;
    // suspension: four wheel samples give ride height, pitch and roll, smoothed so kerbs and hills feel like springs
    const fx = hx * 1.35, fz = hz * 1.35, rx = hz * 0.95, rz = -hx * 0.95;
    const hf = (w.groundAt(this.x + fx, this.z + fz, this.y) + 0), hb = w.groundAt(this.x - fx, this.z - fz, this.y), hl = w.groundAt(this.x - rx, this.z - rz, this.y), hr = w.groundAt(this.x + rx, this.z + rz, this.y), hc = w.groundAt(this.x, this.z, this.y);
    const ty = (hf + hb + hl + hr + hc) / 5, sk = 1 - Math.exp(-14 * dt);
    this.y += (ty - this.y) * sk; this.pitch += (Math.atan2(hb - hf, 2.7) - this.pitch) * sk; this.roll += (Math.atan2(hr - hl, 1.9) - this.roll) * sk;
    this.wheelSpin += this.speed * dt / 0.34;
  }
  apply(ox, oz) {
    this.root.position.set(this.x - ox, this.y, this.z - oz); this.root.rotation.set(0, this.yaw, 0);
    this.model.rotation.set(this.pitch, 0, -this.roll, 'ZXY');
    this.wheels.forEach((m, i) => { m.rotation.x = this.wheelSpin; if (i < 2) m.rotation.y = this.steer; });
  }
}
