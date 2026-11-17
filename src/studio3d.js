import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {PLYLoader} from 'three/addons/loaders/PLYLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createApi} from './studio-api.js';
import {createWalk} from './walk.js';
import {createSim} from './sim.js';
import {createPhysUI} from './physui.js';
import {createRecorder,fmtTime} from './recorder.js';
import {P3D,build as buildPhoto,loadCanvas,sampleCanvas} from './photo3d.js';
import {rigHuman} from './rig.js';
import {createSurface,createBall,CUSTOM_DEFAULT} from './surface.js';
import {createMaterials,PRESETS as MATPRESETS,normMat} from './matsys.js';
import {openMatLab} from './matlab.js';
import {openNodeMat} from './nodemat-ui.js';
import {createMatStudio} from './matstudio.js';
import {openRender} from './render.js';
import {createBuild} from './build.js';
import {loadModel as phLoad} from './phmodels.js';
import {applyToObject as ngApply,clearFromObject as ngClear} from './nodemat.js';
import {createLighting} from './lighting.js';
import {createWorldBuilder} from './world-build.js';
import {validateWorld,LIMITS as WLIM,PREFABS,TRIGGERS,ACTIONS} from './world-schema.js';
import {hashJson,readCapped} from './importkit.js';
import {WORLD_BRIEF} from './world-brief.js';
import {createForms} from './formobj.js';
import {createMechanics} from './mechanics.js';
import {createSigil} from './sigil.js';
import {createSigilStudio} from './sigil-studio.js';
import {createRagdoll} from './ragdoll.js';
import {validateFormFile} from './form-schema.js';
import {FORM_BRIEF} from './form-brief.js';
import {createSceneDoc} from './scenedoc.js';
import {put as handoffPut,take as handoffTake} from './handoff.js';
import {createWorldEditor} from './world-editor.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createN0} from './studio-adapter.js';
const N0=createN0();

/* =====================================================================
   n0ise studio — scene, importers, render loop
   ===================================================================== */
const $=(s,r=document)=>r.querySelector(s);
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
let toastT=0;
function toast(m,ms=2600){let t=$('.toast');if(!t){t=el('div','toast');document.body.appendChild(t);}t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},ms);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tick=()=>new Promise(r=>requestAnimationFrame(()=>r()));
const noGL=msg=>{const e=$('#err');e.hidden=false;e.textContent=msg;};

const stage=$('#stage'),canvas=$('#gl');
const S={objs:[],sel:null,view:'shaded',fx:true,hold:false,grid:true,spin:false,gizmo:null,q:.8,
  mask:{mode:2,focus:3,range:1.2,soft:.6,inv:false,amt:1},bg:'#0b0b0c',env:.5,liveUntil:0,ver:0,hwText:localStorage.getItem('n0.hwtext')==='1'};
const AI={ws:null,url:'ws://localhost:8787',state:'off',btn:null};
let renderer=null,gl=null;
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  gl=renderer.getContext();
}catch(e){noGL('This browser can’t start WebGL 2, which the studio needs. Try a recent Safari, Chrome or Firefox.');}

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,1,.05,200);
camera.position.set(2.6,1.8,3.4);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.12;controls.target.set(0,.9,0);controls.minDistance=.3;controls.maxDistance=60;
controls.autoRotateSpeed=2.4;
const world=new THREE.Group();scene.add(world);
const hemi=new THREE.HemisphereLight(0xffffff,0x44444a,.35);scene.add(hemi);
const key=new THREE.DirectionalLight(0xffffff,1.5);key.position.set(3,5,4);scene.add(key);
const rim=new THREE.DirectionalLight(0xaab8ff,.5);rim.position.set(-4,2,-3);scene.add(rim);
const LGT=createLighting({THREE,scene,camera,key,hemi,rim,deps:()=>({S,bump,api,controls})});
let envTex=null;
let hdrEnv=null,hdrRaw=null;
let renderUI=null;
function renderScene(){if(renderUI){renderUI.close();renderUI=null;}if(MS)MS.paintOff();toast('Setting up the render…',1800);openRender({THREE,scene,camera,S,toast,getHdr:()=>hdrRaw,aspect:()=>canvas.clientWidth/Math.max(1,canvas.clientHeight),target:controls.target}).then(r=>{renderUI=r;}).catch(e=>{console.error(e);toast('Couldn’t start the render.');});}
function setEnvHdr(t){hdrRaw=t||null;try{if(hdrEnv){hdrEnv.dispose();hdrEnv=null;}if(t){const pm=new THREE.PMREMGenerator(renderer);hdrEnv=pm.fromEquirectangular(t).texture;scene.environment=hdrEnv;}else scene.environment=envTex;scene.environmentIntensity=S.env;S.needFrame=true;}catch(e){console.warn('env',e);}}
function setupEnv(){try{const pm=new THREE.PMREMGenerator(renderer);envTex=pm.fromScene(new RoomEnvironment(),.04).texture;scene.environment=envTex;scene.environmentIntensity=S.env;}catch(e){console.warn('env failed',e);}}
const grid=new THREE.GridHelper(12,24,0x666670,0x2f2f36);grid.material.transparent=true;grid.material.opacity=.4;scene.add(grid);
const tc=new TransformControls(camera,canvas);tc.setSize(.8);
const tcHelper=tc.getHelper?tc.getHelper():tc;
/* handles and the selection box are drawn after the look, on top, so a hardware look on the selected object never hides the controls */
const overlay=new THREE.Scene();overlay.add(tcHelper);
tcHelper.traverse(n=>{n.userData.noView=true;}); // the view modes must not swap the gizmo's own materials (Normal and Depth crashed it)
tc.addEventListener('dragging-changed',e=>{controls.enabled=!e.value;});
const pivotH=new THREE.Object3D();scene.add(pivotH);
/* move the origin of an object without moving its geometry: holder goes to the new world point, root takes the inverse */
function setPivotWorld(o,P){
  const h=o.holder,r=o.root;h.updateMatrixWorld(true);r.updateMatrixWorld(true);const oldW=r.matrixWorld.clone();
  h.position.copy(h.parent?h.parent.worldToLocal(P.clone()):P);h.updateMatrixWorld(true);
  new THREE.Matrix4().copy(h.matrixWorld).invert().multiply(oldW).decompose(r.position,r.quaternion,r.scale);
  r.updateMatrixWorld(true);setSelBox();bump();
}
function setPivotMode(on){
  const o=objById(S.sel);S.pivot=!!(on&&o);
  if(S.pivot){if(S.rest)leaveRest();o.holder.updateMatrixWorld(true);pivotH.position.setFromMatrixPosition(o.holder.matrixWorld);tc.attach(pivotH);tc.setMode('translate');}
  else{tc.detach();if(o&&S.gizmo){tc.attach(o.holder);tc.setMode(S.gizmo);}}
  bump();
}
function pivotTo(o,where){
  if(S.rest)leaveRest();
  const b=holderBox(o.holder),P=new THREE.Vector3();
  if(where==='origin')P.set(0,0,0);
  else if(b.isEmpty())return;
  else{b.getCenter(P);if(where==='base')P.y=b.min.y;}
  setPivotWorld(o,P);if(S.pivot)pivotH.position.copy(P);
}
tc.addEventListener('objectChange',()=>{if(S.pivot&&tc.object===pivotH){const o=objById(S.sel);if(o)setPivotWorld(o,pivotH.position);}bump();refreshInspector&&refreshInspector(true);});
let selBox=null;

/* ---------- render targets ---------- */
let rt=null,maskRT=null,curW=0,curH=0,needResize=true;
function makeTargets(w,h){
  if(rt)rt.dispose();if(maskRT)maskRT.dispose();
  const mk=(samples)=>{const r=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,samples,depthBuffer:true,colorSpace:THREE.SRGBColorSpace});
    r.depthTexture=new THREE.DepthTexture(w,h);return r;};
  rt=mk(4);
  maskRT=new THREE.WebGLRenderTarget(w,h,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
  maskRT.depthTexture=new THREE.DepthTexture(w,h); // a full-precision depth buffer: the walk camera's near/far ratio is large and a 16-bit one let far objects black out near ones in the mask
}
const ro=new ResizeObserver(()=>{needResize=true;});ro.observe(stage);
function resize(){
  const r=stage.getBoundingClientRect();if(r.width<10||r.height<10)return;
  const dpr=Math.min(matchMedia('(pointer:coarse)').matches?1.5:2,window.devicePixelRatio||1); // phones: fewer pixels, steadier frame rate
  let W=Math.round(r.width*dpr*S.q),H=Math.round(r.height*dpr*S.q);
  const cap=S.big?3600:1800,m=Math.max(W,H);if(m>cap){W=Math.round(W*cap/m);H=Math.round(H*cap/m);}
  W=Math.max(160,W&~1);H=Math.max(160,H&~1);
  needResize=false;
  if(W===curW&&H===curH)return;
  curW=W;curH=H;canvas.width=W;canvas.height=H;
  renderer.setPixelRatio(1);renderer.setSize(W,H,false);
  makeTargets(W,H);N0.setSize(W,H);
  camera.aspect=W/H;viewOffY=-1;bump();
}
let viewOffY=-1;
function applyViewOffset(){
  const sh=sheet.coverPx();const stH=stage.clientHeight||1;
  const off=Math.round(sh*(curH/stH)/2*10)/10;
  if(Math.abs(off-viewOffY)<.4)return;viewOffY=off;
  if(off<=.5){camera.clearViewOffset();}else camera.setViewOffset(curW,curH,0,off,curW,curH);
  camera.updateProjectionMatrix();bump();
}
const bump=()=>{S.ver++;N0.SRC.ver=S.ver;S.liveUntil=performance.now()+450;};
controls.addEventListener('change',bump);

/* ---------- objects ---------- */
let idc=0;
/* the sky is a look target too: not a scene object, but it carries a look or effect stack like one and is masked by where nothing else is */
const SKY={id:'sky',name:'Sky',kind:'sky',vis:true,holder:{visible:true},meta:{}};
/* more things that can carry a look besides objects: the lighting (wherever it is bright: lit surfaces and glow) and the ground */
const LIGHTO={id:'light',name:'Lighting',kind:'light',vis:true,holder:{visible:true},meta:{}},GROUNDO={id:'ground',name:'Ground',kind:'ground',vis:true,holder:{visible:true},meta:{}};
const PSEUDO=[SKY,LIGHTO,GROUNDO];
const objById=id=>id==='sky'?SKY:id==='light'?LIGHTO:id==='ground'?GROUNDO:S.objs.find(o=>o.id===id);
let NW=null,FORM=null,MECH=null,SIG=null,RAG=null; // the .n0world builder, created once the scene API exists
const SAFE_MODE=/[?&]safe=1/.test(location.search),WORLD_ON=!/[?&]n0world=0/.test(location.search);
const anyLook=()=>PSEUDO.some(x=>x.look)||S.objs.some(x=>x.look);
const claymat=new THREE.MeshStandardMaterial({color:0xd8d4cc,roughness:.92,metalness:0});
const normmat=new THREE.MeshNormalMaterial();
const depthmat=new THREE.MeshDepthMaterial();
const wiremat=new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true});
function applyView(){
  depthmat.depthPacking=THREE.BasicDepthPacking;
  try{fxApplyPatches();}catch(e){}
  scene.traverse(o=>{
    if(!o.isMesh||o.isSplatMesh||o.userData.noView)return;
    if(!o.userData._mat)o.userData._mat=o.material;
    const v=S.view;
    o.material=v==='shaded'?o.userData._mat:v==='clay'?claymat:v==='normal'?normmat:v==='depth'?depthmat:wiremat;
  });
  bump();
}
function holderBox(h){return new THREE.Box3().setFromObject(h);}
/* Automatic placement: a new object lands in free ground space near the middle of the view, never on top of another one. It is measured
   from real bounding boxes. Flat floors and huge slabs don't block (things stand on them), existing objects never move. near = [x,z] to prefer. */
function autoPlace(o,near){
  const h=o.holder;h.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(h);if(b.isEmpty()||!isFinite(b.min.x))return;
  const sz=b.getSize(new THREE.Vector3()),ctr=b.getCenter(new THREE.Vector3());
  const others=S.objs.filter(x=>x.holder!==h&&x.vis!==false&&x.kind!=='viz').map(x=>holderBox(x.holder)).filter(bb=>!bb.isEmpty()&&isFinite(bb.min.x)&&(bb.max.y-bb.min.y)>.06&&(bb.max.x-bb.min.x)<40&&(bb.max.z-bb.min.z)<40);
  const flat=sz.y<.06,hx=sz.x/2+.18,hz=sz.z/2+.18,top=b.min.y<-.001?0:0;
  const px=near?near[0]:(S.objs.length?controls.target.x:0),pz=near?near[1]:(S.objs.length?controls.target.z:0);
  const free=(x,z)=>!others.some(bb=>x+hx>bb.min.x&&x-hx<bb.max.x&&z+hz>bb.min.z&&z-hz<bb.max.z&&sz.y+.0>0&&bb.max.y>.02);
  let best=[px,pz];
  if(!flat&&!free(px,pz)){
    const step=Math.max(.35,Math.min(sz.x,sz.z)*.6);let found=false;
    for(let r=step;r<40&&!found;r+=step){const n=Math.max(8,Math.round(2*Math.PI*r/step));
      for(let i=0;i<n;i++){const a=i/n*Math.PI*2+r*.7,x=px+Math.cos(a)*r,z=pz+Math.sin(a)*r;if(free(x,z)){best=[x,z];found=true;break;}}}
  }
  h.position.x+=best[0]-ctr.x;h.position.z+=best[1]-ctr.z;
  if(o.kind!=='splat'&&o.kind!=='scan')h.position.y+=-b.min.y;
  h.updateMatrixWorld(true);
}
function registerObject(name,root,kind,{fit=true,size=1.8,meta={},box=null}={}){
  const holder=new THREE.Group();holder.add(root);
  if(fit){
    root.updateMatrixWorld(true);
    const b=box||new THREE.Box3().setFromObject(root);
    const sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
    const s=size/Math.max(sz.x,sz.y,sz.z,1e-6);
    root.position.add(new THREE.Vector3(-c.x,-b.min.y,-c.z));
    holder.scale.setScalar(s);
  }
  world.add(holder);if(S.shadows)setShadowFlags(holder);
  if(kind!=='relief'&&!meta.noAuto){const tmp={holder,kind};autoPlace(tmp);}
  if(kind!=='relief'&&S.rest)leaveRest();
  const o={id:++idc,name,kind,holder,root,vis:true,meta};
  holder.userData.objId=o.id;
  S.objs.push(o);
  applyView();
  selectObj(o.id);
  if(S.objs.length===1||kind==='scan'||kind==='relief')S.needFrame=true;
  $('#empty').hidden=S.objs.length>0;
  renderObjList&&renderObjList();
  bump();markDirty();
  return o;
}
function removeObj(id){
  const i=S.objs.findIndex(o=>o.id===id);if(i<0)return;
  const o=S.objs[i];
  if(tc.object===o.holder)tc.detach();
  world.remove(o.holder);
  o.holder.traverse(n=>{if(n.geometry)n.geometry.dispose();if(n.material&&n.material.dispose&&!n.userData._shared){const ms=Array.isArray(n.material)?n.material:[n.material];ms.forEach(m=>{if(m.map)m.map.dispose();m.dispose();});}if(n.dispose&&n.isSplatMesh)n.dispose();});
  S.objs.splice(i,1);FORM&&FORM.remove(o);
  if(S.rest&&S.rest.id===id)leaveRest();
  if(S.sel===id)S.sel=null;
  setSelBox();$('#empty').hidden=S.objs.length>0;
  renderObjList&&renderObjList();refreshInspector&&refreshInspector();bump();markDirty();
}
function selectObj(id){
  S.pivot=false;S.sel=id;const o=objById(id);if(o){lookSwitch(S.fxTarget,id);S.fxTarget=id;}
  try{surfRefresh();}catch(e){} // the look stays on the last picked object even after a tap on empty space
  if(tc.object&&(!o||tc.object!==o.holder))tc.detach();
  if(o&&S.gizmo){tc.attach(o.holder);tc.setMode(S.gizmo);}
  setSelBox();
  renderObjList&&renderObjList();refreshInspector&&refreshInspector();bump();
}
function setSelBox(){
  if(selBox){overlay.remove(selBox);selBox.geometry.dispose();selBox=null;}
  const o=objById(S.sel);if(!o||!o.holder)return;
  if(o.meta&&o.meta.sigil&&S.tab==='draw')return; // no box around a drawing while you draw on it
  selBox=new THREE.BoxHelper(o.holder,0xff5a1f);overlay.add(selBox);
}
function frameAll(){
  if(S.rest&&objById(S.rest.id)&&S.rest.cage){enterRest(objById(S.rest.id));return;}
  const b=new THREE.Box3();S.objs.forEach(o=>{if(o.vis)b.union(holderBox(o.holder));});
  if(b.isEmpty()){controls.target.set(0,.9,0);return;}
  const c=b.getCenter(new THREE.Vector3()),r=b.getSize(new THREE.Vector3()).length()*.5||1;
  const vis=clamp(1-sheet.coverPx()/Math.max(1,stage.clientHeight),.4,1);
  const tv=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*vis,th=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*(camera.aspect||1);
  const d=r/Math.sin(Math.atan(Math.min(tv,th)))*1.12;
  const dir=camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(c);camera.position.copy(c).addScaledVector(dir,d);camera.near=Math.max(.01,d/200);camera.far=d*60;camera.updateProjectionMatrix();controls.update();bump();
}

/* ---------- primitives ---------- */
const PRIMS={
  Knot:()=>new THREE.TorusKnotGeometry(.55,.19,200,32),
  Sphere:()=>new THREE.SphereGeometry(.8,48,32),
  Cube:()=>new THREE.BoxGeometry(1.2,1.2,1.2),
  Torus:()=>new THREE.TorusGeometry(.7,.28,32,64),
  Plane:()=>new THREE.PlaneGeometry(2,2,1,1),
  Cylinder:()=>new THREE.CylinderGeometry(.6,.6,1.4,48),
  Cone:()=>new THREE.ConeGeometry(.7,1.4,48),
  Capsule:()=>new THREE.CapsuleGeometry(.4,.9,8,24),
  Ramp:()=>{const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(2.4,0);sh.lineTo(0,1);sh.closePath();const g=new THREE.ExtrudeGeometry(sh,{depth:1.6,bevelEnabled:false});g.translate(-1.2,-.5,-.8);return g;},
  Stairs:()=>{const parts=[];for(let i=0;i<5;i++){const b=new THREE.BoxGeometry(.5,.25*(i+1),1.6);b.translate(-1+i*.5+.25,.125*(i+1)-.6,0);parts.push(b);}return mergeGeo(parts);},
  Wall:()=>new THREE.BoxGeometry(3,1.6,.25),
  Pyramid:()=>new THREE.ConeGeometry(.9,1.2,4,1).rotateY(Math.PI/4),
  Ring:()=>new THREE.TorusGeometry(.8,.1,24,64)
};
function mergeGeo(list){let n=0,ni=0;const nonIdx=list.map(g=>g.index?g.toNonIndexed():g);nonIdx.forEach(g=>n+=g.attributes.position.count);
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3);let o=0;nonIdx.forEach(g=>{pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);o+=g.attributes.position.count;});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));return g;}
function setShadowFlags(n){if(!n)return;n.traverse(m=>{if(m.isMesh&&!m.isSplatMesh){m.castShadow=!!S.shadows;m.receiveShadow=!!S.shadows;}});}
/* photographs as objects (brightness-based, not recovered depth) */
function addPhoto(kind,cv){
  const root=new THREE.Group();root.add(buildPhoto(THREE,kind,cv,null));
  const o=registerObject(P3D[kind].name,root,'mesh',{size:2.4,meta:{p3d:{kind,o:{...P3D[kind].def},src:cv}}});
  S.needFrame=true;return o;
}
function rebuildPhoto(o){const m=o.meta.p3d;const g=buildPhoto(THREE,m.kind,m.src,m.o);o.root.clear();while(g.children.length)o.root.add(g.children[0]);setShadowFlags(o.holder);bump();markDirty();}
function photoInspector(o){
  const m=o.meta.p3d,r=sec(inspEl,P3D[m.kind].name,'from brightness');
  P3D[m.kind].opts.forEach(([k,l,min,max,step,names])=>sliderRow(r,l,()=>m.o[k],v=>{m.o[k]=v;rebuildPhoto(o);},min,max,step||1,names?v=>names[Math.round(v)]:undefined));
  r.appendChild(btn('Use another picture','',()=>pickPhoto(m.kind,o)));
  r.appendChild(el('div','note','The shape follows how light or dark each part of the picture is. It is not recovered depth.'));
}
function pickPhoto(kind,replace){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async()=>{const f=i.files[0];if(!f)return;try{const cv=await loadCanvas(f);if(replace){replace.meta.p3d.src=cv;rebuildPhoto(replace);}else addPhoto(kind,cv);}catch(e){toast(e.message);}};i.click();}
/* an object made of several meshes (worlds: prefabs, groups). Stays one editable object. */
async function addPhModel(id,name,{res='1k',pos=null,rotY=0,noAuto=false}={}){
  try{toast('Loading '+(name||id)+'…',2500);const g=await phLoad(gltfLoader,id,res);const o=addGroup(name||id,g,{phModel:{id,res},noAuto:noAuto||!!pos});
    if(pos)o.holder.position.set(pos[0],pos[1],pos[2]);o.holder.rotation.y=rotY;o.holder.updateMatrixWorld(true);S.needFrame=false;bump();return o;}
  catch(e){console.warn(e);toast('Couldn’t load that model. Check the connection and try again.',4000);return null;}
}
function addGroup(name,group,meta){return registerObject(name,group,'group',{fit:false,meta});}
function addPrimitive(k){
  const g=PRIMS[k]();if(k==='Plane')g.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xb9b4ac,roughness:.55,metalness:.1}));
  return registerObject(k,m,'mesh',{size:k==='Plane'?3:1.6,meta:{asset:k.toLowerCase()}});
}


/* =====================================================================
   3D audio visualizers. Same five modes and the same orange heat ramp as the 2D visualizer in index.html.
   Audio: an imported file or the microphone, analysed in the browser. Nothing is uploaded.
   ===================================================================== */
const AU={ctx:null,an:null,el:null,node:null,mic:null,name:'',freq:new Uint8Array(512),wave:new Uint8Array(1024),bands:new Float32Array(64),level:0,gain:1,demo:true,playing:false};
function auEnsure(){
  if(AU.ctx)return;
  AU.ctx=new (window.AudioContext||window.webkitAudioContext)();AU.an=AU.ctx.createAnalyser();AU.an.fftSize=1024;AU.an.smoothingTimeConstant=.55;AU.an.minDecibels=-92;AU.an.maxDecibels=-4; // wide range: loud masters don't clip every bin
  AU.freq=new Uint8Array(AU.an.frequencyBinCount);AU.wave=new Uint8Array(AU.an.fftSize);
}
function auSource(kind){ // detach whatever feeds the analyser
  try{if(AU.node)AU.node.disconnect();}catch(e){}
  try{if(AU.mic){AU.mic.getTracks().forEach(t=>t.stop());AU.mic=null;}}catch(e){}
  AU.node=null;
}
async function loadAudio(file){
  auEnsure();await AU.ctx.resume();auSource();
  if(AU.el){AU.el.pause();URL.revokeObjectURL(AU.el.src);}
  const a=AU.el=new Audio();a.src=URL.createObjectURL(file);a.loop=true;a.crossOrigin='anonymous';
  AU.node=AU.ctx.createMediaElementSource(a);AU.node.connect(AU.an);AU.an.connect(AU.ctx.destination);
  AU.name=file.name;AU.demo=false;
  try{await a.play();AU.playing=true;}catch(e){AU.playing=false;toast('Press Play to start the audio.');}
  return a;
}
async function useMic(){
  try{
    auEnsure();await AU.ctx.resume();const s=await navigator.mediaDevices.getUserMedia({audio:true});
    if(AU.el){AU.el.pause();AU.playing=false;}auSource();AU.mic=s;AU.node=AU.ctx.createMediaStreamSource(s);AU.node.connect(AU.an);try{AU.an.disconnect(AU.ctx.destination);}catch(e){}
    AU.name='Microphone';AU.demo=false;return true;
  }catch(e){toast('Microphone unavailable here.');return false;}
}
function auFrame(t,dt){
  const B=AU.bands;let lv=0;
  if(!AU.demo&&AU.an){
    AU.an.getByteFrequencyData(AU.freq);AU.an.getByteTimeDomainData(AU.wave);
    const N=AU.freq.length;
    // auto gain per band: each band is judged against its own recent peak, so loud songs still show dynamics and the beat stands out
    if(!AU.bpk){AU.bpk=new Float32Array(64).fill(.2);AU.bmin=new Float32Array(64);AU.prev=new Float32Array(64);}
    let flux=0;
    for(let i=0;i<64;i++){const a=Math.floor(Math.pow(i/64,2.1)*N*.85),b=Math.max(a+1,Math.floor(Math.pow((i+1)/64,2.1)*N*.85));let s=0;for(let k=a;k<b;k++)s+=AU.freq[k];
      const raw=s/(b-a)/255;AU.bpk[i]=Math.max(raw,AU.bpk[i]*Math.pow(.5,dt/4));AU.bmin[i]=Math.min(raw,AU.bmin[i]+dt*.03);
      if(i<14)flux+=Math.max(0,raw-AU.prev[i]);AU.prev[i]=raw;
      const v=Math.min(1,Math.pow(Math.max(0,raw-AU.bmin[i])/Math.max(.08,AU.bpk[i]-AU.bmin[i]),2.6)*AU.gain*(raw>.02?1:raw/.02));B[i]=Math.max(v,B[i]*Math.pow(.02,dt));lv+=v;}
    AU.flux=flux;
  }else{ // demo signal so the shapes move before any audio is loaded
    if(AU.wave.length!==1024)AU.wave=new Uint8Array(1024);
    for(let i=0;i<64;i++){const x=i/64,v=Math.max(0,.55*Math.exp(-x*3)*(.6+.4*Math.sin(t*2.1))+.35*Math.pow(Math.max(0,Math.sin(t*1.7+x*9)),2)*(1-x)+.12*Math.sin(t*5+x*30)**2*x);B[i]=Math.max(v,B[i]*Math.pow(.02,dt));lv+=v;}
    for(let i=0;i<1024;i++){const x=i/1024;AU.wave[i]=128+127*(.5*Math.sin(x*40+t*6)+.3*Math.sin(x*97-t*9)*Math.sin(t*1.3))*.8;}
  }
  AU.level=lv/64;
}
const heat=(u,o,i)=>{u=Math.max(0,Math.min(1,u));o[i]=1;o[i+1]=.24+.59*u;o[i+2]=.12+.24*u;};
const VIZ_MODES=[['waterfall','Waterfall'],['radial','Radial'],['scope','Scope'],['ridges','Ridges'],['cymatics','Cymatics'],['helix','Helix'],['bars','Bar grid'],['fountain','Fountain']];
const VZ_BG=new THREE.Color(0x0b0b0c);
function buildViz(o){
  const v=o.viz,root=o.root;
  root.children.slice().forEach(c=>{root.remove(c);c.geometry&&c.geometry.dispose();c.material&&c.material.dispose&&c.material.dispose();if(c.dispose&&c.isInstancedMesh)c.dispose();});
  v.hist=null;v.rows=0;v.acc=0;
  const fillMat=()=>new THREE.MeshBasicMaterial({color:VZ_BG,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,side:THREE.DoubleSide});
  if(v.mode==='waterfall'){
    const R=40,C=64;v.rows=R;v.hist=new Float32Array(R*C);
    const g=new THREE.PlaneGeometry(2.4,1.8,C-1,R-1);g.rotateX(-Math.PI/2);g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(C*R*3),3));
    const wire=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,wireframe:true,toneMapped:false}));
    const fill=new THREE.Mesh(g,fillMat());root.add(fill,wire);v.g=g;v.C=C;v.R=R;
  }else if(v.mode==='radial'){
    const n=64,g=new THREE.BoxGeometry(.035,1,.035);g.translate(0,.5,0);
    const m=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({toneMapped:false}),n);m.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);m.frustumCulled=false;
    root.add(m);v.m=m;v.n=n;
    const ring=new THREE.Mesh(new THREE.RingGeometry(.66,.668,128),new THREE.MeshBasicMaterial({color:0x777777,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;root.add(ring);
  }else if(v.mode==='scope'){
    const L=18,N=256;v.L=L;v.N=N;v.hist=new Float32Array(L*N);v.lines=[];
    for(let l=0;l<L;l++){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));
      const ln=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:1-l/L,toneMapped:false}));ln.frustumCulled=false;root.add(ln);v.lines.push(ln);}
  }else if(v.mode==='ridges'){
    const R=26,C=64;v.R=R;v.C=C;v.hist=new Float32Array(R*C);v.lines=[];v.fills=[];
    for(let r=0;r<R;r++){
      const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(C*3),3));
      const ln=new THREE.Line(lg,new THREE.LineBasicMaterial({color:0xf2efe6,toneMapped:false}));ln.frustumCulled=false;
      const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(C*2*3),3));
      const idx=[];for(let i=0;i<C-1;i++)idx.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);fg.setIndex(idx);
      const fl=new THREE.Mesh(fg,fillMat());fl.frustumCulled=false;root.add(fl,ln);v.lines.push(ln);v.fills.push(fl);}
  }else if(v.mode==='helix'){
    const n=128,g=new THREE.BoxGeometry(.05,.05,.05),m=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({toneMapped:false}),n);m.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);m.frustumCulled=false;root.add(m);v.m=m;v.n=n;
  }else if(v.mode==='bars'){
    const G=18,n=G*G,g=new THREE.BoxGeometry(.09,1,.09);g.translate(0,.5,0);
    const mm=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({toneMapped:false}),n);mm.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);mm.frustumCulled=false;root.add(mm);v.m=mm;v.G=G;v.hist=new Float32Array(G*G);
  }else if(v.mode==='fountain'){
    const n=1800,pos=new Float32Array(n*3),col=new Float32Array(n*3);v.vel=new Float32Array(n*3);v.life=new Float32Array(n).fill(-1);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(g,new THREE.PointsMaterial({size:.022,vertexColors:true,sizeAttenuation:true,toneMapped:false}));pts.frustumCulled=false;root.add(pts);v.g=g;v.n=n;
  }else{ // cymatics: sand on a vibrating plate
    const S=110,n=S*S,pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(let j=0;j<S;j++)for(let i=0;i<S;i++){const k=j*S+i;pos[k*3]=(i/(S-1)-.5)*2;pos[k*3+2]=(j/(S-1)-.5)*2;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(g,new THREE.PointsMaterial({size:.016,vertexColors:true,sizeAttenuation:true,toneMapped:false}));pts.frustumCulled=false;root.add(pts);v.g=g;v.S=S;v.nm=[3,5];
  }
  // an invisible box with the shape's true extent: framing, the selection box and tap-to-pick need geometry that doesn't move every frame
  const BX={waterfall:[2.4,1,1.8,0,.4,0],radial:[1.6,1.3,1.6,0,.6,0],scope:[2.4,1.2,1.3,0,.5,-.6],ridges:[2.3,1.1,1.9,0,.5,0],cymatics:[2.1,.6,2.1,0,0,0],helix:[1.5,2.2,1.5,0,1,0],bars:[1.8,1.2,1.8,0,.5,0],fountain:[2,2.4,2,0,1.1,0]}[v.mode];
  const bb=new THREE.Mesh(new THREE.BoxGeometry(BX[0],BX[1],BX[2]),new THREE.MeshBasicMaterial({visible:false}));bb.position.set(BX[3],BX[4],BX[5]);bb.userData.noView=true;root.add(bb);
  o.holder.userData.vizMode=v.mode;applyView();
}
function vizUpdate(o,t,dt){
  const v=o.viz,B=AU.bands,H=v.height;
  if(v.mode==='waterfall'||v.mode==='ridges'){
    v.acc+=dt;if(v.acc<1/30)return;v.acc=0;const C=v.C,R=v.R;
    v.hist.copyWithin(C,0,(R-1)*C);for(let i=0;i<C;i++)v.hist[i]=B[i];
  }
  if(v.mode==='waterfall'){
    const p=v.g.attributes.position,c=v.g.attributes.color,C=v.C,R=v.R;
    for(let r=0;r<R;r++)for(let i=0;i<C;i++){const k=r*C+i,h=v.hist[k];p.setY(k,h*H*(1-r/R*.35));heat(h*1.4,c.array,k*3);const dim=(.18+.82*Math.min(1,h*2.2))*(1-r/R*.6);c.array[k*3]*=dim;c.array[k*3+1]*=dim;c.array[k*3+2]*=dim;}
    p.needsUpdate=true;c.needsUpdate=true;
  }else if(v.mode==='ridges'){
    const C=v.C,R=v.R;
    for(let r=0;r<R;r++){const lp=v.lines[r].geometry.attributes.position,fp=v.fills[r].geometry.attributes.position,z=-.9+r/(R-1)*1.8;
      for(let i=0;i<C;i++){const x=(i/(C-1)-.5)*2.2,h=v.hist[r*C+i]*H*(1-r/R*.2)*(1-Math.pow(Math.abs(i/(C-1)-.5)*2,3)*.5);lp.setXYZ(i,x,h,z);fp.setXYZ(i*2,x,h,z);fp.setXYZ(i*2+1,x,-.02,z);}
      lp.needsUpdate=true;fp.needsUpdate=true;v.lines[r].material.color.setScalar(1-r/R*.7);}
  }else if(v.mode==='radial'){
    const m=v.m,d=new THREE.Object3D(),c=m.instanceColor.array;
    for(let i=0;i<v.n;i++){const a=i/v.n*Math.PI*2,h=.03+B[i]*H*1.3;d.position.set(Math.cos(a)*.7,0,Math.sin(a)*.7);d.rotation.set(0,-a,0);d.scale.set(1,h,1);d.updateMatrix();m.setMatrixAt(i,d.matrix);heat(B[i]*1.4,c,i*3);}
    m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;
  }else if(v.mode==='scope'){
    v.acc+=dt;const N=v.N,L=v.L;
    if(v.acc>=1/24){v.acc=0;v.hist.copyWithin(N,0,(L-1)*N);for(let i=0;i<N;i++)v.hist[i]=(AU.wave[Math.floor(i/N*AU.wave.length)]-128)/128;}
    for(let l=0;l<L;l++){const p=v.lines[l].geometry.attributes.position;for(let i=0;i<N;i++)p.setXYZ(i,(i/(N-1)-.5)*2.4,.5+v.hist[l*N+i]*H*.6,-l*.07);p.needsUpdate=true;}
  }else if(v.mode==='helix'){
    const m=v.m,d=new THREE.Object3D(),c=m.instanceColor.array;
    for(let i=0;i<v.n;i++){const k=i/v.n,a=k*Math.PI*8+t*.8+(i%2)*Math.PI,b=B[Math.floor(k*63)],r=.45+b*.35*H;d.position.set(Math.cos(a)*r,k*2.1,Math.sin(a)*r);d.rotation.set(a,a*.5,0);d.scale.setScalar(.45+b*H*1.5);d.updateMatrix();m.setMatrixAt(i,d.matrix);heat(b*1.5+.15,c,i*3);}
    m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;
  }else if(v.mode==='bars'){
    v.acc+=dt;const G=v.G;
    if(v.acc>=1/20){v.acc=0;v.hist.copyWithin(G,0,(G-1)*G);for(let i=0;i<G;i++){const a=Math.floor(Math.pow(i/G,1.6)*60);v.hist[i]=B[a];}}
    const m=v.m,d=new THREE.Object3D(),c=m.instanceColor.array;
    for(let r=0;r<G;r++)for(let i=0;i<G;i++){const k=r*G+i,h=.02+v.hist[k]*H*1.05*(1-r/G*.4);d.position.set((i/(G-1)-.5)*1.7,0,(r/(G-1)-.5)*1.7);d.scale.set(1,h,1);d.updateMatrix();m.setMatrixAt(k,d.matrix);heat(v.hist[k]*1.5,c,k*3);const f=1-r/G*.5;c[k*3]*=f;c[k*3+1]*=f;c[k*3+2]*=f;}
    m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;
  }else if(v.mode==='fountain'){
    const p=v.g.attributes.position,c=v.g.attributes.color,vel=v.vel,life=v.life,n=v.n,bass=(B[0]+B[1]+B[2]+B[3])/4,emit=Math.floor(8+bass*70*H);let em=0;
    for(let i=0;i<n;i++){
      if(life[i]<=0&&em<emit){em++;const a=Math.random()*6.283,sp=.15+Math.random()*.35;p.setXYZ(i,0,0,0);vel[i*3]=Math.cos(a)*sp*.6;vel[i*3+1]=(1.1+bass*2.2*H+Math.random()*.8);vel[i*3+2]=Math.sin(a)*sp*.6;life[i]=1.2+Math.random()*1.2;}
      if(life[i]>0){life[i]-=dt;vel[i*3+1]-=1.9*dt;p.setXYZ(i,p.getX(i)+vel[i*3]*dt,Math.max(0,p.getY(i)+vel[i*3+1]*dt),p.getZ(i)+vel[i*3+2]*dt);heat(life[i]/1.8+.1,c.array,i*3);}
      else{p.setY(i,-9);}
    }
    p.needsUpdate=true;c.needsUpdate=true;
  }else{
    const S=v.S,p=v.g.attributes.position,c=v.g.attributes.color,lo=(B[1]+B[2]+B[3])/3,mi=(B[10]+B[14]+B[18])/3,hi=(B[34]+B[42]+B[50])/3;
    v.nm[0]+=((2+Math.round(lo*6+mi*5))-v.nm[0])*Math.min(1,dt*2);v.nm[1]+=((3+Math.round(mi*8+hi*6))-v.nm[1])*Math.min(1,dt*2);
    const n=v.nm[0]*Math.PI,m=v.nm[1]*Math.PI,amp=H*(.25+AU.level*2.2);
    for(let j=0;j<S;j++)for(let i=0;i<S;i++){const k=j*S+i,x=i/(S-1)*2-1,y=j/(S-1)*2-1;
      const h=Math.cos(n*x)*Math.cos(m*y)-Math.cos(m*x)*Math.cos(n*y);p.setY(k,h*amp*.5);heat(1-Math.min(1,Math.abs(h)*1.2)+.05,c.array,k*3);}
    p.needsUpdate=true;c.needsUpdate=true;
  }
}
function vizTick(t,dt){
  let any=false;for(const o of S.objs)if(o.kind==='viz'&&o.vis){any=true;break;}
  if(!any)return;
  auFrame(t,dt);for(const o of S.objs)if(o.kind==='viz'&&o.vis)vizUpdate(o,t,dt);
}
function addViz(mode='waterfall'){
  const g=new THREE.Group(),o=registerObject('Visualizer',g,'viz',{fit:false,meta:{}});
  o.viz={mode,height:.9};buildViz(o);o.holder.position.y=.05;o.holder.scale.setScalar(1.3);S.needFrame=true;refreshInspector();bump();return o;
}
function vizInspector(o){
  const v=o.viz,r=sec(inspEl,'Visualizer',AU.demo?'demo signal':AU.name);
  chipRow(r,VIZ_MODES,m=>v.mode===m,m=>{v.mode=m;buildViz(o);refreshInspector();});
  sliderRow(r,'Height',()=>v.height,x=>{v.height=x;},.2,2.5,.01);
  sliderRow(r,'Input gain',()=>AU.gain,x=>{AU.gain=x;},.3,4,.05);
  const row=el('div','chips');
  row.append(btn('Import audio','pri',()=>{const f=$('#file');f.accept='audio/*,.mp3,.wav,.m4a,.ogg,.flac';f.onchange=async()=>{await importFiles(f.files);f.value='';f.accept=FILE_ACCEPT;f.onchange=null;};f.click();}),
    btn('Microphone','',async()=>{if(await useMic())refreshInspector();}),
    btn(AU.demo?'Demo signal on':'Demo signal','',()=>{AU.demo=true;if(AU.el){AU.el.pause();AU.playing=false;}auSource();refreshInspector();}));
  r.appendChild(row);
  if(AU.el&&!AU.demo){
    const pr=el('div','chips');const pb=btn(AU.el.paused?'Play':'Pause','',()=>{if(AU.el.paused){AU.ctx.resume();AU.el.play();}else AU.el.pause();AU.playing=!AU.el.paused;refreshInspector();});
    pr.appendChild(pb);r.appendChild(pr);
    sliderRow(r,'Position',()=>AU.el.duration?AU.el.currentTime/AU.el.duration:0,x=>{if(AU.el.duration)AU.el.currentTime=x*AU.el.duration;},0,1,.001);
  }
  r.appendChild(el('div','note','Audio is analysed on this device. The look stack, masks and exports treat the visualizer like any other object.'));
}


/* =====================================================================
   3D object effects. Each object has up to three slots; every slot is an effect, an amount, a speed and an audio source.
   Motion effects move the object; deformers bend its surface in the vertex shader (Shaded view). Works with the demo signal,
   an imported song or the microphone. Auto mode re-rolls all of it on the beat.
   ===================================================================== */
const FX3=[['spin','Spin','x'],['tumble','Tumble','x'],['float','Float','x'],['pulse','Pulse','x'],['shake','Shake','x'],['orbit','Orbit','x'],['sway','Sway','x'],['squash','Squash','x'],['swing','Swing','x'],
  ['wave','Wave','d'],['twist','Twist','d'],['bend','Bend','d'],['noise','Noise','d'],['inflate','Inflate','d'],['ripple','Ripple','d'],['melt','Melt','d'],['glitch','Glitch','d'],['spikes','Spikes','d'],['squeeze','Squeeze','d']];
const FXK=Object.fromEntries(FX3.map((e,i)=>[e[0],{kind:e[2],label:e[1],ty:e[2]==='d'?FX3.filter(q=>q[2]==='d').findIndex(q=>q[0]===e[0])+1:0}]));
const FXSRC=[['none','Always'],['level','Level'],['bass','Bass'],['mid','Mid'],['treble','Treble'],['beat','Beat']];
const SG={level:0,bass:0,mid:0,treble:0,beat:0};
function sigUpdate(t,dt){
  const B=AU.bands,av=(a,b)=>{let s=0;for(let i=a;i<b;i++)s+=B[i];return Math.min(1,s/(b-a)*.9);};
  SG.level=Math.min(1,AU.level*3.2);SG.bass=av(0,6);SG.mid=av(8,26);SG.treble=av(30,64);
  const bs=SG.bass,fl=AU.demo?Math.max(0,bs-(AU._bs||0))*3:(AU.flux||0);AU._bs=bs;AU._fa=(AU._fa||0)+(fl-(AU._fa||0))*Math.min(1,dt*2.5);
  if(fl>AU._fa*1.7+.04&&t-(AU._bt||-1)>.24){AU.beat=1;AU._bt=t;AU.beats=(AU.beats||0)+1;}AU.beat=(AU.beat||0)*Math.pow(.004,dt);SG.beat=AU.beat;
}
const fxW=(s)=>s.src==='none'?1:SG[s.src]*1.7;
function fxEnsure(o){o.fx=o.fx||[];while(o.fx.length<3)o.fx.push({id:'',amt:.5,speed:1,src:'none',ph:0});return o.fx;}
/* deformers: a vertex-shader patch with per-mesh uniforms */
const DEF_GLSL=`
uniform float uT,uR;uniform vec4 uD[3];
float dh(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
float dn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 defo(vec3 p,vec3 n){
  for(int i=0;i<3;i++){float ty=uD[i].x;if(ty<.5)continue;float a=uD[i].y,t=uD[i].z,R=uR;
    if(ty<1.5)p.y+=sin(p.x/R*5.+t*3.)*a*R*.2;
    else if(ty<2.5){float k=p.y/R*a*2.6,c=cos(k),s=sin(k);p.xz=mat2(c,-s,s,c)*p.xz;}
    else if(ty<3.5){float k=a*.9*sin(t);p.y+=(p.x/R)*(p.x/R)*a*R*.6*sin(t+1.);float c=cos(p.y/R*k),s=sin(p.y/R*k);p.xy=mat2(c,-s,s,c)*p.xy;}
    else if(ty<4.5)p+=n*(dn(p/R*3.+t)-.5)*a*R*.9;
    else if(ty<5.5)p+=n*a*R*.3*(.55+.45*sin(t*2.));
    else if(ty<6.5)p+=n*sin(length(p)/R*10.-t*4.)*a*R*.12;
    else if(ty<7.5)p.y-=a*R*.5*(.5+.5*sin(p.x/R*3.+p.z/R*2.+t*2.))*clamp(.5-p.y/R*.5,0.,1.);
    else if(ty<8.5)p.x+=step(.72,dh(vec3(floor(p.y/R*14.),floor(t*4.),1.)))*(dh(vec3(floor(p.y/R*14.),floor(t*4.),2.))-.5)*a*R*.9;
    else if(ty<9.5)p+=n*pow(max(0.,dn(p/R*4.+t*.5)-.35)*1.6,2.)*a*R*1.6;
    else p.xz*=1.-a*.55*(.5+.5*sin(p.y/R*3.+t*2.));
  }
  return p;}`;
function fxPatch(mesh){
  let mat=mesh.userData._mat||mesh.material;
  if(mat.isShaderMaterial||mesh.isSplatMesh||mesh.userData.noView||!mesh.geometry)return;
  if(!mat.userData.defU){
    mat=mat.clone();mesh.userData._mat=mat;
    if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
    mat.userData.defU={uT:{value:0},uR:{value:Math.max(1e-3,mesh.geometry.boundingSphere?mesh.geometry.boundingSphere.radius:1)},uD:{value:[new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4()]}};
    mat.onBeforeCompile=sh=>{Object.assign(sh.uniforms,mat.userData.defU);
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+DEF_GLSL).replace('#include <begin_vertex>','vec3 transformed=defo(position,normal);');};
    mat.customProgramCacheKey=()=>'n0def1';mat.needsUpdate=true;
    if(S.view==='shaded')mesh.material=mat;
  }
}
function fxApplyPatches(){
  for(const o of S.objs){if(!o.fx||!o.fx.some(s=>s.id&&FXK[s.id]&&FXK[s.id].kind==='d'))continue;o.holder.traverse(n=>{if(n.isMesh)fxPatch(n);});}
}
function fxTick(t,dt){
  for(const o of S.objs){
    if(!o.fx||!o.fx.some(s=>s.id))continue;
    const h=o.holder,ap=o._ap;
    if(!o._base||(ap&&(Math.abs(h.position.x-ap.p[0])>1e-5||Math.abs(h.position.y-ap.p[1])>1e-5||Math.abs(h.position.z-ap.p[2])>1e-5||Math.abs(h.rotation.x-ap.r[0])>1e-5||Math.abs(h.rotation.y-ap.r[1])>1e-5||Math.abs(h.rotation.z-ap.r[2])>1e-5||Math.abs(h.scale.x-ap.s[0])>1e-5||Math.abs(h.scale.y-ap.s[1])>1e-5))){
      o._base={p:h.position.toArray(),r:[h.rotation.x,h.rotation.y,h.rotation.z],s:h.scale.toArray()};}
    const b=o._base,P=[0,0,0],R=[0,0,0],Sc=[1,1,1];let dIx=0;
    const meshes=[];if(o.fx.some(s=>s.id&&FXK[s.id]&&FXK[s.id].kind==='d'))h.traverse(n=>{if(n.isMesh&&n.material&&n.material.userData&&n.material.userData.defU)meshes.push(n);});
    const dv=[new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4()];
    for(const s of o.fx){
      if(!s.id||!FXK[s.id])continue;const w=fxW(s),a=s.amt,K=FXK[s.id];s.ph+=dt*s.speed*(.3+w*.7);const ph=s.ph;
      if(K.kind==='d'){if(dIx<3){dv[dIx++].set(K.ty,a*(s.src==='none'?1:Math.min(1.6,w)),ph*2.2,0);}continue;}
      switch(s.id){
        case'spin':R[1]+=ph*2.4*a;break;
        case'tumble':R[0]+=ph*1.1*a;R[1]+=ph*1.7*a;R[2]+=ph*.6*a;break;
        case'float':P[1]+=Math.sin(ph*3)*a*.28*(s.src==='none'?1:Math.min(1.5,w));break;
        case'pulse':{const k=1+a*.4*(s.src==='none'?Math.sin(ph*5)*.5+.5:Math.min(1.5,w));Sc[0]*=k;Sc[1]*=k;Sc[2]*=k;break;}
        case'shake':{const m=a*.09*(s.src==='none'?.5:Math.min(1.5,w));P[0]+=(Math.sin(ph*53)+Math.sin(ph*31))*.5*m;P[1]+=(Math.sin(ph*47)+Math.sin(ph*29))*.5*m;P[2]+=Math.sin(ph*61)*m*.5;break;}
        case'orbit':P[0]+=Math.cos(ph*2)*a*.9;P[2]+=Math.sin(ph*2)*a*.9;break;
        case'sway':R[2]+=Math.sin(ph*2.2)*a*.55;break;
        case'squash':{const k=Math.sin(ph*5)*a*.35*(s.src==='none'?1:Math.min(1.5,w));Sc[1]*=1+k;Sc[0]*=1-k*.5;Sc[2]*=1-k*.5;break;}
        case'swing':R[0]+=Math.sin(ph*2)*a*.9;break;
      }
    }
    h.position.set(b.p[0]+P[0],b.p[1]+P[1],b.p[2]+P[2]);h.rotation.set(b.r[0]+R[0],b.r[1]+R[1],b.r[2]+R[2]);h.scale.set(b.s[0]*Sc[0],b.s[1]*Sc[1],b.s[2]*Sc[2]);
    o._ap={p:h.position.toArray(),r:[h.rotation.x,h.rotation.y,h.rotation.z],s:h.scale.toArray()};
    for(const m of meshes){const u=m.material.userData.defU;u.uT.value=t;for(let i=0;i<3;i++)u.uD.value[i].copy(dv[i]);}
    if(S.sel===o.id&&selBox)selBox.update();
  }
}
function fxClear(o){ // put the object back where it was
  if(o._base&&o._ap){const h=o.holder,b=o._base;h.position.fromArray(b.p);h.rotation.set(b.r[0],b.r[1],b.r[2]);h.scale.fromArray(b.s);}
  o._base=null;o._ap=null;o.fx=[];
  o.holder.traverse(n=>{if(n.isMesh&&n.material&&n.material.userData&&n.material.userData.defU)for(let i=0;i<3;i++)n.material.userData.defU.uD.value[i].set(0,0,0,0);});bump();
}
const pickR=a=>a[Math.floor(Math.random()*a.length)];
function fxRandomise(o,n=2){
  fxEnsure(o);const xs=FX3.filter(e=>e[2]==='x').map(e=>e[0]),ds=FX3.filter(e=>e[2]==='d').map(e=>e[0]);
  o.fx.forEach(s=>{s.id='';});
  const roll=(id,i)=>{o.fx[i]={id,amt:.3+Math.random()*.55,speed:.5+Math.random()*1.6,src:pickR(['bass','level','beat','mid','none']),ph:0};};
  roll(pickR(xs),0);if(n>1&&o.kind!=='splat')roll(pickR(ds),1);if(n>2)roll(pickR(xs.concat(ds)),2);
  o._base=null;fxApplyPatches();bump();
}
/* ---------- Auto: re-rolls the show on the beat ---------- */
const AUTO={on:false,every:8,viz:true,fx:true,cam:true,look:false,last:0,tAcc:0,n:0,dist:0};
function autoStep(){
  AUTO.n++;
  if(AUTO.viz)S.objs.filter(o=>o.kind==='viz').forEach(o=>{const i=VIZ_MODES.findIndex(m=>m[0]===o.viz.mode);o.viz.mode=VIZ_MODES[(i+1+(Math.random()<.35?1:0))%VIZ_MODES.length][0];buildViz(o);});
  if(AUTO.fx)S.objs.forEach(o=>{if(o.kind==='viz'&&Math.random()<.5)return;fxRandomise(o,Math.random()<.5?2:3);});
  if(AUTO.cam&&!S.rest){
    controls.autoRotate=true;controls.autoRotateSpeed=(Math.random()<.5?-1:1)*(1.2+Math.random()*4);S.spin=true;
    const off=camera.position.clone().sub(controls.target);AUTO.dist=Math.min(9,Math.max(3.6,off.length()*(.75+Math.random()*.6)));
    off.y+=(Math.random()-.4)*.8;camera.position.copy(controls.target).add(off);
  }
  if(AUTO.look&&S.fx){const ids=N0.PROFILES.map(p=>p[0]).filter(id=>id!=='none');N0.applyProfile(pickR(ids));N0.P.pal='src';}
  if(S.sel!=null)refreshInspector();bump();
}
function autoTick(t,dt){
  if(!AUTO.on)return;
  const playing=!AU.demo&&AU.el&&!AU.el.paused||AU.mic;
  if(playing){const b=AU.beats||0;if(b-AUTO.last>=AUTO.every){AUTO.last=b;autoStep();}}
  else{AUTO.tAcc+=dt;if(AUTO.tAcc>AUTO.every*.5){AUTO.tAcc=0;autoStep();}}
  if(AUTO.cam&&AUTO.dist&&!S.rest){const off=camera.position.clone().sub(controls.target),l=off.length();if(Math.abs(l-AUTO.dist)>.02){off.setLength(l+(AUTO.dist-l)*Math.min(1,dt*.8));camera.position.copy(controls.target).add(off);}}
}
function av3Tick(t,dt){
  const need=AUTO.on||S.objs.some(o=>o.kind==='viz'||(o.fx&&o.fx.some(s=>s.id)));
  if(!need)return;
  auFrame(t,dt);sigUpdate(t,dt);
  for(const o of S.objs)if(o.kind==='viz'&&o.vis)vizUpdate(o,t,dt);
  fxApplyPatches();fxTick(t,dt);autoTick(t,dt);
}
function fxInspector(o){
  const r=sec(inspEl,'Effects',o.fx&&o.fx.some(s=>s.id)?'on':'');fxEnsure(o);
  o.fx.forEach((s,i)=>{
    const row=el('div','row');const sel=el('select','field');sel.innerHTML='<option value="">None</option>'+FX3.filter(e=>o.kind==='splat'?e[2]==='x':true).map(e=>`<option value="${e[0]}">${e[1]}${e[2]==='d'?' (deform)':''}</option>`).join('');
    sel.value=s.id;sel.addEventListener('change',()=>{s.id=sel.value;o._base=null;fxApplyPatches();refreshInspector();});row.appendChild(sel);
    const src=el('select','field');src.innerHTML=FXSRC.map(q=>`<option value="${q[0]}">${q[1]}</option>`).join('');src.value=s.src;src.addEventListener('change',()=>{s.src=src.value;});row.appendChild(src);r.appendChild(row);
    if(s.id){sliderRow(r,'Amount',()=>s.amt,v=>{s.amt=v;},0,1,.01);sliderRow(r,'Speed',()=>s.speed,v=>{s.speed=v;},.1,4,.05);}
  });
  const c=el('div','chips');c.append(btn('Randomise','pri',()=>{fxRandomise(o,3);refreshInspector();}),btn('Clear','',()=>{fxClear(o);refreshInspector();}));r.appendChild(c);
  r.appendChild(el('div','note','Motion effects move the object. Deform effects bend the surface in Shaded view. Pick an audio source to make an effect follow the music, or Always to run it on its own.'));
}
function autoPanel(p){
  const a=sec(p,'Auto');
  const on=btn(AUTO.on?'Auto on':'Auto off','pri',()=>{AUTO.on=!AUTO.on;AUTO.last=AU.beats||0;if(!AUTO.on){controls.autoRotate=false;S.spin=false;}on.textContent=AUTO.on?'Auto on':'Auto off';on.setAttribute('aria-pressed',AUTO.on);bump();});on.setAttribute('aria-pressed',AUTO.on);
  const top=el('div','chips');top.appendChild(on);top.appendChild(btn('Next now','',()=>autoStep()));a.appendChild(top);
  chipRow(a,[['4','Every 4 beats'],['8','8 beats'],['16','16 beats'],['32','32 beats']],v=>String(AUTO.every)===v,v=>{AUTO.every=+v;});
  const tg=(label,key)=>{const b=el('button','chip',label);b.setAttribute('aria-pressed',AUTO[key]);b.addEventListener('click',()=>{AUTO[key]=!AUTO[key];b.setAttribute('aria-pressed',AUTO[key]);});return b;};
  const row=el('div','chips');row.append(tg('Visualizer','viz'),tg('Effects','fx'),tg('Camera','cam'),tg('Look','look'));a.appendChild(row);
  a.appendChild(el('div','note','On the beat of the song (or every few seconds with no audio) Auto switches visualizer modes, re-rolls the effects on every object, moves the camera and can swap the look.'));
}

/* ---------- importers ---------- */
const manager=new THREE.LoadingManager();
const fileMap=new Map();
manager.setURLModifier(u=>{const n=decodeURIComponent(u.split('?')[0].split('/').pop());return fileMap.get(n)||u;});
const draco=new DRACOLoader(manager);draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/draco/gltf/');
const gltfLoader=new GLTFLoader(manager);gltfLoader.setDRACOLoader(draco);gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const extOf=n=>(n.split('.').pop()||'').toLowerCase();
const baseName=n=>n.replace(/\.[^.]+$/,'');
function prepMesh(root){root.traverse(o=>{if(o.isMesh){if(o.geometry&&!o.geometry.attributes.normal)o.geometry.computeVertexNormals();o.userData._mat=o.material;}});}
let sparkMod=null,spark=null;
async function ensureSpark(){
  if(!sparkMod)sparkMod=await import('@sparkjsdev/spark');
  if(!spark){spark=new sparkMod.SparkRenderer({renderer});scene.add(spark);}
  return sparkMod;
}
async function addSplat(buf,name){
  const {SplatMesh}=await ensureSpark();
  const m=new SplatMesh({fileBytes:buf,fileName:name});
  await m.initialized;
  m.quaternion.set(1,0,0,0);m.updateMatrix();
  let box=null;try{box=m.getBoundingBox(true).applyMatrix4(m.matrix);}catch(e){}
  if(box&&box.isEmpty())box=null;
  return registerObject(baseName(name),m,'splat',{box,size:2.2});
}
function is3dgsPly(buf){
  const head=new TextDecoder().decode(new Uint8Array(buf,0,Math.min(buf.byteLength,4096)));
  return head.includes('f_dc_0')||head.includes('scale_0');
}
async function importOne(f){
  const ext=extOf(f.name),type=f.type||'';
  if(ext==='zip'||type==='application/zip'){try{const x=await loadProject(new Uint8Array(await f.arrayBuffer()));toast('Opened project: '+x.count+' object'+(x.count>1?'s':''));}catch(e){toast(String(e.message||e),5000);}return;}
  if(type.startsWith('video/')||['mp4','mov','webm','m4v'].includes(ext)){openScan('video',f);return;}
  if(type.startsWith('audio/')||['mp3','wav','m4a','ogg','flac','aac','opus'].includes(ext)){await loadAudio(f);if(!S.objs.some(x=>x.kind==='viz'))addViz('waterfall');setTab('scene');toast('Playing '+f.name);return;}
  if(type.startsWith('image/')||['png','jpg','jpeg','webp','gif','bmp','avif'].includes(ext)){await photoToRelief(f);return;}
  toast('Loading '+f.name+' …',8000);
  const buf=await f.arrayBuffer();
  if(ext==='glb'||ext==='gltf'){
    const g=await new Promise((res,rej)=>gltfLoader.parse(ext==='gltf'?new TextDecoder().decode(buf):buf,'',res,rej));
    const root=g.scene||g.scenes[0];prepMesh(root);
    registerObject(baseName(f.name),root,'mesh');
  }else if(ext==='obj'){
    const L=new OBJLoader(manager);
    const mtlName=baseName(f.name)+'.mtl';
    if(fileMap.has(mtlName)){try{const t=await (await fetch(fileMap.get(mtlName))).text();const mats=new MTLLoader(manager).parse(t,'');mats.preload();L.setMaterials(mats);}catch(e){console.warn(e);}}
    const root=L.parse(new TextDecoder().decode(buf));
    root.traverse(o=>{if(o.isMesh&&(!o.material||!o.material.map)&&!fileMap.has(mtlName))o.material=new THREE.MeshStandardMaterial({color:0xcfcac2,roughness:.6});});
    prepMesh(root);registerObject(baseName(f.name),root,'mesh');
  }else if(ext==='stl'){
    const g=new STLLoader().parse(buf);g.computeVertexNormals();
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:g.attributes.color?0xffffff:0xcfcac2,roughness:.55,metalness:.1,vertexColors:!!g.attributes.color}));
    registerObject(baseName(f.name),m,'mesh');
  }else if(ext==='ply'){
    if(is3dgsPly(buf)){await addSplat(buf,f.name);}
    else{
      const g=new PLYLoader().parse(buf);
      if(g.index||g.getIndex&&g.getIndex()){g.computeVertexNormals();
        registerObject(baseName(f.name),new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:g.attributes.color?0xffffff:0xcfcac2,roughness:.6,vertexColors:!!g.attributes.color,side:THREE.DoubleSide})),'mesh');
      }else{
        registerObject(baseName(f.name),new THREE.Points(g,new THREE.PointsMaterial({size:.012,sizeAttenuation:true,vertexColors:!!g.attributes.color,color:g.attributes.color?0xffffff:0xe8e6e1})),'points',{});
      }
    }
  }else if(['splat','spz','ksplat','sog'].includes(ext)){
    await addSplat(buf,f.name);
  }else if(ext==='fbx'||ext==='usdz'||ext==='dae'||ext==='3ds'){
    toast('Convert '+ext.toUpperCase()+' to GLB first (Blender, or any online converter).');return;
  }else{toast('Unsupported file: '+f.name);return;}
  toast('Imported '+f.name);
}
async function importFiles(list){
  const files=[...list];if(!files.length)return;
  if(files.length===1&&/\.n0form$/i.test(files[0].name)){await importFormFile(files[0]);return;}
  if(WORLD_ON&&files.length===1&&/\.(n0world|json)$/i.test(files[0].name)){
    try{
      const head=new Uint8Array(await files[0].slice(0,2).arrayBuffer());
      if(head[0]===0x50&&head[1]===0x4b){ // a package: world.json plus assets
        if(files[0].size>WLIM.zip)throw new Error('That package is larger than '+(WLIM.zip/1048576)+' MB.');
        const F=zipRead(new Uint8Array(await files[0].arrayBuffer()));if(!F['world.json'])throw new Error('That package has no world.json in it.');
        worldImportSheet(new TextDecoder().decode(F['world.json']));return;}
      const t=await readCapped(files[0],WLIM.json);if(/n0ise-world/.test(t)){worldImportSheet(t);return;}
    }catch(e){toast(String(e.message||e),5000);return;}
  }
  fileMap.clear();
  const hasContainer=files.some(f=>/\.(gltf|obj)$/i.test(f.name));
  const main=[];
  for(const f of files){
    const ext=extOf(f.name);
    if(ext==='bin'||ext==='mtl'||(hasContainer&&/\.(png|jpe?g|webp|ktx2)$/i.test(f.name)))fileMap.set(f.name,URL.createObjectURL(f));
    else main.push(f);
  }
  for(const f of main){try{await importOne(f);}catch(e){console.error(e);toast('Couldn’t read '+f.name+': '+(e.message||e).toString().slice(0,80),5000);}}
}

/* ---------- picking ---------- */
const ray=new THREE.Raycaster();let downAt=null;
canvas.addEventListener('pointerdown',e=>{downAt={x:e.clientX,y:e.clientY,t:performance.now()};});
canvas.addEventListener('pointerup',e=>{
  if(!downAt)return;const d=Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y),dt=performance.now()-downAt.t;downAt=null;
  if(d>6||dt>400||tc.dragging)return;
  const r=canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1)),camera);
  const hits=ray.intersectObjects(S.objs.filter(o=>o.vis).map(o=>o.holder),true);
  if(hits.length){let n=hits[0].object;while(n&&n.userData.objId==null)n=n.parent;if(n)selectObj(n.userData.objId);}
  else if(S.sel!=null)selectObj(null);
});

/* ---------- composite (mask + amount) ---------- */
let compProg=null;
/* ---------- n0ise effect stack (index.html, embedded) ----------
   The page runs hidden in an iframe. Each frame the scene colour is copied into a canvas, the stack renders it, and the result is
   composited through the same mask as the built-in look (selected object / depth band / edges), so the background stays solid. */
const FXE={frame:null,iw:null,src:document.createElement('canvas'),tex:null,ready:false};
function fxLoad(){
  if(FXE.frame)return;const f=document.getElementById('fxif');FXE.frame=f;
  f.addEventListener('load',()=>{FXE.iw=f.contentWindow;setTimeout(()=>{if(S.engine==='stack')rebuildLook();},1500);});f.src='effects.html?embed=1';
}
function fxOpen(){fxLoad();document.getElementById('fxov').classList.remove('bg');bump();}
function fxClose(){document.getElementById('fxov').classList.add('bg');bump();}
document.getElementById('fxdone').addEventListener('click',fxClose);
function fxReady(){const w=FXE.iw;return !!(w&&w.__embedRender&&w.__embedReady&&w.__embedReady());}
function fxRender(cTex,t,dt){
  const w=FXE.iw;w.__noHwText=!S.hwText;FXE.src.width=curW;FXE.src.height=curH;
  N0.blit(cTex);const g=FXE.src.getContext('2d');g.drawImage(canvas,0,0,curW,curH);
  const out=w.__embedRender(FXE.src,curW,curH,t,dt);if(!out)return null;
  if(!FXE.tex){FXE.tex=gl.createTexture();}
  gl.bindTexture(gl.TEXTURE_2D,FXE.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,out);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return FXE.tex;
}
function fxRenderObj(cTex,id,json,live,t,dt){
  const w=FXE.iw;if(!w||!w.__embedRenderObj)return null;w.__noHwText=!S.hwText;FXE.src.width=curW;FXE.src.height=curH;
  N0.blit(cTex);const g=FXE.src.getContext('2d');g.drawImage(canvas,0,0,curW,curH);
  const out=w.__embedRenderObj(id,json,live,FXE.src,curW,curH,t,dt);if(!out)return null;
  if(!FXE.tex){FXE.tex=gl.createTexture();}
  gl.bindTexture(gl.TEXTURE_2D,FXE.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,out);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return FXE.tex;
}
function ensureComp(){
  if(compProg)return;
  compProg=N0.GLH.mkProg(N0.GLH.HEAD+`
uniform sampler2D uO,uF,uD,uM;
uniform float uMode,uAmt,uFocus,uRange,uSoft,uInv,uCamN,uCamF,uHasD,uMA;
uniform vec2 uPx;
float lin(float d){return uCamN*uCamF/(uCamF-d*(uCamF-uCamN));}
void main(){
  vec3 o3=texture(uO,vUv).rgb,f3=texture(uF,vUv).rgb;
  float m=1.;
  if(uMode>.5&&uMode<1.5){float z=lin(texture(uD,vUv).r);m=1.-smoothstep(uRange,uRange+uSoft,abs(z-uFocus));}
  else if(uMode>1.5&&uMode<2.5){
    vec4 q=texture(uM,vUv);m=uMA>.5?q.a:q.r;
    // one pixel of growth and a soft edge, so no fringe of the original shows around the object
    float n=0.;for(int i=0;i<4;i++){vec2 d=i==0?vec2(uPx.x,0.):i==1?vec2(-uPx.x,0.):i==2?vec2(0.,uPx.y):vec2(0.,-uPx.y);vec4 r=texture(uM,vUv+d);n=max(n,uMA>.5?r.a:r.r);}
    m=max(m,n*.65);
  }
  else if(uMode>3.5){float l=dot(o3,vec3(.2126,.7152,.0722));m=smoothstep(.42,.82,l);}
  else if(uMode>2.5){
    float z0=lin(texture(uD,vUv).r);
    float e=max(max(abs(lin(texture(uD,vUv+vec2(uPx.x,0.)).r)-z0),abs(lin(texture(uD,vUv-vec2(uPx.x,0.)).r)-z0)),max(abs(lin(texture(uD,vUv+vec2(0.,uPx.y)).r)-z0),abs(lin(texture(uD,vUv-vec2(0.,uPx.y)).r)-z0)));
    m=smoothstep(.01,.01+uSoft*.1,e/max(z0,.001));
  }
  if(uInv>.5)m=1.-m;
  o=vec4(mix(o3,f3,clamp(m*uAmt,0.,1.)),1.);
}`);
}
const selMat=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
const skyMat=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthTest:false,depthWrite:false,fog:false});
const blkMat=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.DoubleSide});
/* the sky's mask: white wherever no object is. Everything solid draws black over it, the sky dome (or the empty background) is the white. */
function renderGroundMask(){
  S.maskA=0;const gv=grid.visible,sbv=selBox?selBox.visible:false,tv=tcHelper.visible;
  grid.visible=false;if(selBox)selBox.visible=false;tcHelper.visible=false;
  const envOld=scene.environment,fogOld=scene.fog;scene.environment=null;scene.fog=null;LGT.skyVis(false);
  const swaps=[];
  scene.traverseVisible(n=>{if(!n.isMesh||n.isSplatMesh)return;swaps.push([n,n.material]);const mm=n.userData.maskMat;n.material=n.userData.ground?selMat:(mm?mm.blk:blkMat);});
  renderer.setRenderTarget(maskRT);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,camera);
  swaps.forEach(([n,m])=>{n.material=m;});
  grid.visible=gv;if(selBox)selBox.visible=sbv;tcHelper.visible=tv;scene.environment=envOld;scene.fog=fogOld;LGT.skyVis(true);
  return true;
}
function renderSkyMask(){
  S.maskA=0;const gv=grid.visible,sbv=selBox?selBox.visible:false,tv=tcHelper.visible;
  grid.visible=false;if(selBox)selBox.visible=false;tcHelper.visible=false;
  const bgOld=scene.background,envOld=scene.environment,fogOld=scene.fog;scene.environment=null;scene.fog=null;
  const sm=LGT.skyMesh(),swaps=[];
  scene.traverseVisible(n=>{
    if(!n.isMesh||n.isSplatMesh)return;
    swaps.push([n,n.material]);n.material=n===sm?skyMat:(n.userData.maskMat?n.userData.maskMat.blk:blkMat);
  });
  renderer.setRenderTarget(maskRT);renderer.setClearColor(0xffffff,1);renderer.clear();renderer.render(scene,camera);
  swaps.forEach(([n,m])=>{n.material=m;});
  scene.environment=envOld;scene.background=bgOld;scene.fog=fogOld;grid.visible=gv;if(selBox)selBox.visible=sbv;tcHelper.visible=tv;
  return true;
}
/* mask of the look target. Meshes: the target draws white and everything else draws black into the same depth buffer, so an object in
   front of the target hides it and the look can never show through. Splats can't take a material: their own alpha is the mask. */
function renderSelMask(oo){
  const o=oo||objById(S.fxTarget!=null?S.fxTarget:S.sel);if(!o||!maskRT){if(maskRT){renderer.setRenderTarget(maskRT);renderer.setClearColor(0x000000,0);renderer.clear();}S.maskA=0;return false;}
  if(o===SKY)return renderSkyMask();
  if(o===LIGHTO){S.maskA=0;renderer.setRenderTarget(maskRT);renderer.setClearColor(0x000000,0);renderer.clear();return true;} // the lighting mask is computed from the picture's brightness in the composite
  if(o===GROUNDO)return renderGroundMask();
  const isSp=o.kind==='splat'||(o.meta&&o.meta.mode==='splats');S.maskA=isSp?1:0;
  const vis=S.objs.map(x=>x.holder.visible);
  if(isSp)S.objs.forEach(x=>{x.holder.visible=x===o&&x.vis;});
  const gv=grid.visible,sbv=selBox?selBox.visible:false,tv=tcHelper.visible;
  grid.visible=false;if(selBox)selBox.visible=false;tcHelper.visible=false;
  const bgOld=scene.background,envOld=scene.environment,fogOld=scene.fog;scene.environment=null;scene.fog=null;LGT.skyVis(false);
  const swaps=[];
  if(!isSp)scene.traverseVisible(n=>{
    if(!n.isMesh||n.isSplatMesh)return;let p=n,mine=false;while(p){if(p===o.holder){mine=true;break;}p=p.parent;}
    swaps.push([n,n.material]);const mm=n.userData.maskMat;n.material=mine?(mm?mm.sel:selMat):(mm?mm.blk:blkMat);
  });
  renderer.setRenderTarget(maskRT);renderer.setClearColor(0x000000,isSp?0:1);renderer.clear();renderer.render(scene,camera);
  swaps.forEach(([n,m])=>{n.material=m;});LGT.skyVis(true);
  scene.environment=envOld;scene.background=bgOld;scene.fog=fogOld;
  S.objs.forEach((x,i)=>{x.holder.visible=vis[i];});grid.visible=gv;if(selBox)selBox.visible=sbv;tcHelper.visible=tv;
  return true;
}

/* ---- per-object looks (CRT Lab engine): each object can carry its own look. Picking an object loads its look into the controls,
   editing writes it back, and every looked object is rendered and composited through its own mask. ---- */
const cloneP=()=>JSON.parse(JSON.stringify(N0.P));
let lookRT=[null,null],lookRTkey='';
/* hardware profiles carry a text readout (REC, timestamps, terminal text). It is off by default; the look itself is untouched. */
function renderFx(base,t,dt,live){const k=N0.P.ton;if(!S.hwText)N0.P.ton=false;try{return N0.render(base,t,dt,live);}finally{N0.P.ton=k;}}
function lookObjs(){return [...PSEUDO,...S.objs].filter(o=>o.look&&o.vis!==false&&o.holder.visible);}
function stackObjs(){return [...PSEUDO,...S.objs].filter(o=>o.stack&&o.vis!==false&&o.holder.visible);}
/* Per-object appearance. Every object keeps its own hardware look (CRT engine) or effect stack. Picking an object saves the one you
   were editing back to it and loads the new one's. An object with nothing yet keeps the current controls as a starting point, and the
   first change you make to them gives it its own copy. Nothing is shared by reference. */
const apprKey=()=>S.engine==='stack'?'stack':'look';
const apprGet=()=>{if(S.engine==='stack'){const w=FXE.iw;return w&&w.__embedGet?w.__embedGet():null;}return JSON.stringify(N0.P);};
function apprStore(o){const g=apprGet();if(g==null)return;o[apprKey()]=apprKey()==='look'?JSON.parse(g):g;}
function apprLoad(o){
  if(S.engine==='stack'){const w=FXE.iw;if(w&&w.__embedLoad&&o.stack)w.__embedLoad(o.stack);}
  else if(o.look){Object.assign(N0.P,JSON.parse(JSON.stringify(o.look)));if(typeof rebuildLook==='function'&&paneEls&&paneEls.look)rebuildLook();}
}
function lookSwitch(prevId,id){
  if(prevId===id||S.mask.mode!==2)return;
  const key=apprKey(),pv=objById(prevId),nx=objById(id);
  if(pv&&pv[key])apprStore(pv);
  if(nx&&nx[key])apprLoad(nx);
  S.apprSnap=apprGet();updateLookUI();
}
/* a change made by hand to the controls while an object with no look is picked gives that object its own look */
function apprWatch(){
  if(!S.fx||S.mask.mode!==2||performance.now()-(S.apprTouch||0)>2500)return;
  const key=apprKey(),o=objById(S.fxTarget!=null?S.fxTarget:S.sel);if(!o||o[key])return;
  const g=apprGet();if(g==null||g===S.apprSnap)return;
  o[key]=key==='look'?JSON.parse(g):g;S.apprSnap=g;S.lookOff=false;updateLookUI();toast((key==='look'?'Hardware look':'Effects')+' set on '+o.name);
}
function addStack(o){const w=FXE.iw;if(!o||!w||!w.__embedGet){toast('The effect engine is still loading.');return;}S.fx=true;S.mask.mode=2;o.stack=w.__embedGet();S.apprSnap=o.stack;bump();updateLookUI();toast('Effects added to '+o.name);}
function removeStack(o){if(!o)return;delete o.stack;if(FXE.iw&&FXE.iw.__embedDrop)FXE.iw.__embedDrop(o.id);bump();updateLookUI();toast('Effects removed from '+o.name);}
function addLook(o){if(!o)return;S.lookOff=false;o.look=cloneP();S.apprSnap=apprGet();S.fx=true;S.mask.mode=2;bump();updateLookUI();toast('Look added to '+o.name);}
function removeLook(o){if(!o)return;delete o.look;S.lookOff=true;bump();updateLookUI();toast('Look removed from '+o.name);}
let lookUI=null;
function pickSky(id){
  id=typeof id==='string'?id:'sky';const po=objById(id);
  lookSwitch(S.fxTarget,id);S.fxTarget=id;S.sel=null;S.fx=true;S.mask.mode=2;
  if(tc.object)tc.detach();setSelBox();renderObjList&&renderObjList();refreshInspector&&refreshInspector();updateLookUI();bump();
  toast('Editing the '+po.name.toLowerCase()+'. Change the controls, then press Add look.');
}
function updateLookUI(){try{paintBadge();}catch(e){}if(!lookUI)return;const st=S.engine==='stack',key=st?'stack':'look',o=objById(S.fxTarget!=null?S.fxTarget:S.sel),n=S.objs.filter(x=>x[key]).length;
  lookUI.name.textContent=o?o.name:'Nothing picked';lookUI.add.textContent=o&&o[key]?(st?'Update effects':'Update look'):(st?'Add effects':'Add look');lookUI.add.disabled=!o;lookUI.rm.textContent=st?'Remove effects':'Remove look';lookUI.rm.hidden=!(o&&o[key]);
  lookUI.cnt.textContent=n?n+(n===1?' object has ':' objects have ')+(st?'effects':'a look'):'No object has '+(st?'effects':'a look')+' yet';}
/* the character takes on the world's look and keeps it: while it has no look of its own choosing (fxAuto), it copies the look of the object
   being edited (or the first other one that has one) every few frames, so changing the hardware profile changes the character too.
   Picking the character and changing its controls gives it its own look and it stops following. */
function followPlayer(eo){
  const pl=S.objs.find(x=>x.meta&&x.meta.player);if(!pl||!pl.meta.fxAuto)return;
  const key=apprKey();
  if(eo===pl){if(pl[key]&&pl.meta.fxSnap&&JSON.stringify(pl[key])!==pl.meta.fxSnap)pl.meta.fxAuto=false;return;}
  const src=eo&&!PSEUDO.includes(eo)&&eo[key]?eo:S.objs.find(x=>x!==pl&&x[key]);if(!src)return;
  pl[key]=key==='look'?JSON.parse(JSON.stringify(src.look)):src.stack;pl.meta.fxSnap=JSON.stringify(pl[key]);
}
function drawLooks(cTex,t,dt,live,LO){
  ensureComp();const G=N0.GLH,W=canvas.width,H=canvas.height,key=W+'x'+H;
  if(lookRTkey!==key){lookRT.forEach(r=>r&&G.freeRT(r));lookRT=[G.mkRT(W,H),G.mkRT(W,H)];lookRTkey=key;}
  const keep=cloneP();let base=cTex,wasT=S.fxTarget;
  LO.forEach((o,i)=>{
    Object.assign(N0.P,o.look);renderSelMask(o);
    const fx=renderFx(base,t,dt,live),last=i===LO.length-1,dst=last?null:lookRT[i%2],p=compProg;
    renderer.setRenderTarget(null);
    gl.bindVertexArray(G.vao);G.bindRT(dst);if(!dst)gl.viewport(0,0,W,H);p.use();
    G.samp(p,'uO',0,base);G.samp(p,'uF',1,fx);G.samp(p,'uD',2,rtTex(rt.depthTexture));G.samp(p,'uM',3,rtTex(maskRT.texture));
    p.f('uMode',o===LIGHTO?4:2);p.f('uAmt',S.mask.amt);p.f('uFocus',0);p.f('uRange',1);p.f('uSoft',.1);p.f('uInv',S.mask.inv?1:0);p.f('uMA',S.maskA||0);p.f('uCamN',camera.near);p.f('uCamF',camera.far);p.v2('uPx',1/curW,1/curH);
    G.draw();gl.bindVertexArray(null);gl.useProgram(null);renderer.resetState(); // raw GL above leaves state three has cached; the next object's mask render needs it clean
    if(dst)base=dst.tex;
  });
  Object.assign(N0.P,keep);S.fxTarget=wasT;
}
function drawStackLooks(cTex,t,dt,SO){
  ensureComp();const G=N0.GLH,W=canvas.width,H=canvas.height,key=W+'x'+H,w=FXE.iw;
  if(lookRTkey!==key){lookRT.forEach(r=>r&&G.freeRT(r));lookRT=[G.mkRT(W,H),G.mkRT(W,H)];lookRTkey=key;}
  const tgt=objById(S.fxTarget!=null?S.fxTarget:S.sel);
  if(tgt&&tgt.stack&&frames%6===0)tgt.stack=w.__embedGet();
  let base=cTex;const p=compProg;
  SO.forEach((o,i)=>{
    renderSelMask(o);
    const fx=fxRenderObj(base,o.id,o.stack,!!tgt&&o===tgt,t,dt);if(!fx)return;
    const last=i===SO.length-1,dst=last?null:lookRT[i%2];
    renderer.setRenderTarget(null);
    gl.bindVertexArray(G.vao);G.bindRT(dst);if(!dst)gl.viewport(0,0,W,H);p.use();
    G.samp(p,'uO',0,base);G.samp(p,'uF',1,fx);G.samp(p,'uD',2,rtTex(rt.depthTexture));G.samp(p,'uM',3,rtTex(maskRT.texture));
    p.f('uMode',o===LIGHTO?4:2);p.f('uAmt',S.mask.amt);p.f('uFocus',0);p.f('uRange',1);p.f('uSoft',.1);p.f('uInv',S.mask.inv?1:0);p.f('uMA',S.maskA||0);p.f('uCamN',camera.near);p.f('uCamF',camera.far);p.v2('uPx',1/curW,1/curH);
    G.draw();gl.bindVertexArray(null);gl.useProgram(null);renderer.resetState(); // raw GL above leaves state three has cached; the next object's mask render needs it clean
    if(dst)base=dst.tex;else base=null;
  });
  if(base)N0.blit(base);
}
function updateFxNote(){const n=$('#fxnote');if(!n)return;const o=objById(S.fxTarget!=null?S.fxTarget:S.sel);
  const t=!S.fx||S.hold?'':S.mask.mode===2?(o?'Look on: '+o.name:'Look on: nothing selected. Tap an object.'):'';if(n.textContent!==t)n.textContent=t;}
const rtTex=t=>renderer.properties.get(t).__webglTexture;

/* ---------- main loop ---------- */
let lastT=0,errN=0,frames=0;const hudLift=document.getElementById('hudBL'),hudLift2=document.getElementById('hudBR');
const bgCol=new THREE.Color();
function frame(ts){
  requestAnimationFrame(frame);
  if(!renderer||document.hidden)return;
  const t=ts/1000,dt=clamp(t-lastT,.001,.1);lastT=t;
  try{
    sheet.update(dt);
    if(needResize)resize();
    if(!rt)return;
    applyViewOffset();
    if(S.needFrame){S.needFrame=false;frameAll();}
    const lift=Math.round(sheet.coverPx());if(lift!==S._lift){S._lift=lift;hudLift.style.transform=`translate3d(0,${-lift}px,0)`;hudLift2.style.transform=`translate3d(0,${-lift}px,0)`;try{bar.style.transform=`translate3d(-50%,${-lift}px,0)`;}catch(e){}}
    if(S.rest)restTick();
    av3Tick(t,dt);
    animTick(t);
    controls.autoRotate=S.spin;if(S.spin)bump();
    if(typeof sim!=='undefined')sim.tick(dt);
    if(S.walk)walk.tick(dt);else controls.update(dt);
    if(NW)NW.tick(dt);
    if(FORM)FORM.tick(t);
    if(MECH)MECH.tick(dt);
    if(RAG){if(RAG.active&&!walk.on)RAG.stop('exit');else RAG.tick(dt);}
    if(selBox)selBox.update();
    grid.visible=S.grid&&!S.exporting&&!S.walk;
    if(selBox)selBox.visible=!S.exporting&&S.sel!=null&&!S.walk;
    tcHelper.visible=!S.exporting&&!S.walk&&!!(S.gizmo||S.pivot)&&S.sel!=null;
    /* anything that changes the picture without a bump() (visualizers, physics, spin, walking, recording, auto mode, breathing reliefs) must also
       invalidate the cached look frame, otherwise the effect keeps showing the first baked frame */
    SURF.tick(t);MAT.tick(t);LGT.tick(t,dt);
    S.animating=!!(SURF.any()||S.walk||S.spin||(typeof sim!=='undefined'&&sim.playing)||(typeof stRec!=='undefined'&&stRec.state==='recording')||AUTO.on||S.objs.some(o=>(o.kind==='viz'&&o.vis)||(o.kind==='relief'&&o.meta&&(o.meta.breathe||o.meta.furMats))));
    if(S.animating){S.ver++;N0.SRC.ver=S.ver;S.liveUntil=performance.now()+120;}
    bgCol.set(S.bg);
    renderer.setRenderTarget(rt);renderer.setClearColor(bgCol,1);renderer.clear();renderer.render(scene,camera);
    const wantMask=S.fx&&!S.hold&&S.mask.mode===2&&!(S.engine!=='stack'&&anyLook());
    if(wantMask)renderSelMask();
    renderer.setRenderTarget(null);
    const cTex=rtTex(rt.texture);
    const LO=S.fx&&!S.hold&&S.mask.mode===2&&S.engine!=='stack'?lookObjs():[];
    const SO=S.fx&&!S.hold&&S.mask.mode===2&&S.engine==='stack'&&fxReady()?stackObjs():[];
    if(SO.length){if(frames%6===0)followPlayer(objById(S.fxTarget));drawStackLooks(cTex,t,dt,SO);}
    else if(LO.length){
      const eo=objById(S.fxTarget);if(eo&&eo.look&&frames%6===0)eo.look=cloneP();
      if(frames%6===0)followPlayer(eo);
      drawLooks(cTex,t,dt,performance.now()<S.liveUntil,LO);
    }else if(S.fx&&!S.hold&&!(S.mask.mode===2&&S.engine!=='stack')){
      const live=performance.now()<S.liveUntil;
      let fxTex=null;
      if(S.engine==='stack'){if(fxReady()){fxTex=fxRender(cTex,t,dt);}}
      if(!fxTex)fxTex=renderFx(cTex,t,dt,live);
      ensureComp();
      const G=N0.GLH,p=compProg;
      gl.bindVertexArray(G.vao);G.bindRT(null);gl.viewport(0,0,canvas.width,canvas.height);p.use();
      G.samp(p,'uO',0,cTex);G.samp(p,'uF',1,fxTex);G.samp(p,'uD',2,rtTex(rt.depthTexture));G.samp(p,'uM',3,rtTex(maskRT.texture));
      p.f('uMode',S.mask.mode);p.f('uAmt',S.mask.amt);p.f('uFocus',S.mask.focus);p.f('uRange',S.mask.range);p.f('uSoft',Math.max(.001,S.mask.soft));
      p.f('uInv',S.mask.inv?1:0);p.f('uMA',S.maskA||0);p.f('uCamN',camera.near);p.f('uCamF',camera.far);p.v2('uPx',1/curW,1/curH);
      G.draw();gl.bindVertexArray(null);gl.useProgram(null);
    }else{
      gl.viewport(0,0,canvas.width,canvas.height);N0.blit(cTex);
    }
    renderer.resetState();
    if(!S.exporting&&stRec.state!=='recording'&&(tcHelper.visible||(selBox&&selBox.visible))){const ac=renderer.autoClear;renderer.setRenderTarget(null);renderer.autoClear=false;renderer.clearDepth();renderer.render(overlay,camera);renderer.autoClear=ac;renderer.resetState();}
    if(stRec.state==='recording'||stRec.state==='arming')stRec.frame();
    frames++;errN=0;if(frames%15===0)updateFxNote();if(frames%6===0)apprWatch();
  }catch(e){
    console.error(e);errN++;
    if(errN===3)noGL('Rendering stopped: '+String(e.message||e).slice(0,200)+' — reload to try again.');
    try{renderer.resetState();}catch(_){}
  }
}
function boot3d(){
  if(!renderer)return;
  setupEnv();
  N0.attach(gl,canvas);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();noGL('The graphics context was lost. Reload to continue.');});
  requestAnimationFrame(frame);
}

function studioDefaults(){
  N0.applyProfile('studio');
  Object.assign(N0.P,{pal:'src',depth:8,dstr:80,method:'blue',px:2,quality:'0.8',scan:38,mstr:30,curv:14,corner:8,bloom:26,hal:12,vig:28,refl:8,glare:6,snr:3,jit:2,bez:0,mpitch:3});
}

/* =====================================================================
   n0ise studio — scans: photo relief, turntable carving, depth scan
   ===================================================================== */

/* ---------- photo → relief ---------- */
function blurPlane(a,w,h,r){
  r=Math.round(r);if(r<1)return a;
  const t=new Float32Array(a.length),k=2*r+1,o=new Float32Array(a.length);
  for(let y=0;y<h;y++){let s=0;const b=y*w;for(let i=-r;i<=r;i++)s+=a[b+clamp(i,0,w-1)];
    for(let x=0;x<w;x++){t[b+x]=s/k;s+=a[b+Math.min(w-1,x+r+1)]-a[b+Math.max(0,x-r)];}}
  for(let x=0;x<w;x++){let s=0;for(let i=-r;i<=r;i++)s+=t[clamp(i,0,h-1)*w+x];
    for(let y=0;y<h;y++){o[y*w+x]=s/k;s+=t[Math.min(h-1,y+r+1)*w+x]-t[Math.max(0,y-r)*w+x];}}
  return o;
}
function normalize01(a,lo=.02,hi=.98){
  const s=Float32Array.from(a).sort(),L=s[Math.floor(lo*(s.length-1))],H=s[Math.floor(hi*(s.length-1))],d=Math.max(1e-6,H-L);
  const o=new Float32Array(a.length);for(let i=0;i<a.length;i++)o[i]=clamp((a[i]-L)/d,0,1);return o;
}
/* no-model fallback: smoothed luminance plus a centre prior. Honest label: "quick relief". */
function pseudoDepth(cv){
  const w=cv.width,h=cv.height,d=cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const L=new Float32Array(w*h);
  for(let i=0;i<w*h;i++)L[i]=(.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2])/255;
  const b=blurPlane(L,w,h,Math.max(2,Math.round(Math.min(w,h)*.012)));
  const o=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const cx=(x/w-.5)*1.6,cy=(y/h-.5)*1.6,g=Math.exp(-(cx*cx+cy*cy)*1.4);
    o[y*w+x]=.62*b[y*w+x]+.38*g;
  }
  return normalize01(o);
}
const REST_HFOV=50;
const restD=asp=>(asp/2)/Math.tan(THREE.MathUtils.degToRad(REST_HFOV/2)); // plane distance (plane height = 1) for a 50° horizontal view of the photo
/* push-pull hole fill: colours spread outward from valid pixels through a pyramid (edge-extended, then smooth) */
function pushPull(px,valid,w,h){
  const lv=[];let cw=w,ch=h,col=[new Float32Array(w*h),new Float32Array(w*h),new Float32Array(w*h)],wt=new Float32Array(w*h);
  for(let i=0;i<w*h;i++){wt[i]=valid[i]?1:0;for(let c=0;c<3;c++)col[c][i]=px[i*4+c];}
  lv.push({w:cw,h:ch,col,wt});
  while(cw>2&&ch>2){
    const nw=cw>>1,nh=ch>>1,nc=[new Float32Array(nw*nh),new Float32Array(nw*nh),new Float32Array(nw*nh)],nwt=new Float32Array(nw*nh),L=lv[lv.length-1];
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){let s=0,r=[0,0,0];
      for(let j=0;j<2;j++)for(let i=0;i<2;i++){const q=(2*y+j)*cw+2*x+i,ww=L.wt[q];s+=ww;for(let c=0;c<3;c++)r[c]+=L.col[c][q]*ww;}
      const o=y*nw+x;nwt[o]=s/4;for(let c=0;c<3;c++)nc[c][o]=s>0?r[c]/s:0;}
    cw=nw;ch=nh;lv.push({w:cw,h:ch,col:nc,wt:nwt});
  }
  for(let l=lv.length-2;l>=0;l--){const U=lv[l+1],L=lv[l];
    const up=U.col.map(c=>resizeBilinear(c,U.w,U.h,L.w,L.h)),uw=resizeBilinear(U.wt,U.w,U.h,L.w,L.h);
    for(let i=0;i<L.w*L.h;i++){const ww=Math.min(1,L.wt[i]);
      for(let c=0;c<3;c++)L.col[c][i]=ww*L.col[c][i]+(1-ww)*(uw[i]>0?up[c][i]:L.col[c][i]);
      L.wt[i]=Math.max(L.wt[i],Math.min(1,uw[i]));}
  }
  const out=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++){out[i*4]=lv[0].col[0][i];out[i*4+1]=lv[0].col[1][i];out[i*4+2]=lv[0].col[2][i];out[i*4+3]=255;}
  return out;
}
/* behind-the-subject layers, built at half size and cached until the mask changes */
function ensureLayers(m){
  if(m.layers&&!m.bdDirty)return m.layers;
  const w=Math.max(2,m.w>>1),h=Math.max(2,m.h>>1),n=w*h,mk=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const small=document.createElement('canvas');small.width=w;small.height=h;const sg=small.getContext('2d',{willReadFrequently:true});sg.drawImage(m.canvas,0,0,w,h);
  const px=sg.getImageData(0,0,w,h).data,a=new Float32Array(n);
  if(m.alpha){for(let y=0;y<h;y++)for(let x=0;x<w;x++)a[y*w+x]=m.alpha[Math.min(m.h-1,y*2)*m.w+Math.min(m.w-1,x*2)];}else a.fill(1);
  const L=m.layers||(m.layers={});
  // 1) subject colours extended outward, then softened: the back of a solid, and the fill inside torn areas
  const inside=new Uint8Array(n);for(let i=0;i<n;i++)inside[i]=a[i]>.9?1:0;
  const ext=pushPull(px,inside,w,h),soft=new Float32Array(n*3);
  for(let c=0;c<3;c++){const pl=new Float32Array(n);for(let i=0;i<n;i++)pl[i]=ext[i*4+c];const b=blurPlane(pl,w,h,Math.max(3,Math.round(w/90)));for(let i=0;i<n;i++)soft[i*3+c]=b[i];}
  const mkTex=(cv,old)=>{const t=old||new THREE.CanvasTexture(cv);t.colorSpace=THREE.NoColorSpace;t.needsUpdate=true;return t;};
  const bc=L.backCv||(L.backCv=mk()),bg=bc.getContext('2d'),bi=bg.createImageData(w,h);
  const ea=blurPlane(a,w,h,2);
  for(let i=0;i<n;i++){bi.data[i*4]=soft[i*3];bi.data[i*4+1]=soft[i*3+1];bi.data[i*4+2]=soft[i*3+2];bi.data[i*4+3]=Math.round(a[i]*255);}
  bg.putImageData(bi,0,0);L.backTex=mkTex(bc,L.backTex);
  // fill under the subject (interior only, so the cut-out silhouette stays clean at rest)
  const fc=L.fillCv||(L.fillCv=mk()),fg=fc.getContext('2d'),fi=fg.createImageData(w,h);
  for(let i=0;i<n;i++){fi.data[i*4]=soft[i*3];fi.data[i*4+1]=soft[i*3+1];fi.data[i*4+2]=soft[i*3+2];fi.data[i*4+3]=ea[i]>.97?255:0;}
  fg.putImageData(fi,0,0);L.fillTex=mkTex(fc,L.fillTex);
  // 2) clean background plate for Keep background: the subject area is filled from the surrounding backdrop
  if(m.alpha){
    const dil=blurPlane(a,w,h,Math.max(2,Math.round(w/180))),valid=new Uint8Array(n);for(let i=0;i<n;i++)valid[i]=dil[i]<.01?1:0;
    const raw=pushPull(px,valid,w,h),pc=L.plateCv||(L.plateCv=mk()),pg=pc.getContext('2d');pg.putImageData(new ImageData(raw,w,h),0,0);L.plateTex=mkTex(pc,L.plateTex);
  }
  m.bdDirty=false;return L;
}
function buildReliefGeometry(m){
  const asp=m.w/m.h,cap=(m.hq?420000:150000)/(m.solid?1.9:1);
  const cols=Math.max(16,Math.min(Math.round(m.w/2),Math.floor(Math.sqrt(cap/2*asp)))),rows=Math.max(8,Math.round(cols/asp));
  let dp=m.depth;const dw=m.dw||m.w,dh=m.dh||m.h;
  if(m.smooth>0)dp=blurPlane(dp,dw,dh,m.smooth);
  const sample=(u,v)=>{const x=clamp(u*(dw-1),0,dw-1),y=clamp(v*(dh-1),0,dh-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(dw-1,x0+1),y1=Math.min(dh-1,y0+1),fx=x-x0,fy=y-y0;
    return lerp(lerp(dp[y0*dw+x0],dp[y0*dw+x1],fx),lerp(dp[y1*dw+x0],dp[y1*dw+x1],fx),fy);};
  const D=restD(asp),N=cols*rows,pos=new Float32Array(N*3),uv=new Float32Array(N*2),zv=new Float32Array(N),dsm=new Float32Array(N),av=new Float32Array(N).fill(1),useA=m.alpha&&!m.keepBg;
  const place=(k,u,v,z)=>{const s=m.rest?(D-z)/D:1;return [(u-.5)*asp*s,(.5-v)*s,z];};
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const u=i/(cols-1),v=j/(rows-1),k=j*cols+i;
    let d=sample(u,v);d=Math.pow(Math.max(0,d),m.gamma);d=.5+(d-.5)*(1-m.flat);
    const z=(d-.5)*m.scale,P=place(k,u,v,z);
    zv[k]=z;dsm[k]=d;pos[k*3]=P[0];pos[k*3+1]=P[1];pos[k*3+2]=P[2];
    uv[k*2]=u;uv[k*2+1]=1-v;
    if(useA)av[k]=m.alpha[Math.round(v*(m.h-1))*m.w+Math.round(u*(m.w-1))];
  }
  // cut where the surface would stretch: slope of any edge in the cell above the limit
  const cx=asp/(cols-1),cy=1/(rows-1),cell=(cx+cy)/2,lim=14-12*m.tear,cw=cols-1,ch=rows-1,inc=new Uint8Array(cw*ch);let nInc=0,maxSlope=0;
  for(let j=0;j<ch;j++)for(let i=0;i<cw;i++){
    const a=j*cols+i,b=a+1,c=a+cols,d=c+1;
    const zmx=Math.max(zv[a],zv[b],zv[c],zv[d]),zmn=Math.min(zv[a],zv[b],zv[c],zv[d]),sl=(zmx-zmn)/cell;
    if(sl>lim)continue;
    if(useA&&Math.max(av[a],av[b],av[c],av[d])<.02)continue;
    inc[j*cw+i]=1;nInc++;if(sl>maxSlope)maxSlope=sl;
  }
  const idx=new Uint32Array(nInc*6);let n=0;
  for(let j=0;j<ch;j++)for(let i=0;i<cw;i++){if(!inc[j*cw+i])continue;const a=j*cols+i,b=a+1,c=a+cols,d=c+1;idx[n++]=a;idx[n++]=c;idx[n++]=b;idx[n++]=b;idx[n++]=c;idx[n++]=d;}
  const mkG=(p,u,ix)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('uv',new THREE.BufferAttribute(u,2));g.setIndex(new THREE.BufferAttribute(ix,1));g.computeVertexNormals();return g;};
  const out={g:mkG(pos,uv,idx),cols,rows,tris:n/3,maxSlope,lim,shaped:dsm};
  // solid: mirrored back surface plus side walls, so orbiting past the edge doesn't show an empty shell
  if(m.solid){
    const z0=-m.scale/2-m.thick/2,bp=new Float32Array(2*N*3),bu=new Float32Array(2*N*2);
    for(let k=0;k<N;k++){const u=uv[k*2],v=1-uv[k*2+1],P=place(k,u,v,2*z0-zv[k]);bp[k*3]=P[0];bp[k*3+1]=P[1];bp[k*3+2]=P[2];
      bp[(N+k)*3]=pos[k*3];bp[(N+k)*3+1]=pos[k*3+1];bp[(N+k)*3+2]=pos[k*3+2];bu[k*2]=u;bu[k*2+1]=1-v;bu[(N+k)*2]=uv[k*2];bu[(N+k)*2+1]=uv[k*2+1];}
    const bi=[];
    const has=(i,j)=>i>=0&&j>=0&&i<cw&&j<ch&&inc[j*cw+i];
    for(let j=0;j<ch;j++)for(let i=0;i<cw;i++){if(!inc[j*cw+i])continue;const a=j*cols+i,b=a+1,c=a+cols,d=c+1;bi.push(a,b,c,b,d,c);
      const wall=(p,q)=>{bi.push(p,q,N+p,q,N+q,N+p);};
      if(!has(i,j-1))wall(a,b);if(!has(i,j+1))wall(c,d);if(!has(i-1,j))wall(a,c);if(!has(i+1,j))wall(b,d);}
    out.back=mkG(bp,bu,new Uint32Array(bi));
  }
  // fill behind: a soft copy of the surface set back a little, so torn areas show a plausible surface instead of a hole
  if(m.fill&&!m.solid){
    const bc=Math.min(cols,140),br=Math.max(8,Math.round(bc/asp)),bn=bc*br,fp=new Float32Array(bn*3),fu=new Float32Array(bn*2),fz=new Float32Array(bn);
    const sm=blurPlane(dsm,cols,rows,Math.max(2,Math.round(cols/40)));
    for(let j=0;j<br;j++)for(let i=0;i<bc;i++){const u=i/(bc-1),v=j/(br-1),k=j*bc+i,gx=Math.round(u*(cols-1)),gy=Math.round(v*(rows-1));
      const z=m.keepBg?-m.scale*.5-.015:(sm[gy*cols+gx]-.5)*m.scale-m.scale*.08-.01;fz[k]=z;const P=place(k,u,v,z);
      fp[k*3]=P[0];fp[k*3+1]=P[1];fp[k*3+2]=P[2];fu[k*2]=u;fu[k*2+1]=1-v;}
    const fa=new Float32Array(bn).fill(1);
    if(!m.keepBg&&m.alpha)for(let j=0;j<br;j++)for(let i=0;i<bc;i++)fa[j*bc+i]=m.alpha[Math.round(j/(br-1)*(m.h-1))*m.w+Math.round(i/(bc-1)*(m.w-1))];
    const fi=new Uint32Array((bc-1)*(br-1)*6);let q=0;
    for(let j=0;j<br-1;j++)for(let i=0;i<bc-1;i++){const a=j*bc+i,b=a+1,c=a+bc,d=c+1;
      if(Math.min(fa[a],fa[b],fa[c],fa[d])<.97)continue;   // under the subject only; the silhouette stays clean at rest
      fi[q++]=a;fi[q++]=c;fi[q++]=b;fi[q++]=b;fi[q++]=c;fi[q++]=d;}
    out.fill=mkG(fp,fu,fi.slice(0,q));
  }
  return out;
}
/* tangent-space normals from the shaped depth, so Shading shows pores, creases and hair */
function buildNormalTex(m,shaped,cols,rows){
  const w=Math.min(cols*2,m.w>>1),h=Math.max(2,Math.round(w*m.h/m.w)),dw=m.dw||m.w,dh=m.dh||m.h;
  const dp=blurPlane(m.depth,dw,dh,1),sm=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let d=dp[Math.min(dh-1,Math.round(y/(h-1)*(dh-1)))*dw+Math.min(dw-1,Math.round(x/(w-1)*(dw-1)))];d=Math.pow(Math.max(0,d),m.gamma);sm[y*w+x]=(.5+(d-.5)*(1-m.flat)-.5)*m.scale;}
  const c=m.nmCv||(m.nmCv=document.createElement('canvas'));c.width=w;c.height=h;const g=c.getContext('2d'),im=g.createImageData(w,h),px=1/h,k=m.detail*0+1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const xl=Math.max(0,x-1),xr=Math.min(w-1,x+1),yu=Math.max(0,y-1),yd=Math.min(h-1,y+1);
    const dzx=(sm[y*w+xr]-sm[y*w+xl])/((xr-xl||1)*px),dzy=(sm[yd*w+x]-sm[yu*w+x])/((yd-yu||1)*px);
    let nx=-dzx*k,ny=dzy*k,nz=1;const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
    const o=(y*w+x)*4;im.data[o]=(nx*.5+.5)*255;im.data[o+1]=(ny*.5+.5)*255;im.data[o+2]=(nz*.5+.5)*255;im.data[o+3]=255;}
  g.putImageData(im,0,0);
  if(!m.nmTex){m.nmTex=new THREE.CanvasTexture(c);m.nmTex.colorSpace=THREE.NoColorSpace;m.nmTex.anisotropy=4;}
  m.nmTex.needsUpdate=true;return m.nmTex;
}

/* ---------- photo → Gaussian splats ----------
   One splat per grid cell of the relief (about one per 2 px). Position is the relief vertex (same rest-camera slide, so the photo is
   identical at the rest view), colour is the photo, size is the cell footprint at that depth, the flat axis follows the depth normal,
   opacity is the cut-out alpha. Output is a standard .splat buffer: 32 bytes per splat, y-down like files from other tools. */
function buildSplatBytes(m){
  const asp=m.w/m.h,cap=m.hq?420000:150000;
  const cols=Math.max(16,Math.min(Math.round(m.w/2),Math.floor(Math.sqrt(cap*asp)))),rows=Math.max(8,Math.round(cols/asp));
  let dp=m.depth;const dw=m.dw||m.w,dh=m.dh||m.h;if(m.smooth>0)dp=blurPlane(dp,dw,dh,m.smooth);
  const sample=(u,v)=>{const x=clamp(u*(dw-1),0,dw-1),y=clamp(v*(dh-1),0,dh-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(dw-1,x0+1),y1=Math.min(dh-1,y0+1),fx=x-x0,fy=y-y0;
    return lerp(lerp(dp[y0*dw+x0],dp[y0*dw+x1],fx),lerp(dp[y1*dw+x0],dp[y1*dw+x1],fx),fy);};
  const D=restD(asp),N=cols*rows,zv=new Float32Array(N),useA=m.alpha&&!m.keepBg;
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){let d=sample(i/(cols-1),j/(rows-1));d=Math.pow(Math.max(0,d),m.gamma);d=.5+(d-.5)*(1-m.flat);zv[j*cols+i]=(d-.5)*m.scale;}
  const cv=m.canvas,pix=cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,cv.width,cv.height).data;
  const buf=new ArrayBuffer(N*32),f=new Float32Array(buf),u8=new Uint8Array(buf);let n=0;
  const cx=asp/(cols-1),cy=1/(rows-1),q=new THREE.Quaternion(),zz=new THREE.Vector3(0,0,1),nv=new THREE.Vector3();
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const u=i/(cols-1),v=j/(rows-1),k=j*cols+i;
    let a=useA?m.alpha[Math.round(v*(m.h-1))*m.w+Math.round(u*(m.w-1))]:1;
    if(useA){a=clamp((a-.3)/.55,0,1);a=a*a*(3-2*a);} // pull the matte in a touch so no background halo rides on the edge
    if(a<.06)continue;
    const z=zv[k],s=m.rest?(D-z)/D:1,x=(u-.5)*asp*s,y=(.5-v)*s;
    const zl=zv[j*cols+Math.max(0,i-1)],zr=zv[j*cols+Math.min(cols-1,i+1)],zu=zv[Math.max(0,j-1)*cols+i],zd=zv[Math.min(rows-1,j+1)*cols+i];
    nv.set(-(zr-zl)/(2*cx),(zd-zu)/(2*cy)*-1,1);nv.x*=1;nv.normalize();nv.lerp(zz,.45).normalize(); // soften steep normals so slopes don't turn into slivers
    nv.set(nv.x,-nv.y,-nv.z);q.setFromUnitVectors(zz,nv); // into the y-down file frame
    const sx=Math.max(cx,cy)*s*.62,o=n*8; // tight discs that just overlap: crisp like the photo, not a smeared cloud
    f[o]=x;f[o+1]=-y;f[o+2]=-z;f[o+3]=sx;f[o+4]=sx;f[o+5]=sx*.35;
    const px=Math.min(cv.width-1,Math.round(u*(cv.width-1))),py=Math.min(cv.height-1,Math.round(v*(cv.height-1))),pi=(py*cv.width+px)*4,b=n*32+24;
    u8[b]=pix[pi];u8[b+1]=pix[pi+1];u8[b+2]=pix[pi+2];u8[b+3]=Math.round(a*255);
    u8[b+4]=clamp(Math.round(q.w*128+128),0,255);u8[b+5]=clamp(Math.round(q.x*128+128),0,255);u8[b+6]=clamp(Math.round(q.y*128+128),0,255);u8[b+7]=clamp(Math.round(q.z*128+128),0,255);
    n++;
  }
  const bytes=new Uint8Array(buf,0,n*32);
  // Spark decodes splat colours as sRGB and re-linearises them for this studio's render target, which isn't re-encoded on output.
  // The copy shown here is pre-encoded to cancel that; the exported bytes keep the photo's own values.
  const view=new Uint8Array(bytes),lut=new Uint8Array(256);for(let c=0;c<256;c++)lut[c]=Math.round(255*Math.pow(c/255,1/2.2));
  for(let k=0;k<n;k++){const b=k*32+24;view[b]=lut[view[b]];view[b+1]=lut[view[b+1]];view[b+2]=lut[view[b+2]];}
  return {bytes,view,count:n,cols,rows};
}
function exportPhotoSplat(o){const m=o.meta;if(!m.splat){toast('Switch to Splats first.');return;}
  const b=m.splat.bytes;deliver(new Blob([b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)],{type:'application/octet-stream'}),(o.name||'photo')+'.splat');}
function rebuildRelief(o){
  const m=o.meta;if(!m||!m.canvas)return;
  const R=buildReliefGeometry(m),{g,cols,rows,tris}=R;
  if(!m.tex){m.tex=new THREE.CanvasTexture(m.canvas);m.tex.colorSpace=THREE.NoColorSpace; /* the studio's render target is not re-encoded on output, so keep the photo's own sRGB values untouched */ m.tex.anisotropy=renderer.capabilities.getMaxAnisotropy();}
  const tok=m._st=(m._st||0)+1;
  o.root.children.slice().forEach(c=>{o.root.remove(c);if(c.isSplatMesh){try{c.dispose();}catch(e){}return;}c.geometry&&c.geometry.dispose();if(c.material&&c.material.dispose)c.material.dispose();});
  const cut=!!(m.alpha&&!m.keepBg);
  const add=(geo,mat,order)=>{const n=new THREE.Mesh(geo,mat);n.userData._mat=mat;n.renderOrder=order||0;o.root.add(n);return n;};
  if(m.mode==='points'){
    const cv=m.canvas,ctx=cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,cv.width,cv.height).data;
    const pos=g.attributes.position,col=new Float32Array(pos.count*3),uv=g.attributes.uv;
    const c=new THREE.Color();
    for(let k=0;k<pos.count;k++){const x=Math.min(cv.width-1,Math.floor(uv.getX(k)*(cv.width-1))),y=Math.min(cv.height-1,Math.floor((1-uv.getY(k))*(cv.height-1))),p=(y*cv.width+x)*4;
      c.setRGB(ctx[p]/255,ctx[p+1]/255,ctx[p+2]/255,THREE.SRGBColorSpace);col[k*3]=c.r;col[k*3+1]=c.g;col[k*3+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(null);
    const node=new THREE.Points(g,new THREE.PointsMaterial({size:m.pt,sizeAttenuation:true,vertexColors:true}));o.root.add(node);
  }else{
    const base={side:THREE.DoubleSide,toneMapped:false};
    let fmat;
    if(m.shade>0){ // shading blends lit and unlit: at 0 the photo is untouched, higher values let light and the depth normals shape it
      fmat=new THREE.MeshLambertMaterial({...base,map:m.tex,color:new THREE.Color().setScalar(m.shade),emissive:new THREE.Color().setScalar(1-m.shade),emissiveMap:m.tex,normalMap:buildNormalTex(m,R.shaped,cols,rows),normalScale:new THREE.Vector2(1,1)});
    }else fmat=new THREE.MeshBasicMaterial({...base,map:m.tex});
    if(cut){fmat.transparent=true;fmat.alphaTest=.02;}
    add(g,fmat,2);
    const L=(R.back||R.fill)?ensureLayers(m):null;
    if(R.back){const bm=new THREE.MeshBasicMaterial({...base,map:L.backTex});if(cut){bm.transparent=true;bm.alphaTest=.02;}add(R.back,bm,1);}
    m.furMats=[];
    if(m.fur>0&&cut){ // animated fur: shells of the surface pushed along the normals, strands cut by a hash, swaying in the wind
      const NS=m.hq?14:8,dens=Math.max(80,m.w/2);
      for(let i=1;i<=NS;i++){
        const mt=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:false,toneMapped:false,
          uniforms:{uMap:{value:m.tex},uShell:{value:i/NS},uLen:{value:m.fur*.07},uWind:{value:m.wind},uTime:{value:0},uDens:{value:dens}},
          vertexShader:`uniform float uShell,uLen,uWind,uTime;varying vec2 vUv;void main(){vUv=uv;vec3 p=position+normal*uLen*uShell;float k=uShell*uShell*uLen;
            p.x+=sin(uTime*1.7+position.y*9.+position.x*5.)*uWind*k;p.y+=sin(uTime*1.3+position.x*7.)*uWind*k*.5-k*.4;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
          fragmentShader:`uniform sampler2D uMap;uniform float uShell,uDens;varying vec2 vUv;
            float h(vec2 c){return fract(sin(dot(c,vec2(127.1,311.7)))*43758.5453);}
            void main(){vec4 t=texture2D(uMap,vUv);if(t.a<.5)discard;if(h(floor(vUv*uDens))<uShell)discard;gl_FragColor=vec4(t.rgb*(.8+.2*uShell),1.);}`});
        m.furMats.push(mt);add(g,mt,3+i);
      }
    }
    if(R.fill){
      const tex=m.keepBg?(L.plateTex||m.tex):L.fillTex;
      add(R.fill,new THREE.MeshBasicMaterial({...base,map:tex}),0);
    }
  }
  if(m.mode==='splats'){
    const S2=buildSplatBytes(m);m.splat=S2;
    ensureSpark().then(async({SplatMesh})=>{
      if(m._st!==tok||m.mode!=='splats')return;
      const sm=new SplatMesh({fileBytes:S2.view,fileName:'photo.splat'});sm.quaternion.set(1,0,0,0);
      o.root.add(sm);try{await sm.initialized;}catch(e){m.splatErr=String(e&&e.message||e);toast('Splats failed: '+m.splatErr);}
      if(m._st!==tok||m.mode!=='splats'){o.root.remove(sm);try{sm.dispose();}catch(e){}return;}
      o.root.children.forEach(c=>{if(c!==sm&&c.isMesh)c.visible=false;}); // the surface stays for picking, the splats are what you see
      bump();
    }).catch(e=>{m.splatErr=String(e&&e.message||e);toast('Splats failed: '+m.splatErr);});
  }
  o.meta.stats=`${cols}×${rows}`;o.meta.tris=tris;o.meta.maxSlope=R.maxSlope;o.meta.slopeLim=R.lim;
  applyView();bump();
}
async function photoToRelief(file){
  const bmp=await createImageBitmap(file,{imageOrientation:'from-image'});
  const k=Math.min(1,2048/Math.max(bmp.width,bmp.height));
  const photo=document.createElement('canvas');photo.width=Math.max(2,Math.round(bmp.width*k));photo.height=Math.max(2,Math.round(bmp.height*k));
  const pg=photo.getContext('2d',{willReadFrequently:true});pg.drawImage(bmp,0,0,photo.width,photo.height);
  const w=photo.width,h=photo.height,px=pg.getImageData(0,0,w,h).data;
  let tr=0;for(let i=3;i<px.length;i+=4)if(px[i]<250)tr++;
  const disp=document.createElement('canvas');disp.width=w;disp.height=h;disp.getContext('2d',{willReadFrequently:true}).drawImage(photo,0,0);
  // placeholder: the photo as a flat plane, swapped for the cut-out and depth when ready
  const o=makeRelief(file.name||'Photo',disp,new Float32Array(w*h).fill(.5),{quick:true,photo,px});
  setFx(false);enterRest(o);
  (async()=>{
    if(tr>w*h*.005){ // the file already carries real alpha: use it, skip the model
      const a=new Float32Array(w*h);for(let i=0;i<a.length;i++)a[i]=px[i*4+3]/255;
      o.meta.alpha0=Float32Array.from(a);setAlpha(o,a,'file alpha');
    }else if(CUT.on)await autoCut(o);
    if(CUT.depthOn&&objById(o.id))await autoDepth(o);
  })();
  return o;
}
function makeRelief(name,cv,depth,{quick=false,dw,dh,photo=null,px=null}={}){
  const g=new THREE.Group();
  const meta={canvas:cv,photo,px,alpha:null,keepBg:false,w:cv.width,h:cv.height,depth,dw:dw||cv.width,dh:dh||cv.height,N:220,sway:!!photo,fur:0,wind:.5,breathe:false,scale:photo?.45:.45,gamma:1,flat:0,detail:.35,shade:.3,tear:.5,fill:true,solid:false,thick:.15,hq:!matchMedia('(pointer:coarse)').matches,rest:!!photo,smooth:1,cut:.08,mode:photo?'splats':'mesh',lit:false,pt:.012,quick};
  const o=registerObject(baseName(name),g,'relief',{fit:false,meta});
  rebuildRelief(o);
  // sit on the ground, 1.8 units tall
  o.holder.scale.setScalar(1.8);o.holder.position.set(0,.9,0);
  frameAll();setTab&&setTab('scene');
  if(!photo)toast(quick?'Placed as quick relief. Run AI depth for a real depth map.':'Relief built from the depth map.');
  return o;
}
/* ---------- subject cut-out (matting) ----------
   MATTERS is the swap point: each entry is {label, run(canvas,onProg) -> {data:Float32Array 0..1, w, h}}.
   modnet runs in matte.worker.js (WebGPU or WASM). fallback needs no model (border flood fill). */
const BUILD='step5-life1';
const CUT={on:localStorage.getItem('n0.autocut')==='1',workerP:null,jobs:new Map(),seq:0};
function resizeBilinear(s,sw,sh,dw,dh){
  if(sw===dw&&sh===dh)return s;
  const o=new Float32Array(dw*dh),fx=sw>1?(sw-1)/Math.max(1,dw-1):0,fy=sh>1?(sh-1)/Math.max(1,dh-1):0;
  for(let y=0;y<dh;y++){const sy=y*fy,y0=Math.floor(sy),y1=Math.min(sh-1,y0+1),ty=sy-y0;
    for(let x=0;x<dw;x++){const sx=x*fx,x0=Math.floor(sx),x1=Math.min(sw-1,x0+1),tx=sx-x0;
      o[y*dw+x]=(s[y0*sw+x0]*(1-tx)+s[y0*sw+x1]*tx)*(1-ty)+(s[y1*sw+x0]*(1-tx)+s[y1*sw+x1]*tx)*ty;}}
  return o;
}
function guidedFilter(I,p,w,h,r,eps){
  const n=w*h,Ip=new Float32Array(n),II=new Float32Array(n);
  for(let i=0;i<n;i++){Ip[i]=I[i]*p[i];II[i]=I[i]*I[i];}
  const mI=blurPlane(I,w,h,r),mp=blurPlane(p,w,h,r),cIp=blurPlane(Ip,w,h,r),cII=blurPlane(II,w,h,r);
  const a=new Float32Array(n),b=new Float32Array(n);
  for(let i=0;i<n;i++){const v=cII[i]-mI[i]*mI[i];a[i]=(cIp[i]-mI[i]*mp[i])/(v+eps);b[i]=mp[i]-a[i]*mI[i];}
  const ma=blurPlane(a,w,h,r),mb=blurPlane(b,w,h,r),q=new Float32Array(n);
  for(let i=0;i<n;i++)q[i]=clamp(ma[i]*I[i]+mb[i],0,1);
  return q;
}
/* label connected components where bin===v. returns {lab,sizes,border} */
function labelComps(bin,w,h,v){
  const n=w*h,lab=new Int32Array(n).fill(-1),sizes=[],border=[],st=new Int32Array(n);
  for(let s=0;s<n;s++){
    if(bin[s]!==v||lab[s]>=0)continue;
    const id=sizes.length;let sp=0,cnt=0,bd=0;st[sp++]=s;lab[s]=id;
    while(sp){const i=st[--sp];cnt++;const x=i%w,y=(i-x)/w;
      if(x===0||y===0||x===w-1||y===h-1)bd=1;
      if(x>0&&bin[i-1]===v&&lab[i-1]<0){lab[i-1]=id;st[sp++]=i-1;}
      if(x<w-1&&bin[i+1]===v&&lab[i+1]<0){lab[i+1]=id;st[sp++]=i+1;}
      if(y>0&&bin[i-w]===v&&lab[i-w]<0){lab[i-w]=id;st[sp++]=i-w;}
      if(y<h-1&&bin[i+w]===v&&lab[i+w]<0){lab[i+w]=id;st[sp++]=i+w;}}
    sizes.push(cnt);border.push(bd);
  }
  return {lab,sizes,border};
}
/* probability map (any size) -> sharp full-res alpha following the photo's edges */
function refineMask(prob,pw,ph,px,w,h){
  const n=w*h;let a=resizeBilinear(prob,pw,ph,w,h);
  const I=new Float32Array(n);for(let i=0;i<n;i++)I[i]=(.299*px[i*4]+.587*px[i*4+1]+.114*px[i*4+2])/255;
  a=guidedFilter(I,a,w,h,Math.max(3,Math.round(Math.max(w,h)/160)),1e-3);
  for(let i=0;i<n;i++)a[i]=clamp((a[i]-.32)/.36,0,1);           // sharpen the edge ramp
  cleanAlpha(a,w,h);
  const f=blurPlane(a,w,h,1);for(let i=0;i<n;i++)a[i]=f[i];     // ~1-2 px feather
  return a;
}
function cleanAlpha(a,w,h){
  const n=w*h,bin=new Uint8Array(n);for(let i=0;i<n;i++)bin[i]=a[i]>.5?1:0;
  const fg=labelComps(bin,w,h,1),big=Math.max(0,...fg.sizes),minI=Math.max(n*.003,big*.04);
  const bg=labelComps(bin,w,h,0);
  for(let i=0;i<n;i++){
    if(bin[i]){if(fg.sizes[fg.lab[i]]<minI)a[i]=0;}
    else{const c=bg.lab[i];if(!bg.border[c]&&bg.sizes[c]<n*.008)a[i]=1;}
  }
}
/* pull edge colour from the inside of the subject so no background halo remains */
function decontaminate(px,a,w,h){
  const n=w*h,out=new Uint8ClampedArray(px),core=new Uint8Array(n);
  for(let i=0;i<n;i++)core[i]=a[i]>=.96?1:0;
  for(let pass=0;pass<2;pass++){const c=core.slice();
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!core[i])continue;
      if(!core[i-1]||!core[i+1]||!core[i-w]||!core[i+w])c[i]=0;}
    core.set(c);}
  const reach=blurPlane(a,w,h,4),todo=[];
  for(let i=0;i<n;i++)if(!core[i]&&reach[i]>.002)todo.push(i);
  for(let it=0;it<6&&todo.length;it++){
    const add=[],rest=[];
    for(const i of todo){const x=i%w,y=(i-x)/w;let r=0,g=0,b=0,k=0;
      for(let j=-1;j<=1;j++){const yy=y+j;if(yy<0||yy>=h)continue;
        for(let q=-1;q<=1;q++){const xx=x+q;if(xx<0||xx>=w)continue;const m=yy*w+xx;if(core[m]){r+=out[m*4];g+=out[m*4+1];b+=out[m*4+2];k++;}}}
      if(k){out[i*4]=r/k;out[i*4+1]=g/k;out[i*4+2]=b/k;add.push(i);}else rest.push(i);}
    for(const i of add)core[i]=1;
    todo.length=0;for(const i of rest)todo.push(i);
  }
  for(let i=0;i<n;i++)out[i*4+3]=Math.round(a[i]*255);
  return out;
}
/* colour region grow, used by the no-model fallback and by tap-to-pick */
function growRegion(px,w,h,seeds,tolStep,tolSeed,ref){
  const n=w*h,m=new Uint8Array(n),st=new Int32Array(n);let sp=0;
  const D=(i,j)=>{const r=px[i*4]-px[j*4],g=px[i*4+1]-px[j*4+1],b=px[i*4+2]-px[j*4+2];return Math.sqrt(r*r+g*g+b*b);};
  const Dr=i=>{const r=px[i*4]-ref[0],g=px[i*4+1]-ref[1],b=px[i*4+2]-ref[2];return Math.sqrt(r*r+g*g+b*b);};
  for(const s of seeds){if(!m[s]&&Dr(s)<tolSeed){m[s]=1;st[sp++]=s;}}
  while(sp){const i=st[--sp],x=i%w,y=(i-x)/w;
    for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1]){
      if(j<0||m[j])continue;if(D(i,j)<tolStep&&Dr(j)<tolSeed){m[j]=1;st[sp++]=j;}}}
  return m;
}
function floodMask(px,w,h){
  const ch=[[],[],[]],seeds=[];
  const add=i=>{seeds.push(i);for(let c=0;c<3;c++)ch[c].push(px[i*4+c]);};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  const ref=ch.map(a=>a.sort((p,q)=>p-q)[a.length>>1]);
  const m=growRegion(px,w,h,seeds,12,64,ref),p=new Float32Array(w*h);
  for(let i=0;i<w*h;i++)p[i]=m[i]?0:1;
  return {data:p,w,h};
}
function runMatte(key,cv,onProg,type='run'){
  const k=Math.min(1,1024/Math.max(cv.width,cv.height)),w=Math.max(2,Math.round(cv.width*k)),h=Math.max(2,Math.round(cv.height*k));
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(cv,0,0,w,h);
  const rgba=g.getImageData(0,0,w,h).data.buffer;
  if(!CUT.worker){CUT.worker=new Worker('matte.worker.js?v=7',{type:'module'});
    CUT.worker.onmessage=e=>{const d=e.data,j=CUT.jobs.get(d.id);if(!j)return;
      if(d.type==='progress')j.onProg(d.p,'loading');else if(d.type==='stage')j.onProg(1,d.status);
      else if(d.type==='done'){CUT.jobs.delete(d.id);CUT.backend=d.backend;j.res(d);}else if(d.type==='error'){CUT.jobs.delete(d.id);j.rej(new Error(d.message));}};
    CUT.worker.onerror=e=>{CUT.jobs.forEach(j=>j.rej(new Error('worker failed')));CUT.jobs.clear();CUT.worker=null;};}
  return new Promise((res,rej)=>{const id=++CUT.seq;CUT.jobs.set(id,{res,rej,onProg});CUT.worker.postMessage({id,type,model:key,cpu:!!CUT.cpu,rgba,w,h},[rgba]);});
}
const MATTERS={
  birefnet:{label:'BiRefNet-lite',run:(cv,p)=>runMatte('birefnet',cv,p)},
  modnet:{label:'MODNet',run:(cv,p)=>runMatte('modnet',cv,p)},
  u2netp:{label:'U²-Net-p',run:(cv,p)=>runMatte('u2netp',cv,p)},
  u2net:{label:'U²-Net',run:(cv,p)=>runMatte('u2net',cv,p)},
  fallback:{label:'edge fill',run(cv){const w=cv.width,h=cv.height,px=cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;return Promise.resolve(floodMask(px,w,h));}}
};
CUT.model=localStorage.getItem('n0.cutmodel')||'auto'; // auto | birefnet | modnet
const cutOrder=()=>{const f=CUT.model==='auto'?'u2netp':CUT.model;return [f,'u2netp','fallback'].filter((x,i,a)=>a.indexOf(x)===i);};
function cutStatus(text,p){
  let b=$('#cutbar');
  if(!text){if(b)b.hidden=true;return;}
  if(!b){b=el('div','cutbar','<span></span><div class="prog"><i></i></div>');b.id='cutbar';stage.appendChild(b);}
  b.hidden=false;b.firstChild.textContent=text;b.querySelector('i').style.width=(p==null?100:Math.round(p*100))+'%';
}
function applyAlpha(m){
  const cv=m.canvas,ctx=cv.getContext('2d');
  if(m.keepBg||!m.alpha)ctx.putImageData(new ImageData(new Uint8ClampedArray(m.px),m.w,m.h),0,0);
  else ctx.putImageData(new ImageData(decontaminate(m.px,m.alpha,m.w,m.h),m.w,m.h),0,0);
  if(m.tex)m.tex.needsUpdate=true;
  applyDepthMask(m);m.bdDirty=true;
}
function setAlpha(o,a,by){
  const m=o.meta;m.alpha=a;if(by)m.cutBy=by;
  applyAlpha(m);rebuildRelief(o);markDirty();
}
async function autoCut(o){
  const m=o.meta;if(m.cutting)return;m.cutting=true;m.cutErr='';
  const t0=performance.now();
  try{
    let r,by,a;
    for(const key of cutOrder()){
      try{
        cutStatus(key==='fallback'?'Cutting out subject…':'Loading cut-out model…',key==='fallback'?null:0);
        r=await MATTERS[key].run(m.photo,(p,s)=>{if(s==='cutting')cutStatus('Cutting out subject…');else cutStatus(`Loading cut-out model… ${Math.round(p*100)}%`,p);});
        by=MATTERS[key].label;break;
      }catch(e){console.warn('matting '+key+' failed',e);m.cutErr=m.cutErr||String(e&&e.message||e).slice(0,140);}
    }
    if(by==='edge fill'&&m.cutErr)toast('Cut-out model couldn’t load ('+m.cutErr.slice(0,70)+'). Used the simple edge fill. Use Refine to fix edges.',7000);
    if(!objById(o.id))return;
    a=refineMask(r.data,r.w,r.h,m.px,m.w,m.h);
    let cov=0;for(let i=0;i<a.length;i++)cov+=a[i];cov/=a.length;
    if((cov<.02||cov>.97)&&by!=='edge fill'){by='edge fill';const f=await MATTERS.fallback.run(m.photo);a=refineMask(f.data,f.w,f.h,m.px,m.w,m.h);cov=0;for(let i=0;i<a.length;i++)cov+=a[i];cov/=a.length;}
    if(cov<.02||cov>.97){toast('Couldn’t separate a subject. Use Refine to paint it.',4500);m.alpha=null;m.cutBy='none';return;}
    m.alpha0=Float32Array.from(a);m.ms=Math.round(performance.now()-t0);
    setAlpha(o,a,by);
    if(m.raw)buildDepth(m);
    rebuildRelief(o);
    toast('Subject cut out ('+by+')');
  }finally{m.cutting=false;cutStatus(null);if(S.sel===o.id)refreshInspector();}
}
function buildCutSection(o){
  const m=o.meta,r=sec(inspEl,'Cut-out',m.cutting?'working…':(m.cutBy||'none'));
  const chips=el('div','chips');
  const kb=el('button','chip','Keep background');kb.setAttribute('aria-pressed',!!m.keepBg);
  kb.onclick=()=>{m.keepBg=!m.keepBg;kb.setAttribute('aria-pressed',m.keepBg);applyAlpha(m);rebuildRelief(o);};
  const ab=el('button','chip','Remove background on drop');ab.setAttribute('aria-pressed',CUT.on);
  ab.onclick=()=>{CUT.on=!CUT.on;localStorage.setItem('n0.autocut',CUT.on?'1':'0');ab.setAttribute('aria-pressed',CUT.on);};
  chips.append(kb,ab);r.appendChild(chips);
  chipRow(r,[['auto','Auto'],['modnet','People'],['u2net','Accurate']],v=>CUT.model===v,v=>{CUT.model=v;localStorage.setItem('n0.cutmodel',v);});
  const acts=el('div','chips');
  acts.append(
    btn('Remove background','pri',()=>autoCut(o)),
    btn('Reset cut','',()=>{if(m.alpha0){setAlpha(o,Float32Array.from(m.alpha0));refreshInspector();}else toast('Nothing to reset yet.');}),
    btn('Restore background','',()=>{m.alpha=null;m.cutBy='none';applyAlpha(m);rebuildRelief(o);refreshInspector();}),
    btn(m.refine?'Close refine':'Refine','',()=>{m.refine=!m.refine;refreshInspector();}));
  r.appendChild(acts);
  if(m.cutErr)r.appendChild(el('div','note','Cut-out model error: '+m.cutErr));
  if(m.refine)refineEditor(r,o);
}
function refineEditor(parent,o){
  const m=o.meta,st=m.rs||(m.rs={mode:'add',size:18,feather:.5}),n=m.w*m.h;
  chipRow(parent,[['add','Add'],['erase','Erase'],['pick','Tap to pick']],v=>st.mode===v,v=>{st.mode=v;});
  sliderRow(parent,'Size',()=>st.size,v=>{st.size=v;},4,80,1);
  sliderRow(parent,'Feather',()=>st.feather,v=>{st.feather=v;},0,1,.05);
  const k=Math.min(1,640/Math.max(m.w,m.h)),pw=Math.round(m.w*k),ph=Math.round(m.h*k);
  const cv=el('canvas');cv.width=pw;cv.height=ph;
  cv.style.cssText='width:100%;display:block;touch-action:none;border:1px solid var(--line);border-radius:2px;margin-top:6px;cursor:crosshair';
  const ctx=cv.getContext('2d'),img=ctx.createImageData(pw,ph);
  const draw=()=>{const d=img.data;
    for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){const si=Math.min(m.h-1,Math.round(y/k))*m.w+Math.min(m.w-1,Math.round(x/k)),a=m.alpha?m.alpha[si]:1,f=.28+.72*a,j=(y*pw+x)*4;
      d[j]=m.px[si*4]*f;d[j+1]=m.px[si*4+1]*f;d[j+2]=m.px[si*4+2]*f;d[j+3]=255;}
    ctx.putImageData(img,0,0);};
  let raf=0;const sched=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw();});};
  const pt=e=>{const b=cv.getBoundingClientRect();return [clamp(Math.round((e.clientX-b.left)/b.width*(m.w-1)),0,m.w-1),clamp(Math.round((e.clientY-b.top)/b.height*(m.h-1)),0,m.h-1)];};
  const ensure=()=>{m.keepBg=false;if(!m.alpha){m.alpha=new Float32Array(n).fill(st.mode==='erase'?1:0);if(!m.cutBy||m.cutBy==='none')m.cutBy='manual';}};
  const stamp=(x,y)=>{const R=st.size/k,F=Math.max(.02,st.feather),a=m.alpha,add=st.mode==='add';
    for(let j=Math.max(0,Math.floor(y-R));j<=Math.min(m.h-1,Math.ceil(y+R));j++)for(let i=Math.max(0,Math.floor(x-R));i<=Math.min(m.w-1,Math.ceil(x+R));i++){
      const d=Math.hypot(i-x,j-y)/R;if(d>=1)continue;const w=d<=1-F?1:(1-d)/F,q=j*m.w+i;
      a[q]=add?Math.max(a[q],w):a[q]*(1-w);}};
  const commit=()=>{applyAlpha(m);rebuildRelief(o);};
  let down=false,last=null;
  cv.addEventListener('pointerdown',e=>{
    e.preventDefault();cv.setPointerCapture(e.pointerId);const [x,y]=pt(e);ensure();
    if(st.mode==='pick'){
      const i=y*m.w+x;
      if(m.alpha[i]>.5){const bin=new Uint8Array(n);for(let j=0;j<n;j++)bin[j]=m.alpha[j]>.5?1:0;const L=labelComps(bin,m.w,m.h,1),keep=L.lab[i];for(let j=0;j<n;j++)if(bin[j]&&L.lab[j]!==keep)m.alpha[j]=0;}
      else{const reg=growRegion(m.px,m.w,m.h,[i],14,40,[m.px[i*4],m.px[i*4+1],m.px[i*4+2]]);for(let j=0;j<n;j++)if(reg[j])m.alpha[j]=1;const f=blurPlane(m.alpha,m.w,m.h,1);m.alpha.set(f);}
      draw();commit();return;}
    down=true;last=[x,y];stamp(x,y);sched();});
  cv.addEventListener('pointermove',e=>{if(!down)return;const [x,y]=pt(e),R=st.size/k,dx=x-last[0],dy=y-last[1],L=Math.hypot(dx,dy),s=Math.max(1,Math.ceil(L/(R/3)));
    for(let t=1;t<=s;t++)stamp(last[0]+dx*t/s,last[1]+dy*t/s);last=[x,y];sched();});
  const up=()=>{if(!down)return;down=false;commit();};
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  draw();parent.appendChild(cv);
  parent.appendChild(el('div','note','Add paints the subject back, Erase removes it, Tap to pick keeps the part you tap (or adds a similar-coloured area).'));
}

/* ---------- depth: model in the worker, cached per image, shaped inside the subject mask ---------- */
CUT.depthOn=localStorage.getItem('n0.autodepth')!=='0';
const IDB={db:null,open(){return this.db||(this.db=new Promise((res,rej)=>{const r=indexedDB.open('n0studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('depth');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}));},
  async get(k){try{const db=await this.open();return await new Promise(res=>{const q=db.transaction('depth').objectStore('depth').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res(null);});}catch(e){return null;}},
  async put(k,v){try{const db=await this.open();db.transaction('depth','readwrite').objectStore('depth').put(v,k);}catch(e){}}};
function imgKey(m){let h=2166136261;const d=m.px;for(let i=0;i<d.length;i+=1013){h^=d[i];h=Math.imul(h,16777619);}return 'da2s-'+m.w+'x'+m.h+'-'+(h>>>0).toString(36);}
async function autoDepth(o,{force=false}={}){
  const m=o.meta;if(m.depthing)return;m.depthing=true;const t0=performance.now();
  try{
    const key=imgKey(m);let raw=force?null:await IDB.get(key);
    if(raw){m.depthBy='Depth Anything V2 (cached)';}
    else{
      cutStatus('Loading depth model…',0);
      try{
        const r=await runMatte('depth',m.photo,(p,s)=>{if(s==='cutting')cutStatus('Estimating depth…');else cutStatus(`Loading depth model… ${Math.round(p*100)}%`,p);},'depth');
        raw={data:r.data,w:r.w,h:r.h};IDB.put(key,raw);m.depthBy='Depth Anything V2';
      }catch(e){console.warn('depth model failed',e);m.depthErr=String(e&&e.message||e).slice(0,140);raw={data:pseudoDepth(m.photo),w:m.w,h:m.h};m.depthBy='quick (no model)';toast('Depth model couldn’t load ('+m.depthErr.slice(0,70)+'). Using a quick relief.',7000);}
    }
    if(!objById(o.id))return;
    m.raw=raw;buildDepth(m);m.quick=false;m.depthMs=Math.round(performance.now()-t0);
    rebuildRelief(o);
  }finally{m.depthing=false;cutStatus(null);if(S.sel===o.id)refreshInspector();}
}
/* model depth -> full-res, edges snapped to the photo (guided filter), range normalised inside the subject only */
function buildDepth(m){
  const {data,w:rw,h:rh}=m.raw,w=m.w,h=m.h,n=w*h;
  let d=resizeBilinear(data,rw,rh,w,h);
  const I=new Float32Array(n),px=m.px;for(let i=0;i<n;i++)I[i]=(.299*px[i*4]+.587*px[i*4+1]+.114*px[i*4+2])/255;
  d=guidedFilter(I,d,w,h,Math.max(4,Math.round(Math.max(w,h)/220)),2e-3);
  const a=m.alpha,vals=[];
  for(let i=0;i<n;i+=5)if(!a||a[i]>.5)vals.push(d[i]);
  if(vals.length<50)for(let i=0;i<n;i+=5)vals.push(d[i]);
  vals.sort((p,q)=>p-q);
  const L=vals[Math.floor(.02*(vals.length-1))],H=vals[Math.floor(.98*(vals.length-1))],r=Math.max(1e-6,H-L),dn=new Float32Array(n);
  for(let i=0;i<n;i++)dn[i]=clamp((d[i]-L)/r,0,1);
  const hp=blurPlane(I,w,h,2);for(let i=0;i<n;i++)hp[i]=I[i]-hp[i];   // photo high-pass: pores, hair, creases
  m.hp=hp;m.dn=dn;applyDepthMask(m);
}
/* outside the subject the surface eases to a flat plane; the subject edge extends outward a little so no cliff forms */
function applyDepthMask(m){
  if(!m.dn)return;const n=m.dn.length,a=m.alpha,o=(m.depth&&m.depth.length===n&&m.depth!==m.dn)?m.depth:new Float32Array(n);
  if(!a){o.set(m.dn);}
  else{
    const r=Math.max(3,Math.round(Math.max(m.w,m.h)/150)),na=new Float32Array(n);
    for(let i=0;i<n;i++)na[i]=m.dn[i]*a[i];
    const bn=blurPlane(na,m.w,m.h,r),ba=blurPlane(a,m.w,m.h,r);
    for(let i=0;i<n;i++){const ext=ba[i]>.01?bn[i]/ba[i]*Math.min(1,ba[i]*6):0;o[i]=ext*(1-a[i])+m.dn[i]*a[i];}
  }
  if(m.hp&&m.detail>0){const k=m.detail*.6;for(let i=0;i<n;i++)o[i]+=k*m.hp[i]*(a?a[i]:1);}
  m.depth=o;m.dw=m.w;m.dh=m.h;
}

/* ---------- rest view: the default camera reproduces the photo; orbit is caged to ±25° ---------- */
const CAGE=THREE.MathUtils.degToRad(25);
function setFx(on){
  S.fx=on;const b=$('#bFx');if(b)b.setAttribute('aria-pressed',on);
  if(S.fxBtn){S.fxBtn.setAttribute('aria-pressed',on);S.fxBtn.textContent=on?'FX on':'FX off';}bump();
}
function setCage(on){
  const c=controls;
  if(on){c.enablePan=false;c.minAzimuthAngle=-CAGE;c.maxAzimuthAngle=CAGE;c.minPolarAngle=Math.PI/2-CAGE;c.maxPolarAngle=Math.PI/2+CAGE;}
  else{c.enablePan=true;c.minAzimuthAngle=-Infinity;c.maxAzimuthAngle=Infinity;c.minPolarAngle=0;c.maxPolarAngle=Math.PI;c.rotateSpeed=1;c.minDistance=.3;c.maxDistance=60;}
}
const ANIM={hold:false,idleAt:0};
controls.addEventListener('start',()=>{ANIM.hold=true;});
controls.addEventListener('end',()=>{ANIM.hold=false;ANIM.idleAt=performance.now()+3500;});
function animTick(t){
  for(const o of S.objs){const m=o.meta;if(!m||o.kind!=='relief')continue;
    if(m.furMats)for(const u of m.furMats){u.uniforms.uTime.value=t;u.uniforms.uWind.value=m.wind;}
    const bz=m.breathe?1+.14*Math.sin(t*1.4):1;if(Math.abs(o.root.scale.z-bz)>1e-4)o.root.scale.z=bz;}
  const R=S.rest,o=R&&objById(R.id);
  if(o&&R.cage&&o.meta.sway&&!ANIM.hold&&!S.exporting&&performance.now()>ANIM.idleAt)
  {
    const A=THREE.MathUtils.degToRad(9),sp=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    sp.theta=A*Math.sin(t*.9);sp.phi=Math.PI/2+A*.45*Math.sin(t*.6+1);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp));camera.lookAt(controls.target);
  }
}
function enterRest(o){
  if(!o||!o.meta.rest)return;
  S.rest={id:o.id,cage:true};S.needFrame=false;
  const m=o.meta,Dw=restD(m.w/m.h)*o.holder.scale.x,c=o.holder.position;
  controls.target.copy(c);camera.position.set(c.x,c.y,c.z+Dw);camera.up.set(0,1,0);
  controls.minDistance=Dw*.6;controls.maxDistance=Dw*1.6;
  camera.near=Math.max(.01,Dw/100);camera.far=Dw*60;
  setCage(true);restTick(true);controls.update();bump();
  ensureWipe();
}
function leaveRest(){if(!S.rest)return;S.rest=null;setCage(false);const w=$('#wipe');if(w)w.hidden=true;const b=$('#wipebar');if(b)b.hidden=true;}
function restTick(force){
  const R=S.rest,o=R&&objById(R.id);if(!o){if(R)leaveRest();return;}
  const m=o.meta,asp=m.w/m.h,D=restD(asp),stW=stage.clientWidth,stH=stage.clientHeight;if(!stW||!stH)return;
  const lift=Math.round(sheet.coverPx()),Hv=Math.max(60,stH-lift),hp=Math.min(Hv,stW/asp),wp=hp*asp;
  const vf=THREE.MathUtils.radToDeg(2*Math.atan(.5*stH/(D*hp)));
  if(force||Math.abs(vf-camera.fov)>.005){camera.fov=vf;camera.updateProjectionMatrix();}
  const w=$('#wipe');
  if(w){w.hidden=false;w.style.left=(stW-wp)/2+'px';w.style.top=(Hv-hp)/2+'px';w.style.width=wp+'px';w.style.height=hp+'px';
    if(w._for!==m){w._for=m;w.querySelector('img').src=m.photo.toDataURL('image/jpeg',.95);}}
  const bar=$('#wipebar');if(bar)bar.hidden=false;
  if(R.cage){ // soft resistance: rotation slows as it nears the edge of the cage
    const az=Math.abs(controls.getAzimuthalAngle())/CAGE,po=Math.abs(controls.getPolarAngle()-Math.PI/2)/CAGE,pr=clamp((Math.max(az,po)-.55)/.45,0,1);
    controls.rotateSpeed=1-.75*pr*pr;
  }
}
function ensureWipe(){
  if($('#wipe'))return;
  const w=el('div','','<img alt=""><i></i>');w.id='wipe';w.hidden=true;stage.appendChild(w);
  const bar=el('div','','<span>Photo</span><input type="range" min="0" max="100" value="0" aria-label="Compare photo with 3D"><span>3D</span>');bar.id='wipebar';bar.hidden=true;stage.appendChild(bar);
  const inp=bar.querySelector('input'),apply=()=>{const v=+inp.value;w.querySelector('img').style.clipPath=`inset(0 ${100-v}% 0 0)`;w.querySelector('i').style.left=v+'%';w.querySelector('i').style.display=v>0&&v<100?'block':'none';};
  inp.addEventListener('input',apply);apply();
}

/* ---------- turntable scan: silhouette carving ---------- */
const SC={frames:[],bg:null,W:0,H:0,stream:null,video:null,params:{n:24,fov:48,dist:2.8,pitch:8,size:1.2,res:96,thr:42,agree:.97,cx:0,cy:0}};
function openScan(mode,file){
  const root=$('#scan');root.hidden=false;
  root.innerHTML=`
  <video playsinline muted></video><canvas class="ov"></canvas>
  <div class="top"><button class="btn" id="scX">Close</button><div class="grow"></div><span class="msg" id="scMsg">—</span><button class="btn" id="scSet">Setup</button></div>
  <div class="bot">
    <div class="ring" id="scRing"></div>
    <div class="msg" id="scHint"></div>
    <div id="scPanel" hidden></div>
    <div class="ctrl"><button class="btn" id="scBg">Background</button><button class="shutter" id="scShot" aria-label="Capture" disabled></button><button class="btn pri" id="scBuild" disabled>Build</button></div>
  </div>`;
  const vid=root.querySelector('video'),ov=root.querySelector('canvas.ov');
  SC.video=vid;SC.frames=[];SC.bg=null;SC.ov=ov;SC.imported=false;
  const P=SC.params;
  const sp=$('#scPanel',root);
  sp.innerHTML=[['Steps (photos per turn)','n',8,48,1],['Field of view','fov',30,80,1],['Camera distance','dist',1.6,6,.1],['Camera tilt °','pitch',-10,40,1],['Object size','size',.4,3,.05],['Detail (voxels)','res',48,160,8],['Silhouette threshold','thr',10,120,1]]
    .map(([l,k,a,b,s])=>`<div class="row" style="grid-template-columns:130px 1fr 44px"><label>${l}</label><input type="range" data-k="${k}" min="${a}" max="${b}" step="${s}" value="${P[k]}"><output>${P[k]}</output></div>`).join('')+
    `<div class="note">Turntable method: keep the camera still, put the object on a turntable (or a chair you can spin), a plain backdrop behind it, then rotate it by an equal step each time. Hold the object centred. Uneven steps blur the result.</div>`;
  sp.querySelectorAll('input').forEach(i=>i.addEventListener('input',()=>{P[i.dataset.k]=+i.value;i.nextElementSibling.textContent=i.value;i.style.setProperty('--p',((i.value-i.min)/(i.max-i.min)*100)+'%');drawRing();}));
  $('#scSet',root).onclick=()=>{sp.hidden=!sp.hidden;};
  $('#scX',root).onclick=closeScan;
  $('#scBg',root).onclick=()=>{grabBg();};
  $('#scShot',root).onclick=()=>{capture();};
  $('#scBuild',root).onclick=()=>{buildScan();};
  drawRing();
  if(mode==='video'&&file){importVideo(file);}
  else startScanCamera();
  SC.raf=requestAnimationFrame(scanLoop);
}
function closeScan(){
  cancelAnimationFrame(SC.raf);
  if(SC.stream){SC.stream.getTracks().forEach(t=>t.stop());SC.stream=null;}
  const r=$('#scan');r.hidden=true;r.innerHTML='';SC.video=null;
}
function drawRing(){
  const r=$('#scRing');if(!r)return;const n=SC.params.n;r.innerHTML='';
  for(let i=0;i<n;i++){const d=el('i');if(i<SC.frames.length)d.className='on';r.appendChild(d);}
  const b=$('#scBuild');if(b)b.disabled=SC.frames.length<8;
  const h=$('#scHint');if(h)h.textContent=!SC.bg&&!SC.imported?'1. Point at the empty backdrop and tap Background.':SC.frames.length<SC.params.n?`2. Rotate the object by ${(360/SC.params.n).toFixed(1)}° and tap the shutter (${SC.frames.length}/${SC.params.n}).`:'3. All steps captured. Tap Build.';
  const m=$('#scMsg');if(m)m.textContent=SC.frames.length+' / '+SC.params.n;
}
async function startScanCamera(){
  try{
    const st=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:960}},audio:false});
    SC.stream=st;SC.video.srcObject=st;await SC.video.play();
    $('#scShot').disabled=false;
  }catch(e){toast('Camera isn’t available here. Use a video of the turntable instead (Import).',5000);$('#scHint').textContent='No camera. Close this and import a video of the object turning one full turn.';}
}
const SW=240; // working width for silhouettes
function frameToData(src,w,h){
  const k=SW/w,cw=SW,ch=Math.max(2,Math.round(h*k));
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(src,0,0,cw,ch);
  return g.getImageData(0,0,cw,ch);
}
function grabBg(){
  const v=SC.video;if(!v||!v.videoWidth){toast('Camera not ready yet.');return;}
  SC.bg=frameToData(v,v.videoWidth,v.videoHeight);SC.W=SC.bg.width;SC.H=SC.bg.height;
  toast('Background saved');drawRing();
}
function maskFrom(img,bg,thr){
  const w=img.width,h=img.height,d=img.data,b=bg.data,m=new Uint8Array(w*h);
  const t2=thr*thr*3/1.0;
  for(let i=0;i<w*h;i++){const dr=d[i*4]-b[i*4],dg=d[i*4+1]-b[i*4+1],db=d[i*4+2]-b[i*4+2];m[i]=(dr*dr+dg*dg+db*db)>t2?1:0;}
  // 3×3 open then close, removes speckle and pinholes
  const er=(s)=>{const o=new Uint8Array(w*h);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let a=1;for(let j=-1;j<=1&&a;j++)for(let i=-1;i<=1;i++)if(!s[(y+j)*w+x+i]){a=0;break;}o[y*w+x]=a;}return o;};
  const di=(s)=>{const o=new Uint8Array(w*h);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let a=0;for(let j=-1;j<=1&&!a;j++)for(let i=-1;i<=1;i++)if(s[(y+j)*w+x+i]){a=1;break;}o[y*w+x]=a;}return o;};
  return er(di(di(er(m))));
}
function capture(){
  const v=SC.video;if(!v||!v.videoWidth)return;
  if(!SC.bg){toast('Tap Background first, with nothing in view.');return;}
  if(SC.frames.length>=SC.params.n){toast('All steps captured. Tap Build.');return;}
  SC.frames.push(frameToData(v,v.videoWidth,v.videoHeight));
  if(navigator.vibrate)navigator.vibrate(12);
  drawRing();
}
function scanLoop(){
  SC.raf=requestAnimationFrame(scanLoop);
  const v=SC.video,ov=SC.ov;if(!v||!ov)return;
  const vw=v.videoWidth||SC.W,vh=v.videoHeight||SC.H;if(!vw)return;
  const w=ov.clientWidth,h=ov.clientHeight;if(ov.width!==w||ov.height!==h){ov.width=w;ov.height=h;}
  const g=ov.getContext('2d');g.clearRect(0,0,w,h);
  // object-fit:contain rectangle
  const s=Math.min(w/vw,h/vh),dw=vw*s,dh=vh*s,ox=(w-dw)/2,oy=(h-dh)/2;
  if(SC.bg&&v.videoWidth){
    const cur=frameToData(v,v.videoWidth,v.videoHeight);
    const m=maskFrom(cur,SC.bg,SC.params.thr);
    const cv=SC._mc||(SC._mc=document.createElement('canvas'));cv.width=cur.width;cv.height=cur.height;
    const gc=cv.getContext('2d'),id=gc.createImageData(cur.width,cur.height);
    for(let i=0;i<m.length;i++){if(m[i]){id.data[i*4]=255;id.data[i*4+1]=90;id.data[i*4+2]=31;id.data[i*4+3]=110;}}
    gc.putImageData(id,0,0);g.imageSmoothingEnabled=false;g.drawImage(cv,ox,oy,dw,dh);
  }
  // framing guide: the cube the scanner will carve
  const P=SC.params,cx=ox+dw/2,cy=oy+dh/2;
  const f=(dh/2)/Math.tan(P.fov*Math.PI/360)/P.dist; // pixels per world unit at the axis
  const half=P.size/2*f;
  g.strokeStyle='#ffffff88';g.setLineDash([5,5]);g.lineWidth=1;g.strokeRect(cx-half,cy-half,half*2,half*2);g.setLineDash([]);
  g.fillStyle='#ffffffaa';g.fillRect(cx-1,cy-8,2,16);g.fillRect(cx-8,cy-1,16,2);
}
async function importVideo(file){
  const v=SC.video;SC.imported=true;
  v.src=URL.createObjectURL(file);v.muted=true;v.playsInline=true;
  await new Promise(r=>{v.onloadedmetadata=r;});
  await v.play().catch(()=>{});v.pause();
  const dur=v.duration;if(!isFinite(dur)||dur<1){toast('Couldn’t read that video.');return;}
  $('#scHint').textContent='Reading frames…';
  // first frame doubles as an estimated background: median of the first and the last (object has turned)
  const grab=async(t)=>{v.currentTime=t;await new Promise(r=>{v.onseeked=r;});return frameToData(v,v.videoWidth,v.videoHeight);};
  const n=SC.params.n;SC.frames=[];
  const a=await grab(0),b=await grab(Math.max(0,dur-.05));SC.W=a.width;SC.H=a.height;
  // background guess: per-pixel value that both frames agree on
  const bg=new ImageData(a.width,a.height);
  for(let i=0;i<a.data.length;i++)bg.data[i]=Math.abs(a.data[i]-b.data[i])<14?a.data[i]:Math.round((a.data[i]+b.data[i])/2);
  SC.bg=bg;
  for(let i=0;i<n;i++){SC.frames.push(await grab(dur*(i/n)));drawRing();$('#scHint').textContent=`Reading frames ${i+1}/${n}…`;}
  $('#scHint').textContent='Assumes one full, even turn. If the backdrop was plain this works best. Tap Build.';
  $('#scBg').disabled=true;
}

/* view math shared by carve + colour */
function viewBasis(P,i,n){
  const phi=(i/n)*Math.PI*2,pitch=P.pitch*Math.PI/180;
  const cam=[0,P.dist*Math.sin(pitch),P.dist*Math.cos(pitch)];
  const f=[-cam[0],-cam[1],-cam[2]];const fl=Math.hypot(...f);f[0]/=fl;f[1]/=fl;f[2]/=fl;
  // right = f × up(0,1,0)
  let r=[f[1]*0-f[2]*1,f[2]*0-f[0]*0,f[0]*1-f[1]*0];r=[-f[2],0,f[0]];const rl=Math.hypot(...r)||1;r=[r[0]/rl,0,r[2]/rl];
  const u=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];
  return {cam,f,r,u,cs:Math.cos(phi),sn:Math.sin(phi)};
}
function projectPoint(b,p,tanH,asp){
  // object rotates by phi about Y: p' = Ry(phi) p
  const x=b.cs*p[0]+b.sn*p[2],y=p[1],z=-b.sn*p[0]+b.cs*p[2];
  const dx=x-b.cam[0],dy=y-b.cam[1],dz=z-b.cam[2];
  const zc=dx*b.f[0]+dy*b.f[1]+dz*b.f[2];if(zc<=.01)return null;
  const xc=dx*b.r[0]+dy*b.r[1]+dz*b.r[2],yc=dx*b.u[0]+dy*b.u[1]+dz*b.u[2];
  return [.5+.5*xc/(zc*tanH*asp),.5-.5*yc/(zc*tanH),zc,x,y,z];
}
async function carve(onProg){
  const P=SC.params,n=SC.frames.length,R=P.res,W=SC.W,H=SC.H,asp=W/H,tanH=Math.tan(P.fov*Math.PI/360);
  const masks=SC.frames.map(f=>maskFrom(f,SC.bg,P.thr));
  const bases=masks.map((_,i)=>viewBasis(P,i,n));
  const occ=new Float32Array(R*R*R),half=P.size/2;
  for(let iz=0;iz<R;iz++){
    const z=((iz+.5)/R-.5)*P.size;
    for(let iy=0;iy<R;iy++){
      const y=((iy+.5)/R-.5)*P.size;
      for(let ix=0;ix<R;ix++){
        const x=((ix+.5)/R-.5)*P.size;
        let inside=0,seen=0;
        for(let v=0;v<n;v++){
          const q=projectPoint(bases[v],[x,y,z],tanH,asp);if(!q)continue;
          const u=q[0],t=q[1];if(u<0||u>=1||t<0||t>=1)continue;
          seen++;if(masks[v][Math.floor(t*H)*W+Math.floor(u*W)])inside++;
        }
        occ[(iz*R+iy)*R+ix]=(seen>=n*.6&&inside>=seen*P.agree)?1:0;
      }
    }
    if(iz%6===0){onProg&&onProg(iz/R);await tick();}
  }
  return {occ,R,masks,bases,W,H,asp,tanH,size:P.size};
}
/* naive surface nets on a (slightly smoothed) occupancy field */
function surfaceNets(f,R,size){
  const sm=(a)=>{const o=new Float32Array(a.length),I=(x,y,z)=>(clamp(z,0,R-1)*R+clamp(y,0,R-1))*R+clamp(x,0,R-1);
    for(let z=0;z<R;z++)for(let y=0;y<R;y++)for(let x=0;x<R;x++){let s=0;for(let k=-1;k<=1;k++)for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)s+=a[I(x+i,y+j,z+k)];o[(z*R+y)*R+x]=s/27;}return o;};
  f=sm(sm(f));
  const idx=(x,y,z)=>(z*R+y)*R+x;const iso=.5;
  const vid=new Int32Array((R-1)**3).fill(-1);const verts=[];
  const cid=(x,y,z)=>(z*(R-1)+y)*(R-1)+x;
  const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  for(let z=0;z<R-1;z++)for(let y=0;y<R-1;y++)for(let x=0;x<R-1;x++){
    const v=corners.map(c=>f[idx(x+c[0],y+c[1],z+c[2])]);
    let mask=0;for(let k=0;k<8;k++)if(v[k]>iso)mask|=1<<k;
    if(mask===0||mask===255)continue;
    let sx=0,sy=0,sz=0,cnt=0;
    for(const [a,b] of edges){const va=v[a],vb=v[b];if((va>iso)===(vb>iso))continue;const t=(iso-va)/(vb-va);
      sx+=corners[a][0]+t*(corners[b][0]-corners[a][0]);sy+=corners[a][1]+t*(corners[b][1]-corners[a][1]);sz+=corners[a][2]+t*(corners[b][2]-corners[a][2]);cnt++;}
    vid[cid(x,y,z)]=verts.length/3;
    verts.push(((x+sx/cnt+.5)/R-.5)*size,((y+sy/cnt+.5)/R-.5)*size,((z+sz/cnt+.5)/R-.5)*size);
  }
  const tri=[];
  const quad=(a,b,c,d,flip)=>{if(a<0||b<0||c<0||d<0)return;if(flip)tri.push(a,c,b,a,d,c);else tri.push(a,b,c,a,c,d);};
  for(let z=1;z<R-1;z++)for(let y=1;y<R-1;y++)for(let x=1;x<R-1;x++){
    const o=f[idx(x,y,z)]>iso;
    // edges along +x, +y, +z from this vertex
    if(o!==(f[idx(x+1,y,z)]>iso)){quad(vid[cid(x,y-1,z-1)],vid[cid(x,y,z-1)],vid[cid(x,y,z)],vid[cid(x,y-1,z)],!o);}
    if(o!==(f[idx(x,y+1,z)]>iso)){quad(vid[cid(x-1,y,z-1)],vid[cid(x-1,y,z)],vid[cid(x,y,z)],vid[cid(x,y,z-1)],!o);}
    if(o!==(f[idx(x,y,z+1)]>iso)){quad(vid[cid(x-1,y-1,z)],vid[cid(x,y-1,z)],vid[cid(x,y,z)],vid[cid(x-1,y,z)],!o);}
  }
  return {pos:new Float32Array(verts),index:tri,field:f};
}
function colourScan(res,pos,normals){
  const {masks,bases,W,H,asp,tanH}=res,n=bases.length,N=pos.length/3,col=new Float32Array(N*3);
  // frames are stored as ImageData; sample bilinear-ish (nearest) from the best-facing views
  const c=new THREE.Color();
  for(let k=0;k<N;k++){
    const p=[pos[k*3],pos[k*3+1],pos[k*3+2]],nx=normals[k*3],ny=normals[k*3+1],nz=normals[k*3+2];
    let acc=[0,0,0],wt=0;
    for(let v=0;v<n;v++){
      const b=bases[v],q=projectPoint(b,p,tanH,asp);if(!q)continue;
      if(q[0]<0||q[0]>=1||q[1]<0||q[1]>=1)continue;
      // normal in the rotated frame, then dot with direction to camera
      const rx=b.cs*nx+b.sn*nz,rz=-b.sn*nx+b.cs*nz,ry=ny;
      const vx=b.cam[0]-q[3],vy=b.cam[1]-q[4],vz=b.cam[2]-q[5],vl=Math.hypot(vx,vy,vz)||1;
      const d=(rx*vx+ry*vy+rz*vz)/vl;if(d<=.05)continue;
      const px=Math.floor(q[0]*W),py=Math.floor(q[1]*H);
      const m=masks[v];if(!m[py*W+px])continue;
      const i=(py*W+px)*4,fd=SC.frames[v].data,w=Math.pow(d,4);
      acc[0]+=fd[i]*w;acc[1]+=fd[i+1]*w;acc[2]+=fd[i+2]*w;wt+=w;
    }
    if(wt>0)c.setRGB(acc[0]/wt/255,acc[1]/wt/255,acc[2]/wt/255,THREE.SRGBColorSpace);else c.setRGB(.6,.6,.6);
    col[k*3]=c.r;col[k*3+1]=c.g;col[k*3+2]=c.b;
  }
  return col;
}
async function buildScan(){
  const hint=$('#scHint'),btn=$('#scBuild');
  if(SC.frames.length<8){toast('Capture at least 8 steps.');return;}
  btn.disabled=true;
  try{
    hint.textContent='Carving the volume…';
    const res=await carve(p=>{hint.textContent='Carving the volume… '+Math.round(p*100)+'%';});
    hint.textContent='Building the surface…';await tick();
    const net=surfaceNets(res.occ,res.R,res.size);
    if(net.pos.length<30){hint.textContent='Nothing solid found. Check the background capture, lower the threshold, and centre the object.';btn.disabled=false;return;}
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(net.pos,3));g.setIndex(net.index);g.computeVertexNormals();
    hint.textContent='Projecting colour…';await tick();
    const col=colourScan(res,net.pos,g.attributes.normal.array);
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:0,side:THREE.DoubleSide}));
    closeScan();
    const o=registerObject('Scan '+String(S.objs.filter(x=>x.kind==='scan').length+1).padStart(2,'0'),mesh,'scan',{size:1.8,meta:{tris:net.index.length/3}});
    setTab&&setTab('scene');
    toast(`Scan built: ${(net.index.length/3).toLocaleString()} triangles`);
  }catch(e){console.error(e);hint.textContent='Scan failed: '+(e.message||e);btn.disabled=false;}
}

/* ---------- depth scan (WebXR, Android Chrome with ARCore depth) ---------- */
let xr={session:null,pts:new Map(),n:0};
async function startDepthScan(){
  const lbl=$('#xrMsg');
  if(!navigator.xr||!(await navigator.xr.isSessionSupported('immersive-ar').catch(()=>false))){toast('This browser can’t do AR depth capture. It needs Chrome on an Android phone with ARCore.',5000);return;}
  try{
    const session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['depth-sensing','local-floor'],depthSensing:{usagePreference:['cpu-optimized'],dataFormatPreference:['luminance-alpha','float32']},optionalFeatures:['dom-overlay'],domOverlay:{root:document.body}});
    await gl.makeXRCompatible();
    session.updateRenderState({baseLayer:new XRWebGLLayer(session,gl)});
    const ref=await session.requestReferenceSpace('local-floor');
    xr={session,pts:new Map(),n:0};
    const tmpInv=new THREE.Matrix4(),pv=new THREE.Vector3(),pw=new THREE.Vector4(),mat=new THREE.Matrix4(),mw=new THREE.Matrix4();
    let fr=0;
    session.addEventListener('end',()=>{finishDepthScan();});
    session.requestAnimationFrame(function onFrame(t,frame){
      session.requestAnimationFrame(onFrame);
      fr++;if(fr%3)return;
      const pose=frame.getViewerPose(ref);if(!pose)return;
      for(const view of pose.views){
        let d;try{d=frame.getDepthInformation(view);}catch(e){continue;}
        if(!d)continue;
        tmpInv.fromArray(view.projectionMatrix).invert();mw.fromArray(view.transform.matrix);
        for(let j=0;j<36;j++)for(let i=0;i<48;i++){
          const u=(i+.5)/48,v=(j+.5)/36,m=d.getDepthInMeters(u,v);
          if(!(m>.25&&m<5))continue;
          pw.set(u*2-1,1-v*2,-1,1).applyMatrix4(tmpInv);pv.set(pw.x/pw.w,pw.y/pw.w,pw.z/pw.w);
          pv.multiplyScalar(m/-pv.z).applyMatrix4(mw);
          const key=Math.round(pv.x*40)+','+Math.round(pv.y*40)+','+Math.round(pv.z*40);
          if(!xr.pts.has(key)){xr.pts.set(key,[pv.x,pv.y,pv.z]);xr.n++;}
        }
      }
      const l=$('#xrMsg');if(l)l.textContent=xr.n.toLocaleString()+' points';
    });
    toast('Walk slowly around the subject. Close the AR view to finish.',6000);
  }catch(e){console.error(e);toast('Couldn’t start depth capture: '+(e.message||e).toString().slice(0,90),6000);}
}
function finishDepthScan(){
  const pts=[...xr.pts.values()];if(pts.length<200){toast('Not enough points captured.');return;}
  const pos=new Float32Array(pts.length*3),col=new Float32Array(pts.length*3);
  let miny=Infinity,maxy=-Infinity;pts.forEach(p=>{miny=Math.min(miny,p[1]);maxy=Math.max(maxy,p[1]);});
  const c=new THREE.Color();
  pts.forEach((p,i)=>{pos.set(p,i*3);c.setHSL(.58-.5*(p[1]-miny)/Math.max(.01,maxy-miny),.55,.62);col.set([c.r,c.g,c.b],i*3);});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
  registerObject('Depth scan',new THREE.Points(g,new THREE.PointsMaterial({size:.012,vertexColors:true,sizeAttenuation:true})),'points',{size:2.4});
  toast(pts.length.toLocaleString()+' points captured');
}

/* =====================================================================
   n0ise studio — interface
   ===================================================================== */
const sheetEl=$('#sheet'),panes=$('#panes'),tabsEl=$('#tabs');
const mqDesk=matchMedia('(min-width:900px)');

/* ---------- bottom sheet: one rAF spring, transform only ---------- */
const sheet={
  h:0,hv:0,ht:0,drag:false,idx:2,fullH:600,last:-1,
  snaps(){const H=window.innerHeight;return[Math.round((tabsEl.classList.contains('dock')?30:66+(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b'))||0))),Math.round(Math.min(250,H*.3)),Math.round(H*.5),Math.round(H*.5)];}, // never past halfway: the art keeps the top half and the panel scrolls
  coverPx(){return mqDesk.matches?0:this.h;},
  setIdx(i,instant){const s=this.snaps();this.idx=clamp(i,0,3);this.ht=s[this.idx];if(instant){this.h=this.ht;this.hv=0;}},
  nearest(h,v){const s=this.snaps(),p=h+v*.16;let b=0,bd=1e9;s.forEach((x,i)=>{const d=Math.abs(x-p);if(d<bd){bd=d;b=i;}});return b;},
  update(dt){
    if(mqDesk.matches){sheetEl.style.removeProperty('--fullh');return;}
    const full=Math.round(window.innerHeight*.5);
    if(full!==this.fullH){this.fullH=full;sheetEl.style.setProperty('--fullh',full+'px');}
    if(this.h===0&&!this.inited){this.setIdx(1,true);this.inited=true;}
    if(!this.drag){
      this.ht=this.snaps()[this.idx]; // always follows the current screen height, so a resize or keyboard can never leave the panel past its limit
      const hi=this.snaps()[3];if(this.h>hi+1){this.h=hi;this.hv=0;}
      const w=17,k=w*w,d=2*w; // critically damped spring
      const a=-k*(this.h-this.ht)-d*this.hv;
      this.hv+=a*dt;this.h+=this.hv*dt;
      if(Math.abs(this.h-this.ht)<.15&&Math.abs(this.hv)<3){this.h=this.ht;this.hv=0;}
    }
    const y=Math.round((this.fullH-this.h)*10)/10;
    if(y!==this.last){this.last=y;sheetEl.style.transform=`translate3d(0,${y}px,0)`;}
  },
  begin(){this.drag=true;this.samples=[];this.hv=0;},
  move(h,t){const s=this.snaps(),lo=s[0],hi=s[3];
    if(h<lo)h=lo-(lo-h)*.3;else if(h>hi)h=hi+(h-hi)*.25;
    this.h=h;this.samples.push([t,h]);if(this.samples.length>8)this.samples.shift();},
  end(){this.drag=false;const a=this.samples,n=a.length;let v=0;
    if(n>1){const f=a[Math.max(0,n-4)],l=a[n-1],dt=(l[0]-f[0])/1000;if(dt>0)v=(l[1]-f[1])/dt;}
    this.hv=v;this.idx=this.nearest(this.h,v);this.ht=this.snaps()[this.idx];}
};
function wireSheet(){
  const grab=$('#grab'),head=[grab,tabsEl];
  let y0=0,h0=0,moved=false,down=false;
  head.forEach(n=>{
    n.addEventListener('pointerdown',e=>{if(mqDesk.matches)return;down=true;moved=false;y0=e.clientY;h0=sheet.h;sheet.begin();n.setPointerCapture(e.pointerId);});
    n.addEventListener('pointermove',e=>{if(!down)return;const dy=e.clientY-y0;if(Math.abs(dy)>5)moved=true;if(moved)sheet.move(h0-dy,e.timeStamp);});
    const up=e=>{if(!down)return;down=false;if(moved){sheet.end();e.preventDefault&&0;suppressTab=true;setTimeout(()=>{suppressTab=false;},50);}else{sheet.drag=false;sheet.setIdx(sheet.idx);if(n===grab)sheet.setIdx(sheet.idx<=1?2:1);}};
    n.addEventListener('pointerup',up);n.addEventListener('pointercancel',up);
  });
  grab.addEventListener('keydown',e=>{if(e.key==='ArrowUp')sheet.setIdx(sheet.idx+1);if(e.key==='ArrowDown')sheet.setIdx(sheet.idx-1);});
  // content hand-off: pull down at scrollTop 0, or push up before the sheet is full
  let ty0=0,th0=0,mode=0,tz=0;
  panes.addEventListener('touchstart',e=>{if(mqDesk.matches)return;ty0=e.touches[0].clientY;th0=sheet.h;mode=0;},{passive:true});
  panes.addEventListener('touchmove',e=>{
    if(mqDesk.matches)return;
    const dy=e.touches[0].clientY-ty0;
    if(mode===0){
      if(Math.abs(dy)<6)return;
      const s=sheet.snaps();
      if((dy>0&&panes.scrollTop<=0&&sheet.h>s[0]+1)||(dy<0&&sheet.h<s[3]-1)){mode=1;sheet.begin();ty0=e.touches[0].clientY;th0=sheet.h;}
      else mode=2;
    }
    if(mode===1){e.preventDefault();sheet.move(th0-(e.touches[0].clientY-ty0),e.timeStamp);}
  },{passive:false});
  const tend=()=>{if(mode===1)sheet.end();mode=0;};
  panes.addEventListener('touchend',tend,{passive:true});panes.addEventListener('touchcancel',tend,{passive:true});
}
let suppressTab=false;

/* ---------- tabs ---------- */
const TABN=[['world','World'],['build','Build'],['scene','Scene'],['draw','Sigil'],['scan','Scan'],['look','Look'],['mat','Material'],['export','Export']];
const paneEls={};
addEventListener('pointerup',e=>{if(e.target.closest&&e.target.closest('#panes'))S.apprTouch=performance.now();},true);addEventListener('input',e=>{if(e.target.closest&&e.target.closest('#panes'))S.apprTouch=performance.now();},true);addEventListener('change',e=>{if(e.target.closest&&e.target.closest('#panes'))S.apprTouch=performance.now();},true);
function setTab(id){
  TABN.forEach(([k])=>{$('#tab_'+k).setAttribute('aria-selected',k===id);paneEls[k].hidden=k!==id;});
  panes.scrollTop=0;S.tab=id;try{SIG&&SIG.onTab(id);}catch(e){console.error(e);}try{setSelBox();}catch(e){}try{paintBar();}catch(e){}
  if(id!=='mat'&&MS)MS.paintOff();
  if(BLD){if(id==='build')BLD.show();else BLD.off();}
  if(id==='mat'&&MS)MS.show();
  if(id==='world'&&!S._wsChosen&&!S._wsBoot&&window.__wsShow&&!S.objs.some(o=>!(o.meta&&o.meta.player)))window.__wsShow();
  if(id==='world'&&!S._plSpawn&&typeof ensurePlayer==='function'){S._plSpawn=1;ensurePlayer().then(()=>{S.needFrame=true;}).catch(()=>{});}
}
const TABIC={build:'<path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6"/>',world:'<path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',scene:'<path d="M12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',draw:'<path d="M4 20c2-6 4-12 9-12 3 0 3 4 1 6-2 2-5 0-3-3M16 5l3 3"/>',scan:'<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',look:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>',mat:'<circle cx="12" cy="12" r="8"/><path d="M8 9.5a5 5 0 0 1 3.5-2.4M15.5 16.5a5 5 0 0 1-3 1.2"/>',export:'<path d="M12 15V4M7 9l5-5 5 5M5 15v4h14v-4"/>'};
function placeTabs(){
  const app=document.querySelector('.app'),main=document.querySelector('.main');
  if(!mqDesk.matches){if(tabsEl.parentNode!==app){app.insertBefore(tabsEl,main.nextSibling);}tabsEl.classList.add('dock');}
  else{if(tabsEl.parentNode!==sheetEl){sheetEl.insertBefore(tabsEl,panes);}tabsEl.classList.remove('dock');}
  sheet.last=-1;
  requestAnimationFrame(()=>{const h=tabsEl.classList.contains('dock')?tabsEl.offsetHeight:0;document.documentElement.style.setProperty('--objb',h?(h+54)+'px':'');});
}
function buildTabs(){
  TABN.forEach(([k,l])=>{
    const b=el('button','tab',l);b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(TABIC[k]||'')+'</svg><span>'+l+'</span>';b.id='tab_'+k;b.setAttribute('role','tab');
    b.addEventListener('click',()=>{if(suppressTab)return;setTab(k);if(!mqDesk.matches){if(k==='draw')sheet.setIdx(1);else if(sheet.idx<2)sheet.setIdx(2);}});
    tabsEl.appendChild(b);
    const p=el('div');p.id='pane_'+k;p.hidden=true;panes.appendChild(p);paneEls[k]=p;
  });
}

/* ---------- control helpers ---------- */
let SLID=0;
function sliderRow(parent,label,get,set,min,max,step,fmt){
  const r=el('div','row'),sid='sl'+(++SLID);r.innerHTML=`<label for="${sid}">${label}</label><input id="${sid}" type="range" min="${min}" max="${max}" step="${step}"><output for="${sid}"></output>`;
  const i=r.querySelector('input'),o=r.querySelector('output');
  const f=fmt||(v=>step<1?(+v).toFixed(step<.1?2:1):String(Math.round(v)));
  let lo=min,hi=max;
  const paint=()=>{const v=get();if(v<lo||v>hi){lo=Math.min(lo,v);hi=Math.max(hi,v);i.min=lo;i.max=hi;} /* a value outside the slider's range (typed, or from a script) widens it instead of clamping */i.value=v;o.textContent=f(v);i.style.setProperty('--p',((v-lo)/(hi-lo||1)*100)+'%');};
  i.addEventListener('input',()=>{set(+i.value);paint();});paint();
  /* click the number to type an exact value */
  o.style.cursor='text';o.title='Click to type a value';o.tabIndex=0;
  const edit=()=>{const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.value=String(get());inp.setAttribute('aria-label',label+' value');inp.style.cssText='width:64px;font:inherit;text-align:right;background:#0d0c0b;color:inherit;border:1px solid var(--line,#444);border-radius:4px;padding:2px 4px;min-height:28px';
    let done=false;const commit=ok=>{if(done)return;done=true;if(ok){const v=parseFloat(inp.value.replace(',','.'));if(isFinite(v)){set(v);}}inp.replaceWith(o);paint();};
    inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')commit(true);else if(e.key==='Escape')commit(false);});inp.addEventListener('blur',()=>commit(true));
    o.replaceWith(inp);inp.focus();inp.select();};
  o.addEventListener('click',edit);o.addEventListener('keydown',e=>{if(e.key==='Enter')edit();});
  r.sync=paint;parent.appendChild(r);return r;
}
function chipRow(parent,items,isOn,onPick,cls=''){
  const row=el('div','chips');
  items.forEach(([v,l])=>{const b=el('button','chip '+cls,l);b.dataset.v=v;b.setAttribute('aria-pressed',isOn(v));
    b.addEventListener('click',()=>{onPick(v);row.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',isOn(c.dataset.v)));});row.appendChild(b);});
  parent.appendChild(row);return row;
}
const sec=(parent,title,right)=>{const s=el('div','sec');if(title){const t=el('div','st');t.innerHTML=`<span>${title}</span><span>${right||''}</span>`;s.appendChild(t);}parent.appendChild(s);return s;};
const btn=(label,cls,fn)=>{const b=el('button','btn '+(cls||''),label);b.addEventListener('click',fn);return b;};

/* ---------- SCENE pane ---------- */
let objListEl,inspEl,inspSyncs=[],physHost=null;
function buildScenePane(){
  const p=paneEls.scene;
  const s1=sec(p,'Objects');
  objListEl=el('div','olist');s1.appendChild(objListEl);
  const grp=(title,open)=>{const d=el('details','acc');if(open)d.open=true;d.innerHTML=`<summary>${title}</summary>`;const inn=el('div','in');inn.classList.add('chips');d.appendChild(inn);s1.appendChild(d);return inn;};
  const top=el('div','chips');top.style.margin='8px 0';top.append(btn('Import files','pri',()=>$('#file').click()),btn('Sigil: draw in 3D','',()=>{setTab('draw');if(!mqDesk.matches)sheet.setIdx(1);}),btn('Sample photo','',()=>addPhoto('fold',sampleCanvas())));s1.appendChild(top);
  const gS=grp('Shapes',true);Object.keys(PRIMS).forEach(k=>gS.appendChild(btn('+ '+k,'',()=>addPrimitive(k))));
  const gC=grp('Characters and sound');
  gC.appendChild(btn('+ Human','',async()=>{try{await api.run({cmd:'add',type:'human'});api.run({cmd:'camera',frame:true});}catch(e){toast(e.message||String(e));}}));
  gC.appendChild(btn('+ Visualizer','',()=>addViz('waterfall')));
  const gP=grp('Photo to 3D');Object.keys(P3D).forEach(k=>gP.appendChild(btn('+ '+P3D[k].name,'',()=>pickPhoto(k))));
  const gJ=grp('Project');
  gJ.appendChild(btn('Walk','',()=>$('#bWalk').click()));{const ab=btn('Connect AI','',()=>aiConnect());AI.btn=ab;gJ.appendChild(ab);}gJ.appendChild(btn('Save project','',saveProject));
  gJ.appendChild(btn('Open project','',()=>{const i=document.createElement('input');i.type='file';i.accept='.zip,application/zip';i.onchange=()=>i.files[0]&&importFiles([i.files[0]]);i.click();}));gJ.appendChild(btn('Copy look link','',lookLink));
  const note=el('div','note','Drop or import: glb, gltf (with its bin and textures), obj (+mtl), stl, ply (mesh, points or 3D Gaussian splat), splat, spz, ksplat, sog. Photos become relief. Videos open the turntable scanner.');s1.appendChild(note);
  inspEl=el('div');p.appendChild(inspEl);
  physHost=el('div');p.appendChild(physHost);
  autoPanel(p);
  const s3=sec(p,'Stage');
  sliderRow(s3,'Environment',()=>S.env,v=>{S.env=v;scene.environmentIntensity=v;hemi.intensity=.2+v*.7;bump();},0,2,.05);
  sliderRow(s3,'Key light',()=>key.intensity,v=>{key.intensity=v;bump();},0,6,.1);
  const bgrow=el('div','row');bgrow.innerHTML='<label>Background</label><input type="color" value="#0b0b0c" style="width:100%;height:28px;border:1px solid var(--line);background:none;padding:0"><output></output>';
  bgrow.querySelector('input').addEventListener('input',e=>{S.bg=e.target.value;bump();});s3.appendChild(bgrow);
  const sg=el('div','chips');
  const tgc=(label,on,fn)=>{const b=el('button','chip',label);b.setAttribute('aria-pressed',on);b.addEventListener('click',()=>{on=!on;b.setAttribute('aria-pressed',on);fn(on);});sg.appendChild(b);};
  tgc('Ground plane',false,v=>api.run({cmd:'environment',ground:v?{color:'#8a8d82',size:60}:false}));
  tgc('Shadows',!!S.shadows,v=>api.run({cmd:'environment',shadows:v}));
  tgc('Grid',true,v=>api.run({cmd:'environment',grid:v}));
  s3.appendChild(sg);
  sliderRow(s3,'Light angle',()=>S.lightAz??45,v=>{S.lightAz=v;const r=Math.hypot(key.position.x,key.position.z)||4,a=v*Math.PI/180;key.position.x=Math.cos(a)*r;key.position.z=Math.sin(a)*r;bump();},0,360,1,v=>Math.round(v)+'°');
  sliderRow(s3,'Light height',()=>S.lightEl??50,v=>{S.lightEl=v;key.position.y=2+v/100*8;bump();},0,100,1,v=>Math.round(v)+'%');
  chipRow(s3,[['.5','Draft'],['.8','Normal'],['1','High']],v=>String(S.q)===v,v=>{S.q=parseFloat(v);needResize=true;});
  LGT.pane(p,{sliderRow,chipRow,btn,el,sec,toast});
}
function renderObjList(){
  if(!objListEl)return;objListEl.innerHTML='';
  if(!S.objs.length){objListEl.appendChild(el('div','note','Nothing in the scene yet.'));return;}
  S.objs.slice().reverse().forEach(o=>{
    const r=el('div','orow');r.setAttribute('aria-selected',o.id===S.sel);
    const eye=el('button','',o.vis?'◉':'○');eye.title='Show / hide';eye.addEventListener('click',()=>{o.vis=!o.vis;o.holder.visible=o.vis;renderObjList();bump();});
    const nm=el('button','nm',o.name);nm.addEventListener('click',()=>selectObj(o.id));
    const bd=el('span','badge',o.kind);
    const del=el('button','','×');del.title='Delete';del.addEventListener('click',()=>removeObj(o.id));
    r.append(eye,nm,bd,del);objListEl.appendChild(r);
  });
}
let reliefT=0;
const triNote=m=>m.tris?`${m.stats} grid · ${Math.round(m.tris/1000)}k triangles`+(m.maxSlope?` · max slope ${m.maxSlope.toFixed(1)}/${m.slopeLim.toFixed(0)}`:''):'';
function refreshInspector(soft){
  try{paintBar();}catch(e){}
  window.__n0wRefresh&&window.__n0wRefresh();
  window.__worldRefresh&&window.__worldRefresh(soft);
  if(soft){inspSyncs.forEach(f=>f());return;}
  if(!inspEl)return;inspEl.innerHTML='';inspSyncs=[];
  const o=objById(S.sel);if(!o)return;
  const s=sec(inspEl,'Selected',o.name);
  const h=o.holder;
  chipRow(s,[['','Orbit'],['translate','Move'],['rotate','Rotate'],['scale','Scale']],v=>(S.gizmo||'')===v,v=>{S.pivot=false;S.gizmo=v||null;if(S.gizmo){tc.attach(h);tc.setMode(S.gizmo);}else tc.detach();bump();refreshInspector();});
  const pv=el('div','chips'),pb=el('button','chip','Move pivot');pb.setAttribute('aria-pressed',!!S.pivot);
  pb.addEventListener('click',()=>{setPivotMode(!S.pivot);pb.setAttribute('aria-pressed',!!S.pivot);});
  pv.append(pb,btn('Pivot to centre','',()=>pivotTo(o,'center')),btn('Pivot to base','',()=>pivotTo(o,'base')),btn('Pivot to origin','',()=>pivotTo(o,'origin')));s.appendChild(pv);
  s.appendChild(el('div','note','Drag the arrows to move the pivot. The model stays put; Rotate and Scale then work around the new point.'));
  const ax=['x','y','z'];
  ax.forEach(a=>inspSyncs.push(sliderRow(s,'Pos '+a.toUpperCase(),()=>h.position[a],v=>{h.position[a]=v;bump();},-6,6,.01).sync));
  inspSyncs.push(sliderRow(s,'Turn',()=>THREE.MathUtils.radToDeg(h.rotation.y),v=>{h.rotation.y=THREE.MathUtils.degToRad(v);bump();},-180,180,1,v=>Math.round(v)+'°').sync);
  inspSyncs.push(sliderRow(s,'Size',()=>h.scale.x,v=>{h.scale.setScalar(v);bump();},.05,6,.01).sync);
  if(window.__physUI&&S.tab!=='world')window.__physUI.body(inspEl,o);
  if(FORM&&o.meta&&o.meta.form)FORM.panel(inspEl,o);
  if(SIG&&o.meta&&o.meta.sigil){const d=sec(inspEl,'Drawing',o.meta.sigil.strokes.length+' strokes');d.appendChild(btn('Keep drawing','pri',()=>setTab('draw')));d.appendChild(el('div','note','This is a drawing of real 3D strokes. Looks, effects and physics work on it like any object.'));}
  if(o.kind==='relief'){
    const m=o.meta,rb=()=>{clearTimeout(reliefT);reliefT=setTimeout(()=>rebuildRelief(o),60);};
    const r=sec(inspEl,'Relief',m.depthing?'working…':(m.depthBy||'flat'));
    sliderRow(r,'Depth',()=>m.scale,v=>{m.scale=v;rb();},0,1.2,.01);
    sliderRow(r,'Detail',()=>m.detail,v=>{m.detail=v;clearTimeout(reliefT);reliefT=setTimeout(()=>{applyDepthMask(m);rebuildRelief(o);},120);},0,1,.02);
    sliderRow(r,'Shading',()=>m.shade,v=>{m.shade=v;rb();},0,1,.02);
    sliderRow(r,'Curve',()=>m.gamma,v=>{m.gamma=v;rb();},.4,2.5,.05);
    sliderRow(r,'Flatten',()=>m.flat,v=>{m.flat=v;rb();},0,1,.02);
    sliderRow(r,'Smooth',()=>m.smooth,v=>{m.smooth=Math.round(v);rb();},0,8,1);
    const an=el('div','chips');
    const tgm=(label,key)=>{const b=el('button','chip',label);b.setAttribute('aria-pressed',!!m[key]);b.addEventListener('click',()=>{m[key]=!m[key];b.setAttribute('aria-pressed',m[key]);if(key==='sway'){ANIM.idleAt=0;if(!m.sway&&S.rest)enterRest(o);}});return b;};
    an.append(tgm('Sway','sway'),tgm('Breathe','breathe'));r.appendChild(an);
    sliderRow(r,'Fur',()=>m.fur,v=>{const was=m.fur>0;m.fur=v;if(was!==v>0)rb();else if(m.furMats)m.furMats.forEach(u=>u.uniforms.uLen.value=v*.07);},0,1,.02);
    sliderRow(r,'Wind',()=>m.wind,v=>{m.wind=v;},0,2,.02);
    sliderRow(r,'Tear edges',()=>m.tear,v=>{m.tear=v;rb();},0,1,.02);
    chipRow(r,[['draft','Draft'],['high','High']],v=>(m.hq?'high':'draft')===v,v=>{m.hq=v==='high';rebuildRelief(o);r.querySelector('.tri').textContent=triNote(m);});
    chipRow(r,[['mesh','Surface'],['splats','Splats'],['points','Points']],v=>m.mode===v,v=>{m.mode=v;rebuildRelief(o);refreshInspector();});
    if(m.mode==='splats'&&m.splat){r.appendChild(el('div','note',m.splat.count.toLocaleString()+' splats · 32 bytes each'));const ex=el('div','chips');ex.append(btn('Export .splat','',()=>exportPhotoSplat(o)));r.appendChild(ex);}
    sliderRow(r,'Point size',()=>m.pt,v=>{m.pt=v;rb();},.003,.04,.001);
    const row=el('div','chips');
    const tg=(label,key,onset)=>{const b=el('button','chip',label);b.setAttribute('aria-pressed',!!m[key]);b.addEventListener('click',()=>{m[key]=!m[key];b.setAttribute('aria-pressed',m[key]);(onset||rebuildRelief)(o);});return b;};
    const ad=el('button','chip','Auto depth');ad.setAttribute('aria-pressed',CUT.depthOn);ad.addEventListener('click',()=>{CUT.depthOn=!CUT.depthOn;localStorage.setItem('n0.autodepth',CUT.depthOn?'1':'0');ad.setAttribute('aria-pressed',CUT.depthOn);});
    row.append(tg('Fill behind','fill'),tg('Solidify','solid'),ad,btn('Original look','',()=>{m.shade=0;m.detail=0;m.scale=.3;applyDepthMask(m);rebuildRelief(o);refreshInspector();}),btn('Run AI depth','',()=>autoDepth(o,{force:true})));r.appendChild(row);
    sliderRow(r,'Thickness',()=>m.thick,v=>{m.thick=v;if(m.solid)rb();},0,.6,.01);
    if(m.rest){
      const vw=el('div','chips');
      const un=el('button','chip','Unlock orbit');un.setAttribute('aria-pressed',!!(S.rest&&!S.rest.cage));
      un.addEventListener('click',()=>{if(!S.rest||S.rest.id!==o.id){enterRest(o);}if(S.rest.cage){S.rest.cage=false;setCage(false);}else{enterRest(o);}un.setAttribute('aria-pressed',!S.rest.cage);});
      vw.append(btn('Original view','',()=>{enterRest(o);un.setAttribute('aria-pressed',false);}),un);r.appendChild(vw);
    }
    r.appendChild(el('div','note tri',triNote(m)));
    if(m.depthErr)r.appendChild(el('div','note','Depth model error: '+m.depthErr));
    r.appendChild(el('div','note','Studio build '+BUILD));
    r.appendChild(el('div','note','Depth runs in your browser (WebGPU if available, otherwise WASM) and is cached per photo. Defaults stay subtle so the surface looks like the photo.'));
  }
  if(o.kind==='relief'&&o.meta.photo)buildCutSection(o);
  if(o.kind==='viz'&&o.viz)vizInspector(o);
  if(o.meta&&o.meta.p3d)photoInspector(o);
  fxInspector(o);
  if(o.kind==='points'||o.kind==='splat'){
    const r=sec(inspEl,o.kind==='splat'?'Splat':'Points');
    if(o.kind==='points'){const pm=o.root.material;sliderRow(r,'Point size',()=>pm.size,v=>{pm.size=v;bump();},.002,.06,.001);}
    if(o.kind==='splat'){const fl=el('div','chips');const b=el('button','chip','Flip upside-down');b.addEventListener('click',()=>{o.root.rotation.x+=Math.PI;bump();});fl.appendChild(b);r.appendChild(fl);r.appendChild(el('div','note','Splats render with Spark. The look applies to the selected object; Depth band and Edges masks don’t see splat depth.'));}
  }
  const a=sec(inspEl);const ac=el('div','chips');
  ac.append(btn('Frame','',()=>{frameAll();}),btn('Hide',' ',()=>{o.vis=false;o.holder.visible=false;renderObjList();bump();}),btn('Delete','',()=>removeObj(o.id)));a.appendChild(ac);
}

/* ---------- SCAN pane ---------- */
function buildScanPane(){
  const p=paneEls.scan;const s=sec(p,'Scan');
  const card=(t,d)=>{const c=el('div','card');c.innerHTML=`<h4>${t}</h4><p>${d}</p>`;const a=el('div','acts');c.appendChild(a);s.appendChild(c);return a;};
  let a=card('Photo → relief','One photo becomes a displaced surface you can orbit a few degrees. Instant everywhere; AI depth (in-browser) sharpens it.');
  a.append(btn('Choose photo','pri',()=>{const f=$('#file');f.accept='image/*';f.onchange=async()=>{await importFiles(f.files);f.value='';f.accept=FILE_ACCEPT;f.onchange=null;};f.click();}));
  a=card('Turntable scan','Real geometry from your own camera. Rotate an object in equal steps in front of a plain backdrop; the studio carves a solid from the silhouettes and projects colour onto it.');
  a.append(btn('Scan with camera','pri',()=>openScan('camera')),btn('Import turntable video','',()=>{const f=$('#file');f.accept='video/*';f.onchange=()=>{if(f.files[0])openScan('video',f.files[0]);f.value='';f.accept=FILE_ACCEPT;f.onchange=null;};f.click();}));
  a=card('Depth scan · LiDAR-style','Walk around a subject while the phone’s depth sensor builds a point cloud. Needs Chrome on an Android phone with ARCore depth. iPhone browsers don’t expose LiDAR yet.');
  a.append(btn('Start depth scan','',startDepthScan));const xm=el('span','badge','');xm.id='xrMsg';a.appendChild(xm);
  s.appendChild(el('div','note','Bring your own: for a splat made with Polycam, Luma, Brush or nerfstudio, export .ply, .splat or .spz and import it in Scene. Training new splats inside the browser isn’t built in yet.'));
}

/* ---------- LOOK pane ---------- */
const FILE_ACCEPT='.zip,audio/*,.mp3,.wav,.m4a,.ogg,.flac,.glb,.gltf,.bin,.obj,.mtl,.stl,.ply,.splat,.spz,.ksplat,.sog,image/*,video/*';
function palGradient(p){
  if(p.id==='src')return'linear-gradient(90deg,#ff5d5d,#ffcc4d,#4dd68c,#4d8bff)';
  if(!p.c)return'var(--raise)';
  const cols=p.c.map(N0.hexRGB).sort((a,b)=>N0.lum255(a)-N0.lum255(b)),n=cols.length;
  return'linear-gradient(90deg,'+cols.map((c,i)=>`rgb(${c}) ${i/n*100}% ${(i+1)/n*100}%`).join(',')+')';
}
const HERO=['px','bright','contrast','scan','mstr','bloom','curv','snr','jit','rgbs','tear','gblock'];
let lookSyncs=[];
function ctlRow(parent,c){
  const P=N0.P;
  if(c.t==='r'){const r=sliderRow(parent,c.l,()=>P[c.k],v=>{P[c.k]=v;bump();},c.min,c.max,c.step);lookSyncs.push(r.sync);}
  else if(c.t==='c'){const w=el('div');w.appendChild(el('div','sub',c.l));chipRow(w,c.opts,v=>String(P[c.k])===String(v),v=>{P[c.k]=v;bump();});parent.appendChild(w);}
  else{const w=el('div','chips');const b=el('button','chip',c.l);b.setAttribute('aria-pressed',!!P[c.k]);b.addEventListener('click',()=>{P[c.k]=!P[c.k];b.setAttribute('aria-pressed',!!P[c.k]);bump();});w.appendChild(b);parent.appendChild(w);}
}


/* Surface shader: effects in the object's own material. They follow the surface instead of masking the screen. */
const SURF=createSurface({THREE,S,objById});
const MAT=createMaterials({THREE,S});
const NG={apply:(o,g)=>{try{return ngApply(THREE,o,g,512);}catch(e){console.error(e);}},clear:o=>ngClear(o)};
let MS=null,BLD=null;
const PHX={setPbr:(o,a)=>MS&&MS.setPbr(o,a),clearPbr:o=>MS&&MS.clearPbr(o),applyTex:(o,a)=>MS&&MS.applyTex(o,a),clearTex:o=>MS&&MS.clearTex(o)};
const DOC=createSceneDoc({S,SURF,MAT,LGT,NG,PH:PHX});
let matLab=null,nodeMat=null;
if(renderer)renderer.debug.onShaderError=(g,prog,vs,fs)=>{try{const log=(g.getShaderInfoLog(fs)||'').split('\n').filter(l=>/ERROR/.test(l)).slice(0,2).join(' ').replace(/ERROR: \d+:(\d+)/g,'line $1');if(SURF.onError&&S.objs.some(o=>o.surf&&o.surf.m==='custom'))SURF.onError(log);}catch(e){}};
let surfBox=null,editBadge=null,SURFBALL=null;
const myLooks=()=>{try{return JSON.parse(localStorage.getItem('n0.mylooks')||'[]');}catch(e){return[];}};
function paintBadge(){if(!editBadge)return;const o=objById(S.fxTarget!=null?S.fxTarget:S.sel),key=apprKey();editBadge.textContent=o?'Editing: '+o.name+(o[key]?' · has its own '+(key==='look'?'hardware look':'effects'):' · nothing yet, change any control to give it one'):'Pick an object to edit its look.';}
function surfRefresh(){
  if(!surfBox)return;surfBox.innerHTML='';
  const o=objById(S.sel!=null?S.sel:S.fxTarget);
  if(!o){surfBox.appendChild(el('div','note','Pick an object to give it a surface look.'));return;}
  const st=o.surf||{m:'',amt:1,sc:1,sp:1,c1:'#ffffff',c2:'#000000'};
  if(!SURFBALL)SURFBALL=createBall(THREE,RoomEnvironment);
  {const bw=el('div','ballrow');bw.style.cssText='display:flex;gap:12px;align-items:center;margin:6px 0';bw.appendChild(SURFBALL.el);const bt=el('div','note','Preview ball. Hover or press a look to see it here before it goes on the object.');bt.style.flex='1';bw.appendChild(bt);surfBox.appendChild(bw);SURFBALL.set(o.surf);}
  surfBox.appendChild(el('div','sub','Editing: '+o.name));
  {const rc=el('div','chips'),lab=el('label','chip','Recolour ');const ci=document.createElement('input');ci.type='color';ci.value=st.tint||'#ffffff';ci.style.cssText='width:34px;height:26px;border:0;background:none;vertical-align:middle;padding:0';
    ci.addEventListener('input',()=>{SURF.recolour(o,ci.value,Math.max(.6,(o.surf&&o.surf.ta)||.9));bump();});lab.appendChild(ci);rc.appendChild(lab);
    rc.appendChild(btn('Reset colour','',()=>{SURF.set(o,{ta:0});bump();surfRefresh();}));surfBox.appendChild(rc);
    if(o.surf&&o.surf.ta>0)sliderRow(surfBox,'Recolour amount',()=>o.surf.ta,v=>{SURF.set(o,{ta:v});bump();},0,1,.01);}
  const chips=el('div','chips');
  const none=el('button','chip','None');none.setAttribute('aria-pressed',!st.m);none.addEventListener('click',()=>{SURF.clear(o);bump();surfRefresh();});chips.appendChild(none);
  SURF.SURF.forEach(([id,label])=>{const b=el('button','chip',label);b.setAttribute('aria-pressed',st.m===id);b.addEventListener('click',()=>{SURF.pick(o,id);bump();surfRefresh();});b.addEventListener('pointerenter',()=>SURFBALL&&SURFBALL.set({m:id,amt:1,sp:1,...(()=>{const d=SURF.defaults(id);return d;})()}));b.addEventListener('pointerleave',()=>SURFBALL&&SURFBALL.set(o.surf));chips.appendChild(b);});
  surfBox.appendChild(chips);
  if(st.m){
    const ed=(k,v)=>{SURF.set(o,{[k]:v});bump();};
    sliderRow(surfBox,'Amount',()=>o.surf.amt,v=>ed('amt',v),0,1,.01);
    sliderRow(surfBox,'Scale',()=>o.surf.sc,v=>ed('sc',v),.3,4,.05);
    sliderRow(surfBox,'Speed',()=>o.surf.sp,v=>ed('sp',v),0,4,.05);
    const cr=el('div','chips');
    [['c1','Colour A'],['c2','Colour B']].forEach(([k,l])=>{const w=el('label','chip',l+' ');const i=document.createElement('input');i.type='color';i.value=o.surf[k];i.style.cssText='width:34px;height:26px;border:0;background:none;vertical-align:middle;padding:0';i.addEventListener('input',()=>ed(k,i.value));w.appendChild(i);cr.appendChild(w);});
    surfBox.appendChild(cr);
    const all=el('div','chips');
    all.append(btn('Copy to all objects','',()=>{S.objs.forEach(x=>{if(x!==o&&!(x.kind==='viz'||x.kind==='splat'))SURF.set(x,{...o.surf});});bump();toast('Surface look copied to every object');}),
      btn('Remove from all','',()=>{S.objs.forEach(x=>SURF.clear(x));bump();surfRefresh();}));
    surfBox.appendChild(all);
    if(st.m==='custom'){
      const ta=document.createElement('textarea');ta.spellcheck=false;ta.value=o.surf.code||CUSTOM_DEFAULT;ta.style.cssText='width:100%;min-height:150px;background:#0b0b0c;color:#d4edc4;border:1px solid var(--line);padding:8px;font:11px/1.5 ui-monospace,monospace;border-radius:6px;box-sizing:border-box';
      const err=el('div','note','');err.style.color='#ff8a6a';
      const run=btn('Run code','pri',()=>{SURF.lastGood=o.surf.code||CUSTOM_DEFAULT;SURF.errTarget=o;SURF.set(o,{code:ta.value});SURFBALL&&SURFBALL.set({...o.surf});bump();err.textContent='';});
      surfBox.append(el('div','sub','Write the look'),el('div','note','GLSL. Write the body of a function that returns the new colour. Available: c, N, V, P, fc, t, L, fr, sc.'),ta,run,err);
      SURF.onError=m=>{err.textContent='Shader error: '+m+' The last working code is back.';if(SURF.errTarget){SURF.set(SURF.errTarget,{code:SURF.lastGood||CUSTOM_DEFAULT});ta.value=SURF.lastGood||CUSTOM_DEFAULT;bump();}};
    }
    const ml=el('div','chips');ml.appendChild(btn('Save as my look','',()=>{const n=(prompt('Name this look')||'').trim().slice(0,24);if(!n)return;const a=myLooks();a.push({name:n,st:{...o.surf}});localStorage.setItem('n0.mylooks',JSON.stringify(a));surfRefresh();toast('Saved '+n);}));surfBox.appendChild(ml);
  }
  {const a=myLooks();if(a.length){surfBox.appendChild(el('div','sub','My looks'));const row=el('div','chips');
    a.forEach((it,ix)=>{const b=el('button','chip',it.name+' ');const x=el('b','','✕');x.style.cssText='margin-left:6px;opacity:.6';x.addEventListener('click',e=>{e.stopPropagation();const l2=myLooks();l2.splice(ix,1);localStorage.setItem('n0.mylooks',JSON.stringify(l2));surfRefresh();});b.appendChild(x);
      b.addEventListener('click',()=>{SURF.set(o,{...it.st});bump();surfRefresh();});b.addEventListener('pointerenter',()=>SURFBALL&&SURFBALL.set(it.st));b.addEventListener('pointerleave',()=>SURFBALL&&SURFBALL.set(o.surf));row.appendChild(b);});surfBox.appendChild(row);}}
}
function openNodeGraph(){const o=objById(S.sel!=null?S.sel:S.fxTarget);if(!o){toast('Pick an object first, or add a shape.');return;}if(o.kind==='viz'||o.kind==='splat'){toast('This kind of object has no surface to shade.');return;}
  if(nodeMat)nodeMat.close();nodeMat=openNodeMat({THREE,RoomEnvironment,el,sliderRow,chipRow,toast,o,onApply:g=>{if(MS)MS.clearTex(o);const r=ngApply(THREE,o,g,512);if(MS)MS.physProps(o);bump();toast(r.done?'Material applied to '+o.name+'.'+(r.skipped?' Some parts have no UV map and were skipped.':''):'This object has no UV map, so the graph can’t be wrapped on it. Try a built-in shape.',5000);},onClear:()=>{bump();},onClose:()=>{nodeMat=null;bump();}});}
function buildLookPane(){
  const p=paneEls.look,P=N0.P;
  {const ms=sec(p,'Material');ms.appendChild(el('div','note','A real material for the selected object: colour, metal, roughness, glow, bump and opacity, each from a value or a procedural pattern. Opens a workshop with a 3D preview.'));
    const mr=el('div','chips');
    mr.appendChild(btn('Material graph (nodes)','pri',openNodeGraph));
    mr.appendChild(btn('Open material creator','pri',()=>{const o=objById(S.sel!=null?S.sel:S.fxTarget);if(!o){toast('Pick an object first, or add a shape.');return;}if(o.kind==='viz'||o.kind==='splat'){toast('This kind of object has no surface to shade.');return;}
      if(matLab)matLab.close();matLab=openMatLab({THREE,RoomEnvironment,el,btn,sliderRow,chipRow,toast,o,MAT,applyAll:d=>{S.objs.forEach(x=>{if(!(x.kind==='viz'||x.kind==='splat'))MAT.set(x,d);});bump();},onChange:bump,onClose:()=>{matLab=null;bump();}});}));
    ms.appendChild(mr);
    const qr=el('div','chips');MATPRESETS.slice(0,8).forEach(([n,d])=>qr.appendChild(btn(n,'',()=>{const o=objById(S.sel!=null?S.sel:S.fxTarget);if(!o){toast('Pick an object first.');return;}MAT.set(o,JSON.parse(JSON.stringify(d)));bump();toast(n+' on '+o.name);})));
    ms.appendChild(qr);}
  {const ss=sec(p,'Surface shader');ss.appendChild(el('div','note','Effects built into the object\u2019s own material. They turn and move with it, and work on the character while you play.'));surfBox=el('div');ss.appendChild(surfBox);surfRefresh();}
  const se=sec(p,'Effects');
  editBadge=el('div','note');editBadge.style.cssText='font-weight:700;color:var(--ink)';se.appendChild(editBadge);paintBadge();
  chipRow(se,[['crt','CRT Lab look'],['stack','All n0ise effects']],v=>(S.engine||'crt')===v,v=>{S.engine=v;if(v==='stack'){fxLoad();if(S.mask.mode===0){S.mask.mode=2;}if(S.sel==null&&S.objs.length)selectObj(S.objs[S.objs.length-1].id);}rebuildLook();bump();});
  {const w=el('div','chips'),b=el('button','chip','Hardware text');b.setAttribute('aria-pressed',S.hwText);b.title='Show the REC, timestamp and terminal text some hardware looks add';b.addEventListener('click',()=>{S.hwText=!S.hwText;localStorage.setItem('n0.hwtext',S.hwText?'1':'0');b.setAttribute('aria-pressed',S.hwText);bump();});w.appendChild(b);se.appendChild(w);}
  if(S.engine==='stack'){se.appendChild(btn('Edit effects','pri',fxOpen));se.appendChild(el('div','note',fxReady()?'Edit the effect stack, then press Add effects to put it on the selected object. Pick another object to give it its own. The background stays as it is.':'Loading the effect engine…'));}
  const s0=sec(p,'Look stack');
  const top=el('div','chips');
  const fxb=btn('FX on','',()=>{});fxb.setAttribute('aria-pressed',S.fx);
  fxb.addEventListener('click',()=>{S.fx=!S.fx;fxb.setAttribute('aria-pressed',S.fx);fxb.textContent=S.fx?'FX on':'FX off';$('#bFx').setAttribute('aria-pressed',S.fx);bump();});
  top.appendChild(fxb);s0.appendChild(top);S.fxBtn=fxb;
  sliderRow(s0,'Amount',()=>S.mask.amt,v=>{S.mask.amt=v;bump();},0,1,.01);
  s0.appendChild(el('div','sub','Apply the look to'));s0.appendChild(el('div','note','Selected is the default: pick an object and the look stays on it, the background stays clean.'));
  chipRow(s0,[['2','Selected'],['0','Everything'],['1','Depth band'],['3','Edges']],v=>String(S.mask.mode)===v,v=>{S.mask.mode=+v;if(v==='1')S.mask.focus=controls.getDistance();syncMask();bump();});
  const mk=el('div');s0.appendChild(mk);
  function syncMask(){mk.innerHTML='';
    if(S.mask.mode===1){sliderRow(mk,'Focus',()=>S.mask.focus,v=>{S.mask.focus=v;bump();},.2,30,.05);sliderRow(mk,'Range',()=>S.mask.range,v=>{S.mask.range=v;bump();},.05,12,.05);}
    if(S.mask.mode===1||S.mask.mode===3)sliderRow(mk,'Softness',()=>S.mask.soft,v=>{S.mask.soft=v;bump();},.02,6,.02);
    if(S.mask.mode===2){const bx=el('div','lookbox');const nm=el('div','sub','');const row=el('div','chips');
      const tgtO=()=>objById(S.fxTarget!=null?S.fxTarget:S.sel);const add=btn('Add look','pri',()=>S.engine==='stack'?addStack(tgtO()):addLook(tgtO()));const rm=btn('Remove look','',()=>S.engine==='stack'?removeStack(tgtO()):removeLook(tgtO()));
      row.append(add,rm);const skyB=btn('Look on the sky','',()=>pickSky('sky')),ltB=btn('Look on the lighting','',()=>pickSky('light')),gdB=btn('Look on the ground','',()=>pickSky('ground'));row.append(skyB,ltB,gdB);const cnt=el('div','note','');bx.append(nm,row,cnt,el('div','note','Tap an object, shape its effects, then tap another and give it different ones. Each object keeps its own. The camera, the character and any object can have effects.'));mk.appendChild(bx);lookUI={name:nm,add,rm,cnt};updateLookUI();}
    if(S.mask.mode>0){const c=el('div','chips');const b=el('button','chip','Invert');b.setAttribute('aria-pressed',S.mask.inv);b.addEventListener('click',()=>{S.mask.inv=!S.mask.inv;b.setAttribute('aria-pressed',S.mask.inv);bump();});c.appendChild(b);
      if(S.mask.mode===1){const f=btn('Focus on target','',()=>{S.mask.focus=controls.getDistance();syncMask();bump();});c.appendChild(f);}mk.appendChild(c);}
  }
  syncMask();
  const s1=sec(p,'Hardware');
  chipRow(s1,N0.PROFILES.map(x=>[x[0],x[1]]),v=>P.profile===v,v=>{const keep={pal:P.pal,method:P.method,px:P.px,depth:P.depth};N0.applyProfile(v);Object.assign(P,keep);bump();rebuildLook();});
  const s2=sec(p,'Colour');
  const pr=el('div','chips');
  N0.PALS.filter(x=>x.id!=='custom').sort((a,b)=>(b.id==='src')-(a.id==='src')).forEach(x=>{const b=el('button','sw');b.title=x.name;b.style.background=palGradient(x);b.setAttribute('aria-pressed',P.pal===x.id);
    b.addEventListener('click',()=>{P.pal=x.id;pr.querySelectorAll('.sw').forEach(n=>n.setAttribute('aria-pressed',n===b));bump();});pr.appendChild(b);});
  s2.appendChild(pr);
  s2.appendChild(el('div','note','Original colour is the default: effects keep the scene’s own colours until you pick a palette.'));
  const s3=sec(p,'Dither');
  ctlRow(s3,N0.CTL.method);
  const s4=sec(p,'Tune');
  HERO.forEach(k=>ctlRow(s4,N0.CTL[k]));
  // everything else
  const heroSet=new Set(HERO.concat(['method']));
  const names={bitmap:'Bitmap',signal:'Signal',beam:'Beam & phosphor',glass:'Glass',glitch:'Glitch',wave:'Wave',lab:'Lab'};
  N0.TABS.filter(t=>t[0]!=='display').forEach(([tid])=>{
    const d=el('details','acc');d.innerHTML=`<summary>${names[tid]||tid}</summary>`;const inn=el('div','in');d.appendChild(inn);
    let g='';N0.CT.filter(c=>c.tab===tid&&!heroSet.has(c.k)).forEach(c=>{if(c.g!==g){g=c.g;inn.appendChild(el('div','sub',g));}ctlRow(inn,c);});
    p.appendChild(d);
  });
  const s5=sec(p,'Skin');
  chipRow(s5,[['lab','Lab'],['parchment','Parchment'],['utility','Utility']],v=>document.documentElement.dataset.skin===v,v=>setSkin(v));
}
function rebuildLook(){paneEls.look.innerHTML='';lookSyncs=[];buildLookPane();}
function setSkin(v){document.documentElement.dataset.skin=v;try{localStorage.setItem('n0ise.studio.skin',v);}catch(e){}}

/* ---------- EXPORT pane ---------- */
async function deliver(blob,name){
  const file=new File([blob],name,{type:blob.type});
  if(/iPhone|iPad|Android/i.test(navigator.userAgent)&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file]});return;}catch(e){if(e&&e.name==='AbortError')return;}
  }
  const a=el('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
async function waitFrames(n){for(let i=0;i<n;i++)await tick();}
async function exportImage(scale,withFx){
  const q0=S.q,fx0=S.hold;S.exporting=true;S.big=true;S.q=Math.min(1,q0)*scale;if(!withFx)S.hold=true;needResize=true;
  await waitFrames(4);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
  S.exporting=false;S.big=false;S.q=q0;S.hold=fx0;needResize=true;
  if(blob)await deliver(blob,`n0ise-studio-${Date.now().toString(36)}.png`);else toast('Export failed.');
}
const stRecBtns={live:null,turn:null,mode:''};
const stRec=createRecorder({cap:180,warn:165,
  onState:()=>stRecUI(),onTick:()=>stRecUI(),onWarn:m=>toast(m,4000),onError:e=>toast(String(e&&e.message||e),5000)});
function stRecUI(){
  const st=stRec.state,{live,turn}=stRecBtns,on=st==='recording'||st==='stopping'||st==='arming',t=fmtTime(stRec.sec||0);
  document.body.dataset.recording=on?'1':'';
  if(live){live.setAttribute('aria-pressed',on&&stRecBtns.mode==='live');live.textContent=on&&stRecBtns.mode==='live'?(st==='recording'?'● '+t+'  Stop':'Saving…'):'Record live';live.disabled=on&&stRecBtns.mode==='turn'||st==='saving';}
  if(turn){turn.textContent=on&&stRecBtns.mode==='turn'?(st==='recording'?'● '+t+'  Stop':'Saving…'):'Record turntable';turn.disabled=on&&stRecBtns.mode==='live'||st==='saving';}
}
function recordCanvas(seconds,spin,mode){
  return new Promise((res,rej)=>{
    if(stRec.busy)return rej(new Error('Already recording.'));
    stRecBtns.mode=mode||(spin?'turn':'live');const spin0=S.spin;
    stRec.start({canvas,fps:30,copy:true,
      begin:()=>{S.exporting=true;if(spin){S.spin=true;controls.autoRotateSpeed=60/seconds;}},
      end:()=>{S.exporting=false;S.spin=spin0;controls.autoRotateSpeed=2.4;const b=$('#bSpin');if(b)b.setAttribute('aria-pressed',S.spin);},
      onDone:async r=>res({blob:r.blob,ext:r.ext,poster:r.poster,duration:r.duration})
    }).then(ok=>{if(!ok&&stRec.state==='idle')rej(new Error('Recording didn’t start.'));});
    if(seconds&&seconds<170)setTimeout(()=>stRec.stop('limit'),seconds*1000);
  });
}
function exportGLB(){
  const prevView=S.view;S.view='shaded';applyView();
  const g=new THREE.Group();
  S.objs.filter(o=>o.vis&&o.kind!=='splat').forEach(o=>{const c=o.holder.clone(true);g.add(c);});
  if(!g.children.length){toast('Nothing exportable. Splats can’t go into a GLB.');S.view=prevView;applyView();return;}
  new GLTFExporter().parse(g,async res=>{
    await deliver(new Blob([res],{type:'model/gltf-binary'}),'n0ise-scene.glb');S.view=prevView;applyView();
  },err=>{console.error(err);toast('GLB export failed.');S.view=prevView;applyView();},{binary:true,onlyVisible:true});
}
function exportPLY(o){
  let node=null;o.holder.traverse(n=>{if(!node&&(n.isMesh||n.isPoints)&&n.geometry&&n.geometry.attributes.position)node=n;});
  if(!node){toast('Pick a mesh or a point cloud first.');return;}
  o.holder.updateMatrixWorld(true);node.updateMatrixWorld(true);
  const g=node.geometry,pos=g.attributes.position,col=g.attributes.color,idx=g.index,m=node.matrixWorld,v=new THREE.Vector3(),c=new THREE.Color();
  const n=pos.count,faces=idx?idx.count/3:0;
  let s=`ply\nformat ascii 1.0\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\n${col?'property uchar red\nproperty uchar green\nproperty uchar blue\n':''}${faces?`element face ${faces}\nproperty list uchar int vertex_indices\n`:''}end_header\n`;
  const lines=[];
  for(let i=0;i<n;i++){v.fromBufferAttribute(pos,i).applyMatrix4(m);let l=v.x.toFixed(5)+' '+v.y.toFixed(5)+' '+v.z.toFixed(5);
    if(col){c.setRGB(col.getX(i),col.getY(i),col.getZ(i),THREE.LinearSRGBColorSpace).convertLinearToSRGB();l+=' '+Math.round(c.r*255)+' '+Math.round(c.g*255)+' '+Math.round(c.b*255);}lines.push(l);}
  for(let i=0;i<faces;i++)lines.push('3 '+idx.getX(i*3)+' '+idx.getX(i*3+1)+' '+idx.getX(i*3+2));
  deliver(new Blob([s+lines.join('\n')+'\n'],{type:'application/octet-stream'}),(o.name||'scan').replace(/\W+/g,'_')+'.ply');
}
function buildExportPane(){
  const p=paneEls.export;
  {const rs=sec(p,'Render scene','path traced');rs.appendChild(el('div','note','A picture of the whole scene with real light bounces, glass, reflections and soft shadows. It takes a few seconds to a minute and runs on your GPU.'));rs.appendChild(btn('Render scene','pri',renderScene));}
  const s=sec(p,'Image');
  let scale=1;
  chipRow(s,[['1','1×'],['2','2×']],v=>String(scale)===v,v=>{scale=+v;});
  const a=el('div','chips');a.style.marginTop='6px';
  a.append(btn('PNG with look','pri',()=>exportImage(scale,true)),btn('PNG original','',()=>exportImage(scale,false)));s.appendChild(a);
  const v=sec(p,'Video');
  let secs=8;sliderRow(v,'Turntable (s)',()=>secs,x=>{secs=x;},3,20,1);
  const b=el('div','chips');
  const t=btn('Record turntable','pri',async()=>{if(stRec.state==='recording'&&stRecBtns.mode==='turn'){stRec.stop('user');return;}if(stRec.busy)return;try{const r=await recordCanvas(secs,true,'turn');await deliver(r.blob,`n0ise-turntable.${r.ext}`);}catch(e){toast(e.message||'Recording failed');}});
  const l=btn('Record live','',async()=>{if(stRec.state==='recording'&&stRecBtns.mode==='live'){stRec.stop('user');return;}if(stRec.busy)return;try{const r=await recordCanvas(0,false,'live');await deliver(r.blob,`n0ise-live.${r.ext}`);}catch(e){toast(e.message||'Recording failed');}});
  stRecBtns.turn=t;stRecBtns.live=l;
  b.append(t,l);v.appendChild(b);
  const m=sec(p,'Model');
  const mb=el('div','chips');
  mb.append(btn('Open in Effects','pri',()=>openInEffects()),btn('Scene → GLB','',exportGLB),btn('Selected → PLY','',()=>{const o=objById(S.sel);if(!o)toast('Select an object first.');else exportPLY(o);}));m.appendChild(mb);
  m.appendChild(el('div','note','GLB carries meshes and points with their materials. Splats stay in their own format. A turntable scan exports as a coloured mesh in either format.'));
  const k=sec(p,'Look');
  const kb=el('div','chips');
  kb.append(btn('Save look file','',()=>deliver(new Blob([JSON.stringify({n0ise:1,P:N0.P,mask:S.mask})],{type:'application/json'}),'n0ise-look.json')),
    btn('Load look file','',()=>{const f=el('input');f.type='file';f.accept='.json,application/json';f.onchange=async()=>{try{const j=JSON.parse(await f.files[0].text());if(!j.n0ise)throw 0;Object.assign(N0.P,j.P);if(j.mask)Object.assign(S.mask,j.mask);rebuildLook();bump();toast('Look loaded');}catch(e){toast('Not a look file.');}};f.click();}));
  k.appendChild(kb);
}

/* ---------- HUD & wiring ---------- */
function buildHud(){
  const seg=$('#viewSeg');
  [['shaded','Shaded'],['clay','Clay'],['normal','Normal'],['depth','Depth'],['wire','Wire']].forEach(([k,l])=>{
    const b=el('button','',l);b.setAttribute('aria-pressed',S.view===k);b.addEventListener('click',()=>{S.view=k;seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));applyView();});seg.appendChild(b);});
  $('#bFx').addEventListener('click',()=>{S.fx=!S.fx;$('#bFx').setAttribute('aria-pressed',S.fx);if(S.fxBtn){S.fxBtn.setAttribute('aria-pressed',S.fx);S.fxBtn.textContent=S.fx?'FX on':'FX off';}bump();});
  const h=$('#bHold');const on=v=>{S.hold=v;h.setAttribute('aria-pressed',v);};
  h.addEventListener('pointerdown',e=>{e.preventDefault();on(true);});['pointerup','pointercancel','pointerleave'].forEach(t=>h.addEventListener(t,()=>on(false)));h.addEventListener('contextmenu',e=>e.preventDefault());
  $('#bFrame').addEventListener('click',frameAll);
  $('#bMat').addEventListener('click',()=>{setTab('mat');if(!mqDesk.matches&&sheet.idx<2)sheet.setIdx(2);});
  $('#bGrid').addEventListener('click',()=>{S.grid=!S.grid;$('#bGrid').setAttribute('aria-pressed',S.grid);});
  $('#bSpin').addEventListener('click',()=>{S.spin=!S.spin;$('#bSpin').setAttribute('aria-pressed',S.spin);});
  $('#bImport').addEventListener('click',()=>{$('#file').accept=FILE_ACCEPT;$('#file').click();});
  $('#bExport').addEventListener('click',()=>{setTab('export');if(!mqDesk.matches)sheet.setIdx(2);});
  $('#file').addEventListener('change',async e=>{if(e.target.onchange&&e.target.onchange!==null)return;await importFiles(e.target.files);e.target.value='';});
  stage.addEventListener('dragover',e=>{e.preventDefault();stage.classList.add('drag');});
  stage.addEventListener('dragleave',()=>stage.classList.remove('drag'));
  stage.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('drag');importFiles(e.dataTransfer.files);});
  addEventListener('dragover',e=>e.preventDefault());addEventListener('drop',e=>e.preventDefault());
  addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])];if(f.length)importFiles(f);});
  addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='f'&&!e.metaKey&&!e.ctrlKey){if(S.sel!=null&&objById(S.sel))frameObj(objById(S.sel));else frameAll();}if(e.key===' '){e.preventDefault();S.hold=true;}if(e.key==='Delete'||e.key==='Backspace'){if(S.sel!=null)removeObj(S.sel);}});
  addEventListener('keyup',e=>{if(e.key===' ')S.hold=false;});
  mqDesk.addEventListener('change',()=>{sheet.last=-1;needResize=true;});
  addEventListener('resize',()=>{needResize=true;sheet.setIdx(sheet.idx,false);});
}

/* ---------- boot ---------- */
window.__sheet=sheet;studioDefaults();buildTabs();BLD=createBuild({THREE,addGroup,objById,S,dom:canvas,camera,controls,toast,bump,el,btn,sec,addModel:addPhModel,pane:paneEls.build,peek:()=>{if(!mqDesk.matches)sheet.setIdx(1);}});MS=createMatStudio({THREE,RoomEnvironment,el,btn,sliderRow,chipRow,sec,toast,objById,S,bump,MAT,SURF,ngApply,ngClear,openGraph:openNodeGraph,setEnvHdr,dom:canvas,camera,controls,LGT,renderScene,createBall,fxOpen,gotoTab:k=>{setTab(k);if(!mqDesk.matches&&sheet.idx<2)sheet.setIdx(2);},peek:()=>{if(!mqDesk.matches)sheet.setIdx(1);},openLook:()=>{const pp=document.getElementById('lookpop');window.__lookPop&&window.__lookPop.open('selected',document.getElementById('tab_mat'));},setEnvStrength:v=>{scene.environmentIntensity=v;hemi.intensity=.2+v*.7;},pane:paneEls.mat});placeTabs();mqDesk.addEventListener('change',placeTabs);buildHud();buildScenePane();buildScanPane();
if(renderer){buildLookPane();}
buildExportPane();wireSheet();
setTab('scene');
try{const sk=localStorage.getItem('n0ise.studio.skin');if(sk)document.documentElement.dataset.skin=sk;}catch(e){}
boot3d();

/* =====================================================================
   Project: .zip file, autosave and look link. The zip is a plain stored archive (no compression library):
   project.json plus, for each photo relief, its original photo (png), cut-out alpha (bytes) and depth map (float32).
   Primitives and their transforms are saved too. Imported meshes, splats and scans are listed as not saved.
   ===================================================================== */
const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc32=b=>{let c=~0;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&255]^(c>>>8);return ~c>>>0;};
function zipStore(files){
  const enc=new TextEncoder(),parts=[],cd=[];let off=0,n=0;
  for(const [name,data] of Object.entries(files)){
    const nb=enc.encode(name),crc=crc32(data),lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(12,0x21,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,nb.length,true);
    parts.push(new Uint8Array(lh.buffer),nb,data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(14,0x21,true);ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,nb.length,true);ch.setUint32(42,off,true);
    cd.push(new Uint8Array(ch.buffer),nb);off+=30+nb.length+data.length;n++;
  }
  const cds=cd.reduce((a,x)=>a+x.length,0),e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,n,true);e.setUint16(10,n,true);e.setUint32(12,cds,true);e.setUint32(16,off,true);
  return new Blob([...parts,...cd,new Uint8Array(e.buffer)],{type:'application/zip'});
}
function zipRead(u8){
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);let e=u8.length-22;
  while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;
  if(e<0)throw new Error('That isn’t a zip file.');
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const out={},dec=new TextDecoder();
  for(let i=0;i<n;i++){
    if(dv.getUint32(p,true)!==0x02014b50)throw new Error('The zip is damaged.');
    const method=dv.getUint16(p+10,true),size=dv.getUint32(p+24,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nl));
    if(method!==0)throw new Error('This zip was compressed by another tool. Open the project file saved by n0ise 3D.');
    const ln=dv.getUint16(lo+26,true),lx=dv.getUint16(lo+28,true),st=lo+30+ln+lx;
    out[name]=u8.subarray(st,st+size);p+=46+nl+xl+cl;
  }
  return out;
}
const PSKIP=new Set(['_st','stats','tris','maxSlope','slopeLim','cutting','cutErr','bdDirty','splatErr','quick']);
const toPNG=cv=>new Promise(r=>cv.toBlob(r,'image/png')).then(b=>b.arrayBuffer()).then(a=>new Uint8Array(a));
const apprOf=o=>DOC.appearance(o),apprPut=(o,a)=>DOC.putAppearance(o,a);
async function projectFiles(){
  const files={},items=[],skipped=[];let i=0;
  {const so=objById(S.sel);if(so&&so[apprKey()]){try{apprStore(so);}catch(e){}}}
  let worldSeen=false,curO=null;{const _p=items.push.bind(items);items.push=it=>{if(curO&&it&&it.oid==null)it.oid=curO.id;return _p(it);};}
  for(const o of S.objs){curO=o;
    if(o.meta&&o.meta.form&&FORM){items.push({...FORM.projectItem(o),ap:apprOf(o)});continue;} // the recipe is saved; geometry is rebuilt on open
    if(o.meta&&o.meta.sigil&&SIG){const it=SIG.projectItem(o);if(it.hasPhoto){const id='d'+(i++);files[id+'.png']=await toPNG(SIG.photoOf(o));it.pid=id;}items.push({...it,ap:apprOf(o)});continue;}
    if(o.meta&&o.meta.n0w&&NW){worldSeen=true;continue;} // rebuilt from the world document on open
    const tr={p:o.holder.position.toArray(),r:[o.holder.rotation.x,o.holder.rotation.y,o.holder.rotation.z],s:o.holder.scale.toArray()};
    const m=o.meta;
    if(m&&m.build&&BLD){items.push({...BLD.projectItem(o),tr,vis:o.vis,ap:apprOf(o)});continue;}
    if(m&&m.phModel){items.push({kind:'phmodel',...m.phModel,name:o.name,tr,vis:o.vis,ap:apprOf(o),phys:m.phys||null});continue;}
    if(o.kind==='relief'&&m&&m.photo&&m.depth){
      const id='r'+(i++);files[id+'.png']=await toPNG(m.photo);
      files[id+'.depth']=new Uint8Array(m.depth.buffer.slice(m.depth.byteOffset,m.depth.byteOffset+m.depth.byteLength));
      if(m.alpha){const a=new Uint8Array(m.alpha.length);for(let k=0;k<a.length;k++)a[k]=Math.round(clamp(m.alpha[k],0,1)*255);files[id+'.alpha']=a;}
      const sc={};for(const [k,v] of Object.entries(m))if(['number','boolean','string'].includes(typeof v)&&!PSKIP.has(k))sc[k]=v;
      items.push({kind:'relief',id,name:o.name,tr,vis:o.vis,dw:m.dw,dh:m.dh,meta:sc,ap:apprOf(o),phys:m.phys||null});
    }else if(o.kind==='mesh'&&PRIMS[o.name]&&o.root.material&&o.root.material.color)items.push({kind:'prim',name:o.name,tr,vis:o.vis,color:o.root.material.color.getHex(),ap:apprOf(o),phys:(m&&m.phys)||null});
    else skipped.push(o.name);
  }
  curO=null;if(MS)for(const it of items){const o=it.oid!=null?objById(it.oid):null;if(!o||!o.paint)continue;try{const r=await MS.paintFiles(o,'pt'+it.oid);if(r){it.paint={meta:r.meta,refs:r.refs};Object.assign(files,r.files);}}catch(e){console.warn('paint save',e);}}
  const pj={n0ise:'studio',v:1,items,skipped,view:{view:S.view,bg:S.bg,env:S.env,grid:S.grid,fx:S.fx,mask:S.mask},engine:S.engine,light:LGT.state(),sky:{look:SKY.look||null,stack:SKY.stack||null},pseudo:{light:{look:LIGHTO.look||null,stack:LIGHTO.stack||null},ground:{look:GROUNDO.look||null,stack:GROUNDO.stack||null}},cam:{p:camera.position.toArray(),t:controls.target.toArray()}};
  if(worldSeen&&NW){try{NW.lightsCache=(await api.run({cmd:'scene'})).lights;}catch(e){}pj.world=NW.exportDoc().doc;}
  files['project.json']=new TextEncoder().encode(JSON.stringify(pj));
  return {files,skipped,count:items.length+(worldSeen?1:0)};
}
async function loadProject(u8){
  const F=zipRead(u8);if(!F['project.json'])throw new Error('That zip has no n0ise project in it.');
  const pj=JSON.parse(new TextDecoder().decode(F['project.json']));if(pj.n0ise!=='studio')throw new Error('That zip isn’t an n0ise 3D project.');
  S.objs.slice().forEach(o=>removeObj(o.id));if(S.rest)leaveRest();
  for(const it of pj.items){
    let o;
    if(it.kind==='form'){try{if(FORM){o=await FORM.fromItem(it);if(o&&it.ap)apprPut(o,it.ap);}}catch(e){toast('A generated object in this project couldn’t be rebuilt: '+(e.message||e),6000);}continue;}
    if(it.kind==='sigil'){try{let cv=null;if(it.pid&&F[it.pid+'.png']){const bm=await createImageBitmap(new Blob([F[it.pid+'.png']],{type:'image/png'}));cv=document.createElement('canvas');cv.width=bm.width;cv.height=bm.height;cv.getContext('2d').drawImage(bm,0,0);}o=SIG.fromItem(it,cv);if(o&&it.ap)apprPut(o,it.ap);}catch(e){toast('A drawing in this project couldn’t be rebuilt: '+(e.message||e),6000);}continue;}
    if(it.kind==='relief'){
      const bmp=await createImageBitmap(new Blob([F[it.id+'.png']],{type:'image/png'}));
      const photo=document.createElement('canvas');photo.width=bmp.width;photo.height=bmp.height;const pg=photo.getContext('2d',{willReadFrequently:true});pg.drawImage(bmp,0,0);
      const px=pg.getImageData(0,0,photo.width,photo.height).data,disp=document.createElement('canvas');disp.width=photo.width;disp.height=photo.height;disp.getContext('2d',{willReadFrequently:true}).drawImage(photo,0,0);
      const d=F[it.id+'.depth'],depth=new Float32Array(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength));
      o=makeRelief(it.name,disp,depth,{dw:it.dw,dh:it.dh,photo,px});
      Object.assign(o.meta,it.meta);
      const al=F[it.id+'.alpha'];
      if(al){const a=new Float32Array(al.length);for(let k=0;k<a.length;k++)a[k]=al[k]/255;o.meta.alpha0=Float32Array.from(a);setAlpha(o,a,o.meta.cutBy||'project');}else rebuildRelief(o);
    }else if(it.kind==='prim'){o=addPrimitive(it.name);if(o.root.material)o.root.material.color.setHex(it.color);}
    else if(it.kind==='build'){if(BLD)o=BLD.fromItem(it);}
    else if(it.kind==='phmodel'){o=await addPhModel(it.id,it.name,{res:it.res,noAuto:true});}
    if(!o)continue;
    o.holder.position.fromArray(it.tr.p);o.holder.rotation.set(...it.tr.r);o.holder.scale.fromArray(it.tr.s);o.vis=it.vis!==false;o.holder.visible=o.vis;
    try{apprPut(o,it.ap);}catch(e){}
    if(it.phys){o.meta=o.meta||{};o.meta.phys={...it.phys};}
    if(it.paint&&MS){try{await MS.paintLoad(o,it.paint,'pt'+it.oid,n=>F[n]);}catch(e){console.warn('paint load',e);}}
  }
  if(S.rest)leaveRest();
  if(pj.world&&NW&&!SAFE_MODE){try{await api.run({cmd:'light',op:'clear'});const v=validateWorld(pj.world);if(v.ok)await NW.build(v.doc,{replace:false});else toast('The world inside this project couldn’t be read: '+(v.report.errors[0]||{}).msg,6000);}catch(e){toast('The world inside this project couldn’t be built: '+e.message,6000);}}
  const v=pj.view||{};if(v.view)S.view=v.view;if(v.bg)S.bg=v.bg;if(typeof v.env==='number'){S.env=v.env;scene.environmentIntensity=v.env;}if(v.mask)Object.assign(S.mask,v.mask);if(typeof v.fx==='boolean')S.fx=v.fx;if(typeof v.grid==='boolean')S.grid=v.grid;
  if(pj.cam){camera.position.fromArray(pj.cam.p);controls.target.fromArray(pj.cam.t);controls.update();S.needFrame=false;}
  if(pj.light)await LGT.restoreState(pj.light);
  delete SKY.look;delete SKY.stack;if(pj.sky){if(pj.sky.look)SKY.look=pj.sky.look;if(pj.sky.stack)SKY.stack=pj.sky.stack;}
  [LIGHTO,GROUNDO].forEach(po=>{delete po.look;delete po.stack;const d=pj.pseudo&&pj.pseudo[po.id];if(d){if(d.look)po.look=d.look;if(d.stack)po.stack=d.stack;}});
  applyView();renderObjList&&renderObjList();refreshInspector&&refreshInspector();bump();
  return {count:pj.items.length,skipped:pj.skipped||[]};
}
window.__n0proj={projectFiles,loadProject,zipStore};
async function saveProject(){
  const {files,skipped,count}=await projectFiles();if(!count){toast('Nothing to save yet. Add a photo or a shape first.');return;}
  await deliver(zipStore(files),'n0ise-3d-project.zip');
  if(skipped.length)toast('Saved. Not included (imported models): '+skipped.slice(0,3).join(', ')+(skipped.length>3?'…':''),6000);
}
/* autosave to this browser (IndexedDB), debounced after changes */
const PDB=()=>new Promise((res,rej)=>{const q=indexedDB.open('n0ise-studio',1);q.onupgradeneeded=()=>q.result.createObjectStore('proj');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
const idbPut=async(k,v)=>{const db=await PDB();return new Promise((res,rej)=>{const tx=db.transaction('proj','readwrite');tx.objectStore('proj').put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});};
const idbGet=async k=>{const db=await PDB();return new Promise((res,rej)=>{const r=db.transaction('proj').objectStore('proj').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});};
var autoT=0,restoring=false;
function markDirty(){if(restoring||!window.indexedDB)return;clearTimeout(autoT);autoT=setTimeout(async()=>{
  try{if(!S.objs.length)return;const {files,count}=await projectFiles();if(!count)return;const b=zipStore(files);await idbPut('last',{t:Date.now(),count,bytes:await b.arrayBuffer()});}catch(e){}},4000);}
['pointerup','keyup','change'].forEach(ev=>addEventListener(ev,markDirty,true));
addEventListener('pagehide',()=>{clearTimeout(autoT);});
/* undo and redo for the scene: where things are, whether they show, their colour and their look. Taken after each finished gesture. */
const UH={u:[],r:[],last:null,busy:false};
const uSnap=()=>JSON.stringify(DOC.snapScene());
function uApply(js){
  UH.busy=true;
  try{const d=JSON.parse(js);
    for(const od of d.objs){const o=objById(od.id);if(o)DOC.applyObject(o,od);}
    DOC.applyStage(d.stage,{env:v=>{scene.environmentIntensity=v;hemi.intensity=.2+v*.7;}});
    const so=objById(S.sel);if(so)apprLoad(so);
    renderObjList&&renderObjList();refreshInspector&&refreshInspector();try{surfRefresh();}catch(e){}bump();}
  finally{UH.busy=false;UH.last=uSnap();}
}
function uPush(){if(UH.busy||S.tab==='world'||!S.objs.length)return;const n=uSnap();if(UH.last==null||JSON.parse(UH.last).objs.map(d=>d.id).join()!==S.objs.map(o=>o.id).join()){UH.last=n;return;}if(n===UH.last)return;UH.u.push(UH.last);if(UH.u.length>50)UH.u.shift();UH.r.length=0;UH.last=n;}
function undo3(){if(!UH.u.length){toast('Nothing to undo');return;}UH.r.push(uSnap());uApply(UH.u.pop());toast('Undo');}
function redo3(){if(!UH.r.length){toast('Nothing to redo');return;}UH.u.push(uSnap());uApply(UH.r.pop());toast('Redo');}
['pointerup','keyup','change'].forEach(ev=>addEventListener(ev,()=>setTimeout(uPush,30),true));
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(!(e.metaKey||e.ctrlKey)||k!=='z'||e.target.matches&&e.target.matches('input,textarea,select'))return;if(S.tab==='world')return;e.preventDefault();e.shiftKey?redo3():undo3();});
setTimeout(()=>{try{UH.last=uSnap();}catch(e){}},1500);
async function offerRestore(){
  try{const r=await idbGet('last');if(!r||!r.count)return;
    const b=document.createElement('div');b.className='restore';b.setAttribute('role','status');
    b.innerHTML=`<span>Restore your last session? ${r.count} object${r.count>1?'s':''}, saved ${new Date(r.t).toLocaleString([], {dateStyle:'short',timeStyle:'short'})}</span>`;
    const yes=el('button','btn pri','Restore'),no=el('button','btn','Dismiss');b.append(yes,no);document.body.appendChild(b);
    const done=()=>{b.remove();};no.onclick=done;
    yes.onclick=async()=>{done();restoring=true;try{const x=await loadProject(new Uint8Array(r.bytes));toast('Restored '+x.count+' object'+(x.count>1?'s':''));}catch(e){toast('Couldn’t restore: '+(e.message||e),5000);}restoring=false;};
    setTimeout(done,20000);
  }catch(e){}
}
/* look link: view, background, environment and mask settings as a URL */
function lookLink(){const o={v:S.view,bg:S.bg,e:S.env,m:S.mask,f:S.fx};const u=location.href.split('#')[0]+'#look='+btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  history.replaceState(null,'',u);(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>toast('Look link copied')).catch(()=>toast('Look link is in the address bar'));}
function applyLookHash(){const m=location.hash.match(/^#look=(.+)$/);if(!m)return;try{const o=JSON.parse(decodeURIComponent(escape(atob(m[1]))));
  if(o.v)S.view=o.v;if(o.bg)S.bg=o.bg;if(typeof o.e==='number'){S.env=o.e;scene.environmentIntensity=o.e;}if(o.m)Object.assign(S.mask,o.m);if(typeof o.f==='boolean')S.fx=o.f;applyView();bump();}catch(e){}}
setTimeout(()=>{applyLookHash();offerRestore();},1200);


/* ---------- walk mode, scene API and the AI bridge ---------- */
const walk=createWalk({THREE,camera,controls,canvas,S,holderBox,sheet,bump,leaveRest,faceOffset:PLAYERFACE(),onTick:p=>goalCheck(p),tcDetach:()=>tc.detach(),onExit:()=>{if(PLAYER.hidden){PLAYER.hidden.holder.visible=true;PLAYER.hidden=null;bump();}}});
/* World: you are the character. The human model is the default player; it runs, jumps and collides with what you place. */
const PLAYER={goalHit:false};
function PLAYERFACE(){return 0;}
function goalCheck(p){const g=S.objs.find(o=>o.meta&&o.meta.goal&&o.vis);if(!g)return;const q=g.holder.position,near=Math.hypot(q.x-p.x,q.z-p.z)<1.1&&Math.abs(q.y-p.y)<3;if(near&&!PLAYER.goalHit){PLAYER.goalHit=true;toast('Level complete',2500);}else if(!near)PLAYER.goalHit=false;}
let _plP=null;
function ensurePlayer(){return _plP||(_plP=ensurePlayer1().finally(()=>{_plP=null;}));}
async function ensurePlayer1(){
  let o=S.objs.find(x=>x.meta&&x.meta.player);
  if(!o){const r=await api.run(S.start?{cmd:'add',type:'human',pos:[S.start[0],0,S.start[2]]}:{cmd:'add',type:'human'});o=objById(r.id);if(!o)throw new Error('The character didn’t load.');
    o.meta.player=true;o.name='Player';o.meta.phys={type:'none'};renderObjList&&renderObjList();}
  if(!o.rig)o.rig=rigHuman(THREE,o.root);
  return o;
}
async function playWorld(){
  if(walk.on){walk.exit();return;}
  try{const o=await ensurePlayer();const h=o.holder;
    const start=S.start||[h.position.x,h.position.y,h.position.z];S.start=start;
    /* the character joins the look of the world: if effects are on other objects and none is on the character yet, it gets the same, once */
    if(!o.meta.fxAuto){const key=S.engine==='stack'?'stack':'look',srcO=S.objs.find(x=>x!==o&&x[key]);
      if(srcO&&!o[key]){o.meta.fxAuto=true;o[key]=key==='stack'?srcO.stack:JSON.parse(JSON.stringify(srcO.look));o.meta.fxSnap=JSON.stringify(o[key]);S.fx=true;S.mask.mode=2;updateLookUI();toast('The character has the same effect as '+srcO.name+'. Change it in Look.',3500);}}
    PLAYER.goalHit=false;
    const spp=NW&&NW.spawn&&NW.spawn.params;
    if(spp&&spp.firstPerson){o.holder.visible=false;PLAYER.hidden=o;walk.enter({pos:[start[0],start[1],start[2]],yaw:S.startYaw||0,noJump:!!S.photoWalk});if(S.photoWalk&&window.__photo&&window.__photo.set)window.__photo.set(true);}
    else walk.enter({third:true,player:o,rig:o.rig,pos:[start[0],start[1],start[2]],camYaw:(S.startYaw||0)*Math.PI/180});
  }catch(e){toast(String(e.message||e),4000);}
}
function setStart(){const o=S.objs.find(x=>x.meta&&x.meta.player);const t=o?o.holder.position:controls.target;S.start=[t.x,0,t.z];toast('Start set here');}
const sim=createSim({THREE,S,bump,removeObj});
const physUI=window.__physUI=createPhysUI({sim,S,THREE,camera,controls,addPrimitive,el,sec,btn,toast,chipRow,sliderRow,bump,renderObjList,selectObj});
const api=createApi({doc:DOC,autoPlace,sim,THREE,S,scene,camera,controls,renderer,canvas,world,hemi,key,grid,PRIMS,addPrimitive,removeObj,objById,importOne,applyView,bump,frameAll,tick,walk,projectFiles,zipStore,GLTFExporter,renderObjList,refreshInspector,setShadowFlags,selectObj,waitFrames,requestResize:()=>{needResize=true;}});
window.n0={run:api.run,describe:api.describe,walk,sim,playWorld};window.__playWorld=playWorld;
const worldEd=createWorldEditor({lighting:LGT,doc:DOC,recolour:(o,hex)=>{if(SURF.textured(o)){SURF.recolour(o,hex,.9);bump();try{surfRefresh();}catch(e){}return true;}return false;},playWorld:()=>playWorld(),setStart:()=>setStart(),openInEffects:()=>openInEffects(),THREE,S,api,sim,walk,camera,canvas,controls,tc,objById,selectObj,removeObj,bump,el,sec,btn,toast,renderObjList});
if(physHost)physUI.section(physHost);
worldEd.build(paneEls.world);
/* ---- .n0world: AI-writable worlds. Validate, repair, report, build; everything stays editable and exports back. ---- */
if(WORLD_ON)NW=createWorldBuilder({THREE,S,world,api,addGroup,removeObj,objById,walk,toast,bump,renderObjList:()=>renderObjList&&renderObjList(),refreshInspector,selectObj,PRIMS,camera,controls,
  frameAll,setShadowFlags,
  applyEnv:E=>{
    const o={cmd:'environment'};if(E.bg)o.bg=E.bg;if(E.ground!==undefined)o.ground=E.ground;if(E.fog!==undefined)o.fog=E.fog;if(E.shadows!==undefined)o.shadows=E.shadows;
    if(E.sun)o.sun={intensity:E.sun.intensity,...(E.sun.color?{color:E.sun.color}:{})};api.run(o).catch(()=>{});
    if(E.timeOfDay!=null||(E.sky&&E.sky!=='none')){
      const hr=E.timeOfDay!=null?E.timeOfDay:({day:12,dusk:18.7,night:23,overcast:12})[E.sky];
      LGT.L.on=false;LGT.setOn(true);LGT.L.auto=false;LGT.setHour(hr);if(E.sky==='overcast'){LGT.L.clouds=1;LGT.L.haze=.6;}LGT.apply&&LGT.apply();
    }else if(E.sky==='none'){LGT.setOn(false);}
  },
  applyLook:(l,Wb)=>{
    if(!N0.PROFILES.some(p=>p[0]===l.profile))throw new Error('unknown hardware profile "'+l.profile+'" (see the Hardware list in the Look tab)');
    S.fx=true;S.engine='crt';
    if(l.target==='scene'){S.mask.mode=0;N0.applyProfile(l.profile);bump();return;}
    const m=/^object:(.+)$/.exec(l.target),mm=/^material:(.+)$/.exec(l.target);let targets=[];
    if(m){const o=Wb.map.get(m[1]);if(o)targets=[o];}
    else if(mm){Wb.map.forEach(o=>{let hit=false;o.holder.traverse(n=>{if(n.isMesh&&n.material&&n.material.userData&&n.material.userData.n0m===mm[1])hit=true;});if(hit)targets.push(o);});}
    if(!targets.length)throw new Error('nothing uses that target');
    S.mask.mode=2;targets.forEach(o=>{selectObj(o.id);N0.applyProfile(l.profile);addLook(o);});
  }});
function worldReportSheet(text,opts={}){
  document.querySelectorAll('.n0wsheet').forEach(x=>x.remove());
  const sh=document.createElement('div');sh.className='n0wsheet';sh.style.cssText='position:fixed;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)';
  const box=document.createElement('div');box.className='glass';box.style.cssText='width:min(640px,100%);max-height:86dvh;overflow:auto;padding:16px;border-radius:18px 18px 0 0;background:rgba(18,18,20,.82);backdrop-filter:blur(22px);color:#f2efe9;font:14px/1.45 system-ui,sans-serif';
  sh.appendChild(box);
  const T=(tag,t,st)=>{const e=document.createElement(tag);e.textContent=t;if(st)e.style.cssText=st;return e;};
  box.appendChild(T('h3',opts.title||'World','margin:0 0 6px;font-size:17px'));
  const ta=document.createElement('textarea');ta.spellcheck=false;ta.rows=opts.rows||9;ta.placeholder='Paste a .n0world file here, or choose a file.';ta.value=opts.text||'';ta.style.cssText='width:100%;box-sizing:border-box;font:12px/1.4 ui-monospace,monospace;background:#0d0c0b;color:#f2efe9;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:8px';
  const out=T('pre','', 'white-space:pre-wrap;font:12px/1.45 ui-monospace,monospace;margin:8px 0;max-height:34dvh;overflow:auto');
  const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:8px 0';
  const mk=(t,fn,pri)=>{const b=T('button',t,'min-height:44px;padding:8px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.28);background:'+(pri?'#f2efe9':'rgba(255,255,255,.08)')+';color:'+(pri?'#111':'#f2efe9')+';font:inherit');b.type='button';b.addEventListener('click',fn);return b;};
  let cur=null,lastReport='';
  const check=async()=>{
    out.textContent='';const v=validateWorld(ta.value);cur=v;
    const hash=v.doc?await hashJson(v.doc):'';
    lastReport=v.report.toText('World report'+(hash?' #'+hash:''));
    const st=v.stats||{};out.textContent=(v.ok?'Ready to build: '+st.instances+' objects, '+st.rules+' rules, '+st.lights+' lights, '+st.materials+' materials.\n\n':'')+lastReport;
    build.disabled=!v.ok;build.style.opacity=v.ok?1:.4;return v;};
  const build=mk(S.objs.length?'Replace scene and build':'Build world',async()=>{
    const v=cur||await check();if(!v.ok)return;build.disabled=true;
    try{const r=await NW.build(v.doc);NW.hash=await hashJson(v.doc);NW.report=v.report;
      if(r.failed.length){lastReport+='\nBUILD NOTES:\n'+r.failed.map(f=>'- '+f).join('\n');out.textContent=lastReport;}
      toast('Built “'+v.doc.scene.name+'”. Press Play in World to walk around.',3500);
      if(!r.failed.length&&!v.report.items.length)sh.remove();else{build.textContent='Built';}}
    catch(e){out.textContent='The build stopped: '+(e.message||e)+'\n\n'+lastReport;build.disabled=false;}
  },true);
  const file=document.createElement('input');file.type='file';file.accept='.n0world,.json,application/json';file.hidden=true;
  file.addEventListener('change',async()=>{const f=file.files[0];file.value='';if(!f)return;try{ta.value=await readCapped(f,WLIM.json);check();}catch(e){out.textContent=String(e.message||e);}});
  row.append(mk('Choose file',()=>file.click()),mk('Check',check),build,mk('Copy brief for my AI',async()=>{try{await navigator.clipboard.writeText(WORLD_BRIEF);toast('Copied. Paste it into your AI, then say what world you want.');}catch(e){ta.value=WORLD_BRIEF;toast('Select and copy the text.');}}),mk('Copy report',async()=>{try{await navigator.clipboard.writeText(lastReport||'No report yet.');toast('Copied. Paste it back to your AI.');}catch(e){toast('Select the report text and copy it.');}}),mk('Close',()=>sh.remove()));
  box.append(ta,file,row,out);document.body.appendChild(sh);sh.addEventListener('pointerdown',e=>{if(e.target===sh)sh.remove();});
  build.disabled=true;build.style.opacity=.4;
  if(ta.value)check();return sh;
}
function worldImportSheet(text){if(!NW)return;if(SAFE_MODE){toast('Safe mode is on, so imported worlds are off.');return;}worldReportSheet('',{title:'Import a world',text:text||''});}
async function exportWorldFile(){
  if(!NW)return;
  try{NW.lightsCache=(await api.run({cmd:'scene'})).lights;}catch(e){}
  const {doc,skipped}=NW.exportDoc();
  const v=validateWorld(doc);
  await deliver(new Blob([JSON.stringify(v.doc||doc,null,1)],{type:'application/json'}),(doc.scene.name||'world').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.n0world');
  if(skipped.length)toast('Saved. Not included (imported models): '+skipped.slice(0,3).join(', '),6000);
}
/* ---- FORM: generated objects that keep their recipe ---- */
FORM=createForms({THREE,S,addGroup,toast,bump,renderObjList:()=>renderObjList&&renderObjList(),setShadowFlags,applyView,DOC,SURF,MAT,uPush:()=>uPush&&uPush(),sliderRow,chipRow,btn,el,sec,selectObj,frameAll,autoPlace,deliver,matPresets:MATPRESETS});
RAG=createRagdoll({THREE,scene,walk,S,bump,toast});window.__rag=RAG;
if(NW){NW.ragdoll=RAG;}
if(NW){MECH=createMechanics({THREE,S,walk,camera,canvas,scene,W:NW,toast,bump,objById});NW.mech=MECH;}
SIG=createSigil({THREE,S,scene,camera,controls,canvas,registerObject,objById,selectObj,bump,uPush:()=>uPush&&uPush(),toast,el,btn,sec,sliderRow,chipRow,setShadowFlags,loadCanvas,tc,markDirty,applyView});SIG.build(paneEls.draw);window.__setTab=setTab;
const SGS=createSigilStudio({THREE,SG:SIG,S,el,btn,sliderRow,chipRow,toast,canvas,controls,stage:$('#stage'),bump,setTab,exitStudio:()=>{SGS.close();setTab('scene');if(!mqDesk.matches&&sheet.idx<2)sheet.setIdx(2);},savePic:()=>exportImage(1,true),lookOpen:b=>{const o=SIG.target();if(o&&S.sel!==o.id)selectObj(o.id);const pp=document.getElementById('lookpop');if(pp&&!pp.hidden){pp.hidden=true;return;}window.__lookPop&&window.__lookPop.open('selected',b);}});
window.__sgs=SGS;window.__sig=SIG;
{const w=el('div','chips');w.style.margin='0 0 10px';const ob=btn('Open Sigil studio','pri',()=>SGS.open());w.append(ob);const nt=el('div','note');nt.textContent='A full-screen drawing page made for phones, with the material creator. Everything you draw stays in your scene.';paneEls.draw.insertBefore(nt,paneEls.draw.children[1]);paneEls.draw.insertBefore(w,paneEls.draw.children[1]);}
DOC.setFormHooks({snap:o=>FORM.snap(o)||SIG.snap(o),apply:(o,fm)=>fm&&fm.sg!=null?SIG.apply(o,fm):FORM.apply(o,fm)});
async function importFormFile(file,json,origin='imported'){
  try{
    const text=json?JSON.stringify(json):await readCapped(file,2*65536);
    const v=validateFormFile(text);
    if(!v.ok){const sh=worldReportSheet(v.report.toText('Generator report'),{title:'That generator can’t be used',rows:1,text:''});return;}
    const r=FORM.recipeFromDoc(v.doc);
    const o=await FORM.make(r,{origin,reportText:v.report.items.length?v.report.toText('Generator report'):''});
    if(o){toast('Added “'+r.name+'”. Select it to change its parameters.',3500);selectObj(o.id);}
  }catch(e){toast(String(e.message||e),5000);}
}


/* ---- Usability layer: an object bar on the canvas, shortcuts, duplicate, drop to floor, frame the selection ---- */
function setTool(mode){
  S.pivot=false;S.gizmo=mode||null;const o=objById(S.sel);
  if(o&&S.gizmo){tc.attach(o.holder);tc.setMode(S.gizmo);}else tc.detach();
  bump();try{refreshInspector();}catch(e){}paintBar();
}
function frameObj(o){
  const b=holderBox(o.holder);if(b.isEmpty())return;
  const c=b.getCenter(new THREE.Vector3()),r=Math.max(.4,b.getSize(new THREE.Vector3()).length()*.5),dir=camera.position.clone().sub(controls.target);if(dir.lengthSq()<1e-6)dir.set(1,.6,1);dir.normalize();
  const d=r/Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*1.25;
  controls.target.copy(c);camera.position.copy(c).addScaledVector(dir,d);controls.update();bump();
}
function dropObj(o){
  o.holder.updateMatrixWorld(true);const b=holderBox(o.holder);if(b.isEmpty())return;
  o.holder.position.y-=b.min.y;o.holder.updateMatrixWorld(true);bump();uPush&&uPush();toast('Placed on the floor');
}
async function dupObj(o){
  if(!o){toast('Select something first.');return;}
  try{
    let n=null;const off=Math.max(.5,(holderBox(o.holder).getSize(new THREE.Vector3()).x||1)+.2);
    if(o.meta&&o.meta.form&&FORM){const r=JSON.parse(JSON.stringify(o.meta.form.recipe));n=await FORM.make(r,{origin:'local',name:o.name+' copy'});if(n){n.holder.position.copy(o.holder.position);n.holder.quaternion.copy(o.holder.quaternion);n.holder.scale.copy(o.holder.scale);n.holder.position.x+=off;}}
    else if(NW&&o.meta&&o.meta.n0w&&o.meta.n0w.prefab){n=NW.duplicate(o);if(n)n.holder.position.x+=off;}
    else{const r=await api.run({cmd:'duplicate',id:o.id});n=objById(r.id);}
    if(n){if(!/ copy$/.test(n.name)||n.name===o.name)n.name=o.name+' copy';renderObjList&&renderObjList();selectObj(n.id);uPush&&uPush();toast('Duplicated '+o.name);}
  }catch(e){toast(String(e.message||e),4000);}
}
const bar=document.createElement('div');bar.id='objbar';bar.hidden=true;bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Selected object');
bar.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:var(--objb,calc(54px + env(safe-area-inset-bottom)));z-index:48;display:flex;gap:4px;align-items:center;max-width:calc(100vw - 16px);overflow-x:auto;padding:5px;border-radius:16px;background:rgba(18,18,20,.74);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 10px 30px rgba(0,0,0,.45);color:#f2efe9;font:12px/1 system-ui,sans-serif;white-space:nowrap';
document.body.appendChild(bar);
function paintBar(){
  const o=objById(S.sel);bar.hidden=!o||S.walk||S.exporting||S.tab==='draw';if(bar.hidden)return;
  bar.innerHTML='';
  const B=(label,title,fn,on,key)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title+(key?'  ('+key+')':'');b.setAttribute('aria-label',title);b.setAttribute('aria-pressed',!!on);
    b.style.cssText='min-height:44px;min-width:44px;padding:0 10px;border-radius:12px;border:0;background:'+(on?'#f2efe9':'transparent')+';color:'+(on?'#111':'#f2efe9')+';font:inherit;font-weight:600;cursor:pointer;letter-spacing:.02em';b.addEventListener('click',fn);bar.appendChild(b);return b;};
  const sep=()=>{const d=document.createElement('i');d.style.cssText='width:1px;align-self:stretch;margin:6px 2px;background:rgba(255,255,255,.18)';bar.appendChild(d);};
  const nm=document.createElement('button');nm.type='button';nm.textContent=o.name.length>16?o.name.slice(0,15)+'…':o.name;nm.title='Rename';nm.style.cssText='min-height:44px;max-width:130px;overflow:hidden;text-overflow:ellipsis;padding:0 10px;border:0;background:transparent;color:inherit;font:inherit;opacity:.85;cursor:text';
  nm.addEventListener('click',()=>{const inp=document.createElement('input');inp.value=o.name;inp.maxLength=60;inp.setAttribute('aria-label','Object name');inp.style.cssText='width:130px;min-height:36px;font:inherit;background:#0d0c0b;color:inherit;border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:0 8px';let d=false;const fin=ok=>{if(d)return;d=true;if(ok&&inp.value.trim()){o.name=inp.value.trim();renderObjList&&renderObjList();}paintBar();};inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')fin(true);if(e.key==='Escape')fin(false);});inp.addEventListener('blur',()=>fin(true));nm.replaceWith(inp);inp.focus();inp.select();});
  bar.appendChild(nm);sep();
  B('Move','Move',()=>setTool('translate'),S.gizmo==='translate','W');B('Rotate','Rotate',()=>setTool('rotate'),S.gizmo==='rotate','E');B('Scale','Scale',()=>setTool('scale'),S.gizmo==='scale','R');B('Orbit','Orbit only, no handles',()=>setTool(null),!S.gizmo,'Q');sep();
  B('Material','Material, paint and lights',()=>{setTab('mat');if(!mqDesk.matches&&sheet.idx<2)sheet.setIdx(2);},S.tab==='mat');
  B('Look','Put a hardware look on this',e=>{const pp=document.getElementById('lookpop');if(pp&&!pp.hidden){pp.hidden=true;return;}window.__lookPop&&window.__lookPop.open('selected',e.currentTarget);},false);
  B('Copy','Duplicate',()=>dupObj(o),false,'Ctrl/Cmd+D');B('Floor','Drop to the floor',()=>dropObj(o),false);B('Frame','Frame it',()=>frameObj(o),false,'F');B('Delete','Delete',()=>removeObj(o.id),false,'Del');
}
S.gizmo=S.gizmo||'translate';
{const sel0=selectObj;}
addEventListener('keydown',e=>{
  if(e.target&&e.target.matches&&e.target.matches('input,textarea,select,[contenteditable]'))return;
  if(S.walk)return;
  const k=e.key.toLowerCase(),mod=e.metaKey||e.ctrlKey;
  if(mod&&k==='d'){e.preventDefault();dupObj(objById(S.sel));return;}
  if(mod||e.altKey)return;
  if(k==='w'){setTool('translate');}else if(k==='e'){setTool('rotate');}else if(k==='r'){setTool('scale');}else if(k==='q'){setTool(null);}
  else if(k==='g'){const gb=document.getElementById('bGrid');gb&&gb.click();}
  else if(k==='escape'){if(S.sel!=null){S.sel=null;tc.detach();setSelBox();renderObjList&&renderObjList();try{refreshInspector();}catch(x){}bump();paintBar();}}
  else if(k==='?'||(k==='/'&&e.shiftKey)){shortcutSheet();}
});
function shortcutSheet(){
  const ex=document.getElementById('n0keys');if(ex){ex.remove();return;}
  const sh=document.createElement('div');sh.id='n0keys';sh.style.cssText='position:fixed;inset:0;z-index:92;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
  const box=document.createElement('div');box.className='glass';box.style.cssText='width:min(440px,calc(100vw - 24px));max-height:86dvh;overflow:auto;padding:16px;border-radius:18px;background:rgba(18,18,20,.88);backdrop-filter:blur(22px);color:#f2efe9;font:14px/1.5 system-ui,sans-serif';
  const rows=[['W · E · R','Move · rotate · scale handles'],['Q','Orbit only'],['F','Frame the selection (or everything)'],['Ctrl/Cmd + D','Duplicate'],['Delete','Delete'],['Ctrl/Cmd + Z / Shift','Undo / redo'],['Esc','Deselect'],['G','Grid on or off'],['Space (hold)','Compare with the original picture'],['Click a number','Type an exact value'],['Walk mode','WASD move · Space jump · E use or drive · F or click shoot · Esc back']];
  const h=document.createElement('div');h.textContent='Shortcuts';h.style.cssText='font-weight:700;font-size:16px;margin-bottom:8px';box.appendChild(h);
  rows.forEach(([a,b])=>{const r=document.createElement('div');r.style.cssText='display:flex;gap:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08)';const x=document.createElement('b');x.textContent=a;x.style.cssText='flex:0 0 150px';const y=document.createElement('span');y.textContent=b;r.append(x,y);box.appendChild(r);});
  const c=document.createElement('button');c.type='button';c.textContent='Close';c.style.cssText='margin-top:12px;min-height:44px;padding:8px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:inherit;font:inherit';c.addEventListener('click',()=>sh.remove());box.appendChild(c);
  sh.appendChild(box);document.body.appendChild(sh);sh.addEventListener('pointerdown',e=>{if(e.target===sh)sh.remove();});addEventListener('keydown',function f(e){if(e.key==='Escape'){sh.remove();removeEventListener('keydown',f);}});
}
{const hb=document.getElementById('hudBR');if(hb){const q=document.createElement('button');q.className='chipb';q.type='button';q.textContent='?';q.title='Shortcuts';q.setAttribute('aria-label','Shortcuts');q.addEventListener('click',shortcutSheet);hb.appendChild(q);}}

/* ---- Look: one obvious place to put a hardware profile on something. Pick what it goes on, pick the profile, see it at once. ---- */
{
  const QL={target:'selected',open:false};
  const fxBtn=document.getElementById('bFx');
  if(fxBtn&&fxBtn.parentNode){
    const lb=document.createElement('button');lb.id='bLook';lb.type='button';lb.className=fxBtn.className;lb.textContent='LOOK';lb.setAttribute('aria-haspopup','true');lb.setAttribute('aria-expanded','false');lb.style.marginRight='6px';
    fxBtn.parentNode.insertBefore(lb,fxBtn);
    const pop=document.createElement('div');pop.id='lookpop';pop.hidden=true;
    pop.style.cssText='position:fixed;z-index:70;width:min(320px,calc(100vw - 16px));max-height:min(68dvh,560px);overflow:auto;padding:12px;border-radius:16px;background:rgba(18,18,20,.86);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 12px 40px rgba(0,0,0,.5);color:#f2efe9;font:13px/1.4 system-ui,sans-serif';
    document.body.appendChild(pop);
    const T=(tag,t,st)=>{const e=document.createElement(tag);e.textContent=t;if(st)e.style.cssText=st;return e;};
    const chipSt=on=>'min-height:44px;padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:'+(on?'#f2efe9':'rgba(255,255,255,.07)')+';color:'+(on?'#111':'#f2efe9')+';font:inherit;cursor:pointer';
    const playerObj=()=>S.objs.find(x=>x.meta&&x.meta.player);
    const curObj=()=>{if(QL.target==='player')return playerObj()||null;if(QL.target==='sky'||QL.target==='light'||QL.target==='ground')return objById(QL.target);const o=objById(S.sel!=null?S.sel:S.fxTarget)||(S.objs.length===1?S.objs[0]:null);return o&&!PSEUDO.includes(o)?o:null;};
    function apply(id){
      S.fx=true;S.engine='crt';
      if(id==='none'){
        if(QL.target==='scene'){N0.applyProfile('none');S.fx=false;}else{const o=curObj();if(o&&o.look)removeLook(o);}
        bump();paint();return;}
      if(QL.target==='scene'){S.mask.mode=0;N0.applyProfile(id);toast('Look on the whole scene');}
      else{
        const o=curObj();if(!o){toast('Tap an object first, or choose Whole scene.');return;}
        S.mask.mode=2;S.lookOff=false;N0.applyProfile(id);
        if(o.look){o.look=cloneP();S.apprSnap=apprGet();}else addLook(o);
        S.fxTarget=o.id;
        toast(N0.PROFILES.find(x=>x[0]===id)[1]+' on '+o.name+'. It stays on it as it moves.');}
      try{rebuildLook&&paneEls.look&&rebuildLook();}catch(e){}
      const f=document.getElementById('bFx');if(f)f.setAttribute('aria-pressed',true);
      bump();paint();
    }
    function paint(){
      pop.innerHTML='';
      pop.appendChild(T('div','Look','font-weight:700;font-size:15px;margin-bottom:2px'));
      pop.appendChild(T('div','Hardware looks from old screens and cameras. Pick what it goes on, then a profile.','opacity:.75;margin-bottom:8px'));
      const row=document.createElement('div');row.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px';
      const o=curObj();
      [['selected',(()=>{const so=(()=>{const t=QL.target;QL.target='selected';const r=curObj();QL.target=t;return r;})();return so?'On '+(so.name.length>14?so.name.slice(0,13)+'…':so.name):'On selected object';})()],...(playerObj()&&(()=>{const t=QL.target;QL.target='selected';const r=curObj();QL.target=t;return r!==playerObj();})()?[['player','On the character']]:[]),['sky','Sky'],['light','Lighting'],['ground','Ground'],['scene','Whole scene']].forEach(([v,l])=>{const b=T('button',l,chipSt(QL.target===v));b.type='button';b.addEventListener('click',()=>{QL.target=v;if(v==='scene'){S.mask.mode=0;}else{S.mask.mode=2;}S.fx=true;bump();paint();});row.appendChild(b);});
      pop.appendChild(row);
      const cur=QL.target==='scene'?(S.mask.mode===0&&S.fx?N0.P.profile:'none'):(o&&o.look?o.look.profile:'none');
      const grid=document.createElement('div');grid.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
      N0.PROFILES.forEach(([id,label])=>{const b=T('button',label,chipSt(cur===id));b.type='button';b.style.minHeight='40px';b.addEventListener('click',()=>apply(id));grid.appendChild(b);});
      pop.appendChild(grid);
      const am=document.createElement('label');am.style.cssText='display:flex;gap:10px;align-items:center;margin-top:10px;min-height:44px';am.appendChild(T('span','Amount','width:60px'));
      const i=document.createElement('input');i.type='range';i.min=0;i.max=1;i.step=.01;i.value=S.mask.amt;i.style.flex='1';i.addEventListener('input',()=>{S.mask.amt=+i.value;bump();});am.appendChild(i);pop.appendChild(am);
    }
    const place=()=>{const r=(QL.anchor||lb).getBoundingClientRect();pop.style.top=Math.max(8,Math.min(innerHeight-pop.offsetHeight-8,r.top>innerHeight*.55?r.top-pop.offsetHeight-8:r.bottom+8))+'px';pop.style.left=Math.max(8,Math.min(innerWidth-pop.offsetWidth-8,r.right-pop.offsetWidth))+'px';};
    const close=()=>{pop.hidden=true;lb.setAttribute('aria-expanded','false');};
    const openPop=(target,anchor)=>{QL.anchor=anchor||lb;if(target)QL.target=target;else QL.target=S.walk&&playerObj()?'player':(curObj()||S.objs.length===0?QL.target:'scene');if(QL.target==='player'&&!playerObj())QL.target='selected';if(QL.target==='selected'&&!curObj()&&S.objs.length)QL.target='scene';if(QL.target==='scene'){S.mask.mode=S.mask.mode===2&&anyLook()?2:S.mask.mode;}paint();pop.hidden=false;lb.setAttribute('aria-expanded','true');place();};
    lb.addEventListener('click',e=>{e.stopPropagation();if(!pop.hidden){close();return;}openPop();});
    document.addEventListener('pointerdown',e=>{if(!pop.hidden&&!pop.contains(e.target)&&e.target!==lb&&!(QL.anchor&&QL.anchor.contains(e.target)))close();},true);
    addEventListener('keydown',e=>{if(e.key==='Escape'&&!pop.hidden)close();});
    addEventListener('resize',()=>{if(!pop.hidden)place();});
    window.__lookPop={apply,paint,QL,open:openPop};
    /* while walking the viewport buttons are hidden: keep a Look button in reach */
    const wl=document.createElement('button');wl.type='button';wl.id='walkLook';wl.textContent='LOOK';wl.setAttribute('aria-label','Hardware look');
    wl.style.cssText='position:fixed;top:calc(12px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right));z-index:61;min-height:44px;min-width:64px;padding:8px 14px;border-radius:22px;border:1px solid rgba(255,255,255,.35);background:rgba(20,20,22,.6);color:#fff;backdrop-filter:blur(14px);font:inherit;letter-spacing:.06em;display:none;cursor:pointer';
    wl.addEventListener('click',e=>{e.stopPropagation();if(!pop.hidden){close();return;}openPop(null,wl);});document.body.appendChild(wl);
    new MutationObserver(()=>{wl.style.display=document.body.dataset.walk?'block':'none';if(!document.body.dataset.walk)QL.anchor=lb;}).observe(document.body,{attributes:true,attributeFilter:['data-walk']});
  }
}
/* ---- Walk photography: a viewfinder, zoom, a shutter (P, button or tap) and a roll of the photos you took ---- */
{
  const PH={on:false,roll:[]};window.__photo=PH;
  const mk=(tag,css,txt)=>{const e=document.createElement(tag);e.style.cssText=css;if(txt)e.textContent=txt;return e;};
  const btnCss='position:fixed;z-index:61;min-height:44px;min-width:44px;padding:8px 14px;border-radius:22px;border:1px solid rgba(255,255,255,.35);background:rgba(20,20,22,.6);color:#fff;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font:600 12px system-ui,sans-serif;letter-spacing:.06em;cursor:pointer;';
  const toggle=mk('button',btnCss+'top:calc(68px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right));display:none','PHOTO');toggle.type='button';toggle.setAttribute('aria-label','Photo mode');
  const shut=mk('button','position:fixed;z-index:61;left:50%;transform:translateX(-50%);bottom:calc(28px + env(safe-area-inset-bottom));width:68px;height:68px;border-radius:50%;border:4px solid #fff;background:rgba(255,255,255,.22);backdrop-filter:blur(10px);display:none;cursor:pointer;box-shadow:0 0 0 2px rgba(0,0,0,.35)');shut.type='button';shut.setAttribute('aria-label','Take photo');
  const vf=mk('div','position:fixed;inset:0;z-index:40;pointer-events:none;display:none');
  const corner=(a)=>{const c=mk('i','position:absolute;width:34px;height:34px;border:0 solid rgba(255,255,255,.85);'+a);return c;};
  vf.append(corner('left:6%;top:8%;border-left-width:2px;border-top-width:2px'),corner('right:6%;top:8%;border-right-width:2px;border-top-width:2px'),corner('left:6%;bottom:8%;border-left-width:2px;border-bottom-width:2px'),corner('right:6%;bottom:8%;border-right-width:2px;border-bottom-width:2px'),mk('i','position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px;border:1.5px solid rgba(255,255,255,.7);border-radius:50%'));
  const info=mk('div','position:absolute;left:50%;top:calc(8% + 6px);transform:translateX(-50%);font:600 12px ui-monospace,monospace;color:#fff;text-shadow:0 1px 3px #000;letter-spacing:.08em');vf.appendChild(info);
  const flash=mk('div','position:fixed;inset:0;z-index:70;background:#fff;opacity:0;pointer-events:none;transition:opacity .35s');
  const strip=mk('div','position:fixed;z-index:61;left:calc(12px + env(safe-area-inset-left));bottom:calc(20px + env(safe-area-inset-bottom));display:none;gap:6px;max-width:55vw;overflow-x:auto');
  const rg=mk('button',btnCss+'top:calc(124px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right));display:none','RAGDOLL');rg.type='button';rg.setAttribute('aria-label','Ragdoll: go limp or get up (X)');rg.addEventListener('click',e=>{e.stopPropagation();RAG&&RAG.toggle();});
  document.body.append(toggle,shut,vf,flash,strip,rg);
  let fov0=null;
  const label=()=>{info.textContent=Math.round(36/Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*.364)+' mm · '+(PH.roll.length?PH.roll.length+' photo'+(PH.roll.length>1?'s':''):'P takes a photo');};
  function show(){const w=document.body.dataset.walk;rg.style.display=w&&!walk.noJump?'block':'none';toggle.style.display=w?'block':'none';shut.style.display=w&&PH.on?'block':'none';vf.style.display=w&&PH.on?'block':'none';strip.style.display=w&&PH.roll.length?'flex':'none';if(!w&&PH.on)set(false);}
  function set(on){PH.on=on;toggle.setAttribute('aria-pressed',on);toggle.style.background=on?'#f2efe9':'rgba(20,20,22,.6)';toggle.style.color=on?'#111':'#fff';
    if(on){if(fov0==null)fov0=camera.fov;label();}else if(fov0!=null){camera.fov=fov0;camera.updateProjectionMatrix();fov0=null;}show();PH.onChange&&PH.onChange(on);bump();}
  toggle.addEventListener('click',e=>{e.stopPropagation();set(!PH.on);});
  async function take(){
    if(!document.body.dataset.walk)return;
    flash.style.transition='none';flash.style.opacity='.85';requestAnimationFrame(()=>{flash.style.transition='opacity .35s';flash.style.opacity='0';});
    try{const a=new (window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.type='square';o.frequency.value=1800;g.gain.value=.04;o.connect(g);g.connect(a.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.06);o.stop(a.currentTime+.07);setTimeout(()=>a.close(),300);}catch(e){}
    bump();await waitFrames(2);
    let blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(blob&&PH.crop)blob=await PH.crop(blob);if(!blob){toast('The photo failed. Try again.');return;}
    const url=URL.createObjectURL(blob),im=mk('img','height:56px;min-width:44px;border-radius:8px;border:2px solid #fff;cursor:pointer;flex:none;object-fit:cover');im.src=url;im.title='Save this photo';im.alt='Photo';
    const name='n0ise-photo-'+Date.now().toString(36)+'.png';
    im.addEventListener('click',e=>{e.stopPropagation();deliver(blob,name);});
    PH.roll.push({blob,url,name});strip.appendChild(im);if(PH.roll.length>12){const x=PH.roll.shift();URL.revokeObjectURL(x.url);strip.firstChild.remove();}
    label();show();toast('Photo taken. Tap it at the bottom left to save.',2200);try{PH.onTake&&PH.onTake(blob);}catch(e){console.error(e);}
  }
  PH.take=take;PH.set=set;PH.label=label;PH.shut=shut;PH.vf=vf;shut.addEventListener('click',e=>{e.stopPropagation();take();});
  addEventListener('keydown',e=>{if(!document.body.dataset.walk||e.repeat||(e.target&&e.target.matches&&e.target.matches('input,textarea')))return;if(e.key==='p'||e.key==='P'){if(!PH.on)set(true);take();}},true);
  canvas.addEventListener('wheel',e=>{if(!PH.on||!document.body.dataset.walk||walk.third)return;e.preventDefault();camera.fov=Math.max(14,Math.min(85,camera.fov*(e.deltaY>0?1.08:.926)));camera.updateProjectionMatrix();label();bump();},{passive:false});
  new MutationObserver(show).observe(document.body,{attributes:true,attributeFilter:['data-walk']});show();
}


/* ---- Photo pro tools: lenses, frame shapes, thirds grid, self-timer, and a shot list that scores your framing ---- */
if(window.__photo){
  const PH=window.__photo,T={mm:0,asp:0,grid:false,timer:false,goals:[],best:+(localStorage.getItem('n0ise.photowalk.best')||0)};
  const mk=(tag,css,txt)=>{const e=document.createElement(tag);e.style.cssText=css;if(txt!=null)e.textContent=txt;return e;};
  const glass='background:rgba(20,20,22,.62);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.28);color:#fff;';
  const bar=mk('div','position:fixed;z-index:62;left:50%;transform:translateX(-50%);bottom:calc(108px + env(safe-area-inset-bottom));width:min(94vw,640px);display:none;gap:6px;overflow-x:auto;padding:4px;scrollbar-width:none;border-radius:26px;'+glass);bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Camera settings');
  const pill=(label,aria,fn)=>{const b=mk('button','flex:none;min-height:44px;min-width:44px;padding:0 12px;border-radius:22px;border:0;background:transparent;color:#fff;font:700 12px system-ui,sans-serif;letter-spacing:.04em;cursor:pointer','');b.type='button';b.textContent=label;b.setAttribute('aria-label',aria);b.addEventListener('click',e=>{e.stopPropagation();fn(b);});return b;};
  const mark=(b,on)=>{b.setAttribute('aria-pressed',on);b.style.background=on?'#f2efe9':'transparent';b.style.color=on?'#111':'#fff';};
  const sep=()=>mk('i','flex:none;width:1px;background:rgba(255,255,255,.25);margin:8px 2px');
  const LENS=[[0,'Std'],[18,'18'],[24,'24'],[35,'35'],[50,'50'],[85,'85'],[135,'135']],lb=[];
  const setLens=mm=>{T.mm=mm;if(mm){camera.fov=2*Math.atan(13.104/mm)*180/Math.PI;camera.updateProjectionMatrix();}PH.label&&PH.label();lb.forEach(([m,b])=>mark(b,m===mm));bump();};
  LENS.forEach(([m,l])=>{const b=pill(l+(m?'mm':''),m?m+' millimetre lens':'Standard lens',()=>{if(m&&!camera._std)camera._std=camera.fov;if(!m&&camera._std){camera.fov=camera._std;camera._std=null;camera.updateProjectionMatrix();}setLens(m);});lb.push([m,b]);bar.appendChild(b);});
  bar.appendChild(sep());
  const ASP=[[0,'Full'],[3/2,'3:2'],[4/5,'4:5'],[1,'1:1'],[16/9,'16:9'],[9/16,'9:16'],[2.39,'2.39']],ab=[];
  const win=mk('div','position:absolute;pointer-events:none;box-shadow:0 0 0 100vmax rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.55);display:none');
  const gridEl=mk('div','position:absolute;inset:0;background:linear-gradient(90deg,transparent calc(33.3% - .5px),rgba(255,255,255,.4) 0 calc(33.3% + .5px),transparent 0 calc(66.6% - .5px),rgba(255,255,255,.4) 0 calc(66.6% + .5px),transparent 0),linear-gradient(0deg,transparent calc(33.3% - .5px),rgba(255,255,255,.4) 0 calc(33.3% + .5px),transparent 0 calc(66.6% - .5px),rgba(255,255,255,.4) 0 calc(66.6% + .5px),transparent 0);display:none');win.appendChild(gridEl);PH.vf.appendChild(win);
  function frame(){const W=innerWidth,H=innerHeight;if(!T.asp)return {x:0,y:0,w:W,h:H};const m=.94,a=T.asp;let w=W*m,h=w/a;if(h>H*.74){h=H*.74;w=h*a;}return {x:(W-w)/2,y:(H-h)/2,w,h};}
  function paintFrame(){const r=frame(),on=!!T.asp;win.style.display=on||T.grid?'block':'none';win.style.boxShadow=on?'0 0 0 100vmax rgba(0,0,0,.6)':'none';win.style.border=on?'1px solid rgba(255,255,255,.55)':'0';
    win.style.left=r.x+'px';win.style.top=r.y+'px';win.style.width=r.w+'px';win.style.height=r.h+'px';gridEl.style.display=T.grid?'block':'none';ab.forEach(([a,b])=>mark(b,a===T.asp));}
  ASP.forEach(([a,l])=>{const b=pill(l,a?'Frame shape '+l:'Full screen frame',()=>{T.asp=a;paintFrame();});ab.push([a,b]);bar.appendChild(b);});
  bar.appendChild(sep());
  const gb=pill('Grid','Thirds grid',b=>{T.grid=!T.grid;mark(b,T.grid);paintFrame();});bar.appendChild(gb);
  const tb=pill('3s','Three second timer',b=>{T.timer=!T.timer;mark(b,T.timer);});bar.appendChild(tb);
  /* phone motion (settings, off by default): tilt the phone to look, walk on the spot to move, and let your real stride bob the view */
  const MO={tilt:localStorage.getItem('n0ise.mo.tilt')==='1',steps:localStorage.getItem('n0ise.mo.steps')==='1',bob:localStorage.getItem('n0ise.mo.bob')==='1',lastA:null,lastB:null,g:9.8,bobV:0,lt:0,on:false};
  const moAsk=async()=>{try{for(const C of [window.DeviceOrientationEvent,window.DeviceMotionEvent]){if(C&&typeof C.requestPermission==='function'){const r=await C.requestPermission();if(r!=='granted')return false;}}return true;}catch(e){return false;}};
  const moOn=()=>MO.tilt||MO.steps||MO.bob;
  const onOri=e=>{if(!MO.tilt||!window.__studio||!walk.on||e.alpha==null||e.beta==null)return;
    const ang=(screen.orientation&&screen.orientation.angle)||0;if(ang!==0&&ang!==180){MO.lastA=null;return;} // portrait only
    if(MO.lastA!=null&&e.beta<170){let dA=e.alpha-MO.lastA;if(dA>180)dA-=360;if(dA<-180)dA+=360;const dB=e.beta-MO.lastB;if(Math.abs(dA)<40&&Math.abs(dB)<40)walk.rotate(dA*Math.PI/180,dB*Math.PI/180);}
    MO.lastA=e.alpha;MO.lastB=e.beta;};
  const onMot=e=>{if(!walk.on||!(MO.steps||MO.bob)){MO.bobV=0;walk.setBob(0);return;}const a=e.accelerationIncludingGravity;if(!a||a.x==null)return;
    const m=Math.hypot(a.x,a.y,a.z);MO.g+=(m-MO.g)*.04;const hp=m-MO.g,now=performance.now();
    if(MO.steps&&hp>2.4&&now-MO.lt>340){MO.lt=now;walk.step();}
    if(MO.bob){MO.bobV+=(Math.max(-.07,Math.min(.07,hp*.012))-MO.bobV)*.35;walk.setBob(MO.bobV);}else walk.setBob(0);};
  const moSync=()=>{const want=moOn();if(want&&!MO.on){addEventListener('deviceorientation',onOri);addEventListener('devicemotion',onMot);MO.on=true;MO.lastA=null;}else if(!want&&MO.on){removeEventListener('deviceorientation',onOri);removeEventListener('devicemotion',onMot);MO.on=false;walk.setBob(0);}};
  if(('ontouchstart' in window||navigator.maxTouchPoints>0)&&window.DeviceOrientationEvent){
    if(typeof window.DeviceOrientationEvent.requestPermission==='function'){MO.tilt=MO.steps=MO.bob=false;} // iOS asks again each visit, so start off
    bar.appendChild(sep());
    [['tilt','Tilt','Tilt the phone to look around'],['steps','Steps','Walk on the spot to move forward'],['bob','Bob','Your real stride bobs the view']].forEach(([k,l,aria])=>{
      const b=pill(l,aria,async()=>{if(!MO[k]){if(!await moAsk()){toast('Motion access was declined. Allow it in the browser or Settings to use phone motion.',4200);return;}}MO[k]=!MO[k];localStorage.setItem('n0ise.mo.'+k,MO[k]?'1':'0');mark(b,MO[k]);MO.lastA=null;moSync();if(window.hap)window.hap(10);});
      mark(b,MO[k]);bar.appendChild(b);});
    moSync();
  }
  addEventListener('resize',paintFrame);
  document.body.appendChild(bar);
  /* crop the saved photo to the frame shape */
  PH.crop=async blob=>{if(!T.asp)return blob;try{const bm=await createImageBitmap(blob),r=frame(),sx=bm.width/innerWidth,sy=bm.height/innerHeight;
    const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(r.w*sx));cv.height=Math.max(1,Math.round(r.h*sy));cv.getContext('2d').drawImage(bm,Math.round(r.x*sx),Math.round(r.y*sy),cv.width,cv.height,0,0,cv.width,cv.height);bm.close&&bm.close();
    return await new Promise(res=>cv.toBlob(b=>res(b||blob),'image/png'));}catch(e){return blob;}};
  /* self-timer: the first click starts a count, the photo is taken at zero */
  const cd=mk('div','position:fixed;inset:0;z-index:71;display:none;place-items:center;font:800 120px system-ui,sans-serif;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.6);pointer-events:none');document.body.appendChild(cd);
  PH.shut.addEventListener('click',e=>{if(!T.timer||T.busy)return;e.stopImmediatePropagation();T.busy=true;let n=3;cd.style.display='grid';cd.textContent=n;const iv=setInterval(()=>{n--;if(n<=0){clearInterval(iv);cd.style.display='none';T.busy=false;PH.take();}else cd.textContent=n;},1000);},true);
  /* shot list */
  const panel=mk('div','position:fixed;z-index:61;left:calc(12px + env(safe-area-inset-left));top:calc(68px + env(safe-area-inset-top));max-width:min(210px,52vw);padding:10px 12px;border-radius:16px;display:none;font:600 11px/1.5 system-ui,sans-serif;'+glass);panel.setAttribute('aria-live','polite');document.body.appendChild(panel);
  const objFor=id=>S.objs.find(o=>o.meta&&o.meta.n0w&&o.meta.n0w.id===id);
  const stars=n=>'★'.repeat(n)+'☆'.repeat(3-n);
  function paintGoals(){
    if(!T.goals.length){panel.style.display='none';return;}
    const done=T.goals.filter(g=>g.stars>0).length,tot=T.goals.reduce((a,g)=>a+g.stars,0);
    panel.innerHTML='';panel.appendChild(mk('div','font:800 10px system-ui;letter-spacing:.16em;text-transform:uppercase;color:#ff9b6b;margin-bottom:4px','Shot list '+done+'/'+T.goals.length));
    T.goals.forEach(g=>{const r=mk('div','display:flex;justify-content:space-between;gap:8px;opacity:'+(g.stars?'.95':'.8'));r.append(mk('span','',g.label),mk('span','color:'+(g.stars?'#ffd84a':'#aaa'),g.stars?stars(g.stars):'·'));panel.appendChild(r);});
    panel.appendChild(mk('div','margin-top:6px;color:#bbb','Stars '+tot+'/'+(T.goals.length*3)+(T.best?' · best '+T.best:'')));
    show();
  }
  function show(){const on=!!document.body.dataset.walk;bar.style.display=on&&PH.on?'flex':'none';panel.style.display=on&&T.goals.length?'block':'none';PH.vf.firstChild&&paintFrame();}
  const _V=new THREE.Vector3(),_B=new THREE.Box3(),_R=new THREE.Raycaster();
  function score(g){
    const o=objFor(g.id);if(!o)return {s:0,why:'That subject is not in this world.'};
    _B.setFromObject(o.holder);if(_B.isEmpty())return {s:0,why:'Nothing to see.'};
    const r=frame(),c=_B.getCenter(new THREE.Vector3());
    camera.updateMatrixWorld();const px=v=>{const p=v.clone().project(camera);return {x:(p.x+1)/2*innerWidth,y:(1-p.y)/2*innerHeight,z:p.z};};
    const pc=px(c);if(pc.z>1)return {s:0,why:'Turn around: '+g.label.toLowerCase()+' is behind you.'};
    if(pc.x<r.x||pc.x>r.x+r.w||pc.y<r.y||pc.y>r.y+r.h)return {s:0,why:'Get '+g.label.toLowerCase()+' inside the frame.'};
    /* is something in the way? */
    _R.set(camera.position,c.clone().sub(camera.position).normalize());const hits=_R.intersectObjects(scene.children,true).filter(h=>h.object.visible&&!h.object.userData.noView&&!(h.object.isLine||h.object.isPoints));
    const dist=camera.position.distanceTo(c);let blocked=false;for(const h of hits){let n=h.object,mine=false;while(n){if(n===o.holder){mine=true;break;}n=n.parent;}if(mine)break;if(h.distance<dist-.8){blocked=true;break;}}
    if(blocked)return {s:0,why:'Something is in the way of '+g.label.toLowerCase()+'.'};
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const xx of[_B.min.x,_B.max.x])for(const yy of[_B.min.y,_B.max.y])for(const zz of[_B.min.z,_B.max.z]){const q=px(_V.set(xx,yy,zz));x0=Math.min(x0,q.x);x1=Math.max(x1,q.x);y0=Math.min(y0,q.y);y1=Math.max(y1,q.y);}
    const frac=Math.max((x1-x0)/r.w,(y1-y0)/r.h),size=30*Math.max(0,1-Math.abs(Math.min(frac,1.2)-.45)/.45);
    const pts=[[.5,.5],[1/3,1/3],[2/3,1/3],[1/3,2/3],[2/3,2/3]];let d=9;for(const [a,b] of pts){d=Math.min(d,Math.hypot((pc.x-r.x)/r.w-a,(pc.y-r.y)/r.h-b));}
    const place=30*Math.max(0,1-d/.28);
    const s=Math.round(40+size+place);
    return {s,why:frac<.15?'Move closer or use a longer lens.':frac>.9?'Too tight. Step back or use a wider lens.':d>.28?'Try placing it on a thirds point.':'Nice framing.'};
  }
  PH.onTake=()=>{
    if(!T.goals.length)return;
    const open=T.goals.map(g=>({g,r:score(g)})).sort((a,b)=>b.r.s-a.r.s)[0];
    if(!open||!open.r.s){const hint=T.goals.filter(g=>!g.stars).map(g=>score(g)).find(x=>x.why);toast('No shot-list subject in that photo. '+(hint&&hint.why||''),3600);return;}
    const n=open.r.s>=85?3:open.r.s>=65?2:1;
    if(n>open.g.stars){open.g.stars=n;}
    toast(open.g.label+' '+stars(n)+' · '+open.r.s+' points. '+open.r.why,3600);
    const tot=T.goals.reduce((a,g)=>a+g.stars,0);
    if(T.goals.every(g=>g.stars>0)){if(tot>T.best){T.best=tot;try{localStorage.setItem('n0ise.photowalk.best',String(tot));}catch(e){}}setTimeout(()=>toast('Roll complete. '+tot+' of '+T.goals.length*3+' stars. Retake any shot to improve it.',6000),3700);}
    paintGoals();
  };
  PH.startGoals=list=>{T.goals=list.filter(g=>objFor(g.id)).map(g=>({id:g.id,label:g.label,stars:0}));paintGoals();};
  PH.clearGoals=()=>{T.goals=[];paintGoals();};
  const prevChange=PH.onChange;PH.onChange=on=>{prevChange&&prevChange(on);if(!on){setLens(0);}show();};
  new MutationObserver(()=>{show();if(!document.body.dataset.walk){T.goals.length&&0;}}).observe(document.body,{attributes:true,attributeFilter:['data-walk']});
  setLens(0);paintFrame();mark(gb,false);mark(tb,false);show();
}

/* the World pane: import, export, and edit the parameters of a selected prefab */

/* ---- Places: the existing block-based Physics Sandbox, and the Night Station world. Same character, same mechanics, same look controls. ---- */
const SHOTS=[{id:'sign',label:'The shop sign'},{id:'pump1',label:'A fuel pump'},{id:'car',label:'The parked car'},{id:'lamphead',label:'The street lamp'},{id:'tvscreen',label:'The TV'}];
async function loadPlace(kind){
  if(walk.on)walk.exit();
  S.photoWalk=kind==='photowalk';
  const file=kind==='photowalk'?'night-station':kind;
  try{
    S.objs.filter(o=>!(o.meta&&o.meta.player)).map(o=>o.id).forEach(removeObj);
    try{await api.run({cmd:'light',op:'clear'});}catch(e){}
    S.start=null;S.startYaw=0;
    if(kind==='sandbox'){await worldEd.level();}
    else if(kind==='blank'){worldEd.starter();}
    else if(kind==='level'){worldEd.starter();await worldEd.level();}
    else{
      const r=await fetch('worlds/'+file+'.n0world');if(!r.ok)throw new Error('The world file could not be loaded ('+r.status+').');
      const v=validateWorld(await r.json());if(!v.ok)throw new Error((v.report.errors[0]||{}).msg||'invalid world');
      await NW.build(v.doc);NW.hash=await hashJson(v.doc);NW.report=v.report;
      if(kind==='photowalk'){ // a calm walk: no pistol, no targets
        S.objs.filter(o=>o.meta&&o.meta.n0w&&(o.meta.n0w.id==='pistol_pickup'||o.meta.n0w.prefab==='target')).map(o=>o.id).forEach(removeObj);
        if(NW.flags&&NW.flags.clear)try{NW.flags.clear();}catch(e){}
      }
    }
    S.needFrame=true;frameAll();bump();
    if(kind==='photowalk'){await playWorld();if(window.__photo&&window.__photo.startGoals)window.__photo.startGoals(SHOTS);toast('Photo walk. Find each subject on your shot list, frame it, and press the shutter.',5200);}
    else toast(kind==='sandbox'?'Physics Sandbox. Press Play as character to try it.':kind==='night-station'?'Night Station. Press Play as character, then walk to the shop.':kind==='blank'?'Blank world. Add things from the Scene tab.':'Ready. Press Play as character to try it.',4500);
  }catch(e){toast(String(e.message||e),6000);console.error(e);}
}
/* the World start page: the front door of World mode. Demo, photo walk, blank, starters, import. */
const WS=document.getElementById('wstart');
function wsHide(){if(!WS||WS.hidden)return;WS.classList.add('out');setTimeout(()=>{WS.hidden=true;WS.classList.remove('out');},300);}
function wsShow(){if(!WS)return;WS.hidden=false;WS.classList.remove('out');const f=WS.querySelector('.card');f&&f.focus();}
if(WS){
  WS.querySelectorAll('[data-w]').forEach(b=>b.addEventListener('click',async()=>{
    const k=b.dataset.w;S._wsChosen=true;wsHide();
    if(k==='import'){worldImportSheet('');return;}
    await loadPlace(k);
  }));
  $('#wsback').addEventListener('click',()=>{S._wsChosen=true;wsHide();const L=document.getElementById('launch');if(L&&!L.hidden)return;});
  addEventListener('keydown',e=>{if(!WS.hidden&&e.key==='Escape'){S._wsChosen=true;wsHide();}});
}
window.__wsShow=wsShow;
if(NW&&paneEls.world){
  const ps=sec(paneEls.world,'Start','new world, demo or photo walk');
  const pr=el('div','chips');pr.append(btn('World start page','pri',()=>wsShow()));ps.appendChild(pr);
  paneEls.world.insertBefore(ps,paneEls.world.firstChild);
}
if(NW&&paneEls.world){
  const wp=paneEls.world,s0=sec(wp,'AI worlds');
  s0.appendChild(el('div','note','Import a world an AI wrote (.n0world), explore it, change anything, then export it again. Files are checked first and anything unsupported is listed.'));
  const row=el('div','chips');row.append(btn('Import world','pri',()=>worldImportSheet('')),btn('Export .n0world','',exportWorldFile));s0.appendChild(row);
  const live=el('div');s0.appendChild(live);
  window.__n0wRefresh=()=>{
    live.innerHTML='';const o=objById(S.sel),m=o&&o.meta&&o.meta.n0w;if(!m||!m.prefab)return;
    const spec=PREFABS[m.prefab];{const h=el('div','sub');h.textContent=spec.label+' · '+m.id;live.appendChild(h);}
    Object.keys(spec.params).forEach(k=>{const ps=spec.params[k];
      if(ps.t==='num'||ps.t==='int')sliderRow(live,k,()=>m.params[k],v=>{NW.setParams(o,{[k]:v});},ps.min,ps.max,ps.t==='int'?1:(ps.max-ps.min)>20?.1:.01);
      else if(ps.t==='bool'){const b=btn(k+': '+(m.params[k]?'on':'off'),'',()=>{NW.setParams(o,{[k]:!m.params[k]});window.__n0wRefresh();});live.appendChild(b);}
      else if(ps.t==='enum'){chipRow(live,ps.opts.map(v=>[v,v]),v=>m.params[k]===v,v=>{NW.setParams(o,{[k]:v});window.__n0wRefresh();});}});
  };
}
if(/^#world/.test(location.hash)){S._wsChosen=true;setTab('world');worldEd.starter();}
/* launch screen: the front door of 3D. Skipped when a link brings a picture or asks for the world builder. */
{const L=document.getElementById('launch');
  if(L){const q=location.hash;
    const close=()=>{L.classList.add('out');setTimeout(()=>{L.hidden=true;L.classList.remove('out');cancelAnimationFrame(L._raf);},350);};
    const go={
      world:()=>{close();setTab('world');worldEd.starter();wsShow();},
      photo:()=>{close();const f=$('#file');f.accept='image/*';f.onchange=async()=>{await importFiles(f.files);f.value='';f.accept=FILE_ACCEPT;f.onchange=null;};f.click();},
      model:()=>{close();$('#file').click();},
      scan:()=>{close();setTab('scan');},
      sigil:()=>{close();SGS.open();},
      scene:()=>{close();setTab('scene');toast('Empty scene. Add a shape from the Scene tab, or draw in the Sigil tab.',4000);}
    };
    L.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go[b.dataset.go]()));
    addEventListener('keydown',e=>{if(!L.hidden&&e.key==='Escape')close();});
    if(/^#sigil/.test(q)){L.hidden=true;SGS.open();}
    else if(/^#(world|from=|look=)/.test(q))L.hidden=true;
    else{L.hidden=false;
      const cv=L.querySelector('canvas'),g=cv.getContext('2d'),reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
      const acc=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#ff5a1f';
      const V=[];for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])V.push([x,y,z]);
      const draw=t=>{const dpr=Math.min(2,devicePixelRatio||1),W=cv.width=innerWidth*dpr,H=cv.height=innerHeight*dpr;g.clearRect(0,0,W,H);
        const hz=H*.58;g.lineWidth=1*dpr;g.strokeStyle='rgba(242,239,232,.14)';
        for(let i=0;i<22;i++){const k=((i+t*.0004)%22)/22,y=hz+(H-hz)*k*k;g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke();}
        for(let i=-14;i<=14;i++){g.beginPath();g.moveTo(W/2+i*W*.012,hz);g.lineTo(W/2+i*W*.16,H);g.stroke();}
        const a=t*.0004,b=.5,s=Math.min(W,H)*.2,cx=W*.74,cy=H*.3,P=V.map(([x,y,z])=>{let X=x*Math.cos(a)-z*Math.sin(a),Z=x*Math.sin(a)+z*Math.cos(a),Y=y*Math.cos(b)-Z*Math.sin(b);Z=y*Math.sin(b)+Z*Math.cos(b);const f=1/(3.4-Z*.5);return[cx+X*s*f*2,cy+Y*s*f*2];});
        g.strokeStyle=acc;g.lineWidth=1.6*dpr;g.globalAlpha=.8;for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){const d=(V[i][0]!==V[j][0])+(V[i][1]!==V[j][1])+(V[i][2]!==V[j][2]);if(d===1){g.beginPath();g.moveTo(P[i][0],P[i][1]);g.lineTo(P[j][0],P[j][1]);g.stroke();}}g.globalAlpha=1;
        if(!reduce&&!L.hidden)L._raf=requestAnimationFrame(draw);};
      draw(0);}
  }}

$('#bWalk')&&$('#bWalk').addEventListener('click',()=>walk.on?walk.exit():walk.enter({pos:[camera.position.x*.6,0,Math.max(2.5,camera.position.z*.8)],yaw:0,noJump:true}));
function aiStatus(t){AI.state=t;if(AI.btn){AI.btn.textContent=t==='on'?'AI connected':t==='wait'?'Connecting…':'Connect AI';AI.btn.setAttribute('aria-pressed',t==='on');}}
function aiConnect(url,auto){
  if(AI.ws&&!auto){AI.want=false;try{AI.ws.close();}catch(e){}AI.ws=null;aiStatus('off');return;}
  AI.want=true;AI.url=url||AI.url;aiStatus('wait');
  let ws;try{ws=new WebSocket(AI.url);}catch(e){aiStatus('off');toast('Couldn’t open '+AI.url);return;}
  AI.ws=ws;
  ws.onopen=()=>{aiStatus('on');ws.send(JSON.stringify({hello:'n0ise-3d',v:1}));toast('AI connected');};
  ws.onmessage=async ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}
    if(m.id==null)return;
    try{const result=await api.run(m.args||{});ws.send(JSON.stringify({id:m.id,result}));}catch(e){ws.send(JSON.stringify({id:m.id,error:String(e&&e.message||e)}));}};
  ws.onclose=ev=>{if(AI.ws===ws){AI.ws=null;if(ev&&ev.code===4000){AI.want=false;toast('Another tab took over the AI connection');}aiStatus(AI.want?'wait':'off');if(AI.want)setTimeout(()=>{if(AI.want&&!AI.ws)aiConnect(AI.url,true);},2500);}};
  ws.onerror=()=>{if(AI.ws===ws&&!AI.warned){AI.warned=true;toast('No AI bridge at '+AI.url+' yet. Start it with: node tools/mcp/server.mjs',5000);}};
}
{const q=new URLSearchParams(location.search).get('mcp');if(q){setTimeout(()=>aiConnect(q.startsWith('ws')?q:undefined),800);}}

/* Open in Effects: the current picture goes over, nothing is re-imported by hand */
async function openInEffects(){
  try{S.exporting=true;await waitFrames(3);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));S.exporting=false;if(!blob)throw new Error('empty');
    await handoffPut(blob,{from:'3d'});location.href='effects.html#from=3d';}catch(e){S.exporting=false;toast('Couldn’t hand the picture over');}
}
setTimeout(async()=>{const m=location.hash.match(/^#from=(\w+)/);if(!m)return;const rec=await handoffTake();history.replaceState(null,'',location.pathname);
  if(!rec){toast('Nothing to open. Send a picture from the other page again.');return;}
  if(rec.meta&&rec.meta.form&&FORM){try{const j=JSON.parse(await rec.blob.text());await importFormFile(null,j,'local');}catch(e){toast('Couldn’t open the generator: '+(e.message||e),5000);}return;}
  await photoToRelief(new File([rec.blob],'from-'+m[1]+'.png',{type:rec.blob.type||'image/png'}));toast('Opened from '+m[1]);},1400);
window.__studio={LIGHTO,GROUNDO,loadPlace,MECH:()=>MECH,FORM:()=>FORM,importFormFile,NW:()=>NW,worldImportSheet,exportWorldFile,validateWorld,addGroup,frame,get maskRT(){return maskRT;},renderSelMask,SKY,pickSky,followPlayer,DOC,LGT,MAT,openMatLab:c=>openMatLab({THREE,RoomEnvironment,el,btn,sliderRow,chipRow,toast,MAT,...c}),undo3,redo3,uPush,UH,apprOf,apprPut,apprWatch,autoPlace,SURF,addPhoto,sampleCanvas,S,N0,selectObj,addLook,removeLook,openInEffects,worldEd,api,walk,aiConnect,zipStore,zipRead,projectFiles,loadProject,saveProject,AUTO,autoStep,fxRandomise,fxEnsure,fxClear,FX3,SG,addViz,AU,buildViz,vizUpdate,enterRest,leaveRest,restTick,setFx,autoDepth,buildDepth,restD,MATTERS,CUT,autoCut,refineMask,applyAlpha,THREE,scene,camera,controls,renderer,importFiles,addPrimitive,sheet,SC,carve,surfaceNets,buildScan,makeRelief,pseudoDepth,photoToRelief,objById,removeObj,bump,setTab,rebuildRelief,applyView,frameAll,exportImage,get rt(){return rt;}};
