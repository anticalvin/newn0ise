// Actor: one body for the player and every fighter. Movement uses constant-acceleration toward a target velocity (not exponential lerps),
// coyote time + jump buffering + variable jump height, lean into turns, and a data-driven combat state machine
// (free / attack / hit / down / getup / dodge / dead). Everything runs on the fixed 60 Hz step; render() interpolates.
import * as THREE from 'three';
import { Character } from './character.js';
import { clamp } from './util.js';
import { TUNE } from './tune.js';

const TAU = Math.PI * 2, wrap = a => a - TAU * Math.round(a / TAU), sstep = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export const ATTACKS = {
  jab:   { anim: 'jab',   dur: 0.34, hit: [0.09, 0.17], cancel: 0.19, dmg: 6,  kb: 2.4, stun: 0.26, reach: 1.25, lunge: 3.2, hs: 0.05, trauma: 0.14, limb: 'handL', snd: 'punch', next: { p: 'cross', k: 'front' } },
  cross: { anim: 'cross', dur: 0.4,  hit: [0.11, 0.2],  cancel: 0.23, dmg: 8,  kb: 3.4, stun: 0.3,  reach: 1.35, lunge: 3.6, hs: 0.06, trauma: 0.2,  limb: 'handR', snd: 'punch', next: { p: 'hook', k: 'round' } },
  hook:  { anim: 'hook',  dur: 0.5,  hit: [0.15, 0.26], cancel: 0.3,  dmg: 12, kb: 5.4, stun: 0.45, reach: 1.35, lunge: 4.0, hs: 0.09, trauma: 0.32, limb: 'handL', snd: 'heavy', knockCombo: 3, next: { k: 'round' } },
  front: { anim: 'front', dur: 0.46, hit: [0.14, 0.24], cancel: 0.26, dmg: 10, kb: 6.5, stun: 0.38, reach: 1.6,  lunge: 2.6, hs: 0.07, trauma: 0.24, limb: 'footL', snd: 'kick',  next: { p: 'cross', k: 'round' } },
  round: { anim: 'round', dur: 0.62, hit: [0.2, 0.33],  cancel: 0.99, dmg: 16, kb: 8.5, stun: 0.6,  reach: 1.7,  lunge: 3.4, hs: 0.12, trauma: 0.45, limb: 'footR', snd: 'heavy', knock: true, next: {} },
  airkick: { anim: 'airkick', dur: 0.5, hit: [0.08, 0.4], cancel: 0.99, dmg: 11, kb: 7, stun: 0.42, reach: 1.5, lunge: 0, hs: 0.07, trauma: 0.28, limb: 'footL', snd: 'kick', next: {}, air: true },
};

export class Actor {
  constructor(app, o) {
    this.app = app; this.kind = o.kind || 'brawler'; this.name = o.name || this.kind; this.isPlayer = !!o.player; this.team = o.player ? 'p' : 'e'; this.scale = o.scale || 1;
    this.pos = new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0); this.prev = this.pos.clone(); this.vel = new THREE.Vector3(); this.yaw = o.yaw || 0; this.prevYaw = this.yaw;
    this.onGround = true; this.wasGround = true; this.depth = 0; this.speed = 0; this.vf = 0; this.vs = 0;
    this.maxHp = o.hp || 100; this.hp = this.maxHp; this.power = o.power || 1; this.speedMul = o.speedMul || 1; this.armor = !!o.armor; this.dummy = !!o.dummy;
    this.state = 'free'; this.stateT = 0; this.act = null; this.actT = 0; this.atk = null; this.atkName = null; this.atkT = 0; this.hitSet = new Set(); this.queued = null; this.queuedT = 0;
    this.lastAtk = null; this.lastEnd = -9; this.lastDodge = -9; this.comboN = 0; this.comboT = 0; this.blocking = false; this.wantBlock = false; this.blockT = 0; this.flinchT = 0; this.inv = 0; this.freeze = 0;
    this.leanF = 0; this.leanR = 0; this.landT = 0; this.coyote = 0; this.jumpBuf = 0; this.jumpHeld = false; this.combatT = 0; this.stance = 0; this.hurtT = 0; this.deadT = 0; this.downDur = 1; this.hitAnim = 'hitF';
    this.intent = { mx: 0, mz: 0, run: false, analog: false }; this.target = null; this.faceTarget = false; this.aimYaw = 0; this.aimDist = 0; this.dodgeDir = new THREE.Vector3(); this.brain = null; this.lastYawStep = this.yaw;
    this.character = new Character(app.shared, { ...o.palette, scale: this.scale }); this.root = this.character.root; app.scene.add(this.root);
    this.character.onStep = (side, sp) => this.footstep(side, sp);
    this.decks = []; this.circles = []; this.rpos = this.pos.clone(); this.ryaw = this.yaw; this.id = 'a' + (Actor.n = (Actor.n || 0) + 1);
  }
  get alive() { return this.state !== 'dead'; }
  // compatibility with the old Player: decks (walkable plank rectangles) and circles (solid posts) are only used when Rapier is not ready
  groundAt(x, z) { let g = this.app.terrain.hAt(x, z); for (const d of this.decks) if (Math.abs(x - d.x) < d.hx && Math.abs(z - d.z) < d.hz && this.pos.y > d.y - 0.9) g = Math.max(g, d.y); return g; }
  footstep(side, sp) {
    const a = this.app, x = this.pos.x + Math.cos(this.yaw) * 0.12 * -side, z = this.pos.z - Math.sin(this.yaw) * 0.12 * -side;
    if (this.depth < 0.15 && this.pos.y < 2.4 && this.pos.y > a.water.level + 0.02) a.terrain.stamp(x, z, 0.16 * this.scale, 0.9);
    if (a.stepFx) a.stepFx(this, x, z, sp);
    if (a.fx && (this.isPlayer || a.player && Math.hypot(this.pos.x - a.player.pos.x, this.pos.z - a.player.pos.z) < 30)) a.fx.play(a.ground.materialAt(this.pos.x, this.pos.z) === 'sand' ? 'stepSand' : 'step', (this.isPlayer ? 0.7 : 0.5) * Math.min(1.3, 0.5 + sp * 0.12), this.isPlayer ? null : this.pos);
    if (sp > 4.2 && this.depth < 0.2) a.fx.dustPuff(x, this.pos.y, z, 1, 0.35, [0.78, 0.66, 0.5], 0.8);
    if (this.depth > 0.2 && sp > 1) a.water.splash(x, z, 0.35 * this.scale);
  }
  // ----- commands -----
  setBlock(b) { const nb = b && (this.state === 'free'); if (nb && !this.blocking) this.blockT = 0; this.blocking = nb; }
  tryJump(edge, held) { if (edge) this.jumpBuf = TUNE.jbuf; this.jumpHeld = held; }
  pickTarget(maxD = 4, cone = 1.15) {
    if (this.lock && this.lock.alive) return this.lock; let best = null, bs = 1e9; const f = [Math.sin(this.yaw), Math.cos(this.yaw)];
    const mv = this.intent.mx * this.intent.mx + this.intent.mz * this.intent.mz > 0.05 ? [this.intent.mx, this.intent.mz] : f, ml = Math.hypot(mv[0], mv[1]) || 1;
    for (const t of this.app.combat.actors) { if (t === this || t.team === this.team || !t.alive) continue; const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz); if (d > maxD || d < 0.01) continue;
      const ang = Math.acos(clamp((dx * mv[0] + dz * mv[1]) / (d * ml), -1, 1)); if (ang > cone) continue; const s = d + ang * 1.5; if (s < bs) { bs = s; best = t; } }
    return best;
  }
  tryAttack(kind) {   // kind 'p' punch | 'k' kick
    if (!this.alive || this.state === 'down' || this.state === 'hit' || this.state === 'getup') return false;
    if (this.state === 'attack') { this.queued = kind; this.queuedT = 0.4; return true; }
    if (this.state === 'dodge' && this.stateT < 0.3) { this.queued = kind; this.queuedT = 0.3; return true; }
    let name; const gr = this.app.combat.t - this.lastEnd < 0.2 && this.lastAtk && ATTACKS[this.lastAtk].next[kind];
    if (!this.onGround) { if (kind !== 'k') return false; name = 'airkick'; } else name = gr || (kind === 'p' ? 'jab' : 'front');
    this.startAttack(name); return true;
  }
  startAttack(name) {
    const d = ATTACKS[name]; this.state = 'attack'; this.atk = d; this.atkName = name; this.atkT = 0; this.stateT = 0; this.hitSet.clear(); this.queued = null; this.blocking = false; this.combatT = 4;
    const tg = this.faceTarget && this.target && this.target.alive ? this.target : this.pickTarget(3.9, 1.2);
    if (tg) { this.aimYaw = Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z); this.aimDist = Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z); }
    else if (this.intent.mx * this.intent.mx + this.intent.mz * this.intent.mz > 0.05) { this.aimYaw = Math.atan2(this.intent.mx, this.intent.mz); this.aimDist = 99; } else { this.aimYaw = this.yaw; this.aimDist = 99; }
    this.app.fx.play('whoosh', this.isPlayer ? 1 : 0.5);
  }
  tryDodge(dx, dz) {
    if (!this.alive || !(this.state === 'free' || (this.state === 'attack' && this.atkT > this.atk.dur * 0.7) || (this.state === 'dodge' && false))) return false;
    if (this.app.combat.t - this.lastDodge < 0.45) return false; this.lastDodge = this.app.combat.t;
    let l = Math.hypot(dx, dz); if (l < 0.1) { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); l = 1; } this.dodgeDir.set(dx / l, 0, dz / l);
    this.state = 'dodge'; this.stateT = 0; this.inv = 0.3; this.blocking = false; this.queued = null; this.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.z); this.combatT = 3; this.app.fx.play('whoosh', 0.7); this.app.fx.dustPuff(this.pos.x, this.pos.y, this.pos.z, 4, 0.7); return true;
  }
  // ----- being hit -----
  receiveHit(from, atk, dir, extra = {}) {
    if (!this.alive || this.inv > 0) return 'ignore';
    if (this.state === 'dodge' && this.stateT < 0.32) return 'dodge';
    const f = [Math.sin(this.yaw), Math.cos(this.yaw)], frontal = -(dir.x * f[0] + dir.z * f[1]) > 0.25, A = this.app, dmgBase = (atk.dmg || 5) * (from && from.power || 1) * (from && from.isPlayer ? TUNE.dmg : TUNE.foeDmg) * (this.isPlayer && TUNE.god ? 0 : 1);
    if (this.blocking && this.state === 'free' && frontal && !extra.unblockable) {
      if (this.blockT < 0.17 && from && from.state === 'attack') { if (from.stun) from.stun(0.6); return 'parry'; }
      this.hp -= dmgBase * 0.1; this.vel.x += dir.x * atk.kb * TUNE.kb * 0.4; this.vel.z += dir.z * atk.kb * TUNE.kb * 0.4; this.flinchT = 0.2; this.freeze = (atk.hs || 0.05) * TUNE.hitstop * 0.8; this.hurtT = 1.5; this.combatT = 4; this.checkDeath(dir); return 'block';
    }
    this.hp -= dmgBase; if (this.isPlayer) this.app.fx.play('hurt', 0.9); this.hurtT = 2.5; this.combatT = 4; this.flash = 0.7; this.queued = null; this.blocking = false;
    if (this.dummy) this.hp = Math.max(1, this.hp);
    const comboKnock = atk.knockCombo && from && from.comboN >= atk.knockCombo, knock = atk.knock || extra.knock || comboKnock || this.hp <= 0;
    const armored = this.armor && !knock && dmgBase < 14 * (from && from.power || 1);
    if (this.state === 'attack' && !armored) this.cancelAttack();
    if (knock) { this.startDown(dir, atk.kb * TUNE.kb * 1.15, this.hp <= 0); }
    else if (!armored) {
      this.state = 'hit'; this.stateT = 0; this.stunT = atk.stun; const d = dir.x * f[0] + dir.z * f[1], l = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw);
      this.hitAnim = atk.dmg >= 11 ? 'hitHeavy' : d < -0.45 ? 'hitF' : d > 0.45 ? 'hitB' : l < 0 ? 'hitL' : 'hitR'; this.vel.x = dir.x * atk.kb * TUNE.kb; this.vel.z = dir.z * atk.kb * TUNE.kb;
      this.yaw += wrap(Math.atan2(-dir.x, -dir.z) - this.yaw) * 0.35;
    } else { this.vel.x += dir.x * atk.kb * TUNE.kb * 0.25; this.vel.z += dir.z * atk.kb * TUNE.kb * 0.25; this.flinchT = 0.15; }
    this.freeze = (atk.hs || 0.05) * TUNE.hitstop; this.checkDeath(dir); return knock ? 'knock' : armored ? 'armor' : 'hit';
  }
  stun(t) { if (this.state === 'attack') this.cancelAttack(); if (this.alive && this.state !== 'down') { this.state = 'hit'; this.stateT = 0; this.stunT = t; this.hitAnim = 'hitHeavy'; this.freeze = 0.1; } }
  cancelAttack() { this.atk = null; this.queued = null; this.state = 'free'; }
  startDown(dir, kb, ko) {
    this.state = ko ? 'dead' : 'down'; this.stateT = 0; this.downDur = 1.05; this.deadT = 0; this.blocking = false;
    this.vel.x = dir.x * kb; this.vel.z = dir.z * kb; this.vel.y = 3.2; this.onGround = false; this.yaw = Math.atan2(-dir.x, -dir.z);
    this.app.fx.play(ko ? 'ko' : 'thud', 0.9); this.app.fx.dustPuff(this.pos.x, this.pos.y, this.pos.z, 7, 1.1, [0.78, 0.66, 0.5], 2.2);
    if (ko) { this.app.combat.onKO(this); this.app.slowmo(0.28, 0.45); }
  }
  checkDeath(dir) { if (this.hp <= 0 && this.alive && !this.dummy) { this.hp = 0; this.startDown(dir || { x: 0, z: 1 }, 5, true); } }
  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }
  respawn(x, z, yaw = 0, y) { this.hp = this.maxHp; this.state = 'free'; this.stateT = 0; this.pos.set(x, y ?? this.app.terrain.hAt(x, z), z); this.prev.copy(this.pos); this.vel.set(0, 0, 0); this.yaw = this.prevYaw = yaw; this.inv = 1.2; this.act = null; this.app.phys.teleport(this); this.flash = 0; }

  // ----- simulation (fixed step) -----
  step(dt, level) {
    this.prev.copy(this.pos); this.prevYaw = this.yaw; const A = this.app, T = A.terrain;
    this.inv = Math.max(0, this.inv - dt); this.flinchT = Math.max(0, this.flinchT - dt); this.hurtT = Math.max(0, this.hurtT - dt); this.combatT = Math.max(0, this.combatT - dt);
    this.queuedT -= dt; if (this.queuedT <= 0) this.queued = null;
    if (this.freeze > 0) { this.freeze -= dt; return; }
    this.stateT += dt; this.blockT += this.blocking ? dt : 0; if (this.state !== 'attack') this.comboT += dt; if (this.comboT > 1.4) this.comboN = 0;
    if (this.blocking && this.state !== 'free') this.blocking = false;
    // ---- state machine ----
    switch (this.state) {
      case 'attack': {
        const d = this.atk; this.atkT += dt; const t = this.atkT;
        if (t < 0.16) this.yaw += wrap(this.aimYaw - this.yaw) * (1 - Math.exp(-28 * dt));
        if (d.air) { this.vel.y = Math.min(this.vel.y, -1.5 - t * 2); const f = 4.2; this.vel.x += (Math.sin(this.yaw) * f - this.vel.x) * Math.min(1, dt * 10); this.vel.z += (Math.cos(this.yaw) * f - this.vel.z) * Math.min(1, dt * 10); if (this.onGround && t > 0.12) { this.atkT = Math.max(this.atkT, d.hit[1] + 0.01); } }
        else if (t < 0.12 && d.lunge > 0 && this.aimDist > d.reach * 0.7) { const sp = Math.min(d.lunge, (this.aimDist - d.reach * 0.6) / 0.1) * (1 - t / 0.12 * 0.35); this.vel.x = Math.sin(this.yaw) * sp; this.vel.z = Math.cos(this.yaw) * sp; }
        if (t >= d.hit[0] && t <= d.hit[1]) A.combat.strike(this);
        if (this.queued && t >= d.cancel) { const nx = d.next[this.queued]; if (nx) { this.comboT = 0; this.startAttack(nx); break; } this.queued = null; }
        if (t >= d.dur) { this.lastAtk = this.atkName; this.lastEnd = A.combat.t; this.atk = null; this.state = 'free'; }
        break; }
      case 'hit': if (this.stateT >= this.stunT) this.state = 'free'; break;
      case 'down': if (this.stateT >= this.downDur && this.onGround) { this.state = 'getup'; this.stateT = 0; } break;
      case 'getup': if (this.stateT >= 0.75) { this.state = 'free'; this.inv = 0.4; } break;
      case 'dodge': { const k = 1 - this.stateT / 0.5; const sp = TUNE.dodgeSpeed * Math.max(0, k) ** 1.2; this.vel.x = this.dodgeDir.x * sp; this.vel.z = this.dodgeDir.z * sp; if (this.stateT >= 0.5) { this.state = 'free'; if (this.queued) { const q = this.queued; this.queued = null; this.tryAttack(q); } } break; }
      case 'dead': this.deadT += dt; break;
    }
    // ---- locomotion ----
    const it = this.intent, st = this.state, free = st === 'free', mag = Math.min(1, Math.hypot(it.mx, it.mz)), dirx = mag > 0.01 ? it.mx / Math.hypot(it.mx, it.mz) : 0, dirz = mag > 0.01 ? it.mz / Math.hypot(it.mx, it.mz) : 0;
    this.depth = clamp(level - this.pos.y, 0, 3);
    let tgtSpeed = 0;
    if (mag > 0.04) tgtSpeed = it.analog ? (mag < 0.6 ? TUNE.walk * mag / 0.6 : TUNE.walk + (TUNE.run - TUNE.walk) * sstep((mag - 0.6) / 0.35)) : (it.run ? TUNE.run : TUNE.walk);
    let mul = this.speedMul * (1 - clamp((this.depth - 0.25) / 1.4, 0, 0.62));
    if (this.blocking) mul *= 0.45; if (this.stance > 0.5 && free) mul *= (this.isPlayer ? 0.78 : 1); if (st === 'attack') mul *= 0.12;
    const canMove = free || st === 'attack';
    const wx = canMove ? dirx * tgtSpeed * mul : 0, wz = canMove ? dirz * tgtSpeed * mul : 0;
    if (st === 'free' || st === 'attack' || st === 'hit' || st === 'down' || st === 'getup' || st === 'dead') {
      const ax = wx - this.vel.x, az = wz - this.vel.z, al = Math.hypot(ax, az);
      const rev = (this.vel.x * wx + this.vel.z * wz) < 0 ? 1.5 : 1;
      let acc = this.onGround ? ((mag > 0.04 && canMove) ? TUNE.accel : TUNE.decel) * rev : TUNE.airAccel;
      if (st === 'hit' || st === 'down' || st === 'dead') acc = this.onGround ? 11 : 1.5;   // slide: knockback carries
      if (st === 'attack' && this.atkT < 0.12) acc = 0;
      const m = Math.min(al, acc * dt); if (al > 1e-5) { this.vel.x += ax / al * m; this.vel.z += az / al * m; }
    }
    // deep water / world edge limits
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt, gN = T.hAt(nx, nz), g = T.hAt(this.pos.x, this.pos.z);
    if (this.pos.y < level + 0.4 && level - gN > 1.9 && level - gN > level - g) { this.vel.x *= 0.05; this.vel.z *= 0.05; }
    if (Math.abs(nx) > 124 || Math.abs(nz) > 124) { this.vel.x = this.vel.z = 0; }
    // jump: coyote + buffer + variable height
    this.coyote = this.onGround ? TUNE.coyote : this.coyote - dt; this.jumpBuf -= dt;
    if (this.jumpBuf > 0 && this.coyote > 0 && free && this.depth < 1.0) { this.vel.y = TUNE.jump; this.onGround = false; this.coyote = 0; this.jumpBuf = 0; this.landT = 0; A.fx.dustPuff(this.pos.x, this.pos.y, this.pos.z, 3, 0.5); A.fx.play('jump', this.isPlayer ? 0.7 : 0.3, this.isPlayer ? null : this.pos); }
    if (this.onGround && this.vel.y <= 0) this.vel.y = -2; else this.vel.y -= (this.vel.y > 0 ? (this.jumpHeld ? TUNE.gUp : TUNE.gCut) : TUNE.gDown) * dt; this.vel.y = Math.max(this.vel.y, -34);
    const vyBefore = this.vel.y; A.phys.moveActor(this, dt);
    if (this.onGround && !this.wasGround && vyBefore < -3) { this.landT = clamp(-vyBefore / 14, 0.15, 1); if (vyBefore < -3.5) A.fx.play('land', Math.min(1, -vyBefore / 12) * (this.isPlayer ? 0.8 : 0.4), this.isPlayer ? null : this.pos); if (vyBefore < -6) { A.fx.dustPuff(this.pos.x, this.pos.y, this.pos.z, 5, 0.8); A.fx.play('thud', clamp(-vyBefore / 20, 0.2, 0.8)); if (this.isPlayer) A.rig.addTrauma(clamp(-vyBefore / 40, 0, 0.3)); } }
    this.landT *= Math.exp(-7 * dt);
    // ---- facing ----
    const spd = Math.hypot(this.vel.x, this.vel.z), lastYaw = this.yaw;
    if (st === 'free' || st === 'attack' && this.atkT >= 0.16) {
      if (this.faceTarget && this.target && this.target.alive && (this.stance > 0.4 || this.isPlayer === false)) { const ty = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z); this.yaw += wrap(ty - this.yaw) * (1 - Math.exp(-14 * dt)); }
      else if (free && mag > 0.1 && spd > 0.25) { const ty = Math.atan2(dirx, dirz), rate = 17 - 7 * Math.min(1, spd / TUNE.run); this.yaw += wrap(ty - this.yaw) * (1 - Math.exp(-rate * dt)); }
    }
    this.yaw = wrap(this.yaw);
    const yawRate = wrap(this.yaw - lastYaw) / Math.max(dt, 1e-4), fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    this.speed = spd; this.vf = this.vel.x * fx + this.vel.z * fz; this.vs = this.vel.x * lx + this.vel.z * lz;
    const accF = ((this.vf - (this.lastVf || 0)) / Math.max(dt, 1e-4)); this.lastVf = this.vf;
    this.leanF += (clamp(accF / 22, -1, 1) - this.leanF) * Math.min(1, dt * 9); this.leanR += (clamp(-yawRate * spd / 32, -0.8, 0.8) - this.leanR) * Math.min(1, dt * 8);
    // stance: fighting posture while in a fight
    const want = (this.combatT > 0 || this.blocking || st !== 'free') ? 1 : 0; this.stance += (want - this.stance) * Math.min(1, dt * 6);
    if (this.dummy && this.hp < this.maxHp) { this.hp = Math.min(this.maxHp, this.hp + 14 * dt * (this.hurtT > 0 ? 0 : 1)); }
    if (this.isPlayer && this.hurtT <= 0 && this.combatT <= 0 && this.hp < this.maxHp && this.alive) this.hp = Math.min(this.maxHp, this.hp + 4 * dt);
  }
  // ----- render (variable rate) -----
  render(alpha, dt) {
    this.rpos.lerpVectors(this.prev, this.pos, alpha); let dy = wrap(this.yaw - this.prevYaw); this.ryaw = this.prevYaw + dy * alpha;
    const c = this.character; let act = null, t = 0, hold = false;
    switch (this.state) {
      case 'attack': act = this.atk.anim; t = this.atkT; break;
      case 'hit': act = this.hitAnim; t = this.stateT; break;
      case 'down': case 'dead': act = 'down'; t = this.stateT; hold = true; break;
      case 'getup': act = 'getup'; t = this.stateT; break;
      case 'dodge': act = 'dodge'; t = this.stateT; break;
      default: if (this.flinchT > 0) { act = 'blockHit'; t = 0.2 - this.flinchT; } else if (this.flinchT <= 0 && this.armorFlinch) act = null;
    }
    if (this.poseOverride) { act = this.poseOverride.act; t = this.poseOverride.t; hold = !!this.poseOverride.hold; }
    this.root.position.copy(this.rpos); this.root.position.y -= clamp(this.depth - 0.45, 0, 0.5) * 0.12 * this.scale; this.root.rotation.y = this.ryaw;
    const adt = this.freeze > 0 ? dt * 0.03 : dt;
    c.update(adt, { speed: this.speed, vf: this.vf, vs: this.vs, onGround: this.onGround, vy: this.vel.y, depth: this.depth, leanF: this.leanF, leanR: this.leanR, stance: this.stance, act, actT: t, actHold: hold, blocking: this.blocking && this.state === 'free', landT: this.landT, aim: this.aim && this.state === 'free' });
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 5); c.setFlash(this.flash); }
  }
  dispose() { this.app.scene.remove(this.root); this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.app.phys.removeActor(this); }
}
