/* Human runtime: a properly modelled, rigged person built from the MakeHuman core assets (CC0; see THIRD_PARTY.md and docs/CHARACTER_AUDIT.md).
   The data pack (tools/pack-human.mjs) holds the base mesh, 163-bone skeleton, skin weights and ~560 morph targets as sparse deltas.
   This file is our own code: it blends targets, rebuilds the skeleton to follow the new body, skins the mesh, and derives garments and hair
   from the body so nothing intersects. Shape is baked into the geometry; the face expressions stay real glTF morph targets. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const DEFAULT={base:'male',gender:1,stature:171,statureUser:false,age:.5,muscle:.5,weight:.5,height:.5,prop:.5,race:{african:1/3,asian:1/3,caucasian:1/3},detail:{},expr:{},skin:'#c98f6a',skinTex:'auto',tone:1,eye:'#4a3020',
  hair:{style:'short01',color:'#3b2417'},brows:{style:'eyebrow001',color:'#3b2417'},lashes:true,suit:{style:'none',color:'#ffffff'},top:{style:'tee',color:'#c2410c'},bottom:{style:'trousers',color:'#334155'},
  shoes:{style:'none',color:'#f2efe8'},mat:{},decal:null,head:{style:'none',color:'#1a1a1a'},glasses:{style:'none',color:'#111111'},neck:{style:'none',color:'#c2410c'},pose:'A-pose',seed:1};
/* procedural options (cut from the body) plus the packed CC0 library (see assets/human/library.json) */
export const STYLE={top:['none','tank','tee','long'],bottom:['none','shorts','trousers'],glasses:['none','sunglasses','round','visor']};
export const STATURE={male:171,female:159,presets:{male:183,female:165}};
const ageW=a=>{const w={baby:0,child:0,young:0,old:0};if(a<.1875){w.baby=1-a/.1875;w.child=a/.1875;}else if(a<.5){w.child=1-(a-.1875)/.3125;w.young=(a-.1875)/.3125;}else{w.young=1-(a-.5)/.5;w.old=(a-.5)/.5;}return w;};
const triW=v=>{const mn=v<.5?1-2*v:0,mx=v>.5?2*v-1:0;return {min:mn,average:1-mn-mx,max:mx};};
export const ageFromYears=y=>y<11?Math.max(0,(y-1)/10*.1875):y<25?.1875+(y-11)/14*.3125:.5+Math.min(1,(y-25)/65)*.5;
export const ageYears=a=>a<.1875?1+a/.1875*10:a<.5?11+(a-.1875)/.3125*14:25+(a-.5)/.5*65;

/* pose presets: bone name -> [x,y,z] radians. The rig rests in an A pose with identity bone axes, so a rotation about Z lifts an arm sideways and about X swings a limb forward. */
const R=(o)=>o;
const mir=(o)=>{const r={};for(const [k,v] of Object.entries(o)){r[k]=v;if(/\.L$/.test(k)){const e=o[k.replace(/\.L$/,'.R')];if(!e)r[k.replace(/\.L$/,'.R')]=[v[0],-v[1],-v[2]];}}return r;};
export const POSES={
  'A-pose':{},
  'Relaxed':mir({'upperarm01.L':[.05,0,-.35],'lowerarm01.L':[-.25,0,0],'spine02':[0,.04,0]}),
  'T-pose':mir({'upperarm01.L':[0,0,.9],'lowerarm01.L':[0,0,0]}),
  'Wave':{'upperarm01.L':[.0,0,-.3],'lowerarm01.L':[-.2,0,0],'upperarm01.R':[-.2,0,-1.9],'lowerarm01.R':[-.9,0,0],'wrist.R':[0,0,.3]},
  'Walk':{'upperleg01.L':[-.5,0,0],'upperleg01.R':[.45,0,0],'lowerleg01.L':[.1,0,0],'lowerleg01.R':[.7,0,0],'upperarm01.L':[.5,0,-.35],'upperarm01.R':[-.5,0,.35],'lowerarm01.L':[-.4,0,0],'lowerarm01.R':[-.15,0,0],'spine02':[.04,.1,0]},
  'Run':{'upperleg01.L':[-1.0,0,0],'upperleg01.R':[.7,0,0],'lowerleg01.L':[.35,0,0],'lowerleg01.R':[1.6,0,0],'upperarm01.L':[.9,0,-.3],'upperarm01.R':[-.9,0,.3],'lowerarm01.L':[-1.4,0,0],'lowerarm01.R':[-1.2,0,0],'spine03':[.2,.15,0],'spine05':[0,-.1,0]},
  'Hero':mir({'upperarm01.L':[.1,0,.2],'lowerarm01.L':[-.3,0,0],'upperleg01.L':[-.05,0,-.3],'spine02':[-.08,0,0],'neck01':[-.08,0,0]}),
  'Sit':{'upperleg01.L':[-1.55,0,-.08],'upperleg01.R':[-1.55,0,.08],'lowerleg01.L':[1.5,0,0],'lowerleg01.R':[1.5,0,0],'upperarm01.L':[-.5,0,-.3],'upperarm01.R':[-.5,0,.3],'lowerarm01.L':[-1.1,0,0],'lowerarm01.R':[-1.1,0,0],'spine05':[-.15,0,0]}
};
Object.assign(POSES,{
  'Power':mir({'upperleg01.L':[0,0,.3],'lowerleg01.L':[0,0,0],'upperarm01.L':[.1,0,-.05],'lowerarm01.L':[-.7,0,0],'spine03':[-.06,0,0],'neck01':[.05,0,0]}),
  'Cheer':mir({'upperarm01.L':[0,0,2.2],'lowerarm01.L':[0,0,0],'upperleg01.L':[0,0,-.12],'spine03':[-.08,0,0]}),
  'Flex':mir({'upperarm01.L':[0,0,.95],'lowerarm01.L':[0,0,2.4],'upperleg01.L':[0,0,-.18],'spine03':[-.05,0,0]}),
  'Catwalk':{'upperleg01.L':[-.45,0,.12],'upperleg01.R':[.35,0,-.12],'lowerleg01.R':[.35,0,0],'upperarm01.L':[.35,0,-.25],'upperarm01.R':[-.3,0,.3],'lowerarm01.L':[-.3,0,0],'lowerarm01.R':[-.3,0,0],'root':[0,.12,0],'spine03':[0,-.14,0],'neck01':[0,.06,0]},
  'Hips':mir({'upperarm01.L':[0,0,.12],'lowerarm01.L':[.25,0,-1.5],'upperleg01.L':[0,0,.1],'spine03':[-.05,0,0],'neck01':[-.05,0,0]}),
  'Sassy':{'upperarm01.L':[0,0,.12],'lowerarm01.L':[.25,0,-1.5],'upperarm01.R':[-.15,0,-1.0],'lowerarm01.R':[-.5,0,0],'upperleg01.L':[0,0,.12],'upperleg01.R':[-.25,0,0],'lowerleg01.R':[.3,0,0],'root':[0,0,.1],'spine03':[0,0,-.12],'neck01':[0,0,.1]},
  'Fighter':mir({'upperarm01.L':[0,-1.2,-.15],'lowerarm01.L':[0,-1.5,0],'upperleg01.L':[-.5,0,.15],'lowerleg01.L':[.5,0,0],'spine03':[.12,.3,0]}),
  'Dance':{'upperarm01.L':[0,0,1.6],'lowerarm01.L':[-.4,0,.4],'upperarm01.R':[-.3,0,-.5],'lowerarm01.R':[-.9,0,0],'upperleg01.L':[-.1,0,-.3],'upperleg01.R':[.1,0,.12],'lowerleg01.R':[.5,0,0],'root':[0,0,.1],'spine03':[0,0,-.18],'neck01':[0,0,.12]},
  'Pockets':mir({'upperarm01.L':[.0,0,-.16],'lowerarm01.L':[-.25,0,0],'spine03':[.05,0,0],'neck01':[.08,0,0],'upperleg01.R':[-.12,0,.02]}),
  'Lean':{'root':[0,0,.1],'spine03':[0,0,-.14],'upperleg01.L':[0,0,-.1],'upperleg01.R':[-.5,0,.1],'lowerleg01.R':[.6,0,0],'upperarm01.L':[0,0,-.25],'upperarm01.R':[-.5,0,-.2],'lowerarm01.R':[-1.4,0,0],'neck01':[0,0,.08]}
});
export const EXPRESSIONS={Neutral:{},Smile:{'mouth-corner-puller':1,'mouth-elevation':.4},Frown:{'mouth-depression':.8,'eyebrows-left-down':.7,'eyebrows-right-down':.7},Surprise:{'eyebrows-left-up':1,'eyebrows-right-up':1,'mouth-open':.8,'eye-left-opened-up':.8,'eye-right-opened-up':.8},Blink:{'eye-left-closure':1,'eye-right-closure':1},Smirk:{'mouth-corner-puller':.0,'mouth-elevation':.6,'eyebrows-left-up':.7},Worried:{'eyebrows-left-inner-up':1,'eyebrows-right-inner-up':1,'mouth-depression':.4},Kiss:{'mouth-pursing':1}};

export async function createHuman(c){
  const {THREE,base='assets/human/'}=c;
  const man=await (await fetch(base+'human.json')).json();
  const bin=await (await fetch(base+'human.bin')).arrayBuffer();
  const baseP=new Float32Array(bin,man.base,man.nv*3),vmap=new Uint16Array(bin,man.vmap,man.n),uv=new Float32Array(bin,man.uv,man.n*2),idx=new Uint16Array(bin,man.idx,man.nIdx),skinI=new Uint8Array(bin,man.skinI,man.n*4),skinW=new Uint8Array(bin,man.skinW,man.n*4);
  const lib=await (await fetch(base+'library.json')).json();
  const S=structuredClone(DEFAULT),SS=S;
  const cache=new Map(),inflight=new Map();
  const tfile=n=>base+'t/'+n.replace(/\//g,'~')+'.bin';
  async function load(n){
    if(cache.has(n))return cache.get(n);if(!man.targets[n])return null;
    if(!inflight.has(n))inflight.set(n,fetch(tfile(n)).then(r=>r.arrayBuffer()).then(b=>{const k=man.targets[n].k,k2=k+(k%2);const t={k,ia:new Uint16Array(b,0,k),da:new Int16Array(b,k2*2,k*3)};cache.set(n,t);return t;}));
    return inflight.get(n);
  }
  /* ---- which targets are active, and how strongly, for the current sliders ---- */
  function weights(S=SS){
    const W=new Map(),add=(n,w)=>{if(w>.002&&man.targets[n])W.set(n,(W.get(n)||0)+w);};
    const g={female:1-S.gender,male:S.gender},a=ageW(S.age),m=triW(S.muscle),w=triW(S.weight);
    for(const gk in g)for(const ak in a)for(const mk in m)for(const wk in w)add(`macrodetails/universal-${gk}-${ak}-${mk}muscle-${wk}weight`.replace('muscle-','muscle-').replace(/(min|average|max)muscle-(min|average|max)weight/,'$1muscle-$2weight'),g[gk]*a[ak]*m[mk]*w[wk]);
    const rs=Object.values(S.race).reduce((t,x)=>t+x,0)||1;
    for(const rk in S.race)for(const gk in g)for(const ak in a)add(`macrodetails/${rk}-${gk}-${ak}`,S.race[rk]/rs*g[gk]*a[ak]);
    const adult=1-a.baby-a.child;
    const hw=S.height<.5?{minheight:1-2*S.height}:{maxheight:2*S.height-1};
    for(const gk in g)for(const hk in hw)add(`macrodetails/height/${gk}-young-averagemuscle-averageweight-${hk}`,g[gk]*hw[hk]*adult);
    const pw=S.prop<.5?{uncommonproportions:1-2*S.prop}:{idealproportions:2*S.prop-1};
    for(const gk in g)for(const pk in pw)add(`macrodetails/proportions/${gk}-young-averagemuscle-averageweight-${pk}`,g[gk]*pw[pk]*adult);
    for(const d of man.detail){const v=S.detail[d.id];if(!v)continue;
      for(const [f,sg] of d.files){const k=d.bi?(sg>0?Math.max(0,v):Math.max(0,-v)):Math.max(0,v);add(f,k);}}
    return W;
  }
  /* ---- skeleton, mesh and skin ---- */
  const bones=man.bones.map(b=>{const o=new THREE.Bone();o.name=b.n;return o;});
  man.bones.forEach((b,i)=>{if(b.p>=0)bones[b.p].add(bones[i]);});
  const rig=new THREE.Group();rig.name='Rig';const rootBone=bones[0];rig.add(rootBone);
  const skeleton=new THREE.Skeleton(bones);
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(man.n*3),nrm=new Float32Array(man.n*3);
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('normal',new THREE.BufferAttribute(nrm,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setAttribute('skinIndex',new THREE.BufferAttribute(new Uint16Array(skinI),4));geo.setAttribute('skinWeight',new THREE.BufferAttribute(new Float32Array(Array.from(skinW,x=>x/255)),4));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  const skin=new THREE.MeshPhysicalMaterial({color:S.skin,roughness:.55,sheen:.6,sheenRoughness:.5,sheenColor:new THREE.Color('#ffd9c4'),clearcoat:.06,clearcoatRoughness:.5});
  const body=new THREE.SkinnedMesh(geo,skin);body.name='Body';body.frustumCulled=false;body.castShadow=true;body.receiveShadow=true;
  const root=new THREE.Group();root.name='Character';root.add(body,rig);body.bind(skeleton,new THREE.Matrix4());
  const BN=new Float32Array(man.nv*3);
  /* per base vertex top-4 skin influences, used to skin clothes and hair that are fitted to base vertices */
  const bsI=new Uint16Array(man.nv*4),bsW=new Float32Array(man.nv*4),bsHas=new Uint8Array(man.nv);
  for(let i=0;i<man.n;i++){const v=vmap[i];if(bsHas[v])continue;bsHas[v]=1;for(let k=0;k<4;k++){bsI[v*4+k]=skinI[i*4+k];bsW[v*4+k]=skinW[i*4+k]/255;}}
  /* The source rig only weights the 13380 body vertices, but every garment, shoe, lash and brow is fitted to vertices of the full 19158-vertex base mesh
     (helper geometry included). Without a transfer those points fell back to the root bone and stayed behind in any pose (the "left behind sleeve",
     "detached feet" and "floating lashes" faults). Helper vertices therefore take their skin from the nearest body surface vertices (inverse distance, 4 nearest). */
  const CELL=.5,bgrid=new Map(),cellKey=(x,y,z)=>Math.floor(x/CELL)+','+Math.floor(y/CELL)+','+Math.floor(z/CELL);
  for(let v=0;v<man.nvBody;v++){if(!bsHas[v])continue;const k=cellKey(baseP[v*3],baseP[v*3+1],baseP[v*3+2]);let l=bgrid.get(k);if(!l)bgrid.set(k,l=[]);l.push(v);}
  /* nearest body vertices to a rest-space point (MakeHuman units), returns merged top-4 influences */
  function transferAt(x,y,z,outI,outW,o){
    const cx=Math.floor(x/CELL),cy=Math.floor(y/CELL),cz=Math.floor(z/CELL);let cand=[];
    for(let r=1;r<=4&&cand.length<4;r++){cand=[];for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++)for(let c=-r;c<=r;c++){const l=bgrid.get((cx+a)+','+(cy+b)+','+(cz+c));if(!l)continue;for(const v of l){const dx=baseP[v*3]-x,dy=baseP[v*3+1]-y,dz=baseP[v*3+2]-z;cand.push([v,dx*dx+dy*dy+dz*dz]);}}}
    cand.sort((p,q)=>p[1]-q[1]);const acc=new Map();let used=0;
    for(const [v,d2] of cand.slice(0,4)){const k=1/(d2+.0004);used++;for(let j=0;j<4;j++){const w=bsW[v*4+j]*k;if(w>0)acc.set(bsI[v*4+j],(acc.get(bsI[v*4+j])||0)+w);}}
    const top=[...acc].sort((p,q)=>q[1]-p[1]).slice(0,4);const t=top.reduce((s,e)=>s+e[1],0)||1;
    for(let j=0;j<4;j++){const e=top[j];outI[o+j]=e?e[0]:0;outW[o+j]=e?e[1]/t:0;}
    return used;
  }
  let helperXfer=0;
  for(let v=man.nvBody;v<man.nv;v++){if(bsHas[v])continue;transferAt(baseP[v*3],baseP[v*3+1],baseP[v*3+2],bsI,bsW,v*4);bsHas[v]=2;helperXfer++;}
  const texLoader=new THREE.TextureLoader();const texCache=new Map();
  const getTex=(url)=>{if(!texCache.has(url)){const t=texLoader.load(url,()=>{try{c.onTex&&c.onTex();}catch(e){}});t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;texCache.set(url,t);}return texCache.get(url);};
  let P=new Float32Array(baseP),yOff=0;
  const Hd=man.bones.map(()=>new THREE.Vector3());
  /* canonical rest frames and the pose, kept apart: pq holds each bone's pose rotation in rest-world axes (the convention the presets and FIRST LIGHT use),
     Lr is the local rest rotation, Rr the world rest rotation. The bone's local quaternion is Lr * (Rr^-1 * pq * Rr). */
  const Rr=man.bones.map(()=>new THREE.Quaternion()),Rinv=man.bones.map(()=>new THREE.Quaternion()),Lr=man.bones.map(()=>new THREE.Quaternion()),pq=man.bones.map(()=>new THREE.Quaternion()),Yax=man.bones.map(()=>new THREE.Vector3(0,1,0));
  const frameInfo={degenerate:[],fallbackRoll:[]};
  const vec=a=>new THREE.Vector3(a[0]*.1,(a[1]+yOff)*.1,a[2]*.1);
  function solveFrames(){
    frameInfo.degenerate.length=0;frameInfo.fallbackRoll.length=0;const mat=new THREE.Matrix4(),X=new THREE.Vector3(),Y=new THREE.Vector3(),Z=new THREE.Vector3(),n=new THREE.Vector3(),u=new THREE.Vector3();
    man.bones.forEach((mb,i)=>{
      const tail=vec(avg(mb.t));Y.copy(tail).sub(Hd[i]);
      if(Y.length()<1e-5){frameInfo.degenerate.push(mb.n);if(mb.p>=0)Y.copy(Yax[mb.p]);else Y.set(0,1,0);}
      Y.normalize();Yax[i].copy(Y);
      if(mb.pl){const p1=vec(avg(mb.pl[0])),p2=vec(avg(mb.pl[1])),p3=vec(avg(mb.pl[2]));n.copy(p2).sub(p1).cross(u.copy(p3).sub(p1));}else n.set(0,0,0);
      X.copy(n).addScaledVector(Y,-n.dot(Y));
      if(X.length()<1e-6){frameInfo.fallbackRoll.push(mb.n);X.set(0,0,1).cross(Y);if(X.length()<1e-6)X.set(1,0,0);}
      X.normalize();Z.copy(X).cross(Y).normalize();X.copy(Y).cross(Z).normalize();
      mat.makeBasis(X,Y,Z);Rr[i].setFromRotationMatrix(mat).normalize();Rinv[i].copy(Rr[i]).invert();
    });
    man.bones.forEach((mb,i)=>{if(mb.p>=0)Lr[i].copy(Rinv[mb.p]).multiply(Rr[i]);else Lr[i].copy(Rr[i]);});
  }
  const _c=new THREE.Quaternion();
  const setBoneQ=i=>{_c.copy(Rinv[i]).multiply(pq[i]).multiply(Rr[i]);bones[i].quaternion.copy(Lr[i]).multiply(_c);};
  function applyPoseQ(){for(let i=0;i<bones.length;i++)setBoneQ(i);}
  const avg=(l)=>{let x=0,y=0,z=0;for(const i of l){x+=P[i*3];y+=P[i*3+1];z+=P[i*3+2];}const n=l.length;return [x/n,y/n,z/n];};
  function rebuild(){
    let mn=1e9;for(let i=0;i<man.nvBody;i++)mn=Math.min(mn,P[i*3+1]);yOff=-mn;
    for(let i=0;i<man.n;i++){const v=vmap[i]*3;pos[i*3]=P[v]*.1;pos[i*3+1]=(P[v+1]+yOff)*.1;pos[i*3+2]=P[v+2]*.1;}
    /* normals from the shared base vertices so UV seams don't show */
    BN.fill(0);
    for(let t=0;t<man.nIdx;t+=3){const a=vmap[idx[t]],b=vmap[idx[t+1]],d=vmap[idx[t+2]];
      const ax=P[b*3]-P[a*3],ay=P[b*3+1]-P[a*3+1],az=P[b*3+2]-P[a*3+2],bx=P[d*3]-P[a*3],by=P[d*3+1]-P[a*3+1],bz=P[d*3+2]-P[a*3+2];
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;for(const q of[a,b,d]){BN[q*3]+=nx;BN[q*3+1]+=ny;BN[q*3+2]+=nz;}}
    for(let i=0;i<man.nv;i++){const l=Math.hypot(BN[i*3],BN[i*3+1],BN[i*3+2])||1;BN[i*3]/=l;BN[i*3+1]/=l;BN[i*3+2]/=l;}
    for(let i=0;i<man.n;i++){const v=vmap[i]*3;nrm[i*3]=BN[v];nrm[i*3+1]=BN[v+1];nrm[i*3+2]=BN[v+2];}
    geo.attributes.position.needsUpdate=true;geo.attributes.normal.needsUpdate=true;geo.computeBoundingSphere();
    /* skeleton follows the new body. Canonical rest frames: Y runs head to tail, X is the normal of the bone's rotation plane (pinned source metadata),
       Z completes the right-handed frame. Local rest transforms are taken relative to the parent's world rest frame, inverse binds come from that rest
       pose in character space (root placement is neutral: the mesh and the bones share the same ground offset), then the pose goes back on. */
    bones.forEach((b,i)=>{const h=avg(man.bones[i].h);Hd[i].set(h[0]*.1,(h[1]+yOff)*.1,h[2]*.1);});
    solveFrames();
    bones.forEach((b,i)=>{const p=man.bones[i].p;b.quaternion.copy(Lr[i]);
      if(p>=0)b.position.copy(Hd[i]).sub(Hd[p]).applyQuaternion(Rinv[p]);else b.position.copy(Hd[i]);});
    rig.updateMatrixWorld(true);skeleton.calculateInverses();
    applyPoseQ();rig.updateMatrixWorld(true);alignAttachments();
    garmentsUpdate();proxiesUpdate();eyesUpdate();
  }
  /* ---- regions (computed once on the base shape) ---- */
  const dom=new Array(man.n);for(let i=0;i<man.n;i++){let b=0,w=-1;for(let k=0;k<4;k++)if(skinW[i*4+k]>w){w=skinW[i*4+k];b=skinI[i*4+k];}dom[i]=man.bones[b].n;}
  const by=i=>baseP[vmap[i]*3+1],bz=i=>baseP[vmap[i]*3+2];
  const isB=(i,re)=>re.test(dom[i]);
  /* regions come from smooth planes in the base shape (hems, necklines, sleeve ends), not from bone ownership, so garment edges are clean */
  const bx=i=>Math.abs(baseP[vmap[i]*3]);
  const armish=i=>isB(i,/^(clavicle|shoulder|upperarm|lowerarm|wrist|finger|metacarpal)/);
  const hairThr=i=>{const z=bz(i),x=bx(i);let t=z>.6?8.05:Math.max(7.05,8.05-(.6-z)*1.1);if(x>.8&&z>-.45)t+=.4;return t;};
  /* each region is a scalar field over the base shape (positive inside); garments are clipped exactly on the zero line, so hems and necklines are straight */
  const REG={
    tank:i=>Math.min(by(i)-1.0,5.3-by(i),1.75-bx(i)),
    tee:i=>Math.min(by(i)-1.0,5.75-by(i),2.75-bx(i)),
    long:i=>Math.min(by(i)-1.0,5.75-by(i),4.15-bx(i)),
    /* limited to the hip and leg columns: in the A-pose the fingertips hang at the same height as the thighs and used to be clipped into the trousers */
    shorts:i=>Math.min(1.4-by(i),by(i)+2.5,3.3-bx(i)),
    trousers:i=>Math.min(1.4-by(i),by(i)+7.1,3.3-bx(i))
  };
  const gm=new Map();
  function garment(key,reg,color,off,rough=.8){
    const f=new Float32Array(man.n);for(let i=0;i<man.n;i++)f[i]=reg(i);
    const vid=new Map(),src=[]; // each garment vertex is a point on the body mesh: [a,b,t] = lerp(a,b,t)
    const V=(a,b=a,t=0)=>{const k=a+'_'+b;let r=vid.get(k);if(r===undefined){r=src.length;vid.set(k,r);src.push([a,b,t]);}return r;};
    const tri=[];
    for(let t=0;t<man.nIdx;t+=3){
      const q=[idx[t],idx[t+1],idx[t+2]],ins=q.map(v=>f[v]>=0);
      if(ins[0]&&ins[1]&&ins[2]){tri.push(V(q[0]),V(q[1]),V(q[2]));continue;}
      if(!ins[0]&&!ins[1]&&!ins[2])continue;
      const poly=[];
      for(let k=0;k<3;k++){const a=q[k],b=q[(k+1)%3],ia=ins[k],ib=ins[(k+1)%3];
        if(ia)poly.push(V(a));
        if(ia!==ib){const inn=ia?a:b,out=ia?b:a,t0=f[inn]/(f[inn]-f[out]);poly.push(V(inn,out,t0));}}
      for(let k=1;k<poly.length-1;k++)tri.push(poly[0],poly[k],poly[k+1]);
    }
    if(!tri.length)return null;
    const g=new THREE.BufferGeometry(),n=src.length,near=src.map(([a,b,t])=>t>.5?b:a);
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv',new THREE.BufferAttribute(Float32Array.from(src.flatMap(([a,b,t])=>[uv[a*2]+(uv[b*2]-uv[a*2])*t,uv[a*2+1]+(uv[b*2+1]-uv[a*2+1])*t])),2));
    g.setAttribute('skinIndex',new THREE.BufferAttribute(Uint16Array.from(near.flatMap(s2=>[skinI[s2*4],skinI[s2*4+1],skinI[s2*4+2],skinI[s2*4+3]])),4));
    g.setAttribute('skinWeight',new THREE.BufferAttribute(Float32Array.from(near.flatMap(s2=>[skinW[s2*4]/255,skinW[s2*4+1]/255,skinW[s2*4+2]/255,skinW[s2*4+3]/255])),4));
    g.setIndex(tri);
    const m=new THREE.SkinnedMesh(g,new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0,side:THREE.DoubleSide}));
    m.name=key;m.frustumCulled=false;m.castShadow=true;m.bind(skeleton,new THREE.Matrix4());root.add(m);
    return {m,src,off};
  }
  function garmentsUpdate(){for(const e of gm.values()){if(!e)continue;const p=e.m.geometry.attributes.position.array,n=e.m.geometry.attributes.normal.array;
    for(let j=0;j<e.src.length;j++){const [a,b,t]=e.src[j],A=a*3,B2=b*3;let nx=0,ny=0,nz=0;for(let c=0;c<3;c++){const nv=nrm[A+c]+(nrm[B2+c]-nrm[A+c])*t;n[j*3+c]=nv;}
      for(let c=0;c<3;c++)p[j*3+c]=pos[A+c]+(pos[B2+c]-pos[A+c])*t+n[j*3+c]*e.off;}
    e.m.geometry.attributes.position.needsUpdate=true;e.m.geometry.attributes.normal.needsUpdate=true;e.m.geometry.computeBoundingSphere();}}
  const clearG=k=>{const e=gm.get(k);if(e){root.remove(e.m);e.m.geometry.dispose();e.m.material.dispose();gm.delete(k);}};
  const boneIdx=new Map(man.bones.map((b,i)=>[b.n,i]));
  const boneByName=n=>bones[boneIdx.get(n)];
  /* ---- accessories: one group owned by the head bone, so glasses follow the skull (never the rotating eyeballs) and are always disposed ---- */
  const acc=new THREE.Group();acc.name='Accessories';boneByName('head').add(acc);
  const disposeTree=o=>o.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material)(Array.isArray(c.material)?c.material:[c.material]).forEach(m=>m.dispose());});
  function clearAccessories(){for(const c of [...acc.children]){acc.remove(c);disposeTree(c);}acc.userData={};}
  /* ---- packed library: immutable data is cached per asset; every use gets its own mesh and geometry, so slots never share mutable state ---- */
  const dataCache=new Map();
  function proxyData(id){
    if(dataCache.has(id))return dataCache.get(id);
    const job=(async()=>{
      const pm=await (await fetch(base+'a/'+id+'.json')).json();if(!pm.nv)return null;
      const buf=await (await fetch(base+'a/'+id+'.bin')).arrayBuffer();
      const A={ia:new Uint16Array(buf,pm.ia,pm.nv),ib:new Uint16Array(buf,pm.ib,pm.nv),ic:new Uint16Array(buf,pm.ic,pm.nv),w:new Float32Array(buf,pm.w,pm.nv*3),off:new Float32Array(buf,pm.off,pm.nv*3),pv:new Uint16Array(buf,pm.pv,pm.n),uv:new Float32Array(buf,pm.uv,pm.n*2),idx:pm.big?new Uint32Array(buf,pm.idx,pm.tris):new Uint16Array(buf,pm.idx,pm.tris)};
      /* skin: blend the weights of the three base vertices each point is bound to (helper vertices already carry transferred weights); anything left over takes the nearest body surface */
      const si=new Uint16Array(pm.nv*4),sw=new Float32Array(pm.nv*4);let fallback=0,helperRef=0;
      for(let k=0;k<pm.nv;k++){const acc2=new Map(),src=[[A.ia[k],A.w[k*3]],[A.ib[k],A.w[k*3+1]],[A.ic[k],A.w[k*3+2]]];
        for(const [v,wc] of src){if(v>=man.nv)continue;if(v>=man.nvBody&&wc>.05)helperRef++;for(let j=0;j<4;j++){const b=bsI[v*4+j],w=bsW[v*4+j]*Math.max(0,wc);if(w>0)acc2.set(b,(acc2.get(b)||0)+w);}}
        const top=[...acc2].sort((x,y)=>y[1]-x[1]).slice(0,4);let t=top.reduce((q,x)=>q+x[1],0);
        if(!top.length||t<1e-6){fallback++;const v=A.ia[k];transferAt(baseP[v*3],baseP[v*3+1],baseP[v*3+2],si,sw,k*4);continue;}
        top.forEach(([b,w],j)=>{si[k*4+j]=b;sw[k*4+j]=w/t;});}
      const gi=new Uint16Array(pm.n*4),gw=new Float32Array(pm.n*4);for(let i=0;i<pm.n;i++){const k=A.pv[i];for(let j=0;j<4;j++){gi[i*4+j]=si[k*4+j];gw[i*4+j]=sw[k*4+j];}}
      const dl=new Set();for(const [a,b] of pm.del)for(let v=a;v<=b;v++)dl.add(v);
      return {id,pm,A,gi,gw,del:dl,stats:{vertices:pm.nv,fallback,helperRef}};
    })();
    dataCache.set(id,job);job.catch(()=>dataCache.delete(id));return job;
  }
  function makeProxy(d){
    const {pm,A}=d,n=pm.n,g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv',new THREE.BufferAttribute(A.uv.slice(),2));
    g.setAttribute('skinIndex',new THREE.BufferAttribute(d.gi.slice(),4));g.setAttribute('skinWeight',new THREE.BufferAttribute(d.gw.slice(),4));g.setIndex(new THREE.BufferAttribute(A.idx.slice(),1));
    const hairy=pm.kind==='hair'||pm.kind==='eyebrows'||pm.kind==='eyelashes';
    const mat=new THREE.MeshStandardMaterial({roughness:hairy?.55:.85,metalness:0,side:pm.cull&&!hairy?THREE.FrontSide:THREE.DoubleSide,alphaTest:pm.transparent?.4:0,transparent:false});
    if(pm.tex)mat.map=getTex(base+'a/'+pm.tex);
    const baseMap=mat.map;
    const m=new THREE.SkinnedMesh(g,mat);m.name=pm.name;m.frustumCulled=false;m.castShadow=pm.kind==='clothes'||pm.kind==='hair';m.receiveShadow=pm.kind==='clothes';m.bind(skeleton,new THREE.Matrix4());
    const p={id:d.id,pm,A,m,baseMap,tmp:new Float32Array(pm.nv*3),del:d.del,data:d};
    if(pm.kind==='eyebrows'||pm.kind==='eyelashes')proxyMorphs(p);
    return p;
  }
  function proxyUpdate(p){
    const {A,pm,m,tmp}=p,g=m.geometry,pos2=g.attributes.position.array;
    const sc=(k,c)=>{const e=pm.sc[k];if(!e)return 1;return Math.abs(P[e[0]*3+c]-P[e[1]*3+c])/e[2];},sx=sc('x',0),sy=sc('y',1),sz=sc('z',2);
    for(let k=0;k<pm.nv;k++){const a=A.ia[k]*3,b=A.ib[k]*3,c2=A.ic[k]*3,w0=A.w[k*3],w1=A.w[k*3+1],w2=A.w[k*3+2],o=k*3;
      tmp[o]=w0*P[a]+w1*P[b]+w2*P[c2]+A.off[o]*sx;tmp[o+1]=w0*P[a+1]+w1*P[b+1]+w2*P[c2+1]+A.off[o+1]*sy;tmp[o+2]=w0*P[a+2]+w1*P[b+2]+w2*P[c2+2]+A.off[o+2]*sz;}
    for(let i=0;i<pm.n;i++){const k=A.pv[i]*3;pos2[i*3]=tmp[k]*.1;pos2[i*3+1]=(tmp[k+1]+yOff)*.1;pos2[i*3+2]=tmp[k+2]*.1;}
    g.attributes.position.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
  }
  const active=new Map(); // slot -> proxy
  function proxiesUpdate(){for(const p of active.values())if(p)proxyUpdate(p);}
  const fullIdx=idx;
  /* body is hidden only under garments that fitted, per garment, and restored the moment it is removed */
  function bodyHide(){
    const dl=new Set();for(const p of active.values())if(p&&p.pm.kind==='clothes'&&p.m.visible)for(const v of p.del)dl.add(v);
    if(!dl.size){geo.setIndex(new THREE.BufferAttribute(fullIdx,1));return;}
    const out=[];for(let t=0;t<fullIdx.length;t+=3){if(dl.has(vmap[fullIdx[t]])&&dl.has(vmap[fullIdx[t+1]])&&dl.has(vmap[fullIdx[t+2]]))continue;out.push(fullIdx[t],fullIdx[t+1],fullIdx[t+2]);}
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(out),1));
  }
  const isLib=id=>id&&id!=='none'&&(lib.hair.some(x=>x.id===id)||lib.clothes.some(x=>x.id===id)||lib.eyebrows.some(x=>x.id===id)||lib.eyelashes.some(x=>x.id===id));
  function setSlot(slot,d,color){
    const old=active.get(slot);if(old){root.remove(old.m);old.m.geometry.dispose();old.m.material.dispose();active.delete(slot);}
    if(!d)return null;const p=makeProxy(d);root.add(p.m);active.set(slot,p);p.m.material.color.set(color||'#ffffff');return p;
  }
  /* head-local frame of a rest-space point (MakeHuman units, y not yet offset): the head bone's inverse bind matrix is exactly that transform */
  const _v=new THREE.Vector3();
  const toHead=(x,y,z)=>new THREE.Vector3(x*.1,(y+yOff)*.1,z*.1).sub(Hd[boneIdx.get('head')]);
  function eyeRest(sd){const h=man.bones[boneIdx.get('eye.'+sd)].h;const a=avg(h);return toHead(a[0],a[1],a[2]);}
  function buildGlasses(){
    clearAccessories();const gs=S.glasses.style;if(!gs||gs==='none')return;
    const gmat=new THREE.MeshStandardMaterial({color:S.glasses.color,roughness:.25,metalness:.2}),dark=gs==='sunglasses'||gs==='visor';
    const lens=new THREE.MeshPhysicalMaterial({color:dark?'#0a0a0a':'#cfe7ff',roughness:.05,transmission:gs==='round'?.85:0,transparent:gs==='round',opacity:gs==='round'?.35:1,clearcoat:1});
    const parts=[];const mk=(m,tag,sd)=>{m.name='Glasses.'+tag;m.castShadow=false;acc.add(m);parts.push({m,tag,sd});return m;};
    if(gs==='visor')mk(new THREE.Mesh(new THREE.BoxGeometry(.13,.034,.006),lens),'lens',0);
    else for(const sd of[-1,1]){mk(new THREE.Mesh(gs==='round'?new THREE.CircleGeometry(.021,28):new THREE.PlaneGeometry(.05,.034),lens),'lens',sd);
      const fr=gs==='round'?new THREE.Mesh(new THREE.TorusGeometry(.021,.0026,8,28),gmat):new THREE.Mesh(new THREE.TorusGeometry(.0255,.0026,8,4),gmat);if(gs!=='round'){fr.rotation.z=Math.PI/4;fr.scale.set(1.0,.69,1);}mk(fr,'frame',sd);}
    mk(new THREE.Mesh(new THREE.BoxGeometry(.03,.004,.004),gmat),'bridge',0);
    for(const sd of[-1,1])mk(new THREE.Mesh(new THREE.BoxGeometry(.003,.003,.1),gmat),'temple',sd);
    acc.userData.parts=parts;glassesUpdate();
  }
  function glassesUpdate(){
    const parts=acc.userData.parts;if(!parts)return;const eL=eyeRest('L'),eR=eyeRest('R');const mid=eL.clone().add(eR).multiplyScalar(.5);const half=Math.abs(eL.x-eR.x)/2;
    /* head half width at ear height, so the temple arms reach the sides of the head */
    const earX=Math.max(half+.03,headHalf());
    for(const {m,tag,sd} of parts){
      if(tag==='lens'||tag==='frame'){m.position.set(sd===0?mid.x:mid.x+sd*half,mid.y,mid.z+.021);}
      else if(tag==='bridge'){m.position.set(mid.x,mid.y+.004,mid.z+.022);m.scale.x=Math.max(.5,half*2/.058);}
      else if(tag==='temple'){m.position.set(mid.x+sd*earX,mid.y,mid.z-.03);}
    }
  }
  function headHalf(){let mx=0;const hb=man.bones[boneIdx.get('head')].h;const hy=avg(hb)[1];for(let i=0;i<man.nvBody;i+=3){if(P[i*3+1]>hy&&P[i*3+1]<hy+1.2)mx=Math.max(mx,Math.abs(P[i*3]));}return mx*.1*1.0;}
  /* attachments keep rest-world orientation whatever the bone axes are: eyeballs look forward, glasses face forward */
  function alignAttachments(){const hi=boneIdx.get('head');acc.quaternion.copy(Rinv[hi]);acc.position.set(0,0,0);
    for(const e of eyes){const i=boneIdx.get(e.userData.bone);e.quaternion.copy(Rinv[i]);e.position.set(0,0,.003).applyQuaternion(Rinv[i]);}}
  function eyesUpdate(){glassesUpdate();}
  let outfitSeq=0;
  /* One atomic outfit change: everything the new look needs is loaded first, a stale request is dropped before it touches the scene, then slots are swapped in one synchronous step. */
  async function outfit(){
    const seq=++outfitSeq,S0=structuredClone(S);
    const lite=id=>isLib(id)?id:'none';
    const covers=['fedora01','fedora_cocked'].includes(S0.head.style);
    const wantSuit=isLib(S0.suit.style);
    const req={hair:covers?'none':lite(S0.hair.style),brows:lite(S0.brows.style),lashes:S0.lashes?'eyelashes02':'none',suit:wantSuit?S0.suit.style:'none',shoes:lite(S0.shoes.style),hat:lite(S0.head.style)};
    const ds={};
    try{await Promise.all(Object.entries(req).map(async([slot,id])=>{ds[slot]=id==='none'?null:await proxyData(id);}));}catch(e){console.warn('outfit asset failed',e);}
    if(seq!==outfitSeq)return false;
    const col={hair:S0.hair.color,brows:S0.brows.color,lashes:'#101010',suit:S0.suit.color,shoes:S0.shoes.color,hat:S0.head.color};
    for(const slot of Object.keys(req))setSlot(slot,ds[slot]||null,col[slot]);
    for(const k of ['top','bottom'])clearG(k);
    /* body-cut basics are only a base layer under or instead of a library outfit; bare slots stay bare */
    if(!wantSuit){const t=S0.top.style;if(REG[t])gm.set('top',garment('Top',REG[t],S0.top.color,.0045,.85));
      const b=S0.bottom.style;if(REG[b])gm.set('bottom',garment('Bottom',REG[b],S0.bottom.color,.0042,.85));}
    buildGlasses();
    bodyHide();rebuild();expr();applyMaterials();return true;
  }
  /* ---- eyes ---- */
  const eyes=[];
  function makeEyes(){
    const cv=document.createElement('canvas');cv.width=256;cv.height=128;const g=cv.getContext('2d');
    /* the front of a three.js sphere sits at u = 0.25, v = 0.5, so the iris is painted there; 256 px is 360 degrees, so a 26 px radius is about 37 degrees */
    const draw=col=>{g.fillStyle='#f1eee8';g.fillRect(0,0,256,128);const cx=64,cy=64,R=24;
      const gr=g.createRadialGradient(cx,cy,2,cx,cy,R);gr.addColorStop(0,'#030303');gr.addColorStop(.36,'#030303');gr.addColorStop(.38,col);gr.addColorStop(.85,col);gr.addColorStop(1,'#14100d');
      g.fillStyle=gr;g.beginPath();g.ellipse(cx,cy,R,R*1.0,0,0,7);g.fill();g.fillStyle='rgba(255,255,255,.9)';g.beginPath();g.arc(cx-8,cy-9,3.4,0,7);g.fill();};
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;draw(S.eye);
    const mat=new THREE.MeshPhysicalMaterial({map:tex,roughness:.15,clearcoat:1,clearcoatRoughness:.05});
    eyes.draw=()=>{draw(S.eye);tex.needsUpdate=true;};
    for(const s of['L','R']){const e=new THREE.Mesh(new THREE.SphereGeometry(.0135,32,24),mat);e.position.z=.003;e.name='Eye.'+s;e.userData.bone='eye.'+s;eyes.push(e);boneByName('eye.'+s).add(e);}
  }
  /* ---- expressions as real morph targets (body, and the brows and lashes that sit on the face) ---- */
  let exprT=[];
  async function makeMorphs(){
    const rev=Array.from({length:man.nv},()=>[]);for(let i=0;i<man.n;i++)rev[vmap[i]].push(i);
    const ts=await Promise.all(man.expr.map(n=>load('expression/units/caucasian/'+n)));
    const arrs=[],names=[];exprT=[];
    man.expr.forEach((n,k)=>{const t=ts[k];if(!t)return;exprT.push({name:n,t});const a=new Float32Array(man.n*3);for(let j=0;j<t.k;j++){for(const e of rev[t.ia[j]]){a[e*3]=t.da[j*3]*man.sc*.1;a[e*3+1]=t.da[j*3+1]*man.sc*.1;a[e*3+2]=t.da[j*3+2]*man.sc*.1;}}arrs.push(new THREE.BufferAttribute(a,3));names.push(n);});
    geo.morphAttributes.position=arrs;geo.morphTargetsRelative=true;body.updateMorphTargets();
    names.forEach((n,i)=>{body.morphTargetDictionary[n]=i;});
  }
  /* brows and lashes ride the same expression deltas through their barycentric binding, so a blink closes the lashes and a frown moves the brows */
  function proxyMorphs(p){
    if(!exprT.length)return;const {A,pm,m}=p,dense=new Float32Array(man.nv*3),arrs=[];
    for(const {t} of exprT){dense.fill(0);for(let j=0;j<t.k;j++){const v=t.ia[j]*3;dense[v]=t.da[j*3]*man.sc*.1;dense[v+1]=t.da[j*3+1]*man.sc*.1;dense[v+2]=t.da[j*3+2]*man.sc*.1;}
      const a=new Float32Array(pm.n*3);for(let i=0;i<pm.n;i++){const k=A.pv[i],x=A.ia[k]*3,y=A.ib[k]*3,z=A.ic[k]*3,w0=A.w[k*3],w1=A.w[k*3+1],w2=A.w[k*3+2];for(let c=0;c<3;c++)a[i*3+c]=w0*dense[x+c]+w1*dense[y+c]+w2*dense[z+c];}
      arrs.push(new THREE.BufferAttribute(a,3));}
    m.geometry.morphAttributes.position=arrs;m.geometry.morphTargetsRelative=true;m.updateMorphTargets();
    exprT.forEach((e,i)=>{m.morphTargetDictionary[e.name]=i;});
  }
  function expr(){
    const set=m=>{const inf=m.morphTargetInfluences;if(!inf)return;inf.fill(0);for(const [k,v] of Object.entries(S.expr)){const i=m.morphTargetDictionary&&m.morphTargetDictionary[k];if(i!=null)inf[i]=clamp(v,0,1);}};
    set(body);for(const p of active.values())if(p&&(p.pm.kind==='eyebrows'||p.pm.kind==='eyelashes'))set(p.m);
  }
  /* ---- materials and decals ----
     Every garment has its own material slot (top, bottom, suit, shoes, hat). A fabric preset sets roughness and a procedural normal map whose repeat is the UV scale.
     A decal is a local PNG, JPEG or WebP placed on the garment's chest UV panel; it is composited into the garment's colour texture (tint baked in, sRGB), so the preview
     and the exported GLB carry the same pixels. The original texture and UVs are never modified. */
  const FABRICS={cotton:{rough:.9,ns:.35,rep:26,pat:'weave'},denim:{rough:.82,ns:.7,rep:34,pat:'twill'},knit:{rough:.95,ns:.8,rep:18,pat:'knit'},leather:{rough:.48,ns:.5,rep:10,pat:'grain'},satin:{rough:.28,ns:0,rep:1,pat:null}};
  const normCache=new Map();
  function fabricNormal(pat){
    if(!pat)return null;if(normCache.has(pat))return normCache.get(pat);
    const N=128,cv=document.createElement('canvas');cv.width=cv.height=N;const g=cv.getContext('2d'),im=g.createImageData(N,N);
    const h=(x,y)=>{const u=x/N*Math.PI*2,v=y/N*Math.PI*2;
      if(pat==='weave')return Math.sin(u*8)*Math.sin(v*8)*.5+.5;
      if(pat==='twill')return Math.sin((u+v)*10)*.5+.5;
      if(pat==='knit')return Math.abs(Math.sin(u*6+Math.sin(v*6)*1.4))*.8+.2;
      return (Math.sin(u*13)*Math.sin(v*11)+Math.sin(u*29+v*7)*.6)*.25+.5;};
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){const dx=h(x+1,y)-h((x-1+N)%N,y),dy=h(x,y+1)-h(x,(y-1+N)%N),l=Math.hypot(dx*4,dy*4,1),o=(y*N+x)*4;
      im.data[o]=((-dx*4/l)*.5+.5)*255;im.data[o+1]=((-dy*4/l)*.5+.5)*255;im.data[o+2]=((1/l)*.5+.5)*255;im.data[o+3]=255;}
    g.putImageData(im,0,0);const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.NoColorSpace;normCache.set(pat,t);return t;
  }
  const decalImgs=new Map();
  function decalImage(src){
    if(!decalImgs.has(src)){const im=new Image();const rec={im,ready:false};im.onload=()=>{rec.ready=true;try{c.onTex&&c.onTex();}catch(e){}applyMaterials();};im.src=src;decalImgs.set(src,rec);}
    return decalImgs.get(src);
  }
  const slotMesh=slot=>slot==='top'||slot==='bottom'?(gm.get(slot)&&gm.get(slot).m):(active.get(slot)&&active.get(slot).m);
  /* the UV rectangle of the front of the chest: vertices at chest height, near the centre line, facing forward */
  function chestPanel(m){
    const g=m.geometry,p=g.attributes.position.array,nr=g.attributes.normal.array,uvs=g.attributes.uv.array,H=measure.stature||1.7;
    let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9,n=0;
    for(let i=0;i<p.length/3;i++){const x=p[i*3],y=p[i*3+1];if(Math.abs(x)<.13&&y>H*.66&&y<H*.8&&nr[i*3+2]>.35){const u=uvs[i*2],v=uvs[i*2+1];u0=Math.min(u0,u);u1=Math.max(u1,u);v0=Math.min(v0,v);v1=Math.max(v1,v);n++;}}
    return n>8?{u0,u1,v0,v1}:null;
  }
  function applyMaterials(){
    const sl=['top','bottom','suit','shoes','hat'];
    for(const slot of sl){const m=slotMesh(slot);if(!m)continue;const mat=m.material,cfg=(S.mat&&S.mat[slot])||{},f=FABRICS[cfg.fabric]||null;
      const col=slot==='top'?S.top.color:slot==='bottom'?S.bottom.color:slot==='suit'?S.suit.color:slot==='shoes'?S.shoes.color:S.head.color;
      mat.roughness=cfg.rough!=null?cfg.rough:(f?f.rough:mat.roughness);
      const nm=f?fabricNormal(f.pat):null;if(nm!==mat.normalMap){mat.normalMap=nm;mat.needsUpdate=true;}
      if(nm){const r=(f.rep||1)*(cfg.uv||1);nm.repeat.set(r,r);mat.normalScale.set(f.ns,f.ns);}
      const p=active.get(slot),base=p&&p.baseMap?p.baseMap:null;
      const dc=S.decal&&S.decal.slot===slot&&S.decal.img?S.decal:null;
      if(dc){
        const rec=decalImage(dc.img),panel=chestPanel(m);
        if(rec.ready&&panel){
          const SZ=1024,cv=m.userData.decalCanvas||(m.userData.decalCanvas=document.createElement('canvas'));cv.width=cv.height=SZ;const g=cv.getContext('2d');
          g.fillStyle='#ffffff';g.fillRect(0,0,SZ,SZ);const bi=base&&base.image&&base.image.width?base.image:null;if(bi)g.drawImage(bi,0,0,SZ,SZ);
          g.globalCompositeOperation='multiply';g.fillStyle=col||'#ffffff';g.fillRect(0,0,SZ,SZ);g.globalCompositeOperation='source-over';
          const pw=(panel.u1-panel.u0)*SZ,ph=(panel.v1-panel.v0)*SZ,cx=(panel.u0+(panel.u1-panel.u0)*dc.x)*SZ,cy=(1-(panel.v0+(panel.v1-panel.v0)*(1-dc.y)))*SZ;
          const iw=rec.im.naturalWidth||rec.im.width,ih=rec.im.naturalHeight||rec.im.height,w=pw*dc.scale,hh=w*ih/iw;
          g.save();g.translate(cx,cy);g.rotate(dc.rot*Math.PI/180);g.globalAlpha=dc.opacity;g.drawImage(rec.im,-w/2,-hh/2,w,hh);g.restore();
          if(!m.userData.decalTex){const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;m.userData.decalTex=t;}
          m.userData.decalTex.needsUpdate=true;mat.map=m.userData.decalTex;mat.color.set('#ffffff');mat.needsUpdate=true;continue;
        }
      }
      mat.map=base||(slot==='top'||slot==='bottom'?null:mat.map);if(m.userData.decalTex&&mat.map===m.userData.decalTex)mat.map=base;mat.color.set(col||'#ffffff');mat.needsUpdate=true;
    }
  }
  /* local image files only: type, size and a real decode are checked; large images are scaled down. Returns a data URL or throws a message that says how to fix it. */
  async function loadDecalFile(file){
    if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Use a PNG, JPEG or WebP image.');
    if(file.size>4*1048576)throw new Error('That image is over 4 MB. Resize it and try again.');
    let bmp;try{bmp=await createImageBitmap(file);}catch(e){throw new Error('That file could not be read as an image.');}
    const k=Math.min(1,768/Math.max(bmp.width,bmp.height)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(bmp.width*k));cv.height=Math.max(1,Math.round(bmp.height*k));
    cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);return cv.toDataURL('image/png');
  }
  function setDecal(d){S.decal=d?{slot:d.slot||'top',img:d.img,x:d.x??.5,y:d.y??.5,scale:d.scale??.5,rot:d.rot??0,opacity:d.opacity??1}:null;applyMaterials();}
  /* ---- applying ---- */
  /* ---- shape: composed from an immutable snapshot of the look, so a slider moved mid-load never mixes two states ---- */
  const compose=(W)=>{const out=new Float32Array(baseP);for(const [n,w] of W){const t=cache.get(n);if(!t)continue;const s=w*man.sc;for(let i=0;i<t.k;i++){const v=t.ia[i]*3,d=i*3;out[v]+=t.da[d]*s;out[v+1]+=t.da[d+1]*s;out[v+2]+=t.da[d+2]*s;}}return out;};
  const statureOf=Pp=>{let mn=1e9,mx=-1e9;for(let i=0;i<man.nvBody;i++){const y=Pp[i*3+1];if(y<mn)mn=y;if(y>mx)mx=y;}return (mx-mn)*.1;};
  const HLO=0,HHI=1;
  const ensure=snap=>Promise.all([...weights(snap).keys()].map(load));
  const measure={stature:0,reach:[0,0],clamped:false,version:0};
  /* Stature is a measured, neutral standing height. When the look asks for a height in cm the height macro is solved (bisection, the response is monotonic)
     so the figure keeps exactly that stature through age, muscle and weight changes. */
  async function solveStature(snap){
    await Promise.all([ensure({...snap,height:HLO}),ensure({...snap,height:HHI})]);
    const f=h=>statureOf(compose(weights({...snap,height:h}))),T=snap.stature/100,lo=f(HLO),hi=f(HHI);
    measure.reach=[lo,hi];measure.clamped=T<lo||T>hi;
    if(T<=lo)return HLO;if(T>=hi)return HHI;
    let a=HLO,b=HHI;for(let k=0;k<20;k++){const m=(a+b)/2;if(f(m)<T)a=m;else b=m;}return (a+b)/2;
  }
  let busy=0,again=false,cur=null;
  /* coalescing: calls made while a rebuild runs set a flag and share the running promise, which resolves only after the last snapshot is applied */
  function apply(){
    if(busy){again=true;return cur;}busy=1;
    cur=(async()=>{try{do{again=false;const snap=structuredClone(S);
      if(snap.stature)snap.height=await solveStature(snap);
      await ensure(snap);
      P=compose(weights(snap));if(snap.stature)S.height=snap.height;
      measure.stature=statureOf(P);measure.version++;
      rebuild();applySkin();ground();}while(again);}finally{busy=0;}return true;})();
    return cur;
  }
  /* base body presets replace the old gender slider; a blended legacy value is kept only for looks saved before */
  const STATURE_DEFAULT={male:171,female:159};
  function setBase(b){S.base=b==='female'?'female':'male';S.gender=S.base==='male'?1:0;if(!S.statureUser)S.stature=STATURE_DEFAULT[S.base];}
  function setStature(cm){S.stature=Math.round(cm*10)/10;S.statureUser=true;}
  function pose(name){
    S.pose=name;for(const q of pq)q.identity();const p=POSES[name]||{};
    for(const [k,v] of Object.entries(p)){const i=boneIdx.get(k);if(i!=null)pq[i].setFromEuler(new THREE.Euler(v[0],v[1],v[2],'XYZ'));}
    applyPoseQ();rig.updateMatrixWorld(true);ground();
  }
  /* pose one bone with an Euler in rest-world axes (what FIRST LIGHT's procedural animation uses); the canonical local rotation is derived from it */
  const _e=new THREE.Euler();
  function setBoneEuler(b,x,y,z){const i=typeof b==='string'?boneIdx.get(b):bones.indexOf(b);if(i==null||i<0)return;pq[i].setFromEuler(_e.set(x,y,z,'XYZ'));setBoneQ(i);}
  function applySkin(){
    let id=S.skinTex;
    if(id==='auto'){const g=S.gender>.5?'male':'female',a=S.age<.6?'young':S.age<.8?'middleage':'old',rk=Object.entries(S.race).sort((x,y)=>y[1]-x[1])[0][0],has=n=>lib.skins.some(x=>x.id===n);
      id=a+'_'+rk+'_'+g;if(!has(id))id='young_'+rk+'_'+g;if(!has(id))id='young_caucasian_'+g;}
    const e=id==='none'?null:lib.skins.find(x=>x.id===id);
    if(!e){skin.map=null;skin.color.set(S.skin);}else{skin.map=getTex(base+'a/'+e.tex);skin.color.setRGB(S.tone,S.tone,S.tone);}
    skin.needsUpdate=true;
  }
  function ground(){root.position.y=0;root.updateMatrixWorld(true);try{const bb=new THREE.Box3().setFromObject(body,true);if(isFinite(bb.min.y))root.position.y=-bb.min.y;}catch(e){}}
  function setSkin(c){S.skin=c;applySkin();}
  function setTone(v){S.tone=v;applySkin();}
  function setEye(c){S.eye=c;eyes.draw&&eyes.draw();}
  function set(path,v){const a=path.split('.');let o=S;for(let i=0;i<a.length-1;i++)o=o[a[i]]=o[a[i]]||{};o[a[a.length-1]]=v;}
  /* looks saved before the rework are migrated, never dropped: retired procedural items map to their nearest real replacement, the old continuous gender is kept */
  const MIGRATE={hair:{buzz:'short03',bun:'ponytail01',mohawk:'short02'},head:{balaclava:'none',beanie:'none',mask:'none',headband:'none'},neck:{scarf:'none'},shoes:{sneaker:'none'}};
  function load2(state){
    const st=structuredClone(state||{});const legacy=!('base' in st);
    Object.assign(S,structuredClone(DEFAULT),st);
    if(legacy){S.base=S.gender>=.5?'male':'female';S.stature=st.stature||null;S.statureUser=!!S.stature;}
    S.migrated=[];for(const slot of Object.keys(MIGRATE)){const m=MIGRATE[slot][S[slot].style];if(m!==undefined){S.migrated.push(slot+':'+S[slot].style+'>'+m);S[slot].style=m;}}
    if(!isLib(S.hair.style))S.hair.style='short01';if(S.shoes.style!=='none'&&!isLib(S.shoes.style))S.shoes.style='none';
    applySkin();setEye(S.eye);
  }
  /* ---- versioned character file (.n0character): the editable look plus what is needed to rebuild it, with the licence of every shipped asset ---- */
  const CHAR_FORMAT='n0character',CHAR_VERSION=2;
  function licenseOf(id){for(const k of ['hair','clothes','eyebrows','eyelashes']){const e=lib[k].find(x=>x.id===id);if(e)return {id,kind:k,license:/culturalibre/.test(id)?'see assets/human/library.json':'CC0-1.0',tags:e.tags||[]};}return null;}
  function exportCharacter(){
    const S2=structuredClone(S);const used=[S2.hair.style,S2.brows.style,S2.lashes?'eyelashes02':null,S2.suit.style,S2.shoes.style,S2.head.style].filter(x=>x&&x!=='none').map(licenseOf).filter(Boolean);
    return {format:CHAR_FORMAT,version:CHAR_VERSION,
      base:{asset:'makehuman-base-hm08',sha:man.sha,license:'CC0-1.0',bodyPreset:S2.base},
      morphology:{stature_cm:S2.stature,measured_stature_m:+measure.stature.toFixed(4),ageYears:+ageYears(S2.age).toFixed(1),muscle:S2.muscle,weight:S2.weight,proportions:S2.prop,ancestry:S2.race,face:S2.detail},
      rig:{profile:'makehuman-default-163',frames:'canonical-v1',poseSpace:'rest-world-euler',boneCount:bones.length},
      wardrobe:{hair:S2.hair,brows:S2.brows,lashes:S2.lashes,suit:S2.suit,top:S2.top,bottom:S2.bottom,shoes:S2.shoes,headwear:S2.head,glasses:S2.glasses},
      materials:{slots:S2.mat,skin:{tex:S2.skinTex,tone:S2.tone,flat:S2.skin},eye:S2.eye},decals:S2.decal?[S2.decal]:[],groom:null,cloth:null,
      animation:{pose:S2.pose,expression:S2.expr},look:S2,assets:used};
  }
  function validateCharacter(o){
    const e=[];if(!o||o.format!==CHAR_FORMAT)e.push('Not an n0ise character file.');else{if(!(o.version>=1&&o.version<=CHAR_VERSION))e.push('Unsupported character version '+o.version+'.');if(!o.look||typeof o.look!=='object')e.push('The file has no look to load.');
      if(o.decals&&o.decals.some(d=>typeof d.img!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(d.img)))e.push('A decal is not an inline PNG, JPEG or WebP image.');}
    return e;
  }
  async function importCharacter(o){const e=validateCharacter(o);if(e.length)throw new Error(e[0]);load2(o.look);await apply();await outfit();pose(S.pose);expr();return true;}
  makeEyes();await makeMorphs();await apply();await outfit();pose(S.pose);
  return {S,root,body,exportCharacter,importCharacter,validateCharacter,setBoneEuler,applyMaterials,loadDecalFile,setDecal,FABRICS,setBase,setStature,measure,frames:()=>({Rr,Lr,Yax,info:frameInfo}),skeleton,bones,apply,outfit,pose,expr,setSkin,setTone,applySkin,setEye,set,load:load2,man,lib,stats:()=>({helperXfer,proxies:[...active.values()].map(p=>({id:p.id,...p.data.stats}))}),meta:{ageYears:()=>ageYears(S.age)},weights};
}
