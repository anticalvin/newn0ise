// Drivable car on Rapier's ray-cast vehicle controller: dynamic chassis, four spring/damper wheels with friction, engine, brake, steering that tightens with speed.
// Visuals are interpolated between physics steps like every other body. Runs over fighters when fast; pushes props with real mass.
import * as THREE from 'three';
import { clamp } from './util.js';
import { TUNE } from './tune.js';

const WHEELS = [[0.86, -0.12, 1.32, 1], [-0.86, -0.12, 1.32, 1], [0.86, -0.12, -1.32, 0], [-0.86, -0.12, -1.32, 0]];   // x, y, z, steers
export function carMesh(color = '#c0392b') {
  const g = new THREE.Group(), paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 }), dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 }), glass = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.1, metalness: 0.8 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(1.8, 0.5, 4.0), paint, 0, 0.12, 0); add(new THREE.BoxGeometry(1.5, 0.5, 1.9), glass, 0, 0.62, -0.25); add(new THREE.BoxGeometry(1.56, 0.08, 1.96), paint, 0, 0.9, -0.25);
  add(new THREE.BoxGeometry(1.7, 0.1, 0.1), dark, 0, 0.0, 2.02); add(new THREE.BoxGeometry(1.7, 0.1, 0.1), dark, 0, 0.0, -2.02);
  for (const sx of [-0.55, 0.55]) { add(new THREE.BoxGeometry(0.28, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }), sx, 0.2, 2.02); add(new THREE.BoxGeometry(0.28, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), sx, 0.25, -2.02); }
  g.userData.paint = paint;
  g.userData.wheels = WHEELS.map(([x, y, z]) => { const w = new THREE.Group(), t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 20).rotateZ(Math.PI / 2), dark), r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xaab0b8, metalness: 0.8, roughness: 0.3 })); t.castShadow = true; w.add(t, r); w.position.set(x, y - 0.4, z); g.add(w); return w; });
  return g;
}

export class Car {
  constructor(app, x, y, z, yaw, color) {
    this.a = app; const R = app.phys.R, w = app.phys.world; this.mesh = carMesh(color); app.scene.add(this.mesh);
    this.body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y + 1.0, z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }).setCanSleep(false).setLinearDamping(0.08).setAngularDamping(1.4).setCcdEnabled(true));
    this.cols = [w.createCollider(R.ColliderDesc.cuboid(0.9, 0.3, 2.0).setTranslation(0, -0.3, 0).setMass(1150).setFriction(0.3).setRestitution(0.05), this.body), w.createCollider(R.ColliderDesc.cuboid(0.75, 0.28, 0.98).setTranslation(0, 0.5, -0.25).setMass(40).setFriction(0.3), this.body)];
    this.ctrl = w.createVehicleController(this.body);
    WHEELS.forEach(([wx, wy, wz], i) => { this.ctrl.addWheel({ x: wx, y: wy, z: wz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.5, 0.38);
      this.ctrl.setWheelSuspensionStiffness(i, TUNE.carStiff); this.ctrl.setWheelSuspensionCompression(i, TUNE.carDamp); this.ctrl.setWheelSuspensionRelaxation(i, TUNE.carRelax); this.ctrl.setWheelMaxSuspensionTravel(i, 0.45); this.ctrl.setWheelMaxSuspensionForce(i, 60000);
      this.ctrl.setWheelFrictionSlip(i, wz < 0 ? TUNE.carSlipR : TUNE.carSlipF); this.ctrl.setWheelSideFrictionStiffness(i, TUNE.carSide); });
    this.steer = 0; this.speed = 0; this.fwd = 0; this.pos = new THREE.Vector3(x, y + 1, z); this.vel = new THREE.Vector3(); this.pp = this.pos.clone(); this.pq = new THREE.Quaternion(); this.cq = new THREE.Quaternion(); this.cp = this.pos.clone();
    this.wp = WHEELS.map(() => ({ s: 0.3, r: 0, st: 0 })); this.cw = this.wp.map(o => ({ ...o })); this.cd = new Map(); this.input = { thr: 0, str: 0, brake: false }; this.mesh.userData.car = this; this.driven = false;
    this.hook = dt => this.pre(dt); this.hookP = dt => this.post(dt); app.phys.pre.push(this.hook); app.phys.post.push(this.hookP);
  }
  pre(dt) {
    const I = this.input, v = this.body.linvel(), q = this.body.rotation(), fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y); this.fwd = v.x * fx + v.z * fz; const sp = Math.abs(this.fwd);
    for (let i = 0; i < 4; i++) { this.ctrl.setWheelSuspensionStiffness(i, TUNE.carStiff); this.ctrl.setWheelSuspensionCompression(i, TUNE.carDamp); this.ctrl.setWheelSuspensionRelaxation(i, TUNE.carRelax); this.ctrl.setWheelFrictionSlip(i, WHEELS[i][2] < 0 ? TUNE.carSlipR : TUNE.carSlipF); this.ctrl.setWheelSideFrictionStiffness(i, TUNE.carSide); }
    const maxSt = TUNE.carSteer / (1 + sp * 0.07); this.steer += (I.str * maxSt - this.steer) * Math.min(1, dt * 9);
    let eng = 0, brk = 0; if (I.thr !== 0) { if (I.thr * this.fwd < -1.0) brk = TUNE.carBrake; else eng = I.thr * (I.thr > 0 ? TUNE.carEngine : TUNE.carReverse) * (1 - clamp(sp / (I.thr > 0 ? TUNE.carTop : TUNE.carTop * 0.37), 0, 1)); } else brk = 45;
    if (I.brake) brk = 1200;
    for (let i = 0; i < 4; i++) { this.ctrl.setWheelSteering(i, WHEELS[i][3] ? this.steer : 0); this.ctrl.setWheelEngineForce(i, eng); this.ctrl.setWheelBrake(i, i >= 2 && I.brake ? brk * 1.4 : brk); }
    if (this.driven === false) { for (let i = 0; i < 4; i++) { this.ctrl.setWheelEngineForce(i, 0); this.ctrl.setWheelBrake(i, 60); } }
    this.ctrl.updateVehicle(dt, this.a.phys.R.QueryFilterFlags.EXCLUDE_KINEMATIC);
  }
  post() {
    const t = this.body.translation(), q = this.body.rotation(), v = this.body.linvel();
    this.pp.copy(this.cp); this.pq.copy(this.cq); this.cp.set(t.x, t.y, t.z); this.cq.set(q.x, q.y, q.z, q.w); this.vel.set(v.x, v.y, v.z); this.speed = Math.hypot(v.x, v.z);
    this.wp.forEach((o, i) => { o.s = this.ctrl.wheelSuspensionLength(i) ?? 0.4; o.r = this.ctrl.wheelRotation(i) ?? 0; o.st = this.ctrl.wheelSteering(i) ?? 0; });
    // run over fighters
    if (this.speed > 5.5) for (const t2 of this.a.combat.actors) { if (!t2.alive || t2.hidden) continue; const dx = t2.pos.x - t.x, dz = t2.pos.z - t.z; if (Math.hypot(dx, dz) > 2.4 || t2.pos.y > t.y + 1.2 || t2.pos.y < t.y - 2) continue; const cd = this.cd.get(t2) || 0; if (this.a.combat.t < cd) continue; this.cd.set(t2, this.a.combat.t + 0.9);
      const d = Math.hypot(v.x, v.z) || 1; const res = t2.receiveHit(null, { dmg: clamp(this.speed * 2.4, 8, 60), kb: clamp(this.speed * 0.9, 3, 14), stun: 0.8, hs: 0.08, knock: true }, { x: v.x / d, z: v.z / d }, { unblockable: true }); if (res !== 'ignore') { this.a.fx.play('heavy', 1); this.a.fx.spark(t2.pos.x, t2.pos.y + 1, t2.pos.z, v.x / d, v.z / d, 18, [1, 0.6, 0.3], 8); this.a.cam.addTrauma(0.3); } }
  }
  render(alpha) {
    this.pos.lerpVectors(this.pp, this.cp, alpha); const q = this.mesh.quaternion.slerpQuaternions(this.pq, this.cq, alpha); this.mesh.position.copy(this.pos);
    this.mesh.userData.wheels.forEach((w, i) => { const o = this.wp[i], pz = WHEELS[i]; w.position.set(pz[0], pz[1] - o.s, pz[2]); w.rotation.set(0, o.st, 0); w.children[1].rotation.x = -o.r; void q; });
  }
  dispose() { const p = this.a.phys; p.pre = p.pre.filter(f => f !== this.hook); p.post = p.post.filter(f => f !== this.hookP); p.world.removeRigidBody(this.body); this.a.scene.remove(this.mesh); this.mesh.traverse(o => o.geometry && o.geometry.dispose()); }
}
