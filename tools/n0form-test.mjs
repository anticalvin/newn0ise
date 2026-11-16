#!/usr/bin/env node
/* Run generators headlessly: node tools/n0form-test.mjs file.n0form [more...]   (also used for the determinism test: --twice)
   Runs the same FORM runtime the app's worker uses (inside a Node vm with a time limit), validates what comes back, and prints vertex and
   instance counts, regeneration time and a geometry hash. Exit code 1 on any failure. */
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {RUNTIME_SRC,LIMITS} from '../src/form-runtime.js';
import {validateFormFile,validateOutput,defaultsOf} from '../src/form-schema.js';
export function runForm(code,{seed=1,params={},data=null,time=0,ms=LIMITS.ms}={}){
  const ctx=vm.createContext({});vm.runInContext(RUNTIME_SRC,ctx);
  ctx.__in={code,input:{seed,params,limits:LIMITS,time,data}};
  const t0=performance.now();
  let res;try{res=vm.runInContext('__runForm(__in.code,__in.input)',ctx,{timeout:ms});}catch(e){return{ok:false,error:{message:'Stopped: this generator took longer than '+ms+' ms.',limit:'time'},ms:performance.now()-t0};}
  const r=res.ok?validateOutput(res):{ok:false,error:res.error};r.ms=performance.now()-t0;if(res.ok){r.schema=res.schema;r.hash=res.stats.hash;}return r;
}
if(process.argv[1]&&process.argv[1].endsWith('n0form-test.mjs')){
  const files=process.argv.slice(2).filter(a=>!a.startsWith('--')),twice=process.argv.includes('--twice');let bad=0;
  if(!files.length){console.log('Usage: node tools/n0form-test.mjs file.n0form [--twice]');process.exit(2);}
  for(const f of files){
    const v=validateFormFile(readFileSync(f,'utf8'));
    if(!v.ok){console.log('FAIL '+f);console.log(v.report.toText('Report'));bad++;continue;}
    const d=v.doc,p=defaultsOf(d.params);const r=runForm(d.code,{seed:d.seed,params:p,data:d.data});
    if(!r.ok){console.log('FAIL '+f+': '+r.error.message+(r.error.line?' (line '+r.error.line+')':''));bad++;continue;}
    let det='';if(twice){const r2=runForm(d.code,{seed:d.seed,params:p,data:d.data});det=r2.hash===r.hash?'  deterministic':'  NOT DETERMINISTIC';if(r2.hash!==r.hash)bad++;}
    console.log('OK   '+f+'  '+r.stats.vertices+' vertices, '+r.stats.instances+' instances, '+r.stats.triangles+' triangles, '+r.stats.nodes+' objects, '+r.ms.toFixed(0)+' ms, hash '+r.hash+det);
    if(v.report.items.length)console.log(v.report.toText('Report'));
  }
  process.exit(bad?1:0);
}
