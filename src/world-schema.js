/* .n0world v1: a declarative description of a room, level or small game. It maps onto the 3D scene commands (see AI.md); it is not an engine.
   No file ever contains code: behaviour comes from the closed list of triggers and actions below. This file is pure (no DOM, no three.js)
   so the app and tools/n0world-validate.mjs run the same checks. validateWorld() repairs what is safe to repair, says so in plain text, and
   drops the rest with a reason. Extension points: `version`, PREFABS, TRIGGERS and ACTIONS are registries, add to them to grow the format. */
import {Report,isNum,clampN,isHex,clone} from './importkit.js';
export const FORMAT='n0ise-world',VERSION=1;
export const LIMITS={json:1024*1024,zip:12*1024*1024,asset:2*1024*1024,instances:500,meshes:3000,rules:64,actionsPerRule:8,actionsPerSecond:20,lights:16,materials:64,depth:4,coord:1000,name:60,text:140,cameras:8,looks:16,openings:12};
export const PRIM_TYPES=['cube','sphere','torus','knot','plane','cylinder','cone','capsule'];
export const READY_TYPES=['human','wall','floor','platform','pillar','crate','ball'];
export const PHYS_TYPES=['static','dynamic','kinematic','none'];
export const SOUNDS=['ding','click','whoosh','thud','chime'];
export const PATTERNS=['checker','stripes','noise'];
export const SKIES=['day','dusk','night','overcast','none'];
export const HARDWARE_LOOK_NOTE='looks use hardware profile ids from the Look tab, for example "vhs", "crt", "mon90".';

/* a parameter spec: {t:'num',min,max,def} | {t:'int',...} | {t:'bool',def} | {t:'enum',opts,def} | {t:'material'} | {t:'vec3',def}
   | {t:'list',of:spec,max} for openings */
const N=(min,max,def)=>({t:'num',min,max,def}),I=(min,max,def)=>({t:'int',min,max,def});
export const PREFABS={
  door:{label:'Door',note:'A frame and a leaf that swings. Use toggle-open to open and close it. The leaf blocks you while closed.',
    params:{width:N(.5,4,1),height:N(1,4,2.1),thickness:N(.03,.3,.08),material:{t:'material'},frameMaterial:{t:'material'},open:{t:'bool',def:false},hinge:{t:'enum',opts:['left','right'],def:'left'}}},
  platform:{label:'Platform',note:'A slab you can stand on.',params:{width:N(.2,60,2),depth:N(.2,60,2),thickness:N(.05,10,.3),material:{t:'material'}}},
  stairs:{label:'Stairs',note:'Steps that climb toward -z (rotate it to turn it). pos is the bottom of the first step.',params:{steps:I(1,40,6),rise:N(.05,.5,.18),run:N(.1,1,.28),width:N(.4,10,1.2),material:{t:'material'}}},
  spawn:{label:'Spawn',note:'Where the character starts. yaw turns it (0 faces -z, the way the camera first looks). weapon: true lets the player shoot (click, F or the Fire button).',params:{yaw:N(-360,360,0),weapon:{t:'bool',def:false}}},
  room:{label:'Room',note:'Four walls, a floor and an optional ceiling, with openings cut where you ask. Stays one editable room.',
    params:{width:N(1,60,6),depth:N(1,60,6),height:N(1.5,12,2.8),wall:N(.05,1,.15),floor:{t:'bool',def:true},ceiling:{t:'bool',def:false},material:{t:'material'},floorMaterial:{t:'material'},
      openings:{t:'list',max:LIMITS.openings,of:{wall:{t:'enum',opts:['n','s','e','w'],def:'s'},offset:N(-30,30,0),width:N(.5,6,1),height:N(1,4,2.1)}}}},
  group:{label:'Group',note:'An empty container. Give other instances "parent":"<this id>" and they move together.',params:{}},
  ladder:{label:'Ladder',note:'A ladder you climb: walk into it and press forward (up) or back (down). Place it against a wall or platform edge; it faces +z.',params:{height:N(.5,20,3),width:N(.3,2,.6),material:{t:'material'}}},
  vehicle:{label:'Vehicle',note:'A car you can drive. Walk up to it and press E (or Drive), steer with WASD or the stick, Space brakes, E gets out. It faces -z at rot 0.',params:{length:N(2,8,3.6),width:N(1,3,1.8),height:N(.8,2.5,1.3),speed:N(4,40,16),material:{t:'material'}}},
  target:{label:'Target',note:'Something to shoot. It takes hp hits and then disappears. Rules can react with the object-shot trigger.',params:{size:N(.3,4,1.2),hp:I(1,20,3),material:{t:'material'}}},
  zone:{label:'Zone',note:'An invisible volume that rules can react to. Shown as a faint box only while editing.',params:{size:{t:'vec3',def:[2,2,2]}}}
};
export const TRIGGERS={
  'player-enter':{note:'The character steps into a zone (target: a zone or any object id).',needs:['target']},
  'player-interact':{note:'The character is close to target and presses E (or the Use button).',needs:['target']},
  'timer':{note:'every: seconds between runs, or after: seconds once.',needs:[]},
  'object-touch':{note:'The character touches target (any object id).',needs:['target']},
  'object-shot':{note:'The player shoots target (needs a spawn with weapon: true).',needs:['target']}
};
export const ACTIONS={
  'toggle-open':{note:'Open or close a door. {target:id, state?:"open"|"closed"}',needs:['target']},
  'move-to':{note:'Slide an object. {target:id, pos:[x,y,z], seconds:1}',needs:['target','pos']},
  'teleport':{note:'Put the character somewhere. {pos:[x,y,z], yaw?:deg}',needs:['pos']},
  'destroy':{note:'Make an object disappear with a thud. {target:id}',needs:['target']},
  'collect':{note:'Pick something up: it disappears and is counted. {target:id}',needs:['target']},
  'set-flag':{note:'Remember something. {flag:"name", value:true|false|number}',needs:['flag']},
  'show-message':{note:'Show text for a few seconds. {text:"..."}',needs:['text']},
  'play-sound':{note:'A built-in sound. {sound:"'+SOUNDS.join('|')+'"}',needs:['sound']}
};

const clip=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u001f]/g,' ').slice(0,n);
const idOk=s=>typeof s==='string'&&/^[A-Za-z0-9_.-]{1,40}$/.test(s);
const vec=(v,d)=>Array.isArray(v)&&v.length>=3&&v.slice(0,3).every(isNum)?v.slice(0,3).map(x=>clampN(x,-LIMITS.coord,LIMITS.coord,0)):d;

/* Returns {ok, doc, report, stats}. doc is a repaired deep copy that the builder can trust. ok is false only when nothing can be built. */
export function validateWorld(input,{builtinReady=READY_TYPES}={}){
  const R=new Report();
  let j=input;
  if(typeof j==='string'){try{j=JSON.parse(j);}catch(e){R.add('error','','That isn’t valid JSON ('+e.message+'). Check commas, quotes and brackets, and send back the whole file.');return {ok:false,doc:null,report:R,stats:{}};}}
  if(!j||typeof j!=='object'||Array.isArray(j)){R.add('error','','The file must be a JSON object like {"format":"n0ise-world","version":1,...}.');return {ok:false,doc:null,report:R,stats:{}};}
  if(JSON.stringify(j).length>LIMITS.json){R.add('error','','The file is larger than '+(LIMITS.json/1024)+' KB. Use fewer objects or use prefabs (a room or stairs is one instance).');return {ok:false,doc:null,report:R,stats:{}};}
  if(j.format!==FORMAT)R.add('fix','format','Missing or wrong "format". It must be "'+FORMAT+'". Reading it as a world anyway.');
  if(j.version==null)R.add('fix','version','Missing "version". Using 1.');
  else if(j.version>VERSION){R.add('error','version','This file is version '+j.version+' but this app reads version '+VERSION+'. Ask the AI for version 1, or update the app.');return {ok:false,doc:null,report:R,stats:{}};}
  const known=new Set(['format','version','scene','materials','prefabs','instances','lights','cameras','rules','looks','assets']);
  Object.keys(j).forEach(k=>{if(!known.has(k))R.add('warn',k,'"'+k+'" isn’t part of version 1 and is ignored.');});
  const doc={format:FORMAT,version:VERSION,scene:{name:'World',environment:{}},materials:{},prefabs:{},instances:[],lights:[],cameras:[],rules:[],looks:[]};

  /* scene */
  const sc=j.scene&&typeof j.scene==='object'?j.scene:{};
  doc.scene.name=clip(sc.name||'World',LIMITS.name)||'World';
  const env=sc.environment&&typeof sc.environment==='object'?sc.environment:{},E=doc.scene.environment;
  if(env.timeOfDay!=null){if(isNum(env.timeOfDay))E.timeOfDay=clampN(env.timeOfDay,0,24,12);else R.add('fix','scene.environment.timeOfDay','timeOfDay must be a number of hours from 0 to 24. Ignored.');}
  if(env.sky!=null){if(SKIES.includes(env.sky))E.sky=env.sky;else R.add('fix','scene.environment.sky','sky "'+clip(env.sky,20)+'" isn’t one of '+SKIES.join(', ')+'. Ignored.');}
  if(env.bg!=null){if(isHex(env.bg))E.bg=env.bg;else R.add('fix','scene.environment.bg','bg must look like "#112233". Ignored.');}
  if(env.fog!=null){if(env.fog===false||env.fog===null)E.fog=null;else if(typeof env.fog==='object')E.fog={color:isHex(env.fog.color)?env.fog.color:'#9aa3ad',near:clampN(env.fog.near,0,500,8),far:clampN(env.fog.far,1,1000,60)};else R.add('fix','scene.environment.fog','fog must be {color,near,far} or false. Ignored.');}
  if(env.ground!=null){if(env.ground===false)E.ground=false;else if(env.ground===true)E.ground={};else if(typeof env.ground==='object')E.ground={color:isHex(env.ground.color)?env.ground.color:'#8a8a86',size:clampN(env.ground.size,1,500,80)};else R.add('fix','scene.environment.ground','ground must be true, false or {color,size}. Ignored.');}
  if(env.shadows!=null)E.shadows=!!env.shadows;
  if(env.sun&&typeof env.sun==='object')E.sun={intensity:clampN(env.sun.intensity,0,20,2),color:isHex(env.sun.color)?env.sun.color:undefined};

  /* materials */
  const mats=j.materials&&typeof j.materials==='object'&&!Array.isArray(j.materials)?j.materials:{};
  Object.keys(mats).slice(0,LIMITS.materials).forEach(name=>{
    const m=mats[name],at='materials.'+clip(name,30);
    if(!idOk(name)){R.add('fix',at,'Material names use letters, numbers, - _ . only. Skipped.');return;}
    if(!m||typeof m!=='object'){R.add('fix',at,'A material must be an object like {"color":"#c9c1b3","roughness":.6}. Skipped.');return;}
    const o={};
    o.color=isHex(m.color)?m.color:(m.color!=null?(R.add('fix',at+'.color','color must look like "#c9c1b3". Using grey.'),'#b9b4ac'):'#b9b4ac');
    o.roughness=clampN(m.roughness,0,1,.6);o.metalness=clampN(m.metalness,0,1,0);
    if(m.emissive!=null){if(isHex(m.emissive)){o.emissive=m.emissive;o.emissiveIntensity=clampN(m.emissiveIntensity,0,10,1);}else R.add('fix',at+'.emissive','emissive must look like "#ffcc66". Ignored.');}
    if(m.opacity!=null)o.opacity=clampN(m.opacity,0,1,1);
    if(m.pattern!=null){const p=m.pattern;if(p&&PATTERNS.includes(p.type))o.pattern={type:p.type,color2:isHex(p.color2)?p.color2:'#ffffff',scale:clampN(p.scale,.1,64,4)};else R.add('fix',at+'.pattern','pattern.type must be one of '+PATTERNS.join(', ')+'. Ignored.');}
    if(m.texture!=null)R.add('warn',at+'.texture','External textures aren’t supported in version 1 (only procedural patterns). Ignored.');
    doc.materials[name]=o;
  });
  if(Object.keys(mats).length>LIMITS.materials)R.add('warn','materials','More than '+LIMITS.materials+' materials. The extra ones are ignored.');
  const matNames=()=>Object.keys(doc.materials).join(', ')||'none defined';
  const useMat=(v,at)=>{if(v==null)return undefined;if(typeof v==='string'&&doc.materials[v])return v;R.add('fix',at,'material "'+clip(v,30)+'" doesn’t exist; using the default. Define it under "materials" (available: '+matNames()+').');return undefined;};

  /* named prefab presets */
  const pre=j.prefabs&&typeof j.prefabs==='object'&&!Array.isArray(j.prefabs)?j.prefabs:{};
  Object.keys(pre).slice(0,32).forEach(name=>{const p=pre[name],at='prefabs.'+clip(name,30);
    if(!idOk(name)||!p||typeof p!=='object'||!PREFABS[p.prefab]){R.add('fix',at,'A named prefab needs {"prefab":"'+Object.keys(PREFABS).join('|')+'","params":{...}}. Skipped.');return;}
    doc.prefabs[name]={prefab:p.prefab,params:p.params&&typeof p.params==='object'?clone(p.params):{}};});

  const specVal=(spec,v,at,label)=>{
    if(spec.t==='num'||spec.t==='int'){if(!isNum(v)){R.add('fix',at,label+' must be a number. Using '+spec.def+'.');return spec.def;}
      let x=Math.min(spec.max,Math.max(spec.min,v));if(spec.t==='int')x=Math.round(x);if(x!==v)R.add('fix',at,label+' '+v+' is outside '+spec.min+' to '+spec.max+'. Using '+x+'.');return x;}
    if(spec.t==='bool')return !!v;
    if(spec.t==='enum'){if(spec.opts.includes(v))return v;R.add('fix',at,label+' "'+clip(v,20)+'" must be one of '+spec.opts.join(', ')+'. Using '+spec.def+'.');return spec.def;}
    if(spec.t==='material')return useMat(v,at);
    if(spec.t==='vec3'){const r=vec(v,null);if(!r){R.add('fix',at,label+' must be [x,y,z] numbers. Using '+JSON.stringify(spec.def)+'.');return spec.def.slice();}return r.map(x=>Math.min(60,Math.max(.05,Math.abs(x))));}
    if(spec.t==='list'){if(!Array.isArray(v)){R.add('fix',at,label+' must be a list. Ignored.');return [];}
      if(v.length>spec.max)R.add('fix',at,label+' has '+v.length+' items; keeping the first '+spec.max+'.');
      return v.slice(0,spec.max).map((it,i)=>{const o={};Object.keys(spec.of).forEach(k=>{o[k]=specVal(spec.of[k],it&&it[k]!==undefined?it[k]:spec.of[k].def,at+'['+i+'].'+k,k);});return o;});}
    return v;
  };
  const prefabParams=(kind,raw,at)=>{
    const def=PREFABS[kind].params,out={},src=raw&&typeof raw==='object'?raw:{};
    Object.keys(src).forEach(k=>{if(!def[k])R.add('warn',at+'.'+k,'"'+k+'" isn’t a parameter of '+kind+' (it has: '+Object.keys(def).join(', ')+'). Ignored.');});
    Object.keys(def).forEach(k=>{const s=def[k],has=src[k]!==undefined;
      if(s.t==='material'){const m=has?useMat(src[k],at+'.'+k):undefined;if(m)out[k]=m;}
      else if(s.t==='list'){out[k]=has?specVal(s,src[k],at+'.'+k,k):[];}
      else out[k]=has?specVal(s,src[k],at+'.'+k,k):(Array.isArray(s.def)?s.def.slice():s.def);});
    return out;
  };

  /* instances */
  const ids=new Set(),insts=Array.isArray(j.instances)?j.instances:(j.instances!=null?(R.add('fix','instances','"instances" must be a list. Ignoring it.'),[]):[]);
  if(insts.length>LIMITS.instances)R.add('warn','instances','This world has '+insts.length+' instances; only the first '+LIMITS.instances+' are built. Use prefabs (a room is one instance) instead of many loose boxes.');
  let meshBudget=0;
  insts.slice(0,LIMITS.instances).forEach((it,i)=>{
    const at='instances['+i+']';
    if(!it||typeof it!=='object'||Array.isArray(it)){R.add('fix',at,'An instance must be an object like {"id":"floor","type":"cube",...}. Skipped.');return;}
    let id=it.id!=null?String(it.id):'obj'+(i+1);
    if(!idOk(id)){const f=('obj'+(i+1));R.add('fix',at+'.id','id "'+clip(id,20)+'" must use letters, numbers, - _ . only (max 40). Using "'+f+'".');id=f;}
    while(ids.has(id)){R.add('fix',at+'.id','id "'+id+'" is used twice. Renamed to "'+id+'_2".');id+='_2';}
    ids.add(id);const lab=at+' "'+id+'"';
    const o={id,name:clip(it.name||id,LIMITS.name)};
    let kind=it.prefab!=null?String(it.prefab):null,ptype=it.type!=null?String(it.type).toLowerCase():null;
    if(kind&&doc.prefabs[kind]){const pr=doc.prefabs[kind];it={...it,prefab:pr.prefab,params:{...pr.params,...(it.params||{})}};kind=pr.prefab;}
    if(kind){
      if(!PREFABS[kind]){R.add('warn',lab,'prefab "'+clip(kind,20)+'" isn’t supported (available: '+Object.keys(PREFABS).join(', ')+'). Shown as a pink placeholder box.');o.placeholder='prefab '+clip(kind,20);o.type='cube';o.dims=[1,1,1];}
      else{o.prefab=kind;o.params=prefabParams(kind,it.params,lab+'.params');meshBudget+=kind==='stairs'?(o.params.steps):kind==='room'?(6+4*(o.params.openings||[]).length):kind==='door'?5:kind==='vehicle'?10:kind==='ladder'?20:kind==='target'?3:1;}
    }else if(ptype){
      if(PRIM_TYPES.includes(ptype)||builtinReady.includes(ptype))o.type=ptype;
      else{R.add('warn',lab,'type "'+clip(ptype,20)+'" isn’t supported (shapes: '+PRIM_TYPES.join(', ')+'; ready-made: '+builtinReady.join(', ')+'; or use "prefab"). Shown as a pink placeholder box.');o.placeholder='type '+clip(ptype,20);o.type='cube';o.dims=[1,1,1];}
      meshBudget++;
    }else{R.add('warn',lab,'Needs "type" (a shape) or "prefab". Shown as a pink placeholder box.');o.placeholder='no type';o.type='cube';o.dims=[1,1,1];}
    o.pos=vec(it.pos,[0,0,0]);if(it.pos!=null&&!vec(it.pos,null))R.add('fix',lab+'.pos','pos must be [x,y,z] in metres. Using [0,0,0].');
    o.rot=vec(it.rot,[0,0,0]);if(it.rot!=null&&!vec(it.rot,null))R.add('fix',lab+'.rot','rot must be [x,y,z] in degrees. Using [0,0,0].');
    if(it.dims!=null&&!o.placeholder){const d=vec(it.dims,null);if(d)o.dims=d.map(x=>clampN(Math.abs(x),.01,200,1));else R.add('fix',lab+'.dims','dims must be [width,height,depth] in metres. Ignored.');}
    if(it.scale!=null){if(isNum(it.scale))o.scale=clampN(it.scale,.01,100,1);else{const s=vec(it.scale,null);if(s)o.scale=s.map(x=>clampN(x,.01,100,1));else R.add('fix',lab+'.scale','scale must be a number or [x,y,z]. Ignored.');}}
    if(it.material!=null){const m=useMat(it.material,lab+'.material');if(m)o.material=m;}
    if(it.color!=null){if(isHex(it.color))o.color=it.color;else R.add('fix',lab+'.color','color must look like "#c9c1b3". Ignored.');}
    if(it.phys!=null){const p=it.phys;if(p&&typeof p==='object'&&PHYS_TYPES.includes(p.type)){o.phys={type:p.type};['mass','bounce','friction'].forEach(k=>{if(p[k]!=null&&isNum(p[k]))o.phys[k]=clampN(p[k],0,k==='mass'?10000:2,1);});if(['box','sphere','capsule','cylinder','hull'].includes(p.shape))o.phys.shape=p.shape;}
      else R.add('fix',lab+'.phys','phys.type must be one of '+PHYS_TYPES.join(', ')+'. Ignored.');}
    if(it.visible===false)o.visible=false;
    if(it.climb===true)o.climb=true;
    if(it.parent!=null)o.parent=String(it.parent);
    doc.instances.push(o);
  });
  if(meshBudget>LIMITS.meshes){R.add('error','instances','This world would create about '+meshBudget+' meshes; the limit is '+LIMITS.meshes+'. Use fewer or larger prefabs.');return {ok:false,doc:null,report:R,stats:{}};}
  /* parents: must exist, must come from an instance that is a "group" or any instance, depth-capped, no cycles */
  const byId=new Map(doc.instances.map(o=>[o.id,o]));
  doc.instances.forEach(o=>{if(o.parent==null)return;const p=byId.get(o.parent);
    if(!p||p===o){R.add('fix','instances "'+o.id+'".parent','parent "'+clip(o.parent,30)+'" doesn’t exist. Placed at the top level.');delete o.parent;return;}
    let d=1,c=p;const seen=new Set([o.id]);while(c&&c.parent!=null){if(seen.has(c.id)){R.add('fix','instances "'+o.id+'".parent','parents form a loop. Placed at the top level.');delete o.parent;return;}seen.add(c.id);c=byId.get(c.parent);d++;}
    if(d>LIMITS.depth){R.add('fix','instances "'+o.id+'".parent','groups are nested more than '+LIMITS.depth+' deep. Placed at the top level.');delete o.parent;}});

  /* lights */
  (Array.isArray(j.lights)?j.lights:[]).slice(0,LIMITS.lights).forEach((l,i)=>{const at='lights['+i+']';
    if(!l||typeof l!=='object'){R.add('fix',at,'A light must be an object. Skipped.');return;}
    const t=['point','spot','dir'].includes(l.type)?l.type:(R.add('fix',at+'.type','type must be point, spot or dir. Using point.'),'point');
    doc.lights.push({id:idOk(String(l.id))?String(l.id):'light'+(i+1),type:t,pos:vec(l.pos,[2,3,2]),target:vec(l.target,[0,0,0]),color:isHex(l.color)?l.color:'#ffffff',intensity:clampN(l.intensity,0,500,t==='dir'?2:t==='spot'?60:20),angle:clampN(l.angle,5,90,35),shadow:!!l.shadow});});
  if(Array.isArray(j.lights)&&j.lights.length>LIMITS.lights)R.add('warn','lights','Only the first '+LIMITS.lights+' lights are used.');
  /* cameras */
  (Array.isArray(j.cameras)?j.cameras:[]).slice(0,LIMITS.cameras).forEach((c,i)=>{if(!c||typeof c!=='object')return;doc.cameras.push({id:idOk(String(c.id))?String(c.id):'cam'+(i+1),pos:vec(c.pos,[6,4,8]),target:vec(c.target,[0,1,0]),fov:clampN(c.fov,15,110,50)});});

  /* rules */
  const flagsSeen=new Set();
  const rules=Array.isArray(j.rules)?j.rules:(j.rules!=null?(R.add('fix','rules','"rules" must be a list. Ignoring it.'),[]):[]);
  if(rules.length>LIMITS.rules)R.add('warn','rules','Only the first '+LIMITS.rules+' rules are used.');
  const needTarget=(t,at,what)=>{if(t!=null&&byId.has(String(t)))return String(t);R.add('fix',at,what+' "'+clip(t,30)+'" doesn’t match any instance id.');return null;};
  rules.slice(0,LIMITS.rules).forEach((rl,i)=>{
    const at='rules['+i+']';
    if(!rl||typeof rl!=='object'){R.add('fix',at,'A rule must be {"when":{...},"then":[...]}. Skipped.');return;}
    const w=rl.when&&typeof rl.when==='object'?rl.when:null;
    if(!w||!TRIGGERS[w.trigger]){R.add('fix',at+'.when.trigger','trigger "'+clip(w&&w.trigger,24)+'" isn’t supported. Use one of: '+Object.keys(TRIGGERS).join(', ')+'. Rule skipped.');return;}
    const when={trigger:w.trigger};
    if(w.trigger==='timer'){if(isNum(w.every)&&w.every>0)when.every=clampN(w.every,.5,3600,5);else if(isNum(w.after)&&w.after>=0)when.after=clampN(w.after,0,3600,1);else{R.add('fix',at+'.when','A timer needs "every" or "after" in seconds. Rule skipped.');return;}}
    else{const t=needTarget(w.target,at+'.when.target','target');if(!t){R.add('fix',at,'Rule skipped because its trigger has no valid target.');return;}when.target=t;}
    if(w.once)when.once=true;
    const out={id:idOk(String(rl.id))?String(rl.id):'rule'+(i+1),when,then:[]};
    if(rl.if!=null){if(rl.if&&typeof rl.if==='object'&&typeof rl.if.flag==='string')out.if={flag:clip(rl.if.flag,30),equals:rl.if.equals===undefined?true:rl.if.equals};else R.add('fix',at+'.if','"if" must be {"flag":"name","equals":true}. Ignored (the rule always runs).');}
    (Array.isArray(rl.then)?rl.then:[]).slice(0,LIMITS.actionsPerRule).forEach((a,k)=>{
      const ap=at+'.then['+k+']';
      if(!a||!ACTIONS[a.action]){R.add('fix',ap,'action "'+clip(a&&a.action,24)+'" isn’t supported. Use one of: '+Object.keys(ACTIONS).join(', ')+'. Action skipped.');return;}
      const x={action:a.action};
      if(a.action==='toggle-open'){const t=needTarget(a.target,ap+'.target','target');if(!t)return;const o=byId.get(t);if(!o.prefab||o.prefab!=='door'){R.add('fix',ap,'toggle-open works on doors; "'+t+'" isn’t one. Action skipped.');return;}x.target=t;if(a.state==='open'||a.state==='closed')x.state=a.state;}
      else if(a.action==='move-to'){const t=needTarget(a.target,ap+'.target','target');if(!t)return;const p=vec(a.pos,null);if(!p){R.add('fix',ap+'.pos','move-to needs pos [x,y,z]. Action skipped.');return;}x.target=t;x.pos=p;x.seconds=clampN(a.seconds,.1,60,1);}
      else if(a.action==='teleport'){const p=vec(a.pos,null);if(!p){R.add('fix',ap+'.pos','teleport needs pos [x,y,z]. Action skipped.');return;}x.pos=p;if(isNum(a.yaw))x.yaw=clampN(a.yaw,-360,360,0);}
      else if(a.action==='collect'||a.action==='destroy'){const t=needTarget(a.target,ap+'.target','target');if(!t)return;x.target=t;}
      else if(a.action==='set-flag'){if(typeof a.flag!=='string'||!a.flag){R.add('fix',ap,'set-flag needs "flag". Action skipped.');return;}x.flag=clip(a.flag,30);x.value=(typeof a.value==='number'||typeof a.value==='boolean')?a.value:true;flagsSeen.add(x.flag);}
      else if(a.action==='show-message'){if(typeof a.text!=='string'||!a.text){R.add('fix',ap,'show-message needs "text". Action skipped.');return;}x.text=clip(a.text,LIMITS.text);x.seconds=clampN(a.seconds,1,30,3);if(a.text.length>LIMITS.text)R.add('fix',ap+'.text','Message cut to '+LIMITS.text+' characters.');}
      else if(a.action==='play-sound'){x.sound=SOUNDS.includes(a.sound)?a.sound:(R.add('fix',ap+'.sound','sound must be one of '+SOUNDS.join(', ')+'. Using ding.'),'ding');}
      out.then.push(x);});
    if(!out.then.length){R.add('fix',at,'Rule has no valid actions left. Skipped.');return;}
    doc.rules.push(out);});
  doc.rules.forEach((r,i)=>{if(r.if&&!flagsSeen.has(r.if.flag))R.add('warn','rules['+i+'].if','Nothing sets the flag "'+r.if.flag+'", so this rule may never run. Add a set-flag action.');});
  const spawns=doc.instances.filter(o=>o.prefab==='spawn');
  if(!spawns.length)R.add('note','instances','No spawn. The character starts at 0,0,0. Add {"id":"start","prefab":"spawn","pos":[x,0,z]} to choose.');
  if(spawns.length>1)R.add('warn','instances','More than one spawn. The first one is used.');

  /* looks: n0ise hardware profiles on the scene, an object or a material */
  (Array.isArray(j.looks)?j.looks:[]).slice(0,LIMITS.looks).forEach((l,i)=>{const at='looks['+i+']';
    if(!l||typeof l.target!=='string'||typeof l.profile!=='string'){R.add('fix',at,'A look needs {"target":"scene"|"object:<id>"|"material:<name>","profile":"vhs"}. Skipped.');return;}
    const m=/^(scene|object:(.+)|material:(.+))$/.exec(l.target);
    if(!m){R.add('fix',at+'.target','target must be "scene", "object:<id>" or "material:<name>". Look skipped.');return;}
    if(m[2]&&!byId.has(m[2])){R.add('fix',at+'.target','object "'+clip(m[2],30)+'" doesn’t exist. Look skipped.');return;}
    if(m[3]&&!doc.materials[m[3]]){R.add('fix',at+'.target','material "'+clip(m[3],30)+'" doesn’t exist. Look skipped.');return;}
    doc.looks.push({target:l.target,profile:clip(l.profile,24)});});
  if(j.assets!=null&&typeof j.assets==='object'&&Object.keys(j.assets).length)R.add('warn','assets','Assets (textures, models) aren’t used in version 1. Ignored.');
  return {ok:true,doc,report:R,stats:{instances:doc.instances.length,rules:doc.rules.length,lights:doc.lights.length,materials:Object.keys(doc.materials).length,meshes:meshBudget}};
}
export const emptyWorld=()=>({format:FORMAT,version:VERSION,scene:{name:'World',environment:{}},materials:{},prefabs:{},instances:[],lights:[],cameras:[],rules:[],looks:[]});
