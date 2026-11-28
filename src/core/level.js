// Level creator runtime for Core: the empty "Blank" arena, the Play runtime that turns entity records into live physics, fighters, pickups and cars (and takes
// it all away again on Stop, leaving the records untouched), and .n0level.json import/export. Entities stay the single source of truth.
import * as THREE from 'three';
import { Car } from './vehicle.js';
import { Guns, GUNS } from './guns.js';
import { gridTexture, kindOf, LEVEL_PREFABS } from './levelkit.js';
import { clamp } from './util.js';

const D2R = Math.PI / 180;

// ---------- the empty space: a 248 m grid floor, a dark void under it, no island, water, palms or grass ----------
export function levelArena(app) {
  const t = app.terrain, env = app.env, tide0 = env.p.tide; t.h.fill(0); t.paint.fill(0); t.dirtyH = t.dirtyP = true; t.rev++; t.flush();
  const tex = gridTexture().clone(); tex.needsUpdate = true; tex.repeat.set(248, 248);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(248, 248).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8b9199, map: tex, roughness: 0.95, metalness: 0 })); floor.position.y = 0.004; floor.receiveShadow = true; floor.name = 'level-floor';
  const void_ = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0b0d })); void_.position.y = -0.4;
  app.scene.add(floor, void_);
  const vis = [app.water.mesh, app.grass.mesh, app.palms.mesh, t.mesh, app.sand.mesh], was = vis.map(m => m.visible); vis.forEach(m => { m.visible = false; });
  env.p.tide = -60; app.level = true;   // no water anywhere: the sea level sits far below the floor
  return () => { app.scene.remove(floor, void_); floor.geometry.dispose(); floor.material.dispose(); tex.dispose(); void_.geometry.dispose(); void_.material.dispose(); vis.forEach((m, i) => { m.visible = was[i]; }); env.p.tide = tide0; app.level = false; };
}

// ---------- play runtime ----------
export class Runtime {
  constructor(app) {
    this.a = app; this.props = []; this.actors = []; this.cars = []; this.pick = []; this.hidden = []; this.t = 0;
    const E = app.entities; let spawn = null;
    for (const r of E.recs.values()) {
      if (r.parent || !LEVEL_PREFABS.has(r.prefab)) continue; const o = E.rt.get(r.id).object, k = kindOf(r.prefab), [x, y, z] = r.transform.position, yaw = r.transform.rotation[1];
      if (r.prefab.startsWith('prop.')) { o.visible = false; this.hidden.push(o); const rad = k === 'boulder' ? +r.parameters.r || 1.1 : k === 'crate' ? 0.5 : 0.45, b = app.boulders.add(x, y + rad * (k === 'boulder' ? 1 : 1.05) + 0.02, z, rad, undefined, k);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.transform.rotation[0], yaw, r.transform.rotation[2], 'YXZ')); if (b.body) b.body.setRotation(q, true); b.cq.copy(q); b.pq.copy(q); b.q.copy(q); b.fromEntity = r.id; this.props.push(b); }
      else if (r.prefab.startsWith('actor.')) { o.visible = false; this.hidden.push(o); const e = app.combat.add(k, x, z, yaw, { y }); e.pos.y = y; e.prev.copy(e.pos); app.phys.teleport(e); e.fromEntity = r.id; this.actors.push(e); }
      else if (r.prefab === 'vehicle.car') { o.visible = false; this.hidden.push(o); this.cars.push(new Car(app, x, y, z, yaw, r.parameters.color)); }
      else if (r.prefab.startsWith('pickup.')) this.pick.push({ r, o, k, on: true, back: 0 });
      else if (r.prefab === 'spawn.player') { spawn = r; o.visible = false; this.hidden.push(o); }
    }
    const P = app.player; this.before = { spawn: app.spawn.slice() };
    if (spawn) { const [sx, sy, sz] = spawn.transform.position, sw = spawn.transform.rotation[1]; app.spawn = [sx, sz, sw, sy]; }
    else if (app.level) app.spawn = [0, 0, Math.PI, 0];
    if (spawn || app.level) { P.respawn(app.spawn[0], app.spawn[1], app.spawn[2], app.spawn[3] ?? undefined); app.rig.setView(app.spawn[2] + Math.PI, 0.22, 5.2); app.rig.snap(); }
    P.lock = null; app.guns.reset();
  }
  step(dt) {
    this.t += dt; const A = this.a, P = A.player, g = P && P.alive && !A.driving;
    for (const k of this.pick) {
      const s = k.o.userData.spin; if (s) { s.rotation.y += dt * 1.6; s.position.y = 0.7 + Math.sin(this.t * 2.2) * 0.08; }
      if (!k.on) { if (k.back && this.t > k.back) { k.on = true; k.o.visible = true; } continue; }
      if (!g) continue; const dx = P.pos.x - k.o.position.x, dz = P.pos.z - k.o.position.z; if (Math.hypot(dx, dz) > 1.1 || Math.abs(P.pos.y + 0.8 - (k.o.position.y + 0.7)) > 1.6) continue;
      if (k.k === 'health') { if (P.hp >= P.maxHp) continue; P.hp = Math.min(P.maxHp, P.hp + 40); A.ui.toast('+40 health'); k.back = this.t + 18; }
      else if (k.k === 'ammo') { if (!Object.keys(A.guns.inv).length) continue; A.guns.addAmmo(1.5); A.ui.toast('Ammo'); k.back = this.t + 18; }
      else { const fresh = A.guns.give(k.k); A.ui.toast(fresh ? GUNS[k.k].name + ' picked up' : GUNS[k.k].name + ' ammo'); k.back = 0; }
      A.fx.play('pickup', 1); k.on = false; k.o.visible = false; A.fx.ring(k.o.position.x, k.o.position.y + 0.7, k.o.position.z, 1.1, 0xffe9b0);
    }
    for (const b of this.props) if (b.body && b.p.y < -40) { b.body.setTranslation({ x: 0, y: 5, z: 0 }, true); b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
  }
  dispose() {
    const A = this.a; A.grab.release(); if (A.driving) A.lv.exitCar(); for (const c of this.cars) c.dispose(); for (const b of this.props) A.boulders.remove(b);
    for (const e of this.actors) A.combat.remove(e); for (const o of this.hidden) o.visible = true;
    for (const k of this.pick) { k.o.visible = true; if (k.o.userData.spin) { k.o.userData.spin.rotation.y = 0; k.o.userData.spin.position.y = 0.7; } } A.guns.reset(); A.spawn = this.before.spawn;
  }
}

export function createLevel(app) {
  const guns = app.guns = new Guns(app), L = { rt: null, guns };
  app.driving = null;
  L.play = () => { if (app.mode !== 'explore') app.setMode('explore'); };
  L.stop = () => { if (app.mode !== 'edit') app.setMode('edit'); };
  L.wanted = false;
  L.start = () => { if (L.rt) return; if (!app.phys.ready && !app.phys.failed) { L.wanted = true; return; } L.wanted = false; L.rt = new Runtime(app); };
  L.end = () => { L.wanted = false; if (L.rt) { L.rt.dispose(); L.rt = null; } };
  L.enterCar = car => { const P = app.player; app.driving = car; app.session.enter('vehicle'); car.driven = true; P.hidden = true; P.frozen = true; P.root.visible = false; if (P.col) { P.colGroups = P.col.collisionGroups(); P.col.setSensor(true); P.col.setCollisionGroups(0); } app.grab.release();   /* the player rides inside the car: no contact with anything */ app.rig.tDist = 8.5; app.rig.tPitch = 0.3; app.ui.say('W/S drive · A/D steer · Space brake · F exit', 4000); };
  L.exitCar = () => { const P = app.player, car = app.driving; if (!P || !car) { app.driving = null; return; } const q = car.cq, rx = 1 - 2 * (q.y * q.y + q.z * q.z), rz = -2 * (q.x * q.z - q.w * q.y);
    app.driving = null; app.session.leave('vehicle'); car.driven = false; car.input.thr = car.input.str = 0; P.hidden = false; P.frozen = false; P.root.visible = true; if (P.col) { P.col.setSensor(false); if (P.colGroups !== undefined) P.col.setCollisionGroups(P.colGroups); }
    P.pos.set(car.cp.x + rx * 2.3, car.cp.y + 0.6, car.cp.z + rz * 2.3); P.prev.copy(P.pos); P.vel.set(0, 0, 0); app.phys.teleport(P); app.rig.tDist = 5.2; app.rig.tPitch = 0.26; };
  L.nearCar = () => { const P = app.player; if (!L.rt || !P || !P.alive) return null; for (const c of L.rt.cars) if (Math.hypot(c.cp.x - P.pos.x, c.cp.z - P.pos.z) < 3.4 && Math.abs(c.cp.y - P.pos.y) < 3) return c; return null; };
  L.interact = () => { if (app.driving) { L.exitCar(); return true; } const c = L.nearCar(); if (c) { L.enterCar(c); return true; } return false; };
  L.saveFile = () => { const b = new Blob([JSON.stringify(L.exportDoc(), null, 1)], { type: 'application/json' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = (app.name || 'level').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.n0level.json'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
  L.openFile = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,.n0level.json,application/json'; i.onchange = async () => { const f = i.files[0]; if (!f) return; try { const r = app.core.exec({ cmd: 'level.load', doc: JSON.parse(await f.text()) }); app.ui.toast(r.msg); } catch (e) { app.ui.toast('That file is not valid JSON.'); } }; i.click(); };
  // ---- .n0level.json ----
  L.exportDoc = () => { app.dyn.sync(); return { format: 'n0ise.level', v: 2, ents: app.entities.serialize() }; };
  L.importDoc = doc => {
    if (!doc || doc.format !== 'n0ise.level' || !Array.isArray(doc.ents)) return { ok: false, msg: 'This is not a .n0level.json file (expected {"format":"n0ise.level","ents":[…]}).' };
    const specs = [], probs = [];
    for (const r of doc.ents) { try { specs.push(doc.v === 1 ? fromV1(r, app) : fromRec(r)); } catch (e) { probs.push((r && r.id || '?') + ': ' + e.message); } }
    return { ok: true, specs, probs };
  };
  return L;
}

// a v2 file holds Core entity records as they are
const fromRec = r => { if (!r || !r.prefab) throw new Error('no prefab'); return { id: r.id, prefab: r.prefab, parent: r.parent || null, transform: r.transform, parameters: r.parameters, components: r.components, tags: r.tags }; };
// a v1 file (the first prototype): centre-origin pieces with degrees and full-size scale
function fromV1(r, app) {
  const p = (r.p || [0, 0, 0]).map(Number), d = (r.r || [0, 0, 0]).map(n => Number(n) * D2R), s = (r.s || [1, 1, 1]).map(n => Math.max(0.05, Number(n) || 1)), pr = r.prefab, base = { id: r.id && String(r.id), transform: { position: p, rotation: d, scale: [1, 1, 1] }, tags: ['imported'] };
  if (['build.block', 'build.pillar', 'build.ramp', 'build.cylinder', 'build.sphere'].includes(pr)) { base.transform.position = [p[0], p[1] - s[1] / 2, p[2]]; return { ...base, prefab: pr, parameters: { size: s, ...(r.params && r.params.color ? { color: r.params.color } : {}) } }; }
  if (pr === 'build.wall') { base.transform.position = [p[0], p[1] - s[1] / 2, p[2]]; return { ...base, prefab: 'build.wall', parameters: { length: s[0], height: s[1], thickness: s[2] } }; }
  if (pr === 'build.floor') { base.transform.position = [p[0], p[1] - s[1] / 2, p[2]]; return { ...base, prefab: 'build.floor', parameters: { width: s[0], depth: s[2] } }; }
  if (pr === 'build.stairs') { base.transform.position = [p[0], p[1] - s[1] / 2, p[2]]; return { ...base, prefab: 'build.stairs', parameters: { width: s[0], length: s[2], height: s[1], steps: clamp(Math.ceil(s[1] / 0.28), 3, 24) } }; }
  if (LEVEL_PREFABS.has(pr)) { const lift = { 'prop.crate': 0.5, 'prop.barrel': 0.5, 'prop.boulder': +(r.params && r.params.r) || 1.1, 'vehicle.car': 0.05, 'light.point': 2.5 }[pr] ?? (pr.startsWith('pickup.') ? 0.7 : 0);
    const params = { ...(r.params || {}) }; if (pr === 'light.point' && params.i !== undefined) { params.intensity = params.i; delete params.i; } return { ...base, prefab: pr, transform: { ...base.transform, position: [p[0], p[1] - lift, p[2]] }, parameters: params }; }
  throw new Error('unknown prefab ' + pr);
}

// a small sample level, built through entity.create so it is undoable as one step
export function sampleLevel(app) {
  const core = app.core, n0 = []; const mk = (prefab, x, y, z, ry = 0, parameters = {}) => { const r = core.exec({ cmd: 'entity.create', prefab, position: [x, y, z], rotation: [0, ry * D2R, 0], parameters, tags: ['sample'] }); if (r.ok) n0.push(r); else console.warn('sample', prefab, r.msg); return r; };
  mk('spawn.player', 0, 0, 12, 180);
  mk('build.floor', 0, 0.01, -2, 0, { width: 12, depth: 10 });
  mk('build.stairs', -9, 0, -6, 90, { width: 3, length: 5, height: 2, steps: 8 }); mk('build.block', -13.5, 0, -6, 0, { size: [4, 2, 6], color: '#8e98a6' });
  mk('build.ramp', 9, 0, -4, 0, { size: [4, 2, 6] }); mk('build.block', 9, 0, -9.5, 0, { size: [4, 2, 5] });
  mk('build.wall', 0, 0, -7, 0, { length: 8, height: 3, thickness: 0.3 }); mk('build.pillar', 6, 0, 3, 0, { size: [0.8, 4, 0.8] }); mk('build.cylinder', -6, 0, 4, 0, { size: [2, 1, 2] });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) mk('prop.crate', 3 + i * 1.05, 0 + j * 1.0, -2, 0);
  mk('prop.barrel', 5.5, 0, 0); mk('prop.barrel', 6.6, 0, 0.4); mk('prop.boulder', -3, 0, 2, 0, { r: 1.1 });
  mk('pickup.pistol', -2, 0, 8); mk('pickup.rifle', 2, 0, 8); mk('pickup.shotgun', -4, 0, 8); mk('pickup.health', 0, 0, 6); mk('pickup.ammo', 4, 0, 6);
  mk('actor.dummy', -4, 0, -1); mk('actor.brawler', 4, 0, -12, 180); mk('actor.heavy', -9, 2, -6, 90);
  mk('vehicle.car', 13, 0, 8, 90); mk('light.point', 0, 0, -2, 0, { color: '#ffd9a0', intensity: 24 });
  if (n0.length > 1) core.group(n0.length, 'Sample level'); return n0.length;
}
