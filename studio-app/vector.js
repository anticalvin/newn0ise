'use strict';

const StudioVector = (() => {
  const k = .552284749831;
  const shapes = {rectangle:'Rectangle',ellipse:'Ellipse',triangle:'Triangle',diamond:'Diamond',
    hexagon:'Hexagon',star:'Star',line:'Line'};

  function outline(shape,width,height) {
    const x = width/2, y = height/2;
    if (shape === 'ellipse') return [[x,0,0,y*k],[0,y,-x*k,0],[-x,0,0,-y*k],[0,-y,x*k,0]];
    if (shape === 'triangle') return [[0,-y],[x,y],[-x,y]].map(p => [...p,0,0]);
    if (shape === 'diamond') return [[0,-y],[x,0],[0,y],[-x,0]].map(p => [...p,0,0]);
    if (shape === 'line') return [[-x,0,0,0],[x,0,0,0]];
    if (shape === 'hexagon' || shape === 'star') {
      const count = shape === 'star' ? 10 : 6;
      return Array.from({length:count},(_,i) => {
        const a = i/count*2*Math.PI-Math.PI/2;
        const r = shape === 'star' && i%2 ? .45 : 1;
        return [Math.cos(a)*x*r,Math.sin(a)*y*r,0,0];
      });
    }
    return [[-x,-y],[x,-y],[x,y],[-x,y]].map(p => [...p,0,0]);
  }

  function stroke(points,pressure,width,o = {}) {
    const result = StudioFreehand.getStroke(points.map(([x,y],i) => [x,y,pressure?.[i] ?? .5]),{
      size:width,thinning:(o.taper ?? 55)/100,smoothing:(o.smooth ?? 58)/100,streamline:.35,simulatePressure:!pressure,last:true
    });
    return result.map(([x,y],i) => {
      const a = result[(i+result.length-1)%result.length], b = result[(i+1)%result.length];
      return [x,y,(b[0]-a[0])/8,(b[1]-a[1])/8];
    });
  }
  return {shapes,outline,stroke};
})();
