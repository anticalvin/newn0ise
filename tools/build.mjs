// Bundles src/ into assets/ (what index.html and studio.html load). No framework; three and Spark stay on the importmap CDN pins.
import {build} from 'esbuild';
const common={bundle:true,format:'esm',target:'es2022',logLevel:'info',external:['three','three/addons/*','@sparkjsdev/spark']};
await build({...common,entryPoints:{index:'src/app.js'},outdir:'assets'});
if((await import('node:fs')).existsSync('src/studio3d.js'))await build({...common,entryPoints:{studio:'src/studio3d.js'},outdir:'assets'});
