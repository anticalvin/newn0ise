// Procedural humanoid with a two-bone walk cycle. Placeholder for the real rigged characters (skinned glTF + animation graph).
import * as THREE from 'three';
import { patchStandard } from './glsl.js';

export class Character {
  constructor(shared) {
    const mk = (hex, r = 0.7) => patchStandard(new THREE.MeshStandardMaterial({ color: hex, roughness: r }), shared, {}, 'char');
    const jacket = mk(0xd9d2c6, 0.8), pants = mk(0x232427, 0.85), skin = mk(0x9a6a50, 0.7), hair = mk(0x14110f, 0.9), shoe = mk(0x0d0d0f, 0.6);
    const cap = (r, l, m) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), m); x.castShadow = true; return x; };
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.hips = new THREE.Group(); this.hips.position.y = 0.96; this.body.add(this.hips);
    const torso = cap(0.16, 0.34, jacket); torso.scale.set(1.15, 1, 0.72); torso.position.y = 0.30; this.hips.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), skin); head.position.y = 0.80; head.castShadow = true; this.hips.add(head);
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.122, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hr.position.y = 0.81; hr.rotation.x = -0.25; this.hips.add(hr);
    const neck = cap(0.045, 0.06, skin); neck.position.y = 0.68; this.hips.add(neck);
    const limb = (parent, x, y, m, r, l, r2, l2, pivotY) => {
      const up = new THREE.Group(); up.position.set(x, y, 0); parent.add(up);
      const a = cap(r, l, m); a.position.y = -(l / 2 + r); up.add(a);
      const lo = new THREE.Group(); lo.position.y = -(l + 2 * r); up.add(lo);
      const b = cap(r2, l2, m); b.position.y = -(l2 / 2 + r2); lo.add(b);
      return { up, lo };
    };
    this.legL = limb(this.hips, -0.09, 0.0, pants, 0.085, 0.30, 0.07, 0.30);
    this.legR = limb(this.hips, 0.09, 0.0, pants, 0.085, 0.30, 0.07, 0.30);
    for (const L of [this.legL, this.legR]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.26), shoe); f.position.set(0, -(0.30 + 0.14) - 0.02, 0.06); f.castShadow = true; L.lo.add(f); }
    this.armL = limb(this.hips, -0.215, 0.52, jacket, 0.055, 0.22, 0.05, 0.22);
    this.armR = limb(this.hips, 0.215, 0.52, jacket, 0.055, 0.22, 0.05, 0.22);
    for (const A of [this.armL, this.armR]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); h.position.y = -(0.22 + 0.10) - 0.07; A.lo.add(h); }
    this.phase = 0; this.t = 0;
  }
  update(dt, speed, onGround, depth, vy) {
    this.t += dt; const k = Math.min(1, speed / 3.2), run = Math.min(1, Math.max(0, (speed - 3) / 2.6));
    this.phase += dt * (3.6 + speed * 1.55) * (speed > 0.25 ? 1 : 0);
    const s = Math.sin(this.phase), c = Math.cos(this.phase), sw = 0.62 * k * (1 + run * 0.5);
    const air = onGround ? 0 : 1;
    this.legL.up.rotation.x = s * sw * (1 - air) - air * 0.5; this.legR.up.rotation.x = -s * sw * (1 - air) + air * 0.3;
    this.legL.lo.rotation.x = Math.max(0, -c * 1.0 - 0.1) * k * (1 - air) + air * 0.9; this.legR.lo.rotation.x = Math.max(0, c * 1.0 - 0.1) * k * (1 - air) + air * 0.4;
    this.armL.up.rotation.x = -s * sw * 0.85 + air * -1.0; this.armR.up.rotation.x = s * sw * 0.85 + air * -1.0;
    this.armL.lo.rotation.x = -0.25 - run * 0.9 * k; this.armR.lo.rotation.x = -0.25 - run * 0.9 * k;
    this.armL.up.rotation.z = 0.06; this.armR.up.rotation.z = -0.06;
    const bob = Math.abs(c) * 0.035 * k * (1 + run) - (depth > 0.5 ? 0.04 : 0);
    this.hips.position.y = 0.96 - Math.abs(Math.sin(this.phase)) * 0.0 + bob * 0.5 + Math.sin(this.t * 1.8) * 0.003 * (1 - k);
    this.hips.rotation.x = 0.06 * k + run * 0.14; this.hips.rotation.y = s * 0.08 * k; this.body.rotation.z = c * 0.02 * k;
    this.root.position.y += 0;
  }
}
