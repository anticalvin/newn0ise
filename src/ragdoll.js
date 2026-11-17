/* Ragdoll: the character goes limp and falls as a jointed body, then gets back up and carries on.
   A Verlet body of 16 joints held together by distance constraints (the classic stable ragdoll), stepped on a fixed 1/120 s clock so it behaves
   the same at any frame rate. It collides with the ground and with the same solid boxes the character walks against. The visible body is a
   mannequin built from capsules; it lives under the character's own object, so a hardware look or effect on the character stays on it. */
export function createRagdoll(c){
  const {THREE,scene,walk,S,bump,toast}=c;
  const R={active:false,t:0,still:0,auto:true};
  const V=THREE.Vector3,DT=1/120,G=-17;
  /* rest pose, metres, pelvis-relative (x right, y up, z forward) */
  const P0={pelvis:[0,.95,0],chest:[0,1.35,0],neck:[0,1.55,0],head:[0,1.7,0],shL:[-.2,1.45,0],shR:[.2,1.45,0],elL:[-.26,1.18,0],elR:[.26,1.18,0],haL:[-.28,.93,0],haR:[.28,.93,0],hipL:[-.1,.92,0],hipR:[.1,.92,0],knL:[-.11,.5,0],knR:[.11,.5,0],ftL:[-.11,.08,0],ftR:[.11,.08,0]};
  const NAMES=Object.keys(P0);
  /* [a,b,radius] limbs that are drawn; every pair also acts as a stick */
  const LIMBS=[['pelvis','chest',.15],['chest','neck',.09],['neck','head',.05],['chest','shL',.07],['chest','shR',.07],['shL','elL',.055],['shR','elR',.055],['elL','haL',.045],['elR','haR',.045],['pelvis','hipL',.09],['pelvis','hipR',.09],['hipL','knL',.085],['hipR','knR',.085],['knL','ftL',.065],['knR','ftR',.065]];
  const BRACE=[['shL','shR'],['hipL','hipR'],['shL','hipR'],['shR','hipL'],['chest','hipL'],['chest','hipR'],['pelvis','shL'],['pelvis','shR'],['neck','shL'],['neck','shR'],['pelvis','neck'],['chest','head']];
  const MINS=[['hipL','ftL',.34],['hipR','ftR',.34],['shL','haL',.3],['shR','haR',.3],['pelvis','head',.55]]; // joints may bend but not fold flat onto themselves
  const RAD={head:.11,pelvis:.14,chest:.15,default:.07};
  let pts=null,sticks=[],group=null,meshes=[],spheres=[],host=null,saved=null;
  const idx=n=>NAMES.indexOf(n);
  function build(origin,yaw,vel){
    const cs=Math.cos(yaw),sn=Math.sin(yaw);
    pts=NAMES.map(n=>{const q=P0[n];const x=q[0]*cs+q[2]*sn,z=-q[0]*sn+q[2]*cs;const p=new V(origin.x+x,origin.y+q[1],origin.z+z);return {p,o:p.clone().addScaledVector(vel,-DT),r:RAD[n]||RAD.default,n};});
    pts.forEach(q=>{if(/^(ha|ft|el|kn|head)/.test(q.n)){const j=new V((Math.random()-.5)*2.6,(Math.random()-.2)*1.6,(Math.random()-.5)*2.6);q.o.addScaledVector(j,-DT);}}); // limbs flail a little differently each time
    sticks=[];const add=(a,b,min)=>{const ia=idx(a),ib=idx(b);sticks.push({a:ia,b:ib,L:pts[ia].p.distanceTo(pts[ib].p),min:!!min});};
    LIMBS.forEach(l=>add(l[0],l[1]));BRACE.forEach(l=>add(l[0],l[1]));MINS.forEach(l=>{const ia=idx(l[0]),ib=idx(l[1]);sticks.push({a:ia,b:ib,L:l[2],min:true});});
  }
  function makeMeshes(parent){
    group=new THREE.Group();group.name='ragdoll';
    const mat=new THREE.MeshStandardMaterial({color:'#9aa3b2',roughness:.55,metalness:.05});
    meshes=LIMBS.map(l=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,10,1),mat);m.castShadow=m.receiveShadow=!!S.shadows;group.add(m);return {m,a:idx(l[0]),b:idx(l[1]),r:l[2]};});
    spheres=NAMES.map(n=>{const rr=n==='head'?.11:n==='pelvis'||n==='chest'?.15:(LIMBS.find(l=>l[1]===n)||[0,0,.07])[2]*1.05;const m=new THREE.Mesh(new THREE.SphereGeometry(rr,14,10),mat);m.castShadow=m.receiveShadow=!!S.shadows;group.add(m);return m;});
    parent.add(group);
  }
  const UP=new V(0,1,0),tmp=new V(),dir=new V();
  function paint(){
    pts.forEach((q,i)=>spheres[i].position.copy(q.p));
    meshes.forEach(k=>{const a=pts[k.a].p,b=pts[k.b].p;dir.subVectors(b,a);const L=dir.length()||1e-4;k.m.position.addVectors(a,b).multiplyScalar(.5);k.m.quaternion.setFromUnitVectors(UP,dir.divideScalar(L));k.m.scale.set(k.r,L,k.r);});
  }
  const boxes=()=>walk.boxes||[];
  function collide(q,first){
    const p=q.p,r=q.r;let hit=false;
    if(p.y<r){p.y=r;hit=true;}
    for(const b of boxes()){
      if(b.max.y-b.min.y<.05)continue;
      if(p.x<b.min.x-r||p.x>b.max.x+r||p.y<b.min.y-r||p.y>b.max.y+r||p.z<b.min.z-r||p.z>b.max.z+r)continue;
      const dx=Math.min(p.x-(b.min.x-r),b.max.x+r-p.x),dy=Math.min(p.y-(b.min.y-r),b.max.y+r-p.y),dz=Math.min(p.z-(b.min.z-r),b.max.z+r-p.z);
      if(dy<=dx&&dy<=dz){p.y=(p.y-b.min.y)<(b.max.y-p.y)?b.min.y-r:b.max.y+r;}
      else if(dx<=dz){p.x=(p.x-b.min.x)<(b.max.x-p.x)?b.min.x-r:b.max.x+r;}
      else p.z=(p.z-b.min.z)<(b.max.z-p.z)?b.min.z-r:b.max.z+r;
      hit=true;
    }
    if(hit){q.o.x+=(p.x-q.o.x)*.22;q.o.z+=(p.z-q.o.z)*.22;} // contact friction
  }
  function step(){
    for(const q of pts){tmp.subVectors(q.p,q.o).multiplyScalar(.995);q.o.copy(q.p);q.p.add(tmp);q.p.y+=G*DT*DT;}
    for(let it=0;it<9;it++){
      for(const s of sticks){
        const A=pts[s.a],B=pts[s.b];dir.subVectors(B.p,A.p);const L=dir.length()||1e-6;
        if(s.min&&L>=s.L)continue;
        const k=(L-s.L)/L*.5;dir.multiplyScalar(k);A.p.add(dir);B.p.sub(dir);
      }
      for(const q of pts)collide(q);
    }
  }
  /* ---- start / stop ---- */
  R.start=(opts={})=>{
    if(R.active||!walk.on)return false;
    const p=walk.pos,yaw=walk.yaw,pl=walk.player;
    const v=walk.vel?walk.vel():new V();
    const push=opts.push==null?3.5:opts.push,fw=new V(-Math.sin(yaw),0,-Math.cos(yaw));
    const vel=new V(v.x,0,v.z).addScaledVector(fw,push).add(new V((Math.random()-.5)*1.2,(opts.up==null?3.2:opts.up),(Math.random()-.5)*1.2));
    build(new V(p.x,p.y,p.z),yaw,vel);
    host=null;saved=null;
    if(pl&&pl.holder){
      host=pl;saved={pos:pl.holder.position.clone(),rot:pl.holder.rotation.clone(),scale:pl.holder.scale.clone(),root:pl.root.visible};
      pl.holder.position.set(0,0,0);pl.holder.rotation.set(0,0,0);pl.holder.scale.set(1,1,1);pl.holder.updateMatrixWorld(true);
      pl.root.visible=false;makeMeshes(pl.holder);
      if(pl.rig)pl.rig.set(0,0,1);
    }else makeMeshes(scene);
    paint();R.active=true;R.t=0;R.still=0;R.acc=0;
    walk.setHook&&walk.setHook(hook);
    toast&&toast('Ragdoll. Press X or Space to get up.',2200);bump();return true;
  };
  R.stop=(why)=>{
    if(!R.active)return;R.active=false;
    const pe=pts[idx('pelvis')].p,ch=pts[idx('chest')].p,hd=pts[idx('head')].p;
    let floor=0;for(const b of boxes()){if(pe.x>b.min.x-.2&&pe.x<b.max.x+.2&&pe.z>b.min.z-.2&&pe.z<b.max.z+.2&&b.max.y<=pe.y+.2&&b.max.y>floor)floor=b.max.y;}
    walk.setHook&&walk.setHook(null);
    walk.place(pe.x,floor,pe.z);
    if(group){group.parent&&group.parent.remove(group);group.traverse(n=>{if(n.isMesh){n.geometry.dispose();}});meshes[0]&&meshes[0].m.material.dispose();group=null;}
    if(host&&saved){host.root.visible=saved.root;host.holder.scale.copy(saved.scale);host.holder.position.set(pe.x,floor,pe.z);host.holder.rotation.copy(saved.rot);host.holder.updateMatrixWorld(true);}
    host=null;saved=null;pts=null;bump();
  };
  R.toggle=(o)=>R.active?R.stop('key'):R.start(o);
  /* called by the walk loop after input, before the camera: the body drives where the character "is" */
  function hook(p,st){
    st.cvx=st.cvz=0;st.vy=0;st.ground=true;
    const pe=pts[idx('pelvis')].p;p.x=pe.x;p.z=pe.z;p.y=Math.max(0,pe.y-.95);
    if(!walk.third){const hd=pts[idx('head')].p;st.eyeO=hd;}else st.eyeO=null;
    st.hold=true;
  }
  R.tick=dt=>{
    if(!R.active)return;dt=Math.min(dt,.05);R.acc=(R.acc||0)+dt;let n=0;
    while(R.acc>=DT&&n<12){step();R.acc-=DT;n++;}
    paint();R.t+=dt;
    const q=pts[idx('pelvis')];const sp=q.p.distanceTo(q.o)/DT;R.still=sp<.5?R.still+dt:0;
    if(R.auto&&R.t>1.6&&R.still>1.2)R.stop('settled');
    bump();
  };
  /* keys: X goes limp or gets up; Space also gets up */
  addEventListener('keydown',e=>{
    if(!walk.on||e.repeat||(e.target&&e.target.matches&&e.target.matches('input,textarea,select')))return;
    if(e.code==='KeyX'){R.toggle();}
    else if(e.code==='Space'&&R.active&&R.t>.6){R.stop('space');e.stopImmediatePropagation();}
  },true);
  return R;
}
