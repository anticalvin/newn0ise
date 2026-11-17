/* Material tab for 3D: a live preview, quick materials, evolving variations, CC0 PBR textures and HDRIs from Poly Haven,
   and physical-material layers (clear coat, sheen, glass, iridescence, anisotropy). Everything is three.js MeshPhysicalMaterial.
   Poly Haven assets are CC0 (https://polyhaven.com/license). Nothing is bundled: they load from their CDN on demand. */
import {buildMaps,texturesFor,fillMaterial} from './nodemat.js';
import {createPainter} from './matpaint.js';

const API='https://api.polyhaven.com';
const J=new Map();
const getJSON=async u=>{if(!J.has(u))J.set(u,fetch(u).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).catch(e=>{J.delete(u);throw e;}));return J.get(u);};
const thumb=(id,w=200,h=200)=>'https://cdn.polyhaven.com/asset_img/thumbs/'+id+'.png?width='+w+'&height='+h;
const loadImg=u=>new Promise((ok,no)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>no(new Error('image'));i.src=u;});
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export const PB={cc:0,ccr:.15,sh:0,shc:'#ffffff',shr:.5,tr:0,th:1,ior:1.5,iri:0,iriI:1.3,an:0,spi:1,atc:'#ffffff',atd:0,em:0,emc:'#ffffff',col:null,met:null,rou:null,opa:1};
const norm=p=>({...PB,...(p||{})});
export const RECIPES=[
  ['Glass',{tr:1,rou:0,met:0,th:1.2,col:'#ffffff'}],['Frosted',{tr:1,rou:.42,met:0,th:1,col:'#ffffff'}],['Ice',{tr:1,rou:.22,ior:1.31,th:2,col:'#d6f1ff',met:0}],['Bubble',{tr:1,rou:0,iri:1,iriI:1.3,th:.4,ior:1.05,col:'#ffffff',met:0}],
  ['Car paint',{col:'#b3121b',met:.6,rou:.35,cc:1,ccr:.03}],['Candy',{col:'#ff3d7f',met:0,rou:.18,cc:1,ccr:.05}],['Pearl',{col:'#f2ece4',met:0,rou:.3,iri:1,iriI:1.6,cc:.6}],['Velvet',{col:'#5a1030',met:0,rou:.95,sh:1,shc:'#ff9ac0',shr:.35}],
  ['Gold',{col:'#ffc34d',met:1,rou:.22}],['Brushed steel',{col:'#c9ccd1',met:1,rou:.38,an:1}],['Copper',{col:'#d17a4f',met:1,rou:.28}],['Obsidian',{col:'#08080a',met:.1,rou:.05,cc:1,ccr:.02}],['Rubber',{col:'#232323',met:0,rou:.85}],['Neon tube',{col:'#111111',met:0,rou:.3,em:2.2,emc:'#9bf6ff'}]
];
const SHAPES=['Ball','Cube','Knot','Torus','Plane'];

/* put the physical values onto one material */
export function physProps(THREE,m,P){
  if(!m||!m.isMeshPhysicalMaterial)return;
  m.clearcoat=P.cc;m.clearcoatRoughness=P.ccr;m.sheen=P.sh;m.sheenColor.set(P.shc);m.sheenRoughness=P.shr;
  m.transmission=P.tr;m.thickness=P.th;m.ior=P.ior;m.iridescence=P.iri;m.iridescenceIOR=P.iriI;m.anisotropy=P.an;
  m.specularIntensity=P.spi;m.attenuationColor.set(P.atc);m.attenuationDistance=P.atd>0?P.atd:Infinity;
  if(P.em>0){m.emissive.set(P.emc);m.emissiveIntensity=P.em;}else if(m.userData.pbOrig){m.emissive.copy(m.userData.pbOrig.emissive);m.emissiveIntensity=m.userData.pbOrig.emissiveIntensity;}
  if(P.col!=null)m.color.set(P.col);if(P.met!=null)m.metalness=P.met;if(P.rou!=null)m.roughness=P.rou;
  if(P.opa<1){m.transparent=true;m.opacity=P.opa;}else if(m.opacity<1&&!m.userData.pbOrig?.transparent){m.opacity=1;m.transparent=!!(m.userData.pbOrig&&m.userData.pbOrig.transparent);}
  m.needsUpdate=true;
}

export function createMatStudio(c){
  const {THREE,RoomEnvironment,el,btn,sliderRow,chipRow,sec,toast,objById,S,bump,MAT,SURF,ngApply,ngClear,openGraph,setEnvHdr,pane,dom,camera,controls,LGT,renderScene,createBall,fxOpen,gotoTab,peek,openLook}=c;
  const meshes=o=>{const out=[];if(!o||!o.holder)return out;o.holder.traverse(n=>{if(n.isMesh&&!n.isSplatMesh&&n.geometry&&n.material&&!(n.userData&&n.userData.noView))out.push(n);});return out;};
  const cur=()=>objById(S.sel!=null?S.sel:S.fxTarget);
  const surfaceOk=o=>o&&o.kind!=='viz'&&o.kind!=='splat';

  const PNT=createPainter({THREE,dom,camera,controls,meshesOf:meshes,prepare:o=>{if(!surfaceOk(o)){toast('This kind of object has no surface to paint.');return false;}upgrade(o);return true;},toast,S,bump,getObj:cur,onChange:()=>{}});
  /* ---- turn the object's standard materials into physical ones (same look, more features) ---- */
  function upgrade(o){
    let changed=false;
    const had={mat:clone(o.mat),surf:o.surf?{...o.surf}:null,ng:clone(o.nmat)};
    const todo=[];
    meshes(o).forEach(n=>{(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(m.isMeshStandardMaterial&&!m.isMeshPhysicalMaterial)todo.push(n);});});
    if(!todo.length)return false;
    if(o.nmat)ngClear(o);
    const swap=(n,m)=>{
      if(!m.isMeshStandardMaterial||m.isMeshPhysicalMaterial)return m;
      const ud=m.userData;m.userData={};const p=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(p,m);m.userData=ud;
      p.userData={pbOrig:{color:p.color.clone(),metalness:p.metalness,roughness:p.roughness,emissive:p.emissive.clone(),emissiveIntensity:p.emissiveIntensity,transparent:p.transparent}};
      return p;};
    new Set(todo).forEach(n=>{
      const list=Array.isArray(n.material)?n.material:[n.material];const next=list.map(m=>swap(n,m));
      const sh=n.material===(Array.isArray(n.material)?n.material:list[0]);
      const was=n.material,wasU=n.userData._mat;
      n.material=Array.isArray(was)?next:next[0];
      if(wasU!=null){n.userData._mat=Array.isArray(wasU)?next:(wasU===list[0]?next[0]:wasU);}
      list.forEach((m,i)=>{if(m!==next[i])m.dispose();});
      changed=true;
    });
    if(changed){
      o.matU=null;o.matMats=null;o.surfU=null;
      if(had.mat)MAT.set(o,had.mat);if(had.surf)SURF.set(o,had.surf);if(had.ng)ngApply(o,had.ng);
    }
    return changed;
  }
  const phys=o=>{const out=[];meshes(o).forEach(n=>{(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(m.isMeshPhysicalMaterial)out.push(m);});});return out;};

  function setPbr(o,patch){
    if(!surfaceOk(o))return;
    upgrade(o);o.pbr=norm({...o.pbr,...patch});
    phys(o).forEach(m=>physProps(THREE,m,o.pbr));S.needFrame=true;
  }
  function clearPbr(o){
    if(!o||!o.pbr)return;delete o.pbr;
    phys(o).forEach(m=>{const k=m.userData.pbOrig;physProps(THREE,m,norm());if(k){m.color.copy(k.color);m.metalness=k.metalness;m.roughness=k.roughness;}m.needsUpdate=true;});S.needFrame=true;
  }

  /* ---- Poly Haven texture sets ---- */
  const TEXC=new Map();
  async function texSet(id,res){
    const key=id+'@'+res;if(TEXC.has(key))return TEXC.get(key);
    const p=(async()=>{
      const f=await getJSON(API+'/files/'+id),url=k=>{const r=f[k]&&f[k][res];return r&&(r.jpg||r.png)?(r.jpg||r.png).url:null;};
      const want=[['map',url('Diffuse'),true],['normalMap',url('nor_gl'),false],['roughnessMap',url('Rough'),false],['metalnessMap',url('Metal'),false]].filter(x=>x[1]);
      if(!want.length)throw new Error('no maps');
      const out={};
      await Promise.all(want.map(async([k,u,srgb])=>{const im=await loadImg(u);const t=new THREE.Texture(im);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;out[k]=t;}));
      return out;})();
    TEXC.set(key,p);p.catch(()=>TEXC.delete(key));return p;
  }
  const TK=['map','normalMap','roughnessMap','metalnessMap'];
  function dress(m,T,spec){
    if(!m.userData.ptOrig)m.userData.ptOrig={color:m.color.clone(),roughness:m.roughness,metalness:m.metalness,maps:Object.fromEntries(['map','normalMap','roughnessMap','metalnessMap','bumpMap'].map(k=>[k,m[k]]))};
    TK.forEach(k=>{const b=T[k];if(!b){m[k]=null;return;}const t=b.clone();t.needsUpdate=true;t.repeat.set(spec.rep,spec.rep);t.colorSpace=b.colorSpace;m[k]=t;});
    m.bumpMap=null;m.color.set(spec.tint||'#ffffff');m.roughness=T.roughnessMap?clamp(spec.rk,0,2):m.roughness;m.metalness=T.metalnessMap?1:(m.metalness||0);
    if(m.normalScale)m.normalScale.set(spec.nk,spec.nk);m.needsUpdate=true;
  }
  let tkn=0;
  async function applyTex(o,spec){
    if(!surfaceOk(o))return false;
    const my=++tkn;spec={id:spec.id,name:spec.name||spec.id,author:spec.author||'',res:spec.res||'1k',rep:spec.rep||1,nk:spec.nk==null?1:spec.nk,rk:spec.rk==null?1:spec.rk,tint:spec.tint||'#ffffff'};
    let T;try{T=await texSet(spec.id,spec.res);}catch(e){toast('Couldn’t load that material. Check the connection and try again.',4000);return false;}
    if(my!==tkn)return false;
    if(o.nmat)ngClear(o);upgrade(o);
    let n=0,skip=0;meshes(o).forEach(me=>{if(!me.geometry.attributes.uv){skip++;return;}(Array.isArray(me.material)?me.material:[me.material]).forEach(m=>{if(m.isMeshPhysicalMaterial){dress(m,T,spec);n++;}});});
    o.ptex=spec;if(o.pbr)phys(o).forEach(m=>physProps(THREE,m,o.pbr));S.needFrame=true;
    if(!n)toast('This object has no UV map, so a texture can’t be wrapped on it. Try a built-in shape.',5000);
    return n>0;
  }
  function retile(o){const s=o.ptex;if(!s)return;let n=0;phys(o).forEach(m=>{TK.forEach(k=>{if(m[k]){m[k].repeat.set(s.rep,s.rep);}});if(m.normalScale)m.normalScale.set(s.nk,s.nk);if(m.userData.ptOrig&&m.roughnessMap)m.roughness=clamp(s.rk,0,2);m.color.set(s.tint||'#ffffff');n++;});S.needFrame=true;}
  function clearTex(o){
    if(!o||!o.ptex)return;++tkn;
    phys(o).forEach(m=>{const k=m.userData.ptOrig;if(!k)return;TK.concat(['bumpMap']).forEach(a=>{if(m[a]&&m[a].dispose)m[a].dispose();m[a]=k.maps[a]||null;});m.color.copy(k.color);m.roughness=k.roughness;m.metalness=k.metalness;delete m.userData.ptOrig;m.needsUpdate=true;});
    delete o.ptex;S.needFrame=true;
  }

  /* ---- environments ---- */
  let hdrId=null,hdrBusy=0;
  async function useHdri(id,pv){
    const my=++hdrBusy;
    try{
      const f=await getJSON(API+'/files/'+id),r=f.hdri&&(f.hdri['1k']||f.hdri['2k']),u=r&&r.hdr&&r.hdr.url;if(!u)throw new Error('none');
      const {RGBELoader}=await import('three/addons/loaders/RGBELoader.js');
      const t=await new RGBELoader().loadAsync(u);if(my!==hdrBusy)return;
      t.mapping=THREE.EquirectangularReflectionMapping;hdrId=id;setEnvHdr(t);pv&&pv.setEnv(t);S.hdri=id;
    }catch(e){toast('Couldn’t load that environment. Check the connection and try again.',4000);}
  }
  function studioEnv(pv){hdrId=null;++hdrBusy;setEnvHdr(null);pv&&pv.setEnv(null);S.hdri=null;}

  /* ---- preview ---- */
  function makePreview(){
    const cv=document.createElement('canvas');cv.className='msprev';cv.style.cssText='width:100%;height:100%;display:block;touch-action:none;border-radius:inherit';
    let rn=null;try{rn=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});}catch(e){}
    if(!rn)return {el:cv,setObj(){},setEnv(){},shape(){},dirty(){},live(){return false;}};
    rn.setPixelRatio(Math.min(2,window.devicePixelRatio||1));rn.outputColorSpace=THREE.SRGBColorSpace;rn.toneMapping=THREE.ACESFilmicToneMapping;
    const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(32,1,.1,50);cam.position.set(0,0,4.6);
    const dl=new THREE.DirectionalLight(0xffffff,1.1);dl.position.set(2,3,3);sc.add(dl);
    const pm=new THREE.PMREMGenerator(rn);let envT=pm.fromScene(new RoomEnvironment(),.04).texture;sc.environment=envT;
    const G={Ball:new THREE.SphereGeometry(1.15,64,48),Cube:new THREE.BoxGeometry(1.7,1.7,1.7,1,1,1),Knot:new THREE.TorusKnotGeometry(.8,.3,200,32),Torus:new THREE.TorusGeometry(.9,.4,32,72),Plane:new THREE.PlaneGeometry(2.4,2.4)};
    const mat=new THREE.MeshPhysicalMaterial({color:0xcccccc,roughness:.4});
    const mesh=new THREE.Mesh(G.Ball,mat);sc.add(mesh);
    let ry=.5,rx=.15,drag=false,lx=0,ly=0,auto=true,dirty=true,ng=null,ngKey='',tex=null;
    let PT=null,ptOn=false,pcam=null,ptLib=null,ptDirty=false,hdr=null,ptEnv=null,blur=0,cap=160,snapNow=false;const state={samples:0};
    const orbit=()=>{const d=4.6,cx=Math.cos(rx);pcam.position.set(Math.sin(ry)*cx*d,Math.sin(rx)*d,Math.cos(ry)*cx*d);pcam.lookAt(0,0,0);pcam.updateMatrixWorld();};
    const setDof=()=>{if(!pcam)return;pcam.focusDistance=4.6;pcam.fStop=16-blur*14.6;pcam.apertureBlades=0;};
    cv.addEventListener('pointerdown',e=>{drag=true;lx=e.clientX;ly=e.clientY;auto=false;try{cv.setPointerCapture(e.pointerId);}catch(_){}});
    cv.addEventListener('pointermove',e=>{if(!drag)return;ry+=(e.clientX-lx)*.012;rx=clamp(rx+(e.clientY-ly)*.012,-1.2,1.2);lx=e.clientX;ly=e.clientY;dirty=true;if(ptOn&&PT){orbit();PT.updateCamera();}});
    cv.addEventListener('pointerup',()=>{drag=false;});cv.addEventListener('pointercancel',()=>{drag=false;});
    cv.addEventListener('dblclick',()=>{auto=!auto;});
    let o=null,tmat=null;
    const api={el:cv,
      state,
      shape(k){mesh.geometry=G[k]||G.Ball;if(k==='Plane'){rx=-.35;}dirty=true;ptDirty=true;},
      setEnv(t){hdr=t||null;if(ptOn&&PT){ptEnv=hdr||ptEnv;sc.environment=hdr||ptEnv;ptDirty=true;}try{const nt=t?pm.fromEquirectangular(t).texture:pm.fromScene(new RoomEnvironment(),.04).texture;if(envT&&envT.dispose)envT.dispose();envT=nt;if(!(ptOn&&PT))sc.environment=nt;dirty=true;}catch(e){}},
      setObj(ob){o=ob;api.sync();},
      dirty(){dirty=true;},
      sync(){
        const P=norm(o&&o.pbr),m=mat;
        m.map=m.roughnessMap=m.metalnessMap=m.normalMap=m.emissiveMap=m.alphaMap=null;m.color.set('#d8d8d8');m.roughness=.4;m.metalness=0;m.transparent=false;m.opacity=1;m.emissive.set('#000');m.emissiveIntensity=1;if(m.normalScale)m.normalScale.set(1,1);
        if(o&&o.nmat){const k=JSON.stringify(o.nmat);if(k!==ngKey){ngKey=k;try{const maps=buildMaps(o.nmat,256);ng=texturesFor(THREE,maps,ng);ng._maps=maps;}catch(e){ng=null;}}if(ng&&ng._maps)fillMaterial(THREE,m,ng,ng._maps);}
        else if(o&&o.ptex){const s=o.ptex;if(!(tex&&tex.s===s))texSet(s.id,s.res).then(T=>{if(o&&o.ptex===s){tex={T,s};api.sync();}}).catch(()=>{});if(tex&&tex.s===s){TK.forEach(k=>{const b=tex.T[k];if(!b){return;}if(m[k]&&m[k]!==b&&m[k].dispose)m[k].dispose();const t=b.clone();t.needsUpdate=true;t.repeat.set(s.rep,s.rep);t.colorSpace=b.colorSpace;m[k]=t;});m.color.set(s.tint||'#fff');m.roughness=tex.T.roughnessMap?clamp(s.rk,0,2):.5;m.metalness=tex.T.metalnessMap?1:0;if(m.normalScale)m.normalScale.set(s.nk,s.nk);}}
        const keep={...P};m.userData.pbOrig=m.userData.pbOrig||{emissive:new THREE.Color(0),emissiveIntensity:1,transparent:false};
        physProps(THREE,m,keep);m.needsUpdate=true;dirty=true;ptDirty=true;
      },
      async setPT(on){
        if(!on){ptOn=false;if(PT){try{PT.dispose();}catch(e){}PT=null;}sc.environment=envT;sc.background=null;mesh.rotation.set(rx,ry,0);dirty=true;state.samples=0;return true;}
        try{
          ptLib=ptLib||await import('three-gpu-pathtracer');
          pcam=new ptLib.PhysicalCamera(32,(cv.clientWidth||300)/(cv.clientHeight||170),.1,50);setDof();
          PT=new ptLib.WebGLPathTracer(rn);PT.bounces=6;PT.filterGlossyFactor=.4;PT.tiles.set(2,2);
          if(!ptEnv){const g=new ptLib.GradientEquirectTexture();g.topColor.set('#e8edf5');g.bottomColor.set('#1a1b20');g.update();ptEnv=g;}
          sc.environment=hdr||ptEnv;sc.background=new THREE.Color('#101114');mesh.rotation.set(0,0,0);auto=false;orbit();ptOn=true;ptDirty=true;state.samples=0;return true;
        }catch(e){console.warn('path tracer',e);ptOn=false;PT=null;return false;}
      },
      pt:()=>ptOn,
      blur(v){blur=v;setDof();ptDirty=true;},
      cap(v){cap=v;},
      snap(){snapNow=true;},
      live(){return cv.offsetParent!==null;}};
    let last=0;
    const loop=t=>{requestAnimationFrame(loop);if(!api.live())return;if(t-last<33)return;last=t;
      if(ptOn&&PT){
        const w2=cv.clientWidth,h2=cv.clientHeight;if(w2&&h2&&(cv._w!==w2||cv._h!==h2)){cv._w=w2;cv._h=h2;rn.setSize(w2,h2,false);pcam.aspect=w2/h2;pcam.updateProjectionMatrix();ptDirty=true;}
        if(ptDirty){orbit();PT.setScene(sc,pcam);ptDirty=false;}
        if(PT.samples<cap)PT.renderSample();state.samples=Math.floor(PT.samples);
        if(snapNow){snapNow=false;cv.toBlob(b=>{if(!b)return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='material-render.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);});}
        return;}
      if(auto&&!drag){ry+=.012;dirty=true;}
      const w=cv.clientWidth,h=cv.clientHeight;if(w&&h&&(cv._w!==w||cv._h!==h)){cv._w=w;cv._h=h;rn.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();dirty=true;}
      if(!dirty)return;dirty=false;mesh.rotation.set(rx,ry,0);rn.render(sc,cam);};
    requestAnimationFrame(loop);
    return api;
  }

  /* ---- variation tiles: one small renderer, drawn into 2D canvases, then released ---- */
  function renderTiles(list,tiles){
    let rn;try{rn=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}catch(e){return;}
    const px=112;rn.setPixelRatio(1);rn.setSize(px,px,false);rn.outputColorSpace=THREE.SRGBColorSpace;rn.toneMapping=THREE.ACESFilmicToneMapping;
    const pm=new THREE.PMREMGenerator(rn),sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(32,1,.1,20);cam.position.set(0,0,4.2);
    sc.environment=pm.fromScene(new RoomEnvironment(),.04).texture;const dl=new THREE.DirectionalLight(0xffffff,1.1);dl.position.set(2,3,3);sc.add(dl);
    const m=new THREE.MeshPhysicalMaterial(),me=new THREE.Mesh(new THREE.SphereGeometry(1.15,48,36),m);sc.add(me);me.rotation.set(.2,.6,0);
    list.forEach((P,i)=>{m.color.set(P.col||'#d8d8d8');m.roughness=P.rou==null?.4:P.rou;m.metalness=P.met==null?0:P.met;m.userData.pbOrig={emissive:new THREE.Color(0),emissiveIntensity:1,transparent:false};physProps(THREE,m,norm(P));if(P.col==null)m.color.set('#d8d8d8');if(P.rou==null)m.roughness=.4;if(P.met==null)m.metalness=0;
      rn.render(sc,cam);const t=tiles[i];if(t){const g=t.getContext('2d');g.clearRect(0,0,t.width,t.height);g.drawImage(rn.domElement,0,0,t.width,t.height);}});
    m.dispose();me.geometry.dispose();rn.dispose();try{rn.forceContextLoss();}catch(e){}
  }
  const hueShift=(hex,dh,ds,dl)=>{const c=new THREE.Color(hex||'#d8d8d8');c.offsetHSL(dh,ds,dl);return '#'+c.getHexString();};
  function evolve(P,k){
    const q={...norm(P)};const j=(v,a=0,b=1,s=.3)=>clamp(v+rnd(-s,s)*k,a,b);
    q.col=hueShift(q.col,rnd(-.12,.12)*k*2,rnd(-.15,.15)*k,rnd(-.1,.1)*k);
    q.rou=j(q.rou==null?.4:q.rou);q.met=j(q.met==null?0:q.met);q.cc=j(q.cc);q.sh=j(q.sh);q.iri=j(q.iri,0,1,.2);q.tr=clamp(q.tr+(q.tr>.2?rnd(-.1,.1)*k:0),0,1);q.an=j(q.an,0,1,.2);
    return q;
  }
  function surprise(){
    const [,r]=RECIPES[Math.floor(Math.random()*RECIPES.length)];const q=norm(r);
    q.col=hueShift(q.col||'#d8d8d8',rnd(-.5,.5),rnd(-.1,.2),rnd(-.1,.1));if(Math.random()<.25)q.cc=Math.random();if(Math.random()<.2)q.iri=Math.random();q.rou=clamp((q.rou==null?.4:q.rou)+rnd(-.15,.15),0,1);
    return q;
  }

  /* ---- the tab ---- */
  const CSS=`.ms-stk{position:sticky;top:0;z-index:3;background:var(--panel,#16171b);padding:0 0 6px;margin:-2px -2px 6px}
.ms-nav{display:flex;gap:6px;overflow-x:auto;padding:6px 2px 0;scrollbar-width:none}.ms-nav::-webkit-scrollbar{display:none}
.ms-nav button{flex:none;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--raise);color:inherit;font:700 11px var(--lab,monospace);letter-spacing:.06em;text-transform:uppercase}
.ms-nav button.hot{background:var(--accent);border-color:var(--accent);color:#111}
.ms-pt{position:absolute;right:8px;top:8px;display:flex;gap:6px;align-items:center}.ms-pt span{font:600 10px var(--lab,monospace);color:#c9cbd2;background:rgba(10,10,12,.55);padding:4px 8px;border-radius:999px}
.ms-pt button{min-height:32px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(10,10,12,.55);color:#e8e9ed;font:700 11px var(--lab,monospace);backdrop-filter:blur(8px)}.ms-pt button[aria-pressed=true]{background:#fff;color:#111}
.ms-prev{position:relative;height:150px;margin:0;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 50% 40%,#2b2d33,#0d0d10);border:1px solid var(--line)}
.ms-prev .ms-shp{position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:4px;flex-wrap:wrap}
.ms-prev .ms-shp button{min-height:30px;padding:0 10px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(10,10,12,.55);color:#e8e9ed;font:600 11px var(--lab,monospace);backdrop-filter:blur(8px)}
.ms-prev .ms-shp button[aria-pressed=true]{background:#fff;color:#111}
.ms-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0}
.ms-tiles button{padding:0;border:1px solid var(--line);background:#0d0d10;border-radius:14px;overflow:hidden;aspect-ratio:1;min-height:44px}
.ms-tiles canvas{width:100%;height:100%;display:block}
.ms-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}
.ms-grid button{padding:0;border:1px solid var(--line);background:var(--raise);border-radius:14px;overflow:hidden;color:inherit;text-align:left;min-height:44px}
.ms-grid button[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.ms-grid img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#15161a}
.ms-grid span{display:block;padding:4px 6px 6px;font:600 10px var(--lab,monospace);letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ms-q{width:100%;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:inherit;font:inherit;box-sizing:border-box}
.ms-col{display:flex;align-items:center;justify-content:space-between;min-height:44px;gap:10px;font:600 11px var(--lab,monospace);color:var(--mute)}
.ms-col input{width:56px;height:36px;border:1px solid var(--line);background:none;border-radius:8px;padding:0}
.ms-cr{font-size:10.5px;color:var(--mute);margin-top:6px}`;
  let SB=null,pv=null,shown=null,shape='Ball',lastKey='',pvLabel=null;
  setInterval(()=>{if(pv&&pvLabel&&pv.pt()&&!pane.hidden)pvLabel.textContent=pv.state.samples+' samples';},400);
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  const colorRow=(parent,label,get,set)=>{const r=el('label','ms-col');r.append(label);const i=document.createElement('input');i.type='color';i.value=get();i.addEventListener('input',()=>set(i.value));r.appendChild(i);parent.appendChild(r);};
  let polyTex=null,polyHdr=null;
  const listOf=async t=>{const j=await getJSON(API+'/assets?t='+t);return Object.entries(j).map(([id,v])=>({id,name:v.name,cats:v.categories||[],tags:v.tags||[],au:Object.keys(v.authors||{}).join(', ')}));};
  function library(parent,kind,onPick,isOn){
    const box=el('div'),q=document.createElement('input');q.className='ms-q';q.type='search';q.placeholder=kind==='textures'?'Search materials: wood, brick, metal…':'Search environments: studio, sunset, forest…';q.setAttribute('aria-label','Search');
    const cats=el('div','chips'),grid=el('div','ms-grid'),more=btn('More','',()=>{shownN+=18;draw();}),msg=el('div','note','Loading the library…');
    let all=[],cat='',shownN=18;
    const draw=()=>{
      const t=q.value.trim().toLowerCase();let l=all.filter(x=>(!cat||x.cats.includes(cat))&&(!t||x.name.toLowerCase().includes(t)||x.tags.some(g=>g.includes(t))||x.cats.some(g=>g.includes(t))));
      grid.innerHTML='';l.slice(0,shownN).forEach(x=>{const b=el('button');b.setAttribute('aria-pressed',!!isOn(x.id));b.title=x.name+' · '+x.au;const im=document.createElement('img');im.loading='lazy';im.alt='';im.src=thumb(x.id);b.appendChild(im);b.appendChild(el('span','',x.name));b.addEventListener('click',()=>onPick(x,b));grid.appendChild(b);});
      more.hidden=l.length<=shownN;msg.hidden=l.length>0;msg.textContent=all.length?'Nothing matches that.':'Loading the library…';
    };
    q.addEventListener('input',()=>{shownN=18;draw();});
    box.append(q,cats,msg,grid,more);parent.appendChild(box);
    listOf(kind).then(a=>{all=a;const cnt={};a.forEach(x=>x.cats.forEach(c=>cnt[c]=(cnt[c]||0)+1));const top=Object.entries(cnt).sort((x,y)=>y[1]-x[1]).slice(0,9).map(e=>e[0]);
      [['','All'],...top.map(c=>[c,c[0].toUpperCase()+c.slice(1)])].forEach(([v,l])=>{const b=el('button','chip',l);b.setAttribute('aria-pressed',v===cat);b.addEventListener('click',()=>{cat=v;shownN=18;[...cats.children].forEach(x=>x.setAttribute('aria-pressed',x===b));draw();});cats.appendChild(b);});draw();})
      .catch(()=>{msg.hidden=false;msg.textContent='Couldn’t reach the library. It needs a connection; everything else still works.';});
    return box;
  }

  function build(){
    pane.innerHTML='';
    const o=cur();shown=o?o.id:null;
    const stk=el('div','ms-stk'),pw=el('div','ms-prev');stk.appendChild(pw);
    if(!pv)pv=makePreview();pw.appendChild(pv.el);
    const sh=el('div','ms-shp');SHAPES.forEach(k=>{const b=el('button','',k);b.type='button';b.setAttribute('aria-pressed',k===shape);b.addEventListener('click',()=>{shape=k;pv.shape(k);[...sh.children].forEach(x=>x.setAttribute('aria-pressed',x===b));});sh.appendChild(b);});pw.appendChild(sh);
    const ptw=el('div','ms-pt'),ptl=el('span','','');ptl.hidden=true;const ptb=el('button','','Path trace');ptb.type='button';ptb.setAttribute('aria-pressed',pv.pt());ptb.title='Real lighting: reflections, glass and soft shadows, refined over a few seconds';
    ptb.addEventListener('click',async()=>{if(pv.pt()){await pv.setPT(false);ptb.setAttribute('aria-pressed',false);ptl.hidden=true;return;}ptb.textContent='Loading…';const ok=await pv.setPT(true);ptb.textContent='Path trace';ptb.setAttribute('aria-pressed',ok);ptl.hidden=!ok;if(!ok)toast('Path tracing isn’t available here. It needs a recent GPU and a connection to load.',5000);});
    ptw.append(ptl,ptb);pw.appendChild(ptw);pvLabel=ptl;
    pane.appendChild(stk);pv.setObj(o&&surfaceOk(o)?o:null);pv.shape(shape);
    if(!o||!surfaceOk(o)){pane.appendChild(el('div','note','Pick an object (or add a shape) to give it a material. The preview above still works.'));}
    const live=()=>{const x=cur();pv.setObj(x&&surfaceOk(x)?x:null);bump();};
    const P=()=>norm((cur()||{}).pbr);
    const put=patch=>{const x=cur();if(!x||!surfaceOk(x)){toast('Pick an object first, or add a shape.');return false;}setPbr(x,patch);live();return true;};


    /* paint */
    {const s=sec(pane,'Paint','on the model');const B=PNT.B;
      s.appendChild(el('div','note','Paint straight on the object. One brush lays down colour, roughness, metal, height and glow together. One finger paints, two fingers move the view.'));
      const tog=(parent,label,get,set,cls)=>{const b=el('button',cls||'chip',label);b.type='button';b.setAttribute('aria-pressed',!!get());b.addEventListener('click',()=>{set(!get());b.setAttribute('aria-pressed',!!get());});parent.appendChild(b);return b;};
      const r0=el('div','chips');
      const onb=el('button','btn pri',B.on?'Painting: on':'Paint on model');onb.type='button';onb.setAttribute('aria-pressed',B.on);
      onb.addEventListener('click',()=>{const x=cur();if(!B.on&&(!x||!surfaceOk(x))){toast('Pick an object first, or add a shape.');return;}PNT.setOn(!B.on);onb.setAttribute('aria-pressed',B.on);onb.textContent=B.on?'Painting: on':'Paint on model';if(B.on){peek&&peek();toast('Painting. One finger paints, two fingers move the view.',3500);}});
      r0.appendChild(onb);
      r0.append(btn('Undo','',()=>{PNT.undo(cur());live();}),btn('Fill all','',()=>{PNT.fill(cur());live();}),btn('Reset paint','',()=>{PNT.reset(cur());live();}),btn('Export PNGs','',()=>PNT.exportPng(cur())));
      s.appendChild(r0);
      s.appendChild(el('div','sub','Brush presets'));
      const rp=el('div','chips');PNT.BRUSH_PRESETS.forEach(([n,d])=>rp.appendChild(btn(n,'',()=>{B.kind=d.kind;B.hard=d.hard;B.flow=d.flow;B.size=d.size;B.erase=false;Object.keys(B.use).forEach(k=>{B.use[k]=d.ch[k]!=null;});Object.assign(B.ch,d.ch);if(!B.on)onb.click();build2();})));s.appendChild(rp);
      s.appendChild(el('div','sub','Brush'));
      chipRow(s,PNT.KINDS,v=>B.kind===v,v=>{B.kind=v;B.erase=false;build2();});
      sliderRow(s,'Size',()=>B.size,v=>{B.size=v;},2,100,1);sliderRow(s,'Hardness',()=>B.hard,v=>{B.hard=v;},0,1,.01);sliderRow(s,'Flow',()=>B.flow,v=>{B.flow=v;},.05,1,.01);
      const rm=el('div','chips');tog(rm,'Mirror left and right',()=>B.mirror,v=>{B.mirror=v;});tog(rm,'Eraser',()=>B.erase,v=>{B.erase=v;});s.appendChild(rm);
      s.appendChild(el('div','sub','The brush paints'));
      const rc=el('div','chips');[['col','Colour'],['rou','Roughness'],['met','Metal'],['hgt','Height'],['em','Glow']].forEach(([k,l])=>tog(rc,l,()=>B.use[k],v=>{B.use[k]=v;build2();}));s.appendChild(rc);
      if(B.use.col)colorRow(s,'Colour',()=>B.ch.col,v=>{B.ch.col=v;});
      if(B.use.rou)sliderRow(s,'Roughness',()=>B.ch.rou,v=>{B.ch.rou=v;},0,1,.01);
      if(B.use.met)sliderRow(s,'Metal',()=>B.ch.met,v=>{B.ch.met=v;},0,1,.01);
      if(B.use.hgt)sliderRow(s,'Height (low dents, high bumps)',()=>B.ch.hgt,v=>{B.ch.hgt=v;},0,1,.01);
      if(B.use.em)colorRow(s,'Glow colour',()=>B.ch.em,v=>{B.ch.em=v;});
      s.appendChild(el('div','ms-cr','Paint lives on the object while this page is open. Export PNGs to keep it, then import them in any 3D tool.'));}
    /* quick materials */
    {const s=sec(pane,'Quick materials');const r=el('div','chips');
      RECIPES.forEach(([n,d])=>r.appendChild(btn(n,'',()=>{const x=cur();if(!x){toast('Pick an object first, or add a shape.');return;}if(x.ptex)clearTex(x);if(x.nmat){ngClear(x);}put({...PB,...d});build2();})));
      s.appendChild(r);}
    /* variations */
    {const s=sec(pane,'Evolve');s.appendChild(el('div','note','Six variations of what you have. Tap one to keep it, then evolve again. Surprise mixes the quick materials.'));
      const tiles=el('div','ms-tiles'),cvs=[];let vars=[];
      for(let i=0;i<6;i++){const b=el('button');b.type='button';b.setAttribute('aria-label','Variation '+(i+1));const c2=document.createElement('canvas');c2.width=c2.height=112;b.appendChild(c2);cvs.push(c2);tiles.appendChild(b);b.addEventListener('click',()=>{if(vars[i]&&put(vars[i])){toast('Variation kept');build2();}});}
      const gen=mode=>{vars=[];for(let i=0;i<6;i++)vars.push(mode==='s'?surprise():evolve(P(),i<3?.5:1));renderTiles(vars,cvs);};
      const r=el('div','chips');r.append(btn('Evolve','pri',()=>gen('e')),btn('Gentle','',()=>{vars=[];for(let i=0;i<6;i++)vars.push(evolve(P(),.3));renderTiles(vars,cvs);}),btn('Surprise me','',()=>gen('s')));
      s.append(tiles,r);setTimeout(()=>gen('e'),30);}
    /* textures */
    {const s=sec(pane,'Textures from Poly Haven','CC0');s.appendChild(el('div','note','Real photographed materials, free for any use. They load from Poly Haven when you tap one.'));
      const ctrl=el('div');
      library(s,'textures',async(x,b)=>{const o2=cur();if(!o2||!surfaceOk(o2)){toast('Pick an object first, or add a shape.');return;}b.style.opacity=.5;const ok=await applyTex(o2,{id:x.id,name:x.name,author:x.au});b.style.opacity='';if(ok){live();toast(x.name+' on '+o2.name);build2();}},id=>{const x=cur();return x&&x.ptex&&x.ptex.id===id;});
      s.appendChild(ctrl);
      const o2=cur();if(o2&&o2.ptex){const T=o2.ptex,u=()=>{retile(o2);live();};
        s.appendChild(el('div','sub','Texture: '+T.name));
        chipRow(s,[['1k','1K'],['2k','2K']],v=>T.res===v,v=>{applyTex(o2,{...T,res:v}).then(()=>{live();build2();});});
        sliderRow(s,'Tiling',()=>T.rep,v=>{T.rep=v;u();},.25,8,.05);sliderRow(s,'Relief',()=>T.nk,v=>{T.nk=v;u();},0,3,.05);sliderRow(s,'Roughness',()=>T.rk,v=>{T.rk=v;u();},0,2,.02);
        colorRow(s,'Tint',()=>T.tint||'#ffffff',v=>{T.tint=v;u();});
        s.appendChild(btn('Remove texture','',()=>{clearTex(o2);live();build2();}));
        if(T.author)s.appendChild(el('div','ms-cr','Poly Haven · CC0 · '+T.author));}}
    /* surface */
    {const s=sec(pane,'Surface');const set=(k,v)=>{put({[k]:v});};
      s.appendChild(el('div','note','Layers on top of any texture or pattern. Clear coat is a glossy lacquer, sheen is fabric fuzz, glass lets light through, iridescence is oil-slick colour.'));
      const o2=cur(),pp=P();
      colorRow(s,'Base colour',()=>pp.col||'#d8d8d8',v=>set('col',v));
      sliderRow(s,'Metal',()=>P().met==null?(phys(cur()||{holder:null})[0]?.metalness||0):P().met,v=>set('met',v),0,1,.01);
      sliderRow(s,'Roughness',()=>P().rou==null?(phys(cur()||{holder:null})[0]?.roughness??.5):P().rou,v=>set('rou',v),0,1,.01);
      sliderRow(s,'Clear coat',()=>P().cc,v=>set('cc',v),0,1,.01);sliderRow(s,'Coat roughness',()=>P().ccr,v=>set('ccr',v),0,1,.01);
      sliderRow(s,'Sheen',()=>P().sh,v=>set('sh',v),0,1,.01);colorRow(s,'Sheen colour',()=>P().shc,v=>set('shc',v));
      sliderRow(s,'Glass',()=>P().tr,v=>set('tr',v),0,1,.01);sliderRow(s,'Thickness',()=>P().th,v=>set('th',v),0,4,.05);sliderRow(s,'Refraction',()=>P().ior,v=>set('ior',v),1,2.4,.01);
      colorRow(s,'Glass tint',()=>P().atc,v=>{put({atc:v,atd:P().atd||2});});
      sliderRow(s,'Iridescence',()=>P().iri,v=>set('iri',v),0,1,.01);sliderRow(s,'Film index',()=>P().iriI,v=>set('iriI',v),1,2.4,.01);
      sliderRow(s,'Anisotropy',()=>P().an,v=>set('an',v),0,1,.01);sliderRow(s,'Specular',()=>P().spi,v=>set('spi',v),0,1,.01);
      sliderRow(s,'Glow',()=>P().em,v=>set('em',v),0,4,.05);colorRow(s,'Glow colour',()=>P().emc,v=>set('emc',v));
      sliderRow(s,'Opacity',()=>P().opa,v=>set('opa',v),0,1,.01);
      const r=el('div','chips');r.append(btn('Reset surface','',()=>{const x=cur();if(!x)return;clearPbr(x);live();build2();}),
        btn('Copy to all objects','',()=>{const x=cur();if(!x||!x.pbr)return;S.objs.forEach(y=>{if(y!==x&&surfaceOk(y))setPbr(y,clone(x.pbr));});bump();toast('Copied to every object');}));s.appendChild(r);}
    /* pattern */
    {const s=sec(pane,'Pattern');s.appendChild(el('div','note','Build a procedural material from nodes, like Substance Designer. It sits under the layers above.'));
      const r=el('div','chips');r.append(btn('Open node graph','pri',()=>{openGraph();}),btn('Remove pattern','',()=>{const x=cur();if(x&&x.nmat){ngClear(x);live();build2();}}));s.appendChild(r);}
    /* environment */
    {const s=sec(pane,'Environment','CC0');s.appendChild(el('div','note','The light and reflections your materials see. Pick a real place to judge glass and metal.'));
      const r=el('div','chips');r.append(btn('Studio','',()=>{studioEnv(pv);bump();}));s.appendChild(r);
      library(s,'hdris',async(x,b)=>{b.style.opacity=.5;await useHdri(x.id,pv);b.style.opacity='';},id=>hdrId===id);
      sliderRow(s,'Strength',()=>S.env,v=>{S.env=v;c.setEnvStrength&&c.setEnvStrength(v);bump();},0,2,.05);}

    /* light */
    {const s=sec(pane,'Light','rigs and path tracing');s.appendChild(el('div','note','One tap sets up real lights around the selected object. For the best judge of glass, metal and soft shadows, switch on Path trace in the preview.'));
      const t=()=>controls.target;const rigsBtn=[];
      const RIGS=[
        ['Studio',[['dir',{color:'#fff4e6',intensity:2.6,d:[3,4,3]}],['point',{color:'#8fb4ff',intensity:14,d:[-3,2,2]}],['spot',{color:'#ffffff',intensity:70,d:[0,3,-3]}]]],
        ['Softbox',[['spot',{color:'#ffffff',intensity:110,d:[0,5,1],angle:55}],['point',{color:'#ffe9d6',intensity:10,d:[2,1,3]}]]],
        ['Neon club',[['point',{color:'#ff2bd6',intensity:40,d:[-3,1.5,2]}],['point',{color:'#18e7ff',intensity:40,d:[3,1.5,2]}],['point',{color:'#7a4dff',intensity:20,d:[0,3,-3]}]]],
        ['Golden hour',[['dir',{color:'#ffb868',intensity:3.4,d:[4,1.2,2]}],['point',{color:'#6f93ff',intensity:8,d:[-3,2,-2]}]]],
        ['Rim light',[['spot',{color:'#ffffff',intensity:120,d:[-2,2,-4],angle:40}],['spot',{color:'#9fc2ff',intensity:90,d:[2.5,2,-4],angle:40}],['point',{color:'#ffd9b0',intensity:4,d:[0,1,4]}]]],
        ['Underlight',[['point',{color:'#4dff9a',intensity:40,d:[0,-2,2]}],['point',{color:'#ff3a3a',intensity:6,d:[0,3,-2]}]]],
        ['Moonlight',[['dir',{color:'#9db8ff',intensity:1.6,d:[-3,5,2]}],['point',{color:'#ffd9a8',intensity:6,d:[2,.5,3]}]]]
      ];
      const rr=el('div','chips');RIGS.forEach(([n,list])=>rr.appendChild(btn(n,'',async()=>{try{await LGT.clearLights();for(const [ty,p] of list){const tg=t();await LGT.addLight(ty,{color:p.color,intensity:p.intensity,angle:p.angle||35,pos:[tg.x+p.d[0],tg.y+p.d[1],tg.z+p.d[2]]});}S.needFrame=true;bump();toast(n+' lights set');}catch(e){toast('Couldn’t set those lights.');}})));
      rr.appendChild(btn('Clear lights','',async()=>{await LGT.clearLights();bump();}));s.appendChild(rr);
      s.appendChild(el('div','sub','Path trace (preview)'));
      sliderRow(s,'Blur (depth of field)',()=>0,v=>{pv.blur(v);},0,1,.01);
      sliderRow(s,'Quality (samples)',()=>160,v=>{pv.cap(Math.round(v));},20,600,10);
      const r2=el('div','chips');r2.append(btn('Render scene','pri',()=>{renderScene&&renderScene();}),btn('Save preview','',()=>pv.snap()),btn('Sun, sky and all lights','',()=>{gotoTab&&gotoTab('scene');}));s.appendChild(r2);
      s.appendChild(el('div','ms-cr','Path tracing by three-gpu-pathtracer (MIT). It loads the first time you switch it on.'));}

    /* effects and engine */
    {const s=sec(pane,'Effects','n0ise engine');s.appendChild(el('div','note','The n0ise effects work on 3D too. Surface effects live in the object’s own material and move with it. The full effect stack and hardware looks work on the whole picture.'));
      if(!SB&&createBall){try{SB=createBall(THREE,RoomEnvironment,88);}catch(e){}}
      const x=cur();
      if(x&&surfaceOk(x)&&SURF&&SURF.SURF){
        const row=el('div','ballrow');row.style.cssText='display:flex;gap:10px;align-items:center;margin:4px 0';if(SB){row.appendChild(SB.el);SB.set(x.surf);}const ch=el('div','chips');ch.style.flex='1';
        const none=el('button','chip','None');none.type='button';none.setAttribute('aria-pressed',!(x.surf&&x.surf.m));none.addEventListener('click',()=>{SURF.clear(x);bump();build2();});ch.appendChild(none);
        SURF.SURF.forEach(([id,label])=>{const b=el('button','chip',label);b.type='button';b.setAttribute('aria-pressed',!!(x.surf&&x.surf.m===id));b.addEventListener('click',()=>{SURF.pick(x,id);bump();build2();});b.addEventListener('pointerenter',()=>SB&&SB.set({m:id,amt:1,sp:1,...SURF.defaults(id)}));b.addEventListener('pointerleave',()=>SB&&SB.set(x.surf));ch.appendChild(b);});
        row.appendChild(ch);s.appendChild(row);}
      const r=el('div','chips');r.append(btn('Edit n0ise effects','pri',()=>{fxOpen&&fxOpen();}),btn('Hardware looks','',()=>{openLook&&openLook();}),btn('Open Look tab','',()=>{gotoTab&&gotoTab('look');}));s.appendChild(r);}
    /* jump bar */
    {const nav=el('div','ms-nav');nav.setAttribute('role','navigation');nav.setAttribute('aria-label','Material sections');
      [...pane.querySelectorAll(':scope > .sec')].forEach(sc=>{const nm=(sc.querySelector('.st span')||{}).textContent;if(!nm)return;sc.style.scrollMarginTop='230px';
        const b=el('button',nm==='Paint'?'hot':'',nm.replace(' from Poly Haven','').replace('Textures','Textures'));b.type='button';b.addEventListener('click',()=>{sc.scrollIntoView({block:'start',behavior:'smooth'});});nav.appendChild(b);});
      stk.appendChild(nav);}
    lastKey=keyOf(o);
  }
  const keyOf=o=>o?o.id+'|'+(o.ptex?o.ptex.id:'')+'|'+(o.nmat?1:0)+'|'+(o.pbr?1:0):'-';
  let t2=0;const build2=()=>{clearTimeout(t2);t2=setTimeout(()=>{const y=pane.parentElement?pane.parentElement.scrollTop:0;build();},20);};
  /* rebuild when another object is picked while the tab is open */
  setInterval(()=>{if(pane.hidden)return;const o=cur();const id=o?o.id:null;if(id!==shown){build();}},500);
  return {paintOff(){PNT.setOn(false);},show(){build();},refresh(){if(!pane.hidden)build();},applyTex,clearTex,setPbr,clearPbr,upgrade,physProps:o=>{if(o&&o.pbr){upgrade(o);phys(o).forEach(m=>physProps(THREE,m,norm(o.pbr)));}}};
}
