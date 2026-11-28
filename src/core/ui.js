// UI: warm graphite glass. Bottom dock (Land / Surface / Nature / Sky), mode switch, one-line hint, console, guide with honest status table.
const GROUPS = [
  { id: 'land', name: 'Land', tools: [['raise', 'Raise'], ['lower', 'Lower'], ['smooth', 'Smooth'], ['flatten', 'Flatten']] },
  { id: 'surface', name: 'Surface', tools: [['sand', 'Sand'], ['rock', 'Rock'], ['grass', 'Grass']] },
  { id: 'nature', name: 'Props', tools: [['palm', 'Palms'], ['erase', 'Erase'], ['boulder', 'Boulder'], ['crate', 'Crate'], ['barrel', 'Barrel']] },
  { id: 'place', name: 'Place', tools: [] },
  { id: 'build', name: 'Build', tools: [] },
  { id: 'scene', name: 'Scene', tools: [] },
  { id: 'sky', name: 'Sky & Sea', tools: [] },
  { id: 'actors', name: 'Fighters', tools: [['brawler', 'Brawler'], ['heavy', 'Heavy'], ['dummy', 'Dummy'], ['grab', 'Grab'], ['clear', 'Clear']] },   // last, so the group indexes the workspace shell uses do not move
];
const SLIDERS = [['time', 'Time', 0, 24, 0.05, v => { const h = Math.floor(v), m = Math.floor((v - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }],
  ['sea', 'Sea', 0, 1.2, 0.01, v => Math.round(v * 100) + '%'], ['tide', 'Tide', -0.8, 0.9, 0.01, v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' m'],
  ['cloud', 'Cloud', 0, 1, 0.01, v => Math.round(v * 100) + '%'], ['wind', 'Wind', 0, 1, 0.01, v => Math.round(v * 100) + '%']];
const STATUS = [
  ['Working', 'Terrain sculpt + paint with undo and redo. Rapier physics: heightfield collider that follows your sculpting, a character controller, solid pier, shack and imported shapes, boulders that roll and float. Walkable character, Gerstner ocean with shoreline foam and swash, wet and dry sand, footprints, instanced palms and grass, day and night sky, command console with the same commands an AI can send, autosave, .n0scene export and import (version 4, reads 2 and 3), .n0world import (shapes and prefabs, with a report). Entities with stable ids, undo and saves; a searchable asset catalog with licence fields; a convenience store built from a seed, with a real door, windows, aisles, over a thousand stocked product instances in three draw calls, and products you can pick up and put back (F, RB or the Use button).'],
  ['Approximated', 'Melee hit checks are a reach-and-cone test, not per-limb hitboxes. The fighters are block-built characters with no skinned mesh and no ragdoll; knockdowns are authored poses. Grab holds a prop with a velocity target, it is not a rope or joint. Sand grains are thousands of small visual particles that fall, bounce and settle. They are not a granular simulation, and the beach is a heightfield. The ocean is a visual wave model, not a fluid simulation. If Rapier cannot load, a simple built-in solver takes over. The character is a procedural two-bone rig. Imported worlds are placed as static solid shapes. Catalog assets are generated in code (simple shapes), not scanned models: the GLB importer works but no third-party model is bundled yet because none has a verified licence. Interiors are lit by two cheap point lights.'],
  ['Planned', 'The repo human with its walk cycle and ragdoll, scattering any prefab (palms only for now), transactional preview and commit for agents, licensed GLB assets, navmesh and people, vehicles, pedestrians and crowds, buildings and interiors, streaming world tiles (the world is 256 m for now), saving grass and footprints, node graph (Fuse), look and effects pipeline, placing .n0world rules, doors and drivable vehicles.'],
];
const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };

export class UI {
  constructor(app) {
    this.a = app; this.group = 0; this.toolIdx = 0; this.hidden = false; this.padOn = false; const root = document.getElementById('ui');
    root.innerHTML = `
    <div class="top">
      <div class="brand"><b>n0ise</b><span id="bname">CORE</span></div>
      <div class="seg" id="mode"><button data-m="explore" class="on">Explore</button><button data-m="edit">Edit</button></div>
      <div class="tr"><button class="ib" id="bUndo" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button><button class="ib" id="bRedo" title="Redo" aria-label="Redo">↷</button><button class="ib" id="bSnap" title="Screenshot (P)" aria-label="Screenshot">◉</button><button class="ib" id="bCon" title="Console (/)" aria-label="Console">&gt;_</button><button class="ib" id="bHelp" title="Guide (?)" aria-label="Guide">?</button></div>
    </div>
    <div class="chips" id="chips"><button data-k="brawler">+ Brawler</button><button data-k="heavy">+ Heavy</button><button data-k="dummy">+ Dummy</button><button data-k="clear">Clear</button><button data-k="fps">First person</button></div>
    <div class="hint" id="hint"></div>
    <div class="flash" id="flash" aria-live="polite"></div>
    <div class="toast" id="toast"></div>
    <div class="dock" id="dock">
      <div class="panel" id="panel"></div>
      <div class="groups" id="groups">${GROUPS.map((g, i) => `<button data-g="${i}">${g.name}</button>`).join('')}</div>
    </div>
    <div class="pads" id="pads"><div class="stick" id="stick"><i></i></div><button class="act" id="bJump">Jump</button><button class="act s" id="bRock">Boulder</button><button class="act u" id="bUse">Use</button>
      <div class="acts"><button class="act" data-a="punch">Punch</button><button class="act" data-a="kick">Kick</button><button class="act" data-a="block">Block</button><button class="act" data-a="dodge">Dodge</button></div></div>
    <div class="pill" id="padhint"></div>
    <div class="con" id="con"><div class="log" id="log"></div><form id="conf"><span>&gt;</span><input id="cin" autocomplete="off" spellcheck="false" placeholder='time 18.5 · sea .8 · tide -.2 · boulder · palms 10 · help'/></form></div>
    <div class="sheet" id="guide" role="dialog" aria-label="Guide"><div class="card"><div class="gh"><b>n0ise Core</b><button class="ib" id="gx" aria-label="Close">✕</button></div>
      <div class="cols"><section><h4>Move</h4><p><kbd>WASD</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump (hold for height) · right-drag or middle-drag to look · wheel zoom</p><p><kbd>J</kbd> or left click punch · <kbd>K</kbd> kick · <kbd>Q</kbd> block (tap just before a hit to parry) · <kbd>C</kbd> dodge roll · <kbd>Tab</kbd> lock on · click a prop to grab it, wheel lifts, let go to throw · <kbd>V</kbd> first person (hold right mouse to aim, left to fire, even while aiming) · <kbd>M</kbd> sound · <kbd>T</kbd> tune panel</p><p>Pad: left stick move · right stick look · A jump · X punch · Y kick · B dodge · LT block · RT grab · RB lock-on · LB use · L3 run · R3 recentre · Select edit</p>
      <h4>Edit</h4><p><kbd>E</kbd> toggle Explore / Edit · drag to paint · <kbd>[</kbd><kbd>]</kbd> radius · <kbd>1–8</kbd> tools · right-drag orbit · shift-drag pan</p><p>Pad: RT or A apply · LT invert · LB/RB tool · D-pad ↑↓ group, ←→ radius · Y mode · B back to Explore · X undo</p>
      <h4>Other</h4><p><kbd>B</kbd> boulder · <kbd>/</kbd> console · <kbd>H</kbd> hide UI · <kbd>P</kbd> screenshot · <kbd>Ctrl+Z</kbd> undo</p><p>Touch: left stick moves, drag looks, buttons for jump, punch, kick, block and dodge; Edit: one finger paints, two orbit/pinch.</p></section>
      <section><h4>What is real</h4>${STATUS.map(([k, v]) => `<div class="st ${k}"><em>${k}</em><span>${v}</span></div>`).join('')}
      <div class="row"><button class="btn" id="bExp">Export scene</button><button class="btn" id="bImp">Import</button><button class="btn" id="bNew">New terrain</button><button class="btn" id="bStart">Start screen</button></div></section></div></div></div>
    <input type="file" id="file" accept=".n0scene,.n0world,.json" hidden />
    <div class="sheet" id="report" role="dialog" aria-label="Import report"><div class="card"><div class="gh"><b id="rtitle">Import report</b><button class="ib" id="rx" aria-label="Close">✕</button></div><div id="rbody" class="rbody"></div></div></div>
    <div class="start" id="start" role="dialog" aria-label="Start"><div class="sc"><div class="sb"><b>n0ise</b> Core</div><p class="ss">Pick how to begin. You can switch any time from the guide.</p><div class="scards" id="scards"></div></div></div>`;
    this.el = id => document.getElementById(id); this.root = root;
    const el = this.el;
    el('mode').onclick = e => { const m = e.target.dataset && e.target.dataset.m; if (m && m !== app.mode) app.toggleMode(); };
    el('bUndo').onclick = () => app.undo(); el('bRedo').onclick = () => app.redo(); el('bSnap').onclick = () => app.snap();
    el('bCon').onclick = () => this.toggleConsole(); el('bHelp').onclick = () => this.showGuide(); el('gx').onclick = () => this.closeAll();
    el('guide').onclick = e => { if (e.target.id === 'guide') this.closeAll(); };
    el('groups').onclick = e => { const g = e.target.dataset && e.target.dataset.g; if (g != null) this.setGroup(+g); };
    el('bStart').onclick = () => { this.closeAll(); this.showStart(app.core.hasSave()); }; el('rx').onclick = () => el('report').classList.remove('on'); el('report').onclick = e => { if (e.target.id === 'report') el('report').classList.remove('on'); };
    el('bExp').onclick = () => app.exportScene(); el('bImp').onclick = () => el('file').click(); el('bNew').onclick = () => { app.newIsland(); this.closeAll(); };
    el('file').onchange = e => { const f = e.target.files[0]; if (f) app.importScene(f); e.target.value = ''; };
    el('conf').onsubmit = e => { e.preventDefault(); const v = el('cin').value; if (!v.trim()) return; el('cin').value = ''; const r = app.core.run(v); this.log('> ' + v, ''); this.log(r.msg, r.ok ? 'ok' : 'bad'); };
    el('cin').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.toggleConsole(false); });
    el('bJump').addEventListener('pointerdown', e => { e.preventDefault(); app.input.jumpEdge = true; app.input.edge.jump = true; app.input.jumpHeld = true; }); el('bJump').addEventListener('pointerup', () => { app.input.jumpHeld = false; });
    el('chips').onclick = e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; if (k === 'fps') { if (app.shooter.active) app.shooter.exit(); else app.shooter.enter({}); e.target.blur(); return; } if (k === 'clear') app.core.exec({ cmd: 'actor.clear' }); else { const p = app.player, d = 4, r = app.core.exec({ cmd: 'actor.spawn', kind: k, x: p.pos.x + Math.sin(p.yaw) * d, z: p.pos.z + Math.cos(p.yaw) * d }); if (!r.ok) this.toast(r.msg); } this.updHist(); };
    this.root.querySelector('.acts').addEventListener('pointerdown', e => { const b = e.target.closest('[data-a]'); if (!b) return; e.preventDefault(); const a = b.dataset.a, I = app.input; if (a === 'punch') I.edge.punch = true; else if (a === 'kick') I.edge.kick = true; else if (a === 'dodge') I.edge.dodge = true; else if (a === 'block') I.touchBlock = true; });
    const rel = () => { app.input.touchBlock = false; }; this.root.querySelector('.acts').addEventListener('pointerup', rel); this.root.querySelector('.acts').addEventListener('pointercancel', rel); this.root.querySelector('.acts').addEventListener('pointerleave', rel); el('bRock').addEventListener('pointerdown', e => { e.preventDefault(); app.boulderAtCursor(); }); el('bUse').addEventListener('pointerdown', e => { e.preventDefault(); app.interact(); });
    // virtual stick
    const st = el('stick'), nub = st.firstChild; let id = null;
    const mv = e => { const r = st.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      app.input.stick = [dx, dy]; nub.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; };
    st.addEventListener('pointerdown', e => { id = e.pointerId; st.setPointerCapture(id); mv(e); }); st.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
    const end = e => { if (e.pointerId === id) { id = null; app.input.stick = [0, 0]; nub.style.transform = ''; } }; st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    this.booting = true; this.setGroup(0); this.booting = false; this.setMode('explore'); this.updHist();
    this.hintT = 0; this.startOpen = false;
  }
  say(t, ms = 5000) { const h = this.el('hint'); h.textContent = t; h.classList.add('on'); clearTimeout(this.hintT); this.hintT = setTimeout(() => h.classList.remove('on'), ms); }
  toast(t) { const e = this.el('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(this.toastT); this.toastT = setTimeout(() => e.classList.remove('on'), 1800); }
  log(t, c) { const l = this.el('log'), d = document.createElement('div'); d.className = c; d.textContent = t; l.appendChild(d); while (l.children.length > 40) l.firstChild.remove(); l.scrollTop = 1e9; }
  toggleConsole(on) { const c = this.el('con'); const v = on == null ? !c.classList.contains('on') : on; c.classList.toggle('on', v); if (v) setTimeout(() => this.el('cin').focus(), 30); else this.el('cin').blur(); }
  showGuide() { this.el('guide').classList.add('on'); } closeAll() { this.el('guide').classList.remove('on'); this.el('report').classList.remove('on'); this.toggleConsole(false); }
  brand() { const n = this.el('bname'); if (n) n.textContent = 'CORE \u00b7 ' + this.a.name; document.title = 'n0ise Core \u00b7 ' + this.a.name; }
  // the Blank / Coast demo / Import / Continue sheet
  showStart(hasSave) {
    const c = this.el('scards'), a = this.a; this.startOpen = true; this.el('start').classList.add('on');
    const card = (id, t, d, ic) => `<button class="scard" data-s="${id}"><i>${ic}</i><b>${t}</b><span>${d}</span></button>`;
    c.innerHTML = card('blank', 'Blank (level creator)', 'An empty grid floor under a sky and one sun. Build a level from blocks, ramps, props, pickups, fighters and a car, then press Play.', '\u25a1') + card('coast', 'Coast demo', 'COAST_001: an island with a beach, dunes, palms, a pier and a shack.', '\u25d0')
      + card('world', 'South Africa', 'Real streets, buildings and traffic streamed from OpenStreetMap. Starts in Cape Town; open the map to go anywhere in the country.', '\u25ce') + card('import', 'Import', 'Open a .n0scene you saved, or a .n0world to place on the land.', '\u2191') + (hasSave ? card('continue', 'Continue', 'Pick up your last autosaved scene.', '\u21bb') : '');
    c.onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; const k = b.dataset.s;
      if (k === 'import') { this.el('file').onchange = async ev => { const f = ev.target.files[0]; ev.target.value = ''; if (!f) return; this.hideStart(); await a.start('blank'); await a.importFile(f); this.el('file').onchange = ev2 => { const g = ev2.target.files[0]; if (g) a.importFile(g); ev2.target.value = ''; }; }; this.el('file').click(); return; }
      this.hideStart(); a.start(k); };
    const f = c.querySelector('button'); f && f.focus();
  }
  hideStart() { this.startOpen = false; this.el('start').classList.remove('on'); }
  report(items, title) {
    const by = { error: 'Could not use', fix: 'Repaired', warn: 'Check', note: 'Note', unsupported: 'Not supported in Core yet' }, order = ['error', 'unsupported', 'warn', 'fix', 'note'];
    const groups = order.map(k => [k, items.filter(i => i.level === k)]).filter(g => g[1].length);
    this.el('rtitle').textContent = title || 'Import report';
    this.el('rbody').innerHTML = groups.length ? groups.map(([k, l]) => `<h4>${by[k]} (${l.length})</h4>` + l.map(i => `<p class="r-${k}"></p>`).join('')).join('') : '<p>Everything in the file was placed.</p>';
    let n = 0; this.el('rbody').querySelectorAll('p[class^=r-]').forEach(p => { p.textContent = groups.flatMap(g => g[1])[n++].text; });
    this.el('report').classList.add('on');
  }
  // any sheet that should take the keyboard and the pointer away from the world
  modalOpen() { return !!(this.startOpen || this.el('guide').classList.contains('on') || this.el('report').classList.contains('on') || this.root.querySelector('.ws-confirm.on')); }
  flash(t) { const e = this.el('flash'); e.textContent = t; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); clearTimeout(this.flashT); this.flashT = setTimeout(() => e.classList.remove('on'), 900); }
  toggleHidden() { this.hidden = !this.hidden; this.root.classList.toggle('hide', this.hidden); }
  setMode(m) { this.root.dataset.mode = m; for (const b of this.el('mode').children) b.classList.toggle('on', b.dataset.m === m);
    if (m === 'edit') this.say(this.padOn ? 'RT apply · LT invert · LB/RB tools · Y back to Explore' : 'Drag to paint · right-drag orbit · shift-drag pan · [ ] radius', 6000); else this.say('Walk around · E to edit · / for the console', 5000); this.render(); }
  pad(on) { this.padOn = on; this.root.classList.toggle('padmode', on); const h = this.el('padhint'); h.innerHTML = on ? (this.a.mode === 'explore' ? '<b>A</b> jump <b>X</b> punch <b>Y</b> kick <b>B</b> dodge <b>LT</b> block <b>RT</b> grab <b>RB</b> lock' : '<b>A/RT</b> apply <b>LT</b> invert <b>LB/RB</b> tool <b>B</b> undo <b>Y</b> mode') : ''; }
  setGroup(i) { this.group = ((i % GROUPS.length) + GROUPS.length) % GROUPS.length; this.toolIdx = 0; for (const b of this.el('groups').children) b.classList.toggle('on', +b.dataset.g === this.group); this.render(); if (GROUPS[this.group].tools.length) this.a.setTool(GROUPS[this.group].tools[0][0]); if (!this.booting && this.a.mode === 'explore' && GROUPS[this.group].id !== 'sky' && GROUPS[this.group].id !== 'place') this.a.setMode('edit'); }
  curGroupId() { return GROUPS[this.group].id; }
  refreshPanel() { this.render(); }
  cycleGroup(d) { this.setGroup(this.group + d); }
  cycleTool(d) { const t = GROUPS[this.group].tools; if (!t.length) return; this.toolIdx = (this.toolIdx + d + t.length) % t.length; this.a.setTool(t[this.toolIdx][0]); this.render(); }
  pickToolIndex(n) { const all = GROUPS.flatMap((g, gi) => g.tools.map((t, ti) => [gi, ti])); const p = all[n]; if (!p) return; this.group = p[0]; this.toolIdx = p[1]; for (const b of this.el('groups').children) b.classList.toggle('on', +b.dataset.g === this.group); this.a.setTool(GROUPS[p[0]].tools[p[1]][0]); if (this.a.mode === 'explore') this.a.setMode('edit'); this.render(); }
  render() {
    const g = GROUPS[this.group], p = this.el('panel'), a = this.a; p.innerHTML = ''; this.root.dataset.grp = g.id;
    if (g.id === 'place') { this.renderPlace(p); return; }
    if (g.id === 'build' && a.editor) { a.editor.panelBuild(p); return; }
    if (g.id === 'scene' && a.editor) { a.editor.panelScene(p); return; }
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
  // Place: searchable asset catalog, one-tap placement, and the convenience store
  renderPlace(p) {
    const a = this.a; p.className = 'panel place'; const q = this.placeQ || '', tag = this.placeTag || '';
    const tags = ['retail', 'street', 'nature', 'vehicle'], inv = a.inventory();
    p.innerHTML = `<div class="prow"><input type="search" id="psearch" placeholder="Search assets" value="${q.replace(/"/g, '&quot;')}" aria-label="Search assets"/><button class="btn" id="pstore">Build store</button></div>
      <div class="chips">${tags.map(t => `<button data-t="${t}" aria-pressed="${tag === t}">${t}</button>`).join('')}</div><div class="plist" id="plist"></div>
      <div class="prow small"><span>In hand: ${inv.length ? inv.length + ' item' + (inv.length > 1 ? 's' : '') : 'nothing'}</span><button class="btn" id="pret" ${inv.length ? '' : 'disabled'}>Put back</button></div>`;
    const list = p.querySelector('#plist'), res = a.core.exec({ cmd: 'asset.catalog', query: q, tags: tag ? [tag] : [], limit: 40 });
    (res.assets || []).forEach(s => { const b = document.createElement('button'); b.className = 'pitem'; b.innerHTML = `<b></b><span>${s.size.map(n => n.toFixed(1)).join(' \u00d7 ')} m</span>`; b.firstChild.textContent = s.name; b.title = s.license; b.onclick = () => { const r = a.core.exec({ cmd: 'asset.place', assetId: s.id }); this.toast(r.ok ? 'Placed ' + s.name : r.msg); this.updHist(); }; list.appendChild(b); });
    if (!(res.assets || []).length) list.innerHTML = '<p class="none">Nothing matches. Try another word.</p>';
    const si = p.querySelector('#psearch'); si.oninput = () => { this.placeQ = si.value; clearTimeout(this.pT); this.pT = setTimeout(() => { this.render(); const n = this.el('psearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180); };
    si.addEventListener('keydown', e => e.stopPropagation());
    p.querySelector('.chips').onclick = e => { const t = e.target.dataset && e.target.dataset.t; if (t) { this.placeTag = this.placeTag === t ? '' : t; this.render(); } };
    p.querySelector('#pstore').onclick = () => { const r = a.core.exec({ cmd: 'prefab.build', type: 'retail.convenience', seed: 42 }); this.toast(r.ok ? 'Store built. Walk in, F to use' : r.msg); this.updHist(); this.render(); };
    p.querySelector('#pret').onclick = () => { const r = a.core.exec({ cmd: 'product.return' }); this.toast(r.msg); this.updHist(); this.render(); };
  }
  num(g, i) { let n = 1; for (let k = 0; k < g; k++) n += GROUPS[k].tools.length; return n + i; }
  syncRadius() { if (this.miniR) this.miniR.value = this.a.R; }
  updHist() { const c = this.a.core; this.el('bUndo').disabled = !c.canUndo(); this.el('bRedo').disabled = !c.canRedo(); }
  saved() { this.el('bSnap').title = 'Screenshot (P) · autosaved ' + new Date().toLocaleTimeString(); }
}
