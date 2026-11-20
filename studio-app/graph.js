'use strict';

function studioGraph(svg, api) {
  const {clamp} = StudioDocument;
  const {connect,schema} = StudioGraph;
  const names = {scene:'Scene',layer:'Layer',output:'Output',effect:'Effect',upload:'Texture'};
  const name = node => node?.type === 'effect' ? api.effectName(node.params.effect) : (names[node?.type] ?? 'Unavailable node');
  const subtitles = {scene:'Render texture',layer:'Image',upload:'Image → texture',output:'Layer composite',effect:'n0ise Effects'};
  const viewport = {x:20,y:35,z:1};
  let fitPending = true, autoFit = true, drag = null, pending = null, selection = null;

  function item(tag, attrs, parent, label) {
    const el = document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
    if (label) el.textContent = label;
    parent.append(el);
    return el;
  }

  function fit() {
    autoFit = true;
    fitPending = true;
    render();
  }

  function render() {
    if (!svg.clientWidth || !svg.clientHeight) return;
    const g = api.graph();
    if (!g) {
      svg.replaceChildren();
      return;
    }
    if (fitPending) {
      const x = Math.min(...g.nodes.map(n => n.x)), y = Math.min(...g.nodes.map(n => n.y));
      const width = Math.max(...g.nodes.map(n => n.x))+130-x;
      const height = Math.max(...g.nodes.map(n => n.y))+54-y;
      viewport.z = clamp(Math.min((svg.clientWidth-30)/width,(svg.clientHeight-43)/height),.15,1);
      viewport.x = (svg.clientWidth-width*viewport.z)/2-x*viewport.z;
      viewport.y = (svg.clientHeight+28-height*viewport.z)/2-y*viewport.z;
      fitPending = false;
    }
    svg.replaceChildren();
    const group = item('g',{transform:`translate(${viewport.x} ${viewport.y}) scale(${viewport.z})`},svg);
    const wire = (x,y,ex,ey) => `M ${x} ${y} C ${x+55} ${y},${ex-55} ${ey},${ex} ${ey}`;
    for (const e of g.edges) {
      if (drag?.kind === 'wire' && drag.rewire === e.to) continue;   // picked up: drawn from the pointer instead
      const a = g.nodes.find(n => n.id === e.from), b = g.nodes.find(n => n.id === e.to);
      const attrs = {d:wire(a.x+130,a.y+27,b.x,b.y+27)};
      item('path',{...attrs,class:'wire'+(selection?.edge === e.to ? ' selected' : '')},group);
      item('path',{...attrs,fill:'none',stroke:'transparent','stroke-width':16,class:'wire-hit',
        'data-edge':e.to,tabindex:0,role:'button','aria-label':`Connection from ${name(a)} to ${name(b)}`},group);
    }
    if (drag?.kind === 'wire' && drag.point) {
      const n = g.nodes.find(n => n.id === drag.from);
      const x = (drag.point.x-viewport.x)/viewport.z, y = (drag.point.y-viewport.y)/viewport.z;
      const snap = drag.hover && g.nodes.find(m => m.id === drag.hover.id);
      const end = snap ? [snap.x,snap.y+27] : [x,y];
      item('path',{d:wire(n.x+130,n.y+27,end[0],end[1]),class:'wire drag'+(drag.hover && !drag.hover.ok ? ' bad' : ''),'pointer-events':'none'},group);
    }
    for (const n of g.nodes) {
      const node = item('g',{class:'node'+(selection?.node === n.id ? ' selected' : ''),
        'data-node':n.id,tabindex:0,role:'button','aria-label':name(n),transform:`translate(${n.x} ${n.y})`},group);
      item('rect',{width:130,height:54,rx:10},node);
      item('text',{x:13,y:23},node,name(n));
      const subtitle = n.type === 'effect' && n.params.disabled ? 'Bypassed · n0ise Effects' : subtitles[n.type];
      item('text',{x:13,y:41,class:'sub'},node,n.version === 1 ? subtitle ?? 'Adapter unavailable' : 'Version unavailable');
      for (const port of ['in','out']) {
        if (port === 'in' ? !schema[n.type]?.inputs.input : !schema[n.type]?.outputs.frame) continue;
        const cx = port === 'in' ? 0 : 130;
        const open = port === 'in' && !g.edges.some(e => e.to === n.id && e.in === 'input' && !(drag?.kind === 'wire' && drag.rewire === e.to));
        const over = port === 'in' && drag?.hover?.id === n.id;
        item('circle',{cx,cy:27,r:17,class:'port-hit',fill:'transparent','data-port':port},node);   // generous target for fingers and sticks
        item('circle',{cx,cy:27,r:7,class:'port'+(pending === n.id && port === 'out' ? ' pending' : '')+(open ? ' open' : '')+
          (over ? (drag.hover.ok ? ' ok' : ' no') : ''),'data-port':port,tabindex:0,role:'button',
          'aria-label':`${name(n)} ${port === 'in' ? 'input' : 'output'}${open ? ', unplugged' : ''}`},node);
      }
    }
  }

  function choose(value) {
    selection = value;
    api.inspect();
    render();
  }

  function link(from,to) {
    pending = null;
    const g = api.graph();
    if (!g) return;
    if (g.edges.some(e => e.from === from && e.to === to)) { render(); return; }
    const before = api.capture();
    const error = connect(g,from,to);
    if (error) {
      api.notice(error);
      render();
      return;
    }
    selection = {edge:to};
    api.finish(before);
  }

  /* A picked-up wire: drop it on an input to replug it there, or anywhere else to unplug it. Undo restores either. */
  function replug(d,to) {
    const g = api.graph();
    if (!g) return;
    pending = null;
    if (to === d.rewire) { choose({edge:to}); return; }                       // put back where it was
    const trial = {...g,edges:[...g.edges]};
    const error = to ? connect(trial,d.from,to,d.out) : null;
    if (error) { api.notice(error); return; }                                 // incompatible: the wire snaps back
    g.edges = g.edges.filter(x => !(x.to === d.rewire && x.in === 'input'));
    if (to) connect(g,d.from,to,d.out);
    selection = to ? {edge:to} : {node:d.rewire};
    api.notice?.(to ? 'Replugged.' : 'Unplugged. Drag from an output to plug it back in.');
    api.finish(d.before);
  }

  function activate(target) {
    const node = target.closest('[data-node]')?.dataset.node;
    const edge = target.closest('[data-edge]')?.dataset.edge;
    if (target.dataset.port === 'out') {
      pending = pending === node ? null : node;
      choose({node});
    } else if (target.dataset.port === 'in' && pending) link(pending,node);
    else if (node) choose({node});
    else if (edge) choose({edge});
    else choose(null);
  }

  function remove() {
    const g = api.graph();
    if (!g) return false;
    const before = api.capture();
    if (selection?.edge) g.edges = g.edges.filter(e => e.to !== selection.edge);
    else if (g.nodes.some(n => n.id === selection?.node && !['source','output','upload'].includes(n.id))) {
      const target = g.nodes.find(n => n.id === selection.node);
      const incoming = g.edges.find(e => e.to === target.id);
      const outgoing = g.edges.find(e => e.from === target.id);
      g.nodes = g.nodes.filter(n => n.id !== target.id);
      g.edges = g.edges.filter(e => e.to !== target.id && e.from !== target.id);
      if (target.type === 'effect' && incoming && outgoing) {
        const error = connect(g,incoming.from,outgoing.to,incoming.out,outgoing.in);
        if (error) api.notice(error);
      }
    } else return false;
    selection = null;
    api.finish(before);
    return true;
  }

  svg.addEventListener('pointerdown',e => {
    if (drag || e.button > 1) return;
    const node = api.graph()?.nodes.find(n => n.id === e.target.closest('[data-node]')?.dataset.node);
    const edge = e.target.closest('[data-edge]')?.dataset.edge;
    const port = e.target.dataset.port;
    const plugged = port === 'in' && e.button === 0 && api.graph()?.edges.find(x => x.to === node?.id && x.in === 'input');
    if (((port === 'in' && !plugged) || edge) && e.button === 0) { activate(e.target); return; }
    e.preventDefault();
    svg.focus({preventScroll:true});
    svg.setPointerCapture(e.pointerId);
    const base = {pointer:e.pointerId,sx:e.clientX,sy:e.clientY,moved:false};
    if (plugged) {
      drag = {...base,kind:'wire',from:plugged.from,out:plugged.out,rewire:node.id,before:api.capture(),node};
    } else if (e.button === 0 && port === 'out') {
      drag = {...base,kind:'wire',from:node.id};
    } else if (e.button === 0 && node) {
      drag = {...base,kind:'node',node,x:node.x,y:node.y,before:api.capture()};
      choose({node:node.id});
    } else {
      drag = {...base,kind:'pan',x:viewport.x,y:viewport.y};
      choose(null);
    }
  });
  svg.tabIndex = 0;
  svg.addEventListener('pointermove',e => {
    if (drag?.pointer !== e.pointerId) return;
    const dx = e.clientX-drag.sx, dy = e.clientY-drag.sy;
    if (!drag.moved && Math.hypot(dx,dy) < 3) return;
    drag.moved = true;
    if (drag.kind === 'node') {
      drag.node.x = drag.x+dx/viewport.z;
      drag.node.y = drag.y+dy/viewport.z;
    } else if (drag.kind === 'pan') {
      autoFit = false;
      viewport.x = drag.x+dx;
      viewport.y = drag.y+dy;
    } else {
      const rect = svg.getBoundingClientRect();
      drag.point = {x:e.clientX-rect.left,y:e.clientY-rect.top};
      const over = document.elementFromPoint(e.clientX,e.clientY);
      const id = over?.dataset?.port === 'in' ? over.closest('[data-node]')?.dataset.node : null;
      const g = api.graph();
      const was = drag.hover?.id;
      drag.hover = id && g ? {id,ok:!connect({...g,edges:[...g.edges]},drag.from,id,drag.out ?? 'frame')} : null;
      if (drag.hover?.id !== was && drag.hover) api.buzz?.(drag.hover.ok ? 12 : 30);
    }
    render();
  });
  function end(e,cancelled) {
    if (drag?.pointer !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (d.kind === 'node' && d.moved) {
      if (cancelled) Object.assign(d.node,{x:d.x,y:d.y});
      else api.finish(d.before);
    }
    if (d.kind === 'wire' && !cancelled) {
      if (!d.moved) {
        if (d.rewire) choose({edge:d.rewire});
        else {
          pending = pending === d.from ? null : d.from;
          choose({node:d.from});
        }
      } else {
        const target = document.elementFromPoint(e.clientX,e.clientY);
        const to = target?.dataset.port === 'in' ? target.closest('[data-node]').dataset.node : null;
        if (d.rewire) replug(d,to);
        else if (to) link(d.from,to);
      }
    }
    render();
  }
  svg.addEventListener('pointerup',e => end(e,false));
  svg.addEventListener('pointercancel',e => end(e,true));
  svg.addEventListener('wheel',e => {
    e.preventDefault();
    autoFit = false;
    const r = svg.getBoundingClientRect(), x = e.clientX-r.left, y = e.clientY-r.top;
    const z = clamp(viewport.z*Math.exp(-e.deltaY*.002),.15,3);
    viewport.x = x-(x-viewport.x)*z/viewport.z;
    viewport.y = y-(y-viewport.y)*z/viewport.z;
    viewport.z = z;
    render();
  },{passive:false});
  svg.addEventListener('keydown',e => {
    if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopPropagation(); const d = drag; drag = null; if (d.kind === 'node') Object.assign(d.node,{x:d.x,y:d.y}); render(); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const data = e.target.dataset;
    activate(e.target);
    const replacement = [...svg.querySelectorAll('[tabindex]')].find(el =>
      el.dataset.port === data.port && el.dataset.edge === data.edge &&
      el.closest('[data-node]')?.dataset.node === e.target.closest('[data-node]')?.dataset.node);
    (replacement ?? svg).focus();
  });
  new ResizeObserver(() => {
    if (autoFit) fitPending = true;
    render();
  }).observe(svg);

  return {render,fit,remove,name,choose,get selection() { return selection; },
    clear(refit = false) { selection = null; pending = null; if (refit) { autoFit = true; fitPending = true; } render(); }};
}
