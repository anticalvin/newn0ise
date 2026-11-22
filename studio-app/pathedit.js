'use strict';
/* Path node editing for Studio paths. One path model: a point is [x, y, dx, dy] or [x, y, dx, dy, ix, iy].
   (dx, dy) is the outgoing handle relative to the anchor. With four numbers the incoming handle is its mirror, which is a smooth point and is how every older project is stored.
   Six numbers set the incoming handle (ix, iy) on its own: a broken or corner point. [x, y, 0, 0] has no handles at all, a plain corner. */
const StudioPath = (() => {
  const lerp = (a,b,t) => a+(b-a)*t;
  const outOf = p => [p[2] || 0,p[3] || 0];
  const inOf = p => p.length >= 6 ? [p[4] || 0,p[5] || 0] : [-(p[2] || 0),-(p[3] || 0)];
  /* four numbers when the handles mirror each other, six when they do not */
  function make(x,y,out,inn) {
    const mirrored = Math.abs(inn[0]+out[0]) < 1e-9 && Math.abs(inn[1]+out[1]) < 1e-9;
    return mirrored ? [x,y,out[0],out[1]] : [x,y,out[0],out[1],inn[0],inn[1]];
  }
  const hasHandles = p => !!((p[2] || 0) || (p[3] || 0) || (p.length >= 6 && ((p[4] || 0) || (p[5] || 0))));
  const isSmooth = p => p.length < 6 && hasHandles(p);
  const clone = points => points.map(p => [...p]);
  const segmentCount = (points,closed) => closed ? points.length : points.length-1;

  function bezier(a,b,t) {
    const o = outOf(a), i = inOf(b), p0 = [a[0],a[1]], p1 = [a[0]+o[0],a[1]+o[1]], p2 = [b[0]+i[0],b[1]+i[1]], p3 = [b[0],b[1]], u = 1-t;
    return [u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]];
  }
  /* closest point on the outline to p (local coordinates): {seg, t, point, dist} */
  function nearest(points,closed,p,steps = 32) {
    let best = null;
    for (let s = 0; s < segmentCount(points,closed); s++) {
      const a = points[s], b = points[(s+1)%points.length];
      for (let k = 0; k <= steps; k++) {
        const t = k/steps, q = bezier(a,b,t), d = Math.hypot(q[0]-p.x,q[1]-p.y);
        if (!best || d < best.dist) best = {seg:s,t,point:q,dist:d};
      }
    }
    if (best) {                                   /* refine around the best sample so the new anchor lands under the pointer */
      const a = points[best.seg], b = points[(best.seg+1)%points.length], span = 1/steps;
      for (let k = -16; k <= 16; k++) {
        const t = Math.max(0,Math.min(1,best.t+k/16*span)), q = bezier(a,b,t), d = Math.hypot(q[0]-p.x,q[1]-p.y);
        if (d < best.dist) best = {seg:best.seg,t,point:q,dist:d};
      }
    }
    return best;
  }
  /* insert an anchor on segment seg at parameter t without changing the curve (de Casteljau) */
  function split(points,closed,seg,t) {
    const out = clone(points), a = out[seg], bi = (seg+1)%out.length, b = out[bi];
    const o = outOf(a), i = inOf(b);
    const p0 = [a[0],a[1]], p1 = [a[0]+o[0],a[1]+o[1]], p2 = [b[0]+i[0],b[1]+i[1]], p3 = [b[0],b[1]];
    const m = (u,v) => [lerp(u[0],v[0],t),lerp(u[1],v[1],t)];
    const q0 = m(p0,p1), q1 = m(p1,p2), q2 = m(p2,p3), r0 = m(q0,q1), r1 = m(q1,q2), s = m(r0,r1);
    out[seg] = make(a[0],a[1],[q0[0]-p0[0],q0[1]-p0[1]],inOf(a));
    out[bi] = make(b[0],b[1],outOf(b),[q2[0]-p3[0],q2[1]-p3[1]]);
    out.splice(seg+1,0,make(s[0],s[1],[r1[0]-s[0],r1[1]-s[1]],[r0[0]-s[0],r0[1]-s[1]]));
    return {points:out,index:seg+1};
  }
  function removeAt(points,closed,index) {
    if (points.length <= (closed ? 3 : 2) || index < 0 || index >= points.length) return null;
    return points.filter((_,i) => i !== index).map(p => [...p]);
  }
  function toCorner(points,index) { const out = clone(points), p = out[index]; out[index] = [p[0],p[1],0,0]; return out; }
  /* a smooth point takes its direction from its neighbours, with handles a third of the way to each */
  function toSmooth(points,closed,index) {
    const out = clone(points), n = out.length, p = out[index];
    const prev = out[closed ? (index+n-1)%n : Math.max(0,index-1)], next = out[closed ? (index+1)%n : Math.min(n-1,index+1)];
    let dx = (next[0]-prev[0])/6, dy = (next[1]-prev[1])/6;
    if (!dx && !dy) dx = 20;
    out[index] = [p[0],p[1],dx,dy];
    return out;
  }
  /* move one handle. Mirrored points stay mirrored; with breakAxis (Alt) the other handle stays where it is. */
  function setHandle(points,index,which,rel,breakAxis) {
    const out = clone(points), p = out[index], o = outOf(p), i = inOf(p);
    const next = which === 'out' ? make(p[0],p[1],rel,breakAxis ? i : [-rel[0],-rel[1]]) : make(p[0],p[1],breakAxis ? o : [-rel[0],-rel[1]],rel);
    out[index] = next;
    return out;
  }
  return {outOf,inOf,make,hasHandles,isSmooth,bezier,nearest,split,removeAt,toCorner,toSmooth,setHandle,segmentCount};
})();
