#!/usr/bin/env node
/* Package a world: node tools/n0world-pack.mjs world.json [out.n0world] [assetsDir]
   Validates first (and refuses a world that can't be built), then writes a zip with world.json and, if given, the files from assetsDir under assets/.
   Version 1 doesn't use assets yet, so they are stored for later versions and the app reports them as ignored. */
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join,basename} from 'node:path';
import {validateWorld,LIMITS} from '../src/world-schema.js';
const [,,inp,out0,assets]=process.argv;
if(!inp){console.log('Usage: node tools/n0world-pack.mjs world.json [out.n0world] [assetsDir]');process.exit(2);}
const text=readFileSync(inp,'utf8'),v=validateWorld(text);
console.log(v.report.toText('Report for '+inp));
if(!v.ok){console.log('Not packed: fix the errors above first.');process.exit(1);}
const files=[['world.json',Buffer.from(JSON.stringify(v.doc,null,1))]];
if(assets){const walk=(d,pre)=>{for(const n of readdirSync(d)){const p=join(d,n),st=statSync(p);if(st.isDirectory())walk(p,pre+n+'/');else{
  if(st.size>LIMITS.asset){console.log('Skipped '+p+': larger than '+LIMITS.asset/1048576+' MB.');continue;}
  if(!/^[A-Za-z0-9_.\/-]+$/.test(pre+n)){console.log('Skipped '+p+': file names use letters, numbers, - _ . only.');continue;}
  files.push(['assets/'+pre+n,readFileSync(p)]);}}};walk(assets,'');}
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const parts=[],cen=[];let off=0;
for(const [name,data] of files){const nb=Buffer.from(name),c=crc(data),h=Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0,6);h.writeUInt16LE(0,8);h.writeUInt32LE(0,10);h.writeUInt32LE(c,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(nb.length,26);h.writeUInt16LE(0,28);
  parts.push(h,nb,data);
  const e=Buffer.alloc(46);e.writeUInt32LE(0x02014b50,0);e.writeUInt16LE(20,4);e.writeUInt16LE(20,6);e.writeUInt32LE(c,16);e.writeUInt32LE(data.length,20);e.writeUInt32LE(data.length,24);e.writeUInt16LE(nb.length,28);e.writeUInt32LE(off,42);cen.push(e,nb);
  off+=30+nb.length+data.length;}
const cd=Buffer.concat(cen),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(off,16);
const out=out0||basename(inp).replace(/\.(json|n0world)$/,'')+'.pack.n0world';
writeFileSync(out,Buffer.concat([...parts,cd,end]));console.log('Wrote '+out+' ('+files.length+' file'+(files.length>1?'s':'')+').');
