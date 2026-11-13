/* Camera Body: one shader that models how real cameras get their look, in the order light meets them.
   lens (barrel, softness, lateral colour fringe, bloom, halation) -> gate and tape (weave, skew, jitter, head switching)
   -> sensor (virtual resolution, sharpening halos, chroma bleed, noise, hot pixels, row banding)
   -> exposure (auto-exposure pumping, flash falloff, highlight shoulder) -> tone and colour -> bit depth and block compression
   -> film (dust, scratches, light leak, flicker) -> display (scanlines, interlace comb, thermal palette).
   Every control is neutral at its default, so a camera body is just a list of the things that body does. */
const R=(k,label,min,max,def,sec,extra)=>({k,label,min,max,def,sec,...extra});
const C=(k,label,def,sec)=>({k,t:'color',label,def,sec});
export const CAMSIM_PARAMS=[
  R('amt','Strength',0,200,100,'Body',{hero:true}),R('seed2','Variation',0,99,0,'Body'),
  R('zoom','Digital zoom',1,8,1,'Lens',{step:.1}),R('barrel','Barrel distortion',-60,100,0,'Lens'),R('soft','Softness',0,100,0,'Lens',{hero:true}),R('ca','Colour fringe',0,100,0,'Lens'),
  R('bloom','Bloom',0,100,0,'Lens'),R('bsize','Bloom size',0,100,40,'Lens'),R('bthr','Bloom threshold',0,100,60,'Lens'),C('btint','Bloom tint','#ffffff','Lens'),
  R('halo','Halation',0,100,0,'Lens'),R('vig','Vignette',0,100,0,'Lens'),R('tube','Tube mask',0,100,0,'Lens'),
  R('res','Sensor lines',60,1080,1080,'Sensor',{step:10,hero:true}),R('sharp','Sharpening halos',0,100,0,'Sensor'),
  R('cbleed','Chroma bleed',0,100,0,'Sensor'),R('cshift','Chroma shift',-100,100,0,'Sensor'),
  R('noise','Noise',0,100,0,'Sensor',{hero:true}),R('gsize','Grain size',1,6,1.5,'Sensor',{step:.5}),R('cnoise','Colour noise',0,100,0,'Sensor'),
  R('band','Row banding',0,100,0,'Sensor'),R('hot','Hot pixels',0,100,0,'Sensor'),
  R('ev','Exposure',-100,100,0,'Exposure'),R('pump','Auto-exposure pump',0,100,0,'Exposure'),R('flash','Flash falloff',0,100,0,'Exposure'),
  R('shoulder','Highlight shoulder',0,100,0,'Exposure'),
  R('contrast','Contrast',-100,100,0,'Tone'),R('gamma','Midtones',-100,100,0,'Tone'),R('lift','Lifted blacks',0,100,0,'Tone'),C('lcol','Black tint','#808080','Tone'),
  R('temp','Warmth',-100,100,0,'Colour'),R('tint','Green / magenta',-100,100,0,'Colour'),R('sat','Saturation',0,250,100,'Colour'),R('mono','Black and white',0,100,0,'Colour'),C('cast','Colour cast','#ffffff','Colour'),R('castamt','Cast amount',0,100,0,'Colour'),
  R('heat','Thermal palette',0,100,0,'Colour'),
  R('bits','Bit depth',2,8,8,'Digital',{step:.5}),R('blocks','Compression blocks',0,100,0,'Digital'),
  R('weave','Gate weave',0,100,0,'Tape and gate'),R('skew','Rolling skew',0,100,0,'Tape and gate'),R('jitter','Line jitter',0,100,0,'Tape and gate'),R('head','Head switching',0,100,0,'Tape and gate'),
  R('comb','Interlace comb',0,100,0,'Tape and gate'),R('scan','Scanlines',0,100,0,'Tape and gate'),
  R('dust','Dust',0,100,0,'Film'),R('scr','Scratches',0,100,0,'Film'),R('leak','Light leak',0,100,0,'Film'),C('lkc','Leak colour','#ff6a1f','Film'),R('flick','Flicker',0,100,0,'Film')
];
export const CAMSIM_FRAG=`
vec3 sm(vec2 p){return texture(uSrc,clamp(p,vec2(0.),vec2(1.))).rgb;}
vec3 ycc(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(-.1687,-.3313,.5)),dot(c,vec3(.5,-.4187,-.0813)));}
vec3 yrgb(vec3 y){return vec3(y.x+1.402*y.z,y.x-.34414*y.y-.71414*y.z,y.x+1.772*y.y);}
vec3 heatmap(float t){
  vec3 a=vec3(0.,0.,.05),b=vec3(.28,0.,.5),c=vec3(.78,.1,.28),d=vec3(1.,.55,0.),e=vec3(1.,.95,.55);t=clamp(t,0.,1.);
  if(t<.22)return mix(a,b,t/.22);if(t<.5)return mix(b,c,(t-.22)/.28);if(t<.75)return mix(c,d,(t-.5)/.25);return mix(d,e,(t-.75)/.25);}
vec4 fx(vec2 uv){
  float asp=uRes.x/uRes.y,fr=floor(uTime*30.),f24=floor(uTime*24.),sd=uSeed+u_seed2;
  vec3 raw=sm(uv);
  vec2 p=uv-.5,pa=p*vec2(asp,1.);float r2=dot(pa,pa),rr=sqrt(r2);
  /* geometry: lens, gate, tape */
  float bk=u_barrel/100.;p*=(1.+bk*r2*1.6)/(1.+bk*.28)/max(u_zoom,1.);
  p+=(vec2(h11(f24*1.7+sd),h11(f24*3.1+sd+4.))-.5)*u_weave/100.*.012;
  p.x+=(uv.y-.5)*u_skew/100.*.05*sin(uTime*1.3)+sin(uv.y*9.+uTime*2.)*u_skew/100.*.004;
  float ln=floor(uv.y*uRes.y/2.),bp=fract(uTime*.11),band=exp(-pow((uv.y-bp)*13.,2.));
  p.x+=(h11(ln+fr*17.+sd)-.5)*u_jitter/100.*.012*(.3+3.*band);
  p.x+=smoothstep(.07,0.,uv.y)*u_head/100.*(h11(fr+ln)-.3)*.05;
  vec2 q=p+.5;
  float lines=min(u_res,uRes.y);vec2 cells=vec2(lines*asp,lines);bool low=lines<uRes.y-1.;
  q.x+=mod(floor(q.y*lines),2.)*u_comb/100.*.006*sin(uTime*5.+sd);
  vec2 cq=low?(floor(q*cells)+.5)/cells:q;
  /* optics: softness and the pixel footprint of the virtual sensor */
  float rd=max(low?.5/cells.x:0.,u_soft/100.*.006);vec2 o1=vec2(rd,rd*asp),o2=o1*2.;
  vec3 c0=sm(cq);
  vec3 bl=(c0*.28+(sm(cq+o1*vec2(1.,1.))+sm(cq+o1*vec2(-1.,1.))+sm(cq+o1*vec2(1.,-1.))+sm(cq+o1*vec2(-1.,-1.)))*.1
    +(sm(cq+vec2(o2.x,0.))+sm(cq-vec2(o2.x,0.))+sm(cq+vec2(0.,o2.y))+sm(cq-vec2(0.,o2.y)))*.08);
  vec3 c=(u_soft>0.||low)?bl:c0;
  c+=(c0-bl)*u_sharp/100.*2.2*step(.5,u_sharp);
  /* lateral colour fringe, stronger toward the corners */
  if(u_ca>0.){vec2 d=normalize(p+1e-5)*(.0015+r2*.02)*u_ca/100.;c.r+=sm(cq+d).r-c0.r;c.b+=sm(cq-d).b-c0.b;}
  /* chroma bleed and shift (tape and early digital: colour is lower resolution than brightness) */
  if(u_cbleed>0.||u_cshift!=0.){float s=u_cbleed/100.*.012+.0005;vec2 ch=vec2(0.);
    for(int i=-2;i<=2;i++)ch+=ycc(sm(cq+vec2(float(i)*s+u_cshift/100.*.012,0.))).yz;
    vec3 y=ycc(c);c=yrgb(vec3(y.x,mix(y.yz,ch/5.,step(.5,u_cbleed+abs(u_cshift)))));}
  /* bloom (pulled from bright areas) and halation (red glow of light bouncing in the film base) */
  if(u_bloom>0.||u_halo>0.){
    float R1=.012+.05*u_bsize/100.;vec3 acc=vec3(0.);float th=u_bthr/100.;
    for(int i=0;i<8;i++){float a=float(i)*.7854+.3;vec2 o=vec2(cos(a),sin(a)*asp)*R1;
      acc+=max(sm(cq+o)-th,0.)+max(sm(cq+o*2.1)-th,0.)*.7;}
    acc/=13.6;c+=acc*u_btint*u_bloom/100.*2.4;c.r+=acc.r*u_halo/100.*2.;c.g+=acc.r*u_halo/100.*.45;}
  /* exposure */
  c*=exp2(u_ev/100.*2.)*(1.+u_pump/100.*.4*sin(uTime*.9+sin(uTime*.37+sd)*2.));
  c*=1.+u_flash/100.*(2.4*(1.-smoothstep(0.,.85,rr*1.15))-.7);
  c=mix(c,c/(1.+c*.9)*1.55,u_shoulder/100.);
  /* tone */
  c=(c-.45)*exp2(u_contrast/100.)+.45;c=pow(max(c,vec3(0.)),vec3(exp2(-u_gamma/100.)));
  float lf=u_lift/100.*.4;c=c*(1.-lf)+u_lcol*lf*1.4;
  /* colour */
  c*=vec3(1.+u_temp/100.*.35,1.-u_tint/100.*.2,1.-u_temp/100.*.35);
  float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,u_sat/100.);c=mix(c,vec3(l),u_mono/100.);
  c*=mix(vec3(1.),u_cast*1.15,u_castamt/100.);
  if(u_heat>0.)c=mix(c,heatmap(l*1.1),u_heat/100.);
  /* digital: bit depth and block compression */
  float lv=exp2(u_bits)-1.;if(u_bits<7.9)c=floor(c*lv+.5)/lv;
  if(u_blocks>0.){vec2 bid=floor(q*cells/8.);float bt=floor(uTime*6.);
    float n=h21(bid+bt*3.1+sd)-.5;vec3 cb=vec3(h21(bid*.5+bt+11.),h21(bid*.5+bt+23.),h21(bid*.5+bt+37.))-.5;
    c+=(n*.06+cb*.035)*u_blocks/100.*(.4+l);c=mix(c,floor(c*(14.-u_blocks/100.*8.))/(14.-u_blocks/100.*8.),u_blocks/160.);}
  /* vignette, tube, leak */
  c*=1.-u_vig/100.*smoothstep(.22,1.05,rr*1.2);
  if(u_tube>0.)c*=mix(1.,smoothstep(.5,.44,rr),u_tube/100.);
  if(u_leak>0.){float lk=u_leak/100.*(.6+.4*sin(uTime*.7+sd));float e=exp(-uv.x*4.5)+exp(-(1.-uv.y)*5.)*.8;c+=u_lkc*e*lk*.75;}
  /* sensor noise, heavier in shadows */
  vec2 cell=floor(uv*uRes/u_gsize);float w=1.2-.85*l;
  float nz=(h21(cell+fr*1.37+sd)+h21(cell*1.7+fr*2.3+5.)-1.);
  c+=nz*u_noise/100.*.36*w;
  if(u_cnoise>0.)c+=(vec3(h21(cell+fr*3.),h21(cell+7.+fr*5.),h21(cell+13.+fr*7.))-.5)*u_cnoise/100.*.34*w;
  c+=(h11(floor(uv.y*uRes.y/u_gsize)+fr*3.1+sd)-.5)*u_band/100.*.14;
  if(u_hot>0.&&h21(floor(uv*uRes)+fr*.1+sd)>1.-.0005*u_hot/100.*3.)c+=.8;
  /* film */
  if(u_dust>0.){vec2 dc=floor(uv*uRes/5.);float hd=h21(dc+floor(uTime*12.)*7.13+sd);
    if(hd>1.-.0016*u_dust/100.)c*=.3;else if(hd<.0007*u_dust/100.)c+=.5;}
  if(u_scr>0.){for(int i=0;i<2;i++){float tb=floor(uTime*10.),x=h11(tb+float(i)*5.+sd);
    if(abs(uv.x-x)<.0007&&h11(tb+float(i)*3.+sd)<u_scr/100.)c+=.26;}}
  c*=1.+(h11(floor(uTime*18.)+sd)-.5)*u_flick/100.*.5;
  /* display */
  c*=1.-u_scan/100.*.42*(.5-.5*cos(q.y*lines*6.2831));
  return vec4(mix(raw,clamp(c,0.,1.),u_amt/100.),1.);
}`;

/* one preset per camera body: only what that body does */
export const SIMS={
  cctv:{res:288,barrel:38,soft:34,sharp:62,ca:14,ev:-14,pump:30,contrast:36,lift:18,lcol:'#4a5a50',sat:42,mono:34,cast:'#b8d4b4',castamt:60,bits:6,blocks:55,vig:34,noise:38,gsize:2,cnoise:24,band:22,scan:34,comb:34,flick:8,hot:30},
  dash:{res:540,barrel:24,soft:16,sharp:52,ca:30,pump:36,contrast:30,shoulder:38,sat:82,cast:'#d8e0e8',castamt:36,bits:7,blocks:34,vig:30,noise:14,cnoise:10,bloom:28,bthr:62},
  door:{res:400,barrel:78,soft:30,sharp:56,ca:24,pump:40,contrast:20,sat:68,cast:'#c9dcec',castamt:55,bits:7,blocks:40,vig:52,noise:26,cnoise:18,band:10},
  ccd:{res:480,soft:10,sharp:78,ca:46,bloom:36,bsize:30,bthr:56,btint:'#ffd0f4',flash:56,shoulder:12,contrast:26,sat:126,cast:'#e8f0ff',castamt:30,blocks:30,noise:14,cnoise:22,vig:12},
  web:{res:240,soft:14,sharp:82,skew:30,ca:16,pump:46,contrast:10,sat:84,cast:'#d4ecd0',castamt:42,bits:6,blocks:46,vig:18,noise:42,cnoise:38,band:12,ev:10},
  disp:{soft:38,barrel:14,ca:28,flash:70,shoulder:26,contrast:26,lift:14,lcol:'#5a4a40',sat:118,cast:'#ffe2c0',castamt:50,bloom:14,vig:56,noise:40,gsize:2,cnoise:12,leak:30,dust:22},
  holga:{soft:62,barrel:10,ca:42,vig:76,lift:20,lcol:'#4a4a38',sat:92,cast:'#ffe9c8',castamt:35,leak:56,noise:32,gsize:3,bloom:20,bthr:50,dust:30,contrast:22},
  inst:{soft:42,lift:34,lcol:'#7a8a78',contrast:-12,sat:84,cast:'#fff0dc',castamt:55,bloom:26,bthr:55,vig:30,noise:22,gsize:2,leak:18,shoulder:30},
  handy:{res:240,soft:30,sharp:20,ca:22,cbleed:76,cshift:30,jitter:46,head:46,scan:40,comb:30,noise:34,cnoise:28,band:40,bits:7,pump:20,contrast:16,sat:112,vig:22,flick:6,lift:10},
  s8:{noise:72,gsize:3,weave:56,flick:42,halo:56,soft:34,vig:46,lift:26,lcol:'#6a4a30',sat:104,cast:'#ffd6a0',castamt:55,dust:56,scr:56,leak:20,shoulder:30,contrast:18,bloom:14,bthr:60},
  noir:{mono:100,contrast:56,noise:52,gsize:2.5,halo:28,vig:38,lift:7,weave:12,dust:22,scr:18,shoulder:20},
  night:{res:360,mono:100,cast:'#6cff7a',castamt:100,tube:80,bloom:66,bsize:56,bthr:44,noise:76,gsize:2,band:18,pump:30,contrast:30,ev:26,soft:18,sharp:30,vig:34},
  heat:{res:180,heat:100,soft:40,noise:16,gsize:2,scan:18,contrast:15,pump:15,sharp:20},
  sig:{res:300,jitter:72,head:72,cbleed:62,cshift:62,comb:50,scan:30,band:56,noise:40,cnoise:36,bits:6,blocks:30,ca:36,flick:26,soft:25,pump:30,sat:122},
  prism:{soft:10,ca:36,bloom:26,bthr:55,vig:10},
  clean:{sharp:16,bloom:8,bthr:70,vig:10,contrast:8,sat:106,shoulder:10,noise:4}
};
