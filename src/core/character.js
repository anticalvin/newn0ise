// Procedural humanoid with a layered animator: (1) distance-phased locomotion (feet plant, no sliding), idle breathing, lean into turns and
// acceleration, fight stance, air and landing poses; (2) action overlays (punches, kicks, hits, block, dodge roll, knockdown, get-up) authored as
// keyframes; (3) every bone is critically damped, so motion never pops. Bone convention: character faces +z, its RIGHT side is -x.
// Limb rotation.x: negative swings a hanging limb FORWARD. Right arm abducts with -z, left with +z. Torso +y twist turns toward the left.
import * as THREE from 'three';
import { patchStandard } from './glsl.js';

const B = ['body', 'bpos', 'hips', 'spine', 'chest', 'head', 'uaR', 'laR', 'uaL', 'laL', 'thR', 'shR', 'ftR', 'thL', 'shL', 'ftL'];
const BI = Object.fromEntries(B.map((n, i) => [n, i]));
const TAU = Math.PI * 2, wrap = a => a - TAU * Math.round(a / TAU);
const sstep = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- keyframed actions (partial poses; unspecified bones stay on the locomotion pose) ----------
const GUARD = { uaR: [-0.95, 0, -0.15], laR: [-1.95, 0, 0], uaL: [-0.78, 0, 0.2], laL: [-1.85, 0, 0] };
const mk = (dur, keys, o = {}) => ({ dur, keys, fadeIn: 0.04, fadeOut: 0.12, snap: 0.045, ...o });
export const ACTIONS = {
  jab: mk(0.34, [[0, {}], [0.06, { uaL: [-0.7, 0, 0.1], laL: [-2.1, 0, 0], chest: [0, 0.15, 0], hips: [0, 0.1, 0] }],
    [0.11, { uaL: [-1.52, 0, 0.04], laL: [-0.08, 0, 0], chest: [0.05, -0.38, 0], hips: [0, -0.14, 0], spine: [0.2, 0, 0], thL: [-0.6, 0, 0.1], shL: [0.4, 0, 0], thR: [0.4, 0, -0.1], shR: [0.6, 0, 0], bpos: [0, -0.04, 0.1], head: [0.05, 0.2, 0] }],
    [0.2, { uaL: [-1.52, 0, 0.04], laL: [-0.08, 0, 0], chest: [0.05, -0.38, 0], hips: [0, -0.14, 0], bpos: [0, -0.04, 0.12] }], [0.34, {}]]),
  cross: mk(0.4, [[0, {}], [0.08, { uaR: [-0.4, 0, -0.1], laR: [-2.2, 0, 0], chest: [0, -0.5, 0], hips: [0, -0.4, 0], thL: [-0.5, 0, 0.1], thR: [0.3, 0, 0] }],
    [0.13, { uaR: [-1.55, 0, -0.05], laR: [-0.05, 0, 0], chest: [0.08, 0.62, 0], hips: [0, 0.52, 0], spine: [0.25, 0, 0], thR: [-0.2, 0, -0.1], shR: [0.7, 0, 0], thL: [-0.55, 0, 0.1], shL: [0.4, 0, 0], bpos: [0, -0.07, 0.16], head: [0.05, -0.3, 0] }],
    [0.22, { uaR: [-1.55, 0, -0.05], laR: [-0.05, 0, 0], chest: [0.08, 0.62, 0], hips: [0, 0.52, 0], bpos: [0, -0.07, 0.18] }], [0.4, {}]]),
  hook: mk(0.5, [[0, {}], [0.1, { uaL: [-0.35, 0.2, 1.1], laL: [-1.6, 0, 0], chest: [0, 0.75, 0], hips: [0, 0.5, 0], spine: [0.1, 0, 0.1], bpos: [0, -0.1, -0.05] }],
    [0.19, { uaL: [-0.5, -0.45, 1.45], laL: [-1.5, 0, 0], chest: [0.1, -1.0, 0], hips: [0, -0.6, 0], spine: [0.22, 0, -0.1], thL: [-0.6, 0, 0.1], thR: [0.45, 0, 0], shL: [0.4, 0, 0], shR: [0.65, 0, 0], bpos: [0, -0.1, 0.14], head: [0.05, 0.5, 0] }],
    [0.28, { uaL: [-0.5, -0.45, 1.45], laL: [-1.5, 0, 0], chest: [0.1, -1.0, 0], hips: [0, -0.6, 0], bpos: [0, -0.1, 0.16] }], [0.5, {}]], { snap: 0.05 }),
  front: mk(0.46, [[0, {}], [0.1, { thL: [-0.95, 0, 0], shL: [1.75, 0, 0], thR: [0.2, 0, 0], shR: [0.4, 0, 0], spine: [-0.1, 0, 0], bpos: [0, -0.05, 0], ...GUARD }],
    [0.16, { thL: [-1.55, 0, 0.03], shL: [0.05, 0, 0], ftL: [-0.5, 0, 0], thR: [0.15, 0, 0], shR: [0.35, 0, 0], spine: [-0.28, 0, 0], hips: [-0.12, 0, 0], bpos: [0, -0.04, 0.12], ...GUARD }],
    [0.25, { thL: [-1.55, 0, 0.03], shL: [0.05, 0, 0], ftL: [-0.5, 0, 0], spine: [-0.28, 0, 0], hips: [-0.12, 0, 0], thR: [0.15, 0, 0], shR: [0.35, 0, 0], bpos: [0, -0.04, 0.14], ...GUARD }], [0.46, {}]]),
  round: mk(0.62, [[0, {}], [0.12, { hips: [0, -0.55, 0], chest: [0, 0.35, 0], thR: [-0.35, 0, -0.1], shR: [1.9, 0, 0], thL: [0.1, 0, 0.1], shL: [0.4, 0, 0], uaL: [-0.4, 0, 0.9], uaR: [-0.5, 0, -1.1], laL: [-0.5, 0, 0], laR: [-0.5, 0, 0], bpos: [0, -0.05, 0] }],
    [0.22, { hips: [0, 1.15, 0], chest: [0, -0.2, 0], spine: [0, 0, 0.18], thR: [-1.1, 0, -1.1], shR: [0.12, 0, 0], ftR: [-0.3, 0, 0], thL: [0.2, 0, 0.1], shL: [0.35, 0, 0], uaL: [-0.4, 0, 0.9], uaR: [-0.5, 0, -1.1], laL: [-0.5, 0, 0], laR: [-0.5, 0, 0], bpos: [0, -0.04, 0.05], head: [0, -0.6, 0] }],
    [0.32, { hips: [0, 1.15, 0], chest: [0, -0.2, 0], spine: [0, 0, 0.18], thR: [-1.1, 0, -1.1], shR: [0.12, 0, 0], thL: [0.2, 0, 0.1], shL: [0.35, 0, 0], uaL: [-0.4, 0, 0.9], uaR: [-0.5, 0, -1.1] }], [0.62, {}]], { snap: 0.05 }),
  airkick: mk(0.5, [[0, {}], [0.08, { thL: [-1.25, 0, 0], shL: [0.15, 0, 0], thR: [0.35, 0, -0.1], shR: [1.5, 0, 0], spine: [0.22, 0, 0], uaL: [-0.4, 0, 0.7], uaR: [-0.4, 0, -0.7], laL: [-0.8, 0, 0], laR: [-0.8, 0, 0] }], [0.4, { thL: [-1.25, 0, 0], shL: [0.15, 0, 0], thR: [0.35, 0, -0.1], shR: [1.5, 0, 0], spine: [0.22, 0, 0] }], [0.5, {}]]),
  block: mk(0.3, [[0, {}], [0.08, { uaR: [-1.4, -0.3, -0.35], laR: [-2.5, 0, 0], uaL: [-1.35, 0.3, 0.35], laL: [-2.45, 0, 0], spine: [0.25, 0, 0], head: [0.25, 0, 0], bpos: [0, -0.12, 0] }], [0.3, {}]], { hold: true, fadeOut: 0.08 }),
  blockHit: mk(0.2, [[0, {}], [0.04, { spine: [-0.14, 0, 0], chest: [-0.08, 0, 0], head: [-0.15, 0, 0], bpos: [0, -0.14, -0.1] }], [0.2, {}]], { fadeIn: 0.02 }),
  hitF: mk(0.4, [[0, {}], [0.06, { body: [-0.22, 0, 0], spine: [-0.32, 0, 0], chest: [-0.2, 0, 0], head: [-0.65, 0, 0], uaR: [-0.35, 0, -0.9], uaL: [-0.35, 0, 0.9], laR: [-0.8, 0, 0], laL: [-0.8, 0, 0], bpos: [0, -0.04, -0.14] }], [0.2, { body: [-0.1, 0, 0], spine: [-0.14, 0, 0], head: [-0.25, 0, 0], bpos: [0, -0.05, -0.08] }], [0.4, {}]], { snap: 0.035, fadeOut: 0.16 }),
  hitB: mk(0.4, [[0, {}], [0.06, { body: [0.26, 0, 0], spine: [0.35, 0, 0], chest: [0.2, 0, 0], head: [0.5, 0, 0], uaR: [0.3, 0, -0.9], uaL: [0.3, 0, 0.9], bpos: [0, -0.04, 0.14] }], [0.4, {}]], { snap: 0.035 }),
  hitL: mk(0.4, [[0, {}], [0.06, { body: [-0.08, 0, 0.28], spine: [0, 0.2, 0.3], chest: [0, 0.35, 0], head: [-0.2, -0.7, 0.2], uaR: [-0.5, 0, -1.0], uaL: [-0.3, 0, 0.5], bpos: [0, -0.05, 0] }], [0.4, {}]], { snap: 0.035 }),
  hitR: mk(0.4, [[0, {}], [0.06, { body: [-0.08, 0, -0.28], spine: [0, -0.2, -0.3], chest: [0, -0.35, 0], head: [-0.2, 0.7, -0.2], uaL: [-0.5, 0, 1.0], uaR: [-0.3, 0, -0.5], bpos: [0, -0.05, 0] }], [0.4, {}]], { snap: 0.035 }),
  hitHeavy: mk(0.55, [[0, {}], [0.07, { body: [-0.5, 0, 0], spine: [-0.5, 0, 0], chest: [-0.3, 0, 0], head: [-0.85, 0, 0], uaR: [-0.1, 0, -1.3], uaL: [-0.1, 0, 1.3], laR: [-0.6, 0, 0], laL: [-0.6, 0, 0], thR: [0.3, 0, 0], thL: [-0.3, 0, 0], bpos: [0, -0.14, -0.22] }], [0.3, { body: [-0.22, 0, 0], spine: [-0.2, 0, 0], head: [-0.3, 0, 0], bpos: [0, -0.12, -0.1] }], [0.55, {}]], { snap: 0.04, fadeOut: 0.2 }),
  down: mk(0.5, [[0, {}], [0.16, { body: [-0.8, 0, 0], bpos: [0, -0.3, -0.18], spine: [-0.2, 0, 0], head: [-0.5, 0, 0], uaR: [0.2, 0, -1.2], uaL: [0.2, 0, 1.2], thR: [-0.4, 0, -0.2], thL: [-0.2, 0, 0.2], shR: [0.6, 0, 0], shL: [0.4, 0, 0] }],
    [0.42, { body: [-1.52, 0, 0], bpos: [0, -0.73, -0.1], spine: [0, 0, 0], chest: [0, 0, 0], head: [-0.15, 0.3, 0], uaR: [0.1, 0, -0.9], uaL: [0.1, 0, 0.9], laR: [-0.2, 0, 0], laL: [-0.2, 0, 0], thR: [-0.1, 0, -0.3], thL: [0, 0, 0.35], shR: [0.1, 0, 0], shL: [0.15, 0, 0], hips: [0, 0, 0] }]], { hold: true, snap: 0.07, fadeIn: 0.03 }),
  getup: mk(0.75, [[0, { body: [-1.52, 0, 0], bpos: [0, -0.73, -0.1], head: [-0.15, 0, 0], uaR: [0.1, 0, -0.9], uaL: [0.1, 0, 0.9], thR: [-0.1, 0, -0.3], thL: [0, 0, 0.35] }],
    [0.28, { body: [-0.55, 0, 0], bpos: [0, -0.5, -0.2], spine: [0.7, 0, 0], head: [-0.2, 0, 0], thR: [-1.2, 0, 0], shR: [1.9, 0, 0], thL: [-0.4, 0, 0], shL: [1.2, 0, 0], uaR: [-0.6, 0, -0.5], uaL: [-0.6, 0, 0.5] }],
    [0.55, { body: [0, 0, 0], bpos: [0, -0.3, 0], spine: [0.5, 0, 0], thR: [-0.7, 0, 0], shR: [1.3, 0, 0], thL: [0.2, 0, 0], shL: [0.9, 0, 0], ...GUARD }], [0.75, {}]], { snap: 0.06, fadeIn: 0.0, fadeOut: 0.14 }),
  dodge: mk(0.5, [[0, {}], [0.07, { body: [0, 0, 0], bpos: [0, -0.3, 0.08], spine: [0.7, 0, 0], head: [0.4, 0, 0], thR: [-1.35, 0, 0], shR: [2.0, 0, 0], thL: [-1.3, 0, 0], shL: [2.0, 0, 0], uaR: [-1.2, 0, -0.3], uaL: [-1.2, 0, 0.3], laR: [-2.4, 0, 0], laL: [-2.4, 0, 0] }],
    [0.4, { body: [TAU, 0, 0], bpos: [0, -0.32, 0.1], spine: [0.7, 0, 0], head: [0.4, 0, 0], thR: [-1.35, 0, 0], shR: [2.0, 0, 0], thL: [-1.3, 0, 0], shL: [2.0, 0, 0] }], [0.5, { body: [TAU, 0, 0], bpos: [0, -0.12, 0.05] }]], { snap: 0.03, fadeIn: 0.02, fadeOut: 0.1 }),
};
// per-bone track tables: [bone][keyIndex] = [x,y,z] or null
for (const a of Object.values(ACTIONS)) { a.tracks = {}; for (const [, pose] of a.keys) for (const b of Object.keys(pose)) a.tracks[b] = true; for (const b of Object.keys(a.tracks)) a.tracks[b] = a.keys.map(k => k[1][b] || null); }

export class Character {
  constructor(shared, o = {}) {
    const mat = (hex, r = 0.7) => patchStandard(new THREE.MeshStandardMaterial({ color: hex, roughness: r }), shared, {}, 'char');
    const jacket = mat(o.jacket ?? 0xd9d2c6, 0.8), pants = mat(o.pants ?? 0x232427, 0.85), skin = mat(o.skin ?? 0x9a6a50, 0.7), hair = mat(o.hair ?? 0x14110f, 0.9), shoe = mat(o.shoe ?? 0x0d0d0f, 0.6), trim = mat(o.trim ?? 0x3a3a3c, 0.7);
    this.mats = [jacket, pants, skin, hair, shoe, trim]; this.flash = 0;
    const cap = (r, l, m, sx = 1, sz = 1) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 12), m); x.castShadow = true; x.scale.set(sx, 1, sz); return x; };
    const grp = (parent, x, y, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    this.root = new THREE.Group(); this.scale = o.scale || 1; this.root.scale.setScalar(this.scale);
    this.body = grp(this.root, 0, 0.96); this.hips = grp(this.body, 0, 0);
    const pelvis = cap(0.15, 0.06, pants, 1.2, 0.8); pelvis.position.y = 0.02; this.hips.add(pelvis);
    this.spine = grp(this.hips, 0, 0.08); const waist = cap(0.145, 0.1, jacket, 1.15, 0.78); waist.position.y = 0.1; this.spine.add(waist);
    this.chest = grp(this.spine, 0, 0.22); const ch = cap(0.17, 0.12, jacket, 1.25, 0.8); ch.position.y = 0.13; this.chest.add(ch);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 14), trim); belt.position.y = -0.03; belt.scale.set(1.15, 1, 0.78); this.spine.add(belt);
    const neck = cap(0.045, 0.05, skin); neck.position.y = 0.38; this.chest.add(neck);
    this.headG = grp(this.chest, 0, 0.5); const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 22, 16), skin); head.scale.set(1, 1.08, 1.02); head.castShadow = true; this.headG.add(head);
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.123, 22, 14, 0, TAU, 0, Math.PI * 0.56), hair); hr.position.y = 0.012; hr.rotation.x = -0.28; this.headG.add(hr);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skin); nose.position.set(0, -0.005, 0.115); this.headG.add(nose);
    const limb = (parent, x, y, m, r, l, r2, l2, end) => {
      const up = grp(parent, x, y), a = cap(r, l, m); a.position.y = -(l / 2 + r); up.add(a);
      const lo = grp(up, 0, -(l + 2 * r)), b = cap(r2, l2, m); b.position.y = -(l2 / 2 + r2); lo.add(b); let e = null;
      if (end === 'hand') { e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skin); e.position.y = -(l2 + 2 * r2) - 0.03; e.castShadow = true; lo.add(e); }
      if (end === 'foot') { e = grp(lo, 0, -(l2 + 2 * r2) - 0.02); const f = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.27), shoe); f.position.set(0, -0.005, 0.07); f.castShadow = true; e.add(f); }
      return { up, lo, end: e };
    };
    const arm = (s, n) => limb(this.chest, s * 0.215, 0.37, jacket, 0.055, 0.22, 0.05, 0.22, 'hand'), leg = s => limb(this.hips, s * 0.09, -0.01, pants, 0.085, 0.30, 0.07, 0.30, 'foot');
    this.armR = arm(-1); this.armL = arm(1); this.legR = leg(-1); this.legL = leg(1);
    this.nodes = [this.body, this.body, this.hips, this.spine, this.chest, this.headG, this.armR.up, this.armR.lo, this.armL.up, this.armL.lo, this.legR.up, this.legR.lo, this.legR.end, this.legL.up, this.legL.lo, this.legL.end];
    const n = B.length * 3; this.cur = new Float32Array(n); this.vel = new Float32Array(n); this.tgt = new Float32Array(n); this.loco = new Float32Array(n);
    this.ph = 0; this.t = Math.random() * 10; this.stepN = 0; this.airW = 0; this.stW = 0; this.blW = 0; this.lastAct = null; this.onStep = null; this.actW = 0;
  }
  // hit flash: a short red tint. (It used to be a white emissive, which turned the figure into a white silhouette that vanished against the light level floor.)
  setFlash(f) { this.flash = f; f = Math.min(0.55, f); for (const m of this.mats) { m.emissive.setRGB(f * 0.8, f * 0.07, f * 0.04); } }
  setGun(kind) {
    if (this.gun) { this.armR.end.remove(this.gun); this.gun = null; } if (!kind) return;
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.6 }), L = kind === 'rifle' ? 0.62 : kind === 'shotgun' ? 0.7 : 0.26;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, L, 0.075), m); body.position.y = -L / 2 + 0.05; g.add(body);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), m); grip.position.set(0, 0.0, 0.06); grip.rotation.x = 0.25; g.add(grip);
    g.rotation.x = 0; g.position.set(0, -0.02, 0.0); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.armR.end.add(g); this.gun = g;
  }
  limb(name, out) { const o = { handL: this.armL.end, handR: this.armR.end, footL: this.legL.end, footR: this.legR.end, chest: this.chest, head: this.headG }[name]; return o.getWorldPosition(out); }
  // s: {speed, vf, vs, onGround, vy, depth, leanF, leanR, stance, act, actT, actHold, blocking, landT}
  update(dt, s, onGround, depth, vy) {
    // the geographic world still calls update(dt, speed, onGround, depth, vy)
    if (typeof s === 'number') s = { speed: s, vf: s, vs: 0, onGround: onGround !== false, vy: vy || 0, depth: depth || 0, leanF: 0, leanR: 0, stance: 0, act: null, actT: 0, actHold: false, blocking: false, landT: 0 };
    this.t += dt; const L = this.loco, set = (b, x = 0, y = 0, z = 0) => { const i = BI[b] * 3; L[i] = x; L[i + 1] = y; L[i + 2] = z; };
    const sp = s.speed, k = Math.min(1, sp / 2.4), rn = sstep((sp - 2.6) / 3.2), stepLen = 0.6 + 0.3 * rn;
    const prevPh = this.ph; if (s.onGround && sp > 0.15) this.ph += sp * dt / stepLen * Math.PI;
    const sn = Math.sin(this.ph), cs = Math.cos(this.ph), fw = sp > 0.1 ? s.vf / sp : 1, sd = sp > 0.1 ? s.vs / sp : 0;
    const sdir = Math.sign(fw) || 1, amp = (0.5 + 0.38 * rn) * k;
    this.airW += ((s.onGround ? 0 : 1) - this.airW) * Math.min(1, dt * 14); this.stW += (s.stance - this.stW) * Math.min(1, dt * 8);
    const nowStep = Math.floor(this.ph / Math.PI); if (nowStep !== this.stepN) { const side = nowStep % 2 === 0 ? -1 : 1; this.stepN = nowStep; if (s.onGround && this.onStep) this.onStep(side, sp); }
    // ---- locomotion ----
    const idle = 1 - k, br = Math.sin(this.t * 1.7), sway = Math.sin(this.t * 0.6);
    const bob = -(0.5 - 0.5 * Math.cos(this.ph * 2)) * 0.05 * k * (1 + rn);
    const lean = 0.05 * k + rn * 0.15 + s.leanF * 0.22 - (s.depth > 0.6 ? 0.1 : 0);
    set('bpos', 0, bob - s.landT * 0.2 - Math.min(0.12, s.depth * 0.06) + br * 0.004 * idle, 0);
    set('body', 0, 0, s.leanR * 0.35 + sway * 0.015 * idle);
    set('hips', 0.0, sn * 0.12 * k * fw + sway * 0.05 * idle, sn * 0.03 * k);
    set('spine', lean + s.landT * 0.3 + br * 0.012 * idle, -sn * 0.06 * k, 0);
    set('chest', br * 0.018 * idle, -sn * 0.14 * k * fw, 0);
    set('head', -lean * 0.6 + Math.sin(this.t * 0.9) * 0.02 * idle, sn * 0.05 * k + Math.sin(this.t * 0.45) * 0.08 * idle, 0);
    const sw = amp * fw * sdir * Math.sign(fw || 1);
    const swing = sn * amp * (Math.abs(fw) > 0.2 ? Math.sign(fw) : 1) * Math.max(0.35, Math.abs(fw)), side = sn * amp * 0.9 * sd;
    set('thR', swing + 0.02, 0, side * 0.7 - 0.03); set('thL', -swing + 0.02, 0, side * 0.7 + 0.03);
    const flexR = Math.max(0, -cs * Math.sign(fw || 1)) * (0.85 + 0.9 * rn) * k + 0.05 * k, flexL = Math.max(0, cs * Math.sign(fw || 1)) * (0.85 + 0.9 * rn) * k + 0.05 * k;
    set('shR', flexR + s.landT * 0.4, 0, 0); set('shL', flexL + s.landT * 0.4, 0, 0);
    set('thR', swing + 0.02 - s.landT * 0.3, 0, side * 0.7 - 0.03); set('thL', -swing + 0.02 - s.landT * 0.3, 0, side * 0.7 + 0.03);
    set('ftR', -swing * 0.3, 0, 0); set('ftL', swing * 0.3, 0, 0);
    const armAmp = amp * 0.95 * (0.4 + 0.6 * Math.abs(fw)), elb = -(0.28 + 0.95 * rn) * k - 0.12 + br * 0.01;
    set('uaR', -sn * armAmp * Math.sign(fw || 1) + 0.04, 0, -0.07 - sway * 0.02 * idle); set('uaL', sn * armAmp * Math.sign(fw || 1) + 0.04, 0, 0.07 + sway * 0.02 * idle);
    set('laR', elb, 0, 0); set('laL', elb, 0, 0);
    void sw;
    // fight stance (arms up, knees soft, bouncing) blends over the walk
    const st = this.stW;
    if (st > 0.001) {
      const bn = Math.sin(this.t * 7.5) * 0.012, add = (b, ax, ay, az, w = st) => { const i = BI[b] * 3; L[i] += ax * w; L[i + 1] += ay * w; L[i + 2] += az * w; }, mix = (b, x, y, z, w = st) => { const i = BI[b] * 3; L[i] = lerp(L[i], x, w); L[i + 1] = lerp(L[i + 1], y, w); L[i + 2] = lerp(L[i + 2], z, w); };
      add('bpos', 0, -0.09 + bn * (1 - k), 0); add('spine', 0.12, 0, 0); add('hips', 0, 0.25, 0); add('chest', 0, -0.18, 0); add('head', 0.1, 0, 0);
      add('thL', -0.32 * (1 - k * 0.6), 0, 0.08); add('thR', 0.2 * (1 - k * 0.6), 0, -0.08); add('shL', 0.45, 0, 0); add('shR', 0.5, 0, 0);
      mix('uaR', ...GUARD.uaR, st); mix('laR', ...GUARD.laR, st); mix('uaL', ...GUARD.uaL, st); mix('laL', ...GUARD.laL, st);
    }
    // air
    if (this.airW > 0.001) {
      const w = this.airW, up = s.vy > 0 ? 1 : 0, mix = (b, x, y, z) => { const i = BI[b] * 3; L[i] = lerp(L[i], x, w); L[i + 1] = lerp(L[i + 1], y, w); L[i + 2] = lerp(L[i + 2], z, w); };
      mix('thR', up ? -0.7 : -0.25, 0, -0.18); mix('shR', up ? 1.1 : 0.4, 0, 0); mix('thL', up ? 0.15 : -0.45, 0, 0.12); mix('shL', up ? 0.5 : 0.35, 0, 0);
      mix('uaR', -0.35, 0, -0.75); mix('uaL', -0.35, 0, 0.75); mix('laR', -0.6, 0, 0); mix('laL', -0.6, 0, 0); mix('spine', up ? 0.1 : 0.04, 0, 0);
      L[BI.bpos * 3 + 1] += (up ? 0.0 : 0.02) * w;
    }
    // block (smooth hold)
    this.blW += ((s.blocking ? 1 : 0) - this.blW) * Math.min(1, dt * 18);
    // aim (arms raised along the sights) for armed play
    this.aimW = (this.aimW || 0) + ((s.aim ? 1 : 0) - (this.aimW || 0)) * Math.min(1, dt * 14);
    if (this.aimW > 0.001) { const w = this.aimW; for (const [b, v] of [['uaR', [-1.5, 0, -0.04]], ['laR', [-0.1, 0, 0]], ['uaL', [-1.3, 0, 0.42]], ['laL', [-0.75, 0, 0]], ['chest', [0, -0.22, 0]], ['spine', [0.02, 0, 0]]]) { const i = BI[b] * 3; for (let q = 0; q < 3; q++) L[i + q] = lerp(L[i + q], v[q], w); } }
    // ---- action overlay ----
    const A = s.act ? ACTIONS[s.act] : null; let wEnv = 0; const T = this.tgt; T.set(L);
    if (A) {
      const t = s.actT, hold = A.hold || s.actHold; const tt = hold ? Math.min(t, A.keys[A.keys.length - 1][0]) : Math.min(t, A.dur);
      wEnv = sstep(t / A.fadeIn); if (!hold) wEnv *= 1 - sstep((t - (A.dur - A.fadeOut)) / A.fadeOut);
      let i = 0; const ks = A.keys; while (i < ks.length - 2 && tt > ks[i + 1][0]) i++;
      const t0 = ks[i][0], t1 = ks[i + 1][0], u = t1 > t0 ? sstep((tt - t0) / (t1 - t0)) : 1;
      for (const b in A.tracks) { const tr = A.tracks[b], bi = BI[b] * 3, c = tr[i], d = tr[i + 1], n = b === 'bpos' ? 3 : 3;
        for (let q = 0; q < n; q++) { const lv = L[bi + q], v0 = c ? c[q] : lv, v1 = d ? d[q] : lv, v = lerp(v0, v1, u); T[bi + q] = lerp(lv, v, wEnv); } }
      this.actW = wEnv;
    } else this.actW += (0 - this.actW) * Math.min(1, dt * 12);
    // block pose over everything except strong actions
    if (this.blW > 0.001) { const bw = this.blW * (1 - wEnv * 0.9), BL = ACTIONS.block.keys[1][1]; for (const b in BL) { const bi = BI[b] * 3; for (let q = 0; q < 3; q++) T[bi + q] = lerp(T[bi + q], BL[b][q], bw); } }
    // ---- critically damped smoothing, then pose the bones ----
    const stT = A ? lerp(0.085, A.snap, wEnv) : lerp(0.085, 0.06, this.blW);
    const om = 2 / stT, x = om * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), cur = this.cur, vel = this.vel;
    for (let i = 0; i < T.length; i++) {
      const isRot = i < 3 || i >= 9, bone = (i / 3) | 0; let ch = cur[i] - T[i]; if (bone !== 1) ch = wrap(ch); const tp = (vel[i] + om * ch) * dt; vel[i] = (vel[i] - om * tp) * ex; cur[i] = T[i] + (ch + tp) * ex; void isRot;
    }
    const N = this.nodes; for (let b = 0; b < B.length; b++) { const i = b * 3; if (b === 0) this.body.rotation.set(cur[i], cur[i + 1], cur[i + 2]); else if (b === 1) this.body.position.set(cur[i + 0], 0.96 + cur[i + 1], cur[i + 2]); else N[b].rotation.set(cur[i], cur[i + 1], cur[i + 2]); }
    void prevPh;
  }
}
