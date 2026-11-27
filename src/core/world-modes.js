// The things the old 3D "World" could do, now living in Core: starter level, physics sandbox, proving ground, photo walk, and importing a .n0world file.
// Everything here goes through core.exec (entity.create, boulder.drop, world.import), so it is validated, saved with the scene and undoable like any other Core change.
// No second engine: levels are ordinary Core entities with static colliders, and the photo walk is an overlay on Core's own renderer.
import { createPhotoWalk } from './photowalk.js';

export function createWorldModes(app) {
  const core = app.core, ui = app.ui;
  const ground = (x, z) => app.terrain.hAt(x, z);
  const run = c => { const r = core.exec(c); if (r && r.ok === false) console.warn('world mode', c.cmd, r.msg); return r; };
  const box = (x, z, w, h, d, color, { dy = 0, rotY = 0, rotX = 0, prefab = 'prim.box' } = {}) => run({ cmd: 'entity.create', prefab, position: [x, ground(x, z) + dy, z], rotation: [rotX, rotY, 0], parameters: { size: [w, h, d], color }, tags: ['world-mode'] });
  let watch = null; const stopWatch = () => { if (watch) { clearInterval(watch); watch = null; } };
  const fresh = (name, say, preset = 'blank') => { stopWatch(); photo.stop(); app.newScene(preset); core.hist = []; core.ptr = 0; app.name = name; app.cam.yaw = Math.PI / 2 + .35; app.cam.pitch = .22; app.cam.dist = 6; ui.render(); ui.updHist(); ui.brand(); if (say) ui.say(say, 9000); };
  const photo = createPhotoWalk(app);

  // ---- starter level: a staircase of platforms around the spawn, crates to climb, and a gold goal on top ----
  function starter() {
    fresh('Starter island', 'Reach the gold pillar. WASD to walk, Space to jump.');
    const col = ['#c9c1b3', '#b8afa0', '#a89f91'];
    const steps = [[6, 4, 3, .6], [10, 8, 3, 1.2], [13, 13, 3, 1.8], [12, 19, 3, 2.4], [7, 23, 3, 3.0], [0, 24, 4, 3.6], [-8, 22, 4, 4.2]];
    steps.forEach(([x, z, s, h], i) => box(x, z, s, h, s, col[i % 3]));
    for (const [x, z] of [[-4, 4], [-5, 6], [-3, 7], [3, -6], [4, -7], [-10, -3]]) box(x, z, 1, 1, 1, '#8a6d4b');
    box(-12, 22, 1.4, 6, 1.4, '#e3b341', { prefab: 'prim.cylinder' });
    app.goal = { x: -12, z: 22, r: 2.6, done: false };
    watch = setInterval(() => { if (app.name !== 'Starter island') return stopWatch(); const p = app.player.pos; if (!app.goal.done && Math.hypot(p.x - app.goal.x, p.z - app.goal.z) < app.goal.r && p.y > ground(app.goal.x, app.goal.z) + 3) { app.goal.done = true; ui.say('You reached the goal.', 6000); } }, 250);
  }

  // ---- physics sandbox: a wall of crates and a stack of boulders to knock down ----
  function sandbox() {
    fresh('Physics sandbox', 'Run into the boulders. They roll, bounce and pile up.');
    for (let i = -3; i <= 3; i++) for (let j = 0; j < 4; j++) box(i * 1.1, 12, 1, 1, 1, j % 2 ? '#b8afa0' : '#8a6d4b', { dy: j });
    let n = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { run({ cmd: 'boulder.drop', x: -10 + i * 2.6, z: -6 + j * 2.6, radius: .7 + ((i + j) % 3) * .35, height: 3 + (i + j) * 1.2 }); n++; }
    run({ cmd: 'scatter.add', center: [14, -4], radius: 14, count: 10 });
  }

  // ---- proving ground: an open yard for movement, with ramps, steps, walls, a gap and a slalom ----
  function proving() {
    fresh('Proving ground', 'Test movement: ramps, steps, a gap and a slalom.');
    for (let i = 0; i < 8; i++) box(-12 + i * .8, 6, 4, .25 * (i + 1), .8, '#b8afa0', { rotY: 0 });                 // staircase
    box(0, 8, 4, .2, 8, '#a89f91', { rotX: -.28, dy: .5 }); box(6, 8, 4, .2, 8, '#a89f91', { rotX: -.46, dy: .8 });  // two ramps
    box(14, 8, 5, 1.4, 5, '#c9c1b3'); box(14, 17, 5, 1.4, 5, '#c9c1b3');                                          // a gap to jump
    for (let i = 0; i < 7; i++) box(-8 + i * 2.6, -8 + (i % 2 ? 1.2 : -1.2), .6, 1.6, .6, '#e3b341', { prefab: 'prim.cylinder' }); // slalom
    box(-14, -4, 14, 2.4, .6, '#8a8a84'); box(-14, -10, 14, 1.2, .6, '#8a8a84'); box(-20, -7, .6, 2.4, 6, '#8a8a84');   // walls to climb or vault
    for (const [x, z] of [[8, -6], [9, -7.4], [10, -6]]) box(x, z, 1, 1, 1, '#8a6d4b');
  }

  // ---- importing a .n0world file: the shared schema validates and repairs it, Core places what it can and reports what it cannot ----
  function pickWorld() {
    return new Promise(res => {
      const f = document.createElement('input'); f.type = 'file'; f.accept = '.n0world,.json,application/json'; f.style.display = 'none'; document.body.appendChild(f);
      f.addEventListener('change', async () => { const file = f.files && f.files[0]; f.remove(); if (!file) return res({ ok: false, msg: 'No file chosen' }); try { res({ ok: true, text: await file.text(), name: file.name.replace(/\.[^.]+$/, '') }); } catch (e) { res({ ok: false, msg: 'Could not read that file.' }); } });
      f.addEventListener('cancel', () => { f.remove(); res({ ok: false, msg: 'No file chosen' }); }); f.click();
    });
  }
  async function importWorld() {
    const r = await pickWorld(); if (!r.ok) { ui.say(r.msg, 3000); return r; }
    fresh('Imported world', '');
    const out = run({ cmd: 'world.import', world: r.text, name: r.name });
    if (out && out.ok === false) { ui.say('Could not import that file: ' + out.msg + ' Check that it is a .n0world file.', 8000); return out; }
    ui.render(); ui.updHist(); ui.say('Imported ' + r.name + (out && out.report && out.report.placed != null ? ' · ' + out.report.placed + ' objects placed' : '') + '.', 7000); return out;
  }

  function photowalk() { fresh('Photo walk', '', 'coast'); photo.start(); }

  return { fresh, prepare: name => fresh(name, ''), starter, sandbox, proving, photowalk, importWorld, stop() { stopWatch(); photo.stop(); }, photo };
}
