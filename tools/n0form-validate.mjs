#!/usr/bin/env node
/* Check .n0form files and run their generators headlessly: node tools/n0form-validate.mjs file.n0form [more...] [--time 14] [--twice]
   Prints the same report the app shows (written to be pasted back to an AI), then vertex/instance counts, regeneration time and a geometry hash. */
import {readFileSync} from 'node:fs';
import {validateFormFile,defaultsOf} from '../src/form-schema.js';
import {runForm} from './n0form-test.mjs';
const a=process.argv.slice(2),files=a.filter((x,i)=>!x.startsWith('--')&&a[i-1]!=='--time'),twice=a.includes('--twice'),ti=a.indexOf('--time'),time=ti>=0?+a[ti+1]:0;let bad=0;
if(!files.length){console.log('Usage: node tools/n0form-validate.mjs file.n0form [--time seconds] [--twice]');process.exit(2);}
for(const f of files){
  const v=validateFormFile(readFileSync(f,'utf8'));
  if(v.report.items.length)console.log(v.report.toText('Report for '+f));
  if(!v.ok){console.log('FAIL '+f);bad++;continue;}
  const d=v.doc,o={seed:d.seed,params:defaultsOf(d.params),data:d.data,time},r=runForm(d.code,o);
  if(!r.ok){console.log('FAIL '+f+': '+r.error.message+(r.error.line?' (line '+r.error.line+')':''));bad++;continue;}
  let det='';if(twice){const r2=runForm(d.code,o);det=r2.hash===r.hash?'  deterministic':'  NOT DETERMINISTIC';if(r2.hash!==r.hash)bad++;}
  console.log('OK   '+f+'  '+r.stats.vertices+' vertices, '+r.stats.instances+' instances, '+r.stats.triangles+' triangles, '+r.stats.nodes+' objects, '+r.ms.toFixed(0)+' ms, hash '+r.hash+det);
}
process.exit(bad?1:0);
