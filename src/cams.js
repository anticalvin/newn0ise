/* n0ise camera bodies. Each one is a Fuse recipe (up to three of the engine's camera looks plus the Finish controls),
   a frame shape and an overlay (date stamp, rec readout, film gate, instant border). The look runs on the shared engine;
   the overlay is plain 2D drawing so the live view and the saved photo or video are made by the same code. */
export const CAMS=[
  {id:'cctv',name:'CCTV',sub:'Wide lens, tape-grade video, pumping exposure',sim:'cctv',aspect:'4:3',ov:{stamp:'cctv'},glyph:'dome'},
  {id:'dash',name:'Dashcam',sub:'Wide windscreen view, hard compression',sim:'dash',aspect:'16:9',ov:{stamp:'date'},glyph:'dash'},
  {id:'door',name:'Doorbell',sub:'Fisheye, cool and flat at the front step',sim:'door',aspect:'3:4',ov:{},glyph:'dome'},
  {id:'ccd',name:'CCD 03',sub:'Compact digital: flash, sharpening halos, fringing',sim:'ccd',aspect:'3:4',ov:{stamp:'date'},glyph:'compact'},
  {id:'web',name:'Webcam 00',sub:'Low-res cam from the early web',sim:'web',aspect:'4:3',ov:{},glyph:'phone'},
  {id:'disp',name:'Disposable',sub:'Plastic lens, hard flash, heavy corners',sim:'disp',aspect:'3:4',ov:{stamp:'date'},glyph:'toy'},
  {id:'holga',name:'Toy film',sub:'Soft plastic lens, light leaks, deep vignette',sim:'holga',aspect:'1:1',ov:{},glyph:'toy'},
  {id:'inst',name:'Instant',sub:'Faded print with a white border',sim:'inst',aspect:'1:1',ov:{frame:'instant'},glyph:'instant'},
  {id:'handy',name:'Handy',sub:'Tape camcorder: chroma bleed, tracking, comb',sim:'handy',aspect:'4:3',ov:{rec:true},glyph:'camcorder'},
  {id:'s8',name:'Super 8',sub:'Small-gauge film: weave, halation, scratches',sim:'s8',aspect:'4:3',ov:{frame:'gate'},glyph:'film'},
  {id:'noir',name:'Noir 35',sub:'Black and white stock, coarse grain',sim:'noir',aspect:'3:4',ov:{},glyph:'slr'},
  {id:'night',name:'Night',sub:'Light-amplifier tube, green and noisy',sim:'night',aspect:'3:4',ov:{nv:true},glyph:'slr'},
  {id:'heat',name:'Heat',sub:'Thermal sensor, low resolution',sim:'heat',aspect:'3:4',ov:{cross:true},glyph:'phone'},
  {id:'sig',name:'Signal',sub:'Bad analog feed: tearing, bleed, noise',sim:'sig',aspect:'4:3',ov:{rec:'play'},glyph:'camcorder'},
  {id:'prism',name:'Prism',sub:'Split light and mirrored facets',sim:'prism',fx:['prism','kaleido'],mix:[100,35],aspect:'1:1',ov:{},glyph:'toy'},
  {id:'clean',name:'Studio',sub:'Clean, a little sharpening and bloom',sim:'clean',aspect:'3:4',ov:{},glyph:'compact'}
];

/* flat camera glyphs, 56x40, currentColor only */
export function glyph(kind){
  const s=(inner)=>`<svg viewBox="0 0 56 40" width="56" height="40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${inner}</svg>`;
  switch(kind){
    case 'instant':return s('<rect x="14" y="3" width="28" height="34" rx="2"/><rect x="18" y="7" width="20" height="18"/><circle cx="28" cy="16" r="5"/><path d="M20 31h10"/>');
    case 'camcorder':return s('<rect x="6" y="9" width="34" height="22" rx="2"/><path d="M40 14l10-4v20l-10-4z"/><circle cx="18" cy="20" r="6"/><path d="M10 5h12"/>');
    case 'film':return s('<rect x="5" y="9" width="40" height="24" rx="2"/><circle cx="19" cy="21" r="7"/><path d="M45 15l7-3v18l-7-3zM12 5h14"/>');
    case 'slr':return s('<path d="M5 12h12l3-5h16l3 5h12v24H5z"/><circle cx="28" cy="23" r="9"/><circle cx="28" cy="23" r="3"/>');
    case 'phone':return s('<rect x="17" y="2" width="22" height="36" rx="3"/><circle cx="28" cy="12" r="4"/><path d="M24 31h8"/>');
    case 'dome':return s('<path d="M6 8h44v6H6z"/><path d="M10 14c0 14 8 22 18 22s18-8 18-22"/><circle cx="28" cy="24" r="5"/>');
    case 'dash':return s('<rect x="6" y="12" width="44" height="20" rx="3"/><circle cx="20" cy="22" r="6"/><path d="M32 18h12M32 24h8M28 32v6M22 38h12"/>');
    case 'toy':return s('<rect x="6" y="8" width="44" height="28" rx="3"/><circle cx="28" cy="23" r="9"/><path d="M12 13h6M40 13h4"/><circle cx="28" cy="23" r="3"/>');
    default:return s('<rect x="4" y="10" width="48" height="26" rx="3"/><circle cx="28" cy="23" r="8"/><path d="M10 6h8M40 15h5"/>');
  }
}

const pad=n=>String(n).padStart(2,'0');
/* Draw the overlay for camera `c` over a w by h picture. `o`: {t: seconds since record start, recOn, date} */
export function drawOverlay(g,w,h,c,o={}){
  if(!o.keep)g.clearRect(0,0,w,h);if(!c)return;
  const u=Math.min(w,h),v=c.ov||{},d=o.date||new Date();
  g.save();g.textBaseline='alphabetic';
  const text=(str,x,y,size,col,align='left',weight=700)=>{
    g.font=`${weight} ${Math.round(size)}px "JetBrains Mono",ui-monospace,Menlo,monospace`;g.textAlign=align;
    g.fillStyle='rgba(0,0,0,.55)';g.fillText(str,x+size*.06,y+size*.06);g.fillStyle=col;g.fillText(str,x,y);};
  const m=u*.045;
  if(!o.text){frames(g,w,h,v,u,o);g.restore();return;}
  if(v.stamp==='cctv'){text('CAM 01',m,m+u*.04,u*.04,'#f2efe8');text(`${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,m,h-m,u*.034,'#f2efe8');}
  if(v.stamp==='date'){text(`'${pad(d.getFullYear()%100)} ${pad(d.getMonth()+1)} ${pad(d.getDate())}`,w-m,h-m,u*.04,'#ff9a2e','right');}
  if(v.rec){
    const play=v.rec==='play',tc=o.t||0;
    if(play)text('PLAY ▶',m,m+u*.04,u*.04,'#f2efe8');
    else{if(o.recOn===false||Math.floor((o.t||0)*2)%2===0||!o.recOn){g.fillStyle='#ff3b2f';g.beginPath();g.arc(m+u*.016,m+u*.026,u*.016,0,7);g.fill();}text('REC',m+u*.05,m+u*.04,u*.04,'#f2efe8');}
    text(`${pad(Math.floor(tc/3600))}:${pad(Math.floor(tc/60)%60)}:${pad(Math.floor(tc)%60)}`,w-m,m+u*.04,u*.036,'#f2efe8','right');
    text(`${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`,m,h-m,u*.034,'#f2efe8');
    text('SP',w-m,h-m,u*.034,'#f2efe8','right');
  }
  if(v.nv){text('NV',m,m+u*.04,u*.04,'#f2efe8');text('IR',w-m,m+u*.04,u*.04,'#f2efe8','right');}
  if(v.cross||v.nv){const L=u*.05,k=.2;g.strokeStyle='rgba(242,239,232,.85)';g.lineWidth=Math.max(1.5,u*.004);
    if(v.cross){const cx=w/2,cy=h/2;g.beginPath();g.moveTo(cx-L,cy);g.lineTo(cx-L*.3,cy);g.moveTo(cx+L*.3,cy);g.lineTo(cx+L,cy);g.moveTo(cx,cy-L);g.lineTo(cx,cy-L*.3);g.moveTo(cx,cy+L*.3);g.lineTo(cx,cy+L);g.stroke();}
    const b=m*1.6,e=u*.07;g.beginPath();for(const [x,y,sx,sy] of [[b,b,1,1],[w-b,b,-1,1],[b,h-b,1,-1],[w-b,h-b,-1,-1]]){g.moveTo(x,y+sy*e);g.lineTo(x,y);g.lineTo(x+sx*e,y);}g.stroke();
    if(v.cross)text('CENTER',w/2,h/2+L*1.7,u*.03,'#f2efe8','center',500);}
  frames(g,w,h,v,u,o);
  g.restore();
}

function frames(g,w,h,v,u,o){
  if(v.frame==='instant'){const s=u*.05,bt=u*.19;g.fillStyle='#f2efe8';g.fillRect(0,0,w,s);g.fillRect(0,0,s,h);g.fillRect(w-s,0,s,h);g.fillRect(0,h-bt,w,bt);}
  if(v.frame==='gate'){
    const r=u*.07;g.fillStyle='#000';g.beginPath();g.rect(0,0,w,h);g.roundRect(u*.012,u*.012,w-u*.024,h-u*.024,r);g.fill('evenodd');
    const seed=Math.floor((o.t||performance.now()/1000)*8);g.fillStyle='rgba(242,239,232,.35)';
    for(let i=0;i<3;i++){const q=Math.sin((seed+i*7.1)*12.9898)*43758.5453,x=(q-Math.floor(q))*w;g.fillRect(x,0,Math.max(1,u*.0015),h);}
  }
}
