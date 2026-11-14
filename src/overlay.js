/* Overlays: put a photo or a video on top of the clip timeline, from a start time for a length. The overlay lane sits under the main track.
   Overlays are drawn onto the source before the looks, so every effect, mask and keyframe applies to the combined picture, and export
   records exactly what you see. Drag a bar to move it, drag its right edge to change how long it stays, tap to pick it. */
export function createOverlays(ED,c){
  const {el,toast,setSource,uploadSrc,TLN}=c;
  const OV={items:[],sel:-1,comp:document.createElement('canvas'),base:null};
  const g2=OV.comp.getContext('2d');let lane=null,panel=null,uid=0,drag=null,host=null;
  const t2x=(t,w)=>(t-TLN.view[0])/(TLN.view[1]-TLN.view[0])*w,x2t=(x,w)=>TLN.view[0]+x/w*(TLN.view[1]-TLN.view[0]);
  const activeAt=t=>OV.items.filter(o=>t>=o.at&&t<o.at+o.len);
  OV.any=()=>OV.items.length>0;
  OV.source=(e,name,live)=>{if(!OV.any()){setSource(e,name,live);return;}OV.base=e;setSource(OV.comp,'Clip',true);OV.frame();};
  function vsync(o,on){
    const v=o.vid;if(!v)return;
    if(!on){if(!v.paused)v.pause();return;}
    const want=(ED.t-o.at)%(v.duration||1e9);
    if(ED.playing){if(v.paused)v.play().catch(()=>{});if(Math.abs(v.currentTime-want)>.4)v.currentTime=want;}
    else{if(!v.paused)v.pause();if(!v.seeking&&Math.abs(v.currentTime-want)>.05)v.currentTime=want;}
  }
  OV.frame=()=>{
    const b=OV.base;if(!b||!OV.any())return;const bw=b.videoWidth||b.width,bh=b.videoHeight||b.height;if(!bw||!bh)return;
    const k=Math.min(1,1920/Math.max(bw,bh)),W=Math.round(bw*k)&~1,H=Math.round(bh*k)&~1;
    if(OV.comp.width!==W||OV.comp.height!==H){OV.comp.width=W;OV.comp.height=H;}
    g2.globalAlpha=1;g2.drawImage(b,0,0,W,H);
    const act=activeAt(ED.t);
    for(const o of OV.items){const on=act.includes(o);vsync(o,on);if(!on)continue;
      const s=o.vid||o.img,sw=s.videoWidth||s.width,sh=s.videoHeight||s.height;if(!sw||!sh||(o.vid&&o.vid.readyState<2))continue;
      const dw=o.w*W,dh=dw*sh/sw;g2.globalAlpha=o.op;g2.drawImage(s,o.x*W-dw/2,o.y*H-dh/2,dw,dh);}
    g2.globalAlpha=1;uploadSrc();
  };
  ED.afterTick=()=>OV.frame();
  /* ---- adding ---- */
  async function add(file){
    const isV=file.type.startsWith('video/'),url=URL.createObjectURL(file),o={id:++uid,name:file.name.replace(/\.[^.]+$/,'').slice(0,24),at:ED.t,len:3,x:.5,y:.5,w:.5,op:1,url};
    try{
      if(isV){const v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='auto';v.src=url;await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(new Error('bad'));setTimeout(ok,6000);});o.vid=v;o.len=Math.min(isV&&isFinite(v.duration)?v.duration:6,10);}
      else{const im=new Image();im.src=url;await im.decode();const k=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.round(im.naturalWidth*k);cv.height=Math.round(im.naturalHeight*k);cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);o.img=cv;}
    }catch(e){toast('That file couldn’t be opened as an overlay.');URL.revokeObjectURL(url);return;}
    o.len=Math.max(.5,Math.min(o.len,Math.max(1,ED.length()-o.at)||o.len));
    OV.items.push(o);OV.sel=OV.items.length-1;
    if(ED.cur)ED.refresh&&ED.refresh();else if(!ED.active())toast('Add a clip first. The overlay sits on top of it.');
    sync();lanedraw();toast('Overlay added. Drag it to move, drag its right edge to change how long it stays.',3200);
  }
  OV.add=add;
  OV.remove=()=>{const o=OV.items[OV.sel];if(!o)return;if(o.vid)o.vid.pause();URL.revokeObjectURL(o.url);OV.items.splice(OV.sel,1);OV.sel=Math.min(OV.sel,OV.items.length-1);
    if(!OV.any()&&ED.cur)ED.refresh&&ED.refresh();sync();lanedraw();};
  /* ---- lane ---- */
  function lanedraw(){
    if(!lane||!host||host.closest('[hidden]'))return;const w=lane.clientWidth|0,h=lane.clientHeight|0;if(!w)return;if(lane.width!==w)lane.width=w;if(lane.height!==h)lane.height=h;
    const g=lane.getContext('2d'),acc=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#ff5a1f';g.clearRect(0,0,w,h);
    OV.items.forEach((o,i)=>{const x0=t2x(o.at,w),x1=t2x(o.at+o.len,w);g.fillStyle=i===OV.sel?'#3a2a22':'#25221f';g.beginPath();g.roundRect(x0,3,Math.max(4,x1-x0-1),h-6,3);g.fill();
      if(i===OV.sel){g.strokeStyle=acc;g.lineWidth=2;g.stroke();g.fillStyle=acc;g.fillRect(x1-7,3,6,h-6);}
      g.fillStyle='#f2efe8';g.font='10px monospace';g.save();g.beginPath();g.rect(x0,0,x1-x0,h);g.clip();g.fillText((o.vid?'▶ ':'▣ ')+o.name,x0+6,h/2+3);g.restore();});
    g.fillStyle='#f2efe8';g.fillRect(t2x(ED.t,w)-1,0,2,h);
  }
  ED.afterDraw=lanedraw;
  function pick(x,w){for(let i=OV.items.length-1;i>=0;i--){const o=OV.items[i],x0=t2x(o.at,w),x1=t2x(o.at+o.len,w);if(x>=x0-2&&x<=x1+2)return{i,edge:x1-x<18?'r':'body'};}return null;}
  function wire(){
    lane.addEventListener('pointerdown',e=>{const r=lane.getBoundingClientRect(),w=r.width,x=e.clientX-r.left,h=pick(x,w);lane.setPointerCapture(e.pointerId);
      if(!h){ED.seek(x2t(x,w));drag={scrub:true};return;}
      OV.sel=h.i;const o=OV.items[h.i];drag={o,edge:h.edge,x0:x,at0:o.at,len0:o.len};sync();lanedraw();});
    lane.addEventListener('pointermove',e=>{if(!drag)return;const r=lane.getBoundingClientRect(),w=r.width,x=e.clientX-r.left;
      if(drag.scrub){ED.seek(x2t(x,w));return;}
      const dt=(x-drag.x0)/w*(TLN.view[1]-TLN.view[0]),o=drag.o;
      if(drag.edge==='r')o.len=Math.max(.3,drag.len0+dt);else o.at=Math.max(0,drag.at0+dt);
      OV.frame();lanedraw();});
    const up=()=>{drag=null;};lane.addEventListener('pointerup',up);lane.addEventListener('pointercancel',up);
  }
  /* ---- controls ---- */
  function slider(label,key,min,max,step){
    const r=el('label','ovrow');r.append(el('span','',label));const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step=step;
    i.addEventListener('input',()=>{const o=OV.items[OV.sel];if(!o)return;o[key]=+i.value;OV.frame();});i._k=key;r.appendChild(i);panel.appendChild(r);}
  function sync(){
    if(!panel)return;const o=OV.items[OV.sel];panel.hidden=!o;if(!o)return;
    panel.querySelectorAll('input[type=range]').forEach(i=>{i.value=o[i._k];});panel.querySelector('.ovname').textContent=o.name;
  }
  OV.mount=h=>{
    host=h;const bar=h.querySelector('.edbar');
    const b=el('button','edover','+ Photo over');b.title='Put a photo or video on top of the clip';
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*,video/*';inp.hidden=true;h.appendChild(inp);
    inp.addEventListener('change',()=>{const f=inp.files[0];inp.value='';if(f)add(f);});
    b.addEventListener('click',()=>{if(!ED.active()){toast('Add a clip first. The overlay sits on top of it.');return;}inp.click();});
    bar.insertBefore(b,bar.children[1]||null);
    lane=document.createElement('canvas');lane.className='edtrack ovlane';h.querySelector('.edtrack').after(lane);
    panel=el('div','ovpanel');panel.hidden=true;panel.innerHTML='<div class="ovhead"><b class="ovname"></b><button class="ovrm">Remove</button></div>';
    lane.after(panel);slider('Size','w',.05,1.5,.01);slider('Left–right','x',0,1,.01);slider('Up–down','y',0,1,.01);slider('Opacity','op',0,1,.01);
    panel.querySelector('.ovrm').addEventListener('click',()=>OV.remove());wire();
  };
  return OV;
}
