/* Shader helper library shared with the Effects page (copied from GLSL_LIB in src/app.js; keep the two in step).
   Effect fragments such as Light Leak call fbm(), curl(), sobel() and the palette helpers from here. */
export const GLSL_LIB=`
uniform vec3 uPal[16];uniform int uPalN;
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 rgb2ok(vec3 c){float l=.4122214708*c.r+.5363325363*c.g+.0514459929*c.b,m=.2119034982*c.r+.6806995451*c.g+.1073969566*c.b,s=.0883024619*c.r+.2817188376*c.g+.6299787005*c.b;
  l=pow(max(l,0.),1./3.);m=pow(max(m,0.),1./3.);s=pow(max(s,0.),1./3.);
  return vec3(.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s);}
vec3 palNearest(vec3 c){vec3 k=rgb2ok(c);float bd=1e9;vec3 best=uPal[0];for(int i=0;i<16;i++){if(i>=uPalN)break;vec3 d=rgb2ok(uPal[i])-k;float e=dot(d,d);if(e<bd){bd=e;best=uPal[i];}}return best;}
vec3 palRamp(float t){float x=clamp(t,0.,.9999)*float(max(uPalN,1));return uPal[int(x)];}
vec3 palSmooth(float t){float n=float(max(uPalN-1,1));float x=clamp(t,0.,1.)*n;int i=int(floor(x));int j=min(i+1,uPalN-1);return mix(uPal[i],uPal[j],fract(x));}
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+17.1;a*=.5;}return s;}
vec2 curl(vec2 p){float e=.02;return vec2(vnoise(p+vec2(0.,e))-vnoise(p-vec2(0.,e)),-(vnoise(p+vec2(e,0.))-vnoise(p-vec2(e,0.))))/(2.*e);}
vec3 paperLook(vec2 px,vec3 base,float grain,float fiber){
  float g=vnoise(px*.9)*.55+vnoise(px*2.7)*.45;
  float f=vnoise(vec2(px.x*.05,px.y*1.4))*vnoise(vec2(px.x*1.2,px.y*.04));
  return base*(1.-grain*.3*(g-.5)*2.)*(1.-fiber*.35*f);}
vec2 sobel(sampler2D t,vec2 uv,vec2 d){
  float a=luma(texture(t,uv+vec2(d.x,0.)).rgb)-luma(texture(t,uv-vec2(d.x,0.)).rgb);
  float b=luma(texture(t,uv+vec2(0.,d.y)).rgb)-luma(texture(t,uv-vec2(0.,d.y)).rgb);return vec2(a,b);}
float selMask(sampler2D t,vec2 uv,vec2 d,int mode,float thr){
  if(mode==1)return smoothstep(thr*.5,thr*.5+.08,length(sobel(t,uv,d)));
  if(mode==2)return smoothstep(thr-.04,thr+.04,luma(texture(t,uv).rgb));
  return 1.;}
`;
