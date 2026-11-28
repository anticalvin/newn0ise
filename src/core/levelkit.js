// Level kit: the prefabs a blank level is built from, registered as ordinary Core entity prefabs (so they validate, save, undo and import like everything else).
// build.* shapes (block, pillar, ramp, cylinder, sphere) fill the gaps next to Core's own build.wall / build.floor / build.stairs; prop.* become dynamic bodies in Play,
// pickup.* are collectables, actor.* are fighters, spawn.player is the start, vehicle.car is the drivable car, light.point is a light.
// Origin of every prefab is on the floor under it, like prim.*, so a click on a surface places it sitting on that surface. Three.js objects and colliders are DERIVED from records.
import * as THREE from 'three';
import { makeCrateMesh, makeBarrelMesh, makeBoulderMesh } from './nature.js';
import { Character } from './character.js';
import { carMesh } from './vehicle.js';
import { GUNS } from './guns.js';
import { field } from './schema.js';

// ---------- geometry (UVs in metres so the prototype grid reads at true scale) ----------
function poly(G, pts, n) {
  const b = G.pos.length / 3; for (const p of pts) { G.pos.push(p[0], p[1], p[2]); G.nor.push(n[0], n[1], n[2]); const ax = Math.abs(n[0]), ay = Math.abs(n[1]); G.uv.push(ax > 0.6 ? p[2] : p[0], ax > 0.6 ? p[1] : ay > 0.6 ? p[2] : p[1]); }
  for (let i = 1; i < pts.length - 1; i++) { const a = pts[0], c = pts[i], d = pts[i + 1], u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]], cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) G.idx.push(b, b + i, b + i + 1); else G.idx.push(b, b + i + 1, b + i); }
}
function boxInto(G, x0, y0, z0, x1, y1, z1) {
  poly(G, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]); poly(G, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
  poly(G, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]); poly(G, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  poly(G, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]); poly(G, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
}
const stepsFor = sy => Math.max(3, Math.min(24, Math.ceil(sy / 0.28)));
export function buildGeo(kind, s) {
  const [sx, sy, sz] = s, hx = sx / 2, hy = sy / 2, hz = sz / 2;
  if (kind === 'cyl') { const g = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 28), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * sx, uv.getY(i) * sy); return g; }
  if (kind === 'sphere') { const g = new THREE.SphereGeometry(sx / 2, 28, 18), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * sx, uv.getY(i) * Math.PI * sx * 0.5); return g; }
  const G = { pos: [], nor: [], uv: [], idx: [] };
  if (kind === 'box') boxInto(G, -hx, -hy, -hz, hx, hy, hz);
  else if (kind === 'ramp') { const sl = Math.hypot(hz, hy) || 1, n = [0, hz / sl, hy / sl];
    poly(G, [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [0, -1, 0]); poly(G, [[-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz]], [0, 0, -1]);
    poly(G, [[-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, -hz]], n); poly(G, [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, -hz]], [-1, 0, 0]); poly(G, [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz]], [1, 0, 0]); }
  else if (kind === 'stairs') { const n = stepsFor(sy), dy = sy / n, dz = sz / n; for (let i = 0; i < n; i++) boxInto(G, -hx, -hy + i * dy, -hz, hx, -hy + (i + 1) * dy, hz - i * dz); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2)); g.setIndex(G.idx); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}
let gridTex = null; const mats = new Map();
export function gridTexture() { if (gridTex) return gridTex; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(20,24,30,.42)'; x.lineWidth = 3; x.strokeRect(0, 0, 128, 128); x.strokeStyle = 'rgba(20,24,30,.12)'; x.lineWidth = 1; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 128); x.moveTo(0, 64); x.lineTo(128, 64); x.stroke();
  gridTex = new THREE.CanvasTexture(c); gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.anisotropy = 8; gridTex.colorSpace = THREE.SRGBColorSpace; return gridTex; }
export const levelMat = color => { let m = mats.get(color); if (!m) { m = new THREE.MeshStandardMaterial({ color, map: gridTexture(), roughness: 0.85, metalness: 0 }); mats.set(color, m); } return m; };
const SHAPES = {
  'build.block': { n: 'Block', size: [2, 2, 2], geo: 'box', color: '#9aa1ab' }, 'build.pillar': { n: 'Pillar', size: [0.8, 4, 0.8], geo: 'box', color: '#a89c8c' },
  'build.ramp': { n: 'Ramp', size: [4, 2, 6], geo: 'ramp', color: '#8e98a6' }, 'build.cylinder': { n: 'Cylinder', size: [2, 2, 2], geo: 'cyl', color: '#98a2ad' }, 'build.sphere': { n: 'Sphere', size: [2, 2, 2], geo: 'sphere', color: '#b0a090' },
};
export const CATS = ['Build', 'Physics props', 'Pickups', 'Characters', 'Gameplay'];
// the palette: [prefab, name, category, params]
export const LEVEL_ITEMS = [
  ...Object.entries(SHAPES).map(([id, d]) => [id, d.n, 'Build', {}]),
  ['prop.crate', 'Crate', 'Physics props', {}], ['prop.barrel', 'Barrel', 'Physics props', {}], ['prop.boulder', 'Boulder', 'Physics props', { r: 1.1 }],
  ['pickup.pistol', 'Pistol', 'Pickups', {}], ['pickup.rifle', 'Rifle', 'Pickups', {}], ['pickup.shotgun', 'Shotgun', 'Pickups', {}], ['pickup.health', 'Health', 'Pickups', {}], ['pickup.ammo', 'Ammo', 'Pickups', {}],
  ['actor.brawler', 'Brawler', 'Characters', {}], ['actor.heavy', 'Heavy', 'Characters', {}], ['actor.dummy', 'Training dummy', 'Characters', {}],
  ['spawn.player', 'Player start', 'Gameplay', {}], ['vehicle.car', 'Car', 'Gameplay', { color: '#c0392b' }], ['light.point', 'Point light', 'Gameplay', { color: '#ffd9a0', intensity: 24 }],
];
export const kindOf = id => id.split('.')[1];
export const LEVEL_PREFABS = new Set(LEVEL_ITEMS.map(i => i[0]));
export const isDynamicPrefab = id => id.startsWith('prop.') || id.startsWith('actor.') || id === 'vehicle.car' || id.startsWith('pickup.') || id === 'spawn.player';
const PAL = { brawler: { jacket: 0x8a3b32, pants: 0x1c1e22, skin: 0xb5805f, hair: 0x1a120d }, heavy: { jacket: 0x2d3b4a, pants: 0x14161a, skin: 0x7c5440, hair: 0x0c0a09 }, dummy: { jacket: 0xcaa86a, pants: 0xcaa86a, skin: 0xcaa86a, hair: 0xb89556 } };
export function gunMesh(kind) {
  const m = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.45, metalness: 0.7 }), g = new THREE.Group(), L = kind === 'rifle' ? 0.9 : kind === 'shotgun' ? 1.0 : 0.4;
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, L), m); const gr = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.12), m); gr.position.set(0, -0.16, -L * 0.25); gr.rotation.x = 0.2; g.add(b, gr); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}

const hexOk = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function pickupVisual(k) {
  const g = new THREE.Group(), spin = new THREE.Group();
  if (GUNS[k]) spin.add(gunMesh(k)); else { const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: k === 'health' ? 0xf2f2f2 : 0x6b7a3a, roughness: 0.5 })); box.castShadow = true; spin.add(box);
    const mk = new THREE.MeshStandardMaterial({ color: k === 'health' ? 0xd83b2d : 0xe0b84a, emissive: k === 'health' ? 0x551108 : 0x4a3a08 }); for (const [x, y, z] of [[0.43, 0.3, 0.1], [0.43, 0.1, 0.3]]) spin.add(new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mk)); }
  spin.position.y = 0.7; g.add(spin); const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.6 })); ring.position.y = 0.05; g.add(ring); g.userData.spin = spin; return g;
}
export function actorVisual(kind, shared) {
  const ch = new Character(shared, { ...PAL[kind], scale: kind === 'heavy' ? 1.2 : 1 });
  for (let i = 0; i < 6; i++) ch.update(0.02, { speed: 0, vf: 0, vs: 0, onGround: true, vy: 0, depth: 0, leanF: 0, leanR: 0, stance: 0, act: null, actT: 0, actHold: false, blocking: false, landT: 0 }); return ch.root;
}

// world-space collider descriptors for a shape entity (scale handled by decomposing the object's matrix)
function shapeColliders(o, d, size) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); o.updateMatrixWorld(true); o.matrixWorld.decompose(p, q, s);
  const [sx, sy, sz] = size, c = new THREE.Vector3(0, sy / 2, 0).applyMatrix4(o.matrixWorld), cc = [c.x, c.y, c.z], qq = [q.x, q.y, q.z, q.w], ax = Math.abs(s.x), ay = Math.abs(s.y), az = Math.abs(s.z);
  if (d.geo === 'box') return [{ c: cc, h: [Math.max(0.01, sx / 2 * ax), Math.max(0.01, sy / 2 * ay), Math.max(0.01, sz / 2 * az)], q: qq }];
  if (d.geo === 'cyl') return [{ type: 'cyl', c: cc, h: [Math.max(0.01, sx / 2 * Math.max(ax, az)), Math.max(0.01, sy / 2 * ay)], q: qq }];
  if (d.geo === 'sphere') return [{ type: 'ball', c: cc, h: [Math.max(0.01, sx / 2 * Math.max(ax, ay, az))], q: qq }];
  const hx = sx / 2 * ax, hy = sy / 2 * ay, hz = sz / 2 * az;    // ramp: convex hull of the wedge
  return [{ type: 'hull', c: cc, q: qq, h: [hx, hy, hz], pts: [-hx, -hy, -hz, hx, -hy, -hz, hx, -hy, hz, -hx, -hy, hz, -hx, hy, -hz, hx, hy, -hz] }];
}

export function registerLevelKit(E, { vec3, bad }) {
  for (const [id, d] of Object.entries(SHAPES)) E.register(id, {
    label: d.n, category: 'Build', components: ['model', 'collider'],
    schema: [field('size', 'vec3', { min: 0.1, max: 120, default: d.size, label: 'Size', step: 0.25 }), field('color', 'color', { default: d.color, label: 'Colour' })],
    build(rec, ctx) {
      const size = rec.parameters.size, g = new THREE.Group(), m = new THREE.Mesh(buildGeo(d.geo, size), levelMat(rec.parameters.color)); m.position.y = size[1] / 2; m.castShadow = m.receiveShadow = true; g.add(m);
      return { object: g, colliders: () => (rec.components.collider && rec.components.collider.type === 'none') ? [] : shapeColliders(g, d, size), dispose: () => m.geometry.dispose() };
    },
  });
  const simple = (name, make, meta = {}) => E.register(name, { ...meta, schema: meta.schema || [], build(rec, ctx) { const g = new THREE.Group(); const o = make(rec, ctx); g.add(o); if (o.userData.spin) g.userData.spin = o.userData.spin; return { object: g, colliders: () => [] }; } });
  const radius = [field('r', 'number', { min: 0.3, max: 3, default: 1.1, label: 'Radius', step: 0.1 })];
  simple('prop.crate', (r, c) => { const m = makeCrateMesh(c.app.shared, 0.5); m.position.y = 0.5; return m; }, { label: 'Crate', category: 'Physics props', components: ['model', 'collider', 'rigidbody'] });
  simple('prop.barrel', (r, c) => { const m = makeBarrelMesh(c.app.shared, 0.45); m.position.y = 0.5; return m; }, { label: 'Barrel', category: 'Physics props', components: ['model', 'collider', 'rigidbody'] });
  simple('prop.boulder', (r, c) => { const m = makeBoulderMesh(c.app.shared, r.parameters.r, 11); m.position.y = r.parameters.r; return m; }, { label: 'Boulder', category: 'Physics props', components: ['model', 'collider', 'rigidbody'], schema: radius });
  for (const k of ['pistol', 'rifle', 'shotgun', 'health', 'ammo']) simple('pickup.' + k, () => pickupVisual(k), { label: k[0].toUpperCase() + k.slice(1), category: 'Pickups', components: GUNS[k] ? ['model', 'pickup', 'weapon'] : ['model', 'pickup'] });
  for (const k of ['brawler', 'heavy', 'dummy']) simple('actor.' + k, (r, c) => actorVisual(k, c.app.shared), { label: k[0].toUpperCase() + k.slice(1), category: 'Characters', components: ['model', 'character', 'health', 'ai'] });
  simple('spawn.player', () => { const m = new THREE.MeshBasicMaterial({ color: 0x7fe0c8, transparent: true, opacity: 0.55 }), g = new THREE.Group(), c = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.7, 20, 1, true), m), a = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 4).rotateX(Math.PI / 2), m); c.position.y = 0.85; a.position.set(0, 0.2, 0.9); g.add(c, a); return g; }, { label: 'Player start', category: 'Gameplay', components: ['spawner'] });
  simple('vehicle.car', (r, c) => { const m = carMesh(r.parameters.color); m.position.y = 0.8; return m; }, { label: 'Car', category: 'Gameplay', components: ['model', 'vehicle', 'rigidbody'], schema: [field('color', 'color', { default: '#c0392b', label: 'Colour' })] });
  simple('light.point', r => { const g = new THREE.Group(), s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: r.parameters.color })); s.position.y = 2.5; g.add(s); const l = new THREE.PointLight(r.parameters.color, +r.parameters.intensity || 24, 22, 2); l.position.y = 2.5; g.add(l); return g; },
    { label: 'Point light', category: 'Gameplay', components: ['light'], schema: [field('color', 'color', { default: '#ffd9a0', label: 'Colour' }), field('intensity', 'number', { min: 0, max: 400, step: 4, default: 24, label: 'Intensity' })] });
}
