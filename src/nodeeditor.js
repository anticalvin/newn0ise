/* The project node editor. Each tool that has handed something on is a node, and the layers or components it was made of are small
   nodes wired into it. Tool nodes are wired to wherever they were sent. Drag nodes, pan the background, wheel or pinch to zoom, tap a
   node for its details and to open it in a tool. Positions are remembered; the hub (src/hub.js) owns the data. */
import {load, blobFor, clear, TOOLS} from './hub.js';
import {put as handoffPut} from './handoff.js';

const NS = 'http://www.w3.org/2000/svg', $ = id => document.getElementById(id);
const svg = $('svg'), panel = $('panel'), empty = $('empty');
const TW = 210, TH = 74, LW = 156, LH = 40, GX = 70, GY = 12;
const ORDER = {camera: 0, studio: 0, lab: 0, effects: 1, '3d': 2};
const view = {x: 0, y: 0, z: 1}, saved = JSON.parse(localStorage.getItem('n0ise.nodes.pos') || '{}');
let data = {nodes: [], edges: []}, graph = {nodes: [], edges: []}, sel = null, drag = null, fitNext = true;
const pointers = new Map();

const el = (tag, at, parent, text) => {
  const e = document.createElementNS(NS, tag);
  for (const k in at) e.setAttribute(k, at[k]);
  if (text != null) e.textContent = text;
  parent && parent.appendChild(e);
  return e;
};
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

/* graph: tool nodes, layer nodes and edges, with a default column layout that saved positions override */
const narrow = () => svg.clientWidth < 700;
function build() {
  if (narrow()) return buildVertical();
  const nodes = [], edges = [], cols = [0, 0, 0];
  const tools = data.nodes.slice().sort((a, b) => ORDER[a.tool] - ORDER[b.tool] || a.t - b.t);
  const colX = [0, 1, 2].map(c => c * (LW + TW + GX * 2 + 20));
  const colY = [0, 0, 0];
  for (const rec of tools) {
    const c = ORDER[rec.tool] ?? 1, n = rec.layers.length, h = Math.max(TH, n * (LH + GY) - GY);
    const id = 'tool:' + rec.tool, y = colY[c];
    const base = {x: colX[c] + LW + GX, y: y + (h - TH) / 2};
    nodes.push({id, kind: 'tool', rec, w: TW, h: TH, ...base, ...(saved[id] || {})});
    rec.layers.forEach((l, i) => {
      const lid = id + ':' + i;
      nodes.push({id: lid, kind: 'layer', l, tool: rec.tool, w: LW, h: LH, x: colX[c], y: y + i * (LH + GY), ...(saved[lid] || {})});
      edges.push({from: lid, to: id, layer: true});
    });
    colY[c] = y + h + 44;
  }
  for (const e of data.edges) if (nodes.some(n => n.id === 'tool:' + e.from) && nodes.some(n => n.id === 'tool:' + e.to)) edges.push({from: 'tool:' + e.from, to: 'tool:' + e.to});
  return {nodes, edges};
}

/* phones: tools run top to bottom, each with its layers in rows of two above it */
function buildVertical() {
  const nodes = [], edges = [], per = 2;
  let y = 0;
  const tools = data.nodes.slice().sort((a, b) => ORDER[a.tool] - ORDER[b.tool] || a.t - b.t);
  for (const rec of tools) {
    const id = 'tool:' + rec.tool, rows = Math.ceil(rec.layers.length / per), width = per * LW + (per - 1) * GY;
    rec.layers.forEach((l, i) => {
      const lid = id + ':' + i, r = Math.floor(i / per), c = i % per, inRow = Math.min(per, rec.layers.length - r * per);
      const rowW = inRow * LW + (inRow - 1) * GY;
      nodes.push({id: lid, kind: 'layer', l, tool: rec.tool, w: LW, h: LH, x: (width - rowW) / 2 + c * (LW + GY), y: y + r * (LH + GY), ...(saved['v' + lid] || {})});
      edges.push({from: lid, to: id, layer: true});
    });
    const ty = y + rows * (LH + GY) + 34;
    nodes.push({id, kind: 'tool', rec, w: TW, h: TH, x: (width - TW) / 2, y: ty, ...(saved['v' + id] || {})});
    y = ty + TH + 70;
  }
  for (const e of data.edges) if (nodes.some(n => n.id === 'tool:' + e.from) && nodes.some(n => n.id === 'tool:' + e.to)) edges.push({from: 'tool:' + e.from, to: 'tool:' + e.to});
  return {nodes, edges};
}

function fit() {
  const r = svg.getBoundingClientRect();
  if (!graph.nodes.length || !r.width) return;
  const x0 = Math.min(...graph.nodes.map(n => n.x)) - 24, y0 = Math.min(...graph.nodes.map(n => n.y)) - 24;
  const x1 = Math.max(...graph.nodes.map(n => n.x + n.w)) + 24, y1 = Math.max(...graph.nodes.map(n => n.y + n.h)) + 24;
  view.z = Math.max(.25, Math.min(1.3, r.width / (x1 - x0), r.height / (y1 - y0)));
  view.x = (r.width - (x1 - x0) * view.z) / 2 - x0 * view.z;
  view.y = (r.height - (y1 - y0) * view.z) / 2 - y0 * view.z;
}

function render() {
  svg.replaceChildren();
  empty.hidden = graph.nodes.length > 0;
  if (!graph.nodes.length) { panel.hidden = true; return; }
  const g = el('g', {transform: `translate(${view.x} ${view.y}) scale(${view.z})`}, svg);
  const by = id => graph.nodes.find(n => n.id === id), V = narrow();
  for (const e of graph.edges) {
    const a = by(e.from), b = by(e.to);
    const x = V ? a.x + a.w / 2 : a.x + a.w, y = V ? a.y + a.h : a.y + a.h / 2, ex = V ? b.x + b.w / 2 : b.x, ey = V ? b.y : b.y + b.h / 2;
    const d = V ? `M ${x} ${y} C ${x} ${y + 30}, ${ex} ${ey - 30}, ${ex} ${ey}` : (k => `M ${x} ${y} C ${x + k} ${y}, ${ex - k} ${ey}, ${ex} ${ey}`)(Math.max(30, (ex - x) / 2));
    el('path', {d, class: 'wire' + (e.layer ? '' : ' tool')}, g);
  }
  for (const n of graph.nodes) {
    const tool = n.kind === 'tool', label = tool ? TOOLS[n.rec.tool]?.name ?? n.rec.tool : n.l.name;
    const d = el('g', {class: `node ${n.kind}${sel === n.id ? ' sel' : ''}${n.l?.off ? ' off' : ''}`, 'data-id': n.id, transform: `translate(${n.x} ${n.y})`,
      tabindex: 0, role: 'button', 'aria-label': tool ? `${label}, ${n.rec.layers.length} layers` : `${label}, layer of ${TOOLS[n.tool]?.name}`}, g);
    el('rect', {class: 'body', width: n.w, height: n.h, rx: tool ? 16 : 11}, d);
    if (tool) {
      if (n.rec.thumb) {
        el('clipPath', {id: 'c' + n.id.replace(/\W/g, '')}, d).appendChild(el('rect', {x: 10, y: 10, width: 54, height: 54, rx: 8}));
        el('image', {href: n.rec.thumb, x: 10, y: 10, width: 54, height: 54, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#c${n.id.replace(/\W/g, '')})`}, d);
      }
      el('text', {x: 76, y: 31, style: 'font-weight:700;font-size:15px'}, d, label);
      el('text', {x: 76, y: 50, class: 'sub'}, d, clip((n.rec.name || '') + (n.rec.name ? ' · ' : '') + n.rec.layers.length + (n.rec.layers.length === 1 ? ' layer' : ' layers'), 24));
      el('circle', {cx: V ? n.w / 2 : 0, cy: V ? 0 : n.h / 2, r: 6, class: 'port'}, d);
      el('circle', {cx: V ? n.w / 2 : n.w, cy: V ? n.h : n.h / 2, r: 6, class: 'port'}, d);
    } else {
      el('text', {x: 12, y: 18}, d, clip(n.l.name, 19));
      el('text', {x: 12, y: 33, class: 'sub'}, d, n.l.off ? 'hidden' : n.l.kind);
      el('circle', {cx: V ? n.w / 2 : n.w, cy: V ? n.h : n.h / 2, r: 5, class: 'port'}, d);
    }
  }
}

function details() {
  const n = graph.nodes.find(x => x.id === sel);
  panel.hidden = !n;
  if (!n) return;
  panel.replaceChildren();
  const add = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; panel.append(e); return e; };
  const rec = n.kind === 'tool' ? n.rec : data.nodes.find(r => r.tool === n.tool);
  add('h2', n.kind === 'tool' ? TOOLS[rec.tool]?.name ?? rec.tool : n.l.name);
  add('div', n.kind === 'tool' ? `${rec.name || 'Untitled'} · updated ${new Date(rec.t).toLocaleString()}` : `Layer in ${TOOLS[rec.tool]?.name}${n.l.kind ? ' · ' + n.l.kind : ''}`, 'meta');
  if (rec.thumb) { const i = add('img'); i.src = rec.thumb; i.alt = `Preview from ${TOOLS[rec.tool]?.name}`; }
  if (n.kind === 'tool') {
    const ol = add('ol');
    for (const l of rec.layers) { const li = document.createElement('li'); li.textContent = l.name + (l.off ? ' (hidden)' : ''); ol.append(li); }
    if (!rec.layers.length) add('div', 'No layers recorded for this one.', 'meta');
  }
  const row = add('div', null, 'row');
  const open = (label, tool, main) => {
    const b = document.createElement('button'); b.className = 'btn' + (main ? ' main' : ''); b.textContent = label;
    b.onclick = () => openIn(rec, tool); row.append(b);
  };
  open('Open in ' + (TOOLS[rec.tool]?.name), rec.tool, true);
  if (rec.tool !== 'effects') open('Send to Effects', 'effects');
  if (rec.tool !== '3d') open('Send to 3D', '3d');
}

/* Reopen what this node made: the picture goes through the same one-shot hand-off the tools already use. */
async function openIn(rec, to) {
  const blob = await blobFor(rec.tool);
  if (to === rec.tool && rec.tool === 'studio') { location.href = TOOLS.studio.page; return; }   // Studio keeps its own document; open it as it was left
  if (blob) await handoffPut(blob, {from: rec.tool === 'studio' ? 'studio' : rec.tool, name: rec.name, to});
  const page = to === 'effects' ? 'effects.html#from=' + rec.tool : to === '3d' ? 'studio.html#from=' + rec.tool : TOOLS[to].page;
  location.href = blob || to === rec.tool ? page : TOOLS[to].page;
}

function select(id) { sel = id; render(); details(); }

svg.addEventListener('pointerdown', e => {
  if (e.button > 1) return;
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = {kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z, moved: true}; return; }
  const id = e.target.closest('[data-id]')?.dataset.id, node = graph.nodes.find(n => n.id === id);
  drag = node ? {kind: 'node', node, sx: e.clientX, sy: e.clientY, x: node.x, y: node.y, moved: false}
              : {kind: 'pan', sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, moved: false};
});
svg.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (!drag) return;
  if (drag.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()], r = svg.getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    zoomAt(cx, cy, drag.z * Math.hypot(a.x - b.x, a.y - b.y) / drag.d); return;
  }
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true; svg.classList.add('drag');
  if (drag.kind === 'node') { drag.node.x = drag.x + dx / view.z; drag.node.y = drag.y + dy / view.z; }
  else if (drag.kind === 'pan') { view.x = drag.x + dx; view.y = drag.y + dy; }
  render();
});
function end(e) {
  pointers.delete(e.pointerId);
  const d = drag;
  if (pointers.size) return;
  drag = null; svg.classList.remove('drag');
  if (!d) return;
  if (d.kind === 'node') {
    if (d.moved) { saved[(narrow() ? 'v' : '') + d.node.id] = {x: Math.round(d.node.x), y: Math.round(d.node.y)}; localStorage.setItem('n0ise.nodes.pos', JSON.stringify(saved)); render(); }
    else select(d.node.id);
  } else if (d.kind === 'pan' && !d.moved) select(null);
}
svg.addEventListener('pointerup', end);
svg.addEventListener('pointercancel', end);
function zoomAt(x, y, z) {
  z = Math.max(.2, Math.min(3, z));
  view.x = x - (x - view.x) * z / view.z; view.y = y - (y - view.y) * z / view.z; view.z = z; render();
}
svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, view.z * Math.exp(-e.deltaY * .0017)); }, {passive: false});
svg.addEventListener('keydown', e => {
  if (e.key === 'Escape') select(null);
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.id) { e.preventDefault(); select(e.target.dataset.id); }
});
$('fit').onclick = () => { fit(); render(); };
$('reset').onclick = async () => { if (confirm('Clear the project graph? Your tools keep their own work.')) { await clear(); localStorage.removeItem('n0ise.nodes.pos'); location.reload(); } };
let wasNarrow = null;
new ResizeObserver(() => {
  if (wasNarrow !== null && wasNarrow !== narrow()) { graph = build(); fitNext = true; }
  wasNarrow = narrow();
  if (fitNext) fit();
  render();
}).observe(svg);

data = await load();
graph = build();
fit(); render();
fitNext = false;
window.__nodes = {get graph() { return graph; }, select, openIn};
