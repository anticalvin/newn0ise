import {installLooks} from '../src/looks.js';
import * as engine from '../src/engine.js';
import {GLSL_LIB} from './glsl-lib.mjs';
import {resetTimeState} from '../src/project.js';

const supported = new Map([
  ['halation','Warm glow around bright highlights'],
  ['promist','Diffuse highlights and soften contrast'],
  ['clarity','Local contrast and midtone definition'],
  ['splittone','Tint shadows and highlights independently'],
  ['beauty','Soften skin while retaining detail'],
  ['highkey','Lift shadows into an airy, bright finish'],
  ['lowkey','Shape a darker image around a pool of light'],
  ['tealorange','Grade shadows and highlights toward teal and orange'],
  ['gradnd','Darken and warm the sky with a soft transition'],
  ['bwpro','Black and white conversion with film grain'],
  ['portra','Warm, soft portrait film rendering'],
  ['develop','Animate a photographic print development look'],
  ['sodium','Warm sodium-vapor night color'],
  ['overcook','Push highlights into an exaggerated HDR look'],
  ['dusthair','Add moving film dust and hair'],
  ['lightleak','Add a soft, colored light leak'],
  ['tiltshift','Blur outside a focus band'],
  ['crosscurve','Cross-process color and contrast']
]);

export const effects = new Map();
installLooks({
  SS:'#define S (uRes.y/600.)\n',
  ST:engine.ST,
  defineModule(definition) {
    // Any single-pass Effects look that needs no history, mask or picture input comes across, with its own controls.
    const usable = typeof definition.frag === 'string' && !definition.needsMask &&
      !/\b(u_prev|uAux|u_tick|u_reset|u_has)\b/.test(definition.frag) &&
      definition.params.every(p => !p.t || ['r','c','b','color'].includes(p.t));
    if (usable) {
      effects.set(definition.id,{...definition,source:'effects',
        description:supported.get(definition.id) ?? definition.description ?? `${definition.family} look from n0ise Effects`});
    }
  }
});

const studioEffects = [
  {
    id:'threshold',family:'Adjust',name:'Threshold',description:'Convert luminance to clean black and white',
    params:[{k:'cut',label:'Threshold',min:0,max:100,def:50,hero:true},{k:'soft',label:'Soft edge',min:0,max:50,def:0}],
    frag:`vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);float l=luma(c.rgb);float t=u_cut/100.;float s=u_soft/100.*.25;float v=s>0.?smoothstep(t-s,t+s,l):step(t,l);return vec4(vec3(v),c.a);}`
  },
  {
    id:'grain',family:'Film',name:'Film Grain',description:'Add fine, deterministic monochrome or color grain',
    params:[{k:'amt',label:'Amount',min:0,max:100,def:18,hero:true},{k:'size',label:'Grain size',min:1,max:100,def:28,hero:true},{k:'color',label:'Color grain',min:0,max:100,def:0}],
    frag:`float studioHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);vec2 p=floor(uv*uRes/(1.+u_size*.12));float n=(studioHash(p+uSeed)-.5)*u_amt/100.*.42;vec3 rgb=c.rgb+n;vec3 colored=vec3(studioHash(p+uSeed+17.3),studioHash(p+uSeed+53.1),studioHash(p+uSeed+91.7))-.5;rgb=mix(rgb,c.rgb+colored*u_amt/100.*.3,u_color/100.);return vec4(clamp(rgb,0.,1.),c.a);}`
  },
  {
    id:'exposure',family:'Adjust',name:'Exposure',description:'Adjust exposure and contrast without flattening the layer',
    params:[{k:'exp',label:'Exposure',min:-100,max:100,def:0,hero:true},{k:'con',label:'Contrast',min:-100,max:100,def:0,hero:true}],
    frag:`vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);vec3 rgb=c.rgb*exp2(u_exp/25.);rgb=(rgb-.5)*(1.+u_con/100.)+.5;return vec4(clamp(rgb,0.,1.),c.a);}`
  },
  {
    id:'levels',family:'Adjust',name:'Levels',description:'Set black point, white point, and midtone gamma',
    params:[{k:'black',label:'Black point',min:0,max:49,def:0,hero:true},{k:'white',label:'White point',min:51,max:100,def:100,hero:true},{k:'gamma',label:'Midtones',min:25,max:400,def:100,hero:true}],
    frag:`vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);float lo=u_black/100.,hi=max(lo+.01,u_white/100.);vec3 rgb=pow(clamp((c.rgb-lo)/(hi-lo),0.,1.),vec3(100./u_gamma));return vec4(rgb,c.a);}`
  },
  {
    id:'hsv',family:'Adjust',name:'Hue and Saturation',description:'Shift hue, color intensity, and lightness',
    params:[{k:'hue',label:'Hue',min:-180,max:180,def:0,hero:true},{k:'sat',label:'Saturation',min:-100,max:100,def:0,hero:true},{k:'light',label:'Lightness',min:-100,max:100,def:0,hero:true}],
    frag:`vec3 studioHue(vec3 c,float a){float s=sin(a),co=cos(a);mat3 m=mat3(.213+.787*co-.213*s,.213-.213*co+.143*s,.213-.213*co-.787*s,.715-.715*co-.715*s,.715+.285*co+.140*s,.715-.715*co+.715*s,.072-.072*co+.928*s,.072-.072*co-.283*s,.072+.928*co+.072*s);return clamp(m*c,0.,1.);}
vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);vec3 rgb=studioHue(c.rgb,u_hue*3.14159265/180.);float l=luma(rgb);rgb=mix(vec3(l),rgb,max(0.,1.+u_sat/100.));rgb+=u_light/100.*.5;return vec4(clamp(rgb,0.,1.),c.a);}`
  },
  {
    id:'vignette',family:'Adjust',name:'Vignette',description:'Gently darken or lift the image edges',
    params:[{k:'amt',label:'Amount',min:-100,max:100,def:28,hero:true},{k:'size',label:'Size',min:0,max:100,def:45,hero:true},{k:'soft',label:'Feather',min:1,max:100,def:65,hero:true}],
    frag:`vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);vec2 p=(uv-.5)*vec2(uRes.x/uRes.y,1.);float d=length(p);float edge=smoothstep(u_size/150.,u_size/150.+u_soft/100.,d);return vec4(clamp(c.rgb*(1.-edge*u_amt/100.),0.,1.),c.a);}`
  },
  {
    id:'blur',family:'Adjust',name:'Gaussian Blur',description:'Soften detail with a fast, adjustable-radius blur',
    params:[{k:'amt',label:'Radius',min:0,max:100,def:18,hero:true}],
    frag:`vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);vec2 px=1./uRes*(.5+u_amt/100.*20.);vec3 sum=c.rgb*2.;float weight=2.;for(int i=0;i<8;i++){float a=float(i)*.785398;vec2 d=vec2(cos(a),sin(a))*px;sum+=texture(uSrc,uv+d).rgb+texture(uSrc,uv-d).rgb;weight+=2.;}return vec4(sum/weight,c.a);}`
  },
  {
    id:'sharpen',family:'Adjust',name:'Sharpen',description:'Increase local edge contrast while keeping the layer editable',
    params:[{k:'amt',label:'Amount',min:0,max:100,def:30,hero:true},{k:'rad',label:'Radius',min:1,max:100,def:24,hero:true}],
    frag:`vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);vec2 px=1./uRes*(.5+u_rad/100.*3.);vec3 blur=c.rgb*2.;for(int i=0;i<8;i++){float a=float(i)*.785398;blur+=texture(uSrc,uv+vec2(cos(a),sin(a))*px).rgb;}blur/=10.;return vec4(clamp(c.rgb+(c.rgb-blur)*u_amt/100.*2.,0.,1.),c.a);}`
  },
  {
    id:'invert',family:'Adjust',name:'Invert',description:'Invert RGB while preserving transparency',
    params:[],frag:`vec4 fx(vec2 uv){vec4 c=texture(uSrc,uv);return vec4(1.-c.rgb,c.a);}`
  }
];
for (const definition of studioEffects) effects.set(definition.id,definition);

const hexColor = /^#[0-9a-f]{6}$/i;
/* Hardware profiles from the Effects page (CRT Lab): each runs the real CRT pipeline on the layer, with a strength control. */
for (const [id,name] of engine.PROFILES) {
  if (id === 'none') continue;
  effects.set('hw:'+id,{id:'hw:'+id,hardware:id,family:'Hardware',name,source:'hardware',
    description:`${name} display, rendered by the n0ise CRT Lab`,
    params:[{k:'mix',label:'Strength',min:0,max:100,def:100,hero:true}]});
}

export function effectValues(definition,values = {}) {
  return Object.fromEntries(definition.params.map(p => {
    const v = values?.[p.k];
    if (p.t === 'color') return [p.k,typeof v === 'string' && hexColor.test(v) ? v : (typeof p.def === 'string' ? p.def : '#000000')];
    if (p.t === 'b') return [p.k,v === undefined ? (p.def ? 1 : 0) : (v ? 1 : 0)];
    if (p.t === 'c') return [p.k,Number.isInteger(v) && v >= 0 && v < p.opts.length ? v : (p.def ?? 0)];
    return [p.k,Number.isFinite(v) ? Math.max(p.min,Math.min(p.max,v)) : p.def];
  }));
}

export function effectService(gl) {
  const programs = new Map();
  function compile(definition) {
    const declarations = definition.params.map(p => p.t === 'color' ? `uniform vec3 u_${p.k};` : `uniform float u_${p.k};`).join('\n');
    const program = engine.mkProg(engine.VS,engine.HEAD+`
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime,uSeed;
`+GLSL_LIB+declarations+'\n'+definition.frag+`
void main() {
  vec4 source=texture(uSrc,vUv);
  o=vec4(fx(vUv).rgb,source.a);
}`);
    for (const shader of gl.getAttachedShaders(program.p)) {
      gl.detachShader(program.p,shader);
      gl.deleteShader(shader);
    }
    return program;
  }

  let hardwareReady = false, hardwareOut = null, mixer = null;
  /* The CRT pipeline keeps frame-to-frame state, so every render starts clean and replays a few frames. That makes a still
     identical wherever it is rendered from, the same approach the project exporter uses. */
  function hardware(definition,params,input,target,context) {
    const G = engine, w = Math.max(160,context.width&~1), h = Math.max(120,context.height&~1);
    if (!hardwareReady) { G.initGL(); G.initLUT(); hardwareReady = true; }
    for (const key of Object.keys(G.T)) { G.freeRT(G.T[key]); delete G.T[key]; }
    Object.assign(G.V,{sizeKey:'',lastBKey:'',pIdx:0,palCache:{key:'',v:null},textKey:''});
    if (G.RB) { G.RB.pbo = null; G.RB.sync = null; G.RB.size = 0; }
    resetTimeState();
    G.applyProfile(definition.hardware,true);
    G.P.seed = context.seed;
    G.TEX.src = input;
    G.SRC.el = null; G.SRC.w = w; G.SRC.h = h; G.SRC.live = false; G.SRC.ver++;
    G.EMB.w = w; G.EMB.h = h;
    G.ST.autoQ = 1; G.ST.lite = false;
    if (!hardwareOut || hardwareOut.w !== w || hardwareOut.h !== h) {
      if (hardwareOut) G.freeRT(hardwareOut);
      hardwareOut = G.mkRT(w,h,{});
    }
    const d = 1/(context.fps || 30);
    for (let i = 3; i >= 0; i--) {
      G.CPU.last = -1e9; G.CPU.ms = 0;
      G.V.frameNo = Math.max(0,context.frame-i);
      G.renderFrame(Math.max(0,context.time-i*d),d,hardwareOut);
    }
    mixer ??= G.mkProg(G.VS,G.HEAD+`uniform sampler2D uA,uB;uniform float uM;
void main(){vec4 a=texture(uA,vUv);o=vec4(mix(a.rgb,texture(uB,vUv).rgb,uM),a.a);}`);
    G.bindRT(target);
    mixer.use();
    G.samp(mixer,'uA',0,input);
    G.samp(mixer,'uB',1,hardwareOut.tex);
    mixer.f('uM',effectValues(definition,params).mix/100);
    G.draw();
    return target.tex;
  }

  return {
    apply(id,params,input,target,context) {
      const definition = effects.get(id);
      if (!definition) throw Error('The requested n0ise effect is unavailable.');
      if (definition.hardware) return hardware(definition,params,input,target,context);
      if (!programs.has(id)) programs.set(id,compile(definition));
      const program = programs.get(id);
      engine.bindRT(target);
      program.use();
      engine.samp(program,'uSrc',0,input);
      program.v2('uRes',context.width,context.height);
      program.f('uTime',context.time);
      program.f('uSeed',context.seed);
      const parameters = definition.params, values = effectValues(definition,params);
      for (const p of parameters) {
        if (p.t === 'color') {
          const h = values[p.k];
          program.v3('u_'+p.k,parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255);
        } else program.f('u_'+p.k,values[p.k]);
      }
      engine.draw();
      return target.tex;
    },
    // Drop any look this GPU cannot compile, so the palette never offers one that fails.
    verify() {
      for (const [id,definition] of [...effects]) {
        if (definition.hardware || programs.has(id)) continue;
        try { programs.set(id,compile(definition)); }
        catch (e) { effects.delete(id); console.warn('Studio: effect unavailable',id,String(e.message).slice(0,160)); }
      }
    },
    dispose() {
      if (hardwareOut) engine.freeRT(hardwareOut);
      for (const program of programs.values()) gl.deleteProgram(program.p);
      programs.clear();
    }
  };
}
