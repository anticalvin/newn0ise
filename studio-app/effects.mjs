import {installLooks} from '../src/looks.js';
import * as engine from '../src/engine.js';

const supported = new Map([
  ['halation','Warm glow around bright highlights'],
  ['promist','Diffuse highlights and soften contrast'],
  ['clarity','Local contrast and midtone definition'],
  ['splittone','Tint shadows and highlights independently']
]);

export const effects = new Map();
installLooks({
  SS:'#define S (uRes.y/600.)\n',
  ST:engine.ST,
  defineModule(definition) {
    if (supported.has(definition.id)) {
      effects.set(definition.id,{...definition,description:supported.get(definition.id)});
    }
  }
});

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
