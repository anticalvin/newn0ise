import * as THREE from 'three';
import { makeShared } from './glsl.js';
import { Environment } from './env.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { Palms, Grass } from './nature.js';
import { Boulders, Player } from './simlite.js';
import { Phys } from './phys.js';
import { Sand } from './sand.js';
import { Character } from './character.js';
import { buildProps } from './props.js';
import { readWorld, buildWorld, flatSpot, collidersFor } from './world.js';
import { Core, LIMITS } from './core.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { clamp } from './util.js';
import { connectBridge } from './api.js';
import { Entities } from './entities.js';
import { Assets } from './assets.js';
import { retailPrefab } from './prefabs/retail.js';
import { createTelemetry } from './debug.js';
import { GeoWorld } from './geo/manager.js';
import { OverviewMap } from './geo/map.js';

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
const player = new Player(terrain), character = new Character(shared);
const boulders = new Boulders(scene, shared, terrain, water);
const sand = new Sand(shared, terrain);
const phys = new Phys({ terrain, player, boulders });
scene.add(terrain.mesh, water.mesh, palms.mesh, grass.mesh, character.root, sand.mesh);
water.ripples.forEach(r => scene.add(r.m));
boulders.splash = (x, z, s) => water.splash(x, z, s);
phys.splash = boulders.splash;
phys.onImpact = (x, y, z, n) => sand.burst(x, y, z, Math.round(n * 3), 1.8, 1.6, 0.5);
player.onStep = (x, z) => {
  const h = terrain.hAt(x, z);
  if (h > water.level + 0.05 && h < 2.2) terrain.stamp(x, z, 0.16, 0.9);
  if (h > water.level + 0.1) sand.burst(x, h, z, player.speed > 4 ? 30 : 18, 0.8 + player.speed * 0.25, 0.9, 0.18);
};

// cursor ring draped on the terrain
const ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
const ring = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0xede8df, transparent: true, opacity: 0.9, depthTest: false, fog: false })); ring.renderOrder = 50; ring.frustumCulled = false; ring.visible = false; scene.add(ring);

const app = {
  scene, renderer, camera, terrain, water, env, palms, grass, boulders, player, character, phys, sand,
  name: 'COAST_001', spawn: [0, 0, 0], worlds: [], props: null, propCols: [],
  mode: 'explore', tool: 'raise', R: 10, strength: 0.6, padMode: false,
  cam: { yaw: 1.2, pitch: 0.28, dist: 5.2, target: new THREE.Vector3(), ey: 0 },
  hit: null, stroking: false, grassT: 0, pr: 1, fps: 60,
  focusPoint() { return this.mode === 'explore' ? player.pos.clone() : (this.hit ? this.hit.clone() : this.cam.target.clone()); },
  afterTerrain(force) {
    palms.rebuild(); boulders.wake(); player.pos.y = player.groundAt(player.pos.x, player.pos.z);
    if (force) grass.scatter(terrain.seed, terrain); else { clearTimeout(this.grassT); this.grassT = setTimeout(() => grass.scatter(terrain.seed, terrain), 120); }
    terrain.flush();
  },
  snapshotTerrain() { return { h: terrain.h.slice(), p: terrain.paint.slice(), seed: terrain.seed, preset: terrain.preset }; },
  restoreTerrain(s) { if (s.preset && s.preset !== terrain.preset) { terrain.preset = s.preset; this.setPreset(s.preset); } terrain.seed = s.seed; terrain.h.set(s.h); terrain.paint.set(s.p); terrain.dirtyH = terrain.dirtyP = true; terrain.rev++; this.afterTerrain(true); },
  // ---- whole-scene snapshots (used by scene.new and its undo) ----
  snapshot() {
    return { t: this.snapshotTerrain(), base: terrain.base.slice(), env: { ...env.p }, name: this.name, spawn: [...this.spawn], palms: palms.items.map(p => ({ ...p })), boulders: boulders.items.map(b => [b.p.x, b.p.y, b.p.z, b.r, b.seed]),
      worlds: this.worlds.map(w => ({ name: w.name, at: [...w.at], doc: w.doc })), ents: entities.serialize(), player: [player.pos.x, player.pos.z, player.yaw] };
  },
  restoreScene(s) {
    core.muted = true;
    try {
      terrain.preset = s.t.preset; terrain.base.set(s.base); this.setPreset(s.t.preset); this.restoreTerrain(s.t); env.set(s.env); this.name = s.name; this.spawn = [...s.spawn];
      palms.items = s.palms.map(p => ({ ...p })); palms.rebuild();
      [...boulders.items].forEach(b => boulders.remove(b)); s.boulders.forEach(([x, y, z, r, seed]) => boulders.add(x, y, z, r, seed));
      entities.clear(); this.clearWorlds(); s.worlds.forEach(w => { const r = readWorld(w.doc); if (r.ok) this.placeWorld(r.doc, w.at, w.name); });
      entities.load(s.ents || []); player.pos.set(s.player[0], 0, s.player[1]); player.yaw = s.player[2]; player.pos.y = player.groundAt(player.pos.x, player.pos.z); player.vel.set(0, 0, 0); phys.teleport(player);
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
  interact() { if (this.geo && this.geo.active) { const r = this.geo.interact(); ui.toast(r.msg); return r; } const r = core.exec({ cmd: 'interact.use' }); ui.toast(r.msg); ui.updHist(); return r; },
  inventory() { const out = []; entities.rt.forEach((rt, id) => { if (rt.rec && rt.rec.state && rt.rec.state.removed) rt.rec.state.removed.forEach(k => { const s = rt.index.get(k); out.push({ store: id, key: k, name: s ? rt.lib.product[s.type].name : 'Item' }); }); }); return out; },
  defaultSpawn() {
    if (terrain.preset === 'blank') return [0, 0, 0];
    let sx = 0; const sz = 8; for (let x = -100; x < 60; x += 0.5) { if (terrain.hAt(x, sz) > 0.75) { sx = x + 1.2; break; } }
    return [sx, sz, -Math.PI / 2];
  },
  // preset 'blank' | 'coast': same engine, same tools, same commands
  newScene(preset, seed = 101) {
    core.muted = true;
    try {
      terrain.generate(seed, preset); this.name = preset === 'blank' ? 'BLANK' : 'COAST_001';
      palms.items = []; palms.rebuild(); [...boulders.items].forEach(b => boulders.remove(b)); entities.clear(); this.clearWorlds(); this.setPreset(preset);
      env.set(preset === 'blank' ? { time: 11, cloud: 0.3, wind: 0.35, windAng: 0, sea: 0.45, tide: 0 } : { time: 17.4, cloud: 0.38, wind: 0.55, windAng: 0, sea: 0.55, tide: 0 });
      if (preset === 'coast') this.populateCoast();
      this.spawn = this.defaultSpawn(); player.pos.set(this.spawn[0], 0, this.spawn[1]); player.yaw = this.spawn[2]; player.vel.set(0, 0, 0);
      player.pos.y = player.groundAt(player.pos.x, player.pos.z); phys.teleport(player); sand.clear(); terrain.stamps = 0; terrain.prints.fill(0); terrain.dirtyF = true;
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
  teleport(x, z) { player.pos.set(x, 0, z); player.pos.y = player.groundAt(x, z); player.vel.set(0, 0, 0); phys.teleport(player); },
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
  setTool(t) { this.tool = t; }, setMode(m) { if (m === this.mode) return; this.mode = m; ui.setMode(m);
    if (m === 'edit') { this.cam.dist = 46; this.cam.pitch = 0.78; this.cam.target.set(player.pos.x, terrain.hAt(player.pos.x, player.pos.z), player.pos.z); }
    else { this.cam.dist = 5.2; this.cam.pitch = 0.28; this.input.endBrush(); } },
  toggleMode() { this.setMode(this.mode === 'explore' ? 'edit' : 'explore'); },
  radius(d) { this.R = clamp(this.R + d * 2, 2, 40); ui.syncRadius(); ui.toast('Radius ' + this.R); },
  zoom(f) { const c = this.cam; c.dist = clamp(c.dist * f, this.mode === 'explore' ? 2 : 8, this.mode === 'explore' ? 14 : 160); },
  orbit(dx, dy) { const c = this.cam; c.yaw -= dx * 0.005; c.pitch = clamp(c.pitch + dy * 0.005, 0.03, 1.45); },
  pan(dx, dy) { if (this.mode !== 'edit') return; const c = this.cam, k = c.dist * 0.0016, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    c.target.x = clamp(c.target.x + (-rx * dx + fx * dy) * k, -124, 124); c.target.z = clamp(c.target.z + (-rz * dx + fz * dy) * k, -124, 124); },
  resetCam() { this.cam.yaw = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI; this.cam.pitch = this.mode === 'edit' ? 0.78 : 0.28; },
  brushStart() {
    if (this.mode !== 'edit') return;
    const t = this.tool; this.updateHit();
    if (t === 'palm' || t === 'erase' || t === 'boulder') { if (!this.hit) return; const r = t === 'boulder' ? this.boulderAtCursor() : core.exec(t === 'palm' ? { cmd: 'scatter.add', center: [this.hit.x, this.hit.z], radius: this.R, count: Math.max(1, Math.round(this.R * this.strength * 0.5)) } : { cmd: 'scatter.erase', center: [this.hit.x, this.hit.z], radius: this.R }); if (r && !r.ok) ui.toast(r.msg); ui.updHist(); return; }
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
app.envChildren = envChildren; app.shared = shared; app.assets = new Assets(shared); app.entities = new Entities(app); const entities = app.entities; app.entities.register('retail.convenience', retailPrefab);
const core = new Core(app); app.core = core; const ui = new UI(app); app.ui = ui; const input = new Input(app, canvas); app.input = input;
core.on(() => ui.updHist());
app.geo = new GeoWorld(app); app.map = new OverviewMap(app);
phys.a = app;

// ---- initial scene: the coast is the backdrop behind the start sheet ----
app.newScene('coast'); core.hist = []; core.ptr = 0;
app.cam.yaw = Math.PI / 2 + 0.35; app.cam.pitch = 0.2; app.cam.dist = 5.4;
phys.init().then(ok => { if (!ok) ui.toast('Physics engine could not load, using the simple built-in solver'); });

async function start(choice) {
  if (choice === 'world') { app.geo.open({ resume: true }).then(() => ui.brand()); return; }
  if (choice === 'continue') { const ok = await core.restore(); if (!ok) { app.newScene('coast'); ui.toast('No saved scene, started the coast'); } else ui.toast('Restored your last scene'); }
  else app.newScene(choice === 'blank' ? 'blank' : 'coast');
  app.cam.yaw = Math.atan2(-Math.sin(app.spawn[2]), -Math.cos(app.spawn[2])) + Math.PI + 0.35; app.cam.pitch = 0.2; app.cam.dist = 5.4;
  ui.render(); ui.updHist(); ui.brand(); ui.say('Drag to look · WASD to walk · E to edit the land', 9000);
}
app.start = start;
{ const q = new URLSearchParams(location.search).get('mcp'); if (q) setTimeout(() => connectBridge(app, q.startsWith('ws') ? q : undefined), 800); }
{ const sp = new URLSearchParams(location.search), q = sp.get('start'); if (q === 'world') { ui.hideStart(); app.geo.open({ lat: sp.get('lat') ? +sp.get('lat') : undefined, lon: sp.get('lon') ? +sp.get('lon') : undefined, resume: sp.get('resume') === '1' }).then(() => ui.brand()); } else if (q === 'blank' || q === 'coast' || q === 'continue') { ui.hideStart(); start(q); } else ui.showStart(core.hasSave()); }

function resize() { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); sand.setScale(renderer, camera); }
const maxPr = () => Math.min(devicePixelRatio, 2);
let pr = maxPr(), frames = 0, acc = 0; renderer.setPixelRatio(pr); resize(); addEventListener('resize', resize);

const tele = createTelemetry(app); app.tele = tele;
const v3 = new THREE.Vector3(); let last = performance.now(), physAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; shared.uTime.value += dt;
  // adaptive pixel ratio: drop resolution when the frame rate sags, climb back when there is headroom
  acc += dt; frames++; if (acc > 1.5) { const fps = frames / acc; app.fps = fps; if (fps < 38 && pr > 0.7) { pr = Math.max(0.7, pr - 0.25); renderer.setPixelRatio(pr); resize(); } else if (fps > 58 && pr < maxPr()) { pr = Math.min(maxPr(), pr + 0.25); renderer.setPixelRatio(pr); resize(); } app.pr = pr; acc = 0; frames = 0; }
  const inp = input.poll(dt), c = app.cam;
  if (inp.lx || inp.ly) app.orbit(inp.lx * 200, inp.ly * 200);
  if (app.geo.active) { app.geo.update(dt, inp, now); renderer.render(scene, camera); tele.tick(now); return; }
  // movement relative to camera
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  const mvx = fx * inp.mz + rx * inp.mx, mvz = fz * inp.mz + rz * inp.mx;
  const explore = app.mode === 'explore', startOpen = ui.startOpen;
  if (!explore) { const k = c.dist * 0.6 * dt; c.target.x = clamp(c.target.x + mvx * k, -124, 124); c.target.z = clamp(c.target.z + mvz * k, -124, 124); }
  // one fixed 60 Hz step for the character and the boulders (Rapier when it is ready, the simple solver until then)
  physAcc += dt; let n = 0;
  while (physAcc > 1 / 60 && n++ < 4) {
    physAcc -= 1 / 60;
    if (explore && !startOpen) { player.update(1 / 60, { x: mvx, z: mvz }, inp.run, inp.jump, water.level); inp.jump = false; } else player.update(1 / 60, { x: 0, z: 0 }, false, false, water.level);
    if (phys.ready) phys.step(1 / 60, water.level); else boulders.step(1 / 60, player, water.level, shared.uTime.value);
  }
  if (n >= 4) physAcc = 0;
  phys.syncTerrain(app.stroking);
  character.root.position.copy(player.pos); character.root.rotation.y = player.yaw; character.update(dt, player.speed, player.onGround, player.depth, player.vel.y);
  character.root.position.y -= clamp(player.depth - 0.4, 0, 0.5) * 0.15;
  // camera
  if (explore) { v3.set(player.pos.x, player.pos.y + 1.45, player.pos.z); c.target.lerp(v3, 1 - Math.exp(-14 * dt)); }
  const cp = Math.cos(c.pitch); camera.position.set(c.target.x + Math.sin(c.yaw) * cp * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * cp * c.dist);
  const floor = Math.max(terrain.hAt(camera.position.x, camera.position.z), explore ? water.level : -99) + 0.55; if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(c.target);
  // edit cursor + stroke
  if (!explore) {
    app.updateHit(); const h = app.hit, t = app.tool, paintTool = ['raise', 'lower', 'smooth', 'flatten', 'sand', 'rock', 'grass'].includes(t);
    ring.visible = !!h && !ui.hidden && !startOpen; if (h) { const a = ring.geometry.attributes.position, R = paintTool || t === 'palm' || t === 'erase' ? app.R : 1.1; for (let i = 0; i <= 96; i++) { const th = i / 96 * 6.2832, x = h.x + Math.cos(th) * R, z = h.z + Math.sin(th) * R; a.setXYZ(i, x, Math.max(terrain.hAt(x, z), water.level) + 0.2, z); } a.needsUpdate = true; }
    if (app.stroking && h && (input.brushDown || app.padDown)) {
      terrain.brush(t, h.x, h.z, app.R, app.strength, dt, !!input.invert); terrain.flush();
      if (paintTool && t !== 'rock' && t !== 'grass' && h.y > water.level + 0.1) sand.burst(h.x + (Math.random() - 0.5) * app.R * 0.7, h.y, h.z + (Math.random() - 0.5) * app.R * 0.7, Math.round(2 + app.R * 0.4), 1.2, 1.4, 0.4);
    }
  } else ring.visible = false;
  entities.tick(dt); terrain.flush(); water.update(dt, camera, env.p, env); env.update(dt, camera, explore ? player.pos : c.target);
  sand.update(dt, camera, explore ? player.pos : c.target, env, water.level);
  renderer.render(scene, camera); tele.tick(now);
}
requestAnimationFrame(frame);
window.n0 = { app, core, geo: app.geo, telemetry: () => tele.read(), run: l => core.run(l), exec: c => core.exec(c), get fps() { return app.fps; }, get pr() { return app.pr; } };
window.Core = { exec: c => core.exec(c), describe: () => core.exec({ cmd: 'describe' }), state: () => core.exec({ cmd: 'state' }) };
