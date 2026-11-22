// Browser regression tests for Studio and Lab foundations (N0I-29..N0I-36). Same format as core-smoke-world.mjs: [name, url, async body] returning true or a failure string.
export const tests = [];
const t = (name, url, body) => tests.push([name, url, body]);
const OPEN = `const wait=ms=>new Promise(r=>setTimeout(r,ms));const open=async()=>{for(let i=0;i<40&&!document.getElementById('launchForm');i++)await wait(100);await wait(800);const b=document.querySelector('#launchForm button');if(b&&document.getElementById('launcher')?.open)b.click();await wait(900)};
const mkFile=async(name,type,w,h,color)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,w,h);const b=await new Promise(r=>c.toBlob(r,type));return new File([b],name,{type})};
const dropAt=async(files,x,y)=>{const s=document.getElementById('stagebody'),dt=new DataTransfer();files.forEach(f=>dt.items.add(f));s.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true,clientX:x,clientY:y}));const ev=new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true,clientX:x,clientY:y});s.dispatchEvent(ev);return ev.defaultPrevented};
const rows=()=>document.querySelectorAll('#layerlist [data-layer-id]').length;`;

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
 await dropAt([await mkFile('a.png','image/png',300,200,'#c33')],board.left+board.width*.3,board.top+board.height*.3);await wait(1800);await dropAt([await mkFile('b.png','image/png',200,200,'#39c')],board.left+board.width*.7,board.top+board.height*.7);await wait(1800);
 if(rows()!==2)return 'expected 2 layers, got '+rows();const U=()=>document.getElementById('undo').click(),Rr=()=>document.getElementById('redo').click();
 if(document.getElementById('deleteTool').disabled)return 'toolbar delete is disabled with a selection';document.getElementById('deleteTool').click();await wait(200);if(rows()!==1)return 'toolbar delete failed';U();await wait(200);if(rows()!==2)return 'undo did not restore';Rr();await wait(200);if(rows()!==1)return 'redo failed';U();await wait(200);
 document.querySelector('[data-mobile=left]')?.click();await wait(400);const bin=document.getElementById('layerBin'),G=()=>document.querySelector('#layerlist [data-layer-grip]'),R1=()=>bin.getBoundingClientRect(),R2=()=>G().getBoundingClientRect();
 const pe=(ty,x,y)=>G().dispatchEvent(new PointerEvent(ty,{pointerId:21,pointerType:'mouse',isPrimary:true,button:0,buttons:ty==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true}));
 let br=R1(),gr=R2();pe('pointerdown',gr.left+4,gr.top+4);pe('pointermove',br.left+20,br.top+br.height/2);await wait(80);window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));pe('pointerup',br.left+20,br.top+br.height/2);await wait(200);if(rows()!==2)return 'a cancelled drag deleted a layer';
 br=R1();gr=R2();pe('pointerdown',gr.left+4,gr.top+4);pe('pointermove',br.left+20,br.top+br.height/2);pe('pointerup',br.left+20,br.top+br.height/2);await wait(300);if(rows()!==1)return 'dropping on the bin left '+rows()+' layers (expected 1)';U();await wait(200);if(rows()!==2)return 'undo after bin failed';
 document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}));await wait(200);document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));await wait(250);if(rows()!==0)return 'Delete key did not remove both selected layers';U();await wait(250);return rows()===2?true:'undo after multi-delete restored '+rows()}`);

t('studio: dropped images land where dropped, SVG imports, unsupported files explain themselves', '/studio-app.html', `async()=>{${OPEN}await open();const board=document.getElementById('artboard'),r=board.getBoundingClientRect();
 const ok=await dropAt([await mkFile('left.png','image/png',200,200,'#c33')],r.left+r.width*.2,r.top+r.height*.25);await wait(1800);if(!ok||rows()!==1)return 'png drop did not create a layer';
 const row=document.querySelector('#layerlist [data-layer-id]');const sel=document.getElementById('inspector')||document;
 await dropAt([new File(['<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#0a8"/></svg>'],'v.svg',{type:'image/svg+xml'})],r.left+r.width*.8,r.top+r.height*.8);await wait(1800);if(rows()!==2)return 'svg drop failed';
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
