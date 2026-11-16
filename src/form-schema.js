/* .n0form: a generator (code) plus its parameter schema, as one JSON file. Pure (no DOM), shared by the app and tools/n0form-validate.mjs.
   Code is the one thing here that is executable, so nothing about it is trusted: it only ever runs in the FORM worker after the person has
   reviewed it (see form-host.js), and everything it returns is validated again. */
import {Report,isNum,clampN,isHex,clone} from './importkit.js';
import {API_VERSION,LIMITS} from './form-runtime.js';
export const FORM_FORMAT='n0form';
const ID_RE=/^[a-z0-9][a-z0-9_-]{1,23}\.[a-z0-9][a-z0-9_-]{1,31}$/;
const K_RE=/^[a-z][A-Za-z0-9]{0,15}$/;
const str=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;
const BLOCKED=[[/\bimport\s*\(|\bimport\s+[\w{*]/,'import'],[/\bfetch\s*\(/,'fetch'],[/\bXMLHttpRequest\b/,'XMLHttpRequest'],[/\bWebSocket\b/,'WebSocket'],[/\bpostMessage\b/,'postMessage'],[/\beval\s*\(/,'eval'],[/\bself\b|\bglobalThis\b|\bwindow\b|\bdocument\b/,'window/self/document']];
/* a parameter list as the UI builds it: {k,label,t:'r'|'b'|'c'|'color',min,max,def,step,hint,opts} */
export function cleanParams(list,R,at){
  const out=[],seen=new Set();
  if(list==null)return out;
  if(!Array.isArray(list)){R.add('fix',at,'"params" must be a list. Ignored.');return out;}
  list.slice(0,LIMITS.params).forEach((p,i)=>{const a=at+'['+i+']';
    if(!p||typeof p!=='object'){R.add('fix',a,'A parameter must be an object like {"k":"count","label":"Count","min":1,"max":100,"def":20}. Skipped.');return;}
    if(!K_RE.test(p.k||'')){R.add('fix',a+'.k','k must be a short name of letters and digits starting with a letter. Skipped.');return;}
    if(seen.has(p.k)){R.add('fix',a+'.k','k "'+p.k+'" is used twice. Skipped.');return;}seen.add(p.k);
    const t=p.t||'r',o={k:p.k,label:String(p.label||p.k).slice(0,40),t};
    if(t==='r'){if(!isNum(p.min)||!isNum(p.max)||p.min>=p.max){R.add('fix',a,'a slider needs numbers min < max. Using 0 to 1.');o.min=0;o.max=1;}else{o.min=p.min;o.max=p.max;}
      o.def=isNum(p.def)?clampN(p.def,o.min,o.max,o.min):o.min;o.step=isNum(p.step)&&p.step>0?p.step:((o.max-o.min)>20?1:.01);}
    else if(t==='b')o.def=!!p.def;
    else if(t==='c'){if(!Array.isArray(p.opts)||p.opts.length<2||p.opts.length>12||p.opts.some(x=>!str(x,24))){R.add('fix',a,'a choice needs "opts": 2 to 12 short names. Skipped.');return;}o.opts=p.opts.slice();o.def=Number.isInteger(p.def)&&p.def>=0&&p.def<o.opts.length?p.def:0;}
    else if(t==='color'){o.def=isHex(p.def)?p.def:'#ffffff';}
    else{R.add('fix',a+'.t','t must be r (slider), b (switch), c (choice) or color. Skipped.');return;}
    if(p.hint!=null&&str(p.hint,120))o.hint=p.hint;
    out.push(o);});
  return out;
}
export const defaultsOf=schema=>Object.fromEntries((schema||[]).map(p=>[p.k,p.def]));
export function validateFormFile(input){
  const R=new Report();let j=input;
  if(typeof j==='string'){try{j=JSON.parse(j);}catch(e){R.add('error','','That isn’t valid JSON ('+e.message+'). Check commas, quotes and that the code is inside a JSON string with \\n for new lines. Send back the whole file.');return{ok:false,doc:null,report:R};}}
  if(!j||typeof j!=='object'||Array.isArray(j)){R.add('error','','The file must be a JSON object like {"n0form":1,"id":"you.thing","name":"…","code":"…"}.');return{ok:false,doc:null,report:R};}
  if(JSON.stringify(j).length>LIMITS.code*2){R.add('error','','The file is larger than '+(LIMITS.code*2/1024)+' KB.');return{ok:false,doc:null,report:R};}
  if(j.n0form!==1)R.add('fix','n0form','Missing "n0form": 1. Reading it as version 1.');
  const d={n0form:1,apiVersion:API_VERSION};
  if(j.apiVersion!=null&&j.apiVersion>API_VERSION){R.add('error','apiVersion','This file needs builder API version '+j.apiVersion+' but this app has '+API_VERSION+'. Ask for apiVersion 1.');return{ok:false,doc:null,report:R};}
  if(!str(j.id,64)||!ID_RE.test(j.id)){d.id='me.form';R.add('fix','id','"id" must look like author.name in lower case (letters, numbers, - _ and one dot). Using "me.form".');}else d.id=j.id;
  d.name=str(j.name,LIMITS.name)?j.name:(R.add('fix','name','"name" is required (under '+LIMITS.name+' characters). Using the id.'),d.id);
  d.version=str(j.version,20)?j.version:'1.0.0';d.author=str(j.author,60)?j.author:(R.add('warn','author','No "author". Shown as unknown.'),'unknown');
  d.licence=str(j.licence,40)?j.licence:(R.add('warn','licence','No "licence" (for example "CC0-1.0" or "MIT"). Shown as unspecified.'),'unspecified');
  if(j.description!=null&&str(j.description,400))d.description=j.description;
  if(typeof j.code!=='string'||!j.code.trim()){R.add('error','code','"code" is required: the generator source as a JSON string, for example "export default function create({geometry,params}){ ... }".');return{ok:false,doc:null,report:R};}
  if(j.code.length>LIMITS.code){R.add('error','code','The code is larger than '+(LIMITS.code/1024)+' KB.');return{ok:false,doc:null,report:R};}
  d.code=j.code;
  BLOCKED.forEach(([re,name])=>{if(re.test(j.code))R.add('warn','code','The code mentions "'+name+'". That isn’t available inside the generator and will fail or be ignored.');});
  if(!/export\s+default\s+function\s+create|function\s+create\s*\(|export\s+default\s+/.test(j.code))R.add('warn','code','No generator function found. Use: export default function create({geometry, seed, params, rand, math}) { ... }');
  d.params=cleanParams(j.params,R,'params');
  d.seed=isNum(j.seed)?Math.floor(clampN(j.seed,0,4294967295,1)):1;
  if(j.animated)d.animated=true;
  if(j.data!=null){if(typeof j.data==='string'&&j.data.length<=350000)d.data=j.data;else R.add('fix','data','"data" must be base64 text under 350 KB. Ignored.');}
  if(j.defaults&&typeof j.defaults==='object'){d.defaults={};if(typeof j.defaults.mat==='string')d.defaults.mat=j.defaults.mat.slice(0,24);if(j.defaults.materials&&typeof j.defaults.materials==='object'){d.defaults.materials={};Object.keys(j.defaults.materials).slice(0,16).forEach(k=>{const m=j.defaults.materials[k];if(m&&isHex(m.color))d.defaults.materials[k.slice(0,32)]={color:m.color,roughness:clampN(m.roughness,0,1,.6),metalness:clampN(m.metalness,0,1,0),emissive:isHex(m.emissive)?m.emissive:undefined};});}}
  if(j.thumbnail!=null){if(typeof j.thumbnail==='string'&&j.thumbnail.length<40000&&/^data:image\/(png|jpeg|webp);base64,/.test(j.thumbnail))d.thumbnail=j.thumbnail;else R.add('fix','thumbnail','thumbnail must be a small image data URL (under 40 KB). Ignored.');}
  Object.keys(j).forEach(k=>{if(!['n0form','id','name','version','apiVersion','author','licence','description','code','params','seed','animated','data','defaults','thumbnail'].includes(k))R.add('warn',k,'"'+k+'" isn’t part of the format and is ignored.');});
  return{ok:true,doc:d,report:R};
}
/* what a generator returned, checked before any geometry is built. The worker is untrusted, so every number and index is verified here. */
export function validateOutput(res,L=LIMITS){
  const bad=m=>({ok:false,error:{message:m}});
  if(!res||res.ok!==true||!res.tree||!Array.isArray(res.bufs))return bad('The generator returned something unexpected.');
  const bufs=res.bufs;if(bufs.length>L.nodes*6)return bad('Too many buffers.');
  const okBuf=(i,kind)=>Number.isInteger(i)&&i>=0&&i<bufs.length&&ArrayBuffer.isView(bufs[i])&&(!kind||Object.prototype.toString.call(bufs[i])==='[object '+kind+']');
  let nodes=0,verts=0;
  const nm=s=>typeof s==='string'?s.replace(/[^A-Za-z0-9 _.-]/g,'').slice(0,40):'';
  const vec=(a,d)=>Array.isArray(a)&&a.length===3&&a.every(isNum)?a.map(x=>clampN(x,-1e5,1e5,0)):d;
  function walk(n,depth){
    if(!n||typeof n!=='object'||depth>L.depth)throw new Error('The generator’s object tree is invalid or nested deeper than '+L.depth+'.');
    if(++nodes>L.nodes)throw new Error('More than '+L.nodes+' objects.');
    const o={type:n.type,id:nm(n.id)||('n'+nodes),name:nm(n.name),material:nm(n.material)||undefined,look:nm(n.look)||undefined,solid:!!n.solid,hidden:!!n.hidden};
    const p=vec(n.pos,null);if(n.type!=='mesh'&&n.type!=='line'&&n.type!=='lines'&&n.type!=='points'&&n.type!=='instances'&&n.type!=='group')throw new Error('Unknown object type "'+String(n.type).slice(0,12)+'".');
    if(n.type==='group'||true){o.tpos=vec(n.pos,undefined);o.trot=vec(n.rot,undefined);o.tscale=vec(n.scale,undefined);}
    if(n.type==='group'){if(!Array.isArray(n.children)||n.children.length>L.nodes)throw new Error('A group’s children must be a list.');o.children=n.children.map(c=>walk(c,depth+1));return o;}
    if(!okBuf(n.vb,'Float32Array')||bufs[n.vb].length%3||!bufs[n.vb].length)throw new Error('A geometry buffer is invalid.');
    const vc=bufs[n.vb].length/3;verts+=vc;if(verts>L.vertices+1000)throw new Error('More than '+L.vertices+' vertices.');
    const a=bufs[n.vb];for(let i=0;i<a.length;i++)if(!isFinite(a[i]))throw new Error('A vertex position is not a finite number.');
    o.vb=n.vb;
    if(n.type==='mesh'||n.type==='instances'){
      if(!okBuf(n.idx)||bufs[n.idx].length%3||!bufs[n.idx].length)throw new Error('A triangle index buffer is invalid.');const ix=bufs[n.idx];for(let i=0;i<ix.length;i++)if(!(ix[i]<vc))throw new Error('A triangle index points past the vertices.');
      if(!okBuf(n.nrm,'Float32Array')||bufs[n.nrm].length!==a.length)throw new Error('A normal buffer is invalid.');o.idx=n.idx;o.nrm=n.nrm;
      if(n.uv!=null){if(!okBuf(n.uv,'Float32Array')||bufs[n.uv].length!==vc*2)throw new Error('A UV buffer is invalid.');o.uv=n.uv;}
    }
    if(n.type==='instances'){
      if(!Number.isInteger(n.count)||n.count<1||n.count>L.instances)throw new Error('Instance count is invalid.');o.count=n.count;
      if(!okBuf(n.mat,'Float32Array')||bufs[n.mat].length!==n.count*16)throw new Error('An instance matrix buffer is invalid.');const m=bufs[n.mat];for(let i=0;i<m.length;i++)if(!isFinite(m[i]))throw new Error('An instance matrix has a non-finite number.');o.mat=n.mat;
      if(n.col!=null){if(!okBuf(n.col,'Float32Array')||bufs[n.col].length!==n.count*3)throw new Error('An instance colour buffer is invalid.');o.col=n.col;}
    }
    if(n.type==='points'){o.size=clampN(n.size,.001,1,.03);}
    if((n.type==='line'||n.type==='points')&&isHex(n.color))o.color=n.color;
    return o;
  }
  try{const tree=walk(res.tree,0);return{ok:true,tree,bufs,stats:{...(res.stats||{}),nodes},schema:res.schema,animated:!!res.animated,duration:isNum(res.duration)?clampN(res.duration,0,600,0):0};}catch(e){return bad(String(e.message||e));}
}
