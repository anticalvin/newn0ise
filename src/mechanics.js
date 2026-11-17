/* Game mechanics for worlds: shooting and driving (climbing lives in walk.js). They run only while walking in a world, take what they need from
   prefabs (target, vehicle, spawn weapon:true) and report to the closed rule set (object-shot, destroy). Everything is simple on purpose: arcade
   handling, hitscan shots, solid-box collision against the same boxes the character uses. */
export function createMechanics(c){
  const {THREE,S,walk,camera,canvas,scene,W,toast,bump,objById}=c;
  const M={driving:null,kills:0,shots:0,last:0,fx:[],btnFire:null,btnDrive:null,cross:null,speedEl:null};
  const rc=new THREE.Raycaster(),V3=THREE.Vector3;
  const mk=(tag,st,txt)=>{const e=document.createElement(tag);e.style.cssText=st;if(txt)e.textContent=txt;return e;};
  const glass='border:1px solid rgba(255,255,255,.35);background:rgba(20,20,22,.6);color:#fff;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-radius:22px;min-height:44px;min-width:88px;padding:10px 18px;font:inherit;z-index:60;position:fixed;';
  function ui(){
    if(M.btnFire)return;
    M.btnFire=mk('button',glass+'right:calc(18px + env(safe-area-inset-right));bottom:calc(150px + env(safe-area-inset-bottom));',  'Fire');M.btnFire.hidden=true;M.btnFire.type='button';
    M.btnFire.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fire(null);});
    M.btnDrive=mk('button',glass+'left:50%;bottom:calc(176px + env(safe-area-inset-bottom));transform:translateX(-50%);','Drive');M.btnDrive.hidden=true;M.btnDrive.type='button';
    M.btnDrive.addEventListener('click',()=>{if(M.driving)exitCar();else if(M.near)enterCar(M.near);});
    M.cross=mk('div','position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none;z-index:55;border:2px solid rgba(255,255,255,.85);border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4)');M.cross.hidden=true;
    M.speedEl=mk('div','position:fixed;left:50%;bottom:calc(100px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:55;color:#fff;font:700 20px system-ui;text-shadow:0 1px 6px rgba(0,0,0,.6);pointer-events:none','');M.speedEl.hidden=true;
    document.body.append(M.btnFire,M.btnDrive,M.cross,M.speedEl);
    /* desktop: a quick click (not a drag) or F fires */
    let dn=null;
    canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0)dn={x:e.clientX,y:e.clientY,t:performance.now()};},true);
    canvas.addEventListener('pointerup',e=>{if(!dn)return;const q=dn;dn=null;if(e.pointerType==='mouse'&&Math.hypot(e.clientX-q.x,e.clientY-q.y)<6&&performance.now()-q.t<300)fire(walk.third?[e.clientX,e.clientY]:null);},true);
    addEventListener('keydown',e=>{if(!walk.on||e.repeat||/input|textarea|select/i.test((e.target&&e.target.tagName)||''))return;if(e.code==='KeyF')fire(null);if(e.code==='KeyE'){if(M.driving)exitCar();else if(M.near&&!(W.rules.near!=null))enterCar(M.near);}});
  }
  const sp=()=>(W.spawn&&W.spawn.params)||{};
  const weaponOn=()=>!!(sp().weapon||(W.flags&&W.flags.get('armed')));
  /* the weapon is data: swap these (or the spawn params) for another gun. Fire rate in shots per second, damage in hit points, range in metres. */
  M.weapon={name:'Demo pistol',get rate(){return sp().fireRate||6;},get damage(){return sp().damage||1;},get range(){return sp().range||60;},tracer:0xffd36a,flash:0xffc27a,recoil:.022,decals:true};
  const emit=(name,d)=>{try{dispatchEvent(new CustomEvent('n0:gameplay',{detail:{name,...d}}));}catch(e){}};
  M.busy=()=>!!M.driving;
  /* ---- shooting ---- */
  function fire(at){
    if(!walk.on||M.driving||!weaponOn())return;
    const now=performance.now();if(now-M.last<1000/M.weapon.rate)return;M.last=now;M.shots++;
    const r=canvas.getBoundingClientRect(),ndc=at?new THREE.Vector2((at[0]-r.left)/r.width*2-1,-((at[1]-r.top)/r.height*2-1)):new THREE.Vector2(0,0);
    rc.setFromCamera(ndc,camera);rc.far=M.weapon.range;
    const pl=walk.player,list=[];S.objs.forEach(o=>{if(!o.vis||!o.holder.visible||(o.meta&&o.meta.player)||o===(pl&&S.objs.find(x=>x.holder===pl.holder)))return;list.push(o.holder);});
    const hits=rc.intersectObjects(list,true).filter(h=>!h.object.userData.noView&&!h.object.userData.zone&&h.object.visible);
    const from=pl&&pl.holder?new V3(pl.holder.position.x,pl.holder.position.y+1.3,pl.holder.position.z):camera.position.clone();
    let end=rc.ray.at(Math.min(60,M.weapon.range),new V3()),obj=null,nrm=null;
    if(hits.length){end=hits[0].point.clone();if(hits[0].face)nrm=hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld);let p=hits[0].object;while(p){if(p.userData&&p.userData.objId!=null){obj=objById(p.userData.objId);break;}p=p.parent;}}
    tracer(from,end,!!obj);W.rules.sound('click');
    muzzle();if(!walk.third)walk.kick(M.weapon.recoil);kickCross();emit('fire',{});
    if(hits.length){spark(end);if(M.weapon.decals&&nrm)decal(end,nrm);}
    if(obj){hit(obj);emit('hit',{id:obj.meta&&obj.meta.n0w&&obj.meta.n0w.id});}
  }
  function tracer(a,b,hit){
    const g=new THREE.BufferGeometry().setFromPoints([a,b]),l=new THREE.Line(g,new THREE.LineBasicMaterial({color:hit?0xffd36a:0xffffff,transparent:true,opacity:.9}));l.frustumCulled=false;l.userData.noView=true;scene.add(l);M.fx.push({o:l,t:0,dur:.09,kind:'line'});bump();
  }
  let flashL=null;
  function muzzle(){if(!flashL)return;const o=camera.position.clone().addScaledVector(camera.getWorldDirection(new V3()),.8);flashL.position.copy(o);flashL.intensity=40;M.flashT=.06;}
  function kickCross(){if(M.cross){M.cross.style.transform='scale(1.5)';setTimeout(()=>{M.cross.style.transform='';},90);}}
  const decals=[];
  function decal(p,n){const m=new THREE.Mesh(new THREE.CircleGeometry(.07,10),new THREE.MeshBasicMaterial({color:0x050505,transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));m.position.copy(p).addScaledVector(n,.01);m.lookAt(p.clone().add(n));m.userData.noView=true;scene.add(m);decals.push({o:m,t:0});if(decals.length>30){const d=decals.shift();scene.remove(d.o);d.o.geometry.dispose();d.o.material.dispose();}}
  function spark(p){const m=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:0xffe08a,transparent:true,opacity:1}));m.position.copy(p);m.userData.noView=true;scene.add(m);M.fx.push({o:m,t:0,dur:.2,kind:'spark'});}
  function hit(o){
    const id=o.meta&&o.meta.n0w&&o.meta.n0w.id;
    if(id)W.rules.shot(id);
    if(o.meta&&o.meta.hp!=null&&o.vis){
      o.meta.hp-=M.weapon.damage;flash(o);
      if(o.meta.hp<=0){o.vis=false;o.holder.visible=false;M.kills++;W.flags.set('destroyed',M.kills);W.rules.sound('thud');walk.refreshBoxes&&walk.refreshBoxes();toast('Hit! '+M.kills+' down',1200);}
    }
  }
  function flash(o){const ms=[];o.holder.traverse(n=>{if(n.isMesh&&n.material&&n.material.emissive){ms.push([n.material,n.material.emissive.getHex(),n.material.emissiveIntensity]);n.material.emissive.set(0xffffff);n.material.emissiveIntensity=1;}});setTimeout(()=>{ms.forEach(([m,h,i])=>{m.emissive.setHex(h);m.emissiveIntensity=i;});bump();},90);}
  /* ---- driving ---- */
  const nearVehicle=()=>{const p=walk.pos;if(!p)return null;let best=null,bd=3.4;S.objs.forEach(o=>{const v=o.meta&&o.meta.vehicle;if(!v||!o.vis||v.occupied)return;const d=Math.hypot(o.holder.position.x-p.x,o.holder.position.z-p.z);if(d<bd){bd=d;best=o;}});return best;};
  function enterCar(o){
    const v=o.meta.vehicle;v.occupied=true;v.v=0;M.driving=o;M.cam=null;
    const pl=walk.player;if(pl&&pl.holder)pl.holder.visible=false;
    walk.refreshBoxes&&walk.refreshBoxes();toast('Driving. W/S go and reverse, A/D steer, Space brakes, E gets out.',3500);
  }
  function exitCar(){
    const o=M.driving;if(!o)return;const v=o.meta.vehicle,h=o.holder;v.occupied=false;v.v=0;M.driving=null;
    const side=new V3(Math.cos(h.rotation.y),0,-Math.sin(h.rotation.y));const p=h.position.clone().addScaledVector(side,-(v.wid/2+1.1));
    walk.place(p.x,0,p.z);const pl=walk.player;if(pl&&pl.holder){pl.holder.visible=true;pl.holder.position.set(p.x,0,p.z);}
    walk.refreshBoxes&&walk.refreshBoxes();
  }
  const key=(k)=>walk.keys.has(k);
  const drive={
    active:()=>!!M.driving,
    tick(dt){
      const o=M.driving,v=o.meta.vehicle,h=o.holder,st=walk.stick;
      const thr=(key('KeyW')||key('ArrowUp')?1:0)-(key('KeyS')||key('ArrowDown')?1:0)-st[1]*(Math.abs(st[1])>.1?1:0);
      const steerIn=(key('KeyA')||key('ArrowLeft')?1:0)-(key('KeyD')||key('ArrowRight')?1:0)-st[0]*(Math.abs(st[0])>.1?1:0);
      const maxF=v.speed,maxR=v.speed*.4;
      if(thr>0)v.v+=(v.v<0?30:12)*thr*dt;else if(thr<0)v.v-=(v.v>0?30:10)*-thr*dt;else v.v-=Math.sign(v.v)*Math.min(Math.abs(v.v),4.5*dt);
      if(key('Space'))v.v-=Math.sign(v.v)*Math.min(Math.abs(v.v),28*dt);
      v.v*=1-.12*dt;v.v=Math.max(-maxR,Math.min(maxF,v.v));
      const grip=Math.min(1,Math.abs(v.v)/3.5);
      h.rotation.y+=steerIn*1.9*grip*Math.sign(v.v||1)*dt;
      const fwd=new V3(-Math.sin(h.rotation.y),0,-Math.cos(h.rotation.y)),step=v.v*dt;
      /* collide: three circles along the car against the solid boxes (low curbs are driven over) */
      const tryMove=(nx,nz)=>{
        for(const off of [-v.len*.32,0,v.len*.32]){const cx=nx+fwd.x*-off*-1,cz=nz+fwd.z*-off*-1;
          for(const b of walk.boxes){if(b.max.y<.4||b.min.y>v.h)continue;const dx=Math.max(b.min.x-cx,0,cx-b.max.x),dz=Math.max(b.min.z-cz,0,cz-b.max.z);if(dx*dx+dz*dz<(v.wid*.5)*(v.wid*.5))return false;}}
        return true;};
      const nx=h.position.x+fwd.x*step,nz=h.position.z+fwd.z*step;
      if(tryMove(nx,nz)){h.position.x=nx;h.position.z=nz;}
      else{if(Math.abs(v.v)>3){W.rules.sound('thud');}v.v*=-.25;}
      h.updateMatrixWorld(true);
      /* wheels roll, front wheels turn */
      (v.wheels||[]).forEach(w=>{w.w.rotation.x+=step/.36;if(w.front)w.pv.rotation.y=steerIn*.45;});
      walk.place(h.position.x,0,h.position.z);
      /* chase camera */
      const want=h.position.clone().addScaledVector(fwd,-(v.len*1.5+2.2));want.y=2.6+v.h;
      if(!M.cam)M.cam=want.clone();M.cam.lerp(want,1-Math.exp(-dt*5));
      camera.position.copy(M.cam);camera.lookAt(h.position.x+fwd.x*3,v.h*.8,h.position.z+fwd.z*3);
      M.speedEl.textContent=Math.round(Math.abs(v.v)*3.6)+' km/h';
      if(M.near)M.near=null;
    }
  };
  M.fire=fire;M.enterCar=enterCar;M.exitCar=exitCar;
  walk.setController(drive);
  /* a first-person gun, drawn on the camera so it follows the view */
  let gun=null;
  function viewmodel(on){
    if(on&&!gun){gun=new THREE.Group();const b=new THREE.MeshStandardMaterial({color:0x2b2d31,roughness:.35,metalness:.6});const body=new THREE.Mesh(new THREE.BoxGeometry(.05,.07,.26),b),grip=new THREE.Mesh(new THREE.BoxGeometry(.04,.11,.05),b);grip.position.set(0,-.085,.09);body.position.set(0,0,0);gun.add(body,grip);gun.position.set(.17,-.17,-.38);gun.userData.noView=true;gun.traverse(n=>{n.userData.noView=true;n.castShadow=false;});}
    if(!gun)return;if(on&&!gun.parent){camera.add(gun);if(!camera.parent)scene.add(camera);}else if(!on&&gun.parent)gun.parent.remove(gun);
    if(on)gun.position.z=-.38+(M.flashT>0?.03:0);
  }
  M.tick=dt=>{
    ui();
    if(flashL&&M.flashT>0){M.flashT-=dt;if(M.flashT<=0)flashL.intensity=0;}
    for(let i=decals.length-1;i>=0;i--){const d=decals[i];d.t+=dt;if(d.t>10){d.o.material.opacity=Math.max(0,.85*(1-(d.t-10)/3));if(d.t>13){scene.remove(d.o);d.o.geometry.dispose();d.o.material.dispose();decals.splice(i,1);}}}
    if(walk.on&&weaponOn()&&!flashL){flashL=new THREE.PointLight(M.weapon.flash,0,8,2);flashL.userData.noView=true;scene.add(flashL);} // made once the weapon exists, so the scene's shaders only rebuild then
    viewmodel(walk.on&&!walk.third&&weaponOn()&&!M.driving);
    for(let i=M.fx.length-1;i>=0;i--){const f=M.fx[i];f.t+=dt;const k=f.t/f.dur;if(f.kind==='line')f.o.material.opacity=.9*(1-k);else{f.o.material.opacity=1-k;f.o.scale.setScalar(1+k*2);}if(k>=1){scene.remove(f.o);f.o.geometry.dispose();f.o.material.dispose();M.fx.splice(i,1);}}
    if(!walk.on){M.btnFire.hidden=M.btnDrive.hidden=M.cross.hidden=M.speedEl.hidden=true;if(M.driving){M.driving.meta.vehicle.occupied=false;M.driving.meta.vehicle.v=0;M.driving=null;}return;}
    const w=weaponOn();
    M.cross.hidden=!w||!!M.driving||walk.third;
    M.btnFire.hidden=!w||!!M.driving||!matchMedia('(pointer:coarse)').matches;
    M.speedEl.hidden=!M.driving;
    M.near=M.driving?null:nearVehicle();
    M.btnDrive.hidden=!(M.driving||M.near)||(W.rules.near!=null&&!M.driving);
    if(!M.btnDrive.hidden)M.btnDrive.textContent=M.driving?'Get out':'Drive '+(M.near&&M.near.name||'');
  };
  return M;
}
