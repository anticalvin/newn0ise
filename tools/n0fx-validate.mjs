/* Usage: node tools/n0fx-validate.mjs plugins/examples/*.n0fx
   Checks the format only. Whether the shader compiles on a GPU is checked inside the app (Plugins sheet, Test). */
import {readFileSync} from 'node:fs';
import {validatePlugin} from '../src/plugins.js';
let bad=0;
for(const f of process.argv.slice(2)){
  let j;try{j=JSON.parse(readFileSync(f,'utf8'));}catch(e){console.log(f+': not valid JSON ('+e.message+'). Check commas and quotes.');bad++;continue;}
  const r=validatePlugin(j);
  console.log((r.ok?'OK   ':'FAIL ')+f);r.errors.forEach(e=>console.log('  - '+e));r.warnings.forEach(w=>console.log('  ! '+w));
  if(!r.ok)bad++;
}
process.exit(bad?1:0);
