'use strict';

(async () => {
  const $ = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const {sizes,dimensions,ratioName,validSize,create,layer,clamp,copy,history} = StudioDocument;
  const [vector,vectorHandoff] = await Promise.all([
    import('../src/vector-generator.js'),import('../src/vector-handoff.js')
  ]);
  const R = createStudioRender(vector), S = StudioSnap, G = StudioGraph, V = StudioVector;
  const normalize = raw => StudioDocument.normalize(raw,vector.validateDefinition);
  const vectorEdits = new Map();
  let projectEpoch = 0;
  const contextMenu = studioContextMenu($('studioContext'));
  let runtimeModule;
  try { runtimeModule = await import('./runtime.mjs'); } catch (e) {
    console.error('Studio renderer could not load',e);
  }
  const effects = runtimeModule?.effects ?? new Map();
  const mobile = matchMedia('(max-width:680px)');
  const preset = () => 'custom';
  function screenCanvasSize() {
    const density = Math.max(1,window.devicePixelRatio || 1);
    const width = Math.round((window.screen?.width || innerWidth)*density);
    const height = Math.round((window.screen?.height || innerHeight)*density);
    return aspectCanvasSize(width,height);
  }
  const stage = $('stagebody'), board = $('artboard'), overlay = $('overlay'), canvas = $('preview');
  const stack = history();
  /* A new document fills the whole workspace: its pixel size takes the aspect of #stagebody (long edge 1920). */
  function workspaceSize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return mobile.matches ? screenCanvasSize() : [1920,1080];
    const k = 1920/Math.max(w,h);
    return aspectCanvasSize(Math.round(w*k),Math.round(h*k));
  }
  let doc = create(preset(),false,workspaceSize()), selection = [];
  let textEdit = null, inlineText = null, launchMode = 'new', launchTicket = 0;
  let view = 'canvas', tool = 'select', rail = 'layers', sheet = 'canvas', shape = 'rectangle';
  let paintColor = '#e9e5db', constrain = true;
  let dirty = false, opening = 0, revision = 0, space = false, grid = false, snapping = true, angular = false;
  let pan = {x:0,y:0}, zoom = 1, fitted = true, frame = 0, gesture = null, pen = [], hover = null;
  let guides = [], draft = null, editAnchors = false, toastTimer = 0, contextKey = '';
  const pointers = new Map();
  let graphLayerId = null, graphPreview = null, renderWarning = '';
  const gpu = runtimeModule?.createRuntime($('spatialCanvas'),beforeRotation => {
    const l = activeLayer();
    if (!l || beforeRotation.every((value,i) => value === l.asset.transform.rotation[i])) return;
    const before = capture();
    before.doc.layers.find(item => item.id === l.id).asset.transform.rotation = beforeRotation;
    contextKey = '';
    finish(before);
  },notice);
  const graph = studioGraph($('graphsvg'),{graph:visibleGraph,capture,finish,inspect:syncInspector,notice,
    effectName:id => effects.get(id)?.name ?? 'Unavailable effect'});

  const selected = () => doc.layers.filter(l => selection.includes(l.id));
  const activeLayer = () => selected()[0] ?? null;
  function visibleGraph() {
    const l = activeLayer();
    return l?.chain ?? (l ? graphPreview : null);
  }
  function refreshGraphLayer() {
    const l = activeLayer();
    if (graphLayerId !== l?.id) {
      graphLayerId = l?.id;
      graphPreview = l ? G.create(l.type) : null;
      graph.clear(true);
    }
    $('graphTitle').textContent = l ? 'GRAPH / '+l.name.toUpperCase() : 'GRAPH / SELECT A LAYER';
    $('graphAdd').disabled = !l || !compatible(l);
    $('effectTool').classList.toggle('hidden',!l || !compatible(l) || view === 'spatial');
    $('spatialTab').hidden = !(l?.type === 'scene' && gpu?.supportedAsset(l.asset));
  }
  function compatible(l) {
    return !!gpu && selection.length === 1 && l?.visible && !l.locked && (l.type !== 'scene' || gpu.supportedAsset(l.asset));
  }
  const visibleSelection = () => selected().filter(l => l.visible && !l.locked);
  const dims = () => dimensions(doc);
  const round = n => Math.round(n*100)/100;
  const midpoint = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const svg = (tag,attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
    overlay.append(el);
    return el;
  };

  function notice(message) {
    $('toast').textContent = message;
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.add('hidden'),3700);
  }

  function capture() { return {doc:copy(doc),selection:[...selection]}; }
  function finish(before) {
    stack.push(before);
    revision++;
    dirty = true;
    sync();
  }
  function change(apply) {
    const before = capture();
    apply();
    finish(before);
  }
  function restore(entry) {
    doc = entry.doc;
    selection = entry.selection.filter(id => doc.layers.some(l => l.id === id));
    contextKey = '';
    pen = [];
    editAnchors = false;
    graph.clear();
    if (view === 'spatial' && activeLayer()?.type !== 'scene') setView('canvas');
    sync();
  }
  function traverse(direction) {
    if (gesture) return;
    const next = stack.step(direction,capture());
    if (!next) return;
    revision++;
    dirty = true;
    restore(next);
  }

  function stateButtons(selector,active,key) {
    for (const button of all(selector)) {
      const on = button.dataset[key] === active;
      button.classList.toggle('active',on);
      button.setAttribute('aria-pressed',String(on));
    }
  }

  function select(ids) {
    selection = ids;
    editAnchors = false;
    if (graph.selection) graph.clear();
    if (view === 'spatial' && activeLayer()?.type !== 'scene') setView('canvas');
    refreshGraphLayer();
    if (view === 'spatial') layout();
    renderLayers();
    syncInspector();
    drawOverlay();
  }

  function renderLayers() {
    const list = $('layerlist');
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    $('railtitle').textContent = rail.toUpperCase();
    stateButtons('[data-rail]',rail,'rail');
    const glyphs = {scene:'◉',shape:'□',image:'▧',brush:'✎',path:'◇',text:'T',crt:'≋',gradient:'◒',procedure:'◎'};
    function row(name,type,activate,id) {
      const box = document.createElement('div');
      box.className = 'layer';
      box.dataset.type = type;
      const button = document.createElement('button');
      button.innerHTML = '<span class="thumb" aria-hidden="true"></span><span class="layertext"></span>';
      button.querySelector('.thumb').textContent = glyphs[type] ?? '';
      button.querySelector('.layertext').textContent = name;
      button.title = name;
      button.onclick = activate;
      button.dataset.action = (id ?? name)+':select';
      box.append(button);
      list.append(box);
      return {box,button};
    }
    if (rail === 'assets') {
      row('Images','image',() => $('imageFile').click());
      row('3D Objects','scene',() => addScene());
      row('Generative','crt',() => add('crt'));
      row('Materials','shape',() => add('shape'));
    } else {
      if (!doc.layers.length) {
        const empty = document.createElement('p');
        empty.className = 'muted compact';
        empty.textContent = 'Add a layer or drop an image.';
        list.append(empty);
      }
      for (const l of doc.layers) {
        const {box,button} = row(l.name,l.type,e => {
          const toggle = e.shiftKey || e.metaKey || e.ctrlKey;
          select(toggle ? toggleId(selection,l.id) : [l.id]);
        },l.id);
        box.dataset.layerId = l.id;
        const grip = document.createElement('button');
        grip.className = 'layer-grip';
        grip.dataset.layerGrip = l.id;
        grip.dataset.action = l.id+':reorder';
        grip.textContent = '⠿';
        grip.title = `Reorder ${l.name} · drag or use ↑ ↓`;
        grip.setAttribute('aria-label',`Reorder ${l.name}`);
        grip.onkeydown = e => {
          if (!['ArrowUp','ArrowDown'].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          if (!selection.includes(l.id)) select([l.id]);
          reorder(e.key === 'ArrowUp' ? -1 : 1);
        };
        box.insertBefore(grip,button);
        const active = selection.includes(l.id);
        box.classList.toggle('active',active);
        box.classList.toggle('hidden-layer',!l.visible);
        button.setAttribute('aria-pressed',String(active));
        const eye = document.createElement('button');
        eye.className = 'eye';
        eye.textContent = l.visible ? '◉' : '○';
        eye.title = `${l.visible ? 'Hide' : 'Show'} ${l.name}`;
        eye.setAttribute('aria-label',eye.title);
        eye.dataset.action = l.id+':visibility';
        eye.onclick = () => change(() => { l.visible = !l.visible; });
        const lock = document.createElement('button');
        lock.className = 'eye layer-lock';
        lock.textContent = l.locked ? '▣' : '□';
        lock.title = `${l.locked ? 'Unlock' : 'Lock'} ${l.name}`;
        lock.setAttribute('aria-label',lock.title);
        lock.setAttribute('aria-pressed',String(l.locked));
        lock.dataset.action = l.id+':lock';
        lock.onclick = () => change(() => { l.locked = !l.locked; });
        box.append(lock,eye);
      }
    }
    list.scrollTop = scrollTop;
    if (focused) [...list.querySelectorAll('button')].find(b => b.dataset.action === focused.dataset.action)?.focus({preventScroll:true});
    $('removeLayer').disabled = !selection.length;
    $('moveUp').disabled = !canReorder(-1);
    $('moveDown').disabled = !canReorder(1);
  }

  studioLayerDrag($('layerlist'),(id,beforeId) => {
    const moving = selection.includes(id) ? selection : [id];
    const kept = doc.layers.filter(l => !moving.includes(l.id));
    const original = doc.layers;
    const target = original.findIndex(l => l.id === beforeId);
    const index = target === -1 ? kept.length : original.slice(0,target).filter(l => !moving.includes(l.id)).length;
    kept.splice(index,0,...original.filter(l => moving.includes(l.id)));
    if (kept.every((l,i) => l === original[i])) return;
    change(() => { doc.layers = kept; selection = [...moving]; });
  });

  function canReorder(direction) {
    return doc.layers.some((l,i) => selection.includes(l.id) && doc.layers[i+direction] &&
      !selection.includes(doc.layers[i+direction].id));
  }
  function reorder(direction) {
    if (!canReorder(direction)) return;
    change(() => {
      const layers = doc.layers;
      const start = direction < 0 ? 1 : layers.length-2;
      for (let i=start; i>=0 && i<layers.length; i-=direction) {
        const target = i+direction;
        if (layers[target] && selection.includes(layers[i].id) && !selection.includes(layers[target].id)) {
          [layers[i],layers[target]] = [layers[target],layers[i]];
        }
      }
    });
  }
  function remove() {
    if (!selection.length) return;
    if (selected().every(l => l.locked)) { notice('Unlock the selected layer before deleting it.'); return; }
    change(() => {
      const removable = selected().filter(l => !l.locked).map(l => l.id);
      doc.layers = doc.layers.filter(l => !removable.includes(l.id));
      selection = selection.filter(id => !removable.includes(id));
    });
  }
  function toggleId(ids,id) { return ids.includes(id) ? ids.filter(x => x !== id) : [...ids,id]; }

  function insert(layers) {
    graph.clear();
    doc.layers.unshift(...layers);
    selection = layers.map(l => l.id);
    rail = 'layers';
    editAnchors = false;
  }
  function build(type,props = {}) {
    const [w,h] = dims();
    const size = Math.min(w,h)*.24;
    const defaults = {
      shape:{shape,width:size,height:size,fill:paintColor,stroke:paintColor,strokeWidth:0},
      text:{text:'Type here',font:'sans-serif',fontSize:Math.round(size*.38),fill:paintColor},
      path:{points:[],closed:false,fill:paintColor,stroke:paintColor,strokeWidth:4},
      brush:{points:[],stroke:paintColor,strokeWidth:Math.max(4,w*.007)},
      background:{fill:'#151617'},
      gradient:{gradient:{kind:'linear',from:[-w/2,0],to:[w/2,0],start:paintColor,end:'#101112'}}
    };
    return layer(type,{...defaults[type],...props});
  }
  function add(type,props) { change(() => insert([build(type,props)])); }
  function addScene() {
    change(() => insert([StudioDocument.sceneLayer()]));
  }

  function inInspector(input,value) {
    if (document.activeElement !== input) input.value = value;
  }

  /* ---- colour: HEX + RGB entry, recent colours, swatches saved with the project ---- */
  const hexOf = v => { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v).trim()); if (!m) return null; let h = m[1].toLowerCase(); if (h.length === 3) h = [...h].map(c => c+c).join(''); return '#'+h; };
  const recentColors = () => { try { return JSON.parse(localStorage.getItem('n0ise.recentColors') || '[]').filter(hexOf).slice(0,8); } catch { return []; } };
  function rememberColor(c) { const h = hexOf(c); if (!h) return; try { localStorage.setItem('n0ise.recentColors',JSON.stringify([h,...recentColors().filter(x => x !== h)].slice(0,8))); } catch {} }
  function setPaint(c) {
    const h = hexOf(c); if (!h) return;
    paintColor = h; rememberColor(h);
    const picker = document.querySelector('[data-tool="picker"]');
    if (picker) { picker.style.setProperty('--paint-color',h); picker.title = `Eyedropper · current ${h}`; }
  }
  function colourControl(title,value,apply,direct) {
    const box = document.createElement('div');
    box.className = 'colourfield';
    const head = document.createElement('span'); head.className = 'fieldlabel'; head.textContent = title;
    const row = document.createElement('div'); row.className = 'colourrow';
    const well = document.createElement('input'); well.type = 'color'; well.className = 'field'; well.setAttribute('aria-label',title);
    const hex = document.createElement('input'); hex.type = 'text'; hex.className = 'field hex'; hex.maxLength = 7; hex.spellcheck = false; hex.setAttribute('aria-label',title+' hex');
    const rgb = [0,1,2].map(i => { const n = document.createElement('input'); n.type = 'number'; n.min = 0; n.max = 255; n.className = 'field rgb'; n.setAttribute('aria-label',title+' '+'RGB'[i]); return n; });
    let current = hexOf(value) || '#000000';
    const show = c => { current = c; well.value = c; hex.value = c; rgb.forEach((n,i) => { n.value = parseInt(c.slice(1+i*2,3+i*2),16); }); };
    const commit = c => {
      const h = hexOf(c); if (!h) { show(current); return; }
      if (h === current) { show(h); return; }
      show(h); rememberColor(h); contextKey = '';
      if (direct) apply(h); else change(() => apply(h));
      if (direct) syncInspector();
    };
    well.onchange = () => commit(well.value);
    hex.onchange = () => commit(hex.value);
    rgb.forEach(n => { n.onchange = () => commit('#'+rgb.map(x => Math.max(0,Math.min(255,Math.round(+x.value || 0))).toString(16).padStart(2,'0')).join('')); });
    row.append(well,hex,...rgb);
    show(current);
    const bar = document.createElement('div'); bar.className = 'swatchbar'; bar.setAttribute('role','group'); bar.setAttribute('aria-label','Swatches');
    let removing = false;
    const dot = (c,label,run) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.setProperty('--c',c); b.title = label; b.setAttribute('aria-label',label); b.onclick = run; return b; };
    const paint = () => {
      bar.replaceChildren();
      const saved = doc.swatches || [];
      for (const c of recentColors()) bar.append(dot(c,'Recent '+c,() => commit(c)));
      if (saved.length) { const sep = document.createElement('i'); sep.className = 'sep'; bar.append(sep); }
      for (const c of saved) bar.append(dot(c,(removing ? 'Remove swatch ' : 'Swatch ')+c,() => {
        if (removing) { contextKey = ''; change(() => { doc.swatches = (doc.swatches || []).filter(x => x !== c); }); syncInspector(); }
        else commit(c);
      }));
      const add = action('Save colour',() => { if (saved.includes(current)) { notice('Already in swatches'); return; } contextKey = ''; change(() => { (doc.swatches ||= []).push(current); }); syncInspector(); });
      add.classList.add('compact');
      bar.append(add);
      if (saved.length) { const rm = action(removing ? 'Done' : 'Remove',() => { removing = !removing; rm.setAttribute('aria-pressed',removing); paint(); }); rm.classList.add('compact'); rm.setAttribute('aria-pressed',removing); bar.append(rm); }
    };
    paint();
    box.append(head,row,bar);
    return box;
  }
  function paintPanel() {
    const panel = document.createElement('div');
    panel.className = 'paintpanel';
    panel.append(colourControl('Paint colour',paintColor,c => setPaint(c),true));
    return panel;
  }
  function field(title,type,value,apply,options = {}) {
    if (type === 'color') return colourControl(title,value,apply);
    const wrapper = document.createElement('label');
    const label = document.createElement('span');
    label.className = 'fieldlabel';
    label.textContent = title;
    const input = document.createElement(type === 'select' || type === 'textarea' ? type : 'input');
    if (input.tagName === 'INPUT') input.type = type;
    input.className = type === 'range' ? 'slider' : 'field';
    if (options.choices) for (const [key,name] of options.choices) input.add(new Option(name,key));
    if (options.min !== undefined) input.min = options.min;
    if (options.max !== undefined) input.max = options.max;
    if (options.maxLength) input.maxLength = options.maxLength;
    if (type === 'textarea') input.rows = 2;
    input.value = value;
    input.onchange = () => {
      const next = ['number','range'].includes(type) ? input.valueAsNumber : input.value;
      if (typeof next === 'number' && !Number.isFinite(next)) { input.value = value; return; }
      if (options.choices && next === '' && value === '') return;
      const resolved = typeof next === 'number' ? clamp(next,options.min ?? -1e6,options.max ?? 1e6) : next;
      if (String(resolved) !== String(value)) {
        contextKey = '';
        change(() => apply(resolved));
      } else input.value = value;
    };
    wrapper.append(label,input);
    return wrapper;
  }
  function action(label,run) {
    const button = document.createElement('button');
    button.textContent = label;
    button.className = 'softbtn';
    button.onclick = run;
    return button;
  }

  function syncInspector() {
    const values = selected();
    const active = values[0], shown = visibleGraph();
    const node = view !== 'spatial' && active?.chain && shown?.nodes.find(n => n.id === graph.selection?.node);
    const edge = view !== 'spatial' && active?.chain && shown?.edges.find(e => e.to === graph.selection?.edge);
    const effect = node?.type === 'effect' ? effects.get(node.params.effect) : null;
    const l = !effect && !edge && values.length === 1 ? active : null;
    $('selectedName').textContent = effect ? effect.name : edge ? 'Connection' :
      values.length > 1 ? `${values.length} layers selected` : active?.name ?? 'Nothing selected';
    $('layerProperties').classList.toggle('hidden',!l || l.locked || view === 'spatial');
    if (l) {
      for (const [id,key] of [['opacity','opacity'],['blend','blend'],['posX','x'],['posY','y'],['scale','scale'],['rotation','rotation']]) {
        inInspector($(id),typeof l[key] === 'number' ? round(l[key]) : l[key]);
      }
      $('opacityLabel').textContent = l.opacity+'%';
    }
    const key = view+':'+(node ? node.id+':'+JSON.stringify(node.params) : edge ? 'edge:'+edge.to :
      l ? [l.id,l.locked,l.asset?.transform?.rotation,l.chain?.nodes.map(n => n.id),editAnchors].join(':') : selection.join(','));
    if (contextKey === key) return;
    contextKey = key;
    const context = $('context');
    const previousDetails = context.querySelector('details');
    const showAdvanced = previousDetails?.dataset.node === node?.id && previousDetails?.open;
    context.replaceChildren();
    if (l?.locked && !node && !edge) {
      context.append(action('Unlock layer',() => change(() => { l.locked = false; })));
      return;
    }
    if (edge || node?.type === 'effect') {
      const back = action('Back to layer',() => { graph.clear(); syncInspector(); });
      context.append(back);
      if (effect) {
        const description = document.createElement('span');
        description.className = 'muted compact';
        description.textContent = effect.description;
        context.append(description);
        const parameters = runtimeModule.effectValues(effect,node.params.values);
        const advanced = document.createElement('details');
        advanced.dataset.node = node.id;
        advanced.open = !!showAdvanced;
        advanced.innerHTML = '<summary>Advanced</summary>';
        for (const p of effect.params) {
          const set = v => { node.params.values = {...parameters,[p.k]:v}; };
          const control = p.t === 'color' ? field(p.label,'color',parameters[p.k],set) :
            p.t === 'c' ? field(p.label,'select',String(parameters[p.k]),v => set(Number(v)),
              {choices:p.opts.map((name,i) => [String(i),name])}) :
            p.t === 'b' ? field(p.label,'select',String(parameters[p.k]),v => set(Number(v)),{choices:[['0','Off'],['1','On']]}) :
            field(p.label,'number',parameters[p.k],set,{min:p.min,max:p.max});
          (p.hero ? context : advanced).append(control);
        }
        if (advanced.childElementCount > 1) context.append(advanced);
        context.append(action(node.params.disabled ? 'Enable effect' : 'Bypass effect',() => {
          change(() => { node.params.disabled = !node.params.disabled; });
        }));
      } else if (node?.type === 'effect') {
        const label = document.createElement('span');
        label.className = 'muted compact';
        label.textContent = 'Unavailable effect · saved settings retained';
        context.append(label);
      }
      context.append(action(edge ? 'Disconnect' : 'Delete effect',() => graph.remove()));
      return;
    }
    if (!l && view !== 'spatial') context.append(paintPanel());
    if (!l) {
      if (!node && !edge && values.length > 1) {
        context.append(field('Align layers','select','',alignment => {
          const [w,h] = dims();
          const group = boxFor(values), center = box => (box.left+box.right)/2;
          for (const obj of values) {
            const b = R.bounds(obj,w,h);
            if (alignment === 'horizontal') obj.x = round(obj.x+center(group)-center(b));
            else if (alignment === 'vertical') obj.y = round(obj.y+(group.top+group.bottom-b.top-b.bottom)/2);
            else if (alignment === 'top' || alignment === 'bottom') obj.y = round(obj.y+group[alignment]-b[alignment]);
            else obj.x = round(obj.x+group[alignment]-b[alignment]);
          }
        },{choices:[['','Choose alignment…'],['left','Left edges'],['horizontal','Horizontal centers'],
          ['right','Right edges'],['top','Top edges'],['vertical','Vertical centers'],['bottom','Bottom edges']]}));
      }
      return;
    }
    if (l.type === 'scene' && gpu?.supportedAsset(l.asset)) {
      if (view !== 'spatial') context.append(action('Edit in Spatial',() => setView('spatial')));
      else {
        for (const [i,axis] of ['X','Y','Z'].entries()) {
          context.append(field(`Rotation ${axis} °`,'number',round(l.asset.transform.rotation[i]*180/Math.PI),
            v => gpu.setRotation(l,i,v),{min:-360,max:360}));
        }
        context.append(action('Return to Canvas',() => setView('canvas')));
      }
    }
    if (l.type === 'procedure') {
      context.append(action('Edit in Lab',() => editVectorInLab(l)),action('Expand to Paths',() => expandVector(l)));
      context.append(action('Rasterize vector',() => rasterizeVector(l)));
    }
    if (l.type === 'gradient') {
      context.append(field('Type','select',l.gradient.kind,v => { l.gradient.kind = v; },
        {choices:[['linear','Linear'],['radial','Radial']]}));
      context.append(field('Start color','color',l.gradient.start,v => { l.gradient.start = v; }),
        field('End color','color',l.gradient.end,v => { l.gradient.end = v; }));
    }
    if (view !== 'spatial' && l.chain) {
      for (const effect of l.chain.nodes.filter(n => n.type === 'effect')) {
        context.append(action(effects.get(effect.params.effect)?.name ?? 'Unavailable effect',() => graph.choose({node:effect.id})));
      }
    }
    const prop = (title,key,type,options) => field(title,type,l[key],v => { l[key] = v; },options);
    if (l.type === 'background') context.append(field('Colour','color',l.fill || '#1d1e20',v => { l.fill = v; }),
      action('Studio gradient',() => change(() => { delete l.fill; contextKey = ''; })),
      Object.assign(document.createElement('span'),{className:'muted compact',textContent:'Hide this layer for a transparent PNG.'}));
    if (l.type === 'text') context.append(action('Edit on canvas',() => startTextEdit(l)),

      prop('Text','text','textarea',{maxLength:2000}),
      prop('Font','font','select',{choices:[['sans-serif','Sans serif'],['serif','Serif'],['monospace','Monospace']]}),
      prop('Font size','fontSize','number',{min:8,max:600}),prop('Fill','fill','color'));
    if (l.type === 'shape' || l.type === 'path' || l.type === 'brush') {
      if (l.type === 'shape' || l.closed) context.append(prop('Fill','fill','color'));
      context.append(prop('Stroke','stroke','color'),prop('Stroke width','strokeWidth','number',{min:l.closed || l.type === 'shape' ? 0 : 1,max:200}));
    }
    if (l.type === 'shape' || l.type === 'image') {
      const sized = (title,key,other) => field(title,'number',Math.round(l[key]),v => {
        const ratio = l[other]/l[key];
        l[key] = Math.max(1,v);
        if (constrain) l[other] = Math.max(1,Math.round(l[key]*ratio));
        contextKey = '';
      },{min:1,max:8192});
      const toggle = action('Constrain proportions: '+(constrain ? 'on' : 'off'),() => { constrain = !constrain; contextKey = ''; syncInspector(); });
      toggle.setAttribute('aria-pressed',String(constrain));
      context.append(sized('Width','width','height'),sized('Height','height','width'),toggle);
    }
    if (l.type === 'shape') context.append(action('Edit points',() => pathFromShape(l)));
    if (l.type === 'path') context.append(action(editAnchors ? 'Done editing anchors' : 'Edit anchors',toggleAnchors));
    if (l.type === 'image' && l.crop) context.append(action('Reset crop',() => {
      contextKey = '';
      change(() => { delete l.crop; });
    }));
  }

  function sync() {
    board.classList.toggle('transparent',!doc.layers.some(l => l.type === 'background' && l.visible && l.opacity));
    board.classList.toggle('artboardlocked',!!doc.artboardLocked);
    $('undo').disabled = !stack.canUndo;
    $('redo').disabled = !stack.canRedo;
    $('docname').value = doc.name;
    $('ratio').value = doc.ratio === 'custom' && Math.abs((doc.size[0]/doc.size[1])/(stage.clientWidth/Math.max(1,stage.clientHeight))-1) < .03 ? 'workspace' : doc.ratio;
    $('resizeCustom').classList.toggle('hidden',doc.ratio !== 'custom');
    $('stagefoot').textContent = 'RGB · '+ratioName(doc);
    refreshGraphLayer();
    renderLayers();
    syncInspector();
    layout();
    schedule();
    graph.render();
  }

  function layout() {
    const [w,h] = dims(), width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    if (fitted) {
      const flush = Math.abs((w/h)/(width/height)-1) < .03;
      zoom = flush ? Math.max(.01,Math.min(width/w,height/h)) : Math.max(.01,Math.min((width-30)/w,(height-66)/h,1));
      pan = {x:0,y:flush ? 0 : -18};
    }
    board.classList.toggle('flush',Math.abs((w/h)/(width/height)-1) < .03);
    board.style.width = w*zoom+'px';
    board.style.height = h*zoom+'px';
    board.style.transform = `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`;
    overlay.setAttribute('viewBox',`0 0 ${w} ${h}`);
    $('dimension').textContent = `${w} × ${h} · ${Math.round(zoom*100)}%`;
    positionTextEdit();
    if (view === 'spatial' && activeLayer() && !gpu?.enter(activeLayer(),w,h)) {
      setView('canvas');
      return;
    }
    drawOverlay();
  }
  function fit() { fitted = true; layout(); }
  function schedule() {
    if (frame || view === 'spatial') return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (view !== 'spatial') renderComposition();
    });
  }
  function renderComposition() {
    const warnings = R.draw(canvas,doc,gpu);
    const warning = warnings[0] ?? '';
    if (warning && warning !== renderWarning) notice(warning);
    renderWarning = warning;
    $('stageStatus').textContent = warning ? 'RENDER NOTICE' : 'LIVE COMPOSITION';
    $('stageStatus').title = warning;
    drawOverlay();
  }

  function selectionGeometry(layers = visibleSelection()) {
    const [w,h] = dims();
    if (!layers.length) return null;
    if (layers.length === 1) return R.corners(layers[0],w,h);
    const b = S.union(layers.map(l => R.bounds(l,w,h)));
    return [{x:b.left,y:b.top},{x:b.right,y:b.top},{x:b.right,y:b.bottom},{x:b.left,y:b.bottom}];
  }
  const xy = p => `${p.x},${p.y}`;
  const rectangle = (a,b) => ({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});

  function drawOverlay() {
    overlay.replaceChildren();
    if (view === 'spatial') return;
    const [w,h] = dims();
    if (grid) {
      let d = '';
      const step = zoom < .3 ? 200 : 100;
      for (let x=step;x<w;x+=step) d += `M ${x} 0 V ${h} `;
      for (let y=step;y<h;y+=step) d += `M 0 ${y} H ${w} `;
      svg('path',{d,class:'grid'});
    }
    function line(x1,y1,x2,y2,cls) { svg('line',{x1,y1,x2,y2,class:cls}); }
    function handle(p,attrs,shape = 'rect') {
      const r = 3.4/zoom, hit = 11/zoom;
      svg(shape,shape === 'circle' ? {cx:p.x,cy:p.y,r,class:'handle'} :
        {x:p.x-r,y:p.y-r,width:r*2,height:r*2,class:'handle'});
      svg('circle',{cx:p.x,cy:p.y,r:hit,class:'hit',...attrs});
    }
    const layers = visibleSelection();
    const points = selectionGeometry(layers);
    if (points && (tool === 'select' || tool === 'crop') && gesture?.kind !== 'pinch') {
      svg('polygon',{points:points.map(xy).join(' '),class:'outline'});
      if (editAnchors && layers[0]?.type === 'path' && tool === 'select') {
        const l = layers[0], c = R.center(l,w,h);
        const world = (x,y) => {
          const p = R.transform(x*l.scale/100,y*l.scale/100,R.radians(l.rotation));
          return {x:c.x+p.x,y:c.y+p.y};
        };
        l.points.forEach(([x,y,dx,dy],i) => {
          const p = world(x,y), q = world(x+dx,y+dy), b = world(x-dx,y-dy);
          if (dx || dy) line(b.x,b.y,q.x,q.y,'outline');
          const tangent = dx || dy ? q : world(x+20*100/l.scale/zoom,y);
          if (!(dx || dy)) line(p.x,p.y,tangent.x,tangent.y,'outline');
          handle(tangent,{'data-anchor':i,'data-tangent':'true'},'circle');
          handle(p,{'data-anchor':i});
        });
      } else if (tool === 'select') {
        points.forEach((p,i) => handle(p,{'data-handle':i}));
        const top = midpoint(points[0],points[1]), bottom = midpoint(points[2],points[3]);
        const length = Math.hypot(top.x-bottom.x,top.y-bottom.y) || 1;
        const turn = {x:top.x+(top.x-bottom.x)*23/(length*zoom),y:top.y+(top.y-bottom.y)*23/(length*zoom)};
        line(top.x,top.y,turn.x,turn.y,'outline');
        handle(turn,{'data-handle':'rotate'},'circle');
      }
    }
    for (const guide of guides) {
      const {at,from,to,axis,ranges,gap} = guide;
      if (ranges) {
        for (const [a,b] of ranges) {
          if (axis === 'x') line(a,at,b,at,'guide');
          else line(at,a,at,b,'guide');
          const label = svg('text',{x:axis === 'x' ? (a+b)/2 : at+6/zoom,
            y:axis === 'x' ? at-5/zoom : (a+b)/2,'font-size':10/zoom,
            'stroke-width':3/zoom,'text-anchor':axis === 'x' ? 'middle' : 'start'});
          label.textContent = Math.round(gap)+' px';
        }
      } else if (axis === 'x') line(at,from,at,to,'guide');
      else line(from,at,to,at,'guide');
    }
    if (draft?.line) svg('line',{x1:draft.x1,y1:draft.y1,x2:draft.x2,y2:draft.y2,class:'draft'});
    else if (draft?.path) svg('path',{d:draft.path,class:'draft'});
    else if (draft) svg(draft.points ? 'polygon' : 'rect',{...draft,class:'draft'});
    if (pen.length) {
      const tail = hover && gesture?.kind !== 'pen' ? [[hover.x,hover.y,0,0]] : [];
      svg('path',{d:R.pathData({points:[...pen,...tail]}),class:'draft'});
      for (const [x,y,dx,dy] of pen) {
        if (dx || dy) line(x-dx,y-dy,x+dx,y+dy,'outline');
        svg('circle',{cx:x,cy:y,r:3.4/zoom,class:'handle'});
      }
    }
  }

  function setTool(next) {
    if (tool === 'pen' && next !== 'pen') { pen = []; hover = null; }
    if (next !== 'select') editAnchors = false;
    tool = next;
    stage.dataset.tool = tool;
    stateButtons('[data-tool]',tool,'tool');
    const picker = document.querySelector('[data-tool="picker"]');
    if (picker) {
      picker.style.setProperty('--paint-color',paintColor);
      picker.title = `Eyedropper · current ${paintColor}`;
    }
    drawOverlay();
  }
  function setView(next) {
    if (next === 'spatial' && (activeLayer()?.type !== 'scene' || !gpu?.supportedAsset(activeLayer().asset))) return;
    if (next === 'spatial' && view !== 'spatial') {
      graph.clear();
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      fitted = true;
      setSheet('canvas');
    } else if (view === 'spatial' && next !== 'spatial') {
      gpu?.exit();
    }
    view = next;
    $('stage').classList.toggle('viewcanvas',view === 'canvas' || view === 'spatial');
    $('stage').classList.toggle('viewgraph',view === 'graph');
    $('stage').classList.toggle('viewspatial',view === 'spatial');
    $('spatialCanvas').classList.toggle('hidden',view !== 'spatial');
    canvas.classList.toggle('hidden',view === 'spatial');
    $('export').disabled = view === 'spatial';
    $('stageStatus').textContent = view === 'spatial' ? 'DRAG A RING TO ROTATE' : 'LIVE COMPOSITION';
    refreshGraphLayer();
    stateButtons('[data-view]',view,'view');
    requestAnimationFrame(() => { layout(); graph.render(); });
    syncInspector();
    schedule();
  }
  function setSheet(next) {
    sheet = next;
    for (const name of ['left','right']) $(name).classList.toggle('mobileopen',name === sheet);
    stateButtons('[data-mobile]',sheet,'mobile');
  }
  function position(x,y) {
    const r = board.getBoundingClientRect();
    return {x:(x-r.left)/zoom,y:(y-r.top)/zoom};
  }
  let zoomLocked = false;
  try { zoomLocked = localStorage.getItem('n0ise.zoomlock') === '1'; } catch {}
  function zoomAt(x,y,value) {
    if (zoomLocked) { const q = stage.getBoundingClientRect(); x = q.left+q.width/2+pan.x; y = q.top+q.height/2+pan.y; } /* locked: zoom about the artboard's own centre, so it never drifts */
    const p = position(x,y), r = stage.getBoundingClientRect(), [w,h] = dims();
    const min = Math.min(.05,zoom);
    zoom = clamp(value,min,4);
    fitted = false;
    pan = {x:x-r.left-r.width/2-(p.x-w/2)*zoom,y:y-r.top-r.height/2-(p.y-h/2)*zoom};
    layout();
  }
  function touchPair() {
    const [a,b] = [...pointers.values()];
    return {center:midpoint(a,b),distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
  }
  function inPolygon(p,points) {
    let inside = false;
    for (let i=0,j=points.length-1;i<points.length;j=i++) {
      const a = points[i], b = points[j];
      if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
    }
    return inside;
  }
  function pickColor(p) {
    const [w,h] = dims(), x = Math.round(p.x), y = Math.round(p.y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const [r,g,b] = canvas.getContext('2d').getImageData(x,y,1,1).data;
    setPaint('#'+[r,g,b].map(n => n.toString(16).padStart(2,'0')).join(''));
    contextKey = '';
    setTool('select');
    notice(`Picked ${paintColor}`);
  }
  function snapshotTransforms(layers) {
    return layers.map(l => ({l,x:l.x,y:l.y,scale:l.scale,rotation:l.rotation}));
  }
  function boxFor(layers) {
    const [w,h] = dims();
    return S.union(layers.map(l => R.bounds(l,w,h)));
  }

  function toggleAnchors() {
    if (view === 'graph' || view === 'spatial') setView('canvas');
    setTool('select');
    editAnchors = !editAnchors;
    contextKey = '';
    syncInspector();
    drawOverlay();
  }
  function pathFromShape(l) {
    change(() => {
      Object.assign(l,{type:'path',closed:true,points:V.outline(l.shape,l.width,l.height)});
      delete l.shape;
      delete l.width;
      delete l.height;
      contextKey = '';
    });
    if (!editAnchors) toggleAnchors();
  }
  function placeShape(props = {}) {
    const l = build('shape',props);
    if (['rectangle','ellipse','triangle'].includes(shape)) {
      change(() => insert([l]));
      return;
    }
    const points = V.outline(shape,l.width,l.height);
    const line = shape === 'line';
    add('path',{name:V.shapes[shape],x:l.x,y:l.y,rotation:l.rotation,points,closed:!line,
      fill:l.fill,stroke:l.stroke,strokeWidth:line ? 6 : 0});
  }

  function penFinish(closed = false) {
    if (pen.length < 2) { notice('Place at least two points first.'); return; }
    const [w,h] = dims();
    const bounds = S.union(pen.map(([x,y]) => ({left:x,right:x,top:y,bottom:y})));
    const cx = (bounds.left+bounds.right)/2, cy = (bounds.top+bounds.bottom)/2;
    const points = pen.map(([x,y,dx,dy]) => [x-cx,y-cy,dx,dy]);
    pen = [];
    hover = null;
    add('path',{points,x:cx-w/2,y:cy-h/2,closed});
    setTool('select');
  }

  function endGesture(cancelled) {
    const g = gesture;
    gesture = null;
    guides = [];
    draft = null;
    delete stage.dataset.drag;
    if (!g) { drawOverlay(); return; }
    if (cancelled) {
      if (g.kind === 'pen') pen.pop();
      if (g.before && g.edited) restore(g.before);
      else { drawOverlay(); schedule(); }
      return;
    }
    if (g.kind === 'marquee' && g.moved) {
      const [w,h] = dims(), b = rectangle(g.p,g.now);
      const ids = doc.layers.filter(l => l.visible && !l.locked && l.opacity && !['background','crt'].includes(l.type)).filter(l => {
        const bounds = R.bounds(l,w,h);
        return bounds.left <= b.x+b.width && bounds.right >= b.x &&
          bounds.top <= b.y+b.height && bounds.bottom >= b.y;
      }).map(l => l.id);
      select([...new Set([...g.base,...ids])]);
    }
    if (g.kind === 'gradient') {
      const [w,h] = dims(), end = g.now ?? {x:g.p.x+Math.min(w*.55,500),y:g.p.y};
      add('gradient',{gradient:{kind:'linear',from:[g.p.x-w/2,g.p.y-h/2],
        to:[end.x-w/2,end.y-h/2],start:paintColor,end:'#101112'}});
      setTool('select');
    }
    if (g.kind === 'lasso') {
      const [w,h] = dims();
      if (g.points.length >= 3) {
        const ids = doc.layers.filter(l => l.visible && !l.locked && l.opacity && !['background','crt'].includes(l.type)).filter(l => {
          const b = R.bounds(l,w,h);
          return inPolygon({x:(b.left+b.right)/2,y:(b.top+b.bottom)/2},g.points);
        }).map(l => l.id);
        select([...new Set([...g.base,...ids])]);
      }
      setTool('select');
    }
    if (g.kind === 'shape' && g.moved) {
      const [w,h] = dims(), b = rectangle(g.p,g.now);
      const point = {x:b.x+b.width/2-w/2,y:b.y+b.height/2-h/2};
      if (shape === 'line') {
        const dx = g.now.x-g.p.x, dy = g.now.y-g.p.y;
        placeShape({...point,width:Math.max(2,Math.hypot(dx,dy)),rotation:Math.atan2(dy,dx)*180/Math.PI});
      } else placeShape({...point,width:Math.max(2,b.width),height:Math.max(2,b.height)});
      setTool('select');
    } else if (g.kind === 'shape') {
      const [w,h] = dims();
      placeShape({x:g.p.x-w/2,y:g.p.y-h/2});
      setTool('select');
    }
    if (g.kind === 'crop' && g.moved && g.crop?.[2] > 0 && g.crop?.[3] > 0) {
      contextKey = '';
      change(() => { g.l.crop = g.crop; });
      setTool('select');
    }
    if (g.kind === 'brush') {
      const [w,h] = dims(), l = g.l;
      const bounds = S.union(l.points.map(([x,y]) => ({left:x,right:x,top:y,bottom:y})));
      const cx = (bounds.left+bounds.right)/2, cy = (bounds.top+bounds.bottom)/2;
      const outline = V.stroke(l.points,g.pressure,l.strokeWidth);
      Object.assign(l,{x:cx-w/2,y:cy-h/2,type:'path',name:g.eraser ? 'Eraser stroke' : 'Vector stroke',
        closed:true,fill:l.stroke,strokeWidth:0,
        points:outline.map(([x,y,dx,dy]) => [x-cx,y-cy,dx,dy])});
    }
    const changed = !g.items || g.items.some(({l,x,y,scale,rotation}) =>
      l.x !== x || l.y !== y || l.scale !== scale || l.rotation !== rotation);
    if (g.edited && changed) finish(g.before);
    else drawOverlay();
  }

  stage.addEventListener('pointerdown',e => {
    if (view === 'spatial' || e.target.closest('button,#textEdit,#inlineText') || e.button > 1) return;
    if (doc.artboardLocked && e.button === 0 && pointers.size < 2) { if (e.pointerType !== 'touch') notice('Artboard is locked. Right-click it to unlock.'); return; }
    if (textEdit) { finishTextEdit(); return; }
    stage.focus({preventScroll:true});
    if (e.pointerType === 'touch') {
      e.preventDefault();
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pointers.size === 2) {
        endGesture(true);
        try { stage.setPointerCapture(e.pointerId); } catch {}
        const pair = touchPair();
        gesture = {kind:'pinch',...pair,z:zoom};
        e.preventDefault();
        return;
      }
    }
    if (gesture) return;
    const p = position(e.clientX,e.clientY), [w,h] = dims();
    const inside = p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
    const multi = e.shiftKey || e.metaKey || e.ctrlKey;
    const base = {pointer:e.pointerId,sx:e.clientX,sy:e.clientY,p,moved:false,edited:false};
    const handle = e.target.dataset.handle;
    const anchor = e.target.dataset.anchor;
    const layers = visibleSelection();
    const active = layers.length === 1 ? layers[0] : null;

    if (space || e.button === 1 || (!inside && e.pointerType === 'touch' && handle === undefined && anchor === undefined)) {
      gesture = {...base,kind:'pan',pan:{...pan}};
      stage.dataset.drag = 'true';
    } else if (tool === 'select' && anchor !== undefined && active?.type === 'path') {
      gesture = {...base,kind:'anchor',l:active,index:Number(anchor),tangent:e.target.dataset.tangent === 'true',before:capture()};
    } else if (tool === 'select' && handle !== undefined && layers.length) {
      const corners = selectionGeometry(layers);
      const rotate = handle === 'rotate';
      const pivot = rotate ? midpoint(corners[0],corners[2]) : corners[(Number(handle)+2)%4];
      const origin = rotate ? p : corners[Number(handle)];
      gesture = {...base,kind:rotate ? 'rotate' : 'scale',pivot,origin,items:snapshotTransforms(layers),before:capture()};
    } else if (tool === 'select') {
      const hit = inside ? doc.layers.find(l => !l.locked && R.inside(l,p,w,h,5/zoom)) : null;
      const inGroup = layers.length > 1 && (() => {
        const b = boxFor(layers);
        return p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
      })();
      if (hit && multi) { select(toggleId(selection,hit.id)); return; }
      if (hit || (inside && inGroup)) {
        if (hit && !selection.includes(hit.id)) select([hit.id]);
        const moving = visibleSelection();
        const targets = doc.layers.filter(l => l.visible && l.opacity && !selection.includes(l.id) &&
          l.type !== 'background' && l.type !== 'crt').map(l => R.bounds(l,w,h));
        gesture = {...base,kind:'move',items:snapshotTransforms(moving),bounds:boxFor(moving),targets,before:capture()};
      } else {
        const keep = multi ? [...selection] : [];
        if (!multi) select([]);
        gesture = {...base,kind:'marquee',base:keep};
      }
    } else if (!inside) return;
    else if (tool === 'lasso') {
      gesture = {...base,kind:'lasso',points:[p],base:multi ? [...selection] : []};
    } else if (tool === 'picker') {
      pickColor(p);
      return;
    } else if (tool === 'brush' || tool === 'eraser') {
      const before = capture();
      const l = build('brush',{points:[[p.x,p.y]],x:-w/2,y:-h/2,
        ...(tool === 'eraser' ? {name:'Eraser stroke',blend:'destination-out'} : {})});
      insert([l]);
      const pressure = e.pointerType === 'pen' ? [e.pressure] : undefined;
      gesture = {...base,kind:'brush',before,l,pressure,edited:true,eraser:tool === 'eraser'};
      schedule();
    } else if (tool === 'pen') {
      if (pen.length > 2 && Math.hypot(p.x-pen[0][0],p.y-pen[0][1])*zoom <= 11) {
        penFinish(true);
        return;
      }
      pen.push([p.x,p.y,0,0]);
      gesture = {...base,kind:'pen'};
      drawOverlay();
    } else if (tool === 'text') {
      e.preventDefault();
      const before = capture(), l = build('text',{text:'',x:p.x-w/2,y:p.y-h/2});
      insert([l]);
      setTool('select');
      sync();
      startTextEdit(l,before);
      return;
    } else if (tool === 'crop') {
      if (active?.type !== 'image') { notice('Select an image to crop it.'); return; }
      gesture = {...base,kind:'crop',l:active};
    } else if (tool === 'shape' || tool === 'line') {
      if (tool === 'line') shape = 'line';
      gesture = {...base,kind:'shape'};
    }
    else if (tool === 'gradient') gesture = {...base,kind:'gradient'};
    if (gesture) {
      e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch {}
    }
  },{passive:false});

  function startTextEdit(l,before) {
    if (textEdit) finishTextEdit();
    if (view === 'graph' || view === 'spatial') setView('canvas');
    setSheet('canvas');
    if (!selection.includes(l.id) || selection.length !== 1) select([l.id]);
    const [w,h] = dims();
    const created = !!before;
    const measured = textWidth(l);
    const anchor = {x:created ? l.x+w/2 : l.x+w/2-measured/2,
      y:l.y+h/2-l.fontSize*.45};
    const input = document.createElement('textarea');
    input.id = 'inlineText';
    input.className = 'inline-text';
    input.setAttribute('aria-label','Type on canvas');
    input.maxLength = 2000;
    input.rows = 1;
    input.wrap = 'off';
    input.placeholder = 'Type here…';
    input.value = l.text;
    board.append(input);
    textEdit = {layer:l,before:before ?? capture(),original:l.text,created,anchor,input};
    inlineText = input;
    positionTextEdit();
    input.focus({preventScroll:true});
    input.setSelectionRange(input.value.length,input.value.length);
  }
  function textWidth(l) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.font = `${l.fontSize}px ${l.font || 'sans-serif'}`;
    const width = Math.max(1,...String(l.text || '').split('\n').map(line => ctx.measureText(line).width));
    ctx.restore();
    return width;
  }
  function positionTextEdit() {
    const edit = textEdit;
    if (!edit || !edit.input.isConnected) return;
    const {layer:l,input,anchor} = edit, [w,h] = dims();
    const width = textWidth(l);
    l.x = anchor.x + width*l.scale/200 - w/2;
    l.y = anchor.y + l.fontSize*.45*l.scale/100 - h/2;
    const lines = Math.max(1,input.value.split('\n').length);
    input.style.left = `${anchor.x*100/w}%`;
    input.style.top = `${anchor.y*100/h}%`;
    input.style.fontSize = `${l.fontSize*zoom}px`;
    input.style.fontFamily = l.font || 'sans-serif';
    input.style.color = 'transparent'; /* the canvas draws the live text; this box only supplies the caret and selection, so nothing is doubled */
    input.style.lineHeight = '1.2';
    input.style.width = `${Math.max(2,Math.min(46,Math.max(input.value.length,8)+1))}ch`;
    input.style.height = `${Math.max(1,l.fontSize*zoom*l.scale/100*1.2*lines)}px`;
    input.style.transform = `rotate(${l.rotation}deg) scale(${l.scale/100})`;
  }
  function finishTextEdit(cancelled = false) {
    if (!textEdit) return;
    const edit = textEdit;
    textEdit = null;
    edit.input.remove();
    inlineText = null;
    if (cancelled || (edit.created && !edit.layer.text.trim())) {
      restore(edit.before);
    } else if (edit.created || edit.original !== edit.layer.text) {
      contextKey = '';
      finish(edit.before);
    }
  }
  board.addEventListener('input',e => {
    if (e.target !== inlineText || !textEdit) return;
    textEdit.layer.text = e.target.value;
    positionTextEdit();
    schedule();
  });
  board.addEventListener('keydown',e => {
    if (e.target !== inlineText || e.isComposing) return;
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      finishTextEdit(e.key === 'Escape');
      stage.focus({preventScroll:true});
    }
  });
  board.addEventListener('focusout',e => {
    if (e.target === inlineText) finishTextEdit();
  });
  stage.addEventListener('dblclick',e => {
    if (tool !== 'select' || view === 'spatial' || e.target.closest('button,#textEdit,#inlineText')) return;
    const p = position(e.clientX,e.clientY), [w,h] = dims();
    const top = doc.layers.find(l => R.inside(l,p,w,h,5/zoom));
    if (top?.type === 'text') startTextEdit(top);
    else if (top?.type === 'shape' && !top.locked && !doc.artboardLocked) pathFromShape(top);
    else if (top?.type === 'path' && !top.locked && !editAnchors) { select([top.id]); toggleAnchors(); }
  });

  function cropPreview(g,p,w,h) {
    const l = g.l;
    const a = R.local(l,g.p,w,h), b = R.local(l,p,w,h);
    const rect = rectangle(a,b), old = l.crop ?? [0,0,1,1];
    const x = clamp(rect.x/l.width+.5,old[0],old[0]+old[2]);
    const y = clamp(rect.y/l.height+.5,old[1],old[1]+old[3]);
    const endX = clamp((rect.x+rect.width)/l.width+.5,old[0],old[0]+old[2]);
    const endY = clamp((rect.y+rect.height)/l.height+.5,old[1],old[1]+old[3]);
    const c = R.center(l,w,h);
    g.crop = [x,y,endX-x,endY-y];
    draft = {points:[[x,y],[endX,y],[endX,endY],[x,endY]].map(([px,py]) => {
      const q = R.transform((px-.5)*l.width*l.scale/100,(py-.5)*l.height*l.scale/100,R.radians(l.rotation));
      return xy({x:q.x+c.x,y:q.y+c.y});
    }).join(' ')};
  }

  stage.addEventListener('pointermove',e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const g = gesture;
    if (g?.kind === 'pinch' && pointers.size === 2) {
      const pair = touchPair();
      zoomAt(g.center.x,g.center.y,g.z*pair.distance/g.distance);
      if (!zoomLocked) { pan.x += pair.center.x-g.center.x; pan.y += pair.center.y-g.center.y; }
      Object.assign(g,pair,{z:zoom});
      layout();
      return;
    }
    const p = position(e.clientX,e.clientY);
    if (!g) {
      if (tool === 'pen' && pen.length) { hover = p; drawOverlay(); }
      return;
    }
    if (g.pointer !== e.pointerId) return;
    const dx = e.clientX-g.sx, dy = e.clientY-g.sy;
    if (!g.moved && Math.hypot(dx,dy) < 3) return;
    g.moved = true;
    const [w,h] = dims();
    const update = () => { g.edited = true; schedule(); syncInspector(); };
    if (g.kind === 'pan') {
      fitted = false;
      pan = {x:g.pan.x+dx,y:g.pan.y+dy};
      layout();
    } else if (g.kind === 'move') {
      let x = dx/zoom, y = dy/zoom;
      guides = [];
      if (snapping && !e.altKey && g.bounds) {
        const result = S.move(S.translate(g.bounds,x,y),g.targets,w,h,zoom);
        x += result.x;
        y += result.y;
        guides = result.guides;
      }
      for (const item of g.items) Object.assign(item.l,{x:round(item.x+x),y:round(item.y+y)});
      update();
    } else if (g.kind === 'scale' || g.kind === 'rotate') {
      const {origin,pivot} = g;
      const a = {x:origin.x-pivot.x,y:origin.y-pivot.y};
      const b = {x:a.x+dx/zoom,y:a.y+dy/zoom};
      const min = Math.max(...g.items.map(i => 1/i.scale));
      const max = Math.min(...g.items.map(i => 2000/i.scale));
      const factor = g.kind === 'scale' ? clamp((a.x*b.x+a.y*b.y)/(a.x*a.x+a.y*a.y || 1),min,max) : 1;
      let angle = 0;
      if (g.kind === 'rotate') {
        angle = (Math.atan2(b.y,b.x)-Math.atan2(a.y,a.x))*180/Math.PI;
        if (!e.altKey && (angular || e.shiftKey)) {
          const base = g.items.length === 1 ? g.items[0].rotation : 0;
          angle = Math.round((base+angle)/15)*15-base;
        }
      }
      for (const item of g.items) {
        const pos = R.transform((item.x+w/2-pivot.x)*factor,(item.y+h/2-pivot.y)*factor,R.radians(angle));
        Object.assign(item.l,{x:round(pivot.x+pos.x-w/2),y:round(pivot.y+pos.y-h/2),
          scale:round(item.scale*factor),rotation:round(item.rotation+angle)});
      }
      update();
    } else if (g.kind === 'lasso') {
      const last = g.points.at(-1);
      if (Math.hypot(p.x-last.x,p.y-last.y)*zoom >= 2) g.points.push(p);
      draft = {path:'M '+g.points.map(point => `${point.x} ${point.y}`).join(' L ')};
      drawOverlay();
    } else if (g.kind === 'gradient') {
      g.now = p;
      draft = {line:true,x1:g.p.x,y1:g.p.y,x2:p.x,y2:p.y};
      drawOverlay();
    } else if (g.kind === 'marquee' || g.kind === 'shape') {
      g.now = p;
      draft = rectangle(g.p,p);
      drawOverlay();
    } else if (g.kind === 'crop') {
      cropPreview(g,p,w,h);
      drawOverlay();
    } else if (g.kind === 'brush') {
      const last = g.l.points.at(-1);
      if (Math.hypot(p.x-last[0],p.y-last[1])*zoom < 1.5) return;
      g.l.points.push([p.x,p.y]);
      g.pressure?.push(e.pressure);
      schedule();
    } else if (g.kind === 'pen') {
      const last = pen.at(-1);
      last[2] = p.x-last[0];
      last[3] = p.y-last[1];
      drawOverlay();
    } else if (g.kind === 'anchor') {
      const q = R.local(g.l,p,w,h), point = [...g.l.points[g.index]];
      if (g.tangent) [point[2],point[3]] = [q.x-point[0],q.y-point[1]];
      else [point[0],point[1]] = [q.x,q.y];
      g.l.points = g.l.points.map((v,i) => i === g.index ? point : v);
      update();
    }
  });
  function pointerEnd(e,cancelled) {
    pointers.delete(e.pointerId);
    if (gesture?.kind === 'pinch' || gesture?.pointer === e.pointerId) endGesture(cancelled);
  }
  stage.addEventListener('pointerup',e => pointerEnd(e,false));
  stage.addEventListener('pointercancel',e => pointerEnd(e,true));
  stage.addEventListener('lostpointercapture',e => pointerEnd(e,true));
  stage.addEventListener('wheel',e => {
    e.preventDefault();
    if (view !== 'spatial' && !gesture) zoomAt(e.clientX,e.clientY,zoom*Math.exp(-e.deltaY*.0017));
  },{passive:false});
  stage.addEventListener('pointerleave',() => {
    if (pen.length && !gesture) { hover = null; drawOverlay(); }
  });
  new ResizeObserver(layout).observe(stage);

  function menu(title,entries,closeLabel = 'Close') {
    $('modaltitle').textContent = title;
    $('modalcancel').textContent = closeLabel;
    const content = $('modalcontent');
    content.className = 'modalmenu';
    content.replaceChildren();
    for (const [label,run] of entries) content.append(action(label,() => {
      $('modal').close();
      run();
    }));
    $('modal').showModal();
  }

  const recentEffects = [];
  function openEffects() {
    const l = activeLayer();
    if (!compatible(l)) { notice('Select a compatible visible layer first.'); return; }
    runtimeModule?.prepare?.();   // compiles the effects once so the list only offers ones that work
    const dialog = $('modal'), content = $('modalcontent');
    $('modaltitle').textContent = 'Add Effect';
    $('modalcancel').textContent = 'Close';
    content.className = 'effect-palette';
    const search = document.createElement('input'), list = document.createElement('div');
    search.className = 'field';
    search.type = 'search';
    search.placeholder = 'Search by effect or purpose';
    search.setAttribute('aria-label','Search effects');
    list.className = 'effect-results';
    const add = definition => {
      const before = capture();
      const chain = copy(l.chain ?? visibleGraph());
      try {
        const n = G.insertEffect(chain,StudioDocument.id(),definition.id,runtimeModule.effectValues(definition));
        l.chain = chain;
        recentEffects.splice(0,recentEffects.length,definition.id,...recentEffects.filter(id => id !== definition.id).slice(0,2));
        dialog.close();
        graph.choose({node:n.id});
        finish(before);
        if (view === 'graph' || view === 'split') graph.fit();
        if (mobile.matches) setSheet('right');
        else {
          $('workspace').classList.remove('no-right');
          $('toggleInspector').setAttribute('aria-pressed','true');
        }
      } catch (e) { notice(e.message); }
    };
    function results() {
      list.replaceChildren();
      const query = search.value.trim().toLowerCase();
      const matching = [...effects.values()].filter(d =>
        `${d.name} ${d.family} ${d.description}`.toLowerCase().includes(query));
      const groups = new Map();
      if (!query && recentEffects.length) groups.set('Recent',recentEffects.map(id => effects.get(id)));
      for (const definition of matching) {
        if (!groups.has(definition.family)) groups.set(definition.family,[]);
        groups.get(definition.family).push(definition);
      }
      if (!groups.size) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No matching effects.';
        list.append(empty);
      }
      for (const [category,entries] of groups) {
        const title = document.createElement('div');
        title.className = 'fieldlabel';
        title.textContent = category;
        list.append(title);
        for (const d of entries) {
          const button = action(d.name,() => add(d));
          const caption = document.createElement('small');
          caption.textContent = d.description;
          button.append(caption);
          list.append(button);
        }
      }
    }
    search.oninput = results;
    search.onkeydown = e => {
      if (e.key !== 'Enter' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const first = list.querySelector('button');
      if (e.key === 'Enter') first?.click();
      else first?.focus();
    };
    content.replaceChildren(search,list);
    results();
    dialog.showModal();
  }

  function duplicateLayers() {
    const clones = selected().map(l => {
      const clone = {...copy(l),id:StudioDocument.id(),name:(l.name+' copy').slice(0,120),x:l.x+16,y:l.y+16};
      if (clone.type === 'procedure') clone.definition.id = vector.vectorId();
      return clone;
    });
    if (clones.length) change(() => insert(clones));
  }
  /* node graph: right-click (or long-press on touch) opens the commands for what is under the pointer */
  function graphMenu(x,y,target) {
    const g = visibleGraph();
    if (!g) return;
    const nodeId = target.closest('[data-node]')?.dataset.node, edgeId = target.closest('[data-edge]')?.dataset.edge;
    const node = g.nodes.find(n => n.id === nodeId), actions = [];
    if (node) {
      graph.choose({node:node.id});
      if (node.type === 'effect') {
        actions.push([node.params.disabled ? 'Enable effect' : 'Bypass effect',() => change(() => { node.params.disabled = !node.params.disabled; })]);
      }
      if (g.edges.some(e => e.to === node.id)) actions.push(['Disconnect input',() => { graph.choose({edge:node.id}); graph.remove(); }]);
      if (node.type === 'effect') actions.push(['Delete effect',() => { graph.choose({node:node.id}); graph.remove(); }]);
    } else if (edgeId) {
      graph.choose({edge:edgeId});
      actions.push(['Disconnect',() => graph.remove()]);
    } else {
      actions.push(['Add effect…',openEffects]);
    }
    actions.push(['Fit graph',() => graph.fit()]);
    contextMenu.show(x,y,actions);
  }
  { const svg = $('graphsvg'); let press = null;
    const stop = () => { clearTimeout(press?.timer); press = null; };
    svg.addEventListener('pointerdown',e => {
      stop();
      if (e.pointerType !== 'touch') return;
      const target = e.target;
      press = {x:e.clientX,y:e.clientY,timer:setTimeout(() => { const p = press; press = null; if (p) { navigator.vibrate?.(12); graphMenu(p.x,p.y,target); } },480)};
    });
    svg.addEventListener('pointermove',e => { if (press && Math.hypot(e.clientX-press.x,e.clientY-press.y) > 10) stop(); });
    svg.addEventListener('pointerup',stop);
    svg.addEventListener('pointercancel',stop);
    svg.addEventListener('contextmenu',e => { e.preventDefault(); e.stopPropagation(); stop(); graphMenu(e.clientX,e.clientY,e.target); });
  }
  document.addEventListener('contextmenu',e => {
    if (e.target.closest('#graphsvg')) return;
    if (launcher.open || $('modal').open || gesture || e.target.closest('input,textarea,select,a,#textEdit') ||
      !e.target.closest('#workspace')) return;
    const onStage = stage.contains(e.target), row = e.target.closest('[data-layer-id]');
    if (!onStage && !row) return;
    if (view === 'spatial' && onStage) return;
    e.preventDefault();
    const point = onStage ? position(e.clientX,e.clientY) : null;
    const [w,h] = dims();
    const hit = row ? doc.layers.find(l => l.id === row.dataset.layerId) :
      point && doc.layers.find(l => R.inside(l,point,w,h,5/zoom));
    if (hit && !selection.includes(hit.id)) select([hit.id]);
    const actions = [];
    if (hit) {
      if (hit.locked) actions.push(['Unlock layer',() => change(() => { hit.locked = false; })]);
      else {
        if (hit.type === 'procedure') actions.push(['Edit in Lab',() => editVectorInLab(hit)]);
        if (hit.type === 'text') actions.push(['Edit text',() => startTextEdit(hit)]);
        if (hit.type === 'path' && selection.length === 1) actions.push(['Edit anchors',toggleAnchors]);
        if (hit.type === 'shape' && selection.length === 1) actions.push(['Edit points',() => pathFromShape(hit)]);
      }
      actions.push(['Duplicate',duplicateLayers],['Delete',remove],['Deselect',() => select([])]);
      if (doc.artboardLocked) actions.push(['Unlock artboard',() => change(() => { doc.artboardLocked = false; })]);
    } else {
      actions.push(['Text',() => setTool('text')],['Vector shapes',shapePicker],['Freehand',() => setTool('brush')],
        ['Lasso selection',() => setTool('lasso')],
        ['Eraser',() => setTool('eraser')],['Gradient fill',() => setTool('gradient')],
        ['Eyedropper',() => setTool('picker')],['Import image…',() => $('imageFile').click()]);
      if (selection.length) actions.push(['Deselect',() => select([])]);
      actions.push([doc.artboardLocked ? 'Unlock artboard' : 'Lock artboard',() => change(() => { doc.artboardLocked = !doc.artboardLocked; })],
        ['Rename artboard',() => { $('docname').focus(); $('docname').select(); }],['Export…',() => $('export').click()],
        ['Fit to screen',fit],[zoomLocked ? 'Unlock zoom anchor' : 'Lock zoom anchor',() => $('zoomLock').click()]);
    }
    const rect = e.target.getBoundingClientRect();
    contextMenu.show(e.clientX || rect.left,e.clientY || rect.bottom,actions);
  });
  document.addEventListener('pointerdown',e => {
    if (e.button !== 0 || !selection.length || launcher.open || $('modal').open ||
      e.target.closest('button,a,input,select,textarea,label,summary,#studioContext,#graph,#artboard,#textEdit,.panel-handle')) return;
    if (e.target.closest('.top,.documentbar,#workspace')) select([]);
  },true);

  function openAdd() {
    if (view === 'graph' || view === 'spatial') setView('canvas');
    menu('Add to composition',[
      ['Import image…',() => $('imageFile').click()],
      ['Import background image…',() => { $('imageFile').dataset.background = 'true'; $('imageFile').click(); }],
      ['Metallic torus',addScene],
      ['Chrome form',() => add('chrome')],
      ['CRT effect',() => add('crt')],
      ['Background',() => add('background')],
      ['Gradient fill',() => setTool('gradient')],
      ['Centered shape',() => add('shape')],
      ['Text',() => { setTool('text'); notice('Tap the artboard to place text.'); }]
    ]);
  }
  /* Compact icon palette anchored above the Shape button (replaces the full-screen menu) */
  const shapeIcons = {
    rectangle:'<rect x="4" y="6" width="16" height="12" rx="1"/>',ellipse:'<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    triangle:'<path d="M12 5 20 19H4z"/>',diamond:'<path d="M12 4 20 12 12 20 4 12z"/>',
    hexagon:'<path d="M8 5h8l4 7-4 7H8l-4-7z"/>',star:'<path d="m12 4 2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.3 7 19l1.1-5.5L4 9.7 9.6 9z"/>',
    line:'<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/>'
  };
  function closeShapePalette(restore = true) {
    const pal = $('shapePalette');
    if (!pal) return;
    pal.remove();
    document.removeEventListener('pointerdown',pal._out,true);
    document.removeEventListener('keydown',pal._key,true);
    if (restore) document.querySelector('[data-tool="shape"]')?.focus();
  }
  function shapePicker() {
    closeShapePalette(false);
    const anchor = document.querySelector('[data-tool="shape"]');
    const pal = document.createElement('div');
    pal.id = 'shapePalette'; pal.className = 'shapepal'; pal.setAttribute('role','menu'); pal.setAttribute('aria-label','Vector shapes');
    for (const [id,name] of Object.entries(V.shapes)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tool'+(id === shape ? ' on' : ''); b.setAttribute('role','menuitem');
      b.setAttribute('aria-label',name); b.title = name;
      b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${shapeIcons[id] || ''}</svg>`;
      b.onclick = () => { closeShapePalette(false); chooseShape(id); };
      pal.append(b);
    }
    document.body.append(pal);
    const r = anchor.getBoundingClientRect(), pw = pal.offsetWidth, ph = pal.offsetHeight;
    pal.style.left = Math.max(8,Math.min(innerWidth-pw-8,r.left+r.width/2-pw/2))+'px';
    pal.style.top = Math.max(8,r.top-ph-10)+'px';
    pal._out = e => { if (!pal.contains(e.target) && !e.target.closest('[data-tool="shape"]')) closeShapePalette(false); };
    pal._key = e => {
      const items = [...pal.querySelectorAll('button')], i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeShapePalette(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); items[(i+1)%items.length].focus(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); items[(i-1+items.length)%items.length].focus(); }
    };
    document.addEventListener('pointerdown',pal._out,true);
    document.addEventListener('keydown',pal._key,true);
    (pal.querySelector('.on') || pal.querySelector('button')).focus();
  }
  function chooseShape(next) {
    shape = next;
    setTool('shape');
    notice('Drag to draw or tap to place.');
  }

  function download(blob,extension,title = doc.name) {
    const url = URL.createObjectURL(blob);
    const name = title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'').trim() || 'n0ise-studio';
    const link = document.createElement('a');
    link.href = url;
    link.download = name+'.'+extension;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),30000);
  }
  function save() {
    download(new Blob([JSON.stringify(doc)],{type:'application/json'}),'n0studio.json');
    dirty = false;
    notice('Project downloaded.');
  }
  function renderExport() {
    finishTextEdit();
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      renderComposition();
    }
  }
  function exportPNG() {
    renderExport();
    return new Promise((resolve,reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(Error('PNG export failed.'));
    },'image/png'));
  }
  async function downloadPNG() {
    const title = doc.name;
    try {
      download(await exportPNG(),'png',title);
      notice('PNG downloaded.');
    } catch (e) { notice(e.message); }
  }
  function downloadSVG() {
    renderExport();
    try {
      const markup = R.toSVG(doc,gpu,canvas);
      download(new Blob([markup],{type:'image/svg+xml'}),'svg');
      notice('SVG downloaded.');
    } catch { notice('SVG export failed.'); }
  }
  /* tell the node editor what this design is made of (its layers) and where it went */
  async function hubRecord(blob,to) {
    const hub = await import('../src/hub.js');
    await hub.record({tool:'studio',name:doc.name,to,blob,
      layers:[...doc.layers].reverse().filter(l => l.type !== 'background').map(l => ({name:l.name,kind:l.type,off:!l.visible}))});
  }
  async function showInNodes() {
    try { await hubRecord(await exportPNG(),null); location.href = 'nodes.html'; }
    catch { notice('Could not open the node editor.'); }
  }
  async function sendArtwork(destination) {
    const tab = window.open('about:blank','_blank');
    if (!tab) { notice('Allow pop-ups to open the exported image in another tool.'); return; }
    tab.opener = null;
    try {
      const [blob,handoff] = await Promise.all([exportPNG(),import('../src/handoff.js')]);
      await handoff.put(blob,{from:'studio',name:doc.name,to:destination});
      await hubRecord(blob,destination);
      tab.location.replace(new URL((destination === 'effects' ? 'effects.html' : 'studio.html')+'#from=studio',location.href));
    } catch {
      tab.close();
      notice('Could not send the artwork. Download a PNG to open it in the other tool.');
    }
  }
  function exportOptions() {
    if (gesture || view === 'spatial') return;
    menu('Export artwork',[
      ['Download PNG',downloadPNG],
      ['Download SVG',downloadSVG],
      ['Save editable project',save],
      ['Show in node editor',showInNodes],
      ['Open in Effects',() => sendArtwork('effects')],
      ['Open in 3D as relief',() => sendArtwork('3d')]
    ]);
  }
  function useDocument(next) {
    projectEpoch++;
    vectorEdits.clear();
    opening++;
    dirty = false;
    stack.clear();
    setTool('select');
    setSheet('canvas');
    fitted = true;
    restore({doc:next,selection:[]});
    setView('canvas');
    graph.fit();
  }
  function replaceDocument(run) {
    if (!dirty) { run(); return; }
    menu('Unsaved changes',[
      ['Save project first',() => { save(); run(); }],
      ['Continue without saving',run]
    ],'Cancel');
  }
  const launcher = $('launcher');
  function launchLayout() {
    const custom = $('launchRatio').value === 'custom';
    $('launchCustom').classList.toggle('hidden',!custom);
    for (const key of ['launchWidth','launchHeight']) $(key).required = custom;
    $('launchStatus').textContent = '';
  }
  function openLauncher(mode = 'new') {
    launchMode = mode;
    $('launchTitle').textContent = mode === 'resize' ? 'Canvas dimensions' : 'Make something.';
    $('launchCreate').firstChild.textContent = mode === 'resize' ? 'Resize canvas ' : 'Blank canvas ';
    launcher.classList.toggle('resize-only',mode === 'resize');
    $('launchRatio').value = mode === 'resize' ? 'custom' : 'workspace';
    const [w,h] = mode === 'resize' ? dims() : workspaceSize();
    $('launchWidth').value = w;
    $('launchHeight').value = h;
    launchLayout();
    launcher.showModal();
  }
  function launchSize() {
    let ratio = $('launchRatio').value;
    if (ratio === 'workspace') { ratio = 'custom'; return {ratio,size:workspaceSize()}; }
    const size = ratio === 'custom' ? [$('launchWidth').valueAsNumber,$('launchHeight').valueAsNumber] : sizes[ratio];
    if (!validSize(size)) {
      $('launchStatus').textContent = 'Use 64–4096 px per side and up to 8 megapixels.';
      return null;
    }
    return {ratio,size};
  }
  function setDimensions(ratio,size) {
    fitted = true;
    if (doc.ratio === ratio && dimensions(doc).every((n,i) => n === size[i])) return;
    change(() => {
      doc.ratio = ratio;
      if (ratio === 'custom') doc.size = size;
      else delete doc.size;
    });
  }
  function launchProject(demo) {
    const config = launchSize();
    if (!config) return;
    launcher.close();
    if (launchMode === 'resize') { setDimensions(config.ratio,config.size); return; }
    const next = create(config.ratio,demo,config.size);
    useDocument(next);
    if (demo) select([next.layers[0].id]);
    if (window.__wantGraph) { window.__wantGraph = false; setView('graph'); }
  }
  $('launchRatio').onchange = launchLayout;
  $('launchForm').onsubmit = e => { e.preventDefault(); launchProject(false); };
  $('launchDemo').onclick = () => launchProject(true);
  $('launchUpload').onclick = () => $('launchFile').click();
  $('launchClose').onclick = () => launcher.close();
  $('resizeCustom').onclick = () => openLauncher('resize');
  launcher.addEventListener('close',() => { launchTicket++; });
  function newProject() { replaceDocument(() => openLauncher()); }

  function readData(file) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('The file could not be read.'));
      reader.readAsDataURL(file);
    });
  }
  function aspectCanvasSize(width,height) {
    const gcd = (a,b) => b ? gcd(b,a%b) : a;
    const divisor = gcd(width,height), unitW = width/divisor, unitH = height/divisor;
    if (width >= 64 && height >= 64 && width <= 4096 && height <= 4096 && width*height <= 8388608) {
      return [width,height];
    }
    const minScale = Math.max(1,Math.ceil(64/unitW),Math.ceil(64/unitH));
    const minWidth = unitW*minScale, minHeight = unitH*minScale;
    if ((width < 64 || height < 64) && minWidth <= 4096 && minHeight <= 4096 &&
      minWidth*minHeight <= 8388608) {
      return [minWidth,minHeight];
    }
    const maxScale = Math.min(Math.floor(4096/unitW),Math.floor(4096/unitH),
      Math.floor(Math.sqrt(8388608/(unitW*unitH))));
    if (maxScale > 0 && unitW*maxScale >= 64 && unitH*maxScale >= 64) {
      return [unitW*maxScale,unitH*maxScale];
    }
    const scale = Math.min(4096/width,4096/height,Math.sqrt(8388608/(width*height)));
    return [Math.max(64,Math.floor(width*scale)),Math.max(64,Math.floor(height*scale))];
  }
  async function imageDocument(file) {
    const url = URL.createObjectURL(file);
    let size;
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      size = aspectCanvasSize(image.naturalWidth,image.naturalHeight);
    } finally { URL.revokeObjectURL(url); }
    const next = create('custom',false,size);
    next.layers = await decodeImages([file],size,false);
    if (!next.layers.length) throw Error('Invalid image');
    Object.assign(next.layers[0],{width:size[0],height:size[1],x:0,y:0});
    return next;
  }
  async function decodeImages(files,[w,h],background) {
    const results = await Promise.allSettled(files.map(async file => {
      if (!/^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(file.type)) throw Error('Unsupported image.');
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const scale = Math.min(w*.82/img.naturalWidth,h*.82/img.naturalHeight,1);
        let src;
        if (background || file.type === 'image/gif' || Math.max(img.naturalWidth,img.naturalHeight) > 4096) {
          const surface = document.createElement('canvas');
          const limit = Math.min(1,4096/Math.max(img.naturalWidth,img.naturalHeight));
          const width = img.naturalWidth, height = img.naturalHeight;
          surface.width = background ? w : Math.max(1,Math.round(width*limit));
          surface.height = background ? h : Math.max(1,Math.round(height*limit));
          const cover = Math.max(surface.width/width,surface.height/height);
          const tw = background ? width*cover : surface.width, th = background ? height*cover : surface.height;
          surface.getContext('2d').drawImage(img,(surface.width-tw)/2,(surface.height-th)/2,tw,th);
          src = surface.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',.94);
        } else src = await readData(file);
        await R.image(src).ready;
        return build('image',{name:file.name.slice(0,120),src,
          width:background ? w : Math.max(1,img.naturalWidth*scale),height:background ? h : Math.max(1,img.naturalHeight*scale)});
      } finally { URL.revokeObjectURL(url); }
    }));
    return results.filter(r => r.status === 'fulfilled').map(r => r.value);
  }

  async function importImages(files,background = false) {
    if (!files.length) return;
    const current = doc;
    const layers = await decodeImages(files,dims(),background);
    if (doc !== current) return;
    if (gesture) endGesture(true);
    if (doc !== current) return;
    if (layers.length) {
      change(() => {
        insert(layers);
        if (background) {
          const existing = doc.layers.slice(layers.length);
          const index = existing.findIndex(l => l.type === 'background');
          existing.splice(index < 0 ? existing.length : index,0,...layers);
          doc.layers = existing;
        }
      });
      if (view === 'graph') setView('canvas');
      setTool('select');
    }
    if (layers.length !== files.length) notice(layers.length ? 'Some files could not be imported.' : 'Could not import the selected image files.');
  }

  $('launchFile').onchange = async e => {
    const file = e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!file || !launcher.open) return;
    const ticket = ++launchTicket;
    $('launchStatus').textContent = 'Opening…';
    try {
      let next, uploaded = false;
      if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
        next = normalize(JSON.parse(await file.text()));
        await R.prepare(next);
      } else {
        next = await imageDocument(file);
        uploaded = true;
      }
      if (ticket !== launchTicket || !launcher.open) return;
      launcher.close();
      useDocument(next);
      if (uploaded) {
        select([next.layers[0].id]);
        dirty = true;
      }
    } catch {
      if (ticket === launchTicket && launcher.open) $('launchStatus').textContent = 'Choose a supported image or a Studio project.';
    }
  };
  $('openFile').onchange = async e => {
    const file = e.target.files[0], ticket = ++opening, start = revision;
    e.target.value = '';
    if (!file) return;
    try {
      const next = normalize(JSON.parse(await file.text()));
      await R.prepare(next);
      if (ticket !== opening) return;
      if (start !== revision || gesture) {
        notice('The current project changed while opening. Open the file again to switch.');
        return;
      }
      useDocument(next);
      notice('Project opened.');
    } catch {
      if (opening === ticket) notice('Could not open this n0ise Studio project.');
    }
  };
  $('imageFile').onchange = e => {
    const files = [...e.target.files];
    e.target.value = '';
    const background = e.target.dataset.background === 'true';
    delete e.target.dataset.background;
    importImages(files,background);
  };
  $('imageFile').addEventListener('cancel',e => { delete e.target.dataset.background; });
  stage.addEventListener('dragover',e => {
    if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
  });
  stage.addEventListener('drop',e => {
    e.preventDefault();
    importImages([...e.dataTransfer.files]);
  });

  $('menu').onclick = () => menu('Studio',[
    ['New composition…',newProject],
    ['Open project…',() => replaceDocument(() => $('openFile').click())],
    ['Save project',save],
    ['Import image…',() => $('imageFile').click()],
    [`Grid · ${grid ? 'On' : 'Off'}`,() => { grid = !grid; drawOverlay(); notice(grid ? 'Grid on' : 'Grid off'); }],
    [`Smart snapping · ${snapping ? 'On' : 'Off'}`,() => { snapping = !snapping; notice(snapping ? 'Smart snapping on' : 'Smart snapping off'); }],
    [`15° rotation snapping · ${angular ? 'On' : 'Off'}`,() => { angular = !angular; notice(angular ? 'Rotation snapping on' : 'Rotation snapping off'); }],
    ['Keyboard and gestures',() => {
      $('modaltitle').textContent = 'Keyboard and gestures';
      const help = document.createElement('p');
      help.textContent = 'V Select · L Lasso · B Brush · E Eraser · P Pen · T Text · R Shape · C Crop · G Gradient · I Eyedropper. Shift-click adds or removes layers. Drag empty space to select several. Space-drag or use two fingers to pan. Scroll or pinch to zoom. Hold Alt to bypass snapping, or Shift for 15° rotation steps. Arrow keys nudge 1 px and Shift nudges 10 px. Press 0 to fit.';
      $('modalcontent').replaceChildren(help);
      $('modal').showModal();
    }]
  ]);
  $('modalcancel').onclick = () => $('modal').close();
  $('export').onclick = exportOptions;
  $('fit').onclick = fit;
  { const zl = $('zoomLock'), paintZl = () => { zl.setAttribute('aria-pressed',zoomLocked); zl.classList.toggle('on',zoomLocked); };
    zl.onclick = () => { zoomLocked = !zoomLocked; try { localStorage.setItem('n0ise.zoomlock',zoomLocked?'1':'0'); } catch {} paintZl(); };
    paintZl(); }
  $('addLayer').onclick = openAdd;
  $('moveUp').onclick = () => reorder(-1);
  $('moveDown').onclick = () => reorder(1);
  $('removeLayer').onclick = remove;
  $('undo').onclick = () => traverse('undo');
  $('redo').onclick = () => traverse('redo');
  $('graphAdd').onclick = openEffects;
  $('effectTool').onclick = openEffects;
  $('graphFit').onclick = graph.fit;
  /* Full screen: Fullscreen API where it exists, in-page immersive mode otherwise (iPhone). Document, tool, selection and zoom are untouched. */
  const appEl = document.querySelector('.app');
  function setImmersive(on) {
    appEl.classList.toggle('immersive',on);
    $('exitFullscreen').classList.toggle('hidden',!on);
    $('fullscreen').setAttribute('aria-pressed',String(on));
    requestAnimationFrame(layout);
  }
  async function toggleFullscreen(force) {
    const on = force ?? !appEl.classList.contains('immersive');
    setImmersive(on);
    const el = document.documentElement;
    try {
      if (on && el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen({navigationUI:'hide'});
      else if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch {}
  }
  document.addEventListener('fullscreenchange',() => { if (!document.fullscreenElement && appEl.classList.contains('immersive')) setImmersive(false); });
  $('fullscreen').onclick = () => toggleFullscreen();
  $('exitFullscreen').onclick = () => toggleFullscreen(false);
  $('docname').onchange = e => {
    const name = e.target.value.trim() || 'Untitled 01';
    e.target.value = name;
    if (doc.name !== name) change(() => { doc.name = name; });
  };
  $('ratio').onchange = e => {
    const value = e.target.value;
    if (value === 'workspace') { e.target.value = doc.ratio; setDimensions('custom',workspaceSize()); }
    else if (value === 'custom') {
      e.target.value = doc.ratio;
      openLauncher('resize');
    } else setDimensions(value,sizes[value]);
  };

  const ws = $('workspace');
  for (const [id,pane] of [['toggleLayers','left'],['toggleInspector','right']]) {
    $(id).setAttribute('aria-pressed','true');
    $(id).onclick = () => {
      const hidden = ws.classList.toggle('no-'+pane);
      $(id).setAttribute('aria-pressed',String(!hidden));
    };
  }
  for (const grip of all('[data-resize]')) {
    const side = grip.dataset.resize;
    const sign = side === 'left' ? 1 : -1;
    const resize = width => ws.style.setProperty('--'+side,clamp(width,132,Math.min(340,ws.clientWidth*.32))+'px');
    let drag;
    grip.onpointerdown = e => {
      if (e.button !== 0) return;
      grip.setPointerCapture(e.pointerId);
      drag = {id:e.pointerId,x:e.clientX,width:$(side).offsetWidth};
    };
    grip.onpointermove = e => {
      if (drag?.id === e.pointerId) resize(drag.width+sign*(e.clientX-drag.x));
    };
    grip.onlostpointercapture = () => { drag = null; };
    grip.onkeydown = e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      resize($(side).offsetWidth+sign*(e.key === 'ArrowRight' ? 12 : -12));
    };
  }

  const toolstrip = $('tools');
  const extendedTools = [
    ['lasso','⌁','Lasso selection (L)'],
    ['eraser','⌫','Eraser (E)'],
    ['line','／','Line (U)'],
    ['gradient','◒','Gradient fill (G)'],
    ['picker','◉','Eyedropper (I)']
  ];
  for (const [name,glyph,title] of extendedTools) {
    if (all('[data-tool]').some(button => button.dataset.tool === name)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool';
    button.dataset.tool = name;
    button.textContent = glyph;
    button.title = title;
    button.setAttribute('aria-label',title.replace(/\s\([^)]*\)$/,''));
    toolstrip.insertBefore(button,toolstrip.querySelector('[data-tool="add"]'));
  }

  const homeUrl = new URL('./index.html',location.href).href;
  for (const brand of all('a.brand')) {
    brand.href = homeUrl;
    brand.addEventListener('click',e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      location.assign(homeUrl);
    },true);
  }

  for (const b of all('[data-view]')) b.onclick = () => setView(b.dataset.view);
  for (const b of all('[data-rail]')) b.onclick = () => { rail = b.dataset.rail; renderLayers(); };
  for (const b of all('[data-mobile]')) b.onclick = () => setSheet(sheet === b.dataset.mobile ? 'canvas' : b.dataset.mobile);
  for (const b of all('[data-tool]')) b.onclick = () => {
    const next = b.dataset.tool;
    if (next === 'add') openAdd();
    else if (next === 'shape') shapePicker();
    else if (next === 'pen' && tool === 'pen' && pen.length >= 2) penFinish();
    else {
      setTool(next);
      if (next === 'pen') notice('Tap points or drag handles. Enter or tap Pen to finish.');
      if (next === 'crop') notice('Select an image, then drag the area to keep.');
    }
  };

  let opacityBefore = null;
  $('opacity').oninput = e => {
    const l = selected()[0];
    if (!l) return;
    opacityBefore ??= capture();
    l.opacity = e.target.valueAsNumber;
    $('opacityLabel').textContent = l.opacity+'%';
    schedule();
  };
  $('opacity').onchange = () => {
    const before = opacityBefore;
    opacityBefore = null;
    if (before) finish(before);
  };
  for (const [id,key,min,max] of [['blend','blend'],['posX','x',-1e6,1e6],['posY','y',-1e6,1e6],
    ['scale','scale',1,2000],['rotation','rotation',-36000,36000]]) {
    $(id).onchange = e => {
      const input = e.target, l = selected()[0];
      if (!l) return;
      const next = key === 'blend' ? input.value : input.valueAsNumber;
      const value = typeof next === 'string' ? next : Number.isFinite(next) ? clamp(next,min,max) : l[key];
      input.value = value;
      if (l[key] !== value) change(() => { l[key] = value; });
    };
  }
  $('resetTransform').onclick = () => {
    const layers = selected();
    if (layers.some(l => l.x || l.y || l.rotation || l.scale !== 100)) {
      change(() => layers.forEach(l => Object.assign(l,{x:0,y:0,rotation:0,scale:100})));
    }
  };

  let nudgeBefore = null;
  function finishNudge() {
    if (!nudgeBefore) return;
    const before = nudgeBefore;
    nudgeBefore = null;
    finish(before);
  }
  const arrows = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  document.addEventListener('keydown',e => {
    if (launcher.open || $('modal').open || e.defaultPrevented || e.target.matches('input,textarea,select,[contenteditable=true]')) return;
    if (gesture && e.key !== 'Escape') return;
    const key = e.key.toLowerCase(), modifier = e.ctrlKey || e.metaKey;
    if (modifier && ['z','y','s','o','a','j'].includes(key)) {
      e.preventDefault();
      finishNudge();
      if (key === 'z') traverse(e.shiftKey ? 'redo' : 'undo');
      if (key === 'y') traverse('redo');
      if (key === 's') save();
      if (key === 'o') replaceDocument(() => $('openFile').click());
      if (key === 'a' && view !== 'graph') select(doc.layers.filter(l => l.visible).map(l => l.id));
      if (key === 'j' && view === 'canvas') duplicateLayers();
      return;
    }
    if (modifier) return;
    if (e.code === 'Space' && !e.target.closest('button')) {
      e.preventDefault();
      space = true;
      stage.dataset.pan = 'true';
      return;
    }
    if (key === 'escape') {
      if (gesture) endGesture(true);
      else if (pen.length) { pen = []; hover = null; drawOverlay(); }
      else if (sheet !== 'canvas') setSheet('canvas');
      else if (graph.selection && view !== 'canvas') { graph.clear(); syncInspector(); }
      else select([]);
    } else if (key === 'enter' && tool === 'pen' && pen.length && !e.target.closest('button')) penFinish();
    else if (key === 'f') toggleFullscreen();
    else if (key === 'escape' && appEl.classList.contains('immersive')) toggleFullscreen(false);
    else if (key === '0') (view === 'graph' ? graph.fit : fit)();
    else if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      if (view !== 'canvas' && graph.selection) graph.remove();
      else if (view !== 'graph') remove();
    } else if (arrows[e.key] && view !== 'graph' && view !== 'spatial' && !graph.selection && selection.length) {
      e.preventDefault();
      const layers = selected().filter(l => !l.locked);
      if (!layers.length) return;
      nudgeBefore ??= capture();
      const delta = e.shiftKey ? 10 : 1, [x,y] = arrows[e.key];
      for (const l of layers) { l.x += x*delta; l.y += y*delta; }
      syncInspector();
      schedule();
    } else if (view !== 'graph') {
      const shortcut = {v:'select',l:'lasso',b:'brush',e:'eraser',p:'pen',t:'text',r:'shape',c:'crop',g:'gradient',i:'picker',u:'line'}[key];
      if (shortcut) setTool(shortcut);
    }
  });
  document.addEventListener('keyup',e => {
    if (arrows[e.key]) finishNudge();
    if (e.code === 'Space') { space = false; delete stage.dataset.pan; }
  });
  window.addEventListener('blur',() => {
    finishNudge();
    space = false;
    delete stage.dataset.pan;
  });
  window.addEventListener('pagehide',e => { if (!e.persisted) gpu?.dispose(); });
  window.addEventListener('beforeunload',e => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = true;
  });
  function expandVector(l) {
    if (l.opacity !== 100 || l.blend !== 'source-over' || l.chain?.nodes.some(node => node.type === 'effect')) {
      notice('Set opacity to 100%, use Normal blend, and remove layer effects before expanding.');
      return;
    }
    const {definition,chain,...base} = l;
    const paths = vector.generateGeometry(definition).reverse().map((path,i) =>
      layer('path',{...base,...path,id:StudioDocument.id(),type:'path',fill:null,name:`${l.name} · Path ${i+1}`}));
    if (!paths.length) { notice('This generator has no paths to expand.'); return; }
    change(() => {
      doc.layers.splice(doc.layers.indexOf(l),1,...paths);
      selection = paths.map(path => path.id);
    });
    notice('Vector expanded into editable paths.');
  }

  function rasterizeVector(l) {
    try {
      const {definition,...base} = l;
      const image = layer('image',{...base,...R.vectorImage(l),type:'image'});
      change(() => { doc.layers[doc.layers.indexOf(l)] = image; });
      notice('Vector rasterized.');
    } catch (error) { notice(error.message); }
  }

  function editVectorInLab(l) {
    try {
      finishTextEdit();
      for (const [ticket,pending] of vectorEdits) {
        if (pending.tab.closed) vectorEdits.delete(ticket);
        else if (pending.layerId === l.id) { pending.tab.focus(); return; }
      }
      const {ticket,tab,ready} = vectorHandoff.openVectorTab('lab.html',l.definition,true);
      vectorEdits.set(ticket,{tab,layerId:l.id,epoch:projectEpoch,base:JSON.stringify(l.definition)});
      ready.catch(error => {
        vectorEdits.delete(ticket);
        notice(error.message);
      });
    } catch (error) { notice(error.message); }
  }

  window.addEventListener('message',event => {
    const {type,ticket,definition} = event.data ?? {};
    if (event.origin !== location.origin || type !== 'n0ise-vector-return') return;
    const pending = vectorEdits.get(ticket);
    if (!pending || event.source !== pending.tab) return;
    const reply = error => event.source.postMessage({type:'n0ise-vector-ack',ticket,error},location.origin);
    try {
      if (gesture || textEdit || launcher.open || $('modal').open) throw Error('Finish the active edit in Studio, then try again.');
      const target = pending.epoch === projectEpoch && doc.layers.find(l => l.id === pending.layerId);
      if (!target || target.type !== 'procedure' || JSON.stringify(target.definition) !== pending.base) {
        throw Error('The original layer changed in Studio. Save the vector project to keep your edits.');
      }
      if (target.locked) throw Error('Unlock the original layer in Studio, then try again.');
      const next = vector.validateDefinition(definition);
      if (next.id !== target.definition.id) throw Error('The generator ID does not match the Studio layer.');
      if (JSON.stringify(next) !== pending.base) change(() => { target.definition = next; });
      vectorEdits.delete(ticket);
      reply();
      notice('Procedural vector updated.');
    } catch (error) { reply(error.message); }
  });

  async function openLabVector(ticket) {
    const definition = await vectorHandoff.takeVector(ticket,'lab-vector');
    const size = vector.viewBox(vector.generateGeometry(definition))[2];
    const next = create('custom',false,[size,size]);
    next.name = vector.GENERATORS[definition.generator].name;
    next.layers = [layer('procedure',{name:next.name,definition})];
    useDocument(next);
    select([next.layers[0].id]);
    dirty = true;
    notice('Vector opened. Edit its generator in Lab.');
  }

  async function openLabStill() {
    const handoff = await import('../src/handoff.js');
    const record = await handoff.take();
    if (record?.meta?.from !== 'lab' || record.blob?.type !== 'image/png') throw Error('No Lab still was available.');
    const src = await readData(record.blob);
    const image = await R.image(src).ready;
    const factor = Math.min(1,4096/Math.max(image.naturalWidth,image.naturalHeight),
      Math.sqrt(8388608/(image.naturalWidth*image.naturalHeight)));
    const size = [image.naturalWidth,image.naturalHeight].map(n => Math.max(64,Math.floor(n*factor)));
    const next = create('custom',false,size);
    next.name = 'Lab still';
    next.layers = [layer('image',{name:'Lab still',src,width:size[0],height:size[1]})];
    useDocument(next);
    select([next.layers[0].id]);
    dirty = true;
    notice('Lab still opened.');
  }

  setTool('select');
  setSheet('canvas');
  setView('canvas');
  sync();
  const url = new URL(location.href);
  const vectorImport = url.searchParams.get('vectorImport');
  if (vectorImport) {
    url.searchParams.delete('vectorImport');
    window.history.replaceState(null,'',url.href);
    try { await openLabVector(vectorImport); }
    catch (error) {
      openLauncher();
      $('launchStatus').textContent = error.message;
    }
  } else if (location.hash === '#from=lab') {
    window.history.replaceState(null,'',location.pathname+location.search);
    try { await openLabStill(); }
    catch {
      openLauncher();
      $('launchStatus').textContent = 'No Lab still could be opened. You can upload a PNG instead.';
    }
  } else if (location.hash === '#graph') {
    window.history.replaceState(null,'',location.pathname+location.search);
    window.__wantGraph = true;
    openLauncher();
    launchProject(true);
  } else openLauncher();
})();
