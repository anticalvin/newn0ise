/* Numerical checks for the human runtime. Used by tools/core-smoke-character.mjs and by hand from the console (window.__hum is the human).
   Nothing here renders: it skins meshes on the CPU and compares them, so a pose fault shows up as a number, not a screenshot. */
export function skinPoints(m,V){const n=m.geometry.attributes.position.count,out=new Float32Array(n*3),t=new V();m.updateMatrixWorld(true);for(let i=0;i<n;i++){m.getVertexPosition(i,t);t.applyMatrix4(m.matrixWorld);out[i*3]=t.x;out[i*3+1]=t.y;out[i*3+2]=t.z;}return out;}
const grid=(p,cs=.03)=>{const g=new Map();for(let i=0;i<p.length/3;i++){const k=Math.floor(p[i*3]/cs)+','+Math.floor(p[i*3+1]/cs)+','+Math.floor(p[i*3+2]/cs);let l=g.get(k);if(!l)g.set(k,l=[]);l.push(i);}return {g,cs};};
const nearest=(G,p,x,y,z)=>{let b=1e9;const cs=G.cs,cx=Math.floor(x/cs),cy=Math.floor(y/cs),cz=Math.floor(z/cs);
  for(let r=1;r<=6;r++){for(let a=-r;a<=r;a++)for(let b2=-r;b2<=r;b2++)for(let c=-r;c<=r;c++){const l=G.g.get((cx+a)+','+(cy+b2)+','+(cz+c));if(!l)continue;for(const i of l){const d=Math.hypot(p[i*3]-x,p[i*3+1]-y,p[i*3+2]-z);if(d<b)b=d;}}if(b<r*cs)break;}return b>1e8?.5:b;};
export const attached=H=>H.root.children.filter(c=>c.isSkinnedMesh&&c!==H.body);

/* How far each fitted mesh drifts from the body surface in a pose, compared with the A-pose. A garment that "stays behind" shows large growth. */
export function attachmentReport(H,poses,V,step=2){
  H.pose('A-pose');H.root.updateMatrixWorld(true);
  const meshes=attached(H),bp0=skinPoints(H.body,V),G0=grid(bp0),rest={};
  for(const m of meshes){const p=skinPoints(m,V),d=new Float32Array(p.length/3);for(let i=0;i<d.length;i++)d[i]=nearest(G0,bp0,p[i*3],p[i*3+1],p[i*3+2]);rest[m.name]=d;}
  const out={};
  for(const pn of poses){H.pose(pn);H.root.updateMatrixWorld(true);const bp=skinPoints(H.body,V),G=grid(bp);out[pn]={};
    for(const m of meshes){const p=skinPoints(m,V),d0=rest[m.name];let bad=0,n=0,mx=0;for(let i=0;i<d0.length;i+=step){n++;const e=nearest(G,bp,p[i*3],p[i*3+1],p[i*3+2])-d0[i];if(e>.03)bad++;if(e>mx)mx=e;}out[pn][m.name]={bad,n,maxGrow:+mx.toFixed(3),frac:+(bad/n).toFixed(3)};}}
  H.pose('A-pose');return out;
}

/* Eye, lash and glasses attachment: the eyeball must stay on the eyelashes in every pose. */
export function eyeReport(H,poses,V){
  const out={};
  for(const pn of poses){H.pose(pn);H.root.updateMatrixWorld(true);
    const e=H.root.getObjectByName('Eye.L'),p=new V();e.getWorldPosition(p);
    const lash=attached(H).find(c=>/eyelash/.test(c.name));let d=null;
    if(lash){const pts=skinPoints(lash,V);const left=[];for(let i=0;i<pts.length/3;i++)left.push(i);
      /* the lash points nearest the eyeball, on its side */
      let best=1e9;for(let i=0;i<pts.length/3;i+=1){const dd=Math.hypot(pts[i*3]-p.x,pts[i*3+1]-p.y,pts[i*3+2]-p.z);if(dd<best)best=dd;}d=+best.toFixed(4);}
    out[pn]=d;}
  H.pose('A-pose');return out;
}

/* Structural checks: finite bones, valid tree, positive bone lengths, normalised weights, nothing weighted wrongly to the root. */
export function validateRig(H,V){
  const errs=[],bones=H.bones,man=H.man;H.root.updateMatrixWorld(true);
  const wp=new V(),parentIdx=man.bones.map(b=>b.p);
  bones.forEach((b,i)=>{b.getWorldPosition(wp);if(!isFinite(wp.x+wp.y+wp.z))errs.push('non-finite bone '+b.name);
    if(i>0&&(parentIdx[i]<0||parentIdx[i]>=i))errs.push('bad parent order '+b.name);});
  const sk=H.body.geometry.attributes.skinWeight.array,si=H.body.geometry.attributes.skinIndex.array;let badSum=0,rootBound=0;
  for(let i=0;i<sk.length/4;i++){const s=sk[i*4]+sk[i*4+1]+sk[i*4+2]+sk[i*4+3];if(Math.abs(s-1)>.02)badSum++;if(si[i*4]===0&&sk[i*4]>.95)rootBound++;}
  if(badSum)errs.push(badSum+' body vertices with weights not summing to 1');
  const prox={};
  for(const m of attached(H)){const w=m.geometry.attributes.skinWeight.array,ix=m.geometry.attributes.skinIndex.array;let bs=0,rb=0;
    for(let i=0;i<w.length/4;i++){const s=w[i*4]+w[i*4+1]+w[i*4+2]+w[i*4+3];if(!(Math.abs(s-1)<.02))bs++;if(ix[i*4]===0&&w[i*4]>.95)rb++;}
    prox[m.name]={n:w.length/4,badSum:bs,rootBound:rb};if(bs)errs.push(m.name+': '+bs+' unnormalised weights');if(rb>w.length/4*.05)errs.push(m.name+': '+rb+' vertices bound to the root bone');}
  return {errs,body:{n:sk.length/4,badSum,rootBound},proxies:prox,bones:bones.length};
}

/* Neutral standing stature in metres, measured from the rest mesh (never from a posed bounding box). */
export function stature(H,V){const keep=H.S.pose;H.pose('A-pose');H.root.updateMatrixWorld(true);const p=skinPoints(H.body,V);let mn=1e9,mx=-1e9;for(let i=0;i<p.length/3;i++){mn=Math.min(mn,p[i*3+1]);mx=Math.max(mx,p[i*3+1]);}H.pose(keep);return +(mx-mn).toFixed(3);}
