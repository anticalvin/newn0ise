// SceneDocument + command boundary. EVERY mutation (UI, gamepad, console, agent) goes through exec(),
// which validates input, applies it, and records ONE reversible history entry. Mirrors the proposed n0_* extension:
//   terrain.stroke | terrain.reset | environment.set | water.set | scatter.add | scatter.erase | boulder.drop | player.teleport | undo | redo
import { clamp } from './util.js';

const KEY = 'n0ise.core.coast001';
const num = (v, d, a, b) => (Number.isFinite(+v) ? clamp(+v, a, b) : d);

export class Core {
  constructor(app) { this.a = app; this.hist = []; this.ptr = 0; this.listeners = new Set(); this.saveT = 0; this.limits = { boulders: 60, palms: 1600, radius: 40, strokeSeconds: 3 }; }
  on(fn) { this.listeners.add(fn); }
  emit(label) { this.listeners.forEach(f => f(label)); this.dirty(); }
  push(e) { this.hist.length = this.ptr; this.hist.push(e); this.ptr = this.hist.length; if (this.hist.length > 80) { this.hist.shift(); this.ptr--; } this.emit(e.label); }
  canUndo() { return this.ptr > 0; } canRedo() { return this.ptr < this.hist.length; }
  undo() { if (!this.canUndo()) return { ok: false, msg: 'Nothing to undo' }; const e = this.hist[--this.ptr]; e.undo(); this.emit('Undo ' + e.label); return { ok: true, msg: 'Undid ' + e.label }; }
  redo() { if (!this.canRedo()) return { ok: false, msg: 'Nothing to redo' }; const e = this.hist[this.ptr++]; e.redo(); this.emit('Redo ' + e.label); return { ok: true, msg: 'Redid ' + e.label }; }

  // called by the live brush: commit a finished stroke as one undo entry
  commitStroke(tool, patch) {
    if (!patch) return; const a = this.a;
    this.push({ label: 'terrain.stroke ' + tool, undo: () => { a.terrain.applyPatch(patch, 'before'); a.afterTerrain(); }, redo: () => { a.terrain.applyPatch(patch, 'after'); a.afterTerrain(); } });
    a.afterTerrain();
  }

  exec(cmd) {
    const a = this.a, c = typeof cmd === 'string' ? JSON.parse(cmd) : cmd; if (!c || typeof c.cmd !== 'string') return { ok: false, msg: 'Missing "cmd"' };
    try {
      switch (c.cmd) {
        case 'undo': return this.undo();
        case 'redo': return this.redo();
        case 'terrain.stroke': {
          const [x, z] = c.center || [c.x, c.z]; if (!Number.isFinite(+x) || !Number.isFinite(+z)) return { ok: false, msg: 'center [x,z] required' };
          const tool = ['raise', 'lower', 'smooth', 'flatten', 'sand', 'rock', 'grass'].includes(c.tool) ? c.tool : null; if (!tool) return { ok: false, msg: 'unknown tool' };
          const R = num(c.radius, 10, 1, this.limits.radius), s = num(c.strength, 0.5, 0.05, 1), dur = num(c.duration, 0.6, 0.05, this.limits.strokeSeconds);
          a.terrain.beginStroke(); for (let i = 0; i < 12; i++) a.terrain.brush(tool, +x, +z, R, s, dur / 12, !!c.invert);
          this.commitStroke(tool, a.terrain.endStroke()); return { ok: true, msg: `${tool} @ ${(+x).toFixed(0)},${(+z).toFixed(0)}` };
        }
        case 'terrain.reset': {
          const before = a.snapshotTerrain(); a.terrain.generate(num(c.seed, 101, 1, 99999)); a.afterTerrain(true); const after = a.snapshotTerrain();
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
          if (c.type && c.type !== 'palm') return { ok: false, msg: 'only "palm" in this prototype' };
          const [x, z] = c.center || [0, 0], R = num(c.radius, 12, 2, 60), n = num(c.count, 8, 1, 60), rnd = Math.random, made = [];
          for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
            const r = Math.sqrt(rnd()) * R, th = rnd() * 6.283, px = x + Math.cos(th) * r, pz = z + Math.sin(th) * r, h = a.terrain.hAt(px, pz);
            if (h < 0.85 || a.terrain.nAt(px, pz).y < 0.72 || a.palms.items.some(p => Math.hypot(p.x - px, p.z - pz) < 3.2)) continue;
            const it = a.palms.add(px, pz, 0.75 + rnd() * 0.55, rnd() * 6.28); if (it) { made.push(it); i++; }
          }
          if (!made.length) return { ok: false, msg: 'No valid ground in range (palms need dry land)' };
          this.push({ label: 'scatter.add palm x' + made.length, undo: () => made.forEach(p => a.palms.remove(p)), redo: () => made.forEach(p => { a.palms.items.push(p); a.palms.rebuild(); }) });
          return { ok: true, msg: made.length + ' palms' };
        }
        case 'scatter.erase': {
          const [x, z] = c.center || [0, 0], gone = a.palms.removeIn(+x, +z, num(c.radius, 8, 1, 60)); if (!gone.length) return { ok: false, msg: 'Nothing to erase' };
          this.push({ label: 'scatter.erase x' + gone.length, undo: () => gone.forEach(p => { a.palms.items.push(p); a.palms.rebuild(); }), redo: () => gone.forEach(p => a.palms.remove(p)) });
          return { ok: true, msg: gone.length + ' removed' };
        }
        case 'boulder.drop': {
          if (a.boulders.items.length >= this.limits.boulders) return { ok: false, msg: 'Boulder limit reached' };
          const x = num(c.x, 0, -120, 120), z = num(c.z, 0, -120, 120), r = num(c.radius, 0.7 + Math.random() * 1.1, 0.3, 3);
          const y = Math.max(a.terrain.hAt(x, z), a.env.p.tide) + num(c.height, 14, 2, 60), b = a.boulders.add(x, y, z, r);
          this.push({ label: 'boulder.drop', undo: () => a.boulders.remove(b), redo: () => { a.boulders.items.push(b); a.scene.add(b.mesh); b.p.set(x, y, z); b.v.set(0, 0, 0); b.sleep = 0; } });
          return { ok: true, msg: 'boulder r=' + r.toFixed(1) };
        }
        case 'player.teleport': { a.player.pos.set(num(c.x, 0, -120, 120), 0, num(c.z, 0, -120, 120)); a.player.pos.y = a.player.groundAt(a.player.pos.x, a.player.pos.z); a.player.vel.set(0, 0, 0); return { ok: true, msg: 'teleported' }; }
        default: return { ok: false, msg: 'Unknown command: ' + c.cmd };
      }
    } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  }
  // shorthand for the console: "time 18.5", "sea .8", "tide -.2", "boulder", "palms 10", "undo"
  run(line) {
    const t = line.trim(); if (!t) return { ok: false, msg: '' };
    if (t[0] === '{') { try { return this.exec(JSON.parse(t)); } catch (e) { return { ok: false, msg: 'Bad JSON' }; } }
    const [w, ...r] = t.split(/\s+/), v = parseFloat(r[0]), f = this.a.focusPoint();
    const map = { time: { cmd: 'environment.set', time: v }, cloud: { cmd: 'environment.set', cloud: v }, wind: { cmd: 'environment.set', wind: v }, sea: { cmd: 'water.set', sea: v }, tide: { cmd: 'water.set', tide: v },
      boulder: { cmd: 'boulder.drop', x: f.x, z: f.z }, palms: { cmd: 'scatter.add', center: [f.x, f.z], count: Number.isFinite(v) ? v : 8 }, undo: { cmd: 'undo' }, redo: { cmd: 'redo' },
      raise: { cmd: 'terrain.stroke', tool: 'raise', center: [f.x, f.z], radius: Number.isFinite(v) ? v : 10 }, lower: { cmd: 'terrain.stroke', tool: 'lower', center: [f.x, f.z], radius: Number.isFinite(v) ? v : 10 },
      sunset: { cmd: 'environment.set', time: 18.3 }, noon: { cmd: 'environment.set', time: 12 }, night: { cmd: 'environment.set', time: 23 } };
    if (w === 'help') return { ok: true, msg: 'time cloud wind sea tide boulder palms raise lower sunset noon night undo redo — or paste JSON {"cmd":...}' };
    return map[w] ? this.exec(map[w]) : { ok: false, msg: 'Unknown: ' + w + ' (try "help")' };
  }

  // ---- persistence ----
  dirty() { clearTimeout(this.saveT); this.saveT = setTimeout(() => this.autosave(), 1500); }
  async serialize() {
    const a = this.a;
    return { format: 'n0ise.core.scene', version: 2, name: 'COAST_001', env: { ...a.env.p }, terrain: await a.terrain.pack(),
      palms: a.palms.items.map(p => [+p.x.toFixed(2), +p.z.toFixed(2), +p.s.toFixed(2), +p.yaw.toFixed(2)]),
      boulders: a.boulders.items.map(b => [+b.p.x.toFixed(2), +b.p.y.toFixed(2), +b.p.z.toFixed(2), +b.r.toFixed(2), b.seed]),
      player: [+a.player.pos.x.toFixed(2), +a.player.pos.z.toFixed(2), +a.player.yaw.toFixed(2)] };
  }
  async load(d) {
    if (!d || d.format !== 'n0ise.core.scene' || !d.terrain) throw new Error('Not a n0ise CORE scene');
    if ((d.palms || []).length > this.limits.palms || (d.boulders || []).length > 200) throw new Error('Scene exceeds limits');
    const a = this.a; await a.terrain.unpack(d.terrain); a.env.set(d.env || {});
    a.palms.items = (d.palms || []).map(([x, z, s, yaw]) => ({ x: +x, z: +z, s: +s, yaw: +yaw })); a.palms.rebuild();
    [...a.boulders.items].forEach(b => a.boulders.remove(b)); (d.boulders || []).forEach(([x, y, z, r, seed]) => a.boulders.add(+x, +y, +z, +r, seed | 0));
    if (d.player) { a.player.pos.set(+d.player[0], 0, +d.player[1]); a.player.yaw = +d.player[2]; a.player.pos.y = a.player.groundAt(a.player.pos.x, a.player.pos.z); }
    a.afterTerrain(true); this.hist = []; this.ptr = 0; this.emit('Loaded');
  }
  async autosave() { try { localStorage.setItem(KEY, JSON.stringify(await this.serialize())); this.a.ui && this.a.ui.saved(); } catch (e) { /* quota / private mode: ignore */ } }
  async restore() { try { const s = localStorage.getItem(KEY); if (!s) return false; await this.load(JSON.parse(s)); return true; } catch (e) { return false; } }
}
