// 3D states on phone, landscape and desktop: screenshots plus a list of interactive elements that overlap each other.
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

const OVER=`(()=>{const els=[...document.querySelectorAll('button,a[href],input,select,textarea,summary,[role=tab]')].filter(e=>{if(e.closest('dialog:not([open]),[hidden],#launch,#gpcur,#gplegend,#gppie'))return false;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>4&&r.height>4&&cs.visibility!=='hidden'&&cs.display!=='none'&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth});
const bad=[];for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i],b=els[j];if(a.contains(b)||b.contains(a))continue;const A=a.getBoundingClientRect(),B=b.getBoundingClientRect();const w=Math.min(A.right,B.right)-Math.max(A.left,B.left),h=Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top);if(w>6&&h>6){
 /* only count real overlaps: the topmost element at the middle of the overlap must be one of the two */
 const x=Math.max(A.left,B.left)+w/2,y=Math.max(A.top,B.top)+h/2,stk=document.elementsFromPoint(x,y);if(stk.some(n=>a.contains(n))&&stk.some(n=>b.contains(n)))bad.push((a.id||a.textContent.trim().slice(0,10)||a.tagName)+' x '+(b.id||b.textContent.trim().slice(0,10)||b.tagName)+' '+Math.round(w)+'x'+Math.round(h));}}
return bad.slice(0,12);})()`;
const STATES=[
 ['empty',`(async()=>{})()`],
 ['shape',`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));const b=[...document.querySelectorAll('#panes button')].find(x=>/^\\+ Cube/i.test(x.textContent.trim())||/^\\+ Sphere/i.test(x.textContent.trim()));b&&b.click();await sl(1200);})()`],
 ['material',`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));document.getElementById('tab_mat').click();await sl(900);})()`],
 ['build',`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));document.getElementById('tab_build').click();await sl(2500);})()`],
 ['sigil',`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));document.getElementById('tab_draw').click();await sl(1500);})()`],
 ['scene',`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));document.getElementById('tab_scene').click();await sl(900);})()`],
];
const OUT=process.argv[2]||'docs/ui/after';
await mkdir(join(root,OUT),{recursive:true});
for(const [vn,w,h,mobile] of [['phone',390,844,true],['land',844,390,true],['desktop',1440,900,false]]){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
  await send('Page.navigate',{url:base+'/studio.html'});await sleep(4000);
  await send('Runtime.evaluate',{expression:'(()=>{const b=document.querySelector("#launch .skip");if(b)b.click();})()'});await sleep(1500);
  for(const [sn,act] of STATES){
    await send('Runtime.evaluate',{expression:act,awaitPromise:true});await sleep(600);
    const r=await send('Runtime.evaluate',{expression:OVER,returnByValue:true});
    if(process.env.DBG){const q=await send('Runtime.evaluate',{expression:`(()=>{const t=document.getElementById('bdtb');if(!t||t.hidden)return 'no bdtb';const r=t.getBoundingClientRect();return 'bdtb '+Math.round(r.top)+'-'+Math.round(r.bottom)+' style.bottom='+t.style.bottom+' objb='+getComputedStyle(document.documentElement).getPropertyValue('--objb')+' sheetTop='+Math.round(document.getElementById('sheet').getBoundingClientRect().top)+' innerH='+innerHeight})()`,returnByValue:true});console.log('   ',q.result.value);}
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,OUT,`s3d-${sn}-${vn}.png`),Buffer.from(shot.data,'base64'));
    const dbg=await send('Runtime.evaluate',{expression:'(()=>{const o=document.getElementById("objbar");return document.body.dataset.tab+" objbar:"+(o?getComputedStyle(o).display+(o.hidden?" hidden":""):"none")+" cover:"+getComputedStyle(document.documentElement).getPropertyValue("--cover")})()',returnByValue:true});console.log(vn.padEnd(8),sn.padEnd(9),dbg.result.value,'overlaps',(r.result.value||[]).length,(r.result.value||[]).join(' | ').slice(0,260));
  }
}
ws.close();proc.kill();srv.close();
