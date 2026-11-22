/* Lab canvas size: one small model for both modes. A sketch (p5) or a vector drawing is told its size by Lab, not by regex edits of the source:
   p5 gets resizeCanvas() after the sketch's own setup(), vector output gets a matching viewBox plus width and height.
   State: {ratio:'code'|'1:1'|'4:5'|'9:16'|'16:9'|'3:2'|'custom', w, h, flip}. 'code' leaves the sketch's own createCanvas alone. */
export const RATIOS = [['code','Sketch size'],['1:1','1:1'],['4:5','4:5'],['9:16','9:16'],['16:9','16:9'],['3:2','3:2'],['custom','Custom']];
export const LONG = 700, MIN = 16, MAX = 4096;
const VALUE = {'1:1':1,'4:5':4/5,'9:16':9/16,'16:9':16/9,'3:2':3/2};
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export const clampDim = n => clamp(Math.round(Number(n)) || LONG,MIN,MAX);

export const defaultState = () => ({ratio:'code',w:LONG,h:LONG,flip:false});
export function normalize(s) {
  const o = {...defaultState(),...(s && typeof s === 'object' ? s : {})};
  if (!RATIOS.some(r => r[0] === o.ratio)) o.ratio = 'code';
  o.w = clampDim(o.w); o.h = clampDim(o.h); o.flip = !!o.flip;
  return o;
}
/* old saves stored a single number (width / height) */
export function fromLegacyAspect(a) {
  const n = Number(a); if (!(n > 0) || Math.abs(n-1) < 1e-6) return defaultState();
  for (const [k,v] of Object.entries(VALUE)) if (Math.abs(v-n) < .002) return {ratio:k,w:LONG,h:LONG,flip:false};
  for (const [k,v] of Object.entries(VALUE)) if (Math.abs(1/v-n) < .002) return {ratio:k,w:LONG,h:LONG,flip:true};
  return defaultState();
}
/* pixel size for a state: presets keep the long side at 700 (what Lab always used), custom is exact; null for 'code' */
export function dimsFor(s) {
  s = normalize(s);
  if (s.ratio === 'code') return null;
  if (s.ratio === 'custom') return {w:s.w,h:s.h};
  let ar = VALUE[s.ratio]; if (s.flip && ar !== 1) ar = 1/ar;
  return ar >= 1 ? {w:LONG,h:Math.round(LONG/ar)} : {w:Math.round(LONG*ar),h:LONG};
}
export const labelFor = s => { const d = dimsFor(s); return d ? d.w+' × '+d.h : 'sketch size'; };
/* swap orientation: presets flip, custom swaps width and height */
export function flipped(s) {
  s = normalize(s); if (s.ratio === 'custom') return {...s,w:s.h,h:s.w};
  if (s.ratio === 'code' || s.ratio === '1:1') return s;
  return {...s,flip:!s.flip};
}
/* A vector drawing is generated inside a square viewBox [x,y,size,size]. Frame it to w:h without moving or scaling the drawing:
   the longer side grows, so everything stays visible (contain), centred on the same point. */
export function frameViewBox(box,w,h) {
  const [x,y,bw,bh] = box; if (!(w > 0 && h > 0)) return box;
  const ar = w/h, cx = x+bw/2, cy = y+bh/2, size = Math.max(bw,bh);
  const fw = ar >= 1 ? size*ar : size, fh = ar >= 1 ? size : size/ar;
  return [cx-fw/2,cy-fh/2,fw,fh];
}

/* the controls: one select, an orientation button, and width and height for Custom */
export function mountCanvasControls(host,{get,set,onChange}) {
  const el = (t,c,h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const row = el('div','segment compact canvas-size'), sel = el('select','pill'), flip = el('button','pill'), w = el('input'), h = el('input'), note = el('span','hint canvas-note');
  sel.setAttribute('aria-label','Canvas shape'); sel.innerHTML = RATIOS.map(r => `<option value="${r[0]}">${r[1]}</option>`).join('');
  flip.type = 'button'; flip.title = 'Swap portrait and landscape'; flip.setAttribute('aria-label','Swap portrait and landscape'); flip.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="12" height="9" rx="1.6"/><path d="M18 5v8M15.5 10.5 18 13l2.5-2.5"/></svg>';
  for (const [i,l] of [[w,'Width in pixels'],[h,'Height in pixels']]) { i.type = 'number'; i.min = MIN; i.max = MAX; i.step = 1; i.inputMode = 'numeric'; i.className = 'pill canvas-dim'; i.setAttribute('aria-label',l); }
  row.append(sel,flip,w,h,note);
  const paint = () => { const s = normalize(get()); sel.value = s.ratio; w.hidden = h.hidden = s.ratio !== 'custom'; flip.hidden = s.ratio === 'code' || s.ratio === '1:1'; w.value = s.w; h.value = s.h; note.textContent = s.ratio === 'custom' ? 'px' : labelFor(s); };
  const commit = s => { set(normalize(s)); paint(); onChange && onChange(normalize(s)); };
  sel.onchange = () => {
    const s = normalize(get()), now = dimsFor(s) || {w:s.w,h:s.h}, next = {...s,ratio:sel.value,flip:false};
    if (sel.value === 'custom') Object.assign(next,now); else { const d = dimsFor(next); if (d) Object.assign(next,d); }
    commit(next);
  };
  flip.onclick = () => commit(flipped(get()));
  const dim = () => commit({...normalize(get()),ratio:'custom',w:clampDim(w.value),h:clampDim(h.value)});
  w.onchange = h.onchange = dim;
  host.replaceChildren(row); paint();
  return {paint,el:row};
}
