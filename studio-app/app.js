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
  let paintColor = '#e9e5db', constrain = true, hoverId = null;
  let dirty = false, opening = 0, revision = 0, space = false, snapping = true, angular = false;
  /* grid, guides and snap switches (StudioGrid): showing the grid and snapping to it are separate */
  let gridCfg = StudioGrid.normalize((() => { try { return JSON.parse(localStorage.getItem('n0ise.gridcfg') || 'null'); } catch { return null; } })());
  const saveGrid = () => { gridCfg = StudioGrid.normalize(gridCfg); try { localStorage.setItem('n0ise.gridcfg',JSON.stringify(gridCfg)); } catch {} };
  let pan = {x:0,y:0}, zoom = 1, fitted = true, lastDims = '', lastRenderScale = 1, frame = 0, gesture = null, pen = [], hover = null;
  let guides = [], draft = null, editAnchors = false, anchorSel = -1, toastTimer = 0, contextKey = '';
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
  let hubTimer = 0;
  function hubAuto() {
    clearTimeout(hubTimer);
    hubTimer = setTimeout(async () => {
      try {
        const hub = await import('../src/hub.js'), bg = doc.layers.find(l => l.type === 'background'), [w,h] = StudioDocument.dimensions(doc);
        await hub.record({tool:'studio',name:doc.name,
          layers:[...doc.layers].reverse().filter(l => l.type !== 'background').map(l => ({name:l.name,kind:l.type,off:!l.visible})),
          params:{Size:w+' × '+h,Background:bg ? (bg.visible ? (bg.fill || 'studio gradient') : 'transparent') : 'none',Swatches:(doc.swatches || []).join(' ') || 'none',Layers:doc.layers.length}});
      } catch {}
    },2000);
  }
  function finish(before) {
    hubAuto();
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
    /* undoing a node edit keeps you in node editing as long as the same path is still selected */
    editAnchors = editAnchors && selection.length === 1 && doc.layers.find(l => l.id === selection[0])?.type === 'path';
    if (!editAnchors) anchorSel = -1;
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
    const glyphs = {scene:'◉',shape:'□',image:'▧',brush:'✎',path:'◇',text:'T',crt:'≋',gradient:'◒',procedure:'◎',video:'▶',adjustment:'◐'};
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
    $('deleteTool').disabled = !selection.length;
    $('moveUp').disabled = !canReorder(-1);
    $('moveDown').disabled = !canReorder(1);
  }

  studioLayerDrag($('layerlist'),(id,beforeId,toBin) => {
    const moving = selection.includes(id) ? selection : [id];
    if (toBin) { deleteLayers(moving); return; }
    const kept = doc.layers.filter(l => !moving.includes(l.id));
    const original = doc.layers;
    const target = original.findIndex(l => l.id === beforeId);
    const index = target === -1 ? kept.length : original.slice(0,target).filter(l => !moving.includes(l.id)).length;
    kept.splice(index,0,...original.filter(l => moving.includes(l.id)));
    if (kept.every((l,i) => l === original[i])) return;
    change(() => { doc.layers = kept; selection = [...moving]; });
  },$('layerBin'));

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
  /* the one deletion command: toolbar, Delete and Backspace, the layer bin, the context menu and the API all end up here. Locked layers are kept, one undo step restores everything. */
  function deleteLayers(ids = selection) {
    const wanted = doc.layers.filter(l => ids.includes(l.id));
    if (!wanted.length) return 0;
    const removable = wanted.filter(l => !l.locked).map(l => l.id);
    if (!removable.length) { notice(wanted.length > 1 ? 'Those layers are locked. Unlock them before deleting.' : 'Unlock the layer before deleting it.'); return 0; }
    change(() => {
      doc.layers = doc.layers.filter(l => !removable.includes(l.id));
      selection = selection.filter(id => !removable.includes(id));
    });
    if (removable.length < wanted.length) notice((wanted.length-removable.length)+' locked layer'+(wanted.length-removable.length > 1 ? 's were' : ' was')+' kept.');
    return removable.length;
  }
  function remove() { deleteLayers(selection); }
  function toggleId(ids,id) { return ids.includes(id) ? ids.filter(x => x !== id) : [...ids,id]; }

  function insert(layers) {
    graph.clear();
    doc.layers.unshift(...layers);
    selection = layers.map(l => l.id);
    rail = 'layers';
    editAnchors = false;
  }
  /* options for each tool, remembered between sessions (shown in the palette above the tool) */
  const toolOpts = {pickSize:1,brushSize:12,smooth:58,taper:55,eraserSize:40,lineWidth:6,shapeStroke:0,penWidth:4,textFont:'sans-serif',textSize:0,gradKind:'linear',cropAspect:0};
  try { Object.assign(toolOpts,JSON.parse(localStorage.getItem('n0ise.toolopts') || '{}')); } catch {}
  const saveOpts = () => { try { localStorage.setItem('n0ise.toolopts',JSON.stringify(toolOpts)); } catch {} };
  function build(type,props = {}) {
    const [w,h] = dims();
    const size = Math.min(w,h)*.24;
    const defaults = {
      shape:{shape,width:size,height:size,fill:paintColor,stroke:paintColor,strokeWidth:toolOpts.shapeStroke},
      text:{text:'Type here',font:toolOpts.textFont,fontSize:toolOpts.textSize || Math.round(size*.38),fill:paintColor},
      path:{points:[],closed:false,fill:paintColor,stroke:paintColor,strokeWidth:toolOpts.penWidth},
      brush:{points:[],stroke:paintColor,strokeWidth:toolOpts.brushSize},
      adjustment:{adj:{kind:'look'},look:StudioLooks.blank()},
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
  let chromaOpen = false;   /* stays open while you move between layers */
  function colourControl(title,value,apply,direct) {
    const box = document.createElement('div');
    box.className = 'colourfield';
    const head = document.createElement('span'); head.className = 'fieldlabel'; head.textContent = title;
    const row = document.createElement('div'); row.className = 'chiprow';
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'cchip'; chip.title = 'Open the colour instrument'; chip.setAttribute('aria-label',title+', open colour instrument');
    const hex = document.createElement('input'); hex.type = 'text'; hex.className = 'field hex'; hex.maxLength = 7; hex.spellcheck = false; hex.setAttribute('aria-label',title+' hex');
    const save = action('＋',() => {}); save.classList.add('chipsave'); save.title = 'Save to project swatches'; save.setAttribute('aria-label','Save '+title+' to project swatches');
    row.append(chip,hex,save);
    const bar = document.createElement('div'); bar.className = 'swatchbar'; bar.setAttribute('role','group'); bar.setAttribute('aria-label','Swatches');
    const holder = document.createElement('div'); holder.className = 'chroma-wrap'; holder.hidden = !chromaOpen;
    let before = null, current = hexOf(value) || '#000000';
    const showChip = c => { current = c; chip.style.setProperty('--c',c); hex.value = c; };
    const chroma = StudioChroma.mount({
      value:current,
      onBegin() { before = direct ? null : capture(); },
      onPreview(c) { apply(c); if (!direct) schedule(); },
      onCommit(c) { if (before) finish(before); before = null; rememberColor(c); paintBar(); },
      onPaint: showChip,
      saved: () => doc.swatches || [],
      recent: recentColors,
      photo: photoColours,
      onSave: c => saveSwatch(c),
      onRemove: c => { change(() => { doc.swatches = (doc.swatches || []).filter(x => x !== c); }); paintBar(); }
    });
    holder.append(chroma.el);
    function saveSwatch(c) { if ((doc.swatches || []).includes(c)) { notice('Already in swatches'); return; } change(() => { (doc.swatches ||= []).push(c); }); paintBar(); }
    function paintBar() {
      bar.replaceChildren();
      const dot = (c,label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.setProperty('--c',c); b.title = label+' '+c; b.setAttribute('aria-label',label+' '+c); b.onclick = () => chroma.setHex(c); return b; };
      for (const c of recentColors().slice(0,5)) bar.append(dot(c,'Recent'));
      const saved = doc.swatches || [];
      if (saved.length) { const sep = document.createElement('i'); sep.className = 'sep'; bar.append(sep); for (const c of saved.slice(0,12)) bar.append(dot(c,'Swatch')); }
    }
    chip.onclick = () => { chromaOpen = !chromaOpen; holder.hidden = !chromaOpen; chip.setAttribute('aria-expanded',chromaOpen); };
    chip.setAttribute('aria-expanded',chromaOpen);
    hex.onchange = () => { if (!chroma.setHex(hex.value)) showChip(current); };
    save.onclick = () => saveSwatch(current);
    showChip(current); paintBar();
    box.append(head,row,bar,holder);
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
    /* sliders preview while you drag: every input event applies the value and redraws, and the whole drag is one undo step on release */
    let live = null;
    if (type === 'range') {
      input.addEventListener('input',() => {
        const v = input.valueAsNumber; if (!Number.isFinite(v)) return;
        if (!live) live = {before:capture()};
        apply(clamp(v,options.min ?? -1e6,options.max ?? 1e6));
        live.moved = true; schedule();
        const out = wrapper.querySelector('.slidervalue'); if (out) out.textContent = String(Math.round(v*100)/100);
      });
    }
    input.onchange = () => {
      const next = ['number','range'].includes(type) ? input.valueAsNumber : input.value;
      if (live) { const l = live; live = null; if (l.moved && Number.isFinite(next)) { contextKey = ''; finish(l.before); return; } }
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
    window.n0iseMotionRefresh?.();
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
      l ? [l.id,l.locked,l.asset?.transform?.rotation,l.chain?.nodes.map(n => n.id),editAnchors,anchorSel,l.points?.length,l.closed,l.points?.[anchorSel] ? StudioPath.isSmooth(l.points[anchorSel]) : ''].join(':') : selection.join(','));
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
    if (l.type === 'text') context.append(action('Convert to outlines',() => { setTool('direct'); enterEdit(l); }));
    if (l.type === 'procgraph') context.append(action('Edit graph…',() => openProcEditor(l)));
    if (l.type === 'path') {
      context.append(action(editAnchors ? 'Done editing anchors' : 'Edit anchors',toggleAnchors));
      if (editAnchors && !l.locked) {
        const has = anchorSel >= 0 && l.points[anchorSel];
        const smooth = action(has && StudioPath.isSmooth(l.points[anchorSel]) ? 'Make corner' : 'Make smooth',toggleSmooth), del = action('Delete point',deleteAnchor);
        smooth.disabled = del.disabled = !has;
        context.append(smooth,del,action(l.closed ? 'Open path' : 'Close path',toggleClosed));
        context.append(Object.assign(document.createElement('p'),{className:'muted compact',textContent:'Double-click the outline to add a point. Double-click a point for smooth or corner. Alt-drag a handle to move it on its own.'}));
      }
    }
    if (l.type === 'image') {
      const row = document.createElement('div'); row.className = 'photopalette';
      const head = document.createElement('span'); head.className = 'fieldlabel'; head.textContent = 'Key colours';
      const bar = document.createElement('div'); bar.className = 'swatchbar';
      const draw = () => { bar.replaceChildren(); for (const c of l.palette || []) { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.background = c; b.title = 'Use '+c+' as the paint colour'; b.setAttribute('aria-label','Use '+c); b.onclick = () => { setPaint(c); notice('Paint colour '+c); }; bar.append(b); } };
      draw();
      const acts = document.createElement('div'); acts.className = 'chips';
      acts.append(action(l.palette?.length ? 'Re-read' : 'Find key colours',() => { const im = R.image(l.src).img; if (!im) return; const pal = keyColours(im); change(() => { l.palette = pal; contextKey = ''; }); }));
      if (l.palette?.length) acts.append(action('Add all to swatches',() => change(() => { doc.swatches = [...new Set([...(doc.swatches || []),...l.palette])].slice(0,64); contextKey = ''; notice('Added '+l.palette.length+' colours to the project swatches'); })));
      row.append(head,bar,acts); context.append(row);
    }
    if (l.type === 'image' && l.crop) context.append(action('Reset crop',() => {
      contextKey = '';
      change(() => { delete l.crop; });
    }));
    if (l.type === 'adjustment') {
      const a = l.adj || {kind:'look'}, set = (key,min,max) => field(({black:'Black point',white:'White point',gamma:'Gamma',level:'Level',levels:'Levels'})[key],'range',a[key],v => { a[key] = v; },{min,max});
      if (a.kind === 'levels') context.append(set('black',0,254),set('gamma',.1,4),set('white',1,255));
      else if (a.kind === 'threshold') context.append(set('level',0,255));
      else if (a.kind === 'posterize') context.append(set('levels',2,32));
      else context.append(...lookControls(l));
    } else if (l.type !== 'crt' && l.type !== 'background') context.append(...lookControls(l));
  }

  /* Looks: filters, LUTs and code over a layer (looks.js). One look is plain JSON so people and AI can both edit it. */
  const lookOf = l => l.look ?? StudioLooks.blank();
  const lookSet = (l,fn) => { const k = lookOf(l); fn(k); if (StudioLooks.isPlain(k) && l.type !== 'adjustment') delete l.look; else l.look = k; contextKey = ''; };
  function lookControls(l) {
    const k = lookOf(l), out = [];
    const head = Object.assign(document.createElement('span'),{className:'fieldlabel',textContent:'LOOK'});
    out.push(head,
      field('Filter','select',k.preset,v => lookSet(l,x => { x.preset = v; }),{choices:Object.entries(StudioLooks.presets).map(([id,p]) => [id,p[0]])}));
    if (l.look) {
      out.push(field('Amount','range',k.amount,v => lookSet(l,x => { x.amount = v; }),{min:0,max:100}),
        field('Brightness','range',k.brightness,v => lookSet(l,x => { x.brightness = v; }),{min:0,max:200}),
        field('Contrast','range',k.contrast,v => lookSet(l,x => { x.contrast = v; }),{min:0,max:200}),
        field('Saturation','range',k.saturate,v => lookSet(l,x => { x.saturate = v; }),{min:0,max:300}),
        field('Hue','range',k.hue,v => lookSet(l,x => { x.hue = v; }),{min:-180,max:180}));
    }
    out.push(action(k.lut ? 'LUT: '+k.lut.name : 'Load LUT (.cube)',() => lookFile(l)));
    if (k.lut) out.push(action('Remove LUT',() => change(() => lookSet(l,x => { delete x.lut; }))));
    if (k.code && !StudioLooks.codeLive(k)) out.push(action('Run code',() => { StudioLooks.trusted.add(k.code); contextKey = ''; schedule(); syncInspector(); }));
    out.push(action('Source',() => lookSource(l)));
    if (l.look && l.type !== 'adjustment') out.push(action('Reset look',() => change(() => { delete l.look; contextKey = ''; })));
    return out;
  }
  function lookFile(l) {
    const input = Object.assign(document.createElement('input'),{type:'file',accept:'.cube,text/plain'});
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        if (file.size > 3e6) throw new Error('This LUT is larger than 3 MB. Export a 33-point .cube.');
        const cube = await file.text();
        StudioLooks.cube(cube);
        change(() => lookSet(l,x => { x.lut = {name:file.name.replace(/\.cube$/i,'').slice(0,80),cube}; }));
        notice('LUT loaded.');
      } catch (e) { notice(e.message || 'This file is not a .cube LUT.'); }
    };
    input.click();
  }
  function lookSource(l) {
    const k = lookOf(l), view = {...k, lut:k.lut ? k.lut.name : null};
    delete view.code;
    $('modaltitle').textContent = 'Look source';
    $('modalcancel').textContent = 'Close';
    const content = $('modalcontent');
    content.className = 'looksource';
    content.replaceChildren();
    const note = (t) => Object.assign(document.createElement('p'),{className:'muted compact',textContent:t});
    const json = Object.assign(document.createElement('textarea'),{className:'field',rows:8,spellcheck:false,value:JSON.stringify(view,null,2)});
    const code = Object.assign(document.createElement('textarea'),{className:'field',rows:9,spellcheck:false,value:k.code || '',placeholder:'// return [r, g, b]\nreturn [r, g, b];'});
    const err = note('');
    const fix = () => { err.textContent = StudioLooks.status.error ? 'Error: '+StudioLooks.status.error : ''; };
    const apply = () => {
      try {
        const raw = JSON.parse(json.value), next = {...raw, lut:k.lut, code:code.value.trim() || (typeof raw.code === 'string' ? raw.code : '')};
        const clean = StudioLooks.normalize(next);
        if (clean?.code) { StudioLooks.status.error = ''; StudioLooks.trusted.add(clean.code); if (!StudioLooks.compile(clean.code)) { fix(); return; } }
        change(() => { if (clean) l.look = clean; else delete l.look; contextKey = ''; });
        $('modal').close();
      } catch (e) { err.textContent = 'Error: '+(e.message || 'Settings are not valid JSON.'); }
    };
    const copy = action('Copy for AI',async () => {
      const text = JSON.stringify({...view,code:code.value.trim() || undefined},null,2);
      try { await navigator.clipboard.writeText(text); notice('Copied.'); } catch { json.select(); notice('Copy failed. Select the text and copy it.'); }
    });
    const row = Object.assign(document.createElement('div'),{className:'modalactions'});
    row.append(action('Apply',apply),copy);
    content.append(note('Settings: preset (none, film, mono, noir, warm, cool, fade, vivid, sepia, invert), amount 0 to 100, brightness, contrast, saturate (percent), hue (degrees).'),json,
      note('Code runs once per pixel. Arguments: r g b a (0 to 1), x y (pixels), t (seconds), w h. Return [r, g, b] or [r, g, b, a]. It runs only after you press Apply or Run code.'),code,err,row);
    $('modal').showModal();
  }

  function sync() {
    window.n0iseMotionRefresh?.();
    board.classList.toggle('transparent',!doc.layers.some(l => l.type === 'background' && l.visible && l.opacity));
    board.classList.toggle('artboardlocked',!!doc.artboardLocked);
    $('undo').disabled = !stack.canUndo;
    $('redo').disabled = !stack.canRedo;
    $('docname').value = doc.name;
    { const n = doc.artboards?.length || 1, lab = abName().toUpperCase()+(n > 1 ? ' · '+(abIndex()+1)+'/'+n : '')+' ▾'; if ($('artboardBtn').textContent !== lab) $('artboardBtn').textContent = lab; $('abPrev').hidden = $('abNext').hidden = n < 2; }
    $('ratio').value = doc.ratio === 'custom' && Math.abs((doc.size[0]/doc.size[1])/(stage.clientWidth/Math.max(1,stage.clientHeight))-1) < .03 ? 'workspace' : doc.ratio;
    $('resizeCustom').classList.toggle('hidden',doc.ratio !== 'custom');
    $('stagefoot').textContent = 'RGB · '+ratioName(doc);
    refreshGraphLayer();
    renderLayers();
    syncInspector();
    layout();
    schedule();
    graph.render();
    procEditor?.redraw();
  }

  function layout() {
    const [w,h] = dims(), width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    if (`${w}x${h}` !== lastDims) { lastDims = `${w}x${h}`; fitted = true; }     /* a different artboard size is a new fit, even while the viewport is locked */
    if (fitted) {
      const f = StudioViewport.fitTransform(w,h,width,height);
      zoom = f.zoom; pan = f.pan;
    }
    /* the composition is drawn at screen resolution, so a change of zoom must redraw it (debounced), otherwise vectors stay soft until the next edit */
    { const rs = renderScale(); if (Math.abs(rs-lastRenderScale) > .01) { lastRenderScale = rs; clearTimeout(scaleTimer); scaleTimer = setTimeout(() => { if (view !== 'spatial') schedule(); },90); } }
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
  /* vectors are re-rasterised at screen resolution, so shapes and text stay sharp when you zoom in */
  let forceScale = 0, scaleTimer = 0;
  function renderScale() {
    if (forceScale) return forceScale;
    const [w,h] = dims();
    let s = clamp(zoom*(window.devicePixelRatio || 1),1,4);
    while (s > 1 && w*h*s*s > 24e6) s -= .25;
    return Math.max(1,s);
  }
  function renderComposition() {
    const warnings = R.draw(canvas,doc,gpu,renderScale());
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
    if (gridCfg.show) {
      const g = StudioGrid.lines(gridCfg,w,h), o = gridCfg.opacity/100;
      if (g.minor) svg('path',{d:g.minor,class:'grid',style:`opacity:${(o*.55).toFixed(3)}`});
      if (g.major) svg('path',{d:g.major,class:'grid',style:`opacity:${o.toFixed(3)}`});
    }
    for (const gd of gridCfg.guides) svg('line',gd.axis === 'x' ? {x1:gd.at,y1:0,x2:gd.at,y2:h,class:'userguide'} : {x1:0,y1:gd.at,x2:w,y2:gd.at,class:'userguide'});
    function line(x1,y1,x2,y2,cls) { svg('line',{x1,y1,x2,y2,class:cls}); }
    function handle(p,attrs,shape = 'rect') {
      const r = 3.4/zoom, hit = 11/zoom;
      svg(shape,shape === 'circle' ? {cx:p.x,cy:p.y,r,class:'handle'} :
        {x:p.x-r,y:p.y-r,width:r*2,height:r*2,class:'handle'});
      svg('circle',{cx:p.x,cy:p.y,r:hit,class:'hit',...attrs});
    }
    if (hoverId && tool === 'select' && !gesture && !selection.includes(hoverId)) {
      const hl = doc.layers.find(l => l.id === hoverId);
      if (hl && hl.visible && !hl.locked) svg('polygon',{points:R.corners(hl,w,h).map(xy).join(' '),class:'hover'});
    }
    const layers = visibleSelection();
    const points = selectionGeometry(layers);
    if (points && (tool === 'select' || tool === 'crop' || tool === 'direct') && gesture?.kind !== 'pinch') {
      svg('polygon',{points:points.map(xy).join(' '),class:'outline'});
      if (editAnchors && layers[0]?.type === 'path' && (tool === 'select' || tool === 'direct')) {
        const l = layers[0], c = R.center(l,w,h);
        const world = (x,y) => {
          const p = R.transform(x*l.scale/100,y*l.scale/100,R.radians(l.rotation));
          return {x:c.x+p.x,y:c.y+p.y};
        };
        l.points.forEach((pt,i) => {
          const [x,y] = pt, o = StudioPath.outOf(pt), n = StudioPath.inOf(pt), p = world(x,y), q = world(x+o[0],y+o[1]), b = world(x+n[0],y+n[1]);
          const has = StudioPath.hasHandles(pt), stub = !has && i === anchorSel ? world(x+20*100/l.scale/zoom,y) : null;
          if (has) { line(b.x,b.y,p.x,p.y,'outline'); line(p.x,p.y,q.x,q.y,'outline'); handle(b,{'data-anchor':i,'data-tangent':'in'},'circle'); handle(q,{'data-anchor':i,'data-tangent':'out'},'circle'); }
          else if (stub) { line(p.x,p.y,stub.x,stub.y,'outline'); handle(stub,{'data-anchor':i,'data-tangent':'out'},'circle'); }
          handle(p,{'data-anchor':i});
          if (i === anchorSel) svg('circle',{cx:p.x,cy:p.y,r:7/zoom,class:'handle selected'});
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
    if (draft?.line) {
      if (draft.paint) svg('line',{x1:draft.x1,y1:draft.y1,x2:draft.x2,y2:draft.y2,stroke:draft.paint,'stroke-width':draft.thick,'stroke-linecap':'round',class:'ghost'});
      svg('line',{x1:draft.x1,y1:draft.y1,x2:draft.x2,y2:draft.y2,class:'draft'});
    } else if (draft?.path) {
      if (draft.paint) svg('path',{d:draft.path,fill:draft.paint,stroke:draft.edge||'none','stroke-width':draft.edgeWidth||0,class:'ghost'});
      svg('path',{d:draft.path,class:'draft'});
    }
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
    if (next !== 'select' && next !== 'direct') editAnchors = false;
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
  /* viewport lock: freezes the current zoom and position. Wheel, trackpad pinch, touch pinch and pan are ignored until you unlock; Fit still works. It is not the same as locking a layer or the artboard's contents. */
  let zoomLocked = false, lockNoticeAt = 0;
  try { zoomLocked = localStorage.getItem('n0ise.zoomlock') === '1'; } catch {}
  const viewBlocked = () => {
    if (!zoomLocked) return false;
    if (performance.now()-lockNoticeAt > 2500) { lockNoticeAt = performance.now(); notice('Viewport is locked. Unlock it to zoom or pan, or press Fit.'); }
    return true;
  };
  function zoomAt(x,y,value) {
    if (viewBlocked()) return;
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
  /* eyedropper: press and hold to see a magnified view of the pixels around the pointer with the colour it will pick, move or use the arrow keys for single-pixel control, release to pick, Esc to cancel */
  const SAMPLE_SIZES = [[1,'Point'],[3,'3×3'],[5,'5×5'],[9,'9×9']];
  let loupeEl = null;
  function readPixels(p,half) {
    const [w,h] = dims(), k = canvas.width/w, cx = Math.round(clamp(p.x,0,w-1)*k), cy = Math.round(clamp(p.y,0,h-1)*k), g = canvas.getContext('2d',{willReadFrequently:true});
    const x0 = clamp(cx-half,0,canvas.width-1), y0 = clamp(cy-half,0,canvas.height-1), x1 = clamp(cx+half,0,canvas.width-1), y1 = clamp(cy+half,0,canvas.height-1);
    return {data:g.getImageData(x0,y0,x1-x0+1,y1-y0+1).data,w:x1-x0+1,h:y1-y0+1,cx:cx-x0,cy:cy-y0};
  }
  function sampledColour(p) {
    const half = Math.floor((toolOpts.pickSize || 1)/2), r = readPixels(p,half); let R0 = 0,G0 = 0,B0 = 0,n = 0;
    const x0 = Math.max(0,r.cx-half), x1 = Math.min(r.w-1,r.cx+half), y0 = Math.max(0,r.cy-half), y1 = Math.min(r.h-1,r.cy+half);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y*r.w+x)*4; R0 += r.data[i]; G0 += r.data[i+1]; B0 += r.data[i+2]; n++; }
    return n ? [Math.round(R0/n),Math.round(G0/n),Math.round(B0/n)] : [0,0,0];
  }
  const rgbHex = c => '#'+c.map(n => n.toString(16).padStart(2,'0')).join('');
  function updateLoupe(g) {
    const [w,h] = dims(); if (g.p.x < 0 || g.p.y < 0 || g.p.x >= w || g.p.y >= h) { hideLoupe(); return; }
    if (!loupeEl) {
      loupeEl = document.createElement('div'); loupeEl.className = 'loupe'; loupeEl.setAttribute('aria-hidden','true');
      loupeEl.innerHTML = '<canvas width="143" height="143"></canvas><div class="loupeinfo"><span class="loupenew"></span><span class="loupeold"></span><b class="loupehex"></b><small class="louperaw"></small></div>';
      stage.append(loupeEl);
    }
    const c = loupeEl.querySelector('canvas'), g2 = c.getContext('2d'), N = 11, cell = 13, half = 5, r = readPixels(g.p,half);
    g2.clearRect(0,0,143,143); g2.imageSmoothingEnabled = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const sx = r.cx-half+x, sy = r.cy-half+y; let col = null;
      if (sx >= 0 && sy >= 0 && sx < r.w && sy < r.h) { const i = (sy*r.w+sx)*4; col = `rgba(${r.data[i]},${r.data[i+1]},${r.data[i+2]},${r.data[i+3]/255})`; }
      g2.fillStyle = col || '#111'; g2.fillRect(x*cell,y*cell,cell,cell);
    }
    g2.strokeStyle = 'rgba(0,0,0,.28)'; g2.lineWidth = 1; g2.beginPath(); for (let i = 0; i <= N; i++) { g2.moveTo(i*cell+.5,0); g2.lineTo(i*cell+.5,143); g2.moveTo(0,i*cell+.5); g2.lineTo(143,i*cell+.5); } g2.stroke();
    const area = Math.floor((toolOpts.pickSize || 1)/2), o = (half-area)*cell, sz = (area*2+1)*cell;
    g2.lineWidth = 2; g2.strokeStyle = '#000'; g2.strokeRect(o+1,o+1,sz-2,sz-2); g2.strokeStyle = '#fff'; g2.strokeRect(o+3,o+3,sz-6,sz-6);
    const col = sampledColour(g.p), hx = rgbHex(col);
    g.colour = hx; loupeEl.querySelector('.loupenew').style.background = hx; loupeEl.querySelector('.loupeold').style.background = g.was; loupeEl.querySelector('.loupehex').textContent = hx.toUpperCase();
    loupeEl.querySelector('.louperaw').textContent = `RGB ${col.join(' ')} · ${Math.round(g.p.x)}, ${Math.round(g.p.y)} px${(toolOpts.pickSize || 1) > 1 ? ' · avg '+toolOpts.pickSize+'×'+toolOpts.pickSize : ''}`;
    const sr = stage.getBoundingClientRect(), px = (g.cx ?? sr.left+sr.width/2)-sr.left, py = (g.cy ?? sr.top+sr.height/2)-sr.top, W = 160, H = 230;
    let lx = px+24, ly = g.touch ? py-H-36 : py-H/2; if (lx+W > sr.width-6) lx = px-W-24; lx = clamp(lx,6,Math.max(6,sr.width-W-6)); ly = clamp(ly,6,Math.max(6,sr.height-H-6));
    loupeEl.style.transform = `translate(${lx}px,${ly}px)`; loupeEl.hidden = false;
  }
  function hideLoupe() { if (loupeEl) loupeEl.hidden = true; }
  function commitPick(g) {
    const hx = g.colour; if (!hx) return;
    setPaint(hx); rememberColor(hx); contextKey = '';
    setTool('select'); notice(`Picked ${hx.toUpperCase()}`);
  }
  function snapshotTransforms(layers) {
    return layers.map(l => ({l,x:l.x,y:l.y,scale:l.scale,rotation:l.rotation}));
  }
  function boxFor(layers) {
    const [w,h] = dims();
    return S.union(layers.map(l => R.bounds(l,w,h)));
  }

  /* anchors snap to guides and the grid too: local point -> artboard point -> snapped -> local again */
  function snapPoint(q,l) {
    if (!(gridCfg.snapGrid || (gridCfg.snapGuides && gridCfg.guides.length))) return q;
    const [w,h] = dims(), c = R.center(l,w,h), t = R.transform(q.x*l.scale/100,q.y*l.scale/100,R.radians(l.rotation));
    const r = StudioGrid.snapPoint(gridCfg,{x:c.x+t.x,y:c.y+t.y},w,h,8/zoom);
    return r.on.length ? R.local(l,{x:r.x,y:r.y},w,h) : q;
  }
  /* node commands: every one is a single undoable change */
  const editable = () => { const l = visibleSelection()[0]; return editAnchors && l?.type === 'path' && !l.locked ? l : null; };
  function addAnchorAt(l,p) {
    const [w,h] = dims(), q = R.local(l,p,w,h), hit = StudioPath.nearest(l.points,!!l.closed,q,32,l.breaks);
    if (!hit || hit.dist*l.scale/100*zoom > 18) return false;
    change(() => { const r = StudioPath.split(l.points,!!l.closed,hit.seg,hit.t,l.breaks); l.points = r.points; if (r.breaks) l.breaks = r.breaks; anchorSel = r.index; contextKey = ''; });
    return true;
  }
  /* procedural graph layers: the graph lives on the layer, so undo, save and Motion treat it like any other layer data */
  function addProcGraph(template) {
    const graph = template ? StudioProc.templates[template]() : StudioProc.create();
    add('procgraph',{name:template || 'Procedural graph',graph});
    const l = visibleSelection()[0]; if (l) openProcEditor(l);
  }
  let procEditor = null;
  function openProcEditor(l) {
    if (!l || l.type !== 'procgraph') return;
    procEditor?.close?.();
    const ctx = {layer:l,current:() => doc.layers.find(x => x.id === l.id),begin:() => capture(),end:before => { finish(before); },live:() => schedule(),notice,close:() => { procEditor = null; syncInspector(); },
      errors:() => R.procStatus(l.id)?.errors,preview:() => R.procStatus(l.id)?.canvas};
    procEditor = StudioProcUI.open($('stage'),ctx);
    const redraw = () => { if (procEditor) procEditor.redraw(); };
    ctx.onFrame = redraw;
  }
  function deleteAnchor() {
    const l = editable(); if (!l || anchorSel < 0) return false;
    const next = StudioPath.removeAtB(l.points,!!l.closed,anchorSel,l.breaks);
    if (!next) { notice(l.closed || l.breaks ? 'An outline needs at least three points.' : 'A path needs at least two points. Delete the layer instead.'); return true; }
    change(() => { l.points = next.points; if (next.breaks) l.breaks = next.breaks; anchorSel = Math.min(anchorSel,next.points.length-1); contextKey = ''; });
    return true;
  }
  function toggleSmooth() {
    const l = editable(); if (!l || anchorSel < 0) return;
    const smooth = StudioPath.isSmooth(l.points[anchorSel]);
    change(() => { l.points = smooth ? StudioPath.toCorner(l.points,anchorSel) : StudioPath.toSmooth(l.points,!!l.closed,anchorSel,l.breaks); contextKey = ''; });
  }
  function toggleClosed() {
    const l = editable(); if (!l) return;
    change(() => { l.closed = !l.closed; if (l.closed && l.fill === null) l.fill = paintColor; contextKey = ''; });
  }
  function toggleAnchors() {
    anchorSel = -1;
    if (view === 'graph' || view === 'spatial') setView('canvas');
    setTool('select');
    editAnchors = !editAnchors;
    contextKey = '';
    syncInspector();
    drawOverlay();
  }
  /* every vector can be edited point by point: shapes and text become paths (text as outlines; letters with holes become one compound path) */
  const isVector = l => ['path','shape','text'].includes(l.type);
  function shapeToPath(l) {
    change(() => {
      Object.assign(l,{type:'path',closed:true,points:V.outline(l.shape,l.width,l.height)});
      delete l.shape; delete l.width; delete l.height; contextKey = '';
    });
  }
  function textToOutlines(l) {
    const obj = R.textObject(l); if (!obj) return false;
    const stroke = obj.stroke, sw = obj.strokeWidth; obj.set({stroke:null,strokeWidth:0});
    try {
      const bw = Math.max(8,obj.width), bh = Math.max(8,obj.height), k = clamp(1800/Math.max(bw,bh),1,6), cw = Math.ceil(bw*k)+16, ch = Math.ceil(bh*k)+16;
      const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d',{willReadFrequently:true});
      g.translate(cw/2,ch/2); g.scale(k,k); obj.render(g);
      const px = g.getImageData(0,0,cw,ch).data, alpha = new Uint8Array(cw*ch); for (let i = 0; i < alpha.length; i++) alpha[i] = px[i*4+3];
      const r = StudioTrace.compound(StudioTrace.contours(alpha,cw,ch),{scale:1/k,ox:cw/2,oy:ch/2,minArea:3*k,eps:1.5});
      if (r.points.length < 3) return false;
      change(() => {
        Object.assign(l,{type:'path',closed:true,points:r.points,fill:l.fill || paintColor,strokeWidth:0});
        if (r.breaks.length) l.breaks = r.breaks; delete l.text; delete l.font; delete l.fontSize; contextKey = '';
      });
      return true;
    } finally { obj.set({stroke,strokeWidth:sw}); }
  }
  function enterEdit(l) {
    if (l.locked) return;
    if (l.type === 'shape') shapeToPath(l);
    else if (l.type === 'text') { if (!textToOutlines(l)) { notice('That text has no outlines to edit.'); return; } notice('Text converted to outlines. Undo to get the editable text back.'); }
    else if (l.type !== 'path') { notice('Only paths, shapes and text can be edited as points.'); return; }
    editAnchors = true; contextKey = ''; syncInspector(); drawOverlay();
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
  /* live preview while dragging out a shape: the real outline in the current paint, not just a box */
  function shapeDraft(a,b) {
    const r = rectangle(a,b), look = build('shape',{});
    if (shape === 'line') { draft = {line:true,x1:a.x,y1:a.y,x2:b.x,y2:b.y,paint:look.stroke,thick:toolOpts.lineWidth}; return; }
    if (r.width < 2 && r.height < 2) { draft = r; return; }
    const cx = r.x+r.width/2, cy = r.y+r.height/2;
    const points = V.outline(shape,Math.max(2,r.width),Math.max(2,r.height)).map(([x,y,dx,dy]) => [x+cx,y+cy,dx,dy]);
    draft = {path:R.pathData({points,closed:true}),paint:look.fill,edge:look.stroke,edgeWidth:look.strokeWidth};
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
      fill:l.fill,stroke:l.stroke,strokeWidth:line ? toolOpts.lineWidth : toolOpts.shapeStroke});
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
    hideLoupe();
    if (!g) { drawOverlay(); return; }
    if (g.kind === 'picker') { if (!cancelled) commitPick(g); return; }
    if (cancelled) {
      if (g.kind === 'pen') pen.pop();
      if (g.before && g.edited) restore(g.before);
      else { drawOverlay(); schedule(); }
      return;
    }
    if (g.kind === 'marquee' && g.moved) {
      const [w,h] = dims(), b = rectangle(g.p,g.now);
      const ids = doc.layers.filter(l => l.visible && !l.locked && l.opacity && !['background','crt','adjustment'].includes(l.type)).filter(l => {
        const bounds = R.bounds(l,w,h);
        return bounds.left <= b.x+b.width && bounds.right >= b.x &&
          bounds.top <= b.y+b.height && bounds.bottom >= b.y;
      }).map(l => l.id);
      select([...new Set([...g.base,...ids])]);
    }
    if (g.kind === 'gradient') {
      const [w,h] = dims(), end = g.now ?? {x:g.p.x+Math.min(w*.55,500),y:g.p.y};
      add('gradient',{gradient:{kind:toolOpts.gradKind,from:[g.p.x-w/2,g.p.y-h/2],
        to:[end.x-w/2,end.y-h/2],start:paintColor,end:'#101112'}});
      setTool('select');
    }
    if (g.kind === 'lasso') {
      const [w,h] = dims();
      if (g.points.length >= 3) {
        const ids = doc.layers.filter(l => l.visible && !l.locked && l.opacity && !['background','crt','adjustment'].includes(l.type)).filter(l => {
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
      const outline = V.stroke(l.points,g.pressure,l.strokeWidth,toolOpts);
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
    } else if ((tool === 'select' || tool === 'direct') && anchor !== undefined && active?.type === 'path') {
      anchorSel = Number(anchor); contextKey = ''; syncInspector();
      gesture = {...base,kind:'anchor',l:active,index:Number(anchor),tangent:e.target.dataset.tangent || '',before:capture()};
    } else if (tool === 'direct') {
      /* direct selection: pick any vector under the pointer and edit its points; shapes and text are turned into editable outlines on the way */
      const hit = inside ? doc.layers.find(l => !l.locked && R.inside(l,p,w,h,7/zoom)) : null;
      if (hit) { if (!selection.includes(hit.id)) select([hit.id]); enterEdit(hit); }
      else if (!editAnchors || !layers.length) { select([]); }
      else { editAnchors = false; anchorSel = -1; select([]); }
      return;
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
          l.type !== 'background' && l.type !== 'crt' && l.type !== 'adjustment').map(l => R.bounds(l,w,h));
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
      gesture = {...base,kind:'picker',p,touch:e.pointerType === 'touch',was:paintColor};
      stage.dataset.drag = 'true'; updateLoupe(gesture);
      return;
    } else if (tool === 'brush' || tool === 'eraser') {
      const before = capture();
      const l = build('brush',{points:[[p.x,p.y]],x:-w/2,y:-h/2,strokeWidth:tool === 'eraser' ? toolOpts.eraserSize : toolOpts.brushSize,
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
    if ((tool !== 'select' && tool !== 'direct') || view === 'spatial' || e.target.closest('button,#textEdit,#inlineText')) return;
    const p = position(e.clientX,e.clientY), [w,h] = dims();
    const editing = editable();
    if (editing) {
      if (e.target.dataset?.anchor !== undefined && !e.target.dataset.tangent) { anchorSel = Number(e.target.dataset.anchor); toggleSmooth(); return; }
      if (addAnchorAt(editing,p)) return;
    }
    const top = doc.layers.find(l => R.inside(l,p,w,h,5/zoom));
    if (top?.type === 'procgraph' && !top.locked) { select([top.id]); openProcEditor(top); return; }
    if (top?.type === 'text') startTextEdit(top);
    else if (top?.type === 'shape' && !top.locked && !doc.artboardLocked) pathFromShape(top);
    else if (top?.type === 'path' && !top.locked && !editAnchors) { select([top.id]); toggleAnchors(); }
  });

  function cropPreview(g,p,w,h) {
    const l = g.l;
    const a = R.local(l,g.p,w,h), b = R.local(l,p,w,h);
    if (toolOpts.cropAspect > 0) b.y = a.y+(b.y < a.y ? -1 : 1)*Math.abs(b.x-a.x)/toolOpts.cropAspect;
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

  function setHover(id) {
    if (hoverId === id) return;
    hoverId = id;
    stage.classList.toggle('hovering',!!id);
    document.querySelectorAll('[data-layer-id]').forEach(r => r.classList.toggle('hover',r.dataset.layerId === id));
    drawOverlay();
  }
  stage.addEventListener('pointermove',e => {
    if (e.pointerType === 'touch' || gesture || tool !== 'select' || view === 'spatial' || doc.artboardLocked) return setHover(null);
    const p = position(e.clientX,e.clientY), [w,h] = dims();
    const top = doc.layers.find(l => !['background','crt','adjustment'].includes(l.type) && !l.locked && R.inside(l,p,w,h,5/zoom));
    setHover(top?.id ?? null);
  });
  stage.addEventListener('pointerleave',() => setHover(null));
  $('layerlist').addEventListener('pointerover',e => {
    const r = e.target.closest('[data-layer-id]');
    if (e.pointerType !== 'touch') setHover(r && tool === 'select' ? r.dataset.layerId : null);
  });
  $('layerlist').addEventListener('pointerleave',() => setHover(null));
  stage.addEventListener('pointermove',e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const g = gesture;
    if (g?.kind === 'pinch' && pointers.size === 2) {
      const pair = touchPair();
      if (!viewBlocked()) { zoomAt(g.center.x,g.center.y,g.z*pair.distance/g.distance); pan.x += pair.center.x-g.center.x; pan.y += pair.center.y-g.center.y; }
      Object.assign(g,pair,{z:zoom});
      layout();
      return;
    }
    const p = position(e.clientX,e.clientY);
    if (g?.kind === 'picker') { g.p = p; g.cx = e.clientX; g.cy = e.clientY; updateLoupe(g); return; }
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
      if (viewBlocked()) return;
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
      if (!e.altKey && g.bounds && (gridCfg.snapGrid || (gridCfg.snapGuides && gridCfg.guides.length))) {
        const adj = StudioGrid.snapBox(gridCfg,S.translate(g.bounds,x,y),w,h,6/zoom);
        if (adj.snappedX && !guides.some(q => q.axis === 'x')) x += adj.x;
        if (adj.snappedY && !guides.some(q => q.axis === 'y')) y += adj.y;
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
    } else if (g.kind === 'shape') {
      g.now = p;
      shapeDraft(g.p,p);
      drawOverlay();
    } else if (g.kind === 'marquee') {
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
      const q = R.local(g.l,p,w,h), point = g.l.points[g.index];
      if (g.tangent) g.l.points = StudioPath.setHandle(g.l.points,g.index,g.tangent,[q.x-point[0],q.y-point[1]],e.altKey);
      else {
        const at = snapPoint(q,g.l);
        g.l.points = g.l.points.map((v,i) => i === g.index ? [at.x,at.y,...v.slice(2)] : v);
      }
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
        ['Fit to screen',fit],[zoomLocked ? 'Unlock viewport' : 'Lock viewport',() => $('zoomLock').click()]);
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
    if (restore) document.querySelector(`#tools [data-tool="${pal._tool}"]`)?.focus();
  }
  /* options shown above a tool: [type,label,key,min,max] for sliders, [type,label,key,choices] for segmented choices */
  const PALETTES = {
    brush:[['range','Size','brushSize',2,160],['range','Smoothing','smooth',0,100],['range','Pressure taper','taper',0,100]],
    eraser:[['range','Size','eraserSize',4,300]],
    pen:[['range','Stroke width','penWidth',1,60]],
    line:[['range','Width','lineWidth',1,80]],
    shape:[['range','Outline','shapeStroke',0,40]],
    text:[['choice','Font','textFont',[['sans-serif','Sans'],['serif','Serif'],['monospace','Mono']]],['range','Size (0 is auto)','textSize',0,600]],
    gradient:[['choice','Type','gradKind',[['linear','Linear'],['radial','Radial']]]],
    crop:[['choice','Aspect','cropAspect',[[0,'Free'],[1,'1:1'],[4/3,'4:3'],[16/9,'16:9'],[9/16,'9:16']]]]
  };
  function toolPalette(name) {
    closeShapePalette(false);
    const anchor = document.querySelector(`#tools [data-tool="${name}"]`);
    const pal = document.createElement('div');
    pal.id = 'shapePalette'; pal._tool = name; pal.className = 'shapepal toolpal'; pal.setAttribute('role','group'); pal.setAttribute('aria-label',(anchor?.getAttribute('aria-label') || name)+' options');
    if (name === 'shape') {
      const icons = document.createElement('div'); icons.className = 'palicons'; icons.setAttribute('role','menu');
      for (const [id,label] of Object.entries(V.shapes)) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'tool'+(id === shape ? ' on' : ''); b.setAttribute('role','menuitem');
        b.setAttribute('aria-label',label); b.title = label;
        b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${shapeIcons[id] || ''}</svg>`;
        b.onclick = () => { closeShapePalette(false); chooseShape(id); };
        icons.append(b);
      }
      pal.append(icons);
    }
    for (const [type,label,key,a,b] of PALETTES[name] || []) {
      const row = document.createElement('div'); row.className = 'optrow';
      const head = document.createElement('span'); head.className = 'optlabel'; head.textContent = label;
      row.append(head);
      if (type === 'range') {
        const out = document.createElement('output'), input = document.createElement('input');
        input.type = 'range'; input.className = 'slider'; input.min = a; input.max = b; input.step = 1; input.value = toolOpts[key]; input.setAttribute('aria-label',label);
        const show = () => { out.textContent = key === 'textSize' && !toolOpts[key] ? 'Auto' : String(toolOpts[key]); };
        input.oninput = () => { toolOpts[key] = input.valueAsNumber; show(); saveOpts(); };
        show(); head.append(out); row.append(input);
      } else {
        const seg = document.createElement('div'); seg.className = 'seg';
        for (const [value,text] of a) {
          const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = text;
          const on = () => Math.abs(Number(toolOpts[key])-Number(value)) < 1e-6 || toolOpts[key] === value;
          btn.setAttribute('aria-pressed',String(on()));
          btn.onclick = () => { toolOpts[key] = value; saveOpts(); for (const o of seg.children) o.setAttribute('aria-pressed','false'); btn.setAttribute('aria-pressed','true'); };
          seg.append(btn);
        }
        row.append(seg);
      }
      pal.append(row);
    }
    if (name === 'lasso') {
      const row = document.createElement('div'); row.className = 'optrow seg';
      for (const [text,run] of [['Select all',() => select(doc.layers.filter(l => l.visible && !l.locked && !['background','crt','adjustment'].includes(l.type)).map(l => l.id))],['Select none',() => select([])]]) {
        const b = action(text,() => { run(); closeShapePalette(false); }); row.append(b);
      }
      pal.append(row);
    }
    if (name === 'picker') {
      const srow = document.createElement('div'); srow.className = 'optrow';
      const shead = document.createElement('span'); shead.className = 'optlabel'; shead.textContent = 'Sample';
      const seg = document.createElement('div'); seg.className = 'chips';
      for (const [n,label] of SAMPLE_SIZES) { const b = action(label,() => { toolOpts.pickSize = n; saveOpts(); seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed',String(x === b))); }); b.setAttribute('aria-pressed',String((toolOpts.pickSize || 1) === n)); seg.append(b); }
      const hint = document.createElement('span'); hint.className = 'muted compact'; hint.textContent = 'Hold to magnify. Arrow keys move one pixel (Shift five). Esc cancels.';
      srow.append(shead,seg,hint); pal.append(srow);
    }
    if (name === 'picker') {
      const row = document.createElement('div'); row.className = 'optrow';
      const head = document.createElement('span'); head.className = 'optlabel'; head.textContent = 'Recent colours';
      const sw = document.createElement('div'); sw.className = 'swatchbar';
      for (const c of recentColors()) { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.background = c; b.title = c; b.setAttribute('aria-label','Use '+c); b.onclick = () => { setPaint(c); closeShapePalette(false); }; sw.append(b); }
      row.append(head,sw); pal.append(row);
    }
    if (!pal.children.length) return;
    pal.style.left = '8px'; pal.style.top = '8px';
    document.body.append(pal);
    const r = anchor.getBoundingClientRect(), pw = pal.offsetWidth, ph = pal.offsetHeight;
    pal.style.left = Math.max(8,Math.min(innerWidth-pw-8,r.left+r.width/2-pw/2))+'px';
    pal.style.top = Math.max(8,r.top-ph-10)+'px';
    pal._out = e => { if (!pal.contains(e.target) && !e.target.closest(`#tools [data-tool="${name}"]`)) closeShapePalette(false); };
    pal._key = e => {
      const items = [...pal.querySelectorAll('.palicons button')], i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeShapePalette(); }
      else if (!items.length || i < 0) return;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); items[(i+1)%items.length].focus(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); items[(i-1+items.length)%items.length].focus(); }
    };
    document.addEventListener('pointerdown',pal._out,true);
    document.addEventListener('keydown',pal._key,true);
    if (name === 'shape') (pal.querySelector('.on') || pal.querySelector('button')).focus();
  }
  const shapePicker = () => toolPalette('shape');
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
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    forceScale = 1;                       /* exports are always artboard size */
    renderComposition();
    setTimeout(() => { forceScale = 0; schedule(); },0);
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
      ...(doc.artboards ? [['Download every artboard (PNG)',downloadAllPNG]] : []),
      ['Download SVG',downloadSVG],
      ['Save editable project',save],
      ['Show in node editor',showInNodes],
      ['Open in Effects',() => sendArtwork('effects')],
      ['Open in 3D as relief',() => sendArtwork('3d')]
    ]);
  }
  /* ---- artboards. The active artboard's layers are doc.layers; the others are stored on doc.artboards with their own layers, graph and size. Every operation is one undo step. ---- */
  const AB_MAX = 12, abIndex = () => doc.artboards ? Math.max(0,doc.artboards.findIndex(a => a.id === doc.activeArtboard)) : 0;
  const abName = () => doc.artboards ? doc.artboards[abIndex()].name : 'Artboard 01';
  function abEnsure() { if (!doc.artboards) { const id = StudioDocument.id(); doc.artboards = [{id,name:'Artboard 01'}]; doc.activeArtboard = id; } }
  function abStash() { const cur = doc.artboards.find(a => a.id === doc.activeArtboard); cur.layers = doc.layers; cur.graph = doc.graph; cur.ratio = doc.ratio; if (doc.ratio === 'custom') cur.size = doc.size; else delete cur.size; }
  function abLoad(ab) {
    doc.layers = ab.layers; doc.graph = ab.graph; doc.ratio = ab.ratio; if (ab.size) doc.size = ab.size; else delete doc.size;
    delete ab.layers; delete ab.graph; delete ab.ratio; delete ab.size; doc.activeArtboard = ab.id; selection = []; editAnchors = false; anchorSel = -1;
  }
  const abAfter = () => { fitted = true; contextKey = ''; setView(view === 'spatial' ? 'canvas' : view); layout(); };
  function abSwitch(id,history = true) {
    if (!doc.artboards || id === doc.activeArtboard || !doc.artboards.some(a => a.id === id)) return;
    const run = () => { abStash(); abLoad(doc.artboards.find(a => a.id === id)); };
    if (history) change(run); else { run(); sync(); }
    abAfter();
  }
  function abAdd(opts = {}) {
    if (doc.artboards && doc.artboards.length >= AB_MAX) { notice('A project can have up to '+AB_MAX+' artboards.'); return; }
    change(() => {
      abEnsure(); abStash();
      const at = abIndex(), id = StudioDocument.id(), n = doc.artboards.length+1, src = doc.artboards[at];
      const ratio = opts.ratio ?? src.ratio, size = opts.size ?? src.size, entry = {id,name:opts.name || 'Artboard '+String(n).padStart(2,'0'),ratio,...(ratio === 'custom' ? {size:[...size]} : {})};
      if (opts.duplicate) { entry.layers = copy(src.layers).map(l => ({...l,id:StudioDocument.id()})); entry.graph = copy(src.graph); entry.name = (src.name+' copy').slice(0,60); entry.ratio = src.ratio; if (src.size) entry.size = [...src.size]; }
      else { entry.layers = []; entry.graph = StudioDocument.create(ratio,false,ratio === 'custom' ? size : undefined).graph; }
      doc.artboards.splice(at+1,0,entry); abLoad(entry);
    });
    abAfter(); notice(opts.duplicate ? 'Artboard duplicated' : 'Artboard added');
  }
  function abRename() {
    if (!doc.artboards) abEnsure();
    const name = (prompt('Artboard name',abName()) || '').trim().slice(0,60); if (!name) return;
    change(() => { abEnsure(); doc.artboards[abIndex()].name = name; });
  }
  function abMove(delta) {
    if (!doc.artboards) return; const i = abIndex(), j = i+delta; if (j < 0 || j >= doc.artboards.length) return;
    change(() => { const [a] = doc.artboards.splice(i,1); doc.artboards.splice(j,0,a); });
  }
  function abDelete() {
    if (!doc.artboards || doc.artboards.length < 2) { notice('A project needs at least one artboard.'); return; }
    change(() => {
      const i = abIndex(), list = doc.artboards, next = list[i+1] || list[i-1]; list.splice(i,1); abLoad(next);
      if (list.length === 1) { delete doc.artboards; delete doc.activeArtboard; }
    });
    abAfter(); notice('Artboard deleted. Undo brings it back.');
  }
  async function downloadAllPNG() {
    const start = doc.activeArtboard, names = doc.artboards.map(a => [a.id,a.name]);
    try {
      for (const [id,name] of names) { abSwitch(id,false); await new Promise(r => setTimeout(r,60)); download(await exportPNG(),'png',doc.name+' - '+name); await new Promise(r => setTimeout(r,250)); }
      notice('Downloaded '+names.length+' artboards.');
    } catch (e) { notice(e.message || 'Export failed.'); }
    finally { abSwitch(start,false); }
  }
  function openArtboards() {
    const list = doc.artboards || [{id:'solo',name:'Artboard 01'}], cur = doc.activeArtboard || 'solo', one = !doc.artboards;
    const sizeLabel = r => ({landscape:'16:9',portrait:'9:16',square:'1:1'}[r] || 'custom');
    menu('Artboards',[
      ...list.map((a,i) => [(a.id === cur ? '● ' : '○ ')+(i+1)+'. '+a.name,() => abSwitch(a.id)]),
      ['New artboard (same size)',() => abAdd()],
      ['New artboard · portrait 9:16',() => abAdd({ratio:'portrait'})],['New artboard · square 1:1',() => abAdd({ratio:'square'})],['New artboard · landscape 16:9',() => abAdd({ratio:'landscape'})],
      ['Duplicate this artboard',() => abAdd({duplicate:true})],['Rename this artboard…',abRename],
      ...(one ? [] : [['Move earlier',() => abMove(-1)],['Move later',() => abMove(1)],['Delete this artboard',abDelete]]),
      ...(one ? [] : [['Export every artboard (PNG)',downloadAllPNG]])
    ],'Close');
    void sizeLabel;
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
  /* key colours of a picture: a 64 px copy through StudioPalette */
  function keyColours(img) {
    try {
      const k = 64/Math.max(img.naturalWidth || img.width,img.naturalHeight || img.height,1), c = document.createElement('canvas');
      c.width = Math.max(1,Math.round((img.naturalWidth || img.width)*k)); c.height = Math.max(1,Math.round((img.naturalHeight || img.height)*k));
      const g = c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0,c.width,c.height);
      return StudioPalette.extract(g.getImageData(0,0,c.width,c.height).data,6);
    } catch { return []; }
  }
  const photoColours = () => { const l = selected().find(x => x.type === 'image' && x.palette?.length) || doc.layers.find(x => x.type === 'image' && x.palette?.length); return l ? l.palette : []; };
  async function decodeImages(files,[w,h],background) {
    const results = await Promise.allSettled(files.map(async file => {
      if (!/^image\/(png|jpeg|webp|gif|avif|bmp|svg\+xml)$/i.test(file.type)) throw Error('Unsupported image.');
      if (file.type === 'image/svg+xml' && file.size > 5e6) throw Error('That SVG is larger than 5 MB.');
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
        const palette = keyColours(img);
        return build('image',{name:file.name.slice(0,120),src,palette,
          width:background ? w : Math.max(1,img.naturalWidth*scale),height:background ? h : Math.max(1,img.naturalHeight*scale)});
      } finally { URL.revokeObjectURL(url); }
    }));
    return results.filter(r => r.status === 'fulfilled').map(r => r.value);
  }

  async function importImages(files,background = false,at = null) {
    if (!files.length) return;
    const current = doc;
    if (files.some(f => f.size > 2e6)) notice('Importing '+(files.length > 1 ? files.length+' images' : files[0].name)+'…');
    const layers = await decodeImages(files,dims(),background);
    if (doc !== current) return;
    if (gesture) endGesture(true);
    if (doc !== current) return;
    if (layers.length) {
      if (at && !background) { const [w,h] = dims(); layers.forEach((l,i) => { l.x = Math.round(at.x-w/2+i*36); l.y = Math.round(at.y-h/2+i*36); }); }
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
    const videos = files.filter(f => f.type.startsWith('video/'));
    if (videos.length) window.n0iseMotionUI?.importVideos(videos);
    importImages(files.filter(f => !f.type.startsWith('video/')),background);
  };
  $('imageFile').addEventListener('cancel',e => { delete e.target.dataset.background; });
  /* dropping files: images become layers centred where they land; video goes to the timeline; anything else says why it was ignored */
  stage.addEventListener('dragover',e => {
    if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; stage.classList.add('dropping'); }
  });
  for (const type of ['dragleave','dragend']) stage.addEventListener(type,e => { if (e.target === stage || type === 'dragend') stage.classList.remove('dropping'); });
  stage.addEventListener('drop',e => {
    e.preventDefault();
    stage.classList.remove('dropping');
    const dropped = [...(e.dataTransfer?.files ?? [])];
    if (!dropped.length) return;
    const videos = dropped.filter(f => f.type.startsWith('video/')), audio = dropped.filter(f => f.type.startsWith('audio/'));
    const images = dropped.filter(f => /^image\//.test(f.type));
    const other = dropped.length-videos.length-audio.length-images.length;
    if (videos.length) window.n0iseMotionUI?.importVideos(videos);
    if (images.length) importImages(images,false,view === 'spatial' ? null : position(e.clientX,e.clientY));
    if (audio.length) notice('Audio cannot be a layer yet. Drop video or images.');
    else if (other) notice('That file type is not supported. Use PNG, JPEG, WebP, GIF, AVIF, BMP, SVG or video.');
  });

  $('menu').onclick = () => menu('Studio',[
    ['New composition…',newProject],
    ['Open project…',() => replaceDocument(() => $('openFile').click())],
    ['Save project',save],
    ['Import image…',() => $('imageFile').click()],
    ['Import video…',() => { $('imageFile').click(); }],
    ['Timeline',() => window.n0iseMotionUI?.toggle()],
    [`Grid · ${gridCfg.show ? 'On' : 'Off'}`,() => toggleGrid()],
    ['Grid, guides and snapping…',openGridSettings],
    [`Smart snapping · ${snapping ? 'On' : 'Off'}`,() => { snapping = !snapping; notice(snapping ? 'Smart snapping on' : 'Smart snapping off'); }],
    [`15° rotation snapping · ${angular ? 'On' : 'Off'}`,() => { angular = !angular; notice(angular ? 'Rotation snapping on' : 'Rotation snapping off'); }],
    ['Keyboard shortcuts',() => openShortcuts()],
    ['Keyboard and gestures',() => {
      $('modaltitle').textContent = 'Keyboard and gestures';
      const help = document.createElement('p');
      help.textContent = 'V Select · A Direct select · L Lasso · B Brush · E Eraser · P Pen · T Text · R Shape · C Crop · G Gradient · I Eyedropper. Shift-click adds or removes layers. Drag empty space to select several. Space-drag or use two fingers to pan. Scroll or pinch to zoom. Hold Alt to bypass snapping, or Shift for 15° rotation steps. Arrow keys nudge 1 px and Shift nudges 10 px. Press 0 to fit.';
      $('modalcontent').replaceChildren(help);
      $('modal').showModal();
    }]
  ]);
  function toggleGrid(force) { gridCfg.show = force ?? !gridCfg.show; saveGrid(); drawOverlay(); notice(gridCfg.show ? 'Grid on' : 'Grid off'); }
  function toggleGridSnap() { gridCfg.snapGrid = !gridCfg.snapGrid; saveGrid(); notice(gridCfg.snapGrid ? 'Snap to grid on' : 'Snap to grid off'); }
  /* grid, guides and snapping: one dialog, every control applies live */
  function openGridSettings() {
    const el = (t,props = {},...kids) => { const e = Object.assign(document.createElement(t),props); e.append(...kids); return e; };
    const content = $('modalcontent'); content.className = 'gridsettings'; content.replaceChildren();
    $('modaltitle').textContent = 'Grid, guides and snapping'; $('modalcancel').textContent = 'Done';
    const apply = () => { saveGrid(); drawOverlay(); };
    const row = (label,input) => el('label',{className:'gridrow'},el('span',{textContent:label}),input);
    const num = (key,min,max,step = 1) => { const i = el('input',{type:'number',className:'field',min,max,step,value:gridCfg[key],inputMode:'decimal'}); i.setAttribute('aria-label',key); i.onchange = () => { gridCfg[key] = Number(i.value); apply(); i.value = gridCfg[key]; }; return i; };
    const check = (label,key,after) => { const i = el('input',{type:'checkbox',checked:!!gridCfg[key]}); i.onchange = () => { gridCfg[key] = i.checked; apply(); after?.(); }; return row(label,i); };
    const kind = el('select',{className:'field'}); for (const [v,t] of [['square','Square'],['columns','Columns and rows'],['baseline','Baseline'],['isometric','Isometric']]) kind.append(el('option',{value:v,textContent:t,selected:gridCfg.kind === v}));
    const fields = el('div',{className:'gridfields'});
    const paint = () => {
      fields.replaceChildren();
      if (gridCfg.kind === 'square' || gridCfg.kind === 'isometric') fields.append(row('Spacing (px)',num('size',4,2000)));
      if (gridCfg.kind === 'square') fields.append(row('Subdivisions',num('subs',1,16)));
      if (gridCfg.kind === 'columns') fields.append(row('Columns',num('cols',1,64)),row('Rows (0 for none)',num('rows',0,64)));
      if (gridCfg.kind === 'baseline') fields.append(row('Line height (px)',num('baseline',2,400)));
    };
    kind.onchange = () => { gridCfg.kind = kind.value; apply(); paint(); };
    const op = el('input',{type:'range',min:2,max:100,step:1,value:gridCfg.opacity}); op.setAttribute('aria-label','Grid opacity'); op.oninput = () => { gridCfg.opacity = Number(op.value); apply(); };
    const list = el('div',{className:'guidelist'});
    const guides = () => {
      list.replaceChildren();
      gridCfg.guides.forEach((gd,i) => {
        const at = el('input',{type:'number',className:'field',value:gd.at,step:1}); at.setAttribute('aria-label',(gd.axis === 'x' ? 'Vertical' : 'Horizontal')+' guide position'); at.onchange = () => { gd.at = Number(at.value) || 0; apply(); };
        const rm = el('button',{className:'softbtn compact',type:'button',textContent:'Remove'}); rm.setAttribute('aria-label','Remove guide'); rm.onclick = () => { gridCfg.guides.splice(i,1); apply(); guides(); };
        list.append(el('div',{className:'gridrow'},el('span',{textContent:gd.axis === 'x' ? 'Vertical guide at' : 'Horizontal guide at'}),at,rm));
      });
      if (!gridCfg.guides.length) list.append(el('p',{className:'muted compact',textContent:'No guides yet.'}));
    };
    const addGuide = axis => { const [w,h] = dims(); gridCfg.guides.push({axis,at:Math.round((axis === 'x' ? w : h)/2)}); apply(); guides(); };
    content.append(
      el('h3',{textContent:'Grid'}),check('Show grid','show'),row('Layout',kind),fields,row('Grid opacity',op),
      el('h3',{textContent:'Snapping'}),check('Snap to grid','snapGrid'),
      (() => { const r = check('Snap to objects','__objects'); const i = r.querySelector('input'); i.checked = snapping; i.onchange = () => { snapping = i.checked; notice(snapping ? 'Smart snapping on' : 'Smart snapping off'); }; return r; })(),
      check('Snap to guides','snapGuides'),
      el('h3',{textContent:'Guides'}),list,
      el('div',{className:'modalactions'},el('button',{className:'softbtn',type:'button',textContent:'Add vertical guide',onclick:() => addGuide('x')}),el('button',{className:'softbtn',type:'button',textContent:'Add horizontal guide',onclick:() => addGuide('y')}),
        el('button',{className:'softbtn',type:'button',textContent:'Reset grid',onclick:() => { gridCfg = StudioGrid.defaults(); apply(); openGridSettings(); }})),
      el('p',{className:'muted compact',textContent:'Alt while dragging bypasses snapping. Showing the grid and snapping to it are separate.'}));
    paint(); guides(); $('modal').showModal();
  }
  /* the shortcut reference: one list, used for the dialog and for the conflict test */
  const SHORTCUTS = [
    ['Tools',[['V','Select'],['A','Direct select (edit points of any vector)'],['L','Lasso'],['B','Freehand brush'],['E','Eraser'],['P','Pen'],['T','Text'],['R','Shape'],['C','Crop'],['G','Gradient'],['I','Eyedropper']]],
    ['Edit',[['Ctrl/Cmd Z','Undo'],['Ctrl/Cmd Shift Z or Y','Redo'],['Ctrl/Cmd J','Duplicate layers'],['Ctrl/Cmd A','Select all'],['Ctrl/Cmd D','Deselect'],['Delete or Backspace','Delete selected layers, or the selected path point'],['Arrows','Nudge 1 px (Shift 10 px)'],['Esc','Cancel, close, or deselect']]],
    ['View',[['Space + drag','Pan temporarily'],['0 or Ctrl/Cmd 0','Fit to screen'],['F','Full screen canvas'],["'",'Show or hide the grid'],["Shift '",'Snap to grid on or off'],['Scroll or pinch','Zoom (frozen when the viewport is locked)'],['?','This list']]],
    ['File',[['Ctrl/Cmd S','Save project'],['Ctrl/Cmd O','Open project']]],
    ['Modifiers',[['Shift','Add to selection, or constrain rotation to 15°'],['Alt','Bypass snapping, or break a path handle'],['Double-click path','Add a point'],['Double-click point','Smooth or corner']]]
  ];
  function openShortcuts() {
    const el = (t,props = {},...kids) => { const e = Object.assign(document.createElement(t),props); e.append(...kids); return e; };
    $('modaltitle').textContent = 'Keyboard shortcuts'; $('modalcancel').textContent = 'Close';
    const content = $('modalcontent'); content.className = 'shortcuts'; content.replaceChildren();
    for (const [title,rows] of SHORTCUTS) {
      const dl = el('dl',{className:'keylist'});
      for (const [key,what] of rows) dl.append(el('dt',{},el('kbd',{textContent:key})),el('dd',{textContent:what}));
      content.append(el('h3',{textContent:title}),dl);
    }
    content.append(el('p',{className:'muted compact',textContent:'Shortcuts pause while you type in a field, edit text, or have a dialog open.'}));
    $('modal').showModal();
  }
  window.n0iseShortcuts = SHORTCUTS;
  $('modalcancel').onclick = () => $('modal').close();
  $('export').onclick = exportOptions;
  $('fit').onclick = fit;
  $('artboardBtn').onclick = openArtboards;
  $('abPrev').onclick = () => { const i = abIndex(); if (i > 0) abSwitch(doc.artboards[i-1].id); };
  $('abNext').onclick = () => { const i = abIndex(); if (doc.artboards && i < doc.artboards.length-1) abSwitch(doc.artboards[i+1].id); };
  window.n0iseArtboards = {add:abAdd,switch:abSwitch,remove:abDelete,move:abMove,get list() { return (doc.artboards || []).map(a => ({id:a.id,name:a.name,active:a.id === doc.activeArtboard})); }};
  { const zl = $('zoomLock'), LOCKED = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9.5" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
      OPEN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9.5" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/></svg>';
    const paintZl = () => {
      const label = zoomLocked ? 'Unlock viewport' : 'Lock viewport';
      zl.innerHTML = zoomLocked ? LOCKED : OPEN; zl.setAttribute('aria-pressed',zoomLocked); zl.classList.toggle('on',zoomLocked);
      zl.setAttribute('aria-label',label); zl.title = zoomLocked ? 'Viewport locked: zoom and pan are frozen. Click to unlock.' : 'Lock viewport: freeze the current zoom and position';
      stage.classList.toggle('viewlocked',zoomLocked);
    };
    zl.onclick = () => { zoomLocked = !zoomLocked; try { localStorage.setItem('n0ise.zoomlock',zoomLocked?'1':'0'); } catch {} paintZl(); notice(zoomLocked ? 'Viewport locked' : 'Viewport unlocked'); };
    window.n0iseViewport = {get locked() { return zoomLocked; },get zoom() { return zoom; },get pan() { return {...pan}; },get fitted() { return fitted; },toggleLock: () => zl.click(),fit};
    paintZl(); }
  /* the plus above the layers: blank layer, adjustment layers, then everything else */
  function addAdjustment(name,adj,look) { add('adjustment',{name,adj,look:{...StudioLooks.blank(),...look}}); }
  function openLayerMenu() {
    if (view === 'graph' || view === 'spatial') setView('canvas');
    const [w,h] = dims();
    menu('New layer',[
      ['Blank layer',() => add('shape',{name:'Blank layer',shape:'rectangle',width:w,height:h,x:0,y:0,strokeWidth:0})],
      ['Procedural graph…',() => menu('Procedural graph',[...Object.keys(StudioProc.templates).map(k => [k,() => addProcGraph(k)]),['Empty graph',() => addProcGraph(null)]])],
      ['Filter',() => addAdjustment('Filter',{kind:'look'},{preset:'film'})],
      ['Brightness / contrast',() => addAdjustment('Brightness / contrast',{kind:'look'},{brightness:110,contrast:115})],
      ['Hue / saturation',() => addAdjustment('Hue / saturation',{kind:'look'},{hue:20,saturate:130})],
      ['Levels',() => addAdjustment('Levels',{kind:'levels',black:12,white:243,gamma:1})],
      ['Threshold',() => addAdjustment('Threshold',{kind:'threshold',level:128})],
      ['Posterize',() => addAdjustment('Posterize',{kind:'posterize',levels:5})],
      ['Black and white',() => addAdjustment('Black and white',{kind:'look'},{preset:'mono'})],
      ['Invert',() => addAdjustment('Invert',{kind:'look'},{preset:'invert'})],
      ['More: import, shapes, 3D…',openAdd]
    ]);
  }
  $('addLayer').onclick = openLayerMenu;
  $('addLayer').title = $('addLayer').ariaLabel = 'New layer';
  $('moveUp').onclick = () => reorder(-1);
  $('moveDown').onclick = () => reorder(1);
  $('removeLayer').onclick = remove;
  $('deleteTool').onclick = remove;
  $('layerBin').onclick = () => { if (selection.length) remove(); else notice('Drag a layer here to delete it.'); };
  $('layerBin').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('layerBin').click(); } };
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

  /* toolbar icons: one stroke family, drawn on a 24 grid (the eyedropper stays a circle of the active colour) */
  const toolIcons = {
    select:'<path d="M6 3.5 18.5 11l-5.6 1.4L10.2 18z"/>',
    direct:'<path d="M6 3.500 18.500 11l-5.600 1.400L10.200 18z" fill="none"/><rect x="15.500" y="15.500" width="5" height="5" rx="1" fill="currentColor" stroke="none"/>',
    brush:'<path d="M20 4 11.5 12.5"/><path d="M11.5 12.5c-2.6-.6-4.6 1-4.6 3.2 0 1.6-.9 2.5-2.9 3.3 4.4 1.4 8.600-.4 8.600-3.800"/>',
    pen:'<path d="M12 3.5 18 11.500 12 14.500 6 11.500z"/><path d="M12 14.500V21"/><circle cx="12" cy="10.500" r="1.200"/>',
    text:'<path d="M5.500 7V5h13v2M12 5v14M9 19h6"/>',
    shape:'<rect x="4" y="4.500" width="10" height="10" rx="1.800"/><circle cx="15" cy="15" r="5"/>',
    crop:'<path d="M7 3v14h14M3 7h14v14"/>',
    lasso:'<path d="M12 4.500c4.700 0 8 1.800 8 4.500s-3.300 4.500-8 4.500S4 11.700 4 9s3.300-4.500 8-4.500z" stroke-dasharray="3 2.600"/><path d="M8.500 13.200c-1.100 2.200-.2 5 2.800 6.300"/>',
    eraser:'<path d="M3.500 15.500 13.500 5.500a2 2 0 0 1 2.800 0l3.200 3.200a2 2 0 0 1 0 2.800L11.500 19.500H6.500z"/><path d="M9 10l6 6M11.500 19.500H20"/>',
    line:'<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.400"/><circle cx="19" cy="5" r="1.400"/>',
    gradient:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    add:'<path d="M12 5v14M5 12h14"/>',
    effect:'<path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/>'
  };
  for (const b of all('.toolstrip .tool')) {
    const name = b.dataset.tool || (b.id === 'effectTool' ? 'effect' : '');
    if (name === 'picker' || !toolIcons[name]) continue;
    b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${toolIcons[name]}</svg>`;
  }

  /* phones: the one toolstrip moves into the dark footer inside the artboard frame (no second toolbar); it moves back on wider screens and in full screen */
  { const tools = $('tools'), foot = document.querySelector('.stagefoot'), shell = document.querySelector('.app'), phone = matchMedia('(max-width:680px)');
    const place = () => {
      const inFoot = phone.matches && !shell.classList.contains('immersive');
      if (inFoot && tools.parentElement !== foot) foot.append(tools);
      else if (!inFoot && tools.parentElement === foot) stage.append(tools);
      foot.classList.toggle('hastools',inFoot);
    };
    phone.addEventListener('change',place);
    new MutationObserver(place).observe(shell,{attributes:true,attributeFilter:['class']});
    place(); }

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
    else if (next === 'shape') { if ($('shapePalette')?._tool === 'shape') closeShapePalette(false); else shapePicker(); }
    else if (next === 'pen' && tool === 'pen' && pen.length >= 2) penFinish();
    else {
      const wasOpen = $('shapePalette')?._tool === next;
      closeShapePalette(false);
      setTool(next);
      if (!wasOpen && (PALETTES[next] || next === 'lasso' || next === 'picker')) toolPalette(next);
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
    if (gesture?.kind === 'picker' && /^Arrow/.test(e.key)) {
      e.preventDefault(); const st = (e.shiftKey ? 5 : 1)/Math.max(1,canvas.width/dims()[0]), d = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
      gesture.p = {x:gesture.p.x+d[0]*st,y:gesture.p.y+d[1]*st}; updateLoupe(gesture); return;
    }
    if (gesture && e.key !== 'Escape') return;
    const key = e.key.toLowerCase(), modifier = e.ctrlKey || e.metaKey;
    if (modifier && key === 'd') { e.preventDefault(); select([]); return; }
    if (modifier && key === '0') { e.preventDefault(); (view === 'graph' ? graph.fit : fit)(); return; }
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
    if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
    if (e.key === "'") { e.preventDefault(); toggleGrid(); return; }
    if (e.key === '"') { e.preventDefault(); toggleGridSnap(); return; }
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
      else if (view !== 'graph' && !deleteAnchor()) remove();
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
      const shortcut = {a:'direct',v:'select',l:'lasso',b:'brush',e:'eraser',p:'pen',t:'text',r:'shape',c:'crop',g:'gradient',i:'picker',u:'line'}[key];
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

  /* the Motion timeline (motion.js) works on this document through this small bridge */
  window.n0iseMotion = {
    R, canvas,
    get doc() { return doc; },
    get selection() { return selection; },
    setTime(t,now) { doc.time = Math.max(0,t); if (now) { if (frame) { cancelAnimationFrame(frame); frame = 0; } if (view !== 'spatial') renderComposition(); } else schedule(); },
    schedule, change, select, notice, dims,
    capture, finish,
    add(layers,extra) { change(() => { extra?.(); insert(layers); }); },
    remove() { $('removeLayer').click(); },
    holdScale(v) { forceScale = v; if (!v) schedule(); }
  };
  R.media.onFrame = () => schedule();
})();
