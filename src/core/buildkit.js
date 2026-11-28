// Core build kit: modular architecture prefabs (walls with door, window or gate openings, floors, gable and flat roofs, stairs), a small procedural
// material library, and an online CC0 model prefab (Poly Haven, loaded on demand and cached). Everything is an ordinary entity: plain JSON parameters,
// derived meshes and static box colliders, validated by the entity registry, saved with the scene and undone as one step.
import * as THREE from 'three';
import { patchStandard } from './glsl.js';
import { mulberry32 } from './util.js';

export const MATERIALS = {
  plaster: { label: 'Plaster', base: '#e8e2d6', rough: 0.92 }, brick: { label: 'Brick', base: '#a5573e', rough: 0.9 }, concrete: { label: 'Concrete', base: '#9a9a96', rough: 0.95 },
  wood: { label: 'Wood', base: '#8a6a47', rough: 0.8 }, tile: { label: 'Tile', base: '#c9ccd0', rough: 0.35 }, metal: { label: 'Metal', base: '#8e949b', rough: 0.35, metal: 0.8 },
  glass: { label: 'Glass', base: '#9fc7d8', rough: 0.05, glass: true }, roofTile: { label: 'Roof tile', base: '#7a3b2e', rough: 0.85 }, plain: { label: 'Plain', base: '#b9b4ac', rough: 0.8 },
};
const texCache = new Map(), matCache = new Map();
function draw(name) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = mulberry32(name.length * 97 + name.charCodeAt(0));
  const base = MATERIALS[name].base; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  const shade = (a) => `rgba(0,0,0,${a})`, light = (a) => `rgba(255,255,255,${a})`;
  if (name === 'brick') { g.fillStyle = '#e9e3dc'; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) { const ox = (y % 2) * 16, v = 0.78 + r() * 0.22; g.fillStyle = `rgb(${255 * v | 0},${235 * v | 0},${225 * v | 0})`; g.fillRect(x * 32 + ox + 1, y * 16 + 1, 30, 14); } }
  else if (name === 'concrete') { for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? shade(0.04 + r() * 0.06) : light(0.05 + r() * 0.06); g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); } g.strokeStyle = shade(0.18); g.strokeRect(0.5, 0.5, 127, 127); }
  else if (name === 'wood') { for (let i = 0; i < 8; i++) { const v = 0.82 + r() * 0.18; g.fillStyle = `rgb(${255 * v | 0},${240 * v | 0},${225 * v | 0})`; g.fillRect(0, i * 16, 128, 15); g.fillStyle = shade(0.35); g.fillRect(0, i * 16 + 15, 128, 1); for (let k = 0; k < 6; k++) { g.strokeStyle = shade(0.07); g.beginPath(); const y = i * 16 + 2 + r() * 11; g.moveTo(0, y); g.lineTo(128, y + (r() - 0.5) * 3); g.stroke(); } } }
  else if (name === 'tile') { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 0.93 + r() * 0.07; g.fillStyle = `rgb(${255 * v | 0},${255 * v | 0},${255 * v | 0})`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } g.strokeStyle = shade(0.22); g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); } }
  else if (name === 'roofTile') { for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) { const ox = (y % 2) * 16, v = 0.8 + r() * 0.2; g.fillStyle = `rgb(${255 * v | 0},${240 * v | 0},${235 * v | 0})`; g.beginPath(); g.roundRect(x * 32 + ox + 1, y * 16, 30, 17, 5); g.fill(); g.fillStyle = shade(0.12); g.fillRect(x * 32 + ox + 1, y * 16 + 14, 30, 3); } }
  else if (name === 'metal') { for (let i = 0; i < 128; i += 2) { g.fillStyle = light(0.03 + r() * 0.06); g.fillRect(i, 0, 1, 128); } g.strokeStyle = shade(0.2); g.strokeRect(0.5, 0.5, 127, 127); }
  else if (name === 'plaster') { for (let i = 0; i < 600; i++) { g.fillStyle = r() < 0.5 ? shade(0.02 + r() * 0.03) : light(0.04); g.fillRect(r() * 128, r() * 128, 2 + r() * 4, 2 + r() * 4); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function materialFor(shared, name, color) {
  const m = MATERIALS[name] || MATERIALS.plain, key = name + '|' + color; if (matCache.has(key)) return matCache.get(key);
  if (!texCache.has(name) && name !== 'plain' && name !== 'glass') texCache.set(name, draw(name));
  const col = new THREE.Color(color || m.base);
  const mat = new THREE.MeshStandardMaterial({ color: col, map: texCache.get(name) || null, roughness: m.rough, metalness: m.metal || 0, transparent: !!m.glass, opacity: m.glass ? 0.32 : 1, side: m.glass ? THREE.DoubleSide : THREE.FrontSide });
  const out = patchStandard(mat, shared, {}, 'bk' + key); if (m.glass) out.depthWrite = false; matCache.set(key, out); return out;
}
// a box whose UVs are in metres, so a brick is the same size on a 1 m and a 20 m wall
function boxGeo(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}

export function registerBuildKit(E, H) {
  const { toWorld, bad, vec3, hexOk, isNum } = H;
  const num = (v, a, b, d, path) => { if (v == null) return d; if (!isNum(v)) bad('entity.invalid', `${path} must be a number`, path); return Math.min(b, Math.max(a, v)); };
  const matName = (m) => { if (m == null) return 'plaster'; if (!MATERIALS[m]) bad('entity.invalid', `material must be one of: ${Object.keys(MATERIALS).join(', ')}`, 'parameters.material'); return m; };
  const colorOf = (c) => { if (c == null) return null; if (!hexOk(c)) bad('entity.invalid', 'color must look like "#c9c1b3"', 'parameters.color'); return c; };
  const hasCol = r => !(r.components.collider && r.components.collider.type === 'none');
  function assemble(r, ctx, pieces, extras = []) {
    const o = new THREE.Group(), geos = [], mat = materialFor(ctx.app.shared, r.parameters.material, r.parameters.color), tile = 1.2;
    for (const p of pieces) { if (p.s[0] < 0.01 || p.s[1] < 0.01 || p.s[2] < 0.01) continue; const g = boxGeo(p.s[0], p.s[1], p.s[2], tile); geos.push(g); const m = new THREE.Mesh(g, mat); m.position.set(...p.c); m.castShadow = m.receiveShadow = true; o.add(m); }
    for (const e of extras) { geos.push(e.geometry); o.add(e); }
    const boxes = pieces.filter(p => p.s.every(v => v >= 0.01)).map(p => ({ c: p.c, h: [p.s[0] / 2, p.s[1] / 2, p.s[2] / 2] }));
    return { object: o, colliders: () => hasCol(r) ? toWorld(o, boxes) : [], dispose: () => geos.forEach(g => g.dispose()) };
  }

  E.register('build.wall', {
    label: 'Wall', category: 'Build', components: ['model', 'collider'],
    validate(p) { const opening = p.opening == null ? 'none' : p.opening; if (!['none', 'door', 'window', 'gate'].includes(opening)) bad('entity.invalid', 'opening must be none, door, window or gate', 'parameters.opening');
      return { length: num(p.length, 0.3, 60, 4, 'parameters.length'), height: num(p.height, 0.4, 14, 2.8, 'parameters.height'), thickness: num(p.thickness, 0.05, 2, 0.2, 'parameters.thickness'), opening, material: matName(p.material), color: colorOf(p.color) }; },
    build(r, ctx) {
      const { length: L, height: H2, thickness: T, opening } = r.parameters, pieces = [], extras = [];
      const full = () => pieces.push({ c: [0, H2 / 2, 0], s: [L, H2, T] });
      if (opening === 'none' || L < 1.2) full();
      else {
        const ow = opening === 'gate' ? Math.min(2.6, L - 0.4) : opening === 'door' ? Math.min(1.1, L - 0.4) : Math.min(1.3, L - 0.4);
        const sill = opening === 'window' ? Math.min(0.9, H2 * 0.35) : 0, oh = opening === 'window' ? Math.min(1.15, H2 - sill - 0.3) : Math.min(opening === 'gate' ? 2.5 : 2.1, H2 - 0.2), side = (L - ow) / 2;
        pieces.push({ c: [-(ow / 2 + side / 2), H2 / 2, 0], s: [side, H2, T] }, { c: [(ow / 2 + side / 2), H2 / 2, 0], s: [side, H2, T] });
        pieces.push({ c: [0, sill + oh + (H2 - sill - oh) / 2, 0], s: [ow, H2 - sill - oh, T] });
        if (sill > 0.01) pieces.push({ c: [0, sill / 2, 0], s: [ow, sill, T] });
        if (opening === 'window') { const g = new THREE.BoxGeometry(ow, oh, 0.03), m = new THREE.Mesh(g, materialFor(ctx.app.shared, 'glass', null)); m.position.set(0, sill + oh / 2, 0); extras.push(m); }
      }
      return assemble(r, ctx, pieces, extras);
    },
  });
  E.register('build.floor', {
    label: 'Floor', category: 'Build', components: ['model', 'collider'],
    validate(p) { return { width: num(p.width, 0.5, 80, 6, 'parameters.width'), depth: num(p.depth, 0.5, 80, 6, 'parameters.depth'), thickness: num(p.thickness, 0.05, 2, 0.2, 'parameters.thickness'), material: matName(p.material == null ? 'wood' : p.material), color: colorOf(p.color) }; },
    build(r, ctx) { const { width: W, depth: D, thickness: T } = r.parameters; return assemble(r, ctx, [{ c: [0, T / 2, 0], s: [W, T, D] }]); },
  });
  E.register('build.stairs', {
    label: 'Stairs', category: 'Build', components: ['model', 'collider'],
    validate(p) { return { width: num(p.width, 0.5, 20, 1.4, 'parameters.width'), length: num(p.length, 0.6, 30, 3, 'parameters.length'), height: num(p.height, 0.2, 12, 2.8, 'parameters.height'), steps: Math.round(num(p.steps, 2, 30, 14, 'parameters.steps')), material: matName(p.material == null ? 'concrete' : p.material), color: colorOf(p.color) }; },
    build(r, ctx) { const { width: W, length: Ln, height: Ht, steps: n } = r.parameters, pieces = []; for (let i = 0; i < n; i++) { const h = Ht * (i + 1) / n, d = Ln / n; pieces.push({ c: [0, h / 2, -Ln / 2 + d * i + d / 2], s: [W, h, d] }); } return assemble(r, ctx, pieces); },
  });
  E.register('build.roof', {
    label: 'Roof', category: 'Build', components: ['model', 'collider'],
    validate(p) { const style = p.style == null ? 'gable' : p.style; if (!['gable', 'flat'].includes(style)) bad('entity.invalid', 'style must be gable or flat', 'parameters.style');
      return { width: num(p.width, 0.5, 80, 8, 'parameters.width'), depth: num(p.depth, 0.5, 80, 6, 'parameters.depth'), rise: num(p.rise, 0.1, 10, 1.8, 'parameters.rise'), style, material: matName(p.material == null ? 'roofTile' : p.material), color: colorOf(p.color) }; },
    build(r, ctx) {
      const { width: W, depth: D, rise, style } = r.parameters, o = new THREE.Group(), mat = materialFor(ctx.app.shared, r.parameters.material, r.parameters.color); let g;
      if (style === 'flat') { g = boxGeo(W, 0.2, D, 1.2); const m = new THREE.Mesh(g, mat); m.position.y = 0.1; m.castShadow = m.receiveShadow = true; o.add(m); }
      else { const sh = new THREE.Shape(); sh.moveTo(-D / 2 - 0.15, 0); sh.lineTo(D / 2 + 0.15, 0); sh.lineTo(0, rise); sh.closePath(); g = new THREE.ExtrudeGeometry(sh, { depth: W + 0.3, bevelEnabled: false }); g.translate(0, 0, -(W + 0.3) / 2); g.rotateY(Math.PI / 2);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.2, uv.getY(i) / 1.2); const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; o.add(m); }
      return { object: o, colliders: () => style === 'flat' && hasCol(r) ? toWorld(o, [{ c: [0, 0.1, 0], h: [W / 2, 0.1, D / 2] }]) : [], dispose: () => g.dispose() };
    },
  });
  // an online CC0 model from Poly Haven (the same source the 3D page uses). Needs a network; offline it stays a wire box and says so.
  E.register('model.online', {
    label: 'Online model', category: 'Models', components: ['model', 'collider'],
    validate(p) { const id = String(p.id || ''); if (!/^[a-z0-9_]{2,64}$/.test(id)) bad('entity.invalid', 'parameters.id must be a Poly Haven model id such as "armchair_01"', 'parameters.id'); return { src: 'polyhaven', id, scale: num(p.scale, 0.05, 50, 1, 'parameters.scale') }; },
    build(r, ctx) {
      const o = new THREE.Group(), ph = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xff4fa3, wireframe: true })); ph.position.y = 0.3; o.add(ph); let size = [0.6, 0.6, 0.6];
      (async () => {
        const [{ GLTFLoader }, ph2] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('../phmodels.js')]);
        const root = await ph2.loadModel(new GLTFLoader(), r.parameters.id, '1k'); if (!o.parent && !o.userData.keep) { /* removed while loading */ }
        root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root), c = b.getCenter(new THREE.Vector3()), k = r.parameters.scale; const wrap = new THREE.Group(); root.position.set(-c.x, -b.min.y, -c.z); wrap.add(root); wrap.scale.setScalar(k);
        wrap.traverse(n => { if (n.isMesh) n.castShadow = n.receiveShadow = true; }); o.remove(ph); o.add(wrap); size = b.getSize(new THREE.Vector3()).multiplyScalar(k).toArray(); o.userData.loaded = true; ctx.entities.changed();
      })().catch(e => { o.userData.error = e.message; console.warn('model ' + r.parameters.id, e.message); });
      return { object: o, colliders: () => hasCol(r) ? toWorld(o, [{ c: [0, size[1] / 2, 0], h: [size[0] / 2, size[1] / 2, size[2] / 2] }]) : [], dispose: () => { ph.geometry.dispose(); } };
    },
  });
}
