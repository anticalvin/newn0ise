/* Simulation engine: rigid-body physics on Rapier (MIT, loaded from jsDelivr, pinned). Objects opt in with meta.phys:
   {type:'static'|'dynamic'|'kinematic', shape:'box'|'sphere'|'capsule'|'cylinder'|'hull', mass, bounce, friction}.
   Play builds the world from the scene's current poses, steps it at 60 Hz and writes the poses back. Reset puts every object
   back where it was. The floor is a fixed plane at y = 0. */
const CDN='https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js';
export function createSim(c){
  const {THREE,S,bump}=c;
  let R=null,loading=null,world=null,items=[],saved=new Map(),acc=0;
  const st={playing:false,g:-9.81,t:0};
  const load=()=>loading||(loading=import(/* webpackIgnore: true */ CDN).then(async m=>{const r=m.default||m;await r.init();R=r;return r;}));
  const V=()=>new THREE.Vector3();
  function localBox(o){
    const h=o.holder,q=h.quaternion.clone();h.quaternion.identity();h.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(h);h.quaternion.copy(q);h.updateMatrixWorld(true);return b;
  }
  function guessShape(o){
    const n=(o.name||'').toLowerCase(),a=(o.meta&&o.meta.asset)||'';
    if(/sphere|ball/.test(n+a))return 'sphere';if(/capsule|human/.test(n+a))return 'capsule';if(/cylinder|pillar|cone/.test(n+a))return 'cylinder';return 'box';
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
  async function build(){
    await load();
    world=new R.World({x:0,y:st.g,z:0});items=[];saved.clear();acc=0;
    world.createCollider(R.ColliderDesc.cuboid(300,.5,300).setTranslation(0,-.5,0).setFriction(.8));
    for(const o of S.objs){
      const ph=o.meta&&o.meta.phys;if(!ph||ph.type==='none'||!o.vis)continue;
      const h=o.holder;saved.set(o.id,{p:h.position.clone(),q:h.quaternion.clone()});
      const b=localBox(o);if(b.isEmpty())continue;
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
      desc.setRestitution(ph.bounce??.25).setFriction(ph.friction??.7);if(ph.type==='dynamic')desc.setDensity(Math.max(.01,(ph.mass??10)/vol));
      const bd=ph.type==='dynamic'?R.RigidBodyDesc.dynamic():ph.type==='kinematic'?R.RigidBodyDesc.kinematicPositionBased():R.RigidBodyDesc.fixed();
      bd.setTranslation(pos.x,pos.y,pos.z).setRotation({x:q.x,y:q.y,z:q.z,w:q.w});
      const body=world.createRigidBody(bd);world.createCollider(desc,body);
      items.push({o,body,off,dynamic:ph.type==='dynamic'});
    }
  }
  function sync(){
    for(const it of items){if(!it.dynamic)continue;
      const t=it.body.translation(),r=it.body.rotation(),h=it.o.holder;
      h.quaternion.set(r.x,r.y,r.z,r.w);h.position.set(t.x,t.y,t.z).sub(it.off.clone().applyQuaternion(h.quaternion));
      if(t.y<-80){it.body.setTranslation({x:0,y:5,z:0},true);it.body.setLinvel({x:0,y:0,z:0},true);}
    }
    bump();
  }
  return {
    st,
    get playing(){return st.playing;},
    async play(){if(!world)await build();st.playing=true;return{playing:true,bodies:items.length};},
    pause(){st.playing=false;return{playing:false};},
    reset(){
      st.playing=false;
      saved.forEach((v,id)=>{const o=S.objs.find(x=>x.id===id);if(o){o.holder.position.copy(v.p);o.holder.quaternion.copy(v.q);}});
      world=null;items=[];saved.clear();bump();return{reset:true};
    },
    setGravity(g){st.g=g;if(world)world.gravity={x:0,y:g,z:0};return{gravity:g};},
    invalidate(){if(st.playing)return;world=null;items=[];},
    tick(dt){
      if(!st.playing||!world)return;
      acc+=Math.min(dt,.1);let n=0;
      while(acc>=1/60&&n<5){world.step();acc-=1/60;n++;}
      st.t+=n/60;sync();
    }
  };
}
