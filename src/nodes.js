/* Nodes view: a second view of the SAME stack. Nothing here owns data. Nodes are the stack's layers in order (Source -> layers -> Output); the small
   chips on a layer are its Select, Transform and Modulate blocks. Every edit changes STACK.layers through the same snapshot/undo as the list, so
   the two views always agree and render the same pixels. Pan with one finger on the background, pinch or wheel to zoom, tap a node to select it,
   tap an output port then an input port (or drag between them) to reconnect, which reorders the stack. */
export function createNodes(c){
  const {STACK,MODULES,IDENT,snap,undo,redo,rerender,addEffect,dupLayer,toast,el}=c;
  const NV={open:false,pos:{},zoom:1,pan:[0,0],sel:null,link:null,ptr:new Map(),gesture:null};
  const NS='http://www.w3.org/2000/svg',W=164,H=58,GAP=70;
  const mk=(tag,at,par)=>{const e=document.createElementNS(NS,tag);for(const k in at)e.setAttribute(k,at[k]);par&&par.appendChild(e);return e;};
  let root,svg,gz,sheet,tip;
  const vertical=()=>innerWidth<760;
  const layers=()=>STACK.layers;
  const nameOf=l=>(MODULES[l.module]&&MODULES[l.module].name)||l.module;
  const chipsOf=l=>{const o=[];if(l.select&&l.select!=='all')o.push(['SELECT',l.select==='person'?'person':l.select]);
    if(l.opacity!==100||(l.pos&&(l.pos[0]||l.pos[1]))||l.size!==100)o.push(['TRANSFORM',l.opacity!==100?l.opacity+'%':'moved']);
    if(l.mods&&l.mods.length)o.push(['MODULATE','×'+l.mods.length]);return o;};
  function autoLayout(){
    NV.pos={};const v=vertical();
    NV.pos.SRC=v?{x:0,y:0}:{x:0,y:0};
    layers().forEach((l,i)=>{NV.pos[l.uid]=v?{x:0,y:(i+1)*(H+GAP)}:{x:(i+1)*(W+GAP),y:0};});
    NV.pos.OUT=v?{x:0,y:(layers().length+1)*(H+GAP)}:{x:(layers().length+1)*(W+GAP),y:0};
    fit();
  }
  function fit(){
    if(!svg)return;const r=svg.getBoundingClientRect();if(!r.width)return;
    const pts=Object.values(NV.pos);if(!pts.length)return;
    const x0=Math.min(...pts.map(p=>p.x))-30,x1=Math.max(...pts.map(p=>p.x))+W+160,y0=Math.min(...pts.map(p=>p.y))-30,y1=Math.max(...pts.map(p=>p.y))+H+30;
    NV.zoom=Math.max(.35,Math.min(1.2,Math.min(r.width/(x1-x0),r.height/(y1-y0))));NV.pan=[r.width/2-(x0+x1)/2*NV.zoom,r.height/2-(y0+y1)/2*NV.zoom];
  }
  const nodeIds=()=>['SRC',...layers().map(l=>l.uid),'OUT'];
  function ensurePos(){
    const need=nodeIds().some(k=>!NV.pos[k]);if(need)autoLayout();
  }
  /* ---- stack edits (all through snap so undo works) ---- */
  const apply=(msg)=>{snap();rerender();draw();msg&&toast(msg,1400);};
  const idx=uid=>layers().findIndex(l=>l.uid===uid);
  function moveAfter(prev,uid){const a=layers(),i=idx(uid);if(i<0||prev===uid)return;const [l]=a.splice(i,1);const j=prev==='SRC'?0:idx(prev)+1;a.splice(j,0,l);STACK.sel=idx(uid);apply('Reconnected');autoLayout();draw();}
  function moveLast(uid){const a=layers(),i=idx(uid);if(i<0)return;const [l]=a.splice(i,1);a.push(l);STACK.sel=a.length-1;apply('Reconnected');autoLayout();draw();}
  NV.moveAfter=moveAfter;NV.moveLast=moveLast;
  function remove(uid){const a=layers(),i=idx(uid);if(i<0)return;if(a.length<=1){toast('Keep at least one effect');return;}a.splice(i,1);STACK.sel=Math.min(i,a.length-1);NV.sel=null;apply('Deleted');autoLayout();draw();}
  /* ---- drawing ---- */
  function portPos(key,out){const p=NV.pos[key],v=vertical();return v?{x:p.x+W/2,y:p.y+(out?H:0)}:{x:p.x+(out?W:0),y:p.y+H/2};}
  function edge(a,b,dashed){
    const p=portPos(a,true),q=portPos(b,false),v=vertical(),d=Math.max(30,Math.hypot(q.x-p.x,q.y-p.y)/2);
    const path=v?`M${p.x},${p.y} C${p.x},${p.y+d} ${q.x},${q.y-d} ${q.x},${q.y}`:`M${p.x},${p.y} C${p.x+d},${p.y} ${q.x-d},${q.y} ${q.x},${q.y}`;
    mk('path',{d:path,fill:'none',stroke:dashed?'#6a665e':'#cfc9bd','stroke-width':2,'stroke-dasharray':dashed?'5 5':'none'},gz);
  }
  function port(key,out,uid){
    const p=portPos(key,out),on=NV.link&&NV.link.from===key&&out;
    const g=mk('g',{'data-port':out?'out':'in','data-key':key,role:'button',tabindex:0,'aria-label':(out?'Output of ':'Input of ')+key},gz);
    mk('circle',{cx:p.x,cy:p.y,r:22/NV.zoom,fill:'transparent'},g);   // 44 px hit area at any zoom
    mk('circle',{cx:p.x,cy:p.y,r:7,fill:on?'#ff5a1f':'#12110f',stroke:on?'#ff5a1f':'#cfc9bd','stroke-width':2},g);
  }
  function node(key,title,sub,color,sel,off){
    const p=NV.pos[key];
    const g=mk('g',{'data-node':key,role:'button',tabindex:0,'aria-label':title+(sub?', '+sub:''),opacity:off?.5:1},gz);
    mk('rect',{x:p.x,y:p.y,width:W,height:H,rx:10,fill:'#1b1917',stroke:sel?'#ff5a1f':'#3a3733','stroke-width':sel?3:1.5},g);
    mk('rect',{x:p.x,y:p.y,width:7,height:H,rx:3,fill:color||'#888'},g);
    const t=mk('text',{x:p.x+18,y:p.y+24,fill:'#f2efe8','font-size':15,'font-weight':700,'font-family':'ui-sans-serif,system-ui'},g);t.textContent=title.length>17?title.slice(0,16)+'…':title;
    const s=mk('text',{x:p.x+18,y:p.y+43,fill:'#9a958c','font-size':11,'font-family':'ui-monospace,monospace'},g);s.textContent=sub;
    return g;
  }
  function draw(){
    if(!NV.open||!svg)return;ensurePos();gz.innerHTML='';gz.setAttribute('transform',`translate(${NV.pan[0]},${NV.pan[1]}) scale(${NV.zoom})`);
    const a=layers(),keys=nodeIds();
    for(let i=0;i<keys.length-1;i++){const nxt=a[i];edge(keys[i],keys[i+1],!!(nxt&&!nxt.visible));}
    node('SRC','Source',(c.srcName&&c.srcName())||'picture','#7aa2ff',false);
    a.forEach((l,i)=>{
      const sel=NV.sel===l.uid||(NV.sel==null&&STACK.sel===i);const off=!l.visible;
      node(l.uid,nameOf(l),(l.solo?'solo · ':'')+(off?'bypassed':String(i+1).padStart(2,'0')),IDENT[l.module]||'#ccc',sel,off);
      chipsOf(l).forEach((ch,j)=>{const p=NV.pos[l.uid],v=vertical(),cx=v?p.x+W+14:p.x+4+j*0,cy=v?p.y+4+j*22:p.y+H+10+j*22;
        mk('line',{x1:v?p.x+W:p.x+W/2,y1:v?p.y+H/2:p.y+H,x2:cx,y2:cy+9,stroke:'#4a4640','stroke-width':1.2},gz);
        const r=mk('rect',{x:cx,y:cy,width:118,height:18,rx:9,fill:'#24211e',stroke:'#4a4640'},gz);
        const t=mk('text',{x:cx+9,y:cy+13,fill:'#cfc9bd','font-size':10,'font-family':'ui-monospace,monospace'},gz);t.textContent=ch[0]+' · '+ch[1];});
    });
    node('OUT','Output','canvas','#e8e4da',false);
    keys.forEach(k=>{if(k!=='OUT')port(k,true);if(k!=='SRC')port(k,false);});
    sheetDraw();
  }
  /* ---- bottom sheet for the selected node ---- */
  function sheetDraw(){
    const l=layers().find(x=>x.uid===NV.sel)||layers()[STACK.sel];sheet.innerHTML='';
    if(!l){sheet.appendChild(el('div','nvhint','Tap a node to change it. Tap an output dot, then an input dot, to reconnect.'));return;}
    const i=idx(l.uid);
    const h=el('div','nvhead');h.append(el('b','',nameOf(l)),el('span','',(i+1)+' of '+layers().length));sheet.appendChild(h);
    const r=el('label','nvrow');r.append(el('span','','Opacity'));const o=document.createElement('input');o.type='range';o.min=0;o.max=100;o.value=l.opacity;o.setAttribute('aria-label','Opacity');
    o.addEventListener('input',()=>{l.opacity=+o.value;rerender(true);});o.addEventListener('change',()=>{snap();draw();});r.appendChild(o);sheet.appendChild(r);
    const b=el('div','nvbtns');
    const B=(t,f)=>{const x=el('button','btn',t);x.addEventListener('click',f);b.appendChild(x);return x;};
    B('Earlier',()=>{if(i>0){const [m]=layers().splice(i,1);layers().splice(i-1,0,m);STACK.sel=i-1;apply();autoLayout();draw();}});
    B('Later',()=>{if(i<layers().length-1){const [m]=layers().splice(i,1);layers().splice(i+1,0,m);STACK.sel=i+1;apply();autoLayout();draw();}});
    B(l.visible?'Bypass':'Use',()=>{l.visible=!l.visible;apply();});
    B(l.solo?'Unsolo':'Solo',()=>{l.solo=!l.solo;apply();});
    B('Duplicate',()=>{STACK.sel=i;dupLayer();NV.sel=null;autoLayout();draw();});
    B('Delete',()=>remove(l.uid));
    B('Edit controls',()=>{close();c.showLayer();});
    sheet.appendChild(b);
  }
  /* ---- pointer handling ---- */
  const toWorld=(x,y)=>{const r=svg.getBoundingClientRect();return[(x-r.left-NV.pan[0])/NV.zoom,(y-r.top-NV.pan[1])/NV.zoom];};
  function onDown(e){
    try{svg.setPointerCapture(e.pointerId);}catch(_){}NV.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY});
    if(NV.ptr.size===2){const [a,b]=[...NV.ptr.values()];NV.gesture={t:'pinch',d:Math.hypot(a.x-b.x,a.y-b.y),z:NV.zoom};return;}
    const portEl=e.target.closest('[data-port]'),nodeEl=e.target.closest('[data-node]');
    if(portEl)NV.gesture={t:'port',el:portEl,moved:false};
    else if(nodeEl&&nodeEl.dataset.node!=='SRC'&&nodeEl.dataset.node!=='OUT'){const k=nodeEl.dataset.node;NV.gesture={t:'node',key:+k,moved:false,start:{...NV.pos[+k]},w:toWorld(e.clientX,e.clientY)};}
    else if(nodeEl)NV.gesture={t:'tap',key:nodeEl.dataset.node};
    else NV.gesture={t:'pan',pan0:[...NV.pan]};
  }
  function onMove(e){
    const p=NV.ptr.get(e.pointerId);if(!p)return;p.x=e.clientX;p.y=e.clientY;const g=NV.gesture;if(!g)return;
    if(g.t==='pinch'&&NV.ptr.size>=2){const [a,b]=[...NV.ptr.values()],d=Math.hypot(a.x-b.x,a.y-b.y),nz=Math.max(.25,Math.min(2.5,g.z*d/g.d));zoomAt((a.x+b.x)/2,(a.y+b.y)/2,nz);return;}
    const dx=e.clientX-p.x0,dy=e.clientY-p.y0,far=Math.hypot(dx,dy)>7;
    if(g.t==='pan'){NV.pan=[g.pan0[0]+dx,g.pan0[1]+dy];gz.setAttribute('transform',`translate(${NV.pan[0]},${NV.pan[1]}) scale(${NV.zoom})`);}
    else if(g.t==='node'&&far){g.moved=true;const w=toWorld(e.clientX,e.clientY);NV.pos[g.key]={x:g.start.x+w[0]-g.w[0],y:g.start.y+w[1]-g.w[1]};draw();}
    else if(g.t==='port'&&far){g.moved=true;}
  }
  function onUp(e){
    const g=NV.gesture;NV.ptr.delete(e.pointerId);if(!g)return;if(g.t==='pinch'){if(NV.ptr.size<2)NV.gesture=null;return;}
    NV.gesture=null;
    if(g.t==='node'&&!g.moved){NV.sel=g.key;STACK.sel=idx(g.key);rerender(true);draw();}
    else if(g.t==='tap'){}
    else if(g.t==='port'){
      const out=g.el.dataset.port==='out',key=g.el.dataset.key;
      if(g.moved){ // drag from a port: connect to the port under the finger
        const t=document.elementFromPoint(e.clientX,e.clientY),pe=t&&t.closest&&t.closest('[data-port]');
        if(pe&&pe.dataset.port!==g.el.dataset.port){const a=out?key:pe.dataset.key,b=out?pe.dataset.key:key;connect(a,b);}
        return;
      }
      if(!NV.link){if(out){NV.link={from:key};tip.textContent='Now tap an input dot';tip.hidden=false;draw();}else{toast('Tap an output dot first',1600);}return;}
      if(out){NV.link={from:key};draw();return;}
      connect(NV.link.from,key);
    }
  }
  function connect(a,b){
    NV.link=null;tip.hidden=true;const num=k=>k==='SRC'||k==='OUT'?k:+k;a=num(a);b=num(b);
    if(a===b||a==='OUT'||b==='SRC'){draw();return;}
    if(b==='OUT'){if(a!=='SRC')moveLast(a);else draw();return;}
    moveAfter(a,b);
  }
  function zoomAt(cx,cy,nz){const r=svg.getBoundingClientRect(),x=cx-r.left,y=cy-r.top;const wx=(x-NV.pan[0])/NV.zoom,wy=(y-NV.pan[1])/NV.zoom;NV.zoom=nz;NV.pan=[x-wx*nz,y-wy*nz];gz.setAttribute('transform',`translate(${NV.pan[0]},${NV.pan[1]}) scale(${NV.zoom})`);}
  function onKey(e){
    if(!NV.open)return;
    if(e.key==='Escape'){if(NV.link){NV.link=null;tip.hidden=true;draw();}else close();return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
    const t=e.target;if(e.key==='Enter'&&t&&t.dataset){if(t.dataset.node&&+t.dataset.node){NV.sel=+t.dataset.node;STACK.sel=idx(NV.sel);draw();}else if(t.dataset.port){const f=new PointerEvent('pointerdown');}}
  }
  /* ---- shell ---- */
  function build(){
    root=el('div','nodesview');root.setAttribute('role','dialog');root.setAttribute('aria-label','Nodes view');
    const bar=el('div','nvbar');
    const B=(t,f,label)=>{const b=el('button','btn',t);if(label)b.setAttribute('aria-label',label);b.addEventListener('click',f);bar.appendChild(b);return b;};
    B('List view',()=>close());B('Undo',()=>undo(),'Undo');B('Redo',()=>redo(),'Redo');B('Auto layout',()=>{autoLayout();draw();});B('+ Effect',()=>{close();addEffect();});
    svg=mk('svg',{class:'nvsvg'});svg.style.touchAction='none';gz=mk('g',{},svg);
    sheet=el('div','nvsheet');tip=el('div','nvtip','');tip.hidden=true;
    root.append(bar,svg,tip,sheet);document.body.appendChild(root);
    svg.addEventListener('pointerdown',onDown);svg.addEventListener('pointermove',onMove);svg.addEventListener('pointerup',onUp);svg.addEventListener('pointercancel',onUp);
    svg.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.max(.25,Math.min(2.5,NV.zoom*(e.deltaY<0?1.1:.9))));},{passive:false});
    addEventListener('keydown',onKey);addEventListener('resize',()=>{if(NV.open){autoLayout();draw();}});
  }
  function open(){if(!root)build();NV.open=true;root.hidden=false;document.body.dataset.nodes='1';NV.sel=null;NV.link=null;tip.hidden=true;requestAnimationFrame(()=>{autoLayout();draw();requestAnimationFrame(()=>{fit();draw();});});}
  function close(){NV.open=false;if(root)root.hidden=true;delete document.body.dataset.nodes;}
  NV.open_=open;NV.close=close;NV.refresh=()=>{if(NV.open){const had=nodeIds().length;ensurePos();draw();}};NV.autoLayout=autoLayout;NV.draw=draw;
  return NV;
}
