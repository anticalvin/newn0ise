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
click('[data-template="vehicle"]');const p=q('.ws-primary');if(!p.disabled)return 'planned template launchable';if(!/Not implemented/.test(p.textContent))return 'planned label '+p.textContent;
click('[data-template="third"]');if(q('.ws-primary').disabled)return 'ready template disabled';
click('[data-tab="Examples"]');click('[data-template="habitat"]');if(!q('.ws-primary').disabled)return 'habitat launchable';
return true}`);

t('workspace: create launches Blank, editor shell appears','/core.html',`async()=>{${W}
click('[data-template="third"]');click('.ws-primary');await wait(1500);
if(q('#start.on'))return 'launcher still open';if(n0.app.name!=='Blank level')return 'scene '+n0.app.name;
if(!q('.ws-sidebar'))return 'no sidebar';if(getComputedStyle(q('.ws-status')).display==='none')return 'no status bar';
const sim=qa('#mode button').find(b=>b.textContent==='Simulate');if(!sim||!sim.disabled)return 'Simulate must be disabled';
return true}`);

t('workspace: mode switch, workspace tools and dock groups','/core.html?start=island',`async()=>{${W}
click('#mode [data-m="edit"]');if(n0.app.mode!=='edit')return 'not edit';
click('[data-workspace="Assets"]');if(n0.app.ui.group!==3)return 'Assets did not open Place';
click('[data-workspace="Environment"]');if(n0.app.ui.group!==6)return 'Environment did not open Sky';
click('[data-workspace="World"]');if(n0.app.ui.group!==0)return 'World did not open Land';
for(const k of ['raise','lower','smooth','flatten']){n0.app.setTool(k);}
const h0=n0.app.terrain.hAt(0,0);n0.exec({cmd:'terrain.stroke',tool:'raise',center:[0,0],radius:8,strength:1,duration:1});if(!(n0.app.terrain.hAt(0,0)>h0))return 'terrain tool dead';
click('#mode [data-m="explore"]');if(n0.app.mode!=='explore')return 'not play';
if(getComputedStyle(q('.ws-sidebar')).display!=='none')return 'sidebar visible in Play';
return true}`);

t('workspace: scene hierarchy lists entities and edits position through entity.set','/core.html?start=island',`async()=>{${W}
n0.exec({cmd:'entity.create',prefab:'prim.box',id:'hb',position:[3,1,4],parameters:{size:[1,1,1],color:'#336699'}});
click('#mode [data-m="edit"]');click('[data-workspace="Scene"]');await wait(100);
if(!q('[data-entity="hb"]'))return 'entity missing from hierarchy';click('[data-entity="hb"]');
let f=q('[data-position="0"]');if(!f)return 'no position field';f.value='9';click('[data-inspect="apply"]');
if(n0.app.entities.get('hb').transform.position[0]!==9)return 'position not applied';
n0.exec({cmd:'undo'});if(n0.app.entities.get('hb').transform.position[0]!==3)return 'undo failed';
if(q('[data-position="0"]').value!=='3.000')return 'inspector stale after undo: '+q('[data-position="0"]').value;const f2=q('[data-position="0"]');f2.value='abc';const r=n0.app.entities.get('hb').transform.position[0];click('[data-inspect="apply"]');if(n0.app.entities.get('hb').transform.position[0]!==r)return 'invalid value applied';
return true}`);

t('workspace: unsaved-change guard on replacing the scene','/core.html?start=island',`async()=>{${W}
if(n0.workspace.dirty)return 'fresh scene dirty';n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:3});if(!n0.workspace.dirty)return 'edit not tracked';
const pal=n0.app.palms.items.length;click('#ws-project');click('[data-template="blank"]');click('.ws-primary');await wait(200);
if(!q('.ws-confirm.on'))return 'no confirm shown';if(n0.app.palms.items.length!==pal)return 'replaced before confirming';
if(!n0.app.ui.modalOpen())return 'confirm is not modal';click('.ws-confirm [data-r="0"]');await wait(100);if(q('.ws-confirm.on'))return 'cancel left dialog';if(n0.app.palms.items.length!==pal)return 'cancel still replaced the scene';
click('.ws-primary');await wait(200);click('.ws-confirm [data-r="1"]');await wait(1500);if(n0.app.palms.items.length===pal&&pal>0)return 'accept did not replace';if(n0.workspace.dirty)return 'dirty after new scene';
return true}`);

t('workspace: failed and cancelled imports do not change the scene','/core.html?start=island',`async()=>{${W}
n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:4});const s0=JSON.stringify(await n0.core.serialize());
const mk=(txt,name)=>new File([txt],name);
await n0.workspace.importFile(mk('not json','a.n0scene'));if(JSON.stringify(await n0.core.serialize())!==s0)return 'bad json changed scene';
await n0.workspace.importFile(mk(JSON.stringify({format:'other'}),'b.n0scene'));if(JSON.stringify(await n0.core.serialize())!==s0)return 'wrong format changed scene';
const good=JSON.parse(s0);good.terrain={broken:true};const pc=n0.workspace.importFile(mk(JSON.stringify(good),'c.n0scene'));await wait(300);click('.ws-confirm [data-r="1"]');await pc;await wait(300);if(JSON.stringify(await n0.core.serialize())!==s0)return 'corrupt terrain changed scene';
const d=JSON.parse(s0);d.palms='x';let threw=false;try{await n0.core.load(d)}catch(e){threw=true}if(!threw)return 'bad palms accepted';if(JSON.stringify(await n0.core.serialize())!==s0)return 'rejected load changed scene';
return true}`);

t('workspace: valid import replaces after confirm, cancel keeps scene','/core.html?start=island',`async()=>{${W}
const d=JSON.parse(JSON.stringify(await n0.core.serialize()));d.name='IMPORTED';n0.exec({cmd:'scatter.add',center:[10,10],radius:5,count:3});
const p=n0.workspace.importFile(new File([JSON.stringify(d)],'ok.n0scene'));await wait(300);if(!q('.ws-confirm.on'))return 'no confirm for dirty import';click('.ws-confirm [data-r="0"]');await p;if(n0.app.name==='IMPORTED')return 'cancel imported';
const p2=n0.workspace.importFile(new File([JSON.stringify(d)],'ok.n0scene'));await wait(300);click('.ws-confirm [data-r="1"]');await p2;if(n0.app.name!=='IMPORTED')return 'confirm did not import';
return true}`);

t('workspace: sheets suppress gameplay input','/core.html?start=island',`async()=>{${W}
click('#bHelp');if(!n0.app.ui.modalOpen())return 'guide not modal';const m0=n0.app.mode;dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));if(n0.app.mode!==m0)return 'E toggled mode under a sheet';
dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));if(n0.app.ui.modalOpen())return 'Escape did not close';
click('#ws-project');if(!n0.app.ui.modalOpen())return 'launcher not modal';dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));if(n0.app.mode!==m0)return 'E toggled under launcher';
dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));if(q('#start.on'))return 'Escape did not close launcher';
dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));if(n0.app.mode===m0)return 'input not restored after closing';
return true}`);

t('workspace: UI hide and show','/core.html?start=island',`async()=>{${W}
dispatchEvent(new KeyboardEvent('keydown',{key:'h'}));await wait(100);if(!q('#ui.hide'))return 'not hidden';dispatchEvent(new KeyboardEvent('keydown',{key:'h'}));if(q('#ui.hide'))return 'not shown';return true}`);

t('workspace: diagnostics shows real telemetry or a dash','/core.html?start=island',`async()=>{${W}
click('[data-workspace="Diagnostics"]');await wait(900);const m=q('#ws-metrics');if(!m)return 'no metrics';const t=n0.telemetry();
if(!/Draw calls/.test(m.textContent))return 'no draw calls row';if(!/FPS/.test(q('#ws-fps').textContent))return 'no fps';
if(!(t.calls>0))return 'telemetry empty';if(!q('#ws-metrics').textContent.includes(String(t.entities)))return 'entities not shown';return true}`);

t('workspace: South Africa guards, transition and return to the local scene','/core.html?start=island',`async()=>{${W}
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
