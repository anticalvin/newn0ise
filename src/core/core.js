// SceneDocument + command boundary. EVERY mutation (UI, gamepad, console, agent) goes through exec(), which validates input, applies it
// within the stated limits, and records ONE reversible history entry. The same exec() is exposed to AI clients through src/studio-api.js
// (cmd:"core") and the MCP bridge (n0_core). Command list: COMMANDS below, documented in docs/CORE.md.
import { clamp } from './util.js';

import { EntityError } from './entities.js';
import { COMMANDS as GEO_COMMANDS } from './geo/manager.js';

export const FORMAT = 'n0ise.core.scene', VERSION = 4;
const KEY = 'n0ise.core.scene', OLD_KEY = 'n0ise.core.coast001';
const num = (v, d, a, b) => (Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, a, b) : d);
const TOOLS = ['raise', 'lower', 'smooth', 'flatten', 'sand', 'rock', 'grass'];

export const LIMITS = { boulders: 60, palms: 1600, radius: 40, strokeSeconds: 3, worldInstances: 500, worlds: 8, undo: 80 };
export const COMMANDS = {
  undo: '{} → undo the last change.',
  redo: '{} → redo.',
  'scene.new': `{preset:"blank"|"coast", seed?:1..99999} → replace the whole scene. blank = flat land (about 1.2 m), sky, sun, a spawn point and nothing else, with sea below the land. coast = the COAST_001 island.`,
  'terrain.stroke': `{tool:"${TOOLS.join('|')}", center:[x,z], radius:1..${LIMITS.radius}, strength:0.05..1, duration:0.05..${LIMITS.strokeSeconds}, invert?} → one brush stroke.`,
  'terrain.reset': '{seed?, preset?:"blank"|"coast"} → regenerate the terrain only; scenery stays.',
  'environment.set': '{time:0..24, cloud:0..1, wind:0..1, windAng:-3.2..3.2, sea:0..1.2, tide:-0.8..0.9} → any subset. water.set is the same command.',
  'scatter.add': `{type?:"palm", center:[x,z], radius:2..60, count:1..60} → palms on dry land (max ${LIMITS.palms}). Generic prefab scatter is planned.`,
  'scatter.erase': '{center:[x,z], radius:1..60} → remove palms in range.',
  'boulder.drop': `{x, z, radius?:0.3..3, height?:2..60} → drop a physics boulder (max ${LIMITS.boulders}).`,
  'player.teleport': '{x, z} → move the character.',
  'spawn.set': '{x, z, yaw?} → where the character starts. With no x,z it uses the character’s current spot.',
  'world.import': `{world:<.n0world object or JSON string>, at?:[x,z], name?} → validate with the shared n0world schema, then place its instances on a flat spot (or at). Returns the full report: placed count, repairs, and everything Core cannot do. Max ${LIMITS.worlds} worlds, ${LIMITS.worldInstances} instances each.`,
  'world.remove': '{index?} → remove an imported world (the last one by default).',
  'entity.create': '{prefab:"prim.box"|"prim.sphere"|"prim.cylinder"|"asset"|"retail.convenience", id?, parent?, position:[x,y,z], rotation:[rx,ry,rz] in radians (or rotationDeg), scale, parameters:{...}, components:{collider:{type:"static"|"none"}, render:{visible}}, tags?, state?} → a placed thing with a stable id. Errors carry {code, path}.',
  'entity.set': '{id, position?, rotation?, rotationDeg?, scale?, parent?, parameters?, components?, state?, tags?} → change one entity.',
  'entity.remove': '{id} → remove it and its children.',
  'entity.inspect': '{id} → the record, bounds, instance and collider counts.',
  'entity.list': '{} → every entity id with its prefab and position.',
  'asset.catalog': '{query?, tags?, category?, limit?} → searchable catalog with size, triangle count and licence for each asset.',
  'asset.inspect': '{id} → full record: licence evidence, anchors, bounds.',
  'asset.place': '{assetId, at?:[x,z] (put on the ground) or position:[x,y,z], rotationDeg?, scale?, id?} → an entity from a catalog asset. Unknown ids fail with code asset.unknown.',
  'prefab.build': '{type:"retail.convenience", id?, seed?, parameters?:{width 8..24, depth 6..16, height 2.4..5, stock 0..1, condition:"new"|"worn", wallColor}, at?:[x,z], yaw?} → an editable store: walls with a door and windows, shelves, a counter and thousands of stocked product instances. Same record, same result.',
  'store.door': '{id?, open?:boolean} → open, close or toggle the store door.',
  'product.take': '{id?, key?} → pick up a product (by key, or the nearest to the player). Saved with the scene.',
  'product.return': '{id?, key?} → put a product back (the last one taken by default).',
  'interact.use': '{} → what the Use button does: take the nearest product, or toggle the nearest door.',
  describe: '{} → this list plus the current limits.',
  state: '{} → a summary of the scene (preset, counts, environment, player, imported worlds).',
};

export class Core {
  constructor(app) { this.a = app; this.hist = []; this.ptr = 0; this.listeners = new Set(); this.saveT = 0; this.limits = LIMITS; this.muted = false; }
  on(fn) { this.listeners.add(fn); }
  emit(label) { this.listeners.forEach(f => f(label)); this.dirty(); }
  push(e) { this.hist.length = this.ptr; this.hist.push(e); this.ptr = this.hist.length; if (this.hist.length > LIMITS.undo) { this.hist.shift(); this.ptr--; } this.emit(e.label); }
  canUndo() { return this.ptr > 0; } canRedo() { return this.ptr < this.hist.length; }
  undo() { if (!this.canUndo()) return { ok: false, msg: 'Nothing to undo' }; const e = this.hist[--this.ptr]; e.undo(); this.emit('Undo ' + e.label); return { ok: true, msg: 'Undid ' + e.label }; }
  redo() { if (!this.canRedo()) return { ok: false, msg: 'Nothing to redo' }; const e = this.hist[this.ptr++]; e.redo(); this.emit('Redo ' + e.label); return { ok: true, msg: 'Redid ' + e.label }; }

  // called by the live brush: commit a finished stroke as one undo entry
  commitStroke(tool, patch) {
    if (!patch) return; const a = this.a;
    this.push({ label: 'terrain.stroke ' + tool, undo: () => { a.terrain.applyPatch(patch, 'before'); a.afterTerrain(); }, redo: () => { a.terrain.applyPatch(patch, 'after'); a.afterTerrain(); } });
    a.afterTerrain();
  }
  // whole-scene history entry from two snapshots
  pushScene(label, before, after) { const a = this.a; this.push({ label, undo: () => a.restoreScene(before), redo: () => a.restoreScene(after) }); }

  exec(cmd) {
    const a = this.a; let c; try { c = typeof cmd === 'string' ? JSON.parse(cmd) : cmd; } catch (e) { return { ok: false, msg: 'Bad JSON' }; }
    if (!c || typeof c.cmd !== 'string') return { ok: false, msg: 'Missing "cmd". Run {"cmd":"describe"} for the list.' };
    try {
      if (c.cmd.startsWith('world.') && c.cmd !== 'world.import' && c.cmd !== 'world.remove' && a.geo) return a.geo.exec(c, this);
      switch (c.cmd) {
        case 'undo': return this.undo();
        case 'redo': return this.redo();
        case 'describe': return { ok: true, commands: { ...COMMANDS, ...GEO_COMMANDS }, limits: LIMITS, units: 'metres, hours, radians for windAng', world: '256 x 256 m, x and z from -128 to 128, y up' };
        case 'state': return { ok: true, ...a.summary() };
        case 'scene.new': {
          const preset = c.preset === 'coast' ? 'coast' : c.preset === 'blank' ? 'blank' : null; if (!preset) return { ok: false, msg: 'preset must be "blank" or "coast"' };
          const before = a.snapshot(); a.newScene(preset, num(c.seed, 101, 1, 99999)); this.pushScene('scene.new ' + preset, before, a.snapshot());
          return { ok: true, msg: preset === 'blank' ? 'Blank scene' : 'Coast demo' };
        }
        case 'terrain.stroke': {
          const [x, z] = c.center || [c.x, c.z]; if (!Number.isFinite(+x) || !Number.isFinite(+z)) return { ok: false, msg: 'center [x,z] required' };
          const tool = TOOLS.includes(c.tool) ? c.tool : null; if (!tool) return { ok: false, msg: 'unknown tool (use ' + TOOLS.join(', ') + ')' };
          const R = num(c.radius, 10, 1, LIMITS.radius), s = num(c.strength, 0.5, 0.05, 1), dur = num(c.duration, 0.6, 0.05, LIMITS.strokeSeconds);
          a.terrain.beginStroke(); for (let i = 0; i < 12; i++) a.terrain.brush(tool, +x, +z, R, s, dur / 12, !!c.invert);
          const patch = a.terrain.endStroke(); if (!patch) return { ok: false, msg: 'Nothing changed' };
          this.commitStroke(tool, patch); return { ok: true, msg: `${tool} @ ${(+x).toFixed(0)},${(+z).toFixed(0)}` };
        }
        case 'terrain.reset': {
          const before = a.snapshotTerrain(), preset = c.preset === 'blank' ? 'blank' : c.preset === 'coast' ? 'coast' : a.terrain.preset;
          a.terrain.generate(num(c.seed, 101, 1, 99999), preset); a.afterTerrain(true); const after = a.snapshotTerrain();
          this.push({ label: 'terrain.reset', undo: () => { a.restoreTerrain(before); }, redo: () => { a.restoreTerrain(after); } }); return { ok: true, msg: 'Terrain regenerated' };
        }
        case 'environment.set': case 'water.set': {
          const keys = ['time', 'cloud', 'wind', 'windAng', 'sea', 'tide'], before = { ...a.env.p }, ch = {};
          const rng = { time: [0, 24], cloud: [0, 1], wind: [0, 1], windAng: [-3.2, 3.2], sea: [0, 1.2], tide: [-0.8, 0.9] };
          for (const k of keys) if (c[k] != null) ch[k] = num(c[k], before[k], rng[k][0], rng[k][1]);
          if (!Object.keys(ch).length) return { ok: false, msg: 'no valid fields' };
          a.env.set(ch); const after = { ...a.env.p };
          this.push({ label: c.cmd, undo: () => { a.env.set(before); }, redo: () => { a.env.set(after); } }); return { ok: true, msg: Object.entries(ch).map(([k, v]) => k + '=' + (+v).toFixed(2)).join(' ') };
        }
        case 'scatter.add': {
          if (c.type && c.type !== 'palm') return { ok: false, msg: 'only "palm" is scattered so far (generic prefab scatter is planned)' };
          const [x, z] = c.center || [0, 0], R = num(c.radius, 12, 2, 60), n = num(c.count, 8, 1, 60), rnd = Math.random, made = [];
          for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
            const r = Math.sqrt(rnd()) * R, th = rnd() * 6.283, px = x + Math.cos(th) * r, pz = z + Math.sin(th) * r, h = a.terrain.hAt(px, pz);
            if (h < a.env.p.tide + 0.6 || a.terrain.nAt(px, pz).y < 0.72 || a.palms.items.some(p => Math.hypot(p.x - px, p.z - pz) < 3.2)) continue;
            const it = a.palms.add(px, pz, 0.75 + rnd() * 0.55, rnd() * 6.28); if (it) { made.push(it); i++; }
          }
          if (!made.length) return { ok: false, msg: 'No valid ground in range (palms need dry land, not too steep)' };
          this.push({ label: 'scatter.add palm x' + made.length, undo: () => made.forEach(p => a.palms.remove(p)), redo: () => made.forEach(p => { a.palms.items.push(p); a.palms.rebuild(); }) });
          return { ok: true, msg: made.length + ' palms' };
        }
        case 'scatter.erase': {
          const [x, z] = c.center || [0, 0], gone = a.palms.removeIn(+x, +z, num(c.radius, 8, 1, 60)); if (!gone.length) return { ok: false, msg: 'Nothing to erase' };
          this.push({ label: 'scatter.erase x' + gone.length, undo: () => gone.forEach(p => { a.palms.items.push(p); a.palms.rebuild(); }), redo: () => gone.forEach(p => a.palms.remove(p)) });
          return { ok: true, msg: gone.length + ' removed' };
        }
        case 'boulder.drop': {
          if (a.boulders.items.length >= LIMITS.boulders) return { ok: false, msg: 'Boulder limit reached (' + LIMITS.boulders + ')' };
          const x = num(c.x, 0, -120, 120), z = num(c.z, 0, -120, 120), r = num(c.radius, 0.7 + Math.random() * 1.1, 0.3, 3);
          const y = Math.max(a.terrain.hAt(x, z), a.env.p.tide) + num(c.height, 14, 2, 60), b = a.boulders.add(x, y, z, r);
          this.push({ label: 'boulder.drop', undo: () => a.boulders.remove(b), redo: () => a.boulders.readd(b, x, y, z) });
          return { ok: true, msg: 'boulder r=' + r.toFixed(1) };
        }
        case 'player.teleport': { a.teleport(num(c.x, 0, -120, 120), num(c.z, 0, -120, 120)); return { ok: true, msg: 'teleported' }; }
        case 'spawn.set': {
          const before = [...a.spawn], p = a.player, x = num(c.x, p.pos.x, -120, 120), z = num(c.z, p.pos.z, -120, 120), yaw = num(c.yaw, p.yaw, -7, 7), after = [x, z, yaw];
          a.spawn = after; this.push({ label: 'spawn.set', undo: () => { a.spawn = before; }, redo: () => { a.spawn = after; } }); return { ok: true, msg: 'spawn set' };
        }
        case 'world.import': return this.importWorld(c);
        case 'entity.create': case 'entity.set': case 'entity.remove': case 'entity.inspect': case 'entity.list': case 'asset.catalog': case 'asset.inspect': case 'asset.place': case 'prefab.build': case 'store.door': case 'product.take': case 'product.return': case 'interact.use': return this.entityCmd(c);
        case 'world.remove': {
          if (!a.worlds.length) return { ok: false, msg: 'No imported worlds' };
          const i = clamp(c.index == null ? a.worlds.length - 1 : +c.index | 0, 0, a.worlds.length - 1), w = a.worlds[i];
          a.removeWorld(w); this.push({ label: 'world.remove ' + w.name, undo: () => a.addWorldEntry(w, i), redo: () => a.removeWorld(w) }); return { ok: true, msg: 'removed ' + w.name };
        }
        default: return { ok: false, msg: 'Unknown command: ' + c.cmd + '. Run {"cmd":"describe"} for the list.' };
      }
    } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  }

  // entity, asset and store commands. EntityError -> {ok:false, code, path, msg}; each mutation records exactly one undo entry.
  entityCmd(c) {
    const a = this.a, E = a.entities, V3 = a.camera.position.constructor, BUILDABLE = k => !/^(prim\.|asset$)/.test(k);
    try {
      switch (c.cmd) {
        case 'entity.list': return { ok: true, entities: E.list() };
        case 'entity.inspect': return { ok: true, entity: E.inspect(String(c.id)) };
        case 'asset.catalog': return { ok: true, assets: a.assets.query(c) };
        case 'asset.inspect': return { ok: true, asset: a.assets.inspect(String(c.id)) };
        case 'entity.create': return this.createEntity({ ...c }, 'entity.create');
        case 'entity.set': { const id = String(c.id), before = structuredClone(E.get(id)), patch = { ...c }; delete patch.cmd; delete patch.id; E.set(id, patch); const after = structuredClone(E.get(id));
          this.push({ label: 'entity.set ' + id, undo: () => { E.set(id, { parent: before.parent, transform: before.transform, parameters: before.parameters, components: before.components, state: before.state, tags: before.tags }); }, redo: () => { E.set(id, { parent: after.parent, transform: after.transform, parameters: after.parameters, components: after.components, state: after.state, tags: after.tags }); } });
          return { ok: true, msg: id, entity: E.inspect(id) }; }
        case 'entity.remove': { const gone = E.remove(String(c.id)); this.push({ label: 'entity.remove ' + c.id, undo: () => E.restore(gone), redo: () => { E.remove(gone[0].id); } }); return { ok: true, msg: gone.length + ' removed', removed: gone.map(r => r.id) }; }
        case 'asset.place': {
          const spec = { ...c, prefab: 'asset', parameters: { assetId: c.assetId } }; delete spec.assetId;
          if (!spec.position && !(spec.transform && spec.transform.position)) { const f = a.focusPoint(), at = Array.isArray(c.at) ? c.at : [f.x + (a.mode === 'explore' ? Math.sin(a.player.yaw) * 3 : 0), f.z + (a.mode === 'explore' ? Math.cos(a.player.yaw) * 3 : 0)]; spec.position = [+at[0], a.terrain.hAt(+at[0], +at[1]), +at[1]]; }
          return this.createEntity(spec, 'asset.place');
        }
        case 'prefab.build': {
          const def = E.prefabs.get(c.type); if (!def || !BUILDABLE(c.type)) return { ok: false, code: 'prefab.unknown', msg: `Unknown prefab "${c.type}". Buildable: ${[...E.prefabs.keys()].filter(BUILDABLE).join(', ')}`, path: 'type' };
          const params = def.validate({ ...(c.parameters || {}), ...(c.seed != null ? { seed: c.seed } : {}) }, E.ctx());
          const site = a.findSite(params.width, params.depth, Array.isArray(c.at) ? c.at.map(Number) : null);
          if (!site) return { ok: false, code: 'prefab.site', msg: 'No dry, flat enough ground for that building. Pass "at":[x,z] on land, or sculpt a flat area first.', path: 'at' };
          return this.createEntity({ prefab: c.type, id: c.id, parameters: params, position: [site.x, site.y, site.z], rotation: [0, Number.isFinite(+c.yaw) ? +c.yaw : 0, 0], tags: ['building'] }, 'prefab.build');
        }
        case 'store.door': {
          const rt = this.store(c.id); if (!rt.ok) return rt; const id = rt.id, cur = !!E.get(id).state.doorOpen, want = c.open == null ? !cur : !!c.open;
          return this.stateChange(id, s => ({ ...s, doorOpen: want }), 'store.door ' + (want ? 'open' : 'close'), want ? 'Door open' : 'Door closed');
        }
        case 'product.take': case 'product.return': case 'interact.use': {
          const rt = this.store(c.id); if (!rt.ok) return rt; const id = rt.id, run = E.rt.get(id), st = E.get(id).state, p = a.player;
          if (c.cmd === 'interact.use') {
            const probe = new V3(p.pos.x + Math.sin(p.yaw) * 0.5, p.pos.y + 1.2, p.pos.z + Math.cos(p.yaw) * 0.5), hit = run.nearestProduct(probe, 1.3);
            if (hit) return this.takeKey(id, hit.key);
            if (run.nearDoor(p.pos)) return this.exec({ cmd: 'store.door', id });
            return { ok: false, code: 'interact.none', msg: 'Nothing to use here. Walk up to the door or a shelf.' };
          }
          if (c.cmd === 'product.take') { const key = c.key || (run.nearestProduct(new V3(p.pos.x, p.pos.y + 1.2, p.pos.z), 3) || {}).key; if (!key) return { ok: false, code: 'product.none', msg: 'No product in reach.', path: 'key' }; return this.takeKey(id, String(key)); }
          const key = c.key || st.removed[st.removed.length - 1]; if (!key || !st.removed.includes(key)) return { ok: false, code: 'product.none', msg: 'Nothing to put back.', path: 'key' };
          return this.stateChange(id, s => ({ ...s, removed: s.removed.filter(k => k !== key) }), 'product.return', 'Put it back');
        }
      }
    } catch (e) { if (e instanceof EntityError || e.code) return { ok: false, code: e.code, msg: e.message, path: e.path }; throw e; }
  }
  createEntity(spec, label) {
    const a = this.a, r = a.entities.create(spec); this.push({ label: label + ' ' + r.id, undo: () => { a.entities.remove(r.id); }, redo: () => { a.entities.restore([r]); } });
    return { ok: true, msg: r.id, id: r.id, entity: a.entities.inspect(r.id) };
  }
  store(id) {
    const E = this.a.entities, ids = [...E.rt].filter(([, rt]) => rt.nearestProduct).map(([i]) => i);
    if (id != null) { if (!E.recs.has(String(id))) return { ok: false, code: 'entity.unknown', msg: `No entity "${id}"`, path: 'id' }; return { ok: true, id: String(id) }; }
    if (!ids.length) return { ok: false, code: 'store.none', msg: 'There is no store in the scene. Build one first: {"cmd":"prefab.build","type":"retail.convenience"}' };
    const p = this.a.player.pos; ids.sort((x, y) => E.rt.get(x).object.position.distanceTo(p) - E.rt.get(y).object.position.distanceTo(p)); return { ok: true, id: ids[0] };
  }
  takeKey(id, key) {
    const E = this.a.entities, st = E.get(id).state, run = E.rt.get(id); if (!run.index.has(key)) return { ok: false, code: 'product.unknown', msg: `No product "${key}" in ${id}.`, path: 'key' };
    if (st.removed.includes(key)) return { ok: false, code: 'product.gone', msg: 'That product is already taken.', path: 'key' };
    const s = run.index.get(key), name = run.lib.product[s.type].name, r = this.stateChange(id, x => ({ ...x, removed: [...x.removed, key] }), 'product.take', 'Picked up: ' + name); if (r.ok) { r.key = key; r.name = name; } return r;
  }
  // a state-only change is applied in place (no rebuild) and journalled once
  stateChange(id, fn, label, msg) {
    const a = this.a, E = a.entities, rec = E.get(id), before = structuredClone(rec.state), after = fn(structuredClone(before));
    const set = s => { rec.state = structuredClone(s); E.rt.get(id).applyState(rec.state); E.changed(); };
    set(after); this.push({ label, undo: () => set(before), redo: () => set(after) }); return { ok: true, msg, state: structuredClone(after) };
  }

  importWorld(c) {
    const a = this.a; if (a.worlds.length >= LIMITS.worlds) return { ok: false, msg: 'Too many imported worlds (' + LIMITS.worlds + '). Remove one first.' };
    const r = a.readWorld(c.world); if (!r.ok) return { ok: false, msg: r.text, report: r.items };
    if (r.doc.instances.length > LIMITS.worldInstances) return { ok: false, msg: 'More than ' + LIMITS.worldInstances + ' instances.', report: r.items };
    const at = Array.isArray(c.at) && c.at.length >= 2 && c.at.slice(0, 2).every(Number.isFinite) ? [clamp(+c.at[0], -120, 120), clamp(+c.at[1], -120, 120)] : null;
    const w = a.placeWorld(r.doc, at, String(c.name || r.doc.scene.name || 'World').slice(0, 40));
    if (!w) return { ok: false, msg: 'No flat dry ground big enough was found. Sculpt a flat area first, or pass "at":[x,z].', report: r.items };
    const items = [...r.items, ...w.notes.map(t => ({ level: 'unsupported', text: t }))];
    const sp0 = [...a.spawn]; if (w.spawn) a.spawn = w.spawn.map(Number);
    this.push({ label: 'world.import ' + w.name, undo: () => { a.removeWorld(w); a.spawn = sp0; }, redo: () => { a.addWorldEntry(w); if (w.spawn) a.spawn = w.spawn.map(Number); } });
    return { ok: true, msg: `${w.name}: ${w.count} placed at ${w.at[0].toFixed(0)},${w.at[1].toFixed(0)}` + (w.notes.length ? `, ${w.notes.length} unsupported` : ''), placed: w.count, at: w.at, report: items };
  }

  // shorthand for the console: "time 18.5", "sea .8", "tide -.2", "boulder", "palms 10", "blank", "coast", "undo"
  run(line) {
    const t = line.trim(); if (!t) return { ok: false, msg: '' };
    if (t[0] === '{') { try { return this.exec(JSON.parse(t)); } catch (e) { return { ok: false, msg: 'Bad JSON' }; } }
    const [w, ...r] = t.split(/\s+/), v = parseFloat(r[0]), f = this.a.focusPoint();
    const map = { time: { cmd: 'environment.set', time: v }, cloud: { cmd: 'environment.set', cloud: v }, wind: { cmd: 'environment.set', wind: v }, sea: { cmd: 'water.set', sea: v }, tide: { cmd: 'water.set', tide: v },
      boulder: { cmd: 'boulder.drop', x: f.x, z: f.z }, palms: { cmd: 'scatter.add', center: [f.x, f.z], count: Number.isFinite(v) ? v : 8 }, undo: { cmd: 'undo' }, redo: { cmd: 'redo' },
      raise: { cmd: 'terrain.stroke', tool: 'raise', center: [f.x, f.z], radius: Number.isFinite(v) ? v : 10 }, lower: { cmd: 'terrain.stroke', tool: 'lower', center: [f.x, f.z], radius: Number.isFinite(v) ? v : 10 },
      sunset: { cmd: 'environment.set', time: 18.3 }, noon: { cmd: 'environment.set', time: 12 }, night: { cmd: 'environment.set', time: 23 },
      blank: { cmd: 'scene.new', preset: 'blank' }, coast: { cmd: 'scene.new', preset: 'coast' }, spawn: { cmd: 'spawn.set' }, state: { cmd: 'state' } };
    if (w === 'help') return { ok: true, msg: 'time cloud wind sea tide boulder palms raise lower sunset noon night blank coast spawn undo redo — or paste JSON {"cmd":...}. {"cmd":"describe"} lists every command.' };
    const res = map[w] ? this.exec(map[w]) : { ok: false, msg: 'Unknown: ' + w + ' (try "help")' };
    if (res.ok && w === 'state') res.msg = JSON.stringify(res).slice(0, 220);
    return res;
  }

  // ---- persistence ----
  dirty() { if (this.muted) return; clearTimeout(this.saveT); this.saveT = setTimeout(() => this.autosave(), 1500); }
  async serialize() {
    const a = this.a, r = n => +n.toFixed(2);
    return { format: FORMAT, version: VERSION, name: a.name, preset: a.terrain.preset, env: { ...a.env.p }, terrain: await a.terrain.pack(), spawn: a.spawn.map(r),
      palms: a.palms.items.map(p => [r(p.x), r(p.z), r(p.s), r(p.yaw)]),
      boulders: a.boulders.items.map(b => [r(b.p.x), r(b.p.y), r(b.p.z), r(b.r), b.seed]),
      worlds: a.worlds.map(w => ({ name: w.name, at: w.at.map(r), doc: w.doc })), entities: a.entities.serialize(), assetsUsed: [...new Set(a.entities.serialize().filter(e => e.prefab === 'asset').map(e => e.parameters.assetId))],
      player: [r(a.player.pos.x), r(a.player.pos.z), r(a.player.yaw)] };
  }
  async load(d) {
    this.checkScene(d);
    const a = this.a, before = a.snapshot(); this.muted = true;   // a failed load puts the current scene back
    try {
      await a.terrain.unpack(d.terrain); a.env.set(d.env || {}); a.name = d.name || (a.terrain.preset === 'blank' ? 'BLANK' : 'COAST_001');
      a.palms.items = (d.palms || []).map(([x, z, s, yaw]) => ({ x: +x, z: +z, s: +s, yaw: +yaw })); a.palms.rebuild();
      [...a.boulders.items].forEach(b => a.boulders.remove(b)); (d.boulders || []).forEach(([x, y, z, r, seed]) => a.boulders.add(+x, +y, +z, +r, seed | 0));
      a.entities.clear(); a.clearWorlds(); a.setPreset(a.terrain.preset);
      for (const w of (d.worlds || []).slice(0, LIMITS.worlds)) { const r = a.readWorld(w.doc); if (r.ok) a.placeWorld(r.doc, w.at, w.name); }
      this.loadProblems = a.entities.load(d.entities || []); if (this.loadProblems.length) a.ui && a.ui.toast(this.loadProblems.length + ' saved object(s) could not be restored: ' + this.loadProblems[0].msg);
      a.spawn = Array.isArray(d.spawn) ? d.spawn.map(Number) : d.player ? [+d.player[0], +d.player[1], +d.player[2]] : a.defaultSpawn();
      if (d.player) { a.player.pos.set(+d.player[0], 0, +d.player[1]); a.player.yaw = +d.player[2]; } else a.player.pos.set(a.spawn[0], 0, a.spawn[1]);
      a.player.pos.y = a.player.groundAt(a.player.pos.x, a.player.pos.z); a.player.vel.set(0, 0, 0); a.phys && a.phys.teleport(a.player);
      a.afterTerrain(true); this.hist = []; this.ptr = 0;
    } catch (e) { try { a.restoreScene(before); } catch (e2) { /* keep the original error */ } this.muted = false; throw e; }
    finally { this.muted = false; }
    this.emit('Loaded');
  }
  // cheap structural checks that run before anything is replaced
  checkScene(d) {
    if (!d || d.format !== FORMAT || !d.terrain) throw new Error('Not a n0ise Core scene');
    if (d.version > VERSION) throw new Error('This scene was saved by a newer Core (version ' + d.version + ')');
    if ((d.palms || []).length > LIMITS.palms || (d.boulders || []).length > 200) throw new Error('Scene exceeds limits');
    const arr = (k) => d[k] == null || Array.isArray(d[k]);
    if (!d.terrain || typeof d.terrain !== 'object') throw new Error('The scene has no terrain');
    for (const k of ['palms', 'boulders', 'worlds', 'entities']) if (!arr(k)) throw new Error('The scene field "' + k + '" is not a list');
    if (d.env != null && (typeof d.env !== 'object' || Array.isArray(d.env))) throw new Error('The scene environment is invalid');
    for (const k of ['spawn', 'player']) if (d[k] != null && !(Array.isArray(d[k]) && d[k].length >= 2 && d[k].every(n => Number.isFinite(+n)))) throw new Error('The scene field "' + k + '" is invalid');
    return true;
  }
  async autosave() { try { localStorage.setItem(KEY, JSON.stringify(await this.serialize())); this.a.ui && this.a.ui.saved(); } catch (e) { /* quota / private mode: ignore */ } }
  hasSave() { try { return !!(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY)); } catch (e) { return false; } }
  async restore() { try { const s = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); if (!s) return false; await this.load(JSON.parse(s)); return true; } catch (e) { return false; } }
}
