/* Render scene: path-trace the whole 3D scene into a picture, with real light bounces, glass, reflections and soft shadows.
   Uses three-gpu-pathtracer (MIT), loaded only when this opens. It renders a clean copy of the scene on its own canvas,
   so the editor view is untouched. Surface shader effects and screen effects are not part of a path-traced picture. */
export async function openRender(c){
  const {THREE,scene,camera,S,toast,getHdr,aspect}=c;
  let L;
  try{L=await import('three-gpu-pathtracer');}catch(e){toast('Path tracing couldn’t load. It needs a connection the first time.',5000);return null;}
  const ov=document.createElement('div');ov.setAttribute('role','dialog');ov.setAttribute('aria-label','Render scene');
  ov.style.cssText='position:fixed;inset:0;z-index:200;background:#0a0a0c;color:#e8e9ed;display:flex;flex-direction:column;font:600 12px var(--lab,ui-monospace,monospace)';
  const cv=document.createElement('canvas');cv.style.cssText='flex:1;min-height:0;width:100%;object-fit:contain;background:#000';
  const bar=document.createElement('div');bar.style.cssText='padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px));display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#16171b;border-top:1px solid #2b2b2f';
  ov.append(cv,bar);document.body.appendChild(ov);
  const mkb=(t,fn,pri)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.style.cssText='min-height:44px;padding:0 14px;border-radius:12px;border:1px solid '+(pri?'#e9dfcb':'#3a3d46')+';background:'+(pri?'#e9dfcb':'#202228')+';color:'+(pri?'#111':'inherit')+';font:inherit;letter-spacing:.04em;text-transform:uppercase';b.addEventListener('click',fn);return b;};
  const info=document.createElement('span');info.style.cssText='flex:1 1 140px;color:#9a9ca6';
  const opt={q:300,w:(aspect()||1.5)<1?720:1280,blur:0,exp:1,bounces:6};
  const row=(label,vals,key)=>{const w=document.createElement('div');w.style.cssText='display:flex;gap:4px;align-items:center';w.append(label+' ');vals.forEach(([v,l])=>{const b=mkb(l,()=>{opt[key]=v;[...w.querySelectorAll('button')].forEach(x=>x.style.borderColor=x===b?'#e9dfcb':'#3a3d46');if(key==='q')return;start();});b.style.minHeight='36px';b.style.padding='0 10px';if(opt[key]===v)b.style.borderColor='#e9dfcb';w.appendChild(b);});return w;};
  let rn=null,pt=null,proxy=null,run=0,raf=0,pcam=null;
  /* a clean copy of the scene: real materials only, no helpers, gizmos, sky shaders or splats */
  function buildProxy(skin){
    const sc=new THREE.Scene();let n=0,skipped=0;
    scene.updateMatrixWorld(true);
    scene.traverse(o=>{
      if(!o.visible)return;let p=o,hidden=false;while(p){if(p.visible===false){hidden=true;break;}p=p.parent;}if(hidden)return;
      if(o.isLight){
        if(o.isHemisphereLight||o.isAmbientLight||!(o.intensity>0))return;
        const l=o.clone(false);o.matrixWorld.decompose(l.position,l.quaternion,l.scale);l.updateMatrix();
        if(o.target){const t=new THREE.Object3D();o.target.getWorldPosition(t.position);sc.add(t);l.target=t;}
        l.castShadow=false;sc.add(l);return;}
      if(!o.isMesh||o.isSplatMesh||(o.userData&&o.userData.noView))return;
      const ms=Array.isArray(o.material)?o.material:[o.material];
      if(!ms.every(m=>m&&m.isMeshStandardMaterial)){skipped++;return;}
      if(o.isSkinnedMesh&&!skin){skipped++;return;}
      const m=o.clone(false);o.matrixWorld.decompose(m.position,m.quaternion,m.scale);m.updateMatrix();m.matrixAutoUpdate=true;m.visible=true;m.frustumCulled=false;sc.add(m);n++;
    });
    return {sc,n,skipped};
  }
  function stop(){cancelAnimationFrame(raf);run++;}
  async function start(){
    stop();const my=run;
    try{if(pt){pt.dispose();pt=null;}if(rn){rn.dispose();}}catch(e){}
    info.textContent='Preparing the scene…';
    const W=opt.w,H=Math.max(2,Math.round(W/(aspect()||1.5)));
    cv.width=W;cv.height=H;
    rn=new THREE.WebGLRenderer({canvas:cv,antialias:false,preserveDrawingBuffer:true});rn.setPixelRatio(1);rn.setSize(W,H,false);rn.toneMapping=THREE.ACESFilmicToneMapping;rn.toneMappingExposure=opt.exp;rn.outputColorSpace=THREE.SRGBColorSpace;
    let b=buildProxy(true);
    const env=getHdr&&getHdr();let ge=null;
    if(!env){ge=new L.GradientEquirectTexture();ge.topColor.set('#dfe6f2');ge.bottomColor.set('#1d1e23');ge.update();}
    const mk=bp=>{
      bp.sc.environment=env||ge;bp.sc.environmentIntensity=S.env==null?1:Math.max(.05,S.env);
      const bg=scene.background;bp.sc.background=bg&&bg.isColor?bg.clone():new THREE.Color('#101114');
      pcam=new L.PhysicalCamera(camera.fov,W/H,camera.near,camera.far);pcam.position.copy(camera.position);pcam.quaternion.copy(camera.quaternion);pcam.updateMatrixWorld(true);
      const d=camera.position.distanceTo(c.target||new THREE.Vector3());pcam.focusDistance=Math.max(.1,d);pcam.fStop=16-opt.blur*14.6;pcam.apertureBlades=0;
      pt=new L.WebGLPathTracer(rn);pt.bounces=opt.bounces;pt.filterGlossyFactor=.4;pt.tiles.set(2,2);pt.minSamples=1;pt.setScene(bp.sc,pcam);
    };
    try{mk(b);}catch(e){
      try{b=buildProxy(false);mk(b);toast('Skinned characters were left out of the render.',4000);}catch(e2){console.warn(e2);info.textContent='This scene can’t be path traced here.';return;}}
    proxy=b;
    const tick=()=>{if(my!==run)return;
      if(pt.samples<opt.q){pt.renderSample();info.textContent=Math.floor(pt.samples)+' / '+opt.q+' samples · '+proxy.n+' meshes'+(proxy.skipped?' · '+proxy.skipped+' left out':'');raf=requestAnimationFrame(tick);}
      else info.textContent='Done · '+opt.q+' samples';};
    raf=requestAnimationFrame(tick);
  }
  function close(){stop();try{pt&&pt.dispose();}catch(e){}try{rn&&(rn.dispose(),rn.forceContextLoss());}catch(e){}ov.remove();}
  const save=()=>cv.toBlob(b=>{if(!b)return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='n0ise-render.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('Render saved');});
  bar.append(row('Quality',[[100,'Draft'],[300,'Good'],[800,'Fine']],'q'),row('Size',[[720,'Phone'],[1280,'HD'],[1920,'Large']],'w'));
  const sl=(label,key,min,max,step,again)=>{const w=document.createElement('label');w.style.cssText='display:flex;gap:6px;align-items:center;min-height:36px';w.append(label);const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=opt[key];i.style.width='90px';i.addEventListener('change',()=>{opt[key]=+i.value;start();});w.appendChild(i);return w;};
  bar.append(sl('Blur','blur',0,1,.05),sl('Light','exp',.4,3,.05),info,mkb('Restart',()=>start()),mkb('Stop',()=>{stop();info.textContent='Stopped at '+(pt?Math.floor(pt.samples):0)+' samples';}),mkb('Save PNG',save,true),mkb('Close',close));
  start();
  return {close};
}
