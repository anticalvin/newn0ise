// Combat manager: owns the fighters, resolves strikes (cone + reach, once per target per attack), applies hit-stop / camera shake / sparks / sound,
import { TUNE } from './tune.js';
// damages fighters with fast-moving props, keeps lock-on, and runs the fighter AI.
import * as THREE from 'three';
import { Actor, ATTACKS } from './actor.js';
import { clamp } from './util.js';

const TAU = Math.PI * 2, wrap = a => a - TAU * Math.round(a / TAU);
const KINDS = {
  brawler: { hp: 90, power: 1, speedMul: 1, scale: 1, palette: { jacket: 0x7d2f2a, pants: 0x1e2024, skin: 0xb98363, hair: 0x2a1d14, trim: 0x111 }, skill: 0.55 },
  heavy:   { hp: 170, power: 1.5, speedMul: 0.82, scale: 1.2, armor: true, palette: { jacket: 0x2d3b4a, pants: 0x14161a, skin: 0x7c5440, hair: 0x0c0a09, trim: 0x888 }, skill: 0.4 },
  dummy:   { hp: 120, power: 0, speedMul: 1, scale: 1, dummy: true, palette: { jacket: 0xb89a5e, pants: 0x9b8450, skin: 0xb89a5e, hair: 0x7a6238, shoe: 0x5a4a2a, trim: 0x6a5530 }, skill: 0 },
};

class Brain {
  constructor(a, skill) { this.a = a; this.skill = skill; this.mode = 'idle'; this.aggro = false; this.cd = 0.6 + Math.random(); this.circ = Math.random() < 0.5 ? 1 : -1; this.circT = 1.5 + Math.random() * 2; this.combo = []; this.blockT = 0; this.reactCd = 0; this.recT = 0; this.home = a.pos.clone(); }
  update(dt, P) {
    const a = this.a, it = a.intent; it.mx = it.mz = 0; it.run = false; it.analog = false; a.wantBlock = false; this.reactCd -= dt; if (!TUNE.ai) return;
    if (!a.alive || ['down', 'getup', 'hit'].includes(a.state)) return;
    if (a.dummy) { const hx = this.home.x - a.pos.x, hz = this.home.z - a.pos.z, d = Math.hypot(hx, hz); if (d > 0.6 && a.state === 'free') { it.mx = hx / d; it.mz = hz / d; } a.faceTarget = false; return; }
    const dx = P.pos.x - a.pos.x, dz = P.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
    if (!P.alive) { this.aggro = false; a.faceTarget = false; return; }
    if (!this.aggro) { if (d < 11 || a.hurtT > 0) this.aggro = true; else { a.faceTarget = false; return; } }
    if (d > 36) { this.aggro = false; return; }
    a.target = P; a.faceTarget = true; a.combatT = 2;
    // reactions to the player's attacks
    if (this.reactCd <= 0 && P.state === 'attack' && P.atkT < 0.2 && d < 2.7 && a.state === 'free') { this.reactCd = 0.5 + Math.random() * 0.5;
      const r = Math.random(); if (r < this.skill * 0.7) this.blockT = 0.45 + Math.random() * 0.3; else if (r < this.skill * 0.7 + 0.18 * this.skill && a.tryDodge(-nz * this.circ - nx * 0.4, nx * this.circ - nz * 0.4)) return; }
    if (this.blockT > 0) { this.blockT -= dt; a.wantBlock = true; return; }
    if (a.state === 'attack') { it.mx = nx * 0.5; it.mz = nz * 0.5; if (this.combo.length && !a.queued && a.atkT >= a.atk.cancel - 0.06) a.tryAttack(this.combo.shift()); return; }
    switch (this.mode) {
      case 'idle': this.mode = 'approach'; break;
      case 'approach': it.mx = nx; it.mz = nz; it.run = d > 7; if (d < 2.6) { this.mode = 'circle'; this.cd = (0.35 + Math.random() * 0.9) * (1.7 - this.skill); } break;
      case 'circle': {
        const rad = clamp((d - 2.1) * 0.9, -1, 1), px = -nz * this.circ, pz = nx * this.circ; let mx = nx * rad + px * 0.75, mz = nz * rad + pz * 0.75; const l = Math.hypot(mx, mz) || 1; it.mx = mx / l * 0.7; it.mz = mz / l * 0.7;
        this.circT -= dt; if (this.circT < 0) { this.circ = -this.circ; this.circT = 1.2 + Math.random() * 2.4; } this.cd -= dt;
        if (this.cd <= 0 && d < 2.2) { const n = 1 + (Math.random() < this.skill ? 1 : 0) + (Math.random() < this.skill * 0.5 ? 1 : 0); this.combo = []; const pat = Math.random() < 0.35 ? ['k'] : ['p', 'p', 'k']; for (let i = 0; i < n; i++) this.combo.push(pat[i % pat.length]); this.mode = 'attack'; }
        if (d > 3.8) this.mode = 'approach'; break; }
      case 'attack': { it.mx = nx * 0.35; it.mz = nz * 0.35; if (this.combo.length && d < 2.6) { a.tryAttack(this.combo.shift()); } else if (!this.combo.length) { this.mode = 'recover'; this.recT = 0.45 + Math.random() * 0.4; } if (d > 3.4 && !this.combo.length) this.mode = 'approach'; break; }
      case 'recover': it.mx = -nx * 0.45; it.mz = -nz * 0.45; this.recT -= dt; if (this.recT <= 0) { this.mode = 'circle'; this.cd = (0.7 + Math.random() * 1.2) * (1.8 - this.skill); } break;
    }
  }
}

export class Combat {
  constructor(app) { this.a = app; this.actors = []; this.t = 0; this.lockT = null; this.combo = { n: 0, t: 0 }; this.slow = { s: 1, until: 0 }; this.spawnLog = []; }
  get player() { return this.actors.find(a => a.isPlayer); }
  add(kind, x, z, yaw = 0, opt = {}) {
    const a = this.a, K = KINDS[kind] || KINDS.brawler, y = a.terrain.hAt(x, z), ac = new Actor(a, { kind, name: kind, x, y, z, yaw, hp: K.hp, power: K.power, speedMul: K.speedMul, scale: K.scale, armor: K.armor, dummy: K.dummy, palette: K.palette, ...opt });
    a.phys.addActor(ac, ac.scale); if (!ac.isPlayer) ac.brain = new Brain(ac, K.skill); ac.home = [x, z, yaw]; this.actors.push(ac); return ac;
  }
  addPlayer(x, z, yaw) { const ac = this.add('player', x, z, yaw, { player: true, name: 'You', hp: 120, palette: { jacket: 0xd9d2c6 } }); ac.kind = 'player'; return ac; }
  remove(ac) { const i = this.actors.indexOf(ac); if (i >= 0) this.actors.splice(i, 1); if (this.lock === ac) this.lock = null; ac.dispose(); }
  clearEnemies() { for (const e of this.actors.filter(x => !x.isPlayer)) this.remove(e); }
  enemies() { return this.actors.filter(x => !x.isPlayer); }
  // ---- lock-on ----
  toggleLock() {
    const p = this.player; if (!p) return; if (p.lock) { p.lock = null; this.a.ui.toast('Lock-on off'); return; }
    let best = null, bs = 1e9; const f = [-Math.sin(this.a.cam.yaw), -Math.cos(this.a.cam.yaw)];
    for (const e of this.enemies()) { if (!e.alive) continue; const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz); if (d > 22) continue; const s = d - (dx * f[0] + dz * f[1]) / d * 6; if (s < bs) { bs = s; best = e; } }
    if (best) { p.lock = best; this.a.ui.toast('Locked on'); } else this.a.ui.toast('No target nearby');
  }
  // ---- strikes ----
  strike(att) {
    const def = att.atk, A = this.a, fx = Math.sin(att.yaw), fz = Math.cos(att.yaw); let any = false;
    for (const t of this.actors) {
      if (t === att || t.team === att.team || !t.alive || att.hitSet.has(t)) continue;
      const dx = t.pos.x - att.pos.x, dz = t.pos.z - att.pos.z, d = Math.hypot(dx, dz), dy = Math.abs(t.pos.y - att.pos.y);
      if (d > def.reach * att.scale + 0.38 * t.scale + 0.1 || dy > 1.5 || (def.air ? false : dy > 1.2)) continue;
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1; if (dot < 0.3 && d > 0.55) continue;
      att.hitSet.add(t); const dir = { x: d > 0.01 ? dx / d : fx, z: d > 0.01 ? dz / d : fz }; const res = t.receiveHit(att, def, dir); if (res === 'ignore') continue; any = true;
      const lp = att.character.limb(def.limb, new THREE.Vector3()), cx = t.pos.x * 0.5 + lp.x * 0.5, cy = t.pos.y + 1.15 * t.scale, cz = t.pos.z * 0.5 + lp.z * 0.5;
      if (res === 'dodge') { A.fx.play('whoosh', 0.8); if (t.isPlayer) this.slowmoHint(); continue; }
      if (res === 'parry') { A.fx.spark(lp.x, lp.y, lp.z, dir.x, dir.z, 22, [0.8, 0.95, 1], 7); A.fx.ring(lp.x, lp.y, lp.z, 1.6, 0xbfe6ff); A.fx.play('parry', 1); att.freeze = 0.14; t.freeze = 0.14; A.slowmo(0.2, 0.22); A.ui.flash('PARRY'); this.shakeFor(att, t, 0.3); continue; }
      if (res === 'block') { A.fx.spark(lp.x, lp.y, lp.z, dir.x, dir.z, 8, [1, 0.9, 0.6], 4); A.fx.play('block', 0.9); att.freeze = def.hs * 0.7; this.shakeFor(att, t, 0.08); continue; }
      const heavy = def.dmg >= 11 || res === 'knock';
      A.fx.spark(lp.x, lp.y, lp.z, dir.x, dir.z, heavy ? 22 : 12, heavy ? [1, 0.55, 0.25] : [1, 0.85, 0.5], heavy ? 8 : 6); A.fx.ring(cx, cy, cz, heavy ? 1.5 : 1, heavy ? 0xff9a5a : 0xffe9b0);
      A.fx.play(def.snd, 1); att.freeze = def.hs; this.shakeFor(att, t, def.trauma * (res === 'knock' ? 1.3 : 1));
      if (att.isPlayer) { att.comboN++; att.comboT = 0; this.combo.n = att.comboN; this.combo.t = 1.6; } if (res === 'knock' && (att.isPlayer || t.isPlayer)) A.slowmo(0.35, 0.2);
    }
    // props get punched / kicked too
    for (const p of A.boulders.items) {
      if (!p.body || att.hitSet.has(p.id)) continue; const dx = (p.cp || p.p).x - att.pos.x, dz = (p.cp || p.p).z - att.pos.z, d = Math.hypot(dx, dz), dy = (p.cp || p.p).y - att.pos.y;
      if (d > def.reach * att.scale + p.r + 0.2 || dy < -0.6 || dy > 1.9 || ((dx * fx + dz * fz) / (d || 1)) < 0.35) continue;
      att.hitSet.add(p.id); const nx = dx / (d || 1), nz = dz / (d || 1), k = def.kb * p.mass * 0.8 * (att.power || 1) * (p.kind === 'boulder' ? 0.55 : 1);
      p.body.applyImpulse({ x: nx * k, y: k * 0.28, z: nz * k }, true); p.body.wakeUp(); A.fx.play('thud', 0.6); A.fx.spark((p.cp || p.p).x - nx * p.r, (p.cp || p.p).y, (p.cp || p.p).z - nz * p.r, nx, nz, 8, [1, 0.85, 0.5], 4); this.shakeFor(att, null, 0.1); att.freeze = Math.max(att.freeze, 0.04);
    }
    return any;
  }
  shakeFor(a, b, v) { if ((a && a.isPlayer) || (b && b.isPlayer)) this.a.rig.addTrauma(v); else if (this.player && this.player.pos.distanceTo((a || b).pos) < 9) this.a.rig.addTrauma(v * 0.4); }
  slowmoHint() { this.a.slowmo(0.45, 0.16); }
  onKO(ac) { if (ac.isPlayer) { this.a.ui.flash('KO'); setTimeout(() => this.player && this.respawnPlayer(), 2600); } else { ac.koAt = this.t; } }
  respawnPlayer() { const p = this.player, s = this.a.spawn; if (p && !p.alive) { p.respawn(s[0], s[1], s[2]); this.a.rig.snap(); } }
  // ---- fast props hurt ----
  propDamage(dt) {
    const A = this.a;
    for (const p of A.boulders.items) {
      if (!p.body) continue; p.hitCd = Math.max(0, p.hitCd - dt); if (p.sp < 6.2 || p.hitCd > 0) continue; const v = p.v;
      for (const t of this.actors) {
        if (!t.alive) continue; const dx = t.pos.x - (p.cp || p.p).x, dz = t.pos.z - (p.cp || p.p).z, h = Math.hypot(dx, dz); if (h > p.r + 0.5 * t.scale || t.pos.y + 1.7 < (p.cp || p.p).y - p.r || t.pos.y > (p.cp || p.p).y + p.r + 0.3) continue;
        const dmg = clamp(p.mass * p.sp * 0.011, 3, 38), dl = Math.hypot(v.x, v.z) || 1; p.hitCd = 0.7;
        const res = t.receiveHit(null, { dmg, kb: clamp(p.sp * 0.7, 2, 10), stun: 0.5, hs: 0.06, knock: dmg > 14 }, { x: v.x / dl, z: v.z / dl }, { unblockable: true });
        if (res !== 'ignore') { A.fx.play('heavy', 0.9); A.fx.spark((p.cp || p.p).x, (p.cp || p.p).y, (p.cp || p.p).z, v.x / dl, v.z / dl, 16, [1, 0.6, 0.3], 7); A.fx.ring(t.pos.x, t.pos.y + 1.1, t.pos.z, 1.3, 0xff9a5a); this.shakeFor(t, null, 0.3); }
        break;
      }
    }
  }
  // ---- fixed step ----
  step(dt, level) {
    this.t += dt; const P = this.player; if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }
    const live = this.a.mode === 'explore' && !this.a.ui.modalOpen();   // fighters hold still while you edit or a sheet is open
    for (const a of this.actors) { if (a.brain && P && live) a.brain.update(dt, P); else if (a.brain) { a.intent.mx = a.intent.mz = 0; a.wantBlock = false; } if (a.brain) a.setBlock(a.wantBlock); a.step(dt, level); }
    for (const e of this.enemies()) { if (e.state === 'dead' && this.t - (e.koAt || 0) > 5) { const h = e.home; e.respawn(h[0], h[1], h[2]); e.brain && (e.brain.aggro = false, e.brain.mode = 'idle'); } }
    this.propDamage(dt);
    if (P && P.lock && (!P.lock.alive || P.lock.pos.distanceTo(P.pos) > 30)) P.lock = null;
    if (P) { P.faceTarget = !!P.lock; P.target = P.lock; if (P.lock) P.combatT = Math.max(P.combatT, 1); }
  }
}
