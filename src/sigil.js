/* DRAW: 3D strokes as real geometry (from the SIGIL prototype), wired into the 3D page.
   A drawing is one scene object (so Look, effect stacks, materials, physics, undo, project save and GLB export all work on it). It holds
   immutable strokes (centreline + per-point width + material) and, optionally, a photo plane to draw on. Strokes are rebuilt into tubes
   from that data. Drawing happens on the screen plane, a surface, the floor, a wall or the photo; orbit any time to see it is 3D. */
import {PEN} from './pen.js';
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
  light:['Light','#fff2d8',{metalness:0,roughness:1,emissive:'#fff2d8',ei:1.6},'linear-gradient(115deg,#fff6e6,#fff,#ffe9c2)'],
  silver:['Silver','#e9ebee',{metalness:1,roughness:.18},'linear-gradient(115deg,#2a2c2f,#fff,#8a8f96,#f4f6f8)'],
  bronze:['Bronze','#b8794a',{metalness:1,roughness:.3},'linear-gradient(115deg,#2d1a0e,#c98c58,#6a4020,#e6b88e)'],
  rosegold:['Rose gold','#e8a995',{metalness:1,roughness:.16},'linear-gradient(115deg,#3b1f1a,#f3bfae,#8a5547,#ffe3d8)'],
  titanium:['Titanium','#8d9199',{metalness:1,roughness:.38},'linear-gradient(115deg,#25272b,#a4a8af,#5b5f66,#c9ccd2)'],
  carbon:['Carbon','#0e0f10',{metalness:.6,roughness:.35,clearcoat:1,clearcoatRoughness:.05},'linear-gradient(115deg,#000,#2b2e31,#050506,#3b3f44)'],
  rubber:['Rubber','#1b1b1d',{metalness:0,roughness:.88},'linear-gradient(115deg,#0a0a0b,#2a2a2d,#0f0f10)'],
  velvet:['Velvet','#6b1736',{metalness:0,roughness:.95,sheen:1,sheenRoughness:.4,sheenColor:'#ff8fb4'},'linear-gradient(115deg,#2a0716,#8a2149,#ff8fb4,#3b0b1f)'],
  porcelain:['Porcelain','#f6f4f0',{metalness:0,roughness:.22,clearcoat:1,clearcoatRoughness:.04},'linear-gradient(115deg,#d9d6cf,#fff,#ece8e0)'],
  chalk:['Chalk','#e8dcc2',{metalness:0,roughness:1},'linear-gradient(115deg,#bfb49b,#f4ead2,#d9cdb2)'],
  wax:['Wax','#f1e2b0',{metalness:0,roughness:.5,transmission:.35,thickness:.8,ior:1.4},'linear-gradient(115deg,#d6c58a,#fff3c8,#e8d599)'],
  jade:['Jade','#4fb286',{metalness:0,roughness:.28,transmission:.55,thickness:1,ior:1.55,clearcoat:.6},'linear-gradient(115deg,#0f3a2a,#6fd5a5,#2a7a58,#c7f5de)'],
  amber:['Amber','#f0a030',{metalness:0,roughness:.12,transmission:.8,thickness:1.2,ior:1.55},'linear-gradient(115deg,#5a2c05,#ffb642,#b86a10,#ffe0a0)'],
  ruby:['Ruby','#c2132f',{metalness:0,roughness:.06,transmission:.7,thickness:1,ior:1.76,clearcoat:1},'linear-gradient(115deg,#3a0610,#ff3b58,#7a0a1c,#ffb3c0)'],
  ice:['Ice','#dff4ff',{metalness:0,roughness:.15,transmission:1,thickness:.7,ior:1.31},'linear-gradient(115deg,#a9d4ea,#fff,#cfeaf7,#8fc0d8)'],
  opal:['Opal','#e9f1f4',{metalness:0,roughness:.3,clearcoat:1,iridescence:1,iridescenceIOR:1.8,irisT:[200,700]},'linear-gradient(115deg,#f2e0ef,#c9f2ee,#f7f0c8,#e0cdf7)'],
  oilslick:['Oil slick','#20222a',{metalness:.9,roughness:.12,iridescence:1,iridescenceIOR:2.2,irisT:[300,1000]},'linear-gradient(115deg,#0a0b10,#4a38a8,#1fa27a,#c24a8a,#0a0b10)'],
  plasma:['Plasma','#b06bff',{metalness:0,roughness:.4,emissive:'self',ei:2.2},'linear-gradient(115deg,#3b0d6e,#d19bff,#7c3be0,#fff)'],
  tube:['Light tube','#7ff2ff',{metalness:0,roughness:.3,emissive:'self',ei:3},'linear-gradient(115deg,#0d3a40,#a8faff,#3ec9d6,#fff)']
};
const LIM={strokes:400,pts:700};
const MPK={metalness:[0,1],roughness:[0,1],clearcoat:[0,1],clearcoatRoughness:[0,1],iridescence:[0,1],iridescenceIOR:[1,2.5],sheen:[0,1],sheenRoughness:[0,1],transmission:[0,1],thickness:[0,4],ior:[1,2.5],opacity:[.05,1],ei:[0,6],aniso:[0,1],bump:[0,1],pa:[0,1],ps:[.25,8]};
const PATS=['none','stripes','spiral','checker','dots','noise','marble'];
/* a material made in the studio travels inside each stroke; files from elsewhere are clamped to sane numbers */
export function cleanMP(p){if(!p||typeof p!=='object')return null;const o={};for(const k in MPK){if(p[k]!=null&&Number.isFinite(+p[k]))o[k]=Math.min(MPK[k][1],Math.max(MPK[k][0],+p[k]));}
  const hx=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);if(hx(p.emissive)||p.emissive==='self')o.emissive=p.emissive;if(hx(p.c2))o.c2=p.c2;if(PATS.includes(p.pat)&&p.pat!=='none')o.pat=p.pat;if(hx(p.sheenColor))o.sheenColor=p.sheenColor;
  if(Array.isArray(p.irisT)&&p.irisT.length===2&&p.irisT.every(Number.isFinite))o.irisT=[Math.max(0,Math.min(2000,p.irisT[0])),Math.max(0,Math.min(2000,p.irisT[1]))];
  if(o.opacity!=null&&o.opacity<1)o.transparent=true;return o;}

/* procedural patterns: tile along a stroke (one tile per 10 cm) and wrap around it. Colours are baked into the map, a grey copy drives the relief. */
const TEXC=new Map();
const hexRGB=h=>{const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];};
const _h=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
const _vn=(x,y,P)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,m=q=>((q%P)+P)%P,sm=t=>t*t*(3-2*t),a=_h(m(xi),m(yi)),b=_h(m(xi+1),m(yi)),c=_h(m(xi),m(yi+1)),d=_h(m(xi+1),m(yi+1)),u=sm(xf),v=sm(yf);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;};
const _fbm=(x,y,P)=>{let s=0,a=.5,f=1;for(let i=0;i<4;i++){s+=a*_vn(x*f,y*f,P*f);f*=2;a*=.5;}return s/.9375;};
const _ss=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function patMask(t,u,v){
  switch(t){
    case'stripes':return _ss(.42,.58,.5+.5*Math.sin(u*Math.PI*4));
    case'spiral':return _ss(.42,.58,.5+.5*Math.sin((u*2+v)*Math.PI*2));
    case'checker':return (Math.floor(u*4)+Math.floor(v*4))&1;
    case'dots':{const x=(u*6)%1-.5,y=(v*6)%1-.5;return 1-_ss(.26,.34,Math.hypot(x,y));}
    case'noise':return _ss(.3,.7,_fbm(u*8,v*8,8));
    case'marble':return _ss(.35,.65,.5+.5*Math.sin(u*Math.PI*6+_fbm(u*6,v*6,6)*7));
  }return 0;
}
function patTex(THREE,type,c1,c2,amt,scale){
  const key=[type,c1,c2,amt,scale].join('|');if(TEXC.has(key)){const e=TEXC.get(key);return e;}
  const N=128,mk=()=>{const c=document.createElement('canvas');c.width=c.height=N;return c;},cv=mk(),cb=mk(),g=cv.getContext('2d'),gb=cb.getContext('2d'),im=g.createImageData(N,N),ib=gb.createImageData(N,N),a=hexRGB(c1),b=hexRGB(c2);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const m=patMask(type,x/N,y/N),k=m*amt,i=(y*N+x)*4;for(let j=0;j<3;j++){im.data[i+j]=a[j]+(b[j]-a[j])*k;ib.data[i+j]=m*255;}im.data[i+3]=255;ib.data[i+3]=255;}
  g.putImageData(im,0,0);gb.putImageData(ib,0,0);
  const mp=new THREE.CanvasTexture(cv),bp=new THREE.CanvasTexture(cb);for(const t of[mp,bp]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(scale,1);t.anisotropy=4;}mp.colorSpace=THREE.SRGBColorSpace;
  if(TEXC.size>40){const k0=TEXC.keys().next().value,e=TEXC.get(k0);e.map.dispose();e.bump.dispose();TEXC.delete(k0);}
  const e={map:mp,bump:bp};TEXC.set(key,e);return e;
}
const q4=v=>Math.round(v*1e4)/1e4;
export function createSigil(c){
  const {THREE,S,scene,camera,controls,canvas,registerObject,objById,selectObj,bump,uPush,toast,el,btn,sec,sliderRow,chipRow,setShadowFlags,loadCanvas,tc,setTool,markDirty,applyView}=c;
  const SG={cur:null,B:{snap:'ends',snapPx:16,grid:.1,anchor:null,pick:false,size:22,smooth:.4,taper:.6,press:'auto',depth:.3,style:'round',mat:'chrome',mp:null,col:'#dfe6ee',plane:'view',off:0,mirror:false,mirY:false,mirZ:false,rax:0,rad:1,jit:0,wob:0,wn:0,line:false,mode:'draw',mox:0,moy:0,moz:0,ec:1,eax:0,eo:.3,hue:0,rb:false,rbh:0}};
  const B=SG.B;let uid=1,drawing=null,space=false,paneHost=null,sync_ui=null;
  const ray=new THREE.Raycaster(),ring=document.createElement('div');
  ring.style.cssText='position:fixed;z-index:30;pointer-events:none;border:1.5px solid #fff;mix-blend-mode:difference;border-radius:50%;transform:translate(-50%,-50%);display:none';document.body.appendChild(ring);
  const isDraw=()=>S.tab==='draw'&&!S.walk;
  /* ---------- state of one drawing ---------- */
  const L0=()=>[{id:'L1',name:'Layer 1',vis:true,lock:false,plane:null}];
  const cloneL=a=>a.map(l=>({...l,plane:l.plane?{p:l.plane.p.slice(),n:l.plane.n.slice()}:null}));
  function newState(){return {strokes:[],layers:L0(),curL:'L1',rev:0,revs:new Map([[0,{s:[],l:L0()}]]),undo:[],redo:[],photo:null,layer:null,photoMesh:null,cand:null};}
  const layerOf=(st,id)=>st.layers.find(l=>l.id===id)||st.layers[0];
  function commit(o,strokes,layers){
    const st=o.meta.sigil;st.undo.push(st.rev);if(st.undo.length>80)st.undo.shift();st.redo.length=0;
    if(layers)st.layers=layers;
    const r=++st.rev;st.strokes=strokes;st.revs.set(r,{s:strokes.slice(),l:cloneL(st.layers)});
    if(st.revs.size>100){for(const k of st.revs.keys()){if(!st.undo.includes(k)&&k!==st.rev){st.revs.delete(k);break;}}}
    sync(o);paint();bump();markDirty&&markDirty();
  }
  function setRev(o,r){const st=o.meta.sigil;if(!st.revs.has(r))return false;const e=st.revs.get(r);st.rev=r;st.strokes=e.s.slice();st.layers=cloneL(e.l);if(!st.layers.some(l=>l.id===st.curL))st.curL=st.layers[0].id;sync(o);paint();bump();return true;}
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
    const pos=[],nor=[],uvs=[],idx=[],tp=s.tp||0;let len=0;
    for(let i=0;i<=seg;i++){
      if(i>0){len+=pts[i].distanceTo(pts[i-1]);const ax=_v.crossVectors(T[i-1],T[i]);const l=ax.length();if(l>1e-6){ax.divideScalar(l);N.applyAxisAngle(ax,Math.asin(Math.min(1,l)));}N.addScaledVector(T[i],-N.dot(T[i])).normalize();} // parallel transport: no twisting
      const Bn=new THREE.Vector3().crossVectors(T[i],N).normalize(),f=i/seg,e=Math.min(f,1-f)/.16,ease=Math.sqrt(Math.max(0,1-Math.pow(1-Math.min(1,e),2)));
      let r=s.r*ws[i]*(1-tp*(1-ease));if(i===0||i===seg)r*=tp>.2?.12:.4;r=Math.max(.0012,r);
      for(let k=0;k<=R;k++){const an=k/R*Math.PI*2,cs=Math.cos(an),sn=Math.sin(an);
        const nx=N.x*cs/ty+Bn.x*sn/tx,ny=N.y*cs/ty+Bn.y*sn/tx,nz=N.z*cs/ty+Bn.z*sn/tx,nl=Math.hypot(nx,ny,nz)||1;
        pos.push(pts[i].x+(N.x*cs*ty+Bn.x*sn*tx)*r,pts[i].y+(N.y*cs*ty+Bn.y*sn*tx)*r,pts[i].z+(N.z*cs*ty+Bn.z*sn*tx)*r);nor.push(nx/nl,ny/nl,nz/nl);uvs.push(len*10,k/R);
        if(i<seg&&k<R){const q=i*(R+1)+k;idx.push(q,q+R+1,q+1,q+1,q+R+1,q+R+2);}}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(idx);g.computeBoundingSphere();return g;
  }
  const matOf=()=>({m:B.mat,c:B.col,mp:B.mat==='custom'?{...B.mp}:undefined});
  function matProps(s){return s.m==='custom'&&s.mp?s.mp:(MATS[s.m]||MATS.chrome)[2];}
  function makeMat(s){
    const d=MATS[s.m]||MATS.chrome,p=matProps(s),m=new THREE.MeshPhysicalMaterial({color:s.c||d[1],metalness:p.metalness||0,roughness:p.roughness!=null?p.roughness:.5,side:THREE.DoubleSide});
    if(p.clearcoat){m.clearcoat=p.clearcoat;m.clearcoatRoughness=p.clearcoatRoughness!=null?p.clearcoatRoughness:.1;}
    if(p.iridescence){m.iridescence=p.iridescence;m.iridescenceIOR=p.iridescenceIOR||1.4;if(p.irisT)m.iridescenceThicknessRange=[p.irisT[0],p.irisT[1]];}
    if(p.sheen){m.sheen=p.sheen;m.sheenRoughness=p.sheenRoughness!=null?p.sheenRoughness:.5;m.sheenColor.set(p.sheenColor||'#ffffff');}
    if(p.transmission){m.transmission=p.transmission;m.thickness=p.thickness||.5;m.ior=p.ior||1.5;m.envMapIntensity=1.8;m.specularIntensity=1;m.emissive.set(s.c||d[1]);m.emissiveIntensity=.3*p.transmission;} // a faint tint of its own colour, so glass still reads against a dark scene
    if(p.transparent){m.transparent=true;m.opacity=p.opacity;m.depthWrite=false;}
    if(p.emissive){m.emissive.set(p.emissive==='self'||s.m==='light'?(s.c||d[1]):p.emissive);m.emissiveIntensity=p.ei||1;}
    if(p.aniso){m.anisotropy=p.aniso;m.anisotropyRotation=Math.PI/2;}
    if(p.pat&&p.pat!=='none'){const t=patTex(THREE,p.pat,s.c||d[1],p.c2||'#000000',p.pa!=null?Math.round(p.pa*10)/10:1,p.ps||1);m.color.set('#ffffff');m.map=t.map;if(p.bump){m.bumpMap=t.bump;m.bumpScale=p.bump*4;}}
    else if(p.bump){const t=patTex(THREE,'noise','#ffffff','#000000',1,p.ps||1);m.bumpMap=t.bump;m.bumpScale=p.bump*4;}
    m.userData.sigilMat=s.m;return m;
  }
  function strokeColor(){if(!(B.hue>0)&&!B.rb)return B.col;const c=new THREE.Color(B.col);if(B.rb){B.rbh=(B.rbh+.07)%1;c.offsetHSL(B.rbh,0,0);}else c.offsetHSL((Math.random()-.5)*B.hue,0,0);return '#'+c.getHexString();}
  let guideG=null;
  SG.guide=()=>{
    if(guideG){if(guideG.parent)guideG.parent.remove(guideG);guideG.traverse(n=>{if(n.geometry)n.geometry.dispose();});guideG=null;}
    const o=target();if(!o||!isDraw()||!(B.mirror||B.mirY||B.mirZ))return;
    guideG=new THREE.Group();guideG.userData.noView=true;
    const mk=(rot,pos)=>{const g=new THREE.PlaneGeometry(4,4),m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x27f5c9,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false})),e=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0x27f5c9,transparent:true,opacity:.7}));m.add(e);m.rotation.set(rot[0],rot[1],rot[2]);m.position.set(pos[0],pos[1],pos[2]);m.raycast=()=>{};e.raycast=()=>{};m.userData.noView=true;guideG.add(m);};
    if(B.mirror)mk([0,Math.PI/2,0],[B.mox,0,0]);if(B.mirY)mk([Math.PI/2,0,0],[0,B.moy,0]);if(B.mirZ)mk([0,0,0],[0,0,B.moz]);
    o.holder.add(guideG);bump();
  };
  function symMatrices(s){
    const out=[],R=Math.max(1,Math.min(16,s.rad|0)),ax=[s.mir?-1:1,s.my?-1:1,s.mz?-1:1],ra=s.ra===1||s.ra===2?s.ra:0;
    const mo=Array.isArray(s.mo)?s.mo.map(v=>Math.max(-8,Math.min(8,+v||0))):[0,0,0],EC=Math.max(1,Math.min(12,s.ec|0||1)),ea=s.ea===1||s.ea===2?s.ea:0,eo=Math.max(-3,Math.min(3,+s.eo||0));
    const flips=[[1,1,1]];
    for(let k=0;k<3;k++)if(ax[k]<0)for(const f of flips.slice())flips.push(f.map((v,j)=>j===k?-v:v));
    const E=new THREE.Euler(),Q=new THREE.Quaternion(),P=new THREE.Vector3(),S1=new THREE.Vector3();
    for(let i=0;i<R;i++){const an=i/R*Math.PI*2;E.set(ra===1?an:0,ra===0?an:0,ra===2?an:0);Q.setFromEuler(E);
      for(const f of flips)for(let e=0;e<EC&&out.length<96;e++){P.set(f[0]<0?2*mo[0]:0,f[1]<0?2*mo[1]:0,f[2]<0?2*mo[2]:0);if(e)P.setComponent(ea,P.getComponent(ea)+e*eo);
        out.push(new THREE.Matrix4().compose(P,Q,S1.set(f[0],f[1],f[2])));}}
    return out;
  }
  function strokeGroup(s){
    const g=new THREE.Group(),geo=tubeGeometry(s),mat=makeMat(s);g.userData.sid=s.id;g.userData.src=s;
    for(const M of symMatrices(s)){const m=new THREE.Mesh(geo,mat);m.matrixAutoUpdate=false;m.matrix.copy(M);m.userData.sid=s.id;m.castShadow=m.receiveShadow=!!S.shadows;g.add(m);}
    return g;
  }
  function disposeG(g){const gs=new Set(),ms=new Set();g.traverse(n=>{if(n.isMesh){gs.add(n.geometry);ms.add(n.material);}});gs.forEach(x=>x.dispose());ms.forEach(x=>x.dispose());}
  function sync(o){
    const st=o.meta.sigil,layer=st.layer,have=new Map();layer.children.slice().forEach(g=>have.set(g.userData.sid,g));
    const want=new Set(st.strokes.map(s=>s.id));
    for(const [id,g] of have)if(!want.has(id)){layer.remove(g);disposeG(g);have.delete(id);}
    for(const s of st.strokes){const g=have.get(s.id);if(g&&g.userData.src===s)continue;if(g){layer.remove(g);disposeG(g);}layer.add(strokeGroup(s));}
    layer.children.forEach(g=>{const ly=layerOf(st,g.userData.src&&g.userData.src.ly);g.visible=ly.vis!==false;});
    st.cand=null;
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
  const anchorP=()=>B.anchor?new THREE.Vector3(...B.anchor):controls.target.clone();
  function planeFor(o,through){
    const dir=camera.getWorldDirection(new THREE.Vector3()),pl=new THREE.Plane(),A=through||anchorP();
    const ly=layerOf(o.meta.sigil,o.meta.sigil.curL);
    if(B.plane==='layer'&&ly.plane){const n=new THREE.Vector3(...ly.plane.n).transformDirection(o.holder.matrixWorld),pp=o.holder.localToWorld(new THREE.Vector3(...ly.plane.p));pl.setFromNormalAndCoplanarPoint(n,pp);}
    else if(B.plane==='floor')pl.set(new THREE.Vector3(0,1,0),-(through?through.y:(B.anchor?B.anchor[1]:0))-.001);
    else if(B.plane==='wall')pl.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,0,1),A);
    else if(B.plane==='photo'&&o.meta.sigil.photoMesh){const m=o.meta.sigil.photoMesh;m.updateMatrixWorld(true);pl.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,0,1).transformDirection(m.matrixWorld),new THREE.Vector3().setFromMatrixPosition(m.matrixWorld).addScaledVector(new THREE.Vector3(0,0,1).transformDirection(m.matrixWorld),.003));}
    else pl.setFromNormalAndCoplanarPoint(dir.clone().negate(),A.clone().addScaledVector(dir,through?0:B.off));
    if(pl.normal.dot(camera.getWorldDirection(new THREE.Vector3()))>0)pl.negate(); // always face the viewer
    return pl;
  }
  function hit0(e,o,plane,lastD){
    const rr=rayAt(e);
    if(B.plane==='surface'){
      const objs=S.objs.filter(x=>x.vis).map(x=>x.holder),hs=rr.intersectObjects(objs,true).filter(h=>h.object.isMesh&&!h.object.userData.live);
      if(hs[0]){const n=hs[0].face?hs[0].face.normal.clone().transformDirection(hs[0].object.matrixWorld):new THREE.Vector3(0,1,0);if(n.dot(rr.ray.direction)>0)n.negate();return {p:hs[0].point.clone(),n,d:hs[0].distance,surf:true};}
      if(lastD)return {p:rr.ray.origin.clone().addScaledVector(rr.ray.direction,lastD),n:plane.normal.clone(),d:lastD};
    }
    const p=rr.ray.intersectPlane(plane,new THREE.Vector3());if(!p)return null;const d=p.distanceTo(camera.position);if(d>90)return null;
    return {p,n:plane.normal.clone(),d};
  }
  /* snapping: the line lands exactly on the end (or any point) of a stroke you already drew, or on a grid, so shapes can be truly connected in 3D */
  const _sv=new THREE.Vector3();
  function candidates(o){
    const st=o.meta.sigil;if(st.cand)return st.cand;const out=[],step=B.snap==='lines'?1:0;
    for(const s of st.strokes){if(layerOf(st,s.ly).vis===false)continue;const n=s.w.length;
      const take=step?Array.from({length:n},(_,i)=>i).filter(i=>i%2===0||i===n-1):[0,n-1];
      for(const i of take){if(out.length>5000)break;out.push(o.holder.localToWorld(new THREE.Vector3(s.pts[i*3],s.pts[i*3+1],s.pts[i*3+2])));}}
    st.cand=out;st.candMode=B.snap;return out;
  }
  function snapAt(e,o,extra){
    if(B.snap==='off'||B.snap==='grid')return null;
    const st=o.meta.sigil;if(st.candMode&&st.candMode!==B.snap)st.cand=null;
    const cs=extra?candidates(o).concat(extra):candidates(o),r=canvas.getBoundingClientRect();let best=null,bd=B.snapPx;
    for(const c of cs){_sv.copy(c).project(camera);if(_sv.z>1||_sv.z<-1)continue;const x=r.left+(_sv.x+1)/2*r.width,y=r.top+(1-_sv.y)/2*r.height,d=Math.hypot(x-e.clientX,y-e.clientY);if(d<bd){bd=d;best={p:c,x,y};}}
    return best;
  }
  const snapEl=document.createElement('div');snapEl.style.cssText='position:fixed;z-index:31;pointer-events:none;width:20px;height:20px;margin:-10px 0 0 -10px;border:2px solid #e9dfcb;border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.5);display:none';document.body.appendChild(snapEl);
  function hit(e,o,plane,lastD,extra){
    const h=hit0(e,o,plane,lastD);
    if(!h)return h;
    if(B.snap==='grid'){const g=B.grid,l=o.holder.worldToLocal(h.p.clone());l.set(Math.round(l.x/g)*g,Math.round(l.y/g)*g,Math.round(l.z/g)*g);h.p=o.holder.localToWorld(l);h.snapped=true;snapEl.style.display='none';return h;}
    const sn=snapAt(e,o,extra);
    if(sn){h.p=sn.p.clone();h.d=h.p.distanceTo(camera.position);h.snapped=true;snapEl.style.display='block';snapEl.style.left=sn.x+'px';snapEl.style.top=sn.y+'px';}else snapEl.style.display='none';
    return h;
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
    else if(pen||(B.press==='auto'&&e.pointerType==='pen'))target=Math.max(.1,Math.pow(PEN.p(e),.8))*PEN.tiltK(e);
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
    if(B.pick){ // "draw at a point": the next click sets where the drawing plane goes
      const pl0=planeFor(o),hh=hit0(e,o,pl0,0);if(hh){B.anchor=hh.p.toArray().map(q4);B.pick=false;canvas.style.cursor='crosshair';markAnchor();sync_ui&&sync_ui();toast('Drawing plane set here. It stays until you clear it.',2500);}
      return;}
    if(B.mode==='erase'||PEN.isEraser(e)){drawing={erase:true,o,changed:false,keep:o.meta.sigil.strokes.slice()};eraseAt(e);canvas.setPointerCapture(e.pointerId);return;}
    if(o.meta.sigil.strokes.length>=LIM.strokes){toast('This drawing has the most strokes it can hold. Start a new drawing.');return;}
    if(S.sel!==o.id)selectObj(o.id);SG.cur=o.id;
    const stL=o.meta.sigil,lyc=layerOf(stL,stL.curL);
    if(lyc.lock){toast('“'+lyc.name+'” is locked. Unlock it or pick another layer.');return;}
    let plane=planeFor(o),h0=hit(e,o,plane,0);if(!h0)return;
    if(h0.snapped&&B.plane==='view'){plane=planeFor(o,h0.p);} // started on an existing point: keep that depth
    const ls=o.holder.scale.x||1,r0=B.size/2*px2w(h0.d)/ls;
    const D=drawing={o,plane,startSnap:!!h0.snapped,r0,d0:h0.d,lastD:h0.d,w:.3,raw:[],lp:h0.p.clone(),lastEv:{x:e.clientX,y:e.clientY,t:e.timeStamp},n0:h0.n.clone(),pid:e.pointerId,
      id:'s'+Date.now().toString(36)+(uid++),col:strokeColor(),
      stroke(){const s=B,loc=this.raw;return {id:this.id,m:s.mat,...(s.mat==='custom'?{mp:{...s.mp}}:{}),c:this.col||s.col,st:s.style,sm:s.smooth,tp:s.taper,mir:s.mirror?1:0,...((s.mox||s.moy||s.moz)?{mo:[s.mox,s.moy,s.moz]}:{}),...(s.ec>1?{ec:s.ec,ea:s.eax,eo:s.eo}:{}),...(s.mirY?{my:1}:{}),...(s.mirZ?{mz:1}:{}),...(s.rax?{ra:s.rax}:{}),rad:s.rad,ly:this.ly,r:this.rr,nrm:this.nl,pts:loc.flatMap(p=>p.p),w:loc.map(p=>p.w)};}};
    D.ly=stL.curL;D.rr=r0;D.nl=h0.n.clone().transformDirection(new THREE.Matrix4().copy(o.holder.matrixWorld).invert()).toArray().map(q4);
    addPoint(e,h0,0,0);canvas.setPointerCapture(e.pointerId);canvas.style.cursor='crosshair';
  }
  function addPoint(e,h,dtms,distPx){
    const D=drawing,o=D.o,lazy=B.smooth*.8;
    if(h.snapped)D.lp.copy(h.p);else D.lp.lerp(h.p,D.raw.length?1-lazy:1);
    let w=pressureOf(e,D,dtms,distPx)*Math.min(4,Math.max(.25,h.d/D.d0));
    if(B.wn){D.wv=(D.wv||0)+((Math.random()-.5)*2-(D.wv||0))*.35;w*=1+D.wv*B.wn*.9;} // width noise: a hand-inked wobble in thickness
    const p=D.lp.clone();
    if(!h.snapped)p.addScaledVector(h.n,(h.surf?px2w(h.d)*B.size*.35*w:0)+(w-.5)*2*B.depth*D.r0*ls(o)*5); // pressure also pushes in depth
    if(!h.snapped&&(B.jit||B.wob)){const sc=D.r0*ls(o),k=D.raw.length;if(B.jit)p.addScaledVector(h.n,(Math.random()-.5)*2*B.jit*sc*3).add(_v.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(B.jit*sc*3));if(B.wob)p.addScaledVector(h.n,Math.sin(k*.9)*B.wob*sc*4);} // jitter shakes the line, ripple waves it
    const L=o.holder.worldToLocal(p);
    const prev=D.raw[D.raw.length-1];if(prev&&!h.snapped&&Math.hypot(L.x-prev.p[0],L.y-prev.p[1],L.z-prev.p[2])<D.r0*.35)return false;
    if(D.raw.length>=LIM.pts)return false;
    D.raw.push({p:[q4(L.x),q4(L.y),q4(L.z)],w:q4(Math.min(2.5,Math.max(.06,w)))});return true;
  }
  const ls=o=>o.holder.scale.x||1;
  function onMove(e){
    if(isDraw()&&B.mode!=='orbit'&&e.pointerType!=='touch'){const px=B.mode==='erase'||PEN.isEraser(e)?26:Math.max(6,B.size);ring.style.display='block';ring.style.left=e.clientX+'px';ring.style.top=e.clientY+'px';ring.style.width=ring.style.height=px+'px';}else ring.style.display='none';
    if(!drawing&&isDraw()&&B.mode==='draw'&&e.pointerType!=='touch'){const o=target();if(o&&B.snap!=='off'&&B.snap!=='grid'){const sn=snapAt(e,o);if(sn){snapEl.style.display='block';snapEl.style.left=sn.x+'px';snapEl.style.top=sn.y+'px';}else snapEl.style.display='none';}else snapEl.style.display='none';}
    const D=drawing;if(!D||e.pointerId!==D.pid&&D.pid!=null)return;
    if(D.erase){eraseAt(e);return;}
    const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];let added=false;
    for(const ev of (evs.length?evs:[e])){
      const extra=D.raw.length>10?[D.o.holder.localToWorld(new THREE.Vector3(...D.raw[0].p))]:null; // close a loop on your own start
      const h=hit(ev,D.o,D.plane,D.lastD,extra);if(!h)continue;D.lastD=h.d;
      const dpx=Math.hypot(ev.clientX-D.lastEv.x,ev.clientY-D.lastEv.y),dt=Math.max(1,ev.timeStamp-D.lastEv.t);D.lastEv={x:ev.clientX,y:ev.clientY,t:ev.timeStamp};
      if(addPoint(ev,h,dt,dpx))added=true;
    }
    if(added)liveSoon();
  }
  function onUp(e){
    const D=drawing;if(!D||(D.pid!=null&&e.pointerId!==D.pid))return;
    if(D.erase){drawing=null;if(D.changed)commit(D.o,D.o.meta.sigil.strokes.slice());return;}
    const st=D.o.meta.sigil;if(D.liveG){st.layer.remove(D.liveG);disposeG(D.liveG);}drawing=null;
    snapEl.style.display='none';
    if(B.line&&D.raw.length>2){D.raw=[D.raw[0],D.raw[D.raw.length-1]];} // straight line: keep just the ends
    if(D.raw.length>=1){const s=D.stroke();let ls2=null;const ly=layerOf(st,s.ly);
      if(!ly.plane&&B.plane!=='photo'){const n=D.plane.normal.clone().transformDirection(new THREE.Matrix4().copy(D.o.holder.matrixWorld).invert()),pp=D.o.holder.worldToLocal(D.plane.coplanarPoint(new THREE.Vector3()));ls2=cloneL(st.layers);ls2.find(l=>l.id===ly.id).plane={p:pp.toArray().map(q4),n:n.toArray().map(q4)};} // the layer remembers its plane: later strokes on it share the same depth
      commit(D.o,st.strokes.concat([s]),ls2);}
    bump();
  }
  function cancelDraw(){const D=drawing;if(!D)return;if(D.liveG){const st=D.o.meta.sigil;st.layer.remove(D.liveG);disposeG(D.liveG);}drawing=null;bump();}
  function eraseAt(e){
    const D=drawing,st=D.o.meta.sigil,rr=rayAt(e),hs=rr.intersectObjects(st.layer.children,true);
    const hh=hs.find(h=>{let g=h.object;while(g&&!g.userData.src)g=g.parent;const sc=g&&g.userData.src;return !sc||(layerOf(st,sc.ly).vis!==false&&!layerOf(st,sc.ly).lock);});
    if(hh)hs.splice(0,hs.length,hh);else hs.length=0;
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
    try{markAnchor();}catch(e){}try{setTimeout(()=>SG.guide(),0);}catch(e){}
    if(id==='draw'){S.pivot=false;S.gizmo=null;if(tc)tc.detach();canvas.style.cursor=B.mode==='orbit'?'grab':'crosshair';const o=target();if(o&&S.sel!==o.id)selectObj(o.id);paint();}
    else{canvas.style.cursor='';ring.style.display='none';cancelDraw();}
  };
  /* ---------- panel ---------- */
  let planeRow=null,infoEl=null,undoB=null,redoB=null,photoRow=null;
  function paint(){
    const o=target();
    if(infoEl)infoEl.textContent=o?(o.name+' · '+o.meta.sigil.strokes.length+' stroke'+(o.meta.sigil.strokes.length===1?'':'s')+(o.meta.sigil.photo?' · photo':'')):'Nothing yet. Draw to start.';
    if(undoB)undoB.disabled=!o||!o.meta.sigil.undo.length;if(redoB)redoB.disabled=!o||!o.meta.sigil.redo.length;
    paintLayers();SG.hooks.forEach(f=>{try{f();}catch(e){}});
    if(planeRow)planeRow.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',B.plane===c.dataset.v));
    if(photoRow)photoRow.querySelectorAll('[data-needs-photo]').forEach(b=>b.hidden=!(o&&o.meta.sigil.photo));
  }

  /* ---------- the drawing plane's anchor point, and layers ---------- */
  let anchorMesh=null,anchorBox=null,layerBox=null;
  function markAnchor(){
    if(!anchorMesh){anchorMesh=new THREE.Mesh(new THREE.OctahedronGeometry(.07),new THREE.MeshBasicMaterial({color:0xff5a1f,wireframe:true,depthTest:false,transparent:true}));anchorMesh.userData.noView=true;anchorMesh.renderOrder=999;scene.add(anchorMesh);}
    anchorMesh.visible=!!B.anchor&&isDraw();if(B.anchor)anchorMesh.position.set(...B.anchor);bump();paintAnchor();
  }
  function paintAnchor(){
    if(!anchorBox)return;anchorBox.innerHTML='';
    const T=(t)=>{const d=el('div','note');d.textContent=t;return d;};
    const r=el('div','chips');
    r.append(btn(B.pick?'Click a spot…':'Pick a point','pri',()=>{B.pick=!B.pick;canvas.style.cursor=B.pick?'cell':'crosshair';paintAnchor();}),btn('Use view centre','',()=>{B.anchor=controls.target.toArray().map(q4);markAnchor();}),btn('Clear','',()=>{B.anchor=null;B.pick=false;markAnchor();}));
    anchorBox.appendChild(r);
    if(B.anchor)['X','Y','Z'].forEach((a,i)=>sliderRow(anchorBox,a,()=>B.anchor[i],v=>{B.anchor[i]=v;markAnchor();},-10,10,.01));
    anchorBox.appendChild(T(B.anchor?'Screen, Wall and Floor drawing now go through this point. Type exact numbers by clicking a value.':'Pick a point, then Screen, Wall and Floor drawing go through it. Without one they use the view centre.'));
  }
  function layerCommit(o,mut){const st=o.meta.sigil,ls=cloneL(st.layers);mut(ls);commit(o,st.strokes.slice(),ls);}
  function paintLayersInto(layerBox){
    layerBox.innerHTML='';const o=target();if(!o){layerBox.appendChild(el('div','note','Draw something first.'));return;}
    const st=o.meta.sigil;
    st.layers.forEach((l,i)=>{
      const n=st.strokes.filter(s=>(s.ly||'L1')===l.id).length,row=el('div','orow');row.setAttribute('aria-selected',st.curL===l.id);
      const eye=el('button','',l.vis===false?'○':'◉');eye.title='Show or hide';eye.addEventListener('click',()=>layerCommit(o,a=>{a[i].vis=a[i].vis===false;}));
      const nm=el('button','nm',l.name+' · '+n);nm.title='Draw on this layer';nm.addEventListener('click',()=>{st.curL=l.id;paintLayers();});
      const lk=el('button','',l.lock?'🔒':'🔓');lk.title='Lock';lk.addEventListener('click',()=>layerCommit(o,a=>{a[i].lock=!a[i].lock;}));
      const bd=el('span','badge',l.plane?'depth set':'free');
      row.append(eye,nm,bd,lk);layerBox.appendChild(row);
    });
    const r=el('div','chips');
    r.append(btn('New layer','pri',()=>{let k=st.layers.length+1;while(st.layers.some(l=>l.id==='L'+k))k++;const id='L'+k;layerCommit(o,a=>a.push({id,name:'Layer '+k,vis:true,lock:false,plane:null}));st.curL=id;paintLayers();}),
      btn('Merge down','',()=>mergeDown(o)),btn('Reset depth','',()=>layerCommit(o,a=>{const l=a.find(x=>x.id===st.curL);if(l)l.plane=null;})),btn('Delete layer','',()=>delLayer(o)));
    layerBox.appendChild(r);
    const fl=document.createElement('label');fl.className='chip';fl.textContent='Flatten onto the lower layer’s depth ';const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!B.flatten;cb.addEventListener('change',()=>{B.flatten=cb.checked;});fl.appendChild(cb);layerBox.appendChild(fl);
    layerBox.appendChild(el('div','note','Each layer remembers the depth of its first stroke. Choose “Layer depth” under Draw on to keep adding to that same depth. Merge down joins this layer into the one below so they move and look as one.'));
  }
  function paintLayers(){[layerBox,SG.sLayers].forEach(b=>b&&paintLayersInto(b));}
  function mergeDown(o){
    const st=o.meta.sigil,i=st.layers.findIndex(l=>l.id===st.curL);if(i<=0){toast('This is the bottom layer. There is nothing below to merge into.');return;}
    const src=st.layers[i],dst=st.layers[i-1];
    const proj=(s)=>{ // flatten: slide every point onto the lower layer's plane
      if(!B.flatten||!dst.plane)return s;const n=new THREE.Vector3(...dst.plane.n).normalize(),pp=new THREE.Vector3(...dst.plane.p),pts=s.pts.slice(),v=new THREE.Vector3();
      for(let k=0;k<pts.length;k+=3){v.set(pts[k],pts[k+1],pts[k+2]);const d=v.clone().sub(pp).dot(n);v.addScaledVector(n,-d);pts[k]=q4(v.x);pts[k+1]=q4(v.y);pts[k+2]=q4(v.z);}
      return {...s,pts};};
    const strokes=st.strokes.map(s=>(s.ly||'L1')===src.id?{...proj(s),ly:dst.id}:s),ls=cloneL(st.layers).filter(l=>l.id!==src.id);
    st.curL=dst.id;commit(o,strokes,ls);toast('Merged “'+src.name+'” into “'+dst.name+'”');
  }
  function delLayer(o){
    const st=o.meta.sigil;if(st.layers.length<2){toast('A drawing needs at least one layer.');return;}
    const id=st.curL,strokes=st.strokes.filter(s=>(s.ly||'L1')!==id),ls=cloneL(st.layers).filter(l=>l.id!==id);st.curL=ls[Math.max(0,ls.findIndex(()=>true))].id;commit(o,strokes,ls);toast('Layer deleted. Undo brings it back.');
  }
  /* ---------- n0ise brand: noise-grain strip with the Sigil mark ---------- */
  function brand(parent){
    const b=el('div');b.style.cssText='position:relative;margin:0 0 12px;border:1px solid var(--n-line,#2a2927);border-radius:3px;overflow:hidden;background:#0a0a0a';
    const cv=document.createElement('canvas');cv.width=120;cv.height=40;cv.style.cssText='display:block;width:100%;height:72px;image-rendering:pixelated;opacity:.9';cv.setAttribute('aria-hidden','true');
    const lab=document.createElement('div');lab.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 14px;pointer-events:none;mix-blend-mode:normal';
    lab.innerHTML='<div style="font:600 9px var(--n-mono,ui-monospace,monospace);letter-spacing:.2em;color:#cfc9bd;text-shadow:0 1px 2px #000">N0ISE / SPATIAL FORM</div><div style="font:800 26px/1 var(--n-display,Syne,system-ui);letter-spacing:-.04em;color:#f2efe8;text-shadow:0 2px 6px #000">sigil<span style="color:#e9dfcb">.</span><span style="font:600 10px var(--n-mono,monospace);letter-spacing:.18em;margin-left:8px;color:#ff9b6b">02</span></div>';
    b.append(cv,lab);parent.appendChild(b);
    const g=cv.getContext('2d'),img=g.createImageData(120,40);let t=0,seed=7;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    function draw(){
      if(S.tab!=='draw'||document.hidden)return;
      const d=img.data;for(let y=0;y<40;y++)for(let x=0;x<120;x++){const i=(y*120+x)*4,n=rnd(),band=Math.sin((x*.07)+t*.9+Math.sin(y*.22+t)*1.4)*.5+.5,v=Math.min(255,(n*n*150+band*70)|0);
        const hot=n>.985?1:0;d[i]=hot?255:v;d[i+1]=hot?90:v*.92;d[i+2]=hot?31:v*.85;d[i+3]=255;}
      g.putImageData(img,0,0);t+=.18;
    }
    draw();setInterval(draw,120); // slow, low-res grain: costs almost nothing, and only runs while this tab is showing
  }
  SG.build=parent=>{
    paneHost=parent;const T=(t,s)=>{const d=el('div','note');d.textContent=t;if(s)d.style.cssText=s;return d;};
    brand(parent);
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
    planeRow=chipRow(s2,[['view','Screen'],['surface','Surface'],['layer','Layer depth'],['floor','Floor'],['wall','Wall'],['photo','Photo']],v=>B.plane===v,v=>{B.plane=v;});
    sliderRow(s2,'Screen depth',()=>B.off,v=>{B.off=v;},-4,4,.05,v=>(+v).toFixed(2));
    s2.appendChild(T('Screen: a plane facing you through the view centre. Surface: sticks to whatever is under the cursor. Strokes from different angles cross each other in real 3D.'));
    const sS=sec(parent,'Snap','connect lines');
    chipRow(sS,[['ends','Line ends'],['lines','Along lines'],['grid','Grid'],['off','Off']],v=>B.snap===v,v=>{B.snap=v;const o=target();if(o)o.meta.sigil.cand=null;});
    sliderRow(sS,'Snap reach',()=>B.snapPx,v=>{B.snapPx=v;},6,40,1,v=>Math.round(v)+' px');
    sliderRow(sS,'Grid size',()=>B.grid,v=>{B.grid=Math.max(.01,v);},.02,1,.01,v=>(+v).toFixed(2));
    sS.appendChild(T('An orange ring shows what the line will connect to. A new line that starts on a ring keeps that point\u2019s depth, so shapes join up exactly in 3D. Closing a loop on your own start works too.'));
    const sP=sec(parent,'Draw at a point','anchor');anchorBox=el('div');sP.appendChild(anchorBox);paintAnchor();
    const sL=sec(parent,'Layers','depth sheets');layerBox=el('div');sL.appendChild(layerBox);paintLayers();
    const s3=sec(parent,'Material');
    const grid=el('div');grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:6px';
    const sw={};
    for(const k in MATS){const b=el('button','chip');b.type='button';b.dataset.v=k;b.style.cssText='display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:5px;min-height:44px;text-align:left;font-size:11px';
      const i=document.createElement('i');i.style.cssText='display:block;height:22px;border-radius:5px;background:'+MATS[k][3]+';border:1px solid rgba(255,255,255,.12)';const t=document.createElement('span');t.textContent=MATS[k][0];b.append(i,t);
      b.setAttribute('aria-pressed',B.mat===k);b.addEventListener('click',()=>{B.mat=k;B.col=MATS[k][1];col.value=B.col;for(const x in sw)sw[x].setAttribute('aria-pressed',x===k);});sw[k]=b;grid.appendChild(b);}
    s3.appendChild(grid);
    const lab=document.createElement('label');lab.className='chip';lab.textContent='Colour ';const col=document.createElement('input');col.type='color';col.value=B.col;col.addEventListener('input',()=>{B.col=col.value;});lab.appendChild(col);
    const cr=el('div','chips');cr.append(lab,btn('Recolour last stroke','',()=>{const o=target();if(!o)return;const st=o.meta.sigil;if(!st.strokes.length)return;const a=st.strokes.slice(),l=a[a.length-1];a[a.length-1]={...l,...matOf()};commit(o,a);}),btn('Recolour all','',()=>{const o=target();if(!o||!o.meta.sigil.strokes.length)return;commit(o,o.meta.sigil.strokes.map(x=>({...x,...matOf()})));}));s3.appendChild(cr);
    const s4=sec(parent,'Symmetry');
    [['mirror','Mirror left and right'],['mirY','Mirror up and down'],['mirZ','Mirror front and back']].forEach(([k,n])=>chipRow(s4,[['0','Off'],['1',n]],v=>String(+!!B[k])===v,v=>{B[k]=v==='1';}));
    sliderRow(s4,'Spin copies',()=>B.rad,v=>{B.rad=Math.round(v);},1,16,1,v=>v<2?'Off':Math.round(v)+'×');
    chipRow(s4,[['0','Upright'],['1','Left axis'],['2','Front axis']],v=>String(B.rax||0)===v,v=>{B.rax=+v;});
    s4.appendChild(T('Mirror and spin combine. Spin turns copies around the chosen axis of the drawing.'));
    const s4b=sec(parent,'Hand','shake, ripple, wobble');
    sliderRow(s4b,'Shake',()=>B.jit,v=>{B.jit=v;},0,1,.05,v=>Math.round(v*100)+'%');
    sliderRow(s4b,'Ripple',()=>B.wob,v=>{B.wob=v;},0,1,.05,v=>Math.round(v*100)+'%');
    sliderRow(s4b,'Ink wobble',()=>B.wn,v=>{B.wn=v;},0,1,.05,v=>Math.round(v*100)+'%');
    chipRow(s4b,[['0','Freehand'],['1','Straight line']],v=>String(+B.line)===v,v=>{B.line=v==='1';});
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
  SG.projectItem=o=>{const st=o.meta.sigil,h=o.holder;return{kind:'sigil',name:o.name,tr:{p:h.position.toArray(),r:[h.rotation.x,h.rotation.y,h.rotation.z],s:h.scale.toArray()},vis:o.vis,strokes:st.strokes,layers:st.layers,hasPhoto:!!st.photo};};
  SG.photoOf=o=>o.meta.sigil.photo;
  SG.fromItem=(it,photoCv)=>{
    const o=create({name:it.name||'Drawing'});const st=o.meta.sigil;
    st.strokes=(it.strokes||[]).filter(s=>s&&Array.isArray(s.pts)&&Array.isArray(s.w)&&s.pts.length===s.w.length*3&&s.w.length<=LIM.pts&&s.pts.every(Number.isFinite)).slice(0,LIM.strokes).map(s=>{const mp=s.m==='custom'?cleanMP(s.mp):null;return {...s,m:mp?'custom':(MATS[s.m]?s.m:'chrome'),mp:mp||undefined};});
    if(Array.isArray(it.layers)&&it.layers.length)st.layers=it.layers.slice(0,32).map((l,i)=>({id:String(l.id||'L'+(i+1)).slice(0,12),name:String(l.name||'Layer '+(i+1)).slice(0,30),vis:l.vis!==false,lock:!!l.lock,plane:l.plane&&Array.isArray(l.plane.p)&&Array.isArray(l.plane.n)&&l.plane.p.every(Number.isFinite)&&l.plane.n.every(Number.isFinite)?{p:l.plane.p.slice(0,3),n:l.plane.n.slice(0,3)}:null}));
    st.curL=st.layers[0].id;st.revs.set(0,{s:st.strokes.slice(),l:cloneL(st.layers)});sync(o);if(photoCv)setPhoto(o,photoCv);
    o.holder.position.fromArray(it.tr.p);o.holder.rotation.set(...it.tr.r);o.holder.scale.fromArray(it.tr.s);o.vis=it.vis!==false;o.holder.visible=o.vis;
    return o;
  };
  SG.hooks=[];SG.tubeGeometry=tubeGeometry;SG.matOf=matOf;SG.markAnchor=markAnchor;SG.setMode=setMode;SG.cancelDraw=cancelDraw;SG.MATS=MATS;SG.makeMat=makeMat;SG.matProps=matProps;SG.paintLayers=paintLayers;SG.mergeDown=mergeDown;SG.layerCommit=layerCommit;SG.create=create;SG.undo=undo;SG.redo=redo;SG.setPhoto=setPhoto;SG.addPhotoFile=addPhotoFile;SG.paint=paint;SG.target=target;SG.sync=sync;SG.commit=commit;
  return SG;
}
