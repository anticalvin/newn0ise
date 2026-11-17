// Packs the MakeHuman core assets (CC0: base mesh, targets, default skeleton and weights) into two small files the Character page loads:
//   assets/human/human.json  manifest (bones, joints, modifiers, target table)
//   assets/human/human.bin   base positions, skinned body mesh, skin weights and every morph target as sparse int16 deltas
// Source: https://github.com/makehumancommunity/makehuman  (assets are CC0 1.0, see LICENSE.md section C; the program code there is AGPL and is NOT used).
// Run: node tools/pack-human.mjs   (needs network; the output is committed so the site stays static)
import fs from 'node:fs';
const SHA='a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
const RAW=`https://raw.githubusercontent.com/makehumancommunity/makehuman/${SHA}/makehuman/data/`;
const get=async p=>{for(let i=0;i<4;i++){try{const r=await fetch(RAW+p);if(r.status===404)return null;if(!r.ok)throw new Error(r.status);return await r.text();}catch(e){if(i===3)throw e;await new Promise(r=>setTimeout(r,600*(i+1)));}}};
const out='assets/human';fs.mkdirSync(out,{recursive:true});
const NV_BODY=13380; // the first 13380 vertices are the body; the rest are helper geometry (joints, tongue ...)

/* ---- base mesh ---- */
const obj=(await get('3dobjs/base.obj')).split('\n');
const V=[],VT=[],bodyF=[];let grp='';const joints={};
for(const l of obj){
  if(l[0]==='v'&&l[1]===' '){const a=l.trim().split(/\s+/);V.push(+a[1],+a[2],+a[3]);}
  else if(l[0]==='v'&&l[1]==='t'){const a=l.trim().split(/\s+/);VT.push(+a[1],+a[2]);}
  else if(l[0]==='g')grp=l.split(/\s+/)[1];
  else if(l[0]==='f'&&grp==='body'){bodyF.push(l.trim().split(/\s+/).slice(1).map(t=>t.split('/').map(Number)));}
}
const NV=V.length/3;
/* expand to (vertex, uv) pairs so UV seams split; keep a map back to the base vertex (targets move base vertices) */
const key=new Map(),vmap=[],uv=[],idx=[];
const vert=(vi,ti)=>{const k=vi+'/'+ti;let r=key.get(k);if(r===undefined){r=vmap.length;key.set(k,r);vmap.push(vi-1);uv.push(VT[(ti-1)*2],VT[(ti-1)*2+1]);}return r;};
for(const f of bodyF){const q=f.map(p=>vert(p[0],p[1]));for(let i=1;i<q.length-1;i++)idx.push(q[0],q[i],q[i+1]);}
console.log('base verts',NV,'body expanded',vmap.length,'tris',idx.length/3);

/* ---- skeleton ---- */
const sk=JSON.parse(await get('rigs/default.mhskel'));
const wf=JSON.parse(await get('rigs/default_weights.mhw'));
const names=Object.keys(sk.bones),order=[];const seen=new Set();
const visit=n=>{if(seen.has(n))return;const p=sk.bones[n].parent;if(p)visit(p);seen.add(n);order.push(n);};names.forEach(visit);
const bi=new Map(order.map((n,i)=>[n,i]));
const bones=order.map(n=>{const b=sk.bones[n];return {n,p:b.parent?bi.get(b.parent):-1,h:sk.joints[b.head],t:sk.joints[b.tail]};});
/* top 4 influences per base vertex */
const inf=Array.from({length:NV_BODY},()=>[]);
for(const [bn,list] of Object.entries(wf.weights)){const b=bi.get(bn);if(b===undefined)continue;for(const [v,w] of list)if(v<NV_BODY)inf[v].push([b,w]);}
const skinI=new Uint8Array(vmap.length*4),skinW=new Uint8Array(vmap.length*4);
for(let i=0;i<vmap.length;i++){const a=inf[vmap[i]].sort((x,y)=>y[1]-x[1]).slice(0,4);let s=a.reduce((t,x)=>t+x[1],0)||1;let acc=0;
  for(let k=0;k<4;k++){const e=a[k]||[0,0];skinI[i*4+k]=e[0];const w=Math.round(e[1]/s*255);skinW[i*4+k]=k===0?0:w;acc+=k===0?0:w;}
  skinW[i*4]=Math.max(0,255-acc);} // first slot takes the rounding remainder so each vertex sums to 255

/* ---- modifiers (curated groups from the MakeHuman modifier list) ---- */
const mods=JSON.parse(await get('modifiers/modeling_modifiers.json'));
const GROUPS=['head','forehead','eyebrows','neck','eyes','nose','mouth','ears','chin','cheek','torso','hip','stomach','buttocks','armslegs'];
const files=new Map(); // target name -> path
const detail=[];
for(const g of mods){
  if(!GROUPS.includes(g.group))continue;
  for(const m of g.modifiers){
    if(!m.target)continue;
    let t=m.target;const side=/^[lr]-/.test(t)?t[0]:null,base=side?t.slice(2):t;
    const mk=(v)=>g.group+'/'+t+(v?'-'+v:'');
    const id=g.group+'/'+base+(m.min?'-'+m.min+'-'+m.max:'');
    const e={id,group:g.group,name:base,bi:!!m.min,lo:m.min||null,hi:m.max||null,files:[]};
    if(m.min){e.files=[[mk(m.min),-1],[mk(m.max),1]];}else e.files=[[mk(''),1]];
    const ex=detail.find(d=>d.id===id);
    if(ex){ex.files.push(...e.files);}else detail.push(e);
  }
}
const need=new Set();
const tpath=n=>'targets/'+n+'.target';
for(const d of detail)for(const [f] of d.files)need.add(f);
/* macro targets */
const G=['female','male'],A=['baby','child','young','old'],M=['minmuscle','averagemuscle','maxmuscle'],W=['minweight','averageweight','maxweight'],R=['african','asian','caucasian'];
for(const r of R)for(const g of G)for(const a of A)need.add(`macrodetails/${r}-${g}-${a}`);
for(const g of G)for(const a of A)for(const m of M)for(const w of W)need.add(`macrodetails/universal-${g}-${a}-${m}-${w}`);
for(const g of G)for(const h of['minheight','maxheight'])need.add(`macrodetails/height/${g}-young-averagemuscle-averageweight-${h}`);
for(const g of G)for(const p of['idealproportions','uncommonproportions'])need.add(`macrodetails/proportions/${g}-young-averagemuscle-averageweight-${p}`);
/* expression units (caucasian set) */
const EXPR=['eye-left-closure','eye-right-closure','eyebrows-left-up','eyebrows-right-up','eyebrows-left-down','eyebrows-right-down','eyebrows-left-inner-up','eyebrows-right-inner-up','mouth-open','mouth-corner-puller','mouth-depression','mouth-pursing','mouth-elevation','nose-compression','eye-left-opened-up','eye-right-opened-up'];
for(const e of EXPR)need.add('expression/units/caucasian/'+e);

const tgt=new Map();let fetched=0;
const list=[...need];
async function worker(){while(list.length){const n=list.pop();const t=await get(tpath(n));fetched++;if(t===null){tgt.set(n,null);continue;}
  const ix=[],dl=[];for(const l of t.split('\n')){if(!l||l[0]==='#')continue;const a=l.trim().split(/\s+/);if(a.length<4)continue;ix.push(+a[0]);dl.push(+a[1],+a[2],+a[3]);}
  tgt.set(n,{ix,dl});}}
await Promise.all(Array.from({length:6},worker));
const missing=[...tgt].filter(([,v])=>!v).map(([k])=>k);console.log('targets',tgt.size,'missing',missing.length,missing.slice(0,8));

/* ---- binary ---- */
const parts=[];let off=0;
const put=(ta)=>{const o=off;const b=Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength);parts.push(b);off+=b.length;const pad=(4-off%4)%4;if(pad){parts.push(Buffer.alloc(pad));off+=pad;}return o;};
const man={sha:SHA,nv:NV,nvBody:NV_BODY,n:vmap.length,bones,units:'1 unit = 10 cm (MakeHuman)'};
man.base=put(new Float32Array(V));man.vmap=put(new Uint16Array(vmap));man.uv=put(new Float32Array(uv));man.idx=put(new Uint16Array(idx));man.nIdx=idx.length;man.skinI=put(skinI);man.skinW=put(skinW);
const SC=1/2000;man.sc=SC;const T={};let tsum=0;
fs.rmSync(out+'/t',{recursive:true,force:true});fs.mkdirSync(out+'/t',{recursive:true});
for(const [n,v] of tgt){if(!v)continue;const k=v.ix.length;if(!k)continue;const ia=new Uint16Array(k+(k%2)),da=new Int16Array(k*3);for(let i=0;i<k;i++){ia[i]=v.ix[i];for(let c=0;c<3;c++)da[i*3+c]=Math.max(-32767,Math.min(32767,Math.round(v.dl[i*3+c]/SC)));}
  fs.writeFileSync(out+'/t/'+n.replace(/\//g,'~')+'.bin',Buffer.concat([Buffer.from(ia.buffer),Buffer.from(da.buffer)]));T[n]={k};tsum+=k;}
man.targets=T;
man.detail=detail.map(d=>({...d,files:d.files.filter(([f])=>T[f]).map(([f,s])=>[f,s])})).filter(d=>d.files.length);
man.expr=EXPR;
const bin=Buffer.concat(parts);fs.writeFileSync(out+'/human.bin',bin);fs.writeFileSync(out+'/human.json',JSON.stringify(man));
console.log('core human.bin',(bin.length/1048576).toFixed(2),'MB; detail modifiers',man.detail.length,'target verts',tsum);
