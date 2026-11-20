// Feature audit: lists every control reachable on each page (after opening tabs and sections) so two versions of the UI can be diffed.
// ROOT=/path/to/checkout OUT=/tmp/x.json node tools/feature-audit.mjs
// Screenshot set for the before/after gate: node tools/ui-shots.mjs docs/ui/before
// (derived from ui-check.mjs) UI check: loads each page in headless Chrome at phone and desktop sizes and reports
//   - visible controls smaller than 44px on touch viewports (32px on desktop),
//   - text smaller than 11px, horizontal page scroll, console errors,
// and saves a screenshot per page and viewport to ui-shots/. Counts are compared with tools/ui-budget.json (a ratchet: it only goes down).
// Run: node tools/ui-check.mjs [--update]  (writes the current counts as the new budget)   Needs Chrome (CHROME=/path/to/chrome).
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync,mkdtempSync,readFileSync} from 'node:fs';
import {extname,join,normalize} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const root=process.env.ROOT||fileURLToPath(new URL('..',import.meta.url));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
const chrome=[process.env.CHROME,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p));
if(!chrome){console.error('ui-check: no Chrome found. Set CHROME=/path/to/chrome.');process.exit(1);}
const update=process.argv.includes('--update');
const srv=createServer(async(q,r)=>{try{const p=normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/,'');const f=join(root,p.endsWith('/')?p+'index.html':p);const b=await readFile(f);r.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});r.end(b);}catch(e){r.writeHead(404);r.end('nf');}});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+srv.address().port;
const prof=mkdtempSync(join(tmpdir(),'n0ui-'));
const proc=spawn(chrome,['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--remote-debugging-port=0','--user-data-dir='+prof,'--hide-scrollbars','--mute-audio','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','about:blank'],{stdio:'ignore'});
let port=0;for(let i=0;i<80&&!port;i++){await new Promise(r=>setTimeout(r,250));try{port=+readFileSync(join(prof,'DevToolsActivePort'),'utf8').split('\n')[0];}catch(e){}}
if(!port){console.error('ui-check: Chrome did not start.');proc.kill();process.exit(1);}
const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
let id=0;const wait=new Map(),errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&wait.has(m.id)){wait.get(m.id)(m.result||m.error);wait.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown')errors.push((m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description||m.params.exceptionDetails.text).split('\n')[0]);
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push('console.error: '+(m.params.args[0]&&(m.params.args[0].value||m.params.args[0].description)||'').toString().slice(0,160));});
const send=(method,params={})=>new Promise(ok=>{const i=++id;wait.set(i,ok);ws.send(JSON.stringify({id:i,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await send('Runtime.enable');await send('Page.enable');
const SCAN=`(()=>{
  const touch=matchMedia('(pointer:coarse)').matches||innerWidth<900;const min=touch?44:32;const small=[],text=[];
  const vis=e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>1&&r.height>1&&cs.visibility!=='hidden'&&cs.display!=='none'&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&(e.offsetParent||cs.position==='fixed');};
  document.querySelectorAll('button,a[href],input:not([type=hidden]):not([type=range]),select,summary,[role=tab],[role=button]').forEach(e=>{
    if(!vis(e)||e.closest('[data-ui-allow]')||(e.tagName==='INPUT'&&/checkbox|radio/.test(e.type)&&e.closest('label')))return;
    const r=e.getBoundingClientRect();if(Math.min(r.width,r.height)<min-.5)small.push((e.id?'#'+e.id:(e.className&&e.className.toString().split(' ')[0]||e.tagName))+' '+Math.round(r.width)+'x'+Math.round(r.height)+' '+(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,14));});
  document.querySelectorAll('body *').forEach(e=>{if(!e.childNodes.length)return;let t='';e.childNodes.forEach(n=>{if(n.nodeType===3)t+=n.textContent;});if(t.trim().length<2||!vis(e))return;const fs=parseFloat(getComputedStyle(e).fontSize);if(fs<10.9)text.push((e.id||e.className||e.tagName).toString().split(' ')[0]+' '+fs+'px "'+t.trim().slice(0,12)+'"');});
  return {small,smallN:small.length,textN:new Set(text).size,text:[...new Set(text)].slice(0,14),hscroll:document.documentElement.scrollWidth>innerWidth+1};
})()`;

const COLLECT=`(()=>{const out={};document.querySelectorAll('button,a[href],input,select,textarea,summary,[role=tab],[role=button]').forEach(e=>{if(e.closest('#gpcur,#gplegend,#gppie,.cm-editor'))return;const k=(e.id||e.getAttribute('aria-label')||e.title||(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,26)||e.getAttribute('data-a')||e.className||e.tagName).toString().toLowerCase();
let st='ok';const dlg=e.closest('dialog');const r=e.getBoundingClientRect();
if(dlg&&!dlg.open)st='menu';
else if(!e.getClientRects().length||r.width<2||r.height<2)st='hidden';
else{try{e.scrollIntoView({block:'nearest',inline:'nearest'});}catch(x){}const r2=e.getBoundingClientRect(),cx=Math.min(innerWidth-1,Math.max(0,r2.left+r2.width/2)),cy=Math.min(innerHeight-1,Math.max(0,r2.top+r2.height/2)),t=document.elementFromPoint(cx,cy);if(!t||!(t===e||e.contains(t)||t.contains(e)))st='covered';}
const rank={ok:3,menu:2,covered:1,hidden:0};if(!out[k]||rank[st]>rank[out[k]])out[k]=st;});return out;})()`;
const CLICKALL=`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));const acc={};const grab=()=>{const o=%C%;for(const k in o){const rank={ok:3,menu:2,covered:1,hidden:0};if(!acc[k]||rank[o[k]]>rank[acc[k]])acc[k]=o[k];}};grab();
document.querySelectorAll('details').forEach(d=>d.open=true);grab();
const tabs=[...document.querySelectorAll('[role=tab]')].filter(t=>!t.closest('.nav,.header'));
for(const t of tabs){try{t.click();await sl(350);document.querySelectorAll('details').forEach(d=>d.open=true);grab();}catch(e){}}
for(const b of [...document.querySelectorAll('.railtabs button,.cats button,.chips button[data-cat]')].slice(0,40)){try{b.click();await sl(120);grab();}catch(e){}}
return acc;})()`.replace('%C%',COLLECT);
const PG=[['effects','/effects.html',''],['camera','/effects.html?cam=1','await sl(2500);'],['studio','/studio.html','(document.querySelector("#launch .skip")||{click(){}}).click();await sl(1500);'],['lab','/lab.html','']];
const res={};
for(const [vn,w,h,mobile] of [['phone',390,844,true],['desktop',1440,900,false]])for(const [pn,path,pre] of PG){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile});
  await send('Page.navigate',{url:base+path});await sleep(4500);
  if(pre)await send('Runtime.evaluate',{expression:'(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));'+pre+'})()',awaitPromise:true});
  const r=await send('Runtime.evaluate',{expression:CLICKALL,awaitPromise:true,returnByValue:true});
  res[pn+'/'+vn]=r.result&&r.result.value||{};
}
await writeFile(process.env.OUT||'/tmp/audit.json',JSON.stringify(res));
ws.close();proc.kill();srv.close();
