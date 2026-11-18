/* three-mesh-bvh (MIT) for picking and surface queries on heavy meshes. n0ise already ships it for the path tracer; here the same pinned copy
   gives picking on big imported models a bounding volume hierarchy. Only meshes with many triangles get one (small ones are faster without),
   and it loads lazily, the first time such a model is added. Sculpting clears the tree for the mesh it edits, because the tree goes stale when vertices move. */
let lib=null;
const tris=g=>(g.index?g.index.count:g.attributes.position?g.attributes.position.count:0)/3;
export async function accelerate(THREE,root,minTris=20000){
  const heavy=[];root.traverse(m=>{if(m.isMesh&&!m.isSkinnedMesh&&m.geometry&&m.geometry.attributes&&m.geometry.attributes.position&&!m.geometry.boundsTree&&tris(m.geometry)>=minTris)heavy.push(m);});
  if(!heavy.length)return 0;
  lib=lib||await import('three-mesh-bvh');
  THREE.Mesh.prototype.raycast=lib.acceleratedRaycast; // falls back to the normal test for meshes without a tree
  for(const m of heavy){try{m.geometry.boundsTree=new lib.MeshBVH(m.geometry);}catch(e){console.warn('BVH skipped',e);}}
  return heavy.length;
}
/* a repeatable measurement: ray picks per second against one dense mesh, with and without the tree */
export async function bench(THREE,detail=60,rays=200){
  const g=new THREE.IcosahedronGeometry(1,detail),m=new THREE.Mesh(g,new THREE.MeshBasicMaterial()),rc=new THREE.Raycaster(),n=tris(g);
  const run=()=>{const t=performance.now();for(let i=0;i<rays;i++){rc.set(new THREE.Vector3((i%20-10)*.08,(Math.floor(i/20)-5)*.08,3),new THREE.Vector3(0,0,-1));rc.intersectObject(m,false);}return (performance.now()-t)/rays;};
  const orig=THREE.Mesh.prototype.raycast;const plain=run();
  const t0=performance.now();await accelerate(THREE,m,1000);const build=performance.now()-t0;const fast=run();
  THREE.Mesh.prototype.raycast=orig;g.dispose();
  return {triangles:n,plainMsPerRay:+plain.toFixed(3),bvhMsPerRay:+fast.toFixed(4),speedup:Math.round(plain/Math.max(fast,1e-4)),buildMs:Math.round(build)};
}
