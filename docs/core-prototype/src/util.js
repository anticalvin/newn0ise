// Small math + deterministic noise helpers (no dependencies).
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Seeded gradient noise. Returns { n2, fbm } with outputs roughly in [-1, 1].
export function makeNoise(seed) {
  const rnd = mulberry32(seed), perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const P = new Uint8Array(512); for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const G = Array.from({ length: 256 }, () => { const a = rnd() * 6.2831853; return [Math.cos(a), Math.sin(a)]; });
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const g = (i, j, dx, dy) => { const v = G[P[P[X + i] + Y + j]]; return v[0] * dx + v[1] * dy; };
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(g(0, 0, xf, yf), g(1, 0, xf - 1, yf), u), lerp(g(0, 1, xf, yf - 1), g(1, 1, xf - 1, yf - 1), u), v) * 1.4142;
  }
  function fbm(x, y, o = 4, l = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < o; i++) { s += a * n2(x * f, y * f); n += a; a *= gain; f *= l; }
    return s / n;
  }
  return { n2, fbm };
}
export async function zip(u8) {
  if (typeof CompressionStream === 'undefined') return { z: 0, d: b64(u8) };
  const cs = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'));
  return { z: 1, d: b64(new Uint8Array(await new Response(cs).arrayBuffer())) };
}
export async function unzip(o) {
  const u8 = unb64(o.d); if (!o.z) return u8;
  const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}
export function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
export function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
