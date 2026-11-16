/* DRAW: 3D strokes as real geometry (from the SIGIL prototype), wired into the 3D page.
   A drawing is one scene object (so Look, effect stacks, materials, physics, undo, project save and GLB export all work on it). It holds
   immutable strokes (centreline + per-point width + material) and, optionally, a photo plane to draw on. Strokes are rebuilt into tubes
   from that data. Drawing happens on the screen plane, a surface, the floor, a wall or the photo; orbit any time to see it is 3D. */
export const MATS={
  chrome:['Chrome','#dfe6ee',{metalness:1,roughness:.08},'linear-gradient(115deg,#24282c,#fff,#555d64,#e4f0ff,#14191d)'],
  mercury:['Mercury','#c6cad8',{metalness:1,roughness:.03},'linear-gradient(115deg,#15151a,#d2c9d9,#303036,#fff,#5a5c6b)'],
  gold:['Gold','#e3ad55',{metalness:1,roughness:.14},'linear-gradient(115deg,#3e2410,#f3c878,#795124,#fff1ae)'],
  copper:['Copper','#d9855a',{metalness:1,roughness:.2},'linear-gradient(115deg,#3a1a0e,#e89a70,#7a3d22,#ffd0b0)'],
  obsidian:['Obsidian','#141a26',{metalness:.7,roughness:.16,clearcoat:1,clearcoatRoughness:.08},'linear-gradient(115deg,#03050b,#1b253d,#616c85,#080b13)'],
  pearl:['Pearl','#f3efe9',{metalness:.15,roughness:.22,clearcoat:1,iridescence:1,iridescenceIOR:1.5},'linear-gradient(115deg,#f5e9f0,#cfe6f5,#f7f1d8,#e6d4f2)'],
  glass:['Glass','#cfe6ff',{metalness:0,roughness:.03,transparent:true,opacity:.34,clearcoat:1},'linear-gradient(115deg,#9fb8cc66,#ffffffcc,#7a93a866)'],
  clay:['Clay','#b9b0a5',{metalness:0,roughness:.92},'linear-gradient(115deg,#3d3a37,#c6c1b9,#fffaf0,#7b756d)'],
  ink:['Ink','#0c0c0d',{metalness:0,roughness:.5,clearcoat:.5},'linear-gradient(115deg,#000,#2a2a2e,#000)'],
  paper:['Paper','#f4f1ea',{metalness:0,roughness:.95},'linear-gradient(115deg,#ddd8cc,#fff,#e8e3d6)'],
  holo:['Hologram','#8ad8ff',{metalness:.5,roughness:.2,emissive:'#194b78',ei:.5},'linear-gradient(115deg,#072b32,#78f2ff,#8c75ff,#ff87c5)'],
  ember:['Ember','#ff6a2a',{metalness:.6,roughness:.25,emissive:'#a92209',ei:.6},'linear-gradient(115deg,#3a0702,#ff481b,#ffd15a,#8e1005)'],
  light:['Light','#fff2d8',{metalness:0,roughness:1,emissive:'#fff2d8',ei:1.6},'linear-gradient(115deg,#fff6e6,#fff,#ffe9c2)']
};
const LIM={strokes:400,pts:700};
const q4=v=>Math.round(v*1e4)/1e4;
export function createSigil(c){
  const {THREE,S,scene,camera,controls,canvas,registerObject,objById,selectObj,bump,uPush,toast,el,btn,sec,sliderRow,chipRow,setShadowFlags,loadCanvas,tc,setTool,markDirty,applyView}=c;
  const SG={cur:null,B:{size:22,smooth:.4,taper:.6,press:'auto',depth:.3,style:'round',mat:'chrome',col:'#dfe6ee',plane:'view',off:0,mirror:false,rad:1,mode:'draw'}};
  const B=SG.B;let uid=1,drawing=null,space=false,paneHost=null,sync_ui=null;
  const ray=new THREE.Raycaster(),ring=document.createElement('div');
  ring.style.cssText='position:fixed;z-index:30;pointer-events:none;border:1.5px solid #fff;mix-blend-mode:difference;border-radius:50%;transform:translate(-50%,-50%);display:none';document.body.appendChild(ring);
  const isDraw=()=>S.tab==='draw'&&!S.walk;
  /* ---------- state of one drawing ---------- */
  function newState(){return {strokes:[],rev:0,revs:new Map([[0,[]]]),undo:[],redo:[],photo:null,layer:null,photoMesh:null};}
  function commit(o,strokes){
    const st=o.meta.sigil;st.undo.push(st.rev);if(st.undo.length>80)st.undo.shift();st.redo.length=0;
    const r=++st.rev;st.strokes=strokes;st.revs.set(r,strokes.slice());
    if(st.revs.size>100){for(const k of st.revs.keys()){if(!st.undo.includes(k)&&k!==st.rev){st.revs.delete(k);break;}}}
    sync(o);paint();bump();markDirty&&markDirty();
  }
  function setRev(o,r){const st=o.meta.sigil;if(!st.revs.has(r))return false;st.rev=r;st.strokes=st.revs.get(r).slice();sync(o);paint();bump();return true;}
  function undo(){const o=target();if(!o)return;const st=o.meta.sigil;if(!st.undo.length){toast('Nothing to undo');return;}st.redo.push(st.rev);setRev(o,st.undo.pop());}
  function redo(){const o=target();if(!o)return;const st=o.meta.sigil;if(!st.redo.length)return;st.undo.push(st.rev);setRev(o,st.redo.pop());}
  function target(){const s=objById(S.sel);if(s&&s.meta&&s.meta.sigil)return s;const o=SG.cur!=null?objById(SG.cur):null;return o&&o.meta&&o.meta.sigil?o:null;}
  function create({name='Drawing',pos,yaw}={}){
    const root=new THREE.Group(),layer=new THREE.Group();layer.name='strokes';root.add(layer);
    const st=newState();st.layer=layer;
    const o=registerObject(name,root,'group',{fit:false,meta:{sigil:st,noAuto:true,phys:{type:'none'}}});
    const t=controls.target;o.holder.position.set(pos?pos[0]:t.x,pos?pos[1]:0,pos?pos[2]:t.z);
    if(yaw!=null)o.holder.rotation.y=yaw;
    o.holder.updateMatrixWorld(true);SG.cur=o.id;bump();return o;
  }
  /* ---------- geometry ---------- */
  const _v=new THREE.Vector3();
  function tubeGeometry(s,rad){
    const n=s.w.length,P=[];for(let i=0;i<n;i++)P.push(new THREE.Vector3(s.pts[i*3],s.pts[i*3+1],s.pts[i*3+2]));
    const W=s.w.slice();
    if(n<2){return new THREE.SphereGeometry(Math.max(.002,s.r*(W[0]||1)),12,8).translate(P[0].x,P[0].y,P[0].z);}
    const sm=s.sm||0,a=sm*.5;
    for(let pass=0;pass<Math.ceil(sm*5);pass++){const Q=P.map(p=>p.clone()),V=W.slice();for(let i=1;i<n-1;i++){Q[i].copy(P[i]).multiplyScalar(1-a).addScaledVector(P[i-1],a/2).addScaledVector(P[i+1],a/2);V[i]=W[i]*(1-a)+(W[i-1]+W[i+1])*a/2;}for(let i=0;i<n;i++){P[i]=Q[i];W[i]=V[i];}}
    const curve=new THREE.CatmullRomCurve3(P,false,'centripetal');
    const seg=Math.min(480,Math.max(10,n*2)),pts=curve.getPoints(seg),T=[],ws=[];
    for(let i=0;i<=seg;i++){const u=i/seg*(n-1),j=Math.min(n-2,Math.floor(u)),f=u-j;ws.push(W[j]*(1-f)+W[j+1]*f);const a0=pts[Math.max(0,i-1)],a1=pts[Math.min(seg,i+1)];T.push(_v.copy(a1).sub(a0).normalize().clone());}
    const flat=s.st==='flat',tx=flat?1.7:1,ty=flat?.26:1,R=flat?10:9,nrm=new THREE.Vector3().fromArray(s.nrm||[0,0,1]);
    let N=nrm.clone().addScaledVector(T[0],-nrm.dot(T[0]));if(N.lengthSq()<1e-6)N.set(T[0].y?1:0,T[0].y?0:1,0).cross(T[0]);N.normalize();
    const pos=[],nor=[],idx=[],tp=s.tp||0;
    for(let i=0;i<=seg;i++){
      if(i>0){const ax=_v.crossVectors(T[i-1],T[i]);const l=ax.length();if(l>1e-6){ax.divideScalar(l);N.applyAxisAngle(ax,Math.asin(Math.min(1,l)));}N.addScaledVector(T[i],-N.dot(T[i])).normalize();} // parallel transport: no twisting
      const Bn=new THREE.Vector3().crossVectors(T[i],N).normalize(),f=i/seg,e=Math.min(f,1-f)/.16,ease=Math.sqrt(Math.max(0,1-Math.pow(1-Math.min(1,e),2)));
      let r=s.r*ws[i]*(1-tp*(1-ease));if(i===0||i===seg)r*=tp>.2?.12:.4;r=Math.max(.0012,r);
      for(let k=0;k<=R;k++){const an=k/R*Math.PI*2,cs=Math.cos(an),sn=Math.sin(an);
        const nx=N.x*cs/ty+Bn.x*sn/tx,ny=N.y*cs/ty+Bn.y*sn/tx,nz=N.z*cs/ty+Bn.z*sn/tx,nl=Math.hypot(nx,ny,nz)||1;
        pos.push(pts[i].x+(N.x*cs*ty+Bn.x*sn*tx)*r,pts[i].y+(N.y*cs*ty+Bn.y*sn*tx)*r,pts[i].z+(N.z*cs*ty+Bn.z*sn*tx)*r);nor.push(nx/nl,ny/nl,nz/nl);
        if(i<seg&&k<R){const q=i*(R+1)+k;idx.push(q,q+R+1,q+1,q+1,q+R+1,q+R+2);}}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setIndex(idx);g.computeBoundingSphere();return g;
  }
  function makeMat(s){
    const d=MATS[s.m]||MATS.chrome,p=d[2],m=new THREE.MeshPhysicalMaterial({color:s.c||d[1],metalness:p.metalness,roughness:p.roughness,side:THREE.DoubleSide});
    if(p.clearcoat){m.clearcoat=p.clearcoat;m.clearcoatRoughness=p.clearcoatRoughness!=null?p.clearcoatRoughness:.1;}
    if(p.iridescence){m.iridescence=p.iridescence;m.iridescenceIOR=p.iridescenceIOR||1.4;}
    if(p.transparent){m.transparent=true;m.opacity=p.opacity;m.depthWrite=false;}
    if(p.emissive){m.emissive.set(s.m==='light'||s.m==='ember'||s.m==='holo'?(s.m==='light'?(s.c||d[1]):p.emissive):p.emissive);m.emissiveIntensity=p.ei||1;}
    m.userData.sigilMat=s.m;return m;
  }
  function symMatrices(s){
    const out=[],R=Math.max(1,s.rad|0);
    for(let i=0;i<R;i++){const rot=i/R*Math.PI*2;out.push({ry:rot,sx:1});if(s.mir)out.push({ry:rot,sx:-1});}
    return out;
  }
  function strokeGroup(s){
    const g=new THREE.Group(),geo=tubeGeometry(s),mat=makeMat(s);g.userData.sid=s.id;g.userData.src=s;
    for(const t of symMatrices(s)){const m=new THREE.Mesh(geo,mat);m.rotation.y=t.ry;m.scale.x=t.sx;m.userData.sid=s.id;m.castShadow=m.receiveShadow=!!S.shadows;g.add(m);}
    return g;
  }
  function disposeG(g){const gs=new Set(),ms=new Set();g.traverse(n=>{if(n.isMesh){gs.add(n.geometry);ms.add(n.material);}});gs.forEach(x=>x.dispose());ms.forEach(x=>x.dispose());}
  function sync(o){
    const st=o.meta.sigil,layer=st.layer,have=new Map();layer.children.slice().forEach(g=>have.set(g.userData.sid,g));
    const want=new Set(st.strokes.map(s=>s.id));
    for(const [id,g] of have)if(!want.has(id)){layer.remove(g);disposeG(g);have.delete(id);}
    for(const s of st.strokes){const g=have.get(s.id);if(g&&g.userData.src===s)continue;if(g){layer.remove(g);disposeG(g);}layer.add(strokeGroup(s));}
    applyView&&applyView();
  }
  /* ---------- photo ---------- */
  const PH=2.4;
  function setPhoto(o,cv){
    const st=o.meta.sigil;if(st.photoMesh){o.root.remove(st.photoMesh);st.photoMesh.geometry.dispose();st.photoMesh.material.map&&st.photoMesh.material.map.dispose();st.photoMesh.material.dispose();st.photoMesh=null;}
    st.photo=cv||null;if(!cv){bump();return;}
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
    const ar=cv.width/cv.height,m=new THREE.Mesh(new THREE.PlaneGeometry(PH*ar,PH),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,toneMapped:false}));
    m.position.y=PH/2+.08;m.name='photo';m.userData.photo=true;o.root.add(m);st.photoMesh=m;bump();
  }
  async function addPhotoFile(f){
    try{
      const cv=await loadCanvas(f,2048);let o=target();
      if(!o||o.meta.sigil.strokes.length){const dir=camera.position.clone().sub(controls.target);o=create({name:'Photo drawing',yaw:Math.atan2(dir.x,dir.z)});}
      else{const dir=camera.position.clone().sub(controls.target);o.holder.rotation.y=Math.atan2(dir.x,dir.z);}
      setPhoto(o,cv);B.plane='photo';selectObj(o.id);faceCamera(o);paint();toast('Photo added. Draw on it, or orbit to see it in 3D.',3500);
    }catch(e){toast(e.message||String(e));}
  }
  function faceCamera(o){
    const st=o.meta.sigil;if(!st.photoMesh)return;
    st.photoMesh.updateMatrixWorld(true);const c=new THREE.Vector3().setFromMatrixPosition(st.photoMesh.matrixWorld),n=new THREE.Vector3(0,0,1).transformDirection(st.photoMesh.matrixWorld);
    const ar=st.photo.width/st.photo.height,need=Math.max(PH,PH*ar/Math.max(.3,camera.aspect))*.62/Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*1.1;
    controls.target.copy(c);camera.position.copy(c).addScaledVector(n,need);controls.update();bump();
  }
  /* ---------- picking a point to draw at ---------- */
  function rayAt(e){const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1)),camera);return ray;}
  function planeFor(o){
    const dir=camera.getWorldDirection(new THREE.Vector3()),pl=new THREE.Plane();
    if(B.plane==='floor')pl.set(new THREE.Vector3(0,1,0),-.001);
    else if(B.plane==='wall')pl.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,0,1),controls.target);
    else if(B.plane==='photo'&&o.meta.sigil.photoMesh){const m=o.meta.sigil.photoMesh;m.updateMatrixWorld(true);pl.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,0,1).transformDirection(m.matrixWorld),new THREE.Vector3().setFromMatrixPosition(m.matrixWorld).addScaledVector(new THREE.Vector3(0,0,1).transformDirection(m.matrixWorld),.003));}
    else pl.setFromNormalAndCoplanarPoint(dir.clone().negate(),controls.target.clone().addScaledVector(dir,B.off));
    if(pl.normal.dot(camera.getWorldDirection(new THREE.Vector3()))>0)pl.negate(); // always face the viewer
    return pl;
  }
  function hit(e,o,plane,lastD){
    const rr=rayAt(e);
    if(B.plane==='surface'){
      const objs=S.objs.filter(x=>x.vis).map(x=>x.holder),hs=rr.intersectObjects(objs,true).filter(h=>h.object.isMesh&&!h.object.userData.live);
      if(hs[0]){const n=hs[0].face?hs[0].face.normal.clone().transformDirection(hs[0].object.matrixWorld):new THREE.Vector3(0,1,0);if(n.dot(rr.ray.direction)>0)n.negate();return {p:hs[0].point.clone(),n,d:hs[0].distance,surf:true};}
      if(lastD)return {p:rr.ray.origin.clone().addScaledVector(rr.ray.direction,lastD),n:plane.normal.clone(),d:lastD};
    }
    const p=rr.ray.intersectPlane(plane,new THREE.Vector3());if(!p)return null;const d=p.distanceTo(camera.position);if(d>90)return null;
    return {p,n:plane.normal.clone(),d};
  }
  const px2w=d=>2*d*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/Math.max(1,canvas.clientHeight);
  /* ---------- drawing ---------- */
  let liveRAF=0;
  function liveBuild(){
    liveRAF=0;if(!drawing)return;const D=drawing,st=D.o.meta.sigil,s=D.stroke();
    if(D.liveG){st.layer.remove(D.liveG);disposeG(D.liveG);}
    D.liveG=strokeGroup(s);D.liveG.traverse(n=>{n.userData.live=true;});st.layer.add(D.liveG);bump();
  }
  const liveSoon=()=>{if(!liveRAF)liveRAF=requestAnimationFrame(liveBuild);};
  function pressureOf(e,D,dtms,distPx){
    const pen=e.pointerType==='pen'&&e.pressure>0;
    let target;
    if(B.press==='even')target=1;
    else if(pen||(B.press==='auto'&&e.pointerType==='pen'))target=Math.max(.1,Math.pow(e.pressure||.5,.8));
    else target=Math.min(1,Math.max(.25,1.08-(distPx/Math.max(1,dtms))*.38)); // faster stroke → thinner, slower → thicker
    D.w+=(target-D.w)*(pen?.5:.16);return D.w;
  }
  function onDown(e){
    if(!isDraw())return;
    if(drawing&&e.pointerType==='touch'){cancelDraw();return;} // second finger: stop drawing, let the view move
    const orbitish=e.button!==0||B.mode==='orbit'||space||e.altKey;
    if(orbitish)return;
    if(!e.isPrimary&&e.pointerType==='touch')return;
    e.stopImmediatePropagation();
    if(tc&&tc.object)tc.detach();
    let o=target();if(!o&&B.mode==='draw')o=create();
    if(!o)return;
    if(B.mode==='erase'){drawing={erase:true,o,changed:false,keep:o.meta.sigil.strokes.slice()};eraseAt(e);canvas.setPointerCapture(e.pointerId);return;}
    if(o.meta.sigil.strokes.length>=LIM.strokes){toast('This drawing has the most strokes it can hold. Start a new drawing.');return;}
    if(S.sel!==o.id)selectObj(o.id);SG.cur=o.id;
    const plane=planeFor(o),h0=hit(e,o,plane,0);if(!h0)return;
    const ls=o.holder.scale.x||1,r0=B.size/2*px2w(h0.d)/ls;
    const D=drawing={o,plane,r0,d0:h0.d,lastD:h0.d,w:.3,raw:[],lp:h0.p.clone(),lastEv:{x:e.clientX,y:e.clientY,t:e.timeStamp},n0:h0.n.clone(),pid:e.pointerId,
      id:'s'+Date.now().toString(36)+(uid++),
      stroke(){const s=B,loc=this.raw;return {id:this.id,m:s.mat,c:s.col,st:s.style,sm:s.smooth,tp:s.taper,mir:s.mirror?1:0,rad:s.rad,r:this.rr,nrm:this.nl,pts:loc.flatMap(p=>p.p),w:loc.map(p=>p.w)};}};
    D.rr=r0;D.nl=h0.n.clone().transformDirection(new THREE.Matrix4().copy(o.holder.matrixWorld).invert()).toArray().map(q4);
    addPoint(e,h0,0,0);canvas.setPointerCapture(e.pointerId);canvas.style.cursor='crosshair';
  }
  function addPoint(e,h,dtms,distPx){
    const D=drawing,o=D.o,lazy=B.smooth*.8;
    D.lp.lerp(h.p,D.raw.length?1-lazy:1);
    const w=pressureOf(e,D,dtms,distPx)*Math.min(4,Math.max(.25,h.d/D.d0));
    const p=D.lp.clone();
    p.addScaledVector(h.n,(h.surf?px2w(h.d)*B.size*.35*w:0)+(w-.5)*2*B.depth*D.r0*ls(o)*5); // pressure also pushes in depth
    const L=o.holder.worldToLocal(p);
    const prev=D.raw[D.raw.length-1];if(prev&&Math.hypot(L.x-prev.p[0],L.y-prev.p[1],L.z-prev.p[2])<D.r0*.35)return false;
    if(D.raw.length>=LIM.pts)return false;
    D.raw.push({p:[q4(L.x),q4(L.y),q4(L.z)],w:q4(Math.min(2.5,Math.max(.06,w)))});return true;
  }
  const ls=o=>o.holder.scale.x||1;
  function onMove(e){
    if(isDraw()&&B.mode!=='orbit'&&e.pointerType!=='touch'){const px=B.mode==='erase'?26:Math.max(6,B.size);ring.style.display='block';ring.style.left=e.clientX+'px';ring.style.top=e.clientY+'px';ring.style.width=ring.style.height=px+'px';}else ring.style.display='none';
    const D=drawing;if(!D||e.pointerId!==D.pid&&D.pid!=null)return;
    if(D.erase){eraseAt(e);return;}
    const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];let added=false;
    for(const ev of (evs.length?evs:[e])){
      const h=hit(ev,D.o,D.plane,D.lastD);if(!h)continue;D.lastD=h.d;
      const dpx=Math.hypot(ev.clientX-D.lastEv.x,ev.clientY-D.lastEv.y),dt=Math.max(1,ev.timeStamp-D.lastEv.t);D.lastEv={x:ev.clientX,y:ev.clientY,t:ev.timeStamp};
      if(addPoint(ev,h,dt,dpx))added=true;
    }
    if(added)liveSoon();
  }
  function onUp(e){
    const D=drawing;if(!D||(D.pid!=null&&e.pointerId!==D.pid))return;
    if(D.erase){drawing=null;if(D.changed)commit(D.o,D.o.meta.sigil.strokes.slice());return;}
    const st=D.o.meta.sigil;if(D.liveG){st.layer.remove(D.liveG);disposeG(D.liveG);}drawing=null;
    if(D.raw.length>=1){const s=D.stroke();commit(D.o,st.strokes.concat([s]));}
    bump();
  }
  function cancelDraw(){const D=drawing;if(!D)return;if(D.liveG){const st=D.o.meta.sigil;st.layer.remove(D.liveG);disposeG(D.liveG);}drawing=null;bump();}
  function eraseAt(e){
    const D=drawing,st=D.o.meta.sigil,rr=rayAt(e),hs=rr.intersectObjects(st.layer.children,true);
    if(hs[0]){const id=hs[0].object.userData.sid;const left=st.strokes.filter(s=>s.id!==id);if(left.length!==st.strokes.length){st.strokes=left;sync(D.o);D.changed=true;bump();}}
  }
  canvas.addEventListener('pointerdown',onDown,true);canvas.addEventListener('pointermove',onMove,true);
  canvas.addEventListener('pointerup',e=>{if(drawing&&isDraw()){e.stopImmediatePropagation();onUp(e);}},true);canvas.addEventListener('pointercancel',e=>onUp(e),true);
  canvas.addEventListener('pointerleave',()=>{ring.style.display='none';});
  addEventListener('keydown',e=>{
    if(!isDraw())return;if(e.target&&e.target.matches&&e.target.matches('input,textarea,select'))return;
    const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
    if(e.code==='Space'){space=true;e.preventDefault();return;}
    if(mod&&k==='z'){e.preventDefault();e.stopImmediatePropagation();e.shiftKey?redo():undo();return;}
    if(mod&&k==='y'){e.preventDefault();e.stopImmediatePropagation();redo();return;}
    if(mod)return;
    if(k==='['||k===']'){e.stopImmediatePropagation();B.size=Math.max(2,Math.min(120,Math.round(B.size*(k==='['?.8:1.25))));sync_ui&&sync_ui();return;}
    if(k==='b'||k==='d'){e.stopImmediatePropagation();setMode('draw');}
    else if(k==='e'){e.stopImmediatePropagation();setMode('erase');}
    else if(k==='o'){e.stopImmediatePropagation();setMode('orbit');}
  },true);
  addEventListener('keyup',e=>{if(e.code==='Space')space=false;});
  function setMode(m){B.mode=m;canvas.style.cursor=m==='orbit'?'grab':'crosshair';ring.style.display='none';sync_ui&&sync_ui();}
  /* ---------- tab enter / leave ---------- */
  SG.onTab=id=>{
    if(id==='draw'){S.pivot=false;S.gizmo=null;if(tc)tc.detach();canvas.style.cursor=B.mode==='orbit'?'grab':'crosshair';const o=target();if(o&&S.sel!==o.id)selectObj(o.id);paint();}
    else{canvas.style.cursor='';ring.style.display='none';cancelDraw();}
  };
  /* ---------- panel ---------- */
  let planeRow=null,infoEl=null,undoB=null,redoB=null,photoRow=null;
  function paint(){
    const o=target();
    if(infoEl)infoEl.textContent=o?(o.name+' · '+o.meta.sigil.strokes.length+' stroke'+(o.meta.sigil.strokes.length===1?'':'s')+(o.meta.sigil.photo?' · photo':'')):'Nothing yet. Draw to start.';
    if(undoB)undoB.disabled=!o||!o.meta.sigil.undo.length;if(redoB)redoB.disabled=!o||!o.meta.sigil.redo.length;
    if(planeRow)planeRow.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',B.plane===c.dataset.v));
    if(photoRow)photoRow.querySelectorAll('[data-needs-photo]').forEach(b=>b.hidden=!(o&&o.meta.sigil.photo));
  }
  SG.build=parent=>{
    paneHost=parent;const T=(t,s)=>{const d=el('div','note');d.textContent=t;if(s)d.style.cssText=s;return d;};
    const s0=sec(parent,'Drawing');infoEl=T('');infoEl.style.fontWeight='600';s0.appendChild(infoEl);
    const modes=chipRow(s0,[['draw','Draw'],['erase','Erase'],['orbit','Orbit']],v=>B.mode===v,v=>setMode(v));
    const ur=el('div','chips');undoB=btn('Undo','',undo);redoB=btn('Redo','',redo);
    const lookBtn=e=>{const o=target();if(o&&S.sel!==o.id)selectObj(o.id);const pp=document.getElementById('lookpop');if(pp&&!pp.hidden){pp.hidden=true;return;}window.__lookPop&&window.__lookPop.open('selected',e.currentTarget);};
    ur.append(undoB,redoB,btn('Look','pri',lookBtn),btn('New drawing','',()=>{const o=create();selectObj(o.id);paint();toast('New drawing');}),btn('Clear','',()=>{const o=target();if(o&&o.meta.sigil.strokes.length)commit(o,[]);}));s0.appendChild(ur);
    s0.appendChild(T('Drag to draw. Orbit with Orbit mode, a right-drag, or Space + drag. Two fingers moves the view. [ ] changes size, Ctrl+Z undoes.'));
    const s1=sec(parent,'Brush','pressure');
    const r1=sliderRow(s1,'Size',()=>B.size,v=>{B.size=v;},2,80,1,v=>Math.round(v)+' px');sync_ui=()=>{r1.sync();modes.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',B.mode===c.dataset.v));};
    sliderRow(s1,'Smoothing',()=>B.smooth,v=>{B.smooth=v;},0,.95,.05,v=>Math.round(v*100)+'%');
    sliderRow(s1,'Taper',()=>B.taper,v=>{B.taper=v;},0,1,.05,v=>Math.round(v*100)+'%');
    sliderRow(s1,'Depth from pressure',()=>B.depth,v=>{B.depth=v;},0,1,.05,v=>Math.round(v*100)+'%');
    chipRow(s1,[['auto','Pen or speed'],['speed','Speed'],['even','Even']],v=>B.press===v,v=>{B.press=v;});
    chipRow(s1,[['round','Round'],['flat','Flat ribbon']],v=>B.style===v,v=>{B.style=v;});
    const s2=sec(parent,'Draw on','where the line lands');
    planeRow=chipRow(s2,[['view','Screen'],['surface','Surface'],['floor','Floor'],['wall','Wall'],['photo','Photo']],v=>B.plane===v,v=>{B.plane=v;});
    sliderRow(s2,'Screen depth',()=>B.off,v=>{B.off=v;},-4,4,.05,v=>(+v).toFixed(2));
    s2.appendChild(T('Screen: a plane facing you through the view centre. Surface: sticks to whatever is under the cursor. Strokes from different angles cross each other in real 3D.'));
    const s3=sec(parent,'Material');
    const grid=el('div');grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:6px';
    const sw={};
    for(const k in MATS){const b=el('button','chip');b.type='button';b.dataset.v=k;b.style.cssText='display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:5px;min-height:44px;text-align:left;font-size:11px';
      const i=document.createElement('i');i.style.cssText='display:block;height:22px;border-radius:5px;background:'+MATS[k][3]+';border:1px solid rgba(255,255,255,.12)';const t=document.createElement('span');t.textContent=MATS[k][0];b.append(i,t);
      b.setAttribute('aria-pressed',B.mat===k);b.addEventListener('click',()=>{B.mat=k;B.col=MATS[k][1];col.value=B.col;for(const x in sw)sw[x].setAttribute('aria-pressed',x===k);});sw[k]=b;grid.appendChild(b);}
    s3.appendChild(grid);
    const lab=document.createElement('label');lab.className='chip';lab.textContent='Colour ';const col=document.createElement('input');col.type='color';col.value=B.col;col.addEventListener('input',()=>{B.col=col.value;});lab.appendChild(col);
    const cr=el('div','chips');cr.append(lab,btn('Recolour last stroke','',()=>{const o=target();if(!o)return;const st=o.meta.sigil;if(!st.strokes.length)return;const a=st.strokes.slice(),l=a[a.length-1];a[a.length-1]={...l,m:B.mat,c:B.col};commit(o,a);}),btn('Recolour all','',()=>{const o=target();if(!o||!o.meta.sigil.strokes.length)return;commit(o,o.meta.sigil.strokes.map(x=>({...x,m:B.mat,c:B.col})));}));s3.appendChild(cr);
    const s4=sec(parent,'Symmetry');
    chipRow(s4,[['0','Off'],['1','Mirror']],v=>String(+B.mirror)===v,v=>{B.mirror=v==='1';});
    chipRow(s4,[['1','No spin'],['3','3'],['4','4'],['6','6'],['8','8']],v=>String(B.rad)===v,v=>{B.rad=+v;});
    s4.appendChild(T('Mirror across the left and right of the drawing. The number is copies spun around its upright axis.'));
    const s5=sec(parent,'Photo','draw on top of a picture');photoRow=s5;
    const pr=el('div','chips');pr.append(btn('Add photo','pri',()=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=()=>i.files[0]&&addPhotoFile(i.files[0]);i.click();}));
    const fb=btn('Face the photo','',()=>{const o=target();o&&faceCamera(o);B.plane='photo';});fb.dataset.needsPhoto='1';
    const rb=btn('Remove photo','',()=>{const o=target();if(o){setPhoto(o,null);if(B.plane==='photo')B.plane='view';paint();}});rb.dataset.needsPhoto='1';
    pr.append(fb,rb);s5.appendChild(pr);
    s5.appendChild(T('The photo becomes a flat picture in the scene. Draw on it, then orbit around to see the strokes sit in front of it.'));
    const s6=sec(parent,'Look and effects','hardware looks');
    const lr=el('div','chips');
    lr.append(btn('Hardware look','pri',e=>{const o=target();if(o&&S.sel!==o.id)selectObj(o.id);const pp=document.getElementById('lookpop');if(pp&&!pp.hidden){pp.hidden=true;return;}window.__lookPop&&window.__lookPop.open('selected',e.currentTarget);}),btn('Look tab','',()=>{window.__setTab&&window.__setTab('look');}));
    s6.appendChild(lr);s6.appendChild(T('Looks and effects apply to the whole drawing and follow it as you move or turn it. Materials stay as they are.'));
    paint();
  };
  /* ---------- scene document hooks (undo/redo of the whole scene) ---------- */
  SG.snap=o=>o.meta&&o.meta.sigil?{sg:o.meta.sigil.rev}:null;
  SG.apply=(o,fm)=>{if(o.meta&&o.meta.sigil&&fm&&fm.sg!=null&&fm.sg!==o.meta.sigil.rev)setRev(o,fm.sg);};
  /* ---------- project files ---------- */
  SG.projectItem=o=>{const st=o.meta.sigil,h=o.holder;return{kind:'sigil',name:o.name,tr:{p:h.position.toArray(),r:[h.rotation.x,h.rotation.y,h.rotation.z],s:h.scale.toArray()},vis:o.vis,strokes:st.strokes,hasPhoto:!!st.photo};};
  SG.photoOf=o=>o.meta.sigil.photo;
  SG.fromItem=(it,photoCv)=>{
    const o=create({name:it.name||'Drawing'});const st=o.meta.sigil;
    st.strokes=(it.strokes||[]).filter(s=>s&&Array.isArray(s.pts)&&Array.isArray(s.w)&&s.pts.length===s.w.length*3&&s.w.length<=LIM.pts&&s.pts.every(Number.isFinite)).slice(0,LIM.strokes).map(s=>({...s,m:MATS[s.m]?s.m:'chrome'}));
    st.revs.set(0,st.strokes.slice());sync(o);if(photoCv)setPhoto(o,photoCv);
    o.holder.position.fromArray(it.tr.p);o.holder.rotation.set(...it.tr.r);o.holder.scale.fromArray(it.tr.s);o.vis=it.vis!==false;o.holder.visible=o.vis;
    return o;
  };
  SG.create=create;SG.undo=undo;SG.redo=redo;SG.setPhoto=setPhoto;SG.addPhotoFile=addPhotoFile;SG.paint=paint;SG.target=target;SG.sync=sync;SG.commit=commit;
  return SG;
}
