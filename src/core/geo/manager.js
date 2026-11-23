// GeoWorld: one Core, many streamed regions. Owns the active region frame, the floating origin, tile streaming (async, cancellable, budgeted), LOD, the road graph,
// the player, the car, the living-world simulation, persistence, and the `world.*` commands. Core's renderer, sky, character, entity registry and command boundary are reused as is.
import * as THREE from 'three';
import { DataProvider, Storage } from './data.js';
import { RegionFrame, zoneOf, fromLatLon, toLatLon } from './georef.js';
import { HeightField, landMask, terrainGeometry, landColor, lodStride } from './terrain.js';
import { GeoOcean } from './ocean.js';
import { RoadGraph, roadGeometries, toGeometry, laneInfo, CLASSES } from './roads.js';
import { buildGeometry, tileMaterial, fadeIn, BuildingIndex, streetProps, truthOf } from './buildings.js';
import { Sim } from './sim.js';
import { Walker, Car } from './vehicle.js';
import { Wilds } from './wilds.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const BUDGET = { loadRadius: 1700, unloadRadius: 2300, maxTiles: 26, maxFetch: 3, nearIn: 340, nearOut: 430, midIn: 1100, midOut: 1250, jobMs: 5, edits: 400, actors: 700 };
const START = { lat: -33.9206, lon: 18.4233 };          // Company's Garden / Adderley Street, with Table Mountain behind
const ASSETS = { tree: [0x4d6b3a, 3.2], lamp: [0x3a3a3c, 4.6], bench: [0x8a6a4a, 0.5], cone: [0xe0662b, 0.7], crate: [0x9a7b52, 1.0] };

export const COMMANDS = {
  'world.open': '{lat?, lon?, region?:"capetown", resume?:true} → enter the streamed South Africa world. Asynchronous: poll world.region.describe until ready is true.',
  'world.close': '{} → leave the world and return to the island.',
  'world.goto': '{lat, lon} or {x, z} (region metres) or {place:"Johannesburg"} → move the player anywhere in South Africa. Detailed regions stream real streets and buildings; elsewhere the ground is generated from national relief with the OSM trunk roads.',
  'world.region.describe': '{} → region, coverage, loaded tiles, counts, data sources and attribution.',
  'world.region.load': '{tiles?:[[tx,tz]...], radius?:100..3000} → prefetch tile data (no meshes). Max 40 tiles.',
  'world.region.generate': '{region, bbox:[s,w,n,e]} → regions are generated offline (tools/world/import.py); returns the exact command.',
  'world.road.inspect': '{x,z} or {id} → class, name, lanes (mapped or inferred), speed, oneway, surface, bridge, edits.',
  'world.road.edit': '{id, patch:{closed?, speed?:2..45 m/s, name?}, dryRun?} → player-authored override stored apart from the OSM data. One undo step.',
  'world.building.inspect': '{x,z} or {id} → footprint, height and where it came from (tag, levels or inferred), roof, LOD state, interactive.',
  'world.building.populate': '{id|x,z, count:1..12, dryRun?} → add persistent pedestrians around a building.',
  'world.assets.place': `{type:"${Object.keys(ASSETS).join('|')}", x,z or lat,lon, yaw?, dryRun?} → place a prop; kept as an override (max ${BUDGET.edits}). One undo step.`,
  'world.simulation.inspect': '{} → actors by tier, kind and a sample.',
  'world.performance.report': '{} → frame time, draw calls, triangles, tiles, streaming latency, heap.',
  'world.mode': '{mode:"play"|"edit"} → Play is the game; Edit adds god view, time, props, road tools and crowds.',
  'world.view.god': '{on:true|false, lat?, lon?, height?:40..4200000} → fly over the whole country (Edit mode).',
  'world.save': '{} → write the world state now.'
};

export class GeoWorld {
  constructor(app) {
    this.a = app; this.active = false; this.loading = false; this.ready = false; this.provider = new DataProvider(); this.group = new THREE.Group(); this.group.name = 'geo'; this.group.visible = false; app.scene.add(this.group);
    this.mode = 'play'; this.god = null; this.boost = 1; this.graph = new RoadGraph(); this.bi = new BuildingIndex(); this.sim = new Sim(this.graph); this.group.add(this.sim.group);
    this.walker = new Walker(); this.car = new Car(); this.group.add(this.car.root); this.driving = false; this.wilds = new Wilds(this);
    this.tiles = new Map(); this.origin = { x: 0, z: 0 }; this.frame = null; this.region = null; this.regionKey = null; this.tileList = [];
    this.edits = { roads: {}, assets: [] }; this.store = null; this.storeActive = false; this.storeState = null; this.coarse = new Map();
    this.stats = { loaded: 0, built: 0, unloaded: 0, cancelled: 0, lodSwaps: 0, rebases: 0, popIns: 0 }; this.t = { stream: 0, save: 0, env: 0, hud: 0 }; this.hidden = [];
    this.pitU = { uPit: { value: new THREE.Vector4(0, 0, 0, 0) }, uPitYaw: { value: 0 } }; this.msg = ''; this.dayRate = 1 / 90; this.lastYaw = 0; this.props = new THREE.Group(); this.group.add(this.props); this.propMeshes = new Map();
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(240000, 240000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b4552, roughness: 0.06, metalness: 0.25 }));
    sea.position.y = -0.4; sea.receiveShadow = false; this.sea = sea; this.group.add(sea);   // cheap far water, under the Gerstner ocean
    this.ocean = new GeoOcean(this); this.landmarks = new Set();   // OSM building ids replaced by authored assets (T4); the footprint and coordinates stay untouched
  }
  // ---------- coordinates ----------
  get sx() { return this.walker.x - this.origin.x; } get sz() { return this.walker.z - this.origin.z; }
  focus() { return this.god || (this.driving ? this.car : this.walker); }
  rebase(x, z) {                                   // the floating origin: everything global is double metres, everything on the GPU is relative to this
    this.origin.x = x; this.origin.z = z; this.stats.rebases++;
    for (const t of this.tiles.values()) if (t.group) t.group.position.set(t.ox - x, 0, t.oz - z);
    this.placeFar(); this.props.position.set(-x, 0, -z); this.wilds.rebase(); this.placeCountry();
  }
  latLon(x = this.walker.x, z = this.walker.z) { return this.frame.toLatLon(x, z); }
  // ---------- heights ----------
  tileAt(x, z) { const T = this.T || 1000; return this.tiles.get(Math.floor(x / T) + '_' + Math.floor(z / T)); }
  heightAt(x, z) {
    const t = this.tileAt(x, z);
    if (t && t.hf) return t.hf.at(x - t.ox, z - t.oz);
    const wh = this.wilds.at(x, z); if (wh !== undefined) return wh;
    const k = Math.round(x / 80) + ',' + Math.round(z / 80); let h = this.coarse.get(k);
    if (h === undefined) { const p = this.frame.toLatLon(Math.round(x / 80) * 80, Math.round(z / 80) * 80); h = this.provider.demAt(p.lat, p.lon); if (this.coarse.size > 20000) this.coarse.clear(); this.coarse.set(k, h); }
    return h;
  }
  /* walkable ground: terrain, never below the shallows, the floor of the store when inside it */
  groundAt(x, z) {
    let h = Math.max(this.heightAt(x, z), -1.2); const f = this.storeFrame;
    if (f && this.storeActive) { const dx = x - f.cx, dz = z - f.cz, c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c; if (Math.abs(lx) < f.w / 2 && Math.abs(lz) < f.d / 2 && f.y > h) h = f.y; }
    return h;
  }
  roadAt(x, z) { return this.graph.nearest(x, z, 30, true) || this.wilds.roadAt(x, z, 30); }
  resolve(x, z, rad, skip) {
    const r = this.bi.resolve(x, z, rad, this.storeActive && this.store ? this.store.id : skip);
    if (this.storeActive) { const ox = this.origin.x, oz = this.origin.z; for (const b of this.storeBoxes()) { const o = boxPush(r.x - ox, r.z - oz, rad, b, this.walker.y); if (o) { r.x = o.x + ox; r.z = o.z + oz; r.moved = true; } } }
    return r;
  }
  storeBoxes() { const E = this.a.entities; if (!E.recs.has('geo.store')) return []; const rt = E.rt.get('geo.store'); const out = rt.colliders(); const ox = this.store.ox - this.origin.x, oz = this.store.oz - this.origin.z; void ox; void oz; return out; }

  // ---------- lifecycle ----------
  async open(o = {}) {
    if (this.loading) return { ok: false, msg: 'Already loading' };
    this.loading = true; this.ready = false; this.say('Loading South Africa…');
    try {
      const a = this.a, saved = o.resume ? Storage.load() : null;
      const man = await this.provider.getManifest(); await this.provider.getNational(); await this.wilds.ensureRoads();
      this.manifest = man;
      let lat = o.lat, lon = o.lon; if (saved && lat == null) { lat = saved.lat; lon = saved.lon; }
      if (lat == null) { lat = START.lat; lon = START.lon; }
      if (!this.active) this.enter();
      if (saved) { this.edits = saved.edits || this.edits; this.storeState = saved.storeState || null; }
      await this.setFrame(lat, lon, o.region);
      if (saved && saved.actors && saved.actors[this.regionKey]) this.sim.load(saved.actors[this.regionKey]);
      this.drawEdits();
      if (saved && saved.time != null) a.env.set({ time: saved.time });
      if (saved && saved.car && this.region) { Object.assign(this.car, { x: saved.car.x, z: saved.car.z, yaw: saved.car.yaw }); this.car.setHue(saved.car.hue ?? 0.58); }
      if (saved && saved.yaw != null) this.walker.yaw = saved.yaw;
      this.driving = !!(saved && saved.car && saved.car.driving && this.region);
      this.ready = true; this.say((this.region ? this.region.name : 'South Africa') + ' · F drives your car · E for Edit · M for the map');
    } catch (e) { this.say('Could not open the world: ' + e.message, 8000); this.ready = false; this.loading = false; this.leave(); return { ok: false, msg: e.message }; }
    this.loading = false; return { ok: true, msg: 'World open' };
  }
  enter() {
    const a = this.a, s = a.scene; this.active = true; this.group.visible = true; this.hidden = [];
    const keep = new Set([...(a.envChildren || []), this.group, a.character.root, a.entities.group]);
    for (const c of s.children) if (!keep.has(c)) { this.hidden.push([c, c.visible]); c.visible = false; }
    this.entHidden = []; a.entities.rt.forEach((rt, id) => { this.entHidden.push([rt.object, rt.object.visible]); rt.object.visible = false; });
    this.saved = { far: a.camera.far, near: a.camera.near, fog: a.scene.fog && a.scene.fog.density, shadow: a.env.sun.shadow.camera.right, time: a.env.p.time, mode: a.mode };
    this.prevName = a.name; a.name = 'SOUTH AFRICA'; a.ui.brand();
    if (a.mode !== 'explore') a.setMode('explore');
    a.camera.far = 140000; a.camera.near = 0.4; a.camera.updateProjectionMatrix();
    const sc = a.env.sun.shadow.camera; sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.updateProjectionMatrix();
    a.env.set({ time: 15.2, cloud: 0.22, wind: 0.4 }); a.character.root.visible = true; a.cam.dist = 5.4; a.cam.pitch = 0.22;
    this.mode = 'play'; this.god = null; this.buildHud(); document.getElementById('ui').dataset.geo = '1'; this.hud.hidden = false; this.setMode('play', true);
  }
  leave() {
    const a = this.a; this.save(); this.exitGod(true); this.unloadAll(); this.wilds.reset(); if (this.prompting) this.closePrompt(); if (this.prevName) a.name = this.prevName; this.group.visible = false; this.active = false; this.ready = false;
    for (const [c, v] of this.hidden) c.visible = v; this.hidden = []; for (const [o, v] of this.entHidden || []) o.visible = v; this.entHidden = [];
    if (this.saved) { a.camera.far = this.saved.far; a.camera.near = this.saved.near; a.camera.updateProjectionMatrix(); const sc = a.env.sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.updateProjectionMatrix(); a.env.set({ time: this.saved.time }); }
    if (this.storeActive) this.deactivateStore();
    a.character.root.position.copy(a.player.pos); if (this.hud) this.hud.hidden = true; const ui = document.getElementById('ui'); if (ui) delete ui.dataset.geo;
    if (this.far) { this.group.remove(this.far); this.far.geometry.dispose(); this.far.material.dispose(); this.far = null; }
    this.driving = false; this.car.root.visible = false;
  }
  close() { if (!this.active) return { ok: true, msg: 'Not in the world' }; this.leave(); this.a.ui.toast('Back on the island'); this.a.ui.brand(); return { ok: true, msg: 'Left the world' }; }

  /* choose the region for a coordinate (or none: coarse relief), build its frame, place the player and wait for the ground under them */
  async setFrame(lat, lon, regionKey) {
    const man = this.manifest; if (this.storeActive) this.deactivateStore(); this.unloadAll(); this.wilds.reset(); this.disposeCountry(); this.coarse.clear();
    let key = regionKey && man.regions[regionKey] ? regionKey : Object.keys(man.regions).find(k => { const [s, w, n, e] = man.regions[k].bbox; return lat >= s && lat <= n && lon >= w && lon <= e; });
    if (key && regionKey === undefined) { /* inside a detailed region */ }
    this.regionKey = key || null; this.region = key ? man.regions[key] : null;
    if (this.region) { this.frame = new RegionFrame(this.region.zone, this.region.e0, this.region.n0); this.T = this.region.tile; this.tileList = Object.keys(this.region.tiles).map(k => { const [tx, tz] = k.split('_').map(Number); return { key: k, tx, tz }; }); }
    else { const z = zoneOf(lon), p = fromLatLon(lat, lon, z); this.frame = new RegionFrame(z, Math.round(p.e / 1000) * 1000, Math.round(p.n / 1000) * 1000); this.T = 1000; this.tileList = []; }
    const p = this.frame.toLocal(lat, lon); this.walker.x = p.x; this.walker.z = p.z; this.rebase(Math.round(p.x / 1000) * 1000, Math.round(p.z / 1000) * 1000);
    this.buildFar(); this.sim = new Sim(this.graph); this.group.add(this.sim.group);
    for (const id of Object.keys(this.edits.roads)) if (this.edits.roads[id].closed) this.graph.closed.add(+id);
    if (this.region) {
      this.say('Streaming ' + this.region.name + '…');
      await this.pickStore(p.x, p.z);
      this.stream(true); const t0 = performance.now();
      while (performance.now() - t0 < 25000) { const t = this.tileAt(p.x, p.z); if (t && t.hf && !t.jobs) break; await new Promise(r => setTimeout(r, 50)); this.runJobs(30); this.stream(false); if (!this.tileAt(p.x, p.z) && performance.now() - t0 > 8000) break; }
      // stand on the nearest street, with the car parked beside
      const r = this.graph.nearest(p.x, p.z, 400, true);
      if (r) { const e = r.edge, dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, half = e.cls.w / 2;
        this.car.x = r.x + nx * half * 0.5; this.car.z = r.z + nz * half * 0.5; this.car.yaw = Math.atan2(dx, dz); this.car.setHue(0.58);
        this.walker.x = r.x - nx * (half + 3); this.walker.z = r.z - nz * (half + 3); this.walker.yaw = this.car.yaw; }
      else { this.car.x = p.x + 4; this.car.z = p.z + 4; }
      this.car.root.visible = true; this.car.y = this.groundAt(this.car.x, this.car.z); this.walker.y = this.groundAt(this.walker.x, this.walker.z);
    } else {                                       // open country: generated ground and the national roads, with your car parked on the nearest road if there is one
      this.wilds.update(p.x, p.z, 90); this.walker.y = this.groundAt(p.x, p.z);
      const r = this.wilds.roadAt(p.x, p.z, 900);
      if (r) { const e = r.edge, dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L; this.car.x = r.x + nx * 3; this.car.z = r.z + nz * 3; this.car.yaw = Math.atan2(dx, dz); }
      else { this.car.x = p.x + 4; this.car.z = p.z + 4; this.car.yaw = this.walker.yaw; }
      this.car.setHue(0.58); this.car.root.visible = true; this.car.y = this.groundAt(this.car.x, this.car.z);
    }
    this.rebase(Math.round(this.walker.x / 1000) * 1000, Math.round(this.walker.z / 1000) * 1000);
  }
  unloadAll() { for (const k of [...this.tiles.keys()]) this.unloadTile(k); this.group.remove(this.sim.group); this.sim.dispose(); }

  // ---------- the nearest store becomes the one accessible interior (LOD 3) ----------
  async pickStore(x, z) {
    this.store = null; const T = this.T, tx = Math.floor(x / T), tz = Math.floor(z / T); let best = null;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const key = (tx + i) + '_' + (tz + j); if (!this.region.tiles[key]) continue;
      const d = await this.provider.tile(this.regionKey, key); if (!d) continue; const ox = (tx + i) * T, oz = (tz + j) * T, hf = new HeightField(d);
      const cand = new Map(); for (const b of d.buildings) if (b.shop && /supermarket|convenience|general|kiosk|clothes|bakery/.test(b.shop) || b.am === 'marketplace') cand.set(b.id, { b, name: b.n });
      for (const p of d.pois) { if (!/^shop:(supermarket|convenience|general|kiosk|bakery|clothes)/.test(p.k)) continue;
        const px = ox + p.x / 10, pz = oz + p.z / 10; for (const b of d.buildings) { if (!pointIn(px - ox, pz - oz, b.p)) continue; cand.set(b.id, { b, name: p.n || b.n }); } }
      for (const { b, name } of cand.values()) { const pts = b.p.map(v => v / 10), n = pts.length / 2; if (n < 4) continue; let cx = 0, cz = 0; for (let k = 0; k < n; k++) { cx += pts[k * 2]; cz += pts[k * 2 + 1]; } cx = cx / n + ox; cz = cz / n + oz;
        const area = polyArea(pts); if (area < 60 || area > 1500) continue; let lo = 1e9, hi = -1e9; for (let k = 0; k < n; k++) { const hh = hf.at(Math.min(T, Math.max(0, pts[k * 2])), Math.min(T, Math.max(0, pts[k * 2 + 1]))); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
        const spread = hi - lo, dd = Math.hypot(cx - x, cz - z) + spread * 160; if (!best || dd < best.dd) best = { dd, b, cx, cz, ox, oz, pts, name }; }
    }
    if (!best) return;
    const obb = orientedBox(best.pts); this.store = { id: best.b.id, name: best.name || 'Store', cx: best.cx, cz: best.cz, ox: best.cx, oz: best.cz, obb, area: polyArea(best.pts), shop: best.b.shop || 'shop' };
  }
  activateStore() {
    const a = this.a, S = this.store; if (!S || this.storeActive || !a.entities.prefabs.has('retail.convenience')) return;
    this.rebase(S.cx, S.cz);                                   // the store sits at the scene origin, well inside the entity registry's ±1000 m
    const road = this.graph.nearest(S.cx, S.cz, 80, true), yaw = snap90(road ? Math.atan2(road.x - S.cx, road.z - S.cz) : 0);
    const w = clamp(Math.max(S.obb.w, S.obb.d), 8, 24), d = clamp(Math.min(S.obb.w, S.obb.d), 6, 16);
    const door = d / 2 + 1.6, y = this.heightAt(S.cx + Math.sin(yaw) * door, S.cz + Math.cos(yaw) * door);   // the entrance is level with the street
    this.storeFrame = { cx: S.cx, cz: S.cz, yaw, w, d, y: y + 0.02 };
    this.pitU.uPit.value.set(0, 0, w / 2 + 0.4, d / 2 + 0.4); this.pitU.uPitYaw.value = yaw;
    try {
      const spec = { prefab: 'retail.convenience', id: 'geo.store', parameters: { width: w, depth: d, height: 3, seed: S.id % 1000 }, position: [0, y + 0.02, 0], rotation: [0, yaw, 0], tags: ['building', 'osm'] };
      if (this.storeState) spec.state = this.storeState;
      a.entities.create(spec); this.storeActive = true;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 4, d + 0.8), new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.9 })); fl.position.set(0, y + 0.02 - 2, 0); fl.rotation.y = yaw; fl.receiveShadow = true; this.group.add(fl); this.storeFloor = fl; for (const t of this.tiles.values()) if (t.storeMesh) t.storeMesh.visible = false;
      this.say(S.name + ' · walk in, F to use the door and shelves');
    } catch (e) { this.say('Store interior unavailable: ' + e.message, 4000); this.store.failed = true; }
  }
  deactivateStore() {
    const a = this.a; if (!this.storeActive) return;
    try { this.storeState = structuredClone(a.entities.get('geo.store').state); a.entities.remove('geo.store'); } catch {}
    if (this.storeFloor) { this.group.remove(this.storeFloor); this.storeFloor.geometry.dispose(); this.storeFloor.material.dispose(); this.storeFloor = null; }
    this.pitU.uPit.value.set(0, 0, 0, 0); this.storeActive = false; for (const t of this.tiles.values()) if (t.storeMesh) t.storeMesh.visible = true;
  }

  // ---------- far relief and sea ----------
  buildFar() {
    const fo = this.focus(), fx = fo.x, fz = fo.z;
    if (this.far) { this.group.remove(this.far); this.far.geometry.dispose(); this.far.material.dispose(); }
    const N = 128, step = 1500, half = N * step / 2, pos = [], col = [], idx = [], c = new THREE.Color();
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = i * step - half, z = j * step - half, p = this.frame.toLatLon(fx + x, fz + z), h = this.provider.demAt(p.lat, p.lon);
      const hx = this.provider.demAt(this.frame.toLatLon(fx + x + step, fz + z).lat, p.lon + 0.01), slope = Math.min(1.2, Math.abs(hx - h) / 3000);
      landColor(h, slope, '', c); pos.push(x, Math.max(h, -80), z); col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = tileMaterial({ side: THREE.DoubleSide, rough: 1 }); m.userData.u.uFade.value = 1; this.farHole = new THREE.Vector4(1e9, 1e9, -1e9, -1e9);
    const prev = m.onBeforeCompile; m.onBeforeCompile = sh => { prev(sh); sh.uniforms.uHole = { value: this.farHole }; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uHole;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif(vWP.x>uHole.x&&vWP.z>uHole.y&&vWP.x<uHole.z&&vWP.z<uHole.w) discard;'); };
    m.customProgramCacheKey = () => 'geo-far';
    this.far = new THREE.Mesh(g, m); this.far.frustumCulled = false; this.far.position.set(-this.origin.x + fx - fx, -4, -this.origin.z); this.far.userData.cx = fx; this.far.userData.cz = fz;
    // vertices are relative to the player's start; keep the mesh anchored there
    this.far.position.set(fx - this.origin.x, -4, fz - this.origin.z); this.far.userData.anchor = { x: fx, z: fz };
    this.group.add(this.far);
  }
  placeFar() { if (this.far) this.far.position.set(this.far.userData.anchor.x - this.origin.x, -4, this.far.userData.anchor.z - this.origin.z); }

  // ---------- streaming ----------
  rectDist(t, x, z) { const T = this.T, dx = Math.max(t.tx * T - x, 0, x - (t.tx + 1) * T), dz = Math.max(t.tz * T - z, 0, z - (t.tz + 1) * T); return Math.hypot(dx, dz); }
  stream(first) {
    const f = this.focus(); if (this.god && this.god.high) return;
    const fill = () => { this.wilds.update(f.x, f.z, first ? 60 : 3); if (this.farHole) this.farHole.set(f.x - 4400 - this.origin.x, f.z - 4400 - this.origin.z, f.x + 4400 - this.origin.x, f.z + 4400 - this.origin.z); };
    if (!this.region) { fill(); return; }
    const ahead = this.driving && !this.god ? this.car.speed * 6 : 0, fx = f.x + Math.sin(f.yaw) * ahead, fz = f.z + Math.cos(f.yaw) * ahead;
    const want = this.tileList.map(t => ({ ...t, d: Math.min(this.rectDist(t, f.x, f.z), this.rectDist(t, fx, fz)) })).filter(t => t.d < BUDGET.loadRadius).sort((a, b) => a.d - b.d);
    const wantKeys = new Set(want.map(t => t.key)); let fetching = 0; for (const t of this.tiles.values()) if (t.state === 'loading') fetching++;
    for (const t of want) { if (this.tiles.has(t.key)) continue; if (fetching >= BUDGET.maxFetch) break; this.startLoad(t); fetching++; }
    for (const [k, t] of [...this.tiles]) {
      const d = this.rectDist(t, f.x, f.z);
      if (t.state === 'loading' && !wantKeys.has(k)) { t.abort.abort(); this.tiles.delete(k); this.stats.cancelled++; continue; }
      if (t.state !== 'loading' && d > BUDGET.unloadRadius) this.unloadTile(k);
    }
    while (this.tiles.size > BUDGET.maxTiles) { let far = null, fd = -1; for (const t of this.tiles.values()) { const d = this.rectDist(t, f.x, f.z); if (d > fd) { fd = d; far = t; } } if (!far) break; if (far.state === 'loading') { far.abort.abort(); this.tiles.delete(far.key); } else this.unloadTile(far.key); }
    for (const t of this.tiles.values()) if (t.state === 'ready' || t.state === 'building') this.applyLod(t, this.rectDist(t, f.x, f.z));
    fill();
  }
  startLoad(t) {
    const rec = { key: t.key, tx: t.tx, tz: t.tz, ox: t.tx * this.T, oz: t.tz * this.T, state: 'loading', abort: new AbortController(), t0: performance.now(), lod: '', mats: [], meshes: [], terr: {}, jobs: null };
    this.tiles.set(t.key, rec);
    this.provider.tile(this.regionKey, t.key, rec.abort.signal).then(data => { if (!data || this.tiles.get(t.key) !== rec) return; this.initTile(rec, data); }).catch(e => { if (this.tiles.get(t.key) === rec) { this.tiles.delete(t.key); this.say('Tile ' + t.key + ' failed: ' + e.message, 4000); } });
  }
  initTile(t, data) {
    t.data = data; t.hf = new HeightField(data); t.mask = landMask(data); t.state = 'building'; t.latency = performance.now() - t.t0; this.stats.loaded++;
    t.group = new THREE.Group(); t.group.position.set(t.ox - this.origin.x, 0, t.oz - this.origin.z); this.group.add(t.group);
    this.graph.addTile(t.key, data, t.ox, t.oz); this.bi.addTile(t.key, data, t.ox, t.oz);
    t.mTerrain = tileMaterial({ side: THREE.DoubleSide, rough: 1, pit: this.pitU }); t.mRoad = tileMaterial({ polygonOffset: 2, pit: this.pitU }); t.mBld = tileMaterial({ windows: true, side: THREE.DoubleSide, rough: 0.85 }); t.mats = [t.mTerrain, t.mRoad, t.mBld];
    for (const m of t.mats) m.userData.u.uFade.value = 0;
    t.jobs = this.tileJobs(t); this.sim.populate(t.key, 1);
  }
  *tileJobs(t) {
    const d = t.data, T = this.T, H = (x, z) => t.hf.at(clamp(x, 0, T), clamp(z, 0, T));
    const roads = roadGeometries(d, H, this.graph.closed);
    for (const [name, a] of Object.entries(roads)) { const g = toGeometry(a); if (!g) continue; const m = new THREE.Mesh(g, t.mRoad); m.receiveShadow = true; m.userData.kind = 'road-' + name; t.group.add(m); t.meshes.push(m); }
    this.stats.built++; yield;
    const store = this.store && this.store.id, all = d.buildings, chunk = 220; t.bld = [];
    for (let i = 0; i < all.length; i += chunk) {
      const part = { buildings: all.slice(i, i + chunk) }, r = buildGeometry(part, H, b => b.id !== store && !this.landmarks.has(b.id));
      if (r) { const m = new THREE.Mesh(r.geometry, t.mBld); m.castShadow = true; m.receiveShadow = true; m.userData.kind = 'bld'; t.group.add(m); t.meshes.push(m); t.bld.push(m); }
      yield;
    }
    if (store) { const own = d.buildings.find(b => b.id === store); if (own) { const r = buildGeometry({ buildings: [own] }, H); if (r) { const m = new THREE.Mesh(r.geometry, t.mBld); m.castShadow = true; m.userData.kind = 'store'; t.group.add(m); t.storeMesh = m; t.meshes.push(m); if (this.storeActive) m.visible = false; } } }
    t.state = 'ready'; t.jobs = null; this.applyLod(t, this.rectDist(t, this.focus().x, this.focus().z), true);
  }
  runJobs(ms = BUDGET.jobMs) {
    const t0 = performance.now(); const f = this.focus();
    const pending = [...this.tiles.values()].filter(t => t.jobs).sort((a, b) => this.rectDist(a, f.x, f.z) - this.rectDist(b, f.x, f.z));
    for (const t of pending) { while (performance.now() - t0 < ms) { const r = t.jobs.next(); if (r.done) break; } if (performance.now() - t0 >= ms) break; }
  }
  /* LOD 0 far skyline, 1 district, 2 street (facades + props); hysteresis so tiles do not flicker at the thresholds */
  applyLod(t, dr, force) {
    const cur = t.lod; let next = cur;
    if (!cur || force) next = dr < BUDGET.nearIn ? 'near' : dr < BUDGET.midIn ? 'mid' : 'far';
    else if (cur === 'near') { if (dr > BUDGET.nearOut) next = dr < BUDGET.midIn ? 'mid' : 'far'; }
    else if (cur === 'mid') { if (dr < BUDGET.nearIn) next = 'near'; else if (dr > BUDGET.midOut) next = 'far'; }
    else if (dr < BUDGET.midIn) next = dr < BUDGET.nearIn ? 'near' : 'mid';
    if (next === cur && !force) return;
    t.lod = next; this.stats.lodSwaps++;
    const stride = lodStride(t.data.grid, next === 'near' ? 1 : next === 'mid' ? 3 : 8);
    if (!t.terr[stride]) t.terr[stride] = terrainGeometry(t.hf, t.mask, stride);
    if (!t.terrain) { t.terrain = new THREE.Mesh(t.terr[stride], t.mTerrain); t.terrain.receiveShadow = true; t.group.add(t.terrain); t.meshes.push(t.terrain); } else t.terrain.geometry = t.terr[stride];
    t.mBld.userData.u.uDetail.value = next === 'near' ? 1 : 0;
    for (const m of t.meshes) if (m.userData.kind === 'road-minor') m.visible = next !== 'far';
    // far tiles show only the skyline: tall or large buildings (built once, on demand)
    if (next === 'far' && !t.sky && t.data) { const T = this.T, H = (x, z) => t.hf.at(clamp(x, 0, T), clamp(z, 0, T)), id = this.store && this.store.id;
      const r = buildGeometry(t.data, H, b => b.id !== id && !this.landmarks.has(b.id) && (b.h >= 16 || b.p.length > 16), { mid: true }); if (r) { t.sky = new THREE.Mesh(r.geometry, t.mBld); t.group.add(t.sky); t.meshes.push(t.sky); } else t.sky = null; t.skyTried = true; }
    for (const m of t.bld || []) m.visible = next !== 'far';
    if (t.sky) t.sky.visible = next === 'far';
    if (next === 'near' && !t.props) this.addProps(t); else if (next !== 'near' && t.props) this.dropProps(t);
  }
  addProps(t) {
    const T = this.T, H = (x, z) => t.hf.at(clamp(x, 0, T), clamp(z, 0, T)), p = streetProps(t.data, H, r => !!CLASSES[r.c] && CLASSES[r.c].car && r.c !== 'service' && r.c !== 'track');
    const g = new THREE.Group(); t.props = g; t.group.add(g);
    if (p.lamps.length) { const geo = lampGeo(), m = new THREE.InstancedMesh(geo, lampMat, p.lamps.length), M = new THREE.Matrix4(); p.lamps.forEach(([x, y, z], i) => m.setMatrixAt(i, M.makeTranslation(x, y, z))); m.castShadow = true; g.add(m); }
    if (p.trees.length) { const geo = treeGeo(), m = new THREE.InstancedMesh(geo, treeMat, p.trees.length), M = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), pp = new THREE.Vector3(); p.trees.forEach(([x, y, z, k], i) => { m.setMatrixAt(i, M.compose(pp.set(x, y, z), q, s.set(k, k, k))); }); m.castShadow = true; g.add(m); }
    t.propCount = p.lamps.length + p.trees.length;
  }
  dropProps(t) { if (!t.props) return; t.group.remove(t.props); t.props.traverse(o => { if (o.isInstancedMesh) { o.dispose(); o.geometry.dispose(); } }); t.props = null; }
  unloadTile(k) {
    const t = this.tiles.get(k); if (!t) return; this.tiles.delete(k);
    if (t.abort && t.state === 'loading') { t.abort.abort(); return; }
    this.graph.removeTile(k); this.bi.removeTile(k); this.dropProps(t);
    if (t.group) { this.group.remove(t.group); for (const m of t.meshes) m.geometry && m.geometry.dispose(); Object.values(t.terr).forEach(g => g.dispose()); t.mats.forEach(m => m.dispose()); }
    this.stats.unloaded++;
  }

  // ---------- per frame ----------
  update(dt, inp, now) {
    const a = this.a, c = a.cam, w = this.walker; this.sim.time += 0;
    if (!this.ready && !this.active) return;
    // sky time and night windows
    this.t.env += dt; if (this.t.env > 2) { this.t.env = 0; const tm = (a.env.p.time + 2 * this.dayRate * 24) % 24; a.env.set({ time: tm }); for (const t of this.tiles.values()) if (t.mBld) t.mBld.userData.u.uNight.value = 1 - a.env.day; }
    if (a.scene.fog) a.scene.fog.density = this.god ? 0.00011 / (1 + this.god.dist / 6000) ** 2 : 0.00011;
    this.runJobs();
    const fade = [...this.tiles.values()]; for (const t of fade) if (t.mats.length) fadeIn(t.mats, dt);
    if (this.ready) {
      this.t.stream += dt; if (this.t.stream > 0.25) { this.t.stream = 0; this.stream(); this.storeTick(); }
      const yaw = c.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), mvx = fx * inp.mz + rx * inp.mx, mvz = fz * inp.mz + rz * inp.mx;
      const dtc = Math.min(dt, 0.05);
      if (this.god) this.flyGod(dt, inp, mvx, mvz);
      else if (this.driving) {
        const k = a.input.keys; this.car.update(dtc, clamp(inp.mz, -1, 1), -clamp(inp.mx, -1, 1), k.has(' '), this);
        this.stuck = (Math.abs(this.car.speed) < 0.6 && Math.abs(inp.mz) > 0.5) ? (this.stuck || 0) + dtc : 0;
        if (this.stuck > 2 && !this.hinted) { this.hinted = true; this.say('Stuck? Press R to put the car back on the road.', 4000); } else if (this.stuck === 0) this.hinted = false;
        if (k.has('r') && !this.rDown) { this.rDown = true; this.recoverCar(); } else if (!k.has('r')) this.rDown = false;
        w.x = this.car.x; w.z = this.car.z; w.y = this.car.y; w.yaw = this.car.yaw; w.vx = w.vz = 0;
      } else if (!this.ui_blocked) { w.update(dtc, mvx, mvz, inp.run, inp.jump, this); inp.jump = false; this.car.update(dtc, 0, 0, true, this); }
      if (!this.driving) this.car.speed *= Math.exp(-3 * dtc);
      // origin rebasing keeps every GPU coordinate small, no matter how far the player has travelled
      { const fo = this.focus(); if (!this.storeActive && Math.hypot(fo.x - this.origin.x, fo.z - this.origin.z) > 1500) this.rebase(Math.round(fo.x / 1000) * 1000, Math.round(fo.z / 1000) * 1000); }
      this.t.frame = (this.t.frame || 0) + dt; if (this.t.frame > 1) { this.t.frame = 0; this.frameCheck(); }
      this.placeFar();
      this.sim.update(dt, w.x, w.z); this.sim.render(this.origin.x, this.origin.z, (x, z) => this.heightAt(x, z));
      this.car.apply(this.origin.x, this.origin.z);
    }
    // character, Core's player mirror (so the store's door and shelves keep working), camera
    const px = w.x - this.origin.x, pz = w.z - this.origin.z;
    a.character.root.visible = !this.driving && !this.god; a.character.root.position.set(px, w.y, pz); a.character.root.rotation.y = w.yaw; a.character.update(dt, w.speed, w.onGround, 0, w.vy);
    a.player.pos.set(px, w.y, pz); a.player.yaw = w.yaw; a.player.vel.set(0, 0, 0);
    const target = this.driving ? new THREE.Vector3(px, w.y + 1.3, pz) : new THREE.Vector3(px, w.y + 1.45, pz); if (this.god) c.target.set(this.god.x - this.origin.x, Math.max(0, this.heightAt(this.god.x, this.god.z)), this.god.z - this.origin.z); else c.target.lerp(target, 1 - Math.exp(-14 * dt));
    if (this.driving && !this.god && Math.abs(c.yaw - this.lastYaw) < 1e-4 && Math.abs(this.car.speed) > 2) { const want = this.car.yaw + Math.PI; let d = ((want - c.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; c.yaw += d * (1 - Math.exp(-2.2 * dt)); }
    this.lastYaw = c.yaw; const dist = this.driving ? Math.max(c.dist, 8) : c.dist; if (this.driving && c.dist < 8) c.dist = 8; if (!this.driving && !this.god && c.dist > 14) c.dist = 14;
    const cp = Math.cos(c.pitch), cam = a.camera; cam.position.set(c.target.x + Math.sin(c.yaw) * cp * dist, c.target.y + Math.sin(c.pitch) * dist, c.target.z + Math.cos(c.yaw) * cp * dist);
    const fl = this.heightAt(cam.position.x + this.origin.x, cam.position.z + this.origin.z) + 0.9; if (cam.position.y < fl) cam.position.y = fl; cam.lookAt(c.target); if (this.god) this.godCam(); else if (cam.far !== 140000) { cam.far = 140000; cam.near = 0.4; cam.updateProjectionMatrix(); }
    this.sea.position.set(cam.position.x, -0.4, cam.position.z); this.ocean.update(dt, cam);
    a.env.update(dt, cam, c.target); a.entities.tick(dt);
    this.t.hud += dt; if (this.t.hud > 0.3) { this.t.hud = 0; this.updateHud(); }
    this.t.save += dt; if (this.t.save > 12) { this.t.save = 0; this.save(); }
  }
  recoverCar() {
    const c = this.car, r = this.graph.nearest(c.x, c.z, 200, true); if (!r) return false;
    const e = r.edge; c.x = r.x; c.z = r.z; c.yaw = Math.atan2(e.b.x - e.a.x, e.b.z - e.a.z); c.speed = 0; c.steer = 0; c.y = this.groundAt(c.x, c.z); this.stuck = 0; return true;
  }
  storeTick() {
    if (!this.store || this.store.failed) return; const d = Math.hypot(this.walker.x - this.store.cx, this.walker.z - this.store.cz);
    if (!this.storeActive && d < 55 && !this.driving) this.activateStore(); else if (this.storeActive && (d > 95 || this.driving && d > 60)) this.deactivateStore();
  }
  interact() {
    if (this.god) { this.dropFromGod(); return { ok: true, msg: 'Dropping in' }; }
    if (this.driving) { this.driving = false; const c = this.car; this.walker.x = c.x - Math.cos(c.yaw) * 2.4; this.walker.z = c.z + Math.sin(c.yaw) * 2.4; this.walker.y = this.groundAt(this.walker.x, this.walker.z); this.walker.yaw = c.yaw; return { ok: true, msg: 'Out of the car' }; }
    if (this.region && Math.hypot(this.walker.x - this.car.x, this.walker.z - this.car.z) < 5) { this.driving = true; this.a.cam.dist = Math.max(this.a.cam.dist, 8); return { ok: true, msg: 'In the car · W throttle, S brake, A D steer, Space handbrake, F to get out' }; }
    if (this.storeActive) return this.a.core.exec({ cmd: 'interact.use' });
    return { ok: false, msg: 'Nothing to use here. Walk up to your car (F) or a shop door.' };
  }

  // ---------- persistence ----------
  save() {
    if (!this.active || !this.ready) return false;
    const ll = this.latLon(), actors = {}; if (this.regionKey) actors[this.regionKey] = this.sim.serialize(); const prev = Storage.load(); if (prev && prev.actors) for (const k of Object.keys(prev.actors)) if (!actors[k]) actors[k] = prev.actors[k];
    return Storage.save({ v: 1, region: this.regionKey, lat: ll.lat, lon: ll.lon, yaw: this.walker.yaw, time: this.a.env.p.time, car: { x: this.car.x, z: this.car.z, yaw: this.car.yaw, hue: this.car.hue, driving: this.driving }, actors, edits: this.edits, storeState: this.storeActive ? structuredClone(this.a.entities.get('geo.store').state) : this.storeState });
  }

  // ---------- HUD ----------
  buildHud() {
    if (this.hud) return; const h = document.createElement('div'); h.id = 'geohud'; h.className = 'glass'; h.dataset.mode = 'play';
    const places = (this.provider.national && this.provider.national.places || []).filter(p => p.k === 'city').slice(0, 24).map(p => `<option value="${p.lat},${p.lon}">${p.n}</option>`).join('');
    h.innerHTML = `<div class="gtop"><div class="gwho"><div class="gl" id="gloc"></div><div class="gs" id="gstat"></div></div><div class="gseg" role="tablist" aria-label="Mode"><button data-m="play" role="tab">Play</button><button data-m="edit" role="tab" title="Edit tools (E)">Edit</button></div></div>
<div class="gb"><button id="gmap" title="Map (M)">Map</button><button id="gcar" title="Go to your car, or put it back on the road (R)">Car</button><button id="gexit" title="Back to the island">Island</button></div>
<div class="ged" id="gedit">
 <div class="gr"><button id="ggod" class="pri" title="Fly over the whole country (G)">God view</button><button id="gdrop" class="gdo" title="Stand here (Enter)">Drop here</button></div>
 <label class="gr"><span>Time</span><input type="range" id="gtime" min="0" max="24" step="0.05" aria-label="Time of day"><button id="gday" title="Let the day run">Cycle</button></label>
 <label class="gr"><span>Go to</span><select id="gplace" aria-label="Go to a city"><option value="">City…</option>${places}</select></label>
 <div class="gr gx"><select id="gprop" aria-label="Prop">${Object.keys(ASSETS).map(k => `<option>${k}</option>`).join('')}</select><button id="gput">Place ahead</button></div>
 <div class="gr gx"><button id="groad" title="Close or reopen the nearest road">Close road</button><button id="gslow" title="Lower the nearest road's speed limit">Slow road</button><button id="gcrowd">Add crowd</button></div>
 <div class="gr gx"><button id="gspawn">Car here</button><button id="gboost" aria-pressed="false">Boost ×1</button><button id="gundo">Undo</button></div>
</div>
<div class="gh2" id="ghint"></div><div class="ga">© OpenStreetMap contributors · terrain: AWS Terrain Tiles</div>`;
    document.getElementById('ui').appendChild(h); this.hud = h;
    const $ = q => h.querySelector(q), core = this.a.core, ex = c => { const r = core.exec(c); this.say(r.msg || (r.ok ? 'Done' : 'Could not do that'), 3000); return r; };
    $('#gmap').onclick = () => this.a.map && this.a.map.toggle(); $('#gexit').onclick = () => this.close();
    $('#gcar').onclick = () => { if (this.driving) this.recoverCar(); else if (this.region || this.car.root.visible) { this.walker.x = this.car.x + 3; this.walker.z = this.car.z + 3; this.walker.y = this.groundAt(this.walker.x, this.walker.z); } };
    h.querySelectorAll('.gseg button').forEach(b => b.onclick = () => { if (b.dataset.m !== this.mode) this.swapMode(); });
    $('#ggod').onclick = () => this.god ? this.exitGod() : this.enterGod(); $('#gdrop').onclick = () => this.dropFromGod();
    $('#gtime').oninput = e => { this.a.env.set({ time: +e.target.value }); for (const t of this.tiles.values()) if (t.mBld) t.mBld.userData.u.uNight.value = 1 - this.a.env.day; };
    $('#gday').onclick = e => { this.dayRate = this.dayRate ? 0 : 1 / 90; e.target.setAttribute('aria-pressed', !!this.dayRate); this.say(this.dayRate ? 'Day cycle on' : 'Time held', 2000); };
    $('#gplace').onchange = e => { const v = e.target.value; if (!v) return; const [lat, lon] = v.split(',').map(Number); this.exitGod(); ex({ cmd: 'world.goto', lat, lon }); e.target.value = ''; };
    $('#gput').onclick = () => { const w = this.walker, f = this.driving ? this.car : w, x = f.x + Math.sin(f.yaw) * 4, z = f.z + Math.cos(f.yaw) * 4; ex({ cmd: 'world.assets.place', type: $('#gprop').value, x, z, yaw: f.yaw }); };
    $('#groad').onclick = () => { const r = this.graph.nearest(this.walker.x, this.walker.z, 40); if (!r) return this.say('No mapped street within 40 m. Road tools work in the detailed regions.', 3500); const id = r.edge.way; ex({ cmd: 'world.road.edit', id, patch: { closed: !this.graph.closed.has(id) } }); };
    $('#gslow').onclick = () => { const r = this.graph.nearest(this.walker.x, this.walker.z, 40); if (!r) return this.say('No mapped street within 40 m. Road tools work in the detailed regions.', 3500); ex({ cmd: 'world.road.edit', id: r.edge.way, patch: { speed: 8 } }); };
    $('#gcrowd').onclick = () => ex({ cmd: 'world.building.populate', x: this.walker.x + Math.sin(this.walker.yaw) * 6, z: this.walker.z + Math.cos(this.walker.yaw) * 6, count: 8 });
    $('#gspawn').onclick = () => { const f = this.walker; this.driving = false; this.car.x = f.x + Math.cos(f.yaw) * 3.2; this.car.z = f.z - Math.sin(f.yaw) * 3.2; this.car.yaw = f.yaw; this.car.speed = 0; this.car.y = this.groundAt(this.car.x, this.car.z); this.car.root.visible = true; this.say('Car placed beside you · F to get in', 3000); };
    $('#gboost').onclick = e => { this.boost = this.boost === 1 ? 3 : this.boost === 3 ? 8 : 1; e.target.textContent = 'Boost ×' + this.boost; e.target.setAttribute('aria-pressed', this.boost > 1); };
    $('#gundo').onclick = () => { this.a.undo(); };
    // the confirm prompt and the keys that belong to the world
    const pr = document.createElement('div'); pr.id = 'gprompt'; pr.className = 'glass'; pr.hidden = true; pr.setAttribute('role', 'alertdialog');
    pr.innerHTML = '<b id="gpt"></b><span id="gpb"></span><div class="gr"><button id="gpy" class="pri"></button><button id="gpn">Stay</button></div>'; document.getElementById('ui').appendChild(pr); this.promptEl = pr;
    pr.querySelector('#gpy').onclick = () => this.answerPrompt(true); pr.querySelector('#gpn').onclick = () => this.answerPrompt(false);
    addEventListener('keydown', e => {
      if (!this.active || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return; const k = e.key.toLowerCase();
      if (this.prompting && e === this.askEv) return;       // the very key press that opened the prompt must not also answer it
      if (this.prompting) { if (k === 'e' || k === 'enter') { e.preventDefault(); e.stopImmediatePropagation(); this.answerPrompt(true); } else if (k === 'escape' || k === 'n') { e.preventDefault(); e.stopImmediatePropagation(); this.answerPrompt(false); } return; }
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'g' && this.mode === 'edit') { e.preventDefault(); this.god ? this.exitGod() : this.enterGod(); }
      else if (k === 'enter' && this.god) { e.preventDefault(); this.dropFromGod(); }
    }, true);
    this.paintHud();
  }
  say(t, ms = 5000) { this.msg = t; this.a.ui && this.a.ui.say(t, ms); }

  // ---------- Play is the game. Edit adds the tools. E swaps, with a confirm on the way in. ----------
  setMode(m, quiet) {
    this.mode = m; if (m === 'play') { this.exitGod(); this.boost = 1; }
    this.paintHud(); if (!quiet) this.say(m === 'edit' ? 'Edit mode · G for god view · E to go back to Play' : 'Play mode', 3500);
  }
  swapMode() {
    if (!this.active) return { ok: false, msg: 'The world is not open' };
    if (this.prompting) return this.answerPrompt(true);
    if (this.mode === 'edit') { this.setMode('play'); return { ok: true, msg: 'Play mode' }; }
    this.ask('Switch to Edit?', 'Adds god view of the whole country, time of day, props, road tools and crowds.', 'Edit', () => this.setMode('edit'));
    return { ok: true, msg: 'Press E or Enter to confirm, Esc to stay' };
  }
  ask(title, body, yes, run) {
    const p = this.promptEl; p.querySelector('#gpt').textContent = title; p.querySelector('#gpb').textContent = body; p.querySelector('#gpy').textContent = yes; p.hidden = false; this.prompting = run; this.askEv = window.event || null; p.querySelector('#gpy').focus({ preventScroll: true });
  }
  answerPrompt(yes) { const run = this.prompting; this.closePrompt(); if (yes && run) run(); return { ok: true, msg: yes ? 'Confirmed' : 'Cancelled' }; }
  closePrompt() { this.prompting = null; if (this.promptEl) this.promptEl.hidden = true; const c = document.getElementById('c') || document.querySelector('canvas'); if (c && c.focus) try { c.focus({ preventScroll: true }); } catch (_) {} }
  paintHud() {
    const h = this.hud; if (!h) return; h.dataset.mode = this.mode; if (this.god) h.dataset.god = '1'; else delete h.dataset.god;
    h.querySelectorAll('.gseg button').forEach(b => { const on = b.dataset.m === this.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const g = h.querySelector('#ggod'); if (g) g.textContent = this.god ? 'Leave god view' : 'God view';
    const t = h.querySelector('#gtime'); if (t) t.value = this.a.env.p.time;
  }

  // ---------- God view: fly over the whole country. Streaming pauses when you are too high to see ground detail. ----------
  enterGod() {
    if (this.god || !this.active || !this.ready) return; const f = this.driving ? this.car : this.walker, c = this.a.cam;
    this.god = { x: f.x, z: f.z, yaw: 0, speed: 0, dist: 1200, high: false }; this.godSaved = { dist: c.dist, pitch: c.pitch }; c.dist = 1200; c.pitch = 0.95; c.yaw = 0;
    this.buildCountry(); this.paintHud(); this.say('God view · WASD fly, Shift faster, Space up, C down, wheel zoom, Enter drops you in', 6000);
  }
  exitGod(quiet) {
    if (!this.god) return; const c = this.a.cam; if (this.godSaved) { c.dist = Math.min(this.godSaved.dist, 14); c.pitch = this.godSaved.pitch; } this.god = null; this.detail(true); if (this.country) this.country.visible = false;
    const cam = this.a.camera; cam.far = 140000; cam.near = 0.4; cam.updateProjectionMatrix(); this.paintHud(); if (!quiet) this.say('Back on the ground', 2500);
  }
  flyGod(dt, inp, mvx, mvz) {
    const g = this.god, c = this.a.cam, k = this.a.input.keys, spd = Math.max(60, c.dist * 0.9) * (inp.run ? 4 : 1);
    g.x += mvx * spd * dt; g.z += mvz * spd * dt;
    if (k.has(' ')) c.dist *= 1 + 1.6 * dt * (inp.run ? 3 : 1); if (k.has('c')) c.dist /= 1 + 1.6 * dt * (inp.run ? 3 : 1);
    c.dist = clamp(c.dist, 40, 4.2e6); g.dist = c.dist; const wasHigh = g.high; g.high = c.dist > 45000;
    if (g.high !== wasHigh) { this.detail(!g.high); if (this.country) this.country.visible = g.high; }
    this.placeMarker();
  }
  godCam() { const cam = this.a.camera, d = this.a.cam.dist, far = Math.max(140000, d * 70), near = clamp(d / 1500, 0.4, 3000); if (Math.abs(cam.far - far) > far * 0.05 || Math.abs(cam.near - near) > near * 0.05) { cam.far = far; cam.near = near; cam.updateProjectionMatrix(); } }
  detail(on) { for (const t of this.tiles.values()) if (t.group) t.group.visible = on; this.wilds.group.visible = on; if (this.far) this.far.visible = on; this.sim.group.visible = on; this.sea.visible = on; this.ocean.mesh.visible = on; this.car.root.visible = on && (this.region || this.car.root.visible || true); }
  dropFromGod() {
    const g = this.god; if (!g) return; const ll = this.frame.toLatLon(g.x, g.z);
    if (ll.lat < -35.2 || ll.lat > -21.9 || ll.lon < 16.3 || ll.lon > 33.1) return this.say('That is outside South Africa. Move over land first.', 3000);
    this.exitGod(true); this.driving = false; this.ready = false; this.setFrame(ll.lat, ll.lon).then(() => { this.ready = true; this.a.ui.brand(); this.say('Dropped in · ' + this.placeName(ll.lat, ll.lon), 3500); });
  }
  /* the country as one relief mesh in the current frame, textured with the map's hillshade; only drawn when you are very high */
  async buildCountry() {
    const m = this.a.map; if (!m) return; await m.load(); if (!this.active || (this.country && this.countryFrame === this.frame)) return this.placeCountry();
    this.disposeCountry(); const b = m.b, N = 128, pos = [], uv = [], idx = [], f = this.frame;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const lon = b.w + (b.e - b.w) * i / N, lat = b.n - (b.n - b.s) * j / N, p = f.toLocal(lat, lon), h = this.provider.demAt(lat, lon); pos.push(p.x, h > 1 ? h * 6 : -60, p.z); uv.push(i / N, 1 - j / N); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const tex = new THREE.CanvasTexture(m.relief); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: false })); mesh.frustumCulled = false;
    const grp = new THREE.Group(); grp.add(mesh); grp.name = 'country';
    const lab = (txt, size) => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = `600 ${size}px ui-sans-serif,system-ui`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(txt, 128, 32); x.fillStyle = '#ede8df'; x.fillText(txt, 128, 32); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false, fog: false })); sp.scale.set(0.2, 0.05, 1); sp.renderOrder = 10; return sp; };
    for (const p of (this.provider.national.places || []).filter(q => q.k === 'city').slice(0, 30)) { const q = f.toLocal(p.lat, p.lon), s = lab(p.n, 26); s.position.set(q.x, this.provider.demAt(p.lat, p.lon) * 6 + 4000, q.z); grp.add(s); }
    const mk = document.createElement('canvas'); mk.width = mk.height = 64; const mx = mk.getContext('2d'); mx.strokeStyle = '#ffd9a0'; mx.lineWidth = 6; mx.beginPath(); mx.arc(32, 32, 20, 0, 7); mx.stroke(); mx.fillStyle = '#ffd9a0'; mx.beginPath(); mx.arc(32, 32, 6, 0, 7); mx.fill();
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mk), depthTest: false, transparent: true, sizeAttenuation: false, fog: false })); this.marker.scale.set(0.05, 0.05, 1); this.marker.renderOrder = 11; grp.add(this.marker);
    this.country = grp; this.countryMesh = mesh; this.countryFrame = f; this.group.add(grp); this.country.visible = !!(this.god && this.god.high); this.placeCountry();
  }
  placeCountry() { if (this.country) { this.country.position.set(-this.origin.x, 0, -this.origin.z); this.placeMarker(); } }
  placeMarker() { if (this.marker) { const w = this.walker, h = this.heightAt(w.x, w.z); this.marker.position.set(w.x, h * 6 + 6000, w.z); } }
  disposeCountry() { if (!this.country) return; this.group.remove(this.country); this.country.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); this.country = null; this.marker = null; this.countryFrame = null; }

  // ---------- keeping the frame honest across a whole country ----------
  regionAtLL(lat, lon, pad = 0) { const man = this.manifest; return Object.keys(man.regions).find(k => { const [s, w, n, e] = man.regions[k].bbox; return lat >= s - pad && lat <= n + pad && lon >= w - pad && lon <= e + pad; }) || null; }
  placeName(lat, lon) {
    let best = null, bd = 0.2; for (const p of (this.provider.national && this.provider.national.places) || []) { const d = Math.hypot((p.lat - lat), (p.lon - lon) * 0.85); if (d < bd) { bd = d; best = p; } }
    return best ? (bd < 0.03 ? best.n : 'near ' + best.n) : 'South Africa';
  }
  frameCheck() {
    if (!this.ready || this.switching || this.storeActive || this.loading || (this.god && this.god.high)) return;
    const f = this.focus(), ll = this.frame.toLatLon(f.x, f.z), cm = this.frame.zone * 6 - 183;
    const want = this.regionAtLL(ll.lat, ll.lon, 0.02);
    let go = false;
    if (want && want !== this.regionKey) go = true;
    else if (!want && this.region && !this.regionAtLL(ll.lat, ll.lon, 0.4)) go = true;                  // far from the detailed region: leave its frame
    else if (!this.region && Math.abs(ll.lon - cm) > 3.3) go = true;                                    // keep UTM distortion small across a country
    const fo = this.far && this.far.userData.anchor; if (!go && fo && Math.hypot(f.x - fo.x, f.z - fo.z) > 40000) this.buildFar();
    if (!go) return;
    this.switching = true; this.ready = false; const car = { ll: this.frame.toLatLon(this.car.x, this.car.z), yaw: this.car.yaw, driving: this.driving, speed: this.car.speed }, here = this.focus() === this.walker || !this.god;
    this.setFrame(ll.lat, ll.lon).then(() => {
      if (car.driving) { const q = this.frame.toLocal(car.ll.lat, car.ll.lon); this.car.x = q.x; this.car.z = q.z; this.car.yaw = car.yaw; this.car.speed = car.speed; this.car.y = this.groundAt(q.x, q.z); this.walker.x = q.x; this.walker.z = q.z; this.walker.y = this.car.y; }
      this.ready = true; this.switching = false; this.a.ui.brand(); void here; this.say(this.region ? this.region.name + ' · detailed streets, buildings and traffic' : this.placeName(ll.lat, ll.lon) + ' · generated ground and national roads', 4000);
    });
  }
  updateHud() {
    if (!this.hud) return; const ll = this.latLon(), w = this.walker, f = this.focus(), r = this.region ? this.graph.nearest(w.x, w.z, 25) : this.wilds.roadAt(w.x, w.z, 25);
    const kmh = Math.round(Math.abs(this.driving ? this.car.speed : w.speed) * 3.6), S = this.sim.stats, inReg = this.region && this.regionAtLL(ll.lat, ll.lon, 0);
    const where = this.god ? this.frame.toLatLon(f.x, f.z) : ll;
    this.hud.querySelector('#gloc').textContent = (inReg ? this.region.name : this.placeName(where.lat, where.lon)) + (!this.god && r && r.edge.r.name ? ' · ' + r.edge.r.name : '');
    this.hud.querySelector('#gstat').textContent = this.god ? `${where.lat.toFixed(3)}, ${where.lon.toFixed(3)} · view from ${this.god.dist >= 10000 ? Math.round(this.god.dist / 1000) + ' km' : Math.round(this.god.dist) + ' m'} · ${this.god.high ? 'whole country' : 'streaming ground'}`
      : `${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)} · ${Math.round(w.y)} m · ${kmh} km/h${this.driving ? ' · driving' : ''} · ${inReg ? this.tiles.size + ' tiles · ' + (S.near + S.medium) + ' actors' : 'generated ground'}`;
    this.hud.querySelector('#ghint').textContent = this.god ? 'WASD fly · Shift faster · Space up · C down · wheel zoom · Enter drops you in · G leaves'
      : this.mode === 'edit' ? 'Edit · G god view · F car · M map · E back to Play' : (this.driving ? 'W throttle · S brake · A D steer · Space handbrake · F get out · E edit' : 'WASD move · Shift run · F car or door · M map · E edit');
    const t = this.hud.querySelector('#gtime'); if (t && document.activeElement !== t) t.value = this.a.env.p.time;
  }

  // ---------- commands ----------
  exec(c, core) {
    const bad = (code, msg, path) => ({ ok: false, code, msg, path });
    const num = (v, lo, hi, d) => Number.isFinite(+v) ? clamp(+v, lo, hi) : d;
    if (c.cmd === 'world.open') { if (this.loading) return bad('world.busy', 'The world is still loading.'); this.open({ lat: c.lat, lon: c.lon, region: c.region, resume: !!c.resume }).then(() => this.a.ui.brand()); return { ok: true, msg: 'Opening the world. Poll world.region.describe until "ready" is true.', pending: true }; }
    if (c.cmd === 'world.performance.report') return { ok: true, ...this.perf() };
    if (!this.active) return bad('world.closed', 'The world is not open. Run {"cmd":"world.open"} first.');
    const find = () => {
      if (Number.isFinite(+c.x) && Number.isFinite(+c.z)) return { x: +c.x, z: +c.z };
      if (Number.isFinite(+c.lat) && Number.isFinite(+c.lon)) { const p = this.frame.toLocal(+c.lat, +c.lon); return { x: p.x, z: p.z }; }
      return { x: this.walker.x, z: this.walker.z };
    };
    switch (c.cmd) {
      case 'world.close': return this.close();
      case 'world.mode': { if (c.mode !== 'play' && c.mode !== 'edit') return bad('world.mode', 'mode must be "play" or "edit".', 'mode'); this.setMode(c.mode); return { ok: true, mode: this.mode, msg: this.mode + ' mode' }; }
      case 'world.view.god': {
        if (c.on === false) { this.exitGod(); return { ok: true, msg: 'Back on the ground' }; }
        if (this.mode !== 'edit') return bad('world.mode', 'God view is an Edit tool. Run {"cmd":"world.mode","mode":"edit"} first.', 'mode');
        if (!this.god) this.enterGod(); if (!this.god) return bad('world.busy', 'The world is not ready yet.');
        if (Number.isFinite(+c.lat) && Number.isFinite(+c.lon)) { const p = this.frame.toLocal(+c.lat, +c.lon); this.god.x = p.x; this.god.z = p.z; }
        if (Number.isFinite(+c.height)) { this.a.cam.dist = clamp(+c.height, 40, 4.2e6); this.god.dist = this.a.cam.dist; this.god.high = this.a.cam.dist > 45000; this.detail(!this.god.high); if (this.country) this.country.visible = this.god.high; }
        return { ok: true, msg: 'God view', height: Math.round(this.a.cam.dist), whole: this.god.high };
      }
      case 'world.save': return { ok: this.save(), msg: 'Saved' };
      case 'world.goto': {
        let lat = +c.lat, lon = +c.lon;
        if (c.place) { const p = (this.provider.national && this.provider.national.places || []).find(q => q.n.toLowerCase() === String(c.place).toLowerCase()); if (!p) return bad('world.place', `No place called "${c.place}". Try a city name such as Cape Town or Johannesburg.`, 'place'); lat = p.lat; lon = p.lon; }
        else if (Number.isFinite(+c.x) && Number.isFinite(+c.z)) { const ll = this.latLon(+c.x, +c.z); lat = ll.lat; lon = ll.lon; }
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -35.2 || lat > -21.9 || lon < 16.3 || lon > 33.1) return bad('world.range', 'Give lat in -35.2..-21.9 and lon in 16.3..33.1 (South Africa), or a place name.', 'lat');
        this.exitGod(true); this.driving = false; this.ready = false; this.setFrame(lat, lon).then(() => { this.ready = true; this.a.ui.brand(); this.say(this.region ? this.region.name : this.placeName(lat, lon) + ' · generated ground and national roads'); });
        return { ok: true, msg: 'Going to ' + lat.toFixed(4) + ', ' + lon.toFixed(4), detailed: !!Object.keys(this.manifest.regions).find(k => { const [s, w, n, e] = this.manifest.regions[k].bbox; return lat >= s && lat <= n && lon >= w && lon <= e; }), pending: true };
      }
      case 'world.region.describe': return { ok: true, ready: this.ready, loading: this.loading, region: this.regionKey, name: this.region ? this.region.name : null, detailed: !!this.region, bbox: this.region && this.region.bbox, zone: this.frame.zone, origin: { ...this.origin }, tileSize: this.T,
        tiles: { available: this.tileList.length, loaded: [...this.tiles.values()].filter(t => t.state === 'ready').map(t => t.key), loading: [...this.tiles.values()].filter(t => t.state !== 'ready').length }, counts: this.region && this.region.counts, store: this.store && { id: this.store.id, name: this.store.name, active: this.storeActive },
        player: { ...this.latLon(), x: +this.walker.x.toFixed(1), z: +this.walker.z.toFixed(1), y: +this.walker.y.toFixed(1) }, source: this.manifest.source, regions: Object.fromEntries(Object.entries(this.manifest.regions).map(([k, r]) => [k, { name: r.name, bbox: r.bbox }])), note: 'Anywhere in South Africa is addressable; only listed regions have street-level data.' };
      case 'world.region.load': {
        if (!this.region) return bad('world.coarse', 'This area has no detailed region.');
        let list = Array.isArray(c.tiles) ? c.tiles.map(t => t[0] + '_' + t[1]) : null;
        if (!list) { const r = num(c.radius, 100, 3000, 1000), f = this.walker; list = this.tileList.filter(t => this.rectDist(t, f.x, f.z) < r).map(t => t.key); }
        list = list.filter(k => this.region.tiles[k]).slice(0, 40); list.forEach(k => this.provider.tile(this.regionKey, k)); return { ok: true, msg: list.length + ' tiles queued', tiles: list };
      }
      case 'world.region.generate': return bad('world.generate.offline', 'Regions are built offline from the OSM extract. Add the bbox to REGIONS in tools/world/import.py, then run: python3 tools/world/import.py --pbf south-africa-latest.osm.pbf --out data/world/za --region <key>', 'bbox');
      case 'world.road.inspect': {
        let e, r; if (c.id != null) { for (const list of this.graph.byTile.values()) { e = list.find(q => q.way === +c.id); if (e) break; } if (!e) return bad('world.road.unknown', `Road ${c.id} is not loaded. Go near it first.`, 'id'); r = { edge: e, d: 0 }; }
        else { const p = find(); r = this.graph.nearest(p.x, p.z, num(c.radius, 5, 200, 60)); if (!r) return bad('world.road.none', 'No road within that radius.'); }
        const rr = r.edge.r, info = laneInfo(rr), ed = this.edits.roads[rr.id] || null;
        return { ok: true, road: { id: rr.id, osm: 'way/' + rr.id, class: rr.c, name: rr.name || null, ref: rr.ref || null, ...info, surface: rr.surface || null, bridge: !!(rr.bridge && rr.bridge !== 'no'), tunnel: !!rr.tunnel, width: CLASSES[rr.c].w, widthSource: 'inferred from class', distance: +r.d.toFixed(1), closed: this.graph.closed.has(rr.id), edit: ed, provenance: { source: 'OpenStreetMap', tags: ['highway', 'name', 'oneway', 'lanes', 'maxspeed', 'surface'].filter(k => rr[k] != null) } } };
      }
      case 'world.road.edit': {
        const id = +c.id; if (!Number.isFinite(id)) return bad('world.road.id', 'Pass the OSM way id as "id" (from world.road.inspect).', 'id');
        const patch = c.patch || {}, allowed = ['closed', 'speed', 'name']; for (const k of Object.keys(patch)) if (!allowed.includes(k)) return bad('world.road.patch', `Unknown patch field "${k}". Allowed: ${allowed.join(', ')}.`, 'patch.' + k);
        const next = { ...(this.edits.roads[id] || {}) }; if ('closed' in patch) next.closed = !!patch.closed; if ('speed' in patch) next.speed = num(patch.speed, 2, 45, 12); if ('name' in patch) next.name = String(patch.name).slice(0, 60);
        const before = this.edits.roads[id] ? structuredClone(this.edits.roads[id]) : null; if (c.dryRun) return { ok: true, dryRun: true, before, after: next };
        const apply = v => { if (v && Object.keys(v).length) this.edits.roads[id] = v; else delete this.edits.roads[id]; if (v && v.closed) this.graph.closed.add(id); else this.graph.closed.delete(id); this.rebuildRoads(); };
        apply(next); core.push({ label: 'world.road.edit ' + id, undo: () => apply(before), redo: () => apply(next) }); return { ok: true, msg: 'Road ' + id + ' updated', before, after: next };
      }
      case 'world.building.inspect': {
        let rec; if (c.id != null) rec = this.bi.byId.get(+c.id); else { const p = find(); rec = this.bi.inside(p.x, p.z); if (!rec) { let bd = 40; for (const q of this.bi.near(p.x, p.z, 40)) { const d = Math.hypot((q.x0 + q.x1) / 2 - p.x, (q.z0 + q.z1) / 2 - p.z); if (d < bd) { bd = d; rec = q; } } } }
        if (!rec) return bad('world.building.none', 'No loaded building there. Go closer, or pass an id.');
        const b = rec.b, t = this.tiles.get(rec.tile);
        const truth = truthOf(b, this.landmarks.has(b.id)); return { ok: true, truth, building: { id: b.id, osm: 'way/' + b.id, kind: b.k, name: b.n || null, levels: b.lv ? +b.lv : null, height: b.h, heightSource: b.hs, heightVerified: b.hs === 'tag' || b.hs === 'levels', tier: truth.tier, tierName: truth.tierName, parts: b.parts ? b.parts.length : 0, roof: b.rs || null, roofSource: b.rs ? 'tag' : 'inferred', footprintArea: Math.round(polyArea(rec.pts)), vertices: rec.pts.length / 2, interactive: !!(this.store && this.store.id === b.id), lod: t ? t.lod : null, tile: rec.tile, provenance: 'footprint from OSM; heights marked "inferred" are guesses, not survey data' } };
      }
      case 'world.building.populate': {
        const p = find(), n = num(c.count, 1, 12, 4); let rec = c.id != null ? this.bi.byId.get(+c.id) : this.bi.inside(p.x, p.z); const cx = rec ? (rec.x0 + rec.x1) / 2 : p.x, cz = rec ? (rec.z0 + rec.z1) / 2 : p.z;
        const r = this.graph.nearest(cx, cz, 120); if (!r) return bad('world.populate.noroad', 'No street near that building to put people on.');
        const edges = [...r.edge.a.edges, ...r.edge.b.edges]; const made = []; const base = Object.keys(this.edits.roads).length + this.sim.actors.size;
        if (c.dryRun) return { ok: true, dryRun: true, would: n, near: { x: +r.x.toFixed(1), z: +r.z.toFixed(1) } };
        for (let i = 0; i < n; i++) { const e = edges[i % edges.length], id = 'edit#' + (base + i) + '#p'; if (this.sim.actors.has(id) || this.sim.actors.size >= BUDGET.actors) break; this.sim.actors.set(id, { id, kind: 'ped', ak: e.a.k, bk: e.b.k, t: (i + 1) / (n + 1), dir: i % 2 ? 1 : -1, speed: 1.2, seed: base * 977 + i, hue: (i * 0.17) % 1, x: 0, z: 0, px: 0, pz: 0, yaw: 0, tier: 'far', last: 0, acc: 0, tile: e.tile }); made.push(id); }
        core.push({ label: 'world.building.populate', undo: () => made.forEach(id => this.sim.actors.delete(id)), redo: () => {} }); return { ok: true, msg: made.length + ' pedestrians added', ids: made };
      }
      case 'world.assets.place': {
        if (!ASSETS[c.type]) return bad('world.asset.type', `Unknown asset "${c.type}". Choose: ${Object.keys(ASSETS).join(', ')}.`, 'type');
        if (this.edits.assets.length >= BUDGET.edits) return bad('world.asset.limit', 'Asset limit reached (' + BUDGET.edits + ').');
        const p = find(), rec = { id: 'a' + Date.now().toString(36) + this.edits.assets.length, type: c.type, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: num(c.yaw, -7, 7, 0) };
        if (c.dryRun) return { ok: true, dryRun: true, would: rec };
        this.edits.assets.push(rec); this.drawEdits(); core.push({ label: 'world.assets.place', undo: () => { this.edits.assets = this.edits.assets.filter(a => a.id !== rec.id); this.drawEdits(); }, redo: () => { this.edits.assets.push(rec); this.drawEdits(); } });
        return { ok: true, msg: 'Placed ' + c.type, asset: rec };
      }
      case 'world.simulation.inspect': return { ok: true, ...this.sim.inspect(), time: +this.sim.time.toFixed(1), tiers: { near: 'under 160 m, every frame', medium: 'under 650 m, 4 Hz, interpolated', far: 'frozen, fast-forwarded on return' } };
      default: return bad('world.unknown', 'Unknown world command ' + c.cmd);
    }
  }
  rebuildRoads() { for (const t of this.tiles.values()) { if (t.state !== 'ready') continue; for (const m of t.meshes.filter(m => /^road-/.test(m.userData.kind || ''))) { t.group.remove(m); m.geometry.dispose(); } t.meshes = t.meshes.filter(m => !/^road-/.test(m.userData.kind || ''));
    const T = this.T, H = (x, z) => t.hf.at(clamp(x, 0, T), clamp(z, 0, T)), roads = roadGeometries(t.data, H, this.graph.closed);
    for (const [name, a] of Object.entries(roads)) { const g = toGeometry(a); if (!g) continue; const m = new THREE.Mesh(g, t.mRoad); m.receiveShadow = true; m.userData.kind = 'road-' + name; if (name === 'minor' && t.lod === 'far') m.visible = false; t.group.add(m); t.meshes.push(m); } } }
  drawEdits() {
    for (const m of this.props.children.slice()) { this.props.remove(m); m.geometry.dispose(); m.material.dispose(); }
    const by = {}; for (const a of this.edits.assets) (by[a.type] ||= []).push(a);
    for (const [type, list] of Object.entries(by)) { const [color, h] = ASSETS[type], geo = type === 'tree' ? treeGeo() : new THREE.BoxGeometry(type === 'bench' ? 1.6 : 0.5, h, type === 'bench' ? 0.5 : 0.5).translate(0, h / 2, 0), m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }), list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      list.forEach((a, i) => { m.setMatrixAt(i, M.compose(p.set(a.x, this.heightAt(a.x, a.z), a.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.yaw), s)); }); m.castShadow = true; m.userData.edit = true; this.props.add(m); }
    this.props.position.set(-this.origin.x, 0, -this.origin.z);
  }
  perf() {
    const r = this.a.renderer.info, ms = this.provider.stats.ms, tri = r.render.triangles;
    return { frameMs: this.a.tele ? this.a.tele.read().frameMs : null, fps: this.a.fps, calls: r.render.calls, triangles: tri, geometries: r.memory.geometries, textures: r.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      tiles: { loaded: [...this.tiles.values()].filter(t => t.state === 'ready').length, total: this.tiles.size, lod: countBy([...this.tiles.values()].map(t => t.lod)) }, streaming: { fetches: this.provider.stats.fetches, megabytes: +(this.provider.stats.bytes / 1048576).toFixed(2), cancelled: this.provider.stats.cancelled + this.stats.cancelled, avgFetchMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null }, graph: { nodes: this.graph.nodes.size, edges: this.graph.edgeCount }, buildings: [...this.bi.byTile.values()].reduce((n, l) => n + l.length, 0), stats: { ...this.stats }, sim: this.sim.stats, origin: { ...this.origin } };
  }
}
const countBy = a => a.reduce((o, k) => (o[k || '?'] = (o[k || '?'] || 0) + 1, o), {});
const snap90 = y => Math.round(y / (Math.PI / 2)) * (Math.PI / 2);
function pointIn(x, z, p) { let ins = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i] / 10, zi = p[i + 1] / 10, xj = p[j] / 10, zj = p[j + 1] / 10; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
function polyArea(p) { let A = 0; const n = p.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; } return Math.abs(A) / 2; }
/* smallest oriented box around a footprint: brute force over edge directions */
function orientedBox(p) {
  const n = p.length / 2; let best = null;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = Math.atan2(p[j * 2 + 1] - p[i * 2 + 1], p[j * 2] - p[i * 2]), c = Math.cos(a), s = Math.sin(a); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < n; k++) { const u = p[k * 2] * c + p[k * 2 + 1] * s, v = -p[k * 2] * s + p[k * 2 + 1] * c; x0 = Math.min(x0, u); x1 = Math.max(x1, u); z0 = Math.min(z0, v); z1 = Math.max(z1, v); }
    const area = (x1 - x0) * (z1 - z0); if (!best || area < best.area) best = { area, w: x1 - x0, d: z1 - z0, a }; }
  return best;
}
/* circle (x,z,r) against an oriented box {c,h,q} from the entity registry; null if clear or at another height */
function boxPush(x, z, r, b, y) {
  if (y > b.c[1] + b.h[1] - 0.35 || y + 1.7 < b.c[1] - b.h[1]) return null;   // a floor slab under the feet is ground, not a wall
  const [qx, qy, qz, qw] = b.q, yaw = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)), c = Math.cos(yaw), s = Math.sin(yaw), dx = x - b.c[0], dz = z - b.c[2];
  const lx = dx * c - dz * s, lz = dx * s + dz * c, px = clamp(lx, -b.h[0], b.h[0]), pz = clamp(lz, -b.h[2], b.h[2]); let ox = lx - px, oz = lz - pz, d = Math.hypot(ox, oz);
  if (d >= r) return null;
  if (d < 1e-6) { const ex = b.h[0] - Math.abs(lx), ez = b.h[2] - Math.abs(lz); if (ex < ez) { ox = Math.sign(lx || 1); oz = 0; d = -ex; } else { ox = 0; oz = Math.sign(lz || 1); d = -ez; } } else { ox /= d; oz /= d; }
  const push = r - d, nlx = lx + ox * push, nlz = lz + oz * push; return { x: b.c[0] + nlx * c + nlz * s, z: b.c[2] - nlx * s + nlz * c };
}
const lampMat = new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.6, metalness: 0.4 }), treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
let _lamp, _tree;
function lampGeo() { if (!_lamp) { const p = new THREE.CylinderGeometry(0.07, 0.09, 5, 6).translate(0, 2.5, 0), h = new THREE.BoxGeometry(0.9, 0.12, 0.25).translate(0.4, 5, 0); _lamp = merge2(p, h); } return _lamp; }
function treeGeo() { if (!_tree) { const t = new THREE.CylinderGeometry(0.15, 0.22, 2.2, 6).translate(0, 1.1, 0), c = new THREE.SphereGeometry(1.7, 8, 6).translate(0, 3.6, 0); _tree = merge2(t, c, [0x6b4f33, 0x4f6e3c]); } return _tree; }
function merge2(a, b, cols) {
  const g = new THREE.BufferGeometry(), na = a.attributes.position.count, nb = b.attributes.position.count, pos = new Float32Array((na + nb) * 3), nor = new Float32Array((na + nb) * 3), col = new Float32Array((na + nb) * 3);
  pos.set(a.attributes.position.array); pos.set(b.attributes.position.array, na * 3); nor.set(a.attributes.normal.array); nor.set(b.attributes.normal.array, na * 3);
  const c1 = new THREE.Color(cols ? cols[0] : 0xffffff), c2 = new THREE.Color(cols ? cols[1] : 0xffffff); for (let i = 0; i < na; i++) col.set([c1.r, c1.g, c1.b], i * 3); for (let i = 0; i < nb; i++) col.set([c2.r, c2.g, c2.b], (na + i) * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (cols) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ia = a.index.array, ib = b.index.array, idx = new Uint32Array(ia.length + ib.length); idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na; g.setIndex(new THREE.BufferAttribute(idx, 1)); return g;
}
