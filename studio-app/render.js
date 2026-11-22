'use strict';

function createStudioRender(vector) {
  const {Rect,Ellipse,Triangle,FabricImage,FabricText,Path,Point} = StudioFabric;
  const {dimensions,pipeline} = StudioDocument;
  const assets = new Map();
  const projections = new WeakMap();
  const radians = degrees => degrees*Math.PI/180;
  const transform = (x,y,a) => ({x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)});
  const center = (l,w,h) => ({x:w/2+l.x,y:h/2+l.y});

  function image(src) {
    if (!assets.has(src)) {
      const img = new Image();
      img.src = src;
      const ready = img.decode().then(() => img);
      ready.catch(() => {});
      assets.set(src,{img,ready});
    }
    return assets.get(src);
  }

  /* video: clips keep their file in memory (and in IndexedDB, via motion.js); each layer owns one <video> that the timeline seeks or plays */
  const mediaUrls = new Map(), videoEls = new Map();
  const media = {
    onFrame: null,
    register(id,blob) { if (!mediaUrls.has(id)) mediaUrls.set(id,URL.createObjectURL(blob)); },
    has(id) { return mediaUrls.has(id); },
    video(l) {
      if (!mediaUrls.has(l.videoId)) return null;
      let v = videoEls.get(l.id);
      if (!v || v._src !== l.videoId) {
        v = document.createElement('video');
        v._src = l.videoId; v.src = mediaUrls.get(l.videoId);
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
        for (const ev of ['loadeddata','seeked']) v.addEventListener(ev,() => media.onFrame?.());
        videoEls.set(l.id,v);
      }
      return v;
    },
    elements() { return [...videoEls.values()]; }
  };
  const activeAt = (l,t) => l.dur === undefined || l.start === undefined || (t >= l.start && t < l.start+l.dur);
  async function prepare(doc) {
    await Promise.all(doc.layers.filter(l => l.type === 'image').map(l => image(l.src).ready));
  }

  const {pathData,generateGeometry,geometryMarkup,geometryBounds,viewBox} = vector;
  const vectorCache = new WeakMap();
  function procedural(l) {
    let entry = vectorCache.get(l.definition);
    if (!entry) {
      const geometry = generateGeometry(l.definition);
      entry = {geometry, paths:geometry.map(path => new Path2D(pathData(path))),bounds:geometryBounds(geometry,0)};
      vectorCache.set(l.definition,entry);
    }
    return entry;
  }

  function drawVector(ctx,l) {
    const {geometry,paths} = procedural(l);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (let i = 0; i < paths.length; i++) {
      ctx.strokeStyle = geometry[i].stroke;
      ctx.lineWidth = geometry[i].strokeWidth;
      ctx.stroke(paths[i]);
    }
  }

  function vectorImage(l) {
    const surface = document.createElement('canvas');
    const [x,y,w,h] = viewBox(procedural(l).geometry);
    const density = Math.max(2,Math.min(4096/w,l.scale/100));
    surface.width = Math.ceil(w*density);
    surface.height = Math.ceil(h*density);
    const ctx = surface.getContext('2d');
    ctx.scale(surface.width/w,surface.height/h);
    ctx.translate(-x,-y);
    drawVector(ctx,l);
    return {src:surface.toDataURL('image/png'),width:w,height:h};
  }

  function project(l) {
    const key = [l.type,l.videoId,l.fill,l.stroke,l.strokeWidth,l.shape,l.width,l.height,l.text,l.font,l.fontSize,l.src,l.crop,l.points,l.points?.length,l.closed];
    const cached = projections.get(l);
    if (cached && (cached.key === key || (Array.isArray(key) && key.every((v,i) => v === cached.key[i])))) return cached.value;
    const style = {originX:'center',originY:'center',objectCaching:false,fill:l.fill,
      stroke:l.stroke,strokeWidth:l.strokeWidth ?? 0,strokeLineJoin:'round',strokeLineCap:'round'};
    let object, x = 0, y = 0;
    if (l.type === 'shape') {
      const {width,height} = l;
      if (l.shape === 'ellipse') object = new Ellipse({...style,rx:width/2,ry:height/2});
      else if (l.shape === 'triangle') object = new Triangle({...style,width,height});
      else object = new Rect({...style,width,height});
    } else if (l.type === 'text') {
      object = new FabricText(l.text || ' ',{...style,fontFamily:l.font,fontSize:l.fontSize});
    } else if (l.type === 'image') {
      const {img} = image(l.src);
      if (!img.naturalWidth) return null;
      const [cx,cy,cw,ch] = l.crop ?? [0,0,1,1];
      object = new FabricImage(img,{...style,cropX:cx*img.naturalWidth,cropY:cy*img.naturalHeight,
        width:cw*img.naturalWidth,height:ch*img.naturalHeight,
        scaleX:l.width/img.naturalWidth,scaleY:l.height/img.naturalHeight});
      x = (cx+cw/2-0.5)*l.width;
      y = (cy+ch/2-0.5)*l.height;
    } else if (l.type === 'video') {
      /* geometry only (selection, hit tests); the frame itself is drawn straight from the <video> in drawLayer */
      object = new Rect({...style,fill:'transparent',stroke:null,strokeWidth:0,width:l.width,height:l.height});
    } else if (l.type === 'brush' || l.type === 'path') {
      object = new Path(pathData(l),{...style,fill:l.closed ? l.fill : null,
        strokeWidth:l.strokeWidth || (l.closed ? 0 : 4)});
      x = object.pathOffset.x;
      y = object.pathOffset.y;
    } else return null;
    object.set({left:x,top:y});
    object.setCoords();
    const value = {object,x,y};
    projections.set(l,{key,value});
    return value;
  }

  function chromeRings(ctx,size) {
    ctx.beginPath();
    ctx.ellipse(0,0,size*.33,size*.18,-.46,0,Math.PI*2);
    ctx.moveTo(Math.cos(-.46)*size*.18,Math.sin(-.46)*size*.18);
    ctx.ellipse(0,0,size*.18,size*.38,-.46,0,Math.PI*2);
  }

  function crt(ctx,w,h) {
    ctx.fillStyle = '#d8e4dd';
    for (let y=-h/2;y<h/2;y+=10) ctx.fillRect(-w/2,y,w,2);
    ctx.fillStyle = '#8db8ba';
    for (let i=0;i<650;i++) ctx.fillRect(Math.sin(i*17.1)*w*.48,Math.cos(i*12.2)*h*.48,3,3);
  }

  function drawProcedural(ctx,type,w,h,scale,layer) {
    if (type === 'background' && layer?.fill) {
      ctx.fillStyle = layer.fill;
      ctx.fillRect(-w/2,-h/2,w,h);
    } else if (type === 'background') {
      const g = ctx.createRadialGradient(0,0,20,0,0,Math.max(w,h)*.7);
      g.addColorStop(0,'#494a4b');
      g.addColorStop(.6,'#1d1e20');
      g.addColorStop(1,'#090a0b');
      ctx.fillStyle = g;
      ctx.fillRect(-w/2,-h/2,w,h);
    } else if (type === 'gradient') {
      const value = layer.gradient ?? {kind:'linear',from:[-w/2,0],to:[w/2,0],start:'#e9e5db',end:'#101112'};
      const from = value.from ?? [-w/2,0], to = value.to ?? [w/2,0];
      const g = value.kind === 'radial'
        ? ctx.createRadialGradient(from[0],from[1],0,to[0],to[1],Math.max(1,Math.hypot(to[0]-from[0],to[1]-from[1])))
        : ctx.createLinearGradient(from[0],from[1],to[0],to[1]);
      g.addColorStop(0,value.start ?? '#e9e5db');
      g.addColorStop(1,value.end ?? '#101112');
      ctx.fillStyle = g;
      ctx.fillRect(-w/2,-h/2,w,h);
    } else if (type === 'chrome') {
      const size = Math.min(w,h);
      ctx.shadowColor = '#e1dfd9';
      ctx.shadowBlur = size*.045*scale;
      ctx.lineWidth = size*.13;
      const grad = ctx.createLinearGradient(-size*.38,-size*.36,size*.38,size*.36);
      [[0,'#f8f5ef'],[.15,'#3d4146'],[.29,'#e8e4dc'],[.49,'#14171a'],[.7,'#dad8d2'],
        [.86,'#42474b'],[1,'#f2eee7']].forEach(([at,color]) => grad.addColorStop(at,color));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0,0,size*.33,size*.18,-.46,0,Math.PI*2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0,0,size*.18,size*.38,-.46,0,Math.PI*2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff80';
      ctx.beginPath();
      ctx.ellipse(0,0,size*.31,size*.18,-.46,0,Math.PI*2);
      ctx.stroke();
    } else if (type === 'crt') crt(ctx,w,h);
  }

  const raster = document.createElement('canvas');

  function drawLayer(ctx,l,w,h,composite = true) {
    const p = center(l,w,h), scale = l.scale/100;
    ctx.save();
    if (composite) {
      ctx.globalAlpha = l.opacity/100;
      ctx.globalCompositeOperation = l.blend;
    }
    ctx.translate(p.x,p.y);
    ctx.rotate(radians(l.rotation));
    ctx.scale(scale,scale);
    const projected = project(l);
    if (l.type === 'video') {
      const v = media.video(l);
      if (v && v.videoWidth && v.readyState >= 2) ctx.drawImage(v,-l.width/2,-l.height/2,l.width,l.height);
    } else if (projected) {
      projected.object.globalCompositeOperation = composite ? l.blend : 'source-over';
      projected.object.render(ctx);
    } else if (l.type === 'procedure') drawVector(ctx,l);
    else if (l.type === 'procgraph') drawProcGraph(ctx,l,w,h);
    else drawProcedural(ctx,l.type,w,h,scale,l);
    ctx.restore();
  }

  /* ---- procedural graph layers: the runtime (StudioProc) renders pixels at the graph's resolution, scaled into the artboard ---- */
  let liveDoc = null;
  const procEntries = new Map(), procScratch = document.createElement('canvas');
  function procSource(kind,type,layerId,W,H,fit) {
    const layers = liveDoc?.__sources || liveDoc?.layers || [], l = (layerId && layers.find(x => x.id === layerId && x.type === type)) || layers.find(x => x.type === type);
    if (kind === 'key') return l ? [l.id,type === 'image' ? String(l.src).length : 0,JSON.stringify(l.crop || null)] : null;
    if (!l) return null;
    let src, sw, sh;
    if (type === 'video') { const v = media.video(l); if (!v || !v.videoWidth || v.readyState < 2) return null; src = v; sw = v.videoWidth; sh = v.videoHeight; }
    else { const im = image(l.src).img; if (!im || !im.naturalWidth) return null; src = im; sw = im.naturalWidth; sh = im.naturalHeight; }
    if (procScratch.width !== W) procScratch.width = W; if (procScratch.height !== H) procScratch.height = H;
    const g = procScratch.getContext('2d',{willReadFrequently:true}); g.clearRect(0,0,W,H);
    const k = fit === 'stretch' ? null : fit === 'contain' ? Math.min(W/sw,H/sh) : Math.max(W/sw,H/sh), dw = k ? sw*k : W, dh = k ? sh*k : H;
    g.drawImage(src,(W-dw)/2,(H-dh)/2,dw,dh);
    return g.getImageData(0,0,W,H).data;
  }
  function drawProcGraph(ctx,l,w,h) {
    if (!l.graph) return;
    let e = procEntries.get(l.id); if (!e) { e = {rt:new StudioProc.Runtime(l.graph,{}),cv:document.createElement('canvas'),errors:new Map()}; procEntries.set(l.id,e); }
    e.rt.setGraph(l.graph); e.rt.source = procSource;
    const res = l.graph.res || 480, ar = w/h, W = Math.round(ar >= 1 ? res : res*ar), H = Math.round(ar >= 1 ? res/ar : res);
    const r = e.rt.render(liveDoc?.time ?? 0,W,H); e.errors = r.errors; e.stats = r.stats;
    if (r.image) { if (e.cv.width !== W) e.cv.width = W; if (e.cv.height !== H) e.cv.height = H; e.cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.image),W,H),0,0); ctx.imageSmoothingEnabled = true; ctx.drawImage(e.cv,-w/2,-h/2,w,h); }
  }
  const procStatus = id => { const e = procEntries.get(id); return e ? {errors:e.errors,stats:e.stats,canvas:e.cv} : null; };

  let adjSnap = null;
  /* scale > 1 re-renders the vectors at screen resolution so shapes and text stay crisp when zoomed in */
  function draw(canvas,doc,gpu,scale = 1) {
    const [w,h] = dimensions(doc), cw = Math.round(w*scale), ch = Math.round(h*scale);
    liveDoc = doc;
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cw,ch);
    ctx.setTransform(cw/w,0,0,ch/h,0,0);
    gpu?.begin();
    for (let i=doc.layers.length-1;i>=0;i--) {
      const l = doc.layers[i];
      if (!l.visible || !l.opacity || !activeAt(l,doc.time ?? 0)) continue;
      if (l.type === 'adjustment') {
        if (!adjSnap) adjSnap = document.createElement('canvas');
        adjSnap.width = cw; adjSnap.height = ch;
        adjSnap.getContext('2d').drawImage(canvas,0,0);
        const out = StudioLooks.adjust(adjSnap,l,cw,ch,doc.time ?? 0);
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,cw,ch);
        ctx.drawImage(adjSnap,0,0);
        ctx.globalAlpha = l.opacity/100;
        ctx.drawImage(out,0,0);
        ctx.restore();
        continue;
      }
      let frame;
      const makeRaster = () => {
        if (raster.width !== w) raster.width = w;
        if (raster.height !== h) raster.height = h;
        const input = raster.getContext('2d');
        input.clearRect(0,0,w,h);
        drawLayer(input,l,w,h,false);
        return raster;
      };
      if (gpu && l.chain) {
        const projection = l.type === 'procedure' ? procedural(l) : project(l)?.object ?? l.type;
        const key = l.type === 'scene' ? 'scene' : null;
        if (key) frame = gpu.renderLayer(l,doc,w,h,makeRaster,key);
        else frame = gpu.renderLayer(l,doc,w,h,makeRaster,
          rasterSignature(l,projection));
      }
      if (!frame && l.type === 'procedure' && (l.opacity !== 100 || l.blend !== 'source-over')) frame = makeRaster();
      if (l.look) { frame = StudioLooks.apply(frame || makeRaster(),l.look,w,h,doc.time ?? 0); }
      if (frame) {
        ctx.save();
        ctx.globalAlpha = l.opacity/100;
        ctx.globalCompositeOperation = l.blend;
        if (l.type === 'scene') {
          const p = center(l,w,h);
          ctx.translate(p.x,p.y);
          ctx.rotate(radians(l.rotation));
          ctx.scale(l.scale/100,l.scale/100);
          ctx.drawImage(frame,-w/2,-h/2);
        } else ctx.drawImage(frame,0,0);
        ctx.restore();
      } else if (l.type === 'scene') {
        const p = center(l,w,h), size = Math.min(w,h)*.28;
        ctx.save();
        ctx.strokeStyle = '#a5a29b';
        ctx.strokeRect(p.x-size/2,p.y-size/2,size,size);
        ctx.fillStyle = '#c2beb5';
        ctx.font = '18px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Scene unavailable',p.x,p.y);
        ctx.restore();
      } else drawLayer(ctx,l,w,h);
    }
    for (const node of pipeline(doc.graph) ?? []) {
      ctx.save();
      ctx.translate(w/2,h/2);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = node.amount/100;
      crt(ctx,w,h);
      ctx.restore();
    }
    return gpu?.end() ?? [];
  }
  function toSVG(doc,gpu,preview) {
    const [w,h] = dimensions(doc);
    const root = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="isolation:isolate">`;
    const image = surface => `<image width="${w}" height="${h}" href="${surface.toDataURL('image/png')}"/>`;
    // The legacy whole-composition CRT reads the finished stack.
    if (pipeline(doc.graph)?.some(node => node.amount > 0) ||
      doc.layers.some(l => l.visible && (l.blend === 'destination-out' || (l.type === 'adjustment' && l.opacity)))) return root+image(preview)+'</svg>';
    const surface = document.createElement('canvas');
    const blends = {screen:'screen',multiply:'multiply',lighter:'plus-lighter'};
    const fragments = [];
    for (const l of [...doc.layers].reverse()) {
      if (!l.visible || !l.opacity) continue;
      const vector = ['shape','text','path','brush','procedure'].includes(l.type) && !l.look &&
        !l.chain?.nodes.some(n => n.type === 'effect');
      let markup;
      if (vector) {
        const p = center(l,w,h);
        const transform = `translate(${p.x} ${p.y}) rotate(${l.rotation}) scale(${l.scale/100})`;
        const drawing = l.type === 'procedure' ? geometryMarkup(procedural(l).geometry) : project(l).object.toSVG();
        markup = `<g transform="${transform}">${drawing}</g>`;
      } else {
        draw(surface,{...doc,layers:[{...l,opacity:100,blend:'source-over'}],__sources:doc.layers},gpu);
        markup = image(surface);
      }
      const style = Object.hasOwn(blends,l.blend) ? ` style="mix-blend-mode:${blends[l.blend]}"` : '';
      fragments.push(`<g opacity="${l.opacity/100}"${style}>${markup}</g>`);
    }
    return root+fragments.join('')+'</svg>';
  }

  const rasterKeys = new WeakMap();
  function rasterSignature(layer,projection) {
    const transform = JSON.stringify([layer.x,layer.y,layer.scale,layer.rotation,layer.gradient,layer.fill,
      layer.stroke,layer.strokeWidth,layer.width,layer.height,layer.shape,layer.text,layer.fontSize,
      layer.points,layer.crop,layer.type === 'procgraph' ? [liveDoc?.time,JSON.stringify(layer.graph)] : null,layer.type === 'video' ? [layer.start,layer.trim,media.video(layer)?.currentTime] : null]);
    const key = rasterKeys.get(layer);
    if (key && key.transform === transform && key.projection === projection) return key;
    const next = {projection,transform};
    rasterKeys.set(layer,next);
    return next;
  }

  const hitContext = document.createElement('canvas').getContext('2d');
  function local(l,p,w,h) {
    const c = center(l,w,h);
    return transform((p.x-c.x)*100/l.scale,(p.y-c.y)*100/l.scale,-radians(l.rotation));
  }

  function inside(l,p,w,h,tolerance) {
    if (!l.visible || !l.opacity || l.type === 'crt' || l.type === 'background' || l.type === 'adjustment') return false;
    if (l.type === 'gradient' || l.type === 'procgraph') return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
    const q = local(l,p,w,h);
    if (l.type === 'scene') return Math.hypot(q.x,q.y) <= Math.min(w,h)*.39;
    if (l.type === 'chrome') {
      const size = Math.min(w,h);
      chromeRings(hitContext,size);
      hitContext.lineWidth = size*.13+tolerance*100/l.scale;
      return hitContext.isPointInStroke(q.x,q.y);
    }
    if (l.type === 'procedure') {
      const {geometry,paths,bounds} = procedural(l);
      const margin = tolerance*100/l.scale;
      if (q.x < bounds.left-margin || q.x > bounds.right+margin || q.y < bounds.top-margin || q.y > bounds.bottom+margin) return false;
      hitContext.lineCap = 'round';
      return paths.some((path,i) => {
        hitContext.lineWidth = geometry[i].strokeWidth+2*margin;
        return hitContext.isPointInStroke(path,q.x,q.y);
      });
    }
    const projected = project(l);
    if (!projected) return false;
    const {object} = projected;
    if (l.type === 'shape' && l.shape === 'ellipse') {
      return Math.hypot(q.x/(object.rx+l.strokeWidth/2),q.y/(object.ry+l.strokeWidth/2)) <= 1;
    }
    if (l.type === 'shape' && l.shape === 'triangle') {
      const ratio = (q.y/l.height+.5);
      return ratio >= 0 && ratio <= 1 && Math.abs(q.x) <= ratio*l.width/2+l.strokeWidth/2;
    }
    if (l.type === 'path' || l.type === 'brush') {
      const path = new Path2D(pathData(l));
      hitContext.lineWidth = Math.max(l.strokeWidth || 4,tolerance*200/l.scale);
      hitContext.lineCap = 'round';
      return (l.closed && l.fill && hitContext.isPointInPath(path,q.x,q.y)) || hitContext.isPointInStroke(path,q.x,q.y);
    }
    return object.containsPoint(new Point(q.x,q.y));
  }

  function corners(l,w,h) {
    const projected = project(l);
    let points = projected?.object.getCoords();
    if (l.type === 'procedure') {
      const {left,right,top,bottom} = procedural(l).bounds;
      points = [{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
    }
    if (!points) {
      const s = Math.min(w,h), x = l.type === 'chrome' || l.type === 'scene' ? s*.38 : w/2;
      const y = l.type === 'chrome' || l.type === 'scene' ? s*.44 : h/2;
      points = [{x:-x,y:-y},{x,y:-y},{x,y},{x:-x,y}];
    }
    const c = center(l,w,h);
    return points.map(p => {
      const q = transform(p.x*l.scale/100,p.y*l.scale/100,radians(l.rotation));
      return {x:q.x+c.x,y:q.y+c.y};
    });
  }
  function bounds(l,w,h) {
    const p = corners(l,w,h);
    return {left:Math.min(...p.map(a => a.x)),right:Math.max(...p.map(a => a.x)),
      top:Math.min(...p.map(a => a.y)),bottom:Math.max(...p.map(a => a.y))};
  }

  return {media,activeAt,draw,toSVG,prepare,image,inside,bounds,corners,local,dimensions,center,transform,radians,pathData,vectorImage,procStatus};
}
