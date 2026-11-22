// World overview: a 2D map of South Africa (relief, coast, trunk roads, cities, detailed regions). It is a contextual sheet over the Core viewport, not a replacement for it.
// Click a detailed region to stream it; click anywhere else to stand on coarse national relief. Drag to pan, wheel or buttons to zoom.
export class OverviewMap {
  constructor(app) {
    this.a = app; this.view = { x: 0.5, y: 0.5, k: 1 }; this.ready = false;
    const el = document.createElement('div'); el.className = 'sheet'; el.id = 'geomap'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'South Africa map');
    el.innerHTML = '<div class="card gm"><div class="gh"><b>South Africa</b><div class="gz"><button class="ib" id="gmzout" aria-label="Zoom out">−</button><button class="ib" id="gmzin" aria-label="Zoom in">+</button><button class="ib" id="gmx" aria-label="Close">✕</button></div></div><canvas id="gmc" aria-label="Map of South Africa. Click a place to go there."></canvas><div class="gmi" id="gmi"></div><div class="chips" id="gmp"></div><p class="gma">Relief: AWS Terrain Tiles · Roads, coast, places: © OpenStreetMap contributors. Detailed streets exist where the region outline is drawn; anywhere else loads coarse relief only.</p></div>';
    document.getElementById('ui').appendChild(el); this.el = el; this.cv = el.querySelector('#gmc'); this.info = el.querySelector('#gmi');
    el.querySelector('#gmx').onclick = () => this.toggle(false); el.onclick = e => { if (e.target === el) this.toggle(false); };
    el.querySelector('#gmzin').onclick = () => this.zoom(1.5); el.querySelector('#gmzout').onclick = () => this.zoom(1 / 1.5);
    let drag = null; const cv = this.cv;
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; if (drag.moved) { this.view.x = drag.vx - dx / (this.W * this.view.k); this.view.y = drag.vy - dy / (this.H * this.view.k); this.draw(); } } else this.hover(e); });
    cv.addEventListener('pointerup', e => { if (drag && !drag.moved) this.pick(e); drag = null; });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('on')) this.toggle(false); else if ((e.key === 'm' || e.key === 'M') && a_active(app) && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) this.toggle(); });
  }
  async load() {
    if (this.ready) return; const g = this.a.geo, nat = await g.provider.getNational(), d = g.provider.dem, man = g.manifest || await g.provider.getManifest(); this.nat = nat; this.man = man;
    this.b = { w: d.west, e: d.west + d.cols * d.step, n: d.north, s: d.north - d.rows * d.step }; this.cos = Math.cos(-28.6 * Math.PI / 180);
    // hillshaded relief painted once at the DEM resolution
    const c = document.createElement('canvas'); c.width = d.cols; c.height = d.rows; const x = c.getContext('2d'), img = x.createImageData(d.cols, d.rows), D = d.data;
    for (let j = 0; j < d.rows; j++) for (let i = 0; i < d.cols; i++) {
      const h = D[j * d.cols + i], hx = D[j * d.cols + Math.min(d.cols - 1, i + 1)] - D[j * d.cols + Math.max(0, i - 1)], hy = D[Math.min(d.rows - 1, j + 1) * d.cols + i] - D[Math.max(0, j - 1) * d.cols + i];
      const shade = Math.max(0.55, Math.min(1.3, 1 - (hx - hy) / 900)); let r, gg, b;
      if (h <= 0) { const t = Math.min(1, -h / 3000); r = 20 - t * 8; gg = 30 - t * 10; b = 36 - t * 6; } else { const t = Math.min(1, h / 2200); r = 58 + t * 120; gg = 64 + t * 90; b = 52 + t * 70; r *= shade; gg *= shade; b *= shade; }
      const o = (j * d.cols + i) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0); this.relief = c; this.ready = true;
    const chips = this.el.querySelector('#gmp'); chips.innerHTML = '';
    const items = [...Object.entries(man.regions).map(([k, r]) => ({ n: r.name + ' · streets', lat: (r.bbox[0] + r.bbox[2]) / 2, lon: (r.bbox[1] + r.bbox[3]) / 2, region: k })), ...nat.places.filter(p => p.k === 'city').slice(0, 12).map(p => ({ n: p.n + ' · relief', lat: p.lat, lon: p.lon }))];
    for (const it of items) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = it.n; b.onclick = () => this.go(it.lat, it.lon, it.region); chips.appendChild(b); }
  }
  async toggle(on) {
    const open = on == null ? !this.el.classList.contains('on') : on; if (open) { await this.load(); this.el.classList.add('on'); this.size(); this.draw(); this.cv.focus(); } else this.el.classList.remove('on');
  }
  size() { const r = this.cv.parentElement.getBoundingClientRect(), W = Math.min((r.width || 600) - 40, 1000), asp = (this.b.e - this.b.w) * this.cos / (this.b.n - this.b.s), H = Math.min(W / asp, innerHeight * 0.58), w2 = H * asp; const dpr = Math.min(2, devicePixelRatio || 1); this.W = Math.min(W, w2); this.H = H; this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px'; this.cv.width = this.W * dpr; this.cv.height = this.H * dpr; this.dpr = dpr; }
  zoom(f) { this.view.k = Math.max(1, Math.min(60, this.view.k * f)); this.draw(); }
  // lon/lat <-> screen (view.x,y are the map-space centre in 0..1)
  toS(lon, lat) { const u = (lon - this.b.w) / (this.b.e - this.b.w), v = (this.b.n - lat) / (this.b.n - this.b.s), k = this.view.k; return [(u - this.view.x) * this.W * k + this.W / 2, (v - this.view.y) * this.H * k + this.H / 2]; }
  fromS(x, y) { const k = this.view.k, u = (x - this.W / 2) / (this.W * k) + this.view.x, v = (y - this.H / 2) / (this.H * k) + this.view.y; return { lon: this.b.w + u * (this.b.e - this.b.w), lat: this.b.n - v * (this.b.n - this.b.s) }; }
  draw() {
    if (!this.ready) return; const c = this.cv.getContext('2d'), dpr = this.dpr, W = this.W, H = this.H, k = this.view.k;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#0d0c0b'; c.fillRect(0, 0, W, H); c.imageSmoothingEnabled = true;
    const [x0, y0] = this.toS(this.b.w, this.b.n); c.drawImage(this.relief, x0, y0, W * k, H * k);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(237,232,223,.35)'; c.lineWidth = 0.8; for (const line of this.nat.coast) { c.beginPath(); line.forEach(([lo, la], i) => { const [x, y] = this.toS(lo, la); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); }
    c.strokeStyle = 'rgba(214,170,120,.55)'; c.lineWidth = 0.9; for (const r of this.nat.roads) { c.beginPath(); r.p.forEach(([lo, la], i) => { const [x, y] = this.toS(lo, la); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); }
    for (const [key, r] of Object.entries(this.man.regions)) { const [s, w, n, e] = r.bbox, [ax, ay] = this.toS(w, n), [bx, by] = this.toS(e, s); c.strokeStyle = '#ede8df'; c.fillStyle = 'rgba(237,232,223,.18)'; c.lineWidth = 1.5; c.fillRect(ax, ay, Math.max(3, bx - ax), Math.max(3, by - ay)); c.strokeRect(ax - 1, ay - 1, Math.max(5, bx - ax + 2), Math.max(5, by - ay + 2)); void key; }
    c.font = '11px ui-sans-serif,system-ui'; c.textBaseline = 'middle'; const shown = [];
    for (const p of this.nat.places) { if (p.k === 'town' && k < 3) continue; if (shown.length > 60) break; const [x, y] = this.toS(p.lon, p.lat); if (x < 0 || y < 0 || x > W || y > H) continue; if (shown.some(q => Math.hypot(q[0] - x, q[1] - y) < 34)) continue; shown.push([x, y]);
      c.fillStyle = '#ede8df'; c.beginPath(); c.arc(x, y, p.k === 'city' ? 3 : 2, 0, 7); c.fill(); c.fillStyle = 'rgba(237,232,223,.85)'; c.fillText(p.n, x + 6, y); }
    const g = this.a.geo; if (g.active && g.frame) { const ll = g.latLon(), [x, y] = this.toS(ll.lon, ll.lat); c.strokeStyle = '#ffd9a0'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 6, 0, 7); c.stroke(); c.fillStyle = '#ffd9a0'; c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill(); }
  }
  hover(e) { const r = this.cv.getBoundingClientRect(), p = this.fromS(e.clientX - r.left, e.clientY - r.top), reg = this.regionAt(p.lat, p.lon); this.info.textContent = `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)} · ${reg ? reg.r.name + ': streets, buildings, traffic' : 'coarse relief only'}`; }
  regionAt(lat, lon) { for (const [k, r] of Object.entries(this.man.regions)) { const [s, w, n, e] = r.bbox; if (lat >= s && lat <= n && lon >= w && lon <= e) return { k, r }; } return null; }
  pick(e) { const r = this.cv.getBoundingClientRect(), p = this.fromS(e.clientX - r.left, e.clientY - r.top); let best = null, bd = 14; for (const q of this.nat.places) { const [x, y] = this.toS(q.lon, q.lat), d = Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top)); if (d < bd) { bd = d; best = q; } }
    const reg = this.regionAt(p.lat, p.lon); if (reg) this.go(p.lat, p.lon, reg.k); else if (best) this.go(best.lat, best.lon); else this.go(p.lat, p.lon); }
  go(lat, lon, region) { this.toggle(false); const g = this.a.geo; if (g.active) g.exec({ cmd: 'world.goto', lat, lon }, this.a.core); else g.open({ lat, lon, region }).then(() => this.a.ui.brand()); }
}
const a_active = app => app.geo && app.geo.active;
