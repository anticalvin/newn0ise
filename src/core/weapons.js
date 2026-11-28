// First-person shooting for Core: hitscan weapons with a real viewmodel (drawn in its own pass so it never clips into walls), aim down sights with a
// reflex red-dot, recoil that kicks the view and settles, bloom on muzzle flash, tracers and the sight, sparks, bullet decals, hit markers, ammo and reload.
// Targets come from the game layer (app.game.targets): anything with {pos, r, alive, onHit(info)} can be shot. Weapon models are ordinary GLB assets from the catalog,
// so a different weapon is a different entry in WEAPONS and nothing else.
import * as THREE from 'three';

import { WEAPON_STATS } from './weapondata.js';
const SH = k => { const { name, dmg, mag, reserve, reload, auto, pellets, spread, range } = WEAPON_STATS[k]; return { name, dmg, mag, reserve, reload, auto, pellets, spread, range }; };   // shared stats, one table (weapondata.js)
const K = 'assets/core/kenney/';
export const WEAPONS = {
  pistol: { name: 'Blaster', asset: 'kenney.blaster', sound: 'snd-blaster.ogg', auto: false, rate: 4.8, dmg: 34, mag: 12, reserve: 84, reload: 1.25, spread: 0.0035, grow: 0.01, recoil: 0.026, kick: 0.07, range: 220, len: 0.5, ads: 0.5, fov: 54, pos: [0.14, -0.12, -0.3], rot: [0, Math.PI, 0], scale: 0.16, sight: [0, 0.074, 0.0], muz: [0, 0.015, -0.2] },
  rifle: { ...SH('rifle'), asset: 'kenney.repeater', sound: 'snd-blaster_repeater.ogg', synth: 'rifle', rate: WEAPON_STATS.rifle.rps, grow: 0.012, recoil: 0.014, kick: 0.04, len: 0.7, ads: 0.6, fov: 42, pos: [0.14, -0.12, -0.32], rot: [0, Math.PI, 0], scale: 0.16, sight: [0, 0.07, -0.01], muz: [0, 0.015, -0.24] },
  shotgun: { ...SH('shotgun'), asset: 'kenney.blaster', sound: 'snd-blaster.ogg', synth: 'shotgun', rate: WEAPON_STATS.shotgun.rps, grow: 0.0, recoil: 0.05, kick: 0.12, len: 0.55, ads: 0.5, fov: 52, pos: [0.14, -0.13, -0.3], rot: [0, Math.PI, 0], scale: 0.16, sight: [0, 0.074, 0.0], muz: [0, 0.015, -0.2] },
  repeater: { name: 'Repeater', asset: 'kenney.repeater', sound: 'snd-blaster_repeater.ogg', auto: true, rate: 11, dmg: 15, mag: 32, reserve: 192, reload: 1.8, spread: 0.006, grow: 0.026, recoil: 0.011, kick: 0.035, range: 220, len: 0.6, ads: 0.55, fov: 50, pos: [0.14, -0.12, -0.3], rot: [0, Math.PI, 0], scale: 0.16, sight: [0, 0.07, -0.01], muz: [0, 0.015, -0.24] },
};
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

export function createShooter(app) {
  const { renderer, scene, camera, player } = app;
  const S = { active: false, wid: 'pistol', loadout: ['pistol', 'repeater', 'rifle', 'shotgun'], ammo: {}, reloading: 0, ads: 0, adsHold: false, fireCd: 0, spread: 0, rp: 0, rpv: 0, kick: 0, lp: 0, locked: false, trigger: false, shots: 0, hits: 0, fov0: 55, hitT: 0, targets: new Set(), flashT: 0, bob: 0 };
  const vm = new THREE.Scene(); const hemi = new THREE.HemisphereLight(0xffffff, 0x6a6258, 1.9), key = new THREE.DirectionalLight(0xfff0dd, 2.6); key.position.set(1, 2, 1); vm.add(hemi, key);
  const root = new THREE.Group(); vm.add(root); const holder = new THREE.Group(); root.add(holder); let model = null, muzzle = new THREE.Object3D(), dot = null;
  const flashLight = new THREE.PointLight(0xffc27a, 0, 3); root.add(flashLight);
  S.vm = vm;

  // ---- audio ----
  let ac = null; const buf = new Map();
  const audio = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } } if (ac && ac.state === 'suspended') ac.resume(); return ac; };
  async function sample(name) { if (buf.has(name)) return buf.get(name); const a = audio(); if (!a) return null; const p = fetch(K + name).then(r => r.arrayBuffer()).then(b => a.decodeAudioData(b)).catch(() => null); buf.set(name, p); return p; }
  async function play(name, vol = 0.7, rate = 1) { const a = audio(); if (!a || S.muted) return; const b = await sample(name); if (!b) return; const s = a.createBufferSource(), g = a.createGain(); s.buffer = b; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08); g.gain.value = vol; s.connect(g).connect(a.destination); s.start(); }
  S.play = play;

  // ---- effects ----
  const glowMat = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); return m; };
  const tracers = [], tg = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(tg, glowMat(3.2, 2.2, 0.7)); m.visible = false; m.frustumCulled = false; scene.add(m); tracers.push({ m, t: 0 }); }
  const NS = 220, sp = { pos: new Float32Array(NS * 3), vel: new Float32Array(NS * 3), life: new Float32Array(NS), col: new Float32Array(NS * 3), n: 0 };
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sp.col, 3));
  const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true })); sparks.frustumCulled = false; scene.add(sparks);
  for (let i = 0; i < NS; i++) sp.pos[i * 3 + 1] = -999;
  function burst(p, n, speed, col, nrm) {
    for (let k = 0; k < n; k++) { const i = sp.n++ % NS; sp.pos.set([p.x, p.y, p.z], i * 3); const th = Math.random() * 6.283, u = Math.random(), s = speed * (0.3 + Math.random()); const v = new THREE.Vector3(Math.cos(th) * (1 - u), u + 0.2, Math.sin(th) * (1 - u)).multiplyScalar(s); if (nrm) { v.addScaledVector(nrm, s * 0.6); } sp.vel.set([v.x, v.y, v.z], i * 3); sp.life[i] = 0.25 + Math.random() * 0.3; sp.col.set(col, i * 3); }
  }
  const dc = document.createElement('canvas'); dc.width = dc.height = 64; { const g = dc.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(10,10,10,.95)'); gr.addColorStop(0.45, 'rgba(25,22,20,.7)'); gr.addColorStop(1, 'rgba(25,22,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const dtex = new THREE.CanvasTexture(dc), decals = []; let di = 0; const dgeo = new THREE.PlaneGeometry(1, 1);
  function decal(p, n) { if (decals.length < 48) { const m = new THREE.Mesh(dgeo, new THREE.MeshBasicMaterial({ map: dtex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.frustumCulled = false; scene.add(m); decals.push(m); } const m = decals[di++ % 48]; m.position.copy(p).addScaledVector(n, 0.01); m.lookAt(p.clone().add(n)); m.rotation.z = Math.random() * 6; m.scale.setScalar(0.12 + Math.random() * 0.06); m.visible = true; }
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), glowMat(4, 2.6, 0.9)); flash.visible = false; { const fc = document.createElement('canvas'); fc.width = fc.height = 64; const g = fc.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,210,140,.8)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); flash.material.map = new THREE.CanvasTexture(fc); } root.add(flash);
  const worldLight = new THREE.PointLight(0xffc27a, 0, 14, 2); scene.add(worldLight);

  // ---- weapon model + reflex sight ----
  async function equip(id) {
    const W = WEAPONS[id]; S.wid = id; if (!S.ammo[id]) S.ammo[id] = { mag: W.mag, reserve: W.reserve };
    await app.assets.ensure(W.asset); const o = app.assets.instantiate(W.asset); const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
    if (model) holder.remove(model); if (S.sight) holder.remove(S.sight); model = new THREE.Group(); o.position.sub(c); model.add(o); model.scale.setScalar(W.scale); model.rotation.set(...W.rot); model.traverse(n => { if (n.isMesh) { n.frustumCulled = false; n.castShadow = false; } });
    const sz = b.getSize(new THREE.Vector3()); S.modelSize = sz.toArray(); holder.add(model);
    muzzle.position.set(...W.muz); holder.add(muzzle);
    // reflex sight: dark frame, faint glass, and a red dot that is brighter than 1 so bloom picks it up
    const sight = new THREE.Group(); const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.6 });
    for (const [x, y, w, h] of [[-0.022, 0.018, 0.004, 0.044], [0.022, 0.018, 0.004, 0.044], [0, 0.04, 0.048, 0.004], [0, -0.004, 0.048, 0.01]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.016), dark); m.position.set(x, y, 0); sight.add(m); }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.04), new THREE.MeshBasicMaterial({ color: 0x9fd2ff, transparent: true, opacity: 0.1, depthWrite: false })); glass.position.set(0, 0.018, 0); sight.add(glass);
    dot = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.15, 0.12), toneMapped: false })); dot.position.set(0, 0.018, -0.002); sight.add(dot);
    sight.position.set(...W.sight); holder.add(sight); S.sight = sight; holder.rotation.set(0, 0, 0); holder.position.set(0, 0, 0); root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true); S.dotLocal = dot.getWorldPosition(new THREE.Vector3());
    S.reloading = 0; refreshHud();
  }
  S.equip = equip; S.WEAPONS = WEAPONS;

  // ---- tracing ----
  const rc = new THREE.Raycaster(), o3 = new THREE.Vector3(), d3 = new THREE.Vector3();
  function trace(origin, dir, range) {
    let best = { t: range, kind: 'none' };
    for (const tg2 of S.targets) { if (!tg2.alive) continue;
      for (const part of tg2.parts ? tg2.parts() : [{ pos: tg2.pos, r: tg2.r, head: false }]) { const oc = o3.copy(origin).sub(part.pos), b = oc.dot(dir), c = oc.lengthSq() - part.r * part.r, disc = b * b - c; if (disc < 0) continue; const t = -b - Math.sqrt(disc); if (t > 0.05 && t < best.t) best = { t, kind: 'target', target: tg2, head: !!part.head, point: origin.clone().addScaledVector(dir, t), normal: origin.clone().addScaledVector(dir, t).sub(part.pos).normalize() }; } }
    rc.set(origin, dir); rc.far = best.t; const hits = rc.intersectObject(app.entities.group, true);
    for (const h of hits) { let o = h.object, vis = true; while (o) { if (o.visible === false) vis = false; o = o.parent; } if (!vis) continue; const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0); best = { t: h.distance, kind: 'entity', point: h.point.clone(), normal: n }; break; }
    const tp = app.terrain.ray(origin, dir); if (tp) { const t = tp.distanceTo(origin); if (t < best.t) { const wet = tp.y < app.water.level; best = { t, kind: wet ? 'water' : 'terrain', point: tp.clone(), normal: new THREE.Vector3(0, 1, 0) }; } }
    return best;
  }
  S.trace = trace;
  const fwd = () => { const c = app.cam; return d3.set(-Math.sin(c.yaw) * Math.cos(S.lp), Math.sin(S.lp), -Math.cos(c.yaw) * Math.cos(S.lp)).normalize(); };
  function fire() {
    const W = WEAPONS[S.wid], A = S.ammo[S.wid]; if (!S.active || S.fireCd > 0 || S.reloading > 0 || !model) return false;
    if (A.mag <= 0) { play('snd-weapon_change.ogg', 0.25, 1.6); if (A.reserve > 0) reload(); S.fireCd = 0.25; return false; }
    A.mag--; S.shots++; S.fireCd = 1 / W.rate;
    let res = null; for (let n = 0; n < (W.pellets || 1); n++) res = pellet(W, n === 0);
    refreshHud(); return res;
  }
  function pellet(W, first) {
    const dir = fwd().clone(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(dir, up).normalize(), up2 = new THREE.Vector3().crossVectors(right, dir);
    const sprd = (W.spread + (first ? S.spread : 0)) * (1 - S.ads * 0.65) * (player.onGround ? 1 : 2.2) * (1 + Math.min(1, player.speed / 6)); const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * sprd; dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
    const origin = camera.position.clone(); let hit = trace(origin, dir, W.range);
    { const ps = app.boulders.items.filter(b => b.body && !b.held).map(b => b.mesh); if (ps.length) { rc.set(origin, dir); rc.far = hit.t; const ph = rc.intersectObjects(ps, true)[0]; if (ph) { let o = ph.object, pr = null; while (o && !(pr = o.userData.prop)) o = o.parent; if (pr && pr.body) hit = { t: ph.distance, kind: 'prop', prop: pr, point: ph.point.clone(), normal: ph.face ? ph.face.normal.clone().transformDirection(ph.object.matrixWorld) : new THREE.Vector3(0, 1, 0) }; } } } const end = origin.clone().addScaledVector(dir, hit.t); const mp = muzzle.getWorldPosition(new THREE.Vector3());
    // tracer starts at the muzzle (as seen through the viewmodel camera, which is the main camera), drawn in the world
    const tr = tracers.find(x => !x.m.visible) || tracers[0]; const from = mp.clone(); tr.t = 0.09; tr.m.visible = true; const len = from.distanceTo(end); tr.m.position.copy(from).add(end).multiplyScalar(0.5); tr.m.scale.set(0.012, 0.012, len); tr.m.lookAt(end);
    if (first) S.rpv += W.recoil * (1 - S.ads * 0.35); S.kick = Math.min(1, S.kick + 1); S.spread = Math.min(W.grow * 6, S.spread + W.grow); S.flashT = 0.05; flash.visible = true; flash.rotation.z = Math.random() * 6; flash.scale.setScalar(0.8 + Math.random() * 0.6); flashLight.intensity = 5; worldLight.position.copy(mp); worldLight.intensity = 30;
    if (first) { if (W.synth && app.fx && app.fx.audio) app.fx.play(W.synth, 0.9); else play(W.sound, 0.6, 1); }
    if (hit.kind === 'target') { S.hits++; S.hitT = 0.18; burst(hit.point, 14, 4, [3, 0.9, 0.5], hit.normal); const info = { dmg: W.dmg * (hit.head ? 2 : 1), head: hit.head, point: hit.point, dist: hit.t, weapon: S.wid }; const was = hit.target.alive; hit.target.onHit(info); if (was && !hit.target.alive) { S.killT = 0.3; } hud.hm.classList.toggle('kill', !hit.target.alive); hud.hm.classList.add('on'); play(hit.target.alive ? 'snd-enemy_hurt.ogg' : 'snd-enemy_destroy.ogg', 0.5, 1); }
    else if (hit.kind === 'prop') { const pr = hit.prop, k = Math.min(60, W.dmg * 0.9 * (hit.t > 60 ? 0.6 : 1)); pr.body.applyImpulseAtPoint({ x: dir.x * k, y: dir.y * k + k * 0.08, z: dir.z * k }, { x: hit.point.x, y: hit.point.y, z: hit.point.z }, true); burst(hit.point, 10, 3, [3, 2.4, 1.2], hit.normal); play('snd-enemy_hurt.ogg', 0.2, 1.8); }
    else if (hit.kind === 'entity') { burst(hit.point, 12, 3.4, [3, 2.4, 1.2], hit.normal); decal(hit.point, hit.normal); }
    else if (hit.kind === 'terrain') { burst(hit.point, 10, 2.4, [1.1, 0.95, 0.7], hit.normal); decal(hit.point, hit.normal); }
    else if (hit.kind === 'water') burst(hit.point, 12, 3, [0.7, 0.9, 1.2], hit.normal);
    if (first) refreshHud(); if (app.game && app.game.onShot) app.game.onShot(hit);
    return hit;
  }
  S.fire = fire;
  function reload() { const W = WEAPONS[S.wid], A = S.ammo[S.wid]; if (S.reloading > 0 || A.mag >= W.mag || A.reserve <= 0) return false; S.reloading = W.reload; play('snd-weapon_change.ogg', 0.5, 0.8); refreshHud(); return true; }
  S.reload = reload;
  function finishReload() { const W = WEAPONS[S.wid], A = S.ammo[S.wid], need = W.mag - A.mag, take = Math.min(need, A.reserve); A.mag += take; A.reserve -= take; refreshHud(); }
  S.giveAmmo = n => { for (const id of S.loadout) { S.ammo[id] = S.ammo[id] || { mag: WEAPONS[id].mag, reserve: 0 }; S.ammo[id].reserve += Math.round(n * WEAPONS[id].mag / 12); } refreshHud(); };

  // ---- HUD ----
  const hud = { root: null };
  function buildHud() {
    const r = el('div', 'sw', `<style>
.sw{position:fixed;inset:0;z-index:25;pointer-events:none;font:600 13px/1.2 ui-monospace,Menlo,monospace;color:#fff;display:none}.sw.on{display:block}
.sw .vig{position:absolute;inset:0;opacity:0;transition:opacity .15s;background:radial-gradient(circle at 50% 50%,transparent 38%,rgba(0,0,0,.72) 100%)}
.sw .ch{position:absolute;left:50%;top:50%;width:0;height:0}.sw .ch i{position:absolute;background:#fff;box-shadow:0 0 3px #000a;opacity:.92}
.sw .ch .a{width:2px;height:9px;left:-1px}.sw .ch .b{width:9px;height:2px;top:-1px}.sw .ch .dt{width:3px;height:3px;left:-1.5px;top:-1.5px;border-radius:50%}
.sw .hm{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;transform:rotate(45deg) scale(.7);transition:opacity .12s,transform .12s}.sw .hm.on{opacity:1;transform:rotate(45deg) scale(1)}
.sw .hm:before,.sw .hm:after{content:"";position:absolute;background:#fff;left:12px;top:0;width:2px;height:26px}.sw .hm:after{left:0;top:12px;width:26px;height:2px}.sw .hm.kill:before,.sw .hm.kill:after{background:#ff4a3d}
.sw .amm{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:max(62px,calc(env(safe-area-inset-bottom) + 56px));text-align:right;text-shadow:0 1px 6px #000}.sw .amm b{font-size:34px;letter-spacing:-.02em;display:block;line-height:1}.sw .amm span{opacity:.75;font-size:12px}
.sw .rl{position:absolute;left:50%;top:58%;width:120px;margin-left:-60px;height:3px;background:#fff3;border-radius:2px;overflow:hidden;opacity:0}.sw .rl i{display:block;height:100%;width:0;background:#fff}
.sw .tip{position:absolute;left:50%;top:70%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(20,20,22,.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid #fff3;font-size:12px;white-space:nowrap}
.sw .tb{position:absolute;display:none;pointer-events:auto;border-radius:50%;width:76px;height:76px;border:1px solid #fff4;background:rgba(20,20,22,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;font:600 12px ui-monospace,Menlo,monospace;touch-action:none}
.sw .tb.fire{right:max(24px,env(safe-area-inset-right));bottom:120px;width:88px;height:88px;background:rgba(255,80,60,.5)}.sw .tb.aim{right:120px;bottom:150px;width:64px;height:64px}.sw .tb.rel{right:130px;bottom:84px;width:56px;height:56px}.sw .tb.sw2{right:24px;bottom:222px;width:56px;height:56px}
@media (pointer:coarse){.sw .tb{display:block}.sw .tip{display:none}}
.sw .dmg{position:absolute;inset:0;background:radial-gradient(circle,transparent 45%,rgba(255,30,20,.55));opacity:0;transition:opacity .25s}
@media (prefers-reduced-motion:reduce){.sw .vig,.sw .hm,.sw .dmg{transition:none}}
</style><div class="vig"></div><div class="dmg"></div><div class="ch"><i class="a" style="top:-14px"></i><i class="a" style="top:5px"></i><i class="b" style="left:-14px"></i><i class="b" style="left:5px"></i><i class="dt"></i></div><div class="hm"></div>
<div class="rl"><i></i></div><div class="amm"><b></b><span></span></div><div class="tip">Click to aim · Left mouse fires · Right mouse aims (any gun) · R reloads · 1-4 weapons · Esc frees the mouse</div>
<button class="tb fire" aria-label="Fire">Fire</button><button class="tb aim" aria-label="Aim">Aim</button><button class="tb rel" aria-label="Reload">R</button><button class="tb sw2" aria-label="Switch weapon">⇄</button>`);
    document.body.appendChild(r); hud.root = r; hud.vig = r.querySelector('.vig'); hud.ch = r.querySelector('.ch'); hud.hm = r.querySelector('.hm'); hud.amm = r.querySelector('.amm'); hud.rl = r.querySelector('.rl'); hud.tip = r.querySelector('.tip'); hud.dmg = r.querySelector('.dmg');
    const hold = (b, on, off) => { b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); on(); }); const up = () => off && off(); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); };
    hold(r.querySelector('.fire'), () => { S.trigger = true; }, () => { S.trigger = false; }); hold(r.querySelector('.aim'), () => { S.adsHold = !S.adsHold; }); hold(r.querySelector('.rel'), () => reload()); hold(r.querySelector('.sw2'), () => cycle());
  }
  function refreshHud() { if (!hud.root) return; const W = WEAPONS[S.wid], A = S.ammo[S.wid] || { mag: 0, reserve: 0 }; hud.amm.querySelector('b').textContent = A.mag + ' / ' + W.mag; hud.amm.querySelector('span').textContent = W.name + ' · ' + A.reserve + ' in reserve'; }
  S.hurt = () => { if (!hud.dmg) return; hud.dmg.style.opacity = 1; setTimeout(() => { hud.dmg.style.opacity = 0; }, 160); };
  function cycle() { const i = S.loadout.indexOf(S.wid); equip(S.loadout[(i + 1) % S.loadout.length]); play('snd-weapon_change.ogg', 0.4, 1); }

  // ---- input ----
  const sens = 0.0022;
  S.look = (dx, dy) => { const c = app.cam; c.yaw -= dx * sens * (1 - S.ads * 0.45); S.lp = clamp(S.lp - dy * sens * (1 - S.ads * 0.45), -1.45, 1.45); };
  const onMove = e => { if (!S.active || document.pointerLockElement !== app.renderer.domElement) return; S.look(e.movementX, e.movementY); if (e.buttons !== undefined) { S.trigger = !!(e.buttons & 1); S.adsHold = !!(e.buttons & 2); } };
  // Mouse buttons are read from the `buttons` bitmask: holding right-click (aim) and then pressing left-click sends NO pointerdown (only a pointermove), so reading e.button alone made it impossible to fire while aiming.
  const syncMouse = e => { if (!S.active || e.pointerType === 'touch') return; S.trigger = !!(e.buttons & 1); S.adsHold = !!(e.buttons & 2); };
  const onDown = e => { if (!S.active || app.ui.modalOpen()) return; const cv = renderer.domElement; if (e.target !== cv) return; if (e.pointerType === 'mouse' && document.pointerLockElement !== cv) { cv.requestPointerLock && cv.requestPointerLock(); audio(); return; } syncMouse(e); };
  const onUp = e => { if (e.pointerType === 'touch') return; syncMouse(e); };
  const onKey = e => { if (!S.active || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; const k = e.key.toLowerCase(); let used = true; if (k === 'r') reload(); else if (k === '1') { if (S.loadout[0] !== S.wid) { equip(S.loadout[0]); play('snd-weapon_change.ogg', 0.4); } } else if (k === '2') { if (S.loadout[1] && S.loadout[1] !== S.wid) { equip(S.loadout[1]); play('snd-weapon_change.ogg', 0.4); } } else if (k === '3' || k === '4') { const w = S.loadout[+k - 1]; if (w && w !== S.wid) { equip(w); play('snd-weapon_change.ogg', 0.4); } } else if (k === 'q' || k === 'v') { if (k === 'v') exit(); else cycle(); } else if (k === 'e' || k === 'b' || k === 'f' || (k >= '5' && k <= '8')) { if (k === 'e') { exit(); } } else used = false; if (used) { e.preventDefault(); e.stopImmediatePropagation(); } };
  addEventListener('mousemove', onMove); addEventListener('pointermove', e => { if (S.active && e.pointerType === 'mouse' && document.pointerLockElement === app.renderer.domElement) syncMouse(e); }, true); addEventListener('pointerdown', onDown, true); addEventListener('pointerup', onUp, true); addEventListener('keydown', onKey, true);
  addEventListener('keydown', e => { if (e.code !== 'KeyV' || e.repeat || S.active || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || (app.session.owner() !== 'play') || app.mode !== 'explore') return; S.enter({}); });
  document.addEventListener('pointerlockchange', () => { S.locked = document.pointerLockElement === renderer.domElement; if (hud.tip) hud.tip.style.display = S.locked ? 'none' : ''; });

  // ---- lifecycle ----
  S.enter = async (opts = {}) => {
    if (S.active) return; S.loadout = opts.loadout || S.loadout; S.active = true; app.session.enter('fps'); S.fov0 = camera.fov; S.lp = 0; S.ammo = {}; S.shots = S.hits = 0; app.mode !== 'explore' && app.setMode('explore'); if (!hud.root) buildHud(); hud.root.classList.add('on'); app.character.root.visible = false;
    app.post.set({ on: true }); app.post.overlay = vm; await equip(S.loadout[0]); app.ui.say('Shooting: WASD move · mouse look · click to aim', 5000);
  };
  function exit() { if (!S.active) return; S.active = false; app.session.leave('fps'); S.trigger = false; S.adsHold = false; if (document.pointerLockElement) document.exitPointerLock(); hud.root && hud.root.classList.remove('on'); app.character.root.visible = true; camera.fov = S.fov0; camera.updateProjectionMatrix(); app.post.set({ on: false }); app.post.overlay = null; if (app.game && app.game.active) app.game.stop(); }
  S.exit = exit;
  S.cameraUpdate = () => {
    const W = WEAPONS[S.wid], c = app.cam; const eye = camera.position.set(player.pos.x, player.pos.y + 1.62 + Math.sin(S.bob) * 0.012 * Math.min(1, player.speed / 5), player.pos.z);
    const pitch = S.lp + S.rp; camera.up.set(0, 1, 0); camera.lookAt(eye.x - Math.sin(c.yaw) * Math.cos(pitch), eye.y + Math.sin(pitch), eye.z - Math.cos(c.yaw) * Math.cos(pitch));
    const f = lerp(S.fov0 + 12, W.fov, S.ads); if (Math.abs(camera.fov - f) > 0.02) { camera.fov = f; camera.updateProjectionMatrix(); }
  };
  S.update = dt => {
    if (!S.active) return; if (app.mode !== 'explore') { exit(); return; }
    const W = WEAPONS[S.wid]; S.ads = lerp(S.ads, S.adsHold ? 1 : 0, 1 - Math.exp(-16 * dt)); S.fireCd = Math.max(0, S.fireCd - dt); S.spread = Math.max(0, S.spread - dt * W.grow * 6);
    if (S.reloading > 0) { S.reloading -= dt; if (S.reloading <= 0) { S.reloading = 0; finishReload(); } }
    if (S.trigger && (W.auto || !S.fired)) { if (fire()) S.fired = true; } if (!S.trigger) S.fired = false;
    S.rpv -= S.rpv * Math.min(1, dt * 9) * 0.5; S.rp += S.rpv * dt * 40; S.rpv *= Math.max(0, 1 - dt * 8); S.rp -= S.rp * Math.min(1, dt * 7); S.kick = Math.max(0, S.kick - dt * 9);
    S.bob += dt * (player.onGround ? player.speed * 1.6 : 0);
    // viewmodel follows the camera, with kick back, sway and the aim offset
    root.position.copy(camera.position); root.quaternion.copy(camera.quaternion);
    const a = S.ads, off = W.pos, bobx = Math.cos(S.bob * 0.5) * 0.006 * (1 - a), boby = Math.abs(Math.sin(S.bob)) * 0.006 * (1 - a), rl = S.reloading > 0 ? Math.sin(Math.min(1, 1 - S.reloading / W.reload) * Math.PI) : 0;
    const dl = S.dotLocal || new THREE.Vector3(0, 0, -0.3), sx = lerp(off[0], -dl.x, a), sy = lerp(off[1], -dl.y, a), sz = lerp(off[2], -0.3 - dl.z, a);
    holder.position.set(sx + bobx, sy + boby - rl * 0.16, sz + S.kick * 0.05 * (1 - a * 0.5)); holder.rotation.set(S.kick * 0.09 + rl * 0.6, 0, rl * -0.35);
    if (S.flashT > 0) { S.flashT -= dt; if (S.flashT <= 0) { flash.visible = false; flashLight.intensity = 0; worldLight.intensity = 0; } }
    flash.position.copy(root.worldToLocal(muzzle.getWorldPosition(new THREE.Vector3()))); flash.quaternion.identity();
    tracers.forEach(t => { if (t.m.visible) { t.t -= dt; t.m.material.opacity = Math.max(0, t.t / 0.09); if (t.t <= 0) t.m.visible = false; } });
    for (let i = 0; i < NS; i++) { if (sp.life[i] > 0) { sp.life[i] -= dt; sp.vel[i * 3 + 1] -= 9 * dt; sp.pos[i * 3] += sp.vel[i * 3] * dt; sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt; sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt; if (sp.life[i] <= 0) sp.pos[i * 3 + 1] = -999; } }
    sg.attributes.position.needsUpdate = true;
    if (hud.root) { hud.vig.style.opacity = String(S.ads * 0.9); const gap = 6 + (W.spread + S.spread) * 700 * (1 - S.ads); hud.ch.style.opacity = String(1 - S.ads); hud.ch.querySelectorAll('.a')[0].style.top = -(gap + 9) + 'px'; hud.ch.querySelectorAll('.a')[1].style.top = gap + 'px'; hud.ch.querySelectorAll('.b')[0].style.left = -(gap + 9) + 'px'; hud.ch.querySelectorAll('.b')[1].style.left = gap + 'px'; hud.rl.style.opacity = S.reloading > 0 ? 1 : 0; hud.rl.firstChild.style.width = (S.reloading > 0 ? (1 - S.reloading / W.reload) * 100 : 0) + '%'; if (S.hitT > 0) { S.hitT -= dt; if (S.hitT <= 0) hud.hm.classList.remove('on'); } }
  };
  S.render = () => { if (!S.active) return false; app.post.render(); return true; };
  // turn the view to look at a world point (used by the game layer, tests and the pad)
  S.aim = p => { const e = new THREE.Vector3(player.pos.x, player.pos.y + 1.62, player.pos.z), d = p.clone().sub(e); app.cam.yaw = Math.atan2(-d.x, -d.z); S.lp = Math.atan2(d.y, Math.hypot(d.x, d.z)); S.rp = 0; S.rpv = 0; };
  S.stats = () => ({ shots: S.shots, hits: S.hits, ammo: S.ammo[S.wid], weapon: S.wid });
  return S;
}
