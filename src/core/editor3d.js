// Core editor: place things, build rooms, move them with a gizmo, and see everything in an outliner with details. Unreal-style where that helps:
// a content palette you drag from, a transform gizmo with grid snap, an outliner, a details panel, duplicate, delete and focus.
// It owns no scene state. Everything it does is an ordinary Core command (entity.create, entity.set, entity.remove), so it is validated, saved and undone like any other change.
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { MATERIALS } from './buildkit.js';
import { LEVEL_ITEMS, CATS } from './levelkit.js';
import { sampleLevel } from './level.js';

const KIT = [
  { id: 'wall', name: 'Wall', prefab: 'build.wall', params: { length: 4, height: 2.8, opening: 'none' } },
  { id: 'door', name: 'Wall with door', prefab: 'build.wall', params: { length: 4, height: 2.8, opening: 'door' } },
  { id: 'window', name: 'Wall with window', prefab: 'build.wall', params: { length: 4, height: 2.8, opening: 'window' } },
  { id: 'gate', name: 'Wide opening', prefab: 'build.wall', params: { length: 5, height: 3, opening: 'gate' } },
  { id: 'floor', name: 'Floor', prefab: 'build.floor', params: { width: 6, depth: 6 } },
  { id: 'gable', name: 'Gable roof', prefab: 'build.roof', params: { width: 8, depth: 6, style: 'gable' } },
  { id: 'flat', name: 'Flat roof', prefab: 'build.roof', params: { width: 8, depth: 6, style: 'flat' } },
  { id: 'stairs', name: 'Stairs', prefab: 'build.stairs', params: { width: 1.4, length: 3, height: 2.8, steps: 14 } },
];
const TOOLS = [['select', 'Select', 'V'], ['wall', 'Wall', ''], ['floor', 'Floor', ''], ['room', 'Room', '']];
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const r3 = v => Math.round(v * 1000) / 1000;

export function createEditor(app) {
  const { renderer, scene, camera } = app, E = app.entities, core = app.core;
  const S = { tool: 'select', xf: 'translate', grid: 1, sel: [], pending: null, yaw: 0, tab: 'assets', cat: '', q: '', wall: { height: 2.8, thickness: 0.2, material: 'plaster', opening: 'none', color: null }, roof: true, level: 0, online: null, onlineErr: '' }; if (app.level) S.tab = 'level';
  const ed = { S, dragging: null };
  const snap = v => S.grid > 0 ? Math.round(v / S.grid) * S.grid : v;
  const canvas = renderer.domElement;
  const active = () => app.mode === 'edit' && (app.ui.curGroupId() === 'build' || app.ui.curGroupId() === 'scene');
  ed.active = active;

  // ---- gizmo + selection outline ----
  const gizmo = new TransformControls(camera, canvas); gizmo.setSize(0.85); const gh = gizmo.getHelper(); gh.renderOrder = 60; scene.add(gh); gizmo.enabled = false; gh.visible = false;
  const outline = new THREE.Group(); outline.renderOrder = 59; scene.add(outline); const boxes = [];
  const objOf = id => { const rt = E.rt.get(id); return rt && rt.object; };
  function refreshGizmo() {
    const one = S.sel.length === 1 && S.tool === 'select' && active() ? objOf(S.sel[0]) : null;
    if (one) { gizmo.attach(one); gizmo.setMode(S.xf); gizmo.setTranslationSnap(S.grid || null); gizmo.setRotationSnap(S.grid ? Math.PI / 12 : null); gizmo.setScaleSnap(S.grid ? 0.1 : null); gizmo.enabled = true; gh.visible = true; }
    else { gizmo.detach(); gizmo.enabled = false; gh.visible = false; }
  }
  function updateOutline() {
    const want = active() ? S.sel.filter(id => objOf(id)) : [];
    while (boxes.length > want.length) { const b = boxes.pop(); outline.remove(b); b.geometry.dispose(); }
    while (boxes.length < want.length) { const b = new THREE.Box3Helper(new THREE.Box3(), 0x7cc8ff); b.material.depthTest = false; b.material.transparent = true; b.renderOrder = 59; boxes.push(b); outline.add(b); }
    want.forEach((id, i) => { const o = objOf(id); o.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(o); if (!bb.isEmpty()) boxes[i].box.copy(bb); });
    outline.visible = want.length > 0;
  }
  let before = null;
  gizmo.addEventListener('dragging-changed', e => {
    app.input.gizmoDown = e.value; ed.dragging = e.value ? 'gizmo' : null;
    const id = S.sel[0]; if (!id) return;
    if (e.value) { before = true; return; }
    if (before) { before = null; commitTransform(id); }
  });
  function commitTransform(id) {
    const o = objOf(id); if (!o) return; const rec = E.get(id), eu = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ');
    const pos = o.position.toArray().map(r3), rot = [eu.x, eu.y, eu.z].map(r3), scl = o.scale.toArray().map(v => Math.max(0.01, r3(v)));
    const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4);
    if (same(pos, rec.transform.position) && same(rot, rec.transform.rotation) && same(scl, rec.transform.scale)) return;
    const r = core.exec({ cmd: 'entity.set', id, position: pos, rotation: rot, scale: scl }); if (!r.ok) { app.ui.toast(r.msg); E.apply(rec, o); }
    app.ui.updHist(); app.ui.refreshPanel && app.ui.refreshPanel();
  }

  // ---- picking ----
  const rc = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function ray(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); rc.setFromCamera(ndc, camera); return rc; }
  function entityOf(o) { while (o) { if (o.userData && o.userData.entityId) return o.userData.entityId; o = o.parent; } return null; }
  function pick(e) {
    const r = ray(e), hits = r.intersectObject(E.group, true).filter(h => { let o = h.object, ok = true; while (o) { if (o.visible === false) ok = false; o = o.parent; } return ok; });
    const t = app.terrain.ray(r.ray.origin, r.ray.direction), eh = hits[0];
    const dT = t ? t.distanceTo(r.ray.origin) : Infinity;
    if (eh && eh.distance < dT) { const n = eh.face ? eh.face.normal.clone().transformDirection(eh.object.matrixWorld) : new THREE.Vector3(0, 1, 0); return { p: eh.point.clone(), n, id: entityOf(eh.object), onEntity: true }; }
    return t ? { p: t.clone(), n: new THREE.Vector3(0, 1, 0), id: null } : null;
  }
  ed.pick = pick;
  const gp = h => new THREE.Vector3(snap(h.p.x), h.n.y > 0.5 ? h.p.y : h.p.y, snap(h.p.z));

  // ---- the ghost shown while placing ----
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7cc8ff, transparent: true, opacity: 0.42, depthWrite: false });
  let ghost = null, ghostKey = '';
  function clearGhost() { if (ghost) { scene.remove(ghost); ghost = null; ghostKey = ''; } }
  async function itemObject(it) {
    if (it.asset) { await app.assets.ensure(it.asset); return app.assets.instantiate(it.asset); }
    const def = E.prefabs.get(it.prefab), params = def.validate({ ...it.params }, E.ctx()); const rec = { parameters: params, components: {}, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    return def.build(rec, E.ctx()).object;
  }
  async function showGhost(it) {
    const key = it.key; if (ghostKey === key && ghost) return; ghostKey = key; const o = await itemObject(it.item); if (ghostKey !== key) return;
    if (ghost) scene.remove(ghost); const g = new THREE.Group(); o.traverse(n => { if (n.isMesh) { n.material = ghostMat; n.castShadow = n.receiveShadow = false; } }); g.add(o); ghost = g; scene.add(g);
  }
  function moveGhost(e) {
    if (!S.pending || !active()) { if (ghost) ghost.visible = false; return; }
    const h = pick(e); if (!h) { if (ghost) ghost.visible = false; return; }
    showGhost({ key: S.pending.key, item: S.pending }).then(() => { if (ghost) { const p = gp(h); ghost.position.copy(p); ghost.rotation.y = S.yaw; ghost.visible = true; app.bump && app.bump(); } });
  }

  // ---- create / duplicate / delete (each a single undo step) ----
  function groupLast(n, label) { if (n > 1) core.group(n, label); app.ui.updHist(); }
  function make(spec) { const r = core.exec({ cmd: 'entity.create', ...spec }); if (!r.ok) app.ui.toast(r.msg); return r; }
  async function placeItem(it, at, yaw = S.yaw) {
    if (it.asset) await app.assets.ensure(it.asset);
    const spec = it.asset ? { prefab: 'asset', parameters: { assetId: it.asset } } : { prefab: it.prefab, parameters: { ...it.params, ...(it.prefab === 'build.wall' ? { height: S.wall.height, material: S.wall.material } : {}) } };
    if (it.prefab === 'model.online') spec.parameters = { id: it.online, scale: 1 };
    const r = make({ ...spec, position: [r3(at.x), r3(at.y), r3(at.z)], rotation: [0, yaw, 0], tags: ['placed'] });
    if (r.ok) { select([r.entity.id]); app.ui.updHist(); } return r;
  }
  ed.place = placeItem;
  function wallParams(len) { return { length: r3(len), height: S.wall.height, thickness: S.wall.thickness, material: S.wall.material, opening: S.wall.opening, ...(S.wall.color ? { color: S.wall.color } : {}) }; }
  function createWall(a, b, extra = {}) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); if (L < 0.3) return null;
    return make({ prefab: 'build.wall', parameters: { ...wallParams(L), ...extra }, position: [r3((a.x + b.x) / 2), r3(a.y), r3((a.z + b.z) / 2)], rotation: [0, r3(-Math.atan2(dz, dx)), 0], tags: ['build'] });
  }
  function createFloor(a, b) {
    const W = Math.abs(b.x - a.x), D = Math.abs(b.z - a.z); if (W < 0.5 || D < 0.5) return null;
    return make({ prefab: 'build.floor', parameters: { width: r3(W), depth: r3(D), material: 'wood' }, position: [r3((a.x + b.x) / 2), r3(a.y), r3((a.z + b.z) / 2)], tags: ['build'] });
  }
  function createRoom(a, b, o = {}) {
    const W = Math.abs(b.x - a.x), D = Math.abs(b.z - a.z); if (W < 2 || D < 2) { app.ui.toast('Drag a bigger area for a room (at least 2 m each way).'); return null; }
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, y = a.y, H = o.height || S.wall.height, T = S.wall.thickness, tag = 'room' + Date.now() % 100000, ids = [];
    const add = r => { if (r && r.ok) ids.push(r.entity.id); return r; };
    add(make({ prefab: 'build.floor', parameters: { width: r3(W), depth: r3(D), material: 'wood' }, position: [r3(cx), r3(y), r3(cz)], tags: ['build', tag] }));
    const wy = y + 0.2, op = len => len >= 3 ? 'window' : 'none';
    const wall = (x, z, len, rot, opening) => add(make({ prefab: 'build.wall', parameters: { length: r3(len), height: H, thickness: T, material: S.wall.material, opening, ...(S.wall.color ? { color: S.wall.color } : {}) }, position: [r3(x), r3(wy), r3(z)], rotation: [0, rot, 0], tags: ['build', tag] }));
    wall(cx, cz + D / 2 - T / 2, W, 0, 'door'); wall(cx, cz - D / 2 + T / 2, W, 0, op(W));
    wall(cx - W / 2 + T / 2, cz, D - 2 * T, Math.PI / 2, op(D)); wall(cx + W / 2 - T / 2, cz, D - 2 * T, Math.PI / 2, op(D));
    if (o.roof !== false && S.roof) add(make({ prefab: 'build.roof', parameters: { width: r3(W + 0.3), depth: r3(D + 0.3), rise: r3(Math.min(2.4, Math.min(W, D) * 0.3)), style: 'gable' }, position: [r3(cx), r3(wy + H), r3(cz)], tags: ['build', tag] }));
    groupLast(ids.length, 'Build room'); select(ids.slice(0, 1)); return ids;
  }
  ed.createWall = createWall; ed.createFloor = createFloor; ed.createRoom = createRoom;
  function duplicate() {
    const made = []; for (const id of S.sel.slice()) { const r = E.get(id); const c = make({ prefab: r.prefab, parameters: structuredClone(r.parameters), position: [r.transform.position[0] + (S.grid || 1), r.transform.position[1], r.transform.position[2] + (S.grid || 1)], rotation: r.transform.rotation.slice(), scale: r.transform.scale.slice(), components: structuredClone(r.components), tags: [...(r.tags || [])] }); if (c.ok) made.push(c.entity.id); }
    groupLast(made.length, 'Duplicate'); if (made.length) select(made); return made;
  }
  function remove() { const ids = S.sel.slice(); let n = 0; for (const id of ids) { if (!E.recs.has(id)) continue; const r = core.exec({ cmd: 'entity.remove', id }); if (r.ok) n++; } select([]); groupLast(n, 'Delete'); return n; }
  function focus() { const id = S.sel[0], o = id && objOf(id); if (!o) return; const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()); app.cam.target.copy(c); app.cam.dist = Math.max(4, b.getSize(new THREE.Vector3()).length() * 1.8); }
  ed.duplicate = duplicate; ed.remove = remove; ed.focus = focus;
  function select(ids, add = false) { S.sel = add ? [...new Set([...S.sel, ...ids])] : ids.filter(id => E.recs.has(id)); refreshGizmo(); updateOutline(); app.ui.refreshPanel && app.ui.refreshPanel(); app.bump && app.bump(); }
  ed.select = select;
  function setTool(t) { S.tool = t; if (t !== 'select') select([]); refreshGizmo(); clearGhost(); if (t !== 'select') S.pending = null; app.ui.refreshPanel(); }
  ed.setTool = setTool;
  function setPending(it) { S.pending = it; if (it) { S.tool = 'select'; select([]); } else clearGhost(); app.ui.refreshPanel(); }
  ed.setPending = setPending;

  // ---- pointer ----
  let drag = null, prev = null;
  function preview(a, b) {
    if (!prev) { prev = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat); scene.add(prev); }
    prev.visible = true;
    if (S.tool === 'wall') { const dx = b.x - a.x, dz = b.z - a.z, L = Math.max(0.05, Math.hypot(dx, dz)); prev.scale.set(L, S.wall.height, S.wall.thickness); prev.position.set((a.x + b.x) / 2, a.y + S.wall.height / 2, (a.z + b.z) / 2); prev.rotation.set(0, -Math.atan2(dz, dx), 0); }
    else { const W = Math.max(0.05, Math.abs(b.x - a.x)), D = Math.max(0.05, Math.abs(b.z - a.z)), h = S.tool === 'room' ? S.wall.height : 0.2; prev.scale.set(W, h, D); prev.position.set((a.x + b.x) / 2, a.y + h / 2, (a.z + b.z) / 2); prev.rotation.set(0, 0, 0); }
  }
  const hidePrev = () => { if (prev) prev.visible = false; };
  ed.pointerDown = e => {
    if (!active() || e.button !== 0) return false;
    if (S.tool === 'select' && gizmo.enabled && gizmo.axis) return true;   // the gizmo owns this press
    const h = pick(e); if (!h) { if (S.tool === 'select' && !S.pending) select([]); return true; }
    if (S.pending) { placeItem(S.pending, gp(h)); return true; }
    if (S.tool === 'select') { if (h.id) select([h.id], e.shiftKey); else if (!e.shiftKey) select([]); return true; }
    drag = { a: gp(h) }; app.input.editorDrag = true; return true;
  };
  ed.pointerMove = e => { if (!drag) return; const h = pick(e); if (!h) return; const b = gp(h); b.y = drag.a.y; drag.b = b; preview(drag.a, b); };
  ed.pointerUp = () => {
    if (!drag) return; const { a, b } = drag; drag = null; hidePrev(); app.input.editorDrag = false; if (!b) return;
    if (S.tool === 'wall') { const r = createWall(a, b); if (r && r.ok) { select([r.entity.id]); app.ui.updHist(); } }
    else if (S.tool === 'floor') { const r = createFloor(a, b); if (r && r.ok) { select([r.entity.id]); app.ui.updHist(); } }
    else if (S.tool === 'room') createRoom(a, b, { roof: S.roof });
  };
  ed.cancel = () => { drag = null; hidePrev(); };
  ed.hover = e => { if (active() && S.pending && !drag) moveGhost(e); else if (ghost) ghost.visible = false; };
  // dragging an item out of the palette and dropping it on the scene
  let dnd = null;
  ed.beginDrag = (it, e) => { dnd = { it, x: e.clientX, y: e.clientY, live: false }; };
  addEventListener('pointermove', e => { if (!dnd) return; if (!dnd.live && Math.hypot(e.clientX - dnd.x, e.clientY - dnd.y) > 10) { dnd.live = true; S.pending = dnd.it; } if (dnd.live) { const top = document.elementFromPoint(e.clientX, e.clientY); if (top === canvas) moveGhost(e); else if (ghost) ghost.visible = false; } });
  addEventListener('pointerup', e => { if (!dnd) return; const d = dnd; dnd = null; if (!d.live) return; const top = document.elementFromPoint(e.clientX, e.clientY); if (top === canvas && active()) { const h = pick(e); if (h) placeItem(d.it, gp(h)); } clearGhost(); S.pending = null; app.ui.refreshPanel(); });
  addEventListener('keydown', e => {
    if (!active() || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey; let used = true;
    if (mod && k === 'd') duplicate();
    else if (mod) used = false;
    else if (k === 'delete' || k === 'backspace') remove();
    else if (k === 'g' && e.shiftKey) { S.grid = S.grid ? 0 : 1; refreshGizmo(); app.ui.refreshPanel(); }
    else if (k === '[' || k === ']') { if (S.pending) S.yaw += (k === ']' ? 1 : -1) * Math.PI / 4; else if (S.sel.length === 1) { const rr = E.get(S.sel[0]), ro = rr.transform.rotation.slice(); ro[1] += (k === ']' ? 1 : -1) * Math.PI / 4; core.exec({ cmd: 'entity.set', id: S.sel[0], rotation: ro }); app.ui.updHist(); refreshGizmo(); app.ui.refreshPanel(); } }
    else if (k === 'g') { S.xf = 'translate'; refreshGizmo(); app.ui.refreshPanel(); }
    else if (k === 'r') { if (S.pending) { S.yaw += Math.PI / 4; } else { S.xf = 'rotate'; refreshGizmo(); app.ui.refreshPanel(); } }
    else if (k === 't') { S.xf = 'scale'; refreshGizmo(); app.ui.refreshPanel(); }
    else if (k === 'v') setTool('select');
    else if (k === 'f' && S.sel.length) focus();
    else if (k === 'escape') { if (S.pending || drag) { S.pending = null; clearGhost(); ed.cancel(); app.ui.refreshPanel(); } else select([]); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ---- thumbnails: real renders of the asset or prefab, cached ----
  const TH = { cache: new Map(), q: [], busy: false, rt: null, scene: null, cam: null };
  function thumbScene() { if (TH.scene) return; TH.scene = new THREE.Scene(); TH.scene.add(new THREE.HemisphereLight(0xffffff, 0x666055, 1.8)); const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(3, 5, 4); TH.scene.add(d); TH.cam = new THREE.PerspectiveCamera(30, 1, 0.05, 500); TH.rt = new THREE.WebGLRenderTarget(112, 112, { samples: 4 }); }
  async function renderThumb(it) {
    thumbScene(); const o = await itemObject(it); const g = new THREE.Group(); g.add(o); g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()), R = Math.max(s.x, s.y, s.z) || 1;
    TH.scene.add(g); const d = R * 1.9 / Math.tan(THREE.MathUtils.degToRad(15)) * 0.5; TH.cam.position.set(c.x + d * 0.62, c.y + d * 0.42, c.z + d * 0.7); TH.cam.lookAt(c); TH.cam.updateMatrixWorld();
    const keep = renderer.getRenderTarget(); renderer.setRenderTarget(TH.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(TH.scene, TH.cam); renderer.setRenderTarget(keep); TH.scene.remove(g);
    const W = 112, buf = new Uint8Array(W * W * 4); renderer.readRenderTargetPixels(TH.rt, 0, 0, W, W, buf); const cv = document.createElement('canvas'); cv.width = cv.height = W; const x = cv.getContext('2d'), im = x.createImageData(W, W);
    for (let y = 0; y < W; y++) im.data.set(buf.subarray((W - 1 - y) * W * 4, (W - y) * W * 4), y * W * 4); for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) for (let k = 0; k < 3; k++) im.data[i + k] = Math.min(255, 255 * Math.pow(im.data[i + k] / 255, 1 / 2.2));
    x.putImageData(im, 0, 0); return cv.toDataURL('image/png');
  }
  ed._thumb = renderThumb;
  function thumb(it, img) {
    if (TH.cache.has(it.key)) { img.src = TH.cache.get(it.key); return; } TH.q.push({ it, img }); if (TH.busy) return; TH.busy = true;
    (async () => { while (TH.q.length) { const j = TH.q.shift(); if (TH.cache.has(j.it.key)) { if (j.img.isConnected) j.img.src = TH.cache.get(j.it.key); continue; } try { const u = await renderThumb(j.it); TH.cache.set(j.it.key, u); if (j.img.isConnected) j.img.src = u; else app.ui.refreshPanel(); } catch (e) { j.img.alt = '·'; } await new Promise(r => setTimeout(r, 0)); } TH.busy = false; })();
  }

  // ---- panels ----
  const css = el('style', '', `
.panel.bld{flex-direction:column;gap:8px;padding:4px;width:100%}
.bld>*{flex:none}.bld .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.bld .row>label{display:flex;gap:6px;align-items:center;color:var(--dim);font-size:12px}
.bld .tl button,.bld .chip{min-height:44px;min-width:44px;border-radius:14px;background:rgba(255,255,255,.06);padding:0 12px;color:var(--dim);font-size:13px}
.bld .tl button[aria-pressed=true],.bld .chip[aria-pressed=true]{background:var(--on);color:#161412}
.bld .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;padding:2px}
.bld .tile{width:100%;border-radius:14px;background:rgba(255,255,255,.06);padding:6px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;touch-action:none;cursor:grab;scroll-snap-align:start}
.bld .tile img{width:84px;height:84px;object-fit:contain;border-radius:10px;background:rgba(0,0,0,.18)}.bld .tile small{font-size:10.5px;line-height:1.15;color:var(--dim);max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bld .tile[aria-pressed=true]{outline:2px solid var(--on)}
.bld select,.bld input[type=number],.bld input[type=search],.bld input[type=text]{min-height:44px;border-radius:12px;border:1px solid var(--edge);background:rgba(255,255,255,.06);color:var(--ink);padding:0 10px;font:inherit;min-width:0}
.bld input[type=number]{width:74px}.bld input[type=color]{width:44px;height:44px;padding:0;border-radius:12px;border:1px solid var(--edge);background:none}
.bld .out{display:flex;flex-direction:column;gap:2px;max-height:150px;overflow:auto;flex:1 1 100%}.bld .out button{text-align:left;min-height:36px;border-radius:10px;padding:0 10px;color:var(--dim);font-size:12.5px}.bld .out button[aria-pressed=true]{background:rgba(255,255,255,.16);color:var(--ink)}
.bld .det{flex:1 1 280px;display:flex;flex-direction:column;gap:6px}.bld .hint2{color:var(--dim);font-size:12px}`); document.head.appendChild(css);
  const chip = (txt, on, fn, title) => { const b = el('button', 'chip', txt); b.type = 'button'; b.setAttribute('aria-pressed', String(!!on)); if (title) b.title = title; b.onclick = fn; return b; };
  const itemsAssets = () => app.assets.query({ limit: 200, query: S.q, ...(S.cat ? { category: S.cat } : {}) }).map(a => ({ key: 'a:' + a.id, asset: a.id, name: a.name, cat: a.category, license: a.license }));
  const itemsLevel = () => LEVEL_ITEMS.filter(i => !S.cat || i[2] === S.cat).filter(i => !S.q || i[1].toLowerCase().includes(S.q.toLowerCase())).map(([prefab, name, cat, params]) => ({ key: 'l:' + prefab, prefab, params, name, cat }));
  const itemsKit = () => KIT.map(k => ({ key: 'k:' + k.id, prefab: k.prefab, params: k.params, name: k.name }));
  async function loadOnline() { if (S.online || S.onlineBusy) return; S.onlineBusy = true; try { const m = await import('../phmodels.js'); const list = await m.modelList(); S.online = list; S.phThumb = m.thumb; S.onlineErr = ''; } catch (e) { S.onlineErr = 'Could not reach Poly Haven (' + e.message + '). Check your connection.'; } S.onlineBusy = false; app.ui.refreshPanel(); }
  const itemsOnline = () => { const q = S.q.toLowerCase(); return (S.online || []).filter(m => (!S.cat || m.cats.includes(S.cat)) && (!q || (m.name + ' ' + m.tags.join(' ')).toLowerCase().includes(q))).slice(0, 60).map(m => ({ key: 'o:' + m.id, prefab: 'model.online', online: m.id, name: m.name, params: {}, remote: m.id })); };
  function tile(it) {
    const b = el('button', 'tile'); b.type = 'button'; b.title = it.name + (it.license ? ' · ' + it.license : it.remote ? ' · CC0 · Poly Haven' : ''); b.setAttribute('aria-pressed', String(S.pending && S.pending.key === it.key));
    const im = el('img'); im.alt = ''; if (it.remote && S.phThumb) im.src = S.phThumb(it.remote, 160, 160); else thumb(it, im); b.append(im, el('small', '', it.name));
    b.addEventListener('pointerdown', e => { if (e.button === 0) ed.beginDrag(it, e); });
    b.onclick = () => setPending(S.pending && S.pending.key === it.key ? null : it);
    return b;
  }
  ed.panelBuild = p => {
    p.className = 'panel bld'; p.innerHTML = '';
    const tl = el('div', 'row tl'); TOOLS.forEach(([id, name]) => { const b = el('button', '', name); b.type = 'button'; b.setAttribute('aria-pressed', String(S.tool === id && !S.pending)); b.onclick = () => { setTool(id); }; tl.appendChild(b); });
    const xf = [['translate', 'Move', 'G'], ['rotate', 'Rotate', 'R'], ['scale', 'Scale', 'T']]; xf.forEach(([id, name, k]) => { const b = el('button', '', name); b.title = name + ' (' + k + ')'; b.type = 'button'; b.setAttribute('aria-pressed', String(S.xf === id)); b.onclick = () => { S.xf = id; refreshGizmo(); ed.panelBuild(p); }; tl.appendChild(b); });
    const gs = el('label', '', 'Snap'); const sel = el('select'); [['0', 'Off'], ['0.25', '25 cm'], ['0.5', '50 cm'], ['1', '1 m'], ['2', '2 m']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; if (+v === S.grid) o.selected = true; sel.appendChild(o); }); sel.onchange = () => { S.grid = +sel.value; refreshGizmo(); }; gs.appendChild(sel); tl.appendChild(gs);
    const dup = el('button', '', 'Duplicate'); dup.type = 'button'; dup.onclick = duplicate; dup.disabled = !S.sel.length; const del = el('button', '', 'Delete'); del.type = 'button'; del.onclick = remove; del.disabled = !S.sel.length; tl.append(dup, del); p.appendChild(tl);
    if (S.tool === 'wall' || S.tool === 'room' || S.tool === 'floor') {
      const w = el('div', 'row'); const mat = el('select'); Object.entries(MATERIALS).forEach(([k, m]) => { if (k === 'glass') return; const o = el('option', '', m.label); o.value = k; if (S.wall.material === k) o.selected = true; mat.appendChild(o); }); mat.onchange = () => { S.wall.material = mat.value; };
      const h = el('input'); h.type = 'number'; h.min = 1; h.max = 12; h.step = 0.1; h.value = S.wall.height; h.onchange = () => { S.wall.height = Math.min(12, Math.max(1, +h.value || 2.8)); };
      const col = el('input'); col.type = 'color'; col.value = S.wall.color || MATERIALS[S.wall.material].base; col.title = 'Tint'; col.onchange = () => { S.wall.color = col.value; };
      const op = el('select'); ['none', 'door', 'window', 'gate'].forEach(k => { const o = el('option', '', 'Opening: ' + k); o.value = k; if (S.wall.opening === k) o.selected = true; op.appendChild(o); }); op.onchange = () => { S.wall.opening = op.value; };
      const lm = el('label', '', 'Material '); lm.appendChild(mat); const lh = el('label', '', 'Height '); lh.appendChild(h); w.append(lm, lh, col); if (S.tool === 'wall') w.appendChild(op);
      if (S.tool === 'room') w.appendChild(chip('Roof', S.roof, () => { S.roof = !S.roof; ed.panelBuild(p); })); p.appendChild(w);
      p.appendChild(el('p', 'hint2', S.tool === 'wall' ? 'Drag on the ground (or on a floor) from one end of the wall to the other.' : S.tool === 'room' ? 'Drag a rectangle. You get a floor, four walls with a door and windows, and a roof.' : 'Drag a rectangle for a floor.'));
    }
    if (app.level) { const lv = el('div', 'row'); lv.append(chip('Play', false, () => app.lv.play(), 'Play the level (E)'), chip('Sample level', false, () => { const n = sampleLevel(app); app.ui.toast(n + ' objects placed'); app.ui.updHist(); ed.panelBuild(p); }, 'Place a small example level'), chip('Save level', false, () => app.lv.saveFile(), 'Download a .n0level.json'), chip('Open level', false, () => app.lv.openFile(), 'Open a .n0level.json'), chip('Snap ' + (S.grid ? 'on' : 'off'), !!S.grid, () => { S.grid = S.grid ? 0 : 1; refreshGizmo(); ed.panelBuild(p); }, 'Toggle snapping (Shift+G)')); p.appendChild(lv); }
    const tabs = el('div', 'row'); [['level', 'Level kit'], ['assets', 'Props and buildings'], ['kit', 'Build pieces'], ['online', 'Online CC0']].forEach(([id, n]) => tabs.appendChild(chip(n, S.tab === id, () => { S.tab = id; S.cat = ''; S.q = ''; if (id === 'online') loadOnline(); ed.panelBuild(p); })));
    const q = el('input'); q.type = 'search'; q.placeholder = 'Search'; q.value = S.q; q.setAttribute('aria-label', 'Search'); q.style.flex = '1'; q.addEventListener('keydown', ev => ev.stopPropagation()); q.oninput = () => { S.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { fill(); }, 200); }; tabs.appendChild(q); p.appendChild(tabs);
    const cats = el('div', 'row'); const list = el('div', 'tiles'); p.append(cats, list);
    function fill() {
      cats.innerHTML = ''; list.innerHTML = '';
      let items = [], cs = [];
      if (S.tab === 'assets') { cs = [...new Set(app.assets.query({ limit: 200 }).map(a => a.category))]; items = itemsAssets(); }
      else if (S.tab === 'level') { cs = CATS; items = itemsLevel(); }
      else if (S.tab === 'kit') items = itemsKit();
      else { if (S.onlineErr) { list.appendChild(el('p', 'hint2', S.onlineErr)); return; } if (!S.online) { list.appendChild(el('p', 'hint2', 'Loading the Poly Haven library…')); loadOnline(); return; } const cc = {}; S.online.forEach(m => m.cats.forEach(c => { cc[c] = (cc[c] || 0) + 1; })); cs = Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]); items = itemsOnline(); }
      if (cs.length) { cats.appendChild(chip('All', !S.cat, () => { S.cat = ''; fill(); })); cs.forEach(c => cats.appendChild(chip(c, S.cat === c, () => { S.cat = S.cat === c ? '' : c; fill(); }))); }
      items.forEach(it => list.appendChild(tile(it))); if (!items.length) list.appendChild(el('p', 'hint2', 'Nothing matches.'));
    }
    fill();
    const hint = el('p', 'hint2', S.pending ? 'Click the ground to place "' + S.pending.name + '". R turns it, Esc stops.' : 'Drag a tile into the scene, or tap it and then tap the ground. Click an object to move it.'); p.appendChild(hint);
  };
  ed.panelScene = p => {
    p.className = 'panel bld'; p.innerHTML = ''; const row = el('div', 'row'), outl = el('div', 'out'), det = el('div', 'det'); row.append(outl, det); p.appendChild(row);
    const list = E.list(); if (!list.length) outl.appendChild(el('p', 'hint2', 'Nothing placed yet. Open Build and drag something in.'));
    list.slice(0, 300).forEach(x => { const b = el('button', ''); b.type = 'button'; b.textContent = x.id; b.setAttribute('aria-pressed', String(S.sel.includes(x.id))); b.onclick = ev => select([x.id], ev.shiftKey); outl.appendChild(b); });
    const id = S.sel[0]; if (!id || !E.recs.has(id)) { det.appendChild(el('p', 'hint2', S.sel.length ? '' : 'Select something to see its details.')); return; }
    const r = E.get(id), T = r.transform; det.appendChild(el('b', '', r.id)); det.appendChild(el('span', 'hint2', r.prefab + (r.parameters.assetId ? ' · ' + r.parameters.assetId : '')));
    const set = patch => { const res = core.exec({ cmd: 'entity.set', id, ...patch }); if (!res.ok) app.ui.toast(res.msg); app.ui.updHist(); refreshGizmo(); updateOutline(); app.bump && app.bump(); };
    const vec = (label, key, arr, conv, back, step) => { const w = el('div', 'row'); w.appendChild(el('span', 'hint2', label)); arr.forEach((v, i) => { const n = el('input'); n.type = 'number'; n.step = step; n.value = r3(conv(v)); n.setAttribute('aria-label', label + ' ' + 'xyz'[i]); n.addEventListener('keydown', ev => ev.stopPropagation()); n.onchange = () => { const a = arr.slice(); a[i] = back(+n.value); set({ [key]: a }); }; w.appendChild(n); }); det.appendChild(w); };
    vec('Position', 'position', T.position, v => v, v => v, 0.1); vec('Rotation °', 'rotation', T.rotation, v => v * 180 / Math.PI, v => v * Math.PI / 180, 5); vec('Scale', 'scale', T.scale, v => v, v => Math.max(0.01, v), 0.1);
    if (r.prefab.startsWith('build.')) { const w = el('div', 'row'); const mat = el('select'); Object.entries(MATERIALS).forEach(([k, m]) => { const o = el('option', '', m.label); o.value = k; if (r.parameters.material === k) o.selected = true; mat.appendChild(o); }); mat.onchange = () => set({ parameters: { material: mat.value } });
      const col = el('input'); col.type = 'color'; col.value = r.parameters.color || MATERIALS[r.parameters.material].base; col.onchange = () => set({ parameters: { color: col.value } }); w.append(mat, col); det.appendChild(w);
      const dims = el('div', 'row'); for (const k of ['length', 'width', 'depth', 'height', 'thickness', 'rise']) if (typeof r.parameters[k] === 'number') { const n = el('input'); n.type = 'number'; n.step = 0.1; n.value = r.parameters[k]; n.title = k; n.setAttribute('aria-label', k); n.addEventListener('keydown', ev => ev.stopPropagation()); n.onchange = () => set({ parameters: { [k]: +n.value } }); const l = el('label', '', k + ' '); l.appendChild(n); dims.appendChild(l); } det.appendChild(dims); }
    // every parameter of a schema-declared prefab (level kit, primitives) gets its field from the schema: no per-prefab panel code
    { const def = E.prefabs.get(r.prefab), P = r.parameters; for (const f of (def && def.schema) || []) {
      const w = el('div', 'row'); w.appendChild(el('span', 'hint2', f.label)); const send = v => set({ parameters: { [f.name]: v } });
      const num = (val, i) => { const n = el('input'); n.type = 'number'; if (f.step) n.step = f.step; if (f.min != null) n.min = f.min; if (f.max != null) n.max = f.max; n.value = r3(val); n.title = f.label + (i == null ? '' : ' ' + 'XYZ'[i]); n.setAttribute('aria-label', n.title); n.addEventListener('keydown', ev => ev.stopPropagation());
        n.onchange = () => { const v = parseFloat(n.value); if (Number.isFinite(v)) send(i == null ? (f.type === 'int' ? Math.round(v) : v) : P[f.name].map((o, k) => k === i ? v : o)); }; w.appendChild(n); };
      if (f.type === 'vec3') P[f.name].forEach((v, i) => num(v, i)); else if (f.type === 'number' || f.type === 'int') num(P[f.name]);
      else if (f.type === 'color') { const c = el('input'); c.type = 'color'; c.value = P[f.name]; c.title = f.label; c.setAttribute('aria-label', f.label); c.onchange = () => send(c.value); w.appendChild(c); }
      else if (f.type === 'bool') w.appendChild(chip(f.label, !!P[f.name], () => { send(!P[f.name]); ed.panelScene(p); }, f.label));
      else if (f.type === 'enum') { const sel = el('select'); for (const o of f.options) { const op = el('option', '', o); op.value = o; if (P[f.name] === o) op.selected = true; sel.appendChild(op); } sel.onchange = () => send(sel.value); w.appendChild(sel); }
      else { const t = el('input'); t.value = P[f.name]; t.addEventListener('keydown', ev => ev.stopPropagation()); t.onchange = () => send(t.value); w.appendChild(t); }
      det.appendChild(w); } }
    const act = el('div', 'row'); const col2 = !(r.components.collider && r.components.collider.type === 'none'); act.appendChild(chip('Solid', col2, () => { set({ components: { collider: { type: col2 ? 'none' : 'static' } } }); ed.panelScene(p); }, 'Solid objects stop the player'));
    const d = el('button', 'chip', 'Duplicate'); d.type = 'button'; d.onclick = duplicate; const f = el('button', 'chip', 'Focus'); f.type = 'button'; f.onclick = focus; const x = el('button', 'chip', 'Delete'); x.type = 'button'; x.onclick = remove; act.append(d, f, x); det.appendChild(act);
  };
  ed.update = () => { if (!active()) { if (gizmo.enabled) refreshGizmo(); outline.visible = false; hidePrev(); return; } updateOutline(); if (S.sel.length === 1 && !gizmo.enabled && S.tool === 'select') refreshGizmo(); };
  core.on(() => { try { ed.prune(); } catch (e) { /* scene is changing */ } });
  ed.prune = () => { const keep = S.sel.filter(id => E.recs.has(id)); if (keep.length !== S.sel.length) select(keep); };
  return ed;
}
