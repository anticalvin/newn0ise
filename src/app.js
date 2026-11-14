import {toRecipe,fromRecipe,checkRecipe} from './recipe.js';
import {CAMS,glyph,drawOverlay} from './cams.js';
import {createRecorder,fmtTime} from './recorder.js';
import {createTimeline} from './timeline.js';
import {createEditor} from './editor.js';
import {createOverlays} from './overlay.js';
import {put as handoffPut,take as handoffTake} from './handoff.js';
import {CAMSIM_PARAMS,CAMSIM_FRAG,SIMS} from './camsim.js';
import {QUAL,setMaskQuality,PERSON,startPerson,feedPerson,syntheticPerson,DRAWN,paintDrawn,clearDrawn,maskFor,resetMatteGL,MASK_DEFAULTS} from './matte.js';
import {SIG,SIGNALS,signalValue,V,hooks,attachGL,createGL,VS,HEAD,$,clamp,lerp,TABS,CT,CTL,PALS,hexRGB,lum255,rgbHex,PROFILES,BASE,P,E,MODS,applyProfile,canvas,stage,gl,GLOK,noGL,PR,mkProg,mkProgAsync,initGL,mkRT,freeRT,bindRT,samp,draw,TEX,initLUT,SRC,srcDims,uploadSrc,setSource,fitCanvas,demoCanvas,testCanvas,RB,readDrop,audio,ST,STAGES,stageModel,CHAINS,applyStages,buildChainUI,refreshChainUI,computeE,T,POINTER,PAINTQ,SZ,exportCap,expDims,EMBED,EMB,layout,syncSrc,renderFrame,CTX,adaptQ} from './engine.js';
{const _c=document.getElementById('gl');attachGL(_c,document.getElementById('stage'),createGL(_c));}
/* =====================================================================
   Layer stack. A layer = {module, params, opacity, blend, showSource,
   select, thr, pos, size, seed}. A module renders its own effect:
   render(inputTex, ctx) writes into ctx.out (an RT, or null = screen).
   CRT Lab is one module (it reads the source itself and is the base).
   ===================================================================== */
const MODULES={};const MAPIMG={};
const registerModule=m=>(MODULES[m.id]=m);
const COLOR_MODES=['original','mono','duotone','gradient','palette'];
const BLENDS=['normal','multiply','screen','additive','difference','overlay'];
const LAYER_DEFAULTS={color:{mode:'original',pal:['#1a0f2e','#ffd27a'],amt:100},opacity:100,blend:'normal',showSource:false,select:'all',mask:{src:'person',invert:false,feather:20,grow:0,snap:35,lo:.5,hi:1,tol:.35,col:'#2fa84f'},thr:50,pos:[0,0],size:100,seed:0,visible:true,solo:false,mods:[]};
let layerUid=1;
const mkLayer=(mod,params)=>({uid:layerUid++,module:mod,params:params||(MODULES[mod]&&MODULES[mod].defaults?MODULES[mod].defaults():{}),...JSON.parse(JSON.stringify(LAYER_DEFAULTS))});

function crtSchema(){
  const secs=[];
  for(const [tid,tn] of TABS){
    const gs=[];
    CT.filter(c=>c.tab===tid).forEach(c=>{let g=gs.find(x=>x.name===c.g);if(!g)gs.push(g={name:c.g,keys:[]});g.keys.push(c.k);});
    secs.push({id:tid,label:tn,groups:gs});
  }
  return secs;
}
registerModule({
  id:'crtlab',family:'Display',name:'CRT Lab',engine:'gpu',base:true,
  get schema(){return{sections:crtSchema(),hero:['scan','curv','bloom']};},
  defaultLook:{paper:'#020204',ink:'#ecedf4',palette:'ice'},
  defaults:()=>P,
  render(inTex,ctx){renderFrame(ctx.t,ctx.dt,ctx.out);},
  thumbnail(px=96){const c=document.createElement('canvas');c.width=px;c.height=Math.round(px*canvas.height/canvas.width)||px;c.getContext('2d').drawImage(canvas,0,0,c.width,c.height);return c;}
});
/* dev-only module used to validate the compositor (not listed in any UI) */
registerModule({
  id:'_invert',family:'Dev',name:'Invert',engine:'gpu',hidden:true,defaults:()=>({}),
  render(inTex,ctx){
    const p=PR._inv||(PR._inv=mkProg(VS,HEAD+'uniform sampler2D uT;void main(){o=vec4(1.-texture(uT,vUv).rgb,1.);}'));
    bindRT(ctx.out);p.use();samp(p,'uT',0,inTex);draw();
  }
});
/* =====================================================================
   Shared libs: palettes, paper, noise, glyph atlas, selection masks.
   ===================================================================== */
const PALETTES={
  'Handheld':{'Gameboy':['#0f380f','#306230','#8bac0f','#9bbc0f'],'Pocket':['#1a1c13','#4d5a3a','#a2b07a','#d6e0b4'],'Virtual red':['#000000','#3a0000','#a00000','#ff2a2a']},
  'Print':{'CMYK on cream':['#f2ead3','#00a0c8','#e6007e','#ffed00','#1d1d1b'],'Newsprint':['#e9e4d4','#2b2b2b'],'Riso':['#f4efe1','#ff4f8b','#2d4ea2','#f5d90a']},
  'Neon':{'Video synth':['#05010f','#ff2a6d','#ffb000','#7cff00','#ff6a00','#b100ff','#ffffff'],'Retro scan':['#ff2a2a','#ff9a00','#ffee00','#37d637','#2a6bff','#a43cff']},
  'Mono':{'Ink':['#000000','#ffffff'],'Red on black':['#000000','#383838','#ff0000','#ffffff'],'Paper':['#f4efe1','#14110f'],'Amber':['#0d0600','#5a2b00','#ff9a1f','#ffe2a8']},
  'Earth':{'Parchment':['#2b1d12','#8a5a3a','#c9a27a','#e8dcc0'],'Pink on gray':['#808080','#ff6fae','#ffffff']}
};
const palParse=txt=>{
  const out=[];
  for(const ln of String(txt).split(/\r?\n/)){
    let m=ln.match(/^\s*#?([0-9a-fA-F]{6})\s*$/);
    if(m){out.push('#'+m[1].toLowerCase());continue;}
    m=ln.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(\s|$)/);   // .gpl row
    if(m)out.push(rgbHex([+m[1],+m[2],+m[3]]));
  }
  return out.slice(0,16);
};
const palHex=a=>a.map(h=>h.replace('#','')).join('\n');
const palGpl=(a,name='n0ise')=>`GIMP Palette\nName: ${name}\nColumns: 4\n#\n`+a.map((h,i)=>{const c=hexRGB(h);return `${String(c[0]).padStart(3)} ${String(c[1]).padStart(3)} ${String(c[2]).padStart(3)}\tcolor ${i+1}`;}).join('\n')+'\n';
/* ordered cycling and color depth are plain array ops */
const palCycle=(a,n=1)=>a.map((_,i)=>a[((i+n)%a.length+a.length)%a.length]);
const palDepth=(a,levels)=>levels>=a.length?a:Array.from({length:levels},(_,i)=>a[Math.round(i*(a.length-1)/Math.max(1,levels-1))]);

const GLYPH_SETS={
  ramp:' .\'`^",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  letters:' hti',binary:' 10CE1',blocks:' ░▒▓█',dots:' ·:+*#',braille:' ⠁⠃⠇⠧⠷⠿⣿'
};
const GLYPH={cache:{},
  /* atlas of N glyphs sorted by ink coverage, one row, each cell 16x16 */
  atlas(chars,font='bold 14px "JetBrains Mono",monospace'){
    const key=chars+font;if(this.cache[key])return this.cache[key];
    const cell=16,list=[...new Set([...chars])],cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
    cv.width=cell;cv.height=cell;const cov=list.map(ch=>{cx.clearRect(0,0,cell,cell);cx.fillStyle='#fff';cx.font=font;cx.textAlign='center';cx.textBaseline='middle';cx.fillText(ch,cell/2,cell/2+1);
      const d=cx.getImageData(0,0,cell,cell).data;let s=0;for(let i=3;i<d.length;i+=4)s+=d[i];return [ch,s];}).sort((a,b)=>a[1]-b[1]);
    const at=document.createElement('canvas');at.width=cell*cov.length;at.height=cell;const ag=at.getContext('2d');ag.fillStyle='#fff';ag.font=font;ag.textAlign='center';ag.textBaseline='middle';
    cov.forEach(([ch],i)=>ag.fillText(ch,i*cell+cell/2,cell/2+1));
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,at);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return this.cache[key]={tex,n:cov.length};
  }
};
/* GLSL side of the libs: OKLab palette match, paper, noise, masks */
const GLSL_LIB=`
uniform vec3 uPal[16];uniform int uPalN;
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 rgb2ok(vec3 c){float l=.4122214708*c.r+.5363325363*c.g+.0514459929*c.b,m=.2119034982*c.r+.6806995451*c.g+.1073969566*c.b,s=.0883024619*c.r+.2817188376*c.g+.6299787005*c.b;
  l=pow(max(l,0.),1./3.);m=pow(max(m,0.),1./3.);s=pow(max(s,0.),1./3.);
  return vec3(.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s);}
vec3 palNearest(vec3 c){vec3 k=rgb2ok(c);float bd=1e9;vec3 best=uPal[0];for(int i=0;i<16;i++){if(i>=uPalN)break;vec3 d=rgb2ok(uPal[i])-k;float e=dot(d,d);if(e<bd){bd=e;best=uPal[i];}}return best;}
vec3 palRamp(float t){float x=clamp(t,0.,.9999)*float(max(uPalN,1));return uPal[int(x)];}
vec3 palSmooth(float t){float n=float(max(uPalN-1,1));float x=clamp(t,0.,1.)*n;int i=int(floor(x));int j=min(i+1,uPalN-1);return mix(uPal[i],uPal[j],fract(x));}
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+17.1;a*=.5;}return s;}
vec2 curl(vec2 p){float e=.02;return vec2(vnoise(p+vec2(0.,e))-vnoise(p-vec2(0.,e)),-(vnoise(p+vec2(e,0.))-vnoise(p-vec2(e,0.))))/(2.*e);}
vec3 paperLook(vec2 px,vec3 base,float grain,float fiber){
  float g=vnoise(px*.9)*.55+vnoise(px*2.7)*.45;
  float f=vnoise(vec2(px.x*.05,px.y*1.4))*vnoise(vec2(px.x*1.2,px.y*.04));
  return base*(1.-grain*.3*(g-.5)*2.)*(1.-fiber*.35*f);}
vec2 sobel(sampler2D t,vec2 uv,vec2 d){
  float a=luma(texture(t,uv+vec2(d.x,0.)).rgb)-luma(texture(t,uv-vec2(d.x,0.)).rgb);
  float b=luma(texture(t,uv+vec2(0.,d.y)).rgb)-luma(texture(t,uv-vec2(0.,d.y)).rgb);return vec2(a,b);}
float selMask(sampler2D t,vec2 uv,vec2 d,int mode,float thr){
  if(mode==1)return smoothstep(thr*.5,thr*.5+.08,length(sobel(t,uv,d)));
  if(mode==2)return smoothstep(thr-.04,thr+.04,luma(texture(t,uv).rgb));
  return 1.;}
`;

/* =====================================================================
   Shader-module framework: params schema -> uniforms -> inspector.
   param: {k,label,t:'r'|'c'|'b'|'color'|'pal',min,max,def,step,opts,sec,hero}
   ===================================================================== */
const F_SRCP=HEAD+`uniform sampler2D uSrc;uniform float uSrcAsp,uScrAsp;
void main(){float r=uScrAsp/uSrcAsp;vec2 s=r>1.?vec2(1.,1./r):vec2(r,1.);o=vec4(texture(uSrc,(vUv-.5)*s+.5).rgb,1.);}`;
function defineModule(d){
  const params=(d.colorBound?[{k:'orig',t:'b',label:'Original colors',def:true,sec:'Color'}]:[]).concat(d.params).map(p=>({t:'r',step:1,sec:'Main',...p}));
  const m={
    id:d.id,family:d.family,name:d.name,needsMask:!!d.needsMask,colorBound:!!d.colorBound,hideOnOrig:d.hideOnOrig||[],engine:d.engine||'gpu',hidden:d.hidden,params,
    defaultLook:d.defaultLook||{paper:'#ffffff',ink:'#000000',palette:null},
    get schema(){const secs=[];params.forEach(p=>{let s=secs.find(x=>x.label===p.sec);if(!s)secs.push(s={id:p.sec,label:p.sec,keys:[]});s.keys.push(p.k);});return{sections:secs,hero:params.filter(p=>p.hero).map(p=>p.k)};},
    defaults(){const o={};params.forEach(p=>{o[p.k]=Array.isArray(p.def)?p.def.slice():p.def;});return o;},
    prog:null,cache:{},
    build(frag,ps){const decl=ps.map(p=>p.t==='color'?`uniform vec3 u_${p.k};`:p.t==='pal'||p.t==='image'?'':p.t==='range2'?`uniform vec2 u_${p.k};`:p.t==='curve'?`uniform float u_${p.k}[5];`:`uniform float u_${p.k};`).join('\n');return HEAD+GLSL_LIB+'uniform sampler2D uSrc,uAux;uniform vec2 uRes;uniform float uTime,uSeed;\n'+decl+'\n'+frag;},
    render(inTex,ctx){
      let ent=null;
      if(d.dyn){
        const V0=ctx.params||(ctx.layer&&ctx.layer.params)||m.defaults(),dy=d.dyn(V0);let e=m.cache[dy.key];
        if(!e){e=m.cache[dy.key]={h:mkProgAsync(VS,m.build(dy.frag,params,d)),key:dy.key};m.fresh=true;}ent=e;
        if(ctx.sync&&!e.done){const s=e.h.force();if(s==='ok')e.done=1;else if(s==='err')e.done=2;}
        if(!ctx.sync&&e.done===1&&m.progKey!==dy.key){m.prog=e.h.prog;m.progKey=dy.key;}
        if(!e.done){const s=e.h.poll();if(s==='ok'){e.done=1;m.prog=e.h.prog;m.progKey=dy.key;}else if(s==='err'){e.done=2;m.err=e.h.err;toast('Effect didn’t compile: '+e.h.err.slice(0,80));}}
        if(ctx.sync&&e.done!==1){const c=PR.copy;bindRT(ctx.out);c.use();samp(c,'uT',0,inTex);draw();return;}
        if(!m.prog&&e.done!==1){/* very first program: nothing to show yet, so wait for it */
          for(let i=0;i<400&&!e.done;i++){const s=e.h.poll();if(s==='ok'){e.done=1;m.prog=e.h.prog;m.progKey=dy.key;}else if(s==='err'){e.done=2;break;}}
          if(!m.prog){const c=PR.copy;bindRT(ctx.out);c.use();samp(c,'uT',0,inTex);draw();return;}
        }
      }else if(!m.prog){
        const decl=params.map(p=>p.t==='color'?`uniform vec3 u_${p.k};`:p.t==='pal'||p.t==='image'?'':p.t==='range2'?`uniform vec2 u_${p.k};`:p.t==='curve'?`uniform float u_${p.k}[5];`:`uniform float u_${p.k};`).join('\n');
        try{m.prog=mkProg(VS,HEAD+GLSL_LIB+'uniform sampler2D uSrc,uAux;uniform vec2 uRes;uniform float uTime,uSeed;\n'+decl+'\n'+d.frag+(d.colorBound?'\nvoid main(){vec3 m=fx(vUv).rgb;if(u_orig>.5){vec2 t=1./uRes;vec3 s=(texture(uSrc,vUv).rgb*2.+texture(uSrc,vUv+vec2(t.x*3.,0.)).rgb+texture(uSrc,vUv-vec2(t.x*3.,0.)).rgb+texture(uSrc,vUv+vec2(0.,t.y*3.)).rgb+texture(uSrc,vUv-vec2(0.,t.y*3.)).rgb)/6.;vec3 ym=rgb2yiq(m),ys=rgb2yiq(s);float k=clamp(ym.x/max(ys.x,.06),0.,1.);m=yiq2rgb(vec3(ym.x,ys.yz*k));}o=vec4(clamp(m,0.,1.),1.);}':'\nvoid main(){o=vec4(fx(vUv).rgb,1.);}'));}
        catch(e){m.prog=null;throw new Error(d.id+' shader: '+String(e.message).split('\n').slice(0,3).join(' | '));}
      }
      const pr=(ctx.sync&&ent&&ent.h.prog)||m.prog,V=ctx.params||(ctx.layer&&ctx.layer.params)||m.defaults();
      bindRT(ctx.out);pr.use();samp(pr,'uSrc',0,inTex);
      ctx.inTex=inTex;pr.v2('uRes',ctx.W,ctx.H);pr.f('uTime',ctx.t);pr.f('uSeed',(ctx.layer?ctx.layer.seed:0)+(V.seed||0));
      for(const p of params){
        const v=V[p.k];
        if(p.t==='color'){const c=hexRGB(v||'#000000');pr.v3('u_'+p.k,c[0]/255,c[1]/255,c[2]/255);}
        else if(p.t==='pal'){const a=(v&&v.length?v:['#000000','#ffffff']).slice(0,16),buf=new Float32Array(48);a.forEach((h,i)=>{const c=hexRGB(h);buf[i*3]=c[0]/255;buf[i*3+1]=c[1]/255;buf[i*3+2]=c[2]/255;});pr.v3v('uPal',buf);pr.i('uPalN',a.length);}
        else if(p.t==='range2'){const a=v||p.def;pr.v2('u_'+p.k,a[0],a[1]);}
        else if(p.t==='curve'){pr.fv('u_'+p.k,new Float32Array(v||p.def));}
        else if(p.t==='image'){}
        else pr.f('u_'+p.k,p.t==='b'?(v?1:0):+v);
      }
      if(d.bind)d.bind(pr,V,ctx);
      draw();
      if(d.after)d.after(pr,V,ctx);
    },
    thumbnail(){return null;}
  };
  return registerModule(m);
}
/* =====================================================================
   Step 3 modules. Each has its own mechanism, params and default look.
   S = render scale so looks stay stable across quality settings.
   ===================================================================== */
const ADJ=[
  {k:'bri',label:'Brightness',min:-100,max:100,def:0,sec:'Adjustments'},{k:'con',label:'Contrast',min:-100,max:100,def:0,sec:'Adjustments'},
  {k:'sat',label:'Saturation',min:0,max:300,def:100,sec:'Adjustments'},{k:'mid',label:'Midtones',min:-100,max:100,def:0,sec:'Adjustments'},
  {k:'hi',label:'Highlights',min:-100,max:100,def:0,sec:'Adjustments'},{k:'hue',label:'Hue',min:-180,max:180,def:0,sec:'Adjustments'},
  {k:'shp',label:'Sharpen',min:0,max:100,def:0,sec:'Adjustments'},{k:'blr',label:'Blur',min:0,max:100,def:0,sec:'Adjustments'},{k:'dn',label:'Denoise',min:0,max:100,def:0,sec:'Adjustments'}
];
const GLSL_ADJ=`
vec3 adj(sampler2D t,vec2 uv,vec2 px){
  vec3 c=texture(t,uv).rgb;
  vec3 n=(texture(t,uv+vec2(px.x,0.)).rgb+texture(t,uv-vec2(px.x,0.)).rgb+texture(t,uv+vec2(0.,px.y)).rgb+texture(t,uv-vec2(0.,px.y)).rgb)*.25;
  c=mix(c,n,clamp(u_blr/100.+u_dn/200.,0.,1.));c+=(c-n)*u_shp/50.;
  c=hueRot(c,u_hue*PI/180.);float l=luma(c);c=vec3(l)+(c-l)*u_sat/100.;
  c=(c-.5)*(1.+u_con/100.)+.5+u_bri/200.;
  l=luma(c);c*=1.+u_mid/200.*(1.-abs(l*2.-1.))+u_hi/200.*smoothstep(.5,1.,l);
  return clamp(c,0.,1.);}
`;
const SS='#define S (uRes.y/600.)\n';

/* ---------- Dither ---------- */
const dith={gw:0,gh:0,rt:null,tex:null,buf:null};
/* error diffusion runs in a Worker; the shader keeps drawing the last finished result */
function diffuseCore(v,gw,gh,n,method){
  const out=new Uint8Array(gw*gh);
  const SA=[[2,0,32],[-3,1,12],[-1,1,26],[1,1,30],[3,1,16],[-2,2,12],[0,2,26],[2,2,12],[-3,3,5],[-1,3,12],[1,3,12],[3,3,5]],SL=[[1,0,2],[-1,1,1],[0,1,1]];
  const K=method===7?SA:SL,D=method===7?200:4;
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=y*gw+x,o=v[i],q=Math.max(0,Math.min(n-1,Math.round(o))),e=o-q;out[i]=q;
    for(let k=0;k<K.length;k++){const xx=x+K[k][0],yy=y+K[k][1];if(xx>=0&&xx<gw&&yy<gh)v[yy*gw+xx]+=e*K[k][2]/D;}
  }
  return out;
}
const dw={w:null,busy:false,res:null,fresh:false,failed:false};
function diffWorker(){
  if(dw.w||dw.failed)return dw.w;
  try{
    const src=diffuseCore.toString()+';onmessage=function(e){var d=e.data;var out=diffuseCore(d.v,d.gw,d.gh,d.n,d.m);postMessage({out:out,gw:d.gw,gh:d.gh},[out.buffer]);};';
    dw.w=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
    dw.w.onmessage=e=>{dw.res=e.data;dw.busy=false;dw.fresh=true;};
    dw.w.onerror=()=>{dw.failed=true;dw.w=null;dw.busy=false;};
  }catch(e){dw.failed=true;dw.w=null;}
  return dw.w;
}
function cpuDiffuse(inTex,W,H,cell,n,method,seed){
  const gw=Math.min(480,Math.max(8,Math.round(W/cell))),gh=Math.min(480,Math.max(8,Math.round(H/cell)));
  if(!dith.rt||dith.rt.w!==gw||dith.rt.h!==gh){if(dith.rt)freeRT(dith.rt);dith.rt=mkRT(gw,gh,{});dith.buf=new Uint8Array(gw*gh*4);}
  const worker=diffWorker();
  if(!dw.res||!worker||(!dw.busy&&true)){
    bindRT(dith.rt);PR.copy.use();samp(PR.copy,'uT',0,inTex);draw();
    gl.readPixels(0,0,gw,gh,gl.RGBA,gl.UNSIGNED_BYTE,dith.buf);
    const v=new Float32Array(gw*gh);for(let i=0;i<gw*gh;i++)v[i]=(.299*dith.buf[i*4]+.587*dith.buf[i*4+1]+.114*dith.buf[i*4+2])/255*(n-1);
    if(!dw.res||!worker){dw.res={out:diffuseCore(v,gw,gh,n,method),gw,gh};dw.fresh=true;}   /* first frame, or no Worker available */
    else{dw.busy=true;worker.postMessage({v,gw,gh,n,m:method},[v.buffer]);}
  }
  if(!dith.tex){dith.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,dith.tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
  gl.bindTexture(gl.TEXTURE_2D,dith.tex);
  if(dw.fresh){dw.fresh=false;gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,dw.res.gw,dw.res.gh,0,gl.RED,gl.UNSIGNED_BYTE,dw.res.out);}
  return dith.tex;
}
defineModule({colorBound:true,hideOnOrig:['pal'],id:'dither',family:'Bitmap',name:'Dither',
  defaultLook:{paper:'#9bbc0f',ink:'#0f380f',palette:'Gameboy'},
  params:[
    {k:'pal',t:'pal',label:'Palette',def:PALETTES.Handheld.Gameboy,sec:'Palette',hero:false},
    {k:'method',t:'c',label:'Method',opts:['Threshold','Bayer 4','Bayer 8','Blue-ish','White noise','Gradient noise','Halftone','Stevenson-Arce','Sierra Lite'],def:1,sec:'Threshold'},
    {k:'bias',label:'Threshold',min:-50,max:50,def:0,sec:'Threshold',hero:true},
    {k:'inv',t:'b',label:'Invert',def:false,sec:'Threshold'},
    {k:'con',label:'Contrast',min:-100,max:100,def:10,sec:'Threshold'},
    {k:'gam',label:'Gamma',min:30,max:250,def:100,sec:'Threshold'},
    {k:'cell',label:'Cell size',min:1,max:24,def:3,step:.5,sec:'Grid',hero:true},
    {k:'shape',t:'c',label:'Shape',opts:['Square','Round','Diamond'],def:0,sec:'Grid'},
    {k:'gain',label:'Dot gain',min:-50,max:100,def:0,sec:'Grid'},
    {k:'glow',label:'Glow',min:0,max:100,def:20,sec:'Glow'},
    {k:'seed',label:'Seed',min:0,max:999,def:1,sec:'Glow'}],
  frag:SS+`
float b2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
float b8(vec2 a){return b4(.5*a)*.25+b2(a);}
vec4 fx(vec2 uv){
  float cell=max(1.,u_cell*S);vec2 px=uv*uRes;vec2 g=floor(px/cell);vec2 cuv=(g+.5)*cell/uRes;
  vec3 c=texture(uSrc,cuv).rgb;float l=pow(clamp(luma(c),0.,1.),u_gam/100.);
  l=(l-.5)*(1.+u_con/50.)+.5+u_bias/100.;if(u_inv>.5)l=1.-l;l=clamp(l,0.,1.);
  int m=int(u_method+.5);float n=float(max(uPalN,2));float t=.5;
  if(m==1)t=b4(g);else if(m==2)t=b8(g);else if(m==3)t=ign(g*1.7+uSeed);else if(m==4)t=h21(g+uSeed);else if(m==5)t=ign(g);
  float v;
  if(m==6){
    vec2 f=fract(px/cell)-.5;float d=u_shape<.5?max(abs(f.x),abs(f.y))*2.:u_shape<1.5?length(f)*2.:(abs(f.x)+abs(f.y))*2.;
    float rad=sqrt(1.-l)*(1.+u_gain/100.)*(u_shape<.5?1.:1.15);v=d<rad?0.:1.;
  }else if(m>=7){v=texture(uAux,cuv).r*255./(n-1.);}
  else{ v=clamp((l*(n-1.)+(t-.5)*(1.+u_gain/100.))/(n-1.)+.0,0.,1.);v=floor(v*(n-1.)+.5)/(n-1.);}
  if(m<6&&m!=0){}
  if(m==0)v=floor(l*(n-1.)+.5)/(n-1.);
  vec3 col=uPal[int(clamp(floor(v*(n-1.)+.5),0.,n-1.))];
  float gv=0.;for(int i=0;i<6;i++){float a=float(i)*1.047;gv+=luma(texture(uSrc,uv+vec2(cos(a),sin(a))*6.*S/uRes).rgb);}
  col+=uPal[int(n)-1]*u_glow/100.*smoothstep(.45,1.,gv/6.)*.45;
  return vec4(col,1.);}`,
  bind(pr,V,ctx){
    const m=+V.method;
    if(m>=7){const n=Math.max(2,(V.pal||[]).length),cell=Math.max(1,V.cell*ctx.H/600);
      const tex=cpuDiffuse(ctx.inTex,ctx.W,ctx.H,cell,n,m,V.seed);
      bindRT(ctx.out);pr.use();samp(pr,'uSrc',0,ctx.inTex);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,tex);pr.i('uAux',1);}
  }});

/* ---------- ASCII ---------- */
defineModule({colorBound:true,hideOnOrig:['pal','usepal','transp','bg'],id:'ascii',family:'Glyph',name:'ASCII',
  defaultLook:{paper:'#000000',ink:'#ff0000',palette:'Red on black'},
  params:[
    {k:'pal',t:'pal',label:'Palette',def:PALETTES.Mono['Red on black'],sec:'Palette'},
    {k:'usepal',t:'b',label:'Use palette',def:true,sec:'Palette'},
    {k:'transp',t:'b',label:'Transparent background',def:false,sec:'Palette'},
    {k:'bg',t:'color',label:'Background color',def:'#000000',sec:'Palette'},
    {k:'depth',label:'Color depth',min:2,max:16,def:4,sec:'Palette'},
    {k:'set',t:'c',label:'Glyph set',opts:['Ramp','Letters (h t i)','Binary C E 1 0','Blocks','Dots'],def:0,sec:'Glyphs'},
    {k:'cell',label:'Cell size',min:4,max:40,def:10,sec:'Glyphs',hero:true},
    {k:'scan',label:'Scanline glow',min:0,max:100,def:35,sec:'Glyphs',hero:true},
    ...ADJ],
  frag:SS+GLSL_ADJ+`uniform float uGN;
vec4 fx(vec2 uv){
  float ch=u_cell*S,cw=ch*.55;vec2 px=uv*uRes;vec2 g=vec2(floor(px.x/cw),floor(px.y/ch));vec2 cuv=(g+.5)*vec2(cw,ch)/uRes;
  vec3 c=adj(uSrc,cuv,vec2(1.)/uRes*ch*.5);float l=luma(c);
  float idx=floor(clamp(l,0.,.999)*uGN);vec2 f=fract(px/vec2(cw,ch));
  float a=texture(uAux,vec2((idx+f.x)/uGN,f.y)).a;
  float n=float(min(uPalN,int(u_depth)));vec3 ink=u_usepal>.5?uPal[int(clamp(floor(l*n),0.,n-1.))]:c;
  if(u_usepal>.5&&l>.85)ink=uPal[uPalN-1];
  float sc=1.-u_scan/100.*.55*step(.5,fract(px.y/(ch*.25)));
  vec3 bg=u_transp>.5?texture(uSrc,uv).rgb*.25:u_bg;
  vec3 col=mix(bg,ink*sc,a);col+=ink*.25*u_scan/100.*a*a;
  return vec4(col,1.);}`,
  bind(pr,V){const sets=[GLYPH_SETS.ramp,GLYPH_SETS.letters,GLYPH_SETS.binary,GLYPH_SETS.blocks,GLYPH_SETS.dots],at=GLYPH.atlas(sets[+V.set]);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,at.tex);pr.i('uAux',1);pr.f('uGN',at.n);}});

/* ---------- Epsilon Glow ---------- */
defineModule({id:'epsilon',family:'Optical',name:'Epsilon Glow',
  defaultLook:{paper:'#101010',ink:'#ffb347',palette:null},
  params:[
    {k:'thr',label:'Threshold',min:0,max:100,def:62,sec:'Glow',hero:true},{k:'sm',label:'Threshold smoothing',min:0,max:100,def:30,sec:'Glow'},
    {k:'rad',label:'Radius',min:2,max:300,def:90,sec:'Glow',hero:true},{k:'int',label:'Intensity',min:0,max:500,def:140,sec:'Glow',hero:true},
    {k:'asp',label:'Aspect ratio',min:20,max:500,def:100,sec:'Shape'},{k:'dir',label:'Direction',min:0,max:180,def:0,sec:'Shape'},
    {k:'n',label:'Falloff n',min:1,max:6,def:2.2,step:.1,sec:'Falloff'},{k:'eps',label:'Epsilon',min:1,max:100,def:12,sec:'Falloff'},
    {k:'ds',label:'Distance scale',min:10,max:400,def:100,sec:'Falloff'},{k:'tint',t:'color',label:'Glow tint',def:'#ff9d3a',sec:'Glow'},{k:'tmix',label:'Tint amount',min:0,max:100,def:0,sec:'Glow'}],
  frag:SS+`vec4 fx(vec2 uv){
  vec3 base=texture(uSrc,uv).rgb;float R=u_rad*S/uRes.y;float th=u_thr/100.,sm=max(.01,u_sm/100.*.5);
  float ang=u_dir*PI/180.,ca=cos(ang),sa=sin(ang),asp=u_asp/100.,e=u_eps/100.,sc=u_ds/100.;vec3 acc=vec3(0.);float wsum=0.;
  for(int i=0;i<40;i++){
    float fi=float(i)+.5,r=sqrt(fi/40.),a=fi*2.39996;vec2 d=vec2(cos(a),sin(a))*r;
    vec2 o=vec2(d.x*asp,d.y);o=vec2(o.x*ca-o.y*sa,o.x*sa+o.y*ca);
    vec2 suv=uv+o*R*vec2(uRes.y/uRes.x,1.);vec3 c=texture(uSrc,suv).rgb;float b=smoothstep(th-sm,th+sm,luma(c));
    float w=1./(e+pow(max(r*sc,.001),u_n));acc+=c*b*w;wsum+=w*.6;}
  vec3 gcol=acc/max(wsum,.001);gcol=mix(gcol,u_tint*luma(gcol)*1.6,u_tmix/100.);
  return vec4(base+gcol*u_int/100.*.35,1.);}`});

/* ---------- Orb Diffuse X ---------- */
defineModule({colorBound:true,hideOnOrig:['pal'],id:'orb',family:'Bitmap',name:'Orb Diffuse X',
  defaultLook:{paper:'#000000',ink:'#ff2a6d',palette:'Retro scan'},
  params:[
    {k:'pal',t:'pal',label:'Palette',def:PALETTES.Neon['Retro scan'],sec:'Palette'},
    {k:'count',label:'Orb count',min:20,max:240,def:90,sec:'Orbs',hero:true},{k:'size',label:'Orb size',min:10,max:200,def:80,sec:'Orbs',hero:true},
    {k:'int',label:'Intensity',min:0,max:300,def:130,sec:'Orbs'},{k:'rnd',label:'Random',min:0,max:100,def:25,sec:'Orbs'},
    {k:'off',label:'Offset',min:0,max:100,def:50,sec:'Orbs'},{k:'dir',label:'Direction',min:-90,max:90,def:12,sec:'Orbs'},
    {k:'ls',label:'Line scale',min:0,max:100,def:40,sec:'Scan bands'},{k:'bands',label:'Rainbow bands',min:1,max:40,def:9,sec:'Scan bands'},
    {k:'wave',label:'Wavy lines',min:0,max:100,def:35,sec:'Scan bands'},{k:'lt',label:'Luminance threshold',min:0,max:100,def:12,sec:'Orbs'}],
  frag:`vec4 fx(vec2 uv){
  float asp=uRes.x/uRes.y;float a=u_dir*PI/180.;vec2 p=(uv-.5)*vec2(asp,1.);p=vec2(p.x*cos(a)-p.y*sin(a),p.x*sin(a)+p.y*cos(a));
  p.x+=sin(p.y*14.+uTime*.6)*u_wave/100.*.025;
  float n=u_count;vec2 q=p*n;vec2 g=floor(q);float row=g.y;q.x+=mod(row,2.)*u_off/100.;g=floor(q);
  vec2 jr=(h22(g+uSeed)-.5)*u_rnd/100.;vec2 f=fract(q)-.5-jr*.5;
  vec2 cuv=((g+.5+jr*.5)/n);cuv=vec2(cuv.x*cos(-a)-cuv.y*sin(-a),cuv.x*sin(-a)+cuv.y*cos(-a));cuv=cuv/vec2(asp,1.)+.5;
  float l=luma(texture(uSrc,clamp(cuv,0.,1.)).rgb);l=max(0.,l-u_lt/100.)/max(.05,1.-u_lt/100.);
  float r=u_size/200.*sqrt(l);float d=length(f);float orb=exp(-pow(d/max(r,.01),2.)*1.6)*step(.001,l);
  float band=fract(uv.y*u_bands+sin(uv.x*3.+uTime*.2)*.1+uTime*.05);vec3 col=palSmooth(band);
  float lines=1.-u_ls/100.*.6*step(.5,fract(uv.y*uRes.y/(3.*(uRes.y/600.))));
  return vec4(col*orb*u_int/100.*lines,1.);}`});

/* ---------- Line Modulation ---------- */
defineModule({colorBound:true,hideOnOrig:['ink','bg'],id:'linemod',family:'Modulation',name:'Line Modulation',
  defaultLook:{paper:'#000000',ink:'#d8ff3a',palette:null},
  params:[
    {k:'ink',t:'color',label:'Line color',def:'#d8ff3a',sec:'Lines'},{k:'bg',t:'color',label:'Background',def:'#050605',sec:'Lines'},
    {k:'lines',label:'Line count',min:20,max:300,def:130,sec:'Lines',hero:true},{k:'th',label:'Thickness',min:10,max:300,def:80,sec:'Lines',hero:true},
    {k:'wob',label:'Wobble',min:0,max:100,def:35,sec:'Motion',hero:true},{k:'wf',label:'Wobble frequency',min:1,max:60,def:14,sec:'Motion'},
    {k:'spd',label:'Speed',min:0,max:100,def:25,sec:'Motion'},{k:'glow',label:'Glow',min:0,max:100,def:65,sec:'Glow'},{k:'inv',t:'b',label:'Invert',def:false,sec:'Lines'}],
  frag:`vec4 fx(vec2 uv){
  float n=u_lines,y=uv.y*n,row=floor(y),fy=fract(y)-.5;
  float xw=uv.x+sin(uv.y*u_wf+row*.7+uTime*u_spd/20.)*u_wob/100.*.02;
  float yc=(row+.5)/n;float l=luma(texture(uSrc,vec2(xw,yc)).rgb);if(u_inv>.5)l=1.-l;
  float half_=l*u_th/200.+.02;float d=abs(fy+sin(xw*u_wf*1.7+row+uTime*u_spd/12.)*u_wob/100.*.12);
  float line=smoothstep(half_,half_-.12,d);float gl=exp(-max(0.,d-half_)*7.)*l*u_glow/100.*.6;
  return vec4(u_bg+u_ink*(line+gl),1.);}`});
/* =====================================================================
   Step 4a: print modules.
   ===================================================================== */
const PAPER=[
  {k:'paper',t:'color',label:'Paper color',def:'#f2ead3',sec:'Paper'},
  {k:'pgrain',label:'Paper grain',min:0,max:100,def:40,sec:'Paper'},
  {k:'pfib',label:'Fiber strength',min:0,max:100,def:25,sec:'Paper'}];
const GEN=[
  {k:'con',label:'Contrast',min:-100,max:100,def:0,sec:'General'},{k:'gam',label:'Gamma',min:30,max:250,def:100,sec:'General'},
  {k:'inv',t:'b',label:'Invert',def:false,sec:'General'}];
const GLSL_GEN=`vec3 gen(vec3 c){c=pow(clamp(c,0.,1.),vec3(u_gam/100.));c=(c-.5)*(1.+u_con/100.)+.5;if(u_inv>.5)c=1.-c;return clamp(c,0.,1.);}
vec2 rot2(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(p.x*c-p.y*s,p.x*s+p.y*c);}`;

/* ---------- CMYK Print ---------- */
defineModule({colorBound:true,hideOnOrig:['paper'],id:'cmyk',family:'Print',name:'CMYK Print',
  defaultLook:{paper:'#f2ead3',ink:'#1d1d1b',palette:'CMYK on cream'},
  params:[
    {k:'pitch',label:'Screen pitch',min:3,max:40,def:9,step:.5,sec:'Screen',hero:true},{k:'gain',label:'Dot gain',min:-50,max:100,def:20,sec:'Screen',hero:true},
    {k:'wob',label:'Dot wobble',min:0,max:100,def:20,sec:'Screen'},{k:'rough',label:'Dot roughness',min:0,max:100,def:25,sec:'Screen'},
    {k:'ink',label:'Ink density',min:20,max:160,def:100,sec:'Ink'},
    {k:'mc',label:'Misregistration C',min:0,max:100,def:25,sec:'Misregistration'},{k:'mm',label:'Misregistration M',min:0,max:100,def:35,sec:'Misregistration'},
    {k:'my',label:'Misregistration Y',min:0,max:100,def:15,sec:'Misregistration'},{k:'mk',label:'Misregistration K',min:0,max:100,def:5,sec:'Misregistration'},
    ...PAPER,
    {k:'soft',label:'Scan softness',min:0,max:100,def:20,sec:'Scan'},{k:'stex',label:'Scan texture',min:0,max:100,def:30,sec:'Scan'},
    ...GEN],
  frag:SS+GLSL_GEN+`
float cov(vec2 px,float ang,float pitch,vec2 off,float dens,float seed){
  vec2 p=rot2(px+off,ang)/pitch;vec2 g=floor(p),f=fract(p)-.5;
  f+=(h22(g+seed)-.5)*u_wob/100.*.35;
  float r=sqrt(clamp(dens,0.,1.))*.62*(1.+u_gain/100.);
  float e=vnoise(f*9.+g)*u_rough/100.*.25;
  return smoothstep(.06,-.06,length(f)-r+e);}
vec3 samp3(vec2 px,float ang,float pitch,vec2 off){vec2 p=rot2(px+off,ang)/pitch;vec2 c=(floor(p)+.5);vec2 q=rot2(c*pitch,-ang)-off;return gen(texture(uSrc,q/uRes).rgb);}
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;float P=u_pitch*S;float o=u_soft/100.*2.5;
  vec3 col=paperLook(px/S,u_paper,u_pgrain/100.,u_pfib/100.);
  float ang[4]=float[4](.2618,1.309,0.,.7854);float ms[4]=float[4](u_mc,u_mm,u_my,u_mk);
  vec3 inks[4]=vec3[4](vec3(.0,.62,.80),vec3(.90,.0,.48),vec3(1.,.93,.0),vec3(.11,.1,.1));
  for(int i=0;i<4;i++){
    vec2 off=(h22(vec2(float(i)*3.1,uSeed))-.5)*ms[i]/100.*P*1.2;
    vec3 c=samp3(px,ang[i],P,off);
    float k=1.-max(c.r,max(c.g,c.b));float d;
    if(i==3)d=k;else{float kk=min(k,.999);vec3 cmy=(1.-c-kk)/(1.-kk);d=i==0?cmy.r:i==1?cmy.g:cmy.b;d*=1.-.5*k;}
    float cv=cov(px,ang[i],P,off,max(d,0.),float(i)+uSeed)*u_ink/100.;
    col*=mix(vec3(1.),inks[i],clamp(cv,0.,1.));
  }
  col*=1.-u_stex/100.*.12*step(.5,fract(px.y/(2.*S)))*vnoise(px*.4);
  return vec4(col,1.);}`});

/* ---------- Shape Halftone ---------- */
const SHAPES=['Circle','Square','Smiley','Arrow','Bar','Star','Cross','Diamond'];
const chP=(c,col,ang,shape)=>[
  {k:'sh'+c,t:'c',label:'Shape '+c.toUpperCase(),opts:SHAPES,def:shape,sec:'Screen '+c.toUpperCase()},
  {k:'an'+c,label:'Angle '+c.toUpperCase(),min:0,max:180,def:ang,sec:'Screen '+c.toUpperCase()},
  {k:'ik'+c,t:'color',label:'Ink '+c.toUpperCase(),def:col,sec:'Screen '+c.toUpperCase()},
  {k:'in'+c,label:'Intensity '+c.toUpperCase(),min:0,max:200,def:100,sec:'Screen '+c.toUpperCase()}];
defineModule({colorBound:true,hideOnOrig:['ikr','ikg','ikb','paper'],id:'shapes',family:'Print',name:'Shape Halftone',
  defaultLook:{paper:'#000000',ink:'#ff3b30',palette:null},
  params:[
    ...chP('r','#ff3b30',15,0),...chP('g','#34ff5a',75,2),...chP('b','#ff2d95',45,5),
    {k:'mode',t:'c',label:'Ink mode',opts:['Additive','Multiply','Subtractive'],def:0,sec:'Ink'},
    {k:'curve',t:'curve',label:'Ink curve',def:[0,.25,.5,.75,1],sec:'Ink curve'},
    {k:'thr',t:'range2',label:'Threshold range',min:0,max:100,def:[6,100],sec:'Threshold range'},
    {k:'cell',label:'Cell size',min:4,max:48,def:18,sec:'Cells',hero:true},{k:'spread',label:'Size spread',min:0,max:100,def:20,sec:'Cells'},
    {k:'gain',label:'Dot gain',min:-50,max:100,def:10,sec:'Cells',hero:true},{k:'glow',label:'Glow',min:0,max:100,def:35,sec:'Cells'},
    {k:'exp',label:'Exposure',min:-100,max:100,def:10,sec:'Cells'},{k:'mis',label:'Misregistration',min:0,max:100,def:20,sec:'Cells'},
    {k:'paper',t:'color',label:'Paper color',def:'#050505',sec:'Paper'},{k:'pgrain',label:'Paper grain',min:0,max:100,def:20,sec:'Paper'},...GEN],
  frag:SS+GLSL_GEN+`
float shp(vec2 p,int t,float r){
  if(t==0)return smoothstep(.04,-.04,length(p)-r);
  if(t==1)return smoothstep(.04,-.04,max(abs(p.x),abs(p.y))-r*.85);
  if(t==7)return smoothstep(.04,-.04,abs(p.x)+abs(p.y)-r*1.1);
  if(t==4)return smoothstep(.04,-.04,max(abs(p.y)-r*.35,abs(p.x)-.48));
  if(t==6){float a=max(abs(p.x)-r*.28,abs(p.y)-r*.9),b=max(abs(p.y)-r*.28,abs(p.x)-r*.9);return smoothstep(.04,-.04,min(a,b));}
  if(t==5){float a=atan(p.y,p.x),k=cos(a*5.)*.5+.5;return smoothstep(.04,-.04,length(p)-r*(.55+.5*k));}
  if(t==3){vec2 q=p;float head=max(abs(q.y)-(.5-q.x)*.7*r*1.2,q.x-.5*r*1.1);float stem=max(abs(q.y)-r*.2,max(q.x-.1,-q.x-r*.9));return smoothstep(.04,-.04,min(head,stem));}
  float ring=abs(length(p)-r*.8)-r*.08;float ex=min(length(p-vec2(-.3,.25)*r*1.2),length(p-vec2(.3,.25)*r*1.2))-r*.11;
  float mo=max(abs(length(p-vec2(0.,.05)*r)-r*.5)-r*.07,-(p.y+.02*r)-.0);return smoothstep(.04,-.04,min(min(ring,ex),mo));}
float curve(float x){float f=clamp(x,0.,1.)*4.;int i=int(min(floor(f),3.));float t=fract(f);if(i==3)t=f-3.;t=t*t*(3.-2.*t);return mix(u_curve[i],u_curve[i+1],t);}
vec3 chan(vec2 px,int ch,float ang,int shape,float val,vec2 off,vec3 ink,float inten,float seed){
  vec2 p=rot2(px+off,ang)/(u_cell*S);vec2 g=floor(p),f=fract(p)-.5;
  vec2 c=rot2((g+.5)*u_cell*S,-ang)-off;float v=ch==0?gen(texture(uSrc,c/uRes).rgb).r:ch==1?gen(texture(uSrc,c/uRes).rgb).g:gen(texture(uSrc,c/uRes).rgb).b;
  v=curve(clamp(v+u_exp/200.,0.,1.));float on=smoothstep(u_thr.x/100.-.02,u_thr.x/100.+.02,v)*step(v,u_thr.y/100.+.01);
  float r=sqrt(v)*.5*(1.+u_gain/100.)*(1.+(h21(g+seed)-.5)*u_spread/100.);
  return ink*shp(f,shape,r)*on*inten/100.;}
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;float m=u_mis/100.*u_cell*S*.6;
  vec3 a=chan(px,0,radians(u_anr),int(u_shr+.5),0.,(h22(vec2(1.,uSeed))-.5)*m,u_ikr,u_inr,1.+uSeed);
  vec3 b=chan(px,1,radians(u_ang),int(u_shg+.5),0.,(h22(vec2(2.,uSeed))-.5)*m,u_ikg,u_ing,2.+uSeed);
  vec3 c=chan(px,2,radians(u_anb),int(u_shb+.5),0.,(h22(vec2(3.,uSeed))-.5)*m,u_ikb,u_inb,3.+uSeed);
  vec3 sum=a+b+c;vec3 paper=paperLook(px/S,u_paper,u_pgrain/100.,0.);vec3 col;
  if(u_mode<.5)col=paper+sum;
  else if(u_mode<1.5)col=paper*(1.-clamp(sum,0.,1.));
  else col=paper*(1.-clamp(sum,0.,1.)*.9);
  col+=sum*sum*u_glow/100.*.8;
  return vec4(col,1.);}`});

/* ---------- Stipple Print ---------- */
defineModule({colorBound:true,hideOnOrig:['inkc','paper'],id:'stipple',family:'Print',name:'Stipple Print',
  defaultLook:{paper:'#f4efe1',ink:'#14110f',palette:'Paper'},
  params:[
    {k:'sp',label:'Stipple spacing',min:2,max:30,def:6,step:.5,sec:'Dots',hero:true},{k:'dens',label:'Density',min:10,max:300,def:140,sec:'Dots',hero:true},
    {k:'ds',label:'Dot scale',min:20,max:200,def:90,sec:'Dots'},{k:'irr',label:'Dot irregularity',min:0,max:100,def:45,sec:'Dots'},
    {k:'edge',label:'Edge emphasis',min:0,max:100,def:35,sec:'Dots'},{k:'bleed',label:'Ink bleed',min:0,max:100,def:35,sec:'Ink'},
    {k:'ivar',label:'Ink variation',min:0,max:100,def:30,sec:'Ink'},{k:'inkc',t:'color',label:'Ink color',def:'#14110f',sec:'Ink'},
    {k:'paper',t:'color',label:'Paper color',def:'#f4efe1',sec:'Paper'},{k:'pgrain',label:'Paper grain',min:0,max:100,def:45,sec:'Paper'},
    {k:'pfib',label:'Fiber strength',min:0,max:100,def:40,sec:'Paper'},{k:'pfs',label:'Fiber scale',min:20,max:300,def:100,sec:'Paper'}],
  frag:SS+`
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;float P=u_sp*S;vec2 g=floor(px/P);float cov=0.,var_=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 cg=g+vec2(float(i),float(j));vec2 h=h22(cg+uSeed);vec2 pt=(cg+.5+(h-.5)*(.35+u_irr/100.*.6))*P;
    vec2 tuv=pt/uRes;float l=luma(texture(uSrc,tuv).rgb);
    float e=length(sobel(uSrc,tuv,vec2(1.5*S)/uRes))*u_edge/100.*3.;
    float want=clamp((1.-l)*u_dens/100.+e,0.,1.5);float on=step(h21(cg*1.7+uSeed),want);
    float r=P*.5*u_ds/100.*(.55+.6*sqrt(clamp(want,0.,1.)))*(.85+.3*h21(cg+9.));
    float d=length(px-pt);float soft=1.+u_bleed/100.*3.;
    float dot_=on*smoothstep(r*soft*.9,r*.55,d);cov=max(cov,dot_);var_+=on*h21(cg+4.)*step(d,r);
  }
  cov=smoothstep(.25,.75,cov+u_bleed/100.*.12*cov);cov*=1.-u_ivar/100.*.35*vnoise(px*.7);
  vec3 paper=paperLook(px/(S*u_pfs/100.),u_paper,u_pgrain/100.,u_pfib/100.);
  return vec4(mix(paper,u_inkc,clamp(cov,0.,1.)),1.);}`});
/* =====================================================================
   Step 4b: structure modules (quadtree, displacement, bead matrix).
   ===================================================================== */
/* ---------- Pixelmania: adaptive pixel merge ---------- */
defineModule({id:'pixelmania',family:'Structure',name:'Pixelmania',
  defaultLook:{paper:'#1b1b1b',ink:'#ffffff',palette:null},
  params:[
    {k:'cell',label:'Cell size',min:2,max:32,def:6,step:.5,sec:'Cells',hero:true},{k:'maxm',t:'c',label:'Max merge',opts:['2 × 2','4 × 4','8 × 8'],def:2,sec:'Cells'},
    {k:'below',label:'Merge below',min:0,max:100,def:22,sec:'Merge',hero:true},{k:'above',label:'Merge above',min:0,max:100,def:0,sec:'Merge'},
    {k:'medge',t:'b',label:'Merge on edges',def:true,sec:'Edges'},{k:'esz',label:'Edges merge size',min:0,max:3,def:1,sec:'Edges'},
    {k:'ecol',t:'color',label:'Edge tile color',def:'#ff9a1f',sec:'Edges'},{k:'eblend',t:'c',label:'Edge blend',opts:['Normal','Darken','Multiply','Screen'],def:1,sec:'Edges'},
    {k:'lw',label:'Tile line width',min:0,max:6,def:1,step:.25,sec:'Tiles'},{k:'lcol',t:'color',label:'Tile line color',def:'#0b0b0b',sec:'Tiles'},
    {k:'bev',label:'Bevel highlight',min:0,max:100,def:45,sec:'Tiles',hero:true},
    {k:'lv',label:'Color levels',min:2,max:32,def:12,sec:'Color'},{k:'cm',t:'c',label:'Color mode',opts:['Image','Palette'],def:0,sec:'Color'},
    {k:'pal',t:'pal',label:'Palette',def:PALETTES.Earth.Parchment,sec:'Color'}],
  frag:SS+`
vec3 avgBlock(vec2 org,float bs,out float var){
  vec3 m=vec3(0.),m2=vec3(0.);
  for(int j=0;j<4;j++)for(int i=0;i<4;i++){vec3 c=texture(uSrc,(org+(vec2(float(i),float(j))+.5)*bs/4.)/uRes).rgb;m+=c;m2+=c*c;}
  m/=16.;var=dot(m2/16.-m*m,vec3(.333))*60.;return m;}
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;float cell=u_cell*S;int ml=int(u_maxm+.5)+1;
  float bsel=cell;vec3 col=vec3(0.);float lvl=0.;
  vec2 e0=sobel(uSrc,uv,vec2(2.*S)/uRes);bool edge=length(e0)>.12;
  for(int k=3;k>=0;k--){
    if(k>=ml)continue;float bs=cell*exp2(float(k));vec2 org=floor(px/bs)*bs;float var;vec3 m=avgBlock(org,bs,var);
    float vv=var*100.;bool ok=vv<u_below&&(u_above<.5||vv>u_above);
    bool eb=u_medge>.5&&length(sobel(uSrc,(org+bs*.5)/uRes,vec2(bs*.5)/uRes))>.12;
    if(eb)ok=k<=int(u_esz+.5);
    if(ok||k==0){bsel=bs;col=m;lvl=float(k);break;}
  }
  vec2 org=floor(px/bsel)*bsel;vec2 f=(px-org)/bsel;
  float lv=u_lv;col=floor(col*lv+.5)/lv;if(u_cm>.5)col=palNearest(col);
  vec2 ed=min(f,1.-f)*bsel;float dl=min(ed.x,ed.y);
  bool isEdgeTile=length(sobel(uSrc,(org+bsel*.5)/uRes,vec2(bsel*.5)/uRes))>.12;
  if(isEdgeTile){int bm=int(u_eblend+.5);col=bm==0?u_ecol:bm==1?min(col,u_ecol):bm==2?col*u_ecol:1.-(1.-col)*(1.-u_ecol);}
  float bv=u_bev/100.;col+=bv*.35*smoothstep(bsel*.18,0.,f.x*bsel)*step(f.y,1.-f.x+.0)*.0;
  float hi=smoothstep(bsel*.16,0.,min(f.x,f.y)*bsel),sh=smoothstep(bsel*.16,0.,min(1.-f.x,1.-f.y)*bsel);
  col+=bv*(.35*hi-.35*sh);
  col=mix(col,u_lcol,smoothstep(u_lw*S,u_lw*S-1.,dl)*step(.01,u_lw));
  return vec4(col,1.);}`});

/* ---------- DisplacePRO ---------- */
defineModule({id:'displace',family:'Warp',name:'DisplacePRO',
  defaultLook:{paper:'#000000',ink:'#ffffff',palette:null},
  params:[
    {k:'dmode',t:'c',label:'Map mode',opts:['Gradient','Luma','Noise','Image'],def:1,sec:'Displacement map'},
    {k:'dstr',label:'Strength',min:0,max:100,def:25,sec:'Displacement map',hero:true},{k:'dscale',label:'Scale',min:1,max:60,def:6,sec:'Displacement map'},
    {k:'dgam',label:'Gamma',min:30,max:250,def:100,sec:'Displacement map'},{k:'dcon',label:'Contrast',min:-100,max:100,def:0,sec:'Displacement map'},
    {k:'dinv',t:'b',label:'Invert',def:false,sec:'Displacement map'},{k:'img',t:'image',label:'Map image',sec:'Displacement map'},
    {k:'flow',label:'Flow warp',min:0,max:100,def:30,sec:'Flow warp',hero:true},{k:'fsc',label:'Flow scale',min:1,max:20,def:3,step:.5,sec:'Flow warp'},{k:'fsp',label:'Flow speed',min:0,max:100,def:20,sec:'Flow warp'},
    {k:'ebm',t:'c',label:'Bend mode',opts:['Push out','Pull in','Swirl'],def:0,sec:'Edge bend'},{k:'eamt',label:'Bend amount',min:0,max:100,def:35,sec:'Edge bend'},
    {k:'ebw',label:'Border width',min:1,max:40,def:12,sec:'Edge bend'},{k:'ewrap',t:'c',label:'Edge wrap',opts:['Transparent','Clamp','Mirror'],def:2,sec:'Edge bend'},
    {k:'twirl',label:'Twirl',min:-100,max:100,def:0,sec:'Twirl & pinch'},{k:'pinch',label:'Pinch',min:-100,max:100,def:0,sec:'Twirl & pinch'},
    {k:'shat',label:'Glass shatter',min:0,max:100,def:0,sec:'Glass shatter'},{k:'shn',label:'Shard count',min:3,max:40,def:12,sec:'Glass shatter'},
    {k:'bjit',label:'Band jitter',min:0,max:100,def:20,sec:'Bands'},{k:'bn',label:'Band count',min:4,max:120,def:30,sec:'Bands'},
    {k:'csp',label:'Chroma split',min:0,max:100,def:25,sec:'Chroma'},{k:'flip',t:'b',label:'Flip vertical',def:false,sec:'Chroma'}],
  bind(pr,V,ctx){const t=MAPIMG[ctx.layer&&ctx.layer.uid];pr.f('uHasImg',t?1:0);if(t){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,t);pr.i('uAux',1);}},
  frag:`uniform float uHasImg;
vec2 vor(vec2 p,out float edge){vec2 g=floor(p),f=fract(p);float d1=9.,d2=9.;vec2 id=g;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 o=vec2(float(i),float(j));vec2 r=o+h22(g+o+uSeed)-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;id=g+o;}else if(d<d2)d2=d;}edge=sqrt(d2)-sqrt(d1);return id;}
vec3 samp(vec2 uv){
  if(u_ewrap<.5&&(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.))return vec3(0.);
  if(u_ewrap>1.5)uv=1.-abs(1.-mod(uv,2.));else uv=clamp(uv,0.,1.);
  return texture(uSrc,uv).rgb;}
vec4 fx(vec2 uv){
  float asp=uRes.x/uRes.y;vec2 uvo=uv;if(u_flip>.5)uv.y=1.-uv.y;
  /* band jitter */
  float band=floor(uv.y*u_bn);uv.x+=(h21(vec2(band,floor(uTime*8.)+uSeed))-.5)*u_bjit/100.*.08*step(.7,h21(vec2(band*1.3,floor(uTime*3.))));
  /* displacement map */
  float m;int dm=int(u_dmode+.5);
  if(dm==0)m=uv.x;else if(dm==1)m=luma(texture(uSrc,uv).rgb);else if(dm==2)m=fbm(uv*u_dscale*vec2(asp,1.)+uSeed);else m=uHasImg>.5?luma(texture(uAux,fract(uv*u_dscale/6.)).rgb):fbm(uv*u_dscale*2.+7.);
  m=pow(clamp(m,0.,1.),u_dgam/100.);m=(m-.5)*(1.+u_dcon/100.)+.5;if(u_dinv>.5)m=1.-m;
  uv+=vec2(m-.5,fbm(uv*u_dscale+3.)-.5)*u_dstr/100.*.25*vec2(1.,asp>1.?1.:1.);
  /* flow warp */
  uv+=curl(uv*u_fsc*vec2(asp,1.)+uTime*u_fsp/50.)*u_flow/100.*.006;
  /* twirl & pinch */
  vec2 c=uv-.5;c.x*=asp;float r=length(c);float tw=u_twirl/100.*6.28*smoothstep(.7,0.,r);float a=atan(c.y,c.x)+tw;r=pow(r*1.4,1.+u_pinch/100.)/1.4;c=vec2(cos(a),sin(a))*r;c.x/=asp;uv=c+.5;
  /* edge bend */
  vec2 d=vec2(u_ebw)/uRes;vec2 sb=sobel(uSrc,uv,d);float el=length(sb);vec2 nrm=el>.001?sb/el:vec2(0.);
  float em=smoothstep(.02,.25,el)*u_eamt/100.*.06;
  vec2 bd=u_ebm<.5?nrm:u_ebm<1.5?-nrm:vec2(-nrm.y,nrm.x);uv+=bd*em;
  /* glass shatter */
  if(u_shat>.5){float ed;vec2 id=vor(uv*vec2(asp,1.)*u_shn,ed);uv+=(h22(id)-.5)*u_shat/100.*.08;float ln=smoothstep(.04,0.,ed);
    vec3 col=samp(uv);col+=ln*.35*u_shat/100.;return vec4(col,1.);}
  /* chroma split */
  vec2 cs=vec2(u_csp/100.*.02,0.);
  vec3 col=vec3(samp(uv+cs).r,samp(uv).g,samp(uv-cs).b);
  return vec4(col,1.);}`});

/* ---------- Pixel Crusher: LED bead matrix ---------- */
defineModule({colorBound:true,hideOnOrig:['pal','usepal'],id:'crusher',family:'Display',name:'Pixel Crusher',
  defaultLook:{paper:'#05010f',ink:'#ff2a6d',palette:'Video synth'},
  params:[
    {k:'pal',t:'pal',label:'Palette: Video synth',def:PALETTES.Neon['Video synth'],sec:'Color'},{k:'usepal',t:'b',label:'Use palette',def:true,sec:'Color'},
    {k:'hcyc',label:'Hue cycles',min:0,max:8,def:1.5,step:.1,sec:'Color'},
    {k:'px',label:'Pixel size',min:3,max:32,def:9,step:.5,sec:'Beads',hero:true},{k:'shape',t:'c',label:'Pixel shape',opts:['Soft bead','Square','Round','Diamond'],def:0,sec:'Beads'},
    {k:'asp',label:'Pixel aspect',min:50,max:200,def:100,sec:'Beads'},{k:'gap',label:'Pixel gap',min:0,max:80,def:25,sec:'Beads'},
    {k:'wob',label:'Line wobble',min:0,max:100,def:20,sec:'Signal'},{k:'wf',label:'Wave frequency',min:1,max:40,def:8,sec:'Signal'},{k:'wr',label:'Per-wave control',min:0,max:100,def:40,sec:'Signal'},
    {k:'smear',label:'Chroma smear',min:0,max:100,def:35,sec:'Signal',hero:true},{k:'err',label:'Pixel error',min:0,max:100,def:8,sec:'Signal'},{k:'disp',label:'Displace',min:0,max:100,def:10,sec:'Signal'},
    {k:'bc',label:'Black crush',min:0,max:100,def:20,sec:'Tone'},{k:'dl',label:'Dark lift',min:0,max:100,def:6,sec:'Tone'},{k:'ds',label:'Dark saturation',min:0,max:200,def:100,sec:'Tone'},
    {k:'blow',label:'Blowout',min:0,max:100,def:25,sec:'Tone'},{k:'sat',label:'Saturation',min:0,max:250,def:130,sec:'Tone'},{k:'wc',label:'White core',min:0,max:100,def:55,sec:'Tone'}],
  frag:SS+`
vec4 fx(vec2 uv){
  vec2 cs=vec2(u_px*S*u_asp/100.,u_px*S);vec2 px=uv*uRes;
  float row=floor(px.y/cs.y);px.x+=sin(row*u_wf*.3+uTime*2.)*u_wob/100.*cs.x*1.5*(1.+u_wr/100.*sin(row*.13));
  vec2 g=floor(px/cs);vec2 f=fract(px/cs)-.5;
  vec2 suv=((g+.5)*cs)/uRes;
  suv.x+=(h21(vec2(row,floor(uTime*6.)))-.5)*u_disp/100.*.03*step(.8,h21(vec2(row,3.)));
  vec3 c=vec3(0.);float w=0.;
  for(int i=0;i<6;i++){float k=exp(-float(i)*(1.2-u_smear/100.*.95));c+=texture(uSrc,suv-vec2(float(i)*cs.x/uRes.x,0.)).rgb*k;w+=k;}
  c/=w;
  float l=luma(c);
  if(u_usepal>.5){vec3 pc=palSmooth(fract(l*u_hcyc+uTime*.03+g.y*.0));c=mix(pc*(.35+l*.9),pc,0.);c=mix(c,hueRot(c,l*6.28*u_hcyc),.0);}
  else c=hueRot(c,l*6.28*u_hcyc*.25);
  float lm=luma(c);c=vec3(lm)+(c-lm)*(lm<.35?u_ds/100.:u_sat/100.);
  c=max(c-u_bc/100.*.25,0.)/(1.-u_bc/100.*.25)+u_dl/100.*.08;c*=1.+u_blow/100.*smoothstep(.55,1.,lm)*1.6;
  if(h21(g+floor(uTime*10.))<u_err/100.*.03)c=1.-c;
  float m;vec2 q=f*(1.+u_gap/100.*.9);int sh=int(u_shape+.5);
  if(sh==1)m=smoothstep(.5,.44,max(abs(q.x),abs(q.y)));
  else if(sh==2)m=smoothstep(.5,.44,length(q));
  else if(sh==3)m=smoothstep(.55,.48,abs(q.x)+abs(q.y));
  else m=exp(-dot(q,q)*7.);
  vec3 col=c*m;col+=vec3(1.)*u_wc/100.*pow(m,6.)*smoothstep(.4,1.,lm);
  return vec4(col*1.15,1.);}`});
/* =====================================================================
   Step 4c: pattern merge and multi threshold.
   ===================================================================== */
defineModule({colorBound:true,hideOnOrig:['dc','bg','tr'],id:'patmerge',family:'Pattern',name:'Pattern Merge',
  defaultLook:{paper:'#808080',ink:'#ff6fae',palette:'Pink on gray'},
  params:[
    {k:'style',t:'c',label:'Style',opts:['Rounded merge','Square merge','Ring'],def:0,sec:'Pattern'},
    {k:'sp',label:'Dot spacing',min:4,max:48,def:12,step:.5,sec:'Pattern',hero:true},{k:'size',label:'Dot size',min:10,max:100,def:46,sec:'Pattern',hero:true},
    {k:'round',label:'Merge roundness',min:0,max:100,def:55,sec:'Pattern'},{k:'rw',label:'Ring width',min:1,max:40,def:12,sec:'Pattern'},
    {k:'sel',t:'c',label:'Select',opts:['All','Edges','Luma'],def:1,sec:'Select'},{k:'thr',label:'Threshold',min:0,max:100,def:38,sec:'Select',hero:true},
    {k:'dc',t:'color',label:'Dot color',def:'#ff6fae',sec:'Color'},{k:'bg',t:'color',label:'Background',def:'#808080',sec:'Color'},
    {k:'tr',t:'b',label:'Transparent',def:true,sec:'Color'},{k:'dim',label:'Source dim',min:0,max:100,def:30,sec:'Color'}],
  frag:SS+`
float smin(float a,float b,float k){float h=max(k-abs(a-b),0.)/max(k,.0001);return min(a,b)-h*h*k*.25;}
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;float P=u_sp*S;vec2 g=floor(px/P);float d=1e3;int sel=int(u_sel+.5);float k=u_round/100.*P*.9;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 cg=g+vec2(float(i),float(j));vec2 c=(cg+.5)*P;vec2 cuv=c/uRes;
    float on=sel==0?1.:selMask(uSrc,cuv,vec2(2.*S)/uRes,sel,u_thr/100.);
    if(on<.5)continue;
    vec2 q=px-c;float r=P*.5*u_size/50.;
    float dd=u_style<1.5&&u_style>.5?max(abs(q.x),abs(q.y))-r*.9:length(q)-r;
    d=smin(d,dd,k);}
  if(u_style>1.5)d=abs(d+u_rw*.5*S)-u_rw*.5*S;
  float m=smoothstep(1.,-1.,d);
  vec3 src=texture(uSrc,uv).rgb;vec3 bg=u_tr>.5?src*(1.-u_dim/100.*.6):u_bg;
  return vec4(mix(bg,u_dc,m),1.);}`});

defineModule({colorBound:true,hideOnOrig:['blk','wht'],id:'multithr',family:'Bitmap',name:'Multi Threshold',
  defaultLook:{paper:'#ffffff',ink:'#000000',palette:'Ink'},
  params:[
    {k:'lvl',label:'Level',min:0,max:100,def:50,sec:'Threshold',hero:true},{k:'sm',label:'Smoothness',min:0,max:100,def:6,sec:'Threshold'},
    {k:'auto',t:'b',label:'Auto balance',def:true,sec:'Threshold'},{k:'ld',label:'Local detail',min:0,max:100,def:55,sec:'Threshold',hero:true},
    {k:'la',t:'b',label:'Line art',def:false,sec:'Line art'},{k:'lsens',label:'Line detail',min:0,max:100,def:50,sec:'Line art'},{k:'lwt',label:'Line weight',min:1,max:8,def:1.5,step:.25,sec:'Line art'},
    {k:'gr',label:'Grain',min:0,max:100,def:20,sec:'Texture'},{k:'grs',label:'Grain size',min:1,max:8,def:2,step:.5,sec:'Texture'},{k:'rough',label:'Rough edges',min:0,max:100,def:25,sec:'Texture'},
    {k:'blk',t:'color',label:'Black',def:'#050505',sec:'Colors'},{k:'wht',t:'color',label:'White',def:'#f7f3ea',sec:'Colors'},
    {k:'keep',t:'c',label:'Keep',opts:['Both','Black','White'],def:0,sec:'Colors'},
    {k:'ss',t:'b',label:'Show source',def:false,sec:'Source'},{k:'so',label:'Source opacity',min:0,max:100,def:35,sec:'Source'}],
  frag:SS+`
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;vec3 src=texture(uSrc,uv).rgb;float l=luma(src);
  float mean=0.;if(u_auto>.5){for(int j=0;j<4;j++)for(int i=0;i<4;i++)mean+=luma(texture(uSrc,(vec2(float(i),float(j))+.5)/4.).rgb);mean/=16.;}else mean=.5;
  float lm=0.;float R=22.*S;for(int i=0;i<12;i++){float a=float(i)*2.4;float r=R*sqrt((float(i)+.5)/12.);lm+=luma(texture(uSrc,uv+vec2(cos(a),sin(a))*r/uRes).rgb);}lm/=12.;
  float v=l-(lm-.5)*u_ld/100.*1.4;
  float lvl=u_lvl/100.+(mean-.5)*.8*(u_auto>.5?1.:0.);
  float n=(vnoise(px/(u_grs*S))-.5)*u_gr/100.*.5+(vnoise(px*.07/S)-.5)*u_rough/100.*.4;
  float sm=max(.004,u_sm/100.*.3);float t=smoothstep(lvl-sm,lvl+sm,v+n);
  vec3 col=mix(u_blk,u_wht,t);
  if(u_la>.5){vec2 e=sobel(uSrc,uv,vec2(u_lwt*S)/uRes);float ln=smoothstep(.2-u_lsens/100.*.17,.28-u_lsens/100.*.17,length(e)*2.);col=mix(col,u_blk,ln*step(.5,1.-u_keep*.0));}
  if(u_keep>.5&&u_keep<1.5)col=mix(src*(u_ss>.5?1.:0.),col,1.-t);
  else if(u_keep>1.5)col=mix(col,src*(u_ss>.5?1.:0.),1.-t*0.-0.);
  if(u_ss>.5)col=mix(col,src,u_so/100.*(u_keep<.5?1.:0.));
  return vec4(col,1.);}`});
/*CAMFX:BEGIN (generated by tools/gen_camfx.py from the n0ise camera app)*/
const CAMLIB="float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }\nfloat hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }\nfloat luma(vec3 c){ return dot(c,vec3(.299,.587,.114)); }\nvec3 hueRot(vec3 c,float a){ vec3 k=vec3(.57735); float cs=cos(a), sn=sin(a); return c*cs+cross(k,c)*sn+k*dot(k,c)*(1.-cs); }\nvec3 hpal(float h){ return .5+.5*cos(6.28318*(h+vec3(0.,.33,.67))); }\nvec2 mir(vec2 u){ return 1.-abs(1.-mod(u,2.)); }\nfloat edge(vec2 uv,float k){\n  vec2 p=k/u_res;\n  float tl=luma(vid(uv+p*vec2(-1.,1.))), t=luma(vid(uv+p*vec2(0.,1.))), tr=luma(vid(uv+p*vec2(1.,1.)));\n  float l=luma(vid(uv+p*vec2(-1.,0.))), r=luma(vid(uv+p*vec2(1.,0.)));\n  float bl=luma(vid(uv+p*vec2(-1.,-1.))), b=luma(vid(uv+p*vec2(0.,-1.))), br=luma(vid(uv+p*vec2(1.,-1.)));\n  float gx=-tl-2.*l-bl+tr+2.*r+br;\n  float gy=-tl-2.*t-tr+bl+2.*b+br;\n  return length(vec2(gx,gy));\n}\nvec3 heat(float t){\n  vec3 c=mix(vec3(0.,0.,.08),vec3(.25,0.,.65),smoothstep(0.,.2,t));\n  c=mix(c,vec3(.95,.08,.3),smoothstep(.2,.45,t));\n  c=mix(c,vec3(1.,.62,0.),smoothstep(.45,.7,t));\n  c=mix(c,vec3(1.,1.,.4),smoothstep(.7,.9,t));\n  return mix(c,vec3(1.),smoothstep(.9,1.,t));\n}\nvec3 firePal(float t){ return clamp(vec3(t*2.4,t*2.4-.8,t*2.4-1.7),0.,1.); }\nvec3 grade(vec3 c,vec3 sh,vec3 hi,float amt,float sat,float con){\n  c=clamp((c-.5)*con+.5,0.,1.);\n  float l=luma(c);\n  c+=(mix(sh,hi,l)-.5)*amt;\n  return mix(vec3(luma(c)),c,sat);\n}\nfloat vig(vec2 uv,float a,float b){ return smoothstep(a,b,length((uv-.5)*vec2(ASP,1.))); }";
const CAMFX=[{"id":"clean","label":"clean","cat":"color","c":"#e9e9ee","i":45,"m":40,"fn":"fx_clean","hist":false,"src":"vec3 fx_clean(vec2 uv){ vec3 c=vid(uv); c=(c-.5)*(1.+I*.18)+.5; return mix(vec3(luma(c)),c,1.+I*.25); }","dep":[]},{"id":"chrome","label":"chrome","cat":"color","c":"#ff5c8a","i":55,"m":45,"fn":"fx_chrome","hist":false,"src":"vec3 fx_chrome(vec2 uv){\n  vec2 d=uv-.5; float r=length(d); vec2 o=d*r*(.03+I*.09+M*.05);\n  vec3 c=vec3(vid(uv+o).r,vid(uv).g,vid(uv-o).b);\n  c=(c-.5)*(1.15+I*.6)+.5;\n  c=mix(vec3(luma(c)),c,1.35+I*1.4);\n  return hueRot(c,sin(u_time*.7+uv.y*3.)*M*.5);\n}","dep":[]},{"id":"aqua","label":"aqua","cat":"color","c":"#35e0ff","i":55,"m":45,"fn":"fx_aqua","hist":false,"src":"vec3 fx_aqua(vec2 uv){\n  vec3 c=vid(uv); float l=luma(c);\n  vec3 g=mix(vec3(0.,.08,.3),vec3(.6,1.,1.),smoothstep(0.,1.,l));\n  c=mix(c,g,.35+I*.55);\n  return hueRot(c,(M-.5)*1.6)*1.08;\n}","dep":[]},{"id":"solar","label":"solar","cat":"color","c":"#ffb02e","i":55,"m":45,"fn":"fx_solar","hist":false,"src":"vec3 fx_solar(vec2 uv){\n  vec3 c=vid(uv); float thr=.3+M*.4;\n  vec3 s=mix(c,1.-c,smoothstep(thr-.04,thr+.04,c));\n  s=hueRot(s,I*2.5+u_time*.1*M);\n  s=(s-.5)*(1.3+I)+.5;\n  return mix(c,s,.4+I*.6);\n}","dep":[]},{"id":"thermal","label":"thermal","cat":"color","c":"#ff5a1f","i":55,"m":45,"fn":"fx_thermal","hist":false,"src":"vec3 fx_thermal(vec2 uv){\n  float l=luma(vid(uv));\n  l=clamp((l-.5)*(1.3+I*1.2)+.5+(M-.5)*.5,0.,1.);\n  return heat(l);\n}","dep":[]},{"id":"duo","label":"duo","cat":"color","c":"#a35cff","i":60,"m":40,"fn":"fx_duo","hist":false,"src":"vec3 fx_duo(vec2 uv){\n  float l=luma(vid(uv)); l=clamp((l-.5)*(1.1+I)+.5,0.,1.);\n  return mix(hpal(M)*.22,hpal(M+.42),l);\n}","dep":[]},{"id":"tri","label":"tri","cat":"color","c":"#3ff0a0","i":60,"m":35,"fn":"fx_tri","hist":false,"src":"vec3 fx_tri(vec2 uv){\n  float l=luma(vid(uv)); l=clamp((l-.5)*(1.1+I*.9)+.5,0.,1.);\n  vec3 a=hpal(M)*.2, b=hpal(M+.33), c2=hpal(M+.66)*1.1+.1;\n  return l<.5?mix(a,b,l*2.):mix(b,c2,(l-.5)*2.);\n}","dep":[]},{"id":"neon","label":"neon","cat":"color","c":"#00ffd0","i":60,"m":50,"fn":"fx_neon","hist":false,"src":"vec3 fx_neon(vec2 uv){\n  vec3 c=vid(uv); float e=edge(uv,1.2+M*1.5);\n  vec3 g=hpal(luma(c)*.7+uv.x*.25+u_time*.05*(M+.2));\n  return c*c*.18*(1.-I*.6)+g*smoothstep(.08,.7,e)*(1.2+I*3.2);\n}","dep":[]},{"id":"fire","label":"fire","cat":"color","c":"#ff7a18","i":55,"m":55,"fn":"fx_fire","hist":false,"src":"vec3 fx_fire(vec2 uv){\n  vec2 w=vec2(sin(uv.y*22.+u_time*3.2),cos(uv.x*17.+u_time*2.6))*.008*(.3+M*2.);\n  w.y+=(hash21(floor(uv*40.)+floor(u_time*10.))-.5)*.01*M;\n  float l=luma(vid(uv+w));\n  l=pow(clamp(l,0.,1.),.9-I*.35)*(1.+I*.5);\n  return firePal(l);\n}","dep":[]},{"id":"cyber","label":"cyber","cat":"color","c":"#ff2bd6","i":55,"m":45,"fn":"fx_cyber","hist":false,"src":"vec3 fx_cyber(vec2 uv){\n  float o=.004*(1.+M*2.);\n  vec3 c=vec3(vid(uv+vec2(o,0.)).r,vid(uv).g,vid(uv-vec2(o,0.)).b);\n  float l=luma(c);\n  vec3 g=mix(vec3(.9,.05,.6)*l*1.7,vec3(.1,1.,.9)*(.3+l),smoothstep(.25,.75,l));\n  c=mix(c,g,.55+I*.45);\n  c*=.93+.07*sin(uv.y*u_res.y*1.2);\n  return c*1.1;\n}","dep":[]},{"id":"sunset","label":"sunset","cat":"color","c":"#ff7f50","i":50,"m":50,"fn":"fx_sunset","hist":false,"src":"vec3 fx_sunset(vec2 uv){\n  vec3 c=vid(uv);\n  c=grade(c,vec3(.55,.38,.75),vec3(.98,.62,.28),.55+I*.6,1.2+I*.5,1.05+I*.25);\n  return hueRot(c,(M-.5)*.5);\n}","dep":[]},{"id":"forest","label":"forest","cat":"color","c":"#7ddc5a","i":50,"m":50,"fn":"fx_forest","hist":false,"src":"vec3 fx_forest(vec2 uv){\n  vec3 c=vid(uv);\n  c=grade(c,vec3(.3,.52,.46),vec3(.72,.82,.4),.55+I*.6,1.15+I*.5,1.05+I*.25);\n  return hueRot(c,(M-.5)*.6);\n}","dep":[]},{"id":"noir","label":"noir","cat":"mono","c":"#ffffff","i":55,"m":40,"fn":"fx_noir","hist":false,"src":"vec3 fx_noir(vec2 uv){\n  float l=luma(vid(uv));\n  l=clamp((l-.5)*(1.25+I*1.6)+.5+(M-.5)*.25,0.,1.);\n  l+=(hash21(uv*u_res+floor(u_time*12.)*77.)-.5)*(.06+I*.12);\n  return vec3(l);\n}","dep":[]},{"id":"invert","label":"invert","cat":"mono","c":"#d7f0ff","i":55,"m":45,"fn":"fx_invert","hist":false,"src":"vec3 fx_invert(vec2 uv){\n  vec3 c=vid(uv); vec3 n=1.-c;\n  n=(n-.5)*(1.+M*.6)+.5;\n  return mix(c,n,.3+.7*I);\n}","dep":[]},{"id":"xray","label":"x-ray","cat":"mono","c":"#6fd2ff","i":55,"m":45,"fn":"fx_xray","hist":false,"src":"vec3 fx_xray(vec2 uv){\n  vec3 c=vid(uv); float l=1.-luma(c);\n  l=pow(clamp(l,0.,1.),1.+I*1.2);\n  float e=edge(uv,1.+M*1.5);\n  return vec3(l*.78,l*.95,l)+vec3(.2,.5,.65)*e*.4;\n}","dep":[]},{"id":"poster","label":"poster","cat":"mono","c":"#ffd23f","i":45,"m":40,"fn":"fx_poster","hist":false,"src":"vec3 fx_poster(vec2 uv){\n  vec3 c=vid(uv);\n  float s=floor(mix(7.,2.,I)+.5);\n  c=mix(vec3(luma(c)),c,1.5);\n  c=floor(c*s+.5)/s;\n  float e=edge(uv,1.+M);\n  return c*(1.-smoothstep(.25,.7,e));\n}","dep":[]},{"id":"halftone","label":"halftone","cat":"mono","c":"#ff4d6d","i":50,"m":20,"fn":"fx_halftone","hist":false,"src":"vec3 fx_halftone(vec2 uv){\n  float cells=min(mix(110.,34.,I),max(22.,u_res.y/6.));\n  vec2 q=vec2(uv.x*ASP,uv.y);\n  float ang=.45; mat2 R=mat2(cos(ang),-sin(ang),sin(ang),cos(ang));\n  vec2 p=R*q*cells; vec2 id=floor(p); vec2 f=fract(p)-.5;\n  vec2 qc=transpose(R)*((id+.5)/cells);\n  vec3 c=vid(vec2(qc.x/ASP,qc.y));\n  float l=luma(c);\n  float dark=step(.5,M);\n  float rad=mix(1.-l,l,dark)*.75;\n  float d=length(f);\n  float aa=max(fwidth(d),.001);\n  float dot_=1.-smoothstep(rad-aa,rad+aa,d);\n  vec3 ink=mix(vec3(.05),c*1.25,dark);\n  vec3 paper=mix(vec3(.96,.94,.88),vec3(.03),dark);\n  return mix(paper,ink,dot_);\n}","dep":[]},{"id":"ascii","label":"ascii","cat":"mono","c":"#f5f5f5","i":45,"m":50,"fn":"fx_ascii","hist":false,"src":"vec3 fx_ascii(vec2 uv){ return glyphFx(uv,0); }","dep":["vec3 glyphFx(vec2 uv,int mode){\n  float rows=mix(86.,30.,I);\n  vec2 cells=vec2(rows*ASP*.62,rows);\n  vec2 g=uv*cells; vec2 id=floor(g); vec2 f=fract(g);\n  vec3 c=vid((id+.5)/cells);\n  float l=luma(c);\n  float seed=hash21(id);\n  float tick=floor(u_time*(1.5+M*4.)+seed*20.);\n  vec2 gp=f*vec2(4.,6.); vec2 pi=floor(gp); vec2 pf=fract(gp);\n  float h=hash21(id*13.1+pi*3.7+tick*.17);\n  float shape=step(.2,pf.x)*step(.2,pf.y)*step(.2,1.-pf.x)*step(.2,1.-pf.y);\n  float on=step(1.-clamp(l*1.3,0.,1.),h)*shape;\n  if(mode==0){\n    return vec3(.03)+on*mix(vec3(1.),c*1.4,.45);\n  }\n  float sp=.15+hash11(id.x*1.3)*.6;\n  float rain=fract(uv.y+u_time*sp*(.4+M*1.6)+hash11(id.x)*10.);\n  float trail=pow(1.-rain,3.);\n  float head=smoothstep(.04,.0,rain);\n  vec3 gc=vec3(.1,1.,.35);\n  return vec3(0.,.02,.0)+gc*(l*1.3+.08)*on*(.3+trail*1.3)+vec3(.8,1.,.85)*head*on;\n}"]},{"id":"lomo","label":"lomo","cat":"film","c":"#ffb347","i":55,"m":45,"fn":"fx_lomo","hist":false,"src":"vec3 fx_lomo(vec2 uv){\n  vec3 c=vid(uv);\n  c=vec3(pow(c.r,.8),pow(c.g,1.),pow(c.b,1.25));\n  c=(c-.5)*(1.2+I*.5)+.5;\n  c=mix(vec3(luma(c)),c,1.3+I*.9);\n  c*=mix(1.,1.-vig(uv,.2,.85),.55+I*.35);\n  c+=(hash21(uv*u_res+floor(u_time*12.)*91.)-.5)*.06;\n  return c+vec3(.04,0.,-.02)*M;\n}","dep":[]},{"id":"vintage","label":"vintage","cat":"film","c":"#e8c07a","i":55,"m":45,"fn":"fx_vintage","hist":false,"src":"vec3 fx_vintage(vec2 uv){\n  vec3 c=vid(uv); float l=luma(c);\n  c=mix(c,vec3(l)*vec3(1.12,.96,.76),.5+M*.4);\n  c=c*(.82-I*.05)+.1+I*.04;\n  c+=(hash21(uv*u_res+floor(u_time*12.)*53.)-.5)*(.05+I*.08);\n  c*=1.-vig(uv,.25,.9)*.5;\n  return c;\n}","dep":[]},{"id":"kodak","label":"kodak","cat":"film","c":"#ffcc66","i":55,"m":45,"fn":"fx_kodak","hist":false,"src":"vec3 fx_kodak(vec2 uv){\n  vec3 c=grade(vid(uv),vec3(.46,.5,.56),vec3(.66,.55,.4),.55+I*.5,1.2+I*.4,1.08+I*.2);\n  c+=(hash21(uv*u_res+floor(u_time*12.)*31.)-.5)*.04;\n  return hueRot(c,(M-.5)*.3);\n}","dep":[]},{"id":"fuji","label":"fuji","cat":"film","c":"#7bd8a0","i":55,"m":45,"fn":"fx_fuji","hist":false,"src":"vec3 fx_fuji(vec2 uv){\n  vec3 c=grade(vid(uv),vec3(.46,.54,.5),vec3(.55,.6,.56),.5+I*.45,1.1+I*.4,1.04+I*.15);\n  c+=(hash21(uv*u_res+floor(u_time*12.)*37.)-.5)*.035;\n  return hueRot(c,(M-.5)*.35);\n}","dep":[]},{"id":"cinema","label":"cinema","cat":"film","c":"#4fc3d9","i":55,"m":45,"fn":"fx_cinema","hist":false,"src":"vec3 fx_cinema(vec2 uv){\n  vec3 c=grade(vid(uv),vec3(.28,.5,.58),vec3(.76,.55,.38),.85+I*.5,1.1+I*.3,1.12+I*.25);\n  c*=1.-vig(uv,.3,1.)*.35;\n  return hueRot(c,(M-.5)*.25);\n}","dep":[]},{"id":"super8","label":"super 8","cat":"film","c":"#f0b36a","i":55,"m":45,"fn":"fx_super8","hist":false,"src":"vec3 fx_super8(vec2 uv){\n  float t=floor(u_time*18.);\n  vec2 wv=vec2(hash11(t)-.5,hash11(t+3.)-.5)*.004*(.5+M);\n  vec3 c=vid(uv+wv); float l=luma(c);\n  c=mix(c,vec3(l)*vec3(1.1,.95,.8),.35);\n  c=grade(c,vec3(.55,.46,.4),vec3(.62,.52,.4),.6,.95,1.05+I*.2);\n  c*=.96+.04*hash11(floor(u_time*6.)+7.)*(1.+M);\n  c+=(hash21(uv*u_res*.7+t)-.5)*(.08+I*.14);\n  float sc=step(.997-.004*I,hash21(vec2(floor(uv.x*u_res.x*.3),t)));\n  c=mix(c,vec3(.9),sc*.28*step(.5,hash11(t+1.)));\n  c*=1.-vig(uv,.25,.9)*.7;\n  return c;\n}","dep":[]},{"id":"vhs","label":"vhs","cat":"film","c":"#ff6bd5","i":55,"m":45,"fn":"fx_vhs","hist":false,"src":"vec3 fx_vhs(vec2 uv){\n  float t=u_time;\n  float jit=(hash21(vec2(floor(uv.y*u_res.y*.5),floor(t*15.)))-.5)*.0025*(.5+M*2.);\n  float trk=smoothstep(.95,1.,fract(uv.y*.6+t*.15*(.4+M)));\n  vec2 u=vec2(uv.x+jit+trk*(.02+.04*I)*sin(uv.y*80.+t*20.),uv.y);\n  float bl=.003+I*.004;\n  vec3 c=vec3(vid(u+vec2(bl,0.)).r,vid(u).g,vid(u-vec2(bl,0.)).b);\n  c=mix(vec3(luma(c)),c,.75);\n  c=(c-.5)*(.95+I*.25)+.5+vec3(.02,0.,.04);\n  c+=(hash21(uv*u_res+floor(t*12.)*5.)-.5)*(.08+I*.1);\n  c+=trk*.18;\n  c*=.94+.06*sin(uv.y*u_res.y*1.6);\n  return c;\n}","dep":[]},{"id":"crt","label":"crt","cat":"film","c":"#9dff7a","i":55,"m":45,"fn":"fx_crt","hist":false,"src":"vec3 fx_crt(vec2 uv){\n  vec2 p=uv*2.-1.;\n  p*=1.+dot(p,p)*(.05+I*.1);\n  vec2 u=p*.5+.5;\n  if(u.x<0.||u.x>1.||u.y<0.||u.y>1.) return vec3(0.);\n  float ca=.0015+.003*M;\n  vec3 c=vec3(vid(u+vec2(ca,0.)).r,vid(u).g,vid(u-vec2(ca,0.)).b);\n  float sl=.78+.22*sin(u.y*u_res.y*1.57);\n  float xx=mod(u.x*u_res.x,3.);\n  vec3 mk=.75+.25*vec3(step(xx,1.),step(1.,xx)*step(xx,2.),step(2.,xx));\n  c*=sl*mk*(1.2+I*.4)*(.985+.015*sin(u_time*7.));\n  c*=1.-vig(u,.45,.95)*.6;\n  return c;\n}","dep":[]},{"id":"night","label":"night","cat":"film","c":"#3dff6e","i":50,"m":50,"fn":"fx_night","hist":false,"src":"vec3 fx_night(vec2 uv){\n  float l=luma(vid(uv));\n  l=pow(clamp(l*(1.8+I*2.),0.,1.),.8);\n  l+=(hash21(uv*u_res+floor(u_time*12.)*45.)-.5)*.18;\n  vec3 g=vec3(.1,1.,.3)*l;\n  g*=.85+.15*sin(uv.y*u_res.y*1.3+u_time*8.);\n  return g*mix(1.,smoothstep(.72,.35,length((uv-.5)*vec2(ASP,1.))),.8);\n}","dep":[]},{"id":"bloom","label":"bloom","cat":"fx","c":"#ffd6f5","i":55,"m":45,"fn":"fx_bloom","hist":false,"src":"vec3 fx_bloom(vec2 uv){\n  vec3 c=vid(uv); vec3 b=vec3(0.); float r=.012+M*.03;\n  for(int i=0;i<12;i++){\n    float fi=float(i); float a=fi*2.39996; float rr=sqrt((fi+.5)/12.)*r;\n    vec3 s=vid(uv+vec2(cos(a)/ASP,sin(a))*rr);\n    b+=max(s-.5,0.);\n  }\n  b/=12.;\n  return c+b*(3.+I*8.);\n}","dep":[]},{"id":"dream","label":"dream","cat":"fx","c":"#c7a6ff","i":55,"m":45,"fn":"fx_dream","hist":false,"src":"vec3 fx_dream(vec2 uv){\n  vec3 c=vid(uv); vec3 b=vec3(0.); float r=.018+I*.035;\n  for(int i=0;i<16;i++){\n    float fi=float(i); float a=fi*2.39996+u_time*.2*M; float rr=sqrt((fi+.5)/16.)*r;\n    b+=vid(uv+vec2(cos(a)/ASP,sin(a))*rr);\n  }\n  b/=16.;\n  vec3 o=mix(c,b,.55);\n  o=o*1.08+.07*vec3(.9,.7,1.);\n  o=hueRot(o,sin(u_time*.4)*M*.5);\n  return mix(vec3(luma(o)),o,1.2+I*.4);\n}","dep":[]},{"id":"glitch","label":"glitch","cat":"fx","c":"#00f0ff","i":55,"m":60,"fn":"fx_glitch","hist":false,"src":"vec3 fx_glitch(vec2 uv){\n  float t=floor(u_time*(3.+M*5.));\n  float band=floor(uv.y*mix(8.,40.,hash11(t)));\n  float h=hash21(vec2(band,t));\n  float on=step(1.-(.08+I*.35),h);\n  float shift=(hash21(vec2(band,t+9.))-.5)*(.1+I*.25)*on;\n  float ca=.004+.02*I*on+.003*M;\n  vec2 u=vec2(uv.x+shift,uv.y);\n  vec3 c=vec3(vid(u+vec2(ca,0.)).r,vid(u).g,vid(u-vec2(ca,0.)).b);\n  vec2 bk=floor(uv*vec2(10.,18.));\n  float hb=step(1.-.012*I,hash21(bk+t*1.3));\n  c=mix(c,1.-c,hb);\n  return c;\n}","dep":[]},{"id":"pixel","label":"pixel","cat":"fx","c":"#b5ff3c","i":50,"m":45,"fn":"fx_pixel","hist":false,"src":"vec3 fx_pixel(vec2 uv){\n  float rows=mix(110.,18.,I);\n  vec2 cells=vec2(rows*ASP,rows);\n  vec2 g=uv*cells; vec2 f=fract(g);\n  vec3 c=vid((floor(g)+.5)/cells);\n  float lv=floor(mix(24.,4.,M)+.5);\n  c=floor(c*lv+.5)/lv;\n  c*=1.-.14*step(.9,max(f.x,f.y));\n  return c;\n}","dep":[]},{"id":"prism","label":"prism","cat":"fx","c":"#ff6ad5","i":55,"m":45,"fn":"fx_prism","hist":false,"src":"vec3 fx_prism(vec2 uv){\n  vec2 d=uv-.5; float len=length(d); vec2 dir=normalize(d+1e-4);\n  float amt=(.01+I*.06)*(.4+len*1.6)*(1.+M*sin(u_time*2.));\n  vec3 acc=vec3(0.); vec3 ws=vec3(0.);\n  for(int i=0;i<8;i++){\n    float t=float(i)/7.;\n    vec3 w=clamp(vec3(1.-t*2.,1.-abs(t-.5)*2.,t*2.-1.),0.,1.);\n    acc+=vid(uv+dir*amt*(t-.5)*2.)*w; ws+=w;\n  }\n  return acc/max(ws,vec3(.001))*1.05;\n}","dep":[]},{"id":"kaleido","label":"kaleido","cat":"fx","c":"#ff9d00","i":45,"m":55,"fn":"fx_kal","hist":false,"src":"vec3 fx_kal(vec2 uv){\n  vec2 p=(uv-.5)*vec2(ASP,1.);\n  float n=floor(mix(3.,12.,I)+.5);\n  float r=length(p); float a=atan(p.y,p.x)+u_time*.12*(M-.3);\n  float seg=6.28318/n; a=mod(a,seg); a=abs(a-seg*.5);\n  vec2 q=vec2(cos(a),sin(a))*r;\n  vec2 u=q/vec2(ASP,1.)+.5;\n  u=(u-.5)*.9+.5;\n  return vid(mir(u));\n}","dep":[]},{"id":"mirror","label":"mirror","cat":"fx","c":"#74b9ff","i":50,"m":20,"fn":"fx_mirror","hist":false,"src":"vec3 fx_mirror(vec2 uv){\n  float c=.5+(I-.5)*.3; vec2 u=uv;\n  if(M<.34) u.x=c-abs(uv.x-c);\n  else if(M<.67) u.y=.5-abs(uv.y-.5);\n  else { u.x=c-abs(uv.x-c); u.y=.5-abs(uv.y-.5); }\n  return vid(u);\n}","dep":[]},{"id":"matrix","label":"matrix","cat":"fx","c":"#00ff41","i":45,"m":50,"fn":"fx_matrix","hist":false,"src":"vec3 fx_matrix(vec2 uv){ return glyphFx(uv,1); }","dep":["vec3 glyphFx(vec2 uv,int mode){\n  float rows=mix(86.,30.,I);\n  vec2 cells=vec2(rows*ASP*.62,rows);\n  vec2 g=uv*cells; vec2 id=floor(g); vec2 f=fract(g);\n  vec3 c=vid((id+.5)/cells);\n  float l=luma(c);\n  float seed=hash21(id);\n  float tick=floor(u_time*(1.5+M*4.)+seed*20.);\n  vec2 gp=f*vec2(4.,6.); vec2 pi=floor(gp); vec2 pf=fract(gp);\n  float h=hash21(id*13.1+pi*3.7+tick*.17);\n  float shape=step(.2,pf.x)*step(.2,pf.y)*step(.2,1.-pf.x)*step(.2,1.-pf.y);\n  float on=step(1.-clamp(l*1.3,0.,1.),h)*shape;\n  if(mode==0){\n    return vec3(.03)+on*mix(vec3(1.),c*1.4,.45);\n  }\n  float sp=.15+hash11(id.x*1.3)*.6;\n  float rain=fract(uv.y+u_time*sp*(.4+M*1.6)+hash11(id.x)*10.);\n  float trail=pow(1.-rain,3.);\n  float head=smoothstep(.04,.0,rain);\n  vec3 gc=vec3(.1,1.,.35);\n  return vec3(0.,.02,.0)+gc*(l*1.3+.08)*on*(.3+trail*1.3)+vec3(.8,1.,.85)*head*on;\n}"]},{"id":"liquid","label":"liquid","cat":"fx","c":"#4cc9f0","i":55,"m":45,"fn":"fx_liquid","hist":false,"src":"vec3 fx_liquid(vec2 uv){\n  vec2 p=uv*vec2(ASP,1.)*3.; float t=u_time*(.4+M*1.5);\n  vec2 w=vec2(sin(p.y*2.+t)+sin(p.y*4.7-t*1.3)*.5,cos(p.x*2.2-t*.9)+cos(p.x*5.1+t*1.1)*.5);\n  vec2 o=w*(.006+I*.045);\n  return vec3(vid(uv+o*1.05).r,vid(uv+o).g,vid(uv+o*.95).b);\n}","dep":[]},{"id":"paint","label":"paint","cat":"fx","c":"#ff8fab","i":55,"m":45,"fn":"fx_paint","hist":false,"src":"vec3 fx_paint(vec2 uv){\n  vec2 px=mix(1.2,3.5,I)/u_res;\n  vec3 best=vec3(0.); float bv=1e9;\n  for(int q=0;q<4;q++){\n    vec2 dir=vec2((q==0||q==2)?-1.:1.,q<2?-1.:1.);\n    vec3 s=vec3(0.); vec3 s2=vec3(0.);\n    for(int j=0;j<2;j++){\n      for(int i=0;i<2;i++){\n        vec3 t=vid(uv+dir*(vec2(float(i),float(j))+.5)*px*1.6);\n        s+=t; s2+=t*t;\n      }\n    }\n    vec3 m=s*.25; vec3 v=s2*.25-m*m; float vv=v.r+v.g+v.b;\n    if(vv<bv){ bv=vv; best=m; }\n  }\n  best=(best-.5)*(1.1+M*.4)+.5;\n  return mix(vec3(luma(best)),best,1.25);\n}","dep":[]},{"id":"grid","label":"grid","cat":"fx","c":"#d0d0d0","i":40,"m":40,"fn":"fx_grid","hist":false,"src":"vec3 fx_grid(vec2 uv){\n  float n=floor(mix(2.,5.,I)+.5);\n  vec2 g=uv*n; vec2 id=floor(g); vec2 f=fract(g);\n  vec3 c=hueRot(vid(f),(hash21(id)-.5)*M*4.);\n  vec2 e=min(f,1.-f);\n  float inset=.02*n;\n  float k=smoothstep(inset*.5,inset,min(e.x,e.y));\n  return mix(vec3(.04),c,k);\n}","dep":[]},{"id":"ghost","label":"ghost","cat":"time","c":"#a0b4ff","i":55,"m":50,"fn":"fx_ghost","hist":true,"src":"vec3 fx_ghost(vec2 uv){\n  vec3 c=vid(uv);\n  if(u_chip>.5) return c;\n  vec3 p=texture(u_prev,uv).rgb;\n  float k=.55+M*.4;\n  return mix(mix(c,p,k),max(c,p*(.9+M*.09)),I);\n}","dep":[]},{"id":"tunnel","label":"tunnel","cat":"time","c":"#ff3df0","i":55,"m":45,"fn":"fx_tunnel","hist":true,"src":"vec3 fx_tunnel(vec2 uv){\n  vec3 c=vid(uv);\n  if(u_chip>.5) return hueRot(c,.8);\n  vec2 p=uv-.5; p.x*=ASP;\n  float a=(.006+M*.03)*sin(u_time*.5+1.);\n  float cs=cos(a), sn=sin(a);\n  p=mat2(cs,-sn,sn,cs)*p;\n  p*=.975-I*.02; p.x/=ASP;\n  vec3 pv=hueRot(texture(u_prev,p+.5).rgb,.05+M*.08);\n  return mix(pv*.985,c,.1+.25*(1.-I));\n}","dep":[]},{"id":"slit","label":"slit","cat":"time","c":"#ffe14d","i":50,"m":35,"fn":"fx_slit","hist":true,"src":"vec3 fx_slit(vec2 uv){\n  vec3 c=vid(uv);\n  if(u_chip>.5) return c*vec3(1.1,.95,.7);\n  float n=floor(1.+M*6.);\n  float dx=n/u_res.x;\n  if(uv.x>1.-dx){ return vid(vec2(.5+(I-.5)*.6,uv.y)); }\n  return texture(u_prev,vec2(uv.x+dx,uv.y)).rgb;\n}","dep":[]},{"id":"mosh","label":"mosh","cat":"time","c":"#ff5555","i":60,"m":45,"fn":"fx_mosh","hist":true,"src":"vec3 fx_mosh(vec2 uv){\n  vec3 c=vid(uv); float l=luma(c);\n  if(u_chip>.5) return c;\n  vec4 pr=texture(u_prev,uv);\n  float it=l-pr.a;\n  vec2 px=1./u_res;\n  float gx=(luma(vid(uv+vec2(px.x,0.)))-luma(vid(uv-vec2(px.x,0.))))*.5;\n  float gy=(luma(vid(uv+vec2(0.,px.y)))-luma(vid(uv-vec2(0.,px.y))))*.5;\n  vec2 g=vec2(gx,gy);\n  vec2 flow=-it*g/(dot(g,g)+.004);\n  float lim=2.+I*10.;\n  flow=clamp(flow,vec2(-lim),vec2(lim));\n  vec3 q=texture(u_prev,uv-flow*px).rgb;\n  float key=step(.994-.02*M,hash11(floor(u_time*(2.+M*6.))));\n  float bleed=.012+(1.-I)*.05;\n  return mix(q,c,max(bleed,key));\n}","dep":[]}];
/*CAMFX:END*/
/*FUSE:BEGIN WP1 fusion engine: a recipe of up to 4 steps compiles to ONE fragment program.
  Toggling a step is a uniform (u_on*), never a recompile. Changing which effects are chosen compiles in the
  background (KHR_parallel_shader_compile) and the previous program keeps drawing until the new one is ready. */
const CAMLIB2=CAMLIB.replace(/^float luma\(.*$/m,'').replace(/^vec3 hueRot\(.*$/m,'');
/* tuning for newn0ise: default hue offsets keep the blue/cyan share low (gate 2), chrome gets a stronger default so it differs from clean */
const FX_HUE={aqua:-95,duo:45,tri:50,cyber:50,sunset:-35,invert:70,poster:-30,dream:-35,night:0};
/* random Fuse picks skip looks that are blue/cyan by nature (they stay one tap away) */
const FX_BLUISH=new Set(['aqua','xray','night','dream','duo','tri','cyber','bloom','cinema','glitch']);
const fusePool=()=>CAMFX.filter(f=>!f.hist&&!f.custom&&!f.face&&!FX_BLUISH.has(f.id)&&f.id!=='clean');
const FX_DEF={chrome:[100,100]};
CAMFX.forEach(f=>{f.hs=FX_HUE[f.id]||0;if(FX_DEF[f.id]){f.i=FX_DEF[f.id][0];f.m=FX_DEF[f.id][1];}});
const FXBY=Object.fromEntries(CAMFX.map(f=>[f.id,f]));
const fxCost=f=>{const n=(f.src.match(/vid\(|texture\(/g)||[]).length;return /for\s*\(/.test(f.src)||n>8?3:n>3?2:1;};
const FUSE_BLENDS=['normal','multiply','screen','add','difference','overlay'];
const FX_OPTS=['Off',...CAMFX.map(f=>f.label+' '+'·'.repeat(fxCost(f)))];
const FX_CATS={color:'Color',mono:'Mono',film:'Film',fx:'FX',time:'Time'};
const fxIndex=id=>CAMFX.findIndex(f=>f.id===id)+1;
function fuseParams(){
  const ps=[];
  for(let s=1;s<=4;s++){const sec='Step '+s;
    ps.push({k:'f'+s,t:'c',label:'Effect',opts:FX_OPTS,def:s===1?fxIndex('chrome'):0,sec});
    ps.push({k:'on'+s,t:'b',label:'On',def:true,sec});
    ps.push({k:'i'+s,label:'Intensity',min:0,max:100,def:55,sec,hero:s===1});
    ps.push({k:'m'+s,label:'Motion',min:0,max:100,def:45,sec,hero:s===1});
    ps.push({k:'mx'+s,label:'Mix',min:0,max:100,def:100,sec});
    ps.push({k:'bl'+s,t:'c',label:'Blend',opts:FUSE_BLENDS,def:0,sec});
    ps.push({k:'mk'+s,t:'c',label:'Apply to',opts:['Everything','Edges','Bright areas','Dark areas','Painted'],def:0,sec});
    ps.push({k:'mt'+s,label:'Mask threshold',min:0,max:100,def:50,sec});}
  return ps.concat([{k:'hue',label:'Hue',min:-180,max:180,def:0,sec:'Finish'},{k:'sat',label:'Saturation',min:0,max:300,def:100,sec:'Finish'},
    {k:'glow',label:'Glow',min:0,max:100,def:0,sec:'Finish'},{k:'split',label:'Color split',min:0,max:100,def:0,sec:'Finish'},
    {k:'grain',label:'Grain',min:0,max:100,def:0,sec:'Finish'},{k:'vig',label:'Vignette',min:0,max:100,def:0,sec:'Finish'}]);
}
const fuseFxs=V=>[1,2,3,4].map(s=>+V['f'+s]>0?CAMFX[+V['f'+s]-1]:null);
function fuseFrag(fxs){
  const used=[...new Set(fxs.filter(Boolean))];
  let s=`#define u_time uTime
#define u_res uRes
uniform sampler2D u_prev,u_mask;
${used.some(f=>f.face)?'uniform float u_fok;uniform vec4 u_face;uniform vec2 u_eyeL,u_eyeR;uniform vec2 u_fpts[42];':''}
const float u_chip=0.;uniform float u_aud;
float I,M,ASP;vec3 CUR;vec2 U0;
vec3 vid(vec2 uv){return uv==U0?CUR:texture(uSrc,uv).rgb;}
`+CAMLIB2+'\n'+[...new Set(used.flatMap(f=>f.dep||[]))].join('\n')+'\n'+used.map(f=>f.src).join('\n')+`
void main(){vec2 uv=vUv;U0=uv;ASP=uRes.x/uRes.y;CUR=texture(uSrc,uv).rgb;vec3 c=CUR;
`;
  fxs.forEach((f,i)=>{if(!f)return;const n=i+1;
    s+=`if(u_on${n}>.5){I=u_i${n}/100.;M=clamp(u_m${n}/100.+u_aud,0.,1.);vec3 r=${f.fn}(uv);${f.hs?`r=hueRot(r,${(f.hs*Math.PI/180).toFixed(4)});`:''}int b=int(u_bl${n}+.5);
vec3 q=b==1?c*r:b==2?1.-(1.-c)*(1.-r):b==3?c+r:b==4?abs(c-r):b==5?mix(2.*c*r,1.-2.*(1.-c)*(1.-r),step(.5,c)):r;
float k=u_mx${n}/100.;int mm=int(u_mk${n}+.5);
if(mm==1)k*=smoothstep(u_mt${n}*.004,u_mt${n}*.004+.08,length(sobel(uSrc,uv,1.5/uRes)));
else if(mm==2)k*=smoothstep(u_mt${n}/100.-.05,u_mt${n}/100.+.05,luma(c));
else if(mm==3)k*=1.-smoothstep(u_mt${n}/100.-.05,u_mt${n}/100.+.05,luma(c));
else if(mm==4)k*=texture(u_mask,uv).r;
c=mix(c,q,k);CUR=c;}
`;});
  return s+`if(abs(u_hue)>.5)c=hueRot(c,u_hue*.0174533);
c=mix(vec3(luma(c)),c,u_sat/100.);
c*=1.-smoothstep(.35,1.05,length((uv-.5)*vec2(ASP,1.)))*u_vig/100.;
c+=(hash21(gl_FragCoord.xy+fract(uTime)*173.)-.5)*u_grain/100.*.3;
o=vec4(clamp(c,0.,1.),1.);}`;
}
/* painted mask: a 256x256 canvas painted with a finger brush, uploaded as a texture (shared by every step set to Painted) */
const FMASK={cv:document.createElement('canvas'),tex:null,dirty:true};FMASK.cv.width=FMASK.cv.height=256;
{const g=FMASK.cv.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,256,256);}
function fmaskTex(){
  if(!FMASK.tex){FMASK.tex=gl.createTexture();FMASK.dirty=true;}
  if(FMASK.dirty){gl.bindTexture(gl.TEXTURE_2D,FMASK.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,FMASK.cv);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);FMASK.dirty=false;}
  return FMASK.tex;}
const MASKB={size:18,feather:60,erase:false};
function maskDab(fx,fy){const g=FMASK.cv.getContext('2d'),r=MASKB.size/100*128+4,x=fx*256,y=fy*256,f=MASKB.feather/100;
  const gr=g.createRadialGradient(x,y,r*(1-f)*.99,x,y,r);const c=MASKB.erase?'0,0,0':'255,255,255';gr.addColorStop(0,`rgba(${c},1)`);gr.addColorStop(1,`rgba(${c},0)`);
  g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();FMASK.dirty=true;}
function maskFill(v){const g=FMASK.cv.getContext('2d');g.fillStyle=v?'#fff':'#000';g.fillRect(0,0,256,256);FMASK.dirty=true;}
function maskInvert(){const g=FMASK.cv.getContext('2d'),im=g.getImageData(0,0,256,256);for(let i=0;i<im.data.length;i+=4){im.data[i]=im.data[i+1]=im.data[i+2]=255-im.data[i];}g.putImageData(im,0,0);FMASK.dirty=true;}
function wireMaskPaint(){
  let down=false,last=null;
  const pos=e=>{const r=canvas.getBoundingClientRect();return[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
  const stroke=e=>{const[x,y]=pos(e);if(last){const n=Math.ceil(Math.hypot(x-last[0],y-last[1])*256/(MASKB.size/100*64+2));for(let i=1;i<=n;i++)maskDab(last[0]+(x-last[0])*i/n,last[1]+(y-last[1])*i/n);}else maskDab(x,y);last=[x,y];};
  canvas.addEventListener('pointerdown',e=>{if(!ST.mpaint)return;down=true;last=null;canvas.setPointerCapture(e.pointerId);stroke(e);e.stopPropagation();});
  canvas.addEventListener('pointermove',e=>{if(ST.mpaint&&down)stroke(e);});
  ['pointerup','pointercancel'].forEach(ev=>canvas.addEventListener(ev,()=>{down=false;last=null;}));
}
const FUSE_PREV={};
const fusePrev=(w,h)=>{const k=w+'x'+h;return FUSE_PREV[k]||(FUSE_PREV[k]=mkRT(w,h,{hdr:true}));};
const fuseCost=V=>fuseFxs(V).reduce((a,f,i)=>a+(f&&V['on'+(i+1)]?fxCost(f):0),0);
defineModule({id:'fuse',family:'Camera',name:'Fuse',params:fuseParams(),
  dyn:V=>{const fx=fuseFxs(V);return{key:fx.map(f=>f?f.id:'-').join(),frag:fuseFrag(fx)};},
  bind(pr,V,ctx){samp(pr,'u_prev',2,fusePrev(ctx.W,ctx.H).tex);samp(pr,'u_mask',3,fmaskTex());
    if(fuseFxs(V).some(f=>f&&f.face)){if(!ctx.sync)faceTick();pr.f('u_fok',FACE.ok?1:0);pr.v4('u_face',...FACE.face);pr.v2('u_eyeL',...FACE.eL);pr.v2('u_eyeR',...FACE.eR);pr.v2v('u_fpts',FACE.pts);}pr.f('u_aud',audio.on?audio.level:0);},
  after(pr,V,ctx){if(!ctx.out||!ctx.out.tex)return;
    if(fuseFxs(V).some(f=>f&&f.hist)){const c=PR.copy;bindRT(fusePrev(ctx.W,ctx.H));c.use();samp(c,'uT',0,ctx.out.tex);draw();}
    if(+V.glow>0||+V.split>0){/* Finish pass: copy the result, then glow + chromatic split back into the output */
      const tmp=histRT('fin',ctx.W,ctx.H),c=PR.copy;bindRT(tmp);c.use();samp(c,'uT',0,ctx.out.tex);draw();
      const f=PR.fin||(PR.fin=mkProg(VS,F_FIN));bindRT(ctx.out);f.use();samp(f,'uT',0,tmp.tex);f.v2('uRes',ctx.W,ctx.H);f.f('uGlow',V.glow/100);f.f('uSplit',V.split/100);f.f('uS',ctx.H/600);draw();}}});
const F_FIN=HEAD+`uniform sampler2D uT;uniform vec2 uRes;uniform float uGlow,uSplit,uS;
void main(){vec2 uv=vUv;vec3 c=texture(uT,uv).rgb;
  if(uSplit>0.){vec2 d=uv-.5,o=d*dot(d,d)*uSplit*.16+d*uSplit*.006;c=vec3(texture(uT,uv+o).r,c.g,texture(uT,uv-o).b);}
  if(uGlow>0.){vec3 b=vec3(0.);for(int k=0;k<3;k++){float r=(5.+float(k)*8.)*uS/uRes.y;for(int i=0;i<8;i++){float a=float(i)*.7854+float(k)*.4;b+=texture(uT,uv+vec2(cos(a)*r*uRes.y/uRes.x,sin(a)*r)).rgb;}}
    b/=24.;c=1.-(1.-c)*(1.-clamp(b*uGlow*1.6,0.,1.));}
  o=vec4(clamp(c,0.,1.),1.);}`;
/* helpers the UI uses */
function fuseSet(l,slot,id){l.params['f'+slot]=id?fxIndex(id):0;const f=id&&FXBY[id];if(f){l.params['i'+slot]=f.i;l.params['m'+slot]=f.m;l.params['on'+slot]=true;}}
const FUSE_KEYS=['f','on','i','m','mx','bl','mk','mt'];
function fuseSwap(l,a,b){FUSE_KEYS.forEach(k=>{const x=l.params[k+a];l.params[k+a]=l.params[k+b];l.params[k+b]=x;});}
const RECIPES_KEY='n0ise.recipes';
const loadRecipes=()=>{try{return JSON.parse(localStorage.getItem(RECIPES_KEY)||'[]');}catch(e){return[];}};
const fuseSnapshot=l=>{const o={};MODULES.fuse.params.forEach(p=>{o[p.k]=l.params[p.k];});return o;};
function saveRecipe(l,name){const r=loadRecipes();r.push({id:'r'+Date.now(),name:name||fuseName(l),p:fuseSnapshot(l)});try{localStorage.setItem(RECIPES_KEY,JSON.stringify(r.slice(-40)));return true;}catch(e){return false;}}
const fuseName=l=>fuseFxs(l.params).filter(Boolean).map(f=>f.label).join(' + ')||'Empty';
function fuseShare(l){const h='#f='+btoa(JSON.stringify(fuseSnapshot(l)));history.replaceState(null,'',h);(navigator.clipboard?navigator.clipboard.writeText(location.href):Promise.reject()).then(()=>toast('Link copied')).catch(()=>toast('Link is in the address bar'));}
function loadFuseHash(){const m=location.hash.match(/^#f=(.+)$/);if(!m)return;try{const o=JSON.parse(atob(m[1])),l=mkLayer('fuse');Object.keys(o).forEach(k=>{if(k in l.params&&typeof o[k]===typeof l.params[k])l.params[k]=o[k];});STACK.layers=[l];STACK.sel=0;}catch(e){}}
function fuseRandomPair(l){
  const pool=fusePool(),pick=()=>pool[Math.random()*pool.length|0];
  const a=pick();let b=pick();while(b.cat===a.cat&&pool.length>3)b=pick();
  for(let s=1;s<=4;s++)fuseSet(l,s,null);
  fuseSet(l,1,a.id);fuseSet(l,2,b.id);l.params.bl2=[0,2,0,5][Math.random()*4|0];l.params.mx2=60+Math.random()*30|0;return a.label+' + '+b.label;
}
/*FUSE:END*/
/* ---- custom effects: GLSL snippets with an ISF-style header (subset), saved in localStorage ---- */
FX_CATS.custom='Mine';
const CUSTOM_KEY='n0ise.custom';
const loadCustomSrc=()=>{try{return JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');}catch(e){return[];}};
const flt=n=>{const s=String(+n);return /[.e]/i.test(s)?s:s+'.';};
function braceBody(s,from){let d=0,i=s.indexOf('{',from);if(i<0)return null;const a=i;for(;i<s.length;i++){if(s[i]==='{')d++;else if(s[i]==='}'&&--d===0)return{a,b:i};}return null;}
function parseCustom(src,id){
  const safe=id.replace(/[^a-z0-9_]/gi,'_'),fn='fx_c_'+safe;let label=id,body=src,defs='',undefs='';
  const hm=src.match(/^\s*\/\*\s*(\{[\s\S]*?\})\s*\*\//);
  if(hm){let hd;try{hd=JSON.parse(hm[1]);}catch(e){throw new Error('The header JSON is not valid: '+e.message);}
    label=String(hd.DESCRIPTION||hd.CREDIT||id).slice(0,24);body=src.slice(hm[0].length);
    (hd.INPUTS||[]).filter(x=>/^(float|bool|long)$/.test(x.TYPE)&&x.NAME).forEach((x,k)=>{
      const mn=x.MIN??0,mx=x.MAX??1,df=x.DEFAULT===true?1:x.DEFAULT===false?0:(x.DEFAULT??mn);
      const e=x.TYPE==='bool'?(k===0?'(I>.5)':k===1?'(M>.5)':(df?'true':'false')):k===0?`(${flt(mn)}+(${flt(mx)}-${flt(mn)})*I)`:k===1?`(${flt(mn)}+(${flt(mx)}-${flt(mn)})*M)`:`(${flt(df)})`;
      defs+=`#define ${x.NAME} ${e}\n`;undefs+=`#undef ${x.NAME}\n`;});}
  const conv=s=>s.replace(/gl_FragColor/g,'_fc').replace(/isf_FragNormCoord/g,'uv').replace(/IMG_THIS_(NORM_)?PIXEL\(\s*\w+\s*\)/g,'vec4(vid(uv),1.)')
    .replace(/IMG_NORM_PIXEL\(\s*\w+\s*,/g,'isfN(').replace(/IMG_PIXEL\(\s*\w+\s*,/g,'isfP(').replace(/\bTIME\b/g,'u_time').replace(/\bRENDERSIZE\b/g,'u_res').replace(/\bPASSINDEX\b/g,'0');
  const mi=body.search(/void\s+main\s*\(/);let out,deps=[];
  if(mi>=0){const bb=braceBody(body,mi);if(!bb)throw new Error('main() has no closing brace');
    const inner=body.slice(bb.a+1,bb.b),helpers=(body.slice(0,mi)+body.slice(bb.b+1)).trim();
    if(helpers)deps.push(defs+conv(helpers)+'\n'+undefs);
    out=`${defs}vec3 ${fn}(vec2 uv){vec4 _fc=vec4(vid(uv),1.);${conv(inner)}\nreturn _fc.rgb;}\n${undefs}`;}
  else{if(!/vec3\s+fx\s*\(\s*vec2/.test(body))throw new Error('Write void main(){ … gl_FragColor=… } or vec3 fx(vec2 uv){ … }');
    out=defs+body.replace(/vec3\s+fx\s*\(/,`vec3 ${fn}(`)+'\n'+undefs;}
  deps.push('vec4 isfN(vec2 p){return vec4(vid(p),1.);}\nvec4 isfP(vec2 p){return vec4(vid(p/u_res),1.);}');
  return{id:'c_'+safe,label,cat:'custom',c:'#c9b27c',i:55,m:45,fn,hist:false,hs:0,src:out,dep:deps,custom:true};
}
function registerCustom(fx){
  if(fx.id==='c_draft')fx.cat='draft';
  const i=CAMFX.findIndex(f=>f.id===fx.id);if(i>=0){CAMFX[i]=fx;FX_OPTS[i+1]=fx.label+' ·';}else{CAMFX.push(fx);FX_OPTS.push(fx.label+' ·');}
  FXBY[fx.id]=fx;MODULES.fuse.cache={};MODULES.fuse.progKey=null;
}
function loadCustomAll(){loadCustomSrc().forEach(c=>{try{registerCustom({...parseCustom(c.src,c.id),label:c.label||undefined});}catch(e){console.warn('custom effect skipped',c.id,e.message);}});}
const CUSTOM_TEMPLATE=`/*{ "DESCRIPTION": "My effect", "INPUTS": [ { "NAME": "amount", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 } ] }*/
void main(){
  vec4 c = IMG_THIS_NORM_PIXEL(inputImage);
  vec2 d = isf_FragNormCoord - 0.5;
  c.rgb = mix(c.rgb, 1.0 - c.rgb, amount * smoothstep(0.2, 0.5, length(d)));
  gl_FragColor = c;
}`;
/* ---- face effects: @vladmandic/human (pinned, loaded only when a face effect is used) drives GLSL effects ---- */
FX_CATS.face='Face';
const HUMAN_VER='3.3.6',HUMAN_BASE='https://cdn.jsdelivr.net/npm/@vladmandic/human@'+HUMAN_VER;
const FACE={ok:false,miss:0,face:[.5,.5,.2,.3],eL:[.42,.6],eR:[.58,.6],pts:new Float32Array(84),busy:false,last:0,human:null,loading:false,failed:0,ver:-1};
const FACE_LIB='float faceE(vec2 uv){vec2 d=(uv-u_face.xy)/u_face.zw;return length(d);}';
const faceFx=(id,label,c,src)=>({id,label,cat:'face',c,i:60,m:45,fn:'fx_'+id,face:true,hist:false,hs:0,src,dep:[FACE_LIB]});
[faceFx('fdots','face dots','#d6ff3a',`vec3 fx_fdots(vec2 uv){vec3 c=vid(uv);if(u_fok<.5)return c;float g=0.;
  for(int i=0;i<42;i++){g+=smoothstep(.012+.012*M,.0,length((uv-u_fpts[i])*vec2(ASP,1.)));}
  return mix(c*(1.-.45*I),vec3(.84,1.,.23),clamp(g,0.,1.)*(.6+.4*I));}`),
 faceFx('feyes','face eyes','#ff4fd8',`vec3 fx_feyes(vec2 uv){vec3 c=vid(uv);if(u_fok<.5)return c;
  float a=length((uv-u_eyeL)*vec2(ASP,1.)),b=length((uv-u_eyeR)*vec2(ASP,1.));float e=exp(-a*28.)+exp(-b*28.)+.5*(exp(-abs(a-.035)*90.)+exp(-abs(b-.035)*90.));
  return c+vec3(1.,.3,.85)*e*(.5+1.2*I)*(.75+.25*sin(u_time*4.+M*6.));}`),
 faceFx('faura','face aura','#ffb84f',`vec3 fx_faura(vec2 uv){vec3 c=vid(uv);if(u_fok<.5)return c;float e=faceE(uv);
  float halo=exp(-pow(max(e-1.,0.),2.)*9.)*smoothstep(.6,1.,e);vec3 col=hpal(fract(u_time*.08+e*.25+.05));
  c*=mix(1.,.5,smoothstep(1.,2.4,e)*I);return c+col*halo*(.4+.8*I);}`),
 faceFx('fpoly','face poly','#e8b04a',`vec3 fx_fpoly(vec2 uv){vec3 c=vid(uv);if(u_fok<.5||faceE(uv)>1.)return c;
  float k=8.+34.*(1.-I*.8);vec2 p=uv*vec2(ASP,1.)*k,f=fract(p);float tri=step(f.y,f.x);
  vec2 ctr=(floor(p)+mix(vec2(.33,.66),vec2(.66,.33),tri))/(vec2(ASP,1.)*k);return mix(c,vid(ctr),.92);}`),
 faceFx('fmesh','face mesh','#9fe870',`vec3 fx_fmesh(vec2 uv){vec3 c=vid(uv);if(u_fok<.5)return c;vec2 p=(uv-u_face.xy)/u_face.zw;float r2=dot(p,p);if(r2>1.)return c;
  float z=sqrt(1.-r2),lx=abs(fract(atan(p.x,z)*5.2)-.5),ly=abs(fract(asin(clamp(p.y,-1.,1.))*5.2)-.5);
  float ln=smoothstep(.05+.04*(1.-I),0.,min(lx,ly));return mix(c*vec3(.55,.7,.6),vec3(.85,1.,.6),ln);}`)
].forEach(registerCustom);
/* ---- extra effects: Y2K, dither and line styles, pixel toys, lens and warp. Same shape as the camera filters, so they fuse, stack, toggle and mask like the rest. ---- */
const BAYER_LIB='float b2_(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}float bayer4(vec2 a){return b2_(a*.5)*.25+b2_(a);}float bayer8(vec2 a){return bayer4(a*.5)*.25+b2_(a);}';
const BLUR8_LIB='vec3 blur8(vec2 uv,float r){vec3 s=vec3(0.);for(int i=0;i<8;i++){float a=float(i)*.785398;s+=vid(uv+vec2(cos(a)/ASP,sin(a))*r*(.55+.45*float(i&1)));}return s/8.;}';
const VGA_LIB='const vec3 VGA[16]=vec3[16](vec3(0.),vec3(0.,0.,.67),vec3(0.,.67,0.),vec3(0.,.67,.67),vec3(.67,0.,0.),vec3(.67,0.,.67),vec3(.67,.33,0.),vec3(.67),vec3(.33),vec3(.33,.33,1.),vec3(.33,1.,.33),vec3(.33,1.,1.),vec3(1.,.33,.33),vec3(1.,.33,1.),vec3(1.,1.,.33),vec3(1.));';
const nfx=(id,label,c,i,m,src,dep=[],hist=false)=>({id,label,cat:'fx',c,i,m,fn:'fx_'+id,hist,hs:0,src,dep});
[
/* Y2K */
nfx('bubble','bubble gel','#ff8fc8',55,45,`vec3 fx_bubble(vec2 uv){
  vec3 c=mix(vid(uv),blur8(uv,.004+I*.01),.6);
  c=mix(vec3(luma(c)),c,1.2+I*.4); c=c*vec3(1.16,1.,.88)+.04;
  float g=smoothstep(.12,0.,abs(uv.y-(.3+.04*sin(uv.x*3.+u_time*M))));
  return c+vec3(g*.25*(.3+I)+smoothstep(.6,0.,uv.y)*.1);}`,[BLUR8_LIB]),
nfx('lchrome','liquid chrome','#dcdce4',55,45,`vec3 fx_lchrome(vec2 uv){
  vec2 px=2.5/u_res;float l=(luma(vid(uv))*2.+luma(vid(uv+vec2(px.x,0.)))+luma(vid(uv-vec2(px.x,0.)))+luma(vid(uv+vec2(0.,px.y)))+luma(vid(uv-vec2(0.,px.y))))/6.;
  float v=.5+.5*sin(l*(6.+I*14.)+u_time*.5*M+uv.y*2.);v=pow(v,1.5-I*.4);
  return mix(vec3(.06,.05,.07),vec3(1.,.97,.93),v);}`),
nfx('holo','holo foil','#ff7ad9',55,45,`vec3 fx_holo(vec2 uv){
  vec3 c=vid(uv);float l=luma(c);
  vec3 f=hpal(fract(l*1.4+uv.x*.6-uv.y*.4+u_time*.07*(M+.2)));
  float sp=pow(hash21(floor(uv*u_res*.5)+floor(u_time*6.)),30.);
  return mix(c,f*vec3(1.2,1.,.7)*(.45+l*.9),.3+I*.4)+sp*.7;}`),
nfx('aero','frutiger aero','#9fe35a',55,45,`vec3 fx_aero(vec2 uv){
  vec3 c=mix(vid(uv),blur8(uv,.006+I*.012),.5);
  c=c*vec3(1.02,1.08,.9);c=(c-.5)*1.08+.56;
  c+=smoothstep(1.,0.,uv.y)*.14*vec3(1.,1.,.86);
  return mix(vec3(luma(c)),c,1.3+M*.4);}`,[BLUR8_LIB]),
nfx('digicam','digicam 2002','#ffb347',55,45,`vec3 fx_digicam(vec2 uv){
  float cs=mix(5.,14.,I);vec2 cell=u_res/cs;vec3 ch=vid((floor(uv*cell)+.5)/cell);
  vec3 c=vid(uv);vec3 o=vec3(luma(c))+(ch-luma(ch))*1.25;
  float lv=mix(32.,9.,I);o=floor(o*lv+.5)/lv;
  o=(o-.5)*1.15+.6+vec3(.03,.02,-.02);return min(o,vec3(1.));}`),
nfx('webcam','webcam 2000','#a8c070',55,45,`vec3 fx_webcam(vec2 uv){
  float rows=min(mix(180.,64.,I),u_res.y/3.);vec2 cells=vec2(rows*ASP,rows);vec2 g=uv*cells,id=floor(g),w=fract(g);
  vec3 o=mix(mix(vid((id+.5)/cells),vid((id+vec2(1.5,.5))/cells),w.x),mix(vid((id+vec2(.5,1.5))/cells),vid((id+1.5)/cells),w.x),w.y);
  o=mix(vec3(luma(o)),o,.7)*vec3(.95,1.04,.92);
  o+=(hash21(id+floor(u_time*8.))-.5)*(.08+.1*M);return (o-.5)*.85+.5;}`),
nfx('lcd','lcd subpixel','#ff9d9d',50,40,`vec3 fx_lcd(vec2 uv){
  float cs=floor(mix(3.,7.,I));vec2 p=uv*u_res/cs,id=floor(p),f=fract(p);
  vec3 c=vid((id+.5)*cs/u_res);float s=floor(f.x*3.);
  vec3 m=vec3(s<.5?1.:.3,(s>.5&&s<1.5)?1.:.3,s>1.5?.8:.2);
  return c*m*vec3(1.15,1.,.85)*step(.1,f.y)*step(f.y,.9)*1.6;}`),
nfx('vapor','vapor sun','#ff5fa8',55,45,`vec3 fx_vapor(vec2 uv){
  float l=clamp((luma(vid(uv))-.5)*(1.1+I)+.5,0.,1.);
  vec3 a=vec3(.12,.02,.26),b=vec3(1.,.2,.6),c=vec3(1.,.72,.5);
  vec3 o=l<.5?mix(a,b,l*2.):mix(b,c,(l-.5)*2.);
  o*=.92+.08*sin(uv.y*u_res.y*1.1);return o+vec3(.06,0.,.08)*M;}`),
nfx('vga','vga 16','#ffff55',50,30,`vec3 fx_vga(vec2 uv){
  vec3 c=vid(uv);c+=(bayer4(uv*u_res/(1.+floor(M*3.)))-.47)*(.15+I*.3);
  float bd=1e9;vec3 best=c;
  for(int i=0;i<16;i++){vec3 d=c-VGA[i];float e=dot(d*d,vec3(.3,.59,.11));if(e<bd){bd=e;best=VGA[i];}}
  return best;}`,[BAYER_LIB,VGA_LIB]),
nfx('gboy','handheld lcd','#9bbc0f',55,30,`vec3 fx_gboy(vec2 uv){
  float rows=min(mix(144.,56.,I),u_res.y/4.);vec2 cells=vec2(rows*ASP,rows);vec2 id=floor(uv*cells),f=fract(uv*cells);
  float l=luma(vid((id+.5)/cells));l=clamp(l+(bayer4(id)-.47)*.28,0.,.999);int k=int(l*4.);
  vec3 p=k==0?vec3(.06,.22,.06):k==1?vec3(.19,.38,.19):k==2?vec3(.55,.67,.06):vec3(.61,.74,.06);
  p=mix(p,vec3(float(k)/3.),step(.5,M)*.85);
  return p*(1.-.14*step(.88,max(f.x,f.y)));}`,[BAYER_LIB]),
nfx('ps1','ps1 era','#c0c0c0',55,45,`vec3 fx_ps1(vec2 uv){
  float rows=min(mix(160.,70.,I),u_res.y/3.);vec2 cells=vec2(rows*ASP,rows);vec2 q=floor(uv*cells)/cells;
  vec2 j=vec2(sin(q.y*40.+u_time*2.),cos(q.x*30.+u_time*1.7))*.006*(.4+M);
  vec3 c=vid(q+j+.5/cells);float b=bayer4(uv*cells)-.47;float L=mix(11.,4.,I);return floor(c*L+.5+b*.9)/L;}`,[BAYER_LIB]),
/* dither and line styles */
nfx('bayer','bayer 1-bit','#f4efe1',55,20,`vec3 fx_bayer(vec2 uv){
  float l=clamp((luma(vid(uv))-.5)*(1.+I)+.5,0.,1.);float t=bayer8(uv*u_res/(1.+floor(M*3.)));
  return mix(vec3(.04,.035,.03),vec3(.96,.94,.88),step(t,l));}`,[BAYER_LIB]),
nfx('ign','noise dither','#ffd08a',55,20,`vec3 fx_ign(vec2 uv){
  vec3 c=vid(uv);vec2 p=floor(uv*u_res/(1.+floor(M*2.)));float t=fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));
  float lv=floor(mix(4.,1.,I)+.5);return floor(c*lv+t)/lv;}`),
nfx('linedith','line dither','#eeeeee',55,40,`vec3 fx_linedith(vec2 uv){
  vec3 c=vid(uv);float l=clamp((luma(c)-.5)*(1.+I*.8)+.5,0.,1.);float rows=min(mix(100.,30.,M),u_res.y/6.);
  float d=abs(fract(uv.y*rows)-.5)*2.;float ln=smoothstep(l+.07,l-.07,d);
  return mix(vec3(.04),vec3(.96,.94,.88),ln);}`),
nfx('hatch','crosshatch','#e9e1cf',55,40,`vec3 fx_hatch(vec2 uv){
  float l=luma(vid(uv));vec2 p=uv*u_res;float k=u_res.y/mix(110.,45.,I);float h=0.;
  h+=step(abs(fract((p.x+p.y)/k)-.5)*2.,.3)*step(l,.75);
  h+=step(abs(fract((p.x-p.y)/k)-.5)*2.,.3)*step(l,.5);
  h+=step(abs(fract(p.y/k)-.5)*2.,.3)*step(l,.3);
  h+=step(abs(fract(p.x/k)-.5)*2.,.3)*step(l,.15);
  return mix(vec3(.96,.94,.88),vec3(.08,.07,.1),clamp(h,0.,1.));}`),
nfx('contour','contour map','#e6c07b',55,40,`vec3 fx_contour(vec2 uv){
  vec2 t=1.5/u_res;vec3 c=vid(uv);float l=(luma(c)*2.+luma(vid(uv+vec2(t.x,0.)))+luma(vid(uv-vec2(t.x,0.)))+luma(vid(uv+vec2(0.,t.y)))+luma(vid(uv-vec2(0.,t.y))))/6.;
  float v=l*mix(5.,24.,I);float f=fract(v),d=min(f,1.-f);float w=max(fwidth(v),.002);
  float ln=1.-smoothstep(.6,1.6,d/w);return mix(c*(.45+.55*M),vec3(.05),ln);}`),
nfx('wavel','wave lines','#f0ead8',55,45,`vec3 fx_wavel(vec2 uv){
  vec3 c=vid(uv);float l=luma(c);float rows=min(mix(70.,26.,I),u_res.y/6.);
  float y=uv.y*rows+sin(uv.x*(10.+M*20.)+u_time*.8*M)*.45*l;float d=abs(fract(y)-.5)*2.;
  return mix(vec3(.03),c*1.25+.05,smoothstep(l+.1,l-.1,d));}`),
nfx('sketch','pencil sketch','#e8e2d4',55,40,`vec3 fx_sketch(vec2 uv){
  vec3 c=vid(uv);float l=luma(c);float e=edge(uv,1.+M);
  float v=1.-clamp(smoothstep(.05,.5,e)*(.6+I*.8),0.,1.)*.92;v*=.7+.3*smoothstep(.1,.9,l);
  return vec3(.97,.95,.9)*v;}`),
/* pixel toys */
nfx('stitch','cross stitch','#e07a5f',55,40,`vec3 fx_stitch(vec2 uv){
  float rows=min(mix(80.,26.,I),u_res.y/7.);vec2 cells=vec2(rows*ASP,rows);vec2 g=uv*cells,id=floor(g),f=fract(g);
  vec3 c=vid((id+.5)/cells);float x=min(abs(f.x-f.y),abs(f.x+f.y-1.));
  float st=smoothstep(.22,.1,x)*step(.1,min(min(f.x,f.y),min(1.-f.x,1.-f.y)));
  return mix(vec3(.12,.1,.09)*(.8+.4*hash21(id*3.)),c*(.8+.35*(1.-x)),st);}`),
nfx('mosaic','stained mosaic','#e0a040',50,40,`vec3 fx_mosaic(vec2 uv){
  float n=mix(24.,7.,I);vec2 p=uv*vec2(ASP,1.)*n,ip=floor(p),fp=fract(p);float d1=9.,d2=9.;vec2 ct=vec2(0.);
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 o=vec2(float(i),float(j));vec2 h=vec2(hash21(ip+o),hash21(ip+o+17.));
    vec2 pt=.5+.4*sin(u_time*.5*M+6.2831*h);vec2 r=o+pt-fp;float d=dot(r,r);
    if(d<d1){d2=d1;d1=d;ct=(ip+o+pt)/n;}else if(d<d2)d2=d;}
  vec3 c=vid(clamp(ct/vec2(ASP,1.),0.,1.));return c*mix(.2,1.,smoothstep(0.,.08,sqrt(d2)-sqrt(d1)));}`),
nfx('lego','brick studs','#e3342f',55,40,`vec3 fx_lego(vec2 uv){
  float rows=min(mix(60.,18.,I),u_res.y/8.);vec2 cells=vec2(rows*ASP,rows);vec2 g=uv*cells,id=floor(g),f=fract(g);
  vec3 c=vid((id+.5)/cells);vec2 d=f-.5;float r=length(d);float st=smoothstep(.33,.3,r);
  vec3 o=c*(.82+.2*st);o+=.28*smoothstep(.28,.05,length(d+vec2(.08,-.08)))*st;
  o*=1.-.35*smoothstep(.3,.36,r)*step(r,.42);return o*(1.-.45*step(.94,max(f.x,f.y)));}`),
nfx('ledm','led matrix','#ff6a3d',55,40,`vec3 fx_ledm(vec2 uv){
  float rows=min(mix(90.,28.,I),u_res.y/6.);vec2 cells=vec2(rows*ASP,rows);vec2 g=uv*cells,id=floor(g),f=fract(g);
  vec3 c=vid((id+.5)/cells);float r=length(f-.5);float m=smoothstep(.46,.3,r);
  return c*(m*1.6+.03)+c*.25*smoothstep(.7,.3,r)*M;}`),
/* lens, light, warp, time */
nfx('emboss','relief','#c8c8c8',55,35,`vec3 fx_emboss(vec2 uv){
  vec2 px=(1.+I*2.)/u_res;float e=.5+(luma(vid(uv+px))-luma(vid(uv-px)))*(2.+I*5.);
  return mix(vec3(e),vid(uv)*(e*1.4),M*.8);}`),
nfx('tilt','tilt shift','#a3d977',55,45,`vec3 fx_tilt(vec2 uv){
  float m=smoothstep(.12,.45,abs(uv.y-.5));vec3 s=blur8(uv,m*(.004+I*.016));
  vec3 c=mix(vid(uv),s,smoothstep(0.,.3,m));return mix(vec3(luma(c)),c,1.25+M*.6)*1.05;}`,[BLUR8_LIB]),
nfx('streak','anamorphic streak','#ffb070',55,45,`vec3 fx_streak(vec2 uv){
  vec3 c=vid(uv),s=vec3(0.);float L=.05+M*.2;
  for(int i=-8;i<=8;i++){float t=float(i)/8.;s+=max(vid(uv+vec2(t*L,0.))-.6,0.)*(1.-abs(t));}
  return c+s/8.*vec3(1.,.72,.45)*(1.5+I*5.);}`),
nfx('longexp','long exposure','#ffe0a0',55,60,`vec3 fx_longexp(vec2 uv){
  vec3 c=vid(uv);if(u_chip>.5)return c*vec3(1.12,1.03,.86)+.04;
  vec3 p=texture(u_prev,uv).rgb;c=mix(c,max(c,p*(.86+M*.11)),.4+I*.6);return c*vec3(1.12,1.03,.86)+.04;}`,[],true),
nfx('rgbtear','rgb tear','#ff5050',55,45,`vec3 fx_rgbtear(vec2 uv){
  float row=floor(uv.y*mix(30.,90.,M));float t=floor(u_time*5.);
  float o=(hash21(vec2(row,t))-.5)*(.03+I*.12)*step(.3,hash21(vec2(row,t+4.)))+.004;
  vec3 c=vec3(vid(uv+vec2(o*1.6,0.)).r,vid(uv+vec2(o,0.)).g,vid(uv+vec2(o*.4,0.)).b);return c*(1.+.35*step(.97,hash21(vec2(row,t+9.))));}`),
nfx('fish','fisheye','#d9d9a0',55,45,`vec3 fx_fish(vec2 uv){
  vec2 p=(uv-.5)*vec2(ASP,1.);float r=length(p);p*=1.-(.4+I*1.2)*r*r*(.5+M*.8)*.6;
  return vid(mir(p/vec2(ASP,1.)+.5));}`),
nfx('swirl','swirl','#e8a0ff',55,45,`vec3 fx_swirl(vec2 uv){
  vec2 p=(uv-.5)*vec2(ASP,1.);float r=length(p);float a=(3.+I*7.)*smoothstep(.9,0.,r)*(.7+.3*sin(u_time*(.3+M)));
  float cs=cos(a),sn=sin(a);p=mat2(cs,-sn,sn,cs)*p*(1.-.3*smoothstep(.9,0.,r));return vid(mir(p/vec2(ASP,1.)+.5));}`),
nfx('ripple','ripple','#ffd166',55,45,`vec3 fx_ripple(vec2 uv){
  vec2 d=(uv-.5)*vec2(ASP,1.);float r=length(d);vec2 dir=d/(r+1e-4);
  float w=sin(r*(22.+I*16.)-u_time*(2.+M*6.))*.012*(1.+I*3.);vec2 q=uv+dir*w/vec2(ASP,1.);return vec3(vid(mir(q+dir*.004)).r,vid(mir(q)).g,vid(mir(q-dir*.004)).b);}`),
nfx('acid','acid wash','#ff3df0',55,45,`vec3 fx_acid(vec2 uv){
  vec3 c=vid(uv);float l=luma(c);c=hueRot(c,l*(3.+I*5.)+u_time*.3*M);
  return mix(vec3(luma(c)),c,2.+I*1.2);}`),
nfx('pop','pop art','#ffe000',55,40,`vec3 fx_pop(vec2 uv){
  float l=clamp((luma(vid(uv))-.5)*(1.2+I)+.5,0.,1.);
  float dots=length(fract(uv*vec2(ASP,1.)*min(60.,u_res.y/9.)-.5));
  l+= (.5-dots)*.18*(.4+M);int k=int(clamp(l,0.,.999)*4.);
  return k==0?vec3(.05,.03,.1):k==1?vec3(.86,.1,.2):k==2?vec3(1.,.45,.7):vec3(1.,.88,.1);}`)
].forEach(registerCustom);
Object.assign(FXBY.lcd,{hs:-25});FX_BLUISH.add('holo');
/* new engines */
defineModule({id:'patdith',family:'Dither',name:'Pattern Dither',
  params:[{k:'pat',t:'c',label:'Pattern',opts:['Bayer 8','Dots','Diagonal','Crosshatch','Noise','Gradient noise','Lines'],def:0,sec:'Pattern',hero:true},
    {k:'cell',label:'Cell size',min:1,max:8,def:2,step:.5,sec:'Pattern',hero:true},{k:'lv',label:'Levels',min:2,max:6,def:2,step:1,sec:'Pattern'},
    {k:'con',label:'Contrast',min:0,max:100,def:35,sec:'Pattern'},{k:'col',label:'Keep color',min:0,max:100,def:0,sec:'Colors'},
    {k:'ink',t:'color',label:'Ink',def:'#0c0b0a',sec:'Colors'},{k:'bg',t:'color',label:'Paper',def:'#f4efe1',sec:'Colors'}],
  frag:SS+`
float b2_(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}float b4_(vec2 a){return b2_(a*.5)*.25+b2_(a);}float b8_(vec2 a){return b4_(a*.5)*.25+b2_(a);}
float h21_(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec4 fx(vec2 uv){
  float cs=u_cell*S;vec2 px=uv*uRes/cs,id=floor(px);vec3 c=texture(uSrc,(id+.5)*cs/uRes).rgb;
  float l=clamp((luma(c)-.5)*(1.+u_con/50.)+.5,0.,1.);float t;int p=int(u_pat+.5);
  if(p==0)t=b8_(id);else if(p==1)t=1.-length(fract(px/6.)-.5)*1.4142;else if(p==2)t=fract((px.x+px.y)/4.);
  else if(p==3)t=min(fract((px.x+px.y)/4.),fract((px.x-px.y)/4.));else if(p==4)t=h21_(id);
  else if(p==5)t=fract(52.9829189*fract(dot(id,vec2(.06711056,.00583715))));else t=fract(px.y/3.);
  float n=u_lv-1.;float v=clamp(floor(l*n+t)/n,0.,1.);
  vec3 mono=mix(u_ink,u_bg,v);vec3 cd=floor(c*n+t)/n;
  return vec4(mix(mono,cd,u_col/100.),1.);}`});
defineModule({id:'contour',family:'Lines',name:'Contour Map',
  params:[{k:'n',label:'Levels',min:4,max:40,def:14,step:1,sec:'Lines',hero:true},{k:'w',label:'Line width',min:.5,max:6,def:1.5,step:.25,sec:'Lines',hero:true},
    {k:'con',label:'Contrast',min:0,max:100,def:35,sec:'Lines'},{k:'fill',label:'Band fill',min:0,max:100,def:40,sec:'Fill'},{k:'keep',label:'Keep color',min:0,max:100,def:55,sec:'Fill'},
    {k:'ink',t:'color',label:'Line',def:'#120f0a',sec:'Colors'},{k:'bg',t:'color',label:'Paper',def:'#efe6d0',sec:'Colors'}],
  frag:SS+`
vec4 fx(vec2 uv){
  vec2 t=1.5*S/uRes;vec3 c=texture(uSrc,uv).rgb;
  float l=(luma(c)*2.+luma(texture(uSrc,uv+vec2(t.x,0.)).rgb)+luma(texture(uSrc,uv-vec2(t.x,0.)).rgb)+luma(texture(uSrc,uv+vec2(0.,t.y)).rgb)+luma(texture(uSrc,uv-vec2(0.,t.y)).rgb))/6.;
  l=clamp((l-.5)*(1.+u_con/50.)+.5,0.,1.);float v=l*u_n;float f=fract(v),d=min(f,1.-f),w=max(fwidth(v),.0001);
  float ln=1.-smoothstep(u_w*S*.5,u_w*S*.5+1.2,d/w);
  vec3 base=mix(u_bg,mix(vec3(floor(v)/u_n),c,u_keep/100.),u_fill/100.);
  return vec4(mix(base,u_ink,ln),1.);}`});
defineModule({id:'ridge',family:'Lines',name:'Ridge Lines',
  params:[{k:'rows',label:'Lines',min:16,max:120,def:52,step:1,sec:'Lines',hero:true},{k:'amp',label:'Height',min:0,max:300,def:150,sec:'Lines',hero:true},
    {k:'w',label:'Line width',min:.5,max:4,def:1.2,step:.25,sec:'Lines'},{k:'con',label:'Contrast',min:0,max:100,def:35,sec:'Lines'},{k:'keep',label:'Keep color',min:0,max:100,def:0,sec:'Colors'},
    {k:'ink',t:'color',label:'Line',def:'#f2efe6',sec:'Colors'},{k:'bg',t:'color',label:'Background',def:'#0a0a0a',sec:'Colors'}],
  frag:SS+`
vec4 fx(vec2 uv){
  float pitch=1./u_rows,row0=floor(uv.y/pitch),ink=0.;vec3 lc=u_ink;
  for(int k=-4;k<=4;k++){float ry=(row0+float(k)+.5)*pitch;vec3 s=texture(uSrc,vec2(uv.x,clamp(ry,0.,1.))).rgb;
    float l=clamp((luma(s)-.5)*(1.+u_con/50.)+.5,0.,1.);float cy=ry+l*u_amp/100.*pitch*2.;
    float a=1.-smoothstep(u_w*S*.5,u_w*S*.5+1.2,abs(uv.y-cy)*uRes.y);if(a>ink){ink=a;lc=mix(u_ink,s*1.2+.1,u_keep/100.);}}
  return vec4(mix(u_bg,lc,ink),1.);}`});
async function ensureHuman(){
  if(FACE.human||FACE.loading||performance.now()<FACE.failed)return;FACE.loading=true;toast('Loading the face model…');
  try{
    if(!window.Human)await new Promise((ok,no)=>{const s=document.createElement('script');s.src=HUMAN_BASE+'/dist/human.js';s.onload=ok;s.onerror=()=>no(new Error('script'));document.head.appendChild(s);});
    const h=new window.Human.Human({backend:'webgl',async:true,cacheSensitivity:.85,modelBasePath:HUMAN_BASE+'/models/',filter:{enabled:false},
      face:{enabled:true,detector:{enabled:true,rotation:false,maxDetected:1,minConfidence:.35},mesh:{enabled:true},iris:{enabled:false},description:{enabled:false},emotion:{enabled:false}},
      body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},segmentation:{enabled:false}});
    await h.load();FACE.human=h;toast('Face model ready');
  }catch(e){FACE.failed=performance.now()+30000;toast('Face effects need a connection the first time. Try again in a moment.');}
  FACE.loading=false;
}
/* source pixel -> layer uv: undo the source fit (cover) done by the source pass, the vertical flip and the mirror */
function faceToUV(x,y,vw,vh){
  let sx=x/vw;if(SRC.mirror)sx=1-sx;const sy=1-y/vh;
  const sa=SRC.w/SRC.h,da=(ST.DW||canvas.width)/(ST.DH||canvas.height),r=da/sa,s=r>1?[1,1/r]:[r,1];
  return[(sx-.5)/s[0]+.5,(sy-.5)/s[1]+.5,s];
}
async function faceTick(){
  const now=performance.now();if(FACE.busy||now-FACE.last<110||!SRC.el)return;
  if(!FACE.human){ensureHuman();return;}
  const isVid=SRC.el instanceof HTMLVideoElement;if(!isVid&&FACE.ver===SRC.ver)return;
  FACE.last=now;FACE.busy=true;
  try{
    const res=await FACE.human.detect(SRC.el),f=res.face&&res.face[0];
    if(isVid===false)FACE.ver=SRC.ver;
    const[vw,vh]=srcDims(SRC.el);
    if(f&&f.mesh&&f.mesh.length>400&&f.box){
      const[cx,cy,s]=faceToUV(f.box[0]+f.box[2]/2,f.box[1]+f.box[3]/2,vw,vh),a=.5;
      const tgt=[cx,cy,Math.abs(f.box[2]/2/vw/s[0])*.95,Math.abs(f.box[3]/2/vh/s[1])*1.05];
      FACE.face=FACE.ok?FACE.face.map((v,i)=>v+(tgt[i]-v)*a):tgt;
      const E=(i,j)=>{const p=f.mesh[i],q=f.mesh[j];return faceToUV((p[0]+q[0])/2,(p[1]+q[1])/2,vw,vh);};
      const el=E(33,133),er=E(362,263);FACE.eL=[el[0],el[1]];FACE.eR=[er[0],er[1]];
      for(let i=0;i<42;i++){const p=f.mesh[Math.min(467,i*11)],u=faceToUV(p[0],p[1],vw,vh);FACE.pts[i*2]=u[0];FACE.pts[i*2+1]=u[1];}
      FACE.ok=true;FACE.miss=0;
    }else if(++FACE.miss>5)FACE.ok=false;
  }catch(e){FACE.miss++;}
  FACE.busy=false;
}
loadCustomAll();
function openEditor(){
  if($('.sheet'))return;const l=layer();if(l.module!=='fuse')return;
  const sh=el('div','sheet'),box=el('div','rollbox','<h3>Your effect</h3>');sh.appendChild(box);
  const ta=document.createElement('textarea');ta.className='gq ed';ta.spellcheck=false;ta.value=CUSTOM_TEMPLATE;ta.setAttribute('aria-label','Effect code');
  const nm=document.createElement('input');nm.className='gq';nm.placeholder='Name (or set DESCRIPTION in the header)';nm.setAttribute('aria-label','Effect name');
  const st=el('p','edst','');const row=el('div','pe');
  const sv=el('button','btn primary','Save'),im=el('button','btn','Import .fs'),ex=el('button','btn','Export .fs'),cl=el('button','btn','Close'),fi=document.createElement('input');fi.type='file';fi.accept='.fs,.glsl,.txt';fi.hidden=true;
  const lib=el('div','pe');box.append(ta,nm,st,row,lib,fi);row.append(sv,im,ex,cl);document.body.appendChild(sh);
  let tm=0,cur=null,seq=0;
  const check=()=>{const my=++seq;st.textContent='Checking…';st.className='edst';
    try{const fx=parseCustom(ta.value,'draft');fx.label=nm.value.trim()||fx.label;
      const h=mkProgAsync(VS,MODULES.fuse.build(fuseFrag([fx,null,null,null]),MODULES.fuse.params));
      const poll=()=>{if(my!==seq)return;const s=h.poll();if(s==='ok'){cur=fx;st.textContent='Compiles. Previewing on step 1.';st.className='edst ok';registerCustom(fx);l.params.f1=fxIndex('c_draft');l.params.on1=true;}else if(s==='err'){cur=null;st.textContent=h.err;st.className='edst bad';}else setTimeout(poll,40);};poll();
    }catch(e){cur=null;st.textContent=e.message;st.className='edst bad';}};
  ta.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(check,450);});nm.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(check,450);});
  const close=()=>{sh.remove();renderInspector();};cl.addEventListener('click',close);sh.addEventListener('pointerdown',e=>{if(e.target===sh)close();});
  sv.addEventListener('click',()=>{if(!cur){toast('Fix the error first');return;}
    const id=(cur.label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'effect')+'_'+Date.now().toString(36).slice(-4);
    const all=loadCustomSrc();all.push({id,src:ta.value,label:cur.label});try{localStorage.setItem(CUSTOM_KEY,JSON.stringify(all.slice(-30)));}catch(e){toast('This browser won’t store effects');return;}
    const fx={...parseCustom(ta.value,id),label:cur.label};registerCustom(fx);fuseSet(l,1,fx.id);toast('Saved '+fx.label);drawLib();});
  im.addEventListener('click',()=>fi.click());fi.addEventListener('change',async()=>{const f=fi.files[0];if(!f)return;ta.value=await f.text();if(!nm.value)nm.value=f.name.replace(/\.[^.]+$/,'');check();});
  ex.addEventListener('click',()=>{const b=new Blob([ta.value],{type:'text/plain'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(nm.value||cur&&cur.label||'effect').replace(/[^a-z0-9_-]+/gi,'_')+'.fs';document.body.appendChild(a);a.click();a.remove();});
  const drawLib=()=>{lib.innerHTML='';loadCustomSrc().forEach(c=>{const b=el('button','',c.label||c.id);b.addEventListener('click',()=>{ta.value=c.src;nm.value=c.label||'';check();});
    const x=el('button','','×');x.setAttribute('aria-label','Delete '+c.label);x.addEventListener('click',()=>{localStorage.setItem(CUSTOM_KEY,JSON.stringify(loadCustomSrc().filter(q=>q.id!==c.id)));drawLib();toast('Deleted. Reload to remove it from the list.');});lib.append(b,x);});};
  drawLib();check();
}

/*WP6:BEGIN new effect modules: pixel sort, riso, engraving, security cam, datamosh */
const HISTRT={};
const histRT=(id,w,h)=>{const k=id+w+'x'+h;return HISTRT[k]||(HISTRT[k]=mkRT(w,h,{hdr:true}));};
const histBind=(pr,id,ctx)=>samp(pr,'u_prev',2,histRT(id,ctx.W,ctx.H).tex);
const histSave=(id,ctx)=>{if(!ctx.out||!ctx.out.tex)return;const c=PR.copy;bindRT(histRT(id,ctx.W,ctx.H));c.use();samp(c,'uT',0,ctx.out.tex);draw();};
defineModule({id:'psort',family:'Glitch',name:'Pixel Sort',
  params:[
    {k:'len',label:'Run length',min:4,max:32,def:24,sec:'Sort',hero:true},{k:'stride',label:'Stretch',min:1,max:8,def:3,step:.5,sec:'Sort',hero:true},
    {k:'thr',t:'range2',label:'Sort range',min:0,max:100,def:[8,92],sec:'Sort'},
    {k:'key',t:'c',label:'Sort by',opts:['Brightness','Red','Green','Blue','Saturation'],def:0,sec:'Sort'},
    {k:'vert',t:'b',label:'Vertical',def:false,sec:'Sort'},{k:'rev',t:'b',label:'Brightest first',def:false,sec:'Sort'}],
  frag:SS+`
float key(vec3 c){int k=int(u_key+.5);return k==1?c.r:k==2?c.g:k==3?c.b:k==4?(max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b))):luma(c);}
vec3 sm(vec2 p){return texture(uSrc,u_vert>.5?p.yx:p).rgb;}
vec4 fx(vec2 uv){
  vec2 p=u_vert>.5?uv.yx:uv;float px=1./(u_vert>.5?uRes.y:uRes.x);float st=max(1.,u_stride*S)*px;
  float lo=u_thr.x/100.,hi=max(u_thr.y/100.,lo+.02);
  vec3 c0=sm(p);float k0=key(c0);if(k0<lo||k0>hi)return vec4(c0,1.);
  float a=0.,b=0.;
  for(int i=1;i<=32;i++){if(float(i)>u_len)break;float k=key(sm(p-vec2(float(i)*st,0.)));if(k<lo||k>hi)break;a=float(i);}
  for(int i=1;i<=32;i++){if(float(i)>u_len)break;float k=key(sm(p+vec2(float(i)*st,0.)));if(k<lo||k>hi)break;b=float(i);}
  float n=a+b+1.;float h[16];for(int j=0;j<16;j++)h[j]=0.;
  for(int i=-32;i<=32;i++){float fi=float(i);if(fi<-a||fi>b)continue;float k=key(sm(p+vec2(fi*st,0.)));h[int(clamp((k-lo)/(hi-lo),0.,.999)*16.)]+=1.;}
  float t=(a+.5)/n;if(u_rev>.5)t=1.-t;float tg=t*n,cum=0.;int bk=15;
  for(int j=0;j<16;j++){cum+=h[j];if(cum>=tg){bk=j;break;}}
  vec3 acc=vec3(0.);float w=0.;
  for(int i=-32;i<=32;i++){float fi=float(i);if(fi<-a||fi>b)continue;vec3 c=sm(p+vec2(fi*st,0.));float k=key(c);if(int(clamp((k-lo)/(hi-lo),0.,.999)*16.)==bk){acc+=c;w+=1.;}}
  return vec4(w>0.?acc/w:c0,1.);}`});
defineModule({colorBound:true,hideOnOrig:['ia','ib','ic','pap'],id:'riso',family:'Print',name:'Riso',
  defaultLook:{paper:'#f3ead8',ink:'#ff4fa6',palette:null},
  params:[
    {k:'cell',label:'Dot size',min:3,max:20,def:6,step:.5,sec:'Print',hero:true},{k:'reg',label:'Misregistration',min:0,max:12,def:3,step:.5,sec:'Print',hero:true},
    {k:'con',label:'Contrast',min:0,max:100,def:45,sec:'Print'},{k:'ang',label:'Screen angle',min:0,max:90,def:0,sec:'Print'},
    {k:'grain',label:'Ink texture',min:0,max:100,def:45,sec:'Texture'},
    {k:'ia',t:'color',label:'Ink 1',def:'#ff4fa6',sec:'Inks'},{k:'ib',t:'color',label:'Ink 2',def:'#ffd800',sec:'Inks'},{k:'ic',t:'color',label:'Ink 3',def:'#0fa86a',sec:'Inks'},
    {k:'pap',t:'color',label:'Paper',def:'#f3ead8',sec:'Inks'}],
  frag:SS+`
float dotk(vec2 px,float ang,float cell,float tone){float s=sin(ang),c=cos(ang);vec2 p=vec2(c*px.x+s*px.y,-s*px.x+c*px.y)/cell;vec2 f=fract(p)-.5;return smoothstep(sqrt(clamp(tone,0.,1.))*.72+.06,sqrt(clamp(tone,0.,1.))*.72-.06,length(f));}
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;float cell=u_cell*S,ct=1.+u_con/50.,r=u_reg*S;
  vec2 oa=vec2(r,-r*.6),ob=vec2(-r*.8,r),oc=vec2(r*.3,r*.9);
  float ta=1.-texture(uSrc,uv+oa/uRes).g,tb=1.-texture(uSrc,uv+ob/uRes).b,tc=1.-texture(uSrc,uv+oc/uRes).r;
  ta=clamp((ta-.5)*ct+.5,0.,1.);tb=clamp((tb-.5)*ct+.5,0.,1.);tc=clamp((tc-.5)*ct+.5,0.,1.);
  float a0=u_ang*PI/180.;
  float ca=dotk(px+oa,a0+.26,cell,ta),cb=dotk(px+ob,a0+1.31,cell,tb),cc=dotk(px+oc,a0+.79,cell,tc);
  float dn=1.-u_grain/100.*(vnoise(px*.8/S)*.6+h21(floor(px/S))*.4)*.6;
  ca*=dn;cb*=dn;cc*=dn;
  vec3 col=u_pap*(1.-.05*u_grain/100.*vnoise(px*.4/S));
  col*=mix(vec3(1.),u_ia,ca);col*=mix(vec3(1.),u_ib,cb);col*=mix(vec3(1.),u_ic,cc);
  return vec4(col,1.);}`});
defineModule({colorBound:true,hideOnOrig:['ink','bg'],id:'engrave',family:'Lines',name:'Engraving',
  defaultLook:{paper:'#f2ead3',ink:'#1a1208',palette:null},
  params:[
    {k:'pitch',label:'Line spacing',min:3,max:20,def:7,step:.5,sec:'Lines',hero:true},{k:'ang',label:'Angle',min:0,max:180,def:35,sec:'Lines',hero:true},
    {k:'warp',label:'Follow tone',min:0,max:100,def:45,sec:'Lines'},{k:'wave',label:'Wave',min:0,max:100,def:20,sec:'Lines'},
    {k:'hatch',label:'Cross hatch',min:0,max:100,def:55,sec:'Lines'},{k:'con',label:'Contrast',min:0,max:100,def:35,sec:'Lines'},
    {k:'ink',t:'color',label:'Ink',def:'#1a1208',sec:'Colors'},{k:'bg',t:'color',label:'Paper',def:'#f2ead3',sec:'Colors'}],
  frag:SS+`
float ln(vec2 px,float a,float pitch,float shift,float w,float aa){vec2 n=vec2(-sin(a),cos(a));float k=dot(px,n)/pitch+shift;float d=abs(fract(k)-.5)*2.;return w<=.001?0.:smoothstep(w+aa,w-aa,d);}
vec4 fx(vec2 uv){
  vec2 px=uv*uRes,t=1.5*S/uRes;
  float l=(luma(texture(uSrc,uv).rgb)*2.+luma(texture(uSrc,uv+vec2(t.x,0.)).rgb)+luma(texture(uSrc,uv-vec2(t.x,0.)).rgb)+luma(texture(uSrc,uv+vec2(0.,t.y)).rgb)+luma(texture(uSrc,uv-vec2(0.,t.y)).rgb))/6.;
  l=clamp((l-.5)*(1.+u_con/50.)+.5,0.,1.);
  float a=u_ang*PI/180.,pitch=u_pitch*S,aa=1.2/pitch;
  float sh=(l-.5)*u_warp/8.+sin(dot(px,vec2(cos(a),sin(a)))*.03/S)*u_wave/20.;
  float k1=ln(px,a,pitch,sh,(1.-l)*.9+.05,aa);
  float w2=clamp((u_hatch/100.-l)*1.6,0.,1.)*.8,w3=clamp((u_hatch/100.*.55-l)*1.8,0.,1.)*.8;
  float k2=ln(px,a+1.05,pitch,sh*.5,w2,aa),k3=ln(px,a+2.1,pitch*.9,0.,w3,aa);
  return vec4(mix(u_bg,u_ink,max(k1,max(k2,k3))),1.);}`});
defineModule({id:'seccam',family:'Signal / CRT',name:'Security Cam',
  params:[
    {k:'desat',label:'Desaturate',min:0,max:100,def:88,sec:'Capture',hero:true},{k:'lvl',label:'Levels',min:4,max:24,def:10,step:1,sec:'Capture',hero:true},
    {k:'soft',label:'Soft focus',min:0,max:100,def:45,sec:'Capture'},{k:'comb',label:'Interlace',min:0,max:100,def:55,sec:'Capture'},
    {k:'blk',label:'Compression blocks',min:0,max:100,def:25,sec:'Capture'},{k:'glitch',label:'Tracking glitch',min:0,max:100,def:35,sec:'Capture'},
    {k:'grain',label:'Noise',min:0,max:100,def:35,sec:'Capture'},
    {k:'ovl',t:'b',label:'Timestamp and REC',def:true,sec:'Overlay'},{k:'t0',label:'Clock start (hour)',min:0,max:23,def:3,sec:'Overlay'}],
  frag:SS+`
const int DM[10]=int[10](63,6,91,79,102,109,125,7,127,111);
float seg(vec2 q,int m){float r=0.;
  if((m&1)!=0&&q.x>.12&&q.x<.88&&q.y>1.86&&q.y<2.)r=1.;
  if((m&2)!=0&&q.x>.86&&q.x<1.&&q.y>1.06&&q.y<1.94)r=1.;
  if((m&4)!=0&&q.x>.86&&q.x<1.&&q.y>.06&&q.y<.94)r=1.;
  if((m&8)!=0&&q.x>.12&&q.x<.88&&q.y>0.&&q.y<.14)r=1.;
  if((m&16)!=0&&q.x>0.&&q.x<.14&&q.y>.06&&q.y<.94)r=1.;
  if((m&32)!=0&&q.x>0.&&q.x<.14&&q.y>1.06&&q.y<1.94)r=1.;
  if((m&64)!=0&&q.x>.12&&q.x<.88&&q.y>.93&&q.y<1.07)r=1.;return r;}
float stamp(vec2 px){
  float cw=9.*S,ch=18.*S,gap=5.*S,slot=cw+gap,mg=12.*S;
  vec2 o=vec2(uRes.x-8.*slot-mg+gap,uRes.y-mg-ch);vec2 lc=px-o;if(lc.y<0.||lc.y>ch||lc.x<0.)return 0.;
  int idx=int(floor(lc.x/slot));if(idx>7)return 0.;
  vec2 q=vec2((lc.x-float(idx)*slot)/cw,lc.y/(ch*.5));if(q.x>1.)return 0.;
  if(idx==2||idx==5)return (q.x>.3&&q.x<.65&&((q.y>.5&&q.y<.85)||(q.y>1.2&&q.y<1.55)))?1.:0.;
  int sec=int(u_t0*3600.+uTime);int hh=(sec/3600)%24,mm=(sec/60)%60,ss=sec%60;int d=0;
  if(idx==0)d=hh/10;else if(idx==1)d=hh%10;else if(idx==3)d=mm/10;else if(idx==4)d=mm%10;else if(idx==6)d=ss/10;else d=ss%10;
  return seg(q,DM[d]);}
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;
  float by=fract(uTime*.11),band=smoothstep(.03,0.,abs(uv.y-by))*u_glitch/100.;
  vec2 u2=uv;u2.x+=band*(h11(floor(uTime*20.))-.5)*.09+band*.02*sin(uv.y*400.);
  float odd=mod(floor(px.y),2.),fld=mod(floor(uTime*30.),2.);
  u2.x+=(odd==fld?1.:0.)*u_comb/100.*3.*S/uRes.x;
  float B=8.*S;vec2 bid=floor(px/B);float hb=h21(bid+floor(uTime*2.));
  vec2 uc=(bid+.5)*B/uRes;u2=mix(u2,uc,step(hb,u_blk/100.*.5));
  vec2 r=(1.2+u_soft/20.)*S/uRes;
  vec3 c=(texture(uSrc,u2).rgb*2.+texture(uSrc,u2+vec2(r.x,0.)).rgb+texture(uSrc,u2-vec2(r.x,0.)).rgb+texture(uSrc,u2+vec2(0.,r.y)).rgb+texture(uSrc,u2-vec2(0.,r.y)).rgb)/6.;
  c=clamp((c-.1)/.8,0.,1.);c=floor(c*u_lvl+.5)/u_lvl;
  float g=luma(c);vec3 col=mix(c,vec3(g)*vec3(.82,1.,.86),u_desat/100.);
  col*=1.-smoothstep(.4,1.1,length((uv-.5)*vec2(uRes.x/uRes.y,1.)))*.55;
  col+=(h21(px+fract(uTime)*173.)-.5)*u_grain/100.*.25;
  if(u_ovl>.5){
    float st=stamp(px);col=mix(col,vec3(.92,1.,.92),st*.9);
    vec2 dq=px-vec2(18.*S+8.*S,uRes.y-12.*S-9.*S);if(length(dq)<7.*S&&fract(uTime*.9)<.6)col=vec3(.95,.1,.1);}
  return vec4(clamp(col,0.,1.),1.);}`});
defineModule({id:'mosh',family:'Glitch',name:'Datamosh',
  params:[
    {k:'blk',label:'Block size',min:8,max:64,def:24,step:4,sec:'Blocks',hero:true},{k:'mis',label:'Wrong blocks',min:0,max:100,def:35,sec:'Blocks',hero:true},
    {k:'mov',label:'Motion',min:0,max:100,def:55,sec:'Smear'},{k:'hold',label:'Hold',min:0,max:100,def:92,sec:'Smear'},
    {k:'iframe',label:'Fresh frame every (s)',min:0,max:12,def:6,sec:'Smear'}],
  hist:true,
  frag:SS+`
uniform sampler2D u_prev;
vec4 fx(vec2 uv){
  float B=u_blk*S;vec2 bid=floor(uv*uRes/B);
  vec2 mv=curl(bid*.17+uTime*.07+uSeed)*u_mov/100.*.025;
  float hb=h21(bid+floor(uTime*1.5)+uSeed);
  vec2 wrong=(vec2(h21(bid+3.1),h21(bid+7.7))-.5)*.16*step(hb,u_mis/100.*.5);
  vec3 cur=texture(uSrc,uv+wrong).rgb;
  vec3 hold=texture(u_prev,clamp(uv-mv,0.,1.)).rgb;
  float diff=length(texture(uSrc,uv).rgb-hold);
  float keep=u_hold/100.*(1.-smoothstep(.3,.8,diff));
  float ifr=u_iframe>0.?step(fract(uTime/u_iframe),.03):0.;
  return vec4(mix(cur,hold,keep*(1.-ifr)),1.);}`,
  bind(pr,V,ctx){histBind(pr,'mosh',ctx);},after(pr,V,ctx){histSave('mosh',ctx);}});
/*WP6:END*/


/* =====================================================================
   Subject effects. Each reads the stage's matte (uAux, 1 inside the subject) from src/matte.js.
   ===================================================================== */
const AUXBIND=(pr,ctx)=>{samp(pr,'uAux',1,ctx.mask||TEX.src);};
defineModule({id:'solid',family:'Subject',name:'Solid',needsMask:true,
  defaultLook:{paper:'#a4532f',ink:'#ead8c4',palette:null},
  params:[
    {k:'sub',t:'color',label:'Subject colour',def:'#ead8c4',sec:'Colours'},{k:'bg',t:'color',label:'Background colour',def:'#a4532f',sec:'Colours'},
    {k:'soft',label:'Edge softness',min:0,max:100,def:25,sec:'Shape',hero:true},{k:'keep',label:'Keep shading',min:0,max:100,def:20,sec:'Shape',hero:true},
    {k:'flip',t:'b',label:'Swap colours',def:false,sec:'Colours'}],
  frag:`vec4 fx(vec2 uv){float m=texture(uAux,uv).r;float s=u_soft/200.+.02;m=smoothstep(.5-s,.5+s,m);
  float l=luma(texture(uSrc,uv).rgb),k=u_keep/100.;vec3 sc=u_sub*mix(1.,.5+.9*l,k),bc=u_bg*mix(1.,.5+.9*l,k*.6);
  if(u_flip>.5){vec3 t=sc;sc=bc;bc=t;}return vec4(mix(bc,sc,m),1.);}`,
  bind(pr,V,ctx){AUXBIND(pr,ctx);}});
defineModule({id:'contour',family:'Subject',name:'Contour',needsMask:true,
  defaultLook:{paper:'#101010',ink:'#f2efe6',palette:null},
  params:[
    {k:'wid',label:'Stroke width',min:1,max:40,def:6,step:.5,sec:'Stroke',hero:true},{k:'col',t:'color',label:'Stroke colour',def:'#f2efe6',sec:'Stroke'},
    {k:'glow',label:'Glow',min:0,max:100,def:45,sec:'Stroke',hero:true},{k:'side',t:'c',label:'Stroke sits',opts:['Outside','Centred','Inside'],def:0,sec:'Stroke'},
    {k:'fill',t:'c',label:'Picture',opts:['Source','Dimmed','Flat dark'],def:1,sec:'Picture'}],
  frag:SS+`float M(vec2 p){return texture(uAux,p).r;}
vec4 fx(vec2 uv){vec2 px=1./uRes;float w=u_wid*S*.5;float m=M(uv),mx=0.,mn=1.;
  for(int i=0;i<16;i++){float a=float(i)*.3927;float v=M(uv+vec2(cos(a),sin(a))*w*px);mx=max(mx,v);mn=min(mn,v);}
  float e;int sd=int(u_side+.5);
  if(sd==0)e=smoothstep(.35,.65,mx)*(1.-smoothstep(.35,.65,m));else if(sd==1)e=smoothstep(.35,.65,mx)*(1.-smoothstep(.35,.65,mn));else e=smoothstep(.35,.65,m)*(1.-smoothstep(.35,.65,mn));
  float g=0.;for(int i=0;i<16;i++){float a=float(i)*.3927+.2;g+=M(uv+vec2(cos(a),sin(a))*w*px*5.)+M(uv+vec2(cos(a),sin(a))*w*px*9.)*.5;}
  g/=24.;float glow=u_glow/100.*g*(1.-smoothstep(.35,.65,m));
  vec3 src=texture(uSrc,uv).rgb;int f=int(u_fill+.5);vec3 base=f==0?src:f==1?src*.18:vec3(.03);
  return vec4(base+u_col*glow*.9+(u_col-base)*e,1.);}`,
  bind(pr,V,ctx){AUXBIND(pr,ctx);}});
defineModule({id:'sigbody',family:'Subject',name:'Signal Body',needsMask:true,
  defaultLook:{paper:'#101010',ink:'#ffb347',palette:null},
  params:[
    {k:'fxn',t:'c',label:'Effect',opts:['Static','Scanlines','Dither','Tear','Posterise'],def:2,sec:'Signal',hero:true},{k:'where',t:'c',label:'Applies',opts:['Inside the subject','Outside the subject'],def:0,sec:'Signal'},
    {k:'amt',label:'Amount',min:0,max:100,def:85,sec:'Signal',hero:true},{k:'scl',label:'Scale',min:2,max:80,def:24,sec:'Signal'},
    {k:'spd',label:'Speed',min:0,max:100,def:40,sec:'Signal'},{k:'tint',t:'color',label:'Ink',def:'#ffb347',sec:'Signal'}],
  frag:SS+`vec4 fx(vec2 uv){vec3 c=texture(uSrc,uv).rgb;float m=texture(uAux,uv).r;m=smoothstep(.3,.7,m);if(u_where>.5)m=1.-m;
  float sc=max(1.,u_scl*S/4.),tt=floor(uTime*u_spd*.12);vec2 p=uv*uRes/sc;vec3 r=c;int f=int(u_fxn+.5);float l=luma(c);
  if(f==0){float n=h21(floor(p)+tt*7.13+uSeed);r=c*(.45+.6*n)+u_tint*(n-.5)*.5;}
  else if(f==1){r=c*(.4+.6*(.5+.5*sin(uv.y*uRes.y/sc*PI*2.+tt)))+u_tint*.06;}
  else if(f==2){float n=fract(dot(floor(p),vec2(.754877,.569840))+tt*.37);r=mix(vec3(.05,.045,.04),u_tint,step(n,l));}
  else if(f==3){float sh=(h11(floor(uv.y*uRes.y/(sc*2.))+tt*3.1+uSeed)-.5)*.18*step(.55,h11(floor(uv.y*uRes.y/(sc*2.))*1.7+tt));r=texture(uSrc,uv+vec2(sh,0.)).rgb;r.r=texture(uSrc,uv+vec2(sh*1.4,0.)).r;r.b=texture(uSrc,uv+vec2(sh*.6,0.)).b;}
  else{r=floor(c*4.+.5)/4.;r=mix(r,r*u_tint*1.6,.35);}
  return vec4(mix(c,r,m*u_amt/100.),1.);}`,
  bind(pr,V,ctx){AUXBIND(pr,ctx);}});
defineModule({id:'bgrep',family:'Subject',name:'Background Replace',needsMask:true,
  defaultLook:{paper:'#e8d8c4',ink:'#9a4a2c',palette:null},
  params:[
    {k:'bm',t:'c',label:'Background',opts:['Colour','Gradient','Stripes','Noise field','Image'],def:1,sec:'Background',hero:true},
    {k:'ca',t:'color',label:'Colour A',def:'#e8d8c4',sec:'Background'},{k:'cb',t:'color',label:'Colour B',def:'#9a4a2c',sec:'Background'},
    {k:'scl',label:'Scale',min:5,max:100,def:40,sec:'Background'},{k:'spd',label:'Speed',min:0,max:100,def:25,sec:'Background'},
    {k:'soft',label:'Edge softness',min:0,max:100,def:30,sec:'Subject'},{k:'img',t:'image',label:'Image',sec:'Background'}],
  frag:SS+`uniform sampler2D uBgImg;uniform float uHasImg;
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
vec4 fx(vec2 uv){float m=texture(uAux,uv).r;float s=u_soft/200.+.02;m=smoothstep(.5-s,.5+s,m);vec3 c=texture(uSrc,uv).rgb;
  int f=int(u_bm+.5);float tt=uTime*u_spd*.02;vec3 bg=u_ca;
  if(f==1){float g=.5+.5*sin((uv.y*1.4+uv.x*.6)*PI*(u_scl/30.)+tt*3.);bg=mix(u_ca,u_cb,g);}
  else if(f==2){float st=step(.5,fract((uv.x*uRes.x/uRes.y+uv.y*.4)*u_scl/6.+tt));bg=mix(u_ca,u_cb,st);}
  else if(f==3){float n=vn(uv*vec2(uRes.x/uRes.y,1.)*u_scl/8.+tt)*.65+vn(uv*vec2(uRes.x/uRes.y,1.)*u_scl/3.-tt)*.35;bg=mix(u_ca,u_cb,smoothstep(.25,.75,n));}
  else if(f==4&&uHasImg>.5)bg=texture(uBgImg,vec2(uv.x,1.-uv.y)).rgb;
  return vec4(mix(bg,c,m),1.);}`,
  bind(pr,V,ctx){AUXBIND(pr,ctx);const t=MAPIMG[ctx.layer&&ctx.layer.uid];pr.f('uHasImg',t?1:0);if(t){gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,t);pr.i('uBgImg',3);gl.activeTexture(gl.TEXTURE0);}}});
/* Echo: a ring of past frames (colour + matte, half size, in one atlas). Trails are the subject's earlier positions. */
const ECH={rt:null,head:0,last:-9,key:'',prog:null};
const F_ECAP=HEAD+`uniform sampler2D uC,uM;void main(){o=vec4(texture(uC,vUv).rgb,texture(uM,vUv).r);}`;
defineModule({id:'echo',family:'Subject',name:'Echo',needsMask:true,
  defaultLook:{paper:'#101010',ink:'#ff7a3d',palette:null},
  params:[
    {k:'cnt',label:'Echoes',min:1,max:8,def:7,sec:'Trail',hero:true},{k:'dly',label:'Delay (ms)',min:30,max:400,def:110,sec:'Trail',hero:true},
    {k:'fade',label:'Fade',min:20,max:95,def:82,sec:'Trail'},{k:'hue',label:'Colour shift',min:-180,max:180,def:38,sec:'Trail'},
    {k:'mode',t:'c',label:'Trail is',opts:['Silhouette','Ghost'],def:0,sec:'Trail'},{k:'dr',label:'Drift',min:0,max:100,def:55,sec:'Trail'}],
  frag:`uniform sampler2D uAtlas;uniform float uHead;
vec4 cell(int k,vec2 uv){float idx=mod(uHead-1.-float(k)+8.,8.);vec2 c=vec2(mod(idx,4.),floor(idx/4.));return texture(uAtlas,(c+clamp(uv,0.,1.))/vec2(4.,2.));}
vec4 fx(vec2 uv){vec3 col=texture(uSrc,uv).rgb;float m=smoothstep(.3,.7,texture(uAux,uv).r);
  for(int k=7;k>=0;k--){if(float(k)>=u_cnt)continue;float age=float(k+1);
    vec4 e=cell(k,uv+vec2(0.,1.)*u_dr/100.*.012*age);float a=e.a*pow(u_fade/100.,age);
    vec3 ec=u_mode<.5?hueRot(vec3(1.,.5,.18),radians(u_hue)*age)*(.55+.55*luma(e.rgb)):hueRot(e.rgb,radians(u_hue)*age);
    col=mix(col,ec,a*(1.-m));}
  return vec4(col,1.);}`,
  bind(pr,V,ctx){AUXBIND(pr,ctx);const W=ctx.W,H=ctx.H,cw=Math.max(32,W>>1),ch=Math.max(32,H>>1),key=cw+'x'+ch;
    if(!ECH.rt||ECH.key!==key){if(ECH.rt)freeRT(ECH.rt);ECH.rt=mkRT(cw*4,ch*2,{});ECH.key=key;ECH.head=0;ECH.last=-9;}
    samp(pr,'uAtlas',2,ECH.rt.tex);pr.f('uHead',ECH.head);},
  after(pr,V,ctx){const dly=V.dly/1000;
    if(!window.__benching&&ctx.t-ECH.last<dly&&ctx.t>=ECH.last)return;ECH.last=ctx.t;
    const cw=ECH.rt.w/4,ch=ECH.rt.h/2,i=ECH.head,cp=ECH.prog||(ECH.prog=mkProg(VS,F_ECAP));
    bindRT(ECH.rt);gl.viewport((i%4)*cw,((i/4)|0)*ch,cw,ch);cp.use();samp(cp,'uC',0,ctx.inTex);samp(cp,'uM',1,ctx.mask||ctx.inTex);draw();gl.viewport(0,0,ECH.rt.w,ECH.rt.h);
    ECH.head=(i+1)%8;}});
/* =====================================================================
   Generators: sources that make their own picture (Source family). "Picture" lets the image underneath bend the pattern.
   ===================================================================== */
const GENP=(a,b)=>[{k:'ca',t:'color',label:'Ink',def:a,sec:'Colour'},{k:'cb',t:'color',label:'Ground',def:b,sec:'Colour'},{k:'pic',label:'Picture bends it',min:0,max:100,def:0,sec:'Pattern'}];
const GENF=`vec2 gp(vec2 uv){return (uv-.5)*vec2(uRes.x/uRes.y,1.);}float pl_(vec2 uv){return luma(texture(uSrc,uv).rgb);}`;
defineModule({id:'moire',family:'Source',name:'Moire',defaultLook:{paper:'#f0e8d8',ink:'#1a1a1a',palette:null},
  params:[{k:'f',label:'Line density',min:4,max:120,def:38,sec:'Pattern',hero:true},{k:'ang',label:'Angle between',min:0,max:45,def:6,step:.1,sec:'Pattern',hero:true},
    {k:'spd',label:'Drift',min:0,max:100,def:25,sec:'Motion'},{k:'sh',label:'Edge sharpness',min:0,max:100,def:60,sec:'Pattern'}].concat(GENP('#1a1a1a','#f0e8d8')),
  frag:SS+GENF+`vec4 fx(vec2 uv){vec2 p=gp(uv);float ph=pl_(uv)*u_pic/12.;float a=radians(u_ang)*(1.+.5*sin(uTime*u_spd*.02));
  float g1=sin((p.x*cos(.2)+p.y*sin(.2))*u_f*6.283+ph),g2=sin((p.x*cos(.2+a)+p.y*sin(.2+a))*u_f*6.283*1.012+uTime*u_spd*.03);
  float v=smoothstep(-.1-(1.-u_sh/100.)*.9,.1+(1.-u_sh/100.)*.9,g1*g2);return vec4(mix(u_cb,u_ca,v),1.);}`});
defineModule({id:'interf',family:'Source',name:'Interference',defaultLook:{paper:'#16110e',ink:'#d9531e',palette:null},
  params:[{k:'n',label:'Sources',min:2,max:5,def:3,step:1,sec:'Pattern',hero:true},{k:'f',label:'Wavelength',min:4,max:80,def:22,sec:'Pattern',hero:true},
    {k:'spd',label:'Speed',min:0,max:100,def:35,sec:'Motion'},{k:'orb',label:'Orbit size',min:0,max:100,def:45,sec:'Motion'}].concat(GENP('#d9531e','#16110e')),
  frag:SS+GENF+`vec4 fx(vec2 uv){vec2 p=gp(uv);float ph=pl_(uv)*u_pic/10.,s=0.;
  for(int i=0;i<5;i++){if(float(i)>=u_n)break;float a=float(i)*6.283/u_n+uTime*u_spd*.02;vec2 c=vec2(cos(a),sin(a*1.3))*u_orb/100.*.5;s+=sin(length(p-c)*u_f*6.283-uTime*u_spd*.15+ph);}
  s/=u_n;float v=smoothstep(.0,.35,abs(s));return vec4(mix(u_ca,u_cb,v),1.);}`});
defineModule({id:'scanf',family:'Source',name:'Scan Field',defaultLook:{paper:'#0d0b08',ink:'#e8a33c',palette:null},
  params:[{k:'ln',label:'Lines',min:20,max:400,def:140,sec:'Pattern',hero:true},{k:'bar',label:'Sweep bar',min:0,max:100,def:55,sec:'Pattern',hero:true},
    {k:'spd',label:'Sweep speed',min:0,max:100,def:30,sec:'Motion'},{k:'tear',label:'Tear',min:0,max:100,def:25,sec:'Motion'},{k:'nz',label:'Static',min:0,max:100,def:20,sec:'Pattern'}].concat(GENP('#e8a33c','#0d0b08')),
  frag:SS+GENF+`vec4 fx(vec2 uv){float row=floor(uv.y*u_ln),tt=floor(uTime*8.);float sh=(h11(row+tt*3.7)-.5)*u_tear/100.*.12*step(.6,h11(row*1.7+tt));
  vec2 q=vec2(uv.x+sh,uv.y);float ph=pl_(uv)*u_pic/100.;float line=.5+.5*cos(q.y*u_ln*6.283);float bar=exp(-pow((fract(q.y-uTime*u_spd*.03+ph)-.5)*6.,2.))*u_bar/100.;
  float n=(h21(floor(q*vec2(uRes.x/3.,uRes.y/3.))+tt)-.5)*u_nz/100.;float v=clamp(line*.45+bar+n+.1,0.,1.);return vec4(mix(u_cb,u_ca,v),1.);}`});
defineModule({id:'osc',family:'Source',name:'Oscillator Field',defaultLook:{paper:'#efe6d2',ink:'#c43a2f',palette:null},
  params:[{k:'a',label:'Frequency X',min:1,max:24,def:5,step:.1,sec:'Pattern',hero:true},{k:'b',label:'Frequency Y',min:1,max:24,def:7,step:.1,sec:'Pattern',hero:true},
    {k:'spd',label:'Phase speed',min:0,max:100,def:30,sec:'Motion'},{k:'th',label:'Line weight',min:1,max:60,def:14,sec:'Pattern'}].concat(GENP('#c43a2f','#efe6d2')),
  frag:SS+GENF+`vec4 fx(vec2 uv){vec2 p=gp(uv)*3.1416;float ph=pl_(uv)*u_pic/8.,t=uTime*u_spd*.04;
  float v=sin(p.x*u_a+t+ph)*cos(p.y*u_b-t*1.3)+sin(length(p)*u_a*.8-t);float d=abs(fract(v*1.5)-.5)*2.;float line=1.-smoothstep(u_th/100.,u_th/100.+.06,d);return vec4(mix(u_cb,u_ca,line),1.);}`});
defineModule({id:'nfield',family:'Source',name:'Noise Field',defaultLook:{paper:'#efe6d2',ink:'#7a6a4f',palette:null},
  params:[{k:'sc',label:'Scale',min:1,max:30,def:6,step:.1,sec:'Pattern',hero:true},{k:'warp',label:'Warp',min:0,max:100,def:60,sec:'Pattern',hero:true},
    {k:'spd',label:'Flow',min:0,max:100,def:25,sec:'Motion'},{k:'lv',label:'Contour bands',min:2,max:24,def:8,step:1,sec:'Pattern'}].concat(GENP('#7a6a4f','#efe6d2')),
  frag:SS+GENF+`float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float nfbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=vn(p)*a;p=p*2.03+7.1;a*=.5;}return s;}
vec4 fx(vec2 uv){vec2 p=gp(uv)*u_sc,t=vec2(uTime*u_spd*.02,-uTime*u_spd*.013);float ph=pl_(uv)*u_pic/40.;
  vec2 w=vec2(nfbm(p+t),nfbm(p-t+4.3))-.5;float v=nfbm(p+w*u_warp/25.+ph);float b=fract(v*u_lv);float e=smoothstep(.0,.08,b)*(1.-smoothstep(.12,.2,b));
  return vec4(mix(u_cb,u_ca,clamp(v*.8+e*.5,0.,1.)),1.);}`});
/* =====================================================================
   More effects: geometry, optics, glitch and colour. Every one has 4 to 6 controls and its own default look.
   ===================================================================== */
const FXC=(k,l,d,sec='Centre')=>({k,label:l,min:0,max:100,def:d,sec});
defineModule({id:'kaleido',family:'Warp',name:'Kaleidoscope',defaultLook:{paper:'#101010',ink:'#ffb347',palette:null},
  params:[{k:'seg',label:'Segments',min:2,max:16,def:6,step:1,sec:'Mirror',hero:true},{k:'rot',label:'Rotation',min:0,max:360,def:0,sec:'Mirror'},{k:'zoom',label:'Zoom',min:20,max:300,def:100,sec:'Mirror',hero:true},{k:'spin',label:'Spin',min:-100,max:100,def:20,sec:'Motion'},FXC('cx','Centre X',50),FXC('cy','Centre Y',50)],
  frag:`vec4 fx(vec2 uv){vec2 p=(uv-vec2(u_cx,u_cy)/100.)*vec2(uRes.x/uRes.y,1.);float a=atan(p.y,p.x)+radians(u_rot)+uTime*u_spin*.01,r=length(p)*100./u_zoom;float s=6.2832/u_seg;a=mod(a,s);a=abs(a-s*.5);vec2 q=vec2(cos(a),sin(a))*r;
  return texture(uSrc,clamp(q/vec2(uRes.x/uRes.y,1.)+vec2(u_cx,u_cy)/100.,0.,1.));}`});
defineModule({id:'mirror',family:'Warp',name:'Mirror Tiles',defaultLook:{paper:'#101010',ink:'#e8d8c4',palette:null},
  params:[{k:'mode',t:'c',label:'Mirror',opts:['Left to right','Top to bottom','Four ways','Diagonal'],def:2,sec:'Mirror',hero:true},{k:'tiles',label:'Tiles',min:1,max:8,def:2,step:1,sec:'Mirror',hero:true},{k:'off',label:'Offset',min:-50,max:50,def:0,sec:'Mirror'},{k:'sw',label:'Slide',min:0,max:100,def:10,sec:'Motion'}],
  frag:`vec4 fx(vec2 uv){vec2 p=fract(uv*u_tiles+vec2(u_off/100.+uTime*u_sw*.004,0.));int m=int(u_mode+.5);
  if(m==0)p.x=abs(p.x*2.-1.);else if(m==1)p.y=abs(p.y*2.-1.);else if(m==2)p=abs(p*2.-1.);else{p=abs(p*2.-1.);if(p.x<p.y)p=p.yx;}
  return texture(uSrc,clamp(p,0.,1.));}`});
defineModule({id:'chroma',family:'Optical',name:'Chromatic Split',defaultLook:{paper:'#101010',ink:'#ff9d3a',palette:null},
  params:[{k:'amt',label:'Split',min:0,max:100,def:35,sec:'Split',hero:true},{k:'ang',label:'Angle',min:0,max:360,def:20,sec:'Split'},{k:'rad',label:'From centre',min:0,max:100,def:60,sec:'Split',hero:true},{k:'gl',label:'Glow',min:0,max:100,def:25,sec:'Light'},{k:'wob',label:'Wobble',min:0,max:100,def:20,sec:'Motion'}],
  frag:SS+`vec4 fx(vec2 uv){vec2 d=(uv-.5);float a=radians(u_ang)+uTime*u_wob*.02;vec2 dir=mix(vec2(cos(a),sin(a)),normalize(d+1e-4),u_rad/100.)*u_amt/100.*.03*(.4+length(d)*2.*u_rad/100.);
  vec3 c=vec3(texture(uSrc,uv+dir).r,texture(uSrc,uv).g,texture(uSrc,uv-dir).b);vec3 g=(texture(uSrc,uv+dir*3.).rgb+texture(uSrc,uv-dir*3.).rgb)*.5;return vec4(c+max(g-.5,0.)*u_gl/60.,1.);}`});
defineModule({id:'slicer',family:'Glitch',name:'Glitch Slices',defaultLook:{paper:'#101010',ink:'#ff6a3d',palette:null},
  params:[{k:'n',label:'Slices',min:3,max:80,def:16,step:1,sec:'Slices',hero:true},{k:'sh',label:'Shift',min:0,max:100,def:85,sec:'Slices',hero:true},{k:'rate',label:'Rate',min:0,max:100,def:50,sec:'Motion'},{k:'rgb',label:'RGB split',min:0,max:100,def:80,sec:'Slices'},{k:'vert',t:'b',label:'Vertical slices',def:false,sec:'Slices'},{k:'tint',t:'color',label:'Tint',def:'#ff6a3d',sec:'Colour'},{k:'tmix',label:'Tint amount',min:0,max:100,def:45,sec:'Colour'}],
  frag:`vec4 fx0(vec2 uv){float tt=floor(uTime*u_rate*.2),ax=u_vert>.5?uv.x:uv.y;float id=floor(ax*u_n);float on=step(.25,h11(id*1.31+tt*5.7+uSeed));float sh=(h11(id+tt*3.3+uSeed)-.5)*u_sh/100.*.4*on;
  vec2 o=u_vert>.5?vec2(0.,sh):vec2(sh,0.);float sp=u_rgb/100.*.02*on;vec2 sd=u_vert>.5?vec2(0.,sp):vec2(sp,0.);
  return vec4(texture(uSrc,uv+o+sd).r,texture(uSrc,uv+o).g,texture(uSrc,uv+o-sd).b,1.);}
vec4 fx(vec2 uv){vec4 c=fx0(uv);float l=luma(c.rgb);return vec4(mix(c.rgb,u_tint*(.12+l*1.55),u_tmix/100.),1.);}`});
defineModule({id:'swirl',family:'Warp',name:'Swirl',defaultLook:{paper:'#101010',ink:'#e8d8c4',palette:null},
  params:[{k:'str',label:'Twist',min:-100,max:100,def:95,sec:'Twist',hero:true},{k:'rad',label:'Radius',min:5,max:100,def:90,sec:'Twist',hero:true},{k:'pul',label:'Pulse',min:0,max:100,def:30,sec:'Motion'},FXC('cx','Centre X',50),FXC('cy','Centre Y',50),{k:'tint',t:'color',label:'Tint',def:'#c4562a',sec:'Colour'},{k:'tmix',label:'Tint amount',min:0,max:100,def:70,sec:'Colour'}],
  frag:`vec4 fx0(vec2 uv){vec2 c=vec2(u_cx,u_cy)/100.,p=(uv-c)*vec2(uRes.x/uRes.y,1.);float r=length(p),R=u_rad/100.*.7;float k=smoothstep(R,0.,r);float a=k*k*u_str/100.*6.283*(1.+u_pul/100.*sin(uTime*1.5));
  p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;return texture(uSrc,clamp(p/vec2(uRes.x/uRes.y,1.)+c,0.,1.));}
vec4 fx(vec2 uv){vec4 c=fx0(uv);float l=luma(c.rgb);return vec4(mix(c.rgb,u_tint*(.12+l*1.55),u_tmix/100.),1.);}`});
defineModule({id:'ripple',family:'Warp',name:'Ripple',defaultLook:{paper:'#101010',ink:'#e8d8c4',palette:null},
  params:[{k:'f',label:'Wavelength',min:3,max:80,def:24,sec:'Wave',hero:true},{k:'amp',label:'Height',min:0,max:100,def:35,sec:'Wave',hero:true},{k:'spd',label:'Speed',min:0,max:100,def:40,sec:'Motion'},{k:'sh',label:'Shine',min:0,max:100,def:30,sec:'Light'},FXC('cx','Centre X',50),FXC('cy','Centre Y',50)],
  frag:`vec4 fx(vec2 uv){vec2 c=vec2(u_cx,u_cy)/100.,p=(uv-c)*vec2(uRes.x/uRes.y,1.);float r=length(p);float w=sin(r*u_f*6.283-uTime*u_spd*.1)*exp(-r*1.4);vec2 d=normalize(p+1e-4)*w*u_amt/100.*.04;
  vec3 col=texture(uSrc,clamp(uv+d/vec2(uRes.x/uRes.y,1.),0.,1.)).rgb;col+=max(w,0.)*u_sh/100.*.3;return vec4(col,1.);}`.replace('u_amt','u_amp')});
defineModule({id:'zoomblur',family:'Light',name:'Zoom Blur',defaultLook:{paper:'#101010',ink:'#ffd9a0',palette:null},
  params:[{k:'amt',label:'Length',min:0,max:100,def:45,sec:'Blur',hero:true},{k:'gl',label:'Bright streaks',min:0,max:100,def:50,sec:'Blur',hero:true},{k:'pul',label:'Pulse',min:0,max:100,def:25,sec:'Motion'},FXC('cx','Centre X',50),FXC('cy','Centre Y',50)],
  frag:`vec4 fx(vec2 uv){vec2 c=vec2(u_cx,u_cy)/100.,d=(uv-c)*u_amt/100.*.25*(1.+u_pul/100.*sin(uTime*2.));vec3 s=vec3(0.);float w=0.;
  for(int i=0;i<18;i++){float k=float(i)/17.;vec3 t=texture(uSrc,clamp(uv-d*k,0.,1.)).rgb;float b=1.+u_gl/100.*3.*smoothstep(.6,1.,luma(t));s+=t*b*(1.-k*.5);w+=1.-k*.5;}return vec4(s/w,1.);}`});
defineModule({id:'fisheye',family:'Optical',name:'Lens Bulge',defaultLook:{paper:'#101010',ink:'#e8d8c4',palette:null},
  params:[{k:'str',label:'Bulge',min:-100,max:100,def:55,sec:'Lens',hero:true},{k:'vig',label:'Vignette',min:0,max:100,def:45,sec:'Lens',hero:true},{k:'ca',label:'Edge fringe',min:0,max:100,def:35,sec:'Lens'},{k:'br',label:'Breathe',min:0,max:100,def:20,sec:'Motion'}],
  frag:`vec4 fx(vec2 uv){vec2 p=(uv-.5)*2.;float r2=dot(p,p),k=u_str/100.*(1.+u_br/100.*.3*sin(uTime));vec2 q=p*(1.+k*r2*.6);vec2 o=p*r2*u_ca/100.*.02;
  vec3 c=vec3(texture(uSrc,clamp(q*.5+.5+o,0.,1.)).r,texture(uSrc,clamp(q*.5+.5,0.,1.)).g,texture(uSrc,clamp(q*.5+.5-o,0.,1.)).b);
  float v=1.-smoothstep(.4,1.5,r2)*u_vig/100.;if(max(abs(q.x),abs(q.y))>1.)c=vec3(0.);return vec4(c*v,1.);}`});
defineModule({id:'neonedge',family:'Light',name:'Edge Light',defaultLook:{paper:'#0c0a08',ink:'#ffb347',palette:null},
  params:[{k:'thr',label:'Sensitivity',min:0,max:100,def:35,sec:'Edges',hero:true},{k:'w',label:'Width',min:1,max:12,def:2.5,step:.5,sec:'Edges'},{k:'glow',label:'Glow',min:0,max:100,def:55,sec:'Edges',hero:true},{k:'dim',label:'Picture',min:0,max:100,def:12,sec:'Edges'},{k:'col',t:'color',label:'Edge colour',def:'#ffb347',sec:'Edges'},{k:'rainbow',label:'Colour from picture',min:0,max:100,def:0,sec:'Edges'}],
  frag:SS+`vec4 fx(vec2 uv){vec2 t=u_w*S/uRes;float tl=luma(texture(uSrc,uv+vec2(-t.x,-t.y)).rgb),tc=luma(texture(uSrc,uv+vec2(0.,-t.y)).rgb),tr=luma(texture(uSrc,uv+vec2(t.x,-t.y)).rgb),l=luma(texture(uSrc,uv+vec2(-t.x,0.)).rgb),r=luma(texture(uSrc,uv+vec2(t.x,0.)).rgb),bl=luma(texture(uSrc,uv+vec2(-t.x,t.y)).rgb),bc=luma(texture(uSrc,uv+vec2(0.,t.y)).rgb),br=luma(texture(uSrc,uv+vec2(t.x,t.y)).rgb);
  float gx=-tl-2.*l-bl+tr+2.*r+br,gy=-tl-2.*tc-tr+bl+2.*bc+br;float e=length(vec2(gx,gy));e=smoothstep(u_thr/100.*.6,u_thr/100.*.6+.35,e);
  vec3 src=texture(uSrc,uv).rgb;vec3 ec=mix(u_col,src*1.6,u_rainbow/100.);return vec4(src*u_dim/100.+ec*e*(1.+u_glow/100.),1.);}`});
defineModule({id:'gradmap',family:'Color',name:'Gradient Map',defaultLook:{paper:'#2b1408',ink:'#ffe3b0',palette:null},
  params:[{k:'c1',t:'color',label:'Shadows',def:'#2b1408',sec:'Colours',hero:true},{k:'c2',t:'color',label:'Midtones',def:'#c4562a',sec:'Colours'},{k:'c3',t:'color',label:'Highlights',def:'#ffe3b0',sec:'Colours'},{k:'mid',label:'Midpoint',min:10,max:90,def:50,sec:'Tone',hero:true},{k:'con',label:'Contrast',min:-50,max:100,def:20,sec:'Tone'},{k:'cyc',label:'Cycle',min:0,max:100,def:0,sec:'Motion'}],
  frag:`vec4 fx(vec2 uv){float l=luma(texture(uSrc,uv).rgb);l=clamp((l-.5)*(1.+u_con/100.)+.5,0.,1.);l=fract(l+uTime*u_cyc*.02)*step(.001,u_cyc)+l*(1.-step(.001,u_cyc));float m=u_mid/100.;
  vec3 c=l<m?mix(u_c1,u_c2,l/m):mix(u_c2,u_c3,(l-m)/(1.-m));return vec4(c,1.);}`});
defineModule({id:'contourl',family:'Lines',name:'Contour Lines',defaultLook:{paper:'#efe6d2',ink:'#3a2a1a',palette:null},
  params:[{k:'n',label:'Levels',min:3,max:40,def:14,step:1,sec:'Lines',hero:true},{k:'th',label:'Line weight',min:1,max:80,def:22,sec:'Lines',hero:true},{k:'ink',t:'color',label:'Ink',def:'#3a2a1a',sec:'Colour'},{k:'paper',t:'color',label:'Paper',def:'#efe6d2',sec:'Colour'},{k:'fill',label:'Keep picture',min:0,max:100,def:0,sec:'Colour'},{k:'flow',label:'Flow',min:0,max:100,def:20,sec:'Motion'}],
  frag:`vec4 fx(vec2 uv){vec3 s=texture(uSrc,uv).rgb;float l=luma(s)*u_n+uTime*u_flow*.02;float d=abs(fract(l)-.5)*2.;float line=1.-smoothstep(u_th/100.,u_th/100.+.1,d);
  vec3 base=mix(u_paper,s,u_fill/100.);return vec4(mix(base,u_ink,line),1.);}`});
defineModule({id:'tiles',family:'Pixel',name:'Mosaic Tiles',defaultLook:{paper:'#101010',ink:'#e8d8c4',palette:null},
  params:[{k:'sz',label:'Tile size',min:4,max:120,def:28,sec:'Tiles',hero:true},{k:'gap',label:'Grout',min:0,max:60,def:14,sec:'Tiles',hero:true},{k:'jit',label:'Jitter',min:0,max:100,def:25,sec:'Tiles'},{k:'rnd',label:'Rounding',min:0,max:100,def:35,sec:'Tiles'},{k:'bev',label:'Bevel',min:0,max:100,def:40,sec:'Light'}],
  frag:SS+`vec4 fx(vec2 uv){float s=u_sz*S;vec2 p=uv*uRes/s,id=floor(p),f=fract(p)-.5;vec2 j=(h22(id+uSeed)-.5)*u_jit/100.*.5;vec3 c=texture(uSrc,(id+.5+j)*s/uRes).rgb;
  float g=u_gap/100.*.5,r=u_rnd/100.*.5;vec2 q=abs(f)-(.5-g-r);float d=length(max(q,0.))-r;float m=1.-smoothstep(-.02,.03,d);
  float bev=1.+u_bev/100.*.5*(-f.x*.6-f.y*.6+smoothstep(0.,-.3,d)*.0);return vec4(c*bev*m,1.);}`});
defineModule({id:'grain',family:'Film',name:'Film Burn',defaultLook:{paper:'#14100c',ink:'#e8c08a',palette:null},
  params:[{k:'gr',label:'Grain',min:0,max:100,def:45,sec:'Film',hero:true},{k:'sz',label:'Grain size',min:1,max:8,def:2,step:.5,sec:'Film'},{k:'vig',label:'Vignette',min:0,max:100,def:50,sec:'Film',hero:true},{k:'lift',label:'Lift blacks',min:0,max:100,def:20,sec:'Film'},{k:'warm',label:'Warmth',min:-100,max:100,def:35,sec:'Film'},{k:'flk',label:'Flicker',min:0,max:100,def:25,sec:'Motion'}],
  frag:SS+`vec4 fx(vec2 uv){vec3 c=texture(uSrc,uv).rgb;float n=h21(floor(uv*uRes/(u_sz*S))+floor(uTime*24.)*7.3)-.5;c+=n*u_gr/100.*.5;c=mix(c,vec3(.12,.1,.09)+c*.88,u_lift/100.);
  c*=vec3(1.+u_warm/100.*.15,1.,1.-u_warm/100.*.2);float d=length(uv-.5);c*=1.-smoothstep(.3,.85,d)*u_vig/100.;c*=1.+(h11(floor(uTime*12.))-.5)*u_flk/100.*.25;return vec4(c,1.);}`});
defineModule({id:'camsim',family:'Camera',name:'Camera Body',hidden:true,defaultLook:{paper:'#101010',ink:'#e8e8e8',palette:null},params:CAMSIM_PARAMS,frag:CAMSIM_FRAG});
defineModule({id:'melt',family:'Warp',name:'Melt',defaultLook:{paper:'#101010',ink:'#e8d8c4',palette:null},
  params:[{k:'amt',label:'Drip',min:0,max:100,def:85,sec:'Melt',hero:true},{k:'cols',label:'Columns',min:4,max:120,def:22,step:1,sec:'Melt'},{k:'spd',label:'Speed',min:0,max:100,def:35,sec:'Motion',hero:true},{k:'lum',label:'Bright drips more',min:0,max:100,def:75,sec:'Melt'},{k:'tint',t:'color',label:'Tint',def:'#e8d8c4',sec:'Colour'},{k:'tmix',label:'Tint amount',min:0,max:100,def:100,sec:'Colour'}],
  frag:`vec4 fx0(vec2 uv){float id=floor(uv.x*u_cols);float ph=h11(id+uSeed)*6.283;float l=luma(texture(uSrc,vec2((id+.5)/u_cols,uv.y)).rgb);
  float d=(.5+.5*sin(uTime*u_spd*.05+ph))*u_amt/100.*.25*(1.-u_lum/100.+u_lum/100.*l*1.6);return texture(uSrc,vec2(uv.x,clamp(uv.y+d,0.,1.)));}
vec4 fx(vec2 uv){vec4 c=fx0(uv);float l=luma(c.rgb);return vec4(mix(c.rgb,u_tint*(.12+l*1.55),u_tmix/100.),1.);}`});
const STACK={layers:[mkLayer('crtlab')],sel:0,rt:{}};
const F_COMP=HEAD+GLSL_LIB+`
uniform int uCM;uniform float uCA;
vec3 treat(vec3 c){if(uCM==0)return c;float l=luma(c);vec3 r;
  if(uCM==1)r=vec3(l);else if(uCM==2)r=mix(uPal[0],uPal[max(uPalN-1,0)],l);else if(uCM==3)r=palSmooth(l);else r=palNearest(c);
  return mix(c,r,uCA);}
uniform sampler2D uBase,uLay,uMaskT;
uniform vec2 uTexel,uPos;
uniform float uOpa,uSize,uThr,uShow;
uniform int uBlend,uSel;
float L3(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){
  vec3 b=texture(uBase,vUv).rgb;
  vec2 uv=(vUv-.5-uPos)/max(uSize,.01)+.5;
  bool inside=all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)));
  vec3 l=treat(texture(uLay,clamp(uv,0.,1.)).rgb);
  float m=inside?1.:0.;
  if(uSel==1){
    float e=abs(L3(texture(uBase,vUv+vec2(uTexel.x,0.)).rgb)-L3(texture(uBase,vUv-vec2(uTexel.x,0.)).rgb))
           +abs(L3(texture(uBase,vUv+vec2(0.,uTexel.y)).rgb)-L3(texture(uBase,vUv-vec2(0.,uTexel.y)).rgb));
    m*=smoothstep(uThr*.5,uThr*.5+.08,e);
  }else if(uSel==2){m*=smoothstep(uThr-.04,uThr+.04,L3(b));}
  else if(uSel==3){m*=texture(uMaskT,vUv).r;}
  vec3 r;
  if(uBlend==1)r=b*l;
  else if(uBlend==2)r=1.-(1.-b)*(1.-l);
  else if(uBlend==3)r=b+l;
  else if(uBlend==4)r=abs(b-l);
  else if(uBlend==5)r=mix(2.*b*l,1.-2.*(1.-b)*(1.-l),step(.5,b));
  else r=l;
  vec3 under=mix(vec3(0.),b,uShow);
  o=vec4(mix(under,mix(b,r,m*uOpa),1.),1.);
  o.rgb=mix(under,mix(b,r,uOpa),m);
}`;
function stackRT(name,w,h){
  let r=STACK.rt[name];
  if(!r||r.w!==w||r.h!==h){if(r)freeRT(r);r=STACK.rt[name]=mkRT(w,h,{hdr:true});}
  return r;
}
const MASKSEL=['subject','background','color','drawn'];
const LASTMASK={};
/* which matte (if any) this stage needs: Subject effects always, any stage via Apply to */
function layerMask(l,m){
  const base=l.mask||MASK_DEFAULTS;let mk=null;
  if(l.select==='subject')mk={...base,src:'person'};
  else if(l.select==='background')mk={...base,src:'person',invert:!base.invert};
  else if(l.select==='color')mk={...base,src:'color'};
  else if(l.select==='drawn')mk={...base,src:'drawn'};
  else if(m&&m.needsMask)mk={...base};
  if(mk&&mk.src==='person'&&!PERSON.synthetic&&PERSON.state==='idle')loadPerson(false);
  return mk;
}
const mobileData=()=>{const c=navigator.connection;return !!(c&&(c.saveData||c.type==='cellular'||/(^|-)2g|3g/.test(c.effectiveType||'')));};
function loadPerson(force){
  if(PERSON.state!=='idle'&&PERSON.state!=='error')return;
  if(!force&&mobileData()){if(!PERSON._warned){PERSON._warned=1;toast('The person model is about 14 MB and you’re on mobile data. Use “Load person model” in the Mask section.',6000);}return;}
  PERSON.state='starting';startPerson();toast('Loading the person model (about 14 MB, kept on this device)…',4000);
}
/* ---------- signals and modulation ---------- */
const MOT={cv:null,g:null,prev:null,n:0,v:0};
function updateSignals(t){
  let sp=null,sc=1;
  if(audio.on&&audio.data){sp=audio.data;sc=1/255;}else if(AUD.on&&AUD.sp){sp=AUD.sp;sc=1;}
  SIG.level=audio.level||0;
  if(sp){
    const N=sp.length,avg=(a,b)=>{let s=0;a=Math.floor(a*N);b=Math.max(a+1,Math.floor(b*N));for(let i=a;i<b;i++)s+=sp[i];return Math.min(1,s/(b-a)*sc*1.6);};
    const bs=avg(0,.08),md=avg(.08,.4),tr=avg(.4,1);
    const onset=bs-SIG.bass>.18;SIG.bass+=(bs-SIG.bass)*.5;SIG.mid+=(md-SIG.mid)*.5;SIG.treble+=(tr-SIG.treble)*.5;
    SIG.beat=onset||AUD.beat?1:SIG.beat*.82;
  }else{SIG.bass*=.9;SIG.mid*=.9;SIG.treble*=.9;SIG.beat*=.82;}
  const el=SRC.el;
  if(el&&SRC.live&&(++MOT.n%3===0)){ // motion: how much the picture changed since a moment ago
    if(!MOT.cv){MOT.cv=document.createElement('canvas');MOT.cv.width=32;MOT.cv.height=24;MOT.g=MOT.cv.getContext('2d',{willReadFrequently:true});}
    try{MOT.g.drawImage(el,0,0,32,24);const d=MOT.g.getImageData(0,0,32,24).data;
      if(MOT.prev){let s=0;for(let i=0;i<d.length;i+=4)s+=Math.abs(d[i]-MOT.prev[i])+Math.abs(d[i+1]-MOT.prev[i+1])+Math.abs(d[i+2]-MOT.prev[i+2]);MOT.v=Math.min(1,s/(768*24)*5);}
      MOT.prev=Uint8ClampedArray.from(d);}catch(e){}
  }
  SIG.motion+=(MOT.v-SIG.motion)*.3;
}
/* a stage's params with its modulators applied (the saved params are never changed) */
function modParams(l,m,t){
  if(!l.mods||!l.mods.length)return l.params;
  const V0={...l.params};
  for(const md of l.mods){
    const p=m.params.find(x=>x.k===md.target);if(!p||p.t!=='r'||typeof V0[p.k]!=='number')continue;
    const w=signalValue(md.shape,t,md.rate);
    V0[p.k]=Math.min(p.max,Math.max(p.min,V0[p.k]+w*(md.depth/100)*(p.max-p.min)/2));
  }
  return V0;
}
let MPREV=0;
function modulateSection(host,l,m){
  l.mods=l.mods||[];const a=accordion('Make it move',l.mods.length>0),tg=m.params.filter(p=>p.t==='r');
  l.mods.forEach((md,i)=>{
    const r=el('div','ir');r.appendChild(el('span','l','Drive'));const ts=document.createElement('select');
    tg.forEach(p=>{const o=document.createElement('option');o.value=p.k;o.textContent=p.label;ts.appendChild(o);});ts.value=md.target;ts.addEventListener('change',()=>md.target=ts.value);
    const ss=document.createElement('select');SIGNALS.forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;ss.appendChild(o);});ss.value=md.shape;
    ss.addEventListener('change',()=>{md.shape=ss.value;if(['audio','bass','mid','treble','beat'].includes(md.shape)&&!audio.on&&!AUD.on)toggleMic();});
    const x=el('button','btn','×');x.setAttribute('aria-label','Remove');x.addEventListener('click',()=>{l.mods.splice(i,1);renderInspector();});
    r.append(ts,ss,x);a.b.appendChild(r);
    rowRange(a.b,'Rate',()=>md.rate,v=>md.rate=v,.05,4,.05);rowRange(a.b,'Depth',()=>md.depth,v=>md.depth=v,-100,100,1);
  });
  if(l.mods.length<4&&tg.length)a.b.appendChild(Object.assign(el('button','btn','Add modulator'),{onclick:()=>{l.mods.push({target:tg[0].k,shape:'sine',rate:.4,depth:40});renderInspector();}}));
  if(!tg.length)a.b.appendChild(el('div','cl','This effect has no sliders to drive.'));
  host.appendChild(a.d);
}
/* ---------- recipes (project files) ---------- */
const SPKEY='n0ise.stackpresets';
const loadStackPresets=()=>{try{return JSON.parse(localStorage.getItem(SPKEY)||'[]');}catch(e){return[];}};
const currentRecipe=name=>{const j=toRecipe({name,P,layers:STACK.layers,MODULES,size:[ST.DW||1280,ST.DH||720]});const t=TLN.serialize();if(t)j.timeline=t;return j;};
function applyRecipe(j){
  const r=fromRecipe(j,{mkLayer,MODULES});
  if(r.P){Object.assign(P,r.P);}
  STACK.layers=r.layers.length?r.layers:[mkLayer('crtlab')];STACK.sel=0;V.sizeKey='';V.lastBKey='';TLN.load(j.timeline||null,STACK.layers);
  snap();refreshUI();renderInspector();if(r.skipped.length)toast('Skipped effects this version doesn’t have: '+r.skipped.join(', '),5000);
}
function recipeSection(host){
  const a=accordion('Recipe',false);
  const row=el('div','chips');
  row.append(Object.assign(el('button','btn','Save as preset'),{onclick:()=>{const all=loadStackPresets();const name='Recipe '+(all.length+1);all.push({id:'r'+Date.now(),name,j:currentRecipe(name)});try{localStorage.setItem(SPKEY,JSON.stringify(all.slice(-24)));toast('Saved “'+name+'”');renderInspector();}catch(e){toast('This browser won’t store presets');}}}),
    Object.assign(el('button','btn','Download .json'),{onclick:()=>{const j=currentRecipe('n0ise recipe');deliver(new Blob([JSON.stringify(j,null,1)],{type:'application/json'}),'n0ise-recipe.json');}}),
    Object.assign(el('button','btn','Open file'),{onclick:()=>{const f=document.createElement('input');f.type='file';f.accept='.json,application/json';f.onchange=async()=>{try{applyRecipe(JSON.parse(await f.files[0].text()));toast('Recipe loaded');}catch(e){toast(String(e.message||e));}};f.click();}}));
  a.b.appendChild(row);
  loadStackPresets().forEach(r=>{const x=el('div','ir');const b=el('button','btn',r.name);b.addEventListener('click',()=>{try{applyRecipe(r.j);}catch(e){toast(String(e.message||e));}});
    const d=el('button','btn','×');d.setAttribute('aria-label','Delete preset');d.addEventListener('click',()=>{localStorage.setItem(SPKEY,JSON.stringify(loadStackPresets().filter(q=>q.id!==r.id)));renderInspector();});x.append(b,d);a.b.appendChild(x);});
  a.b.appendChild(el('div','cl','A recipe holds the whole stack, its signals and the CRT settings. It is also a project file.'));
  host.appendChild(a.d);
}
function maskSection(host,l,m){
  l.mask=l.mask||{...MASK_DEFAULTS};const mk=l.mask,a=accordion('Apply to…',true);a.b.appendChild(el('div','cl','Choose where this effect shows: everywhere, the person, the background, a brightness range, a colour, or paint it on.'));
  const eff=l.select==='all'?mk.src:l.select==='color'?'color':l.select==='drawn'?'drawn':'person';
  if(l.select==='all'){const r=el('div','ir');r.appendChild(el('span','l','Matte from'));const sel=document.createElement('select');
    [['person','Person'],['luma','Luma range'],['color','Colour key'],['drawn','Drawn']].forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;sel.appendChild(o);});
    sel.value=mk.src;sel.addEventListener('change',()=>{mk.src=sel.value;renderInspector();});r.appendChild(sel);a.b.appendChild(r);}
  if(eff==='person'){
    const st=el('div','cl','');const upd=()=>{st.textContent=PERSON.synthetic?'Using the built-in test matte.':PERSON.state==='ready'?`Person model ready · ${PERSON.backend}${PERSON.fps?' · '+PERSON.fps.toFixed(0)+' fps':''}`:PERSON.state==='error'?'Person model error: '+PERSON.err:PERSON.state==='idle'?'Person model not loaded.':`Loading the person model… ${Math.round(PERSON.prog*100)}%`;};upd();a.b.appendChild(st);
    const iv=setInterval(()=>{if(!st.isConnected){clearInterval(iv);return;}upd();},500);
    if(PERSON.state==='idle'||PERSON.state==='error')a.b.appendChild(Object.assign(el('button','btn','Load person model (about 14 MB)'),{onclick:()=>{PERSON.state='idle';loadPerson(true);}}));
    const mr=el('div','ir');mr.appendChild(el('span','l','Model'));const ms=document.createElement('select');[['selfie','Fast (selfie)'],['multi','Detailed (multiclass, 16 MB)']].forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;ms.appendChild(o);});ms.value=PERSON.model;ms.addEventListener('change',()=>{PERSON.model=ms.value;PERSON.state='starting';startPerson(ms.value);});mr.appendChild(ms);a.b.appendChild(mr);
    rowParam(a.b,{k:'on',t:'b',label:'Smooth over time'},PERSON.smooth,null);
    {const q=el('div','ir');q.appendChild(el('span','l','Mask quality'));const qs=document.createElement('select');[['fast','Fast'],['balanced','Balanced'],['max','Max']].forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;qs.appendChild(o);});qs.value=PERSON.quality;qs.addEventListener('change',()=>{setMaskQuality(qs.value);toast('Stills and exports always use Max edges');});q.appendChild(qs);a.b.appendChild(q);
      a.b.appendChild(Object.assign(el('button','btn','Compare 256 / 384 / 512 / 768'),{onclick:()=>compareMasks()}));}
  }
  if(eff==='luma'){rowRange(a.b,'From',()=>Math.round(mk.lo*100),v=>mk.lo=v/100,0,100,1);rowRange(a.b,'To',()=>Math.round(mk.hi*100),v=>mk.hi=v/100,0,100,1);}
  if(eff==='color'){rowParam(a.b,{k:'col',t:'color',label:'Key colour'},mk,null);rowRange(a.b,'Tolerance',()=>Math.round(mk.tol*100),v=>mk.tol=v/100,2,100,1);}
  if(eff==='drawn'){
    rowParam(a.b,{k:'on',t:'b',label:'Paint on the picture'},DRAWN,null);rowParam(a.b,{k:'erase',t:'b',label:'Erase'},DRAWN,null);
    rowRange(a.b,'Brush',()=>Math.round(DRAWN.size*200),v=>DRAWN.size=v/200,2,40,1);
    a.b.appendChild(Object.assign(el('button','btn','Clear'),{onclick:()=>clearDrawn(0)}));
  }
  rowParam(a.b,{k:'invert',t:'b',label:'Invert'},mk,null);
  rowRange(a.b,'Feather',()=>mk.feather,v=>mk.feather=v,0,80,1);rowRange(a.b,'Grow / shrink',()=>mk.grow,v=>mk.grow=v,-100,100,1);
  if(eff==='person')rowRange(a.b,'Edge snap',()=>mk.snap,v=>mk.snap=v,0,100,1);
  const pv=el('div','ir');pv.appendChild(el('span','l','Preview mask'));const cb=document.createElement('input');cb.type='checkbox';cb.checked=MPREV===l.uid;cb.addEventListener('change',()=>{MPREV=cb.checked?l.uid:0;});pv.appendChild(cb);a.b.appendChild(pv);
  host.appendChild(a.d);
}
/* run the person model at four capture sizes and show each matte with its time */
async function compareMasks(){
  if(PERSON.state!=='ready'&&!PERSON.synthetic){toast('Load the person model first');return;}
  const sh=el('div','sheet'),box=el('div','rollbox',`<h3>Mask at four sizes</h3>`),grid=el('div','rollgrid');grid.style.gridTemplateColumns='repeat(2,1fr)';box.appendChild(grid);
  const close=el('button','btn','Close');close.addEventListener('click',()=>sh.remove());box.appendChild(close);sh.appendChild(box);document.body.appendChild(sh);
  const keep=PERSON.cap;
  for(const cap of [256,384,512,768]){
    const cell=el('div','rollcell');cell.innerHTML=`<div class="cl">${cap}px · measuring…</div>`;grid.appendChild(cell);
    PERSON.cap=cap;PERSON.ms=0;const v0=PERSON.ver;const t0=performance.now();
    while(PERSON.ver<v0+6&&performance.now()-t0<6000)await new Promise(r=>setTimeout(r,60));
    const c=document.createElement('canvas');c.width=PERSON.w||1;c.height=PERSON.h||1;c.style.cssText='width:100%;background:#000';
    if(PERSON.out){const g=c.getContext('2d'),im=g.createImageData(c.width,c.height);for(let i=0;i<PERSON.out.length;i++){const v=PERSON.out[i];im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v;im.data[i*4+3]=255;}g.putImageData(im,0,0);}
    cell.innerHTML='';cell.appendChild(c);cell.appendChild(el('div','cl',`${cap}px · ${c.width}×${c.height} mask · ${PERSON.ms?PERSON.ms.toFixed(0)+' ms per frame':'no result'}`));
  }
  PERSON.cap=keep;
}
/* paint the drawn matte straight on the picture */
canvas.addEventListener('pointerdown',e=>{if(!DRAWN.on)return;e.stopImmediatePropagation();e.preventDefault();canvas.setPointerCapture(e.pointerId);canvas._paint=true;pnt(e);},true);
canvas.addEventListener('pointermove',e=>{if(canvas._paint&&DRAWN.on){e.stopImmediatePropagation();pnt(e);}},true);
canvas.addEventListener('pointerup',()=>{canvas._paint=false;},true);
function pnt(e){const r=canvas.getBoundingClientRect();paintDrawn((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);}
function renderStack(t,dt){
  const anySolo=STACK.layers.some(l=>l.solo&&l.visible);
  const vis=STACK.layers.filter(l=>l.visible&&MODULES[l.module]&&(!anySolo||l.solo));
  if(!vis.length)return;
  updateSignals(t);
  const L0=vis[0];
  if(vis.length===1&&L0.opacity===100&&L0.module==='crtlab'&&L0.select==='all'){MODULES.crtlab.render(null,{t,dt,out:null});return;}
  computeE(t,dt);ST.eT=t;syncSrc();feedPerson();
  const lo=layout(),W=lo.DW,H=lo.DH;ST.DW=W;ST.DH=H;
  let acc=stackRT('a',W,H),tmp=stackRT('b',W,H),lay=stackRT('l',W,H);
  const sp=PR.srcp||(PR.srcp=mkProg(VS,F_SRCP));
  bindRT(acc);sp.use();samp(sp,'uSrc',0,TEX.src);sp.f('uSrcAsp',SRC.w/SRC.h);sp.f('uScrAsp',W/H);draw();
  const cp=PR.comp||(PR.comp=mkProg(VS,F_COMP));
  for(const l of vis){
    const m=MODULES[l.module];
    if(l.module==='crtlab'){ST.ovr={tex:acc.tex,w:W,h:H};try{m.render(acc.tex,{t,dt,out:lay,layer:l});}finally{ST.ovr=null;}}
    else{
      const mk=layerMask(l,m),mt=mk?maskFor(mk,W,H,acc.tex):null;LASTMASK[l.uid]=mt;
      m.render(acc.tex,{t,dt,out:lay,layer:l,params:modParams(l,m,t),W,H,mask:mt});
    }
    bindRT(tmp);cp.use();samp(cp,'uBase',0,acc.tex);samp(cp,'uLay',1,lay.tex);
    {const mk=MASKSEL.includes(l.select)&&l.module!=='crtlab'?LASTMASK[l.uid]:null;samp(cp,'uMaskT',2,mk||acc.tex);}
    cp.v2('uTexel',1/W,1/H);cp.v2('uPos',l.pos[0]/100,l.pos[1]/100);
    cp.f('uOpa',l.opacity/100);cp.f('uSize',l.size/100);cp.f('uThr',l.thr/100);cp.f('uShow',l.showSource?1:0);
    const bi=BLENDS.indexOf(l.blend),si=MASKSEL.includes(l.select)?3:['all','edges','luma'].indexOf(l.select);
    cp.i('uBlend',Math.max(0,bi));cp.i('uSel',Math.max(0,si));
    const col=l.color||LAYER_DEFAULTS.color,cmi=Math.max(0,COLOR_MODES.indexOf(col.mode));cp.i('uCM',cmi);cp.f('uCA',col.amt/100);
    {const a=(col.pal&&col.pal.length?col.pal:['#000000','#ffffff']).slice(0,16),buf=new Float32Array(48);a.forEach((h,i)=>{const c=hexRGB(h);buf[i*3]=c[0]/255;buf[i*3+1]=c[1]/255;buf[i*3+2]=c[2]/255;});cp.v3v('uPal',buf);cp.i('uPalN',a.length);}
    draw();
    const q=acc;acc=tmp;tmp=q;STACK.rt.a=acc;STACK.rt.b=tmp;
  }
  let outTex=acc.tex;
  if(MPREV){const pl=STACK.layers.find(x=>x.uid===MPREV);if(pl){const mk=layerMask(pl,MODULES[pl.module]);if(mk)outTex=maskFor(mk,W,H,acc.tex);}}
  bindRT(null);PR.copy.use();samp(PR.copy,'uT',0,outTex);draw();
}
window.__embedReady=()=>EMBED&&GLOK&&!V.DEAD&&!CTX.lost;
window.__embedRender=function(cv,w,h,t,dt){
  if(!window.__embedReady())return null;
  EMB.w=w;EMB.h=h;
  if(SRC.el!==cv){setSource(cv,'Studio',true);}else uploadSrc();
  renderStack(t,dt);V.frameNo++;return canvas;
};
const FRAME_HOOKS=[];
/* Alive: an effect is never frozen. Each layer's main controls drift a few percent on slow sine waves and the grain seed crawls.
   The offsets are applied just before the frame is drawn and removed straight after, so saved values and sliders never change. */
const IDLE={on:true,amt:.035,saved:[],reduce:matchMedia('(prefers-reduced-motion:reduce)').matches};
function idleApply(t){
  IDLE.saved.length=0;if(!IDLE.on||ST.clean||(IDLE.reduce&&!IDLE.force))return;
  STACK.layers.forEach((l,li)=>{
    if(!l.visible||l.module==='crtlab')return;const m=MODULES[l.module];if(!m||!l.params)return;
    const keys=m.schema.hero.length?m.schema.hero:m.params.filter(p=>p.t==='r'&&!/^(orig|seed)$/.test(p.k)).slice(0,2).map(p=>p.k);
    keys.slice(0,3).forEach((k,i)=>{const p=m.params.find(x=>x.k===k);if(!p||p.t!=='r'||typeof l.params[k]!=='number'||!(p.max>p.min))return;
      const base=l.params[k],span=p.max-p.min,w=Math.sin(t*(.45+.17*i)+li*1.7+i*2.1)*.7+Math.sin(t*(.13+.05*i)+i)*.3;
      IDLE.saved.push([l.params,k,base]);l.params[k]=Math.max(p.min,Math.min(p.max,base+span*IDLE.amt*w));});
    IDLE.saved.push([l,'seed',l.seed]);l.seed=(l.seed||0)+Math.floor(t*2)%997;
  });
}
function idleRestore(){for(const [o,k,v] of IDLE.saved)o[k]=v;IDLE.saved.length=0;}
const TLN=createTimeline({el:(...a)=>el(...a),layers:()=>STACK.layers,setCam:i=>{if(CAMMODE)applyCam(i,true);},getCam:()=>camIx,hasCam:()=>CAMMODE,params:l=>MODULES[l.module]?MODULES[l.module].params:[],toast:(...a)=>toast(...a),onToggle:on=>{V.sizeKey='';}});
const ED=createEditor({el:(...a)=>el(...a),toast:(...a)=>toast(...a),setSource:(...a)=>setSource(...a),TLN});
const OVL=createOverlays(ED,{el:(...a)=>el(...a),toast:(...a)=>toast(...a),setSource:(...a)=>setSource(...a),uploadSrc:()=>uploadSrc(),TLN});ED.srcHook=(...a)=>OVL.source(...a);ED.afterMount=h=>OVL.mount(h);
TLN.handle=ED;
function loop(now){
  requestAnimationFrame(loop);
  if(window.__benching||(EMBED&&document.hidden))return;
  if(document.hidden||!GLOK||CTX.lost||V.DEAD)return;
  const cap=+P.fcap;
  if(cap&&now-V.lastRenderMs<1000/cap-4)return;
  V.lastRenderMs=now;
  const t=now/1000,dt=clamp(t-V.lastT,.001,.1);V.lastT=t;
  V.fpsAcc+=1/dt;V.fpsN++;if(V.fpsN>=20){V.fps=V.fpsAcc/V.fpsN;V.fpsAcc=0;V.fpsN=0;adaptQ();$('#info').textContent=V.infoStr;}
  try{
    if(audio.on)audioTick();
    if(ED.active())ED.tick(dt);else TLN.tick(dt);
    idleApply(t);try{renderStack(t,dt);}finally{idleRestore();}V.frameNo++;
    for(let i=0;i<FRAME_HOOKS.length;i++)FRAME_HOOKS[i](t);
    if(V.errN){V.errN=0;const e=$('#err');if(e&&!e.hidden&&!V.DEAD)e.hidden=true;}
  }catch(e){
    console.error(e);V.errN++;
    if(V.errN===1){V.sizeKey='';V.lastBKey='';readDrop();toast('Recovering the display…');}
    else if(V.errN===3){V.HDR=false;V.sizeKey='';V.lastBKey='';ST.autoQ=.5;}
    else if(V.errN>=8){V.DEAD=true;noGL('Rendering stopped: '+String(e.message||e).slice(0,200)+' Reload to try again.');}
  }
}
/* the browser can take the GL context away (memory pressure, backgrounding): rebuild instead of freezing */
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();CTX.lost=true;});
canvas.addEventListener('webglcontextrestored',()=>{
  try{
    initGL();initLUT();
    Object.keys(T).forEach(k=>delete T[k]);
    resetMatteGL();PR.fin=null;Object.values(MODULES).forEach(m=>{m.prog=null;m.cache={};m.progKey=null;});Object.keys(FUSE_PREV).forEach(k=>delete FUSE_PREV[k]);Object.keys(HISTRT).forEach(k=>delete HISTRT[k]);V.sizeKey='';V.lastBKey='';V.palCache={key:'',v:null};V.textKey='';V.pIdx=0;RB.pbo=null;RB.sync=null;RB.size=0;
    SRC.lastVer=-1;if(SRC.el&&!(SRC.el instanceof HTMLVideoElement))uploadSrc();
    $('#err').hidden=true;CTX.lost=false;V.errN=0;
    if(typeof toast==='function')toast('Display recovered');
  }catch(e){noGL('Couldn’t recover the display. Reload the page.');}
});
/* =====================================================================
   n0ise — interface
   ===================================================================== */
const now=()=>performance.now()/1000;
let toastT=0;
function toast(msg){
  let t=$('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}
  t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},2600);
}
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;};

/* ---------- history ---------- */
const HIST=[],REDO=[];let lastSnap='';
const stackState=()=>STACK.layers.map(l=>({u:l.uid,m:l.module,p:l.module==='crtlab'?null:l.params,o:l.opacity,b:l.blend,s:l.showSource,sel:l.select,t:l.thr,pos:l.pos,z:l.size,seed:l.seed,v:l.visible,c:l.color,mk:l.mask,so:l.solo,md:l.mods}));
function snap(){
  const s=JSON.stringify({p:P,l:stackState()});
  if(s!==lastSnap){if(lastSnap)HIST.push(lastSnap);if(HIST.length>60)HIST.shift();lastSnap=s;REDO.length=0;}
}
function applySnap(s){
  const o=JSON.parse(s);Object.assign(P,o.p);
  STACK.layers=o.l.filter(x=>MODULES[x.m]).map(x=>{const l=mkLayer(x.m,x.p||undefined);if(x.u!=null){l.uid=x.u;layerUid=Math.max(layerUid,x.u+1);}Object.assign(l,{opacity:x.o,blend:x.b,showSource:x.s,select:x.sel,thr:x.t,pos:x.pos,size:x.z,seed:x.seed,visible:x.v});if(x.c)l.color=x.c;if(x.mk)l.mask=x.mk;l.solo=!!x.so;l.mods=x.md||[];return l;});
  if(!STACK.layers.length)STACK.layers=[mkLayer('crtlab')];STACK.sel=Math.min(STACK.sel,STACK.layers.length-1);lastSnap=s;refreshUI();renderInspector();
}
function undo(){const s=HIST.pop();if(!s){toast('Nothing to undo');return;}REDO.push(lastSnap);applySnap(s);toast('Undo');}
function redo(){const s=REDO.pop();if(!s){toast('Nothing to redo');return;}HIST.push(lastSnap);applySnap(s);toast('Redo');}

/* ---------- saved looks ---------- */
const loadLooks=()=>{try{return JSON.parse(localStorage.getItem('n0ise.looks')||'[]');}catch(e){return[];}};
function saveLook(){
  const looks=loadLooks();
  looks.push({id:'look'+Date.now(),name:'Look '+(looks.length+1),p:JSON.parse(JSON.stringify(P)),j:currentRecipe('Look '+(looks.length+1))});
  try{localStorage.setItem('n0ise.looks',JSON.stringify(looks.slice(-12)));}catch(e){toast('This browser won’t store looks');return;}
  buildProfiles();toast('Look saved');
}

/* ---------- control builders ---------- */
const UI={rows:{},chips:{},tabs:{},panes:{}};
const VISIBLE={
  depth:()=>P.pal==='src',
  dstr:()=>P.method!=='off',tbias:()=>P.method!=='off',
  anim:()=>['thr','b4','b8','blue','white','half'].includes(P.method),
  mpitch:()=>P.mask!=='0',msoft:()=>P.mask!=='0',mgap:()=>P.mask!=='0',mstr:()=>P.mask!=='0'&&P.phos==='0',
  iflk:()=>P.iface==='1',
  tsz:()=>P.ton,ty:()=>P.ton,tcur:()=>P.ton
};
function fmt(c,v){return c.step<1?(+v).toFixed(1):String(v);}
function buildRange(c,parent){
  const row=el('div','row');
  row.innerHTML=`<label for="s_${c.k}">${c.l}</label><output></output><input id="s_${c.k}" type="range" min="${c.min}" max="${c.max}" step="${c.step}">`;
  const inp=$('input',row);
  inp.addEventListener('input',()=>{P[c.k]=+inp.value;paintRow(c);});
  inp.addEventListener('change',()=>{P.profile=P.profile;snap();});
  parent.appendChild(row);UI.rows[c.k]=row;
}
function paintRow(c){
  const row=UI.rows[c.k];if(!row)return;
  const inp=$('input',row);inp.value=P[c.k];
  inp.style.setProperty('--p',((P[c.k]-c.min)/(c.max-c.min)*100)+'%');
  $('output',row).textContent=fmt(c,P[c.k]);
}
function buildChips(c,parent){
  const wrap=el('div');
  wrap.appendChild(el('div','cl',c.l));
  const chips=el('div','chips');
  c.opts.forEach(([v,l])=>{
    const b=el('button','chip',l);b.dataset.v=v;
    b.addEventListener('click',()=>{P[c.k]=v;snap();refreshUI();});
    chips.appendChild(b);
  });
  wrap.appendChild(chips);parent.appendChild(wrap);UI.chips[c.k]={wrap,chips,c};
}
function buildToggle(c,parent){
  const wrap=el('div','chips');
  const b=el('button','chip',c.l);
  b.addEventListener('click',()=>{P[c.k]=!P[c.k];snap();refreshUI();});
  wrap.appendChild(b);parent.appendChild(wrap);UI.chips[c.k]={wrap,btn:b,c,toggle:true};
}
function refreshUI(){
  for(const k in UI.rows){const c=CTL[k];paintRow(c);UI.rows[k].hidden=VISIBLE[k]?!VISIBLE[k]():false;}
  for(const k in UI.chips){
    const u=UI.chips[k];
    if(u.toggle){u.btn.setAttribute('aria-pressed',!!P[k]);u.wrap.hidden=VISIBLE[k]?!VISIBLE[k]():false;}
    else{u.chips.querySelectorAll('.chip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===String(P[k])));u.wrap.hidden=VISIBLE[k]?!VISIBLE[k]():false;}
  }
  document.querySelectorAll('#pals .sw').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===P.pal));
  document.querySelectorAll('#profiles .chip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===P.profile));
  document.querySelectorAll('#sources .chip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===SRC.name));
  const pe=$('#palEdit');if(pe){pe.hidden=P.pal!=='custom';if(!pe.hidden)buildPalEdit();}
  const pn=$('#palName');if(pn){const d=PALS.find(p=>p.id===P.pal);pn.textContent=d?d.name:'';}
  const ta=$('#txtArea');if(ta&&document.activeElement!==ta)ta.value=P.txt;
  $('#power').setAttribute('aria-pressed',ST.pwr===1);
  $('#textoff').hidden=!P.ton;
  $('#paint').setAttribute('aria-pressed',ST.paint);
  $('#cam').textContent=SRC.name==='Camera'?'Flip':'Camera';
  refreshMods();refreshChainUI();
  if(window.renderStrip&&GLOK&&!INS.gallery){clearTimeout(ST.stT);ST.stT=setTimeout(renderStrip,500);}
}

/* ---------- tabs & panes ---------- */
function buildTabs(){
  const tabs=$('#tabs'),pane=$('#pane');
  TABS.forEach(([id,name],i)=>{
    const b=el('button','tab',name);b.setAttribute('role','tab');b.dataset.id=id;
    b.addEventListener('click',()=>selectTab(id));
    tabs.appendChild(b);UI.tabs[id]=b;
    const p=el('div');p.hidden=true;pane.appendChild(p);UI.panes[id]=p;
  });
  selectTab('display');
}
function selectTab(id){
  for(const k in UI.tabs){UI.tabs[k].setAttribute('aria-selected',k===id);UI.panes[k].hidden=k!==id;}
  $('#pane').scrollTop=0;
}
function group(tab,title){
  const g=el('div','grp');if(title)g.appendChild(el('div','gt',title));
  UI.panes[tab].appendChild(g);return g;
}
function chipRow(parent,items,idPrefix,onClick,cls){
  const row=el('div','chips'+(idPrefix==='profiles'?' wrap':''));if(idPrefix)row.id=idPrefix;
  items.forEach(([v,l])=>{
    const b=el('button','chip'+(cls?' '+cls:''),l);b.dataset.v=v;
    b.addEventListener('click',()=>onClick(v,b));row.appendChild(b);
  });
  parent.appendChild(row);return row;
}

/* ---------- display tab custom blocks ---------- */
function buildProfiles(){
  const host=$('#profilesHost');if(!host)return;host.innerHTML='';
  const items=PROFILES.map(p=>[p[0],p[1]+(recolors(p[2])?' ◐':'')]).concat(loadLooks().map(l=>[l.id,'★ '+l.name]));
  const row=chipRow(host,items,'profiles',(id)=>{
    const look=loadLooks().find(l=>l.id===id);
    if(look&&look.j){try{applyRecipe(look.j);P.profile=id;}catch(e){toast(String(e.message||e));}}
    else if(look){Object.assign(P,JSON.parse(JSON.stringify(look.p)));P.profile=id;}
    else applyProfile(id);
    snap();refreshUI();
  });
  refreshUI();
}
function buildDisplayExtras(){
  const gs=group('display','Source');
  chipRow(gs,[['Demo','Demo planet'],['Test','Test card']],'sources',(v)=>{
    $('#cam').textContent='Camera';
    setSource(v==='Demo'?demoCanvas():testCanvas(),v);refreshUI();
  });
  buildChainUI();
  const gh=group('display','Hardware profile');
  const host=el('div');host.id='profilesHost';gh.appendChild(host);
  const ga=group('display','Actions');
  chipRow(ga,[['pwr','Power'],['deg','Degauss'],['chan','Change channel'],['burst','Static burst'],['mut','Mutate hardware'],['save','Save look'],['rst','Reset all']],'',(v)=>{
    const t=now();
    if(v==='pwr')togglePower();
    else if(v==='deg'){ST.degT0=t;}
    else if(v==='chan'){ST.chanT0=t;setTimeout(()=>{if(SRC.name==='Demo'||SRC.name==='Test'){const n=SRC.name==='Demo'?'Test':'Demo';setSource(n==='Demo'?demoCanvas():testCanvas(),n);refreshUI();}},350);}
    else if(v==='burst')ST.chanT0=t;
    else if(v==='mut')mutate();
    else if(v==='save')saveLook();
    else if(v==='rst')resetAll();
  },'act');
}
function togglePower(){ST.pwr=ST.pwr===1?0:1;ST.pwrT0=now();refreshUI();}
function mutate(){
  const others=PROFILES.filter(p=>p[0]!==P.profile&&p[0]!=='studio'&&p[0]!=='none');
  const o=others[Math.random()*others.length|0],w=.3+Math.random()*.4;
  for(const k in o[2]){
    const c=CTL[k];
    if(c&&c.t==='r')P[k]=clamp(Math.round(lerp(P[k],o[2][k],w)),c.min,c.max);
    else if(c&&Math.random()<w)P[k]=o[2][k];
  }
  P.seed=Math.random()*999|0;P.profile='mutant';snap();refreshUI();toast('Hardware mutated');
}
function shuffle(){
  const r=a=>a[Math.random()*a.length|0];
  applyProfile(r(PROFILES.filter(p=>p[0]!=='none'))[0]);
  P.seed=Math.random()*999|0;
  if(Math.random()<.6)P.method=r(CTL.method.opts.slice(1))[0];
  if(Math.random()<.6)P.pal=r(PALS.filter(p=>p.id!=='custom'&&p.id!=='src')).id;
  snap();refreshUI();
}

/* ---------- bitmap tab custom: palette ---------- */
function palGradient(p){
  if(p.id==='src')return'linear-gradient(90deg,#ff5d5d,#ffcc4d,#4dd68c,#4d8bff)';
  const cols=(p.id==='custom'?P.custom:p.c).map(hexRGB).sort((a,b)=>lum255(a)-lum255(b));
  const n=cols.length;
  return'linear-gradient(90deg,'+cols.map((c,i)=>`rgb(${c}) ${i/n*100}% ${(i+1)/n*100}%`).join(',')+')';
}
function buildPalettes(){
  const g=group('bitmap','Palette');
  const lbl=g.firstChild;const nm=el('span');nm.id='palName';nm.style.float='right';lbl.appendChild(nm);
  const row=el('div','chips');row.id='pals';
  PALS.forEach(p=>{
    const b=el('button','sw');b.dataset.v=p.id;b.title=p.name;b.setAttribute('aria-label',p.name);b.style.background=palGradient(p);
    b.addEventListener('click',()=>{P.pal=p.id;snap();refreshUI();});row.appendChild(b);
  });
  g.appendChild(row);
  const pe=el('div','pal-edit');pe.id='palEdit';g.appendChild(pe);
  UI.palGroup=g;
}
function buildPalEdit(){
  const pe=$('#palEdit');pe.innerHTML='';
  P.custom.forEach((h,i)=>{
    const inp=el('input');inp.type='color';inp.value=h;
    inp.addEventListener('input',()=>{P.custom[i]=inp.value;const sw=document.querySelector('#pals .sw[data-v=custom]');if(sw)sw.style.background=palGradient(PALS.find(p=>p.id==='custom'));});
    inp.addEventListener('change',snap);pe.appendChild(inp);
  });
  const add=el('button','chip act','+');add.addEventListener('click',()=>{if(P.custom.length<16){P.custom.push('#888888');snap();refreshUI();}});
  const rem=el('button','chip act','−');rem.addEventListener('click',()=>{if(P.custom.length>2){P.custom.pop();snap();refreshUI();}});
  const ex=el('button','chip act','From image');ex.addEventListener('click',()=>{P.custom=extractPalette(6);snap();refreshUI();});
  pe.append(add,rem,ex);
  const sw=document.querySelector('#pals .sw[data-v=custom]');if(sw)sw.style.background=palGradient(PALS.find(p=>p.id==='custom'));
}
function extractPalette(k){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d',{willReadFrequently:true});
  try{g.drawImage(SRC.el,0,0,64,64);}catch(e){return P.custom;}
  const d=g.getImageData(0,0,64,64).data,pts=[];
  for(let i=0;i<d.length;i+=4)pts.push([d[i],d[i+1],d[i+2]]);
  const sorted=pts.slice().sort((a,b)=>lum255(a)-lum255(b));
  let cs=Array.from({length:k},(_,i)=>sorted[Math.floor((i+.5)/k*sorted.length)].slice());
  for(let it=0;it<8;it++){
    const sum=cs.map(()=>[0,0,0,0]);
    for(const p of pts){
      let b=0,bd=1e9;
      for(let j=0;j<k;j++){const dd=(p[0]-cs[j][0])**2+(p[1]-cs[j][1])**2+(p[2]-cs[j][2])**2;if(dd<bd){bd=dd;b=j;}}
      sum[b][0]+=p[0];sum[b][1]+=p[1];sum[b][2]+=p[2];sum[b][3]++;
    }
    cs=cs.map((c0,j)=>sum[j][3]?[sum[j][0]/sum[j][3],sum[j][1]/sum[j][3],sum[j][2]/sum[j][3]]:c0);
  }
  P.pal='custom';
  return cs.sort((a,b)=>lum255(a)-lum255(b)).map(rgbHex);
}

/* ---------- lab tab: text, voltages, mic ---------- */
function buildLabExtras(){
  const gt=UI.textGroup;
  const ta=el('textarea','field');ta.id='txtArea';ta.rows=3;ta.spellcheck=false;ta.placeholder='Terminal text. Use {t} for a live clock.';
  ta.addEventListener('input',()=>{P.txt=ta.value;});ta.addEventListener('change',snap);
  gt.insertBefore(ta,gt.children[2]||null);
  const gv=group('lab','Voltage dreams');
  const opts=['<option value="">Target</option>'];
  TABS.forEach(([tid,tn])=>{
    const rs=CT.filter(c=>c.tab===tid&&c.t==='r'&&c.k!=='seed'&&c.k!=='lines');
    if(rs.length)opts.push(`<optgroup label="${tn}">`+rs.map(c=>`<option value="${c.k}">${c.l}</option>`).join('')+'</optgroup>');
  });
  MODS.forEach((m,i)=>{
    const box=el('div','mod');
    const line=el('div','line');
    const sel=el('select','field');sel.innerHTML=opts.join('');
    const shp=el('select','field');shp.innerHTML=SIGNALS.map(([s,n])=>`<option value="${s}">${n}</option>`).join('');
    sel.addEventListener('change',()=>{m.target=sel.value;});shp.addEventListener('change',()=>{m.shape=shp.value;if(['audio','bass','mid','treble','beat'].includes(m.shape)&&!audio.on&&!AUD.on)toggleMic();});
    line.append(sel,shp);box.appendChild(line);
    const mk=(label,key,min,max,step)=>{
      const row=el('div','row');row.innerHTML=`<label>${label}</label><output></output><input type="range" min="${min}" max="${max}" step="${step}">`;
      const inp=$('input',row),out=$('output',row);
      const paint=()=>{inp.value=m[key];out.textContent=m[key];inp.style.setProperty('--p',((m[key]-min)/(max-min)*100)+'%');};
      inp.addEventListener('input',()=>{m[key]=+inp.value;paint();});paint();box.appendChild(row);
    };
    mk('Rate (Hz)','rate',.05,6,.05);mk('Depth','depth',0,100,1);
    box.dataset.i=i;box._sel=sel;box._shp=shp;gv.appendChild(box);
  });
  const gi=group('lab','Input');
  chipRow(gi,[['mic','Microphone level']],'micRow',()=>toggleMic(),'');
}
function refreshMods(){
  document.querySelectorAll('.mod').forEach(b=>{const m=MODS[+b.dataset.i];b._sel.value=m.target;b._shp.value=m.shape;});
  const mr=$('#micRow .chip');if(mr)mr.setAttribute('aria-pressed',audio.on);
}
async function toggleMic(){
  if(audio.on){audio.on=false;try{audio.ctx.close();}catch(e){}refreshUI();return;}
  try{
    const s=await navigator.mediaDevices.getUserMedia({audio:true});
    audio.ctx=new (window.AudioContext||window.webkitAudioContext)();
    const src=audio.ctx.createMediaStreamSource(s);audio.an=audio.ctx.createAnalyser();audio.an.fftSize=256;
    src.connect(audio.an);audio.data=new Uint8Array(audio.an.frequencyBinCount);audio.on=true;refreshUI();
  }catch(e){toast('Microphone unavailable here');}
}
/* ---- audio file as a source: five ways to see sound. The visualizer is a canvas source, so every effect applies to it. ---- */
const AUD_MODES=['Waterfall','Radial','Scope','Ridges','Cymatics'];
const AUD={s:{},sp:new Float32Array(64),bavg:0,beat:false,lastBeat:0,auto:false,cur:0,autoT:0,on:false,mode:1,gain:1,el:null,ctx:null,an:null,aL:null,aR:null,dest:null,cv:null,g:null,f:null,t:null,l:null,r:null,hist:[],bass:0,mid:0,hi:0,lvl:0,cen:.25,cn:3,cm:4,ph:0,url:'',name:''};
Object.assign(hooks,{AUD,stopAudio,group,el,chipRow,snap,refreshUI,stepGif,audFrame});

function stopAudio(){
  if(!AUD.on)return;AUD.on=false;
  try{AUD.el.pause();URL.revokeObjectURL(AUD.url);}catch(e){}try{AUD.ctx.close();}catch(e){}
  audio.on=false;audio.level=0;delete document.body.dataset.aud;const b=$('#audbar');if(b)b.hidden=true;
}
async function startAudio(file){
  stopAudio();toast('Loading '+file.name.slice(0,26)+'…');let ctx;
  try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){toast('Audio isn’t available here');return;}
  const el=new Audio();AUD.url=URL.createObjectURL(file);el.src=AUD.url;el.loop=true;el.preload='auto';
  try{
    const node=ctx.createMediaElementSource(el),an=ctx.createAnalyser();an.fftSize=2048;an.smoothingTimeConstant=.78;
    const sp=ctx.createChannelSplitter(2),aL=ctx.createAnalyser(),aR=ctx.createAnalyser();aL.fftSize=aR.fftSize=1024;
    node.connect(an);an.connect(ctx.destination);node.connect(sp);sp.connect(aL,0);sp.connect(aR,1);
    const dest=ctx.createMediaStreamDestination();node.connect(dest);
    ctx.resume().catch(()=>{});
    try{await Promise.race([el.play(),new Promise((_,no)=>setTimeout(()=>no(new Error('timeout')),6000))]);}catch(pe){if(el.error)throw pe;toast('Tap the screen to start the sound',2600);const go=()=>{ctx.resume();el.play().catch(()=>{});};document.addEventListener('pointerdown',go,{once:true});}
    if(ctx.state!=='running')document.addEventListener('pointerdown',()=>{ctx.resume();if(el.paused)el.play().catch(()=>{});},{once:true});
    Object.assign(AUD,{el,ctx,an,aL,aR,dest,f:new Uint8Array(an.frequencyBinCount),t:new Uint8Array(an.fftSize),l:new Uint8Array(aL.fftSize),r:new Uint8Array(aR.fftSize),hist:[],row:null,name:file.name});
  }catch(e){try{ctx.close();}catch(_){}URL.revokeObjectURL(AUD.url);toast(el.error&&el.error.code===4?'This browser can’t play that audio format. Try an mp3 or m4a.':e.message==='timeout'?'The audio took too long to start. Try a smaller file or tap the screen and try again.':'That audio file couldn’t be played');return;}
  const cv=document.createElement('canvas');cv.width=1024;cv.height=768;AUD.cv=cv;AUD.g=cv.getContext('2d');AUD.g.fillStyle='#000';AUD.g.fillRect(0,0,1024,768);
  setSource(cv,'Audio',true);SRC.viz=true;AUD.on=true;audio.on=true;audio.an=null;
  document.body.dataset.aud='1';buildAudUI();refreshUI();toast('Playing '+file.name.slice(0,28));
}
const lerpA=(a,b,t)=>a+(b-a)*t;
function audFrame(){
  const a=AUD;if(!a.on)return;
  a.an.getByteFrequencyData(a.f);a.an.getByteTimeDomainData(a.t);a.aL.getByteTimeDomainData(a.l);a.aR.getByteTimeDomainData(a.r);
  const avg=(i0,i1)=>{let s=0;for(let i=i0;i<i1;i++)s+=a.f[i];return s/(i1-i0)/255;};
  a.bass=lerpA(a.bass,Math.min(1,avg(1,12)*a.gain),.5);a.mid=lerpA(a.mid,Math.min(1,avg(12,120)*a.gain*1.6),.5);a.hi=lerpA(a.hi,Math.min(1,avg(120,500)*a.gain*3),.5);
  a.lvl=lerpA(a.lvl,Math.min(1,avg(1,300)*a.gain*2),.4);
  let sw=0,s=0;for(let i=2;i<400;i++){sw+=a.f[i]*i;s+=a.f[i];}a.cen=lerpA(a.cen,s>0?Math.min(1,sw/s/160):a.cen,.08);
  audio.level=Math.min(1,a.lvl*1.4);
  for(let i=0;i<64;i++)a.sp[i]=magAt(a,i/63);
  const nowT=performance.now();a.bavg=lerpA(a.bavg,a.bass,.04);a.beat=a.bass>a.bavg*1.28+.07&&nowT-a.lastBeat>170;if(a.beat)a.lastBeat=nowT;
  if(a.auto&&(nowT-a.autoT>15000||(a.beat&&a.bass>.8&&nowT-a.autoT>7000))){a.cur=(a.cur+1+Math.floor(Math.random()*4))%(AUD_MODES.length-1);a.autoT=nowT;a.s={};a.g.fillStyle='#000';a.g.fillRect(0,0,1024,768);const m=$('#audmode');if(m)m.textContent='Auto · '+AUD_MODES[a.cur];if(a.fxAuto)randomEffect();}
  AUD_DRAW[a.auto?a.cur:a.mode](a,a.g,1024,768);
}
const binAt=u=>Math.min(1023,Math.floor(1+Math.pow(u,2)*640));
const magAt=(a,u)=>Math.min(1,a.f[binAt(u)]/255*a.gain);
const AUD_DRAW=[
 /* Waterfall: frequency across, time flowing up, heat colors */
 (a,g,W,H)=>{g.drawImage(a.cv,0,-3);const im=a.row||(a.row=g.createImageData(W,3));
   for(let x=0;x<W;x++){const m=magAt(a,x/W),r=255*Math.min(1,m*1.7),gg=255*Math.min(1,Math.max(0,(m-.4)*1.8)),b=255*Math.min(1,Math.max(0,(m-.85)*5));
     for(let y=0;y<3;y++){const i=(y*W+x)*4;im.data[i]=r;im.data[i+1]=gg;im.data[i+2]=b;im.data[i+3]=255;}}
   g.putImageData(im,0,H-3);},
 /* Radial: a mirrored spectrum bloom around a breathing ring with the waveform wrapped on it */
 (a,g,W,H)=>{g.fillStyle='rgba(0,0,0,.24)';g.fillRect(0,0,W,H);const cx=W/2,cy=H/2,r0=105+a.bass*120,N=120;g.lineCap='round';g.lineWidth=5;
   for(let i=0;i<N;i++){const u=i/N,m=magAt(a,u),len=m*250+3,h=(340+u*120)%360;g.strokeStyle=`hsl(${h},95%,${45+m*25}%)`;
     for(const sg of[-1,1]){const an=-Math.PI/2+sg*u*Math.PI,c=Math.cos(an),s=Math.sin(an);g.beginPath();g.moveTo(cx+c*r0,cy+s*r0);g.lineTo(cx+c*(r0+len),cy+s*(r0+len));g.stroke();}}
   g.strokeStyle='rgba(255,240,220,.9)';g.lineWidth=2.5;g.beginPath();for(let k=0;k<=256;k++){const t=(a.t[(k%256)*8]-128)/128,an=k/256*Math.PI*2,r=r0*.78+t*70*a.gain;const x=cx+Math.cos(an)*r,y=cy+Math.sin(an)*r;k?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();},
 /* Scope: left against right (or the signal against a delayed copy of itself when mono), a glowing phase trace */
 (a,g,W,H)=>{g.globalCompositeOperation='source-over';g.fillStyle='rgba(0,0,0,.16)';g.fillRect(0,0,W,H);
   let dd=0,pk=8;for(let i=0;i<1024;i+=2){if(i%8===0)dd+=Math.abs(a.l[i]-a.r[i]);pk=Math.max(pk,Math.abs(a.l[i]-128),Math.abs(a.r[i]-128));}const mono=dd<300,agc=Math.min(4,90/pk);
   g.globalCompositeOperation='lighter';const h=(330+((performance.now()/40+a.hi*260)%140))%360;g.strokeStyle=`hsl(${h},90%,${48+a.lvl*20}%)`;g.lineWidth=2.4;g.beginPath();
   for(let i=0;i<1024;i++){const xl=(a.l[i]-128)/128,yr=mono?(a.l[(i+37)%1024]-128)/128:(a.r[i]-128)/128,x=W/2+xl*W*.44*a.gain*agc,y=H/2-yr*H*.44*a.gain*agc;i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();g.globalCompositeOperation='source-over';},
 /* Ridges: stacked spectrum lines that hide the ones behind them */
 (a,g,W,H)=>{const line=new Float32Array(120);for(let j=0;j<120;j++)line[j]=magAt(a,j/119);a.hist.push(line);if(a.hist.length>34)a.hist.shift();
   g.fillStyle='#000';g.fillRect(0,0,W,H);const n=a.hist.length;g.lineWidth=2.2;g.strokeStyle='rgba(255,236,212,.92)';
   for(let k=0;k<n;k++){const by=150+k/Math.max(1,n-1)*(H-250),L=a.hist[k];g.beginPath();for(let j=0;j<120;j++){const x=90+j/119*(W-180),y=by-L[j]*190*(.55+.45*k/n);j?g.lineTo(x,y):g.moveTo(x,y);}
     g.stroke();g.lineTo(W-90,H);g.lineTo(90,H);g.closePath();g.fillStyle='#000';g.fill();
     g.beginPath();for(let j=0;j<120;j++){const x=90+j/119*(W-180),y=by-L[j]*190*(.55+.45*k/n);j?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}},
 /* Cymatics: a vibrating-plate pattern whose mode numbers follow the pitch and whose wobble follows the bass */
 (a,g,W,H)=>{const w=256,h=192,oc=a.oc||(a.oc=Object.assign(document.createElement('canvas'),{width:w,height:h})),og=oc.getContext('2d'),im=a.cim||(a.cim=og.createImageData(w,h));
   a.cn=lerpA(a.cn,2+a.cen*10,.06);a.cm=lerpA(a.cm,a.cn+1+a.hi*5,.06);a.ph+=.012+a.bass*.06;const n=a.cn,m=a.cm,k=Math.cos(a.ph),th=.05+.14*a.lvl;
   const cxs=new Float32Array(w),cxm=new Float32Array(w),cys=new Float32Array(h),cym=new Float32Array(h);
   for(let x=0;x<w;x++){cxs[x]=Math.cos(n*Math.PI*x/w);cxm[x]=Math.cos(m*Math.PI*x/w);}for(let y=0;y<h;y++){cys[y]=Math.cos(n*Math.PI*y/h);cym[y]=Math.cos(m*Math.PI*y/h);}
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=Math.abs(cxs[x]*cym[y]-k*cxm[x]*cys[y]),l=Math.max(0,1-v/th),i=(y*w+x)*4;
     im.data[i]=22+233*l;im.data[i+1]=14+176*l;im.data[i+2]=9+88*l;im.data[i+3]=255;}
   og.putImageData(im,0,0);g.imageSmoothingEnabled=true;g.drawImage(oc,0,0,W,H);}
];
/* ---- more ways to see sound: media-player visualizer classics ---- */
const TAU=Math.PI*2,vhue=u=>(330+u*150)%360;
const vfade=(g,W,H,al)=>{g.globalCompositeOperation='source-over';g.fillStyle=`rgba(0,0,0,${al})`;g.fillRect(0,0,W,H);};
const vfield=(a,w,h,fill)=>{const oc=a.foc||(a.foc=Object.assign(document.createElement('canvas'),{width:w,height:h}));if(oc.width!==w){oc.width=w;oc.height=h;}const og=oc.getContext('2d'),im=a.fim&&a.fim.width===w?a.fim:(a.fim=og.createImageData(w,h));fill(im.data);og.putImageData(im,0,0);return oc;};
const VNAMES=['Bars & Waves','Ambience','Battery','Alchemy','Jelly','Starfield','Tunnel','Fireworks','Plasma','Feedback','Musical Colors','Lava','Spirograph','LED Matrix','VU Meters','Oscilloscope'];
AUD_MODES.splice(AUD_MODES.length,0,...VNAMES,'Auto');
AUD_DRAW.push(
 /* Bars & Waves */
 (a,g,W,H)=>{vfade(g,W,H,.4);const s=a.s,n=40,bw=W/n;s.pk=s.pk||new Float32Array(n);
   for(let i=0;i<n;i++){const m=a.sp[Math.floor(i/n*64)];s.pk[i]=Math.max(m,s.pk[i]-.01);const h=H*.62*m;g.fillStyle=`hsl(${vhue(i/n)},90%,${48+m*14}%)`;g.fillRect(i*bw+3,H*.88-h,bw-6,h);g.fillStyle='#fff';g.fillRect(i*bw+3,H*.88-H*.62*s.pk[i]-7,bw-6,4);}
   g.strokeStyle='rgba(255,255,255,.88)';g.lineWidth=3;g.beginPath();for(let x=0;x<=W;x+=8){const v=(a.t[Math.floor(x/W*1023)]-128)/128;const y=H*.3+v*H*.2*a.gain;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();},
 /* Ambience: drifting soft blobs */
 (a,g,W,H)=>{const s=a.s;vfade(g,W,H,.12);if(!s.b){s.b=Array.from({length:7},(_,i)=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*2.4,vy:(Math.random()-.5)*2.4,h:i*22}));}
   g.globalCompositeOperation='lighter';s.b.forEach((o,i)=>{o.x+=o.vx*(1+a.bass*2);o.y+=o.vy*(1+a.bass*2);if(o.x<0||o.x>W)o.vx*=-1;if(o.y<0||o.y>H)o.vy*=-1;o.h=(o.h+.25+a.hi)%360;
     const r=110+a.sp[(i*9)%64]*300*a.gain,gr=g.createRadialGradient(o.x,o.y,0,o.x,o.y,r);gr.addColorStop(0,`hsla(${(o.h+330)%360},95%,55%,.5)`);gr.addColorStop(1,`hsla(${(o.h+330)%360},95%,55%,0)`);g.fillStyle=gr;g.beginPath();g.arc(o.x,o.y,r,0,TAU);g.fill();});g.globalCompositeOperation='source-over';},
 /* Battery: nested spinning squares that flash on the beat */
 (a,g,W,H)=>{const s=a.s;vfade(g,W,H,.3);s.t=(s.t||0)+.012+a.mid*.04;s.fl=Math.max(0,(s.fl||0)-.06);if(a.beat)s.fl=1;g.globalCompositeOperation='lighter';
   for(let k=0;k<9;k++){const sz=60+k*52+a.bass*70*(1-k/9),an=s.t*(.4+k*.1)*(k%2?1:-1);g.save();g.translate(W/2,H/2);g.rotate(an);g.strokeStyle=`hsla(${vhue(k/9)},95%,${50+s.fl*25}%,.9)`;g.lineWidth=3+a.mid*8+s.fl*6;g.fillStyle=`hsla(${vhue(k/9)},90%,50%,${.04+s.fl*.1})`;g.beginPath();g.rect(-sz/2,-sz/2,sz,sz);g.fill();g.stroke();g.restore();}g.globalCompositeOperation='source-over';},
 /* Alchemy: sparks from the center */
 (a,g,W,H)=>{const s=a.s;s.p=s.p||[];vfade(g,W,H,.16);const n=Math.floor(a.bass*9+a.hi*7)+(a.beat?36:0);
   for(let i=0;i<n&&s.p.length<900;i++){const an=Math.random()*TAU,sp=2+Math.random()*6+a.bass*9;s.p.push({x:W/2,y:H/2,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,l:1,h:vhue(Math.random())});}
   g.globalCompositeOperation='lighter';s.p=s.p.filter(o=>{o.x+=o.vx;o.y+=o.vy;o.vx*=.985;o.vy*=.985;o.l-=.011;if(o.l<=0)return false;g.fillStyle=`hsla(${o.h},95%,58%,${o.l})`;g.beginPath();g.arc(o.x,o.y,2+o.l*7,0,TAU);g.fill();return true;});g.globalCompositeOperation='source-over';},
 /* Jelly: a wobbling bloom */
 (a,g,W,H)=>{const s=a.s;s.t=(s.t||0)+.03;vfade(g,W,H,.2);g.globalCompositeOperation='lighter';const N=96;
   for(let L=0;L<3;L++){const sc=1-L*.2;g.beginPath();for(let j=0;j<=N;j++){const th=j/N*TAU,u=Math.abs(j/N*2-1),m=a.sp[Math.floor(u*40)],r=(130+a.bass*90+m*150*a.gain+Math.sin(th*3+s.t*(L+1))*22*a.mid*3)*sc,x=W/2+Math.cos(th)*r,y=H/2+Math.sin(th)*r;j?g.lineTo(x,y):g.moveTo(x,y);}
     g.closePath();g.fillStyle=`hsla(${(vhue(L/3)+s.t*20)%360},95%,52%,.28)`;g.fill();g.strokeStyle=`hsla(${(vhue(L/3)+s.t*20+30)%360},95%,70%,.8)`;g.lineWidth=3;g.stroke();}g.globalCompositeOperation='source-over';},
 /* Starfield */
 (a,g,W,H)=>{const s=a.s;if(!s.st)s.st=Array.from({length:320},()=>({x:Math.random()*2-1,y:Math.random()*2-1,z:Math.random()}));vfade(g,W,H,.28);const sp=.004+a.bass*.03+a.lvl*.01;g.globalCompositeOperation='lighter';
   s.st.forEach(o=>{const z0=o.z;o.z-=sp;if(o.z<.02){o.x=Math.random()*2-1;o.y=Math.random()*2-1;o.z=1;return;}const px=W/2+o.x/o.z*W*.22,py=H/2+o.y/o.z*W*.22,qx=W/2+o.x/z0*W*.22,qy=H/2+o.y/z0*W*.22;
     g.strokeStyle=`hsla(${vhue(o.z)},90%,${60+a.hi*30}%,${1-o.z*.7})`;g.lineWidth=.6+(1-o.z)*3.4;g.beginPath();g.moveTo(qx,qy);g.lineTo(px,py);g.stroke();});g.globalCompositeOperation='source-over';},
 /* Tunnel */
 (a,g,W,H)=>{const s=a.s;s.z=((s.z||0)+.008+a.bass*.03)%1;s.t=(s.t||0)+.01+a.mid*.02;vfade(g,W,H,.3);g.globalCompositeOperation='lighter';
   for(let k=0;k<18;k++){const u=(k/18+s.z)%1,r=Math.pow(u,2.1)*W*.75+4;g.strokeStyle=`hsla(${vhue(u)},95%,55%,${.15+u*.75})`;g.lineWidth=1+u*7;g.beginPath();
     for(let i=0;i<=72;i++){const th=i/72*TAU+s.t*(1+k*.08),d=1+(a.t[(i*13+k*29)%1024]-128)/128*.09*a.gain,x=W/2+Math.cos(th)*r*d*(1+.15*Math.sin(th*2)),y=H/2+Math.sin(th)*r*d*.78;i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}g.globalCompositeOperation='source-over';},
 /* Fireworks */
 (a,g,W,H)=>{const s=a.s;s.p=s.p||[];vfade(g,W,H,.2);if(a.beat||(a.hi>.7&&Math.random()<.08)){const x=W*(.2+Math.random()*.6),y=H*(.15+Math.random()*.35),h=vhue(Math.random()),n=60+Math.floor(a.lvl*50);
     for(let i=0;i<n&&s.p.length<1400;i++){const an=Math.random()*TAU,sp=1+Math.random()*6;s.p.push({x,y,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,l:1,h:h+Math.random()*30});}}
   g.globalCompositeOperation='lighter';s.p=s.p.filter(o=>{o.x+=o.vx;o.y+=o.vy;o.vy+=.07;o.vx*=.985;o.l-=.012;if(o.l<=0)return false;g.fillStyle=`hsla(${o.h%360},95%,60%,${o.l})`;g.beginPath();g.arc(o.x,o.y,1.5+o.l*3.5,0,TAU);g.fill();return true;});g.globalCompositeOperation='source-over';},
 /* Plasma */
 (a,g,W,H)=>{const s=a.s;s.t=(s.t||0)+.03+a.bass*.08;const t=s.t,w=128,h=96,oc=vfield(a,w,h,d=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=Math.sin(x*.09+t)+Math.sin(y*.11+t*1.3+a.bass*3)+Math.sin((x+y)*.06+a.mid*4)+Math.sin(Math.hypot(x-64+22*Math.sin(t*.7),y-48)*.12-t*2*(1+a.hi)),i=(y*w+x)*4,ph=t*.4;
     d[i]=128+127*Math.sin(v*1.1+ph);d[i+1]=90+90*Math.sin(v*1.4+ph+1.2);d[i+2]=70+70*Math.sin(v*.9+ph+4);d[i+3]=255;}});g.imageSmoothingEnabled=true;g.drawImage(oc,0,0,W,H);},
 /* Feedback: zooming, spinning trails (the Milkdrop look) */
 (a,g,W,H)=>{const s=a.s;s.t=(s.t||0)+.02;g.globalCompositeOperation='source-over';g.save();g.translate(W/2,H/2);g.rotate(.004+a.mid*.012*Math.sin(s.t));const z=1.014+a.bass*.03;g.scale(z,z);g.globalAlpha=.93;g.drawImage(a.cv,-W/2,-H/2);g.restore();g.globalAlpha=1;
   g.fillStyle='rgba(0,0,0,.025)';g.fillRect(0,0,W,H);g.globalCompositeOperation='lighter';g.strokeStyle=`hsl(${(vhue((s.t*.05)%1))},95%,60%)`;g.lineWidth=3;g.beginPath();
   for(let k=0;k<=128;k++){const v=(a.t[(k*8)%1024]-128)/128,an=k/128*TAU,r=140+v*110*a.gain+a.bass*60,x=W/2+Math.cos(an)*r,y=H/2+Math.sin(an)*r*.8;k?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
   if(a.beat){g.strokeStyle='rgba(255,230,200,.8)';g.lineWidth=5;g.beginPath();g.arc(W/2,H/2,60,0,TAU);g.stroke();}g.globalCompositeOperation='source-over';},
 /* Musical Colors: full-height bands that glow with each frequency */
 (a,g,W,H)=>{const s=a.s;s.t=(s.t||0)+.02;vfade(g,W,H,.4);const n=32,bw=W/n;g.globalCompositeOperation='lighter';
   for(let i=0;i<n;i++){const m=a.sp[Math.floor(i/n*64)],off=Math.sin(s.t+i*.4)*H*.08;g.fillStyle=`hsla(${vhue(i/n)},95%,${30+m*35}%,${.25+m*.75})`;g.fillRect(i*bw,off-H*.1,bw+1,H*1.2);}g.globalCompositeOperation='source-over';},
 /* Lava lamp */
 (a,g,W,H)=>{const s=a.s;s.t=(s.t||0)+.012+a.bass*.02;const w=128,h=96,t=s.t,B=[];for(let k=0;k<7;k++)B.push([64+Math.sin(t*(.6+k*.17)+k)*46,48+Math.cos(t*(.5+k*.13)+k*2)*36,7+a.sp[k*6]*15*a.gain+a.bass*8]);
   const oc=vfield(a,w,h,d=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){let f=0;for(let k=0;k<7;k++){const dx=x-B[k][0],dy=y-B[k][1];f+=B[k][2]*B[k][2]/(dx*dx+dy*dy+1);}
     const i=(y*w+x)*4;if(f>1){const u=Math.min(1,(f-1)/2.2);d[i]=255;d[i+1]=60+150*u;d[i+2]=30+60*u;}else{const gl=Math.min(1,f*.9);d[i]=30+120*gl*gl;d[i+1]=6+22*gl;d[i+2]=14+10*gl;}d[i+3]=255;}});g.imageSmoothingEnabled=true;g.drawImage(oc,0,0,W,H);},
 /* Spirograph */
 (a,g,W,H)=>{const s=a.s;s.th=s.th||0;vfade(g,W,H,.09);const R=300,r=R*(.3+a.cen*.4),d=r*(.6+a.mid*.9),k=(R-r)/r;g.globalCompositeOperation='lighter';g.strokeStyle=`hsl(${vhue((s.th*.02)%1)},95%,${55+a.lvl*20}%)`;g.lineWidth=2.5;g.beginPath();
   for(let i=0;i<150;i++){const th=s.th+i*.0035*(1+a.bass*3),x=W/2+((R-r)*Math.cos(th)+d*Math.cos(k*th))*.9,y=H/2+((R-r)*Math.sin(th)-d*Math.sin(k*th))*.9;i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();s.th+=.5*(1+a.bass*3);g.globalCompositeOperation='source-over';},
 /* LED Matrix */
 (a,g,W,H)=>{g.fillStyle='#050505';g.fillRect(0,0,W,H);const s=a.s,cols=32,rows=24,cw=W/cols,ch=H/rows;s.pk=s.pk||new Float32Array(cols);
   for(let i=0;i<cols;i++){const m=a.sp[Math.floor(i/cols*64)];s.pk[i]=Math.max(m,s.pk[i]-.012);const lit=Math.round(m*rows),pk=Math.round(s.pk[i]*rows);
     for(let j=0;j<rows;j++){const on=j<lit,y=H-(j+.5)*ch;g.fillStyle=j===pk-1&&pk>0?'#fff':on?`hsl(${120-j/rows*120},95%,52%)`:'#1b1b1b';g.beginPath();g.arc((i+.5)*cw,y,Math.min(cw,ch)*.36,0,TAU);g.fill();}}},
 /* VU Meters */
 (a,g,W,H)=>{const s=a.s;let sl=0,sr=0;for(let i=0;i<1024;i++){const l=(a.l[i]-128)/128,r=(a.r[i]-128)/128;sl+=l*l;sr+=r*r;}const vl=Math.min(1,Math.sqrt(sl/1024)*3.2*a.gain),vr=Math.min(1,Math.sqrt(sr/1024)*3.2*a.gain);s.vl=lerpA(s.vl||0,vl,vl>(s.vl||0)?.45:.12);s.vr=lerpA(s.vr||0,vr,vr>(s.vr||0)?.45:.12);
   g.fillStyle='#17110a';g.fillRect(0,0,W,H);[[W*.26,s.vl,'L'],[W*.74,s.vr,'R']].forEach(([cx,v,lab])=>{const cy=H*.78,R=W*.2;g.fillStyle='#e8dcc0';g.beginPath();g.rect(cx-W*.22,H*.18,W*.44,H*.62);g.fill();
     g.strokeStyle='#2a1d10';g.lineWidth=3;for(let k=0;k<=10;k++){const an=Math.PI*(1.22+k/10*.56),c=Math.cos(an),sn=Math.sin(an);g.strokeStyle=k>=8?'#b3261e':'#2a1d10';g.lineWidth=k%5===0?5:2.5;g.beginPath();g.moveTo(cx+c*R*1.5,cy+sn*R*1.5);g.lineTo(cx+c*R*(k%5===0?1.28:1.38),cy+sn*R*(k%5===0?1.28:1.38));g.stroke();}
     g.fillStyle='#2a1d10';g.font='bold 34px ui-monospace,monospace';g.fillText(lab,cx-10,H*.3);const an=Math.PI*(1.22+v*.56);g.strokeStyle='#111';g.lineWidth=4;g.beginPath();g.moveTo(cx,cy+R*.1);g.lineTo(cx+Math.cos(an)*R*1.45,cy+Math.sin(an)*R*1.45);g.stroke();g.fillStyle='#111';g.beginPath();g.arc(cx,cy+R*.1,12,0,TAU);g.fill();
     g.fillStyle=v>.9?'#ff3b2f':'#4a1410';g.beginPath();g.arc(cx+W*.18,H*.24,9,0,TAU);g.fill();});},
 /* Oscilloscope */
 (a,g,W,H)=>{g.globalCompositeOperation='source-over';g.fillStyle='rgba(3,16,4,.3)';g.fillRect(0,0,W,H);g.strokeStyle='rgba(60,255,80,.16)';g.lineWidth=1;for(let i=1;i<10;i++){g.beginPath();g.moveTo(W*i/10,0);g.lineTo(W*i/10,H);g.stroke();}for(let j=1;j<8;j++){g.beginPath();g.moveTo(0,H*j/8);g.lineTo(W,H*j/8);g.stroke();}
   let st=0;for(let i=1;i<600;i++){if(a.t[i-1]<128&&a.t[i]>=128){st=i;break;}}g.globalCompositeOperation='lighter';
   [[9,.07],[4,.2],[1.8,1]].forEach(([lw,al])=>{g.strokeStyle=`rgba(125,255,138,${al})`;g.lineWidth=lw;g.beginPath();for(let x=0;x<=W;x+=4){const v=(a.t[Math.min(1023,st+Math.floor(x/W*420))]-128)/128;const y=H/2-v*H*.4*a.gain;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();});g.globalCompositeOperation='source-over';}
);
function setAudMode(i){
  const N=AUD_MODES.length,a=AUD;a.mode=((i%N)+N)%N;a.s={};a.hist=[];a.auto=a.mode===N-1;
  if(a.auto){a.cur=Math.floor(Math.random()*(N-1));a.autoT=performance.now();}
  a.g.globalCompositeOperation='source-over';a.g.globalAlpha=1;a.g.fillStyle='#000';a.g.fillRect(0,0,1024,768);
  const m=$('#audmode');if(m)m.textContent=a.auto?'Auto':AUD_MODES[a.mode];
  if(a.fxAuto&&a.on&&!a.quiet)randomEffect();
}
/* auto cycle effects: every time the visualizer changes, jump to a random effect (never a face effect) */
function randomEffect(){try{const cur=effectId(layer()),l=effectList().filter(e=>e.id!==cur);if(!l.length)return;const e=l[Math.random()*l.length|0];pickEffect(e.id);toast(e.name,1200);}catch(err){console.warn(err);}}
function buildAudUI(){
  let bar=$('#audbar');if(bar){bar.hidden=false;return;}
  bar=el('div','audbar');bar.id='audbar';
  const b=(txt,label,fn)=>{const x=el('button','cb',txt);x.setAttribute('aria-label',label);x.addEventListener('click',fn);return x;};
  const pp=b('❚❚','Play or pause',()=>{if(AUD.el.paused)AUD.el.play();else AUD.el.pause();upd();});pp.id='audpp';
  const seek=document.createElement('input');seek.type='range';seek.min=0;seek.max=1000;seek.value=0;seek.id='audseek';seek.setAttribute('aria-label','Seek');
  seek.addEventListener('input',()=>{if(AUD.el.duration)AUD.el.currentTime=seek.value/1000*AUD.el.duration;});
  const tm=el('span','audtm','0:00');tm.id='audtm';
  const md=b(AUD_MODES[AUD.mode],'Next visualizer',()=>{setAudMode(AUD.mode+1);buzz(8);});md.id='audmode';
  const pv=b('‹','Previous visualizer',()=>{setAudMode(AUD.mode-1);buzz(8);});
  const ls=b('☰','Choose a visualizer',()=>{let p=$('#audlist');if(p){p.remove();return;}p=el('div','audlist');p.id='audlist';
    AUD_MODES.forEach((n,i)=>{const x=el('button','cb',n);x.setAttribute('aria-pressed',i===AUD.mode);x.addEventListener('click',()=>{setAudMode(i);p.remove();buzz(8);});p.appendChild(x);});$('#stage').appendChild(p);});
  const fxb=b('FX ⟳','Auto cycle effects with each visualizer change',()=>{AUD.fxAuto=!AUD.fxAuto;fxb.setAttribute('aria-pressed',AUD.fxAuto);toast(AUD.fxAuto?'Effects change with the visualizer':'Effects stay put',1400);if(AUD.fxAuto)randomEffect();buzz(8);});fxb.id='audfx';fxb.setAttribute('aria-pressed',!!AUD.fxAuto);fxb.title='Auto cycle effects';
  const gn=document.createElement('input');gn.type='range';gn.min=.4;gn.max=3;gn.step=.05;gn.value=AUD.gain;gn.id='audgain';gn.setAttribute('aria-label','Sensitivity');gn.addEventListener('input',()=>{AUD.gain=+gn.value;});
  const gl=el('span','audtm','Gain');
  const cl=b('✕','Remove the audio source',()=>{stopAudio();setSource(demoCanvas(),'Demo');refreshUI();});
  const r1=el('div','audrow'),r2=el('div','audrow');r1.append(pp,seek,tm);r2.append(pv,md,ls,fxb,gl,gn,cl);bar.append(r1,r2);$('#stage').appendChild(bar);
  const fmt=s=>{s=Math.max(0,s|0);return(s/60|0)+':'+String(s%60).padStart(2,'0');};
  const upd=()=>{if(!AUD.on)return;pp.textContent=AUD.el.paused?'▶':'❚❚';if(AUD.el.duration&&document.activeElement!==seek)seek.value=AUD.el.currentTime/AUD.el.duration*1000;tm.textContent=fmt(AUD.el.currentTime)+' / '+fmt(AUD.el.duration||0);};
  setInterval(upd,300);upd();
}
function audioTick(){
  if(!audio.on||!audio.an)return;
  audio.an.getByteFrequencyData(audio.data);
  let s=0;for(let i=0;i<audio.data.length;i++)s+=audio.data[i];
  audio.level=lerp(audio.level,clamp(s/audio.data.length/110,0,1),.35);
}

/* ---------- assemble UI ---------- */
function buildUI(){
  buildTabs();
  buildDisplayExtras();
  buildPalettes();
  const made={};
  CT.forEach(c=>{
    const key=c.tab+'/'+c.g;
    if(!made[key]){
      if(c.tab==='bitmap'&&c.g==='Palette'){made[key]=UI.palGroup;}
      else made[key]=group(c.tab,c.g);
      if(key==='lab/Terminal text')UI.textGroup=made[key];
    }
    const parent=made[key];
    if(c.t==='r')buildRange(c,parent);else if(c.t==='c')buildChips(c,parent);else buildToggle(c,parent);
  });
  buildLabExtras();
  buildProfiles();
  buildDockTabs();
  /* long panes: every titled group folds, one open at a time, so nothing needs a long scroll */
  Object.values(UI.panes).forEach(pane=>{
    const gs=[...pane.querySelectorAll(':scope>.grp')].filter(g=>g.querySelector(':scope>.gt'));
    gs.forEach((g,i)=>{const t=g.querySelector(':scope>.gt');t.tabIndex=0;t.setAttribute('role','button');
      const set=on=>{g.classList.toggle('shut',!on);t.setAttribute('aria-expanded',on);};
      const tog=()=>{const on=g.classList.contains('shut');if(on)gs.forEach(o=>{if(o!==g){o.classList.add('shut');o.firstChild.setAttribute('aria-expanded',false);}});set(on);};
      t.addEventListener('click',tog);t.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tog();}});set(i===0);});
  });
}

/* sheet / panel tabs: Effects (pick a look), Fuse (build a camera-style blend), Layers (edit the stack) */
function setDock(v,quiet){
  if(v==='fuse'){
    let ix=STACK.layers.findIndex(l=>l.module==='fuse');
    if(ix<0){STACK.layers.push(mkLayer('fuse'));ix=STACK.layers.length-1;}
    STACK.sel=ix;INS.gallery=false;INS.tab='look';
  }
  document.body.dataset.dt=v;lsSet('n0ise.dock',v);
  document.querySelectorAll('.dtabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.v===v));
  if(!quiet){buzz(6);renderInspector();}
  const d=$i('dock');if(d)d.scrollTop=0;
}
function buildDockTabs(){
  const dock=$i('dock');if(!dock||dock.querySelector('.dtabs'))return;
  const nav=el('nav','dtabs');nav.setAttribute('role','tablist');
  [['fx','Effects'],['fuse','Fuse'],['layers','Stack']].forEach(([v,n])=>{const b=el('button','',n);b.dataset.v=v;b.setAttribute('role','tab');b.addEventListener('click',()=>setDock(v));nav.appendChild(b);});
  const g=$i('grab');g?g.after(nav):dock.prepend(nav);
  const v=lsGet('n0ise.dock','fx');setDock(v==='fuse'?'layers':v,true);
}

/* bitmap tab ordering: palette block first */
function reorderBitmap(){
  const p=UI.panes.bitmap,pal=[...p.children].find(g=>g.querySelector('#pals'));
  if(pal)p.insertBefore(pal,p.firstChild);
}

/* ---------- sources & export ---------- */
async function loadFile(f){
  if(!f)return;
  if(f.type.startsWith('audio/')||/\.(mp3|wav|m4a|ogg|oga|flac|aac|opus)$/i.test(f.name)){await startAudio(f);return;}
  if(f.type.startsWith('video/')){
    const v=document.createElement('video');v.playsInline=true;v.muted=true;v.loop=true;v.src=URL.createObjectURL(f);
    try{await v.play();setSource(v,'File',true);refreshUI();}catch(e){toast('That video couldn’t be played');}
    return;
  }
  if(f.type==='image/gif'||/\.gif$/i.test(f.name)){
    const g=parseGIF(new Uint8Array(await f.arrayBuffer()));
    if(g&&g.frames.length>1){
      const c=document.createElement('canvas');c.width=g.w;c.height=g.h;
      setSource(c,'File',true);SRC.gif=g;g.t0=performance.now();stepGif();refreshUI();return;
    }
  }
  if(!f.type.startsWith('image/')){toast('Choose an image or video file');return;}
  const u=URL.createObjectURL(f),im=new Image();
  im.onload=()=>{setSource(fitCanvas(im,im.naturalWidth,im.naturalHeight),'File');URL.revokeObjectURL(u);refreshUI();};
  im.onerror=()=>toast('That file couldn’t be read as an image');
  im.src=u;
}
let camFacing='environment';
const CAMOPT={deviceId:'',w:1920,h:1080,fps:30};
function camTrack(){const st=SRC.el&&SRC.el.srcObject;return st&&st.getVideoTracks&&st.getVideoTracks()[0]||null;}
let camGen=0,camErr='',camPM=false,camDemo=false,camEnsure=null,camRetry=0,camLifeOn=false;
function setPM(v){camPM=!!v;canvas.style.transform=v?'scaleX(-1)':'';SRC.mirror=false;SRC.lastVer=-1;}
const camErrMsg=e=>{const n=e&&e.name||'';if(!window.isSecureContext)return'Browsers only allow the camera on a secure (https) page.';if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return'This browser can’t open the camera.';if(n==='NotAllowedError'||n==='SecurityError')return'Camera access was blocked. iPhone: Settings > Safari > Camera > Ask or Allow. Chrome: tap the lock beside the address, then Camera > Allow. Then tap Try again.';if(n==='NotFoundError'||n==='OverconstrainedError')return'No camera was found on this device.';if(n==='NotReadableError')return'Another app is using the camera. Close it and try again.';return'The camera couldn’t start ('+(n||'unknown error')+').';};
async function startCam(flip,opt){
  const gen=++camGen;
  if(flip){camFacing=camFacing==='environment'?'user':'environment';CAMOPT.deviceId='';}
  if(opt)Object.assign(CAMOPT,opt);
  try{
    const old=SRC.el&&SRC.el.srcObject;
    const mk=async(strict)=>navigator.mediaDevices.getUserMedia({video:Object.assign(CAMOPT.deviceId?{deviceId:{exact:CAMOPT.deviceId}}:{facingMode:camFacing},{width:{ideal:CAMOPT.w},height:{ideal:CAMOPT.h},frameRate:{ideal:CAMOPT.fps}}),audio:false});
    if(old&&old.getTracks)old.getTracks().forEach(t=>t.stop());
    let stream;try{stream=await mk();}catch(e){if(CAMOPT.deviceId){CAMOPT.deviceId='';stream=await mk();}else throw e;}
    if(gen!==camGen){stream.getTracks().forEach(t=>t.stop());return false;}
    const v=document.createElement('video');v.playsInline=true;v.muted=true;v.srcObject=stream;await v.play();
    if(gen!==camGen){stream.getTracks().forEach(t=>t.stop());return false;}
    setSource(v,'Camera',true);refreshUI();camErr='';camDemo=false;
    try{stream.getVideoTracks()[0].addEventListener('ended',()=>setTimeout(()=>camEnsure&&camEnsure(),300));}catch(e){}
    try{const t=stream.getVideoTracks()[0],st=t.getSettings();if(st.facingMode==='user')camFacing='user';else if(st.facingMode==='environment')camFacing='environment';}catch(e){}
    return true;
  }catch(e){camErr=camErrMsg(e);toast(camErr,6000);return false;}
}
/* ---------- GIF decode (animated playback) ---------- */
function lzwDec(min,data,n){
  const out=new Uint8Array(n),clear=1<<min,eoi=clear+1,prefix=new Uint16Array(4096),suffix=new Uint8Array(4096),stack=new Uint8Array(4097);
  let size=min+1,next=eoi+1,mask=(1<<size)-1,bits=0,acc=0,ip=0,prev=-1,first=0,op=0;
  for(let i=0;i<clear;i++)suffix[i]=i;
  while(op<n){
    while(bits<size){if(ip>=data.length)return out;acc|=data[ip++]<<bits;bits+=8;}
    const code=acc&mask;acc>>=size;bits-=size;
    if(code===clear){size=min+1;next=eoi+1;mask=(1<<size)-1;prev=-1;continue;}
    if(code===eoi)break;
    if(prev===-1){out[op++]=suffix[code];prev=code;first=code;continue;}
    let c=code,sp=0;
    if(code>=next){stack[sp++]=first;c=prev;}
    while(c>=clear){stack[sp++]=suffix[c];c=prefix[c];}
    first=suffix[c];stack[sp++]=first;
    if(next<4096){prefix[next]=prev;suffix[next]=first;next++;if(next===(1<<size)&&size<12){size++;mask=(1<<size)-1;}}
    prev=code;
    while(sp>0&&op<n)out[op++]=stack[--sp];
  }
  return out;
}
function parseGIF(b){
  if(b[0]!==71||b[1]!==73||b[2]!==70)return null;
  let p=6;const W=b[p]|b[p+1]<<8,H=b[p+2]|b[p+3]<<8,fl=b[p+4];p+=7;
  let gct=null;if(fl&128){const n=3<<((fl&7)+1);gct=b.subarray(p,p+n);p+=n;}
  const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const comp=mk(W,H),cg=comp.getContext('2d',{willReadFrequently:true});
  const gs=Math.min(1,640/Math.max(W,H)),SW=Math.max(1,Math.round(W*gs)),SH=Math.max(1,Math.round(H*gs));
  const maxF=Math.max(8,Math.min(400,Math.floor(48e6/(SW*SH*4))));
  const frames=[];let gce=null;
  while(p<b.length){
    const t=b[p++];
    if(t===0x3B)break;
    if(t===0x21){
      const l=b[p++];
      if(l===0xF9)gce={disp:(b[p+1]>>2)&7,tr:(b[p+1]&1)?b[p+4]:-1,delay:((b[p+2]|b[p+3]<<8)*10)||100};
      while(p<b.length&&b[p])p+=b[p]+1;p++;
    }else if(t===0x2C){
      const x=b[p]|b[p+1]<<8,y=b[p+2]|b[p+3]<<8,w=b[p+4]|b[p+5]<<8,h=b[p+6]|b[p+7]<<8,f=b[p+8];p+=9;
      let ct=gct;if(f&128){const n=3<<((f&7)+1);ct=b.subarray(p,p+n);p+=n;}
      const min=b[p++],parts=[];let len=0;
      while(p<b.length&&b[p]){parts.push(b.subarray(p+1,p+1+b[p]));len+=b[p];p+=b[p]+1;}p++;
      const data=new Uint8Array(len);let o=0;for(const q of parts){data.set(q,o);o+=q.length;}
      const px=lzwDec(min,data,w*h),img=new ImageData(w,h),d=img.data,tr=gce?gce.tr:-1;
      const rows=[];
      if(f&64){for(const [s,st] of [[0,8],[4,8],[2,4],[1,2]])for(let r=s;r<h;r+=st)rows.push(r);}else for(let r=0;r<h;r++)rows.push(r);
      for(let i=0;i<h;i++){const row=rows[i];for(let c=0;c<w;c++){
        const v=px[i*w+c],q=(row*w+c)*4;
        if(v===tr||!ct){d[q+3]=0;continue;}
        d[q]=ct[v*3];d[q+1]=ct[v*3+1];d[q+2]=ct[v*3+2];d[q+3]=255;}}
      const patch=mk(w,h);patch.getContext('2d').putImageData(img,0,0);
      const disp=gce?gce.disp:0,saved=disp===3?cg.getImageData(0,0,W,H):null;
      cg.drawImage(patch,x,y);
      const snap=mk(SW,SH);snap.getContext('2d').drawImage(comp,0,0,SW,SH);
      frames.push({c:snap,d:Math.max(20,gce?gce.delay:100)});
      if(disp===2)cg.clearRect(x,y,w,h);else if(saved)cg.putImageData(saved,0,0);
      gce=null;
      if(frames.length>=maxF)break;
    }else break;
  }
  return frames.length?{w:SW,h:SH,frames,total:frames.reduce((a,f)=>a+f.d,0),last:-1,t0:performance.now()}:null;
}
function stepGif(){
  const g=SRC.gif;if(!g||!(SRC.el instanceof HTMLCanvasElement))return;
  let t=(performance.now()-g.t0)%g.total,i=0;
  while(i<g.frames.length-1&&t>=g.frames[i].d){t-=g.frames[i].d;i++;}
  if(i===g.last)return;g.last=i;
  const cx=SRC.el.getContext('2d');cx.clearRect(0,0,g.w,g.h);cx.drawImage(g.frames[i].c,0,0);uploadSrc();
}

/* ---------- GIF encode (export) ---------- */
function lzwEnc(idx){
  const CLEAR=256,EOI=257,HS=8209,hk=new Int32Array(HS).fill(-1),hv=new Uint16Array(HS),bytes=[];
  let size=9,next=258,acc=0,nb=0;
  const put=c=>{acc|=c<<nb;nb+=size;while(nb>=8){bytes.push(acc&255);acc>>=8;nb-=8;}};
  put(CLEAR);let cur=idx[0];
  for(let i=1;i<idx.length;i++){
    const c=idx[i],key=(cur<<8)|c;let h=((c<<4)^cur)%HS;
    while(hk[h]!==-1&&hk[h]!==key)h=(h+1)%HS;
    if(hk[h]===key){cur=hv[h];continue;}
    put(cur);
    if(next<4096){hk[h]=key;hv[h]=next++;if(next>(1<<size)&&size<12)size++;}
    else{put(CLEAR);hk.fill(-1);next=258;size=9;}
    cur=c;
  }
  put(cur);put(EOI);if(nb>0)bytes.push(acc&255);
  return bytes;
}
function encodeGIF(frames,w,h,delayMs){
  const out=[71,73,70,56,57,97,w&255,w>>8,h&255,h>>8,0xF7,0,0];
  for(let i=0;i<256;i++)out.push(Math.round((i>>5)*255/7),Math.round(((i>>2)&7)*255/7),Math.round((i&3)*255/3));
  out.push(0x21,0xFF,11,...'NETSCAPE2.0'.split('').map(c=>c.charCodeAt(0)),3,1,0,0,0);
  const cs=Math.max(2,Math.round(delayMs/10)),B=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  for(const fr of frames){
    const idx=new Uint8Array(w*h);
    for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i++){
      const j=i*4,t=(B[(y&3)*4+(x&3)]-7.5)*3;
      const r=Math.min(255,Math.max(0,fr[j]+t)),g=Math.min(255,Math.max(0,fr[j+1]+t)),b=Math.min(255,Math.max(0,fr[j+2]+t*1.5));
      idx[i]=(r>>5)<<5|(g>>5)<<2|(b>>6);
    }
    out.push(0x21,0xF9,4,0,cs&255,cs>>8,0,0,0x2C,0,0,0,0,w&255,w>>8,h&255,h>>8,0,8);
    const d=lzwEnc(idx);
    for(let i=0;i<d.length;i+=255){const n=Math.min(255,d.length-i);out.push(n);for(let k=0;k<n;k++)out.push(d[i+k]);}
    out.push(0);
  }
  out.push(0x3B);return new Blob([new Uint8Array(out)],{type:'image/gif'});
}
async function exportGIF(sec,width,setMsg,boom){
  const fps=12,n=sec*fps,w=width,h=Math.round(width*canvas.height/canvas.width);
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d',{willReadFrequently:true});
  const frames=[];ST.clean=true;
  for(let i=0;i<n;i++){
    const t0=performance.now();
    await new Promise(r=>requestAnimationFrame(r));
    cx.drawImage(canvas,0,0,w,h);frames.push(cx.getImageData(0,0,w,h).data);
    setMsg(`Capturing ${i+1}/${n}`);
    const wait=1000/fps-(performance.now()-t0);if(wait>0)await new Promise(r=>setTimeout(r,wait));
  }
  ST.clean=false;if(boom)frames.push(...frames.slice(1,-1).reverse());setMsg('Encoding GIF…');await new Promise(r=>setTimeout(r,30));
  return encodeGIF(frames,w,h,1000/fps);
}

/* ---------- image export: PNG / JPG / WebP at 1x, 2x, 4x ---------- */
const IMG_FMT=[['image/png','png'],['image/jpeg','jpg'],['image/webp','webp']];
async function renderImage(mul,fmt,q){
  const q0=ST.autoQ;ST.expMul=mul;ST.expCap=exportCap();ST.autoQ=1;ST.clean=true;
  try{await frames2();await frames2();const w=canvas.width,h=canvas.height;
    const blob=await new Promise(r=>canvas.toBlob(r,IMG_FMT[fmt][0],q));return{blob,w,h};}
  finally{ST.expMul=0;ST.autoQ=q0;ST.clean=false;await frames2();}
}
async function exportImage(o,msg){
  const [dw,dh]=expDims(SZ.cw||canvas.clientWidth,SZ.ch||canvas.clientHeight,o.mul);
  msg(`Rendering ${dw}×${dh}…`);
  const r=await renderImage(o.mul,o.fmt,.92);
  if(!r.blob){toast('Couldn’t render that size. Try 2x or a smaller size.');return;}
  const ext=r.blob.type==='image/jpeg'?'jpg':r.blob.type==='image/webp'?'webp':'png';
  if(o.fmt===2&&ext!=='webp')toast('This browser can’t save WebP, saved '+ext.toUpperCase()+' instead');
  deliver(r.blob,stamp()+(o.mul>1?'@'+o.mul+'x':'')+'.'+ext,false);
}
/* batch: apply the current look to many images */
async function exportBatch(files,o,msg){
  const keep=SRC.el,keepName=SRC.name,out=[];
  for(let i=0;i<files.length;i++){
    msg(`Image ${i+1}/${files.length}…`);
    const f=files[i];if(!f.type.startsWith('image/'))continue;
    const u=URL.createObjectURL(f),im=new Image();await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=u;}).catch(()=>{});
    if(!im.naturalWidth){URL.revokeObjectURL(u);continue;}
    setSource(fitCanvas(im,im.naturalWidth,im.naturalHeight),'File');URL.revokeObjectURL(u);await frames2();
    const r=await renderImage(o.mul,o.fmt,.92);if(r.blob)out.push(new File([r.blob],f.name.replace(/\.[^.]+$/,'')+'-n0ise.'+IMG_FMT[o.fmt][1],{type:r.blob.type}));
  }
  if(keep)setSource(keep,keepName,keep instanceof HTMLVideoElement);refreshUI();
  if(!out.length){toast('No images could be processed');return;}
  if(navigator.canShare&&navigator.canShare({files:out})){try{await navigator.share({files:out});return;}catch(e){}}
  for(const f of out){const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();a.remove();await new Promise(r=>setTimeout(r,350));}
  toast(out.length+' images saved');
}
/* ---------- export ---------- */
function openSheet(blob,name,isVideo,meta){
  const url=URL.createObjectURL(blob),sh=el('div','sheet');
  const file=new File([blob],name,{type:blob.type});
  const canShare=!!(navigator.canShare&&navigator.canShare({files:[file]}));
  const media=isVideo?`<video src="${url}" controls playsinline loop autoplay muted style="max-width:100%;max-height:56dvh;border-radius:6px"></video>`:`<img alt="Your finished export" src="${url}">`;
  sh.innerHTML=`<div>${media}<p>${(blob.size/1048576).toFixed(1)} MB · ${name.split('.').pop().toUpperCase()}${meta&&meta.dur?' · '+fmtTime(meta.dur):''}</p><div class="xrow"><a class="btn primary" download="${name}" href="${url}">Download</a>${canShare?'<button class="btn" id="shr">Share</button>':''}<button class="btn" id="cls">Close</button>${!isVideo?'<button class="btn" id="to3">Open in 3D</button>':''}${meta&&meta.id?'<button class="btn" id="dis">Discard</button>':''}</div></div>`;
  document.body.appendChild(sh);
  const close=()=>{sh.remove();URL.revokeObjectURL(url);};
  $('#cls',sh).addEventListener('click',close);
  {const b=$('#to3',sh);if(b)b.addEventListener('click',async()=>{await handoffPut(blob,{from:'camera'});location.href='studio.html#from=camera';});}
  {const d=$('#dis',sh);if(d)d.addEventListener('click',async()=>{await rollDelete(meta.id);close();camThumbUpdate();toast('Discarded');});}
  sh.addEventListener('pointerdown',e=>{if(e.target===sh)close();});
  const shr=$('#shr',sh);if(shr)shr.addEventListener('click',async()=>{try{await navigator.share({files:[file]});}catch(e){}});
}
function deliver(blob,name,isVideo){if(CAMMODE){rollAdd(blob,name,isVideo).then(ok=>ok&&toast(isVideo?'Video saved to roll':'Saved to roll'));return;}openSheet(blob,name,isVideo);}
const stamp=()=>`n0ise-${P.profile}-${Date.now().toString(36)}`;
const frames2=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
async function savePNG(){
  if(!GLOK)return;
  ST.clean=true;await frames2();
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));ST.clean=false;
  if(!blob){toast('Couldn’t export that image');return;}
  deliver(blob,stamp()+'.png',false);
}
/* ---- WP2: camera screen ---- */
let camAuto=false,camAutoT=0,CAMMODE=false,camTimer=0,camGrid=false,camFps=false,camBusy=false;
const rollDB=()=>new Promise((res,rej)=>{if(!window.indexedDB)return rej(new Error('no idb'));const q=indexedDB.open('n0ise-roll',1);q.onupgradeneeded=()=>q.result.createObjectStore('caps',{keyPath:'id',autoIncrement:true});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
async function rollAdd(blob,name,isVideo,poster,dur){try{const db=await rollDB();const id=await new Promise((res,rej)=>{const tx=db.transaction('caps','readwrite');const rq=tx.objectStore('caps').add({blob,name,isVideo,poster:poster||null,dur:dur||0,ts:Date.now()});tx.oncomplete=()=>res(rq.result);tx.onerror=()=>rej(tx.error);});camThumbUpdate();return id||true;}catch(e){toast('Couldn’t save to the roll. Download it instead.');deliver2(blob,name,isVideo);return false;}}
async function rollList(){try{const db=await rollDB();return await new Promise((res,rej)=>{const out=[],tx=db.transaction('caps');const c=tx.objectStore('caps').openCursor(null,'prev');c.onsuccess=()=>{const cur=c.result;if(cur&&out.length<60){out.push(cur.value);cur.continue();}else res(out);};c.onerror=()=>rej(c.error);});}catch(e){return[];}}
async function rollDelete(id){try{const db=await rollDB();await new Promise(res=>{const tx=db.transaction('caps','readwrite');tx.objectStore('caps').delete(id);tx.oncomplete=res;});}catch(e){}}
const deliver2=(b,n,v)=>openSheet(b,n,v);
async function camThumbUpdate(){const b=$('#camroll');if(!b)return;const l=await rollList();b.innerHTML='';const t=l[0],tb=t&&(t.isVideo?t.poster:t.blob);if(tb){const im=new Image();im.alt='';im.src=URL.createObjectURL(tb);im.onload=()=>URL.revokeObjectURL(im.src);b.appendChild(im);if(t.isVideo)b.appendChild(el('i','playbadge','▶'));}else b.textContent=l.length?String(l.length):'Roll';}
async function openRoll(){
  const sh=el('div','sheet'),l=await rollList(),urls=[];
  const box=el('div','rollbox',`<h3>Roll</h3>`);const grid=el('div','rollgrid');
  if(!l.length)box.appendChild(el('p','','Nothing here yet. Tap the shutter for a photo, hold it to record.'));
  l.forEach(c=>{const u=URL.createObjectURL(c.blob);urls.push(u);const b=el('button','rollitem');b.setAttribute('aria-label','Open '+c.name);
    b.innerHTML=c.isVideo?`<video src="${u}" muted playsinline></video>`:`<img alt="" src="${u}">`;
    b.addEventListener('click',()=>{close();openSheet(c.blob,c.name,c.isVideo);});
    const d=el('button','rolldel','×');d.setAttribute('aria-label','Delete');d.addEventListener('click',async e=>{e.stopPropagation();await rollDelete(c.id);b.remove();d.remove();camThumbUpdate();});
    const w=el('div','rollcell');w.append(b,d);grid.appendChild(w);});
  box.appendChild(grid);const cl=el('button','btn','Close');box.appendChild(cl);sh.appendChild(box);document.body.appendChild(sh);
  const close=()=>{sh.remove();urls.forEach(URL.revokeObjectURL);};cl.addEventListener('click',close);
}
/* camera bodies (see cams.js): a Fuse recipe + frame shape + overlay, applied to the shared engine */
let camIx=0,camStr=50,camText=false,camSaved=null,camOvT=0,camRec0=0,camRecOn=false;
const DUO={sub:'#f2efe8',bg:'#0a0a0a',soft:12,fg:'',bgfx:''};
let camCat='All',camFavs=[];
const camVis=i=>{const c=CAMS[i];return camCat==='All'||(camCat==='★'?camFavs.includes(c.id):c.cat===camCat);};
function setCamCat(n){camCat=n;lsSet('n0ise.camcat',n);const st=$('#camstrip');if(!st)return;
  [...st.children].forEach((b,i)=>{b.hidden=!camVis(i);});$('#camcats').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.c===n));
  if(!camVis(camIx)){const f=CAMS.findIndex((c,i)=>camVis(i));if(f>=0)applyCam(f);else toast('No favourites yet. Tap the star on a camera.');}else paintCamUI();}
function camStep(d){let i=camIx;for(let k=0;k<CAMS.length;k++){i=(i+d+CAMS.length)%CAMS.length;if(camVis(i))break;}applyCam(i);}
function camFavToggle(){const id=CAMS[camIx].id,k=camFavs.indexOf(id);if(k<0)camFavs.push(id);else camFavs.splice(k,1);lsSet('n0ise.camfavs',camFavs);paintCamUI();if(camCat==='★')setCamCat('★');}
function camSurprise(){const pool=CAMS.map((c,i)=>i).filter(i=>i!==camIx);applyCam(pool[Math.random()*pool.length|0]);}
function camMix(){const sl=camSim();if(!sl)return;const defs=Object.fromEntries(MODULES.camsim.params.map(p=>[p.k,p]));const base=SIMS[CAMS[camIx].sim]||{};
  Object.keys(base).forEach(k=>{const d=defs[k];if(!d||d.t==='color'||typeof base[k]!=='number'||k==='res'||k==='bits')return;const r=(d.max-d.min)*.2;sl.params[k]=Math.max(d.min,Math.min(d.max,base[k]+(Math.random()*2-1)*r));});
  sl.params.seed2=Math.floor(Math.random()*99);buzz(8);toast('Mixed within '+CAMS[camIx].name);}
function duoApply(){const c=CAMS[camIx];if(c&&c.duo)applyCam(camIx,true);}
function applyCam(i,quiet){
  camIx=(i+CAMS.length)%CAMS.length;const c=CAMS[camIx];lsSet('n0ise.cam',c.id);
  const layers=[];
  if(c.fx&&c.fx.length){const l=mkLayer('fuse');for(let k=1;k<=4;k++){fuseSet(l,k,null);l.params['on'+k]=false;}
    c.fx.forEach((id,k)=>{fuseSet(l,k+1,id);l.params['mx'+(k+1)]=c.mix[k]??100;});layers.push(l);}
  (c.mods||[]).forEach(m=>{if(MODULES[m.module])layers.push(mkLayer(m.module,m.params));});
  if(c.duo){const so=layers.find(l=>l.module==='solid');if(so)Object.assign(so.params,{sub:DUO.sub,bg:DUO.bg,soft:DUO.soft,keep:0});
    [['subject',DUO.fg],['background',DUO.bgfx]].forEach(([sel,id])=>{if(!id||!FXBY[id])return;const f=mkLayer('fuse');for(let k=1;k<=4;k++){fuseSet(f,k,null);f.params['on'+k]=false;}fuseSet(f,1,id);f.select=sel;layers.push(f);});}
  if(layers.some(l=>MODULES[l.module]&&MODULES[l.module].needsMask))loadPerson(true);
  const sl=mkLayer('camsim');Object.assign(sl.params,SIMS[c.sim]||{});layers.push(sl);
  STACK.layers=layers;STACK.sel=layers.length-1;P.aspect=c.aspect;V.sizeKey='';V.lastBKey='';
  setCamStr(camStr);paintCamUI();applyPro();if(!quiet)buzz(8);
}
function setCamStr(v){camStr=v;const l=STACK.layers.find(x=>x.module==='camsim');if(l)l.params.amt=v*2;}
function drawCamOv(){
  const ov=$('#camov');if(!ov||!CAMMODE)return;const r=canvas.getBoundingClientRect(),st=$('#stage').getBoundingClientRect();
  const w=Math.round(r.width),h=Math.round(r.height);if(ov.width!==w||ov.height!==h){ov.width=w;ov.height=h;}
  ov.style.left=(r.left-st.left)+'px';ov.style.top=(r.top-st.top)+'px';ov.style.width=w+'px';ov.style.height=h+'px';
  drawOverlay(ov.getContext('2d'),w,h,CAMS[camIx],{text:camText,t:camRecOn?(performance.now()-camRec0)/1000:0,recOn:camRecOn});
}
function paintCamUI(){
  const st=$('#camstrip');if(!st)return;
  [...st.children].forEach((b,i)=>{b.setAttribute('aria-pressed',i===camIx);});
  const t=st.children[camIx];if(t&&!st._dragging)st.scrollTo({left:t.offsetLeft-(st.clientWidth-t.offsetWidth)/2,behavior:st._first?'smooth':'auto'});st._first=true;
  {const d=$('#camduo');if(d)d.hidden=!CAMS[camIx].duo;}
  const c=CAMS[camIx];{const f=$('#camfav');if(f){const on=camFavs.includes(c.id);f.textContent=on?'★':'☆';f.setAttribute('aria-pressed',on);}}
  $('#camname').textContent=c.name;$('#camsub').textContent=c.sub;const a=$('#camasp');if(a)a.textContent=P.aspect==='src'?'Full':P.aspect;
  {const bt=$('.cambot'),app=document.querySelector('.app');if(bt&&app){app.style.setProperty('--stagepad','0px');app.style.setProperty('--campad',bt.offsetHeight+'px');document.documentElement.style.setProperty('--campad',bt.offsetHeight+'px');V.sizeKey='';ST.freeze=0;}}
  drawCamOv();
}
function composite(){const o=document.createElement('canvas');o.width=canvas.width;o.height=canvas.height;const g=o.getContext('2d');g.drawImage(canvas,0,0);
  drawOverlay(g,o.width,o.height,CAMS[camIx],{keep:true,text:camText,t:camRecOn?(performance.now()-camRec0)/1000:0,recOn:camRecOn});return o;}
async function camShoot(){
  ST.clean=true;await frames2();const o=composite();ST.clean=false;
  const blob=await new Promise(r=>o.toBlob(r,'image/jpeg',.93));
  if(blob){const u=$('#camui');u.classList.add('flash');setTimeout(()=>u.classList.remove('flash'),120);buzz(25);await rollAdd(blob,stamp()+'.jpg',false);}
}
/* ---- camera recording on the shared recorder (src/recorder.js) ---- */
let camMode='photo';
const camRecUI=()=>{const u=$('#camui'),sh=$('#shutter');if(!u||!sh)return;const st=camRecorder.state;u.dataset.rec=st;
  sh.classList.toggle('rec',st==='recording'||st==='stopping');sh.disabled=st==='stopping'||st==='saving';
  const bar=$('#camrec');if(bar){bar.hidden=!(st==='recording'||st==='stopping'||st==='saving');bar.querySelector('.rt').textContent=st==='saving'?'Saving…':fmtTime(camRecorder.sec||0);}};
const camRecorder=createRecorder({
  cap:180,warn:165,
  onState:()=>{camRecOn=camRecorder.state==='recording';camRecUI();},
  onTick:sec=>{camRecUI();const sh=$('#shutter');if(sh)sh.style.setProperty('--p',Math.min(100,sec/180*100)+'%');},
  onWarn:m=>toast(m,4000),
  onError:e=>toast(String(e&&e.message||e),5000)
});
function camRecStart(){
  const cc=document.createElement('canvas');cc.width=canvas.width;cc.height=canvas.height;const g=cc.getContext('2d');
  camRec0=performance.now();ST.clean=true;
  const hook=()=>{if(cc.width!==canvas.width||cc.height!==canvas.height)return;g.drawImage(canvas,0,0);drawOverlay(g,cc.width,cc.height,CAMS[camIx],{keep:true,text:camText,t:(performance.now()-camRec0)/1000,recOn:true});};
  const track=camTrack();
  return camRecorder.start({canvas:cc,fps:30,mic:camMic,audioStream:AUD.on&&AUD.dest?AUD.dest.stream:null,watchTrack:track,
    begin:()=>{hook();FRAME_HOOKS.push(hook);if(TLN.tracks.length){TLN.seek(TLN.loopOn?TLN.loop[0]:0);TLN.play(true);}},
    end:()=>{const i=FRAME_HOOKS.indexOf(hook);if(i>=0)FRAME_HOOKS.splice(i,1);ST.clean=false;},
    onDone:async r=>{const name=stamp()+'.'+r.ext,id=await rollAdd(r.blob,name,true,r.poster,r.duration);camRecToast(r,name,id);}});
}
let camMic=false;
function camRecToast(r,name,id){
  const t=el('button','rectoast');t.setAttribute('aria-label','Open the recording');
  if(r.poster){const im=new Image();im.alt='';im.src=URL.createObjectURL(r.poster);im.onload=()=>URL.revokeObjectURL(im.src);t.appendChild(im);}
  t.appendChild(el('span','',`Saved · ${fmtTime(r.duration)} · ${(r.blob.size/1048576).toFixed(1)} MB`));
  t.addEventListener('click',()=>{t.remove();openSheet(r.blob,name,true,{id:typeof id==='number'?id:null,dur:r.duration});});
  document.body.appendChild(t);setTimeout(()=>t.remove(),9000);
}
/* ---- camera Pro: lens, flash, zoom, exposure, white balance, focus, quality. Hardware controls where the browser exposes them
   (Chrome/Android: most; iOS Safari: lens choice, resolution, frame rate, sometimes zoom), software ones everywhere else. ---- */
const PRO={zoom:1,ev:0,wb:0,focus:-1,flash:'off',level:false,hist:false};
let proCaps={},proSet={},proTilt=0;
function readCaps(){const t=camTrack();proCaps={};proSet={};try{if(t&&t.getCapabilities)proCaps=t.getCapabilities();if(t&&t.getSettings)proSet=t.getSettings();}catch(e){}}
async function hwSet(c){const t=camTrack();if(!t)return false;try{await t.applyConstraints({advanced:[c]});return true;}catch(e){return false;}}
const camSim=()=>STACK.layers.find(x=>x.module==='camsim');
const rng=(c,k)=>c&&c[k]&&typeof c[k].min==='number'?c[k]:null;
async function applyPro(){
  const sl=camSim();if(!sl)return;const base=(SIMS[CAMS[camIx].sim]||{}).ev||0,tw=(SIMS[CAMS[camIx].sim]||{}).temp||0;
  let hz=false;const zr=rng(proCaps,'zoom');
  if(zr)hz=await hwSet({zoom:Math.max(zr.min,Math.min(zr.max,PRO.zoom))});
  sl.params.zoom=hz?1:PRO.zoom;
  const er=rng(proCaps,'exposureCompensation');let he=false;if(er)he=await hwSet({exposureCompensation:Math.max(er.min,Math.min(er.max,PRO.ev))});
  sl.params.ev=base+(he?0:PRO.ev*50);
  if(PRO.wb){const kr=rng(proCaps,'colorTemperature');let hw=false;if(kr)hw=await hwSet({whiteBalanceMode:'manual',colorTemperature:Math.max(kr.min,Math.min(kr.max,PRO.wb))});
    sl.params.temp=tw+(hw?0:Math.max(-100,Math.min(100,(PRO.wb-5600)/30)));}
  else{sl.params.temp=tw;if(proCaps.whiteBalanceMode)hwSet({whiteBalanceMode:'continuous'});}
  if(PRO.focus>=0&&rng(proCaps,'focusDistance'))hwSet({focusMode:'manual',focusDistance:PRO.focus});
  else if(proCaps.focusMode&&proCaps.focusMode.includes('continuous'))hwSet({focusMode:'continuous'});
}
const flashBtnLabel=()=>PRO.flash==='off'?'Flash':PRO.flash==='on'?'Flash on':'Torch';
async function setFlash(mode){
  PRO.flash=mode;const b=$('#camflashb');if(b){b.textContent=flashBtnLabel();b.setAttribute('aria-pressed',mode!=='off');}
  if(proCaps.torch)await hwSet({torch:mode==='torch'});
  if(mode==='torch'&&!proCaps.torch)toast('This browser can’t switch the torch. Flash will use a bright screen on the front camera.');
}
async function withFlash(fn){
  if(PRO.flash==='off')return fn();
  const sl=camSim(),keep=sl?{f:sl.params.flash,e:sl.params.ev,s:sl.params.shoulder}:null;let torch=false,screen=false;
  if(PRO.flash==='on'){if(proCaps.torch)torch=await hwSet({torch:true});else if(camFacing==='user'){const f=$('#camflash');if(f){f.classList.add('on');screen=true;}}}
  if(sl){sl.params.flash=Math.max(keep.f,66);sl.params.ev=keep.e+16;sl.params.shoulder=Math.max(keep.s,22);}
  await new Promise(r=>setTimeout(r,torch?200:screen?160:70));
  try{return await fn();}finally{
    if(sl){sl.params.flash=keep.f;sl.params.ev=keep.e;sl.params.shoulder=keep.s;}
    if(torch&&PRO.flash!=='torch')hwSet({torch:false});const f=$('#camflash');if(f)f.classList.remove('on');
    const u=$('#camui');if(u){u.classList.add('flash');setTimeout(()=>u.classList.remove('flash'),140);}}
}
async function listLenses(){
  try{const ds=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    return ds.map(d=>{const l=d.label||'';const n=/ultra/i.test(l)?'0.5× Ultra wide':/tele/i.test(l)?'Telephoto':/front|user|facetime/i.test(l)?'Front':/back|rear|environment|wide/i.test(l)?'Wide':l.replace(/camera/i,'').trim()||'Camera';
      return{id:d.deviceId,name:n,front:/front|user|facetime/i.test(l)};});}catch(e){return[];}
}
async function renderPro(){
  const box=$('#campro');if(!box)return;readCaps();box.innerHTML='';
  const row=(label,...kids)=>{const r=el('div','prr');r.appendChild(el('span','prl',label));const w=el('div','prc');w.append(...kids);r.appendChild(w);box.appendChild(r);return r;};
  const chip=(t,on,fn)=>{const b=el('button','prchip',t);b.setAttribute('aria-pressed',!!on);b.addEventListener('click',()=>{buzz(5);fn();});return b;};
  const slider=(min,max,step,val,fn,fmt)=>{const w=el('div','prsl'),i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=val;const v=el('span','prv',fmt(val));i.addEventListener('input',()=>{v.textContent=fmt(+i.value);fn(+i.value);});w.append(i,v);return w;};
  const lens=(await listLenses()).filter(l=>l.name);
  if(lens.length>1){const cur=proSet.deviceId;row('Lens',...lens.map(l=>chip(l.name,l.id===cur,async()=>{await startCam(false,{deviceId:l.id});setPM(camFacing==='user');await renderPro();applyCam(camIx,true);applyPro();})));}
  const zr=rng(proCaps,'zoom');
  row('Zoom '+(zr?'(lens)':'(digital)'),slider(zr?zr.min:1,zr?Math.min(zr.max,15):8,.1,PRO.zoom,v=>{PRO.zoom=v;applyPro();},v=>(+v).toFixed(1)+'×'));
  row('Exposure',slider(-2,2,.1,PRO.ev,v=>{PRO.ev=v;applyPro();},v=>(v>0?'+':'')+(+v).toFixed(1)+' EV'));
  const kr=rng(proCaps,'colorTemperature');
  row('White balance'+(kr?'':' (soft)'),chip('Auto',!PRO.wb,()=>{PRO.wb=0;applyPro();renderPro();}),slider(kr?kr.min:2500,kr?kr.max:9000,100,PRO.wb||5600,v=>{PRO.wb=v;applyPro();},v=>Math.round(v)+'K'));
  const fr=rng(proCaps,'focusDistance');if(fr)row('Focus',chip('Auto',PRO.focus<0,()=>{PRO.focus=-1;applyPro();renderPro();}),slider(fr.min,fr.max,(fr.max-fr.min)/50||.01,PRO.focus<0?fr.min:PRO.focus,v=>{PRO.focus=v;applyPro();},v=>(+v).toFixed(2)));
  row('Flash',chip('Off',PRO.flash==='off',()=>{setFlash('off');renderPro();}),chip('On',PRO.flash==='on',()=>{setFlash('on');renderPro();}),chip('Torch'+(proCaps.torch?'':' ✕'),PRO.flash==='torch',()=>{setFlash('torch');renderPro();}));
  const cur=(proSet.height||0);
  row('Quality',...[[1280,720,'720p'],[1920,1080,'1080p'],[3840,2160,'4K']].map(([w,h,n])=>chip(n,CAMOPT.h===h,async()=>{await startCam(false,{w,h});setPM(camFacing==='user');await renderPro();applyCam(camIx,true);applyPro();})),
    ...[30,60].map(f=>chip(f+' fps',CAMOPT.fps===f,async()=>{await startCam(false,{fps:f});setPM(camFacing==='user');await renderPro();applyCam(camIx,true);applyPro();})));
  row('Aids',chip('Level',PRO.level,async()=>{PRO.level=!PRO.level;if(PRO.level)await startLevel();$('#camlevel').hidden=!PRO.level;renderPro();}),chip('Histogram',PRO.hist,()=>{PRO.hist=!PRO.hist;$('#camhist').hidden=!PRO.hist;renderPro();}));
  const got=[];['zoom','torch','exposureCompensation','colorTemperature','focusDistance','iso','exposureTime'].forEach(k=>{if(proCaps[k])got.push(k==='exposureCompensation'?'exposure':k==='colorTemperature'?'white balance':k==='focusDistance'?'focus':k==='exposureTime'?'shutter':k);});
  box.appendChild(el('div','prnote',(proSet.width?`Stream ${proSet.width}×${proSet.height}${proSet.frameRate?' at '+Math.round(proSet.frameRate)+' fps':''}. `:'')+(got.length?'Hardware controls here: '+got.join(', ')+'. ':'No hardware controls from this browser; zoom, exposure and white balance are applied in software. ')+'LiDAR depth isn’t available to web pages on iPhone.'));
}
let levelOn=false;
async function startLevel(){
  try{if(window.DeviceOrientationEvent&&DeviceOrientationEvent.requestPermission){const r=await DeviceOrientationEvent.requestPermission();if(r!=='granted'){toast('Motion access was declined');PRO.level=false;return;}}}catch(e){}
  if(levelOn)return;levelOn=true;
  addEventListener('deviceorientation',e=>{if(!PRO.level)return;const g=e.gamma||0,b=e.beta||0;const portrait=innerHeight>innerWidth;const a=portrait?g:(b*(window.orientation===90?-1:1));proTilt=a;const L=$('#camlevel');if(L){L.style.transform='translate(-50%,-50%) rotate('+(-a).toFixed(1)+'deg)';L.classList.toggle('ok',Math.abs(a)<1.2);}});
}
function histTick(){
  const h=$('#camhist');if(!h||h.hidden||!CAMMODE)return;const g=h.getContext('2d'),t=histTick.c||(histTick.c=document.createElement('canvas'));t.width=64;t.height=48;const tg=t.getContext('2d',{willReadFrequently:true});
  try{tg.drawImage(canvas,0,0,64,48);const d=tg.getImageData(0,0,64,48).data,b=new Float32Array(64);for(let i=0;i<d.length;i+=4)b[Math.min(63,(d[i]*.3+d[i+1]*.59+d[i+2]*.11)/4|0)]++;
    const mx=Math.max(...b);g.clearRect(0,0,h.width,h.height);g.fillStyle='rgba(10,10,10,.7)';g.fillRect(0,0,h.width,h.height);g.fillStyle='#f2efe8';for(let i=0;i<64;i++){const v=b[i]/mx*(h.height-4);g.fillRect(i*2,h.height-v,2,v);}}catch(e){}
}
function buildCamUI(){
  if($('#camui'))return;const stage=$('#stage'),u=el('div','camui');u.id='camui';
  const btn=(id,txt,label,fn)=>{const b=el('button','cb',txt);b.id=id;b.setAttribute('aria-label',label);b.addEventListener('click',fn);return b;};
  const top=el('div','camtop');
  top.append(btn('camx','✕','Close camera',()=>closeCamera()),btn('camflip','Flip','Flip camera',async()=>{await startCam(true);setPM(camFacing==='user');readCaps();applyCam(camIx,true);applyPro();}),
    btn('camflashb','Flash','Flash',()=>{setFlash(PRO.flash==='off'?'on':PRO.flash==='on'?(proCaps.torch?'torch':'off'):'off');}),
    btn('camasp','3:4','Frame shape',e=>{const o=['3:4','1:1','4:3','9:16','16:9','src'],i=(o.indexOf(P.aspect)+1)%o.length;P.aspect=o[i];V.sizeKey='';paintCamUI();}),
    btn('campb','Pro','Pro controls',e=>{const on=u.classList.toggle('pro');u.classList.remove('more');e.currentTarget.setAttribute('aria-pressed',on);if(on)renderPro();}),
    btn('cammore','More','More controls',e=>{const on=u.classList.toggle('more');u.classList.remove('pro');$('#campb').setAttribute('aria-pressed',false);e.currentTarget.setAttribute('aria-pressed',on);}));
  const more=el('div','cammoregrid');
  more.append(btn('cammir','Mirror','Mirror the preview only. Saved files are never mirrored.',e=>{setPM(!camPM);e.currentTarget.setAttribute('aria-pressed',camPM);}),
    btn('camgrid','Grid','Grid lines',e=>{camGrid=!camGrid;u.classList.toggle('grid',camGrid);e.currentTarget.setAttribute('aria-pressed',camGrid);}),
    btn('cammic','Mic','Let sound move the look',e=>{toggleMic();setTimeout(()=>e.currentTarget.setAttribute('aria-pressed',audio.on),600);}),
    btn('camauto','Auto','Change camera every few seconds',e=>{camAuto=!camAuto;e.currentTarget.setAttribute('aria-pressed',camAuto);clearInterval(camAutoT);if(camAuto)camAutoT=setInterval(()=>camStep(1),4000);}),
    btn('camtxt','Text','Show date and readout text',e=>{camText=!camText;lsSet('n0ise.camtext',camText);e.currentTarget.setAttribute('aria-pressed',camText);drawCamOv();}),
    btn('camtim','Timer off','Self timer',e=>{camTimer=camTimer===0?3:camTimer===3?10:0;e.currentTarget.textContent=camTimer?'Timer '+camTimer+'s':'Timer off';}),
    btn('cammicrec','Sound','Record with microphone sound',e=>{camMic=!camMic;e.currentTarget.setAttribute('aria-pressed',camMic);if(camMic)toast('Videos will include microphone sound');}),
    btn('camtl','Timeline','Open the timeline',e=>{TLN.show();u.classList.remove('more');}),
    btn('camsur','Surprise','Random camera',()=>camSurprise()),
    btn('cammix','Mix','Randomise within this look',()=>camMix()),
    btn('camfps','FPS','Show frame rate',e=>{camFps=!camFps;e.currentTarget.setAttribute('aria-pressed',camFps);}),
    btn('camlab','Edit','Open this look in the editor',()=>{const keep=STACK.layers;closeCamera(true);STACK.layers=keep;STACK.sel=keep.length-1;refreshUI();renderInspector();}));
  const ov=document.createElement('canvas');ov.id='camov';
  const bot=el('div','cambot'),info=el('div','caminfo');
  const fav=el('button','camfav','☆');fav.id='camfav';fav.setAttribute('aria-label','Favourite this camera');fav.addEventListener('click',camFavToggle);
  info.append(Object.assign(el('b','','Camera'),{id:'camname'}),fav,Object.assign(el('span','','' ),{id:'camsub'}));
  const str=document.createElement('input');str.type='range';str.min=0;str.max=100;str.value=camStr;str.id='camstr';str.setAttribute('aria-label','Look strength');str.addEventListener('input',()=>setCamStr(+str.value));
  const duo=el('div','camduo');duo.id='camduo';duo.hidden=true;
  {const col=(l,k)=>{const w=el('label','',l),i=document.createElement('input');i.type='color';i.value=DUO[k];i.addEventListener('input',()=>{DUO[k]=i.value;duoApply();});w.appendChild(i);return w;};
   const fxs=[['','None'],['halftone','Halftone'],['glitch','Glitch'],['pixel','Pixel'],['thermal','Thermal'],['matrix','Matrix'],['ascii','Text']];
   const sel=(l,k)=>{const w=el('label','',l),s2=document.createElement('select');fxs.forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;s2.appendChild(o);});s2.value=DUO[k];s2.addEventListener('change',()=>{DUO[k]=s2.value;duoApply();});w.appendChild(s2);return w;};
   const fe=el('label','','Edge'),ri=document.createElement('input');ri.type='range';ri.min=0;ri.max=60;ri.value=DUO.soft;ri.addEventListener('input',()=>{DUO.soft=+ri.value;const so=STACK.layers.find(l=>l.module==='solid');if(so)so.params.soft=DUO.soft;});fe.appendChild(ri);
   duo.append(col('Subject','sub'),col('Background','bg'),fe,sel('Subject look','fg'),sel('Background look','bgfx'));}
  const strip=el('div','camstrip');strip.id='camstrip';strip.setAttribute('role','listbox');strip.setAttribute('aria-label','Cameras');
  CAMS.forEach((c,i)=>{const b=el('button','camt');b.setAttribute('role','option');b.innerHTML=glyph(c.glyph)+`<span>${c.name}</span>`;b.addEventListener('click',()=>{if(camIx!==i)applyCam(i);});strip.appendChild(b);});
  const cats=el('div','camcats');cats.id='camcats';cats.setAttribute('role','tablist');
  ['All','★','Film','Video','Digital','Glitch','Subject'].forEach(n=>{const b=el('button','',n);b.dataset.c=n;b.setAttribute('aria-pressed',n===camCat);b.addEventListener('click',()=>setCamCat(n));cats.appendChild(b);});
  let sT=0;strip.addEventListener('scroll',()=>{strip._dragging=true;clearTimeout(sT);sT=setTimeout(()=>{strip._dragging=false;const mid=strip.scrollLeft+strip.clientWidth/2;let best=0,bd=1e9;[...strip.children].forEach((t,i)=>{if(t.hidden)return;const d=Math.abs(t.offsetLeft+t.offsetWidth/2-mid);if(d<bd){bd=d;best=i;}});if(best!==camIx)applyCam(best);},110);},{passive:true});
  const row=el('div','camrow');
  const roll=el('button','camroll','Roll');roll.id='camroll';roll.setAttribute('aria-label','Open roll');roll.addEventListener('click',openRoll);
  const sh=el('button','shutter');sh.id='shutter';sh.setAttribute('aria-label','Shutter. Tap for a photo, hold to record');
  const sw=el('button','cb camswap','Next');sw.setAttribute('aria-label','Next camera');sw.addEventListener('click',()=>camStep(1));
  row.append(roll,sh,sw);
  const modes=el('div','cammode');[['photo','Photo'],['video','Video']].forEach(([m,l])=>{const b=el('button','',l);b.dataset.m=m;b.setAttribute('aria-pressed',camMode===m);b.addEventListener('click',()=>{if(camRecorder.busy)return;camMode=m;lsSet('n0ise.cammode',m);modes.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.m===m));sh.setAttribute('aria-label',m==='video'?'Shutter. Tap to start or stop recording':'Shutter. Tap for a photo, hold to record');});modes.appendChild(b);});
  bot.append(info,str,duo,cats,strip,modes,row);
  const rb=el('div','camrecbar');rb.id='camrec';rb.hidden=true;rb.innerHTML='<i></i><span class="rt">0:00</span>';
  const cd=el('div','camcount');cd.id='camcount';cd.hidden=true;const fp=el('div','camfpsv');fp.id='camfpsv';fp.hidden=true;
  const pro=el('div','campro');pro.id='campro';const lv=el('div','camlevel');lv.id='camlevel';lv.hidden=true;const hs=document.createElement('canvas');hs.id='camhist';hs.width=128;hs.height=48;hs.hidden=true;const sf=el('div','camflash');sf.id='camflash';
  u.append(ov,lv,hs,sf,top,more,pro,bot,rb,cd,fp,el('i','g1'),el('i','g2'),el('i','g3'),el('i','g4'));stage.appendChild(u);
  let hold=0,holdRec=false,downBusy=false;
  const takePhoto=async()=>{if(camBusy)return;camBusy=true;
    for(let n=camTimer;n>0;n--){cd.hidden=false;cd.textContent=n;buzz(8);await new Promise(r=>setTimeout(r,1000));}cd.hidden=true;
    try{await withFlash(camShoot);}finally{camBusy=false;}};
  sh.addEventListener('pointerdown',e=>{e.preventDefault();try{sh.setPointerCapture(e.pointerId);}catch(_){}
    downBusy=camRecorder.state==='stopping'||camRecorder.state==='saving'||camBusy;holdRec=false;if(downBusy)return;
    if(camRecorder.state==='recording')return; /* the release below stops it */
    if(camMode==='photo')hold=setTimeout(()=>{holdRec=true;buzz(20);camRecStart();},380);});
  sh.addEventListener('pointerup',async()=>{
    clearTimeout(hold);if(downBusy)return;
    if(camRecorder.state==='recording'||camRecorder.state==='arming'){if(camRecorder.state==='arming'&&!holdRec&&camMode==='video'){return;}camRecorder.stop('user');buzz(12);return;}
    if(holdRec){holdRec=false;return;}
    if(camMode==='video'){buzz(20);camRecStart();return;}
    await takePhoto();});
  sh.addEventListener('pointercancel',()=>{clearTimeout(hold);if(holdRec||camRecorder.state==='arming')camRecorder.stop('cancel');});
  sh.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{if(CAMMODE&&e.code==='Space'&&!/INPUT|TEXTAREA|SELECT/.test((e.target||{}).tagName||'')){e.preventDefault();if(camRecorder.busy&&camRecorder.state==='recording')camRecorder.stop('user');else if(!camRecorder.busy)camMode==='video'?camRecStart():takePhoto();}});
  setInterval(()=>{if(!CAMMODE)return;if(camFps){fp.hidden=false;fp.textContent=Math.round(V.fps)+' fps';}else fp.hidden=true;drawCamOv();histTick();},camRecOn?100:250);
  addEventListener('resize',()=>{if(CAMMODE)setTimeout(paintCamUI,60);});
  camThumbUpdate();
}
function showCamGate(msg,first){
  let g=$('#camgate');if(g)g.remove();g=el('div','camgate');g.id='camgate';
  g.innerHTML=`<a class="cghome" href="index.html" aria-label="n0ise home">n<b>0</b>ise</a><div class="cgbox"><b>Camera</b><p></p><div class="cgbtns"></div></div>`;g.querySelector('p').textContent=msg;
  const row=g.querySelector('.cgbtns'),mk=(t,cls,fn)=>{const b=el('button',cls,t);b.addEventListener('click',fn);row.appendChild(b);};
  mk(first?'Open camera':'Try again','pri',async()=>{g.remove();await openCamera();});
  mk('Browse with a demo picture','',async()=>{g.remove();await openCamera({demo:true});});
  mk('Skip to effects','',()=>g.remove());
  document.body.appendChild(g);
}
function camLife(){
  if(camLifeOn)return;camLifeOn=true;
  camEnsure=async()=>{
    if(!CAMMODE||camDemo||camRecorder.busy)return;
    const t=camTrack();
    if(t&&t.readyState==='live'){if(SRC.el&&SRC.el.paused)SRC.el.play().catch(()=>{});camRetry=0;return;}
    if(camRetry>=3){showCamGate('The camera stopped and couldn’t restart. '+(camErr||''));return;}
    camRetry++;const ok=await startCam(false);
    if(!CAMMODE){stopCamTracks();return;}
    if(ok){camRetry=0;setPM(camFacing==='user');readCaps();applyCam(camIx,true);applyPro();}
  };
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)camEnsure();});
  try{navigator.mediaDevices.addEventListener('devicechange',()=>setTimeout(camEnsure,400));}catch(e){}
  addEventListener('orientationchange',()=>setTimeout(()=>{V.sizeKey='';camEnsure();},400));
}
async function openCamera(o){
  if(o&&o.demo){camDemo=true;setSource(demoCanvas(),'Camera',false);refreshUI();}
  else{const ok=await startCam(false);if(!ok){showCamGate(camErr||'The camera couldn’t start.');return;}}
  if(!(o&&o.demo)&&(!(SRC.el instanceof HTMLVideoElement)||SRC.name!=='Camera'))return;
  camLife();camMode=lsGet('n0ise.cammode','photo')==='video'?'video':'photo';camFavs=lsGet('n0ise.camfavs',[]);camCat=lsGet('n0ise.camcat','All');camIx=Math.max(0,CAMS.findIndex(c=>c.id===lsGet('n0ise.cam','cctv')));camText=!!lsGet('n0ise.camtext',false);{const tb=$('#camtxt');if(tb)tb.setAttribute('aria-pressed',camText);}
  camSaved={layers:STACK.layers,sel:STACK.sel,aspect:P.aspect};
  setPM(camFacing==='user');buildCamUI();CAMMODE=true;document.body.dataset.cam='1';
  readCaps();applyCam(camIx,true);
  const m=$('#cammir');if(m)m.setAttribute('aria-pressed',camPM);
  if(navigator.wakeLock)navigator.wakeLock.request('screen').then(w=>{CAMWAKE=w;}).catch(()=>{});
  camThumbUpdate();setTimeout(paintCamUI,120);
}
let CAMWAKE=null;
function closeCamera(keepSource){camGen++;if(camRecorder.busy)camRecorder.stop('closed');CAMMODE=false;camAuto=false;clearInterval(camAutoT);delete document.body.dataset.cam;{const u=$('#camui');if(u)u.classList.remove('more');}if(camSaved&&!keepSource){STACK.layers=camSaved.layers;STACK.sel=camSaved.sel;}if(camSaved){P.aspect=camSaved.aspect;V.sizeKey='';}if(window.SHEET&&SHEET.apply&&document.body.dataset.sheet!==undefined)try{SHEET.apply(1,true);}catch(e){}if(keepSource){if(CAMWAKE){CAMWAKE.release().catch(()=>{});CAMWAKE=null;}return;}if(CAMWAKE){CAMWAKE.release().catch(()=>{});CAMWAKE=null;}if(rec)toggleRec();stopCamTracks();setPM(false);setSource(demoCanvas(),'Demo');refreshUI();renderInspector();}
function stopCamTracks(){try{const st=SRC.el&&SRC.el.srcObject;if(st&&st.getTracks)st.getTracks().forEach(t=>t.stop());}catch(e){}}
let rec=null,chunks=[];
let WAKE=null;
const fxRecorder=createRecorder({cap:180,warn:165,
  onState:()=>{const b=$('#rec'),st=fxRecorder.state;rec=st==='idle'?null:fxRecorder;if(!b)return;b.setAttribute('aria-pressed',st==='recording');
    b.textContent=st==='recording'?'● '+fmtTime(fxRecorder.sec):(st==='stopping'||st==='saving')?'Saving…':'Rec';b.disabled=st==='stopping'||st==='saving'||st==='arming';},
  onTick:()=>{const b=$('#rec');if(b&&fxRecorder.state==='recording')b.textContent='● '+fmtTime(fxRecorder.sec);},
  onWarn:m=>toast(m,4000),onError:e=>toast(String(e&&e.message||e),5000)});
function toggleRec(sec){
  if(!GLOK)return;
  if(fxRecorder.state==='recording'){fxRecorder.stop('user');return;}
  if(fxRecorder.busy)return;
  fxRecorder.start({canvas,fps:30,audioStream:AUD.on&&AUD.dest?AUD.dest.stream:null,
    begin:()=>{ST.clean=true;if(TLN.tracks.length){TLN.seek(TLN.loopOn?TLN.loop[0]:0);TLN.play(true);}if(navigator.wakeLock)navigator.wakeLock.request('screen').then(w=>{WAKE=w;}).catch(()=>{});},
    end:()=>{ST.clean=false;if(WAKE){WAKE.release().catch(()=>{});WAKE=null;}},
    onDone:async r=>{deliver(r.blob,`${stamp()}.${r.ext}`,true);}});
  if(typeof sec==='number')setTimeout(()=>fxRecorder.stop('limit'),sec*1000);
}
let busy=false;
function openExport(){
  if(!GLOK||$('.sheet'))return;
  const sh=el('div','sheet'),o={len:4,w:480,mul:1,fmt:0,boom:0};
  sh.innerHTML=`<div class="xp"><h3>Export</h3>
  <div class="cl">Length</div><div class="chips" data-k="len"><button class="chip" data-v="2">2s</button><button class="chip" data-v="4">4s</button><button class="chip" data-v="8">8s</button></div>
  <div class="cl">GIF size</div><div class="chips" data-k="w"><button class="chip" data-v="320">Small</button><button class="chip" data-v="480">Medium</button><button class="chip" data-v="640">Large</button></div>
  <div class="cl">GIF loop</div><div class="chips" data-k="boom"><button class="chip" data-v="0">Forward</button><button class="chip" data-v="1">Boomerang</button></div>
  <div class="cl">Image size</div><div class="chips" data-k="mul"><button class="chip" data-v="1">1x</button><button class="chip" data-v="2">2x</button><button class="chip" data-v="4">4x</button></div>
  <div class="cl">Image format</div><div class="chips" data-k="fmt"><button class="chip" data-v="0">PNG</button><button class="chip" data-v="1">JPG</button><button class="chip" data-v="2">WebP</button></div>
  <button class="btn primary big" id="xg">Loop GIF</button><button class="btn big" id="xv">Video</button><button class="btn big" id="xp">Image</button>
  <button class="btn" id="xb">Batch images…</button><button class="btn" id="xj">Projects…</button><input type="file" id="xbf" accept="image/*" multiple hidden>
  <p id="xd"></p><p id="xm"></p><button class="btn" id="xc">Close</button></div>`;
  document.body.appendChild(sh);
  const sync=()=>sh.querySelectorAll('.chips').forEach(r=>r.querySelectorAll('.chip').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.v===o[r.dataset.k])));const upd=()=>{const[dw,dh]=expDims(SZ.cw||canvas.clientWidth,SZ.ch||canvas.clientHeight,o.mul);$('#xd',sh).textContent=`Image: ${dw}×${dh}`+(Math.max(dw,dh)>=exportCap()?' (largest this device allows)':'');};upd();
  sh.querySelectorAll('.chips').forEach(r=>r.addEventListener('click',e=>{const b=e.target.closest('.chip');if(b&&!busy){o[r.dataset.k]=+b.dataset.v;sync();upd();}}));sync();
  const msg=t=>{$('#xm',sh).textContent=t;};
  const run=async f=>{if(busy)return;busy=true;sh.classList.add('busy');try{await f();}catch(e){console.error(e);toast('Export failed, try a smaller size');}busy=false;sh.classList.remove('busy');msg('');};
  const close=()=>{if(!busy)sh.remove();};
  $('#xc',sh).addEventListener('click',close);sh.addEventListener('pointerdown',e=>{if(e.target===sh)close();});
  $('#xp',sh).addEventListener('click',()=>run(async()=>{await exportImage(o,msg);sh.remove();}));
  $('#xb',sh).addEventListener('click',()=>$('#xbf',sh).click());
  $('#xbf',sh).addEventListener('change',e=>run(async()=>{await exportBatch([...e.target.files],o,msg);sh.remove();}));
  $('#xj',sh).addEventListener('click',()=>{sh.remove();openProjects();});
  $('#xg',sh).addEventListener('click',()=>run(async()=>{const b=await exportGIF(o.len,o.w,msg,o.boom);sh.remove();deliver(b,stamp()+'.gif',false);}));
  $('#xv',sh).addEventListener('click',()=>run(async()=>{
    toggleRec(o.len);const t0=performance.now();
    await new Promise(r=>{const i=setInterval(()=>{msg(`Recording ${Math.min(o.len,(performance.now()-t0)/1000).toFixed(0)}/${o.len}s`);if(!rec){clearInterval(i);r();}},250);});
    sh.remove();}));
}
/* ---------- projects: autosave + named versions in IndexedDB ---------- */
const projDB=()=>new Promise((res,rej)=>{if(!window.indexedDB)return rej(new Error('no idb'));const q=indexedDB.open('n0ise-proj',1);q.onupgradeneeded=()=>q.result.createObjectStore('p',{keyPath:'id',autoIncrement:true});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
const projTx=async(mode,f)=>{const db=await projDB();return new Promise((res,rej)=>{const tx=db.transaction('p',mode),r=f(tx.objectStore('p'));tx.oncomplete=()=>res(r&&r.result);tx.onerror=()=>rej(tx.error);});};
const projPut=rec=>projTx('readwrite',s=>s.put(rec));
const projList=async()=>{try{return((await projTx('readonly',s=>s.getAll()))||[]).sort((a,b)=>(b.auto?1:0)-(a.auto?1:0)||b.ts-a.ts);}catch(e){return[];}};
const projState=()=>JSON.stringify({p:P,l:stackState()});
function projThumb(){try{const c=document.createElement('canvas');c.width=96;c.height=72;c.getContext('2d').drawImage(canvas,0,0,96,72);return c.toDataURL('image/jpeg',.6);}catch(e){return'';}}
let autoT=0;function autosave(){clearTimeout(autoT);autoT=setTimeout(()=>projPut({id:'auto',name:'Autosave',auto:true,ts:Date.now(),state:projState(),thumb:projThumb()}).catch(()=>{}),2500);}
async function openProjects(){
  if($('.sheet'))return;const sh=el('div','sheet'),box=el('div','rollbox','<h3>Projects</h3>');sh.appendChild(box);document.body.appendChild(sh);
  const close=()=>sh.remove();sh.addEventListener('pointerdown',e=>{if(e.target===sh)close();});
  const row=el('div','pe'),name=document.createElement('input');name.className='gq';name.placeholder='Name this version';name.setAttribute('aria-label','Version name');
  const sv=el('button','btn primary','Save version');row.append(name,sv);box.appendChild(row);
  const list=el('div','prlist');box.appendChild(list);const cl=el('button','btn','Close');cl.addEventListener('click',close);box.appendChild(cl);
  const draw=async()=>{list.innerHTML='';const items=await projList();if(!items.length)list.appendChild(el('p','','Nothing saved yet. Your work autosaves as you edit.'));
    items.forEach(it=>{const r=el('div','prrow'),im=new Image();im.alt='';im.src=it.thumb||'';const nm=el('span','',`${it.name} · ${new Date(it.ts).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}`);
      const ld=el('button','btn','Load'),dl=el('button','btn','×');dl.setAttribute('aria-label','Delete '+it.name);
      ld.addEventListener('click',()=>{if(lastSnap)HIST.push(lastSnap);applySnap(it.state);close();toast('Loaded '+it.name);});
      dl.addEventListener('click',async()=>{await projTx('readwrite',s=>s.delete(it.id));draw();});
      r.append(im,nm,ld);if(!it.auto)r.appendChild(dl);list.appendChild(r);});};
  sv.addEventListener('click',async()=>{try{await projPut({name:name.value.trim()||'Version '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),ts:Date.now(),state:projState(),thumb:projThumb()});name.value='';toast('Version saved');draw();}catch(e){toast('This browser won’t store projects');}});
  draw();
}
function resetAll(){
  Object.assign(P,JSON.parse(JSON.stringify(BASE)));applyProfile('studio');
  MODS.forEach(m=>{m.target='';m.shape='sine';m.rate=.4;m.depth=40;});
  snap();refreshUI();toast('Reset');
}

/* ---------- wiring ---------- */
function wire(){
  $('#undo').addEventListener('click',undo);$('#redo').addEventListener('click',redo);
  $('#open').addEventListener('click',()=>$('#file').click());
  $('#file').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value='';});
  $('#cam').addEventListener('click',()=>SRC.name==='Camera'?startCam(true).then(()=>{SRC.mirror=camFacing==='user';}):openCamera());
  $('#rec').addEventListener('click',()=>toggleRec());
  $('#save').addEventListener('click',openExport);$('#reset').addEventListener('click',resetAll);
  $('#textoff').addEventListener('click',()=>{P.ton=false;snap();refreshUI();});
  $('#shuffle').addEventListener('click',shuffle);
  $('#power').addEventListener('click',togglePower);
  $('#paint').addEventListener('click',()=>{ST.paint=!ST.paint;refreshUI();toast(ST.paint?'Paint with the beam: drag on the screen':'Beam paint off');});
  const hold=$('#hold'),setH=on=>{ST.hold=on;hold.setAttribute('aria-pressed',on);};
  hold.addEventListener('pointerdown',e=>{e.preventDefault();setH(true);});
  ['pointerup','pointercancel','pointerleave'].forEach(t=>hold.addEventListener(t,()=>setH(false)));
  hold.addEventListener('contextmenu',e=>e.preventDefault());
  addEventListener('keydown',e=>{
    if(e.target!==document.body)return;
    const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
    if(mod&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
    if(mod&&k==='y'){e.preventDefault();redo();return;}
    if(mod&&k==='d'){e.preventDefault();dupLayer();return;}
    if(mod||e.altKey)return;
    if(e.code==='Space'){e.preventDefault();if(ED.active()||TLN.tracks.length){TLN.play();}else setH(true);return;}
    if(e.key==='?'||(e.key==='/'&&e.shiftKey)){helpSheet();return;}
    if(k==='s'){const l=layer();l.solo=!l.solo;renderInspector();toast(l.solo?'Solo on':'Solo off');}
    else if(k==='v'){const l=layer();l.visible=!l.visible;renderInspector();toast(l.visible?'Layer shown':'Layer hidden');}
    else if(k==='d'){dupLayer();}
    else if(k==='m'){mutateLayer();}
    else if(k==='t'){TLN.show();}
    else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const d=(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/30);if(TLN.open||ED.active()){e.preventDefault();TLN.seek(Math.max(0,(ED.active()?ED.t:TLN.t)+d));}}
    else if(e.key==='['||e.key===']'){const a=STACK.layers,i=STACK.sel,j=i+(e.key==='['?-1:1);if(j>=0&&j<a.length){[a[i],a[j]]=[a[j],a[i]];STACK.sel=j;renderInspector();}}
  });
  addEventListener('keyup',e=>{if(e.code==='Space')setH(false);});
  canvas.addEventListener('pointermove',e=>{
    const r=canvas.getBoundingClientRect();
    const ux=(e.clientX-r.left)/r.width,uy=(e.clientY-r.top)/r.height;
    POINTER.x=ux*2-1;POINTER.y=1-uy*2;
    if(ST.paint&&e.buttons){const k=1+2*E.bez/100;PAINTQ.push([(ux*2-1)*k,(1-uy*2)*k,34]);}
  });
  canvas.addEventListener('pointerdown',e=>{
    if(!ST.paint)return;
    canvas.setPointerCapture(e.pointerId);
    const r=canvas.getBoundingClientRect(),ux=(e.clientX-r.left)/r.width,uy=(e.clientY-r.top)/r.height,k=1+2*E.bez/100;
    PAINTQ.push([(ux*2-1)*k,(1-uy*2)*k,34]);
  });
  stage.addEventListener('dragover',e=>{e.preventDefault();stage.classList.add('drag');});
  stage.addEventListener('dragleave',()=>stage.classList.remove('drag'));
  stage.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('drag');loadFile(e.dataTransfer.files[0]);});
  addEventListener('dragover',e=>e.preventDefault());addEventListener('drop',e=>e.preventDefault());
  addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/')||f.type.startsWith('video/'));if(f)loadFile(f);});
}

/* ---------- boot ---------- */
/* =====================================================================
   ?bench=1  test bench: every profile and chain over a fixed test set,
   a contact sheet, and a diversity gate (?thr=0.05 to tune).
   ===================================================================== */
function benchSources(){
  const W=640,H=480,mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return [c,c.getContext('2d')];};
  const S=[];
  let [c,g]=mk();
  ['#c0c0c0','#c0c000','#00c0c0','#00c000','#c000c0','#c00000','#0000c0'].forEach((col,i)=>{g.fillStyle=col;g.fillRect(i*W/7,0,W/7+1,H*.67);});
  ['#0000c0','#111','#c000c0','#111','#00c0c0','#111','#c0c0c0'].forEach((col,i)=>{g.fillStyle=col;g.fillRect(i*W/7,H*.67,W/7+1,H*.08);});
  ['#00214c','#fff','#32006a','#111','#090909','#111','#1d1d1d','#111'].forEach((col,i)=>{g.fillStyle=col;g.fillRect(i*W/8,H*.75,W/8+1,H*.25);});
  S.push(['bars',c]);
  [c,g]=mk();g.fillStyle='#000';g.fillRect(0,0,W,H);g.fillStyle='#fff';
  for(let b=0;b<8;b++){const pitch=2+b*2;for(let x=0;x<W;x+=pitch*2)g.fillRect(x,b*H/8,pitch,H/8-4);}
  S.push(['wedge',c]);
  [c,g]=mk();for(let i=0;i<16;i++){g.fillStyle=`hsl(0 0% ${i/15*100}%)`;g.fillRect(i*W/16,0,W/16+1,H*.6);}
  g.fillStyle='#000';g.fillRect(0,H*.6,W,H*.4);g.fillStyle='#fff';g.fillRect(W*.1,H*.65,W*.1,H*.3);
  [[.35,.0],[.45,.04],[.55,.08],[.65,.12]].forEach(([x,v])=>{g.fillStyle=`rgb(${v*255},${v*255},${v*255})`;g.fillRect(W*x,H*.65,W*.1,H*.3);});
  S.push(['ramp',c]);
  [c,g]=mk();const gr=g.createLinearGradient(0,0,W,H);gr.addColorStop(0,'#1b0a3a');gr.addColorStop(.5,'#e04b7a');gr.addColorStop(1,'#ffd27a');g.fillStyle=gr;g.fillRect(0,0,W,H);
  S.push(['gradient',c]);
  [c,g]=mk();g.fillStyle='#10131a';g.fillRect(0,0,W,H);g.fillStyle='#e8ecf4';g.font='bold 34px monospace';g.fillText('THE QUICK BROWN FOX',30,70);
  g.font='20px monospace';for(let i=0;i<12;i++)g.fillText('jumps over the lazy dog 0123456789 '+i,30,120+i*28);S.push(['text',c]);
  [c,g]=mk();g.fillStyle='#8a6a52';g.fillRect(0,0,W,H);g.fillStyle='#e0b090';g.beginPath();g.ellipse(W/2,H/2,130,170,0,0,7);g.fill();
  g.fillStyle='#2a1a10';g.beginPath();g.ellipse(W/2,H/2-110,140,90,0,Math.PI,0);g.fill();
  g.fillStyle='#fff';[-55,55].forEach(x=>{g.beginPath();g.ellipse(W/2+x,H/2-30,26,14,0,0,7);g.fill();});g.fillStyle='#222';[-55,55].forEach(x=>{g.beginPath();g.arc(W/2+x,H/2-30,8,0,7);g.fill();});
  g.strokeStyle='#8a3b3b';g.lineWidth=8;g.beginPath();g.arc(W/2,H/2+60,45,.15,Math.PI-.15);g.stroke();
  S.push(['face',c]);
  [c,g]=mk();g.fillStyle='#6b7a45';g.fillRect(0,0,W,H);g.fillStyle='#d9742b';g.beginPath();g.ellipse(W/2,H*.62,170,120,0,0,7);g.fill();
  g.beginPath();g.moveTo(W/2-150,H*.35);g.lineTo(W/2-90,H*.12);g.lineTo(W/2-30,H*.35);g.fill();g.beginPath();g.moveTo(W/2+150,H*.35);g.lineTo(W/2+90,H*.12);g.lineTo(W/2+30,H*.35);g.fill();
  g.beginPath();g.ellipse(W/2,H*.42,130,95,0,0,7);g.fill();g.fillStyle='#f4e6cf';g.beginPath();g.ellipse(W/2,H*.52,70,48,0,0,7);g.fill();
  g.fillStyle='#1a1a1a';[-52,52].forEach(x=>{g.beginPath();g.ellipse(W/2+x,H*.38,12,16,0,0,7);g.fill();});g.beginPath();g.ellipse(W/2,H*.5,16,10,0,0,7);g.fill();
  S.push(['animal',c]);
  const anim=(name,fn)=>{const [c,g]=mk();S.push([name,c,t=>fn(g,t)]);};
  anim('ball',(g,t)=>{g.fillStyle='#14171f';g.fillRect(0,0,W,H);g.fillStyle='#fff';g.beginPath();g.arc(80+(Math.abs(((t*260)%1000)-500)/500)*480,H-60-Math.abs(Math.sin(t*3.2))*300,38,0,7);g.fill();});
  anim('pan',(g,t)=>{g.fillStyle='#0d1b2a';g.fillRect(0,0,W,H);const o=(t*180)%160;for(let x=-160;x<W+160;x+=160){g.fillStyle=(((x+o)/160|0)&1)?'#e0b04a':'#4a90e0';g.fillRect(x+o,120,90,240);}});
  anim('scroll',(g,t)=>{g.fillStyle='#10131a';g.fillRect(0,0,W,H);g.fillStyle='#e8ecf4';g.font='26px monospace';const o=(t*120)%32;for(let i=0;i<18;i++)g.fillText('SCROLLING TEXT LINE '+((i+(t*120/32|0))%100),30,-o+30+i*32);});
  return S;
}
function bFeat(cv){
  const t=document.createElement('canvas');t.width=t.height=64;const g=t.getContext('2d',{willReadFrequently:true});g.drawImage(cv,0,0,64,64);
  const d=g.getImageData(0,0,64,64).data,L=new Float32Array(4096),hist=new Float32Array(64);
  for(let i=0;i<4096;i++){const r=d[i*4],gg=d[i*4+1],b=d[i*4+2];L[i]=(.299*r+.587*gg+.114*b)/255;hist[(r>>6)<<4|(gg>>6)<<2|(b>>6)]++;}
  for(let i=0;i<64;i++)hist[i]/=4096;
  let e=0;for(let y=0;y<63;y++)for(let x=0;x<63;x++){const i=y*64+x;if(Math.abs(L[i+1]-L[i])+Math.abs(L[i+64]-L[i])>.1)e++;}
  /* radial spectrum via naive separable DFT on 32x32 */
  const N=32,re=new Float32Array(N*N),im=new Float32Array(N*N),cs=[],sn=[];
  for(let k=0;k<N;k++){cs.push([]);sn.push([]);for(let n=0;n<N;n++){const a=2*Math.PI*k*n/N;cs[k].push(Math.cos(a));sn[k].push(-Math.sin(a));}}
  const m=new Float32Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++)m[y*N+x]=L[(y*2)*64+x*2];
  const tr=new Float32Array(N*N),ti=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let k=0;k<N;k++){let a=0,b=0;for(let n=0;n<N;n++){a+=m[y*N+n]*cs[k][n];b+=m[y*N+n]*sn[k][n];}tr[y*N+k]=a;ti[y*N+k]=b;}
  for(let x=0;x<N;x++)for(let k=0;k<N;k++){let a=0,b=0;for(let n=0;n<N;n++){const c=cs[k][n],s=sn[k][n],xr=tr[n*N+x],xi=ti[n*N+x];a+=xr*c-xi*s;b+=xr*s+xi*c;}re[k*N+x]=a;im[k*N+x]=b;}
  const rb=new Float32Array(6),rc=new Float32Array(6);
  for(let ky=0;ky<N;ky++)for(let kx=0;kx<N;kx++){const fy=ky>N/2?N-ky:ky,fx=kx>N/2?N-kx:kx,r=Math.hypot(fx,fy);if(r<1)continue;const b=Math.min(5,Math.floor(Math.log2(r)*1.2));rb[b]+=re[ky*N+kx]**2+im[ky*N+kx]**2;rc[b]++;}
  const spec=Array.from(rb,(v,i)=>Math.log10(1+v/Math.max(1,rc[i]))/4);
  return {hist,spec,edge:e/3969};
}
function bDist(a,b){
  let h=0;for(let i=0;i<64;i++)h+=Math.abs(a.hist[i]-b.hist[i]);h/=2;
  let s=0;for(let i=0;i<6;i++)s+=Math.abs(a.spec[i]-b.spec[i]);s/=6;
  return .5*h+.3*s*2+.2*Math.abs(a.edge-b.edge)*3;
}
async function runBench(){
  window.__benching=true;const thr=parseFloat(new URLSearchParams(location.search).get('thr')||'0.05');
  const root=document.createElement('div');
  root.style.cssText='position:fixed;inset:0;z-index:99;background:var(--bg);overflow:auto;padding:12px;font:12px/1.4 var(--mono);color:var(--ink)';
  root.innerHTML='<b>n0ise bench</b> <span id="bp">starting…</span><div id="bres"></div><canvas id="bsheet" style="max-width:100%;display:block;margin-top:8px"></canvas>';
  document.body.appendChild(root);
  const prog=root.querySelector('#bp'),srcs=benchSources(),cols=srcs.length,TW=128,TH=96;
  const items=[...PROFILES.map(p=>({id:'p:'+p[0],name:p[1],apply:()=>applyProfile(p[0])})),...CHAINS.map(c=>({id:'c:'+c[0],name:'⛓ '+c[0],apply:()=>applyStages(c[1])}))];
  const sheet=root.querySelector('#bsheet');sheet.width=cols*TW+160;sheet.height=items.length*TH;
  const sg=sheet.getContext('2d');sg.fillStyle='#000';sg.fillRect(0,0,sheet.width,sheet.height);sg.font='11px monospace';
  const raf=()=>new Promise(r=>requestAnimationFrame(r)),feats=[];
  const t0=performance.now();let BT=100;
  for(let r=0;r<items.length;r++){await new Promise(q=>setTimeout(q,0));
    const it=items[r];it.f=[];prog.textContent=`${r+1}/${items.length} ${it.name}`;
    sg.fillStyle='#fff';sg.fillText(it.name,4,r*TH+14);
    for(let c=0;c<cols;c++){
      it.apply();P.seed=7;setSource(srcs[c][1],'Bench',!!srcs[c][2]);
      for(let f=0;f<6;f++){if(srcs[c][2]){srcs[c][2](f/30+r);uploadSrc();}renderStack(BT+=1/60,1/60);V.frameNo++;}
      sg.drawImage(canvas,160+c*TW,r*TH,TW,TH);it.f.push(bFeat(canvas));
    }
  }
  const pairs=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    let d=0;for(let c=0;c<cols;c++)d+=bDist(items[i].f[c],items[j].f[c]);pairs.push([d/cols,items[i].name,items[j].name]);
  }
  pairs.sort((a,b)=>a[0]-b[0]);
  const bad=new Set();pairs.filter(p=>p[0]<thr).forEach(p=>{bad.add(p[1]);bad.add(p[2]);});
  const res={threshold:thr,items:items.length,seconds:Math.round((performance.now()-t0)/1000),tooClose:pairs.filter(p=>p[0]<thr).length,closest:pairs.slice(0,15).map(p=>[+p[0].toFixed(4),p[1],p[2]])};
  window.__bench=res;console.log(JSON.stringify(res));
  root.querySelector('#bres').innerHTML=`<p>${res.tooClose?'FAIL':'PASS'}: ${res.tooClose} pair(s) closer than ${thr}. ${res.items} looks in ${res.seconds}s.</p><pre>${res.closest.map(p=>p.join('  ')).join('\n')}</pre>`;
  prog.textContent='done';
}

/* dev: render module defaults over bench images -> contact sheet canvas (used by the gates) */
function modSheet(ids,names=['face','text','gradient','bars'],TW=160,TH=120){
  const srcs=benchSources().filter(x=>names.includes(x[0])),sheet=document.createElement('canvas');
  sheet.width=TW*srcs.length;sheet.height=TH*ids.length;const sg=sheet.getContext('2d'),errs=[],feats=[];let BT=5;window.__benching=true;
  const saved=STACK.layers,sv=SRC.el;
  for(let r=0;r<ids.length;r++){feats[r]=[];for(let c=0;c<srcs.length;c++){
    setSource(srcs[c][1],'B');STACK.layers=[mkLayer(ids[r])];
    try{for(let i=0;i<4;i++){renderStack(BT+=1/60,1/60);V.frameNo++;}sg.drawImage(canvas,c*TW,r*TH,TW,TH);feats[r].push(bFeat(canvas));}catch(e){errs.push(ids[r]+': '+String(e.message).slice(0,200));break;}
  }}
  STACK.layers=saved;
  return{sheet,errs,feats};
}
function showSheet(sheet){const d=document.createElement('div');d.style.cssText='position:fixed;inset:0;z-index:99;background:#222;overflow:auto';sheet.style.cssText='width:100%;display:block';d.appendChild(sheet);document.body.appendChild(d);}
/* ---- Step 6 gates: module defaults on 4 images ---- */
const TRAITS={
  dither:['ordered','grid','gameboy','static','none'],ascii:['luma-glyph','glyph','red-black','static','scan'],
  epsilon:['additive-glow','glow','warm','static','none'],orb:['gaussian','blob','retro-rainbow','drift','scan'],
  linemod:['luma-width','line','lime-mono','wobble','none'],cmyk:['subtractive','rosette-grid','cmyk-cream','static','paper'],
  shapes:['additive-channel','shape-grid','rgb-black','static','paper'],stipple:['probabilistic','stipple','bw-paper','static','paper'],
  pixelmania:['avg-block','quadtree','image','static','bevel'],displace:['warp','warp','source','flow','none'],
  crusher:['led','bead-grid','synth','wobble','bead'],patmerge:['select','sdf-blob','pink-gray','static','none'],
  multithr:['threshold','bitmap','bw','static','grain'],
  crtlab:['crt-chain','scanline-mask','source','flicker','scan'],
  psort:['rank-sort','runs','source','static','streak'],riso:['multiply-overprint','halftone-angles','spot-inks','static','paper'],
  engrave:['line-width','hatch','ink-paper','static','none'],seccam:['crushed-levels','interlace','mono-green','jitter','overlay'],mosh:['block-hold','block-motion','source','smear','none'],
  solid:['flat-fill','silhouette','duotone-cream','static','flat'],contour:['edge-stroke','outline','source-dim','static','stroke'],
  sigbody:['mask-gated','dither-body','amber-ink','static','grain'],bgrep:['replace','cut-out','cream-blue','drift','flat'],echo:['ring-buffer','trail','orange-shift','trail','ghost'],
kaleido:['mirror-fold','radial-mirror','source','spin','none'],mirror:['mirror-fold','tile-mirror','source','slide','none'],chroma:['channel-offset','fringe','source','wobble','glow'],
  slicer:['row-shift','slices','source-rgb','glitch','none'],swirl:['polar-twist','spiral','source','pulse','none'],ripple:['radial-wave','rings','source','wave','shine'],
  zoomblur:['radial-average','streaks','source','pulse','glow'],fisheye:['lens-warp','bulge','source','breathe','vignette'],neonedge:['sobel','edge-lines','amber-ink','static','glow'],
  gradmap:['luma-ramp','tone-bands','three-stop','cycle','flat'],contourl:['luma-bands','topo-lines','ink-paper','flow','paper'],tiles:['block-average','rounded-grid','source','static','bevel'],
  grain:['lift-warm','none','warm-film','flicker','grain'],melt:['column-drip','vertical-smear','source','drip','none'],
  moire:['product','grating','ink-cream','drift','none'],interf:['wave-sum','rings','orange-dark','orbit','none'],scanf:['band-sweep','scanbars','amber-dark','sweep','scan'],
  osc:['lissajous','contours','red-cream','phase','none'],nfield:['fbm-warp','noise-bands','olive-cream','flow','grain']
};
const TRAIT_NAMES=['tone mapping','spatial structure','palette','temporal','surface'];
function cyanFrac(cv){
  const t=document.createElement('canvas');t.width=96;t.height=72;const g=t.getContext('2d',{willReadFrequently:true});g.drawImage(cv,0,0,96,72);const d=g.getImageData(0,0,96,72).data;let n=0;
  for(let i=0;i<d.length;i+=4){const r=d[i]/255,gg=d[i+1]/255,b=d[i+2]/255,mx=Math.max(r,gg,b),mn=Math.min(r,gg,b),dl=mx-mn;if(mx<.15||dl/mx<.25)continue;
    let h;if(mx===r)h=((gg-b)/dl+6)%6;else if(mx===gg)h=(b-r)/dl+2;else h=(r-gg)/dl+4;h*=60;if(h>=165&&h<=255)n++;}
  return n/(96*72);
}
function hueShift(srcCv,outCv){
  const rd=cv=>{let w=cv.width,h=cv.height,cur=cv;while(w>24){w=Math.max(24,w>>1);h=Math.max(18,h>>1);const t=document.createElement('canvas');t.width=w;t.height=h;t.getContext('2d').drawImage(cur,0,0,w,h);cur=t;}const t=document.createElement('canvas');t.width=24;t.height=18;const g=t.getContext('2d',{willReadFrequently:true});g.drawImage(cur,0,0,24,18);return g.getImageData(0,0,24,18).data;};
  const a=rd(srcCv),b=rd(outCv);let sum=0,n=0;
  const hsv=(d,i)=>{const r=d[i]/255,g=d[i+1]/255,bl=d[i+2]/255,mx=Math.max(r,g,bl),mn=Math.min(r,g,bl),dl=mx-mn;if(mx<.2||dl/mx<.25)return null;let h;if(mx===r)h=((g-bl)/dl+6)%6;else if(mx===g)h=(bl-r)/dl+2;else h=(r-g)/dl+4;return h*60;};
  for(let i=0;i<a.length;i+=4){const x=hsv(a,i),y=hsv(b,i);if(x===null||y===null)continue;let d=Math.abs(x-y);if(d>180)d=360-d;sum+=d;n++;}
  return n>12?sum/n:null;
}
function runModuleGate(thr=.08){
  const ids=Object.keys(MODULES).filter(i=>!MODULES[i].hidden&&TRAITS[i]);
  const names=['face','animal','text','gradient'],TW=200,TH=150,srcs=benchSources().filter(x=>names.includes(x[0]));
  const sheet=document.createElement('canvas');sheet.width=TW*srcs.length;sheet.height=TH*ids.length;const sg=sheet.getContext('2d');
  const feats=[],errs=[],cyan={},hue={};let BT=5,all=0,allN=0;window.__benching=true;const saved=STACK.layers;PERSON.synthetic=true;
  ids.forEach((id,r)=>{feats[r]=[];let cs=0,hs=0,hn=0;if(id==='crtlab'){BT=5;ST.lastDeg=0;V.sizeKey='';V.lastBKey='';}/* CRT Lab is time dependent: always measure it at the same clock */srcs.forEach((s,c)=>{
    setSource(s[1],'B');STACK.layers=[mkLayer(id)];
    try{for(let i=0;i<4;i++){syntheticPerson(true,i);renderStack(BT+=1/60,1/60);V.frameNo++;}sg.drawImage(canvas,c*TW,r*TH,TW,TH);feats[r].push(bFeat(canvas));cs+=cyanFrac(canvas);const hh=hueShift(s[1],canvas);if(hh!==null){hs+=hh;hn++;}}catch(e){errs.push(id+': '+String(e.message).slice(0,160));}
  });cyan[id]=+(cs/srcs.length).toFixed(3);hue[id]=hn?+(hs/hn).toFixed(1):null;all+=cs;allN+=srcs.length;});
  STACK.layers=saved;PERSON.synthetic=false;
  const pairs=[],traitFail=[];
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    let d=0;for(let c=0;c<srcs.length;c++)d+=bDist(feats[i][c],feats[j][c]);pairs.push([+(d/srcs.length).toFixed(3),ids[i],ids[j]]);
    const diff=TRAITS[ids[i]].filter((v,k)=>v!==TRAITS[ids[j]][k]).length;if(diff<2)traitFail.push([ids[i],ids[j],diff]);
  }
  pairs.sort((a,b)=>a[0]-b[0]);
  const res={modules:ids.length,distThreshold:thr,tooClose:pairs.filter(p=>p[0]<thr),closest:pairs.slice(0,6),traitFail,cyanAll:+(all/allN).toFixed(3),cyan,hue,errs};
  res.hueFail=Object.entries(hue).filter(([k,v])=>v!==null&&v>35).map(([k,v])=>k);
  res.pass=!errs.length&&!res.tooClose.length&&!traitFail.length&&res.cyanAll<=.15&&!res.hueFail.length;
  return{res,sheet};
}
/* Fuse gate: every camera effect alone + 20 random fused pairs, over 4 bench sources. Needs async waits for compiles. */
async function runFuseGate(thr=.04,pairsN=20){
  const names=['face','animal','text','gradient'],TW=160,TH=120,srcs=benchSources().filter(x=>names.includes(x[0]));
  const rec=CAMFX.filter(f=>!f.custom&&!f.face&&f.id!=='clean'/* identity-style baseline, exempt from the distinctness check */).map(f=>({n:f.id,set:V=>{V.f1=fxIndex(f.id);V.i1=f.i;V.m1=f.m;}}));
  const rnd=(()=>{let s=7;return()=>(s=(s*16807)%2147483647)/2147483647;})(),pool=fusePool();
  for(let i=0;i<pairsN;i++){const a=pool[rnd()*pool.length|0],b=pool[rnd()*pool.length|0];if(a===b){i--;continue;}
    rec.push({n:a.id+'+'+b.id,set:V=>{V.f1=fxIndex(a.id);V.i1=a.i;V.m1=a.m;V.f2=fxIndex(b.id);V.i2=b.i;V.m2=b.m;V.bl2=[0,2,0,5][i%4];V.mx2=70;}});}
  const sheet=document.createElement('canvas');sheet.width=TW*srcs.length;sheet.height=TH*rec.length;const sg=sheet.getContext('2d');
  const feats=[],cyan={},saved=STACK.layers,hue={};window.__benching=true;let BT=5;
  for(let r=0;r<rec.length;r++){feats[r]=[];let cs=0,hs=0,hn=0;
    for(let c=0;c<srcs.length;c++){
      setSource(srcs[c][1],'B');const l=mkLayer('fuse');for(let s=2;s<=4;s++)l.params['f'+s]=0;l.params.f1=0;rec[r].set(l.params);STACK.layers=[l];
      const key=fuseFxs(l.params).map(x=>x?x.id:'-').join();
      for(let i=0;i<300&&MODULES.fuse.progKey!==key;i++){renderStack(BT+=1/60,1/60);await new Promise(q=>setTimeout(q,10));}
      for(let i=0;i<4;i++){renderStack(BT+=1/60,1/60);V.frameNo++;}
      sg.drawImage(canvas,c*TW,r*TH,TW,TH);feats[r].push(bFeat(canvas));cs+=cyanFrac(canvas);const hh=hueShift(srcs[c][1],canvas);if(hh!==null){hs+=hh;hn++;}}
    cyan[rec[r].n]=+(cs/srcs.length).toFixed(3);hue[rec[r].n]=hn?+(hs/hn).toFixed(1):null;}
  STACK.layers=saved;window.__benching=false;
  const pairs=[];for(let i=0;i<rec.length;i++)for(let j=i+1;j<rec.length;j++){if(rec[i].n.split('+').some(x=>rec[j].n.split('+').includes(x)))continue;/* a pair that contains the other effect is a variation of it, not a duplicate */let d=0;for(let c=0;c<srcs.length;c++)d+=bDist(feats[i][c],feats[j][c]);pairs.push([+(d/srcs.length).toFixed(3),rec[i].n,rec[j].n]);}
  pairs.sort((a,b)=>a[0]-b[0]);
  const cyanOver=Object.entries(cyan).filter(([k,v])=>v>.15).map(([k,v])=>k+':'+v);
  return{res:{n:rec.length,thr,tooClose:pairs.filter(p=>p[0]<thr),closest:pairs.slice(0,8),cyanOver,cyanMean:+(Object.values(cyan).reduce((a,b)=>a+b,0)/rec.length).toFixed(3),pass:!pairs.some(p=>p[0]<thr)&&!cyanOver.length},sheet};
}
/* =====================================================================
   Inspector: layer strip, accordions, generic param rows, gallery, skins
   ===================================================================== */
const IDENT={patdith:'#f4efe1',contour:'#e6c07b',ridge:'#f2efe6',crtlab:'#ff5a1f',fuse:'#ff5c8a',psort:'#e8b04a',riso:'#ff48b0',engrave:'#c9b27c',seccam:'#8fbf7a',mosh:'#d65a5a',dither:'#8bac0f',ascii:'#ff2a2a',epsilon:'#ffb347',orb:'#ff2a6d',linemod:'#d8ff3a',cmyk:'#e6007e',shapes:'#ffd60a',stipple:'#f4efe1',pixelmania:'#ff9a1f',displace:'#c9c9c9',crusher:'#ff6a00',patmerge:'#ff6fae',multithr:'#f7f3ea'};
const INS={gallery:false,cat:'All',tab:'look'};
const $i=id=>document.getElementById(id);
const layer=()=>STACK.layers[STACK.sel]||STACK.layers[0];
const fmtv=(p,v)=>p.step&&p.step<1?(+v).toFixed(p.step<.2?2:1):String(Math.round(v*100)/100);

function rowRange(host,label,get,set,min,max,step,def){
  const r=el('div','ir'),l=el('span','l',label),inp=document.createElement('input'),v=document.createElement('input');
  inp.type='range';inp.min=min;inp.max=max;inp.step=step||1;v.className='v';v.type='text';v.inputMode='decimal';
  const paint=()=>{const x=get();inp.value=x;v.value=fmtv({step},x);inp.style.setProperty('--p',((x-min)/(max-min)*100)+'%');};
  inp.addEventListener('input',()=>{set(+inp.value);paint();});
  v.addEventListener('focus',()=>v.select());v.addEventListener('change',()=>{const n=parseFloat(v.value);if(!isNaN(n))set(Math.min(max,Math.max(min,n)));paint();});
  v.addEventListener('keydown',e=>{if(e.key==='Enter')v.blur();});
  /* drag a label to scrub */
  let sx=0,s0=0;
  l.addEventListener('pointerdown',e=>{sx=e.clientX;s0=get();l.setPointerCapture(e.pointerId);});
  l.addEventListener('pointermove',e=>{if(!l.hasPointerCapture(e.pointerId))return;const d=(e.clientX-sx)/(e.shiftKey?900:300)*(max-min);let n=s0+d;if(step)n=Math.round(n/step)*step;set(Math.min(max,Math.max(min,n)));paint();});
  let lt=0;l.addEventListener('pointerup',e=>{if(Math.abs(e.clientX-sx)>6||def===undefined)return;const n=performance.now();if(n-lt<320){set(def);paint();buzz(10);toast(label+' reset');lt=0;}else lt=n;});
  r.append(l,inp,v);host.appendChild(r);paint();return paint;
}
const LAYER_ID=()=>layer().uid;
function rowParam(host,p,V,onchange){
  const set=x=>{V[p.k]=x;TLN.capture(V,p.k,x);onchange&&onchange(p);};
  if(p.t==='r')return rowRange(host,p.label||p.k,()=>V[p.k],set,p.min,p.max,p.step,p.def);
  if(p.t==='range2'){
    const r=el('div','ir r2'),l=el('span','l',p.label||p.k);l.style.cursor='default';const w=el('div','dual'),a=document.createElement('input'),b=document.createElement('input'),v=el('span','v');
    [a,b].forEach(x=>{x.type='range';x.min=p.min;x.max=p.max;x.step=p.step||1;});
    const paint=()=>{a.value=V[p.k][0];b.value=V[p.k][1];v.textContent=Math.round(V[p.k][0])+'–'+Math.round(V[p.k][1]);w.style.setProperty('--a',(V[p.k][0]-p.min)/(p.max-p.min)*100+'%');w.style.setProperty('--b',(V[p.k][1]-p.min)/(p.max-p.min)*100+'%');};
    a.addEventListener('input',()=>{V[p.k][0]=Math.min(+a.value,V[p.k][1]);paint();onchange&&onchange(p);});
    b.addEventListener('input',()=>{V[p.k][1]=Math.max(+b.value,V[p.k][0]);paint();onchange&&onchange(p);});
    w.append(a,b);r.append(l,w,v);host.appendChild(r);paint();return;
  }
  if(p.t==='curve'){
    const box=el('div','pe');box.style.display='block';const W=232,H=120,svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.style.cssText='width:100%;max-width:300px;touch-action:none;background:var(--raise);border:1px solid var(--line);display:block';
    const draw=()=>{const pts=V[p.k].map((y,i)=>[8+i*(W-16)/4,H-8-y*(H-16)]);
      let d='M'+pts[0].join(',');for(let i=0;i<=40;i++){const f=i/40*4,j=Math.min(3,Math.floor(f)),t=f-j,tt=t*t*(3-2*t),y=V[p.k][j]*(1-tt)+V[p.k][j+1]*tt;d+=' L'+(8+f*(W-16)/4)+','+(H-8-y*(H-16));}
      svg.innerHTML=`<line x1="8" y1="${H-8}" x2="${W-8}" y2="8" stroke="var(--line)"/><path d="${d}" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`+pts.map((q,i)=>`<circle data-i="${i}" cx="${q[0]}" cy="${q[1]}" r="9" fill="var(--accent)" stroke="var(--ink)"/>`).join('');};
    let cur=-1;const move=e=>{if(cur<0)return;const r=svg.getBoundingClientRect(),y=1-((e.clientY-r.top)/r.height*H-8)/(H-16);V[p.k][cur]=Math.min(1,Math.max(0,y));draw();onchange&&onchange(p);};
    svg.addEventListener('pointerdown',e=>{const c=e.target.closest('circle');if(!c)return;cur=+c.dataset.i;svg.setPointerCapture(e.pointerId);});
    svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',()=>cur=-1);
    const t=el('div','l',p.label||p.k);t.style.cssText='font:500 11.5px var(--lab);padding:8px 12px 4px';host.appendChild(t);box.appendChild(svg);host.appendChild(box);draw();return;
  }
  if(p.t==='image'){
    const r=el('div','ir');r.appendChild(el('span','l',p.label));const b=el('button','btn',MAPIMG[LAYER_ID()]?'Replace':'Choose');b.style.cssText='grid-column:2/4;min-height:34px';
    const fi=document.createElement('input');fi.type='file';fi.accept='image/*';fi.hidden=true;b.addEventListener('click',()=>fi.click());
    fi.addEventListener('change',()=>{const f=fi.files[0];if(!f)return;const im=new Image();im.onload=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,im);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      MAPIMG[LAYER_ID()]=t;V.dmode=3;b.textContent='Replace';toast('Map image loaded');renderInspector();URL.revokeObjectURL(im.src);};im.onerror=()=>toast('That file couldn’t be read as an image');im.src=URL.createObjectURL(f);});
    r.append(b,fi);host.appendChild(r);return;
  }
  const r=el('div','ir'),l=el('span','l',p.label||p.k);l.style.cursor='default';r.appendChild(l);
  if(p.t==='c'){const s=document.createElement('select');p.opts.forEach((o,i)=>{const op=document.createElement('option');op.value=i;op.textContent=o;s.appendChild(op);});s.value=V[p.k];s.addEventListener('change',()=>set(+s.value));r.appendChild(s);}
  else if(p.t==='b'){const c=document.createElement('input');c.type='checkbox';c.className='cb';c.checked=!!V[p.k];c.addEventListener('change',()=>set(c.checked));r.appendChild(c);}
  else if(p.t==='color'){const c=document.createElement('input');c.type='color';c.value=V[p.k];const h=document.createElement('input');h.className='hx';h.value=V[p.k];
    c.addEventListener('input',()=>{h.value=c.value;set(c.value);});h.addEventListener('change',()=>{if(/^#[0-9a-f]{6}$/i.test(h.value)){c.value=h.value;set(h.value);}});r.append(c,h);}
  host.appendChild(r);
}
function palEditor(host,p,V,onchange){
  const box=el('div','pe');
  const draw=()=>{
    box.innerHTML='';
    (V[p.k]||[]).forEach((hex,i)=>{
      const sl=el('div','sl'),c=document.createElement('input');c.type='color';c.value=hex;const h=document.createElement('input');h.className='hx';h.value=hex;
      const ch=x=>{V[p.k][i]=x;onchange&&onchange(p);};
      c.addEventListener('input',()=>{h.value=c.value;ch(c.value);});h.addEventListener('change',()=>{if(/^#[0-9a-f]{6}$/i.test(h.value)){c.value=h.value;ch(h.value);}});
      sl.append(c,h);
      if(V[p.k].length>2){const x=el('button','','×');x.setAttribute('aria-label','Remove color');x.style.minWidth='28px';x.addEventListener('click',()=>{V[p.k].splice(i,1);onchange&&onchange(p);draw();});sl.appendChild(x);}
      box.appendChild(sl);});
    const add=el('button','','+ Color');add.addEventListener('click',()=>{if(V[p.k].length<16){V[p.k].push('#ffffff');onchange&&onchange(p);draw();}});
    const cyc=el('button','','Cycle');cyc.addEventListener('click',()=>{V[p.k]=palCycle(V[p.k],1);onchange&&onchange(p);draw();});
    const sel=document.createElement('select');sel.className='hx';sel.style.cssText='min-height:34px;width:auto;border:1px solid var(--line);background:var(--raise);color:var(--ink);font:600 11px var(--lab)';
    sel.innerHTML='<option>Presets</option>'+Object.entries(PALETTES).map(([c,o])=>`<optgroup label="${c}">`+Object.keys(o).map(n=>`<option value="${c}|${n}">${n}</option>`).join('')+'</optgroup>').join('');
    sel.addEventListener('change',()=>{const [c,n]=sel.value.split('|');if(PALETTES[c]&&PALETTES[c][n]){V[p.k]=PALETTES[c][n].slice();onchange&&onchange(p);draw();}});
    const imp=el('button','','Import');const fi=document.createElement('input');fi.type='file';fi.accept='.hex,.gpl,.txt';fi.hidden=true;
    imp.addEventListener('click',()=>fi.click());fi.addEventListener('change',async()=>{const a=palParse(await fi.files[0].text());if(a.length>=2){V[p.k]=a;onchange&&onchange(p);draw();}else toast('No colors found in that file');});
    const exp=el('button','','Export');exp.addEventListener('click',()=>{const b=new Blob([palGpl(V[p.k])],{type:'text/plain'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='n0ise-palette.gpl';a.click();});
    box.append(add,cyc,sel,imp,exp,fi);
  };
  draw();host.appendChild(box);
}
const ACC_OPEN={};
function accordion(title,open){const d=document.createElement('details');d.className='acc';const ak=(STACK.layers[STACK.sel]?STACK.layers[STACK.sel].module:'')+'|'+title;d.open=ak in ACC_OPEN?ACC_OPEN[ak]:!!open;d.addEventListener('toggle',()=>{ACC_OPEN[ak]=d.open;if(d.open&&d.parentNode)[...d.parentNode.children].forEach(x=>{if(x!==d&&x.tagName==='DETAILS'&&x.open)x.open=false;});});const s=document.createElement('summary');s.textContent=title;const b=el('div','bd');d.append(s,b);return{d,b};}

/* thumbnails: render a module over the current source into a small offscreen RT */
const TH={rt:null,src:null,buf:null};
function moduleThumb(id,w=160,h=120,over){
  const m=MODULES[id];if(!m)return null;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  if(id==='crtlab'){cv.getContext('2d').drawImage(canvas,0,0,w,h);return cv;}
  if(!TH.rt||TH.rt.w!==w){TH.rt=mkRT(w,h,{});TH.src=mkRT(w,h,{});TH.buf=new Uint8Array(w*h*4);}
  const sp=PR.srcp||(PR.srcp=mkProg(VS,F_SRCP));
  bindRT(TH.src);sp.use();samp(sp,'uSrc',0,TEX.src);sp.f('uSrcAsp',SRC.w/SRC.h);sp.f('uScrAsp',w/h);draw();
  const l=mkLayer(id);if(over)Object.assign(l.params,over);
  try{m.render(TH.src.tex,{t:1.3,dt:.016,out:TH.rt,layer:l,params:l.params,W:w,H:h,sync:true});}catch(e){return cv;}
  bindRT(TH.rt);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,TH.buf);
  const im=new ImageData(w,h),row=w*4;for(let y=0;y<h;y++)im.data.set(TH.buf.subarray((h-1-y)*row,(h-y)*row),y*row);
  cv.getContext('2d').putImageData(im,0,0);bindRT(null);return cv;
}
function renderStrip(){
  const s=$i('strip');s.innerHTML='';
  STACK.layers.forEach((l,i)=>{
    const m=MODULES[l.module],b=el('button','ly'+(l.visible?'':' off'));b.setAttribute('aria-current',i===STACK.sel);b.title=m.name;
    const n=el('b','',String(i+1).padStart(2,'0'));const c=moduleThumb(l.module,112,60);c.style.height='30px';
    b.append(n,c,el('span','',m.name+(l.solo?' · solo':'')));
    let drag=null;
    b.addEventListener('pointerdown',e=>{drag={x:e.clientX,i,moved:false};});
    b.addEventListener('pointermove',e=>{if(!drag)return;if(!drag.moved&&Math.abs(e.clientX-drag.x)>10){drag.moved=true;b.setPointerCapture(e.pointerId);b.classList.add('drag');}
      if(drag.moved)b.style.transform=`translateX(${e.clientX-drag.x}px)`;});
    b.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;b.style.transform='';b.classList.remove('drag');
      if(!d.moved)return;e.preventDefault();b._swallow=true;
      const kids=[...s.querySelectorAll('.ly')],xs=kids.map(k=>{const r=k.getBoundingClientRect();return r.left+r.width/2;});
      let to=0;xs.forEach((cx,j)=>{if(e.clientX>cx)to=j;});to=Math.min(STACK.layers.length-1,Math.max(0,to));
      if(to!==d.i){const a=STACK.layers,[mv]=a.splice(d.i,1);a.splice(to,0,mv);STACK.sel=to;snap();renderInspector();}});
    b.addEventListener('click',()=>{if(b._swallow){b._swallow=false;return;}STACK.sel=i;INS.gallery=false;renderInspector();});s.appendChild(b);});
  const a=el('button','add','+');a.setAttribute('aria-label','Add effect');a.addEventListener('click',()=>{INS.gallery=!INS.gallery;renderInspector();});s.appendChild(a);
  const sk=el('button','btn','Skin');sk.style.cssText='flex:none;align-self:center';sk.addEventListener('click',cycleSkin);const lf=el('button','btn','Left');lf.title='Flip controls for left-handed use';lf.style.cssText='flex:none;align-self:center';lf.addEventListener('click',toggleLefty);s.append(lf,sk);
}
const SKINS=['lab','parchment','utility'];
function cycleSkin(){const cur=document.documentElement.dataset.skin||'lab',n=SKINS[(SKINS.indexOf(cur)+1)%SKINS.length];setSkin(n);toast('Skin: '+n);}
function setSkin(n){document.documentElement.dataset.skin=n;try{localStorage.setItem('n0ise.skin',n);}catch(e){}}

function renderGallery(host){
  const g=el('div','gal'),all=allEffects(),fams=['All',...UFAM_ORDER.filter(f=>all.some(e=>e.fam===f)),...new Set(all.map(e=>e.fam).filter(f=>!UFAM_ORDER.includes(f)))];
  if(!fams.includes(INS.cat))INS.cat='All';
  const cats=el('div','cats');fams.forEach(f=>{const b=el('button','',f);b.setAttribute('aria-pressed',INS.cat===f);b.addEventListener('click',()=>{INS.cat=f;renderInspector();});cats.appendChild(b);});
  const grid=el('div','grid');
  all.filter(e=>INS.cat==='All'?e.fam!=='Face':e.fam===INS.cat).forEach(e=>{
    const t=el('button','tile'),i=document.createElement('i');
    if(e.m){const m=e.m;t.append(moduleThumb(m.id),i,el('span','',m.name));i.style.background=IDENT[m.id]||'#888';
      t.addEventListener('click',()=>{
        if(INS.addMode){if(m.id==='crtlab'&&STACK.layers.some(l=>l.module==='crtlab')){toast('CRT Lab is already in the stack');return;}
          STACK.layers.push(mkLayer(m.id));STACK.sel=STACK.layers.length-1;INS.gallery=false;renderInspector();}
        else pickEffect(m.id);});}
    else{const f=e.f;i.style.background=f.c;t.append(moduleThumb('fuse',160,120,{f1:fxIndex(f.id),i1:f.i,m1:f.m}),i,el('span','',f.label));
      t.addEventListener('click',()=>{if(INS.addMode){STACK.layers.push(mkLayer('fuse'));STACK.sel=STACK.layers.length-1;for(let s=2;s<=4;s++)STACK.layers[STACK.sel].params['f'+s]=0;}pickCam(f.id);});}
    grid.appendChild(t);});
  const md=el('div','cats');['Replace this effect','Add as new layer'].forEach((n,i)=>{const b=el('button','',n);b.setAttribute('aria-pressed',!!INS.addMode===!!i);b.addEventListener('click',()=>{INS.addMode=!!i;md.querySelectorAll('button').forEach((x,j)=>x.setAttribute('aria-pressed',!!INS.addMode===!!j));});md.appendChild(b);});
  const q=document.createElement('input');q.type='search';q.placeholder='Search effects';q.className='gq';q.setAttribute('aria-label','Search effects');
  q.addEventListener('input',()=>{const s=q.value.trim().toLowerCase();grid.querySelectorAll('.tile').forEach(x=>{x.hidden=!!s&&!x.textContent.toLowerCase().includes(s);});});
  g.append(md,q,cats,grid);host.appendChild(g);
}
function remix(l){
  const m=MODULES[l.module];l.seed=Math.random()*999|0;
  if(l.module==='crtlab'){shuffle();return;}
  for(const p of m.params){
    if(p.k==='seed')l.params.seed=Math.random()*999|0;
    else if(p.t==='r'){const span=p.max-p.min;l.params[p.k]=Math.min(p.max,Math.max(p.min,p.def+(Math.random()-.5)*span*.6));if(p.step>=1)l.params[p.k]=Math.round(l.params[p.k]);else l.params[p.k]=Math.round(l.params[p.k]/p.step)*p.step;}
    else if(p.t==='pal'){const cats=Object.values(PALETTES),c=cats[Math.random()*cats.length|0],ks=Object.keys(c);l.params[p.k]=c[ks[Math.random()*ks.length|0]].slice();}
    else if(p.t==='color'){let h,tries=0;do{h=Math.random()*360;tries++;}while(h>165&&h<255&&tries<20);l.params[p.k]=hslHex(h,.55+Math.random()*.4,.35+Math.random()*.35);}
  }
}
function hslHex(h,s,l){const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};return rgbHex([f(0),f(8),f(4)]);}
function shareStack(){
  const data=STACK.layers.map(l=>({m:l.module,p:l.module==='crtlab'?null:l.params,o:l.opacity,b:l.blend,s:l.showSource,sel:l.select,t:l.thr,pos:l.pos,z:l.size,seed:l.seed,v:l.visible,c:l.color,mk:l.mask,so:l.solo,md:l.mods}));
  const hash='#s='+btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  history.replaceState(null,'',hash);
  (navigator.clipboard?navigator.clipboard.writeText(location.href):Promise.reject()).then(()=>toast('Link copied')).catch(()=>toast('Link is in the address bar'));
}
function loadStackHash(){
  const m=location.hash.match(/^#s=(.+)$/);if(!m)return;
  try{const a=JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    STACK.layers=a.filter(x=>MODULES[x.m]).map(x=>{const l=mkLayer(x.m,x.p||undefined);if(x.u!=null){l.uid=x.u;layerUid=Math.max(layerUid,x.u+1);}Object.assign(l,{opacity:x.o,blend:x.b,showSource:x.s,select:x.sel,thr:x.t,pos:x.pos,size:x.z,seed:x.seed,visible:x.v});if(x.c)l.color=x.c;if(x.mk)l.mask=x.mk;l.solo=!!x.so;l.mods=x.md||[];return l;});
    if(!STACK.layers.length)STACK.layers=[mkLayer('crtlab')];}catch(e){}
}
const presetsOf=id=>{try{return JSON.parse(localStorage.getItem('n0ise.p.'+id)||'[]');}catch(e){return[];}};

/* ---- color treatment: separate from the effect ---- */
function extractColors(k=5){
  const cv=document.createElement('canvas');cv.width=cv.height=48;const g=cv.getContext('2d',{willReadFrequently:true});
  try{g.drawImage(SRC.el,0,0,48,48);}catch(e){return null;}
  const d=g.getImageData(0,0,48,48).data,px=[];for(let i=0;i<d.length;i+=4)px.push([d[i],d[i+1],d[i+2]]);
  let cs=Array.from({length:k},(_,i)=>px[Math.floor((i+.5)*px.length/k)].slice());
  for(let it=0;it<8;it++){const sum=cs.map(()=>[0,0,0,0]);
    px.forEach(c=>{let b=0,bd=1e9;cs.forEach((m,i)=>{const e=(c[0]-m[0])**2+(c[1]-m[1])**2+(c[2]-m[2])**2;if(e<bd){bd=e;b=i;}});sum[b][0]+=c[0];sum[b][1]+=c[1];sum[b][2]+=c[2];sum[b][3]++;});
    cs=cs.map((m,i)=>sum[i][3]?[sum[i][0]/sum[i][3],sum[i][1]/sum[i][3],sum[i][2]/sum[i][3]]:m);}
  return cs.sort((a,b)=>(.299*a[0]+.587*a[1]+.114*a[2])-(.299*b[0]+.587*b[1]+.114*b[2])).map(rgbHex);
}
const COLOR_LABEL={original:'Original',mono:'Mono',duotone:'Duotone',gradient:'Gradient',palette:'Palette'};
function colorRow(host,l){
  const col=l.color||(l.color=JSON.parse(JSON.stringify(LAYER_DEFAULTS.color)));
  const r=el('div','ir cr');r.appendChild(el('span','l','Color'));
  const sel=document.createElement('select');COLOR_MODES.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=COLOR_LABEL[m];sel.appendChild(o);});sel.value=col.mode;
  sel.addEventListener('change',()=>{col.mode=sel.value;renderInspector();});r.appendChild(sel);host.appendChild(r);
  if(col.mode!=='original'){
    const a=accordion('Color treatment',true);
    rowRange(a.b,'Amount',()=>col.amt,v=>col.amt=v,0,100,1);
    if(col.mode!=='mono')palEditor(a.b,{k:'pal'},col,null);
    if(col.mode!=='mono'){const w=el('div','pe'),ex=el('button','','Extract from image');ex.addEventListener('click',()=>{const c=extractColors(col.mode==='duotone'?2:5);if(c){col.pal=c;renderInspector();}else toast('Can’t read colors from this source');});
      const dp=el('button','','Fewer colors');dp.addEventListener('click',()=>{col.pal=palDepth(col.pal,Math.max(2,col.pal.length-1));renderInspector();});w.append(ex,dp);a.b.appendChild(w);}
    host.appendChild(a.d);
  }
}
const recolors=o=>!!(o&&(o.pal&&o.pal!=='src'));
/* Fuse bar: up to 4 steps as chips with a power dot (tap = on/off, hold = solo), tap name = pick effect */
function fuseBar(host,l){
  const V=l.params,bar=el('div','fbar');
  const row=el('div','fchips');
  for(let s=1;s<=4;s++){
    const f=CAMFX[+V['f'+s]-1],c=el('div','fchip'+(f?'':' empty')+(f&&!V['on'+s]?' off':''));
    const dot=el('button','fdot');dot.setAttribute('aria-label','Step '+s+' power');dot.setAttribute('aria-pressed',!!(f&&V['on'+s]));
    let hold=0,solo=false;
    dot.addEventListener('pointerdown',()=>{solo=false;hold=setTimeout(()=>{solo=true;for(let k=1;k<=4;k++)V['on'+k]=k===s&&!!CAMFX[+V['f'+k]-1];if(navigator.vibrate)try{navigator.vibrate(12);}catch(e){}renderInspector();},450);});
    dot.addEventListener('pointerup',()=>{clearTimeout(hold);if(solo||!f)return;V['on'+s]=!V['on'+s];renderInspector();});
    dot.addEventListener('pointerleave',()=>clearTimeout(hold));
    const nm=el('button','fname',f?f.label:'Add effect');nm.addEventListener('click',()=>{FUSEPICK=FUSEPICK===s?0:s;renderInspector();});
    c.append(dot,nm);
    if(f&&s>1){const up=el('button','fx','‹');up.setAttribute('aria-label','Move step '+s+' earlier');up.addEventListener('click',()=>{fuseSwap(l,s,s-1);renderInspector();});c.appendChild(up);}
    if(f&&s>1){const x=el('button','fx','×');x.setAttribute('aria-label','Remove step '+s);x.addEventListener('click',()=>{fuseSet(l,s,null);renderInspector();});c.appendChild(x);}
    row.appendChild(c);}
  bar.appendChild(row);
  const cost=fuseCost(V),meter=el('span','fcost','Cost '+'●'.repeat(Math.min(cost,9))+'○'.repeat(Math.max(0,9-cost)));
  const act=el('div','pe');
  const fb=el('button','','Fuse');fb.title='Random compatible pair';fb.addEventListener('click',()=>{toast(fuseRandomPair(l));renderInspector();});
  const rs=el('button','','Reset');rs.addEventListener('click',()=>{Object.assign(l.params,MODULES.fuse.defaults());renderInspector();});
  const sv=el('button','','Save');sv.title='Save this recipe';sv.addEventListener('click',()=>{const n=prompt('Name this recipe',fuseName(l));if(n===null)return;toast(saveRecipe(l,n.trim()||fuseName(l))?'Recipe saved':'This browser won’t store recipes');renderInspector();});
  const ed=el('button','','Write effect');ed.title='Write your own effect in GLSL';ed.addEventListener('click',openEditor);
  const sh=el('button','','Share');sh.addEventListener('click',()=>fuseShare(l));
  act.append(fb,sv,sh,ed,rs,meter);bar.appendChild(act);
  if([1,2,3,4].some(s=>+V['f'+s]&&+V['mk'+s]===4)||ST.mpaint){
    const mp=el('div','pe'),tg=el('button','',ST.mpaint?'Done painting':'Paint mask');tg.addEventListener('click',()=>{ST.mpaint=!ST.mpaint;renderInspector();});mp.appendChild(tg);
    if(ST.mpaint){const er=el('button','',MASKB.erase?'Erasing':'Painting');er.setAttribute('aria-pressed',MASKB.erase);er.addEventListener('click',()=>{MASKB.erase=!MASKB.erase;renderInspector();});
      const cl=el('button','','Clear');cl.addEventListener('click',()=>maskFill(0));const fl=el('button','','Fill');fl.addEventListener('click',()=>maskFill(1));const iv=el('button','','Invert');iv.addEventListener('click',maskInvert);mp.append(er,cl,fl,iv);}
    bar.appendChild(mp);
    if(ST.mpaint){const w=el('div','');rowRange(w,'Brush size',()=>MASKB.size,v=>MASKB.size=v,2,60,1);rowRange(w,'Feather',()=>MASKB.feather,v=>MASKB.feather=v,0,100,1);bar.appendChild(w);}
  }
  const rc=loadRecipes();if(rc.length){bar.appendChild(el('div','cl','Mine'));const w=el('div','pe');
    rc.slice().reverse().forEach(r=>{const b=el('button','',r.name);b.addEventListener('click',()=>{Object.assign(l.params,r.p);renderInspector();});
      const x=el('button','','×');x.setAttribute('aria-label','Delete '+r.name);x.addEventListener('click',()=>{localStorage.setItem(RECIPES_KEY,JSON.stringify(loadRecipes().filter(q=>q.id!==r.id)));renderInspector();});w.append(b,x);});bar.appendChild(w);}
  if(cost>=9&&matchMedia('(pointer:coarse)').matches)bar.appendChild(el('div','cl','Heavy on a phone. Switch a step off if it stutters.'));
  if(FUSEPICK){const pk=el('div','fpick');
    UFAM_ORDER.concat(['Mine']).filter(n=>n!=='Mix'&&(n!=='Face'||FUSEFACE)).forEach(n=>{const fs=CAMFX.filter(f=>f.cat!=='draft'&&camFam(f)===n).sort((a,b)=>a.label.localeCompare(b.label));if(!fs.length)return;pk.appendChild(el('div','cl',n));const w=el('div','pe');
      fs.forEach(f=>{const b=el('button','',f.label);b.addEventListener('click',()=>{fuseSet(l,FUSEPICK,f.id);FUSEPICK=0;renderInspector();});w.appendChild(b);});pk.appendChild(w);});
    {const fb=el('button','chip act',FUSEFACE?'Hide face effects':'Face effects…');fb.addEventListener('click',()=>{FUSEFACE=!FUSEFACE;renderInspector();});const fw=el('div','pe');fw.appendChild(fb);pk.appendChild(fw);}
    bar.appendChild(pk);}
  host.appendChild(bar);
}
let FUSEPICK=0,FUSEFACE=false;
function renderInspector(){
  const h=$i('insp'),st=h?h.scrollTop:0,g0=INS.gallery,m0=layer().module;
  renderInspector0();
  if(h&&g0===INS.gallery&&m0===layer().module)h.scrollTop=st;
}
function renderInspector0(){
  renderStrip();renderPeek();
  let host=$i('insp');host.innerHTML='';
  if(INS.gallery){renderGallery(host);return;}
  const l=layer(),m=MODULES[l.module],ix=STACK.sel;
  /* banner */
  const col=IDENT[l.module]||'#ccc',dark=parseInt(col.slice(1,3),16)*.3+parseInt(col.slice(3,5),16)*.59+parseInt(col.slice(5,7),16)*.11<140;
  const ban=el('div','ban');ban.style.background=col;ban.style.color=dark?'#fff':'#111';
  ban.append(el('div','no',String(ix+1).padStart(2,'0')),el('div','nm',m.name));host.appendChild(ban);
  const TABS3=[['look','Look'],['place','Apply'],['motion','Move'],['layer','Layer']];
  if(!TABS3.some(t=>t[0]===INS.tab))INS.tab='look';
  const tabs=el('div','itabs');tabs.setAttribute('role','tablist');
  TABS3.forEach(([id,n])=>{const b=el('button','',n);b.setAttribute('role','tab');b.setAttribute('aria-selected',id===INS.tab);b.addEventListener('click',()=>{INS.tab=id;buzz(6);renderInspector();});tabs.appendChild(b);});
  host.appendChild(tabs);
  const PG={look:el('div','ipage'),place:el('div','ipage'),motion:el('div','ipage'),layer:el('div','ipage')};
  const outer=host;host=PG.layer;
  const hd=el('div','hd');
  const mk=(t,f)=>{const b=el('button','btn',t);b.addEventListener('click',f);hd.appendChild(b);return b;};
  mk('Remix',()=>{remix(l);renderInspector();});
  mk('Share',shareStack);
  mk(l.visible?'Hide':'Show',()=>{l.visible=!l.visible;renderInspector();});
  mk('Mutate',()=>mutateLayer());
  mk('Open in 3D',()=>openIn3D());
  {const ab=mk(IDLE.on?'Alive on':'Alive off',()=>{IDLE.on=!IDLE.on;IDLE.force=true;lsSet('n0ise.alive',IDLE.on?'on':'off');renderInspector();});ab.setAttribute('aria-pressed',IDLE.on);}
  {const sb=mk(l.solo?'Unsolo':'Solo',()=>{l.solo=!l.solo;renderInspector();});sb.setAttribute('aria-pressed',!!l.solo);}
  if(ix>0)mk('Up',()=>{const a=STACK.layers;[a[ix-1],a[ix]]=[a[ix],a[ix-1]];STACK.sel=ix-1;renderInspector();});
  if(ix<STACK.layers.length-1)mk('Down',()=>{const a=STACK.layers;[a[ix+1],a[ix]]=[a[ix],a[ix+1]];STACK.sel=ix+1;renderInspector();});
  if(STACK.layers.length>1)mk('Delete',()=>{STACK.layers.splice(ix,1);STACK.sel=Math.max(0,ix-1);renderInspector();});
  host.appendChild(hd);
  host=PG.look;
  colorRow(host,l);
  /* presets */
  const pr=accordion('Presets',false);
  const pl=presetsOf(l.module),pw=el('div','pe');
  const sv=el('button','','Save preset');sv.addEventListener('click',()=>{const a=presetsOf(l.module);a.push({n:'Preset '+(a.length+1),p:JSON.parse(JSON.stringify(l.module==='crtlab'?P:l.params))});try{localStorage.setItem('n0ise.p.'+l.module,JSON.stringify(a.slice(-12)));}catch(e){}renderInspector();});
  pw.appendChild(sv);
  pl.forEach(x=>{const b=el('button','',x.n);b.addEventListener('click',()=>{if(l.module==='crtlab'){Object.assign(P,JSON.parse(JSON.stringify(x.p)));refreshUI();}else l.params=JSON.parse(JSON.stringify(x.p));renderInspector();});pw.appendChild(b);});
  pr.b.appendChild(pw);
  if(l.module==='crtlab'){
    const grp=(t,items)=>{pr.b.appendChild(el('div','cl',t));const w=el('div','pe');items.forEach(([n,tag,fn])=>{const b=el('button','',n+(tag?' ◐':''));b.title=tag?'Also sets a color palette':'Keeps original colors';b.addEventListener('click',()=>{fn();snap();refreshUI();renderInspector();});w.appendChild(b);});pr.b.appendChild(w);};
    grp('Looks',PROFILES.map(x=>[x[1],recolors(x[2]),()=>applyProfile(x[0])]));
    grp('Chains',CHAINS.map(c=>[c[0],c[1].some((mid,i)=>stageModel(STAGES[i][0],mid)[2].pal),()=>applyStages(c[1])]));
    pr.b.appendChild(el('div','cl','◐ = this preset also sets a color palette'));
  }
  if(l.module==='fuse')fuseBar(host,l);
  PG.layer.appendChild(pr.d);
  host=PG.place;
  /* transform */
  const tf=accordion('Transform',false);
  rowRange(tf.b,'Mix',()=>l.opacity,v=>l.opacity=v,0,100,1);
  const bs=el('div','ir');bs.appendChild(el('span','l','Blend'));const bsel=document.createElement('select');BLENDS.forEach(b=>{const o=document.createElement('option');o.value=b;o.textContent=b;bsel.appendChild(o);});bsel.value=l.blend;bsel.addEventListener('change',()=>l.blend=bsel.value);bs.appendChild(bsel);tf.b.appendChild(bs);
  rowParam(tf.b,{k:'showSource',t:'b',label:'Show source'},l,null);
  const ss=el('div','ir');ss.appendChild(el('span','l','Select'));const ssel=document.createElement('select');[['all','All'],['subject','Subject'],['background','Background'],['edges','Edges'],['luma','Luma range'],['color','Colour key'],['drawn','Drawn']].forEach(([b,n])=>{const o=document.createElement('option');o.value=b;o.textContent=n;ssel.appendChild(o);});ssel.value=l.select;ssel.addEventListener('change',()=>{l.select=ssel.value;renderInspector();});ss.appendChild(ssel);tf.b.appendChild(ss);
  rowRange(tf.b,'Threshold',()=>l.thr,v=>l.thr=v,0,100,1);
  rowRange(tf.b,'Position X',()=>l.pos[0],v=>l.pos[0]=v,-50,50,1);rowRange(tf.b,'Position Y',()=>l.pos[1],v=>l.pos[1]=v,-50,50,1);
  rowRange(tf.b,'Size',()=>l.size,v=>l.size=v,20,200,1);rowRange(tf.b,'Seed',()=>l.seed,v=>l.seed=v,0,999,1);
  host.appendChild(tf.d);
  host=PG.motion;
  if(l.module!=='crtlab')modulateSection(host,l,m);
  else host.appendChild(el('div','cl','Signals and modulators aren’t available for the CRT lab'));
  host=PG.place;
  if(l.module!=='crtlab'&&(m.needsMask||MASKSEL.includes(l.select)))maskSection(host,l,m);
  /* module sections */
  host=PG.look;
  if(l.module==='crtlab'){
    TABS.forEach(([tid,tn],i)=>{const a=accordion(tn,i===0);const pane=UI.panes[tid];pane.hidden=false;a.b.classList.add('legacy-body');a.b.appendChild(pane);host.appendChild(a.d);});
  }else{
    m.schema.sections.forEach((sec,i)=>{
      const a=accordion(sec.label,i<1);
      sec.keys.forEach(k=>{const p=m.params.find(x=>x.k===k);if(m.colorBound&&l.params.orig&&(p.t==='pal'||p.t==='color'||m.hideOnOrig.includes(k)))return;if(p.t==='pal')palEditor(a.b,p,l.params,null);else rowParam(a.b,p,l.params,null);});
      host.appendChild(a.d);});
  }
  recipeSection(PG.layer);
  outer.appendChild(PG[INS.tab]);
}
/* ---- WP4: mobile quality of life ---- */
const buzz=(ms=8)=>{try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}};
const lsGet=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'null')||d;}catch(e){return d;}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
/* one taxonomy for engines and camera filters, so similar looks sit together. Face effects live only in 'Face'. */
const CAM_FAMILY={clean:'Color',chrome:'Color',aqua:'Color',solar:'Color',thermal:'Color',duo:'Color',tri:'Color',neon:'Color',fire:'Color',cyber:'Color',sunset:'Color',forest:'Color',invert:'Color',poster:'Color',xray:'Color',
 noir:'Film',lomo:'Film',vintage:'Film',kodak:'Film',fuji:'Film',cinema:'Film',super8:'Film',night:'Film',vhs:'Signal / CRT',crt:'Signal / CRT',
 bubble:'Y2K',lchrome:'Y2K',holo:'Y2K',aero:'Y2K',digicam:'Y2K',webcam:'Y2K',lcd:'Y2K',vapor:'Y2K',vga:'Y2K',gboy:'Pixel',ps1:'Pixel',bayer:'Dither',ign:'Dither',linedith:'Lines',hatch:'Lines',contour:'Lines',wavel:'Lines',sketch:'Lines',stitch:'Pixel',mosaic:'Pixel',lego:'Pixel',ledm:'Pixel',emboss:'Light',tilt:'Light',streak:'Light',longexp:'Time',rgbtear:'Glitch',fish:'Warp',swirl:'Warp',ripple:'Warp',acid:'Color',pop:'Color',halftone:'Print',pixel:'Pixel',ascii:'Glyph',matrix:'Glyph',glitch:'Glitch',mosh:'Glitch',bloom:'Light',dream:'Light',
 prism:'Warp',kaleido:'Warp',mirror:'Warp',liquid:'Warp',paint:'Warp',grid:'Warp',ghost:'Time',tunnel:'Time',slit:'Time'};
const UFAM_ORDER=['Source','Subject','Mix','Color','Y2K','Film','Signal / CRT','Dither','Print','Pixel','Glyph','Lines','Glitch','Light','Warp','Time','Face'];
const camFam=f=>f.face?'Face':(f.custom||f.cat==='custom')?'Mine':CAM_FAMILY[f.id]||'Color';
const modFam=m=>RAIL_FAMILY[m.id]||m.family;
const famRank=f=>{const i=UFAM_ORDER.indexOf(f);return i<0?99:i;};
function allEffects(){return[...Object.values(MODULES).filter(m=>!m.hidden).map(m=>({id:m.id,name:m.name,fam:modFam(m),m})),
  ...CAMFX.filter(f=>f.cat!=='draft').map(f=>({id:'fuse:'+f.id,name:f.label,fam:camFam(f),f}))].sort((a,b)=>famRank(a.fam)-famRank(b.fam)||a.name.localeCompare(b.name));}
/* the list the swipe/arrow stepper walks: no Fuse builder, no face effects unless one is already active */
const effectList=()=>{const cur=effectId(layer()),all=allEffects(),onFace=all.some(e=>e.id===cur&&e.fam==='Face');
  return all.filter(e=>e.id!=='fuse'&&(onFace||e.fam!=='Face')).map(e=>({id:e.id,name:e.name,cam:e.f?e.f.id:undefined}));};
const effectLookup=id=>{const e=allEffects().find(x=>x.id===id);return e&&{id:e.id,name:e.name,cam:e.f?e.f.id:undefined};};
const effectId=l=>l.module==='fuse'?(CAMFX[+l.params.f1-1]?'fuse:'+CAMFX[+l.params.f1-1].id:'fuse'):l.module;
function pickEffect(id){const e=effectLookup(id);if(!e)return;if(e.cam)pickCam(e.cam);else replaceModule(layer(),e.id);
  const rc=lsGet('n0ise.recent',[]).filter(x=>x!==id);rc.unshift(id);lsSet('n0ise.recent',rc.slice(0,8));}
function stepEffect(d){const list=effectList(),cur=list.findIndex(e=>e.id===effectId(layer())),n=list[((cur<0?0:cur)+d+list.length)%list.length];pickEffect(n.id);toast(n.name);buzz(12);}
const toggleFav=id=>{const f=lsGet('n0ise.fav',[]),i=f.indexOf(id);if(i<0)f.push(id);else f.splice(i,1);lsSet('n0ise.fav',f);toast(i<0?'Added to favorites':'Removed from favorites');buzz(15);renderInspector();};
async function openIn3D(){
  try{ST.clean=true;await frames2();const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));ST.clean=false;if(!blob)throw new Error('empty');
    await handoffPut(blob,{from:'effects',name:'From Effects'});location.href='studio.html#from=effects';}
  catch(e){ST.clean=false;toast('Couldn’t hand the picture over');}
}
async function takeHandoff(){
  const m=location.hash.match(/^#from=(\w+)/);if(!m)return;const rec=await handoffTake();history.replaceState(null,'',location.pathname+location.search);
  if(!rec){toast('Nothing to open. Send a picture from the other page again.');return;}
  await loadFile(new File([rec.blob],'from-'+m[1]+'.png',{type:rec.blob.type||'image/png'}));toast('Opened from '+(m[1]==='3d'?'3D':m[1]));
}
function dupLayer(){
  const l=layer();if(l.module==='crtlab'){toast('The CRT lab can’t be duplicated');return;}
  const c=JSON.parse(JSON.stringify(l));c.uid=layerUid++;STACK.layers.splice(STACK.sel+1,0,c);STACK.sel++;snap();renderInspector();toast('Layer duplicated');
}
/* a safe variation of the selected layer: every numeric control moves up to 18% of its range */
function mutateLayer(amt=.18){
  const l=layer(),m=MODULES[l.module];if(!m||l.module==='crtlab'){toast('Pick an effect layer to mutate');return;}
  m.params.forEach(p=>{if(p.t!=='r'||typeof l.params[p.k]!=='number'||/^(orig|seed)$/.test(p.k))return;const d=(p.max-p.min)*amt;l.params[p.k]=Math.max(p.min,Math.min(p.max,l.params[p.k]+(Math.random()*2-1)*d));});
  l.seed=(l.seed||0)+1+(Math.random()*40|0);snap();renderInspector();toast('Mutated');buzz(8);
}
function helpSheet(){
  if($('#helpsheet'))return;const sh=el('div','sheet');sh.id='helpsheet';
  const keys=[['Z / Shift+Z','Undo / redo (Cmd or Ctrl)'],['D','Duplicate layer'],['S','Solo layer'],['V','Show or hide layer'],['M','Mutate: a safe variation'],['[ ]','Move layer down / up'],['T','Open Animate'],['Space','Play / pause when animating, else hold to compare'],['← →','Step a frame (Shift: one second)'],['?','This sheet']];
  sh.innerHTML=`<div class="rollbox"><h3>Keys</h3>${keys.map(([a,b])=>`<div class="prrow"><span style="flex:none;min-width:96px;font-weight:700">${a}</span><span>${b}</span></div>`).join('')}<h3 style="margin-top:14px">Make your own look</h3><div class="prrow"><span>1. Pick a base look in Effects.</span></div><div class="prrow"><span>2. Add an effect in Stack, then tap +.</span></div><div class="prrow"><span>3. Choose where it applies in Look, then Apply to…</span></div><button class="btn" id="hsx">Close</button></div>`;
  document.body.appendChild(sh);sh.querySelector('#hsx').addEventListener('click',()=>sh.remove());sh.addEventListener('pointerdown',e=>{if(e.target===sh)sh.remove();});
}
function wireTouch(){
  const stage=$('#stage'),pts=new Map();let t0=0,maxN=0,moved=0,lp=0,avgDx=0,avgDy=0;
  window.__multi=()=>pts.size>1;
  const endHold=()=>{clearTimeout(lp);if(ST.hold){ST.hold=false;const h=$('#hold');h&&h.setAttribute('aria-pressed',false);}};
  stage.addEventListener('pointerdown',e=>{
    if(ST.mpaint||e.pointerType!=='touch'||e.target.closest('button,.srcmenu'))return;
    if(!pts.size){t0=performance.now();maxN=0;moved=0;avgDx=avgDy=0;}
    pts.set(e.pointerId,{x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY});maxN=Math.max(maxN,pts.size);
    clearTimeout(lp);if(pts.size===1)lp=setTimeout(()=>{if(pts.size===1&&moved<10){ST.hold=true;const h=$('#hold');h&&h.setAttribute('aria-pressed',true);buzz(15);}},450);
  });
  stage.addEventListener('pointermove',e=>{const p=pts.get(e.pointerId);if(!p)return;p.x=e.clientX;p.y=e.clientY;
    moved=Math.max(moved,Math.hypot(p.x-p.x0,p.y-p.y0));let sx=0,sy=0;pts.forEach(q=>{sx+=q.x-q.x0;sy+=q.y-q.y0;});avgDx=sx/pts.size;avgDy=sy/pts.size;if(moved>=10)clearTimeout(lp);});
  const up=e=>{
    if(!pts.delete(e.pointerId)||pts.size)return;
    const dur=performance.now()-t0;
    if(ST.hold){endHold();return;}
    if(maxN===2&&dur<350&&moved<14){undo();buzz(10);}
    else if(maxN===3&&Math.abs(avgDx)>50&&Math.abs(avgDx)>Math.abs(avgDy)*1.5)stepEffect(avgDx<0?1:-1);
  };
  stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',e=>{pts.delete(e.pointerId);endHold();});
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  /* one history step per finished gesture, for the whole stack */
  ['pointerup','change'].forEach(ev=>addEventListener(ev,()=>{setTimeout(snap,60);autosave();}));
  /* left-handed layout */
  const lefty=lsGet('n0ise.lefty',false);if(lefty)document.body.dataset.lefty='1';
  /* first-run coach: one dismissable card, three tips */
  if(!lsGet('n0ise.coach',false)&&(document.body.dataset.sheet!==undefined||innerWidth<700)){
    const c=el('div','coach glass',`<b>Quick gestures</b><span>Drag to change it. Tap a look.</span><span>Hold the art to compare the original</span><span>Two-finger tap undoes, three-finger swipe changes effect</span>`);
    const b=el('button','','Got it');b.addEventListener('click',()=>{lsSet('n0ise.coach',true);c.remove();});c.appendChild(b);stage.appendChild(c);const gone=()=>{lsSet('n0ise.coach',true);c.remove();};setTimeout(gone,6000);canvas.addEventListener('pointerdown',gone,{once:true});
  }
}
function toggleLefty(){const on=document.body.dataset.lefty===undefined;if(on)document.body.dataset.lefty='1';else delete document.body.dataset.lefty;lsSet('n0ise.lefty',on);toast(on?'Left-handed layout':'Right-handed layout');}
/* drag on canvas drives the selected module's hero params */
function wireHero(){
  let on=false;
  canvas.addEventListener('pointerdown',e=>{if(ST.paint||ST.mpaint)return;on=true;});
  addEventListener('pointerup',()=>on=false);
  canvas.addEventListener('pointermove',e=>{
    if(!on||ST.paint||!(e.buttons||e.pointerType==='touch')||(window.__multi&&window.__multi()))return;
    const l=layer(),m=MODULES[l.module];const hero=m.schema.hero||[];if(!hero.length)return;
    const r=canvas.getBoundingClientRect(),ux=(e.clientX-r.left)/r.width,uy=1-(e.clientY-r.top)/r.height;
    const V=l.module==='crtlab'?P:l.params,defs=l.module==='crtlab'?CTL:Object.fromEntries(m.params.map(p=>[p.k,p]));
    [ux,uy].forEach((u,i)=>{const k=hero[i];if(!k||!defs[k])return;const p=defs[k];if(p.t&&p.t!=='r'&&p.t!==undefined&&p.t!=='r')return;V[k]=p.min+(p.max-p.min)*Math.min(1,Math.max(0,u));});
  });
}
/* =====================================================================
   Stage 2: artwork-first mobile. Peek = hero scrubber + MODE + effect rail.
   Sheet states: hidden / peek / half / full (transform only).
   ===================================================================== */
/* camera filters as one-tap tiles: tap = replace step 1 of the Fuse recipe */
function pickCam(id){const l=layer();if(l.module!=='fuse'){l.module='fuse';l.params=MODULES.fuse.defaults();for(let s=2;s<=4;s++)l.params['f'+s]=0;}fuseSet(l,1,id);INS.gallery=false;renderInspector();}
function loadRecipeLayer(r){const l=layer();if(l.module!=='fuse'){l.module='fuse';l.params=MODULES.fuse.defaults();}Object.assign(l.params,r.p);INS.gallery=false;renderInspector();}
const camOn=(l,fx)=>l.module==='fuse'&&+l.params.f1===fxIndex(fx.id);
const RAIL_FAMILY={patdith:'Dither',contour:'Lines',ridge:'Lines',dither:'Dither',orb:'Dither',multithr:'Dither',cmyk:'Print',shapes:'Print',stipple:'Print',patmerge:'Print',crusher:'Pixel',pixelmania:'Pixel',ascii:'Glyph',linemod:'Lines',displace:'Glitch',epsilon:'Light',crtlab:'Signal / CRT',fuse:'Mix',psort:'Glitch',mosh:'Glitch',riso:'Print',engrave:'Lines',seccam:'Signal / CRT'};
const RAIL_ORDER=['★ Favorites','Recent','Mine',...UFAM_ORDER];
const THUMBS=new Map();   /* key: module id + source version -> canvas */
function cachedThumb(id){const k=id+'|'+SRC.ver;if(id!=='crtlab'&&THUMBS.has(k))return THUMBS.get(k);const rc=id.startsWith('recipe:')&&loadRecipes().find(r=>'recipe:'+r.id===id);const fx=id.startsWith('fuse:')&&FXBY[id.slice(5)];const c=rc?moduleThumb('fuse',112,84,rc.p):fx?moduleThumb('fuse',112,84,{f1:fxIndex(fx.id),i1:fx.i,m1:fx.m}):moduleThumb(id,112,84);if(id!=='crtlab'){THUMBS.set(k,c);if(THUMBS.size>60)THUMBS.delete(THUMBS.keys().next().value);}return c;}
function heroOf(l){const m=MODULES[l.module],h=(m.schema.hero||[])[0];if(!h)return null;
  if(l.module==='crtlab'){const c=CTL[h];return c&&c.t==='r'?{V:P,p:{k:c.k,label:c.l,min:c.min,max:c.max,step:c.step,t:'r'}}:null;}
  const p=m.params.find(x=>x.k===h);return p&&p.t==='r'?{V:l.params,p}:null;}
function replaceModule(l,id){
  /* tapping an effect swaps it into the layer you are on; CRT Lab is the one effect that can only exist once */
  if(id==='crtlab'){const o=STACK.layers.findIndex(x=>x.module==='crtlab');if(o>=0&&STACK.layers[o]!==l){STACK.sel=o;INS.gallery=false;renderInspector();return;}}
  if(l.module!==id){l.module=id;l.params=MODULES[id].defaults();}
  INS.gallery=false;renderInspector();
}
function cycleMode(l){
  const m=MODULES[l.module];
  if(l.module==='crtlab'){const list=PROFILES.filter(p=>p[0]!=='none'),i=Math.max(0,list.findIndex(p=>p[0]===P.profile));applyProfile(list[(i+1)%list.length][0]);snap();refreshUI();return list[(i+1)%list.length][1];}
  const p=m.params.find(x=>x.t==='c');
  if(p){l.params[p.k]=(+l.params[p.k]+1)%p.opts.length;return p.opts[l.params[p.k]];}
  l.seed=(l.seed+1)%4;return 'Seed '+(l.seed+1);
}
function renderPeek(){
  const host=$i('peek');if(!host)return;[...host.children].forEach(c=>{if(!c.classList.contains('railwrap'))c.remove();});const l=layer(),m=MODULES[l.module];
  /* hero scrubber */
  const h=heroOf(l),sc=el('div','scrub');
  const lab=el('span','sl',h?h.p.label.toUpperCase():'—'),val=el('span','sv','');
  const inp=document.createElement('input');inp.type='range';inp.setAttribute('aria-label',h?h.p.label:'Primary control');
  if(h){inp.min=h.p.min;inp.max=h.p.max;inp.step=h.p.step||1;inp.value=h.V[h.p.k];val.textContent=fmtv(h.p,h.V[h.p.k]);inp.style.setProperty('--p',((h.V[h.p.k]-h.p.min)/(h.p.max-h.p.min)*100)+'%');
    inp.addEventListener('input',()=>{h.V[h.p.k]=+inp.value;val.textContent=fmtv(h.p,+inp.value);inp.style.setProperty('--p',((+inp.value-h.p.min)/(h.p.max-h.p.min)*100)+'%');});
    inp.addEventListener('change',()=>{if(l.module==='crtlab')snap();});}
  else inp.disabled=true;
  sc.append(lab,inp,val);host.insertBefore(sc,host.querySelector('.railwrap'));
  /* MODE */
  const row=el('div','moderow'),mb=el('button','btn mode','MODE 1');
  const label=()=>{const p=l.module==='crtlab'?null:m.params.find(x=>x.t==='c');mb.textContent='MODE '+(p?(+l.params[p.k]+1):(l.module==='crtlab'?(PROFILES.filter(q=>q[0]!=='none').findIndex(q=>q[0]===P.profile)+1||1):(l.seed+1)));};
  label();mb.addEventListener('click',()=>{const n=cycleMode(l);label();toast(n);if(navigator.vibrate)try{navigator.vibrate(6);}catch(e){}});
  row.appendChild(mb);host.insertBefore(row,host.querySelector('.railwrap'));
  /* rail: kept between renders. A selection only moves the highlight; the list is rebuilt only when its contents change. */
  const curId=effectId(l),sig=[SRC.ver,Object.keys(MODULES).length,CAMFX.length,JSON.stringify(lsGet('n0ise.fav',[])),JSON.stringify(lsGet('n0ise.recent',[])),loadRecipes().map(r=>r.id).join()].join('|');
  const oldW=host.querySelector('.railwrap');
  const press=(rl)=>{const ts=[...rl.querySelectorAll('.rtile')];ts.forEach(t=>t.setAttribute('aria-pressed',t._fx?camOn(l,t._fx):t._rec?false:t._id===l.module));
    if(ts.some(t=>t._fx&&t.getAttribute('aria-pressed')==='true'))ts.forEach(t=>{if(!t._fx&&t._id==='fuse')t.setAttribute('aria-pressed',false);});
    if(RAIL.cur!==curId){RAIL.cur=curId;const s=rl.querySelector('[aria-pressed=true]');if(s&&document.body.dataset.sheet===undefined&&document.body.dataset.side===undefined){/* in the sheet the tile stays where it is: scrolling the list under the user's thumb is worse than a highlight */}}};
  if(oldW&&oldW._sig===sig){press(oldW._rail);return;}
  const prevScroll=oldW?oldW._rail.scrollLeft:null;if(oldW)oldW.remove();
  const wrap=el('div','railwrap'),rail=el('div','rail');wrap._sig=sig;
  const groups={};allEffects().forEach(e=>{(groups[e.fam]=groups[e.fam]||[]).push(e.m?e.m:{id:e.id,name:e.name,fx:e.f});});
  {const all=effectList(),by=Object.fromEntries(all.map(e=>[e.id,e])),mk=id=>{const e=by[id];if(!e)return null;const f=e.cam&&FXBY[e.cam];return f?{id:e.id,name:e.name,fx:f}:MODULES[e.id];};
   const fav=lsGet('n0ise.fav',[]).map(mk).filter(Boolean),rcn=lsGet('n0ise.recent',[]).map(mk).filter(Boolean);
   const recs=loadRecipes();if(recs.length)groups['Mine']=recs.map(r=>({id:'recipe:'+r.id,name:r.name,rec:r})).concat(groups['Mine']||[]);
   if(fav.length)groups['★ Favorites']=fav;if(rcn.length)groups['Recent']=rcn;}
  const io='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const t=e.target;io.unobserve(t);requestAnimationFrame(()=>{if(!t._id)return;const c=cachedThumb(t._id);c.className='rt';t.replaceChild(c,t.firstChild);});}}),{root:$i('dock'),rootMargin:'300px 0px'}):null;
  RAIL_ORDER.filter(f=>groups[f]).concat(Object.keys(groups).filter(f=>!RAIL_ORDER.includes(f))).forEach(f=>{
    const g=el('div','rg');g.dataset.f=f;g.appendChild(el('div','rgl',f));const row=el('div','rgt');
    groups[f].forEach(x=>{
      const t=el('button','rtile');t.setAttribute('aria-pressed',x.fx?camOn(l,x.fx):x.id===l.module);t.title=x.name;
      const ph=el('canvas','rt');ph.width=112;ph.height=84;t.append(ph,el('span','',x.name));t._id=x.id;t._fx=x.fx||null;t._rec=!!x.rec;
      let lpT=0,lpDone=false;t.addEventListener('pointerdown',()=>{lpDone=false;lpT=setTimeout(()=>{lpDone=true;toggleFav(x.id);},520);});['pointerup','pointerleave','pointercancel'].forEach(ev=>t.addEventListener(ev,()=>clearTimeout(lpT)));
      t.addEventListener('contextmenu',e=>e.preventDefault());
      if(lsGet('n0ise.fav',[]).includes(x.id))t.appendChild(el('i','star','★'));
      t.addEventListener('click',()=>{if(lpDone)return;if(x.rec){loadRecipeLayer(x.rec);}else pickEffect(x.id);buzz(5);});
      row.appendChild(t);io?io.observe(t):(t.replaceChild(Object.assign(cachedThumb(x.id),{className:'rt'}),ph));});
    g.appendChild(row);rail.appendChild(g);});
  const tabs=el('div','railtabs');wrap._rail=rail;
  {const gs=[...rail.querySelectorAll('.rg')];if(!gs.some(g=>g.dataset.f===RAIL.fam))RAIL.fam=gs[0]&&gs[0].dataset.f;
   const show=f=>{RAIL.fam=f;gs.forEach(g=>{g.hidden=g.dataset.f!==f;});[...tabs.children].forEach(b=>b.setAttribute('aria-pressed',b._g.dataset.f===f));};
   gs.forEach(g=>{const b=el('button','',g.dataset.f.replace('★ ','★'));b.addEventListener('click',()=>{show(g.dataset.f);buzz(5);const d=$i('dock');if(d)d.scrollTop=0;});b._g=g;tabs.appendChild(b);});
   show(RAIL.fam);}
  wrap.append(tabs,rail);host.appendChild(wrap);
  press(rail);
  RAIL.cur=curId;
}
const RAIL={cur:'',fam:''};
/* the sheet never rises past halfway: the art keeps the top half, the sheet's own content scrolls */
const SHEET={s:1,vis:()=>{const h=Math.round(innerHeight*.5);return[26,Math.min(222,h-60),h,h];}};
function wireSheet(){
  const dock=$i('dock'),grab=$i('grab'),app=document.querySelector('.app');
  const mqS=matchMedia('(max-width:640px),(pointer:coarse) and (max-width:900px)'),mqL=matchMedia('(orientation:landscape) and (max-height:520px)');
  const full=()=>Math.round(innerHeight*.5),mainEl=document.querySelector('main');
  const live=ty=>{ST.freeze=performance.now()+520;app.style.setProperty('--stagepad',Math.max(0,full()-ty)+'px');};
  const apply=(s,anim=true)=>{SHEET.s=s;const v=SHEET.vis()[s];dock.style.setProperty('--sheet',full()+'px');dock.style.transition=anim?'transform .26s cubic-bezier(.2,.8,.2,1)':'none';
    ST.freeze=performance.now()+520;mainEl.style.transition='';dock.style.setProperty('--ty',(full()-v)+'px');app.style.setProperty('--stagepad',v+'px');dock.dataset.state=['hidden','peek','half','full'][s];if(s>=2)renderInspector();};
  SHEET.apply=apply;
  let y0=0,t0=0,ty0=0,drag=false,moved=false;
  grab.addEventListener('pointerdown',e=>{drag=true;moved=false;y0=e.clientY;t0=performance.now();ty0=parseFloat(dock.style.getPropertyValue('--ty'))||0;grab.setPointerCapture(e.pointerId);dock.style.transition='none';});
  grab.addEventListener('pointermove',e=>{if(!drag)return;if(Math.abs(e.clientY-y0)>4)moved=true;mainEl.style.transition='none';const ty=Math.max(0,Math.min(full()-SHEET.vis()[0],ty0+e.clientY-y0));dock.style.setProperty('--ty',ty+'px');live(ty);});
  const settle=(cy)=>{const ty=parseFloat(dock.style.getPropertyValue('--ty')),v=(cy-y0)/Math.max(1,performance.now()-t0),shown=full()-ty-v*140;
    let best=0,bd=1e9;SHEET.vis().forEach((f,i)=>{const d=Math.abs(f-shown);if(d<bd){bd=d;best=i;}});apply(best);buzz(6);};
  grab.addEventListener('pointerup',e=>{if(!drag)return;drag=false;
    if(!moved){apply(SHEET.s===1?2:1);return;}
    settle(e.clientY);});
  /* swipe the sheet from anywhere: a vertical drag that starts on content (not a slider, field or canvas) moves the sheet when the list is at its top.
     Down lowers it; up raises it from the preview strip. Locks to vertical after 8px so horizontal rails and text selection keep working. */
  let bt=null;
  const NODRAG='input,textarea,select,canvas,svg,.l,.grab,[contenteditable]';
  dock.addEventListener('touchstart',e=>{
    if(document.body.dataset.sheet===undefined||e.touches.length!==1||e.target.closest(NODRAG)||getSelection().toString()){bt=null;return;}
    const t=e.touches[0];bt={x:t.clientX,y:t.clientY,lock:0};},{passive:true});
  dock.addEventListener('touchmove',e=>{
    if(!bt||e.touches.length!==1)return;const t=e.touches[0],dx=t.clientX-bt.x,dy=t.clientY-bt.y;
    if(!bt.lock){
      if(Math.hypot(dx,dy)<8)return;
      const vert=Math.abs(dy)>Math.abs(dx)*1.2,atTop=dock.scrollTop<=0;
      if(vert&&((dy>0&&atTop)||(dy<0&&SHEET.s<2))){bt.lock=1;y0=t.clientY;t0=performance.now();ty0=parseFloat(dock.style.getPropertyValue('--ty'))||0;dock.style.transition='none';mainEl.style.transition='none';}
      else{bt.lock=-1;return;}}
    if(bt.lock!==1)return;
    if(e.cancelable)e.preventDefault();
    {const ty=Math.max(0,Math.min(full()-SHEET.vis()[0],ty0+t.clientY-y0));dock.style.setProperty('--ty',ty+'px');live(ty);}},{passive:false});
  const tEnd=e=>{if(bt&&bt.lock===1){const t=e.changedTouches[0];settle(t?t.clientY:y0);}bt=null;};
  dock.addEventListener('touchend',tEnd);dock.addEventListener('touchcancel',tEnd);
  grab.addEventListener('keydown',e=>{if(e.key==='ArrowUp')apply(Math.min(2,SHEET.s+1));if(e.key==='ArrowDown')apply(Math.max(0,SHEET.s-1));});
  grab.tabIndex=0;grab.setAttribute('role','button');
  /* keyboard: lift the sheet above the virtual keyboard */
  const vv=window.visualViewport;
  const kb=()=>{if(!vv||!mqS.matches)return;const k=Math.max(0,innerHeight-vv.height-vv.offsetTop);dock.style.setProperty('--kb',(k>80?k:0)+'px');};
  if(vv){vv.addEventListener('resize',kb);vv.addEventListener('scroll',kb);}
  dock.addEventListener('focusin',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&SHEET.s<2)apply(2);setTimeout(()=>{try{e.target.scrollIntoView({block:'center',behavior:'smooth'});}catch(_){}},250);});
  const upd=()=>{if(mqS.matches&&mqL.matches)document.body.dataset.side='1';else delete document.body.dataset.side;
    if(mqS.matches&&!mqL.matches){document.body.dataset.sheet='1';apply(SHEET.s,false);}
    else{delete document.body.dataset.sheet;dock.style.removeProperty('--ty');dock.style.removeProperty('--sheet');app.style.removeProperty('--stagepad');}};
  mqS.addEventListener('change',upd);mqL.addEventListener('change',upd);addEventListener('resize',upd);upd();
  /* art-only toggle and source menu */
  const close=$i('artonly');if(close)close.addEventListener('click',()=>apply(SHEET.s===0?1:0));
  const sm=$i('srcchip'),menu=$i('srcmenu');
  if(sm){sm.addEventListener('click',()=>{menu.hidden=!menu.hidden;});
    menu.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;menu.hidden=true;const a=b.dataset.a;
      if(a==='open')$i('open').click();else if(a==='audio'){let fi=$('#audfile');if(!fi){fi=document.createElement('input');fi.type='file';fi.id='audfile';fi.accept='audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac';fi.hidden=true;fi.addEventListener('change',()=>{const f=fi.files[0];fi.value='';if(f)startAudio(f);});document.body.appendChild(fi);}fi.click();}else if(a==='cam')openCamera();else if(a==='rec')$i('rec').click();
      else if(a==='demo'){setSource(demoCanvas(),'Demo');refreshUI();}else if(a==='test'){setSource(testCanvas(),'Test');refreshUI();}});}
}
(function boot(){
  applyProfile('studio');
  ST.pwrT0=now();
  buildUI();reorderBitmap();wire();
  if(GLOK){
    try{
      initGL();initLUT();
      setSource(demoCanvas(),'Demo');
    }catch(e){console.error(e);noGL('Setup failed: '+String(e.message||e).slice(0,500));}
  }
  lastSnap=JSON.stringify(P);
  refreshUI();
  setSkin((()=>{try{return localStorage.getItem('n0ise.skin');}catch(e){return null;}})()||'lab');
  if('serviceWorker' in navigator&&/^https?:/.test(location.protocol)&&location.hostname!=='')navigator.serviceWorker.register('sw.js').catch(()=>{});
  loadStackHash();loadFuseHash();wireMaskPaint();wireHero();wireTouch();wireSheet();renderInspector();
  requestAnimationFrame(loop);
  if(new URLSearchParams(location.search).get('bench'))setTimeout(runBench,600);
  if(new URLSearchParams(location.search).get('cam'))setTimeout(()=>showCamGate('Allow the camera, then pick a camera body: CCTV, disposable, Super 8, instant and more.',true),300);
})();
/* test hook (read-only use from the console and tools/) */
/* Short regression test for compositing, run from the console: await __n0.regress(). Stateless modules only, deterministic frames (ST.clean turns Alive off). */
async function regress(){
  const res=[],keep={L:STACK.layers,sel:STACK.sel,clean:ST.clean},px=new Uint8Array(4);
  const frame=(t=1.25)=>{ST.clean=true;V.sizeKey=V.sizeKey;renderStack(t,1/30);const w=canvas.width,h=canvas.height,buf=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);return buf;};
  const same=(a,b)=>{if(a.length!==b.length)return[false,'size'];let m=0,sum=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>m)m=d;sum+=d;}return[m<=3,'max '+m+' mean '+(sum/(a.length/4)).toFixed(3)];};
  const mk=(ids,fn)=>{STACK.layers=ids.map(i=>mkLayer(i));fn&&fn(STACK.layers);STACK.sel=0;};
  const T=(name,ok,d)=>res.push({name,pass:!!ok,detail:d});
  try{
    mk(['dither','kaleido']);frame();const f1=frame(),f2=frame();let r=same(f1,f2);T('same time, same pixels',r[0],r[1]);
    mk(['kaleido','dither']);const fr=frame();r=same(f1,fr);T('order changes the picture',!r[0],r[1]);
    mk(['dither','kaleido'],L=>{L[1].visible=false;});const fh=frame();mk(['dither']);const fo=frame();r=same(fh,fo);T('hidden layer equals removed layer',r[0],r[1]);
    mk(['dither','kaleido'],L=>{L[1].opacity=0;});const f0=frame();r=same(f0,fo);T('opacity 0 equals removed layer',r[0],r[1]);
    mk(['dither','kaleido'],L=>{L[1].solo=true;});const fs=frame();mk(['kaleido']);const fk=frame();r=same(fs,fk);T('solo equals that layer alone',r[0],r[1]);
    mk(['dither','kaleido']);const a=frame();const j=currentRecipe('regress');applyRecipe(j);const b=frame();r=same(a,b);T('project save then restore gives the same frame',r[0],r[1]);
    mk(['dither','kaleido']);const pv=frame();const blob=await new Promise(rs=>canvas.toBlob(rs,'image/png'));
    ST.clean=true;renderStack(1.25,1/30);const blob2=await new Promise(rs=>canvas.toBlob(rs,'image/png'));
    const dec=async bl=>{const bm=await createImageBitmap(bl),c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;const g=c.getContext('2d');g.drawImage(bm,0,0);return g.getImageData(0,0,c.width,c.height).data;};
    const png=await dec(blob2);T('png export size matches the preview',png.length===pv.length,png.length+' vs '+pv.length);
    // PNG rows are top-down, readPixels rows are bottom-up
    const w=canvas.width,h=canvas.height;let mx=0;for(let y=0;y<h;y+=7)for(let x=0;x<w;x+=7){const i=(y*w+x)*4,k=((h-1-y)*w+x)*4;mx=Math.max(mx,Math.abs(png[i]-pv[k])+Math.abs(png[i+1]-pv[k+1])+Math.abs(png[i+2]-pv[k+2]));}
    T('png export pixels match the preview (tolerance 6)',mx<=6,'max '+mx);
  }catch(e){T('test run',false,String(e&&e.message||e));}
  STACK.layers=keep.L;STACK.sel=keep.sel;ST.clean=keep.clean;V.sizeKey='';
  return res;
}
window.__n0={AUD,syntheticPerson,compareMasks,QUAL,PERSON,setMaskQuality,idleApply,regress,idleRestore,ED,IDLE,TLN,camRecorder,fxRecorder,openCamera,applyCam,CAMS,CAMFX,fxIndex,SHEET,applyRecipe,currentRecipe,toRecipe,fromRecipe,modParams,updateSignals,SIG,runModuleGate,showSheet,STACK,mkLayer,MODULES,PERSON,DRAWN,setSource,syntheticPerson,renderStack,renderFrame,P,V,ST,SRC,TEX,maskFor,startPerson,loadPerson,renderInspector,layout};
{const v=lsGet('n0ise.alive',null);IDLE.on=v?v==='on':!IDLE.reduce;}
TLN.mount(document.body);ED.mount();setTimeout(takeHandoff,900);
ED.onExport=()=>{
  if(fxRecorder.busy||!ED.active())return;toast('Exporting at normal speed. Keep this tab open.',4000);
  fxRecorder.start({canvas,fps:30,audioStream:ED.audioStream(),
    begin:()=>{ST.clean=true;ED.setExporting(true);ED.seek(0);ED.play(true);},
    end:()=>{ST.clean=false;ED.setExporting(false);ED.play(false);},
    onDone:async r=>{deliver(r.blob,`${stamp()}.${r.ext}`,true);}});
  ED.onEnd=()=>{if(fxRecorder.state==='recording')fxRecorder.stop('user');};
};{const b=document.getElementById('tlbtn');if(b)b.addEventListener('click',()=>TLN.show());}
