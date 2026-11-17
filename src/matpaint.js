/* Paint on the model, Substance Painter style: one brush lays down colour, roughness, metal, height and glow together,
   straight into the object's texture maps through its UVs. Plain canvas 2D plus a ray cast, so there is no extra library. */
const R=1024;
export const KINDS=[['round','Round'],['soft','Airbrush'],['spray','Spray'],['chalk','Chalk'],['square','Square'],['dots','Dots']];
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

export function createPainter(c){
  const {THREE,dom,camera,controls,meshesOf,prepare,toast,S,bump}=c;
  const B={on:false,kind:'round',size:26,hard:.7,flow:.8,mirror:false,erase:false,ch:{col:'#e5484d',rou:.5,met:0,hgt:.7,em:'#27f5c9'},use:{col:true,rou:false,met:false,hgt:false,em:false}};
  const ray=new THREE.Raycaster(),v2=new THREE.Vector2();
  const masks=new Map();let tmp=null,ring=null;
  const cvs=()=>{const x=document.createElement('canvas');x.width=x.height=R;return x;};
  const grey=g=>{const n=Math.round(Math.max(0,Math.min(1,g))*255);return 'rgb('+n+','+n+','+n+')';};

  /* ---- brush masks ---- */
  function mask(kind,hard){
    const key=kind+'|'+Math.round(hard*8);if(masks.has(key))return masks.get(key);
    const M=128,m=document.createElement('canvas');m.width=m.height=M;const g=m.getContext('2d');
    if(kind==='round'||kind==='soft'){const h=kind==='soft'?hard*.35:hard*.92,gr=g.createRadialGradient(M/2,M/2,M/2*h,M/2,M/2,M/2);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,M,M);}
    else if(kind==='square'){g.fillStyle='#000';const e=Math.round((1-hard)*M*.18);g.filter=e?'blur('+e+'px)':'none';g.fillRect(M*.14,M*.14,M*.72,M*.72);}
    else if(kind==='spray'||kind==='chalk'||kind==='dots'){
      const n=kind==='dots'?9:kind==='chalk'?900:520;
      for(let i=0;i<n;i++){let a=Math.random()*6.283,d=Math.sqrt(Math.random())*M*.48;const x=M/2+Math.cos(a)*d,y=M/2+Math.sin(a)*d;
        const r=kind==='dots'?M*(.04+Math.random()*.07):kind==='chalk'?1+Math.random()*3:.6+Math.random()*1.6;
        const f=1-Math.pow(d/(M*.48),2-hard);g.fillStyle='rgba(0,0,0,'+(kind==='dots'?1:Math.max(.12,f))+')';g.beginPath();g.arc(x,y,r,0,6.283);g.fill();}
    }
    masks.set(key,m);return m;
  }

  /* ---- per-material paint sets ---- */
  const fromImg=(src,ctx,ch)=>{try{ctx.drawImage(src,0,0,R,R);if(ch==null)return;const id=ctx.getImageData(0,0,R,R),d=id.data;for(let i=0;i<d.length;i+=4){const v=d[i+ch];d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}ctx.putImageData(id,0,0);}catch(e){}};
  function ensureSet(o,m){
    const P=o.paint||(o.paint={sets:{},undo:[]});let s=P.sets[m.uuid];
    if(s&&s.tex.col===m.map&&s.tex.col){return s;}
    s={cv:{},cx:{},orig:{},tex:{}};
    CH.forEach(k=>{s.cv[k]=cvs();s.cx[k]=s.cv[k].getContext('2d');});
    const imgOf=t=>t&&t.image&&(t.image.width||t.image.videoWidth)?t.image:null;
    /* colour: the current map times the colour, or just the colour */
    {const g=s.cx.col,im=imgOf(m.map);g.fillStyle='#ffffff';g.fillRect(0,0,R,R);if(im)try{g.drawImage(im,0,0,R,R);}catch(e){}
      g.globalCompositeOperation='multiply';g.fillStyle='#'+m.color.getHexString();g.fillRect(0,0,R,R);g.globalCompositeOperation='source-over';}
    {const g=s.cx.rou,im=imgOf(m.roughnessMap);if(im)fromImg(im,g,1);else{g.fillStyle=grey(m.roughness);g.fillRect(0,0,R,R);}
      if(im&&m.roughness<.999){g.globalCompositeOperation='multiply';g.fillStyle=grey(m.roughness);g.fillRect(0,0,R,R);g.globalCompositeOperation='source-over';}}
    {const g=s.cx.met,im=imgOf(m.metalnessMap);if(im)fromImg(im,g,2);else{g.fillStyle=grey(m.metalness);g.fillRect(0,0,R,R);}
      if(im&&m.metalness<.999){g.globalCompositeOperation='multiply';g.fillStyle=grey(m.metalness);g.fillRect(0,0,R,R);g.globalCompositeOperation='source-over';}}
    {const g=s.cx.hgt,im=imgOf(m.bumpMap);if(im)fromImg(im,g,0);else{g.fillStyle=grey(.5);g.fillRect(0,0,R,R);}}
    {const g=s.cx.em,im=imgOf(m.emissiveMap);g.fillStyle='#000';g.fillRect(0,0,R,R);if(im)try{g.drawImage(im,0,0,R,R);}catch(e){}
      if(!im&&(m.emissive.r+m.emissive.g+m.emissive.b)>.01){g.fillStyle='#'+m.emissive.getHexString();g.fillRect(0,0,R,R);}}
    CH.forEach(k=>{const o2=cvs();o2.getContext('2d').drawImage(s.cv[k],0,0);s.orig[k]=o2;
      const t=new THREE.CanvasTexture(s.cv[k]);t.anisotropy=8;t.wrapS=t.wrapT=THREE.RepeatWrapping;if(k==='col'||k==='em')t.colorSpace=THREE.SRGBColorSpace;s.tex[k]=t;});
    m.userData.paintOrig=m.userData.paintOrig||{color:m.color.clone(),roughness:m.roughness,metalness:m.metalness,emissive:m.emissive.clone(),emissiveIntensity:m.emissiveIntensity,bumpScale:m.bumpScale};
    m.map=s.tex.col;m.color.set('#ffffff');m.roughnessMap=s.tex.rou;m.roughness=1;m.metalnessMap=s.tex.met;m.metalness=1;
    m.bumpMap=s.tex.hgt;m.bumpScale=2.5;m.emissiveMap=s.tex.em;m.emissive.set('#ffffff');if(!(m.emissiveIntensity>0))m.emissiveIntensity=1;
    m.needsUpdate=true;P.sets[m.uuid]=s;return s;
  }
  const matAt=(hit)=>{const m=hit.object.material;return Array.isArray(m)?m[(hit.face&&hit.face.materialIndex)||0]||m[0]:m;};

  /* ---- stamping ---- */
  function stampCh(s,k,x,y,r,alpha,erase){
    if(!tmp){tmp=document.createElement('canvas');tmp.width=tmp.height=512;}
    const d=Math.max(2,Math.min(512,Math.round(r*2))),t=tmp.getContext('2d'),mk=mask(B.kind,B.hard);
    t.globalCompositeOperation='source-over';t.clearRect(0,0,512,512);
    if(erase)t.drawImage(s.orig[k],x-d/2,y-d/2,d,d,0,0,d,d);
    else{t.fillStyle=k==='col'||k==='em'?B.ch[k]:grey(B.ch[k]);t.fillRect(0,0,d,d);}
    t.globalCompositeOperation='destination-in';t.drawImage(mk,0,0,d,d);
    const g=s.cx[k];g.globalAlpha=alpha;
    if(erase){g.globalCompositeOperation='source-over';}
    g.drawImage(tmp,0,0,d,d,x-d/2,y-d/2,d,d);g.globalAlpha=1;
  }
  function channelsOn(){return B.erase?CH.slice():CH.filter(k=>B.use[k]);}
  function stampAt(s,u,v,p){
    const r=Math.max(2,B.size*R/420*(.6+.4*p)),x=u*R,y=(1-v)*R,a=Math.max(.02,B.flow*(B.kind==='spray'||B.kind==='chalk'?.55:.35));
    channelsOn().forEach(k=>stampCh(s,k,x,y,r,a,B.erase));
    return r;
  }
  function hitAt(o,e){
    const rc=dom.getBoundingClientRect();v2.set((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);
    ray.setFromCamera(v2,camera);const ms=meshesOf(o);const h=ray.intersectObjects(ms,false).find(x=>x.uv);return h||null;
  }
  function mirrorHit(o,h){
    try{const inv=new THREE.Matrix4().copy(h.object.matrixWorld).invert(),pl=h.point.clone().applyMatrix4(inv);
      const rootInv=new THREE.Matrix4().copy(o.holder.matrixWorld).invert(),pw=h.point.clone().applyMatrix4(rootInv);pw.x=-pw.x;
      const n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):new THREE.Vector3(0,1,0);const nl=n.clone().transformDirection(rootInv);nl.x=-nl.x;
      const nw=nl.transformDirection(o.holder.matrixWorld).normalize(),pwW=pw.applyMatrix4(o.holder.matrixWorld);
      const box=new THREE.Box3().setFromObject(o.holder),dist=box.getSize(new THREE.Vector3()).length()*.2+.05;
      ray.set(pwW.clone().addScaledVector(nw,dist),nw.clone().negate());return ray.intersectObjects(meshesOf(o),false).find(x=>x.uv)||null;}catch(e){return null;}
  }

  /* ---- strokes ---- */
  let cur=null,last=null,raf=0,dirty=new Set();
  const flush=()=>{raf=0;dirty.forEach(s=>CH.forEach(k=>{s.tex[k].needsUpdate=true;}));dirty.clear();S.needFrame=true;};
  const mark=s=>{dirty.add(s);if(!raf)raf=requestAnimationFrame(flush);};
  function pushUndo(o,s){
    const P=o.paint,snap={s,cv:{}};channelsOn().forEach(k=>{const x=cvs();x.getContext('2d').drawImage(s.cv[k],0,0);snap.cv[k]=x;});
    P.undo.push(snap);if(P.undo.length>6)P.undo.shift();
  }
  function paintHit(o,h,p,lastKey){
    const m=matAt(h);if(!m||!m.isMeshPhysicalMaterial)return null;const s=ensureSet(o,m);
    const key=m.uuid;let r=stampAt(s,h.uv.x,h.uv.y,p);
    if(last&&last.key===key){const dx=(h.uv.x-last.u)*R,dy=(h.uv.y-last.v)*R,dist=Math.hypot(dx,dy);
      if(dist>1&&dist<r*10){const n=Math.min(40,Math.floor(dist/Math.max(1,r*.22)));for(let i=1;i<n;i++){const t=i/n;stampAt(s,last.u+(h.uv.x-last.u)*t,last.v+(h.uv.y-last.v)*t,p);}}}
    mark(s);return {key,u:h.uv.x,v:h.uv.y,s};
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
    if(!cur||e.pointerId!==cur.id)return;
    e.stopImmediatePropagation();
    const h=hitAt(cur.o,e);if(!h){last=null;lastM=null;return;}
    const pr=e.pointerType==='pen'&&e.pressure?e.pressure:1;
    last=paintHit(cur.o,h,pr,last);
    if(B.mirror){const mh=mirrorHit(cur.o,h);if(mh)lastM=paintHit(cur.o,mh,pr);}
  }
  function up(e){if(!cur||e.pointerId!==cur.id)return;e.stopImmediatePropagation();cur=null;last=null;lastM=null;bump();c.onChange&&c.onChange();}
  function cancel(){cur=null;last=null;lastM=null;}
  dom.addEventListener('pointerdown',down,true);dom.addEventListener('pointermove',move,true);
  dom.addEventListener('pointerup',up,true);dom.addEventListener('pointercancel',up,true);

  /* ---- actions ---- */
  function eachSet(o,f){const P=o&&o.paint;if(!P)return;Object.values(P.sets).forEach(f);}
  function fill(o){
    if(!prepare(o))return;
    const ms=meshesOf(o),seen=new Set();
    ms.forEach(n=>{(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(!m.isMeshPhysicalMaterial||seen.has(m))return;seen.add(m);const s=ensureSet(o,m);pushUndo(o,s);
      channelsOn().forEach(k=>{const g=s.cx[k];g.globalAlpha=1;g.fillStyle=k==='col'||k==='em'?B.ch[k]:grey(B.ch[k]);g.fillRect(0,0,R,R);});mark(s);});});
    bump();
  }
  function undo(o){
    const P=o&&o.paint;if(!P||!P.undo.length){toast('Nothing to undo.');return;}
    const sn=P.undo.pop();Object.keys(sn.cv).forEach(k=>{const g=sn.s.cx[k];g.globalCompositeOperation='source-over';g.globalAlpha=1;g.clearRect(0,0,R,R);g.drawImage(sn.cv[k],0,0);});mark(sn.s);bump();
  }
  function reset(o){
    eachSet(o,s=>{CH.forEach(k=>{const g=s.cx[k];g.globalAlpha=1;g.globalCompositeOperation='source-over';g.clearRect(0,0,R,R);g.drawImage(s.orig[k],0,0);});mark(s);});if(o&&o.paint)o.paint.undo=[];bump();
  }
  function exportPng(o){
    const P=o&&o.paint;if(!P||!Object.keys(P.sets).length){toast('Paint something first.');return;}
    let n=0;const nm=(o.name||'object').replace(/[^\w-]+/g,'_');
    Object.values(P.sets).forEach((s,i)=>CH.forEach(k=>{if(k==='em'&&!B.use.em&&!s._em){}
      s.cv[k].toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=nm+(i?'_'+i:'')+'_'+({col:'basecolor',rou:'roughness',met:'metallic',hgt:'height',em:'emissive'})[k]+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);});n++;}));
    toast('Saving '+n+' texture files.');
  }
  function setOn(v){B.on=!!v;dom.style.cursor=B.on?'crosshair':'';if(!B.on)cancel();}
  return {B,setOn,fill,undo,reset,exportPng,has:o=>!!(o&&o.paint&&Object.keys(o.paint.sets).length),KINDS,BRUSH_PRESETS};
}
