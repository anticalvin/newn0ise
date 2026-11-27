/* Character creator 2.0. A real rigged human (MakeHuman core assets, CC0) with body and face morphs, expressions, hair, outfits, poses and GLB export.
   Mobile-first: full-screen viewport and a compact bottom sheet. Everything is serialisable (one JSON state), undoable and deterministic when randomised.
   "Open in 3D" hands the rigged GLB to the 3D page. See docs/CHARACTER_AUDIT.md. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createHuman,DEFAULT,STYLE,STATURE,POSES,EXPRESSIONS,ageYears,ageFromYears,TOP_DEFAULTS,BOTTOM_DEFAULTS} from './human.js';
import {createGamepad} from './gamepad.js';
import {initPen} from './pen.js';
import {createExperimental} from './experimental.js';

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
let night=matchMedia('(prefers-color-scheme: dark)').matches,bgName=night?'Dark':'Light';
const BGS={Dark:[0x0b0b0c,0x1c1c1f],Light:[0xeceae6,0xd9d6cf],Grey:[0x6b6b6b,0x585858]};
function theme(){const b=BGS[bgName]||BGS.Dark;scene.background=new THREE.Color(b[0]);floor.material.color.set(b[1]);document.documentElement.dataset.t=bgName==='Light'?'l':'d';}theme();
/* lighting: direct studio lights with a room environment (default), a softbox look driven almost only by the environment, and a procedural outdoor sky. Nothing is downloaded. */
const sky=(()=>{const s=new THREE.Scene(),m=new THREE.ShaderMaterial({side:THREE.BackSide,uniforms:{},vertexShader:'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){float h=p.y;vec3 top=vec3(.28,.5,.9),hor=vec3(1.,.93,.82),gr=vec3(.18,.17,.15);vec3 c=h>0.?mix(hor,top,pow(h,.5)):mix(hor,gr,pow(-h,.4));float sun=pow(max(dot(p,normalize(vec3(.5,.55,.65))),0.),180.)*14.;gl_FragColor=vec4(c*1.6+vec3(1.,.9,.7)*sun,1.);}'});s.add(new THREE.Mesh(new THREE.SphereGeometry(20,32,16),m));return s;})();
const envRoom=scene.environment,envSky=pm.fromScene(sky,.02).texture;
const LIGHTS={Studio:{env:envRoom,ei:.55,key:2.6,rim:1.6,fill:.5},Softbox:{env:envRoom,ei:1.15,key:.9,rim:.5,fill:.4},Outdoor:{env:envSky,ei:1.0,key:2.2,rim:.4,fill:.2}};
let lightName='Studio';
function setLight(n){const L=LIGHTS[n];if(!L)return;lightName=n;scene.environment=L.env;scene.environmentIntensity=L.ei;key.intensity=L.key;rim.intensity=L.rim;fill.intensity=L.fill;bump();}
let dirty=2;const bump=()=>{dirty=3;};controls.addEventListener('change',bump);

function toast(m,ms=2400){const t=$('#ft');t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,ms);}
let H=null,EXP=null,expLast=0;
const KEY='n0.human';
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(H.S));}catch(e){}};
/* ---- undo / redo of the whole editable state ---- */
const U={u:[],r:[],pend:false};
function touch(){if(U.pend)return;U.pend=true;U.u.push(JSON.stringify(H.S));if(U.u.length>60)U.u.shift();U.r.length=0;setTimeout(()=>U.pend=false,700);}
async function restore(js){H.load(JSON.parse(js));await H.apply();await H.outfit();H.pose(H.S.pose);H.expr();show(tab,true);save();bump();}
async function undo(){if(!U.u.length){toast('Nothing to undo.');return;}U.r.push(JSON.stringify(H.S));await restore(U.u.pop());}
async function redo(){if(!U.r.length){toast('Nothing to redo.');return;}U.u.push(JSON.stringify(H.S));await restore(U.r.pop());}

/* ---- camera moves ---- */
let cam=null;
function frame(kind){
  const b=new THREE.Box3().setFromObject(H.body),h=b.max.y,hd=H.bones.find(x=>x.name==='head'),hp=new THREE.Vector3();hd.getWorldPosition(hp);
  const eL=H.root.getObjectByName('Eye.L'),eR=H.root.getObjectByName('Eye.R'),ep=new THREE.Vector3();if(eL&&eR){const a=new THREE.Vector3(),c2=new THREE.Vector3();eL.getWorldPosition(a);eR.getWorldPosition(c2);ep.copy(a).add(c2).multiplyScalar(.5);}else ep.copy(hp).y+=.04;
  const cx=ep.x;
  const to=kind==='face'?{t:new THREE.Vector3(cx,ep.y-.01,ep.z),d:.95}:kind==='head'?{t:new THREE.Vector3(cx,ep.y-.03,ep.z),d:1.9}:{t:new THREE.Vector3(0,h*.52,0),d:Math.max(3,h*2.3)};
  const fit=innerWidth<860?Math.min(1.9,Math.max(1,innerHeight/Math.max(220,$('#panel').getBoundingClientRect().top))):1;
  let dir=camera.position.clone().sub(controls.target).normalize();
  if(kind==='profile')dir=new THREE.Vector3(1,.06,0);else if(kind==='back')dir=new THREE.Vector3(0,.08,-1);else if(kind==='front')dir=new THREE.Vector3(0,.06,1);
  cam={t:to.t,d:to.d*fit,dir:dir.normalize()};
}
function stepCam(){if(!cam)return;controls.target.lerp(cam.t,.14);const d=camera.position.distanceTo(controls.target),nd=d+(cam.d-d)*.14;camera.position.copy(controls.target).addScaledVector(cam.dir,nd);if(Math.abs(nd-cam.d)<.004&&controls.target.distanceTo(cam.t)<.004)cam=null;bump();}

/* ---- panel ---- */
const PANEL=$('#fp'),TN=['Body','Face','Hair','Outfit','Pose','Looks','View'];let tab=+localStorage.getItem('n0.figtab')||0;
const PAL=['#f2efe8','#111111','#c2410c','#2563eb','#16a34a','#d946ef','#eab308','#64748b','#7f1d1d','#0f766e','#8b5a2b','#f4c2c2'];
const HAIRC=['#16100c','#3b2417','#7a4a25','#b9832f','#e0c27a','#c8c8c8','#c2410c','#2563eb','#d946ef','#16a34a'];
const SKIN=['#f7d9c4','#eec3a0','#d8a47c','#b9794f','#8a5233','#5b3520','#3a2216'];
const EYE=['#4a3020','#2563eb','#16a34a','#64748b','#111111','#b9832f'];
const D=(g,n,bi)=>{const d=H.man.detail.find(x=>x.group===g&&x.name===n&&(bi==null||x.bi===bi));return d&&d.id;};
/* every slider has a numeric box beside it and resets on double-click of its label; o.to/o.from convert between the stored value and what the box shows */
function slider(p,label,get,set,mn,mx,fmt,o={}){const r=el('label','row');const sp=el('span','',label);sp.title='Double-click to reset';r.append(sp);const i=el('input');i.type='range';i.min=mn;i.max=mx;i.step=o.step||.01;i.value=get();i.setAttribute('aria-label',label);
  const to=o.to||(v=>Math.round(v*100)),from=o.from||(x=>x/100),n=el('input','num');n.type='number';n.min=to(mn);n.max=to(mx);n.step=o.nstep||1;n.value=to(+i.value);n.setAttribute('aria-label',label+' value');
  const push=v=>{touch();v=Math.max(mn,Math.min(mx,v));i.value=v;n.value=to(v);set(v);H.apply().then(()=>{save();bump();if(o.after)o.after(i,n);});};
  i.addEventListener('input',()=>push(+i.value));n.addEventListener('change',()=>{if(n.value==='')return;push(from(+n.value));});
  sp.addEventListener('dblclick',()=>push(o.def!=null?o.def:(mn<0?0:(mn+mx)/2)));r.append(i,n);p.appendChild(r);return i;}
function dslider(p,label,id,mx=1){if(!id)return;const d=H.man.detail.find(x=>x.id===id);slider(p,label,()=>H.S.detail[id]||0,v=>{H.S.detail[id]=v;},d.bi?-mx:0,mx,null,{def:0});}
function sw(p,label,cols,get,set){const r=el('div','row sw');r.append(el('span','',label));const w=el('div','swatches');cols.forEach((c,i)=>{const b=el('button','');b.type='button';b.style.background=c;b.setAttribute('aria-label',label+' '+(i+1));b.setAttribute('aria-pressed',String(get()===c));b.addEventListener('click',()=>{touch();set(c);w.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));save();bump();});w.appendChild(b);});
  const ci=el('input','cpick');ci.type='color';ci.value=/^#[0-9a-f]{6}$/i.test(get())?get():'#888888';ci.title='Custom colour';ci.setAttribute('aria-label',label+' custom colour');ci.addEventListener('change',()=>{touch();set(ci.value);w.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed','false'));save();bump();});w.appendChild(ci);
  r.appendChild(w);p.appendChild(r);}
function chips(p,label,list,get,set){const r=el('div','row sw');r.append(el('span','',label));const w=el('div','chips');list.forEach(n=>{const b=el('button','chip',n);b.type='button';b.setAttribute('aria-pressed',String(get()===n));b.addEventListener('click',()=>{touch();set(n);w.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));save();bump();});w.appendChild(b);});r.appendChild(w);p.appendChild(r);}
const head=(p,t)=>p.appendChild(el('h3','',t));
function tiles(p,label,items,get,set){const r=el('div','row sw');r.append(el('span','',label));const w=el('div','tiles'+(items.length>6?' wrap':''));
  items.forEach(it=>{const b=el('button','tile');b.type='button';b.title=it.label;b.setAttribute('aria-label',it.label);b.setAttribute('aria-pressed',String(get()===it.id));
    if(it.thumb){const im=el('img');im.src=it.thumb;im.alt='';im.loading='lazy';b.appendChild(im);}
    else if(it.svg){const i=el('b','ic');i.innerHTML=it.svg;b.appendChild(i);}
    else if(it.bg){const i=el('b','sw');i.style.background=it.bg;b.appendChild(i);}
    else if(it.live){const i=el('img');i.alt='';i.className='live';b.appendChild(i);liveThumb(i,it.live);}
    else b.appendChild(el('b','',it.glyph||it.label.slice(0,2)));b.appendChild(el('small','',it.label));
    b.addEventListener('click',()=>{touch();set(it.id);w.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});w.appendChild(b);});r.appendChild(w);p.appendChild(r);}

/* ---- visual references: simple line icons for things that have no library thumbnail, and live renders of the actual character for poses and expressions ---- */
const IC=(d,extra='')=>`<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${d.map(x=>'<path d="'+x+'"/>').join('')}${extra}</svg>`;
const ICONS={
  tank:IC(['M16 8 L14 16 L14 40 L34 40 L34 16 L32 8 Q28 15 24 15 Q20 15 16 8Z']),
  tee:IC(['M16 8 L8 12 L4 21 L10 24 L13 21 L13 40 L35 40 L35 21 L38 24 L44 21 L40 12 L32 8 Q24 14 16 8Z']),
  crop:IC(['M16 8 L8 12 L4 21 L10 24 L13 21 L13 30 L35 30 L35 21 L38 24 L44 21 L40 12 L32 8 Q24 14 16 8Z']),
  '3/4':IC(['M16 8 L8 12 L5 30 L10 31 L13 23 L13 40 L35 40 L35 23 L38 31 L43 30 L40 12 L32 8 Q24 14 16 8Z']),
  long:IC(['M16 8 L8 12 L5 39 L10 40 L13 23 L13 40 L35 40 L35 23 L38 40 L43 39 L40 12 L32 8 Q24 14 16 8Z']),
  shorts:IC(['M14 8 H34 L36 26 H27 L24 16 L21 26 H12Z']),
  bermuda:IC(['M14 8 H34 L36 32 H27 L24 17 L21 32 H12Z']),
  capri:IC(['M14 8 H34 L36 37 H27 L24 17 L21 37 H12Z']),
  trousers:IC(['M14 6 H34 L36 43 H27 L24 18 L21 43 H12Z']),
  sunglasses:IC(['M6 20 H21 V27 Q21 33 13.5 33 Q6 33 6 27Z','M27 20 H42 V27 Q42 33 34.5 33 Q27 33 27 27Z','M21 22 Q24 20 27 22']),
  round:IC(['M21 27 A7.5 7.5 0 1 1 6 27 A7.5 7.5 0 1 1 21 27Z','M42 27 A7.5 7.5 0 1 1 27 27 A7.5 7.5 0 1 1 42 27Z','M21 25 Q24 22 27 25']),
  visor:IC(['M5 19 H43 L40 31 Q24 36 8 31Z']),
  none:IC(['M10 10 L38 38','M24 6 A18 18 0 1 0 24.1 6Z']),
  hair_ponytail:IC(['M24 8 C14 8 12 18 13 26 C14 20 18 15 24 15 C30 15 34 20 35 26 C36 18 34 8 24 8Z','M35 18 C42 20 42 32 38 42 C36 34 36 28 34 22'],'<circle cx="24" cy="28" r="7"/>'),
  hair_long:IC(['M24 7 C13 7 11 20 12 42 L17 42 L17 22 C20 17 28 17 31 22 L31 42 L36 42 C37 20 35 7 24 7Z'],'<circle cx="24" cy="28" r="5"/>'),
  hair_bob:IC(['M24 7 C14 7 11 18 12 33 L19 33 L19 23 C22 19 26 19 29 23 L29 33 L36 33 C37 18 34 7 24 7Z'],'<circle cx="24" cy="28" r="5"/>'),
  hair_curly:IC(['M13 24 C9 20 11 14 16 14 C16 8 24 7 27 11 C32 8 38 12 35 17 C40 19 38 26 33 26 C34 30 30 32 28 30'],'<circle cx="24" cy="29" r="6"/>'),
  hair_bun:IC(['M24 12 C15 12 13 19 14 26 C16 20 19 18 24 18 C29 18 32 20 34 26 C35 19 33 12 24 12Z','M24 4 A5 5 0 1 1 23.9 4Z'],'<circle cx="24" cy="30" r="6"/>'),
  hair_braid:IC(['M24 8 C15 8 13 18 14 26 C16 20 19 16 24 16 C29 16 32 20 34 26 C35 18 33 8 24 8Z','M34 24 C37 28 31 30 35 34 C39 38 33 40 36 44'],'<circle cx="24" cy="29" r="6"/>'),
  hair_mohawk:IC(['M18 18 C18 8 24 6 24 6 C24 6 30 8 30 18','M19 20 C15 22 14 28 16 31 M29 20 C33 22 34 28 32 31'],'<circle cx="24" cy="26" r="7"/>'),
  hair_pixie:IC(['M24 10 C15 10 13 19 14 25 C17 20 21 18 27 19 C31 20 33 22 34 25 C35 18 33 10 24 10Z'],'<circle cx="24" cy="29" r="6"/>'),
  strand_off:IC(['M10 10 L38 38','M24 6 A18 18 0 1 0 24.1 6Z'])
};
/* a rendered thumbnail of the live character: pose, or expression close-up. Rendered into a small target on demand, never while the user is dragging. */
const THUMB={cache:new Map(),queue:[],busy:false,rt:null};
function thumbKey(spec){return JSON.stringify([spec,H.S.base,H.S.skinTex,H.S.skin,Math.round(H.measure.stature*100)]);}
function liveThumb(img,spec){const key=thumbKey(spec),hit=THUMB.cache.get(key);if(hit){img.src=hit;return;}THUMB.queue.push({img,spec,key});pumpThumbs();}
function pumpThumbs(){if(THUMB.busy||!THUMB.queue.length)return;THUMB.busy=true;requestAnimationFrame(()=>{const t0=performance.now();
  while(THUMB.queue.length&&performance.now()-t0<24){const j=THUMB.queue.shift();if(!j.img.isConnected)continue;try{const url=renderThumb(j.spec);THUMB.cache.set(j.key,url);j.img.src=url;}catch(e){console.warn('thumbnail',e);}}
  THUMB.busy=false;pumpThumbs();});}
function renderThumb(spec){
  const W=spec.kind==='face'?112:120,Hh=spec.kind==='face'?112:160,rt=THUMB.rt&&THUMB.rt.width===W&&THUMB.rt.height===Hh?THUMB.rt:(THUMB.rt=new THREE.WebGLRenderTarget(W,Hh,{samples:4}));
  const keepPose=H.S.pose,keepExpr=H.S.expr,keepBg=scene.background,keepFloor=floor.visible,keepR=renderer.getRenderTarget(),keepA=renderer.getClearAlpha();
  const cam=new THREE.PerspectiveCamera(spec.kind==='face'?22:28,W/Hh,.05,40);
  try{
    if(spec.pose){H.pose(spec.pose);}else H.pose('A-pose');
    if(spec.expr){H.S.expr={...EXPRESSIONS[spec.expr]};}else H.S.expr={};H.expr();H.root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(H.body),c=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    if(spec.kind==='face'){const a=new THREE.Vector3(),b=new THREE.Vector3();H.root.getObjectByName('Eye.L').getWorldPosition(a);H.root.getObjectByName('Eye.R').getWorldPosition(b);a.add(b).multiplyScalar(.5);a.y-=.03;cam.position.set(a.x,a.y,a.z+.78);cam.lookAt(a);}
    else{const d=Math.max(size.y*1.05,size.x*.9)/(2*Math.tan(cam.fov*Math.PI/360)),ang=spec.view==='front'?0:spec.view==='back'?Math.PI:spec.view==='side'?Math.PI/2:.62;cam.position.set(c.x+Math.sin(ang)*d,c.y,c.z+Math.cos(ang)*d);cam.lookAt(c);}
    scene.background=null;floor.visible=false;renderer.setRenderTarget(rt);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,cam);
    const buf=new Uint8Array(W*Hh*4);renderer.readRenderTargetPixels(rt,0,0,W,Hh,buf);
    const cv=document.createElement('canvas');cv.width=W;cv.height=Hh;const g=cv.getContext('2d'),im=g.createImageData(W,Hh);
    for(let y=0;y<Hh;y++)im.data.set(buf.subarray((Hh-1-y)*W*4,(Hh-y)*W*4),y*W*4);const d=im.data;for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;for(let k=0;k<3;k++)d[i+k]=Math.min(255,255*Math.pow(d[i+k]/255,1/2.2)*1.1);}g.putImageData(im,0,0);return cv.toDataURL('image/png');
  }finally{renderer.setRenderTarget(keepR);renderer.setClearAlpha(keepA);scene.background=keepBg;floor.visible=keepFloor;H.S.expr=keepExpr;H.expr();H.pose(keepPose);H.root.updateMatrixWorld(true);bump();}
}
const th=id=>'assets/human/a/'+id+'_t.webp';
const nice=id=>id.replace(/^culturalibre_/,'').replace(/_/g,' ').replace(/(\D)0?(\d+)$/,'$1 $2');
const libItems=(kind,filter)=>H.lib[kind].filter(x=>!filter||filter(x.id)).map(x=>({id:x.id,label:nice(x.id),thumb:th(x.id)}));

const none={id:'none',label:'None',svg:ICONS.none};
const refit=()=>H.outfit().then(()=>{save();bump();});
const SUITS=id=>/suit|culturalibre/.test(id);
const TABS=[
  p=>{head(p,'Base body');
    chips(p,'Body',['Male','Female'],()=>H.S.gender===1||H.S.gender===0?(H.S.base==='female'?'Female':'Male'):'',n=>{H.setBase(n.toLowerCase());H.apply().then(()=>{save();bump();show(0,true);});});
    if(H.S.gender!==1&&H.S.gender!==0)p.appendChild(el('p','note','This look was saved with a blended body ('+Math.round(H.S.gender*100)+'% male). Pick Male or Female to switch to a base body.'));
    head(p,'Height and age');
    const note=el('p','note');const ftin=cm=>{const t=cm/2.54,f=Math.floor(t/12);return f+'′'+Math.round(t-f*12)+'″';};
    const upd=()=>{const m=H.measure,cm=m.stature*100;note.textContent='Measured standing height '+cm.toFixed(1)+' cm ('+ftin(cm)+'). Reachable for this body: '+Math.round(Math.max(140,m.reach[0]*100))+' to '+Math.round(Math.min(215,m.reach[1]*100))+' cm.'+(m.clamped?' Your height was limited to what this body can do.':'');};
    slider(p,'Height (cm)',()=>H.S.stature||Math.round(H.measure.stature*100),v=>H.setStature(v),140,215,null,{step:1,to:v=>Math.round(v),from:x=>x,nstep:1,def:STATURE[H.S.base],after:(i,n)=>{upd();const m=Math.round(H.measure.stature*100);i.value=m;n.value=m;}});
    p.appendChild(note);upd();
    chips(p,'Presets',['Average','Tall'],()=>'',n=>{H.setStature(n==='Tall'?STATURE.presets[H.S.base]:STATURE[H.S.base]);H.apply().then(()=>{save();bump();show(0,true);});});
    slider(p,'Age (years)',()=>Math.max(ageFromYears(18),H.S.age),v=>H.S.age=v,ageFromYears(18),1,null,{step:.002,to:v=>Math.round(ageYears(v)),from:ageFromYears,def:.5});
    head(p,'Physique');slider(p,'Muscle',()=>H.S.muscle,v=>H.S.muscle=v,0,1);slider(p,'Weight',()=>H.S.weight,v=>H.S.weight=v,0,1);slider(p,'Proportions',()=>H.S.prop,v=>H.S.prop=v,0,1);
    head(p,'Build');dslider(p,'Shoulders',D('torso','torso-scale-horiz'));dslider(p,'Chest depth',D('torso','torso-scale-depth'));dslider(p,'Waist',D('hip','hip-waist'));dslider(p,'Hips',D('hip','hip-scale-horiz'));dslider(p,'Belly',D('stomach','stomach-pregnant'));dslider(p,'Arms',D('armslegs','upperarm-fat'));dslider(p,'Legs',D('armslegs','upperleg-fat'));dslider(p,'Neck',D('neck','neck-scale-horiz'));
    head(p,'Ancestry blend');for(const k of['african','asian','caucasian'])slider(p,k[0].toUpperCase()+k.slice(1),()=>H.S.race[k],v=>H.S.race[k]=v,0,1,null,{def:1/3});
    head(p,'Skin');tiles(p,'Texture',[{id:'auto',label:'Auto',glyph:'✦'},{id:'none',label:'Flat',glyph:'▭'},...H.lib.skins.map(x=>({id:x.id,label:nice(x.id),thumb:th('skin_'+x.id)}))],()=>H.S.skinTex,id=>{H.S.skinTex=id;H.applySkin();save();bump();});
    slider(p,'Tone',()=>H.S.tone,v=>{H.S.tone=v;H.applySkin();},.55,1.35,null,{def:1});sw(p,'Flat colour',SKIN,()=>H.S.skin,c=>{H.S.skin=c;H.S.skinTex='none';H.applySkin();show(0,true);});},
  p=>{head(p,'Expression');tiles(p,'Expression',Object.keys(EXPRESSIONS).map(k=>({id:k,label:k,live:{kind:'face',expr:k}})),()=>Object.keys(EXPRESSIONS).find(k=>JSON.stringify(EXPRESSIONS[k])===JSON.stringify(H.S.expr))||'',n=>{H.S.expr={...EXPRESSIONS[n]};H.expr();save();bump();});
    head(p,'Head and brow');dslider(p,'Head width',D('head','head-scale-horiz'));dslider(p,'Head height',D('head','head-scale-vert'));dslider(p,'Head depth',D('head','head-scale-depth'));dslider(p,'Forehead',D('forehead','forehead-scale-vert'));dslider(p,'Brow ridge',D('forehead','forehead-nubian'));dslider(p,'Brow angle',D('eyebrows','eyebrows-angle'));
    tiles(p,'Eyebrows',[none,...libItems('eyebrows')],()=>H.S.brows.style,n=>{H.S.brows.style=n;refit();});
    head(p,'Eyes');dslider(p,'Eye size',D('eyes','eye-scale'));dslider(p,'Eye height',D('eyes','eye-height1'));dslider(p,'Eye spacing',D('eyes','eye-push1'));dslider(p,'Eye corners',D('eyes','eye-corner1'));dslider(p,'Eye bags',D('eyes','eye-bag-height'));
    chips(p,'Lashes',['On','Off'],()=>H.S.lashes?'On':'Off',n=>{H.S.lashes=n==='On';refit();});
    head(p,'Nose');dslider(p,'Nose width',D('nose','nose-scale-horiz'));dslider(p,'Nose length',D('nose','nose-scale-vert'));dslider(p,'Nose depth',D('nose','nose-scale-depth'));dslider(p,'Bridge hump',D('nose','nose-hump'));dslider(p,'Tip',D('nose','nose-point'));dslider(p,'Nostrils',D('nose','nose-nostrils-width'));
    head(p,'Mouth and jaw');dslider(p,'Mouth width',D('mouth','mouth-scale-horiz'));dslider(p,'Lip fullness',D('mouth','mouth-lowerlip-volume'));dslider(p,'Upper lip',D('mouth','mouth-upperlip-volume'));dslider(p,'Chin',D('chin','chin-prominent'));dslider(p,'Jaw width',D('chin','chin-width'));dslider(p,'Chin height',D('chin','chin-height'));dslider(p,'Cheeks',D('cheek','cheek-volume'));dslider(p,'Cheekbones',D('cheek','cheek-bones'));dslider(p,'Ear size',D('ears','ear-scale'));
    head(p,'Eye colour');sw(p,'Eyes',EYE,()=>H.S.eye,c=>H.setEye(c));slider(p,'Iris size',()=>H.S.iris??1,v=>{H.S.iris=v;H.setEye(H.S.eye);},.6,1.4,null,{def:1,after:()=>{}});slider(p,'Pupil size',()=>H.S.pupil??.36,v=>{H.S.pupil=v;H.setEye(H.S.eye);},.15,.6,null,{def:.36});
    head(p,'All morphs');const q=el('input','search');q.type='search';q.placeholder='Search morphs, e.g. nose, jaw, ear';q.setAttribute('aria-label','Search morphs');p.appendChild(q);
    const groups=[...new Set(H.man.detail.map(d=>d.group))];let region='';const box=el('div','list');
    const rs=el('div','chips');const mk=(g,lab)=>{const b=el('button','chip',lab);b.type='button';b.setAttribute('aria-pressed',String(region===g));b.addEventListener('click',()=>{region=g;rs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw();});rs.appendChild(b);};
    mk('','All');groups.forEach(g=>mk(g,g));p.appendChild(rs);p.appendChild(box);
    const rr=el('button','chip','Reset region');rr.type='button';rr.addEventListener('click',()=>{touch();for(const d of H.man.detail)if(!region||d.group===region)delete H.S.detail[d.id];H.apply().then(()=>{save();bump();draw();});});p.appendChild(rr);
    function draw(){box.innerHTML='';const t=q.value.trim().toLowerCase();let n=0;for(const d of H.man.detail){if(region&&d.group!==region)continue;if(t&&!(d.name+' '+d.group).toLowerCase().includes(t))continue;if(++n>40)break;slider(box,nice(d.name),()=>H.S.detail[d.id]||0,v=>{H.S.detail[d.id]=v;},d.bi?-1:0,1,null,{def:0});}if(!n)box.appendChild(el('p','note','No morphs match. Try a shorter word.'));}
    q.addEventListener('input',draw);draw();},
  p=>{head(p,'Hair');tiles(p,'Style',[none,...libItems('hair')],()=>H.S.hair.style,n=>{H.S.hair.style=n;refit();});
    sw(p,'Colour',['#ffffff',...HAIRC],()=>H.S.hair.color,c=>{H.S.hair.color=c;H.S.brows.color=c==='#ffffff'?'#ffffff':c;refit().then(()=>{if(EXP.state.hair)EXP.startHair(EXP.state.hair.lod,EXP.state.hair.style);});});
    head(p,'Strand hair');p.appendChild(el('p','note','Real moving strands that swing with the head and the pose. Pick a style, then a quality. They sit on top of the fitted hair above; set that to None to see them alone.'));
    const st=EXP.state,styles=Object.entries(EXP.STYLES).map(([id,v])=>({id,label:v.label,svg:ICONS['hair_'+(id==='low ponytail'?'ponytail':id)]||ICONS.hair_pixie}));
    tiles(p,'Style',[{id:'off',label:'Off',svg:ICONS.strand_off},...styles],()=>st.hair?st.hair.style:'off',id=>{if(id==='off'){EXP.stopHair();}else if(!EXP.startHair(st.hair?st.hair.lod:'medium',id))toast('Could not find a scalp to grow hair from on this look.',3600);save();bump();});
    chips(p,'Quality',['low','medium','high'],()=>st.hair?st.hair.lod:'medium',n=>{if(st.hair)EXP.startHair(n,st.hair.style);});
    head(p,'Hair care');p.appendChild(el('p','note','Colour above also tints the strands.'));},
  p=>{head(p,'Outfit');p.appendChild(el('p','note','A full outfit replaces the top and bottom. Shoes, headwear and glasses layer on top.'));
    tiles(p,'Full outfit',[none,...libItems('clothes',SUITS)],()=>H.S.suit.style,n=>{H.S.suit.style=n;refit();});sw(p,'Tint',['#ffffff',...PAL],()=>H.S.suit.color,c=>{H.S.suit.color=c;refit();});
    head(p,'Base layer');
    const lay=(slot,styles,defs,label,ordLabel)=>{const L=H.S[slot];
      tiles(p,label,[none,...styles.filter(x=>x!=='none').map(x=>({id:x,label:x,svg:ICONS[x]}))],()=>L.style,n=>{L.style=n;L.opt={};refit().then(()=>show(3,true));});sw(p,'Colour',PAL,()=>L.color,c=>{L.color=c;refit();});
      if(L.style!=='none'&&defs[L.style]){L.opt=L.opt||{};const d=defs[L.style];const so=(name,key,mn,mx)=>slider(p,name,()=>L.opt[key]??d[key],v=>{L.opt[key]=v;},mn,mx,null,{def:d[key],step:.02,to:v=>Math.round(v*100)/100*1,from:x=>x,nstep:.1,after:()=>{refit();}});
        if(slot==='top'){so('Sleeve length','sleeve',1.2,4.15);so('Hem height','hem',.9,3.6);so('Neckline','neck',4.8,6);}else{so('Leg length','hem',-8.2,-1.2);so('Waist','rise',.4,2.2);}
        slider(p,'Fit',()=>L.fit??(slot==='top'?.05:.035),v=>{L.fit=v;},0,1,null,{def:slot==='top'?.05:.035,after:()=>{refit();}});}};
    lay('top',STYLE.top,TOP_DEFAULTS,'Top');lay('bottom',STYLE.bottom,BOTTOM_DEFAULTS,'Bottom');
    head(p,'Shoes');tiles(p,'Shoes',[none,...libItems('clothes',id=>/^shoes/.test(id))],()=>H.S.shoes.style,n=>{H.S.shoes.style=n;refit();});sw(p,'Tint',['#ffffff',...PAL],()=>H.S.shoes.color,c=>{H.S.shoes.color=c;refit();});
    head(p,'Headwear and glasses');tiles(p,'Headwear',[none,...libItems('clothes',id=>/fedora/.test(id))],()=>H.S.head.style,n=>{H.S.head.style=n;refit();});sw(p,'Colour',['#1a1a1a','#ffffff',...PAL],()=>H.S.head.color,c=>{H.S.head.color=c;refit();});
    tiles(p,'Glasses',[none,{id:'sunglasses',label:'Shades',svg:ICONS.sunglasses},{id:'round',label:'Round',svg:ICONS.round},{id:'visor',label:'Visor',svg:ICONS.visor}],()=>H.S.glasses.style,n=>{H.S.glasses.style=n;refit();});
    head(p,'Fabric');const SL={Top:'top',Bottom:'bottom',Outfit:'suit',Shoes:'shoes'};let fs='top';
    chips(p,'Garment',Object.keys(SL),()=>Object.keys(SL).find(k=>SL[k]===fs),n=>{fs=SL[n];show(3,true);});
    const cfg=()=>(H.S.mat[fs]=H.S.mat[fs]||{});const mat=()=>{H.applyMaterials();save();bump();};
    chips(p,'Fabric',Object.keys(H.FABRICS),()=>cfg().fabric||'',n=>{touch();cfg().fabric=n;delete cfg().rough;mat();});
    slider(p,'Roughness',()=>cfg().rough!=null?cfg().rough:((H.FABRICS[cfg().fabric]||{}).rough??.85),v=>{touch();cfg().rough=v;mat();},0,1,null,{def:.85});
    slider(p,'Weave scale',()=>cfg().uv||1,v=>{cfg().uv=v;mat();},.25,4,null,{def:1,to:v=>Math.round(v*100)});
    head(p,'Logo or graphic');p.appendChild(el('p','note','Add a PNG, JPEG or WebP from this device. It is placed on the chest of the Top or Outfit and saved with the look.'));
    let ds=H.S.decal&&H.S.decal.slot||'top';chips(p,'Put on',['Top','Outfit'],()=>ds==='suit'?'Outfit':'Top',n=>{ds=n==='Outfit'?'suit':'top';if(H.S.decal){H.S.decal.slot=ds;mat();}});
    const f=el('input');f.type='file';f.accept='image/png,image/jpeg,image/webp';f.setAttribute('aria-label','Choose a logo image');
    f.addEventListener('change',async()=>{const file=f.files&&f.files[0];if(!file)return;try{touch();const img=await H.loadDecalFile(file);H.setDecal({slot:ds,img});save();bump();show(3,true);toast('Logo added to the '+(ds==='suit'?'outfit':'top')+'.');}catch(e){toast(e.message||String(e),4200);}f.value='';});
    p.appendChild(f);
    if(H.S.decal){const d=H.S.decal,up=()=>{H.setDecal(d);save();bump();};
      slider(p,'Across',()=>d.x,v=>{d.x=v;up();},0,1,null,{def:.5});slider(p,'Up',()=>d.y,v=>{d.y=v;up();},0,1,null,{def:.5});slider(p,'Size',()=>d.scale,v=>{d.scale=v;up();},.1,1.4,null,{def:.5});slider(p,'Rotate',()=>d.rot,v=>{d.rot=v;up();},-180,180,null,{def:0,to:v=>Math.round(v),from:x=>x,step:1});slider(p,'Opacity',()=>d.opacity,v=>{d.opacity=v;up();},.1,1,null,{def:1});
      const rm=el('button','chip','Remove logo');rm.type='button';rm.addEventListener('click',()=>{touch();H.setDecal(null);save();bump();show(3,true);});p.appendChild(rm);}
  },
  p=>{head(p,'Pose');p.appendChild(el('p','note','Each picture is the pose on this body. They refresh when the body changes.'));const groups={Standing:['A-pose','Relaxed','T-pose','Pockets','Hips','Sassy','Lean','Power','Hero','Superhero','Catwalk','Arms crossed','Shrug','Bow','Salute','Point','Reach','Hands up','Wave','Cheer','Flex','Stretch','Tree'],Moving:['Walk','Run','Sprint','Sneak','Jump','Kick','Punch','Fighter','Lunge','Dance'],Low:['Sit','Thinker','Crouch','Kneel','Cross-legged']};
    for(const [g,list] of Object.entries(groups)){const l=list.filter(n=>POSES[n]);if(l.length)tiles(p,g,l.map(n=>({id:n,label:n,live:{kind:'body',pose:n}})),()=>H.S.pose,n=>{stopAnim();H.pose(n);save();bump();});}},
  p=>{head(p,'Saved looks');
    const FAV='n0.looks',list=()=>{try{return JSON.parse(localStorage.getItem(FAV)||'[]');}catch(e){return [];}};
    const b=el('button','chip','Save this look as a favourite');b.type='button';b.addEventListener('click',()=>{const l=list();l.unshift({name:'Look '+new Date().toLocaleString(),look:structuredClone(H.S)});localStorage.setItem(FAV,JSON.stringify(l.slice(0,24)));show(5,true);toast('Saved.');});p.appendChild(b);
    list().forEach((f,k)=>{const r=el('div','row');r.append(el('span','',f.name));const ld=el('button','chip','Load');ld.type='button';ld.addEventListener('click',()=>setState(f.look));const rm=el('button','chip','Delete');rm.type='button';rm.addEventListener('click',()=>{const l=list();l.splice(k,1);localStorage.setItem(FAV,JSON.stringify(l));show(5,true);});r.append(ld,rm);p.appendChild(r);});
    head(p,'Seed');const r2=el('div','row');const sd=el('input','num');sd.type='number';sd.value=H.S.seed||1;sd.setAttribute('aria-label','Seed');const go=el('button','chip','Random from seed');go.type='button';go.addEventListener('click',()=>setState(randomState(Math.floor(+sd.value)||1)));r2.append(sd,go);p.appendChild(r2);
    head(p,'Send');p.appendChild(el('p','note','Core and FIRST LIGHT use this character if it passes the rig check. If it does not, they keep the reference character.'));
    const sc=el('button','chip','Send to Core');sc.type='button';sc.addEventListener('click',()=>{const v=H.validate();if(!v.ok){toast('This character failed the rig check: '+v.errs[0],5000);return;}try{localStorage.setItem('n0.core.character',JSON.stringify(H.exportCharacter()));toast('Sent. FIRST LIGHT will use it next time it starts.',3600);}catch(e){toast('Could not save it for Core: '+(e.message||e),4200);}});p.appendChild(sc);
    const cl=el('button','chip','Use reference in Core');cl.type='button';cl.addEventListener('click',()=>{localStorage.removeItem('n0.core.character');toast('Core will use the reference character.');});p.appendChild(cl);
    head(p,'Files');
    const ex=el('button','chip','Export .n0character');ex.type='button';ex.addEventListener('click',()=>{const o=H.exportCharacter();const u=URL.createObjectURL(new Blob([JSON.stringify(o,null,1)],{type:'application/json'})),a=el('a');a.href=u;a.download='character.n0character.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);toast('Saved the character file.');});p.appendChild(ex);
    const im=el('input');im.type='file';im.accept='.json,application/json';im.setAttribute('aria-label','Import a character file');im.addEventListener('change',async()=>{const f=im.files&&im.files[0];if(!f)return;try{touch();await H.importCharacter(JSON.parse(await f.text()));show(tab,true);save();bump();toast('Loaded '+f.name);}catch(e){toast('Could not load that file: '+(e.message||e),4200);}im.value='';});p.appendChild(im);
    const g1=el('button','chip','Export .glb (rest pose)');g1.type='button';g1.addEventListener('click',()=>dl(true));p.appendChild(g1);const g2=el('button','chip','Export .glb (current pose)');g2.type='button';g2.addEventListener('click',()=>dl(false));p.appendChild(g2);},
  p=>{head(p,'Camera');chips(p,'View',['Full','Front','Face','Profile','Back'],()=>'',n=>frame(n==='Full'?'body':n.toLowerCase()));
    const rb=el('button','chip','Neutral pose');rb.type='button';rb.addEventListener('click',()=>{stopAnim();H.pose('A-pose');bump();});p.appendChild(rb);
    const an=el('button','chip',animOn?'Stop animation':'Preview walk');an.type='button';an.addEventListener('click',()=>{animOn?stopAnim():startAnim();show(6,true);});p.appendChild(an);
    head(p,'Light');chips(p,'Preset',Object.keys(LIGHTS),()=>lightName,n=>setLight(n));
    slider(p,'Exposure',()=>renderer.toneMappingExposure,v=>{renderer.toneMappingExposure=v;bump();},.3,2.5,null,{def:1,to:v=>Math.round(v*100),from:x=>x/100});
    chips(p,'Background',['Dark','Light','Grey'],()=>bgName,n=>{bgName=n;theme();bump();});
    head(p,'Experimental');p.appendChild(el('p','note','Strand hair and cloth are experiments. They run on the CPU, reset when you change the pose or the body, and your normal hair and clothes stay as the fallback.'));
    const st=EXP.state;let lod=st.hair?st.hair.lod:'medium';
    chips(p,'Strand ponytail',['Off','On'],()=>st.hair?'On':'Off',n=>{if(n==='On'){if(!EXP.startHair(lod))toast('Could not find a scalp to grow hair from on this look.',3600);}else EXP.stopHair();show(6,true);});
    chips(p,'Hair quality',['low','medium','high'],()=>lod,n=>{lod=n;if(st.hair)EXP.startHair(lod);});
    chips(p,'Hem cloth',['Off','On'],()=>st.cloth?'On':'Off',n=>{if(n==='On'){if(!EXP.startCloth())toast('Pick a top first: the hem cloth hangs from it.',3600);}else EXP.stopCloth();show(6,true);});
    const ms=el('p','note','');const upd=()=>{ms.textContent=(st.hair||st.cloth)?'Hair '+st.stats.hairMs.toFixed(1)+' ms, cloth '+st.stats.clothMs.toFixed(1)+' ms per frame, '+st.stats.strands+' strands, '+st.stats.simPoints+' cloth points.':'Off.';};upd();p.appendChild(ms);if(st.hair||st.cloth){clearInterval(show._ms);show._ms=setInterval(()=>{if(!ms.isConnected){clearInterval(show._ms);return;}upd();},500);}
    head(p,'Render');chips(p,'Mode',['Preview'],()=>'Preview',()=>{});p.appendChild(el('p','note','Preview is the real-time renderer. The progressive path tracer is a research item and is not enabled in this build.'));
  }
];
function show(i,keep){tab=(i+TN.length)%TN.length;try{localStorage.setItem('n0.figtab',tab);}catch(e){}
  $('#ftabs').querySelectorAll('.tab').forEach((b,j)=>b.setAttribute('aria-selected',String(j===tab)));const y=keep?PANEL.scrollTop:0;PANEL.innerHTML='';TABS[tab](PANEL);PANEL.scrollTop=y;
  if(H&&!keep)frame(tab===1?'face':tab===2?'head':'body');}
TN.forEach((n,i)=>{const b=el('button','tab',n);b.type='button';b.setAttribute('role','tab');b.addEventListener('click',()=>show(i));$('#ftabs').appendChild(b);});

/* ---- presets and seeded randomise ---- */
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
function randomState(seed){
  const r=mulberry(seed),pick=a=>a[Math.floor(r()*a.length)],S=structuredClone(DEFAULT);
  S.seed=seed;S.base=r()<.5?'male':'female';S.gender=S.base==='male'?1:0;S.stature=Math.round((S.base==='male'?162+r()*26:150+r()*24)*10)/10;S.statureUser=true;S.age=.32+r()*.42;S.muscle=r();S.weight=.25+r()*.5;S.height=r();S.prop=.3+r()*.6;
  const rr=[r(),r(),r()],s=rr[0]+rr[1]+rr[2];S.race={african:rr[0]/s,asian:rr[1]/s,caucasian:rr[2]/s};
  const ids=H.man.detail.filter(d=>/^(head|forehead|eyes|nose|mouth|chin|cheek|ears|neck|torso|hip)$/.test(d.group)&&!/trans|corner|rot|flap|wing|shape/.test(d.id)).map(d=>d.id);
  for(let i=0;i<10;i++){const id=pick(ids),d=H.man.detail.find(x=>x.id===id);S.detail[id]=(d.bi?(r()*2-1):r())*.55;}
  S.skin=pick(SKIN);S.eye=pick(EYE);const hc=pick(['#ffffff',...HAIRC]);S.hair={style:pick(H.lib.hair.map(x=>x.id)),color:hc};S.brows={style:pick(H.lib.eyebrows.map(x=>x.id)),color:hc};S.suit={style:r()<.6?pick(H.lib.clothes.map(x=>x.id).filter(SUITS)):'none',color:'#ffffff'};S.top={style:pick(STYLE.top.slice(1)),color:pick(PAL)};S.bottom={style:pick(STYLE.bottom.slice(1)),color:pick(PAL)};S.shoes={style:r()<.5?'sneaker':pick(H.lib.clothes.map(x=>x.id).filter(x=>/^shoes/.test(x))),color:'#ffffff'};S.head={style:pick(['none','none','balaclava','beanie','mask','headband']),color:pick(['#1a1a1a','#ffffff',...PAL])};S.glasses={style:pick(['none','none','sunglasses','round','visor']),color:'#111111'};S.pose=pick(['A-pose','Power','Catwalk','Pockets','Lean','Hero']);
  return S;
}
const PRESETS={
  Athlete:{base:'male',gender:1,statureUser:false,stature:171,age:.42,muscle:.9,weight:.45,height:.65,prop:.8,hair:{style:'short02',color:'#ffffff'},top:{style:'tank',color:'#2563eb'},bottom:{style:'shorts',color:'#111111'},pose:'Flex'},
  Elder:{base:'male',gender:1,statureUser:false,stature:171,age:.92,muscle:.2,weight:.6,height:.35,prop:.4,hair:{style:'short04',color:'#c8c8c8'},suit:{style:'male_elegantsuit01',color:'#ffffff'},pose:'Pockets'},
  Teen:{base:'male',gender:1,statureUser:false,stature:null,age:.27,muscle:.35,weight:.4,height:.4,prop:.55,hair:{style:'ponytail01',color:'#ffffff'},top:{style:'tee',color:'#d946ef'},bottom:{style:'shorts',color:'#334155'},pose:'Cheer'},
  Runner:{base:'female',gender:0,statureUser:false,stature:159,age:.45,muscle:.6,weight:.3,height:.7,prop:.85,hair:{style:'braid01',color:'#ffffff'},top:{style:'tank',color:'#c2410c'},bottom:{style:'shorts',color:'#111111'},pose:'Run'}
};
async function setState(S){touch();H.load(S);await H.apply();await H.outfit();H.pose(H.S.pose);H.expr();show(tab,true);save();bump();}
$('#frand').addEventListener('click',()=>setState(randomState(Math.floor(Math.random()*1e9))));
$('#fpre').addEventListener('click',()=>{const k=Object.keys(PRESETS),i=(+($('#fpre').dataset.i||0))%k.length;$('#fpre').dataset.i=i+1;toast('Preset: '+k[i],1200);setState({...structuredClone(DEFAULT),...structuredClone(PRESETS[k[i]])});});
$('#freset').addEventListener('click',()=>setState(structuredClone(DEFAULT)));
$('#fundo').addEventListener('click',undo);$('#fredo').addEventListener('click',redo);
$('#ftheme').addEventListener('click',()=>{bgName=bgName==='Light'?'Dark':'Light';theme();bump();});
$('#fface').addEventListener('click',()=>frame(cam&&cam.d<1.3?'body':'face'));
addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}});

/* ---- export ---- */
/* export: the rig is rebuilt from the rest pose by default (neutral, with baked morphology); a posed portrait is an explicit choice */
async function glb(neutral=true){const keep=H.S.pose,was=animOn;stopAnim();if(neutral)H.pose('A-pose');const ex=new GLTFExporter();H.root.updateMatrixWorld(true);
  try{return await new Promise((ok,no)=>ex.parse(H.root,ok,no,{binary:true,onlyVisible:true,maxTextureSize:1024}));}finally{if(neutral){H.pose(keep);}if(was)startAnim();}}
async function dl(neutral){try{const b=await glb(neutral),u=URL.createObjectURL(new Blob([b],{type:'model/gltf-binary'})),a=el('a');a.href=u;a.download='character.glb';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);toast('Saved character.glb ('+(b.byteLength/1048576).toFixed(1)+' MB, '+(neutral?'rest pose':'current pose')+').',3600);}catch(e){toast('Could not export: '+(e.message||e),4200);}}
/* animation preview: a short walk cycle driven through the same rest-world-axis convention FIRST LIGHT uses */
let animOn=false,animT=0,animLast=0;
function startAnim(){animOn=true;animLast=performance.now();}
function stopAnim(){if(!animOn)return;animOn=false;H.pose(H.S.pose);bump();}
function expTick(now){if(!EXP)return;const dt=Math.min(.05,(now-expLast)/1000||0);expLast=now;EXP.tick(dt);}
function animTick(now){expTick(now);if(!animOn||!H)return;const dt=Math.min(.05,(now-animLast)/1000);animLast=now;animT+=dt*6;for(const [i,sd] of ['L','R'].entries()){const f=Math.sin(animT+i*Math.PI);
  H.setBoneEuler('upperleg01.'+sd,f*.5,0,0);H.setBoneEuler('lowerleg01.'+sd,Math.max(0,-f)*.7,0,0);H.setBoneEuler('upperarm01.'+sd,-f*.45,0,sd==='L'?-.35:.35);H.setBoneEuler('lowerarm01.'+sd,-.3,0,0);}
  H.setBoneEuler('spine03',.04,Math.cos(animT)*.07,0);H.root.updateMatrixWorld(true);bump();}
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
  H=await createHuman({THREE,onTex:bump});
  try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s){H.load(s);await H.apply();await H.outfit();H.pose(H.S.pose);H.expr();}}catch(e){}
  scene.add(H.root);EXP=createExperimental({THREE,H,scene,bump,camera});window.__exp=EXP;show(tab);size();frame('body');
  loading.hidden=true;window.__hum=H;window.__tools={POSES,renderThumb};window.__r={renderer,scene,camera,controls};
}catch(e){console.error(e);loading.textContent='Couldn’t load the character data: '+(e.message||e)+'. Check your connection and reload.';}
initPen({canvas,toast});
window.__gp=createGamepad({THREE,camera,controls,S:{},toast,sheet:null,bump,canvas,cycle:d=>{if(!H)return;const k=Object.keys(POSES),i=(k.indexOf(H.S.pose)+d+k.length)%k.length;H.pose(k[i]);toast(k[i],900);bump();if(tab===4)show(4,true);},vert:()=>false});
(function loop(now){requestAnimationFrame(loop);animTick(now);stepCam();controls.update();if(dirty>0){renderer.render(scene,camera);dirty--;}})();
