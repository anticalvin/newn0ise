/* Experimental secondary motion on the live character: guide-strand ponytail (hair-groom.js) and a hem flare driven by the real top garment (cloth-sim.js).
   Both are off by default, run on the CPU within a per-frame budget, reset on pose changes and body-shape changes, and the normal fitted hair and garments stay as the fallback. */
import {makeGroom,makeHairSim,stepHair,rootPoint,renderStrands,QUALITY} from './hair-groom.js';
import {makeCloth,stepCloth,hemStrip} from './cloth-sim.js';

export function createExperimental({THREE,H,scene,bump,camera}){
  const V=THREE.Vector3,q=new THREE.Quaternion(),tmp=new V(),tmp2=new V();
  const boneIdx=n=>H.bones.findIndex(b=>b.name===n);
  const wpos=(n,o=new V())=>H.bones[boneIdx(n)].getWorldPosition(o);
  /* the head's centre, turned with the head: the offset is in rest-world axes, so it is rotated by the head's pose rotation (world rotation times the inverse rest frame) */
  const qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
  function headCentre(o=new V()){const hi=boneIdx('head'),b=H.bones[hi];b.getWorldPosition(o);b.getWorldQuaternion(qa);qb.copy(H.frames().Rr[hi]).invert();qa.multiply(qb);return o.add(tmp2.set(0,.075,.01).applyQuaternion(qa));}
  const state={hair:null,cloth:null,stats:{hairMs:0,clothMs:0,strands:0,simPoints:0}};

  /* ---- hair: scalp triangles of the real body mesh, roots follow the skinned body. Styles are data: which part of the scalp grows hair, how long, how stiff,
     how it leaves the scalp (out) before gravity takes over, and whether the strands are tied to one gather point (pony, bun, braid). Offsets are metres in the head's rest space. ---- */
  const STYLES={
    ponytail:{label:'Ponytail',width:.0036,spread:1,region:{y0:.04,y1:.2,zmax:.02,zmin:-.14,x:.08},length:.30,curl:.1,stiffness:.25,clump:.35,out:.3,gather:[0,.065,-.125],gravity:1,side:0},
    'low ponytail':{label:'Low ponytail',width:.0036,spread:1,region:{y0:.03,y1:.2,zmax:.02,zmin:-.14,x:.085},length:.34,curl:.08,stiffness:.25,clump:.55,out:.3,gather:[0,-.005,-.13],gravity:1,side:0},
    long:{label:'Long',region:{y0:.03,y1:.2,zmax:.03,zmin:-.14,x:.098},length:.44,curl:.1,stiffness:.04,clump:.2,out:.1,gravity:1.7,side:.9},
    bob:{label:'Bob',region:{y0:.03,y1:.2,zmax:.03,zmin:-.14,x:.098},length:.21,curl:.1,stiffness:.1,clump:.25,out:.15,gravity:1.7,side:.9},
    curly:{label:'Curly',region:{y0:.04,y1:.2,zmax:.045,zmin:-.14,x:.098},length:.2,curl:.9,stiffness:.5,clump:.15,out:.6,gravity:.7,spread:1,side:.5},
    pixie:{label:'Pixie',width:.003,region:{y0:.05,y1:.2,zmax:.05,zmin:-.14,x:.095},length:.075,curl:.2,stiffness:.7,clump:.2,out:.55,gravity:.9,side:.3},
    bun:{label:'Bun',width:.004,spread:1,region:{y0:.04,y1:.2,zmax:.02,zmin:-.14,x:.075},length:.3,curl:.9,stiffness:.3,clump:.3,out:.3,gather:[0,.11,-.085],gravity:.35,side:0},
    braid:{label:'Braid',width:.0048,spread:.3,region:{y0:.03,y1:.2,zmax:.02,zmin:-.14,x:.075},length:.42,curl:0,stiffness:.5,clump:.9,out:.3,gather:[0,.0,-.13],gravity:1,side:0},
    mohawk:{label:'Mohawk',region:{y0:.06,y1:.2,zmax:.05,zmin:-.12,x:.016},length:.11,curl:0,stiffness:.95,clump:.6,out:1,up:true,gravity:.08,side:0}
  };
  function startHair(lod='medium',styleName='ponytail',over={}){
    stopHair();H.pose(H.S.pose);H.root.updateMatrixWorld(true);const ST={...(STYLES[styleName]||STYLES.ponytail),...over};
    const g=H.body.geometry,pos=g.attributes.position,idx=g.index.array,keep=new Map(),verts=[],tris=[];
    /* rest positions are in the body mesh's own space; the head joint in that space is the inverse bind translation */
    const hi=boneIdx('head'),inv=H.skeleton.boneInverses[hi].clone().invert(),hj=new V().setFromMatrixPosition(inv),R=ST.region;
    const ok=i=>{const y=pos.getY(i),z=pos.getZ(i),x=Math.abs(pos.getX(i));return y>hj.y+R.y0&&y<hj.y+R.y1&&z<hj.z+R.zmax&&x<R.x&&z>hj.z+R.zmin;};
    for(let t=0;t<idx.length;t+=3){const a=idx[t],b=idx[t+1],c=idx[t+2];if(ok(a)&&ok(b)&&ok(c)){for(const v of [a,b,c])if(!keep.has(v)){keep.set(v,verts.length);verts.push(v);}tris.push(keep.get(a),keep.get(b),keep.get(c));}}
    if(tris.length<12){console.warn('no scalp found');return false;}
    const scalp={verts:new Float32Array(verts.length*3),tris:Uint32Array.from(tris),src:verts},groom=makeGroom(scalp,{length:ST.length,curl:ST.curl,stiffness:ST.stiffness,clump:ST.clump,seed:H.S.seed||1,lod,color:H.S.hair.color,gravity:ST.gravity,gather:!!ST.gather,spread:ST.spread??.5});
    /* the gather point is a real body vertex near the chosen spot: it follows the skinned head, so a ponytail turns and nods with it */
    let gv=-1;if(ST.gather){let best=1e9;const tgt=new V(hj.x+ST.gather[0],hj.y+ST.gather[1],hj.z+ST.gather[2]);for(let i=0;i<H.man.nvBody&&i<pos.count;i++){const d=tgt.distanceToSquared(new V(pos.getX(i),pos.getY(i),pos.getZ(i)));if(d<best){best=d;gv=i;}}}
    const out=new Float32Array(4096*3*QUALITY.high.segments),gp=new V(),gn=new V(),hc=new V();
    const mat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}),m0=groom.segments+1,maxS=groom.roots.length*(1+groom.followers),geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(maxS*m0*2*3),3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(maxS*m0*2*3),3).setUsage(THREE.DynamicDrawUsage));
    {const ix=new Uint32Array(maxS*(m0-1)*6);let w=0;for(let s2=0;s2<maxS;s2++)for(let k=0;k<m0-1;k++){const a=(s2*m0+k)*2;ix[w++]=a;ix[w++]=a+1;ix[w++]=a+2;ix[w++]=a+1;ix[w++]=a+3;ix[w++]=a+2;}geo.setIndex(new THREE.BufferAttribute(ix,1));}
    const line=new THREE.Mesh(geo,mat);line.frustumCulled=false;line.name='ExperimentalHair';scene.add(line);
    const tint=H.S.hair.color==='#ffffff'?'#3b2417':H.S.hair.color,base=new THREE.Color(tint);
    const anchor={version:H.measure.version,roots:null,
      sync(){const t=new V();for(let i=0;i<scalp.src.length;i++){H.body.getVertexPosition(scalp.src[i],t);t.applyMatrix4(H.body.matrixWorld);scalp.verts[i*3]=t.x;scalp.verts[i*3+1]=t.y;scalp.verts[i*3+2]=t.z;}
        headCentre(hc);if(gv>=0){H.body.getVertexPosition(gv,gp);gp.applyMatrix4(H.body.matrixWorld);gn.copy(gp).sub(hc).normalize();gp.addScaledVector(gn,.03);}},
      root:i=>{const o=[0,0,0];return rootPoint(groom,i,scalp.verts,o);},
      dir:i=>{const r=rootPoint(groom,i,scalp.verts,[0,0,0]);tmp.set(r[0]-hc.x,r[1]-hc.y,r[2]-hc.z).normalize();
        if(ST.up){tmp.multiplyScalar(.25).add(new V(0,1,0)).normalize();}else{tmp.multiplyScalar(ST.out).add(new V(0,-1,0).multiplyScalar(1-ST.out*.6));if(ST.side){const front=r[2]>hc.z-.01;tmp.x+=Math.sign(r[0]-hc.x||1)*ST.side*(front?1:.25);}tmp.normalize();}return [tmp.x,tmp.y,tmp.z];},
      gather:ST.gather?()=>[gp.x,gp.y,gp.z]:null,
      rootsFlat(){const f=anchor._f||(anchor._f=new Float32Array(groom.roots.length*3));groom.roots.forEach((_,i)=>f.set(rootPoint(groom,i,scalp.verts,[0,0,0]),i*3));return f;},
      colliders:()=>{const c=headCentre(new V()),n1=wpos('neck02',new V()),s1=wpos('clavicle.L'),s2=wpos('clavicle.R');
        return {spheres:[[c.x,c.y,c.z,.098],[n1.x,n1.y,n1.z,.055]],capsules:[[s1.x,s1.y-.02,s1.z,s2.x,s2.y-.02,s2.z,.075]]};}};
    anchor.sync();state.hair={groom,scalp,anchor,sim:makeHairSim(groom,anchor),line,out,lod,base,style:styleName,tint,width:ST.width};return true;
  }
  function stopHair(){const h=state.hair;if(!h)return;scene.remove(h.line);h.line.geometry.dispose();h.line.material.dispose();state.hair=null;bump();}

  /* ---- cloth: the lower hem of the real top garment drives a flared strip ---- */
  function startCloth(){
    stopCloth();const top=H.root.children.find(c=>c.name==='Top');if(!top){console.warn('no top garment');return false;}
    H.pose(H.S.pose);H.root.updateMatrixWorld(true);
    const p=top.geometry.attributes.position,n=p.count;let ymin=1e9,cx=0,cz=0;for(let i=0;i<n;i++){ymin=Math.min(ymin,p.getY(i));cx+=p.getX(i);cz+=p.getZ(i);}cx/=n;cz/=n;
    /* the hem ring: for 24 angular bins, the lowest vertex inside the lowest 3 cm */
    const bins=new Array(24).fill(null);for(let i=0;i<n;i++){if(p.getY(i)>ymin+.03)continue;const a=Math.atan2(p.getZ(i)-cz,p.getX(i)-cx),b=Math.floor((a+Math.PI)/(Math.PI*2)*24)%24;if(bins[b]===null||p.getY(i)<p.getY(bins[b]))bins[b]=i;}
    const src=bins.filter(x=>x!==null);if(src.length<12){console.warn('hem ring too sparse');return false;}
    const ringRest=src.map(i=>[p.getX(i),p.getY(i),p.getZ(i)]);
    const strip=hemStrip(ringRest,{drop:.13,rings:5,flare:.3}),sim=makeCloth(strip,{});
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(strip.positions.length),3).setUsage(THREE.DynamicDrawUsage));geo.setIndex(new THREE.BufferAttribute(strip.triangles,1));
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:top.material.color.getHex?top.material.color:'#ffffff',roughness:.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));mesh.frustumCulled=false;mesh.name='ExperimentalHem';scene.add(mesh);
    state.cloth={top,src,strip,sim,mesh,target:new Float32Array(strip.positions.length),version:H.measure.version,rings:strip.rings,cols:src.length};return true;
  }
  function stopCloth(){const c=state.cloth;if(!c)return;scene.remove(c.mesh);c.mesh.geometry.dispose();c.mesh.material.dispose();state.cloth=null;bump();}

  /* the skin's pull for every strip point: ring 0 follows the real hem vertices exactly, lower rings hang below it in the garment's own frame */
  function clothTarget(c){const t=new V(),R=c.cols;
    for(let i=0;i<R;i++){H.body.updateMatrixWorld();c.top.getVertexPosition(c.src[i],t);t.applyMatrix4(c.top.matrixWorld);for(let r=0;r<c.rings;r++){const k=(r*R+i)*3,rest0=c.strip.positions[i*3+1],rest=c.strip.positions[k+1];c.target[k]=t.x+(c.strip.positions[k]-c.strip.positions[i*3]);c.target[k+1]=t.y+(rest-rest0);c.target[k+2]=t.z+(c.strip.positions[k+2]-c.strip.positions[i*3+2]);}}
    return c.target;}
  function clothColliders(){const a=n=>wpos(n,new V()),L=[],caps=[['upperleg01.L','lowerleg01.L',.1],['upperleg01.R','lowerleg01.R',.1],['lowerleg01.L','foot.L',.07],['lowerleg01.R','foot.R',.07]];
    for(const [s,e,r] of caps){const A=a(s),B=a(e);L.push([A.x,A.y,A.z,B.x,B.y,B.z,r]);}const pv=a('root');return {capsules:L,spheres:[[pv.x,pv.y,pv.z,.13]]};}

  function tick(dt){
    if(!state.hair&&!state.cloth)return false;H.root.updateMatrixWorld(true);H.skeleton.update();
    const t0=performance.now();let active=false;
    if(state.hair){const h=state.hair;h.anchor.sync();h.anchor.version=H.measure.version;stepHair(h.sim,h.anchor,dt);const r=renderStrands(h.sim,h.out);
      const g=h.line.geometry,pa=g.getAttribute('position'),ca=g.getAttribute('color'),P=pa.array,C=ca.array,m=h.sim.m,W=h.width||.0026,cp=camera?camera.position:null;let w=0,ci=0;
      for(let s=0;s<r.strands;s++){const j=.8+((Math.imul(s,2654435761)>>>0)%1000)/1000*.4;
        for(let k=0;k<m;k++){const i=(s*m+k)*3,i0=(s*m+Math.max(0,k-1))*3,i1=(s*m+Math.min(m-1,k+1))*3;
          const tx=h.out[i1]-h.out[i0],ty=h.out[i1+1]-h.out[i0+1],tz=h.out[i1+2]-h.out[i0+2];
          const vx=(cp?cp.x:0)-h.out[i],vy=(cp?cp.y:0)-h.out[i+1],vz=(cp?cp.z:5)-h.out[i+2];
          let sx=ty*vz-tz*vy,sy=tz*vx-tx*vz,sz=tx*vy-ty*vx;const sl=Math.hypot(sx,sy,sz)||1,wd=W*(1-.7*k/(m-1))/sl;sx*=wd;sy*=wd;sz*=wd;
          P[w++]=h.out[i]-sx;P[w++]=h.out[i+1]-sy;P[w++]=h.out[i+2]-sz;P[w++]=h.out[i]+sx;P[w++]=h.out[i+1]+sy;P[w++]=h.out[i+2]+sz;
          const f=(.5+.65*k/(m-1))*j;for(let q=0;q<2;q++){C[ci++]=h.base.r*f;C[ci++]=h.base.g*f;C[ci++]=h.base.b*f;}}}
      pa.needsUpdate=true;ca.needsUpdate=true;g.setDrawRange(0,r.strands*(m-1)*6);state.stats.strands=r.strands;active=true;}
    state.stats.hairMs=performance.now()-t0;
    if(state.cloth){const c=state.cloth,t1=performance.now();stepCloth(c.sim,clothTarget(c),clothColliders(),dt,{version:H.measure.version+':'+H.S.pose,now:()=>performance.now()});
      c.mesh.geometry.getAttribute('position').array.set(c.sim.P);c.mesh.geometry.getAttribute('position').needsUpdate=true;c.mesh.geometry.computeVertexNormals();state.stats.simPoints=c.sim.n;state.stats.clothMs=performance.now()-t1;active=true;}
    if(active)bump();return active;
  }
  return {startHair,stopHair,startCloth,stopCloth,tick,state,STYLES,dispose(){stopHair();stopCloth();}};
}
