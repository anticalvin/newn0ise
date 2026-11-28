// Bundles src/ into assets/ (what effects.html and studio.html load). No framework; three and Spark stay on the importmap CDN pins.
import {build} from 'esbuild';
const common={minify:true,legalComments:'none',bundle:true,format:'esm',target:'es2022',logLevel:'info',external:['three','three/addons/*','@sparkjsdev/spark','manifold-3d','three-mesh-bvh']};
await build({...common,entryPoints:{index:'src/app.js'},outdir:'assets'});
if((await import('node:fs')).existsSync('src/studio3d.js'))await build({...common,entryPoints:{studio:'src/studio3d.js'},outdir:'assets'});
await build({...common,external:[],entryPoints:{labeditor:'src/labeditor.js'},outdir:'assets'});
await build({...common,entryPoints:{labform:'src/labform.js'},outdir:'assets'});
await build({...common,entryPoints:{figure:'src/figure.js'},outdir:'assets'});
await build({...common,entryPoints:{gp:'src/gp-page.js'},outdir:'assets'});
// Core is fully vendored: three, its addons and Rapier (wasm embedded) are bundled, so core.html boots with no network.
await build({...common,external:[],entryPoints:{core:'src/core/main.js'},outdir:'assets'});
// cache-bust: the pages reference the bundles with ?v=<hash of the bundle>
import fs from 'node:fs';import crypto from 'node:crypto';
for(const [html,js] of [['effects.html','assets/index.js'],['studio.html','assets/studio.js'],['character.html','assets/figure.js'],['index.html','assets/gp.js'],['lab.html','assets/gp.js'],['core.html','assets/core.js'],['physics.html','assets/core.js']]){
  if(!fs.existsSync(js)||!fs.existsSync(html))continue;
  const h=crypto.createHash('sha1').update(fs.readFileSync(js)).digest('hex').slice(0,8);
  fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace(new RegExp(js.replace('.','\\.')+'\\?v=\\w+'),js+'?v='+h));
}
