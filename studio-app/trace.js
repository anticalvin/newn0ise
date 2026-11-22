'use strict';
/* Turn a bitmap into editable outlines (used for "text to outlines"). Pure maths, no DOM.
   1. contours(): every boundary between inside and outside pixels becomes a closed loop of pixel-corner points (holes included).
   2. simplify(): Douglas-Peucker removes the staircase.
   3. toPoints(): corners stay corners, gentle turns become smooth points with handles, so curves of letters stay curves.
   compound() gives one point list plus the break indices that StudioPath / pathData understand, filled with the even-odd rule so holes work. */
const StudioTrace = (() => {
  function contours(alpha,w,h,level = 127) {
    const inside = (x,y) => x >= 0 && y >= 0 && x < w && y < h && alpha[y*w+x] > level, next = new Map(), key = (x,y) => y*(w+1)+x;
    /* directed edges with the inside on the left; every pixel corner has at most two (four at a pinch, resolved by turning right-most) */
    const out = new Map(); const add = (x0,y0,x1,y1) => { const k = key(x0,y0); (out.get(k) || out.set(k,[]).get(k)).push([x1,y1]); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x,y)) continue;
      if (!inside(x,y-1)) add(x,y,x+1,y); if (!inside(x+1,y)) add(x+1,y,x+1,y+1); if (!inside(x,y+1)) add(x+1,y+1,x,y+1); if (!inside(x-1,y)) add(x,y+1,x,y);
    }
    void next; const loops = [];
    for (const [k,list] of out) {
      while (list.length) {
        const sx = k % (w+1), sy = Math.floor(k/(w+1)); let [cx,cy] = list.pop(); const loop = [[sx,sy]];
        let px = sx,py = sy,guard = 0;
        while ((cx !== sx || cy !== sy) && guard++ < 4e6) {
          loop.push([cx,cy]); const opts = out.get(key(cx,cy)); if (!opts || !opts.length) break;
          const dx = cx-px,dy = cy-py; let pick = opts.length-1;
          if (opts.length > 1) { let bs = -9; opts.forEach((o,i) => { const ex = o[0]-cx,ey = o[1]-cy,sc = -(dx*ey-dy*ex); if (sc > bs) { bs = sc; pick = i; } }); }
          const [nx,ny] = opts.splice(pick,1)[0]; px = cx; py = cy; cx = nx; cy = ny;
        }
        if (loop.length > 3) loops.push(loop);
      }
    }
    return loops;
  }
  function simplify(pts,eps) {
    if (pts.length < 4) return pts;
    const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length-1] = true; const stack = [[0,pts.length-1]];
    while (stack.length) {
      const [a,b] = stack.pop(); let m = 0,mi = -1; const [ax,ay] = pts[a],[bx,by] = pts[b],L = Math.hypot(bx-ax,by-ay) || 1;
      for (let i = a+1; i < b; i++) { const d = Math.abs((bx-ax)*(ay-pts[i][1])-(ax-pts[i][0])*(by-ay))/L; if (d > m) { m = d; mi = i; } }
      if (m > eps && mi > 0) { keep[mi] = true; stack.push([a,mi],[mi,b]); }
    }
    return pts.filter((_,i) => keep[i]);
  }
  /* remove the pixel staircase without rounding real corners: points where the outline turns sharply over a longer reach are pinned, the rest are averaged along their run */
  function deStair(pts,reach = 6,pinAngle = 55,r = 2) {
    const n = pts.length; if (n < reach*3) return pts; const ang = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const a = pts[(i+n-reach)%n],p = pts[i],b = pts[(i+reach)%n],v1 = [p[0]-a[0],p[1]-a[1]],v2 = [b[0]-p[0],b[1]-p[1]],l1 = Math.hypot(...v1),l2 = Math.hypot(...v2);
      if (l1 && l2) ang[i] = Math.acos(Math.max(-1,Math.min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(l1*l2))))*180/Math.PI;
    }
    /* a corner is the sharpest point of its neighbourhood */
    const keep = new Array(n).fill(false);
    for (let i = 0; i < n; i++) { if (ang[i] <= pinAngle) continue; let top = true; for (let d = 1; d <= reach && top; d++) { const l = ang[(i-d+n)%n],rr = ang[(i+d)%n]; if (l > ang[i] || rr >= ang[i]) top = false; } keep[i] = top; }
    return pts.map((p,i) => {
      if (keep[i]) return p; let sx = 0,sy = 0,c = 0;
      for (let d = -r; d <= r; d++) { const k = (i+d+n)%n; if (keep[k] && d !== 0) { if (Math.abs(d) <= 1) { sx += pts[k][0]; sy += pts[k][1]; c++; } continue; } sx += pts[k][0]; sy += pts[k][1]; c++; }
      return [sx/c,sy/c];
    });
  }
  /* closed loop -> editable points. cornerAngle: turns sharper than this (degrees) stay corners. */
  function toPoints(loop,{eps = .9,cornerAngle = 38} = {}) {
    let pts = loop.slice(0,-1).length ? loop.slice() : loop; if (pts.length > 2 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts = pts.slice(0,-1);
    pts = deStair(pts);
        /* a closed loop has no natural start: split it at the point farthest from the first and simplify both halves */
    let far = 0,fd = -1; pts.forEach((p,i) => { const d = Math.hypot(p[0]-pts[0][0],p[1]-pts[0][1]); if (d > fd) { fd = d; far = i; } });
    if (far < 1) return [];
    pts = simplify(pts.slice(0,far+1),eps).slice(0,-1).concat(simplify(pts.slice(far).concat([pts[0]]),eps).slice(0,-1)); const n = pts.length; if (n < 3) return [];
    return pts.map((p,i) => {
      const a = pts[(i+n-1)%n],b = pts[(i+1)%n],v1 = [p[0]-a[0],p[1]-a[1]],v2 = [b[0]-p[0],b[1]-p[1]],l1 = Math.hypot(...v1) || 1,l2 = Math.hypot(...v2) || 1;
      const turn = Math.acos(Math.max(-1,Math.min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(l1*l2))))*180/Math.PI;
      if (turn > cornerAngle || Math.min(l1,l2) < 1.2) return [p[0],p[1],0,0];
      const k = Math.min(l1,l2)/3/Math.hypot(b[0]-a[0],b[1]-a[1]) ; return [p[0],p[1],(b[0]-a[0])*k,(b[1]-a[1])*k];
    });
  }
  /* one points list with break indices; scale/offset map bitmap pixels to layer coordinates */
  function compound(loops,{scale = 1,ox = 0,oy = 0,minArea = 4,...opts} = {}) {
    const points = [],breaks = [];
    for (const loop of loops) {
      let area = 0; for (let i = 0; i < loop.length; i++) { const [x0,y0] = loop[i],[x1,y1] = loop[(i+1)%loop.length]; area += x0*y1-x1*y0; } if (Math.abs(area/2) < minArea) continue;
      const pts = toPoints(loop,opts); if (pts.length < 3) continue; if (points.length) breaks.push(points.length);
      for (const p of pts) points.push([(p[0]-ox)*scale,(p[1]-oy)*scale,p[2]*scale,p[3]*scale]);
    }
    return {points,breaks};
  }
  return {contours,simplify,toPoints,compound};
})();
