"""WGS84 <-> UTM (transverse Mercator, Kruger series). Mirrors src/core/geo/georef.js; tools/world/check_geo.mjs compares both."""
import math
A = 6378137.0; F = 1 / 298.257223563; K0 = 0.9996
N = F / (2 - F)
AA = A / (1 + N) * (1 + N**2 / 4 + N**4 / 64)
AL = [N / 2 - 2 * N**2 / 3 + 5 * N**3 / 16, 13 * N**2 / 48 - 3 * N**3 / 5, 61 * N**3 / 240]
BE = [N / 2 - 2 * N**2 / 3 + 37 * N**3 / 96, N**2 / 48 + N**3 / 15, 17 * N**3 / 480]
DE = [2 * N - 2 * N**2 / 3 - 2 * N**3, 7 * N**2 / 3 - 8 * N**3 / 5, 56 * N**3 / 15]

def zone_of(lon): return int((lon + 180) // 6) + 1
def cm_of(zone): return zone * 6 - 183

def fwd(lat, lon, zone):
    phi, lam = math.radians(lat), math.radians(lon - cm_of(zone))
    c = 2 * math.sqrt(N) / (1 + N)
    t = math.sinh(math.atanh(math.sin(phi)) - c * math.atanh(c * math.sin(phi)))
    xi = math.atan2(t, math.cos(lam)); eta = math.atanh(math.sin(lam) / math.sqrt(1 + t * t))
    e = 500000 + K0 * AA * (eta + sum(AL[j] * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta) for j in range(3)))
    n = K0 * AA * (xi + sum(AL[j] * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta) for j in range(3)))
    return e, (n + 10000000 if lat < 0 else n)

def inv(e, n, zone, south=True):
    n0 = n - 10000000 if south else n
    xi = n0 / (K0 * AA); eta = (e - 500000) / (K0 * AA)
    xp = xi - sum(BE[j] * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta) for j in range(3))
    ep = eta - sum(BE[j] * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta) for j in range(3))
    chi = math.asin(math.sin(xp) / math.cosh(ep))
    phi = chi + sum(DE[j] * math.sin(2 * (j + 1) * chi) for j in range(3))
    lam = math.atan2(math.sinh(ep), math.cos(xp))
    return math.degrees(phi), cm_of(zone) + math.degrees(lam)
