'use strict';

const StudioSnap = (() => {
  const translate = (box,x,y) => ({left:box.left+x,right:box.right+x,top:box.top+y,bottom:box.bottom+y});
  function union(boxes) {
    if (!boxes.length) return null;
    return boxes.reduce((a,b) => ({
      left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),
      top:Math.min(a.top,b.top),bottom:Math.max(a.bottom,b.bottom)
    }));
  }

  function axis(box, objects, board, start, end, crossStart, crossEnd, tolerance) {
    const landmarks = b => [b[start],(b[start]+b[end])/2,b[end]];
    const moving = landmarks(box);
    let best = null;
    function consider(delta, guide) {
      if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta)-0.001)) {
        best = {delta,guide};
      }
    }
    for (const target of [board,...objects]) {
      const from = Math.min(box[crossStart],target[crossStart]);
      const to = Math.max(box[crossEnd],target[crossEnd]);
      for (const at of landmarks(target)) {
        for (const value of moving) consider(at-value,{at,from,to});
      }
    }
    const neighbors = objects.filter(b => b[crossEnd] >= box[crossStart] && b[crossStart] <= box[crossEnd]);
    const before = neighbors.filter(b => b[end] <= box[start]+tolerance).sort((a,b) => b[end]-a[end])[0];
    const after = neighbors.filter(b => b[start] >= box[end]-tolerance).sort((a,b) => a[start]-b[start])[0];
    if (before && after) {
      const gap = (after[start]-before[end]-(box[end]-box[start]))/2;
      if (gap > 0) {
        const delta = before[end]+gap-box[start];
        const at = (box[crossStart]+box[crossEnd])/2;
        consider(delta,{at,gap,ranges:[[before[end],before[end]+gap],[after[start]-gap,after[start]]]});
      }
    }
    return best;
  }

  function move(box, objects, width, height, zoom) {
    const board = {left:0,right:width,top:0,bottom:height};
    const tolerance = 6/zoom;
    const x = axis(box,objects,board,'left','right','top','bottom',tolerance);
    const y = axis(box,objects,board,'top','bottom','left','right',tolerance);
    return {
      x:x?.delta ?? 0,y:y?.delta ?? 0,
      guides:[x && {axis:'x',...x.guide},y && {axis:'y',...y.guide}].filter(Boolean)
    };
  }
  return {translate,union,move};
})();
