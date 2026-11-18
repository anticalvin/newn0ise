#!/usr/bin/env node
/* Check .n0world files from the command line: node tools/n0world-validate.mjs file.n0world [more...]
   Prints the same report the app shows, written so it can be pasted back to an AI. Exit code 1 if a file can't be built. */
import {readFileSync} from 'node:fs';
import {validateWorld} from '../src/world-schema.js';
let bad=0;
for(const f of process.argv.slice(2)){
  let t;try{t=readFileSync(f,'utf8');}catch(e){console.log('ERROR '+f+': '+e.message);bad++;continue;}
  const v=validateWorld(t);
  console.log((v.ok?'OK   ':'FAIL ')+f+(v.ok?'  ('+v.stats.instances+' objects, '+v.stats.rules+' rules, '+v.stats.lights+' lights)':''));
  if(v.report.items.length)console.log(v.report.toText('Report for '+f));
  if(!v.ok)bad++;
}
if(!process.argv[2]){console.log('Usage: node tools/n0world-validate.mjs file.n0world');process.exit(2);}
process.exit(bad?1:0);
