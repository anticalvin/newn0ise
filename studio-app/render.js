'use strict';

const StudioRender = (() => {
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

  async function prepare(doc) {
    await Promise.all(doc.layers.filter(l => l.type === 'image').map(l => image(l.src).ready));
  }

  function pathData(l) {
    const points = l.points;
    if (!points.length) return 'M 0 0';
    const [x,y] = points[0];
    if (points.length === 1) return `M ${x} ${y} l 0.01 0`;
    let d = `M ${x} ${y}`;
    const count = points.length + (l.closed ? 1 : 0);
    for (let i = 1; i < count; i++) {
      const [px,py,pdx = 0,pdy = 0] = points[i-1];
      const [nx,ny,ndx = 0,ndy = 0] = points[i % points.length];
      d += ` C ${px+pdx} ${py+pdy} ${nx-ndx} ${ny-ndy} ${nx} ${ny}`;
    }
    return d+(l.closed ? ' Z' : '');
  }

  function project(l) {
    const key = [l.type,l.fill,l.stroke,l.strokeWidth,l.shape,l.width,l.height,l.text,l.font,l.fontSize,l.src,l.crop,l.points,l.points?.length,l.closed];
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

  function drawProcedural(ctx,type,w,h,scale) {
    if (type === 'background') {
      const g = ctx.createRadialGradient(0,0,20,0,0,Math.max(w,h)*.7);
      g.addColorStop(0,'#494a4b');
      g.addColorStop(.6,'#1d1e20');
      g.addColorStop(1,'#090a0b');
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
    if (projected) {
      projected.object.globalCompositeOperation = composite ? l.blend : 'source-over';
      projected.object.render(ctx);
    } else drawProcedural(ctx,l.type,w,h,scale);
    ctx.restore();
  }

  function draw(canvas,doc,gpu) {
    const [w,h] = dimensions(doc);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,w,h);
    gpu?.begin();
    for (let i=doc.layers.length-1;i>=0;i--) {
      const l = doc.layers[i];
      if (!l.visible || !l.opacity) continue;
      let frame;
      if (gpu && l.chain) {
        const makeRaster = () => {
          if (raster.width !== w) raster.width = w;
          if (raster.height !== h) raster.height = h;
          const input = raster.getContext('2d');
          input.clearRect(0,0,w,h);
          drawLayer(input,l,w,h,false);
          return raster;
        };
        const projection = project(l)?.object ?? l.type;
        const key = l.type === 'scene' ? 'scene' : null;
        if (key) frame = gpu.renderLayer(l,doc,w,h,makeRaster,key);
        else frame = gpu.renderLayer(l,doc,w,h,makeRaster,
          rasterSignature(l,projection));
      }
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
  const rasterKeys = new WeakMap();
  function rasterSignature(layer,projection) {
    const transform = [layer.x,layer.y,layer.scale,layer.rotation].join(':');
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
    if (!l.visible || !l.opacity || l.type === 'crt' || l.type === 'background') return false;
    const q = local(l,p,w,h);
    if (l.type === 'scene') return Math.hypot(q.x,q.y) <= Math.min(w,h)*.39;
    if (l.type === 'chrome') {
      const size = Math.min(w,h);
      chromeRings(hitContext,size);
      hitContext.lineWidth = size*.13+tolerance*100/l.scale;
      return hitContext.isPointInStroke(q.x,q.y);
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
      return (l.closed && hitContext.isPointInPath(path,q.x,q.y)) || hitContext.isPointInStroke(path,q.x,q.y);
    }
    return object.containsPoint(new Point(q.x,q.y));
  }

  function corners(l,w,h) {
    const projected = project(l);
    let points = projected?.object.getCoords();
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

  return {draw,prepare,image,inside,bounds,corners,local,dimensions,center,transform,radians,pathData};
})();
