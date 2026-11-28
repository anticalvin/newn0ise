import { createWorldModes } from './world-modes.js';
import { createEditor } from './editor3d.js';
import { createPost } from './post.js';
import { createShooter } from './weapons.js';
import { DynEnts } from './dynents.js';
import { createLevel, levelArena, sampleLevel } from './level.js';
import { createGame } from './game.js';
import * as THREE from 'three';
import { makeShared } from './glsl.js';
import { Environment } from './env.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { Palms, Grass } from './nature.js';
import { Boulders } from './simlite.js';
import { Phys } from './phys.js';
import { Sand } from './sand.js';
import { buildProps } from './props.js';
import { readWorld, buildWorld, flatSpot, collidersFor } from './world.js';
import { Core, LIMITS } from './core.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { CamRig } from './camera.js';
import { Grab } from './grab.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { TUNE } from './tune.js';
import { initLab, flatArena } from './lab.js';
import { UI } from './ui.js';
import { clamp } from './util.js';
import { connectBridge } from './api.js';
import { Entities } from './entities.js';
import { Assets } from './assets.js';
import { retailPrefab } from './prefabs/retail.js';
import { createTelemetry } from './debug.js';
import { GeoWorld } from './geo/manager.js';
import { OverviewMap } from './geo/map.js';
import { mountWorkspace } from './workspace-ui.js';
import { createFirstLightHost } from './first-light/host.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 6000);
const shared = makeShared();
const env = new Environment(renderer, scene, shared);
const envChildren = scene.children.slice();   // the sky and lights, kept visible when the world takes over
const terrain = new Terrain(shared);
const water = new Water(shared, terrain, env);
const palms = new Palms(shared, terrain), grass = new Grass(shared, terrain);
let player;   // the player is an Actor (actor.js), created once the physics, combat and FX layers exist
const boulders = new Boulders(scene, shared, terrain, water);
const sand = new Sand(shared, terrain);
const phys = new Phys({ terrain, boulders });
scene.add(terrain.mesh, water.mesh, palms.mesh, grass.mesh, sand.mesh);
water.ripples.forEach(r => scene.add(r.m));
boulders.splash = (x, z, s) => { water.splash(x, z, s); if (app.fx) app.fx.play('splash', Math.min(1, s * 0.5)); };
phys.splash = boulders.splash;
phys.onImpact = (x, y, z, n) => { sand.burst(x, y, z, Math.round(n * 3), 1.8, 1.6, 0.5); if (app.fx && n > 3) app.fx.play('thud', Math.min(1, n / 10)); };

// cursor ring draped on the terrain
const ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
const ring = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0xede8df, transparent: true, opacity: 0.9, depthTest: false, fog: false })); ring.renderOrder = 50; ring.frustumCulled = false; ring.visible = false; scene.add(ring);

const app = {
  scene, renderer, camera, canvas, ndcClass: THREE.Vector2, terrain, water, env, palms, grass, boulders, phys, sand, slow: { s: 1, until: 0 },
  name: 'COAST_001', spawn: [0, 0, 0], worlds: [], props: null, propCols: [],
  mode: 'explore', tool: 'raise', R: 10, strength: 0.6, padMode: false,
  cam: { yaw: 1.2, pitch: 0.28, dist: 5.2, target: new THREE.Vector3(), ey: 0 },
  hit: null, stroking: false, grassT: 0, pr: 1, fps: 60,
  // one owner of the keyboard and pointer at a time
  inputOwner() { if (ui.modalOpen()) return 'modal'; if (this.firstLight && this.firstLight.active) return 'firstlight'; if (this.shooter && this.shooter.active) return 'fps'; if (this.geo && this.geo.active) return 'geo'; return this.mode === 'edit' ? 'editor' : 'play'; },
  slowmo(scale, dur) { this.slow.s = clamp(1 - (1 - scale) * TUNE.slowmo, 0.02, 1.5); this.slow.until = performance.now() + dur * 1000; },
  stepFx(a, x, z, sp) { const h = terrain.hAt(x, z); if (h > water.level + 0.1) sand.burst(x, h, z, sp > 4 ? 30 : 18, 0.8 + sp * 0.25, 0.9, 0.18); },
  enterLevel() { this.exitArena(); this.arenaOff = levelArena(this); if (this.editor) this.editor.S.tab = 'level'; },
  exitArena() { if (this.arenaOff) { this.arenaOff(); this.arenaOff = null; } core.noSave = false; },
  focusPoint() { return this.mode === 'explore' ? player.pos.clone() : (this.hit ? this.hit.clone() : this.cam.target.clone()); },
  afterTerrain(force) {
    palms.rebuild(); boulders.wake(); if (this.combat) for (const a of this.combat.actors) { a.pos.y = Math.max(a.pos.y, a.groundAt(a.pos.x, a.pos.z)); phys.teleport(a); }
    if (force) grass.scatter(terrain.seed, terrain); else { clearTimeout(this.grassT); this.grassT = setTimeout(() => grass.scatter(terrain.seed, terrain), 120); }
    terrain.flush();
  },
  snapshotTerrain() { return { h: terrain.h.slice(), p: terrain.paint.slice(), seed: terrain.seed, preset: terrain.preset }; },
  restoreTerrain(s) { if (s.preset && s.preset !== terrain.preset) { terrain.preset = s.preset; this.setPreset(s.preset); } terrain.seed = s.seed; terrain.h.set(s.h); terrain.paint.set(s.p); terrain.dirtyH = terrain.dirtyP = true; terrain.rev++; this.afterTerrain(true); },
  // ---- whole-scene snapshots (used by scene.new and its undo) ----
  snapshot() {
    return { t: this.snapshotTerrain(), base: terrain.base.slice(), env: { ...env.p }, name: this.name, spawn: [...this.spawn], palms: palms.items.map(p => ({ ...p })), boulders: boulders.items.filter(b => b.kind !== 'model').map(b => [b.p.x, b.p.y, b.p.z, b.r, b.seed, b.kind]), actors: this.combat.enemies().map(e => [e.kind, e.home[0], e.home[1], e.home[2]]),
      worlds: this.worlds.map(w => ({ name: w.name, at: [...w.at], doc: w.doc })), ents: entities.serialize(), player: [player.pos.x, player.pos.z, player.yaw] };
  },
  restoreScene(s) {
    core.muted = true;
    try {
      terrain.preset = s.t.preset; terrain.base.set(s.base); this.setPreset(s.t.preset); this.restoreTerrain(s.t); env.set(s.env); this.name = s.name; this.spawn = [...s.spawn];
      palms.items = s.palms.map(p => ({ ...p })); palms.rebuild();
      boulders.items.filter(b => b.kind !== 'model').forEach(b => boulders.remove(b)); s.boulders.forEach(([x, y, z, r, seed, kind]) => boulders.add(x, y, z, r, seed, kind || 'boulder')); this.combat.clearEnemies(); (s.actors || []).forEach(([k, x, z, yw]) => this.combat.add(k, x, z, yw));
      entities.clear(); this.clearWorlds(); s.worlds.forEach(w => { const r = readWorld(w.doc); if (r.ok) this.placeWorld(r.doc, w.at, w.name); });
      entities.load(s.ents || []); this.exitArena(); player.pos.set(s.player[0], 0, s.player[1]); player.yaw = s.player[2]; player.pos.y = player.groundAt(player.pos.x, player.pos.z); player.vel.set(0, 0, 0); phys.teleport(player); this.rig && this.rig.snap();
      this.afterTerrain(true); sand.clear();
    } finally { core.muted = false; }
    ui.render();
  },
  // ---- scene setup ----
  setPreset(preset) {   // the coast has a pier and a shack; blank has nothing but land
    if (this.props) { scene.remove(this.props); this.props.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.props = null; }
    this.propCols = [];
    if (preset === 'coast') { this.props = buildProps(scene, shared, terrain, player); this.propCols = this.props.userData.colliders || []; } else { player.decks.length = 0; player.circles.length = 0; }
    this.refreshColliders();
  },
  refreshColliders() { phys.setProps([...this.propCols, ...this.worlds.flatMap(w => w.colliders), ...(this.entities ? this.entities.colliders() : [])]); },
  // where a building of this size can go: the flattest dry spot near the player (or `at`), with the floor level taken from the highest ground under it
  findSite(w, d, at) {
    const rad = Math.hypot(w, d) / 2 + 1; let x, z;
    if (at) { x = at[0]; z = at[1]; } else { const f = flatSpot(terrain, water.level, player.pos.x + Math.sin(player.yaw) * (rad + 3), player.pos.z + Math.cos(player.yaw) * (rad + 3), rad); if (!f) return null; x = f.x; z = f.z; }
    let hi = -1e9, lo = 1e9; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { const h = terrain.hAt(x + (i / 6 - 0.5) * w, z + (j / 6 - 0.5) * d); hi = Math.max(hi, h); lo = Math.min(lo, h); }
    if (lo < water.level + 0.3) return null; return { x, z, y: hi + 0.02, spread: hi - lo };
  },
  // E/F/RB/Use: open the door or pick up the nearest product
  interact() { if (this.lv && this.mode === 'explore' && this.lv.interact()) return { ok: true, msg: '' }; if (this.geo && this.geo.active) { const r = this.geo.interact(); ui.toast(r.msg); return r; } const r = core.exec({ cmd: 'interact.use' }); ui.toast(r.msg); ui.updHist(); return r; },
  inventory() { const out = []; entities.rt.forEach((rt, id) => { if (rt.rec && rt.rec.state && rt.rec.state.removed) rt.rec.state.removed.forEach(k => { const s = rt.index.get(k); out.push({ store: id, key: k, name: s ? rt.lib.product[s.type].name : 'Item' }); }); }); return out; },
  defaultSpawn() {
    if (terrain.preset === 'blank') return [0, 0, 0];
    let sx = 0; const sz = 8; for (let x = -100; x < 60; x += 0.5) { if (terrain.hAt(x, sz) > 0.75) { sx = x + 1.2; break; } }
    return [sx, sz, -Math.PI / 2];
  },
  // preset 'blank' | 'coast': same engine, same tools, same commands
  newScene(preset, seed = 101) {
    const island = preset === 'island'; if (island) preset = 'blank';   // 'island' is the old flat island (kept for tests and the Combat lab); 'blank' is the empty level space
    core.muted = true;
    try {
      this.exitArena(); this.grab && this.grab.release(); terrain.generate(seed, preset); this.name = preset === 'blank' ? (island ? 'Blank island' : 'Blank level') : 'COAST_001';
      palms.items = []; palms.rebuild(); [...boulders.items].forEach(b => boulders.remove(b)); this.combat.clearEnemies(); entities.clear(); this.clearWorlds(); this.setPreset(preset);
      env.set(preset === 'blank' ? { time: 11, cloud: 0.3, wind: 0.35, windAng: 0, sea: 0.45, tide: 0 } : { time: 17.4, cloud: 0.38, wind: 0.55, windAng: 0, sea: 0.55, tide: 0 });
      if (preset === 'blank' && !island) this.enterLevel();
      if (preset === 'coast') this.populateCoast();
      this.spawn = this.defaultSpawn(); player.respawn(this.spawn[0], this.spawn[1], this.spawn[2]); player.inv = 0; if (preset === 'coast') this.populateLife(); sand.clear(); terrain.stamps = 0; terrain.prints.fill(0); terrain.dirtyF = true;
      this.afterTerrain(true); this.resetCam(); core.hist = []; core.ptr = 0;
    } finally { core.muted = false; }
    this.name && core.emit('New scene'); ui.render(); ui.updHist(); ui.brand();
  },
  populateCoast() {   // palms on the dune/hill margin and a few boulders, deterministic
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let sx0 = 0; for (let x = -100; x < 60; x += 0.5) { if (terrain.hAt(x, 8) > 0.75) { sx0 = x; break; } }
    for (let i = 0, t = 0; i < 46 && t < 900; t++) { const x = -70 + r() * 190, z = -90 + r() * 170, h = terrain.hAt(x, z);
      if (h < 1.5 || h > 7 || terrain.nAt(x, z).y < 0.82 || palms.items.some(p => Math.hypot(p.x - x, p.z - z) < 4.2)) continue;
      if (Math.hypot(x - sx0, z - 8) < 14) continue; palms.add(x, z, 0.8 + r() * 0.6, r() * 6.28); i++; }
    for (const [x, z] of [[8, -14], [-2, -22], [16, 2]]) { const h = terrain.hAt(x, z); if (h > 1.2 && h < 3) palms.add(x, z, 1.0 + r() * 0.3, r() * 6); }
    [[-9, 9, 1.4], [-4, 14, 0.9], [-12, 26, 2.1]].forEach(([x, z, rr]) => boulders.add(x, terrain.hAt(x, z) + rr, z, rr));
  },
  // the coast demo's living layer: crates, barrels, one dummy to hit and one brawler who hits back
  populateLife() {
    const sp = this.spawn, drop = (dx, dz, r, kind, up = 0) => { const x = sp[0] + dx, z = sp[1] + dz, b = boulders.add(x, terrain.hAt(x, z) + (kind === 'boulder' ? r : r * 1.1) + 0.05 + up, z, r, undefined, kind); return b; };
    [[2.2, 14], [2.9, 15.1], [2.5, 14.5, 1.15]].forEach(([dx, dz, up]) => drop(dx, dz, 0.5, 'crate', up || 0));
    drop(2.4, -9, 0.45, 'barrel'); drop(3.2, -10.4, 0.45, 'barrel');
    this.combat.add('dummy', sp[0] + 0.4, sp[1] + 6, Math.PI); this.combat.add('brawler', sp[0] + 11, sp[1] - 9, -Math.PI * 0.6);
  },
  teleport(x, z) { player.pos.set(x, 0, z); player.pos.y = player.groundAt(x, z); player.vel.set(0, 0, 0); phys.teleport(player); this.rig && this.rig.snap(); },
  summary() {
    return { name: this.name, preset: terrain.preset, seed: terrain.seed, env: { ...env.p }, player: [+player.pos.x.toFixed(1), +player.pos.y.toFixed(1), +player.pos.z.toFixed(1)], spawn: this.spawn.map(n => +n.toFixed(1)),
      palms: palms.items.length, boulders: boulders.items.length, entities: entities.size, instances: entities.instanceCount(), inventory: this.inventory().length, worlds: this.worlds.map(w => ({ name: w.name, at: w.at, instances: w.count })), physics: phys.ready ? 'rapier' : phys.failed ? 'fallback (' + phys.error + ')' : 'loading',
      limits: LIMITS, canUndo: core.canUndo(), canRedo: core.canRedo() };
  },
  // ---- .n0world ----
  readWorld(input) { return readWorld(input); },
  placeWorld(doc, at, name) {
    const built = buildWorld(doc, shared);
    let x, z, y;
    if (!built.count) { x = at ? at[0] : player.pos.x; z = at ? at[1] : player.pos.z; y = terrain.hAt(x, z); }   // spawn-only files place nothing
    else if (at) { x = at[0]; z = at[1]; y = this.hightAt(x, z, built.radius); }
    else { const f = flatSpot(terrain, water.level, player.pos.x + 8, player.pos.z, built.radius); if (!f) return null; x = f.x; z = f.z; y = f.y; }
    built.group.position.set(x, y, z); scene.add(built.group);
    const w = { name, doc, at: [x, z], y, group: built.group, notes: built.notes, count: built.count, colliders: [], spawn: built.spawn ? [x + built.spawn.pos[0], z + built.spawn.pos[2], Math.PI + built.spawn.yaw * Math.PI / 180] : null };
    w.colliders = collidersFor(built.group); this.worlds.push(w); this.refreshColliders();
    return w;
  },
  hightAt(x, z, rad) { let hi = -1e9; for (let k = 0; k < 9; k++) hi = Math.max(hi, terrain.hAt(x + (k % 3 - 1) * rad * 0.7, z + (Math.floor(k / 3) - 1) * rad * 0.7)); return hi; },
  removeWorld(w) { const i = this.worlds.indexOf(w); if (i < 0) return; this.worlds.splice(i, 1); scene.remove(w.group); this.refreshColliders(); },
  addWorldEntry(w, i = this.worlds.length) { this.worlds.splice(i, 0, w); scene.add(w.group); this.refreshColliders(); },
  clearWorlds() { this.worlds.slice().forEach(w => this.removeWorld(w)); },
  // ---- editing ----
  undo() { const r = core.undo(); ui.toast(r.msg || 'Undo'); ui.updHist(); },
  redo() { const r = core.redo(); ui.toast(r.msg || 'Redo'); ui.updHist(); },
  setTool(t) { this.tool = t; if (t !== 'grab' && this.grab) this.grab.release(); }, setMode(m) { if (m === this.mode) return; this.mode = m; ui.setMode(m); this.grab && this.grab.release(); if (this.lv) { if (m === 'explore') this.lv.start(); else this.lv.end(); }
    if (m === 'edit') { this.rig.tDist = 46; this.rig.tPitch = 0.78; this.cam.target.set(player.pos.x, terrain.hAt(player.pos.x, player.pos.z), player.pos.z); }
    else { this.rig.tDist = 5.2; this.rig.tPitch = 0.28; this.input.endBrush(); } ui.pad(this.padMode); },
  toggleMode() { if (this.geo && this.geo.active) return this.geo.swapMode(); this.setMode(this.mode === 'explore' ? 'edit' : 'explore'); },
  radius(d) { this.R = clamp(this.R + d * 2, 2, 40); ui.syncRadius(); ui.toast('Radius ' + this.R); },
  zoom(f) { const c = this.cam; if (this.geo && this.geo.god) { c.dist = Math.max(40, Math.min(4.2e6, c.dist * f)); return; } const lo = this.mode === 'explore' ? 2.2 : 8, hi = this.mode === 'explore' ? 14 : 160; if (this.geo && this.geo.active) c.dist = clamp(c.dist * f, lo, hi); else this.rig.zoom(f, lo, hi); },
  orbit(dx, dy) { const c = this.cam; if (this.geo && this.geo.active) { c.yaw -= dx * 0.005; c.pitch = clamp(c.pitch + dy * 0.005, 0.03, 1.45); } else this.rig.orbit(dx, dy); },
  pan(dx, dy) { if (this.mode !== 'edit') return; const c = this.cam, k = c.dist * 0.0016, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    c.target.x = clamp(c.target.x + (-rx * dx + fx * dy) * k, -124, 124); c.target.z = clamp(c.target.z + (-rz * dx + fz * dy) * k, -124, 124); },
  resetCam() { const yaw = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI, pitch = this.mode === 'edit' ? 0.78 : 0.28; if (this.geo && this.geo.active) { this.cam.yaw = yaw; this.cam.pitch = pitch; } else { this.rig.tYaw = yaw; this.rig.tPitch = pitch; } },
  brushStart() {
    if (this.mode !== 'edit') return;
    const t = this.tool; this.updateHit();
    if (t === 'grab') return;
    if (['palm', 'erase', 'boulder', 'crate', 'barrel', 'brawler', 'heavy', 'dummy', 'clear'].includes(t)) { if (!this.hit) return; const h = this.hit; let r;
      if (t === 'palm') r = core.exec({ cmd: 'scatter.add', center: [h.x, h.z], radius: this.R, count: Math.max(1, Math.round(this.R * this.strength * 0.5)) });
      else if (t === 'erase') r = core.exec({ cmd: 'scatter.erase', center: [h.x, h.z], radius: this.R });
      else if (t === 'boulder' || t === 'crate' || t === 'barrel') r = core.exec({ cmd: 'boulder.drop', kind: t, x: h.x, z: h.z });
      else if (t === 'clear') r = core.exec({ cmd: 'actor.clear' }); else r = core.exec({ cmd: 'actor.spawn', kind: t, x: h.x, z: h.z });
      if (r && !r.ok) ui.toast(r.msg); ui.updHist(); return; }
    terrain.beginStroke(); this.stroking = true;
  },
  brushEnd() { if (!this.stroking) return; this.stroking = false; core.commitStroke(this.tool, terrain.endStroke()); ui.updHist(); },
  padBrush(apply, inv) {
    if (this.mode !== 'edit' || !this.padMode) { if (this.padDown) { this.padDown = false; this.brushEnd(); } return; }
    if (apply && !this.padDown) { this.padDown = true; this.input.invert = inv; this.brushStart(); } else if (!apply && this.padDown) { this.padDown = false; this.brushEnd(); } else if (apply) this.input.invert = inv;
  },
  boulderAtCursor() { const f = this.focusPoint(); const r = core.exec({ cmd: 'boulder.drop', x: f.x + (this.mode === 'explore' ? Math.sin(player.yaw) * 3 : 0), z: f.z + (this.mode === 'explore' ? Math.cos(player.yaw) * 3 : 0) }); if (!r.ok) ui.toast(r.msg); ui.updHist(); return r; },
  updateHit() {
    const ndc = new THREE.Vector2(); const pad = this.padMode && !this.input.pointers.size;
    if (pad || !this.input.ptr.in) ndc.set(0, -0.05); else ndc.set(this.input.ptr.x / innerWidth * 2 - 1, -(this.input.ptr.y / innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera); this.hit = terrain.ray(rc.ray.origin, rc.ray.direction);
  },
  snap() { renderer.render(scene, camera); canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'n0ise-core-' + Date.now() + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }); ui.toast('Screenshot saved'); },
  async exportScene() { const d = await core.serialize(), b = new Blob([JSON.stringify(d)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = this.name + '.n0scene'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); ui.toast('Exported ' + this.name + '.n0scene'); },
  // .n0scene (or .json) loads a saved scene; .n0world is validated and placed on the terrain
  async importFile(f) {
    try {
      const text = await f.text(), j = JSON.parse(text);
      if (j && j.format === 'n0ise-world') { const r = core.exec({ cmd: 'world.import', world: j, name: f.name.replace(/\.[^.]+$/, '') }); ui.toast(r.msg); if (r.report) ui.report(r.report, r.ok ? 'Imported' : 'Could not import'); ui.updHist(); return r; }
      await core.load(j); ui.toast('Scene loaded'); ui.render(); ui.updHist(); ui.brand(); return { ok: true };
    } catch (e) { ui.toast('Could not load: ' + e.message); return { ok: false, msg: e.message }; }
  },
  importScene(f) { return this.importFile(f); },
  newIsland() { core.exec({ cmd: 'terrain.reset', seed: Math.floor(Math.random() * 90000) + 100 }); ui.toast('New terrain'); ui.updHist(); },
};
app.envChildren = envChildren; app.shared = shared; app.assets = new Assets(shared); app.entities = new Entities(app); app.dyn = new DynEnts(app); const entities = app.entities; app.entities.register('retail.convenience', retailPrefab);
const core = new Core(app); app.core = core; const ui = new UI(app); app.ui = ui; const input = new Input(app, canvas); app.input = input;
core.on(() => ui.updHist());
app.geo = new GeoWorld(app); app.map = new OverviewMap(app);
phys.a = app;
// ---- the living-world layer: FX, camera rig, grab, combat, HUD. The player is an Actor, the same body every fighter has. ----
const fx = new FX(scene, camera); app.fx = fx;
app.rig = new CamRig(app); app.grab = new Grab(app); app.combat = new Combat(app); app.hud = new Hud(app, document.getElementById('ui'));
player = app.combat.addPlayer(0, 0, 0); app.player = player; app.character = player.character; app.tune = TUNE; player.lock = null; app.lab = initLab(app, { arena: false });
app.cam.target.set(player.pos.x, player.pos.y + 1.45, player.pos.z);

// ---- initial scene: the coast is the backdrop behind the start sheet ----
app.newScene('coast'); core.hist = []; core.ptr = 0;
app.rig.setView(Math.PI / 2 + 0.35, 0.2, 5.4); app.rig.snap();
phys.init().then(ok => { if (!ok) ui.toast('Physics engine could not load, using the simple built-in solver'); });

// A test yard: every catalog model dropped from a little height as a real rigid body, plus crates, barrels and boulders. dx/dz is where the first row starts.
app.physicsYard = (cx = 0, cz = 8) => {
  const ids = [...app.assets.items.keys()].filter(id => app.assets.meta(id).collider !== 'none' || id.startsWith('kenney.') || id.startsWith('nature.')); let n = 0; const cols = 7;
  for (const id of ids) { const i = n++, x = cx + ((i % cols) - (cols - 1) / 2) * 5.5, z = cz + Math.floor(i / cols) * 5.5, y = terrain.hAt(x, z) + 1.2 + (i % 3) * 0.9;
    try { entities.create({ prefab: 'asset', parameters: { assetId: id }, transform: { position: [x, y, z], rotation: [0, (i * 0.7) % 6.28, 0] }, components: { collider: { type: 'dynamic' } } }); } catch (e) { console.warn('yard', id, e.message); } }
  const drop = (x, z, r, kind, up) => boulders.add(x, terrain.hAt(x, z) + (kind === 'boulder' ? r : r * 1.1) + 0.05 + up, z, r, undefined, kind);
  for (let i = 0; i < 6; i++) drop(-14 + (i % 3) * 1.1, 4 + Math.floor(i / 3) * 1.1, 0.5, 'crate', 0); for (let i = 0; i < 4; i++) drop(-14 + i * 1.0, 8, 0.45, 'barrel', 0); drop(-17, 2, 1.2, 'boulder', 2);
  return n;
};
async function start(choice) {
  if (choice === 'first-light') return app.firstLight.start();
  if (app.worldModes && app.worldModes[choice] && ['starter', 'sandbox', 'proving', 'photowalk'].includes(choice)) { app.worldModes[choice](); return; }
  if (choice === 'import') { app.worldModes.importWorld(); return; }
  if (['range', 'arena', 'coins'].includes(choice)) { app.game.start(choice); return; }
  if (app.worldModes) app.worldModes.stop();
  if (choice === 'lab') { app.newScene('island'); core.noSave = true; app.arenaOff = flatArena(app); app.spawn = [0, 0, 0]; player.respawn(0, 0, 0); player.inv = 0; app.name = 'COMBAT LAB'; terrain.flush();
    const drop = (x, z, r, kind) => boulders.add(x, terrain.hAt(x, z) + (kind === 'boulder' ? r : r * 1.1) + 0.05, z, r, undefined, kind); drop(4, 0, 0.5, 'crate'); drop(4, 1.1, 0.5, 'crate'); drop(5.2, -3, 0.45, 'barrel'); drop(-5, 3, 1.1, 'boulder');
    app.rig.setView(Math.PI / 2 + 0.35, 0.2, 5.4); app.rig.snap(); app.lab.show(true); ui.brand(); ui.say('Combat lab: a flat arena with the Tune panel. Nothing here is autosaved.', 7000); return; }
  if (choice === 'physics') { app.newScene('island'); core.noSave = true; app.arenaOff = flatArena(app); app.spawn = [0, 0, 0]; player.respawn(0, 0, 0); player.inv = 0; app.name = 'PHYSICS TEST'; terrain.flush();
    const n = app.physicsYard(); app.rig.setView(Math.PI / 2 + 0.35, 0.28, 8); app.rig.snap(); app.lab.show(true); ui.brand(); ui.say(n + ' models are real rigid bodies here. Walk into them, punch, kick, shoot (Shooting range) or grab them. Nothing is autosaved.', 9000); return; }
  if (choice === 'world') { app.geo.open({ resume: true }).then(() => ui.brand()); return; }
  if (choice === 'continue') { const ok = await core.restore(); if (!ok) { app.newScene('coast'); ui.toast('No saved scene, started the coast'); } else ui.toast('Restored your last scene'); }
  else app.newScene(choice === 'blank' ? 'blank' : choice === 'island' ? 'island' : 'coast');
  if (choice === 'blank') { app.setMode('edit'); ui.setGroup(4); ui.say('Blank level: drag pieces in from Level kit, then press E (or Play) to run around in it. Sample level places an example.', 9000); }
  app.rig.setView(Math.atan2(-Math.sin(app.spawn[2]), -Math.cos(app.spawn[2])) + Math.PI + 0.35, 0.2, 5.4); app.rig.snap();
  ui.render(); ui.updHist(); ui.brand(); ui.say('Drag to look · WASD to walk · E to edit the land', 9000);
}
app.firstLight = createFirstLightHost(app);
app.worldModes = createWorldModes(app);
app.editor = createEditor(app);
app.post = createPost(app);
app.shooter = createShooter(app); app.lv = createLevel(app); app.sampleLevel = () => sampleLevel(app);
app.game = createGame(app);
app.start = start;
{ const q = new URLSearchParams(location.search).get('mcp'); if (q) setTimeout(() => connectBridge(app, q.startsWith('ws') ? q : undefined), 800); }
{ const sp = new URLSearchParams(location.search), q = sp.get('start'); if (q === 'world') { ui.hideStart(); app.geo.open({ lat: sp.get('lat') ? +sp.get('lat') : undefined, lon: sp.get('lon') ? +sp.get('lon') : undefined, resume: sp.get('resume') === '1' }).then(() => ui.brand()); } else if (q === 'blank' || q === 'island' || q === 'coast' || q === 'continue' || q === 'lab' || q === 'physics' || q === 'first-light' || ['starter', 'sandbox', 'proving', 'photowalk', 'range', 'arena', 'coins'].includes(q)) { ui.hideStart(); start(q); } else ui.showStart(core.hasSave()); }

function resize() { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); sand.setScale(renderer, camera); }
const maxPr = () => Math.min(devicePixelRatio, 2);
let pr = maxPr(), frames = 0, acc = 0; renderer.setPixelRatio(pr); resize(); addEventListener('resize', resize);

const tele = createTelemetry(app); app.tele = tele;
const v3 = new THREE.Vector2(), FIX = 1 / 60; let last = performance.now(), physAcc = 0, tsc = 1;
// one fixed step: intent -> actors and fighters -> grab -> physics. Intents come from the latched input edges, so no tap is lost between frames.
app.fixedStep = (inp, modal) => fixedStep(inp, modal);
function fixedStep(inp, modal) {
  const P = player, I = input, explore = app.mode === 'explore', owner = app.inputOwner(), G = app.guns, car = app.driving;
  if (explore && !modal && P.alive) {
    if (car) { car.input.thr = I.mv.y; car.input.str = -I.mv.x; car.input.brake = I.jumpHeld; P.intent.mx = P.intent.mz = 0; P.setBlock(false); P.tryJump(false, false); I.take('jump'); I.take('punch'); I.take('kick'); I.take('dodge'); }
    else {
      const y = app.cam.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y), m = I.mv;
      P.intent.mx = fx * m.y + rx * m.x; P.intent.mz = fz * m.y + rz * m.x; P.intent.run = m.run; P.intent.analog = m.analog;
      P.tryJump(I.take('jump'), I.jumpHeld);
      if (owner === 'play') { const pu = I.take('punch'), ki = I.take('kick'); if (G.cur) { if (pu) G.fireEdge = true; } else { if (pu) P.tryAttack('p'); if (ki) P.tryAttack('k'); } if (I.take('dodge')) P.tryDodge(P.intent.mx, P.intent.mz); P.setBlock(I.blockHeld && !G.cur); }
      else { I.take('punch'); I.take('kick'); I.take('dodge'); P.setBlock(false); }
    }
  } else { P.intent.mx = P.intent.mz = 0; P.setBlock(false); P.tryJump(false, false); I.clearEdges(); if (car) { car.input.thr = car.input.str = 0; } }
  if (app.grab.held) app.grab.control(FIX, I.cursorNdc(v3));
  if (explore) G.step(FIX);
  app.combat.step(FIX, water.level);
  if (app.lv.rt) app.lv.rt.step(FIX);
  if (phys.ready) phys.step(FIX, water.level); else boulders.step(FIX, player, water.level, shared.uTime.value);
  if (explore) G.faceAim(FIX);
  if (app.driving) { const c = app.driving; P.pos.set(c.cp.x, c.cp.y - 0.4, c.cp.z); P.vel.set(0, 0, 0); P.inv = 1; P.hp = Math.max(P.hp, 1); phys.teleport(P); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; shared.uTime.value += dt;
  // adaptive pixel ratio: drop resolution when the frame rate sags, climb back when there is headroom
  acc += dt; frames++; if (acc > 1.5) { const fps = frames / acc; app.fps = fps; if (fps < 38 && pr > 0.7) { pr = Math.max(0.7, pr - 0.25); renderer.setPixelRatio(pr); resize(); } else if (fps > 58 && pr < maxPr()) { pr = Math.min(maxPr(), pr + 0.25); renderer.setPixelRatio(pr); resize(); } app.pr = pr; acc = 0; frames = 0; }
  if (app.firstLight.active) { app.firstLight.update(dt); return; }
  if (app.hold) { renderer.render(scene, camera); return; }   // tests drive the fixed step by hand
  const inp = input.poll(dt), c = app.cam;
  if (ui.modalOpen()) { inp.mx = inp.mz = inp.lx = inp.ly = 0; inp.jump = false; inp.run = false; }
  if (inp.lx || inp.ly) app.orbit(inp.lx * 200, inp.ly * 200);
  if (app.geo.active) { input.clearEdges(); app.geo.update(dt, inp, now); renderer.render(scene, camera); tele.tick(now); return; }
  // movement relative to the camera; the edit camera pans with the same keys
  const fx0 = -Math.sin(c.yaw), fz0 = -Math.cos(c.yaw), rx0 = Math.cos(c.yaw), rz0 = -Math.sin(c.yaw);
  const explore = app.mode === 'explore', startOpen = ui.modalOpen();
  if (!explore) { const k = c.dist * 0.6 * dt * (input.keys.has('shift') ? 3 : 1), mvx = fx0 * inp.mz + rx0 * inp.mx, mvz = fz0 * inp.mz + rz0 * inp.mx; c.target.x = clamp(c.target.x + mvx * k, -124, 124); c.target.z = clamp(c.target.z + mvz * k, -124, 124); }
  // slow-mo eases back to real time; the simulation then runs on fixed 60 Hz steps and rendering interpolates between the last two
  const nowMs = performance.now(), slowOn = nowMs < app.slow.until; tsc += ((slowOn ? app.slow.s : 1) - tsc) * Math.min(1, dt * (slowOn ? 20 : 6));
  const sdt = dt * tsc * TUNE.timeScale; physAcc = Math.min(0.12, physAcc + sdt); let n = 0;
  while (physAcc >= FIX && n++ < 6) { fixedStep(inp, startOpen); physAcc -= FIX; }
  if (n >= 6) physAcc = 0;
  phys.syncTerrain(app.stroking);
  const alpha = physAcc / FIX; phys.interp(alpha); for (const a of app.combat.actors) a.render(alpha, sdt); if (app.lv.rt) for (const k of app.lv.rt.cars) k.render(alpha);
  if (explore && !app.lv.rt && app.lv.wanted && phys.ready) app.lv.start();
  // camera: critically damped follow with look-ahead, soft lock-on, terrain-aware boom, speed FOV and trauma shake (camera.js)
  const drv = app.driving;
  if (drv) { c.target.set(drv.pos.x, drv.pos.y + 1.1, drv.pos.z); app.rig.update(dt, { explore, player: drv.pos, vel: drv.vel, speed: drv.speed, lock: null, combat: false, dodge: false }); }
  else { if (explore) c.target.set(player.rpos.x, player.rpos.y + 1.5 * player.scale, player.rpos.z);
  app.rig.update(dt, { explore, player: player.pos, vel: player.vel, speed: player.speed, lock: player.lock && player.lock.alive ? player.lock.rpos : null, combat: player.combatT > 0, dodge: player.state === 'dodge' }); }
  if (app.shooter.active) app.shooter.cameraUpdate();
  // edit cursor + stroke
  if (!explore) {
    app.updateHit(); const h = app.hit, t = app.tool, paintTool = ['raise', 'lower', 'smooth', 'flatten', 'sand', 'rock', 'grass'].includes(t);
    ring.visible = !!h && !ui.hidden && !startOpen && !app.editor.active() && t !== 'grab'; if (h) { const a = ring.geometry.attributes.position, R = paintTool || t === 'palm' || t === 'erase' ? app.R : 1.1; for (let i = 0; i <= 96; i++) { const th = i / 96 * 6.2832, x = h.x + Math.cos(th) * R, z = h.z + Math.sin(th) * R; a.setXYZ(i, x, Math.max(terrain.hAt(x, z), water.level) + 0.2, z); } a.needsUpdate = true; }
    if (app.stroking && h && (input.brushDown || app.padDown)) {
      terrain.brush(t, h.x, h.z, app.R, app.strength, dt, !!input.invert); terrain.flush();
      if (paintTool && t !== 'rock' && t !== 'grass' && h.y > water.level + 0.1) sand.burst(h.x + (Math.random() - 0.5) * app.R * 0.7, h.y, h.z + (Math.random() - 0.5) * app.R * 0.7, Math.round(2 + app.R * 0.4), 1.2, 1.4, 0.4);
    }
  } else ring.visible = false;
  if (app.editor) { app.editor.prune(); app.editor.update(); }
  app.shooter.update(dt); app.game.update(dt); app.guns.render(dt);
  app.grab.setHover(input.cursorNdc(v3), (explore || app.tool === 'grab') && !input.pointers.size && !startOpen && !app.shooter.active && !app.driving && !app.guns.cur); app.grab.render(now);
  app.hud.update(dt); fx.update(dt, renderer); app.lab.update(alpha);
  entities.tick(dt); terrain.flush(); water.update(dt, camera, env.p, env); env.update(dt, camera, explore ? player.pos : c.target);
  sand.update(dt, camera, explore ? player.pos : c.target, env, water.level);
  if (!app.shooter.render()) renderer.render(scene, camera); tele.tick(now);
}
requestAnimationFrame(frame);
window.n0 = { app, core, geo: app.geo, telemetry: () => tele.read(), run: l => core.run(l), exec: c => core.exec(c), get fps() { return app.fps; }, get pr() { return app.pr; } };
mountWorkspace(window.n0);
window.Core = { exec: c => core.exec(c), describe: () => core.exec({ cmd: 'describe' }), state: () => core.exec({ cmd: 'state' }) };
