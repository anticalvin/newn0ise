/* Guide-strand hair (experimental). The format and the solver are plain JS with no dependencies so they run in the browser and in node tests.
   A groom is: roots on the scalp (triangle + barycentric weights), guide curves grown from them, and style parameters. Only guides are simulated;
   follower strands are interpolated between neighbouring guides at render time (a deliberate guide and follower design, not per-strand physics).
   Solver: position-based Verlet, fixed 1/120 s substeps, distance and bend constraints, collision against spheres and capsules (head, neck, shoulders),
   roots pinned to the head, hard reset on teleport or when the body shape changes, NaN guard. Positions are in metres. See docs/CHARACTER_PROGRAMME.md. */

export const QUALITY={low:{guides:12,followers:0,iters:2,segments:6},medium:{guides:20,followers:3,iters:3,segments:8},high:{guides:32,followers:5,iters:4,segments:10}};

/* deterministic random so a seed always gives the same groom */
export const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};

/* roots: [{tri:[i,j,k], bary:[u,v,w]}] over scalp triangles; the root position is rebuilt from the current scalp vertices, so it follows the body shape.
   style: {length m, curl 0..1, clump 0..1, density, stiffness 0..1, damping 0..1, seed, lod} */
export function makeGroom(scalp,style={}){
  const st={length:.28,curl:0,clump:.3,density:1,stiffness:.35,damping:.06,seed:1,lod:'medium',color:'#3b2417',...style},q=QUALITY[st.lod]||QUALITY.medium,r=rng(st.seed);
  const roots=[];const tris=scalp.tris,nt=tris.length/3;
  for(let g=0;g<q.guides;g++){const t=Math.floor(r()*nt);let u=r(),v=r();if(u+v>1){u=1-u;v=1-v;}roots.push({tri:[tris[t*3],tris[t*3+1],tris[t*3+2]],bary:[1-u-v,u,v]});}
  return {version:1,style:st,roots,segments:q.segments,iters:q.iters,followers:q.followers};
}
export function rootPoint(groom,i,verts,out=[0,0,0]){const {tri,bary}=groom.roots[i];for(let c=0;c<3;c++)out[c]=bary[0]*verts[tri[0]*3+c]+bary[1]*verts[tri[1]*3+c]+bary[2]*verts[tri[2]*3+c];return out;}

/* the solver state: P (current), Q (previous) per guide point */
export function makeHairSim(groom,anchor){
  const n=groom.roots.length,m=groom.segments+1,seg=groom.style.length/groom.segments;
  const sim={groom,n,m,seg,P:new Float32Array(n*m*3),Q:new Float32Array(n*m*3),acc:0,resets:0,rootPrev:new Float32Array(n*3),nan:0,version:-1};
  sim.reset=(anch)=>{for(let g=0;g<n;g++){const o=anch.root(g),d=anch.dir(g);for(let k=0;k<m;k++){const i=(g*m+k)*3;for(let c=0;c<3;c++){sim.P[i+c]=sim.Q[i+c]=o[c]+d[c]*seg*k;}}sim.rootPrev.set(anch.rootsFlat());}sim.resets++;settle(sim,anch);};
  sim.reset(anchor);return sim;
}
/* colliders: {spheres:[[x,y,z,r]], capsules:[[ax,ay,az,bx,by,bz,r]]} */
function push(P,i,col,margin){
  for(const s of col.spheres||[]){const dx=P[i]-s[0],dy=P[i+1]-s[1],dz=P[i+2]-s[2],d=Math.hypot(dx,dy,dz),R=s[3]+margin;if(d<R&&d>1e-9){const k=R/d;P[i]=s[0]+dx*k;P[i+1]=s[1]+dy*k;P[i+2]=s[2]+dz*k;}}
  for(const c of col.capsules||[]){const abx=c[3]-c[0],aby=c[4]-c[1],abz=c[5]-c[2],l2=abx*abx+aby*aby+abz*abz||1e-9;let t=((P[i]-c[0])*abx+(P[i+1]-c[1])*aby+(P[i+2]-c[2])*abz)/l2;t=Math.max(0,Math.min(1,t));
    const cx=c[0]+abx*t,cy=c[1]+aby*t,cz=c[2]+abz*t,dx=P[i]-cx,dy=P[i+1]-cy,dz=P[i+2]-cz,d=Math.hypot(dx,dy,dz),R=c[6]+margin;if(d<R&&d>1e-9){const k=R/d;P[i]=cx+dx*k;P[i+1]=cy+dy*k;P[i+2]=cz+dz*k;}}
}
export const SUBSTEP=1/120;
/* after a reset the straight rest strands may start inside the head or shoulders: walk each strand out from the root, restoring segment length and pushing out of colliders */
function settle(sim,anch){const {n,m,seg,P,Q}=sim,col=anch.colliders();
  for(let g=0;g<n;g++)for(let k=1;k<m;k++){const a=(g*m+k-1)*3,b=(g*m+k)*3,dx=P[b]-P[a],dy=P[b+1]-P[a+1],dz=P[b+2]-P[a+2],d=Math.hypot(dx,dy,dz)||1e-9,e=seg/d;P[b]=P[a]+dx*e;P[b+1]=P[a+1]+dy*e;P[b+2]=P[a+2]+dz*e;push(P,b,col,.004);for(let c=0;c<3;c++)Q[b+c]=P[b+c];}
}
/* advance by dt seconds. anchor: {root(g)->[x,y,z], dir(g)->unit rest direction in world, rootsFlat()->Float32Array(n*3), colliders(), version}. */
export function stepHair(sim,anchor,dt,opt={}){
  const {groom,n,m,seg}=sim,st=groom.style,P=sim.P,Q=sim.Q,g=opt.gravity??-9.81,margin=opt.margin??.004,tele=opt.teleport??.35;
  const rf=anchor.rootsFlat();let moved=0;for(let i=0;i<rf.length;i++)moved=Math.max(moved,Math.abs(rf[i]-sim.rootPrev[i]));
  if(moved>tele||(anchor.version!==undefined&&anchor.version!==sim.version)){sim.version=anchor.version;sim.reset(anchor);return sim;}
  sim.acc+=Math.min(dt,.1);const damp=1-st.damping;let steps=0;
  while(sim.acc>=SUBSTEP&&steps<12){sim.acc-=SUBSTEP;steps++;
    const col=anchor.colliders();
    for(let gi=0;gi<n;gi++){const root=anchor.root(gi),dir=anchor.dir(gi);
      for(let k=0;k<m;k++){const i=(gi*m+k)*3;
        if(k===0){for(let c=0;c<3;c++){Q[i+c]=P[i+c];P[i+c]=root[c];}continue;}
        for(let c=0;c<3;c++){const v=(P[i+c]-Q[i+c])*damp;Q[i+c]=P[i+c];P[i+c]+=v+(c===1?g:0)*SUBSTEP*SUBSTEP;}}
      for(let it=0;it<groom.iters;it++){
        for(let k=1;k<m;k++){const a=(gi*m+k-1)*3,b=(gi*m+k)*3,dx=P[b]-P[a],dy=P[b+1]-P[a+1],dz=P[b+2]-P[a+2],d=Math.hypot(dx,dy,dz)||1e-9,e=(d-seg)/d,wa=k===1?0:.5,wb=k===1?1:.5;
          for(const [i,w,s] of [[a,wa,1],[b,wb,-1]]){P[i]+=s*dx*e*w;P[i+1]+=s*dy*e*w;P[i+2]+=s*dz*e*w;}}
        /* bend: pull every point a little toward the straight continuation of the two before it, scaled by stiffness (and the style's curl keeps a bias angle) */
        for(let k=2;k<m;k++){const a=(gi*m+k-2)*3,b=(gi*m+k-1)*3,c2=(gi*m+k)*3;const tx=P[b]*2-P[a],ty=P[b+1]*2-P[a+1],tz=P[b+2]*2-P[a+2],s=st.stiffness*.5*(1-st.curl*.6);
          P[c2]+=(tx-P[c2])*s;P[c2+1]+=(ty-P[c2+1])*s;P[c2+2]+=(tz-P[c2+2])*s;}
        for(let k=1;k<m;k++)push(P,(gi*m+k)*3,col,margin);
      }
      /* follow-the-leader pass: from the root outward every segment is set to its exact rest length, so a fast head can never stretch a strand; collisions then run once more */
      for(let k=1;k<m;k++){const a=(gi*m+k-1)*3,b=(gi*m+k)*3,dx=P[b]-P[a],dy=P[b+1]-P[a+1],dz=P[b+2]-P[a+2],d=Math.hypot(dx,dy,dz)||1e-9,e=seg/d;P[b]=P[a]+dx*e;P[b+1]=P[a+1]+dy*e;P[b+2]=P[a+2]+dz*e;push(P,b,col,margin);}
    }
  }
  for(let i=0;i<P.length;i++)if(!isFinite(P[i])){sim.nan++;sim.reset(anchor);break;}
  sim.rootPrev.set(rf);return sim;
}
/* render strands: the guides plus interpolated followers between each guide and its nearest neighbour (clump pulls followers toward the guide) */
export function renderStrands(sim,out){
  const {n,m,groom}=sim,f=groom.followers,clump=groom.style.clump,rg=rng(groom.style.seed+7);let w=0;const strands=[];
  for(let g=0;g<n;g++)strands.push({a:g,b:g,t:0,jit:[0,0,0]});
  for(let g=0;g<n;g++){const nb=(g+1+Math.floor(rg()*(n-1)))%n;for(let k=0;k<f;k++)strands.push({a:g,b:nb,t:rg()*.5*(1-clump),jit:[(rg()-.5)*.004,(rg()-.5)*.004,(rg()-.5)*.004]});}
  for(const s of strands)for(let k=0;k<m;k++){const i=(s.a*m+k)*3,j=(s.b*m+k)*3;for(let c=0;c<3;c++)out[w++]=sim.P[i+c]+(sim.P[j+c]-sim.P[i+c])*s.t+s.jit[c]*k/m;}
  return {strands:strands.length,points:w/3};
}
