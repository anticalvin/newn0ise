/* Controller support (PS5 DualSense, Xbox and other standard pads) for the whole 3D app.
   The left stick drives an on-screen cursor that clicks, drags, scrolls and slides sliders anywhere, so every button, sheet, tool and
   canvas works. The right stick orbits the camera, the triggers zoom, and the shoulder and d-pad buttons jump between tabs and tools. */
const GP_ID=777;
const DEAD=.14;
export function createGamepad(c){
  const {camera,controls,S,toast,sheet,bump,cycle,vert,undo,redo,canvas,THREE,getWalk,scene:SC}=c;
  let CFG={swap:false,invY:false,rumble:true};try{Object.assign(CFG,JSON.parse(localStorage.getItem('n0.gpcfg')||'{}'));}catch(e){}
  const saveCfg=()=>{try{localStorage.setItem('n0.gpcfg',JSON.stringify(CFG));}catch(e){}};
  const rep={};let sony=false;
  const st={pad:null,x:innerWidth/2,y:innerHeight/2,show:false,idle:0,down:null,prev:[],slow:false,speed:+(localStorage.getItem('n0.gpspeed')||1),legend:false,lastHot:null,rumble:CFG.rumble}; window.__n0gp=st;
  /* the app's own pointer-capture calls would throw for a pointer the browser doesn't know; let them pass quietly for the controller's pointer */
  for(const fn of ['setPointerCapture','releasePointerCapture']){const o=Element.prototype[fn];Element.prototype[fn]=function(id){try{return o.call(this,id);}catch(e){if(id!==GP_ID)throw e;}};}
  const css=document.createElement('style');css.textContent=`#gpcur{position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.65),0 2px 8px rgba(0,0,0,.5);z-index:100000;pointer-events:none;display:none;transition:transform .08s,background .1s}
#gpcur::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.65)}
#gpcur[data-d=true]{transform:scale(.7);background:rgba(255,90,31,.55)}
.gp-hot{outline:3px solid #ffd23d!important;outline-offset:1px}
#gppie{position:fixed;left:50%;top:50%;width:0;height:0;z-index:100002;display:none}
#gppie .pi{position:absolute;width:86px;height:46px;margin:-23px 0 0 -43px;line-height:1.1;display:grid;place-items:center;border-radius:18px;background:rgba(14,15,18,.92);border:1px solid rgba(255,255,255,.2);color:#eee;font:800 12px var(--lab,monospace);text-align:center;letter-spacing:.04em;transition:transform .08s}
#gppie .pi.on{background:#ff5a1f;color:#111;transform:scale(1.14);border-color:#fff}#gppie .pc{position:absolute;width:10px;height:10px;margin:-5px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.6)}
#gphud{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 66px);transform:translateX(-50%);z-index:100002;display:none;max-width:calc(100vw - 20px);padding:10px 16px;border-radius:16px;background:rgba(14,15,18,.92);border:1px solid rgba(255,255,255,.2);color:#eee;font:700 12px/1.4 var(--lab,monospace);text-align:center}#gphud b{color:#ffd23d}
#gplegend{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100001;width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow-y:auto;padding:16px;border-radius:20px;background:rgba(14,15,18,.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.18);color:#eee;font:600 12px/1.55 var(--lab,ui-monospace,monospace);display:none}
#gplegend b{display:inline-block;min-width:78px;color:#ffd23d}
#gplegend h4{margin:0 0 8px;font:800 15px var(--disp,system-ui)}
#gplegend .r{display:flex;gap:8px;margin:2px 0}
#gplegend input[type=range]{width:100%;min-height:36px}
#gplegend .gpck{align-items:center;min-height:44px}#gplegend .gpck input{width:22px;height:22px}
#gplegend button{min-height:44px;padding:0 16px;margin-top:10px;border-radius:12px;border:0;background:#ff5a1f;color:#111;font:800 12px var(--lab,monospace);letter-spacing:.06em;text-transform:uppercase}`;document.head.appendChild(css);
  const cur=document.createElement('div');cur.id='gpcur';cur.setAttribute('aria-hidden','true');document.body.appendChild(cur);
  const lg=document.createElement('div');lg.id='gplegend';lg.setAttribute('role','dialog');lg.setAttribute('aria-label','Controller help');
  const G=()=>sony?{a:'✕',b:'○',x:'□',y:'△',sel:'Create',opt:'Options'}:{a:'A',b:'B',x:'X',y:'Y',sel:'View',opt:'Menu'};
  function renderLegend(){
    const g=G();
    lg.innerHTML='<h4>Controller</h4>'+
    [['Left stick','Move the cursor (walk, in walk mode)'],[g.a,'Click, hold to drag or draw'],[g.b,'Cancel, close or leave walk'],[g.x,'Undo'],[g.y,'Tap: show or hide panel. Hold: pie menu (grab, rotate, scale, add, sculpt)'],['Right stick','Orbit the view, scroll a panel, or look'],['L2 / R2','Zoom out and in'],['L1 / R1','Previous and next tab'],['D-pad over a panel','Jump between buttons'],['D-pad ◀ ▶ over the scene','Previous and next tool, object, or sculpt brush'],['D-pad ▲ ▼ over the scene','Level up and down, or brush size'],['L3','Slow, precise cursor (run, in walk mode)'],['R3','Scale the selected object (over a panel: cursor to the middle)'],[g.sel,'Frame everything'],[g.opt,'This help']]
      .map(([k,v])=>'<div class="r"><b>'+k+'</b><span>'+v+'</span></div>').join('')+
    '<div class="r" style="margin-top:8px"><b>Cursor speed</b><input type="range" id="gpspd" min="0.5" max="2" step="0.1" aria-label="Cursor speed"></div>'+
    '<label class="r gpck"><input type="checkbox" id="gpswap"> Swap sticks (left hand)</label><label class="r gpck"><input type="checkbox" id="gpinv"> Invert look up and down</label><label class="r gpck"><input type="checkbox" id="gprum"> Vibration</label><button type="button" id="gpok">Got it</button>';
    const spd=lg.querySelector('#gpspd');spd.value=st.speed;spd.addEventListener('input',()=>{st.speed=+spd.value;try{localStorage.setItem('n0.gpspeed',st.speed);}catch(e){}});
    const ck=(id,k,f)=>{const i=lg.querySelector(id);i.checked=!!CFG[k];i.addEventListener('change',()=>{CFG[k]=i.checked;saveCfg();f&&f();});};
    ck('#gpswap','swap');ck('#gpinv','invY');ck('#gprum','rumble',()=>{st.rumble=CFG.rumble;buzz(40,.2,.4);});
    lg.querySelector('#gpok').addEventListener('click',()=>showLegend(false));
  }
  document.body.appendChild(lg);
  const pie=document.createElement('div');pie.id='gppie';pie.setAttribute('aria-hidden','true');document.body.appendChild(pie);
  const hud=document.createElement('div');hud.id='gphud';hud.setAttribute('role','status');document.body.appendChild(hud);
  const wasHidden=()=>0;
  function showLegend(v){if(v)renderLegend();st.legend=v;lg.style.display=v?'block':'none';}

  const pads=()=>{try{return Array.from(navigator.getGamepads?navigator.getGamepads():[]).filter(Boolean);}catch(e){return [];}};
  const buzz=(ms,a=.2,b=.35)=>{if(!st.rumble)return;try{const p=st.pad;const act=p&&(p.vibrationActuator||(p.hapticActuators&&p.hapticActuators[0]));if(act&&act.playEffect)act.playEffect('dual-rumble',{startDelay:0,duration:ms,weakMagnitude:b,strongMagnitude:a});else if(act&&act.pulse)act.pulse(a,ms);}catch(e){}};
  const ax=(p,i)=>{const v=p.axes[i]||0;if(Math.abs(v)<DEAD)return 0;return Math.sign(v)*((Math.abs(v)-DEAD)/(1-DEAD));};
  const btn=(p,i)=>!!(p.buttons[i]&&(p.buttons[i].pressed||p.buttons[i].value>.6));
  const val=(p,i)=>(p.buttons[i]&&p.buttons[i].value)||0;
  const pt=(t,type,extra)=>{const e=new PointerEvent(type,{pointerId:GP_ID,pointerType:'mouse',isPrimary:true,clientX:st.x,clientY:st.y,button:0,buttons:type==='pointerup'||type==='pointermove'&&!st.down?0:1,bubbles:true,cancelable:true,composed:true,...extra});t.dispatchEvent(e);};
  const mouse=(t,type)=>{try{t.dispatchEvent(new MouseEvent(type,{clientX:st.x,clientY:st.y,button:0,buttons:type==='mouseup'?0:1,bubbles:true,cancelable:true,view:window}));}catch(e){}};
  /* Page zoom (the big-monitor scale-up, browser zoom) makes screen, layout and hit-test coordinates disagree, so the drawn cursor sat away from where clicks landed.
     A probe box measures both once: ZR = rect pixels per CSS pixel, and whether elementFromPoint wants rect pixels or CSS pixels. */
  let ZR=1,HIT_CSS=false;
  function calibrate(){
    try{const pr=document.createElement('div');pr.style.cssText='position:fixed;left:100px;top:100px;width:60px;height:60px;opacity:0;pointer-events:auto;z-index:2147483646';document.body.appendChild(pr);
      const r=pr.getBoundingClientRect();ZR=r.width>0?r.width/60:1;if(!(ZR>.2&&ZR<6))ZR=1;
      const inRectSpace=document.elementFromPoint(r.left+30,r.top+30)===pr;HIT_CSS=!inRectSpace&&document.elementFromPoint(130,130)===pr;pr.remove();}catch(e){ZR=1;HIT_CSS=false;}
  }
  calibrate();addEventListener('resize',calibrate);
  const place=()=>{cur.style.left=(st.x/ZR)+'px';cur.style.top=(st.y/ZR)+'px';};
  const inRect=(e,x=st.x,y=st.y,pad=1)=>{const r=e.getBoundingClientRect();return x>=r.left-pad&&x<=r.right+pad&&y>=r.top-pad&&y<=r.bottom+pad;};
  const hit=()=>{cur.style.display='none';
    const px=HIT_CSS?st.x/ZR:st.x,py=HIT_CSS?st.y/ZR:st.y;let t=document.elementFromPoint(px,py);
    if(t&&!inRect(t)){const alt=document.elementsFromPoint(px,py).find(e=>inRect(e));if(alt)t=alt;}
    cur.style.display='block';return t;};
  const interactive=t=>t&&t.closest&&t.closest('button,a,input,select,textarea,summary,[role=button],[role=tab],.card,.chip,.tab,label');
  function hot(t){const h=interactive(t);if(st.lastHot&&st.lastHot!==h)st.lastHot.classList.remove('gp-hot');if(h&&!(h.tagName==='CANVAS')){h.classList.add('gp-hot');st.lastHot=h;}else st.lastHot=null;}
  function slide(inp){const r=inp.getBoundingClientRect(),f=clamp((st.x-r.left)/Math.max(1,r.width),0,1),mn=+inp.min||0,mx=+inp.max||100,stp=+inp.step||1;let v=mn+(mx-mn)*f;v=Math.round(v/stp)*stp;v=clamp(v,mn,mx);if(+inp.value!==v){inp.value=v;inp.dispatchEvent(new Event('input',{bubbles:true}));}}
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function scrollable(t){let n=t;while(n&&n!==document.body){const o=getComputedStyle(n).overflowY;if((o==='auto'||o==='scroll')&&n.scrollHeight>n.clientHeight+4)return n;n=n.parentElement;}return null;}

  function nearest(max){
    let best=null,bd=max*max;
    document.querySelectorAll('button,a[href],input:not([type=hidden]),select,summary,[role=button],[role=tab],label,.chip,.tab').forEach(n=>{
      const r=n.getBoundingClientRect();if(r.width<4||r.height<4||r.width>420||r.height>200)return;
      const dx=Math.max(r.left-st.x,0,st.x-r.right),dy=Math.max(r.top-st.y,0,st.y-r.bottom),d=dx*dx+dy*dy;if(d>=bd)return;
      const cs=getComputedStyle(n);if(cs.visibility==='hidden'||cs.display==='none'||cs.pointerEvents==='none'||n.disabled)return;
      const e=document.elementFromPoint(Math.min(Math.max(st.x,r.left+1),r.right-1),Math.min(Math.max(st.y,r.top+1),r.bottom-1));
      if(e&&(n===e||n.contains(e)||e.contains(n))){bd=d;best=n;}});
    return best;
  }
  function press(){
    let t=hit();const hh=st.lastHot;if(hh&&hh.isConnected&&inRect(hh,st.x,st.y,10)&&(!t||!hh.contains(t)))t=hh; /* what is highlighted is what gets clicked */
    /* click assist: a press that lands just beside a control (the cursor was still drifting into it) goes to the nearest control within 40px */
    if(!interactive(t)||t.tagName==='CANVAS'){const n=nearest(40);if(n){t=n;const r=n.getBoundingClientRect();st.x=r.left+r.width/2;st.y=r.top+r.height/2;place();hot(n);}}
    if(!t)return;st.down={t,x:st.x,y:st.y,moved:false};cur.dataset.d='true';buzz(25,.1,.2);
    if(t.matches&&t.matches('input[type=range]')){slide(t);return;}
    pt(t,'pointerdown');mouse(t,'mousedown');
    if(t.matches&&t.matches('input:not([type=range]):not([type=color]):not([type=checkbox]),textarea'))try{t.focus();}catch(e){}
  }
  function release(){
    const d=st.down;if(!d)return;st.down=null;cur.dataset.d='false';let t=d.t;if(!t.isConnected){const n=hit();if(n)t=n;} /* the panel re-drew while the button was held */
    if(t.matches&&t.matches('input[type=range]')){t.dispatchEvent(new Event('change',{bubbles:true}));return;}
    pt(t,'pointerup');mouse(t,'mouseup');
    if(!d.moved&&t.matches&&t.matches('textarea,input:not([type=range]):not([type=color]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file])')){
      const v=prompt((t.getAttribute('aria-label')||t.placeholder||'Type here')+(sony?'':''),t.value);if(v!=null){t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));}return;}
    if(t.tagName!=='CANVAS'&&!d.moved){try{(interactive(t)||t).dispatchEvent(new MouseEvent('click',{clientX:st.x,clientY:st.y,button:0,bubbles:true,cancelable:true,view:window}));}catch(e){}buzz(18,.08,.25);}
  }
  function orbit(dt,rx,ry){
    if(!camera||!controls){window.scrollBy(0,ry*dt*900);return;}
    const off=camera.position.clone().sub(controls.target),sph=new THREE.Spherical().setFromVector3(off);
    sph.theta-=rx*dt*2.4;sph.phi=clamp(sph.phi+ry*dt*1.9,.06,Math.PI-.06);off.setFromSpherical(sph);camera.position.copy(controls.target).add(off);camera.lookAt(controls.target);controls.update();bump();
  }
  function zoom(dt,k){
    if(!camera||!controls){window.scrollBy(0,k*dt*700);return;}
    const off=camera.position.clone().sub(controls.target),d=off.length(),nd=clamp(d*(1+k*dt*1.6),.4,400);off.setLength(nd);camera.position.copy(controls.target).add(off);controls.update();bump();
  }
  function pan(dt,dx,dz){
    if(!camera||!controls)return;
    const f=new THREE.Vector3();camera.getWorldDirection(f);f.y=0;if(f.lengthSq()<1e-4)f.set(0,0,-1);f.normalize();const r=new THREE.Vector3(-f.z,0,f.x),d=camera.position.distanceTo(controls.target)*.9,mv=f.multiplyScalar(-dz*dt*d).add(r.multiplyScalar(dx*dt*d));
    camera.position.add(mv);controls.target.add(mv);controls.update();bump();
  }
  const tabs=()=>[...document.querySelectorAll('.tabs .tab')];
  const stepTab=d=>{const t=tabs();if(!t.length)return;let i=t.findIndex(b=>b.getAttribute('aria-selected')==='true');i=(i+d+t.length)%t.length;t[i].click();t[i].scrollIntoView&&t[i].scrollIntoView({inline:'center',block:'nearest'});buzz(15,.05,.2);};
  const key=(k,mod)=>{document.body.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...mod}));};
  /* D-pad over a panel jumps to the nearest button in that direction, so menus work without steering the cursor */
  function navDir(dx,dy){
    const root=st.legend?lg:document.body,ox=st.x,oy=st.y;let best=null,bs=1e9;
    root.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button],[role=tab],label,.card,.chip,.tab').forEach(n=>{
      if(n.closest('#gpcur')||(!st.legend&&n.closest('#gplegend')))return;
      const r=n.getBoundingClientRect();if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return;
      const cx=Math.min(innerWidth-2,Math.max(2,r.left+r.width/2)),cy=Math.min(innerHeight-2,Math.max(2,r.top+r.height/2));
      const vx=cx-ox,vy=cy-oy,along=vx*dx+vy*dy,perp=Math.abs(vx*dy-vy*dx);if(along<6)return;
      const e=document.elementFromPoint(cx,cy);if(!e||!(n===e||n.contains(e)||e.contains(n)))return;
      const sc=along+perp*2.4;if(sc<bs){bs=sc;best={x:cx,y:cy,n};}
    });
    if(best){st.x=best.x;st.y=best.y;place();hot(best.n);buzz(10,.04,.12);return true;}
    return false;
  }
  const overPanel=()=>{const t=hit();return !!t&&t.tagName!=='CANVAS'&&!t.closest('#walkui');};
  /* held directions repeat after a short wait */
  const edgeR=(i,on,dt)=>{if(!on){rep[i]=0;return false;}if(!rep[i]){rep[i]=.0001;return true;}rep[i]+=dt;if(rep[i]>.42){rep[i]=.3;return true;}return false;};
  /* ---------- aim assist: small buttons pull the cursor to their middle when you slow down ---------- */
  let mag=[],magT=0;
  function magnet(now){
    if(now-magT>350){magT=now;mag=[];document.querySelectorAll('button,a[href],input,select,summary,[role=button],[role=tab],label,.chip,.tab').forEach(n=>{const r=n.getBoundingClientRect();if(r.width<4||r.height<4||r.width>150||r.height>110||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return;mag.push({n,x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height});});}
    let best=null,bd=28*28;for(const m of mag){const dx=m.x-st.x,dy=m.y-st.y,d=dx*dx+dy*dy;if(d<bd&&Math.abs(dx)<m.w/2+26&&Math.abs(dy)<m.h/2+26){bd=d;best=m;}}
    if(!best||bd<2)return;
    const e=document.elementFromPoint(best.x,best.y);if(!e||!(best.n===e||best.n.contains(e)||e.contains(best.n)))return;
    st.x+=(best.x-st.x)*.28;st.y+=(best.y-st.y)*.28;
  }
  /* ---------- pie menu (hold Y / △) ---------- */
  function openPie(items,sticky){
    /* more than eight items: seven per page plus a "More" tile, so tiles never overlap */
    if(items.length>8&&!items.paged){const pages=[];for(let i=0;i<items.length;i+=7)pages.push(items.slice(i,i+7));
      const mk=n=>{const pg=pages[n].slice();if(pages.length>1)pg.push({label:'More ▸',page:true,run:()=>openPie(mk((n+1)%pages.length),true)});pg.paged=true;return pg;};items=mk(0);}
    st.pie={items,sel:-1,sticky:!!sticky||!!items.paged&&items.some(x=>x.page)&&sticky};pie.innerHTML='';
    const R=Math.max(96,Math.min(150,Math.min(innerWidth,innerHeight)/2-52));
    items.forEach((it,i)=>{const a=-Math.PI/2+i/items.length*Math.PI*2,d=document.createElement('div');d.className='pi';d.textContent=it.label;d.style.left=Math.cos(a)*R+'px';d.style.top=Math.sin(a)*R+'px';pie.appendChild(d);});
    const c0=document.createElement('div');c0.className='pc';pie.appendChild(c0);pie.style.display='block';cur.style.display='none';buzz(30,.1,.2);
  }
  function closePie(){st.pie=null;pie.style.display='none';if(st.show)cur.style.display='block';}
  function pieStick(lx,ly){
    const P=st.pie;if(!P)return;const m=Math.hypot(lx,ly);let sel=P.sel;
    if(m>.5){let a=Math.atan2(ly,lx)+Math.PI/2;if(a<0)a+=Math.PI*2;sel=Math.round(a/(Math.PI*2)*P.items.length)%P.items.length;}
    if(sel!==P.sel){P.sel=sel;[...pie.querySelectorAll('.pi')].forEach((d,i)=>d.classList.toggle('on',i===sel));if(sel>=0)buzz(10,.04,.15);}
  }
  function pieItems(){
    if(!SC)return null;
    if(SC.empty&&SC.empty()){ /* nothing in the scene yet: start with what you can create */
      return [{label:'Add ▸',sub:SC.shapes.map(k=>({label:k,run:()=>SC.add(k)}))},{label:'Import',run:()=>SC.import&&SC.import()},{label:'Draw',run:()=>SC.draw&&SC.draw()},{label:'Demo',run:()=>SC.demo&&SC.demo()},{label:'Clay ▸ sculpt',run:()=>SC.sculpt()},{label:'My character',run:()=>SC.character&&SC.character()}];}
    const o=SC.sel&&SC.sel();const need=f=>()=>{if(!SC.sel()){toast('Pick an object first.');return;}f();};
    return [{label:'Grab',run:need(()=>startMod('grab'))},{label:'Rotate',run:need(()=>startMod('rotate'))},{label:'Scale',run:need(()=>startMod('scale'))},
      {label:'Add ▸',sub:SC.shapes.map(k=>({label:k,run:()=>SC.add(k)}))},{label:'Duplicate',run:need(()=>SC.dup())},{label:'Delete',run:need(()=>SC.del())},
      {label:SC.sculpting()?'Stop sculpt':'Sculpt',run:()=>SC.sculpt()},{label:'Material',run:()=>SC.mat()}];
  }
  /* ---------- Blender-style modal Grab / Rotate / Scale ---------- */
  const MODT={grab:'<b>Grab</b> · left stick moves, right stick up and down · R1 snaps · L3 fine',rotate:'<b>Rotate</b> · left stick tilts and turns, right stick rolls · R1 snaps to 15°',scale:'<b>Scale</b> · left stick up/down: whole size · right stick: width and height · R2/L2: depth · R1 snaps · L3 fine'};
  function startMod(mode){
    const o=SC.sel();if(!o)return;const h=o.holder;
    st.mod={mode,o,h,p0:h.position.clone(),r0:h.rotation.clone(),s0:h.scale.clone(),p:h.position.clone(),r:new THREE.Euler().copy(h.rotation),k:1,ky:1};
    hud.innerHTML=MODT[mode]+'<br>'+G().a+' confirm · '+G().b+' cancel';hud.style.display='block';cur.style.display='none';buzz(30,.1,.2);
  }
  function endMod(ok){const m=st.mod;if(!m)return;st.mod=null;hud.style.display='none';if(st.show)cur.style.display='block';
    if(ok){SC.commit&&SC.commit();toast('Done',700);}else{m.h.position.copy(m.p0);m.h.rotation.copy(m.r0);m.h.scale.copy(m.s0);}
    bump();buzz(ok?25:15,.1,.2);}
  function modFrame(dt,lx,ly,rx,ry,snap,slow){
    const m=st.mod,f=slow?.22:1,h=m.h;
    if(m.mode==='grab'){
      const fw=new THREE.Vector3();camera.getWorldDirection(fw);fw.y=0;if(fw.lengthSq()<1e-4)fw.set(0,0,-1);fw.normalize();const rt=new THREE.Vector3(-fw.z,0,fw.x),sp=Math.max(.6,camera.position.distanceTo(controls.target))*.9*dt*f;
      m.p.addScaledVector(rt,lx*sp).addScaledVector(fw,-ly*sp);m.p.y-=ry*sp;
      h.position.copy(m.p);if(snap){const q=.25;h.position.set(Math.round(m.p.x/q)*q,Math.round(m.p.y/q)*q,Math.round(m.p.z/q)*q);}
    }else if(m.mode==='rotate'){
      m.r.y+=lx*dt*2.2*f;m.r.x+=ly*dt*2.2*f;m.r.z+=rx*dt*2.2*f;const q=Math.PI/12;
      h.rotation.set(snap?Math.round(m.r.x/q)*q:m.r.x,snap?Math.round(m.r.y/q)*q:m.r.y,snap?Math.round(m.r.z/q)*q:m.r.z);
    }else{
      const tr=(val(st.pad,7)||0)-(val(st.pad,6)||0); /* R2 deeper, L2 shallower */
      m.k=Math.max(.02,m.k*(1-ly*dt*1.3*f));m.ky=Math.max(.05,m.ky*(1-ry*dt*1.2*f));m.kx=Math.max(.05,(m.kx||1)*(1+rx*dt*1.2*f));m.kz=Math.max(.05,(m.kz||1)*(1+tr*dt*1.2*f));
      const k=snap?Math.max(.1,Math.round(m.k*10)/10):m.k,ky=snap?Math.max(.1,Math.round(m.ky*10)/10):m.ky;
      const sq=v=>snap?Math.max(.1,Math.round(v*10)/10):v;h.scale.set(m.s0.x*k*sq(m.kx||1),m.s0.y*k*ky,m.s0.z*k*sq(m.kz||1));
    }
    bump();
  }
  const wk=['KeyW','KeyA','KeyS','KeyD','ShiftLeft'];
  let wasWalk=false;
  let last=performance.now();
  function frame(now){
    requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;
    const list=pads();const p=list.find(x=>x.mapping==='standard')||list[0];st.pad=p||null;
    if(!p){if(st.show){st.show=false;cur.style.display='none';}return;}
    sony=/054c|dualsense|dualshock|wireless controller/i.test(p.id||'');
    const sx=ax(p,0),sy=ax(p,1),tx=ax(p,2),ty=ax(p,3),lx=CFG.swap?tx:sx,ly=CFG.swap?ty:sy,rx=CFG.swap?sx:tx,ry0=CFG.swap?sy:ty,ry=CFG.invY?-ry0:ry0,b=i=>btn(p,i),pb=i=>st.prev[i];
    const W=getWalk&&getWalk();
    if(W&&W.on){
      /* walking: left stick moves, right stick looks, A jumps, R2 acts, L3 runs, B leaves */
      wasWalk=true;cur.style.display='none';
      W.setStick&&W.setStick(lx,ly);W.rotate(-rx*dt*2.7,-ry*dt*2);
      const run=btn(p,10);run?W.keys.add('ShiftLeft'):W.keys.delete('ShiftLeft');
      if(btn(p,0)&&!st.prev[0])document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
      if(!btn(p,0)&&st.prev[0])document.body.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));
      if(val(p,7)>.5&&!st.fire){st.fire=true;const r=canvas.getBoundingClientRect(),o={pointerId:GP_ID,pointerType:'mouse',isPrimary:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,buttons:1,bubbles:true,cancelable:true};canvas.dispatchEvent(new PointerEvent('pointerdown',o));canvas.dispatchEvent(new PointerEvent('pointerup',{...o,buttons:0}));buzz(30,.2,.3);}
      if(val(p,7)<.3)st.fire=false;
      if(btn(p,1)&&!st.prev[1])key('Escape');
      if(btn(p,9)&&!st.prev[9])showLegend(!st.legend);
      st.prev=p.buttons.map(x=>x.pressed);return;
    }
    if(SC&&(st.pie||st.mod)){
      st.show=true;st.idle=0;
      if(st.mod){modFrame(dt,lx,ly,rx,ry,btn(p,5),btn(p,10));if(btn(p,0)&&!st.prev[0])endMod(true);else if(btn(p,1)&&!st.prev[1])endMod(false);}
      else{pieStick(lx,ly);
        if(st.pie.sticky){if(btn(p,0)&&!st.prev[0]){const it=st.pie.items[st.pie.sel];closePie();it&&(it.sub?openPie(it.sub,true):it.run());}if(btn(p,1)&&!st.prev[1])closePie();}
        else if(btn(p,1)&&!st.prev[1]){closePie();st.yHeld=false;}
        else if(!btn(p,3)){const it=st.pie.items[st.pie.sel];closePie();st.yHeld=false;if(it){if(it.sub)openPie(it.sub,true);else it.run();}}}
      st.prev=p.buttons.map(x=>x.pressed);return;
    }
    if(wasWalk){wasWalk=false;W&&W.setStick&&W.setStick(0,0);wk.forEach(k=>W&&W.keys.delete(k));if(st.show)cur.style.display='block';}
    const edge=i=>b(i)&&!pb(i);
    const active=lx||ly||rx||ry||p.buttons.some(x=>x.pressed)||val(p,6)>.1||val(p,7)>.1;
    if(active){st.idle=0;if(!st.show){st.show=true;cur.style.display='block';}}else st.idle+=dt;
    if(st.show&&st.idle>8&&!st.down){st.show=false;cur.style.display='none';if(st.lastHot){st.lastHot.classList.remove('gp-hot');st.lastHot=null;}}
    if(!st.show){st.prev=p.buttons.map(x=>x.pressed);return;}
    /* cursor */
    const sp=(st.slow?260:900)*st.speed*Math.max(.6,Math.min(innerWidth,innerHeight)/720);
    const mag=Math.hypot(lx,ly),cv=mag?Math.pow(mag,1.6)/mag:0;
    if(lx||ly){st.x=clamp(st.x+lx*cv*sp*dt,0,innerWidth-1);st.y=clamp(st.y+ly*cv*sp*dt,0,innerHeight-1);if(st.down&&Math.hypot(st.x-st.down.x,st.y-st.down.y)>12)st.down.moved=true;} /* a little stick drift while pressing is still a click */
    if(!st.down&&Math.hypot(lx,ly)<.45)magnet(now);
    place();
    const t=st.down?st.down.t:hit();
    if(lx||ly||!st.pad.__hov){if(t&&!st.down)hot(t);}
    if(lx||ly){
      if(st.down){const d=st.down.t;if(d.matches&&d.matches('input[type=range]'))slide(d);else{pt(d,'pointermove');mouse(d,'mousemove');}}
      else if(t){pt(t,'pointermove');mouse(t,'mousemove');}
    }
    /* right stick: orbit, or scroll the panel under the cursor */
    if(rx||ry){const sc=scrollable(t);if(sc&&(sc.closest('#panes,.sheet,#sheet,#pane_mat,#pane_build,.pane')||sc!==document.scrollingElement)&&t&&t.tagName!=='CANVAS'){sc.scrollTop+=ry*dt*1100;}else orbit(dt,rx,ry);}
    /* triggers */
    const lt=val(p,6),rt=val(p,7);if(rt>.08)zoom(dt,-rt);if(lt>.08)zoom(dt,lt);
    /* buttons */
    for(let i=0;i<18;i++)if(edge(i)){(st.log=st.log||[]).push(i);if(st.log.length>20)st.log.shift();}
    if(edge(0))press();if(!b(0)&&pb(0))release();
    if(edge(1)){if(st.legend)showLegend(false);else key('Escape');buzz(15,.05,.2);}
    if(edge(2)){if(undo)undo();else key('z',{ctrlKey:true});buzz(20,.1,.2);}
    if(edge(3)){st.yHeld=true;st.yt=0;}
    if(st.yHeld){st.yt+=dt;
      if(b(3)&&st.yt>.35&&SC&&!st.legend){const it=pieItems();if(it)openPie(it);}
      else if(!b(3)){st.yHeld=false;const idx=sheet&&sheet.idx;if(sheet&&idx!=null)sheet.setIdx(idx>0?0:2);buzz(15,.05,.2);}}
    if(edge(4))stepTab(-1);if(edge(5))stepTab(1);
    const pnl=(b(12)||b(13)||b(14)||b(15))?overPanel():false;
    if(!pnl&&!st.legend){if(edgeR(14,b(14),dt)){cycle&&cycle(-1);buzz(12,.04,.15);}if(edgeR(15,b(15),dt)){cycle&&cycle(1);buzz(12,.04,.15);}}
    if(pnl||st.legend){const d=[[12,0,-1],[13,0,1],[14,-1,0],[15,1,0]];for(const [i,dx,dy] of d)if(edgeR(i,b(i),dt)){if(!navDir(dx,dy)&&dy){const sc=scrollable(hit());if(sc)sc.scrollTop+=dy*220;}}}
    else{rep[12]=rep[13]=0;
      if(edgeR(12,b(12),dt)){const used=vert&&vert(1);if(!used){const sc=scrollable(hit());if(sc)sc.scrollTop-=220;}}
      if(edgeR(13,b(13),dt)){const used=vert&&vert(-1);if(!used){const sc=scrollable(hit());if(sc)sc.scrollTop+=220;}}}
    if(edge(8)){const f=document.getElementById('bFrame');f&&f.click();}
    if(edge(9))showLegend(!st.legend);
    if(edge(10)){st.slow=!st.slow;toast(st.slow?'Precise cursor':'Normal cursor',1200);}
    if(edge(11)){if(SC&&SC.sel&&SC.sel()&&!(overPanel&&overPanel())){startMod('scale');}else{st.x=innerWidth/2;st.y=innerHeight/2;}}
    st.prev=p.buttons.map(x=>x.pressed);
  }
  addEventListener('gamepadconnected',e=>{st.show=true;st.idle=0;cur.style.display='block';sony=/054c|dualsense|dualshock|wireless controller/i.test(e.gamepad.id||'');toast('Controller connected: '+(e.gamepad.id||'').replace(/\s*\(.*$/,'').slice(0,32)+'. Left stick moves the cursor, '+G().a+' clicks. '+G().opt+' shows help.',5500);buzz(60,.2,.4);});
  addEventListener('gamepaddisconnected',()=>{if(!pads().length){st.show=false;cur.style.display='none';toast('Controller disconnected.',2500);}});
  requestAnimationFrame(frame);
  return {showLegend,state:st,startMod,pieItems};
}
