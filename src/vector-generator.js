// Version 1 uses Studio's anchor format: [x, y, outgoing tangent x, outgoing tangent y].
// Coordinates are centered. Incoming tangents are the inverse of outgoing tangents.
export const VECTOR_FORMAT = 'n0ise-vector-generator';
export const VECTOR_SIZE = 440;
export const MAX_DEFINITION_LENGTH = 16384;
const numeric = (label, min, max, step, initial) => ({label,min,max,step,initial});
const choice = (label, options, initial) => ({label,options,initial});
const count = initial => numeric('Count', 2, 80, 1, initial);
const angle = (label, initial = 0) => numeric(label, -180, 180, 1, initial);
const spacing = choice('Spacing curve', ['linear','quadratic','exponential'], 'linear');
const radii = {diameter:numeric('Outer diameter', 60, 350, 1, 312),
  inner:numeric('Inner radius ratio', 0.02, .85, .01, .09), spacing,
  density:numeric('Density bias', .45, 2.6, .01, 1)};
const ring = {gap:numeric('Ring gap °', 0, 310, 1, 0), phase:angle('Phase °')};

export const GENERATORS = {
  concentric:{name:'Concentric Geometry', parameters:{
    count:count(16), ...radii, offset:numeric('Displacement X',-100,100,.5,32),
    offsetY:numeric('Displacement Y',-100,100,.5,0),
    eccentricity:numeric('Eccentricity',.2,1.8,.01,1), ...ring,
    twist:angle('Gap progression °',12)}},
  interference:{name:'Interference', parameters:{
    count:count(19), ...radii, systems:numeric('Centers',2,4,1,2),
    separation:numeric('Center separation',0,180,1,64), ...ring,
    drift:numeric('Phase drift',-.45,.45,.01,.16),
    mask:choice('Mask',['none','overlap'],'none')}},
  radial:{name:'Radial Systems', parameters:{
    count:numeric('Segments per repeat',2,24,1,11), sectors:numeric('Symmetry repeats',1,12,1,4),
    inner:numeric('Inner radius',0,130,1,21), length:numeric('Segment length',8,150,1,139),
    phase:angle('Angular offset °'), bend:angle('Sweep °',24),
    alternate:numeric('Alternate length',.1,1,.01,.69),
    density:numeric('Angular density',.35,3,.01,1),
    radialDensity:numeric('Radial density',0,.8,.01,.15)}},
  architecture:{name:'Architectural Geometry', parameters:{
    count:numeric('Nested outlines',2,32,1,13), diameter:numeric('Outer diameter',60,360,1,310),
    sides:numeric('Polygon sides',3,12,1,4), corner:numeric('Corner roundness',0,.48,.01,.15),
    scaleCurve:numeric('Scale progression',.3,3,.01,1),
    twist:angle('Rotational progression °',24), columns:numeric('Grid columns',1,4,1,1),
    rows:numeric('Grid rows',1,4,1,1)}},
  field:{name:'Curvature Fields', parameters:{
    count:count(32), spacing:numeric('Line spacing',.25,1.25,.01,1),
    attractX:numeric('Attractor X',-140,140,1,50), attractY:numeric('Attractor Y',-140,140,1,-32),
    curvature:numeric('Curvature',-160,160,1,105), spread:numeric('Attractor reach',12,180,1,95),
    distortion:numeric('Field distortion',0,90,1,32), phase:angle('Phase °')}},
  transform:{name:'Transform Sequences', parameters:{
    count:count(22), diameter:numeric('Starting diameter',16,320,1,281),
    sides:numeric('Polygon sides',3,12,1,4), scale:numeric('Scale per step',.65,1.02,.001,.938),
    twist:angle('Rotation per step °',11), x:numeric('Translation X per step',-28,28,.5,9),
    y:numeric('Translation Y per step',-28,28,.5,1),
    copies:numeric('Symmetry repeats',1,10,1,2)}}
};

export const STYLE_CONTROLS = {
  stroke:numeric('Stroke width',.2,12,.1,1.65),
  progress:numeric('Stroke progression',-.95,3,.01,.16),
  rotation:angle('Rotation °')
};

for (const generator of Object.values(GENERATORS)) {
  for (const spec of Object.values(generator.parameters)) {
    if (spec.options) Object.freeze(spec.options);
    Object.freeze(spec);
  }
  Object.freeze(generator.parameters);
  Object.freeze(generator);
}
Object.freeze(GENERATORS);
Object.values(STYLE_CONTROLS).forEach(Object.freeze);
Object.freeze(STYLE_CONTROLS);

const defaults = specs => Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key,spec.initial]));
export function vectorId() {
  return globalThis.crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
}
export function createDefinition(generator = 'concentric', id = vectorId()) {
  if (!Object.hasOwn(GENERATORS,generator)) throw Error('Unknown vector generator.');
  return validateDefinition({format:VECTOR_FORMAT, version:1, id, generator, seed:42,
    parameters:defaults(GENERATORS[generator].parameters),
    style:{color:'#e9e4d8', ...defaults(STYLE_CONTROLS)}, locks:[]});
}

function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw Error(`Unknown ${label} field "${key}".`);
}
function checkedValues(value, specs, label) {
  record(value,Object.keys(specs),label);
  return Object.fromEntries(Object.entries(specs).map(([key,spec]) => {
    const raw = value[key];
    if (spec.options ? !spec.options.includes(raw) :
      !Number.isFinite(raw) || raw < spec.min || raw > spec.max || (spec.step === 1 && !Number.isInteger(raw))) {
      throw Error(`${spec.label} must be ${spec.options?.join(', ') ?? `between ${spec.min} and ${spec.max}${spec.step === 1 ? ' (whole number)' : ''}`}.`);
    }
    return [key,raw];
  }));
}

export function validateDefinition(raw) {
  record(raw,['format','version','id','generator','seed','parameters','style','locks'],'definition');
  if (raw.format !== VECTOR_FORMAT || raw.version !== 1) throw Error('Unsupported vector definition format or version.');
  if (typeof raw.id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(raw.id)) throw Error('Invalid generator ID.');
  if (typeof raw.generator !== 'string' || !Object.hasOwn(GENERATORS,raw.generator)) throw Error('Unknown vector generator.');
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) throw Error('Seed must be a whole number from 0 to 4294967295.');
  const specs = GENERATORS[raw.generator].parameters;
  const parameters = checkedValues(raw.parameters,specs,'parameter');
  record(raw.style,['color',...Object.keys(STYLE_CONTROLS)],'style');
  const {color,...style} = raw.style;
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw Error('Stroke color must be a six-digit hex color.');
  const allowedLocks = [...Object.keys(specs),...Object.keys(STYLE_CONTROLS).map(key => 'style.'+key)];
  const locks = raw.locks ?? [];
  if (!Array.isArray(locks) || locks.length > allowedLocks.length || !locks.every(key => allowedLocks.includes(key))) {
    throw Error('Invalid parameter locks.');
  }
  return {format:VECTOR_FORMAT,version:1,id:raw.id,generator:raw.generator,seed:raw.seed,parameters,
    style:{color:color.toLowerCase(),...checkedValues(style,STYLE_CONTROLS,'style')},locks:allowedLocks.filter(key => locks.includes(key))};
}

export function parseDefinition(source) {
  if (typeof source !== 'string' || source.length > MAX_DEFINITION_LENGTH) throw Error('Vector definition exceeds 16 KB.');
  return validateDefinition(JSON.parse(source));
}

const point = (r,a) => [Math.cos(a)*r,Math.sin(a)*r];
const mix = (a,b,t) => a+(b-a)*t;
const degrees = a => a*Math.PI/180;
const full = 2*Math.PI;
const push = (paths,points,closed,t) => paths.push({points,closed,t});
function place(points, x, y, a, s = 1) {
  const c = Math.cos(a)*s, q = Math.sin(a)*s;
  return points.map(([px,py,dx,dy]) => [x+px*c-py*q,y+px*q+py*c,dx*c-dy*q,dx*q+dy*c]);
}

function arc(cx,cy,rx,ry,from,sweep,closed = false) {
  const segments = Math.max(1,Math.ceil(sweep/(Math.PI/2))), step = sweep/segments;
  const handle = 4/3*Math.tan(step/4);
  return Array.from({length:segments+Number(!closed)},(_,i) => {
    const a = from+i*step, c = Math.cos(a), s = Math.sin(a);
    return [cx+rx*c,cy+ry*s,-rx*s*handle,ry*c*handle];
  });
}

function radius(p,t) {
  const u = t**p.density;
  const curve = p.spacing === 'quadratic' ? u*u : p.spacing === 'exponential' ? Math.expm1(3*u)/Math.expm1(3) : u;
  return p.diameter/2*mix(p.inner,1,curve);
}

function rings(paths,p) {
  const sweep = full-degrees(p.gap);
  for (let i = 0; i < p.count; i++) {
    const t = i/(p.count-1), r = radius(p,t);
    push(paths,arc(p.offset*(1-t),p.offsetY*(1-t),r,r*p.eccentricity,
      degrees(p.phase+i*p.twist),sweep,!p.gap),!p.gap,t);
  }
}

function fields(paths,p) {
  // Clip the ring's angular intervals analytically against a circular overlap mask.
  const maskRadius = p.diameter*.39;
  for (let system = 0; system < p.systems; system++) {
    const a = full*system/p.systems, d = p.separation/2;
    const [cx,cy] = point(d,a);
    for (let i = 0; i < p.count; i++) {
      const t = i/(p.count-1);
      const r = radius(p,Math.min(1,Math.max(0,t+p.drift*(system/(p.systems-1)-.5)*Math.sin(Math.PI*t))));
      const start = degrees(p.phase)+a, end = start+full-degrees(p.gap);
      if (p.mask === 'none' || r+d <= maskRadius) {
        push(paths,arc(cx,cy,r,r,start,end-start,!p.gap),!p.gap,t);
      } else if (d && Math.abs(r-d) < maskRadius) {
        const half = Math.acos((r*r+d*d-maskRadius*maskRadius)/(2*r*d));
        for (const middle of [a-Math.PI,a+Math.PI,a+3*Math.PI]) {
          const lo = Math.max(start,middle-half), hi = Math.min(end,middle+half);
          if (hi > lo) push(paths,arc(cx,cy,r,r,lo,hi-lo),false,t);
        }
      }
    }
  }
}

function radial(paths,p) {
  const per = p.count;
  for (let i = 0; i < p.sectors*per; i++) {
    const index = i%per, t = index/per;
    const a = degrees(p.phase)+full*(Math.floor(i/per)+t**p.density)/p.sectors;
    const extent = Math.min(203,p.inner+p.length*(index%2 ? p.alternate : 1));
    const start = mix(p.inner,extent,p.radialDensity*t), b = a+degrees(p.bend);
    const [x,y] = point(start,a), [X,Y] = point(extent,b), h = (extent-start)*.34;
    push(paths,[[x,y,...point(h,a)],[X,Y,...point(h,b)]],false,t);
  }
}

function polygon(sides, corner = 0) {
  const handle = Math.min(corner*2/3,(1-2*corner)*.4);
  const vertices = Array.from({length:sides},(_,i) => point(1,full*i/sides-Math.PI/2+(sides === 4 ? Math.PI/4 : 0)));
  return vertices.flatMap(([x,y],i) => {
    if (!corner) return [[x,y,0,0]];
    const [px,py] = vertices[(i+sides-1)%sides], [nx,ny] = vertices[(i+1)%sides];
    const ax = (px-x)*corner, ay = (py-y)*corner, bx = (nx-x)*corner, by = (ny-y)*corner;
    return [[x+ax,y+ay,(x-px)*handle,(y-py)*handle],[x+bx,y+by,(nx-x)*handle,(ny-y)*handle]];
  });
}

function architecture(paths,p) {
  const outline = polygon(p.sides,p.corner), cell = p.diameter/Math.max(p.rows,p.columns);
  for (let y = 0; y < p.rows; y++) for (let x = 0; x < p.columns; x++) {
    for (let i = 0; i < p.count; i++) {
      const t = i/(p.count-1);
      push(paths,place(outline,(x-(p.columns-1)/2)*cell,(y-(p.rows-1)/2)*cell,
        degrees(p.twist)*t,cell*.47*mix(.09,1,t**p.scaleCurve)),true,t);
    }
  }
}

function curvature(paths,p) {
  for (let i = 0; i < p.count; i++) {
    const t = i/(p.count-1), x = mix(-142,142,t)*p.spacing;
    const attraction = p.curvature*Math.exp(-((x-p.attractX)**2)/(2*p.spread**2));
    const wave = p.distortion*Math.sin(full*t*1.5+degrees(p.phase));
    push(paths,[[x,-160,0,56],[x+attraction+wave,p.attractY,wave*.62,45],[x,160,0,56]],false,t);
  }
}

function sequence(paths,p) {
  const outline = polygon(p.sides);
  for (let copy = 0; copy < p.copies; copy++) {
    let x = 0, y = 0, r = p.diameter/2;
    const base = full*copy/p.copies;
    for (let i = 0; i < p.count; i++) {
      const a = base+degrees(p.twist)*i;
      push(paths,place(outline,x,y,a,r),true,i/(p.count-1));
      x = Math.max(-160,Math.min(160,x+Math.cos(a)*p.x-Math.sin(a)*p.y));
      y = Math.max(-160,Math.min(160,y+Math.sin(a)*p.x+Math.cos(a)*p.y));
      r = Math.min(185,r*p.scale);
    }
  }
}

const generate = {concentric:rings,interference:fields,radial,architecture,field:curvature,transform:sequence};
const rounded = n => Number(n.toFixed(4));
export function generateGeometry(definition) {
  const {generator,parameters,style} = validateDefinition(definition);
  const paths = [];
  generate[generator](paths,parameters);
  const rotation = degrees(style.rotation);
  return paths.map(({points,closed,t}) => ({
    points:place(points,0,0,rotation).map(point => point.map(rounded)),
    closed, stroke:style.color, strokeWidth:rounded(style.stroke*(1+style.progress*t))
  }));
}

export function pathData({points,closed}) {
  if (!points.length) return 'M 0 0';
  const [x,y] = points[0];
  if (points.length === 1) return `M ${x} ${y} l 0.01 0`;
  let d = `M ${x} ${y}`;
  for (let i = 1; i < points.length+Number(!!closed); i++) {
    const [px,py,pdx = 0,pdy = 0] = points[i-1];
    const [nx,ny,ndx = 0,ndy = 0] = points[i % points.length];
    d += ` C ${px+pdx} ${py+pdy} ${nx-ndx} ${ny-ndy} ${nx} ${ny}`;
  }
  return d+(closed ? ' Z' : '');
}

export function geometryBounds(paths, pad = VECTOR_SIZE/2) {
  const result = {left:-pad,top:-pad,right:pad,bottom:pad};
  for (const {points,strokeWidth} of paths) {
    for (const [x,y,dx,dy] of points) {
      const half = strokeWidth/2;
      result.left = Math.min(result.left,x-Math.abs(dx)-half);
      result.top = Math.min(result.top,y-Math.abs(dy)-half);
      result.right = Math.max(result.right,x+Math.abs(dx)+half);
      result.bottom = Math.max(result.bottom,y+Math.abs(dy)+half);
    }
  }
  return result;
}

export function geometryMarkup(paths) {
  return '<g fill="none" stroke-linecap="round" stroke-linejoin="round">'+
    paths.map(path => `<path d="${pathData(path)}" stroke="${path.stroke}" stroke-width="${path.strokeWidth}"/>`).join('')+'</g>';
}

import {frameViewBox} from './lab-canvas.js';
export function viewBox(paths) {
  const {left,top,right,bottom} = geometryBounds(paths);
  const radius = Math.ceil(Math.max(-left,-top,right,bottom));
  return [-radius,-radius,radius*2,radius*2];
}

/* frame: optional {w,h} from Lab's canvas size. The viewBox is framed to that ratio and the SVG's width and height are the chosen pixels, so the file and the preview agree. */
export function exportVectorSVG(definition,frame) {
  const paths = generateGeometry(definition), base = viewBox(paths);
  if (frame && frame.w > 0 && frame.h > 0) {
    const box = frameViewBox(base,frame.w,frame.h).map(n => Math.round(n*1000)/1000);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.w}" height="${frame.h}" viewBox="${box.join(' ')}">${geometryMarkup(paths)}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${base[2]}" height="${base[3]}" viewBox="${base.join(' ')}">${geometryMarkup(paths)}</svg>`;
}

function random(seed) {
  return () => {
    seed = (seed+0x6d2b79f5)|0;
    let t = Math.imul(seed^seed>>>15,seed|1);
    t ^= t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

export function applyVectorPatch(definition, patch) {
  const base = validateDefinition(definition);
  record(patch,['seed','parameters','style','locks'],'patch');
  if (Object.hasOwn(patch,'parameters')) record(patch.parameters,Object.keys(base.parameters),'parameter');
  if (Object.hasOwn(patch,'style')) record(patch.style,Object.keys(base.style),'style');
  return validateDefinition({...base,...patch,parameters:{...base.parameters,...patch.parameters},style:{...base.style,...patch.style}});
}

export function createVectorVariation(definition, seed = (definition.seed+1)>>>0) {
  const next = applyVectorPatch(definition,{seed});
  const take = random(seed);
  const choose = spec => spec.options
    ? spec.options[Math.floor(take()*spec.options.length)]
    : Math.min(spec.max,Number((spec.min+spec.step*Math.round((spec.max-spec.min)*take()/spec.step)).toFixed(4)));
  for (const [key,spec] of Object.entries(GENERATORS[next.generator].parameters)) {
    const value = choose(spec);
    if (!next.locks.includes(key)) next.parameters[key] = value;
  }
  for (const [key,spec] of Object.entries(STYLE_CONTROLS)) {
    const value = choose(spec);
    if (!next.locks.includes('style.'+key)) next.style[key] = value;
  }
  return validateDefinition(next);
}
