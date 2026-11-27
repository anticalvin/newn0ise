/* Secondary-motion cloth (experimental). Extended position-based dynamics (XPBD) on a small welded simulation mesh: stretch, shear and bend constraints,
   painted pin weights that blend skin-following with free motion, damping, capsule and sphere colliders driven by the skeleton, fixed substeps, a per-frame
   time budget, a hard reset when the body shape or pose teleports, and a NaN guard. Plain JS with no dependencies so it is testable in node.
   The simulation mesh is separate from the render mesh: simulated points are mapped back onto the garment's vertices by the caller (see hemStrip).
   This is not a general garment solver. Tight garments stay plain skinning; this is for hems, skirts and capes. See docs/CHARACTER_PROGRAMME.md. */

export const FIXED=1/90;

/* a strip of cloth hanging from a closed ring of points (the real hem of a garment): rings x ring.length grid, ring 0 pinned. outward pushes lower rings away from the body */
export function hemStrip(ring,{drop=.12,rings=5,flare=.25,down=[0,-1,0],centre=null}={}){
  const n=ring.length,pts=new Float32Array(n*rings*3),pin=new Float32Array(n*rings),c=centre||ring.reduce((a,p)=>[a[0]+p[0]/n,a[1]+p[1]/n,a[2]+p[2]/n],[0,0,0]);
  for(let r=0;r<rings;r++)for(let i=0;i<n;i++){const p=ring[i],ox=p[0]-c[0],oz=p[2]-c[2],ol=Math.hypot(ox,oz)||1,t=r/(rings-1),k=(r*n+i)*3;
    pts[k]=p[0]+ox/ol*flare*t*drop+down[0]*drop*t;pts[k+1]=p[1]+down[1]*drop*t;pts[k+2]=p[2]+oz/ol*flare*t*drop+down[2]*drop*t;pin[r*n+i]=r===0?1:Math.max(0,.35-t*.35);}
  const tri=[];for(let r=0;r<rings-1;r++)for(let i=0;i<n;i++){const a=r*n+i,b=r*n+(i+1)%n,c2=(r+1)*n+i,d=(r+1)*n+(i+1)%n;tri.push(a,b,c2,b,d,c2);}
  return {positions:pts,triangles:Uint32Array.from(tri),pin,rings,columns:n};
}

export function makeCloth(mesh,opt={}){
  const {positions,triangles,pin}=mesh,n=positions.length/3,cfg={stretch:1e-7,shear:5e-7,bend:2e-4,damping:.04,gravity:-9.81,iters:4,margin:.003,budgetMs:2.5,teleport:.4,...opt};
  const edges=new Map(),tris=triangles,bends=[];const key=(a,b)=>a<b?a+'_'+b:b+'_'+a;const opp=new Map();
  for(let t=0;t<tris.length;t+=3){for(let k=0;k<3;k++){const a=tris[t+k],b=tris[t+(k+1)%3],c=tris[t+(k+2)%3],kk=key(a,b);if(!edges.has(kk))edges.set(kk,[a,b]);(opp.get(kk)||opp.set(kk,[]).get(kk)).push(c);}}
  for(const [kk,o] of opp)if(o.length===2)bends.push([o[0],o[1]]);
  const rest=(a,b)=>Math.hypot(positions[a*3]-positions[b*3],positions[a*3+1]-positions[b*3+1],positions[a*3+2]-positions[b*3+2]);
  const E=[...edges.values()].map(([a,b])=>({a,b,l:rest(a,b)})),B=bends.map(([a,b])=>({a,b,l:rest(a,b)}));
  const sim={n,cfg,P:Float32Array.from(positions),Q:Float32Array.from(positions),pin,E,B,acc:0,resets:0,nan:0,version:-1,overBudget:0,lastMs:0,rest:Float32Array.from(positions)};
  sim.invM=new Float32Array(n).fill(1);
  return sim;
}
const solveDist=(P,a,b,l,alpha,wa,wb)=>{const dx=P[a*3]-P[b*3],dy=P[a*3+1]-P[b*3+1],dz=P[a*3+2]-P[b*3+2],d=Math.hypot(dx,dy,dz)||1e-9,w=wa+wb;if(w<=0)return;const C=d-l,dl=-C/(w+alpha),k=dl/d;
  P[a*3]+=dx*k*wa;P[a*3+1]+=dy*k*wa;P[a*3+2]+=dz*k*wa;P[b*3]-=dx*k*wb;P[b*3+1]-=dy*k*wb;P[b*3+2]-=dz*k*wb;};
function collide(P,i,col,margin){
  for(const s of col.spheres||[]){const dx=P[i]-s[0],dy=P[i+1]-s[1],dz=P[i+2]-s[2],d=Math.hypot(dx,dy,dz),R=s[3]+margin;if(d<R&&d>1e-9){const k=R/d;P[i]=s[0]+dx*k;P[i+1]=s[1]+dy*k;P[i+2]=s[2]+dz*k;}}
  for(const c of col.capsules||[]){const abx=c[3]-c[0],aby=c[4]-c[1],abz=c[5]-c[2],l2=abx*abx+aby*aby+abz*abz||1e-9;let t=((P[i]-c[0])*abx+(P[i+1]-c[1])*aby+(P[i+2]-c[2])*abz)/l2;t=Math.max(0,Math.min(1,t));
    const cx=c[0]+abx*t,cy=c[1]+aby*t,cz=c[2]+abz*t,dx=P[i]-cx,dy=P[i+1]-cy,dz=P[i+2]-cz,d=Math.hypot(dx,dy,dz),R=c[6]+margin;if(d<R&&d>1e-9){const k=R/d;P[i]=cx+dx*k;P[i+1]=cy+dy*k;P[i+2]=cz+dz*k;}}
}
/* target: Float32Array of where the skin would put each simulated point right now (the pinned follow target); col: colliders; now: () => ms clock */
export function stepCloth(sim,target,col,dt,{version,now=()=>0,gravity}={}){
  const {n,cfg,P,Q,pin,E,B}=sim;let moved=0;
  for(let i=0;i<n;i++)if(pin[i]>=.999)for(let c=0;c<3;c++)moved=Math.max(moved,Math.abs(target[i*3+c]-P[i*3+c]));
  if(moved>cfg.teleport||(version!==undefined&&version!==sim.version)){sim.version=version;P.set(target);Q.set(target);sim.resets++;return sim;}
  const t0=now();sim.acc+=Math.min(dt,.1);let steps=0;const g=gravity??cfg.gravity,h=FIXED,a1=cfg.stretch/(h*h),a2=cfg.shear/(h*h),a3=cfg.bend/(h*h),damp=1-cfg.damping;
  while(sim.acc>=h&&steps<8){sim.acc-=h;steps++;
    for(let i=0;i<n;i++){const o=i*3;if(pin[i]>=.999){for(let c=0;c<3;c++){Q[o+c]=P[o+c];P[o+c]=target[o+c];}continue;}
      for(let c=0;c<3;c++){const v=(P[o+c]-Q[o+c])*damp;Q[o+c]=P[o+c];P[o+c]+=v+(c===1?g:0)*h*h;}
      /* partial pins follow the skin: blend toward the target by the painted weight */
      const w=pin[i];if(w>0)for(let c=0;c<3;c++)P[o+c]+=(target[o+c]-P[o+c])*w*.5;}
    for(let it=0;it<cfg.iters;it++){
      for(const e of E)solveDist(P,e.a,e.b,e.l,a1,pin[e.a]>=.999?0:1,pin[e.b]>=.999?0:1);
      for(const e of B)solveDist(P,e.a,e.b,e.l,a3,pin[e.a]>=.999?0:1,pin[e.b]>=.999?0:1);
      for(let i=0;i<n;i++)if(pin[i]<.999)collide(P,i*3,col,cfg.margin);
    }
    if(now()-t0>cfg.budgetMs){sim.overBudget++;break;}
  }
  sim.lastMs=now()-t0;for(let i=0;i<P.length;i++)if(!isFinite(P[i])){sim.nan++;P.set(target);Q.set(target);sim.resets++;break;}
  return sim;
}
/* worst stretch of any edge relative to its rest length, for the budget and quality gates */
export function maxStretch(sim){let m=0;for(const e of sim.E){const d=Math.hypot(sim.P[e.a*3]-sim.P[e.b*3],sim.P[e.a*3+1]-sim.P[e.b*3+1],sim.P[e.a*3+2]-sim.P[e.b*3+2]);m=Math.max(m,Math.abs(d-e.l)/e.l);}return m;}
