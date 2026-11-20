/* Smaller GLB files with glTF Transform (MIT, https://github.com/donmccurdy/glTF-Transform), loaded only when "Scene → smaller GLB" is used.
   Steps: dedup (identical accessors, materials, textures), prune (unused data), weld (shared vertices: the exporter writes every triangle's corners separately),
   quantize (16-bit positions and 8-bit normals via KHR_mesh_quantization, read by three.js, Blender and other current viewers). Typical result: 4 to 7 times smaller.
   The original export stays one tap away; if anything here fails, the original file is delivered instead. */
const V='4.5.1';
let libs=null;
async function load(){
  if(!libs)libs=Promise.all([import('https://cdn.jsdelivr.net/npm/@gltf-transform/core@'+V+'/+esm'),import('https://cdn.jsdelivr.net/npm/@gltf-transform/functions@'+V+'/+esm')]).catch(e=>{libs=null;throw e;});
  return libs;
}
export async function optimizeGLB(buf,{quantize=true}={}){
  const [core,fn]=await load();
  const io=new core.WebIO(),doc=await io.readBinary(new Uint8Array(buf));
  const steps=[fn.dedup(),fn.prune(),fn.weld({tolerance:1e-4})];if(quantize)steps.push(fn.quantize());
  await doc.transform(...steps);
  const out=await io.writeBinary(doc);
  return out.byteLength<buf.byteLength?out:new Uint8Array(buf);
}
