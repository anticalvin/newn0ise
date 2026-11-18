/* Pen support (Wacom, Apple Pencil, Surface and other styluses) shared by every brush: a pressure curve you can pick, tilt that widens a stroke,
   the eraser end of the pen, and palm rejection so a resting hand doesn't smudge or orbit while the pen is working. Everything reads Pointer Events,
   so drivers that report as a pen work with no setup; a tablet in mouse mode simply behaves like a mouse. */
const LS=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:v;}catch(e){return d;}};
const GAMMA={soft:.6,normal:1,firm:1.7};
export const PEN={
  seen:false,last:0,eraser:false,tilt:LS('n0.pentilt','1')==='1',curve:LS('n0.pencurve','normal'),
  /* pressure 0..1 after the chosen curve; non-pen pointers count as full pressure */
  p(e){if(!e||e.pointerType!=='pen')return 1;const r=e.pressure>0?e.pressure:.5;return Math.max(.04,Math.pow(r,GAMMA[PEN.curve]||1));},
  /* 1 when upright, up to 1.9 when the pen lies flat, like the side of a pencil */
  tiltK(e){if(!PEN.tilt||!e||e.pointerType!=='pen')return 1;const t=Math.min(1,Math.hypot(e.tiltX||0,e.tiltY||0)/80);return 1+t*.9;},
  isEraser(e){return !!e&&e.pointerType==='pen'&&(((e.buttons&32)!==0)||e.button===5);},
  set(k,v){PEN[k]=v;try{localStorage.setItem(k==='tilt'?'n0.pentilt':'n0.pencurve',k==='tilt'?(v?'1':'0'):v);}catch(e){}},
  /* a small settings block any brush panel can drop in; shows only once a pen has been seen, or always when force is true */
  ui(parent,force){
    const w=document.createElement('div');w.className='penrow';w.setAttribute('role','group');w.setAttribute('aria-label','Pen');
    w.innerHTML='<span>Pen pressure</span><div class="pc"></div><label><input type="checkbox"> Tilt widens the line</label>';
    const pc=w.querySelector('.pc');
    ['soft','normal','firm'].forEach(k=>{const b=document.createElement('button');b.type='button';b.textContent=k[0].toUpperCase()+k.slice(1);b.setAttribute('aria-pressed',String(PEN.curve===k));
      b.addEventListener('click',()=>{PEN.set('curve',k);pc.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});pc.appendChild(b);});
    const cb=w.querySelector('input');cb.checked=PEN.tilt;cb.addEventListener('change',()=>PEN.set('tilt',cb.checked));
    const upd=()=>{w.hidden=!(force||PEN.seen);};upd();addEventListener('n0pen',upd);
    parent.appendChild(w);return w;
  }
};
export function initPen(c){
  const {canvas}=c;
  const css=document.createElement('style');css.textContent=`.penrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0;font:600 11px var(--lab,monospace);color:var(--mute,#9a9ca6)}
.penrow[hidden]{display:none}.penrow .pc{display:flex;gap:4px}
.penrow button{min-height:44px;min-width:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line,#2b2b2f);background:transparent;color:inherit;font:inherit}
.penrow button[aria-pressed=true]{background:var(--ink,#fff);color:var(--bg,#000)}
.penrow label{display:flex;align-items:center;gap:8px;min-height:44px}.penrow input{width:20px;height:20px}`;document.head.appendChild(css);
  const mark=e=>{if(e.pointerType!=='pen')return;PEN.last=performance.now();PEN.eraser=PEN.isEraser(e);if(!PEN.seen){PEN.seen=true;document.body.dataset.pen='1';dispatchEvent(new Event('n0pen'));}};
  addEventListener('pointerdown',mark,true);addEventListener('pointermove',mark,true);
  /* palm rejection: a finger or a big contact patch on the canvas, while the pen is in use or in range, is ignored */
  const palm=e=>{
    if(e.pointerType!=='touch'||!PEN.seen||e.target!==canvas)return;
    if(performance.now()-PEN.last<900||Math.max(e.width||0,e.height||0)>48){e.stopImmediatePropagation();e.preventDefault();}
  };
  addEventListener('pointerdown',palm,true);addEventListener('pointermove',palm,true);
  /* the pen's own barrel and eraser buttons shouldn't open the browser's context menu on the canvas */
  canvas.addEventListener('contextmenu',e=>{if(PEN.seen&&performance.now()-PEN.last<1500)e.preventDefault();});
  return PEN;
}
