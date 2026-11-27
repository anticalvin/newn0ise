/* Experimental secondary motion on the live character: guide-strand ponytail (hair-groom.js) and a hem flare driven by the real top garment (cloth-sim.js).
   Both are off by default, run on the CPU within a per-frame budget, reset on pose changes and body-shape changes, and the normal fitted hair and garments stay as the fallback. */
import {makeGroom,makeHairSim,stepHair,rootPoint,renderStrands,QUALITY} from './hair-groom.js';
import {makeCloth,stepCloth,hemStrip} from './cloth-sim.js';

export function createExperimental({THREE,H,scene,bump}){
  const V=THREE.Vector3,q=new THREE.Quaternion(),tmp=new V(),tmp2=new V();
  const boneIdx=n=>H.bones.findIndex(b=>b.name===n);
  const wpos=(n,o=new V())=>H.bones[boneIdx(n)].getWorldPosition(o);
  const state={hair:null,cloth:null,stats:{hairMs:0,clothMs:0,strands:0,simPoints:0}};

  /* ---- hair: scalp triangles on the back and top of the head, roots follow the skinned body ---- */
  function startHair(lod='medium'){
    stopHair();H.pose(H.S.pose);H.root.updateMatrixWorld(true);
    const g=H.body.geometry,pos=g.attributes.position,idx=g.index.array,head=wpos('head'),keep=new Map(),verts=[],tris=[];
    /* rest positions are in the body mesh's own space; the head joint in that space is the inverse bind translation */
    const hi=boneIdx('head'),inv=H.skeleton.boneInverses[hi].clone().invert(),hj=new V().setFromMatrixPosition(inv);
    const ok=i=>{const y=pos.getY(i),z=pos.getZ(i),x=Math.abs(pos.getX(i));return y>hj.y+.045&&y<hj.y+.2&&z<hj.z+.02&&x<.07&&z>hj.z-.13;};
    for(let t=0;t<idx.length;t+=3){const a=idx[t],b=idx[t+1],c=idx[t+2];if(ok(a)&&ok(b)&&ok(c)){for(const v of [a,b,c])if(!keep.has(v)){keep.set(v,verts.length/3);verts.push(v);}tris.push(keep.get(a),keep.get(b),keep.get(c));}}
    if(tris.length<12){console.warn('no scalp found');return false;}
    const scalp={verts:new Float32Array(verts.length),tris:Uint32Array.from(tris),src:verts},groom=makeGroom(scalp,{length:.26,curl:.2,stiffness:.3,seed:H.S.seed||1,lod,color:H.S.hair.color});
    const out=new Float32Array(4096*3*QUALITY.high.segments);
    const line=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:H.S.hair.color==='#ffffff'?'#3b2417':H.S.hair.color}));line.frustumCulled=false;line.name='ExperimentalHair';scene.add(line);
    const anchor={version:H.measure.version,roots:null,
      sync(){const t=new V();for(let i=0;i<scalp.src.length;i++){H.body.getVertexPosition(scalp.src[i],t);t.applyMatrix4(H.body.matrixWorld);scalp.verts[i*3]=t.x;scalp.verts[i*3+1]=t.y;scalp.verts[i*3+2]=t.z;}},
      root:i=>{const o=[0,0,0];return rootPoint(groom,i,scalp.verts,o);},
      dir:()=>{const b=H.bones[hi];b.getWorldQuaternion(q);tmp.set(0,-1,-.4).applyQuaternion(q).normalize();return [tmp.x,tmp.y,tmp.z];},
      rootsFlat(){const f=anchor._f||(anchor._f=new Float32Array(groom.roots.length*3));groom.roots.forEach((_,i)=>f.set(rootPoint(groom,i,scalp.verts,[0,0,0]),i*3));return f;},
      colliders:()=>{const h=wpos('head',tmp),c=h.clone().add(new V(0,.075,.01)),n1=wpos('neck02',tmp2).clone(),s1=wpos('clavicle.L'),s2=wpos('clavicle.R');
        return {spheres:[[c.x,c.y,c.z,.098],[n1.x,n1.y,n1.z,.055]],capsules:[[s1.x,s1.y-.02,s1.z,s2.x,s2.y-.02,s2.z,.075]]};}};
    anchor.sync();state.hair={groom,scalp,anchor,sim:makeHairSim(groom,anchor),line,out,lod};return true;
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
      const pos=h.line.geometry.getAttribute('position');const need=r.strands*(h.sim.m-1)*2*3;if(!pos||pos.array.length<need){h.line.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(need),3).setUsage(THREE.DynamicDrawUsage));}
      const a=h.line.geometry.getAttribute('position').array;let w=0;for(let s=0;s<r.strands;s++)for(let k=0;k<h.sim.m-1;k++){const i=(s*h.sim.m+k)*3;for(let c=0;c<3;c++)a[w++]=h.out[i+c];for(let c=0;c<3;c++)a[w++]=h.out[i+3+c];}
      h.line.geometry.getAttribute('position').needsUpdate=true;h.line.geometry.setDrawRange(0,w/3);state.stats.strands=r.strands;active=true;}
    state.stats.hairMs=performance.now()-t0;
    if(state.cloth){const c=state.cloth,t1=performance.now();stepCloth(c.sim,clothTarget(c),clothColliders(),dt,{version:H.measure.version+':'+H.S.pose,now:()=>performance.now()});
      c.mesh.geometry.getAttribute('position').array.set(c.sim.P);c.mesh.geometry.getAttribute('position').needsUpdate=true;c.mesh.geometry.computeVertexNormals();state.stats.simPoints=c.sim.n;state.stats.clothMs=performance.now()-t1;active=true;}
    if(active)bump();return active;
  }
  return {startHair,stopHair,startCloth,stopCloth,tick,state,dispose(){stopHair();stopCloth();}};
}
