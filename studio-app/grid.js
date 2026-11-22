'use strict';
/* Grid, guides and snap targets for Studio. Pure maths (no DOM) so it can be tested; the app draws what lines() returns and asks snap* for corrections.
   Showing the grid and snapping to it are separate switches. */
const StudioGrid = (() => {
  const KINDS = ['square','columns','baseline','isometric'];
  const clamp = (n,a,b,d) => Number.isFinite(+n) ? Math.max(a,Math.min(b,+n)) : d;
  const defaults = () => ({kind:'square',size:100,subs:1,cols:12,rows:0,baseline:24,opacity:24,show:false,snapGrid:false,snapGuides:true,guides:[]});
  function normalize(raw) {
    const c = {...defaults(),...(raw && typeof raw === 'object' ? raw : {})};
    c.kind = KINDS.includes(c.kind) ? c.kind : 'square';
    c.size = clamp(c.size,4,2000,100); c.subs = Math.round(clamp(c.subs,1,16,1)); c.cols = Math.round(clamp(c.cols,1,64,12)); c.rows = Math.round(clamp(c.rows,0,64,0));
    c.baseline = clamp(c.baseline,2,400,24); c.opacity = clamp(c.opacity,2,100,24);
    c.show = c.show === true; c.snapGrid = c.snapGrid === true; c.snapGuides = c.snapGuides !== false;
    c.guides = (Array.isArray(c.guides) ? c.guides : []).filter(g => g && (g.axis === 'x' || g.axis === 'y') && Number.isFinite(+g.at)).slice(0,64).map(g => ({axis:g.axis,at:+g.at}));
    return c;
  }
  /* positions of grid lines along one axis; major lines are the spacing, minor ones its subdivisions */
  const ticks = (length,step,subs) => { const major = [],minor = [],n = step/subs; for (let v = 0; v <= length+1e-6; v += n) (Math.abs(v/step-Math.round(v/step)) < 1e-6 ? major : minor).push(+v.toFixed(4)); return {major,minor}; };
  /* drawing paths for the overlay: {major, minor} SVG path data */
  function lines(cfg,w,h) {
    const c = normalize(cfg), maj = [],min = [], H = (y,a) => a.push(`M 0 ${y} H ${w}`), V = (x,a) => a.push(`M ${x} 0 V ${h}`);
    if (c.kind === 'square') { const tx = ticks(w,c.size,c.subs),ty = ticks(h,c.size,c.subs); tx.major.forEach(x => V(x,maj)); tx.minor.forEach(x => V(x,min)); ty.major.forEach(y => H(y,maj)); ty.minor.forEach(y => H(y,min)); }
    else if (c.kind === 'columns') { for (let i = 0; i <= c.cols; i++) V(+(w*i/c.cols).toFixed(3),maj); if (c.rows) for (let j = 0; j <= c.rows; j++) H(+(h*j/c.rows).toFixed(3),maj); }
    else if (c.kind === 'baseline') { const t = ticks(h,c.baseline*1,1); t.major.forEach(y => H(y,min)); for (let y = 0; y <= h+1e-6; y += c.baseline*4) H(y,maj); }
    else { /* isometric: vertical lines plus two families at 30 degrees, spacing c.size along the vertical */
      const dx = c.size*Math.sqrt(3)/2, slope = Math.tan(Math.PI/6);
      for (let x = 0; x <= w+1e-6; x += dx) V(+x.toFixed(3),maj);
      for (let y0 = -w*slope; y0 <= h+1e-6; y0 += c.size) { min.push(`M 0 ${+y0.toFixed(3)} L ${w} ${+(y0+w*slope).toFixed(3)}`); }
      for (let y0 = 0; y0 <= h+w*slope+1e-6; y0 += c.size) { min.push(`M 0 ${+y0.toFixed(3)} L ${w} ${+(y0-w*slope).toFixed(3)}`); }
    }
    return {major:maj.join(' '),minor:min.join(' ')};
  }
  /* coordinates a point may snap to on each axis, per grid kind (isometric snaps to the lattice of vertical lines and horizontal steps) */
  function targets(cfg,w,h) {
    const c = normalize(cfg), xs = [],ys = [];
    if (c.kind === 'square') { const n = c.size/c.subs; for (let v = 0; v <= w+1e-6; v += n) xs.push(v); for (let v = 0; v <= h+1e-6; v += n) ys.push(v); }
    else if (c.kind === 'columns') { for (let i = 0; i <= c.cols; i++) xs.push(w*i/c.cols); if (c.rows) for (let j = 0; j <= c.rows; j++) ys.push(h*j/c.rows); }
    else if (c.kind === 'baseline') { for (let v = 0; v <= h+1e-6; v += c.baseline) ys.push(v); }
    else { const dx = c.size*Math.sqrt(3)/2; for (let v = 0; v <= w+1e-6; v += dx) xs.push(v); for (let v = 0; v <= h+1e-6; v += c.size/2) ys.push(v); }
    return {xs,ys};
  }
  const guideTargets = cfg => { const c = normalize(cfg); return {xs:c.guides.filter(g => g.axis === 'x').map(g => g.at),ys:c.guides.filter(g => g.axis === 'y').map(g => g.at)}; };
  /* nearest target to value within tol, or null */
  function nearest(value,list,tol) { let best = null; for (const t of list) { const d = t-value; if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d; } return best; }
  /* snap a point: guides win over the grid when both are in range. Returns the corrected point and what it snapped to. */
  function snapPoint(cfg,p,w,h,tol) {
    const c = normalize(cfg), out = {x:p.x,y:p.y,on:[]}, g = c.snapGuides ? guideTargets(c) : {xs:[],ys:[]}, t = c.snapGrid ? targets(c,w,h) : {xs:[],ys:[]};
    for (const [axis,list,tl] of [['x',g.xs,t.xs],['y',g.ys,t.ys]]) {
      const a = nearest(p[axis],list,tol), b = a === null ? nearest(p[axis],tl,tol) : null, d = a ?? b;
      if (d !== null) { out[axis] = p[axis]+d; out.on.push(a !== null ? 'guide' : 'grid'); }
    }
    return out;
  }
  /* shift to apply to a moving box (left/right/top/bottom) so an edge or the centre lands on a guide or grid line; {x, y} deltas */
  function snapBox(cfg,box,w,h,tol) {
    const c = normalize(cfg), g = c.snapGuides ? guideTargets(c) : {xs:[],ys:[]}, t = c.snapGrid ? targets(c,w,h) : {xs:[],ys:[]};
    const pick = (marks,lists) => { let best = null; for (const list of lists) for (const m of marks) { const d = nearest(m,list,tol); if (d !== null && (best === null || Math.abs(d) < Math.abs(best))) best = d; if (best !== null) { /* prefer the first list (guides) when it hit */ } } return best; };
    const gx = pick([box.left,(box.left+box.right)/2,box.right],[g.xs]), gy = pick([box.top,(box.top+box.bottom)/2,box.bottom],[g.ys]);
    const tx = gx ?? pick([box.left,box.right],[t.xs]), ty = gy ?? pick([box.top,box.bottom],[t.ys]);
    return {x:tx ?? 0,y:ty ?? 0,snappedX:tx !== null,snappedY:ty !== null};
  }
  return {KINDS,defaults,normalize,lines,targets,nearest,snapPoint,snapBox,ticks};
})();
