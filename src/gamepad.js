/* Controller support (PS5 DualSense, Xbox and other standard pads) for the whole 3D app.
   The left stick drives an on-screen cursor that clicks, drags, scrolls and slides sliders anywhere, so every button, sheet, tool and
   canvas works. The right stick orbits the camera, the triggers zoom, and the shoulder and d-pad buttons jump between tabs and tools. */
const GP_ID=777;
const DEAD=.14;
export function createGamepad(c){
  const {camera,controls,S,toast,sheet,bump,cycle,vert,undo,redo,canvas,THREE}=c;
  const st={pad:null,x:innerWidth/2,y:innerHeight/2,show:false,idle:0,down:null,prev:[],slow:false,speed:+(localStorage.getItem('n0.gpspeed')||1),legend:false,lastHot:null,rumble:true};
  /* the app's own pointer-capture calls would throw for a pointer the browser doesn't know; let them pass quietly for the controller's pointer */
  for(const fn of ['setPointerCapture','releasePointerCapture']){const o=Element.prototype[fn];Element.prototype[fn]=function(id){try{return o.call(this,id);}catch(e){if(id!==GP_ID)throw e;}};}
  const css=document.createElement('style');css.textContent=`#gpcur{position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.65),0 2px 8px rgba(0,0,0,.5);z-index:100000;pointer-events:none;display:none;transition:transform .08s,background .1s}
#gpcur::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.65)}
#gpcur[data-d=true]{transform:scale(.7);background:rgba(255,90,31,.55)}
.gp-hot{outline:3px solid #ffd23d!important;outline-offset:1px}
#gplegend{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100001;width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow-y:auto;padding:16px;border-radius:20px;background:rgba(14,15,18,.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.18);color:#eee;font:600 12px/1.55 var(--lab,ui-monospace,monospace);display:none}
#gplegend b{display:inline-block;min-width:78px;color:#ffd23d}
#gplegend h4{margin:0 0 8px;font:800 15px var(--disp,system-ui)}
#gplegend .r{display:flex;gap:8px;margin:2px 0}
#gplegend input[type=range]{width:100%;min-height:36px}
#gplegend button{min-height:44px;padding:0 16px;margin-top:10px;border-radius:12px;border:0;background:#ff5a1f;color:#111;font:800 12px var(--lab,monospace);letter-spacing:.06em;text-transform:uppercase}`;document.head.appendChild(css);
  const cur=document.createElement('div');cur.id='gpcur';cur.setAttribute('aria-hidden','true');document.body.appendChild(cur);
  const lg=document.createElement('div');lg.id='gplegend';lg.setAttribute('role','dialog');lg.setAttribute('aria-label','Controller help');
  lg.innerHTML='<h4>Controller</h4>'+
    [['Left stick','Move the cursor'],['A / ✕','Click, hold to drag or draw'],['B / ○','Cancel or escape'],['X / □','Undo'],['Y / △','Show or hide the panel'],['Right stick','Orbit the view, or scroll the panel'],['L2 / R2','Zoom out and in'],['L1 / R1','Previous and next tab'],['D-pad ◀ ▶','Previous and next tool'],['D-pad ▲ ▼','Level up and down, or scroll'],['L3','Slow, precise cursor'],['Select','Frame everything'],['Options','This help']]
      .map(([k,v])=>'<div class="r"><b>'+k+'</b><span>'+v+'</span></div>').join('')+
    '<div class="r" style="margin-top:8px"><b>Cursor speed</b><input type="range" id="gpspd" min="0.5" max="2" step="0.1" aria-label="Cursor speed"></div><button type="button" id="gpok">Got it</button>';
  document.body.appendChild(lg);
  const spd=lg.querySelector('#gpspd');spd.value=st.speed;spd.addEventListener('input',()=>{st.speed=+spd.value;try{localStorage.setItem('n0.gpspeed',st.speed);}catch(e){}});
  lg.querySelector('#gpok').addEventListener('click',()=>showLegend(false));
  function showLegend(v){st.legend=v;lg.style.display=v?'block':'none';}

  const pads=()=>{try{return Array.from(navigator.getGamepads?navigator.getGamepads():[]).filter(Boolean);}catch(e){return [];}};
  const buzz=(ms,a=.2,b=.35)=>{if(!st.rumble)return;try{const p=st.pad;const act=p&&(p.vibrationActuator||(p.hapticActuators&&p.hapticActuators[0]));if(act&&act.playEffect)act.playEffect('dual-rumble',{startDelay:0,duration:ms,weakMagnitude:b,strongMagnitude:a});else if(act&&act.pulse)act.pulse(a,ms);}catch(e){}};
  const ax=(p,i)=>{const v=p.axes[i]||0;if(Math.abs(v)<DEAD)return 0;return Math.sign(v)*((Math.abs(v)-DEAD)/(1-DEAD));};
  const btn=(p,i)=>!!(p.buttons[i]&&(p.buttons[i].pressed||p.buttons[i].value>.6));
  const val=(p,i)=>(p.buttons[i]&&p.buttons[i].value)||0;
  const pt=(t,type,extra)=>{const e=new PointerEvent(type,{pointerId:GP_ID,pointerType:'mouse',isPrimary:true,clientX:st.x,clientY:st.y,button:0,buttons:type==='pointerup'||type==='pointermove'&&!st.down?0:1,bubbles:true,cancelable:true,composed:true,...extra});t.dispatchEvent(e);};
  const mouse=(t,type)=>{try{t.dispatchEvent(new MouseEvent(type,{clientX:st.x,clientY:st.y,button:0,buttons:type==='mouseup'?0:1,bubbles:true,cancelable:true,view:window}));}catch(e){}};
  const hit=()=>{cur.style.display='none';const t=document.elementFromPoint(st.x,st.y);cur.style.display='block';return t;};
  const interactive=t=>t&&t.closest&&t.closest('button,a,input,select,textarea,summary,[role=button],[role=tab],.card,.chip,.tab,label');
  function hot(t){const h=interactive(t);if(st.lastHot&&st.lastHot!==h)st.lastHot.classList.remove('gp-hot');if(h&&!(h.tagName==='CANVAS')){h.classList.add('gp-hot');st.lastHot=h;}else st.lastHot=null;}
  function slide(inp){const r=inp.getBoundingClientRect(),f=clamp((st.x-r.left)/Math.max(1,r.width),0,1),mn=+inp.min||0,mx=+inp.max||100,stp=+inp.step||1;let v=mn+(mx-mn)*f;v=Math.round(v/stp)*stp;v=clamp(v,mn,mx);if(+inp.value!==v){inp.value=v;inp.dispatchEvent(new Event('input',{bubbles:true}));}}
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function scrollable(t){let n=t;while(n&&n!==document.body){const o=getComputedStyle(n).overflowY;if((o==='auto'||o==='scroll')&&n.scrollHeight>n.clientHeight+4)return n;n=n.parentElement;}return null;}

  function press(){
    const t=hit();if(!t)return;st.down={t,x:st.x,y:st.y,moved:false};cur.dataset.d='true';buzz(25,.1,.2);
    if(t.matches&&t.matches('input[type=range]')){slide(t);return;}
    pt(t,'pointerdown');mouse(t,'mousedown');
    if(t.matches&&t.matches('input:not([type=range]):not([type=color]):not([type=checkbox]),textarea'))try{t.focus();}catch(e){}
  }
  function release(){
    const d=st.down;if(!d)return;st.down=null;cur.dataset.d='false';const t=d.t;
    if(t.matches&&t.matches('input[type=range]')){t.dispatchEvent(new Event('change',{bubbles:true}));return;}
    pt(t,'pointerup');mouse(t,'mouseup');
    if(t.tagName!=='CANVAS'&&!d.moved){try{t.dispatchEvent(new MouseEvent('click',{clientX:st.x,clientY:st.y,button:0,bubbles:true,cancelable:true,view:window}));}catch(e){}buzz(18,.08,.25);}
  }
  function orbit(dt,rx,ry){
    const off=camera.position.clone().sub(controls.target),sph=new THREE.Spherical().setFromVector3(off);
    sph.theta-=rx*dt*2.4;sph.phi=clamp(sph.phi+ry*dt*1.9,.06,Math.PI-.06);off.setFromSpherical(sph);camera.position.copy(controls.target).add(off);camera.lookAt(controls.target);controls.update();bump();
  }
  function zoom(dt,k){
    const off=camera.position.clone().sub(controls.target),d=off.length(),nd=clamp(d*(1+k*dt*1.6),.4,400);off.setLength(nd);camera.position.copy(controls.target).add(off);controls.update();bump();
  }
  function pan(dt,dx,dz){
    const f=new THREE.Vector3();camera.getWorldDirection(f);f.y=0;if(f.lengthSq()<1e-4)f.set(0,0,-1);f.normalize();const r=new THREE.Vector3(-f.z,0,f.x),d=camera.position.distanceTo(controls.target)*.9,mv=f.multiplyScalar(-dz*dt*d).add(r.multiplyScalar(dx*dt*d));
    camera.position.add(mv);controls.target.add(mv);controls.update();bump();
  }
  const tabs=()=>[...document.querySelectorAll('.tabs .tab')];
  const stepTab=d=>{const t=tabs();if(!t.length)return;let i=t.findIndex(b=>b.getAttribute('aria-selected')==='true');i=(i+d+t.length)%t.length;t[i].click();t[i].scrollIntoView&&t[i].scrollIntoView({inline:'center',block:'nearest'});buzz(15,.05,.2);};
  const key=(k,mod)=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...mod}));};
  let last=performance.now();
  function frame(now){
    requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;
    const list=pads();const p=list.find(x=>x.mapping==='standard')||list[0];st.pad=p||null;
    if(!p){if(st.show){st.show=false;cur.style.display='none';}return;}
    const lx=ax(p,0),ly=ax(p,1),rx=ax(p,2),ry=ax(p,3),b=i=>btn(p,i),pb=i=>st.prev[i];
    const edge=i=>b(i)&&!pb(i);
    const active=lx||ly||rx||ry||p.buttons.some(x=>x.pressed)||val(p,6)>.1||val(p,7)>.1;
    if(active){st.idle=0;if(!st.show){st.show=true;cur.style.display='block';}}else st.idle+=dt;
    if(st.show&&st.idle>8&&!st.down){st.show=false;cur.style.display='none';if(st.lastHot){st.lastHot.classList.remove('gp-hot');st.lastHot=null;}}
    if(!st.show){st.prev=p.buttons.map(x=>x.pressed);return;}
    /* cursor */
    const sp=(st.slow?260:900)*st.speed*Math.max(.6,Math.min(innerWidth,innerHeight)/720);
    const mag=Math.hypot(lx,ly),cv=mag?Math.pow(mag,1.6)/mag:0;
    if(lx||ly){st.x=clamp(st.x+lx*cv*sp*dt,0,innerWidth-1);st.y=clamp(st.y+ly*cv*sp*dt,0,innerHeight-1);if(st.down)st.down.moved=true;}
    cur.style.left=st.x+'px';cur.style.top=st.y+'px';
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
    if(edge(1)){key('Escape');buzz(15,.05,.2);}
    if(edge(2)){if(undo)undo();else key('z',{ctrlKey:true});buzz(20,.1,.2);}
    if(edge(3)){const idx=sheet&&sheet.idx;if(sheet&&idx!=null)sheet.setIdx(idx>0?0:2);buzz(15,.05,.2);}
    if(edge(4))stepTab(-1);if(edge(5))stepTab(1);
    if(edge(14)){cycle&&cycle(-1);buzz(12,.04,.15);}if(edge(15)){cycle&&cycle(1);buzz(12,.04,.15);}
    if(edge(12)){const used=vert&&vert(1);if(!used){const sc=scrollable(hit());if(sc)sc.scrollTop-=220;}}
    if(edge(13)){const used=vert&&vert(-1);if(!used){const sc=scrollable(hit());if(sc)sc.scrollTop+=220;}}
    if(edge(8)){const f=document.getElementById('bFrame');f&&f.click();}
    if(edge(9))showLegend(!st.legend);
    if(edge(10)){st.slow=!st.slow;toast(st.slow?'Precise cursor':'Normal cursor',1200);}
    if(edge(11)){st.x=innerWidth/2;st.y=innerHeight/2;}
    st.prev=p.buttons.map(x=>x.pressed);
  }
  addEventListener('gamepadconnected',e=>{st.show=true;st.idle=0;cur.style.display='block';toast('Controller connected: '+(e.gamepad.id||'').replace(/\s*\(.*$/,'').slice(0,32)+'. Left stick moves the cursor, ✕ clicks. Options shows help.',5500);buzz(60,.2,.4);});
  addEventListener('gamepaddisconnected',()=>{if(!pads().length){st.show=false;cur.style.display='none';toast('Controller disconnected.',2500);}});
  requestAnimationFrame(frame);
  return {showLegend,state:st};
}
