'use strict';
/* Studio viewport maths, kept free of the DOM so it can be tested. A viewport is {zoom, pan:{x,y}, fitted}.
   "Viewport lock" freezes whatever transform is on screen: wheel, trackpad pinch, touch pinch and pan are all ignored until you unlock.
   Fit is the one explicit exception: it recomputes the fitted transform and the lock stays on. */
const StudioViewport = (() => {
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  /* the fitted transform for an artboard of w x h inside a stage of sw x sh (the artboard fills the stage when their ratios match) */
  function fitTransform(w,h,sw,sh) {
    const flush = Math.abs((w/h)/(sw/sh)-1) < .03;
    const zoom = flush ? Math.max(.01,Math.min(sw/w,sh/h)) : Math.max(.01,Math.min((sw-30)/w,(sh-66)/h,1));
    return {zoom,pan:{x:0,y:flush ? 0 : -18},flush};
  }
  const create = (locked = false) => ({zoom:1,pan:{x:0,y:0},fitted:true,locked:!!locked,blocked:0});
  /* every input path asks here first; false means the lock swallowed it */
  function allow(v,kind) { if (!v.locked) return true; v.blocked++; return false; }
  /* zoom about a screen point; returns the new viewport, or the same one when locked */
  function zoomAbout(v,{x,y,stage,w,h,value,anchorLocked}) {
    if (v.locked) { v.blocked++; return v; }
    const r = stage, px = (x-(r.left+r.width/2)-v.pan.x)/v.zoom+w/2, py = (y-(r.top+r.height/2)-v.pan.y)/v.zoom+h/2;
    const zoom = clamp(value,Math.min(.05,v.zoom),4);
    return {...v,zoom,fitted:false,pan:{x:x-r.left-r.width/2-(px-w/2)*zoom,y:y-r.top-r.height/2-(py-h/2)*zoom}};
  }
  return {clamp,fitTransform,create,allow,zoomAbout};
})();
