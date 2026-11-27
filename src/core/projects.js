// Named projects. A project is a versioned manifest plus its authored scene document, stored in IndexedDB.
// Separate from the legacy one-slot autosave in localStorage, which is still written and still readable (Continue).
// Authored revision only: runtime/play state is not stored here. Recovery snapshots keep the last few saves of a project.
export const PROJECT_FORMAT = 'n0ise.project', PROJECT_VERSION = 1, SNAPSHOTS = 3;
const DB = 'n0ise.core.projects', STORES = ['projects', 'scenes', 'snapshots'];
const wrap = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error || new Error('Storage error')); });
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export class Projects {
  constructor() { this._db = null; }
  async db() {
    if (this._db) return this._db;
    if (typeof indexedDB === 'undefined') throw new Error('This browser has no project storage (IndexedDB). Use Export to keep scenes as files.');
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => { const d = open.result; d.createObjectStore('projects', { keyPath: 'id' }); d.createObjectStore('scenes'); d.createObjectStore('snapshots', { keyPath: 'key' }); };
    this._db = await wrap(open); return this._db;
  }
  async tx(stores, mode, fn) { const d = await this.db(), t = d.transaction(stores, mode), r = await fn(...[].concat(stores).map(s => t.objectStore(s))); await new Promise((ok, no) => { t.oncomplete = ok; t.onerror = () => no(t.error); t.onabort = () => no(t.error || new Error('Storage was full or blocked')); }); return r; }
  async list() { const all = await this.tx('projects', 'readonly', s => wrap(s.getAll())); return all.sort((a, b) => b.updated - a.updated); }
  async get(id) { return this.tx('projects', 'readonly', s => wrap(s.get(id))); }
  uniqueName(base, names) { base = (String(base || '').trim() || 'Untitled').slice(0, 48); if (!names.includes(base)) return base; for (let i = 2; ; i++) if (!names.includes(base + ' ' + i)) return base + ' ' + i; }
  manifest(rec, doc) {
    return { format: PROJECT_FORMAT, version: PROJECT_VERSION, id: rec.id, name: rec.name, template: rec.template, starter: rec.starter, created: rec.created, updated: rec.updated, rev: rec.rev,
      scenes: [{ id: 'main', store: 'scenes', key: rec.id, format: doc && doc.format, version: doc && doc.version }],
      assets: ((doc && doc.assetsUsed) || []).map(id => ({ id, hash: null })), profiles: [], missions: [], view: rec.view || {} };
  }
  async create({ name, template, starter, view }, doc) {
    const names = (await this.list()).map(p => p.name), now = Date.now();
    const rec = { id: uid(), name: this.uniqueName(name, names), template, starter, created: now, updated: now, rev: 1, view: view || {}, size: 0 };
    rec.manifest = this.manifest(rec, doc);
    await this.tx(['projects', 'scenes'], 'readwrite', (p, s) => { p.put(rec); s.put(doc, rec.id); });
    return rec;
  }
  async save(id, doc, view) {
    const rec = await this.get(id); if (!rec) throw new Error('That project no longer exists');
    const prev = await this.tx('scenes', 'readonly', s => wrap(s.get(id)));
    rec.rev++; rec.updated = Date.now(); if (view) rec.view = view; rec.manifest = this.manifest(rec, doc);
    await this.tx(['projects', 'scenes', 'snapshots'], 'readwrite', async (p, s, sn) => {
      p.put(rec); s.put(doc, id);
      if (prev && rec.rev % 5 === 0) {   // a recovery snapshot of the previous authored revision, every few saves
        sn.put({ key: id + ':' + rec.rev, project: id, rev: rec.rev - 1, at: rec.updated, doc: prev });
        const all = await wrap(sn.getAll()), mine = all.filter(x => x.project === id).sort((a, b) => b.at - a.at);
        mine.slice(SNAPSHOTS).forEach(x => sn.delete(x.key));
      }
    });
    return rec;
  }
  async snapshot(id) { const rec = await this.get(id), doc = await this.tx('scenes', 'readonly', s => wrap(s.get(id))); if (!rec || !doc) return; await this.tx('snapshots', 'readwrite', sn => { sn.put({ key: id + ':manual:' + Date.now(), project: id, rev: rec.rev, at: Date.now(), doc }); }); }
  async snapshots(id) { const all = await this.tx('snapshots', 'readonly', s => wrap(s.getAll())); return all.filter(x => x.project === id).sort((a, b) => b.at - a.at); }
  async load(id) { const rec = await this.get(id); if (!rec) throw new Error('That project no longer exists'); const doc = await this.tx('scenes', 'readonly', s => wrap(s.get(id))); if (!doc) throw new Error('The project has no saved scene'); return { project: rec, doc }; }
  async rename(id, name) { const rec = await this.get(id), names = (await this.list()).filter(p => p.id !== id).map(p => p.name); rec.name = this.uniqueName(name, names); rec.updated = Date.now(); rec.manifest = { ...rec.manifest, name: rec.name }; await this.tx('projects', 'readwrite', s => { s.put(rec); }); return rec; }
  async duplicate(id) {
    const { project, doc } = await this.load(id), names = (await this.list()).map(p => p.name), now = Date.now();
    const rec = { ...project, id: uid(), name: this.uniqueName(project.name + ' copy', names), created: now, updated: now, rev: 1 }; rec.manifest = this.manifest(rec, doc);
    await this.tx(['projects', 'scenes'], 'readwrite', (p, s) => { p.put(rec); s.put(structuredClone(doc), rec.id); }); return rec;
  }
  async remove(id) { await this.tx(['projects', 'scenes', 'snapshots'], 'readwrite', async (p, s, sn) => { p.delete(id); s.delete(id); const all = await wrap(sn.getAll()); all.filter(x => x.project === id).forEach(x => sn.delete(x.key)); }); }
}
