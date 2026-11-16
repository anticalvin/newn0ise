/* FORM runtime: the code that runs a generator. It is a plain-JS source string so it can run in a Web Worker (the app), in a Node vm
   (tools/n0form-test.mjs) and be hashed. The generator never sees THREE, the DOM or the editor: it calls a small builder (`geometry`) that
   returns plain data, which the app validates before it builds any geometry. Limits are enforced inside the builder; the host adds a
   wall-clock budget and terminates the worker if it is exceeded. API_VERSION is the extension point: new operations (booleans, isosurfaces,
   morphs) are added to the builder and listed in OPS, and files say which apiVersion they need. */
export const API_VERSION=1;
export const LIMITS={vertices:400000,instances:50000,instVerts:6000000,nodes:2000,calls:20000,ms:4000,code:64*1024,params:16,depth:8,name:60};
export const OPS=['group','tube','curve','mesh','lathe','box','cylinder','sphere','cone','instances','points','lines'];
export const RUNTIME_SRC=`
(function(G){
"use strict";
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function strSeed(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
class LimitError extends Error{constructor(limit,max,what){super('Stopped: this generator '+what+' (limit '+max+'). Lower the counts or the segment numbers.');this.limit=limit;this.max=max;}}
function makeNoise(seed){
  const r=mulberry(seed),p=new Uint8Array(512),b=new Float32Array(256);for(let i=0;i<256;i++){p[i]=i;b[i]=r()*2-1;}
  for(let i=255;i>0;i--){const j=(r()*(i+1))|0,t=p[i];p[i]=p[j];p[j]=t;}for(let i=0;i<256;i++)p[i+256]=p[i];
  const f=t=>t*t*t*(t*(t*6-15)+10),L=(a,c,t)=>a+(c-a)*t;
  return function(x,y=0,z=0){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),xf=x-X,yf=y-Y,zf=z-Z,xi=X&255,yi=Y&255,zi=Z&255,u=f(xf),v=f(yf),w=f(zf);
    const h=(a,c,d)=>b[p[p[p[a]+c]+d]];
    return L(L(L(h(xi,yi,zi),h(xi+1,yi,zi),u),L(h(xi,yi+1,zi),h(xi+1,yi+1,zi),u),v),L(L(h(xi,yi,zi+1),h(xi+1,yi,zi+1),u),L(h(xi,yi+1,zi+1),h(xi+1,yi+1,zi+1),u),v),w);};
}
const num=(v,d)=>typeof v==='number'&&isFinite(v)?v:d;
const vec3=(a,d)=>Array.isArray(a)&&a.length>=3?[num(a[0],d[0]),num(a[1],d[1]),num(a[2],d[2])]:d;
const cname=s=>String(s==null?'':s).replace(/[^A-Za-z0-9 _.-]/g,'').slice(0,32);
function makeBuilder(seed,L){
  const st={calls:0,verts:0,inst:0,instVerts:0,nodes:0,bufs:[],ids:new Map(),tris:0};
  const tick=()=>{if(++st.calls>L.calls)throw new LimitError('calls',L.calls,'made more than '+L.calls+' builder calls');};
  const addV=n=>{st.verts+=n;if(st.verts>L.vertices)throw new LimitError('vertices',L.vertices,'tried to create more than '+L.vertices+' vertices');};
  const addNode=()=>{if(++st.nodes>L.nodes)throw new LimitError('nodes',L.nodes,'made more than '+L.nodes+' objects');};
  const buf=a=>{st.bufs.push(a);return st.bufs.length-1;};
  const mkId=(type,id)=>{let base=id!=null?String(id).replace(/[^A-Za-z0-9_.-]/g,'').slice(0,40)||type:type;const n=(st.ids.get(base)||0);st.ids.set(base,n+1);return n&&id!=null?base+'-'+(n+1):id==null?base+'-'+(n+1):base;};
  function xform(n,o){if(!o)return n;if(o.pos)n.pos=vec3(o.pos,[0,0,0]);if(o.rot)n.rot=vec3(o.rot,[0,0,0]);if(o.scale!=null)n.scale=Array.isArray(o.scale)?vec3(o.scale,[1,1,1]):[num(o.scale,1),num(o.scale,1),num(o.scale,1)];return n;}
  function common(n,o){o=o||{};n.id=mkId(n.type,o.id);n.name=cname(o.name||n.id);if(o.material!=null)n.material=cname(o.material);if(o.look)n.look=cname(o.look);if(o.phys)n.phys=cname(o.phys);if(o.solid)n.solid=true;if(o.hidden)n.hidden=true;return xform(n,o);}
  /* mesh data from flat arrays; computes normals when none are given */
  function meshNode(v,idx,nrm,uv,o){
    const vc=v.length/3;if(vc<3||idx.length<3)throw new Error('A mesh needs at least one triangle.');
    for(let i=0;i<idx.length;i++)if(!(idx[i]>=0&&idx[i]<vc))throw new Error('mesh index '+idx[i]+' is outside the '+vc+' vertices.');
    addV(vc);st.tris+=idx.length/3;
    if(!nrm){nrm=new Float32Array(v.length);for(let i=0;i<idx.length;i+=3){const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3,ux=v[b]-v[a],uy=v[b+1]-v[a+1],uz=v[b+2]-v[a+2],wx=v[c]-v[a],wy=v[c+1]-v[a+1],wz=v[c+2]-v[a+2],nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;
      for(const k of [a,b,c]){nrm[k]+=nx;nrm[k+1]+=ny;nrm[k+2]+=nz;}}
      for(let i=0;i<nrm.length;i+=3){const l=Math.hypot(nrm[i],nrm[i+1],nrm[i+2])||1;nrm[i]/=l;nrm[i+1]/=l;nrm[i+2]/=l;}}
    const n={type:'mesh',vb:buf(v),idx:buf(idx.length>65535?new Uint32Array(idx):new Uint16Array(idx)),nrm:buf(nrm)};if(uv)n.uv=buf(uv);
    return common(n,o);}
  const flat=a=>{if(a instanceof Float32Array)return a;if(!Array.isArray(a)&&!ArrayBuffer.isView(a))throw new Error('vertices must be an array of [x,y,z] or a flat list of numbers.');
    if(a.length&&Array.isArray(a[0])){const f=new Float32Array(a.length*3);for(let i=0;i<a.length;i++){f[i*3]=num(a[i][0],0);f[i*3+1]=num(a[i][1],0);f[i*3+2]=num(a[i][2],0);}return f;}
    const f=new Float32Array(a.length);for(let i=0;i<a.length;i++)f[i]=num(a[i],0);return f;};
  /* parallel-transport tube along a polyline */
  function tubeGeo(pts,radius,rs,closed,cap){
    const n=pts.length;if(n<2)throw new Error('tube needs at least 2 points.');rs=Math.max(3,Math.min(32,rs|0||8));
    addV(n*rs+(cap&&!closed?2:0));
    const P=pts.map(p=>vec3(p,[0,0,0])),T=[];
    for(let i=0;i<n;i++){const a=P[Math.max(0,i-1)],b=P[Math.min(n-1,i+1)];let x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2];const l=Math.hypot(x,y,z)||1;T.push([x/l,y/l,z/l]);}
    let N=Math.abs(T[0][1])<.9?[0,1,0]:[1,0,0];const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],nrm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];};
    let d=dot(N,T[0]);N=nrm([N[0]-T[0][0]*d,N[1]-T[0][1]*d,N[2]-T[0][2]*d]);
    const pos=new Float32Array((n*rs+2)*3),nor=new Float32Array((n*rs+2)*3);
    for(let i=0;i<n;i++){
      if(i>0){d=dot(N,T[i]);N=nrm([N[0]-T[i][0]*d,N[1]-T[i][1]*d,N[2]-T[i][2]*d]);}
      const B=cross(T[i],N),r=typeof radius==='function'?num(radius(i/(n-1),i),.05):num(radius,.05);
      for(let k=0;k<rs;k++){const a=k/rs*Math.PI*2,c=Math.cos(a),s=Math.sin(a),nx=N[0]*c+B[0]*s,ny=N[1]*c+B[1]*s,nz=N[2]*c+B[2]*s,o=(i*rs+k)*3;
        pos[o]=P[i][0]+nx*r;pos[o+1]=P[i][1]+ny*r;pos[o+2]=P[i][2]+nz*r;nor[o]=nx;nor[o+1]=ny;nor[o+2]=nz;}
    }
    const idx=[];for(let i=0;i<n-1;i++)for(let k=0;k<rs;k++){const a=i*rs+k,b=i*rs+(k+1)%rs,c=(i+1)*rs+k,e=(i+1)*rs+(k+1)%rs;idx.push(a,c,b,b,c,e);}
    let vc=n*rs;
    if(cap&&!closed){for(const [end,ci] of [[0,0],[n-1,1]]){const o=(n*rs+ci)*3;pos[o]=P[end][0];pos[o+1]=P[end][1];pos[o+2]=P[end][2];const s=ci?1:-1;nor[o]=T[end][0]*s;nor[o+1]=T[end][1]*s;nor[o+2]=T[end][2]*s;
      for(let k=0;k<rs;k++){const a=end*rs+k,b=end*rs+(k+1)%rs,c=n*rs+ci;if(ci)idx.push(a,b,c);else idx.push(b,a,c);}}vc+=2;}
    else if(closed){for(let k=0;k<rs;k++){const a=(n-1)*rs+k,b=(n-1)*rs+(k+1)%rs,c=k,e=(k+1)%rs;idx.push(a,c,b,b,c,e);}}
    return {pos:pos.subarray(0,vc*3),nor:nor.subarray(0,vc*3),idx,vc};
  }
  function primGeo(kind,dims,seg){
    const d=vec3(dims,[1,1,1]);seg=Math.max(3,Math.min(64,seg|0||16));
    if(kind==='box'){const hx=d[0]/2,hz=d[2]/2,h=d[1],F=[[[-1,0,0],[[-hx,0,-hz],[-hx,h,-hz],[-hx,h,hz],[-hx,0,hz]]],[[1,0,0],[[hx,0,hz],[hx,h,hz],[hx,h,-hz],[hx,0,-hz]]],[[0,-1,0],[[-hx,0,-hz],[-hx,0,hz],[hx,0,hz],[hx,0,-hz]]],[[0,1,0],[[-hx,h,hz],[-hx,h,-hz],[hx,h,-hz],[hx,h,hz]]],[[0,0,-1],[[hx,0,-hz],[hx,h,-hz],[-hx,h,-hz],[-hx,0,-hz]]],[[0,0,1],[[-hx,0,hz],[-hx,h,hz],[hx,h,hz],[hx,0,hz]]]];
      const pos=[],nor=[],idx=[];F.forEach(([n,q],f)=>{q.forEach(p=>{pos.push(...p);nor.push(...n);});idx.push(f*4,f*4+1,f*4+2,f*4,f*4+2,f*4+3);});return {pos:new Float32Array(pos),nor:new Float32Array(nor),idx,vc:24};}
    if(kind==='sphere'){const wr=seg,hr=Math.max(2,seg>>1),pos=[],nor=[],idx=[];for(let y=0;y<=hr;y++){const v=y/hr,ph=v*Math.PI;for(let x=0;x<=wr;x++){const u=x/wr,th=u*Math.PI*2,nx=-Math.cos(th)*Math.sin(ph),ny=Math.cos(ph),nz=Math.sin(th)*Math.sin(ph);pos.push(nx*d[0]/2,ny*d[1]/2+d[1]/2,nz*d[2]/2);nor.push(nx,ny,nz);}}
      for(let y=0;y<hr;y++)for(let x=0;x<wr;x++){const a=y*(wr+1)+x,b=a+wr+1;idx.push(a,a+1,b,a+1,b+1,b);}return {pos:new Float32Array(pos),nor:new Float32Array(nor),idx:idx.map(i=>i),vc:pos.length/3};}
    /* cylinder and cone: a lathe of a tiny profile */
    const r0=d[0]/2,r1=kind==='cone'?0:d[0]/2,h=d[1],prof=[[0,0],[r0,0],[r1,h],[0,h]];return lathePts(prof,seg,true);
  }
  function lathePts(prof,seg,flatShade){
    const m=prof.length,pos=[],nor=[],idx=[];seg=Math.max(3,Math.min(96,seg|0||24));
    for(let i=0;i<m;i++){const p=prof[i],a=prof[Math.max(0,i-1)],b=prof[Math.min(m-1,i+1)];let dr=b[0]-a[0],dy=b[1]-a[1];const l=Math.hypot(dr,dy)||1;const nr=dy/l,ny=-dr/l;
      for(let k=0;k<=seg;k++){const t=k/seg*Math.PI*2,c=Math.cos(t),s=Math.sin(t);pos.push(c*p[0],p[1],s*p[0]);nor.push(c*nr,ny,s*nr);}}
    for(let i=0;i<m-1;i++)for(let k=0;k<seg;k++){const a=i*(seg+1)+k,b=a+seg+1;idx.push(a,b,a+1,a+1,b,b+1);}
    return {pos:new Float32Array(pos),nor:new Float32Array(nor),idx,vc:pos.length/3};
  }
  const G={};
  function nodeApi(n,parent){
    const o={_n:n,
      group(name,opts){tick();addNode();const c={type:'group',children:[]};common(c,{...opts,id:opts&&opts.id,name});n.children.push(c);return nodeApi(c,n);},
      tube(a){tick();addNode();const g=tubeGeo(a.points||[],a.radius!=null?a.radius:.05,a.radialSegments,!!a.closed,a.cap!==false);if(a.taper!=null){}
        st.tris+=g.idx.length/3;const c={type:'mesh',vb:buf(g.pos),idx:buf(g.idx.length>65535?new Uint32Array(g.idx):new Uint16Array(g.idx)),nrm:buf(g.nor)};common(c,a);n.children.push(c);return c.id;},
      curve(a){tick();addNode();const p=flat(a.points||[]);if(p.length<6)throw new Error('curve needs at least 2 points.');addV(p.length/3);const c={type:'line',vb:buf(p),color:a.color};common(c,a);n.children.push(c);return c.id;},
      lines(a){tick();addNode();const seg=a.segments||[];const f=new Float32Array(seg.length*6);seg.forEach((s,i)=>{const p=vec3(s[0],[0,0,0]),q=vec3(s[1],[0,0,0]);f.set(p,i*6);f.set(q,i*6+3);});addV(seg.length*2);const c={type:'lines',vb:buf(f)};common(c,a);n.children.push(c);return c.id;},
      points(a){tick();addNode();const p=flat(a.points||[]);addV(p.length/3);const c={type:'points',vb:buf(p),size:Math.max(.001,Math.min(1,num(a.size,.03))),color:a.color};common(c,a);n.children.push(c);return c.id;},
      mesh(a){tick();addNode();const v=flat(a.vertices),idx=a.indices?Array.from(a.indices):Array.from({length:v.length/3},(_,i)=>i);const c=meshNode(v,idx,a.normals?flat(a.normals):null,a.uvs?new Float32Array(a.uvs):null,a);n.children.push(c);return c.id;},
      lathe(a){tick();addNode();const prof=(a.profile||[]).map(p=>[num(p[0],0),num(p[1],0)]);if(prof.length<2)throw new Error('lathe needs a profile of at least 2 [radius, y] points.');
        const g=lathePts(prof,a.segments,false);addV(g.vc);st.tris+=g.idx.length/3;const c={type:'mesh',vb:buf(g.pos),idx:buf(new Uint32Array(g.idx)),nrm:buf(g.nor)};common(c,a);n.children.push(c);return c.id;},
      instances(a){tick();addNode();
        let items=a.items;if(!items&&typeof a.fn==='function'){items=[];const cnt=Math.min(num(a.count,0),L.instances+1);for(let i=0;i<cnt;i++)items.push(a.fn(i));}
        if(!Array.isArray(items))throw new Error('instances needs items:[{pos,rot,scale,color}] or count and fn(i).');
        const cnt=items.length;st.inst+=cnt;if(st.inst>L.instances)throw new LimitError('instances',L.instances,'tried to create more than '+L.instances+' instances');
        const kind=a.shape||'box',g=primGeo(kind==='tube'?'cylinder':kind,a.dims||[1,1,1],a.segments);addV(g.vc);st.instVerts+=g.vc*cnt;if(st.instVerts>L.instVerts)throw new LimitError('instVerts',L.instVerts,'would draw more than '+L.instVerts+' vertices across its instances');
        st.tris+=g.idx.length/3;
        const mat=new Float32Array(cnt*16),col=new Float32Array(cnt*3);let anyCol=false;
        for(let i=0;i<cnt;i++){const it=items[i]||{},p=vec3(it.pos,[0,0,0]),r=vec3(it.rot,[0,0,0]),s=Array.isArray(it.scale)?vec3(it.scale,[1,1,1]):[num(it.scale,1),num(it.scale,1),num(it.scale,1)];
          const cx=Math.cos(r[0]*Math.PI/180),sx=Math.sin(r[0]*Math.PI/180),cy=Math.cos(r[1]*Math.PI/180),sy=Math.sin(r[1]*Math.PI/180),cz=Math.cos(r[2]*Math.PI/180),sz=Math.sin(r[2]*Math.PI/180);
          /* XYZ Euler to matrix, then scale columns */
          const m00=cy*cz,m01=-cy*sz,m02=sy,m10=cx*sz+sx*sy*cz,m11=cx*cz-sx*sy*sz,m12=-sx*cy,m20=sx*sz-cx*sy*cz,m21=sx*cz+cx*sy*sz,m22=cx*cy,o=i*16;
          mat[o]=m00*s[0];mat[o+1]=m10*s[0];mat[o+2]=m20*s[0];mat[o+3]=0;mat[o+4]=m01*s[1];mat[o+5]=m11*s[1];mat[o+6]=m21*s[1];mat[o+7]=0;mat[o+8]=m02*s[2];mat[o+9]=m12*s[2];mat[o+10]=m22*s[2];mat[o+11]=0;mat[o+12]=p[0];mat[o+13]=p[1];mat[o+14]=p[2];mat[o+15]=1;
          if(typeof it.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(it.color)){anyCol=true;col[i*3]=parseInt(it.color.slice(1,3),16)/255;col[i*3+1]=parseInt(it.color.slice(3,5),16)/255;col[i*3+2]=parseInt(it.color.slice(5,7),16)/255;}else{col[i*3]=col[i*3+1]=col[i*3+2]=1;}}
        const c={type:'instances',count:cnt,vb:buf(g.pos),idx:buf(new Uint32Array(g.idx)),nrm:buf(g.nor),mat:buf(mat)};if(anyCol)c.col=buf(col);common(c,a);n.children.push(c);return c.id;},
      transform(t){xform(n,t);return o;},
      get id(){return n.id;}
    };
    ['box','cylinder','sphere','cone'].forEach(kind=>{o[kind]=function(a){tick();addNode();a=a||{};const g=primGeo(kind,a.dims||[1,1,1],a.segments);addV(g.vc);st.tris+=g.idx.length/3;const c={type:'mesh',vb:buf(g.pos),idx:buf(new Uint32Array(g.idx)),nrm:buf(g.nor)};common(c,a);n.children.push(c);return c.id;};});
    return o;
  }
  const root={type:'group',children:[]};st.nodes=1;common(root,{id:'root',name:'Form'});
  const rootApi=nodeApi(root,null);
  return {st,root,rootApi,geometry:Object.assign(rootApi,{group(name,opts){tick();addNode();const c={type:'group',children:[]};common(c,{...opts,name});root.children.push(c);return nodeApi(c,root);}})};
}
function fnv(bufs){let h=2166136261;for(const b of bufs){const u=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);for(let i=0;i<u.length;i++){h^=u[i];h=Math.imul(h,16777619);}}return (h>>>0).toString(16).padStart(8,'0');}
G.__runForm=function(code,input){
  const L=Object.assign({},input.limits||{}),seed=input.seed>>>0,params=input.params||{};
  const out={ok:false};
  try{
    const B=makeBuilder(seed,L),r=mulberry(seed),noise=makeNoise(seed);
    const rand=Object.assign(()=>r(),{range:(a,b)=>a+(b-a)*r(),int:(a,b)=>a+Math.floor(r()*(b-a+1)),pick:a=>a[Math.floor(r()*a.length)],gauss:()=>{let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);},fork:label=>{const f=mulberry(seed^strSeed(String(label)));return Object.assign(()=>f(),{range:(a,b)=>a+(b-a)*f(),int:(a,b)=>a+Math.floor(f()*(b-a+1)),pick:a=>a[Math.floor(f()*a.length)]});}});
    const math={TAU:Math.PI*2,noise,fbm:(x,y=0,z=0,o=4)=>{let s=0,a=.5,f=1;for(let i=0;i<o;i++){s+=a*noise(x*f,y*f,z*f);f*=2;a*=.5;}return s;},remap:(v,a,b,c,d)=>c+(v-a)/(b-a||1)*(d-c),lerp:(a,b,t)=>a+(b-a)*t,clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),smoothstep:(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a||1)));return t*t*(3-2*t);}};
    Math.random=()=>r();
    const body='"use strict";\\n'+code.replace(/export\\s+default\\s+function\\s+create/,'function create').replace(/export\\s+const\\s+(\\w+)\\s*=/g,'var $1 =').replace(/export\\s+default\\s+/,'var __default = ')+'\\n;return {fn:(typeof __default!=="undefined"?__default:(typeof create==="function"?create:null)),params:(typeof params!=="undefined"?params:null),animated:(typeof animated!=="undefined"?!!animated:false),duration:(typeof duration!=="undefined"?+duration:0)};';
    const mod=(0,Function)(body)();
    if(typeof mod.fn!=='function')throw new Error('Export a function: export default function create({geometry, seed, params, rand, math}) { ... }');
    out.schema=Array.isArray(mod.params)?mod.params.slice(0,16):(mod.fn.params||null);out.animated=!!(mod.animated||mod.fn.animated);out.duration=Math.max(0,Math.min(600,+mod.duration||0));
    const ret=mod.fn({geometry:B.geometry,seed,params,rand,math,time:num(input.time,0),data:input.data||null});
    B.st.calls++; // the call itself
    const rootNode=ret&&ret._n?ret._n:B.root;
    if(!rootNode.children.length&&rootNode===B.root)throw new Error('The generator made nothing. Call geometry.tube(...), geometry.instances(...) or similar, and return the group.');
    const tree=rootNode===B.root?B.root:{type:'group',id:'root',name:rootNode.name||'Form',children:[rootNode]};
    out.ok=true;out.tree=tree;out.bufs=B.st.bufs;out.stats={vertices:B.st.verts,instances:B.st.inst,instVerts:B.st.instVerts,nodes:B.st.nodes,triangles:B.st.tris,calls:B.st.calls,hash:fnv(B.st.bufs)};
  }catch(e){
    out.error={message:String(e&&e.message||e),limit:e&&e.limit||null,max:e&&e.max||null};
    const ln=String(e&&e.stack||'').split('\\n').map(l=>/(?<!evalmachine\\.)<anonymous>:(\\d+):(\\d+)\\)?\\s*$/.exec(l)).find(Boolean);if(ln)out.error.line=Math.max(1,(+ln[1])-3);
  }
  return out;
};
})(globalThis);
`;
/* what the Web Worker runs: the runtime, then a thin message handler. Network and storage are removed before any generator code runs. */
export const WORKER_SRC=RUNTIME_SRC+`
(function(){
  for(const k of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches','BroadcastChannel','Worker','SharedWorker','localStorage'])try{Object.defineProperty(self,k,{value:undefined,configurable:false,writable:false});}catch(e){}
  const pm=self.postMessage.bind(self),run=self.__runForm;
  self.onmessage=function(e){const r=run(e.data.code,e.data);const t=(r.bufs||[]).map(b=>b.buffer);pm(r,t);};
})();`;
