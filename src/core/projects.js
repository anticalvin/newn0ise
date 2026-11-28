// Project manager: registry (projects/index.json, shipped seed projects), the IndexedDB store, .n0project import/export, and the Export player.
// app.projects is the API; Core.exec exposes it as project.* commands (they return a Promise).
import * as store from './projectstore.js';

const download = (name, bytes, type) => { const u = URL.createObjectURL(new Blob([bytes], { type })), l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const KENNEY = ['blaster-repeater.glb', 'blaster.glb', 'city-building-garage.glb', 'city-building-small-a.glb', 'city-building-small-b.glb', 'city-building-small-c.glb', 'city-building-small-d.glb', 'city-grass-trees-tall.glb', 'city-grass-trees.glb', 'city-pavement-fountain.glb', 'city-pavement.glb', 'city-road-corner.glb', 'city-road-intersection.glb', 'city-road-straight-lightposts.glb', 'city-road-straight.glb', 'enemy-flying.glb', 'grass.glb', 'plat-block-coin.glb', 'plat-brick.glb', 'plat-coin.glb', 'plat-flag.glb', 'plat-platform-large.glb', 'plat-platform-medium.glb', 'plat-snd-coin.ogg', 'platform-large-grass.glb', 'platform.glb', 'snd-blaster.ogg', 'snd-blaster_repeater.ogg', 'snd-enemy_attack.ogg', 'snd-enemy_destroy.ogg', 'snd-enemy_hurt.ogg', 'snd-placement-a.ogg', 'snd-removal-a.ogg', 'snd-weapon_change.ogg', 'spr-burst.png', 'spr-crosshair.png', 'spr-hit.png', 'wall-high.glb', 'wall-low.glb', 'Textures/colormap.png'].map(n => 'assets/core/kenney/' + n);

export function createProjects(app) {
  const core = app.core, P = { store };
  let registry = null;
  P.registry = async () => { if (registry) return registry; try { const r = await fetch('projects/index.json'); registry = r.ok ? (await r.json()).projects || [] : []; } catch (e) { registry = []; } return registry; };
  P.list = async () => ({ ok: true, registry: await P.registry(), stored: await store.listProjects().catch(() => []) });
  // save the scene you are looking at into a named project (one scene called "main")
  P.save = async (name, id) => {
    name = String(name || app.name || 'Project').slice(0, 60); const doc = await core.serialize(), manifest = store.newManifest(name, app.level ? 'level' : 'sandbox');
    const pid = await store.saveProject({ id, manifest, scenes: { main: doc } }); return { ok: true, id: pid, msg: 'Saved project "' + name + '"' };
  };
  P.open = async id => {
    const p = await store.loadProject(id);
    if (p) { const doc = p.scenes[p.manifest.startScene.scene] || Object.values(p.scenes)[0]; if (!doc) return { ok: false, msg: 'The project has no scenes.' }; app.ui.hideStart(); await core.load(doc); app.name = p.manifest.name; app.ui.brand(); return { ok: true, msg: 'Opened ' + p.manifest.name }; }
    const seed = (await P.registry()).find(x => x.id === id); if (!seed) return { ok: false, msg: 'No project "' + id + '". Run {"cmd":"project.list"}.' };
    app.ui.hideStart(); await app.start(seed.route); for (const c of seed.commands || []) core.exec(c); return { ok: true, msg: 'Opened seed project ' + seed.name };
  };
  P.remove = async id => { await store.deleteProject(id); return { ok: true, msg: 'Deleted ' + id }; };
  P.exportZip = async id => { const p = await store.loadProject(id); if (!p) return { ok: false, msg: 'No saved project "' + id + '".' }; const bytes = store.exportZip(p); download(id + '.n0project', bytes, 'application/zip'); return { ok: true, bytes: bytes.length, msg: 'Exported ' + id + '.n0project (' + (bytes.length / 1024).toFixed(0) + ' KB)' }; };
  P.importFile = async file => { const p = store.importZip(new Uint8Array(await file.arrayBuffer())); const id = await store.saveProject(p); return { ok: true, id, msg: 'Imported ' + p.manifest.name }; };

  // ---- Export player: one self-contained HTML (runtime, wasm, scene, assets inlined) that runs offline with no editor ----
  P.exportPlayer = async (opt = {}) => {
    const get = async (u, bin) => { const r = await fetch(u); if (!r.ok) throw new Error('Could not read ' + u + ' (' + r.status + ')'); return bin ? new Uint8Array(await r.arrayBuffer()) : r.text(); };
    let html = await get('core.html'); const js = await get('assets/core.js');
    const css = []; for (const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)) css.push(await get(m[1]));
    const touch = await get('touch-guard.js'), files = {};
    const want = new Set(KENNEY); for (const u of opt.assets || []) want.add(u);
    if (opt.scene) for (const e of opt.scene.entities || []) { const id = e.parameters && e.parameters.assetId; if (id && app.assets.has(id)) { const m = app.assets.meta(id); if (m.url) want.add(m.url); } }
    for (const u of want) { try { files[u] = b64(await get(u, true)); } catch (e) { /* optional asset: the player runs without it */ } }
    const player = { name: opt.name || app.name, scene: opt.scene || null, route: opt.route || null, commands: opt.commands || [], files: Object.keys(files) };
    const shim = `window.__N0_PLAYER__=${JSON.stringify(player).replace(/</g, '\\u003c')};window.__N0_FILES__=${JSON.stringify(files)};(()=>{const of=window.fetch.bind(window),f=window.__N0_FILES__;window.fetch=(u,o)=>{const k=String(u).split('?')[0].replace(/^\\.\\//,'');if(f[k]){const s=atob(f[k]),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return Promise.resolve(new Response(b,{status:200}));}return of(u,o);};})();`;
    html = html.replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/<link rel="stylesheet" href="[^"]+">\n?/g, '').replace('<script src="touch-guard.js"></script>', '<style>' + css.join('\n') + '</style><script>' + touch.replace(/<\/script/g, '<\\/script') + '</script>');
    const tag = /<script type="module" src="assets\/core\.js[^"]*"><\/script>/; if (!tag.test(html)) throw new Error('Could not inline the runtime (core.html changed shape).');
    html = html.replace(tag, () => '<script>' + shim.replace(/<\/script/g, '<\\/script') + '</script><script type="module">' + js.replace(/<\/script/g, '<\\/script') + '</script>');
    const name = (opt.name || app.name || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.html';
    if (opt.download !== false) download(name, new TextEncoder().encode(html), 'text/html');
    return { ok: true, name, bytes: html.length, files: Object.keys(files).length, html: opt.returnHtml ? html : undefined, msg: 'Exported ' + name + ' (' + (html.length / 1048576).toFixed(1) + ' MB, ' + Object.keys(files).length + ' files inlined)' };
  };
  return P;
}
