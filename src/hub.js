/* The project hub: what each tool last handed on, so the node editor can show it. Each tool keeps one record (its picture and its
   layers or components) and the edges say where it went. Everything stays in this browser (IndexedDB); nothing is uploaded. */
const open = () => new Promise((res, rej) => {
  const q = indexedDB.open('n0ise-hub', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('k');
  q.onsuccess = () => res(q.result);
  q.onerror = () => rej(q.error);
});
const run = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction('k', mode), st = tx.objectStore('k'), out = fn(st);
    tx.oncomplete = () => res(out && 'result' in out ? out.result : out);
    tx.onerror = () => rej(tx.error);
  });
};
export const TOOLS = {
  camera: {name: 'Camera', page: 'index.html#camera'},
  studio: {name: 'Studio', page: 'studio-app.html'},
  lab: {name: 'Lab', page: 'lab.html'},
  effects: {name: 'Effects', page: 'effects.html#from=hub'},
  '3d': {name: '3D', page: 'studio.html#from=hub'},
};
async function thumb(blob, max = 320) {
  try {
    const bmp = await createImageBitmap(blob), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext('2d'); g.fillStyle = '#151617'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .78);
  } catch { return ''; }
}
/* tool: 'studio'|'effects'|'lab'|'camera'|'3d'. layers: [{name, kind}]. blob: the picture it made. to: the tool it went to. Never throws. */
export async function record({tool, name = '', layers = [], blob = null, to = null, params}) {
  try {
    const t = blob ? await thumb(blob) : '';
    const rec = {tool, name: String(name).slice(0, 80), layers: layers.slice(0, 64).map(l => ({name: String(l.name || l.kind || 'Layer').slice(0, 60), kind: String(l.kind || '').slice(0, 24), off: !!l.off})), thumb: t, t: Date.now()};
    if (params) rec.params = Object.fromEntries(Object.entries(params).slice(0, 48).map(([k, v]) => [String(k).slice(0, 48), String(v).slice(0, 60)]));
    await run('readwrite', st => {
      /* a quiet update keeps the picture and the settings a fuller hand-off stored earlier */
      const old = st.get('node:' + tool);
      old.onsuccess = () => { const o = old.result; if (o) { if (!rec.thumb) rec.thumb = o.thumb || ''; if (!rec.params) rec.params = o.params; } st.put(rec, 'node:' + tool); };
      if (blob) st.put(blob, 'blob:' + tool);
      if (to && to !== tool) {
        const g = st.get('edges');
        g.onsuccess = () => {
          const list = (g.result || []).filter(e => !(e.from === tool && e.to === to));
          list.push({from: tool, to, t: Date.now()});
          st.put(list.slice(-24), 'edges');
        };
      }
    });
  } catch { /* the hub is a convenience; a tool never fails because of it */ }
}
export async function load() {
  try {
    const db = await open();
    return await new Promise(res => {
      const tx = db.transaction('k'), st = tx.objectStore('k'), all = st.getAll(), keys = st.getAllKeys();
      tx.oncomplete = () => {
        const nodes = [];
        let edges = [];
        keys.result.forEach((k, i) => {
          if (String(k).startsWith('node:')) nodes.push(all.result[i]);
          else if (k === 'edges') edges = all.result[i] || [];
        });
        res({nodes, edges});
      };
      tx.onerror = () => res({nodes: [], edges: []});
    });
  } catch { return {nodes: [], edges: []}; }
}
export async function blobFor(tool) {
  try { return await run('readonly', st => st.get('blob:' + tool)); } catch { return null; }
}
export async function clear() { try { await run('readwrite', st => st.clear()); } catch {} }
