// Photo walk for Core: an overlay on Core's own renderer. Pick a lens and a frame, walk the coast, press the shutter.
// A shot counts for a subject on the list when that subject is inside the frame, near enough and not behind a hill. The roll keeps the last 12 shots on this device only.
import * as THREE from 'three';

const LENSES = [['24', 24], ['35', 35], ['50', 50], ['85', 85]];
const FRAMES = [['3:2', 3 / 2], ['4:5', 4 / 5], ['1:1', 1], ['16:9', 16 / 9]];
const ROLL = 'n0.core.roll';
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

export function createPhotoWalk(app) {
  let root = null, on = false, lens = 35, frame = 3 / 2, saved = null, timer = null, done = new Set(), roll = [];
  try { roll = JSON.parse(localStorage.getItem(ROLL) || '[]'); } catch (e) { roll = []; }

  // what can be photographed: real things in the scene, found when the walk starts
  const subjects = () => {
    const s = [], pr = app.props;
    if (pr && pr.pier) s.push({ id: 'pier', label: 'The pier', pts: () => [[(pr.pier.x0 + pr.pier.x1) / 2, pr.pier.y, pr.pier.z], [pr.pier.x1 + 2, pr.pier.y, pr.pier.z]], far: 70 });
    if (pr && pr.shack) s.push({ id: 'shack', label: 'The beach shack', pts: () => [[pr.shack.x, pr.shack.y + 1.2, pr.shack.z]], far: 60 });
    if (app.palms.items.length) s.push({ id: 'palm', label: 'A palm tree', pts: () => app.palms.items.map(p => [p.x, app.terrain.hAt(p.x, p.z) + 3, p.z]), far: 40 });
    if (app.boulders.items.length) s.push({ id: 'boulder', label: 'A boulder', pts: () => app.boulders.items.map(b => [b.p.x, b.p.y, b.p.z]), far: 30 });
    s.push({ id: 'sea', label: 'The sea', pts: () => { const p = app.player.pos, out = []; for (let a = 0; a < 16; a++) { const r = 18 + a * 4, th = a * 0.9; const x = p.x + Math.cos(th) * r, z = p.z + Math.sin(th) * r; if (app.terrain.hAt(x, z) < 0) out.push([x, 0.1, z]); } return out; }, far: 90 });
    return s;
  };
  let list = [];

  const proj = new THREE.Vector3();
  function inFrame(pt, fr) { proj.set(pt[0], pt[1], pt[2]).project(app.camera); return proj.z < 1 && proj.x > fr.x0 && proj.x < fr.x1 && proj.y > fr.y0 && proj.y < fr.y1; }
  const rect = () => { // the frame in normalised device coordinates: it fits inside 90% of the screen at the chosen ratio
    const W = innerWidth, H = innerHeight, a = W / H, wpx = frame > a ? W * .9 : H * .9 * frame, hpx = frame > a ? W * .9 / frame : H * .9, w = wpx / W, h = hpx / H;
    return { x0: -w, x1: w, y0: -h, y1: h, w, h };
  };
  function occluded(pt) { const c = app.camera.position, d = Math.hypot(pt[0] - c.x, pt[2] - c.z); for (let t = .1; t < .95; t += .1) { const x = c.x + (pt[0] - c.x) * t, z = c.z + (pt[2] - c.z) * t, y = c.y + (pt[1] - c.y) * t; if (app.terrain.hAt(x, z) > y + .3) return true; } return d < .5; }

  function layout() {
    const r = rect(), W = innerWidth, H = innerHeight, f = root.querySelector('.pw-frame');
    f.style.left = ((1 + r.x0) / 2 * W) + 'px'; f.style.top = ((1 - r.y1) / 2 * H) + 'px'; f.style.width = ((r.x1 - r.x0) / 2 * W) + 'px'; f.style.height = ((r.y1 - r.y0) / 2 * H) + 'px';
  }
  function setLens(mm) { lens = mm; const vf = 2 * Math.atan(12 / mm) * 180 / Math.PI; app.camera.fov = vf; app.camera.updateProjectionMatrix(); root.querySelectorAll('[data-l]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.l === mm))); }
  function setFrame(a) { frame = a; layout(); root.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.f - a) < 1e-6))); }
  function paintList() {
    const ul = root.querySelector('.pw-list'); ul.innerHTML = '';
    list.forEach(s => { const li = el('li', done.has(s.id) ? 'ok' : '', '<i></i>' + s.label); ul.appendChild(li); });
    root.querySelector('.pw-count').textContent = done.size + ' of ' + list.length;
  }
  function shutter() {
    const r = rect(), cv = app.renderer.domElement, fw = r.w * 2 * cv.width / 2, fh = r.h * 2 * cv.height / 2; // frame size in drawing-buffer pixels
    app.renderer.render(app.scene, app.camera);
    const sx = (cv.width - fw * 1) / 2, sy = (cv.height - fh * 1) / 2, out = document.createElement('canvas'), k = Math.min(1, 1280 / fw);
    out.width = Math.round(fw * k); out.height = Math.round(fh * k); out.getContext('2d').drawImage(cv, Math.max(0, sx), Math.max(0, sy), Math.min(cv.width, fw), Math.min(cv.height, fh), 0, 0, out.width, out.height);
    const url = out.toDataURL('image/jpeg', .86), hit = [];
    for (const s of list) { if (done.has(s.id)) continue; const pts = s.pts(), c = app.camera.position; if (pts.some(p => Math.hypot(p[0] - c.x, p[2] - c.z) < s.far && inFrame(p, r) && !occluded(p))) { done.add(s.id); hit.push(s.label); } }
    roll.unshift({ t: Date.now(), lens, ratio: +frame.toFixed(3), img: url, hit }); roll = roll.slice(0, 12); try { localStorage.setItem(ROLL, JSON.stringify(roll)); } catch (e) { roll = roll.slice(0, 4); try { localStorage.setItem(ROLL, JSON.stringify(roll)); } catch (e2) { /* storage full */ } }
    const flash = root.querySelector('.pw-flash'); flash.classList.add('on'); setTimeout(() => flash.classList.remove('on'), 120);
    app.ui.say(hit.length ? 'Got ' + hit.join(' and ') + '.' : 'Saved. Nothing on the list in this frame.', 3200); paintList(); if (done.size === list.length) app.ui.say('Shot list complete. Open the roll to save your pictures.', 7000);
  }
  function openRoll() {
    const m = el('div', 'pw-roll', '<div class="pw-rhead"><b>Roll</b><button class="pw-b" data-x>Close</button></div><div class="pw-grid"></div>'), g = m.querySelector('.pw-grid');
    if (!roll.length) g.innerHTML = '<p>No pictures yet. Press the shutter.</p>';
    roll.forEach((s, i) => { const c = el('figure', '', ''); const im = el('img'); im.src = s.img; im.alt = 'Photo ' + (roll.length - i); const a = el('a', 'pw-b', 'Save'); a.href = s.img; a.download = 'photo-walk-' + new Date(s.t).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.jpg'; c.append(im, el('figcaption', '', s.lens + ' mm · ' + (s.hit.length ? s.hit.join(', ') : 'no subject')), a); g.appendChild(c); });
    m.querySelector('[data-x]').addEventListener('click', () => m.remove()); root.appendChild(m);
  }
  const key = e => { if (!on || e.repeat || (e.target && /input|textarea/i.test(e.target.tagName))) return; if (e.key === 'p' || e.key === 'P' || e.key === 'Enter') { e.preventDefault(); shutter(); } };

  function start() {
    if (on) stop();
    on = true; done = new Set(); list = subjects(); saved = { fov: app.camera.fov };
    root = el('div', 'pw', `<style>
.pw{position:fixed;inset:0;z-index:30;pointer-events:none;font:600 12px/1.2 ui-monospace,Menlo,monospace;color:#fff}
.pw-frame{position:absolute;box-shadow:0 0 0 100vmax rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.7);border-radius:2px;pointer-events:none}
.pw-frame:after{content:"";position:absolute;inset:0;background:linear-gradient(#fff3,#fff3) 33.3% 0/1px 100% no-repeat,linear-gradient(#fff3,#fff3) 66.6% 0/1px 100% no-repeat,linear-gradient(#fff3,#fff3) 0 33.3%/100% 1px no-repeat,linear-gradient(#fff3,#fff3) 0 66.6%/100% 1px no-repeat}
.pw-bar{position:absolute;left:0;right:0;top:max(62px,calc(env(safe-area-inset-top) + 56px));display:flex;gap:6px;justify-content:center;flex-wrap:wrap;pointer-events:auto}
.pw-b{min-height:44px;min-width:44px;padding:0 14px;border-radius:22px;border:1px solid rgba(255,255,255,.35);background:rgba(20,20,22,.62);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;font:inherit;display:inline-grid;place-items:center;text-decoration:none;cursor:pointer}
.pw-b[aria-pressed=true]{background:#fff;color:#111}
.pw-shut{position:absolute;left:50%;bottom:max(22px,env(safe-area-inset-bottom));transform:translateX(-50%);width:72px;height:72px;border-radius:50%;border:4px solid #fff;background:rgba(255,255,255,.2);pointer-events:auto;cursor:pointer}
.pw-shut:active{background:#fff}
.pw-side{position:absolute;right:12px;bottom:max(24px,env(safe-area-inset-bottom));display:grid;gap:6px;pointer-events:auto}
.pw-goals{position:absolute;left:12px;bottom:max(24px,env(safe-area-inset-bottom));padding:10px 12px;border-radius:16px;background:rgba(20,20,22,.62);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.25);min-width:140px;pointer-events:none}
.pw-goals b{display:block;margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase;font-size:10px;opacity:.8}
.pw-list{list-style:none;margin:0;padding:0;display:grid;gap:5px}.pw-list li{display:flex;gap:8px;align-items:center}.pw-list i{width:10px;height:10px;border-radius:50%;border:1.5px solid #fff}.pw-list li.ok{opacity:.6;text-decoration:line-through}.pw-list li.ok i{background:#fff}
.pw-flash{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .12s}.pw-flash.on{opacity:.85;transition:none}
.pw-roll{position:absolute;inset:0;background:rgba(10,10,12,.92);overflow:auto;padding:max(14px,env(safe-area-inset-top)) 14px 20px;pointer-events:auto}
.pw-rhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.pw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
.pw-grid figure{margin:0;display:grid;gap:6px}.pw-grid img{width:100%;border-radius:10px;display:block}.pw-grid figcaption{opacity:.75;font-size:11px}
@media (prefers-reduced-motion:reduce){.pw-flash{transition:none}}
</style><div class="pw-frame"></div><div class="pw-flash"></div>
<div class="pw-bar" role="toolbar" aria-label="Camera"></div>
<div class="pw-goals"><b>Shot list <span class="pw-count"></span></b><ul class="pw-list"></ul></div>
<div class="pw-side"><button class="pw-b" data-roll>Roll</button><button class="pw-b" data-end>Done</button></div>
<button class="pw-shut" aria-label="Take a photo" title="Take a photo (P)"></button>`);
    const bar = root.querySelector('.pw-bar');
    LENSES.forEach(([n, mm]) => { const b = el('button', 'pw-b', n + ' mm'); b.dataset.l = mm; b.type = 'button'; b.addEventListener('click', () => setLens(mm)); bar.appendChild(b); });
    FRAMES.forEach(([n, a]) => { const b = el('button', 'pw-b', n); b.dataset.f = a; b.type = 'button'; b.addEventListener('click', () => setFrame(a)); bar.appendChild(b); });
    root.querySelector('.pw-shut').addEventListener('click', shutter); root.querySelector('[data-roll]').addEventListener('click', openRoll); root.querySelector('[data-end]').addEventListener('click', stop);
    document.body.appendChild(root); addEventListener('keydown', key); addEventListener('resize', layout);
    setLens(35); setFrame(3 / 2); paintList(); timer = setInterval(() => { if (on && Math.abs(app.camera.fov - 2 * Math.atan(12 / lens) * 180 / Math.PI) > .05) { app.camera.fov = 2 * Math.atan(12 / lens) * 180 / Math.PI; app.camera.updateProjectionMatrix(); } }, 200);
    app.ui.say('Photo walk. WASD to walk, drag to look, P or the white button to shoot.', 7000);
  }
  function stop() {
    if (!on) return; on = false; clearInterval(timer); removeEventListener('keydown', key); removeEventListener('resize', layout);
    if (root) { root.remove(); root = null; } if (saved) { app.camera.fov = saved.fov; app.camera.updateProjectionMatrix(); saved = null; }
  }
  return { start, stop, get on() { return on; }, roll: () => roll };
}
