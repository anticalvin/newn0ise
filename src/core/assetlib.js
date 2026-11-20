// Procedural asset generators for the Core catalog. These are n0ise's own work (generated in code, no third-party files), so they carry no outside licence.
// Every generator returns a THREE.Group built from SHARED geometries and materials, so hundreds of copies cost almost nothing extra.
// Dimensions are metres, Y up, pivot at the base centre (the shelf and counter sit with their bottom face on y = 0).
import * as THREE from 'three';
import { patchStandard } from './glsl.js';

export function makeLib(shared) {
  const mats = {}, geos = {};
  const mat = (k, color, rough = 0.7, metal = 0, extra = {}) => mats[k] || (mats[k] = patchStandard(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }), shared, {}, 'asset_' + k));
  const geo = (k, f) => geos[k] || (geos[k] = f());
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
  const box = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));

  // product definitions are also used by the store compiler to fill shelves with InstancedMesh
  const product = {
    can: { name: 'Can', w: 0.07, d: 0.07, h: 0.12, geometry: () => geo('can', () => { const g = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 14); g.translate(0, 0.06, 0); return g; }), material: () => mat('can', 0xc8352e, 0.35, 0.6) },
    bottle: { name: 'Bottle', w: 0.08, d: 0.08, h: 0.26, geometry: () => geo('bottle', () => { const g = new THREE.CylinderGeometry(0.036, 0.04, 0.26, 12); g.translate(0, 0.13, 0); return g; }), material: () => mat('bottle', 0x3d8f6b, 0.2, 0.1, { transparent: true, opacity: 0.92 }) },
    box: { name: 'Box', w: 0.13, d: 0.07, h: 0.2, geometry: () => geo('pbox', () => { const g = new THREE.BoxGeometry(0.12, 0.2, 0.06); g.translate(0, 0.1, 0); return g; }), material: () => mat('pbox', 0xe2b04a, 0.8) },
  };
  const SHELF = { w: 2.0, h: 1.9, d: 0.5, tiers: 5, firstY: 0.3, pitch: 0.38 };

  const gen = {
    'retail.shelf'() {
      const g = new THREE.Group(), frame = mat('frame', 0x4a4d52, 0.5, 0.5), board = mat('board', 0xb9b4ac, 0.7);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(0.04, SHELF.h, 0.04), frame, sx * (SHELF.w / 2 - 0.02), SHELF.h / 2, sz * (SHELF.d / 2 - 0.02)));
      for (let i = 0; i < SHELF.tiers; i++) g.add(mesh(box(SHELF.w - 0.04, 0.03, SHELF.d - 0.04), board, 0, SHELF.firstY + i * SHELF.pitch - 0.015, 0));
      g.add(mesh(box(SHELF.w - 0.04, SHELF.h - 0.1, 0.02), mat('back', 0x2d3035, 0.8), 0, SHELF.h / 2 + 0.03, -SHELF.d / 2 + 0.02));
      g.userData.shelf = SHELF; return g;
    },
    'retail.product.can'() { const g = new THREE.Group(); g.add(mesh(product.can.geometry(), product.can.material())); return g; },
    'retail.product.bottle'() { const g = new THREE.Group(); g.add(mesh(product.bottle.geometry(), product.bottle.material())); return g; },
    'retail.product.box'() { const g = new THREE.Group(); g.add(mesh(product.box.geometry(), product.box.material())); return g; },
    'retail.checkout'() {
      const g = new THREE.Group(); g.add(mesh(box(1.8, 1.0, 0.7), mat('counter', 0x6d5a45, 0.6), 0, 0.5, 0)); g.add(mesh(box(1.82, 0.04, 0.72), mat('countertop', 0xd7d2c8, 0.3), 0, 1.02, 0));
      g.add(mesh(box(0.3, 0.25, 0.25), mat('till', 0x222428, 0.5, 0.3), 0.5, 1.16, 0)); return g;
    },
    'retail.door'() { const g = new THREE.Group(); g.add(mesh(box(1.2, 2.1, 0.06), mat('door', 0x1d3a44, 0.4, 0.2), 0.6, 1.05, 0)); g.add(mesh(box(0.04, 0.5, 0.05), mat('handle', 0xcfd3d6, 0.3, 0.8), 1.08, 1.0, 0.05)); return g; },
    'street.bollard'() { const g = new THREE.Group(); g.add(mesh(geo('bollard', () => new THREE.CylinderGeometry(0.1, 0.12, 0.9, 14)), mat('bollard', 0xd9d4c8, 0.6), 0, 0.45, 0)); return g; },
    'street.bench'() { const g = new THREE.Group(), w = mat('bench', 0x8a6a48, 0.8); g.add(mesh(box(1.6, 0.06, 0.45), w, 0, 0.45, 0)); g.add(mesh(box(1.6, 0.4, 0.05), w, 0, 0.72, -0.2)); for (const s of [-1, 1]) g.add(mesh(box(0.06, 0.45, 0.4), mat('benchleg', 0x2c2c2e, 0.5, 0.6), s * 0.7, 0.225, 0)); return g; },
    'nature.rock'() { const g = new THREE.Group(); const r = geo('rock', () => { const x = new THREE.DodecahedronGeometry(0.5, 1); x.scale(1, 0.7, 0.85); x.translate(0, 0.3, 0); return x; }); g.add(mesh(r, mat('rock', 0x6e6a63, 0.95))); return g; },
    'vehicle.car.generic'() {
      const g = new THREE.Group(), body = mat('carbody', 0x7d8791, 0.35, 0.6), dark = mat('wheel', 0x141414, 0.9), glass = mat('glass', 0x1b2a33, 0.1, 0.2);
      g.add(mesh(box(1.8, 0.55, 4.0), body, 0, 0.62, 0)); g.add(mesh(box(1.6, 0.5, 2.1), glass, 0, 1.12, -0.15));
      const wheel = geo('cwheel', () => { const x = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18); x.rotateZ(Math.PI / 2); return x; });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(wheel, dark, sx * 0.9, 0.34, sz * 1.25)); return g;
    },
  };
  return { gen, product, SHELF, mat, mesh, box, geo };
}
