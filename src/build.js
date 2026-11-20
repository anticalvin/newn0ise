/* Build mode, in the spirit of a life-sim home builder: draw walls and rooms on a grid, lay floors, cut doors and windows,
   raise levels, add stairs and roofs, restyle with one tap, then furnish with real CC0 models. The house is one editable object
   (data, not baked geometry), so it saves with the project and you can keep changing it. */
import {modelList,thumb} from './phmodels.js';
import {createLive} from './liveplay.js';
const H=2.7,T=.16,FT=.14,LV=H+FT,GRID=.5;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const STYLES={
  wall:[['plaster','Plaster','#e9e4da','plain'],['cream','Cream','#f1e6c9','plain'],['sage','Sage','#a9b8a0','plain'],['sky','Sky','#9db8d8','plain'],['blush','Blush','#e7b8b0','plain'],['char','Charcoal','#3a3b40','plain'],
    ['fence','Fence','#a67c52','planksV'],['stripes','Stripes','#d9d2c3','stripes'],['brick','Brick','#9c4a37','bricks'],['panel','Panelling','#8a6a4a','planksV'],['tile','White tile','#e8ecef','tiles']],
  floor:[['oak','Oak','#b58b5c','planks'],['dark','Walnut','#5a3f2c','planks'],['checker','Checker','#f0f0ee','checker'],['marble','Marble','#e8e6e1','marble'],['slate','Slate','#55585e','tiles'],
    ['carpet','Carpet','#7b6a8f','noise'],['terra','Terracotta','#b55d3d','tiles'],['concrete','Concrete','#9a9a98','noise'],['water','Pool water','#3f9fd4','water'],['grass','Grass','#6f9a5b','noise'],['sand','Sand','#d8c48f','noise'],['path','Stone path','#8d8a84','tiles']],
  roof:[['shingle','Shingle','#5a4a44','shingle'],['terra','Clay','#b04a2c','shingle'],['slate','Slate','#44484f','shingle'],['thatch','Thatch','#b7a063','noise']]
};
const styleOf=(k,id)=>(STYLES[k].find(s=>s[0]===id)||STYLES[k][0]);

export function createBuild(c){
  const {THREE,addGroup,objById,S,dom,camera,controls,toast,bump,el,btn,sec,addModel,pane,peek,selectObj,LGT,walkIn,scene,stage}=c;
  let house=null;const ray=new THREE.Raycaster(),v2=new THREE.Vector2();
  const newData=()=>({walls:[],floors:[],roofs:[],stairs:[],lawn:true});
  const T0={tool:'select',sel:null,wh:H,wt:T,tuck:true,level:0,walls:'up',on:false,roofType:'gable',kit:null,style:{wall:'plaster',floor:'oak',roof:'shingle'},rot:0,place:null};
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
    else if(pat==='water'){}
    else if(pat==='shingle'){for(let y=0;y<N;y+=16){dark(.35);g.fillRect(0,y,N,2);for(let x=((y/16)%2)*16;x<N;x+=32)g.fillRect(x,y,2,16);}}
    const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;texC.set(k,t);return t;
  }
  const matC=new Map();
  const mat=(kind,id)=>{const k=kind+id;if(!matC.has(k)){const st=styleOf(kind,id);matC.set(k,st[3]==='water'?new THREE.MeshStandardMaterial({color:st[2],roughness:.04,metalness:.15,transparent:true,opacity:.72}):new THREE.MeshStandardMaterial({map:tex(kind,id),roughness:kind==='floor'&&st[3]==='marble'?.25:.85,metalness:0}));}return matC.get(k);};
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
  function addWall(g,w,i,hh,out){
    const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],L=Math.hypot(dx,dz),WH=Math.min(w.h||H,H),tt=w.t||T;hh=Math.min(hh,WH);if(L<.05||hh<=0)return;
    const ang=Math.atan2(dz,dx),ux=dx/L,uz=dz/L,y0=topY(w.l),m=mat('wall',w.m);
    const piece=(s0,s1,a,b)=>{b=Math.min(b,hh);if(s1-s0<.01||b-a<.01)return;if(out){out.push({s0,s1,a,b,ux,uz,y0,w});return;}
      const p=mesh(box(s1-s0,b-a,tt),m,{t:'wall',i});const sm=(s0+s1)/2;p.position.set(w.a[0]+ux*sm,y0+(a+b)/2,w.a[1]+uz*sm);p.rotation.y=-ang;g.add(p);};
    const items=[...(w.items||[])].sort((p,q)=>p.at-q.at);let s=-tt/2;
    items.forEach(it=>{const hw=it.w/2,l=clamp(it.at-hw,0,L),r=clamp(it.at+hw,0,L);piece(s,l,0,WH);
      if(it.t==='door'){piece(l,r,2.1,WH);if(!out)frame(g,w,i,it,0,2.1,y0,ux,uz,ang,hh);}else{piece(l,r,0,.9);piece(l,r,2.0,WH);if(!out)frame(g,w,i,it,.9,2.0,y0,ux,uz,ang,hh);}s=r;});
    piece(s,L+tt/2,0,WH);
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
  function floorPts(f){return f.pts&&f.pts.length>=3?f.pts:[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]];}
  function addFloor(g,f,i){
    if(f.l>T0.level)return;let p;
    if(f.pts&&f.pts.length>=3){const sh=new THREE.Shape(f.pts.map(q=>new THREE.Vector2(q[0],-q[1]))),geo=new THREE.ExtrudeGeometry(sh,{depth:FT,bevelEnabled:false});geo.rotateX(-Math.PI/2);p=mesh(geo,mat('floor',f.m),{t:'floor',i});p.position.y=lvY(f.l);}
    else{const w=Math.abs(f.x1-f.x0),d=Math.abs(f.z1-f.z0);if(w<.1||d<.1)return;p=mesh(box(w,FT,d),mat('floor',f.m),{t:'floor',i});p.position.set((f.x0+f.x1)/2,lvY(f.l)+FT/2,(f.z0+f.z1)/2);}
    g.add(p);
  }
  /* a curved wall is drawn as short straight pieces along an arc (k is how far the middle bulges, in metres) */
  function expand(w){
    if(!w.k||Math.abs(w.k)<.02)return [w];
    const [ax,az]=w.a,[bx,bz]=w.b,dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz);if(L<.05)return [w];
    const sg=Math.sign(w.k),sa=Math.abs(w.k),R=(L*L/4+sa*sa)/(2*sa),mx=(ax+bx)/2,mz=(az+bz)/2,nx=-dz/L,nz=dx/L,cx=mx-nx*sg*(R-sa),cz=mz-nz*sg*(R-sa);
    const a0=Math.atan2(az-cz,ax-cx),a1=Math.atan2(bz-cz,bx-cx),aM=Math.atan2(mz+nz*w.k-cz,mx+nx*w.k-cx),T2=Math.PI*2,d1=((aM-a0)%T2+T2)%T2,d2=((a1-a0)%T2+T2)%T2,da=d1<=d2?d2:d2-T2;
    const n=Math.max(4,Math.min(40,Math.ceil(Math.abs(da)*R/.55))),pts=[];for(let k=0;k<=n;k++){const an=a0+da*k/n;pts.push([cx+R*Math.cos(an),cz+R*Math.sin(an)]);}
    const out=[];for(let k=0;k<n;k++)out.push({...w,a:pts[k],b:pts[k+1],k:0,items:[]});return out;
  }
  const allWalls=D=>D.walls.flatMap(w=>expand(w));
  function addRoof(g,r,i){
    if(r.l>T0.level)return;if(r.l===T0.level&&T0.walls!=='up')return;
    const x0=Math.min(r.x0,r.x1)-.4,x1=Math.max(r.x0,r.x1)+.4,z0=Math.min(r.z0,r.z1)-.4,z1=Math.max(r.z0,r.z1)+.4,w=x1-x0,d=z1-z0;
    const along=w>=d?'x':'z',span=along==='x'?d:w,len=along==='x'?w:d,rise=clamp(span*.32,.8,2.6),m=mat('roof',r.m).clone();m.side=THREE.DoubleSide;
    if(r.t==='flat'){const p=mesh(box(w,.22,d),m,{t:'roof',i});p.position.set((x0+x1)/2,topY(r.l)+H+.11,(z0+z1)/2);g.add(p);return;}
    const sh=new THREE.Shape();sh.moveTo(-span/2,0);sh.lineTo(span/2,0);if(r.t==='shed'){sh.lineTo(span/2,rise*.85);}else sh.lineTo(0,rise);sh.closePath();
    const geo=new THREE.ExtrudeGeometry(sh,{depth:len,bevelEnabled:false});geo.translate(0,0,-len/2);
    const uv=geo.attributes.uv;for(let k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)*.5,uv.getY(k)*.5);
    const p=mesh(geo,m,{t:'roof',i});p.position.set((x0+x1)/2,topY(r.l)+H,(z0+z1)/2);if(along==='x')p.rotation.y=Math.PI/2;g.add(p);
  }
  function addStairs(g,st,i){
    if(st.l>T0.level)return;const n=Math.round(LV/.19),rise=LV/n,run=.28,ang=Math.atan2(st.dz,st.dx);
    for(let k=0;k<n;k++){const p=mesh(box(run,rise*(k+1),1.1),mat('floor','oak'),{t:'stairs',i});
      const s=(k+.5)*run;p.position.set(st.x+st.dx*s,topY(st.l)+rise*(k+1)/2,st.z+st.dz*s);p.rotation.y=-ang;g.add(p);}
  }
  function rebuild(){
    if(!house)return;const g=house.group;
    for(let k=g.children.length-1;k>=0;k--){const ch=g.children[k];g.remove(ch);ch.traverse(n=>{if(n.geometry)n.geometry.dispose();if(n.isSprite){if(n.material.map)n.material.map.dispose();n.material.dispose();}});}
    const D=house.data;
    if(D.lawn){const p=new THREE.Mesh(new THREE.PlaneGeometry(40,40),lawnM);p.rotation.x=-Math.PI/2;p.position.y=-.005;p.receiveShadow=true;p.userData.bk={t:'lawn'};g.add(p);}
    D.floors.forEach((f,i)=>addFloor(g,f,i));D.walls.forEach((w,i)=>expand(w).forEach(v=>addWall(g,v,i,wallHeight(w))));D.stairs.forEach((s,i)=>addStairs(g,s,i));D.roofs.forEach((r,i)=>addRoof(g,r,i));
    decorate(g);bump();
  }
  function ensure(){
    if(house&&objById(house.o.id))return house;
    const data=newData(),group=new THREE.Group();const o=addGroup('House',group,{build:data,noAuto:true});
    house={o,group,data};o.meta.build=data;o.meta.colliders=colliders;rebuild();return house;
  }
  /* ---- history ---- */
  const snap=()=>JSON.stringify(house.data);
  const push=()=>{hist.push(snap());if(hist.length>40)hist.shift();redo=[];};
  const apply=js=>{const d=JSON.parse(js);house.data=d;house.o.meta.build=d;rebuild();bump();};
  const undo=()=>{if(!house||!hist.length){toast('Nothing to undo.');return;}redo.push(snap());apply(hist.pop());};
  const redoF=()=>{if(!house||!redo.length)return;hist.push(snap());apply(redo.pop());};

  /* ---- pointer on the ground ---- */
  /* ---- free, CAD-style drawing: smart snapping, chains of points, arcs, polygons, exact numbers ---- */
  const SN={mode:'smart',grid:.25};
  const near=(a,p)=>Math.hypot(a[0]-p[0],a[1]-p[1]);
  function eachPoint(f){const D=house.data,l=T0.level;D.walls.forEach(w=>{if(w.l===l){f(w.a);f(w.b);}});D.floors.forEach(fl=>{if(fl.l===l)floorPts(fl).forEach(f);});PD.pts.forEach(f);}
  function snapPt(p,from){
    let x=p.x,z=p.z,kind='';
    if(SN.mode==='grid'){const g=SN.grid;x=Math.round(x/g)*g;z=Math.round(z/g)*g;kind='grid';}
    else{x=Math.round(x*100)/100;z=Math.round(z*100)/100;
      if(SN.mode==='smart'){
        let best=null,bd=.3;eachPoint(q=>{const d=Math.hypot(q[0]-x,q[1]-z);if(d<bd){bd=d;best=q;}});
        if(best){x=best[0];z=best[1];kind='point';}
        else if(from){const dx=x-from[0],dz=z-from[1],L=Math.hypot(dx,dz);
          if(L>.25){const a=Math.atan2(dz,dx),st=Math.PI/12,sa=Math.round(a/st)*st;if(Math.abs(a-sa)<.075){x=from[0]+Math.cos(sa)*L;z=from[1]+Math.sin(sa)*L;kind='angle';}}
          eachPoint(q=>{if(Math.abs(q[0]-x)<.07&&kind!=='angle'){x=q[0];kind='align';}if(Math.abs(q[1]-z)<.07&&kind!=='angle'){z=q[1];kind=kind==='align'?'align':'align';}});}
      }
    }
    return [Math.round(x*1000)/1000,Math.round(z*1000)/1000,kind];
  }
  const planeHit=(e,l)=>{
    camera.updateMatrixWorld(true);house.o.holder.updateMatrixWorld(true);const rc=dom.getBoundingClientRect();v2.set((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);ray.setFromCamera(v2,camera);
    const inv=new THREE.Matrix4().copy(house.o.holder.matrixWorld).invert(),r2=ray.ray.clone().applyMatrix4(inv),pl=new THREE.Plane(new THREE.Vector3(0,1,0),-topY(l)),p=new THREE.Vector3();
    return r2.intersectPlane(pl,p)?p:null;
  };
  const pickEl=e=>{
    camera.updateMatrixWorld(true);house.o.holder.updateMatrixWorld(true);const rc=dom.getBoundingClientRect();v2.set((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);ray.setFromCamera(v2,camera);
    const hs=ray.intersectObjects(house.group.children,true);
    const hh=hs.find(h=>{let n=h.object;while(n&&!n.userData.bk&&n.parent)n=n.parent;return n&&n.userData.bk&&n.userData.bk.t==='handle';});
    if(hh){let n=hh.object;while(!n.userData.bk)n=n.parent;return {bk:n.userData.bk,point:hh.point};}
    for(const h of hs){let n=h.object;while(n&&!n.userData.bk&&n.parent)n=n.parent;const bk=n&&n.userData.bk;if(bk&&bk.t!=='lawn'&&bk.t!=='handle'&&!h.object.userData.noPick)return {bk,point:h.point};}return null;
  };
  /* labels, outlines and handles on the selection */
  const lineM=new THREE.LineBasicMaterial({color:0x27f5c9,depthTest:false,transparent:true}),hndM=new THREE.MeshBasicMaterial({color:0xffd23d,depthTest:false,transparent:true}),
    hndM2=new THREE.MeshBasicMaterial({color:0x27f5c9,depthTest:false,transparent:true});
  function label(txt,pos,k=1){
    const cv=document.createElement('canvas');cv.width=320;cv.height=80;const g=cv.getContext('2d');g.fillStyle='rgba(14,15,18,.88)';g.beginPath();g.roundRect?g.roundRect(4,8,312,64,18):g.rect(4,8,312,64);g.fill();g.fillStyle='#27f5c9';g.font='700 34px ui-monospace,monospace';g.textAlign='center';g.fillText(txt,160,52);
    const t=new THREE.CanvasTexture(cv),sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));
    const d=house?camera.position.distanceTo(house.o.holder.localToWorld(pos.clone())):8,sc=clamp(d/9,.5,3)*k;sp.scale.set(1.6*sc,.4*sc,1);sp.position.copy(pos);sp.renderOrder=12;sp.userData.noPick=true;sp.userData.noView=true;sp.raycast=()=>{};return sp;
  }
  const hnd=(x,y,z,bk,mid)=>{const d=house?camera.position.distanceTo(house.o.holder.localToWorld(new THREE.Vector3(x,y,z))):8,r=clamp(d/55,.11,.4),m=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),mid?hndM2:hndM);m.position.set(x,y,z);m.renderOrder=10;m.userData.bk=bk;m.userData.noView=true;return m;};
  const fmt=v=>(Math.round(v*100)/100).toFixed(2)+' m';
  const angOf=w=>{let a=Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0])*180/Math.PI;return Math.round(((a%360)+360)%360*10)/10;};
  function decorate(g){
    const sel=T0.sel;if(!sel||!house)return;const D=house.data,y=topY(T0.level);
    g.traverse(n=>{const b=n.userData.bk;if(n.isMesh&&b&&b.t===sel.t&&b.i===sel.i&&!n.isSprite){n.add(new THREE.LineSegments(new THREE.EdgesGeometry(n.geometry,25),lineM));}});
    if(sel.t==='wall'){const w=D.walls[sel.i];if(!w||w.l>T0.level)return;const hy=topY(w.l)+Math.min(w.h||H,wallHeight(w))+.2,L=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
      g.add(hnd(w.a[0],hy,w.a[1],{t:'handle',k:'a',i:sel.i}),hnd(w.b[0],hy,w.b[1],{t:'handle',k:'b',i:sel.i}),hnd((w.a[0]+w.b[0])/2,hy,(w.a[1]+w.b[1])/2,{t:'handle',k:'m',i:sel.i},true));
      g.add(label(fmt(L)+'  '+angOf(w)+'°',new THREE.Vector3((w.a[0]+w.b[0])/2,hy+.45,(w.a[1]+w.b[1])/2)));}
    else if(sel.t==='floor'){const f=D.floors[sel.i];if(!f||f.l>T0.level)return;if(!f.pts){f.pts=floorPts(f).map(q=>q.slice());delete f.x0;delete f.x1;delete f.z0;delete f.z1;rebuildSoon();return;}
      f.pts.forEach((q,j)=>g.add(hnd(q[0],topY(f.l)+.25,q[1],{t:'handle',k:'p',i:sel.i,j})));
      let ar=0,cx=0,cz=0;f.pts.forEach((q,j)=>{const r=f.pts[(j+1)%f.pts.length];ar+=q[0]*r[1]-r[0]*q[1];cx+=q[0];cz+=q[1];});ar=Math.abs(ar)/2;g.add(label(ar.toFixed(1)+' m²',new THREE.Vector3(cx/f.pts.length,topY(f.l)+.8,cz/f.pts.length)));}
  }
  let rbT=0;const rebuildSoon=()=>{cancelAnimationFrame(rbT);rbT=requestAnimationFrame(()=>{rebuild();});};
  /* history */
  /* ---- tools ---- */
  const PD={pts:[],cur:null,tool:null,kind:'',arcStage:0};
  let press=null,hd=null,ghost=null;
  window.__bd={PD,T0,get press(){return press;},ph:(x,y)=>{const p=planeHit({clientX:x,clientY:y},T0.level);return p&&p.toArray();}};
  const clearGhost=()=>{if(ghost){house.group.remove(ghost);ghost.traverse(n=>{if(n.geometry)n.geometry.dispose();if(n.isSprite){if(n.material.map)n.material.map.dispose();n.material.dispose();}});ghost=null;}};
  const gm=new THREE.MeshBasicMaterial({color:0x27f5c9,transparent:true,opacity:.38,depthWrite:false});
  const wallDims=()=>({h:T0.wh,t:T0.wt});
  function ghostWall(g,a,b,y,h,t){const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(L<.03)return;const p=new THREE.Mesh(new THREE.BoxGeometry(L,h,t),gm);p.position.set((a[0]+b[0])/2,y+h/2,(a[1]+b[1])/2);p.rotation.y=-Math.atan2(dz,dx);g.add(p);
    g.add(label(fmt(L)+'  '+(Math.round(((Math.atan2(dz,dx)*180/Math.PI%360)+360)%360*10)/10)+'°',new THREE.Vector3((a[0]+b[0])/2,y+h+.4,(a[1]+b[1])/2)));}
  function paintGhost(){
    clearGhost();if(!house||!PD.tool)return;const tool=PD.tool,y=topY(T0.level),cur=PD.cur,g=new THREE.Group();g.userData.noView=true;
    const isWall=tool==='wall'||tool==='fence',h=tool==='fence'?1.1:T0.wh,t=tool==='fence'?.07:T0.wt;
    if(press&&press.drag&&(tool==='room'||tool==='floor'||tool==='roof')&&cur){const a=press.p0,b=cur,w=Math.abs(b[0]-a[0]),d=Math.abs(b[1]-a[1]);
      if(w>.05&&d>.05){const bx=new THREE.Mesh(new THREE.BoxGeometry(w,tool==='room'?H:tool==='roof'?.2:FT,d),gm);bx.position.set((a[0]+b[0])/2,y+(tool==='room'?H/2:tool==='roof'?H:FT/2),(a[1]+b[1])/2);g.add(bx);g.add(label(w.toFixed(2)+' × '+d.toFixed(2)+' m',new THREE.Vector3((a[0]+b[0])/2,y+H+.4,(a[1]+b[1])/2)));}}
    else if(press&&press.drag&&isWall&&cur)ghostWall(g,press.p0,cur,y,h,t);
    else if(press&&press.drag&&tool==='stairs'&&cur){const dx=cur[0]-press.p0[0],dz=cur[1]-press.p0[1],L=Math.hypot(dx,dz);if(L>.2){const p=new THREE.Mesh(new THREE.BoxGeometry(4.2,.15,1.1),gm);const ang=Math.atan2(dz,dx);p.position.set(press.p0[0]+Math.cos(ang)*2.1,y+.1,press.p0[1]+Math.sin(ang)*2.1);p.rotation.y=-ang;g.add(p);}}
    else if(PD.pts.length){
      const pts=PD.pts;
      if(isWall){for(let k=0;k<pts.length-1;k++)ghostWall(g,pts[k],pts[k+1],y,h,t);if(cur)ghostWall(g,pts[pts.length-1],cur,y,h,t);}
      else if(tool==='arc'){if(PD.arcStage===1&&cur)ghostWall(g,pts[0],cur,y,T0.wh,T0.wt);
        else if(PD.arcStage===2&&cur){const a=pts[0],b=pts[1],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),k=((cur[0]-a[0])*(-dz)+(cur[1]-a[1])*dx)/L;expand({a,b,k,l:T0.level}).forEach(v=>ghostWall(g,v.a,v.b,y,T0.wh,T0.wt));}}
      else{const line=[...pts];if(cur)line.push(cur);for(let k=0;k<line.length-1;k++)ghostWall(g,line[k],line[k+1],y,tool==='room'?T0.wh:.05,tool==='room'?T0.wt:.05);}
    }
    if(cur&&cur[2]){const rm=new THREE.Mesh(new THREE.TorusGeometry(.18,.025,6,20),new THREE.MeshBasicMaterial({color:cur[2]==='point'?0xffd23d:0x27f5c9,depthTest:false,transparent:true}));rm.rotation.x=Math.PI/2;rm.position.set(cur[0],y+.03,cur[1]);rm.renderOrder=9;g.add(rm);}
    ghost=g;house.group.add(g);bump();
  }
  const dimsFor=(tool,isFence)=>isFence?{h:1.1,t:.07}:{h:T0.wh!==H?T0.wh:undefined,t:T0.wt!==T?T0.wt:undefined};
  function addWallData(a,b,fence,extra){const D=house.data,d=dimsFor('wall',fence),w={a:[a[0],a[1]],b:[b[0],b[1]],l:T0.level,m:fence?'fence':T0.style.wall,items:[],...extra};if(fence){w.h=1.1;w.t=.07;}else{if(d.h)w.h=d.h;if(d.t)w.t=d.t;}D.walls.push(w);return w;}
  const rectOf=(a,b)=>({x0:Math.min(a[0],b[0]),z0:Math.min(a[1],b[1]),x1:Math.max(a[0],b[0]),z1:Math.max(a[1],b[1])});
  function finishChain(){
    const tool=PD.tool,pts=PD.pts;
    if((tool==='room'||tool==='floor')&&pts.length>=3){push();const D=house.data;D.floors.push({pts:pts.map(q=>[q[0],q[1]]),l:T0.level,m:T0.style.floor});
      if(tool==='room')for(let k=0;k<pts.length;k++)addWallData(pts[k],pts[(k+1)%pts.length],false);rebuild();bump();toast(tool==='room'?'Room made.':'Floor laid.');}
    resetChain();
  }
  function resetChain(){PD.pts=[];PD.cur=null;PD.arcStage=0;press=null;clearGhost();}
  function drawTap(p,tool){
    const pts=PD.pts,D=house.data;
    if(!pts.length){pts.push(p);PD.arcStage=1;paintGhost();return;}
    const last=pts[pts.length-1];
    if(tool==='wall'||tool==='fence'){if(near(last,p)<.15){resetChain();return;}push();addWallData(last,p,tool==='fence');pts.push(p);
      if(pts.length>2&&near(pts[0],p)<.3){rebuild();bump();toast('Loop closed.');resetChain();return;}rebuild();bump();paintGhost();return;}
    if(tool==='room'||tool==='floor'){if(pts.length>=3&&near(pts[0],p)<.3){finishChain();return;}if(near(last,p)<.15){finishChain();return;}pts.push(p);paintGhost();return;}
    if(tool==='arc'){if(PD.arcStage===1){if(near(last,p)<.2)return;pts.push(p);PD.arcStage=2;paintGhost();return;}
      if(PD.arcStage===2){const a=pts[0],b=pts[1],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),k=((p[0]-a[0])*(-dz)+(p[1]-a[1])*dx)/L;push();addWallData(a,b,false,{k:Math.abs(k)<.05?0:Math.round(k*100)/100});rebuild();bump();resetChain();}}
  }
  function dragCommit(tool,a,b){
    const D=house.data,l=T0.level,st=T0.style;
    if(tool==='wall'||tool==='fence'){if(near(a,b)<.2)return false;push();addWallData(a,b,tool==='fence');}
    else if(tool==='room'){const r=rectOf(a,b);if(r.x1-r.x0<.6||r.z1-r.z0<.6)return false;push();D.floors.push({pts:[[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]],l,m:st.floor});[[[r.x0,r.z0],[r.x1,r.z0]],[[r.x1,r.z0],[r.x1,r.z1]],[[r.x1,r.z1],[r.x0,r.z1]],[[r.x0,r.z1],[r.x0,r.z0]]].forEach(([p,q])=>addWallData(p,q,false));}
    else if(tool==='floor'){const r=rectOf(a,b);if(r.x1-r.x0<.4||r.z1-r.z0<.4)return false;push();D.floors.push({pts:[[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]],l,m:st.floor});}
    else if(tool==='roof'){const r=rectOf(a,b);if(r.x1-r.x0<1||r.z1-r.z0<1)return false;push();D.roofs.push({...r,l,m:st.roof,t:T0.roofType});}
    else if(tool==='stairs'){const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(L<.3)return false;push();D.stairs.push({x:a[0],z:a[1],dx:dx/L,dz:dz/L,l});}
    else return false;
    rebuild();bump();return true;
  }
  function click(e,tool){
    const hit=pickEl(e),D=house.data;
    if(tool==='door'||tool==='window'){
      if(!hit||hit.bk.t!=='wall'){toast('Tap a wall to put a '+tool+' in it.');return;}
      const w=D.walls[hit.bk.i];if(!w)return;if(w.k){toast('Curved walls can’t take doors or windows. Use a straight wall.');return;}const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],L=Math.hypot(dx,dz);
      const loc=hit.point.clone().applyMatrix4(new THREE.Matrix4().copy(house.o.holder.matrixWorld).invert()),s=clamp(((loc.x-w.a[0])*dx+(loc.z-w.a[1])*dz)/L,0,L);
      const wd=tool==='door'?1:1.2;if(L<wd+.3){toast('That wall is too short.');return;}
      push();w.items=w.items||[];const ex=w.items.findIndex(it=>Math.abs(it.at-s)<it.w/2+.05);
      if(ex>=0)w.items.splice(ex,1);else w.items.push({t:tool,at:clamp(Math.round(s*100)/100,wd/2+.1,L-wd/2-.1),w:wd});
      T0.sel={t:'wall',i:hit.bk.i};rebuild();bump();return;}
    if(tool==='erase'){if(!hit||hit.bk.t==='handle')return;push();const {t,i}=hit.bk;const k={wall:'walls',floor:'floors',roof:'roofs',stairs:'stairs'}[t];if(k)D[k].splice(i,1);T0.sel=null;rebuild();bump();return;}
    if(tool==='paint'){if(!hit||hit.bk.t==='handle')return;const {t,i}=hit.bk,k={wall:'walls',floor:'floors',roof:'roofs'}[t];if(!k)return;push();D[k][i].m=T0.style[t];rebuild();bump();return;}
  }
  /* put a piece of furniture against a wall if it is placed close to one: turn it to face the room and tuck it in */
  function tuckToWall(o,p){
    if(!T0.tuck||!house)return;try{
      let best=null,bd=.75;house.data.walls.forEach(w=>{if(w.l!==T0.level||w.k)return;const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],L2=dx*dx+dz*dz;if(L2<.01)return;let t=((p.x-w.a[0])*dx+(p.z-w.a[1])*dz)/L2;t=clamp(t,0,1);const qx=w.a[0]+dx*t,qz=w.a[1]+dz*t,d=Math.hypot(p.x-qx,p.z-qz);if(d<bd){bd=d;best={w,qx,qz,dx,dz};}});
      if(!best)return;const L=Math.hypot(best.dx,best.dz),nx0=-best.dz/L,nz0=best.dx/L,side=((p.x-best.qx)*nx0+(p.z-best.qz)*nz0)>=0?1:-1,nx=nx0*side,nz=nz0*side;
      const box=new THREE.Box3().setFromObject(o.holder),sz=box.getSize(new THREE.Vector3()),dep=Math.min(sz.x,sz.z)>.01?Math.min(Math.max(sz.z,.2),Math.max(sz.x,.2)):.5,tt=(best.w.t||T);
      const rotY=Math.atan2(nx,nz),wp=house.o.holder.localToWorld(new THREE.Vector3(best.qx+nx*(tt/2+dep/2+.01),topY(T0.level),best.qz+nz*(tt/2+dep/2+.01)));
      o.holder.rotation.y=rotY;o.holder.position.set(wp.x,wp.y,wp.z);o.holder.updateMatrixWorld(true);bump();}catch(e){}
  }
  async function placeAt(p){
    const pos=house.o.holder.localToWorld(new THREE.Vector3(p.x,topY(T0.level),p.z)),o=await addModel(T0.place.id,T0.place.name,{pos:[pos.x,pos.y,pos.z],rotY:T0.rot});if(o)tuckToWall(o,p);
  }
  const moved=(a,e)=>Math.hypot(e.clientX-a.x,e.clientY-a.y)>9;
  function down(e){
    if(!T0.on||(!T0.tool&&!T0.place))return;
    if((press||hd)&&e.pointerType==='touch'){press=null;hd=null;clearGhost();return;}
    if(e.button!==0||e.altKey||(!e.isPrimary&&e.pointerType==='touch'))return;
    if(T0.tool==='select'&&!T0.place&&!house)return;
    if(!(T0.tool==='select'&&!T0.place))ensure();
    if(T0.place){const p=planeHit(e,T0.level);if(!p)return;e.stopImmediatePropagation();e.preventDefault();placeAt(p);return;}
    if(T0.tool==='kit'&&T0.kit){const p=planeHit(e,T0.level);if(!p)return;e.stopImmediatePropagation();e.preventDefault();placeKit(T0.kit,p);return;}
    const tool=T0.tool;
    if(tool==='select'){const h=house?pickEl(e):null;if(!h)return;e.stopImmediatePropagation();e.preventDefault();try{dom.setPointerCapture(e.pointerId);}catch(_){}
      if(h&&h.bk.t==='handle'){push();const w=house.data.walls[h.bk.i],f=house.data.floors[h.bk.i];hd={id:e.pointerId,bk:h.bk,start:planeHit(e,T0.level),a0:w&&w.a.slice(),b0:w&&w.b.slice()};return;}
      press={id:e.pointerId,x:e.clientX,y:e.clientY,sel:h?h.bk:null,tool};return;}
    if(['door','window','erase','paint'].includes(tool)){const h=pickEl(e);if(!h)return;e.stopImmediatePropagation();e.preventDefault();click(e,tool);return;}
    const p=planeHit(e,T0.level);if(!p)return;e.stopImmediatePropagation();e.preventDefault();
    try{dom.setPointerCapture(e.pointerId);}catch(_){}
    if(PD.tool!==tool)resetChain();PD.tool=tool;
    const from=PD.pts.length?PD.pts[PD.pts.length-1]:null,sp=snapPt(p,from);
    press={id:e.pointerId,x:e.clientX,y:e.clientY,p0:sp,drag:false,tool};PD.cur=sp;
  }
  function move(e){
    if(!T0.on)return;
    if(hd&&e.pointerId===hd.id){e.stopImmediatePropagation();const p=planeHit(e,T0.level);if(!p)return;const D=house.data,k=hd.bk.k;
      if(k==='m'&&hd.start){const dx=p.x-hd.start.x,dz=p.z-hd.start.z,w=D.walls[hd.bk.i];w.a=[hd.a0[0]+dx,hd.a0[1]+dz];w.b=[hd.b0[0]+dx,hd.b0[1]+dz];}
      else if(k==='a'||k==='b'){const w=D.walls[hd.bk.i],other=k==='a'?w.b:w.a,sp=snapPt(p,other);w[k]=[sp[0],sp[1]];}
      else if(k==='p'){const f=D.floors[hd.bk.i],sp=snapPt(p,null);f.pts[hd.bk.j]=[sp[0],sp[1]];}
      rebuildSoon();return;}
    if(press&&press.id===e.pointerId){e.stopImmediatePropagation();
      if(press.tool==='select')return;
      const p=planeHit(e,T0.level);if(!p)return;if(moved(press,e))press.drag=true;
      const from=press.drag?press.p0:(PD.pts.length?PD.pts[PD.pts.length-1]:null);PD.cur=snapPt(p,press.drag?press.p0:from);paintGhost();return;}
    /* hover: with a mouse or a controller cursor, show where the next point lands */
    if(PD.tool&&PD.tool===T0.tool&&PD.pts.length&&!press&&house){const p=planeHit(e,T0.level);if(p){PD.cur=snapPt(p,PD.pts[PD.pts.length-1]);paintGhost();}}
  }
  function up(e){
    if(!T0.on)return;
    if(hd&&e.pointerId===hd.id){e.stopImmediatePropagation();hd=null;rebuild();bump();refresh();return;}
    if(!press||e.pointerId!==press.id)return;e.stopImmediatePropagation();const pr=press;press=null;
    if(pr.tool==='select'){if(!moved(pr,e)){T0.sel=pr.sel&&pr.sel.t!=='lawn'?{t:pr.sel.t,i:pr.sel.i}:null;rebuild();refresh();}return;}
    const tool=pr.tool;
    if(pr.drag){const ok=dragCommit(tool,pr.p0,PD.cur||pr.p0);clearGhost();if(ok){PD.pts=[];PD.cur=null;}return;}
    if(['wall','fence','room','floor','arc'].includes(tool)){drawTap(pr.p0,tool);return;}
    clearGhost();
  }
  dom.addEventListener('pointerdown',down,true);dom.addEventListener('pointermove',move,true);dom.addEventListener('pointerup',up,true);dom.addEventListener('pointercancel',e=>{press=null;hd=null;clearGhost();},true);
  addEventListener('keydown',e=>{if(!T0.tool||e.target&&e.target.matches&&e.target.matches('input,textarea,select'))return;
    if(e.key==='Escape'){if(PD.pts.length||press){resetChain();}else{T0.tool='select';T0.sel=null;rebuildSoon();paintTB();refresh();}}
    else if(e.key==='Enter'){finishChain();}else if(e.key==='Backspace'&&PD.pts.length){PD.pts.pop();paintGhost();}});

  /* ---- walking: the walls become solid boxes, doorways stay open ---- */
  function colliders(){
    if(!house)return [];const hm=house.o.holder.matrixWorld,out=[];hm&&house.o.holder.updateMatrixWorld(true);
    allWalls(house.data).forEach(w=>{const parts=[];addWall(null,w,0,H,parts);const tt=w.t||T;
      parts.forEach(pc=>{const len=pc.s1-pc.s0,n=Math.max(1,Math.ceil(len/.4)),half=len/n/2;
        for(let k=0;k<n;k++){const sm=pc.s0+(k+.5)*len/n,cx=w.a[0]+pc.ux*sm,cz=w.a[1]+pc.uz*sm,ex=Math.abs(pc.ux)*half+Math.abs(pc.uz)*tt/2,ez=Math.abs(pc.uz)*half+Math.abs(pc.ux)*tt/2;
          out.push(new THREE.Box3(new THREE.Vector3(cx-ex,pc.y0+pc.a,cz-ez),new THREE.Vector3(cx+ex,pc.y0+pc.b,cz+ez)).applyMatrix4(hm));}});});
    return out;
  }
  /* ---- furnish a whole room in one tap: pick matching models from the library and set them out ---- */
  const KITS=[
    ['Living room',[['sofa|couch',0,-1.3,0],['coffee.?table|low.?table|table',0,.1,0],['arm.?chair|chair',-1.9,.1,Math.PI/2],['plant|vase|flower',1.9,-1.6,0],['lamp|light',-1.8,-1.7,0],['tv|television|cabinet|sideboard|shelf',0,1.8,Math.PI]]],
    ['Bedroom',[['bed',0,0,0],['bedside|night|drawer|table',1.5,-.9,0],['wardrobe|cabinet|dresser|shelf',-1.7,1.5,Math.PI],['lamp|light',-1.5,-1.1,0],['rug|carpet|plant',1.6,1.4,0]]],
    ['Dining',[['table',0,0,0],['chair',-.9,0,Math.PI/2],['chair',.9,0,-Math.PI/2],['chair',0,-.9,0],['chair',0,.9,Math.PI],['lamp|plant|vase',1.8,1.6,0]]],
    ['Kitchen',[['fridge|refrigerator',-1.6,-1.6,0],['stove|oven|cooker|kitchen',0,-1.7,0],['table',0,.4,0],['chair',-.8,.4,Math.PI/2],['chair',.8,.4,-Math.PI/2],['pot|pan|kettle|bowl',0,.4,0]]],
    ['Garden',[['tree',0,0,0],['bush|shrub|plant',2,1,0],['rock|stone',-1.8,1.1,0],['bench|chair',0,2.2,Math.PI],['flower|plant',-2,-1.5,0]]]
  ];
  async function placeKit(kit,p){
    if(!lib){try{lib=await (libP=libP||modelList());}catch(e){toast('The model library needs a connection.');return;}}
    toast('Furnishing: '+kit[0]+'…',3500);const cr=Math.cos(T0.rot),sr=Math.sin(T0.rot);let placed=0;
    for(const [re,dx,dz,ry] of kit[1]){const rx=new RegExp(re,'i');let pool=lib.filter(x=>rx.test(x.name));if(!pool.length)pool=lib.filter(x=>x.tags.some(t=>rx.test(t)));if(!pool.length)continue;
      const m=pool[Math.floor(Math.random()*Math.min(pool.length,10))],ox=dx*cr-dz*sr,oz=dx*sr+dz*cr;
      const pos=house.o.holder.localToWorld(new THREE.Vector3(Math.round((p.x+ox)/.25)*.25,topY(T0.level),Math.round((p.z+oz)/.25)*.25));
      const o=await addModel(m.id,m.name,{pos:[pos.x,pos.y,pos.z],rotY:ry+T0.rot});if(o)placed++;}
    toast(placed?kit[0]+': '+placed+' pieces placed. Move any of them like a normal object.':'Couldn’t find matching furniture in the library.',4500);
  }
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
  function bounds(){const D=house.data,b=new THREE.Box3();let any=false;D.floors.forEach(f=>{floorPts(f).forEach(q=>b.expandByPoint(new THREE.Vector3(q[0],0,q[1])));any=true;});D.walls.forEach(w=>{b.expandByPoint(new THREE.Vector3(w.a[0],0,w.a[1]));b.expandByPoint(new THREE.Vector3(w.b[0],0,w.b[1]));any=true;});return any?b:new THREE.Box3(new THREE.Vector3(-4,0,-4),new THREE.Vector3(4,0,4));}
  function view(kind){ensure();const b=bounds(),cn=b.getCenter(new THREE.Vector3()),sz=b.getSize(new THREE.Vector3()),d=Math.max(8,Math.max(sz.x,sz.z)*1.5)*((camera.aspect||1)<1?2.2:1),y=topY(T0.level);
    const t=house.o.holder.localToWorld(new THREE.Vector3(cn.x,y,cn.z));controls.target.copy(t);
    if(kind==='top')camera.position.set(t.x,t.y+d*1.15,t.z+d*.2);else camera.position.set(t.x+d*.7,t.y+d*.8,t.z+d*.9);controls.update();S.needFrame=false;}
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
  const HINT={select:'Tap a wall, floor or roof to select it. Drag the yellow handles to reshape. Drag empty space to move the view.',arc:'Tap the start, tap the end, then tap where the curve should bulge.',kit:'Tap the middle of a room to furnish it.',fence:'Drag to draw a low fence.',wall:'Tap points to draw connected walls, or drag one wall. Tap the last point again to finish.',room:'Tap corners to outline any shape, tap the first corner to close it. Or drag for a rectangle.',floor:'Tap corners to outline a floor, tap the first to close it. Or drag a rectangle.',door:'Tap a wall to add a door. Tap again to remove.',window:'Tap a wall to add a window. Tap again to remove.',stairs:'Drag the way the stairs climb. They rise one level.',roof:'Drag a rectangle over the walls for a roof.',paint:'Tap a wall, floor or roof to restyle it with the style you chose.',erase:'Tap a wall, floor, roof or stairs to remove it.'};
  const ICON={select:'<path d="M6 3l12 9-5.5 1.2L15 19l-2.2 1-2.6-5.7L6 17z"/>',arc:'<path d="M4 18C4 9 9 5 20 5"/><circle cx="4" cy="18" r="1.3"/><circle cx="20" cy="5" r="1.3"/>',wall:'<path d="M3 18V7h18v11M3 12.5h18M9 7v5.5M15 12.5V18"/>',room:'<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 12h6M14 19v-3"/>',fence:'<path d="M5 20V8l1.5-2L8 8v12M11 20V8l1.5-2L14 8v12M17 20V8l1.5-2L20 8v12M3 12h18M3 17h18"/>',floor:'<path d="M3 15l9-5 9 5-9 5zM3 11l9-5 9 5"/>',door:'<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="15" cy="13" r=".9"/>',window:'<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M12 5v14M5 12h14"/>',stairs:'<path d="M4 20h4v-4h4v-4h4V8h4"/>',roof:'<path d="M3 13l9-8 9 8M6 11.5V19h12v-7.5"/>',paint:'<path d="M5 17l8-9 4 4-9 8H5zM14 6l2-2 4 4-2 2"/>',erase:'<path d="M6 20h11M5 15l9-9 5 5-6 6H8z"/>',undo:'<path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 8"/>',redo:'<path d="M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 8"/>',up:'<path d="M6 14l6-6 6 6"/>',down:'<path d="M6 10l6 6 6-6"/>'};
  const svg=k=>'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICON[k]+'</svg>';
  /* a floating build bar over the viewport, like a home builder's tool strip */
  const TOOLS=[['select','Select'],['wall','Wall'],['arc','Curve'],['room','Room'],['floor','Floor'],['door','Door'],['window','Window'],['stairs','Stairs'],['roof','Roof'],['fence','Fence'],['paint','Restyle'],['erase','Erase']];
  const tb=document.createElement('div');tb.id='bdtb';tb.setAttribute('role','toolbar');tb.setAttribute('aria-label','Build tools');tb.hidden=true;document.body.appendChild(tb);
  const css=document.createElement('style');css.textContent=`#bdtb{position:fixed;left:50%;transform:translateX(-50%);z-index:47;display:flex;gap:2px;align-items:stretch;max-width:calc(100vw - 12px);overflow-x:auto;padding:5px;border-radius:20px;background:rgba(18,18,20,.78);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 28px rgba(0,0,0,.45);scrollbar-width:none}
#bdtb::-webkit-scrollbar{display:none}
#bdtb button{flex:none;min-width:52px;min-height:52px;padding:4px 2px;border:0;border-radius:14px;background:transparent;color:#e8e9ed;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:700 9px var(--lab,monospace);letter-spacing:.04em;text-transform:uppercase}
#bdtb button[aria-pressed=true]{background:var(--accent,#e9dfcb);color:#111}
#bdtb i{width:1px;margin:8px 3px;background:rgba(255,255,255,.18);flex:none}
.bd-nav{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:none;position:sticky;top:0;z-index:2;background:var(--panel,#16171b)}.bd-nav::-webkit-scrollbar{display:none}
.bd-nav button{flex:1 0 auto;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--raise);color:inherit;font:700 11px var(--lab,monospace);letter-spacing:.06em;text-transform:uppercase}
.bd-nav button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#111}
.bd-sw{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 10px}
.bd-sw button{padding:0;border:2px solid transparent;border-radius:14px;overflow:hidden;background:var(--raise);color:inherit;min-height:44px}
.bd-sw button[aria-pressed=true]{border-color:var(--accent)}
.bd-sw canvas{display:block;width:100%;aspect-ratio:1}
.bd-sw span{display:block;padding:3px 2px 5px;font:600 9.5px var(--lab,monospace);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bd-lv{display:flex;align-items:center;gap:8px}.bd-lv b{min-width:78px;text-align:center;font:800 13px var(--disp,system-ui)}
#pane_build .chip,#pane_build .btn{min-height:44px}
.bd-num{display:grid;grid-template-columns:minmax(80px,1fr) 44px 86px 44px 22px;gap:4px;align-items:center;margin:3px 0}
.bd-num span{font:600 11px var(--lab,monospace);color:var(--mute)}
.bd-num button{min-height:44px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:inherit;font:700 18px system-ui}
.bd-num input{min-height:44px;border-radius:12px;border:1px solid var(--line);background:var(--bg,#0d0d10);color:inherit;font:700 14px var(--lab,monospace);text-align:center;width:100%;box-sizing:border-box}
.bd-num em{font:600 10px var(--lab,monospace);color:var(--mute);font-style:normal}`;document.head.appendChild(css);
  const tbBtn=(key,label,fn,extra)=>{const b=document.createElement('button');b.type='button';b.dataset.k=key;b.innerHTML=svg(key)+'<span>'+label+'</span>';b.setAttribute('aria-label',label);b.addEventListener('click',fn);if(extra)b.dataset.x=extra;return b;};
  const setTool=v=>{resetChain();T0.tool=T0.tool===v&&v!=='select'?'select':v;T0.place=null;T0.kit=null;if(T0.tool!=='select')ensure();if(T0.tool!=='select')peek&&peek();paintTB();refresh();};
  const lvBtn=(d)=>{const b=document.createElement('button');b.type='button';b.innerHTML=svg(d>0?'up':'down')+'<span>'+(d>0?'Up':'Down')+'</span>';b.setAttribute('aria-label',d>0?'Level up':'Level down');b.addEventListener('click',()=>{T0.level=clamp(T0.level+d,0,4);rebuild();paintTB();refresh();});return b;};
  TOOLS.forEach(([k,l])=>tb.appendChild(tbBtn(k,l,()=>setTool(k))));
  {const sep=document.createElement('i');tb.appendChild(sep);tb.appendChild(tbBtn('undo','Undo',undo));tb.appendChild(tbBtn('redo','Redo',redoF));const s2=document.createElement('i');tb.appendChild(s2);tb.appendChild(lvBtn(-1));const lv=document.createElement('button');lv.type='button';lv.dataset.lv='1';lv.style.minWidth='44px';lv.style.pointerEvents='none';tb.appendChild(lv);tb.appendChild(lvBtn(1));}
  function paintTB(){tb.querySelectorAll('button[data-k]').forEach(b=>{if(TOOLS.some(t=>t[0]===b.dataset.k))b.setAttribute('aria-pressed',T0.tool===b.dataset.k);});const lv=tb.querySelector('[data-lv]');if(lv)lv.innerHTML='<span style="font-size:13px">L'+(T0.level+1)+'</span>';}
  let tbOn=false,tbT=0;
  const placeTB=()=>{const ob=document.getElementById('objbar'),base=getComputedStyle(document.documentElement).getPropertyValue('--objb').trim()||'calc(54px + env(safe-area-inset-bottom))';tb.style.bottom='calc('+base+' + '+(ob&&!ob.hidden?'62px':'0px')+')';};
  const showTB=v=>{tbOn=v;tb.hidden=!v;clearInterval(tbT);if(v){paintTB();placeTB();tbT=setInterval(placeTB,500);}};

  /* the sim */
  const LIVE=createLive({THREE,S,scene,objById,toast,el,btn,sec,stage,bump,dom,camera,host:{colliders,bounds:()=>bounds(),toWorld:v=>house?house.o.holder.localToWorld(v.clone()):v.clone(),floorY:()=>house?house.o.holder.localToWorld(new THREE.Vector3(0,topY(0),0)).y:FT,busy:()=>!!((T0.tool&&T0.tool!=='select')||T0.place)}});

  /* a number you can type or nudge, like a CAD property field */
  function numRow(parent,label,get,set,o={}){
    const {step=.05,min=-1e4,max=1e4,unit=''}=o,r=el('div','bd-num'),inp=document.createElement('input');
    inp.type='number';inp.step=String(step);inp.inputMode='decimal';inp.value=(+get()).toFixed(2);inp.setAttribute('aria-label',label);
    const apply=v=>{v=+v;if(!isFinite(v))return;v=clamp(v,min,max);push();set(v);rebuild();bump();inp.value=(+get()).toFixed(2);};
    inp.addEventListener('change',()=>apply(inp.value));
    const mk=(t,d)=>{const b=el('button','',t);b.type='button';b.setAttribute('aria-label',(d>0?'Increase ':'Decrease ')+label);b.addEventListener('click',()=>apply((+get())+d*step));return b;};
    r.append(el('span','',label),mk('−',-1),inp,mk('+',1),el('em','',unit));parent.appendChild(r);
  }
  function inspector(parent){
    const sel=T0.sel,D=house&&house.data;if(!sel||!D)return;
    const w=sel.t==='wall'?D.walls[sel.i]:sel.t==='floor'?D.floors[sel.i]:sel.t==='roof'?D.roofs[sel.i]:sel.t==='stairs'?D.stairs[sel.i]:null;if(!w){T0.sel=null;return;}
    const s=sec(parent,'Selected: '+({wall:'Wall',floor:'Floor',roof:'Roof',stairs:'Stairs'})[sel.t],'exact values');
    if(sel.t==='wall'){
      const L=()=>Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
      numRow(s,'Length',L,v=>{const a=Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]);w.b=[w.a[0]+Math.cos(a)*v,w.a[1]+Math.sin(a)*v];},{step:.05,min:.2,unit:'m'});
      numRow(s,'Angle',()=>angOf(w),v=>{const l=L(),a=v*Math.PI/180;w.b=[w.a[0]+Math.cos(a)*l,w.a[1]+Math.sin(a)*l];},{step:1,min:0,max:360,unit:'°'});
      numRow(s,'Height',()=>w.h||H,v=>{w.h=clamp(v,.2,H);if(Math.abs(w.h-H)<.001)delete w.h;},{step:.05,min:.2,max:H,unit:'m'});
      numRow(s,'Thickness',()=>w.t||T,v=>{w.t=clamp(v,.03,.8);if(Math.abs(w.t-T)<.001)delete w.t;},{step:.01,min:.03,max:.8,unit:'m'});
      numRow(s,'Curve',()=>w.k||0,v=>{w.k=Math.abs(v)<.02?0:v;if(!w.k){delete w.k;}else w.items=[];},{step:.1,min:-6,max:6,unit:'m'});
      (w.items||[]).forEach((it,j)=>{const r=el('div','sub',(it.t==='door'?'Door ':'Window ')+(j+1));s.appendChild(r);
        numRow(s,'Position',()=>it.at,v=>{it.at=clamp(v,it.w/2+.05,L()-it.w/2-.05);},{step:.05,unit:'m'});numRow(s,'Width',()=>it.w,v=>{it.w=clamp(v,.5,3);it.at=clamp(it.at,it.w/2+.05,L()-it.w/2-.05);},{step:.05,min:.5,max:3,unit:'m'});
        s.appendChild(btn('Remove','',()=>{push();w.items.splice(j,1);rebuild();bump();refresh();}));});
      const st=el('div','chips');STYLES.wall.forEach(([id,nm])=>tog(st,nm,w.m===id,()=>{push();w.m=id;rebuild();bump();refresh();}));s.appendChild(el('div','sub','Style'));s.appendChild(st);
    }else if(sel.t==='floor'){
      const f=w;if(f.pts){let ar=0;f.pts.forEach((q,j)=>{const r=f.pts[(j+1)%f.pts.length];ar+=q[0]*r[1]-r[0]*q[1];});s.appendChild(el('div','note','Area '+(Math.abs(ar)/2).toFixed(1)+' m². Drag the yellow handles to move corners.'));}
      else s.appendChild(el('div','note','Tap again to edit its corners.'));
      const st=el('div','chips');STYLES.floor.forEach(([id,nm])=>tog(st,nm,f.m===id,()=>{push();f.m=id;rebuild();bump();refresh();}));s.appendChild(el('div','sub','Style'));s.appendChild(st);
      s.appendChild(btn('Add walls around it','',()=>{if(!f.pts)return;push();for(let k=0;k<f.pts.length;k++)addWallData(f.pts[k],f.pts[(k+1)%f.pts.length],false);rebuild();bump();toast('Walls added.');}));
      s.appendChild(btn('Add a roof','',()=>{const xs=floorPts(f).map(q=>q[0]),zs=floorPts(f).map(q=>q[1]);push();D.roofs.push({x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs),l:f.l,m:T0.style.roof,t:T0.roofType});rebuild();bump();}));
    }else if(sel.t==='roof'){
      const st=el('div','chips');STYLES.roof.forEach(([id,nm])=>tog(st,nm,w.m===id,()=>{push();w.m=id;rebuild();bump();refresh();}));s.appendChild(st);
      const rt=el('div','chips');[['gable','Gabled'],['flat','Flat'],['shed','Shed']].forEach(([v,l])=>tog(rt,l,(w.t||'gable')===v,()=>{push();w.t=v;rebuild();bump();refresh();}));s.appendChild(rt);
    }
    const r=el('div','chips');r.append(btn('Delete','',()=>{push();const k={wall:'walls',floor:'floors',roof:'roofs',stairs:'stairs'}[sel.t];D[k].splice(sel.i,1);T0.sel=null;rebuild();bump();refresh();}),btn('Deselect','',()=>{T0.sel=null;rebuild();refresh();}));s.appendChild(r);
  }
  let sub='build';
  const SUBS=[['build','Build'],['styles','Styles'],['furnish','Furnish'],['live','Live']];
  function swatches(parent,kind,label){
    parent.appendChild(el('div','sub',label));const g=el('div','bd-sw');
    STYLES[kind].forEach(([id,nm,col,pat])=>{const b=el('button');b.type='button';b.title=nm;b.setAttribute('aria-pressed',T0.style[kind]===id);
      const cv=document.createElement('canvas');cv.width=cv.height=64;const x=cv.getContext('2d');
      if(pat==='water'){x.fillStyle=col;x.fillRect(0,0,64,64);}else{const im=tex(kind,id).image;x.drawImage(im,0,0,64,64);}
      b.append(cv,el('span','',nm));b.addEventListener('click',()=>{T0.style[kind]=id;if(!T0.tool||T0.tool==='erase'||T0.tool==='door'||T0.tool==='window')T0.tool='paint';paintTB();refresh();});g.appendChild(b);});
    parent.appendChild(g);
  }
  function refresh(){if(!pane.hidden)show();}
  function show(){
    pane.innerHTML='';const D=house&&house.data;T0.on=true;showTB(true);LIVE.showHud(true);
    const nv=el('div','bd-nav');nv.setAttribute('role','tablist');SUBS.forEach(([k,l])=>{const b=el('button','',l);b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',k===sub);b.addEventListener('click',()=>{sub=k;const sc=pane.parentElement;if(sc)sc.scrollTop=0;show();});nv.appendChild(b);});pane.appendChild(nv);
    if(sub==='build'){
      {const s=sec(pane,'Start here');s.appendChild(el('div','note',T0.tool?HINT[T0.tool]+' One finger builds, two fingers move the view.':'Pick a tool from the bar over the picture, or start with a ready-made home.'));
        const r=el('div','chips');r.append(btn('Starter house','pri',()=>starter('house')),btn('Cabin','',()=>starter('cabin')),btn('Clear all','',()=>{ensure();push();Object.assign(house.data,newData());rebuild();bump();}));s.appendChild(r);
        if(T0.tool==='roof'){const rt=el('div','chips');[['gable','Gabled'],['flat','Flat'],['shed','Shed']].forEach(([v,l])=>tog(rt,l,T0.roofType===v,()=>{T0.roofType=v;refresh();}));s.appendChild(rt);}
        if(T0.tool&&T0.tool!=='select'){const fr=el('div','chips');fr.append(btn('Finish','pri',()=>{finishChain();}),btn('Back to Select','',()=>{resetChain();T0.tool='select';T0.place=null;T0.kit=null;dom.style.cursor='';paintTB();refresh();}));s.appendChild(fr);}}
      inspector(pane);
      {const s=sec(pane,'Precision');s.appendChild(el('div','sub','Snapping'));const sn=el('div','chips');[['smart','Smart'],['grid','Grid'],['free','Free']].forEach(([v,l])=>tog(sn,l,SN.mode===v,()=>{SN.mode=v;refresh();}));s.appendChild(sn);
        if(SN.mode==='grid'){const gr=el('div','chips');[[.05,'5 cm'],[.1,'10 cm'],[.25,'25 cm'],[.5,'50 cm'],[1,'1 m']].forEach(([v,l])=>tog(gr,l,SN.grid===v,()=>{SN.grid=v;refresh();}));s.appendChild(gr);}
        s.appendChild(el('div','note',SN.mode==='smart'?'Smart snaps to corners you have drawn, to straight lines with other walls, and to 15° angles. Lengths are free.':SN.mode==='grid'?'Points land on the grid you pick.':'No snapping. Lengths and angles are exactly where you put them.'));
        s.appendChild(el('div','sub','New walls'));
        {const nr=el('div');s.appendChild(nr);const inpRow=(label,key,min,max,step)=>{const r=el('div','bd-num'),i=document.createElement('input');i.type='number';i.step=String(step);i.value=T0[key].toFixed(2);i.inputMode='decimal';i.setAttribute('aria-label',label);i.addEventListener('change',()=>{T0[key]=clamp(+i.value||T0[key],min,max);i.value=T0[key].toFixed(2);});r.append(el('span','',label),i,el('em','','m'));nr.appendChild(r);};inpRow('Height','wh',.3,H,.05);inpRow('Thickness','wt',.04,.6,.01);}
        const tk=el('div','chips');tog(tk,'Furniture snaps to walls',T0.tuck,()=>{T0.tuck=!T0.tuck;refresh();});s.appendChild(tk);}
      {const s=sec(pane,'Level');const r=el('div','bd-lv');r.append(btn('−','',()=>{T0.level=clamp(T0.level-1,0,4);rebuild();paintTB();refresh();}),el('b','','Level '+(T0.level+1)),btn('+','',()=>{T0.level=clamp(T0.level+1,0,4);rebuild();paintTB();refresh();}));s.appendChild(r);
        const w=el('div','chips');[['up','Walls up'],['cut','Cutaway'],['down','Walls down']].forEach(([v,l])=>tog(w,l,T0.walls===v,()=>{T0.walls=v;rebuild();refresh();}));s.appendChild(w);}
      {const s=sec(pane,'Camera and time');const v=el('div','chips');v.append(btn('Walk inside','pri',()=>{ensure();const b=bounds(),cn=b.getCenter(new THREE.Vector3()),p=house.o.holder.localToWorld(new THREE.Vector3(cn.x,topY(T0.level),cn.z));walkIn&&walkIn([p.x,p.y,p.z]);}),btn('Top view','',()=>view('top')),btn('Angled view','',()=>view('iso')),btn(!D||D.lawn!==false?'Lawn: on':'Lawn: off','',()=>{ensure();house.data.lawn=!house.data.lawn;rebuild();refresh();}));s.appendChild(v);
        const tm=el('div','chips');[['Morning',8],['Noon',12.5],['Evening',18.3],['Night',22.5]].forEach(([n,h])=>tm.appendChild(btn(n,'',()=>{try{if(!LGT.on)LGT.setOn(true);LGT.setHour(h);bump();}catch(e){toast('Couldn’t change the time of day.');}})));s.appendChild(tm);}
    }else if(sub==='styles'){
      const s=sec(pane,'Styles','tap one, then tap a wall, floor or roof');swatches(s,'wall','Walls');swatches(s,'floor','Floors');swatches(s,'roof','Roofs');
    }else if(sub==='furnish'){
      const s=sec(pane,'Furnish a whole room');s.appendChild(el('div','note','Pick a room type, then tap the middle of a room. Matching furniture is chosen from the library and set out for you.'));
      const kr=el('div','chips');KITS.forEach(k=>tog(kr,k[0],T0.tool==='kit'&&T0.kit===k,()=>{T0.kit=k;T0.tool='kit';T0.place=null;ensure();peek&&peek();paintTB();refresh();}));s.appendChild(kr);
      if(T0.tool==='kit'){const pr=el('div','chips');pr.append(btn('Rotate 90°','',()=>{T0.rot=(T0.rot+Math.PI/2)%(Math.PI*2);toast('Layout turned');}));s.appendChild(pr);}
      const s2=sec(pane,'One piece at a time','CC0 models');s2.appendChild(el('div','note','Pick a piece, then tap the floor. Placed pieces are normal objects: move them, paint them in Material.'));
      if(T0.place){const pr=el('div','chips');pr.append(btn('Rotate 90°','',()=>{T0.rot=(T0.rot+Math.PI/2)%(Math.PI*2);toast('Turned');}),btn('Done placing','',()=>{T0.place=null;refresh();}));s2.appendChild(pr);}
      model(s2);
    }else{
      LIVE.panel(pane,refresh);
    }
    dom.style.cursor=((T0.tool&&T0.tool!=='select')||T0.place)?'crosshair':'';
  }
  return {show,undo,redo:redoF,tick:dt=>LIVE.tick(dt),cycleTool(d){const ks=TOOLS.map(t=>t[0]);let i=ks.indexOf(T0.tool);if(i<0)i=0;const n=ks[(i+d+ks.length)%ks.length];if(n!==T0.tool)setTool(n);},levelStep(d){T0.level=clamp(T0.level+(d>0?1:-1),0,4);rebuild();paintTB();refresh();toast('Level '+(T0.level+1),900);},fromItem(it){const data=it.data||newData(),group=new THREE.Group();const o=addGroup(it.name||'House',group,{build:data,noAuto:true});house={o,group,data};o.meta.build=data;o.meta.colliders=colliders;rebuild();return o;},
    projectItem(o){return {kind:'build',name:o.name,data:o.meta.build};},off(){T0.on=false;T0.tool='select';T0.place=null;T0.kit=null;dom.style.cursor='';press=null;hd=null;if(house)clearGhost();showTB(false);LIVE.showHud(false);},
    isHouse:o=>!!(o&&o.meta&&o.meta.build),adopt(o){if(o&&o.meta&&o.meta.build){house={o,group:o.root,data:o.meta.build};}}};
}
