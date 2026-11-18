/* Runs FORM generators in a Web Worker and turns what comes back into three.js objects. The worker is built from a Blob, has no DOM, and has
   network and storage removed before any generator code runs. Its output is validated (form-schema.js) before anything is built. A wall-clock
   budget terminates a runaway generator; a newer request cancels the one in flight. Imported code only runs after review (approvals are
   remembered per content hash). Safe mode (?safe=1) never runs imported code. */
import {WORKER_SRC,LIMITS} from './form-runtime.js';
import {validateOutput,defaultsOf} from './form-schema.js';
import {hashJson} from './importkit.js';
export const FORM_SAFE=/[?&]safe=1/.test(location.search);
const APPROVE_KEY='n0.form.approved';
const approvedSet=()=>{try{return new Set(JSON.parse(localStorage.getItem(APPROVE_KEY)||'[]'));}catch(e){return new Set();}};
export const isApproved=h=>approvedSet().has(h);
export const approve=h=>{const s=approvedSet();s.add(h);try{localStorage.setItem(APPROVE_KEY,JSON.stringify([...s].slice(-200)));}catch(e){}};
export const codeHash=code=>hashJson(code);
let blobUrl=null;
const workerUrl=()=>blobUrl||(blobUrl=URL.createObjectURL(new Blob([WORKER_SRC],{type:'text/javascript'})));
/* one run: resolves {ok,tree,bufs,stats,schema,animated,ms} or {ok:false,error:{message,line?,limit?}}. cancel() rejects it as {cancelled:true}. */
export function runGenerator(recipe,{ms=LIMITS.ms,time=0}={}){
  let worker=null,timer=null,done=false,finRef=null;
  const p=new Promise(resolve=>{
    const fin=r=>{if(done)return;done=true;clearTimeout(timer);try{worker&&worker.terminate();}catch(e){}resolve(r);};finRef=fin;
    try{worker=new Worker(workerUrl());}catch(e){fin({ok:false,error:{message:'Generators can’t run here: this browser blocked the worker ('+(e.message||e)+').'}});return;}
    const t0=performance.now();
    timer=setTimeout(()=>fin({ok:false,error:{message:'Stopped: this generator took longer than '+(ms/1000)+' s. Lower the counts or make it simpler.',limit:'time',max:ms},ms:ms}),ms);
    worker.onmessage=e=>{
      const res=e.data;if(done)return;
      if(!res||res.ok!==true){fin({ok:false,error:(res&&res.error)||{message:'The generator failed.'},ms:performance.now()-t0});return;}
      const v=validateOutput(res);
      fin(v.ok?{...v,ms:performance.now()-t0}:{ok:false,error:v.error,ms:performance.now()-t0});
    };
    worker.onerror=e=>{e.preventDefault&&e.preventDefault();fin({ok:false,error:{message:'The generator crashed: '+(e.message||'unknown error')}});};
    worker.onmessageerror=()=>fin({ok:false,error:{message:'The generator returned data that couldn’t be read.'}});
    worker.postMessage({code:recipe.code,seed:recipe.seed>>>0,params:{...defaultsOf(recipe.schema),...recipe.params},limits:LIMITS,time,data:recipe.data?b64ToBytes(recipe.data):null});
  });
  p.cancel=()=>{if(finRef)finRef({ok:false,error:{cancelled:true,message:'Cancelled by a newer change.'}});};
  return p;
}
export function b64ToBytes(b64){const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}
export const paletteOf=name=>{let h=2166136261;for(let i=0;i<name.length;i++){h^=name.charCodeAt(i);h=Math.imul(h,16777619);}return 'hsl('+((h>>>0)%360)+',38%,58%)';};
/* three.js objects from validated data. mats: {name:{color,roughness,metalness,emissive,opacity}} chooses the look of each named material. */
export function buildGroup(THREE,res,{mats={},getMat}={}){
  const cache=new Map(),bufs=res.bufs;
  const matFor=name=>{
    if(getMat)return getMat(name);
    const key=name||'default';if(cache.has(key))return cache.get(key);
    const d=mats[name]||{},m=new THREE.MeshStandardMaterial({color:d.color||(name?paletteOf(name):'#b9b4ac'),roughness:d.roughness!=null?d.roughness:.6,metalness:d.metalness||0,side:THREE.DoubleSide});
    if(d.emissive){m.emissive.set(d.emissive);m.emissiveIntensity=1;}
    if(d.opacity!=null&&d.opacity<1){m.transparent=true;m.opacity=d.opacity;}
    m.userData.formMat=name||'default';cache.set(key,m);return m;};
  let meshes=0;
  function make(n){
    let o;
    if(n.type==='group'){o=new THREE.Group();n.children.forEach(c=>o.add(make(c)));}
    else{
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(bufs[n.vb],3));
      if(n.type==='mesh'||n.type==='instances'){g.setIndex(new THREE.BufferAttribute(bufs[n.idx],1));g.setAttribute('normal',new THREE.BufferAttribute(bufs[n.nrm],3));if(n.uv!=null)g.setAttribute('uv',new THREE.BufferAttribute(bufs[n.uv],2));}
      if(n.type==='mesh'){o=new THREE.Mesh(g,matFor(n.material));o.castShadow=o.receiveShadow=true;}
      else if(n.type==='instances'){o=new THREE.InstancedMesh(g,matFor(n.material),n.count);o.instanceMatrix.array.set(bufs[n.mat]);o.instanceMatrix.needsUpdate=true;
        if(n.col!=null){o.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(bufs[n.col]),3);}
        o.castShadow=o.receiveShadow=true;o.computeBoundingSphere&&o.computeBoundingSphere();}
      else if(n.type==='line'){o=new THREE.Line(g,new THREE.LineBasicMaterial({color:n.color||'#ffffff'}));}
      else if(n.type==='lines'){o=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#ffffff'}));}
      else if(n.type==='points'){o=new THREE.Points(g,new THREE.PointsMaterial({color:n.color||'#ffffff',size:n.size,sizeAttenuation:true}));}
      meshes++;
    }
    o.name=n.name||n.id;o.userData.formId=n.id;if(n.solid)o.userData.solid=true;if(n.hidden)o.visible=false;
    if(n.tpos)o.position.fromArray(n.tpos);if(n.trot)o.rotation.set(...n.trot.map(d=>d*Math.PI/180));if(n.tscale)o.scale.fromArray(n.tscale);
    return o;
  }
  const root=make(res.tree);root.userData.formRoot=true;
  return {root,materials:[...cache.values()],meshes};
}
export function disposeGroup(g){g.traverse(n=>{if(n.geometry)n.geometry.dispose();});}
