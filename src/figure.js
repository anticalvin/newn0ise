/* Character creator 2.0. A real rigged human (MakeHuman core assets, CC0) with body and face morphs, expressions, hair, outfits, poses and GLB export.
   Mobile-first: full-screen viewport and a compact bottom sheet. Everything is serialisable (one JSON state), undoable and deterministic when randomised.
   "Open in 3D" hands the rigged GLB to the 3D page. See docs/CHARACTER_AUDIT.md. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createHuman,DEFAULT,STYLE,POSES,EXPRESSIONS,ageYears} from './human.js';
import {createGamepad} from './gamepad.js';
import {initPen} from './pen.js';

const $=s=>document.querySelector(s);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};
const canvas=$('#fc');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.05,60);camera.position.set(1.7,1.35,3.2);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,.9,0);controls.enableDamping=true;controls.minDistance=.45;controls.maxDistance=7;controls.maxPolarAngle=Math.PI*.56;
const pm=new THREE.PMREMGenerator(renderer);scene.environment=pm.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.55;
const key=new THREE.DirectionalLight(0xfff2e6,2.6);key.position.set(2.5,4,3.5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-1.5,right:1.5,top:2.4,bottom:-.5});key.shadow.bias=-.0004;key.shadow.normalBias=.01;scene.add(key);
const rim=new THREE.DirectionalLight(0xcfe0ff,1.6);rim.position.set(-3,2.5,-3);scene.add(rim);
const fill=new THREE.DirectionalLight(0xffffff,.5);fill.position.set(-3,1,3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.CircleGeometry(1.4,64),new THREE.MeshStandardMaterial({roughness:.95,metalness:0}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
let night=matchMedia('(prefers-color-scheme: dark)').matches;
function theme(){scene.background=new THREE.Color(night?0x0b0b0c:0xeceae6);floor.material.color.set(night?0x1c1c1f:0xd9d6cf);document.documentElement.dataset.t=night?'d':'l';}theme();
let dirty=2;const bump=()=>{dirty=3;};controls.addEventListener('change',bump);

function toast(m,ms=2400){const t=$('#ft');t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,ms);}
let H=null;
const KEY='n0.human';
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(H.S));}catch(e){}};
/* ---- undo / redo of the whole editable state ---- */
const U={u:[],r:[],pend:false};
function touch(){if(U.pend)return;U.pend=true;U.u.push(JSON.stringify(H.S));if(U.u.length>60)U.u.shift();U.r.length=0;setTimeout(()=>U.pend=false,700);}
async function restore(js){H.load(JSON.parse(js));await H.apply();H.outfit();H.pose(H.S.pose);H.expr();show(tab,true);save();bump();}
async function undo(){if(!U.u.length){toast('Nothing to undo.');return;}U.r.push(JSON.stringify(H.S));await restore(U.u.pop());}
async function redo(){if(!U.r.length){toast('Nothing to redo.');return;}U.u.push(JSON.stringify(H.S));await restore(U.r.pop());}

/* ---- camera moves ---- */
let cam=null;
function frame(kind){
  const b=new THREE.Box3().setFromObject(H.body),h=b.max.y,hd=H.bones.find(x=>x.name==='head'),hp=new THREE.Vector3();hd.getWorldPosition(hp);
  const to=kind==='face'?{t:new THREE.Vector3(0,hp.y+.1,0),d:1.05}:kind==='head'?{t:new THREE.Vector3(0,hp.y+.08,0),d:1.9}:{t:new THREE.Vector3(0,h*.52,0),d:Math.max(3,h*2.3)};
  const fit=innerWidth<860?Math.min(1.9,Math.max(1,innerHeight/Math.max(220,$('#panel').getBoundingClientRect().top))):1;
  const dir=camera.position.clone().sub(controls.target).normalize();cam={t:to.t,d:to.d*fit,dir};
}
function stepCam(){if(!cam)return;controls.target.lerp(cam.t,.14);const d=camera.position.distanceTo(controls.target),nd=d+(cam.d-d)*.14;camera.position.copy(controls.target).addScaledVector(cam.dir,nd);if(Math.abs(nd-cam.d)<.004&&controls.target.distanceTo(cam.t)<.004)cam=null;bump();}

/* ---- panel ---- */
const PANEL=$('#fp'),TN=['Body','Face','Hair','Outfit','Pose'];let tab=+localStorage.getItem('n0.figtab')||0;
const PAL=['#f2efe8','#111111','#c2410c','#2563eb','#16a34a','#d946ef','#eab308','#64748b','#7f1d1d','#0f766e','#8b5a2b','#f4c2c2'];
const HAIRC=['#16100c','#3b2417','#7a4a25','#b9832f','#e0c27a','#c8c8c8','#c2410c','#2563eb','#d946ef','#16a34a'];
const SKIN=['#f7d9c4','#eec3a0','#d8a47c','#b9794f','#8a5233','#5b3520','#3a2216'];
const EYE=['#4a3020','#2563eb','#16a34a','#64748b','#111111','#b9832f'];
const D=(g,n,bi)=>{const d=H.man.detail.find(x=>x.group===g&&x.name===n&&(bi==null||x.bi===bi));return d&&d.id;};
function slider(p,label,get,set,mn,mx,fmt){const r=el('label','row');const s=el('span','',label);r.append(s);const i=el('input');i.type='range';i.min=mn;i.max=mx;i.step=.01;i.value=get();i.setAttribute('aria-label',label);
  const o=el('output','',fmt?fmt(+i.value):'');i.addEventListener('input',()=>{touch();set(+i.value);o.textContent=fmt?fmt(+i.value):'';H.apply().then(()=>{save();bump();});});r.append(i);if(fmt)r.append(o);p.appendChild(r);return i;}
function dslider(p,label,id,mx=1){if(!id)return;const d=H.man.detail.find(x=>x.id===id);slider(p,label,()=>H.S.detail[id]||0,v=>{H.S.detail[id]=v;},d.bi?-mx:0,mx);}
function sw(p,label,cols,get,set){const r=el('div','row sw');r.append(el('span','',label));const w=el('div','swatches');cols.forEach((c,i)=>{const b=el('button','');b.type='button';b.style.background=c;b.setAttribute('aria-label',label+' '+(i+1));b.setAttribute('aria-pressed',String(get()===c));b.addEventListener('click',()=>{touch();set(c);w.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));save();bump();});w.appendChild(b);});r.appendChild(w);p.appendChild(r);}
function chips(p,label,list,get,set){const r=el('div','row sw');r.append(el('span','',label));const w=el('div','chips');list.forEach(n=>{const b=el('button','chip',n);b.type='button';b.setAttribute('aria-pressed',String(get()===n));b.addEventListener('click',()=>{touch();set(n);w.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));save();bump();});w.appendChild(b);});r.appendChild(w);p.appendChild(r);}
const head=(p,t)=>p.appendChild(el('h3','',t));
const TABS=[
  p=>{head(p,'Body');slider(p,'Gender',()=>H.S.gender,v=>H.S.gender=v,0,1);slider(p,'Age',()=>H.S.age,v=>H.S.age=v,0,1,v=>Math.round(ageYears(v))+' yrs');slider(p,'Muscle',()=>H.S.muscle,v=>H.S.muscle=v,0,1);slider(p,'Weight',()=>H.S.weight,v=>H.S.weight=v,0,1);slider(p,'Height',()=>H.S.height,v=>H.S.height=v,0,1);slider(p,'Proportions',()=>H.S.prop,v=>H.S.prop=v,0,1);
    head(p,'Build');dslider(p,'Shoulders',D('torso','torso-scale-horiz'));dslider(p,'Chest depth',D('torso','torso-scale-depth'));dslider(p,'Waist',D('hip','hip-waist'));dslider(p,'Hips',D('hip','hip-scale-horiz'));dslider(p,'Belly',D('stomach','stomach-pregnant'));dslider(p,'Arms',D('armslegs','upperarm-fat'));dslider(p,'Legs',D('armslegs','upperleg-fat'));dslider(p,'Neck',D('neck','neck-scale-horiz'));
    head(p,'Ancestry blend');for(const k of['african','asian','caucasian'])slider(p,k[0].toUpperCase()+k.slice(1),()=>H.S.race[k],v=>H.S.race[k]=v,0,1);
    head(p,'Skin');sw(p,'Skin tone',SKIN,()=>H.S.skin,c=>H.setSkin(c));},
  p=>{head(p,'Expression');chips(p,'Expression',Object.keys(EXPRESSIONS),()=>Object.keys(EXPRESSIONS).find(k=>JSON.stringify(EXPRESSIONS[k])===JSON.stringify(H.S.expr))||'',n=>{H.S.expr={...EXPRESSIONS[n]};H.expr();});
    head(p,'Head and brow');dslider(p,'Head width',D('head','head-scale-horiz'));dslider(p,'Head height',D('head','head-scale-vert'));dslider(p,'Head depth',D('head','head-scale-depth'));dslider(p,'Forehead',D('forehead','forehead-scale-vert'));dslider(p,'Brow ridge',D('forehead','forehead-nubian'));dslider(p,'Brow angle',D('eyebrows','eyebrows-angle'));
    head(p,'Eyes');dslider(p,'Eye size',D('eyes','eye-scale'));dslider(p,'Eye height',D('eyes','eye-height1'));dslider(p,'Eye spacing',D('eyes','eye-push1'));dslider(p,'Eye corners',D('eyes','eye-corner1'));dslider(p,'Eye bags',D('eyes','eye-bag-height'));
    head(p,'Nose');dslider(p,'Nose width',D('nose','nose-scale-horiz'));dslider(p,'Nose length',D('nose','nose-scale-vert'));dslider(p,'Nose depth',D('nose','nose-scale-depth'));dslider(p,'Bridge hump',D('nose','nose-hump'));dslider(p,'Tip',D('nose','nose-point'));dslider(p,'Nostrils',D('nose','nose-nostrils-width'));
    head(p,'Mouth and jaw');dslider(p,'Mouth width',D('mouth','mouth-scale-horiz'));dslider(p,'Lip fullness',D('mouth','mouth-lowerlip-volume'));dslider(p,'Upper lip',D('mouth','mouth-upperlip-volume'));dslider(p,'Chin',D('chin','chin-prominent'));dslider(p,'Jaw width',D('chin','chin-width'));dslider(p,'Chin height',D('chin','chin-height'));dslider(p,'Cheeks',D('cheek','cheek-volume'));dslider(p,'Cheekbones',D('cheek','cheek-bones'));dslider(p,'Ear size',D('ears','ear-scale'));
    head(p,'Eye colour');sw(p,'Eyes',EYE,()=>H.S.eye,c=>H.setEye(c));},
  p=>{head(p,'Hair');chips(p,'Style',STYLE.hair,()=>H.S.hair.style,n=>{H.S.hair.style=n;H.outfit();});sw(p,'Colour',HAIRC,()=>H.S.hair.color,c=>{H.S.hair.color=c;H.outfit();});},
  p=>{head(p,'Top');chips(p,'Style',STYLE.top,()=>H.S.top.style,n=>{H.S.top.style=n;H.outfit();});sw(p,'Colour',PAL,()=>H.S.top.color,c=>{H.S.top.color=c;H.outfit();});
    head(p,'Bottom');chips(p,'Style',STYLE.bottom,()=>H.S.bottom.style,n=>{H.S.bottom.style=n;H.outfit();});sw(p,'Colour',PAL,()=>H.S.bottom.color,c=>{H.S.bottom.color=c;H.outfit();});
    head(p,'Shoes');chips(p,'Style',STYLE.shoes,()=>H.S.shoes.style,n=>{H.S.shoes.style=n;H.outfit();});sw(p,'Colour',PAL,()=>H.S.shoes.color,c=>{H.S.shoes.color=c;H.outfit();});},
  p=>{head(p,'Pose');chips(p,'Pose',Object.keys(POSES),()=>H.S.pose,n=>{H.pose(n);});}
];
function show(i,keep){tab=(i+TN.length)%TN.length;try{localStorage.setItem('n0.figtab',tab);}catch(e){}
  $('#ftabs').querySelectorAll('.tab').forEach((b,j)=>b.setAttribute('aria-selected',String(j===tab)));const y=keep?PANEL.scrollTop:0;PANEL.innerHTML='';TABS[tab](PANEL);PANEL.scrollTop=y;
  if(H&&!keep)frame(tab===1?'face':tab===2?'head':'body');}
TN.forEach((n,i)=>{const b=el('button','tab',n);b.type='button';b.setAttribute('role','tab');b.addEventListener('click',()=>show(i));$('#ftabs').appendChild(b);});

/* ---- presets and seeded randomise ---- */
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
function randomState(seed){
  const r=mulberry(seed),pick=a=>a[Math.floor(r()*a.length)],S=structuredClone(DEFAULT);
  S.seed=seed;S.gender=r();S.age=.32+r()*.42;S.muscle=r();S.weight=.25+r()*.5;S.height=r();S.prop=.3+r()*.6;
  const rr=[r(),r(),r()],s=rr[0]+rr[1]+rr[2];S.race={african:rr[0]/s,asian:rr[1]/s,caucasian:rr[2]/s};
  const ids=H.man.detail.filter(d=>/^(head|forehead|eyes|nose|mouth|chin|cheek|ears|neck|torso|hip)$/.test(d.group)&&!/trans|corner|rot|flap|wing|shape/.test(d.id)).map(d=>d.id);
  for(let i=0;i<10;i++){const id=pick(ids),d=H.man.detail.find(x=>x.id===id);S.detail[id]=(d.bi?(r()*2-1):r())*.55;}
  S.skin=pick(SKIN);S.eye=pick(EYE);S.hair={style:pick(STYLE.hair),color:pick(HAIRC)};S.top={style:pick(STYLE.top.slice(1)),color:pick(PAL)};S.bottom={style:pick(STYLE.bottom.slice(1)),color:pick(PAL)};S.shoes={style:'sneaker',color:pick(PAL)};
  return S;
}
const PRESETS={
  Athlete:{gender:.8,age:.42,muscle:.9,weight:.45,height:.65,prop:.8,hair:{style:'buzz',color:'#16100c'},top:{style:'tank',color:'#2563eb'},bottom:{style:'shorts',color:'#111111'},skin:SKIN[3]},
  Elder:{gender:.35,age:.92,muscle:.2,weight:.6,height:.35,prop:.4,hair:{style:'short',color:'#c8c8c8'},top:{style:'long',color:'#0f766e'},bottom:{style:'trousers',color:'#64748b'},skin:SKIN[1]},
  Teen:{gender:.55,age:.27,muscle:.35,weight:.4,height:.4,prop:.55,hair:{style:'ponytail',color:'#7a4a25'},top:{style:'tee',color:'#d946ef'},bottom:{style:'shorts',color:'#334155'},skin:SKIN[2]},
  Runner:{gender:.3,age:.45,muscle:.6,weight:.3,height:.7,prop:.85,hair:{style:'bun',color:'#3b2417'},top:{style:'tank',color:'#c2410c'},bottom:{style:'shorts',color:'#111111'},skin:SKIN[4],pose:'Run'}
};
async function setState(S){touch();H.load(S);await H.apply();H.outfit();H.pose(H.S.pose);H.expr();show(tab,true);save();bump();}
$('#frand').addEventListener('click',()=>setState(randomState(Math.floor(Math.random()*1e9))));
$('#fpre').addEventListener('click',()=>{const k=Object.keys(PRESETS),i=(+($('#fpre').dataset.i||0))%k.length;$('#fpre').dataset.i=i+1;toast('Preset: '+k[i],1200);setState({...structuredClone(DEFAULT),...structuredClone(PRESETS[k[i]])});});
$('#freset').addEventListener('click',()=>setState(structuredClone(DEFAULT)));
$('#fundo').addEventListener('click',undo);$('#fredo').addEventListener('click',redo);
$('#ftheme').addEventListener('click',()=>{night=!night;theme();bump();});
$('#fface').addEventListener('click',()=>frame(cam&&cam.d<1.3?'body':'face'));
addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}});

/* ---- export ---- */
async function glb(){const ex=new GLTFExporter();H.root.updateMatrixWorld(true);return new Promise((ok,no)=>ex.parse(H.root,ok,no,{binary:true,onlyVisible:true,maxTextureSize:1024}));}
$('#fdl').addEventListener('click',async()=>{try{const b=await glb(),u=URL.createObjectURL(new Blob([b],{type:'model/gltf-binary'})),a=el('a');a.href=u;a.download='character.glb';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);toast('Saved character.glb ('+(b.byteLength/1048576).toFixed(1)+' MB)');}catch(e){toast('Couldn’t export: '+(e.message||e),4000);}});
$('#fjson').addEventListener('click',()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(H.S,null,1)],{type:'application/json'})),a=el('a');a.href=u;a.download='character.n0human.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);toast('Saved the editable character.');});
$('#f3d').addEventListener('click',async()=>{
  try{const b=await glb();await new Promise((ok,no)=>{const r=indexedDB.open('n0fig',1);r.onupgradeneeded=()=>r.result.createObjectStore('f');r.onsuccess=()=>{const t=r.result.transaction('f','readwrite');t.objectStore('f').put(b,'glb');t.oncomplete=ok;t.onerror=()=>no(t.error);};r.onerror=()=>no(r.error);});
    location.href='studio.html#figure';}catch(e){toast('Couldn’t send it to 3D: '+(e.message||e),4000);}});

/* ---- sheet: drag the handle to open, half open or tuck away ---- */
{const p=$('#panel'),h=$('#fhandle');let lvl=1;const apply=()=>{p.dataset.lvl=lvl;};
  let y0=null;h.addEventListener('pointerdown',e=>{y0=e.clientY;try{h.setPointerCapture(e.pointerId);}catch(_){}});
  h.addEventListener('pointerup',e=>{if(y0==null)return;const d=e.clientY-y0;y0=null;if(Math.abs(d)<8)lvl=lvl===0?1:lvl===1?2:0;else lvl=d<0?Math.min(2,lvl+1):Math.max(0,lvl-1);apply();setTimeout(size,260);});
  apply();}

function size(){const w=innerWidth,h=innerHeight,desk=w>=860;canvas.style.width=w+'px';canvas.style.height=h+'px';renderer.setSize(w,h,false);camera.aspect=w/h;camera.clearViewOffset();
  if(desk)camera.setViewOffset(w,h,w*.13,0,w,h);else{const p=$('#panel').getBoundingClientRect();camera.setViewOffset(w,h,0,Math.max(0,(h-p.top)*.5),w,h);}camera.updateProjectionMatrix();bump();}
addEventListener('resize',size);
new ResizeObserver(()=>size()).observe($('#panel'));

/* ---- start ---- */
const loading=$('#fload');
try{
  H=await createHuman({THREE});
  try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s){H.load(s);await H.apply();H.outfit();H.pose(H.S.pose);H.expr();}}catch(e){}
  scene.add(H.root);show(tab);size();frame('body');
  loading.hidden=true;window.__hum=H;
}catch(e){console.error(e);loading.textContent='Couldn’t load the character data: '+(e.message||e)+'. Check your connection and reload.';}
initPen({canvas,toast});
window.__gp=createGamepad({THREE,camera,controls,S:{},toast,sheet:null,bump,canvas,cycle:d=>{if(!H)return;const k=Object.keys(POSES),i=(k.indexOf(H.S.pose)+d+k.length)%k.length;H.pose(k[i]);toast(k[i],900);bump();if(tab===4)show(4,true);},vert:()=>false});
(function loop(){requestAnimationFrame(loop);stepCam();controls.update();if(dirty>0){renderer.render(scene,camera);dirty--;}})();
