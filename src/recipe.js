/* Recipes: a stack as JSON in five blocks, stored inside the project file (version 1).
   SOURCE   what makes the picture: the live input, or a generator stage
   SELECT   where a stage applies: Apply to, matte, threshold
   TRANSFORM mix, blend, position, size, seed, colour treatment and the stage's own parameters
   MODULATE signals (oscillators, audio bands, beat, motion) driving any numeric parameter
   OUTPUT   frame shape and quality
   Everything is plain data, so the stack UI is the editor and a recipe is also a preset, a share link and a saved project. */
import {makeProject,PROJECT_VERSION} from './project.js';
export const RECIPE_VERSION=1;
const clone=o=>JSON.parse(JSON.stringify(o));
export function toRecipe({name='Recipe',P,layers,MODULES,size=[1280,720],fps=30}){
  const stack=layers.map(l=>({
    id:l.uid,module:l.module,
    select:{mode:l.select,thr:l.thr,mask:l.mask},
    transform:{mix:l.opacity,blend:l.blend,pos:l.pos,size:l.size,seed:l.seed,visible:l.visible,solo:!!l.solo,color:l.color,params:l.module==='crtlab'?null:l.params},
    modulate:l.mods||[]
  }));
  const gen=layers.length&&MODULES[layers[0].module]&&MODULES[layers[0].module].family==='Source';
  const p=makeProject({P,seed:P.seed,size,fps,sources:[gen?{kind:'generator',stage:0}:{kind:'input'}],stack});
  p.name=name;p.recipe=RECIPE_VERSION;p.output={aspect:P.aspect,quality:P.quality,fcap:P.fcap};
  return p;
}
export function checkRecipe(j){
  if(!j||j.n0ise!=='project'||!Array.isArray(j.stack))throw new Error('That isn’t a n0ise recipe or project file.');
  if(j.version>PROJECT_VERSION)throw new Error('This file was saved by a newer version. Update the app to open it.');
  return j;
}
export function fromRecipe(j,{mkLayer,MODULES}){
  checkRecipe(j);const skipped=[];
  const layers=j.stack.filter(b=>{if(!MODULES[b.module]){skipped.push(b.module);return false;}return true;}).map(b=>{
    const l=mkLayer(b.module,b.transform&&b.transform.params?clone(b.transform.params):undefined),t=b.transform||{},s=b.select||{};
    Object.assign(l,{opacity:t.mix??100,blend:t.blend||'normal',pos:t.pos||[0,0],size:t.size??100,seed:t.seed||0,visible:t.visible!==false,solo:!!t.solo,select:s.mode||'all',thr:s.thr??50,mods:clone(b.modulate||[])});
    if(t.color)l.color=clone(t.color);if(s.mask)l.mask=clone(s.mask);return l;});
  return {layers,P:j.engine&&j.engine.P?clone(j.engine.P):null,skipped};
}
