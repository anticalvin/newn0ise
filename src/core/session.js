// Session: the one object that owns a running game. It replaces the old flag soup (mode, shooter.active, firstLight.active, geo.active, lv, arena)
// and the if-chain behind inputOwner(). Three small parts:
//   InputStack  contexts (menu/modal, edit, play, vehicle, fps, geo, firstlight) pushed and popped by whoever starts or ends them; the top one owns input.
//   Systems     an ordered list of fixed-step systems, each switchable and timed (?debug=1 shows the cost per system).
//   Session     the state (Boot, Menu, Edit, Play, Pause, Result) plus start/stop/pause, which the editor and a shipped game share.
// Honest status: modes still keep their own internal `active` flags for their own bookkeeping; what moved here is who OWNS input and the ordering
// and timing of the fixed step. The remaining flag readers are listed in docs/ENGINE_ROADMAP.md.

export const STATES = ['boot', 'menu', 'edit', 'play', 'pause', 'result'];

export class InputStack {
  constructor() { this.items = ['edit']; this.listeners = []; }
  top() { return this.items[this.items.length - 1]; }
  has(c) { return this.items.includes(c); }
  push(c) { if (this.top() === c) return; this.remove(c, true); this.items.push(c); this.emit(); }
  pop(c) { if (this.remove(c)) return true; return false; }
  remove(c, quiet) { const i = this.items.lastIndexOf(c); if (i < 0 || this.items.length === 1) return false; this.items.splice(i, 1); if (!quiet) this.emit(); return true; }
  // the base context (edit or play) sits at the bottom and is replaced, never popped
  base(c) { if (this.items[0] === c) return; this.items[0] = c; this.emit(); }
  emit() { for (const f of this.listeners) f(this.top()); }
  onChange(f) { this.listeners.push(f); }
}

export class Systems {
  constructor() { this.list = []; this.timing = {}; this.measure = false; }
  add(name, fn, opts = {}) { this.list.push({ name, fn, enabled: true, when: opts.when || null }); this.timing[name] = 0; return this; }
  get(name) { return this.list.find(s => s.name === name); }
  enable(name, on = true) { const s = this.get(name); if (s) s.enabled = on; }
  names() { return this.list.map(s => s.name); }
  run(dt, ctx) {
    const m = this.measure;
    for (const s of this.list) {
      if (!s.enabled || (s.when && !s.when(ctx))) { if (m) this.timing[s.name] *= 0.9; continue; }
      if (m) { const t0 = performance.now(); s.fn(dt, ctx); this.timing[s.name] += (performance.now() - t0 - this.timing[s.name]) * 0.1; } else s.fn(dt, ctx);
    }
  }
}

export class Session {
  constructor(app) {
    this.app = app; this.input = new InputStack(); this.systems = new Systems(); this.state = 'boot'; this.result = null;
    this.systems.measure = /[?&]debug=1/.test(location.search);
  }
  // who owns input right now: 'modal' | 'firstlight' | 'fps' | 'geo' | 'editor' | 'play'. Driving a car stays 'play' (the vehicle context only changes the bindings).
  owner() { const t = this.input.top(); return t === 'edit' ? 'editor' : t === 'vehicle' ? 'play' : t; }
  is(c) { return this.input.top() === c; }
  setState(s) { if (s === this.state || !STATES.includes(s)) return; this.state = s; }
  // base mode: the editor and Play-in-editor are the same session, switched here
  mode(m) { if (m !== 'explore') this.input.remove('vehicle', true); this.input.base(m === 'explore' ? 'play' : 'edit'); if (this.state !== 'menu' && this.state !== 'pause' && this.state !== 'result') this.setState(m === 'explore' ? 'play' : 'edit'); }
  modal(on) { if (on) { this.prevState = this.state === 'menu' ? this.prevState : this.state; this.input.push('modal'); if (this.state === 'play') this.setState('pause'); else if (this.state === 'boot') this.setState('menu'); } else { this.input.pop('modal'); if (this.state === 'pause' || this.state === 'menu') this.setState(this.app.mode === 'explore' ? 'play' : 'edit'); } }
  enter(ctx) { this.input.push(ctx); }
  leave(ctx) { this.input.pop(ctx); }
  pause() { if (this.state === 'play') this.setState('pause'); this.paused = true; }
  resume() { this.paused = false; if (this.state === 'pause') this.setState('play'); }
  finish(result) { this.result = result; this.setState('result'); }
  // debug overlay (?debug=1): per-system cost in ms
  debugOverlay() {
    if (!this.systems.measure || this.dbg) return; const d = this.dbg = document.createElement('pre');
    d.style.cssText = 'position:fixed;left:8px;bottom:56px;z-index:99;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;color:#ede8df;background:rgba(0,0,0,.55);border-radius:8px;pointer-events:none';
    document.body.appendChild(d); setInterval(() => { const t = this.systems.timing; d.textContent = this.state + ' / ' + this.input.items.join('>') + '\n' + Object.keys(t).map(k => k.padEnd(9) + t[k].toFixed(2) + ' ms').join('\n'); }, 400);
  }
}
