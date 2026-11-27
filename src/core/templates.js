// Project templates and starters are DATA run through the ordinary command boundary (scene.new, terrain.stroke, entity.create, prefab.build, boulder.drop).
// There is no special-purpose map runtime: a starter is just entities you can select, move and delete like any others.
// Units: metres. The local world is 256 x 256 m, x and z from -128 to 128, ground at y = 1.2 on the flat presets. Forward at spawn is +z.
export const GROUND = 1.2;
export const TEMPLATES = [
  { id: 'third', name: 'Third person', icon: 'person', ready: true, mode: 'explore', starters: ['playground', 'grid', 'terrain'], dflt: 'playground', blurb: 'Walk, jump and test mechanics with the existing follow-camera player.', meta: 'Movement · follow camera' },
  { id: 'first', name: 'First person', icon: 'view', ready: false, blurb: 'Needs a first-person camera mode and head-clip handling, which Core does not have yet.', meta: 'Camera · interaction' },
  { id: 'driving', name: 'Driving', icon: 'car', ready: false, blurb: 'Needs the shared vehicle system in the local runtime. The car exists in South Africa and FIRST LIGHT only.', meta: 'Suspension · drivetrain' },
  { id: 'architecture', name: 'Architecture', icon: 'house', ready: true, mode: 'edit', starters: ['grid', 'terrain'], dflt: 'grid', kit: true, blurb: 'Editor camera and a modular room: floor, walls with real door and window openings.', meta: 'Rooms · openings · editor camera' },
  { id: 'open', name: 'Open world', icon: 'earth', ready: false, blurb: 'A general streamed world needs project-level geo import. South Africa is available under Examples.', meta: 'Terrain · regions · population' },
  { id: 'empty', name: 'Empty', icon: 'box', ready: true, mode: 'edit', starters: ['grid', 'terrain', 'playground'], dflt: 'grid', blurb: 'Nothing but ground, in the editor camera.', meta: 'Scene · terrain · physics' },
];
export const STARTERS = {
  playground: { name: 'Mechanics Playground', blurb: 'PROVING GROUND 01: measured ramps, stairs, ledges, vaults, targets and an interaction room.' },
  grid: { name: 'Empty Grid', blurb: 'Dry, flat, neutral ground with a 1 m / 10 m grid. No island props.' },
  terrain: { name: 'Outdoor Terrain', blurb: 'Sculptable land with low hills, scattered palms and rocks.' },
};

const box = (id, pos, size, o = {}) => ({ cmd: 'entity.create', prefab: 'prim.box', id, position: pos, ...(o.rot ? { rotationDeg: o.rot } : {}), parameters: { size, color: o.color || '#b9b4ac' }, ...(o.tags ? { tags: o.tags } : {}) });
const cyl = (id, pos, size, o = {}) => ({ cmd: 'entity.create', prefab: 'prim.cylinder', id, position: pos, parameters: { size, color: o.color || '#b9b4ac' }, ...(o.tags ? { tags: o.tags } : {}) });
const G = GROUND;
const on = (h) => G + h / 2;

// a room with a door opening in the front (-z) wall and a window in the back wall. All wall pieces are ordinary boxes.
export function roomKit(prefix, cx, cz, w = 8, d = 6, h = 2.8) {
  const t = 0.2, dw = 1.0, dh = 2.1, ww = 1.6, wy = 1.0, wh = 1.0, out = [];
  out.push(box(`${prefix}_floor`, [cx, G + 0.05, cz], [w, 0.1, d], { color: '#9a978f' }));
  const fz = cz - d / 2 + t / 2, sideW = (w - dw) / 2;
  out.push(box(`${prefix}_front_l`, [cx - dw / 2 - sideW / 2, on(h), fz], [sideW, h, t]), box(`${prefix}_front_r`, [cx + dw / 2 + sideW / 2, on(h), fz], [sideW, h, t]), box(`${prefix}_door_lintel`, [cx, G + dh + (h - dh) / 2, fz], [dw, h - dh, t]));
  const bz = cz + d / 2 - t / 2, bs = (w - ww) / 2;
  out.push(box(`${prefix}_back_l`, [cx - ww / 2 - bs / 2, on(h), bz], [bs, h, t]), box(`${prefix}_back_r`, [cx + ww / 2 + bs / 2, on(h), bz], [bs, h, t]), box(`${prefix}_sill`, [cx, G + wy / 2, bz], [ww, wy, t]), box(`${prefix}_window_head`, [cx, G + wy + wh + (h - wy - wh) / 2, bz], [ww, h - wy - wh, t]));
  out.push(box(`${prefix}_wall_w`, [cx - w / 2 + t / 2, on(h), cz], [t, h, d - 2 * t]), box(`${prefix}_wall_e`, [cx + w / 2 - t / 2, on(h), cz], [t, h, d - 2 * t]), box(`${prefix}_roof`, [cx, G + h + 0.1, cz], [w + 0.4, 0.2, d + 0.4], { color: '#8d8a83' }));
  return out;
}

function playground() {
  const c = [], deg = a => a * Math.PI / 180;
  // Zone 1: ramps of 10, 20, 30 and 40 degrees, 6 m long, 4 m wide
  [10, 20, 30, 40].forEach((a, i) => { const L = 6, x = -9 + i * 6, z0 = 6, rise = L * Math.sin(deg(a)); c.push(box(`pg1_ramp_${a}`, [x, G + rise / 2, z0 + L * Math.cos(deg(a)) / 2], [4, 0.3, L], { rot: [-a, 0, 0] })); });
  // Zone 2: stairs, 0.18 m rise and 0.3 m run, ten steps and a landing
  for (let i = 0; i < 10; i++) c.push(box(`pg2_step_${i + 1}`, [-24, on((i + 1) * 0.18), 6 + 0.3 * i + 0.15], [2, (i + 1) * 0.18, 0.3], { color: '#a9a69e' }));
  c.push(box('pg2_landing', [-24, on(1.8), 10.8], [2, 1.8, 2.4], { color: '#a9a69e' }));
  // Zone 3: ledges at 0.5, 1.0, 1.5, 2.0 and 3.0 m
  [0.5, 1, 1.5, 2, 3].forEach((h, i) => c.push(box(`pg3_ledge_${h}`, [22, on(h), 6 + i * 5], [3, h, 3], { color: '#aaa79f' })));
  // Zone 4: low vaults 0.5, 0.9, 1.2 and 1.6 m
  [0.5, 0.9, 1.2, 1.6].forEach((h, i) => c.push(box(`pg4_vault_${h}`, [-9 + i * 6, on(h), 22], [3, h, 0.4], { color: '#8f8c85' })));
  // Zone 5: climb and drop, a stepped tower of 1, 2, 3 and 4 m
  [1, 2, 3, 4].forEach((h, i) => c.push(box(`pg5_tower_${h}`, [-24 + i * 2.5, on(h), 26], [2.5, h, 3], { color: '#a3a098' })));
  // Zone 6: virtual target range, fictional targets at 12, 18 and 24 m
  [[-6, 40], [0, 40], [6, 40], [-3, 46], [3, 46], [0, 52]].forEach(([x, z], i) => c.push(cyl(`pg6_target_${i + 1}`, [x, G + 0.9, z], [0.8, 1.8, 0.8], { color: '#c46a5a', tags: ['target'] })));
  c.push(box('pg6_firing_line', [0, G + 0.01, 33], [18, 0.02, 0.2], { color: '#e8e1d5' }));
  // Zone 7: slalom of eight posts, 5 m apart, offset in turn
  for (let i = 0; i < 8; i++) c.push(cyl(`pg7_slalom_${i + 1}`, [34 + (i % 2 ? 2.5 : -2.5), G + 0.5, 4 + i * 5], [0.6, 1, 0.6], { color: '#d9a441' }));
  // Zone numbers: a row of 1..8 small posts at each zone start, along z = -4
  const startX = [-9, -24, 22, -9, -24, 0, 34], startZ = [3, 3, 3, 19, 23, 37, 1];
  startX.forEach((x, zi) => { for (let k = 0; k <= zi; k++) c.push(box(`pgn_${zi + 1}_${k + 1}`, [x - zi * 0.2 + k * 0.4, G + 0.6, startZ[zi] - 1.5], [0.15, 1.2, 0.15], { color: '#e8e1d5' })); });
  // Zone 8: interaction room (a real convenience store with a working door and products)
  c.push({ cmd: 'prefab.build', type: 'retail.convenience', id: 'pg8_store', seed: 42, at: [-42, 30] });
  return c;
}

export function applyTemplate(app, tplId, starter) {
  const core = app.core, t = TEMPLATES.find(x => x.id === tplId);
  if (!t || !t.ready) throw new Error('That template is not available yet');
  if (!(starter in STARTERS) || !t.starters.includes(starter)) starter = t.dflt;
  const run = (c) => { const r = core.exec(c); if (!r.ok) throw new Error(`${c.id || c.cmd}: ${r.msg}`); return r; };
  core.muted = true;
  try {
    app.newScene('blank'); app.name = STARTERS[starter].name.toUpperCase();
    app.env.set({ time: 11, cloud: 0.15, wind: 0.2, sea: 0.2, tide: 0 });
    let cmds = [];
    if (starter === 'playground') cmds = playground();
    if (starter === 'terrain') {
      [[-30, 20, 14], [25, 35, 18], [-10, -30, 12], [40, -15, 10]].forEach(([x, z, r]) => cmds.push({ cmd: 'terrain.stroke', tool: 'raise', center: [x, z], radius: r, strength: 1, duration: 2 }));
      cmds.push({ cmd: 'scatter.add', center: [-30, 20], radius: 20, count: 12 }, { cmd: 'scatter.add', center: [25, 35], radius: 22, count: 14 }, { cmd: 'boulder.drop', x: 8, z: 14 }, { cmd: 'boulder.drop', x: -14, z: 8 });
    }
    if (t.kit) cmds.push(...roomKit('room1', 0, 14));
    cmds.forEach(run);
    if (starter === 'playground') [[10, 28], [14, 30], [12, 33]].forEach(([x, z]) => run({ cmd: 'boulder.drop', x, z }));
    app.spawn = [0, -8, 0]; app.player.pos.set(0, 0, -8); app.player.yaw = 0; app.player.pos.y = app.player.groundAt(0, -8); app.player.vel.set(0, 0, 0); app.phys.teleport(app.player);
    if (starter !== 'terrain') { const P = app.terrain.paint; for (let i = 0; i < P.length; i += 4) { P[i] = 255; P[i + 1] = 0; P[i + 2] = 0; } app.terrain.dirtyP = true; }   // neutral rock-grey ground, no sand
    app.setGrid(starter !== 'terrain');
    app.afterTerrain(true);
  } finally { core.muted = false; }
  core.hist = []; core.ptr = 0; core.emit('Created ' + t.name);
  return { mode: t.mode, view: { grid: starter !== 'terrain' } };
}
