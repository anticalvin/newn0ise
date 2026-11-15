/* A light "rig" for the static human model: no skeleton, so the body is posed in the vertex shader. The model is in an A-pose, up is Z,
   and it faces -Y (the node transform turns that into +Z in the world). Regions are picked by position, measured from the mesh:
   legs are x within 18 and z under 56 (they join the hips above that), arms hang from the shoulders at (+-26, 122) down to the hands
   at (+-57, 80) with the elbow near (+-45, 100). set(phase, amount, play): phase advances with distance travelled, amount is 0
   standing and 1 running, play is 1 while the player is walking about (arms come in from the A-pose, body leans into the run). */
const GLSL=`
uniform float uPh,uAmt,uPlay;
vec2 rot2(vec2 d,float a){float c=cos(a),s=sin(a);return vec2(d.x*c-d.y*s,d.x*s+d.y*c);}
vec3 rigPose(vec3 p){
  float side=p.x>=0.?1.:-1.;
  float ph=uPh+(side>0.?0.:3.14159);
  float sw=sin(ph);
  vec3 q=p;
  /* legs: shin folds at the knee while the foot trails, then the whole leg swings from the hip */
  float lw=smoothstep(72.,58.,p.z)*(1.-smoothstep(54.,60.,p.z)*(1.-smoothstep(1.5,5.,abs(p.x))))*step(abs(p.x),30.);
  float ks=lw*smoothstep(48.,26.,p.z);
  float kf=smoothstep(-.1,1.,sw)*.8*uAmt;
  vec2 k=rot2(vec2(q.y-2.,q.z-37.),kf*ks);q.y=k.x+2.;q.z=k.y+37.;
  vec2 h=rot2(vec2(q.y-2.,q.z-64.),sw*.58*uAmt*lw);q.y=h.x+2.;q.z=h.y+64.;
  /* arms: weight grows with distance from the torso, fades toward the neck */
  float ax=abs(p.x);
  float aw=smoothstep(19.,30.,ax)*smoothstep(140.,126.,p.z)*smoothstep(58.,74.,p.z);
  vec2 g=vec2(ax-26.,p.z-122.);
  float al=dot(g,vec2(.57,-.82));
  float fe=smoothstep(32.,44.,al)*aw;
  float bend=(.35+.3*(.5+.5*sin(ph+1.2)))*uAmt+.08*uPlay;
  float ex=q.y,ez=q.z;
  vec2 e=rot2(vec2(ex-3.,ez-100.),-bend*fe);q.y=e.x+3.;q.z=e.y+100.;
  float c=(.22*uPlay+.3*uAmt)*aw;
  float cx=cos(c),sx=sin(c);
  float gx=(ax-26.)*cx+(q.z-122.)*sx,gz=-(ax-26.)*sx+(q.z-122.)*cx;
  q.x=side*(gx+26.);q.z=gz+122.;
  vec2 s=rot2(vec2(q.y-3.,q.z-124.),-sw*.5*uAmt*aw);q.y=s.x+3.;q.z=s.y+124.;
  /* the body leans into a run */
  float lean=smoothstep(58.,82.,p.z)*.14*uAmt;
  vec2 l=rot2(vec2(q.y-2.,q.z-64.),lean);q.y=l.x+2.;q.z=l.y+64.;
  return q;
}`;
export function rigHuman(THREE,root){
  const U={uPh:{value:0},uAmt:{value:0},uPlay:{value:0}},mats=[];
  root.traverse(n=>{
    if(!n.isMesh||!n.material)return;
    (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{
      if(m.userData.rigged)return;m.userData.rigged=true;
      m.onBeforeCompile=sh=>{
        sh.uniforms.uPh=U.uPh;sh.uniforms.uAmt=U.uAmt;sh.uniforms.uPlay=U.uPlay;
        sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+GLSL);
        sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','vec3 transformed=rigPose(position);');
      };
      m.needsUpdate=true;mats.push(m);
    });
  });
  return {set(ph,amt,play){U.uPh.value=ph;U.uAmt.value=amt;U.uPlay.value=play==null?(amt>0?1:U.uPlay.value):play;}};
}
