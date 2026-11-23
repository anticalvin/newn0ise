#!/usr/bin/env python3
"""
n0ise world import: south-africa-latest.osm.pbf -> versioned region packages + a national index.

  pip install osmium numpy pillow
  python3 tools/world/import.py --pbf south-africa-261121.osm.pbf --out data/world/za [--region capetown]

The PBF and the DEM downloads stay out of git (see .gitignore). Output is small JSON/binary, safe to commit.
Elevation is NOT from OSM: it comes from the AWS Open Data "Terrain Tiles" (Terrarium encoding, SRTM/NED/GEBCO mix), fetched at build time.
Every record keeps its OSM id and tags it was derived from; heights that are guessed are flagged hs:"inferred".
"""
import argparse, base64, hashlib, io, json, math, os, struct, sys, time, urllib.request
import numpy as np
import osmium
sys.path.insert(0, os.path.dirname(__file__))
import geo

REGIONS = {
    # south, west, north, east
    'capetown': dict(name='Cape Town', bbox=(-33.990, 18.380, -33.900, 18.470), zone=34, tile=1000, grid=96, dem_zoom=14),
}
ROAD_ORDER = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service',
              'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'pedestrian', 'footway', 'path', 'cycleway', 'steps', 'track']
AREA_KEYS = {('natural', 'water'): 'water', ('natural', 'wood'): 'wood', ('natural', 'scrub'): 'scrub', ('natural', 'beach'): 'beach', ('natural', 'sand'): 'beach',
             ('natural', 'grassland'): 'grass', ('landuse', 'grass'): 'grass', ('landuse', 'forest'): 'wood', ('leisure', 'park'): 'park', ('leisure', 'garden'): 'park',
             ('leisure', 'pitch'): 'pitch', ('landuse', 'residential'): 'residential', ('landuse', 'commercial'): 'commercial', ('landuse', 'retail'): 'commercial',
             ('landuse', 'industrial'): 'industrial', ('landuse', 'cemetery'): 'park', ('natural', 'bare_rock'): 'rock', ('landuse', 'port'): 'industrial'}
NATIONAL_ROADS = {'motorway', 'trunk', 'primary'}
PLACES = {'city', 'town', 'suburb', 'village'}

def dp(pts, eps):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0]), np.array(pts[-1]); d = b - a; L = np.hypot(*d)
    arr = np.array(pts[1:-1])
    dist = np.hypot(*(arr - a).T) if L == 0 else np.abs(d[0] * (arr[:, 1] - a[1]) - d[1] * (arr[:, 0] - a[0])) / L
    i = int(np.argmax(dist))
    if dist[i] > eps: return dp(pts[:i + 2], eps)[:-1] + dp(pts[i + 1:], eps)
    return [pts[0], pts[-1]]

class Pass:
    def __init__(self, regions):
        self.R = regions
        self.coast, self.nroads, self.places = [], [], []
        self.data = {k: dict(roads=[], buildings=[], areas=[], pois=[]) for k in regions}
        self.n = 0
    def inside(self, bbox, coords):
        s, w, n, e = bbox
        return any(w <= lo <= e and s <= la <= n for lo, la in coords)
    def node(self, o):
        t = {x.k: x.v for x in o.tags}
        if 'place' in t and t['place'] in PLACES and 'name' in t and o.location.valid():
            self.places.append(dict(id=o.id, n=t['name'], k=t['place'], lat=round(o.location.lat, 5), lon=round(o.location.lon, 5), pop=int(t['population']) if t.get('population', '').isdigit() else 0))
        if ('shop' in t or t.get('amenity') in ('restaurant', 'cafe', 'bar', 'fuel', 'pharmacy', 'bank', 'marketplace', 'fast_food', 'hospital', 'school', 'police')) and o.location.valid():
            lo, la = o.location.lon, o.location.lat
            for k, r in self.R.items():
                s, w, n, e = r['bbox']
                if w <= lo <= e and s <= la <= n:
                    self.data[k]['pois'].append(dict(id=o.id, lat=la, lon=lo, k=t.get('shop') and 'shop:' + t['shop'] or 'amenity:' + t.get('amenity', ''), n=t.get('name', ''), tags={q: t[q] for q in ('brand', 'opening_hours', 'level') if q in t}))
    def way(self, o):
        t = {x.k: x.v for x in o.tags}; self.n += 1
        if self.n % 500000 == 0: print('  ways', self.n, file=sys.stderr)
        hw, bd = t.get('highway'), t.get('building')
        nat = t.get('natural')
        if nat == 'coastline':
            try: self.coast.append([(n.lon, n.lat) for n in o.nodes])
            except osmium.InvalidLocationError: pass
            return
        if not (hw or bd or any((k, t.get(k)) in AREA_KEYS for k in ('natural', 'landuse', 'leisure'))): return
        try: pts = [(n.lon, n.lat) for n in o.nodes]
        except osmium.InvalidLocationError: return
        if hw in NATIONAL_ROADS: self.nroads.append(dict(c=hw, p=pts, n=t.get('ref', t.get('name', ''))))
        for k, r in self.R.items():
            if not self.inside(r['bbox'], pts): continue
            d = self.data[k]; tags = dict(t)
            if hw and hw in ROAD_ORDER:
                d['roads'].append(dict(id=o.id, c=hw, p=pts, tags={q: tags[q] for q in ('name', 'oneway', 'lanes', 'maxspeed', 'surface', 'bridge', 'tunnel', 'sidewalk', 'cycleway', 'lit', 'ref', 'layer') if q in tags}))
            elif bd and o.is_closed():
                d['buildings'].append(dict(id=o.id, p=pts, tags={q: tags[q] for q in ('building', 'height', 'building:levels', 'roof:shape', 'roof:levels', 'min_height', 'name', 'shop', 'amenity', 'addr:housenumber', 'building:colour', 'roof:colour') if q in tags}))
            elif o.is_closed():
                for kk in ('natural', 'landuse', 'leisure'):
                    kind = AREA_KEYS.get((kk, tags.get(kk)))
                    if kind: d['areas'].append(dict(id=o.id, k=kind, p=pts)); break

def mercator_px(lat, lon, z):
    n = 2 ** z * 256; x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def fetch_terrarium(z, x, y, cache):
    p = os.path.join(cache, f'{z}_{x}_{y}.png')
    if not os.path.exists(p):
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'n0ise-world-import/1'}), timeout=60) as r, open(p, 'wb') as f: f.write(r.read())
                break
            except Exception as e:
                if attempt == 2: raise
                time.sleep(2)
    from PIL import Image
    a = np.array(Image.open(p).convert('RGB'), dtype=np.float64)
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768

class Dem:
    """Mosaic of Terrarium tiles at one zoom, sampled bilinearly by lat/lon."""
    def __init__(self, z, bounds, cache, cubic=False):
        s, w, n, e = bounds; self.z = z; self.cubic = cubic
        x0, y1 = mercator_px(s, w, z); x1, y0 = mercator_px(n, e, z)
        self.tx0, self.tx1, self.ty0, self.ty1 = int(x0 // 256) - 1, int(x1 // 256) + 1, int(y0 // 256) - 1, int(y1 // 256) + 1
        w_, h_ = (self.tx1 - self.tx0 + 1) * 256, (self.ty1 - self.ty0 + 1) * 256
        self.a = np.zeros((h_, w_))
        for ty in range(self.ty0, self.ty1 + 1):
            for tx in range(self.tx0, self.tx1 + 1):
                self.a[(ty - self.ty0) * 256:(ty - self.ty0 + 1) * 256, (tx - self.tx0) * 256:(tx - self.tx0 + 1) * 256] = fetch_terrarium(z, tx, ty, cache)
    meta = property(lambda self: dict(name='AWS Terrain Tiles (Terrarium)', kind='terrarium', zoom=self.z, native='SRTM ~30 m (NED/GEBCO elsewhere); zoom-%d grid is resampled' % self.z,
        interpolation='catmull-rom' if self.cubic else 'bilinear', license='Public/open sources, see https://github.com/tilezen/joerd/blob/master/docs/attribution.md', redistributable=True, version='live tiles fetched ' + time.strftime('%Y-%m-%d')))
    def sample(self, lat, lon):
        if self.cubic: return self._cubic(lat, lon)
        lat, lon = np.asarray(lat), np.asarray(lon); n = 2 ** self.z * 256
        x = (lon + 180) / 360 * n - self.tx0 * 256 - .5
        y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - self.ty0 * 256 - .5
        x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int); fx, fy = x - x0, y - y0
        a = self.a; x0 = np.clip(x0, 0, a.shape[1] - 2); y0 = np.clip(y0, 0, a.shape[0] - 2)
        return a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy) + a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy

def _cubic(self, lat, lon):
    lat, lon = np.asarray(lat), np.asarray(lon); n = 2 ** self.z * 256
    x = (lon + 180) / 360 * n - self.tx0 * 256 - .5
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - self.ty0 * 256 - .5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int); fx, fy = x - x0, y - y0; a = self.a
    def w(t): return [(-t**3 + 2*t**2 - t) / 2, (3*t**3 - 5*t**2 + 2) / 2, (-3*t**3 + 4*t**2 + t) / 2, (t**3 - t**2) / 2]
    wx, wy = w(fx), w(fy); out = 0
    for j in range(4):
        row = 0
        for i in range(4): row = row + wx[i] * a[np.clip(y0 + j - 1, 0, a.shape[0] - 1), np.clip(x0 + i - 1, 0, a.shape[1] - 1)]
        out = out + wy[j] * row
    return out
Dem._cubic = _cubic

class GeoTiffDem:
    """Optional user-supplied DEM/DTM (GeoTIFF, metres). Needs `pip install rasterio`. NOT redistributed: only used if --dem is given, and the manifest records it as local-only."""
    def __init__(self, path, license='unspecified (local R&D input)', name=None):
        import rasterio
        self.ds = rasterio.open(path); self.a = self.ds.read(1).astype(np.float64); nd = self.ds.nodata
        if nd is not None: self.a[self.a == nd] = np.nan
        self.path = path; self.license = license; self.name = name or os.path.basename(path)
    meta = property(lambda self: dict(name=self.name, kind='geotiff', native='%.1f m pixels' % abs(self.ds.res[0] * (111320 if self.ds.crs.is_geographic else 1)), interpolation='bilinear', license=self.license, redistributable=False, version=os.path.basename(self.path)))
    def sample(self, lat, lon):
        from rasterio.warp import transform
        xs, ys = transform('EPSG:4326', self.ds.crs, np.asarray(lon).ravel().tolist(), np.asarray(lat).ravel().tolist())
        r, c = self.ds.index(np.array(xs), np.array(ys)); r = np.clip(np.array(r), 0, self.a.shape[0] - 1); c = np.clip(np.array(c), 0, self.a.shape[1] - 1)
        v = self.a[r, c].reshape(np.shape(lat)); return np.where(np.isnan(v), 0, v)

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()

def dm(v): return int(round(v * 10))

def split_polyline(pts, tile, tiles):
    """Cut a local-metre polyline at tile edges. Each piece starts and ends exactly on the edge, so roads join across tiles."""
    runs = {}
    cur_key, cur = None, []
    def flush():
        nonlocal cur, cur_key
        if cur_key is not None and len(cur) >= 2 and cur_key in tiles: runs.setdefault(cur_key, []).append(cur)
        cur = []
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        ts = [0.0, 1.0]
        for a_, b_ in ((ax, bx), (az, bz)):
            if a_ == b_: continue
            lo, hi = sorted((a_, b_))
            for k in range(math.floor(lo / tile) + 1, math.floor(hi / tile) + 1):
                t = (k * tile - a_) / (b_ - a_)
                if 0 < t < 1: ts.append(t)
        ts = sorted(set(ts))
        for t0, t1 in zip(ts, ts[1:]):
            p0 = (ax + (bx - ax) * t0, az + (bz - az) * t0); p1 = (ax + (bx - ax) * t1, az + (bz - az) * t1)
            mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); key = (math.floor(mid[0] / tile), math.floor(mid[1] / tile))
            if key != cur_key: flush(); cur_key = key; cur = [p0]
            cur.append(p1)
    flush()
    return runs

DEMSRC = None
def terrain_meta(dem, T, G): return dict(dem.meta, grid=G, spacingM=round(T / G, 2), lods=[1, 3, 8], heightUnit='decimetres int16')

def terrain_only(a):
    """Rewrite only the elevation of existing tile files + manifest provenance. Roads/buildings/areas are untouched (no OSM pass)."""
    mp = os.path.join(a.out, 'manifest.json'); man = json.load(open(mp))
    for key, r in man['regions'].items():
        if a.region and key not in a.region: continue
        spec = REGIONS.get(key, {}); G = spec.get('grid', r['grid']); T = r['tile']; zone = r['zone']; E0, N0 = r['e0'], r['n0']
        s, w, n, e = r['bbox']; pad = .02
        dem = DEMSRC or Dem(spec.get('dem_zoom', 13), (s - pad, w - pad, n + pad, e + pad), a.cache, cubic=True)
        xs = np.arange(G + 1) * (T / G)
        for k, ent in r['tiles'].items():
            i, j = map(int, k.split('_')); p = os.path.join(a.out, ent['file']); rec = json.load(open(p))
            gx, gz = np.meshgrid(i * T + xs, j * T + xs); lat = np.zeros_like(gx); lon = np.zeros_like(gx)
            for q in range(gx.shape[0]):
                for b in range(gx.shape[1]): lat[q, b], lon[q, b] = geo.inv(E0 + gx[q, b], N0 - gz[q, b], zone)
            hm = np.clip(np.round(dem.sample(lat, lon) * 10), -3000, 32000).astype('<i2')
            rec.update(grid=G, hm=base64.b64encode(hm.tobytes()).decode())
            with open(p, 'w') as f: json.dump(rec, f, separators=(',', ':'))
            ent.update(bytes=os.path.getsize(p), sha256=sha(p))
        r['grid'] = G; r['terrain'] = terrain_meta(dem, T, G); print('terrain rewritten for', key, file=sys.stderr)
    man['generated'] = time.strftime('%Y-%m-%d'); json.dump(man, open(mp, 'w'), indent=1)

def build_region(key, r, d, out, cache):
    s, w, n, e = r['bbox']; zone = r['zone']; T = r['tile']; G = r['grid']
    # origin: projected centre, rounded to a whole kilometre so tile edges sit on round numbers
    ce, cn = geo.fwd((s + n) / 2, (w + e) / 2, zone); E0, N0 = round(ce / 1000) * 1000, round(cn / 1000) * 1000
    def loc(lat, lon): E, N = geo.fwd(lat, lon, zone); return (E - E0, -(N - N0))
    corners = [loc(s, w), loc(s, e), loc(n, w), loc(n, e)]
    tx0, tx1 = math.floor(min(c[0] for c in corners) / T), math.floor(max(c[0] for c in corners) / T)
    tz0, tz1 = math.floor(min(c[1] for c in corners) / T), math.floor(max(c[1] for c in corners) / T)
    tiles = {(i, j) for i in range(tx0, tx1 + 1) for j in range(tz0, tz1 + 1)}
    print(f'[{key}] origin UTM{zone}S E{E0} N{N0}; tiles x {tx0}..{tx1} z {tz0}..{tz1} = {len(tiles)}', file=sys.stderr)
    # elevation
    pad = .02; dem = DEMSRC or Dem(r.get('dem_zoom', 13), (s - pad, w - pad, n + pad, e + pad), cache, cubic=True)
    tdata = {k: dict(roads=[], buildings=[], areas=[], pois=[]) for k in tiles}
    for road in d['roads']:
        pts = [loc(la, lo) for lo, la in road['p']]
        for tk, runs in split_polyline(pts, T, tiles).items():
            ox, oz = tk[0] * T, tk[1] * T
            for run in runs:
                tdata[tk]['roads'].append(dict(id=road['id'], c=road['c'], p=[v for x, z in run for v in (dm(x - ox), dm(z - oz))], **{q: v for q, v in road['tags'].items()}))
    nb = 0
    for b in d['buildings']:
        pts = [loc(la, lo) for lo, la in b['p'][:-1]]
        if len(pts) < 3: continue
        cx, cz = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts); tk = (math.floor(cx / T), math.floor(cz / T))
        if tk not in tiles: continue
        t = b['tags']; ox, oz = tk[0] * T, tk[1] * T
        h = None; hs = 'inferred'
        try:
            if 'height' in t: h = float(str(t['height']).split()[0].replace(',', '.')); hs = 'tag'
            elif 'building:levels' in t: h = float(t['building:levels']) * 3.2 + 1.0; hs = 'levels'
        except ValueError: h = None; hs = 'inferred'
        if h is None:
            hh = (b['id'] * 2654435761) % 1000 / 1000   # deterministic, stable between imports
            kind = t.get('building', 'yes')
            h = {'house': 5.5 + hh * 2.5, 'detached': 5.5 + hh * 2.5, 'residential': 7 + hh * 8, 'apartments': 12 + hh * 18, 'commercial': 10 + hh * 25, 'office': 14 + hh * 40, 'retail': 5 + hh * 3, 'industrial': 7 + hh * 4, 'warehouse': 8 + hh * 3}.get(kind, 6 + hh * 6)
        h = max(2.5, min(h, 320))
        rec = dict(id=b['id'], k=t.get('building', 'yes'), h=round(h, 1), hs=hs, p=[v for x, z in pts for v in (dm(x - ox), dm(z - oz))])
        for q, name in (('roof:shape', 'rs'), ('building:levels', 'lv'), ('name', 'n'), ('shop', 'shop'), ('amenity', 'am'), ('building:colour', 'col')):
            if q in t: rec[name] = t[q]
        tdata[tk]['buildings'].append(rec); nb += 1
    for a in d['areas']:
        pts = [loc(la, lo) for lo, la in a['p'][:-1]]
        if len(pts) < 3: continue
        cx, cz = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts); tk = (math.floor(cx / T), math.floor(cz / T))
        if tk not in tiles: continue
        ox, oz = tk[0] * T, tk[1] * T
        tdata[tk]['areas'].append(dict(id=a['id'], k=a['k'], p=[v for x, z in pts for v in (dm(x - ox), dm(z - oz))]))
    for poi in d['pois']:
        x, z = loc(poi['lat'], poi['lon']); tk = (math.floor(x / T), math.floor(z / T))
        if tk in tiles: tdata[tk]['pois'].append(dict(id=poi['id'], x=dm(x - tk[0] * T), z=dm(z - tk[1] * T), k=poi['k'], n=poi['n']))
    os.makedirs(os.path.join(out, key), exist_ok=True)
    files = {}
    xs = np.arange(G + 1) * (T / G)
    for (i, j), rec in sorted(tdata.items()):
        gx, gz = np.meshgrid(i * T + xs, j * T + xs)             # rows are z, columns are x
        lat = np.zeros_like(gx); lon = np.zeros_like(gx)
        for a in range(gx.shape[0]):
            for b in range(gx.shape[1]):
                lat[a, b], lon[a, b] = geo.inv(E0 + gx[a, b], N0 - gz[a, b], zone)
        hm = np.clip(np.round(dem.sample(lat, lon) * 10), -3000, 32000).astype('<i2')
        rec.update(v=1, tx=i, tz=j, size=T, grid=G, hm=base64.b64encode(hm.tobytes()).decode())
        p = os.path.join(out, key, f't_{i}_{j}.json')
        with open(p, 'w') as f: json.dump(rec, f, separators=(',', ':'))
        files[f'{i}_{j}'] = dict(file=f'{key}/t_{i}_{j}.json', bytes=os.path.getsize(p), sha256=sha(p), roads=len(rec['roads']), buildings=len(rec['buildings']))
    return dict(name=r['name'], bbox=r['bbox'], zone=zone, south=True, e0=E0, n0=N0, tile=T, grid=G, terrain=terrain_meta(dem, T, G), tiles=files,
                counts=dict(roads=len(d['roads']), buildings=nb, areas=len(d['areas']), pois=len(d['pois'])))

def national_dem(out, cache):
    """Coarse relief for the whole country: 0.025 degree grid, int16 metres."""
    s, w, n, e = -35.2, 16.2, -21.9, 33.1; step = .025
    dem = Dem(7, (s, w, n, e), cache)
    lats = np.arange(n, s, -step); lons = np.arange(w, e, step); LON, LAT = np.meshgrid(lons, lats)
    hm = np.clip(np.round(dem.sample(LAT, LON)), -6000, 6000).astype('<i2')
    p = os.path.join(out, 'national_dem.bin')
    with open(p, 'wb') as f: f.write(hm.tobytes())
    return dict(file='national_dem.bin', west=w, north=n, step=step, cols=len(lons), rows=len(lats), unit='m', encoding='int16le row-major from the north-west', bytes=os.path.getsize(p), sha256=sha(p))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--pbf'); ap.add_argument('--out', default='data/world/za'); ap.add_argument('--region', action='append'); ap.add_argument('--cache', default='tmp/world-cache')
    ap.add_argument('--dem', help='optional local GeoTIFF DEM/DTM (not redistributed)'); ap.add_argument('--dem-license', default='unspecified (local R&D input)'); ap.add_argument('--terrain-only', action='store_true', help='rewrite elevation only, keep existing OSM data')
    a = ap.parse_args(); global DEMSRC
    if not a.pbf and not a.terrain_only: ap.error('--pbf is required')
    if a.dem: DEMSRC = GeoTiffDem(a.dem, a.dem_license)
    if a.terrain_only: os.makedirs(a.cache, exist_ok=True); return terrain_only(a)
    os.makedirs(a.out, exist_ok=True); os.makedirs(a.cache, exist_ok=True)
    keys = a.region or list(REGIONS); regs = {k: REGIONS[k] for k in keys}
    t0 = time.time(); h = Pass(regs)
    print('reading OSM (takes a few minutes)...', file=sys.stderr)
    for o in osmium.FileProcessor(a.pbf).with_locations().with_filter(osmium.filter.EmptyTagFilter()):
        if o.is_node(): h.node(o)
        elif o.is_way(): h.way(o)
    print(f'osm pass done in {time.time() - t0:.0f}s', {k: {q: len(v) for q, v in d.items()} for k, d in h.data.items()}, 'coast', len(h.coast), file=sys.stderr)
    manifest = dict(format='n0ise.world.manifest', version=1, country='South Africa', generated=time.strftime('%Y-%m-%d'),
        source=dict(osm=os.path.basename(a.pbf), osmSha256=sha(a.pbf), license='ODbL 1.0', attribution='© OpenStreetMap contributors', dem='AWS Terrain Tiles (Terrarium): SRTM, NED, GEBCO and others. See https://github.com/tilezen/joerd/blob/master/docs/attribution.md'),
        regions={})
    for k, r in regs.items(): manifest['regions'][k] = build_region(k, r, h.data[k], a.out, a.cache)
    # national index: simplified coastline, trunk network, places, relief
    coast = [[(round(lo, 3), round(la, 3)) for lo, la in dp(line, .004)] for line in h.coast if len(line) > 3]
    coast = [c for c in coast if len(c) >= 2]
    nroads = [dict(c=r['c'], n=r['n'], p=[(round(lo, 3), round(la, 3)) for lo, la in dp(r['p'], .004)]) for r in h.nroads]
    places = sorted(h.places, key=lambda p: ({'city': 0, 'town': 1, 'suburb': 2, 'village': 3}[p['k']], -p['pop']))
    places = [p for p in places if p['k'] in ('city', 'town')][:900]
    nat = dict(format='n0ise.world.national', version=1, coast=coast, roads=nroads, places=places, regions={k: dict(name=r['name'], bbox=r['bbox']) for k, r in regs.items()})
    p = os.path.join(a.out, 'national.json')
    with open(p, 'w') as f: json.dump(nat, f, separators=(',', ':'))
    manifest['national'] = dict(file='national.json', bytes=os.path.getsize(p), sha256=sha(p), dem=national_dem(a.out, a.cache))
    with open(os.path.join(a.out, 'manifest.json'), 'w') as f: json.dump(manifest, f, indent=1)
    print(f'done in {time.time() - t0:.0f}s', file=sys.stderr)

if __name__ == '__main__': main()
