// Streamed terrain: per-tile height grids that share their edge samples (so seams are exact), three mesh LODs with skirts, a coarse national fallback.
import * as THREE from 'three';

export function decodeHM(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Int16Array(u.buffer); }

export class HeightField {
  constructor(tile) {
    this.n = tile.grid + 1; this.size = tile.size; this.step = tile.size / tile.grid;
    const raw = decodeHM(tile.hm); this.h = new Float32Array(raw.length); for (let i = 0; i < raw.length; i++) this.h[i] = raw[i] / 10;
  }
  /* local metres inside the tile (0..size). Clamped, so samples on the shared edge match the neighbour exactly. */
  at(x, z) {
    const n = this.n, fx = Math.min(n - 1.0001, Math.max(0, x / this.step)), fz = Math.min(n - 1.0001, Math.max(0, z / this.step));
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, h = this.h;
    return (h[j * n + i] * (1 - tx) + h[j * n + i + 1] * tx) * (1 - tz) + (h[(j + 1) * n + i] * (1 - tx) + h[(j + 1) * n + i + 1] * tx) * tz;
  }
}

const C = c => new THREE.Color(c);
const SEA = C(0x2c3a40), SAND = C(0xcdbb90), DRY = C(0x8f8d63), GREEN = C(0x6f8656), ROCK = C(0x8c8579), HIGH = C(0xa89c88), PARK = C(0x5f8148), WOOD = C(0x4a6a3c), CITY = C(0x77746c);
const tmp = new THREE.Color();
export function landColor(h, slope, kind, out = tmp) {
  if (h < -0.5) return out.copy(SEA).lerp(SAND, Math.min(1, (h + 40) / 60) * 0.4);
  if (kind === 'water') return out.copy(SEA);
  if (h < 3.5) out.copy(SAND).lerp(DRY, Math.max(0, (h - 1.5) / 2));
  else out.copy(DRY).lerp(GREEN, Math.min(1, (h - 3) / 60));
  if (kind === 'park') out.lerp(PARK, 0.8); else if (kind === 'wood') out.lerp(WOOD, 0.85); else if (kind === 'beach') out.copy(SAND);
  else if (kind === 'residential' || kind === 'commercial' || kind === 'industrial') out.lerp(CITY, 0.5);
  const alt = Math.min(1, Math.max(0, (h - 250) / 500));
  out.lerp(HIGH, alt * 0.7);
  if (slope > 0.5) out.lerp(ROCK, Math.min(1, (slope - 0.5) * 2.2));
  return out;
}

function pip(px, pz, poly) { let inside = false; for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) { const xi = poly[i], zi = poly[i + 1], xj = poly[j], zj = poly[j + 1]; if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside; } return inside; }

/* A kind-per-vertex grid from the area polygons (metres, tile-local). */
export function landMask(tile) {
  const n = tile.grid + 1, step = tile.size / tile.grid, mask = new Array(n * n).fill('');
  for (const a of tile.areas || []) {
    const p = a.p.map(v => v / 10); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
    for (let j = Math.max(0, Math.floor(z0 / step)); j <= Math.min(n - 1, Math.ceil(z1 / step)); j++) for (let i = Math.max(0, Math.floor(x0 / step)); i <= Math.min(n - 1, Math.ceil(x1 / step)); i++)
      if (pip(i * step, j * step, p)) mask[j * n + i] = a.k;
  }
  return mask;
}

/* stride 1 = full grid, 2 and 4 = coarser. Skirts hang 40 m below the edge so tiles of different LOD never show a crack. */
export function terrainGeometry(hf, mask, stride) {
  const g = hf.n - 1, m = g / stride | 0, pos = [], col = [], idx = [], step = hf.step;
  const grid = (m + 1) * (m + 1);
  for (let j = 0; j <= m; j++) for (let i = 0; i <= m; i++) {
    const x = i * stride * step, z = j * stride * step, h = hf.at(x, z);
    const dx = hf.at(x + step, z) - hf.at(Math.max(0, x - step), z), dz = hf.at(x, z + step) - hf.at(x, Math.max(0, z - step));
    const slope = Math.hypot(dx, dz) / (2 * step);
    landColor(h, slope, mask[j * stride * hf.n + i * stride], tmp);
    pos.push(x, h, z); col.push(tmp.r, tmp.g, tmp.b);
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const a = j * (m + 1) + i, b = a + 1, c = a + m + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const edge = [];   // skirt: duplicate border vertices lower down
  const add = (i, j) => { const k = j * (m + 1) + i; pos.push(pos[k * 3], pos[k * 3 + 1] - 40, pos[k * 3 + 2]); col.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); return grid + edge.length++; };
  const top = [], bottom = [], left = [], right = [];
  for (let i = 0; i <= m; i++) { top.push(add(i, 0)); bottom.push(add(i, m)); }
  for (let j = 0; j <= m; j++) { left.push(add(0, j)); right.push(add(m, j)); }
  for (let i = 0; i < m; i++) { idx.push(i, top[i], i + 1, i + 1, top[i], top[i + 1]); const o = m * (m + 1); idx.push(o + i + 1, bottom[i], o + i, o + i + 1, bottom[i + 1], bottom[i]); }
  for (let j = 0; j < m; j++) { const a = j * (m + 1), b = (j + 1) * (m + 1); idx.push(a, left[j], b, b, left[j], left[j + 1]); idx.push(b + m, right[j], a + m, b + m, right[j + 1], right[j]); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
