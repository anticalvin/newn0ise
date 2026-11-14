/* First-person walk mode for the 3D page. Move with WASD or the on-screen stick, look with the mouse (click to capture) or by dragging
   on the right half of a touch screen. Space jumps, Shift runs, Esc leaves. Collision is against the bounding boxes of the
   visible objects: low boxes are steps you can climb, tall ones are walls you slide along. The floor is y = 0. */
export function createWalk(c){
  const {THREE,camera,controls,canvas,S,holderBox,sheet,onExit}=c;
  const st={on:false,yaw:0,pitch:0,pos:new THREE.Vector3(0,0,4),vy:0,ground:true,keys:new Set(),jx:0,jy:0,saved:null,boxes:[],boxT:0};
  const EYE=1.65,R=.3,H=1.75,STEP=.55,G=22;
  let ui=null,lookId=null,joyId=null,joyO=null,lastLook=null;
  function refreshBoxes(){
    st.boxes=S.objs.filter(o=>o.vis&&o.kind!=='viz').map(o=>holderBox(o.holder)).filter(b=>!b.isEmpty()&&isFinite(b.min.x)&&(b.max.y-b.min.y)<200);st.boxT=performance.now();
  }
  function build(){
    ui=document.createElement('div');ui.id='walkui';
    ui.innerHTML='<button id="walkX" aria-label="Leave walk mode">Exit</button><div id="walkHint"></div><div id="walkStick" hidden><i></i></div><button id="walkJump" aria-label="Jump">Jump</button>';
    document.body.appendChild(ui);
    ui.querySelector('#walkX').addEventListener('click',()=>exit());
    ui.querySelector('#walkJump').addEventListener('pointerdown',e=>{e.preventDefault();jump();});
  }
  const jump=()=>{if(st.ground){st.vy=5.2;st.ground=false;}};
  function onKey(e){
    if(!st.on)return;
    if(e.type==='keydown'){
      if(e.code==='Escape'){exit();return;}
      st.keys.add(e.code);if(e.code==='Space'){jump();e.preventDefault();}
    }else st.keys.delete(e.code);
  }
  function look(dx,dy){st.yaw-=dx*.0032;st.pitch=Math.max(-1.45,Math.min(1.45,st.pitch-dy*.0032));}
  function onMouse(e){if(st.on&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);}
  function down(e){
    if(!st.on||e.target.closest('#walkui button'))return;
    if(e.pointerType==='mouse'){lookId=e.pointerId;lastLook=[e.clientX,e.clientY];if(canvas.requestPointerLock&&e.button===0)try{canvas.requestPointerLock();}catch(_){}return;}
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
    refreshBoxes();st.on=true;
    const coarse=matchMedia('(pointer:coarse)').matches;
    ui.querySelector('#walkHint').textContent=coarse?'Left thumb moves, right thumb looks':'WASD move · mouse look (click first) · Space jump · Shift run · Esc leave';
    ui.querySelector('#walkJump').style.display=coarse?'block':'none';
    addEventListener('keydown',onKey);addEventListener('keyup',onKey);document.addEventListener('mousemove',onMouse);
    canvas.addEventListener('pointerdown',down);addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
    c.bump();
  }
  function exit(){
    if(!st.on)return;st.on=false;S.walk=false;delete document.body.dataset.walk;
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    removeEventListener('keydown',onKey);removeEventListener('keyup',onKey);document.removeEventListener('mousemove',onMouse);
    canvas.removeEventListener('pointerdown',down);removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
    st.keys.clear();st.jx=st.jy=0;joyId=lookId=null;
    camera.rotation.order='XYZ';camera.position.copy(st.saved.p);controls.target.copy(st.saved.t);controls.enabled=true;controls.update();
    sheet.setIdx(st.saved.idx,true);c.bump();onExit&&onExit();
  }
  function tick(dt){
    if(!st.on)return;dt=Math.min(dt,.05);
    if(performance.now()-st.boxT>1000)refreshBoxes();
    const k=st.keys;let fx=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0)+st.jx,fz=(k.has('KeyS')||k.has('ArrowDown')?1:0)-(k.has('KeyW')||k.has('ArrowUp')?1:0)+st.jy;
    const m=Math.hypot(fx,fz);if(m>1){fx/=m;fz/=m;}
    const sp=(k.has('ShiftLeft')||k.has('ShiftRight')?5.6:2.8),c1=Math.cos(st.yaw),s1=Math.sin(st.yaw);
    const vx=(fx*c1+fz*s1)*sp,vz=(-fx*s1+fz*c1)*sp,p=st.pos;
    // gravity and floor: the ground is y=0, or the top of any box under the feet that is within step height
    st.vy-=G*dt;p.y+=st.vy*dt;
    let floor=0;
    for(const b of st.boxes){if(p.x>b.min.x-R*.5&&p.x<b.max.x+R*.5&&p.z>b.min.z-R*.5&&p.z<b.max.z+R*.5&&b.max.y<=p.y+STEP&&b.max.y>floor)floor=b.max.y;}
    if(p.y<=floor){p.y=floor;st.vy=Math.max(0,st.vy);st.ground=true;}else st.ground=false;
    // horizontal move, one axis at a time so you slide along walls
    for(const ax of ['x','z']){
      const nx=p[ax]+(ax==='x'?vx:vz)*dt;const old=p[ax];p[ax]=nx;
      for(const b of st.boxes){
        if(b.max.y-b.min.y<.05)continue;
        if(p.y+STEP>=b.max.y||p.y+H<=b.min.y)continue; // can step onto it, or it is above your head
        if(p.x>b.min.x-R&&p.x<b.max.x+R&&p.z>b.min.z-R&&p.z<b.max.z+R){p[ax]=old;break;}
      }
    }
    camera.position.set(p.x,p.y+EYE,p.z);camera.rotation.set(st.pitch,st.yaw,0);
    c.bump();
  }
  return {enter,exit,tick,get on(){return st.on;},refreshBoxes};
}
