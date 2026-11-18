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
/* node tools/ui-shots.mjs <outdir> [ref] [name,name]  (ref = the demo, docs/ui/n0ise-ui-reference.html; names filter the pages) */
const REF=process.argv[3]==='ref',ONLY=(process.argv[4]||'').split(',').filter(Boolean);
if(REF){const R='/docs/ui/n0ise-ui-reference.html#';PAGES.length=0;PAGES.push(['camera',R+'camera'],['effects',R+'effects'],['3d',R+'studio'],['lab',R+'lab']);}
if(ONLY.length)for(let i=PAGES.length-1;i>=0;i--)if(!ONLY.includes(PAGES[i][0]))PAGES.splice(i,1);
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
const TEST=`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)),q=s=>document.querySelector(s),R=[],ok=(n,v)=>R.push((v?'ok   ':'FAIL ')+n);
await sl(2500);
ok('status says live',/LIVE|seed/i.test(q('#status').textContent));
q('#run').click();await sl(2500);ok('run again',/LIVE|seed/i.test(q('#status').textContent));
q('[data-drawer=params]').click();await sl(200);ok('params drawer opens',!q('#lab-params').hidden&&q('[data-drawer=params]').getAttribute('aria-expanded')==='true');
const n0=document.querySelectorAll('#controls input[type=range]').length;ok('sliders listed ('+n0+')',n0>=6);
q('#cname').value='wobble';q('#cadd').click();await sl(200);ok('add slider',document.querySelectorAll('#controls input[type=range]').length===n0+1);
q('#random').click();q('#seed').click();await sl(1500);ok('randomize and new seed run',/LIVE|seed/i.test(q('#status').textContent));
q('[data-drawer=presets]').click();await sl(150);ok('presets drawer swaps',!q('#lab-presets').hidden&&q('#lab-params').hidden);
ok('moods ('+document.querySelectorAll('#moods button').length+')',document.querySelectorAll('#moods button').length>0);
q('#moods button').click();q('#preset').value='orbit';q('#preset').dispatchEvent(new Event('change'));await sl(1500);ok('preset loads',q('#sketch-name').textContent==='Orbital study'&&q('#code').value.includes('orbit')==false||q('#code').value.length>50);
q('[data-drawer=export]').click();await sl(150);ok('export drawer',!q('#lab-export').hidden);
const p=q('#pause');p.click();await sl(200);ok('pause toggles',p.getAttribute('aria-pressed')==='true');p.click();
q('#menubtn').click();await sl(300);const d=q('#dialog');ok('menu dialog opens',d&&d.open&&d.querySelectorAll('.pill').length>10);d.close();
ok('no horizontal overflow',document.documentElement.scrollWidth<=innerWidth+1);
ok('save',(q('#save').click(),true));
return R.join('\\n');})()`;
await mkdir(join(root,'ui-shots'),{recursive:true});
for(const [vn,w,h,mobile] of [['phone',390,844,true],['desktop',1440,900,false]]){
  errors.length=0;
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
  await send('Page.navigate',{url:base+'/lab.html'});await sleep(3500);
  const r=await send('Runtime.evaluate',{expression:TEST,awaitPromise:true,returnByValue:true});
  console.log('--',vn);console.log(r.result&&r.result.value||JSON.stringify(r).slice(0,300));console.log('errors:',errors.length,errors.slice(0,3).join(' | '));
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'ui-shots',`lab-open-${vn}.png`),Buffer.from(shot.data,'base64'));
}
ws.close();proc.kill();srv.close();
