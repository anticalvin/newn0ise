/* The 3D page's view of the shared engine. Same code as index.html's CRT Lab; this only renders into an offscreen target
   from a texture the page hands in, in the page's own GL context. */
import * as G from './engine.js';
const {P,E,CT,CTL,TABS,PALS,PROFILES,applyProfile,ST,SRC,hexRGB,lum255,clamp,V,T,PR,RB,EMB,TEX}=G;
export function createN0(){
  let out=null,fn=0;const EXT={w:640,h:480};
  const dummy={width:0,height:0,style:{}};
  return {
    P,E,CT,CTL,TABS,PALS,PROFILES,applyProfile,ST,SRC,hexRGB,lum255,clamp,
    attach(gl){G.attachGL(dummy,null,gl);G.initGL();G.initLUT();},
    setSize(w,h){EXT.w=Math.max(160,w&~1);EXT.h=Math.max(120,h&~1);SRC.w=EXT.w;SRC.h=EXT.h;EMB.w=EXT.w;EMB.h=EXT.h;},
    render(srcTex,t,dt,live,frame){
      TEX.src=srcTex;SRC.live=!!live;V.frameNo=frame!=null?frame:fn++;
      if(!out||out.w!==EXT.w||out.h!==EXT.h){if(out)G.freeRT(out);out=G.mkRT(EXT.w,EXT.h,{});}
      G.renderFrame(t,dt,out);return out.tex;
    },
    resetGL(){Object.keys(T).forEach(k=>{G.freeRT(T[k]);delete T[k];});if(out)G.freeRT(out);out=null;V.sizeKey='';V.lastBKey='';V.palCache={key:'',v:null};V.textKey='';V.pIdx=0;RB.pbo=null;RB.sync=null;RB.size=0;},
    blit(srcTex){const gl=G.gl;gl.bindVertexArray(G.vaoEmpty);G.bindRT(null);PR.orig.use();G.samp(PR.orig,'uSrc',0,srcTex);PR.orig.f('uSrcAsp',1);PR.orig.f('uScrAsp',1);G.draw();gl.bindVertexArray(null);gl.useProgram(null);},
    GLH:{mkProg:f=>G.mkProg(G.VS,f),HEAD:G.HEAD,bindRT:G.bindRT,samp:G.samp,draw:G.draw,get vao(){return G.vaoEmpty;},get T(){return T;}},
    get HDR(){return V.HDR;}
  };
}
