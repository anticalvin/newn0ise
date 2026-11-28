// Core workspace shell: project launcher, workspace navigation, contextual inspector, live status bar.
// A presentation layer over the existing UI class and Core.exec. It owns no simulation state and adds no second engine.
// Mounted once from main.js. mountWorkspace() is idempotent; dispose() removes every listener, timer, node and patch it made.
const icons = { box: 'M4 7 12 3l8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10', view: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', person: 'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-7 9 7-2 7 2M12 10v6m0 0-5 5m5-5 5 5', car: 'M3 16v-5l3-6h12l3 6v5H3Zm2 0v3m14-3v3M3 11h18M7 13h2m6 0h2', earth: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c-6 5-6 15 0 20m0-20c6 5 6 15 0 20', house: 'M3 11 12 3l9 8M5 10v11h14V10m-10 11v-7h6v7', layers: 'm3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4m-18 5 9 4 9-4', mountain: 'm2 20 7-12 4 6 4-9 5 15H2Z', sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2', game: 'M5 7h14l3 9-3 3-4-4H9l-4 4-3-3 3-9Zm2 3v4m-2-2h4m7-1h.01m3 2h.01', camera: 'M3 6h12v12H3zM15 10l6-4v12l-6-4', chart: 'M3 3v18h18M7 16l4-6 4 3 5-7', folder: 'M3 6h7l2 3h9v11H3z', arrow: 'M5 12h14m-6-6 6 6-6 6', check: 'm5 12 4 4 10-10', settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6', close: 'm6 6 12 12M18 6 6 18', menu: 'M4 6h16M4 12h16M4 18h16', terminal: 'm4 6 6 6-6 6m9 0h7' };
const ico = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.box}"/></svg>`;
// [id, name, icon, description, meta, status label, launch route (null = not implemented)]
const templates = [['blank', 'Blank (level creator)', 'box', 'An empty grid floor and a sky. Build a level from pieces, props, pickups, fighters and a car, then Play it.', 'Level creator · physics · combat', 'Ready', 'blank'], ['first', 'First person', 'view', 'A grounded, first-person experience.', 'Camera · interaction', 'Planned', null], ['third', 'Third person', 'person', 'A blank island with the embodied player and a follow camera.', 'Movement · follow camera', 'Ready', 'blank'], ['vehicle', 'Vehicle', 'car', 'A dedicated driving and handling template.', 'Suspension · drivetrain', 'Planned', null], ['open', 'Open world', 'earth', 'A configurable streamed world.', 'Terrain · regions · population', 'Planned', null], ['interior', 'Interior', 'house', 'A room-first architectural project.', 'Rooms · media · interaction', 'Planned', null]];
const examples = [['coast', 'COAST_001', 'mountain', 'Sculptable island, sea, vegetation and physics.', 'Environmental reference', 'Ready', 'coast'], ['world', 'South Africa', 'earth', 'National relief, detailed Cape Town, roads and traffic.', 'Large-world benchmark', 'Existing', 'world'], ['habitat', 'HABITAT_01', 'house', 'Safehouse, garage, outdoor road and gameplay.', 'Integration target', 'Planned', null], ['first-light', 'FIRST LIGHT', 'house', 'Playable coastal district, vehicles, interiors and a mission. Plays as the character you made in Character.', 'Gameplay vertical slice', 'Preview', 'first-light'], ['photowalk', 'Photo walk', 'camera', 'Walk the coast with a camera. Pick a lens and a frame, shoot the subjects on your list and keep a roll.', 'Photography · lenses', 'Ready', 'photowalk'], ['starter', 'Starter island', 'game', 'A small island with a staircase of platforms, crates to climb and a gold goal. Ready to play now.', 'Platforming · movement', 'Ready', 'starter'], ['sandbox', 'Physics sandbox', 'box', 'A wall of crates and boulders to knock about with a real physics engine.', 'Physics', 'Ready', 'sandbox'], ['proving', 'Proving ground', 'game', 'An open yard of ramps, steps, a gap and a slalom to test movement.', 'Movement tests', 'Ready', 'proving'], ['range', 'Shooting range', 'game', 'First-person target practice with two weapons, aim-down-sights with a red dot, bloom and a clock.', 'Shooter · weapons', 'Ready', 'range'], ['arena', 'Drone arena', 'game', 'Survive three waves of flying drones. Health, ammo drops, headshots.', 'Shooter · survival', 'Ready', 'arena'], ['coins', 'Coin run', 'game', 'Platform across floating blocks, grab every coin and plant the flag before time runs out.', 'Platformer · collectibles', 'Ready', 'coins'], ['import', 'Import a world', 'folder', 'Open a .n0world file an AI wrote, or one you exported from the old 3D page.', 'File import', 'Ready', 'import']];
const labs = [['combatlab', 'Combat lab', 'game', 'A flat 220 m arena with the Tune panel: movement, camera and combat feel. Nothing here is autosaved.', 'Movement · combat · grab', 'Ready', 'lab'], ['blanklab', 'Blank laboratory', 'box', 'Isolated movement, terrain and physical tests.', 'Core baseline', 'Ready', 'blank'], ['envlab', 'Environment laboratory', 'sun', 'Existing island for ocean, atmosphere and terrain.', 'COAST_001', 'Ready', 'coast'], ['streamlab', 'Streaming laboratory', 'earth', 'Existing South Africa geographical stress test.', 'Cape Town · national scale', 'Existing', 'world'], ['charlab', 'Character laboratory', 'person', 'Skeletal animation, IK and active ragdolls.', 'Embodiment R&D', 'Planned', null], ['vehlab', 'Vehicle laboratory', 'car', 'Suspension, contacts and damage tests.', 'Mobility R&D', 'Planned', null], ['gameplaylab', 'Gameplay laboratory', 'game', 'Interactions, missions and state persistence.', 'Runtime R&D', 'Planned', null]];
// [name, icon, dock group it opens (null = inspector only), description]
const nav = [['World', 'mountain', 0, 'Terrain and world construction'], ['Scene', 'layers', null, 'Entity hierarchy and inspection'], ['Assets', 'folder', 3, 'Asset catalogue and prefabs'], ['Characters', 'person', null, 'Embodiment and animation'], ['Vehicles', 'car', null, 'Vehicle profiles and handling'], ['Gameplay', 'game', null, 'Interactions and missions'], ['Environment', 'sun', 6, 'Sky, ocean and time'], ['Cinematics', 'camera', null, 'Cameras and sequences'], ['Diagnostics', 'chart', null, 'Runtime metrics and tools']];
const future = { Characters: [['Locomotion', 'Existing player controller'], ['Skeleton and rig', 'Studio technology; integration planned'], ['Animation graph', 'Planned'], ['Inverse kinematics', 'Planned'], ['Active ragdoll', 'Research; integration planned'], ['Character profiles', 'Planned']], Vehicles: [['Vehicle controller', 'Existing in South Africa'], ['Suspension and drivetrain', 'Shared runtime planned'], ['Seat and entry anchors', 'Planned'], ['Damage and destruction', 'Planned'], ['Traffic and routing', 'Existing in South Africa']], Gameplay: [['Interactions', 'Store door and products are existing'], ['Inventory and equipment', 'General framework planned'], ['Mission graph', 'Studio rules; Core integration planned'], ['Triggers and objectives', 'Planned'], ['Spatial audio and media', 'Planned'], ['Checkpoints', 'Planned']], Cinematics: [['Camera manipulation', 'Existing through Core API'], ['Capture screenshot', 'Existing'], ['Camera paths', 'Planned'], ['Sequence editor', 'Planned'], ['Animation timeline', 'Planned']] };
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mountWorkspace(n0) {
  const a = n0.app, ui = a.ui, root = ui.root || document.getElementById('ui');
  if (!root) return null;
  if (n0.workspace) return n0.workspace;                      // idempotent
  root.dataset.workspace = '1';
  const ac = new AbortController(), on = (t, ev, fn, o) => t.addEventListener(ev, fn, { ...o, signal: ac.signal });
  const patches = [], added = [];
  const patch = (obj, key, make) => { const orig = obj[key]; obj[key] = make(orig.bind(obj)); patches.push(() => { obj[key] = orig; }); };
  const add = (parent, node, before) => { parent.insertBefore(node, before || null); added.push(node); return node; };

  const start = ui.el('start'), sc = start.querySelector('.sc'), cards = ui.el('scards');
  let tab = 'Create', selected = 'third', hasSave = false, opened = !ui.startOpen, workspace = 'World', selectedEntity = null, lastErr = '', wasBusy = false;
  // "unsaved" = commands run since the scene was started, loaded or exported. The autosave slot is overwritten when a new scene starts, so that is when we ask.
  const sig = () => a.core.hist.length + ':' + a.core.ptr;
  let clean = sig();
  const dirty = () => sig() !== clean;
  const busy = () => !!a.geo?.loading;

  // ---- confirm dialog (replaces window.confirm; takes focus, Escape cancels, suppresses game input via ui.modalOpen) ----
  const dlg = add(root, el('div', 'ws-confirm', '<div class="ws-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="ws-cf-t"><b id="ws-cf-t"></b><p id="ws-cf-b"></p><div class="ws-confirm-row"><button class="ws-secondary" data-r="0"></button><button class="ws-primary" data-r="1"></button></div></div>'));
  let dlgDone = null;
  const closeDlg = v => { dlg.classList.remove('on'); const d = dlgDone; dlgDone = null; if (d) d(v); };
  on(dlg, 'click', e => { const b = e.target.closest('button'); if (b) closeDlg(b.dataset.r === '1'); else if (e.target === dlg) closeDlg(false); });
  on(dlg, 'keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeDlg(false); } });
  const confirmDialog = ({ title, body, ok, cancel = 'Cancel' }) => new Promise(res => {
    if (dlgDone) closeDlg(false);
    dlg.querySelector('#ws-cf-t').textContent = title; dlg.querySelector('#ws-cf-b').textContent = body;
    dlg.querySelector('[data-r="0"]').textContent = cancel; dlg.querySelector('[data-r="1"]').textContent = ok;
    dlgDone = res; dlg.classList.add('on'); dlg.querySelector('[data-r="0"]').focus();
  });
  const okToReplace = (what) => dirty() ? confirmDialog({ title: 'Discard unsaved changes?', body: `You have edits in this scene that are not exported. ${what} replaces the scene. Export first if you want to keep it.`, ok: 'Replace scene', cancel: 'Keep editing' }) : Promise.resolve(true);

  // ---- project lifecycle: every launcher route goes through here ----
  patch(a, 'start', base => async choice => {
    if (busy()) { ui.toast('South Africa is still loading. Try again in a moment.'); return { ok: false, msg: 'busy' }; }
    if (choice === 'world') {
      if (a.geo.active) return { ok: true };
      const r = await a.geo.open({ resume: true }); ui.brand();
      if (!r.ok) { lastErr = 'South Africa could not open: ' + r.msg; if (!ui.startOpen) ui.showStart(a.core.hasSave()); }
      return r;
    }
    if (a.geo?.active) a.geo.close();                        // leaves only transient world resources; the local scene is still there
    if (choice === 'first-light') return base(choice);
    const r = await base(choice); clean = sig(); return r;
  });
  async function go(choice) {
    if (busy()) { ui.toast('South Africa is still loading. Try again in a moment.'); return; }
    lastErr = '';
    if (choice === 'world') { if (a.geo.active) { ui.hideStart(); return; } ui.hideStart(); a.start('world'); return; }
    if (choice === 'first-light') { ui.hideStart(); await a.start(choice); return; }
    if (choice === 'continue' && !a.core.hasSave()) { ui.toast('There is no autosaved scene yet'); return; }
    if (opened && !a.geo?.active && !(await okToReplace(choice === 'continue' ? 'Continuing the autosave' : 'A new scene'))) return;
    ui.hideStart(); await a.start(choice);
  }
  // ---- import: parse and validate first, change nothing until the file is known good ----
  const picker = add(root, Object.assign(el('input'), { type: 'file', accept: '.n0scene,.n0world,.json', hidden: true }));
  on(picker, 'change', async () => { const f = picker.files[0]; picker.value = ''; if (f) await importFile(f); });
  async function importFile(f) {
    if (busy()) { ui.toast('South Africa is still loading. Try again in a moment.'); return; }
    let j;
    try { j = JSON.parse(await f.text()); } catch (e) { ui.toast('Could not read ' + f.name + ': it is not valid JSON. Nothing was changed.'); return; }
    if (j && j.format === 'n0ise-world') {
      const r = a.readWorld(j); if (!r.ok) { ui.report(r.items, 'Could not import'); ui.toast('That world file is not valid. Nothing was changed.'); return; }
    } else { try { a.core.checkScene(j); } catch (e) { ui.toast('Could not open ' + f.name + ': ' + e.message + '. Nothing was changed.'); return; } }
    if (!(await okToReplace(j.format === 'n0ise-world' ? 'Placing a world' : 'Opening a scene'))) return;
    if (a.geo?.active) a.geo.close();
    ui.hideStart(); const r = await a.importFile(f); if (r && r.ok) clean = sig();
  }
  patch(a, 'importScene', () => f => importFile(f));          // the guide's Import button gets the same checks
  ui.el('file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
  patch(a, 'exportScene', base => async () => { const r = await base(); clean = sig(); return r; });

  // ---- launcher ----
  patch(ui, 'showStart', base => save => { hasSave = !!save; tab = 'Create'; selected = 'third'; base(save); renderLauncher(); cards.querySelector('.chosen')?.focus(); });
  patch(ui, 'hideStart', base => () => { base(); opened = true; root.dataset.launcher = 'closed'; });
  function renderLauncher() {
    sc.classList.add('ws-launch'); sc.querySelector('.sb')?.setAttribute('hidden', ''); sc.querySelector('.ss')?.setAttribute('hidden', ''); cards.className = 'ws-launch-body';
    const loading = busy(), inWorld = !!a.geo?.active;
    const rows = tab === 'Create' ? templates : tab === 'Examples' ? examples : tab === 'Labs' ? labs : [];
    const pick = rows.find(x => x[0] === selected) || rows[0]; if (pick) selected = pick[0];
    const label = { Create: 'PROJECT TEMPLATES', Projects: 'LOCAL SCENES', Examples: 'REFERENCE WORLDS', Labs: 'ENGINE VALIDATION' }[tab];
    const note = loading ? 'South Africa is loading. Projects are locked until it finishes.' : lastErr ? lastErr : tab === 'Projects' ? 'Project management is a future engine capability.' : pick?.[6] ? pick[0] === 'third' ? 'Uses the existing third-person player on Blank.' : 'Uses the existing Core runtime.' : 'This entry is reserved for future implementation.';
    cards.innerHTML = `<header class="ws-launch-top"><div class="ws-wordmark">n0ise <span>/ CORE</span></div><div class="ws-launch-right"><span class="ws-build"><i></i>ENGINE WORKSPACE</span><a class="ws-quiet" href="character.html" style="display:inline-grid;place-items:center;text-decoration:none">Character</a><a class="ws-quiet" href="studio.html" style="display:inline-grid;place-items:center;text-decoration:none" title="Sigil, Material, Build, Sculpt, Photo to 3D and the model viewer">More 3D tools</a>${inWorld ? `<button data-leave class="ws-quiet" ${loading ? 'disabled' : ''}>Return to local scene</button>` : ''}${opened ? `<button data-return class="ws-quiet">Return to viewport ${ico('arrow', 16)}</button>` : ''}</div></header>
<div class="ws-intro"><div><div class="ws-kicker">WORLD CREATION / 01</div><h1>Project workspace<span>.</span></h1><p>Create, author and simulate interactive worlds.</p></div><div class="ws-intro-note"><span>CORE WORKBENCH</span><b>One engine.<br>Many worlds.</b></div></div>
<nav class="ws-tabs" aria-label="Project sections">${['Create', 'Projects', 'Examples', 'Labs'].map(t => `<button data-tab="${t}" aria-pressed="${tab === t}">${t}</button>`).join('')}</nav>
<div class="ws-section-label"><span>${label}</span><span>${rows.length ? String(rows.length).padStart(2, '0') + ' ENTRIES' : 'CURRENT STORAGE'}</span></div>
${tab === 'Projects' ? `<div class="ws-projects"><div class="ws-project-item">${ico('folder', 28)}<div><b>${hasSave ? 'Last autosaved scene' : 'No saved scene yet'}</b><p>Core currently supports one local autosave. Named projects are planned.</p></div><button data-launch="continue" class="ws-secondary" ${hasSave && !loading ? '' : 'disabled'}>Continue</button></div><div class="ws-project-item">${ico('layers', 28)}<div><b>Import a scene</b><p>Open .n0scene or place a .n0world document. The file is checked before anything changes.</p></div><button data-launch="import" class="ws-secondary" ${loading ? 'disabled' : ''}>Import</button></div></div>`
        : `<div class="ws-template-grid">${rows.map(r => `<button class="ws-template ${selected === r[0] ? 'chosen' : ''}" data-template="${r[0]}" aria-pressed="${selected === r[0]}"><div class="ws-template-top"><span class="ws-template-icon">${ico(r[2], 26)}</span><span class="ws-template-status ${r[6] ? 'available' : ''}">${r[5]}</span></div><b>${r[1]}</b><p>${r[3]}</p><div class="ws-template-meta">${r[4]}${selected === r[0] ? ico('check', 16) : ''}</div></button>`).join('')}</div>`}
<footer class="ws-launch-foot"><div class="ws-selection"><span>${tab === 'Projects' ? 'PROJECT STORAGE' : 'SELECTED ' + (tab === 'Create' ? 'TEMPLATE' : 'WORLD')}</span><b>${tab === 'Projects' ? 'Local autosave and scene files' : pick?.[1] || ''}</b><small role="status">${esc(note)}</small></div>${tab !== 'Projects' ? `<button class="ws-primary" data-launch="${pick?.[6] || ''}" ${pick?.[6] && !loading ? '' : 'disabled'}>${pick?.[6] ? (tab === 'Create' ? 'Create scene' : 'Open environment') : 'Not implemented'} ${ico('arrow', 18)}</button>` : ''}</footer>
<div class="ws-launch-bottom"><span>n0ise / core systems</span><span>Existing runtime preserved · WebGL / Rapier</span></div>`;
  }
  on(cards, 'click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.tab) { tab = b.dataset.tab; selected = tab === 'Create' ? 'third' : tab === 'Examples' ? 'coast' : tab === 'Labs' ? 'blanklab' : ''; renderLauncher(); cards.querySelector(`[data-tab="${tab}"]`)?.focus(); }
    else if (b.dataset.template) { selected = b.dataset.template; renderLauncher(); cards.querySelector(`[data-template="${selected}"]`)?.focus(); }
    else if (b.hasAttribute('data-return')) ui.hideStart();
    else if (b.hasAttribute('data-leave')) { a.geo.close(); renderLauncher(); }
    else if (b.dataset.launch === 'import') picker.click();
    else if (b.dataset.launch) go(b.dataset.launch);
  });
  on(window, 'keydown', e => { if (e.key === 'Escape' && ui.startOpen && opened && !dlg.classList.contains('on')) ui.hideStart(); });
  if (ui.startOpen) { hasSave = !!a.core.hasSave(); renderLauncher(); }

  // ---- header ----
  const top = root.querySelector('.top'), brand = top.querySelector('.brand'), mode = ui.el('mode');
  brand.classList.add('ws-brand'); brand.insertAdjacentHTML('afterbegin', `<button id="ws-project" title="Project workspace" aria-label="Open project workspace">${ico('menu', 19)}</button>`);
  brand.insertAdjacentHTML('beforeend', '<span class="ws-brand-divider"></span><span class="ws-context">WORKSPACE</span>');
  const brandKids = [...brand.querySelectorAll('#ws-project,.ws-brand-divider,.ws-context')];
  ui.el('ws-project').onclick = () => ui.showStart(a.core.hasSave());
  const modeText = [...mode.children].map(b => b.textContent); mode.querySelector('[data-m="explore"]').textContent = 'Play'; mode.querySelector('[data-m="edit"]').textContent = 'Edit';
  const sim = add(mode, Object.assign(el('button', '', 'Simulate'), { disabled: true, title: 'Isolated simulation mode is planned' })); mode.setAttribute('aria-label', 'Runtime mode');
  mode.querySelector('[data-m=explore]').title = 'Existing Explore mode; changes are not isolated from the editor yet';
  const filebar = add(top, el('div', 'ws-filebar', `<button data-file="import">Import</button><button data-file="export">Export</button><button data-file="project">Projects ${ico('arrow', 14)}</button>`), top.querySelector('.tr'));
  on(filebar, 'click', e => { const k = e.target.closest('button')?.dataset.file; if (k === 'import') picker.click(); if (k === 'export') a.exportScene(); if (k === 'project') ui.showStart(a.core.hasSave()); });

  // ---- sidebar, dock, inspector, status ----
  const sidebar = add(root, el('aside', 'ws-sidebar', `<div class="ws-panel-heading"><span>WORKSPACES</span><span>09</span></div><nav aria-label="Engine workspaces">${nav.map(([n, i]) => `<button data-workspace="${n}" aria-pressed="${n === 'World'}">${ico(i, 18)}<span>${n}</span><i></i></button>`).join('')}</nav><div class="ws-side-bottom"><div class="ws-panel-heading"><span>PROJECT</span></div><button data-side="launcher">${ico('folder', 18)} Project workspace</button><button data-side="import">${ico('layers', 18)} Import scene</button><button data-side="export">${ico('folder', 18)} Export scene</button><button data-side="console">${ico('terminal', 18)} Command console</button><button data-side="help">${ico('settings', 18)} Controls &amp; guide</button></div>`));
  const dock = ui.el('dock'); dock.insertAdjacentHTML('afterbegin', `<div class="ws-panel-heading ws-dock-heading"><span id="ws-dock-title">WORLD / TOOLS</span><button id="ws-dock-close" aria-label="Close tools" title="Close tools">${ico('close', 16)}</button></div>`);
  const dockHead = dock.querySelector('.ws-dock-heading');
  const details = add(root, el('aside', 'ws-details')); details.setAttribute('aria-label', 'Workspace inspector');
  const status = add(root, el('div', 'ws-status', `<div><span class="ws-led"></span><b id="ws-runtime">CORE RUNTIME</b><span id="ws-scene">Scene</span></div><div><span id="ws-fps">FPS —</span><span id="ws-phys">PHYSICS —</span><button id="ws-diag" title="Diagnostics">${ico('chart', 16)} Diagnostics</button></div>`));
  const mobileNav = add(root, el('button', 'ws-mobile-nav', ico('layers', 20) + ' Workspaces')); mobileNav.setAttribute('aria-expanded', 'false');
  on(mobileNav, 'click', () => { const o = root.classList.toggle('ws-nav-open'); mobileNav.setAttribute('aria-expanded', String(o)); });
  add(root, el('div', 'ws-viewtag', '<span>PERSPECTIVE</span><span>LIT</span>'));
  const syncWorkspace = () => { root.dataset.workspacePanel = workspace; for (const b of sidebar.querySelectorAll('[data-workspace]')) b.setAttribute('aria-pressed', String(b.dataset.workspace === workspace)); ui.el('ws-dock-title').textContent = workspace.toUpperCase() + ' / TOOLS'; };
  function setWorkspace(name, { fromGroup = false } = {}) {
    workspace = name; root.classList.remove('ws-tools-closed', 'ws-nav-open'); mobileNav.setAttribute('aria-expanded', 'false'); syncWorkspace();
    const g = nav.find(x => x[0] === name)?.[2];
    if (g != null && !fromGroup && !a.geo?.active) { if (a.mode !== 'edit') a.setMode('edit'); ui.setGroup(g); }
    renderDetails();
  }
  on(sidebar, 'click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.workspace) { root.classList.remove('ws-nav-open'); setWorkspace(b.dataset.workspace); }
    if (b.dataset.side === 'launcher') ui.showStart(a.core.hasSave());
    if (b.dataset.side === 'import') picker.click();
    if (b.dataset.side === 'export') a.exportScene();
    if (b.dataset.side === 'console') ui.toggleConsole();
    if (b.dataset.side === 'help') ui.showGuide();
  });
  ui.el('ws-dock-close').onclick = () => root.classList.toggle('ws-tools-closed'); ui.el('ws-diag').onclick = () => setWorkspace('Diagnostics');
  patch(ui, 'setGroup', base => i => { const r = base(i); if ([0, 1, 2].includes(ui.group)) workspace = 'World'; else if (ui.group === 3) workspace = 'Assets'; else if (ui.group === 6) workspace = 'Environment'; root.classList.remove('ws-tools-closed'); syncWorkspace(); renderDetails(); return r; });
  patch(ui, 'pickToolIndex', base => n => { const r = base(n); workspace = 'World'; root.classList.remove('ws-tools-closed'); syncWorkspace(); renderDetails(); return r; });
  patch(ui, 'setMode', base => m => { const r = base(m); root.classList.remove('ws-tools-closed'); return r; });
  patch(ui, 'brand', base => () => { base(); const s = document.getElementById('ws-scene'); if (s) s.textContent = a.name; });

  // ---- inspector ----
  function entities() { try { return a.core.exec({ cmd: 'entity.list' }).entities || []; } catch (e) { return []; } }
  function renderDetails() {
    if (workspace === 'World' || workspace === 'Assets' || workspace === 'Environment') { details.innerHTML = ''; return; }
    let body = ''; const desc = nav.find(x => x[0] === workspace)?.[3] || '';
    if (workspace === 'Scene') {
      const items = entities();
      body = `<div class="ws-detail-section"><h4>Scene hierarchy</h4><div class="ws-entity-list">${items.length ? items.map(x => `<button data-entity="${esc(x.id)}" aria-pressed="${selectedEntity === x.id}">${ico('box', 16)}<span>${esc(x.id)}</span></button>`).join('') : '<p>No placed entities. Use Assets to place a prefab.</p>'}</div></div>`;
      if (selectedEntity) {
        const r = a.core.exec({ cmd: 'entity.inspect', id: selectedEntity }), x = r.ok ? r.entity : null;
        if (x) { const rec = x.record || x, pos = rec.transform?.position || rec.position || []; body += `<div class="ws-detail-section"><h4>Selected entity</h4><b>${esc(rec.id)}</b><p>${esc(rec.prefab)}</p><div class="ws-inspect-values">${pos.map((v, i) => `<label>${'XYZ'[i]} <input aria-label="Position ${'XYZ'[i]}" data-position="${i}" type="number" step="0.1" value="${Number(v).toFixed(3)}"></label>`).join('')}</div><button data-inspect="apply" class="ws-secondary">Apply position</button> <button data-inspect="refresh" class="ws-secondary">Refresh</button></div>`; }
        else selectedEntity = null;
      }
      body += `<div class="ws-detail-section"><h4>Authoring</h4><button data-go="Assets" class="ws-detail-action">${ico('folder', 17)} Browse existing assets ${ico('arrow', 15)}</button><div class="ws-roadmap-item"><b>Transform gizmos</b><span>Planned</span></div><div class="ws-roadmap-item"><b>Component inspector</b><span>Planned</span></div></div>`;
    } else if (workspace === 'Diagnostics') {
      body = `<div class="ws-detail-section"><h4>Live telemetry</h4><div id="ws-metrics" class="ws-metrics"></div></div><div class="ws-detail-section"><button data-action="console" class="ws-detail-action">${ico('terminal', 17)} Command console ${ico('arrow', 15)}</button><button data-action="snap" class="ws-detail-action">${ico('camera', 17)} Capture screenshot ${ico('arrow', 15)}</button><button data-action="describe" class="ws-detail-action">${ico('layers', 17)} Discover engine commands ${ico('arrow', 15)}</button></div>`;
    } else {
      body = `<div class="ws-detail-section"><h4>Capability map</h4>${(future[workspace] || []).map(([n, s]) => `<div class="ws-roadmap-item"><b>${n}</b><span>${s}</span></div>`).join('')}</div>`;
      if (workspace === 'Cinematics') body += `<div class="ws-detail-section"><button data-action="snap" class="ws-detail-action">${ico('camera', 17)} Capture screenshot ${ico('arrow', 15)}</button></div>`;
      if (workspace === 'Vehicles') body += `<div class="ws-detail-section"><button data-action="geo" class="ws-detail-action">${ico('earth', 17)} Open South Africa from Examples ${ico('arrow', 15)}</button></div>`;
    }
    details.innerHTML = `<div class="ws-panel-heading"><span>${workspace.toUpperCase()}</span><button data-action="close" aria-label="Close inspector">${ico('close', 16)}</button></div><div class="ws-detail-intro"><b>${workspace}</b><p>${desc}</p></div>${body}`; updateMetrics();
  }
  on(details, 'click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.entity) { selectedEntity = b.dataset.entity; renderDetails(); }
    if (b.dataset.inspect === 'apply') {
      const pos = [...details.querySelectorAll('[data-position]')].map(f => f.value.trim() === '' ? NaN : Number(f.value));
      if (pos.length !== 3 || !pos.every(Number.isFinite)) { ui.toast('Enter three valid position values'); return; }
      const r = a.core.exec({ cmd: 'entity.set', id: selectedEntity, position: pos }); ui.toast(r.ok ? 'Position updated' : r.msg); ui.updHist();
    }
    if (b.dataset.inspect) renderDetails();
    if (b.dataset.go) setWorkspace(b.dataset.go);
    switch (b.dataset.action) {
      case 'close': root.classList.add('ws-tools-closed'); break;
      case 'console': ui.toggleConsole(); break;
      case 'snap': a.snap(); break;
      case 'describe': ui.toggleConsole(true); ui.log(JSON.stringify(a.core.exec({ cmd: 'describe' }), null, 2), 'ok'); break;
      case 'geo': ui.showStart(a.core.hasSave()); tab = 'Examples'; selected = 'world'; renderLauncher(); break;
    }
  });
  on(details, 'keydown', e => { if (e.target.matches('input')) e.stopPropagation(); });

  // ---- live status (real telemetry only; unavailable values show a dash) ----
  function updateMetrics() {
    let t = {}; try { t = n0.telemetry() || {}; } catch (e) { /* telemetry not ready */ }
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    set('ws-fps', t.fps == null ? 'FPS —' : `${Math.round(t.fps)} FPS`); set('ws-phys', `PHYSICS ${String(t.physics || '—').toUpperCase()}`); set('ws-scene', a.name || 'Core'); set('ws-runtime', a.geo?.loading ? 'LOADING WORLD' : a.geo?.active ? 'GEO WORLD' : 'CORE RUNTIME');
    const m = document.getElementById('ws-metrics');
    if (m) m.innerHTML = [['Frame rate', t.fps], ['Frame time', t.frameMs == null ? null : t.frameMs + ' ms'], ['Draw calls', t.calls], ['Triangles', t.triangles], ['Physics bodies', t.bodies], ['Entities', t.entities], ['Loaded assets', t.assets], ['Heap', t.heapMB == null ? null : t.heapMB + ' MB']].map(([k, v]) => `<div><span>${k}</span><b>${v == null ? '—' : esc(v)}</b></div>`).join('');
    const b = busy(); if (b !== wasBusy) { wasBusy = b; if (ui.startOpen) renderLauncher(); }
  }
  // keep the hierarchy honest after undo, redo, placement and imports (not while the user is typing in it)
  const onCore = () => { if (workspace === 'Scene' && !details.contains(document.activeElement)) renderDetails(); };
  a.core.on(onCore);
  syncWorkspace(); renderDetails(); updateMetrics();
  const timer = setInterval(updateMetrics, 750);

  function dispose() {
    clearInterval(timer); a.core.listeners.delete(onCore); ac.abort(); if (dlgDone) dlgDone(false);
    patches.reverse().forEach(f => f()); added.forEach(n => n.remove()); brandKids.forEach(n => n.remove()); dockHead?.remove(); brand.classList.remove('ws-brand', 'ws-brand');
    const m = mode.querySelector('[data-m=explore]'); if (m) m.textContent = modeText[0] || 'Explore'; const e2 = mode.querySelector('[data-m=edit]'); if (e2) e2.textContent = modeText[1] || 'Edit';
    sc.classList.remove('ws-launch'); sc.querySelectorAll('[hidden]').forEach(n => n.removeAttribute('hidden'));
    delete root.dataset.workspace; delete root.dataset.launcher; delete n0.workspace;
  }
  return (n0.workspace = { dispose, selectWorkspace: setWorkspace, openLauncher: () => ui.showStart(a.core.hasSave()), get workspace() { return workspace; }, get dirty() { return dirty(); }, markClean: () => { clean = sig(); }, launch: go, importFile });
}
