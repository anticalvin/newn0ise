/* n0ise service worker: network first for the app (so updates arrive), cache fallback for offline use.
   Fonts and the version-pinned CDN libraries (three, Spark, p5) are cache first, so 3D and Lab also open offline after one visit. */
const V='n0ise-v16',SHELL=['./','index.html','effects.html','studio.html','nodes.html','lab.html','character.html','core.html','assets/core.js','ui/core.css','ui/sound.js','assets/figure.js','assets/gp.js','assets/index.js','assets/studio.js','assets/labeditor.js','assets/labform.js','ui/ui.css','ui/ui.js','ui/effects.css','ui/fxi.css','ui/studio.css','ui/nodes.css','src/nodeeditor.js','src/hub.js','src/handoff.js','src/vector-generator.js','src/vector-handoff.js','src/vector-api.js','src/lab-vector.js','ui/lab-vector.css','manifest.webmanifest','icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.origin===location.origin){
    e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));return res;}).catch(()=>caches.match(r).then(m=>m||caches.match(r,{ignoreSearch:true})).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):Response.error()))));
  }else if(/(^|\.)(gstatic|googleapis)\.com$|^cdn\.jsdelivr\.net$|^cdnjs\.cloudflare\.com$/.test(u.hostname)){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})));
  }
});
