// Bundles src/ into assets/ (what effects.html and studio.html load). No framework; three and Spark stay on the importmap CDN pins.
import {build} from 'esbuild';
const common={minify:true,legalComments:'none',bundle:true,format:'esm',target:'es2022',logLevel:'info',external:['three','three/addons/*','@sparkjsdev/spark']};
await build({...common,entryPoints:{index:'src/app.js'},outdir:'assets'});
if((await import('node:fs')).existsSync('src/studio3d.js'))await build({...common,entryPoints:{studio:'src/studio3d.js'},outdir:'assets'});
// cache-bust: the pages reference the bundles with ?v=<hash of the bundle>
import fs from 'node:fs';import crypto from 'node:crypto';
for(const [html,js] of [['effects.html','assets/index.js'],['studio.html','assets/studio.js']]){
  if(!fs.existsSync(js)||!fs.existsSync(html))continue;
  const h=crypto.createHash('sha1').update(fs.readFileSync(js)).digest('hex').slice(0,8);
  fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace(new RegExp(js.replace('.','\\.')+'\\?v=\\w+'),js+'?v='+h));
}
