'use strict';
/* CHROMA: the colour instrument inside Studio's Inspector. Pure colour maths plus one mount() that builds Wheel / Values / Swatches.
   It never touches the document: the caller supplies onBegin / onPreview / onCommit, so one wheel drag is one undo step. */
const StudioChroma = (() => {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hsvToRgb = (H, S, V) => { const f = n => { const k = (n + H / 60) % 6; return Math.round(255 * V * (1 - S * Math.max(0, Math.min(k, 4 - k, 1)))); }; return [f(5), f(3), f(1)]; };
  const rgbToHsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let H = 0;
    if (d) { if (max === r) H = ((g - b) / d) % 6; else if (max === g) H = (b - r) / d + 2; else H = (r - g) / d + 4; H = (H * 60 + 360) % 360; }
    return [H, max ? d / max : 0, max];
  };
  const toHex = rgb => '#' + rgb.map(n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');
  const fromHex = c => { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim()); if (!m) return null; let h = m[1].toLowerCase(); if (h.length === 3) h = [...h].map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const norm = c => { const r = fromHex(c); return r ? toHex(r) : null; };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const NS = 'http://www.w3.org/2000/svg';
  let uid = 0, memory = null;      /* the last wheel position, so a colour you just picked reopens exactly where you left it (greys and blacks lose their hue otherwise) */

  function mount(o) {
    const id = 'ch' + (++uid);
    const root = el('div', 'chroma');
    const modes = el('div', 'chroma-modes'); modes.setAttribute('role', 'tablist');
    const views = {};
    let mode = 'wheel', [h, s, v] = rgbToHsv(...(fromHex(o.value) || [0, 0, 0])), dragging = null, kbTimer = 0, began = false, raf = 0, pending = null;
    if (memory && memory.hex === norm(o.value)) [h, s, v] = memory.hsv;
    let exact = fromHex(o.value) ? toHex(fromHex(o.value)) : null;
    const cur = () => exact || toHex(hsvToRgb(h, s, v));

    /* one change of colour: begin once, preview as often as needed, commit once */
    const begin = () => { if (!began) { began = true; o.onBegin?.(); } };
    const preview = c => { o.onPreview?.(c); };
    const commit = () => { if (began) { began = false; o.onCommit?.(cur()); } };
    const setHex = (c, final = true) => { const rgb = fromHex(c); if (!rgb) return false; [h, s, v] = rgbToHsv(...rgb); exact = toHex(rgb); begin(); preview(toHex(rgb)); paint(); if (final) commit(); return true; };
    const setHSV = (final = true) => { exact = null; begin(); preview(cur()); paint(); if (final) commit(); };

    for (const [k, label] of [['wheel', 'Wheel'], ['values', 'Values'], ['swatches', 'Swatches']]) {
      const b = el('button', '', label); b.type = 'button'; b.dataset.mode = k; b.setAttribute('role', 'tab');
      b.onclick = () => { mode = k; showMode(); };
      modes.append(b); views[k] = el('div', 'chroma-view');
    }

    /* ---- wheel: hue ring + saturation/value square ---- */
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 240 240'); svg.setAttribute('class', 'chroma-wheel'); svg.tabIndex = 0;
    svg.setAttribute('role', 'application'); svg.setAttribute('aria-label', 'Colour wheel. Left and right change hue, up and down change brightness, Shift with left and right changes saturation.');
    let ring = '';
    const pt = (r, a) => `${(120 + r * Math.cos(a)).toFixed(2)} ${(120 + r * Math.sin(a)).toFixed(2)}`;
    for (let i = 0; i < 360; i += 3) { const a = (i - 90) * Math.PI / 180, b = (i + 3.5 - 90) * Math.PI / 180; ring += `<path d="M${pt(87, a)} L${pt(109, a)} A109 109 0 0 1 ${pt(109, b)} L${pt(87, b)} A87 87 0 0 0 ${pt(87, a)}" fill="hsl(${i} 100% 50%)"/>`; }
    svg.innerHTML = `<defs><linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
      <g style="pointer-events:none">${ring}</g><circle cx="120" cy="120" r="85" fill="#252628" style="pointer-events:none"/>
      <rect class="sv-base" x="64" y="64" width="112" height="112" rx="4"/><rect x="64" y="64" width="112" height="112" rx="4" fill="url(#${id}w)"/><rect x="64" y="64" width="112" height="112" rx="4" fill="url(#${id}k)"/>
      <circle class="sv-point" r="7" fill="none" stroke="#fff" stroke-width="2"/><circle class="hue-point" r="7" fill="#fff" stroke="#171819" stroke-width="2"/>`;
    views.wheel.append(svg);
    const svBase = svg.querySelector('.sv-base'), svPoint = svg.querySelector('.sv-point'), huePoint = svg.querySelector('.hue-point');
    const local = e => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * 240 / r.width, y: (e.clientY - r.top) * 240 / r.height }; };
    const fromPointer = (e, zone) => {
      /* pointer moves are coalesced to one update per frame, which keeps dragging smooth on phones */
      pending = [e.clientX, e.clientY, zone]; if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (pending) { const [x, y, z] = pending; pending = null; applyPointer({ clientX: x, clientY: y }, z); } });
    };
    const applyPointer = (e, zone) => {
      const p = local(e);
      if (zone === 'hue') h = (Math.atan2(p.y - 120, p.x - 120) * 180 / Math.PI + 90 + 360) % 360;
      else { s = clamp((p.x - 64) / 112, 0, 1); v = 1 - clamp((p.y - 64) / 112, 0, 1); }
      setHSV(false);
    };
    svg.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const p = local(e); dragging = Math.hypot(p.x - 120, p.y - 120) > 83 ? 'hue' : 'sv';
      svg.setPointerCapture(e.pointerId); svg.focus({ preventScroll: true }); e.preventDefault();
      fromPointer(e, dragging);
    });
    svg.addEventListener('pointermove', e => { if (dragging) fromPointer(e, dragging); });
    const end = () => { if (dragging) { if (pending) { const [x, y, z] = pending; pending = null; cancelAnimationFrame(raf); raf = 0; applyPointer({ clientX: x, clientY: y }, z); } dragging = null; commit(); } };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end); svg.addEventListener('lostpointercapture', end);
    svg.addEventListener('keydown', e => {
      const k = e.key, step = e.altKey ? 0.1 : 1;
      if (!/^Arrow/.test(k) || e.ctrlKey || e.metaKey) return;
      e.preventDefault(); e.stopPropagation();
      const dir = (k === 'ArrowRight' || k === 'ArrowUp') ? 1 : -1;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { if (e.shiftKey) s = clamp(s + dir * .01 * 5, 0, 1); else h = (h + dir * step * 2 + 360) % 360; }
      else v = clamp(v + dir * .01 * 3, 0, 1);
      setHSV(false); clearTimeout(kbTimer); kbTimer = setTimeout(commit, 450);
    });
    svg.addEventListener('blur', () => { clearTimeout(kbTimer); commit(); });

    /* ---- values: RGB and HSV ---- */
    const numbers = (labels, maxes, change) => {
      const grid = el('div', 'chroma-numbers'), inputs = [];
      labels.forEach((name, i) => {
        const lab = el('label'), t = el('span', 'chroma-label', name), inp = document.createElement('input');
        inp.type = 'number'; inp.min = 0; inp.max = maxes[i]; inp.className = 'field'; inp.inputMode = 'numeric'; inp.setAttribute('aria-label', name);
        inp.onchange = () => { const n = Number(inp.value); if (!Number.isFinite(n)) { paint(); return; } change(i, clamp(Math.round(n), 0, maxes[i])); };
        lab.append(t, inp); grid.append(lab); inputs.push(inp);
      });
      return { grid, inputs };
    };
    const rgbN = numbers(['R', 'G', 'B'], [255, 255, 255], (i, val) => { const a = hsvToRgb(h, s, v); a[i] = val; setHex(toHex(a)); });
    const hsvN = numbers(['H', 'S', 'V'], [360, 100, 100], (i, val) => { const a = [h, s * 100, v * 100]; a[i] = val; h = a[0] % 360; s = a[1] / 100; v = a[2] / 100; setHSV(); });
    views.values.append(el('div', 'chroma-label', 'RGB · 0–255'), rgbN.grid, el('div', 'chroma-label', 'HSV · degrees, percent'), hsvN.grid);

    /* ---- swatches: project colours, recent colours, harmonies (derived, never saved on their own) ---- */
    const sw = (c, label, run) => { const b = el('button', 'chroma-sw'); b.type = 'button'; b.style.setProperty('--c', c); b.title = label + ' ' + c; b.setAttribute('aria-label', label + ' ' + c); b.onclick = run; if (c === cur()) b.classList.add('active'); return b; };
    const drawSwatches = () => {
      const v2 = views.swatches; v2.replaceChildren();
      const group = (title, list, label, extra) => { v2.append(el('div', 'chroma-label', title)); const g = el('div', 'chroma-swatches'); list.forEach(c => g.append(sw(c, label, () => setHex(c)))); if (!list.length) g.append(el('span', 'chroma-empty', extra || 'None yet')); v2.append(g); };
      group('PROJECT SWATCHES', o.saved?.() || [], 'Apply', 'Save a colour with ＋');
      if ((o.photo?.() || []).length) group('PHOTO COLOURS', o.photo(), 'Apply');
      group('RECENT', o.recent?.() || [], 'Apply');
      group('ANALOGOUS', [-60, -30, 0, 30, 60].map(d => toHex(hsvToRgb((h + d + 360) % 360, s, v))), 'Try');
      const row = el('div', 'chroma-actions');
      const save = el('button', 'softbtn compact', 'Save colour'); save.type = 'button'; save.onclick = () => { o.onSave?.(cur()); drawSwatches(); };
      row.append(save);
      if ((o.saved?.() || []).length) { const rm = el('button', 'softbtn compact', 'Remove this'); rm.type = 'button'; rm.onclick = () => { o.onRemove?.(cur()); drawSwatches(); }; row.append(rm); }
      v2.append(row);
    };

    root.append(modes, views.wheel, views.values, views.swatches);
    const showMode = () => {
      for (const b of modes.children) b.setAttribute('aria-selected', b.dataset.mode === mode);
      for (const k in views) views[k].hidden = k !== mode;
      if (mode === 'swatches') drawSwatches();
    };
    function paint() {
      const c = cur(), rgb = hsvToRgb(h, s, v), a = (h - 90) * Math.PI / 180;
      svBase.setAttribute('fill', `hsl(${h} 100% 50%)`);
      svPoint.setAttribute('cx', 64 + 112 * s); svPoint.setAttribute('cy', 64 + 112 * (1 - v));
      huePoint.setAttribute('cx', 120 + 98 * Math.cos(a)); huePoint.setAttribute('cy', 120 + 98 * Math.sin(a));
      rgbN.inputs.forEach((n, i) => { if (document.activeElement !== n) n.value = rgb[i]; });
      [Math.round(h), Math.round(s * 100), Math.round(v * 100)].forEach((val, i) => { if (document.activeElement !== hsvN.inputs[i]) hsvN.inputs[i].value = val; });
      if (mode === 'swatches' && !dragging) drawSwatches();
      memory = { hex: c, hsv: [h, s, v] };
      o.onPaint?.(c);
    }
    showMode(); paint();
    return {
      el: root,
      set(value) { if (dragging || began) return; const rgb = fromHex(value); if (!rgb) return; if (toHex(rgb) !== cur()) { [h, s, v] = rgbToHsv(...rgb); exact = toHex(rgb); paint(); } },
      setHex
    };
  }
  return { mount, hsvToRgb, rgbToHsv, toHex, fromHex, norm };
})();
