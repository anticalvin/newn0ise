/* Loads, validates, test-compiles and registers .n0fx plugins. Plugins are data plus a GLSL body: nothing here ever evaluates plugin JavaScript. */
import {validatePlugin,hashPlugin,API_VERSION} from './plugins.js';
const KEY='n0ise.plugins';
export const SAFE=/[?&]safe=1/.test(location.search);
export function createPluginHost(c){
  const {defineModule,MODULES,SS,histBind,histSave,CAMS,RECIPES,ST,VS,HEAD,GLSL_LIB,toast,onChange}=c;
  const H={items:[],cost:{}};
  const store=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return[];}};
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(H.items.map(i=>({j:i.j,on:i.on,hash:i.hash}))));}catch(e){toast('Couldn’t save plugins: storage is full.');}};
  const builtin=()=>new Set(Object.keys(MODULES).filter(k=>!H.items.some(i=>i.j.id===k)));
  const decl=ps=>ps.map(p=>p.t==='color'?`uniform vec3 u_${p.k};`:`uniform float u_${p.k};`).join('\n');
  const toParams=j=>(j.params||[]).map(p=>({t:p.t||'r',step:p.step||1,sec:p.hero?'Main':'Advanced',...p}));
  const sourceOf=j=>SS+(j.feedback?'uniform sampler2D u_prev;uniform float u_reset;\n':'')+j.glsl;

  /* Compile and draw once in a throwaway context. A slow or failing shader is rejected before it can touch the real engine. */
  H.probe=(j)=>{
    const out={ok:true,ms:0,log:''};
    if(j.kind!=='effect'&&j.kind!=='generator')return out;
    let cv,gl;
    try{cv=document.createElement('canvas');cv.width=cv.height=256;gl=cv.getContext('webgl2',{failIfMajorPerformanceCaveat:false});}catch(e){}
    if(!gl)return{ok:true,ms:0,log:'No test context here; skipped the compile test.'};
    try{
      const ps=toParams(j),fsrc=HEAD+GLSL_LIB+'uniform sampler2D uSrc,uAux;uniform vec2 uRes;uniform float uTime,uSeed;\n'+decl(ps)+'\n'+sourceOf(j)+'\nvoid main(){o=vec4(fx(vUv).rgb,1.);}';
      const sh=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'compile error');return s;};
      const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fsrc));gl.linkProgram(pr);
      if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr)||'link error');
      gl.useProgram(pr);
      const tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(16).fill(128));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      const u=n=>gl.getUniformLocation(pr,n);if(u('uRes'))gl.uniform2f(u('uRes'),256,256);
      ['uSrc','uAux','u_prev'].forEach(n=>{if(u(n))gl.uniform1i(u(n),0);});
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.viewport(0,0,256,256);
      const t0=performance.now();for(let i=0;i<3;i++)gl.drawArrays(gl.TRIANGLES,0,3);gl.finish();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
      out.ms=(performance.now()-t0)/3;
      if(gl.isContextLost())throw new Error('The test context was lost. This effect is too heavy for the GPU.');
      if(out.ms>60){out.ok=false;out.log='Too slow: '+out.ms.toFixed(0)+' ms for a 256 × 256 test frame. Reduce loops or texture reads.';}
    }catch(e){out.ok=false;out.log=String(e.message||e).split('\n').slice(0,4).join(' | ').replace(/^ERROR: 0:(\d+)/,(m,l)=>'line '+(+l)+' of the combined shader');}
    try{const x=gl.getExtension('WEBGL_lose_context');x&&x.loseContext();}catch(e){}
    return out;
  };
  H.check=(j)=>{const r=validatePlugin(j,{builtinIds:builtin(),installed:new Set(H.items.map(i=>i.j.id))});if(r.ok){const p=H.probe(j);if(!p.ok)r.errors.push(p.log);r.ms=p.ms;r.ok=r.errors.length===0;r.probe=p.log;}return r;};

  function register(j){
    if(j.kind==='effect'||j.kind==='generator'){
      const jump={t:-1e9,clean:false};
      defineModule({id:j.id,family:j.kind==='generator'?'Source':(j.family||'Community'),name:j.name,community:true,params:toParams(j),hist:!!j.feedback,frag:sourceOf(j),
        bind:j.feedback?(pr,V,ctx)=>{const r=ctx.t<jump.t-1e-4||ctx.t-jump.t>.5||(ST.clean&&!jump.clean);jump.t=ctx.t;jump.clean=!!ST.clean;pr.f('u_reset',r?1:0);histBind(pr,j.id,ctx);}:undefined,
        after:j.feedback?(pr,V,ctx)=>histSave(j.id,ctx):undefined});
    }else if(j.kind==='macro'){
      RECIPES.push({name:j.name,note:j.description||'Macro by '+j.author,layers:j.layers.map(l=>[l.module,l.params||{}]),plugin:j.id});
    }else if(j.kind==='pack'){
      (j.recipes||[]).forEach(r=>RECIPES.push({name:r.name,note:r.note||j.name,layers:r.layers.map(l=>[l.module,l.params||{}]),plugin:j.id}));
      (j.cameras||[]).forEach(cm=>{if(!CAMS.some(x=>x.id==='p_'+cm.id))CAMS.push({id:'p_'+cm.id,cat:'Community',name:cm.name,sub:cm.sub||('By '+j.author),sim:cm.sim||'clean',aspect:cm.aspect||'3:4',ov:{},glyph:'wave',mods:cm.mods,plugin:j.id});});
    }
  }
  function unregister(j){
    if(MODULES[j.id]){MODULES[j.id].hidden=true;}
    for(let i=RECIPES.length-1;i>=0;i--)if(RECIPES[i].plugin===j.id)RECIPES.splice(i,1);
    for(let i=CAMS.length-1;i>=0;i--)if(CAMS[i].plugin===j.id)CAMS.splice(i,1);
  }
  H.install=async(j,{silent}={})=>{
    const r=H.check(j);if(!r.ok)return r;
    const hash=await hashPlugin(j),old=H.items.findIndex(i=>i.j.id===j.id);
    if(old>=0){unregister(H.items[old].j);H.items.splice(old,1);if(MODULES[j.id]){MODULES[j.id].hidden=false;MODULES[j.id].replaced=true;}}
    try{
      if(MODULES[j.id]&&(j.kind==='effect'||j.kind==='generator')){const m=MODULES[j.id];m.prog=null;m.cache={};m.params.length=0;toParams(j).forEach(p=>m.params.push(p));toast('Updated “'+j.name+'”. Reload to see every change.');}
      else register(j);
    }catch(e){return{ok:false,errors:[String(e.message||e)],warnings:[]};}
    H.items.push({j,on:true,hash});save();onChange&&onChange();if(!silent)toast('Installed “'+j.name+'” (community plugin).');return r;
  };
  H.remove=id=>{const i=H.items.findIndex(x=>x.j.id===id);if(i<0)return;unregister(H.items[i].j);H.items.splice(i,1);save();onChange&&onChange();toast('Removed. Layers that used it are hidden until you reinstall it.');};
  H.setOn=(id,on)=>{const it=H.items.find(x=>x.j.id===id);if(!it)return;it.on=on;if(on){if(MODULES[id])MODULES[id].hidden=false;else register(it.j);}else unregister(it.j);save();onChange&&onChange();};
  H.duplicate=id=>{const it=H.items.find(x=>x.j.id===id);if(!it)return null;const j=JSON.parse(JSON.stringify(it.j));j.id='my.'+(id.split('.')[1]||'copy')+'-'+Math.random().toString(36).slice(2,5);j.name=it.j.name+' (my version)';j.author='me';return j;};
  H.load=async()=>{
    if(SAFE){H.safe=true;store().forEach(s=>H.items.push({j:s.j,on:false,hash:s.hash||''}));return;}
    for(const s of store()){
      const it={j:s.j,on:s.on!==false,hash:s.hash||''};H.items.push(it);if(!it.on)continue;
      const r=validatePlugin(s.j,{builtinIds:new Set(Object.keys(MODULES).filter(k=>k!==s.j.id)),installed:new Set()});
      if(!r.ok){it.on=false;it.broken=r.errors[0];continue;}
      try{register(s.j);}catch(e){it.on=false;it.broken=String(e.message||e);}
    }
  };
  H.API_VERSION=API_VERSION;
  return H;
}
