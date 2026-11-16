/* Shared by every import path (tools .n0fx, worlds .n0world): a report that reads well when pasted back to an AI, a short content hash, a size-capped
   file reader and a few number helpers. Pure: no DOM, so the command-line validators use it too. */
export class Report{
  constructor(){this.items=[];}
  /* level: 'error' (could not use it), 'fix' (repaired, here is what changed), 'warn' (kept, but check it), 'note' */
  add(level,path,msg){this.items.push({level,path,msg});return this;}
  get errors(){return this.items.filter(i=>i.level==='error');}
  get fixes(){return this.items.filter(i=>i.level==='fix');}
  get warns(){return this.items.filter(i=>i.level==='warn');}
  get ok(){return this.errors.length===0;}
  toText(head='n0ise import report'){
    if(!this.items.length)return head+': no problems.';
    const tag={error:'ERROR',fix:'FIXED',warn:'CHECK',note:'NOTE'};
    return head+' ('+this.errors.length+' errors, '+this.fixes.length+' repaired, '+this.warns.length+' to check):\n'+this.items.map(i=>'- '+tag[i.level]+' '+(i.path?i.path+': ':'')+i.msg).join('\n');
  }
}
export async function hashJson(j){
  const t=new TextEncoder().encode(typeof j==='string'?j:JSON.stringify(j));
  try{const h=await (globalThis.crypto||{}).subtle.digest('SHA-256',t);return [...new Uint8Array(h)].slice(0,6).map(b=>b.toString(16).padStart(2,'0')).join('');}
  catch(e){let h=0;for(const b of t)h=(h*31+b)>>>0;return h.toString(16).padStart(8,'0');}
}
export const isNum=v=>typeof v==='number'&&isFinite(v);
export const clampN=(v,lo,hi,d)=>isNum(v)?Math.min(hi,Math.max(lo,v)):d;
export const isHex=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
export const clone=o=>JSON.parse(JSON.stringify(o));
export async function readCapped(file,cap){if(file.size>cap)throw new Error('That file is '+(file.size/1024|0)+' KB. The limit is '+(cap/1024|0)+' KB.');return file.text();}
