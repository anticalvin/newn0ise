import * as THREE from 'three';
import { makeShared } from './glsl.js';
import { Environment } from './env.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { Palms, Grass } from './nature.js';
import { Boulders, Player } from './sim.js';
import { Character } from './character.js';
import { buildProps } from './props.js';
import { Core } from './core.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { clamp } from './util.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 6000);
const shared = makeShared();
const env = new Environment(renderer, scene, shared);
const terrain = new Terrain(shared);
const water = new Water(shared, terrain, env);
const palms = new Palms(shared, terrain), grass = new Grass(shared, terrain);
const player = new Player(terrain), character = new Character(shared);
const boulders = new Boulders(scene, shared, terrain, water);
scene.add(terrain.mesh, water.mesh, palms.mesh, grass.mesh, character.root);
water.ripples.forEach(r => scene.add(r.m));
buildProps(scene, shared, terrain, player);
boulders.splash = (x, z, s) => water.splash(x, z, s);
player.onStep = (x, z) => { if (terrain.hAt(x, z) > water.level + 0.05 && terrain.hAt(x, z) < 2.2) terrain.stamp(x, z, 0.16, 0.9); };

// cursor ring draped on the terrain
const ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
const ring = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0xede8df, transparent: true, opacity: 0.9, depthTest: false, fog: false })); ring.renderOrder = 50; ring.frustumCulled = false; ring.visible = false; scene.add(ring);

const app = {
  scene, renderer, camera, terrain, water, env, palms, grass, boulders, player, character,
  mode: 'explore', tool: 'raise', R: 10, strength: 0.6, padMode: false,
  cam: { yaw: 1.2, pitch: 0.28, dist: 5.2, target: new THREE.Vector3(), ey: 0 },
  hit: null, stroking: false, grassT: 0,
  focusPoint() { return this.mode === 'explore' ? player.pos.clone() : (this.hit ? this.hit.clone() : this.cam.target.clone()); },
  afterTerrain(force) {
    palms.rebuild(); boulders.wake(); player.pos.y = player.groundAt(player.pos.x, player.pos.z);
    if (force) grass.scatter(terrain.seed, terrain); else { clearTimeout(this.grassT); this.grassT = setTimeout(() => grass.scatter(terrain.seed, terrain), 120); }
    terrain.flush();
  },
  snapshotTerrain() { return { h: terrain.h.slice(), p: terrain.paint.slice(), seed: terrain.seed }; },
  restoreTerrain(s) { terrain.h.set(s.h); terrain.paint.set(s.p); terrain.seed = s.seed; terrain.dirtyH = terrain.dirtyP = true; terrain.rev++; this.afterTerrain(true); },
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
  snap() { renderer.render(scene, camera); canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'n0ise-coast-' + Date.now() + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }); ui.toast('Screenshot saved'); },
  async exportScene() { const d = await core.serialize(), b = new Blob([JSON.stringify(d)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'COAST_001.n0scene'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); ui.toast('Exported'); },
  async importScene(f) { try { await core.load(JSON.parse(await f.text())); ui.toast('Scene loaded'); ui.render(); ui.updHist(); } catch (e) { ui.toast('Could not load: ' + e.message); } },
  newIsland() { core.exec({ cmd: 'terrain.reset', seed: Math.floor(Math.random() * 90000) + 100 }); ui.toast('New island'); ui.updHist(); },
};
const core = new Core(app); app.core = core; const ui = new UI(app); app.ui = ui; const input = new Input(app, canvas); app.input = input;
core.on(() => ui.updHist());

// ---- initial scene ----
terrain.flush(); grass.scatter(terrain.seed, terrain);
{ // palms on the dune/hill margin, deterministic
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let sx0 = 0; for (let x = -100; x < 60; x += 0.5) { if (terrain.hAt(x, 8) > 0.75) { sx0 = x; break; } }
  for (let i = 0, t = 0; i < 46 && t < 900; t++) { const x = -70 + r() * 190, z = -90 + r() * 170, h = terrain.hAt(x, z);
    if (h < 1.5 || h > 7 || terrain.nAt(x, z).y < 0.82 || palms.items.some(p => Math.hypot(p.x - x, p.z - z) < 4.2)) continue;
    if (Math.hypot(x - sx0, z - 8) < 14) continue; palms.add(x, z, 0.8 + r() * 0.6, r() * 6.28); i++; }
  for (const [x, z] of [[8, -14], [-2, -22], [16, 2]]) { const h = terrain.hAt(x, z); if (h > 1.2 && h < 3) palms.add(x, z, 1.0 + r() * 0.3, r() * 6); }
  [[-9, 9, 1.4], [-4, 14, 0.9], [-12, 26, 2.1]].forEach(([x, z, rr]) => boulders.add(x, terrain.hAt(x, z) + rr, z, rr));
}
{ // spawn: dry sand just above the wet line on the beach, looking west to the sea
  let sx = 0; const sz = 8; for (let x = -100; x < 60; x += 0.5) { if (terrain.hAt(x, sz) > 0.75) { sx = x + 1.2; break; } }
  player.pos.set(sx, terrain.hAt(sx, sz), sz); player.yaw = -Math.PI / 2; app.cam.yaw = Math.PI / 2 + 0.35; app.cam.pitch = 0.2; app.cam.dist = 5.4;
}
core.restore().then(ok => { if (ok) { ui.toast('Restored your last scene'); ui.render(); } });

function resize() { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); }
let pr = Math.min(devicePixelRatio, 2), ft = 0.016, frames = 0, acc = 0; renderer.setPixelRatio(pr); resize(); addEventListener('resize', resize);

const v3 = new THREE.Vector3(); let last = performance.now(), physAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; shared.uTime.value += dt;
  // adaptive pixel ratio
  acc += dt; frames++; if (acc > 1.5) { const fps = frames / acc; if (fps < 38 && pr > 0.7) { pr = Math.max(0.7, pr - 0.25); renderer.setPixelRatio(pr); resize(); } else if (fps > 58 && pr < Math.min(devicePixelRatio, 2)) { pr = Math.min(Math.min(devicePixelRatio, 2), pr + 0.25); renderer.setPixelRatio(pr); resize(); } acc = 0; frames = 0; }
  const inp = input.poll(dt), c = app.cam;
  if (inp.lx || inp.ly) app.orbit(inp.lx * 200, inp.ly * 200);
  // movement relative to camera
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  const mvx = fx * inp.mz + rx * inp.mx, mvz = fz * inp.mz + rz * inp.mx;
  if (app.mode === 'explore') { physAcc += dt; let n = 0; while (physAcc > 1 / 60 && n++ < 4) { physAcc -= 1 / 60; player.update(1 / 60, { x: mvx, z: mvz }, inp.run, inp.jump, water.level); inp.jump = false; } if (n >= 4) physAcc = 0; }
  else { // Edit: WASD pans the focus; the character idles
    const k = c.dist * 0.6 * dt; c.target.x = clamp(c.target.x + mvx * k, -124, 124); c.target.z = clamp(c.target.z + mvz * k, -124, 124); player.update(dt, { x: 0, z: 0 }, false, false, water.level);
  }
  boulders.step(dt, player, water.level, shared.uTime.value);
  character.root.position.copy(player.pos); character.root.rotation.y = player.yaw; character.update(dt, player.speed, player.onGround, player.depth, player.vel.y);
  character.root.position.y -= clamp(player.depth - 0.4, 0, 0.5) * 0.15;
  // camera
  if (app.mode === 'explore') { v3.set(player.pos.x, player.pos.y + 1.45, player.pos.z); c.target.lerp(v3, 1 - Math.exp(-14 * dt)); }
  const cp = Math.cos(c.pitch); camera.position.set(c.target.x + Math.sin(c.yaw) * cp * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * cp * c.dist);
  const floor = Math.max(terrain.hAt(camera.position.x, camera.position.z), app.mode === 'explore' ? water.level : -99) + 0.55; if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(c.target);
  // edit cursor + stroke
  if (app.mode === 'edit') {
    app.updateHit(); const h = app.hit, t = app.tool, paintTool = ['raise', 'lower', 'smooth', 'flatten', 'sand', 'rock', 'grass'].includes(t);
    ring.visible = !!h && !ui.hidden; if (h) { const a = ring.geometry.attributes.position, R = paintTool || t === 'palm' || t === 'erase' ? app.R : 1.1; for (let i = 0; i <= 96; i++) { const th = i / 96 * 6.2832, x = h.x + Math.cos(th) * R, z = h.z + Math.sin(th) * R; a.setXYZ(i, x, Math.max(terrain.hAt(x, z), water.level) + 0.2, z); } a.needsUpdate = true; }
    if (app.stroking && h && (input.brushDown || app.padDown)) { terrain.brush(t, h.x, h.z, app.R, app.strength, dt, !!input.invert); terrain.flush(); }
  } else ring.visible = false;
  terrain.flush(); water.update(dt, camera, env.p, env); env.update(dt, camera, app.mode === 'explore' ? player.pos : c.target);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.n0 = { app, core, run: l => core.run(l) };
