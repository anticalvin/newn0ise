/* Material graph: a small Substance-style node editor. Procedural, tileable textures are built from generator and filter nodes and wired into a
   Material output (base colour, metallic, roughness, normal, height, emission, opacity). The graph runs on the CPU at a modest size so it works
   everywhere, caches every node, and only recomputes what changed. The result becomes real texture maps on the selected object, and is saved
   with the scene as plain JSON. The engine at the top has no DOM in it, so it can be tested on its own. */

/* ---------------- engine ---------------- */
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x;
const mix=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{const t=clamp((x-a)/((b-a)||1e-6));return t*t*(3-2*t);};
const img=n=>({n,d:new Float32Array(n*n*3)});
function h2(x,y,s){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
const fade=t=>t*t*t*(t*(t*6-15)+10);
function pnoise(u,v,f,s){
  const x=u*f,y=v*f,xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const g=(ix,iy)=>{const a=h2(((ix%f)+f)%f,((iy%f)+f)%f,s)*6.2831853;return Math.cos(a)*(x-ix)+Math.sin(a)*(y-iy);};
  const a=fade(xf),b=fade(yf),t0=mix(g(xi,yi),g(xi+1,yi),a),t1=mix(g(xi,yi+1),g(xi+1,yi+1),a);
  return mix(t0,t1,b);
}
function fbm(u,v,f,oct,gain,s){let a=1,sum=0,tot=0,fr=Math.max(1,Math.round(f));for(let o=0;o<oct;o++){sum+=pnoise(u,v,fr,s+o*13)*a;tot+=a;a*=gain;fr*=2;}return clamp(.5+sum/tot*1.35);}
function gen(n,f){const o=img(n),d=o.d;let i=0;for(let y=0;y<n;y++){const v=y/n;for(let x=0;x<n;x++){const r=f(x/n,v);d[i++]=r;d[i++]=r;d[i++]=r;}}return o;}
const GR=new WeakMap();
function gray(im){let g=GR.get(im);if(g)return g;const n=im.n*im.n;g=new Float32Array(n);const d=im.d;for(let i=0;i<n;i++)g[i]=d[i*3]*.299+d[i*3+1]*.587+d[i*3+2]*.114;GR.set(im,g);return g;}
function bil(g,n,u,v){ // wrapped bilinear sample of a gray array
  const x=(u-Math.floor(u))*n-.5,y=(v-Math.floor(v))*n-.5,xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi;
  const w=i=>((i%n)+n)%n,a=w(xi),b=w(xi+1),c=w(yi),e=w(yi+1);
  return mix(mix(g[c*n+a],g[c*n+b],fx),mix(g[e*n+a],g[e*n+b],fx),fy);
}
function hsl2rgb(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h*6)%2-1)),m=l-c/2;let r=0,g=0,b=0;const k=Math.floor(h*6)%6;if(k===0){r=c;g=x;}else if(k===1){r=x;g=c;}else if(k===2){g=c;b=x;}else if(k===3){g=x;b=c;}else if(k===4){r=x;b=c;}else{r=c;b=x;}return [r+m,g+m,b+m];}
function rgb2hsl(r,g,b){const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4);h/=6;}return [h,s,l];}
const hexRGB=h=>{const v=parseInt(String(h||'#000').replace('#','').padEnd(6,'0').slice(0,6),16);return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255];};
function blurCh(src,n,r,dst){ // box blur one channel with wrap, horizontal then vertical
  if(r<1){dst.set(src);return;}
  const tmp=new Float32Array(n*n),k=2*r+1;
  for(let y=0;y<n;y++){let s=0;for(let x=-r;x<=r;x++)s+=src[y*n+((x%n)+n)%n];for(let x=0;x<n;x++){tmp[y*n+x]=s/k;s+=src[y*n+((x+r+1)%n)]-src[y*n+(((x-r)%n)+n)%n];}}
  for(let x=0;x<n;x++){let s=0;for(let y=-r;y<=r;y++)s+=tmp[(((y%n)+n)%n)*n+x];for(let y=0;y<n;y++){dst[y*n+x]=s/k;s+=tmp[((y+r+1)%n)*n+x]-tmp[(((y-r)%n)+n)%n*n+x];}}
}
function slopes(im,n,strength){ // height -> tangent-space normal map
  const g=gray(im),o=img(n),d=o.d,w=i=>((i%n)+n)%n;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const gx=(g[y*n+w(x+1)]-g[y*n+w(x-1)])*strength*n/256,gy=(g[w(y+1)*n+x]-g[w(y-1)*n+x])*strength*n/256;
    const l=Math.hypot(gx,gy,1),i=(y*n+x)*3;d[i]=.5-gx/l*.5;d[i+1]=.5+gy/l*.5;d[i+2]=.5+.5/l;
  }
  return o;
}
const S=(k,l,min,max,step,def)=>({k,l,t:'s',min,max,step,def});
const E=(k,l,opts,def)=>({k,l,t:'e',opts,def});
const C=(k,l,def)=>({k,l,t:'c',def});
const BLEND=[['mix','Mix'],['add','Add'],['sub','Subtract'],['mul','Multiply'],['screen','Screen'],['overlay','Overlay'],['max','Lighter'],['min','Darker'],['diff','Difference']];
const per=(im,f)=>{const o=img(im.n),a=im.d,d=o.d;for(let i=0;i<a.length;i++)d[i]=f(a[i]);return o;};
export const NODES={
  noise:{name:'Noise',cat:'Generate',in:[],p:[S('scale','Scale',1,32,1,6),S('oct','Detail',1,8,1,5),S('gain','Roughness',.2,.8,.01,.5),S('seed','Seed',0,99,1,1)],
    f:(I,p,n)=>gen(n,(u,v)=>fbm(u,v,p.scale,p.oct,p.gain,p.seed))},
  cells:{name:'Cells',cat:'Generate',in:[],p:[S('scale','Scale',1,32,1,6),E('mode','Output',[['cells','Cells'],['dist','Distance'],['edges','Edges']],'cells'),S('w','Edge width',.02,.6,.01,.15),S('jit','Randomness',0,1,.01,1),S('seed','Seed',0,99,1,1)],
    f:(I,p,n)=>{const f=Math.max(1,Math.round(p.scale)),px=new Float32Array(f*f),py=new Float32Array(f*f);
      for(let j=0;j<f;j++)for(let i=0;i<f;i++){px[j*f+i]=.5+(h2(i,j,p.seed)-.5)*p.jit;py[j*f+i]=.5+(h2(i,j,p.seed+31)-.5)*p.jit;}
      return gen(n,(u,v)=>{const x=u*f,y=v*f,ci=Math.floor(x),cj=Math.floor(y);let d1=9,d2=9,id=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const ii=ci+dx,jj=cj+dy,wi=((ii%f)+f)%f,wj=((jj%f)+f)%f,d=Math.hypot(x-(ii+px[wj*f+wi]),y-(jj+py[wj*f+wi]));if(d<d1){d2=d1;d1=d;id=h2(wi,wj,p.seed+7);}else if(d<d2)d2=d;}
        return p.mode==='cells'?id:p.mode==='dist'?clamp(1-d1*1.15):ss(0,p.w,d2-d1);});}},
  bricks:{name:'Bricks',cat:'Generate',in:[],p:[S('cols','Columns',1,16,1,5),S('rows','Rows',1,16,1,6),S('mortar','Mortar',0,.4,.01,.08),S('bevel','Edge softness',0,.4,.01,.08),S('tone','Brick variation',0,1,.01,.5),S('seed','Seed',0,99,1,3)],
    f:(I,p,n)=>{const C2=Math.round(p.cols),R=Math.round(p.rows)*2;return gen(n,(u,v)=>{const row=Math.floor(v*R),off=(row%2)*.5/C2,cu=(u+off)*C2,fx=cu-Math.floor(cu),fy=v*R-row;
      const dx=Math.min(fx,1-fx)/C2,dy=Math.min(fy,1-fy)/R,e=Math.min(dx,dy),mw=p.mortar/R,h=ss(mw,mw+Math.max(.0005,p.bevel/R),e);
      const id=h2(((Math.floor(cu)%C2)+C2)%C2,row,p.seed);return h*(1-p.tone*id*.8)*.8+h*.2;});}},
  checker:{name:'Checker',cat:'Generate',in:[],p:[S('c','Squares',1,32,1,8)],f:(I,p,n)=>gen(n,(u,v)=>((Math.floor(u*p.c)+Math.floor(v*p.c))&1))},
  gradient:{name:'Gradient',cat:'Generate',in:[],p:[E('mode','Shape',[['lin','Linear'],['rad','Radial'],['ang','Angle'],['mir','Mirror']],'lin'),S('a','Angle',0,360,1,0)],
    f:(I,p,n)=>{const a=p.a*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return gen(n,(u,v)=>{if(p.mode==='rad')return clamp(Math.hypot(u-.5,v-.5)*2);if(p.mode==='ang')return (Math.atan2(v-.5,u-.5)/6.2831853+.5+p.a/360)%1;const t=clamp((u-.5)*c+(v-.5)*s+.5);return p.mode==='mir'?Math.abs(t*2-1):t;});}},
  waves:{name:'Waves',cat:'Generate',in:[],p:[S('f','Frequency',1,32,1,8),S('a','Angle',0,180,1,90),E('shape','Shape',[['sine','Sine'],['saw','Saw'],['tri','Triangle']],'sine'),S('warp','Wobble',0,1,.01,0),S('seed','Seed',0,99,1,2)],
    f:(I,p,n)=>{const a=p.a*Math.PI/180,fx=Math.round(p.f*Math.cos(a)),fy=Math.round(p.f*Math.sin(a));return gen(n,(u,v)=>{const w=p.warp?(fbm(u,v,3,4,.5,p.seed)-.5)*p.warp*2.2:0,t=u*fx+v*fy+w;
      return p.shape==='sine'?.5+.5*Math.sin(6.2831853*t):p.shape==='saw'?t-Math.floor(t):Math.abs((t-Math.floor(t))*2-1);});}},
  dots:{name:'Dots',cat:'Generate',in:[],p:[S('c','Count',1,32,1,8),S('r','Size',.05,.7,.01,.35),S('soft','Softness',0,.5,.01,.04)],
    f:(I,p,n)=>gen(n,(u,v)=>{const fu=u*p.c%1,fv=v*p.c%1,d=Math.hypot(fu-.5,fv-.5);return 1-ss(p.r-p.soft,p.r,d);})},
  value:{name:'Grey value',cat:'Generate',in:[],p:[S('v','Value',0,1,.01,.5)],f:(I,p,n)=>gen(n,()=>p.v)},
  color:{name:'Colour',cat:'Generate',in:[],p:[C('c','Colour','#c98a4a')],f:(I,p,n)=>{const o=img(n),c=hexRGB(p.c);for(let i=0;i<n*n;i++){o.d[i*3]=c[0];o.d[i*3+1]=c[1];o.d[i*3+2]=c[2];}return o;}},
  levels:{name:'Levels',cat:'Adjust',in:['in'],p:[S('lo','Black point',0,1,.01,0),S('hi','White point',0,1,.01,1),S('g','Midtones',.2,3,.01,1),S('ol','Out black',0,1,.01,0),S('oh','Out white',0,1,.01,1)],
    f:(I,p,n)=>I[0]?per(I[0],x=>mix(p.ol,p.oh,Math.pow(clamp((x-p.lo)/((p.hi-p.lo)||1e-4)),1/p.g))):img(n)},
  invert:{name:'Invert',cat:'Adjust',in:['in'],p:[],f:(I,p,n)=>I[0]?per(I[0],x=>1-x):img(n)},
  ramp:{name:'Colour ramp',cat:'Adjust',in:['in'],p:[C('c1','Shadows','#1c120c'),C('c2','Middle','#8a5a34'),C('c3','Highlights','#f0d6b0'),S('mid','Middle at',.05,.95,.01,.5)],
    f:(I,p,n)=>{const o=img(n);if(!I[0])return o;const g=gray(I[0]),a=hexRGB(p.c1),b=hexRGB(p.c2),c=hexRGB(p.c3),d=o.d;for(let i=0;i<n*n;i++){const t=g[i],x=t<p.mid?t/p.mid:(t-p.mid)/(1-p.mid),A=t<p.mid?a:b,B=t<p.mid?b:c;for(let k=0;k<3;k++)d[i*3+k]=mix(A[k],B[k],clamp(x));}return o;}},
  hsl:{name:'Hue and saturation',cat:'Adjust',in:['in'],p:[S('h','Hue shift',-.5,.5,.01,0),S('s','Saturation',0,2,.01,1),S('l','Brightness',-.5,.5,.01,0)],
    f:(I,p,n)=>{const o=img(n);if(!I[0])return o;const a=I[0].d,d=o.d;for(let i=0;i<n*n;i++){const [h,s,l]=rgb2hsl(a[i*3],a[i*3+1],a[i*3+2]),r=hsl2rgb(((h+p.h)%1+1)%1,clamp(s*p.s),clamp(l+p.l));d[i*3]=r[0];d[i*3+1]=r[1];d[i*3+2]=r[2];}return o;}},
  thresh:{name:'Threshold',cat:'Adjust',in:['in'],p:[S('t','Level',0,1,.01,.5),S('soft','Softness',0,.5,.01,.02)],f:(I,p,n)=>I[0]?per(I[0],x=>ss(p.t-p.soft,p.t+p.soft+1e-4,x)):img(n)},
  poster:{name:'Posterize',cat:'Adjust',in:['in'],p:[S('k','Steps',2,12,1,4)],f:(I,p,n)=>I[0]?per(I[0],x=>Math.min(1,Math.floor(x*p.k)/(p.k-1))):img(n)},
  blend:{name:'Blend',cat:'Combine',in:['a','b','mask'],p:[E('m','Mode',BLEND,'mix'),S('amt','Amount',0,1,.01,1)],
    f:(I,p,n)=>{const o=img(n),A=I[0],B=I[1],M=I[2]?gray(I[2]):null,d=o.d;for(let i=0;i<n*n;i++){const t=p.amt*(M?M[i]:1);for(let k=0;k<3;k++){const a=A?A.d[i*3+k]:0,b=B?B.d[i*3+k]:0;let r;
      switch(p.m){case'add':r=a+b;break;case'sub':r=a-b;break;case'mul':r=a*b;break;case'screen':r=1-(1-a)*(1-b);break;case'overlay':r=a<.5?2*a*b:1-2*(1-a)*(1-b);break;case'max':r=Math.max(a,b);break;case'min':r=Math.min(a,b);break;case'diff':r=Math.abs(a-b);break;default:r=b;}
      d[i*3+k]=clamp(mix(a,r,t));}}return o;}},
  blur:{name:'Blur',cat:'Filter',in:['in'],p:[S('r','Radius',0,24,1,4)],
    f:(I,p,n)=>{const o=img(n);if(!I[0])return o;const r=Math.max(0,Math.round(p.r*n/256)),a=new Float32Array(n*n),b=new Float32Array(n*n);for(let k=0;k<3;k++){for(let i=0;i<n*n;i++)a[i]=I[0].d[i*3+k];blurCh(a,n,r,b);blurCh(b,n,r,a);for(let i=0;i<n*n;i++)o.d[i*3+k]=a[i];}return o;}},
  warp:{name:'Warp',cat:'Filter',in:['in','by'],p:[S('amt','Amount',0,.4,.005,.08)],
    f:(I,p,n)=>{const o=img(n);if(!I[0]||!I[1])return I[0]||o;const by=gray(I[1]),ch=[0,1,2].map(k=>{const g=new Float32Array(n*n);for(let i=0;i<n*n;i++)g[i]=I[0].d[i*3+k];return g;});
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/n,v=y/n,du=(bil(by,n,u,v)-.5)*p.amt*2,dv=(bil(by,n,u+.37,v+.21)-.5)*p.amt*2,i=(y*n+x)*3;for(let k=0;k<3;k++)o.d[i+k]=bil(ch[k],n,u+du,v+dv);}return o;}},
  edge:{name:'Edges',cat:'Filter',in:['in'],p:[S('k','Strength',.2,8,.1,2)],
    f:(I,p,n)=>{if(!I[0])return img(n);const g=gray(I[0]),w=i=>((i%n)+n)%n;return gen(n,(u,v)=>{const x=Math.floor(u*n),y=Math.floor(v*n),gx=g[y*n+w(x+1)]-g[y*n+w(x-1)],gy=g[w(y+1)*n+x]-g[w(y-1)*n+x];return clamp(Math.hypot(gx,gy)*p.k*n/64);});}},
  normal:{name:'Height to normal',cat:'Filter',in:['height'],p:[S('k','Strength',0,24,.1,6)],f:(I,p,n)=>I[0]?slopes(I[0],n,p.k):img(n)},
  tile:{name:'Tile and offset',cat:'Filter',in:['in'],p:[S('x','Repeat X',1,8,1,2),S('y','Repeat Y',1,8,1,2),S('ox','Offset X',0,1,.01,0),S('oy','Offset Y',0,1,.01,0)],
    f:(I,p,n)=>{const o=img(n);if(!I[0])return o;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=((x/n*p.x+p.ox)%1+1)%1,v=((y/n*p.y+p.oy)%1+1)%1,sx=Math.min(n-1,Math.floor(u*n)),sy=Math.min(n-1,Math.floor(v*n)),i=(y*n+x)*3,j=(sy*n+sx)*3;o.d[i]=I[0].d[j];o.d[i+1]=I[0].d[j+1];o.d[i+2]=I[0].d[j+2];}return o;}},
  out:{name:'Material',cat:'Output',in:['base','metal','rough','normal','height','emit','alpha'],
    p:[C('baseC','Base colour (unplugged)','#c9c5bd'),S('metal','Metallic (unplugged)',0,1,.01,0),S('rough','Roughness (unplugged)',0,1,.01,.5),S('tile','Texture repeat',1,8,.5,1),S('bump','Height depth',0,2,.01,.4),S('nk','Normal strength',0,3,.01,1),S('ek','Glow amount',0,4,.05,1)],f:()=>null}
};
export const CATS=['Generate','Adjust','Combine','Filter'];
export const defaults=t=>{const o={};(NODES[t]?NODES[t].p:[]).forEach(q=>{o[q.k]=q.def;});return o;};
/* graph = {nodes:{id:{t,x,y,p,in:[id|null,...]}},n:counter} */
export function newGraph(){return {nodes:{out:{t:'out',x:620,y:120,p:defaults('out'),in:[null,null,null,null,null,null,null]}},n:1};}
export function addNode(g,t,x,y,p){const id='n'+(g.n++);g.nodes[id]={t,x,y,p:{...defaults(t),...(p||{})},in:(NODES[t].in||[]).map(()=>null)};return id;}
export function reaches(g,from,target){const seen=new Set(),st=[from];while(st.length){const id=st.pop();if(id===target)return true;if(seen.has(id))continue;seen.add(id);(g.nodes[id]?.in||[]).forEach(s=>s&&st.push(s));}return false;}
export function canConnect(g,src,dst){return src!==dst&&!reaches(g,src,dst);}
function sig(g,id,memo){if(memo[id]!=null)return memo[id];const nd=g.nodes[id];memo[id]='';const s=nd.t+JSON.stringify(nd.p)+'('+nd.in.map(x=>x&&g.nodes[x]?sig(g,x,memo):'-').join(',')+')';return memo[id]=s;}
export function createEval(){
  const cache=new Map();
  return function run(g,N){
    const memo={},res={},get=id=>{
      if(res[id]!==undefined)return res[id];
      const nd=g.nodes[id];if(!nd||nd.t==='out'){return res[id]=null;}
      const k=N+'|'+sig(g,id,memo);let e=cache.get(k);
      if(!e){const I=nd.in.map(s=>s&&g.nodes[s]?get(s):null);e={im:NODES[nd.t].f(I,nd.p,N),k};cache.set(k,e);if(cache.size>120)cache.delete(cache.keys().next().value);}
      res[id]=e.im;res['k'+id]=e.k;return e.im;
    };
    return {get,key:id=>{get(id);return res['k'+id];}};
  };
}
export function buildMaps(g,N,ev){
  const run=(ev||createEval())(g,N),out=g.nodes.out,P=out.p,I=out.in.map(s=>s&&g.nodes[s]?run.get(s):null);
  const [base,metal,rough,normal,height,emit,alpha]=I;
  return {N,base,metal,rough,height,emit,alpha,normal:normal||(height?slopes(height,N,Math.max(.1,P.nk*(P.bump*12))):null),P,
    flags:{base:!!base,metal:!!metal,rough:!!rough,normal:!!(normal||height),emit:!!emit,alpha:!!alpha}};
}
/* ---------------- textures and materials ---------------- */
export function toCanvas(im,srgb){const c=document.createElement('canvas');c.width=c.height=im.n;const x=c.getContext('2d'),id=x.createImageData(im.n,im.n),d=id.data,s=im.d;for(let i=0,j=0;i<im.n*im.n;i++,j+=4){d[j]=clamp(s[i*3])*255;d[j+1]=clamp(s[i*3+1])*255;d[j+2]=clamp(s[i*3+2])*255;d[j+3]=255;}x.putImageData(id,0,0);return c;}
export function texturesFor(THREE,maps,old){
  const T=old||{},mk=(key,im,srgb)=>{if(!im){if(T[key]){T[key].dispose();delete T[key];}return;}const cv=toCanvas(im,srgb);if(T[key]){T[key].image=cv;T[key].needsUpdate=true;}else{const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;if(srgb)t.colorSpace=THREE.SRGBColorSpace;T[key]=t;}T[key].repeat.set(maps.P.tile,maps.P.tile);};
  mk('map',maps.base,true);mk('roughnessMap',maps.rough);mk('metalnessMap',maps.metal);mk('normalMap',maps.normal);mk('emissiveMap',maps.emit,true);mk('alphaMap',maps.alpha);
  return T;
}
export function fillMaterial(THREE,m,T,maps){
  const P=maps.P,f=maps.flags;
  m.map=T.map||null;m.color.set(f.base?'#ffffff':P.baseC);
  m.roughnessMap=T.roughnessMap||null;m.roughness=f.rough?1:P.rough;
  m.metalnessMap=T.metalnessMap||null;m.metalness=f.metal?1:P.metal;
  m.normalMap=T.normalMap||null;if(m.normalMap&&m.normalScale)m.normalScale.set(P.nk,P.nk);
  m.bumpMap=null;
  m.emissiveMap=T.emissiveMap||null;m.emissive.set(f.emit?'#ffffff':'#000000');m.emissiveIntensity=P.ek;
  m.alphaMap=T.alphaMap||null;m.transparent=f.alpha;m.needsUpdate=true;
}
const KEEP=['map','color','roughnessMap','roughness','metalnessMap','metalness','normalMap','bumpMap','emissiveMap','emissive','emissiveIntensity','alphaMap','transparent'];
export function applyToObject(THREE,o,g,N=512){
  clearFromObject(o);
  const maps=buildMaps(g,N),T=texturesFor(THREE,maps);let skipped=0,done=0;
  o.holder.traverse(n=>{if(!n.isMesh||n.userData.noView||!n.material)return;if(!n.geometry.attributes.uv){skipped++;return;}
    (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(!m.isMeshStandardMaterial)return;
      if(!m.userData.nmOrig){const k={};KEEP.forEach(a=>{k[a]=m[a]&&m[a].clone?m[a].clone():m[a];});m.userData.nmOrig=k;}
      fillMaterial(THREE,m,T,maps);done++;});});
  o.nmat=JSON.parse(JSON.stringify(g));o.nmTex=T;return {skipped,done};
}
export function clearFromObject(o){
  if(!o||!o.holder)return;
  o.holder.traverse(n=>{if(!n.isMesh||!n.material)return;(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{const k=m.userData&&m.userData.nmOrig;if(!k)return;
    KEEP.forEach(a=>{if(a==='color'||a==='emissive')m[a].copy(k[a]);else m[a]=k[a];});delete m.userData.nmOrig;m.needsUpdate=true;});});
  if(o.nmTex){Object.values(o.nmTex).forEach(t=>t&&t.dispose&&t.dispose());delete o.nmTex;}
  delete o.nmat;
}
/* ---------------- starter graphs ---------------- */
const IDS=new WeakMap();
function build(list){const g=newGraph(),ids={out:'out'};IDS.set(g,ids);list.forEach(([k,t,x,y,p])=>{ids[k]=addNode(g,t,x,y,p);});list.forEach(([k,,,,,ins])=>{(ins||[]).forEach((s,i)=>{if(s)g.nodes[ids[k]].in[i]=ids[s];});});return g;}
const OUTP=(g,o)=>{Object.assign(g.nodes.out.p,o);return g;};
const wire=(g,o)=>{const ids=IDS.get(g);o.forEach((s,i)=>{g.nodes.out.in[i]=s?ids[s]:null;});return g;};
export const TEMPLATES=[
  ['Brick wall',()=>{const g=build([['b','bricks',20,20,{cols:5,rows:6,mortar:.07,tone:.6}],['n','noise',20,200,{scale:10,oct:6}],['r','ramp',230,20,{c1:'#3d3b38',c2:'#a24a30',c3:'#d4805c',mid:.35},['b']],['m','blend',420,60,{m:'mul',amt:.5},['r','n']],['rg','levels',230,200,{lo:.2,hi:.8,ol:.55,oh:.95},['n']],['h','blend',230,330,{m:'add',amt:.25},['b','n']]]);return OUTP(wire(g,['m',null,'rg',null,'h']),{bump:.5});}],
  ['Marble',()=>{const g=build([['w','waves',20,20,{f:3,a:50,shape:'sine',warp:.9}],['l','levels',210,20,{lo:.45,hi:.58,g:1.4},['w']],['r','ramp',400,20,{c1:'#2f2c35',c2:'#bdb8b2',c3:'#f5f2ee',mid:.3},['l']],['n','noise',210,200,{scale:14,oct:5}],['rg','levels',400,200,{ol:.12,oh:.3},['n']]]);return OUTP(wire(g,['r',null,'rg']),{});}],
  ['Rusty metal',()=>{const g=build([['n','noise',20,20,{scale:5,oct:6,seed:4}],['t','thresh',210,20,{t:.52,soft:.18},['n']],['r','ramp',400,20,{c1:'#8d9299',c2:'#8d9299',c3:'#7a3f1d',mid:.5},['t']],['g','noise',210,200,{scale:18,oct:6,seed:9}],['m','blend',400,200,{m:'mul',amt:.4},['r','g']],['mt','invert',400,330,{},['t']],['rg','levels',210,330,{ol:.3,oh:.95},['g']]]);return OUTP(wire(g,['m','mt','rg',null,'g']),{bump:.3});}],
  ['Hammered copper',()=>{const g=build([['c','cells',20,20,{scale:7,mode:'dist',jit:.8}],['r','ramp',210,20,{c1:'#4a2312',c2:'#b4673a',c3:'#f0b080',mid:.55},['c']],['b','blur',210,200,{r:2},['c']]]);return OUTP(wire(g,['r',null,null,null,'b']),{metal:1,rough:.32,bump:.7});}],
  ['Wood',()=>{const g=build([['w','waves',20,20,{f:9,a:92,shape:'tri',warp:.5,seed:5}],['n','noise',20,200,{scale:24,oct:4}],['m','blend',210,20,{m:'overlay',amt:.35},['w','n']],['r','ramp',400,20,{c1:'#4a2a12',c2:'#8f5d2c',c3:'#c99660',mid:.5},['m']]]);return OUTP(wire(g,['r',null,null,null,'m']),{rough:.55,bump:.25});}],
  ['Cobblestone',()=>{const g=build([['c','cells',20,20,{scale:6,mode:'edges',w:.18,jit:.9}],['i','cells',20,200,{scale:6,mode:'cells',jit:.9}],['n','noise',210,200,{scale:14,oct:5}],['r','ramp',210,20,{c1:'#2a2927',c2:'#76726a',c3:'#b4afa4',mid:.5},['i']],['m','blend',400,20,{m:'mul',amt:1},['r','c']],['h','blend',400,200,{m:'add',amt:.2},['c','n']]]);return OUTP(wire(g,['m',null,null,null,'h']),{rough:.85,bump:.9});}],
  ['Woven cloth',()=>{const g=build([['a','waves',20,20,{f:28,a:0,shape:'sine'}],['b','waves',20,200,{f:28,a:90,shape:'sine'}],['m','blend',210,20,{m:'max',amt:1},['a','b']],['r','ramp',400,20,{c1:'#10131c',c2:'#26334f',c3:'#4a5f8c',mid:.5},['m']]]);return OUTP(wire(g,['r',null,null,null,'m']),{rough:.9,bump:.5});}],
  ['Lava',()=>{const g=build([['c','cells',20,20,{scale:5,mode:'edges',w:.3,jit:.9}],['n','noise',20,200,{scale:8,oct:6}],['i','invert',210,20,{},['c']],['m','blend',400,20,{m:'mul',amt:1},['i','n']],['e','ramp',400,200,{c1:'#000000',c2:'#c42a06',c3:'#ffd070',mid:.55},['m']],['b','ramp',210,200,{c1:'#17100e',c2:'#2c2420',c3:'#4a3d36'},['c']]]);return OUTP(wire(g,['b',null,null,null,'c','e']),{ek:2.2,rough:.9,bump:.8});}]
];
