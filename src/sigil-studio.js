/* Sigil studio: the drawing page of 3D. Same brush engine as the Sigil tab, with its own full-screen layout built for thumbs:
   a tool dock along the bottom, one panel at a time above it, a size strip on the edge. One finger draws, two fingers move the view.
   Also holds the material creator and "my materials". */
import {cleanMP} from './sigil.js';

const PALETTE=['#ffffff','#dfe6ee','#8a8f98','#1a1a1c','#000000','#ff5a1f','#ff3b58','#f0a030','#ffd84a','#4fe39a','#2fb6a7','#3fa7ff','#5a55ff','#b06bff','#ff7ac8','#e8dcc2'];
const LSK='n0ise.sigil.umats',LSR='n0ise.sigil.recent',LSH='n0ise.sigil.hint';
const lsGet=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}};
const hexRGB=h=>{const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];};
const rgbHex=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>rgbHex(hexRGB(a).map((v,i)=>v+(hexRGB(b)[i]-v)*t));

/* a round preview of a material, drawn with CSS only (no second WebGL context) */
export function previewCSS(col,p){
  const m=p.metalness||0,r=p.roughness!=null?p.roughness:.5,gl=p.emissive?(p.emissive==='self'?col:p.emissive):null;
  const hl=Math.max(.06,(1-r)*.95),sz=14+r*46;
  let base;
  if(m>.5)base=`linear-gradient(160deg,${mix(col,'#ffffff',.65)} 0%,${col} 34%,${mix(col,'#000000',.72)} 58%,${mix(col,'#ffffff',.35)} 100%)`;
  else base=`radial-gradient(circle at 36% 30%,${mix(col,'#ffffff',.28)} 0%,${col} 52%,${mix(col,'#000000',.62)} 100%)`;
  let bg=`radial-gradient(circle at 32% 26%,rgba(255,255,255,${hl}) 0,rgba(255,255,255,0) ${sz}%),${base}`;
  const o=Math.min(p.opacity!=null?p.opacity:1,p.transmission?1-p.transmission*.45:1);
  return {background:bg,opacity:String(Math.max(.4,o)),boxShadow:gl?`0 0 ${10+(p.ei||1)*6}px ${mix(gl,'#000000',.15)}aa, inset 0 0 0 1px rgba(255,255,255,.14)`:'inset 0 0 0 1px rgba(255,255,255,.14)'};
}

export function createSigilStudio(c){
  const {SG,S,el,btn,sliderRow,chipRow,toast,canvas,controls,stage,setTab,exitStudio,savePic,lookOpen,bump}=c;
  const B=SG.B,MATS=SG.MATS;
  let root=null,panel=null,openP='',dock=null,undoB=null,redoB=null,sizeEl=null,sizeFill=null,bubble=null,matDot=null,spin=false,isOn=false;
  const hap=n=>{try{navigator.vibrate&&navigator.vibrate(n||8);}catch(e){}};
  const mk=(t,cls,txt)=>{const e=document.createElement(t);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};
  let umats=lsGet(LSK,[]);let recent=lsGet(LSR,[]);
  const saveU=()=>{if(!lsSet(LSK,umats))toast('Couldn’t save your materials in this browser. They stay until you leave the page.',4000);};
  const props=()=>B.mat==='custom'&&B.mp?B.mp:MATS[B.mat][2];
  function useCustom(p,col,name){B.mat='custom';B.mp=cleanMP(p)||{metalness:.5,roughness:.4};if(col)B.col=col;B.mpName=name||'';paintAll();}
  function pushRecent(col){recent=[col,...recent.filter(x=>x!==col)].slice(0,8);lsSet(LSR,recent);}

  /* ---------- build ---------- */
  function build(){
    root=mk('div');root.id='sgs';root.setAttribute('role','region');root.setAttribute('aria-label','Sigil studio');
    /* top bar */
    const top=mk('div','sg-top glass');
    const back=mk('button','sg-b','‹ Scene');back.setAttribute('aria-label','Leave the Sigil studio and go back to the scene editor');back.addEventListener('click',()=>{hap();exitStudio();});
    const brand=mk('div','sg-brand');brand.innerHTML='sigil<i>.</i>';
    undoB=mk('button','sg-i','↶');undoB.setAttribute('aria-label','Undo');undoB.addEventListener('click',()=>{hap();SG.undo();});
    redoB=mk('button','sg-i','↷');redoB.setAttribute('aria-label','Redo');redoB.addEventListener('click',()=>{hap();SG.redo();});
    top.append(back,brand,mk('span','sg-grow'),undoB,redoB);
    /* size strip */
    sizeEl=mk('div','sg-size');sizeEl.setAttribute('role','slider');sizeEl.tabIndex=0;sizeEl.setAttribute('aria-label','Brush size');sizeEl.setAttribute('aria-valuemin','2');sizeEl.setAttribute('aria-valuemax','80');
    sizeFill=mk('i');bubble=mk('span','sg-bub');sizeEl.append(sizeFill);
    const setSize=y=>{const r=sizeEl.getBoundingClientRect(),t=1-Math.max(0,Math.min(1,(y-r.top)/r.height));B.size=Math.round(2+t*78);paintSize();};
    sizeEl.addEventListener('pointerdown',e=>{e.stopPropagation();sizeEl.setPointerCapture(e.pointerId);sizeEl.classList.add('on');setSize(e.clientY);});
    sizeEl.addEventListener('pointermove',e=>{if(sizeEl.hasPointerCapture(e.pointerId))setSize(e.clientY);});
    const endS=e=>{sizeEl.classList.remove('on');};sizeEl.addEventListener('pointerup',endS);sizeEl.addEventListener('pointercancel',endS);
    sizeEl.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowRight'){B.size=Math.min(80,B.size+2);paintSize();e.preventDefault();}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){B.size=Math.max(2,B.size-2);paintSize();e.preventDefault();}});
    const sizeWrap=mk('div','sg-sizewrap');sizeWrap.append(sizeEl,bubble);
    /* dock */
    dock=mk('div','sg-dock glass');dock.setAttribute('role','toolbar');dock.setAttribute('aria-label','Sigil tools');
    const tool=(id,label,ico,fn,pressedFn)=>{const b=mk('button','sg-t');b.type='button';b.dataset.id=id;b.setAttribute('aria-label',label);b.innerHTML=`<span class="ic">${ico}</span><span class="lb">${label}</span>`;b.addEventListener('click',()=>{hap();fn();});if(pressedFn)b._p=pressedFn;return b;};
    const modeT=(id,label,ico)=>tool(id,label,ico,()=>{SG.setMode(id);closePanel();paintAll();},()=>B.mode===id);
    matDot=mk('i','sg-dot');
    const matB=tool('mat','Material','',()=>togglePanel('mat'),()=>openP==='mat');matB.querySelector('.ic').appendChild(matDot);
    dock.append(
      modeT('draw','Draw','<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/></svg>'),
      modeT('erase','Erase','<svg viewBox="0 0 24 24"><path d="M7 17l-3-3 9-9 6 6-6 6z"/><path d="M10 17h9"/></svg>'),
      modeT('orbit','View','<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/></svg>'),
      matB,
      tool('brush','Brush','<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',()=>togglePanel('brush'),()=>openP==='brush'),
      tool('layers','Layers','<svg viewBox="0 0 24 24"><path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/></svg>',()=>togglePanel('layers'),()=>openP==='layers'),
      tool('more','More','<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',()=>togglePanel('more'),()=>openP==='more'));
    panel=mk('div','sg-panel glass');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Sigil panel');
    const hint=mk('div','sg-hint glass','One finger draws. Two fingers move the view.');hint.id='sghint';
    root.append(top,sizeWrap,hint,panel,dock);stage.appendChild(root);
    SG.sLayers=mk('div');
    SG.hooks.push(paintAll);
  }

  /* ---------- state painting ---------- */
  function paintSize(){
    const t=(B.size-2)/78;sizeFill.style.height=(t*100)+'%';sizeEl.setAttribute('aria-valuenow',B.size);
    const d=Math.max(4,Math.min(64,B.size*.8));bubble.style.cssText=`width:${d}px;height:${d}px;background:${B.col}`;bubble.textContent='';
  }
  function paintAll(){
    if(!root)return;
    const o=SG.target();
    undoB.disabled=!o||!o.meta.sigil.undo.length;redoB.disabled=!o||!o.meta.sigil.redo.length;
    dock.querySelectorAll('.sg-t').forEach(b=>b.setAttribute('aria-pressed',!!(b._p&&b._p())));
    const pv=previewCSS(B.col,props());Object.assign(matDot.style,pv);matDot.style.background=pv.background;
    paintSize();
  }
  function closePanel(){openP='';panel.hidden=true;paintAll();}
  function togglePanel(id){if(openP===id){closePanel();return;}openP=id;panel.hidden=false;panel.innerHTML='';fill(id);panel.scrollTop=0;paintAll();}
  const head=(t)=>{const h=mk('div','sg-ph');h.appendChild(mk('b','',t));const x=mk('button','sg-x','×');x.type='button';x.setAttribute('aria-label','Close panel');x.addEventListener('click',()=>{hap();closePanel();});h.appendChild(x);panel.appendChild(h);};
  const note=(t)=>mk('div','sg-note',t);
  const group=(t)=>{const g=mk('div','sg-g');if(t)g.appendChild(mk('div','sg-gt',t));panel.appendChild(g);return g;};

  function fill(id){({mat:matPanel,brush:brushPanel,layers:layersPanel,more:morePanel})[id]();}

  /* ---------- material panel ---------- */
  function matPanel(){
    head('Material');
    const gc=group('Colour');
    const sw=mk('div','sg-sw');
    const addSw=(col)=>{const b=mk('button','sg-swb');b.type='button';b.style.background=col;b.setAttribute('aria-label','Colour '+col);b.setAttribute('aria-pressed',B.col.toLowerCase()===col.toLowerCase());b.addEventListener('click',()=>{B.col=col;pushRecent(col);hap(6);matPanelRefresh();});sw.appendChild(b);};
    PALETTE.forEach(addSw);
    const lab=mk('label','sg-swb sg-pick');lab.title='Any colour';const ci=mk('input');ci.type='color';ci.value=B.col;ci.setAttribute('aria-label','Pick any colour');ci.addEventListener('input',()=>{B.col=ci.value;paintAll();});ci.addEventListener('change',()=>{pushRecent(ci.value);});lab.append(mk('span','','+'),ci);sw.appendChild(lab);
    gc.appendChild(sw);
    if(recent.length){const rr=mk('div','sg-sw sg-rec');rr.appendChild(mk('span','sg-gt','Recent'));recent.forEach(col=>{const b=mk('button','sg-swb');b.type='button';b.style.background=col;b.setAttribute('aria-label','Recent colour '+col);b.addEventListener('click',()=>{B.col=col;hap(6);matPanelRefresh();});rr.appendChild(b);});gc.appendChild(rr);}
    const gm=group('Materials');
    const grid=mk('div','sg-mats');
    const card=(name,css,on,fn,del)=>{const w=mk('div','sg-mw');const b=mk('button','sg-m');b.type='button';b.setAttribute('aria-pressed',on);const i=mk('i');if(typeof css==='string')i.style.background=css;else Object.assign(i.style,css);b.append(i,mk('span','',name));b.addEventListener('click',()=>{hap(6);fn();});w.appendChild(b);if(del){const d=mk('button','sg-md','×');d.type='button';d.setAttribute('aria-label','Delete '+name);d.addEventListener('click',e=>{e.stopPropagation();del();});w.appendChild(d);}return w;};
    for(const k in MATS)grid.appendChild(card(MATS[k][0],MATS[k][3],B.mat===k,()=>{B.mat=k;B.mp=null;B.col=MATS[k][1];matPanelRefresh();}));
    gm.appendChild(grid);
    const gu=group('My materials');
    const ug=mk('div','sg-mats');
    umats.forEach((u,ix)=>{const pv=previewCSS(u.c,u.p);ug.appendChild(card(u.name,{background:pv.background,boxShadow:pv.boxShadow},B.mat==='custom'&&B.mpName===u.name,()=>{useCustom(u.p,u.c,u.name);matPanelRefresh();},()=>{umats.splice(ix,1);saveU();matPanelRefresh();toast('Deleted “'+u.name+'”');}));});
    gu.appendChild(ug);
    if(!umats.length)gu.appendChild(note('Nothing saved yet. Make one below and it shows up here.'));
    const gk=group('Create a material');
    const cb=mk('button','sg-wide','Make your own');cb.type='button';cb.addEventListener('click',()=>{hap();if(B.mat!=='custom'){B.mp={...MATS[B.mat][2]};B.mat='custom';B.mpName='';}creator(gk);cb.remove();paintAll();});
    gk.appendChild(cb);
    if(B.mat==='custom')cb.click();
    const ga=group('Use on what is already drawn');
    const ar=mk('div','sg-row');
    const a1=mk('button','sg-wide','Recolour last stroke');a1.type='button';const a2=mk('button','sg-wide','Recolour whole drawing');a2.type='button';
    a1.addEventListener('click',()=>{const o=SG.target();if(!o||!o.meta.sigil.strokes.length){toast('Nothing drawn yet.');return;}const st=o.meta.sigil,a=st.strokes.slice(),l=a[a.length-1];a[a.length-1]={...l,...SG.matOf()};if(a[a.length-1].mp===undefined)delete a[a.length-1].mp;SG.commit(o,a);hap();});
    a2.addEventListener('click',()=>{const o=SG.target();if(!o||!o.meta.sigil.strokes.length){toast('Nothing drawn yet.');return;}SG.commit(o,o.meta.sigil.strokes.map(x=>{const y={...x,...SG.matOf()};if(y.mp===undefined)delete y.mp;return y;}));hap();});
    ar.append(a1,a2);ga.appendChild(ar);
  }
  function matPanelRefresh(){const y=panel.scrollTop;panel.innerHTML='';matPanel();panel.scrollTop=y;paintAll();}

  function creator(host){
    const box=mk('div','sg-cr');host.appendChild(box);
    const pvw=mk('div','sg-prev');const sph=mk('i');pvw.appendChild(sph);
    const nameI=mk('input','sg-name');nameI.type='text';nameI.placeholder='Name';nameI.maxLength=24;nameI.value=B.mpName||'';nameI.setAttribute('aria-label','Material name');
    const top=mk('div','sg-crtop');top.append(pvw,nameI);box.appendChild(top);
    const repaint=()=>{const pv=previewCSS(B.col,B.mp);Object.assign(sph.style,pv);paintAll();};
    const sl=(label,key,min,max,step,def,fmt)=>sliderRow(box,label,()=>B.mp[key]!=null?B.mp[key]:def,v=>{B.mp[key]=v;if(key==='opacity'){if(v<1)B.mp.transparent=true;else delete B.mp.transparent;}repaint();},min,max,step,fmt||(v=>Math.round(v*100)+'%'));
    const colRow=mk('label','sg-colrow','Colour ');const ci=mk('input');ci.type='color';ci.value=B.col;ci.addEventListener('input',()=>{B.col=ci.value;repaint();});colRow.appendChild(ci);box.appendChild(colRow);
    sl('Metal','metalness',0,1,.05,0);sl('Roughness','roughness',0,1,.05,.5);sl('Clear coat','clearcoat',0,1,.05,0);
    sl('Glass','transmission',0,1,.05,0);sl('Thickness','thickness',0,3,.1,.5,v=>(+v).toFixed(1));
    sl('Rainbow sheen','iridescence',0,1,.05,0);sl('Soft fuzz','sheen',0,1,.05,0);
    sl('Glow','ei',0,5,.1,0,v=>(+v).toFixed(1));
    const gl=chipRow(box,[['off','No glow'],['self','Glow in stroke colour'],['own','Own glow colour']],v=>(B.mp.emissive?(B.mp.emissive==='self'?'self':'own'):'off')===v,v=>{if(v==='off'){delete B.mp.emissive;B.mp.ei=0;}else if(v==='self'){B.mp.emissive='self';if(!B.mp.ei)B.mp.ei=1.5;}else{B.mp.emissive=B.mp.emissive&&B.mp.emissive!=='self'?B.mp.emissive:'#ff7a3a';if(!B.mp.ei)B.mp.ei=1.5;}repaint();});
    const ge=mk('label','sg-colrow','Glow colour ');const gi=mk('input');gi.type='color';gi.value=B.mp.emissive&&B.mp.emissive!=='self'?B.mp.emissive:'#ff7a3a';gi.addEventListener('input',()=>{B.mp.emissive=gi.value;if(!B.mp.ei)B.mp.ei=1.5;gl.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.v==='own'));repaint();});ge.appendChild(gi);box.appendChild(ge);
    const r=mk('div','sg-row');
    const save=mk('button','sg-wide pri','Save to my materials');save.type='button';
    save.addEventListener('click',()=>{const nm=(nameI.value||'').trim()||('Mine '+(umats.length+1));if(umats.length>=24){toast('You have 24 saved materials. Delete one first.');return;}const ex=umats.findIndex(u=>u.name===nm);const rec={id:'u'+Date.now().toString(36),name:nm,c:B.col,p:cleanMP(B.mp)||{}};if(ex>=0)umats[ex]=rec;else umats.push(rec);B.mpName=nm;saveU();hap(12);toast('Saved “'+nm+'”');matPanelRefresh();});
    const rnd=mk('button','sg-wide','Surprise me');rnd.type='button';
    rnd.addEventListener('click',()=>{const R=Math.random,p={metalness:R()<.55?R():0,roughness:R()*.8+.03};if(R()<.4)p.clearcoat=1;if(R()<.25)p.iridescence=1;if(R()<.2){p.transmission=.4+R()*.6;p.thickness=.4+R();}if(R()<.2){p.emissive='self';p.ei=1+R()*2.5;}B.mp=p;B.col=PALETTE[5+Math.floor(R()*9)];hap(10);matPanelRefresh();});
    r.append(rnd,save);box.appendChild(r);
    box.appendChild(note('Draw to try it. “Save” keeps it for next time; it is stored with each stroke, so shared files keep the look.'));
    repaint();
  }

  /* ---------- brush panel ---------- */
  function brushPanel(){
    head('Brush');
    const g=group('');
    sliderRow(g,'Size',()=>B.size,v=>{B.size=v;paintSize();},2,80,1,v=>Math.round(v)+' px');
    sliderRow(g,'Smoothing',()=>B.smooth,v=>{B.smooth=v;},0,.95,.05,v=>Math.round(v*100)+'%');
    sliderRow(g,'Taper',()=>B.taper,v=>{B.taper=v;},0,1,.05,v=>Math.round(v*100)+'%');
    sliderRow(g,'Depth from pressure',()=>B.depth,v=>{B.depth=v;},0,1,.05,v=>Math.round(v*100)+'%');
    chipRow(g,[['auto','Pen or speed'],['speed','Speed'],['even','Even']],v=>B.press===v,v=>{B.press=v;});
    chipRow(g,[['round','Round'],['flat','Flat ribbon']],v=>B.style===v,v=>{B.style=v;});
    const gs=group('Snap');
    chipRow(gs,[['ends','Line ends'],['lines','Along lines'],['grid','Grid'],['off','Off']],v=>B.snap===v,v=>{B.snap=v;const o=SG.target();if(o)o.meta.sigil.cand=null;});
    gs.appendChild(note('An orange ring shows what the line will join, so shapes connect exactly in 3D.'));
    const gy=group('Symmetry');
    chipRow(gy,[['0','Off'],['1','Mirror']],v=>String(+B.mirror)===v,v=>{B.mirror=v==='1';});
    chipRow(gy,[['1','No spin'],['3','3'],['4','4'],['6','6'],['8','8']],v=>String(B.rad)===v,v=>{B.rad=+v;});
  }
  /* ---------- layers ---------- */
  function layersPanel(){head('Layers');const g=group('');g.appendChild(SG.sLayers);SG.paintLayers();}
  /* ---------- more ---------- */
  function morePanel(){
    head('More');
    const g0=group('Draw on');
    chipRow(g0,[['view','Screen'],['surface','Surface'],['layer','Layer depth'],['floor','Floor'],['wall','Wall'],['photo','Photo']],v=>B.plane===v,v=>{B.plane=v;});
    sliderRow(g0,'Screen depth',()=>B.off,v=>{B.off=v;},-4,4,.05,v=>(+v).toFixed(2));
    const g1=group('Draw at a point');
    const pr=mk('div','sg-row');
    const pk=mk('button','sg-wide',B.pick?'Tap a spot…':'Pick a point');pk.type='button';pk.addEventListener('click',()=>{B.pick=!B.pick;canvas.style.cursor=B.pick?'cell':'crosshair';closePanel();toast(B.pick?'Tap the spot where the drawing plane should go.':'Cancelled.',2400);});
    const vc=mk('button','sg-wide','Use view centre');vc.type='button';vc.addEventListener('click',()=>{B.anchor=controls.target.toArray().map(v=>Math.round(v*1e4)/1e4);SG.markAnchor&&SG.markAnchor();toast('Drawing plane set to the view centre.',2000);});
    const cl=mk('button','sg-wide','Clear');cl.type='button';cl.addEventListener('click',()=>{B.anchor=null;B.pick=false;SG.markAnchor&&SG.markAnchor();});
    pr.append(pk,vc,cl);g1.appendChild(pr);
    const g2=group('Drawing');
    const r2=mk('div','sg-row');
    const nb=mk('button','sg-wide','New drawing');nb.type='button';nb.addEventListener('click',()=>{const o=SG.create();SG.cur=o.id;S.sel=o.id;toast('New drawing');closePanel();});
    const cb=mk('button','sg-wide','Clear drawing');cb.type='button';cb.addEventListener('click',()=>{const o=SG.target();if(o&&o.meta.sigil.strokes.length){SG.commit(o,[]);toast('Cleared. Undo brings it back.');}});
    r2.append(nb,cb);g2.appendChild(r2);
    const g3=group('Photo underlay');
    const ph=mk('button','sg-wide','Draw on a photo');ph.type='button';ph.addEventListener('click',()=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=()=>i.files[0]&&SG.addPhotoFile(i.files[0]);i.click();});g3.appendChild(ph);
    const g4=group('View');
    const r4=mk('div','sg-row');
    const sp=mk('button','sg-wide',spin?'Stop spinning':'Spin the drawing');sp.type='button';sp.addEventListener('click',()=>{spin=!spin;S.spin=spin;controls.autoRotate=spin;bump();sp.textContent=spin?'Stop spinning':'Spin the drawing';});
    const sv=mk('button','sg-wide pri','Save picture');sv.type='button';sv.addEventListener('click',()=>{closePanel();savePic();});
    r4.append(sp,sv);g4.appendChild(r4);
    const g5=group('Look');
    const lk=mk('button','sg-wide','Hardware look and effects');lk.type='button';lk.addEventListener('click',e=>{lookOpen(e.currentTarget);});g5.appendChild(lk);
    const g6=group('');const dice=mk('button','sg-wide','Surprise me (random material and brush)');dice.type='button';
    dice.addEventListener('click',()=>{const ks=Object.keys(MATS),k=ks[Math.floor(Math.random()*ks.length)];B.mat=k;B.mp=null;B.col=MATS[k][1];B.size=8+Math.floor(Math.random()*40);B.style=Math.random()<.2?'flat':'round';B.mirror=Math.random()<.25;hap(14);toast(MATS[k][0]+', '+B.size+' px');paintAll();});g6.appendChild(dice);
  }

  /* ---------- open / close ---------- */
  function open(){
    if(!root)build();
    isOn=true;document.body.dataset.sgs='1';root.hidden=false;
    setTab('draw');if(B.mode==='orbit')SG.setMode('draw');
    const o=SG.target();if(!o){const n=SG.create();SG.cur=n.id;}
    window.dispatchEvent(new Event('resize'));paintAll();
    const h=document.getElementById('sghint');if(h){h.hidden=!!lsGet(LSH,0);if(!h.hidden){setTimeout(()=>{h.hidden=true;lsSet(LSH,1);},5200);}}
    hap(10);
  }
  function close(){
    if(!isOn)return;isOn=false;delete document.body.dataset.sgs;if(root)root.hidden=true;closePanel();
    if(spin){spin=false;S.spin=false;controls.autoRotate=false;}
    window.dispatchEvent(new Event('resize'));
  }
  addEventListener('keydown',e=>{if(!isOn)return;if(e.key==='Escape'&&openP){closePanel();e.stopPropagation();}},true);
  return {open,close,isOn:()=>isOn,previewCSS};
}
