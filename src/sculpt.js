/* Sculpt: push, pull, smooth, inflate, pinch and drag the surface of any mesh in the 3D page. Works with mouse, touch, a pen (pressure sets strength,
   the eraser end digs the other way) and the controller (hold the cursor button over the model). Seams are welded for movement, so UV splits never crack open.
   Low-poly shapes are subdivided first so there is enough surface to shape. Stored in the object's own geometry, so GLB export includes the sculpt. */
import {PEN} from './pen.js';
const BR=[['draw','Draw'],['smooth','Smooth'],['inflate','Inflate'],['pinch','Pinch'],['grab','Grab']];
export function createSculpt(c){
  const {THREE,camera,canvas,S,objById,bump,toast,pickObj,onChange}=c;
  const B={on:false,brush:'draw',size:70,str:.55,sym:false,inv:false};
  const P=new Map(); // mesh uuid -> prepared data
  const undo=[];let cur=null,raf=0,ui=null,lastE=null,lastT=0,pulse=null;
  const ray=new THREE.Raycaster(),v2=new THREE.Vector2(),_a=new THREE.Vector3(),_b=new THREE.Vector3(),_n=new THREE.Vector3();

  function subdivide(g){
    if(!g.index){const n=g.attributes.position.count,ix=new Uint32Array(n);for(let i=0;i<n;i++)ix[i]=i;g.setIndex(new THREE.BufferAttribute(ix,1));}
    let pos=Array.from(g.attributes.position.array),uv=g.attributes.uv?Array.from(g.attributes.uv.array):null,idx=Array.from(g.index.array);
    for(let it=0;it<7&&pos.length/3<9000;it++){
      const mid=new Map(),out=[];
      const m=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;let r=mid.get(k);if(r!==undefined)return r;r=pos.length/3;
        pos.push((pos[a*3]+pos[b*3])/2,(pos[a*3+1]+pos[b*3+1])/2,(pos[a*3+2]+pos[b*3+2])/2);if(uv)uv.push((uv[a*2]+uv[b*2])/2,(uv[a*2+1]+uv[b*2+1])/2);mid.set(k,r);return r;};
      for(let i=0;i<idx.length;i+=3){const a=idx[i],b=idx[i+1],d=idx[i+2],ab=m(a,b),bd=m(b,d),da=m(d,a);out.push(a,ab,da,ab,b,bd,da,bd,d,ab,bd,da);}
      idx=out;
    }
    const ng=new THREE.BufferGeometry();ng.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
    if(uv)ng.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(uv),2));
    ng.setIndex(idx);ng.computeVertexNormals();return ng;
  }
  function prep(mesh){
    let d=P.get(mesh.uuid);if(d)return d;
    let g=mesh.geometry;
    if(g.boundsTree)g.boundsTree=undefined; // a stale hierarchy would give wrong hits once vertices move
    if(!g.attributes.position||mesh.isSkinnedMesh||g.attributes.position.count>160000){toast('This mesh is too heavy or animated to sculpt.');return null;}
    if(g.attributes.position.count<5000){g=subdivide(g);mesh.geometry.dispose();mesh.geometry=g;toast('Added surface detail so it can be shaped.',2200);}
    if(!g.index){const n=g.attributes.position.count,ix=new Uint32Array(n);for(let i=0;i<n;i++)ix[i]=i;g.setIndex(new THREE.BufferAttribute(ix,1));}
    const pa=g.attributes.position,n=pa.count,key=new Map(),gid=new Int32Array(n);let G=0;
    for(let i=0;i<n;i++){const k=Math.round(pa.getX(i)*1e4)+','+Math.round(pa.getY(i)*1e4)+','+Math.round(pa.getZ(i)*1e4);let q=key.get(k);if(q===undefined){q=G++;key.set(k,q);}gid[i]=q;}
    const cnt=new Int32Array(G+1);for(let i=0;i<n;i++)cnt[gid[i]+1]++;for(let i=0;i<G;i++)cnt[i+1]+=cnt[i];
    const fill=cnt.slice(0,G),mem=new Int32Array(n);for(let i=0;i<n;i++)mem[fill[gid[i]]++]=i;
    const nb=Array.from({length:G},()=>new Set()),ix=g.index.array;
    for(let i=0;i<ix.length;i+=3){const a=gid[ix[i]],b=gid[ix[i+1]],e=gid[ix[i+2]];nb[a].add(b).add(e);nb[b].add(a).add(e);nb[e].add(a).add(b);}
    d={mesh,g,gid,start:cnt,mem,G,nb:nb.map(s=>Int32Array.from(s))};P.set(mesh.uuid,d);return d;
  }
  const rep=(d,gi)=>d.mem[d.start[gi]];
  function refreshNormals(d){
    const g=d.g;g.computeVertexNormals();const na=g.attributes.normal;
    for(let q=0;q<d.G;q++){const s=d.start[q],e=d.start[q+1];if(e-s<2)continue;let x=0,y=0,z=0;for(let k=s;k<e;k++){const i=d.mem[k];x+=na.getX(i);y+=na.getY(i);z+=na.getZ(i);}const l=Math.hypot(x,y,z)||1;for(let k=s;k<e;k++)na.setXYZ(d.mem[k],x/l,y/l,z/l);}
    na.needsUpdate=true;
  }
  function pxToLocal(mesh,dist,px){const fov=camera.fov*Math.PI/180,h=canvas.clientHeight||innerHeight;const w=px*2*dist*Math.tan(fov/2)/h,s=_a.setFromMatrixScale(mesh.matrixWorld).x||1;return w/s;}
  function hitAt(x,y){
    const r=canvas.getBoundingClientRect();v2.set((x-r.left)/r.width*2-1,-((y-r.top)/r.height)*2+1);ray.setFromCamera(v2,camera);
    const o=S.sel!=null?objById(S.sel):null;const root=o?o.holder:null;if(!root)return null;
    const meshes=[];root.traverse(n=>{if(n.isMesh&&n.visible&&!n.userData.live&&!n.isSkinnedMesh)meshes.push(n);});
    const h=ray.intersectObjects(meshes,false)[0];return h||null;
  }
  /* apply one brush dab around a local point */
  function dab(d,pl,nl,rad,k,sign,gp){
    const pa=d.g.attributes.position,na=d.g.attributes.normal,r2=rad*rad;let any=false;
    for(let q=0;q<d.G;q++){
      const i=rep(d,q),x=pa.getX(i),y=pa.getY(i),z=pa.getZ(i),dx=x-pl.x,dy=y-pl.y,dz=z-pl.z,s=dx*dx+dy*dy+dz*dz;if(s>=r2)continue;
      const t=1-s/r2,f=t*t*(3-2*t)*k;let mx=0,my=0,mz=0;
      if(B.brush==='draw'){mx=nl.x*f*sign*rad*.13;my=nl.y*f*sign*rad*.13;mz=nl.z*f*sign*rad*.13;}
      else if(B.brush==='inflate'){mx=na.getX(i)*f*sign*rad*.13;my=na.getY(i)*f*sign*rad*.13;mz=na.getZ(i)*f*sign*rad*.13;}
      else if(B.brush==='smooth'){const nb=d.nb[q];if(!nb.length)continue;let ax=0,ay=0,az=0;for(let j=0;j<nb.length;j++){const m=rep(d,nb[j]);ax+=pa.getX(m);ay+=pa.getY(m);az+=pa.getZ(m);}ax/=nb.length;ay/=nb.length;az/=nb.length;const w=Math.min(1,f*.9);mx=(ax-x)*w;my=(ay-y)*w;mz=(az-z)*w;}
      else if(B.brush==='pinch'){const w=f*.12*sign;let ux=-dx,uy=-dy,uz=-dz;const dn=ux*nl.x+uy*nl.y+uz*nl.z;ux-=nl.x*dn;uy-=nl.y*dn;uz-=nl.z*dn;mx=ux*w;my=uy*w;mz=uz*w;}
      if(!mx&&!my&&!mz)continue;any=true;
      for(let m=d.start[q];m<d.start[q+1];m++){const v=d.mem[m];pa.setXYZ(v,x+mx,y+my,z+mz);}
    }
    return any;
  }
  function stamp(h,pr,dt){
    const d=prep(h.object);if(!d)return;const mesh=d.mesh,pa=d.g.attributes.position;
    const dist=camera.position.distanceTo(h.point),rad=pxToLocal(mesh,dist,B.size*(B.brush==='grab'?1:1));
    const pl=mesh.worldToLocal(h.point.clone()),nl=(h.face?h.face.normal.clone():_n.set(0,1,0)).normalize();
    const k=Math.min(1,B.str*(.4+pr*.9)*Math.min(.08,dt)*10),sign=(B.inv?-1:1)*(PEN.eraser?-1:1);
    let any=dab(d,pl,nl,rad,k,sign);
    if(B.sym){const pm=pl.clone();pm.x=-pm.x;const nm=nl.clone();nm.x=-nm.x;any=dab(d,pm,nm,rad,k,sign)||any;}
    if(any){pa.needsUpdate=true;cur.dirty=d;}
  }
  function grabStart(h){
    const d=prep(h.object);if(!d)return;const mesh=d.mesh,pa=d.g.attributes.position;
    const dist=camera.position.distanceTo(h.point),rad=pxToLocal(mesh,dist,B.size),pl=mesh.worldToLocal(h.point.clone()),r2=rad*rad,w=new Float32Array(d.G),o=new Float32Array(d.G*3);
    for(let q=0;q<d.G;q++){const i=rep(d,q),dx=pa.getX(i)-pl.x,dy=pa.getY(i)-pl.y,dz=pa.getZ(i)-pl.z,s=dx*dx+dy*dy+dz*dz;o[q*3]=pa.getX(i);o[q*3+1]=pa.getY(i);o[q*3+2]=pa.getZ(i);if(s<r2){const t=1-s/r2;w[q]=t*t*(3-2*t);}}
    const pn=camera.getWorldDirection(new THREE.Vector3()).negate();
    cur.grab={d,w,o,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(pn,h.point.clone()),p0:h.point.clone()};
  }
  function grabMove(x,y){
    const gr=cur.grab;if(!gr)return;const r=canvas.getBoundingClientRect();v2.set((x-r.left)/r.width*2-1,-((y-r.top)/r.height)*2+1);ray.setFromCamera(v2,camera);
    const p=ray.ray.intersectPlane(gr.plane,_b);if(!p)return;const dw=p.clone().sub(gr.p0),mesh=gr.d.mesh;
    const m=new THREE.Matrix4().copy(mesh.matrixWorld).invert();dw.transformDirection(m).multiplyScalar(p.clone().sub(gr.p0).length()/(_a.setFromMatrixScale(mesh.matrixWorld).x||1));
    const pa=gr.d.g.attributes.position,d=gr.d;
    for(let q=0;q<d.G;q++){const w=gr.w[q];if(!w)continue;const nx=gr.o[q*3]+dw.x*w,ny=gr.o[q*3+1]+dw.y*w,nz=gr.o[q*3+2]+dw.z*w;for(let k=d.start[q];k<d.start[q+1];k++)pa.setXYZ(d.mem[k],nx,ny,nz);}
    pa.needsUpdate=true;cur.dirty=d;
  }
  function loop(now){
    raf=0;if(!cur)return;const dt=Math.min(.05,(now-lastT)/1000||.016);lastT=now;
    if(lastE){
      if(B.brush==='grab')grabMove(lastE.x,lastE.y);
      else{const h=hitAt(lastE.x,lastE.y);if(h)stamp(h,lastE.p,dt);}
    }
    if(cur.dirty){refreshNormals(cur.dirty);cur.dirty=null;bump();}
    raf=requestAnimationFrame(loop);
  }
  function down(e){
    if(!B.on)return;
    if(cur&&e.pointerType==='touch'){end(true);return;}
    if(e.button!==0&&!PEN.isEraser(e))return;if(e.altKey||(!e.isPrimary&&e.pointerType==='touch'))return;
    if(S.sel==null)return;const h=hitAt(e.clientX,e.clientY);if(!h)return;
    const d=prep(h.object);if(!d)return;
    e.stopImmediatePropagation();e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    undo.push({d,a:d.g.attributes.position.array.slice()});if(undo.length>14)undo.shift();
    cur={id:e.pointerId};lastE={x:e.clientX,y:e.clientY,p:PEN.p(e)};lastT=performance.now();
    if(B.brush==='grab')grabStart(h);
    if(!raf)raf=requestAnimationFrame(loop);
  }
  function move(e){if(!cur||e.pointerId!==cur.id)return;e.stopImmediatePropagation();lastE={x:e.clientX,y:e.clientY,p:PEN.p(e)};}
  function end(cancel){if(!cur)return;const d=cur.dirty;cur=null;if(d)refreshNormals(d);for(const u of undo.slice(-1)){const g=u.d.g;g.computeBoundingSphere();g.computeBoundingBox();}bump();if(!cancel)onChange&&onChange();}
  function up(e){if(!cur||e.pointerId!==cur.id)return;e.stopImmediatePropagation();end();}
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true);

  function doUndo(){const u=undo.pop();if(!u){toast('Nothing to undo.');return;}u.d.g.attributes.position.array.set(u.a);u.d.g.attributes.position.needsUpdate=true;refreshNormals(u.d);u.d.g.computeBoundingSphere();u.d.g.computeBoundingBox();bump();}
  addEventListener('keydown',e=>{if(!B.on||(e.target&&e.target.matches&&e.target.matches('input,textarea,select')))return;
    const k=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();e.stopImmediatePropagation();doUndo();return;}
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(k==='['||k===']'){B.size=Math.max(10,Math.min(240,Math.round(B.size*(k==='['?.8:1.25))));sync();}
    else if(k==='x'){B.sym=!B.sym;sync();}else if(k==='i'){B.inv=!B.inv;sync();}
    else if(k==='escape'){setOn(false);}
  },true);

  /* floating toolbar */
  function build(){
    const css=document.createElement('style');css.textContent=`#sctb{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 62px);z-index:60;display:flex;flex-direction:column;gap:6px;width:min(420px,calc(100vw - 16px));padding:8px;border-radius:20px;background:rgba(18,18,20,.8);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 28px rgba(0,0,0,.45);color:#e8e9ed;font:700 10px var(--lab,monospace);letter-spacing:.05em;text-transform:uppercase}
#sctb[hidden]{display:none}#sctb .row{display:flex;gap:4px;align-items:center}#sctb .row.w{flex-wrap:wrap}
#sctb button{flex:1;min-height:44px;min-width:44px;padding:0 6px;border:0;border-radius:12px;background:transparent;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit}
#sctb button[aria-pressed=true]{background:#fff;color:#111}#sctb label{display:flex;align-items:center;gap:8px;flex:1;min-height:44px}#sctb input[type=range]{flex:1;min-width:0;min-height:32px}#sctb .done{background:#e9dfcb;color:#111;flex:none;padding:0 14px}`;document.head.appendChild(css);
    ui=document.createElement('div');ui.id='sctb';ui.hidden=true;ui.setAttribute('role','toolbar');ui.setAttribute('aria-label','Sculpt tools');
    ui.innerHTML='<div class="row" data-r="b"></div><div class="row"><label>Size<input type="range" min="10" max="240" step="1" data-k="size" aria-label="Brush size"></label><label>Power<input type="range" min="0.1" max="1" step="0.05" data-k="str" aria-label="Brush strength"></label></div><div class="row"><button type="button" data-a="inv" aria-pressed="false">Dig in</button><button type="button" data-a="sym" aria-pressed="false">Mirror</button><button type="button" data-a="undo">Undo</button><button type="button" class="done" data-a="done">Done</button></div>';
    document.body.appendChild(ui);const rb=ui.querySelector('[data-r=b]');
    BR.forEach(([k,n])=>{const b=document.createElement('button');b.type='button';b.textContent=n;b.dataset.b=k;b.addEventListener('click',()=>{B.brush=k;sync();});rb.appendChild(b);});
    ui.querySelectorAll('input[type=range]').forEach(i=>i.addEventListener('input',()=>{B[i.dataset.k]=+i.value;}));
    ui.querySelector('[data-a=inv]').addEventListener('click',()=>{B.inv=!B.inv;sync();});ui.querySelector('[data-a=sym]').addEventListener('click',()=>{B.sym=!B.sym;sync();});
    ui.querySelector('[data-a=undo]').addEventListener('click',doUndo);ui.querySelector('[data-a=done]').addEventListener('click',()=>setOn(false));
  }
  function sync(){if(!ui)return;ui.querySelectorAll('[data-b]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.b===B.brush)));ui.querySelector('[data-a=inv]').setAttribute('aria-pressed',String(B.inv));ui.querySelector('[data-a=sym]').setAttribute('aria-pressed',String(B.sym));ui.querySelector('[data-k=size]').value=B.size;ui.querySelector('[data-k=str]').value=B.str;}
  function setOn(v){
    if(v&&!ui)build();
    if(v&&(S.sel==null||!objById(S.sel))){toast('Pick an object first, or add Clay from the menu.',3000);return false;}
    B.on=v;if(ui){ui.hidden=!v;sync();}canvas.style.cursor=v?'crosshair':'';
    if(v)toast('Sculpt: drag on the model. Orbit from empty space or the right stick.',3200);
    else end(true);
    bump();return true;
  }
  return {B,dbg(){const u=undo[undo.length-1];if(!u)return -1;const c=u.d.g.attributes.position.array;let m=0;for(let i=0;i<c.length;i++)m=Math.max(m,Math.abs(c[i]-u.a[i]));return m;},get on(){return B.on;},setOn,toggle(){return setOn(!B.on);},undo:doUndo,cycleBrush(d){const i=BR.findIndex(x=>x[0]===B.brush);B.brush=BR[(i+d+BR.length)%BR.length][0];sync();toast('Brush: '+BR.find(x=>x[0]===B.brush)[1],900);},size(d){B.size=Math.max(10,Math.min(240,Math.round(B.size*(d>0?1.2:.83))));sync();toast('Brush size '+B.size,700);}};
}
