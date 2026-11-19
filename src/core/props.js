// Static props: a walkable wooden pier and a beach shack. Generated deterministically from the terrain so they sit on the shore.
import * as THREE from 'three';
import { patchStandard } from './glsl.js';
import { mulberry32 } from './util.js';

function woodTexture(w = 256, h = 256, horizontal = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), r = mulberry32(21);
  g.fillStyle = '#7a6044'; g.fillRect(0, 0, w, h);
  const n = 8, ph = h / n;
  for (let i = 0; i < n; i++) { const v = 0.8 + r() * 0.35; g.fillStyle = `rgb(${122 * v | 0},${94 * v | 0},${66 * v | 0})`; g.fillRect(0, i * ph, w, ph - 2);
    g.strokeStyle = 'rgba(40,28,18,.35)'; g.lineWidth = 1; for (let k = 0; k < 14; k++) { g.beginPath(); const y = i * ph + 2 + r() * (ph - 5); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 3); g.stroke(); }
    g.fillStyle = '#2c2016'; g.fillRect(0, i * ph + ph - 2, w, 2); }
  const t = new THREE.CanvasTexture(g.canvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (!horizontal) t.rotation = Math.PI / 2; return t;
}

export function buildProps(scene, shared, T, player) {
  player.decks.length = 0; player.circles.length = 0;
  const out = { pier: null, shack: null, colliders: [] };
  const g = new THREE.Group(); scene.add(g);
  const wood = patchStandard(new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9 }), shared, {}, 'wood');
  const dark = patchStandard(new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.95 }), shared, {}, 'woodDark');
  const roofM = patchStandard(new THREE.MeshStandardMaterial({ color: 0x5b4d44, roughness: 0.8 }), shared, {}, 'roof');
  const doorM = patchStandard(new THREE.MeshStandardMaterial({ color: 0x1b2a2e, roughness: 0.6 }), shared, {}, 'door');
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

  // pier: start where the beach is ~1 m high, run west into the sea
  const pz = 20; let px0 = 0; for (let x = 20; x > -120; x -= 1) { if (T.hAt(x, pz) < 0.9) { px0 = x; break; } }
  const len = 38, x0 = px0 + 3, x1 = x0 - len, deckY = 1.55, wdt = 2.6;
  const planks = Math.floor(len / 0.22), pg = new THREE.BoxGeometry(0.2, 0.07, wdt);
  const deck = new THREE.InstancedMesh(pg, wood, planks); deck.castShadow = deck.receiveShadow = true; const m4 = new THREE.Matrix4();
  for (let i = 0; i < planks; i++) { m4.makeTranslation(x0 - i * 0.22 - 0.1, deckY, pz); deck.setMatrixAt(i, m4); } g.add(deck);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(len, 0.18, 0.16), dark, (x0 + x1) / 2, deckY - 0.14, pz + s * (wdt / 2 - 0.1));
  const posts = []; for (let x = x0 - 1; x > x1; x -= 3.2) for (const s of [-1, 1]) posts.push([x, pz + s * (wdt / 2 - 0.12)]);
  const cg = new THREE.CylinderGeometry(0.13, 0.15, 1, 8); const pm = new THREE.InstancedMesh(cg, dark, posts.length); pm.castShadow = pm.receiveShadow = true;
  posts.forEach(([x, z], i) => { const bot = Math.min(T.hAt(x, z), -1) - 0.3, hh = deckY + 0.5 - bot; m4.compose(new THREE.Vector3(x, bot + hh / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, hh, 1)); pm.setMatrixAt(i, m4); }); g.add(pm);
  // railing posts at the end + lamp
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), dark, x1 + 0.4, deckY + 0.55, pz + s * (wdt / 2 - 0.1));
  out.pier = { x0, x1, z: pz, y: deckY };
  player.decks.push({ x: (x0 + x1) / 2, z: pz, hx: len / 2, hz: wdt / 2, y: deckY + 0.04 });
  out.colliders.push({ c: [(x0 + x1) / 2, deckY, pz], h: [len / 2, 0.04, wdt / 2] });

  // shack on the dunes behind the beach
  const sz = -26; let sx = 0; for (let x = -120; x < 80; x += 1) { if (T.hAt(x, sz) > 1.9) { sx = x + 4; break; } }
  const sy = T.hAt(sx, sz) - 0.05, W = 4.4, D = 3.4, Hh = 2.5;
  const body = add(new THREE.BoxGeometry(W, Hh, D), wood, sx, sy + Hh / 2, sz); body.material = wood;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 1, 1, 4, 1), roofM); roof.rotation.y = Math.PI / 4; roof.scale.set(W * 0.80, 1.5, D * 1.0); roof.position.set(sx, sy + Hh + 0.72, sz); roof.castShadow = true; g.add(roof);
  add(new THREE.BoxGeometry(0.06, 1.8, 0.95), doorM, sx - W / 2 - 0.02, sy + 0.9, sz); 
  add(new THREE.BoxGeometry(0.06, 0.7, 1.0), doorM, sx - W / 2 - 0.02, sy + 1.55, sz + 1.0);
  const porch = add(new THREE.BoxGeometry(2.2, 0.16, D + 0.4), wood, sx - W / 2 - 1.1, sy + 0.08, sz);
  out.shack = { x: sx, z: sz, y: sy };
  player.circles.push({ x: sx, z: sz, r: 2.9 });
  out.colliders.push({ c: [sx, sy + Hh / 2, sz], h: [W / 2, Hh / 2, D / 2] });
  g.userData = out; return g;
}
