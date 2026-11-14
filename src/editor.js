/* Clip editor: a CapCut-style main track on top of the keyframe timeline. Add videos and photos, drag to reorder, drag an edge to trim,
   split at the playhead, change speed, scrub. The track is magnetic (clips always sit end to end), so there are no gaps to manage.
   The active clip is the engine's live source, so every look, mask, modulator and keyframe applies to it exactly as it does to the camera.
   Export plays the timeline once through the engine and records the canvas with the clips' sound. */
export function createEditor(c){
  const {el,toast,setSource,TLN}=c;
  const ED={clips:[],t:0,playing:false,sel:-1,cur:null,mute:false,exporting:false};
  let uid=0,audio=null,host=null,track=null,selInfo=null,spd=null,blank=null,raf=0,drag=null,lastSeek=0;
  const len=()=>ED.clips.reduce((a,k)=>a+dur(k),0);
  const dur=k=>(k.out-k.in)/k.speed;
  ED.length=len;ED.active=()=>ED.clips.length>0;
  function layout(){let at=0;for(const k of ED.clips){k.at=at;at+=dur(k);}TLN.dur=Math.max(2,len());if(!ED.keepView){TLN.view=[0,TLN.dur];TLN.loop=[0,TLN.dur];}}
  /* ---- audio: every clip's sound goes to the speakers (unless muted) and to a stream the recorder can take ---- */
  function wire(k){if(k.vid&&!k.node&&audio){try{k.node=k.vid._node||(k.vid._node=audio.ctx.createMediaElementSource(k.vid));k.node.connect(audio.mon);k.node.connect(audio.dest);}catch(e){}}}
  ED.audio=()=>{if(!audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;const ctx=new AC();audio={ctx,dest:ctx.createMediaStreamDestination(),mon:ctx.createGain()};audio.mon.connect(ctx.destination);audio.mon.gain.value=ED.mute?0:1;}
    if(audio.ctx.state==='suspended')audio.ctx.resume();ED.clips.forEach(wire);return audio;};
  ED.audioStream=()=>{const a=ED.audio();return a?a.dest.stream:null;};
  /* ---- importing ---- */
  const thumbCanvas=()=>{const t=document.createElement('canvas');t.width=80;t.height=48;return t;};
  async function makeClip(file){
    const url=URL.createObjectURL(file),name=file.name.replace(/\.[^.]+$/,'').slice(0,24);
    if(file.type.startsWith('image/')){
      const im=new Image();im.src=url;await im.decode();const s=Math.min(1,1280/Math.max(im.naturalWidth,im.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.round(im.naturalWidth*s);cv.height=Math.round(im.naturalHeight*s);cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
      const t=thumbCanvas();fit(t,cv);return{id:++uid,kind:'image',name,canvas:cv,srcDur:3,in:0,out:3,speed:1,thumbs:[t],at:0,vx:0};
    }
    const v=document.createElement('video');v.playsInline=true;v.preload='auto';v.src=url;
    await new Promise((ok,no)=>{v.onloadedmetadata=ok;v.onerror=()=>no(new Error('That video couldn’t be read.'));});
    if(!isFinite(v.duration)){ /* recordings from MediaRecorder carry no length: seek far past the end so the browser works it out */
      await new Promise(r=>{const done=()=>{v.removeEventListener('timeupdate',done);r();};v.addEventListener('timeupdate',done);v.currentTime=1e7;setTimeout(done,3000);});
      v.currentTime=0;await new Promise(r=>{v.onseeked=r;setTimeout(r,800);});
    }
    if(!isFinite(v.duration)||v.duration<=0)throw new Error('That video has no length I can use.');
    const k={id:++uid,kind:'video',name,vid:v,srcDur:v.duration,in:0,out:v.duration,speed:1,thumbs:[],at:0,vx:0};
    thumbs(k,url);return k;
  }
  function fit(t,src){const sw=src.videoWidth||src.width,sh=src.videoHeight||src.height;if(!sw||!sh)return;const g=t.getContext('2d'),r=Math.max(t.width/sw,t.height/sh);g.drawImage(src,(t.width-sw*r)/2,(t.height-sh*r)/2,sw*r,sh*r);}
  async function thumbs(k,url){
    const tv=document.createElement('video');tv.muted=true;tv.playsInline=true;tv.style.cssText='position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';document.body.appendChild(tv);tv.src=url;
    try{await new Promise(r=>{tv.onloadeddata=r;tv.onerror=r;});
      const n=Math.max(1,Math.min(12,Math.ceil(k.srcDur)));
      for(let i=0;i<n;i++){await new Promise(r=>{tv.onseeked=r;tv.currentTime=Math.min(k.srcDur-.05,(i+.5)/n*k.srcDur);setTimeout(r,800);});await new Promise(r=>setTimeout(r,140));const t=thumbCanvas();fit(t,tv);k.thumbs.push(t);draw();}
    }catch(e){}
    tv.removeAttribute('src');tv.load();tv.remove();
  }
  ED.addFiles=async files=>{
    for(const f of files){try{const k=await makeClip(f);ED.clips.push(k);ED.sel=ED.clips.length-1;layout();wire(k);if(ED.clips.length===1)enter(k,0);else if(!ED.playing)ED.seek(ED.t);}catch(e){toast(String(e.message||e),5000);}}
    sync();draw();
  };
  /* ---- playback ---- */
  const activeAt=t=>ED.clips.find(k=>t>=k.at-1e-6&&t<k.at+dur(k)-1e-6)||(t>=len()?ED.clips[ED.clips.length-1]:null);
  function enter(k,t){
    if(ED.cur&&ED.cur.vid&&ED.cur!==k&&ED.cur.vid!==(k&&k.vid))ED.cur.vid.pause();
    ED.cur=k;if(!k)return;
    if(k.kind==='video'){k.vid.playbackRate=Math.max(.0625,Math.min(16,k.speed));k.vid.muted=false;k.vid.currentTime=Math.max(0,Math.min(k.srcDur-.01,k.in+(t-k.at)*k.speed));setSource(k.vid,'Clip',true);if(ED.playing)k.vid.play().catch(()=>{});}
    else setSource(k.canvas,'Clip',false);
  }
  ED.seek=t=>{
    ED.t=Math.max(0,Math.min(len(),t));const a=activeAt(ED.t);
    if(a!==ED.cur||(a&&a.vid&&a.vid.paused&&performance.now()-lastSeek>60)){lastSeek=performance.now();if(a!==ED.cur)enter(a,ED.t);else a.vid.currentTime=Math.max(0,Math.min(a.srcDur-.01,a.in+(ED.t-a.at)*a.speed));}
    TLN.t=ED.t;TLN.apply();draw();
  };
  ED.play=on=>{
    ED.playing=on===undefined?!ED.playing:on;
    if(ED.playing){ED.audio();if(ED.t>=len()-.02)ED.seek(0);const a=activeAt(ED.t);if(a!==ED.cur)enter(a,ED.t);if(ED.cur&&ED.cur.vid)ED.cur.vid.play().catch(()=>toast('Tap the page, then press Play again.'));}
    else if(ED.cur&&ED.cur.vid)ED.cur.vid.pause();
    sync();
  };
  ED.tick=dt=>{
    if(ED.playing){
      const k=ED.cur;let nt=ED.t+dt;
      if(k&&k.vid&&!k.vid.paused&&!k.vid.seeking){const tv=k.at+(k.vid.currentTime-k.in)/k.speed;if(Math.abs(tv-nt)<.3)nt=tv;}
      ED.t=nt;const a=activeAt(ED.t);
      if(a!==ED.cur&&ED.t<len())enter(a,ED.t);
      if(ED.t>=len()){ED.t=len();if(TLN.loopOn&&!ED.exporting){ED.seek(0);}else{ED.play(false);ED.onEnd&&ED.onEnd();}}
      else if(ED.cur&&ED.cur.kind==='image'&&ED.cur===a){/* held by the clock */}
    }
    TLN.t=ED.t;TLN.apply();if(ED.playing||drag)draw();else if(anim())draw();
  };
  const anim=()=>ED.clips.some(k=>Math.abs(k.vx-k.at)>.002);
  /* ---- editing ---- */
  const selected=()=>ED.clips[ED.sel]||null;
  ED.split=()=>{
    const k=activeAt(ED.t);if(!k)return;const rel=ED.t-k.at;if(rel<.1||rel>dur(k)-.1){toast('Move the playhead inside a clip to split it.');return;}
    const cut=k.in+rel*k.speed,b={...k,id:++uid,in:cut,thumbs:k.thumbs,vx:k.at+rel};k.out=cut;
    ED.clips.splice(ED.clips.indexOf(k)+1,0,b);ED.sel=ED.clips.indexOf(b);layout();sync();draw();
  };
  ED.remove=()=>{const k=selected();if(!k)return;const i=ED.sel;ED.clips.splice(i,1);ED.sel=Math.min(i,ED.clips.length-1);if(ED.cur===k){ED.cur=null;if(k.vid)k.vid.pause();}
    layout();if(ED.clips.length)ED.seek(Math.min(ED.t,len()));else{ED.t=0;ED.playing=false;}sync();draw();};
  ED.setSpeed=v=>{const k=selected();if(!k)return;const a=k.at,t=ED.t;k.speed=v;layout();if(k.vid&&ED.cur===k)k.vid.playbackRate=v;ED.seek(Math.min(len(),t));draw();};
  function sync(){
    if(!host)return;const k=selected(),n=ED.clips.length;
    host.querySelectorAll('.edneeds').forEach(b=>b.disabled=!n);host.querySelector('.edsel').disabled=!k;
    host.querySelector('.edempty').hidden=!!n;spd.value=k?String(k.speed):'1';
    const p=TLN.el&&TLN.el().querySelector('.tlplay');if(p)p.textContent=ED.playing?'Pause':'Play';
    if(selInfo)selInfo.textContent=k?`${k.name} · ${dur(k).toFixed(1)} s`:n?'Tap a clip':'';
  }
  /* ---- track drawing: filmstrip clips, trim handles, playhead; clip positions ease toward their targets ---- */
  const t2x=(t,w)=>(t-TLN.view[0])/(TLN.view[1]-TLN.view[0])*w,x2t=(x,w)=>TLN.view[0]+x/w*(TLN.view[1]-TLN.view[0]);
  function draw(){
    if(!track||!host||host.closest('[hidden]'))return;
    const w=track.clientWidth|0,h=track.clientHeight|0;if(!w)return;if(track.width!==w)track.width=w;if(track.height!==h)track.height=h;
    const g=track.getContext('2d');g.clearRect(0,0,w,h);
    ED.clips.forEach((k,i)=>{k.vx+=(k.at-k.vx)*(drag&&drag.k===k?1:.3);if(Math.abs(k.at-k.vx)<.002)k.vx=k.at;
      const x0=t2x(drag&&drag.k===k?drag.vt:k.vx,w),x1=x0+t2x(TLN.view[0]+dur(k),w),cw=Math.max(2,x1-x0-2),ch=h-6,y=3;
      g.save();g.beginPath();g.roundRect(x0,y,cw,ch,3);g.clip();g.fillStyle='#1c1a18';g.fillRect(x0,y,cw,ch);
      const th=k.thumbs;if(th.length){const tw=ch*80/48;for(let x=x0;x<x0+cw;x+=tw){const f=(x-x0+tw/2)/Math.max(1,cw),im=th[Math.min(th.length-1,Math.floor(f*th.length))];g.drawImage(im,x,y,tw,ch);}}
      g.fillStyle='rgba(10,10,10,.55)';g.fillRect(x0,y+ch-14,cw,14);g.fillStyle='#f2efe8';g.font='10px monospace';g.fillText((k.speed!==1?k.speed+'× ':'')+k.name,x0+5,y+ch-4);g.restore();
      if(i===ED.sel){g.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#ff5a1f';g.lineWidth=2;g.beginPath();g.roundRect(x0+1,y+1,cw-2,ch-2,3);g.stroke();g.fillStyle=g.strokeStyle;g.fillRect(x0,y,7,ch);g.fillRect(x0+cw-6,y,7,ch);}
    });
    g.fillStyle='#f2efe8';g.fillRect(t2x(ED.t,w)-1,0,2,h);
  }
  function loopDraw(){draw();raf=0;}
  /* ---- pointer: tap selects, drag the body reorders, drag a handle trims ---- */
  function pick(x,w){for(let i=ED.clips.length-1;i>=0;i--){const k=ED.clips[i],x0=t2x(k.vx,w),x1=x0+t2x(TLN.view[0]+dur(k),w);if(x>=x0&&x<=x1)return{k,i,edge:i===ED.sel&&x-x0<16?'l':i===ED.sel&&x1-x<16?'r':'body'};}return null;}
  function wire2(){
    track.addEventListener('pointerdown',e=>{
      const r=track.getBoundingClientRect(),w=r.width,x=e.clientX-r.left,hit=pick(x,w);
      if(!hit){ED.seek(x2t(x,w));drag={scrub:true};track.setPointerCapture(e.pointerId);return;}
      ED.sel=hit.i;sync();track.setPointerCapture(e.pointerId);
      drag={k:hit.k,edge:hit.edge,x0:x,t0:hit.k.at,in0:hit.k.in,out0:hit.k.out,vt:hit.k.at,moved:false};draw();
    });
    track.addEventListener('pointermove',e=>{
      if(!drag)return;const r=track.getBoundingClientRect(),w=r.width,x=e.clientX-r.left;
      if(drag.scrub){ED.seek(x2t(x,w));return;}
      const dt=(x-drag.x0)/w*(TLN.view[1]-TLN.view[0]);if(Math.abs(x-drag.x0)>3)drag.moved=true;if(!drag.moved)return;
      const k=drag.k;
      if(drag.edge==='r'){k.out=Math.max(k.in+.2*k.speed,Math.min(k.srcDur,drag.out0+dt*k.speed));layout();}
      else if(drag.edge==='l'){const ni=Math.max(0,Math.min(drag.out0-.2*k.speed,drag.in0+dt*k.speed));k.in=ni;layout();}
      else{drag.vt=Math.max(0,drag.t0+dt);
        const mid=drag.vt+dur(k)/2;let ni=ED.clips.length-1;for(let i=0;i<ED.clips.length;i++){const o=ED.clips[i];if(o===k)continue;if(mid<o.at+dur(o)/2){ni=ED.clips.indexOf(k)<i?i-1:i;break;}}
        const cur=ED.clips.indexOf(k);if(ni!==cur){ED.clips.splice(cur,1);ED.clips.splice(ni,0,k);ED.sel=ni;const keep=drag.vt;layout();drag.vt=keep;}}
      draw();
    });
    const up=()=>{if(drag&&!drag.scrub&&drag.moved){drag.vt=null;layout();ED.seek(Math.min(ED.t,len()));}drag=null;sync();draw();};
    track.addEventListener('pointerup',up);track.addEventListener('pointercancel',up);
  }
  /* ---- UI ---- */
  ED.mount=()=>{
    const th=TLN.el&&TLN.el();if(!th)return;host=el('div','edwrap');
    host.innerHTML=`<div class="edbar"><button class="edadd">+ Clip</button><button class="edneeds edsplit">Split</button><button class="edneeds edsel edrm">Delete</button><select class="edneeds edsel edspd" aria-label="Speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="4">4×</option></select><button class="edmute" aria-pressed="false">Sound</button><button class="edneeds edexp">Export</button><span class="edinfo"></span></div>
    <canvas class="edtrack"></canvas><div class="edempty">Add videos or photos. Drag a clip to reorder it, drag its edges to trim, tap Split to cut at the playhead. Your looks and keyframes apply to everything.</div>`;
    const ruler=th.querySelector('.tlruler');ruler.after(host);
    track=host.querySelector('.edtrack');spd=host.querySelector('.edspd');selInfo=host.querySelector('.edinfo');
    const inp=document.createElement('input');inp.type='file';inp.accept='video/*,image/*';inp.multiple=true;inp.hidden=true;host.appendChild(inp);
    inp.addEventListener('change',()=>{const f=[...inp.files];inp.value='';if(f.length)ED.addFiles(f);});
    host.querySelector('.edadd').addEventListener('click',()=>inp.click());
    host.querySelector('.edsplit').addEventListener('click',()=>ED.split());host.querySelector('.edrm').addEventListener('click',()=>ED.remove());
    spd.addEventListener('change',()=>ED.setSpeed(+spd.value));
    host.querySelector('.edmute').addEventListener('click',e=>{ED.mute=!ED.mute;e.currentTarget.setAttribute('aria-pressed',ED.mute);if(audio)audio.mon.gain.value=ED.mute?0:1;});
    host.querySelector('.edexp').addEventListener('click',()=>ED.onExport&&ED.onExport());
    wire2();sync();
  };
  ED.setExporting=on=>{ED.exporting=on;};
  return ED;
}
