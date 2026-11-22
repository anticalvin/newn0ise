// WorldDataProvider + WorldStorage. Provider: manifest, national index, coarse DEM, region tiles (abortable, LRU of parsed tiles).
// Storage: player-authored world state (position, vehicle, actors, edits) kept apart from the packaged source data, so re-importing OSM never erases user work.
export const BASE = new URL('data/world/za/', document.baseURI).href;

export class DataProvider {
  constructor(base = BASE) { this.base = base; this.manifest = null; this.national = null; this.dem = null; this.lru = new Map(); this.inflight = new Map(); this.stats = { fetches: 0, bytes: 0, cancelled: 0, ms: [] }; }
  async getManifest() {
    if (!this.manifest) { const r = await fetch(this.base + 'manifest.json'); if (!r.ok) throw new Error('World data not found at ' + this.base + ' (run tools/world/import.py).'); this.manifest = await r.json(); }
    return this.manifest;
  }
  async getNational() {
    if (this.national) return this.national;
    const m = await this.getManifest(), d = m.national.dem;
    const [j, buf] = await Promise.all([fetch(this.base + m.national.file).then(r => r.json()), fetch(this.base + d.file).then(r => r.arrayBuffer())]);
    this.national = j; this.dem = { ...d, data: new Int16Array(buf) };
    return j;
  }
  /* coarse relief, bilinear. Returns metres (negative at sea). */
  demAt(lat, lon) {
    const d = this.dem; if (!d) return 0;
    const fx = (lon - d.west) / d.step, fy = (d.north - lat) / d.step;
    if (fx < 0 || fy < 0 || fx >= d.cols - 1 || fy >= d.rows - 1) return -50;
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y, D = d.data, c = d.cols;
    return (D[y * c + x] * (1 - tx) + D[y * c + x + 1] * tx) * (1 - ty) + (D[(y + 1) * c + x] * (1 - tx) + D[(y + 1) * c + x + 1] * tx) * ty;
  }
  /* A region tile, or null if it was cancelled. Parsed tiles are kept in a small LRU so walking back is instant. */
  async tile(regionKey, key, signal) {
    const id = regionKey + '/' + key, hit = this.lru.get(id);
    if (hit) { this.lru.delete(id); this.lru.set(id, hit); return hit; }
    const m = await this.getManifest(), ent = m.regions[regionKey].tiles[key];
    if (!ent) return null;
    const t0 = performance.now();
    try {
      const r = await fetch(this.base + ent.file, { signal }); if (!r.ok) throw new Error('tile ' + id + ' ' + r.status);
      const txt = await r.text(); this.stats.fetches++; this.stats.bytes += txt.length;
      const j = JSON.parse(txt); this.stats.ms.push(performance.now() - t0); if (this.stats.ms.length > 40) this.stats.ms.shift();
      this.lru.set(id, j); while (this.lru.size > 14) this.lru.delete(this.lru.keys().next().value);
      return j;
    } catch (e) { if (e.name === 'AbortError') { this.stats.cancelled++; return null; } throw e; }
  }
}

const KEY = 'n0ise.world.save.v1';
export const Storage = {
  load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; } },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
  has() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
};
