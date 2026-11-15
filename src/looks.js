/* Image-making processes and camera behaviours. Each look is a module with its own behaviour, three main controls (the first three marked hero)
   and a default that already looks good. The ones that remember (Photo Finish, Scanner Bed, Contact Strip, Double Take) keep one stored frame
   like Datamosh and reset on any seek, loop or export start, so a given time always renders the same way. */
export function installLooks(c){
  const {defineModule,SS,histBind,histSave,histRT,PR,samp,bindRT,draw,ST}=c;
  const jump={};   // per module: last time, to detect seeks and export starts
  const resetFlag=(id,ctx)=>{const j=jump[id]||(jump[id]={t:-1e9,clean:false});const r=ctx.t<j.t-1e-4||ctx.t-j.t>.5||(ST.clean&&!j.clean);j.t=ctx.t;j.clean=!!ST.clean;return r;};
  const PREV='uniform sampler2D u_prev;uniform float u_reset;\n';

  /* ---- cameras that build an image over time ---- */
  defineModule({id:'photofinish',family:'Time',name:'Photo Finish',
    params:[{k:'pos',label:'Slit position',min:0,max:100,def:50,sec:'Slit',hero:true},{k:'spd',label:'Speed',min:1,max:8,def:3,step:1,sec:'Slit',hero:true},{k:'sw',label:'Slit width',min:1,max:12,def:2,step:1,sec:'Slit',hero:true},
      {k:'dir',t:'c',label:'Direction',opts:['Scrolls left','Scrolls up'],def:0,sec:'Advanced'}],
    hist:true,
    frag:SS+PREV+`
vec4 fx(vec2 uv){
  bool v=u_dir>.5;vec2 p=v?uv.yx:uv;float n=v?uRes.y:uRes.x;
  float sw=floor(u_sw)/n,sp=floor(u_spd)/n;vec3 c;
  if(p.x>1.-sw){vec2 q=vec2(u_pos/100.,p.y);c=texture(uSrc,v?q.yx:q).rgb;}
  else{vec2 q=vec2(p.x+sp,p.y);c=texture(u_prev,clamp(v?q.yx:q,0.,1.)).rgb;}
  if(u_reset>.5)c=texture(uSrc,uv).rgb;
  return vec4(c,1.);}`,
    bind(pr,V,ctx){pr.f('u_reset',resetFlag('photofinish',ctx)?1:0);histBind(pr,'photofinish',ctx);},after(pr,V,ctx){histSave('photofinish',ctx);}});

  defineModule({id:'scanner',family:'Time',name:'Scanner Bed',
    params:[{k:'per',label:'Scan time (s)',min:1,max:20,def:6,step:.5,sec:'Scan',hero:true},{k:'bw',label:'Bar width',min:1,max:30,def:6,sec:'Scan',hero:true},{k:'glow',label:'Light',min:0,max:100,def:60,sec:'Scan',hero:true},
      {k:'dir',t:'c',label:'Direction',opts:['Top to bottom','Left to right'],def:0,sec:'Advanced'}],
    hist:true,
    frag:SS+PREV+`
vec4 fx(vec2 uv){
  bool v=u_dir>.5;vec2 p=v?uv.yx:uv;
  float ph=fract(uTime/max(.5,u_per)),bw=u_bw/100.*.5+.003,d=(1.-p.y)-ph;
  float inBar=step(abs(d),bw*.5);
  vec3 live=texture(uSrc,uv).rgb,old=texture(u_prev,uv).rgb;
  vec3 c=mix(old,live,inBar);
  if(u_reset>.5)c=vec3(.015);
  float line=exp(-pow(d/.004,2.));
  c+=vec3(.82,1.,.9)*line*u_glow/100.*.9*inBar;
  return vec4(c,1.);}`,
    bind(pr,V,ctx){pr.f('u_reset',resetFlag('scanner',ctx)?1:0);histBind(pr,'scanner',ctx);},after(pr,V,ctx){histSave('scanner',ctx);}});

  const STRIP={};
  defineModule({id:'contactstrip',family:'Time',name:'Contact Strip',
    params:[{k:'n',label:'Frames',min:2,max:12,def:6,step:1,sec:'Sheet',hero:true},{k:'every',label:'Spacing (s)',min:.2,max:4,def:1,step:.1,sec:'Sheet',hero:true},{k:'gap',label:'Frame gap',min:0,max:40,def:12,sec:'Sheet',hero:true}],
    hist:true,
    frag:SS+PREV+`uniform float u_tick;
vec4 fx(vec2 uv){
  float N=floor(u_n+.5),asp=uRes.x/uRes.y;
  float cols=min(N,max(1.,floor(sqrt(N*asp)+.5))),rows=ceil(N/cols);vec2 g=vec2(cols,rows);
  vec2 tv=vec2(uv.x,1.-uv.y)*g;vec2 cell=floor(tv),l=fract(tv);l.y=1.-l.y;
  float i=cell.y*cols+cell.x;vec3 paper=vec3(.035,.035,.04);
  if(i>=N)return vec4(paper,1.);
  float cAsp=(uRes.x/cols)/(uRes.y/rows);vec2 fit=cAsp>asp?vec2(asp/cAsp,1.):vec2(1.,cAsp/asp);
  vec2 lg=(l-.5)/(fit*(1.-u_gap/100.*.4))+.5;
  if(any(lessThan(lg,vec2(0.)))||any(greaterThan(lg,vec2(1.))))return vec4(paper,1.);
  vec3 col;
  if(i>=N-1.||u_reset>.5)col=texture(uSrc,lg).rgb;
  else{vec2 cs=u_tick>.5?vec2(mod(i+1.,cols),floor((i+1.)/cols)):cell;
    col=texture(u_prev,vec2((cs.x+l.x)/cols,1.-(cs.y+1.-l.y)/rows)).rgb;}
  return vec4(col*(1.-.25*smoothstep(.55,1.,length(lg-.5)*1.6)),1.);}`,
    bind(pr,V,ctx){const rs=resetFlag('contactstrip',ctx),k=Math.floor(ctx.t/Math.max(.2,V.every));const tick=!rs&&STRIP.k!=null&&k>STRIP.k;STRIP.k=k;
      pr.f('u_reset',rs?1:0);pr.f('u_tick',tick?1:0);histBind(pr,'contactstrip',ctx);},after(pr,V,ctx){histSave('contactstrip',ctx);}});

  /* Double Take: a held first shot combined with the live picture. Change "Take again" to capture a new first shot. */
  const DT={has:false,last:null,grab:false};
  defineModule({id:'doubletake',family:'Time',name:'Double Take',
    params:[{k:'mode',t:'c',label:'Combine',opts:['Highlights','Shadows','Difference','Split','Cutout'],def:0,sec:'Take',hero:true},{k:'mix',label:'Held shot',min:0,max:100,def:80,sec:'Take',hero:true},{k:'edge',label:'Split / cut point',min:0,max:100,def:50,sec:'Take',hero:true},
      {k:'ax',label:'Align left–right',min:-30,max:30,def:0,sec:'Advanced'},{k:'ay',label:'Align up–down',min:-30,max:30,def:0,sec:'Advanced'},{k:'again',t:'b',label:'Take again (tick to capture)',def:false,sec:'Advanced'}],
    hist:true,
    frag:SS+`uniform sampler2D u_prev;uniform float u_has;
vec4 fx(vec2 uv){
  vec3 b=texture(uSrc,uv).rgb;if(u_has<.5)return vec4(b,1.);
  vec3 a=texture(u_prev,clamp(uv-vec2(u_ax,u_ay)/100.,0.,1.)).rgb;float m=u_mix/100.,e=u_edge/100.;vec3 r;
  if(u_mode<.5)r=max(a,b);else if(u_mode<1.5)r=min(a,b);else if(u_mode<2.5)r=abs(a-b)*1.4;
  else if(u_mode<3.5){float w=smoothstep(e-.01,e+.01,uv.x);r=mix(a,b,w);m=1.;}
  else{float k=smoothstep(e-.08,e+.08,luma(b));r=mix(a,b,k);m=1.;}
  return vec4(mix(b,r,m),1.);}`,
    bind(pr,V,ctx){if(DT.last===null)DT.last=V.again;DT.grab=!DT.has||V.again!==DT.last;DT.last=V.again;pr.f('u_has',DT.has?1:0);histBind(pr,'doubletake',ctx);},
    after(pr,V,ctx){if(!DT.grab||!ctx.inTex)return;const cp=PR.copy;bindRT(histRT('doubletake',ctx.W,ctx.H));cp.use();samp(cp,'uT',0,ctx.inTex);draw();DT.has=true;DT.grab=false;}});

  /* ---- image-making processes ---- */
  defineModule({id:'blindemboss',family:'Print',name:'Blind Emboss',
    params:[{k:'depth',label:'Relief depth',min:0,max:100,def:55,sec:'Paper',hero:true},{k:'ang',label:'Light angle',min:0,max:360,def:135,step:5,sec:'Paper',hero:true},{k:'el',label:'Light height',min:10,max:80,def:38,sec:'Paper',hero:true},
      {k:'soft',label:'Softness',min:0,max:100,def:30,sec:'Advanced'},{k:'keep',label:'Keep colour',min:0,max:100,def:0,sec:'Advanced'},{k:'grain',label:'Paper grain',min:0,max:100,def:45,sec:'Advanced'},{k:'paper',t:'color',label:'Paper',def:'#efe9dd',sec:'Advanced'}],
    frag:SS+`
float hgt(vec2 uv,vec2 d){return luma(texture(uSrc,uv).rgb)*.4+(luma(texture(uSrc,uv+d).rgb)+luma(texture(uSrc,uv-d).rgb)+luma(texture(uSrc,uv+vec2(-d.y,d.x)).rgb)+luma(texture(uSrc,uv-vec2(-d.y,d.x)).rgb))*.15;}
vec4 fx(vec2 uv){
  vec2 px=1./uRes;float r=(1.+u_soft/100.*3.)*S;vec2 d=px*r;
  float hx=hgt(uv+vec2(d.x,0.),d)-hgt(uv-vec2(d.x,0.),d),hy=hgt(uv+vec2(0.,d.y),d)-hgt(uv-vec2(0.,d.y),d);
  vec3 n=normalize(vec3(-hx,-hy,.5/max(.05,u_depth/100.*4.)/(1.+r*.15)*.35));
  float a=radians(u_ang),e=radians(u_el);vec3 L=normalize(vec3(cos(a)*cos(e),sin(a)*cos(e),sin(e)));
  float lam=dot(n,L),flt=L.z;
  vec3 base=mix(u_paper,u_paper*texture(uSrc,uv).rgb*1.6,u_keep/100.);
  vec3 col=base*(.62+.9*(lam-flt)+.38);
  col=paperLook(uv*uRes,col,u_grain/100.,u_grain/100.*.6);
  return vec4(clamp(col,0.,1.),1.);}`});

  defineModule({id:'cutpaper',family:'Print',name:'Cut Paper',
    params:[{k:'n',label:'Layers',min:3,max:9,def:5,step:1,sec:'Stack',hero:true},{k:'sh',label:'Shadow depth',min:0,max:100,def:60,sec:'Stack',hero:true},{k:'ang',label:'Light angle',min:0,max:360,def:315,step:5,sec:'Stack',hero:true},
      {k:'wob',label:'Edge wobble',min:0,max:100,def:35,sec:'Advanced'},{k:'tone',label:'Colour from image',min:0,max:100,def:80,sec:'Advanced'},{k:'grain',label:'Paper grain',min:0,max:100,def:50,sec:'Advanced'}],
    frag:SS+`
float lyr(vec2 uv,vec2 px){
  vec3 c=texture(uSrc,uv).rgb*.4+(texture(uSrc,uv+vec2(px.x,0.)).rgb+texture(uSrc,uv-vec2(px.x,0.)).rgb+texture(uSrc,uv+vec2(0.,px.y)).rgb+texture(uSrc,uv-vec2(0.,px.y)).rgb)*.15;
  float l=luma(c)+(fbm(uv*uRes/(26.*S)+uSeed)-.5)*u_wob/100.*.5;
  return floor(clamp(l,0.,.999)*u_n);}
vec4 fx(vec2 uv){
  vec2 px=6.*S/uRes;float N=floor(u_n+.5),Lc=lyr(uv,px);
  vec2 dir=vec2(cos(radians(u_ang)),sin(radians(u_ang)));
  float sh=0.;for(int i=1;i<=3;i++){float o=float(i)/3.;float Lo=lyr(uv+dir*px*o*3.5*(.5+u_sh/100.),px);sh=max(sh,step(Lc+.5,Lo)*(1.-o*.55));}
  vec3 src=texture(uSrc,uv).rgb;float lm=(Lc+.5)/N;
  vec3 flc=src*(lm/max(.05,luma(src)));vec3 grey=vec3(lm);
  vec3 col=mix(grey*vec3(.95,.92,.86),flc,u_tone/100.)*(.6+.55*lm);
  col*=1.-sh*u_sh/100.*.7;
  float up=step(Lc+.5,lyr(uv-dir*px*.8,px)+.0)*0.;
  col=paperLook(uv*uRes,col,u_grain/100.,u_grain/100.*.7);
  return vec4(clamp(col,0.,1.),1.);}`});

  defineModule({id:'plotter',family:'Print',name:'Thread Plotter',
    params:[{k:'sp',label:'Line spacing',min:4,max:30,def:11,step:1,sec:'Plot',hero:true},{k:'amp',label:'Wave height',min:0,max:100,def:55,sec:'Plot',hero:true},{k:'prog',label:'Drawn so far',min:0,max:100,def:100,sec:'Plot',hero:true},
      {k:'auto',t:'b',label:'Draw on, then repeat',def:false,sec:'Advanced'},{k:'dur',label:'Draw time (s)',min:2,max:30,def:10,sec:'Advanced'},{k:'th',label:'Thread weight',min:30,max:200,def:90,sec:'Advanced'},
      {k:'ink',t:'color',label:'Thread',def:'#161412',sec:'Advanced'},{k:'bg',t:'color',label:'Paper',def:'#efe9dd',sec:'Advanced'},{k:'tone',label:'Colour from image',min:0,max:100,def:0,sec:'Advanced'}],
    frag:SS+`
vec4 fx(vec2 uv){
  vec2 px=uv*uRes;float sp=max(3.,u_sp*S),n=uRes.y/sp,li=floor(px.y/sp);
  float prog=u_auto>.5?fract(uTime/max(2.,u_dur)):u_prog/100.;float head=prog*(n+1.);
  float ink=0.,hd=0.;vec3 ic=u_ink;
  for(int k=-2;k<=2;k++){float i=li+float(k);if(i<0.||i>=n)continue;float yc=(i+.5)*sp;
    vec3 s=texture(uSrc,vec2(uv.x,yc/uRes.y)).rgb;float l=luma(s);
    float y=yc+(.5-l)*u_amp/100.*sp*2.6;float d=abs(px.y-y);
    float t=(.35+1.1*(1.-l))*u_th/100.*S;float v=1.-smoothstep(t-.5,t+.6,d);
    float pos=i+(mod(i,2.)<1.?uv.x:1.-uv.x);float drawn=smoothstep(head,head-.04,pos);
    if(v*drawn>ink){ink=v*drawn;ic=mix(u_ink,s*.85,u_tone/100.);}
    hd=max(hd,v*(1.-smoothstep(0.,.08,abs(pos-head))));}
  vec3 col=mix(u_bg,ic,ink);col+=vec3(1.,.55,.25)*hd*.5*step(prog,.999)*step(.001,prog);
  return vec4(col,1.);}`});

  /* ---- 2010s phone and film habits: leaks, miniature focus, dust, cross-processing, panorama mistakes, burst trails ---- */
  const H21='float lkH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n';

  defineModule({id:'lightleak',family:'Film',name:'Light Leak',
    params:[{k:'amt',label:'Strength',min:0,max:100,def:55,sec:'Leak',hero:true},{k:'spd',label:'Drift speed',min:0,max:100,def:25,sec:'Leak',hero:true},{k:'warm',label:'Warmth',min:0,max:100,def:55,sec:'Leak',hero:true},
      {k:'haze',label:'Edge haze',min:0,max:100,def:50,sec:'Advanced'}],
    frag:SS+`
vec4 fx(vec2 uv){
  vec3 c=texture(uSrc,uv).rgb;float t=uTime*(.02+u_spd/100.*.12);
  vec2 p1=vec2(1.05+.1*sin(t*3.1),.3+.35*sin(t*1.7)),p2=vec2(-.05+.08*sin(t*2.3),.75+.25*sin(t*1.1+1.));
  float d1=length((uv-p1)*vec2(1.,1.6)),d2=length((uv-p2)*vec2(1.,1.3));
  float l=exp(-d1*d1*5.)+.7*exp(-d2*d2*7.);
  l+=.2*fbm(uv*3.+t)*u_haze/100.*smoothstep(.2,1.,max(abs(uv.x-.5),abs(uv.y-.5))*2.);
  vec3 w=mix(vec3(.9,.18,.06),vec3(1.,.8,.45),clamp(l,0.,1.)*(.4+u_warm/100.*.6));
  vec3 leak=clamp(w*l*u_amt/100.*1.2,0.,1.);
  return vec4(1.-(1.-c)*(1.-leak),1.);}`});

  defineModule({id:'tiltshift',family:'Optical',name:'Tilt Shift',
    params:[{k:'pos',label:'Focus line',min:0,max:100,def:50,sec:'Focus',hero:true},{k:'band',label:'Sharp band',min:5,max:60,def:20,sec:'Focus',hero:true},{k:'blur',label:'Blur',min:0,max:100,def:60,sec:'Focus',hero:true},
      {k:'sat',label:'Miniature colour',min:0,max:100,def:35,sec:'Advanced'},{k:'tilt',label:'Tilt angle',min:-45,max:45,def:0,sec:'Advanced'}],
    frag:SS+`
vec4 fx(vec2 uv){
  float a=radians(u_tilt);vec2 q=uv-.5;float y=q.x*sin(a)+q.y*cos(a)+.5;
  float d=abs(y-u_pos/100.);float k=smoothstep(u_band/200.,u_band/200.+.35,d);
  float r=k*u_blur/100.*14.*S;vec3 acc=vec3(0.);
  for(int i=0;i<16;i++){float g=float(i)*2.39996,rr=sqrt((float(i)+.5)/16.)*r;acc+=texture(uSrc,uv+vec2(cos(g),sin(g))*rr/uRes).rgb;}
  vec3 c=acc/16.;float l=luma(c);c=mix(vec3(l),c,1.+u_sat/100.*.8);c=(c-.5)*(1.+u_sat/100.*.15)+.5;
  return vec4(clamp(c,0.,1.),1.);}`});

  defineModule({id:'dusthair',family:'Film',name:'Dust and Hair',
    params:[{k:'dust',label:'Dust',min:0,max:100,def:40,sec:'Scan',hero:true},{k:'hair',label:'Hairs',min:0,max:100,def:25,sec:'Scan',hero:true},{k:'flick',label:'Flicker',min:0,max:100,def:40,sec:'Scan',hero:true}],
    frag:SS+H21+`
vec4 fx(vec2 uv){
  vec3 c=texture(uSrc,uv).rgb;float fr=floor(uTime*mix(.8,6.,u_flick/100.));
  vec2 g=uv*uRes/(18.*S),id=floor(g),f=fract(g)-.5;float r=lkH(id+fr*7.13+uSeed);
  float on=step(1.-u_dust/100.*.05,r);vec2 o=(vec2(lkH(id+3.1),lkH(id+9.7))-.5)*.5;float sz=.04+lkH(id+5.)*.1;
  float sp=on*smoothstep(sz,sz*.4,length(f-o)),br=step(.5,lkH(id+2.));
  vec2 hg=uv*uRes/(220.*S),hid=floor(hg),hf=fract(hg);float hr=lkH(hid+floor(uTime*.3+lkH(hid)*5.)*3.7);
  float hon=step(1.-u_hair/100.*.12,hr),ang=lkH(hid+1.)*6.28;vec2 q=hf-.5;
  float cr=dot(q,vec2(cos(ang),sin(ang))),al=dot(q,vec2(-sin(ang),cos(ang)));
  float hair=hon*(1.-smoothstep(.0,.012,abs(al+.25*cr*cr)))*step(abs(cr),.4);
  c=mix(c,vec3(br),clamp(sp*.8,0.,1.));c=mix(c,vec3(.03),hair*.7);
  return vec4(c,1.);}`});

  defineModule({id:'crosscurve',family:'Film',name:'Cross Process',
    params:[{k:'sh',label:'Shadow tint',min:0,max:100,def:55,sec:'Curves',hero:true},{k:'hi',label:'Highlight tint',min:0,max:100,def:45,sec:'Curves',hero:true},{k:'con',label:'Contrast',min:0,max:100,def:40,sec:'Curves',hero:true},
      {k:'sat',label:'Colour',min:0,max:100,def:60,sec:'Advanced'}],
    frag:SS+`
vec4 fx(vec2 uv){
  vec3 c=texture(uSrc,uv).rgb;float k=u_con/100.;
  vec3 o=vec3(mix(c.r,smoothstep(0.,1.,c.r)*1.08-.02,k*1.2),mix(c.g,smoothstep(0.,1.,c.g),k*.5),mix(c.b,c.b*.8+.12,k));
  float l=luma(o);o+=vec3(0.,.07,.08)*u_sh/100.*(1.-l)+vec3(.1,.07,-.06)*u_hi/100.*l;
  o=mix(vec3(luma(o)),o,.8+u_sat/100.*.7);
  return vec4(clamp(o,0.,1.),1.);}`});

  defineModule({id:'panosweep',family:'Time',name:'Panorama Mistake',
    params:[{k:'shift',label:'Seam shift',min:0,max:100,def:35,sec:'Stitch',hero:true},{k:'seams',label:'Seams',min:2,max:12,def:5,step:1,sec:'Stitch',hero:true},{k:'wob',label:'Wobble',min:0,max:100,def:40,sec:'Stitch',hero:true}],
    frag:SS+`
vec4 fx(vec2 uv){
  float N=floor(u_seams+.5),bi=floor(uv.x*N),t=uTime*.4;
  float r1=fract(sin(bi*12.9898)*43758.5453),r2=fract(sin(bi*78.233)*12345.6789);
  float f=fract(uv.x*N);
  vec2 o=vec2((r1-.5)*u_shift/100.*.12*sin(t+r2*6.28),sin(t*.8+bi)*u_wob/100.*.03*(r2-.5)*2.);
  float seam=smoothstep(0.,.05,f)*smoothstep(1.,.95,f);
  vec3 a=texture(uSrc,uv+o).rgb,g=texture(uSrc,uv-o*1.6).rgb;
  return vec4(mix(g,a,.5+.5*seam),1.);}`});

  defineModule({id:'bursttrail',family:'Time',name:'Burst Trail',
    params:[{k:'len',label:'Trail length',min:0,max:100,def:70,sec:'Trail',hero:true},{k:'dx',label:'Drift across',min:-20,max:20,def:0,step:1,sec:'Trail',hero:true},{k:'dy',label:'Drift up',min:-20,max:20,def:0,step:1,sec:'Trail',hero:true},
      {k:'tint',label:'Warm tint',min:0,max:100,def:40,sec:'Advanced'}],
    hist:true,
    frag:SS+PREV+`
vec4 fx(vec2 uv){
  vec3 live=texture(uSrc,uv).rgb;vec2 d=vec2(u_dx,u_dy)/uRes*3.*S;
  vec3 p=texture(u_prev,clamp(uv+d,0.,1.)).rgb;float dec=.8+u_len/100.*.19;
  vec3 c=max(live,p*dec*mix(vec3(1.),vec3(1.,.96,.88),u_tint/100.));
  if(u_reset>.5)c=live;
  return vec4(c,1.);}`,
    bind(pr,V,ctx){pr.f('u_reset',resetFlag('bursttrail',ctx)?1:0);histBind(pr,'bursttrail',ctx);},after(pr,V,ctx){histSave('bursttrail',ctx);}});

  defineModule({id:'focushunt',family:'Optical',name:'Focus Hunt',
    params:[{k:'depth',label:'Max blur',min:0,max:100,def:55,sec:'Lens',hero:true},{k:'rate',label:'Hunt speed',min:0,max:100,def:30,sec:'Lens',hero:true},{k:'bright',label:'Bokeh highlights',min:0,max:100,def:40,sec:'Lens',hero:true}],
    frag:SS+`
vec4 fx(vec2 uv){
  float t=uTime*(.15+u_rate/100.*.8);
  float hunt=smoothstep(0.,1.,.5+.5*sin(t))*smoothstep(0.,1.,.5+.5*sin(t*.37+1.));
  uv=(uv-.5)*(1.-hunt*.012)+.5;
  float r=hunt*u_depth/100.*16.*S;vec3 acc=vec3(0.);float ws=0.;
  for(int i=0;i<24;i++){float g=float(i)*2.39996,rr=sqrt((float(i)+.5)/24.)*r;
    vec3 s=texture(uSrc,uv+vec2(cos(g),sin(g))*rr/uRes).rgb;float w=1.+u_bright/100.*pow(luma(s),3.)*5.;acc+=s*w;ws+=w;}
  return vec4(acc/ws,1.);}`});

  defineModule({id:'overcook',family:'Light',name:'Overcooked HDR',
    params:[{k:'detail',label:'Detail',min:0,max:100,def:60,sec:'Tone',hero:true},{k:'sat',label:'Colour',min:0,max:100,def:45,sec:'Tone',hero:true},{k:'glow',label:'Halo',min:0,max:100,def:30,sec:'Tone',hero:true}],
    frag:SS+`
vec4 fx(vec2 uv){
  vec3 c=texture(uSrc,uv).rgb;vec2 px=1./uRes;float R=(10.+u_glow/100.*14.)*S;vec3 b=c;
  for(int i=0;i<8;i++){float a=float(i)*.7854;vec2 d=vec2(cos(a),sin(a))*px;b+=texture(uSrc,uv+d*R).rgb+texture(uSrc,uv+d*R*2.).rgb;}
  b/=17.;vec3 o=c+(c-b)*u_detail/100.*2.6;
  o=mix(vec3(luma(o)),o,1.+u_sat/100.*.9);o=pow(clamp(o,0.,1.),vec3(.92));o+=b*u_glow/100.*.12;
  return vec4(clamp(o,0.,1.),1.);}`});

  defineModule({id:'anamorph',family:'Light',name:'Anamorphic Streak',
    params:[{k:'len',label:'Streak length',min:0,max:100,def:60,sec:'Flare',hero:true},{k:'thr',label:'Threshold',min:40,max:95,def:70,sec:'Flare',hero:true},{k:'tint',label:'Cool tint',min:0,max:100,def:40,sec:'Flare',hero:true}],
    frag:SS+`
vec4 fx(vec2 uv){
  vec3 c=texture(uSrc,uv).rgb;float L=u_len/100.*.45,th=u_thr/100.;vec3 acc=vec3(0.);float ws=0.;
  for(int i=-16;i<=16;i++){float f=float(i)/16.;vec3 s=texture(uSrc,uv+vec2(f*L,0.)).rgb;
    float h=max(0.,luma(s)-th)/(1.-th+.001),w=exp(-f*f*3.);acc+=s*h*w;ws+=w;}
  acc/=ws;vec3 tn=mix(vec3(1.),vec3(.55,.72,1.),u_tint/100.);
  return vec4(1.-(1.-c)*(1.-clamp(acc*tn*1.4,0.,1.)),1.);}`});

  defineModule({id:'instantframe',family:'Film',name:'Instant Frame',
    params:[{k:'bord',label:'Border',min:0,max:100,def:40,sec:'Frame',hero:true},{k:'tilt',label:'Tilt',min:0,max:100,def:60,sec:'Frame',hero:true},{k:'fade',label:'Instant fade',min:0,max:100,def:40,sec:'Frame',hero:true}],
    frag:SS+`
float sdb(vec2 p,vec2 h){vec2 d=abs(p)-h;return length(max(d,vec2(0.)))+min(max(d.x,d.y),0.);}
vec4 fx(vec2 uv){
  float asp=uRes.x/uRes.y;float a=radians((u_tilt/100.-.5)*8.);
  vec2 q=(uv-.5)*vec2(asp,1.);q=mat2(cos(a),-sin(a),sin(a),cos(a))*q;
  float s=.74,m=.03+u_bord/100.*.05,ex=m*2.2;
  vec2 ph=vec2(asp,1.)*.5*s;float pcy=(ex-m)*.5;
  vec2 paperC=vec2(0.,pcy-ex*.5+m*.5),paperH=vec2(ph.x+m,ph.y+(m+ex)*.5);
  vec3 table=vec3(.1,.095,.09)+.02*fbm(uv*6.);
  float sd=sdb(q-paperC-vec2(.012,-.016),paperH);table*=1.-.5*(1.-smoothstep(0.,.05,sd));
  float dp=sdb(q-paperC,paperH);
  vec2 pq=q-vec2(0.,pcy);
  if(abs(pq.x)<ph.x&&abs(pq.y)<ph.y){
    vec3 c=texture(uSrc,pq/(2.*ph)+.5).rgb;float f=u_fade/100.;
    c=mix(c,c*.86+vec3(.07,.06,.05),f);c=mix(c,c*vec3(1.05,1.,.9),f*.6);
    float e=smoothstep(.0,.03,min(ph.x-abs(pq.x),ph.y-abs(pq.y)));c*=.9+.1*e;
    return vec4(c,1.);}
  if(dp<0.){vec3 paper=vec3(.93,.91,.86)*(.97+.03*fbm(uv*40.));return vec4(paper,1.);}
  return vec4(table,1.);}`});

  /* ---- projector, tape and instant-film habits ---- */
  const TH='float tH(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\n';

  defineModule({id:'halation',family:'Film',name:'Halation',
    params:[{k:'amt',label:'Strength',min:0,max:100,def:60,sec:'Glow',hero:true},{k:'rad',label:'Spread',min:0,max:100,def:50,sec:'Glow',hero:true},{k:'thr',label:'Threshold',min:40,max:95,def:65,sec:'Glow',hero:true}],
    frag:SS+`
vec4 fx(vec2 uv){
  vec3 c=texture(uSrc,uv).rgb;vec2 px=1./uRes;float R=(6.+u_rad/100.*26.)*S;vec3 acc=vec3(0.);
  for(int i=0;i<16;i++){float g=float(i)*2.39996,rr=sqrt((float(i)+.5)/16.)*R;vec3 s=texture(uSrc,uv+vec2(cos(g),sin(g))*rr*px).rgb;acc+=s*smoothstep(u_thr/100.,1.,luma(s));}
  acc/=16.;vec3 hal=vec3(acc.r*1.6,acc.g*.45,acc.b*.15)*u_amt/100.*2.;
  return vec4(1.-(1.-c)*(1.-clamp(hal,0.,1.)),1.);}`});

  defineModule({id:'tapewobble',family:'Signal / CRT',name:'Tape Wobble',
    params:[{k:'wob',label:'Wobble',min:0,max:100,def:40,sec:'Tape',hero:true},{k:'drop',label:'Dropouts',min:0,max:100,def:30,sec:'Tape',hero:true},{k:'head',label:'Head noise',min:0,max:100,def:50,sec:'Tape',hero:true}],
    frag:SS+TH+`
vec4 fx(vec2 uv){
  float t=uTime;float w=(sin(uv.y*40.+t*3.)*.0015+sin(uv.y*7.-t*1.3)*.002)*u_wob/100.*3.;
  float band=smoothstep(.07,0.,uv.y);
  w+=band*(tH(vec2(floor(t*30.),floor(uv.y*240.)))-.5)*.08*u_head/100.;
  float ln=floor(uv.y*180.),dr=step(1.-u_drop/100.*.02,tH(vec2(ln,floor(t*12.))));
  vec3 c=vec3(texture(uSrc,vec2(uv.x+w+.0012,uv.y)).r,texture(uSrc,vec2(uv.x+w,uv.y)).g,texture(uSrc,vec2(uv.x+w-.0012,uv.y)).b);
  float xs=.2+tH(vec2(ln,3.))*.1,xe=xs+tH(vec2(ln,4.))*.5;
  c=mix(c,vec3(.9)*(.6+.4*tH(uv*uRes+t)),dr*.9*step(xs,uv.x)*step(uv.x,xe));
  c+=band*.05*tH(uv*uRes+t)*u_head/100.;
  return vec4(c,1.);}`});

  defineModule({id:'gateweave',family:'Film',name:'Projector Gate',
    params:[{k:'weave',label:'Gate weave',min:0,max:100,def:45,sec:'Projector',hero:true},{k:'flick',label:'Flicker',min:0,max:100,def:40,sec:'Projector',hero:true},{k:'scr',label:'Scratches',min:0,max:100,def:50,sec:'Projector',hero:true}],
    frag:SS+TH+`
vec4 fx(vec2 uv){
  float t=floor(uTime*18.);
  float jx=(tH(vec2(t,1.))-.5)*.006*u_weave/100.*3.,jy=(tH(vec2(t,2.))-.5)*.008*u_weave/100.*3.;
  vec3 c=texture(uSrc,uv+vec2(jx,jy)).rgb;c*=1.+(tH(vec2(t,3.))-.5)*.25*u_flick/100.;
  float sc=0.;
  for(int i=0;i<3;i++){float fi=float(i),x=tH(vec2(t+fi*7.,fi)),on=step(.55,tH(vec2(t,fi+9.))),w=abs(uv.x-x);
    sc+=on*(1.-smoothstep(0.,.0016,w))*step(tH(vec2(floor(uv.y*20.),t+fi)),.85);}
  c=mix(c,vec3(.95,.93,.85),clamp(sc*u_scr/100.,0.,.8));
  c*=1.-.7*pow(length((uv-.5)*vec2(1.2,1.)),2.);
  return vec4(c,1.);}`});

  defineModule({id:'rollshutter',family:'Warp',name:'Rolling Shutter',
    params:[{k:'amt',label:'Skew',min:0,max:100,def:50,sec:'Shake',hero:true},{k:'rate',label:'Shake rate',min:1,max:40,def:12,step:1,sec:'Shake',hero:true},{k:'jello',label:'Jello',min:0,max:100,def:35,sec:'Shake',hero:true}],
    frag:SS+`
vec4 fx(vec2 uv){
  float t=uTime,r=u_rate/10.;float sk=sin(t*r)*.5+sin(t*r*2.3)*.3;
  float x=uv.x+(uv.y-.5)*sk*u_amt/100.*.12+sin(uv.y*14.+t*r*3.)*u_jello/100.*.01;
  return texture(uSrc,vec2(x,uv.y));}`});

  defineModule({id:'sodium',family:'Color',name:'Sodium Night',
    params:[{k:'split',label:'Colour split',min:0,max:100,def:65,sec:'Grade',hero:true},{k:'crush',label:'Crush blacks',min:0,max:100,def:40,sec:'Grade',hero:true},{k:'sat',label:'Colour',min:0,max:100,def:55,sec:'Grade',hero:true}],
    frag:SS+`
vec4 fx(vec2 uv){
  vec3 c=texture(uSrc,uv).rgb;float l=luma(c);
  c=mix(c,c*mix(vec3(.55,.8,1.05),vec3(1.1,.9,.6),smoothstep(.2,.8,l)),u_split/100.);
  c=pow(max(c,vec3(0.)),vec3(1.+u_crush/100.*.7));
  c+=vec3(.04,.1,.16)*(1.-l)*.5*u_split/100.;
  c=mix(vec3(luma(c)),c,u_sat/100.*1.6+.2);
  return vec4(clamp(c,0.,1.),1.);}`});

  defineModule({id:'develop',family:'Film',name:'Develop',
    params:[{k:'dur',label:'Develop time (s)',min:2,max:12,def:5,step:.5,sec:'Print',hero:true},{k:'hold',label:'Hold (s)',min:1,max:10,def:3,step:.5,sec:'Print',hero:true},{k:'cast',label:'Early cast',min:0,max:100,def:60,sec:'Print',hero:true}],
    frag:SS+`
vec4 fx(vec2 uv){
  vec3 c=texture(uSrc,uv).rgb;float per=u_dur+u_hold,ph=fract(uTime/per)*per;
  float d=smoothstep(0.,1.,clamp(ph/u_dur,0.,1.)),m=pow(d,1.6);
  vec3 haze=mix(vec3(.55,.62,.6),vec3(.8,.82,.78),d)*(.7+.3*luma(c));
  vec3 dev=mix(haze,mix(vec3(luma(c)),c,m),m);
  dev*=mix(mix(vec3(1.),vec3(.8,1.,.95),u_cast/100.),vec3(1.),m);
  return vec4(clamp(dev,0.,1.),1.);}`});

  /* ---- named recipes: whole stacks that open on a sample and stay editable ---- */
  const RECIPES=[
    {name:'Night evidence',note:'Two takes combined, then a contact sheet through a security camera',layers:[['doubletake',{mode:1,mix:90}],['contactstrip',{n:6,every:1.2}],['camsim','cctv']]},
    {name:'Paper monument',note:'Cut paper with a blind-embossed edge',layers:[['cutpaper',{n:6,sh:70}],['blindemboss',{depth:25,keep:70,grain:30}]]},
    {name:'Moving tapestry',note:'A slit-scan strip woven into threads',layers:[['photofinish',{spd:3}],['loom',{w:8,weave:80}]]},
    {name:'Future relic',note:'Thread-drawn emboss on old film',layers:[['blindemboss',{depth:70,ang:200}],['plotter',{sp:8,auto:true}],['camsim','expired']]},
    {name:'Memory exhibition',note:'A held first shot beside the present, on a contact sheet',layers:[['doubletake',{mode:3}],['contactstrip',{n:4,every:1.5}]]},
    {name:'Sunday roll',note:'Cross-processed film with a leak and a bit of dust',layers:[['crosscurve',{}],['lightleak',{amt:50}],['dusthair',{}]]},
    {name:'Pocket miniature',note:'Tilt-shift focus under an over-processed HDR grade',layers:[['overcook',{}],['tiltshift',{}]]},
    {name:'Panorama mistake',note:'A sweep that did not stitch, with a warm leak',layers:[['panosweep',{}],['lightleak',{amt:35,warm:70}]]},
    {name:'Fast burst',note:'Trails from a burst of shots with a lens streak',layers:[['bursttrail',{len:75}],['anamorph',{}]]},
    {name:'Lens at night',note:'Focus hunting with streaks from the lights',layers:[['focushunt',{}],['anamorph',{thr:60,len:70}]]},
    {name:'Instant summer',note:'A faded instant print on a table, cross-processed',layers:[['crosscurve',{sh:30,hi:60}],['instantframe',{}],['dusthair',{dust:20,hair:10}]]},
    {name:'Projector night',note:'Home movie with halation, scratches and dust',layers:[['gateweave',{}],['halation',{}],['dusthair',{dust:25}]]},
    {name:'Tape hotel',note:'Sodium-lit street through worn tape',layers:[['sodium',{}],['tapewobble',{}]]},
    {name:'Phone jello',note:'Hand-held shake with a rolling shutter and a leak',layers:[['rollshutter',{}],['lightleak',{amt:30}]]},
    {name:'Developing',note:'An instant print that slowly comes up',layers:[['develop',{}],['instantframe',{}]]},
    {name:'Impossible window',note:'Time woven through a slow scan',layers:[['loom',{w:14,lag:85}],['scanner',{per:8,bw:10}]]}];
  return {RECIPES};
}
