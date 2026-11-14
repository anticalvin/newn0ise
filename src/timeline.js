/* Timeline: keyframes on any numeric layer parameter, a layer's mix, and the camera body (look switching).
   Easing per key: linear, ease, hold, bounce. Loop region, scrub, wheel or pinch zoom. "Record" captures slider moves during playback
   as keyframes. The timeline owns its own clock (advanced by frame time while playing, or set by scrubbing), so the same timeline
   gives the same values at the same time in the preview, in stills and in a recording. It serialises into recipes and projects.
   Track: {lay: layer index, k: param key | 'opacity' | 'cam', keys: [{t, v, e}]}. */
const bounce=t=>{const n=7.5625,d=2.75;if(t<1/d)return n*t*t;if(t<2/d){t-=1.5/d;return n*t*t+.75;}if(t<2.5/d){t-=2.25/d;return n*t*t+.9375;}t-=2.625/d;return n*t*t+.984375;};
export const EASE={linear:t=>t,ease:t=>t*t*(3-2*t),hold:()=>0,bounce};
export function createTimeline(c){
  const {el,layers,setCam,toast,params}=c;
  const TL={dur:8,loop:[0,8],loopOn:true,tracks:[],t:0,playing:false,rec:false,view:[0,8],open:false,sel:{lay:0,k:'amt'}};
  let host=null,ruler=null,list=null,timeEl=null,lastCam=-1,raf=0;
  const val=(tr,t)=>{
    const ks=tr.keys;if(!ks.length)return null;if(t<=ks[0].t)return ks[0].v;if(t>=ks[ks.length-1].t)return ks[ks.length-1].v;
    let i=0;while(i<ks.length-2&&ks[i+1].t<=t)i++;const a=ks[i],b=ks[i+1],f=(EASE[a.e]||EASE.ease)((t-a.t)/Math.max(1e-6,b.t-a.t));return a.v+(b.v-a.v)*f;
  };
  TL.valueAt=(tr,t)=>val(tr,t);
  TL.apply=()=>{
    const L=layers();
    for(const tr of TL.tracks){
      const v=val(tr,TL.t);if(v==null)continue;
      if(tr.k==='cam'){const i=Math.round(v);if(i!==lastCam){lastCam=i;setCam(i);}continue;}
      const l=L[tr.lay];if(!l)continue;
      if(tr.k==='opacity')l.opacity=v;else if(l.params&&typeof l.params[tr.k]==='number')l.params[tr.k]=v;
    }
  };
  TL.tick=dt=>{
    if(!TL.playing)return;TL.t+=dt;
    const a=TL.loopOn?TL.loop[0]:0,b=TL.loopOn?TL.loop[1]:TL.dur;
    if(TL.t>b){if(TL.loopOn&&b>a)TL.t=a+(TL.t-b)%(b-a);else{TL.t=b;TL.playing=false;paint();}}
    TL.apply();draw();
  };
  TL.seek=t=>{TL.t=Math.max(0,Math.min(TL.dur,t));TL.apply();draw();};
  TL.play=on=>{TL.playing=on===undefined?!TL.playing:on;if(TL.playing&&TL.t>=TL.dur)TL.t=TL.loop[0];lastCam=-1;paint();};
  TL.track=(lay,k,make)=>{let tr=TL.tracks.find(x=>x.lay===lay&&x.k===k);if(!tr&&make){tr={lay,k,keys:[]};TL.tracks.push(tr);}return tr;};
  TL.addKey=(lay,k,v,t=TL.t,e='ease')=>{
    const tr=TL.track(lay,k,true),ks=tr.keys,near=ks.find(x=>Math.abs(x.t-t)<.06);
    if(near){near.v=v;near.e=near.e||e;}else{ks.push({t:+t.toFixed(3),v,e});ks.sort((a,b)=>a.t-b.t);}
    build();draw();return tr;
  };
  TL.capture=(V,k,v)=>{if(!TL.rec||!TL.playing)return;const lay=layers().findIndex(l=>l.params===V);if(lay>=0)TL.addKey(lay,k,v,TL.t,'linear');};
  TL.serialize=()=>TL.tracks.length?{dur:TL.dur,loop:TL.loop.slice(),loopOn:TL.loopOn,tracks:JSON.parse(JSON.stringify(TL.tracks))}:null;
  TL.load=d=>{TL.tracks=d&&d.tracks?JSON.parse(JSON.stringify(d.tracks)):[];if(d){TL.dur=d.dur||8;TL.loop=d.loop||[0,TL.dur];TL.loopOn=d.loopOn!==false;}TL.view=[0,TL.dur];TL.t=0;build();draw();};
  /* ---- drawer ---- */
  const css=getComputedStyle(document.documentElement);
  const ink=()=>'#f2efe8',acc=()=>(css.getPropertyValue('--accent')||'#ff5a1f').trim()||'#ff5a1f';
  const x2t=(x,w)=>TL.view[0]+x/w*(TL.view[1]-TL.view[0]),t2x=(t,w)=>(t-TL.view[0])/(TL.view[1]-TL.view[0])*w;
  function paint(){if(!host)return;const b=host.querySelector('.tlplay');if(b)b.textContent=TL.playing?'Pause':'Play';const r=host.querySelector('.tlrec');if(r)r.setAttribute('aria-pressed',TL.rec);}
  function drawLane(cv,tr){
    const w=cv.clientWidth|0,h=cv.clientHeight|0;if(!w)return;if(cv.width!==w)cv.width=w;if(cv.height!==h)cv.height=h;const g=cv.getContext('2d');g.clearRect(0,0,w,h);
    g.fillStyle='rgba(242,239,232,.08)';if(TL.loopOn)g.fillRect(t2x(TL.loop[0],w),0,t2x(TL.loop[1],w)-t2x(TL.loop[0],w),h);
    if(tr&&tr.keys.length){g.strokeStyle='rgba(242,239,232,.35)';g.beginPath();const n=Math.max(2,w>>2);let mn=1e9,mx=-1e9;const vs=[];for(let i=0;i<=n;i++){const v=val(tr,x2t(i/n*w,w));vs.push(v);mn=Math.min(mn,v);mx=Math.max(mx,v);}
      vs.forEach((v,i)=>{const y=h-4-(mx>mn?(v-mn)/(mx-mn):.5)*(h-8);i?g.lineTo(i/n*w,y):g.moveTo(0,y);});g.stroke();
      g.fillStyle=ink();tr.keys.forEach(k=>{const x=t2x(k.t,w),y=h/2;g.save();g.translate(x,y);g.rotate(Math.PI/4);g.fillRect(-4,-4,8,8);g.restore();});}
    const px=t2x(TL.t,w);g.fillStyle=acc();g.fillRect(px-1,0,2,h);
  }
  function draw(){
    if(!host||!TL.open)return;
    if(timeEl)timeEl.textContent=TL.t.toFixed(2)+' / '+TL.dur.toFixed(1)+' s';
    if(ruler){const w=ruler.clientWidth|0,h=ruler.clientHeight|0;if(w){if(ruler.width!==w)ruler.width=w;if(ruler.height!==h)ruler.height=h;const g=ruler.getContext('2d');g.clearRect(0,0,w,h);
      g.fillStyle='rgba(242,239,232,.12)';if(TL.loopOn)g.fillRect(t2x(TL.loop[0],w),0,t2x(TL.loop[1],w)-t2x(TL.loop[0],w),h);
      g.fillStyle=ink();g.font='10px monospace';const span=TL.view[1]-TL.view[0],step=span>12?2:span>5?1:span>2?.5:.2;
      for(let t=Math.ceil(TL.view[0]/step)*step;t<=TL.view[1];t+=step){const x=t2x(t,w);g.fillRect(x,h-8,1,8);g.fillText(t.toFixed(step<1?1:0),x+3,h-10);}
      g.fillStyle=acc();g.fillRect(t2x(TL.t,w)-1,0,2,h);}}
    list&&list.querySelectorAll('canvas.lane').forEach(cv=>drawLane(cv,TL.tracks[+cv.dataset.i]));
  }
  const label=tr=>tr.k==='cam'?'Camera':'Layer '+(tr.lay+1)+' · '+(tr.k==='opacity'?'mix':tr.k);
  function build(){
    if(!list)return;list.innerHTML='';
    TL.tracks.forEach((tr,i)=>{
      const row=el('div','tlrow'),lab=el('span','tll',label(tr)),cv=document.createElement('canvas');cv.className='lane';cv.dataset.i=i;
      const del=el('button','tlx','×');del.setAttribute('aria-label','Delete track');del.addEventListener('click',()=>{TL.tracks.splice(i,1);build();draw();});
      row.append(lab,cv,del);list.appendChild(row);wireLane(cv,tr);
    });
    if(!TL.tracks.length)list.appendChild(el('div','tlempty','No keyframes yet. Pick a parameter and tap Key, or press Rec and move a slider while it plays.'));
  }
  function wireLane(cv,tr){
    let drag=null,tapT=0;
    cv.addEventListener('pointerdown',e=>{const r=cv.getBoundingClientRect(),w=r.width,x=e.clientX-r.left;
      const k=tr.keys.find(k=>Math.abs(t2x(k.t,w)-x)<14);
      if(k){if(performance.now()-tapT<320&&drag&&drag.k===k){tr.keys.splice(tr.keys.indexOf(k),1);build();draw();return;}tapT=performance.now();drag={k,tr};cv.setPointerCapture(e.pointerId);
        const nx=EASE_NEXT[k.e]||'ease';if(e.shiftKey){k.e=nx;draw();}}
      else{const t=x2t(x,w),v=val(tr,t);TL.addKey(tr.lay,tr.k,v==null?currentValue(tr):v,t,'ease');}});
    cv.addEventListener('pointermove',e=>{if(!drag)return;const r=cv.getBoundingClientRect();drag.k.t=Math.max(0,Math.min(TL.dur,x2t(e.clientX-r.left,r.width)));drag.tr.keys.sort((a,b)=>a.t-b.t);draw();});
    cv.addEventListener('pointerup',()=>{drag=null;});
    cv.addEventListener('contextmenu',e=>{e.preventDefault();});
  }
  const EASE_NEXT={linear:'ease',ease:'hold',hold:'bounce',bounce:'linear'};
  const currentValue=tr=>{if(tr.k==='cam')return c.getCam();const l=layers()[tr.lay];return l?(tr.k==='opacity'?l.opacity:l.params[tr.k]):0;};
  TL.mount=parent=>{
    host=el('div','tl');host.hidden=true;host.setAttribute('aria-label','Timeline');
    host.innerHTML=`<div class="tlbar"><button class="tlplay">Play</button><button class="tlhome" aria-label="Back to start">|◀</button><button class="tlloop" aria-pressed="true">Loop</button><button class="tlrec" aria-pressed="false">Rec</button><span class="tltime"></span><button class="tlclose" aria-label="Close timeline">✕</button></div>
    <canvas class="tlruler"></canvas><div class="tllist"></div>
    <div class="tladd"><select class="tlsel" aria-label="Parameter"></select><select class="tlease" aria-label="Easing"><option>ease</option><option>linear</option><option>hold</option><option>bounce</option></select><button class="tlkey">Key</button><label class="tllen">Length <input type="number" class="tldur" min="1" max="120" step="1" value="8"></label></div>`;
    parent.appendChild(host);ruler=host.querySelector('.tlruler');list=host.querySelector('.tllist');timeEl=host.querySelector('.tltime');
    host.querySelector('.tlplay').addEventListener('click',()=>TL.play());host.querySelector('.tlhome').addEventListener('click',()=>{TL.t=TL.loopOn?TL.loop[0]:0;TL.apply();draw();});
    host.querySelector('.tlloop').addEventListener('click',e=>{TL.loopOn=!TL.loopOn;e.currentTarget.setAttribute('aria-pressed',TL.loopOn);draw();});
    host.querySelector('.tlrec').addEventListener('click',e=>{TL.rec=!TL.rec;if(TL.rec&&!TL.playing)TL.play(true);paint();});
    host.querySelector('.tlclose').addEventListener('click',()=>TL.show(false));
    host.querySelector('.tldur').addEventListener('change',e=>{TL.dur=Math.max(1,Math.min(120,+e.target.value||8));TL.loop=[Math.min(TL.loop[0],TL.dur),TL.dur];TL.view=[0,TL.dur];draw();});
    host.querySelector('.tlkey').addEventListener('click',()=>{const o=host.querySelector('.tlsel').selectedOptions[0];if(!o)return;const lay=+o.dataset.lay,k=o.dataset.k;
      const v=k==='cam'?c.getCam():(()=>{const l=layers()[lay];return k==='opacity'?l.opacity:l.params[k];})();TL.addKey(lay,k,v,TL.t,host.querySelector('.tlease').value);});
    /* scrub on the ruler; loop handles with shift-drag; wheel and pinch zoom */
    let scrub=false,pts=new Map(),pd=0;
    ruler.addEventListener('pointerdown',e=>{pts.set(e.pointerId,e.clientX);ruler.setPointerCapture(e.pointerId);if(pts.size===2){const a=[...pts.values()];pd=Math.abs(a[0]-a[1]);return;}
      const r=ruler.getBoundingClientRect();if(e.shiftKey){TL.loop[0]=Math.max(0,Math.min(TL.loop[1]-.1,x2t(e.clientX-r.left,r.width)));draw();return;}scrub=true;TL.seek(x2t(e.clientX-r.left,r.width));});
    ruler.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,e.clientX);
      if(pts.size===2){const a=[...pts.values()],d=Math.abs(a[0]-a[1]);if(pd&&d){const k=pd/d,mid=(TL.view[0]+TL.view[1])/2,half=(TL.view[1]-TL.view[0])/2*k;TL.view=[Math.max(0,mid-half),Math.min(TL.dur,mid+half)];draw();}pd=d;return;}
      if(scrub){const r=ruler.getBoundingClientRect();TL.seek(x2t(e.clientX-r.left,r.width));}});
    const up=e=>{pts.delete(e.pointerId);if(!pts.size)scrub=false;};ruler.addEventListener('pointerup',up);ruler.addEventListener('pointercancel',up);
    host.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey&&!e.altKey)return;e.preventDefault();const k=e.deltaY>0?1.15:.87,mid=TL.t,half=(TL.view[1]-TL.view[0])/2*k;TL.view=[Math.max(0,mid-half),Math.min(TL.dur,mid+half)];draw();},{passive:false});
    build();
  };
  TL.fillParams=()=>{
    if(!host)return;const s=host.querySelector('.tlsel');s.innerHTML='';const L=layers();
    L.forEach((l,i)=>{const defs=params(l);const g=document.createElement('optgroup');g.label='Layer '+(i+1)+' · '+l.module;
      const add=(k,n)=>{const o=document.createElement('option');o.textContent=n;o.dataset.lay=i;o.dataset.k=k;g.appendChild(o);};
      add('opacity','Mix');defs.filter(p=>(p.t==='r'||p.t===undefined)&&typeof l.params[p.k]==='number').forEach(p=>add(p.k,p.label||p.k));s.appendChild(g);});
    if(c.hasCam()){const o=document.createElement('option');o.textContent='Camera (look switching)';o.dataset.lay=0;o.dataset.k='cam';s.appendChild(o);}
  };
  TL.show=on=>{TL.open=on===undefined?!TL.open:on;if(host){host.hidden=!TL.open;if(TL.open){TL.fillParams();build();draw();}}document.body.dataset.tl=TL.open?'1':'';c.onToggle&&c.onToggle(TL.open);};
  addEventListener('resize',()=>draw());
  return TL;
}
