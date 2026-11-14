/* n0ise 3D scene API. One function, run(command), builds and edits a scene from plain JSON. It is what the in-page console,
   the MCP bridge (tools/mcp) and any other automation use. Everything returns plain JSON, so an AI can read the scene back,
   fix what it got wrong, render a picture, and look at it. Run `describe` for the command list.
   Units are metres, rotation is degrees, colours are '#rrggbb'. Objects sit with their base at pos.y (0 = on the floor). */
export function createApi(c){
  const {THREE,S,scene,camera,controls,renderer,canvas,hemi,key,grid,PRIMS,addPrimitive,removeObj,objById,importOne,applyView,bump,frameAll,tick,walk,projectFiles,zipStore,GLTFExporter,renderObjList,refreshInspector,setShadowFlags,sim}=c;
  const lights=new Map();let lid=0,groundMesh=null,uidc=0;
  const ASSETS={
    human:{url:'assets/models/human.glb',size:1.8,name:'Human',phys:{type:'static',shape:'capsule'}},
    wall:{type:'cube',dims:[4,3,.2],color:'#d8d0c2',phys:{type:'static'}},
    floor:{type:'cube',dims:[6,.2,6],color:'#9a9a94',phys:{type:'static'}},
    platform:{type:'cube',dims:[2,.5,2],color:'#bdb7ac',phys:{type:'static'}},
    pillar:{type:'cylinder',dims:[.5,3,.5],color:'#c7bfb2',phys:{type:'static'}},
    crate:{type:'cube',dims:[1,1,1],color:'#a67c52',phys:{type:'dynamic',mass:15}},
    ball:{type:'sphere',dims:[.8,.8,.8],color:'#d4552b',phys:{type:'dynamic',mass:5,bounce:.7}}
  };
  const num=(v,d)=>typeof v==='number'&&isFinite(v)?v:d;
  const v3=(a,d=[0,0,0])=>Array.isArray(a)?[num(a[0],d[0]),num(a[1],d[1]),num(a[2],d[2])]:d;
  const find=a=>{
    if(a==null)throw new Error('Say which object: pass id or name.');
    const o=typeof a==='number'||/^\d+$/.test(String(a))?objById(+a):S.objs.find(x=>x.name===a)||S.objs.find(x=>x.name.toLowerCase()===String(a).toLowerCase());
    if(!o)throw new Error('No object "'+a+'". Run scene to list objects.');return o;
  };
  const ref=a=>find(a.id!=null?a.id:a.name);
  const info=o=>{
    const b=new THREE.Box3().setFromObject(o.holder),e=o.holder.rotation,sz=b.isEmpty()?[0,0,0]:b.getSize(new THREE.Vector3()).toArray().map(r),h=o.holder;
    let col=null;o.holder.traverse(n=>{if(!col&&n.isMesh&&n.material&&n.material.color)col='#'+n.material.color.getHexString();});
    return {id:o.id,name:o.name,kind:o.kind,asset:o.meta&&o.meta.asset||null,phys:o.meta&&o.meta.phys||null,visible:o.vis,pos:h.position.toArray().map(r),rot:[e.x,e.y,e.z].map(x=>r(x*180/Math.PI)),scale:h.scale.toArray().map(r),size:sz,color:col,
      bounds:b.isEmpty()?null:{min:b.min.toArray().map(r),max:b.max.toArray().map(r)}};
  };
  const r=x=>Math.round(x*1000)/1000;
  function paint(o,a){
    o.holder.traverse(n=>{
      if(!n.isMesh||!n.material||n.userData.noView)return;
      const mats=Array.isArray(n.material)?n.material:[n.material];
      const own=n.userData._mat?(Array.isArray(n.userData._mat)?n.userData._mat:[n.userData._mat]):mats;
      own.forEach(m=>{
        if(a.color&&m.color)m.color.set(a.color);
        if(a.emissive!=null&&m.emissive){m.emissive.set(a.emissive);if(m.emissiveIntensity!=null)m.emissiveIntensity=num(a.emissiveIntensity,1);}
        if(a.metalness!=null&&m.metalness!=null)m.metalness=num(a.metalness,m.metalness);
        if(a.roughness!=null&&m.roughness!=null)m.roughness=num(a.roughness,m.roughness);
        if(a.opacity!=null){m.transparent=a.opacity<1;m.opacity=num(a.opacity,1);}
        m.needsUpdate=true;
      });
    });
  }
  function place(o,a){
    const h=o.holder;
    if(a.dims){h.scale.set(1,1,1);h.rotation.set(0,0,0);h.updateMatrixWorld(true);const sz=new THREE.Box3().setFromObject(h).getSize(new THREE.Vector3()),d=v3(a.dims,[1,1,1]);
      h.scale.set(sz.x>1e-6?d[0]/sz.x:1,sz.y>1e-6?d[1]/sz.y:1,sz.z>1e-6?d[2]/sz.z:1);}
    if(a.size!=null){const b=new THREE.Box3().setFromObject(h),s=b.getSize(new THREE.Vector3()),m=Math.max(s.x,s.y,s.z,1e-6);h.scale.multiplyScalar(num(a.size,1)/m);}
    if(a.scale!=null){if(Array.isArray(a.scale))h.scale.set(...v3(a.scale,[1,1,1]));else h.scale.setScalar(num(a.scale,1));}
    if(a.rot)h.rotation.set(...v3(a.rot).map(d=>d*Math.PI/180));
    if(a.pos){const p=v3(a.pos);h.position.set(...p);}
    h.updateMatrixWorld(true);
  }
  function setPhys(o,p){
    o.meta=o.meta||{};o.meta.phys={...(o.meta.phys||{type:'static'}),...p};
    if(!['static','dynamic','kinematic','none'].includes(o.meta.phys.type))o.meta.phys.type='static';
    sim&&sim.invalidate();return o.meta.phys;
  }
  async function addObject(a){
    let t=String(a.type||'').toLowerCase();let o;const as=ASSETS[t];
    if(as){a={...as,...a,phys:{...as.phys,...(a.phys||{})}};t=String(as.type||'').toLowerCase();if(as.url&&!a.url)a.url=as.url;a.asset=String(a.type).toLowerCase();a.name=a.name||as.name||a.asset[0].toUpperCase()+a.asset.slice(1);}
    const prim=Object.keys(PRIMS).find(k=>k.toLowerCase()===t);
    if(prim)o=addPrimitive(prim);
    else if(a.url||a.data){
      let blob,fname=a.filename||String(a.url||'file').split('?')[0].split('/').pop()||'file';
      if(a.data){const bin=atob(a.data),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);blob=new Blob([u]);}
      else{const res=await fetch(a.url);if(!res.ok)throw new Error('Couldn’t fetch '+a.url+' ('+res.status+')');blob=await res.blob();}
      const n0=S.objs.length;await importOne(new File([blob],fname,{type:blob.type||''}));
      if(S.objs.length<=n0)throw new Error('That file didn’t produce an object. Supported: glb, gltf, obj, stl, ply, splat, spz, jpg/png (photo becomes relief).');
      o=S.objs[S.objs.length-1];
    }else throw new Error('Give type ('+Object.keys(PRIMS).map(s=>s.toLowerCase()).join(', ')+') or a url.');
    if(a.name)o.name=a.name;
    o.meta=o.meta||{};o.meta.uid=++uidc;o.meta.asset=a.asset||(prim||'file').toLowerCase();if(a.phys)setPhys(o,a.phys);
    if(prim&&a.size==null&&!a.dims&&!a.scale)a.size=1;
    place(o,{...a,pos:a.pos||[0,0,0]});paint(o,a);
    if(S.shadows)setShadowFlags(o.holder);
    renderObjList&&renderObjList();bump();return o;
  }
  function lightCmd(a){
    const op=a.op||'add';
    if(op==='clear'){lights.forEach(l=>{scene.remove(l);if(l.target)scene.remove(l.target);});lights.clear();bump();return{cleared:true};}
    if(op==='add'){
      const ty=a.type||'point',col=a.color||'#ffffff',it=num(a.intensity,ty==='dir'?2:ty==='spot'?60:20);let L;
      if(ty==='dir'){L=new THREE.DirectionalLight(col,it);}else if(ty==='spot'){L=new THREE.SpotLight(col,it,0,num(a.angle,35)*Math.PI/180,.35,2);}else{L=new THREE.PointLight(col,it,0,2);}
      L.position.set(...v3(a.pos,[2,3,2]));if(L.target){L.target.position.set(...v3(a.target,[0,0,0]));scene.add(L.target);}
      if(S.shadows&&L.shadow){L.castShadow=true;L.shadow.mapSize.set(1024,1024);}
      L.userData.id='L'+(++lid);scene.add(L);lights.set(L.userData.id,L);bump();return{id:L.userData.id};
    }
    const L=lights.get(a.id);if(!L)throw new Error('No light "'+a.id+'".');
    if(op==='delete'){scene.remove(L);if(L.target)scene.remove(L.target);lights.delete(a.id);bump();return{deleted:a.id};}
    if(a.color)L.color.set(a.color);if(a.intensity!=null)L.intensity=a.intensity;if(a.pos)L.position.set(...v3(a.pos));if(a.target&&L.target)L.target.position.set(...v3(a.target));
    bump();return{id:a.id};
  }
  function ensureGround(on,color,size){
    if(!groundMesh){groundMesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:'#8a8a86',roughness:.95,metalness:0}));groundMesh.userData.noView=true;groundMesh.receiveShadow=true;groundMesh.position.y=-.002;scene.add(groundMesh);}
    groundMesh.visible=!!on;if(color)groundMesh.material.color.set(color);if(size)groundMesh.scale.set(size,1,size);
  }
  function envCmd(a){
    if(a.bg)S.bg=a.bg;
    if(a.envIntensity!=null){S.env=a.envIntensity;scene.environmentIntensity=a.envIntensity;hemi.intensity=.2+a.envIntensity*.7;}
    if(a.sun){if(a.sun.intensity!=null)key.intensity=a.sun.intensity;if(a.sun.pos)key.position.set(...v3(a.sun.pos));if(a.sun.color)key.color.set(a.sun.color);}
    if(a.ground!==undefined){const g=a.ground===false||a.ground===null?null:a.ground===true?{}:a.ground;ensureGround(!!g,g&&g.color,g&&g.size||80);}
    if(a.fog!==undefined){if(!a.fog)scene.fog=null;else scene.fog=new THREE.Fog(a.fog.color||S.bg,num(a.fog.near,8),num(a.fog.far,60));}
    if(a.grid!==undefined){S.grid=!!a.grid;}
    if(a.shadows!==undefined){S.shadows=!!a.shadows;renderer.shadowMap.enabled=S.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;key.castShadow=S.shadows;
      if(S.shadows){key.shadow.mapSize.set(2048,2048);const sc=key.shadow.camera;sc.left=sc.bottom=-12;sc.right=sc.top=12;sc.near=.5;sc.far=60;key.shadow.bias=-.0004;key.shadow.normalBias=.03;}
      lights.forEach(l=>{if(l.shadow)l.castShadow=S.shadows;});setShadowFlags(c.world);setShadowFlags(groundMesh);scene.traverse(n=>{if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.needsUpdate=true);});}
    bump();return envInfo();
  }
  const envInfo=()=>({bg:S.bg,envIntensity:S.env,sun:{intensity:key.intensity,pos:key.position.toArray().map(r),color:'#'+key.color.getHexString()},ground:!!(groundMesh&&groundMesh.visible),fog:scene.fog?{near:scene.fog.near,far:scene.fog.far,color:'#'+scene.fog.color.getHexString()}:null,grid:S.grid,shadows:!!S.shadows,view:S.view,fx:S.fx});
  function cameraCmd(a){
    if(walk.on)throw new Error('The camera is in walk mode. Run walk {on:false} first, or pass walk {pos,yaw} to move.');
    if(a.frame){frameAll();}
    if(a.fov!=null){camera.fov=a.fov;camera.updateProjectionMatrix();}
    if(a.pos)camera.position.set(...v3(a.pos));
    if(a.target)controls.target.set(...v3(a.target));
    if(a.lookAt){const o=find(a.lookAt),b=new THREE.Box3().setFromObject(o.holder);controls.target.copy(b.getCenter(new THREE.Vector3()));}
    controls.update();bump();
    return {pos:camera.position.toArray().map(r),target:controls.target.toArray().map(r),fov:camera.fov};
  }
  function sceneInfo(){
    return {objects:S.objs.map(info),lights:[...lights.values()].map(l=>({id:l.userData.id,type:l.isDirectionalLight?'dir':l.isSpotLight?'spot':'point',pos:l.position.toArray().map(r),color:'#'+l.color.getHexString(),intensity:l.intensity})),
      camera:{pos:camera.position.toArray().map(r),target:controls.target.toArray().map(r),fov:camera.fov},environment:envInfo(),walking:walk.on,selected:S.sel};
  }
  /* render: a picture of the scene as a PNG (base64). pass: beauty (with the look), clean (no look), clay, normal, depth, wire. */
  async function renderCmd(a){
    if(!c.waitFrames)throw new Error('Render isn’t ready.');
    const pass=a.pass||'beauty',v0=S.view,q0=S.q,h0=S.hold,fx0=S.fx;
    const scale=a.width?Math.max(.4,Math.min(3,a.width/Math.max(160,canvas.width/Math.max(.01,S.q)))):num(a.scale,1);
    S.exporting=true;S.big=true;S.q=Math.min(1,q0)*scale;S.hold=pass!=='beauty';
    if(['clay','normal','depth','wire'].includes(pass)){S.view=pass;applyView();}
    c.requestResize();await c.waitFrames(5);
    const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));
    const w=canvas.width,h=canvas.height;
    S.exporting=false;S.big=false;S.q=q0;S.hold=h0;S.fx=fx0;if(S.view!==v0){S.view=v0;applyView();}c.requestResize();bump();
    const buf=new Uint8Array(await blob.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));
    return {pass,width:w,height:h,mime:'image/png',base64:btoa(bin)};
  }
  async function exportCmd(a){
    const f=a.format||'glb';
    if(f==='zip'){const {files}=await projectFiles();const b=zipStore(files),buf=new Uint8Array(await b.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));return{format:'zip',mime:'application/zip',base64:btoa(bin)};}
    if(f==='glb'){
      const g=new THREE.Group();S.objs.filter(o=>o.vis&&o.kind!=='splat').forEach(o=>g.add(o.holder.clone(true)));
      if(!g.children.length)throw new Error('Nothing to export.');
      const res=await new Promise((ok,no)=>new GLTFExporter().parse(g,ok,no,{binary:true,onlyVisible:true}));
      const buf=new Uint8Array(res);let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));return{format:'glb',mime:'model/gltf-binary',base64:btoa(bin)};
    }
    throw new Error('format must be glb or zip.');
  }
  const DOC={
    scene:'{} → objects (id, name, kind, pos, rot, scale, size, color, bounds), lights, camera, environment.',
    add:'{type:"cube|sphere|torus|knot|plane|cylinder|cone|capsule"} or a ready-made {type:"human|wall|floor|platform|pillar|crate|ball"} or {url|data(base64), filename} for glb/gltf/obj/stl/ply/splat/jpg/png, plus optional name, pos:[x,y,z] (base of the object), rot:[deg], dims:[w,h,d] metres (exact box, best for walls and floors), size (longest side in m), scale (raw multiplier), color, metalness, roughness, emissive, opacity → object info.',
    set:'{id|name, newName, pos, rot, dims, scale, size, color, metalness, roughness, emissive, opacity, visible} → object info.',
    delete:'{id|name} → removes the object.',
    duplicate:'{id|name, pos?, name?} → copy of a primitive.',
    select:'{id|name} → selects it (shows its gizmo).',
    light:'{op:"add|set|delete|clear", type:"point|spot|dir", id, pos, target, color, intensity, angle}',
    environment:'{bg, envIntensity, sun:{intensity,pos,color}, ground:true|{color,size}, fog:{color,near,far}|null, grid, shadows}',
    camera:'{pos, target, fov, lookAt:id|name, frame:true} → orbit camera.',
    view:'{mode:"shaded|clay|normal|depth|wire"}',
    look:'{on:true|false} → the effect look over the scene.',
    sim:'{op:"play|pause|reset|gravity", g} → rigid-body physics. Give objects phys:{type:"static|dynamic|kinematic|none", shape:"box|sphere|capsule|cylinder|hull", mass, bounce, friction} in add or set, then play.',
    walk:'{on:true|false, pos:[x,y,z], yaw:deg} → first-person walk mode (collision against objects).',
    render:'{pass:"beauty|clean|clay|normal|depth|wire", width} → PNG as base64.',
    export:'{format:"glb|zip"} → base64 file.',
    batch:'{ops:[{cmd:"add",...},...]} → runs in order, returns each result.',
    clear:'{} → removes all objects and lights.',
    describe:'{} → this list.'
  };
  async function run(a){
    if(!a||typeof a!=='object')throw new Error('Pass an object like {cmd:"scene"}.');
    const cmd=a.cmd||a.command;
    switch(cmd){
      case 'describe':return{commands:DOC,units:'metres, degrees, #rrggbb',tips:['Build with add, then run render and look at the picture.','pos is the base of the object: pos.y=0 sits it on the floor.','Run scene after changes to read back exact bounds.']};
      case 'scene':return sceneInfo();
      case 'add':{const o=await addObject({...a});return info(o);}
      case 'set':{const o=ref(a);if(a.phys)setPhys(o,a.phys);if(a.newName)o.name=a.newName;place(o,a);paint(o,a);if(a.visible!=null){o.vis=!!a.visible;o.holder.visible=o.vis;}renderObjList&&renderObjList();refreshInspector&&refreshInspector(true);bump();return info(o);}
      case 'delete':{const o=ref(a);const i=info(o);removeObj(o.id);return{deleted:i.name};}
      case 'duplicate':{const o=ref(a);const prim=Object.keys(PRIMS).find(k=>k===o.name||o.name.startsWith(k));if(!prim)throw new Error('Only shapes can be duplicated. Add the file again instead.');
        const n=addPrimitive(prim);n.holder.scale.copy(o.holder.scale);n.holder.rotation.copy(o.holder.rotation);n.holder.position.copy(o.holder.position).x+=1;if(a.pos)n.holder.position.set(...v3(a.pos));if(a.name)n.name=a.name;
        let col=null;o.holder.traverse(m=>{if(!col&&m.isMesh&&m.material&&m.material.color)col='#'+m.material.color.getHexString();});if(col)paint(n,{color:col});renderObjList&&renderObjList();bump();return info(n);}
      case 'select':{const o=ref(a);c.selectObj(o.id);return info(o);}
      case 'light':return lightCmd(a);
      case 'environment':return envCmd(a);
      case 'camera':return cameraCmd(a);
      case 'view':{if(!['shaded','clay','normal','depth','wire'].includes(a.mode))throw new Error('mode must be shaded, clay, normal, depth or wire.');S.view=a.mode;applyView();bump();return{view:S.view};}
      case 'look':{S.fx=a.on!==false;bump();return{look:S.fx};}
      case 'walk':{if(a.on===false){walk.exit();return{walking:false};}walk.enter({pos:a.pos,yaw:a.yaw});return{walking:true};}
      case 'sim':{if(!sim)throw new Error('Simulation isn’t available.');const op=a.op||'play';if(op==='play')return await sim.play();if(op==='pause')return sim.pause();if(op==='reset')return sim.reset();if(op==='gravity')return sim.setGravity(num(a.g,-9.81));throw new Error('op must be play, pause, reset or gravity.');}
      case 'render':return renderCmd(a);
      case 'export':return exportCmd(a);
      case 'clear':{S.objs.slice().forEach(o=>removeObj(o.id));lightCmd({op:'clear'});return{cleared:true};}
      case 'batch':{const out=[];for(const op of a.ops||[]){try{out.push(await run(op));}catch(e){out.push({error:String(e.message||e)});if(a.stopOnError)break;}}return{results:out};}
      default:throw new Error('Unknown cmd "'+cmd+'". Run {cmd:"describe"} for the list.');
    }
  }
  return {run,describe:()=>DOC};
}
