/* n0ise camera bodies. Each one is a Fuse recipe (up to three of the engine's camera looks plus the Finish controls),
   a frame shape and an overlay (date stamp, rec readout, film gate, instant border). The look runs on the shared engine;
   the overlay is plain 2D drawing so the live view and the saved photo or video are made by the same code. */
export const CAMS=[
  {id:'pcan',cat:'Pro',name:'Canon-style',sub:'Warm skin, soft contrast, creamy highlights',sim:'pcanon',aspect:'3:4',ov:{af:true},glyph:'slr'},
  {id:'pnik',cat:'Pro',name:'Nikon-style',sub:'Neutral and punchy, a touch yellow, crisp detail',sim:'pnikon',aspect:'3:4',ov:{af:true},glyph:'slr'},
  {id:'psny',cat:'Pro',name:'Sony-style',sub:'Cool, clinical and very sharp',sim:'psony',aspect:'3:4',ov:{af:true},glyph:'slr'},
  {id:'pfuj',cat:'Pro',name:'Fuji-style',sub:'Classic chrome: muted colour, deep shadows, a little grain',sim:'pfuji',aspect:'3:4',ov:{af:true},glyph:'slr'},
  {id:'plei',cat:'Pro',name:'Leica-style',sub:'Rich micro-contrast, deep tones, a hint of glow',sim:'pleica',aspect:'3:4',ov:{af:true},glyph:'slr'},
  {id:'phas',cat:'Pro',name:'Medium format',sub:'Smooth tonal range, natural colour, calm highlights',sim:'phassel',aspect:'4:3',ov:{af:true},glyph:'slr'},
  {id:'pstu',cat:'Pro',name:'Studio strobe',sub:'High-key and clean, bright blacks, controlled highlights',sim:'pstudio',aspect:'4:5',ov:{},glyph:'slr'},
  {id:'pbea',cat:'Pro',name:'Beauty dish',sub:'Soft skin, gentle glow, warm and flattering',sim:'pbeauty',aspect:'4:5',ov:{},glyph:'slr'},
  {id:'ppro',cat:'Pro',name:'Product',sub:'Neutral white, crisp edges, no colour games',sim:'pproduct',aspect:'1:1',ov:{},glyph:'slr'},
  {id:'pedi',cat:'Pro',name:'Editorial',sub:'Matte and lifted with calm colour',sim:'peditorial',aspect:'4:5',ov:{},glyph:'slr'},
  {id:'pdoc',cat:'Pro',name:'Documentary',sub:'Honest contrast, sharp, a little grain',sim:'pdoc',aspect:'3:2',ov:{af:true},glyph:'slr'},
  {id:'pstr',cat:'Pro',name:'Street mono',sub:'Black and white, hard contrast, fine grain',sim:'pstreet',aspect:'3:2',ov:{},glyph:'slr'},
  {id:'ppor',cat:'Pro',name:'Portrait 85',sub:'Compressed, soft edges, a warm glow',sim:'pportrait',aspect:'4:5',ov:{af:true},glyph:'slr'},
  {id:'pgol',cat:'Pro',name:'Golden hour',sub:'Warm low sun, glow in the highlights',sim:'pgolden',aspect:'3:2',ov:{},glyph:'slr'},
  {id:'pblu',cat:'Pro',name:'Blue hour',sub:'Cool dusk with deep blue shadows',sim:'pblue',aspect:'3:2',ov:{},glyph:'slr'},
  {id:'plan',cat:'Pro',name:'Landscape',sub:'Rich colour, deep contrast, edge-to-edge sharp',sim:'pland',aspect:'3:2',ov:{},glyph:'slr'},
  {id:'parc',cat:'Pro',name:'Architecture',sub:'Straight lines, clean and crisp',sim:'parch',aspect:'3:4',ov:{},glyph:'slr'},
  {id:'pmac',cat:'Pro',name:'Macro',sub:'Close in, tight edges, saturated detail',sim:'pmacro',aspect:'1:1',ov:{},glyph:'slr'},
  {id:'pnig',cat:'Pro',name:'Night city',sub:'Clean low light, glowing lights, cool shadows',sim:'pnight',aspect:'3:2',ov:{},glyph:'slr'},
  {id:'pspo',cat:'Pro',name:'Sports tele',sub:'Tight crop, punchy and crisp',sim:'psport',aspect:'3:2',ov:{af:true},glyph:'slr'},
  {id:'ppoa',cat:'Pro',name:'Portra skin',sub:'Warm medium-format film skin tones',sim:'pportra',aspect:'4:5',ov:{},glyph:'film'},
  {id:'pair',cat:'Pro',name:'Bright and airy',sub:'Lifted, soft and light, wedding style',sim:'pairy',aspect:'4:5',ov:{},glyph:'slr'},
  {id:'pmoo',cat:'Pro',name:'Dark and moody',sub:'Low key, deep shadows, restrained colour',sim:'pmoody',aspect:'4:5',ov:{},glyph:'slr'},
  {id:'pcre',cat:'Pro',name:'Creator',sub:'Bright, clean and saturated for the feed',sim:'pcreator',aspect:'4:5',ov:{},glyph:'phone'},
  {id:'carr',cat:'Cinema',name:'Cine digital',sub:'Soft highlight roll-off, rich shadows, a little grain',sim:'carri',aspect:'16:9',ov:{rec:true},glyph:'camcorder'},
  {id:'cred',cat:'Cinema',name:'Cine crisp',sub:'Sharp, clean and saturated',sim:'cred',aspect:'16:9',ov:{rec:true},glyph:'camcorder'},
  {id:'c35',cat:'Cinema',name:'Super 35 film',sub:'Warm film stock with grain and glow',sim:'cs35',aspect:'16:9',ov:{},glyph:'film'},
  {id:'cana',cat:'Cinema',name:'Anamorphic',sub:'Blue flare, wide frame, soft edges',sim:'cana',aspect:'21:9',ov:{},glyph:'camcorder'},
  {id:'ctea',cat:'Cinema',name:'Teal and orange',sub:'The blockbuster split of cool shadows and warm skin',sim:'ctealor',aspect:'21:9',ov:{},glyph:'camcorder'},
  {id:'cnoi',cat:'Cinema',name:'Noir',sub:'Black and white with deep shadow and bloom',sim:'cnoir',aspect:'16:9',ov:{},glyph:'film'},
  {id:'cdoc',cat:'Cinema',name:'Handheld doc',sub:'Slight gate weave, honest colour',sim:'cdocu',aspect:'16:9',ov:{rec:true},glyph:'camcorder'},
  {id:'ceng',cat:'Cinema',name:'Broadcast',sub:'Clean, bright news camera',sim:'ceng',aspect:'16:9',ov:{rec:true},glyph:'camcorder'},
  {id:'cadv',cat:'Cinema',name:'Commercial',sub:'Bright, glossy, saturated',sim:'cad',aspect:'16:9',ov:{},glyph:'camcorder'},
  {id:'clog',cat:'Cinema',name:'Flat log',sub:'Low contrast base to grade later',sim:'clog',aspect:'16:9',ov:{},glyph:'camcorder'},
  {id:'c16',cat:'Cinema',name:'16mm',sub:'Grainy, soft, warm with a little dust',sim:'c16',aspect:'4:3',ov:{},glyph:'film'},
  {id:'cmut',cat:'Cinema',name:'Muted drama',sub:'Desaturated and cool with lifted blacks',sim:'cmuted',aspect:'21:9',ov:{},glyph:'camcorder'},
  {id:'cwar',cat:'Cinema',name:'Warm drama',sub:'Amber light and soft glow',sim:'cwarm',aspect:'21:9',ov:{},glyph:'camcorder'},
  {id:'cctv',cat:'Video',name:'CCTV',sub:'Wide lens, tape-grade video, pumping exposure',sim:'cctv',aspect:'4:3',ov:{stamp:'cctv'},glyph:'dome'},
  {id:'dash',cat:'Video',name:'Dashcam',sub:'Wide windscreen view, hard compression',sim:'dash',aspect:'16:9',ov:{stamp:'date',speed:true},glyph:'dash'},
  {id:'door',cat:'Video',name:'Doorbell',sub:'Fisheye, cool and flat at the front step',sim:'door',aspect:'3:4',ov:{},glyph:'dome'},
  {id:'ccd',cat:'Digital',name:'CCD 03',sub:'Compact digital: flash, sharpening halos, fringing',sim:'ccd',aspect:'3:4',ov:{stamp:'date',af:true},glyph:'compact'},
  {id:'web',cat:'Video',name:'Webcam 00',sub:'Low-res cam from the early web',sim:'web',aspect:'4:3',ov:{live:true},glyph:'phone'},
  {id:'disp',cat:'Film',name:'Disposable',sub:'Plastic lens, hard flash, heavy corners',sim:'disp',aspect:'3:4',ov:{stamp:'date',shots:true},glyph:'toy'},
  {id:'holga',cat:'Film',name:'Toy film',sub:'Soft plastic lens, light leaks, deep vignette',sim:'holga',aspect:'1:1',ov:{},glyph:'toy'},
  {id:'inst',cat:'Film',name:'Instant',sub:'Faded print with a white border',sim:'inst',aspect:'1:1',ov:{frame:'instant'},glyph:'instant'},
  {id:'handy',cat:'Video',name:'Handy',sub:'Tape camcorder: chroma bleed, tracking, comb',sim:'handy',aspect:'4:3',ov:{rec:true,batt:true},glyph:'camcorder'},
  {id:'s8',cat:'Film',name:'Super 8',sub:'Small-gauge film: weave, halation, scratches',sim:'s8',aspect:'4:3',ov:{frame:'gate',fcount:true},glyph:'film'},
  {id:'noir',cat:'Film',name:'Noir 35',sub:'Black and white stock, coarse grain',sim:'noir',aspect:'3:4',ov:{},glyph:'slr'},
  {id:'night',cat:'Digital',name:'Night',sub:'Light-amplifier tube, green and noisy',sim:'night',aspect:'3:4',ov:{nv:true},glyph:'slr'},
  {id:'heat',cat:'Digital',name:'Heat',sub:'Thermal sensor, low resolution',sim:'heat',aspect:'3:4',ov:{cross:true,scale:true},glyph:'phone'},
  {id:'sig',cat:'Glitch',name:'Signal',sub:'Bad analog feed: tearing, bleed, noise',sim:'sig',aspect:'4:3',ov:{rec:'play'},glyph:'camcorder'},
  {id:'prism',cat:'Glitch',name:'Prism',sub:'Split light and mirrored facets',sim:'prism',fx:['prism','kaleido'],mix:[100,35],aspect:'1:1',ov:{},glyph:'toy'},
  {id:'clean',cat:'Digital',name:'Studio',sub:'Clean, a little sharpening and bloom',sim:'clean',aspect:'3:4',ov:{af:true},glyph:'compact'},
  {id:'neg35',cat:'Film',name:'35mm negative',sub:'Colour negative stock, soft and warm',sim:'neg35',aspect:'3:4',ov:{},glyph:'slr'},
  {id:'slide',cat:'Film',name:'Slide film',sub:'Saturated reversal film, deep contrast',sim:'slide',aspect:'3:4',ov:{},glyph:'slr'},
  {id:'xpro',cat:'Film',name:'Cross process',sub:'Slide film in the wrong chemistry',sim:'xpro',aspect:'3:4',ov:{},glyph:'slr'},
  {id:'bleach',cat:'Film',name:'Bleach bypass',sub:'Silver left in, harsh and desaturated',sim:'bleach',aspect:'3:4',ov:{},glyph:'slr'},
  {id:'mf120',cat:'Film',name:'120 medium',sub:'Medium format, fine grain, calm tones',sim:'mf120',aspect:'1:1',ov:{},glyph:'slr'},
  {id:'expired',cat:'Film',name:'Expired instant',sub:'Old instant film: faded, leaking, stained',sim:'expired',aspect:'1:1',ov:{frame:'instant'},glyph:'instant'},
  {id:'p110',cat:'Film',name:'110 pocket',sub:'Tiny negative, heavy grain and corners',sim:'p110',aspect:'4:3',ov:{stamp:'date'},glyph:'toy'},
  {id:'pinhole',cat:'Film',name:'Pinhole',sub:'No lens: soft, dark corners, long exposure',sim:'pinhole',aspect:'1:1',ov:{},glyph:'lens'},
  {id:'vhslp',cat:'Video',name:'VHS LP',sub:'Slow-speed tape: smear, tracking, noise',sim:'vhslp',aspect:'4:3',ov:{rec:true,batt:true},glyph:'camcorder'},
  {id:'hi8',cat:'Video',name:'Hi8',sub:'Handycam tape, cleaner colour than VHS',sim:'hi8',aspect:'4:3',ov:{rec:true,batt:true},glyph:'camcorder'},
  {id:'beta',cat:'Video',name:'Betamax',sub:'Sharper tape, warm and a little tired',sim:'beta',aspect:'4:3',ov:{rec:true,batt:true},glyph:'camcorder'},
  {id:'eng',cat:'Video',name:'News camera',sub:'Broadcast field camera, crisp and bright',sim:'eng',aspect:'16:9',ov:{rec:true,batt:true},glyph:'camcorder'},
  {id:'satfeed',cat:'Video',name:'Satellite feed',sub:'Blocky live link with dropouts',sim:'satfeed',aspect:'16:9',ov:{stamp:'cctv',link:true},glyph:'screen'},
  {id:'flip03',cat:'Digital',name:'Flip phone',sub:'Tiny sensor from a 2003 flip phone',sim:'flip03',aspect:'3:4',ov:{flip:true},glyph:'phone'},
  {id:'campho',cat:'Digital',name:'Camera phone',sub:'Early phone camera, crunchy sharpening',sim:'campho',aspect:'4:3',ov:{},glyph:'phone'},
  {id:'eyecam',cat:'Video',name:'Eye cam',sub:'Console webcam: noisy, sharp, auto-exposing',sim:'eyecam',aspect:'4:3',ov:{},glyph:'phone'},
  {id:'body',cat:'Video',name:'Bodycam',sub:'Wide lens, flat contrast, compressed',sim:'body',aspect:'16:9',ov:{stamp:'cctv'},glyph:'dome'},
  {id:'baby',cat:'Video',name:'Baby monitor',sub:'Night mode, green-grey, bursts of noise',sim:'baby',aspect:'4:3',ov:{},glyph:'dome'},
  {id:'gbc',cat:'Digital',name:'Pocket 2-bit',sub:'Four shades of green on a tiny screen',sim:'gbc',aspect:'1:1',ov:{},glyph:'screen'},
  {id:'amber',cat:'Digital',name:'Amber terminal',sub:'Phosphor screen: scanlines, glow, curve',sim:'amber',aspect:'4:3',ov:{},glyph:'screen'},
  {id:'lcdg',cat:'Digital',name:'LCD panel',sub:'Small LCD: banded, bright, hard colours',sim:'lcdg',aspect:'4:3',ov:{},glyph:'screen'},
  {id:'eink',cat:'Digital',name:'E-ink',sub:'Paper-grey, four levels, soft ghosting',sim:'eink',aspect:'3:4',ov:{},glyph:'screen'},
  {id:'ledm',cat:'Digital',name:'LED matrix',sub:'A few dozen glowing points',sim:'ledm',aspect:'1:1',ov:{},glyph:'screen'},
  {id:'micro',cat:'Digital',name:'Microscope',sub:'Magnified, tube vignette, fringing',sim:'micro',aspect:'1:1',ov:{},glyph:'lens'},
  {id:'endo',cat:'Digital',name:'Endoscope',sub:'Wide ring light, warm tones',sim:'endo',aspect:'1:1',ov:{},glyph:'lens'},
  {id:'fpv',cat:'Digital',name:'Drone FPV',sub:'Wide analog link with dropouts',sim:'fpv',aspect:'16:9',ov:{},glyph:'dash'},
  {id:'ascii',cat:'Glitch',name:'Text cam',sub:'Picture drawn from characters',sim:'clean',aspect:'4:3',ov:{},glyph:'screen',fx:['ascii'],mix:[100]},
  {id:'moshc',cat:'Glitch',name:'Datamosh',sub:'Smeared motion, frozen blocks',sim:'mosh',aspect:'3:4',ov:{},glyph:'wave',fx:['mosh'],mix:[100]},
  {id:'psortc',cat:'Glitch',name:'Pixel sort',sub:'Streaks of sorted brightness',sim:'clean',aspect:'3:4',ov:{},glyph:'wave',mods:[{module:'psort'}]},
  {id:'slitc',cat:'Glitch',name:'Slit scan',sub:'Time smeared across the frame',sim:'clean',aspect:'3:4',ov:{},glyph:'wave',fx:['slit'],mix:[100]},
  {id:'echoc',cat:'Glitch',name:'Echo trails',sub:'Ghosts of the last second',sim:'clean',aspect:'3:4',ov:{},glyph:'wave',mods:[{module:'echo'}]},
  {id:'photofinish',cat:'Time',name:'Photo finish',sub:'A thin slit builds the picture over time. Move sideways to stretch things.',sim:'clean',aspect:'4:3',ov:{},glyph:'wave',mods:[{module:'photofinish'}]},
  {id:'scannerbed',cat:'Time',name:'Scanner bed',sub:'A light bar scans the scene. Move and the scan bends.',sim:'clean',aspect:'3:4',ov:{},glyph:'wave',mods:[{module:'scanner'}]},
  {id:'contactstrip',cat:'Time',name:'Contact strip',sub:'A rolling contact sheet of the last few moments.',sim:'neg35',aspect:'3:4',ov:{},glyph:'wave',mods:[{module:'contactstrip'}]},
  {id:'doubletake',cat:'Time',name:'Double take',sub:'Hold a first shot, then pose against it.',sim:'clean',aspect:'3:4',ov:{},glyph:'person',mods:[{module:'doubletake'}]},
  {id:'kaleidoc',cat:'Glitch',name:'Kaleidoscope',sub:'Mirrored wedges around the centre',sim:'prism',aspect:'1:1',ov:{},glyph:'lens',fx:['kaleido'],mix:[100]},
  {id:'mirrorc',cat:'Glitch',name:'Mirror',sub:'Split the frame and fold it',sim:'clean',aspect:'3:4',ov:{},glyph:'lens',fx:['mirror'],mix:[100]},
  {id:'fracture',cat:'Glitch',name:'Time fracture',sub:'Slit-scan over a ghosted copy',sim:'sig',aspect:'3:4',ov:{},glyph:'wave',fx:['slit','ghost'],mix:[100,50]},
  {id:'duo',cat:'Subject',name:'Two-colour',sub:'Subject and background in two flat colours',sim:'clean',aspect:'3:4',ov:{},glyph:'person',duo:true,mods:[{module:'solid'}]},
  {id:'sil',cat:'Subject',name:'Silhouette',sub:'Solid shape of the person in front',sim:'clean',aspect:'3:4',ov:{},glyph:'person',mods:[{module:'solid'}]},
  {id:'neonc',cat:'Subject',name:'Neon outline',sub:'Glowing contour of the person',sim:'clean',aspect:'3:4',ov:{},glyph:'person',mods:[{module:'neonedge'}]},
  {id:'sigc',cat:'Subject',name:'Signal body',sub:'Person redrawn as moving signal lines',sim:'clean',aspect:'3:4',ov:{},glyph:'person',mods:[{module:'sigbody'}]},
  {id:'dogc',cat:'Animal',name:'Dog',sub:'Blue and yellow only, wide and low, quick to catch motion',sim:'dog',aspect:'4:3',ov:{},glyph:'lens'},
  {id:'catc',cat:'Animal',name:'Cat',sub:'Dim-light vision with a wide, soft view',sim:'cat',aspect:'4:3',ov:{},glyph:'lens'},
  {id:'horsec',cat:'Animal',name:'Horse',sub:'Very wide, dark at the edges, blind spots',sim:'horse',aspect:'16:9',ov:{},glyph:'lens'},
  {id:'beec',cat:'Animal',name:'Bee',sub:'Facets, shifted toward violet',sim:'bee',aspect:'1:1',ov:{},glyph:'lens'},
  {id:'flyc',cat:'Animal',name:'Fly',sub:'Compound eye: a mosaic of tiny views',sim:'fly',aspect:'1:1',ov:{},glyph:'lens'},
  {id:'hawkc',cat:'Animal',name:'Hawk',sub:'Far sharper than yours, richer colour',sim:'hawk',aspect:'16:9',ov:{},glyph:'lens'},
  {id:'viperc',cat:'Animal',name:'Pit viper',sub:'Heat only, blurred',sim:'viper',aspect:'4:3',ov:{},glyph:'dome'},
  {id:'sharkc',cat:'Animal',name:'Shark',sub:'Blue-grey, contrasty, tunnelled',sim:'shark',aspect:'16:9',ov:{},glyph:'dome'},
  {id:'owlc',cat:'Animal',name:'Owl',sub:'Seeing in the dark, a narrow bright tube',sim:'owl',aspect:'1:1',ov:{},glyph:'lens'},
  {id:'mantisc',cat:'Animal',name:'Mantis shrimp',sub:'Too many colours at once',sim:'mantis',aspect:'4:3',ov:{},glyph:'lens'}
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
    case 'screen':return s('<rect x="6" y="6" width="44" height="28" rx="2"/><path d="M20 38h16M28 34v4"/><path d="M12 14h18M12 20h26M12 26h12"/>');
    case 'wave':return s('<path d="M4 20c5-12 8-12 12 0s8 12 12 0 8-12 12 0 6 8 8 4"/><path d="M4 30h48M4 10h48" stroke-dasharray="3 4"/>');
    case 'person':return s('<circle cx="28" cy="11" r="6"/><path d="M14 36c0-9 6-14 14-14s14 5 14 14z"/>');
    case 'lens':return s('<circle cx="28" cy="20" r="15"/><circle cx="28" cy="20" r="8"/><circle cx="28" cy="20" r="2.5"/>');
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

  const now=o.now!=null?o.now:performance.now()/1000;
  const battery=(x,y,bw,bh,lvl)=>{g.strokeStyle='#f2efe8';g.lineWidth=Math.max(1.5,u*.004);g.strokeRect(x,y,bw,bh);g.fillStyle='#f2efe8';g.fillRect(x+bw,y+bh*.3,bw*.07,bh*.4);
    g.fillStyle=lvl<.2?'#ff5a4a':'#f2efe8';g.fillRect(x+bw*.08,y+bh*.14,(bw*.84)*lvl,bh*.72);};
  if(v.batt){const tc=o.t||0,lvl=Math.max(.12,.82-(now%1800)/1800*.5);battery(w-m-u*.075,m+u*.075,u*.075,u*.036,lvl);
    const left=3600-Math.floor(tc);text(`TAPE ${pad(Math.floor(left/60)%60)}:${pad(left%60)}`,w/2,h-m,u*.032,'#f2efe8','center');}
  if(v.fcount){text(`FRAME ${String(Math.floor(now*18)%10000).padStart(4,'0')}`,m,h-m,u*.034,'#f2efe8');text('18 FPS',w-m,h-m,u*.034,'#f2efe8','right');}
  if(v.shots){const left=24-((o.shots||0)%25);text(String(left),w-m,m+u*.08,u*.085,'#ffd23a','right');text('SHOTS',w-m,m+u*.115,u*.026,'#f2efe8','right',500);}
  if(v.af){const L=u*.07,cx=w/2,cy=h/2;g.strokeStyle='rgba(242,239,232,.9)';g.lineWidth=Math.max(1.5,u*.004);g.beginPath();
    for(const[x,y,sx,sy]of[[cx-L,cy-L,1,1],[cx+L,cy-L,-1,1],[cx-L,cy+L,1,-1],[cx+L,cy+L,-1,-1]]){g.moveTo(x,y+sy*L*.4);g.lineTo(x,y);g.lineTo(x+sx*L*.4,y);}g.stroke();
    text('F2.8  1/125  ISO 200',m,h-m,u*.03,'#f2efe8');text('AF',w-m,h-m,u*.03,'#f2efe8','right');}
  if(v.speed){text(`${58+Math.floor(Math.sin(now*.3)*6)} km/h`,m,m+u*.05,u*.05,'#f2efe8');text('51.5072 N  0.1276 W',w-m,h-m,u*.028,'#f2efe8','right',500);}
  if(v.scale){const bx=w-m-u*.035,by=h*.2,bh=h*.6,gr=g.createLinearGradient(0,by+bh,0,by);['#1a0b4a','#8c1d5a','#e8591e','#ffd26b','#fff7e0'].forEach((c,i)=>gr.addColorStop(i/4,c));
    g.fillStyle=gr;g.fillRect(bx,by,u*.035,bh);text('42.0',bx-u*.012,by+u*.026,u*.028,'#f2efe8','right');text('12.0',bx-u*.012,by+bh,u*.028,'#f2efe8','right');text(`${(36+Math.sin(now*.7)*1.4).toFixed(1)}°C`,w/2,h/2-u*.09,u*.032,'#f2efe8','center');}
  if(v.live){g.fillStyle='#56d06a';g.beginPath();g.arc(m+u*.012,m+u*.022,u*.011,0,7);g.fill();text('LIVE',m+u*.035,m+u*.034,u*.032,'#f2efe8');text('320×240',w-m,h-m,u*.028,'#f2efe8','right',500);}
  if(v.flip){for(let i=0;i<4;i++){g.fillStyle=i<3?'#f2efe8':'rgba(242,239,232,.3)';const bh=u*.012*(i+1);g.fillRect(m+i*u*.016,m+u*.04-bh,u*.01,bh);}
    battery(w-m-u*.075,m+u*.008,u*.07,u*.034,.7);text('Menu',m,h-m,u*.04,'#f2efe8','left',500);text('Back',w-m,h-m,u*.04,'#f2efe8','right',500);}
  if(v.link){text(`LINK ${87+Math.floor(Math.sin(now*.9)*5)}%`,m,m+u*.04,u*.036,'#f2efe8');text('SAT 7 · KU',w-m,m+u*.04,u*.03,'#f2efe8','right',500);}
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
