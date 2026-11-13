/* Project file v1 and a deterministic renderer.
   A project is plain JSON. Nothing in the engine is random (all noise is hashed from seed, time and pixel), so
   render(project, t, size) gives the same pixels for the live preview, a still export and every frame of a video export.
   `warm` replays a few earlier frames so feedback effects (afterglow, burn-in, ghosts) are the same wherever a frame is rendered from. */
import * as G from './engine.js';
export const PROJECT_VERSION=1;
export function makeProject({P,seed=P&&P.seed||7,size=[1280,720],time=0,fps=30,sources=[],stack=[],masks=[]}={}){
  return {n0ise:'project',version:PROJECT_VERSION,seed,size,time,fps,sources,stack,masks,
    engine:{P:JSON.parse(JSON.stringify(P||G.P))}};
}
export function checkProject(j){
  if(!j||j.n0ise!=='project')throw new Error('Not a n0ise project file.');
  if(j.version>PROJECT_VERSION)throw new Error('This project was saved by a newer version. Update the app to open it.');
  return j;
}
export function resetTimeState(){Object.assign(G.ST,{pwr:1,pwrAnim:1,pwrFrom:1,pwrT0:-9,degT0:-99,chanT0:-99,rollAcc:0,lastDeg:0,eT:undefined,rngSeed:undefined,hold:false});}
/* source: an ImageData-like canvas/video/image element the caller resolves from project.sources[0] */
export function renderProject(project,t,size,{source,warm=6,dt}={}){
  const {gl}=G;const [w,h]=size||project.size,d=dt||1/(project.fps||30);
  const keys=Object.keys(G.P);Object.assign(G.P,project.engine.P);G.P.seed=project.seed;
  Object.keys(G.T).forEach(k=>{G.freeRT(G.T[k]);delete G.T[k];});G.V.sizeKey='';G.V.lastBKey='';G.V.pIdx=0;G.V.palCache={key:'',v:null};
  if(G.RB){G.RB.pbo=null;G.RB.sync=null;G.RB.size=0;}
  resetTimeState();
  G.EMB.w=w;G.EMB.h=h;G.setSource(source,"project",false);
  const out=G.mkRT(Math.max(160,w&~1),Math.max(120,h&~1),{});
  G.ST.autoQ=1;G.ST.lite=false;
  for(let i=warm;i>=0;i--){G.CPU.last=-1e9;G.CPU.ms=0; // error diffusion is throttled by wall-clock time live; exports must never skip it
    G.V.frameNo=Math.max(0,Math.round(t/d))-i;G.renderFrame(Math.max(0,t-i*d),d,out);}
  const px=new Uint8Array(out.w*out.h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,out.fbo);gl.readPixels(0,0,out.w,out.h,gl.RGBA,gl.UNSIGNED_BYTE,px);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const o={w:out.w,h:out.h,px};G.freeRT(out);return o;
}
