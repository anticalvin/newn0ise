// UI: warm graphite glass. Bottom dock (Land / Surface / Nature / Sky), mode switch, one-line hint, console, guide with honest status table.
const GROUPS = [
  { id: 'land', name: 'Land', tools: [['raise', 'Raise'], ['lower', 'Lower'], ['smooth', 'Smooth'], ['flatten', 'Flatten']] },
  { id: 'surface', name: 'Surface', tools: [['sand', 'Sand'], ['rock', 'Rock'], ['grass', 'Grass']] },
  { id: 'nature', name: 'Nature', tools: [['palm', 'Palms'], ['erase', 'Erase'], ['boulder', 'Boulder']] },
  { id: 'sky', name: 'Sky & Sea', tools: [] },
];
const SLIDERS = [['time', 'Time', 0, 24, 0.05, v => { const h = Math.floor(v), m = Math.floor((v - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }],
  ['sea', 'Sea', 0, 1.2, 0.01, v => Math.round(v * 100) + '%'], ['tide', 'Tide', -0.8, 0.9, 0.01, v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' m'],
  ['cloud', 'Cloud', 0, 1, 0.01, v => Math.round(v * 100) + '%'], ['wind', 'Wind', 0, 1, 0.01, v => Math.round(v * 100) + '%']];
const STATUS = [
  ['Working', 'Terrain sculpt + paint (undo/redo), walkable character, Gerstner ocean with shoreline foam and swash, wet/dry sand, footprints, instanced palms + grass, boulders with water drag, day/night sky, command console, autosave + .n0scene export'],
  ['Approximated', 'Physics is a custom heightfield solver (real app: Rapier). Ocean is a visual wave model, not a fluid sim. Sand is shaded, not granular. Character is a procedural two-bone rig.'],
  ['Planned', 'Rapier heightfield colliders, vehicles, pedestrians / crowds, buildings + interiors, streaming world tiles, real character assets + animation retarget, node graph (Fuse), AI-driven scene commands'],
];
const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };

export class UI {
  constructor(app) {
    this.a = app; this.group = 0; this.toolIdx = 0; this.hidden = false; this.padOn = false; const root = document.getElementById('ui');
    root.innerHTML = `
    <div class="top">
      <div class="brand"><b>n0ise</b><span>CORE · COAST_001</span></div>
      <div class="seg" id="mode"><button data-m="explore" class="on">Explore</button><button data-m="edit">Edit</button></div>
      <div class="tr"><button class="ib" id="bUndo" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button><button class="ib" id="bRedo" title="Redo" aria-label="Redo">↷</button><button class="ib" id="bSnap" title="Screenshot (P)" aria-label="Screenshot">◉</button><button class="ib" id="bCon" title="Console (/)" aria-label="Console">&gt;_</button><button class="ib" id="bHelp" title="Guide (?)" aria-label="Guide">?</button></div>
    </div>
    <div class="hint" id="hint"></div>
    <div class="toast" id="toast"></div>
    <div class="dock" id="dock">
      <div class="panel" id="panel"></div>
      <div class="groups" id="groups">${GROUPS.map((g, i) => `<button data-g="${i}">${g.name}</button>`).join('')}</div>
    </div>
    <div class="pads" id="pads"><div class="stick" id="stick"><i></i></div><button class="act" id="bJump">Jump</button><button class="act s" id="bRock">Boulder</button></div>
    <div class="pill" id="padhint"></div>
    <div class="con" id="con"><div class="log" id="log"></div><form id="conf"><span>&gt;</span><input id="cin" autocomplete="off" spellcheck="false" placeholder='time 18.5 · sea .8 · tide -.2 · boulder · palms 10 · help'/></form></div>
    <div class="sheet" id="guide" role="dialog" aria-label="Guide"><div class="card"><div class="gh"><b>n0ise CORE · COAST_001</b><button class="ib" id="gx" aria-label="Close">✕</button></div>
      <div class="cols"><section><h4>Move</h4><p><kbd>WASD</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · drag to look</p><p>Pad: left stick move · right stick look · A jump · LT run</p>
      <h4>Edit</h4><p><kbd>E</kbd> toggle Explore / Edit · drag to paint · <kbd>[</kbd><kbd>]</kbd> radius · <kbd>1–8</kbd> tools · right-drag orbit · shift-drag pan</p><p>Pad: RT apply · LT invert · LB/RB tool · D-pad ↑↓ group, ←→ radius · Y mode · B undo · X boulder</p>
      <h4>Other</h4><p><kbd>B</kbd> boulder · <kbd>/</kbd> console · <kbd>H</kbd> hide UI · <kbd>P</kbd> screenshot · <kbd>Ctrl+Z</kbd> undo</p><p>Touch: left stick moves, drag looks; Edit: one finger paints, two orbit/pinch.</p></section>
      <section><h4>What is real</h4>${STATUS.map(([k, v]) => `<div class="st ${k}"><em>${k}</em><span>${v}</span></div>`).join('')}
      <div class="row"><button class="btn" id="bExp">Export scene</button><button class="btn" id="bImp">Import</button><button class="btn" id="bNew">New island</button></div></section></div></div></div>
    <input type="file" id="file" accept=".n0scene,.json" hidden />`;
    this.el = id => document.getElementById(id); this.root = root;
    const el = this.el;
    el('mode').onclick = e => { const m = e.target.dataset && e.target.dataset.m; if (m && m !== app.mode) app.toggleMode(); };
    el('bUndo').onclick = () => app.undo(); el('bRedo').onclick = () => app.redo(); el('bSnap').onclick = () => app.snap();
    el('bCon').onclick = () => this.toggleConsole(); el('bHelp').onclick = () => this.showGuide(); el('gx').onclick = () => this.closeAll();
    el('guide').onclick = e => { if (e.target.id === 'guide') this.closeAll(); };
    el('groups').onclick = e => { const g = e.target.dataset && e.target.dataset.g; if (g != null) this.setGroup(+g); };
    el('bExp').onclick = () => app.exportScene(); el('bImp').onclick = () => el('file').click(); el('bNew').onclick = () => app.newIsland();
    el('file').onchange = e => { const f = e.target.files[0]; if (f) app.importScene(f); e.target.value = ''; };
    el('conf').onsubmit = e => { e.preventDefault(); const v = el('cin').value; if (!v.trim()) return; el('cin').value = ''; const r = app.core.run(v); this.log('> ' + v, ''); this.log(r.msg, r.ok ? 'ok' : 'bad'); };
    el('cin').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.toggleConsole(false); });
    el('bJump').addEventListener('pointerdown', e => { e.preventDefault(); app.input.jumpEdge = true; }); el('bRock').addEventListener('pointerdown', e => { e.preventDefault(); app.boulderAtCursor(); });
    // virtual stick
    const st = el('stick'), nub = st.firstChild; let id = null;
    const mv = e => { const r = st.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      app.input.stick = [dx, dy]; nub.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; };
    st.addEventListener('pointerdown', e => { id = e.pointerId; st.setPointerCapture(id); mv(e); }); st.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
    const end = e => { if (e.pointerId === id) { id = null; app.input.stick = [0, 0]; nub.style.transform = ''; } }; st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    this.booting = true; this.setGroup(0); this.booting = false; this.setMode('explore'); this.updHist();
    this.hintT = 0; this.say('Drag to look · WASD to walk · E to edit the island', 9000);
  }
  say(t, ms = 5000) { const h = this.el('hint'); h.textContent = t; h.classList.add('on'); clearTimeout(this.hintT); this.hintT = setTimeout(() => h.classList.remove('on'), ms); }
  toast(t) { const e = this.el('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(this.toastT); this.toastT = setTimeout(() => e.classList.remove('on'), 1800); }
  log(t, c) { const l = this.el('log'), d = document.createElement('div'); d.className = c; d.textContent = t; l.appendChild(d); while (l.children.length > 40) l.firstChild.remove(); l.scrollTop = 1e9; }
  toggleConsole(on) { const c = this.el('con'); const v = on == null ? !c.classList.contains('on') : on; c.classList.toggle('on', v); if (v) setTimeout(() => this.el('cin').focus(), 30); else this.el('cin').blur(); }
  showGuide() { this.el('guide').classList.add('on'); } closeAll() { this.el('guide').classList.remove('on'); this.toggleConsole(false); }
  toggleHidden() { this.hidden = !this.hidden; this.root.classList.toggle('hide', this.hidden); }
  setMode(m) { this.root.dataset.mode = m; for (const b of this.el('mode').children) b.classList.toggle('on', b.dataset.m === m);
    if (m === 'edit') this.say(this.padOn ? 'RT apply · LT invert · LB/RB tools · Y back to Explore' : 'Drag to paint · right-drag orbit · shift-drag pan · [ ] radius', 6000); else this.say('Walk the shore · E to edit · / for the console', 5000); this.render(); }
  pad(on) { this.padOn = on; this.root.classList.toggle('padmode', on); const h = this.el('padhint'); h.innerHTML = on ? '<b>A</b> jump <b>X</b> boulder <b>Y</b> mode <b>B</b> undo <b>LB/RB</b> tool <b>RT</b> apply' : ''; }
  setGroup(i) { this.group = ((i % GROUPS.length) + GROUPS.length) % GROUPS.length; this.toolIdx = 0; for (const b of this.el('groups').children) b.classList.toggle('on', +b.dataset.g === this.group); this.render(); if (GROUPS[this.group].tools.length) this.a.setTool(GROUPS[this.group].tools[0][0]); if (!this.booting && this.a.mode === 'explore' && GROUPS[this.group].id !== 'sky') this.a.setMode('edit'); }
  cycleGroup(d) { this.setGroup(this.group + d); }
  cycleTool(d) { const t = GROUPS[this.group].tools; if (!t.length) return; this.toolIdx = (this.toolIdx + d + t.length) % t.length; this.a.setTool(t[this.toolIdx][0]); this.render(); }
  pickToolIndex(n) { const all = GROUPS.flatMap((g, gi) => g.tools.map((t, ti) => [gi, ti])); const p = all[n]; if (!p) return; this.group = p[0]; this.toolIdx = p[1]; for (const b of this.el('groups').children) b.classList.toggle('on', +b.dataset.g === this.group); this.a.setTool(GROUPS[p[0]].tools[p[1]][0]); if (this.a.mode === 'explore') this.a.setMode('edit'); this.render(); }
  render() {
    const g = GROUPS[this.group], p = this.el('panel'), a = this.a; p.innerHTML = '';
    if (g.id === 'sky') {
      p.className = 'panel sliders'; for (const [k, name, lo, hi, step, fmt] of SLIDERS) {
        const row = $(`<label><span>${name}</span><input type="range" min="${lo}" max="${hi}" step="${step}" value="${a.env.p[k]}"/><em>${fmt(a.env.p[k])}</em></label>`), inp = row.querySelector('input'), out = row.querySelector('em'); let before = null;
        inp.addEventListener('pointerdown', () => { before = { ...a.env.p }; }); inp.addEventListener('keydown', () => { if (!before) before = { ...a.env.p }; });
        inp.oninput = () => { if (!before) before = { ...a.env.p }; a.env.set({ [k]: +inp.value }); out.textContent = fmt(+inp.value); };
        inp.onchange = () => { if (before) { const b = before, af = { ...a.env.p }; before = null; a.core.push({ label: 'environment.set ' + k, undo: () => { a.env.set(b); this.render(); }, redo: () => { a.env.set(af); this.render(); } }); a.core.emit('Set ' + k); } };
        p.appendChild(row);
      }
      const q = $('<div class="quick"><button data-t="6.3">Sunrise</button><button data-t="12">Noon</button><button data-t="17.4">Golden</button><button data-t="23">Night</button></div>'); q.onclick = e => { const t = e.target.dataset && e.target.dataset.t; if (t) { a.core.exec({ cmd: 'environment.set', time: +t }); this.render(); } }; p.appendChild(q);
      return;
    }
    p.className = 'panel tools';
    g.tools.forEach(([id, name], i) => { const b = $(`<button class="tool" data-i="${i}" aria-pressed="${a.tool === id}"><span>${name}</span><kbd>${this.num(this.group, i)}</kbd></button>`); b.onclick = () => { this.toolIdx = i; a.setTool(id); if (a.mode === 'explore') a.setMode('edit'); this.render(); }; p.appendChild(b); });
    const mini = $(`<div class="mini"><label>Radius<input type="range" min="2" max="40" step="1" value="${a.R}"/></label><label>Strength<input type="range" min="0.1" max="1" step="0.05" value="${a.strength}"/></label></div>`);
    const [r, s] = mini.querySelectorAll('input'); r.oninput = () => { a.R = +r.value; }; s.oninput = () => { a.strength = +s.value; }; p.appendChild(mini); this.miniR = r;
  }
  num(g, i) { let n = 1; for (let k = 0; k < g; k++) n += GROUPS[k].tools.length; return n + i; }
  syncRadius() { if (this.miniR) this.miniR.value = this.a.R; }
  updHist() { const c = this.a.core; this.el('bUndo').disabled = !c.canUndo(); this.el('bRedo').disabled = !c.canRedo(); }
  saved() { this.el('bSnap').title = 'Screenshot (P) · autosaved ' + new Date().toLocaleTimeString(); }
}
