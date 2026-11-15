/* The 2016 iPhone camera feel on top of the n0ise camera: black bars, yellow for "on", icon row, a focus square that lands with a
   little bounce and carries a sun you drag for exposure, press-and-hold to lock, pinch to zoom with a yellow bubble, a mode strip
   (Video, Photo, Square, Burst) and the shutter click. It only adds a layer: the looks, recorder and Pro controls underneath are
   the same ones as before. */
const SVG={
  bolt:'<svg viewBox="0 0 24 24"><path d="M13 2 5 14h6l-1 8 8-12h-6z"/></svg>',
  flip:'<svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 0 1 14-3M20 4v4h-4M20 15a8 8 0 0 1-14 3M4 20v-4h4"/></svg>',
  close:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  grid:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/></svg>',
  timer:'<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M10 3h4"/></svg>',
  sun:'<svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 2v3.5M13 20.5V24M2 13h3.5M20.5 13H24M5.2 5.2l2.5 2.5M18.3 18.3l2.5 2.5M5.2 20.8l2.5-2.5M18.3 7.7l2.5-2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>'
};
import {createCamSound} from './camsound.js';
export function installIosCam(c){
  const {u,$,el,PRO,applyPro,hwSet,buzz,toast,lsGet,lsSet}=c;
  const on=lsGet('n0ise.camskin','ios')!=='lab';u.classList.toggle('ios',on);
  const set=(id,svg,label)=>{const b=$('#'+id);if(b){b.innerHTML=svg;b.setAttribute('aria-label',label);}return b;};
  set('camx',SVG.close,'Close camera');set('camflip',SVG.flip,'Flip camera');set('camflashb',SVG.bolt,'Flash');
  const top=u.querySelector('.camtop');
  const mk=(id,svg,label,fn)=>{const b=el('button','cb');b.id=id;b.innerHTML=svg;b.setAttribute('aria-label',label);b.addEventListener('click',fn);top.appendChild(b);return b;};
  const gridB=mk('camgridt',SVG.grid,'Grid lines',()=>{const o=$('#camgrid');o&&o.click();gridB.setAttribute('aria-pressed',u.classList.contains('grid'));});
  const timB=mk('camtimt',SVG.timer,'Self timer',()=>{const o=$('#camtim');o&&o.click();const t=(o&&o.textContent.match(/\d+/)||[''])[0];timB.dataset.t=t;timB.setAttribute('aria-pressed',!!t);timB.innerHTML=t?SVG.timer+'<b style="font:700 10px system-ui;margin-left:1px">'+t+'</b>':SVG.timer;});
  $('#cammore')&&($('#cammore').textContent='•••');
  /* More: turn the skin and the shutter click on and off */
  const more=u.querySelector('.cammoregrid');let clickOn=lsGet('n0ise.camclick','on')!=='off';
  if(more){
    const sk=el('button','cb','iOS look');sk.id='camskin';sk.setAttribute('aria-pressed',on);sk.addEventListener('click',()=>{const v=!u.classList.contains('ios');u.classList.toggle('ios',v);sk.setAttribute('aria-pressed',v);lsSet('n0ise.camskin',v?'ios':'lab');});
    const ck=el('button','cb','Click');ck.setAttribute('aria-label','Shutter click sound');ck.setAttribute('aria-pressed',clickOn);ck.addEventListener('click',()=>{clickOn=!clickOn;ck.setAttribute('aria-pressed',clickOn);lsSet('n0ise.camclick',clickOn?'on':'off');if(clickOn)sound();});
    const cm=el('button','cb','Compare');cm.setAttribute('aria-pressed',false);cm.addEventListener('click',()=>{const on=c.wipe&&c.wipe().toggle();cm.setAttribute('aria-pressed',!!on);});
    more.append(sk,ck,cm);
  }
  /* sounds belong to the camera body: the shutter, the film advance, the tape load */
  const cs=createCamSound();
  const play=kind=>{if(!clickOn&&kind!=='x')return;cs.play(kind,c.body&&c.body());};
  const sound=()=>play('shutter');
  /* grid lines live in a box that follows the picture itself, so they never cross the buttons */
  const gb=el('div','camgridbox');u.prepend(gb);
  /* full screen: the picture keeps its own aspect ratio but the stage runs edge to edge, the bars float over it */
  let fullOn=lsGet('n0ise.camfull','on')!=='off';
  const applyFull=()=>{u.classList.toggle('full',fullOn);document.body.dataset.camfull=fullOn?'1':'';if(!fullOn)delete document.body.dataset.camfull;c.refit&&c.refit();};
  if(more){const fb=el('button','cb','Full screen');fb.setAttribute('aria-pressed',fullOn);fb.addEventListener('click',()=>{fullOn=!fullOn;fb.setAttribute('aria-pressed',fullOn);lsSet('n0ise.camfull',fullOn?'on':'off');applyFull();});more.append(fb);}
  applyFull();
  /* focus layer */
  const layer=el('div','camtap');u.prepend(layer);
  const fx=el('div','cfocus');fx.innerHTML='<i class="sq"></i><i class="sunline"></i><span class="sun">'+SVG.sun+'</span>';layer.appendChild(fx);
  const lock=el('div','clock','AE/AF LOCK');layer.appendChild(lock);
  const zb=el('button','czoom','1×');zb.setAttribute('aria-label','Zoom. Tap to reset');layer.appendChild(zb);
  const sun=fx.querySelector('.sun'),line=fx.querySelector('.sunline');
  const paintSun=()=>{const y=-PRO.ev*25;sun.style.transform='translateY('+y+'px)';};
  let hideT=0,dimT=0,zT=0,fxX=0,fxY=0,locked=false;
  const showZoom=()=>{zb.textContent=(PRO.zoom<10?PRO.zoom.toFixed(1).replace(/\.0$/,''):Math.round(PRO.zoom))+'×';zb.classList.add('on');clearTimeout(zT);zT=setTimeout(()=>{if(PRO.zoom<=1.01)zb.classList.remove('on');},1600);};
  zb.addEventListener('pointerdown',e=>e.stopPropagation());
  zb.addEventListener('click',()=>{PRO.zoom=1;applyPro();showZoom();zb.classList.remove('on');buzz(8);});
  function place(x,y,lockIt){
    const r=layer.getBoundingClientRect();fxX=Math.max(48,Math.min(r.width-70,x-r.left));fxY=Math.max(48,Math.min(r.height-48,y-r.top));
    fx.style.left=fxX+'px';fx.style.top=fxY+'px';fx.classList.remove('show','dim','lock');void fx.offsetWidth;fx.classList.add('show');paintSun();
    clearTimeout(hideT);clearTimeout(dimT);
    locked=!!lockIt;PRO.afLock=locked;lock.classList.toggle('on',locked);
    if(locked){fx.classList.add('lock');buzz(18);}else{buzz(6);dimT=setTimeout(()=>fx.classList.add('dim'),1400);hideT=setTimeout(()=>{if(!dragging)fx.classList.remove('show','dim');},4200);}
    /* ask the camera to focus there when the browser lets it; harmless when it does not */
    const nx=(fxX)/r.width,ny=(fxY)/r.height;hwSet({pointsOfInterest:[{x:nx,y:ny}],focusMode:'single-shot'});
  }
  const pts=new Map();let mode='',start=null,lp=0,z0=1,d0=0,ev0=0,dragging=false,moved=false;
  const sunHit=e=>{if(!fx.classList.contains('show'))return false;const r=layer.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;return x>fxX+30&&x<fxX+80&&Math.abs(y-fxY)<95;};
  layer.addEventListener('pointerdown',e=>{
    try{layer.setPointerCapture(e.pointerId);}catch(_){}
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2){clearTimeout(lp);mode='pinch';const[a,b]=[...pts.values()];d0=Math.hypot(a.x-b.x,a.y-b.y)||1;z0=PRO.zoom;return;}
    start={x:e.clientX,y:e.clientY};moved=false;
    if(sunHit(e)){mode='ev';ev0=PRO.ev;dragging=true;clearTimeout(hideT);clearTimeout(dimT);fx.classList.remove('dim');}
    else{mode='tap';lp=setTimeout(()=>{if(mode==='tap'&&!moved){mode='held';place(start.x,start.y,true);}},520);}
  });
  let evQ=0;
  layer.addEventListener('pointermove',e=>{
    if(!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(mode==='pinch'&&pts.size>=2){const[a,b]=[...pts.values()],d=Math.hypot(a.x-b.x,a.y-b.y);
      const zr=(c.caps()||{}).zoom,max=zr&&zr.max?Math.min(zr.max,15):8,min=zr&&zr.min?zr.min:1;
      PRO.zoom=Math.max(min,Math.min(max,z0*d/d0));showZoom();cancelAnimationFrame(evQ);evQ=requestAnimationFrame(()=>applyPro());return;}
    if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;
    if(mode==='tap'&&(Math.abs(dy)>10||Math.abs(dx)>10)){moved=true;clearTimeout(lp);
      if(fx.classList.contains('show')&&Math.abs(dy)>Math.abs(dx)){mode='ev';ev0=PRO.ev;dragging=true;clearTimeout(hideT);clearTimeout(dimT);fx.classList.remove('dim');}else mode='none';}
    if(mode==='ev'){PRO.ev=Math.max(-2,Math.min(2,ev0-dy/25));paintSun();cancelAnimationFrame(evQ);evQ=requestAnimationFrame(()=>applyPro());}
  });
  const end=e=>{
    if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);clearTimeout(lp);
    if(mode==='tap'&&!moved&&start)place(start.x,start.y,false);
    if(mode==='ev'){dragging=false;if(!locked){dimT=setTimeout(()=>fx.classList.add('dim'),1200);hideT=setTimeout(()=>fx.classList.remove('show','dim'),3600);}}
    if(pts.size===0){mode='';start=null;}
  };
  layer.addEventListener('pointerup',end);layer.addEventListener('pointercancel',end);
  layer.addEventListener('contextmenu',e=>e.preventDefault());
  return {sound,play,applyFull,hideFocus(){fx.classList.remove('show','dim');lock.classList.remove('on');locked=false;PRO.afLock=false;},paintSun};
}
