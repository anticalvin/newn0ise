import {installLooks} from '../src/looks.js';
import * as engine from '../src/engine.js';

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
    if (supported.has(definition.id) && definition.params.every(p => !p.t && !p.opts)) {
      effects.set(definition.id,{...definition,description:supported.get(definition.id)});
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

export function effectValues(definition,values = {}) {
  return Object.fromEntries(definition.params.map(p => [
    p.k,Number.isFinite(values?.[p.k]) ? Math.max(p.min,Math.min(p.max,values[p.k])) : p.def
  ]));
}

export function effectService(gl) {
  const programs = new Map();
  function compile(definition) {
    const declarations = definition.params.map(p => `uniform float u_${p.k};`).join('\n');
    const program = engine.mkProg(engine.VS,engine.HEAD+`
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime,uSeed;
#define luma lum
`+declarations+'\n'+definition.frag+`
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

  return {
    apply(id,params,input,target,context) {
      const definition = effects.get(id);
      if (!definition) throw Error('The requested n0ise effect is unavailable.');
      if (!programs.has(id)) programs.set(id,compile(definition));
      const program = programs.get(id);
      engine.bindRT(target);
      program.use();
      engine.samp(program,'uSrc',0,input);
      program.v2('uRes',context.width,context.height);
      program.f('uTime',context.time);
      program.f('uSeed',context.seed);
      for (const [name,value] of Object.entries(effectValues(definition,params))) program.f('u_'+name,value);
      engine.draw();
      return target.tex;
    },
    dispose() {
      for (const program of programs.values()) gl.deleteProgram(program.p);
      programs.clear();
    }
  };
}
