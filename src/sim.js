/* Simulation engine: rigid-body physics on Rapier (MIT, loaded from jsDelivr, pinned).
   Every object can have a body, meta.phys = {type:'static'|'dynamic'|'kinematic'|'none', shape, mass, bounce, friction}.
   "Drop" is the one-button path: objects that have no setting yet are chosen for you (flat things and big slabs become solid ground,
   everything else falls), the world is built from the current poses and starts running. Reset puts everything back and removes
   whatever the simulation spawned (thrown balls, showers, towers). The floor is a fixed plane at y = 0 that can be switched off. */
const CDN='https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js';
export const RAPIER_CDN=CDN;   // n0ise Core loads the same pinned build
export const MATERIALS={
  rock:{label:'Rock',bounce:.08,friction:.9,mass:20},
  wood:{label:'Wood',bounce:.2,friction:.6,mass:8},
  rubber:{label:'Rubber',bounce:.75,friction:.9,mass:4},
  bouncy:{label:'Bouncy',bounce:.95,friction:.4,mass:2},
  ice:{label:'Ice',bounce:.1,friction:.03,mass:10},
  feather:{label:'Feather',bounce:.2,friction:.5,mass:.4}
};
export function createSim(c){
  const {THREE,S,bump,removeObj}=c;
  let R=null,loading=null,world=null,items=[],saved=new Map(),acc=0,floorCol=null;
  const st={playing:false,g:-9.81,t:0,speed:1,floor:true,hits:0};
  const load=()=>loading||(loading=import(/* webpackIgnore: true */ CDN).then(async m=>{const r=m.default||m;await r.init();R=r;return r;}));
  const V=()=>new THREE.Vector3();
  function localBox(o){
    const h=o.holder,q=h.quaternion.clone();h.quaternion.identity();h.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(h);h.quaternion.copy(q);h.updateMatrixWorld(true);return b;
  }
  function guessShape(o){
    const n=(o.name||'').toLowerCase(),a=(o.meta&&o.meta.asset)||'';
    if(/sphere|ball/.test(n+a))return 'sphere';if(/capsule|human/.test(n+a))return 'capsule';if(/cylinder|pillar|cone/.test(n+a))return 'cylinder';
    if(/ramp|stairs|pyramid|knot|torus|ring/.test(n))return 'hull';return 'box';
  }
  function hullPoints(o,center,q){
    const pts=[],inv=q.clone().invert(),v=V();let total=0;
    o.holder.updateMatrixWorld(true);
    o.holder.traverse(n=>{if(n.isMesh&&n.geometry&&n.geometry.attributes.position)total+=n.geometry.attributes.position.count;});
    const stride=Math.max(1,Math.floor(total/700));
    o.holder.traverse(n=>{if(!n.isMesh||!n.geometry||!n.geometry.attributes.position)return;const p=n.geometry.attributes.position;
      for(let i=0;i<p.count;i+=stride){v.fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld).sub(center).applyQuaternion(inv);pts.push(v.x,v.y,v.z);}});
    return new Float32Array(pts);
  }
  /* pick a sensible body for anything the user has not set yet */
  function autoType(o){
    const b=localBox(o);if(b.isEmpty())return 'none';const s=b.getSize(V());
    const flat=Math.min(s.x,s.y,s.z)<Math.max(s.x,s.y,s.z)*.06,n=(o.name||'').toLowerCase();
    if(o.meta&&(o.meta.player||o.meta.goal))return 'none';
    if(o.kind==='viz'||o.kind==='splat'||o.kind==='points')return 'none';
    if(flat&&(/plane|ground|floor/.test(n)||s.y<.05))return 'static';
    if(/ground|floor|platform|slab|ramp|stairs|wall/.test(n)&&Math.max(s.x,s.z)>2.2)return 'static';
    if(/ramp|stairs/.test(n))return 'static';
    return 'dynamic';
  }
  function autoPrep(def){let n=0;for(const o of S.objs){if(!o.vis)continue;o.meta=o.meta||{};if(!o.meta.phys||o.meta.phys.type===undefined){let t=autoType(o);if(def&&t==='dynamic')t=def;o.meta.phys={type:t};n++;}}return n;}
  function makeItem(o){
    const ph=o.meta&&o.meta.phys;if(!ph||ph.type==='none'||!o.vis)return null;
    const h=o.holder;if(!saved.has(o.id))saved.set(o.id,{p:h.position.clone(),q:h.quaternion.clone()});
    const b=localBox(o);if(b.isEmpty())return null;
    const sz=b.getSize(V()),ctr=b.getCenter(V()),off=ctr.clone().sub(h.position);
    const pos=h.position.clone().add(off.clone().applyQuaternion(h.quaternion)),q=h.quaternion.clone();
    const hx=Math.max(.01,sz.x/2),hy=Math.max(.01,sz.y/2),hz=Math.max(.01,sz.z/2);
    let desc;const shape=ph.shape||guessShape(o);
    if(shape==='sphere')desc=R.ColliderDesc.ball((hx+hy+hz)/3);
    else if(shape==='capsule'){const r=Math.min(hx,hz);desc=R.ColliderDesc.capsule(Math.max(.001,hy-r),r);}
    else if(shape==='cylinder')desc=R.ColliderDesc.cylinder(hy,Math.max(hx,hz));
    else if(shape==='hull'){const pts=hullPoints(o,pos,q);desc=pts.length>=12?R.ColliderDesc.convexHull(pts):null;}
    if(!desc)desc=R.ColliderDesc.cuboid(hx,hy,hz);
    const vol=Math.max(1e-4,sz.x*sz.y*sz.z);
    desc.setRestitution(ph.bounce??.25).setFriction(ph.friction??.7);
    if(ph.type==='dynamic')desc.setDensity(Math.max(.01,(ph.mass??10)/vol));
    const bd=ph.type==='dynamic'?R.RigidBodyDesc.dynamic().setCcdEnabled(true).setLinearDamping(.02).setAngularDamping(.1):ph.type==='kinematic'?R.RigidBodyDesc.kinematicPositionBased():R.RigidBodyDesc.fixed();
    bd.setTranslation(pos.x,pos.y,pos.z).setRotation({x:q.x,y:q.y,z:q.z,w:q.w});
    const body=world.createRigidBody(bd),col=world.createCollider(desc,body);
    const it={o,body,off,dynamic:ph.type==='dynamic',handle:col.handle};items.push(it);return it;
  }
  async function build(){
    await load();
    world=new R.World({x:0,y:st.g,z:0});items=[];saved.clear();acc=0;
    floorCol=world.createCollider(R.ColliderDesc.cuboid(300,.5,300).setTranslation(0,-.5,0).setFriction(.8).setRestitution(.2));
    floorCol.setEnabled(!!st.floor);
    for(const o of S.objs)makeItem(o);
  }
  function sync(){
    for(const it of items){if(!it.dynamic)continue;
      const t=it.body.translation(),r=it.body.rotation(),h=it.o.holder;
      h.quaternion.set(r.x,r.y,r.z,r.w);h.position.set(t.x,t.y,t.z).sub(it.off.clone().applyQuaternion(h.quaternion));
      if(t.y<-60){it.body.setTranslation({x:0,y:6,z:0},true);it.body.setLinvel({x:0,y:0,z:0},true);}
    }
    bump();
  }
  const kinds=()=>({dynamic:items.filter(i=>i.dynamic).length,fixed:items.filter(i=>!i.dynamic).length});
  const api={
    st,MATERIALS,
    get playing(){return st.playing;},
    get counts(){return kinds();},
    autoPrep,
    /* the one-button path */
    async drop(def){autoPrep(def);if(!world)await build();st.playing=true;const k=kinds();return{playing:true,bodies:items.length,...k};},
    async play(){if(!world)await build();st.playing=true;return{playing:true,bodies:items.length};},
    pause(){st.playing=false;return{playing:false};},
    reset(){
      st.playing=false;st.t=0;
      S.objs.filter(o=>o.meta&&o.meta.spawn).map(o=>o.id).forEach(id=>removeObj&&removeObj(id));
      saved.forEach((v,id)=>{const o=S.objs.find(x=>x.id===id);if(o){o.holder.position.copy(v.p);o.holder.quaternion.copy(v.q);}});
      world=null;items=[];saved.clear();bump();return{reset:true};
    },
    async kick(power=6){if(!world)await build();items.forEach(it=>{if(it.dynamic){it.body.applyImpulse({x:(Math.random()-.5)*power,y:power*.8+Math.random()*power*.4,z:(Math.random()-.5)*power},true);it.body.wakeUp();}});st.playing=true;return{kicked:items.filter(i=>i.dynamic).length};},
    /* a new object joins a running world (thrown balls, showers). Poses of everything else keep going */
    async addBody(o,vel){
      if(!world)await build();o.meta=o.meta||{};if(!o.meta.phys||o.meta.phys.type==='none')o.meta.phys={type:'dynamic'};
      const it=makeItem(o);if(it&&vel){it.body.setLinvel({x:vel[0],y:vel[1],z:vel[2]},true);}
      st.playing=true;return it;
    },
    setGravity(g){st.g=g;if(world){world.gravity={x:0,y:g,z:0};items.forEach(it=>it.body.wakeUp());}return{gravity:g};},
    setFloor(on){st.floor=!!on;if(floorCol)floorCol.setEnabled(!!on);items.forEach(it=>it.body.wakeUp());return{floor:st.floor};},
    setSpeed(v){st.speed=v;return{speed:v};},
    /* every dynamic object takes the material (bounce, friction, mass) */
    material(key,only){const m=MATERIALS[key];if(!m)return;
      (only?[only]:S.objs).forEach(o=>{if(!o.meta)return;const p=o.meta.phys=o.meta.phys||{type:'dynamic'};if(p.type==='none')return;p.bounce=m.bounce;p.friction=m.friction;if(p.type==='dynamic')p.mass=m.mass;});
      if(world){const w=world;items.forEach(it=>{const col=w.getCollider(it.handle);if(!col)return;const p=it.o.meta.phys;col.setRestitution(p.bounce??.25);col.setFriction(p.friction??.7);it.body.wakeUp();});}
      return{material:key};},
    invalidate(){if(st.playing)return;world=null;items=[];},
    tick(dt){
      if(!st.playing||!world)return;
      acc+=Math.min(dt,.1)*st.speed;let n=0;
      while(acc>=1/60&&n<5){world.step();acc-=1/60;n++;}
      if(acc>1/60)acc=0;
      st.t+=n/60;sync();
    }
  };
  return api;
}
