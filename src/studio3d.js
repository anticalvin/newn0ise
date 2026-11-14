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
import {createRecorder,fmtTime} from './recorder.js';
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
  mask:{mode:2,focus:3,range:1.2,soft:.6,inv:false,amt:1},bg:'#0b0b0c',env:.5,liveUntil:0,ver:0};
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
let envTex=null;
function setupEnv(){try{const pm=new THREE.PMREMGenerator(renderer);envTex=pm.fromScene(new RoomEnvironment(),.04).texture;scene.environment=envTex;scene.environmentIntensity=S.env;}catch(e){console.warn('env failed',e);}}
const grid=new THREE.GridHelper(12,24,0x666670,0x2f2f36);grid.material.transparent=true;grid.material.opacity=.4;scene.add(grid);
const tc=new TransformControls(camera,canvas);tc.setSize(.8);
const tcHelper=tc.getHelper?tc.getHelper():tc;scene.add(tcHelper);
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
const objById=id=>S.objs.find(o=>o.id===id);
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
  if(S.objs.length&&kind!=='relief'){
    const bb=new THREE.Box3();S.objs.forEach(x=>bb.union(holderBox(x.holder)));
    holder.updateMatrixWorld(true);const nb=new THREE.Box3().setFromObject(holder);
    if(!bb.isEmpty()&&!nb.isEmpty())holder.position.x=bb.max.x+(nb.max.x-nb.min.x)/2+.3-((nb.max.x+nb.min.x)/2-holder.position.x);
  }
  world.add(holder);if(S.shadows)setShadowFlags(holder);
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
  S.objs.splice(i,1);
  if(S.rest&&S.rest.id===id)leaveRest();
  if(S.sel===id)S.sel=null;
  setSelBox();$('#empty').hidden=S.objs.length>0;
  renderObjList&&renderObjList();refreshInspector&&refreshInspector();bump();markDirty();
}
function selectObj(id){
  S.pivot=false;S.sel=id;const o=objById(id);if(o){lookSwitch(S.fxTarget,id);S.fxTarget=id;} // the look stays on the last picked object even after a tap on empty space
  if(tc.object&&(!o||tc.object!==o.holder))tc.detach();
  if(o&&S.gizmo){tc.attach(o.holder);tc.setMode(S.gizmo);}
  setSelBox();
  renderObjList&&renderObjList();refreshInspector&&refreshInspector();bump();
}
function setSelBox(){
  if(selBox){scene.remove(selBox);selBox.geometry.dispose();selBox=null;}
  const o=objById(S.sel);if(!o||!o.holder)return;
  selBox=new THREE.BoxHelper(o.holder,0xff5a1f);scene.add(selBox);
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
  Capsule:()=>new THREE.CapsuleGeometry(.4,.9,8,24)
};
function setShadowFlags(n){if(!n)return;n.traverse(m=>{if(m.isMesh&&!m.isSplatMesh){m.castShadow=!!S.shadows;m.receiveShadow=!!S.shadows;}});}
function addPrimitive(k){
  const g=PRIMS[k]();if(k==='Plane')g.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xb9b4ac,roughness:.55,metalness:.1}));
  return registerObject(k,m,'mesh',{size:k==='Plane'?3:1.6});
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
  const w=FXE.iw;FXE.src.width=curW;FXE.src.height=curH;
  N0.blit(cTex);const g=FXE.src.getContext('2d');g.drawImage(canvas,0,0,curW,curH);
  const out=w.__embedRender(FXE.src,curW,curH,t,dt);if(!out)return null;
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
const blkMat=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.DoubleSide});
/* mask of the look target. Meshes: the target draws white and everything else draws black into the same depth buffer, so an object in
   front of the target hides it and the look can never show through. Splats can't take a material: their own alpha is the mask. */
function renderSelMask(oo){
  const o=oo||objById(S.fxTarget!=null?S.fxTarget:S.sel);if(!o||!maskRT){if(maskRT){renderer.setRenderTarget(maskRT);renderer.setClearColor(0x000000,0);renderer.clear();}S.maskA=0;return false;}
  const isSp=o.kind==='splat'||(o.meta&&o.meta.mode==='splats');S.maskA=isSp?1:0;
  const vis=S.objs.map(x=>x.holder.visible);
  if(isSp)S.objs.forEach(x=>{x.holder.visible=x===o&&x.vis;});
  const gv=grid.visible,sbv=selBox?selBox.visible:false,tv=tcHelper.visible;
  grid.visible=false;if(selBox)selBox.visible=false;tcHelper.visible=false;
  const bgOld=scene.background,envOld=scene.environment,fogOld=scene.fog;scene.environment=null;scene.fog=null;
  const swaps=[];
  if(!isSp)scene.traverseVisible(n=>{
    if(!n.isMesh||n.isSplatMesh)return;let p=n,mine=false;while(p){if(p===o.holder){mine=true;break;}p=p.parent;}
    swaps.push([n,n.material]);n.material=mine?selMat:blkMat;
  });
  renderer.setRenderTarget(maskRT);renderer.setClearColor(0x000000,isSp?0:1);renderer.clear();renderer.render(scene,camera);
  swaps.forEach(([n,m])=>{n.material=m;});
  scene.environment=envOld;scene.background=bgOld;scene.fog=fogOld;
  S.objs.forEach((x,i)=>{x.holder.visible=vis[i];});grid.visible=gv;if(selBox)selBox.visible=sbv;tcHelper.visible=tv;
  return true;
}

/* ---- per-object looks (CRT Lab engine): each object can carry its own look. Picking an object loads its look into the controls,
   editing writes it back, and every looked object is rendered and composited through its own mask. ---- */
const cloneP=()=>JSON.parse(JSON.stringify(N0.P));
let lookRT=[null,null],lookRTkey='';
function lookObjs(){return S.objs.filter(o=>o.look&&o.vis!==false&&o.holder.visible);}
function lookSwitch(prevId,id){
  if(prevId===id||S.mask.mode!==2)return;
  const pv=objById(prevId),nx=objById(id);
  if(pv&&pv.look)pv.look=cloneP();
  if(nx&&nx.look){Object.assign(N0.P,nx.look);if(typeof rebuildLook==='function'&&paneEls&&paneEls.look)rebuildLook();}
  else if(nx&&S.fx&&S.engine!=='stack'&&!S.objs.some(x=>x.look)){nx.look=cloneP();} // the first picked object gets the look, as before
  updateLookUI();
}
function addLook(o){if(!o)return;S.lookOff=false;o.look=cloneP();S.fx=true;S.mask.mode=2;bump();updateLookUI();toast('Look added to '+o.name);}
function removeLook(o){if(!o)return;delete o.look;S.lookOff=true;bump();updateLookUI();toast('Look removed from '+o.name);}
let lookUI=null;
function updateLookUI(){if(!lookUI)return;const o=objById(S.fxTarget!=null?S.fxTarget:S.sel),n=S.objs.filter(x=>x.look).length;
  lookUI.name.textContent=o?o.name:'Nothing picked';lookUI.add.textContent=o&&o.look?'Update look':'Add look';lookUI.add.disabled=!o;lookUI.rm.hidden=!(o&&o.look);
  lookUI.cnt.textContent=n?n+(n===1?' object has a look':' objects have looks'):'No object has a look yet';}
function drawLooks(cTex,t,dt,live,LO){
  ensureComp();const G=N0.GLH,W=canvas.width,H=canvas.height,key=W+'x'+H;
  if(lookRTkey!==key){lookRT.forEach(r=>r&&G.freeRT(r));lookRT=[G.mkRT(W,H),G.mkRT(W,H)];lookRTkey=key;}
  const keep=cloneP();let base=cTex,wasT=S.fxTarget;
  LO.forEach((o,i)=>{
    Object.assign(N0.P,o.look);renderSelMask(o);
    const fx=N0.render(base,t,dt,live),last=i===LO.length-1,dst=last?null:lookRT[i%2],p=compProg;
    renderer.setRenderTarget(null);
    gl.bindVertexArray(G.vao);G.bindRT(dst);if(!dst)gl.viewport(0,0,W,H);p.use();
    G.samp(p,'uO',0,base);G.samp(p,'uF',1,fx);G.samp(p,'uD',2,rtTex(rt.depthTexture));G.samp(p,'uM',3,rtTex(maskRT.texture));
    p.f('uMode',2);p.f('uAmt',S.mask.amt);p.f('uFocus',0);p.f('uRange',1);p.f('uSoft',.1);p.f('uInv',S.mask.inv?1:0);p.f('uMA',S.maskA||0);p.f('uCamN',camera.near);p.f('uCamF',camera.far);p.v2('uPx',1/curW,1/curH);
    G.draw();gl.bindVertexArray(null);gl.useProgram(null);
    if(dst)base=dst.tex;
  });
  Object.assign(N0.P,keep);S.fxTarget=wasT;
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
    const lift=Math.round(sheet.coverPx());if(lift!==S._lift){S._lift=lift;hudLift.style.transform=`translate3d(0,${-lift}px,0)`;hudLift2.style.transform=`translate3d(0,${-lift}px,0)`;}
    if(S.rest)restTick();
    av3Tick(t,dt);
    animTick(t);
    controls.autoRotate=S.spin;if(S.spin)bump();
    if(typeof sim!=='undefined')sim.tick(dt);
    if(S.walk)walk.tick(dt);else controls.update(dt);
    if(selBox)selBox.update();
    grid.visible=S.grid&&!S.exporting&&!S.walk;
    if(selBox)selBox.visible=!S.exporting&&S.sel!=null&&!S.walk;
    tcHelper.visible=!S.exporting&&!S.walk&&!!(S.gizmo||S.pivot)&&S.sel!=null;
    bgCol.set(S.bg);
    renderer.setRenderTarget(rt);renderer.setClearColor(bgCol,1);renderer.clear();renderer.render(scene,camera);
    const wantMask=S.fx&&!S.hold&&S.mask.mode===2&&!(S.engine!=='stack'&&S.objs.some(x=>x.look));
    if(wantMask)renderSelMask();
    renderer.setRenderTarget(null);
    const cTex=rtTex(rt.texture);
    if(S.fx&&!S.hold&&S.mask.mode===2&&S.engine!=='stack'&&!S.lookOff&&!S.objs.some(x=>x.look)){const t0=objById(S.fxTarget!=null?S.fxTarget:S.sel);if(t0){t0.look=cloneP();updateLookUI();}}
    const LO=S.fx&&!S.hold&&S.mask.mode===2&&S.engine!=='stack'?lookObjs():[];
    if(LO.length){
      const eo=objById(S.fxTarget);if(eo&&eo.look&&frames%6===0)eo.look=cloneP();
      drawLooks(cTex,t,dt,performance.now()<S.liveUntil,LO);
    }else if(S.fx&&!S.hold&&!(S.mask.mode===2&&S.engine!=='stack')){
      const live=performance.now()<S.liveUntil;
      let fxTex=null;
      if(S.engine==='stack'){if(fxReady()){fxTex=fxRender(cTex,t,dt);}}
      if(!fxTex)fxTex=N0.render(cTex,t,dt,live);
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
    frames++;errN=0;if(frames%15===0)updateFxNote();
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
  addPrimitive('Knot');
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
const CUT={on:localStorage.getItem('n0.autocut')!=='0',workerP:null,jobs:new Map(),seq:0};
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
  const ab=el('button','chip','Auto-cut on drop');ab.setAttribute('aria-pressed',CUT.on);
  ab.onclick=()=>{CUT.on=!CUT.on;localStorage.setItem('n0.autocut',CUT.on?'1':'0');ab.setAttribute('aria-pressed',CUT.on);};
  chips.append(kb,ab);r.appendChild(chips);
  chipRow(r,[['auto','Auto'],['modnet','People'],['u2net','Accurate']],v=>CUT.model===v,v=>{CUT.model=v;localStorage.setItem('n0.cutmodel',v);});
  const acts=el('div','chips');
  acts.append(
    btn('Cut out subject','',()=>autoCut(o)),
    btn('Reset cut','',()=>{if(m.alpha0){setAlpha(o,Float32Array.from(m.alpha0));refreshInspector();}else toast('Nothing to reset yet.');}),
    btn('Undo auto-cut','',()=>{m.alpha=null;m.cutBy='none';applyAlpha(m);rebuildRelief(o);refreshInspector();}),
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
  snaps(){const H=window.innerHeight;return[Math.round(66+(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b'))||0)),Math.round(Math.min(250,H*.3)),Math.round(H*.5),Math.round(H*.5)];}, // never past halfway: the art keeps the top half and the panel scrolls
  coverPx(){return mqDesk.matches?0:this.h;},
  setIdx(i,instant){const s=this.snaps();this.idx=clamp(i,0,3);this.ht=s[this.idx];if(instant){this.h=this.ht;this.hv=0;}},
  nearest(h,v){const s=this.snaps(),p=h+v*.16;let b=0,bd=1e9;s.forEach((x,i)=>{const d=Math.abs(x-p);if(d<bd){bd=d;b=i;}});return b;},
  update(dt){
    if(mqDesk.matches){sheetEl.style.removeProperty('--fullh');return;}
    const full=Math.round(window.innerHeight*.5);
    if(full!==this.fullH){this.fullH=full;sheetEl.style.setProperty('--fullh',full+'px');}
    if(this.h===0&&!this.inited){this.setIdx(1,true);this.inited=true;}
    if(!this.drag){
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
const TABN=[['world','World'],['scene','Scene'],['scan','Scan'],['look','Look'],['export','Export']];
const paneEls={};
function setTab(id){
  TABN.forEach(([k])=>{$('#tab_'+k).setAttribute('aria-selected',k===id);paneEls[k].hidden=k!==id;});
  panes.scrollTop=0;S.tab=id;
}
function buildTabs(){
  TABN.forEach(([k,l])=>{
    const b=el('button','tab',l);b.id='tab_'+k;b.setAttribute('role','tab');
    b.addEventListener('click',()=>{if(suppressTab)return;setTab(k);if(!mqDesk.matches&&sheet.idx<2)sheet.setIdx(2);});
    tabsEl.appendChild(b);
    const p=el('div');p.id='pane_'+k;p.hidden=true;panes.appendChild(p);paneEls[k]=p;
  });
}

/* ---------- control helpers ---------- */
function sliderRow(parent,label,get,set,min,max,step,fmt){
  const r=el('div','row');r.innerHTML=`<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
  const i=r.querySelector('input'),o=r.querySelector('output');
  const f=fmt||(v=>step<1?(+v).toFixed(step<.1?2:1):String(Math.round(v)));
  const paint=()=>{const v=get();i.value=v;o.textContent=f(v);i.style.setProperty('--p',((v-min)/(max-min)*100)+'%');};
  i.addEventListener('input',()=>{set(+i.value);paint();});paint();
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
let objListEl,inspEl,inspSyncs=[];
function buildScenePane(){
  const p=paneEls.scene;
  const s1=sec(p,'Objects');
  objListEl=el('div','olist');s1.appendChild(objListEl);
  const add=el('div','chips');add.style.marginTop='8px';
  add.appendChild(btn('Import files','pri',()=>$('#file').click()));
  Object.keys(PRIMS).forEach(k=>add.appendChild(btn('+ '+k,'',()=>addPrimitive(k))));
  add.appendChild(btn('+ Visualizer','',()=>addViz('waterfall')));
  add.appendChild(btn('Walk','',()=>$('#bWalk').click()));{const ab=btn('Connect AI','',()=>aiConnect());AI.btn=ab;add.appendChild(ab);}add.appendChild(btn('Save project','',saveProject));add.appendChild(btn('Open project','',()=>{const i=document.createElement('input');i.type='file';i.accept='.zip,application/zip';i.onchange=()=>i.files[0]&&importFiles([i.files[0]]);i.click();}));add.appendChild(btn('Copy look link','',lookLink));
  s1.appendChild(add);
  const note=el('div','note','Drop or import: glb, gltf (with its bin and textures), obj (+mtl), stl, ply (mesh, points or 3D Gaussian splat), splat, spz, ksplat, sog. Photos become relief. Videos open the turntable scanner.');s1.appendChild(note);
  inspEl=el('div');p.appendChild(inspEl);
  autoPanel(p);
  const s3=sec(p,'Stage');
  sliderRow(s3,'Environment',()=>S.env,v=>{S.env=v;scene.environmentIntensity=v;hemi.intensity=.2+v*.7;bump();},0,2,.05);
  sliderRow(s3,'Key light',()=>key.intensity,v=>{key.intensity=v;bump();},0,6,.1);
  const bgrow=el('div','row');bgrow.innerHTML='<label>Background</label><input type="color" value="#0b0b0c" style="width:100%;height:28px;border:1px solid var(--line);background:none;padding:0"><output></output>';
  bgrow.querySelector('input').addEventListener('input',e=>{S.bg=e.target.value;bump();});s3.appendChild(bgrow);
  chipRow(s3,[['.5','Draft'],['.8','Normal'],['1','High']],v=>String(S.q)===v,v=>{S.q=parseFloat(v);needResize=true;});
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
function buildLookPane(){
  const p=paneEls.look,P=N0.P;
  const se=sec(p,'Effects');
  chipRow(se,[['crt','CRT Lab look'],['stack','All n0ise effects']],v=>(S.engine||'crt')===v,v=>{S.engine=v;if(v==='stack'){fxLoad();if(S.mask.mode===0){S.mask.mode=2;}if(S.sel==null&&S.objs.length)selectObj(S.objs[S.objs.length-1].id);}rebuildLook();bump();});
  if(S.engine==='stack'){se.appendChild(btn('Edit effects','pri',fxOpen));se.appendChild(el('div','note',fxReady()?'The effect stack runs on the selected object. The background stays as it is.':'Loading the effect engine…'));}
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
    if(S.mask.mode===2&&S.engine!=='stack'){const bx=el('div','lookbox');const nm=el('div','sub','');const row=el('div','chips');
      const add=btn('Add look','pri',()=>addLook(objById(S.fxTarget!=null?S.fxTarget:S.sel)));const rm=btn('Remove look','',()=>removeLook(objById(S.fxTarget!=null?S.fxTarget:S.sel)));
      row.append(add,rm);const cnt=el('div','note','');bx.append(nm,row,cnt,el('div','note','Tap an object, shape its look with the controls below, then tap another and give it a different one. Each object keeps its own.'));mk.appendChild(bx);lookUI={name:nm,add,rm,cnt};updateLookUI();}
    else if(S.mask.mode===2)mk.appendChild(el('div','note','Tap an object in the scene to pick it. The look is applied to that object only.'));
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
    stRec.start({canvas,fps:30,
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
  addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='f')frameAll();if(e.key===' '){e.preventDefault();S.hold=true;}if(e.key==='Delete'||e.key==='Backspace'){if(S.sel!=null)removeObj(S.sel);}});
  addEventListener('keyup',e=>{if(e.key===' ')S.hold=false;});
  mqDesk.addEventListener('change',()=>{sheet.last=-1;needResize=true;});
  addEventListener('resize',()=>{needResize=true;sheet.setIdx(sheet.idx,false);});
}

/* ---------- boot ---------- */
studioDefaults();buildTabs();buildHud();buildScenePane();buildScanPane();
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
async function projectFiles(){
  const files={},items=[],skipped=[];let i=0;
  for(const o of S.objs){
    const tr={p:o.holder.position.toArray(),r:[o.holder.rotation.x,o.holder.rotation.y,o.holder.rotation.z],s:o.holder.scale.toArray()};
    const m=o.meta;
    if(o.kind==='relief'&&m&&m.photo&&m.depth){
      const id='r'+(i++);files[id+'.png']=await toPNG(m.photo);
      files[id+'.depth']=new Uint8Array(m.depth.buffer.slice(m.depth.byteOffset,m.depth.byteOffset+m.depth.byteLength));
      if(m.alpha){const a=new Uint8Array(m.alpha.length);for(let k=0;k<a.length;k++)a[k]=Math.round(clamp(m.alpha[k],0,1)*255);files[id+'.alpha']=a;}
      const sc={};for(const [k,v] of Object.entries(m))if(['number','boolean','string'].includes(typeof v)&&!PSKIP.has(k))sc[k]=v;
      items.push({kind:'relief',id,name:o.name,tr,vis:o.vis,dw:m.dw,dh:m.dh,meta:sc});
    }else if(o.kind==='mesh'&&PRIMS[o.name]&&o.root.material&&o.root.material.color)items.push({kind:'prim',name:o.name,tr,vis:o.vis,color:o.root.material.color.getHex()});
    else skipped.push(o.name);
  }
  const pj={n0ise:'studio',v:1,items,skipped,view:{view:S.view,bg:S.bg,env:S.env,grid:S.grid,fx:S.fx,mask:S.mask},cam:{p:camera.position.toArray(),t:controls.target.toArray()}};
  files['project.json']=new TextEncoder().encode(JSON.stringify(pj));
  return {files,skipped,count:items.length};
}
async function loadProject(u8){
  const F=zipRead(u8);if(!F['project.json'])throw new Error('That zip has no n0ise project in it.');
  const pj=JSON.parse(new TextDecoder().decode(F['project.json']));if(pj.n0ise!=='studio')throw new Error('That zip isn’t an n0ise 3D project.');
  S.objs.slice().forEach(o=>removeObj(o.id));if(S.rest)leaveRest();
  for(const it of pj.items){
    let o;
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
    if(!o)continue;
    o.holder.position.fromArray(it.tr.p);o.holder.rotation.set(...it.tr.r);o.holder.scale.fromArray(it.tr.s);o.vis=it.vis!==false;o.holder.visible=o.vis;
  }
  if(S.rest)leaveRest();
  const v=pj.view||{};if(v.view)S.view=v.view;if(v.bg)S.bg=v.bg;if(typeof v.env==='number'){S.env=v.env;scene.environmentIntensity=v.env;}if(v.mask)Object.assign(S.mask,v.mask);if(typeof v.fx==='boolean')S.fx=v.fx;if(typeof v.grid==='boolean')S.grid=v.grid;
  if(pj.cam){camera.position.fromArray(pj.cam.p);controls.target.fromArray(pj.cam.t);controls.update();S.needFrame=false;}
  applyView();renderObjList&&renderObjList();refreshInspector&&refreshInspector();bump();
  return {count:pj.items.length,skipped:pj.skipped||[]};
}
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
const walk=createWalk({THREE,camera,controls,canvas,S,holderBox,sheet,bump,leaveRest,tcDetach:()=>tc.detach()});
const sim=createSim({THREE,S,bump});
const api=createApi({sim,THREE,S,scene,camera,controls,renderer,canvas,world,hemi,key,grid,PRIMS,addPrimitive,removeObj,objById,importOne,applyView,bump,frameAll,tick,walk,projectFiles,zipStore,GLTFExporter,renderObjList,refreshInspector,setShadowFlags,selectObj,waitFrames,requestResize:()=>{needResize=true;}});
window.n0={run:api.run,describe:api.describe,walk,sim};
const worldEd=createWorldEditor({openInEffects:()=>openInEffects(),THREE,S,api,sim,walk,camera,canvas,controls,tc,objById,selectObj,removeObj,bump,el,sec,btn,toast,renderObjList});
worldEd.build(paneEls.world);
if(/^#world/.test(location.hash)){setTab('world');worldEd.starter();}
$('#bWalk')&&$('#bWalk').addEventListener('click',()=>walk.on?walk.exit():walk.enter({pos:[camera.position.x*.6,0,Math.max(2.5,camera.position.z*.8)],yaw:0}));
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
  await photoToRelief(new File([rec.blob],'from-'+m[1]+'.png',{type:rec.blob.type||'image/png'}));toast('Opened from '+m[1]);},1400);
window.__studio={S,N0,selectObj,addLook,removeLook,openInEffects,worldEd,api,walk,aiConnect,zipStore,zipRead,projectFiles,loadProject,saveProject,AUTO,autoStep,fxRandomise,fxEnsure,fxClear,FX3,SG,addViz,AU,buildViz,vizUpdate,enterRest,leaveRest,restTick,setFx,autoDepth,buildDepth,restD,MATTERS,CUT,autoCut,refineMask,applyAlpha,S,N0,THREE,scene,camera,controls,renderer,importFiles,addPrimitive,sheet,SC,carve,surfaceNets,buildScan,makeRelief,pseudoDepth,photoToRelief,objById,selectObj,removeObj,bump,setTab,rebuildRelief,applyView,frameAll,exportImage,get rt(){return rt;}};
