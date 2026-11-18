/* Material system: a procedural PBR material, like a small shader node graph with one node per socket. Every socket of the principled
   material (base colour, metallic, roughness, emission, bump, alpha) can stay as the object has it, be a constant, or be driven by a
   pattern node (noise, cracks, marble, wood, checker, rim, ...) that is shaded between two values. Patterns are 3D, computed from the
   object's own position, so they need no UV map and work on any mesh and on the rigged character. One shader is injected into whatever
   material the object already has (lighting, textures and the rig keep working); changing values only changes uniforms. */
import {chainKey} from './surface.js';
export const PATTERNS=[
  ['off','Keep as is'],['const','Value'],['noise','Noise'],['turb','Turbulence'],['cells','Cells'],['cracks','Cracks'],['patches','Patches'],['checker','Checker'],
  ['stripes','Stripes'],['waves','Waves'],['marble','Marble'],['wood','Wood rings'],['gradient','Gradient'],['radial','Radial'],['dots','Dots'],['grain','Grain'],['rim','Rim light'],['sparkle','Sparkle']
];
/* channel order matches the arrays in the shader */
export const CHANNELS=[
  {id:'base',label:'Base colour',type:'c'},{id:'metal',label:'Metallic',type:'s'},{id:'rough',label:'Roughness',type:'s'},
  {id:'emit',label:'Emission',type:'c'},{id:'bump',label:'Bump',type:'s'},{id:'alpha',label:'Opacity',type:'s'}
];
const CH0={p:'off',sc:1,det:3,dis:0,con:1,off:0};
export const defaultMat=()=>({
  base:{...CH0,a:'#cfc8bd',b:'#2a2a2e'},metal:{...CH0,a:0,b:1},rough:{...CH0,a:.25,b:.85},emit:{...CH0,a:'#000000',b:'#ff6a20'},
  bump:{...CH0,a:0,b:1},alpha:{...CH0,a:0,b:1},ek:1,bk:.6,flow:0
});
export function normMat(m){const d=defaultMat();if(!m)return d;for(const c of CHANNELS)d[c.id]={...d[c.id],...(m[c.id]||{})};['ek','bk','flow'].forEach(k=>{if(typeof m[k]==='number')d[k]=m[k];});return d;}
const P=(o)=>o;
export const PRESETS=[
  ['Chrome',P({base:{p:'const',a:'#d9dde3'},metal:{p:'const',a:1},rough:{p:'const',a:.05}})],
  ['Gold',P({base:{p:'const',a:'#e8b53c'},metal:{p:'const',a:1},rough:{p:'const',a:.25}})],
  ['Brushed steel',P({base:{p:'const',a:'#b9bcc2'},metal:{p:'const',a:1},rough:{p:'stripes',a:.22,b:.5,sc:9,con:2},bump:{p:'stripes',a:0,b:.25,sc:30,con:1}})],
  ['Marble',P({base:{p:'marble',a:'#f3f0ea',b:'#4b4752',sc:.7,det:5,dis:.15},rough:{p:'const',a:.18}})],
  ['Wood',P({base:{p:'wood',a:'#8f5d2c',b:'#4c2b12',sc:.8,dis:.1},rough:{p:'const',a:.55},bump:{p:'wood',a:0,b:.3,sc:.8}})],
  ['Lava',P({base:{p:'cracks',a:'#17100e',b:'#e9dfcb',sc:1.2,dis:.2},emit:{p:'cracks',a:'#000000',b:'#ff6a20',sc:1.2,dis:.2},ek:2.2,rough:{p:'const',a:.9},bump:{p:'noise',a:0,b:1,sc:2,det:5}})],
  ['Concrete',P({base:{p:'noise',a:'#6f6d69',b:'#a5a29b',sc:3,det:6},rough:{p:'const',a:.92},bump:{p:'noise',a:0,b:1,sc:6,det:6}})],
  ['Rubber',P({base:{p:'const',a:'#1b1b1e'},rough:{p:'const',a:.85},metal:{p:'const',a:0}})],
  ['Tinted glass',P({base:{p:'const',a:'#bfe6ff'},rough:{p:'const',a:.04},alpha:{p:'const',a:.35}})],
  ['Neon edge',P({base:{p:'const',a:'#0a0b0e'},rough:{p:'const',a:.3},emit:{p:'rim',a:'#000000',b:'#4fd8ff',sc:1.4,con:1.5},ek:2.5})],
  ['Scales',P({base:{p:'cells',a:'#1f5f4a',b:'#8fe0b0',sc:2.2,con:1.2},rough:{p:'const',a:.35},metal:{p:'const',a:.4},bump:{p:'cells',a:1,b:0,sc:2.2,con:1.4}})],
  ['Checker',P({base:{p:'checker',a:'#f2efe8',b:'#111114',sc:1.2},rough:{p:'const',a:.5}})],
  ['Moss',P({base:{p:'noise',a:'#1c3a14',b:'#6d9a3a',sc:4,det:6},rough:{p:'const',a:.95},bump:{p:'noise',a:0,b:1,sc:9,det:5}})],
  ['Glitter',P({base:{p:'const',a:'#5a2a8a'},metal:{p:'const',a:.6},rough:{p:'const',a:.3},emit:{p:'sparkle',a:'#000000',b:'#ffffff',sc:1.4},ek:1.6})]
];
const IDX=Object.fromEntries(PATTERNS.map((p,i)=>[p[0],i]));
const GLSL=`
uniform vec4 uMP[6],uMQ[6],uMK;uniform vec3 uMA[6],uMB[6],uMC;
varying vec3 vMP,vMW,vMNn;
float mh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float mn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(mh(i),mh(i+vec3(1.,0.,0.)),f.x),mix(mh(i+vec3(0.,1.,0.)),mh(i+vec3(1.,1.,0.)),f.x),f.y),
             mix(mix(mh(i+vec3(0.,0.,1.)),mh(i+vec3(1.,0.,1.)),f.x),mix(mh(i+vec3(0.,1.,1.)),mh(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
float mf(vec3 p,float det){float s=0.,a=.5,n=0.;for(int i=0;i<6;i++){if(float(i)>=det)break;s+=a*mn(p);n+=a;p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/max(n,.001);}
vec3 mv(vec3 p){vec3 i=floor(p),f=fract(p);float d1=8.,d2=8.,id=0.;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 g=vec3(float(x),float(y),float(z));vec3 o=vec3(mh(i+g),mh(i+g+17.3),mh(i+g+41.7));vec3 r=g+o-f;float d=dot(r,r);
    if(d<d1){d2=d1;d1=d;id=mh(i+g+7.1);}else if(d<d2)d2=d;}
  return vec3(sqrt(d1),sqrt(d2),id);}
vec3 mCh(int k,vec3 p0,vec3 q,float fr){
  vec4 P=uMP[k];int id=int(P.x+.5);vec3 A=uMA[k],B=uMB[k];
  if(id<=1)return A;
  vec4 Q=uMQ[k];vec3 p=p0*P.y;
  if(P.w>0.&&id!=12&&id!=13&&id!=16)p+=P.w*2.*(vec3(mn(p*.7+3.1),mn(p*.7+7.7),mn(p*.7+1.3))-.5);
  float v=0.;
  if(id==2)v=mf(p,P.z);
  else if(id==3)v=abs(2.*mf(p,P.z)-1.);
  else if(id==4)v=clamp(mv(p).x,0.,1.);
  else if(id==5){vec3 w=mv(p);v=1.-smoothstep(0.,.1,w.y-w.x);}
  else if(id==6)v=mv(p).z;
  else if(id==7){vec3 f=floor(p);v=mod(f.x+f.y+f.z,2.);}
  else if(id==8)v=.5+.5*sin(p.y*6.2832);
  else if(id==9)v=.5+.5*sin((p.y+p.x*.3)*6.2832+3.*mf(p*.5,max(P.z,2.)));
  else if(id==10)v=.5+.5*sin((p.x+p.y*.5)*3.14159+8.*mf(p*.5,max(P.z,3.)));
  else if(id==11){float r=length(p.xz)*1.5+1.2*mf(p*vec3(.3,2.,.3),3.);v=fract(r);}
  else if(id==12)v=clamp(.5+.5*q.y*P.y,0.,1.);
  else if(id==13)v=clamp(1.-length(q)*P.y*.7,0.,1.);
  else if(id==14){vec3 f=fract(p)-.5;v=1.-smoothstep(.28,.4,length(f));}
  else if(id==15)v=mh(floor(p*6.));
  else if(id==16)v=clamp(fr*P.y,0.,1.);
  else if(id==17)v=step(.93,mh(floor(p*10.)+floor(vec3(uMK.w*8.))));
  v=clamp((v-.5)*Q.x+.5+Q.y,0.,1.);
  return mix(A,B,v);
}`;
const V_COMMON='vMP=position;vMW=(modelMatrix*vec4(transformed,1.)).xyz;vMNn=normalize(mat3(modelMatrix)*normal);';
const NEED=['#include <project_vertex>','#include <color_fragment>','#include <alphamap_fragment>','#include <roughnessmap_fragment>','#include <metalnessmap_fragment>','#include <normal_fragment_maps>','#include <emissivemap_fragment>'];
export function createMaterials(c){
  const {THREE,S}=c;
  const meshes=o=>{const out=[];o.holder.traverse(n=>{if(n.isMesh&&!n.isSplatMesh&&n.geometry&&n.material&&!(n.userData&&n.userData.noView))out.push(n);});return out;};
  const keyed=m=>{const u=m.userData;return u;};
  function extent(o){
    const b=new THREE.Box3();let any=false;
    meshes(o).forEach(n=>{if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();if(n.geometry.boundingBox){b.union(n.geometry.boundingBox);any=true;}});
    if(!any){return {c:new THREE.Vector3(),size:1};}
    const s=b.getSize(new THREE.Vector3()),m=Math.max(s.x,s.y,s.z,1e-4);return {c:b.getCenter(new THREE.Vector3()),size:m};
  }
  function hook(o){
    if(o.matU)return o.matU;
    const U={uMP:{value:Array.from({length:6},()=>new THREE.Vector4())},uMQ:{value:Array.from({length:6},()=>new THREE.Vector4(1,0,0,0))},
      uMA:{value:Array.from({length:6},()=>new THREE.Vector3())},uMB:{value:Array.from({length:6},()=>new THREE.Vector3())},uMK:{value:new THREE.Vector4(1,.1,1,0)},uMC:{value:new THREE.Vector3()}};
    o.matU=U;o.matMats=[];
    meshes(o).forEach(n=>{
      const list=Array.isArray(n.material)?n.material:[n.material];
      const next=list.map(m=>{
        if(m.isShaderMaterial||m.isRawShaderMaterial||!m.isMaterial)return m;
        let mm=m;
        if(m.userData.matOwner!=null&&m.userData.matOwner!==o.id){mm=m.clone();mm.onBeforeCompile=m.onBeforeCompile;mm.userData={...m.userData};}
        mm.userData.matOwner=o.id;
        const prev=mm.onBeforeCompile;
        mm.onBeforeCompile=(sh,r)=>{
          if(prev&&prev!==mm.onBeforeCompile)prev(sh,r);
          Object.assign(sh.uniforms,U);
          if(!NEED.every(k=>sh.vertexShader.includes(k)||sh.fragmentShader.includes(k))){o.matUnsupported=true;return;}
          sh.vertexShader='varying vec3 vMP,vMW,vMNn;\n'+sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n'+V_COMMON);
          let f=sh.fragmentShader;
          const after=(k,code)=>{f=f.replace(k,k+'\n'+code);};
          after('#include <color_fragment>','vec3 mQ_=(vMP-uMC)*uMK.z*2.;vec3 mP_=mQ_*2.+vec3(0.,uMK.w*.3,0.);float mFr_=pow(1.-abs(dot(normalize(vMNn),normalize(cameraPosition-vMW))),2.);\nif(uMP[0].x>.5)diffuseColor.rgb=mCh(0,mP_,mQ_,mFr_);');
          after('#include <alphamap_fragment>','if(uMP[5].x>.5)diffuseColor.a*=mCh(5,mP_,mQ_,mFr_).r;');
          after('#include <roughnessmap_fragment>','if(uMP[2].x>.5)roughnessFactor=clamp(mCh(2,mP_,mQ_,mFr_).r,.03,1.);');
          after('#include <metalnessmap_fragment>','if(uMP[1].x>.5)metalnessFactor=clamp(mCh(1,mP_,mQ_,mFr_).r,0.,1.);');
          after('#include <normal_fragment_maps>','if(uMP[4].x>.5){float mH_=mCh(4,mP_,mQ_,mFr_).r*uMK.y;vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);float dhx=dFdx(mH_),dhy=dFdy(mH_);vec3 r1=cross(dpy,normal),r2=cross(normal,dpx);float det=dot(dpx,r1);vec3 gr=sign(det)*(dhx*r1+dhy*r2);normal=normalize(abs(det)*normal-gr);}');
          after('#include <emissivemap_fragment>','if(uMP[3].x>.5)totalEmissiveRadiance=mCh(3,mP_,mQ_,mFr_)*uMK.x;');
          sh.fragmentShader=GLSL+'\n'+f;
        };
        chainKey(mm,'mat',()=>mm.uuid);
        o.matMats.push(mm);mm.needsUpdate=true;return mm;
      });
      n.material=Array.isArray(n.material)?next:next[0];
    });
    const e=extent(o);U.uMC.value.copy(e.c);U.uMK.value.z=1/e.size;o.matSize=e.size;
    return U;
  }
  const col=new THREE.Color();
  function push(o){
    const d=o.mat,U=o.matU;if(!d||!U)return;
    CHANNELS.forEach((ch,i)=>{
      const s=d[ch.id],id=IDX[s.p]||0;
      U.uMP.value[i].set(id,s.sc,s.det,s.dis);U.uMQ.value[i].set(s.con,s.off,0,0);
      if(ch.type==='c'){col.set(s.a);U.uMA.value[i].set(col.r,col.g,col.b);col.set(s.b);U.uMB.value[i].set(col.r,col.g,col.b);}
      else{U.uMA.value[i].setScalar(+s.a||0);U.uMB.value[i].setScalar(+s.b||0);}
    });
    U.uMK.value.x=d.ek;
    const tr=d.alpha.p!=='off';
    (o.matMats||[]).forEach(m=>{if(m.transparent!==tr){m.transparent=tr;m.needsUpdate=true;}});
  }
  function set(o,def){
    if(!o)return null;
    o.mat=normMat(def);
    if(!o.matU)hook(o);
    push(o);return o.mat;
  }
  function clear(o){
    if(!o||!o.mat)return;
    delete o.mat;
    if(o.matU){for(let i=0;i<6;i++)o.matU.uMP.value[i].x=0;(o.matMats||[]).forEach(m=>{if(m.transparent){m.transparent=false;m.needsUpdate=true;}});}
  }
  let lt=0,flow=0;
  return {PATTERNS,CHANNELS,PRESETS,set,clear,push,defaultMat,normMat,
    tick(t){const dt=Math.max(0,Math.min(.2,t-lt));lt=t;
      for(const o of S.objs){if(!o.mat||!o.matU)continue;const d=o.mat;o.matFlow=(o.matFlow||0)+dt*d.flow;
        const ws=(o.matSize||1)*(o.holder.scale.x||1);o.matU.uMK.value.w=o.matFlow;o.matU.uMK.value.y=d.bk*ws*.05;}},
    any(){return S.objs.some(o=>o.mat);}};
}
