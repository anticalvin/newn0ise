// Game layer for Core: small rule sets that run on the engine's own pieces (islands, entities, physics, the shooter). Three styles ship as proof the engine can host games:
//   range  - first-person target practice: steel plates and paper silhouettes at distance, a clock, headshot bonus
//   arena  - first-person survival: waves of flying drones chase you, health, ammo drops, three waves to clear
//   coins  - third-person platforming: collect coins across floating platforms against a clock and plant the flag
// A game is {start, update(dt), onShot}. It owns its meshes (in one group, disposed on stop), exposes `targets` to the shooter, and reports through a small HUD.
import * as THREE from 'three';

const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const BEST = k => 'n0.core.best.' + k;

export function createGame(app) {
  const { scene, player } = app; const G = { active: false, kind: null, score: 0, time: 0, health: 100, wave: 0, over: false, result: null, targets: app.shooter ? app.shooter.targets : null };
  const group = new THREE.Group(); group.name = 'game'; scene.add(group); const rnd = (a, b) => a + Math.random() * (b - a);
  let hud = null, stepFn = null, shotFn = null, drones = [], plates = [], coins = [], flag = null, goal = null;
  const T = () => app.shooter.targets;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: 0.7, roughness: 0.35 }), red = new THREE.MeshStandardMaterial({ color: 0xc6402f, roughness: 0.6 }), paper = new THREE.MeshStandardMaterial({ color: 0xece5d3, roughness: 0.95, side: THREE.DoubleSide }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.7 });

  function buildHud() {
    if (hud) return; hud = el('div', 'gm', `<style>
.gm{position:fixed;left:0;right:0;top:calc(66px + env(safe-area-inset-top));z-index:24;display:flex;justify-content:center;pointer-events:none;font:600 13px/1.2 ui-monospace,Menlo,monospace;color:#fff}
.gm .bar{display:flex;gap:18px;padding:10px 18px;border-radius:999px;background:rgba(20,20,22,.58);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid #fff3}.gm .bar b{font-size:16px}.gm .bar span{opacity:.7;margin-right:5px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
.gm .res{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:22px 26px;border-radius:24px;background:rgba(20,20,22,.78);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid #fff3;text-align:center;pointer-events:auto;min-width:260px}
.gm .res h2{margin:0 0 6px;font:650 22px ui-sans-serif,system-ui}.gm .res p{margin:4px 0;opacity:.8}.gm .res button{min-height:44px;min-width:110px;margin:12px 4px 0;border-radius:22px;border:1px solid #fff4;background:rgba(255,255,255,.1);color:#fff;font:inherit;cursor:pointer}.gm .res button.pri{background:#fff;color:#111}
.gm .hp{width:120px;height:6px;border-radius:3px;background:#fff3;overflow:hidden;align-self:center}.gm .hp i{display:block;height:100%;background:#fff;width:100%;transition:width .15s}
</style><div class="bar"></div>`); document.body.appendChild(hud); }
  const bar = () => hud.querySelector('.bar');
  function paint() { if (!hud) return; const b = bar(); const sc = `<div><span>Score</span><b>${Math.round(G.score)}</b></div>`;
    if (G.kind === 'range') b.innerHTML = sc + `<div><span>Time</span><b>${Math.max(0, Math.ceil(G.time))}</b></div><div><span>Hits</span><b>${app.shooter.stats().hits}/${app.shooter.stats().shots}</b></div>`;
    else if (G.kind === 'arena') b.innerHTML = sc + `<div><span>Wave</span><b>${G.wave}/3</b></div><div><span>Left</span><b>${drones.filter(d => d.alive).length}</b></div><div class="hp"><i style="width:${Math.max(0, G.health)}%"></i></div>`;
    else if (G.kind === 'coins') b.innerHTML = sc + `<div><span>Coins</span><b>${G.got}/${G.total}</b></div><div><span>Time</span><b>${Math.max(0, Math.ceil(G.time))}</b></div>`; }
  function finish(title, lines) {
    if (G.over) return; G.over = true; const best = +localStorage.getItem(BEST(G.kind)) || 0; if (G.score > best) { try { localStorage.setItem(BEST(G.kind), String(Math.round(G.score))); } catch (e) { /* storage full */ } }
    G.result = { title, score: Math.round(G.score), best: Math.max(best, Math.round(G.score)) }; if (document.pointerLockElement) document.exitPointerLock();
    const r = el('div', 'res', `<h2>${title}</h2>${lines.map(l => '<p>' + l + '</p>').join('')}<p>Score ${Math.round(G.score)} · Best ${G.result.best}</p><button class="pri" data-a="again">Play again</button><button data-a="quit">Leave</button>`);
    r.onclick = e => { const a = e.target.dataset && e.target.dataset.a; if (a === 'again') { r.remove(); const k = G.kind; G.stop(true); G.start(k); } else if (a === 'quit') { r.remove(); G.stop(); } }; hud.appendChild(r); G.resultEl = r;
  }

  // ---- shared target kinds ----
  function addPlate(x, z, dist, kind = 'steel') {
    const y = app.terrain.hAt(x, z), g = new THREE.Group(), post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), dark); post.position.y = 0.55; g.add(post);
    const face = new THREE.Group(), disc = kind === 'steel' ? new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 28), steel) : new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.95), paper); if (kind === 'steel') disc.rotation.x = Math.PI / 2;
    face.add(disc); if (kind === 'steel') { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24), red); ring.position.z = 0.04; face.add(ring); } else { const head = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), red); head.position.set(0, 0.28, 0.01); face.add(head); const body = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.5), dark); body.position.set(0, -0.12, 0.005); face.add(body); }
    face.position.y = kind === 'steel' ? 1.25 : 1.15; g.add(face); g.position.set(x, y, z); g.lookAt(0, y, 0); g.traverse(n => { if (n.isMesh) n.castShadow = true; }); group.add(g);
    const t = { alive: true, kind, mesh: g, face, pos: new THREE.Vector3(x, y + face.position.y, z), r: kind === 'steel' ? 0.36 : 0.38, dist, down: 0, respawn: 0,
      parts() { return kind === 'steel' ? [{ pos: this.pos, r: this.r, head: false }] : [{ pos: this.pos.clone().add(new THREE.Vector3(0, 0.28, 0)), r: 0.17, head: true }, { pos: this.pos.clone().add(new THREE.Vector3(0, -0.12, 0)), r: 0.3, head: false }]; },
      onHit(info) { this.alive = false; this.down = 0.0001; this.respawn = 2.6; G.score += 100 + Math.min(150, info.dist * 2.5) + (info.head ? 150 : 0); } };
    T().add(t); plates.push(t); return t;
  }
  function popTargets(dt) { for (const t of plates) { if (!t.alive && t.down > 0) { t.down = Math.min(1, t.down + dt * 4); t.face.rotation.x = -t.down * 1.4; t.respawn -= dt; if (t.respawn <= 0 && !G.over) { t.alive = true; t.down = 0; t.face.rotation.x = 0; } } } }

  // ---- range ----
  function startRange() {
    G.time = 60; G.score = 0; plates = []; const n = 12;
    for (let i = 0; i < n; i++) { const a = (-0.75 + 1.5 * i / (n - 1)) * 0.9 + Math.PI, d = 12 + (i % 4) * 11 + Math.random() * 4, x = Math.sin(a) * d * 0.0 + Math.sin(-0.75 + 1.5 * i / (n - 1)) * d, z = -Math.cos(-0.75 + 1.5 * i / (n - 1)) * d; addPlate(x, z, d, i % 3 === 2 ? 'paper' : 'steel'); }
    stepFn = dt => { G.time -= dt; popTargets(dt); if (G.time <= 0) { const s = app.shooter.stats(); const acc = s.shots ? Math.round(100 * s.hits / s.shots) : 0; finish('Time', [`Accuracy ${acc}% (${s.hits} hits in ${s.shots} shots)`]); } };
  }

  // ---- arena ----
  async function drone(pos) {
    await app.assets.ensure('kenney.drone'); const o = app.assets.instantiate('kenney.drone'); o.scale.setScalar(1.4); const g = new THREE.Group(); g.add(o); g.position.copy(pos); group.add(g); o.traverse(n => { if (n.isMesh) n.castShadow = true; });
    const d = { alive: true, mesh: g, pos: pos.clone().add(new THREE.Vector3(0, 0.5, 0)), r: 0.5, hp: 40 + G.wave * 12, speed: 2.6 + G.wave * 0.8, atk: 0, phase: Math.random() * 6, hurtT: 0,
      onHit(info) { this.hp -= info.dmg; this.hurtT = 0.12; if (this.hp <= 0) { this.alive = false; this.t = 0; G.score += 100 + G.wave * 25; if (Math.random() < 0.35) pickups.push(mkPickup(this.pos.clone())); } } };
    T().add(d); drones.push(d); return d;
  }
  const pickups = []; const pickMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 0.8), toneMapped: false });
  function mkPickup(p) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), pickMat); m.position.copy(p); m.position.y = app.terrain.hAt(p.x, p.z) + 0.8; group.add(m); return { m, t: 0 }; }
  async function spawnWave() { G.wave++; const n = 3 + G.wave * 2; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = 38 + Math.random() * 6; await drone(new THREE.Vector3(Math.cos(a) * r, 3 + Math.random() * 2, Math.sin(a) * r)); } G.spawning = false; }
  function startArena() {
    G.health = 100; G.score = 0; G.wave = 0; G.nextWave = 0; drones = []; G.spawning = true; spawnWave();
    stepFn = dt => {
      const pp = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
      for (const d of drones) { if (d.alive) { d.phase += dt * 2; const dir = pp.clone().sub(d.pos), dist = dir.length(); dir.normalize(); d.pos.addScaledVector(dir, Math.min(dist - 1.3, d.speed * dt)); d.pos.y += Math.sin(d.phase) * 0.01; d.mesh.position.copy(d.pos).add(new THREE.Vector3(0, -0.5, 0)); d.mesh.lookAt(pp.x, d.mesh.position.y, pp.z); d.mesh.rotation.z = Math.sin(d.phase * 0.7) * 0.15;
          if (dist < 1.9) { d.atk -= dt; if (d.atk <= 0) { d.atk = 0.9; G.health -= 8 + G.wave * 2; app.shooter.hurt(); app.shooter.play('snd-enemy_attack.ogg', 0.5); } } }
        else if (d.t !== undefined) { d.t += dt * 3; d.mesh.scale.setScalar(Math.max(0.001, 1 - d.t)); d.mesh.position.y += dt * 2; if (d.t >= 1) { group.remove(d.mesh); T().delete(d); d.t = undefined; } } }
      for (const k of pickups.slice()) { k.t += dt; k.m.rotation.y += dt * 3; k.m.position.y += Math.sin(k.t * 3) * 0.003; if (k.m.position.distanceTo(pp) < 1.4) { app.shooter.giveAmmo(18); G.health = Math.min(100, G.health + 12); group.remove(k.m); pickups.splice(pickups.indexOf(k), 1); app.shooter.play('plat-snd-coin.ogg', 0.5); } }
      if (!G.spawning && !drones.some(d => d.alive)) { if (G.wave >= 3) { G.score += G.health * 5; finish('You cleared the arena', [`Health left ${Math.max(0, Math.round(G.health))}`]); } else { G.spawning = true; G.nextWave = 1.8; } }
      if (G.nextWave > 0) { G.nextWave -= dt; if (G.nextWave <= 0) { G.nextWave = 0; spawnWave(); } }
      if (G.health <= 0) finish('You were overrun', [`Reached wave ${G.wave}`]);
    };
  }

  // ---- coins: third-person platforming over floating platforms ----
  async function startCoins() {
    G.time = 75; G.score = 0; G.got = 0; coins = []; const path = [[0, 6, 1.0], [3, 10, 1.7], [-2, 14, 2.4], [-6, 18, 3.1], [-3, 23, 3.8], [3, 25, 4.5], [8, 21, 5.2], [10, 15, 5.9], [8, 9, 6.6]];
    await app.assets.ensure('kenney.platform.medium'); const psz = app.assets.size('kenney.platform.medium');
    for (const [x, z, h] of path) app.core.exec({ cmd: 'asset.place', assetId: 'kenney.platform.medium', position: [x, app.terrain.hAt(x, z) + h - psz[1] * 2.2, z], scale: 2.2 });
    await app.assets.ensure('kenney.coin'); await app.assets.ensure('kenney.flag');
    path.forEach(([x, z, h], i) => { if (i === 0) return; const o = app.assets.instantiate('kenney.coin'); o.scale.setScalar(2.4); const g = new THREE.Group(); g.add(o); g.position.set(x, app.terrain.hAt(x, z) + h + 0.9, z); group.add(g); coins.push({ g, taken: false }); });
    G.total = coins.length; const last = path[path.length - 1]; const f = app.assets.instantiate('kenney.flag'); f.scale.setScalar(2.4); flag = new THREE.Group(); flag.add(f); flag.position.set(last[0] + 0.8, app.terrain.hAt(last[0], last[1]) + last[2] + 0.1, last[1]); group.add(flag); goal = flag.position.clone();
    app.cam.dist = 7;
    stepFn = dt => { G.time -= dt; const pp = player.pos;
      for (const c of coins) { if (c.taken) { c.g.scale.multiplyScalar(0.8); c.g.position.y += dt * 2; continue; } c.g.rotation.y += dt * 3; if (Math.hypot(c.g.position.x - pp.x, c.g.position.z - pp.z) < 1.3 && Math.abs(c.g.position.y - (pp.y + 1)) < 1.8) { c.taken = true; G.got++; G.score += 100; app.shooter.play('plat-snd-coin.ogg', 0.6); } }
      if (G.got >= G.total && Math.hypot(goal.x - pp.x, goal.z - pp.z) < 2.2 && Math.abs(goal.y - pp.y) < 2) { G.score += Math.max(0, G.time) * 10; finish('Flag planted', [`${G.got} coins with ${Math.ceil(G.time)} s left`]); }
      else if (G.time <= 0) finish('Time is up', [`${G.got} of ${G.total} coins`]);
      if (pp.y < app.water.level - 1.5) { app.teleport(0, 3); }
    };
  }

  G.start = async kind => {
    if (G.active) G.stop(true); G.kind = kind; G.over = false; G.result = null; G.active = true; buildHud(); app.worldModes.prepare({ range: 'Shooting range', arena: 'Drone arena', coins: 'Coin run' }[kind]);
    app.cam.yaw = 0; app.shooter.lp = 0;
    if (kind === 'range') { startRange(); await app.shooter.enter({ loadout: ['pistol', 'repeater'] }); }
    else if (kind === 'arena') { startArena(); await app.shooter.enter({ loadout: ['repeater', 'pistol'] }); }
    else if (kind === 'coins') await startCoins();
    G.name = kind; paint(); app.ui.updHist(); return true;
  };
  G.stop = (quiet) => { if (!G.active) return; G.active = false; stepFn = null; T().clear(); plates = []; drones = []; pickups.length = 0; coins = []; while (group.children.length) { const c = group.children.pop(); c.traverse(n => { if (n.geometry && n.geometry.dispose) { /* shared geometry stays */ } }); } if (G.resultEl) { G.resultEl.remove(); G.resultEl = null; } if (hud) { hud.remove(); hud = null; } app.shooter.exit(); };
  G.update = dt => { if (!G.active || !stepFn || G.over) { if (G.active && hud) paint(); return; } stepFn(dt); paint(); };
  G.state = () => ({ kind: G.kind, active: G.active, over: G.over, score: Math.round(G.score), time: G.time, health: G.health, wave: G.wave, targets: [...T()].filter(t => t.alive).length, got: G.got, total: G.total, result: G.result });
  G.targets = () => [...T()];
  G.coinList = () => coins.map(c => c.g.position.clone()); G.goalPos = () => goal && goal.clone();
  G.BEST = BEST;
  return G;
}
