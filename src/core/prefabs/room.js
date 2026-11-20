// Room geometry with real openings. Pure maths (no three.js): returns local-space boxes {c:[x,y,z], h:[hx,hy,hz], kind} that the renderer draws and Rapier uses as colliders.
// Local frame: origin at the centre of the floor's top face, +y up. Walls are named by the side they face: s = +z (front), n = -z, e = +x, w = -x.
// Mirrors the semantics of the .n0world `room` prefab (src/world-schema.js) -- width, depth, height, wall thickness, openings per wall -- but is standalone,
// so Core does not pull Studio's UI-bound world builder in.
export const WALLS = ['n', 's', 'e', 'w'];

/* one wall of `len` metres along its own axis, centred at 0, as boxes in wall space (x along the wall, y up, z through the thickness).
   openings: [{offset, width, sill, top, kind}] (offset = centre along the wall; sill 0 = a doorway) */
export function wallBoxes(len, height, thick, openings = []) {
  const ops = openings.map(o => ({ ...o, a: Math.max(-len / 2, o.offset - o.width / 2), b: Math.min(len / 2, o.offset + o.width / 2), sill: o.sill || 0, top: Math.min(height, o.top == null ? height : o.top) })).filter(o => o.b > o.a).sort((p, q) => p.a - q.a);
  const out = []; let x = -len / 2;
  const box = (x0, x1, y0, y1, kind) => { if (x1 - x0 > 1e-4 && y1 - y0 > 1e-4) out.push({ c: [(x0 + x1) / 2, (y0 + y1) / 2, 0], h: [(x1 - x0) / 2, (y1 - y0) / 2, thick / 2], kind }); };
  for (const o of ops) {
    box(x, o.a, 0, height, 'wall');
    box(o.a, o.b, 0, o.sill, 'sill'); box(o.a, o.b, o.top, height, 'lintel');
    x = Math.max(x, o.b);
  }
  box(x, len / 2, 0, height, 'wall');
  return out;
}

/* {width, depth, height, wall, floor, ceiling, openings:{n:[],s:[],e:[],w:[]}} -> local boxes. Walls sit inside the footprint so width/depth are outer sizes. */
export function buildRoom(p) {
  const W = p.width, D = p.depth, H = p.height, t = p.wall, boxes = [], op = p.openings || {};
  if (p.floor !== false) boxes.push({ c: [0, -0.05, 0], h: [W / 2, 0.05, D / 2], kind: 'floor' });
  if (p.ceiling) boxes.push({ c: [0, H + 0.05, 0], h: [W / 2 + t, 0.05, D / 2 + t], kind: 'ceiling' });
  const place = (list, f) => list.forEach(b => boxes.push(f(b)));
  place(wallBoxes(W, H, t, op.s), b => ({ c: [b.c[0], b.c[1], D / 2 - t / 2], h: b.h, kind: b.kind }));
  place(wallBoxes(W, H, t, op.n), b => ({ c: [b.c[0], b.c[1], -D / 2 + t / 2], h: b.h, kind: b.kind }));
  place(wallBoxes(D - 2 * t, H, t, op.e), b => ({ c: [W / 2 - t / 2, b.c[1], b.c[0]], h: [b.h[2], b.h[1], b.h[0]], kind: b.kind }));
  place(wallBoxes(D - 2 * t, H, t, op.w), b => ({ c: [-W / 2 + t / 2, b.c[1], b.c[0]], h: [b.h[2], b.h[1], b.h[0]], kind: b.kind }));
  return boxes;
}

// axis-aligned overlap of two local boxes (used by the layout checks and tests)
export const overlaps = (a, b, pad = 0) => [0, 1, 2].every(i => Math.abs(a.c[i] - b.c[i]) < a.h[i] + b.h[i] + pad);
