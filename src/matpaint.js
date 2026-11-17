/* Paint on the model, Substance Painter style: layers with masks. One brush lays down colour, roughness, metal, height and glow together
   into the active layer; layers stack over the object's own material (the base) and are composited into the texture maps.
   Plain canvas 2D plus a ray cast, so there is no extra library. Paint is saved with the project as small PNG files. */
const R=1024;
export const KINDS=[['round','Round'],['soft','Airbrush'],['spray','Spray'],['chalk','Chalk'],['square','Square'],['dots','Dots']];
export const BLENDS=[['source-over','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],['lighter','Add']];
export const BRUSH_PRESETS=[
  ['Paint',{kind:'round',hard:.8,flow:1,size:26,ch:{col:'#e5484d'}}],
  ['Rust',{kind:'chalk',hard:.4,flow:.6,size:34,ch:{col:'#8a3d1c',rou:.95,met:.15,hgt:.42}}],
  ['Gold leaf',{kind:'round',hard:.9,flow:1,size:24,ch:{col:'#ffc34d',rou:.22,met:1}}],
  ['Wet',{kind:'soft',hard:.3,flow:.7,size:40,ch:{rou:.04,col:'#303a4a'}}],
  ['Scratch',{kind:'spray',hard:.9,flow:1,size:8,ch:{col:'#d8d8d8',rou:.3,met:1,hgt:.3}}],
  ['Dirt',{kind:'spray',hard:.3,flow:.35,size:46,ch:{col:'#2b2118',rou:1,met:0}}],
  ['Glow ink',{kind:'soft',hard:.5,flow:.9,size:22,ch:{col:'#101010',em:'#27f5c9'}}],
  ['Emboss',{kind:'soft',hard:.4,flow:.6,size:30,ch:{hgt:.9}}],
  ['Dent',{kind:'soft',hard:.4,flow:.6,size:30,ch:{hgt:.1}}],
  ['Frost',{kind:'spray',hard:.5,flow:.5,size:44,ch:{col:'#e8f6ff',rou:.5,met:0,hgt:.62}}]
];
const CH=['col','rou','met','hgt','em'];
let LID=0;

export function createPainter(c){
  const {THREE,dom,camera,controls,meshesOf,prepare,toast,S,bump}=c;
  const B={on:false,kind:'round',size:26,hard:.7,flow:.8,mirror:false,erase:false,target:'layer',ch:{col:'#e5484d',rou:.5,met:0,hgt:.7,em:'#27f5c9'},use:{col:true,rou:false,met:false,hgt:false,em:false}};
  const ray=new THREE.Raycaster(),v2=new THREE.Vector2();
  const masks=new Map();let tmp=null,tmpL=null;
  const cvs=()=>{const x=document.createElement('canvas');x.width=x.height=R;return x;};
  const grey=g=>{const n=Math.round(Math.max(0,Math.min(1,g))*255);return 'rgb('+n+','+n+','+n+')';};

  /* ---- layer bookkeeping (object level, shared by every material set) ---- */
  function meta(o){
    const P=o.paint||(o.paint={sets:{},undo:[],pending:null});
    if(!P.meta){const id='L'+(++LID);P.meta={layers:[{id,name:'Layer 1',vis:true,op:1,blend:'source-over',mask:false}],active:id};}
    return P.meta;
  }
  const activeL=o=>{const m=meta(o);return m.layers.find(l=>l.id===m.active)||m.layers[0];};
  function addLayer(o){const m=meta(o),id='L'+(++LID);m.layers.push({id,name:'Layer '+(m.layers.length+1),vis:true,op:1,blend:'source-over',mask:false});m.active=id;return id;}
  function delLayer(o,id){const m=meta(o);if(m.layers.length<2){toast('Keep at least one layer.');return;}m.layers=m.layers.filter(l=>l.id!==id);Object.values(o.paint.sets).forEach(s=>delete s.layers[id]);if(m.active===id)m.active=m.layers[m.layers.length-1].id;composeAll(o);}
  function moveLayer(o,id,d){const a=meta(o).layers,i=a.findIndex(l=>l.id===id),j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];composeAll(o);}
  function addMask(o,id){const l=meta(o).layers.find(x=>x.id===id);if(l){l.mask=true;Object.values(o.paint.sets).forEach(s=>{const sl=lay(s,id);if(!sl.mask){sl.mask=cvs();const g=sl.mask.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,R,R);}});}}
  function delMask(o,id){const l=meta(o).layers.find(x=>x.id===id);if(l){l.mask=false;Object.values(o.paint.sets).forEach(s=>{const sl=s.layers[id];if(sl){sl.mask=null;sl.maskUsed=false;}});if(B.target!=='layer')B.target='layer';composeAll(o);}}
  const lay=(s,id)=>s.layers[id]||(s.layers[id]={cv:{},mask:null,used:{},maskUsed:false});
  const layCv=(s,id,k)=>{const L=lay(s,id);if(!L.cv[k])L.cv[k]=cvs();return L.cv[k];};

  /* ---- brush masks ---- */
  function mask(kind,hard){
    const key=kind+'|'+Math.round(hard*8);if(masks.has(key))return masks.get(key);
    const M=128,m=document.createElement('canvas');m.width=m.height=M;const g=m.getContext('2d');
    if(kind==='round'||kind==='soft'){const h=kind==='soft'?hard*.35:hard*.92,gr=g.createRadialGradient(M/2,M/2,M/2*h,M/2,M/2,M/2);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,M,M);}
    else if(kind==='square'){g.fillStyle='#000';const e=Math.round((1-hard)*M*.18);g.filter=e?'blur('+e+'px)':'none';g.fillRect(M*.14,M*.14,M*.72,M*.72);}
    else{const n=kind==='dots'?9:kind==='chalk'?900:520;
      for(let i=0;i<n;i++){const a=Math.random()*6.283,d=Math.sqrt(Math.random())*M*.48,x=M/2+Math.cos(a)*d,y=M/2+Math.sin(a)*d;
        const r=kind==='dots'?M*(.04+Math.random()*.07):kind==='chalk'?1+Math.random()*3:.6+Math.random()*1.6;
        const f=1-Math.pow(d/(M*.48),2-hard);g.fillStyle='rgba(0,0,0,'+(kind==='dots'?1:Math.max(.12,f))+')';g.beginPath();g.arc(x,y,r,0,6.283);g.fill();}}
    masks.set(key,m);return m;
  }

  /* ---- per-material sets: base maps + the layers ---- */
  const fromImg=(src,ctx,ch)=>{try{ctx.drawImage(src,0,0,R,R);if(ch==null)return;const id=ctx.getImageData(0,0,R,R),d=id.data;for(let i=0;i<d.length;i+=4){const v=d[i+ch];d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}ctx.putImageData(id,0,0);}catch(e){}};
  const keyOf=(o,m)=>{let i=0;for(const n of meshesOf(o)){const l=Array.isArray(n.material)?n.material:[n.material];const j=l.indexOf(m);if(j>=0)return i+'.'+j;i++;}return m.uuid;};
  function ensureSet(o,m){
    const P=o.paint||(o.paint={sets:{},undo:[],pending:null});meta(o);const key=keyOf(o,m);let s=P.sets[key];
    if(s&&s.tex.col&&s.tex.col===m.map)return s;
    const old=s;s={key,cv:{},cx:{},base:{},tex:{},layers:old?old.layers:{},lm:P.meta.layers};
    CH.forEach(k=>{s.cv[k]=cvs();s.cx[k]=s.cv[k].getContext('2d');});
    const imgOf=t=>t&&t.image&&(t.image.width||t.image.videoWidth)?t.image:null;
    const mk=k=>{const x=cvs();s.base[k]=x;return x.getContext('2d');};
    {const g=mk('col'),im=imgOf(m.map);g.fillStyle='#ffffff';g.fillRect(0,0,R,R);if(im)try{g.drawImage(im,0,0,R,R);}catch(e){}
      g.globalCompositeOperation='multiply';g.fillStyle='#'+m.color.getHexString();g.fillRect(0,0,R,R);g.globalCompositeOperation='source-over';}
    {const g=mk('rou'),im=imgOf(m.roughnessMap);if(im)fromImg(im,g,1);else{g.fillStyle=grey(m.roughness);g.fillRect(0,0,R,R);}
      if(im&&m.roughness<.999){g.globalCompositeOperation='multiply';g.fillStyle=grey(m.roughness);g.fillRect(0,0,R,R);g.globalCompositeOperation='source-over';}}
    {const g=mk('met'),im=imgOf(m.metalnessMap);if(im)fromImg(im,g,2);else{g.fillStyle=grey(m.metalness);g.fillRect(0,0,R,R);}
      if(im&&m.metalness<.999){g.globalCompositeOperation='multiply';g.fillStyle=grey(m.metalness);g.fillRect(0,0,R,R);g.globalCompositeOperation='source-over';}}
    {const g=mk('hgt'),im=imgOf(m.bumpMap);if(im)fromImg(im,g,0);else{g.fillStyle=grey(.5);g.fillRect(0,0,R,R);}}
    {const g=mk('em'),im=imgOf(m.emissiveMap);g.fillStyle='#000';g.fillRect(0,0,R,R);if(im)try{g.drawImage(im,0,0,R,R);}catch(e){}
      if(!im&&(m.emissive.r+m.emissive.g+m.emissive.b)>.01){g.fillStyle='#'+m.emissive.getHexString();g.fillRect(0,0,R,R);}}
    CH.forEach(k=>{const t=new THREE.CanvasTexture(s.cv[k]);t.anisotropy=8;t.wrapS=t.wrapT=THREE.RepeatWrapping;if(k==='col'||k==='em')t.colorSpace=THREE.SRGBColorSpace;s.tex[k]=t;});
    m.userData.paintOrig=m.userData.paintOrig||{color:m.color.clone(),roughness:m.roughness,metalness:m.metalness,emissive:m.emissive.clone(),emissiveIntensity:m.emissiveIntensity,bumpScale:m.bumpScale};
    m.map=s.tex.col;m.color.set('#ffffff');m.roughnessMap=s.tex.rou;m.roughness=1;m.metalnessMap=s.tex.met;m.metalness=1;
    m.bumpMap=s.tex.hgt;m.bumpScale=2.5;m.emissiveMap=s.tex.em;m.emissive.set('#ffffff');if(!(m.emissiveIntensity>0))m.emissiveIntensity=1;
    m.needsUpdate=true;P.sets[key]=s;
    /* paint loaded from a project file */
    const pend=P.pending&&P.pending[key];
    if(pend){Object.keys(pend).forEach(id=>{const L=lay(s,id),src=pend[id];Object.keys(src.cv||{}).forEach(k=>{const x=layCv(s,id,k);x.getContext('2d').drawImage(src.cv[k],0,0,R,R);L.used[k]=true;});
        if(src.mask){L.mask=cvs();L.mask.getContext('2d').drawImage(src.mask,0,0,R,R);L.maskUsed=true;}});delete P.pending[key];}
    P.meta.layers.forEach(l=>{if(l.mask){const L=lay(s,l.id);if(!L.mask){L.mask=cvs();const g=L.mask.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,R,R);}}});
    compose(s,CH);
    return s;
  }
  const matAt=hit=>{const m=hit.object.material;return Array.isArray(m)?m[(hit.face&&hit.face.materialIndex)||0]||m[0]:m;};

  /* ---- compositing: base, then each visible layer through its mask ---- */
  function compose(s,chs){
    const P=currentMeta||null;void P;
    const lm=s.lm;
    chs.forEach(k=>{
      const g=s.cx[k];g.globalCompositeOperation='source-over';g.globalAlpha=1;g.clearRect(0,0,R,R);g.drawImage(s.base[k],0,0);
      (lm||[]).forEach(l=>{if(!l.vis)return;const L=s.layers[l.id];if(!L||!L.cv[k])return;
        let src=L.cv[k];
        if(l.mask&&L.mask){if(!tmpL){tmpL=cvs();}const t=tmpL.getContext('2d');t.globalCompositeOperation='source-over';t.globalAlpha=1;t.clearRect(0,0,R,R);t.drawImage(src,0,0);t.globalCompositeOperation='destination-in';t.drawImage(L.mask,0,0);src=tmpL;}
        g.globalAlpha=l.op;g.globalCompositeOperation=l.blend;g.drawImage(src,0,0);});
      g.globalAlpha=1;g.globalCompositeOperation='source-over';
    });
  }
  let currentMeta=null;
  const syncLm=(o)=>{const m=meta(o);Object.values(o.paint.sets).forEach(s=>{s.lm=m.layers;});};
  function composeAll(o){if(!o||!o.paint)return;syncLm(o);Object.values(o.paint.sets).forEach(s=>{compose(s,CH);CH.forEach(k=>{s.tex[k].needsUpdate=true;});});S.needFrame=true;}

  /* ---- stamping into the active layer (or its mask) ---- */
  function stampOn(target,k,x,y,r,alpha,mode){
    if(!tmp){tmp=document.createElement('canvas');tmp.width=tmp.height=512;}
    const d=Math.max(2,Math.min(512,Math.round(r*2))),t=tmp.getContext('2d'),mk=mask(B.kind,B.hard);
    t.globalCompositeOperation='source-over';t.clearRect(0,0,512,512);
    t.fillStyle=mode==='color'?(k==='col'||k==='em'?B.ch[k]:grey(B.ch[k])):'#fff';t.fillRect(0,0,d,d);
    t.globalCompositeOperation='destination-in';t.drawImage(mk,0,0,d,d);
    const g=target.getContext('2d');g.globalAlpha=alpha;g.globalCompositeOperation=mode==='erase'?'destination-out':'source-over';
    g.drawImage(tmp,0,0,d,d,x-d/2,y-d/2,d,d);g.globalAlpha=1;g.globalCompositeOperation='source-over';
  }
  const chOn=()=>CH.filter(k=>B.use[k]);
  function stampAt(o,s,u,v,p){
    const r=Math.max(2,B.size*R/420*(.6+.4*p)),x=u*R,y=(1-v)*R,a=Math.max(.02,B.flow*(B.kind==='spray'||B.kind==='chalk'?.55:.35));
    const L=activeL(o),lm=meta(o);void lm;
    if(B.target!=='layer'&&L.mask){const Lc=lay(s,L.id);if(!Lc.mask)return r;stampOn(Lc.mask,'m',x,y,r,a,B.target==='hide'?'erase':'reveal');Lc.maskUsed=true;return r;}
    const chs=B.erase?CH:chOn();
    chs.forEach(k=>{const L2=lay(s,L.id);stampOn(layCv(s,L.id,k),k,x,y,r,a,B.erase?'erase':'color');if(!B.erase)L2.used[k]=true;});
    return r;
  }
  function hitAt(o,e){
    const rc=dom.getBoundingClientRect();v2.set((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);
    ray.setFromCamera(v2,camera);return ray.intersectObjects(meshesOf(o),false).find(x=>x.uv)||null;
  }
  function mirrorHit(o,h){
    try{const rootInv=new THREE.Matrix4().copy(o.holder.matrixWorld).invert(),pw=h.point.clone().applyMatrix4(rootInv);pw.x=-pw.x;
      const n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):new THREE.Vector3(0,1,0);const nl=n.clone().transformDirection(rootInv);nl.x=-nl.x;
      const nw=nl.transformDirection(o.holder.matrixWorld).normalize(),pwW=pw.applyMatrix4(o.holder.matrixWorld);
      const box=new THREE.Box3().setFromObject(o.holder),dist=box.getSize(new THREE.Vector3()).length()*.2+.05;
      ray.set(pwW.clone().addScaledVector(nw,dist),nw.clone().negate());return ray.intersectObjects(meshesOf(o),false).find(x=>x.uv)||null;}catch(e){return null;}
  }

  /* ---- strokes ---- */
  let cur=null,last=null,raf=0,dirty=new Map();
  const flush=()=>{raf=0;dirty.forEach((o,s)=>{syncLm(o);compose(s,CH);CH.forEach(k=>{s.tex[k].needsUpdate=true;});});dirty.clear();S.needFrame=true;};
  const mark=(s,o)=>{dirty.set(s,o);if(!raf)raf=requestAnimationFrame(flush);};
  function pushUndo(o,s){
    const L=activeL(o),Lc=lay(s,L.id),snap={s,id:L.id,cv:{},mask:null};
    if(B.target!=='layer'&&Lc.mask){snap.mask=cvs();snap.mask.getContext('2d').drawImage(Lc.mask,0,0);}
    else (B.erase?CH:chOn()).forEach(k=>{const x=cvs();if(Lc.cv[k])x.getContext('2d').drawImage(Lc.cv[k],0,0);snap.cv[k]=x;});
    o.paint.undo.push(snap);if(o.paint.undo.length>6)o.paint.undo.shift();
  }
  function paintHit(o,h,p,prev){
    const m=matAt(h);if(!m||!m.isMeshPhysicalMaterial)return null;const s=ensureSet(o,m);syncLm(o);
    const key=s.key;let r=stampAt(o,s,h.uv.x,h.uv.y,p);
    if(prev&&prev.key===key){const dx=(h.uv.x-prev.u)*R,dy=(h.uv.y-prev.v)*R,dist=Math.hypot(dx,dy);
      if(dist>1&&dist<r*10){const n=Math.min(40,Math.floor(dist/Math.max(1,r*.22)));for(let i=1;i<n;i++){const t=i/n;stampAt(o,s,prev.u+(h.uv.x-prev.u)*t,prev.v+(h.uv.y-prev.v)*t,p);}}}
    mark(s,o);return {key,u:h.uv.x,v:h.uv.y,s};
  }
  let lastM=null;
  function down(e){
    if(!B.on)return;
    if(cur&&e.pointerType==='touch'){cancel();return;}
    if(e.button!==0||e.altKey||(!e.isPrimary&&e.pointerType==='touch'))return;
    const o=c.getObj();if(!o){toast('Pick an object first, or add a shape.');return;}
    if(!prepare(o))return;
    const h=hitAt(o,e);if(!h)return;
    e.stopImmediatePropagation();e.preventDefault();
    try{dom.setPointerCapture(e.pointerId);}catch(_){}
    const m=matAt(h);if(!m||!m.isMeshPhysicalMaterial)return;const s=ensureSet(o,m);pushUndo(o,s);
    cur={o,id:e.pointerId};last=null;lastM=null;
    const pr=e.pointerType==='pen'&&e.pressure?e.pressure:1;
    last=paintHit(o,h,pr);
    if(B.mirror){const mh=mirrorHit(o,h);if(mh)lastM=paintHit(o,mh,pr);}
  }
  function move(e){
    if(!cur||e.pointerId!==cur.id)return;e.stopImmediatePropagation();
    const h=hitAt(cur.o,e);if(!h){last=null;lastM=null;return;}
    const pr=e.pointerType==='pen'&&e.pressure?e.pressure:1;
    last=paintHit(cur.o,h,pr,last);
    if(B.mirror){const mh=mirrorHit(cur.o,h);if(mh)lastM=paintHit(cur.o,mh,pr,lastM);}
  }
  function up(e){if(!cur||e.pointerId!==cur.id)return;e.stopImmediatePropagation();cur=null;last=null;lastM=null;bump();c.onChange&&c.onChange();}
  function cancel(){cur=null;last=null;lastM=null;}
  dom.addEventListener('pointerdown',down,true);dom.addEventListener('pointermove',move,true);
  dom.addEventListener('pointerup',up,true);dom.addEventListener('pointercancel',up,true);

  /* ---- actions ---- */
  const eachSet=(o,f)=>{const P=o&&o.paint;if(!P)return;Object.values(P.sets).forEach(f);};
  function activate(o){ // make sure every material has its set (used after a project loads)
    if(!o||!o.paint)return;if(!prepare(o))return;const seen=new Set();
    meshesOf(o).forEach(n=>{(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(m.isMeshPhysicalMaterial&&!seen.has(m)){seen.add(m);ensureSet(o,m);}});});
    composeAll(o);
  }
  function fill(o){
    if(!prepare(o))return;const L=activeL(o),seen=new Set();
    meshesOf(o).forEach(n=>{(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(!m.isMeshPhysicalMaterial||seen.has(m))return;seen.add(m);const s=ensureSet(o,m);pushUndo(o,s);syncLm(o);
      if(B.target!=='layer'&&L.mask){const g=lay(s,L.id).mask.getContext('2d');g.fillStyle=B.target==='hide'?'#000':'#fff';g.fillRect(0,0,R,R);lay(s,L.id).maskUsed=true;}
      else chOn().forEach(k=>{const g=layCv(s,L.id,k).getContext('2d');g.globalCompositeOperation='source-over';g.globalAlpha=1;g.fillStyle=k==='col'||k==='em'?B.ch[k]:grey(B.ch[k]);g.fillRect(0,0,R,R);lay(s,L.id).used[k]=true;});
      mark(s,o);});});
    bump();
  }
  function undo(o){
    const P=o&&o.paint;if(!P||!P.undo.length){toast('Nothing to undo.');return;}
    const sn=P.undo.pop(),Lc=lay(sn.s,sn.id);
    if(sn.mask&&Lc.mask){const g=Lc.mask.getContext('2d');g.globalCompositeOperation='source-over';g.clearRect(0,0,R,R);g.drawImage(sn.mask,0,0);}
    Object.keys(sn.cv).forEach(k=>{const g=layCv(sn.s,sn.id,k).getContext('2d');g.globalCompositeOperation='source-over';g.globalAlpha=1;g.clearRect(0,0,R,R);g.drawImage(sn.cv[k],0,0);});
    mark(sn.s,o);bump();
  }
  function reset(o){
    eachSet(o,s=>{Object.values(s.layers).forEach(L=>{Object.keys(L.cv).forEach(k=>L.cv[k].getContext('2d').clearRect(0,0,R,R));L.used={};if(L.mask){const g=L.mask.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,R,R);}L.maskUsed=false;});mark(s,o);});
    if(o&&o.paint)o.paint.undo=[];bump();
  }
  function exportPng(o){
    const P=o&&o.paint;if(!P||!Object.keys(P.sets).length){toast('Paint something first.');return;}
    let n=0;const nm=(o.name||'object').replace(/[^\w-]+/g,'_');
    Object.values(P.sets).forEach((s,i)=>CH.forEach(k=>{s.cv[k].toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=nm+(i?'_'+i:'')+'_'+({col:'basecolor',rou:'roughness',met:'metallic',hgt:'height',em:'emissive'})[k]+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);});n++;}));
    toast('Saving '+n+' texture files.');
  }
  /* ---- save and load with the project ---- */
  const hasContent=o=>{const P=o&&o.paint;return !!(P&&Object.values(P.sets).some(s=>Object.values(s.layers).some(L=>Object.keys(L.used).some(k=>L.used[k])||L.maskUsed))||(P&&P.pending));};
  const blobOf=cv=>new Promise(r=>cv.toBlob(b=>b?b.arrayBuffer().then(a=>r(new Uint8Array(a))):r(null),'image/png'));
  async function toFiles(o,prefix){
    if(!hasContent(o))return null;const P=o.paint,files={},refs=[];
    for(const s of Object.values(P.sets))for(const id of Object.keys(s.layers)){const L=s.layers[id],ent={key:s.key,id,ch:[],mask:false};
      for(const k of CH){if(L.used[k]&&L.cv[k]){const f=prefix+'_'+s.key+'_'+id+'_'+k+'.png',u=await blobOf(L.cv[k]);if(u){files[f]=u;ent.ch.push(k);}}}
      if(L.maskUsed&&L.mask){const f=prefix+'_'+s.key+'_'+id+'_mask.png',u=await blobOf(L.mask);if(u){files[f]=u;ent.mask=true;}}
      if(ent.ch.length||ent.mask)refs.push(ent);}
    return {meta:JSON.parse(JSON.stringify(P.meta)),refs,files};
  }
  async function fromFiles(o,info,prefix,get){
    const P=o.paint||(o.paint={sets:{},undo:[],pending:null});P.meta=JSON.parse(JSON.stringify(info.meta));
    P.meta.layers.forEach(l=>{const n=+String(l.id).slice(1);if(n>LID)LID=n;});
    P.pending={};
    for(const r of info.refs){const bag=(P.pending[r.key]=P.pending[r.key]||{})[r.id]={cv:{},mask:null};
      for(const k of r.ch){const u=get(prefix+'_'+r.key+'_'+r.id+'_'+k+'.png');if(u)bag.cv[k]=await createImageBitmap(new Blob([u],{type:'image/png'}));}
      if(r.mask){const u=get(prefix+'_'+r.key+'_'+r.id+'_mask.png');if(u)bag.mask=await createImageBitmap(new Blob([u],{type:'image/png'}));}}
    activate(o);
  }
  function setOn(v){B.on=!!v;dom.style.cursor=B.on?'crosshair':'';if(!B.on)cancel();}
  return {B,setOn,fill,undo,reset,exportPng,activate,toFiles,fromFiles,meta,activeL,addLayer,delLayer,moveLayer,addMask,delMask,composeAll,
    has:o=>!!(o&&o.paint&&Object.keys(o.paint.sets).length),KINDS,BLENDS,BRUSH_PRESETS};
}
