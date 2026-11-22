/* Model browser: search and browse Sketchfab's downloadable models and bring one straight into the scene.
   Searching is public. Downloading needs the person's own Sketchfab API token (sketchfab.com > Settings > Password & API), kept only in this browser.
   Imported models arrive as ordinary GLB files through the same importer as drag and drop, so they behave like any other object.
   Pure UI plus fetch: openModelBrowser({importFiles, toast}) is the only export that touches the page. */
const API = 'https://api.sketchfab.com/v3';
const KEY = 'n0.sketchfab.token';
export const CATEGORIES = [['', 'All'], ['characters-creatures', 'Characters'], ['architecture', 'Architecture'], ['furniture-home', 'Furniture'], ['cars-vehicles', 'Vehicles'], ['nature-plants', 'Nature'], ['animals-pets', 'Animals'], ['food-drink', 'Food'], ['electronics-gadgets', 'Gadgets'], ['fashion-style', 'Fashion'], ['art-abstract', 'Art'], ['science-technology', 'Science'], ['weapons-military', 'Props']];
export const SORTS = [['-likeCount', 'Most liked'], ['-publishedAt', 'Newest'], ['-viewCount', 'Most viewed'], ['relevance', 'Best match']];

export const token = { get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }, set(v) { try { v ? localStorage.setItem(KEY, v.trim()) : localStorage.removeItem(KEY); } catch (e) {} } };

export const LICENSES = [['', 'Any licence'], ['cc0', 'CC0 (no credit needed)'], ['by', 'CC BY'], ['by-sa', 'CC BY-SA'], ['by-nc', 'CC BY-NC (not commercial)']];
export function searchUrl({ q = '', category = '', sort = '-likeCount', animated = false, staff = false, license = '', count = 24 } = {}) {
  const u = new URL(API + '/search'); const p = u.searchParams;
  p.set('type', 'models'); p.set('downloadable', 'true'); p.set('count', String(count));
  if (q.trim()) p.set('q', q.trim()); if (category) p.set('categories', category);
  if (sort && sort !== 'relevance') p.set('sort_by', sort); if (license) p.set('license', license); if (animated) p.set('animated', 'true'); if (staff) p.set('staffpicked', 'true');
  return u.href;
}
export const thumb = m => { const im = (m.thumbnails && m.thumbnails.images || []).slice().sort((a, b) => a.width - b.width); return (im.find(i => i.width >= 200) || im[im.length - 1] || {}).url || ''; };
export const credit = m => `${m.name} by ${m.user && (m.user.displayName || m.user.username) || 'unknown'}${m.license && m.license.label ? ' (' + m.license.label + ')' : ''}`;

/* a zip from Sketchfab is deflated; the browser can inflate it for us */
export async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf); let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('That download is not a zip file.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [], dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)), st = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true); p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue; let bytes = u8.subarray(st, st + csize);
    if (method === 8) { const ds = new DecompressionStream('deflate-raw'); bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer()); }
    else if (method !== 0) throw new Error('That zip uses a compression this browser cannot open.');
    out.push({ name: name.split('/').pop(), path: name, bytes });
  }
  return out;
}

async function download(uid, tok, onProgress) {
  const r = await fetch(`${API}/models/${uid}/download`, { headers: { Authorization: 'Token ' + tok } });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Sketchfab did not accept that token. Check it at sketchfab.com > Settings > Password & API.'), { code: 'token' });
  if (r.status === 404) throw new Error('The author has not made this model downloadable.');
  if (r.status === 429) throw new Error('Sketchfab says slow down. Try again in a minute.');
  if (!r.ok) throw new Error('Sketchfab could not prepare the download (' + r.status + ').');
  const j = await r.json(), f = j.glb || j.gltf; if (!f || !f.url) throw new Error('This model has no glTF or GLB download.');
  const res = await fetch(f.url); if (!res.ok) throw new Error('The download link failed (' + res.status + ').');
  const total = +res.headers.get('content-length') || f.size || 0, rd = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress && onProgress(got, total); }
  const buf = await new Blob(parts).arrayBuffer(); return { buf, glb: !!j.glb };
}

let ov = null;
export function openModelBrowser({ importFiles, toast = () => {} } = {}) {
  if (ov) { ov.hidden = false; ov.querySelector('input[type=search]').focus(); return; }
  injectCss();
  const st = { q: '', category: '', license: '', sort: '-likeCount', animated: false, staff: true, next: null, busy: false, seq: 0 };
  ov = document.createElement('div'); ov.className = 'sfov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Browse models');
  ov.innerHTML = `<div class="sfp"><div class="sfh"><b>Browse models</b><span class="sfs">Free downloads from Sketchfab. Check each licence before you publish.</span><button class="sfx" aria-label="Close" type="button">✕</button></div>
<form class="sfq"><input type="search" placeholder="Search models: chair, robot, tree…" aria-label="Search models" autocomplete="off"><button class="sfgo" type="submit">Search</button></form>
<div class="sfc" role="group" aria-label="Category"></div>
<div class="sft"><label>Sort <select class="sfsort" aria-label="Sort">${SORTS.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select></label><label>Licence <select class="sflic" aria-label="Licence">${LICENSES.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select></label><button type="button" class="sfa" aria-pressed="false">Animated</button><button type="button" class="sfpick" aria-pressed="true">Staff picks</button><button type="button" class="sftok">API token</button></div>
<div class="sftk" hidden><p>Downloading needs your own free Sketchfab API token. Paste it here; it stays in this browser. <a href="https://sketchfab.com/settings/password" target="_blank" rel="noopener">Get your token</a></p><div><input type="password" class="sftin" placeholder="API token" aria-label="Sketchfab API token" autocomplete="off"><button type="button" class="sfsave">Save</button><button type="button" class="sfclr">Remove</button></div></div>
<div class="sfg" aria-live="polite"></div><div class="sfm"><button type="button" class="sfmore" hidden>Load more</button></div><div class="sfn" role="status"></div></div>`;
  document.body.appendChild(ov);
  const $ = s => ov.querySelector(s), grid = $('.sfg'), note = $('.sfn'), more = $('.sfmore'), tk = $('.sftk'), tin = $('.sftin');
  const close = () => { ov.hidden = true; }; $('.sfx').onclick = close; ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  addEventListener('keydown', e => { if (!ov.hidden && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  const cats = $('.sfc'); for (const [v, l] of CATEGORIES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = l; b.dataset.v = v; b.setAttribute('aria-pressed', v === st.category); b.onclick = () => { st.category = v; cats.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === v)); run(true); }; cats.appendChild(b); }
  $('.sfsort').onchange = e => { st.sort = e.target.value; run(true); }; $('.sflic').onchange = e => { st.license = e.target.value; run(true); };
  const tog = (sel, key) => { const b = $(sel); b.onclick = () => { st[key] = !st[key]; b.setAttribute('aria-pressed', st[key]); run(true); }; }; tog('.sfa', 'animated'); tog('.sfpick', 'staff');
  $('.sftok').onclick = () => { tk.hidden = !tk.hidden; if (!tk.hidden) { tin.value = token.get(); tin.focus(); } };
  $('.sfsave').onclick = () => { token.set(tin.value); toast(token.get() ? 'Sketchfab token saved' : 'Token removed'); if (token.get()) tk.hidden = true; };
  $('.sfclr').onclick = () => { token.set(''); tin.value = ''; toast('Token removed'); };
  $('form.sfq').onsubmit = e => { e.preventDefault(); st.q = $('input[type=search]').value; st.staff = false; $('.sfpick').setAttribute('aria-pressed', 'false'); run(true); };
  more.onclick = () => run(false);

  function card(m) {
    const c = document.createElement('div'); c.className = 'sfcard';
    const im = document.createElement('img'); im.loading = 'lazy'; im.alt = ''; im.src = thumb(m); c.appendChild(im);
    const b = document.createElement('div'); b.className = 'sfb';
    b.innerHTML = '<b></b><span></span><em></em>'; b.children[0].textContent = m.name; b.children[1].textContent = 'by ' + (m.user && (m.user.displayName || m.user.username) || 'unknown'); b.children[2].textContent = [m.license && m.license.label, m.faceCount ? Math.round(m.faceCount / 1000) + 'k faces' : '', m.isAnimated ? 'animated' : ''].filter(Boolean).join(' · ');
    const row = document.createElement('div'); row.className = 'sfr';
    const imp = document.createElement('button'); imp.type = 'button'; imp.className = 'sfimp'; imp.textContent = 'Import';
    const view = document.createElement('a'); view.href = m.viewerUrl || ('https://sketchfab.com/3d-models/' + m.uid); view.target = '_blank'; view.rel = 'noopener'; view.textContent = 'View'; view.setAttribute('aria-label', 'View ' + m.name + ' on Sketchfab');
    row.append(imp, view); b.appendChild(row); c.appendChild(b);
    imp.onclick = () => bring(m, imp); return c;
  }
  async function bring(m, btn) {
    const tok = token.get(); if (!tok) { tk.hidden = false; tin.focus(); note.textContent = 'Add your Sketchfab API token to download. It is free and stays in this browser.'; return; }
    btn.disabled = true; const was = btn.textContent;
    try {
      const { buf, glb } = await download(m.uid, tok, (g, t) => { btn.textContent = t ? Math.round(g / t * 100) + '%' : Math.round(g / 1048576) + ' MB'; });
      let files;
      if (glb) files = [new File([buf], safe(m.name) + '.glb', { type: 'model/gltf-binary' })];
      else { const parts = await unzip(buf), main = parts.find(p => /\.gltf$/i.test(p.name)); if (!main) throw new Error('That download has no glTF file in it.'); files = parts.map(p => new File([p.bytes], p.name)); }
      await importFiles(files); toast('Imported ' + credit(m), 5200); note.textContent = 'Imported ' + credit(m) + '. Keep that credit with your work.'; btn.textContent = 'Imported'; setTimeout(() => { btn.textContent = was; btn.disabled = false; }, 2000);
      close();
    } catch (e) { btn.textContent = was; btn.disabled = false; note.textContent = String(e.message || e); if (e.code === 'token') tk.hidden = false; toast(String(e.message || e), 5200); }
  }
  async function run(fresh) {
    if (st.busy && !fresh) return; const my = ++st.seq; st.busy = true; note.textContent = 'Searching…';
    if (fresh) { grid.replaceChildren(); st.next = null; more.hidden = true; }
    try {
      const url = fresh ? searchUrl(st) : st.next; if (!url) { st.busy = false; return; }
      const r = await fetch(url); if (!r.ok) throw new Error('Sketchfab search failed (' + r.status + '). Try again in a moment.');
      const j = await r.json(); if (my !== st.seq) return;
      (j.results || []).forEach(m => grid.appendChild(card(m))); st.next = j.next || null; more.hidden = !st.next;
      note.textContent = grid.children.length ? '' : 'No downloadable models match that. Try a simpler word.';
    } catch (e) { if (my === st.seq) note.textContent = navigator.onLine ? String(e.message || e) : 'You are offline. Connect to browse models.'; }
    if (my === st.seq) st.busy = false;
  }
  run(true); setTimeout(() => $('input[type=search]').focus(), 50);
}
const safe = s => String(s).replace(/[^\w .-]+/g, '').trim().slice(0, 48) || 'model';

function injectCss() {
  if (document.getElementById('sfcss')) return; const s = document.createElement('style'); s.id = 'sfcss';
  s.textContent = `.sfov{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:rgba(0,0,0,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}.sfov[hidden]{display:none}
.sfp{width:min(980px,100vw - 16px);max-height:calc(100dvh - 16px);display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:22px;background:var(--panel,#14161b);color:var(--ink,#f3f4f7);border:1px solid var(--line,rgba(255,255,255,.14));overflow:auto;padding-bottom:max(14px,env(safe-area-inset-bottom))}
.sfp>*{flex:none}.sfh{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.sfh b{font-size:17px}.sfs{color:var(--mute,#9aa0ac);font-size:12px;flex:1;min-width:180px}.sfx{min-width:44px;min-height:44px;border:0;border-radius:999px;background:var(--raise,#1d2027);color:inherit;font-size:15px}
.sfq{display:flex;gap:8px}.sfq input{flex:1;min-width:0;min-height:44px;padding:0 14px;border-radius:14px;border:1px solid var(--line,rgba(255,255,255,.14));background:var(--raise,#1d2027);color:inherit;font:inherit}
.sfov button{min-height:44px;padding:0 14px;border-radius:999px;border:0;background:var(--raise,#1d2027);color:inherit;font:inherit;font-size:13px;cursor:pointer}.sfov button:focus-visible,.sfov input:focus-visible,.sfov select:focus-visible,.sfov a:focus-visible{outline:2px solid var(--accent,#2f6bff);outline-offset:2px}
.sfov button[aria-pressed=true]{background:var(--ink,#f3f4f7);color:var(--bg,#0b0c0f)}.sfgo,.sfimp,.sfsave{background:var(--accent,#2f6bff)!important;color:var(--on-accent,#fff)!important}
.sfc{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.sfc button{flex:none}.sft{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sft label{display:flex;gap:6px;align-items:center;color:var(--mute,#9aa0ac);font-size:12px}.sft select{max-width:46vw;min-height:44px;border-radius:12px;border:1px solid var(--line,rgba(255,255,255,.14));background:var(--raise,#1d2027);color:inherit;padding:0 10px;font:inherit}
.sftk{padding:10px 12px;border-radius:14px;background:var(--raise,#1d2027);font-size:12.5px}.sftk p{margin:0 0 8px;color:var(--mute,#9aa0ac)}.sftk a{color:var(--ink,#f3f4f7)}.sftk div{display:flex;gap:8px}.sftk input{flex:1;min-width:0;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line,rgba(255,255,255,.14));background:var(--bg,#0b0c0f);color:inherit;font:inherit}
.sfg{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}.sfcard{border-radius:16px;overflow:hidden;background:var(--raise,#1d2027);display:flex;flex-direction:column}.sfcard img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#0b0c0f;display:block}
.sfb{padding:8px 10px 10px;display:flex;flex-direction:column;gap:2px;min-width:0}.sfb b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sfb span,.sfb em{color:var(--mute,#9aa0ac);font-size:11.5px;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sfr{display:flex;gap:8px;align-items:center;margin-top:6px}.sfr .sfimp{flex:1}.sfr a{color:var(--mute,#9aa0ac);font-size:12px;min-height:44px;display:grid;place-items:center;padding:0 6px}.sfm{display:grid;place-items:center}.sfn{color:var(--mute,#9aa0ac);font-size:12.5px;min-height:18px;text-align:center}
@media (prefers-reduced-motion:no-preference){.sfov{animation:sfin .18s ease}@keyframes sfin{from{opacity:0}}}`;
  document.head.appendChild(s);
}
