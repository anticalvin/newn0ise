'use strict';
/* Studio procedural graph: a small node runtime that composes images from nodes (inputs, generators, filters, blends, feedback) and animates them with number nodes.
   It is separate from how a graph is drawn. Pixels are plain RGBA typed arrays, so the runtime runs (and is tested) without a DOM.
   - Ports are typed: 'image' wires carry pixels, 'number' wires carry one value. Any numeric parameter can be driven by a number node (bind), normalised 0..1 across the parameter's range.
   - Evaluation is demand driven from the output node, in dependency order. Each node caches its result; it is reused until a parameter, a bound number or an input changes.
     Nodes that depend on time (noise speed, time, LFO, video, feedback...) are marked dynamic and re-evaluate every frame, and so do the nodes downstream of them.
   - Feedback is a one-frame delay, not a cycle: its output is the previous frame stored inside the node, so a graph may loop back through it.
   - Errors are kept per node; a failing node outputs nothing and the rest of the graph keeps running. */
const StudioProc = (() => {
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const lerp = (a,b,t) => a+(b-a)*t;
  const hash = (x,y,z,s) => { let h = Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647)^Math.imul(s|0,1013904223); h = Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296; };
  const fade = t => t*t*(3-2*t);
  function vnoise(x,y,z,s) {
    const xi = Math.floor(x),yi = Math.floor(y),zi = Math.floor(z),fx = fade(x-xi),fy = fade(y-yi),fz = fade(z-zi);
    const a = (i,j,k) => hash(xi+i,yi+j,zi+k,s);
    return lerp(lerp(lerp(a(0,0,0),a(1,0,0),fx),lerp(a(0,1,0),a(1,1,0),fx),fy),lerp(lerp(a(0,0,1),a(1,0,1),fx),lerp(a(0,1,1),a(1,1,1),fx),fy),fz);
  }
  const hexRGB = c => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c)); const n = m ? parseInt(m[1],16) : 0xffffff; return [n>>16&255,n>>8&255,n&255]; };
  const frame = (w,h) => new Uint8ClampedArray(w*h*4);
  const luma = (r,g,b) => (.299*r+.587*g+.114*b)/255;

  /* ---- number sources ---- */
  function keyframes(text) {
    const pts = []; for (const part of String(text || '').split(/[;,]/)) { const m = /^\s*(-?[\d.]+)\s*[:=]\s*(-?[\d.]+)\s*$/.exec(part); if (m) pts.push([+m[1],+m[2]]); }
    return pts.sort((a,b) => a[0]-b[0]).slice(0,64);
  }
  function sampleKeys(pts,t,smooth,loop) {
    if (!pts.length) return 0; const end = pts[pts.length-1][0];
    if (loop && end > 0) t = ((t%end)+end)%end;
    if (t <= pts[0][0]) return pts[0][1]; if (t >= end) return pts[pts.length-1][1];
    let i = 1; while (pts[i][0] < t) i++; const a = pts[i-1],b = pts[i]; let u = (t-a[0])/(b[0]-a[0] || 1); if (smooth) u = fade(u); return lerp(a[1],b[1],u);
  }
  const wave = (shape,p,seed) => {
    p = p-Math.floor(p);
    if (shape === 'triangle') return 1-Math.abs(p*2-1);
    if (shape === 'saw') return p;
    if (shape === 'square') return p < .5 ? 1 : 0;
    if (shape === 'noise') return vnoise(p*8,0,0,seed);
    return .5+.5*Math.sin(p*Math.PI*2);
  };

  /* ---- node library ---- */
  const N = (label,group,inputs,params,extra) => ({label,group,inputs,params,...extra});
  const P = {
    num: (k,label,min,max,def,step = .01) => ({k,label,min,max,def,step,t:'num'}),
    sel: (k,label,opts,def) => ({k,label,opts,def,t:'sel'}),
    col: (k,label,def) => ({k,label,def,t:'col'}),
    txt: (k,label,def) => ({k,label,def,t:'txt'}),
    bool: (k,label,def) => ({k,label,def,t:'bool'})
  };
  const NODES = {
    time: N('Time','Modulation',{},[P.num('scale','Speed',-8,8,1),P.num('offset','Offset',-100,100,0,.1),P.num('wrap','Wrap at (s, 0 = never)',0,60,0,.5)],{out:'number',dynamic:true,
      value:(c) => { let v = c.t*c.p.scale+c.p.offset; if (c.p.wrap > 0) v = ((v%c.p.wrap)+c.p.wrap)%c.p.wrap/c.p.wrap; return v; }}),
    lfo: N('Oscillator','Modulation',{},[P.sel('shape','Shape',['sine','triangle','saw','square','noise'],'sine'),P.num('freq','Frequency (Hz)',.05,8,.5,.05),P.num('phase','Phase',0,1,0),P.num('amp','Amount',0,1,.5),P.num('offset','Centre',0,1,.5)],{out:'number',dynamic:true,
      value:(c) => clamp(c.p.offset+(wave(c.p.shape,c.t*c.p.freq+c.p.phase,c.p.seed|0)-.5)*2*c.p.amp,0,1)}),
    keyframe: N('Keyframes','Modulation',{},[P.txt('points','Time:value pairs','0:0, 2:1, 4:0'),P.bool('smooth','Smooth',true),P.bool('loop','Loop',true)],{out:'number',dynamic:true,
      value:(c) => sampleKeys(keyframes(c.p.points),c.t,c.p.smooth,c.p.loop)}),
    map: N('Remap','Modulation',{input:'number'},[P.num('inMin','In min',-10,10,0),P.num('inMax','In max',-10,10,1),P.num('outMin','Out min',-10,10,0),P.num('outMax','Out max',-10,10,1),P.bool('clamp','Clamp',true)],{out:'number',
      value:(c) => { const v = c.num.input ?? 0; let u = (v-c.p.inMin)/((c.p.inMax-c.p.inMin) || 1); if (c.p.clamp) u = clamp(u,0,1); return lerp(c.p.outMin,c.p.outMax,u); }}),

    image: N('Image input','Input',{},[P.txt('layer','Layer id (blank = first image)',''),P.sel('fit','Fit',['cover','contain','stretch'],'cover')],{out:'image',dynamic:false,source:'image'}),
    video: N('Video input','Input',{},[P.txt('layer','Layer id (blank = first video)',''),P.sel('fit','Fit',['cover','contain','stretch'],'cover')],{out:'image',dynamic:true,source:'video'}),
    noise: N('Noise','Generate',{},[P.num('scale','Scale',1,64,8,.5),P.num('octaves','Detail',1,5,3,1),P.num('speed','Speed',0,4,.4,.05),P.num('seed','Seed',0,999,1,1),P.num('contrast','Contrast',0,4,1.4,.05)],{out:'image',
      dynamicIf:p => p.speed > 0,run:(c) => {
        const {w,h,p} = c,o = frame(w,h),z = c.t*p.speed,oct = Math.round(p.octaves),sc = p.scale/Math.max(w,h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let v = 0,a = .5,f = 1,s = 0; for (let k = 0; k < oct; k++) { v += a*vnoise(x*sc*f,y*sc*f,z*f,p.seed+k*17); s += a; a *= .5; f *= 2; }
          v = clamp((v/s-.5)*p.contrast+.5,0,1)*255; const i = (y*w+x)*4; o[i] = o[i+1] = o[i+2] = v; o[i+3] = 255;
        }
        return o; }}),
    pattern: N('Pattern','Generate',{},[P.sel('kind','Pattern',['stripes','checker','grid','dots','rings','gradient'],'stripes'),P.num('scale','Scale',1,64,10,.5),P.num('angle','Angle',0,180,0,1),P.num('soft','Softness',0,1,.1),P.num('speed','Scroll speed',-2,2,0,.05)],{out:'image',
      dynamicIf:p => p.speed !== 0,run:(c) => {
        const {w,h,p} = c,o = frame(w,h),a = p.angle*Math.PI/180,ca = Math.cos(a),sa = Math.sin(a),m = Math.max(w,h),ph = c.t*p.speed,soft = Math.max(.001,p.soft*.5);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const u = ((x-w/2)*ca+(y-h/2)*sa)/m*p.scale+ph,v = (-(x-w/2)*sa+(y-h/2)*ca)/m*p.scale; let t;
          if (p.kind === 'stripes') t = fade(clamp((Math.abs((u%1+1)%1-.5)*2-.5)/soft*.5+.5,0,1));
          else if (p.kind === 'checker') { const k = (Math.floor(u)+Math.floor(v))&1; t = k; }
          else if (p.kind === 'grid') { const gu = Math.abs((u%1+1)%1-.5),gv = Math.abs((v%1+1)%1-.5); t = Math.max(gu,gv) > .45-soft*.2 ? 1 : 0; }
          else if (p.kind === 'dots') { const gu = (u%1+1)%1-.5,gv = (v%1+1)%1-.5; t = 1-fade(clamp((Math.hypot(gu,gv)-.3)/soft+.5,0,1)); }
          else if (p.kind === 'rings') { const r = Math.hypot(x-w/2,y-h/2)/m*p.scale+ph; t = fade(clamp((Math.abs((r%1+1)%1-.5)*2-.5)/soft*.5+.5,0,1)); }
          else t = clamp((u/p.scale+.5),0,1);
          const i = (y*w+x)*4; o[i] = o[i+1] = o[i+2] = t*255; o[i+3] = 255;
        }
        return o; }}),
    shape: N('Shape','Generate',{},[P.sel('kind','Shape',['rectangle','ellipse','triangle','polygon'],'ellipse'),P.num('sides','Sides',3,12,6,1),P.num('x','X',0,1,.5),P.num('y','Y',0,1,.5),P.num('size','Size',.02,1.5,.5),P.num('aspect','Aspect',.2,4,1),P.num('rot','Rotation',0,360,0,1),P.num('soft','Edge softness',0,1,.02),P.col('fill','Fill','#ffffff'),P.col('bg','Background','#000000'),P.bool('transparent','Transparent background',false)],{out:'image',
      run:(c) => {
        const {w,h,p} = c,o = frame(w,h),[fr,fg,fb] = hexRGB(p.fill),[br,bg,bb] = hexRGB(p.bg),r = p.rot*Math.PI/180,cr = Math.cos(r),sr = Math.sin(r),m = Math.min(w,h),soft = Math.max(.002,p.soft*.2);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let dx = (x-p.x*w)/m,dy = (y-p.y*h)/m; const ux = (dx*cr+dy*sr)/(p.size*.5*p.aspect),uy = (-dx*sr+dy*cr)/(p.size*.5); let d;
          if (p.kind === 'rectangle') d = Math.max(Math.abs(ux),Math.abs(uy))-1;
          else if (p.kind === 'ellipse') d = Math.hypot(ux,uy)-1;
          else { const n = p.kind === 'triangle' ? 3 : Math.round(p.sides),ang = Math.atan2(uy,ux)+Math.PI/2,seg = Math.PI*2/n; d = Math.hypot(ux,uy)*Math.cos(((ang%seg)+seg)%seg-seg/2)-Math.cos(seg/2); }
          const k = 1-fade(clamp(d/soft*.5+.5,0,1)),i = (y*w+x)*4;
          o[i] = lerp(br,fr,k); o[i+1] = lerp(bg,fg,k); o[i+2] = lerp(bb,fb,k); o[i+3] = p.transparent ? k*255 : 255;
        }
        return o; }}),

    transform: N('Transform','Modify',{input:'image'},[P.num('x','Move X',-1,1,0),P.num('y','Move Y',-1,1,0),P.num('scale','Scale',.1,4,1),P.num('rot','Rotate',-180,180,0,1),P.sel('edge','Edges',['transparent','repeat','mirror'],'transparent')],{out:'image',
      run:(c) => {
        const {w,h,p} = c,src = c.img.input,o = frame(w,h); if (!src) return o;
        const r = -p.rot*Math.PI/180,cr = Math.cos(r),sr = Math.sin(r),s = 1/p.scale;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let dx = x-w/2-p.x*w/2,dy = y-h/2-p.y*h/2; let sx = (dx*cr-dy*sr)*s+w/2,sy = (dx*sr+dy*cr)*s+h/2;
          if (p.edge === 'repeat') { sx = ((sx%w)+w)%w; sy = ((sy%h)+h)%h; } else if (p.edge === 'mirror') { const mx = ((sx%(2*w))+2*w)%(2*w),my = ((sy%(2*h))+2*h)%(2*h); sx = mx > w ? 2*w-mx : mx; sy = my > h ? 2*h-my : my; }
          if (sx < 0 || sy < 0 || sx > w-1 || sy > h-1) continue;
          const x0 = sx|0,y0 = sy|0,x1 = Math.min(w-1,x0+1),y1 = Math.min(h-1,y0+1),fx = sx-x0,fy = sy-y0,i = (y*w+x)*4;
          for (let ch = 0; ch < 4; ch++) o[i+ch] = lerp(lerp(src[(y0*w+x0)*4+ch],src[(y0*w+x1)*4+ch],fx),lerp(src[(y1*w+x0)*4+ch],src[(y1*w+x1)*4+ch],fx),fy);
        }
        return o; }}),
    color: N('Colour','Modify',{input:'image'},[P.num('bright','Brightness',-1,1,0),P.num('contrast','Contrast',0,3,1),P.num('sat','Saturation',0,3,1),P.num('hue','Hue shift',-180,180,0,1),P.bool('invert','Invert',false)],{out:'image',
      run:(c) => {
        const {w,h,p} = c,src = c.img.input,o = frame(w,h); if (!src) return o; const hr = p.hue*Math.PI/180,ch = Math.cos(hr),sh = Math.sin(hr);
        for (let i = 0; i < w*h*4; i += 4) {
          let r = src[i]/255,g = src[i+1]/255,b = src[i+2]/255;
          if (p.hue) { const nr = r*(.299+.701*ch+.168*sh)+g*(.587-.587*ch+.330*sh)+b*(.114-.114*ch-.497*sh),ng = r*(.299-.299*ch-.328*sh)+g*(.587+.413*ch+.035*sh)+b*(.114-.114*ch+.292*sh),nb = r*(.299-.3*ch+1.25*sh)+g*(.587-.588*ch-1.05*sh)+b*(.114+.886*ch-.203*sh); r = nr; g = ng; b = nb; }
          const l = luma(r*255,g*255,b*255); r = l+(r-l)*p.sat; g = l+(g-l)*p.sat; b = l+(b-l)*p.sat;
          r = (r-.5)*p.contrast+.5+p.bright; g = (g-.5)*p.contrast+.5+p.bright; b = (b-.5)*p.contrast+.5+p.bright;
          if (p.invert) { r = 1-r; g = 1-g; b = 1-b; }
          o[i] = r*255; o[i+1] = g*255; o[i+2] = b*255; o[i+3] = src[i+3];
        }
        return o; }}),
    blur: N('Blur','Modify',{input:'image'},[P.num('radius','Radius (px)',0,40,6,.5)],{out:'image',
      run:(c) => {
        const {w,h} = c,src = c.img.input; if (!src) return frame(w,h); const r = Math.round(c.p.radius); if (r < 1) return new Uint8ClampedArray(src);
        let a = new Float32Array(src),b = new Float32Array(src.length);
        for (let pass = 0; pass < 2; pass++) {                                     /* two box passes approximate a gaussian */
          for (let y = 0; y < h; y++) for (let ch = 0; ch < 4; ch++) { let s = 0; const row = y*w;
            for (let x = -r; x <= r; x++) s += a[(row+clamp(x,0,w-1))*4+ch];
            for (let x = 0; x < w; x++) { b[(row+x)*4+ch] = s/(2*r+1); s += a[(row+clamp(x+r+1,0,w-1))*4+ch]-a[(row+clamp(x-r,0,w-1))*4+ch]; } }
          for (let x = 0; x < w; x++) for (let ch = 0; ch < 4; ch++) { let s = 0;
            for (let y = -r; y <= r; y++) s += b[(clamp(y,0,h-1)*w+x)*4+ch];
            for (let y = 0; y < h; y++) { a[(y*w+x)*4+ch] = s/(2*r+1); s += b[(clamp(y+r+1,0,h-1)*w+x)*4+ch]-b[(clamp(y-r,0,h-1)*w+x)*4+ch]; } }
        }
        return Uint8ClampedArray.from(a); }}),
    threshold: N('Threshold','Modify',{input:'image'},[P.num('level','Level',0,1,.5),P.num('soft','Softness',0,.5,.02),P.bool('invert','Invert',false),P.col('light','Light','#ffffff'),P.col('dark','Dark','#000000')],{out:'image',
      run:(c) => {
        const {w,h,p} = c,src = c.img.input,o = frame(w,h); if (!src) return o; const [lr,lg,lb] = hexRGB(p.light),[dr,dg,db] = hexRGB(p.dark),sf = Math.max(.001,p.soft);
        for (let i = 0; i < w*h*4; i += 4) { let t = fade(clamp((luma(src[i],src[i+1],src[i+2])-p.level)/sf*.5+.5,0,1)); if (p.invert) t = 1-t; o[i] = lerp(dr,lr,t); o[i+1] = lerp(dg,lg,t); o[i+2] = lerp(db,lb,t); o[i+3] = src[i+3]; }
        return o; }}),
    blend: N('Blend','Combine',{a:'image',b:'image'},[P.sel('mode','Mode',['normal','add','multiply','screen','difference','overlay','mix'],'normal'),P.num('amount','Amount',0,1,1)],{out:'image',
      run:(c) => {
        const {w,h,p} = c,A = c.img.a,B = c.img.b; if (!A && !B) return frame(w,h); if (!B) return new Uint8ClampedArray(A); if (!A) return new Uint8ClampedArray(B);
        const o = frame(w,h);
        for (let i = 0; i < w*h*4; i += 4) {
          const ab = B[i+3]/255*p.amount;
          for (let ch = 0; ch < 3; ch++) {
            const a = A[i+ch]/255,b = B[i+ch]/255; let v;
            switch (p.mode) { case 'add': v = Math.min(1,a+b); break; case 'multiply': v = a*b; break; case 'screen': v = 1-(1-a)*(1-b); break; case 'difference': v = Math.abs(a-b); break; case 'overlay': v = a < .5 ? 2*a*b : 1-2*(1-a)*(1-b); break; case 'mix': v = lerp(a,b,.5); break; default: v = b; }
            o[i+ch] = lerp(a,v,ab)*255;
          }
          o[i+3] = Math.max(A[i+3],B[i+3]);
        }
        return o; }}),
    feedback: N('Feedback','Combine',{input:'image'},[P.num('decay','Decay',0,1,.9),P.num('zoom','Zoom per frame',.9,1.1,1.01),P.num('shift','Drift X',-.05,.05,0,.001),P.num('mix','Mix in new',0,1,.5)],{out:'image',dynamic:true,delayed:true,
      run:(c) => {
        const {w,h,p} = c,prev = c.state.prev,cur = c.img.input || c.state.cur,o = frame(w,h);   /* inside a loop the input is last frame's */
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y*w+x)*4; let pr = 0,pg = 0,pb = 0;
          if (prev) { const sx = (x-w/2)/p.zoom+w/2-p.shift*w,sy = (y-h/2)/p.zoom+h/2; if (sx >= 0 && sy >= 0 && sx <= w-1 && sy <= h-1) { const j = ((sy|0)*w+(sx|0))*4; pr = prev[j]*p.decay; pg = prev[j+1]*p.decay; pb = prev[j+2]*p.decay; } }
          const cr = cur ? cur[i] : 0,cg = cur ? cur[i+1] : 0,cb = cur ? cur[i+2] : 0;
          o[i] = Math.max(pr,cr*p.mix+pr*(1-p.mix)); o[i+1] = Math.max(pg,cg*p.mix+pg*(1-p.mix)); o[i+2] = Math.max(pb,cb*p.mix+pb*(1-p.mix)); o[i+3] = 255;
        }
        return o; }}),
    output: N('Output','Output',{input:'image'},[],{out:null})
  };
  const groups = () => { const g = {}; for (const [id,d] of Object.entries(NODES)) if (id !== 'output') (g[d.group] ||= []).push(id); return g; };
  const defaults = type => Object.fromEntries((NODES[type]?.params || []).map(p => [p.k,p.def]));
  const isNum = type => NODES[type]?.out === 'number';

  /* ---- graph model ---- */
  let counter = 0;
  const uid = type => type+'_'+(++counter).toString(36)+Math.floor(Math.random()*1296).toString(36);
  function createNode(type,x = 0,y = 0,id) { if (!NODES[type]) throw Error('Unknown node type: '+type); return {id:id || uid(type),type,x,y,params:defaults(type),bind:{},bypass:false}; }
  function create() { return {version:1,res:480,nodes:[createNode('output',520,120,'output')],edges:[]}; }
  /* is there a path from `from` to `to`? Feedback inputs are one-frame delays, so they never count as dependencies */
  function reaches(g,from,to) {
    const nodes = new Map(g.nodes.map(n => [n.id,n])), seen = new Set(), stack = [from];
    while (stack.length) { const id = stack.pop(); if (id === to) return true; if (seen.has(id)) continue; seen.add(id);
      for (const e of g.edges) if (e.from === id && nodes.get(e.to)?.type !== 'feedback') stack.push(e.to);
      for (const n of g.nodes) if (Object.values(n.bind || {}).includes(id) && !seen.has(n.id)) stack.push(n.id); }
    return false;
  }
  function connection(g,from,to,input) {
    const a = g.nodes.find(n => n.id === from),b = g.nodes.find(n => n.id === to);
    if (!a || !b) return 'Both nodes must exist.'; if (from === to && b.type !== 'feedback') return 'A node cannot connect to itself.';
    const out = NODES[a.type].out,want = NODES[b.type].inputs[input];
    if (!out) return 'The output node has nothing to connect from.'; if (!want) return 'That input does not exist.';
    if (out !== want) return want === 'image' ? 'This input needs an image, not a number.' : 'This input needs a number, not an image.';
    if (b.type !== 'feedback' && reaches(g,to,from)) return 'That would create a loop. Use a Feedback node to loop back one frame at a time.';
    return null;
  }
  function connect(g,from,to,input) { const e = connection(g,from,to,input); if (e) return e; g.edges = g.edges.filter(x => !(x.to === to && x.in === input)); g.edges.push({from,to,in:input}); return null; }
  function bind(g,from,to,param) {
    const a = g.nodes.find(n => n.id === from),b = g.nodes.find(n => n.id === to),def = NODES[b?.type]?.params.find(p => p.k === param);
    if (!a || !b || !def || def.t !== 'num') return 'Only number parameters can be driven by a number node.';
    if (NODES[a.type].out !== 'number') return 'Only number nodes can drive a parameter.'; if (reaches(g,to,from)) return 'That would create a loop.';
    b.bind[param] = from; return null;
  }
  const unbind = (g,to,param) => { const b = g.nodes.find(n => n.id === to); if (b) delete b.bind[param]; };
  function remove(g,id) {
    if (id === 'output') return;
    g.nodes = g.nodes.filter(n => n.id !== id);
    g.edges = g.edges.filter(e => e.from !== id && e.to !== id); for (const n of g.nodes) for (const [k,v] of Object.entries(n.bind || {})) if (v === id) delete n.bind[k];
  }
  function normalize(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges) || raw.nodes.length > 96 || raw.edges.length > 256) throw Error('Unsupported procedural graph.');
    const g = {version:1,res:[240,360,480,720].includes(raw.res) ? raw.res : 480,nodes:[],edges:[]},ids = new Set();
    for (const n of raw.nodes) {
      if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || !NODES[n.type]) throw Error('Invalid procedural node.'); ids.add(n.id);
      const node = createNode(n.type,Number.isFinite(n.x) ? n.x : 0,Number.isFinite(n.y) ? n.y : 0,n.id);
      for (const def of NODES[n.type].params) { const v = n.params?.[def.k]; if (def.t === 'num' && Number.isFinite(v)) node.params[def.k] = clamp(v,def.min,def.max); else if (def.t === 'sel' && def.opts.includes(v)) node.params[def.k] = v; else if (def.t === 'col' && /^#[0-9a-f]{6}$/i.test(v)) node.params[def.k] = v.toLowerCase(); else if (def.t === 'txt' && typeof v === 'string') node.params[def.k] = v.slice(0,400); else if (def.t === 'bool' && typeof v === 'boolean') node.params[def.k] = v; }
      node.bypass = n.bypass === true; g.nodes.push(node);
    }
    if (!g.nodes.some(n => n.id === 'output' && n.type === 'output')) throw Error('This graph has no output node.');
    for (const e of raw.edges) { if (!e || !ids.has(e.from) || !ids.has(e.to) || typeof e.in !== 'string') throw Error('Invalid procedural connection.'); const err = connect(g,e.from,e.to,e.in); if (err) throw Error(err); }
    for (const n of raw.nodes) for (const [k,v] of Object.entries(n.bind || {})) { if (ids.has(v)) { const err = bind(g,v,n.id,k); if (err) throw Error(err); } }
    return g;
  }

  /* ---- runtime ---- */
  class Runtime {
    constructor(graph,opts = {}) { this.setGraph(graph); this.source = opts.source || (() => null); this.cache = new Map(); this.state = new Map(); this.ver = 0; this.stats = {evaluated:0,cached:0}; }
    setGraph(g) { this.graph = g; this.nodes = new Map(g.nodes.map(n => [n.id,n])); this.inc = new Map(); for (const e of g.edges) this.inc.set(e.to+':'+e.in,e.from); }
    reset() { this.cache.clear(); this.state.clear(); }
    /* effective parameters: stored values, with bound number nodes mapped across each parameter's range */
    effective(n,t,numbers) {
      const p = {...n.params};
      for (const [k,from] of Object.entries(n.bind || {})) { const def = NODES[n.type].params.find(d => d.k === k),v = numbers(from); if (def && Number.isFinite(v)) p[k] = lerp(def.min,def.max,clamp(v,0,1)); }
      return p;
    }
    render(t,w,h) {
      const W = Math.max(8,w|0),H = Math.max(8,h|0),errors = new Map(),done = new Map(),visiting = new Set(); this.stats = {evaluated:0,cached:0}; this.errors = errors;
      const dyn = new Map(), numbers = id => { const r = visit(id); return r && r.kind === 'number' ? r.v : 0; };
      const visit = id => {
        if (done.has(id)) return done.get(id); if (visiting.has(id)) return null; const n = this.nodes.get(id); if (!n) return null; visiting.add(id);
        const def = NODES[n.type]; let res = null,dynamic = !!def.dynamic;
        try {
          const img = {},num = {},keys = [];
          for (const input of Object.keys(def.inputs)) {
            const from = this.inc.get(id+':'+input); if (!from) continue;
            const r = visit(from); if (!r) continue; if (def.inputs[input] === 'image') img[input] = r.data; else num[input] = r.v; keys.push(input+'@'+r.ver); dynamic = dynamic || r.dynamic;
          }
          const p = this.effective(n,t,nid => { const r = visit(nid); if (r) { keys.push('b'+nid+'@'+r.ver); dynamic = dynamic || r.dynamic; } return r?.v; });
          if (def.dynamicIf && def.dynamicIf(p)) dynamic = true;
          if (n.bypass) { const first = Object.keys(def.inputs).find(k => img[k]); res = first ? {kind:'image',data:img[first],ver:this.nextVer(),dynamic} : null; }
          else {
            const key = JSON.stringify([p,keys,W,H,dynamic ? t : 0,def.source ? this.source('key',def.source,p.layer) : 0]), hit = this.cache.get(id);
            if (hit && hit.key === key) { if (hit.res) this.stats.cached++; res = hit.res; }
            else {
              if (def.run || def.value || def.source) this.stats.evaluated++; const state = this.state.get(id) || this.state.set(id,{}).get(id);
              if (def.out === 'number') res = {kind:'number',v:def.value({p,t,num}),ver:this.nextVer(),dynamic};
              else if (def.source) { const px = this.source('pixels',def.source,p.layer,W,H,p.fit,t); res = px ? {kind:'image',data:px,ver:this.nextVer(),dynamic} : null; if (!px) throw Error('No '+def.source+' layer to read. Add one to the composition.'); }
              else if (def.run) res = {kind:'image',data:def.run({p,t,w:W,h:H,img,state}),ver:this.nextVer(),dynamic};
              this.cache.set(id,{key,res});
            }
          }
        } catch (e) { errors.set(id,String(e.message || e)); res = null; }
        visiting.delete(id); if (res) res.dynamic = dynamic; done.set(id,res); return res;
      };
      const out = visit('output'),first = this.inc.get('output:input'),final = first ? visit(first) : null;
      /* feedback nodes keep this frame's output (and input, for loops) for the next frame */
      for (const n of this.nodes.values()) if (n.type === 'feedback' && !n.bypass) {
        const from = this.inc.get(n.id+':input'),src = from ? visit(from) : null,st = this.state.get(n.id) || this.state.set(n.id,{}).get(n.id),mine = done.get(n.id);
        if (mine) st.prev = new Uint8ClampedArray(mine.data); if (src && src.kind === 'image') st.cur = new Uint8ClampedArray(src.data);
      }
      void out; return {image:final && final.kind === 'image' ? final.data : null,w:W,h:H,errors,stats:this.stats};
    }
    nextVer() { return ++this.ver; }
  }
  /* starting points */
  /* keep the output node to the right of everything */
  const tidy = g => { const out = g.nodes.find(n => n.id === 'output'); out.x = Math.max(...g.nodes.filter(n => n !== out).map(n => n.x))+230; out.y = 60; return g; };
  const templates0 = {
    'Noise threshold': () => { const g = create(),a = createNode('noise',20,40),b = createNode('threshold',260,40),l = createNode('lfo',20,260); a.params.scale = 6; b.params.level = .5; b.bind.level = l.id; g.nodes.push(a,b,l); connect(g,a.id,b.id,'input'); connect(g,b.id,'output','input'); return g; },
    'Video threshold + noise': () => { const g = create(),v = createNode('video',20,20),t = createNode('threshold',230,20),n = createNode('noise',20,200),bl = createNode('blend',430,100),l = createNode('lfo',230,230);
      n.params.scale = 5; n.params.speed = .5; bl.params.mode = 'difference'; bl.params.amount = .85; t.params.level = .45; t.bind.level = l.id; l.params.freq = .15; l.params.amp = .25; g.nodes.push(v,t,n,bl,l);
      connect(g,v.id,t.id,'input'); connect(g,t.id,bl.id,'a'); connect(g,n.id,bl.id,'b'); connect(g,bl.id,'output','input'); return g; },
    'Feedback trails': () => { const g = create(),s = createNode('shape',20,20),f = createNode('feedback',250,20),l = createNode('lfo',20,260); s.params.size = .18; s.params.soft = .3; s.params.transparent = false; s.bind.x = l.id; l.params.freq = .25; f.params.decay = .93; f.params.zoom = 1.01;
      g.nodes.push(s,f,l); connect(g,s.id,f.id,'input'); connect(g,f.id,'output','input'); return g; },
    'Pattern warp': () => { const g = create(),p = createNode('pattern',20,20),t = createNode('transform',230,20),k = createNode('keyframe',20,240); p.params.kind = 'rings'; p.params.speed = .3; t.params.edge = 'mirror'; k.params.points = '0:0, 3:1, 6:0'; t.bind.rot = k.id; g.nodes.push(p,t,k);
      connect(g,p.id,t.id,'input'); connect(g,t.id,'output','input'); return g; }
  };
  const templates = Object.fromEntries(Object.entries(templates0).map(([k,f]) => [k,() => tidy(f())]));
  return {NODES,groups,defaults,isNum,create,createNode,connect,connection,bind,unbind,remove,normalize,Runtime,templates,keyframes,sampleKeys,hexRGB,vnoise};
})();
