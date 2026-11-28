// Hitscan weapons for the third-person player: pistol, rifle, shotgun. Shots are traced from the camera through the cursor/reticle (so you hit what you aim at),
// tested against fighters (stacked spheres) and the Rapier world (blocks, props, cars). Fighters take real hit reactions; dynamic bodies get an impulse.
import * as THREE from 'three';
import { clamp } from './util.js';

export const GUNS = {
  pistol:  { name: 'Pistol',  dmg: 20, rate: 0.26, mag: 12, reserve: 48, auto: false, spread: 0.004, pellets: 1, range: 90, kick: 0.1,  imp: 14, reload: 1.0 },
  rifle:   { name: 'Rifle',   dmg: 11, rate: 0.085, mag: 30, reserve: 90, auto: true,  spread: 0.016, pellets: 1, range: 140, kick: 0.07, imp: 10, reload: 1.5 },
  shotgun: { name: 'Shotgun', dmg: 9,  rate: 0.85, mag: 6,  reserve: 24, auto: false, spread: 0.065, pellets: 8, range: 38, kick: 0.35, imp: 8,  reload: 1.8 },
};
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), ray = new THREE.Raycaster();

export class Guns {
  constructor(app) {
    this.a = app; this.inv = {}; this.cur = null; this.cd = 0; this.reloadT = 0; this.firing = false; this.fireEdge = false; this.tracers = [];
    const el = this.el = document.createElement('div'); el.id = 'ammo'; el.innerHTML = '<b></b><span></span><i></i>'; document.getElementById('ui').appendChild(el);
    const ch = this.cross = document.createElement('div'); ch.id = 'cross'; document.getElementById('ui').appendChild(ch);
    for (let i = 0; i < 10; i++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, depthWrite: false, fog: false })); l.frustumCulled = false; l.visible = false; app.scene.add(l); this.tracers.push({ l, t: 0 }); }
    this.hud();
  }
  reset() { this.inv = {}; this.cur = null; this.cd = this.reloadT = 0; this.firing = false; this.fireEdge = false; this.sync(); }
  give(kind) { const g = GUNS[kind]; const had = this.inv[kind]; if (!had) this.inv[kind] = { mag: g.mag, reserve: g.reserve }; else had.reserve += g.mag * 2; if (!this.cur) this.equip(kind); this.hud(); return !had; }
  addAmmo(n) { for (const k in this.inv) this.inv[k].reserve += Math.ceil(GUNS[k].mag * n); this.hud(); }
  equip(kind) { if (kind && !this.inv[kind]) return; if (kind === this.cur) kind = null; this.cur = kind; this.reloadT = 0; this.sync(); this.hud(); this.a.fx.play('click', 0.8); }
  sync() { const P = this.a.player; if (P) { P.character.setGun(this.cur); P.aim = !!this.cur; } }
  reload() { const s = this.cur && this.inv[this.cur], g = this.cur && GUNS[this.cur]; if (!s || this.reloadT > 0 || s.mag >= g.mag || s.reserve <= 0) return; this.reloadT = g.reload; this.a.fx.play('reload', 0.9); }
  hud() { const s = this.cur && this.inv[this.cur]; this.el.style.opacity = this.cur ? 1 : 0; if (s) { this.el.children[0].textContent = this.reloadT > 0 ? 'RELOADING' : s.mag; this.el.children[1].textContent = '/ ' + s.reserve; this.el.children[2].textContent = GUNS[this.cur].name; } }
  fire() {
    const A = this.a, P = A.player, s = this.cur && this.inv[this.cur], g = this.cur && GUNS[this.cur]; if (!s || this.cd > 0 || this.reloadT > 0 || !P.alive || P.state !== 'free') return;
    if (s.mag <= 0) { this.cd = 0.25; A.fx.play('empty', 1); this.reload(); return; }
    s.mag--; this.cd = g.rate; A.fx.play(this.cur, 1, P.pos); A.rig.addTrauma(g.kick); this.hud();
    const ndc = A.input.cursorNdc(new THREE.Vector2()); ray.setFromCamera(ndc, A.camera); const o = ray.ray.origin.clone(), d0 = ray.ray.direction.clone();
    const muzzle = P.character.limb('handR', new THREE.Vector3()); muzzle.addScaledVector(new THREE.Vector3(Math.sin(P.ryaw), 0.1, Math.cos(P.ryaw)), 0.45);
    A.fx.spark(muzzle.x, muzzle.y, muzzle.z, Math.sin(P.ryaw), Math.cos(P.ryaw), 6, [1, 0.85, 0.45], 5); A.fx.ring(muzzle.x, muzzle.y, muzzle.z, 0.45, 0xffd890);
    for (let i = 0; i < g.pellets; i++) {
      const d = d0.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(g.spread)).normalize(); this.shoot(o, d, g, muzzle, P);
    }
  }
  shoot(o, d, g, muzzle, P) {
    const A = this.a, ph = A.phys; let tw = g.range, kind = null, who = null, n = null;
    const hit = ph.world.castRayAndGetNormal(new ph.R.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }), g.range, true, ph.R.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, P.col);
    if (hit) { tw = hit.timeOfImpact; kind = 'world'; n = hit.normal; }
    for (const t of A.combat.actors) { if (t === P || !t.alive || t.hidden) continue; for (const [hy, r] of [[0.4, 0.34], [0.95, 0.38], [1.5, 0.3]]) { v1.set(t.rpos.x, t.rpos.y + hy * t.scale, t.rpos.z).sub(o); const b = v1.dot(d), c = v1.lengthSq() - (r * t.scale) ** 2, disc = b * b - c; if (disc < 0 || b < 0) continue; const tt = b - Math.sqrt(disc); if (tt > 0 && tt < tw) { tw = tt; kind = 'actor'; who = t; } } }
    const p = v2.copy(o).addScaledVector(d, tw).clone(); let end = p;
    if (kind === 'actor') { const dx = who.pos.x - P.pos.x, dz = who.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1; const res = who.receiveHit(P, { dmg: g.dmg, kb: 2.2, stun: 0.26, hs: 0.03, trauma: 0.1 }, { x: dx / l, z: dz / l }, { unblockable: true });
      if (res !== 'ignore') { A.fx.spark(p.x, p.y, p.z, d.x, d.z, 10, [1, 0.35, 0.3], 6); P.comboN = (P.comboN || 0) + 1; if (A.combat.combo) { A.combat.combo.n = P.comboN; A.combat.combo.t = 1.6; } if (who.hp <= 0 || res === 'knock') A.fx.ring(p.x, p.y, p.z, 1.2, 0xff8a6a); } }
    else if (kind === 'world') { A.fx.spark(p.x, p.y, p.z, n.x, n.z, 7, [1, 0.8, 0.5], 4); A.fx.dustPuff(p.x, p.y, p.z, 1, 0.3, [0.7, 0.7, 0.7], 0.6);
      const body = hit.collider.parent(); if (body && body.isDynamic()) body.applyImpulseAtPoint({ x: d.x * g.imp, y: d.y * g.imp, z: d.z * g.imp }, { x: p.x, y: p.y, z: p.z }, true); }
    const tr = this.tracers.find(x => x.t <= 0) || this.tracers[0]; tr.t = 0.07; const pos = tr.l.geometry.attributes.position; pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z); pos.setXYZ(1, end.x, end.y, end.z); pos.needsUpdate = true; tr.l.visible = true; tr.l.material.opacity = 0.9;
  }
  step(dt) {
    const A = this.a, P = A.player; this.cd -= dt; if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { const s = this.inv[this.cur]; if (s) { const g = GUNS[this.cur], take = Math.min(g.mag - s.mag, s.reserve); s.mag += take; s.reserve -= take; } this.hud(); } }
    if (this.cur && P && P.alive && !A.driving) { const g = GUNS[this.cur]; if ((this.firing && g.auto) || this.fireEdge) this.fire(); }
    this.fireEdge = false;
  }
  render(dt) { for (const t of this.tracers) { if (t.t > 0) { t.t -= dt; t.l.material.opacity = Math.max(0, t.t / 0.07) * 0.9; if (t.t <= 0) t.l.visible = false; } } this.cross.style.opacity = this.cur && !this.a.driving && this.a.mode === 'explore' ? 1 : 0; const n = this.a.input.cursorNdc(new THREE.Vector2()); this.cross.style.transform = `translate(${(n.x * 0.5 + 0.5) * innerWidth}px,${(-n.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`; if (this.reloadT > 0) this.hud(); }
  // keep the player facing where the gun points while armed
  faceAim(dt) { const A = this.a, P = A.player; if (!this.cur || !P.alive || A.driving || P.state !== 'free') return; const yaw = Math.atan2(-Math.sin(A.cam.yaw), -Math.cos(A.cam.yaw)), w = a => a - Math.PI * 2 * Math.round(a / (Math.PI * 2)); P.yaw += w(yaw - P.yaw) * (1 - Math.exp(-16 * dt)); }
}
void clamp;
