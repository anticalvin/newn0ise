/* n0ise person segmentation worker (off the main thread).
   MediaPipe Tasks Vision 1.2.0 (Apache-2.0), model files pinned to their published version folder, cached with the Cache API.
   Input is an ImageBitmap already capped to a small size by the page. Output is a person-probability mask as bytes. */
const VER='1.2.0',BASE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VER;
const GCS='https://storage.googleapis.com/mediapipe-models/image_segmenter/';
const MODELS={
  selfie:{url:GCS+'selfie_segmenter/float16/1/selfie_segmenter.tflite',mb:0.25},
  multi:{url:GCS+'selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',mb:16}
};
const post=(m,t)=>self.postMessage(m,t||[]);
let seg=null,segKey='',mod=null,busy=false;
async function modelBytes(key){
  const url=MODELS[key].url,c=await caches.open('n0ise-models-v1');
  let r=await c.match(url);
  if(!r){
    const res=await fetch(url);if(!res.ok)throw new Error('model download failed ('+res.status+')');
    const total=+res.headers.get('content-length')||0,rd=res.body.getReader(),parts=[];let got=0;
    for(;;){const {done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;post({type:'progress',p:total?got/total:0,bytes:got});}
    const buf=new Uint8Array(got);let o=0;for(const p of parts){buf.set(p,o);o+=p.length;}
    await c.put(url,new Response(buf));return buf;
  }
  return new Uint8Array(await r.arrayBuffer());
}
async function init(key,delegate){
  if(!mod)mod=await import(BASE+'/vision_bundle.mjs');
  const bytes=await modelBytes(key);
  const files={wasmLoaderPath:BASE+'/wasm/vision_wasm_module_internal.js',wasmBinaryPath:BASE+'/wasm/vision_wasm_module_internal.wasm'};
  const mk=d=>mod.ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetBuffer:bytes,delegate:d},runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false});
  let backend=delegate;
  try{seg=await mk(delegate);}catch(e){if(delegate==='GPU'){backend='CPU';seg=await mk('CPU');}else throw e;}
  segKey=key;return backend;
}
let backend='';
self.onmessage=async e=>{
  const m=e.data;
  try{
    if(m.type==='init'){backend=await init(m.model||'selfie',m.cpu?'CPU':'GPU');post({type:'ready',backend,model:segKey});return;}
    if(m.type==='frame'){
      if(!seg){m.bitmap.close();return;}
      const bm=m.bitmap,w=bm.width,h=bm.height;
      seg.segmentForVideo(bm,m.ts,r=>{
        const cm=r.confidenceMasks;let out=new Uint8Array(w*h);
        if(cm&&cm.length){
          // selfie model: one mask (person); multiclass: index 0 is background, so person = 1 - background
          const f=cm[0].getAsFloat32Array(),multi=segKey==='multi';
          for(let i=0;i<out.length;i++){const v=multi?1-f[i]:f[i];out[i]=v<0?0:v>1?255:Math.round(v*255);}
        }
        if(cm)cm.forEach(x=>x.close());
        post({type:'mask',w,h,data:out,ts:m.ts},[out.buffer]);
      });
      bm.close();
    }
  }catch(err){post({type:'error',message:String(err&&err.message||err)});}
};
