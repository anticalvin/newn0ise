/* Builds a validated .n0world document into the 3D scene using the scene API, keeps it editable (a prefab stays one object with parameters,
   groups stay groups), exports it back, and runs the closed rule set. Nothing here evaluates anything from a file: every behaviour is one of
   the fixed actions below. Extension points: PREFABS (world-schema.js) + GEN here, TRIGGERS/ACTIONS + the switch statements in runRule. */
import {PREFABS,PRIM_TYPES,READY_TYPES,LIMITS,emptyWorld,FORMAT,VERSION,validateWorld} from './world-schema.js';
const D2R=Math.PI/180,r3=x=>Math.round(x*1000)/1000;
export function createWorldBuilder(c){
  const {THREE,S,world,api,addGroup,removeObj,objById,walk,toast,bump,applyLook,applyEnv,renderObjList,refreshInspector,selectObj}=c;
  const W={doc:null,map:new Map(),flags:new Map(),collected:0,hash:'',report:null,rules:null};
  const pinkMat=()=>new THREE.MeshBasicMaterial({color:0xff2bd6,wireframe:true});

  /* ---- materials ---- */
  const texCache=new Map();
  function patternTex(p,base){
    const key=p.type+p.color2+p.scale+base;if(texCache.has(key))return texCache.get(key);
    const cv=document.createElement('canvas');cv.width=cv.height=128;const g=cv.getContext('2d');
    g.fillStyle=base;g.fillRect(0,0,128,128);g.fillStyle=p.color2;
    if(p.type==='checker'){g.fillRect(0,0,64,64);g.fillRect(64,64,64,64);}
    else if(p.type==='stripes'){g.fillRect(0,0,128,64);}
    else{let s=7;for(let i=0;i<900;i++){s=(s*16807)%2147483647;const x=s%128;s=(s*16807)%2147483647;const y=s%128;g.globalAlpha=.25;g.fillRect(x,y,2,2);}g.globalAlpha=1;}
    const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(p.scale,p.scale);t.colorSpace=THREE.SRGBColorSpace;texCache.set(key,t);return t;
  }
  function makeMat(name,color){
    const d=name&&W.doc&&W.doc.materials[name];
    const m=new THREE.MeshStandardMaterial({color:(d&&d.color)||color||'#b9b4ac',roughness:d?d.roughness:.6,metalness:d?d.metalness:0});
    if(d){if(d.emissive){m.emissive.set(d.emissive);m.emissiveIntensity=d.emissiveIntensity||1;}if(d.opacity!=null&&d.opacity<1){m.transparent=true;m.opacity=d.opacity;}if(d.pattern)m.map=patternTex(d.pattern,d.color);}
    if(color&&!d)m.color.set(color);
    m.userData.n0m=name||null;return m;
  }
  function recolour(o,matName,color){
    o.holder.traverse(n=>{if(!n.isMesh||n.userData.noView)return;const old=n.material;
      if(!old||!old.color)return;
      if(matName){n.material=makeMat(matName,color);}else if(color){(Array.isArray(old)?old:[old]).forEach(m=>{if(m.color)m.color.set(color);});}
    });
  }

  /* ---- prefab generators: fill an existing Group with meshes (so a prefab can be regenerated in place when its parameters change) ---- */
  const box=(g,w,h,d,x,y,z,m,solid=true)=>{const me=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);me.position.set(x,y,z);me.castShadow=me.receiveShadow=true;me.userData.solid=solid;g.add(me);return me;};
  const GEN={
    group(g){},
    platform(g,p){box(g,p.width,p.thickness,p.depth,0,p.thickness/2,0,makeMat(p.material,'#bdb7ac'));},
    stairs(g,p){const m=makeMat(p.material,'#bdb7ac');for(let i=0;i<p.steps;i++){const h=p.rise*(i+1);box(g,p.width,h,p.run,0,h/2,-(i*p.run+p.run/2),m);}},
    spawn(g,p){const m=new THREE.MeshBasicMaterial({color:0x66ccff,transparent:true,opacity:.55});
      const d=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.04,24),m);d.position.y=.02;d.userData.noView=true;g.add(d);
      const a=new THREE.Mesh(new THREE.ConeGeometry(.16,.4,4),m);a.rotation.x=-Math.PI/2;a.position.set(0,.08,-.3);a.userData.noView=true;g.add(a);g.userData.marker=true;g.rotation.y=(p.yaw||0)*D2R;},
    zone(g,p){const m=new THREE.MeshBasicMaterial({color:0x66ccff,transparent:true,opacity:.14,depthWrite:false,wireframe:false});
      const z=new THREE.Mesh(new THREE.BoxGeometry(p.size[0],p.size[1],p.size[2]),m);z.position.y=p.size[1]/2;z.userData.noView=true;z.userData.zone=true;g.add(z);
      const e=new THREE.LineSegments(new THREE.EdgesGeometry(z.geometry),new THREE.LineBasicMaterial({color:0x66ccff}));e.position.copy(z.position);e.userData.noView=true;g.add(e);g.userData.marker=true;},
    door(g,p,o){
      const fm=makeMat(p.frameMaterial||p.material,'#8c8378'),lm=makeMat(p.material,'#a98c6b'),fw=.07,fd=Math.max(.14,p.thickness*2);
      box(g,fw,p.height,fd,-(p.width/2+fw/2),p.height/2,0,fm);box(g,fw,p.height,fd,p.width/2+fw/2,p.height/2,0,fm);box(g,p.width+fw*2,fw,fd,0,p.height+fw/2,0,fm);
      const left=p.hinge==='left',pivot=new THREE.Group();pivot.position.set(left?-p.width/2:p.width/2,0,0);g.add(pivot);
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(p.width-.02,p.height-.02,p.thickness),lm);leaf.position.set(left?(p.width-.02)/2:-(p.width-.02)/2,(p.height-.02)/2+.01,0);leaf.castShadow=leaf.receiveShadow=true;leaf.userData.solid=true;leaf.userData.leaf=true;pivot.add(leaf);
      const d=o.meta.door||(o.meta.door={t:p.open?1:0,target:p.open?1:0,init:p.open?1:0});d.pivot=pivot;d.leaf=leaf;d.dir=left?-1:1;pivot.rotation.y=d.dir*d.t*Math.PI/2*.96;},
    room(g,p){
      const wm=makeMat(p.material,'#d8d0c2'),fm=makeMat(p.floorMaterial||p.material,'#9a9a94'),W2=p.width,D=p.depth,H=p.height,T=p.wall;
      if(p.floor)box(g,W2,.1,D,0,-.05,0,fm);
      if(p.ceiling)box(g,W2,.1,D,0,H+.05,0,wm);
      const sides={n:{len:W2,cx:0,cz:-D/2+T/2,ax:'x'},s:{len:W2,cx:0,cz:D/2-T/2,ax:'x'},e:{len:D,cx:W2/2-T/2,cz:0,ax:'z'},w:{len:D,cx:-W2/2+T/2,cz:0,ax:'z'}};
      Object.keys(sides).forEach(k=>{
        const sd=sides[k],ops=(p.openings||[]).filter(o=>o.wall===k).map(o=>({a:Math.max(-sd.len/2,o.offset-o.width/2),b:Math.min(sd.len/2,o.offset+o.width/2),h:Math.min(H,o.height)})).filter(o=>o.b>o.a).sort((x,y)=>x.a-y.a);
        const put=(a,b,y0,y1)=>{if(b-a<.01||y1-y0<.01)return;const mid=(a+b)/2,len=b-a,hh=y1-y0;
          if(sd.ax==='x')box(g,len,hh,T,sd.cx+mid,y0+hh/2,sd.cz,wm);else box(g,T,hh,len,sd.cx,y0+hh/2,sd.cz+mid,wm);};
        let cur=-sd.len/2;ops.forEach(o=>{if(o.a>cur)put(cur,o.a,0,H);put(o.a,o.b,o.h,H);cur=Math.max(cur,o.b);});put(cur,sd.len/2,0,H);
      });}
  };
  function fill(o,kind,params){
    const g=o.root;
    for(let i=g.children.length-1;i>=0;i--){const ch=g.children[i];g.remove(ch);ch.traverse(n=>{if(n.geometry)n.geometry.dispose();});}
    g.rotation.set(0,0,0);GEN[kind](g,params,o);
    if(S.shadows&&c.setShadowFlags)c.setShadowFlags(o.holder);
    o.holder.updateMatrixWorld(true);
  }
  const prefabObject=(inst)=>{
    const g=new THREE.Group(),meta={noAuto:true,phys:{type:'none'},n0w:{id:inst.id,prefab:inst.prefab,params:inst.params}};
    const o=addGroup(inst.name,g,meta);
    meta.colliders=()=>{if(!o.vis||!o.holder.visible)return[];const out=[];o.holder.updateMatrixWorld(true);
      o.holder.traverse(n=>{if(!n.isMesh||!n.userData.solid)return;
        if(n.userData.leaf&&o.meta.door&&o.meta.door.t>.5)return;
        const b=new THREE.Box3().setFromObject(n);if(!b.isEmpty())out.push(b);});return out;};
    fill(o,inst.prefab,inst.params);return o;
  };

  /* ---- build ---- */
  function clear(){
    S.objs.slice().forEach(o=>removeObj(o.id));
    api.run({cmd:'light',op:'clear'}).catch(()=>{});
    W.map.clear();W.flags.clear();W.collected=0;W.doc=null;
  }
  const depthOf=(doc,o)=>{let d=0,p=o;const by=new Map(doc.instances.map(x=>[x.id,x]));while(p&&p.parent!=null&&d<8){p=by.get(p.parent);d++;}return d;};
  async function build(doc,{replace=true}={}){
    if(replace)clear();else{W.map.clear();W.flags.clear();W.collected=0;}
    W.spawn=null;
    W.doc=doc;texCache.clear();
    const E=doc.scene.environment||{};
    if(applyEnv)applyEnv(E);
    const order=doc.instances.map((o,i)=>[depthOf(doc,o),i,o]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(x=>x[2]);
    const failed=[];
    for(const inst of order){
      try{
        let o;
        if(inst.prefab){o=prefabObject(inst);}
        else if(inst.placeholder){o=addGroup(inst.name+' (placeholder)',(()=>{const g=new THREE.Group(),m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),pinkMat());m.position.y=.5;m.userData.noView=true;g.add(m);return g;})(),{noAuto:true,phys:{type:'none'},n0w:{id:inst.id,placeholder:inst.placeholder}});}
        else{
          const a={cmd:'add',type:inst.type,name:inst.name,pos:inst.pos};
          if(inst.dims)a.dims=inst.dims;if(inst.scale!=null)a.scale=inst.scale;if(inst.rot)a.rot=inst.rot;if(inst.phys)a.phys=inst.phys;
          const info=await api.run(a);o=objById(info.id);
          if(inst.material||inst.color)recolour(o,inst.material,inst.color);
          o.meta.n0w={id:inst.id,type:inst.type,material:inst.material||null};
          const keep=o.holder.rotation.clone();o.holder.rotation.set(0,0,0);o.holder.updateMatrixWorld(true);
          const sz=new THREE.Box3().setFromObject(o.holder).getSize(new THREE.Vector3());o.holder.rotation.copy(keep);o.holder.updateMatrixWorld(true);
          o.meta.n0w.dims0=sz.toArray();o.meta.n0w.s0=o.holder.scale.toArray();
        }
        const h=o.holder;
        if(inst.prefab||inst.placeholder){h.position.set(...inst.pos);h.rotation.set(...inst.rot.map(v=>v*D2R));if(inst.scale!=null){if(Array.isArray(inst.scale))h.scale.set(...inst.scale);else h.scale.setScalar(inst.scale);}}
        if(inst.prefab==='spawn'&&!W.spawn)W.spawn=inst;
        if(inst.material&&inst.prefab&&inst.prefab!=='door')recolour(o,inst.material);
        o.meta.n0w.id=inst.id;o.meta.n0w.name0=inst.name;
        if(inst.visible===false){o.vis=false;h.visible=false;}
        if(inst.parent!=null&&W.map.has(inst.parent)){W.map.get(inst.parent).holder.add(h);}
        W.map.set(inst.id,o);o.meta.n0w.init={pos:h.position.toArray(),vis:o.vis};
        h.updateMatrixWorld(true);
      }catch(e){failed.push(inst.id+': '+String(e.message||e));}
    }
    for(const l of doc.lights){try{await api.run({cmd:'light',op:'add',type:l.type,pos:l.pos,target:l.target,color:l.color,intensity:l.intensity,angle:l.angle,shadow:l.shadow});}catch(e){failed.push('light '+l.id+': '+e.message);}}
    const cam=doc.cameras[0];if(cam){try{walk.on||await api.run({cmd:'camera',pos:cam.pos,target:cam.target,fov:cam.fov});}catch(e){}}
    else if(c.frameAll)c.frameAll();
    const sp=W.spawn;if(sp){S.start=[sp.pos[0],0,sp.pos[2]];S.startYaw=(sp.params&&sp.params.yaw)||0;}else{S.start=null;S.startYaw=0;}
    if(applyLook)for(const l of doc.looks){try{applyLook(l,W);}catch(e){failed.push('look '+l.target+': '+e.message);}}
    W.rules.load(doc.rules);
    renderObjList&&renderObjList();bump();
    return {failed};
  }

  /* ---- export: the current scene as a .n0world document (what was built, plus what was edited by hand) ---- */
  function exportDoc(){
    const base=W.doc?JSON.parse(JSON.stringify(W.doc)):emptyWorld();
    const out={...base,format:FORMAT,version:VERSION,instances:[],lights:[]};
    const idOf=o=>o.meta&&o.meta.n0w?o.meta.n0w.id:null;
    const used=new Set(S.objs.map(idOf).filter(Boolean)),skipped=[];
    const parentId=o=>{const p=o.holder.parent;if(!p||p===world)return undefined;const po=S.objs.find(x=>x.holder===p);return po?idOf(po)||('obj'+po.id):undefined;};
    S.objs.forEach(o=>{
      if(o.meta&&o.meta.player)return;
      const m=o.meta&&o.meta.n0w,h=o.holder;
      const tr={pos:h.position.toArray().map(r3),rot:[h.rotation.x,h.rotation.y,h.rotation.z].map(x=>r3(x/D2R))};
      const par=parentId(o);
      if(m&&m.prefab){const inst={id:m.id,name:o.name,prefab:m.prefab,params:JSON.parse(JSON.stringify(m.params)),...tr};if(o.vis===false)inst.visible=false;if(par)inst.parent=par;out.instances.push(inst);}
      else if(m&&m.placeholder){const was=(base.instances.find(x=>x.id===m.id)||{});out.instances.push({...was,...tr});}
      else{
        let type=m&&m.type,id=m&&m.id;
        if(!type){const nm=Object.keys(c.PRIMS||{}).find(k=>k===o.name||o.name.startsWith(k));type=nm?nm.toLowerCase():null;}
        if(!type||!(PRIM_TYPES.includes(type)||READY_TYPES.includes(type))){skipped.push(o.name);return;}
        if(!id){id='obj'+o.id;while(used.has(id))id+='_';used.add(id);}
        const inst={id,name:o.name,type,...tr};
        if(m&&m.dims0){const s0=m.s0,s=h.scale.toArray();inst.dims=m.dims0.map((d,i)=>r3(d*(s[i]/(s0[i]||1))));}
        else{const b=new THREE.Box3().setFromObject(h);inst.dims=b.getSize(new THREE.Vector3()).toArray().map(r3);}
        if(m&&m.material)inst.material=m.material;
        else{let col=null;h.traverse(n=>{if(!col&&n.isMesh&&n.material&&n.material.color)col='#'+n.material.color.getHexString();});if(col)inst.color=col;}
        const ph=o.meta&&o.meta.phys;if(ph&&ph.type)inst.phys={...ph};
        if(o.vis===false)inst.visible=false;if(par)inst.parent=par;
        out.instances.push(inst);
      }
    });
    try{out.lights=(W.lightsCache||[]).map(l=>({id:l.id,type:l.type,pos:l.pos,color:l.color,intensity:l.intensity,shadow:!!l.shadow}));}catch(e){}
    out.cameras=[{id:'main',pos:c.camera.position.toArray().map(r3),target:c.controls.target.toArray().map(r3),fov:r3(c.camera.fov)}];
    // drop rules whose targets no longer exist, so the exported file stays valid
    const have=new Set(out.instances.map(i=>i.id));
    out.rules=(out.rules||[]).filter(rl=>(!rl.when.target||have.has(rl.when.target))&&rl.then.every(a=>!a.target||have.has(a.target)));
    out.looks=(out.looks||[]).filter(l=>{const m=/^object:(.+)$/.exec(l.target);return !m||have.has(m[1]);});
    return {doc:out,skipped};
  }

  /* ---- prefab parameters edited by hand (the World pane): regenerate in place ---- */
  function setParams(o,patch){
    const m=o.meta&&o.meta.n0w;if(!m||!m.prefab)return false;
    const spec=PREFABS[m.prefab].params,next={...m.params};
    Object.keys(patch).forEach(k=>{const s=spec[k];if(!s)return;let v=patch[k];if(s.t==='num'||s.t==='int'){v=Math.min(s.max,Math.max(s.min,+v));if(s.t==='int')v=Math.round(v);if(!isFinite(v))return;}next[k]=v;});
    m.params=next;fill(o,m.prefab,next);bump();return true;
  }

  /* ---- rules: a closed set. Nothing in a file can add to this list. ---- */
  const R=W.rules={
    list:[],t:0,seen:new Map(),inside:new Map(),fired:new Set(),anim:[],log:[],walked:false,msgT:0,hintEl:null,btn:null,near:null,depth:0,warned:false,
    load(rules){R.list=rules.map(x=>({...x}));R.reset();},
    reset(){R.t=0;R.inside.clear();R.fired.clear();R.anim.length=0;W.flags.clear();W.collected=0;R.log.length=0;R.warned=false;
      W.map.forEach(o=>{const m=o.meta&&o.meta.n0w;if(!m||!m.init)return;o.holder.position.fromArray(m.init.pos);if(m.init.vis!==false){o.vis=true;o.holder.visible=true;}
        if(o.meta.door){const d=o.meta.door;d.t=d.target=d.init||0;if(d.pivot)d.pivot.rotation.y=d.dir*d.t*Math.PI/2*.96;}});
      R.timerState=R.list.map(()=>({acc:0,done:false}));},
    allow(){const now=performance.now();R.log=R.log.filter(x=>now-x<1000);if(R.log.length>=LIMITS.actionsPerSecond){if(!R.warned){R.warned=true;toast('A rule is running too often, so some actions were skipped.');}return false;}R.log.push(now);return true;},
    objBox(id){const o=W.map.get(id);if(!o||!o.holder)return null;const b=new THREE.Box3().setFromObject(o.holder);return b.isEmpty()?null:b;},
    playerIn(id,p,pad=0){const b=R.objBox(id);if(!b)return false;return p.x>b.min.x-pad&&p.x<b.max.x+pad&&p.z>b.min.z-pad&&p.z<b.max.z+pad&&p.y>b.min.y-1.8&&p.y<b.max.y+pad+.5;},
    dist(id,p){const b=R.objBox(id);if(!b)return 1e9;const dx=Math.max(b.min.x-p.x,0,p.x-b.max.x),dz=Math.max(b.min.z-p.z,0,p.z-b.max.z);return Math.hypot(dx,dz);},
    sound(name){try{const ac=R.ac||(R.ac=new (window.AudioContext||window.webkitAudioContext)());const o=ac.createOscillator(),g=ac.createGain(),t=ac.currentTime;
      const P={ding:[880,.25,'sine'],click:[300,.05,'square'],whoosh:[180,.35,'sawtooth'],thud:[70,.2,'sine'],chime:[1320,.4,'triangle']}[name]||[600,.1,'sine'];
      o.type=P[2];o.frequency.setValueAtTime(P[0],t);if(name==='whoosh')o.frequency.exponentialRampToValueAtTime(40,t+P[1]);g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+P[1]);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+P[1]+.02);}catch(e){}},
    run(rule,a){
      if(!R.allow())return;
      switch(a.action){
        case 'toggle-open':{const o=W.map.get(a.target);if(!o||!o.meta.door)return;const d=o.meta.door;d.target=a.state==='open'?1:a.state==='closed'?0:(d.target>.5?0:1);R.sound('whoosh');break;}
        case 'move-to':{const o=W.map.get(a.target);if(!o)return;R.anim=R.anim.filter(x=>x.o!==o);R.anim.push({o,from:o.holder.position.clone(),to:new THREE.Vector3(...a.pos),t:0,dur:a.seconds});break;}
        case 'teleport':{walk.place(a.pos[0],a.pos[1],a.pos[2]);if(a.yaw!=null&&walk.setYaw)walk.setYaw(a.yaw*D2R);break;}
        case 'collect':{const o=W.map.get(a.target);if(!o||!o.vis)return;o.vis=false;o.holder.visible=false;W.collected++;W.flags.set('collected',W.collected);const tot=[...W.map.values()].length;R.sound('ding');walk.refreshBoxes&&walk.refreshBoxes();toast('Collected '+W.collected,1500);break;}
        case 'set-flag':W.flags.set(a.flag,a.value);break;
        case 'show-message':toast(a.text,Math.round(a.seconds*1000));break;
        case 'play-sound':R.sound(a.sound);break;
      }
    },
    fire(rule,i){
      if(rule.when.once&&R.fired.has(i))return;
      if(rule.if&&W.flags.get(rule.if.flag)!==rule.if.equals)return;
      R.fired.add(i);R.depth++;if(R.depth<=LIMITS.actionsPerRule)rule.then.forEach(a=>R.run(rule,a));R.depth--;
    },
    tick(dt){
      const on=!!walk.on;
      if(!on){R.walked=false;if(R.btn)R.btn.hidden=true;return;}
      if(!R.walked){R.walked=true;R.reset();walk.refreshBoxes&&walk.refreshBoxes();}
      const p=walk.pos;if(!p)return;R.t+=dt;
      /* animations */
      R.anim=R.anim.filter(x=>{x.t+=dt;const k=Math.min(1,x.t/x.dur),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;x.o.holder.position.lerpVectors(x.from,x.to,e);x.o.holder.updateMatrixWorld(true);return k<1;});
      let moved=false;
      W.map.forEach(o=>{const d=o.meta&&o.meta.door;if(!d||!d.pivot)return;if(Math.abs(d.t-d.target)>.001){d.t+=Math.sign(d.target-d.t)*Math.min(Math.abs(d.target-d.t),dt*1.8);d.pivot.rotation.y=d.dir*d.t*Math.PI/2*.96;moved=true;}});
      if(moved||R.anim.length)walk.refreshBoxes&&walk.refreshBoxes();
      let near=null,nearD=2.0;
      R.list.forEach((rule,i)=>{const w=rule.when;
        if(w.trigger==='timer'){const ts=R.timerState[i];ts.acc+=dt;if(w.every&&ts.acc>=w.every){ts.acc=0;R.fire(rule,i);}else if(w.after!=null&&!ts.done&&ts.acc>=w.after){ts.done=true;R.fire(rule,i);}}
        else if(w.trigger==='player-enter'||w.trigger==='object-touch'){const inn=R.playerIn(w.target,p,w.trigger==='object-touch'?.35:0),was=R.inside.get(i);if(inn&&!was)R.fire(rule,i);R.inside.set(i,inn);}
        else if(w.trigger==='player-interact'){const d=R.dist(w.target,p);if(d<nearD&&!(w.once&&R.fired.has(i))){nearD=d;near=i;}}});
      R.near=near;
      if(R.btn){R.btn.hidden=near==null;if(near!=null){const t=R.list[near].when.target,o=W.map.get(t);R.btn.textContent='Use '+(o?o.name:'');}}
    },
    interact(){if(R.near!=null&&walk.on){const rule=R.list[R.near];R.fire(rule,R.near);}},
    mountUi(){
      if(R.btn)return;const b=document.createElement('button');b.id='n0use';b.hidden=true;b.type='button';b.setAttribute('aria-label','Use');
      b.style.cssText='position:fixed;left:50%;bottom:calc(120px + env(safe-area-inset-bottom));transform:translateX(-50%);min-height:44px;min-width:96px;padding:10px 18px;border-radius:22px;border:1px solid rgba(255,255,255,.35);background:rgba(20,20,22,.6);color:#fff;backdrop-filter:blur(14px);z-index:60;font:inherit';
      b.addEventListener('click',()=>R.interact());document.body.appendChild(b);R.btn=b;
      addEventListener('keydown',e=>{if(e.code==='KeyE'&&!e.repeat&&!/input|textarea|select/i.test((e.target&&e.target.tagName)||''))R.interact();});
    }
  };
  R.mountUi();
  W.build=build;W.clear=clear;W.exportDoc=exportDoc;W.setParams=setParams;W.recolour=recolour;W.tick=dt=>R.tick(dt);W.GEN=GEN;
  W.isWorldObject=o=>!!(o.meta&&o.meta.n0w);
  return W;
}
