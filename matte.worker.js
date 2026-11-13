/* n0ise studio: subject matting worker (off the main thread).
   Models, both permissive, run through Transformers.js 4.3.2:
     modnet    Xenova/modnet                       Apache-2.0  small, fast, portraits
     birefnet  onnx-community/BiRefNet_lite-ONNX   MIT         general subjects, 1024 px input
   WebGPU when available, otherwise WASM. Input is an RGBA buffer already capped at 1024 px on the long side. */
const TF_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
const SPEC={
  modnet:{repo:'Xenova/modnet',rev:'fa2fa546052fba4c08921230a26cc69a333fca12',gpu:'fp32',cpu:'q8'},
  birefnet:{repo:'onnx-community/BiRefNet_lite-ONNX',rev:'de15b22ba131738a16dff04aab8bdf8dc32e3ac1',gpu:'fp16',cpu:'fp32'}
};
const ORT_BASE='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const RAW={ // plain onnxruntime-web models, own pre/post-processing
  u2netp:{url:'https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8/onnx/model.onnx',size:320},
  u2net:{url:'https://huggingface.co/BritishWerewolf/U-2-Net/resolve/c08042b462485d8597c89d3ce831d00be8582c5c/onnx/model.onnx',size:320}
};
let tf=null,ort=null;const cache={};
const post=(m,t)=>self.postMessage(m,t||[]);

async function load(id,key,forceCpu){
  if(cache[key]&&!(forceCpu&&cache[key].backend==='webgpu'))return cache[key];
  if(!tf){tf=await import(TF_URL);tf.env.allowLocalModels=false;}
  const sp=SPEC[key],progress_callback=p=>{if(p&&p.progress!=null)post({type:'progress',id,p:p.progress/100,status:p.status||''});};
  const proc=await tf.AutoProcessor.from_pretrained(sp.repo,{revision:sp.rev,progress_callback});
  const mk=(device,dtype)=>tf.AutoModel.from_pretrained(sp.repo,{revision:sp.rev,device,dtype,progress_callback});
  let model,backend;
  if(!forceCpu&&self.navigator&&navigator.gpu){try{model=await mk('webgpu',sp.gpu);backend='webgpu';}catch(e){model=null;}}
  if(!model){model=await mk('wasm',sp.cpu);backend='wasm';}
  return cache[key]={model,proc,backend};
}

async function loadRaw(id,key){
  if(cache[key])return cache[key];
  if(!ort){ort=await import(ORT_BASE+'ort.wasm.min.mjs');ort.env.wasm.wasmPaths=ORT_BASE;ort.env.wasm.numThreads=1;}
  const res=await fetch(RAW[key].url),total=+res.headers.get('content-length')||0,rd=res.body.getReader(),parts=[];let got=0;
  for(;;){const {done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;if(total)post({type:'progress',id,p:got/total,status:'loading'});}
  const buf=new Uint8Array(got);let o=0;for(const p of parts){buf.set(p,o);o+=p.length;}
  const session=await ort.InferenceSession.create(buf,{executionProviders:['wasm']});
  return cache[key]={session,backend:'wasm'};
}
async function runRaw(id,key,rgba,w,h){
  const L=await loadRaw(id,key);post({type:'stage',id,status:'cutting'});
  const S=RAW[key].size,oc=new OffscreenCanvas(w,h);oc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),w,h),0,0);
  const sc=new OffscreenCanvas(S,S),sg=sc.getContext('2d');sg.drawImage(oc,0,0,S,S);
  const d=sg.getImageData(0,0,S,S).data,x=new Float32Array(3*S*S),mean=[.485,.456,.406],std=[.229,.224,.225];
  let mx=1;for(let i=0;i<S*S;i++)mx=Math.max(mx,d[i*4],d[i*4+1],d[i*4+2]);
  for(let i=0;i<S*S;i++)for(let c=0;c<3;c++)x[c*S*S+i]=(d[i*4+c]/mx-mean[c])/std[c];
  const out=await L.session.run({[L.session.inputNames[0]]:new ort.Tensor('float32',x,[1,3,S,S])});
  const y=out[L.session.outputNames[0]].data,data=new Float32Array(S*S);
  let lo=1e9,hi=-1e9;for(let i=0;i<S*S;i++){if(y[i]<lo)lo=y[i];if(y[i]>hi)hi=y[i];}
  for(let i=0;i<S*S;i++)data[i]=(y[i]-lo)/Math.max(1e-6,hi-lo);
  post({type:'done',id,w:S,h:S,data,backend:'wasm'},[data.buffer]);
}
self.onmessage=async e=>{
  const {id,type,rgba,w,h,model:key='modnet',cpu}=e.data;
  if(type!=='run')return;
  try{
    if(RAW[key])return await runRaw(id,key,rgba,w,h);
    let L=await load(id,key,cpu);
    post({type:'stage',id,status:'cutting'});
    const img=new tf.RawImage(new Uint8ClampedArray(rgba),w,h,4).rgb();
    const inp=await L.proc(img),feed=key==='modnet'?{input:inp.pixel_values}:{input_image:inp.pixel_values};
    let out,backend=L.backend;
    try{out=await L.model(feed);}
    catch(err){ // some GPUs lack the storage-buffer limit a model needs: rerun on WASM
      if(L.backend!=='webgpu')throw err;
      L=await load(id,key,true);backend=L.backend;out=await L.model(feed);}
    const t=out.output||out.output_image||out[Object.keys(out)[0]];
    const d=t.dims,oh=d[d.length-2],ow=d[d.length-1],data=Float32Array.from(t.data);
    let lo=1e9,hi=-1e9;for(let i=0;i<data.length;i+=97){if(data[i]<lo)lo=data[i];if(data[i]>hi)hi=data[i];}
    if(lo<-.01||hi>1.01)for(let i=0;i<data.length;i++)data[i]=1/(1+Math.exp(-data[i])); // logits -> probability
    post({type:'done',id,w:ow,h:oh,data,backend},[data.buffer]);
  }catch(err){post({type:'error',id,message:String(err&&err.message||err)});}
};
