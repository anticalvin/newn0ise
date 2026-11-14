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

  /* ---- named recipes: whole stacks that open on a sample and stay editable ---- */
  const RECIPES=[
    {name:'Night evidence',note:'Two takes combined, then a contact sheet through a security camera',layers:[['doubletake',{mode:1,mix:90}],['contactstrip',{n:6,every:1.2}],['camsim','cctv']]},
    {name:'Paper monument',note:'Cut paper with a blind-embossed edge',layers:[['cutpaper',{n:6,sh:70}],['blindemboss',{depth:25,keep:70,grain:30}]]},
    {name:'Moving tapestry',note:'A slit-scan strip woven into threads',layers:[['photofinish',{spd:3}],['loom',{w:8,weave:80}]]},
    {name:'Future relic',note:'Thread-drawn emboss on old film',layers:[['blindemboss',{depth:70,ang:200}],['plotter',{sp:8,auto:true}],['camsim','expired']]},
    {name:'Memory exhibition',note:'A held first shot beside the present, on a contact sheet',layers:[['doubletake',{mode:3}],['contactstrip',{n:4,every:1.5}]]},
    {name:'Impossible window',note:'Time woven through a slow scan',layers:[['loom',{w:14,lag:85}],['scanner',{per:8,bw:10}]]}];
  return {RECIPES};
}
