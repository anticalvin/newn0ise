// Fails if src/core has a circular import. Run: node tools/check-cycles.mjs
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve('src/core'),files=[];
(function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);f.isDirectory()?walk(p):p.endsWith('.js')&&files.push(p);}})(root);
const deps=new Map();
for(const f of files){const s=fs.readFileSync(f,'utf8');const out=[];
  for(const m of s.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s*['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g)){
    const r=path.resolve(path.dirname(f),m[1]||m[2]);if(files.includes(r))out.push(r);}
  deps.set(f,out);}
const state=new Map(),stack=[],cycles=new Set();
(function dfs(n){state.set(n,1);stack.push(n);for(const d of deps.get(n)){if(state.get(d)===1){cycles.add(stack.slice(stack.indexOf(d)).concat(d).map(x=>path.relative(root,x)).join(' -> '));}else if(!state.get(d))dfs(d);}stack.pop();state.set(n,2);})
.call(null,files[0]);
for(const f of files)if(!state.get(f))(function dfs(n){state.set(n,1);stack.push(n);for(const d of deps.get(n)){if(state.get(d)===1)cycles.add(stack.slice(stack.indexOf(d)).concat(d).map(x=>path.relative(root,x)).join(' -> '));else if(!state.get(d))dfs(d);}stack.pop();state.set(n,2);})(f);
if(cycles.size){console.error('circular imports in src/core:\n'+[...cycles].join('\n'));process.exit(1);}
console.log('no circular imports in src/core ('+files.length+' modules)');
