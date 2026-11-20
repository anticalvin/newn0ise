/* Combine shapes: union, subtract and intersect with Manifold (https://github.com/elalish/manifold, Apache-2.0, WebAssembly).
   Manifold only accepts closed, watertight solids, so every object is welded and checked first; anything with gaps gets a plain explanation.
   The result is a new object; the originals are hidden (not deleted) so nothing is lost and Undo brings them back.
   Loaded on first use (about 80 KB of JS and 540 KB of WebAssembly from the pinned CDN copy). */
import {mergeVertices,toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
const WASM_BASE='https://cdn.jsdelivr.net/npm/manifold-3d@3.5.5/';
let M=null,loading=null;
async function lib(){
  if(M)return M;
  if(!loading)loading=(async()=>{const mod=await import('manifold-3d');const w=await mod.default({locateFile:f=>WASM_BASE+f});w.setup();M=w;return w;})().catch(e=>{loading=null;throw e;});
  return loading;
}
/* geometry <-> bytes, so combined shapes (and sculpts) are saved with the project */
export function geoToBytes(g){
  const p=g.attributes.position,ix=g.index?g.index.array:null,n=p.count,ni=ix?ix.length:0;
  const buf=new ArrayBuffer(8+n*12+ni*4),dv=new DataView(buf);dv.setUint32(0,n,true);dv.setUint32(4,ni,true);
  new Float32Array(buf,8,n*3).set(p.array.subarray(0,n*3));if(ni)new Uint32Array(buf,8+n*12,ni).set(ix);
  return new Uint8Array(buf);
}
export function geoFromBytes(THREE,u8){
  const b=u8.buffer.slice(u8.byteOffset,u8.byteOffset+u8.byteLength),dv=new DataView(b),n=dv.getUint32(0,true),ni=dv.getUint32(4,true);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(b,8,n*3).slice(),3));
  if(ni)g.setIndex(new THREE.BufferAttribute(new Uint32Array(b,8+n*12,ni).slice(),1));
  return finish(THREE,g);
}
function finish(THREE,g){const out=g.index?g.toNonIndexed():g;const r=toCreasedNormals(out,Math.PI/6);r.computeBoundingBox();r.computeBoundingSphere();return r;}

export function createBoolean(c){
  const {THREE,S,objById,registerObject,selectObj,addPrimitive,toast,bump,uPush,renderObjList,markDirty}=c;
  /* all visible meshes of an object, baked into world space, welded, as one Manifold */
  async function toManifold(o){
    const W=await lib();o.holder.updateMatrixWorld(true);
    const parts=[];
    o.holder.traverse(n=>{if(!n.isMesh||n.isSkinnedMesh||!n.visible||!n.geometry||n.userData.live)return;
      const g=n.geometry.clone();for(const k of Object.keys(g.attributes))if(k!=='position')g.deleteAttribute(k);
      g.applyMatrix4(n.matrixWorld);parts.push(g);});
    if(!parts.length)throw new Error('“'+o.name+'” has no solid surface to combine.');
    let acc=null;
    for(const g of parts){
      const w=mergeVertices(g,1e-4),pos=w.attributes.position.array,ix=w.index?w.index.array:null;
      if(!ix)throw new Error('“'+o.name+'” can’t be combined.');
      const mesh=new W.Mesh({numProp:3,vertProperties:Float32Array.from(pos),triVerts:Uint32Array.from(ix)});
      let m;try{mesh.merge();m=new W.Manifold(mesh);}catch(e){throw new Error('“'+o.name+'” has gaps or overlapping faces, so it isn’t a closed solid. Try a basic shape, or fill the holes first.');}
      if(m.isEmpty()){m.delete();throw new Error('“'+o.name+'” has no closed volume.');}
      if(acc){const u=W.Manifold.union(acc,m);acc.delete();m.delete();acc=u;}else acc=m;
    }
    return acc;
  }
  const firstMat=o=>{let m=null;o.holder.traverse(n=>{if(!m&&n.isMesh&&n.material)m=Array.isArray(n.material)?n.material[0]:n.material;});return m;};
  const solids=()=>S.objs.filter(o=>o.vis&&o.kind!=='viz'&&o.kind!=='splat'&&o.kind!=='relief');
  async function run(op,aId,bId,keep){
    const a=objById(aId),b=objById(bId);
    if(!a||!b||a===b){toast('Pick two different shapes first.');return null;}
    let A=null,B=null,R=null;
    try{
      A=await toManifold(a);B=await toManifold(b);
      R=op==='union'?M.Manifold.union(A,B):op==='subtract'?M.Manifold.difference(A,B):M.Manifold.intersection(A,B);
      if(R.isEmpty()){toast(op==='intersect'?'These shapes don’t overlap, so nothing is left.':'Nothing is left after that. Move the shapes so they overlap less.',4500);return null;}
      const mm=R.getMesh(),np=mm.numProp,vp=mm.vertProperties,n=vp.length/np;
      const pos=new Float32Array(n*3);for(let i=0;i<n;i++){pos[i*3]=vp[i*np];pos[i*3+1]=vp[i*np+1];pos[i*3+2]=vp[i*np+2];}
      let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(new THREE.BufferAttribute(Uint32Array.from(mm.triVerts),1));
      g=finish(THREE,g);const cen=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-cen.x,-cen.y,-cen.z);
      const src=firstMat(a),mat=src&&src.clone?src.clone():new THREE.MeshStandardMaterial({color:0xb9b4ac,roughness:.55});mat.transparent=false;mat.opacity=1;
      const mesh=new THREE.Mesh(g,mat);mesh.castShadow=true;mesh.receiveShadow=true;
      try{uPush();}catch(e){}
      const label={union:'Union',subtract:'Cut',intersect:'Overlap'}[op];
      const res=registerObject(label+' '+a.name,mesh,'mesh',{fit:false,meta:{asset:'boolean',customGeo:true,op,from:[a.name,b.name]}});
      res.holder.position.copy(cen);
      if(!keep){for(const o of[a,b]){o.vis=false;o.holder.visible=false;o.meta=o.meta||{};o.meta.hiddenBy=res.id;}}
      selectObj(res.id);renderObjList&&renderObjList();bump();markDirty&&markDirty();try{uPush();}catch(e){}
      toast(label+' done. Undo brings the originals back.',3200);return res;
    }catch(e){console.warn(e);toast(String(e.message||e),6000);return null;}
    finally{for(const x of[A,B,R])try{x&&x.delete();}catch(_){}}
  }
  /* a see-through cutter shape to place where a hole should go */
  function addCutter(kind){
    const o=addPrimitive(kind);o.name='Cutter '+kind.toLowerCase();
    o.root.material=new THREE.MeshStandardMaterial({color:0xff5a1f,transparent:true,opacity:.4,roughness:.6,depthWrite:false});
    const sel=objById(S.sel);
    selectObj(o.id);renderObjList&&renderObjList();bump();return o;
  }
  /* when an undo removes a combined shape, its originals come back */
  function restoreOriginals(removedId){for(const o of S.objs){if(o.meta&&o.meta.hiddenBy===removedId){delete o.meta.hiddenBy;o.vis=true;o.holder.visible=true;}}}
  return {run,addCutter,restoreOriginals,solids,ready:()=>lib()};
}
