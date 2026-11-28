// Tune panel (+ optional flat test arena). Sliders write straight into TUNE / ATTACKS, which the sim reads live.
import * as THREE from 'three';
import { TUNE, DEFAULTS, SCHEMA } from './tune.js';
import { ATTACKS } from './actor.js';

const KEY = 'n0ise.tune.v1', AK = ['dmg', 'kb', 'stun', 'reach', 'lunge', 'hs', 'trauma'];
const ATK_SCHEMA = { dmg: [1, 40, 0.5], kb: [0, 14, 0.1], stun: [0.1, 1.2, 0.01], reach: [0.8, 2.6, 0.05], lunge: [0, 8, 0.1], hs: [0, 0.3, 0.005], trauma: [0, 1, 0.01] };
const ADEF = JSON.parse(JSON.stringify(ATTACKS, (k, v) => v));
const fmt = v => (Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3)).replace(/\.?0+$/, '') || '0';

export function initLab(app, { arena }) {
  const root = document.getElementById('ui'), P = document.createElement('div'); P.className = 'tune glass'; P.hidden = true;
  const sets = [];
  const row = (label, get, set, [min, max, step]) => {
    const r = document.createElement('label'); r.className = 'tr2'; r.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const i = r.querySelector('input'), o = r.querySelector('output'), sync = () => { i.value = get(); o.textContent = fmt(+get()); }; sync();
    i.addEventListener('input', () => { set(+i.value); o.textContent = fmt(+i.value); save(); });
    i.addEventListener('pointerup', () => i.blur()); i.addEventListener('change', () => i.blur()); sets.push(sync); return r;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ T: TUNE, A: Object.fromEntries(Object.entries(ATTACKS).map(([k, a]) => [k, Object.fromEntries(AK.map(f => [f, a[f]]))])) })); } catch { } };
  const apply = o => { if (!o) return; Object.assign(TUNE, o.T || {}); for (const [k, v] of Object.entries(o.A || {})) if (ATTACKS[k]) Object.assign(ATTACKS[k], v); sets.forEach(f => f()); };
  const btn = (t, fn, cls = '') => { const b = document.createElement('button'); b.className = 'tb ' + cls; b.textContent = t; b.addEventListener('click', e => { fn(b); b.blur(); }); return b; };
  const sec = (title, open = true) => { const d = document.createElement('details'); d.open = open; d.innerHTML = `<summary>${title}</summary>`; P.appendChild(d); return d; };

  P.insertAdjacentHTML('afterbegin', '<div class="th"><b>Tune</b><span id="tstat"></span></div>');
  for (const [title, rows] of Object.entries(SCHEMA)) { const d = sec(title, title === 'Locomotion'); for (const [k, l, min, max, st] of rows) d.appendChild(row(l, () => TUNE[k], v => (TUNE[k] = v), [min, max, st])); }

  // per-attack editor
  const ad = sec('Attacks', false), sel = document.createElement('select'); sel.className = 'tsel'; sel.innerHTML = Object.keys(ATTACKS).map(k => `<option>${k}</option>`).join(''); ad.appendChild(sel);
  const abox = document.createElement('div'); ad.appendChild(abox);
  const drawA = () => { abox.innerHTML = ''; const a = ATTACKS[sel.value]; for (const f of AK) abox.appendChild(row(f, () => a[f], v => (a[f] = v), ATK_SCHEMA[f])); }; sel.addEventListener('change', () => { drawA(); sel.blur(); }); drawA();

  // test tools
  const td = sec('Test tools'), g = document.createElement('div'); g.className = 'tgrid'; td.appendChild(g);
  const front = d => { const p = app.player, y = p.yaw; return [p.pos.x + Math.sin(y) * d, p.pos.z + Math.cos(y) * d]; };
  const tog = (label, key, inv) => { const b = btn(label, () => { TUNE[key] = TUNE[key] ? 0 : 1; paint(); }); const paint = () => b.classList.toggle('on', !!TUNE[key]); sets.push(paint); paint(); return b; };
  g.append(
    btn('+ Brawler', () => { const [x, z] = front(4); app.combat.add('brawler', x, z, app.player.yaw + Math.PI); }),
    btn('+ Heavy', () => { const [x, z] = front(5); app.combat.add('heavy', x, z, app.player.yaw + Math.PI); }),
    btn('+ Dummy', () => { const [x, z] = front(3.5); app.combat.add('dummy', x, z, app.player.yaw + Math.PI); }),
    btn('Clear fighters', () => app.combat.clearEnemies()),
    btn('+ Crate', () => { const [x, z] = front(3); app.boulders.add(x, app.terrain.hAt(x, z) + 1.5, z, 0.5, undefined, 'crate'); }),
    btn('+ Barrel', () => { const [x, z] = front(3); app.boulders.add(x, app.terrain.hAt(x, z) + 1.5, z, 0.45, undefined, 'barrel'); }),
    btn('+ Boulder', () => { const [x, z] = front(4); app.boulders.add(x, app.terrain.hAt(x, z) + 2, z, 1.1, undefined, 'boulder'); }),
    btn('Heal all', () => app.combat.actors.forEach(a => { if (a.alive) a.hp = a.maxHp; })),
    btn('Reset player', () => { const p = app.player; p.respawn ? p.respawn(app.spawn[0], app.spawn[1], app.spawn[2]) : 0; app.cam.snap(); }),
    tog('Enemy AI', 'ai'), tog('God mode', 'god'));
  const reach = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.7, depthTest: false })); reach.visible = false; reach.renderOrder = 9; app.scene.add(reach);
  let showReach = false; g.append(btn('Show reach', b => { showReach = !showReach; b.classList.toggle('on', showReach); }));

  // presets
  const pd = sec('Presets'), pg = document.createElement('div'); pg.className = 'tgrid'; pd.appendChild(pg);
  pg.append(
    btn('Reset all', () => { Object.assign(TUNE, DEFAULTS); for (const [k, v] of Object.entries(ADEF)) Object.assign(ATTACKS[k], Object.fromEntries(AK.map(f => [f, v[f]]))); sets.forEach(f => f()); save(); }),
    btn('Copy JSON', b => { const j = localStorage.getItem(KEY) || '{}'; (navigator.clipboard ? navigator.clipboard.writeText(j) : Promise.reject()).then(() => app.ui.toast('Copied tune JSON'), () => prompt('Tune JSON', j)); }),
    btn('Paste JSON', () => { const t = prompt('Paste tune JSON'); if (t) try { apply(JSON.parse(t)); save(); app.ui.toast('Tune applied'); } catch { app.ui.toast('Invalid JSON'); } }),
    btn('Download', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([localStorage.getItem(KEY) || JSON.stringify({ T: TUNE })], { type: 'application/json' })); a.download = 'n0ise-tune.json'; a.click(); }));
  P.insertAdjacentHTML('beforeend', '<div class="tnote">Auto-saved in this browser. “Copy JSON” gives the exact values to hand to the agent as the new defaults in <code>tune.js</code> / <code>ATTACKS</code>.</div>');

  root.appendChild(P);
  const tb = document.createElement('button'); tb.className = 'ib tunebtn glass'; tb.textContent = 'Tune'; tb.title = 'Tune panel (T)'; root.appendChild(tb);
  const toggle = () => { P.hidden = !P.hidden; tb.classList.toggle('on', !P.hidden); }; tb.addEventListener('click', () => { toggle(); tb.blur(); });
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !app.ui.modalOpen() && !(app.geo && app.geo.active) && !e.repeat && !e.ctrlKey && !e.metaKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) toggle(); });
  try { apply(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { }
  if (arena) P.hidden = false, tb.classList.add('on');

  const st = P.querySelector('#tstat');
  const show = on => { P.hidden = !on; tb.classList.toggle('on', on); }; let fps = 60, ft = performance.now(), n = 0;
  return { // called every frame
    show,
    update(alpha) {
      n++; const now = performance.now(); if (now - ft > 400) { fps = n / ((now - ft) / 1000); n = 0; ft = now; if (!P.hidden) { const p = app.player; st.textContent = `${fps.toFixed(0)} fps · ${p.speed.toFixed(1)} m/s · ${p.state}${p.onGround ? '' : ' · air'}`; } }
      reach.visible = showReach; if (showReach) { const p = app.player, d = ATTACKS[p.atkName || 'jab'] || ATTACKS.jab; reach.scale.setScalar(d.reach * p.scale + 0.35); reach.position.set(p.rpos.x, p.rpos.y + 0.05, p.rpos.z); }
    },
  };
}

// A flat 220 m grid arena for tuning. Returns a function that puts the scene back (water, grass and palms visible again, grid removed).
export function flatArena(app) {
  const t = app.terrain; t.h.fill(2.2); t.paint.fill(0); t.dirtyH = t.dirtyP = true; t.rev++; t.flush();
  const grid = new THREE.GridHelper(220, 220, 0xb9c2cf, 0x59616d); grid.position.y = 2.22; grid.material.transparent = true; grid.material.opacity = 0.45; grid.material.depthWrite = false; app.scene.add(grid);
  const ax = new THREE.GridHelper(220, 22, 0xffc78a, 0xffc78a); ax.position.y = 2.225; ax.material.transparent = true; ax.material.opacity = 0.25; ax.material.depthWrite = false; app.scene.add(ax);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(124, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x34393f, roughness: 1, metalness: 0 })); fl.position.y = 2.212; fl.receiveShadow = true; app.scene.add(fl);
  const was = [app.water.mesh.visible, app.grass.mesh.visible, app.palms.mesh.visible]; app.water.mesh.visible = false; app.grass.mesh.visible = false; app.palms.mesh.visible = false;
  return () => { for (const o of [grid, ax, fl]) { app.scene.remove(o); o.geometry.dispose(); o.material.dispose(); } [app.water.mesh.visible, app.grass.mesh.visible, app.palms.mesh.visible] = was; };
}
