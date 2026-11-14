/* Headless parity runner: renders a fixed stack at a fixed time, seed and size, then compares the preview frame, a still export and a
   video-sequence frame, and the 3D page's render path. Needs a Chromium (set CHROME=/path/to/chrome). Exits non-zero if it can't run
   or if a difference is above the limits. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname,join,normalize} from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.glb':'model/gltf-binary','.svg':'image/svg+xml'};
const LIMIT={still:2,video:8,app3d:12}; // max per-channel difference (0-255)
const chrome=[process.env.CHROME,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&existsSync(p));
if(!chrome){console.error('parity: no Chrome or Chromium found. Set CHROME=/path/to/chrome.');process.exit(1);}
const srv=createServer(async(q,r)=>{try{const p=normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/,'');const f=join(root,p.endsWith('/')?p+'index.html':p);const d=await readFile(f);r.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});r.end(d);}catch(e){r.writeHead(404);r.end();}});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
const url=`http://127.0.0.1:${srv.address().port}/tools/parity.html`;
const res=await new Promise(ok=>execFile(chrome,['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--virtual-time-budget=60000','--dump-dom',url],{timeout:120000,maxBuffer:1<<26},(e,so,se)=>ok({stdout:so,stderr:se})));
srv.close();
const m=/<pre id="o">([\s\S]*?)<\/pre>/.exec(res.stdout||'');
if(!m||/running…/.test(m[1])){console.error('parity: the page did not finish.\n'+(res.stdout||'').slice(0,400)+'\n'+(res.stderr||'').split('\n').slice(-5).join('\n'));process.exit(1);}
const out=m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&');console.log(out);
if(/ERROR/.test(out))process.exit(1);
const mx=k=>{const l=out.split('\n').find(x=>x.startsWith(k));const n=l&&/"max":(\d+)/.exec(l);return n?+n[1]:Infinity;};
const bad=[['preview vs still',LIMIT.still],['preview vs video frame',LIMIT.video],['app path vs 3D page path',LIMIT.app3d]].filter(([k,l])=>mx(k)>l);
if(bad.length){console.error('parity: over the limit: '+bad.map(b=>b[0]).join(', '));process.exit(1);}
console.log('parity: ok');
