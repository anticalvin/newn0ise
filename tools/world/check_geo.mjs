// Checks that the JS projection (src/core/geo/georef.js) agrees with tools/world/geo.py and round-trips. Run: node tools/world/check_geo.mjs
import { fromLatLon, toLatLon } from '../../src/core/geo/georef.js';
import { execFileSync } from 'node:child_process';
const pts = [[-33.9249, 18.4241], [-26.2041, 28.0473], [-29.8587, 31.0218], [-28.7282, 24.7499], [-33.0153, 27.9116]];
let worst = 0;
for (const [lat, lon] of pts) {
  const z = Math.floor((lon + 180) / 6) + 1, a = fromLatLon(lat, lon, z);
  const py = JSON.parse(execFileSync('python3', ['-c', `import sys,json;sys.path.insert(0,'tools/world');import geo;print(json.dumps(geo.fwd(${lat},${lon},${z})))`]).toString());
  const d = Math.hypot(a.e - py[0], a.n - py[1]), back = toLatLon(a.e, a.n, z, true), rt = Math.hypot((back.lat - lat) * 111000, (back.lon - lon) * 95000);
  worst = Math.max(worst, d, rt); console.log(`${lat},${lon} zone ${z}: js-vs-python ${d.toExponential(1)} m, round trip ${rt.toExponential(1)} m`);
}
if (worst > 0.01) { console.error('FAIL: projection mismatch ' + worst + ' m'); process.exit(1); }
console.log('ok');
