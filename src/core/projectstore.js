// Projects: manifest format, IndexedDB store (autosave and named projects), and the .n0project zip.
// A project is {format:'n0ise.project', version, name, template, startScene, scenes[], assets[], rules, tests}. Scenes are n0ise.core.scene documents (same as Save).
// Honest status: one project holds the scenes you saved into it; `assets` lists files to embed on export, and `rules`/`tests` are stored but not yet executed by the editor.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export const FORMAT = 'n0ise.project', VERSION = 1;
const DB = 'n0ise-core', STORE = 'kv';

// ---- manifest ----
export function newManifest(name, template = 'sandbox') { return { format: FORMAT, version: VERSION, name, template, startScene: { scene: 'main' }, scenes: ['main'], assets: [], rules: {}, tests: { checks: ['boots'] } }; }
// versioned migrations: add a case here when VERSION grows; old manifests must keep loading
export function migrateManifest(m) {
  if (!m || typeof m !== 'object') throw new Error('Not a project: the file is empty or not JSON.');
  if (m.format !== FORMAT) throw new Error('Not an n0ise project (format is "' + m.format + '").');
  let v = +m.version || 1; if (v > VERSION) throw new Error('This project was made by a newer n0ise (version ' + v + '). Update Core to open it.');
  m = { ...m }; m.scenes = Array.isArray(m.scenes) ? m.scenes.map(String) : []; m.assets = Array.isArray(m.assets) ? m.assets.map(String) : []; m.rules = m.rules && typeof m.rules === 'object' ? m.rules : {}; m.tests = m.tests && typeof m.tests === 'object' ? m.tests : { checks: [] };
  m.startScene = m.startScene && typeof m.startScene === 'object' ? m.startScene : { scene: m.scenes[0] || 'main' };
  if (!m.name || typeof m.name !== 'string') throw new Error('The project has no name.');
  m.version = VERSION; return m;
}

// ---- IndexedDB ----
let dbp = null;
function db() {
  return dbp || (dbp = new Promise((ok, no) => {
    if (typeof indexedDB === 'undefined') return no(new Error('This browser has no IndexedDB, so projects cannot be stored here.'));
    const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => { dbp = null; no(new Error('Could not open project storage: ' + (r.error && r.error.message || 'unknown error') + '. Private browsing can block it.')); };
  }));
}
const quota = e => /quota/i.test((e && (e.name + ' ' + e.message)) || '') ? new Error('Storage is full. Delete a project or export it as .n0project, then try again.') : e;
async function tx(mode, fn) { const d = await db(); return new Promise((ok, no) => { const t = d.transaction(STORE, mode); let out; try { out = fn(t.objectStore(STORE)); } catch (e) { return no(quota(e)); } t.oncomplete = () => ok(out && 'result' in out ? out.result : out); t.onerror = () => no(quota(t.error)); t.onabort = () => no(quota(t.error)); }); }
export const kvPut = (k, v) => tx('readwrite', s => { s.put(v, k); });
export const kvGet = k => tx('readonly', s => s.get(k));
export const kvDel = k => tx('readwrite', s => { s.delete(k); });
const keys = () => tx('readonly', s => s.getAllKeys());

export const putAutosave = doc => kvPut('autosave', { at: Date.now(), doc });
export const getAutosave = async () => { const r = await kvGet('autosave'); return r ? r.doc : null; };

// named projects: key "project:<id>" -> {id, manifest, scenes:{name:doc}, updated}
export const slug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
export async function saveProject(p) { const m = migrateManifest(p.manifest); const id = p.id || slug(m.name); await kvPut('project:' + id, { id, manifest: m, scenes: p.scenes || {}, updated: Date.now() }); return id; }
export const loadProject = id => kvGet('project:' + id);
export const deleteProject = id => kvDel('project:' + id);
export async function listProjects() { const ks = (await keys()).filter(k => String(k).startsWith('project:')), out = []; for (const k of ks) { const p = await kvGet(k); if (p) out.push({ id: p.id, name: p.manifest.name, template: p.manifest.template, scenes: Object.keys(p.scenes).length, updated: p.updated }); } return out.sort((a, b) => b.updated - a.updated); }

// ---- .n0project (zip) ----
export function exportZip(p) {
  const files = { 'project.n0project.json': strToU8(JSON.stringify(p.manifest, null, 1)) };
  for (const [n, doc] of Object.entries(p.scenes || {})) files['scenes/' + n + '.json'] = strToU8(JSON.stringify(doc));
  return zipSync(files, { level: 6 });
}
export function importZip(bytes) {
  let files; try { files = unzipSync(bytes); } catch (e) { throw new Error('This is not a valid .n0project file (it could not be unzipped).'); }
  const mf = files['project.n0project.json']; if (!mf) throw new Error('The file has no project.n0project.json.');
  const manifest = migrateManifest(JSON.parse(strFromU8(mf))), scenes = {};
  for (const [path, data] of Object.entries(files)) { const m = /^scenes\/(.+)\.json$/.exec(path); if (m) scenes[m[1]] = JSON.parse(strFromU8(data)); }
  return { manifest, scenes };
}
