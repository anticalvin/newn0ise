/* Scene document: ONE description of what an object is, used by everything that needs to remember or restore it (undo, redo, saving,
   World's undo, duplicating). An object is its id, name, where it is, whether it shows, its colour, its physics and its appearance
   (hardware look, effect stack, surface look, procedural material). Nothing here is shared by reference: every snapshot is a deep copy, and
   applying one gives the object its own copies back, so two objects never end up sharing a look or a material. */
const J=x=>x==null?null:JSON.parse(JSON.stringify(x));
export function createSceneDoc(c){
  const {S,SURF,MAT,LGT,NG}=c;let formHooks=null;
  function colorOf(o){let col=null;o.holder.traverse(n=>{if(!col&&n.isMesh&&n.material&&!n.userData.noView){const m=Array.isArray(n.material)?n.material[0]:n.material;if(m&&m.color)col='#'+m.color.getHexString();}});return col;}
  function setColor(o,hex){o.holder.traverse(n=>{if(!n.isMesh||n.userData.noView||!n.material)return;(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(m.color)m.color.set(hex);});});}
  const appearance=o=>({look:J(o.look),stack:o.stack||null,surf:o.surf?{...o.surf}:null,mat:J(o.mat),ng:J(o.nmat)});
  function putAppearance(o,a){
    if(!a)return;
    if(a.look)o.look=J(a.look);else delete o.look;
    if(a.stack)o.stack=a.stack;else delete o.stack;
    if(a.surf)SURF.set(o,{...a.surf});else if(o.surf)SURF.set(o,{m:'',ta:0});
    if(a.mat)MAT.set(o,a.mat);else if(o.mat)MAT.clear(o);
    if(NG){if(a.ng){if(JSON.stringify(o.nmat)!==JSON.stringify(a.ng))NG.apply(o,a.ng);}else if(o.nmat)NG.clear(o);}
  }
  function snapObject(o){
    const h=o.holder;
    return {id:o.id,name:o.name,tr:{p:h.position.toArray(),q:h.quaternion.toArray(),s:h.scale.toArray()},vis:o.vis!==false,color:colorOf(o),
      phys:o.meta&&o.meta.phys?{...o.meta.phys}:null,ap:appearance(o),fm:formHooks?formHooks.snap(o):null};
  }
  function applyObject(o,d){
    const h=o.holder;
    h.position.fromArray(d.tr.p);h.quaternion.fromArray(d.tr.q);h.scale.fromArray(d.tr.s);h.updateMatrixWorld(true);
    o.vis=d.vis;h.visible=d.vis;if(d.name)o.name=d.name;
    if(d.color&&colorOf(o)!==d.color)setColor(o,d.color);
    o.meta=o.meta||{};if(d.phys)o.meta.phys={...d.phys};else if(o.meta.phys&&!d.phys&&d.phys!==undefined)delete o.meta.phys;
    putAppearance(o,d.ap);
    if(d.fm&&formHooks)formHooks.apply(o,d.fm); // a generated object regenerates from the parameters it had then
  }
  /* the whole editable scene: every object plus the stage settings that change how it looks */
  const stage=()=>({env:S.env,bg:S.bg,grid:S.grid,sun:LGT?{...LGT.L,auto:false}:null});
  const snapScene=()=>({objs:S.objs.map(snapObject),stage:stage()});
  function applyStage(st,hooks){
    if(!st)return;
    S.env=st.env;S.bg=st.bg;S.grid=st.grid;if(hooks&&hooks.env)hooks.env(st.env);
    if(st.sun&&LGT){Object.assign(LGT.L,st.sun);LGT.L.auto=false;LGT.setOn(LGT.L.on);}
  }
  /* an object copies another's look: independent copies, same values */
  function copyAppearance(from,to){putAppearance(to,appearance(from));const col=colorOf(from);if(col)setColor(to,col);}
  return {setFormHooks:h=>{formHooks=h;},colorOf,setColor,appearance,putAppearance,snapObject,applyObject,snapScene,applyStage,copyAppearance};
}
