/* Build mode, in the spirit of a life-sim home builder: draw walls and rooms on a grid, lay floors, cut doors and windows,
   raise levels, add stairs and roofs, restyle with one tap, then furnish with real CC0 models. The house is one editable object
   (data, not baked geometry), so it saves with the project and you can keep changing it. */
import {modelList,thumb} from './phmodels.js';
const H=2.7,T=.16,FT=.14,LV=H+FT,GRID=.5;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const STYLES={
  wall:[['plaster','Plaster','#e9e4da','plain'],['cream','Cream','#f1e6c9','plain'],['sage','Sage','#a9b8a0','plain'],['sky','Sky','#9db8d8','plain'],['blush','Blush','#e7b8b0','plain'],['char','Charcoal','#3a3b40','plain'],
    ['stripes','Stripes','#d9d2c3','stripes'],['brick','Brick','#9c4a37','bricks'],['panel','Panelling','#8a6a4a','planksV'],['tile','White tile','#e8ecef','tiles']],
  floor:[['oak','Oak','#b58b5c','planks'],['dark','Walnut','#5a3f2c','planks'],['checker','Checker','#f0f0ee','checker'],['marble','Marble','#e8e6e1','marble'],['slate','Slate','#55585e','tiles'],
    ['carpet','Carpet','#7b6a8f','noise'],['terra','Terracotta','#b55d3d','tiles'],['concrete','Concrete','#9a9a98','noise']],
  roof:[['shingle','Shingle','#5a4a44','shingle'],['terra','Clay','#b04a2c','shingle'],['slate','Slate','#44484f','shingle'],['thatch','Thatch','#b7a063','noise']]
};
const styleOf=(k,id)=>(STYLES[k].find(s=>s[0]===id)||STYLES[k][0]);

export function createBuild(c){
  const {THREE,addGroup,objById,S,dom,camera,controls,toast,bump,el,btn,sec,addModel,pane,peek,selectObj}=c;
  let house=null;const ray=new THREE.Raycaster(),v2=new THREE.Vector2();
  const newData=()=>({walls:[],floors:[],roofs:[],stairs:[],lawn:true});
  const T0={tool:null,level:0,walls:'up',style:{wall:'plaster',floor:'oak',roof:'shingle'},rot:0,place:null};
  let hist=[],redo=[];

  /* ---- textures from styles, shared and repeating once per metre ---- */
  const texC=new Map();
  function tex(kind,id){
    const k=kind+id;if(texC.has(k))return texC.get(k);
    const [, ,col,pat]=styleOf(kind,id),N=128,cv=document.createElement('canvas');cv.width=cv.height=N;const g=cv.getContext('2d');
    g.fillStyle=col;g.fillRect(0,0,N,N);
    const dark=a=>{g.fillStyle='rgba(0,0,0,'+a+')';},light=a=>{g.fillStyle='rgba(255,255,255,'+a+')';};
    let s=11;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647;};
    if(pat==='stripes'){light(.35);for(let x=0;x<N;x+=32)g.fillRect(x,0,16,N);}
    else if(pat==='bricks'){dark(.45);for(let y=0;y<N;y+=16){g.fillRect(0,y,N,2);for(let x=((y/16)%2)*16;x<N;x+=32)g.fillRect(x,y,2,16);}for(let i=0;i<260;i++){g.fillStyle='rgba('+(rnd()<.5?'0,0,0':'255,255,255')+','+(rnd()*.12)+')';g.fillRect(rnd()*N,rnd()*N,6,3);}}
    else if(pat==='planks'){for(let y=0;y<N;y+=21){dark(.35);g.fillRect(0,y,N,2);for(let i=0;i<9;i++){g.fillStyle='rgba(0,0,0,'+(rnd()*.1)+')';g.fillRect(rnd()*N,y+2,rnd()*40,1);}const off=rnd()*N;dark(.3);g.fillRect(off,y,2,21);}}
    else if(pat==='planksV'){for(let x=0;x<N;x+=16){dark(.35);g.fillRect(x,0,2,N);}for(let i=0;i<60;i++){g.fillStyle='rgba(0,0,0,'+(rnd()*.1)+')';g.fillRect(rnd()*N,rnd()*N,1,rnd()*30);}}
    else if(pat==='checker'){dark(.85);g.fillRect(0,0,N/2,N/2);g.fillRect(N/2,N/2,N/2,N/2);}
    else if(pat==='tiles'){dark(.3);g.fillRect(0,0,N,2);g.fillRect(0,0,2,N);g.fillRect(0,N/2,N,2);g.fillRect(N/2,0,2,N);}
    else if(pat==='marble'){for(let i=0;i<14;i++){g.strokeStyle='rgba(60,60,70,'+(.08+rnd()*.18)+')';g.lineWidth=1+rnd()*2;g.beginPath();let x=rnd()*N,y=0;g.moveTo(x,y);for(let j=0;j<8;j++){x+=(rnd()-.5)*40;y+=N/8;g.lineTo(x,y);}g.stroke();}}
    else if(pat==='noise'){for(let i=0;i<1400;i++){g.fillStyle='rgba('+(rnd()<.5?'0,0,0':'255,255,255')+','+(rnd()*.12)+')';g.fillRect(rnd()*N,rnd()*N,2,2);}}
    else if(pat==='shingle'){for(let y=0;y<N;y+=16){dark(.35);g.fillRect(0,y,N,2);for(let x=((y/16)%2)*16;x<N;x+=32)g.fillRect(x,y,2,16);}}
    const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;texC.set(k,t);return t;
  }
  const matC=new Map();
  const mat=(kind,id)=>{const k=kind+id;if(!matC.has(k)){const st=styleOf(kind,id);matC.set(k,new THREE.MeshStandardMaterial({map:tex(kind,id),roughness:kind==='floor'&&st[3]==='marble'?.25:.85,metalness:0}));}return matC.get(k);};
  const woodM=new THREE.MeshStandardMaterial({color:'#6b4a2f',roughness:.7}),frameM=new THREE.MeshStandardMaterial({color:'#f4f1ea',roughness:.6}),
    glassM=new THREE.MeshStandardMaterial({color:'#bfe3ff',roughness:.05,transparent:true,opacity:.28}),lawnM=new THREE.MeshStandardMaterial({color:'#6f9a5b',roughness:1}),stepM=null;

  /* box with uvs scaled to metres so patterns keep their size on any wall */
  function box(w,h,d){
    const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv,dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
    for(let f=0;f<6;f++)for(let v=0;v<4;v++){const i=f*4+v;uv.setXY(i,uv.getX(i)*dims[f][0],uv.getY(i)*dims[f][1]);}
    return g;
  }
  const mesh=(g,m,bk)=>{const x=new THREE.Mesh(g,m);x.castShadow=x.receiveShadow=true;x.userData.bk=bk;return x;};

  /* ---- build the meshes from data ---- */
  const lvY=l=>l*LV;                       // slab bottom of level l
  const topY=l=>lvY(l)+FT;                 // walking surface of level l
  function wallHeight(w){const v=T0.walls;if(w.l>T0.level)return 0;if(w.l===T0.level){if(v==='cut')return 1.05;if(v==='down')return .12;}return H;}
  function addWall(g,w,i,hh){
    const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],L=Math.hypot(dx,dz);if(L<.05||hh<=0)return;
    const ang=Math.atan2(dz,dx),ux=dx/L,uz=dz/L,y0=topY(w.l),m=mat('wall',w.m);
    const piece=(s0,s1,a,b)=>{b=Math.min(b,hh);if(s1-s0<.01||b-a<.01)return;const p=mesh(box(s1-s0,b-a,T),m,{t:'wall',i});
      const sm=(s0+s1)/2;p.position.set(w.a[0]+ux*sm,y0+(a+b)/2,w.a[1]+uz*sm);p.rotation.y=-ang;g.add(p);};
    const items=[...(w.items||[])].sort((p,q)=>p.at-q.at);let s=-T/2;
    items.forEach(it=>{const hw=it.w/2,l=clamp(it.at-hw,0,L),r=clamp(it.at+hw,0,L);piece(s,l,0,H);
      if(it.t==='door'){piece(l,r,2.1,H);frame(g,w,i,it,0,2.1,y0,ux,uz,ang,hh);}else{piece(l,r,0,.9);piece(l,r,2.0,H);frame(g,w,i,it,.9,2.0,y0,ux,uz,ang,hh);}s=r;});
    piece(s,L+T/2,0,H);
  }
  function frame(g,w,i,it,a,b,y0,ux,uz,ang,hh){
    if(a>=hh)return;const at=it.at,hw=it.w/2,bk={t:'wall',i};
    const put=(sm,y,wd,ht,dp,mt)=>{const p=mesh(new THREE.BoxGeometry(wd,ht,dp),mt,bk);p.position.set(w.a[0]+ux*sm,y0+y,w.a[1]+uz*sm);p.rotation.y=-ang;g.add(p);return p;};
    const f=.05,dp=T+.03;
    if(it.t==='door'){put(at-hw+f/2,(a+b)/2,f,b-a,dp,frameM);put(at+hw-f/2,(a+b)/2,f,b-a,dp,frameM);put(at,b-f/2,it.w,f,dp,frameM);
      const leaf=new THREE.Group(),lm=mesh(new THREE.BoxGeometry(it.w-.1,b-.05,.045),woodM,bk);lm.position.set((it.w-.1)/2,(b-.05)/2,0);leaf.add(lm);
      leaf.position.set(w.a[0]+ux*(at-hw+.05),y0,w.a[1]+uz*(at-hw+.05));leaf.rotation.y=-ang-1.15;g.add(leaf);}
    else{put(at-hw+f/2,(a+b)/2,f,b-a,dp,frameM);put(at+hw-f/2,(a+b)/2,f,b-a,dp,frameM);put(at,a+f/2,it.w,f,dp,frameM);put(at,b-f/2,it.w,f,dp,frameM);put(at,(a+b)/2,it.w-f*2,b-a-f*2,.02,glassM);put(at,(a+b)/2,.03,b-a,.05,frameM);}
  }
  function addFloor(g,f,i){
    const w=Math.abs(f.x1-f.x0),d=Math.abs(f.z1-f.z0);if(w<.1||d<.1)return;if(f.l>T0.level)return;
    const p=mesh(box(w,FT,d),mat('floor',f.m),{t:'floor',i});p.position.set((f.x0+f.x1)/2,lvY(f.l)+FT/2,(f.z0+f.z1)/2);g.add(p);
  }
  function addRoof(g,r,i){
    if(r.l>T0.level)return;if(r.l===T0.level&&T0.walls!=='up')return;
    const x0=Math.min(r.x0,r.x1)-.4,x1=Math.max(r.x0,r.x1)+.4,z0=Math.min(r.z0,r.z1)-.4,z1=Math.max(r.z0,r.z1)+.4,w=x1-x0,d=z1-z0;
    const along=w>=d?'x':'z',span=along==='x'?d:w,len=along==='x'?w:d,rise=clamp(span*.32,.8,2.6);
    const sh=new THREE.Shape();sh.moveTo(-span/2,0);sh.lineTo(span/2,0);sh.lineTo(0,rise);sh.closePath();
    const geo=new THREE.ExtrudeGeometry(sh,{depth:len,bevelEnabled:false});geo.translate(0,0,-len/2);
    const uv=geo.attributes.uv;for(let k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)*.5,uv.getY(k)*.5);
    const m=mat('roof',r.m).clone();m.side=THREE.DoubleSide;const p=mesh(geo,m,{t:'roof',i});
    p.position.set((x0+x1)/2,topY(r.l)+H,(z0+z1)/2);if(along==='x')p.rotation.y=Math.PI/2;g.add(p);
  }
  function addStairs(g,st,i){
    if(st.l>T0.level)return;const n=Math.round(LV/.19),rise=LV/n,run=.28,ang=Math.atan2(st.dz,st.dx);
    for(let k=0;k<n;k++){const p=mesh(box(run,rise*(k+1),1.1),mat('floor','oak'),{t:'stairs',i});
      const s=(k+.5)*run;p.position.set(st.x+st.dx*s,topY(st.l)+rise*(k+1)/2,st.z+st.dz*s);p.rotation.y=-ang;g.add(p);}
  }
  function rebuild(){
    if(!house)return;const g=house.group;
    for(let k=g.children.length-1;k>=0;k--){const ch=g.children[k];g.remove(ch);ch.traverse(n=>{if(n.geometry)n.geometry.dispose();});}
    const D=house.data;
    if(D.lawn){const p=new THREE.Mesh(new THREE.PlaneGeometry(40,40),lawnM);p.rotation.x=-Math.PI/2;p.position.y=-.005;p.receiveShadow=true;p.userData.bk={t:'lawn'};g.add(p);}
    D.floors.forEach((f,i)=>addFloor(g,f,i));D.walls.forEach((w,i)=>addWall(g,w,i,wallHeight(w)));D.stairs.forEach((s,i)=>addStairs(g,s,i));D.roofs.forEach((r,i)=>addRoof(g,r,i));
    S.needFrame=true;
  }
  function ensure(){
    if(house&&objById(house.o.id))return house;
    const data=newData(),group=new THREE.Group();const o=addGroup('House',group,{build:data,noAuto:true});
    house={o,group,data};o.meta.build=data;rebuild();return house;
  }
  /* ---- history ---- */
  const snap=()=>JSON.stringify(house.data);
  const push=()=>{hist.push(snap());if(hist.length>40)hist.shift();redo=[];};
  const apply=js=>{const d=JSON.parse(js);house.data=d;house.o.meta.build=d;rebuild();bump();};
  const undo=()=>{if(!house||!hist.length){toast('Nothing to undo.');return;}redo.push(snap());apply(hist.pop());};
  const redoF=()=>{if(!house||!redo.length)return;hist.push(snap());apply(redo.pop());};

  /* ---- pointer on the ground ---- */
  const planeHit=(e,l)=>{
    const rc=dom.getBoundingClientRect();v2.set((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);ray.setFromCamera(v2,camera);
    const inv=new THREE.Matrix4().copy(house.o.holder.matrixWorld).invert(),r2=ray.ray.clone().applyMatrix4(inv),pl=new THREE.Plane(new THREE.Vector3(0,1,0),-topY(l)),p=new THREE.Vector3();
    return r2.intersectPlane(pl,p)?p:null;
  };
  const snapP=p=>[Math.round(p.x/GRID)*GRID,Math.round(p.z/GRID)*GRID];
  const pickEl=e=>{
    const rc=dom.getBoundingClientRect();v2.set((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);ray.setFromCamera(v2,camera);
    const hs=ray.intersectObjects(house.group.children,true);for(const h of hs){let n=h.object;while(n&&!n.userData.bk&&n.parent)n=n.parent;const bk=n&&n.userData.bk;if(bk&&bk.t!=='lawn')return {bk,point:h.point};}return null;
  };
  let drag=null,ghost=null;
  const clearGhost=()=>{if(ghost){house.group.remove(ghost);ghost.traverse(n=>{if(n.geometry)n.geometry.dispose();});ghost=null;}};
  const gm=new THREE.MeshBasicMaterial({color:0x27f5c9,transparent:true,opacity:.35,depthWrite:false});
  function showGhost(tool,a,b){
    clearGhost();if(!a||!b)return;ghost=new THREE.Group();const y=topY(T0.level);
    if(tool==='wall'){const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(L>.05){const p=new THREE.Mesh(new THREE.BoxGeometry(L,H,T),gm);p.position.set((a[0]+b[0])/2,y+H/2,(a[1]+b[1])/2);p.rotation.y=-Math.atan2(dz,dx);ghost.add(p);}}
    else{const w=Math.abs(b[0]-a[0]),d=Math.abs(b[1]-a[1]);if(w>.05&&d>.05){const p=new THREE.Mesh(new THREE.BoxGeometry(w,tool==='room'?H:tool==='roof'?.2:FT,d),gm);p.position.set((a[0]+b[0])/2,y+(tool==='room'?H/2:tool==='roof'?H:FT/2),(a[1]+b[1])/2);ghost.add(p);}}
    house.group.add(ghost);S.needFrame=true;
  }
  const near=(a,p)=>Math.hypot(a[0]-p[0],a[1]-p[1]);
  function commit(tool,a,b){
    const D=house.data,l=T0.level,st=T0.style;
    if(tool==='wall'){if(near(a,b)<.4)return;push();D.walls.push({a,b,l,m:st.wall,items:[]});}
    else if(tool==='room'){const w=Math.abs(b[0]-a[0]),d=Math.abs(b[1]-a[1]);if(w<1||d<1)return;push();const x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),z0=Math.min(a[1],b[1]),z1=Math.max(a[1],b[1]);
      D.floors.push({x0,z0,x1,z1,l,m:st.floor});[[[x0,z0],[x1,z0]],[[x1,z0],[x1,z1]],[[x1,z1],[x0,z1]],[[x0,z1],[x0,z0]]].forEach(([p,q])=>D.walls.push({a:p,b:q,l,m:st.wall,items:[]}));}
    else if(tool==='floor'){const w=Math.abs(b[0]-a[0]),d=Math.abs(b[1]-a[1]);if(w<.5||d<.5)return;push();D.floors.push({x0:Math.min(a[0],b[0]),z0:Math.min(a[1],b[1]),x1:Math.max(a[0],b[0]),z1:Math.max(a[1],b[1]),l,m:st.floor});}
    else if(tool==='roof'){const w=Math.abs(b[0]-a[0]),d=Math.abs(b[1]-a[1]);if(w<1||d<1)return;push();D.roofs.push({x0:Math.min(a[0],b[0]),z0:Math.min(a[1],b[1]),x1:Math.max(a[0],b[0]),z1:Math.max(a[1],b[1]),l,m:st.roof});}
    else if(tool==='stairs'){const dx=b[0]-a[0],dz=b[1]-a[1];if(Math.hypot(dx,dz)<.4)return;push();const ax=Math.abs(dx)>=Math.abs(dz);D.stairs.push({x:a[0],z:a[1],dx:ax?Math.sign(dx):0,dz:ax?0:Math.sign(dz),l});}
    rebuild();bump();
  }
  function click(e,tool){
    const hit=pickEl(e),D=house.data;
    if(tool==='door'||tool==='window'){
      if(!hit||hit.bk.t!=='wall'){toast('Tap a wall to put a '+tool+' in it.');return;}
      const w=D.walls[hit.bk.i];if(!w)return;const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],L=Math.hypot(dx,dz);
      const loc=hit.point.clone().applyMatrix4(new THREE.Matrix4().copy(house.o.holder.matrixWorld).invert()),s=clamp(((loc.x-w.a[0])*dx+(loc.z-w.a[1])*dz)/L,0,L);
      const wd=tool==='door'?1:1.2;if(L<wd+.3){toast('That wall is too short.');return;}
      push();w.items=w.items||[];const ex=w.items.findIndex(it=>Math.abs(it.at-s)<wd);
      if(ex>=0)w.items.splice(ex,1);else w.items.push({t:tool,at:clamp(Math.round(s/.25)*.25,wd/2+.15,L-wd/2-.15),w:wd});
      rebuild();bump();return;}
    if(tool==='erase'){if(!hit)return;push();const {t,i}=hit.bk;const k={wall:'walls',floor:'floors',roof:'roofs',stairs:'stairs'}[t];if(k)D[k].splice(i,1);rebuild();bump();return;}
    if(tool==='paint'){if(!hit)return;const {t,i}=hit.bk,k={wall:'walls',floor:'floors',roof:'roofs'}[t];if(!k)return;push();D[k][i].m=T0.style[t];rebuild();bump();return;}
  }
  function down(e){
    if(!T0.tool&&!T0.place)return;
    if(drag&&e.pointerType==='touch'){drag=null;clearGhost();return;}
    if(e.button!==0||e.altKey||(!e.isPrimary&&e.pointerType==='touch'))return;
    ensure();
    if(T0.place){const p=planeHit(e,T0.level);if(!p)return;e.stopImmediatePropagation();e.preventDefault();
      const pos=house.o.holder.localToWorld(new THREE.Vector3(Math.round(p.x/.25)*.25,topY(T0.level),Math.round(p.z/.25)*.25));
      addModel(T0.place.id,T0.place.name,{pos:[pos.x,pos.y,pos.z],rotY:T0.rot});return;}
    const tool=T0.tool;
    if(['door','window','erase','paint'].includes(tool)){const h=pickEl(e);if(!h)return;e.stopImmediatePropagation();e.preventDefault();click(e,tool);return;}
    const p=planeHit(e,T0.level);if(!p)return;e.stopImmediatePropagation();e.preventDefault();
    try{dom.setPointerCapture(e.pointerId);}catch(_){}
    drag={id:e.pointerId,a:snapP(p),b:snapP(p),tool};
  }
  function move(e){if(!drag||e.pointerId!==drag.id)return;e.stopImmediatePropagation();const p=planeHit(e,T0.level);if(!p)return;drag.b=snapP(p);
    if(drag.tool==='wall'){const dx=drag.b[0]-drag.a[0],dz=drag.b[1]-drag.a[1];if(Math.abs(Math.abs(dx)-Math.abs(dz))>GRID*1.5){if(Math.abs(dx)>Math.abs(dz))drag.b[1]=drag.a[1];else drag.b[0]=drag.a[0];}}
    showGhost(drag.tool,drag.a,drag.b);}
  function up(e){if(!drag||e.pointerId!==drag.id)return;e.stopImmediatePropagation();const d=drag;drag=null;clearGhost();commit(d.tool,d.a,d.b);}
  dom.addEventListener('pointerdown',down,true);dom.addEventListener('pointermove',move,true);dom.addEventListener('pointerup',up,true);dom.addEventListener('pointercancel',e=>{if(drag){drag=null;clearGhost();}},true);

  /* ---- starters ---- */
  function wallsRect(D,x0,z0,x1,z1,l,m){[[[x0,z0],[x1,z0]],[[x1,z0],[x1,z1]],[[x1,z1],[x0,z1]],[[x0,z1],[x0,z0]]].forEach(([a,b])=>D.walls.push({a,b,l,m,items:[]}));}
  function starter(kind){
    ensure();push();const D=house.data;D.walls=[];D.floors=[];D.roofs=[];D.stairs=[];
    if(kind==='house'){
      D.floors.push({x0:-4,z0:-3,x1:2,z1:3,l:0,m:'oak'},{x0:2,z0:-3,x1:5,z1:0,l:0,m:'terra'},{x0:2,z0:0,x1:5,z1:3,l:0,m:'checker'});
      wallsRect(D,-4,-3,5,3,0,'plaster');
      D.walls.push({a:[2,-3],b:[2,3],l:0,m:'cream',items:[{t:'door',at:3,w:1}]},{a:[2,0],b:[5,0],l:0,m:'cream',items:[{t:'door',at:1.5,w:1}]});
      D.walls[0].items=[{t:'window',at:2,w:1.2},{t:'window',at:6.5,w:1.2}];D.walls[1].items=[{t:'window',at:1.5,w:1.2}];D.walls[2].items=[{t:'door',at:7,w:1},{t:'window',at:2.5,w:1.2}];D.walls[3].items=[{t:'window',at:3,w:1.2}];
      D.roofs.push({x0:-4,z0:-3,x1:5,z1:3,l:0,m:'terra'});
    }else{
      D.floors.push({x0:-2.5,z0:-2,x1:2.5,z1:2,l:0,m:'dark'});wallsRect(D,-2.5,-2,2.5,2,0,'panel');
      D.walls[2].items=[{t:'door',at:2.5,w:1}];D.walls[0].items=[{t:'window',at:1.5,w:1.2},{t:'window',at:3.5,w:1.2}];D.roofs.push({x0:-2.5,z0:-2,x1:2.5,z1:2,l:0,m:'thatch'});
    }
    rebuild();bump();iso();
  }
  function bounds(){const D=house.data,b=new THREE.Box3();let any=false;D.floors.forEach(f=>{b.expandByPoint(new THREE.Vector3(f.x0,0,f.z0));b.expandByPoint(new THREE.Vector3(f.x1,0,f.z1));any=true;});D.walls.forEach(w=>{b.expandByPoint(new THREE.Vector3(w.a[0],0,w.a[1]));b.expandByPoint(new THREE.Vector3(w.b[0],0,w.b[1]));any=true;});return any?b:new THREE.Box3(new THREE.Vector3(-4,0,-4),new THREE.Vector3(4,0,4));}
  function view(kind){ensure();const b=bounds(),cn=b.getCenter(new THREE.Vector3()),sz=b.getSize(new THREE.Vector3()),d=Math.max(8,Math.max(sz.x,sz.z)*1.5)*((camera.aspect||1)<1?1.6:1),y=topY(T0.level);
    const t=house.o.holder.localToWorld(new THREE.Vector3(cn.x,y,cn.z));controls.target.copy(t);
    if(kind==='top')camera.position.set(t.x,t.y+d*1.25,t.z+.01);else camera.position.set(t.x+d*.7,t.y+d*.8,t.z+d*.9);controls.update();S.needFrame=false;}
  const iso=()=>view('iso');

  /* ---- UI ---- */
  let lib=null,libP=null;
  const CATS=['Seating','Table','Furniture','Shelves','Lighting','Plants','Decorative','Appliances','Electronics','Food','Containers','Props'];
  function model(parent){
    const box=el('div'),q=document.createElement('input');q.type='search';q.placeholder='Search furniture, plants, lamps…';q.setAttribute('aria-label','Search models');q.style.cssText='width:100%;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:inherit;font:inherit;box-sizing:border-box';
    const cats=el('div','chips'),grid=el('div'),msg=el('div','note','Loading the library…');grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0';
    let cat='Seating',nn=18;
    const draw=()=>{const t=q.value.trim().toLowerCase();const l=(lib||[]).filter(x=>(!cat||x.cats.includes(cat.toLowerCase()))&&(!t||x.name.toLowerCase().includes(t)||x.tags.some(g=>g.includes(t))));
      grid.innerHTML='';l.slice(0,nn).forEach(x=>{const b=el('button');b.type='button';b.title=x.name+' · '+x.au;b.style.cssText='padding:0;border:1px solid var(--line);background:var(--raise);border-radius:14px;overflow:hidden;color:inherit;text-align:left;min-height:44px';
        b.setAttribute('aria-pressed',!!(T0.place&&T0.place.id===x.id));const im=document.createElement('img');im.loading='lazy';im.alt='';im.src=thumb(x.id);im.style.cssText='width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#15161a';b.appendChild(im);
        const sp=el('span','',x.name);sp.style.cssText='display:block;padding:4px 6px 6px;font:600 10px var(--lab,monospace);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';b.appendChild(sp);
        b.addEventListener('click',()=>{T0.place={id:x.id,name:x.name};T0.tool=null;ensure();peek&&peek();toast('Tap the floor to place '+x.name+'. Rotate with the button, finish with Done.',4500);refresh();});grid.appendChild(b);});
      more.hidden=l.length<=nn;msg.hidden=l.length>0;msg.textContent=lib?'Nothing matches that.':'Loading the library…';};
    const more=btn('More','',()=>{nn+=18;draw();});
    q.addEventListener('input',()=>{nn=18;draw();});
    CATS.forEach(cn=>{const b=el('button','chip',cn);b.type='button';b.setAttribute('aria-pressed',cn===cat);b.addEventListener('click',()=>{cat=cn;nn=18;[...cats.children].forEach(x=>x.setAttribute('aria-pressed',x===b));draw();});cats.appendChild(b);});
    box.append(q,cats,msg,grid,more);parent.appendChild(box);
    (libP=libP||modelList()).then(a=>{lib=a;draw();}).catch(()=>{libP=null;msg.hidden=false;msg.textContent='Couldn’t reach the model library. It needs a connection.';});
  }
  const tog=(parent,label,on,fn)=>{const b=el('button','chip',label);b.type='button';b.setAttribute('aria-pressed',!!on);b.addEventListener('click',fn);parent.appendChild(b);return b;};
  function swatches(parent,kind,label){
    parent.appendChild(el('div','sub',label));const row=el('div','chips');
    STYLES[kind].forEach(([id,nm,col])=>{const b=el('button','chip',nm);b.type='button';b.setAttribute('aria-pressed',T0.style[kind]===id);b.style.cssText='border-left:14px solid '+col;b.addEventListener('click',()=>{T0.style[kind]=id;if(!T0.tool||T0.tool==='erase')T0.tool='paint';refresh();});row.appendChild(b);});parent.appendChild(row);
  }
  const HINT={wall:'Drag on the floor to draw a wall. It snaps to the grid.',room:'Drag a rectangle to make a room with walls and a floor.',floor:'Drag a rectangle to lay a floor.',door:'Tap a wall to put in a door. Tap it again to remove.',window:'Tap a wall to put in a window. Tap it again to remove.',stairs:'Drag in the direction the stairs should climb. They rise one level.',roof:'Drag a rectangle over the walls to put a gabled roof on.',paint:'Tap a wall, floor or roof to restyle it with the style you picked.',erase:'Tap a wall, floor, roof or stairs to remove it.'};
  function refresh(){if(!pane.hidden)show();}
  function show(){
    pane.innerHTML='';const D=house&&house.data;
    {const s=sec(pane,'Build','like a home builder');s.appendChild(el('div','note','Draw rooms on a grid, add doors, windows, stairs and roofs, change levels, restyle in one tap, then furnish with real furniture. The house stays editable and saves with the project.'));
      const r=el('div','chips');r.append(btn('Starter house','pri',()=>starter('house')),btn('Cabin','',()=>starter('cabin')),btn('Undo','',undo),btn('Redo','',redoF),btn('Clear','',()=>{ensure();push();Object.assign(house.data,newData());rebuild();bump();}));s.appendChild(r);}
    {const s=sec(pane,'Level and view');
      const r=el('div','chips');r.append(btn('−','',()=>{T0.level=Math.max(0,T0.level-1);rebuild();refresh();}),el('span','chip','Level '+(T0.level+1)),btn('+','',()=>{T0.level=Math.min(4,T0.level+1);rebuild();refresh();}));s.appendChild(r);
      const w=el('div','chips');[['up','Walls up'],['cut','Cutaway'],['down','Walls down']].forEach(([v,l])=>tog(w,l,T0.walls===v,()=>{T0.walls=v;rebuild();refresh();}));s.appendChild(w);
      const v=el('div','chips');v.append(btn('Top view','',()=>view('top')),btn('Angled view','',()=>view('iso')),btn(!D||D.lawn!==false?'Lawn: on':'Lawn: off','',()=>{ensure();house.data.lawn=!house.data.lawn;rebuild();refresh();}));s.appendChild(v);}
    {const s=sec(pane,'Tools');const r=el('div','chips');
      [['wall','Wall'],['room','Room'],['floor','Floor'],['door','Door'],['window','Window'],['stairs','Stairs'],['roof','Roof'],['paint','Restyle'],['erase','Erase']].forEach(([v,l])=>tog(r,l,T0.tool===v,()=>{T0.tool=T0.tool===v?null:v;T0.place=null;ensure();if(T0.tool)peek&&peek();refresh();}));
      r.appendChild(btn('Done','',()=>{T0.tool=null;T0.place=null;dom.style.cursor='';refresh();}));s.appendChild(r);
      s.appendChild(el('div','note',T0.tool?HINT[T0.tool]+' One finger builds, two fingers move the view.':T0.place?'Placing '+T0.place.name+'. Tap the floor. One finger places, two fingers move the view.':'Pick a tool, then build on the grid.'));
      if(T0.place){const pr=el('div','chips');pr.append(btn('Rotate 90°','',()=>{T0.rot=(T0.rot+Math.PI/2)%(Math.PI*2);toast('Turned');}),btn('Done placing','',()=>{T0.place=null;refresh();}));s.appendChild(pr);}}
    {const s=sec(pane,'Styles');swatches(s,'wall','Walls');swatches(s,'floor','Floors');swatches(s,'roof','Roofs');}
    {const s=sec(pane,'Furnish','CC0 models');s.appendChild(el('div','note','Real furniture, plants and props from Poly Haven. Pick one, then tap the floor. Placed pieces are normal objects: move, rotate, paint them in Material.'));model(s);}
    dom.style.cursor=(T0.tool||T0.place)?'crosshair':'';
  }
  return {show,fromItem(it){const data=it.data||newData(),group=new THREE.Group();const o=addGroup(it.name||'House',group,{build:data,noAuto:true});house={o,group,data};o.meta.build=data;rebuild();return o;},
    projectItem(o){return {kind:'build',name:o.name,data:o.meta.build};},off(){T0.tool=null;T0.place=null;dom.style.cursor='';if(drag){drag=null;clearGhost();}},
    isHouse:o=>!!(o&&o.meta&&o.meta.build),adopt(o){if(o&&o.meta&&o.meta.build){house={o,group:o.root,data:o.meta.build};}}};
}
