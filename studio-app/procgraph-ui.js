'use strict';
/* Editor for Studio procedural graphs (StudioProc). Presentation only: it edits layer.graph in place through the runtime's model functions, and every finished
   edit goes through the Studio's capture/finish pair, so undo, redo, save and reopen work like any other change. */
const StudioProcUI = (() => {
  const NS = 'http://www.w3.org/2000/svg', P = StudioProc;
  const el = (t,props = {},...kids) => { const e = Object.assign(document.createElement(t),props); e.append(...kids); return e; };
  const sv = (t,attrs = {},...kids) => { const e = document.createElementNS(NS,t); for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); e.append(...kids); return e; };
  const W = 168, HEAD = 28, ROW = 24;
  const heightOf = n => HEAD+Math.max(Object.keys(P.NODES[n.type].inputs).length,1)*ROW+8;
  const inPos = (n,i) => ({x:n.x,y:n.y+HEAD+i*ROW+ROW/2});
  const outPos = n => ({x:n.x+W,y:n.y+HEAD+ROW/2});

  function open(host,ctx) {
    let layer = ctx.layer;
    let g = layer.graph, sel = null, view = {x:0,y:0,k:1}, drag = null, wire = null, ticker = 0, searching = false;
    const root = el('div',{className:'procbox'+(ctx.embedded ? ' embedded' : ''),role:ctx.embedded ? 'region' : 'dialog',ariaLabel:'Procedural graph editor'});
    const svg = sv('svg',{class:'procsvg',tabindex:0,'aria-label':'Graph canvas'}), gWires = sv('g'), gNodes = sv('g'), gTemp = sv('g'), content = sv('g');
    content.append(gWires,gNodes,gTemp); svg.append(content);
    const preview = el('canvas',{className:'procpreview',width:160,height:90,ariaLabel:'Graph output'});
    const side = el('div',{className:'procside'}), top = el('div',{className:'proctop'}), status = el('span',{className:'procstatus'});
    const btn = (label,fn,cls = 'softbtn compact',aria) => { const b = el('button',{type:'button',className:cls,textContent:label}); if (aria) b.setAttribute('aria-label',aria); b.onclick = fn; return b; };
    /* undo and redo swap the layer objects, so always work on the current one */
    const cur = () => { const c = ctx.current?.(); if (c) layer = c; g = layer.graph; return layer; };
    const edit = fn => { cur(); const before = ctx.begin(); try { fn(); } finally { ctx.end(before); } draw(); };
    const node = id => g.nodes.find(n => n.id === id);
    const apply = () => { view.k = Math.max(.25,Math.min(2.5,view.k)); content.setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.k})`); };
    const toGraph = e => { const r = svg.getBoundingClientRect(); return {x:(e.clientX-r.left-view.x)/view.k,y:(e.clientY-r.top-view.y)/view.k}; };
    function fit() {
      const r = svg.getBoundingClientRect(); if (!r.width || !g.nodes.length) return;
      const xs = g.nodes.map(n => n.x),ys = g.nodes.map(n => n.y),x0 = Math.min(...xs),y0 = Math.min(...ys),x1 = Math.max(...xs)+W,y1 = Math.max(...g.nodes.map(n => n.y+heightOf(n)));
      view.k = Math.max(.25,Math.min(1.4,Math.min((r.width-40)/(x1-x0),(r.height-40)/(y1-y0)))); view.x = (r.width-(x1-x0)*view.k)/2-x0*view.k; view.y = (r.height-(y1-y0)*view.k)/2-y0*view.k; apply();
    }
    function draw() {
      cur(); gWires.replaceChildren(); gNodes.replaceChildren();
      const errors = ctx.errors?.() || new Map();
      const wirePath = (a,b,cls,num) => sv('path',{d:`M ${a.x} ${a.y} C ${a.x+60} ${a.y} ${b.x-60} ${b.y} ${b.x} ${b.y}`,class:'pwire '+(cls || '')+(num ? ' num' : '')});
      for (const e of g.edges) { const a = node(e.from),b = node(e.to); if (!a || !b) continue; gWires.append(wirePath(outPos(a),inPos(b,Object.keys(P.NODES[b.type].inputs).indexOf(e.in)),'',P.NODES[a.type].out === 'number')); }
      for (const n of g.nodes) for (const [k,from] of Object.entries(n.bind || {})) { const a = node(from); if (a) gWires.append(wirePath(outPos(a),{x:n.x+W/2,y:n.y},'bound',true)); }
      for (const n of g.nodes) {
        const def = P.NODES[n.type],h = heightOf(n),ins = Object.entries(def.inputs),grp = sv('g',{class:'pnode'+(n.id === sel ? ' sel' : '')+(n.bypass ? ' off' : '')+(errors.has(n.id) ? ' err' : ''),transform:`translate(${n.x} ${n.y})`,'data-node':n.id});
        grp.append(sv('rect',{class:'pbody',width:W,height:h,rx:12}),sv('rect',{class:'phead '+(def.out === 'number' ? 'num' : ''),width:W,height:HEAD,rx:12}),sv('text',{x:12,y:19,class:'ptitle'},def.label));
        if (errors.has(n.id)) { const bad = sv('circle',{cx:W-14,cy:14,r:5,class:'pbad'}); bad.append(sv('title',{},errors.get(n.id))); grp.append(bad); }
        ins.forEach(([name,type],i) => { const y = HEAD+i*ROW+ROW/2; grp.append(sv('text',{x:14,y:y+4,class:'plabel'},name),sv('circle',{cx:0,cy:y,r:6,class:'pport '+type}),sv('circle',{cx:0,cy:y,r:16,class:'phit','data-in':name,'data-node':n.id,'data-type':type})); });
        if (def.out) grp.append(sv('circle',{cx:W,cy:HEAD+ROW/2,r:6,class:'pport out '+def.out}),sv('circle',{cx:W,cy:HEAD+ROW/2,r:16,class:'phit','data-out':'1','data-node':n.id}));
        gNodes.append(grp);
      }
      drawSide(); const r = preview.getContext('2d'); r.clearRect(0,0,160,90); const src = ctx.preview?.(); if (src) r.drawImage(src,0,0,160,90);
      status.textContent = g.nodes.length+' nodes'+(errors.size ? ' · '+errors.size+' with errors' : '');
    }
    function drawSide() {
      side.replaceChildren(); const n = sel && node(sel);
      if (!n) { side.append(el('p',{className:'muted compact',textContent:'Tap a node to edit it. Drag from an output dot to an input dot to connect. Drag empty space to pan; pinch or scroll to zoom.'})); return; }
      const def = P.NODES[n.type],errors = ctx.errors?.() || new Map();
      side.append(el('h3',{textContent:def.label}));
      if (errors.has(n.id)) side.append(el('p',{className:'procerr',textContent:errors.get(n.id)}));
      const numbers = g.nodes.filter(m => P.isNum(m.type) && m.id !== n.id);
      for (const p of def.params) {
        const row = el('label',{className:'procrow'}); row.append(el('span',{textContent:p.label}));
        if (p.t === 'num') {
          const bound = n.bind[p.k],out = el('output',{textContent:(+n.params[p.k]).toFixed(p.step < .1 ? 2 : 1)}),input = el('input',{type:'range',min:p.min,max:p.max,step:p.step,value:n.params[p.k],disabled:!!bound,ariaLabel:p.label});
          input.oninput = () => { n.params[p.k] = +input.value; out.textContent = (+input.value).toFixed(p.step < .1 ? 2 : 1); ctx.live(); };
          input.onchange = () => edit(() => { n.params[p.k] = +input.value; });
          const drive = el('select',{className:'field',ariaLabel:'Drive '+p.label}); drive.append(el('option',{value:'',textContent:'Fixed'})); for (const m of numbers) drive.append(el('option',{value:m.id,textContent:'← '+P.NODES[m.type].label,selected:bound === m.id}));
          drive.onchange = () => edit(() => { if (!drive.value) P.unbind(g,n.id,p.k); else { const e = P.bind(g,drive.value,n.id,p.k); if (e) ctx.notice(e); } });
          const top = el('div',{className:'procnum'},input,out); row.append(top); if (numbers.length || bound) row.append(drive);
        } else if (p.t === 'sel') { const s = el('select',{className:'field',ariaLabel:p.label}); for (const o of p.opts) s.append(el('option',{value:o,textContent:o,selected:n.params[p.k] === o})); s.onchange = () => edit(() => { n.params[p.k] = s.value; }); row.append(s); }
        else if (p.t === 'col') { const c = el('input',{type:'color',value:n.params[p.k],ariaLabel:p.label}); c.onchange = () => edit(() => { n.params[p.k] = c.value; }); row.append(c); }
        else if (p.t === 'bool') { const c = el('input',{type:'checkbox',checked:!!n.params[p.k],ariaLabel:p.label}); c.onchange = () => edit(() => { n.params[p.k] = c.checked; }); row.append(c); }
        else { const t = el('input',{type:'text',className:'field',value:n.params[p.k],maxLength:400,ariaLabel:p.label}); t.onchange = () => edit(() => { n.params[p.k] = t.value; }); row.append(t); }
        side.append(row);
      }
      const acts = el('div',{className:'procacts'});
      if (n.type !== 'output') acts.append(btn(n.bypass ? 'Enable' : 'Bypass',() => edit(() => { n.bypass = !n.bypass; })),btn('Duplicate',() => edit(() => { const c = P.createNode(n.type,n.x+30,n.y+30); Object.assign(c.params,JSON.parse(JSON.stringify(n.params))); g.nodes.push(c); sel = c.id; })),btn('Delete',() => edit(() => { P.remove(g,n.id); sel = null; })));
      side.append(acts);
    }
    /* ---- add nodes: a searchable list ---- */
    function addMenu() {
      if (searching) return; searching = true; const box = el('div',{className:'procadd',role:'listbox'}),q = el('input',{type:'search',className:'field',placeholder:'Search nodes: noise, blur, feedback…',ariaLabel:'Search nodes'}),list = el('div',{className:'procaddlist'});
      const paint = () => { list.replaceChildren(); const s = q.value.trim().toLowerCase();
        for (const [group,ids] of Object.entries(P.groups())) { const items = ids.filter(id => !s || P.NODES[id].label.toLowerCase().includes(s) || group.toLowerCase().includes(s)); if (!items.length) continue; list.append(el('div',{className:'procgroup',textContent:group}));
          for (const id of items) list.append(btn(P.NODES[id].label,() => { close(); edit(() => { const r = svg.getBoundingClientRect(),c = P.createNode(id,(r.width/2-view.x)/view.k-W/2+Math.random()*30,(r.height/2-view.y)/view.k-30+Math.random()*30); g.nodes.push(c); sel = c.id; }); },'procitem')); } };
      const close = () => { box.remove(); searching = false; svg.focus(); };
      q.oninput = paint; q.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Enter') list.querySelector('.procitem')?.click(); };
      box.append(q,list,btn('Cancel',close)); root.append(box); paint(); q.focus();
    }
    /* ---- drop a node on a wire to connect it in between ---- */
    const imageIn = n => Object.entries(P.NODES[n.type].inputs).find(([,t]) => t === 'image')?.[0];
    function wireUnder(n) {
      if (n.type === 'output' || !P.NODES[n.type].out || g.edges.some(e => e.from === n.id || e.to === n.id)) return null;
      const cx = n.x+W/2, cy = n.y+heightOf(n)/2; let best = null, bd = 28/view.k+W*.15;
      for (const e of g.edges) {
        const a = node(e.from), b = node(e.to); if (!a || !b || a.id === n.id || b.id === n.id) continue;
        const kind = P.NODES[a.type].out, want = P.NODES[b.type].inputs[e.in]; if (kind !== want) continue;
        if (kind === 'image' ? !(imageIn(n) && P.NODES[n.type].out === 'image') : !(P.NODES[n.type].inputs.input === 'number' && P.NODES[n.type].out === 'number')) continue;
        const p0 = outPos(a), p3 = inPos(b,Object.keys(P.NODES[b.type].inputs).indexOf(e.in));
        for (let t = 0; t <= 1; t += .04) { const u = 1-t, x = u*u*u*p0.x+3*u*u*t*(p0.x+60)+3*u*t*t*(p3.x-60)+t*t*t*p3.x, y = u*u*u*p0.y+3*u*u*t*p0.y+3*u*t*t*p3.y+t*t*t*p3.y, d = Math.hypot(x-cx,y-cy); if (d < bd) { bd = d; best = e; } }
      }
      return best;
    }
    function spliceInto(e,id) {
      const n = node(id), inName = P.NODES[n.type].inputs.input === 'number' ? 'input' : imageIn(n), old = {...e};
      g.edges = g.edges.filter(x => x !== e && !(x.to === old.to && x.in === old.in));
      let err = P.connect(g,old.from,id,inName); if (!err) err = P.connect(g,id,old.to,old.in);
      if (err) { g.edges = g.edges.filter(x => x.to !== id && x.from !== id); P.connect(g,old.from,old.to,old.in); }
      return err;
    }
    /* ---- pointer: move nodes, pan, wire, pinch ---- */
    const touches = new Map(); let pinch = null;
    svg.addEventListener('pointerdown',e => {
      if (e.button > 0 && e.pointerType === 'mouse') return;
      if (e.pointerType === 'touch') { touches.set(e.pointerId,{x:e.clientX,y:e.clientY}); if (touches.size === 2) { const [a,b] = [...touches.values()]; pinch = {d:Math.hypot(a.x-b.x,a.y-b.y),k:view.k,vx:view.x,vy:view.y,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2}; drag = null; wire = null; gTemp.replaceChildren(); return; } }
      const t = e.target; try { svg.setPointerCapture(e.pointerId); } catch {}
      if (t.dataset.out) { wire = {from:t.dataset.node}; return; }
      if (t.dataset.in) { const e0 = g.edges.find(x => x.to === t.dataset.node && x.in === t.dataset.in); if (e0) { wire = {from:e0.from,reconnect:e0}; } return; }
      const grp = t.closest?.('[data-node]');
      if (grp) { const n = node(grp.dataset.node); sel = n.id; const p = toGraph(e); drag = {kind:'node',n,dx:p.x-n.x,dy:p.y-n.y,before:null,moved:false}; draw(); }
      else { sel = null; drag = {kind:'pan',sx:e.clientX,sy:e.clientY,vx:view.x,vy:view.y}; draw(); }
    });
    svg.addEventListener('pointermove',e => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pinch && touches.size === 2) { const [a,b] = [...touches.values()],k = Math.max(.25,Math.min(2.5,pinch.k*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(pinch.d,1))),r = svg.getBoundingClientRect(),gx = (pinch.cx-r.left-pinch.vx)/pinch.k,gy = (pinch.cy-r.top-pinch.vy)/pinch.k; view.k = k; view.x = (a.x+b.x)/2-r.left-gx*k; view.y = (a.y+b.y)/2-r.top-gy*k; apply(); return; }
      if (wire) { const p = toGraph(e),a = outPos(node(wire.from)); gTemp.replaceChildren(sv('path',{d:`M ${a.x} ${a.y} C ${a.x+60} ${a.y} ${p.x-60} ${p.y} ${p.x} ${p.y}`,class:'pwire temp'})); return; }
      if (!drag) return;
      if (drag.kind === 'pan') { view.x = drag.vx+e.clientX-drag.sx; view.y = drag.vy+e.clientY-drag.sy; apply(); return; }
      const p0 = toGraph(e); void p0;
      const p = toGraph(e); if (!drag.moved) { if (Math.hypot(p.x-drag.n.x-drag.dx,p.y-drag.n.y-drag.dy) < 4/view.k) return; drag.moved = true; drag.before = ctx.begin(); }
      drag.n.x = Math.round(p.x-drag.dx); drag.n.y = Math.round(p.y-drag.dy); drag.hot = wireUnder(drag.n); draw(); if (drag.hot) gWires.children[g.edges.indexOf(drag.hot)]?.classList.add('hot');
    });
    const end = e => {
      touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
      if (wire) {
        const target = document.elementFromPoint(e.clientX,e.clientY),port = target?.closest?.('[data-in]'); gTemp.replaceChildren();
        if (port) edit(() => { const err = P.connect(g,wire.from,port.dataset.node,port.dataset.in); if (err) ctx.notice(err); });
        else if (wire.reconnect) edit(() => { g.edges = g.edges.filter(x => x !== wire.reconnect); });
        wire = null; return;
      }
      if (drag && drag.kind === 'node' && drag.moved) {
        ctx.end(drag.before); draw();
        /* dropped on a wire between two nodes: splice the node into that wire */
        const hot = drag.hot, n = drag.n; if (hot) edit(() => { const err = spliceInto(hot,n.id); if (err) ctx.notice(err); });
      }
      drag = null;
    };
    svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
    svg.addEventListener('wheel',e => { e.preventDefault(); const r = svg.getBoundingClientRect(),gx = (e.clientX-r.left-view.x)/view.k,gy = (e.clientY-r.top-view.y)/view.k,k = Math.max(.25,Math.min(2.5,view.k*Math.exp(-e.deltaY*.0015))); view.k = k; view.x = e.clientX-r.left-gx*k; view.y = e.clientY-r.top-gy*k; apply(); },{passive:false});
    root.addEventListener('keydown',e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') { e.stopPropagation(); done(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && sel !== 'output') { e.preventDefault(); e.stopPropagation(); edit(() => { P.remove(g,sel); sel = null; }); }
    });
    const done = () => { clearInterval(ticker); root.remove(); ctx.close?.(); };
    top.append(el('b',{textContent:'Procedural graph'}),status,btn('+ Node',addMenu,'softbtn compact pri'),btn('Fit',fit),
      (() => { const s = el('select',{className:'field',ariaLabel:'Start from a template'}); s.append(el('option',{value:'',textContent:'Template…'})); for (const k of Object.keys(P.templates)) s.append(el('option',{value:k,textContent:k})); s.onchange = () => { if (!s.value) return; edit(() => { layer.graph = P.templates[s.value](); sel = null; }); g = layer.graph; s.value = ''; fit(); }; return s; })(),
      (() => { const s = el('select',{className:'field',ariaLabel:'Resolution'}); for (const r of [240,360,480,720]) s.append(el('option',{value:r,textContent:r+' px',selected:g.res === r})); s.onchange = () => edit(() => { g.res = +s.value; }); return s; })(),
      ...(ctx.embedded ? [] : [btn('Done',done,'softbtn compact pri')]));
    root.append(top,el('div',{className:'procmain'},svg,el('div',{className:'procright'},preview,side))); host.append(root);
    ctx.onFrame = draw; ticker = setInterval(() => { if (!root.isConnected) clearInterval(ticker); else { const r = preview.getContext('2d'),src = ctx.preview?.(); if (src) { r.clearRect(0,0,160,90); r.drawImage(src,0,0,160,90); } } },250);
    draw(); requestAnimationFrame(() => { fit(); svg.focus(); });
    return {close:done,redraw:draw,fit};
  }
  return {open};
})();
