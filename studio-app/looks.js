'use strict';
/* Looks: filters, 3D LUTs (.cube) and a code stage that can sit over any layer.
   A look is plain JSON on layer.look, so a person or an AI can read and write it:
   {preset, amount, brightness, contrast, saturate, hue, lut:{name,cube}, code}
   Order: preset + adjustments -> LUT -> code, then mixed with the original by amount. */
const StudioLooks = (() => {
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const presets = {
    none:['None',''],
    film:['Film','contrast(1.08) saturate(.9) sepia(.15) brightness(1.02)'],
    mono:['Mono','grayscale(1) contrast(1.1)'],
    noir:['Noir','grayscale(1) contrast(1.5) brightness(.9)'],
    warm:['Warm','sepia(.25) saturate(1.2) hue-rotate(-8deg)'],
    cool:['Cool','saturate(1.1) hue-rotate(12deg) brightness(1.02)'],
    fade:['Fade','contrast(.85) brightness(1.1) saturate(.8)'],
    vivid:['Vivid','saturate(1.6) contrast(1.1)'],
    sepia:['Sepia','sepia(1)'],
    invert:['Invert','invert(1)']
  };
  const blank = () => ({preset:'none',amount:100,brightness:100,contrast:100,saturate:100,hue:0});
  const num = (v,d,a,b) => Number.isFinite(v) ? clamp(v,a,b) : d;
  const normalize = raw => {
    if (!raw || typeof raw !== 'object') return null;
    const l = {preset:Object.hasOwn(presets,raw.preset) ? raw.preset : 'none',amount:num(raw.amount,100,0,100),
      brightness:num(raw.brightness,100,0,300),contrast:num(raw.contrast,100,0,300),saturate:num(raw.saturate,100,0,400),hue:num(raw.hue,0,-360,360)};
    if (raw.lut && typeof raw.lut.cube === 'string' && raw.lut.cube.length < 3e6) l.lut = {name:String(raw.lut.name || 'LUT').slice(0,80),cube:raw.lut.cube};
    if (typeof raw.code === 'string' && raw.code.trim()) l.code = raw.code.slice(0,20000);
    return isPlain(l) ? null : l;
  };
  const isPlain = l => l.preset === 'none' && l.brightness === 100 && l.contrast === 100 && l.saturate === 100 && !l.hue && !l.lut && !l.code;
  const filterString = l => [presets[l.preset]?.[1],l.brightness !== 100 && `brightness(${l.brightness/100})`,l.contrast !== 100 && `contrast(${l.contrast/100})`,
    l.saturate !== 100 && `saturate(${l.saturate/100})`,l.hue && `hue-rotate(${l.hue}deg)`].filter(Boolean).join(' ');

  /* ---- colour matrix (for browsers without canvas filter, and whenever a LUT or code needs the pixels) ---- */
  const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0];
  const mul = (a,b) => { /* apply a, then b (3x4 affine) */
    const r = [];
    for (let i=0;i<3;i++) { for (let j=0;j<3;j++) r.push(b[i*4]*a[j]+b[i*4+1]*a[4+j]+b[i*4+2]*a[8+j]); r.push(b[i*4]*a[3]+b[i*4+1]*a[7]+b[i*4+2]*a[11]+b[i*4+3]); }
    return r;
  };
  const op = {
    brightness:v => [v,0,0,0, 0,v,0,0, 0,0,v,0],
    contrast:v => [v,0,0,.5-.5*v, 0,v,0,.5-.5*v, 0,0,v,.5-.5*v],
    saturate:s => [.213+.787*s,.715-.715*s,.072-.072*s,0, .213-.213*s,.715+.285*s,.072-.072*s,0, .213-.213*s,.715-.715*s,.072+.928*s,0],
    hue:d => { const a = d*Math.PI/180, c = Math.cos(a), s = Math.sin(a);
      return [.213+c*.787-s*.213,.715-c*.715-s*.715,.072-c*.072+s*.928,0, .213-c*.213+s*.143,.715+c*.285+s*.140,.072-c*.072-s*.283,0, .213-c*.213-s*.787,.715-c*.715+s*.715,.072+c*.928+s*.072,0]; },
    grayscale:g => op.saturate(1-g),
    sepia:g => { const k = 1-g; return [.393+.607*k,.769-.769*k,.189-.189*k,0, .349-.349*k,.686+.314*k,.168-.168*k,0, .272-.272*k,.534-.534*k,.131+.869*k,0]; },
    invert:g => [1-2*g,0,0,g, 0,1-2*g,0,g, 0,0,1-2*g,g]
  };
  const matrix = l => {
    let m = I();
    const css = filterString(l), re = /(\w+(?:-\w+)?)\(([-\d.]+)(?:deg)?\)/g;
    let hit;
    while ((hit = re.exec(css))) { const n = hit[1] === 'hue-rotate' ? 'hue' : hit[1]; if (op[n]) m = mul(m,op[n](+hit[2])); }
    return m;
  };

  /* ---- .cube 3D LUT ---- */
  const cubes = new Map();
  function parseCube(text) {
    let n = 0; const out = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line[0] === '#') continue;
      const w = line.split(/\s+/);
      if (w[0] === 'LUT_3D_SIZE') n = +w[1];
      else if (w[0] === 'LUT_1D_SIZE') throw new Error('Only 3D .cube LUTs are supported.');
      else if (/^[-\d.]/.test(w[0]) && w.length >= 3) out.push(+w[0],+w[1],+w[2]);
    }
    if (!(n >= 2 && n <= 129) || out.length !== n*n*n*3 || out.some(Number.isNaN)) throw new Error('This .cube file is not a valid 3D LUT.');
    return {n,data:Float32Array.from(out)};
  }
  const cube = text => { let c = cubes.get(text); if (!c) { c = parseCube(text); if (cubes.size > 6) cubes.clear(); cubes.set(text,c); } return c; };
  function sample(c,r,g,b,o) {
    const n = c.n, d = c.data, m = n-1;
    const x = clamp(r,0,1)*m, y = clamp(g,0,1)*m, z = clamp(b,0,1)*m;
    const x0 = Math.min(m-1,x|0), y0 = Math.min(m-1,y|0), z0 = Math.min(m-1,z|0), fx = x-x0, fy = y-y0, fz = z-z0;
    for (let k=0;k<3;k++) {
      const at = (i,j,l) => d[((l*n+j)*n+i)*3+k];
      const c00 = at(x0,y0,z0)*(1-fx)+at(x0+1,y0,z0)*fx, c10 = at(x0,y0+1,z0)*(1-fx)+at(x0+1,y0+1,z0)*fx;
      const c01 = at(x0,y0,z0+1)*(1-fx)+at(x0+1,y0,z0+1)*fx, c11 = at(x0,y0+1,z0+1)*(1-fx)+at(x0+1,y0+1,z0+1)*fx;
      o[k] = (c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz;
    }
  }

  /* ---- code stage: function body for (r,g,b,a,x,y,t,w,h), values 0 to 1, returns [r,g,b] or [r,g,b,a] ---- */
  const trusted = new Set(), fns = new Map();
  const status = {error:''};
  function compile(code) {
    if (fns.has(code)) return fns.get(code);
    let f = null;
    try { f = new Function('r','g','b','a','x','y','t','w','h',code); status.error = ''; }
    catch (e) { status.error = String(e.message || e); }
    if (fns.size > 20) fns.clear();
    fns.set(code,f);
    return f;
  }
  const codeLive = l => !!l.code && trusted.has(l.code);

  let scratch = null;
  const canFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
  function apply(src,l,w,h,t = 0) {
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width !== w) scratch.width = w;
    if (scratch.height !== h) scratch.height = h;
    const ctx = scratch.getContext('2d',{willReadFrequently:!!(l.lut || codeLive(l)) || !canFilter});
    ctx.clearRect(0,0,w,h);
    const amount = l.amount/100, usesPixels = !!l.lut || codeLive(l) || !canFilter;
    if (!usesPixels) {
      ctx.globalAlpha = 1;
      if (amount < 1) ctx.drawImage(src,0,0);
      ctx.filter = filterString(l) || 'none';
      ctx.globalAlpha = amount;
      ctx.drawImage(src,0,0);
      ctx.filter = 'none'; ctx.globalAlpha = 1;
      return scratch;
    }
    ctx.drawImage(src,0,0);
    const img = ctx.getImageData(0,0,w,h), px = img.data, m = matrix(l), plain = filterString(l) === '';
    const c = l.lut ? (() => { try { return cube(l.lut.cube); } catch { return null; } })() : null;
    const f = codeLive(l) ? compile(l.code) : null;
    const o = [0,0,0];
    let broken = false;
    for (let i=0,p=0;i<px.length;i+=4,p++) {
      if (!px[i+3]) continue;
      let r = px[i]/255, g = px[i+1]/255, b = px[i+2]/255, a = px[i+3]/255;
      const r0 = r, g0 = g, b0 = b;
      if (!plain) { const R = m[0]*r+m[1]*g+m[2]*b+m[3], G = m[4]*r+m[5]*g+m[6]*b+m[7], B = m[8]*r+m[9]*g+m[10]*b+m[11]; r = R; g = G; b = B; }
      if (c) { sample(c,r,g,b,o); r = o[0]; g = o[1]; b = o[2]; }
      if (f && !broken) {
        try { const v = f(r,g,b,a,p%w,(p/w)|0,t,w,h); if (v && v.length >= 3) { r = +v[0]; g = +v[1]; b = +v[2]; if (v.length > 3) a = +v[3]; } }
        catch (e) { status.error = String(e.message || e); broken = true; }
      }
      px[i] = clamp((r0+(r-r0)*amount)*255,0,255); px[i+1] = clamp((g0+(g-g0)*amount)*255,0,255); px[i+2] = clamp((b0+(b-b0)*amount)*255,0,255);
      px[i+3] = clamp(a*255,0,255);
    }
    ctx.putImageData(img,0,0);
    return scratch;
  }
  /* ---- adjustment layers: kind look (uses layer.look), levels, threshold, posterize ---- */
  const adjKinds = {look:'Filter',levels:'Levels',threshold:'Threshold',posterize:'Posterize'};
  const normalizeAdj = raw => {
    const k = raw && Object.hasOwn(adjKinds,raw.kind) ? raw.kind : 'look';
    if (k === 'levels') { const black = num(raw.black,0,0,254); return {kind:k,black,white:Math.max(black+1,num(raw.white,255,1,255)),gamma:num(raw.gamma,1,.1,4)}; }
    if (k === 'threshold') return {kind:k,level:num(raw.level,128,0,255)};
    if (k === 'posterize') return {kind:k,levels:Math.round(num(raw.levels,4,2,32))};
    return {kind:'look'};
  };
  let adjCanvas = null;
  function adjust(src,l,w,h,t = 0) {
    const a = l.adj || {kind:'look'};
    if (a.kind === 'look') return apply(src,l.look || blank(),w,h,t);
    if (!adjCanvas) adjCanvas = document.createElement('canvas');
    if (adjCanvas.width !== w) adjCanvas.width = w;
    if (adjCanvas.height !== h) adjCanvas.height = h;
    const ctx = adjCanvas.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,w,h); ctx.drawImage(src,0,0);
    const img = ctx.getImageData(0,0,w,h), px = img.data, table = new Uint8Array(256);
    for (let i=0;i<256;i++) {
      if (a.kind === 'levels') table[i] = clamp(Math.pow(clamp((i-a.black)/(a.white-a.black),0,1),1/a.gamma)*255,0,255);
      else if (a.kind === 'threshold') table[i] = i >= a.level ? 255 : 0;
      else table[i] = Math.round(Math.round(i/255*(a.levels-1))/(a.levels-1)*255);
    }
    if (a.kind === 'threshold') {
      for (let i=0;i<px.length;i+=4) { const v = table[Math.round(.2126*px[i]+.7152*px[i+1]+.0722*px[i+2])]; px[i] = px[i+1] = px[i+2] = v; }
    } else for (let i=0;i<px.length;i+=4) { px[i] = table[px[i]]; px[i+1] = table[px[i+1]]; px[i+2] = table[px[i+2]]; }
    ctx.putImageData(img,0,0);
    return adjCanvas;
  }
  return {adjKinds,normalizeAdj,adjust,presets,blank,normalize,isPlain,apply,trusted,status,parseCube,cube,compile,codeLive,filterString};
})();
