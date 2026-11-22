'use strict';

const StudioDocument = (() => {
  const sizes = {landscape:[1920,1080], portrait:[1080,1920], square:[1440,1440]};
  const ratios = {landscape:'16:9', portrait:'9:16', square:'1:1'};
  const labels = {video:'Video',chrome:'Chrome form', crt:'CRT effect', background:'Background', shape:'Shape',
    brush:'Brush stroke', image:'Image', text:'Text', path:'Path', scene:'Metallic torus',gradient:'Gradient',procedure:'Procedural vector',adjustment:'Adjustment',procgraph:'Procedural graph'};
  const blends = ['source-over','screen','multiply','lighter','destination-out'];
  const graph = () => ({
    nodes:[{id:'source',type:'source',x:35,y:55},{id:'output',type:'output',x:450,y:55}],
    edges:[{from:'source',to:'output'}]
  });
  const copy = value => structuredClone(value);
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const number = (value,fallback,min,max) => Number.isFinite(value) ? clamp(value,min,max) : fallback;
  const id = () => globalThis.crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
  const layer = (type, props = {}) => ({
    id:id(),type,name:labels[type],visible:true,opacity:100,blend:'source-over',
    x:0,y:0,scale:100,rotation:0,...props
  });
  const minSize = 64, maxSize = 4096, maxPixels = 8388608;
  const validSize = size => Array.isArray(size) && size.length === 2 &&
    size.every(n => Number.isInteger(n) && n >= minSize && n <= maxSize) && size[0]*size[1] <= maxPixels;
  const dimensions = doc => doc.ratio === 'custom' ? doc.size : sizes[doc.ratio];
  function ratioName(doc) {
    if (doc.ratio !== 'custom') return ratios[doc.ratio];
    let [a,b] = doc.size;
    while (b) [a,b] = [b,a%b];
    const [w,h] = doc.size.map(n => n/a);
    return w <= 100 && h <= 100 ? w+':'+h : 'CUSTOM';
  }
  function create(ratio, demo = false, size) {
    if (ratio === 'custom' && !validSize(size)) throw Error('Choose supported canvas dimensions.');
    return {
      format:'n0ise-studio',version:2,duration:8,name:'Untitled 01',ratio,swatches:[],...(ratio === 'custom' ? {size:[...size]} : {}),graph:graph(),time:0,fps:30,seed:7,
      layers:demo ? [
        sceneLayer(),
        layer('crt',{name:'CRT Lab',opacity:38,blend:'screen'}),
        layer('background')
      ] : []
    };
  }

  function sceneLayer() {
    return layer('scene',{
      asset:{format:'studio-scene',version:1,geometry:{kind:'torus',radius:.7,tube:.28,radialSegments:32,tubularSegments:64},
        material:{kind:'metal',color:'#d8d6cf',roughness:.21,metalness:1},
        transform:{rotation:[.72,-.41,-.47]}},
      chain:StudioGraph.create('scene')
    });
  }

  const color = (value,fallback) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  function normalize(raw,validateDefinition) {
    if (!raw || raw.format !== 'n0ise-studio' || ![1,2].includes(raw.version) ||
      !(Object.hasOwn(sizes,raw.ratio) || (raw.ratio === 'custom' && validSize(raw.size))) || !Array.isArray(raw.layers)) {
      throw new Error('Choose a supported n0ise Studio project.');
    }
    const project = create(raw.ratio,false,raw.size);
    project.name = String(raw.name || project.name).slice(0,120);
    project.time = number(raw.time,0,0,1e6);
    project.fps = number(raw.fps,30,1,120);
    project.duration = number(raw.duration,8,1,600);
    project.seed = number(raw.seed,7,0,2147483647);
    if (raw.artboardLocked === true) project.artboardLocked = true;
    project.swatches = Array.isArray(raw.swatches) ? [...new Set(raw.swatches.filter(c => /^#[0-9a-f]{6}$/i.test(c)).map(c => c.toLowerCase()))].slice(0,64) : [];
    const ids = new Set();
    project.layers = raw.layers.map(item => {
      if (!item || !Object.hasOwn(labels,item.type) || typeof item.id !== 'string' || ids.has(item.id)) {
        throw new Error('This project contains an invalid layer.');
      }
      ids.add(item.id);
      const l = layer(item.type,{
        id:item.id,name:String(item.name || labels[item.type]).slice(0,120),visible:item.visible !== false,
        ...(item.locked === true ? {locked:true} : {}),
        x:number(item.x,0,-1e6,1e6),y:number(item.y,0,-1e6,1e6),rotation:number(item.rotation,0,-36000,36000),
        opacity:number(item.opacity,100,0,100),scale:number(item.scale,100,1,2000),
        blend:blends.includes(item.blend) ? item.blend : 'source-over'
      });
      if (Number.isFinite(item.start) && Number.isFinite(item.dur) && item.dur > 0) { l.start = number(item.start,0,0,6000); l.dur = number(item.dur,1,.05,6000); }
      if (l.type === 'video') {
        if (typeof item.videoId !== 'string' || !item.videoId) throw new Error('This project contains an invalid video.');
        l.videoId = item.videoId.slice(0,80);
        l.width = number(item.width,640,1,8192); l.height = number(item.height,360,1,8192);
        l.srcDur = number(item.srcDur,1,.05,6000); l.trim = number(item.trim,0,0,6000);
        l.volume = number(item.volume,1,0,1); l.muted = item.muted === true;
      }
      if (l.type === 'procedure') l.definition = validateDefinition(item.definition);
      if (l.type === 'procgraph') l.graph = StudioProc.normalize(item.graph);
      if (l.type === 'scene') {
        const asset = item.asset;
        if (!asset || typeof asset !== 'object' || Array.isArray(asset)) throw Error('Invalid scene asset.');
        l.asset = copy(asset);
        if (asset.format === 'studio-scene' && asset.version === 1) {
          if (!Array.isArray(asset.transform?.rotation) || asset.transform.rotation.length !== 3 ||
            !asset.transform.rotation.every(Number.isFinite)) throw Error('Invalid scene rotation.');
        }
      }
      if (l.type === 'adjustment') {
        l.adj = StudioLooks.normalizeAdj(item.adj);
        l.look = StudioLooks.normalize(item.look) || StudioLooks.blank();
      } else
      { const look = l.type === 'crt' || l.type === 'background' ? null : StudioLooks.normalize(item.look); if (look) l.look = look; }
      if (item.chain || l.type === 'scene') l.chain = StudioGraph.normalize(item.chain,l.type);
      if (l.type === 'image') {
        if (typeof item.src !== 'string' || !/^data:image\/(png|jpeg|webp|gif|avif|bmp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(item.src)) {
          throw new Error('This project contains an unsupported image.');
        }
        l.src = item.src;
        if (Array.isArray(item.palette)) l.palette = item.palette.filter(c => /^#[0-9a-f]{6}$/i.test(c)).map(c => c.toLowerCase()).slice(0,12);
        l.width = number(item.width,600,1,8192);
        l.height = number(item.height,600,1,8192);
        if (Array.isArray(item.crop) && item.crop.length === 4 && item.crop.every(Number.isFinite)) {
          const [x,y,w,h] = item.crop;
          if (x >= 0 && y >= 0 && w > 0 && h > 0 && x+w <= 1.00001 && y+h <= 1.00001) l.crop = item.crop;
        }
      }
      if (l.type === 'background' && /^#[0-9a-f]{6}$/i.test(item.fill)) l.fill = item.fill.toLowerCase();
      if (l.type === 'shape' || l.type === 'text' || l.type === 'path' || l.type === 'brush') {
        l.fill = l.type === 'path' && item.fill === null ? null : color(item.fill,l.type === 'shape' ? '#d5d0c5' : '#e9e5db');
        l.stroke = color(item.stroke,'#e9e5db');
        l.strokeWidth = number(item.strokeWidth,0,0,200);
      }
      if (l.type === 'shape') {
        l.shape = ['rectangle','ellipse','triangle'].includes(item.shape) ? item.shape : 'rectangle';
        l.width = number(item.width,240,1,8192);
        l.height = number(item.height,240,1,8192);
      }
      if (l.type === 'gradient') {
        const rawGradient = item.gradient && typeof item.gradient === 'object' ? item.gradient : {};
        const point = (value,fallback) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
          ? value.map(n => clamp(n,-8192,8192)) : fallback;
        l.gradient = {
          kind:rawGradient.kind === 'radial' ? 'radial' : 'linear',
          from:point(rawGradient.from,[-dimensions(project)[0]/2,0]),
          to:point(rawGradient.to,[dimensions(project)[0]/2,0]),
          start:color(rawGradient.start,'#e9e5db'),end:color(rawGradient.end,'#101112')
        };
      }
      if (l.type === 'text') {
        l.text = String(item.text ?? 'Type here').slice(0,2000);
        l.font = ['sans-serif','serif','monospace'].includes(item.font) ? item.font : 'sans-serif';
        l.fontSize = number(item.fontSize,96,8,600);
      }
      if (l.type === 'path' || l.type === 'brush') {
        if (!Array.isArray(item.points) || item.points.length > 100000 || !item.points.every(point =>
          Array.isArray(point) && (l.type === 'path' ? (point.length === 4 || point.length === 6) : point.length === 2) &&
          point.every(v => Number.isFinite(v) && Math.abs(v) <= 1e6))) {
          throw new Error('This project contains invalid path geometry.');
        }
        l.points = item.points;
        l.closed = item.closed === true;
        if (l.type === 'path' && Array.isArray(item.breaks)) { const br = item.breaks.filter((b,i,arr) => Number.isInteger(b) && b > 0 && b < item.points.length && (i === 0 || b > arr[i-1])); if (br.length) l.breaks = br; }
      }
      return l;
    });
    if (raw.graph) {
      const nodes = raw.graph.nodes;
      if (!Array.isArray(nodes) || !Array.isArray(raw.graph.edges) ||
        !nodes.every(n => n && typeof n.id === 'string' && ['source','output','crt'].includes(n.type)) ||
        nodes.length !== new Set(nodes.map(n => n.id)).size ||
        nodes.filter(n => n.id === 'source' && n.type === 'source').length !== 1 ||
        nodes.filter(n => n.id === 'output' && n.type === 'output').length !== 1 ||
        nodes.some(n => n.type !== 'crt' && n.id !== n.type)) throw new Error('Invalid composition graph.');
      project.graph.nodes = nodes.map(n => ({
        id:n.id,type:n.type,x:number(n.x,0,-1e5,1e5),y:number(n.y,0,-1e5,1e5),
        ...(n.type === 'crt' ? {amount:number(n.amount,38,0,100)} : {})
      }));
      project.graph.edges = [];
      for (const e of raw.graph.edges) {
        if (!e || !connect(project.graph,e.from,e.to)) throw new Error('Invalid composition connection.');
      }
    }
    /* several artboards: the active one lives in project.layers, the others keep their own layers, graph and size */
    if (Array.isArray(raw.artboards) && raw.artboards.length > 1 && raw.artboards.length <= 12 && raw.artboards.some(ab => ab?.id === raw.activeArtboard)) {
      const seen = new Set();
      project.artboards = raw.artboards.map(ab => {
        if (!ab || typeof ab.id !== 'string' || !ab.id || seen.has(ab.id)) throw new Error('This project contains an invalid artboard.');
        seen.add(ab.id); const name = String(ab.name || 'Artboard').slice(0,60);
        if (ab.id === raw.activeArtboard) return {id:ab.id,name};
        if (!Array.isArray(ab.layers)) throw new Error('This project contains an invalid artboard.');
        const sub = normalize({...raw,ratio:ab.ratio,size:ab.size,layers:ab.layers,graph:ab.graph,artboards:undefined,activeArtboard:undefined},validateDefinition);
        return {id:ab.id,name,ratio:sub.ratio,...(sub.ratio === 'custom' ? {size:sub.size} : {}),layers:sub.layers,graph:sub.graph};
      });
      project.activeArtboard = raw.activeArtboard;
    }
    return project;
  }

  function connect(g, from, to) {
    if (from === to || !g.nodes.some(n => n.id === from && n.type !== 'output') ||
      !g.nodes.some(n => n.id === to && n.type !== 'source')) return false;
    const edges = g.edges.filter(e => e.to !== to);
    for (let cursor = from; cursor;) {
      if (cursor === to) return false;
      cursor = edges.find(e => e.to === cursor)?.from;
    }
    g.edges = [...edges,{from,to}];
    return true;
  }

  function pipeline(g) {
    const effects = [];
    let cursor = 'output';
    while (cursor !== 'source') {
      cursor = g.edges.find(e => e.to === cursor)?.from;
      if (!cursor) return null;
      if (cursor !== 'source') effects.unshift(g.nodes.find(n => n.id === cursor));
    }
    return effects;
  }

  function history() {
    const past = [], future = [];
    return {
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; },
      push(before) {
        past.push(before);
        if (past.length > 50) past.shift();
        future.length = 0;
      },
      step(direction,current) {
        const [from,to] = direction === 'undo' ? [past,future] : [future,past];
        if (!from.length) return null;
        to.push(current);
        return from.pop();
      },
      clear() { past.length = 0; future.length = 0; }
    };
  }

  return {sizes,ratios,minSize,maxSize,validSize,dimensions,ratioName,labels,create,layer,sceneLayer,normalize,copy,clamp,id,history,connect,pipeline,outputConnected:g => pipeline(g) !== null};
})();
