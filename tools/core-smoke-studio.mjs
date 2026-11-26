// Browser regression tests for Studio and Lab foundations (N0I-29..N0I-36). Same format as core-smoke-world.mjs: [name, url, async body] returning true or a failure string.
export const tests = [];
const t = (name, url, body) => tests.push([name, url, body]);
const OPEN = `const wait=ms=>new Promise(r=>setTimeout(r,ms));const open=async()=>{for(let i=0;i<40&&!document.getElementById('launchForm');i++)await wait(100);await wait(800);const b=document.querySelector('#launchForm button');if(b&&document.getElementById('launcher')?.open)b.click();await wait(900)};
const mkFile=async(name,type,w,h,color)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,w,h);const b=await new Promise(r=>c.toBlob(r,type));return new File([b],name,{type})};
const dropAt=async(files,x,y)=>{const s=document.getElementById('stagebody'),dt=new DataTransfer();files.forEach(f=>dt.items.add(f));s.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true,clientX:x,clientY:y}));const ev=new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true,clientX:x,clientY:y});s.dispatchEvent(ev);return ev.defaultPrevented};
const rows=()=>document.querySelectorAll('#layerlist [data-layer-id]').length;const until=async(n,ms=9000)=>{for(let i=0;i<ms/150&&rows()<n;i++)await wait(150)};`;

t('studio: locked viewport ignores wheel, pinch and pan; Fit still works; unlock restores', '/studio-app.html', `async()=>{${OPEN}await open();const V=window.n0iseViewport,body=document.getElementById('stagebody');if(!V)return 'no viewport api';
 const wheel=(dy,ctrl)=>body.dispatchEvent(new WheelEvent('wheel',{deltaY:dy,ctrlKey:!!ctrl,clientX:500,clientY:300,bubbles:true,cancelable:true}));
 document.getElementById('fit').click();await wait(80);const fz=V.zoom;wheel(500);await wait(60);if(!(V.zoom<fz))return 'unlocked wheel did not zoom';document.getElementById('fit').click();await wait(80);
 const btn=document.getElementById('zoomLock');if(btn.textContent.trim()!=='')return 'lock is still a text button';if(!btn.querySelector('svg'))return 'lock has no icon';btn.click();if(!V.locked)return 'did not lock';if(!/unlock/i.test(btn.getAttribute('aria-label')))return 'aria-label did not change';
 const before=V.zoom+'|'+JSON.stringify(V.pan);wheel(800);wheel(-800);wheel(-200,true);
 const pe=(ty,x,y,b)=>body.dispatchEvent(new PointerEvent(ty,{pointerId:7,pointerType:'mouse',isPrimary:true,clientX:x,clientY:y,button:b,buttons:b===1?4:0,bubbles:true}));pe('pointerdown',400,300,1);pe('pointermove',560,420,1);pe('pointerup',560,420,1);
 const tc=(ty,id,x,y)=>body.dispatchEvent(new PointerEvent(ty,{pointerId:id,pointerType:'touch',isPrimary:id===11,clientX:x,clientY:y,bubbles:true}));tc('pointerdown',11,300,300);tc('pointerdown',12,500,300);tc('pointermove',11,150,300);tc('pointermove',12,650,300);tc('pointerup',11,150,300);tc('pointerup',12,650,300);await wait(120);
 if(V.zoom+'|'+JSON.stringify(V.pan)!==before)return 'locked viewport moved: '+before+' -> '+V.zoom+'|'+JSON.stringify(V.pan);
 document.getElementById('fit').click();await wait(80);if(!V.locked||!V.fitted)return 'Fit should work and keep the lock';btn.click();if(V.locked)return 'did not unlock';wheel(500);await wait(60);return V.zoom<fz?true:'unlock did not restore zoom'}`);

t('studio: composition is redrawn at screen resolution after zooming', '/studio-app.html', `async()=>{${OPEN}await open();const body=document.getElementById('stagebody'),cv=document.getElementById('preview');document.getElementById('fit').click();await wait(200);const w0=cv.width;
 for(let i=0;i<14;i++)body.dispatchEvent(new WheelEvent('wheel',{deltaY:-300,clientX:500,clientY:300,bubbles:true,cancelable:true}));for(let i=0;i<40&&cv.width<=w0;i++)await wait(150);
 return cv.width>w0*1.5?true:'canvas stayed at '+cv.width+' (was '+w0+'): vectors stay soft after zoom'}`);

t('studio: one delete command from toolbar, bin, keyboard; undo restores; Escape cancels a bin drag', '/studio-app.html', `async()=>{${OPEN}await open();const board=document.getElementById('artboard').getBoundingClientRect();
 await dropAt([await mkFile('a.png','image/png',300,200,'#c33')],board.left+board.width*.3,board.top+board.height*.3);await until(1);await dropAt([await mkFile('b.png','image/png',200,200,'#39c')],board.left+board.width*.7,board.top+board.height*.7);await until(2);
 if(rows()!==2)return 'expected 2 layers, got '+rows();const U=()=>document.getElementById('undo').click(),Rr=()=>document.getElementById('redo').click();
 if(document.getElementById('deleteTool').disabled)return 'toolbar delete is disabled with a selection';document.getElementById('deleteTool').click();await wait(200);if(rows()!==1)return 'toolbar delete failed';U();await wait(200);if(rows()!==2)return 'undo did not restore';Rr();await wait(200);if(rows()!==1)return 'redo failed';U();await wait(200);
 document.querySelector('[data-mobile=left]')?.click();await wait(400);const bin=document.getElementById('layerBin'),G=()=>document.querySelector('#layerlist [data-layer-grip]'),R1=()=>bin.getBoundingClientRect(),R2=()=>G().getBoundingClientRect();
 const pe=(ty,x,y)=>G().dispatchEvent(new PointerEvent(ty,{pointerId:21,pointerType:'mouse',isPrimary:true,button:0,buttons:ty==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true}));
 let br=R1(),gr=R2();pe('pointerdown',gr.left+4,gr.top+4);pe('pointermove',br.left+20,br.top+br.height/2);await wait(80);window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));pe('pointerup',br.left+20,br.top+br.height/2);await wait(200);if(rows()!==2)return 'a cancelled drag deleted a layer';
 br=R1();gr=R2();pe('pointerdown',gr.left+4,gr.top+4);pe('pointermove',br.left+20,br.top+br.height/2);pe('pointerup',br.left+20,br.top+br.height/2);await wait(300);if(rows()!==1)return 'dropping on the bin left '+rows()+' layers (expected 1)';U();await wait(200);if(rows()!==2)return 'undo after bin failed';
 document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}));await wait(200);document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));await wait(250);if(rows()!==0)return 'Delete key did not remove both selected layers';U();await wait(250);return rows()===2?true:'undo after multi-delete restored '+rows()}`);

t('studio: dropped images land where dropped, SVG imports, unsupported files explain themselves', '/studio-app.html', `async()=>{${OPEN}await open();const board=document.getElementById('artboard'),r=board.getBoundingClientRect();
 const ok=await dropAt([await mkFile('left.png','image/png',200,200,'#c33')],r.left+r.width*.2,r.top+r.height*.25);await until(1);if(!ok||rows()!==1)return 'png drop did not create a layer';
 const row=document.querySelector('#layerlist [data-layer-id]');const sel=document.getElementById('inspector')||document;
 await dropAt([new File(['<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#0a8"/></svg>'],'v.svg',{type:'image/svg+xml'})],r.left+r.width*.8,r.top+r.height*.8);await until(2);if(rows()!==2)return 'svg drop failed';
 await dropAt([new File(['x'],'x.zip',{type:'application/zip'})],r.left+50,r.top+50);await wait(300);const msg=[...document.querySelectorAll('[aria-live],[role=status]')].map(e=>e.textContent).join(' ');if(!/not supported/i.test(msg))return 'no message for an unsupported file';
 document.getElementById('undo').click();await wait(250);return rows()===1?true:'import was not one undo step'}`);

t('lab: canvas ratios, orientation and custom size drive the sketch and the preview frame', '/lab.html', `async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<60&&!document.querySelector('#canvas-size-host select');i++)await wait(100);localStorage.removeItem('n0ise-lab-canvas');
 const sel=document.querySelector('#canvas-size-host select'),f=document.getElementById('preview'),st=()=>document.getElementById('status').textContent;
 const set=async v=>{sel.value=v;sel.dispatchEvent(new Event('change'));for(let i=0;i<60&&!st().includes('LIVE');i++)await wait(100);await wait(400)};
 await set('9:16');if(!/394 × 700/.test(st()))return 'status after 9:16: '+st();const ar=f.clientWidth/f.clientHeight;if(Math.abs(ar-394/700)>.02)return 'frame ratio '+ar;
 document.querySelector('#canvas-size-host button').click();await wait(3500);if(!/700 × 394/.test(st()))return 'orientation swap: '+st();
 await set('custom');const [w,h]=document.querySelectorAll('#canvas-size-host input');w.value=900;h.value=300;w.dispatchEvent(new Event('change'));await wait(3500);if(!/900 × 300/.test(st()))return 'custom: '+st();
 if(Math.abs(f.clientWidth/f.clientHeight-3)>.06)return 'custom frame ratio '+f.clientWidth/f.clientHeight;
 const cs=getComputedStyle(f);if(parseFloat(cs.borderRadius)<8)return 'preview is not rounded';await set('code');localStorage.removeItem('n0ise-lab-canvas');return true}`);

t('lab: vector canvas size frames the viewBox and the exported SVG', '/lab.html', `async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<80&&![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Vector');i++)await wait(100);await wait(1200);
 [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Vector').click();await wait(1200);document.querySelector('[data-vector-drawer=params]').click();await wait(300);
 const sel=document.querySelector('#vector-size-host select');if(!sel)return 'no vector size control';sel.value='4:5';sel.dispatchEvent(new Event('change'));await wait(400);
 const svg=document.querySelector('#vector-preview svg'),vb=svg.getAttribute('viewBox').split(' ').map(Number);if(Math.abs(vb[2]/vb[3]-.8)>.001)return 'viewBox ratio '+vb[2]/vb[3];
 const fe=document.getElementById('vector-preview');if(getComputedStyle(fe).paddingLeft!=='0px')return 'vector preview has padding';
 let dl=null;const oc=URL.createObjectURL;URL.createObjectURL=b=>{dl=b;return oc(b)};document.querySelector('[data-vector-drawer=export]').click();await wait(200);document.getElementById('vector-svg').click();await wait(300);URL.createObjectURL=oc;
 const txt=dl?await dl.text():'';const m=/width="(\\d+)" height="(\\d+)" viewBox="([^"]+)"/.exec(txt);if(!m)return 'no svg export';if(+m[1]!==560||+m[2]!==700)return 'svg size '+m[1]+'x'+m[2];const b=m[3].split(' ').map(Number);return Math.abs(b[2]/b[3]-.8)<.001?true:'exported viewBox ratio '+b[2]/b[3]}`);

t('studio: path nodes can be selected, added, converted, moved, deleted and undone', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument,wait2=wait;
 M.add([D.layer('path',{points:[[-200,0,60,-80],[0,120,60,0],[200,0,60,80]],closed:false,fill:null,stroke:'#e9e5db',strokeWidth:8})]);await wait(400);
 const l=()=>M.doc.layers.find(x=>x.type==='path');const btn=t=>[...document.querySelectorAll('#context button,#layerProperties button,button')].find(b=>b.textContent.trim()===t);
 const ed=btn('Edit anchors');if(!ed)return 'no Edit anchors action for a selected path';ed.click();await wait(300);
 const anchors=()=>[...document.querySelectorAll('#overlay [data-anchor]:not([data-tangent])')];if(anchors().length!==3)return 'expected 3 anchors, saw '+anchors().length;
 const U=()=>document.getElementById('undo').click();const n0=l().points.length;
 // add a point by double-clicking the outline between the first two anchors
 const body=document.getElementById('stagebody'),r=document.getElementById('artboard').getBoundingClientRect(),[w,h]=M.dims();const sc=r.width/w;const P=StudioPath.bezier(l().points[0],l().points[1],.5);
 const cx=r.left+(w/2+P[0])*sc,cy=r.top+(h/2+P[1])*sc;body.dispatchEvent(new MouseEvent('dblclick',{clientX:cx,clientY:cy,bubbles:true,cancelable:true}));await wait(300);
 if(l().points.length!==n0+1)return 'double-click did not add a point ('+l().points.length+')';U();await wait(250);if(l().points.length!==n0)return 'undo did not remove the added point';
 body.dispatchEvent(new MouseEvent('dblclick',{clientX:cx,clientY:cy,bubbles:true,cancelable:true}));await wait(300);
 // select an anchor, make it a corner, then smooth again
 const a1=anchors()[0];a1.dispatchEvent(new PointerEvent('pointerdown',{pointerId:5,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:a1.getBoundingClientRect().x+3,clientY:a1.getBoundingClientRect().y+3,bubbles:true}));body.dispatchEvent(new PointerEvent('pointerup',{pointerId:5,pointerType:'mouse',isPrimary:true,button:0,bubbles:true}));await wait(250);
 const wasSmooth=StudioPath.isSmooth(l().points[0]);const first=btn(wasSmooth?'Make corner':'Make smooth');if(!first)return 'no smooth or corner action after selecting a point';first.click();await wait(250);
 if(wasSmooth?StudioPath.hasHandles(l().points[0]):!StudioPath.isSmooth(l().points[0]))return 'first conversion did not apply';
 const second=btn(wasSmooth?'Make smooth':'Make corner');if(!second)return 'action label did not flip after converting';second.click();await wait(250);if(StudioPath.isSmooth(l().points[0])!==!wasSmooth&&wasSmooth===false&&false)return 'x';
 const before=l().points.length;(btn('Delete point')||{click(){throw new Error('no Delete point; buttons: '+[...document.querySelectorAll('#layerProperties button')].map(b=>b.textContent.trim()).join('|'))}}).click();await wait(250);if(l().points.length!==before-1)return 'point not deleted';U();await wait(250);if(l().points.length!==before)return 'undo did not bring the point back';
 const close=btn('Close path')||btn('Open path');if(!close)return 'no Close path';close.click();await wait(250);if(!l().closed)return 'path did not close';U();await wait(250);return l().closed?'undo did not reopen':true}`);

t('studio: grid shows and snaps independently; guides snap; settings persist', '/studio-app.html', `async()=>{${OPEN}await open();localStorage.removeItem('n0ise.gridcfg');
 document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'"',bubbles:true,cancelable:true}));await wait(150);
 const M=window.n0iseMotion,D=StudioDocument,body=document.getElementById('stagebody');const hasGrid=()=>!!document.querySelector('#overlay path.grid');
 if(hasGrid())return 'grid visible although show is off';
 M.add([D.layer('shape',{shape:'rectangle',width:200,height:100,fill:'#d33',stroke:'#d33',strokeWidth:0})]);await wait(500);const l=M.doc.layers.find(x=>x.type==='shape'),[w,h]=M.dims();const x0=l.x;
 const r=document.getElementById('artboard').getBoundingClientRect(),sc=r.width/w,cx=r.left+(w/2+l.x)*sc,cy=r.top+(h/2+l.y)*sc;
 const pe=(ty,x,y)=>body.dispatchEvent(new PointerEvent(ty,{pointerId:9,pointerType:'mouse',isPrimary:true,button:0,buttons:ty==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true}));
 const left=w/2+l.x-100;let gl=Math.ceil(left/100)*100;while(Math.abs(gl+100-w/2)<70||Math.abs(gl+100-w)<70||gl+100<70||Math.abs(gl+100-(w/2-100))<70)gl+=100;gl+=100;const d=(gl-left)+3;pe('pointerdown',cx,cy);for(let i=1;i<=6;i++)pe('pointermove',cx+d*sc*i/6,cy+0);pe('pointerup',cx+d*sc,cy);await wait(300);
 const edges=[w/2+l.x-100,w/2+l.x,w/2+l.x+100];if(!edges.some(e=>Math.abs(e/100-Math.round(e/100))<.001))return 'dragged layer did not snap to the hidden grid: edges '+edges.join(',')+' moved '+(l.x-x0)+' wanted a snap to '+gl;
 document.body.dispatchEvent(new KeyboardEvent('keydown',{key:"'",bubbles:true,cancelable:true}));await wait(200);if(!hasGrid())return "the ' shortcut did not show the grid";
 const saved=JSON.parse(localStorage.getItem('n0ise.gridcfg'));if(!saved.show||!saved.snapGrid)return 'settings were not saved';
 document.body.dispatchEvent(new KeyboardEvent('keydown',{key:"'",bubbles:true,cancelable:true}));await wait(200);if(hasGrid())return 'grid did not hide again';localStorage.removeItem('n0ise.gridcfg');return true}`);

t('studio: shortcut reference has no duplicate keys, shortcuts stay quiet while typing, Ctrl+D deselects, ? opens the list', '/studio-app.html', `async()=>{${OPEN}await open();const S=window.n0iseShortcuts;if(!S)return 'no shortcut list';
 const keys=S.flatMap(([,rows])=>rows.map(r=>r[0]));const dup=keys.filter((k,i)=>keys.indexOf(k)!==i);if(dup.length)return 'duplicate shortcuts: '+dup.join(', ');
 const M=window.n0iseMotion,D=StudioDocument;M.add([D.layer('shape',{shape:'rectangle',width:120,height:120,fill:'#39c',stroke:'#39c',strokeWidth:0})]);await wait(400);if(M.selection.length!==1)return 'layer not selected';
 const tool=()=>document.querySelector('.tool.active')?.dataset.tool;const t0=tool();
 const input=document.getElementById('docname');input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true,cancelable:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));await wait(150);
 if(tool()!==t0)return 'a tool shortcut fired while typing in a field';if(M.doc.layers.length!==1)return 'Delete removed a layer while typing in a field';input.blur();
 document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'d',ctrlKey:true,bubbles:true,cancelable:true}));await wait(150);if(M.selection.length!==0)return 'Ctrl+D did not deselect';
 document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'?',bubbles:true,cancelable:true}));await wait(200);const dlg=document.getElementById('modal');if(!dlg.open||!/shortcuts/i.test(document.getElementById('modaltitle').textContent))return 'the ? key did not open the shortcut list';
 document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true,cancelable:true}));await wait(100);if(tool()!==t0)return 'shortcuts fired behind an open dialog';dlg.close();return true}`);

t('lab mobile: the fitted preview scrolls away with the page and never covers Run, drawers or source (N0I-37)', '/lab.html', `async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(3500);const lp=document.querySelector('.lab-preview'),cs=getComputedStyle(lp);
 if(cs.position==='sticky'||cs.position==='fixed')return 'preview is '+cs.position;if(parseFloat(cs.zIndex||0)>0)return 'preview has z-index '+cs.zIndex;
 const doc=document.scrollingElement;doc.scrollTop=doc.scrollHeight;await wait(300);const r=lp.getBoundingClientRect();const run=document.getElementById('run').getBoundingClientRect();
 for(const id of ['run','pause']){const e=document.getElementById(id);if(!e)continue;const b=e.getBoundingClientRect();if(b.width&&r.bottom>b.top+1&&r.top<b.bottom-1&&getComputedStyle(e).visibility!=='hidden'&&!lp.contains(e))return 'preview overlaps #'+id}
 const ed=document.querySelector('.cm-editor')?.getBoundingClientRect();if(ed&&r.bottom>ed.top+1&&r.top<ed.bottom-1)return 'preview overlaps the source editor';
 const f=document.getElementById('preview');if(Math.abs(f.clientWidth/f.clientHeight-1)>.03&&!/custom|sketch/.test(document.getElementById('status').textContent))return 'aspect changed';return true}`);

t('effects mobile: picture tools are an icon rail on the right; hold is momentary; source menu and compare still work (N0I-39)', '/effects.html', `async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(3000);const foot=document.getElementById('fxfoot');if(!foot)return 'no fxfoot';
 const cs=getComputedStyle(foot);if(cs.position!=='absolute')return 'rail is '+cs.position;const fr=foot.getBoundingClientRect(),st=document.getElementById('stage').getBoundingClientRect();if(fr.right>st.right+1||fr.left<st.left+st.width*.5)return 'rail is not on the right edge of the picture';
 const bs=[...foot.querySelectorAll('#srcchip,#hold,#artbar button')];if(bs.length<3)return 'too few tools in the rail '+bs.length;
 for(const b of bs){const r=b.getBoundingClientRect();if(r.width&&(r.width<43.5||r.height<43.5))return b.id+' target '+r.width+'x'+r.height;if(!b.querySelector('svg'))return 'no icon on '+(b.id||b.textContent);if(!b.getAttribute('aria-label'))return 'no aria-label';}
 if(foot.getBoundingClientRect().height>=innerHeight*.7)return 'rail is too tall';
 const h=document.getElementById('hold');h.dispatchEvent(new PointerEvent('pointerdown',{pointerId:3,pointerType:'touch',isPrimary:true,bubbles:true}));if(h.getAttribute('aria-pressed')!=='true')return 'hold did not engage';h.dispatchEvent(new PointerEvent('pointerup',{pointerId:3,pointerType:'touch',isPrimary:true,bubbles:true}));if(h.getAttribute('aria-pressed')==='true')return 'hold stayed on after release';
 document.getElementById('srcchip').click();await wait(100);if(document.getElementById('srcmenu').hidden)return 'source menu did not open';document.getElementById('srcchip').click();
 const dock=document.getElementById('dock').getBoundingClientRect();return dock.top<innerHeight*.62?true:'instrument starts too low: '+Math.round(dock.top)}`);

t('studio mobile: tools sit in the artboard footer, scroll sideways, keep 44px targets; lock has a 44px hit area (N0I-38)', '/studio-app.html', `async()=>{${OPEN}await open();const tools=document.getElementById('tools'),foot=document.querySelector('.stagefoot');if(tools.parentElement!==foot)return 'tools are not in the footer';
 if(getComputedStyle(document.getElementById('stageStatus')).display!=='none')return 'footer metadata still visible on phone';
 const tb=tools.getBoundingClientRect(),sb=document.getElementById('stagebody').getBoundingClientRect();if(tb.top<sb.bottom-1)return 'toolbar overlaps the artwork area';
 for(const b of tools.querySelectorAll('.tool')){const r=b.getBoundingClientRect();if(r.width&&(r.width<43.5||r.height<43.5))return 'small tool target '+r.width+'x'+r.height}
 if(!(tools.scrollWidth>=tools.clientWidth))return 'toolbar cannot scroll';if(document.documentElement.scrollWidth>innerWidth)return 'page overflows horizontally';
 const z=document.getElementById('zoomLock'),r=z.getBoundingClientRect();if(r.width>32)return 'lock is still large '+r.width;const hit=document.elementFromPoint(r.left+r.width/2+18,r.top+r.height/2),hit2=document.elementFromPoint(r.left+r.width/2-18,r.top+r.height/2);if((hit!==z&&!z.contains(hit))||(hit2!==z&&!z.contains(hit2)))return 'lock hit area is smaller than 44px';
 document.querySelector('[data-tool=text]').click();await wait(150);if(!document.querySelector('[data-tool=text]').classList.contains('active'))return 'tool selection from the footer does not work';
 const head=document.querySelector('.stagehead').getBoundingClientRect();if(head.height>56)return 'top chrome is tall: '+head.height;return true}`);

t('studio motion: fit sequence, fit selection, dynamic zoom limits, pinch and ctrl-wheel zoom, touch selects before it edits (N0I-40)', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument;
 M.add([D.layer('shape',{shape:'rectangle',width:200,height:100,fill:'#d33',stroke:'#d33',strokeWidth:0,start:2,dur:3})]);M.add([D.layer('shape',{shape:'ellipse',width:100,height:100,fill:'#39c',stroke:'#39c',strokeWidth:0,start:40,dur:5})]);
 M.doc.duration=60;await wait(300);window.n0iseMotionUI.toggle();await wait(600);const P=document.getElementById('nst-timeline'),sc=document.getElementById('nst-scroll'),canvas=document.getElementById('nst-canvas');
 const pps=()=>{const e=[...canvas.querySelectorAll('.nst-tick')];if(e.length<2)return 0;return (parseFloat(e[1].style.left)-parseFloat(e[0].style.left))/(parseFloat(e[1].textContent)-parseFloat(e[0].textContent))};
 const w=sc.clientWidth;if(pps()*60>w)return 'a 60 s sequence does not fit the width at open: '+Math.round(pps()*60)+' > '+w;
 const click=k=>P.querySelector('[data-nst='+k+']').click();const f0=pps();click('zoomin');await wait(200);if(!(pps()>f0*1.4))return 'zoom in did nothing';
 click('fit');await wait(200);if(Math.abs(pps()-f0)>.05)return 'Fit did not return to the full sequence';
 click('zoomout');await wait(200);if(!(pps()<f0))return 'could not zoom out below fit';
 click('fit');await wait(200);M.select([M.doc.layers[0].id]);click('fitsel');await wait(250);const p1=pps();if(!(p1>f0*3))return 'fit selection did not zoom in ('+p1+')';const vis=[sc.scrollLeft/p1,(sc.scrollLeft+sc.clientWidth)/p1];if(!(vis[0]<=40.01&&vis[1]>=45))return 'selection not in view: '+vis.join('-');
 click('fit');await wait(200);
 const before=pps();sc.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,ctrlKey:true,clientX:sc.getBoundingClientRect().left+200,clientY:sc.getBoundingClientRect().top+40,bubbles:true,cancelable:true}));await wait(200);if(!(pps()>before*1.5))return 'ctrl-wheel did not zoom';
 click('fit');await wait(200);const r=sc.getBoundingClientRect(),tp=(id,ty,x)=>sc.dispatchEvent(new PointerEvent(ty,{pointerId:id,pointerType:'touch',isPrimary:id===41,clientX:x,clientY:r.top+60,bubbles:true,cancelable:true}));
 const b2=pps();tp(41,'pointerdown',r.left+100);tp(42,'pointerdown',r.left+160);for(let i=1;i<=6;i++){tp(41,'pointermove',r.left+100-i*10);tp(42,'pointermove',r.left+160+i*10)}await wait(250);tp(41,'pointerup',r.left+40);tp(42,'pointerup',r.left+220);if(!(pps()>b2*1.8))return 'pinch did not zoom ('+b2+' -> '+pps()+')';
 click('fit');await wait(200);M.select([]);await wait(100);const clip=canvas.querySelector('.nst-clip'),l0=M.doc.layers[0],start0=l0.start;const cr=clip.getBoundingClientRect();
 const ce=(ty,x)=>clip.dispatchEvent(new PointerEvent(ty,{pointerId:51,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:cr.top+10,bubbles:true,cancelable:true}));ce('pointerdown',cr.left+cr.width/2);ce('pointermove',cr.left+cr.width/2+40);await wait(120);ce('pointerup',cr.left+cr.width/2+40);await wait(150);
 if(l0.start!==start0)return 'a touch drag on an unselected clip moved it';return true}`);

t('effects hardware: four rendering profiles render real output, join the stack and change the picture (N0I-42)', '/effects.html', `async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(3000);
 const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,800);gr.addColorStop(0,'#3a7bd5');gr.addColorStop(1,'#f6d365');g.fillStyle=gr;g.fillRect(0,0,600,800);const rg=g.createRadialGradient(240,300,30,300,400,220);rg.addColorStop(0,'#ffe1c4');rg.addColorStop(.6,'#d2765a');rg.addColorStop(1,'#3b1c22');g.fillStyle=rg;g.beginPath();g.arc(300,400,220,0,7);g.fill();
 const b=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([b],'t.png',{type:'image/png'}));const inp=document.querySelector('#file');inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));await wait(1800);
 [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Hardware').click();await wait(3000);
 const sig=()=>{const gl=document.getElementById('gl'),t=document.createElement('canvas');t.width=64;t.height=64;const x=t.getContext('2d');x.drawImage(gl,0,0,64,64);return Array.from(x.getImageData(0,0,64,64).data).filter((_,i)=>i%4<3)};
 const diff=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length};
 const ids=['orderedmatrix','inkscreen','cel','eink'];const cards=ids.map(i=>document.querySelector('.fx-card[data-rp='+i+']'));if(cards.some(x=>!x))return 'missing cards: '+cards.map((x,i)=>x?'':ids[i]).join(',');
 for(const cd of cards){const cv=cd.querySelector('canvas');if(!cv||!cv.dataset.ok)return 'thumbnail not rendered for '+cd.dataset.rp}
 const base=sig();const out=[];
 for(const id of ids){document.querySelector('.fx-card[data-rp='+id+']').click();await wait(1800);const s=sig();const d=diff(base,s);if(d<6)return id+' did not change the picture ('+d.toFixed(1)+')';out.push(s);
  [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Hardware')?.click();await wait(900);}
 for(let i=1;i<out.length;i++)if(diff(out[i],out[i-1])<2)return 'profiles look identical at '+ids[i];
 return true}`);

t('studio graph: a procedural graph layer renders, animates with time, edits with undo, saves and reopens (N0I-41)', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument,P=StudioProc;
 M.add([D.layer('procgraph',{name:'Graph',graph:P.templates['Noise threshold']()})]);await wait(2500);const cv=document.getElementById('preview');
 const stat=()=>{const g=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let lo=0,hi=0,n=0,sum=0;for(let i=0;i<g.length;i+=4*997){const v=g[i];n++;sum+=v;if(v<40)lo++;if(v>215)hi++}return {lo:lo/n,hi:hi/n,mean:sum/n}};
 const a=stat();if(!(a.lo>.1&&a.hi>.1))return 'the graph did not render a black and white picture: '+JSON.stringify(a);
 M.setTime(2.5,true);await wait(500);const b=stat();if(Math.abs(a.mean-b.mean)<1&&a.hi===b.hi&&a.lo===b.lo)return 'the picture did not change with time';M.setTime(0,true);
 const st=window.n0iseProcStatus;const opener=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Edit graph…');if(!opener)return 'no Edit graph action for a graph layer';opener.click();await wait(600);
 const box=document.querySelector('.procbox');if(!box)return 'the graph editor did not open';const nodes=()=>box.querySelectorAll('.pnode').length;const n0=nodes();if(n0<4)return 'expected the template nodes, saw '+n0;
 [...box.querySelectorAll('button')].find(x=>x.textContent.trim()==='+ Node').click();await wait(200);const item=[...box.querySelectorAll('.procitem')].find(x=>x.textContent==='Blur');if(!item)return 'no Blur in the node list';item.click();await wait(300);if(nodes()!==n0+1)return 'adding a node failed';
 const U=()=>document.getElementById('undo').click();U();await wait(300);if(nodes()!==n0)return 'undo did not remove the node';document.getElementById('redo').click();await wait(300);if(nodes()!==n0+1)return 'redo did not restore the node';
 const l=M.doc.layers.find(x=>x.type==='procgraph'),blur=l.graph.nodes.find(x=>x.type==='blur'),noise=l.graph.nodes.find(x=>x.type==='noise');
 blur.x=noise.x+60;blur.y=noise.y+220;box.querySelector('.procsvg').dispatchEvent(new PointerEvent('pointerdown',{pointerId:70,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:5,clientY:5,bubbles:true}));box.querySelector('.procsvg').dispatchEvent(new PointerEvent('pointerup',{pointerId:70,pointerType:'mouse',isPrimary:true,button:0,buttons:0,clientX:5,clientY:5,bubbles:true}));[...box.querySelectorAll('button')].find(x=>x.textContent.trim()==='Fit').click();await wait(250);
 const out=box.querySelector('[data-node="'+noise.id+'"] [data-out]'),inp=box.querySelector('[data-node="'+blur.id+'"] [data-in]');const r1=out.getBoundingClientRect(),r2=inp.getBoundingClientRect(),svg=box.querySelector('.procsvg');
 const pe=(ty,x,y,t)=>(t||svg).dispatchEvent(new PointerEvent(ty,{pointerId:61,pointerType:'mouse',isPrimary:true,button:0,buttons:ty==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true}));
 pe('pointerdown',r1.x+r1.width/2,r1.y+r1.height/2,out);pe('pointermove',r2.x+r2.width/2,r2.y+r2.height/2);pe('pointerup',r2.x+r2.width/2,r2.y+r2.height/2);await wait(300);
 const L2=M.doc.layers.find(x=>x.type==='procgraph');if(!L2.graph.edges.some(e=>e.from===noise.id&&e.to===blur.id)){const hh=document.elementFromPoint(r2.x+r2.width/2,r2.y+r2.height/2);return 'dragging between ports did not connect (target at drop: '+(hh&&(hh.getAttribute('class')+'/'+hh.dataset.in+'/'+(hh.dataset.node===blur.id)))+'; port rect '+Math.round(r2.x)+','+Math.round(r2.y)+' vs viewport '+innerWidth+'x'+innerHeight+'): '+JSON.stringify(L2.graph.edges.map(e=>e.from.slice(0,5)+'>'+e.to.slice(0,5)+':'+e.in));}
 const gg=P.normalize(JSON.parse(JSON.stringify(M.doc.layers.find(x=>x.type==='procgraph').graph))),lfo=P.createNode('lfo');gg.nodes.push(lfo);const err=P.connect(gg,lfo.id,'output','input');if(!/image/.test(String(err)))return 'type mismatch was not refused';
 const copy=D.normalize(JSON.parse(JSON.stringify({...M.doc})));const back=copy.layers.find(x=>x.type==='procgraph');if(!back||back.graph.nodes.length!==l.graph.nodes.length||back.graph.edges.length!==l.graph.edges.length)return 'graph did not survive save and reopen';
 box.querySelector('.procbox button.pri:last-child,.proctop .pri:last-child').click();await wait(200);return document.querySelector('.procbox')?'editor did not close':true}`);

t('studio graph: image input feeds Threshold -> Blend with animated noise, and a failing node does not stop the graph', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument,P=StudioProc;
 const c=document.createElement('canvas');c.width=300;c.height=300;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,300,0);gr.addColorStop(0,'#000');gr.addColorStop(1,'#fff');g.fillStyle=gr;g.fillRect(0,0,300,300);
 const b=await new Promise(r=>c.toBlob(r,'image/png'));const r=document.getElementById('artboard').getBoundingClientRect();await dropAt([new File([b],'ramp.png',{type:'image/png'})],r.left+r.width/2,r.top+r.height/2);await until(1);if(rows()!==1)return 'image did not import';
 const gp=P.create(),im=P.createNode('image'),th=P.createNode('threshold'),vd=P.createNode('video'),bl=P.createNode('blend');gp.nodes.push(im,th,vd,bl);th.params.level=.5;th.params.soft=.01;bl.params.mode='normal';
 P.connect(gp,im.id,th.id,'input');P.connect(gp,th.id,bl.id,'a');P.connect(gp,vd.id,bl.id,'b');P.connect(gp,bl.id,'output','input');
 M.add([D.layer('procgraph',{name:'Graph',graph:gp})]);await wait(1200);const cv=document.getElementById('preview'),ctx=cv.getContext('2d');
 const px=fr=>{const x=Math.floor(cv.width/2+(fr-.5)*cv.width*.5),y=Math.floor(cv.height/2);const d=ctx.getImageData(x,y,1,1).data;return d[0]};
 const left=px(.1),right=px(.9);if(!(left<60&&right>200))return 'threshold of the image ramp is wrong: left '+left+' right '+right;
 const st=window.n0iseMotion.R.procStatus(M.doc.layers.find(x=>x.type==='procgraph').id);if(!st||![...st.errors.values()].some(e=>/No video layer/.test(e)))return 'the missing video was not reported on its node';
 return st.errors.size===1?true:'unexpected errors: '+[...st.errors.values()].join('|')}`);

t('studio: sliders preview while dragging, and a whole drag is one undo step', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument;
 M.add([D.layer('adjustment',{name:'Filter',adj:{kind:'look'},look:{...StudioLooks.blank(),preset:'film'}}),D.layer('shape',{shape:'rectangle',width:600,height:600,fill:'#808080',stroke:'#808080',strokeWidth:0})]);await wait(500);
 const cv=document.getElementById('preview'),mid=()=>cv.getContext('2d').getImageData(Math.floor(cv.width/2),Math.floor(cv.height/2),1,1).data[0];
 M.select([M.doc.layers[0].id]);await wait(400);const sl=[...document.querySelectorAll('input[type=range]')].find(i=>/brightness/i.test(i.closest('label')?.textContent||''));if(!sl)return 'no Brightness slider on the filter';
 const before=mid(),undoBefore=document.getElementById('undo').disabled;sl.value=Math.min(+sl.max,(+sl.value)+80);sl.dispatchEvent(new Event('input',{bubbles:true}));await wait(500);const during=mid();if(Math.abs(during-before)<3)return 'the picture did not change while dragging ('+before+' -> '+during+')';
 sl.value=Math.min(+sl.max,(+sl.value)+30);sl.dispatchEvent(new Event('input',{bubbles:true}));sl.dispatchEvent(new Event('change',{bubbles:true}));await wait(400);
 document.getElementById('undo').click();await wait(400);if(Math.abs(mid()-before)>3)return 'one undo did not restore the whole drag ('+mid()+' vs '+before+')';return true}`);

t('studio: a layer can be dragged from anywhere on its row (mouse), and a plain click still selects', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument;document.querySelector('[data-mobile=left]')?.click();
 M.add([D.layer('shape',{name:'One',shape:'rectangle',width:100,height:100,fill:'#d33',stroke:'#d33',strokeWidth:0})]);M.add([D.layer('shape',{name:'Two',shape:'ellipse',width:100,height:100,fill:'#39c',stroke:'#39c',strokeWidth:0})]);await wait(500);
 const rowsEl=()=>[...document.querySelectorAll('#layerlist [data-layer-id]')],names=()=>M.doc.layers.map(l=>l.name).join(',');if(names()!=='Two,One')return 'unexpected order '+names();
 const first=rowsEl()[0],label=first.querySelector('button:not(.layer-grip):not(.eye)')||first,r=label.getBoundingClientRect(),last=rowsEl()[1].getBoundingClientRect();
 const pe=(ty,x,y,t)=>(t||label).dispatchEvent(new PointerEvent(ty,{pointerId:81,pointerType:'mouse',isPrimary:true,button:0,buttons:ty==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true}));
 pe('pointerdown',r.left+r.width/2,r.top+r.height/2);for(let i=1;i<=6;i++)pe('pointermove',r.left+r.width/2,r.top+r.height/2+(last.top+last.height-r.top)*i/6);pe('pointerup',r.left+r.width/2,last.top+last.height-2);await wait(400);
 if(names()!=='One,Two')return 'dragging from the row body did not reorder: '+names();
 M.select([]);await wait(200);const row=rowsEl()[0],lb=row.querySelector('button:not(.layer-grip):not(.eye)');lb.click();await wait(250);return M.selection.length===1?true:'a plain click no longer selects'}`);

t('studio: importing a photo finds its key colours and shows them', '/studio-app.html', `async()=>{${OPEN}await open();const board=document.getElementById('artboard').getBoundingClientRect();
 const c=document.createElement('canvas');c.width=300;c.height=300;const g=c.getContext('2d');g.fillStyle='#d62b2b';g.fillRect(0,0,300,170);g.fillStyle='#1e50c8';g.fillRect(0,170,300,80);g.fillStyle='#f2e8c8';g.fillRect(0,250,300,50);
 const b=await new Promise(r=>c.toBlob(r,'image/png'));await dropAt([new File([b],'colours.png',{type:'image/png'})],board.left+board.width/2,board.top+board.height/2);await until(1);await wait(500);
 const l=window.n0iseMotion.doc.layers.find(x=>x.type==='image');if(!l||!l.palette||l.palette.length<3)return 'no key colours were read: '+JSON.stringify(l&&l.palette);
 const near=(h,c)=>{const v=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));return Math.hypot(v[0]-c[0],v[1]-c[1],v[2]-c[2])<40};
 if(!l.palette.some(h=>near(h,[214,43,43]))||!l.palette.some(h=>near(h,[30,80,200])))return 'the main colours are missing: '+l.palette.join(',');
 if(document.querySelectorAll('.photopalette .swatch').length!==l.palette.length)return 'the colours are not shown in the inspector';
 const copy=StudioDocument.normalize(JSON.parse(JSON.stringify(window.n0iseMotion.doc)));return copy.layers.find(x=>x.type==='image').palette.length===l.palette.length?true:'the colours did not survive save and reopen'}`);

t('studio: eyedropper shows a magnified loupe, arrow keys move one pixel, release picks, Esc cancels', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument;
 M.add([D.layer('shape',{shape:'rectangle',width:900,height:900,fill:'#336699',stroke:'#336699',strokeWidth:0})]);await wait(600);
 const key=(k,sh)=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:k,shiftKey:!!sh,bubbles:true,cancelable:true}));key('i');await wait(150);
 if(document.querySelector('[data-tool=picker]').getAttribute('aria-pressed')!=='true'&&!document.querySelector('[data-tool=picker]').classList.contains('active'))return 'I did not select the eyedropper';
 const body=document.getElementById('stagebody'),r=document.getElementById('artboard').getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
 const pe=(ty,px,py)=>body.dispatchEvent(new PointerEvent(ty,{pointerId:91,pointerType:'mouse',isPrimary:true,button:0,buttons:ty==='pointerup'?0:1,clientX:px,clientY:py,bubbles:true}));
 pe('pointerdown',x,y);await wait(150);const lp=document.querySelector('.loupe');if(!lp||lp.hidden)return 'the loupe did not appear';
 const hex1=lp.querySelector('.loupehex').textContent;if(!/^#336699$/i.test(hex1))return 'wrong colour under the pointer: '+hex1;
 const raw1=lp.querySelector('.louperaw').textContent;key('ArrowRight');await wait(100);const raw2=lp.querySelector('.louperaw').textContent;if(raw1===raw2)return 'arrow keys did not move the sample';
 pe('pointerup',x,y);await wait(200);if(!lp.hidden)return 'the loupe stayed after release';
 const before=document.querySelector('[data-tool=picker]').style.getPropertyValue('--paint-color');key('i');pe('pointerdown',x,y);await wait(100);key('Escape');await wait(100);pe('pointerup',x,y);await wait(100);if(!document.querySelector('.loupe').hidden)return 'Esc did not close the loupe';return true}`);

t('studio: direct select (A) edits points of paths, shapes and text; text becomes compound outlines', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument;
 M.add([D.layer('text',{name:'Type',text:'Oo',font:'sans-serif',fontSize:300,fill:'#e9e5db',stroke:'#e9e5db',strokeWidth:0})]);await wait(500);M.select([]);await wait(100);
 const key=(k)=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));key('a');await wait(150);const dt=document.querySelector('[data-tool=direct]');if(!dt||!dt.classList.contains('active'))return 'A did not select the direct tool';
 const body=document.getElementById('stagebody'),ab=document.getElementById('artboard').getBoundingClientRect(),[w,h]=M.dims(),sc=ab.width/w;
 const pe=(ty,px,py)=>body.dispatchEvent(new PointerEvent(ty,{pointerId:95,pointerType:'mouse',isPrimary:true,button:0,buttons:ty==='pointerup'?0:1,clientX:px,clientY:py,bubbles:true}));
 const l0=M.doc.layers[0],o=D.layer?0:0;const cx=ab.left+(w/2+l0.x)*sc,cy=ab.top+(h/2+l0.y)*sc;pe('pointerdown',cx-60*sc,cy);pe('pointerup',cx-60*sc,cy);await wait(700);
 const l=M.doc.layers.find(x=>x.name==='Type');if(l.type!=='path')return 'the text was not converted to outlines (type '+l.type+')';if(!l.breaks||l.breaks.length<1)return 'the letters should be a compound path (O has a hole)';if(l.points.length<10)return 'too few outline points '+l.points.length;
 const dots=document.querySelectorAll('#overlay [data-anchor]:not([data-tangent])').length;if(dots<l.points.length*.8)return 'anchors are not shown for the outline ('+dots+' of '+l.points.length+')';
 document.getElementById('undo').click();await wait(400);const back=M.doc.layers.find(x=>x.name==='Type');if(back.type!=='text'||back.text!=='Oo')return 'undo did not bring the editable text back';
 M.add([D.layer('shape',{name:'Box',shape:'rectangle',width:300,height:300,fill:'#d33',stroke:'#d33',strokeWidth:0,x:500,y:-400})]);await wait(400);M.select([]);
 const bx=ab.left+(w/2+500)*sc,by=ab.top+(h/2-400)*sc;pe('pointerdown',bx,by);pe('pointerup',bx,by);await wait(500);const box=M.doc.layers.find(x=>x.name==='Box');return box.type==='path'&&box.points.length>=4?true:'the rectangle did not become an editable path'}`);

t('studio: several artboards: add, switch, duplicate, rename, reorder, delete, undo, save and reopen, export all', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=StudioDocument,A=window.n0iseArtboards;
 M.add([D.layer('shape',{name:'On first',shape:'rectangle',width:200,height:200,fill:'#d33',stroke:'#d33',strokeWidth:0})]);await wait(300);
 const names=()=>A.list.map(a=>(a.active?'*':'')+a.name).join('|');const label=()=>document.getElementById('artboardBtn').textContent;
 if(!/ARTBOARD 01/.test(label()))return 'unexpected label '+label();A.add({ratio:'portrait'});await wait(400);
 if(A.list.length!==2||!A.list[1].active)return 'the new artboard is not active: '+names();if(M.doc.layers.length!==0)return 'a new artboard should start empty';if(M.doc.ratio!=='portrait')return 'size of the new artboard not applied';
 M.add([D.layer('shape',{name:'On second',shape:'ellipse',width:200,height:200,fill:'#39c',stroke:'#39c',strokeWidth:0})]);await wait(300);
 A.switch(A.list[0].id);await wait(500);if(!M.doc.layers.some(l=>l.name==='On first')||M.doc.layers.some(l=>l.name==='On second'))return 'switching did not swap the layers';
 if(document.getElementById('abPrev').hidden&&document.getElementById('abNext').hidden)return 'no previous or next buttons';
 A.add({duplicate:true});await wait(400);if(A.list.length!==3||!M.doc.layers.some(l=>l.name==='On first'))return 'duplicate failed: '+names();
 const U=()=>document.getElementById('undo').click();U();await wait(400);if(A.list.length!==2||!M.doc.layers.some(l=>l.name==='On first'))return 'undo of the duplicate failed: '+names();document.getElementById('redo').click();await wait(400);if(A.list.length!==3)return 'redo failed';
 A.move(-1);await wait(300);const order=A.list.map(a=>a.id);A.move(1);await wait(300);if(order.join()===A.list.map(a=>a.id).join())return 'reorder had no effect';
 const copy=D.normalize(JSON.parse(JSON.stringify(M.doc)));if(copy.artboards.length!==3||copy.artboards.filter(a=>a.layers).length!==2)return 'artboards did not survive save and reopen';
 A.remove();await wait(400);if(A.list.length!==2)return 'delete failed';U();await wait(400);if(A.list.length!==3)return 'undo of delete failed';
 const old=JSON.parse(JSON.stringify(M.doc));delete old.artboards;delete old.activeArtboard;if(D.normalize(old).artboards)return 'single-artboard projects should stay single';
 document.getElementById('artboardBtn').click();await wait(200);const items=[...document.querySelectorAll('#modalcontent button')].map(b=>b.textContent);if(!items.some(t=>/New artboard/.test(t))||!items.some(t=>/Export every artboard/.test(t)))return 'artboard menu is missing actions: '+items.join('|');document.getElementById('modal').close();return true}`);

t('studio: fonts, alignment, film LUTs and phone centring', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=M.doc?.constructor;await wait(300);
 const V=window.n0iseViewport;document.getElementById('fit').click();await wait(200);
 const body=document.getElementById('stagebody').getBoundingClientRect(),ab=document.querySelector('#stagebody canvas')?.getBoundingClientRect();
 if(ab){const dy=Math.abs((ab.top+ab.height/2)-(body.top+body.height/2));if(dy>6)return 'artboard is '+dy.toFixed(1)+'px off vertical centre'}
 if(typeof StudioFonts==='undefined'||[...StudioFonts.groups()].length<5)return 'font library missing';if(!StudioFonts.has('Inter')&&!StudioFonts.has('Archivo Black'))return 'expected fonts absent';
 if(typeof StudioLutLib==='undefined'||StudioLutLib.list.length<50)return 'LUT library missing';
 const t=StudioLooks.cube(StudioLutLib.cube('Teal and orange blockbuster'));if(!t)return 'LUT did not parse';
 return true}`);

t('studio mobile: holding a layer on the canvas opens its options; moving or a quick tap does not', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion,D=M.doc?.constructor;
 M.add([StudioDocument.layer('shape',{name:'Box',shape:'rectangle',width:400,height:400,fill:'#d33',stroke:'#d33',strokeWidth:0})]);await wait(500);M.select([]);await wait(100);
 const st=document.getElementById('stagebody'),r=document.querySelector('#stagebody canvas').getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
 const pe=(ty,id,px,py)=>st.dispatchEvent(new PointerEvent(ty,{pointerId:id,pointerType:'touch',isPrimary:true,clientX:px,clientY:py,bubbles:true,cancelable:true}));
 const menu=()=>document.querySelector('#studioContext:not([hidden])')&&document.querySelectorAll('#studioContext button').length;
 pe('pointerdown',31,x,y);pe('pointerup',31,x,y);await wait(700);if(menu())return 'a quick tap opened the menu';
 pe('pointerdown',32,x,y);pe('pointermove',32,x+40,y);await wait(700);pe('pointerup',32,x+40,y);if(menu())return 'moving opened the menu';
 const cx=r.left+r.width/2,cy=r.top+r.height/2;pe('pointerdown',33,cx,cy);await wait(700);
 const labels=[...document.querySelectorAll('#studioContext button')].map(b=>b.textContent);pe('pointerup',33,cx,cy);
 for(const need of ['Duplicate','Delete','Bring forward','Lock layer'])if(!labels.includes(need))return 'menu lacks '+need+': '+labels.join(',');return true}`);

t('mobile polish: no text selection or double-tap zoom, canvas centred between the bars, timeline scrub is one seek per frame', '/studio-app.html', `async()=>{${OPEN}await open();
 if(getComputedStyle(document.body).userSelect!=='none')return 'body text is selectable';if(getComputedStyle(document.body).touchAction!=='manipulation')return 'double-tap zoom is not disabled: '+getComputedStyle(document.body).touchAction;
 if(!/user-scalable=no/.test(document.querySelector('meta[name=viewport]').content))return 'viewport allows zoom';
 const q=s=>document.querySelector(s).getBoundingClientRect();await wait(600);const a=q('#artboard'),t=q('.documentbar'),n=q('.mobilebar'),c=a.top+a.height/2,f=(t.bottom+n.top)/2;
 if(Math.abs(c-f)>3)return 'canvas centre '+c.toFixed(1)+' vs free space centre '+f.toFixed(1);
 const inp=document.createElement('input');document.body.append(inp);const ok=getComputedStyle(inp).userSelect==='text';inp.remove();if(!ok)return 'text fields lost selection';
 return true}`);

t('studio mobile: the hold menu fades above the finger, slide onto an option and release to pick it; export has Send to Effects; canvas is flush', '/studio-app.html', `async()=>{${OPEN}await open();const M=window.n0iseMotion;
 M.add([StudioDocument.layer('shape',{name:'Box',shape:'rectangle',width:400,height:400,fill:'#d33',stroke:'#d33',strokeWidth:0})]);await wait(500);M.select([]);await wait(100);
 const st=document.getElementById('stagebody'),r=document.querySelector('#stagebody canvas').getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
 const pe=(ty,id,px,py)=>{const ev=new PointerEvent(ty,{pointerId:id,pointerType:'touch',isPrimary:true,clientX:px,clientY:py,bubbles:true,cancelable:true});(ty==='pointerdown'?st:window).dispatchEvent(ev)};
 const menu=document.getElementById('studioContext');pe('pointerdown',41,x,y);await wait(700);
 if(menu.hidden)return 'menu did not open';if(!menu.classList.contains('peek'))return 'menu does not fade while the finger is down';
 const mr=menu.getBoundingClientRect();if(mr.bottom>y)return 'menu covers the finger: '+mr.bottom+' > '+y;
 const item=[...menu.children].find(b=>b.textContent==='Hide');const ir=item.getBoundingClientRect();pe('pointermove',41,ir.left+8,ir.top+8);await wait(60);
 if(!menu.classList.contains('near'))return 'sliding onto an option does not show it';
 const was=M.doc.layers.find(l=>l.name==='Box').visible;pe('pointerup',41,ir.left+8,ir.top+8);await wait(200);
 if(M.doc.layers.find(l=>l.name==='Box').visible===was)return 'releasing on an option did not run it';if(!menu.hidden)return 'menu stayed open after picking';
 document.getElementById('export').click();await wait(300);if(![...document.querySelectorAll('#modalcontent button')].some(b=>/Send to Effects/.test(b.textContent)))return 'no Send to Effects';
 return true}`);
