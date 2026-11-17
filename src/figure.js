/* Character creator: a stylised, fully procedural person built from smooth capsules and spheres, so it needs no downloads, no licences and
   works offline. Body, face, hair, outfit and pose are all sliders and swatches. "Open in 3D" hands the figure to the 3D page as a GLB
   (so it can be posed, lit, sculpted, painted and rendered there), and the whole page works with a controller or a pen. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createGamepad} from './gamepad.js';
import {initPen} from './pen.js';

const $=s=>document.querySelector(s);
const SKIN=['#f7d9c4','#eec3a0','#d8a47c','#b9794f','#8a5233','#5b3520','#3a2216'];
const HAIRC=['#16100c','#3b2417','#7a4a25','#b9832f','#e0c27a','#c8c8c8','#c2410c','#2563eb','#d946ef','#16a34a'];
const COL=['#f2efe8','#111111','#c2410c','#2563eb','#16a34a','#d946ef','#eab308','#64748b','#7f1d1d','#0f766e'];
const HAIRS=['Bald','Short','Crop','Long','Bun','Mohawk','Afro','Bob'];
const TOPS=['T-shirt','Long sleeve','Tank','Hoodie','Bare'];
const BOTS=['Trousers','Shorts','Skirt','Bare'];
const POSES={
  'A-pose':{aL:[0,0,-.55],aR:[0,0,.55],eL:[0,0,0],eR:[0,0,0],lL:[0,0,-.06],lR:[0,0,.06],kL:0,kR:0,tilt:0},
  'T-pose':{aL:[0,0,-1.5],aR:[0,0,1.5],eL:[0,0,0],eR:[0,0,0],lL:[0,0,-.04],lR:[0,0,.04],kL:0,kR:0,tilt:0},
  'Wave':{aL:[0,0,-.4],aR:[0,0,2.5],eL:[-.2,0,0],eR:[0,0,-.7],lL:[0,0,-.08],lR:[0,0,.08],kL:0,kR:0,tilt:0},
  'Walk':{aL:[.5,0,-.25],aR:[-.5,0,.25],eL:[-.4,0,0],eR:[-.1,0,0],lL:[-.45,0,-.05],lR:[.45,0,.05],kL:.1,kR:.7,tilt:0},
  'Run':{aL:[.9,0,-.2],aR:[-.9,0,.2],eL:[-1.3,0,0],eR:[-1.1,0,0],lL:[-.9,0,-.05],lR:[.7,0,.05],kL:.3,kR:1.5,tilt:.14},
  'Hero':{aL:[0,0,-.8],aR:[0,0,.8],eL:[0,0,0],eR:[0,0,0],lL:[0,0,-.28],lR:[0,0,.28],kL:0,kR:0,tilt:-.05}
};
const D={height:1,build:1,head:1,shoulders:1,arms:1,legs:1,skin:2,face:{eyes:'#3b2417',brow:1,mouth:0,nose:1,ears:1,eyeSize:1},hair:1,hairC:1,top:0,topC:2,bot:0,botC:7,shoeC:1,pose:'A-pose'};
let P;try{P=Object.assign(structuredClone(D),JSON.parse(localStorage.getItem('n0.figure')||'{}'));P.face=Object.assign({},D.face,P.face);}catch(e){P=structuredClone(D);}
const save=()=>{try{localStorage.setItem('n0.figure',JSON.stringify(P));}catch(e){}};

const canvas=$('#fc');const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:false});renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.05,60);camera.position.set(2.2,1.3,3.6);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,.95,0);controls.enableDamping=true;controls.minDistance=1.2;controls.maxDistance=9;controls.maxPolarAngle=Math.PI*.55;
const dark=matchMedia('(prefers-color-scheme: dark)').matches;let night=dark;
scene.add(new THREE.HemisphereLight(0xffffff,0x555566,1.1));
const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(3,5,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=3;key.shadow.camera.bottom=-1;scene.add(key);
const rim=new THREE.DirectionalLight(0xffffff,1.4);rim.position.set(-4,3,-3);scene.add(rim);
const floor=new THREE.Mesh(new THREE.CircleGeometry(1.6,64),new THREE.MeshStandardMaterial({color:0x888888,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
function theme(){const c=night?0x0b0b0c:0xf2f0ec;scene.background=new THREE.Color(c);floor.material.color.set(night?0x1b1b1e:0xdedad3);document.documentElement.dataset.t=night?'d':'l';}
theme();
let dirty=2;const bump=()=>{dirty=2;};controls.addEventListener('change',bump);

const std=(c,r=.62)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:0});
const fig=new THREE.Group();fig.name='Character';scene.add(fig);
let J={};
const cap=(r,l,m)=>{const g=new THREE.Mesh(new THREE.CapsuleGeometry(r,Math.max(.001,l),10,20),m);g.castShadow=true;return g;};
const sph=(r,m,sx=1,sy=1,sz=1)=>{const g=new THREE.Mesh(new THREE.SphereGeometry(r,28,20),m);g.scale.set(sx,sy,sz);g.castShadow=true;return g;};

function make(){
  fig.clear();J={};
  const H=P.height,B=P.build,skin=std(SKIN[P.skin],.55),hair=std(HAIRC[P.hairC],.45),top=std(COL[P.topC],.8),bot=std(COL[P.botC],.8),shoe=std(COL[P.shoeC],.5);
  const legU=.44*P.legs*H,legL=.42*P.legs*H,tor=.58*H,armU=.29*P.arms*H,armL=.27*P.arms*H,hr=.125*P.head*H;
  const hipY=legU+legL+.07,root=new THREE.Group();fig.add(root);J.root=root;
  const hips=new THREE.Group();hips.position.y=hipY;root.add(hips);J.hips=hips;
  const pel=cap(.12*B,.06,P.bot===3?skin:bot);pel.rotation.z=Math.PI/2;pel.scale.set(1,1,1.05);hips.add(pel);
  const chest=new THREE.Group();chest.position.y=.04;hips.add(chest);J.chest=chest;
  const tm=P.top===4?skin:top;const torso=cap(.135*B,tor-.2,tm);torso.scale.set(1.12,1,.78);torso.position.y=tor/2-.05;chest.add(torso);
  if(P.top===3){const hd=sph(.09*B,top,1.1,.8,.9);hd.position.set(0,tor-.04,-.1);chest.add(hd);}
  const neck=cap(.045*B,.05,skin);neck.position.y=tor+.02;chest.add(neck);
  const head=new THREE.Group();head.position.y=tor+.1+hr*.9;chest.add(head);J.head=head;
  const sk=sph(hr,skin,.92,1.06,1);head.add(sk);
  /* face */
  const F=P.face,eyeM=new THREE.MeshStandardMaterial({color:F.eyes,roughness:.2}),white=std(0xf6f6f6,.3),dark=std(0x1a1a1a,.4);
  for(const s of[-1,1]){const w=sph(hr*.17*F.eyeSize,white,1,1.05,.5);w.position.set(s*hr*.36,hr*.08,hr*.86);head.add(w);const i=sph(hr*.095*F.eyeSize,eyeM,1,1,.5);i.position.set(s*hr*.36,hr*.08,hr*.93);head.add(i);const p=sph(hr*.045*F.eyeSize,dark,1,1,.5);p.position.set(s*hr*.36,hr*.08,hr*.97);head.add(p);
    const br=cap(hr*.03,hr*.3,hair);br.rotation.z=Math.PI/2+s*.12*(F.brow-1);br.position.set(s*hr*.38,hr*(.3+.05*(F.brow-1)),hr*.86);br.scale.set(1,1,.6);head.add(br);
    const ear=sph(hr*.17*F.ears,skin,.5,1,.8);ear.position.set(s*hr*.9,0,0);head.add(ear);}
  const nose=sph(hr*.1*F.nose,skin,1,1.2,1.2);nose.position.set(0,-hr*.1,hr*.95);head.add(nose);
  const mouth=new THREE.Mesh(new THREE.TorusGeometry(hr*.2,hr*.022,8,24,Math.PI),std(0x8a3b3b,.5));mouth.rotation.z=Math.PI+(F.mouth)*.5;mouth.position.set(0,-hr*.42-F.mouth*hr*.03,hr*.88);mouth.scale.y=.55+F.mouth*.3;head.add(mouth);
  /* hair */
  const hs=P.hair;
  if(hs===1||hs===2||hs===3||hs===4||hs===7){const cp=new THREE.Mesh(new THREE.SphereGeometry(hr*1.04,28,20,0,Math.PI*2,0,Math.PI*(hs===2?.42:.55)),hair);cp.scale.set(.95,1.07,1.02);cp.rotation.x=-.18;cp.position.y=hr*.04;cp.castShadow=true;head.add(cp);}
  if(hs===3){const lg=cap(hr*.9,hr*1.4,hair);lg.scale.set(1,1,.45);lg.position.set(0,-hr*.7,-hr*.5);head.add(lg);}
  if(hs===7){const lg=sph(hr*1.08,hair,.98,.7,1.02);lg.position.set(0,-hr*.25,-hr*.1);head.add(lg);}
  if(hs===4){const bun=sph(hr*.42,hair);bun.position.set(0,hr*1.15,-hr*.3);head.add(bun);}
  if(hs===5){for(let i=0;i<7;i++){const f=cap(hr*.11,hr*.25,hair);f.position.set(0,hr*(.95-i*.09)+.01,hr*(.3-i*.18));f.rotation.x=-.4+i*.2;head.add(f);}}
  if(hs===6){const af=sph(hr*1.35,hair,1.05,.95,1.05);af.position.y=hr*.28;head.add(af);}
  /* arms */
  for(const s of[-1,1]){const k=s<0?'L':'R';
    const sh=new THREE.Group();sh.position.set(s*(.17*B*P.shoulders+.05),tor-.06,0);chest.add(sh);J['a'+k]=sh;
    const sleeve=P.top===0||P.top===3?.55:P.top===1?1:0;
    const um=sleeve>0?top:skin;const up=cap(.043*B,armU-.086+.03,um);up.position.y=-armU/2;sh.add(up);
    const el=new THREE.Group();el.position.y=-armU;sh.add(el);J['e'+k]=el;
    const lw=cap(.037*B,armL-.074+.03,P.top===1||P.top===3?top:skin);lw.position.y=-armL/2;el.add(lw);
    const hand=sph(.05,skin,1,1.2,.7);hand.position.y=-armL-.04;el.add(hand);}
  /* legs */
  for(const s of[-1,1]){const k=s<0?'L':'R';
    const lg=new THREE.Group();lg.position.set(s*.085*B,0,0);hips.add(lg);J['l'+k]=lg;
    const sh=P.bot===1||P.bot===2;const ub=P.bot===3?skin:bot;
    const up=cap(.062*B,legU-.124+.03,ub);up.position.y=-legU/2;lg.add(up);
    const kn=new THREE.Group();kn.position.y=-legU;lg.add(kn);J['k'+k]=kn;
    const lw=cap(.05*B,legL-.1+.03,sh||P.bot===3?skin:bot);lw.position.y=-legL/2;kn.add(lw);
    const ft=new THREE.Mesh(new THREE.CapsuleGeometry(.045,.12,8,14),shoe);ft.rotation.x=Math.PI/2;ft.scale.set(1.1,1,.7);ft.position.set(0,-legL-.03,.05);ft.castShadow=true;kn.add(ft);}
  if(P.bot===2){const sk2=new THREE.Mesh(new THREE.CylinderGeometry(.13*B,.22*B,.26*H,28,1,true),bot);sk2.material.side=THREE.DoubleSide;sk2.position.y=-.1;sk2.castShadow=true;hips.add(sk2);}
  pose();
}
function pose(){
  const p=POSES[P.pose]||POSES['A-pose'];
  J.aL.rotation.set(...p.aL);J.aR.rotation.set(...p.aR);J.eL.rotation.set(...p.eL);J.eR.rotation.set(...p.eR);
  J.lL.rotation.set(...p.lL);J.lR.rotation.set(...p.lR);J.kL.rotation.x=p.kL;J.kR.rotation.x=p.kR;J.chest.rotation.x=p.tilt;
  /* lower the hips so the feet stay on the floor after bending */
  fig.position.y=0;fig.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(fig);fig.position.y=-b.min.y;
  bump();
}
make();

/* ---------- UI ---------- */
const PANEL=$('#fp'),TABS=[['Body',body],['Face',face],['Hair',hairUI],['Outfit',outfit],['Pose',poseUI]];let tab=+localStorage.getItem('n0.figtab')||0;
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};
function slider(p,label,get,set,mn,mx,st=.01){const r=el('label','row');r.append(el('span','',label));const i=el('input');i.type='range';i.min=mn;i.max=mx;i.step=st;i.value=get();i.setAttribute('aria-label',label);i.addEventListener('input',()=>{set(+i.value);make();save();});r.appendChild(i);p.appendChild(r);}
function sw(p,label,cols,get,set){const r=el('div','row sw');r.append(el('span','',label));const w=el('div','swatches');cols.forEach((c,i)=>{const b=el('button','');b.type='button';b.style.background=c;b.setAttribute('aria-label',label+' '+(i+1));b.setAttribute('aria-pressed',String(get()===i));b.addEventListener('click',()=>{set(i);make();save();w.querySelectorAll('button').forEach((x,j)=>x.setAttribute('aria-pressed',String(j===i)));});w.appendChild(b);});r.appendChild(w);p.appendChild(r);}
function chips(p,label,list,get,set){const r=el('div','row sw');r.append(el('span','',label));const w=el('div','chips');list.forEach((n,i)=>{const b=el('button','chip',n);b.type='button';b.setAttribute('aria-pressed',String(get()===i));b.addEventListener('click',()=>{set(i);make();save();w.querySelectorAll('button').forEach((x,j)=>x.setAttribute('aria-pressed',String(j===i)));});w.appendChild(b);});r.appendChild(w);p.appendChild(r);}
function body(p){slider(p,'Height',()=>P.height,v=>P.height=v,.8,1.2);slider(p,'Build',()=>P.build,v=>P.build=v,.75,1.35);slider(p,'Shoulders',()=>P.shoulders,v=>P.shoulders=v,.8,1.35);slider(p,'Arms',()=>P.arms,v=>P.arms=v,.8,1.25);slider(p,'Legs',()=>P.legs,v=>P.legs=v,.8,1.3);sw(p,'Skin',SKIN,()=>P.skin,v=>P.skin=v);}
function face(p){slider(p,'Head size',()=>P.head,v=>P.head=v,.8,1.35);slider(p,'Eye size',()=>P.face.eyeSize,v=>P.face.eyeSize=v,.7,1.5);slider(p,'Brows',()=>P.face.brow,v=>P.face.brow=v,0,2);slider(p,'Nose',()=>P.face.nose,v=>P.face.nose=v,.5,1.8);slider(p,'Ears',()=>P.face.ears,v=>P.face.ears=v,.5,1.8);slider(p,'Smile',()=>P.face.mouth,v=>P.face.mouth=v,-1,1);
  const eyes=['#3b2417','#2563eb','#16a34a','#64748b','#111111','#b9832f'];sw(p,'Eyes',eyes,()=>eyes.indexOf(P.face.eyes),v=>P.face.eyes=eyes[v]);}
function hairUI(p){chips(p,'Style',HAIRS,()=>P.hair,v=>P.hair=v);sw(p,'Colour',HAIRC,()=>P.hairC,v=>P.hairC=v);}
function outfit(p){chips(p,'Top',TOPS,()=>P.top,v=>P.top=v);sw(p,'Top colour',COL,()=>P.topC,v=>P.topC=v);chips(p,'Bottom',BOTS,()=>P.bot,v=>P.bot=v);sw(p,'Bottom colour',COL,()=>P.botC,v=>P.botC=v);sw(p,'Shoes',COL,()=>P.shoeC,v=>P.shoeC=v);}
function poseUI(p){chips(p,'Pose',Object.keys(POSES),()=>Object.keys(POSES).indexOf(P.pose),v=>{P.pose=Object.keys(POSES)[v];});}
function show(i){tab=(i+TABS.length)%TABS.length;try{localStorage.setItem('n0.figtab',tab);}catch(e){}
  $('#ftabs').querySelectorAll('.tab').forEach((b,j)=>b.setAttribute('aria-selected',String(j===tab)));PANEL.innerHTML='';TABS[tab][1](PANEL);PANEL.scrollTop=0;}
TABS.forEach(([n],i)=>{const b=el('button','tab',n);b.type='button';b.setAttribute('role','tab');b.addEventListener('click',()=>show(i));$('#ftabs').appendChild(b);});
show(tab);

function toast(m,ms=2200){const t=$('#ft');t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,ms);}
const rnd=a=>Math.floor(Math.random()*a);
$('#frand').addEventListener('click',()=>{Object.assign(P,{height:.88+Math.random()*.3,build:.8+Math.random()*.5,head:.85+Math.random()*.4,shoulders:.85+Math.random()*.4,arms:.9+Math.random()*.3,legs:.85+Math.random()*.4,skin:rnd(SKIN.length),hair:rnd(HAIRS.length),hairC:rnd(HAIRC.length),top:rnd(TOPS.length),topC:rnd(COL.length),bot:rnd(BOTS.length),botC:rnd(COL.length),shoeC:rnd(COL.length)});make();save();show(tab);});
$('#freset').addEventListener('click',()=>{P=structuredClone(D);make();save();show(tab);});
$('#ftheme').addEventListener('click',()=>{night=!night;theme();bump();});
async function glb(){const ex=new GLTFExporter();fig.updateMatrixWorld(true);const g=fig.clone(true);g.position.set(0,0,0);return new Promise((ok,no)=>ex.parse(g,ok,no,{binary:true}));}
$('#fdl').addEventListener('click',async()=>{try{const b=await glb(),u=URL.createObjectURL(new Blob([b],{type:'model/gltf-binary'})),a=el('a');a.href=u;a.download='character.glb';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);toast('Saved character.glb');}catch(e){toast('Couldn’t export: '+(e.message||e));}});
$('#f3d').addEventListener('click',async()=>{
  try{const b=await glb();await new Promise((ok,no)=>{const r=indexedDB.open('n0fig',1);r.onupgradeneeded=()=>r.result.createObjectStore('f');r.onsuccess=()=>{const t=r.result.transaction('f','readwrite');t.objectStore('f').put(b,'glb');t.oncomplete=ok;t.onerror=()=>no(t.error);};r.onerror=()=>no(r.error);});
    location.href='studio.html#figure';}catch(e){toast('Couldn’t send it to 3D: '+(e.message||e),4000);}});

function size(){const w=innerWidth,h=innerHeight,desk=w>=860;canvas.style.width=w+'px';canvas.style.height=h+'px';renderer.setSize(w,h,false);camera.aspect=w/h;
  camera.setViewOffset(w,h,desk?w*.14:0,desk?0:h*.1,w,h);camera.updateProjectionMatrix();bump();}
addEventListener('resize',size);size();
initPen({canvas,toast});
const cycleTabs=d=>show(tab+d);
window.__gp=createGamepad({THREE,camera,controls,S:{},toast,sheet:null,bump,canvas,cycle:d=>{const k=Object.keys(POSES),i=(k.indexOf(P.pose)+d+k.length)%k.length;P.pose=k[i];pose();toast(P.pose,900);if(tab===4)show(4);},vert:()=>false});
let last=performance.now();
(function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000);last=now;
  if(!matchMedia('(prefers-reduced-motion:reduce)').matches&&J.chest){J.chest.scale.y=1+Math.sin(now/900)*.006;dirty=Math.max(dirty,1);}
  const mv=controls.update();if(dirty>0){renderer.render(scene,camera);dirty--;}})(last);
window.__fig={P,make,pose};
