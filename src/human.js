/* Human runtime: a properly modelled, rigged person built from the MakeHuman core assets (CC0; see THIRD_PARTY.md and docs/CHARACTER_AUDIT.md).
   The data pack (tools/pack-human.mjs) holds the base mesh, 163-bone skeleton, skin weights and ~560 morph targets as sparse deltas.
   This file is our own code: it blends targets, rebuilds the skeleton to follow the new body, skins the mesh, and derives garments and hair
   from the body so nothing intersects. Shape is baked into the geometry; the face expressions stay real glTF morph targets. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const DEFAULT={gender:.5,age:.5,muscle:.5,weight:.5,height:.5,prop:.5,race:{african:1/3,asian:1/3,caucasian:1/3},detail:{},expr:{},skin:'#c98f6a',skinTex:'auto',tone:1,eye:'#4a3020',
  hair:{style:'short01',color:'#3b2417'},brows:{style:'eyebrow001',color:'#3b2417'},lashes:true,suit:{style:'none',color:'#ffffff'},top:{style:'tee',color:'#c2410c'},bottom:{style:'trousers',color:'#334155'},
  shoes:{style:'sneaker',color:'#f2efe8'},head:{style:'none',color:'#1a1a1a'},glasses:{style:'none',color:'#111111'},neck:{style:'none',color:'#c2410c'},pose:'A-pose',seed:1};
/* procedural options (cut from the body) plus the packed CC0 library (see assets/human/library.json) */
export const STYLE={top:['none','tank','tee','long'],bottom:['none','shorts','trousers'],head:['none','balaclava','beanie','mask','headband'],glasses:['none','sunglasses','round','visor'],neck:['none','scarf'],hairProc:['none','buzz','bun','mohawk']};
const ageW=a=>{const w={baby:0,child:0,young:0,old:0};if(a<.1875){w.baby=1-a/.1875;w.child=a/.1875;}else if(a<.5){w.child=1-(a-.1875)/.3125;w.young=(a-.1875)/.3125;}else{w.young=1-(a-.5)/.5;w.old=(a-.5)/.5;}return w;};
const triW=v=>{const mn=v<.5?1-2*v:0,mx=v>.5?2*v-1:0;return {min:mn,average:1-mn-mx,max:mx};};
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
  const S=structuredClone(DEFAULT);
  const cache=new Map(),inflight=new Map();
  const tfile=n=>base+'t/'+n.replace(/\//g,'~')+'.bin';
  async function load(n){
    if(cache.has(n))return cache.get(n);if(!man.targets[n])return null;
    if(!inflight.has(n))inflight.set(n,fetch(tfile(n)).then(r=>r.arrayBuffer()).then(b=>{const k=man.targets[n].k,k2=k+(k%2);const t={k,ia:new Uint16Array(b,0,k),da:new Int16Array(b,k2*2,k*3)};cache.set(n,t);return t;}));
    return inflight.get(n);
  }
  /* ---- which targets are active, and how strongly, for the current sliders ---- */
  function weights(){
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
  const texLoader=new THREE.TextureLoader();const texCache=new Map();
  const getTex=(url)=>{if(!texCache.has(url)){const t=texLoader.load(url,()=>{try{c.onTex&&c.onTex();}catch(e){}});t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;texCache.set(url,t);}return texCache.get(url);};
  let P=new Float32Array(baseP),yOff=0;
  const Hd=man.bones.map(()=>new THREE.Vector3()),poseQ=new Map();
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
    /* skeleton follows the new body: head positions are averages of the joint vertices, solved at rest, then the pose goes back on */
    bones.forEach((b,i)=>{poseQ.set(b.name,b.quaternion.clone());b.quaternion.identity();const h=avg(man.bones[i].h);Hd[i].set(h[0]*.1,(h[1]+yOff)*.1,h[2]*.1);});
    bones.forEach((b,i)=>{const p=man.bones[i].p;if(p>=0)b.position.copy(Hd[i]).sub(Hd[p]);else b.position.copy(Hd[i]);});
    rig.updateMatrixWorld(true);skeleton.calculateInverses();
    bones.forEach(b=>b.quaternion.copy(poseQ.get(b.name)));rig.updateMatrixWorld(true);
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
    shorts:i=>Math.min(1.4-by(i),by(i)+2.5),
    trousers:i=>Math.min(1.4-by(i),by(i)+7.1),
    sneaker:i=>-7.1-by(i),
    beanie:i=>by(i)-(bz(i)>.6?7.85:Math.max(6.9,7.85-(.6-bz(i))*1.0)),
    balaclava:i=>{const slot=Math.min(.9-bx(i),by(i)-6.95,7.6-by(i),bz(i)-.15);return Math.min(by(i)-6.05,-slot);},
    mask:i=>Math.min(7.0-by(i),by(i)-6.2,bz(i)-.2,2.6-bx(i)),
    headband:i=>Math.min(by(i)-7.7,7.98-by(i)),
    scarf:i=>Math.min(by(i)-5.55,6.6-by(i)),
    cap:i=>by(i)-hairThr(i),
    buzz:i=>by(i)-hairThr(i)-.25
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
  const extras=new THREE.Group();extras.name='Accessories';
  const boneByName=n=>bones[man.bones.findIndex(b=>b.n===n)];
  /* ---- packed CC0 library items (hair, clothes, brows, lashes) fitted to the body ---- */
  const proxies=new Map();const active=new Map(); // slot -> proxy
  async function proxy(id){
    if(proxies.has(id))return proxies.get(id);
    const job=(async()=>{
      const pm=await (await fetch(base+'a/'+id+'.json')).json();if(!pm.nv)return null;
      const buf=await (await fetch(base+'a/'+id+'.bin')).arrayBuffer();
      const A={ia:new Uint16Array(buf,pm.ia,pm.nv),ib:new Uint16Array(buf,pm.ib,pm.nv),ic:new Uint16Array(buf,pm.ic,pm.nv),w:new Float32Array(buf,pm.w,pm.nv*3),off:new Float32Array(buf,pm.off,pm.nv*3),pv:new Uint16Array(buf,pm.pv,pm.n),uv:new Float32Array(buf,pm.uv,pm.n*2),idx:pm.big?new Uint32Array(buf,pm.idx,pm.tris):new Uint16Array(buf,pm.idx,pm.tris)};
      /* skin: blend the weights of the three base vertices each point is bound to, keep the strongest four */
      const si=new Uint16Array(pm.nv*4),sw=new Float32Array(pm.nv*4);
      for(let k=0;k<pm.nv;k++){const acc=new Map(),src=[[A.ia[k],A.w[k*3]],[A.ib[k],A.w[k*3+1]],[A.ic[k],A.w[k*3+2]]];
        for(const [v,wc] of src){if(v>=man.nv)continue;for(let j=0;j<4;j++){const b=bsI[v*4+j],w=bsW[v*4+j]*Math.max(0,wc);if(w>0)acc.set(b,(acc.get(b)||0)+w);}}
        const top=[...acc].sort((x,y)=>y[1]-x[1]).slice(0,4);let t=top.reduce((q,x)=>q+x[1],0);
        if(!top.length){si[k*4]=0;sw[k*4]=1;continue;}
        top.forEach(([b,w],j)=>{si[k*4+j]=b;sw[k*4+j]=w/t;});}
      const g=new THREE.BufferGeometry(),n=pm.n;
      g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv',new THREE.BufferAttribute(A.uv,2));
      const gi=new Uint16Array(n*4),gw=new Float32Array(n*4);for(let i=0;i<n;i++){const k=A.pv[i];for(let j=0;j<4;j++){gi[i*4+j]=si[k*4+j];gw[i*4+j]=sw[k*4+j];}}
      g.setAttribute('skinIndex',new THREE.BufferAttribute(gi,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(gw,4));g.setIndex(new THREE.BufferAttribute(A.idx,1));
      const hairy=pm.kind==='hair'||pm.kind==='eyebrows'||pm.kind==='eyelashes';
      const mat=new THREE.MeshStandardMaterial({roughness:hairy?.55:.85,metalness:0,side:pm.cull&&!hairy?THREE.FrontSide:THREE.DoubleSide,alphaTest:pm.transparent?.4:0,transparent:false});
      if(pm.tex)mat.map=getTex(base+'a/'+pm.tex);
      const m=new THREE.SkinnedMesh(g,mat);m.name=pm.name;m.frustumCulled=false;m.castShadow=pm.kind==='clothes'||pm.kind==='hair';m.receiveShadow=pm.kind==='clothes';m.bind(skeleton,new THREE.Matrix4());
      const dl=new Set();for(const [a,b] of pm.del)for(let v=a;v<=b;v++)dl.add(v);
      return {id,pm,A,m,tmp:new Float32Array(pm.nv*3),del:dl};
    })();
    proxies.set(id,job);return job;
  }
  function proxyUpdate(p){
    const {A,pm,m,tmp}=p,g=m.geometry,pos2=g.attributes.position.array;
    const sc=(k,c)=>{const e=pm.sc[k];if(!e)return 1;return Math.abs(P[e[0]*3+c]-P[e[1]*3+c])/e[2];},sx=sc('x',0),sy=sc('y',1),sz=sc('z',2);
    for(let k=0;k<pm.nv;k++){const a=A.ia[k]*3,b=A.ib[k]*3,c2=A.ic[k]*3,w0=A.w[k*3],w1=A.w[k*3+1],w2=A.w[k*3+2],o=k*3;
      tmp[o]=w0*P[a]+w1*P[b]+w2*P[c2]+A.off[o]*sx;tmp[o+1]=w0*P[a+1]+w1*P[b+1]+w2*P[c2+1]+A.off[o+1]*sy;tmp[o+2]=w0*P[a+2]+w1*P[b+2]+w2*P[c2+2]+A.off[o+2]*sz;}
    for(let i=0;i<pm.n;i++){const k=A.pv[i]*3;pos2[i*3]=tmp[k]*.1;pos2[i*3+1]=(tmp[k+1]+yOff)*.1;pos2[i*3+2]=tmp[k+2]*.1;}
    g.attributes.position.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
  }
  function proxiesUpdate(){for(const p of active.values())if(p)proxyUpdate(p);}
  const fullIdx=idx;
  function bodyHide(){
    const dl=new Set();for(const [slot,p] of active)if(p&&p.pm.kind==='clothes'&&p.m.visible)for(const v of p.del)dl.add(v);
    if(!dl.size){geo.setIndex(new THREE.BufferAttribute(fullIdx,1));return;}
    const out=[];for(let t=0;t<fullIdx.length;t+=3){if(dl.has(vmap[fullIdx[t]])&&dl.has(vmap[fullIdx[t+1]])&&dl.has(vmap[fullIdx[t+2]]))continue;out.push(fullIdx[t],fullIdx[t+1],fullIdx[t+2]);}
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(out),1));
  }
  function tint(p,col){const hairy=p.pm.kind!=='clothes';p.m.material.color.set(col||'#ffffff');}
  const isLib=id=>id&&id!=='none'&&(lib.hair.some(x=>x.id===id)||lib.clothes.some(x=>x.id===id)||lib.eyebrows.some(x=>x.id===id)||lib.eyelashes.some(x=>x.id===id));
  async function slotProxy(slot,id,color){
    const old=active.get(slot);if(old){root.remove(old.m);active.delete(slot);}
    if(!id||id==='none'||!isLib(id))return null;
    const p=await proxy(id);if(!p)return null;
    const again=active.get(slot);if(again){root.remove(again.m);}
    root.add(p.m);active.set(slot,p);tint(p,color);return p;
  }
  let outfitSeq=0;
  async function outfit(){
    const seq=++outfitSeq;
    ['top','bottom','shoes','hair','head','neck'].forEach(clearG);extras.clear();
    const lite=id=>id&&id!=='none'?id:null;
    const wantSuit=isLib(S.suit.style)&&S.suit.style!=='none';
    const covers=S.head.style==='balaclava'||S.head.style==='beanie'||['fedora01','fedora_cocked'].includes(S.head.style);
    /* procedural garments (clipped from the body) */
    if(!wantSuit){const t=S.top.style;if(t!=='none')gm.set('top',garment('Top',REG[t],S.top.color,.0045,.85));
      const b=S.bottom.style;if(b!=='none')gm.set('bottom',garment('Bottom',REG[b],S.bottom.color,.0042,.85));}
    if(S.shoes.style==='sneaker')gm.set('shoes',garment('Shoes',REG.sneaker,S.shoes.color,.007,.5));
    const hs=S.hair.style;
    if(!covers&&hs==='buzz')gm.set('hair',garment('Hair',REG.buzz,S.hair.color,.003,.7));
    const hc=new THREE.MeshStandardMaterial({color:S.hair.color,roughness:.5});
    const add=(m,x,y,z)=>{m.position.set(x,y,z);m.castShadow=true;m.name='Hair';extras.add(m);};
    if(!covers&&hs==='bun')add(new THREE.Mesh(new THREE.SphereGeometry(.05,24,16),hc),0,.14,-.07);
    if(!covers&&hs==='mohawk'){const c=new THREE.Mesh(new THREE.CapsuleGeometry(.025,.26,6,12),hc);c.rotation.x=Math.PI/2;c.scale.set(.5,1,2.2);add(c,0,.145,0);}
    const hd=S.head.style;
    if(hd==='balaclava')gm.set('head',garment('Balaclava',REG.balaclava,S.head.color,.012,.95));
    else if(hd==='beanie')gm.set('head',garment('Beanie',REG.beanie,S.head.color,.02,.95));
    else if(hd==='mask')gm.set('head',garment('Mask',REG.mask,S.head.color,.008,.7));
    else if(hd==='headband')gm.set('head',garment('Headband',REG.headband,S.head.color,.014,.8));
    if(S.neck.style==='scarf')gm.set('neck',garment('Scarf',REG.scarf,S.neck.color,.03,.95));
    /* glasses are small meshes on the eye bones */
    const gs=S.glasses.style;
    if(gs!=='none'){const gmat=new THREE.MeshStandardMaterial({color:S.glasses.color,roughness:.25,metalness:.2}),lens=new THREE.MeshPhysicalMaterial({color:gs==='sunglasses'||gs==='visor'?'#0a0a0a':'#cfe7ff',roughness:.05,transmission:gs==='round'?.85:0,transparent:gs==='round',opacity:gs==='round'?.35:1,clearcoat:1});
      for(const sd of['L','R']){const eb=boneByName('eye.'+sd);
        if(gs==='visor'){const v=new THREE.Mesh(new THREE.BoxGeometry(.05,.026,.006),lens);v.position.set(0,0,.02);v.name='Lens';eb.add(v);extras.userData.g=extras.userData.g||[];}
        else{const geoL=gs==='round'?new THREE.CircleGeometry(.021,28):new THREE.PlaneGeometry(.048,.033),l=new THREE.Mesh(geoL,lens);l.position.set(0,0,.021);l.name='Lens';
          const fr=gs==='round'?new THREE.Mesh(new THREE.TorusGeometry(.021,.0026,8,28),gmat):new THREE.Mesh(new THREE.TorusGeometry(.0245,.0026,8,4),gmat);if(gs!=='round')fr.rotation.z=Math.PI/4,fr.scale.set(1.0,.69,1);fr.position.set(0,0,.021);eb.add(l,fr);}}
      const br=new THREE.Mesh(new THREE.BoxGeometry(.03,.004,.004),gmat);br.name='Bridge';br.userData.bridge=true;boneByName('head').add(br);extras.userData.bridge=br;
      const arms=[];for(const sd of[-1,1]){const a=new THREE.Mesh(new THREE.BoxGeometry(.003,.003,.1),gmat);a.userData.arm=sd;a.name='Temple';boneByName('head').add(a);arms.push(a);}extras.userData.arms=arms;}
    const hb=boneByName('head');if(extras.parent!==hb)hb.add(extras);
    /* library items */
    const [h,b,l,su,sh,hw]=await Promise.all([
      slotProxy('hair',covers?'none':(isLib(hs)?hs:'none'),S.hair.color),
      slotProxy('brows',S.brows.style,S.brows.color),
      slotProxy('lashes',S.lashes?'eyelashes02':'none','#101010'),
      slotProxy('suit',wantSuit?S.suit.style:'none',S.suit.color),
      slotProxy('shoes',isLib(S.shoes.style)?S.shoes.style:'none',S.shoes.color),
      slotProxy('hat',isLib(S.head.style)?S.head.style:'none',S.head.color)
    ]);
    if(seq!==outfitSeq)return;
    bodyHide();rebuild();
  }
  const cleanupGlasses=()=>{};
  function eyesUpdate(){
    const br=extras.userData&&extras.userData.bridge;if(!br)return;
    const eL=boneByName('eye.L'),eR=boneByName('eye.R'),mid=eL.position.clone().add(eR.position).multiplyScalar(.5);br.position.set(mid.x,mid.y+.004,mid.z+.022);br.scale.x=Math.max(.5,Math.abs(eL.position.x-eR.position.x)/.058);
    for(const a of extras.userData.arms||[]){a.position.set(mid.x+a.userData.arm*Math.abs(eL.position.x)*1.05+a.userData.arm*.0,mid.y,mid.z-.025);}
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
    for(const s of['L','R']){const e=new THREE.Mesh(new THREE.SphereGeometry(.0135,32,24),mat);e.position.z=.003;e.name='Eye.'+s;eyes.push(e);boneByName('eye.'+s).add(e);}
  }
  /* ---- expressions as real morph targets ---- */
  async function makeMorphs(){
    const rev=Array.from({length:man.nv},()=>[]);for(let i=0;i<man.n;i++)rev[vmap[i]].push(i);
    const ts=await Promise.all(man.expr.map(n=>load('expression/units/caucasian/'+n)));
    const arrs=[],names=[];
    man.expr.forEach((n,k)=>{const t=ts[k];if(!t)return;const a=new Float32Array(man.n*3);for(let j=0;j<t.k;j++){for(const e of rev[t.ia[j]]){a[e*3]=t.da[j*3]*man.sc*.1;a[e*3+1]=t.da[j*3+1]*man.sc*.1;a[e*3+2]=t.da[j*3+2]*man.sc*.1;}}arrs.push(new THREE.BufferAttribute(a,3));names.push(n);});
    geo.morphAttributes.position=arrs;geo.morphTargetsRelative=true;body.updateMorphTargets();
    names.forEach((n,i)=>{body.morphTargetDictionary[n]=i;});
  }
  function expr(){body.morphTargetInfluences&&body.morphTargetInfluences.fill(0);for(const [k,v] of Object.entries(S.expr)){const i=body.morphTargetDictionary&&body.morphTargetDictionary[k];if(i!=null)body.morphTargetInfluences[i]=clamp(v,0,1);}}
  /* ---- applying ---- */
  let busy=0,again=false;
  async function apply(){
    if(busy){again=true;return;}busy=1;
    try{do{again=false;const W=weights();await Promise.all([...W.keys()].map(load));
      P=new Float32Array(baseP);for(const [n,w] of W){const t=cache.get(n);if(!t)continue;const s=w*man.sc;for(let i=0;i<t.k;i++){const v=t.ia[i]*3,d=i*3;P[v]+=t.da[d]*s;P[v+1]+=t.da[d+1]*s;P[v+2]+=t.da[d+2]*s;}}
      rebuild();applySkin();ground();}while(again);}finally{busy=0;}
    return true;
  }
  function pose(name){
    S.pose=name;bones.forEach(b=>b.quaternion.identity());const p=POSES[name]||{};
    for(const [k,v] of Object.entries(p)){const b=boneByName(k);if(b)b.quaternion.setFromEuler(new THREE.Euler(v[0],v[1],v[2],'XYZ'));}
    rig.updateMatrixWorld(true);ground();
  }
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
  function load2(state){Object.assign(S,structuredClone(DEFAULT),structuredClone(state||{}));if(!isLib(S.hair.style)&&!STYLE.hairProc.includes(S.hair.style))S.hair.style='short01';if(S.shoes.style!=='sneaker'&&!isLib(S.shoes.style))S.shoes.style='sneaker';applySkin();setEye(S.eye);}
  makeEyes();await makeMorphs();await apply();await outfit();pose(S.pose);
  return {S,root,body,skeleton,bones,apply,outfit,pose,expr,setSkin,setTone,applySkin,setEye,set,load:load2,man,lib,meta:{ageYears:()=>ageYears(S.age)},weights};
}
