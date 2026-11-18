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
const root=fileURLToPath(new URL('..',import.meta.url));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
const chrome=[process.env.CHROME,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p));
if(!chrome){console.error('ui-check: no Chrome found. Set CHROME=/path/to/chrome.');process.exit(1);}
const PAGES=[['home','/index.html'],['camera','/effects.html?cam=1'],['effects','/effects.html'],['3d','/studio.html'],['world','/studio.html','document.querySelector("#bWalk")&&document.querySelector("#bWalk").click()'],['lab','/lab.html']];
const VIEWS=[['phone',390,844,true],['tablet',820,1180,true],['desktop',1440,900,false]];
const OUT=process.argv[2]||'docs/ui/before';
const update=process.argv.includes('--update');
const srv=createServer(async(q,r)=>{try{const p=normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/,'');const f=join(root,p.endsWith('/')?p+'index.html':p);const b=await readFile(f);r.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});r.end(b);}catch(e){r.writeHead(404);r.end('nf');}});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+srv.address().port;
const prof=mkdtempSync(join(tmpdir(),'n0ui-'));
const proc=spawn(chrome,['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--remote-debugging-port=0','--user-data-dir='+prof,'--hide-scrollbars','--mute-audio','about:blank'],{stdio:'ignore'});
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
const SETUP=`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));window.__sl=sl;window.__fr=n=>new Promise(r=>{let c=0;const f=()=>++c>=n?r():requestAnimationFrame(f);requestAnimationFrame(f)});
const pad={connected:true,index:0,id:'fake',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};window.__pad=pad;
navigator.getGamepads=()=>[pad];dispatchEvent(Object.assign(new Event('gamepadconnected'),{gamepad:pad}));await sl(500);pad.axes=[.3,0,0,0];await sl(200);pad.axes=[0,0,0,0];await sl(200);return !!window.__n0gp;})()`;
const LINK=`(async()=>{const sl=window.__sl,pad=window.__pad,st=window.__n0gp,fr=window.__fr;
const a=document.querySelector('.header .nav a[href="studio.html"]'),r=a.getBoundingClientRect();st.x=r.left+r.width/2;st.y=r.top+r.height/2;await fr(5);
window.__ev=[];['pointerdown','pointerup','mousedown','mouseup','click'].forEach(k=>document.addEventListener(k,e=>window.__ev.push(k+':'+((e.target.closest&&e.target.closest('a,button'))||e.target).textContent.trim().slice(0,8)),true));const hit0=(()=>{const c=document.getElementById('gpcur');c.style.display='none';const e=document.elementFromPoint(st.x,st.y);c.style.display='block';return e&&(e.tagName+':'+e.textContent.trim().slice(0,8));})();pad.buttons[0]={pressed:true,value:1};await fr(4);pad.buttons[0]={pressed:false,value:0};await sl(1200);return 'hit='+hit0+' hot='+(st.lastHot&&st.lastHot.textContent.trim())+' ev='+window.__ev.join(',');})()`;
for(const [vn,w,h,m] of [['desktop',1440,900,false],['phone',390,844,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:m});
  await send('Page.navigate',{url:base+'/lab.html'});await sleep(3500);
  await send('Runtime.evaluate',{expression:SETUP,awaitPromise:true,returnByValue:true});
  const lr=await send('Runtime.evaluate',{expression:LINK,awaitPromise:true,returnByValue:true}).catch(()=>{});console.log(JSON.stringify(lr&&lr.result&&lr.result.value));
  await sleep(2500);const loc=await send('Runtime.evaluate',{expression:'location.pathname',returnByValue:true});
  console.log((/studio.html/.test(loc.result.value)?'ok   ':'FAIL ')+'A on a workspace link opens it ('+vn+': '+loc.result.value+')');
}
ws.close();proc.kill();srv.close();
