/* FORM objects in the 3D scene: an object that remembers the recipe that made it. Changing a parameter regenerates the geometry in place:
   the object keeps its id, transform, parent, material assignments, looks and physics, the old geometry stays until the new one is ready,
   and a newer change cancels one still running. The recipe (code, schema, params, seed, hash) is saved with the project and put in GLB extras. */
import {runGenerator,buildGroup,disposeGroup,isApproved,approve,codeHash,paletteOf,FORM_SAFE} from './form-host.js';
import {validateFormFile,defaultsOf} from './form-schema.js';
import {hashJson,clone} from './importkit.js';
import {LIMITS,API_VERSION} from './form-runtime.js';
export function createForms(c){
  const {THREE,S,addGroup,toast,bump,renderObjList,setShadowFlags,applyView,DOC,SURF,MAT,uPush,sliderRow,chipRow,btn,el,sec,selectObj,frameAll}=c;
  const F={items:new Set()};
  const T=(tag,t,st)=>{const e=document.createElement(tag);e.textContent=t;if(st)e.style.cssText=st;return e;};
  /* recipe from a validated .n0form document (or from Lab) */
  F.recipeFromDoc=doc=>({id:doc.id,name:doc.name,version:doc.version,author:doc.author,licence:doc.licence,code:doc.code,schema:clone(doc.params||[]),params:defaultsOf(doc.params||[]),seed:doc.seed,animated:!!doc.animated,data:doc.data||null,mats:clone((doc.defaults&&doc.defaults.materials)||{}),mat:(doc.defaults&&doc.defaults.mat)||null});
  /* ---- review gate: imported code never runs until a person has read it ---- */
  F.review=async(recipe,{origin='imported',reportText=''}={})=>{
    recipe.hash=await codeHash(recipe.code);
    if(origin==='local'||isApproved(recipe.hash)){approve(recipe.hash);return true;}
    if(FORM_SAFE){toast('Safe mode is on, so imported code is not run.',4000);return false;}
    return new Promise(resolve=>{
      document.querySelectorAll('.n0fsheet').forEach(x=>x.remove());
      const sh=document.createElement('div');sh.className='n0fsheet';sh.style.cssText='position:fixed;inset:0;z-index:95;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)';
      const box=document.createElement('div');box.className='glass';box.style.cssText='width:min(680px,100%);max-height:90dvh;overflow:auto;padding:16px;border-radius:18px 18px 0 0;background:rgba(18,18,20,.88);backdrop-filter:blur(22px);color:#f2efe9;font:14px/1.45 system-ui,sans-serif';
      sh.appendChild(box);
      box.append(T('h3','This file contains code','margin:0 0 6px;font-size:17px'),
        T('div','“'+recipe.name+'” by '+(recipe.author||'unknown')+' · '+(recipe.licence||'unspecified')+' · #'+recipe.hash.slice(0,8),'opacity:.8;margin-bottom:8px'),
        T('div','It runs in an isolated worker with no network and no access to your scene, and it is stopped if it takes too long or tries to make too much geometry. Read it first. Press Run only if you trust it. n0ise will remember this choice for this exact code.','margin-bottom:8px'));
      if(reportText)box.appendChild(T('pre',reportText,'white-space:pre-wrap;font:12px/1.45 ui-monospace,monospace;margin:0 0 8px;max-height:20dvh;overflow:auto'));
      const pre=T('pre',recipe.code,'white-space:pre-wrap;word-break:break-word;max-height:42dvh;overflow:auto;background:#0d0c0b;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:10px;font:12px/1.45 ui-monospace,monospace;margin:0 0 10px');box.appendChild(pre);
      const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
      const mk=(t,fn,pri)=>{const b=T('button',t,'min-height:44px;padding:8px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.28);background:'+(pri?'#f2efe9':'rgba(255,255,255,.08)')+';color:'+(pri?'#111':'#f2efe9')+';font:inherit');b.type='button';b.addEventListener('click',fn);return b;};
      row.append(mk('Review and run',()=>{approve(recipe.hash);sh.remove();resolve(true);},true),mk('Cancel',()=>{sh.remove();resolve(false);}));
      box.appendChild(row);document.body.appendChild(sh);
    });
  };
  /* ---- make, regenerate ---- */
  const matCacheFor=f=>{
    if(f.mc)return f.mc;
    const cache=new Map();
    f.mc=name=>{const key=name||'default';if(cache.has(key))return cache.get(key);
      const d=(f.recipe.mats&&f.recipe.mats[key])||{},m=new THREE.MeshStandardMaterial({color:d.color||paletteOf(key),roughness:d.roughness!=null?d.roughness:.6,metalness:d.metalness||0,side:THREE.DoubleSide});
      if(d.emissive){m.emissive.set(d.emissive);m.emissiveIntensity=1;}m.userData.formMat=key;cache.set(key,m);return m;};
    f.mc.all=()=>[...cache.entries()];return f.mc;};
  const solidBoxes=o=>{if(!o.vis||!o.holder.visible)return[];const out=[];o.holder.updateMatrixWorld(true);o.holder.traverse(n=>{if(!n.userData.solid||!(n.isMesh))return;const b=new THREE.Box3().setFromObject(n);if(!b.isEmpty())out.push(b);});return out;};
  async function make(recipe,{pos,name,origin='imported',silent,reportText}={}){
    if(!await F.review(recipe,{origin,reportText}))return null;
    const res=await runGenerator(recipe);
    if(!res.ok){c.showError&&c.showError(recipe,res.error);toast(res.error.message,6000);return null;}
    const f={recipe,stats:res.stats,ms:res.ms,error:null,time:0,live:true,pending:null,duration:res.duration||0,t0:null};
    const built=buildGroup(THREE,res,{getMat:matCacheFor(f)});
    const o=addGroup(name||recipe.name,built.root,{noAuto:true,form:f,phys:{type:'none'}});
    o.meta.colliders=()=>solidBoxes(o);
    if(pos)o.holder.position.set(...pos);else if(c.autoPlace)c.autoPlace(o);
    o.holder.userData.n0form={id:recipe.id,name:recipe.name,version:recipe.version,seed:recipe.seed,hash:recipe.hash,params:recipe.params,apiVersion:API_VERSION,code:recipe.code,schema:recipe.schema};
    F.items.add(o);
    if(recipe.mat&&c.matPresets){const pr=c.matPresets.find(x=>x[0]===recipe.mat);if(pr)try{MAT.set(o,clone(pr[1]));}catch(e){}}
    setShadowFlags&&setShadowFlags(o.holder);applyView&&applyView();renderObjList&&renderObjList();bump();
    if(S.objs.length===1)frameAll&&frameAll();
    return o;
  }
  let pendingPatch=new Map(),timers=new Map();
  /* in place: keep the old geometry until the new one is ready, then swap. Resolves true when applied. */
  async function regen(o,patch={},{fromUndo=false,push=true}={}){
    const f=o.meta&&o.meta.form;if(!f)return false;
    if(patch.params)Object.assign(f.recipe.params,patch.params);
    if(patch.seed!=null)f.recipe.seed=patch.seed>>>0;
    if(patch.time!=null)f.time=patch.time;
    if(f.pending)f.pending.cancel();
    f.busy=true;F.status&&F.status(o);
    const run=runGenerator(f.recipe,{time:f.time});f.pending=run;
    const res=await run;
    if(f.pending!==run)return false; // a newer change took over
    f.pending=null;f.busy=false;
    if(!res.ok){f.error=res.error;F.status&&F.status(o);if(!res.error.cancelled)toast(res.error.message,6000);return false;}
    f.error=null;f.stats=res.stats;f.ms=res.ms;f.duration=res.duration||f.duration||0;
    const built=buildGroup(THREE,res,{getMat:matCacheFor(f)}),old=o.root;
    o.holder.add(built.root);o.holder.remove(old);o.root=built.root;disposeGroup(old);
    setShadowFlags&&setShadowFlags(o.holder);
    if(o.surf||o.mat)try{DOC.putAppearance(o,DOC.appearance(o));}catch(e){}
    applyView&&applyView();
    o.holder.userData.n0form.params=clone(f.recipe.params);o.holder.userData.n0form.seed=f.recipe.seed;
    o.holder.updateMatrixWorld(true);bump();F.status&&F.status(o);
    if(push&&!fromUndo&&uPush)uPush();
    return true;
  }
  /* sliders call this: coalesce quick changes into the latest one */
  function regenSoon(o,patch){
    const cur=pendingPatch.get(o.id)||{params:{}};Object.assign(cur.params,patch.params||{});if(patch.seed!=null)cur.seed=patch.seed;pendingPatch.set(o.id,cur);
    clearTimeout(timers.get(o.id));timers.set(o.id,setTimeout(()=>{const p=pendingPatch.get(o.id);pendingPatch.delete(o.id);regen(o,p);},140));
  }
  /* time-based recipes regenerate a few times a second while they are on screen; flagged in the panel and the object list */
  let lastTick=0;
  F.tick=t=>{
    if(t-lastTick<.2)return;lastTick=t;
    for(const o of F.items){const f=o.meta&&o.meta.form;if(!f||!f.recipe.animated||!f.live||f.busy||!o.vis||!o.holder.visible)continue;
      if(f.t0==null)f.t0=t;let tt=t-f.t0;if(f.duration&&tt>=f.duration){tt=f.duration;f.live=false;} // a growth that has finished stops regenerating
      regen(o,{time:tt},{push:false}).then(()=>{F.status&&F.status(o);});}
  };
  F.make=make;F.regen=regen;
  F.remove=o=>F.items.delete(o);
  F.snap=o=>{const f=o.meta&&o.meta.form;return f?{p:clone(f.recipe.params),s:f.recipe.seed}:null;};
  F.apply=(o,fm)=>{const f=o.meta&&o.meta.form;if(!f||!fm)return;if(JSON.stringify(fm.p)===JSON.stringify(f.recipe.params)&&fm.s===f.recipe.seed)return;regen(o,{params:fm.p,seed:fm.s},{fromUndo:true});};
  /* ---- inspector panel ---- */
  F.panel=(parent,o)=>{
    const f=o.meta.form,r=f.recipe,s=sec(parent,'Generator',r.name);
    const status=T('div','','font-size:12px;opacity:.8;margin:2px 0 6px');s.appendChild(status);
    F.status=oo=>{if(oo!==o)return;const st=f.stats||{};status.textContent=(f.error?'Error: '+f.error.message+(f.error.line?' (line '+f.error.line+')':''):(f.busy?'Regenerating… ':'')+(st.vertices!=null?st.vertices.toLocaleString()+' vertices · '+st.instances.toLocaleString()+' instances · '+(f.ms||0).toFixed(0)+' ms':''))+(r.animated&&f.live?' · LIVE (changes over time)':'');status.style.color=f.error?'#ff8a7a':'';};
    F.status(o);
    (r.schema||[]).forEach(p=>{
      if(p.t==='r')sliderRow(s,p.label,()=>r.params[p.k],v=>regenSoon(o,{params:{[p.k]:v}}),p.min,p.max,p.step||.01);
      else if(p.t==='b'){const b=btn(p.label+': '+(r.params[p.k]?'on':'off'),'',()=>{regen(o,{params:{[p.k]:!r.params[p.k]}}).then(()=>{b.textContent=p.label+': '+(r.params[p.k]?'on':'off');});});s.appendChild(b);}
      else if(p.t==='c')chipRow(s,p.opts.map((n,i)=>[String(i),n]),v=>String(r.params[p.k])===v,v=>regen(o,{params:{[p.k]:+v}}));
      else if(p.t==='color'){const lab=document.createElement('label');lab.className='chip';lab.textContent=p.label+' ';const i=document.createElement('input');i.type='color';i.value=r.params[p.k]||p.def;i.addEventListener('input',()=>regenSoon(o,{params:{[p.k]:i.value}}));lab.appendChild(i);s.appendChild(lab);}
    });
    const row=el('div','chips');
    row.append(btn('New seed','',()=>regen(o,{seed:(Math.random()*4294967295)>>>0})),btn('Reset values','',()=>regen(o,{params:defaultsOf(r.schema)})));
    if(r.animated)row.append(btn(f.live?'Pause live':'Resume live','',()=>{f.live=!f.live;F.status(o);}),btn('Replay','',()=>{f.t0=null;f.live=true;F.status(o);}));
    s.appendChild(row);
    const sd=el('div','note');sd.textContent='Seed '+r.seed+'. The same seed and values always make the same shape. Look, material, position and physics stay as they are.';s.appendChild(sd);
    /* materials the generator names */
    const names=f.mc&&f.mc.all?f.mc.all():[];
    if(names.length){const mr=el('div','chips');names.forEach(([n,m])=>{const lab=document.createElement('label');lab.className='chip';lab.textContent=n+' ';const i=document.createElement('input');i.type='color';i.value='#'+m.color.getHexString();i.addEventListener('input',()=>{m.color.set(i.value);r.mats=r.mats||{};r.mats[n]={...(r.mats[n]||{}),color:i.value};bump();});lab.appendChild(i);mr.appendChild(lab);});s.appendChild(mr);}
    const codeB=btn('Show code','',()=>{let pre=s.querySelector('pre');if(pre){pre.remove();return;}pre=T('pre',r.code,'white-space:pre-wrap;max-height:240px;overflow:auto;font:11px/1.4 ui-monospace,monospace;background:#0d0c0b;padding:8px;border-radius:6px');s.appendChild(pre);});
    const exB=btn('Download .n0form','',()=>{const doc={n0form:1,id:r.id||'me.form',name:r.name,version:r.version||'1.0.0',apiVersion:API_VERSION,author:r.author||'me',licence:r.licence||'CC0-1.0',seed:r.seed,params:(r.schema||[]).map(p=>({...p,def:r.params[p.k]!==undefined?r.params[p.k]:p.def})),code:r.code,animated:!!r.animated,defaults:{materials:r.mats||{}}};if(r.data)doc.data=r.data;c.deliver(new Blob([JSON.stringify(doc,null,1)],{type:'application/json'}),(r.name||'form').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.n0form');});
    s.appendChild(el('div','chips')).append(codeB,exB);
    s.appendChild(el('div','note')).textContent='Physics uses a box around the whole shape unless parts are marked solid. Parts marked solid in the code block you while walking.';
    return s;
  };
  /* ---- project files: the recipe goes in, geometry is rebuilt on open (after the review gate) ---- */
  F.projectItem=o=>{const f=o.meta.form,h=o.holder;return{kind:'form',tr:{p:h.position.toArray(),r:[h.rotation.x,h.rotation.y,h.rotation.z],s:h.scale.toArray()},vis:o.vis,name:o.name,recipe:{...f.recipe},phys:o.meta.phys||null};};
  F.fromItem=async it=>{
    const r=it.recipe;if(!r||typeof r.code!=='string'||r.code.length>LIMITS.code)throw new Error('A generator in this project is missing or too large.');
    const v=validateFormFile({n0form:1,id:/^[a-z0-9][a-z0-9_-]{1,23}\.[a-z0-9][a-z0-9_-]{1,31}$/.test(r.id||'')?r.id:'me.form',name:r.name||'Form',code:r.code,params:r.schema,seed:r.seed,animated:r.animated,data:r.data||undefined,version:r.version||'1.0.0',author:r.author||'unknown',licence:r.licence||'unspecified'});
    if(!v.ok)throw new Error((v.report.errors[0]||{}).msg||'invalid generator');
    const recipe=F.recipeFromDoc(v.doc);recipe.params={...recipe.params,...(r.params||{})};recipe.mats=r.mats||recipe.mats;
    const o=await make(recipe,{name:it.name,origin:'imported'});if(!o)return null;
    o.holder.position.fromArray(it.tr.p);o.holder.rotation.set(...it.tr.r);o.holder.scale.fromArray(it.tr.s);o.vis=it.vis!==false;o.holder.visible=o.vis;if(it.phys)o.meta.phys={...it.phys};
    return o;
  };
  return F;
}
