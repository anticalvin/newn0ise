/* n0ise Studio Motion: the timeline view. It is an option beside Canvas / Split / Graph / Spatial and opens by itself when a video
   is imported. One row per Studio layer; each clip is that layer's time range (start, dur) and, for video, its trim into the file.
   Everything edits the same document through window.n0iseMotion (undo, save, graph and inspector all keep working). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  if (!stage || $('nst-timeline')) return;
  const M = () => window.n0iseMotion;
  const doc = () => M().doc;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clipOf = l => ({ start: l.start ?? 0, dur: l.dur ?? doc().duration });
  const fps = () => doc().fps || 30;
  const MIN = 0.1;

  /* ---- video files survive reloads in IndexedDB (a saved .json project keeps layout only) ---- */
  const idb = () => new Promise((res, rej) => { const q = indexedDB.open('n0ise-media', 1); q.onupgradeneeded = () => q.result.createObjectStore('b'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const mediaPut = async (id, blob) => { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('b', 'readwrite'); tx.objectStore('b').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch {} };
  const mediaGet = async id => { try { const db = await idb(); return await new Promise(res => { const r = db.transaction('b').objectStore('b').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch { return null; } };
  const missing = new Set(), loading = new Set();
  function ensureMedia(l) {
    if (M().R.media.has(l.videoId) || loading.has(l.videoId)) return;
    loading.add(l.videoId);
    mediaGet(l.videoId).then(blob => {
      loading.delete(l.videoId);
      if (blob) { M().R.media.register(l.videoId, blob); missing.delete(l.videoId); M().schedule(); } else missing.add(l.videoId);
      queueRefresh();
    });
  }

  /* ---- panel ---- */
  const toggle = el('button', 'nst-toggle', '◷ Timeline');
  toggle.type = 'button'; toggle.title = 'Show or hide the timeline (Shift T)';
  toggle.setAttribute('aria-expanded', 'false');
  $('viewtabs')?.after(toggle);
  const panel = el('section', 'nst-timeline');
  panel.id = 'nst-timeline'; panel.hidden = true; panel.setAttribute('aria-label', 'Studio timeline');
  panel.innerHTML = `
    <div class="nst-top">
      <div class="nst-left"><span class="nst-kicker">TIMELINE</span><span class="nst-sequence" id="nst-seq"></span></div>
      <div class="nst-actions">
        <button data-nst="back" title="Back to start (Home)" aria-label="Back to start">|◀</button>
        <button data-nst="play" title="Play or pause (Space)" aria-label="Play">▶</button>
        <span class="nst-time" id="nst-clock">00:00:00:00</span>
        <span class="nst-sep"></span>
        <button data-nst="split" title="Split at playhead (S)" aria-label="Split at playhead">✂</button>
        <button data-nst="delete" title="Delete selected clip" aria-label="Delete selected clip">⌫</button>
        <button data-nst="loop" title="Loop playback" aria-label="Loop" aria-pressed="false">↻</button>
        <span class="nst-sep"></span>
        <button data-nst="zoomout" title="Zoom out" aria-label="Zoom out">−</button>
        <button data-nst="zoomin" title="Zoom in" aria-label="Zoom in">+</button>
        <label class="nst-duration">LENGTH <input id="nst-length" type="number" min="1" max="600" step="1" value="8" aria-label="Timeline length in seconds">s</label>
        <button class="nst-export" data-nst="export" title="Record the timeline to a video file">Export video</button>
        <button data-nst="close" title="Close timeline" aria-label="Close timeline">×</button>
      </div>
    </div>
    <div class="nst-content" id="nst-content">
      <div class="nst-body">
        <div class="nst-names" id="nst-names"></div>
        <div class="nst-scroll" id="nst-scroll"><div class="nst-canvas" id="nst-canvas"></div></div>
      </div>
    </div>
    <div class="nst-bottom"><span id="nst-status"></span><span>DRAG CLIPS TO MOVE · DRAG EDGES TO TRIM · DRAG THE RULER TO SCRUB</span></div>`;
  stage.append(panel);

  let open = false, playing = false, loop = false, pps = 60, raf = 0, t0 = 0, drag = null, exporting = false, pending = 0;
  const q = s => panel.querySelector(s);
  const status = msg => { q('#nst-status').textContent = msg; };
  const time = () => doc().time || 0;
  const fmt = t => { const r = fps(), f = Math.max(0, Math.round(t * r)), s = Math.floor(f / r); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, f % r].map(v => String(v).padStart(2, '0')).join(':'); };

  function setOpen(v) {
    open = v; panel.hidden = !v;
    stage.classList.toggle('nst-open', v);
    toggle.classList.toggle('nst-active', v); toggle.setAttribute('aria-expanded', v);
    if (v) refresh(); else pause();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  toggle.onclick = () => setOpen(!open);

  /* ---- playback: one wall clock drives doc.time; videos follow it ---- */
  let actx = null, adest = null; const tapped = new WeakSet();
  function tap(v) { /* route the clip's sound through one audio graph so Export can record it */
    try {
      if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); adest = actx.createMediaStreamDestination(); }
      if (actx.state === 'suspended') actx.resume();
      if (!tapped.has(v)) { const n = actx.createMediaElementSource(v); n.connect(actx.destination); n.connect(adest); tapped.add(v); }
    } catch {}
  }
  function syncVideos(t, play) {
    for (const l of doc().layers) {
      if (l.type !== 'video') continue;
      ensureMedia(l);
      const v = M().R.media.video(l);
      if (!v) continue;
      const c = clipOf(l), on = l.visible && t >= c.start && t < c.start + c.dur, want = (l.trim || 0) + (t - c.start);
      v.volume = clamp(l.volume ?? 1, 0, 1);
      v.muted = !!l.muted || !play;
      if (on) {
        if (play) {
          tap(v);
          if (Math.abs(v.currentTime - want) > 0.6) v.currentTime = want;
          if (v.paused) v.play().catch(() => {});
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - want) > 0.02) v.currentTime = want;
        }
      } else if (!v.paused) v.pause();
    }
  }
  function seek(t) {
    const d = doc(); t = clamp(t, 0, d.duration);
    M().setTime(t);
    syncVideos(t, false);
    paintHead();
  }
  function tick(now) {
    if (!playing) return;
    let t = (now - t0) / 1000;
    /* the playing video is the master clock: ease the timeline toward it so frames are never skipped or re-seeked */
    for (const l of doc().layers) {
      if (l.type !== 'video' || !l.visible) continue;
      const v = M().R.media.video(l), c = clipOf(l);
      if (!v || v.paused || v.readyState < 2 || t < c.start || t >= c.start + c.dur) continue;
      const tv = c.start + v.currentTime - (l.trim || 0);
      if (Math.abs(tv - t) > 0.5) break;
      t0 -= (tv - t) * 1000 * 0.35; t += (tv - t) * 0.35;
      break;
    }
    const d = doc().duration;
    if (t >= d) {
      if (loop && !exporting) { t0 = now; t = 0; } else { M().setTime(d); pause(); paintHead(); onEnd?.(); return; }
    }
    syncVideos(t, true);
    M().setTime(t, true);
    paintHead();
    raf = requestAnimationFrame(tick);
  }
  let onEnd = null;
  function play() {
    if (playing) return;
    if (time() >= doc().duration - 0.02) M().setTime(0);
    playing = true;
    t0 = performance.now() - time() * 1000;
    q('[data-nst=play]').textContent = '❚❚'; q('[data-nst=play]').setAttribute('aria-label', 'Pause');
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false; cancelAnimationFrame(raf);
    const b = q('[data-nst=play]'); b.textContent = '▶'; b.setAttribute('aria-label', 'Play');
    if (doc()) syncVideos(time(), false);
  }

  /* ---- drawing the rows ---- */
  const x = t => t * pps;
  const visibleW = () => Math.max(q('#nst-scroll').clientWidth, 200);
  function niceStep() { for (const s of [.1, .25, .5, 1, 2, 5, 10, 30, 60, 120]) if (s * pps >= 56) return s; return 300; }
  function paintHead() {
    const t = time();
    q('#nst-clock').textContent = fmt(t);
    const head = q('.nst-playhead'); if (head) head.style.transform = `translateX(${x(t)}px)`;
    const sc = q('#nst-scroll');
    if (playing) { const px = x(t); if (px > sc.scrollLeft + sc.clientWidth - 24 || px < sc.scrollLeft) sc.scrollLeft = Math.max(0, px - 40); }
  }
  function queueRefresh() { if (!open || drag || pending) return; pending = requestAnimationFrame(() => { pending = 0; refresh(); }); }
  window.n0iseMotionRefresh = queueRefresh;
  function refresh() {
    if (!open || !M()) return;
    const d = doc(), canvas = q('#nst-canvas'), names = q('#nst-names');
    q('#nst-length').value = d.duration;
    q('#nst-seq').textContent = (d.name || 'COMPOSITION').toUpperCase();
    const width = Math.max(visibleW(), x(d.duration) + 60);
    canvas.style.width = width + 'px';
    canvas.replaceChildren(); names.replaceChildren();
    names.append(el('div', 'nst-label-head', 'TRACKS'));
    const ruler = el('div', 'nst-ruler'); ruler.dataset.scrub = '1';
    const step = niceStep();
    for (let s = 0; s <= d.duration + 1e-6; s += step) { const tk = el('span', 'nst-tick', (Math.round(s * 100) / 100) + 's'); tk.style.left = x(s) + 'px'; ruler.append(tk); }
    const endMark = el('div', 'nst-end'); endMark.style.left = x(d.duration) + 'px';
    canvas.append(ruler);
    const sel = new Set(M().selection);
    if (!d.layers.length) { names.append(el('div', 'nst-empty', 'Add a layer or import a video.')); }
    for (const l of d.layers) {
      const label = el('button', 'nst-track-name', l.name); label.type = 'button'; label.title = l.name;
      label.classList.toggle('selected', sel.has(l.id));
      label.onclick = () => M().select([l.id]);
      names.append(label);
      const lane = el('div', 'nst-lane'); lane.dataset.scrub = '1';
      const c = clipOf(l);
      const clip = el('div', 'nst-clip nst-' + l.type); clip.dataset.id = l.id; clip.tabIndex = 0; clip.setAttribute('role', 'button');
      clip.classList.toggle('selected', sel.has(l.id)); clip.classList.toggle('off', !l.visible);
      clip.style.left = x(c.start) + 'px'; clip.style.width = Math.max(6, x(c.dur)) + 'px';
      const miss = l.type === 'video' && missing.has(l.videoId);
      clip.classList.toggle('missing', miss);
      clip.append(el('i', 'nst-h nst-hl'), el('span', 'nst-clipname', (miss ? '⚠ ' : '') + l.name + ' · ' + (Math.round(c.dur * 10) / 10) + 's'), el('i', 'nst-h nst-hr'));
      clip.setAttribute('aria-label', `${l.name}, starts ${fmt(c.start)}, lasts ${Math.round(c.dur * 10) / 10} seconds`);
      lane.append(clip); canvas.append(lane);
      if (l.type === 'video') ensureMedia(l);
    }
    canvas.append(endMark, el('div', 'nst-playhead'));
    const missingCount = d.layers.filter(l => l.type === 'video' && missing.has(l.videoId)).length;
    status(missingCount ? `${missingCount} VIDEO FILE${missingCount > 1 ? 'S' : ''} MISSING · IMPORT AGAIN TO RELINK` : `${d.layers.length} LAYERS · ${fps()} FPS · ${d.duration}s`);
    paintHead();
  }

  /* ---- clip dragging: move, trim, snap ---- */
  function snapTo(v, skipId) {
    const points = [0, time(), doc().duration];
    for (const l of doc().layers) { if (l.id === skipId) continue; const c = clipOf(l); points.push(c.start, c.start + c.dur); }
    const tol = 8 / pps;
    let best = v, bd = tol;
    for (const p of points) { const dd = Math.abs(p - v); if (dd < bd) { best = p; bd = dd; } }
    return best;
  }
  const canvasX = e => e.clientX - q('#nst-canvas').getBoundingClientRect().left;
  q('#nst-canvas').addEventListener('pointerdown', e => {
    const clipEl = e.target.closest('.nst-clip');
    if (!clipEl) {
      if (e.target.closest('[data-scrub]') && e.button === 0) { drag = { mode: 'scrub' }; q('#nst-canvas').setPointerCapture(e.pointerId); if (playing) pause(); seek(canvasX(e) / pps); }
      return;
    }
    if (e.button !== 0) return;
    const l = doc().layers.find(a => a.id === clipEl.dataset.id);
    if (!l || l.locked) return;
    if (!M().selection.includes(l.id)) M().select([l.id]);
    const c = clipOf(l);
    const mode = e.target.classList.contains('nst-hl') ? 'l' : e.target.classList.contains('nst-hr') ? 'r' : 'move';
    drag = { mode, l, before: M().capture(), sx: e.clientX, start: c.start, dur: c.dur, trim: l.trim || 0, clipEl, moved: false };
    q('#nst-canvas').setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  q('#nst-canvas').addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.mode === 'scrub') { seek(canvasX(e) / pps); return; }
    const dt = (e.clientX - drag.sx) / pps, { l } = drag;
    if (Math.abs(e.clientX - drag.sx) > 2) drag.moved = true;
    if (!drag.moved) return;
    const video = l.type === 'video', srcDur = l.srcDur ?? 1e9;
    let start = drag.start, dur = drag.dur, trim = drag.trim;
    if (drag.mode === 'move') start = Math.max(0, snapTo(drag.start + dt, l.id));
    else if (drag.mode === 'l') {
      let ns = snapTo(drag.start + dt, l.id);
      ns = clamp(ns, video ? drag.start - drag.trim : 0, drag.start + drag.dur - MIN);
      const delta = ns - drag.start; start = ns; dur = drag.dur - delta; trim = drag.trim + delta;
    } else {
      let ne = snapTo(drag.start + drag.dur + dt, l.id);
      ne = Math.max(drag.start + MIN, video ? Math.min(ne, drag.start + (srcDur - drag.trim)) : ne);
      dur = ne - drag.start;
    }
    l.start = Math.round(start * 1000) / 1000; l.dur = Math.round(dur * 1000) / 1000;
    if (video) l.trim = Math.round(Math.max(0, trim) * 1000) / 1000;
    drag.clipEl.style.left = x(l.start) + 'px'; drag.clipEl.style.width = Math.max(6, x(l.dur)) + 'px';
    drag.clipEl.querySelector('.nst-clipname').textContent = l.name + ' · ' + (Math.round(l.dur * 10) / 10) + 's';
    syncVideos(time(), false); M().schedule();
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.mode === 'scrub') return;
    if (d.moved) {
      const end = (d.l.start ?? 0) + (d.l.dur ?? 0);
      if (end > doc().duration) doc().duration = Math.ceil(end);
      M().finish(d.before);
    }
    queueRefresh();
  };
  q('#nst-canvas').addEventListener('pointerup', endDrag);
  q('#nst-canvas').addEventListener('pointercancel', endDrag);
  q('#nst-canvas').addEventListener('keydown', e => {
    const c = e.target.closest?.('.nst-clip'); if (!c) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); M().select([c.dataset.id]); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation();
      const l = doc().layers.find(a => a.id === c.dataset.id); if (!l || l.locked) return;
      const dt = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / fps());
      M().change(() => { const k = clipOf(l); l.start = Math.max(0, Math.round((k.start + dt) * 1000) / 1000); l.dur = k.dur; });
    }
  });

  /* ---- commands ---- */
  function split() {
    const d = doc(), t = time();
    const sel = d.layers.filter(l => M().selection.includes(l.id));
    const pick = [...sel, ...d.layers.filter(l => l.type === 'video'), ...d.layers].find(l => { const c = clipOf(l); return !l.locked && t > c.start + 0.05 && t < c.start + c.dur - 0.05; });
    if (!pick) { M().notice('Move the playhead inside a clip to split it.'); return; }
    M().change(() => {
      const c = clipOf(pick), i = d.layers.indexOf(pick);
      const b = JSON.parse(JSON.stringify(pick)); b.id = StudioDocument.id(); b.name = (pick.name + ' B').slice(0, 120);
      pick.start = c.start; pick.dur = Math.round((t - c.start) * 1000) / 1000;
      b.start = Math.round(t * 1000) / 1000; b.dur = Math.round((c.start + c.dur - t) * 1000) / 1000;
      if (pick.type === 'video') b.trim = Math.round(((pick.trim || 0) + (t - c.start)) * 1000) / 1000;
      d.layers.splice(i, 0, b);
    });
  }
  async function importVideos(files) {
    const made = [];
    for (const file of files) {
      try {
        const id = StudioDocument.id();
        M().R.media.register(id, file);
        await mediaPut(id, file);
        const probe = document.createElement('video'); probe.preload = 'metadata'; probe.muted = true;
        probe.src = URL.createObjectURL(file);
        await new Promise((res, rej) => { probe.onloadedmetadata = res; probe.onerror = () => rej(new Error('bad')); setTimeout(() => rej(new Error('slow')), 15000); });
        if (!Number.isFinite(probe.duration)) { /* recorder-made files report no length until you seek to the end */
          await new Promise(res => { probe.ontimeupdate = () => { probe.ontimeupdate = null; res(); }; probe.currentTime = 1e9; setTimeout(res, 4000); });
        }
        const [dw, dh] = M().dims(), vw = probe.videoWidth || 1280, vh = probe.videoHeight || 720, k = Math.min(dw / vw, dh / vh);
        const dur = Math.min(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 5, 600);
        URL.revokeObjectURL(probe.src);
        made.push(StudioDocument.layer('video', { name: file.name.replace(/\.[^.]+$/, '').slice(0, 120), videoId: id, width: Math.round(vw * k), height: Math.round(vh * k), srcDur: dur, trim: 0, start: 0, dur, volume: 1, muted: false }));
      } catch { M().notice(`Could not read ${file.name}. Use an MP4 or WebM that this browser can play.`); }
    }
    if (!made.length) return;
    M().add(made, () => { const need = Math.ceil(Math.max(...made.map(l => l.dur))); if (need > doc().duration) doc().duration = need; });
    setOpen(true);
    seek(0);
    M().notice(`Imported ${made.length} video${made.length > 1 ? 's' : ''}. Timeline opened.`);
  }

  /* ---- export: record the canvas (and clip sound) while the timeline plays once ---- */
  async function exportVideo() {
    if (exporting) return;
    if (!window.MediaRecorder) { M().notice('This browser cannot record video. Try Chrome, Edge or Safari 15+.'); return; }
    const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    if (!type) { M().notice('No supported video format in this browser.'); return; }
    pause(); exporting = true;
    const btn = q('[data-nst=export]'), d = doc(); btn.disabled = true;
    for (const l of d.layers) if (l.type === 'video') { const v = M().R.media.video(l); if (v) tap(v); }
    const stream = M().canvas.captureStream(fps());
    adest?.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    const chunks = [], rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise(res => { rec.onstop = res; });
    seek(0);
    await new Promise(r => setTimeout(r, 450));
    status('RECORDING · KEEP THIS TAB OPEN AND VISIBLE');
    rec.start(250);
    onEnd = () => { onEnd = null; setTimeout(() => rec.state !== 'inactive' && rec.stop(), 250); };
    play();
    await finished;
    exporting = false; btn.disabled = false;
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (d.name || 'n0ise-motion').replace(/[^\w-]+/g, '-') + (type.startsWith('video/mp4') ? '.mp4' : '.webm');
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    seek(0); queueRefresh();
    M().notice(`Exported ${Math.round(blob.size / 1024)} KB`);
  }

  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-nst]'); if (!b) return;
    const k = b.dataset.nst;
    if (k === 'play') playing ? pause() : play();
    else if (k === 'back') { if (playing) pause(); seek(0); }
    else if (k === 'close') setOpen(false);
    else if (k === 'split') split();
    else if (k === 'delete') M().remove();
    else if (k === 'loop') { loop = !loop; b.setAttribute('aria-pressed', loop); b.classList.toggle('nst-on', loop); }
    else if (k === 'zoomin') { pps = Math.min(400, pps * 1.5); refresh(); }
    else if (k === 'zoomout') { pps = Math.max(8, pps / 1.5); refresh(); }
    else if (k === 'export') exportVideo();
  });
  q('#nst-length').onchange = e => { const v = clamp(Math.round(+e.target.value) || 8, 1, 600); M().change(() => { doc().duration = v; }); };
  new ResizeObserver(() => queueRefresh()).observe(panel);

  document.addEventListener('keydown', e => {
    if (!open || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === 'Home') { e.preventDefault(); seek(0); }
    else if ((e.key === 's' || e.key === 'S') && !e.target.closest('#graph')) { e.preventDefault(); split(); }
    else if (e.key === 'ArrowLeft' && !e.target.closest('.nst-clip,#graph')) { e.preventDefault(); seek(time() - (e.shiftKey ? 1 : 1 / fps())); }
    else if (e.key === 'ArrowRight' && !e.target.closest('.nst-clip,#graph')) { e.preventDefault(); seek(time() + (e.shiftKey ? 1 : 1 / fps())); }
  }, true);
  document.addEventListener('keydown', e => { if (e.shiftKey && (e.key === 'T') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); setOpen(!open); } });

  window.n0iseMotionUI = { importVideos, toggle: () => setOpen(!open), seek, get open() { return open; } };
})();
