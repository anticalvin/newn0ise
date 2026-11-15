/* Live before/after: a draggable divider over the picture. Left of it is the untouched source, right of it is the look.
   The original is drawn on a 2D canvas laid over the output and clipped to the left of the divider, so the engine is not involved. */
export function createWipe({canvas,stage,getSrc,el}){
  let on=false,pos=.5,box=null,ov=null,line=null,raf=0;
  const dims=s=>s?[s.videoWidth||s.naturalWidth||s.width||0,s.videoHeight||s.naturalHeight||s.height||0]:[0,0];
  function paint(){
    if(!on)return;raf=requestAnimationFrame(paint);
    const r=canvas.getBoundingClientRect(),sr=stage.getBoundingClientRect(),w=Math.round(r.width),h=Math.round(r.height);if(!w||!h)return;
    box.style.cssText=`left:${r.left-sr.left}px;top:${r.top-sr.top}px;width:${w}px;height:${h}px`;
    if(ov.width!==w||ov.height!==h){ov.width=w;ov.height=h;}
    const g=ov.getContext('2d'),x=Math.round(w*pos);g.clearRect(0,0,w,h);
    const s=getSrc(),[sw,sh]=dims(s);
    if(s&&sw){g.save();g.beginPath();g.rect(0,0,x,h);g.clip();const k=Math.max(w/sw,h/sh);g.drawImage(s,(w-sw*k)/2,(h-sh*k)/2,sw*k,sh*k);g.restore();}
    line.style.left=x+'px';
  }
  function build(){
    box=el('div','wipebox');ov=document.createElement('canvas');ov.className='wipecv';line=el('div','wipeline');line.innerHTML='<i></i><b>Original</b><u>Look</u>';
    box.append(ov,line);stage.appendChild(box);
    const mv=e=>{const r=box.getBoundingClientRect();pos=Math.max(.02,Math.min(.98,(e.clientX-r.left)/r.width));};
    line.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();line.setPointerCapture(e.pointerId);line.dataset.drag='1';mv(e);});
    line.addEventListener('pointermove',e=>{if(line.dataset.drag)mv(e);});
    const up=()=>{delete line.dataset.drag;};line.addEventListener('pointerup',up);line.addEventListener('pointercancel',up);
    line.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')pos=Math.max(.02,pos-.03);if(e.key==='ArrowRight')pos=Math.min(.98,pos+.03);});
    line.tabIndex=0;line.setAttribute('role','slider');line.setAttribute('aria-label','Before and after divider');
  }
  return {get on(){return on;},toggle(v){on=v===undefined?!on:v;if(on){if(!box)build();box.hidden=false;cancelAnimationFrame(raf);paint();}else{if(box)box.hidden=true;cancelAnimationFrame(raf);}return on;}};
}
