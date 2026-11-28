// Interactive prefabs: a door, a chair, a drink and a parcel. They contain NO behaviour. Each one is geometry + a declared `affordances(rec)` list;
// src/core/interact.js executes those for any actor. To add a new interactive object, write geometry and list what it permits.
// Origin of each is on the floor (like prim.*). `state` holds only the AUTHORED starting state (door open?, drink full?), never runtime state.
import * as THREE from 'three';
import { field } from '../schema.js';

const mat = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const box = (w, h, d, material, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };

export function registerInteractive(E, { toWorld }) {
  // ---- door: a leaf on a hinge. Collider follows the leaf; it is off while the leaf swings.
  E.register('interact.door', {
    label: 'Door', category: 'Interactive', components: ['model', 'collider', 'interaction'],
    schema: [field('width', 'number', { min: 0.6, max: 2.4, step: 0.05, default: 1.0 }), field('height', 'number', { min: 1.6, max: 3.2, step: 0.05, default: 2.1 }),
      field('color', 'color', { default: '#8a6a4b', label: 'Colour' }), field('angle', 'number', { min: 30, max: 120, step: 5, default: 100, label: 'Opens to (deg)' })],
    validateState: s => ({ open: !!s.open }), initState: () => ({ open: false }),
    affordances: r => [{ type: 'open', anchor: [0, r.parameters.height / 2, 0], reach: 1.9, part: 'leaf', angle: r.parameters.angle }],
    build(r, ctx) {
      const { width: w, height: h, color } = r.parameters, g = new THREE.Group(), leaf = new THREE.Group(), m = mat(color, 0.6), geos = [];
      leaf.position.set(-w / 2, 0, 0); const slab = box(w, h, 0.06, m, w / 2, h / 2, 0); const knob = box(0.07, 0.07, 0.14, mat('#c8b27a', 0.3, 0.8), w - 0.1, h * 0.48, 0); leaf.add(slab, knob);
      const frame = mat('#6e5a45', 0.8), jambs = [box(0.08, h + 0.08, 0.14, frame, -w / 2 - 0.04, (h + 0.08) / 2, 0), box(0.08, h + 0.08, 0.14, frame, w / 2 + 0.04, (h + 0.08) / 2, 0), box(w + 0.16, 0.08, 0.14, frame, 0, h + 0.04, 0)];
      g.add(leaf, ...jambs); g.traverse(o => { if (o.geometry) geos.push(o.geometry); });
      const rt = { object: g, parts: { leaf }, moving: false, dispose: () => { geos.forEach(x => x.dispose()); m.dispose(); frame.dispose(); } };
      rt.colliders = () => (rt.moving || (r.components.collider && r.components.collider.type === 'none')) ? [] : toWorld(leaf, [{ c: [w / 2, h / 2, 0], h: [w / 2, h / 2, 0.04] }]);
      return rt;
    },
  });
  // ---- chair: seat anchor, facing and exit point are data
  E.register('interact.chair', {
    label: 'Chair', category: 'Interactive', components: ['model', 'collider', 'interaction'],
    schema: [field('color', 'color', { default: '#4f6d8a', label: 'Colour' }), field('seatHeight', 'number', { min: 0.3, max: 0.7, step: 0.01, default: 0.45, label: 'Seat height' })],
    affordances: r => [{ type: 'sit', anchor: [0, r.parameters.seatHeight, 0], reach: 1.4, facing: 0, exit: [0, 0, 0.85], hip: 0.55 }],
    build(r, ctx) {
      const s = r.parameters.seatHeight, m = mat(r.parameters.color, 0.75), g = new THREE.Group(), legs = mat('#2b2b2e', 0.5, 0.6);
      g.add(box(0.46, 0.06, 0.46, m, 0, s, 0), box(0.46, 0.5, 0.05, m, 0, s + 0.3, -0.21)); for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(box(0.04, s, 0.04, legs, x, s / 2, z));
      g.traverse(o => { o.castShadow = true; });
      return { object: g, colliders: () => toWorld(g, [{ c: [0, s, 0], h: [0.23, 0.03, 0.23] }, { c: [0, s + 0.3, -0.21], h: [0.23, 0.25, 0.025] }]), dispose: () => { m.dispose(); legs.dispose(); } };
    },
  });
  // ---- drink: carry (one hand, stays level, light) + consume (only while held)
  E.register('interact.drink', {
    label: 'Drink', category: 'Interactive', components: ['model', 'interaction'],
    schema: [field('color', 'color', { default: '#c0392b', label: 'Liquid' })],
    validateState: s => ({ left: Math.min(1, Math.max(0, +s.left)) }), initState: () => ({ left: 1 }),
    affordances: () => [{ type: 'carry', anchor: [0, 0.06, 0], reach: 1.5, profile: { mass: 0.4, hands: 1, upright: true, fragile: true, height: 0.06 } }, { type: 'consume', anchor: [0, 0.06, 0], reach: 99, sips: 3 }],
    build(r) {
      const g = new THREE.Group(), cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.12, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.5, side: THREE.DoubleSide }));
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.1, 16), mat(r.parameters.color, 0.3)); cup.position.y = liq.position.y = 0.06; g.add(cup, liq); g.traverse(o => { o.castShadow = true; });
      return { object: g, colliders: () => [], setLevel: v => { liq.scale.y = Math.max(0.001, v); liq.position.y = 0.01 + 0.05 * v; liq.visible = v > 0.01; }, dispose: () => { cup.geometry.dispose(); liq.geometry.dispose(); liq.material.dispose(); cup.material.dispose(); } };
    },
  });
  // ---- parcel: carry (two hands, heavy enough to slow you)
  E.register('interact.parcel', {
    label: 'Parcel', category: 'Interactive', components: ['model', 'interaction'],
    schema: [field('color', 'color', { default: '#b08a5a', label: 'Colour' }), field('mass', 'number', { min: 0.5, max: 20, step: 0.5, default: 4, label: 'Mass (kg)' })],
    affordances: r => [{ type: 'carry', anchor: [0, 0.14, 0], reach: 1.6, profile: { mass: r.parameters.mass, hands: 2, upright: false, fragile: false, height: 0.14 } }],
    build(r) {
      const m = mat(r.parameters.color, 0.85), t = mat('#e9dfc8', 0.9), g = new THREE.Group(); g.add(box(0.42, 0.26, 0.32, m, 0, 0.13, 0), box(0.43, 0.02, 0.06, t, 0, 0.13, 0), box(0.06, 0.02, 0.33, t, 0, 0.265, 0)); g.traverse(o => { o.castShadow = true; });
      return { object: g, colliders: () => [], dispose: () => { m.dispose(); t.dispose(); g.traverse(o => o.geometry && o.geometry.dispose()); } };
    },
  });
}
