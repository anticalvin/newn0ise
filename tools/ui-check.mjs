// UI check: loads each page in headless Chrome at phone and desktop sizes and reports
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
const PAGES=[['effects','/effects.html'],['camera','/effects.html?cam=1'],['studio','/studio.html'],['lab','/lab.html'],['core-start','/core.html'],['core-blank','/core.html?start=blank'],['core-coast','/core.html?start=coast']];
const VIEWS=[['phone390',390,844,true],['phone360',360,640,true],['desktop',1440,900,false]];
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
await mkdir(join(root,'ui-shots'),{recursive:true});
const results={};
for(const [pn,path] of PAGES)for(const [vn,w,h,mobile] of VIEWS){
  errors.length=0;
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:mobile?2:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
  await send('Emulation.setEmulatedMedia',{features:[{name:'pointer',value:mobile?'coarse':'fine'}]}).catch(()=>{});
  await send('Page.navigate',{url:base+path});await sleep(4500);
  const r=(await send('Runtime.evaluate',{expression:SCAN,returnByValue:true})).result.value;
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'ui-shots',`${pn}-${vn}.png`),Buffer.from(shot.data,'base64'));
  const key=pn+'/'+vn;results[key]={small:r.smallN,text:r.textN,hscroll:r.hscroll,errors:errors.length};
  console.log(key.padEnd(18),'controls<min',String(r.smallN).padStart(3),' text<11px',String(r.textN).padStart(3),' hscroll',r.hscroll,' errors',errors.length,errors[0]?('· '+errors[0].slice(0,90)):'');
  if(process.argv.includes('--verbose')){console.log('   ',r.small.slice(0,14).join(' | '));console.log('    TEXT:',r.text.join(' | '));}
}
ws.close();proc.kill();srv.close();
const bp=join(root,'tools','ui-budget.json');
if(update){await writeFile(bp,JSON.stringify(results,null,1));console.log('ui-check: budget updated');process.exit(0);}
let budget={};try{budget=JSON.parse(readFileSync(bp,'utf8'));}catch(e){}
const bad=[];for(const [k,v] of Object.entries(results)){const b=budget[k];if(!b)continue;
  if(v.small>b.small)bad.push(k+' controls under size '+v.small+' > '+b.small);if(v.text>b.text)bad.push(k+' small text '+v.text+' > '+b.text);if(v.errors>b.errors)bad.push(k+' console errors '+v.errors+' > '+b.errors);if(v.hscroll&&!b.hscroll)bad.push(k+' horizontal scroll');}
if(bad.length){console.error('ui-check: over budget\n  '+bad.join('\n  '));process.exit(1);}
console.log('ui-check: ok (screenshots in ui-shots/)');
