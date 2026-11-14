/* A light "rig" for the static human model: no skeleton, so legs and arms are swung by a vertex shader that picks body regions by position
   (the model is in an A-pose, up is Z). set(phase, amount) drives it: phase advances with distance travelled, amount is 0 standing, 1 running. */
export function rigHuman(THREE,root){
  const U={uPh:{value:0},uAmt:{value:0}},mats=[];
  root.traverse(n=>{
    if(!n.isMesh||!n.material)return;
    (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{
      if(m.userData.rigged)return;m.userData.rigged=true;
      m.onBeforeCompile=sh=>{
        sh.uniforms.uPh=U.uPh;sh.uniforms.uAmt=U.uAmt;
        sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uPh,uAmt;\nvec3 rigPose(vec3 p){\n  float side=p.x>=0.?1.:-1.,ph=uPh+(side>0.?0.:3.14159);\n  float lw=smoothstep(66.,56.,p.z)*smoothstep(1.5,5.,abs(p.x))*step(abs(p.x),30.);\n  float a=sin(ph)*.62*uAmt;\n  vec2 d=vec2(p.y,p.z-62.);vec2 r=vec2(d.x*cos(a)-d.y*sin(a),d.x*sin(a)+d.y*cos(a));\n  vec3 q=mix(p,vec3(p.x,r.x,r.y+62.),lw);\n  // knee: the back leg folds a little as it lifts\n  float kn=max(0.,-cos(ph))*.5*uAmt*lw*smoothstep(46.,20.,p.z)*0.;\n  float aw=smoothstep(22.,27.,abs(p.x))*smoothstep(52.,68.,p.z);\n  float b=-sin(ph)*.55*uAmt;\n  vec2 e=vec2(q.y,q.z-128.);vec2 s=vec2(e.x*cos(b)-e.y*sin(b),e.x*sin(b)+e.y*cos(b));\n  return mix(q,vec3(q.x,s.x,s.y+128.),aw);\n}');
        sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','vec3 transformed=rigPose(position);');
      };
      m.needsUpdate=true;mats.push(m);
    });
  });
  return {set(ph,amt){U.uPh.value=ph;U.uAmt.value=amt;}};
}
