/* Subject matte: a first-class mask source for every stage of the stack.
   Sources: person (MediaPipe, off the main thread), luma range, colour key, drawn, or none.
   Per-stage controls: invert, feather, grow/shrink, edge snap. Person masks are smoothed over time (EMA plus hysteresis). */
import * as G from './engine.js';
const {V,PR,mkProg,mkRT,freeRT,bindRT,samp,draw,SRC,VS,HEAD}=G;

/* ---------------- person matte (worker) ---------------- */
export const PERSON={
  worker:null,state:'idle',err:'',model:'selfie',backend:'',prog:0,bytes:0,mb:0,
  w:0,h:0,ema:null,hold:null,out:null,tex:null,ver:0,inflight:false,fps:0,ms:0,flicker:0,
  cap:384,quality:'balanced',synthetic:false,
  smooth:{on:true,a:.5,lo:.38,hi:.62,mix:.6}
};
/* Mask quality. The model itself sees a small image, so the lever is the capture size and the edge refinement against the real picture.
   Stills and exports always refine at the highest setting. */
export const QUAL={fast:{cap:256,q:0},balanced:{cap:384,q:1},max:{cap:512,q:2}};
export function setMaskQuality(k){if(!QUAL[k])return;PERSON.quality=k;PERSON.cap=QUAL[k].cap;try{localStorage.setItem('n0ise.maskq',k);}catch(e){}}
try{const k=localStorage.getItem('n0ise.maskq');if(QUAL[k])setMaskQuality(k);}catch(e){}
let _n=0,_t0=0,_sent=0;
export function startPerson(model){
  if(PERSON.worker&&PERSON.state!=='error'&&(!model||model===PERSON.model))return;
  if(PERSON.worker){PERSON.worker.terminate();PERSON.worker=null;}
  if(model)PERSON.model=model;PERSON.state='loading';PERSON.err='';PERSON.prog=0;
  const w=PERSON.worker=new Worker('seg.worker.js?v=1',{type:'module'});
  w.onmessage=e=>{
    const m=e.data;
    if(m.type==='progress'){PERSON.prog=m.p;PERSON.bytes=m.bytes;}
    else if(m.type==='ready'){PERSON.state='ready';PERSON.backend=m.backend;}
    else if(m.type==='error'){PERSON.state='error';PERSON.err=m.message;PERSON.inflight=false;}
    else if(m.type==='mask'){PERSON.inflight=false;ingest(m.data,m.w,m.h,performance.now());}
  };
  w.onerror=e=>{PERSON.state='error';PERSON.err=String(e.message||'worker failed');PERSON.inflight=false;};
  w.postMessage({type:'init',model:PERSON.model});
}
function ingest(raw,w,h,now){
  const n=w*h;
  if(PERSON.w!==w||PERSON.h!==h||!PERSON.ema){PERSON.w=w;PERSON.h=h;PERSON.ema=new Float32Array(n);PERSON.hold=new Uint8Array(n);PERSON.out=new Uint8Array(n);for(let i=0;i<n;i++)PERSON.ema[i]=raw[i]/255;}
  const S=PERSON.smooth,E=PERSON.ema,H=PERSON.hold,O=PERSON.out;let ch=0;
  for(let i=0;i<n;i++){
    const r=raw[i]/255;let v;
    if(S.on){
      const d=r-E[i],a=Math.min(1,S.a+Math.abs(d)*1.2);E[i]+=d*a;v=E[i];
      if(v>S.hi)H[i]=1;else if(v<S.lo)H[i]=0;                        // hysteresis: hair and fingers don't flicker in and out
      v=v*(1-S.mix)+H[i]*S.mix;v=v<.3?0:v>.7?1:(v-.3)/.4;v=v*v*(3-2*v);
    }else v=r;
    const b=Math.round(v*255);ch+=Math.abs(b-O[i]);O[i]=b;
  }
  PERSON.flicker+=((ch/n/255)-PERSON.flicker)*.2;
  const gl=G.gl;
  if(!PERSON.tex){PERSON.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,PERSON.tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
  gl.bindTexture(gl.TEXTURE_2D,PERSON.tex);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,w,h,0,gl.RED,gl.UNSIGNED_BYTE,O);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
  PERSON.ver++;PERSON.ms+=((now-_sent)-PERSON.ms)*.2;
  if(!_t0)_t0=now;_n++;if(now-_t0>1000){PERSON.fps=_n*1000/(now-_t0);_n=0;_t0=now;}
}
/* called once per rendered frame with the live source element; at most one frame is in flight */
export function feedPerson(){
  if(PERSON.synthetic||PERSON.state!=='ready'||PERSON.inflight)return;
  const el=SRC.el;if(!el)return;
  if(el instanceof HTMLVideoElement&&el.readyState<2)return;
  const src=(SRC.mirror&&SRC.mcv)?SRC.mcv:el;
  const [sw,sh]=G.srcDims(src);if(!sw||!sh)return;
  const k=PERSON.cap/Math.max(sw,sh),w=Math.max(16,Math.round(sw*k)),h=Math.max(16,Math.round(sh*k));
  PERSON.inflight=true;_sent=performance.now();
  createImageBitmap(src,{resizeWidth:w,resizeHeight:h,resizeQuality:'low'}).then(bm=>PERSON.worker.postMessage({type:'frame',bitmap:bm,ts:Math.round(performance.now())},[bm])).catch(()=>{PERSON.inflight=false;});
}
/* a stand-in matte (centred ellipse) for the effect bench and tests, no model needed */
export function syntheticPerson(on=true,phase=0){
  PERSON.synthetic=on;if(!on)return;
  const w=128,h=96,o=new Uint8Array(w*h),ox=.1*Math.sin(phase*.9);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=(x/w-.5-ox)/.26,dy=(y/h-.55)/.4,hd=((x/w-.5-ox)/.12)**2+((y/h-.22)/.14)**2;o[y*w+x]=(dx*dx+dy*dy<1||hd<1)?255:0;}
  PERSON.w=w;PERSON.h=h;PERSON.ema=null;ingest(o,w,h,performance.now());
}
let _blank=null;
function blankTex(){if(_blank)return _blank;const gl=G.gl;_blank=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,_blank);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([0]));gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);return _blank;}

/* ---------------- drawn mask ---------------- */
export const DRAWN={cv:document.createElement('canvas'),tex:null,dirty:true,on:false,size:.06,erase:false};
DRAWN.cv.width=256;DRAWN.cv.height=256;DRAWN.cv.getContext('2d').fillStyle='#000';DRAWN.cv.getContext('2d').fillRect(0,0,256,256);
export function paintDrawn(u,v){ // u,v in 0..1 screen space (top-left origin)
  const g=DRAWN.cv.getContext('2d');g.fillStyle=DRAWN.erase?'#000':'#fff';g.beginPath();g.arc(u*256,v*256,DRAWN.size*256,0,7);g.fill();DRAWN.dirty=true;
}
export function clearDrawn(v=0){const g=DRAWN.cv.getContext('2d');g.fillStyle=v?'#fff':'#000';g.fillRect(0,0,256,256);DRAWN.dirty=true;}
function drawnTex(){
  const gl=G.gl;
  if(!DRAWN.tex){DRAWN.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,DRAWN.tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);DRAWN.dirty=true;}
  if(DRAWN.dirty){gl.bindTexture(gl.TEXTURE_2D,DRAWN.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,DRAWN.cv);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);DRAWN.dirty=false;}
  return DRAWN.tex;
}

/* ---------------- mask passes ---------------- */
const F_SEL=HEAD+`uniform sampler2D uSrc,uPerson,uDrawn;uniform int uMode;uniform float uLo,uHi,uTol,uSrcAsp,uScrAsp;uniform vec3 uCol;
float L3(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){
  float r=uScrAsp/uSrcAsp;vec2 s=r>1.?vec2(1.,1./r):vec2(r,1.);vec2 suv=(vUv-.5)*s+.5;
  vec3 c=texture(uSrc,vUv).rgb;float m=1.;
  if(uMode==0)m=texture(uPerson,suv).r;
  else if(uMode==1){float l=L3(c);m=smoothstep(uLo-.03,uLo+.03,l)*(1.-smoothstep(uHi-.03,uHi+.03,l));}
  else if(uMode==2){float d=distance(c,uCol);m=1.-smoothstep(uTol*.7,uTol,d);}
  else if(uMode==3)m=texture(uDrawn,vUv).r;
  o=vec4(vec3(m),1.);}`;
const F_BLUR=HEAD+`uniform sampler2D uT;uniform vec2 uDir;uniform float uR;
void main(){float s=0.,w=0.;for(int i=-6;i<=6;i++){float x=float(i)/6.;float k=exp(-x*x*2.2);s+=texture(uT,vUv+uDir*x*uR).r*k;w+=k;}o=vec4(vec3(s/w),1.);}`;
const F_POST=HEAD+`uniform sampler2D uT,uSrc;uniform vec2 uTexel;uniform float uGrow,uSoft,uInv,uSnap,uQ;
float L3(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){
  float m=texture(uT,vUv).r;
  if(uSnap>.001){ // edge snap: joint bilateral on the photo itself, so the matte follows hair and fingers. Higher quality: wider, tighter, colour-aware.
    vec3 c0=texture(uSrc,vUv).rgb;float l0=L3(c0),s=0.,w=0.;int R=2+int(uQ+.5);float sp=2.-.35*uQ,tol=.08+.2*(1.-uSnap);
    for(int j=-4;j<=4;j++)for(int i=-4;i<=4;i++){if(abs(i)>R||abs(j)>R)continue;vec2 o2=vec2(float(i),float(j))*uTexel*sp;vec3 c=texture(uSrc,vUv+o2).rgb;
      float d=uQ>.5?length(c-c0)*.7:abs(L3(c)-l0);float k=exp(-pow(d/tol,2.));s+=texture(uT,vUv+o2).r*k;w+=k;}
    m=mix(m,s/w,uSnap);}
  float mid=.5-uGrow*.45,e=max(uSoft,.04);
  m=smoothstep(mid-e,mid+e,m);
  if(uInv>.5)m=1.-m;
  o=vec4(vec3(m),1.);}`;
let P_SEL,P_BLUR,P_POST;
const RTS={};
function rt(name,w,h){const r=RTS[name];if(r&&r.w===w&&r.h===h)return r;if(r)freeRT(r);return RTS[name]=mkRT(w,h,{});}
export function resetMatteGL(){Object.keys(RTS).forEach(k=>{try{freeRT(RTS[k]);}catch(e){}delete RTS[k];});P_SEL=P_BLUR=P_POST=null;PERSON.tex=null;DRAWN.tex=null;_blank=null;}
export const MASK_DEFAULTS={src:'person',invert:false,feather:20,grow:0,snap:35,lo:.5,hi:1,tol:.35,col:'#2fa84f'};
let cacheKey='',cacheTex=null,cacheFrame=-1;
/* Returns a texture (red channel = mask, 1 inside) in screen space for this stage. `base` is the stage's input colour. */
export function maskFor(mk,W,H,base,{reuse=true}={}){
  mk=mk||MASK_DEFAULTS;
  const gl=G.gl;P_SEL=P_SEL||mkProg(VS,F_SEL);P_BLUR=P_BLUR||mkProg(VS,F_BLUR);P_POST=P_POST||mkProg(VS,F_POST);
  const mode={person:0,luma:1,color:2,drawn:3}[mk.src]??4;
  const a=rt('a',W,H),b=rt('b',W,H),c=rt('c',W,H);
  gl.bindVertexArray(G.vaoEmpty);gl.disable(gl.BLEND);
  bindRT(a);const s=P_SEL;s.use();samp(s,'uSrc',0,base);
  samp(s,'uPerson',1,PERSON.tex||blankTex());samp(s,'uDrawn',2,drawnTex());
  s.i('uMode',mode);s.f('uLo',mk.lo);s.f('uHi',mk.hi);s.f('uTol',mk.tol);
  const cc=G.hexRGB(mk.col||'#2fa84f');s.v3('uCol',cc[0]/255,cc[1]/255,cc[2]/255);
  s.f('uSrcAsp',SRC.w/Math.max(1,SRC.h));s.f('uScrAsp',W/H);draw();
  const fr=Math.max(0,mk.feather||0)*W/1000;                              // feather in thousandths of the frame width
  let src=a;
  if(fr>.5){
    bindRT(b);P_BLUR.use();samp(P_BLUR,'uT',0,a.tex);P_BLUR.v2('uDir',1/W,0);P_BLUR.f('uR',fr);draw();
    bindRT(c);P_BLUR.use();samp(P_BLUR,'uT',0,b.tex);P_BLUR.v2('uDir',0,1/H);P_BLUR.f('uR',fr);draw();src=c;
  }
  const out=src===c?b:c;
  bindRT(out);const p=P_POST;p.use();samp(p,'uT',0,src.tex);samp(p,'uSrc',1,base);p.v2('uTexel',1/W,1/H);
  p.f('uQ',G.ST.clean?2:(QUAL[PERSON.quality]||QUAL.balanced).q);p.f('uGrow',(mk.grow||0)/100);p.f('uSoft',fr>.5?.12:.06);p.f('uInv',mk.invert?1:0);p.f('uSnap',mode===0?(mk.snap||0)/100:0);draw();
  gl.bindVertexArray(null);gl.useProgram(null);
  return out.tex;
}
