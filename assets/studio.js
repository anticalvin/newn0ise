var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/studio3d.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// src/engine.js
var engine_exports = {};
__export(engine_exports, {
  $: () => $,
  B: () => B,
  BASE: () => BASE,
  C: () => C,
  CHAINS: () => CHAINS,
  CPU: () => CPU,
  CT: () => CT,
  CTL: () => CTL,
  CTX: () => CTX,
  E: () => E,
  EMB: () => EMB,
  EMBED: () => EMBED,
  EVT: () => EVT,
  F_BLUR: () => F_BLUR,
  F_BRIGHT: () => F_BRIGHT,
  F_COPY: () => F_COPY,
  F_CRT: () => F_CRT,
  F_FINAL: () => F_FINAL,
  F_GLITCH: () => F_GLITCH,
  F_ORIG: () => F_ORIG,
  F_PAINT: () => F_PAINT,
  F_PERSIST: () => F_PERSIST,
  F_QUANT: () => F_QUANT,
  F_SIGA: () => F_SIGA,
  F_SIGB: () => F_SIGB,
  F_TONE: () => F_TONE,
  GLOK: () => GLOK,
  HEAD: () => HEAD,
  KER: () => KER,
  KF: () => KF,
  LOOKKEYS: () => LOOKKEYS,
  MACROS: () => MACROS,
  METHOD_ID: () => METHOD_ID,
  MODS: () => MODS,
  P: () => P,
  PAINTQ: () => PAINTQ,
  PALS: () => PALS,
  PHOS_COL: () => PHOS_COL,
  POINTER: () => POINTER,
  POOL: () => POOL,
  PR: () => PR,
  PROFILES: () => PROFILES,
  PROTECT: () => PROTECT,
  R: () => R,
  RB: () => RB,
  SRC: () => SRC,
  ST: () => ST,
  STAGES: () => STAGES,
  SZ: () => SZ,
  T: () => T,
  TABS: () => TABS,
  TEX: () => TEX,
  V: () => V,
  VS: () => VS,
  VS_PAINT: () => VS_PAINT,
  _hw: () => _hw,
  _ro: () => _ro,
  adaptQ: () => adaptQ,
  applyProfile: () => applyProfile,
  applyStages: () => applyStages,
  attachGL: () => attachGL,
  audio: () => audio,
  bayer: () => bayer,
  bindRT: () => bindRT,
  blueNoise: () => blueNoise,
  buildChainUI: () => buildChainUI,
  canvas: () => canvas,
  clamp: () => clamp,
  compile: () => compile,
  computeE: () => computeE,
  cpuProcess: () => cpuProcess,
  cpuSync: () => cpuSync,
  createGL: () => createGL,
  curPal: () => curPal,
  demoCanvas: () => demoCanvas,
  diffuse: () => diffuse,
  draw: () => draw,
  ensureTargets: () => ensureTargets,
  expDims: () => expDims,
  exportCap: () => exportCap,
  finishLive: () => finishLive,
  fitCanvas: () => fitCanvas,
  freeRT: () => freeRT,
  gl: () => gl,
  hardware: () => hardware,
  hexRGB: () => hexRGB,
  hooks: () => hooks,
  initGL: () => initGL,
  initLUT: () => initLUT,
  kern: () => kern,
  layout: () => layout,
  lerp: () => lerp,
  lifeStep: () => lifeStep,
  lum255: () => lum255,
  mkProg: () => mkProg,
  mkProgAsync: () => mkProgAsync,
  mkRT: () => mkRT,
  mkTex: () => mkTex,
  mulberry: () => mulberry,
  noGL: () => noGL,
  noise1: () => noise1,
  paintBuf: () => paintBuf,
  peakFps: () => peakFps,
  pool: () => pool,
  powerShape: () => powerShape,
  r8tex: () => r8tex,
  readDrop: () => readDrop,
  readFinish: () => readFinish,
  readStart: () => readStart,
  refreshChainUI: () => refreshChainUI,
  renderFrame: () => renderFrame,
  rgbHex: () => rgbHex,
  samp: () => samp,
  setSource: () => setSource,
  srcDims: () => srcDims,
  sstep: () => sstep,
  stage: () => stage,
  stageModel: () => stageModel,
  syncSrc: () => syncSrc,
  testCanvas: () => testCanvas,
  tex: () => tex,
  textCtx: () => textCtx,
  textCv: () => textCv,
  updateText: () => updateText,
  uploadSrc: () => uploadSrc,
  vaoEmpty: () => vaoEmpty,
  vaoPaint: () => vaoPaint,
  wrapProg: () => wrapProg
});
var V = { sizeKey: "", pIdx: 0, frameNo: 0, lastBKey: "", fps: 60, fpsAcc: 0, fpsN: 0, infoStr: "", lastT: 0, lastRenderMs: 0, errN: 0, DEAD: false, HDR: false, palCache: { key: "", v: null }, textKey: "" };
var hooks = { AUD: { on: false }, stopAudio() {
}, group() {
}, el() {
}, chipRow() {
}, snap() {
}, refreshUI() {
}, stepGif() {
}, audFrame() {
} };
var VS = `#version 300 es
out vec2 vUv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
var HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
const float PI=3.14159265;
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec2 h22(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);return fract((q.xx+q.yz)*q.zy);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 rgb2yiq(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(.5959,-.2746,-.3213)),dot(c,vec3(.2115,-.5227,.3112)));}
vec3 yiq2rgb(vec3 y){return vec3(y.x+.956*y.y+.621*y.z,y.x-.272*y.y-.647*y.z,y.x-1.106*y.y+1.703*y.z);}
vec3 hueRot(vec3 c,float a){vec3 y=rgb2yiq(c);float cs=cos(a),sn=sin(a);y.yz=vec2(y.y*cs-y.z*sn,y.y*sn+y.z*cs);return yiq2rgb(y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float vn3(vec3 p){float z=floor(p.z),fz=fract(p.z);fz=fz*fz*(3.-2.*fz);return mix(vnoise(p.xy+z*17.13),vnoise(p.xy+(z+1.)*17.13),fz);}
`;
var F_TONE = HEAD + `
uniform sampler2D uSrc;
uniform float uSrcAsp,uScrAsp,uSpread,uBlur,uSharp,uEdge,uBright,uContrast,uMid,uHigh,uSat,uHue,uInv;
uniform vec2 uTexel;
vec2 cover(vec2 uv){float r=uScrAsp/uSrcAsp;vec2 s=r>1.?vec2(1.,1./r):vec2(r,1.);return (uv-.5)*s+.5;}
void main(){
  vec2 uv=cover(vUv);
  float sp=max(uSpread,.5);
  vec3 c=vec3(0.);float w=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    float ww=(i==0&&j==0)?2.:1.;
    c+=ww*texture(uSrc,uv+vec2(float(i),float(j))*sp*uTexel).rgb;w+=ww;
  }
  c/=w;
  float rr=sp*(2.+uBlur*1.5);
  vec3 ring=vec3(0.);
  for(int k=0;k<8;k++){float a=float(k)*.785398;ring+=texture(uSrc,uv+vec2(cos(a),sin(a))*rr*uTexel).rgb;}
  ring/=8.;
  c=mix(c,ring,clamp(uBlur*.2,0.,1.));
  c+=uSharp*.35*(c-ring);
  if(uEdge>.001){
    vec2 d=sp*uTexel;
    float e=abs(lum(texture(uSrc,uv+vec2(d.x,0.)).rgb)-lum(texture(uSrc,uv-vec2(d.x,0.)).rgb))
           +abs(lum(texture(uSrc,uv+vec2(0.,d.y)).rgb)-lum(texture(uSrc,uv-vec2(0.,d.y)).rgb));
    c=mix(c,vec3(clamp(e*3.,0.,1.)),uEdge);
  }
  c=hueRot(c,uHue);
  float l0=lum(c);c=vec3(l0)+(c-l0)*uSat;
  c+=uBright;c=(c-.5)*uContrast+.5;c=clamp(c,0.,1.);
  c=pow(c,vec3(uMid));
  c+=uHigh*smoothstep(.4,1.,c);c=clamp(c,0.,1.);
  if(uInv>.5)c=1.-c;
  o=vec4(c,1.);
}`;
var F_QUANT = HEAD + `
uniform sampler2D uTone,uBay4,uBay8,uBlue;
uniform int uMethod,uPalN,uPalMode;
uniform float uLv[16];
uniform float uLo,uSpan,uDepth,uStr,uBias,uCell;
uniform vec2 uOff,uGrid;
float thrM(vec2 q){
  vec2 p=q+uOff;
  if(uMethod==1)return .5;
  if(uMethod==2)return texelFetch(uBay4,ivec2(mod(p,4.)),0).r;
  if(uMethod==3)return texelFetch(uBay8,ivec2(mod(p,8.)),0).r;
  if(uMethod==4)return texelFetch(uBlue,ivec2(mod(p,64.)),0).r;
  if(uMethod==5)return h21(p);
  vec2 r=mat2(.70711,-.70711,.70711,.70711)*q/uCell;
  vec2 f=fract(r)-.5;
  return clamp(length(f)*1.41421,0.,1.);
}
void main(){
  vec3 c=texture(uTone,vUv).rgb;
  vec2 p=floor(vUv*uGrid);
  if(uMethod==0){
    if(uPalMode==1)o=vec4(0.,0.,0.,clamp(lum(c),0.,1.));else o=vec4(c,1.);
    return;
  }
  float adj=(.5-thrM(p))*uStr+uBias;
  if(uPalMode==1){
    float sp=uSpan/max(float(uPalN-1),1.);
    float x=uLo+lum(c)*uSpan+adj*sp;
    int b=0;float bd=1e9;
    for(int i=0;i<16;i++){
      if(i>=uPalN)break;
      float d=abs(x-uLv[i]);
      if(d<bd){bd=d;b=i;}
    }
    o=vec4(0.,0.,0.,float(b)/255.);
  }else{
    float k=uDepth-1.;
    vec3 v=floor((c+adj/k)*k+.5)/k;
    o=vec4(clamp(v,0.,1.),1.);
  }
}`;
var F_GLITCH = HEAD + `
uniform sampler2D uQ,uPrev,uText;
uniform vec2 uGrid;
uniform vec3 uPal[16];
uniform int uPalN,uPalMode,uInterp,uWAx,uWSh,uTextOn;
uniform float uCyc,uLines,uTime,uGT,uSeed,uAct,uAsp;
uniform float uRgb,uTear,uSline,uBlock,uDrag,uBand,uInvc,uBurst,uCrush;
uniform float uWA,uWF,uWS,uWFM,uWFMR,uWAM,uWAMR,uWPH,uW2,uW2F,uScope;
uniform float uFbg,uFbz,uFbr,uFbx,uFby,uFbh;
vec3 palAt(float pos){
  float n=float(uPalN);
  pos=mod(pos,n);
  int i0=int(floor(pos));int i1=i0+1;if(i1>=uPalN)i1=0;
  return mix(uPal[i0],uPal[i1],fract(pos));
}
vec3 samp(vec2 uv){
  uv=clamp(uv,vec2(.0005),vec2(.9995));
  vec4 t=texture(uQ,uv);
  if(uPalMode==1){
    float n=float(uPalN);
    if(uInterp==1)return palAt(t.a*(n-1.)+uCyc);
    return palAt(floor(t.a*255.+.5)+floor(uCyc));
  }
  return t.rgb;
}
float wv(float x,int sh){
  float f=fract(x);
  if(sh==0)return sin(x*6.2831853);
  if(sh==1)return 1.-4.*abs(f-.5);
  if(sh==2)return f<.5?1.:-1.;
  return 2.*f-1.;
}
float waveN(float c,float t){
  float ph=c*uWF+t*uWS;
  ph+=uWPH*sin(c*3.1+t*.7)*2.;
  ph+=uWFM*sin(c*uWFMR+t*1.3)*3.;
  float am=1.+uWAM*(sin(c*uWAMR+t*.9)-1.)*.5;
  return (wv(ph,uWSh)+uW2*wv(c*uW2F+t*uWS*1.3,0))*am/(1.+uW2);
}
void main(){
  vec2 uv=vUv;float t=uTime;
  float ev=floor(uGT*(2.+uAct*10.));
  float sd=uSeed*1.37;
  if(uWA>.0001){
    if(uWAx==0||uWAx==2)uv.x+=waveN(uv.y,t)*uWA;
    if(uWAx==1||uWAx==2)uv.y+=waveN(uv.x,t+1.7)*uWA;
  }
  if(uTear>.001){
    float nb=mix(6.,18.,h11(ev+sd));float b=floor(uv.y*nb);
    if(h21(vec2(b,ev+sd))<uAct*.5*uTear+.02*uTear)uv.x+=(h21(vec2(b+3.1,ev+sd))-.5)*.5*uTear;
  }
  if(uSline>.001){
    float row=floor(uv.y*uLines);
    if(h21(vec2(row,floor(uGT*14.)+sd))<uAct*.35*uSline)uv.x+=(h21(vec2(row,ev+9.))-.5)*.25*uSline;
  }
  if(uBlock>.001){
    vec2 cell=floor(uv*vec2(14.,9.));
    if(h21(cell+vec2(ev,sd))<uAct*.2*uBlock+.01*uBlock)uv+=(h22(cell+ev)-.5)*.35*uBlock;
  }
  vec3 c;
  if(uDrag>.001){
    float row=floor(uv.y*uGrid.y/4.);
    float gate=step(h21(vec2(row,ev+sd)),uAct*.6+.1);
    float len=uDrag*.35*gate;
    c=samp(uv);float best=lum(c);
    for(int i=1;i<=14;i++){
      vec3 s=samp(uv-vec2(float(i)/14.*len,0.));
      float l=lum(s);
      if(l>best){best=l;c=s;}
    }
  }else c=samp(uv);
  if(uRgb>.001){
    float a=h11(ev*1.7+sd)*6.2832;
    vec2 d=vec2(cos(a),sin(a))*uRgb*.03*(.3+.7*h11(ev+sd+4.));
    c.r=samp(uv+d).r;c.b=samp(uv-d).b;
  }
  if(uBand>.001){
    float b=floor(uv.y*mix(8.,40.,h11(ev+sd+1.)));
    if(h21(vec2(b,ev+sd+2.))<uAct*.4*uBand+.03*uBand){
      c=hueRot(c,(h21(vec2(b,ev))*2.-1.)*PI);
      if(h21(vec2(b,3.))>.5)c=c.gbr;
    }
  }
  if(uInvc>.001){
    float b=floor(uv.y*mix(5.,20.,h11(ev+sd+8.)));
    if(h21(vec2(b,ev+sd+5.))<uAct*.25*uInvc)c=1.-c;
  }
  if(uBurst>.001){
    vec2 cell=floor(vUv*vec2(30.,18.));
    if(h21(cell+vec2(ev*3.,sd))<uAct*.12*uBurst){
      vec2 q=vUv*uGrid+ev;
      c=mix(c,vec3(h21(q),h21(q+3.),h21(q+7.)),.9);
    }
  }
  if(uCrush>.001){
    vec2 bp=floor(uv*uGrid/8.);
    vec3 bc=samp((bp*8.+4.)/uGrid);
    float q=mix(32.,3.,uCrush);
    c=mix(c,bc,uCrush*.55);c=floor(c*q+.5)/q;c+=(h21(bp+ev)-.5)*.08*uCrush;
  }
  if(uFbg>.001){
    vec2 p=vUv-.5;p.x*=uAsp;
    float cs=cos(uFbr),sn=sin(uFbr);
    p=vec2(p.x*cs-p.y*sn,p.x*sn+p.y*cs);
    p/=(1.+uFbz);p.x/=uAsp;p+=vec2(uFbx,uFby);
    vec3 pr=hueRot(texture(uPrev,p+.5).rgb,uFbh);
    c+=pr*uFbg;
  }
  c=min(c,vec3(2.));
  if(uTextOn==1){vec4 tx=texture(uText,vUv);c=mix(c,tx.rgb,tx.a);}
  if(uScope>.001){
    float y=.5+.28*waveN(vUv.x,t+1.7);
    c+=vec3(.55,1.,.7)*smoothstep(.006,.0,abs(vUv.y-y))*uScope;
  }
  o=vec4(c,1.);
}`;
var F_SIGA = HEAD + `
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform int uFrame,uStd;
uniform float uTime,uSeed,uPer,uSL,uSC,uYC,uSnr,uCoh,uSnow,uGhost,uGD,uJit,uDrift,uTrk,uHsw,uDrop,uClip,uCsat,uPhase,uRG,uGS,uGDec,uTJ;
void main(){
  float W=uRes.x,L=uRes.y;
  float ln=floor(vUv.y*L);
  float x0=vUv.x*W;
  float t=uTime;
  float fr=floor(t*30.);
  float off=(h21(vec2(ln,fr+uSeed))-.5)*2.*uJit;
  off+=sin(ln*.045+t*1.7+uSeed)*uDrift+sin(ln*.011-t*.6)*uDrift*1.5;
  float tb=fract(t*.09+h11(uSeed)+(h11(floor(t*6.)+uSeed)-.5)*uTJ*.12);
  float dty=abs(vUv.y-tb);dty=min(dty,1.-dty);
  float inTrk=smoothstep(.07,0.,dty)*uTrk;
  off+=inTrk*((h21(vec2(ln,fr))-.5)*60.+sin(ln*.3+t*40.)*30.);
  off+=smoothstep(.12,0.,dty)*uTJ*(h21(vec2(ln*.1,fr))-.5)*50.;
  float hs=smoothstep(.045,0.,vUv.y)*uHsw;
  off+=hs*(sin(ln*1.7+t*20.)*40.+(h21(vec2(ln,fr+5.))-.5)*40.);
  float fl=mod(float(uFrame),2.);
  float lp=(uStd==0)?PI*(mod(ln,2.)+fl):.5*PI*mod(float(uFrame),4.);
  float sg=(uStd==1)?((mod(ln,2.)<1.)?1.:-1.):1.;
  float pj=(h21(vec2(ln,fr+9.))-.5)*uJit*.02;
  float sL=max(uSL,.35),sC=max(uSC,.6);
  float aY=0.,aI=0.,aQ=0.,wy=0.,wc=0.;
  float hiC=mix(2.2,1.,uClip),loC=mix(-2.2,-.1,uClip);
  for(int k=-9;k<=9;k++){
    float dx=float(k);
    float xs=x0+dx+off;
    vec2 uv=vec2(xs/W,vUv.y);
    vec3 c=texture(uSrc,uv).rgb;
    if(uGhost>.001){c+=texture(uSrc,vec2((xs-uGD)/W,vUv.y)).rgb*uGhost*.6;}
    if(uRG>.001){for(int gi=1;gi<=4;gi++){float gf=float(gi);c+=texture(uSrc,vec2((xs-uGD-uGS*(gf-1.))/W,vUv.y)).rgb*uRG*.5*pow(uGDec,gf)*(mod(gf,2.)>.5?1.:-1.);}}
    vec3 q=rgb2yiq(c);
    float ph=6.2831853*xs/uPer+lp;
    float sig=q.x+uCsat*(q.y*cos(ph)+q.z*sg*sin(ph));
    if(uSnr>.001||uSnow>.001){
      float fx=floor(xs);
      float nw=h21(vec2(fx,ln+fr*7.1+uSeed));
      float n=nw;
      if(uCoh>.001)n=mix(nw,vn3(vec3(xs*.15,ln*.8,t*3.)),uCoh);
      sig+=(n-.5)*uSnr*2.4;
      sig+=step(1.-uSnow*.12,h21(vec2(fx+3.,ln+fr+uSeed)))*uSnow*1.2;
    }
    sig=clamp(sig,loC,hiC);
    float wL=exp(-dx*dx/(2.*sL*sL)),wC=exp(-dx*dx/(2.*sC*sC));
    float phd=ph-uPhase*sg*(uStd==1?1.:1.)-pj;
    aY+=sig*wL;wy+=wL;
    aI+=sig*cos(phd)*wC;aQ+=sig*sin(phd)*wC;wc+=wC;
  }
  float Yl=aY/wy,Ci=2.*aI/wc,Cq=2.*aQ/wc;
  float ph0=6.2831853*(x0+off)/uPer+lp-uPhase*sg-pj;
  float att=exp(-2.*PI*PI*sL*sL/(uPer*uPer));
  float Y=Yl-uYC*att*(Ci*cos(ph0)+Cq*sin(ph0));
  float I=Ci,Q=Cq*sg;
  if(uDrop>.001){
    float ev=floor(t*24.);
    float r=h21(vec2(ln,ev+uSeed*3.));
    if(r<uDrop*.035){
      float s=h21(vec2(ln,ev+11.))*W,len=20.+h21(vec2(ln,ev+13.))*180.;
      if(x0>s&&x0<s+len){Y=mix(Y,1.,.92);I*=.2;Q*=.2;}
    }
  }
  o=vec4(Y,I*.8+.5,Q*.8+.5,1.);
}`;
var F_SIGB = HEAD + `
uniform sampler2D uY;
uniform vec2 uRes;
uniform float uTau,uStep,uRing,uGenBlur,uPop;
void main(){
  vec3 c0=texture(uY,vUv).rgb;
  float Y=c0.x;
  vec2 iq=vec2(0.);float w=0.;
  for(int k=0;k<14;k++){
    float ww=exp(-float(k)/max(uTau,.01));
    vec3 s=texture(uY,vUv-vec2(float(k)*uStep/uRes.x,0.)).rgb;
    iq+=(s.yz-.5)/.8*ww;w+=ww;
  }
  iq/=w;
  float Ya=texture(uY,vUv+vec2(2./uRes.x,0.)).x,Yb=texture(uY,vUv-vec2(2./uRes.x,0.)).x;
  Y+=uRing*(Y-.5*(Ya+Yb));
  Y=mix(Y,.5*(Ya+Yb),uGenBlur);
  float cm=length(iq);iq*=1.+uPop*1.6*smoothstep(.12,.45,cm);
  vec3 rgb=yiq2rgb(vec3(Y,iq));
  o=vec4(clamp(rgb,-.1,1.6),1.);
}`;
var F_CRT = HEAD + `
uniform sampler2D uSig;
uniform vec2 uRes,uHwGeo;
uniform vec3 uWhite,uGain,uHwConv;
uniform int uMask,uPhos;uniform vec3 uPT;uniform float uPTA;
uniform float uLines,uTime,uSeed,uField,uInter,uIflk;
uniform float uCurv,uCorner,uOver,uConvS,uConvE,uCdrift,uAging;
uniform float uSX,uSY,uGainP,uDegT,uRoll,uRollAmt;
uniform float uScan,uBeamMin,uBeamGrow,uSpot,uEfoc;
uniform float uMStr,uMPitch,uMSoft,uMGap;
uniform float uBlk,uGam,uCon,uBri,uSati;
vec2 warp(vec2 uv){
  vec2 p=uv*2.-1.;
  p.x/=max(uSX,1e-4);p.y/=max(uSY,1e-4);
  p.x+=p.y*uHwGeo.x*uAging*.04;p.y+=p.x*uHwGeo.y*uAging*.03;
  p.x*=1.+uCdrift*.04*sin(uTime*.31+uSeed);p.y*=1.+uCdrift*.04*sin(uTime*.23+uSeed*2.);
  p+=uCdrift*.015*vec2(sin(uTime*.17),cos(uTime*.21));
  if(uDegT<2.){float a=.035*exp(-uDegT*2.2);float r=length(p);p+=a*vec2(sin(r*14.-uDegT*40.),cos(r*14.-uDegT*40.));}
  p*=vec2(1.+p.y*p.y*uCurv*.12,1.+p.x*p.x*uCurv*.16);
  p*=1.-uOver;
  return p;
}
float screenMask(vec2 p){
  float cr=max(uCorner*.25,.002);
  vec2 q=abs(p)-(1.-cr);
  float d=length(max(q,0.))+min(max(q.x,q.y),0.)-cr;
  float fw=2./min(uRes.x,uRes.y);
  return 1.-smoothstep(-fw,fw,d);
}
vec3 fetchLine(float ln,float x,vec3 cx,float sp){
  float v=(clamp(ln,0.,uLines-1.)+.5)/uLines;
  vec3 c;
  c.r=.25*texture(uSig,vec2(x+cx.r-sp,v)).r+.5*texture(uSig,vec2(x+cx.r,v)).r+.25*texture(uSig,vec2(x+cx.r+sp,v)).r;
  c.g=.25*texture(uSig,vec2(x+cx.g-sp,v)).g+.5*texture(uSig,vec2(x+cx.g,v)).g+.25*texture(uSig,vec2(x+cx.g+sp,v)).g;
  c.b=.25*texture(uSig,vec2(x+cx.b-sp,v)).b+.5*texture(uSig,vec2(x+cx.b,v)).b+.25*texture(uSig,vec2(x+cx.b+sp,v)).b;
  return c;
}
vec3 subpx(float ph,float soft,float thr){
  vec3 d=vec3(abs(ph-.5),abs(ph-1.5),abs(ph-2.5));
  return 1.-smoothstep(vec3(thr-.3*soft),vec3(thr+.3*soft+.001),d);
}
vec3 maskAt(vec2 fc){
  float pitch=uMPitch,thr=.5-.3*uMGap;
  vec3 m;
  if(uMask==1){
    m=subpx(fract(fc.x/pitch)*3.,uMSoft,thr);
  }else if(uMask==2){
    float rh=pitch*1.1,row=floor(fc.y/rh);
    m=subpx(fract((fc.x+mod(row,2.)*pitch*.5)/pitch)*3.,uMSoft,thr);
    m*=1.-smoothstep(.28,.5,abs(fract(fc.y/rh)-.5))*(.5+.5*uMGap);
  }else{
    float col=floor(fc.x/pitch);
    m=subpx(fract(fc.x/pitch)*3.,uMSoft,thr);
    float sy=fract(fc.y/(pitch*2.6)+mod(col,2.)*.5);
    m*=1.-smoothstep(.8,.9,sy)*.9;
  }
  return m;
}
void main(){
  vec2 p=warp(vUv);
  float inside=screenMask(p);
  vec2 uvw=p*.5+.5;
  float r2=dot(p,p)*.5;
  uvw.y=fract(uvw.y+uRoll);
  float blank=mix(1.,smoothstep(.02,.07,uvw.y),min(uRollAmt*20.,1.));
  vec3 cx=(vec3(1.,0.,-1.)*(uConvS*1.6+uConvE*4.*r2)+uHwConv*uAging*3.)/uRes.x;
  float sp=(.4+4.*uSpot+5.*uEfoc*r2)/uRes.x;
  float yy=uvw.y*uLines-.5,l0=floor(yy),f=yy-l0;
  vec3 a=fetchLine(l0,uvw.x,cx,sp),b=fetchLine(l0+1.,uvw.x,cx,sp);
  float fa=1.-uInter*uIflk*abs(mod(l0,2.)-uField);
  float fb=1.-uInter*uIflk*abs(mod(l0+1.,2.)-uField);
  vec3 c=mix(a,b,f)*mix(fa,fb,f);
  if(uScan>.001){
    float sa=uBeamMin+uBeamGrow*clamp(lum(a),0.,1.2),sb=uBeamMin+uBeamGrow*clamp(lum(b),0.,1.2);
    float wa=exp(-f*f/(2.*sa*sa))/max(sa*2.5066,.4)*fa;
    float wb=exp(-(1.-f)*(1.-f)/(2.*sb*sb))/max(sb*2.5066,.4)*fb;
    c=mix(c,a*wa+b*wb,uScan);
  }
  c=max(c-uBlk,0.)/(1.-uBlk);
  c=pow(max(c,0.),vec3(uGam));
  c=(c-.5)*uCon+.5+uBri;c=max(c,0.);
  c*=uWhite*uGain;
  float sat=1.+uSati*(sin(uTime*.9+uSeed)*.5+sin(uTime*2.3)*.25+(vnoise(vec2(uTime*.4,uSeed))-.5));
  float l=lum(c);c=mix(vec3(l),c,max(sat,0.));
  if(uPhos>0){
    float lm=lum(c)*1.25;
    vec3 tint=uPhos==1?vec3(.35,1.,.45):(uPhos==2?vec3(1.,.62,.14):(uPhos==3?vec3(.92,.95,1.):vec3(.35,.55,1.)));
    c=lm*tint;
  }else if(uMask>0&&uMStr>.001){
    vec3 m=maskAt(gl_FragCoord.xy);
    c*=mix(vec3(1.),m*2.6,uMStr);
  }
  if(uPTA>.001)c=mix(c,lum(c)*uPT*1.5,uPTA);
  c*=inside*blank*uGainP;
  if(uGainP>1.5){c=mix(c,vec3(.9,1.,.95)*uGainP*.4*inside,smoothstep(.12,.01,uSY));}
  o=vec4(c,1.);
}`;
var F_PERSIST = HEAD + `
uniform sampler2D uCrt,uPrev;
uniform vec3 uDecay;
uniform float uAfter,uBlend,uEps,uBurnRate;
void main(){
  vec4 cur=texture(uCrt,vUv),prev=texture(uPrev,vUv);
  vec3 tr=max(prev.rgb*uDecay-uEps,0.)*uAfter;
  vec3 oc=max(cur.rgb,tr);
  oc=mix(oc,prev.rgb,uBlend);
  float burn=mix(prev.a,lum(cur.rgb),uBurnRate);
  o=vec4(oc,burn);
}`;
var F_BRIGHT = HEAD + `
uniform sampler2D uT;
void main(){vec3 c=texture(uT,vUv).rgb;o=vec4(c*smoothstep(.12,.85,lum(c)),1.);}`;
var F_COPY = HEAD + `
uniform sampler2D uT;
void main(){o=vec4(texture(uT,vUv).rgb,1.);}`;
var F_BLUR = HEAD + `
uniform sampler2D uT;uniform vec2 uDir;
void main(){
  vec3 c=texture(uT,vUv).rgb*.227027;
  c+=texture(uT,vUv+uDir*1.3846).rgb*.316216;c+=texture(uT,vUv-uDir*1.3846).rgb*.316216;
  c+=texture(uT,vUv+uDir*3.2308).rgb*.070270;c+=texture(uT,vUv-uDir*3.2308).rgb*.070270;
  o=vec4(c,1.);
}`;
var F_FINAL = HEAD + `
uniform sampler2D uP,uBA,uBB,uBC;
uniform vec2 uRes,uPointer;
uniform float uSeed,uTime;
uniform float uBloom,uBrad,uHal,uDiff,uRefl,uAR,uGlare,uTint,uDust,uScr,uSmud,uMicro,uVig,uBez,uBsh,uRoom,uPara,uBurnAmt,uLayL,uLayG;
void main(){
  vec2 s=(vUv-.5)*(1.+2.*uBez)+.5;
  vec3 col;
  if(s.x>=0.&&s.x<=1.&&s.y>=0.&&s.y<=1.){
    vec4 pr=texture(uP,s);
    vec3 c=pr.rgb;
    if(uLayL>.5){
      vec3 A=texture(uBA,s).rgb,B=texture(uBB,s).rgb,C=texture(uBC,s).rgb;
      c=mix(c,B*1.1+c*.4,uDiff*.6);
      c+=(A*(1.2-uBrad)+B*.8+C*(.4+uBrad))*uBloom*.9;
      c+=C*vec3(1.,.45,.3)*uHal*1.3;
    }
    c+=vec3(.85,.95,1.)*pr.a*uBurnAmt*.35;
    vec3 hi=max(c-.8,0.);
    c=min(c,vec3(.8))+.2*tanh(hi/.2);
    vec2 g=s*2.-1.;
    if(uLayG>.5){
      vec2 rp=g+uPointer*uPara*.35+vec2(sin(uTime*.2),cos(uTime*.17))*uPara*.04;
      float sb=smoothstep(.55,0.,length((rp-vec2(-.55,.6))*vec2(.9,1.6)));
      float sb2=smoothstep(.5,0.,length((rp-vec2(.7,-.5))*vec2(1.2,1.)))*.4;
      float refl=(sb+sb2)*uRefl*(1.-uAR*.85);
      float sm=vnoise(g*3.+7.)*.6+vnoise(g*9.)*.4;
      refl*=1.+uSmud*(sm-.5)*4.;
      float gl=exp(-dot(rp-vec2(-.35,.5),rp-vec2(-.35,.5))*6.)*uGlare;
      float amb=.35+uRoom*.9;
      c+=vec3(.9,.95,1.)*(refl*.32+gl*.45)*amb;
      vec2 dg=g*vec2(90.,70.)+uSeed;
      vec2 cell=floor(dg);
      float spk=step(1.-.02*uDust,h21(cell))*smoothstep(.45,0.,length(fract(dg)-.5));
      c+=vec3(.95,.95,1.)*spk*(.12+refl*.9+uRoom*.18);
      float sc=0.;
      for(int i=0;i<7;i++){
        float fi=float(i);
        if(fi>=uScr*7.)break;
        vec2 a=vec2(h21(vec2(fi,1.+uSeed)),h21(vec2(fi,2.+uSeed)))*2.-1.;
        float an=h21(vec2(fi,3.+uSeed))*6.28;
        vec2 dir=vec2(cos(an),sin(an));
        vec2 pa=g-a;float h=clamp(dot(pa,dir)/.7,0.,1.);
        sc+=smoothstep(.004,0.,length(pa-dir*h*.7));
      }
      c+=vec3(.9,.95,1.)*sc*(.1+refl*1.1+uRoom*.25);
      c*=1.+(h21(gl_FragCoord.xy+uSeed)-.5)*uMicro*.08;
      c=mix(c,c*vec3(.9,1.,.94),uTint);
      c*=1.-uVig*pow(length(g*.9),2.5)*.7;
    }
    col=c;
  }else{
    vec2 q=abs(s-.5)-.5;
    float d=max(q.x,q.y);
    vec3 bz=vec3(.05,.052,.06)*(1.-.45*uBsh*smoothstep(0.,.1,d));
    bz+=.02*smoothstep(.004,0.,d)+.015*(h21(gl_FragCoord.xy)-.5);
    bz*=.9+.2*(1.-vUv.y);
    col=bz;
  }
  o=vec4(clamp(col,0.,1.),1.);
}`;
var F_ORIG = HEAD + `
uniform sampler2D uSrc;uniform float uSrcAsp,uScrAsp;
void main(){
  float r=uScrAsp/uSrcAsp;vec2 s=r>1.?vec2(1.,1./r):vec2(r,1.);
  o=vec4(texture(uSrc,(vUv-.5)*s+.5).rgb,1.);
}`;
var VS_PAINT = `#version 300 es
in vec3 aP;
void main(){gl_Position=vec4(aP.xy,0.,1.);gl_PointSize=aP.z;}`;
var F_PAINT = `#version 300 es
precision highp float;
uniform vec3 uCol;out vec4 o;
void main(){vec2 d=gl_PointCoord-.5;float a=exp(-dot(d,d)*18.);o=vec4(uCol*a,0.);}`;
var $ = (s, r = document) => r.querySelector(s);
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var lerp = (a, b, t) => a + (b - a) * t;
var sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
var TABS = [["display", "Display"], ["bitmap", "Bitmap"], ["signal", "Signal"], ["beam", "Beam"], ["glass", "Glass"], ["glitch", "Glitch"], ["wave", "Wave"], ["lab", "Lab"]];
var CT = [];
var R = (tab, g, k, l, min, max, d, step = 1) => CT.push({ t: "r", tab, g, k, l, min, max, d, step });
var C = (tab, g, k, l, opts, d) => CT.push({ t: "c", tab, g, k, l, opts, d });
var B = (tab, g, k, l, d) => CT.push({ t: "b", tab, g, k, l, d });
C("display", "Screen", "aspect", "Aspect", [["src", "Source"], ["9:16", "9:16"], ["4:3", "4:3"], ["3:4", "3:4"], ["1:1", "1:1"], ["16:9", "16:9"]], "src");
C("display", "Screen", "quality", "Render quality", [["0.5", "Draft"], ["0.8", "Normal"], ["1.15", "High"]], "0.8");
C("display", "Screen", "fcap", "Frame rate", [["0", "Smooth"], ["30", "Save battery"]], "0");
R("display", "Chain macros", "mWear", "Wear", 0, 100, 0);
R("display", "Chain macros", "mAge", "Age", 0, 100, 0);
R("display", "Chain macros", "mBand", "Bandwidth loss", 0, 100, 0);
R("display", "Chain macros", "mInst", "Instability", 0, 100, 0);
R("display", "Hardware identity", "seed", "Hardware seed", 0, 999, 7);
C("bitmap", "Dither", "method", "Method", [["off", "Off"], ["thr", "Threshold"], ["b4", "Bayer 4"], ["b8", "Bayer 8"], ["blue", "Blue noise"], ["white", "White noise"], ["half", "Halftone"], ["atk", "Atkinson"], ["fs", "Floyd\u2013Steinberg"], ["jjn", "Jarvis"], ["stucki", "Stucki"], ["sierra", "Sierra"], ["burkes", "Burkes"]], "atk");
R("bitmap", "Dither", "px", "Pixel size", 1, 16, 3);
R("bitmap", "Dither", "dstr", "Dither strength", 0, 150, 100);
R("bitmap", "Dither", "tbias", "Threshold bias", -50, 50, 0);
B("bitmap", "Dither", "anim", "Animate pattern", false);
R("bitmap", "Palette", "depth", "Color depth", 2, 8, 4);
R("bitmap", "Palette", "cycle", "Palette cycling", -12, 12, 0);
R("bitmap", "Tone", "bright", "Brightness", -100, 100, 0);
R("bitmap", "Tone", "contrast", "Contrast", -100, 100, 0);
R("bitmap", "Tone", "mid", "Midtones", -100, 100, 0);
R("bitmap", "Tone", "high", "Highlights", -100, 100, 0);
R("bitmap", "Tone", "sat", "Saturation", -100, 100, 0);
R("bitmap", "Tone", "hue", "Hue", -180, 180, 0);
R("bitmap", "Tone", "blur", "Blur", 0, 10, 0);
R("bitmap", "Tone", "sharp", "Sharpen", 0, 10, 0);
R("bitmap", "Tone", "edge", "Vector edges", 0, 100, 0);
B("bitmap", "Tone", "invert", "Invert", false);
C("signal", "Format", "std", "Standard", [["0", "NTSC"], ["1", "PAL"]], "0");
R("signal", "Format", "lines", "Scanlines", 100, 576, 240);
R("signal", "Format", "lbw", "Luma softness", 0, 100, 25);
R("signal", "Format", "cbw", "Chroma bleed", 0, 100, 30);
R("signal", "Format", "ycs", "Y/C separation", 0, 100, 70);
R("signal", "Format", "cper", "Dot crawl size", 2, 10, 4, 0.5);
C("signal", "Format", "cmode", "Color mode", [["0", "Composite NTSC"], ["1", "S-Video"], ["2", "RGB"]], "0");
R("signal", "Format", "csat", "Chroma saturation", 0, 300, 100);
R("signal", "Format", "pop", "Color pops", 0, 100, 0);
R("signal", "Format", "phs", "Phase error", -180, 180, 0);
R("signal", "Format", "ring", "Edge ringing", 0, 100, 0);
R("signal", "Noise", "snr", "Noise", 0, 100, 8);
R("signal", "Noise", "coh", "Living static", 0, 100, 30);
R("signal", "Noise", "snow", "Tape snow", 0, 100, 0);
R("signal", "Noise", "ghost", "Ghost echo", 0, 100, 0);
R("signal", "Noise", "gdel", "Echo delay", 1, 80, 20);
R("signal", "Noise", "rgho", "Ring ghost", 0, 100, 0);
R("signal", "Noise", "gspr", "Ghost spread", 1, 40, 6);
R("signal", "Noise", "gdec", "Ghost decay", 10, 95, 60);
R("signal", "Sync", "jit", "Time-base jitter", 0, 100, 5);
R("signal", "Sync", "drift", "Sync drift", 0, 100, 0);
R("signal", "Sync", "trk", "Tracking error", 0, 100, 0);
R("signal", "Sync", "tjit", "Tracking jitter", 0, 100, 0);
R("signal", "Sync", "hsw", "Head switching", 0, 100, 0);
R("signal", "Sync", "drop", "Dropouts", 0, 100, 0);
R("signal", "Sync", "vhold", "Vertical hold", 0, 100, 0);
R("signal", "Sync", "clip", "Overdrive clipping", 0, 100, 0);
R("signal", "Sync", "gen", "Generation loss", 0, 100, 0);
R("signal", "Sync", "weather", "Signal weather", 0, 100, 0);
R("beam", "Scan", "scan", "Scanline depth", 0, 100, 55);
R("beam", "Scan", "beam", "Beam size", 0, 100, 40);
R("beam", "Scan", "bloomb", "Beam blooming", 0, 100, 40);
R("beam", "Scan", "spot", "Spot softness", 0, 100, 30);
R("beam", "Scan", "efoc", "Edge defocus", 0, 100, 20);
C("beam", "Scan", "iface", "Scanning", [["0", "Progressive"], ["1", "Interlaced"]], "0");
R("beam", "Scan", "iflk", "Field flicker", 0, 100, 50);
C("beam", "Phosphor", "mask", "Mask", [["0", "None"], ["1", "Aperture grille"], ["2", "Shadow mask"], ["3", "Slot mask"]], "1");
R("beam", "Phosphor", "mstr", "Mask strength", 0, 100, 55);
R("beam", "Phosphor", "ptint", "Phosphor tint hue", -180, 180, 0);
R("beam", "Phosphor", "ptamt", "Phosphor tint amount", 0, 100, 0);
R("beam", "Phosphor", "mpitch", "Mask scale", 2, 8, 3, 0.25);
R("beam", "Phosphor", "msoft", "Mask softness", 0, 100, 50);
R("beam", "Phosphor", "mgap", "Mask gap", 0, 100, 20);
C("beam", "Phosphor", "phos", "Phosphor", [["0", "RGB"], ["1", "P1 green"], ["2", "P3 amber"], ["3", "P4 white"], ["4", "P11 blue"]], "0");
R("beam", "Phosphor", "dr", "Decay red (ms)", 0, 1500, 35, 5);
R("beam", "Phosphor", "dg", "Decay green (ms)", 0, 1500, 35, 5);
R("beam", "Phosphor", "db", "Decay blue (ms)", 0, 1500, 35, 5);
R("beam", "Phosphor", "after", "Afterglow", 0, 100, 60);
R("beam", "Phosphor", "fblend", "Frame blend", 0, 95, 0);
R("beam", "Phosphor", "burn", "Burn-in", 0, 100, 0);
R("beam", "Electronics", "blkl", "Black level", 0, 50, 4);
R("beam", "Electronics", "gam", "Gamma", 60, 180, 100);
R("beam", "Electronics", "ccon", "Analog contrast", 50, 200, 100);
R("beam", "Electronics", "cbri", "Analog brightness", -50, 50, 0);
R("beam", "Electronics", "temp", "White point", -100, 100, 0);
R("beam", "Electronics", "gr", "Gain red", 50, 150, 100);
R("beam", "Electronics", "gg", "Gain green", 50, 150, 100);
R("beam", "Electronics", "gb", "Gain blue", 50, 150, 100);
R("beam", "Electronics", "sati", "Saturation drift", 0, 100, 0);
R("beam", "Geometry", "curv", "Curvature", -50, 100, 25);
R("beam", "Geometry", "corner", "Corner radius", 0, 100, 25);
R("beam", "Geometry", "over", "Overscan", 0, 20, 3);
R("beam", "Geometry", "convs", "Misconvergence", 0, 100, 10);
R("beam", "Geometry", "conve", "Edge convergence", 0, 100, 20);
R("beam", "Geometry", "cdrift", "Circuit drift", 0, 100, 0);
R("beam", "Geometry", "aging", "Hardware aging", 0, 100, 20);
R("glass", "Light", "bloom", "Bloom", 0, 100, 35);
R("glass", "Light", "brad", "Bloom radius", 0, 100, 50);
R("glass", "Light", "hal", "Halation", 0, 100, 25);
R("glass", "Light", "diff", "Diffusion", 0, 100, 10);
R("glass", "Reflections", "refl", "Reflection", 0, 100, 20);
R("glass", "Reflections", "ar", "Anti-reflective coat", 0, 100, 40);
R("glass", "Reflections", "glare", "Glare", 0, 100, 15);
R("glass", "Reflections", "room", "Room light", 0, 100, 30);
R("glass", "Reflections", "para", "Parallax", 0, 100, 30);
R("glass", "Surface", "tint", "Glass tint", 0, 100, 10);
R("glass", "Surface", "dust", "Dust", 0, 100, 0);
R("glass", "Surface", "scr", "Scratches", 0, 100, 0);
R("glass", "Surface", "smud", "Smudges", 0, 100, 0);
R("glass", "Surface", "micro", "Surface grain", 0, 100, 10);
R("glass", "Cabinet", "vig", "Edge falloff", 0, 100, 35);
R("glass", "Cabinet", "bez", "Bezel", 0, 12, 0);
R("glass", "Cabinet", "bsh", "Bezel shadow", 0, 100, 50);
R("glitch", "Master", "gamt", "Intensity", 0, 100, 100);
R("glitch", "Master", "grate", "Event rate", 0, 100, 40);
B("glitch", "Master", "gfreeze", "Freeze glitch", false);
R("glitch", "Corruption", "rgbs", "RGB split", 0, 100, 0);
R("glitch", "Corruption", "tear", "Tearing", 0, 100, 0);
R("glitch", "Corruption", "sline", "Scanline shift", 0, 100, 0);
R("glitch", "Corruption", "gblock", "Block corruption", 0, 100, 0);
R("glitch", "Corruption", "drag", "Pixel drag", 0, 100, 0);
R("glitch", "Corruption", "band", "Color bands", 0, 100, 0);
R("glitch", "Corruption", "ginv", "Channel invert", 0, 100, 0);
R("glitch", "Corruption", "burst", "Noise bursts", 0, 100, 0);
R("glitch", "Corruption", "crush", "Compression crush", 0, 100, 0);
C("wave", "Oscillator", "wshape", "Shape", [["0", "Sine"], ["1", "Triangle"], ["2", "Square"], ["3", "Sawtooth"]], "0");
C("wave", "Oscillator", "waxis", "Axis", [["0", "Horizontal"], ["1", "Vertical"], ["2", "Both"]], "0");
R("wave", "Oscillator", "wamp", "Amplitude", 0, 100, 0);
R("wave", "Oscillator", "wfreq", "Frequency", 1, 60, 8);
R("wave", "Oscillator", "wspd", "Speed", -100, 100, 20);
R("wave", "Modulation", "wfm", "Frequency mod", 0, 100, 0);
R("wave", "Modulation", "wfmr", "FM rate", 1, 40, 3);
R("wave", "Modulation", "wam", "Amplitude mod", 0, 100, 0);
R("wave", "Modulation", "wamr", "AM rate", 1, 40, 2);
R("wave", "Modulation", "wph", "Phase distortion", 0, 100, 0);
R("wave", "Second oscillator", "w2", "Blend", 0, 100, 0);
R("wave", "Second oscillator", "w2f", "Frequency", 1, 60, 21);
R("wave", "Scope", "scope", "Oscilloscope trace", 0, 100, 0);
R("lab", "Analog feedback", "fbg", "Feedback", 0, 100, 0);
R("lab", "Analog feedback", "fbz", "Zoom", -20, 20, 2);
R("lab", "Analog feedback", "fbr", "Rotate", -30, 30, 1);
R("lab", "Analog feedback", "fbx", "Shift X", -20, 20, 0);
R("lab", "Analog feedback", "fby", "Shift Y", -20, 20, 0);
R("lab", "Analog feedback", "fbh", "Hue shift", -90, 90, 5);
B("lab", "Terminal text", "ton", "Show text", false);
R("lab", "Terminal text", "tsz", "Size", 3, 30, 8);
R("lab", "Terminal text", "ty", "Position", 0, 100, 12);
B("lab", "Terminal text", "tcur", "Blinking cursor", true);
C("lab", "Display autopsy", "solo", "One effect at a time", [["all", "All"], ["bit", "Dither"], ["g", "Glitch"], ["s", "Signal"], ["b", "Beam"], ["m", "Mask"], ["l", "Bloom"], ["gl", "Glass"]], "all");
var CTL = {};
CT.forEach((c) => CTL[c.k] = c);
var PALS = [
  { id: "ice", name: "Ice", c: ["#000308", "#0b3d4d", "#6ee7ff", "#f2ffff"] },
  { id: "mono", name: "Mono", c: ["#000000", "#ffffff"] },
  { id: "blood", name: "Blood", c: ["#000000", "#383838", "#ff1a1a", "#ffffff"] },
  { id: "phosphor", name: "Green terminal", c: ["#020a04", "#0c3d1a", "#2fe36a", "#c9ffd9"] },
  { id: "amber", name: "Amber", c: ["#0d0600", "#5a2b00", "#ff9a1f", "#ffe2a8"] },
  { id: "gameboy", name: "Handheld", c: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] },
  { id: "cga", name: "CGA", c: ["#000000", "#55ffff", "#ff55ff", "#ffffff"] },
  { id: "vboy", name: "Virtual red", c: ["#000000", "#3a0000", "#a00000", "#ff2a2a"] },
  { id: "sky", name: "Sky", c: ["#0a1a8c", "#3a6cff", "#9fd8c8", "#f6e7c1"] },
  { id: "vapor", name: "Vapor", c: ["#0b0630", "#4b2bd6", "#ff5fb0", "#ffe9a8"] },
  { id: "paper", name: "Parchment", c: ["#2b1d12", "#8a5a3a", "#e8dcc0"] },
  { id: "c64", name: "Home computer", c: ["#000000", "#ffffff", "#880000", "#aaffee", "#cc44cc", "#00cc55", "#0000aa", "#eeee77", "#dd8855", "#664400", "#ff7777", "#333333", "#777777", "#aaff66", "#0088ff", "#bbbbbb"] },
  { id: "pico", name: "Arcade 16", c: ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa"] },
  { id: "custom", name: "Custom", c: null },
  { id: "src", name: "Original color", c: null }
];
var hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
var lum255 = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
var rgbHex = (c) => "#" + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
var PROFILES = [
  ["none", "None", { lines: 576, lbw: 0, cbw: 0, ycs: 100, csat: 100, phs: 0, ring: 0, snr: 0, coh: 0, snow: 0, ghost: 0, jit: 0, drift: 0, trk: 0, hsw: 0, drop: 0, vhold: 0, clip: 0, gen: 0, weather: 0, scan: 0, beam: 0, bloomb: 0, spot: 0, efoc: 0, mask: "0", mstr: 0, after: 0, fblend: 0, burn: 0, blkl: 0, sati: 0, curv: 0, corner: 0, over: 0, convs: 0, conve: 0, cdrift: 0, aging: 0, bloom: 0, hal: 0, diff: 0, refl: 0, glare: 0, room: 0, para: 0, tint: 0, dust: 0, scr: 0, smud: 0, micro: 0, vig: 0, bez: 0, gamt: 0, wamp: 0, w2: 0, scope: 0, fbg: 0, ton: false, pal: "src", method: "off" }],
  ["studio", "Studio CRT", {}],
  ["tv70", "70s black & white", { phos: "3", cbw: 0, csat: 0, lines: 200, lbw: 55, snr: 22, coh: 40, curv: 55, corner: 50, spot: 60, efoc: 50, mask: "0", mstr: 0, scan: 35, beam: 60, jit: 12, drift: 6, aging: 50, bloom: 50, after: 40, dr: 60, dg: 60, db: 60, vig: 55, refl: 30, glare: 30, bez: 6, bsh: 60, iface: "1", iflk: 40, pal: "mono", method: "thr" }],
  ["tv80", "80s color TV", { lines: 240, lbw: 35, cbw: 55, ycs: 35, cper: 4, mask: "2", mstr: 60, mpitch: 3, curv: 40, corner: 40, snr: 12, coh: 35, jit: 8, drift: 4, spot: 45, efoc: 35, scan: 45, bloom: 40, hal: 30, refl: 25, bez: 5, bsh: 50, aging: 35, iface: "1", iflk: 30, ghost: 6 }],
  ["mon90", "90s monitor", { lines: 480, lbw: 8, cbw: 8, ycs: 100, mask: "1", mstr: 50, mpitch: 3, curv: 10, corner: 15, snr: 2, scan: 25, beam: 30, spot: 15, efoc: 20, bloom: 25, hal: 15, refl: 20, ar: 60, bez: 4, bsh: 40 }],
  ["bcast", "Broadcast reference", { lines: 480, lbw: 5, cbw: 6, ycs: 100, csat: 100, mask: "1", mstr: 35, curv: 0, corner: 8, snr: 0, jit: 0, scan: 30, beam: 25, spot: 10, efoc: 5, bloom: 15, hal: 8, refl: 10, ar: 80, vig: 15, aging: 0, convs: 0, conve: 0, bez: 3 }],
  ["arcade", "Arcade cabinet", { lines: 240, lbw: 20, cbw: 25, mask: "3", mstr: 70, mpitch: 4, curv: 30, corner: 30, scan: 70, beam: 35, bloomb: 60, bloom: 55, hal: 35, refl: 30, glare: 25, vig: 40, csat: 130, snr: 6, bez: 6, bsh: 60, temp: 10 }],
  ["amber", "Amber terminal", { phos: "2", pal: "mono", lines: 240, cbw: 0, csat: 0, mask: "0", mstr: 0, scan: 60, beam: 50, bloom: 60, hal: 40, dr: 120, dg: 120, db: 120, after: 70, burn: 40, curv: 35, corner: 35, snr: 6, coh: 30, lbw: 30, spot: 40, vig: 45, refl: 25, ton: true, txt: "AMBER TERMINAL\n> LOGIN: GUEST\n> " }],
  ["green", "Green terminal", { phos: "1", pal: "mono", lines: 240, cbw: 0, csat: 0, mask: "0", mstr: 0, scan: 60, beam: 50, bloom: 60, hal: 40, dr: 220, dg: 220, db: 220, after: 75, burn: 50, curv: 35, corner: 35, snr: 6, coh: 30, lbw: 30, spot: 40, vig: 45, refl: 25, ton: true, txt: "SYSTEM READY\n> RUN N0ISE\n> " }],
  ["portable", "Portable TV", { lines: 200, lbw: 50, cbw: 70, ycs: 30, snr: 25, coh: 45, curv: 70, corner: 60, spot: 70, efoc: 60, mask: "2", mstr: 30, mpitch: 4, scan: 30, vig: 55, jit: 15, drift: 8, ghost: 12, aging: 60, bez: 8, bsh: 70, refl: 35, glare: 35 }],
  ["security", "Security monitor", { phos: "3", pal: "mono", method: "thr", lines: 200, cbw: 0, csat: 0, lbw: 45, snr: 30, coh: 55, snow: 8, jit: 25, drift: 12, hsw: 25, drop: 20, trk: 15, curv: 20, mstr: 0, mask: "0", scan: 55, bloom: 40, vig: 50, aging: 60, ton: true, txt: "CAM 02  {t}\nREC", tsz: 5, ty: 7, tcur: false }],
  ["vhs", "VHS playback", { lines: 240, lbw: 60, cbw: 70, ycs: 25, cper: 3.5, ring: 40, snr: 28, coh: 60, snow: 6, ghost: 15, gdel: 25, jit: 35, drift: 20, trk: 35, hsw: 60, drop: 30, vhold: 5, gen: 35, csat: 85, phs: 6, mstr: 35, curv: 25, corner: 30, scan: 40, bloom: 40, hal: 30, aging: 50, iface: "1" }],
  ["camcorder", "Camcorder viewfinder", { lines: 240, lbw: 35, cbw: 45, snr: 14, curv: 30, corner: 50, spot: 45, vig: 60, bez: 10, bsh: 70, mstr: 25, ton: true, txt: "\u25CF REC  {t}", tsz: 5, ty: 7, tcur: false }],
  ["rgbgame", "RGB game monitor", { lines: 240, lbw: 8, cbw: 8, ycs: 100, mask: "1", mstr: 60, mpitch: 3, curv: 15, corner: 20, scan: 65, beam: 30, bloom: 40, hal: 20, csat: 120 }],
  ["vector", "Vector arcade", { phos: "1", pal: "mono", method: "off", edge: 100, lines: 480, lbw: 10, mask: "0", mstr: 0, scan: 0, beam: 10, bloom: 90, brad: 70, hal: 40, dr: 400, dg: 400, db: 400, after: 85, curv: 30, corner: 30, snr: 2, cbw: 0, csat: 0, bright: 20, contrast: 30 }],
  ["scope", "Oscilloscope", { phos: "4", pal: "mono", method: "off", edge: 60, wamp: 30, wfreq: 6, wspd: 40, scope: 80, lines: 480, mask: "0", mstr: 0, scan: 10, beam: 10, bloom: 80, brad: 60, hal: 30, dr: 300, dg: 300, db: 300, after: 80, cbw: 0, csat: 0, snr: 2, curv: 20, corner: 25, bright: 10 }],
  ["handheld", "Handheld LCD", { pal: "gameboy", method: "b4", px: 4, lines: 144, lbw: 0, cbw: 0, csat: 0, mask: "2", mstr: 35, mpitch: 2, mgap: 45, msoft: 10, scan: 0, beam: 0, curv: 0, corner: 10, spot: 0, efoc: 0, fblend: 40, after: 0, vig: 15, bez: 8, bsh: 60, refl: 12, blkl: 0, snr: 0, jit: 0, bloom: 0, hal: 0, dr: 0, dg: 0, db: 0 }],
  ["nvg", "Night vision", { phos: "1", pal: "phosphor", method: "off", lines: 300, cbw: 0, csat: 0, mask: "0", mstr: 0, snr: 65, coh: 70, snow: 8, bloom: 90, brad: 40, hal: 55, vig: 95, curv: 0, corner: 100, scan: 10, jit: 6, bright: 25, contrast: 35, fbg: 12, fbz: 1, fbr: 0, fbh: 0, burst: 0, ton: true, txt: "NVG  GAIN AUTO  IR ON\n{t}", tsz: 5, ty: 7, tcur: false }],
  ["thermal", "Thermal camera", { pal: "custom", custom: ["#05001a", "#4b0a8c", "#d4145a", "#ff8c1a", "#fff6a8"], method: "off", blur: 2, lines: 120, lbw: 70, cbw: 0, csat: 0, mask: "0", mstr: 0, snr: 6, coh: 30, bloom: 45, hal: 30, vig: 25, curv: 0, corner: 20, scan: 8, spot: 60, contrast: 20, ton: true, txt: "THERMAL  MAX 41.2C\nMIN 19.8C", tsz: 5, ty: 7, tcur: false }],
  ["radar", "Radar sweep", { phos: "1", pal: "mono", method: "off", edge: 50, lines: 480, cbw: 0, csat: 0, mask: "0", mstr: 0, scan: 20, beam: 15, bloom: 85, brad: 60, hal: 35, after: 96, dr: 700, dg: 700, db: 700, fbg: 72, fbz: 0, fbr: 4, fbh: 0, scope: 60, wspd: 30, wfreq: 5, curv: 20, corner: 100, vig: 60, snr: 3, bright: 10, contrast: 30 }],
  ["teletext", "Teletext", { pal: "cga", method: "thr", px: 6, lines: 240, lbw: 0, cbw: 0, ycs: 100, mask: "0", mstr: 0, curv: 0, corner: 10, scan: 0, snr: 0, bloom: 15, aging: 0, contrast: 30, ton: true, txt: "P100  CEEFAX\nNEWS  WEATHER  SPORT\n101 102 103\n> ", tsz: 11, ty: 14, tcur: true }],
  ["dashcam", "Dashcam", { lines: 480, lbw: 15, cbw: 20, snr: 12, coh: 30, jit: 8, hsw: 12, gen: 15, temp: -35, csat: 85, ccon: 115, blkl: 8, mask: "0", mstr: 0, scan: 10, curv: 0, corner: 8, vig: 45, glare: 45, refl: 35, room: 50, ton: true, txt: "DASHCAM  {t}\n72 KM/H", tsz: 5, ty: 92, tcur: false }],
  ["cursed", "Cursed broadcast", { lines: 240, cbw: 65, snr: 30, coh: 55, jit: 30, drift: 20, trk: 30, drop: 25, rgbs: 35, tear: 20, gblock: 12, band: 30, wamp: 28, wfreq: 6, wfm: 55, wfmr: 3, wph: 45, w2: 35, fbg: 38, fbz: 2, fbr: 3, fbh: 35, hue: 0, mask: "2", mstr: 55, aging: 60, bloom: 50, gen: 20, ghost: 15, curv: 35, corner: 35 }],
  ["limecomp", "Lime composite", { pal: "gameboy", method: "b4", px: 3, lines: 200, lbw: 25, cbw: 55, ycs: 20, cper: 3, csat: 220, pop: 60, rgho: 55, gspr: 5, gdec: 70, gdel: 18, ring: 35, mask: "2", mstr: 45, mpitch: 3, convs: 30, curv: 20, corner: 25, scan: 35, snr: 10, coh: 40, tjit: 20, trk: 8 }],
  ["damaged", "Damaged CRT", { convs: 70, conve: 70, curv: 45, corner: 50, snr: 30, coh: 50, snow: 10, jit: 30, drift: 25, trk: 25, drop: 25, vhold: 15, rgbs: 20, tear: 15, gblock: 10, burn: 60, dust: 50, scr: 40, smud: 50, sati: 50, cdrift: 60, aging: 100, clip: 25 }],
  ["aging", "Unstable old TV", { cdrift: 80, aging: 90, jit: 20, drift: 30, vhold: 20, sati: 60, convs: 40, conve: 50, burn: 50, snr: 20, dust: 40, smud: 40, refl: 30, temp: 20, gen: 10 }]
];
var BASE = { pal: "src", custom: ["#000000", "#ff3d6e", "#3df5ff", "#ffffff"], txt: "n0ise\n> signal acquired\n> ", profile: "studio" };
CT.forEach((c) => BASE[c.k] = c.d);
BASE.stg = ["clean", "live", "direct", "studio"];
var P = JSON.parse(JSON.stringify(BASE));
var PROTECT = /* @__PURE__ */ new Set(["aspect", "quality", "fcap", "seed", "method", "px", "dstr", "tbias", "anim", "depth", "cycle", "bright", "contrast", "mid", "high", "sat", "hue", "blur", "sharp", "edge", "invert", "pal", "custom", "profile"]);
var E = {};
var MODS = [0, 1, 2].map(() => ({ target: "", shape: "sine", rate: 0.4, depth: 40 }));
var LOOKKEYS = ["method", "edge", "px", "blur", "bright", "contrast", "sharp"];
function applyProfile(id, quiet) {
  const pr = PROFILES.find((p) => p[0] === id);
  if (!pr) return;
  CT.forEach((c) => {
    if (!PROTECT.has(c.k) || LOOKKEYS.includes(c.k)) P[c.k] = c.d;
  });
  P.txt = BASE.txt;
  P.pal = BASE.pal;
  P.custom = BASE.custom.slice();
  P.solo = "all";
  Object.assign(P, pr[2]);
  P.profile = id;
}
function mulberry(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var _hw = { s: -1, v: null };
function hardware(seed) {
  if (_hw.s === seed) return _hw.v;
  const r = mulberry(seed * 7919 + 13);
  _hw.s = seed;
  return _hw.v = { conv: [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], gain: [1 + (r() - 0.5) * 0.1, 1 + (r() - 0.5) * 0.1, 1 + (r() - 0.5) * 0.1], geo: [r() * 2 - 1, r() * 2 - 1] };
}
var canvas = null;
var stage = null;
var gl = null;
var GLOK = false;
var _ro = null;
var noGL = (msg) => {
  const e = $("#err");
  if (e) {
    e.hidden = false;
    e.textContent = msg;
  } else console.error(msg);
};
function createGL(c) {
  return c.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
}
function attachGL(c, s, g) {
  canvas = c;
  stage = s;
  gl = g;
  GLOK = !!g;
  if (!g) noGL("This browser can\u2019t run WebGL 2, which n0ise needs. Try a recent Safari, Chrome or Firefox.");
  if (s && !_ro && typeof ResizeObserver !== "undefined") {
    _ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      SZ.w = r.width;
      SZ.h = r.height;
    });
    _ro.observe(s);
  }
}
var vaoEmpty;
var vaoPaint;
var paintBuf;
var PR = {};
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) + "\n" + src.split("\n").map((l, i) => i + 1 + ": " + l).join("\n").slice(0, 4e3));
  }
  return s;
}
function mkProg(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return wrapProg(p);
}
function mkProgAsync(vs, fs) {
  const ext = gl.getExtension("KHR_parallel_shader_compile"), h = { prog: null, err: null };
  if (!ext) {
    try {
      h.prog = mkProg(vs, fs);
    } catch (e) {
      h.err = String(e.message).split("\n")[0];
    }
    h.poll = h.force = () => h.err ? "err" : "ok";
    return h;
  }
  const p = gl.createProgram(), sh = [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].map(([ty, s]) => {
    const x = gl.createShader(ty);
    gl.shaderSource(x, s);
    gl.compileShader(x);
    gl.attachShader(p, x);
    return x;
  });
  gl.linkProgram(p);
  h.force = () => {
    if (!h.prog && !h.err) {
      gl.getProgramParameter(p, gl.LINK_STATUS);
    }
    return h.poll();
  };
  h.poll = () => {
    if (h.prog) return "ok";
    if (h.err) return "err";
    if (!gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR)) return null;
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) {
      h.prog = wrapProg(p);
      return "ok";
    }
    h.err = (sh.map((x) => gl.getShaderInfoLog(x)).join(" ") || gl.getProgramInfoLog(p) || "compile failed").split("\n").filter(Boolean).slice(0, 2).join(" | ");
    return "err";
  };
  return h;
}
function wrapProg(p) {
  const o = { p, loc: {} };
  o.l = (n) => {
    let l = o.loc[n];
    if (l === void 0) {
      l = gl.getUniformLocation(p, n);
      o.loc[n] = l;
    }
    return l;
  };
  o.f = (n, v) => {
    const l = o.l(n);
    if (l !== null) gl.uniform1f(l, v);
  };
  o.i = (n, v) => {
    const l = o.l(n);
    if (l !== null) gl.uniform1i(l, v);
  };
  o.v2 = (n, a, b) => {
    const l = o.l(n);
    if (l !== null) gl.uniform2f(l, a, b);
  };
  o.v3 = (n, a, b, c) => {
    const l = o.l(n);
    if (l !== null) gl.uniform3f(l, a, b, c);
  };
  o.v4 = (n, a, b, c, d) => {
    const l = o.l(n);
    if (l !== null) gl.uniform4f(l, a, b, c, d);
  };
  o.v2v = (n, arr) => {
    const l = o.l(n);
    if (l !== null) gl.uniform2fv(l, arr);
  };
  o.fv = (n, arr) => {
    const l = o.l(n);
    if (l !== null) gl.uniform1fv(l, arr);
  };
  o.v3v = (n, arr) => {
    const l = o.l(n);
    if (l !== null) gl.uniform3fv(l, arr);
  };
  o.use = () => gl.useProgram(p);
  return o;
}
function initGL() {
  PR.tone = mkProg(VS, F_TONE);
  PR.quant = mkProg(VS, F_QUANT);
  PR.glitch = mkProg(VS, F_GLITCH);
  PR.sigA = mkProg(VS, F_SIGA);
  PR.sigB = mkProg(VS, F_SIGB);
  PR.crt = mkProg(VS, F_CRT);
  PR.persist = mkProg(VS, F_PERSIST);
  PR.bright = mkProg(VS, F_BRIGHT);
  PR.copy = mkProg(VS, F_COPY);
  PR.blur = mkProg(VS, F_BLUR);
  PR.final = mkProg(VS, F_FINAL);
  PR.orig = mkProg(VS, F_ORIG);
  PR.paint = mkProg(VS_PAINT, F_PAINT);
  vaoEmpty = gl.createVertexArray();
  vaoPaint = gl.createVertexArray();
  paintBuf = gl.createBuffer();
  gl.bindVertexArray(vaoPaint);
  gl.bindBuffer(gl.ARRAY_BUFFER, paintBuf);
  const loc = gl.getAttribLocation(PR.paint.p, "aP");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(vaoEmpty);
  V.HDR = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
}
function mkTex(w, h, { hdr = false, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}
function mkRT(w, h, opts = {}) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let hdr = !!(opts.hdr && V.HDR);
  for (let attempt = 0; attempt < 2; attempt++) {
    const tex2 = mkTex(w, h, { ...opts, hdr });
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex2, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) return { tex: tex2, fbo, w, h, hdr };
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex2);
    if (!hdr) break;
    hdr = false;
    V.HDR = false;
  }
  throw new Error("Framebuffer incomplete");
}
function freeRT(r) {
  if (!r) return;
  gl.deleteFramebuffer(r.fbo);
  gl.deleteTexture(r.tex);
}
function bindRT(r) {
  if (r) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.fbo);
    gl.viewport(0, 0, r.w, r.h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
}
function tex(unit, t) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
}
function samp(prog, name, unit, t) {
  tex(unit, t);
  prog.i(name, unit);
}
function draw() {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function bayer(n) {
  if (n === 1) return [0];
  const m = bayer(n / 2), h = n / 2, o = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) o[y * n + x] = 4 * m[y % h * h + x % h] + [[0, 2], [3, 1]][y >= h ? 1 : 0][x >= h ? 1 : 0];
  return o;
}
function r8tex(w, h, data, wrap) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}
function blueNoise(n) {
  const r = mulberry(4242), a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = r();
  const bl = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, w = 0;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const g = Math.exp(-(i * i + j * j) / 3.2);
      s += g * a[(y + j + n) % n * n + (x + i + n) % n];
      w += g;
    }
    bl[y * n + x] = a[y * n + x] - s / w;
  }
  const idx = Array.from(bl.keys()).sort((p, q) => bl[p] - bl[q]);
  const out = new Uint8Array(n * n);
  idx.forEach((p, rank) => {
    out[p] = Math.round(rank / (n * n - 1) * 255);
  });
  return out;
}
var TEX = {};
function initLUT() {
  TEX.bay4 = r8tex(4, 4, new Uint8Array(bayer(4).map((v) => Math.round((v + 0.5) / 16 * 255))), gl.REPEAT);
  TEX.bay8 = r8tex(8, 8, new Uint8Array(bayer(8).map((v) => Math.round((v + 0.5) / 64 * 255))), gl.REPEAT);
  TEX.blue = r8tex(64, 64, blueNoise(64), gl.REPEAT);
  TEX.src = mkTex(2, 2);
  TEX.text = mkTex(2, 2);
  gl.bindTexture(gl.TEXTURE_2D, TEX.text);
}
var SRC = { el: null, kind: "canvas", w: 2, h: 2, ver: 0, live: false, name: "Demo" };
function srcDims(el2) {
  return el2 instanceof HTMLVideoElement ? [el2.videoWidth, el2.videoHeight] : el2 instanceof HTMLImageElement ? [el2.naturalWidth, el2.naturalHeight] : [el2.width, el2.height];
}
function uploadSrc() {
  const el2 = SRC.el;
  if (!el2) return;
  const [w, h] = srcDims(el2);
  if (!w || !h) return;
  gl.bindTexture(gl.TEXTURE_2D, TEX.src);
  let up = el2;
  if (SRC.mirror && el2 instanceof HTMLVideoElement) {
    const mc = SRC.mcv || (SRC.mcv = document.createElement("canvas"));
    if (mc.width !== w || mc.height !== h) {
      mc.width = w;
      mc.height = h;
    }
    const g = mc.getContext("2d");
    g.setTransform(-1, 0, 0, 1, w, 0);
    g.drawImage(el2, 0, 0, w, h);
    up = mc;
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, up);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  SRC.w = w;
  SRC.h = h;
}
function setSource(el2, name, live) {
  if (SRC.el instanceof HTMLVideoElement && SRC.el !== el2) {
    try {
      SRC.el.pause();
      const s = SRC.el.srcObject;
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch (e) {
    }
  }
  if (SRC.gif && SRC.el !== el2) SRC.gif = null;
  if (hooks.AUD.on && el2 !== hooks.AUD.cv) hooks.stopAudio();
  SRC.el = el2;
  SRC.name = name;
  SRC.live = !!live;
  SRC.ver++;
  SRC.mirror = false;
  SRC.viz = false;
  if (!(el2 instanceof HTMLVideoElement || el2 instanceof HTMLImageElement)) uploadSrc();
}
function fitCanvas(img, w0, h0, maxL = 2048) {
  const k = Math.min(1, maxL / Math.max(w0, h0)), c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w0 * k));
  c.height = Math.max(2, Math.round(h0 * k));
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function demoCanvas() {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 1100;
  const g = c.getContext("2d");
  let f = g.createLinearGradient(0, 0, 0, 1100);
  f.addColorStop(0, "#1d1d1d");
  f.addColorStop(1, "#030303");
  g.fillStyle = f;
  g.fillRect(0, 0, 900, 1100);
  f = g.createRadialGradient(450, 520, 40, 450, 520, 560);
  f.addColorStop(0, "rgba(255,255,255,.38)");
  f.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = f;
  g.fillRect(0, 0, 900, 1100);
  const ring = (a0, a1) => {
    g.save();
    g.translate(450, 550);
    g.rotate(-0.34);
    g.lineWidth = 30;
    g.strokeStyle = "rgba(235,235,235,.9)";
    g.beginPath();
    g.ellipse(0, 0, 455, 118, 0, a0, a1);
    g.stroke();
    g.lineWidth = 8;
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.beginPath();
    g.ellipse(0, 0, 395, 96, 0, a0, a1);
    g.stroke();
    g.restore();
  };
  ring(Math.PI, Math.PI * 2);
  f = g.createRadialGradient(350, 400, 20, 450, 520, 300);
  [[0, "#fff"], [0.25, "#dcdcdc"], [0.6, "#707070"], [0.9, "#1b1b1b"], [1, "#0b0b0b"]].forEach((s) => f.addColorStop(s[0], s[1]));
  g.fillStyle = f;
  g.beginPath();
  g.arc(450, 520, 290, 0, Math.PI * 2);
  g.fill();
  ring(0, Math.PI);
  f = g.createRadialGradient(740, 880, 8, 760, 900, 90);
  [[0, "#fff"], [0.5, "#9a9a9a"], [1, "#151515"]].forEach((s) => f.addColorStop(s[0], s[1]));
  g.fillStyle = f;
  g.beginPath();
  g.arc(760, 900, 80, 0, Math.PI * 2);
  g.fill();
  f = g.createRadialGradient(450, 1040, 10, 450, 1040, 360);
  f.addColorStop(0, "rgba(0,0,0,.7)");
  f.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = f;
  g.fillRect(0, 900, 900, 200);
  return c;
}
function testCanvas() {
  const W = 960, H = 720, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#111";
  g.fillRect(0, 0, W, H);
  const bars = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
  const bw = W / 7;
  bars.forEach((b, i) => {
    g.fillStyle = b;
    g.fillRect(i * bw, 0, bw + 1, H * 0.58);
  });
  const rev = ["#0000c0", "#111", "#c000c0", "#111", "#00c0c0", "#111", "#c0c0c0"];
  rev.forEach((b, i) => {
    g.fillStyle = b;
    g.fillRect(i * bw, H * 0.58, bw + 1, H * 0.08);
  });
  const ramp = g.createLinearGradient(0, 0, W, 0);
  ramp.addColorStop(0, "#000");
  ramp.addColorStop(1, "#fff");
  g.fillStyle = ramp;
  g.fillRect(0, H * 0.66, W, H * 0.1);
  g.fillStyle = "#fff";
  g.fillRect(0, H * 0.76, W * 0.25, H * 0.24);
  g.fillStyle = "#000";
  g.fillRect(W * 0.25, H * 0.76, W * 0.1, H * 0.24);
  g.fillStyle = "#222";
  g.fillRect(W * 0.35, H * 0.76, W * 0.65, H * 0.24);
  g.strokeStyle = "#fff";
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += 60) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.globalAlpha = 0.18;
    g.stroke();
    g.globalAlpha = 1;
  }
  for (let y = 0; y <= H; y += 60) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.globalAlpha = 0.18;
    g.stroke();
    g.globalAlpha = 1;
  }
  g.lineWidth = 5;
  g.beginPath();
  g.arc(W / 2, H * 0.4, H * 0.3, 0, Math.PI * 2);
  g.stroke();
  g.font = '700 54px "JetBrains Mono",monospace';
  g.textAlign = "center";
  g.fillStyle = "#fff";
  g.fillText("n0ise", W / 2, H * 0.42);
  g.font = '500 20px "JetBrains Mono",monospace';
  g.fillText("TEST SIGNAL", W / 2, H * 0.48);
  return c;
}
function curPal() {
  const id = P.pal;
  if (id === "src") return { mode: 0 };
  const def = PALS.find((p) => p.id === id);
  const cols = id === "custom" ? P.custom : def.c;
  const key2 = id + cols.join();
  if (V.palCache.key === key2) return V.palCache.v;
  const rgb = cols.map(hexRGB).sort((a, b) => lum255(a) - lum255(b));
  const n = Math.min(16, rgb.length);
  const flat = new Float32Array(48), lv = new Float32Array(16);
  for (let i = 0; i < n; i++) {
    flat[i * 3] = rgb[i][0] / 255;
    flat[i * 3 + 1] = rgb[i][1] / 255;
    flat[i * 3 + 2] = rgb[i][2] / 255;
    lv[i] = lum255(rgb[i]) / 255;
  }
  const v = { mode: 1, n, rgb, flat, lv, lo: lv[0], span: lv[n - 1] - lv[0] || 1, css: rgb.map((c) => `rgb(${c})`), bright: rgb[n - 1] };
  V.palCache = { key: key2, v };
  return v;
}
var KER = {
  fs: { d: 16, k: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  atk: { d: 8, k: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  jjn: { d: 48, k: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
  stucki: { d: 42, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  sierra: { d: 32, k: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]] },
  burkes: { d: 32, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] }
};
var KF = {};
function kern(method) {
  if (KF[method]) return KF[method];
  const K = KER[method];
  return KF[method] = { n: K.k.length, dx: Int32Array.from(K.k.map((a) => a[0])), dy: Int32Array.from(K.k.map((a) => a[1])), wt: Float32Array.from(K.k.map((a) => a[2] / K.d)) };
}
var POOL = {};
function pool(name, n, C2) {
  let a = POOL[name];
  if (!a || a.length !== n) {
    a = new C2(n);
    POOL[name] = a;
  }
  return a;
}
function diffuse(buf, w, h, lv, n, method, str, bias, idx) {
  const K = kern(method), pw = w + 4, kn = K.n, offs = new Int32Array(kn), wts = new Float32Array(kn);
  for (let k = 0; k < kn; k++) {
    offs[k] = K.dy[k] * pw + K.dx[k];
    wts[k] = K.wt[k] * str;
  }
  const sp = (lv[n - 1] - lv[0]) / Math.max(1, n - 1), bs = bias * sp;
  for (let y = 0; y < h; y++) {
    let i = y * pw + 2;
    for (let x = 0; x < w; x++, i++) {
      const old = buf[i], q = old + bs;
      let b = 0, bd = 1e9;
      for (let j = 0; j < n; j++) {
        const d = q > lv[j] ? q - lv[j] : lv[j] - q;
        if (d < bd) {
          bd = d;
          b = j;
        }
      }
      idx[y * w + x] = b;
      const e = old - lv[b];
      for (let k = 0; k < kn; k++) buf[i + offs[k]] += e * wts[k];
    }
  }
}
var CPU = { ms: 8, last: 0 };
function cpuProcess(raw, w, h, pal, method, str, bias, depth, quantTex) {
  const n = w * h, pw = w + 4, out = pool("out", n * 4, Uint8Array), idx = pool("idx", n, Uint8Array), buf = pool("buf", pw * (h + 3), Float32Array);
  out.fill(0);
  if (pal.mode === 1) {
    buf.fill(0);
    for (let y = 0; y < h; y++) {
      const o = (h - 1 - y) * w, bo = y * pw + 2;
      for (let x = 0; x < w; x++) {
        const i = (o + x) * 4;
        buf[bo + x] = pal.lo + (0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2]) / 255 * pal.span;
      }
    }
    diffuse(buf, w, h, pal.lv, pal.n, method, str, bias, idx);
    for (let y = 0; y < h; y++) {
      const o = (h - 1 - y) * w;
      for (let x = 0; x < w; x++) out[(o + x) * 4 + 3] = idx[y * w + x];
    }
  } else {
    const k = depth, lv = Float32Array.from({ length: k }, (_, i) => i / (k - 1));
    for (let ch = 0; ch < 3; ch++) {
      buf.fill(0);
      for (let y = 0; y < h; y++) {
        const o = (h - 1 - y) * w, bo = y * pw + 2;
        for (let x = 0; x < w; x++) buf[bo + x] = raw[(o + x) * 4 + ch] / 255;
      }
      diffuse(buf, w, h, lv, k, method, str, bias, idx);
      for (let y = 0; y < h; y++) {
        const o = (h - 1 - y) * w;
        for (let x = 0; x < w; x++) out[(o + x) * 4 + ch] = Math.round(lv[idx[y * w + x]] * 255);
      }
    }
    for (let i = 3; i < out.length; i += 4) out[i] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, quantTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
}
function cpuSync(rt2, pal, method, str, bias, depth, quantRT) {
  const raw = pool("raw", rt2.w * rt2.h * 4, Uint8Array);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt2.fbo);
  gl.readPixels(0, 0, rt2.w, rt2.h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  cpuProcess(raw, rt2.w, rt2.h, pal, method, str, bias, depth, quantRT.tex);
}
var RB = { pbo: null, size: 0, sync: null, w: 0, h: 0 };
function readStart(rt2) {
  const size = rt2.w * rt2.h * 4;
  if (!RB.pbo) RB.pbo = gl.createBuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt2.fbo);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, RB.pbo);
  if (RB.size !== size) {
    gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
    RB.size = size;
  }
  gl.readPixels(0, 0, rt2.w, rt2.h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  RB.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  RB.w = rt2.w;
  RB.h = rt2.h;
}
function readDrop() {
  if (RB.sync) {
    gl.deleteSync(RB.sync);
    RB.sync = null;
  }
}
function readFinish() {
  if (!RB.sync) return null;
  const st = gl.clientWaitSync(RB.sync, 0, 0);
  if (st === gl.TIMEOUT_EXPIRED) return null;
  const ok = st !== gl.WAIT_FAILED;
  readDrop();
  if (!ok) return null;
  const raw = pool("raw", RB.size, Uint8Array);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, RB.pbo);
  gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, raw);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  return raw;
}
function finishLive(pal, method) {
  const raw = readFinish();
  if (!raw) return;
  if (RB.w !== T.quant.w || RB.h !== T.quant.h) return;
  const t0 = performance.now();
  cpuProcess(raw, RB.w, RB.h, pal, method, E.dstr / 100, E.tbias / 100, E.depth, T.quant.tex);
  CPU.ms = lerp(CPU.ms, performance.now() - t0, 0.3);
}
var textCv = document.createElement("canvas");
var textCtx = textCv.getContext("2d");
function updateText(W, lines, H, pal, t) {
  if (!E.ton) {
    V.textKey = "";
    return;
  }
  const clock = (/* @__PURE__ */ new Date()).toTimeString().slice(0, 8);
  const cur = E.tcur && Math.floor(t * 2) % 2 === 0;
  const str = String(E.txt).replace(/\{t\}/g, clock);
  const key2 = [str, E.tsz, E.ty, cur, W, lines, H, pal.mode ? pal.bright.join() : "w"].join("|");
  if (key2 === V.textKey) return;
  V.textKey = key2;
  textCv.width = W;
  textCv.height = lines;
  const g = textCtx;
  g.setTransform(1, 0, 0, lines / H, 0, 0);
  g.clearRect(0, 0, W, H);
  const px = E.tsz / 100 * H;
  g.font = `500 ${px}px "JetBrains Mono",ui-monospace,Menlo,monospace`;
  g.textBaseline = "top";
  const c = pal.mode ? pal.bright : [255, 255, 255];
  g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  const ls = (str + (cur ? "\u2588" : "")).split("\n");
  ls.forEach((l, i) => g.fillText(l, W * 0.05, H * E.ty / 100 + i * px * 1.25));
  gl.bindTexture(gl.TEXTURE_2D, TEX.text);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, textCv);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
var noise1 = (t) => {
  const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f), h = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return h(i) * (1 - s) + h(i + 1) * s;
};
var audio = { on: false, level: 0, an: null, data: null, ctx: null };
var ST = { pwr: 1, pwrAnim: 1, pwrFrom: 1, pwrT0: -9, degT0: -99, chanT0: -99, rollAcc: 0, chanSwapped: true, paint: false, hold: false, autoQ: 1, okN: 0, clean: false };
function powerShape(t) {
  const el2 = t - ST.pwrT0;
  if (ST.pwr === 1) {
    const u2 = clamp(el2 / 0.9, 0, 1);
    if (u2 >= 1) return { sx: 1, sy: 1, gain: 1 };
    return { sx: sstep(0, 0.33, u2) * 0.995 + 5e-4, sy: 4e-3 + sstep(0.28, 1, u2) * 0.996, gain: 1 + (1 - sstep(0.28, 1, u2)) * 3 };
  }
  const u = clamp(el2 / 0.55, 0, 1);
  if (u >= 1) return { sx: 5e-4, sy: 4e-3, gain: 0 };
  const fall = 1 - u;
  return { sx: 5e-4 + sstep(0, 0.45, fall) * 0.995, sy: 4e-3 + sstep(0.4, 1, fall) * 0.996, gain: 1 + (1 - sstep(0.4, 1, fall)) * 3 * fall };
}
var STAGES = [
  ["cam", "Camera", [
    ["clean", "Clean", {}],
    ["tube", "Tube camera", { fblend: 30, hal: 40, blur: 1, clip: 8, contrast: 10 }],
    ["ccd", "CCD", { clip: 35, hal: 10, sharp: 30, csat: 115, rgbs: 6 }],
    ["filmcam", "Film camera", { hal: 55, contrast: 20, csat: 90, temp: 15 }],
    ["sec", "Security cam", { contrast: -10, csat: 0, blur: 1, clip: 20, sharp: 20 }],
    ["handy", "Handycam", { hal: 25, csat: 105, clip: 15, temp: -10 }]
  ]],
  ["med", "Medium", [
    ["live", "Live", {}],
    ["film", "Film print", { micro: 45, dust: 55, scr: 40, jit: 12, drift: 6, gen: 8, sati: 25 }],
    ["vhs", "VHS tape", { gen: 40, jit: 35, drift: 20, trk: 30, hsw: 60, drop: 30, vhold: 4, phs: 6 }],
    ["beta", "Betacam", { gen: 6, jit: 4, drop: 5 }],
    ["cctv", "Surveillance tape", { gen: 50, jit: 25, hsw: 35, drop: 45, trk: 35, sline: 10 }],
    ["worn", "Worn VHS", { gen: 65, drop: 55, trk: 60, hsw: 80, vhold: 15, jit: 55, drift: 35, rgbs: 15, tear: 12 }]
  ]],
  ["play", "Playback", [
    ["direct", "Direct", { lines: 576, lbw: 0, cbw: 0, ycs: 100 }],
    ["comp", "Composite", { lines: 480, lbw: 20, cbw: 40, ycs: 45, cper: 4, ring: 15 }],
    ["rf", "RF antenna", { lines: 240, lbw: 45, cbw: 60, ycs: 30, snr: 25, coh: 50, snow: 8, ghost: 12 }],
    ["svid", "S-Video", { lines: 480, lbw: 12, cbw: 18, ycs: 100 }],
    ["compo", "Component", { lines: 480, lbw: 5, cbw: 5, ycs: 100 }],
    ["weak", "Weak UHF", { lines: 200, lbw: 55, cbw: 70, snr: 40, coh: 60, snow: 20, ghost: 20, gdel: 30, ring: 30 }]
  ]],
  ["disp", "Display", [
    ["studio", "Studio CRT", {}],
    ["bw", "70s B&W", { phos: "3", csat: 0, mask: "0", mstr: 0, curv: 55, corner: 50, spot: 60, efoc: 50, scan: 35, beam: 60, bloom: 50, after: 40, dr: 60, dg: 60, db: 60, vig: 55, refl: 30, glare: 30, bez: 6, bsh: 60, iface: "1", iflk: 40, aging: 40 }],
    ["tv80", "80s TV", { mask: "2", mstr: 60, mpitch: 3, curv: 40, corner: 40, spot: 45, efoc: 35, scan: 45, bloom: 40, hal: 30, refl: 25, bez: 5, bsh: 50, aging: 35, iface: "1", iflk: 30 }],
    ["arcade", "Arcade", { mask: "3", mstr: 70, mpitch: 4, curv: 30, corner: 30, scan: 70, beam: 35, bloomb: 60, bloom: 55, hal: 35, refl: 30, glare: 25, vig: 40, csat: 130, bez: 6, bsh: 60, temp: 10 }],
    ["pc", "PC monitor", { mask: "1", mstr: 50, mpitch: 3, curv: 10, corner: 15, scan: 25, beam: 30, spot: 15, efoc: 20, bloom: 25, ar: 60, bez: 4, bsh: 40 }],
    ["port", "Portable TV", { mask: "2", mstr: 30, mpitch: 4, curv: 70, corner: 60, spot: 70, efoc: 60, scan: 30, vig: 55, aging: 60, bez: 8, bsh: 70, refl: 35, glare: 35 }],
    ["lcd", "Handheld LCD", { pal: "gameboy", method: "b4", px: 4, mask: "2", mstr: 35, mpitch: 2, mgap: 45, msoft: 10, scan: 0, beam: 0, curv: 0, corner: 10, spot: 0, efoc: 0, fblend: 40, vig: 15, bez: 8, bsh: 60, refl: 12, bloom: 0, hal: 0, after: 0, csat: 0 }],
    ["vec", "Vector", { phos: "1", pal: "mono", method: "off", edge: 100, mask: "0", mstr: 0, scan: 0, beam: 10, bloom: 90, brad: 70, hal: 40, dr: 400, dg: 400, db: 400, after: 85, curv: 30, corner: 30, csat: 0, bright: 20, contrast: 30 }],
    ["amber", "Amber terminal", { phos: "2", pal: "mono", csat: 0, mask: "0", mstr: 0, scan: 60, beam: 50, bloom: 60, hal: 40, dr: 120, dg: 120, db: 120, after: 70, burn: 40, curv: 35, corner: 35, spot: 40, vig: 45, refl: 25 }],
    ["green", "Green terminal", { phos: "1", pal: "mono", csat: 0, mask: "0", mstr: 0, scan: 60, beam: 50, bloom: 60, hal: 40, dr: 220, dg: 220, db: 220, after: 75, burn: 50, curv: 35, corner: 35, spot: 40, vig: 45, refl: 25 }],
    ["nvg", "Night vision", { phos: "1", pal: "phosphor", method: "off", csat: 0, mask: "0", mstr: 0, bloom: 90, brad: 40, hal: 55, vig: 95, corner: 100, curv: 0, scan: 10, bright: 25, contrast: 35, fbg: 12, fbz: 1, fbr: 0, fbh: 0 }],
    ["therm", "Thermal viewer", { pal: "custom", custom: ["#05001a", "#4b0a8c", "#d4145a", "#ff8c1a", "#fff6a8"], method: "off", blur: 2, csat: 0, mask: "0", mstr: 0, bloom: 45, hal: 30, vig: 25, curv: 0, corner: 20, scan: 8, spot: 60, contrast: 20 }]
  ]]
];
var stageModel = (sid, mid) => STAGES.find((s) => s[0] === sid)[2].find((m) => m[0] === mid);
var CHAINS = [
  ["Newsroom studio", ["tube", "live", "comp", "studio"]],
  ["Evening news 1984", ["tube", "live", "comp", "tv80"]],
  ["Home movie", ["filmcam", "film", "comp", "bw"]],
  ["Rental tape", ["ccd", "vhs", "comp", "tv80"]],
  ["Worn rental", ["ccd", "worn", "rf", "port"]],
  ["Camcorder replay", ["handy", "vhs", "svid", "pc"]],
  ["Edit suite", ["ccd", "beta", "compo", "pc"]],
  ["Shop CCTV", ["sec", "cctv", "comp", "green"]],
  ["Night patrol", ["sec", "cctv", "direct", "nvg"]],
  ["Arcade cabinet", ["clean", "live", "comp", "arcade"]],
  ["Pocket console", ["clean", "live", "direct", "lcd"]],
  ["Vector cabinet", ["clean", "live", "direct", "vec"]],
  ["Amber terminal", ["clean", "live", "direct", "amber"]],
  ["Green terminal", ["clean", "live", "direct", "green"]],
  ["Thermal inspection", ["ccd", "live", "direct", "therm"]],
  ["Pirate broadcast", ["tube", "live", "weak", "port"]],
  ["Late-night UHF", ["sec", "live", "rf", "tv80"]],
  ["Film on tube", ["filmcam", "film", "comp", "studio"]],
  ["Wedding on portable", ["handy", "vhs", "rf", "port"]],
  ["CCTV at 3am", ["sec", "worn", "weak", "bw"]],
  ["Bootleg arcade tape", ["ccd", "worn", "comp", "arcade"]],
  ["Archive reel", ["filmcam", "film", "direct", "bw"]],
  ["Dead channel", ["tube", "worn", "weak", "bw"]],
  ["Studio on S-Video", ["tube", "beta", "svid", "pc"]]
];
var MACROS = ["mWear", "mAge", "mBand", "mInst"];
function applyStages(stg) {
  const keep = {};
  MACROS.forEach((k) => keep[k] = P[k]);
  applyProfile("studio");
  stg.forEach((mid, i) => Object.assign(P, JSON.parse(JSON.stringify(stageModel(STAGES[i][0], mid)[2]))));
  MACROS.forEach((k) => P[k] = keep[k]);
  P.stg = stg.slice();
  P.profile = "chain";
}
function buildChainUI() {
  const g = hooks.group("display", "Chain");
  STAGES.forEach(([sid, name, models], i) => {
    g.appendChild(hooks.el("div", "cl", name));
    hooks.chipRow(g, models.map((m) => [m[0], m[1] + (m[2].pal ? " \u25D0" : "")]), "stg_" + sid, (id) => {
      const s = (P.stg || BASE.stg).slice();
      s[i] = id;
      applyStages(s);
      hooks.snap();
      hooks.refreshUI();
    });
  });
  g.appendChild(hooks.el("div", "cl", "Ready-made chains"));
  hooks.chipRow(g, CHAINS.map((c, i) => [String(i), c[0] + (c[1].some((mid, j) => stageModel(STAGES[j][0], mid)[2].pal) ? " \u25D0" : "")]), "chains", (i) => {
    applyStages(CHAINS[+i][1]);
    hooks.snap();
    hooks.refreshUI();
  });
}
function refreshChainUI() {
  STAGES.forEach(([sid], i) => document.querySelectorAll("#stg_" + sid + " .chip").forEach((b) => b.setAttribute("aria-pressed", P.profile === "chain" && b.dataset.v === (P.stg || [])[i])));
  document.querySelectorAll("#chains .chip").forEach((b) => b.setAttribute("aria-pressed", P.profile === "chain" && JSON.stringify(CHAINS[+b.dataset.v][1]) === JSON.stringify(P.stg)));
}
var EVT = [["tear", 60], ["rgbs", 70], ["drop", 80], ["snr", 35], ["trk", 70], ["hsw", 70], ["gblock", 50], ["sline", 50]];
function lifeStep(t, dt, add) {
  const cu = (v) => Math.pow(clamp(v / 100, 0, 1), 1.5);
  const wr = cu(P.mWear), ag = cu(P.mAge), bd = cu(P.mBand), ins = cu(P.mInst);
  if (wr) {
    add("dust", 60 * wr);
    add("scr", 45 * wr);
    add("smud", 50 * wr);
    add("burn", 40 * wr);
    add("micro", 25 * wr);
    add("aging", 50 * wr);
  }
  if (bd) {
    add("lbw", 60 * bd);
    add("cbw", 70 * bd);
    add("efoc", 40 * bd);
    add("spot", 30 * bd);
    E.lines = Math.max(60, E.lines * (1 - 0.6 * bd));
  }
  if (ins) {
    add("jit", 50 * ins);
    add("drift", 40 * ins);
    add("trk", 30 * ins);
    add("hsw", 30 * ins);
    add("vhold", 8 * ins);
  }
  if (ag) {
    const warm = Math.exp(-t / 60);
    add("aging", 60 * ag + Math.min(30, t / 8) * ag);
    add("sati", 50 * ag);
    add("convs", 40 * ag + 25 * warm * ag);
    add("conve", 45 * ag);
    add("cdrift", 60 * ag);
    add("gen", 25 * ag);
    add("temp", 18 * ag * Math.sin(t / 70 + P.seed) + 10 * warm * ag);
    add("cbri", -10 * warm * ag);
    if (t - (ST.lastDeg ?? 0) > 240) {
      ST.lastDeg = t;
      ST.degT0 = t;
    }
  }
  if (ST.rngSeed !== P.seed) {
    ST.rngSeed = P.seed;
    ST.rng = mulberry(P.seed * 7919 + 13);
    ST.ev = [];
    ST.hx = 0;
    ST.wS = 0;
    ST.wDwell = 0;
    ST.wl = 0;
    ST.ws = 0;
  }
  const rnd = ST.rng;
  const rate = P.grate / 100 * (0.02 + ins * 0.9);
  ST.hx *= Math.exp(-dt / 2);
  if (rate > 0) {
    const lam = rate + ST.hx;
    if (rnd() < 1 - Math.exp(-lam * dt) && ST.ev.length < 6) {
      const e = EVT[rnd() * EVT.length | 0];
      ST.ev.push({ k: e[0], a: e[1] * (0.4 + 0.6 * rnd()), t0: t, dur: 0.15 + rnd() * 1.1 });
      ST.hx += 0.5 + ins;
    }
  }
  ST.ev = ST.ev.filter((v) => t - v.t0 < v.dur + 0.25);
  for (const v of ST.ev) {
    const x = t - v.t0;
    let env;
    if (x < 0.04) env = x / 0.04;
    else if (x < 0.16) env = 1 - 0.4 * (x - 0.04) / 0.12;
    else if (x < v.dur) env = 0.6;
    else env = 0.6 * (1 - (x - v.dur) / 0.25);
    add(v.k, v.a * Math.max(0, env));
  }
  ST.wDwell += dt;
  const minDwell = [4, 8, 6][ST.wS];
  if (P.weather > 0 && ST.wDwell > minDwell) {
    const r = rnd(), pr = dt;
    let n = ST.wS;
    if (ST.wS === 0 && r < 0.08 * pr) n = 1;
    else if (ST.wS === 1) {
      if (r < 0.1 * pr) n = 2;
      else if (r < 0.22 * pr) n = 0;
    } else if (ST.wS === 2 && r < 0.25 * pr) n = 1;
    if (n !== ST.wS) {
      ST.wS = n;
      ST.wDwell = 0;
    }
  }
  const tl = [0, 0.6, 0.9][ST.wS], ts = ST.wS === 2 ? 1 : 0;
  ST.wl += (tl - ST.wl) * Math.min(1, dt * 1.2);
  ST.ws += (ts - ST.ws) * Math.min(1, dt * 1.5);
  return [ST.wl, ST.ws];
}
function computeE(t, dt) {
  Object.assign(E, P);
  for (const k of ["bit", "g", "s", "b", "m", "l", "gl"]) E["lay_" + k] = P.solo === "all" || P.solo === k;
  for (const m of MODS) {
    const c = CTL[m.target];
    if (!c || c.t !== "r") continue;
    let w;
    const ph = t * m.rate;
    switch (m.shape) {
      case "sine":
        w = Math.sin(ph * 6.2832);
        break;
      case "tri":
        w = 1 - 4 * Math.abs(ph % 1 - 0.5);
        break;
      case "square":
        w = ph % 1 < 0.5 ? 1 : -1;
        break;
      case "saw":
        w = 2 * (ph % 1) - 1;
        break;
      case "noise":
        w = noise1(ph * 3) * 2 - 1;
        break;
      case "audio":
        w = audio.level * 2 - 1;
        break;
      default:
        w = 0;
    }
    E[m.target] = clamp(E[m.target] + w * (m.depth / 100) * (c.max - c.min) / 2, c.min, c.max);
  }
  const wx = P.weather / 100, seed = P.seed;
  const ch = ST.chanT0 > -90 ? Math.max(0, 1 - (t - ST.chanT0) / 0.7) : 0;
  const add = (k, v) => {
    E[k] = clamp(E[k] + v, CTL[k].min, CTL[k].max);
  };
  const [lw, sw] = lifeStep(t, dt, add);
  const wl = wx * lw, ws = wx * sw;
  add("snr", wl * 30 + ws * 45 + ch * 80);
  add("jit", wl * 25 + ws * 40 + ch * 50);
  add("drift", wl * 15 + ws * 25);
  add("drop", ws * 60);
  add("trk", ws * 50);
  add("snow", ws * 30 + ch * 70);
  add("ghost", wl * 20);
  add("hsw", ch * 40);
  const vh = clamp(E.vhold / 100 + ch, 0, 1.5);
  ST.rollAcc = (ST.rollAcc + dt * vh * vh * 0.8) % 1;
  E.roll = vh > 0 ? (ST.rollAcc + 0.012 * vh * Math.sin(t * 40)) % 1 : 0;
  E.rollAmt = vh;
  if (ST.clean) {
    E.bez = 0;
    E.bsh = 0;
    E.corner = 0;
    E.over = 0;
    E.curv = 0;
    E.vig = Math.min(E.vig, 20);
  }
  E.glitchT = P.gfreeze ? ST.freezeT ?? (ST.freezeT = t) : (ST.freezeT = void 0, t);
}
var T = {};
var POINTER = { x: 0, y: 0 };
var PAINTQ = [];
var METHOD_ID = { off: 0, thr: 1, b4: 2, b8: 3, blue: 4, white: 5, half: 6 };
var PHOS_COL = [[1, 1, 1], [0.35, 1, 0.45], [1, 0.62, 0.14], [0.92, 0.95, 1], [0.35, 0.55, 1]];
function ensureTargets(DW, DH, lines, gw, gh) {
  const key2 = [DW, DH, lines, gw, gh, V.HDR].join();
  if (key2 === V.sizeKey) return;
  V.sizeKey = key2;
  Object.keys(T).forEach((k) => {
    freeRT(T[k]);
    delete T[k];
  });
  const nn = { filter: gl.NEAREST };
  T.tone = mkRT(gw, gh, nn);
  T.quant = mkRT(gw, gh, nn);
  T.sigIn = mkRT(DW, lines, { hdr: true });
  T.yiq = mkRT(DW, lines, { hdr: true });
  T.sig = mkRT(DW, lines, { hdr: true });
  T.crt = mkRT(DW, DH, { hdr: true });
  T.pA = mkRT(DW, DH, { hdr: true });
  T.pB = mkRT(DW, DH, { hdr: true });
  const bs = (d) => [Math.max(4, DW / d), Math.max(4, DH / d)];
  T.bA1 = mkRT(...bs(4), { hdr: true });
  T.bA2 = mkRT(...bs(4), { hdr: true });
  T.bB1 = mkRT(...bs(8), { hdr: true });
  T.bB2 = mkRT(...bs(8), { hdr: true });
  T.bC1 = mkRT(...bs(16), { hdr: true });
  T.bC2 = mkRT(...bs(16), { hdr: true });
  V.lastBKey = "";
}
var SZ = { w: 0, h: 0, cw: 0, ch: 0 };
function exportCap() {
  const mt = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  return Math.min(mt, matchMedia("(pointer:coarse)").matches ? 4096 : 6144);
}
function expDims(cw, ch, mul) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let DW = Math.round(cw * dpr * mul), DH = Math.round(ch * dpr * mul);
  const cap = ST.expCap || exportCap(), m = Math.max(DW, DH);
  if (m > cap) {
    DW = Math.round(DW * cap / m);
    DH = Math.round(DH * cap / m);
  }
  const px = DW * DH;
  if (px > 24e6) {
    const k = Math.sqrt(24e6 / px);
    DW = Math.round(DW * k);
    DH = Math.round(DH * k);
  }
  return [DW & ~1, DH & ~1];
}
var EMBED = /[?&]embed=1/.test(location.search);
if (EMBED) document.documentElement.dataset.embed = "1";
var EMB = { w: 0, h: 0, ok: false };
function layout() {
  const srcAsp = ST.ovr ? ST.ovr.w / ST.ovr.h : SRC.w / SRC.h;
  let asp = srcAsp;
  if (E.aspect !== "src") {
    const [a, b] = E.aspect.split(":").map(Number);
    asp = a / b;
  }
  if (!SZ.w) {
    SZ.w = stage ? stage.clientWidth : EMB.w || 640;
    SZ.h = stage ? stage.clientHeight : EMB.h || 480;
  }
  const sw = Math.max(40, SZ.w - 16), sh = Math.max(40, SZ.h - 16);
  let cw = sw, ch = sw / asp;
  if (ch > sh) {
    ch = sh;
    cw = sh * asp;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1), q = parseFloat(E.quality) * ST.autoQ;
  let DW = Math.round(cw * dpr * q), DH = Math.round(ch * dpr * q);
  if (ST.expMul >= 1) {
    [DW, DH] = expDims(cw, ch, ST.expMul);
  } else {
    const m = Math.max(DW, DH);
    if (m > 1800) {
      DW = Math.round(DW * 1800 / m);
      DH = Math.round(DH * 1800 / m);
    }
  }
  if (EMB.w) {
    DW = EMB.w;
    DH = EMB.h;
  }
  DW = Math.max(160, DW & ~1);
  DH = Math.max(120, DH & ~1);
  if (!stage) {
    SZ.cw = cw;
    SZ.ch = ch;
  }
  if (cw !== SZ.cw || ch !== SZ.ch) {
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    SZ.cw = cw;
    SZ.ch = ch;
  }
  if (canvas.width !== DW || canvas.height !== DH) {
    canvas.width = DW;
    canvas.height = DH;
  }
  return { srcAsp, asp: DW / DH, DW, DH };
}
function syncSrc() {
  const se = SRC.el;
  if (se instanceof HTMLVideoElement) {
    if (se.paused && !se.srcObject && !document.hidden) se.play().catch(() => {
    });
    if (se.readyState >= 2 && (se.currentTime !== SRC.lastT || SRC.lastVer !== SRC.ver)) {
      SRC.lastT = se.currentTime;
      SRC.lastVer = SRC.ver;
      uploadSrc();
    }
  } else if (SRC.gif) hooks.stepGif();
  else if (SRC.viz && hooks.AUD.on) {
    hooks.audFrame();
    uploadSrc();
  }
}
function renderFrame(t, dt, OUT) {
  if (ST.eT !== t) computeE(t, dt);
  const SW2 = ST.ovr ? ST.ovr.w : SRC.w, SH = ST.ovr ? ST.ovr.h : SRC.h, STEX = ST.ovr ? ST.ovr.tex : TEX.src;
  const L = layout(), { srcAsp, asp, DW, DH } = L;
  ST.DW = DW;
  ST.DH = DH;
  const k = DW / 1e3;
  const lines = Math.round(clamp(E.lines, 60, 720));
  let gw = Math.max(16, Math.round(1e3 / E.px)), gh = Math.max(8, Math.round(gw / asp));
  if (SRC.live && METHOD_ID[E.lay_bit ? E.method : "off"] === void 0) {
    const c = Math.sqrt(7e4 / (gw * gh));
    if (c < 1) {
      gw = Math.max(16, Math.round(gw * c));
      gh = Math.max(8, Math.round(gw / asp));
    }
  }
  ensureTargets(DW, DH, lines, gw, gh);
  gl.bindVertexArray(vaoEmpty);
  gl.disable(gl.BLEND);
  syncSrc();
  const pal = curPal();
  const palKey = pal.mode ? V.palCache.key : "src";
  const prevP = V.pIdx ? T.pB : T.pA, newP = V.pIdx ? T.pA : T.pB;
  if (ST.hold) {
    bindRT(null);
    PR.orig.use();
    samp(PR.orig, "uSrc", 0, STEX);
    PR.orig.f("uSrcAsp", srcAsp);
    PR.orig.f("uScrAsp", asp);
    draw();
    return;
  }
  const method = E.lay_bit ? E.method : "off";
  const gpuM = METHOD_ID[method] !== void 0;
  const bkey = [
    SRC.ver,
    SRC.live ? V.frameNo : 0,
    gw,
    gh,
    asp,
    method,
    E.pal,
    palKey,
    E.depth,
    E.dstr,
    E.tbias,
    E.anim && gpuM ? V.frameNo : 0,
    E.bright,
    E.contrast,
    E.mid,
    E.high,
    E.sat,
    E.hue,
    E.blur,
    E.sharp,
    E.edge,
    E.invert
  ].join("|");
  const cpuM = !gpuM;
  let doBitmap = bkey !== V.lastBKey;
  if (doBitmap && cpuM) {
    if (SRC.live) {
      if (RB.sync) doBitmap = false;
    } else if (performance.now() - CPU.last < Math.min(250, CPU.ms * 2.5)) doBitmap = false;
  }
  if (cpuM && SRC.live) finishLive(pal, method);
  else readDrop();
  if (doBitmap) {
    V.lastBKey = bkey;
    const r = asp / srcAsp, visW = SW2 * (r > 1 ? 1 : r);
    const tp = PR.tone;
    bindRT(T.tone);
    tp.use();
    samp(tp, "uSrc", 0, STEX);
    tp.f("uSrcAsp", srcAsp);
    tp.f("uScrAsp", asp);
    tp.v2("uTexel", 1 / SW2, 1 / SH);
    tp.f("uSpread", Math.max(0.5, visW / gw * 0.5));
    tp.f("uBlur", E.blur);
    tp.f("uSharp", E.sharp);
    tp.f("uEdge", E.edge / 100);
    tp.f("uBright", E.bright / 200);
    tp.f("uContrast", Math.tan((Math.min(E.contrast, 98) / 100 + 1) * Math.PI / 4));
    tp.f("uMid", Math.pow(2, -E.mid / 50));
    tp.f("uHigh", E.high / 100 * 0.3);
    tp.f("uSat", 1 + E.sat / 100);
    tp.f("uHue", E.hue * Math.PI / 180);
    tp.f("uInv", E.invert ? 1 : 0);
    draw();
    if (gpuM) {
      const qp = PR.quant;
      bindRT(T.quant);
      qp.use();
      samp(qp, "uTone", 0, T.tone.tex);
      samp(qp, "uBay4", 1, TEX.bay4);
      samp(qp, "uBay8", 2, TEX.bay8);
      samp(qp, "uBlue", 3, TEX.blue);
      qp.i("uMethod", METHOD_ID[method]);
      qp.i("uPalN", pal.n || 1);
      qp.i("uPalMode", pal.mode);
      if (pal.mode) {
        qp.fv("uLv", pal.lv);
        qp.f("uLo", pal.lo);
        qp.f("uSpan", pal.span);
      }
      qp.f("uDepth", E.depth);
      qp.f("uStr", E.dstr / 100);
      qp.f("uBias", E.tbias / 100);
      qp.f("uCell", 5);
      const fo = E.anim ? V.frameNo : 0;
      qp.v2("uOff", fo * 7 % 64, fo * 13 % 64);
      qp.v2("uGrid", gw, gh);
      draw();
    } else if (SRC.live) {
      readStart(T.tone);
    } else {
      const t0 = performance.now();
      cpuSync(T.tone, pal, method, E.dstr / 100, E.tbias / 100, E.depth, T.quant);
      CPU.ms = lerp(CPU.ms, performance.now() - t0, 0.5);
      CPU.last = performance.now();
    }
  }
  const gp = PR.glitch;
  bindRT(T.sigIn);
  gp.use();
  samp(gp, "uQ", 0, T.quant.tex);
  samp(gp, "uPrev", 1, prevP.tex);
  samp(gp, "uText", 2, TEX.text);
  gp.v2("uGrid", gw, gh);
  if (pal.mode) gp.v3v("uPal", pal.flat);
  gp.i("uPalN", pal.n || 1);
  gp.i("uPalMode", pal.mode);
  gp.i("uInterp", method === "off" && pal.mode ? 1 : 0);
  gp.f("uCyc", E.cycle * t);
  gp.f("uLines", lines);
  gp.f("uTime", t);
  gp.f("uGT", E.glitchT);
  gp.f("uSeed", E.seed);
  gp.f("uAct", 0.05 + 0.95 * E.grate / 100);
  gp.f("uAsp", asp);
  const gOn = E.lay_g ? E.gamt / 100 : 0;
  gp.f("uRgb", E.rgbs / 100 * gOn);
  gp.f("uTear", E.tear / 100 * gOn);
  gp.f("uSline", E.sline / 100 * gOn);
  gp.f("uBlock", E.gblock / 100 * gOn);
  gp.f("uDrag", E.drag / 100 * gOn);
  gp.f("uBand", E.band / 100 * gOn);
  gp.f("uInvc", E.ginv / 100 * gOn);
  gp.f("uBurst", E.burst / 100 * gOn);
  gp.f("uCrush", E.crush / 100 * gOn);
  const wOn = E.lay_g ? 1 : 0;
  gp.f("uWA", E.wamp / 100 * 0.06 * wOn);
  gp.f("uWF", E.wfreq);
  gp.f("uWS", E.wspd / 100 * 6);
  gp.f("uWFM", E.wfm / 100);
  gp.f("uWFMR", E.wfmr);
  gp.f("uWAM", E.wam / 100);
  gp.f("uWAMR", E.wamr);
  gp.f("uWPH", E.wph / 100);
  gp.f("uW2", E.w2 / 100);
  gp.f("uW2F", E.w2f);
  gp.i("uWSh", +E.wshape);
  gp.i("uWAx", +E.waxis);
  gp.f("uScope", E.scope / 100 * wOn);
  gp.f("uFbg", E.fbg / 100 * 0.9 * wOn);
  gp.f("uFbz", E.fbz / 100);
  gp.f("uFbr", E.fbr * Math.PI / 180);
  gp.f("uFbx", E.fbx / 1e3);
  gp.f("uFby", E.fby / 1e3);
  gp.f("uFbh", E.fbh * Math.PI / 180);
  updateText(DW, lines, DH, pal, t);
  gp.i("uTextOn", E.ton ? 1 : 0);
  draw();
  if (E.lay_s && +E.cmode !== 2) {
    const gen = E.gen / 100;
    const sA = PR.sigA;
    bindRT(T.yiq);
    sA.use();
    samp(sA, "uSrc", 0, T.sigIn.tex);
    sA.v2("uRes", DW, lines);
    sA.i("uFrame", V.frameNo);
    sA.i("uStd", +E.std);
    sA.f("uTime", t);
    sA.f("uSeed", E.seed);
    sA.f("uPer", Math.max(2.2, E.cper * k));
    sA.f("uSL", Math.max(0.35, (0.3 + E.lbw / 100 * 3.2 + gen * 1.5) * k));
    sA.f("uSC", Math.max(0.6, (1.2 + E.cbw / 100 * 3.5) * k));
    sA.f("uYC", +E.cmode === 1 ? 1 : E.ycs / 100);
    sA.f("uSnr", E.snr / 100 * (1 + gen * 0.8));
    sA.f("uCoh", E.coh / 100);
    sA.f("uSnow", E.snow / 100);
    sA.f("uGhost", E.ghost / 100);
    sA.f("uGD", E.gdel * k);
    sA.f("uJit", E.jit / 100 * 12 * k);
    sA.f("uDrift", E.drift / 100 * 10 * k);
    sA.f("uTrk", E.trk / 100);
    sA.f("uTJ", E.tjit / 100);
    sA.f("uRG", E.rgho / 100);
    sA.f("uGS", E.gspr * k);
    sA.f("uGDec", E.gdec / 100);
    sA.f("uHsw", E.hsw / 100);
    sA.f("uDrop", E.drop / 100);
    sA.f("uClip", E.clip / 100);
    sA.f("uCsat", E.csat / 100 * (1 - gen * 0.35));
    sA.f("uPhase", E.phs * Math.PI / 180);
    draw();
    const sB = PR.sigB;
    bindRT(T.sig);
    sB.use();
    samp(sB, "uY", 0, T.yiq.tex);
    sB.v2("uRes", DW, lines);
    sB.f("uTau", E.cbw / 100 * 5 + 0.01);
    sB.f("uStep", (1 + E.cbw / 100 * 2.5) * k);
    sB.f("uRing", E.ring / 100 * 0.8);
    sB.f("uPop", E.pop / 100);
    sB.f("uGenBlur", gen * 0.5);
    draw();
  } else {
    bindRT(T.sig);
    PR.copy.use();
    samp(PR.copy, "uT", 0, T.sigIn.tex);
    draw();
  }
  const hw = hardware(E.seed), pw = powerShape(t);
  const cp = PR.crt;
  bindRT(T.crt);
  cp.use();
  samp(cp, "uSig", 0, T.sig.tex);
  cp.v2("uRes", DW, DH);
  cp.v2("uHwGeo", hw.geo[0], hw.geo[1]);
  const tmp = E.temp / 100, wp = tmp > 0 ? [1, 1 - 0.1 * tmp, 1 - 0.35 * tmp] : [1 + 0.3 * tmp, 1 + 0.05 * tmp, 1];
  cp.v3("uWhite", wp[0], wp[1], wp[2]);
  const ag = E.aging / 100;
  cp.v3("uGain", E.gr / 100 * lerp(1, hw.gain[0], ag * 2), E.gg / 100 * lerp(1, hw.gain[1], ag * 2), E.gb / 100 * lerp(1, hw.gain[2], ag * 2));
  cp.v3("uHwConv", hw.conv[0], hw.conv[1], hw.conv[2]);
  {
    const h = (E.ptint % 360 + 360) % 360 / 60, x = 1 - Math.abs(h % 2 - 1), rgb = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
    cp.v3("uPT", 0.35 + rgb[0] * 0.65, 0.35 + rgb[1] * 0.65, 0.35 + rgb[2] * 0.65);
    cp.f("uPTA", E.ptamt / 100);
  }
  cp.i("uMask", E.lay_m ? +E.mask : 0);
  cp.i("uPhos", +E.phos);
  cp.f("uLines", lines);
  cp.f("uTime", t);
  cp.f("uSeed", E.seed);
  cp.f("uField", V.frameNo % 2);
  cp.f("uInter", +E.iface);
  cp.f("uIflk", E.iflk / 100);
  cp.f("uCurv", E.curv / 100);
  cp.f("uCorner", E.corner / 100);
  cp.f("uOver", E.over / 100);
  const lb = E.lay_b ? 1 : 0;
  cp.f("uConvS", E.convs / 100 * lb);
  cp.f("uConvE", E.conve / 100 * lb);
  cp.f("uCdrift", E.cdrift / 100);
  cp.f("uAging", ag);
  cp.f("uSX", pw.sx);
  cp.f("uSY", pw.sy);
  cp.f("uGainP", pw.gain);
  cp.f("uDegT", Math.min(99, t - ST.degT0));
  cp.f("uRoll", E.roll);
  cp.f("uRollAmt", E.rollAmt);
  cp.f("uScan", E.scan / 100 * lb);
  cp.f("uBeamMin", 0.1 + 0.35 * E.beam / 100);
  cp.f("uBeamGrow", 0.28 * E.bloomb / 100 * lb);
  cp.f("uSpot", E.spot / 100 * lb);
  cp.f("uEfoc", E.efoc / 100 * lb);
  cp.f("uMStr", E.mstr / 100);
  cp.f("uMPitch", Math.max(3, E.mpitch * DW / 900));
  cp.f("uMSoft", E.msoft / 100);
  cp.f("uMGap", E.mgap / 100);
  cp.f("uBlk", E.blkl / 400);
  cp.f("uGam", E.gam / 100);
  cp.f("uCon", E.ccon / 100);
  cp.f("uBri", E.cbri / 200);
  cp.f("uSati", E.sati / 100);
  draw();
  const pp = PR.persist;
  bindRT(newP);
  pp.use();
  samp(pp, "uCrt", 0, T.crt.tex);
  samp(pp, "uPrev", 1, prevP.tex);
  const tauMin = ST.paint ? 700 : 0;
  const dec = (ms) => {
    const m = Math.max(ms, tauMin);
    return m > 0 ? Math.exp(-dt * 1e3 / m) : 0;
  };
  pp.v3("uDecay", dec(E.dr), dec(E.dg), dec(E.db));
  pp.f("uAfter", ST.paint ? 1 : E.after / 100);
  pp.f("uBlend", E.fblend / 100);
  pp.f("uEps", T.pA.hdr ? 5e-4 : 6e-3);
  pp.f("uBurnRate", dt * 0.15 * E.burn / 100);
  draw();
  if (PAINTQ.length) {
    gl.bindVertexArray(vaoPaint);
    const arr = new Float32Array(PAINTQ.length * 3);
    PAINTQ.forEach((p, i) => {
      arr[i * 3] = p[0];
      arr[i * 3 + 1] = p[1];
      arr[i * 3 + 2] = p[2] * DW / 1e3;
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, paintBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    PR.paint.use();
    const pc = PHOS_COL[+E.phos];
    PR.paint.v3("uCol", pc[0] * 1.3, pc[1] * 1.3, pc[2] * 1.3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.colorMask(true, true, true, false);
    gl.drawArrays(gl.POINTS, 0, PAINTQ.length);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(vaoEmpty);
    PAINTQ.length = 0;
  }
  if (E.lay_l) {
    const blur = (src, tmpRT, dst) => {
      const b = PR.blur;
      b.use();
      bindRT(tmpRT);
      samp(b, "uT", 0, src.tex);
      b.v2("uDir", 1 / src.w, 0);
      draw();
      bindRT(dst);
      samp(b, "uT", 0, tmpRT.tex);
      b.v2("uDir", 0, 1 / tmpRT.h);
      draw();
    };
    bindRT(T.bA1);
    PR.bright.use();
    samp(PR.bright, "uT", 0, newP.tex);
    draw();
    blur(T.bA1, T.bA2, T.bA1);
    bindRT(T.bB1);
    PR.copy.use();
    samp(PR.copy, "uT", 0, T.bA1.tex);
    draw();
    blur(T.bB1, T.bB2, T.bB1);
    if (!ST.lite) {
      bindRT(T.bC1);
      PR.copy.use();
      samp(PR.copy, "uT", 0, T.bB1.tex);
      draw();
      blur(T.bC1, T.bC2, T.bC1);
    }
  }
  const fp = PR.final;
  bindRT(OUT || null);
  fp.use();
  samp(fp, "uP", 0, newP.tex);
  samp(fp, "uBA", 1, T.bA1.tex);
  samp(fp, "uBB", 2, T.bB1.tex);
  samp(fp, "uBC", 3, (ST.lite ? T.bB1 : T.bC1).tex);
  fp.v2("uRes", DW, DH);
  fp.v2("uPointer", POINTER.x, POINTER.y);
  fp.f("uSeed", E.seed);
  fp.f("uTime", t);
  fp.f("uBloom", E.bloom / 100);
  fp.f("uBrad", E.brad / 100);
  fp.f("uHal", E.hal / 100);
  fp.f("uDiff", E.diff / 100);
  fp.f("uRefl", E.refl / 100);
  fp.f("uAR", E.ar / 100);
  fp.f("uGlare", E.glare / 100);
  fp.f("uTint", E.tint / 100);
  fp.f("uDust", E.dust / 100);
  fp.f("uScr", E.scr / 100);
  fp.f("uSmud", E.smud / 100);
  fp.f("uMicro", E.micro / 100);
  fp.f("uVig", E.vig / 100);
  fp.f("uBez", E.bez / 100);
  fp.f("uBsh", E.bsh / 100);
  fp.f("uRoom", E.room / 100);
  fp.f("uPara", E.para / 100);
  fp.f("uBurnAmt", E.burn / 100);
  fp.f("uLayL", E.lay_l ? 1 : 0);
  fp.f("uLayG", E.lay_gl ? 1 : 0);
  draw();
  V.pIdx ^= 1;
  V.infoStr = `${(PROFILES.find((p) => p[0] === P.profile) || [0, "Custom"])[1]}, ${gw} \xD7 ${gh}, ${lines} lines, ${Math.round(V.fps)} fps${V.HDR ? "" : ", 8-bit"}`;
}
var peakFps = 30;
var CTX = { lost: false };
function adaptQ() {
  peakFps = Math.max(V.fps, peakFps * 0.99);
  const tgt = Math.min(peakFps, 60);
  if (V.fps < tgt * 0.8 && ST.autoQ > 0.45) {
    ST.autoQ = Math.max(0.45, ST.autoQ * 0.85);
    ST.okN = 0;
  } else if (V.fps >= tgt * 0.93 && ST.autoQ < 1 && ++ST.okN >= 8) {
    ST.autoQ = Math.min(1, ST.autoQ * 1.08);
    ST.okN = 0;
  }
  ST.lite = ST.autoQ < 0.6;
}

// src/studio-adapter.js
var { P: P2, E: E2, CT: CT2, CTL: CTL2, TABS: TABS2, PALS: PALS2, PROFILES: PROFILES2, applyProfile: applyProfile2, ST: ST2, SRC: SRC2, hexRGB: hexRGB2, lum255: lum2552, clamp: clamp2, V: V2, T: T2, PR: PR2, RB: RB2, EMB: EMB2, TEX: TEX2 } = engine_exports;
function createN0() {
  let out = null, fn = 0;
  const EXT = { w: 640, h: 480 };
  const dummy = { width: 0, height: 0, style: {} };
  return {
    P: P2,
    E: E2,
    CT: CT2,
    CTL: CTL2,
    TABS: TABS2,
    PALS: PALS2,
    PROFILES: PROFILES2,
    applyProfile: applyProfile2,
    ST: ST2,
    SRC: SRC2,
    hexRGB: hexRGB2,
    lum255: lum2552,
    clamp: clamp2,
    attach(gl3) {
      attachGL(dummy, null, gl3);
      initGL();
      initLUT();
    },
    setSize(w, h) {
      EXT.w = Math.max(160, w & ~1);
      EXT.h = Math.max(120, h & ~1);
      SRC2.w = EXT.w;
      SRC2.h = EXT.h;
      EMB2.w = EXT.w;
      EMB2.h = EXT.h;
    },
    render(srcTex, t, dt, live, frame2) {
      TEX2.src = srcTex;
      SRC2.live = !!live;
      V2.frameNo = frame2 != null ? frame2 : fn++;
      if (!out || out.w !== EXT.w || out.h !== EXT.h) {
        if (out) freeRT(out);
        out = mkRT(EXT.w, EXT.h, {});
      }
      renderFrame(t, dt, out);
      return out.tex;
    },
    resetGL() {
      Object.keys(T2).forEach((k) => {
        freeRT(T2[k]);
        delete T2[k];
      });
      if (out) freeRT(out);
      out = null;
      V2.sizeKey = "";
      V2.lastBKey = "";
      V2.palCache = { key: "", v: null };
      V2.textKey = "";
      V2.pIdx = 0;
      RB2.pbo = null;
      RB2.sync = null;
      RB2.size = 0;
    },
    blit(srcTex) {
      const gl3 = gl;
      gl3.bindVertexArray(vaoEmpty);
      bindRT(null);
      PR2.orig.use();
      samp(PR2.orig, "uSrc", 0, srcTex);
      PR2.orig.f("uSrcAsp", 1);
      PR2.orig.f("uScrAsp", 1);
      draw();
      gl3.bindVertexArray(null);
      gl3.useProgram(null);
    },
    GLH: { mkProg: (f) => mkProg(VS, f), HEAD, bindRT, samp, draw, get vao() {
      return vaoEmpty;
    }, get T() {
      return T2;
    } },
    get HDR() {
      return V2.HDR;
    }
  };
}

// src/studio3d.js
var N0 = createN0();
var $2 = (s, r = document) => r.querySelector(s);
var el = (t, c, h) => {
  const e = document.createElement(t);
  if (c) e.className = c;
  if (h != null) e.innerHTML = h;
  return e;
};
var clamp3 = (v, a, b) => Math.min(b, Math.max(a, v));
var lerp2 = (a, b, t) => a + (b - a) * t;
var toastT = 0;
function toast(m, ms = 2600) {
  let t = $2(".toast");
  if (!t) {
    t = el("div", "toast");
    document.body.appendChild(t);
  }
  t.textContent = m;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    t.hidden = true;
  }, ms);
}
var tick = () => new Promise((r) => requestAnimationFrame(() => r()));
var noGL2 = (msg) => {
  const e = $2("#err");
  e.hidden = false;
  e.textContent = msg;
};
var stage2 = $2("#stage");
var canvas2 = $2("#gl");
var S = {
  objs: [],
  sel: null,
  view: "shaded",
  fx: true,
  hold: false,
  grid: true,
  spin: false,
  gizmo: null,
  q: 0.8,
  mask: { mode: 2, focus: 3, range: 1.2, soft: 0.6, inv: false, amt: 1 },
  bg: "#0b0b0c",
  env: 0.5,
  liveUntil: 0,
  ver: 0
};
var renderer = null;
var gl2 = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvas2, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  gl2 = renderer.getContext();
} catch (e) {
  noGL2("This browser can\u2019t start WebGL 2, which the studio needs. Try a recent Safari, Chrome or Firefox.");
}
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
camera.position.set(2.6, 1.8, 3.4);
var controls = new OrbitControls(camera, canvas2);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.target.set(0, 0.9, 0);
controls.minDistance = 0.3;
controls.maxDistance = 60;
controls.autoRotateSpeed = 2.4;
var world = new THREE.Group();
scene.add(world);
var hemi = new THREE.HemisphereLight(16777215, 4473930, 0.35);
scene.add(hemi);
var key = new THREE.DirectionalLight(16777215, 1.5);
key.position.set(3, 5, 4);
scene.add(key);
var rim = new THREE.DirectionalLight(11188479, 0.5);
rim.position.set(-4, 2, -3);
scene.add(rim);
var envTex = null;
function setupEnv() {
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = S.env;
  } catch (e) {
    console.warn("env failed", e);
  }
}
var grid = new THREE.GridHelper(12, 24, 6710896, 3092278);
grid.material.transparent = true;
grid.material.opacity = 0.4;
scene.add(grid);
var tc = new TransformControls(camera, canvas2);
tc.setSize(0.8);
var tcHelper = tc.getHelper ? tc.getHelper() : tc;
scene.add(tcHelper);
tcHelper.traverse((n) => {
  n.userData.noView = true;
});
tc.addEventListener("dragging-changed", (e) => {
  controls.enabled = !e.value;
});
var pivotH = new THREE.Object3D();
scene.add(pivotH);
function setPivotWorld(o, P3) {
  const h = o.holder, r = o.root;
  h.updateMatrixWorld(true);
  r.updateMatrixWorld(true);
  const oldW = r.matrixWorld.clone();
  h.position.copy(h.parent ? h.parent.worldToLocal(P3.clone()) : P3);
  h.updateMatrixWorld(true);
  new THREE.Matrix4().copy(h.matrixWorld).invert().multiply(oldW).decompose(r.position, r.quaternion, r.scale);
  r.updateMatrixWorld(true);
  setSelBox();
  bump();
}
function setPivotMode(on) {
  const o = objById(S.sel);
  S.pivot = !!(on && o);
  if (S.pivot) {
    if (S.rest) leaveRest();
    o.holder.updateMatrixWorld(true);
    pivotH.position.setFromMatrixPosition(o.holder.matrixWorld);
    tc.attach(pivotH);
    tc.setMode("translate");
  } else {
    tc.detach();
    if (o && S.gizmo) {
      tc.attach(o.holder);
      tc.setMode(S.gizmo);
    }
  }
  bump();
}
function pivotTo(o, where) {
  if (S.rest) leaveRest();
  const b = holderBox(o.holder), P3 = new THREE.Vector3();
  if (where === "origin") P3.set(0, 0, 0);
  else if (b.isEmpty()) return;
  else {
    b.getCenter(P3);
    if (where === "base") P3.y = b.min.y;
  }
  setPivotWorld(o, P3);
  if (S.pivot) pivotH.position.copy(P3);
}
tc.addEventListener("objectChange", () => {
  if (S.pivot && tc.object === pivotH) {
    const o = objById(S.sel);
    if (o) setPivotWorld(o, pivotH.position);
  }
  bump();
  refreshInspector && refreshInspector(true);
});
var selBox = null;
var rt = null;
var maskRT = null;
var curW = 0;
var curH = 0;
var needResize = true;
function makeTargets(w, h) {
  if (rt) rt.dispose();
  if (maskRT) maskRT.dispose();
  const mk = (samples) => {
    const r = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples, depthBuffer: true, colorSpace: THREE.SRGBColorSpace });
    r.depthTexture = new THREE.DepthTexture(w, h);
    return r;
  };
  rt = mk(4);
  maskRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
}
var ro = new ResizeObserver(() => {
  needResize = true;
});
ro.observe(stage2);
function resize() {
  const r = stage2.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = Math.round(r.width * dpr * S.q), H = Math.round(r.height * dpr * S.q);
  const cap = S.big ? 3600 : 1800, m = Math.max(W, H);
  if (m > cap) {
    W = Math.round(W * cap / m);
    H = Math.round(H * cap / m);
  }
  W = Math.max(160, W & ~1);
  H = Math.max(160, H & ~1);
  needResize = false;
  if (W === curW && H === curH) return;
  curW = W;
  curH = H;
  canvas2.width = W;
  canvas2.height = H;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  makeTargets(W, H);
  N0.setSize(W, H);
  camera.aspect = W / H;
  viewOffY = -1;
  bump();
}
var viewOffY = -1;
function applyViewOffset() {
  const sh = sheet.coverPx();
  const stH = stage2.clientHeight || 1;
  const off = Math.round(sh * (curH / stH) / 2 * 10) / 10;
  if (Math.abs(off - viewOffY) < 0.4) return;
  viewOffY = off;
  if (off <= 0.5) {
    camera.clearViewOffset();
  } else camera.setViewOffset(curW, curH, 0, off, curW, curH);
  camera.updateProjectionMatrix();
  bump();
}
var bump = () => {
  S.ver++;
  N0.SRC.ver = S.ver;
  S.liveUntil = performance.now() + 450;
};
controls.addEventListener("change", bump);
var idc = 0;
var objById = (id) => S.objs.find((o) => o.id === id);
var claymat = new THREE.MeshStandardMaterial({ color: 14210252, roughness: 0.92, metalness: 0 });
var normmat = new THREE.MeshNormalMaterial();
var depthmat = new THREE.MeshDepthMaterial();
var wiremat = new THREE.MeshBasicMaterial({ color: 16777215, wireframe: true });
function applyView() {
  depthmat.depthPacking = THREE.BasicDepthPacking;
  scene.traverse((o) => {
    if (!o.isMesh || o.isSplatMesh || o.userData.noView) return;
    if (!o.userData._mat) o.userData._mat = o.material;
    const v = S.view;
    o.material = v === "shaded" ? o.userData._mat : v === "clay" ? claymat : v === "normal" ? normmat : v === "depth" ? depthmat : wiremat;
  });
  bump();
}
function holderBox(h) {
  return new THREE.Box3().setFromObject(h);
}
function registerObject(name, root, kind, { fit = true, size = 1.8, meta = {}, box = null } = {}) {
  const holder = new THREE.Group();
  holder.add(root);
  if (fit) {
    root.updateMatrixWorld(true);
    const b = box || new THREE.Box3().setFromObject(root);
    const sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const s = size / Math.max(sz.x, sz.y, sz.z, 1e-6);
    root.position.add(new THREE.Vector3(-c.x, -b.min.y, -c.z));
    holder.scale.setScalar(s);
  }
  if (S.objs.length && kind !== "relief") {
    const bb = new THREE.Box3();
    S.objs.forEach((x) => bb.union(holderBox(x.holder)));
    holder.updateMatrixWorld(true);
    const nb = new THREE.Box3().setFromObject(holder);
    if (!bb.isEmpty() && !nb.isEmpty()) holder.position.x = bb.max.x + (nb.max.x - nb.min.x) / 2 + 0.3 - ((nb.max.x + nb.min.x) / 2 - holder.position.x);
  }
  world.add(holder);
  if (kind !== "relief" && S.rest) leaveRest();
  const o = { id: ++idc, name, kind, holder, root, vis: true, meta };
  holder.userData.objId = o.id;
  S.objs.push(o);
  applyView();
  selectObj(o.id);
  if (S.objs.length === 1 || kind === "scan" || kind === "relief") S.needFrame = true;
  $2("#empty").hidden = S.objs.length > 0;
  renderObjList && renderObjList();
  bump();
  return o;
}
function removeObj(id) {
  const i = S.objs.findIndex((o2) => o2.id === id);
  if (i < 0) return;
  const o = S.objs[i];
  if (tc.object === o.holder) tc.detach();
  world.remove(o.holder);
  o.holder.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material && n.material.dispose && !n.userData._shared) {
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      ms.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
    if (n.dispose && n.isSplatMesh) n.dispose();
  });
  S.objs.splice(i, 1);
  if (S.rest && S.rest.id === id) leaveRest();
  if (S.sel === id) S.sel = null;
  setSelBox();
  $2("#empty").hidden = S.objs.length > 0;
  renderObjList && renderObjList();
  refreshInspector && refreshInspector();
  bump();
}
function selectObj(id) {
  S.pivot = false;
  S.sel = id;
  const o = objById(id);
  if (o) S.fxTarget = id;
  if (tc.object && (!o || tc.object !== o.holder)) tc.detach();
  if (o && S.gizmo) {
    tc.attach(o.holder);
    tc.setMode(S.gizmo);
  }
  setSelBox();
  renderObjList && renderObjList();
  refreshInspector && refreshInspector();
  bump();
}
function setSelBox() {
  if (selBox) {
    scene.remove(selBox);
    selBox.geometry.dispose();
    selBox = null;
  }
  const o = objById(S.sel);
  if (!o || !o.holder) return;
  selBox = new THREE.BoxHelper(o.holder, 16734751);
  scene.add(selBox);
}
function frameAll() {
  if (S.rest && objById(S.rest.id) && S.rest.cage) {
    enterRest(objById(S.rest.id));
    return;
  }
  const b = new THREE.Box3();
  S.objs.forEach((o) => {
    if (o.vis) b.union(holderBox(o.holder));
  });
  if (b.isEmpty()) {
    controls.target.set(0, 0.9, 0);
    return;
  }
  const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() * 0.5 || 1;
  const vis = clamp3(1 - sheet.coverPx() / Math.max(1, stage2.clientHeight), 0.4, 1);
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * vis, th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (camera.aspect || 1);
  const d = r / Math.sin(Math.atan(Math.min(tv, th))) * 1.12;
  const dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(c);
  camera.position.copy(c).addScaledVector(dir, d);
  camera.near = Math.max(0.01, d / 200);
  camera.far = d * 60;
  camera.updateProjectionMatrix();
  controls.update();
  bump();
}
var PRIMS = {
  Knot: () => new THREE.TorusKnotGeometry(0.55, 0.19, 200, 32),
  Sphere: () => new THREE.SphereGeometry(0.8, 48, 32),
  Cube: () => new THREE.BoxGeometry(1.2, 1.2, 1.2),
  Torus: () => new THREE.TorusGeometry(0.7, 0.28, 32, 64),
  Plane: () => new THREE.PlaneGeometry(2, 2, 1, 1)
};
function addPrimitive(k) {
  const g = PRIMS[k]();
  if (k === "Plane") g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 12170412, roughness: 0.55, metalness: 0.1 }));
  return registerObject(k, m, "mesh", { size: k === "Plane" ? 3 : 1.6 });
}
var manager = new THREE.LoadingManager();
var fileMap = /* @__PURE__ */ new Map();
manager.setURLModifier((u) => {
  const n = decodeURIComponent(u.split("?")[0].split("/").pop());
  return fileMap.get(n) || u;
});
var draco = new DRACOLoader(manager);
draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/draco/gltf/");
var gltfLoader = new GLTFLoader(manager);
gltfLoader.setDRACOLoader(draco);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
var extOf = (n) => (n.split(".").pop() || "").toLowerCase();
var baseName = (n) => n.replace(/\.[^.]+$/, "");
function prepMesh(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.userData._mat = o.material;
    }
  });
}
var sparkMod = null;
var spark = null;
async function ensureSpark() {
  if (!sparkMod) sparkMod = await import("@sparkjsdev/spark");
  if (!spark) {
    spark = new sparkMod.SparkRenderer({ renderer });
    scene.add(spark);
  }
  return sparkMod;
}
async function addSplat(buf, name) {
  const { SplatMesh } = await ensureSpark();
  const m = new SplatMesh({ fileBytes: buf, fileName: name });
  await m.initialized;
  m.quaternion.set(1, 0, 0, 0);
  m.updateMatrix();
  let box = null;
  try {
    box = m.getBoundingBox(true).applyMatrix4(m.matrix);
  } catch (e) {
  }
  if (box && box.isEmpty()) box = null;
  return registerObject(baseName(name), m, "splat", { box, size: 2.2 });
}
function is3dgsPly(buf) {
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096)));
  return head.includes("f_dc_0") || head.includes("scale_0");
}
async function importOne(f) {
  const ext = extOf(f.name), type = f.type || "";
  if (type.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(ext)) {
    openScan("video", f);
    return;
  }
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(ext)) {
    await photoToRelief(f);
    return;
  }
  toast("Loading " + f.name + " \u2026", 8e3);
  const buf = await f.arrayBuffer();
  if (ext === "glb" || ext === "gltf") {
    const g = await new Promise((res, rej) => gltfLoader.parse(ext === "gltf" ? new TextDecoder().decode(buf) : buf, "", res, rej));
    const root = g.scene || g.scenes[0];
    prepMesh(root);
    registerObject(baseName(f.name), root, "mesh");
  } else if (ext === "obj") {
    const L = new OBJLoader(manager);
    const mtlName = baseName(f.name) + ".mtl";
    if (fileMap.has(mtlName)) {
      try {
        const t = await (await fetch(fileMap.get(mtlName))).text();
        const mats = new MTLLoader(manager).parse(t, "");
        mats.preload();
        L.setMaterials(mats);
      } catch (e) {
        console.warn(e);
      }
    }
    const root = L.parse(new TextDecoder().decode(buf));
    root.traverse((o) => {
      if (o.isMesh && (!o.material || !o.material.map) && !fileMap.has(mtlName)) o.material = new THREE.MeshStandardMaterial({ color: 13617858, roughness: 0.6 });
    });
    prepMesh(root);
    registerObject(baseName(f.name), root, "mesh");
  } else if (ext === "stl") {
    const g = new STLLoader().parse(buf);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: g.attributes.color ? 16777215 : 13617858, roughness: 0.55, metalness: 0.1, vertexColors: !!g.attributes.color }));
    registerObject(baseName(f.name), m, "mesh");
  } else if (ext === "ply") {
    if (is3dgsPly(buf)) {
      await addSplat(buf, f.name);
    } else {
      const g = new PLYLoader().parse(buf);
      if (g.index || g.getIndex && g.getIndex()) {
        g.computeVertexNormals();
        registerObject(baseName(f.name), new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: g.attributes.color ? 16777215 : 13617858, roughness: 0.6, vertexColors: !!g.attributes.color, side: THREE.DoubleSide })), "mesh");
      } else {
        registerObject(baseName(f.name), new THREE.Points(g, new THREE.PointsMaterial({ size: 0.012, sizeAttenuation: true, vertexColors: !!g.attributes.color, color: g.attributes.color ? 16777215 : 15263457 })), "points", {});
      }
    }
  } else if (["splat", "spz", "ksplat", "sog"].includes(ext)) {
    await addSplat(buf, f.name);
  } else if (ext === "fbx" || ext === "usdz" || ext === "dae" || ext === "3ds") {
    toast("Convert " + ext.toUpperCase() + " to GLB first (Blender, or any online converter).");
    return;
  } else {
    toast("Unsupported file: " + f.name);
    return;
  }
  toast("Imported " + f.name);
}
async function importFiles(list) {
  const files = [...list];
  if (!files.length) return;
  fileMap.clear();
  const hasContainer = files.some((f) => /\.(gltf|obj)$/i.test(f.name));
  const main = [];
  for (const f of files) {
    const ext = extOf(f.name);
    if (ext === "bin" || ext === "mtl" || hasContainer && /\.(png|jpe?g|webp|ktx2)$/i.test(f.name)) fileMap.set(f.name, URL.createObjectURL(f));
    else main.push(f);
  }
  for (const f of main) {
    try {
      await importOne(f);
    } catch (e) {
      console.error(e);
      toast("Couldn\u2019t read " + f.name + ": " + (e.message || e).toString().slice(0, 80), 5e3);
    }
  }
}
var ray = new THREE.Raycaster();
var downAt = null;
canvas2.addEventListener("pointerdown", (e) => {
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas2.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const d = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y), dt = performance.now() - downAt.t;
  downAt = null;
  if (d > 6 || dt > 400 || tc.dragging) return;
  const r = canvas2.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)), camera);
  const hits = ray.intersectObjects(S.objs.filter((o) => o.vis).map((o) => o.holder), true);
  if (hits.length) {
    let n = hits[0].object;
    while (n && n.userData.objId == null) n = n.parent;
    if (n) selectObj(n.userData.objId);
  } else if (S.sel != null) selectObj(null);
});
var compProg = null;
var FXE = { frame: null, iw: null, src: document.createElement("canvas"), tex: null, ready: false };
function fxLoad() {
  if (FXE.frame) return;
  const f = document.getElementById("fxif");
  FXE.frame = f;
  f.addEventListener("load", () => {
    FXE.iw = f.contentWindow;
    setTimeout(() => {
      if (S.engine === "stack") rebuildLook();
    }, 1500);
  });
  f.src = "index.html?embed=1";
}
function fxOpen() {
  fxLoad();
  document.getElementById("fxov").classList.remove("bg");
  bump();
}
function fxClose() {
  document.getElementById("fxov").classList.add("bg");
  bump();
}
document.getElementById("fxdone").addEventListener("click", fxClose);
function fxReady() {
  const w = FXE.iw;
  return !!(w && w.__embedRender && w.__embedReady && w.__embedReady());
}
function fxRender(cTex, t, dt) {
  const w = FXE.iw;
  FXE.src.width = curW;
  FXE.src.height = curH;
  N0.blit(cTex);
  const g = FXE.src.getContext("2d");
  g.drawImage(canvas2, 0, 0, curW, curH);
  const out = w.__embedRender(FXE.src, curW, curH, t, dt);
  if (!out) return null;
  if (!FXE.tex) {
    FXE.tex = gl2.createTexture();
  }
  gl2.bindTexture(gl2.TEXTURE_2D, FXE.tex);
  gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, true);
  gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA8, gl2.RGBA, gl2.UNSIGNED_BYTE, out);
  gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, false);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
  return FXE.tex;
}
function ensureComp() {
  if (compProg) return;
  compProg = N0.GLH.mkProg(N0.GLH.HEAD + `
uniform sampler2D uO,uF,uD,uM;
uniform float uMode,uAmt,uFocus,uRange,uSoft,uInv,uCamN,uCamF,uHasD,uMA;
uniform vec2 uPx;
float lin(float d){return uCamN*uCamF/(uCamF-d*(uCamF-uCamN));}
void main(){
  vec3 o3=texture(uO,vUv).rgb,f3=texture(uF,vUv).rgb;
  float m=1.;
  if(uMode>.5&&uMode<1.5){float z=lin(texture(uD,vUv).r);m=1.-smoothstep(uRange,uRange+uSoft,abs(z-uFocus));}
  else if(uMode>1.5&&uMode<2.5){vec4 q=texture(uM,vUv);m=uMA>.5?q.a:q.r;}
  else if(uMode>2.5){
    float z0=lin(texture(uD,vUv).r);
    float e=max(max(abs(lin(texture(uD,vUv+vec2(uPx.x,0.)).r)-z0),abs(lin(texture(uD,vUv-vec2(uPx.x,0.)).r)-z0)),max(abs(lin(texture(uD,vUv+vec2(0.,uPx.y)).r)-z0),abs(lin(texture(uD,vUv-vec2(0.,uPx.y)).r)-z0)));
    m=smoothstep(.01,.01+uSoft*.1,e/max(z0,.001));
  }
  if(uInv>.5)m=1.-m;
  o=vec4(mix(o3,f3,clamp(m*uAmt,0.,1.)),1.);
}`);
}
var selMat = new THREE.MeshBasicMaterial({ color: 16777215, side: THREE.DoubleSide });
function renderSelMask() {
  const o = objById(S.fxTarget != null ? S.fxTarget : S.sel);
  if (!o || !maskRT) {
    if (maskRT) {
      renderer.setRenderTarget(maskRT);
      renderer.setClearColor(0, 0);
      renderer.clear();
    }
    S.maskA = 0;
    return false;
  }
  const isSp = o.kind === "splat" || o.meta && o.meta.mode === "splats";
  S.maskA = isSp ? 1 : 0;
  const vis = S.objs.map((x) => x.holder.visible);
  S.objs.forEach((x) => {
    x.holder.visible = x === o && x.vis;
  });
  const gv = grid.visible, sbv = selBox ? selBox.visible : false, tv = tcHelper.visible;
  grid.visible = false;
  if (selBox) selBox.visible = false;
  tcHelper.visible = false;
  const bgOld = scene.background, envOld = scene.environment;
  scene.environment = null;
  if (!isSp) scene.overrideMaterial = selMat;
  renderer.setRenderTarget(maskRT);
  renderer.setClearColor(0, isSp ? 0 : 1);
  renderer.clear();
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  scene.environment = envOld;
  scene.background = bgOld;
  S.objs.forEach((x, i) => {
    x.holder.visible = vis[i];
  });
  grid.visible = gv;
  if (selBox) selBox.visible = sbv;
  tcHelper.visible = tv;
  return true;
}
var rtTex = (t) => renderer.properties.get(t).__webglTexture;
var lastT = 0;
var errN = 0;
var frames = 0;
var hudLift = document.getElementById("hudBL");
var hudLift2 = document.getElementById("hudBR");
var bgCol = new THREE.Color();
function frame(ts) {
  requestAnimationFrame(frame);
  if (!renderer || document.hidden) return;
  const t = ts / 1e3, dt = clamp3(t - lastT, 1e-3, 0.1);
  lastT = t;
  try {
    sheet.update(dt);
    if (needResize) resize();
    if (!rt) return;
    applyViewOffset();
    if (S.needFrame) {
      S.needFrame = false;
      frameAll();
    }
    const lift = Math.round(sheet.coverPx());
    if (lift !== S._lift) {
      S._lift = lift;
      hudLift.style.transform = `translate3d(0,${-lift}px,0)`;
      hudLift2.style.transform = `translate3d(0,${-lift}px,0)`;
    }
    if (S.rest) restTick();
    animTick(t);
    controls.autoRotate = S.spin;
    if (S.spin) bump();
    controls.update(dt);
    if (selBox) selBox.update();
    grid.visible = S.grid && !S.exporting;
    if (selBox) selBox.visible = !S.exporting && S.sel != null;
    tcHelper.visible = !S.exporting && !!(S.gizmo || S.pivot) && S.sel != null;
    bgCol.set(S.bg);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(bgCol, 1);
    renderer.clear();
    renderer.render(scene, camera);
    const wantMask = S.fx && !S.hold && S.mask.mode === 2;
    if (wantMask) renderSelMask();
    renderer.setRenderTarget(null);
    const cTex = rtTex(rt.texture);
    if (S.fx && !S.hold) {
      const live = performance.now() < S.liveUntil;
      let fxTex = null;
      if (S.engine === "stack") {
        if (fxReady()) {
          fxTex = fxRender(cTex, t, dt);
        }
      }
      if (!fxTex) fxTex = N0.render(cTex, t, dt, live);
      ensureComp();
      const G = N0.GLH, p = compProg;
      gl2.bindVertexArray(G.vao);
      G.bindRT(null);
      p.use();
      G.samp(p, "uO", 0, cTex);
      G.samp(p, "uF", 1, fxTex);
      G.samp(p, "uD", 2, rtTex(rt.depthTexture));
      G.samp(p, "uM", 3, rtTex(maskRT.texture));
      p.f("uMode", S.mask.mode);
      p.f("uAmt", S.mask.amt);
      p.f("uFocus", S.mask.focus);
      p.f("uRange", S.mask.range);
      p.f("uSoft", Math.max(1e-3, S.mask.soft));
      p.f("uInv", S.mask.inv ? 1 : 0);
      p.f("uMA", S.maskA || 0);
      p.f("uCamN", camera.near);
      p.f("uCamF", camera.far);
      p.v2("uPx", 1 / curW, 1 / curH);
      G.draw();
      gl2.bindVertexArray(null);
      gl2.useProgram(null);
    } else {
      N0.blit(cTex);
    }
    renderer.resetState();
    frames++;
    errN = 0;
  } catch (e) {
    console.error(e);
    errN++;
    if (errN === 3) noGL2("Rendering stopped: " + String(e.message || e).slice(0, 200) + " \u2014 reload to try again.");
    try {
      renderer.resetState();
    } catch (_) {
    }
  }
}
function boot3d() {
  if (!renderer) return;
  setupEnv();
  N0.attach(gl2, canvas2);
  canvas2.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    noGL2("The graphics context was lost. Reload to continue.");
  });
  addPrimitive("Knot");
  requestAnimationFrame(frame);
}
function studioDefaults() {
  N0.applyProfile("studio");
  Object.assign(N0.P, { pal: "src", depth: 8, dstr: 80, method: "blue", px: 2, quality: "0.8", scan: 38, mstr: 30, curv: 14, corner: 8, bloom: 26, hal: 12, vig: 28, refl: 8, glare: 6, snr: 3, jit: 2, bez: 0, mpitch: 3 });
}
function blurPlane(a, w, h, r) {
  r = Math.round(r);
  if (r < 1) return a;
  const t = new Float32Array(a.length), k = 2 * r + 1, o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    let s = 0;
    const b = y * w;
    for (let i = -r; i <= r; i++) s += a[b + clamp3(i, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      t[b + x] = s / k;
      s += a[b + Math.min(w - 1, x + r + 1)] - a[b + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += t[clamp3(i, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      o[y * w + x] = s / k;
      s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
    }
  }
  return o;
}
function normalize01(a, lo = 0.02, hi = 0.98) {
  const s = Float32Array.from(a).sort(), L = s[Math.floor(lo * (s.length - 1))], H = s[Math.floor(hi * (s.length - 1))], d = Math.max(1e-6, H - L);
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = clamp3((a[i] - L) / d, 0, 1);
  return o;
}
function pseudoDepth(cv) {
  const w = cv.width, h = cv.height, d = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  const b = blurPlane(L, w, h, Math.max(2, Math.round(Math.min(w, h) * 0.012)));
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = (x / w - 0.5) * 1.6, cy = (y / h - 0.5) * 1.6, g = Math.exp(-(cx * cx + cy * cy) * 1.4);
    o[y * w + x] = 0.62 * b[y * w + x] + 0.38 * g;
  }
  return normalize01(o);
}
var REST_HFOV = 50;
var restD = (asp) => asp / 2 / Math.tan(THREE.MathUtils.degToRad(REST_HFOV / 2));
function pushPull(px, valid, w, h) {
  const lv = [];
  let cw = w, ch = h, col = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)], wt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    wt[i] = valid[i] ? 1 : 0;
    for (let c = 0; c < 3; c++) col[c][i] = px[i * 4 + c];
  }
  lv.push({ w: cw, h: ch, col, wt });
  while (cw > 2 && ch > 2) {
    const nw = cw >> 1, nh = ch >> 1, nc = [new Float32Array(nw * nh), new Float32Array(nw * nh), new Float32Array(nw * nh)], nwt = new Float32Array(nw * nh), L = lv[lv.length - 1];
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let s = 0, r = [0, 0, 0];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const q = (2 * y + j) * cw + 2 * x + i, ww = L.wt[q];
        s += ww;
        for (let c = 0; c < 3; c++) r[c] += L.col[c][q] * ww;
      }
      const o = y * nw + x;
      nwt[o] = s / 4;
      for (let c = 0; c < 3; c++) nc[c][o] = s > 0 ? r[c] / s : 0;
    }
    cw = nw;
    ch = nh;
    lv.push({ w: cw, h: ch, col: nc, wt: nwt });
  }
  for (let l = lv.length - 2; l >= 0; l--) {
    const U = lv[l + 1], L = lv[l];
    const up = U.col.map((c) => resizeBilinear(c, U.w, U.h, L.w, L.h)), uw = resizeBilinear(U.wt, U.w, U.h, L.w, L.h);
    for (let i = 0; i < L.w * L.h; i++) {
      const ww = Math.min(1, L.wt[i]);
      for (let c = 0; c < 3; c++) L.col[c][i] = ww * L.col[c][i] + (1 - ww) * (uw[i] > 0 ? up[c][i] : L.col[c][i]);
      L.wt[i] = Math.max(L.wt[i], Math.min(1, uw[i]));
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = lv[0].col[0][i];
    out[i * 4 + 1] = lv[0].col[1][i];
    out[i * 4 + 2] = lv[0].col[2][i];
    out[i * 4 + 3] = 255;
  }
  return out;
}
function ensureLayers(m) {
  if (m.layers && !m.bdDirty) return m.layers;
  const w = Math.max(2, m.w >> 1), h = Math.max(2, m.h >> 1), n = w * h, mk = () => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sg = small.getContext("2d", { willReadFrequently: true });
  sg.drawImage(m.canvas, 0, 0, w, h);
  const px = sg.getImageData(0, 0, w, h).data, a = new Float32Array(n);
  if (m.alpha) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = m.alpha[Math.min(m.h - 1, y * 2) * m.w + Math.min(m.w - 1, x * 2)];
  } else a.fill(1);
  const L = m.layers || (m.layers = {});
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) inside[i] = a[i] > 0.9 ? 1 : 0;
  const ext = pushPull(px, inside, w, h), soft = new Float32Array(n * 3);
  for (let c = 0; c < 3; c++) {
    const pl = new Float32Array(n);
    for (let i = 0; i < n; i++) pl[i] = ext[i * 4 + c];
    const b = blurPlane(pl, w, h, Math.max(3, Math.round(w / 90)));
    for (let i = 0; i < n; i++) soft[i * 3 + c] = b[i];
  }
  const mkTex2 = (cv, old) => {
    const t = old || new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const bc = L.backCv || (L.backCv = mk()), bg = bc.getContext("2d"), bi = bg.createImageData(w, h);
  const ea = blurPlane(a, w, h, 2);
  for (let i = 0; i < n; i++) {
    bi.data[i * 4] = soft[i * 3];
    bi.data[i * 4 + 1] = soft[i * 3 + 1];
    bi.data[i * 4 + 2] = soft[i * 3 + 2];
    bi.data[i * 4 + 3] = Math.round(a[i] * 255);
  }
  bg.putImageData(bi, 0, 0);
  L.backTex = mkTex2(bc, L.backTex);
  const fc = L.fillCv || (L.fillCv = mk()), fg = fc.getContext("2d"), fi = fg.createImageData(w, h);
  for (let i = 0; i < n; i++) {
    fi.data[i * 4] = soft[i * 3];
    fi.data[i * 4 + 1] = soft[i * 3 + 1];
    fi.data[i * 4 + 2] = soft[i * 3 + 2];
    fi.data[i * 4 + 3] = ea[i] > 0.97 ? 255 : 0;
  }
  fg.putImageData(fi, 0, 0);
  L.fillTex = mkTex2(fc, L.fillTex);
  if (m.alpha) {
    const dil = blurPlane(a, w, h, Math.max(2, Math.round(w / 180))), valid = new Uint8Array(n);
    for (let i = 0; i < n; i++) valid[i] = dil[i] < 0.01 ? 1 : 0;
    const raw = pushPull(px, valid, w, h), pc = L.plateCv || (L.plateCv = mk()), pg = pc.getContext("2d");
    pg.putImageData(new ImageData(raw, w, h), 0, 0);
    L.plateTex = mkTex2(pc, L.plateTex);
  }
  m.bdDirty = false;
  return L;
}
function buildReliefGeometry(m) {
  const asp = m.w / m.h, cap = (m.hq ? 42e4 : 15e4) / (m.solid ? 1.9 : 1);
  const cols = Math.max(16, Math.min(Math.round(m.w / 2), Math.floor(Math.sqrt(cap / 2 * asp)))), rows = Math.max(8, Math.round(cols / asp));
  let dp = m.depth;
  const dw = m.dw || m.w, dh = m.dh || m.h;
  if (m.smooth > 0) dp = blurPlane(dp, dw, dh, m.smooth);
  const sample = (u, v) => {
    const x = clamp3(u * (dw - 1), 0, dw - 1), y = clamp3(v * (dh - 1), 0, dh - 1), x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(dw - 1, x0 + 1), y1 = Math.min(dh - 1, y0 + 1), fx = x - x0, fy = y - y0;
    return lerp2(lerp2(dp[y0 * dw + x0], dp[y0 * dw + x1], fx), lerp2(dp[y1 * dw + x0], dp[y1 * dw + x1], fx), fy);
  };
  const D = restD(asp), N = cols * rows, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), zv = new Float32Array(N), dsm = new Float32Array(N), av = new Float32Array(N).fill(1), useA = m.alpha && !m.keepBg;
  const place = (k, u, v, z) => {
    const s = m.rest ? (D - z) / D : 1;
    return [(u - 0.5) * asp * s, (0.5 - v) * s, z];
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1), v = j / (rows - 1), k = j * cols + i;
    let d = sample(u, v);
    d = Math.pow(Math.max(0, d), m.gamma);
    d = 0.5 + (d - 0.5) * (1 - m.flat);
    const z = (d - 0.5) * m.scale, P3 = place(k, u, v, z);
    zv[k] = z;
    dsm[k] = d;
    pos[k * 3] = P3[0];
    pos[k * 3 + 1] = P3[1];
    pos[k * 3 + 2] = P3[2];
    uv[k * 2] = u;
    uv[k * 2 + 1] = 1 - v;
    if (useA) av[k] = m.alpha[Math.round(v * (m.h - 1)) * m.w + Math.round(u * (m.w - 1))];
  }
  const cx = asp / (cols - 1), cy = 1 / (rows - 1), cell = (cx + cy) / 2, lim = 14 - 12 * m.tear, cw = cols - 1, ch = rows - 1, inc = new Uint8Array(cw * ch);
  let nInc = 0, maxSlope = 0;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    const zmx = Math.max(zv[a], zv[b], zv[c], zv[d]), zmn = Math.min(zv[a], zv[b], zv[c], zv[d]), sl = (zmx - zmn) / cell;
    if (sl > lim) continue;
    if (useA && Math.max(av[a], av[b], av[c], av[d]) < 0.02) continue;
    inc[j * cw + i] = 1;
    nInc++;
    if (sl > maxSlope) maxSlope = sl;
  }
  const idx = new Uint32Array(nInc * 6);
  let n = 0;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    if (!inc[j * cw + i]) continue;
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx[n++] = a;
    idx[n++] = c;
    idx[n++] = b;
    idx[n++] = b;
    idx[n++] = c;
    idx[n++] = d;
  }
  const mkG = (p, u, ix) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(u, 2));
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    g.computeVertexNormals();
    return g;
  };
  const out = { g: mkG(pos, uv, idx), cols, rows, tris: n / 3, maxSlope, lim, shaped: dsm };
  if (m.solid) {
    const z0 = -m.scale / 2 - m.thick / 2, bp = new Float32Array(2 * N * 3), bu = new Float32Array(2 * N * 2);
    for (let k = 0; k < N; k++) {
      const u = uv[k * 2], v = 1 - uv[k * 2 + 1], P3 = place(k, u, v, 2 * z0 - zv[k]);
      bp[k * 3] = P3[0];
      bp[k * 3 + 1] = P3[1];
      bp[k * 3 + 2] = P3[2];
      bp[(N + k) * 3] = pos[k * 3];
      bp[(N + k) * 3 + 1] = pos[k * 3 + 1];
      bp[(N + k) * 3 + 2] = pos[k * 3 + 2];
      bu[k * 2] = u;
      bu[k * 2 + 1] = 1 - v;
      bu[(N + k) * 2] = uv[k * 2];
      bu[(N + k) * 2 + 1] = uv[k * 2 + 1];
    }
    const bi = [];
    const has = (i, j) => i >= 0 && j >= 0 && i < cw && j < ch && inc[j * cw + i];
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      if (!inc[j * cw + i]) continue;
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      bi.push(a, b, c, b, d, c);
      const wall = (p, q) => {
        bi.push(p, q, N + p, q, N + q, N + p);
      };
      if (!has(i, j - 1)) wall(a, b);
      if (!has(i, j + 1)) wall(c, d);
      if (!has(i - 1, j)) wall(a, c);
      if (!has(i + 1, j)) wall(b, d);
    }
    out.back = mkG(bp, bu, new Uint32Array(bi));
  }
  if (m.fill && !m.solid) {
    const bc = Math.min(cols, 140), br = Math.max(8, Math.round(bc / asp)), bn = bc * br, fp = new Float32Array(bn * 3), fu = new Float32Array(bn * 2), fz = new Float32Array(bn);
    const sm = blurPlane(dsm, cols, rows, Math.max(2, Math.round(cols / 40)));
    for (let j = 0; j < br; j++) for (let i = 0; i < bc; i++) {
      const u = i / (bc - 1), v = j / (br - 1), k = j * bc + i, gx = Math.round(u * (cols - 1)), gy = Math.round(v * (rows - 1));
      const z = m.keepBg ? -m.scale * 0.5 - 0.015 : (sm[gy * cols + gx] - 0.5) * m.scale - m.scale * 0.08 - 0.01;
      fz[k] = z;
      const P3 = place(k, u, v, z);
      fp[k * 3] = P3[0];
      fp[k * 3 + 1] = P3[1];
      fp[k * 3 + 2] = P3[2];
      fu[k * 2] = u;
      fu[k * 2 + 1] = 1 - v;
    }
    const fa = new Float32Array(bn).fill(1);
    if (!m.keepBg && m.alpha) for (let j = 0; j < br; j++) for (let i = 0; i < bc; i++) fa[j * bc + i] = m.alpha[Math.round(j / (br - 1) * (m.h - 1)) * m.w + Math.round(i / (bc - 1) * (m.w - 1))];
    const fi = new Uint32Array((bc - 1) * (br - 1) * 6);
    let q = 0;
    for (let j = 0; j < br - 1; j++) for (let i = 0; i < bc - 1; i++) {
      const a = j * bc + i, b = a + 1, c = a + bc, d = c + 1;
      if (Math.min(fa[a], fa[b], fa[c], fa[d]) < 0.97) continue;
      fi[q++] = a;
      fi[q++] = c;
      fi[q++] = b;
      fi[q++] = b;
      fi[q++] = c;
      fi[q++] = d;
    }
    out.fill = mkG(fp, fu, fi.slice(0, q));
  }
  return out;
}
function buildNormalTex(m, shaped, cols, rows) {
  const w = Math.min(cols * 2, m.w >> 1), h = Math.max(2, Math.round(w * m.h / m.w)), dw = m.dw || m.w, dh = m.dh || m.h;
  const dp = blurPlane(m.depth, dw, dh, 1), sm = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let d = dp[Math.min(dh - 1, Math.round(y / (h - 1) * (dh - 1))) * dw + Math.min(dw - 1, Math.round(x / (w - 1) * (dw - 1)))];
    d = Math.pow(Math.max(0, d), m.gamma);
    sm[y * w + x] = (0.5 + (d - 0.5) * (1 - m.flat) - 0.5) * m.scale;
  }
  const c = m.nmCv || (m.nmCv = document.createElement("canvas"));
  c.width = w;
  c.height = h;
  const g = c.getContext("2d"), im = g.createImageData(w, h), px = 1 / h, k = m.detail * 0 + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = Math.max(0, x - 1), xr2 = Math.min(w - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    const dzx = (sm[y * w + xr2] - sm[y * w + xl]) / ((xr2 - xl || 1) * px), dzy = (sm[yd * w + x] - sm[yu * w + x]) / ((yd - yu || 1) * px);
    let nx = -dzx * k, ny = dzy * k, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l;
    ny /= l;
    nz /= l;
    const o = (y * w + x) * 4;
    im.data[o] = (nx * 0.5 + 0.5) * 255;
    im.data[o + 1] = (ny * 0.5 + 0.5) * 255;
    im.data[o + 2] = (nz * 0.5 + 0.5) * 255;
    im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  if (!m.nmTex) {
    m.nmTex = new THREE.CanvasTexture(c);
    m.nmTex.colorSpace = THREE.NoColorSpace;
    m.nmTex.anisotropy = 4;
  }
  m.nmTex.needsUpdate = true;
  return m.nmTex;
}
function buildSplatBytes(m) {
  const asp = m.w / m.h, cap = m.hq ? 42e4 : 15e4;
  const cols = Math.max(16, Math.min(Math.round(m.w / 2), Math.floor(Math.sqrt(cap * asp)))), rows = Math.max(8, Math.round(cols / asp));
  let dp = m.depth;
  const dw = m.dw || m.w, dh = m.dh || m.h;
  if (m.smooth > 0) dp = blurPlane(dp, dw, dh, m.smooth);
  const sample = (u, v) => {
    const x = clamp3(u * (dw - 1), 0, dw - 1), y = clamp3(v * (dh - 1), 0, dh - 1), x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(dw - 1, x0 + 1), y1 = Math.min(dh - 1, y0 + 1), fx = x - x0, fy = y - y0;
    return lerp2(lerp2(dp[y0 * dw + x0], dp[y0 * dw + x1], fx), lerp2(dp[y1 * dw + x0], dp[y1 * dw + x1], fx), fy);
  };
  const D = restD(asp), N = cols * rows, zv = new Float32Array(N), useA = m.alpha && !m.keepBg;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let d = sample(i / (cols - 1), j / (rows - 1));
    d = Math.pow(Math.max(0, d), m.gamma);
    d = 0.5 + (d - 0.5) * (1 - m.flat);
    zv[j * cols + i] = (d - 0.5) * m.scale;
  }
  const cv = m.canvas, pix = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
  const buf = new ArrayBuffer(N * 32), f = new Float32Array(buf), u8 = new Uint8Array(buf);
  let n = 0;
  const cx = asp / (cols - 1), cy = 1 / (rows - 1), q = new THREE.Quaternion(), zz = new THREE.Vector3(0, 0, 1), nv = new THREE.Vector3();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1), v = j / (rows - 1), k = j * cols + i;
    const a = useA ? m.alpha[Math.round(v * (m.h - 1)) * m.w + Math.round(u * (m.w - 1))] : 1;
    if (a < 0.04) continue;
    const z = zv[k], s = m.rest ? (D - z) / D : 1, x = (u - 0.5) * asp * s, y = (0.5 - v) * s;
    const zl = zv[j * cols + Math.max(0, i - 1)], zr = zv[j * cols + Math.min(cols - 1, i + 1)], zu = zv[Math.max(0, j - 1) * cols + i], zd = zv[Math.min(rows - 1, j + 1) * cols + i];
    nv.set(-(zr - zl) / (2 * cx), (zd - zu) / (2 * cy) * -1, 1);
    nv.x *= 1;
    nv.normalize();
    nv.lerp(zz, 0.45).normalize();
    nv.set(nv.x, -nv.y, -nv.z);
    q.setFromUnitVectors(zz, nv);
    const sx = Math.max(cx, cy) * s * 0.9, o = n * 8;
    f[o] = x;
    f[o + 1] = -y;
    f[o + 2] = -z;
    f[o + 3] = sx;
    f[o + 4] = sx;
    f[o + 5] = sx * 0.25;
    const px = Math.min(cv.width - 1, Math.round(u * (cv.width - 1))), py = Math.min(cv.height - 1, Math.round(v * (cv.height - 1))), pi = (py * cv.width + px) * 4, b = n * 32 + 24;
    u8[b] = pix[pi];
    u8[b + 1] = pix[pi + 1];
    u8[b + 2] = pix[pi + 2];
    u8[b + 3] = Math.round(a * 255);
    u8[b + 4] = clamp3(Math.round(q.w * 128 + 128), 0, 255);
    u8[b + 5] = clamp3(Math.round(q.x * 128 + 128), 0, 255);
    u8[b + 6] = clamp3(Math.round(q.y * 128 + 128), 0, 255);
    u8[b + 7] = clamp3(Math.round(q.z * 128 + 128), 0, 255);
    n++;
  }
  const bytes = new Uint8Array(buf, 0, n * 32);
  const view = new Uint8Array(bytes), lut = new Uint8Array(256);
  for (let c = 0; c < 256; c++) lut[c] = Math.round(255 * Math.pow(c / 255, 1 / 2.2));
  for (let k = 0; k < n; k++) {
    const b = k * 32 + 24;
    view[b] = lut[view[b]];
    view[b + 1] = lut[view[b + 1]];
    view[b + 2] = lut[view[b + 2]];
  }
  return { bytes, view, count: n, cols, rows };
}
function exportPhotoSplat(o) {
  const m = o.meta;
  if (!m.splat) {
    toast("Switch to Splats first.");
    return;
  }
  const b = m.splat.bytes;
  deliver(new Blob([b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)], { type: "application/octet-stream" }), (o.name || "photo") + ".splat");
}
function rebuildRelief(o) {
  const m = o.meta;
  if (!m || !m.canvas) return;
  const R2 = buildReliefGeometry(m), { g, cols, rows, tris } = R2;
  if (!m.tex) {
    m.tex = new THREE.CanvasTexture(m.canvas);
    m.tex.colorSpace = THREE.NoColorSpace;
    m.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  const tok = m._st = (m._st || 0) + 1;
  o.root.children.slice().forEach((c) => {
    o.root.remove(c);
    if (c.isSplatMesh) {
      try {
        c.dispose();
      } catch (e) {
      }
      return;
    }
    c.geometry && c.geometry.dispose();
    if (c.material && c.material.dispose) c.material.dispose();
  });
  const cut = !!(m.alpha && !m.keepBg);
  const add = (geo, mat, order) => {
    const n = new THREE.Mesh(geo, mat);
    n.userData._mat = mat;
    n.renderOrder = order || 0;
    o.root.add(n);
    return n;
  };
  if (m.mode === "points") {
    const cv = m.canvas, ctx = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), uv = g.attributes.uv;
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = Math.min(cv.width - 1, Math.floor(uv.getX(k) * (cv.width - 1))), y = Math.min(cv.height - 1, Math.floor((1 - uv.getY(k)) * (cv.height - 1))), p = (y * cv.width + x) * 4;
      c.setRGB(ctx[p] / 255, ctx[p + 1] / 255, ctx[p + 2] / 255, THREE.SRGBColorSpace);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(null);
    const node = new THREE.Points(g, new THREE.PointsMaterial({ size: m.pt, sizeAttenuation: true, vertexColors: true }));
    o.root.add(node);
  } else {
    const base = { side: THREE.DoubleSide, toneMapped: false };
    let fmat;
    if (m.shade > 0) {
      fmat = new THREE.MeshLambertMaterial({ ...base, map: m.tex, color: new THREE.Color().setScalar(m.shade), emissive: new THREE.Color().setScalar(1 - m.shade), emissiveMap: m.tex, normalMap: buildNormalTex(m, R2.shaped, cols, rows), normalScale: new THREE.Vector2(1, 1) });
    } else fmat = new THREE.MeshBasicMaterial({ ...base, map: m.tex });
    if (cut) {
      fmat.transparent = true;
      fmat.alphaTest = 0.02;
    }
    add(g, fmat, 2);
    const L = R2.back || R2.fill ? ensureLayers(m) : null;
    if (R2.back) {
      const bm = new THREE.MeshBasicMaterial({ ...base, map: L.backTex });
      if (cut) {
        bm.transparent = true;
        bm.alphaTest = 0.02;
      }
      add(R2.back, bm, 1);
    }
    m.furMats = [];
    if (m.fur > 0 && cut) {
      const NS = m.hq ? 14 : 8, dens = Math.max(80, m.w / 2);
      for (let i = 1; i <= NS; i++) {
        const mt = new THREE.ShaderMaterial({
          side: THREE.DoubleSide,
          transparent: false,
          toneMapped: false,
          uniforms: { uMap: { value: m.tex }, uShell: { value: i / NS }, uLen: { value: m.fur * 0.07 }, uWind: { value: m.wind }, uTime: { value: 0 }, uDens: { value: dens } },
          vertexShader: `uniform float uShell,uLen,uWind,uTime;varying vec2 vUv;void main(){vUv=uv;vec3 p=position+normal*uLen*uShell;float k=uShell*uShell*uLen;
            p.x+=sin(uTime*1.7+position.y*9.+position.x*5.)*uWind*k;p.y+=sin(uTime*1.3+position.x*7.)*uWind*k*.5-k*.4;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
          fragmentShader: `uniform sampler2D uMap;uniform float uShell,uDens;varying vec2 vUv;
            float h(vec2 c){return fract(sin(dot(c,vec2(127.1,311.7)))*43758.5453);}
            void main(){vec4 t=texture2D(uMap,vUv);if(t.a<.5)discard;if(h(floor(vUv*uDens))<uShell)discard;gl_FragColor=vec4(t.rgb*(.8+.2*uShell),1.);}`
        });
        m.furMats.push(mt);
        add(g, mt, 3 + i);
      }
    }
    if (R2.fill) {
      const tex2 = m.keepBg ? L.plateTex || m.tex : L.fillTex;
      add(R2.fill, new THREE.MeshBasicMaterial({ ...base, map: tex2 }), 0);
    }
  }
  if (m.mode === "splats") {
    const S2 = buildSplatBytes(m);
    m.splat = S2;
    ensureSpark().then(async ({ SplatMesh }) => {
      if (m._st !== tok || m.mode !== "splats") return;
      const sm = new SplatMesh({ fileBytes: S2.view, fileName: "photo.splat" });
      sm.quaternion.set(1, 0, 0, 0);
      o.root.add(sm);
      try {
        await sm.initialized;
      } catch (e) {
        m.splatErr = String(e && e.message || e);
        toast("Splats failed: " + m.splatErr);
      }
      if (m._st !== tok || m.mode !== "splats") {
        o.root.remove(sm);
        try {
          sm.dispose();
        } catch (e) {
        }
        return;
      }
      o.root.children.forEach((c) => {
        if (c !== sm && c.isMesh) c.visible = false;
      });
      bump();
    }).catch((e) => {
      m.splatErr = String(e && e.message || e);
      toast("Splats failed: " + m.splatErr);
    });
  }
  o.meta.stats = `${cols}\xD7${rows}`;
  o.meta.tris = tris;
  o.meta.maxSlope = R2.maxSlope;
  o.meta.slopeLim = R2.lim;
  applyView();
  bump();
}
async function photoToRelief(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const photo = document.createElement("canvas");
  photo.width = Math.max(2, Math.round(bmp.width * k));
  photo.height = Math.max(2, Math.round(bmp.height * k));
  const pg = photo.getContext("2d", { willReadFrequently: true });
  pg.drawImage(bmp, 0, 0, photo.width, photo.height);
  const w = photo.width, h = photo.height, px = pg.getImageData(0, 0, w, h).data;
  let tr = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) tr++;
  const disp = document.createElement("canvas");
  disp.width = w;
  disp.height = h;
  disp.getContext("2d", { willReadFrequently: true }).drawImage(photo, 0, 0);
  const o = makeRelief(file.name || "Photo", disp, new Float32Array(w * h).fill(0.5), { quick: true, photo, px });
  setFx(false);
  enterRest(o);
  (async () => {
    if (tr > w * h * 5e-3) {
      const a = new Float32Array(w * h);
      for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255;
      o.meta.alpha0 = Float32Array.from(a);
      setAlpha(o, a, "file alpha");
    } else if (CUT.on) await autoCut(o);
    if (CUT.depthOn && objById(o.id)) await autoDepth(o);
  })();
  return o;
}
function makeRelief(name, cv, depth, { quick = false, dw, dh, photo = null, px = null } = {}) {
  const g = new THREE.Group();
  const meta = { canvas: cv, photo, px, alpha: null, keepBg: false, w: cv.width, h: cv.height, depth, dw: dw || cv.width, dh: dh || cv.height, N: 220, sway: !!photo, fur: 0, wind: 0.5, breathe: false, scale: photo ? 0.6 : 0.45, gamma: 1, flat: 0, detail: 0.35, shade: 0.3, tear: 0.5, fill: true, solid: false, thick: 0.15, hq: !matchMedia("(pointer:coarse)").matches, rest: !!photo, smooth: 1, cut: 0.08, mode: "mesh", lit: false, pt: 0.012, quick };
  const o = registerObject(baseName(name), g, "relief", { fit: false, meta });
  rebuildRelief(o);
  o.holder.scale.setScalar(1.8);
  o.holder.position.set(0, 0.9, 0);
  frameAll();
  setTab && setTab("scene");
  if (!photo) toast(quick ? "Placed as quick relief. Run AI depth for a real depth map." : "Relief built from the depth map.");
  return o;
}
var BUILD = "step5-life1";
var CUT = { on: localStorage.getItem("n0.autocut") !== "0", workerP: null, jobs: /* @__PURE__ */ new Map(), seq: 0 };
function resizeBilinear(s, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return s;
  const o = new Float32Array(dw * dh), fx = sw > 1 ? (sw - 1) / Math.max(1, dw - 1) : 0, fy = sh > 1 ? (sh - 1) / Math.max(1, dh - 1) : 0;
  for (let y = 0; y < dh; y++) {
    const sy = y * fy, y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), ty = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = x * fx, x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), tx = sx - x0;
      o[y * dw + x] = (s[y0 * sw + x0] * (1 - tx) + s[y0 * sw + x1] * tx) * (1 - ty) + (s[y1 * sw + x0] * (1 - tx) + s[y1 * sw + x1] * tx) * ty;
    }
  }
  return o;
}
function guidedFilter(I, p, w, h, r, eps) {
  const n = w * h, Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Ip[i] = I[i] * p[i];
    II[i] = I[i] * I[i];
  }
  const mI = blurPlane(I, w, h, r), mp = blurPlane(p, w, h, r), cIp = blurPlane(Ip, w, h, r), cII = blurPlane(II, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = cII[i] - mI[i] * mI[i];
    a[i] = (cIp[i] - mI[i] * mp[i]) / (v + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = blurPlane(a, w, h, r), mb = blurPlane(b, w, h, r), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = clamp3(ma[i] * I[i] + mb[i], 0, 1);
  return q;
}
function labelComps(bin, w, h, v) {
  const n = w * h, lab = new Int32Array(n).fill(-1), sizes = [], border = [], st = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (bin[s] !== v || lab[s] >= 0) continue;
    const id = sizes.length;
    let sp = 0, cnt = 0, bd = 0;
    st[sp++] = s;
    lab[s] = id;
    while (sp) {
      const i = st[--sp];
      cnt++;
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) bd = 1;
      if (x > 0 && bin[i - 1] === v && lab[i - 1] < 0) {
        lab[i - 1] = id;
        st[sp++] = i - 1;
      }
      if (x < w - 1 && bin[i + 1] === v && lab[i + 1] < 0) {
        lab[i + 1] = id;
        st[sp++] = i + 1;
      }
      if (y > 0 && bin[i - w] === v && lab[i - w] < 0) {
        lab[i - w] = id;
        st[sp++] = i - w;
      }
      if (y < h - 1 && bin[i + w] === v && lab[i + w] < 0) {
        lab[i + w] = id;
        st[sp++] = i + w;
      }
    }
    sizes.push(cnt);
    border.push(bd);
  }
  return { lab, sizes, border };
}
function refineMask(prob, pw, ph, px, w, h) {
  const n = w * h;
  let a = resizeBilinear(prob, pw, ph, w, h);
  const I = new Float32Array(n);
  for (let i = 0; i < n; i++) I[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  a = guidedFilter(I, a, w, h, Math.max(3, Math.round(Math.max(w, h) / 160)), 1e-3);
  for (let i = 0; i < n; i++) a[i] = clamp3((a[i] - 0.32) / 0.36, 0, 1);
  cleanAlpha(a, w, h);
  const f = blurPlane(a, w, h, 1);
  for (let i = 0; i < n; i++) a[i] = f[i];
  return a;
}
function cleanAlpha(a, w, h) {
  const n = w * h, bin = new Uint8Array(n);
  for (let i = 0; i < n; i++) bin[i] = a[i] > 0.5 ? 1 : 0;
  const fg = labelComps(bin, w, h, 1), big = Math.max(0, ...fg.sizes), minI = Math.max(n * 3e-3, big * 0.04);
  const bg = labelComps(bin, w, h, 0);
  for (let i = 0; i < n; i++) {
    if (bin[i]) {
      if (fg.sizes[fg.lab[i]] < minI) a[i] = 0;
    } else {
      const c = bg.lab[i];
      if (!bg.border[c] && bg.sizes[c] < n * 8e-3) a[i] = 1;
    }
  }
}
function decontaminate(px, a, w, h) {
  const n = w * h, out = new Uint8ClampedArray(px), core = new Uint8Array(n);
  for (let i = 0; i < n; i++) core[i] = a[i] >= 0.96 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const c = core.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!core[i]) continue;
      if (!core[i - 1] || !core[i + 1] || !core[i - w] || !core[i + w]) c[i] = 0;
    }
    core.set(c);
  }
  const reach = blurPlane(a, w, h, 4), todo = [];
  for (let i = 0; i < n; i++) if (!core[i] && reach[i] > 2e-3) todo.push(i);
  for (let it = 0; it < 6 && todo.length; it++) {
    const add = [], rest = [];
    for (const i of todo) {
      const x = i % w, y = (i - x) / w;
      let r = 0, g = 0, b = 0, k = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= h) continue;
        for (let q = -1; q <= 1; q++) {
          const xx = x + q;
          if (xx < 0 || xx >= w) continue;
          const m = yy * w + xx;
          if (core[m]) {
            r += out[m * 4];
            g += out[m * 4 + 1];
            b += out[m * 4 + 2];
            k++;
          }
        }
      }
      if (k) {
        out[i * 4] = r / k;
        out[i * 4 + 1] = g / k;
        out[i * 4 + 2] = b / k;
        add.push(i);
      } else rest.push(i);
    }
    for (const i of add) core[i] = 1;
    todo.length = 0;
    for (const i of rest) todo.push(i);
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = Math.round(a[i] * 255);
  return out;
}
function growRegion(px, w, h, seeds, tolStep, tolSeed, ref) {
  const n = w * h, m = new Uint8Array(n), st = new Int32Array(n);
  let sp = 0;
  const D = (i, j) => {
    const r = px[i * 4] - px[j * 4], g = px[i * 4 + 1] - px[j * 4 + 1], b = px[i * 4 + 2] - px[j * 4 + 2];
    return Math.sqrt(r * r + g * g + b * b);
  };
  const Dr = (i) => {
    const r = px[i * 4] - ref[0], g = px[i * 4 + 1] - ref[1], b = px[i * 4 + 2] - ref[2];
    return Math.sqrt(r * r + g * g + b * b);
  };
  for (const s of seeds) {
    if (!m[s] && Dr(s) < tolSeed) {
      m[s] = 1;
      st[sp++] = s;
    }
  }
  while (sp) {
    const i = st[--sp], x = i % w, y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || m[j]) continue;
      if (D(i, j) < tolStep && Dr(j) < tolSeed) {
        m[j] = 1;
        st[sp++] = j;
      }
    }
  }
  return m;
}
function floodMask(px, w, h) {
  const ch = [[], [], []], seeds = [];
  const add = (i) => {
    seeds.push(i);
    for (let c = 0; c < 3; c++) ch[c].push(px[i * 4 + c]);
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  const ref = ch.map((a) => a.sort((p2, q) => p2 - q)[a.length >> 1]);
  const m = growRegion(px, w, h, seeds, 12, 64, ref), p = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) p[i] = m[i] ? 0 : 1;
  return { data: p, w, h };
}
function runMatte(key2, cv, onProg, type = "run") {
  const k = Math.min(1, 1024 / Math.max(cv.width, cv.height)), w = Math.max(2, Math.round(cv.width * k)), h = Math.max(2, Math.round(cv.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(cv, 0, 0, w, h);
  const rgba = g.getImageData(0, 0, w, h).data.buffer;
  if (!CUT.worker) {
    CUT.worker = new Worker("matte.worker.js?v=7", { type: "module" });
    CUT.worker.onmessage = (e) => {
      const d = e.data, j = CUT.jobs.get(d.id);
      if (!j) return;
      if (d.type === "progress") j.onProg(d.p, "loading");
      else if (d.type === "stage") j.onProg(1, d.status);
      else if (d.type === "done") {
        CUT.jobs.delete(d.id);
        CUT.backend = d.backend;
        j.res(d);
      } else if (d.type === "error") {
        CUT.jobs.delete(d.id);
        j.rej(new Error(d.message));
      }
    };
    CUT.worker.onerror = (e) => {
      CUT.jobs.forEach((j) => j.rej(new Error("worker failed")));
      CUT.jobs.clear();
      CUT.worker = null;
    };
  }
  return new Promise((res, rej) => {
    const id = ++CUT.seq;
    CUT.jobs.set(id, { res, rej, onProg });
    CUT.worker.postMessage({ id, type, model: key2, cpu: !!CUT.cpu, rgba, w, h }, [rgba]);
  });
}
var MATTERS = {
  birefnet: { label: "BiRefNet-lite", run: (cv, p) => runMatte("birefnet", cv, p) },
  modnet: { label: "MODNet", run: (cv, p) => runMatte("modnet", cv, p) },
  u2netp: { label: "U\xB2-Net-p", run: (cv, p) => runMatte("u2netp", cv, p) },
  u2net: { label: "U\xB2-Net", run: (cv, p) => runMatte("u2net", cv, p) },
  fallback: { label: "edge fill", run(cv) {
    const w = cv.width, h = cv.height, px = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    return Promise.resolve(floodMask(px, w, h));
  } }
};
CUT.model = localStorage.getItem("n0.cutmodel") || "auto";
var cutOrder = () => {
  const f = CUT.model === "auto" ? "u2netp" : CUT.model;
  return [f, "u2netp", "fallback"].filter((x, i, a) => a.indexOf(x) === i);
};
function cutStatus(text, p) {
  let b = $2("#cutbar");
  if (!text) {
    if (b) b.hidden = true;
    return;
  }
  if (!b) {
    b = el("div", "cutbar", '<span></span><div class="prog"><i></i></div>');
    b.id = "cutbar";
    stage2.appendChild(b);
  }
  b.hidden = false;
  b.firstChild.textContent = text;
  b.querySelector("i").style.width = (p == null ? 100 : Math.round(p * 100)) + "%";
}
function applyAlpha(m) {
  const cv = m.canvas, ctx = cv.getContext("2d");
  if (m.keepBg || !m.alpha) ctx.putImageData(new ImageData(new Uint8ClampedArray(m.px), m.w, m.h), 0, 0);
  else ctx.putImageData(new ImageData(decontaminate(m.px, m.alpha, m.w, m.h), m.w, m.h), 0, 0);
  if (m.tex) m.tex.needsUpdate = true;
  applyDepthMask(m);
  m.bdDirty = true;
}
function setAlpha(o, a, by) {
  const m = o.meta;
  m.alpha = a;
  if (by) m.cutBy = by;
  applyAlpha(m);
  rebuildRelief(o);
}
async function autoCut(o) {
  const m = o.meta;
  if (m.cutting) return;
  m.cutting = true;
  m.cutErr = "";
  const t0 = performance.now();
  try {
    let r, by, a;
    for (const key2 of cutOrder()) {
      try {
        cutStatus(key2 === "fallback" ? "Cutting out subject\u2026" : "Loading cut-out model\u2026", key2 === "fallback" ? null : 0);
        r = await MATTERS[key2].run(m.photo, (p, s) => {
          if (s === "cutting") cutStatus("Cutting out subject\u2026");
          else cutStatus(`Loading cut-out model\u2026 ${Math.round(p * 100)}%`, p);
        });
        by = MATTERS[key2].label;
        break;
      } catch (e) {
        console.warn("matting " + key2 + " failed", e);
        m.cutErr = m.cutErr || String(e && e.message || e).slice(0, 140);
      }
    }
    if (by === "edge fill" && m.cutErr) toast("Cut-out model couldn\u2019t load (" + m.cutErr.slice(0, 70) + "). Used the simple edge fill. Use Refine to fix edges.", 7e3);
    if (!objById(o.id)) return;
    a = refineMask(r.data, r.w, r.h, m.px, m.w, m.h);
    let cov = 0;
    for (let i = 0; i < a.length; i++) cov += a[i];
    cov /= a.length;
    if ((cov < 0.02 || cov > 0.97) && by !== "edge fill") {
      by = "edge fill";
      const f = await MATTERS.fallback.run(m.photo);
      a = refineMask(f.data, f.w, f.h, m.px, m.w, m.h);
      cov = 0;
      for (let i = 0; i < a.length; i++) cov += a[i];
      cov /= a.length;
    }
    if (cov < 0.02 || cov > 0.97) {
      toast("Couldn\u2019t separate a subject. Use Refine to paint it.", 4500);
      m.alpha = null;
      m.cutBy = "none";
      return;
    }
    m.alpha0 = Float32Array.from(a);
    m.ms = Math.round(performance.now() - t0);
    setAlpha(o, a, by);
    if (m.raw) buildDepth(m);
    rebuildRelief(o);
    toast("Subject cut out (" + by + ")");
  } finally {
    m.cutting = false;
    cutStatus(null);
    if (S.sel === o.id) refreshInspector();
  }
}
function buildCutSection(o) {
  const m = o.meta, r = sec(inspEl, "Cut-out", m.cutting ? "working\u2026" : m.cutBy || "none");
  const chips = el("div", "chips");
  const kb = el("button", "chip", "Keep background");
  kb.setAttribute("aria-pressed", !!m.keepBg);
  kb.onclick = () => {
    m.keepBg = !m.keepBg;
    kb.setAttribute("aria-pressed", m.keepBg);
    applyAlpha(m);
    rebuildRelief(o);
  };
  const ab = el("button", "chip", "Auto-cut on drop");
  ab.setAttribute("aria-pressed", CUT.on);
  ab.onclick = () => {
    CUT.on = !CUT.on;
    localStorage.setItem("n0.autocut", CUT.on ? "1" : "0");
    ab.setAttribute("aria-pressed", CUT.on);
  };
  chips.append(kb, ab);
  r.appendChild(chips);
  chipRow(r, [["auto", "Auto"], ["modnet", "People"], ["u2net", "Accurate"]], (v) => CUT.model === v, (v) => {
    CUT.model = v;
    localStorage.setItem("n0.cutmodel", v);
  });
  const acts = el("div", "chips");
  acts.append(
    btn("Cut out subject", "", () => autoCut(o)),
    btn("Reset cut", "", () => {
      if (m.alpha0) {
        setAlpha(o, Float32Array.from(m.alpha0));
        refreshInspector();
      } else toast("Nothing to reset yet.");
    }),
    btn("Undo auto-cut", "", () => {
      m.alpha = null;
      m.cutBy = "none";
      applyAlpha(m);
      rebuildRelief(o);
      refreshInspector();
    }),
    btn(m.refine ? "Close refine" : "Refine", "", () => {
      m.refine = !m.refine;
      refreshInspector();
    })
  );
  r.appendChild(acts);
  if (m.cutErr) r.appendChild(el("div", "note", "Cut-out model error: " + m.cutErr));
  if (m.refine) refineEditor(r, o);
}
function refineEditor(parent, o) {
  const m = o.meta, st = m.rs || (m.rs = { mode: "add", size: 18, feather: 0.5 }), n = m.w * m.h;
  chipRow(parent, [["add", "Add"], ["erase", "Erase"], ["pick", "Tap to pick"]], (v) => st.mode === v, (v) => {
    st.mode = v;
  });
  sliderRow(parent, "Size", () => st.size, (v) => {
    st.size = v;
  }, 4, 80, 1);
  sliderRow(parent, "Feather", () => st.feather, (v) => {
    st.feather = v;
  }, 0, 1, 0.05);
  const k = Math.min(1, 640 / Math.max(m.w, m.h)), pw = Math.round(m.w * k), ph = Math.round(m.h * k);
  const cv = el("canvas");
  cv.width = pw;
  cv.height = ph;
  cv.style.cssText = "width:100%;display:block;touch-action:none;border:1px solid var(--line);border-radius:2px;margin-top:6px;cursor:crosshair";
  const ctx = cv.getContext("2d"), img = ctx.createImageData(pw, ph);
  const draw2 = () => {
    const d = img.data;
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const si = Math.min(m.h - 1, Math.round(y / k)) * m.w + Math.min(m.w - 1, Math.round(x / k)), a = m.alpha ? m.alpha[si] : 1, f = 0.28 + 0.72 * a, j = (y * pw + x) * 4;
      d[j] = m.px[si * 4] * f;
      d[j + 1] = m.px[si * 4 + 1] * f;
      d[j + 2] = m.px[si * 4 + 2] * f;
      d[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  let raf = 0;
  const sched = () => {
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      draw2();
    });
  };
  const pt = (e) => {
    const b = cv.getBoundingClientRect();
    return [clamp3(Math.round((e.clientX - b.left) / b.width * (m.w - 1)), 0, m.w - 1), clamp3(Math.round((e.clientY - b.top) / b.height * (m.h - 1)), 0, m.h - 1)];
  };
  const ensure = () => {
    m.keepBg = false;
    if (!m.alpha) {
      m.alpha = new Float32Array(n).fill(st.mode === "erase" ? 1 : 0);
      if (!m.cutBy || m.cutBy === "none") m.cutBy = "manual";
    }
  };
  const stamp = (x, y) => {
    const R2 = st.size / k, F = Math.max(0.02, st.feather), a = m.alpha, add = st.mode === "add";
    for (let j = Math.max(0, Math.floor(y - R2)); j <= Math.min(m.h - 1, Math.ceil(y + R2)); j++) for (let i = Math.max(0, Math.floor(x - R2)); i <= Math.min(m.w - 1, Math.ceil(x + R2)); i++) {
      const d = Math.hypot(i - x, j - y) / R2;
      if (d >= 1) continue;
      const w = d <= 1 - F ? 1 : (1 - d) / F, q = j * m.w + i;
      a[q] = add ? Math.max(a[q], w) : a[q] * (1 - w);
    }
  };
  const commit = () => {
    applyAlpha(m);
    rebuildRelief(o);
  };
  let down = false, last = null;
  cv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const [x, y] = pt(e);
    ensure();
    if (st.mode === "pick") {
      const i = y * m.w + x;
      if (m.alpha[i] > 0.5) {
        const bin = new Uint8Array(n);
        for (let j = 0; j < n; j++) bin[j] = m.alpha[j] > 0.5 ? 1 : 0;
        const L = labelComps(bin, m.w, m.h, 1), keep = L.lab[i];
        for (let j = 0; j < n; j++) if (bin[j] && L.lab[j] !== keep) m.alpha[j] = 0;
      } else {
        const reg = growRegion(m.px, m.w, m.h, [i], 14, 40, [m.px[i * 4], m.px[i * 4 + 1], m.px[i * 4 + 2]]);
        for (let j = 0; j < n; j++) if (reg[j]) m.alpha[j] = 1;
        const f = blurPlane(m.alpha, m.w, m.h, 1);
        m.alpha.set(f);
      }
      draw2();
      commit();
      return;
    }
    down = true;
    last = [x, y];
    stamp(x, y);
    sched();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!down) return;
    const [x, y] = pt(e), R2 = st.size / k, dx = x - last[0], dy = y - last[1], L = Math.hypot(dx, dy), s = Math.max(1, Math.ceil(L / (R2 / 3)));
    for (let t = 1; t <= s; t++) stamp(last[0] + dx * t / s, last[1] + dy * t / s);
    last = [x, y];
    sched();
  });
  const up = () => {
    if (!down) return;
    down = false;
    commit();
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  draw2();
  parent.appendChild(cv);
  parent.appendChild(el("div", "note", "Add paints the subject back, Erase removes it, Tap to pick keeps the part you tap (or adds a similar-coloured area)."));
}
CUT.depthOn = localStorage.getItem("n0.autodepth") !== "0";
var IDB = {
  db: null,
  open() {
    return this.db || (this.db = new Promise((res, rej) => {
      const r = indexedDB.open("n0studio", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("depth");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  },
  async get(k) {
    try {
      const db = await this.open();
      return await new Promise((res) => {
        const q = db.transaction("depth").objectStore("depth").get(k);
        q.onsuccess = () => res(q.result);
        q.onerror = () => res(null);
      });
    } catch (e) {
      return null;
    }
  },
  async put(k, v) {
    try {
      const db = await this.open();
      db.transaction("depth", "readwrite").objectStore("depth").put(v, k);
    } catch (e) {
    }
  }
};
function imgKey(m) {
  let h = 2166136261;
  const d = m.px;
  for (let i = 0; i < d.length; i += 1013) {
    h ^= d[i];
    h = Math.imul(h, 16777619);
  }
  return "da2s-" + m.w + "x" + m.h + "-" + (h >>> 0).toString(36);
}
async function autoDepth(o, { force = false } = {}) {
  const m = o.meta;
  if (m.depthing) return;
  m.depthing = true;
  const t0 = performance.now();
  try {
    const key2 = imgKey(m);
    let raw = force ? null : await IDB.get(key2);
    if (raw) {
      m.depthBy = "Depth Anything V2 (cached)";
    } else {
      cutStatus("Loading depth model\u2026", 0);
      try {
        const r = await runMatte("depth", m.photo, (p, s) => {
          if (s === "cutting") cutStatus("Estimating depth\u2026");
          else cutStatus(`Loading depth model\u2026 ${Math.round(p * 100)}%`, p);
        }, "depth");
        raw = { data: r.data, w: r.w, h: r.h };
        IDB.put(key2, raw);
        m.depthBy = "Depth Anything V2";
      } catch (e) {
        console.warn("depth model failed", e);
        m.depthErr = String(e && e.message || e).slice(0, 140);
        raw = { data: pseudoDepth(m.photo), w: m.w, h: m.h };
        m.depthBy = "quick (no model)";
        toast("Depth model couldn\u2019t load (" + m.depthErr.slice(0, 70) + "). Using a quick relief.", 7e3);
      }
    }
    if (!objById(o.id)) return;
    m.raw = raw;
    buildDepth(m);
    m.quick = false;
    m.depthMs = Math.round(performance.now() - t0);
    rebuildRelief(o);
  } finally {
    m.depthing = false;
    cutStatus(null);
    if (S.sel === o.id) refreshInspector();
  }
}
function buildDepth(m) {
  const { data, w: rw, h: rh } = m.raw, w = m.w, h = m.h, n = w * h;
  let d = resizeBilinear(data, rw, rh, w, h);
  const I = new Float32Array(n), px = m.px;
  for (let i = 0; i < n; i++) I[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  d = guidedFilter(I, d, w, h, Math.max(4, Math.round(Math.max(w, h) / 220)), 2e-3);
  const a = m.alpha, vals = [];
  for (let i = 0; i < n; i += 5) if (!a || a[i] > 0.5) vals.push(d[i]);
  if (vals.length < 50) for (let i = 0; i < n; i += 5) vals.push(d[i]);
  vals.sort((p, q) => p - q);
  const L = vals[Math.floor(0.02 * (vals.length - 1))], H = vals[Math.floor(0.98 * (vals.length - 1))], r = Math.max(1e-6, H - L), dn = new Float32Array(n);
  for (let i = 0; i < n; i++) dn[i] = clamp3((d[i] - L) / r, 0, 1);
  const hp = blurPlane(I, w, h, 2);
  for (let i = 0; i < n; i++) hp[i] = I[i] - hp[i];
  m.hp = hp;
  m.dn = dn;
  applyDepthMask(m);
}
function applyDepthMask(m) {
  if (!m.dn) return;
  const n = m.dn.length, a = m.alpha, o = m.depth && m.depth.length === n && m.depth !== m.dn ? m.depth : new Float32Array(n);
  if (!a) {
    o.set(m.dn);
  } else {
    const r = Math.max(3, Math.round(Math.max(m.w, m.h) / 150)), na = new Float32Array(n);
    for (let i = 0; i < n; i++) na[i] = m.dn[i] * a[i];
    const bn = blurPlane(na, m.w, m.h, r), ba = blurPlane(a, m.w, m.h, r);
    for (let i = 0; i < n; i++) {
      const ext = ba[i] > 0.01 ? bn[i] / ba[i] * Math.min(1, ba[i] * 6) : 0;
      o[i] = ext * (1 - a[i]) + m.dn[i] * a[i];
    }
  }
  if (m.hp && m.detail > 0) {
    const k = m.detail * 0.6;
    for (let i = 0; i < n; i++) o[i] += k * m.hp[i] * (a ? a[i] : 1);
  }
  m.depth = o;
  m.dw = m.w;
  m.dh = m.h;
}
var CAGE = THREE.MathUtils.degToRad(25);
function setFx(on) {
  S.fx = on;
  const b = $2("#bFx");
  if (b) b.setAttribute("aria-pressed", on);
  if (S.fxBtn) {
    S.fxBtn.setAttribute("aria-pressed", on);
    S.fxBtn.textContent = on ? "FX on" : "FX off";
  }
  bump();
}
function setCage(on) {
  const c = controls;
  if (on) {
    c.enablePan = false;
    c.minAzimuthAngle = -CAGE;
    c.maxAzimuthAngle = CAGE;
    c.minPolarAngle = Math.PI / 2 - CAGE;
    c.maxPolarAngle = Math.PI / 2 + CAGE;
  } else {
    c.enablePan = true;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI;
    c.rotateSpeed = 1;
    c.minDistance = 0.3;
    c.maxDistance = 60;
  }
}
var ANIM = { hold: false, idleAt: 0 };
controls.addEventListener("start", () => {
  ANIM.hold = true;
});
controls.addEventListener("end", () => {
  ANIM.hold = false;
  ANIM.idleAt = performance.now() + 3500;
});
function animTick(t) {
  for (const o2 of S.objs) {
    const m = o2.meta;
    if (!m || o2.kind !== "relief") continue;
    if (m.furMats) for (const u of m.furMats) {
      u.uniforms.uTime.value = t;
      u.uniforms.uWind.value = m.wind;
    }
    const bz = m.breathe ? 1 + 0.14 * Math.sin(t * 1.4) : 1;
    if (Math.abs(o2.root.scale.z - bz) > 1e-4) o2.root.scale.z = bz;
  }
  const R2 = S.rest, o = R2 && objById(R2.id);
  if (o && R2.cage && o.meta.sway && !ANIM.hold && !S.exporting && performance.now() > ANIM.idleAt) {
    const A = THREE.MathUtils.degToRad(9), sp = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    sp.theta = A * Math.sin(t * 0.9);
    sp.phi = Math.PI / 2 + A * 0.45 * Math.sin(t * 0.6 + 1);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp));
    camera.lookAt(controls.target);
  }
}
function enterRest(o) {
  if (!o || !o.meta.rest) return;
  S.rest = { id: o.id, cage: true };
  S.needFrame = false;
  const m = o.meta, Dw = restD(m.w / m.h) * o.holder.scale.x, c = o.holder.position;
  controls.target.copy(c);
  camera.position.set(c.x, c.y, c.z + Dw);
  camera.up.set(0, 1, 0);
  controls.minDistance = Dw * 0.6;
  controls.maxDistance = Dw * 1.6;
  camera.near = Math.max(0.01, Dw / 100);
  camera.far = Dw * 60;
  setCage(true);
  restTick(true);
  controls.update();
  bump();
  ensureWipe();
}
function leaveRest() {
  if (!S.rest) return;
  S.rest = null;
  setCage(false);
  const w = $2("#wipe");
  if (w) w.hidden = true;
  const b = $2("#wipebar");
  if (b) b.hidden = true;
}
function restTick(force) {
  const R2 = S.rest, o = R2 && objById(R2.id);
  if (!o) {
    if (R2) leaveRest();
    return;
  }
  const m = o.meta, asp = m.w / m.h, D = restD(asp), stW = stage2.clientWidth, stH = stage2.clientHeight;
  if (!stW || !stH) return;
  const lift = Math.round(sheet.coverPx()), Hv = Math.max(60, stH - lift), hp = Math.min(Hv, stW / asp), wp = hp * asp;
  const vf = THREE.MathUtils.radToDeg(2 * Math.atan(0.5 * stH / (D * hp)));
  if (force || Math.abs(vf - camera.fov) > 5e-3) {
    camera.fov = vf;
    camera.updateProjectionMatrix();
  }
  const w = $2("#wipe");
  if (w) {
    w.hidden = false;
    w.style.left = (stW - wp) / 2 + "px";
    w.style.top = (Hv - hp) / 2 + "px";
    w.style.width = wp + "px";
    w.style.height = hp + "px";
    if (w._for !== m) {
      w._for = m;
      w.querySelector("img").src = m.photo.toDataURL("image/jpeg", 0.95);
    }
  }
  const bar = $2("#wipebar");
  if (bar) bar.hidden = false;
  if (R2.cage) {
    const az = Math.abs(controls.getAzimuthalAngle()) / CAGE, po = Math.abs(controls.getPolarAngle() - Math.PI / 2) / CAGE, pr = clamp3((Math.max(az, po) - 0.55) / 0.45, 0, 1);
    controls.rotateSpeed = 1 - 0.75 * pr * pr;
  }
}
function ensureWipe() {
  if ($2("#wipe")) return;
  const w = el("div", "", '<img alt=""><i></i>');
  w.id = "wipe";
  w.hidden = true;
  stage2.appendChild(w);
  const bar = el("div", "", '<span>Photo</span><input type="range" min="0" max="100" value="0" aria-label="Compare photo with 3D"><span>3D</span>');
  bar.id = "wipebar";
  bar.hidden = true;
  stage2.appendChild(bar);
  const inp = bar.querySelector("input"), apply = () => {
    const v = +inp.value;
    w.querySelector("img").style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    w.querySelector("i").style.left = v + "%";
    w.querySelector("i").style.display = v > 0 && v < 100 ? "block" : "none";
  };
  inp.addEventListener("input", apply);
  apply();
}
var SC = { frames: [], bg: null, W: 0, H: 0, stream: null, video: null, params: { n: 24, fov: 48, dist: 2.8, pitch: 8, size: 1.2, res: 96, thr: 42, agree: 0.97, cx: 0, cy: 0 } };
function openScan(mode, file) {
  const root = $2("#scan");
  root.hidden = false;
  root.innerHTML = `
  <video playsinline muted></video><canvas class="ov"></canvas>
  <div class="top"><button class="btn" id="scX">Close</button><div class="grow"></div><span class="msg" id="scMsg">\u2014</span><button class="btn" id="scSet">Setup</button></div>
  <div class="bot">
    <div class="ring" id="scRing"></div>
    <div class="msg" id="scHint"></div>
    <div id="scPanel" hidden></div>
    <div class="ctrl"><button class="btn" id="scBg">Background</button><button class="shutter" id="scShot" aria-label="Capture" disabled></button><button class="btn pri" id="scBuild" disabled>Build</button></div>
  </div>`;
  const vid = root.querySelector("video"), ov = root.querySelector("canvas.ov");
  SC.video = vid;
  SC.frames = [];
  SC.bg = null;
  SC.ov = ov;
  SC.imported = false;
  const P3 = SC.params;
  const sp = $2("#scPanel", root);
  sp.innerHTML = [["Steps (photos per turn)", "n", 8, 48, 1], ["Field of view", "fov", 30, 80, 1], ["Camera distance", "dist", 1.6, 6, 0.1], ["Camera tilt \xB0", "pitch", -10, 40, 1], ["Object size", "size", 0.4, 3, 0.05], ["Detail (voxels)", "res", 48, 160, 8], ["Silhouette threshold", "thr", 10, 120, 1]].map(([l, k, a, b, s]) => `<div class="row" style="grid-template-columns:130px 1fr 44px"><label>${l}</label><input type="range" data-k="${k}" min="${a}" max="${b}" step="${s}" value="${P3[k]}"><output>${P3[k]}</output></div>`).join("") + `<div class="note">Turntable method: keep the camera still, put the object on a turntable (or a chair you can spin), a plain backdrop behind it, then rotate it by an equal step each time. Hold the object centred. Uneven steps blur the result.</div>`;
  sp.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => {
    P3[i.dataset.k] = +i.value;
    i.nextElementSibling.textContent = i.value;
    i.style.setProperty("--p", (i.value - i.min) / (i.max - i.min) * 100 + "%");
    drawRing();
  }));
  $2("#scSet", root).onclick = () => {
    sp.hidden = !sp.hidden;
  };
  $2("#scX", root).onclick = closeScan;
  $2("#scBg", root).onclick = () => {
    grabBg();
  };
  $2("#scShot", root).onclick = () => {
    capture();
  };
  $2("#scBuild", root).onclick = () => {
    buildScan();
  };
  drawRing();
  if (mode === "video" && file) {
    importVideo(file);
  } else startScanCamera();
  SC.raf = requestAnimationFrame(scanLoop);
}
function closeScan() {
  cancelAnimationFrame(SC.raf);
  if (SC.stream) {
    SC.stream.getTracks().forEach((t) => t.stop());
    SC.stream = null;
  }
  const r = $2("#scan");
  r.hidden = true;
  r.innerHTML = "";
  SC.video = null;
}
function drawRing() {
  const r = $2("#scRing");
  if (!r) return;
  const n = SC.params.n;
  r.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const d = el("i");
    if (i < SC.frames.length) d.className = "on";
    r.appendChild(d);
  }
  const b = $2("#scBuild");
  if (b) b.disabled = SC.frames.length < 8;
  const h = $2("#scHint");
  if (h) h.textContent = !SC.bg && !SC.imported ? "1. Point at the empty backdrop and tap Background." : SC.frames.length < SC.params.n ? `2. Rotate the object by ${(360 / SC.params.n).toFixed(1)}\xB0 and tap the shutter (${SC.frames.length}/${SC.params.n}).` : "3. All steps captured. Tap Build.";
  const m = $2("#scMsg");
  if (m) m.textContent = SC.frames.length + " / " + SC.params.n;
}
async function startScanCamera() {
  try {
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    SC.stream = st;
    SC.video.srcObject = st;
    await SC.video.play();
    $2("#scShot").disabled = false;
  } catch (e) {
    toast("Camera isn\u2019t available here. Use a video of the turntable instead (Import).", 5e3);
    $2("#scHint").textContent = "No camera. Close this and import a video of the object turning one full turn.";
  }
}
var SW = 240;
function frameToData(src, w, h) {
  const k = SW / w, cw = SW, ch = Math.max(2, Math.round(h * k));
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, cw, ch);
  return g.getImageData(0, 0, cw, ch);
}
function grabBg() {
  const v = SC.video;
  if (!v || !v.videoWidth) {
    toast("Camera not ready yet.");
    return;
  }
  SC.bg = frameToData(v, v.videoWidth, v.videoHeight);
  SC.W = SC.bg.width;
  SC.H = SC.bg.height;
  toast("Background saved");
  drawRing();
}
function maskFrom(img, bg, thr) {
  const w = img.width, h = img.height, d = img.data, b = bg.data, m = new Uint8Array(w * h);
  const t2 = thr * thr * 3 / 1;
  for (let i = 0; i < w * h; i++) {
    const dr = d[i * 4] - b[i * 4], dg = d[i * 4 + 1] - b[i * 4 + 1], db = d[i * 4 + 2] - b[i * 4 + 2];
    m[i] = dr * dr + dg * dg + db * db > t2 ? 1 : 0;
  }
  const er = (s) => {
    const o = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let a = 1;
      for (let j = -1; j <= 1 && a; j++) for (let i = -1; i <= 1; i++) if (!s[(y + j) * w + x + i]) {
        a = 0;
        break;
      }
      o[y * w + x] = a;
    }
    return o;
  };
  const di = (s) => {
    const o = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let a = 0;
      for (let j = -1; j <= 1 && !a; j++) for (let i = -1; i <= 1; i++) if (s[(y + j) * w + x + i]) {
        a = 1;
        break;
      }
      o[y * w + x] = a;
    }
    return o;
  };
  return er(di(di(er(m))));
}
function capture() {
  const v = SC.video;
  if (!v || !v.videoWidth) return;
  if (!SC.bg) {
    toast("Tap Background first, with nothing in view.");
    return;
  }
  if (SC.frames.length >= SC.params.n) {
    toast("All steps captured. Tap Build.");
    return;
  }
  SC.frames.push(frameToData(v, v.videoWidth, v.videoHeight));
  if (navigator.vibrate) navigator.vibrate(12);
  drawRing();
}
function scanLoop() {
  SC.raf = requestAnimationFrame(scanLoop);
  const v = SC.video, ov = SC.ov;
  if (!v || !ov) return;
  const vw = v.videoWidth || SC.W, vh = v.videoHeight || SC.H;
  if (!vw) return;
  const w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== w || ov.height !== h) {
    ov.width = w;
    ov.height = h;
  }
  const g = ov.getContext("2d");
  g.clearRect(0, 0, w, h);
  const s = Math.min(w / vw, h / vh), dw = vw * s, dh = vh * s, ox = (w - dw) / 2, oy = (h - dh) / 2;
  if (SC.bg && v.videoWidth) {
    const cur = frameToData(v, v.videoWidth, v.videoHeight);
    const m = maskFrom(cur, SC.bg, SC.params.thr);
    const cv = SC._mc || (SC._mc = document.createElement("canvas"));
    cv.width = cur.width;
    cv.height = cur.height;
    const gc = cv.getContext("2d"), id = gc.createImageData(cur.width, cur.height);
    for (let i = 0; i < m.length; i++) {
      if (m[i]) {
        id.data[i * 4] = 255;
        id.data[i * 4 + 1] = 90;
        id.data[i * 4 + 2] = 31;
        id.data[i * 4 + 3] = 110;
      }
    }
    gc.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(cv, ox, oy, dw, dh);
  }
  const P3 = SC.params, cx = ox + dw / 2, cy = oy + dh / 2;
  const f = dh / 2 / Math.tan(P3.fov * Math.PI / 360) / P3.dist;
  const half = P3.size / 2 * f;
  g.strokeStyle = "#ffffff88";
  g.setLineDash([5, 5]);
  g.lineWidth = 1;
  g.strokeRect(cx - half, cy - half, half * 2, half * 2);
  g.setLineDash([]);
  g.fillStyle = "#ffffffaa";
  g.fillRect(cx - 1, cy - 8, 2, 16);
  g.fillRect(cx - 8, cy - 1, 16, 2);
}
async function importVideo(file) {
  const v = SC.video;
  SC.imported = true;
  v.src = URL.createObjectURL(file);
  v.muted = true;
  v.playsInline = true;
  await new Promise((r) => {
    v.onloadedmetadata = r;
  });
  await v.play().catch(() => {
  });
  v.pause();
  const dur = v.duration;
  if (!isFinite(dur) || dur < 1) {
    toast("Couldn\u2019t read that video.");
    return;
  }
  $2("#scHint").textContent = "Reading frames\u2026";
  const grab = async (t) => {
    v.currentTime = t;
    await new Promise((r) => {
      v.onseeked = r;
    });
    return frameToData(v, v.videoWidth, v.videoHeight);
  };
  const n = SC.params.n;
  SC.frames = [];
  const a = await grab(0), b = await grab(Math.max(0, dur - 0.05));
  SC.W = a.width;
  SC.H = a.height;
  const bg = new ImageData(a.width, a.height);
  for (let i = 0; i < a.data.length; i++) bg.data[i] = Math.abs(a.data[i] - b.data[i]) < 14 ? a.data[i] : Math.round((a.data[i] + b.data[i]) / 2);
  SC.bg = bg;
  for (let i = 0; i < n; i++) {
    SC.frames.push(await grab(dur * (i / n)));
    drawRing();
    $2("#scHint").textContent = `Reading frames ${i + 1}/${n}\u2026`;
  }
  $2("#scHint").textContent = "Assumes one full, even turn. If the backdrop was plain this works best. Tap Build.";
  $2("#scBg").disabled = true;
}
function viewBasis(P3, i, n) {
  const phi = i / n * Math.PI * 2, pitch = P3.pitch * Math.PI / 180;
  const cam = [0, P3.dist * Math.sin(pitch), P3.dist * Math.cos(pitch)];
  const f = [-cam[0], -cam[1], -cam[2]];
  const fl = Math.hypot(...f);
  f[0] /= fl;
  f[1] /= fl;
  f[2] /= fl;
  let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];
  r = [-f[2], 0, f[0]];
  const rl = Math.hypot(...r) || 1;
  r = [r[0] / rl, 0, r[2] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { cam, f, r, u, cs: Math.cos(phi), sn: Math.sin(phi) };
}
function projectPoint(b, p, tanH, asp) {
  const x = b.cs * p[0] + b.sn * p[2], y = p[1], z = -b.sn * p[0] + b.cs * p[2];
  const dx = x - b.cam[0], dy = y - b.cam[1], dz = z - b.cam[2];
  const zc = dx * b.f[0] + dy * b.f[1] + dz * b.f[2];
  if (zc <= 0.01) return null;
  const xc = dx * b.r[0] + dy * b.r[1] + dz * b.r[2], yc = dx * b.u[0] + dy * b.u[1] + dz * b.u[2];
  return [0.5 + 0.5 * xc / (zc * tanH * asp), 0.5 - 0.5 * yc / (zc * tanH), zc, x, y, z];
}
async function carve(onProg) {
  const P3 = SC.params, n = SC.frames.length, R2 = P3.res, W = SC.W, H = SC.H, asp = W / H, tanH = Math.tan(P3.fov * Math.PI / 360);
  const masks = SC.frames.map((f) => maskFrom(f, SC.bg, P3.thr));
  const bases = masks.map((_, i) => viewBasis(P3, i, n));
  const occ = new Float32Array(R2 * R2 * R2), half = P3.size / 2;
  for (let iz = 0; iz < R2; iz++) {
    const z = ((iz + 0.5) / R2 - 0.5) * P3.size;
    for (let iy = 0; iy < R2; iy++) {
      const y = ((iy + 0.5) / R2 - 0.5) * P3.size;
      for (let ix = 0; ix < R2; ix++) {
        const x = ((ix + 0.5) / R2 - 0.5) * P3.size;
        let inside = 0, seen = 0;
        for (let v = 0; v < n; v++) {
          const q = projectPoint(bases[v], [x, y, z], tanH, asp);
          if (!q) continue;
          const u = q[0], t = q[1];
          if (u < 0 || u >= 1 || t < 0 || t >= 1) continue;
          seen++;
          if (masks[v][Math.floor(t * H) * W + Math.floor(u * W)]) inside++;
        }
        occ[(iz * R2 + iy) * R2 + ix] = seen >= n * 0.6 && inside >= seen * P3.agree ? 1 : 0;
      }
    }
    if (iz % 6 === 0) {
      onProg && onProg(iz / R2);
      await tick();
    }
  }
  return { occ, R: R2, masks, bases, W, H, asp, tanH, size: P3.size };
}
function surfaceNets(f, R2, size) {
  const sm = (a) => {
    const o = new Float32Array(a.length), I = (x, y, z) => (clamp3(z, 0, R2 - 1) * R2 + clamp3(y, 0, R2 - 1)) * R2 + clamp3(x, 0, R2 - 1);
    for (let z = 0; z < R2; z++) for (let y = 0; y < R2; y++) for (let x = 0; x < R2; x++) {
      let s = 0;
      for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += a[I(x + i, y + j, z + k)];
      o[(z * R2 + y) * R2 + x] = s / 27;
    }
    return o;
  };
  f = sm(sm(f));
  const idx = (x, y, z) => (z * R2 + y) * R2 + x;
  const iso = 0.5;
  const vid = new Int32Array((R2 - 1) ** 3).fill(-1);
  const verts = [];
  const cid = (x, y, z) => (z * (R2 - 1) + y) * (R2 - 1) + x;
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let z = 0; z < R2 - 1; z++) for (let y = 0; y < R2 - 1; y++) for (let x = 0; x < R2 - 1; x++) {
    const v = corners.map((c) => f[idx(x + c[0], y + c[1], z + c[2])]);
    let mask = 0;
    for (let k = 0; k < 8; k++) if (v[k] > iso) mask |= 1 << k;
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      const va = v[a], vb = v[b];
      if (va > iso === vb > iso) continue;
      const t = (iso - va) / (vb - va);
      sx += corners[a][0] + t * (corners[b][0] - corners[a][0]);
      sy += corners[a][1] + t * (corners[b][1] - corners[a][1]);
      sz += corners[a][2] + t * (corners[b][2] - corners[a][2]);
      cnt++;
    }
    vid[cid(x, y, z)] = verts.length / 3;
    verts.push(((x + sx / cnt + 0.5) / R2 - 0.5) * size, ((y + sy / cnt + 0.5) / R2 - 0.5) * size, ((z + sz / cnt + 0.5) / R2 - 0.5) * size);
  }
  const tri = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tri.push(a, c, b, a, d, c);
    else tri.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < R2 - 1; z++) for (let y = 1; y < R2 - 1; y++) for (let x = 1; x < R2 - 1; x++) {
    const o = f[idx(x, y, z)] > iso;
    if (o !== f[idx(x + 1, y, z)] > iso) {
      quad(vid[cid(x, y - 1, z - 1)], vid[cid(x, y, z - 1)], vid[cid(x, y, z)], vid[cid(x, y - 1, z)], !o);
    }
    if (o !== f[idx(x, y + 1, z)] > iso) {
      quad(vid[cid(x - 1, y, z - 1)], vid[cid(x - 1, y, z)], vid[cid(x, y, z)], vid[cid(x, y, z - 1)], !o);
    }
    if (o !== f[idx(x, y, z + 1)] > iso) {
      quad(vid[cid(x - 1, y - 1, z)], vid[cid(x, y - 1, z)], vid[cid(x, y, z)], vid[cid(x - 1, y, z)], !o);
    }
  }
  return { pos: new Float32Array(verts), index: tri, field: f };
}
function colourScan(res, pos, normals) {
  const { masks, bases, W, H, asp, tanH } = res, n = bases.length, N = pos.length / 3, col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let k = 0; k < N; k++) {
    const p = [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]], nx = normals[k * 3], ny = normals[k * 3 + 1], nz = normals[k * 3 + 2];
    let acc = [0, 0, 0], wt = 0;
    for (let v = 0; v < n; v++) {
      const b = bases[v], q = projectPoint(b, p, tanH, asp);
      if (!q) continue;
      if (q[0] < 0 || q[0] >= 1 || q[1] < 0 || q[1] >= 1) continue;
      const rx = b.cs * nx + b.sn * nz, rz = -b.sn * nx + b.cs * nz, ry = ny;
      const vx = b.cam[0] - q[3], vy = b.cam[1] - q[4], vz = b.cam[2] - q[5], vl = Math.hypot(vx, vy, vz) || 1;
      const d = (rx * vx + ry * vy + rz * vz) / vl;
      if (d <= 0.05) continue;
      const px = Math.floor(q[0] * W), py = Math.floor(q[1] * H);
      const m = masks[v];
      if (!m[py * W + px]) continue;
      const i = (py * W + px) * 4, fd = SC.frames[v].data, w = Math.pow(d, 4);
      acc[0] += fd[i] * w;
      acc[1] += fd[i + 1] * w;
      acc[2] += fd[i + 2] * w;
      wt += w;
    }
    if (wt > 0) c.setRGB(acc[0] / wt / 255, acc[1] / wt / 255, acc[2] / wt / 255, THREE.SRGBColorSpace);
    else c.setRGB(0.6, 0.6, 0.6);
    col[k * 3] = c.r;
    col[k * 3 + 1] = c.g;
    col[k * 3 + 2] = c.b;
  }
  return col;
}
async function buildScan() {
  const hint = $2("#scHint"), btn2 = $2("#scBuild");
  if (SC.frames.length < 8) {
    toast("Capture at least 8 steps.");
    return;
  }
  btn2.disabled = true;
  try {
    hint.textContent = "Carving the volume\u2026";
    const res = await carve((p) => {
      hint.textContent = "Carving the volume\u2026 " + Math.round(p * 100) + "%";
    });
    hint.textContent = "Building the surface\u2026";
    await tick();
    const net = surfaceNets(res.occ, res.R, res.size);
    if (net.pos.length < 30) {
      hint.textContent = "Nothing solid found. Check the background capture, lower the threshold, and centre the object.";
      btn2.disabled = false;
      return;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(net.pos, 3));
    g.setIndex(net.index);
    g.computeVertexNormals();
    hint.textContent = "Projecting colour\u2026";
    await tick();
    const col = colourScan(res, net.pos, g.attributes.normal.array);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
    closeScan();
    const o = registerObject("Scan " + String(S.objs.filter((x) => x.kind === "scan").length + 1).padStart(2, "0"), mesh, "scan", { size: 1.8, meta: { tris: net.index.length / 3 } });
    setTab && setTab("scene");
    toast(`Scan built: ${(net.index.length / 3).toLocaleString()} triangles`);
  } catch (e) {
    console.error(e);
    hint.textContent = "Scan failed: " + (e.message || e);
    btn2.disabled = false;
  }
}
var xr = { session: null, pts: /* @__PURE__ */ new Map(), n: 0 };
async function startDepthScan() {
  const lbl = $2("#xrMsg");
  if (!navigator.xr || !await navigator.xr.isSessionSupported("immersive-ar").catch(() => false)) {
    toast("This browser can\u2019t do AR depth capture. It needs Chrome on an Android phone with ARCore.", 5e3);
    return;
  }
  try {
    const session = await navigator.xr.requestSession("immersive-ar", { requiredFeatures: ["depth-sensing", "local-floor"], depthSensing: { usagePreference: ["cpu-optimized"], dataFormatPreference: ["luminance-alpha", "float32"] }, optionalFeatures: ["dom-overlay"], domOverlay: { root: document.body } });
    await gl2.makeXRCompatible();
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl2) });
    const ref = await session.requestReferenceSpace("local-floor");
    xr = { session, pts: /* @__PURE__ */ new Map(), n: 0 };
    const tmpInv = new THREE.Matrix4(), pv = new THREE.Vector3(), pw = new THREE.Vector4(), mat = new THREE.Matrix4(), mw = new THREE.Matrix4();
    let fr = 0;
    session.addEventListener("end", () => {
      finishDepthScan();
    });
    session.requestAnimationFrame(function onFrame(t, frame2) {
      session.requestAnimationFrame(onFrame);
      fr++;
      if (fr % 3) return;
      const pose = frame2.getViewerPose(ref);
      if (!pose) return;
      for (const view of pose.views) {
        let d;
        try {
          d = frame2.getDepthInformation(view);
        } catch (e) {
          continue;
        }
        if (!d) continue;
        tmpInv.fromArray(view.projectionMatrix).invert();
        mw.fromArray(view.transform.matrix);
        for (let j = 0; j < 36; j++) for (let i = 0; i < 48; i++) {
          const u = (i + 0.5) / 48, v = (j + 0.5) / 36, m = d.getDepthInMeters(u, v);
          if (!(m > 0.25 && m < 5)) continue;
          pw.set(u * 2 - 1, 1 - v * 2, -1, 1).applyMatrix4(tmpInv);
          pv.set(pw.x / pw.w, pw.y / pw.w, pw.z / pw.w);
          pv.multiplyScalar(m / -pv.z).applyMatrix4(mw);
          const key2 = Math.round(pv.x * 40) + "," + Math.round(pv.y * 40) + "," + Math.round(pv.z * 40);
          if (!xr.pts.has(key2)) {
            xr.pts.set(key2, [pv.x, pv.y, pv.z]);
            xr.n++;
          }
        }
      }
      const l = $2("#xrMsg");
      if (l) l.textContent = xr.n.toLocaleString() + " points";
    });
    toast("Walk slowly around the subject. Close the AR view to finish.", 6e3);
  } catch (e) {
    console.error(e);
    toast("Couldn\u2019t start depth capture: " + (e.message || e).toString().slice(0, 90), 6e3);
  }
}
function finishDepthScan() {
  const pts = [...xr.pts.values()];
  if (pts.length < 200) {
    toast("Not enough points captured.");
    return;
  }
  const pos = new Float32Array(pts.length * 3), col = new Float32Array(pts.length * 3);
  let miny = Infinity, maxy = -Infinity;
  pts.forEach((p) => {
    miny = Math.min(miny, p[1]);
    maxy = Math.max(maxy, p[1]);
  });
  const c = new THREE.Color();
  pts.forEach((p, i) => {
    pos.set(p, i * 3);
    c.setHSL(0.58 - 0.5 * (p[1] - miny) / Math.max(0.01, maxy - miny), 0.55, 0.62);
    col.set([c.r, c.g, c.b], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  registerObject("Depth scan", new THREE.Points(g, new THREE.PointsMaterial({ size: 0.012, vertexColors: true, sizeAttenuation: true })), "points", { size: 2.4 });
  toast(pts.length.toLocaleString() + " points captured");
}
var sheetEl = $2("#sheet");
var panes = $2("#panes");
var tabsEl = $2("#tabs");
var mqDesk = matchMedia("(min-width:900px)");
var sheet = {
  h: 0,
  hv: 0,
  ht: 0,
  drag: false,
  idx: 2,
  fullH: 600,
  last: -1,
  snaps() {
    const H = window.innerHeight;
    return [Math.round(66 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-b")) || 0)), Math.round(Math.min(250, H * 0.3)), Math.round(H * 0.52), Math.round(H * 0.86)];
  },
  coverPx() {
    return mqDesk.matches ? 0 : this.h;
  },
  setIdx(i, instant) {
    const s = this.snaps();
    this.idx = clamp3(i, 0, 3);
    this.ht = s[this.idx];
    if (instant) {
      this.h = this.ht;
      this.hv = 0;
    }
  },
  nearest(h, v) {
    const s = this.snaps(), p = h + v * 0.16;
    let b = 0, bd = 1e9;
    s.forEach((x, i) => {
      const d = Math.abs(x - p);
      if (d < bd) {
        bd = d;
        b = i;
      }
    });
    return b;
  },
  update(dt) {
    if (mqDesk.matches) {
      sheetEl.style.removeProperty("--fullh");
      return;
    }
    const full = Math.round(window.innerHeight * 0.88);
    if (full !== this.fullH) {
      this.fullH = full;
      sheetEl.style.setProperty("--fullh", full + "px");
    }
    if (this.h === 0 && !this.inited) {
      this.setIdx(1, true);
      this.inited = true;
    }
    if (!this.drag) {
      const w = 17, k = w * w, d = 2 * w;
      const a = -k * (this.h - this.ht) - d * this.hv;
      this.hv += a * dt;
      this.h += this.hv * dt;
      if (Math.abs(this.h - this.ht) < 0.15 && Math.abs(this.hv) < 3) {
        this.h = this.ht;
        this.hv = 0;
      }
    }
    const y = Math.round((this.fullH - this.h) * 10) / 10;
    if (y !== this.last) {
      this.last = y;
      sheetEl.style.transform = `translate3d(0,${y}px,0)`;
    }
  },
  begin() {
    this.drag = true;
    this.samples = [];
    this.hv = 0;
  },
  move(h, t) {
    const s = this.snaps(), lo = s[0], hi = s[3];
    if (h < lo) h = lo - (lo - h) * 0.3;
    else if (h > hi) h = hi + (h - hi) * 0.25;
    this.h = h;
    this.samples.push([t, h]);
    if (this.samples.length > 8) this.samples.shift();
  },
  end() {
    this.drag = false;
    const a = this.samples, n = a.length;
    let v = 0;
    if (n > 1) {
      const f = a[Math.max(0, n - 4)], l = a[n - 1], dt = (l[0] - f[0]) / 1e3;
      if (dt > 0) v = (l[1] - f[1]) / dt;
    }
    this.hv = v;
    this.idx = this.nearest(this.h, v);
    this.ht = this.snaps()[this.idx];
  }
};
function wireSheet() {
  const grab = $2("#grab"), head = [grab, tabsEl];
  let y0 = 0, h0 = 0, moved = false, down = false;
  head.forEach((n) => {
    n.addEventListener("pointerdown", (e) => {
      if (mqDesk.matches) return;
      down = true;
      moved = false;
      y0 = e.clientY;
      h0 = sheet.h;
      sheet.begin();
      n.setPointerCapture(e.pointerId);
    });
    n.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dy = e.clientY - y0;
      if (Math.abs(dy) > 5) moved = true;
      if (moved) sheet.move(h0 - dy, e.timeStamp);
    });
    const up = (e) => {
      if (!down) return;
      down = false;
      if (moved) {
        sheet.end();
        e.preventDefault && 0;
        suppressTab = true;
        setTimeout(() => {
          suppressTab = false;
        }, 50);
      } else {
        sheet.drag = false;
        sheet.setIdx(sheet.idx);
        if (n === grab) sheet.setIdx(sheet.idx <= 1 ? 2 : 1);
      }
    };
    n.addEventListener("pointerup", up);
    n.addEventListener("pointercancel", up);
  });
  grab.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") sheet.setIdx(sheet.idx + 1);
    if (e.key === "ArrowDown") sheet.setIdx(sheet.idx - 1);
  });
  let ty0 = 0, th0 = 0, mode = 0, tz = 0;
  panes.addEventListener("touchstart", (e) => {
    if (mqDesk.matches) return;
    ty0 = e.touches[0].clientY;
    th0 = sheet.h;
    mode = 0;
  }, { passive: true });
  panes.addEventListener("touchmove", (e) => {
    if (mqDesk.matches) return;
    const dy = e.touches[0].clientY - ty0;
    if (mode === 0) {
      if (Math.abs(dy) < 6) return;
      const s = sheet.snaps();
      if (dy > 0 && panes.scrollTop <= 0 && sheet.h > s[0] + 1 || dy < 0 && sheet.h < s[3] - 1) {
        mode = 1;
        sheet.begin();
        ty0 = e.touches[0].clientY;
        th0 = sheet.h;
      } else mode = 2;
    }
    if (mode === 1) {
      e.preventDefault();
      sheet.move(th0 - (e.touches[0].clientY - ty0), e.timeStamp);
    }
  }, { passive: false });
  const tend = () => {
    if (mode === 1) sheet.end();
    mode = 0;
  };
  panes.addEventListener("touchend", tend, { passive: true });
  panes.addEventListener("touchcancel", tend, { passive: true });
}
var suppressTab = false;
var TABN = [["scene", "Scene"], ["scan", "Scan"], ["look", "Look"], ["export", "Export"]];
var paneEls = {};
function setTab(id) {
  TABN.forEach(([k]) => {
    $2("#tab_" + k).setAttribute("aria-selected", k === id);
    paneEls[k].hidden = k !== id;
  });
  panes.scrollTop = 0;
  S.tab = id;
}
function buildTabs() {
  TABN.forEach(([k, l]) => {
    const b = el("button", "tab", l);
    b.id = "tab_" + k;
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => {
      if (suppressTab) return;
      setTab(k);
      if (!mqDesk.matches && sheet.idx < 2) sheet.setIdx(2);
    });
    tabsEl.appendChild(b);
    const p = el("div");
    p.id = "pane_" + k;
    p.hidden = true;
    panes.appendChild(p);
    paneEls[k] = p;
  });
}
function sliderRow(parent, label, get, set, min, max, step, fmt) {
  const r = el("div", "row");
  r.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
  const i = r.querySelector("input"), o = r.querySelector("output");
  const f = fmt || ((v) => step < 1 ? (+v).toFixed(step < 0.1 ? 2 : 1) : String(Math.round(v)));
  const paint = () => {
    const v = get();
    i.value = v;
    o.textContent = f(v);
    i.style.setProperty("--p", (v - min) / (max - min) * 100 + "%");
  };
  i.addEventListener("input", () => {
    set(+i.value);
    paint();
  });
  paint();
  r.sync = paint;
  parent.appendChild(r);
  return r;
}
function chipRow(parent, items, isOn, onPick, cls = "") {
  const row = el("div", "chips");
  items.forEach(([v, l]) => {
    const b = el("button", "chip " + cls, l);
    b.dataset.v = v;
    b.setAttribute("aria-pressed", isOn(v));
    b.addEventListener("click", () => {
      onPick(v);
      row.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", isOn(c.dataset.v)));
    });
    row.appendChild(b);
  });
  parent.appendChild(row);
  return row;
}
var sec = (parent, title, right) => {
  const s = el("div", "sec");
  if (title) {
    const t = el("div", "st");
    t.innerHTML = `<span>${title}</span><span>${right || ""}</span>`;
    s.appendChild(t);
  }
  parent.appendChild(s);
  return s;
};
var btn = (label, cls, fn) => {
  const b = el("button", "btn " + (cls || ""), label);
  b.addEventListener("click", fn);
  return b;
};
var objListEl;
var inspEl;
var inspSyncs = [];
function buildScenePane() {
  const p = paneEls.scene;
  const s1 = sec(p, "Objects");
  objListEl = el("div", "olist");
  s1.appendChild(objListEl);
  const add = el("div", "chips");
  add.style.marginTop = "8px";
  add.appendChild(btn("Import files", "pri", () => $2("#file").click()));
  Object.keys(PRIMS).forEach((k) => add.appendChild(btn("+ " + k, "", () => addPrimitive(k))));
  s1.appendChild(add);
  const note = el("div", "note", "Drop or import: glb, gltf (with its bin and textures), obj (+mtl), stl, ply (mesh, points or 3D Gaussian splat), splat, spz, ksplat, sog. Photos become relief. Videos open the turntable scanner.");
  s1.appendChild(note);
  inspEl = el("div");
  p.appendChild(inspEl);
  const s3 = sec(p, "Stage");
  sliderRow(s3, "Environment", () => S.env, (v) => {
    S.env = v;
    scene.environmentIntensity = v;
    hemi.intensity = 0.2 + v * 0.7;
    bump();
  }, 0, 2, 0.05);
  sliderRow(s3, "Key light", () => key.intensity, (v) => {
    key.intensity = v;
    bump();
  }, 0, 6, 0.1);
  const bgrow = el("div", "row");
  bgrow.innerHTML = '<label>Background</label><input type="color" value="#0b0b0c" style="width:100%;height:28px;border:1px solid var(--line);background:none;padding:0"><output></output>';
  bgrow.querySelector("input").addEventListener("input", (e) => {
    S.bg = e.target.value;
    bump();
  });
  s3.appendChild(bgrow);
  chipRow(s3, [[".5", "Draft"], [".8", "Normal"], ["1", "High"]], (v) => String(S.q) === v, (v) => {
    S.q = parseFloat(v);
    needResize = true;
  });
}
function renderObjList() {
  if (!objListEl) return;
  objListEl.innerHTML = "";
  if (!S.objs.length) {
    objListEl.appendChild(el("div", "note", "Nothing in the scene yet."));
    return;
  }
  S.objs.slice().reverse().forEach((o) => {
    const r = el("div", "orow");
    r.setAttribute("aria-selected", o.id === S.sel);
    const eye = el("button", "", o.vis ? "\u25C9" : "\u25CB");
    eye.title = "Show / hide";
    eye.addEventListener("click", () => {
      o.vis = !o.vis;
      o.holder.visible = o.vis;
      renderObjList();
      bump();
    });
    const nm = el("button", "nm", o.name);
    nm.addEventListener("click", () => selectObj(o.id));
    const bd = el("span", "badge", o.kind);
    const del = el("button", "", "\xD7");
    del.title = "Delete";
    del.addEventListener("click", () => removeObj(o.id));
    r.append(eye, nm, bd, del);
    objListEl.appendChild(r);
  });
}
var reliefT = 0;
var triNote = (m) => m.tris ? `${m.stats} grid \xB7 ${Math.round(m.tris / 1e3)}k triangles` + (m.maxSlope ? ` \xB7 max slope ${m.maxSlope.toFixed(1)}/${m.slopeLim.toFixed(0)}` : "") : "";
function refreshInspector(soft) {
  if (soft) {
    inspSyncs.forEach((f) => f());
    return;
  }
  if (!inspEl) return;
  inspEl.innerHTML = "";
  inspSyncs = [];
  const o = objById(S.sel);
  if (!o) return;
  const s = sec(inspEl, "Selected", o.name);
  const h = o.holder;
  chipRow(s, [["", "Orbit"], ["translate", "Move"], ["rotate", "Rotate"], ["scale", "Scale"]], (v) => (S.gizmo || "") === v, (v) => {
    S.pivot = false;
    S.gizmo = v || null;
    if (S.gizmo) {
      tc.attach(h);
      tc.setMode(S.gizmo);
    } else tc.detach();
    bump();
    refreshInspector();
  });
  const pv = el("div", "chips"), pb = el("button", "chip", "Move pivot");
  pb.setAttribute("aria-pressed", !!S.pivot);
  pb.addEventListener("click", () => {
    setPivotMode(!S.pivot);
    pb.setAttribute("aria-pressed", !!S.pivot);
  });
  pv.append(pb, btn("Pivot to centre", "", () => pivotTo(o, "center")), btn("Pivot to base", "", () => pivotTo(o, "base")), btn("Pivot to origin", "", () => pivotTo(o, "origin")));
  s.appendChild(pv);
  s.appendChild(el("div", "note", "Drag the arrows to move the pivot. The model stays put; Rotate and Scale then work around the new point."));
  const ax = ["x", "y", "z"];
  ax.forEach((a2) => inspSyncs.push(sliderRow(s, "Pos " + a2.toUpperCase(), () => h.position[a2], (v) => {
    h.position[a2] = v;
    bump();
  }, -6, 6, 0.01).sync));
  inspSyncs.push(sliderRow(s, "Turn", () => THREE.MathUtils.radToDeg(h.rotation.y), (v) => {
    h.rotation.y = THREE.MathUtils.degToRad(v);
    bump();
  }, -180, 180, 1, (v) => Math.round(v) + "\xB0").sync);
  inspSyncs.push(sliderRow(s, "Size", () => h.scale.x, (v) => {
    h.scale.setScalar(v);
    bump();
  }, 0.05, 6, 0.01).sync);
  if (o.kind === "relief") {
    const m = o.meta, rb = () => {
      clearTimeout(reliefT);
      reliefT = setTimeout(() => rebuildRelief(o), 60);
    };
    const r = sec(inspEl, "Relief", m.depthing ? "working\u2026" : m.depthBy || "flat");
    sliderRow(r, "Depth", () => m.scale, (v) => {
      m.scale = v;
      rb();
    }, 0, 1.2, 0.01);
    sliderRow(r, "Detail", () => m.detail, (v) => {
      m.detail = v;
      clearTimeout(reliefT);
      reliefT = setTimeout(() => {
        applyDepthMask(m);
        rebuildRelief(o);
      }, 120);
    }, 0, 1, 0.02);
    sliderRow(r, "Shading", () => m.shade, (v) => {
      m.shade = v;
      rb();
    }, 0, 1, 0.02);
    sliderRow(r, "Curve", () => m.gamma, (v) => {
      m.gamma = v;
      rb();
    }, 0.4, 2.5, 0.05);
    sliderRow(r, "Flatten", () => m.flat, (v) => {
      m.flat = v;
      rb();
    }, 0, 1, 0.02);
    sliderRow(r, "Smooth", () => m.smooth, (v) => {
      m.smooth = Math.round(v);
      rb();
    }, 0, 8, 1);
    const an = el("div", "chips");
    const tgm = (label, key2) => {
      const b = el("button", "chip", label);
      b.setAttribute("aria-pressed", !!m[key2]);
      b.addEventListener("click", () => {
        m[key2] = !m[key2];
        b.setAttribute("aria-pressed", m[key2]);
        if (key2 === "sway") {
          ANIM.idleAt = 0;
          if (!m.sway && S.rest) enterRest(o);
        }
      });
      return b;
    };
    an.append(tgm("Sway", "sway"), tgm("Breathe", "breathe"));
    r.appendChild(an);
    sliderRow(r, "Fur", () => m.fur, (v) => {
      const was = m.fur > 0;
      m.fur = v;
      if (was !== v > 0) rb();
      else if (m.furMats) m.furMats.forEach((u) => u.uniforms.uLen.value = v * 0.07);
    }, 0, 1, 0.02);
    sliderRow(r, "Wind", () => m.wind, (v) => {
      m.wind = v;
    }, 0, 2, 0.02);
    sliderRow(r, "Tear edges", () => m.tear, (v) => {
      m.tear = v;
      rb();
    }, 0, 1, 0.02);
    chipRow(r, [["draft", "Draft"], ["high", "High"]], (v) => (m.hq ? "high" : "draft") === v, (v) => {
      m.hq = v === "high";
      rebuildRelief(o);
      r.querySelector(".tri").textContent = triNote(m);
    });
    chipRow(r, [["mesh", "Surface"], ["splats", "Splats"], ["points", "Points"]], (v) => m.mode === v, (v) => {
      m.mode = v;
      rebuildRelief(o);
      refreshInspector();
    });
    if (m.mode === "splats" && m.splat) {
      r.appendChild(el("div", "note", m.splat.count.toLocaleString() + " splats \xB7 32 bytes each"));
      const ex = el("div", "chips");
      ex.append(btn("Export .splat", "", () => exportPhotoSplat(o)));
      r.appendChild(ex);
    }
    sliderRow(r, "Point size", () => m.pt, (v) => {
      m.pt = v;
      rb();
    }, 3e-3, 0.04, 1e-3);
    const row = el("div", "chips");
    const tg = (label, key2, onset) => {
      const b = el("button", "chip", label);
      b.setAttribute("aria-pressed", !!m[key2]);
      b.addEventListener("click", () => {
        m[key2] = !m[key2];
        b.setAttribute("aria-pressed", m[key2]);
        (onset || rebuildRelief)(o);
      });
      return b;
    };
    const ad = el("button", "chip", "Auto depth");
    ad.setAttribute("aria-pressed", CUT.depthOn);
    ad.addEventListener("click", () => {
      CUT.depthOn = !CUT.depthOn;
      localStorage.setItem("n0.autodepth", CUT.depthOn ? "1" : "0");
      ad.setAttribute("aria-pressed", CUT.depthOn);
    });
    row.append(tg("Fill behind", "fill"), tg("Solidify", "solid"), ad, btn("Original look", "", () => {
      m.shade = 0;
      m.detail = 0;
      m.scale = 0.3;
      applyDepthMask(m);
      rebuildRelief(o);
      refreshInspector();
    }), btn("Run AI depth", "", () => autoDepth(o, { force: true })));
    r.appendChild(row);
    sliderRow(r, "Thickness", () => m.thick, (v) => {
      m.thick = v;
      if (m.solid) rb();
    }, 0, 0.6, 0.01);
    if (m.rest) {
      const vw = el("div", "chips");
      const un = el("button", "chip", "Unlock orbit");
      un.setAttribute("aria-pressed", !!(S.rest && !S.rest.cage));
      un.addEventListener("click", () => {
        if (!S.rest || S.rest.id !== o.id) {
          enterRest(o);
        }
        if (S.rest.cage) {
          S.rest.cage = false;
          setCage(false);
        } else {
          enterRest(o);
        }
        un.setAttribute("aria-pressed", !S.rest.cage);
      });
      vw.append(btn("Original view", "", () => {
        enterRest(o);
        un.setAttribute("aria-pressed", false);
      }), un);
      r.appendChild(vw);
    }
    r.appendChild(el("div", "note tri", triNote(m)));
    if (m.depthErr) r.appendChild(el("div", "note", "Depth model error: " + m.depthErr));
    r.appendChild(el("div", "note", "Studio build " + BUILD));
    r.appendChild(el("div", "note", "Depth runs in your browser (WebGPU if available, otherwise WASM) and is cached per photo. Defaults stay subtle so the surface looks like the photo."));
  }
  if (o.kind === "relief" && o.meta.photo) buildCutSection(o);
  if (o.kind === "points" || o.kind === "splat") {
    const r = sec(inspEl, o.kind === "splat" ? "Splat" : "Points");
    if (o.kind === "points") {
      const pm = o.root.material;
      sliderRow(r, "Point size", () => pm.size, (v) => {
        pm.size = v;
        bump();
      }, 2e-3, 0.06, 1e-3);
    }
    if (o.kind === "splat") {
      const fl = el("div", "chips");
      const b = el("button", "chip", "Flip upside-down");
      b.addEventListener("click", () => {
        o.root.rotation.x += Math.PI;
        bump();
      });
      fl.appendChild(b);
      r.appendChild(fl);
      r.appendChild(el("div", "note", "Splats render with Spark. The look applies to the selected object; Depth band and Edges masks don\u2019t see splat depth."));
    }
  }
  const a = sec(inspEl);
  const ac = el("div", "chips");
  ac.append(btn("Frame", "", () => {
    frameAll();
  }), btn("Hide", " ", () => {
    o.vis = false;
    o.holder.visible = false;
    renderObjList();
    bump();
  }), btn("Delete", "", () => removeObj(o.id)));
  a.appendChild(ac);
}
function buildScanPane() {
  const p = paneEls.scan;
  const s = sec(p, "Scan");
  const card = (t, d) => {
    const c = el("div", "card");
    c.innerHTML = `<h4>${t}</h4><p>${d}</p>`;
    const a2 = el("div", "acts");
    c.appendChild(a2);
    s.appendChild(c);
    return a2;
  };
  let a = card("Photo \u2192 relief", "One photo becomes a displaced surface you can orbit a few degrees. Instant everywhere; AI depth (in-browser) sharpens it.");
  a.append(btn("Choose photo", "pri", () => {
    const f = $2("#file");
    f.accept = "image/*";
    f.onchange = async () => {
      await importFiles(f.files);
      f.value = "";
      f.accept = FILE_ACCEPT;
      f.onchange = null;
    };
    f.click();
  }));
  a = card("Turntable scan", "Real geometry from your own camera. Rotate an object in equal steps in front of a plain backdrop; the studio carves a solid from the silhouettes and projects colour onto it.");
  a.append(btn("Scan with camera", "pri", () => openScan("camera")), btn("Import turntable video", "", () => {
    const f = $2("#file");
    f.accept = "video/*";
    f.onchange = () => {
      if (f.files[0]) openScan("video", f.files[0]);
      f.value = "";
      f.accept = FILE_ACCEPT;
      f.onchange = null;
    };
    f.click();
  }));
  a = card("Depth scan \xB7 LiDAR-style", "Walk around a subject while the phone\u2019s depth sensor builds a point cloud. Needs Chrome on an Android phone with ARCore depth. iPhone browsers don\u2019t expose LiDAR yet.");
  a.append(btn("Start depth scan", "", startDepthScan));
  const xm = el("span", "badge", "");
  xm.id = "xrMsg";
  a.appendChild(xm);
  s.appendChild(el("div", "note", "Bring your own: for a splat made with Polycam, Luma, Brush or nerfstudio, export .ply, .splat or .spz and import it in Scene. Training new splats inside the browser isn\u2019t built in yet."));
}
var FILE_ACCEPT = ".glb,.gltf,.bin,.obj,.mtl,.stl,.ply,.splat,.spz,.ksplat,.sog,image/*,video/*";
function palGradient(p) {
  if (p.id === "src") return "linear-gradient(90deg,#ff5d5d,#ffcc4d,#4dd68c,#4d8bff)";
  if (!p.c) return "var(--raise)";
  const cols = p.c.map(N0.hexRGB).sort((a, b) => N0.lum255(a) - N0.lum255(b)), n = cols.length;
  return "linear-gradient(90deg," + cols.map((c, i) => `rgb(${c}) ${i / n * 100}% ${(i + 1) / n * 100}%`).join(",") + ")";
}
var HERO = ["px", "bright", "contrast", "scan", "mstr", "bloom", "curv", "snr", "jit", "rgbs", "tear", "gblock"];
var lookSyncs = [];
function ctlRow(parent, c) {
  const P3 = N0.P;
  if (c.t === "r") {
    const r = sliderRow(parent, c.l, () => P3[c.k], (v) => {
      P3[c.k] = v;
      bump();
    }, c.min, c.max, c.step);
    lookSyncs.push(r.sync);
  } else if (c.t === "c") {
    const w = el("div");
    w.appendChild(el("div", "sub", c.l));
    chipRow(w, c.opts, (v) => String(P3[c.k]) === String(v), (v) => {
      P3[c.k] = v;
      bump();
    });
    parent.appendChild(w);
  } else {
    const w = el("div", "chips");
    const b = el("button", "chip", c.l);
    b.setAttribute("aria-pressed", !!P3[c.k]);
    b.addEventListener("click", () => {
      P3[c.k] = !P3[c.k];
      b.setAttribute("aria-pressed", !!P3[c.k]);
      bump();
    });
    w.appendChild(b);
    parent.appendChild(w);
  }
}
function buildLookPane() {
  const p = paneEls.look, P3 = N0.P;
  const se = sec(p, "Effects");
  chipRow(se, [["crt", "CRT Lab look"], ["stack", "All n0ise effects"]], (v) => (S.engine || "crt") === v, (v) => {
    S.engine = v;
    if (v === "stack") {
      fxLoad();
      if (S.mask.mode === 0) {
        S.mask.mode = 2;
      }
      if (S.sel == null && S.objs.length) selectObj(S.objs[S.objs.length - 1].id);
    }
    rebuildLook();
    bump();
  });
  if (S.engine === "stack") {
    se.appendChild(btn("Edit effects", "pri", fxOpen));
    se.appendChild(el("div", "note", fxReady() ? "The effect stack runs on the selected object. The background stays as it is." : "Loading the effect engine\u2026"));
  }
  const s0 = sec(p, "Look stack");
  const top = el("div", "chips");
  const fxb = btn("FX on", "", () => {
  });
  fxb.setAttribute("aria-pressed", S.fx);
  fxb.addEventListener("click", () => {
    S.fx = !S.fx;
    fxb.setAttribute("aria-pressed", S.fx);
    fxb.textContent = S.fx ? "FX on" : "FX off";
    $2("#bFx").setAttribute("aria-pressed", S.fx);
    bump();
  });
  top.appendChild(fxb);
  s0.appendChild(top);
  S.fxBtn = fxb;
  sliderRow(s0, "Amount", () => S.mask.amt, (v) => {
    S.mask.amt = v;
    bump();
  }, 0, 1, 0.01);
  s0.appendChild(el("div", "sub", "Apply the look to"));
  s0.appendChild(el("div", "note", "Selected is the default: pick an object and the look stays on it, the background stays clean."));
  chipRow(s0, [["2", "Selected"], ["0", "Everything"], ["1", "Depth band"], ["3", "Edges"]], (v) => String(S.mask.mode) === v, (v) => {
    S.mask.mode = +v;
    if (v === "1") S.mask.focus = controls.getDistance();
    syncMask();
    bump();
  });
  const mk = el("div");
  s0.appendChild(mk);
  function syncMask() {
    mk.innerHTML = "";
    if (S.mask.mode === 1) {
      sliderRow(mk, "Focus", () => S.mask.focus, (v) => {
        S.mask.focus = v;
        bump();
      }, 0.2, 30, 0.05);
      sliderRow(mk, "Range", () => S.mask.range, (v) => {
        S.mask.range = v;
        bump();
      }, 0.05, 12, 0.05);
    }
    if (S.mask.mode === 1 || S.mask.mode === 3) sliderRow(mk, "Softness", () => S.mask.soft, (v) => {
      S.mask.soft = v;
      bump();
    }, 0.02, 6, 0.02);
    if (S.mask.mode === 2) mk.appendChild(el("div", "note", "Tap an object in the scene to pick it. The look is applied to that object only."));
    if (S.mask.mode > 0) {
      const c = el("div", "chips");
      const b = el("button", "chip", "Invert");
      b.setAttribute("aria-pressed", S.mask.inv);
      b.addEventListener("click", () => {
        S.mask.inv = !S.mask.inv;
        b.setAttribute("aria-pressed", S.mask.inv);
        bump();
      });
      c.appendChild(b);
      if (S.mask.mode === 1) {
        const f = btn("Focus on target", "", () => {
          S.mask.focus = controls.getDistance();
          syncMask();
          bump();
        });
        c.appendChild(f);
      }
      mk.appendChild(c);
    }
  }
  syncMask();
  const s1 = sec(p, "Hardware");
  chipRow(s1, N0.PROFILES.map((x) => [x[0], x[1]]), (v) => P3.profile === v, (v) => {
    const keep = { pal: P3.pal, method: P3.method, px: P3.px, depth: P3.depth };
    N0.applyProfile(v);
    Object.assign(P3, keep);
    bump();
    rebuildLook();
  });
  const s2 = sec(p, "Colour");
  const pr = el("div", "chips");
  N0.PALS.filter((x) => x.id !== "custom").sort((a, b) => (b.id === "src") - (a.id === "src")).forEach((x) => {
    const b = el("button", "sw");
    b.title = x.name;
    b.style.background = palGradient(x);
    b.setAttribute("aria-pressed", P3.pal === x.id);
    b.addEventListener("click", () => {
      P3.pal = x.id;
      pr.querySelectorAll(".sw").forEach((n) => n.setAttribute("aria-pressed", n === b));
      bump();
    });
    pr.appendChild(b);
  });
  s2.appendChild(pr);
  s2.appendChild(el("div", "note", "Original colour is the default: effects keep the scene\u2019s own colours until you pick a palette."));
  const s3 = sec(p, "Dither");
  ctlRow(s3, N0.CTL.method);
  const s4 = sec(p, "Tune");
  HERO.forEach((k) => ctlRow(s4, N0.CTL[k]));
  const heroSet = new Set(HERO.concat(["method"]));
  const names = { bitmap: "Bitmap", signal: "Signal", beam: "Beam & phosphor", glass: "Glass", glitch: "Glitch", wave: "Wave", lab: "Lab" };
  N0.TABS.filter((t) => t[0] !== "display").forEach(([tid]) => {
    const d = el("details", "acc");
    d.innerHTML = `<summary>${names[tid] || tid}</summary>`;
    const inn = el("div", "in");
    d.appendChild(inn);
    let g = "";
    N0.CT.filter((c) => c.tab === tid && !heroSet.has(c.k)).forEach((c) => {
      if (c.g !== g) {
        g = c.g;
        inn.appendChild(el("div", "sub", g));
      }
      ctlRow(inn, c);
    });
    p.appendChild(d);
  });
  const s5 = sec(p, "Skin");
  chipRow(s5, [["lab", "Lab"], ["parchment", "Parchment"], ["utility", "Utility"]], (v) => document.documentElement.dataset.skin === v, (v) => setSkin(v));
}
function rebuildLook() {
  paneEls.look.innerHTML = "";
  lookSyncs = [];
  buildLookPane();
}
function setSkin(v) {
  document.documentElement.dataset.skin = v;
  try {
    localStorage.setItem("n0ise.studio.skin", v);
  } catch (e) {
  }
}
async function deliver(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5e3);
}
async function waitFrames(n) {
  for (let i = 0; i < n; i++) await tick();
}
async function exportImage(scale, withFx) {
  const q0 = S.q, fx0 = S.hold;
  S.exporting = true;
  S.big = true;
  S.q = Math.min(1, q0) * scale;
  if (!withFx) S.hold = true;
  needResize = true;
  await waitFrames(4);
  const blob = await new Promise((r) => canvas2.toBlob(r, "image/png"));
  S.exporting = false;
  S.big = false;
  S.q = q0;
  S.hold = fx0;
  needResize = true;
  if (blob) await deliver(blob, `n0ise-studio-${Date.now().toString(36)}.png`);
  else toast("Export failed.");
}
function recordCanvas(seconds, spin) {
  return new Promise((res, rej) => {
    if (!window.MediaRecorder || !canvas2.captureStream) return rej(new Error("Recording isn\u2019t supported here."));
    const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return rej(new Error("No recording format available."));
    const chunks = [], rec = new MediaRecorder(canvas2.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8e6 });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      S.exporting = false;
      S.spin = spin0;
      controls.autoRotateSpeed = 2.4;
      $2("#bSpin").setAttribute("aria-pressed", S.spin);
      res({ blob: new Blob(chunks, { type: mime.split(";")[0] }), ext: mime.includes("mp4") ? "mp4" : "webm" });
    };
    const spin0 = S.spin;
    S.exporting = true;
    if (spin) {
      S.spin = true;
      controls.autoRotateSpeed = 60 / seconds;
    }
    rec.start();
    setTimeout(() => rec.state !== "inactive" && rec.stop(), seconds * 1e3);
    S.stopRec = () => rec.state !== "inactive" && rec.stop();
  });
}
function exportGLB() {
  const prevView = S.view;
  S.view = "shaded";
  applyView();
  const g = new THREE.Group();
  S.objs.filter((o) => o.vis && o.kind !== "splat").forEach((o) => {
    const c = o.holder.clone(true);
    g.add(c);
  });
  if (!g.children.length) {
    toast("Nothing exportable. Splats can\u2019t go into a GLB.");
    S.view = prevView;
    applyView();
    return;
  }
  new GLTFExporter().parse(g, async (res) => {
    await deliver(new Blob([res], { type: "model/gltf-binary" }), "n0ise-scene.glb");
    S.view = prevView;
    applyView();
  }, (err) => {
    console.error(err);
    toast("GLB export failed.");
    S.view = prevView;
    applyView();
  }, { binary: true, onlyVisible: true });
}
function exportPLY(o) {
  let node = null;
  o.holder.traverse((n2) => {
    if (!node && (n2.isMesh || n2.isPoints) && n2.geometry && n2.geometry.attributes.position) node = n2;
  });
  if (!node) {
    toast("Pick a mesh or a point cloud first.");
    return;
  }
  o.holder.updateMatrixWorld(true);
  node.updateMatrixWorld(true);
  const g = node.geometry, pos = g.attributes.position, col = g.attributes.color, idx = g.index, m = node.matrixWorld, v = new THREE.Vector3(), c = new THREE.Color();
  const n = pos.count, faces = idx ? idx.count / 3 : 0;
  let s = `ply
format ascii 1.0
element vertex ${n}
property float x
property float y
property float z
${col ? "property uchar red\nproperty uchar green\nproperty uchar blue\n" : ""}${faces ? `element face ${faces}
property list uchar int vertex_indices
` : ""}end_header
`;
  const lines = [];
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    let l = v.x.toFixed(5) + " " + v.y.toFixed(5) + " " + v.z.toFixed(5);
    if (col) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.LinearSRGBColorSpace).convertLinearToSRGB();
      l += " " + Math.round(c.r * 255) + " " + Math.round(c.g * 255) + " " + Math.round(c.b * 255);
    }
    lines.push(l);
  }
  for (let i = 0; i < faces; i++) lines.push("3 " + idx.getX(i * 3) + " " + idx.getX(i * 3 + 1) + " " + idx.getX(i * 3 + 2));
  deliver(new Blob([s + lines.join("\n") + "\n"], { type: "application/octet-stream" }), (o.name || "scan").replace(/\W+/g, "_") + ".ply");
}
function buildExportPane() {
  const p = paneEls.export;
  const s = sec(p, "Image");
  let scale = 1;
  chipRow(s, [["1", "1\xD7"], ["2", "2\xD7"]], (v2) => String(scale) === v2, (v2) => {
    scale = +v2;
  });
  const a = el("div", "chips");
  a.style.marginTop = "6px";
  a.append(btn("PNG with look", "pri", () => exportImage(scale, true)), btn("PNG original", "", () => exportImage(scale, false)));
  s.appendChild(a);
  const v = sec(p, "Video");
  let secs = 8;
  sliderRow(v, "Turntable (s)", () => secs, (x) => {
    secs = x;
  }, 3, 20, 1);
  const b = el("div", "chips");
  const t = btn("Record turntable", "pri", async () => {
    t.disabled = true;
    toast("Recording\u2026", secs * 1e3);
    try {
      const r = await recordCanvas(secs, true);
      await deliver(r.blob, `n0ise-turntable.${r.ext}`);
    } catch (e) {
      toast(e.message || "Recording failed");
    }
    t.disabled = false;
  });
  const l = btn("Record live", "", async () => {
    if (S.stopRec && l.dataset.on) {
      S.stopRec();
      return;
    }
    l.dataset.on = "1";
    l.textContent = "Stop";
    try {
      const r = await recordCanvas(120, false);
      await deliver(r.blob, `n0ise-live.${r.ext}`);
    } catch (e) {
      toast(e.message || "Recording failed");
    }
    delete l.dataset.on;
    l.textContent = "Record live";
  });
  b.append(t, l);
  v.appendChild(b);
  const m = sec(p, "Model");
  const mb = el("div", "chips");
  mb.append(btn("Scene \u2192 GLB", "", exportGLB), btn("Selected \u2192 PLY", "", () => {
    const o = objById(S.sel);
    if (!o) toast("Select an object first.");
    else exportPLY(o);
  }));
  m.appendChild(mb);
  m.appendChild(el("div", "note", "GLB carries meshes and points with their materials. Splats stay in their own format. A turntable scan exports as a coloured mesh in either format."));
  const k = sec(p, "Look");
  const kb = el("div", "chips");
  kb.append(
    btn("Save look file", "", () => deliver(new Blob([JSON.stringify({ n0ise: 1, P: N0.P, mask: S.mask })], { type: "application/json" }), "n0ise-look.json")),
    btn("Load look file", "", () => {
      const f = el("input");
      f.type = "file";
      f.accept = ".json,application/json";
      f.onchange = async () => {
        try {
          const j = JSON.parse(await f.files[0].text());
          if (!j.n0ise) throw 0;
          Object.assign(N0.P, j.P);
          if (j.mask) Object.assign(S.mask, j.mask);
          rebuildLook();
          bump();
          toast("Look loaded");
        } catch (e) {
          toast("Not a look file.");
        }
      };
      f.click();
    })
  );
  k.appendChild(kb);
}
function buildHud() {
  const seg = $2("#viewSeg");
  [["shaded", "Shaded"], ["clay", "Clay"], ["normal", "Normal"], ["depth", "Depth"], ["wire", "Wire"]].forEach(([k, l]) => {
    const b = el("button", "", l);
    b.setAttribute("aria-pressed", S.view === k);
    b.addEventListener("click", () => {
      S.view = k;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      applyView();
    });
    seg.appendChild(b);
  });
  $2("#bFx").addEventListener("click", () => {
    S.fx = !S.fx;
    $2("#bFx").setAttribute("aria-pressed", S.fx);
    if (S.fxBtn) {
      S.fxBtn.setAttribute("aria-pressed", S.fx);
      S.fxBtn.textContent = S.fx ? "FX on" : "FX off";
    }
    bump();
  });
  const h = $2("#bHold");
  const on = (v) => {
    S.hold = v;
    h.setAttribute("aria-pressed", v);
  };
  h.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    on(true);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((t) => h.addEventListener(t, () => on(false)));
  h.addEventListener("contextmenu", (e) => e.preventDefault());
  $2("#bFrame").addEventListener("click", frameAll);
  $2("#bGrid").addEventListener("click", () => {
    S.grid = !S.grid;
    $2("#bGrid").setAttribute("aria-pressed", S.grid);
  });
  $2("#bSpin").addEventListener("click", () => {
    S.spin = !S.spin;
    $2("#bSpin").setAttribute("aria-pressed", S.spin);
  });
  $2("#bImport").addEventListener("click", () => {
    $2("#file").accept = FILE_ACCEPT;
    $2("#file").click();
  });
  $2("#bExport").addEventListener("click", () => {
    setTab("export");
    if (!mqDesk.matches) sheet.setIdx(2);
  });
  $2("#file").addEventListener("change", async (e) => {
    if (e.target.onchange && e.target.onchange !== null) return;
    await importFiles(e.target.files);
    e.target.value = "";
  });
  stage2.addEventListener("dragover", (e) => {
    e.preventDefault();
    stage2.classList.add("drag");
  });
  stage2.addEventListener("dragleave", () => stage2.classList.remove("drag"));
  stage2.addEventListener("drop", (e) => {
    e.preventDefault();
    stage2.classList.remove("drag");
    importFiles(e.dataTransfer.files);
  });
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => e.preventDefault());
  addEventListener("paste", (e) => {
    const f = [...e.clipboardData?.files || []];
    if (f.length) importFiles(f);
  });
  addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select")) return;
    if (e.key === "f") frameAll();
    if (e.key === " ") {
      e.preventDefault();
      S.hold = true;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (S.sel != null) removeObj(S.sel);
    }
  });
  addEventListener("keyup", (e) => {
    if (e.key === " ") S.hold = false;
  });
  mqDesk.addEventListener("change", () => {
    sheet.last = -1;
    needResize = true;
  });
  addEventListener("resize", () => {
    needResize = true;
    sheet.setIdx(sheet.idx, false);
  });
}
studioDefaults();
buildTabs();
buildHud();
buildScenePane();
buildScanPane();
if (renderer) {
  buildLookPane();
}
buildExportPane();
wireSheet();
setTab("scene");
try {
  const sk = localStorage.getItem("n0ise.studio.skin");
  if (sk) document.documentElement.dataset.skin = sk;
} catch (e) {
}
boot3d();
window.__studio = { enterRest, leaveRest, restTick, setFx, autoDepth, buildDepth, restD, MATTERS, CUT, autoCut, refineMask, applyAlpha, S, N0, THREE, scene, camera, controls, renderer, importFiles, addPrimitive, sheet, SC, carve, surfaceNets, buildScan, makeRelief, pseudoDepth, photoToRelief, objById, selectObj, removeObj, bump, setTab, rebuildRelief, applyView, frameAll, exportImage, get rt() {
  return rt;
} };
