/* Material graph editor UI: a 3D preview ball, a pannable and zoomable node canvas, an inspector for the selected node, an add palette and a library.
   Built for a thumb first: ports are 28 px targets, a wire can be dragged or made with two taps, and the inspector is a drawer under the graph. */
import {NODES,CATS,defaults,newGraph,addNode,canConnect,createEval,buildMaps,texturesFor,fillMaterial,toCanvas,TEMPLATES,applyToObject,clearFromObject} from './nodemat.js';
const CSS=`
.nmx{position:fixed;inset:0;z-index:95;display:flex;flex-direction:column;background:var(--bg,#101114);color:var(--ink,#e8e9ed);font:12px/1.4 var(--lab,monospace)}
.nmx button{font:inherit;color:inherit;cursor:pointer}
.nmx .nm-h{flex:none;display:flex;align-items:center;gap:6px;padding:calc(6px + var(--safe-t,0px)) 8px 6px;border-bottom:1px solid var(--line,#2b2b2f)}
.nmx .nm-h b{flex:1;min-width:0;font:800 14px var(--disp,system-ui);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nmx .nm-b{min-height:44px;min-width:44px;padding:0 12px;border:1px solid var(--line,#2b2b2f);background:var(--raise,#1a1a1d);border-radius:12px;font:700 11px var(--lab,monospace);letter-spacing:.06em;text-transform:uppercase}
.nmx .nm-b.pri{background:var(--accent,#ff5a1f);border-color:var(--accent,#ff5a1f);color:var(--on-accent,#150a04)}
.nmx .nm-b:disabled{opacity:.35}
.nmx .nm-b[aria-pressed=true]{background:var(--ink,#e8e9ed);color:var(--bg,#101114)}
.nmx .nm-m{flex:1;min-height:0;display:grid;grid-template-rows:minmax(190px,36%) 1fr}
.nmx .nm-prev{position:relative;min-height:0;background:var(--stage,#0b0c0e);overflow:hidden}
.nmx .nm-prev canvas.pv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.nmx .nm-prev canvas.pn{position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;image-rendering:auto;display:none}
.nmx .nm-prev.node canvas.pn{display:block}.nmx .nm-prev.node canvas.pv{visibility:hidden}
.nmx .nm-pt{position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.nmx .nm-pt button{flex:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line,#2b2b2f);background:color-mix(in srgb,var(--bg,#101114) 78%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font:700 11px var(--lab,monospace)}
.nmx .nm-pt button[aria-pressed=true]{background:var(--ink,#e8e9ed);color:var(--bg,#101114)}
.nmx .nm-g{position:relative;min-height:0;overflow:hidden;touch-action:none;background:var(--ps-canvas,#101114);background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:22px 22px;border-top:1px solid var(--line,#2b2b2f)}
.nmx .nm-vp{position:absolute;left:0;top:0;transform-origin:0 0}
.nmx svg.nm-w{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none}
.nmx svg.nm-w path{fill:none;stroke:#9a9ca6;stroke-width:2.2;opacity:.9}
.nmx svg.nm-w path.tmp{stroke:var(--accent,#ff5a1f);stroke-dasharray:5 4}
.nmx .nm-n{position:absolute;width:158px;border:1px solid var(--line,#373a43);background:var(--panel,#202228);border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.35);user-select:none;-webkit-user-select:none}
.nmx .nm-n[data-sel=true]{border-color:var(--accent,#ff5a1f);box-shadow:0 0 0 1px var(--accent,#ff5a1f),0 6px 18px rgba(0,0,0,.35)}
.nmx .nm-nh{padding:7px 10px 4px;font:700 10px var(--lab,monospace);letter-spacing:.08em;text-transform:uppercase;color:var(--mute,#9a9ca6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nmx .nm-nb{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:0 0 8px}
.nmx .nm-ins{display:flex;flex-direction:column;gap:0;min-width:0}
.nmx .nm-p{display:flex;align-items:center;gap:5px;min-height:28px;min-width:28px;padding:0;border:0;background:none;color:var(--mute,#9a9ca6);font:600 9px var(--lab,monospace);letter-spacing:.06em;text-transform:uppercase;touch-action:none}
.nmx .nm-p i{flex:none;width:13px;height:13px;border-radius:50%;border:2px solid #9a9ca6;background:var(--panel,#202228);margin:0 0 0 -7px}
.nmx .nm-p.out{margin-right:-7px;justify-content:flex-end}.nmx .nm-p.out i{margin:0 0 0 0}
.nmx .nm-p[data-on=true] i{background:#9a9ca6}.nmx .nm-p[data-pend=true] i{border-color:var(--accent,#ff5a1f);background:var(--accent,#ff5a1f)}
.nmx .nm-p.tgt i{border-color:var(--accent,#ff5a1f)}
.nmx canvas.th{width:64px;height:64px;border-radius:8px;background:#000;flex:none;image-rendering:auto}
.nmx .nm-fab{position:absolute;right:12px;top:12px;z-index:3;display:flex;gap:6px}
.nmx .nm-fab .nm-b{box-shadow:0 4px 14px rgba(0,0,0,.4)}
.nmx .nm-hint{position:absolute;left:12px;top:14px;z-index:2;color:var(--mute,#9a9ca6);font-size:10.5px;max-width:48%;pointer-events:none}
.nmx .nm-i{position:absolute;z-index:4;left:8px;right:8px;bottom:8px;max-height:46%;overflow:auto;overscroll-behavior:contain;background:var(--panel,#202228);border:1px solid var(--line,#373a43);border-radius:16px;padding:8px 12px 12px;box-shadow:0 -6px 24px rgba(0,0,0,.4)}
.nmx .nm-i[hidden]{display:none}
.nmx .nm-ih{display:flex;align-items:center;gap:6px;margin-bottom:4px;position:sticky;top:-8px;background:var(--panel,#202228);padding:4px 0;z-index:1}
.nmx .nm-ih b{flex:1;font:800 14px var(--disp,system-ui)}
.nmx .nm-i .row{grid-template-columns:minmax(80px,32%) 1fr 56px}
.nmx .nm-i .chips{flex-wrap:wrap}
.nmx .nm-col{display:flex;align-items:center;justify-content:space-between;min-height:44px;gap:10px;font:600 10.5px var(--lab,monospace);color:var(--mute,#9a9ca6)}
.nmx .nm-col input{width:56px;height:36px;border:1px solid var(--line,#373a43);background:none;border-radius:8px;padding:0}
.nmx .nm-pop{position:fixed;inset:0;z-index:5;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center}
.nmx .nm-pp{width:min(560px,100%);max-height:78%;overflow:auto;background:var(--panel,#202228);border:1px solid var(--line,#373a43);border-radius:20px 20px 0 0;padding:12px 12px calc(14px + var(--safe-b,0px))}
.nmx .nm-pp h4{margin:10px 0 6px;font:700 10px var(--lab,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--mute,#9a9ca6)}
.nmx .nm-pp .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.nmx .nm-pp .grid .nm-b{text-align:left;text-transform:none;letter-spacing:0;font-size:12px}
.nmx .nm-sv{display:flex;gap:6px;margin:6px 0}.nmx .nm-sv input{flex:1;min-width:0;min-height:44px;padding:0 10px;border-radius:12px;border:1px solid var(--line,#373a43);background:var(--raise,#1a1a1d);color:inherit}
.nmx .nm-li{display:flex;gap:6px;align-items:center;margin:4px 0}.nmx .nm-li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
@media (min-width:900px){
  .nmx .nm-m{grid-template-rows:none;grid-template-columns:minmax(300px,34%) 1fr}
  .nmx .nm-i{left:auto;right:12px;top:64px;bottom:12px;width:330px;max-height:none}
  .nmx .nm-hint{max-width:30%}
}
@media (prefers-reduced-motion:reduce){.nmx *{transition:none!important}}
`;
const clone=x=>JSON.parse(JSON.stringify(x));
const LIB='n0.nodemats';
const lib=()=>{try{return JSON.parse(localStorage.getItem(LIB)||'[]');}catch(e){return[];}};
export function openNodeMat(c){
  const {THREE,RoomEnvironment,el,sliderRow,chipRow,toast,o,onApply,onClose}=c;
  if(!document.getElementById('nmx-css')){const s=document.createElement('style');s.id='nmx-css';s.textContent=CSS;document.head.appendChild(s);}
  let g=o&&o.nmat?clone(o.nmat):TEMPLATES[0][1]();
  let sel=null,pend=null,view={x:20,y:20,k:1},raf=0,dirty=true,disposed=false,mode='ball',spin=true;
  const ev=createEval(),thumbs={},T={};
  const hist=[JSON.stringify(g)];let hi=0,ct=0;
  const mk=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};
  const B=(label,cls,fn,aria)=>{const b=mk('button','nm-b '+(cls||''),label);b.type='button';if(aria)b.setAttribute('aria-label',aria);b.addEventListener('click',fn);return b;};
  const root=mk('div','nmx');root.setAttribute('role','dialog');root.setAttribute('aria-label','Material graph');
  /* header */
  const head=mk('div','nm-h');
  const close=B('✕','',()=>shut(),'Close without applying');
  const undoB=B('↶','',()=>undo(),'Undo'),redoB=B('↷','',()=>redo(),'Redo');
  const libB=B('Library','',()=>openLib()),applyB=B('Apply','pri',()=>{onApply&&onApply(clone(g));shut(true);});
  head.append(close,Object.assign(mk('b'),{textContent:'Material'}),undoB,redoB,libB,applyB);
  /* preview */
  const main=mk('div','nm-m'),prev=mk('div','nm-prev'),pv=mk('canvas','pv'),pn=mk('canvas','pn');pn.width=pn.height=256;prev.append(pv,pn);
  const pt=mk('div','nm-pt');
  const shapeB={};[['Ball','sphere'],['Cube','cube'],['Knot','knot'],['Torus','torus'],['Plane','plane']].forEach(([l,k])=>{const b=mk('button','',l);b.type='button';b.setAttribute('aria-pressed',k==='sphere');b.addEventListener('click',()=>{setShape(k);Object.entries(shapeB).forEach(([kk,bb])=>bb.setAttribute('aria-pressed',kk===k));});shapeB[k]=b;pt.appendChild(b);});
  const vb=mk('button','','Node view');vb.type='button';vb.setAttribute('aria-pressed',false);vb.addEventListener('click',()=>{mode=mode==='ball'?'node':'ball';prev.classList.toggle('node',mode==='node');vb.setAttribute('aria-pressed',mode==='node');vb.textContent=mode==='node'?'Back to ball':'Node view';if(mode==='node'&&sel&&sel!=='out')drawNode2D();});pt.appendChild(vb);
  prev.appendChild(pt);
  /* graph */
  const gw=mk('div','nm-g'),vp=mk('div','nm-vp'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','nm-w');vp.appendChild(svg);gw.appendChild(vp);
  const hint=mk('div','nm-hint','Drag a dot to another node to connect. Tap a node to edit it.');gw.appendChild(hint);
  const fab=mk('div','nm-fab');fab.append(B('＋ Add','pri',()=>openAdd()),B('Fit','',()=>fit()));gw.appendChild(fab);
  const insp=mk('div','nm-i');insp.hidden=true;gw.appendChild(insp);
  main.append(prev,gw);root.append(head,main);document.body.appendChild(root);
  /* ---------- 3D preview ---------- */
  let rn=null,sc=null,cam=null,mesh=null,mat=null,rot={x:.25,y:.4},keyL=null;
  try{
    rn=new THREE.WebGLRenderer({canvas:pv,antialias:true});rn.setPixelRatio(Math.min(devicePixelRatio||1,2));rn.outputColorSpace=THREE.SRGBColorSpace;
    sc=new THREE.Scene();cam=new THREE.PerspectiveCamera(34,1,.1,50);cam.position.set(0,0,4.2);
    try{const pm=new THREE.PMREMGenerator(rn);sc.environment=pm.fromScene(new RoomEnvironment(),.04).texture;}catch(e){}
    keyL=new THREE.DirectionalLight(0xffffff,2.2);keyL.position.set(3,4,5);sc.add(keyL,new THREE.HemisphereLight(0xffffff,0x222226,.3));
    mat=new THREE.MeshStandardMaterial({color:'#cccccc'});setShape('sphere');
  }catch(e){prev.appendChild(mk('div','nm-hint','The 3D ball needs WebGL, which isn’t available here. Use Node view to see textures.'));}
  function setShape(k){
    if(!sc)return;if(mesh){sc.remove(mesh);mesh.geometry.dispose();}
    const geo=k==='cube'?new THREE.BoxGeometry(1.7,1.7,1.7):k==='knot'?new THREE.TorusKnotGeometry(.85,.3,220,36):k==='torus'?new THREE.TorusGeometry(.95,.42,48,96):k==='plane'?new THREE.PlaneGeometry(2.6,2.6,1,1):new THREE.SphereGeometry(1.25,96,64);
    mesh=new THREE.Mesh(geo,mat);sc.add(mesh);dirty=true;
  }
  let pd=null,zk=1;
  pv.addEventListener('pointerdown',e=>{pd={x:e.clientX,y:e.clientY};spin=false;pv.setPointerCapture(e.pointerId);});
  pv.addEventListener('pointermove',e=>{if(!pd)return;rot.y+=(e.clientX-pd.x)*.01;rot.x=Math.max(-1.4,Math.min(1.4,rot.x+(e.clientY-pd.y)*.01));pd={x:e.clientX,y:e.clientY};dirty=true;});
  pv.addEventListener('pointerup',()=>{pd=null;});pv.addEventListener('pointercancel',()=>{pd=null;});
  pv.addEventListener('wheel',e=>{e.preventDefault();zk=Math.max(.5,Math.min(2,zk*(1+e.deltaY*.001)));cam.position.z=4.2/Math.min(1,cam.aspect)*zk;dirty=true;},{passive:false});
  const ro=new ResizeObserver(()=>{if(!rn)return;const w=pv.clientWidth,h=pv.clientHeight;if(w&&h){rn.setSize(w,h,false);cam.aspect=w/h;cam.position.z=4.2/Math.min(1,cam.aspect)*zk;cam.updateProjectionMatrix();dirty=true;}});ro.observe(pv);
  function frame(){
    if(disposed)return;raf=requestAnimationFrame(frame);
    if(rn&&mesh&&(dirty||spin)){if(spin)rot.y+=.006;mesh.rotation.set(rot.x,rot.y,0);rn.render(sc,cam);dirty=false;}
  }
  frame();
  /* ---------- evaluate and refresh ---------- */
  let pending=0;
  function refresh(){
    pending=0;if(disposed)return;
    try{
      const maps=buildMaps(g,256,ev),run=ev(g,256);
      if(mat){const t=texturesFor(THREE,maps,T);Object.assign(T,t);fillMaterial(THREE,mat,T,maps);dirty=true;}
      for(const id in g.nodes){if(id==='out')continue;const k=run.key(id),im=run.get(id);if(!im||thumbs[id]&&thumbs[id].k===k)continue;
        const th=ndEl[id]&&ndEl[id].querySelector('canvas.th');if(th){th.getContext('2d').drawImage(toCanvas(im),0,0,th.width,th.height);}thumbs[id]={k};}
      if(mode==='node')drawNode2D();
    }catch(e){console.error(e);toast('This graph couldn’t be computed: '+(e.message||e));}
  }
  const schedule=()=>{if(!pending)pending=requestAnimationFrame(refresh);};
  function drawNode2D(){const id=sel&&sel!=='out'?sel:null;const ctx=pn.getContext('2d');ctx.clearRect(0,0,256,256);if(!id)return;const im=ev(g,256).get(id);if(im)ctx.drawImage(toCanvas(im),0,0,256,256);}
  /* ---------- history ---------- */
  function pushHist(){const s=JSON.stringify(g);if(s===hist[hi])return;hist.length=hi+1;hist.push(s);if(hist.length>60)hist.shift();hi=hist.length-1;paintHist();}
  function paintHist(){undoB.disabled=hi<=0;redoB.disabled=hi>=hist.length-1;}
  function restore(){g=JSON.parse(hist[hi]);if(sel&&!g.nodes[sel])sel=null;rebuild();paintInsp();schedule();paintHist();}
  function undo(){if(hi>0){hi--;restore();}}function redo(){if(hi<hist.length-1){hi++;restore();}}
  const touched=()=>{schedule();clearTimeout(ct);ct=setTimeout(pushHist,500);};
  paintHist();
  /* ---------- nodes and wires ---------- */
  const ndEl={};
  const label=(t,i)=>NODES[t].in[i]||'';
  function mkNode(id){
    const nd=g.nodes[id],def=NODES[nd.t],e=mk('div','nm-n');e.dataset.id=id;e.style.left=nd.x+'px';e.style.top=nd.y+'px';
    e.appendChild(mk('div','nm-nh',def.name));
    const body=mk('div','nm-nb'),ins=mk('div','nm-ins');
    def.in.forEach((nm,i)=>{const p=mk('button','nm-p in');p.type='button';p.dataset.i=i;p.setAttribute('aria-label',def.name+' input '+nm);p.appendChild(mk('i'));p.appendChild(mk('span','',nm));ins.appendChild(p);});
    body.appendChild(ins);
    if(nd.t!=='out'){const th=mk('canvas','th');th.width=th.height=64;body.appendChild(th);const op=mk('button','nm-p out');op.type='button';op.setAttribute('aria-label',def.name+' output');op.appendChild(mk('i'));body.appendChild(op);}
    e.appendChild(body);vp.appendChild(e);ndEl[id]=e;return e;
  }
  function rebuild(){Object.keys(ndEl).forEach(k=>{ndEl[k].remove();delete ndEl[k];});for(const k in thumbs)delete thumbs[k];Object.keys(g.nodes).forEach(mkNode);paintPorts();wires();}
  function paintPorts(){
    for(const id in g.nodes){const e=ndEl[id];if(!e)continue;e.dataset.sel=String(sel===id);
      e.querySelectorAll('.nm-p.in').forEach(p=>{p.dataset.on=String(!!g.nodes[id].in[+p.dataset.i]);});
      const op=e.querySelector('.nm-p.out');if(op){op.dataset.pend=String(pend===id);op.dataset.on=String(Object.values(g.nodes).some(n=>n.in.includes(id)));}}
  }
  const rel=el=>{const r=el.getBoundingClientRect(),b=vp.getBoundingClientRect();return {x:(r.left+r.width/2-b.left)/view.k,y:(r.top+r.height/2-b.top)/view.k};};
  const curve=(a,b)=>{const dx=Math.max(40,Math.abs(b.x-a.x)*.5);return `M${a.x},${a.y}C${a.x+dx},${a.y} ${b.x-dx},${b.y} ${b.x},${b.y}`;};
  let tmpP=null;
  function wires(tmp){
    svg.innerHTML='';
    for(const id in g.nodes){const nd=g.nodes[id];nd.in.forEach((s,i)=>{if(!s||!ndEl[s]||!ndEl[id])return;const po=ndEl[s].querySelector('.nm-p.out i'),pi=ndEl[id].querySelectorAll('.nm-p.in i')[i];if(!po||!pi)return;
      const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',curve(rel(po),rel(pi)));svg.appendChild(p);});}
    if(tmp){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('class','tmp');p.setAttribute('d',curve(tmp.a,tmp.b));svg.appendChild(p);}
  }
  const applyView=()=>{vp.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.k})`;};
  function fit(){const ids=Object.keys(g.nodes);if(!ids.length)return;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;ids.forEach(id=>{const n=g.nodes[id],h=id==='out'?230:110;x0=Math.min(x0,n.x);y0=Math.min(y0,n.y);x1=Math.max(x1,n.x+158);y1=Math.max(y1,n.y+h);});
    const W=gw.clientWidth||360,H=gw.clientHeight||300,k=Math.max(.35,Math.min(1,Math.min((W-24)/(x1-x0),(H-70)/(y1-y0))));view.k=k;view.x=(W-(x1-x0)*k)/2-x0*k;view.y=Math.max(46,(H-(y1-y0)*k)/2-y0*k+20);applyView();wires();}
  /* pointer handling on the graph */
  const ptrs=new Map();let drag=null,pinch=null;
  const gp=e=>{const r=gw.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const toG=p=>({x:(p.x-view.x)/view.k,y:(p.y-view.y)/view.k});
  gw.addEventListener('pointerdown',e=>{
    if(e.target.closest('.nm-i,.nm-fab'))return;
    ptrs.set(e.pointerId,gp(e));
    if(ptrs.size===2){drag=null;const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),k:view.k,m:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};return;}
    const port=e.target.closest('.nm-p'),nodeEl=e.target.closest('.nm-n');
    if(port&&nodeEl){const id=nodeEl.dataset.id;
      if(port.classList.contains('out')){drag={type:'wire',from:id,sx:e.clientX,sy:e.clientY,moved:false,pid:e.pointerId};}
      else{drag={type:'in',id,i:+port.dataset.i,pid:e.pointerId,moved:false,sx:e.clientX,sy:e.clientY};}
    }else if(nodeEl){const id=nodeEl.dataset.id,nd=g.nodes[id];drag={type:'node',id,ox:nd.x,oy:nd.y,sx:e.clientX,sy:e.clientY,moved:false,pid:e.pointerId};}
    else drag={type:'pan',vx:view.x,vy:view.y,sx:e.clientX,sy:e.clientY,moved:false,pid:e.pointerId};
    try{gw.setPointerCapture(e.pointerId);}catch(_){}
  });
  gw.addEventListener('pointermove',e=>{
    if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,gp(e));
    if(pinch&&ptrs.size===2){const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y),m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},k=Math.max(.3,Math.min(2.2,pinch.k*d/pinch.d)),w=toG(pinch.m);view.k=k;view.x=m.x-w.x*k;view.y=m.y-w.y*k;applyView();wires();return;}
    if(!drag||e.pointerId!==drag.pid)return;
    const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;if(Math.hypot(dx,dy)>5)drag.moved=true;
    if(drag.type==='pan'&&drag.moved){view.x=drag.vx+dx;view.y=drag.vy+dy;applyView();}
    else if(drag.type==='node'&&drag.moved){const nd=g.nodes[drag.id];nd.x=Math.round(drag.ox+dx/view.k);nd.y=Math.round(drag.oy+dy/view.k);ndEl[drag.id].style.left=nd.x+'px';ndEl[drag.id].style.top=nd.y+'px';wires();}
    else if(drag.type==='wire'&&drag.moved){const po=ndEl[drag.from].querySelector('.nm-p.out i'),r=vp.getBoundingClientRect();wires({a:rel(po),b:{x:(e.clientX-r.left)/view.k,y:(e.clientY-r.top)/view.k}});
      root.querySelectorAll('.nm-p.tgt').forEach(x=>x.classList.remove('tgt'));const t=document.elementFromPoint(e.clientX,e.clientY),pp=t&&t.closest&&t.closest('.nm-p.in');if(pp)pp.classList.add('tgt');}
  });
  const endPtr=e=>{
    ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;
    if(!drag||e.pointerId!==drag.pid)return;const d=drag;drag=null;root.querySelectorAll('.nm-p.tgt').forEach(x=>x.classList.remove('tgt'));
    if(d.type==='node'){if(d.moved)pushHist();else select(d.id);}
    else if(d.type==='wire'){
      if(d.moved){const t=document.elementFromPoint(e.clientX,e.clientY),pp=t&&t.closest&&t.closest('.nm-p.in'),ne=pp&&pp.closest('.nm-n');if(pp&&ne)connect(d.from,ne.dataset.id,+pp.dataset.i);else wires();}
      else{pend=pend===d.from?null:d.from;paintPorts();toast(pend?'Now tap an input dot to connect it.':'Cancelled.',1800);}
    }else if(d.type==='in'){
      if(!d.moved){if(pend){connect(pend,d.id,d.i);}else if(g.nodes[d.id].in[d.i]){g.nodes[d.id].in[d.i]=null;paintPorts();wires();touched();toast('Disconnected.',1400);}}
    }else if(d.type==='pan'&&!d.moved){if(pend){pend=null;paintPorts();}else select(null);}
  };
  gw.addEventListener('pointerup',endPtr);gw.addEventListener('pointercancel',endPtr);
  gw.addEventListener('wheel',e=>{e.preventDefault();const p=gp(e),w=toG(p),k=Math.max(.3,Math.min(2.2,view.k*(1-e.deltaY*.0015)));view.k=k;view.x=p.x-w.x*k;view.y=p.y-w.y*k;applyView();wires();},{passive:false});
  function connect(src,dst,i){
    pend=null;if(src===dst||!g.nodes[dst]){paintPorts();wires();return;}
    if(!canConnect(g,src,dst)){toast('That would make a loop. A node can’t feed itself.',2400);paintPorts();wires();return;}
    g.nodes[dst].in[i]=src;paintPorts();wires();touched();pushHist();if(window.hap)window.hap(8);
  }
  function select(id){sel=id;pend=null;paintPorts();paintInsp();if(mode==='node')drawNode2D();}
  /* ---------- inspector ---------- */
  function paintInsp(){
    insp.innerHTML='';if(!sel||!g.nodes[sel]){insp.hidden=true;return;}insp.hidden=false;
    const nd=g.nodes[sel],def=NODES[nd.t],h=mk('div','nm-ih');h.appendChild(mk('b','',def.name));
    if(sel!=='out'){h.appendChild(B('Copy','',()=>{const id=addNode(g,nd.t,nd.x+30,nd.y+30,clone(nd.p));mkNode(id);select(id);pushHist();schedule();},'Duplicate this node'));
      h.appendChild(B('Delete','',()=>{for(const k in g.nodes)g.nodes[k].in=g.nodes[k].in.map(s=>s===sel?null:s);ndEl[sel].remove();delete ndEl[sel];delete g.nodes[sel];sel=null;paintPorts();wires();paintInsp();pushHist();schedule();},'Delete this node'));}
    h.appendChild(B('✕','',()=>select(null),'Close the editor'));insp.appendChild(h);
    if(sel==='out')insp.appendChild(mk('div','nm-hint','Plug nodes into the dots to drive each part of the material. Anything left unplugged uses the value below.')).style.cssText='position:static;max-width:none;margin:0 0 6px';
    def.p.forEach(q=>{
      if(q.t==='s'){const r=sliderRow(insp,q.l,()=>nd.p[q.k],v=>{nd.p[q.k]=v;touched();},q.min,q.max,q.step,v=>q.step<1?(+v).toFixed(q.step<.05?3:2):String(Math.round(v)));r.sync&&r.sync();}
      else if(q.t==='e'){const w=mk('div');w.appendChild(mk('div','nm-col',q.l));chipRow(w,q.opts,v=>nd.p[q.k]===v,v=>{nd.p[q.k]=v;touched();});insp.appendChild(w);}
      else{const w=mk('label','nm-col',q.l),i=document.createElement('input');i.type='color';i.value=nd.p[q.k];i.setAttribute('aria-label',q.l);i.addEventListener('input',()=>{nd.p[q.k]=i.value;touched();});w.appendChild(i);insp.appendChild(w);}
    });
  }
  /* ---------- add and library ---------- */
  function pop(build){const p=mk('div','nm-pop'),pp=mk('div','nm-pp');p.appendChild(pp);p.addEventListener('pointerdown',e=>{if(e.target===p)p.remove();});build(pp,()=>p.remove());root.appendChild(p);}
  function openAdd(){pop((pp,done)=>{
    pp.appendChild(mk('b','','Add a node'));
    CATS.forEach(cat=>{pp.appendChild(mk('h4','',cat));const gr=mk('div','grid');Object.entries(NODES).filter(([,d])=>d.cat===cat).forEach(([t,d])=>{gr.appendChild(B(d.name,'',()=>{done();addAt(t);}));});pp.appendChild(gr);});
  });}
  function addAt(t){
    const c0=toG({x:(gw.clientWidth||300)/2-80,y:(gw.clientHeight||300)/2-40}),n0=sel&&sel!=='out'?g.nodes[sel]:null;
    const id=addNode(g,t,Math.round(n0?n0.x+190:c0.x),Math.round(n0?n0.y+(Math.random()*80-20):c0.y));
    if(n0&&g.nodes[id].in.length&&canConnect(g,sel,id))g.nodes[id].in[0]=sel;
    mkNode(id);select(id);wires();pushHist();schedule();
  }
  function loadG(ng){g=ng;sel=null;pend=null;rebuild();paintInsp();fit();pushHist();schedule();}
  function openLib(){pop((pp,done)=>{
    pp.appendChild(mk('b','','Library'));
    pp.appendChild(mk('h4','','Starters'));const gr=mk('div','grid');TEMPLATES.forEach(([n,f])=>gr.appendChild(B(n,'',()=>{done();loadG(f());})));pp.appendChild(gr);
    pp.appendChild(mk('h4','','Save this graph'));const sv=mk('div','nm-sv'),inp=document.createElement('input');inp.placeholder='Name';inp.setAttribute('aria-label','Material name');
    sv.append(inp,B('Save','pri',()=>{const name=inp.value.trim()||'Untitled';const a=lib();a.unshift({name,g:clone(g)});try{localStorage.setItem(LIB,JSON.stringify(a.slice(0,30)));toast('Saved “'+name+'”.');done();}catch(e){toast('Couldn’t save: the browser storage is full or blocked.',4000);}}));pp.appendChild(sv);
    const a=lib();if(a.length){pp.appendChild(mk('h4','','My materials'));a.forEach((it,ix)=>{const r=mk('div','nm-li');r.appendChild(mk('span','',it.name));r.appendChild(B('Open','',()=>{done();loadG(clone(it.g));}));r.appendChild(B('✕','',()=>{const b=lib();b.splice(ix,1);localStorage.setItem(LIB,JSON.stringify(b));done();openLib();},'Delete '+it.name));pp.appendChild(r);});}
    if(o&&o.nmat){pp.appendChild(mk('h4','','On the object'));pp.appendChild(B('Take this material off the object','',()=>{clearFromObject(o);c.onClear&&c.onClear();done();toast('Material removed from '+(o.name||'the object')+'.');}));}
  });}
  /* ---------- go ---------- */
  rebuild();applyView();
  requestAnimationFrame(()=>{fit();schedule();});
  addEventListener('keydown',onKey,true);
  function onKey(e){if(disposed)return;if(e.key==='Escape'&&!root.querySelector('.nm-pop')){e.stopPropagation();shut();}else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!/INPUT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();e.stopPropagation();e.shiftKey?redo():undo();}}
  function shut(applied){
    if(disposed)return;disposed=true;cancelAnimationFrame(raf);cancelAnimationFrame(pending);clearTimeout(ct);removeEventListener('keydown',onKey,true);ro.disconnect();
    Object.values(T).forEach(t=>t&&t.dispose&&t.dispose());if(mesh){mesh.geometry.dispose();}if(mat)mat.dispose();if(rn){rn.dispose();}
    root.remove();onClose&&onClose(!!applied);
  }
  return {close:()=>shut(),get graph(){return clone(g);}};
}
