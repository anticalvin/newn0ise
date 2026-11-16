/* Lab "3D object" mode: write a FORM generator, see the real geometry, change its parameters, send it to 3D with its recipe attached.
   The sketch tools stay exactly as they are; this is a full-screen layer you open and close. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {runGenerator,buildGroup,disposeGroup,paletteOf} from './form-host.js';
import {validateFormFile,defaultsOf} from './form-schema.js';
import {put as handoffPut} from './handoff.js';
import {LIMITS,API_VERSION} from './form-runtime.js';
import {FORM_BRIEF} from './form-brief.js';
const EXAMPLES=[['Spiral Garden','forms/spiral-garden.n0form'],['Procedural tower','forms/procedural-tower.n0form'],['Swarm','forms/swarm.n0form'],['Lathe vases','forms/lathe-vases.n0form'],['Lattice sphere','forms/lattice-sphere.n0form'],['The Impossible Garden (FORM 001)','forms/impossible-garden.n0form']];
const STARTER=`export const params = [
  { k: "count", label: "Count", min: 3, max: 80, def: 24, step: 1 },
  { k: "height", label: "Height", min: 0.5, max: 5, def: 2.5, step: 0.1 }
];

export default function create({ geometry, seed, params, rand, math }) {
  const g = geometry.group("My object");
  for (let i = 0; i < params.count; i++) {
    const a = (i / params.count) * Math.PI * 2;
    g.tube({
      points: [[Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], [Math.cos(a) * 0.9, params.height * 0.5, Math.sin(a) * 0.9], [Math.cos(a) * 0.3, params.height, Math.sin(a) * 0.3]],
      radius: 0.03, radialSegments: 6, material: "stem"
    });
  }
  return g;
}`;
export async function openFormLab(){
  if(document.getElementById('n0formlab')){document.getElementById('n0formlab').hidden=false;return;}
  const root=document.createElement('div');root.id='n0formlab';
  root.style.cssText='position:fixed;inset:0;z-index:50;background:#0a0a0a;color:#f2efe9;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);font:14px/1.45 system-ui,sans-serif';
  const mk=(tag,txt,st)=>{const e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(st)e.style.cssText=st;return e;};
  const bt=(t,fn,pri)=>{const b=mk('button',t,'min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.28);background:'+(pri?'#f2efe9':'rgba(255,255,255,.08)')+';color:'+(pri?'#111':'#f2efe9')+';font:inherit;cursor:pointer');b.type='button';b.addEventListener('click',fn);return b;};
  const head=mk('div',null,'grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.15)');
  head.appendChild(mk('strong','3D OBJECT','letter-spacing:.08em'));
  const sel=document.createElement('select');sel.setAttribute('aria-label','Example generators');sel.style.cssText='min-height:44px;padding:6px;background:#161616;color:#f2efe9;border-radius:8px';
  [['Start from…',''],['Blank starter','starter'],...EXAMPLES.map(e=>[e[0],e[1]])].forEach(([n,v])=>{const o=document.createElement('option');o.textContent=n;o.value=v;sel.appendChild(o);});
  const status=mk('span','','margin-left:auto;font-size:12px;opacity:.85');
  head.append(sel,bt('Run',()=>run(),true),bt('Send to 3D',()=>send(),false),bt('Download .n0form',()=>download()),bt('Copy brief for my AI',async()=>{try{await navigator.clipboard.writeText(FORM_BRIEF);status.textContent='Brief copied. Paste it into your AI, then say what to build.';}catch(e){status.textContent='Couldn’t copy.';}}),bt('Back to sketches',()=>{root.hidden=true;}),status);
  const left=mk('div',null,'display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(255,255,255,.15)');
  const edHost=mk('div',null,'flex:1;min-height:0;overflow:auto');
  const err=mk('pre','','margin:0;padding:6px 10px;color:#ff8a7a;white-space:pre-wrap;font:12px/1.4 ui-monospace,monospace');
  left.append(edHost,err);
  const right=mk('div',null,'display:flex;flex-direction:column;min-height:0');
  const stage=mk('div',null,'flex:1;min-height:200px;position:relative');
  const cv=document.createElement('canvas');cv.style.cssText='width:100%;height:100%;display:block;touch-action:none';stage.appendChild(cv);
  const panel=mk('div',null,'max-height:42%;overflow:auto;padding:8px 12px;border-top:1px solid rgba(255,255,255,.15)');
  right.append(stage,panel);root.append(head,left,right);
  if(matchMedia('(max-width:800px)').matches){root.style.gridTemplateColumns='1fr';root.style.gridTemplateRows='auto minmax(0,1fr) minmax(0,1fr)';left.style.borderRight='0';}
  document.body.appendChild(root);
  /* editor: the same CodeMirror the sketch editor uses, loaded from the one shared module */
  let ED=null,ta=null;
  try{const p='./labeditor.js?v=1';const m=await import(p);ED=m.createEditor(edHost,{doc:STARTER,onRun:()=>run()});}
  catch(e){ta=document.createElement('textarea');ta.value=STARTER;ta.spellcheck=false;ta.style.cssText='width:100%;height:100%;box-sizing:border-box;background:#0d0c0b;color:#f2efe9;border:0;padding:10px;font:12px/1.5 ui-monospace,monospace;resize:none';edHost.appendChild(ta);}
  const getCode=()=>ED?ED.get():ta.value,setCode=v=>{if(ED)ED.set(v);else ta.value=v;};
  /* preview */
  const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:false});renderer.setClearColor(0x0d0d0f);
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(45,1,.05,500);cam.position.set(4,3,5);
  scene.add(new THREE.HemisphereLight(0xffffff,0x303038,1.1));const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(4,8,5);scene.add(sun);
  const grid=new THREE.GridHelper(10,10,0x444444,0x222222);scene.add(grid);
  const controls=new OrbitControls(cam,cv);controls.enableDamping=true;
  let cur=null,matCache=new Map(),state={schema:[],params:{},seed:7,animated:false,name:'My object',data:null,mats:{}};
  const getMat=name=>{const k=name||'default';if(matCache.has(k))return matCache.get(k);const d=state.mats[k]||{},m=new THREE.MeshStandardMaterial({color:d.color||paletteOf(k),roughness:d.roughness!=null?d.roughness:.6,metalness:d.metalness||0,side:THREE.DoubleSide});if(d.emissive)m.emissive.set(d.emissive);matCache.set(k,m);return m;};
  const fit=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();};
  new ResizeObserver(fit).observe(stage);
  let raf=0;const loop=()=>{raf=requestAnimationFrame(loop);if(root.hidden)return;controls.update();renderer.render(scene,cam);};loop();
  let pending=null,t0=0;
  async function run({frame=false}={}){
    if(pending)pending.cancel();
    err.textContent='';status.textContent='Running…';
    const recipe={code:getCode(),seed:state.seed,params:state.params,schema:state.schema,data:state.data};
    const job=runGenerator(recipe,{time:t0});pending=job;const res=await job;if(pending!==job)return;pending=null;
    if(!res.ok){const e=res.error;err.textContent=e.message+(e.line?'\n(line '+e.line+')':'');if(ED&&e.line)ED.setError(e.line);status.textContent='Error';return;}
    if(ED)ED.setError(null);
    if(res.schema&&JSON.stringify(res.schema.map(p=>p.k))!==JSON.stringify(state.schema.map(p=>p.k))){const v=validateFormFile({n0form:1,id:'me.preview',name:'p',code:'x',params:res.schema});state.schema=v.doc?v.doc.params:[];state.params={...defaultsOf(state.schema),...state.params};drawPanel();}
    state.animated=!!res.animated;
    const built=buildGroup(THREE,res,{getMat});if(cur){scene.remove(cur);disposeGroup(cur);}cur=built.root;scene.add(cur);
    {const b=new THREE.Box3().setFromObject(cur);if(!b.isEmpty()){const sz=b.getSize(new THREE.Vector3()),m=Math.max(sz.x,sz.y,sz.z,.5);/* frame the first time, and again when the object grows or shrinks a lot */
      if(frame||!state.framed||m>state.fm*1.4||m<state.fm*.6){const c=b.getCenter(new THREE.Vector3()),d=m*1.8;controls.target.copy(c);cam.position.copy(c).add(new THREE.Vector3(d*.7,d*.5,d));state.framed=true;state.fm=m;}}}
    const st=res.stats;status.textContent=st.vertices.toLocaleString()+' vertices · '+st.instances.toLocaleString()+' instances · '+res.ms.toFixed(0)+' ms'+(state.animated?' · LIVE':'')+' · #'+st.hash;
  }
  let deb=0;const runSoon=()=>{clearTimeout(deb);deb=setTimeout(()=>run(),140);};
  function drawPanel(){
    panel.innerHTML='';
    if(!state.schema.length){panel.appendChild(mk('div','No parameters yet. Add: export const params = [{ k: "count", label: "Count", min: 1, max: 50, def: 10, step: 1 }]','opacity:.7'));}
    state.schema.forEach(p=>{
      const row=mk('label',null,'display:flex;gap:10px;align-items:center;min-height:44px');row.appendChild(mk('span',p.label,'width:120px;flex:none'));
      if(p.t==='r'){const i=document.createElement('input');i.type='range';i.min=p.min;i.max=p.max;i.step=p.step||.01;i.value=state.params[p.k];i.style.flex='1';const o=mk('output',String(state.params[p.k]),'width:56px;text-align:right');i.addEventListener('input',()=>{state.params[p.k]=+i.value;o.textContent=i.value;runSoon();});row.append(i,o);}
      else if(p.t==='b'){const i=document.createElement('input');i.type='checkbox';i.checked=!!state.params[p.k];i.addEventListener('change',()=>{state.params[p.k]=i.checked;run();});row.appendChild(i);}
      else if(p.t==='c'){const s2=document.createElement('select');p.opts.forEach((n,k)=>{const o=document.createElement('option');o.value=k;o.textContent=n;s2.appendChild(o);});s2.value=state.params[p.k];s2.addEventListener('change',()=>{state.params[p.k]=+s2.value;run();});row.appendChild(s2);}
      else if(p.t==='color'){const i=document.createElement('input');i.type='color';i.value=state.params[p.k];i.addEventListener('input',()=>{state.params[p.k]=i.value;runSoon();});row.appendChild(i);}
      panel.appendChild(row);});
    const r=mk('div',null,'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px');
    const seed=document.createElement('input');seed.type='number';seed.value=state.seed;seed.setAttribute('aria-label','Seed');seed.style.cssText='width:110px;min-height:44px;background:#161616;color:#f2efe9;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px';seed.addEventListener('change',()=>{state.seed=(+seed.value)>>>0;run();});
    r.append(mk('span','Seed','align-self:center'),seed,bt('Random',()=>{state.seed=(Math.random()*4294967295)>>>0;seed.value=state.seed;run();}),bt('Reset values',()=>{state.params=defaultsOf(state.schema);drawPanel();run();}));
    panel.appendChild(r);
  }
  sel.addEventListener('change',async()=>{
    const v=sel.value;sel.value='';if(!v)return;
    if(v==='starter'){state.schema=[];state.params={};state.seed=7;state.mats={};matCache.clear();state.framed=false;setCode(STARTER);await run();return;}
    try{const j=await (await fetch(v)).json(),d=validateFormFile(j).doc;if(!d)throw new Error('That example can’t be read.');
      state.schema=d.params;state.params=defaultsOf(d.params);state.seed=d.seed;state.name=d.name;state.data=d.data||null;state.mats=(d.defaults&&d.defaults.materials)||{};matCache.clear();state.framed=false;
      setCode(/export\s+const\s+params/.test(d.code)?d.code:'export const params = '+JSON.stringify(d.params,null,2)+';\n\n'+d.code);drawPanel();await run();}
    catch(e){err.textContent=String(e.message||e);}
  });
  const docOf=()=>{const code=getCode();return {n0form:1,id:'me.'+(state.name||'object').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,24).replace(/^-|-$/g,'')||'me.object',name:state.name||'My object',version:'1.0.0',apiVersion:API_VERSION,author:'me',licence:'CC0-1.0',seed:state.seed,params:state.schema.map(p=>({...p,def:state.params[p.k]!==undefined?state.params[p.k]:p.def})),code,animated:state.animated,data:state.data||undefined,defaults:{materials:state.mats}};};
  async function send(){
    await run();if(err.textContent)return;
    try{await handoffPut(new Blob([JSON.stringify(docOf())],{type:'application/json'}),{from:'lab',form:true});location.href='studio.html#from=lab';}catch(e){status.textContent='Couldn’t send: '+(e.message||e);}
  }
  function download(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(docOf(),null,1)],{type:'application/json'}));a.download=(docOf().name||'object').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.n0form';document.body.appendChild(a);a.click();a.remove();}
  state.schema=[{k:'count',label:'Count',t:'r',min:3,max:80,def:24,step:1},{k:'height',label:'Height',t:'r',min:.5,max:5,def:2.5,step:.1}];state.params=defaultsOf(state.schema);
  drawPanel();fit();await run({frame:true});
  window.__labForm={run,state,getCode,setCode,send,docOf,render:()=>{controls.update();renderer.render(scene,cam);},canvas:cv};
}
