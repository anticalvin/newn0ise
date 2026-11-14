/* World tab: the easy way to build a place. Tap a tile to put something in the world, drag it with the gizmo or type exact numbers,
   press Play to let physics run, press Walk to stand inside it. Every edit goes through the scene API, so what you do by hand and
   what an AI does through MCP are the same operations. Undo and redo cover everything placed from this tab. */
export function createWorldEditor(c){
  const {THREE,S,api,sim,walk,camera,canvas,controls,tc,objById,selectObj,removeObj,bump,el,sec,btn,toast,renderObjList}=c;
  const LIB=[['cube','Cube'],['sphere','Sphere'],['cylinder','Cylinder'],['cone','Cone'],['capsule','Capsule'],['human','Human'],['wall','Wall'],['floor','Floor'],['platform','Platform'],['pillar','Pillar'],['crate','Crate'],['ball','Ball']];
  const G={
    cube:'<rect x="9" y="9" width="22" height="22"/>',sphere:'<circle cx="20" cy="20" r="12"/>',cylinder:'<ellipse cx="20" cy="11" rx="10" ry="4"/><path d="M10 11v18c0 2 4.5 4 10 4s10-2 10-4V11"/>',
    cone:'<path d="M20 6L9 30c0 2 5 4 11 4s11-2 11-4z"/>',capsule:'<rect x="12" y="5" width="16" height="30" rx="8"/>',human:'<circle cx="20" cy="9" r="4"/><path d="M12 16h16M20 14v12M20 26l-6 10M20 26l6 10M12 16l-3 10M28 16l3 10"/>',
    wall:'<rect x="4" y="10" width="32" height="20"/><path d="M4 20h32M14 10v10M26 20v10"/>',floor:'<path d="M6 26l14-8 14 8-14 8z"/>',platform:'<path d="M8 22l12-6 12 6v6l-12 6-12-6z M8 22l12 6 12-6M20 28v6"/>',
    pillar:'<rect x="14" y="5" width="12" height="30"/><path d="M11 5h18M11 35h18"/>',crate:'<rect x="8" y="8" width="24" height="24"/><path d="M8 8l24 24M32 8L8 32"/>',ball:'<circle cx="20" cy="20" r="11"/><path d="M9 20h22M20 9c-5 6-5 16 0 22M20 9c5 6 5 16 0 22"/>'
  };
  const svg=k=>`<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${G[k]||''}</svg>`;
  const ed={snap:false,undo:[],redo:[],uid:0,tod:11};
  let pane=null,detailsEl=null,syncs=[],playBtn=null;
  const own=o=>o&&o.meta&&o.meta.asset&&o.meta.uid;
  /* ---- undo: snapshots of the placed objects ---- */
  const snapshot=()=>S.objs.filter(own).map(o=>{return{uid:o.meta.uid,asset:o.meta.asset,name:o.name,pos:o.holder.position.toArray(),q:o.holder.quaternion.toArray(),scale:o.holder.scale.toArray(),color:colorOf(o),phys:o.meta.phys||null,vis:o.vis,url:o.meta.url||null};});
  function colorOf(o){let col=null;o.holder.traverse(n=>{if(!col&&n.isMesh&&n.material&&n.material.color&&!n.userData.noView)col='#'+n.material.color.getHexString();});return col;}
  const push=()=>{ed.undo.push(snapshot());if(ed.undo.length>60)ed.undo.shift();ed.redo.length=0;};
  async function restore(state){
    const cur=new Map(S.objs.filter(own).map(o=>[o.meta.uid,o]));const want=new Map(state.map(s=>[s.uid,s]));
    for(const [u,o] of cur)if(!want.has(u))removeObj(o.id);
    for(const s of state){
      let o=cur.get(s.uid);
      if(!o){const r=await api.run({cmd:'add',type:s.asset,name:s.name,pos:s.pos});o=S.objs.find(x=>x.id===r.id);if(!o)continue;o.meta.uid=s.uid;}
      const h=o.holder;h.position.fromArray(s.pos);h.quaternion.fromArray(s.q);h.scale.fromArray(s.scale);o.vis=s.vis;h.visible=s.vis;
      if(s.color)await api.run({cmd:'set',id:o.id,color:s.color});if(s.phys)o.meta.phys={...s.phys};
    }
    sim.invalidate();renderObjList&&renderObjList();bump();renderDetails();
  }
  async function doUndo(){if(!ed.undo.length){toast('Nothing to undo');return;}ed.redo.push(snapshot());await restore(ed.undo.pop());}
  async function doRedo(){if(!ed.redo.length){toast('Nothing to redo');return;}ed.undo.push(snapshot());await restore(ed.redo.pop());}
  tc.addEventListener('dragging-changed',e=>{if(e.value&&own(objById(S.sel)))push();else if(!e.value)sim.invalidate();});
  /* ---- placing ---- */
  const ray=new THREE.Raycaster();
  function groundPoint(){
    ray.setFromCamera(new THREE.Vector2(0,-.1),camera);const t=-ray.ray.origin.y/(ray.ray.direction.y||-1e-6);
    const p=t>0&&t<60?ray.ray.at(t,new THREE.Vector3()):controls.target.clone().setY(0);p.y=0;return p;
  }
  const sn=v=>ed.snap?Math.round(v*2)/2:v;
  async function place(key){
    push();const p=groundPoint();p.x=sn(p.x);p.z=sn(p.z);
    const boxes=S.objs.filter(o=>o.vis).map(o=>new THREE.Box3().setFromObject(o.holder));
    for(let i=0;i<10&&boxes.some(b=>!b.isEmpty()&&p.x>b.min.x-.3&&p.x<b.max.x+.3&&p.z>b.min.z-.3&&p.z<b.max.z+.3);i++)p.x+=1.4;
    const drop=sim.playing||key==='crate'||key==='ball';
    const r=await api.run({cmd:'add',type:key,pos:[p.x,drop?1.5:0,p.z]});
    const o=S.objs.find(x=>x.id===r.id);if(o){o.meta.uid=++ed.uid+1000;selectObj(o.id);setGizmo('translate');}
    renderObjList&&renderObjList();sim.invalidate();renderDetails();
    if(S.objs.length<4&&!sim.playing)api.run({cmd:'camera',frame:true});
  }
  function setGizmo(mode){const o=objById(S.sel);S.pivot=false;S.gizmo=mode||null;if(o&&S.gizmo){tc.attach(o.holder);tc.setMode(S.gizmo);tc.setTranslationSnap(ed.snap?.5:null);tc.setRotationSnap(ed.snap?Math.PI/12:null);tc.setScaleSnap(ed.snap?.1:null);}else tc.detach();bump();}
  /* ---- time of day ---- */
  const lerpC=(a,b,t)=>{const A=new THREE.Color(a),B=new THREE.Color(b);return '#'+A.lerp(B,Math.max(0,Math.min(1,t))).getHexString();};
  function applyTime(h){
    ed.tod=h;const el0=Math.sin((h-6)/12*Math.PI),day=Math.max(0,el0),az=(h-12)/12*Math.PI*.9;
    const R=14,sunPos=[Math.sin(az)*R*Math.max(.25,Math.cos(Math.asin(Math.max(-1,Math.min(1,el0)))*.9)),Math.max(1.5,R*day),Math.cos(az)*R*.6+4];
    const bg=day<.12?lerpC('#0b1220','#e4986b',day/.12):lerpC('#e4986b','#9fb4c8',(day-.12)/.4);
    api.run({cmd:'environment',bg,envIntensity:.12+.55*Math.min(1,day*1.6),sun:{intensity:.15+2.3*Math.min(1,day*1.4),pos:sunPos,color:lerpC('#ff9a5a','#fff4e0',day*2.2)},fog:S.worldFog?{color:bg,near:12,far:S.worldFog}:null});
  }
  /* ---- panel ---- */
  const field=(label,input)=>{const r=el('div','row');r.style.gridTemplateColumns='100px 1fr';r.append(el('label','',label),input);return r;};
  const num=(get,set,step=.1)=>{const i=document.createElement('input');i.type='number';i.step=step;i.className='field';i.style.width='100%';i.value=(+get()).toFixed(2);i.addEventListener('change',()=>{push();set(+i.value);});i.sync=()=>{if(document.activeElement!==i)i.value=(+get()).toFixed(2);};syncs.push(i.sync);return i;};
  function renderDetails(){
    if(!detailsEl)return;detailsEl.innerHTML='';syncs=[];
    const o=objById(S.sel);
    if(!o){detailsEl.appendChild(el('div','note','Select something in the view to edit it, or tap a tile above to add one.'));return;}
    const s=sec(detailsEl,'Selected',o.name),h=o.holder;
    const nm=document.createElement('input');nm.className='field';nm.value=o.name;nm.style.width='100%';nm.addEventListener('change',()=>{o.name=nm.value||o.name;renderObjList&&renderObjList();});s.appendChild(field('Name',nm));
    const gz=el('div','chips');[['translate','Move'],['rotate','Rotate'],['scale','Scale']].forEach(([m,l])=>{const b=el('button','chip',l);b.setAttribute('aria-pressed',S.gizmo===m);b.addEventListener('click',()=>{setGizmo(m);gz.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed',x===b));});gz.appendChild(b);});s.appendChild(gz);
    const px=['x','y','z'].map(k=>num(()=>h.position[k],v=>{h.position[k]=sn(v);sim.invalidate();bump();}));const pr=el('div','chips');pr.style.display='grid';pr.style.gridTemplateColumns='repeat(3,1fr)';px.forEach(i=>pr.appendChild(i));s.appendChild(field('Position',pr));
    const ry=num(()=>THREE.MathUtils.radToDeg(h.rotation.y),v=>{h.rotation.y=THREE.MathUtils.degToRad(ed.snap?Math.round(v/15)*15:v);sim.invalidate();bump();},5);s.appendChild(field('Turn °',ry));
    const dims=()=>{const b=new THREE.Box3().setFromObject(h);return b.getSize(new THREE.Vector3());};
    const dm=['x','y','z'].map((k,i)=>num(()=>dims()[k],v=>{const d=dims().toArray();d[i]=Math.max(.05,v);api.run({cmd:'set',id:o.id,dims:d,pos:h.position.toArray(),rot:[h.rotation.x*57.2958,h.rotation.y*57.2958,h.rotation.z*57.2958]});sim.invalidate();},.1));
    const dr=el('div','chips');dr.style.display='grid';dr.style.gridTemplateColumns='repeat(3,1fr)';dm.forEach(i=>dr.appendChild(i));s.appendChild(field('Size m',dr));
    const col=document.createElement('input');col.type='color';col.value=colorOf(o)||'#cccccc';col.style.cssText='width:100%;height:44px;background:none;border:1px solid var(--line,#333)';col.addEventListener('change',()=>{push();api.run({cmd:'set',id:o.id,color:col.value});});s.appendChild(field('Colour',col));
    const ph=o.meta.phys||{type:'none'};const pc=el('div','chips');
    [['none','None'],['static','Solid'],['dynamic','Falls']].forEach(([v,l])=>{const b=el('button','chip',l);b.setAttribute('aria-pressed',(ph.type||'none')===v);b.addEventListener('click',()=>{push();api.run({cmd:'set',id:o.id,phys:{type:v}});pc.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed',x===b));});pc.appendChild(b);});s.appendChild(field('Physics',pc));
    const bn=document.createElement('input');bn.type='range';bn.min=0;bn.max=1;bn.step=.05;bn.value=ph.bounce??.25;bn.addEventListener('input',()=>api.run({cmd:'set',id:o.id,phys:{bounce:+bn.value}}));s.appendChild(field('Bounce',bn));
    const ac=el('div','chips');
    ac.append(btn('Drop to floor','',()=>{push();h.position.y=0;h.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(h);h.position.y-=b.min.y;sim.invalidate();bump();syncs.forEach(f=>f());}),
      btn('Duplicate','',async()=>{push();const r=await api.run({cmd:'duplicate',id:o.id,pos:[h.position.x+1.2,h.position.y,h.position.z]}).catch(async()=>{if(o.meta.asset){return api.run({cmd:'add',type:o.meta.asset,pos:[h.position.x+1.2,h.position.y,h.position.z]});}throw new Error('Only placed items can be duplicated');});const n=S.objs.find(x=>x.id===r.id);if(n){n.meta.uid=++ed.uid+1000;n.meta.asset=o.meta.asset;n.meta.phys=o.meta.phys?{...o.meta.phys}:n.meta.phys;selectObj(n.id);}renderDetails();}),
      btn('Delete','',()=>{push();removeObj(o.id);sim.invalidate();renderDetails();}));
    s.appendChild(ac);
  }
  function build(p){
    pane=p;
    const top=sec(p,'Play');
    const row=el('div','chips');
    playBtn=btn('Play','pri',async()=>{if(sim.playing){sim.pause();playBtn.textContent='Play';}else{try{const r=await sim.play();playBtn.textContent='Pause';if(!r.bodies)toast('Nothing has physics yet. Set an object to Falls first.');}catch(e){toast('Physics couldn’t load: '+(e.message||e),5000);}}});
    row.append(playBtn,btn('Reset','',()=>{sim.reset();playBtn.textContent='Play';}),btn('Walk','',()=>document.getElementById('bWalk').click()),btn('Undo','',doUndo),btn('Redo','',doRedo),btn('Open in Effects','',()=>c.openInEffects&&c.openInEffects()));top.appendChild(row);
    const pl=sec(p,'Place');pl.appendChild(el('div','note','Tap a tile. It lands in the middle of your view, ready to drag.'));
    const grid=el('div','wgrid');LIB.forEach(([k,l])=>{const b=el('button','wtile');b.innerHTML=svg(k)+`<span>${l}</span>`;b.addEventListener('click',()=>place(k));grid.appendChild(b);});pl.appendChild(grid);
    detailsEl=el('div');p.appendChild(detailsEl);
    const w=sec(p,'World');
    const tod=document.createElement('input');tod.type='range';tod.min=0;tod.max=24;tod.step=.1;tod.value=ed.tod;tod.addEventListener('input',()=>applyTime(+tod.value));w.appendChild(field('Time of day',tod));
    const fg=document.createElement('input');fg.type='range';fg.min=0;fg.max=120;fg.step=5;fg.value=0;fg.addEventListener('input',()=>{S.worldFog=+fg.value||0;applyTime(ed.tod);});w.appendChild(field('Fog distance',fg));
    const tg=el('div','chips');
    const chip=(l,on,fn)=>{const b=el('button','chip',l);b.setAttribute('aria-pressed',on);b.addEventListener('click',()=>{on=!on;b.setAttribute('aria-pressed',on);fn(on);});tg.appendChild(b);};
    chip('Ground',true,v=>api.run({cmd:'environment',ground:v?{color:'#8a8d82',size:120}:false}));
    chip('Shadows',true,v=>api.run({cmd:'environment',shadows:v}));
    chip('Snap to grid',false,v=>{ed.snap=v;if(S.gizmo)setGizmo(S.gizmo);});
    chip('Grid lines',false,v=>api.run({cmd:'environment',grid:v}));
    chip('Effect look',false,v=>api.run({cmd:'look',on:v}));
    w.appendChild(tg);
    renderDetails();
  }
  /* a world to start in: sky, ground, sun, shadows, no effect look */
  function starter(){api.run({cmd:'look',on:false});api.run({cmd:'camera',pos:[6,4,9],target:[0,1,0]});api.run({cmd:'environment',ground:{color:'#8a8d82',size:120},shadows:true,grid:false});applyTime(ed.tod);}
  window.__worldRefresh=soft=>{if(soft)syncs.forEach(f=>f());else renderDetails();};
  addEventListener('keydown',e=>{if(S.tab!=='world'||/INPUT|TEXTAREA|SELECT/.test((e.target||{}).tagName||''))return;
    if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();e.shiftKey?doRedo():doUndo();}
    else if(e.key==='Delete'||e.key==='Backspace'){const o=objById(S.sel);if(o){push();removeObj(o.id);renderDetails();}}
    else if(e.key==='w')setGizmo('translate');else if(e.key==='e')setGizmo('rotate');else if(e.key==='r')setGizmo('scale');});
  return {build,starter,place,undo:doUndo,redo:doRedo,ed};
}
