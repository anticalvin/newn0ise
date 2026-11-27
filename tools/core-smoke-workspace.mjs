// Workspace shell regression tests (launcher, lifecycle, import safety, modal input, hierarchy, South Africa transitions). Same format as core-smoke.mjs.
export const tests=[];const t=(name,url,body)=>tests.push([name,url,body]);
const W="const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(600);const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];const click=s=>{const e=typeof s==='string'?q(s):s;if(!e)throw new Error('missing '+s);e.click();};";

t('workspace: mounts once, launcher tabs and six templates','/core.html',`async()=>{${W}
if(!n0.workspace)return 'workspace not mounted';const again=(await import('/src/core/workspace-ui.js?x='+Date.now())).mountWorkspace(n0);if(again!==n0.workspace)return 'mount is not idempotent';
if(qa('.ws-sidebar').length!==1)return 'duplicate sidebar';
if(!q('#start.on'))return 'launcher not shown on first run';
for(const tab of ['Create','Projects','Examples','Labs']){click('[data-tab="'+tab+'"]');if(q('[data-tab="'+tab+'"]').getAttribute('aria-pressed')!=='true')return 'tab '+tab;}
click('[data-tab="Create"]');if(qa('.ws-template').length!==6)return 'templates '+qa('.ws-template').length;
return true}`);

t('workspace: planned templates cannot launch, ready ones can','/core.html',`async()=>{${W}
click('[data-template="driving"]');const p=q('.ws-primary');if(!p.disabled)return 'planned template launchable';if(!/Not implemented/.test(p.textContent))return 'planned label '+p.textContent;
click('[data-template="third"]');if(q('.ws-primary').disabled)return 'ready template disabled';
click('[data-tab="Examples"]');click('[data-template="habitat"]');if(!q('.ws-primary').disabled)return 'habitat launchable';
return true}`);

t('workspace: create flow makes a named Third person project on Mechanics Playground','/core.html',`async()=>{${W}
click('[data-template="third"]');click('.ws-primary');await wait(200);if(!q('.ws-confirm.on #ws-cr-name'))return 'no create dialog';
if(!n0.app.ui.modalOpen())return 'create dialog not modal';
q('#ws-cr-name').value='Alpha course';q('#ws-cr-ok').click();await wait(4000);
if(q('#start.on'))return 'launcher still open';if(!n0.app.project||n0.app.project.name!=='Alpha course')return 'no project '+JSON.stringify(n0.app.project&&n0.app.project.name);
if(n0.app.name!=='ALPHA COURSE'&&n0.app.name!=='Alpha course')return 'scene name '+n0.app.name;
const ents=n0.exec({cmd:'entity.list'}).entities;if(ents.length<60)return 'playground too small: '+ents.length;
for(const k of ['pg1_ramp_10','pg1_ramp_40','pg2_step_10','pg3_ledge_3','pg4_vault_1.6','pg5_tower_4','pg6_target_1','pg7_slalom_8','pg8_store'])if(!ents.some(e=>e.id===k||e.id.startsWith(k)))return 'missing '+k;
if(!n0.app.grid.on)return 'grid off';if(n0.app.mode!=='explore')return 'third person should start in Play';
if(n0.app.palms.items.length)return 'island props in a greybox template';
const sim=qa('#mode button').find(b=>b.textContent==='Simulate');if(!sim||!sim.disabled)return 'Simulate must be disabled';
return true}`);

t('workspace: Empty and Architecture start in the editor camera, distinct content','/core.html',`async()=>{${W}
const make=async(tpl,name,starter)=>{click('#ws-project');click('[data-tab="Create"]');click('[data-template="'+tpl+'"]');click('.ws-primary');await wait(200);q('#ws-cr-name').value=name;if(starter)q('[data-starter="'+starter+'"]').click();q('#ws-cr-ok').click();await wait(3500);const c=qa('.ws-confirm.on #ws-cf-t');if(q('.ws-confirm.on [data-r="1"]')&&q('.ws-confirm.on #ws-cf-t'))q('.ws-confirm.on [data-r="1"]').click();await wait(3000);};
await make('empty','Blank slab','grid');
if(n0.app.mode!=='edit')return 'Empty should open the editor camera';if(n0.exec({cmd:'entity.list'}).entities.length!==0)return 'Empty has entities';if(n0.app.palms.items.length||n0.app.boulders.items.length)return 'Empty has props';if(!n0.app.grid.on)return 'Empty Grid has no grid';
await make('architecture','House test','grid');
const e=n0.exec({cmd:'entity.list'}).entities.map(x=>x.id);if(!e.includes('room1_front_l')||!e.includes('room1_door_lintel')||!e.includes('room1_window_head'))return 'room kit missing openings';if(n0.app.mode!=='edit')return 'Architecture not in editor camera';
const names=(await n0.app.projects.list()).map(p=>p.name);if(!names.includes('Blank slab')||!names.includes('House test'))return 'projects not listed '+names;
return true}`);

t('workspace: two projects stay independent through save, reopen, rename, duplicate, delete','/core.html',`async()=>{${W}
const P=n0.app.projects,A=n0.app;for(const p of await P.list())await P.remove(p.id);
await A.createProject({name:'One',template:'empty',starter:'grid'});n0.exec({cmd:'entity.create',prefab:'prim.box',id:'only_in_one',position:[1,2,3]});await A.saveProject();const one=A.project.id;
await A.createProject({name:'Two',template:'third',starter:'playground'});const two=A.project.id;n0.exec({cmd:'entity.set',id:'pg1_ramp_10',position:[0,5,0]});await A.saveProject();
await A.openProject(one);let ids=n0.exec({cmd:'entity.list'}).entities.map(e=>e.id);if(!ids.includes('only_in_one')||ids.length!==1)return 'project one wrong: '+ids.length;
await A.openProject(two);ids=n0.exec({cmd:'entity.list'}).entities.map(e=>e.id);if(ids.includes('only_in_one'))return 'leak from one into two';if(A.entities.get('pg1_ramp_10').transform.position[1]!==5)return 'edit in two was lost';
const dup=await P.duplicate(two);if(dup.id===two||!/copy/.test(dup.name))return 'duplicate '+dup.name;
const r=await P.rename(two,'Two');if(r.name!=='Two')return 'rename';const clash=await P.rename(dup.id,'One');if(clash.name==='One')return 'name clash allowed';
await P.remove(dup.id);if((await P.list()).some(p=>p.id===dup.id))return 'delete failed';
const m=(await P.get(two)).manifest;if(m.format!=='n0ise.project'||m.version!==1||!m.scenes.length)return 'manifest '+JSON.stringify(m);
return true}`);

t('workspace: opening a missing or corrupt project leaves the scene alone','/core.html?start=blank',`async()=>{${W}
const A=n0.app;n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:3});const s0=JSON.stringify(await n0.core.serialize());let threw=false;
try{await A.openProject('nope')}catch(e){threw=true}if(!threw)return 'missing project opened';
const rec=await A.projects.create({name:'Broken',template:'empty',starter:'grid'},{format:'n0ise.core.scene',version:4,terrain:{broken:1}});A.project=null;
try{await A.openProject(rec.id)}catch(e){}if(A.project)return 'project attached after failed open';if(JSON.stringify(await n0.core.serialize())!==s0)return 'failed open changed the scene';
await A.projects.remove(rec.id);return true}`);

t('workspace: Projects tab lists, opens, renames and deletes with confirmation','/core.html',`async()=>{${W}
const P=n0.app.projects;for(const p of await P.list())await P.remove(p.id);await n0.app.createProject({name:'Listed',template:'empty',starter:'grid'});await n0.app.saveProject();
click('#ws-project');click('[data-tab="Projects"]');await wait(500);if(!/Listed/.test(q('.ws-projects').textContent))return 'project not listed';
click('[data-pa="delete"]');await wait(200);if(!q('.ws-confirm.on'))return 'no delete confirmation';click('.ws-confirm.on [data-r="0"]');await wait(200);if(!(await P.list()).length)return 'cancel deleted';
click('[data-pa="delete"]');await wait(200);click('.ws-confirm.on [data-r="1"]');await wait(500);if((await P.list()).length)return 'delete did not delete';return true}`);

t('workspace: World launcher links back to 3D and to legacy places','/core.html',`async()=>{${W}
const b=q('[data-back3d]');if(!b||!/studio[.]html[?]stay=1/.test(b.getAttribute('href')))return 'no Back to 3D';
click('[data-tab="Labs"]');const rows=qa('.ws-template').map(x=>x.textContent);for(const n of ['Photo Walk','Physics Sandbox','Night Station'])if(!rows.some(r=>r.includes(n)))return 'missing legacy '+n;
click('[data-template="photowalk"]');if(!/studio[.]html[?]stay=1#world:photowalk/.test(q('.ws-primary').dataset.launch))return 'legacy link '+q('.ws-primary').dataset.launch;
return true}`);

t('workspace: mode switch, workspace tools and dock groups','/core.html?start=blank',`async()=>{${W}
click('#mode [data-m="edit"]');if(n0.app.mode!=='edit')return 'not edit';
click('[data-workspace="Assets"]');if(n0.app.ui.group!==3)return 'Assets did not open Place';
click('[data-workspace="Environment"]');if(n0.app.ui.group!==4)return 'Environment did not open Sky';
click('[data-workspace="World"]');if(n0.app.ui.group!==0)return 'World did not open Land';
for(const k of ['raise','lower','smooth','flatten']){n0.app.setTool(k);}
const h0=n0.app.terrain.hAt(0,0);n0.exec({cmd:'terrain.stroke',tool:'raise',center:[0,0],radius:8,strength:1,duration:1});if(!(n0.app.terrain.hAt(0,0)>h0))return 'terrain tool dead';
click('#mode [data-m="explore"]');if(n0.app.mode!=='explore')return 'not play';
if(getComputedStyle(q('.ws-sidebar')).display!=='none')return 'sidebar visible in Play';
return true}`);

t('workspace: scene hierarchy lists entities and edits position through entity.set','/core.html?start=blank',`async()=>{${W}
n0.exec({cmd:'entity.create',prefab:'prim.box',id:'hb',position:[3,1,4],parameters:{size:[1,1,1],color:'#336699'}});
click('#mode [data-m="edit"]');click('[data-workspace="Scene"]');await wait(100);
if(!q('[data-entity="hb"]'))return 'entity missing from hierarchy';click('[data-entity="hb"]');
let f=q('[data-position="0"]');if(!f)return 'no position field';f.value='9';click('[data-inspect="apply"]');
if(n0.app.entities.get('hb').transform.position[0]!==9)return 'position not applied';
n0.exec({cmd:'undo'});if(n0.app.entities.get('hb').transform.position[0]!==3)return 'undo failed';
if(q('[data-position="0"]').value!=='3.000')return 'inspector stale after undo: '+q('[data-position="0"]').value;const f2=q('[data-position="0"]');f2.value='abc';const r=n0.app.entities.get('hb').transform.position[0];click('[data-inspect="apply"]');if(n0.app.entities.get('hb').transform.position[0]!==r)return 'invalid value applied';
return true}`);

t('workspace: unsaved-change guard on replacing a scratch scene','/core.html?start=blank',`async()=>{${W}
if(n0.workspace.dirty)return 'fresh scene dirty';n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:3});if(!n0.workspace.dirty)return 'edit not tracked';
const pal=n0.app.palms.items.length;click('#ws-project');click('[data-tab="Examples"]');click('[data-template="coast"]');click('.ws-primary');await wait(300);
if(!q('.ws-confirm.on'))return 'no confirm shown';if(n0.app.palms.items.length!==pal)return 'replaced before confirming';
if(!n0.app.ui.modalOpen())return 'confirm is not modal';click('.ws-confirm [data-r="0"]');await wait(100);if(q('.ws-confirm.on'))return 'cancel left dialog';if(n0.app.palms.items.length!==pal)return 'cancel still replaced the scene';
click('.ws-primary');await wait(300);click('.ws-confirm [data-r="1"]');await wait(2500);if(n0.app.name!=='COAST_001')return 'accept did not open coast: '+n0.app.name;if(n0.workspace.dirty)return 'dirty after new scene';
return true}`);

t('workspace: a saved project needs no discard prompt (autosaved first)','/core.html',`async()=>{${W}
await n0.app.createProject({name:'Safe',template:'empty',starter:'grid'});n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:3});
click('#ws-project');click('[data-tab="Examples"]');click('[data-template="coast"]');click('.ws-primary');await wait(2500);if(q('.ws-confirm.on'))return 'asked to discard a saved project';
const {doc}=await n0.app.projects.load((await n0.app.projects.list()).find(p=>p.name==='Safe').id);if(!doc.palms.length)return 'edit not saved to the project before switching';return true}`);

t('workspace: failed and cancelled imports do not change the scene','/core.html?start=blank',`async()=>{${W}
n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:4});const s0=JSON.stringify(await n0.core.serialize());
const mk=(txt,name)=>new File([txt],name);
await n0.workspace.importFile(mk('not json','a.n0scene'));if(JSON.stringify(await n0.core.serialize())!==s0)return 'bad json changed scene';
await n0.workspace.importFile(mk(JSON.stringify({format:'other'}),'b.n0scene'));if(JSON.stringify(await n0.core.serialize())!==s0)return 'wrong format changed scene';
const good=JSON.parse(s0);good.terrain={broken:true};const pc=n0.workspace.importFile(mk(JSON.stringify(good),'c.n0scene'));await wait(300);click('.ws-confirm [data-r="1"]');await pc;await wait(300);if(JSON.stringify(await n0.core.serialize())!==s0)return 'corrupt terrain changed scene';
const d=JSON.parse(s0);d.palms='x';let threw=false;try{await n0.core.load(d)}catch(e){threw=true}if(!threw)return 'bad palms accepted';if(JSON.stringify(await n0.core.serialize())!==s0)return 'rejected load changed scene';
return true}`);

t('workspace: valid import replaces after confirm, cancel keeps scene','/core.html?start=blank',`async()=>{${W}
const d=JSON.parse(JSON.stringify(await n0.core.serialize()));d.name='IMPORTED';n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:3});
const p=n0.workspace.importFile(new File([JSON.stringify(d)],'ok.n0scene'));await wait(300);if(!q('.ws-confirm.on'))return 'no confirm for dirty import';click('.ws-confirm [data-r="0"]');await p;if(n0.app.name==='IMPORTED')return 'cancel imported';
const p2=n0.workspace.importFile(new File([JSON.stringify(d)],'ok.n0scene'));await wait(300);click('.ws-confirm [data-r="1"]');await p2;if(n0.app.name!=='IMPORTED')return 'confirm did not import';
return true}`);

t('workspace: sheets suppress gameplay input','/core.html?start=blank',`async()=>{${W}
click('#bHelp');if(!n0.app.ui.modalOpen())return 'guide not modal';const m0=n0.app.mode;dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));if(n0.app.mode!==m0)return 'E toggled mode under a sheet';
dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));if(n0.app.ui.modalOpen())return 'Escape did not close';
click('#ws-project');if(!n0.app.ui.modalOpen())return 'launcher not modal';dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));if(n0.app.mode!==m0)return 'E toggled under launcher';
dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));if(q('#start.on'))return 'Escape did not close launcher';
dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));if(n0.app.mode===m0)return 'input not restored after closing';
return true}`);

t('workspace: UI hide and show','/core.html?start=blank',`async()=>{${W}
dispatchEvent(new KeyboardEvent('keydown',{key:'h'}));await wait(100);if(!q('#ui.hide'))return 'not hidden';dispatchEvent(new KeyboardEvent('keydown',{key:'h'}));if(q('#ui.hide'))return 'not shown';return true}`);

t('workspace: diagnostics shows real telemetry or a dash','/core.html?start=blank',`async()=>{${W}
click('[data-workspace="Diagnostics"]');await wait(900);const m=q('#ws-metrics');if(!m)return 'no metrics';const t=n0.telemetry();
if(!/Draw calls/.test(m.textContent))return 'no draw calls row';if(!/FPS/.test(q('#ws-fps').textContent))return 'no fps';
if(!(t.calls>0))return 'telemetry empty';if(!q('#ws-metrics').textContent.includes(String(t.entities)))return 'entities not shown';return true}`);

t('workspace: South Africa guards, transition and return to the local scene','/core.html?start=blank',`async()=>{${W}
n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:3});n0.exec({cmd:'entity.create',prefab:'prim.box',id:'keep',position:[2,1,2],parameters:{size:[1,1,1],color:'#aa6633'}});
const pal=n0.app.palms.items.length,name=n0.app.name,h=n0.app.terrain.hAt(5,5);
click('#ws-project');click('[data-tab="Examples"]');click('[data-template="world"]');const p=n0.app.start('world');await wait(50);
if(!n0.app.geo.loading&&!n0.app.geo.active)return 'world did not start loading';
if(n0.app.geo.loading){const r=await n0.app.start('blank');if(r.ok!==false)return 'switch allowed while loading';}
const r=await p;await wait(300);if(!n0.app.geo.active)return 'world not active: '+JSON.stringify(r);
click('#ws-project');if(!q('[data-leave]'))return 'no return-to-local button';click('[data-leave]');await wait(500);
if(n0.app.geo.active)return 'still in world';if(n0.app.name!==name)return 'name '+n0.app.name;if(n0.app.palms.items.length!==pal)return 'palms lost';
if(!n0.app.entities.get('keep'))return 'entity lost';if(Math.abs(n0.app.terrain.hAt(5,5)-h)>1e-6)return 'terrain changed';
return true}`);
