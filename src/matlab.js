/* Material creator: a full-screen workshop with a real 3D preview (orbit it, change the shape, move the light) next to the material's
   sockets. Each socket can keep what the object has, hold a value, or be driven by a procedural pattern shaded between two values.
   Edits show on the preview and on the selected object at the same time. Materials can be saved to "My materials" and used again. */
import {PATTERNS,CHANNELS,PRESETS,normMat,createMaterials} from './matsys.js';
const CSS=`
.matlab{position:fixed;inset:0;z-index:90;display:grid;grid-template-columns:minmax(260px,1fr) minmax(320px,400px);background:var(--bg);color:var(--ink);font:12px/1.4 var(--lab)}
.matlab .mlv{position:relative;min-width:0;min-height:0;background:var(--stage)}
.matlab canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.matlab .mltools{position:absolute;left:10px;right:10px;bottom:calc(10px + var(--safe-b));display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.matlab .mltools .row{margin:0;min-width:130px;flex:1}
.matlab .mlp{overflow:auto;border-left:1px solid var(--line);padding:0 0 calc(18px + var(--safe-b));min-height:0;overscroll-behavior:contain}
.matlab .mlh{position:sticky;top:0;z-index:2;background:var(--bg);display:flex;align-items:center;gap:8px;padding:calc(10px + var(--safe-t)) 12px 10px;border-bottom:1px solid var(--line)}
.matlab .mlh b{flex:1;font:700 11px var(--lab);letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.matlab .mlc{border-bottom:1px solid var(--line);padding:10px 12px}
.matlab .mlc .mlt{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.matlab .mlc .mlt span{flex:1;font:700 10px var(--lab);letter-spacing:.1em;text-transform:uppercase}
.matlab select{min-height:32px;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:var(--rad);font:700 10px var(--lab);padding:0 8px;max-width:150px}
.matlab input[type=color]{width:44px;height:32px;border:1px solid var(--line);background:none;padding:0;border-radius:var(--rad)}
.matlab .mlcol{display:flex;gap:10px;align-items:center;margin:4px 0;flex-wrap:wrap}
.matlab .mlcol label{display:flex;align-items:center;gap:6px;font:700 9.5px var(--lab);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
@media(max-width:760px){.matlab .mltools{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px}.matlab .mltools>*{flex:none}.matlab .mltools .chips{flex-wrap:nowrap}.matlab .mltools .row{min-width:150px}.matlab{grid-template-columns:1fr;grid-template-rows:minmax(180px,42dvh) minmax(0,1fr)}.matlab .mlp{border-left:0;border-top:1px solid var(--line)}.matlab .mlh{padding-top:10px}}
`;
const myMats=()=>{try{return JSON.parse(localStorage.getItem('n0.mymats')||'[]');}catch(e){return[];}};
const SHAPES=['Sphere','Cube','Knot','Torus','Cylinder','Plane'];
const clone=x=>JSON.parse(JSON.stringify(x));
export function openMatLab(c){
  const {THREE,RoomEnvironment,el,btn,sliderRow,chipRow,toast,o,MAT,applyAll,onChange,onClose}=c;
  if(!document.getElementById('matlab-css')){const s=document.createElement('style');s.id='matlab-css';s.textContent=CSS;document.head.appendChild(s);}
  const root=el('div','matlab');root.setAttribute('role','dialog');root.setAttribute('aria-label','Material creator');
  const view=el('div','mlv'),cv=document.createElement('canvas');view.appendChild(cv);
  const panel=el('div','mlp');root.append(view,panel);document.body.appendChild(root);
  /* the object's own material, or a new one */
  let def=normMat(o&&o.mat);
  /* ---- 3D preview ---- */
  let rn=null,raf=0,spin=true,dragging=false,disposed=false;
  try{rn=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:false});}catch(e){view.appendChild(el('div','note','The 3D preview needs WebGL, which isn’t available here. The sliders still change the object.'));}
  const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(34,1,.1,50);cam.position.set(0,0,4.2);
  let pm=null;
  if(rn){try{pm=new THREE.PMREMGenerator(rn);sc.environment=pm.fromScene(new RoomEnvironment(),.04).texture;}catch(e){}}
  const key=new THREE.DirectionalLight(0xffffff,2.4);sc.add(key,new THREE.HemisphereLight(0xffffff,0x222226,.35));
  const grp=new THREE.Group();sc.add(grp);
  const fake={objs:[]},PM=createMaterials({THREE,S:fake}),pobj={id:-998,holder:grp,mat:null};fake.objs.push(pobj);
  let shape='Sphere',mesh=null,bgK='Dark',lightA=40,envK=1;
  const geo=n=>n==='Cube'?new THREE.BoxGeometry(1.6,1.6,1.6,1,1,1):n==='Knot'?new THREE.TorusKnotGeometry(.8,.28,220,36):n==='Torus'?new THREE.TorusGeometry(.9,.38,48,96):n==='Cylinder'?new THREE.CylinderGeometry(.8,.8,1.7,64,1):n==='Plane'?new THREE.PlaneGeometry(2.2,2.2,1,1):new THREE.SphereGeometry(1.15,96,64);
  function build(){
    if(mesh){grp.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
    mesh=new THREE.Mesh(geo(shape),new THREE.MeshStandardMaterial({color:0xcfc8bd,roughness:.5,metalness:0,side:shape==='Plane'?THREE.DoubleSide:THREE.FrontSide}));grp.add(mesh);
    pobj.matU=null;pobj.matMats=null;PM.set(pobj,def);draw();
  }
  const BG={Dark:0x0b0b0c,Grey:0x6a6a6e,Light:0xe8e6e1};
  function size(){if(!rn)return;const w=view.clientWidth||300,h=view.clientHeight||300,d=Math.min(2,devicePixelRatio||1);rn.setPixelRatio(d);rn.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();}
  let last=0;
  function draw(now){
    if(!rn||disposed)return;
    if(now&&spin&&!dragging)grp.rotation.y+=(now-(last||now))/6000;last=now||last;
    key.position.set(Math.cos(lightA*Math.PI/180)*4,3,Math.sin(lightA*Math.PI/180)*4);
    sc.environmentIntensity=envK;sc.background=new THREE.Color(BG[bgK]);
    PM.tick((now||0)/1000);rn.render(sc,cam);
  }
  const loop=now=>{raf=requestAnimationFrame(loop);draw(now);};
  if(rn){size();raf=requestAnimationFrame(loop);}
  const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{size();draw();}):null;ro&&ro.observe(view);
  /* orbit: drag turns the shape, wheel zooms */
  let px=0,py=0;
  cv.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;try{cv.setPointerCapture(e.pointerId);}catch(_){}cv.style.cursor='grabbing';});
  cv.addEventListener('pointermove',e=>{if(!dragging)return;grp.rotation.y+=(e.clientX-px)*.008;grp.rotation.x=Math.max(-1.4,Math.min(1.4,grp.rotation.x+(e.clientY-py)*.008));px=e.clientX;py=e.clientY;draw();});
  const up=()=>{dragging=false;cv.style.cursor='grab';};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',e=>{e.preventDefault();cam.position.z=Math.max(2.2,Math.min(9,cam.position.z*(1+e.deltaY*.001)));draw();},{passive:false});
  /* tools over the preview */
  const tools=el('div','mltools');view.appendChild(tools);
  chipRow(tools,SHAPES.map(s=>[s,s]),v=>v===shape,v=>{shape=v;build();});
  chipRow(tools,['Dark','Grey','Light'].map(s=>[s,s]),v=>v===bgK,v=>{bgK=v;draw();});
  sliderRow(tools,'Light',()=>lightA,v=>{lightA=v;draw();},0,360,1,v=>Math.round(v)+'°');
  sliderRow(tools,'Reflections',()=>envK,v=>{envK=v;draw();},0,2,.05);
  const sp=el('button','chip','Spin');sp.setAttribute('aria-pressed',true);sp.addEventListener('click',()=>{spin=!spin;sp.setAttribute('aria-pressed',spin);});tools.appendChild(sp);
  /* ---- edit state ---- */
  function commit(){
    PM.set(pobj,def);draw();
    if(o){c.MAT.set(o,def);}
    onChange&&onChange();
  }
  const head=el('div','mlh');const title=el('b','',(o?o.name:'New material'));
  const done=btn('Done','pri',()=>close());head.append(title,done);
  const body=el('div');panel.append(head,body);
  const grey=v=>v;
  function chanCard(ch){
    const card=el('div','mlc'),s=def[ch.id];
    const t=el('div','mlt');t.appendChild(el('span','',ch.label));
    const sel=document.createElement('select');sel.setAttribute('aria-label',ch.label+' source');
    PATTERNS.forEach(([id,l])=>{const op=document.createElement('option');op.value=id;op.textContent=l;sel.appendChild(op);});sel.value=s.p;
    sel.addEventListener('change',()=>{s.p=sel.value;commit();paint();});t.appendChild(sel);card.appendChild(t);
    if(s.p==='off'){card.appendChild(el('div','note','Uses the object’s own '+ch.label.toLowerCase()+'. Pick a source to change it.'));return card;}
    const colRow=(k,label)=>{const l=document.createElement('label');l.appendChild(document.createTextNode(label));const i=document.createElement('input');i.type='color';i.value=s[k];i.setAttribute('aria-label',label);i.addEventListener('input',()=>{s[k]=i.value;commit();});l.appendChild(i);return l;};
    if(s.p==='const'){
      if(ch.type==='c'){const r=el('div','mlcol');r.appendChild(colRow('a','Colour'));card.appendChild(r);}
      else sliderRow(card,'Value',()=>+s.a,v=>{s.a=v;commit();},0,1,.01);
      return card;
    }
    if(ch.type==='c'){const r=el('div','mlcol');r.append(colRow('a','Low'),colRow('b','High'));card.appendChild(r);}
    else{sliderRow(card,'Low',()=>+s.a,v=>{s.a=v;commit();},0,1,.01);sliderRow(card,'High',()=>+s.b,v=>{s.b=v;commit();},0,1,.01);}
    sliderRow(card,'Scale',()=>s.sc,v=>{s.sc=v;commit();},.1,12,.05);
    if(['noise','turb','marble','waves'].includes(s.p))sliderRow(card,'Detail',()=>s.det,v=>{s.det=v;commit();},1,6,1);
    if(!['gradient','radial','rim'].includes(s.p))sliderRow(card,'Distortion',()=>s.dis,v=>{s.dis=v;commit();},0,1.5,.01);
    sliderRow(card,'Contrast',()=>s.con,v=>{s.con=v;commit();},.3,10,.05);
    sliderRow(card,'Shift',()=>s.off,v=>{s.off=v;commit();},-.5,.5,.01);
    return card;
  }
  function paint(){
    body.innerHTML='';
    const ps=el('div','mlc');ps.appendChild(el('div','mlt','<span>Start from</span>'));
    const row=el('div','chips');
    PRESETS.forEach(([n,p])=>{const b=el('button','chip',n);b.addEventListener('click',()=>{def=normMat(clone(p));commit();paint();});row.appendChild(b);});
    ps.appendChild(row);
    const mm=myMats();if(mm.length){ps.appendChild(el('div','sub','My materials'));const r2=el('div','chips');
      mm.forEach((it,i)=>{const b=el('button','chip',it.name);b.addEventListener('click',()=>{def=normMat(clone(it.def));commit();paint();});
        const x=el('button','chip','×');x.setAttribute('aria-label','Delete '+it.name);x.addEventListener('click',()=>{const a=myMats();a.splice(i,1);localStorage.setItem('n0.mymats',JSON.stringify(a));paint();});r2.append(b,x);});ps.appendChild(r2);}
    body.appendChild(ps);
    CHANNELS.forEach(ch=>body.appendChild(chanCard(ch)));
    const g=el('div','mlc');g.appendChild(el('div','mlt','<span>Overall</span>'));
    sliderRow(g,'Emission strength',()=>def.ek,v=>{def.ek=v;commit();},0,6,.05);
    sliderRow(g,'Bump strength',()=>def.bk,v=>{def.bk=v;commit();},0,3,.05);
    sliderRow(g,'Flow (animate patterns)',()=>def.flow,v=>{def.flow=v;commit();},0,3,.05);
    body.appendChild(g);
    const f=el('div','mlc'),fr=el('div','chips');
    fr.append(
      btn('Save as my material','',()=>{const n=(prompt('Name this material')||'').trim().slice(0,24);if(!n)return;const a=myMats();a.push({name:n,def:clone(def)});localStorage.setItem('n0.mymats',JSON.stringify(a));paint();toast('Saved '+n);}),
      btn('Apply to every object','',()=>{applyAll&&applyAll(clone(def));toast('Material applied to every object');}),
      btn('Remove from object','',()=>{def=normMat(null);if(o)MAT.clear(o);PM.clear(pobj);PM.set(pobj,def);PM.clear(pobj);onChange&&onChange();paint();draw();}));
    f.appendChild(fr);body.appendChild(f);
  }
  paint();build();
  function close(){
    if(disposed)return;disposed=true;cancelAnimationFrame(raf);ro&&ro.disconnect();removeEventListener('keydown',onKey,true);
    try{rn&&rn.dispose();pm&&pm.dispose();}catch(e){}root.remove();onClose&&onClose();
  }
  const onKey=e=>{if(e.key==='Escape'){e.stopPropagation();close();}};addEventListener('keydown',onKey,true);
  done.focus&&done.focus();
  return {close,root,get def(){return def;},setDef(d){def=normMat(d);commit();paint();}};
}
