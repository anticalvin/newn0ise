'use strict';
/* Key colours of a picture: a small k-means in RGB over a downsampled copy, seeded by the most common colours so it is stable, then sorted by how much of the picture each covers.
   Near-duplicates are merged and almost transparent pixels are ignored. Pure maths on RGBA data, so it runs (and is tested) without a DOM. */
const StudioPalette = (() => {
  const hex = c => '#'+c.map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const dist2 = (a,b) => (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
  function extract(data,count = 6,minDistance = 34) {
    const hist = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] < 128) continue;
      const k = (data[i] >> 3) << 10 | (data[i+1] >> 3) << 5 | (data[i+2] >> 3);       /* 32 levels per channel */
      hist.set(k,(hist.get(k) || 0)+1);
    }
    const bins = [...hist.entries()].map(([k,n]) => ({c:[(k >> 10 & 31)*8+4,(k >> 5 & 31)*8+4,(k & 31)*8+4],n})).sort((a,b) => b.n-a.n);
    if (!bins.length) return [];
    /* seed: the most common colour, then repeatedly the colour farthest from the chosen ones, weighted by how common it is */
    const centres = [bins[0].c.slice()], want = Math.min(count*2,bins.length);
    while (centres.length < want) {
      let best = null, bs = -1; for (const b of bins) { const d = Math.min(...centres.map(c => dist2(c,b.c))); const sc = d*Math.sqrt(b.n); if (sc > bs) { bs = sc; best = b; } }
      if (!best || bs <= 0) break; centres.push(best.c.slice());
    }
    for (let it = 0; it < 8; it++) {
      const sum = centres.map(() => [0,0,0,0]);
      for (const b of bins) { let j = 0,m = Infinity; centres.forEach((c,i) => { const d = dist2(c,b.c); if (d < m) { m = d; j = i; } }); const s = sum[j]; s[0] += b.c[0]*b.n; s[1] += b.c[1]*b.n; s[2] += b.c[2]*b.n; s[3] += b.n; }
      sum.forEach((s,i) => { if (s[3]) centres[i] = [s[0]/s[3],s[1]/s[3],s[2]/s[3]]; });
    }
    const weight = centres.map(() => 0); for (const b of bins) { let j = 0,m = Infinity; centres.forEach((c,i) => { const d = dist2(c,b.c); if (d < m) { m = d; j = i; } }); weight[j] += b.n; }
    const ranked = centres.map((c,i) => ({c,n:weight[i]})).filter(x => x.n > 0).sort((a,b) => b.n-a.n), out = [];
    for (const r of ranked) { if (out.every(o => Math.sqrt(dist2(o.c,r.c)) >= minDistance)) out.push(r); if (out.length >= count) break; }
    return out.map(o => hex(o.c));
  }
  return {extract,hex};
})();
