/* n0ise plugin format (.n0fx): one JSON file. This file is pure (no DOM) so the same checks run in the app and in tools/n0fx-validate.mjs.
   Plugins are declarative: a GLSL fragment body plus parameters, or data (cameras, recipes). No plugin ever runs JavaScript. */
export const API_VERSION=1;
export const LIMITS={json:200*1024,glsl:64*1024,params:16,texLookups:64,uniforms:16,name:60,desc:400};
const KINDS=['effect','generator','pack','macro'];
const PTYPES=['r','b','color','c'];
const ID_RE=/^[a-z0-9][a-z0-9_-]{1,23}\.[a-z0-9][a-z0-9_-]{1,31}$/;
const K_RE=/^[a-z][a-z0-9]{0,11}$/;
const RESERVED=new Set(['seed','prev','reset','orig']);
const str=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;

export function stripComments(s){return s.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\n]*/g,' ');}

/* Returns {ok, errors:[...], warnings:[...]}. Every message says what is wrong and how to fix it, so it can be pasted back to an AI. */
export function validatePlugin(j,{builtinIds=new Set(),installed=new Set()}={}){
  const errors=[],warnings=[],E=m=>errors.push(m),W=m=>warnings.push(m);
  if(!j||typeof j!=='object'||Array.isArray(j)){return{ok:false,errors:['The file must be a JSON object, like {"n0fx":1, "id":"you.myeffect", ...}.'],warnings};}
  if(JSON.stringify(j).length>LIMITS.json)E('The file is larger than '+(LIMITS.json/1024)+' KB. Remove unused data.');
  if(j.n0fx!==1)E('Missing "n0fx": 1. Add this exact line at the top of the object.');
  if(!str(j.id,64)||!ID_RE.test(j.id))E('"id" must look like author.name in lower case, for example "sam.waves". Letters, numbers, - and _ only, one dot.');
  else if(builtinIds.has(j.id))E('The id "'+j.id+'" is already used by a built-in effect. Choose another.');
  if(!str(j.name,LIMITS.name))E('"name" is required and must be under '+LIMITS.name+' characters.');
  if(!str(j.version,20))E('"version" is required, for example "1.0.0".');
  if(j.apiVersion!==API_VERSION)E('"apiVersion" must be '+API_VERSION+' (this app understands version '+API_VERSION+').');
  if(!str(j.author,60))E('"author" is required.');
  if(!str(j.licence,40))E('"licence" is required, for example "MIT", "CC0-1.0" or "All rights reserved".');
  if(!KINDS.includes(j.kind))E('"kind" must be one of: '+KINDS.join(', ')+'.');
  if(j.description!=null&&!str(j.description,LIMITS.desc))E('"description" must be text under '+LIMITS.desc+' characters.');
  if(j.family!=null&&!str(j.family,24))E('"family" must be short text such as "Color" or "Mine".');
  const params=j.params==null?[]:j.params;
  if(!Array.isArray(params))E('"params" must be a list.');
  else{
    if(params.length>LIMITS.params)E('Too many parameters ('+params.length+'). The limit is '+LIMITS.params+'.');
    const seen=new Set();
    params.forEach((p,i)=>{const at='params['+i+']';
      if(!p||typeof p!=='object'){E(at+' must be an object.');return;}
      if(!K_RE.test(p.k||''))E(at+'.k "'+p.k+'" must be 1 to 12 lower-case letters or digits, starting with a letter (it becomes the uniform u_'+(p.k||'name')+').');
      else if(RESERVED.has(p.k))E(at+'.k "'+p.k+'" is reserved. Pick another name.');
      else if(seen.has(p.k))E(at+'.k "'+p.k+'" is used twice.');
      seen.add(p.k);
      const t=p.t||'r';if(!PTYPES.includes(t))E(at+'.t "'+t+'" must be one of '+PTYPES.join(', ')+' (r = slider, b = switch, color, c = choice list).');
      if(!str(p.label,40))E(at+'.label is required (under 40 characters).');
      if(t==='r'){['min','max','def'].forEach(f=>{if(typeof p[f]!=='number'||!isFinite(p[f]))E(at+'.'+f+' must be a number for a slider.');});
        if(typeof p.min==='number'&&typeof p.max==='number'&&p.min>=p.max)E(at+': min must be smaller than max.');
        if(typeof p.def==='number'&&typeof p.min==='number'&&typeof p.max==='number'&&(p.def<p.min||p.def>p.max))E(at+'.def must be between min and max.');}
      if(t==='color'&&!/^#[0-9a-fA-F]{6}$/.test(p.def||''))E(at+'.def must be a colour like "#ff8800".');
      if(t==='b'&&typeof p.def!=='boolean')E(at+'.def must be true or false for a switch.');
      if(t==='c'&&(!Array.isArray(p.opts)||p.opts.length<2||p.opts.length>12||p.opts.some(o=>!str(o,24))||!Number.isInteger(p.def)||p.def<0||p.def>=(p.opts||[]).length))E(at+': a choice list needs "opts" (2 to 12 short names) and an integer "def" that is a valid index.');
    });
  }
  if(j.kind==='effect'||j.kind==='generator'){
    if(typeof j.glsl!=='string'||!j.glsl.trim())E('"glsl" is required for effects and generators. It must define vec4 fx(vec2 uv) and return the colour.');
    else{
      if(j.glsl.length>LIMITS.glsl)E('"glsl" is larger than '+(LIMITS.glsl/1024)+' KB.');
      const g=stripComments(j.glsl);
      if(!/vec4\s+fx\s*\(\s*vec2\s+\w+\s*\)/.test(g))E('"glsl" must define exactly: vec4 fx(vec2 uv) { ... return vec4(color,1.); }');
      if(/#\s*extension/.test(g))E('"#extension" is not allowed.');
      if(/#\s*version/.test(g))E('"#version" is added for you. Remove it.');
      if(/\bvoid\s+main\s*\(/.test(g))E('Do not write main(). Define vec4 fx(vec2 uv) instead.');
      if(/\buniform\b/.test(g))E('Do not declare uniforms. Parameters from "params" become u_<k> automatically.');
      if(/\bwhile\s*\(/.test(g)||/\bdo\s*\{/.test(g))E('"while" and "do" loops are not allowed. Use for loops with a constant limit, like for(int i=0;i<8;i++).');
      const fors=[...g.matchAll(/for\s*\(([^;]*);([^;]*);([^)]*)\)/g)];
      fors.forEach(m=>{const cond=m[2];const n=/[<>]=?\s*(\d+)\s*$/.exec(cond.trim());if(!n)E('Every for loop needs a constant numeric limit, for example "i < 8". Found: for('+m[1].trim()+'; '+cond.trim()+'; ...)');else if(+n[1]>64)E('Loop limit '+n[1]+' is above 64. Lower it.');});
      const lookups=(g.match(/\btexture(?:Lod|Offset|Grad)?\s*\(/g)||[]).length+(g.match(/\bsm\s*\(/g)||[]).length;
      const nested=fors.length?lookups*Math.min(64,Math.max(...fors.map(m=>{const n=/(\d+)\s*$/.exec(m[2].trim());return n?+n[1]:1;}))):lookups;
      if(lookups>LIMITS.texLookups)E('Too many texture reads ('+lookups+'). The limit is '+LIMITS.texLookups+'.');
      else if(nested>LIMITS.texLookups*8)E('The texture reads inside loops could reach '+nested+' per pixel. Reduce loop counts or reads.');
      if(!/\buSrc\b/.test(g)&&j.kind==='effect')W('The effect never reads uSrc, so it ignores the picture. Use kind "generator" if that is intended.');
    }
    if(j.feedback!=null&&typeof j.feedback!=='boolean')E('"feedback" must be true or false.');
  }
  if(j.kind==='macro'){
    if(!Array.isArray(j.layers)||!j.layers.length||j.layers.length>12)E('A macro needs "layers": a list of 1 to 12 items like {"module":"blindemboss","params":{"depth":40}}.');
    else j.layers.forEach((l,i)=>{if(!l||!str(l.module,48))E('layers['+i+'].module is required.');else if(l.params&&typeof l.params!=='object')E('layers['+i+'].params must be an object.');});
  }
  if(j.kind==='pack'){
    if(!j.recipes&&!j.cameras)E('A pack needs "recipes" and/or "cameras".');
    (j.recipes||[]).forEach((r,i)=>{if(!str(r&&r.name,40)||!Array.isArray(r.layers)||r.layers.length>12)E('recipes['+i+'] needs a "name" and a "layers" list of up to 12 items.');});
    (j.cameras||[]).forEach((c,i)=>{if(!str(c&&c.id,24)||!/^[a-z0-9]+$/.test(c.id)||!str(c.name,30)||!Array.isArray(c.mods))E('cameras['+i+'] needs a lower-case "id" (letters and digits), a "name", and "mods": [{"module":"...","params":{}}].');});
  }
  if(installed.has(j.id))W('A plugin with this id is already installed. Installing replaces it.');
  return{ok:!errors.length,errors,warnings};
}

/* a short content hash, shown next to imported plugins so two files with the same id can be told apart */
export async function hashPlugin(j){
  const t=new TextEncoder().encode(JSON.stringify(j));
  try{const h=await crypto.subtle.digest('SHA-256',t);return [...new Uint8Array(h)].slice(0,6).map(b=>b.toString(16).padStart(2,'0')).join('');}
  catch(e){let h=0;for(const b of t)h=(h*31+b)>>>0;return h.toString(16).padStart(8,'0');}
}
