// Input: keyboard, pointer/touch and gamepad all become the same semantic actions.
// Gamepad: same conventions as src/gamepad.js (deadzone .14, A confirm, B back, X undo, Y mode, the n0.gpcfg swap-sticks / invert-look / vibration
// settings, DualSense and Xbox labels). That module is a cursor emulator wired into Studio's orbit controls, so Core reads the pad directly instead.
// Radial deadzone + rescale, trigger hysteresis, edge-detected buttons. The pad never types into text fields.
const DZ = 0.14;
let cfgAt = 0, cfgV = { swap: false, invY: false, rumble: true };
const cfg = () => { const n = performance.now(); if (n - cfgAt > 1000) { cfgAt = n; try { cfgV = { swap: false, invY: false, rumble: true, ...JSON.parse(localStorage.getItem('n0.gpcfg') || '{}') }; } catch (e) { /* keep defaults */ } } return cfgV; };
const dz = (x, y) => { const m = Math.hypot(x, y); if (m < DZ) return [0, 0]; const k = (m - DZ) / (1 - DZ) / m; return [x * k, y * k]; };

export class Input {
  constructor(app, canvas) {
    this.app = app; this.canvas = canvas; this.keys = new Set(); this.pointers = new Map(); this.ptr = { x: innerWidth / 2, y: innerHeight / 2, in: false };
    this.stick = [0, 0]; this.pad = { active: false, connected: false, prev: {}, held: {} }; this.brushDown = false; this.last = performance.now();
    this.pinch = 0; this.jumpEdge = false;
    const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range';
    addEventListener('keydown', e => {
      if (typing(e)) return; this.pad.active = false;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); app.redo(); return; }
      if (mod || e.altKey) return;
      if (e.repeat) { if (k === ' ') e.preventDefault(); return; }
      this.keys.add(k);
      if (k === ' ') { e.preventDefault(); this.jumpEdge = true; }
      else if (k === 'e') app.toggleMode();
      else if (k === 'b') app.boulderAtCursor();
      else if (k === '/') { e.preventDefault(); app.ui.toggleConsole(true); }
      else if (k === 'h') app.ui.toggleHidden();
      else if (k === 'p') app.snap();
      else if (k === '?') app.ui.showGuide();
      else if (k === '[') app.radius(-1); else if (k === ']') app.radius(1);
      else if (k >= '1' && k <= '8') app.ui.pickToolIndex(+k - 1);
      else if (k === 'escape') app.ui.closeAll();
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('gamepadconnected', () => { this.pad.connected = true; app.ui.toast('Gamepad connected'); });
    addEventListener('gamepaddisconnected', () => { this.pad.connected = false; this.pad.active = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); app.zoom(Math.exp(e.deltaY * 0.0011)); }, { passive: false });
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId); this.pad.active = false;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType, shift: e.shiftKey, t: 0, moved: 0 });
      this.ptr.x = e.clientX; this.ptr.y = e.clientY; this.ptr.in = true; this.decide(e);
    });
    canvas.addEventListener('pointermove', e => {
      this.ptr.x = e.clientX; this.ptr.y = e.clientY; this.ptr.in = true;
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) app.zoom(this.pinch / d); this.pinch = d; app.orbit(dx * 0.5, dy * 0.5); return;
      }
      if (p.mode === 'orbit') app.orbit(dx, dy); else if (p.mode === 'pan') app.pan(dx, dy);
    });
    const up = e => { const p = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId); this.pinch = 0; if (p && p.mode === 'brush') this.endBrush(); if (this.pointers.size === 0 && e.pointerType !== 'mouse') this.ptr.in = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  }
  decide(e) {
    const a = this.app, p = this.pointers.get(e.pointerId);
    if (this.pointers.size >= 2) { for (const q of this.pointers.values()) { if (q.mode === 'brush') this.endBrush(); q.mode = 'orbit'; } return; }
    if (a.mode === 'explore') { p.mode = 'orbit'; return; }
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) p.mode = 'pan';
    else if (e.button === 2) p.mode = 'orbit';
    else if (a.tool === 'look') p.mode = 'orbit';
    else { p.mode = 'brush'; this.startBrush(false); }
  }
  startBrush(inv) { this.brushDown = true; this.invert = inv; this.app.brushStart(); }
  endBrush() { if (this.brushDown) { this.brushDown = false; this.app.brushEnd(); } }

  // per-frame: returns movement + look; fires pad actions
  poll(dt) {
    const a = this.app, k = this.keys; let mx = 0, mz = 0, lx = 0, ly = 0, run = k.has('shift'), jump = this.jumpEdge; this.jumpEdge = false;
    if (k.has('w') || k.has('arrowup')) mz += 1; if (k.has('s') || k.has('arrowdown')) mz -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1; if (k.has('a') || k.has('arrowleft')) mx -= 1;
    mx += this.stick[0]; mz -= this.stick[1];
    let padApply = false, padInv = false;
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    if (gp) {
      const P = this.pad, b = i => gp.buttons[i] && gp.buttons[i].value, down = (i, on = 0.5, off = 0.3) => { const v = b(i); P.held[i] = P.held[i] ? v > off : v > on; return P.held[i]; };
      const C = cfg(), sw = C.swap ? 2 : 0, [lsx, lsy] = dz(gp.axes[sw] || 0, gp.axes[sw + 1] || 0), [rsx, rsy0] = dz(gp.axes[2 - sw] || 0, gp.axes[3 - sw] || 0), rsy = C.invY ? -rsy0 : rsy0;
      const any = lsx || lsy || rsx || rsy || gp.buttons.some(x => x.pressed); if (any && !P.active) { P.active = true; a.ui.pad(true); }
      const was = { ...P.prev }, cur = {}; for (let i = 0; i < 17; i++) cur[i] = down(i); P.prev = cur;
      const edge = i => cur[i] && !was[i];
      mx += lsx; mz -= lsy; lx += rsx * 2.6 * dt * 60 * 0.02 * 60 / 60; ly += rsy * 1.8 * dt;
      run = run || cur[6] && a.mode === 'explore' || cur[10];
      if (a.mode === 'explore') { if (edge(0)) jump = true; }
      else { padApply = cur[7] || cur[0]; padInv = cur[6]; }
      if (edge(11)) a.boulderAtCursor();
      if (edge(3)) a.toggleMode(); if (edge(2)) a.undo(); if (edge(1) && a.mode === 'edit') a.setMode('explore'); if (edge(9)) a.ui.showGuide();
      if (edge(4)) a.ui.cycleTool(-1); if (edge(5)) a.ui.cycleTool(1);
      if (edge(12)) a.ui.cycleGroup(-1); if (edge(13)) a.ui.cycleGroup(1);
      if (edge(14)) a.radius(-1); if (edge(15)) a.radius(1);
      if (edge(8)) a.resetCam();
      lx = rsx * 2.4 * dt; ly = rsy * 1.6 * dt;
      if (P.active) { a.padMode = true; } 
    }
    if (a.padMode && gp && this.pad.active && !this.pointers.size) { a.padBrush(padApply, padInv); } else if (this.brushDown === false) a.padBrush(false, false);
    return { mx, mz, lx, ly, run, jump };
  }
}
