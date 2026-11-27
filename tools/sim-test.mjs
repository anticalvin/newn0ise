// Deterministic node tests for the experimental strand-hair and cloth solvers (no browser, no GPU). Run: node tools/sim-test.mjs
import assert from 'node:assert/strict';
import {makeGroom,makeHairSim,stepHair,rootPoint,renderStrands,QUALITY} from '../src/hair-groom.js';
import {makeCloth,stepCloth,hemStrip,maxStretch} from '../src/cloth-sim.js';
let ok=0;const t=(n,f)=>{try{f();console.log('  ok  ',n);ok++;}catch(e){console.log('  FAIL',n,'→',e.message);process.exitCode=1;}};

/* a head sphere with a scalp patch: triangles on the back-top of the sphere */
function scalp(cx,cy,cz,R){const v=[],tr=[],N=8;for(let i=0;i<=N;i++)for(let j=0;j<=N;j++){const th=.25+i/N*.9,ph=Math.PI*(.75+j/N*.5);v.push(cx+R*Math.sin(th)*Math.sin(ph),cy+R*Math.cos(th),cz+R*Math.sin(th)*Math.cos(ph)*-1);}
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){const a=i*(N+1)+j,b=a+1,c=a+N+1,d=c+1;tr.push(a,b,c,b,d,c);}return {verts:Float32Array.from(v),tris:Uint32Array.from(tr)};}
function headRig(sx,sy,sz,groom,sc,R,version=0){
  const rf=new Float32Array(groom.roots.length*3),dirs=groom.roots.map((_,i)=>{const p=rootPoint(groom,i,sc.verts);const d=[p[0]-sx,p[1]-sy,p[2]-sz],l=Math.hypot(...d);return [d[0]/l*.3,-1,d[2]/l*.3];});
  const nd=dirs.map(d=>{const l=Math.hypot(...d);return d.map(x=>x/l);});
  return {version,root:i=>{const p=rootPoint(groom,i,sc.verts),o=[p[0]+sx,p[1]+sy,p[2]+sz];return o;},dir:i=>nd[i],rootsFlat(){groom.roots.forEach((_,i)=>{const p=this.root(i);rf.set(p,i*3);});return rf;},
    colliders:()=>({spheres:[[sx,sy,sz,R],[sx,sy-.175,sz,.05]],capsules:[[sx-.16,sy-.25,sz,sx+.16,sy-.25,sz,.06]]})};}

t('hair: a ponytail stays finite, keeps its length and stays out of the head while the head moves', ()=>{
  const R=.09,sc=scalp(0,0,0,R),groom=makeGroom(sc,{length:.3,seed:3,lod:'high'}),rig=headRig(0,1.6,0,groom,sc,R),sim=makeHairSim(groom,rig);
  const rest=groom.style.length/groom.segments;let worst=0,inside=0;
  for(let f=0;f<600;f++){const tt=f/60;rig.sx=0;const ox=Math.sin(tt*2)*.12,oz=Math.cos(tt*1.4)*.08;const r=headRig(ox,1.6+Math.sin(tt*3)*.02,oz,groom,sc,R);stepHair(sim,r,1/60);
    for(let g=0;g<sim.n;g++)for(let k=1;k<sim.m;k++){const a=(g*sim.m+k-1)*3,b=(g*sim.m+k)*3;if(f>=30)worst=Math.max(worst,Math.abs(Math.hypot(sim.P[b]-sim.P[a],sim.P[b+1]-sim.P[a+1],sim.P[b+2]-sim.P[a+2])-rest)/rest);
      const dx=sim.P[b]-ox,dy=sim.P[b+1]-(1.6+Math.sin(tt*3)*.02),dz=sim.P[b+2]-oz;if(Math.hypot(dx,dy,dz)<R-.003)inside++;}}
  assert.equal(sim.nan,0);assert.ok(worst<.35,'segment stretch '+worst);assert.equal(inside,0,inside+' points inside the head');});

t('hair: teleporting or changing the body shape resets the strands, and runs are deterministic', ()=>{
  const R=.09,sc=scalp(0,0,0,R),mk=()=>{const gr=makeGroom(sc,{seed:11,lod:'medium'});return {gr,rig:headRig(0,1.6,0,gr,sc,R),};};
  const a=mk(),b=mk();const sa=makeHairSim(a.gr,a.rig),sb=makeHairSim(b.gr,b.rig);for(let f=0;f<120;f++){stepHair(sa,a.rig,1/60);stepHair(sb,b.rig,1/60);}
  assert.deepEqual([...sa.P],[...sb.P],'same seed, different result');
  const r0=sa.resets;stepHair(sa,headRig(3,1.6,0,a.gr,sc,R),1/60);assert.equal(sa.resets,r0+1,'teleport did not reset');
  stepHair(sa,headRig(3,1.6,0,a.gr,sc,R,1),1/60);assert.equal(sa.resets,r0+2,'shape change did not reset');});

t('hair: quality presets change guide and follower counts, followers interpolate between guides', ()=>{
  const R=.09,sc=scalp(0,0,0,R),counts={};for(const lod of Object.keys(QUALITY)){const gr=makeGroom(sc,{lod,seed:5}),rig=headRig(0,1.6,0,gr,sc,R),sim=makeHairSim(gr,rig),out=new Float32Array(4000*3*40),s=renderStrands(sim,out);counts[lod]=s.strands;}
  assert.ok(counts.low<counts.medium&&counts.medium<counts.high,JSON.stringify(counts));});

/* a hem ring around the hips and two thigh capsules */
const ring=(R,y,n=24)=>Array.from({length:n},(_,i)=>[Math.cos(i/n*Math.PI*2)*R,y,Math.sin(i/n*Math.PI*2)*R]);
function skirt(){const hem=hemStrip(ring(.17,1.0),{drop:.2,rings:6,flare:.35}),sim=makeCloth(hem,{});return {hem,sim};}
const caps=(ox,oz)=>({capsules:[[ox-.085,.95,oz,ox-.085,.45,oz,.085],[ox+.085,.95,oz,ox+.085,.45,oz,.085]],spheres:[[ox,1.0,oz,.12]]});
const targetOf=(hem,ox,oz,ang)=>{const t=Float32Array.from(hem.positions);const c=Math.cos(ang),s=Math.sin(ang);for(let i=0;i<t.length/3;i++){const x=t[i*3],z=t[i*3+2];t[i*3]=x*c-z*s+ox;t[i*3+2]=x*s+z*c+oz;}return t;};

t('cloth: a tee-hem skirt strip stays finite, limits stretch, keeps off the legs and respects its time budget', ()=>{
  const {hem,sim}=skirt();let pen=0,clock=0;const now=()=>clock;let worstMs=0;
  for(let f=0;f<420;f++){const tt=f/60,ox=Math.sin(tt*2)*.1,oz=Math.cos(tt*1.5)*.06,ang=Math.sin(tt*1.7)*.4;
    stepCloth(sim,targetOf(hem,ox,oz,ang),caps(ox,oz),1/60,{now:()=>performance.now()});worstMs=Math.max(worstMs,sim.lastMs);
    const col=caps(ox,oz);for(let i=0;i<sim.n;i++){if(hem.pin[i]>=.999)continue;for(const c of col.capsules){const abx=c[3]-c[0],aby=c[4]-c[1],abz=c[5]-c[2],l2=abx*abx+aby*aby+abz*abz;let u=((sim.P[i*3]-c[0])*abx+(sim.P[i*3+1]-c[1])*aby+(sim.P[i*3+2]-c[2])*abz)/l2;u=Math.max(0,Math.min(1,u));
      const d=Math.hypot(sim.P[i*3]-(c[0]+abx*u),sim.P[i*3+1]-(c[1]+aby*u),sim.P[i*3+2]-(c[2]+abz*u));if(d<c[6]-.003)pen++;}}}
  assert.equal(sim.nan,0);assert.equal(pen,0,pen+' points inside the legs');const s=maxStretch(sim);assert.ok(s<.35,'stretch '+s);assert.ok(worstMs<8,'a step took '+worstMs.toFixed(2)+' ms (budget is a soft cap)');console.log('        worst step',worstMs.toFixed(2),'ms, stretch',s.toFixed(3),', points',sim.n,', constraints',sim.E.length+sim.B.length);});

t('cloth: teleport and body-shape changes reset the cloth; no NaN from a violent start', ()=>{
  const {hem,sim}=skirt();stepCloth(sim,targetOf(hem,0,0,0),caps(0,0),1/60,{version:0});const r=sim.resets;
  stepCloth(sim,targetOf(hem,5,0,0),caps(5,0),1/60,{version:0});assert.equal(sim.resets,r+1,'teleport');
  stepCloth(sim,targetOf(hem,5,0,0),caps(5,0),1/60,{version:1});assert.equal(sim.resets,r+2,'shape change');
  for(let f=0;f<200;f++)stepCloth(sim,targetOf(hem,Math.sin(f)*.3,0,f*.5),caps(0,0),1/60,{version:1});assert.equal(sim.nan,0);});

console.log(process.exitCode?'sim-test: FAILED':'sim-test: '+ok+' ok');
