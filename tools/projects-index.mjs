// Generates projects/<id>/project.n0project.json for the seed projects and projects/index.json (the registry the start sheet reads).
// Run: node tools/projects-index.mjs   (committed output; `node tools/projects-index.mjs --check` fails if it is stale)
import fs from 'node:fs';
const car = [{ cmd: 'entity.create', prefab: 'build.ramp', position: [0, 0, -14], parameters: { size: [6, 2, 10] } }, { cmd: 'entity.create', prefab: 'build.block', position: [12, 0, -8], parameters: { size: [4, 1, 4] } }, { cmd: 'entity.create', prefab: 'build.cylinder', position: [-10, 0, -6] }, { cmd: 'entity.create', prefab: 'vehicle.car', position: [0, 0, 6] }, { cmd: 'entity.create', prefab: 'spawn.player', position: [4, 0, 8] }];
const SEEDS = [
  ['blank-level', 'Blank level', 'level', 'blank', 'ready', ['physics', 'character', 'combat', 'weapons', 'vehicle', 'rules'], 'Empty grid floor: build a level and Play it.'],
  ['coast-demo', 'Coast demo', 'third-person', 'coast', 'ready', ['physics', 'character', 'combat'], 'Sculptable island with beach props, crates, a dummy and a brawler.'],
  ['physics-sandbox', 'Physics sandbox', 'sandbox', 'physics', 'ready', ['physics'], 'Flat yard: every catalog model as a rigid body.'],
  ['proving-ground', 'Proving ground', 'sandbox', 'proving', 'ready', ['physics', 'character'], 'Test course for movement.'],
  ['shooting-range', 'Shooting range', 'fps', 'range', 'ready', ['weapons'], 'First-person range with targets.'],
  ['drone-arena', 'Drone arena', 'fps', 'arena', 'ready', ['weapons', 'ai'], 'Waves of drones. They fly straight at you: there is no pathfinding yet.'],
  ['coin-run', 'Coin run', 'platformer', 'coins', 'ready', ['physics', 'character'], 'Platforming mini game: collect the coins before time runs out.'],
  ['first-light', 'First Light', 'third-person', 'first-light', 'ready', ['character', 'combat', 'audio'], 'The full game slice.'],
  ['combat-lab', 'Combat lab', 'sandbox', 'lab', 'ready', ['character', 'combat'], 'Flat arena with the Tune panel.'],
  ['vehicle-yard', 'Vehicle yard', 'driving', 'blank', 'experimental', ['physics', 'vehicle'], 'A car, a ramp, a block and a cylinder on the grid floor. Press F to drive.', car],
];
const out = [], files = {};
for (const [id, name, template, route, status, systems, about, commands = []] of SEEDS) {
  const m = { format: 'n0ise.project', version: 1, name, template, startScene: { route, commands }, scenes: [], assets: [], rules: {}, tests: { checks: ['boots'] }, seed: { status, systems, about } };
  files[`projects/${id}/project.n0project.json`] = JSON.stringify(m, null, 1) + '\n';
  out.push({ id, name, template, route, commands, status, systems, about, manifest: `projects/${id}/project.n0project.json` });
}
files['projects/index.json'] = JSON.stringify({ generated: 'node tools/projects-index.mjs', projects: out }, null, 1) + '\n';
if (process.argv.includes('--check')) { let bad = 0; for (const [p, s] of Object.entries(files)) if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== s) { console.error('stale: ' + p); bad++; } process.exit(bad ? 1 : 0); }
for (const [p, s] of Object.entries(files)) { fs.mkdirSync(p.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(p, s); }
console.log('wrote ' + Object.keys(files).length + ' files');
