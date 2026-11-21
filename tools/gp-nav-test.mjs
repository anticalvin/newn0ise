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
const T1=`(async()=>{const sl=window.__sl,pad=window.__pad,st=window.__n0gp,q=s=>document.querySelector(s),R=[],ok=(n,v)=>R.push((v?'ok   ':'FAIL ')+n);
const fr=window.__fr,tap=async i=>{pad.buttons[i]={pressed:true,value:1};await fr(4);pad.buttons[i]={pressed:false,value:0};await fr(4);};
window.__clicks=[];document.addEventListener('click',e=>{window.__clicks.push((e.target.closest('a,button')||e.target).id||e.target.className);if(e.target.closest('a')&&!e.defaultPrevented)e.preventDefault();},true);const mb=q('#menubtn'),r=mb.getBoundingClientRect();R.push('menubtn at '+Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' topEl='+(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2).closest('a,button')||{}).id);st.x=r.left+r.width/2;st.y=r.top+r.height/2;await sl(150);
const gc=document.getElementById('gpcur');gc.style.display='none';const e2=document.elementFromPoint(st.x,st.y);gc.style.display='block';R.push('hit='+(e2&&(e2.id||e2.tagName+'.'+e2.className))+' cur='+gc.style.left+','+gc.style.top+' zr='+(gc.getBoundingClientRect().left)+' inner='+innerWidth+'x'+innerHeight+' dpr='+devicePixelRatio);R.push('pre st='+Math.round(st.x)+','+Math.round(st.y)+' hot='+(st.lastHot&&st.lastHot.id)+' show='+st.show+' el='+((document.elementFromPoint(st.x,st.y)||{}).id||''));await tap(0);await sl(200);R.push('clicks '+window.__clicks.join(','));const d=q('#dialog');ok('A opens the menu',d.open);
ok('cursor drawn inside the open menu',document.getElementById('gpcur').parentNode===d);
const h0=st.lastHot;await tap(13);await sl(150);ok('D-pad moves the highlight',st.lastHot&&st.lastHot!==h0);
await tap(1);await sl(250);ok('B closes the menu',!d.open);
ok('cursor back on the page',document.getElementById('gpcur').parentNode===document.body);
return R.join('\\n');})()`;
const T2=`(async()=>{const sl=window.__sl,pad=window.__pad,st=window.__n0gp,q=s=>document.querySelector(s),R=[],ok=(n,v)=>R.push((v?'ok   ':'FAIL ')+n);
const fr=window.__fr,tap=async i=>{pad.buttons[i]={pressed:true,value:1};await fr(4);pad.buttons[i]={pressed:false,value:0};await fr(4);};
q('[data-drawer=params]').click();await sl(300);const s=q('#controls input[type=range]'),r=s.getBoundingClientRect();st.x=r.left+r.width/2;st.y=r.top+r.height/2;await fr(5);
const v0=+s.value;await tap(15);ok('D-pad right raises a slider ('+v0+' to '+s.value+')',+s.value>v0);const v1=+s.value;await tap(14);ok('D-pad left lowers it',+s.value<v1);
const t0=[...document.querySelectorAll('#lab-actions [data-drawer]')].findIndex(b=>b.getAttribute('aria-expanded')==='true');await tap(5);await sl(200);
const t1=[...document.querySelectorAll('#lab-actions [data-drawer]')].findIndex(b=>b.getAttribute('aria-expanded')==='true');ok('RB moves to the next tab ('+t0+' to '+t1+')',t1===t0+1);
pad.buttons[7]={pressed:true,value:1};return R.join('\\n');})()`;
const T3=`(async()=>{const sl=window.__sl,pad=window.__pad,st=window.__n0gp,q=s=>document.querySelector(s),R=[],ok=(n,v)=>R.push((v?'ok   ':'FAIL ')+n);
const fr=window.__fr,tap=async i=>{pad.buttons[i]={pressed:true,value:1};await fr(4);pad.buttons[i]={pressed:false,value:0};await fr(4);};
await tap(5);
const params=q('[data-vector-drawer=params]');ok('RB moves from Vector Looks to Params',params.getAttribute('aria-expanded')==='true');
const count=q('#vector-controls input[aria-label="Count slider"]');
if(!count){ok('Vector Count slider is available',false);return R.join('\\n');}
count.scrollIntoView({block:'center'});await sl(100);
const r=count.getBoundingClientRect();st.x=r.left+r.width/2;st.y=r.top+r.height/2;await fr(6);
const before=Number(count.value);await tap(15);ok('D-pad raises Vector Count',Number(count.value)>before);
return R.join('\\n');})()`;
async function run(path,w,h,mobile,expr,setup=true){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile});
  await send('Page.navigate',{url:base+path});await sleep(3500);
  await send('Runtime.evaluate',{expression:SETUP,awaitPromise:true,returnByValue:true});
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});return r.result&&r.result.value||JSON.stringify(r).slice(0,200);
}
for(const [vn,w,h,m] of [['desktop',1440,900,false],['phone',390,844,true]]){
  console.log('-- effects',vn);console.log(await run('/effects.html',w,h,m,T1));
  console.log('-- lab',vn);console.log(await run('/lab.html',w,h,m,T2));
  await sleep(1500);const loc=await send('Runtime.evaluate',{expression:'location.pathname+location.search',returnByValue:true});console.log((loc.result.value==='/studio.html'?'ok   ':'FAIL ')+'RT switches workspace (Lab to '+loc.result.value+')');
  console.log('-- vector lab',vn);console.log(await run('/lab.html?vector',w,h,m,T3));
}
ws.close();proc.kill();srv.close();
