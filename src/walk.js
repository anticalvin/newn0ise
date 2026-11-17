/* First-person walk mode for the 3D page. Move with WASD or the on-screen stick, look with the mouse (click to capture) or by dragging
   on the right half of a touch screen. Space jumps, Shift runs, Esc leaves. Collision is against the bounding boxes of the
   visible objects: low boxes are steps you can climb, tall ones are walls you slide along. The floor is y = 0. */
export function createWalk(c){
  const {THREE,camera,controls,canvas,S,holderBox,sheet,onExit}=c;
  const TP={obj:null,rig:null,face:0,ph:0,amt:0,dist:4.2,done:false,cp:null,sy:0,dc:4.2,fov:0};
  let controller=null;
  const st={climb:false,cdir:1,on:false,yaw:0,pitch:0,pos:new THREE.Vector3(0,0,4),vy:0,ground:true,keys:new Set(),jx:0,jy:0,saved:null,boxes:[],boxT:0,cvx:0,cvz:0,coy:0,buf:0,cut:false};
  const EYE=1.65,R=.3,H=1.75,STEP=.55,GUP=20,GDN=31,JUMP=6.3;
  let ui=null,lookId=null,joyId=null,joyO=null,lastLook=null;
  function refreshBoxes(){
    /* objects that describe their own solid parts (worlds: doors, rooms with openings, stairs) give a list of boxes; everything else is one box */
    st.boxes=S.objs.filter(o=>o.vis&&o.kind!=='viz'&&!(o.meta&&o.meta.player)).flatMap(o=>{const bs=o.meta&&o.meta.colliders?o.meta.colliders():[holderBox(o.holder)];if(o.meta&&o.meta.climb)bs.forEach(b=>{b.climb=true;});return bs;}).filter(b=>!b.isEmpty()&&isFinite(b.min.x)&&(b.max.y-b.min.y)<200);st.boxT=performance.now();
  }
  function build(){
    ui=document.createElement('div');ui.id='walkui';
    ui.innerHTML='<button id="walkX" aria-label="Leave walk mode">Exit</button><div id="walkHint"></div><div id="walkStick" hidden><i></i></div><button id="walkJump" aria-label="Jump">Jump</button>';
    document.body.appendChild(ui);
    ui.querySelector('#walkX').addEventListener('click',()=>exit());
    ui.querySelector('#walkJump').addEventListener('pointerdown',e=>{e.preventDefault();jump();});
    ui.querySelector('#walkJump').addEventListener('pointerup',()=>{st.cut=true;});
  }
  const jump=()=>{if(st.noJump)return;st.buf=.14;};
  function onKey(e){
    if(!st.on)return;
    if(e.type==='keydown'){
      if(e.code==='Escape'){exit();return;}
      st.keys.add(e.code);if(e.code==='Space'){if(!e.repeat)jump();e.preventDefault();}
    }else{st.keys.delete(e.code);if(e.code==='Space')st.cut=true;}
  }
  let hook=null;function setHook(f){hook=f||null;st.eyeO=null;st.hold=false;} // a ragdoll (or anything else) can take over where the character is
  function kick(a){st.pitch=Math.max(-1.45,Math.min(1.45,st.pitch+a));st.rec=(st.rec||0)+a*.7;} // a shot nudges the view up, then it settles back
  function look(dx,dy){st.yaw-=dx*.0032;st.pitch=Math.max(-1.45,Math.min(1.45,st.pitch-dy*.0032));}
  function onMouse(e){if(st.on&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);}
  function down(e){
    if(!st.on||e.target.closest('#walkui button'))return;
    if(e.pointerType==='mouse'){lookId=e.pointerId;lastLook=[e.clientX,e.clientY];if(!st.third&&canvas.requestPointerLock&&e.button===0)try{canvas.requestPointerLock();}catch(_){}return;}
    const left=e.clientX<innerWidth*.45;
    if(left&&joyId==null){joyId=e.pointerId;joyO=[e.clientX,e.clientY];const s=ui.querySelector('#walkStick');s.hidden=false;s.style.left=e.clientX-50+'px';s.style.top=e.clientY-50+'px';}
    else if(lookId==null){lookId=e.pointerId;lastLook=[e.clientX,e.clientY];}
  }
  function move(e){
    if(!st.on)return;
    if(e.pointerId===joyId){const dx=e.clientX-joyO[0],dy=e.clientY-joyO[1],m=Math.hypot(dx,dy),k=Math.min(1,m/50);st.jx=m?dx/m*k:0;st.jy=m?dy/m*k:0;
      const i=ui.querySelector('#walkStick i');i.style.transform=`translate(${st.jx*34}px,${st.jy*34}px)`;}
    else if(e.pointerId===lookId&&document.pointerLockElement!==canvas){look((e.clientX-lastLook[0])*(e.pointerType==='mouse'?1:1.6),(e.clientY-lastLook[1])*(e.pointerType==='mouse'?1:1.6));lastLook=[e.clientX,e.clientY];}
  }
  function up(e){
    if(e.pointerId===joyId){joyId=null;st.jx=st.jy=0;const s=ui.querySelector('#walkStick');s.hidden=true;}
    if(e.pointerId===lookId){lookId=null;}
  }
  function enter(opts={}){
    if(st.on)return;if(!ui)build();
    st.saved={p:camera.position.clone(),t:controls.target.clone(),idx:sheet.idx,fov:camera.fov};
    const p=opts.pos||[0,0,4];st.pos.set(p[0],p[1]||0,p[2]);st.yaw=((opts.yaw??0)*Math.PI)/180;st.pitch=0;st.vy=0;st.ground=true;
    camera.rotation.order='YXZ';controls.enabled=false;S.walk=true;S.spin=false;
    document.body.dataset.walk='1';sheet.ht=0;sheet.h=0;sheet.hv=0;
    if(S.rest&&c.leaveRest)c.leaveRest();
    if(c.tcDetach)c.tcDetach();
    st.cvx=st.cvz=0;st.coy=0;st.buf=0;TP.cp=null;TP.sy=(opts.pos||[0,0,0])[1]||0;TP.dc=TP.dist;TP.fov=0;st.third=!!opts.third;st.noJump=!!opts.noJump;TP.obj=opts.player||null;TP.rig=opts.rig||null;TP.done=false;TP.face=st.yaw;if(st.third){st.pitch=-.22;st.yaw=Math.PI*0+(opts.camYaw||0);}
    refreshBoxes();st.on=true;
    const coarse=matchMedia('(pointer:coarse)').matches;
    ui.querySelector('#walkHint').textContent=st.third?(coarse?'Left thumb runs, right thumb turns the camera':'WASD run · drag to turn the camera · Space jump · Shift sprint · Esc back to editing'):coarse?'Left thumb moves, right thumb looks':'WASD move · mouse look (click first) · Space jump · Shift run · Esc leave';
    ui.querySelector('#walkJump').style.display=coarse&&!st.noJump?'block':'none';
    addEventListener('keydown',onKey);addEventListener('keyup',onKey);document.addEventListener('mousemove',onMouse);
    canvas.addEventListener('pointerdown',down);addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
    c.bump();
  }
  function exit(){
    if(!st.on)return;hook=null;st.hold=false;st.eyeO=null;st.on=false;S.walk=false;if(st.third&&TP.rig)TP.rig.set(0,0,0);if(st.saved&&st.saved.fov){camera.fov=st.saved.fov;camera.updateProjectionMatrix();}st.third=false;delete document.body.dataset.walk;
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    removeEventListener('keydown',onKey);removeEventListener('keyup',onKey);document.removeEventListener('mousemove',onMouse);
    canvas.removeEventListener('pointerdown',down);removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
    st.keys.clear();st.jx=st.jy=0;joyId=lookId=null;
    camera.rotation.order='XYZ';camera.position.copy(st.saved.p);controls.target.copy(st.saved.t);controls.enabled=true;controls.update();
    sheet.setIdx(st.saved.idx,true);c.bump();onExit&&onExit();
  }
  function tick(dt){
    if(!st.on)return;dt=Math.min(dt,.05);
    if(controller&&controller.active()){if(performance.now()-st.boxT>1000)refreshBoxes();controller.tick(dt);c.bump();return;} // driving: the vehicle owns movement and the camera
    if(performance.now()-st.boxT>1000)refreshBoxes();
    if(st.rec){const d=st.rec*Math.min(1,dt*9);st.pitch-=d;st.rec-=d;if(Math.abs(st.rec)<1e-4)st.rec=0;}
    const k=st.keys;let fx=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0)+st.jx,fz=(k.has('KeyS')||k.has('ArrowDown')?1:0)-(k.has('KeyW')||k.has('ArrowUp')?1:0)+st.jy;
    if(st.stepT>0){fz-=1;st.stepT-=dt;} // a real step on the phone walks you forward a little
    const m=Math.hypot(fx,fz);if(m>1){fx/=m;fz/=m;}
    const sp=(k.has('ShiftLeft')||k.has('ShiftRight')?5.6:2.8),c1=Math.cos(st.yaw),s1=Math.sin(st.yaw);
    const tx=(fx*c1+fz*s1)*sp,tz=(-fx*s1+fz*c1)*sp,p=st.pos;
    const rate=st.ground?(m>.01?12:16):3.2,kk=Math.min(1,dt*rate);st.cvx+=(tx-st.cvx)*kk;st.cvz+=(tz-st.cvz)*kk;const vx=st.cvx,vz=st.cvz;
    /* coyote time and a short jump buffer: a jump pressed just before landing, or just after leaving a ledge, still works */
    st.coy=st.ground?.1:Math.max(0,st.coy-dt);st.buf=Math.max(0,st.buf-dt);
    if(st.buf>0&&st.coy>0){st.vy=JUMP;st.ground=false;st.coy=0;st.buf=0;}
    if(st.cut){if(st.vy>0)st.vy*=.5;st.cut=false;}
    // gravity and floor: the ground is y=0, or the top of any box under the feet that is within step height
    if(st.climb){st.vy=0;p.y+=2.6*st.cdir*dt;} // on a ladder or climbable wall: up and down with forward and back
    else{st.vy-=(st.vy>0?GUP:GDN)*dt;p.y+=st.vy*dt;}
    let floor=0;
    for(const b of st.boxes){if(p.x>b.min.x-R*.5&&p.x<b.max.x+R*.5&&p.z>b.min.z-R*.5&&p.z<b.max.z+R*.5&&b.max.y<=p.y+STEP&&b.max.y>floor)floor=b.max.y;}
    if(p.y<=floor){p.y=floor;st.vy=Math.max(0,st.vy);st.ground=true;}else st.ground=false;
    // horizontal move, one axis at a time so you slide along walls
    let hitClimb=false;
    for(const ax of ['x','z']){
      const nx=p[ax]+(ax==='x'?vx:vz)*dt;const old=p[ax];p[ax]=nx;
      for(const b of st.boxes){
        if(b.max.y-b.min.y<.05)continue;
        if(p.y+STEP>=b.max.y||p.y+H<=b.min.y)continue; // can step onto it, or it is above your head
        if(p.x>b.min.x-R&&p.x<b.max.x+R&&p.z>b.min.z-R&&p.z<b.max.z+R){p[ax]=old;if(b.climb&&Math.abs(fz)>.1)hitClimb=true;break;}
      }
    }
    if(hitClimb){st.climb=true;st.cdir=fz<0?1:-1;st.ground=false;st.vy=0;}else st.climb=false;
    if(hook)hook(p,st);
    if(st.third&&TP.obj){
      const sp2=Math.hypot(vx,vz),mv=sp2>.05;
      if(mv){const tgt=Math.atan2(vx,vz)+(c.faceOffset||0);let d=tgt-TP.face;d=Math.atan2(Math.sin(d),Math.cos(d));TP.face+=d*Math.min(1,dt*12);}
      TP.amt+=((mv&&st.ground?Math.min(1,sp2/3):0)-TP.amt)*Math.min(1,dt*10);TP.ph+=sp2*dt*(sp2>4?2.1:2.6)*1.0;
      TP.sy+=(p.y-TP.sy)*(Math.abs(p.y-TP.sy)>.7?1:Math.min(1,dt*20));
      const h=TP.obj.holder;if(!st.hold){h.position.set(p.x,TP.sy+Math.abs(Math.sin(TP.ph))*.05*TP.amt,p.z);h.rotation.set(0,TP.face,0);
      if(TP.rig)TP.rig.set(TP.ph,st.ground?TP.amt:.35,1);}
      st.pitch=Math.max(-1.1,Math.min(.35,st.pitch));const cy=Math.cos(st.pitch),fwd=new THREE.Vector3(-Math.sin(st.yaw)*cy,Math.sin(st.pitch),-Math.cos(st.yaw)*cy);
      /* spring-arm camera: it follows with a little lag, never goes through walls, and pulls out a touch when you sprint */
      const want=new THREE.Vector3(p.x,TP.sy+1.35,p.z);
      if(!TP.cp)TP.cp=want.clone();
      const kx=1-Math.exp(-dt*18),ky=1-Math.exp(-dt*9);TP.cp.x+=(want.x-TP.cp.x)*kx;TP.cp.z+=(want.z-TP.cp.z)*kx;TP.cp.y+=(want.y-TP.cp.y)*ky;
      let len=TP.dist+TP.amt*(sp2>4?.5:0);
      for(let d=.5;d<=len;d+=.3){const q=TP.cp.clone().addScaledVector(fwd,-d);let hit=false;for(const b of st.boxes){if(b.max.y-b.min.y<.3)continue;if(q.x>b.min.x-.15&&q.x<b.max.x+.15&&q.y>b.min.y-.15&&q.y<b.max.y+.15&&q.z>b.min.z-.15&&q.z<b.max.z+.15){hit=true;break;}}if(hit){len=Math.max(.6,d-.45);break;}}
      TP.dc+=(len-TP.dc)*(len<TP.dc?Math.min(1,dt*20):Math.min(1,dt*3));
      camera.position.copy(TP.cp).addScaledVector(fwd,-TP.dc);camera.position.y=Math.max(.25,camera.position.y);camera.lookAt(TP.cp);
      const fv=(st.saved&&st.saved.fov||camera.fov)+(sp2>4?TP.amt*6:0),nf=camera.fov+(fv-camera.fov)*Math.min(1,dt*6);if(Math.abs(nf-camera.fov)>.005){camera.fov=nf;camera.updateProjectionMatrix();}
      if(c.onTick)c.onTick(p);
    }else{camera.position.set(p.x,p.y+EYE+(st.bob||0),p.z);if(st.eyeO)camera.position.copy(st.eyeO);camera.rotation.set(st.pitch,st.yaw,0);if(c.onTick)c.onTick(p);}
    c.bump();
  }
  return {enter,exit,tick,get on(){return st.on;},get noJump(){return !!st.noJump;},get third(){return st.third;},get pos(){return st.on?st.pos:null;},get yaw(){return st.yaw;},get keys(){return st.keys;},get boxes(){return st.boxes;},get climbing(){return st.climb;},get stick(){return [st.jx,st.jy];},get player(){return TP.obj;},setController(x){controller=x;},setStick(x,y){st.jx=x;st.jy=y;},kick,setHook,rotate(dyaw,dpitch){st.yaw+=dyaw;st.pitch=Math.max(-1.45,Math.min(1.45,st.pitch+dpitch));},step(){st.stepT=.28;},setBob(v){st.bob=v;},vel(){return new THREE.Vector3(st.cvx,0,st.cvz);},place(x,y,z){st.pos.set(x,y,z);},setYaw(y){st.yaw=y;},refreshBoxes};
}
