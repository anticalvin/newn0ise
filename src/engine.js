/* n0ise engine: shaders, parameters, profiles, palettes, GL pipeline and frame renderer.
   One copy, imported by index.html (the app) and studio.html (the 3D page). Generated once from the monolith, now edited here. */
export const V={sizeKey:'',pIdx:0,frameNo:0,lastBKey:'',fps:60,fpsAcc:0,fpsN:0,infoStr:'',lastT:0,lastRenderMs:0,errN:0,DEAD:false,HDR:false,palCache:{key:'',v:null},textKey:''};
export const hooks={AUD:{on:false},stopAudio(){},group(){},el(){},chipRow(){},snap(){},refreshUI(){},stepGif(){},audFrame(){}};
/* =====================================================================
   n0ise — shaders.  Pipeline: tone → quantize → glitch → signal A/B →
   CRT beam & phosphor → persistence → bloom → glass.
   ===================================================================== */
const VS=`#version 300 es
out vec2 vUv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;

const HEAD=`#version 300 es
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

/* ---------- 1. tone: crop, downsample, adjust ---------- */
const F_TONE=HEAD+`
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

/* ---------- 2. quantize (ordered / noise / halftone) ---------- */
const F_QUANT=HEAD+`
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

/* ---------- 3. glitch / waves / feedback / text ---------- */
const F_GLITCH=HEAD+`
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

/* ---------- 4a. composite signal encode → decode ---------- */
const F_SIGA=HEAD+`
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

/* ---------- 4b. chroma bleed, ringing, decode to RGB ---------- */
const F_SIGB=HEAD+`
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

/* ---------- 5. CRT: geometry, beam, phosphor mask ---------- */
const F_CRT=HEAD+`
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

/* ---------- 6. phosphor persistence + burn-in ---------- */
const F_PERSIST=HEAD+`
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

/* ---------- 7. bloom chain ---------- */
const F_BRIGHT=HEAD+`
uniform sampler2D uT;
void main(){vec3 c=texture(uT,vUv).rgb;o=vec4(c*smoothstep(.12,.85,lum(c)),1.);}`;
const F_COPY=HEAD+`
uniform sampler2D uT;
void main(){o=vec4(texture(uT,vUv).rgb,1.);}`;
const F_BLUR=HEAD+`
uniform sampler2D uT;uniform vec2 uDir;
void main(){
  vec3 c=texture(uT,vUv).rgb*.227027;
  c+=texture(uT,vUv+uDir*1.3846).rgb*.316216;c+=texture(uT,vUv-uDir*1.3846).rgb*.316216;
  c+=texture(uT,vUv+uDir*3.2308).rgb*.070270;c+=texture(uT,vUv-uDir*3.2308).rgb*.070270;
  o=vec4(c,1.);
}`;

/* ---------- 8. glass, bezel, final composite ---------- */
const F_FINAL=HEAD+`
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

/* ---------- original (compare) & paint ---------- */
const F_ORIG=HEAD+`
uniform sampler2D uSrc;uniform float uSrcAsp,uScrAsp;
void main(){
  float r=uScrAsp/uSrcAsp;vec2 s=r>1.?vec2(1.,1./r):vec2(r,1.);
  o=vec4(texture(uSrc,(vUv-.5)*s+.5).rgb,1.);
}`;
const VS_PAINT=`#version 300 es
in vec3 aP;
void main(){gl_Position=vec4(aP.xy,0.,1.);gl_PointSize=aP.z;}`;
const F_PAINT=`#version 300 es
precision highp float;
uniform vec3 uCol;out vec4 o;
void main(){vec2 d=gl_PointCoord-.5;float a=exp(-dot(d,d)*18.);o=vec4(uCol*a,0.);}`;
/* =====================================================================
   n0ise — parameters, profiles, palettes
   ===================================================================== */
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

const TABS=[['display','Display'],['bitmap','Bitmap'],['signal','Signal'],['beam','Beam'],['glass','Glass'],['glitch','Glitch'],['wave','Wave'],['lab','Lab']];
const CT=[];
const R=(tab,g,k,l,min,max,d,step=1)=>CT.push({t:'r',tab,g,k,l,min,max,d,step});
const C=(tab,g,k,l,opts,d)=>CT.push({t:'c',tab,g,k,l,opts,d});
const B=(tab,g,k,l,d)=>CT.push({t:'b',tab,g,k,l,d});

/* Display */
C('display','Screen','aspect','Aspect',[['src','Source'],['9:16','9:16'],['4:3','4:3'],['3:4','3:4'],['1:1','1:1'],['16:9','16:9']],'src');
C('display','Screen','quality','Render quality',[['0.5','Draft'],['0.8','Normal'],['1.15','High']],'0.8');
C('display','Screen','fcap','Frame rate',[['0','Smooth'],['30','Save battery']],'0');
R('display','Chain macros','mWear','Wear',0,100,0);
R('display','Chain macros','mAge','Age',0,100,0);
R('display','Chain macros','mBand','Bandwidth loss',0,100,0);
R('display','Chain macros','mInst','Instability',0,100,0);
R('display','Hardware identity','seed','Hardware seed',0,999,7);

/* Bitmap */
C('bitmap','Dither','method','Method',[['off','Off'],['thr','Threshold'],['b4','Bayer 4'],['b8','Bayer 8'],['blue','Blue noise'],['white','White noise'],['half','Halftone'],['atk','Atkinson'],['fs','Floyd–Steinberg'],['jjn','Jarvis'],['stucki','Stucki'],['sierra','Sierra'],['burkes','Burkes']],'atk');
R('bitmap','Dither','px','Pixel size',1,16,3);
R('bitmap','Dither','dstr','Dither strength',0,150,100);
R('bitmap','Dither','tbias','Threshold bias',-50,50,0);
B('bitmap','Dither','anim','Animate pattern',false);
R('bitmap','Palette','depth','Color depth',2,8,4);
R('bitmap','Palette','cycle','Palette cycling',-12,12,0);
R('bitmap','Tone','bright','Brightness',-100,100,0);
R('bitmap','Tone','contrast','Contrast',-100,100,0);
R('bitmap','Tone','mid','Midtones',-100,100,0);
R('bitmap','Tone','high','Highlights',-100,100,0);
R('bitmap','Tone','sat','Saturation',-100,100,0);
R('bitmap','Tone','hue','Hue',-180,180,0);
R('bitmap','Tone','blur','Blur',0,10,0);
R('bitmap','Tone','sharp','Sharpen',0,10,0);
R('bitmap','Tone','edge','Vector edges',0,100,0);
B('bitmap','Tone','invert','Invert',false);

/* Signal */
C('signal','Format','std','Standard',[['0','NTSC'],['1','PAL']],'0');
R('signal','Format','lines','Scanlines',100,576,240);
R('signal','Format','lbw','Luma softness',0,100,25);
R('signal','Format','cbw','Chroma bleed',0,100,30);
R('signal','Format','ycs','Y/C separation',0,100,70);
R('signal','Format','cper','Dot crawl size',2,10,4,.5);
C('signal','Format','cmode','Color mode',[['0','Composite NTSC'],['1','S-Video'],['2','RGB']],'0');
R('signal','Format','csat','Chroma saturation',0,300,100);
R('signal','Format','pop','Color pops',0,100,0);
R('signal','Format','phs','Phase error',-180,180,0);
R('signal','Format','ring','Edge ringing',0,100,0);
R('signal','Noise','snr','Noise',0,100,8);
R('signal','Noise','coh','Living static',0,100,30);
R('signal','Noise','snow','Tape snow',0,100,0);
R('signal','Noise','ghost','Ghost echo',0,100,0);
R('signal','Noise','gdel','Echo delay',1,80,20);
R('signal','Noise','rgho','Ring ghost',0,100,0);
R('signal','Noise','gspr','Ghost spread',1,40,6);
R('signal','Noise','gdec','Ghost decay',10,95,60);
R('signal','Sync','jit','Time-base jitter',0,100,5);
R('signal','Sync','drift','Sync drift',0,100,0);
R('signal','Sync','trk','Tracking error',0,100,0);
R('signal','Sync','tjit','Tracking jitter',0,100,0);
R('signal','Sync','hsw','Head switching',0,100,0);
R('signal','Sync','drop','Dropouts',0,100,0);
R('signal','Sync','vhold','Vertical hold',0,100,0);
R('signal','Sync','clip','Overdrive clipping',0,100,0);
R('signal','Sync','gen','Generation loss',0,100,0);
R('signal','Sync','weather','Signal weather',0,100,0);

/* Beam & phosphor */
R('beam','Scan','scan','Scanline depth',0,100,55);
R('beam','Scan','beam','Beam size',0,100,40);
R('beam','Scan','bloomb','Beam blooming',0,100,40);
R('beam','Scan','spot','Spot softness',0,100,30);
R('beam','Scan','efoc','Edge defocus',0,100,20);
C('beam','Scan','iface','Scanning',[['0','Progressive'],['1','Interlaced']],'0');
R('beam','Scan','iflk','Field flicker',0,100,50);
C('beam','Phosphor','mask','Mask',[['0','None'],['1','Aperture grille'],['2','Shadow mask'],['3','Slot mask']],'1');
R('beam','Phosphor','mstr','Mask strength',0,100,55);
R('beam','Phosphor','ptint','Phosphor tint hue',-180,180,0);
R('beam','Phosphor','ptamt','Phosphor tint amount',0,100,0);
R('beam','Phosphor','mpitch','Mask scale',2,8,3,.25);
R('beam','Phosphor','msoft','Mask softness',0,100,50);
R('beam','Phosphor','mgap','Mask gap',0,100,20);
C('beam','Phosphor','phos','Phosphor',[['0','RGB'],['1','P1 green'],['2','P3 amber'],['3','P4 white'],['4','P11 blue']],'0');
R('beam','Phosphor','dr','Decay red (ms)',0,1500,35,5);
R('beam','Phosphor','dg','Decay green (ms)',0,1500,35,5);
R('beam','Phosphor','db','Decay blue (ms)',0,1500,35,5);
R('beam','Phosphor','after','Afterglow',0,100,60);
R('beam','Phosphor','fblend','Frame blend',0,95,0);
R('beam','Phosphor','burn','Burn-in',0,100,0);
R('beam','Electronics','blkl','Black level',0,50,4);
R('beam','Electronics','gam','Gamma',60,180,100);
R('beam','Electronics','ccon','Analog contrast',50,200,100);
R('beam','Electronics','cbri','Analog brightness',-50,50,0);
R('beam','Electronics','temp','White point',-100,100,0);
R('beam','Electronics','gr','Gain red',50,150,100);
R('beam','Electronics','gg','Gain green',50,150,100);
R('beam','Electronics','gb','Gain blue',50,150,100);
R('beam','Electronics','sati','Saturation drift',0,100,0);
R('beam','Geometry','curv','Curvature',-50,100,25);
R('beam','Geometry','corner','Corner radius',0,100,25);
R('beam','Geometry','over','Overscan',0,20,3);
R('beam','Geometry','convs','Misconvergence',0,100,10);
R('beam','Geometry','conve','Edge convergence',0,100,20);
R('beam','Geometry','cdrift','Circuit drift',0,100,0);
R('beam','Geometry','aging','Hardware aging',0,100,20);

/* Glass */
R('glass','Light','bloom','Bloom',0,100,35);
R('glass','Light','brad','Bloom radius',0,100,50);
R('glass','Light','hal','Halation',0,100,25);
R('glass','Light','diff','Diffusion',0,100,10);
R('glass','Reflections','refl','Reflection',0,100,20);
R('glass','Reflections','ar','Anti-reflective coat',0,100,40);
R('glass','Reflections','glare','Glare',0,100,15);
R('glass','Reflections','room','Room light',0,100,30);
R('glass','Reflections','para','Parallax',0,100,30);
R('glass','Surface','tint','Glass tint',0,100,10);
R('glass','Surface','dust','Dust',0,100,0);
R('glass','Surface','scr','Scratches',0,100,0);
R('glass','Surface','smud','Smudges',0,100,0);
R('glass','Surface','micro','Surface grain',0,100,10);
R('glass','Cabinet','vig','Edge falloff',0,100,35);
R('glass','Cabinet','bez','Bezel',0,12,0);
R('glass','Cabinet','bsh','Bezel shadow',0,100,50);

/* Glitch */
R('glitch','Master','gamt','Intensity',0,100,100);
R('glitch','Master','grate','Event rate',0,100,40);
B('glitch','Master','gfreeze','Freeze glitch',false);
R('glitch','Corruption','rgbs','RGB split',0,100,0);
R('glitch','Corruption','tear','Tearing',0,100,0);
R('glitch','Corruption','sline','Scanline shift',0,100,0);
R('glitch','Corruption','gblock','Block corruption',0,100,0);
R('glitch','Corruption','drag','Pixel drag',0,100,0);
R('glitch','Corruption','band','Color bands',0,100,0);
R('glitch','Corruption','ginv','Channel invert',0,100,0);
R('glitch','Corruption','burst','Noise bursts',0,100,0);
R('glitch','Corruption','crush','Compression crush',0,100,0);

/* Wave */
C('wave','Oscillator','wshape','Shape',[['0','Sine'],['1','Triangle'],['2','Square'],['3','Sawtooth']],'0');
C('wave','Oscillator','waxis','Axis',[['0','Horizontal'],['1','Vertical'],['2','Both']],'0');
R('wave','Oscillator','wamp','Amplitude',0,100,0);
R('wave','Oscillator','wfreq','Frequency',1,60,8);
R('wave','Oscillator','wspd','Speed',-100,100,20);
R('wave','Modulation','wfm','Frequency mod',0,100,0);
R('wave','Modulation','wfmr','FM rate',1,40,3);
R('wave','Modulation','wam','Amplitude mod',0,100,0);
R('wave','Modulation','wamr','AM rate',1,40,2);
R('wave','Modulation','wph','Phase distortion',0,100,0);
R('wave','Second oscillator','w2','Blend',0,100,0);
R('wave','Second oscillator','w2f','Frequency',1,60,21);
R('wave','Scope','scope','Oscilloscope trace',0,100,0);

/* Lab */
R('lab','Analog feedback','fbg','Feedback',0,100,0);
R('lab','Analog feedback','fbz','Zoom',-20,20,2);
R('lab','Analog feedback','fbr','Rotate',-30,30,1);
R('lab','Analog feedback','fbx','Shift X',-20,20,0);
R('lab','Analog feedback','fby','Shift Y',-20,20,0);
R('lab','Analog feedback','fbh','Hue shift',-90,90,5);
B('lab','Terminal text','ton','Show text',false);
R('lab','Terminal text','tsz','Size',3,30,8);
R('lab','Terminal text','ty','Position',0,100,12);
B('lab','Terminal text','tcur','Blinking cursor',true);
C('lab','Display autopsy','solo','One effect at a time',[['all','All'],['bit','Dither'],['g','Glitch'],['s','Signal'],['b','Beam'],['m','Mask'],['l','Bloom'],['gl','Glass']],'all');

const CTL={};CT.forEach(c=>CTL[c.k]=c);

/* ---------- palettes ---------- */
const PALS=[
  {id:'ice',name:'Ice',c:['#000308','#0b3d4d','#6ee7ff','#f2ffff']},
  {id:'mono',name:'Mono',c:['#000000','#ffffff']},
  {id:'blood',name:'Blood',c:['#000000','#383838','#ff1a1a','#ffffff']},
  {id:'phosphor',name:'Green terminal',c:['#020a04','#0c3d1a','#2fe36a','#c9ffd9']},
  {id:'amber',name:'Amber',c:['#0d0600','#5a2b00','#ff9a1f','#ffe2a8']},
  {id:'gameboy',name:'Handheld',c:['#0f380f','#306230','#8bac0f','#9bbc0f']},
  {id:'cga',name:'CGA',c:['#000000','#55ffff','#ff55ff','#ffffff']},
  {id:'vboy',name:'Virtual red',c:['#000000','#3a0000','#a00000','#ff2a2a']},
  {id:'sky',name:'Sky',c:['#0a1a8c','#3a6cff','#9fd8c8','#f6e7c1']},
  {id:'vapor',name:'Vapor',c:['#0b0630','#4b2bd6','#ff5fb0','#ffe9a8']},
  {id:'paper',name:'Parchment',c:['#2b1d12','#8a5a3a','#e8dcc0']},
  {id:'c64',name:'Home computer',c:['#000000','#ffffff','#880000','#aaffee','#cc44cc','#00cc55','#0000aa','#eeee77','#dd8855','#664400','#ff7777','#333333','#777777','#aaff66','#0088ff','#bbbbbb']},
  {id:'pico',name:'Arcade 16',c:['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#fff1e8','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa']},
  {id:'custom',name:'Custom',c:null},
  {id:'src',name:'Original color',c:null}
];
const hexRGB=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lum255=c=>.299*c[0]+.587*c[1]+.114*c[2];
const rgbHex=c=>'#'+c.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');

/* ---------- hardware profiles ---------- */
const PROFILES=[
  ['none','None',{lines:576,lbw:0,cbw:0,ycs:100,csat:100,phs:0,ring:0,snr:0,coh:0,snow:0,ghost:0,jit:0,drift:0,trk:0,hsw:0,drop:0,vhold:0,clip:0,gen:0,weather:0,scan:0,beam:0,bloomb:0,spot:0,efoc:0,mask:'0',mstr:0,after:0,fblend:0,burn:0,blkl:0,sati:0,curv:0,corner:0,over:0,convs:0,conve:0,cdrift:0,aging:0,bloom:0,hal:0,diff:0,refl:0,glare:0,room:0,para:0,tint:0,dust:0,scr:0,smud:0,micro:0,vig:0,bez:0,gamt:0,wamp:0,w2:0,scope:0,fbg:0,ton:false,pal:'src',method:'off'}],
  ['studio','Studio CRT',{}],
  ['tv70','70s black & white',{phos:'3',cbw:0,csat:0,lines:200,lbw:55,snr:22,coh:40,curv:55,corner:50,spot:60,efoc:50,mask:'0',mstr:0,scan:35,beam:60,jit:12,drift:6,aging:50,bloom:50,after:40,dr:60,dg:60,db:60,vig:55,refl:30,glare:30,bez:6,bsh:60,iface:'1',iflk:40,pal:'mono',method:'thr'}],
  ['tv80','80s color TV',{lines:240,lbw:35,cbw:55,ycs:35,cper:4,mask:'2',mstr:60,mpitch:3,curv:40,corner:40,snr:12,coh:35,jit:8,drift:4,spot:45,efoc:35,scan:45,bloom:40,hal:30,refl:25,bez:5,bsh:50,aging:35,iface:'1',iflk:30,ghost:6}],
  ['mon90','90s monitor',{lines:480,lbw:8,cbw:8,ycs:100,mask:'1',mstr:50,mpitch:3,curv:10,corner:15,snr:2,scan:25,beam:30,spot:15,efoc:20,bloom:25,hal:15,refl:20,ar:60,bez:4,bsh:40}],
  ['bcast','Broadcast reference',{lines:480,lbw:5,cbw:6,ycs:100,csat:100,mask:'1',mstr:35,curv:0,corner:8,snr:0,jit:0,scan:30,beam:25,spot:10,efoc:5,bloom:15,hal:8,refl:10,ar:80,vig:15,aging:0,convs:0,conve:0,bez:3}],
  ['arcade','Arcade cabinet',{lines:240,lbw:20,cbw:25,mask:'3',mstr:70,mpitch:4,curv:30,corner:30,scan:70,beam:35,bloomb:60,bloom:55,hal:35,refl:30,glare:25,vig:40,csat:130,snr:6,bez:6,bsh:60,temp:10}],
  ['amber','Amber terminal',{phos:'2',pal:'mono',lines:240,cbw:0,csat:0,mask:'0',mstr:0,scan:60,beam:50,bloom:60,hal:40,dr:120,dg:120,db:120,after:70,burn:40,curv:35,corner:35,snr:6,coh:30,lbw:30,spot:40,vig:45,refl:25,ton:true,txt:'AMBER TERMINAL\n> LOGIN: GUEST\n> '}],
  ['green','Green terminal',{phos:'1',pal:'mono',lines:240,cbw:0,csat:0,mask:'0',mstr:0,scan:60,beam:50,bloom:60,hal:40,dr:220,dg:220,db:220,after:75,burn:50,curv:35,corner:35,snr:6,coh:30,lbw:30,spot:40,vig:45,refl:25,ton:true,txt:'SYSTEM READY\n> RUN N0ISE\n> '}],
  ['portable','Portable TV',{lines:200,lbw:50,cbw:70,ycs:30,snr:25,coh:45,curv:70,corner:60,spot:70,efoc:60,mask:'2',mstr:30,mpitch:4,scan:30,vig:55,jit:15,drift:8,ghost:12,aging:60,bez:8,bsh:70,refl:35,glare:35}],
  ['security','Security monitor',{phos:'3',pal:'mono',method:'thr',lines:200,cbw:0,csat:0,lbw:45,snr:30,coh:55,snow:8,jit:25,drift:12,hsw:25,drop:20,trk:15,curv:20,mstr:0,mask:'0',scan:55,bloom:40,vig:50,aging:60,ton:true,txt:'CAM 02  {t}\nREC',tsz:5,ty:7,tcur:false}],
  ['vhs','VHS playback',{lines:240,lbw:60,cbw:70,ycs:25,cper:3.5,ring:40,snr:28,coh:60,snow:6,ghost:15,gdel:25,jit:35,drift:20,trk:35,hsw:60,drop:30,vhold:5,gen:35,csat:85,phs:6,mstr:35,curv:25,corner:30,scan:40,bloom:40,hal:30,aging:50,iface:'1'}],
  ['camcorder','Camcorder viewfinder',{lines:240,lbw:35,cbw:45,snr:14,curv:30,corner:50,spot:45,vig:60,bez:10,bsh:70,mstr:25,ton:true,txt:'● REC  {t}',tsz:5,ty:7,tcur:false}],
  ['rgbgame','RGB game monitor',{lines:240,lbw:8,cbw:8,ycs:100,mask:'1',mstr:60,mpitch:3,curv:15,corner:20,scan:65,beam:30,bloom:40,hal:20,csat:120}],
  ['vector','Vector arcade',{phos:'1',pal:'mono',method:'off',edge:100,lines:480,lbw:10,mask:'0',mstr:0,scan:0,beam:10,bloom:90,brad:70,hal:40,dr:400,dg:400,db:400,after:85,curv:30,corner:30,snr:2,cbw:0,csat:0,bright:20,contrast:30}],
  ['scope','Oscilloscope',{phos:'4',pal:'mono',method:'off',edge:60,wamp:30,wfreq:6,wspd:40,scope:80,lines:480,mask:'0',mstr:0,scan:10,beam:10,bloom:80,brad:60,hal:30,dr:300,dg:300,db:300,after:80,cbw:0,csat:0,snr:2,curv:20,corner:25,bright:10}],
  ['handheld','Handheld LCD',{pal:'gameboy',method:'b4',px:4,lines:144,lbw:0,cbw:0,csat:0,mask:'2',mstr:35,mpitch:2,mgap:45,msoft:10,scan:0,beam:0,curv:0,corner:10,spot:0,efoc:0,fblend:40,after:0,vig:15,bez:8,bsh:60,refl:12,blkl:0,snr:0,jit:0,bloom:0,hal:0,dr:0,dg:0,db:0}],
  ['nvg','Night vision',{phos:'1',pal:'phosphor',method:'off',lines:300,cbw:0,csat:0,mask:'0',mstr:0,snr:65,coh:70,snow:8,bloom:90,brad:40,hal:55,vig:95,curv:0,corner:100,scan:10,jit:6,bright:25,contrast:35,fbg:12,fbz:1,fbr:0,fbh:0,burst:0,ton:true,txt:'NVG  GAIN AUTO  IR ON\n{t}',tsz:5,ty:7,tcur:false}],
  ['thermal','Thermal camera',{pal:'custom',custom:['#05001a','#4b0a8c','#d4145a','#ff8c1a','#fff6a8'],method:'off',blur:2,lines:120,lbw:70,cbw:0,csat:0,mask:'0',mstr:0,snr:6,coh:30,bloom:45,hal:30,vig:25,curv:0,corner:20,scan:8,spot:60,contrast:20,ton:true,txt:'THERMAL  MAX 41.2C\nMIN 19.8C',tsz:5,ty:7,tcur:false}],
  ['radar','Radar sweep',{phos:'1',pal:'mono',method:'off',edge:50,lines:480,cbw:0,csat:0,mask:'0',mstr:0,scan:20,beam:15,bloom:85,brad:60,hal:35,after:96,dr:700,dg:700,db:700,fbg:72,fbz:0,fbr:4,fbh:0,scope:60,wspd:30,wfreq:5,curv:20,corner:100,vig:60,snr:3,bright:10,contrast:30}],
  ['teletext','Teletext',{pal:'cga',method:'thr',px:6,lines:240,lbw:0,cbw:0,ycs:100,mask:'0',mstr:0,curv:0,corner:10,scan:0,snr:0,bloom:15,aging:0,contrast:30,ton:true,txt:'P100  CEEFAX\nNEWS  WEATHER  SPORT\n101 102 103\n> ',tsz:11,ty:14,tcur:true}],
  ['dashcam','Dashcam',{lines:480,lbw:15,cbw:20,snr:12,coh:30,jit:8,hsw:12,gen:15,temp:-35,csat:85,ccon:115,blkl:8,mask:'0',mstr:0,scan:10,curv:0,corner:8,vig:45,glare:45,refl:35,room:50,ton:true,txt:'DASHCAM  {t}\n72 KM/H',tsz:5,ty:92,tcur:false}],
  ['cursed','Cursed broadcast',{lines:240,cbw:65,snr:30,coh:55,jit:30,drift:20,trk:30,drop:25,rgbs:35,tear:20,gblock:12,band:30,wamp:28,wfreq:6,wfm:55,wfmr:3,wph:45,w2:35,fbg:38,fbz:2,fbr:3,fbh:35,hue:0,mask:'2',mstr:55,aging:60,bloom:50,gen:20,ghost:15,curv:35,corner:35}],
  ['limecomp','Lime composite',{pal:'gameboy',method:'b4',px:3,lines:200,lbw:25,cbw:55,ycs:20,cper:3,csat:220,pop:60,rgho:55,gspr:5,gdec:70,gdel:18,ring:35,mask:'2',mstr:45,mpitch:3,convs:30,curv:20,corner:25,scan:35,snr:10,coh:40,tjit:20,trk:8}],
  ['damaged','Damaged CRT',{convs:70,conve:70,curv:45,corner:50,snr:30,coh:50,snow:10,jit:30,drift:25,trk:25,drop:25,vhold:15,rgbs:20,tear:15,gblock:10,burn:60,dust:50,scr:40,smud:50,sati:50,cdrift:60,aging:100,clip:25}],
  ['aging','Unstable old TV',{cdrift:80,aging:90,jit:20,drift:30,vhold:20,sati:60,convs:40,conve:50,burn:50,snr:20,dust:40,smud:40,refl:30,temp:20,gen:10}]
];

/* ---------- state ---------- */
const BASE={pal:'src',custom:['#000000','#ff3d6e','#3df5ff','#ffffff'],txt:'n0ise\n> signal acquired\n> ',profile:'studio'};
CT.forEach(c=>BASE[c.k]=c.d);
BASE.stg=['clean','live','direct','studio'];
const P=JSON.parse(JSON.stringify(BASE));
const PROTECT=new Set(['aspect','quality','fcap','seed','method','px','dstr','tbias','anim','depth','cycle','bright','contrast','mid','high','sat','hue','blur','sharp','edge','invert','pal','custom','profile']);
const E={};

const MODS=[0,1,2].map(()=>({target:'',shape:'sine',rate:.4,depth:40}));

const LOOKKEYS=['method','edge','px','blur','bright','contrast','sharp'];
function applyProfile(id,quiet){
  const pr=PROFILES.find(p=>p[0]===id);if(!pr)return;
  CT.forEach(c=>{if(!PROTECT.has(c.k)||LOOKKEYS.includes(c.k))P[c.k]=c.d;});
  P.txt=BASE.txt;P.pal=BASE.pal;P.custom=BASE.custom.slice();P.solo='all';
  Object.assign(P,pr[2]);
  P.profile=id;
}

/* deterministic hardware fingerprint */
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let _hw={s:-1,v:null};
function hardware(seed){
  if(_hw.s===seed)return _hw.v;
  const r=mulberry(seed*7919+13);
  _hw.s=seed;return _hw.v={conv:[r()*2-1,r()*2-1,r()*2-1],gain:[1+(r()-.5)*.1,1+(r()-.5)*.1,1+(r()-.5)*.1],geo:[r()*2-1,r()*2-1]};
}
/* =====================================================================
   n0ise — GL engine & render pipeline
   ===================================================================== */
let canvas=null,stage=null,gl=null,GLOK=false,_ro=null;
const noGL=msg=>{const e=$('#err');if(e){e.hidden=false;e.textContent=msg;}else console.error(msg);};
/* the page (or the 3D page) hands in its context; the engine never reaches into a page by id */
function createGL(c){return c.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});}
function attachGL(c,s,g){
  canvas=c;stage=s;gl=g;GLOK=!!g;
  if(!g)noGL('This browser can’t run WebGL 2, which n0ise needs. Try a recent Safari, Chrome or Firefox.');
  if(s&&!_ro&&typeof ResizeObserver!=='undefined'){_ro=new ResizeObserver(es=>{const r=es[0].contentRect;SZ.w=r.width;SZ.h=r.height;});_ro.observe(s);}
}
let vaoEmpty,vaoPaint,paintBuf;
const PR={};
function compile(type,src){
  const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){throw new Error(gl.getShaderInfoLog(s)+'\n'+src.split('\n').map((l,i)=>(i+1)+': '+l).join('\n').slice(0,4000));}
  return s;
}
function mkProg(vs,fs){
  const p=gl.createProgram();
  gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  return wrapProg(p);
}
/* background compile (KHR_parallel_shader_compile): returns {poll()->null|'ok'|'err', prog, err}. Falls back to a sync compile. */
function mkProgAsync(vs,fs){
  const ext=gl.getExtension('KHR_parallel_shader_compile'),h={prog:null,err:null};
  if(!ext){try{h.prog=mkProg(vs,fs);}catch(e){h.err=String(e.message).split('\n')[0];}h.poll=h.force=()=>h.err?'err':'ok';return h;}
  const p=gl.createProgram(),sh=[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]].map(([ty,s])=>{const x=gl.createShader(ty);gl.shaderSource(x,s);gl.compileShader(x);gl.attachShader(p,x);return x;});
  gl.linkProgram(p);
  h.force=()=>{if(!h.prog&&!h.err){gl.getProgramParameter(p,gl.LINK_STATUS);}return h.poll();};
  h.poll=()=>{
    if(h.prog)return 'ok';if(h.err)return 'err';
    if(!gl.getProgramParameter(p,ext.COMPLETION_STATUS_KHR))return null;
    if(gl.getProgramParameter(p,gl.LINK_STATUS)){h.prog=wrapProg(p);return 'ok';}
    h.err=(sh.map(x=>gl.getShaderInfoLog(x)).join(' ')||gl.getProgramInfoLog(p)||'compile failed').split('\n').filter(Boolean).slice(0,2).join(' | ');return 'err';};
  return h;
}
function wrapProg(p){
  const o={p,loc:{}};
  o.l=n=>{let l=o.loc[n];if(l===undefined){l=gl.getUniformLocation(p,n);o.loc[n]=l;}return l;};
  o.f=(n,v)=>{const l=o.l(n);if(l!==null)gl.uniform1f(l,v);};
  o.i=(n,v)=>{const l=o.l(n);if(l!==null)gl.uniform1i(l,v);};
  o.v2=(n,a,b)=>{const l=o.l(n);if(l!==null)gl.uniform2f(l,a,b);};
  o.v3=(n,a,b,c)=>{const l=o.l(n);if(l!==null)gl.uniform3f(l,a,b,c);};
  o.v4=(n,a,b,c,d)=>{const l=o.l(n);if(l!==null)gl.uniform4f(l,a,b,c,d);};
  o.v2v=(n,arr)=>{const l=o.l(n);if(l!==null)gl.uniform2fv(l,arr);};
  o.fv=(n,arr)=>{const l=o.l(n);if(l!==null)gl.uniform1fv(l,arr);};
  o.v3v=(n,arr)=>{const l=o.l(n);if(l!==null)gl.uniform3fv(l,arr);};
  o.use=()=>gl.useProgram(p);
  return o;
}
function initGL(){
  PR.tone=mkProg(VS,F_TONE);PR.quant=mkProg(VS,F_QUANT);PR.glitch=mkProg(VS,F_GLITCH);
  PR.sigA=mkProg(VS,F_SIGA);PR.sigB=mkProg(VS,F_SIGB);PR.crt=mkProg(VS,F_CRT);
  PR.persist=mkProg(VS,F_PERSIST);PR.bright=mkProg(VS,F_BRIGHT);PR.copy=mkProg(VS,F_COPY);
  PR.blur=mkProg(VS,F_BLUR);PR.final=mkProg(VS,F_FINAL);PR.orig=mkProg(VS,F_ORIG);
  PR.paint=mkProg(VS_PAINT,F_PAINT);
  vaoEmpty=gl.createVertexArray();
  vaoPaint=gl.createVertexArray();paintBuf=gl.createBuffer();
  gl.bindVertexArray(vaoPaint);gl.bindBuffer(gl.ARRAY_BUFFER,paintBuf);
  const loc=gl.getAttribLocation(PR.paint.p,'aP');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);
  gl.bindVertexArray(vaoEmpty);
  V.HDR=!!(gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float'));
}

/* ---------- textures & targets ---------- */
function mkTex(w,h,{hdr=false,filter=gl.LINEAR,wrap=gl.CLAMP_TO_EDGE}={}){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  if(hdr)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);
  else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);
  return t;
}
function mkRT(w,h,opts={}){
  w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
  let hdr=!!(opts.hdr&&V.HDR);
  for(let attempt=0;attempt<2;attempt++){
    const tex=mkTex(w,h,{...opts,hdr});
    const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE)return{tex,fbo,w,h,hdr};
    gl.deleteFramebuffer(fbo);gl.deleteTexture(tex);
    if(!hdr)break;
    hdr=false;V.HDR=false;
  }
  throw new Error('Framebuffer incomplete');
}
function freeRT(r){if(!r)return;gl.deleteFramebuffer(r.fbo);gl.deleteTexture(r.tex);}
function bindRT(r){
  if(r){gl.bindFramebuffer(gl.FRAMEBUFFER,r.fbo);gl.viewport(0,0,r.w,r.h);}
  else{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);}
}
function tex(unit,t){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);}
function samp(prog,name,unit,t){tex(unit,t);prog.i(name,unit);}
function draw(){gl.drawArrays(gl.TRIANGLES,0,3);}

/* ---------- static lookup textures ---------- */
function bayer(n){
  if(n===1)return[0];
  const m=bayer(n/2),h=n/2,o=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)o[y*n+x]=4*m[(y%h)*h+(x%h)]+[[0,2],[3,1]][y>=h?1:0][x>=h?1:0];
  return o;
}
function r8tex(w,h,data,wrap){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,w,h,0,gl.RED,gl.UNSIGNED_BYTE,data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
  for(const p of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);
  return t;
}
function blueNoise(n){
  const r=mulberry(4242),a=new Float32Array(n*n);
  for(let i=0;i<a.length;i++)a[i]=r();
  const bl=new Float32Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let s=0,w=0;
    for(let j=-3;j<=3;j++)for(let i=-3;i<=3;i++){
      const g=Math.exp(-(i*i+j*j)/3.2);
      s+=g*a[((y+j+n)%n)*n+((x+i+n)%n)];w+=g;
    }
    bl[y*n+x]=a[y*n+x]-s/w;
  }
  const idx=Array.from(bl.keys()).sort((p,q)=>bl[p]-bl[q]);
  const out=new Uint8Array(n*n);
  idx.forEach((p,rank)=>{out[p]=Math.round(rank/(n*n-1)*255);});
  return out;
}
let TEX={};
function initLUT(){
  TEX.bay4=r8tex(4,4,new Uint8Array(bayer(4).map(v=>Math.round((v+.5)/16*255))),gl.REPEAT);
  TEX.bay8=r8tex(8,8,new Uint8Array(bayer(8).map(v=>Math.round((v+.5)/64*255))),gl.REPEAT);
  TEX.blue=r8tex(64,64,blueNoise(64),gl.REPEAT);
  TEX.src=mkTex(2,2);TEX.text=mkTex(2,2);
  gl.bindTexture(gl.TEXTURE_2D,TEX.text);
}

/* ---------- source ---------- */
const SRC={el:null,kind:'canvas',w:2,h:2,ver:0,live:false,name:'Demo'};
function srcDims(el){return el instanceof HTMLVideoElement?[el.videoWidth,el.videoHeight]:el instanceof HTMLImageElement?[el.naturalWidth,el.naturalHeight]:[el.width,el.height];}
function uploadSrc(){
  const el=SRC.el;if(!el)return;
  const [w,h]=srcDims(el);if(!w||!h)return;
  gl.bindTexture(gl.TEXTURE_2D,TEX.src);
  let up=el;
  if(SRC.mirror&&el instanceof HTMLVideoElement){const mc=SRC.mcv||(SRC.mcv=document.createElement('canvas'));if(mc.width!==w||mc.height!==h){mc.width=w;mc.height=h;}const g=mc.getContext('2d');g.setTransform(-1,0,0,1,w,0);g.drawImage(el,0,0,w,h);up=mc;}
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,up);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  SRC.w=w;SRC.h=h;
}
function setSource(el,name,live){
  if(SRC.el instanceof HTMLVideoElement&&SRC.el!==el){try{SRC.el.pause();const s=SRC.el.srcObject;if(s)s.getTracks().forEach(t=>t.stop());}catch(e){}}
  if(SRC.gif&&SRC.el!==el)SRC.gif=null;
  if(hooks.AUD.on&&el!==hooks.AUD.cv)hooks.stopAudio();
  SRC.el=el;SRC.name=name;SRC.live=!!live;SRC.ver++;SRC.mirror=false;SRC.viz=false;
  if(!(el instanceof HTMLVideoElement||el instanceof HTMLImageElement))uploadSrc();
}
function fitCanvas(img,w0,h0,maxL=2048){
  const k=Math.min(1,maxL/Math.max(w0,h0)),c=document.createElement('canvas');
  c.width=Math.max(2,Math.round(w0*k));c.height=Math.max(2,Math.round(h0*k));
  const g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(img,0,0,c.width,c.height);return c;
}
function demoCanvas(){
  const c=document.createElement('canvas');c.width=900;c.height=1100;const g=c.getContext('2d');
  let f=g.createLinearGradient(0,0,0,1100);f.addColorStop(0,'#1d1d1d');f.addColorStop(1,'#030303');
  g.fillStyle=f;g.fillRect(0,0,900,1100);
  f=g.createRadialGradient(450,520,40,450,520,560);f.addColorStop(0,'rgba(255,255,255,.38)');f.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=f;g.fillRect(0,0,900,1100);
  const ring=(a0,a1)=>{
    g.save();g.translate(450,550);g.rotate(-.34);
    g.lineWidth=30;g.strokeStyle='rgba(235,235,235,.9)';g.beginPath();g.ellipse(0,0,455,118,0,a0,a1);g.stroke();
    g.lineWidth=8;g.strokeStyle='rgba(255,255,255,.55)';g.beginPath();g.ellipse(0,0,395,96,0,a0,a1);g.stroke();
    g.restore();
  };
  ring(Math.PI,Math.PI*2);
  f=g.createRadialGradient(350,400,20,450,520,300);
  [[0,'#fff'],[.25,'#dcdcdc'],[.6,'#707070'],[.9,'#1b1b1b'],[1,'#0b0b0b']].forEach(s=>f.addColorStop(s[0],s[1]));
  g.fillStyle=f;g.beginPath();g.arc(450,520,290,0,Math.PI*2);g.fill();
  ring(0,Math.PI);
  f=g.createRadialGradient(740,880,8,760,900,90);
  [[0,'#fff'],[.5,'#9a9a9a'],[1,'#151515']].forEach(s=>f.addColorStop(s[0],s[1]));
  g.fillStyle=f;g.beginPath();g.arc(760,900,80,0,Math.PI*2);g.fill();
  f=g.createRadialGradient(450,1040,10,450,1040,360);f.addColorStop(0,'rgba(0,0,0,.7)');f.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=f;g.fillRect(0,900,900,200);
  return c;
}
function testCanvas(){
  const W=960,H=720,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  g.fillStyle='#111';g.fillRect(0,0,W,H);
  const bars=['#c0c0c0','#c0c000','#00c0c0','#00c000','#c000c0','#c00000','#0000c0'];
  const bw=W/7;
  bars.forEach((b,i)=>{g.fillStyle=b;g.fillRect(i*bw,0,bw+1,H*.58);});
  const rev=['#0000c0','#111','#c000c0','#111','#00c0c0','#111','#c0c0c0'];
  rev.forEach((b,i)=>{g.fillStyle=b;g.fillRect(i*bw,H*.58,bw+1,H*.08);});
  const ramp=g.createLinearGradient(0,0,W,0);ramp.addColorStop(0,'#000');ramp.addColorStop(1,'#fff');
  g.fillStyle=ramp;g.fillRect(0,H*.66,W,H*.1);
  g.fillStyle='#fff';g.fillRect(0,H*.76,W*.25,H*.24);g.fillStyle='#000';g.fillRect(W*.25,H*.76,W*.1,H*.24);
  g.fillStyle='#222';g.fillRect(W*.35,H*.76,W*.65,H*.24);
  g.strokeStyle='#fff';g.lineWidth=2;
  for(let x=0;x<=W;x+=60){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.globalAlpha=.18;g.stroke();g.globalAlpha=1;}
  for(let y=0;y<=H;y+=60){g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.globalAlpha=.18;g.stroke();g.globalAlpha=1;}
  g.lineWidth=5;g.beginPath();g.arc(W/2,H*.4,H*.3,0,Math.PI*2);g.stroke();
  g.font='700 54px "JetBrains Mono",monospace';g.textAlign='center';g.fillStyle='#fff';
  g.fillText('n0ise',W/2,H*.42);g.font='500 20px "JetBrains Mono",monospace';g.fillText('TEST SIGNAL',W/2,H*.48);
  return c;
}

/* ---------- palettes in use ---------- */
function curPal(){
  const id=P.pal;
  if(id==='src')return{mode:0};
  const def=PALS.find(p=>p.id===id);
  const cols=id==='custom'?P.custom:def.c;
  const key=id+cols.join();
  if(V.palCache.key===key)return V.palCache.v;
  const rgb=cols.map(hexRGB).sort((a,b)=>lum255(a)-lum255(b));
  const n=Math.min(16,rgb.length);
  const flat=new Float32Array(48),lv=new Float32Array(16);
  for(let i=0;i<n;i++){flat[i*3]=rgb[i][0]/255;flat[i*3+1]=rgb[i][1]/255;flat[i*3+2]=rgb[i][2]/255;lv[i]=lum255(rgb[i])/255;}
  const v={mode:1,n,rgb,flat,lv,lo:lv[0],span:(lv[n-1]-lv[0])||1,css:rgb.map(c=>`rgb(${c})`),bright:rgb[n-1]};
  V.palCache={key,v};return v;
}

/* ---------- CPU error diffusion ---------- */
const KER={
  fs:{d:16,k:[[1,0,7],[-1,1,3],[0,1,5],[1,1,1]]},
  atk:{d:8,k:[[1,0,1],[2,0,1],[-1,1,1],[0,1,1],[1,1,1],[0,2,1]]},
  jjn:{d:48,k:[[1,0,7],[2,0,5],[-2,1,3],[-1,1,5],[0,1,7],[1,1,5],[2,1,3],[-2,2,1],[-1,2,3],[0,2,5],[1,2,3],[2,2,1]]},
  stucki:{d:42,k:[[1,0,8],[2,0,4],[-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2],[-2,2,1],[-1,2,2],[0,2,4],[1,2,2],[2,2,1]]},
  sierra:{d:32,k:[[1,0,5],[2,0,3],[-2,1,2],[-1,1,4],[0,1,5],[1,1,4],[2,1,2],[-1,2,2],[0,2,3],[1,2,2]]},
  burkes:{d:32,k:[[1,0,8],[2,0,4],[-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2]]}
};
const KF={};
function kern(method){
  if(KF[method])return KF[method];
  const K=KER[method];
  return KF[method]={n:K.k.length,dx:Int32Array.from(K.k.map(a=>a[0])),dy:Int32Array.from(K.k.map(a=>a[1])),wt:Float32Array.from(K.k.map(a=>a[2]/K.d))};
}
const POOL={};
function pool(name,n,C){let a=POOL[name];if(!a||a.length!==n){a=new C(n);POOL[name]=a;}return a;}
/* buf is padded: stride w+4, two columns of margin each side, so no bounds checks in the hot loop */
function diffuse(buf,w,h,lv,n,method,str,bias,idx){
  const K=kern(method),pw=w+4,kn=K.n,offs=new Int32Array(kn),wts=new Float32Array(kn);
  for(let k=0;k<kn;k++){offs[k]=K.dy[k]*pw+K.dx[k];wts[k]=K.wt[k]*str;}
  const sp=(lv[n-1]-lv[0])/Math.max(1,n-1),bs=bias*sp;
  for(let y=0;y<h;y++){
    let i=y*pw+2;
    for(let x=0;x<w;x++,i++){
      const old=buf[i],q=old+bs;
      let b=0,bd=1e9;
      for(let j=0;j<n;j++){const d=q>lv[j]?q-lv[j]:lv[j]-q;if(d<bd){bd=d;b=j;}}
      idx[y*w+x]=b;
      const e=old-lv[b];
      for(let k=0;k<kn;k++)buf[i+offs[k]]+=e*wts[k];
    }
  }
}
const CPU={ms:8,last:0};
function cpuProcess(raw,w,h,pal,method,str,bias,depth,quantTex){
  const n=w*h,pw=w+4,out=pool('out',n*4,Uint8Array),idx=pool('idx',n,Uint8Array),buf=pool('buf',pw*(h+3),Float32Array);
  out.fill(0);
  if(pal.mode===1){
    buf.fill(0);
    for(let y=0;y<h;y++){const o=(h-1-y)*w,bo=y*pw+2;for(let x=0;x<w;x++){const i=(o+x)*4;buf[bo+x]=pal.lo+(.299*raw[i]+.587*raw[i+1]+.114*raw[i+2])/255*pal.span;}}
    diffuse(buf,w,h,pal.lv,pal.n,method,str,bias,idx);
    for(let y=0;y<h;y++){const o=(h-1-y)*w;for(let x=0;x<w;x++)out[(o+x)*4+3]=idx[y*w+x];}
  }else{
    const k=depth,lv=Float32Array.from({length:k},(_,i)=>i/(k-1));
    for(let ch=0;ch<3;ch++){
      buf.fill(0);
      for(let y=0;y<h;y++){const o=(h-1-y)*w,bo=y*pw+2;for(let x=0;x<w;x++)buf[bo+x]=raw[(o+x)*4+ch]/255;}
      diffuse(buf,w,h,lv,k,method,str,bias,idx);
      for(let y=0;y<h;y++){const o=(h-1-y)*w;for(let x=0;x<w;x++)out[(o+x)*4+ch]=Math.round(lv[idx[y*w+x]]*255);}
    }
    for(let i=3;i<out.length;i+=4)out[i]=255;
  }
  gl.bindTexture(gl.TEXTURE_2D,quantTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,out);
}
/* still images: one synchronous read is fine */
function cpuSync(rt,pal,method,str,bias,depth,quantRT){
  const raw=pool('raw',rt.w*rt.h*4,Uint8Array);
  gl.bindFramebuffer(gl.FRAMEBUFFER,rt.fbo);
  gl.readPixels(0,0,rt.w,rt.h,gl.RGBA,gl.UNSIGNED_BYTE,raw);
  cpuProcess(raw,rt.w,rt.h,pal,method,str,bias,depth,quantRT.tex);
}
/* live sources: non-blocking readback through a pixel buffer + fence, so the GPU never stalls */
const RB={pbo:null,size:0,sync:null,w:0,h:0};
function readStart(rt){
  const size=rt.w*rt.h*4;
  if(!RB.pbo)RB.pbo=gl.createBuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,rt.fbo);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,RB.pbo);
  if(RB.size!==size){gl.bufferData(gl.PIXEL_PACK_BUFFER,size,gl.STREAM_READ);RB.size=size;}
  gl.readPixels(0,0,rt.w,rt.h,gl.RGBA,gl.UNSIGNED_BYTE,0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  RB.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();RB.w=rt.w;RB.h=rt.h;
}
function readDrop(){if(RB.sync){gl.deleteSync(RB.sync);RB.sync=null;}}
function readFinish(){
  if(!RB.sync)return null;
  const st=gl.clientWaitSync(RB.sync,0,0);
  if(st===gl.TIMEOUT_EXPIRED)return null;
  const ok=st!==gl.WAIT_FAILED;
  readDrop();if(!ok)return null;
  const raw=pool('raw',RB.size,Uint8Array);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,RB.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,raw);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  return raw;
}
function finishLive(pal,method){
  const raw=readFinish();if(!raw)return;
  if(RB.w!==T.quant.w||RB.h!==T.quant.h)return;
  const t0=performance.now();
  cpuProcess(raw,RB.w,RB.h,pal,method,E.dstr/100,E.tbias/100,E.depth,T.quant.tex);
  CPU.ms=lerp(CPU.ms,performance.now()-t0,.3);
}

/* ---------- text overlay ---------- */
const textCv=document.createElement('canvas'),textCtx=textCv.getContext('2d');
function updateText(W,lines,H,pal,t){
  if(!E.ton){V.textKey='';return;}
  const clock=new Date().toTimeString().slice(0,8);
  const cur=E.tcur&&Math.floor(t*2)%2===0;
  const str=String(E.txt).replace(/\{t\}/g,clock);
  const key=[str,E.tsz,E.ty,cur,W,lines,H,pal.mode?pal.bright.join():'w'].join('|');
  if(key===V.textKey)return;V.textKey=key;
  textCv.width=W;textCv.height=lines;
  const g=textCtx;g.setTransform(1,0,0,lines/H,0,0);g.clearRect(0,0,W,H);
  const px=E.tsz/100*H;
  g.font=`500 ${px}px "JetBrains Mono",ui-monospace,Menlo,monospace`;g.textBaseline='top';
  const c=pal.mode?pal.bright:[255,255,255];
  g.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
  const ls=(str+(cur?'█':'')).split('\n');
  ls.forEach((l,i)=>g.fillText(l,W*.05,H*E.ty/100+i*px*1.25));
  gl.bindTexture(gl.TEXTURE_2D,TEX.text);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,textCv);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
}

/* ---------- modulation, weather, power ---------- */
const noise1=t=>{const i=Math.floor(t),f=t-i,s=f*f*(3-2*f),h=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};return h(i)*(1-s)+h(i+1)*s;};
const audio={on:false,level:0,an:null,data:null,ctx:null};
const ST={pwr:1,pwrAnim:1,pwrFrom:1,pwrT0:-9,degT0:-99,chanT0:-99,rollAcc:0,chanSwapped:true,paint:false,hold:false,autoQ:1,okN:0,clean:false};
function powerShape(t){
  const el=(t-ST.pwrT0);
  if(ST.pwr===1){
    const u=clamp(el/.9,0,1);
    if(u>=1)return{sx:1,sy:1,gain:1};
    return{sx:sstep(0,.33,u)*.995+.0005,sy:.004+sstep(.28,1,u)*.996,gain:1+(1-sstep(.28,1,u))*3};
  }
  const u=clamp(el/.55,0,1);
  if(u>=1)return{sx:.0005,sy:.004,gain:0};
  const fall=1-u;
  return{sx:.0005+sstep(0,.45,fall)*.995,sy:.004+sstep(.4,1,fall)*.996,gain:1+(1-sstep(.4,1,fall))*3*fall};
}
/* =====================================================================
   Chains: Camera → Medium → Playback → Display. Each stage is a swappable
   module that writes plain P keys, so every old control keeps working.
   ===================================================================== */
const STAGES=[
  ['cam','Camera',[
    ['clean','Clean',{}],
    ['tube','Tube camera',{fblend:30,hal:40,blur:1,clip:8,contrast:10}],
    ['ccd','CCD',{clip:35,hal:10,sharp:30,csat:115,rgbs:6}],
    ['filmcam','Film camera',{hal:55,contrast:20,csat:90,temp:15}],
    ['sec','Security cam',{contrast:-10,csat:0,blur:1,clip:20,sharp:20}],
    ['handy','Handycam',{hal:25,csat:105,clip:15,temp:-10}]]],
  ['med','Medium',[
    ['live','Live',{}],
    ['film','Film print',{micro:45,dust:55,scr:40,jit:12,drift:6,gen:8,sati:25}],
    ['vhs','VHS tape',{gen:40,jit:35,drift:20,trk:30,hsw:60,drop:30,vhold:4,phs:6}],
    ['beta','Betacam',{gen:6,jit:4,drop:5}],
    ['cctv','Surveillance tape',{gen:50,jit:25,hsw:35,drop:45,trk:35,sline:10}],
    ['worn','Worn VHS',{gen:65,drop:55,trk:60,hsw:80,vhold:15,jit:55,drift:35,rgbs:15,tear:12}]]],
  ['play','Playback',[
    ['direct','Direct',{lines:576,lbw:0,cbw:0,ycs:100}],
    ['comp','Composite',{lines:480,lbw:20,cbw:40,ycs:45,cper:4,ring:15}],
    ['rf','RF antenna',{lines:240,lbw:45,cbw:60,ycs:30,snr:25,coh:50,snow:8,ghost:12}],
    ['svid','S-Video',{lines:480,lbw:12,cbw:18,ycs:100}],
    ['compo','Component',{lines:480,lbw:5,cbw:5,ycs:100}],
    ['weak','Weak UHF',{lines:200,lbw:55,cbw:70,snr:40,coh:60,snow:20,ghost:20,gdel:30,ring:30}]]],
  ['disp','Display',[
    ['studio','Studio CRT',{}],
    ['bw','70s B&W',{phos:'3',csat:0,mask:'0',mstr:0,curv:55,corner:50,spot:60,efoc:50,scan:35,beam:60,bloom:50,after:40,dr:60,dg:60,db:60,vig:55,refl:30,glare:30,bez:6,bsh:60,iface:'1',iflk:40,aging:40}],
    ['tv80','80s TV',{mask:'2',mstr:60,mpitch:3,curv:40,corner:40,spot:45,efoc:35,scan:45,bloom:40,hal:30,refl:25,bez:5,bsh:50,aging:35,iface:'1',iflk:30}],
    ['arcade','Arcade',{mask:'3',mstr:70,mpitch:4,curv:30,corner:30,scan:70,beam:35,bloomb:60,bloom:55,hal:35,refl:30,glare:25,vig:40,csat:130,bez:6,bsh:60,temp:10}],
    ['pc','PC monitor',{mask:'1',mstr:50,mpitch:3,curv:10,corner:15,scan:25,beam:30,spot:15,efoc:20,bloom:25,ar:60,bez:4,bsh:40}],
    ['port','Portable TV',{mask:'2',mstr:30,mpitch:4,curv:70,corner:60,spot:70,efoc:60,scan:30,vig:55,aging:60,bez:8,bsh:70,refl:35,glare:35}],
    ['lcd','Handheld LCD',{pal:'gameboy',method:'b4',px:4,mask:'2',mstr:35,mpitch:2,mgap:45,msoft:10,scan:0,beam:0,curv:0,corner:10,spot:0,efoc:0,fblend:40,vig:15,bez:8,bsh:60,refl:12,bloom:0,hal:0,after:0,csat:0}],
    ['vec','Vector',{phos:'1',pal:'mono',method:'off',edge:100,mask:'0',mstr:0,scan:0,beam:10,bloom:90,brad:70,hal:40,dr:400,dg:400,db:400,after:85,curv:30,corner:30,csat:0,bright:20,contrast:30}],
    ['amber','Amber terminal',{phos:'2',pal:'mono',csat:0,mask:'0',mstr:0,scan:60,beam:50,bloom:60,hal:40,dr:120,dg:120,db:120,after:70,burn:40,curv:35,corner:35,spot:40,vig:45,refl:25}],
    ['green','Green terminal',{phos:'1',pal:'mono',csat:0,mask:'0',mstr:0,scan:60,beam:50,bloom:60,hal:40,dr:220,dg:220,db:220,after:75,burn:50,curv:35,corner:35,spot:40,vig:45,refl:25}],
    ['nvg','Night vision',{phos:'1',pal:'phosphor',method:'off',csat:0,mask:'0',mstr:0,bloom:90,brad:40,hal:55,vig:95,corner:100,curv:0,scan:10,bright:25,contrast:35,fbg:12,fbz:1,fbr:0,fbh:0}],
    ['therm','Thermal viewer',{pal:'custom',custom:['#05001a','#4b0a8c','#d4145a','#ff8c1a','#fff6a8'],method:'off',blur:2,csat:0,mask:'0',mstr:0,bloom:45,hal:30,vig:25,curv:0,corner:20,scan:8,spot:60,contrast:20}]]]
];
const stageModel=(sid,mid)=>STAGES.find(s=>s[0]===sid)[2].find(m=>m[0]===mid);
const CHAINS=[
  ['Newsroom studio',['tube','live','comp','studio']],
  ['Evening news 1984',['tube','live','comp','tv80']],
  ['Home movie',['filmcam','film','comp','bw']],
  ['Rental tape',['ccd','vhs','comp','tv80']],
  ['Worn rental',['ccd','worn','rf','port']],
  ['Camcorder replay',['handy','vhs','svid','pc']],
  ['Edit suite',['ccd','beta','compo','pc']],
  ['Shop CCTV',['sec','cctv','comp','green']],
  ['Night patrol',['sec','cctv','direct','nvg']],
  ['Arcade cabinet',['clean','live','comp','arcade']],
  ['Pocket console',['clean','live','direct','lcd']],
  ['Vector cabinet',['clean','live','direct','vec']],
  ['Amber terminal',['clean','live','direct','amber']],
  ['Green terminal',['clean','live','direct','green']],
  ['Thermal inspection',['ccd','live','direct','therm']],
  ['Pirate broadcast',['tube','live','weak','port']],
  ['Late-night UHF',['sec','live','rf','tv80']],
  ['Film on tube',['filmcam','film','comp','studio']],
  ['Wedding on portable',['handy','vhs','rf','port']],
  ['CCTV at 3am',['sec','worn','weak','bw']],
  ['Bootleg arcade tape',['ccd','worn','comp','arcade']],
  ['Archive reel',['filmcam','film','direct','bw']],
  ['Dead channel',['tube','worn','weak','bw']],
  ['Studio on S-Video',['tube','beta','svid','pc']]
];
const MACROS=['mWear','mAge','mBand','mInst'];
function applyStages(stg){
  const keep={};MACROS.forEach(k=>keep[k]=P[k]);
  applyProfile('studio');
  stg.forEach((mid,i)=>Object.assign(P,JSON.parse(JSON.stringify(stageModel(STAGES[i][0],mid)[2]))));
  MACROS.forEach(k=>P[k]=keep[k]);
  P.stg=stg.slice();P.profile='chain';
}
function buildChainUI(){
  const g=hooks.group('display','Chain');
  STAGES.forEach(([sid,name,models],i)=>{
    g.appendChild(hooks.el('div','cl',name));
    hooks.chipRow(g,models.map(m=>[m[0],m[1]+(m[2].pal?' ◐':'')]),'stg_'+sid,(id)=>{
      const s=(P.stg||BASE.stg).slice();s[i]=id;applyStages(s);hooks.snap();hooks.refreshUI();
    });
  });
  g.appendChild(hooks.el('div','cl','Ready-made chains'));
  hooks.chipRow(g,CHAINS.map((c,i)=>[String(i),c[0]+(c[1].some((mid,j)=>stageModel(STAGES[j][0],mid)[2].pal)?' ◐':'')]),'chains',(i)=>{applyStages(CHAINS[+i][1]);hooks.snap();hooks.refreshUI();});
}
function refreshChainUI(){
  STAGES.forEach(([sid],i)=>document.querySelectorAll('#stg_'+sid+' .chip').forEach(b=>b.setAttribute('aria-pressed',P.profile==='chain'&&b.dataset.v===(P.stg||[])[i])));
  document.querySelectorAll('#chains .chip').forEach(b=>b.setAttribute('aria-pressed',P.profile==='chain'&&JSON.stringify(CHAINS[+b.dataset.v][1])===JSON.stringify(P.stg)));
}

/* ---- life: macros, clustered events, weather states, slow drift ---- */
const EVT=[['tear',60],['rgbs',70],['drop',80],['snr',35],['trk',70],['hsw',70],['gblock',50],['sline',50]];
function lifeStep(t,dt,add){
  const cu=v=>Math.pow(clamp(v/100,0,1),1.5);
  const wr=cu(P.mWear),ag=cu(P.mAge),bd=cu(P.mBand),ins=cu(P.mInst);
  if(wr){add('dust',60*wr);add('scr',45*wr);add('smud',50*wr);add('burn',40*wr);add('micro',25*wr);add('aging',50*wr);}
  if(bd){add('lbw',60*bd);add('cbw',70*bd);add('efoc',40*bd);add('spot',30*bd);E.lines=Math.max(60,E.lines*(1-.6*bd));}
  if(ins){add('jit',50*ins);add('drift',40*ins);add('trk',30*ins);add('hsw',30*ins);add('vhold',8*ins);}
  if(ag){
    const warm=Math.exp(-t/60);
    add('aging',60*ag+Math.min(30,t/8)*ag);add('sati',50*ag);add('convs',40*ag+25*warm*ag);add('conve',45*ag);add('cdrift',60*ag);add('gen',25*ag);
    add('temp',18*ag*Math.sin(t/70+P.seed)+10*warm*ag);add('cbri',-10*warm*ag);
    if(t-(ST.lastDeg??0)>240){ST.lastDeg=t;ST.degT0=t;}
  }
  /* seeded RNG */
  if(ST.rngSeed!==P.seed){ST.rngSeed=P.seed;ST.rng=mulberry(P.seed*7919+13);ST.ev=[];ST.hx=0;ST.wS=0;ST.wDwell=0;ST.wl=0;ST.ws=0;}
  const rnd=ST.rng;
  /* Hawkes-style clustered events */
  const rate=P.grate/100*(.02+ins*.9);
  ST.hx*=Math.exp(-dt/2);
  if(rate>0){
    const lam=rate+ST.hx;
    if(rnd()<1-Math.exp(-lam*dt)&&ST.ev.length<6){
      const e=EVT[rnd()*EVT.length|0];
      ST.ev.push({k:e[0],a:e[1]*(.4+.6*rnd()),t0:t,dur:.15+rnd()*1.1});
      ST.hx+=.5+ins;
    }
  }
  ST.ev=ST.ev.filter(v=>t-v.t0<v.dur+.25);
  for(const v of ST.ev){
    const x=t-v.t0;let env;
    if(x<.04)env=x/.04;else if(x<.16)env=1-.4*(x-.04)/.12;else if(x<v.dur)env=.6;else env=.6*(1-(x-v.dur)/.25);
    add(v.k,v.a*Math.max(0,env));
  }
  /* weather Markov states with hysteresis: clear / overcast / storm */
  ST.wDwell+=dt;
  const minDwell=[4,8,6][ST.wS];
  if(P.weather>0&&ST.wDwell>minDwell){
    const r=rnd(),pr=dt;
    let n=ST.wS;
    if(ST.wS===0&&r<.08*pr)n=1;
    else if(ST.wS===1){if(r<.10*pr)n=2;else if(r<.22*pr)n=0;}
    else if(ST.wS===2&&r<.25*pr)n=1;
    if(n!==ST.wS){ST.wS=n;ST.wDwell=0;}
  }
  const tl=[0,.6,.9][ST.wS],ts=ST.wS===2?1:0;
  ST.wl+=(tl-ST.wl)*Math.min(1,dt*1.2);ST.ws+=(ts-ST.ws)*Math.min(1,dt*1.5);
  return [ST.wl,ST.ws];
}
function computeE(t,dt){
  Object.assign(E,P);
  for(const k of ['bit','g','s','b','m','l','gl'])E['lay_'+k]=P.solo==='all'||P.solo===k;
  for(const m of MODS){
    const c=CTL[m.target];if(!c||c.t!=='r')continue;
    let w;
    const ph=t*m.rate;
    switch(m.shape){
      case'sine':w=Math.sin(ph*6.2832);break;
      case'tri':w=1-4*Math.abs(ph%1-.5);break;
      case'square':w=(ph%1)<.5?1:-1;break;
      case'saw':w=2*(ph%1)-1;break;
      case'noise':w=noise1(ph*3)*2-1;break;
      case'audio':w=audio.level*2-1;break;
      default:w=0;
    }
    E[m.target]=clamp(E[m.target]+w*(m.depth/100)*(c.max-c.min)/2,c.min,c.max);
  }
  const wx=P.weather/100,seed=P.seed;
  const ch=ST.chanT0>-90?Math.max(0,1-(t-ST.chanT0)/.7):0;
  const add=(k,v)=>{E[k]=clamp(E[k]+v,CTL[k].min,CTL[k].max);};
  const [lw,sw]=lifeStep(t,dt,add);
  const wl=wx*lw,ws=wx*sw;
  add('snr',wl*30+ws*45+ch*80);add('jit',wl*25+ws*40+ch*50);add('drift',wl*15+ws*25);
  add('drop',ws*60);add('trk',ws*50);add('snow',ws*30+ch*70);add('ghost',wl*20);add('hsw',ch*40);
  const vh=clamp(E.vhold/100+ch,0,1.5);
  ST.rollAcc=(ST.rollAcc+dt*vh*vh*.8)%1;
  E.roll=vh>0?(ST.rollAcc+.012*vh*Math.sin(t*40))%1:0;E.rollAmt=vh;
  if(ST.clean){E.bez=0;E.bsh=0;E.corner=0;E.over=0;E.curv=0;E.vig=Math.min(E.vig,20);}
  E.glitchT=P.gfreeze?(ST.freezeT??(ST.freezeT=t)):(ST.freezeT=undefined,t);
}
/* =====================================================================
   n0ise — frame renderer
   ===================================================================== */
const T={};
const POINTER={x:0,y:0};
const PAINTQ=[];
const METHOD_ID={off:0,thr:1,b4:2,b8:3,blue:4,white:5,half:6};
const PHOS_COL=[[1,1,1],[.35,1,.45],[1,.62,.14],[.92,.95,1],[.35,.55,1]];

function ensureTargets(DW,DH,lines,gw,gh){
  const key=[DW,DH,lines,gw,gh,V.HDR].join();
  if(key===V.sizeKey)return;V.sizeKey=key;
  Object.keys(T).forEach(k=>{freeRT(T[k]);delete T[k];});
  const nn={filter:gl.NEAREST};
  T.tone=mkRT(gw,gh,nn);T.quant=mkRT(gw,gh,nn);
  T.sigIn=mkRT(DW,lines,{hdr:true});T.yiq=mkRT(DW,lines,{hdr:true});T.sig=mkRT(DW,lines,{hdr:true});
  T.crt=mkRT(DW,DH,{hdr:true});T.pA=mkRT(DW,DH,{hdr:true});T.pB=mkRT(DW,DH,{hdr:true});
  const bs=d=>[Math.max(4,DW/d),Math.max(4,DH/d)];
  T.bA1=mkRT(...bs(4),{hdr:true});T.bA2=mkRT(...bs(4),{hdr:true});
  T.bB1=mkRT(...bs(8),{hdr:true});T.bB2=mkRT(...bs(8),{hdr:true});
  T.bC1=mkRT(...bs(16),{hdr:true});T.bC2=mkRT(...bs(16),{hdr:true});
  V.lastBKey='';
}

const SZ={w:0,h:0,cw:0,ch:0};
/* export sizes: preview size times 2 or 4, capped by the GPU texture limit and ~24 megapixels (not tiled yet) */
function exportCap(){const mt=gl.getParameter(gl.MAX_TEXTURE_SIZE);return Math.min(mt,matchMedia('(pointer:coarse)').matches?4096:6144);}
function expDims(cw,ch,mul){const dpr=Math.min(2,window.devicePixelRatio||1);let DW=Math.round(cw*dpr*mul),DH=Math.round(ch*dpr*mul);
  const cap=ST.expCap||exportCap(),m=Math.max(DW,DH);if(m>cap){DW=Math.round(DW*cap/m);DH=Math.round(DH*cap/m);}
  const px=DW*DH;if(px>2.4e7){const k=Math.sqrt(2.4e7/px);DW=Math.round(DW*k);DH=Math.round(DH*k);}return[DW&~1,DH&~1];}
/* embed mode (studio.html): the parent hands in a canvas each frame and gets the rendered result back */
const EMBED=/[?&]embed=1/.test(location.search);if(EMBED)document.documentElement.dataset.embed='1';
const EMB={w:0,h:0,ok:false};
function layout(){
  const srcAsp=ST.ovr?ST.ovr.w/ST.ovr.h:SRC.w/SRC.h;
  let asp=srcAsp;
  if(E.aspect!=='src'){const [a,b]=E.aspect.split(':').map(Number);asp=a/b;}
  if(!SZ.w){SZ.w=stage?stage.clientWidth:(EMB.w||640);SZ.h=stage?stage.clientHeight:(EMB.h||480);}
  const sw=Math.max(40,SZ.w-16),sh=Math.max(40,SZ.h-16);
  let cw=sw,ch=sw/asp;if(ch>sh){ch=sh;cw=sh*asp;}
  const dpr=Math.min(2,window.devicePixelRatio||1),q=parseFloat(E.quality)*ST.autoQ;
  let DW=Math.round(cw*dpr*q),DH=Math.round(ch*dpr*q);
  if(ST.expMul>=1){[DW,DH]=expDims(cw,ch,ST.expMul);}
  else{const m=Math.max(DW,DH);if(m>1800){DW=Math.round(DW*1800/m);DH=Math.round(DH*1800/m);}}
  if(EMB.w){DW=EMB.w;DH=EMB.h;}
  DW=Math.max(160,DW&~1);DH=Math.max(120,DH&~1);
  if(!stage){SZ.cw=cw;SZ.ch=ch;}
  if(cw!==SZ.cw||ch!==SZ.ch){canvas.style.width=cw+'px';canvas.style.height=ch+'px';SZ.cw=cw;SZ.ch=ch;}
  if(canvas.width!==DW||canvas.height!==DH){canvas.width=DW;canvas.height=DH;}
  return{srcAsp,asp:DW/DH,DW,DH};
}

function syncSrc(){
  const se=SRC.el;
  if(se instanceof HTMLVideoElement){
    if(se.paused&&!se.srcObject&&!document.hidden)se.play().catch(()=>{});
    if(se.readyState>=2&&(se.currentTime!==SRC.lastT||SRC.lastVer!==SRC.ver)){SRC.lastT=se.currentTime;SRC.lastVer=SRC.ver;uploadSrc();}
  }else if(SRC.gif)hooks.stepGif();
  else if(SRC.viz&&hooks.AUD.on){hooks.audFrame();uploadSrc();}
}
function renderFrame(t,dt,OUT){
  if(ST.eT!==t)computeE(t,dt);
  const SW=ST.ovr?ST.ovr.w:SRC.w,SH=ST.ovr?ST.ovr.h:SRC.h,STEX=ST.ovr?ST.ovr.tex:TEX.src;
  const L=layout(),{srcAsp,asp,DW,DH}=L;ST.DW=DW;ST.DH=DH;
  const k=DW/1000;
  const lines=Math.round(clamp(E.lines,60,720));
  let gw=Math.max(16,Math.round(1000/E.px)),gh=Math.max(8,Math.round(gw/asp));
  if(SRC.live&&METHOD_ID[E.lay_bit?E.method:'off']===undefined){
    const c=Math.sqrt(70000/(gw*gh));
    if(c<1){gw=Math.max(16,Math.round(gw*c));gh=Math.max(8,Math.round(gw/asp));}
  }
  ensureTargets(DW,DH,lines,gw,gh);
  gl.bindVertexArray(vaoEmpty);
  gl.disable(gl.BLEND);
  syncSrc();
  const pal=curPal();
  const palKey=pal.mode?V.palCache.key:'src';
  const prevP=V.pIdx?T.pB:T.pA,newP=V.pIdx?T.pA:T.pB;

  /* ---- compare: original ---- */
  if(ST.hold){
    bindRT(null);PR.orig.use();samp(PR.orig,'uSrc',0,STEX);
    PR.orig.f('uSrcAsp',srcAsp);PR.orig.f('uScrAsp',asp);draw();return;
  }

  /* ---- 1. tone + quantize (cached when static) ---- */
  const method=E.lay_bit?E.method:'off';
  const gpuM=METHOD_ID[method]!==undefined;
  const bkey=[SRC.ver,SRC.live?V.frameNo:0,gw,gh,asp,method,E.pal,palKey,E.depth,E.dstr,E.tbias,
    E.anim&&gpuM?V.frameNo:0,E.bright,E.contrast,E.mid,E.high,E.sat,E.hue,E.blur,E.sharp,E.edge,E.invert].join('|');
  const cpuM=!gpuM;
  let doBitmap=bkey!==V.lastBKey;
  if(doBitmap&&cpuM){
    if(SRC.live){if(RB.sync)doBitmap=false;}
    else if(performance.now()-CPU.last<Math.min(250,CPU.ms*2.5))doBitmap=false;
  }
  if(cpuM&&SRC.live)finishLive(pal,method);else readDrop();
  if(doBitmap){
    V.lastBKey=bkey;
    const r=asp/srcAsp,visW=SW*(r>1?1:r);
    const tp=PR.tone;bindRT(T.tone);tp.use();samp(tp,'uSrc',0,STEX);
    tp.f('uSrcAsp',srcAsp);tp.f('uScrAsp',asp);tp.v2('uTexel',1/SW,1/SH);
    tp.f('uSpread',Math.max(.5,visW/gw*.5));tp.f('uBlur',E.blur);tp.f('uSharp',E.sharp);tp.f('uEdge',E.edge/100);
    tp.f('uBright',E.bright/200);tp.f('uContrast',Math.tan((Math.min(E.contrast,98)/100+1)*Math.PI/4));
    tp.f('uMid',Math.pow(2,-E.mid/50));tp.f('uHigh',E.high/100*.3);tp.f('uSat',1+E.sat/100);
    tp.f('uHue',E.hue*Math.PI/180);tp.f('uInv',E.invert?1:0);
    draw();
    if(gpuM){
      const qp=PR.quant;bindRT(T.quant);qp.use();
      samp(qp,'uTone',0,T.tone.tex);samp(qp,'uBay4',1,TEX.bay4);samp(qp,'uBay8',2,TEX.bay8);samp(qp,'uBlue',3,TEX.blue);
      qp.i('uMethod',METHOD_ID[method]);qp.i('uPalN',pal.n||1);qp.i('uPalMode',pal.mode);
      if(pal.mode){qp.fv('uLv',pal.lv);qp.f('uLo',pal.lo);qp.f('uSpan',pal.span);}
      qp.f('uDepth',E.depth);qp.f('uStr',E.dstr/100);qp.f('uBias',E.tbias/100);qp.f('uCell',5);
      const fo=E.anim?V.frameNo:0;qp.v2('uOff',(fo*7)%64,(fo*13)%64);qp.v2('uGrid',gw,gh);
      draw();
    }else if(SRC.live){
      readStart(T.tone);
    }else{
      const t0=performance.now();
      cpuSync(T.tone,pal,method,E.dstr/100,E.tbias/100,E.depth,T.quant);
      CPU.ms=lerp(CPU.ms,performance.now()-t0,.5);CPU.last=performance.now();
    }
  }

  /* ---- 2. glitch / waves / feedback / text ---- */
  const gp=PR.glitch;bindRT(T.sigIn);gp.use();
  samp(gp,'uQ',0,T.quant.tex);samp(gp,'uPrev',1,prevP.tex);samp(gp,'uText',2,TEX.text);
  gp.v2('uGrid',gw,gh);
  if(pal.mode)gp.v3v('uPal',pal.flat);
  gp.i('uPalN',pal.n||1);gp.i('uPalMode',pal.mode);gp.i('uInterp',(method==='off'&&pal.mode)?1:0);
  gp.f('uCyc',E.cycle*t);gp.f('uLines',lines);gp.f('uTime',t);gp.f('uGT',E.glitchT);gp.f('uSeed',E.seed);
  gp.f('uAct',.05+.95*E.grate/100);gp.f('uAsp',asp);
  const gOn=E.lay_g?E.gamt/100:0;
  gp.f('uRgb',E.rgbs/100*gOn);gp.f('uTear',E.tear/100*gOn);gp.f('uSline',E.sline/100*gOn);gp.f('uBlock',E.gblock/100*gOn);
  gp.f('uDrag',E.drag/100*gOn);gp.f('uBand',E.band/100*gOn);gp.f('uInvc',E.ginv/100*gOn);gp.f('uBurst',E.burst/100*gOn);gp.f('uCrush',E.crush/100*gOn);
  const wOn=E.lay_g?1:0;
  gp.f('uWA',E.wamp/100*.06*wOn);gp.f('uWF',E.wfreq);gp.f('uWS',E.wspd/100*6);gp.f('uWFM',E.wfm/100);gp.f('uWFMR',E.wfmr);
  gp.f('uWAM',E.wam/100);gp.f('uWAMR',E.wamr);gp.f('uWPH',E.wph/100);gp.f('uW2',E.w2/100);gp.f('uW2F',E.w2f);
  gp.i('uWSh',+E.wshape);gp.i('uWAx',+E.waxis);gp.f('uScope',E.scope/100*wOn);
  gp.f('uFbg',E.fbg/100*.9*wOn);gp.f('uFbz',E.fbz/100);gp.f('uFbr',E.fbr*Math.PI/180);
  gp.f('uFbx',E.fbx/1000);gp.f('uFby',E.fby/1000);gp.f('uFbh',E.fbh*Math.PI/180);
  updateText(DW,lines,DH,pal,t);
  gp.i('uTextOn',E.ton?1:0);
  draw();

  /* ---- 3. signal laboratory ---- */
  if(E.lay_s&&+E.cmode!==2){
    const gen=E.gen/100;
    const sA=PR.sigA;bindRT(T.yiq);sA.use();samp(sA,'uSrc',0,T.sigIn.tex);
    sA.v2('uRes',DW,lines);sA.i('uFrame',V.frameNo);sA.i('uStd',+E.std);sA.f('uTime',t);sA.f('uSeed',E.seed);
    sA.f('uPer',Math.max(2.2,E.cper*k));
    sA.f('uSL',Math.max(.35,(.3+E.lbw/100*3.2+gen*1.5)*k));
    sA.f('uSC',Math.max(.6,(1.2+E.cbw/100*3.5)*k));
    sA.f('uYC',+E.cmode===1?1:E.ycs/100);sA.f('uSnr',E.snr/100*(1+gen*.8));sA.f('uCoh',E.coh/100);sA.f('uSnow',E.snow/100);
    sA.f('uGhost',E.ghost/100);sA.f('uGD',E.gdel*k);sA.f('uJit',E.jit/100*12*k);sA.f('uDrift',E.drift/100*10*k);
    sA.f('uTrk',E.trk/100);sA.f('uTJ',E.tjit/100);sA.f('uRG',E.rgho/100);sA.f('uGS',E.gspr*k);sA.f('uGDec',E.gdec/100);sA.f('uHsw',E.hsw/100);sA.f('uDrop',E.drop/100);sA.f('uClip',E.clip/100);
    sA.f('uCsat',E.csat/100*(1-gen*.35));sA.f('uPhase',E.phs*Math.PI/180);
    draw();
    const sB=PR.sigB;bindRT(T.sig);sB.use();samp(sB,'uY',0,T.yiq.tex);
    sB.v2('uRes',DW,lines);sB.f('uTau',E.cbw/100*5+.01);sB.f('uStep',(1+E.cbw/100*2.5)*k);
    sB.f('uRing',E.ring/100*.8);sB.f('uPop',E.pop/100);sB.f('uGenBlur',gen*.5);
    draw();
  }else{
    bindRT(T.sig);PR.copy.use();samp(PR.copy,'uT',0,T.sigIn.tex);draw();
  }

  /* ---- 4. CRT beam & phosphor ---- */
  const hw=hardware(E.seed),pw=powerShape(t);
  const cp=PR.crt;bindRT(T.crt);cp.use();samp(cp,'uSig',0,T.sig.tex);
  cp.v2('uRes',DW,DH);cp.v2('uHwGeo',hw.geo[0],hw.geo[1]);
  const tmp=E.temp/100,wp=tmp>0?[1,1-.1*tmp,1-.35*tmp]:[1+.3*tmp,1+.05*tmp,1];
  cp.v3('uWhite',wp[0],wp[1],wp[2]);
  const ag=E.aging/100;
  cp.v3('uGain',E.gr/100*lerp(1,hw.gain[0],ag*2),E.gg/100*lerp(1,hw.gain[1],ag*2),E.gb/100*lerp(1,hw.gain[2],ag*2));
  cp.v3('uHwConv',hw.conv[0],hw.conv[1],hw.conv[2]);
  {const h=((E.ptint%360)+360)%360/60,x=1-Math.abs(h%2-1),rgb=h<1?[1,x,0]:h<2?[x,1,0]:h<3?[0,1,x]:h<4?[0,x,1]:h<5?[x,0,1]:[1,0,x];cp.v3('uPT',.35+rgb[0]*.65,.35+rgb[1]*.65,.35+rgb[2]*.65);cp.f('uPTA',E.ptamt/100);}
  cp.i('uMask',E.lay_m?+E.mask:0);cp.i('uPhos',+E.phos);
  cp.f('uLines',lines);cp.f('uTime',t);cp.f('uSeed',E.seed);cp.f('uField',V.frameNo%2);
  cp.f('uInter',+E.iface);cp.f('uIflk',E.iflk/100);
  cp.f('uCurv',E.curv/100);cp.f('uCorner',E.corner/100);cp.f('uOver',E.over/100);
  const lb=E.lay_b?1:0;
  cp.f('uConvS',E.convs/100*lb);cp.f('uConvE',E.conve/100*lb);cp.f('uCdrift',E.cdrift/100);cp.f('uAging',ag);
  cp.f('uSX',pw.sx);cp.f('uSY',pw.sy);cp.f('uGainP',pw.gain);
  cp.f('uDegT',Math.min(99,t-ST.degT0));cp.f('uRoll',E.roll);cp.f('uRollAmt',E.rollAmt);
  cp.f('uScan',E.scan/100*lb);cp.f('uBeamMin',.1+.35*E.beam/100);cp.f('uBeamGrow',.28*E.bloomb/100*lb);
  cp.f('uSpot',E.spot/100*lb);cp.f('uEfoc',E.efoc/100*lb);
  cp.f('uMStr',E.mstr/100);cp.f('uMPitch',Math.max(3,E.mpitch*DW/900));cp.f('uMSoft',E.msoft/100);cp.f('uMGap',E.mgap/100);
  cp.f('uBlk',E.blkl/400);cp.f('uGam',E.gam/100);cp.f('uCon',E.ccon/100);cp.f('uBri',E.cbri/200);cp.f('uSati',E.sati/100);
  draw();

  /* ---- 5. persistence & burn-in (display memory) ---- */
  const pp=PR.persist;bindRT(newP);pp.use();samp(pp,'uCrt',0,T.crt.tex);samp(pp,'uPrev',1,prevP.tex);
  const tauMin=ST.paint?700:0;
  const dec=ms=>{const m=Math.max(ms,tauMin);return m>0?Math.exp(-dt*1000/m):0;};
  pp.v3('uDecay',dec(E.dr),dec(E.dg),dec(E.db));
  pp.f('uAfter',ST.paint?1:E.after/100);pp.f('uBlend',E.fblend/100);pp.f('uEps',T.pA.hdr?.0005:.006);
  pp.f('uBurnRate',dt*.15*E.burn/100);
  draw();
  if(PAINTQ.length){
    gl.bindVertexArray(vaoPaint);
    const arr=new Float32Array(PAINTQ.length*3);
    PAINTQ.forEach((p,i)=>{arr[i*3]=p[0];arr[i*3+1]=p[1];arr[i*3+2]=p[2]*DW/1000;});
    gl.bindBuffer(gl.ARRAY_BUFFER,paintBuf);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);
    PR.paint.use();
    const pc=PHOS_COL[+E.phos];PR.paint.v3('uCol',pc[0]*1.3,pc[1]*1.3,pc[2]*1.3);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.colorMask(true,true,true,false);
    gl.drawArrays(gl.POINTS,0,PAINTQ.length);
    gl.colorMask(true,true,true,true);gl.disable(gl.BLEND);
    gl.bindVertexArray(vaoEmpty);PAINTQ.length=0;
  }

  /* ---- 6. bloom chain ---- */
  if(E.lay_l){
    const blur=(src,tmpRT,dst)=>{
      const b=PR.blur;b.use();
      bindRT(tmpRT);samp(b,'uT',0,src.tex);b.v2('uDir',1/src.w,0);draw();
      bindRT(dst);samp(b,'uT',0,tmpRT.tex);b.v2('uDir',0,1/tmpRT.h);draw();
    };
    bindRT(T.bA1);PR.bright.use();samp(PR.bright,'uT',0,newP.tex);draw();
    blur(T.bA1,T.bA2,T.bA1);
    bindRT(T.bB1);PR.copy.use();samp(PR.copy,'uT',0,T.bA1.tex);draw();
    blur(T.bB1,T.bB2,T.bB1);
    if(!ST.lite){bindRT(T.bC1);PR.copy.use();samp(PR.copy,'uT',0,T.bB1.tex);draw();
    blur(T.bC1,T.bC2,T.bC1);}
  }

  /* ---- 7. glass & cabinet ---- */
  const fp=PR.final;bindRT(OUT||null);fp.use();
  samp(fp,'uP',0,newP.tex);samp(fp,'uBA',1,T.bA1.tex);samp(fp,'uBB',2,T.bB1.tex);samp(fp,'uBC',3,(ST.lite?T.bB1:T.bC1).tex);
  fp.v2('uRes',DW,DH);fp.v2('uPointer',POINTER.x,POINTER.y);fp.f('uSeed',E.seed);fp.f('uTime',t);
  fp.f('uBloom',E.bloom/100);fp.f('uBrad',E.brad/100);fp.f('uHal',E.hal/100);fp.f('uDiff',E.diff/100);
  fp.f('uRefl',E.refl/100);fp.f('uAR',E.ar/100);fp.f('uGlare',E.glare/100);fp.f('uTint',E.tint/100);
  fp.f('uDust',E.dust/100);fp.f('uScr',E.scr/100);fp.f('uSmud',E.smud/100);fp.f('uMicro',E.micro/100);
  fp.f('uVig',E.vig/100);fp.f('uBez',E.bez/100);fp.f('uBsh',E.bsh/100);fp.f('uRoom',E.room/100);fp.f('uPara',E.para/100);
  fp.f('uBurnAmt',E.burn/100);fp.f('uLayL',E.lay_l?1:0);fp.f('uLayG',E.lay_gl?1:0);
  draw();
  V.pIdx^=1;

  V.infoStr=`${(PROFILES.find(p=>p[0]===P.profile)||[0,'Custom'])[1]}, ${gw} × ${gh}, ${lines} lines, ${Math.round(V.fps)} fps${V.HDR?'':', 8-bit'}`;
}

let peakFps=30;
const CTX={lost:false};
function adaptQ(){
  peakFps=Math.max(V.fps,peakFps*.99);
  const tgt=Math.min(peakFps,60);
  if(V.fps<tgt*.8&&ST.autoQ>.45){ST.autoQ=Math.max(.45,ST.autoQ*.85);ST.okN=0;}
  else if(V.fps>=tgt*.93&&ST.autoQ<1&&++ST.okN>=8){ST.autoQ=Math.min(1,ST.autoQ*1.08);ST.okN=0;}
  ST.lite=ST.autoQ<.6;
}
export {VS,HEAD,F_TONE,F_QUANT,F_GLITCH,F_SIGA,F_SIGB,F_CRT,F_PERSIST,F_BRIGHT,F_COPY,F_BLUR,F_FINAL,F_ORIG,VS_PAINT,F_PAINT,$,clamp,lerp,sstep,TABS,CT,R,C,B,CTL,PALS,hexRGB,lum255,rgbHex,PROFILES,BASE,P,PROTECT,E,MODS,LOOKKEYS,applyProfile,mulberry,_hw,hardware,canvas,stage,gl,GLOK,_ro,noGL,createGL,attachGL,vaoEmpty,vaoPaint,paintBuf,PR,compile,mkProg,mkProgAsync,wrapProg,initGL,mkTex,mkRT,freeRT,bindRT,tex,samp,draw,bayer,r8tex,blueNoise,TEX,initLUT,SRC,srcDims,uploadSrc,setSource,fitCanvas,demoCanvas,testCanvas,curPal,KER,KF,kern,POOL,pool,diffuse,CPU,cpuProcess,cpuSync,RB,readStart,readDrop,readFinish,finishLive,textCv,textCtx,updateText,noise1,audio,ST,powerShape,STAGES,stageModel,CHAINS,MACROS,applyStages,buildChainUI,refreshChainUI,EVT,lifeStep,computeE,T,POINTER,PAINTQ,METHOD_ID,PHOS_COL,ensureTargets,SZ,exportCap,expDims,EMBED,EMB,layout,syncSrc,renderFrame,peakFps,CTX,adaptQ};
