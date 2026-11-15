/* The Simulate panel, shared by the Scene tab and the World tab. One idea: put things above a floor or a plane, press Drop.
   Everything else (materials, gravity, throwing, showers, towers) is a chip away. */
export function createPhysUI(c){
  const {sim,S,THREE,camera,controls,addPrimitive,el,sec,btn,toast,chipRow,sliderRow,bump,renderObjList,selectObj}=c;
  const refreshers=new Set();
  const fire=()=>refreshers.forEach(f=>f());
  const guard=async fn=>{try{return await fn();}catch(e){toast('Physics couldn’t load: '+(e.message||e)+'. Check your connection and try again.',5000);}};
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const spawn=async(kind,scale,pos,phys,name)=>{
    const o=addPrimitive(kind);if(!o)return null;o.meta=o.meta||{};o.meta.spawn=true;o.name=name||kind;
    o.holder.scale.setScalar(scale);o.holder.position.set(pos[0],pos[1],pos[2]);o.holder.updateMatrixWorld(true);
    o.meta.phys={type:'dynamic',...phys};
    if(o.root&&o.root.material&&o.root.material.color)o.root.material.color.setHSL(Math.random(),.45,.58);
    return o;
  };
  async function throwBall(){
    const d=new THREE.Vector3();camera.getWorldDirection(d);const p=camera.position.clone().addScaledVector(d,1.4);
    const o=await spawn('Sphere',.28,[p.x,p.y,p.z],{bounce:.55,mass:6,shape:'sphere'},'Ball');if(!o)return;
    await sim.addBody(o,[d.x*14,d.y*14+2,d.z*14]);renderObjList&&renderObjList();fire();
  }
  async function shower(){
    const kinds=['Sphere','Cube','Cone','Torus','Capsule','Cylinder'];
    for(let i=0;i<14;i++){const k=kinds[i%kinds.length],o=await spawn(k,rnd(.16,.3),[controls.target.x+rnd(-1.4,1.4),rnd(3,7),controls.target.z+rnd(-1.4,1.4)],{bounce:rnd(.1,.6),mass:rnd(2,10)},k);
      if(o){o.holder.rotation.set(rnd(0,3),rnd(0,3),rnd(0,3));o.holder.updateMatrixWorld(true);await sim.addBody(o);}}
    renderObjList&&renderObjList();fire();
  }
  async function tower(){
    const s=.3;let cell=0;const meas=o=>{o.holder.updateMatrixWorld(true);return new THREE.Box3().setFromObject(o.holder).getSize(new THREE.Vector3()).x+.01;};
    const t=controls.target;const rows=[5,4,3,2,1];
    for(let r=0;r<rows.length;r++)for(let i=0;i<rows[r];i++){
      const o=await spawn('Cube',s,[t.x+(i-(rows[r]-1)/2)*(cell||.4),.02+r*(cell||.4),t.z],{bounce:.1,friction:.8,mass:5},'Block');
      if(o){if(!cell)cell=meas(o);await sim.addBody(o);}}
    renderObjList&&renderObjList();fire();
  }
  /* a ready-made drop test: a plane, a ramp and a few balls above it */
  async function example(){
    sim.reset();
    const pl=addPrimitive('Plane');pl.holder.scale.setScalar(2.2);pl.name='Floor plane';pl.meta.phys={type:'static'};
    const rp=addPrimitive('Ramp');rp.holder.position.set(0,0,0);rp.meta.phys={type:'static'};
    for(let i=0;i<4;i++){const o=await spawn(i%2?'Cube':'Sphere',.14,[-.55+rnd(-.1,.1),1.2+i*.45,rnd(-.2,.2)],{bounce:.45,mass:3,...(i%2?{}:{shape:'sphere'})},i%2?'Block':'Ball');if(o)o.meta.spawn=false;}
    renderObjList&&renderObjList();selectObj&&selectObj(rp.id);controls.target.set(0,.4,0);bump();
    await sim.drop();fire();
  }
  function section(parent){
    const s=sec(parent,'Simulate');
    s.appendChild(el('div','note','Put objects above the floor or a plane, then press Drop. They fall, bounce and stack. Reset puts everything back.'));
    const row=el('div','chips');
    const go=btn('Drop','pri',()=>guard(async()=>{
      if(sim.playing){sim.pause();fire();return;}
      if(window.__sheet&&innerWidth<800&&window.__sheet.idx>1)window.__sheet.setIdx(1); // phone: shrink the panel so the fall is visible
      const r=await sim.drop(S.tab==='world'?'static':undefined);if(!r.dynamic)toast('Nothing to drop yet. Add a shape above the floor first.');fire();}));
    const rs=btn('Reset','',()=>{sim.reset();renderObjList&&renderObjList();fire();});
    row.append(go,rs);s.appendChild(row);
    const sp=chipRow(s,[['.25','Slow'],['1','Normal'],['2','Fast']],v=>String(sim.st.speed)===v,v=>sim.setSpeed(+v));
    const stat=el('div','note','');s.appendChild(stat);
    const paint=()=>{go.textContent=sim.playing?'Pause':(sim.st.t>0?'Resume':'Drop');const k=sim.counts;stat.textContent=sim.playing||sim.st.t>0?`${k.dynamic} moving · ${k.fixed} solid`:'';};
    refreshers.add(paint);paint();
    s.appendChild(btn('Try an example','',()=>guard(example)));
    s.appendChild(el('div','sub','Add things to the fall'));
    const sr=el('div','chips');
    sr.append(btn('Throw a ball','',()=>guard(throwBall)),btn('Shower','',()=>guard(shower)),btn('Tower','',()=>guard(tower)),btn('Kick all','',()=>guard(async()=>{await sim.kick();fire();})));
    s.appendChild(sr);
    s.appendChild(el('div','sub','Material'));
    const mr=el('div','chips');Object.entries(sim.MATERIALS).forEach(([k,m])=>mr.appendChild(btn(m.label,'',()=>{sim.material(k);toast(m.label+' on everything that falls');})));
    s.appendChild(mr);
    s.appendChild(el('div','sub','Gravity'));
    const gr=el('div','chips');[['Moon',1.6],['Earth',9.81],['Jupiter',24.8],['Zero',0],['Reverse',-9.81]].forEach(([l,v])=>gr.appendChild(btn(l,'',()=>guard(async()=>{sim.setGravity(-v);if(!sim.playing){await sim.drop();}fire();}))));
    s.appendChild(gr);
    const fl=el('div','chips'),fb=el('button','chip','Invisible floor');fb.setAttribute('aria-pressed',sim.st.floor);
    fb.addEventListener('click',()=>{sim.setFloor(!sim.st.floor);fb.setAttribute('aria-pressed',sim.st.floor);});fl.appendChild(fb);s.appendChild(fl);
    return s;
  }
  /* the selected object's body: falls, solid, or ignored by physics */
  function body(parent,o){
    if(!o||o.meta&&(o.meta.player))return;o.meta=o.meta||{};
    const s=sec(parent,'Physics');const ph=o.meta.phys||{type:'none'};
    chipRow(s,[['none','Ignored'],['static','Solid'],['dynamic','Falls']],v=>((o.meta.phys&&o.meta.phys.type)||'none')===v,v=>{o.meta.phys={...(o.meta.phys||{}),type:v};sim.invalidate();});
    const mr=el('div','chips');Object.entries(sim.MATERIALS).forEach(([k,m])=>mr.appendChild(btn(m.label,'',()=>{o.meta.phys=o.meta.phys||{type:'dynamic'};sim.material(k,o);})));
    s.appendChild(mr);
    return s;
  }
  return {section,body,fire};
}
