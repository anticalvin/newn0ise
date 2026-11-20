/* Tools: a tool is a saved recipe (layers by stable uid) plus up to six chosen controls ("exposed"). Pure helpers, no DOM, so the app and
   the command-line validator share them. The same object is Play (drag the main control), Shape (the chosen controls) and Build (the layers). */
export const MAX_EXPOSED=6;
export const TOOL_FLAG_KEY='n0.flag.maketool';
const clone=o=>JSON.parse(JSON.stringify(o));
export const slug=s=>String(s||'tool').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24)||'tool';
export const authorSlug=s=>String(s||'me').toLowerCase().replace(/[^a-z0-9_-]+/g,'').replace(/^[^a-z0-9]+/,'').slice(0,20)||'me';
export const newToolId=(author,name,taken=new Set())=>{let id,n=0;do{id=authorSlug(author)+'.'+slug(name)+(n?'-'+n:'');n++;}while(taken.has(id)&&n<50);return id;};
export const bumpVersion=v=>{const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(v||'');return m?`${m[1]}.${m[2]}.${+m[3]+1}`:'1.0.1';};
/* controls of a module that a tool may expose: sliders, switches, choices and colours */
export const exposable=m=>(m&&m.params||[]).filter(p=>['r','b','c','color'].includes(p.t||'r')&&p.k!=='orig');
const LAYER_KEYS=['opacity','blend','pos','size','seed','select','thr','visible','color','mods'];
/* layers: [{uid, module, params, opacity, ...}] (the app's layers, with a stable string uid). exposed: [{uid, param, label, hint}] */
export function buildTool({id,name,author='me',licence='CC0-1.0',description='',version='1.0.0',layers,exposed=[],MODULES,thumbnail}){
  const out={n0fx:1,id,name:String(name).slice(0,60),version,apiVersion:1,author,licence,kind:'tool',family:'Mine',recipe:1};
  if(description)out.description=String(description).slice(0,400);
  out.layers=layers.map(l=>{const b={uid:l.uid,module:l.module,params:clone(l.params||{})};LAYER_KEYS.forEach(k=>{if(l[k]!==undefined)b[k]=clone(l[k]);});return b;});
  out.exposed=exposed.slice(0,MAX_EXPOSED).map((e,i)=>{
    const L=out.layers.find(l=>l.uid===e.uid),m=MODULES[L.module],p=(m&&m.params||[]).find(x=>x.k===e.param)||{},t=p.t||'r';
    const o={k:'e'+(i+1),uid:e.uid,param:e.param,label:String(e.label||p.label||e.param).slice(0,40)};
    if(e.hint)o.hint=String(e.hint).slice(0,120);
    o.t=t;if(t==='r'){o.min=p.min;o.max=p.max;if(p.step)o.step=p.step;}if(t==='c')o.opts=clone(p.opts||[]);
    o.def=clone(L.params[e.param]!==undefined?L.params[e.param]:p.def);
    return o;});
  if(thumbnail)out.thumbnail=thumbnail;
  return out;
}
/* the controls a tool shows, as module params (key e1..e6, label, range, default). The first two are "hero": they come first and the canvas drag drives them. */
export const toolParams=j=>(j.exposed||[]).map((e,i)=>({k:e.k,t:e.t||'r',label:e.label,min:e.min,max:e.max,step:e.step||((e.max-e.min)>20?1:.01),opts:e.opts,def:e.def,hint:e.hint,sec:'Main',hero:i<2}));
/* run the tool's layers with the exposed values (from the tool layer's own params) on top */
export function innerParams(j,uid,base,V){
  const o=clone(base||{});(j.exposed||[]).forEach(e=>{if(e.uid===uid&&V&&V[e.k]!==undefined)o[e.param]=V[e.k];});return o;
}
/* "How it works": the chain as readable steps. role words: source, pattern, colour, motion, output */
const ROLE={Source:'pattern',Time:'motion',Modulation:'motion',Color:'colour',Film:'colour',Palette:'colour',Display:'output','Signal / CRT':'output',Print:'output',Bitmap:'output',Dither:'output',Glyph:'output',Lines:'output',Warp:'pattern',Glitch:'pattern',Optical:'colour',Subject:'pattern',Structure:'pattern',Pattern:'pattern',Camera:'output'};
export function describeChain(j,MODULES){
  const steps=[{role:'source',title:'Your picture',detail:'The photo, video or camera comes in here.',controls:[]}];
  (j.layers||[]).forEach(l=>{const m=MODULES[l.module],fam=m?m.family:'';
    const role=ROLE[fam]||'pattern';
    steps.push({role,title:m?m.name:l.module,missing:!m,uid:l.uid,detail:m?(fam?fam+' effect':'effect')+(l.opacity!=null&&l.opacity<100?', mixed at '+l.opacity+'%':'')+(l.blend&&l.blend!=='normal'?', '+l.blend:''):'needs this tool: '+l.module,
      controls:(j.exposed||[]).filter(e=>e.uid===l.uid).map(e=>e.label),motion:(l.mods||[]).length});});
  steps.push({role:'output',title:'Result',detail:'Mixed back into the picture with the layer’s own mix, blend and mask.',controls:[]});
  return steps;
}
/* single built-in effect or a recipe: the same card */
export function describeModule(m){return [{role:'source',title:'Your picture',detail:'The photo, video or camera comes in here.',controls:[]},{role:ROLE[m.family]||'pattern',title:m.name,detail:(m.family||'Effect')+' effect',controls:(m.schema&&m.schema.hero||[]).map(k=>{const p=m.params.find(x=>x.k===k);return p?p.label:k;})},{role:'output',title:'Result',detail:'Mixed back into the picture with the layer’s own mix, blend and mask.',controls:[]}];}
export function describeRecipe(r,MODULES){return [{role:'source',title:'Your picture',detail:'The photo, video or camera comes in here.',controls:[]},...r.layers.map(([id])=>{const m=MODULES[id];return {role:m?(ROLE[m.family]||'pattern'):'pattern',title:m?m.name:id,missing:!m,detail:m?(m.family||'')+' effect':'needs this tool: '+id,controls:[]};}),{role:'output',title:'Result',detail:'The look on your picture.',controls:[]}];}
export const MINE_FAMILY='Mine';
