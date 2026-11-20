/* Poly Haven models: CC0 glTF furniture, plants, props and more, loaded on demand from their CDN (nothing is bundled).
   https://polyhaven.com/license . The files API lists a .gltf plus its .bin and textures; we point the glTF at those URLs and let the three.js loader parse it. */
const API='https://api.polyhaven.com';
const J=new Map();
const getJSON=u=>{if(!J.has(u))J.set(u,fetch(u).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).catch(e=>{J.delete(u);throw e;}));return J.get(u);};
export const thumb=(id,w=200,h=200)=>'https://cdn.polyhaven.com/asset_img/thumbs/'+id+'.png?width='+w+'&height='+h;
export async function modelList(){
  const j=await getJSON(API+'/assets?t=models');
  return Object.entries(j).map(([id,v])=>({id,name:v.name,cats:(v.categories||[]).filter(c=>!/^collection/.test(c)),tags:v.tags||[],au:Object.keys(v.authors||{}).join(', ')}));
}
export async function loadModel(loader,id,res='1k'){
  const f=await getJSON(API+'/files/'+id);
  const set=f.gltf&&(f.gltf[res]||f.gltf['1k']||f.gltf['2k']||Object.values(f.gltf)[0]);
  const g=set&&set.gltf;if(!g)throw new Error('no model file');
  const j=await (await fetch(g.url)).json(),inc=g.include||{};
  const fix=u=>(u&&inc[u]&&inc[u].url)||u;
  (j.buffers||[]).forEach(b=>{if(b.uri)b.uri=fix(b.uri);});(j.images||[]).forEach(i=>{if(i.uri)i.uri=fix(i.uri);});
  const gltf=await new Promise((ok,no)=>loader.parse(JSON.stringify(j),'',ok,no));
  const root=gltf.scene;
  root.traverse(n=>{if(n.isMesh&&n.material){(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(m.map)m.map.anisotropy=8;});}});
  return root;
}
