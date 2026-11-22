'use strict';
/* Timeline view maths for Studio Motion (no DOM, so it can be tested). pps = pixels per second.
   Limits come from the sequence length and the visible width, so a 10 minute sequence can be zoomed out to fit and a 2 second one can be zoomed in far enough to place single frames. */
const StudioTimelineView = (() => {
  const PAD = 60;                                   /* room after the end mark */
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const fitPps = (duration,width) => Math.max(.02,(Math.max(width,120)-PAD)/Math.max(duration,.1));
  /* zoom out to at most half of "fit" (so the whole sequence always fits with room to spare); zoom in to at least 400, or 8 frames per 100 px, whichever is larger */
  function limits(duration,width,fps = 30) {
    const fit = fitPps(duration,width);
    return {min:Math.min(fit*.5,8),max:Math.max(400,fps*40),fit};
  }
  /* keep the time under a screen point fixed while zooming: returns {pps, scrollLeft} */
  function zoomAround(view,factor,anchorPx,lim) {
    const pps = clamp(view.pps*factor,lim.min,lim.max), t = (view.scrollLeft+anchorPx)/view.pps;
    return {pps,scrollLeft:Math.max(0,t*pps-anchorPx)};
  }
  /* show [start, end] seconds across the visible width with a little margin; short ranges are not zoomed past the limit */
  function fitRange(start,end,width,lim,margin = .08) {
    const span = Math.max(end-start,.05), usable = Math.max(width,120)*(1-margin*2);
    const pps = clamp(usable/span,lim.min,lim.max), scrollLeft = Math.max(0,start*pps-width*margin);
    return {pps,scrollLeft};
  }
  const fitSequence = (duration,width,lim) => ({pps:clamp(fitPps(duration,width),lim.min,lim.max),scrollLeft:0});
  /* a pinch: finger distance ratio, anchored at the midpoint */
  const pinch = (view,startDist,dist,midPx,lim,base) => zoomAround({pps:base.pps,scrollLeft:base.scrollLeft},dist/Math.max(startDist,1),midPx,lim);
  /* where the playhead should be kept while playing, so zoom and scroll stay predictable: scroll only when it leaves the visible window */
  function followPlayhead(view,t,width,margin = 40) {
    const px = t*view.pps;
    if (px > view.scrollLeft+width-margin || px < view.scrollLeft) return Math.max(0,px-margin);
    return view.scrollLeft;
  }
  return {PAD,clamp,fitPps,limits,zoomAround,fitRange,fitSequence,pinch,followPlayhead};
})();
