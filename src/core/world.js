// .n0world import (read-only first). validateWorld() from the shared schema repairs the file and reports what it changed; then the
// instances and prefabs are placed on the Core terrain as simple solid shapes at a flat spot. Anything Core cannot do is listed, never dropped silently.
import * as THREE from 'three';
import { validateWorld } from '../world-schema.js';
import { patchStandard } from './glsl.js';

const hex = (c, d = '#b9b4ac') => new THREE.Color(c || d);
const PRIM = {
  cube: () => new THREE.BoxGeometry(1, 1, 1), sphere: () => new THREE.SphereGeometry(0.5, 24, 16), cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  cone: () => new THREE.ConeGeometry(0.5, 1, 24), capsule: () => new THREE.CapsuleGeometry(0.25, 0.5, 6, 14), torus: () => new THREE.TorusGeometry(0.35, 0.15, 12, 32),
  knot: () => new THREE.TorusKnotGeometry(0.3, 0.1, 80, 10), plane: () => new THREE.BoxGeometry(1, 0.02, 1),
};
// default sizes (w,h,d) for the ready-made types, in metres
const READY = { human: [0.6, 1.75, 0.4, 'capsule'], wall: [4, 2.5, 0.2, 'cube'], floor: [4, 0.1, 4, 'cube'], platform: [2, 0.3, 2, 'cube'], pillar: [0.5, 3, 0.5, 'cylinder'], crate: [1, 1, 1, 'cube'], ball: [1, 1, 1, 'sphere'] };

// what Core can honestly do with each part of a world file
export const SUPPORT = {
  placed: 'Placed as solid shapes: cube, sphere, cylinder, cone, capsule, torus, knot, plane, and the ready-made human, wall, floor, platform, pillar, crate and ball (the human is a stand-in capsule).',
  prefabs: 'Platform, stairs, room (walls and floor, openings are not cut), door (closed, does not swing), ladder, vehicle (a static box), target, spawn (used as the spawn point) and group are placed. Zones are skipped.',
  skipped: 'Not used in Core yet: lights (the sky and sun light Core), cameras, rules, looks, patterns on materials, the world’s own sky and fog, and physics settings other than static.',
};

export function readWorld(input) {
  const r = validateWorld(input);
  const items = r.report.items.map(i => ({ level: i.level, text: (i.path ? i.path + ': ' : '') + i.msg }));
  return { ok: r.ok, doc: r.doc, items, text: r.report.toText('n0world import report') };
}

// find the flattest dry spot near (cx,cz) big enough for `rad` metres; never edits the terrain
export function flatSpot(T, level, cx, cz, rad) {
  let best = null;
  for (let r = 0; r <= 110; r += 6) for (let a = 0; a < (r ? 12 : 1); a++) {
    const x = cx + Math.cos(a / 12 * 6.2832) * r, z = cz + Math.sin(a / 12 * 6.2832) * r;
    if (Math.abs(x) > 120 - rad || Math.abs(z) > 120 - rad) continue;
    let lo = 1e9, hi = -1e9; for (let k = 0; k < 9; k++) { const h = T.hAt(x + (k % 3 - 1) * rad * 0.7, z + (Math.floor(k / 3) - 1) * rad * 0.7); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (lo < level + 0.4) continue;
    const score = (hi - lo) + r * 0.004; if (!best || score < best.score) best = { x, z, y: hi, score, spread: hi - lo };
  }
  return best;
}

// Build meshes for a validated doc. Returns { group, colliders[], spawn, notes[], count, radius }
export function buildWorld(doc, shared) {
  const group = new THREE.Group(), colliders = [], notes = [], mats = {}, byId = new Map();
  const matFor = (inst) => {
    const m = inst.material && doc.materials[inst.material], key = (inst.material || '') + '|' + (inst.color || '');
    if (mats[key]) return mats[key];
    const c = inst.color || (m && m.color) || '#b9b4ac';
    const mat = patchStandard(new THREE.MeshStandardMaterial({ color: hex(c), roughness: m ? m.roughness : 0.7, metalness: m ? m.metalness : 0 }), shared, {}, 'world');
    if (m && m.emissive) { mat.emissive = hex(m.emissive); mat.emissiveIntensity = m.emissiveIntensity || 1; }
    if (m && m.opacity != null && m.opacity < 1) { mat.transparent = true; mat.opacity = m.opacity; }
    if (inst.placeholder) mat.color = hex('#ff4fa3');
    return (mats[key] = mat);
  };
  const box = (parent, mat, w, h, d, x, y, z, ry = 0, solid = true) => {
    const m = new THREE.Mesh(PRIM.cube(), mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; parent.add(m);
    if (solid) m.userData.col = true; return m;
  };
  let count = 0, spawn = null;
  for (const it of doc.instances) {
    if (it.visible === false) { notes.push(`${it.id}: hidden, not placed`); continue; }
    const g = new THREE.Group(); g.name = it.id; g.position.set(...it.pos); g.rotation.set(...it.rot.map(d => d * Math.PI / 180), 'YXZ');
    const mat = matFor(it), P = it.params || {};
    let sc = it.scale == null ? [1, 1, 1] : Array.isArray(it.scale) ? it.scale : [it.scale, it.scale, it.scale];
    if (it.prefab) {
      switch (it.prefab) {
        case 'platform': box(g, mat, P.width, P.thickness, P.depth, 0, P.thickness / 2, 0); break;
        case 'stairs': for (let i = 0; i < P.steps; i++) box(g, mat, P.width, P.rise * (i + 1), P.run, 0, P.rise * (i + 1) / 2, -(i + 0.5) * P.run); break;
        case 'room': {
          const w = P.width, d = P.depth, h = P.height, t = P.wall;
          if (P.floor) box(g, mat, w, 0.1, d, 0, 0.05, 0);
          box(g, mat, w, h, t, 0, h / 2, -d / 2 + t / 2); box(g, mat, w, h, t, 0, h / 2, d / 2 - t / 2); box(g, mat, t, h, d, -w / 2 + t / 2, h / 2, 0); box(g, mat, t, h, d, w / 2 - t / 2, h / 2, 0);
          if (P.ceiling) box(g, mat, w, 0.1, d, 0, h, 0);
          if ((P.openings || []).length) notes.push(`${it.id}: ${P.openings.length} door or window opening(s) are not cut in Core, the walls are solid`); break;
        }
        case 'door': box(g, mat, P.width, P.height, P.thickness, 0, P.height / 2, 0, 0, false); notes.push(`${it.id}: door is placed closed and does not open`); break;
        case 'ladder': { for (const s of [-1, 1]) box(g, mat, 0.05, P.height, 0.05, s * P.width / 2, P.height / 2, 0, 0, false); for (let y = 0.3; y < P.height; y += 0.3) box(g, mat, P.width, 0.03, 0.03, 0, y, 0, 0, false); notes.push(`${it.id}: ladder is visual only, it cannot be climbed yet`); break; }
        case 'vehicle': box(g, mat, P.width, P.height, P.length, 0, P.height / 2, 0); notes.push(`${it.id}: vehicle is a static box, it cannot be driven`); break;
        case 'target': { const m = new THREE.Mesh(PRIM.sphere(), mat); m.scale.setScalar(P.size); m.position.y = P.size / 2; m.castShadow = true; g.add(m); notes.push(`${it.id}: target cannot be shot yet`); break; }
        case 'spawn': spawn = { pos: it.pos, yaw: P.yaw || 0 }; notes.push(`${it.id}: used as the Core spawn point`); continue;
        case 'group': break;
        case 'zone': notes.push(`${it.id}: zone skipped (Core has no rules yet)`); continue;
        default: notes.push(`${it.id}: prefab ${it.prefab} is not supported in Core`); continue;
      }
    } else {
      const kind = it.type, rd = READY[kind], dims = it.dims || (rd ? rd.slice(0, 3) : [1, 1, 1]), shape = rd ? rd[3] : kind;
      const geo = (PRIM[shape] || PRIM.cube)(), m = new THREE.Mesh(geo, mat);
      if (shape === 'capsule' || shape === 'torus' || shape === 'knot') m.scale.set(dims[0] / (shape === 'capsule' ? 0.5 : 1), dims[1] / (shape === 'capsule' ? 1 : 1), dims[2] / (shape === 'capsule' ? 0.5 : 1)); else m.scale.set(dims[0], dims[1], dims[2]);
      m.position.y = dims[1] / 2; m.castShadow = m.receiveShadow = true; g.add(m); m.userData.col = !(it.phys && it.phys.type === 'none') && shape !== 'plane';
      if (kind === 'human') notes.push(`${it.id}: human is a stand-in capsule`);
    }
    if (it.phys && it.phys.type && it.phys.type !== 'static' && it.phys.type !== 'none') notes.push(`${it.id}: phys ${it.phys.type} is placed as static`);
    g.scale.set(...sc); group.add(g); byId.set(it.id, { g, it }); count++;
  }
  // parent links: re-parent after everything exists
  for (const { g, it } of byId.values()) if (it.parent && byId.has(it.parent)) byId.get(it.parent).g.add(g);
  if (doc.lights.length) notes.push(`${doc.lights.length} light(s) not used, Core is lit by its sky and sun`);
  if (doc.cameras.length) notes.push(`${doc.cameras.length} camera(s) not used`);
  if (doc.rules.length) notes.push(`${doc.rules.length} rule(s) not run, Core has no rules yet`);
  if (doc.looks.length) notes.push(`${doc.looks.length} look(s) not applied`);
  if (Object.values(doc.materials).some(m => m.pattern)) notes.push('material patterns (checker, stripes, noise) are shown as plain colour');
  const e = doc.scene.environment || {}; if (e.sky || e.fog || e.ground != null || e.bg) notes.push('the world’s own sky, fog and ground are not used, Core keeps its sky and sea');
  const bb = new THREE.Box3().setFromObject(group), size = bb.isEmpty() ? new THREE.Vector3() : bb.getSize(new THREE.Vector3());
  return { group, notes, count, radius: Math.max(size.x, size.z) / 2 + 2, bb, spawn, byId };
}

// static collider boxes (world space) for the solid parts, called after the group has been placed
export function collidersFor(group) {
  const out = [], v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse(m => {
    if (!m.isMesh || !m.userData.col) return; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox, c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    m.matrixWorld.decompose(v, q, s); const wc = c.clone().applyMatrix4(m.matrixWorld);
    out.push({ c: [wc.x, wc.y, wc.z], h: [Math.max(0.02, sz.x * s.x / 2), Math.max(0.02, sz.y * s.y / 2), Math.max(0.02, sz.z * s.z / 2)], q: [q.x, q.y, q.z, q.w] });
  });
  return out;
}
