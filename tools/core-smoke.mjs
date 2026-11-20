// Core smoke test: loads core.html in headless Chrome and exercises the real page (renderer, physics, commands, saves, world import, entities, assets, store).
// Each test runs inside the page and returns true or a string describing the failure. Also records a performance baseline (software GL, so frame rates are a floor, not a target).
// Run: node tools/core-smoke.mjs   Needs Chrome (CHROME=/path/to/chrome).   Writes tools/out/core-baseline.json.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync,mkdtempSync,readFileSync} from 'node:fs';
import {extname,join,normalize} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const root=fileURLToPath(new URL('..',import.meta.url));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary','.n0world':'application/json','.wasm':'application/wasm'};
const chrome=[process.env.CHROME,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p));
if(!chrome){console.error('core-smoke: no Chrome found. Set CHROME=/path/to/chrome.');process.exit(1);}
const srv=createServer(async(q,r)=>{try{const p=normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/,'');const b=await readFile(join(root,p.endsWith('/')?p+'index.html':p));r.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'});r.end(b);}catch(e){r.writeHead(404);r.end('nf');}});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+srv.address().port;
const prof=mkdtempSync(join(tmpdir(),'n0core-'));
const proc=spawn(chrome,['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--remote-debugging-port=0','--user-data-dir='+prof,'--hide-scrollbars','--mute-audio','about:blank'],{stdio:'ignore'});
let port=0;for(let i=0;i<80&&!port;i++){await new Promise(r=>setTimeout(r,250));try{port=+readFileSync(join(prof,'DevToolsActivePort'),'utf8').split('\n')[0];}catch(e){}}
if(!port){console.error('core-smoke: Chrome did not start.');proc.kill();process.exit(1);}
const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
let id=0;const wait=new Map(),errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&wait.has(m.id)){wait.get(m.id)(m.result||m.error);wait.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown')errors.push((m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description||m.params.exceptionDetails.text).split('\n')[0]);
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push('console.error: '+(m.params.args[0]&&(m.params.args[0].value||m.params.args[0].description)||'').toString().slice(0,200));});
const send=(method,params={})=>new Promise(ok=>{const i=++id;wait.set(i,ok);ws.send(JSON.stringify({id:i,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await send('Runtime.enable');await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true,timeout:120000});if(r.exceptionDetails)return 'threw: '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text).split('\n')[0];return r.result.value;};
const open=async url=>{errors.length=0;await send('Page.navigate',{url:base+url});for(let i=0;i<60;i++){await sleep(500);if(await ev('!!(window.n0&&window.n0.app&&window.n0.app.phys&&(window.n0.app.phys.ready||window.n0.app.phys.failed))'))break;}await sleep(500);};

/* tests: [name, url, async body]. The body sees `n0` and returns true or a failure string. */
const T=[];const t=(name,url,body)=>T.push([name,url,body]);
t('page loads, renders, physics ready','/core.html?start=blank',`async()=>{const a=n0.app;await new Promise(r=>setTimeout(r,800));const i=a.renderer.info.render;if(!i.calls)return 'no draw calls';if(!a.phys.ready)return 'physics: '+a.phys.error;if(a.terrain.preset!=='blank')return 'preset '+a.terrain.preset;return true}`);
t('describe lists the command set','/core.html?start=blank',`async()=>{const d=n0.exec({cmd:'describe'});const need=['scene.new','terrain.stroke','environment.set','scatter.add','world.import','spawn.set','undo','redo'];const miss=need.filter(k=>!d.commands[k]);return miss.length?'missing '+miss:true}`);
t('terrain stroke, undo, redo','/core.html?start=blank',`async()=>{const a=n0.app,h0=a.terrain.hAt(0,0);n0.exec({cmd:'terrain.stroke',tool:'raise',center:[0,0],radius:8,strength:1,duration:1});const h1=a.terrain.hAt(0,0);if(!(h1>h0+0.5))return 'raise did nothing '+h0+' '+h1;n0.exec({cmd:'undo'});if(Math.abs(a.terrain.hAt(0,0)-h0)>1e-4)return 'undo failed';n0.exec({cmd:'redo'});return Math.abs(a.terrain.hAt(0,0)-h1)<1e-4||'redo failed'}`);
t('physics heightfield matches terrain','/core.html?start=coast',`async()=>{const a=n0.app;for(const [x,z] of [[-60,30],[40,-70],[10,90],[70,55]]){const c=a.phys.castDown(x,z),h=a.terrain.hAt(x,z);if(c==null||Math.abs(c-h)>0.05)return 'at '+x+','+z+' physics '+c+' terrain '+h}return true}`);
t('save v3+, reload round trip','/core.html?start=blank',`async()=>{const a=n0.app,c=n0.core;n0.exec({cmd:'terrain.stroke',tool:'raise',center:[-30,20],radius:10,strength:0.6});n0.exec({cmd:'scatter.add',center:[40,40],radius:20,count:6});n0.exec({cmd:'environment.set',time:19.5});const h=a.terrain.hAt(-30,20),p=a.palms.items.length,j=JSON.stringify(await c.serialize());n0.exec({cmd:'scene.new',preset:'coast'});await c.load(JSON.parse(j));if(a.terrain.preset!=='blank')return 'preset lost';if(Math.abs(a.terrain.hAt(-30,20)-h)>1e-3)return 'terrain lost';if(a.palms.items.length!==p)return 'palms lost';return Math.abs(a.env.p.time-19.5)<1e-6||'env lost'}`);
t('v3 scene file still loads','/core.html?start=blank',`async()=>{const a=n0.app,c=n0.core;const d=await c.serialize();d.version=3;delete d.entities;delete d.assetsUsed;await c.load(JSON.parse(JSON.stringify(d)));return true}`);
t('.n0world import reports unsupported parts','/core.html?start=blank',`async()=>{const w=await (await fetch('/worlds/room-with-door.n0world')).json();const r=n0.exec({cmd:'world.import',world:w});if(!r.ok)return r.msg;if(!(r.report||[]).some(x=>x.level==='unsupported'))return 'no unsupported report';n0.exec({cmd:'undo'});return n0.app.worlds.length===0||'undo left the world'}`);
t('bad commands fail without changing the scene','/core.html?start=blank',`async()=>{const a=n0.app;const h=a.terrain.hAt(0,0),n=n0.core.hist.length;const rs=[n0.exec({cmd:'terrain.stroke',tool:'nuke',center:[0,0]}),n0.exec({cmd:'scene.new',preset:'moon'}),n0.exec({cmd:'nope'}),n0.exec({})];if(rs.some(r=>r.ok))return 'a bad command succeeded';return a.terrain.hAt(0,0)===h&&n0.core.hist.length===n||'state changed'}`);
t('api batch + render + camera','/core.html?start=blank',`async()=>{const {createCoreApi}=await import('/src/core/api.js');const api=createCoreApi(n0.app);const b=await api.run({cmd:'batch',ops:[{cmd:'environment.set',time:9},{cmd:'state'}]});if(b.results.some(x=>x.error))return 'batch error';const r=await api.run({cmd:'render',width:320});if(!(r.base64&&r.base64.length>2000))return 'render empty';return true}`);

const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const fs=await import('node:fs');let extra=[];
try{const ex=await import('./core-smoke-extra.mjs');extra=ex.tests||[];}catch(e){}
for(const [n,u,b] of extra)T.push([n,u,b]);
let fail=0;const base0={};
for(const [name,url,body] of T){
  if(only.length&&!only.some(o=>name.includes(o)))continue;
  await open(url);
  let r=await ev('('+body+')()');
  if(r===true&&errors.length)r='console errors: '+errors[0];
  console.log((r===true?'  ok   ':'  FAIL ')+name+(r===true?'':'  → '+r));if(r!==true)fail++;
}
/* performance baseline */
for(const [label,url] of [['blank','/core.html?start=blank'],['coast','/core.html?start=coast']]){
  await open(url);await sleep(2500);const tl=await ev('n0.telemetry()');base0[label]=tl;console.log('  base',label.padEnd(6),JSON.stringify(tl));
}
await mkdir(join(root,'tools','out'),{recursive:true});
await writeFile(join(root,'tools','out','core-baseline.json'),JSON.stringify({when:new Date().toISOString(),note:'headless Chrome, software GL (SwiftShader), 390x844. Frame rates are a floor for CI, not a device target.',chrome:await ev('navigator.userAgent'),baseline:base0},null,1));
ws.close();proc.kill();srv.close();
if(fail){console.error('core-smoke: '+fail+' failed');process.exit(1);}
console.log('core-smoke: ok');
