// GeoReference: WGS84 <-> UTM (Kruger series), explicit zones. Global positions are double precision UTM metres; the renderer only ever sees small local floats.
const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996, N = F / (2 - F);
const AA = A / (1 + N) * (1 + N ** 2 / 4 + N ** 4 / 64);
const AL = [N / 2 - 2 * N ** 2 / 3 + 5 * N ** 3 / 16, 13 * N ** 2 / 48 - 3 * N ** 3 / 5, 61 * N ** 3 / 240];
const BE = [N / 2 - 2 * N ** 2 / 3 + 37 * N ** 3 / 96, N ** 2 / 48 + N ** 3 / 15, 17 * N ** 3 / 480];
const DE = [2 * N - 2 * N ** 2 / 3 - 2 * N ** 3, 7 * N ** 2 / 3 - 8 * N ** 3 / 5, 56 * N ** 3 / 15];
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
export const zoneOf = lon => Math.floor((lon + 180) / 6) + 1;
export const centralMeridian = zone => zone * 6 - 183;
export function fromLatLon(lat, lon, zone = zoneOf(lon)) {
  const phi = rad(lat), lam = rad(lon - centralMeridian(zone)), c = 2 * Math.sqrt(N) / (1 + N);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let e = eta, n = xi;
  for (let j = 1; j <= 3; j++) { e += AL[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); n += AL[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return { e: 500000 + K0 * AA * e, n: K0 * AA * n + (lat < 0 ? 1e7 : 0), zone };
}
export function toLatLon(e, n, zone, south = true) {
  const xi = (south ? n - 1e7 : n) / (K0 * AA), eta = (e - 500000) / (K0 * AA);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) { xp -= BE[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= BE[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep)); let phi = chi;
  for (let j = 1; j <= 3; j++) phi += DE[j - 1] * Math.sin(2 * j * chi);
  return { lat: deg(phi), lon: centralMeridian(zone) + deg(Math.atan2(Math.sinh(ep), Math.cos(xp))) };
}
/* A region's local frame: x east, z south (so north is -z, matching Three.js), metres from the region origin. Doubles in, floats out. */
export class RegionFrame {
  constructor(zone, e0, n0, south = true) { this.zone = zone; this.e0 = e0; this.n0 = n0; this.south = south; }
  toLocal(lat, lon) { const p = fromLatLon(lat, lon, this.zone); return { x: p.e - this.e0, z: -(p.n - this.n0) }; }
  toLatLon(x, z) { return toLatLon(this.e0 + x, this.n0 - z, this.zone, this.south); }
}
