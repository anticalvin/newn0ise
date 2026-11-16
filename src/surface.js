/* Surface shader: effects that live in an object's own material instead of on the screen. They follow the surface (they are computed from the
   object's position, normal and light, so they turn and move with it, on the character while it walks, and behind or in front of other
   things correctly). One uber shader, injected into whatever material the object already has, so lighting, textures and the character rig
   keep working. Changing look, amount, scale or colour only changes uniforms: nothing recompiles. */
export const SURF=[
  ['halftone','Halftone'],['crt','Phosphor scan'],['dither','Dither'],['thermal','Thermal'],['holo','Hologram'],['toon','Toon'],
  ['glitch','Glitch'],['hatch','Hatching'],['iris','Iridescent'],['grid','Grid'],['grain','Film grain'],['ink','Ink and paper'],
  ['bands','Colour bands'],['dissolve','Dissolve'],['xray','X-ray'],['pop','Pop print'],['scan','Scanner sweep'],['gmap','Gradient map'],['voxel','Voxel tint'],['vhs','VHS tape'],['nvg','Night vision'],['lcd','LCD pixels'],['gameboy','Handheld'],['cctv','CCTV'],['amber','Amber monitor'],['crttube','CRT tube'],['custom','Your own code']
];
export const CUSTOM_DEFAULT='// c lit colour, N normal, V view direction, P object position, fc screen pixel, t time, L brightness, fr rim, sc scale\nvec3 o = c;\no = mix(o, vec3(L), .5 + .5 * sin(P.y * 8. * sc + t));\no += vec3(1.,.5,.2) * fr * .6;\nreturn o;';
const DEFAULTS={
  halftone:{c1:'#f2efe8',c2:'#0b0b0c',sc:1},crt:{c1:'#ffffff',c2:'#000000',sc:1},dither:{c1:'#f2efe8',c2:'#14161a',sc:1.2},thermal:{c1:'#ffffff',c2:'#000000',sc:1},
  holo:{c1:'#7fe8ff',c2:'#000000',sc:1},toon:{c1:'#ffffff',c2:'#101010',sc:1},glitch:{c1:'#ff4a3a',c2:'#000000',sc:1},hatch:{c1:'#16161a',c2:'#f2efe8',sc:1},
  iris:{c1:'#ffffff',c2:'#000000',sc:1},grid:{c1:'#f2efe8',c2:'#000000',sc:1},grain:{c1:'#ffffff',c2:'#000000',sc:1},ink:{c1:'#0e0e10',c2:'#efe9da',sc:1},
  bands:{c1:'#ffffff',c2:'#000000',sc:1},dissolve:{c1:'#ffb347',c2:'#000000',sc:1},xray:{c1:'#9fd8ff',c2:'#000000',sc:1},pop:{c1:'#ffffff',c2:'#000000',sc:1},
  scan:{c1:'#ffffff',c2:'#000000',sc:1},gmap:{c1:'#f6e7c1',c2:'#1a1e3a',sc:1},voxel:{c1:'#ffffff',c2:'#000000',sc:1},vhs:{c1:'#ffffff',c2:'#000000',sc:1},nvg:{c1:'#41ff6a',c2:'#000000',sc:1},lcd:{c1:'#ffffff',c2:'#000000',sc:1},gameboy:{c1:'#9bbc0f',c2:'#0f380f',sc:1.4},cctv:{c1:'#ffffff',c2:'#000000',sc:1},amber:{c1:'#ffb000',c2:'#000000',sc:1},crttube:{c1:'#ffffff',c2:'#000000',sc:1},custom:{c1:'#ffffff',c2:'#000000',sc:1}
};
const FRAG_FN=`
uniform float uSM,uSA,uSS,uSV,uST,uSTa;uniform vec3 uSC1,uSC2,uSTc;
varying vec3 vSP,vSW,vSN;
float sH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float sL(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 sHue(float h){return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);}
float sB2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
float sB4(vec2 a){return sB2(.5*a)*.25+sB2(a);}
vec3 sHeat(float t){t=clamp(t,0.,1.);vec3 a=vec3(0.,0.,.1),b=vec3(.3,0.,.55),c=vec3(.85,.15,.25),d=vec3(1.,.6,0.),e=vec3(1.,.97,.6);
  if(t<.25)return mix(a,b,t*4.);if(t<.5)return mix(b,c,(t-.25)*4.);if(t<.75)return mix(c,d,(t-.5)*4.);return mix(d,e,(t-.75)*4.);}
/*CUSTOM*/
vec3 surfApply(vec3 c){
  if(uSTa>0.){float l0=sL(c);c=mix(c,uSTc*(.2+l0*1.55),uSTa);}
  int m=int(uSM+.5);if(m==0)return c;
  vec3 N=normalize(vSN),V=normalize(cameraPosition-vSW);
  float fr=pow(1.-abs(dot(N,V)),2.4),L=sL(c),sc=max(.2,uSS),t=uST*uSV;vec2 fc=gl_FragCoord.xy;vec3 o=c;
  if(m==1){float cell=7.*sc;vec2 g=fc/cell;float r=length(fract(g)-.5)*2.;float a=smoothstep(sqrt(clamp(L,0.,1.))*1.02+.1,sqrt(clamp(L,0.,1.))*1.02-.1,r);o=mix(uSC2,uSC1*(.35+.65*c/max(L,.2)),a);}
  else if(m==2){float scn=.62+.38*sin(fc.y*3.14159/(1.6*sc));float k=mod(floor(fc.x/sc),3.);vec3 mk=vec3(k<.5?1.:.55,k>.5&&k<1.5?1.:.55,k>1.5?1.:.55);o=c*scn*mk*1.35+uSC1*.0;o*=.96+.04*sin(t*40.);}
  else if(m==3){float th=sB4(fc/(2.*sc));float lv=clamp(floor(L*3.+th)/3.,0.,1.);o=mix(uSC2,uSC1,lv);}
  else if(m==4){o=sHeat(L*.85+fr*.35+.06*sin(t*2.));}
  else if(m==5){float bd=.5+.5*sin(vSW.y*38.*sc-t*4.);o=uSC1*(.2+L*.7)*(.55+.45*bd)+uSC1*fr*1.3;o*=.85+.15*sin(t*31.+vSW.y*3.);}
  else if(m==6){float q=floor(L*4.)/4.+.1;o=c/max(L,.05)*q;o=mix(o,uSC2,smoothstep(.5,.85,fr*1.6));}
  else if(m==7){float band=floor(vSP.y*12.*sc+t*3.);float h=sH(vec2(band,floor(t*2.)));float sh=step(.78,h);o=mix(c,vec3(c.g,c.b,c.r),sh);o+=uSC1*sh*.25;o.r+=step(.9,sH(vec2(band,floor(t*5.))))*.35;}
  else if(m==8){float d=(1.-L)*3.2;float l1=step(.5,fract((fc.x+fc.y)/(5.*sc)))*step(.8,d);float l2=step(.5,fract((fc.x-fc.y)/(5.*sc)))*step(1.8,d);float l3=step(.5,fract(fc.y/(4.*sc)))*step(2.6,d);float ink=max(l1,max(l2,l3));o=mix(uSC2,uSC1,ink);}
  else if(m==9){vec3 h=sHue(fr*1.1+vSP.y*.25*sc+t*.15);o=mix(c,h*(.45+L*.7),.8);o+=h*fr*.35;}
  else if(m==10){vec3 g=abs(fract(vSP*3.*sc)-.5);float d=min(min(.5-g.x,.5-g.y),.5-g.z);float ln=1.-smoothstep(.0,.035,d);o=mix(c*.6,uSC1,ln);}
  else if(m==11){o=c+(sH(fc+floor(t*24.))-.5)*.45;}
  else if(m==12){float n=sH(floor(fc/(2.*sc)));float tw=step(.48+.12*(n-.5),L);o=mix(uSC1,uSC2,tw);}
  else if(m==13){vec3 h=sHue(vSP.y*.45*sc+t*.25);o=mix(c,h,.6)*(.45+L);}
  else if(m==14){float n=sH(floor(vSP.xy*14.*sc)+floor(vSP.z*14.*sc)*3.);float th=fract(t*.12)*1.15;if(n<th)discard;if(n<th+.07)o=uSC1*1.4;}
  else if(m==15){o=uSC1*(fr*1.7+.1)+c*.1;}
  else if(m==16){vec3 q=floor(c*4.+.5)/4.;float cell=6.*sc;vec2 g=fc/cell;float r=length(fract(g)-.5)*2.;float dots=step(r,sqrt(clamp(1.-L,0.,1.))*.9)*step(L,.55);o=q*1.12*(1.-dots*.55);}
  else if(m==17){float y=sin(t*.8)*1.1;float b=exp(-pow((vSP.y-y)*5.,2.));o=c+uSC1*b*1.6;}
  else if(m==18){o=mix(uSC2,uSC1,smoothstep(0.,1.,L));}
  else if(m==27){o=surfCustom(c,N,V,vSP,fc,t,L,fr,sc);}
  else if(m==20){float rb=fract(fc.y/(400.*sc)-t*.15);float bar=smoothstep(0.,.04,rb)*(1.-smoothstep(.04,.1,rb));o=mix(vec3(L),c,1.25);o.r+=fr*.25;o.b+=fr*.3;o*=.88+.12*sin(fc.y*3.14159/(1.5*sc));o+=(sH(fc+floor(t*30.))-.5)*.14+bar*.35*sH(vec2(fc.y,floor(t*30.)));}
  else if(m==21){float lv=clamp(L*1.5+.1,0.,1.);o=uSC1*lv*(.9+.1*sin(fc.y*3.14159/(1.5*sc)));o+=(sH(fc+floor(t*30.))-.5)*.25*(1.-lv*.5);o*=1.-fr*.5;}
  else if(m==22){vec2 g=fract(fc/(6.*sc));float k=floor(g.x*3.);vec3 mk=vec3(k<.5?1.:.2,k>.5&&k<1.5?1.:.2,k>1.5?1.:.2);float gap=step(.12,g.y)*step(.08,fract(g.x*3.));o=c*mk*gap*1.9;}
  else if(m==23){float th=sB4(floor(fc/(3.*sc)));float lv=floor(clamp(L+(th-.5)*.25,0.,.999)*4.)/3.;o=mix(uSC2,uSC1,lv);}
  else if(m==24){o=vec3(L)*vec3(.9,1.,.92);o*=.9+.1*sin(fc.y*3.14159/sc);o*=1.-fr*.45;o+=(sH(fc+floor(t*25.))-.5)*.12;}
  else if(m==25){o=uSC1*L*1.3*(.7+.3*sin(fc.y*3.14159/(1.4*sc)))+uSC1*.05;}
  else if(m==26){float scn=.7+.3*sin(fc.y*3.14159/(1.6*sc));float k=mod(floor(fc.x/sc),3.);vec3 mk=vec3(k<.5?1.:.55,k>.5&&k<1.5?1.:.55,k>1.5?1.:.55);o=c*scn*mk*1.5+c*c*.35;o*=1.-fr*.35;o*=.97+.03*sin(t*50.);}
  else if(m==19){vec3 cell=floor(vSP*6.*sc);float h=sH(cell.xy+cell.z*7.);o=c*(.7+.45*h);}
  return mix(c,o,uSA);
}`;
const customFn=body=>'vec3 surfCustom(vec3 c,vec3 N,vec3 V,vec3 P,vec2 fc,float t,float L,float fr,float sc){\n'+body+'\n}';
const hashS=str=>{let h=5381;for(let i=0;i<str.length;i++)h=((h<<5)+h+str.charCodeAt(i))|0;return (h>>>0).toString(36);};
const KEYS=new WeakMap();
/* several hooks can sit on one material; each adds its own part to the program key so a changed program is never mistaken for a cached one */
export function chainKey(m,name,fn){let k=KEYS.get(m);if(!k){k={};KEYS.set(m,k);}k[name]=fn;m.customProgramCacheKey=()=>Object.keys(k).sort().map(n=>n+k[n]()).join('|');}
export function createSurface(c){
  const {THREE,S,objById}=c;
  const meshes=o=>{const out=[];o.holder.traverse(n=>{if(n.isMesh&&!n.isSplatMesh&&n.material&&!(n.userData&&n.userData.noView))out.push(n);});return out;};
  function hook(o){
    if(o.surfU)return o.surfU;
    const U={uSM:{value:0},uSA:{value:1},uSS:{value:1},uSV:{value:1},uST:{value:0},uSC1:{value:new THREE.Color('#ffffff')},uSC2:{value:new THREE.Color('#000000')},uSTa:{value:0},uSTc:{value:new THREE.Color('#ffffff')}};
    o.surfU=U;
    meshes(o).forEach(n=>{
      const list=Array.isArray(n.material)?n.material:[n.material];
      const next=list.map(m=>{
        if(m.isShaderMaterial||m.isRawShaderMaterial||!m.isMaterial)return m;
        let mm=m;
        if(m.userData.surfOwner!=null&&m.userData.surfOwner!==o.id){mm=m.clone();mm.onBeforeCompile=m.onBeforeCompile;mm.userData={...m.userData};}
        mm.userData.surfOwner=o.id;
        const prev=mm.onBeforeCompile;
        mm.onBeforeCompile=(sh,r)=>{
          if(prev&&prev!==mm.onBeforeCompile)prev(sh,r);
          Object.assign(sh.uniforms,U);
          if(!/#include <project_vertex>/.test(sh.vertexShader)||!/#include <dithering_fragment>/.test(sh.fragmentShader))return;
          sh.vertexShader='varying vec3 vSP,vSW,vSN;\n'+sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvSP=transformed;vSW=(modelMatrix*vec4(transformed,1.)).xyz;vSN=normalize(mat3(modelMatrix)*normal);');
          sh.fragmentShader=FRAG_FN.replace('/*CUSTOM*/',customFn((o.surf&&o.surf.code)||CUSTOM_DEFAULT))+'\n'+sh.fragmentShader.replace('#include <dithering_fragment>','gl_FragColor.rgb=surfApply(gl_FragColor.rgb);\n#include <dithering_fragment>');
        };
        chainKey(mm,'surf',()=>mm.uuid+hashS((o.surf&&o.surf.code)||''));(o.surfMats=o.surfMats||[]).push(mm);
        mm.needsUpdate=true;
        return mm;
      });
      n.material=Array.isArray(n.material)?next:next[0];
    });
    return U;
  }
  function set(o,patch){
    if(!o)return null;
    const st=o.surf=Object.assign({m:'',amt:1,sc:1,sp:1,c1:'#ffffff',c2:'#000000',tint:'#ffffff',ta:0},o.surf||{},patch||{});
    if((st.m||st.ta>0)&&!o.surfU)hook(o);
    if(patch&&patch.code!==undefined&&o.surfMats)o.surfMats.forEach(m=>{m.needsUpdate=true;});
    const U=o.surfU;if(!U)return st;
    const ix=st.m?SURF.findIndex(s=>s[0]===st.m)+1:0;
    U.uSM.value=ix;U.uSA.value=st.amt;U.uSS.value=st.sc;U.uSV.value=st.sp;U.uSC1.value.set(st.c1);U.uSC2.value.set(st.c2);U.uSTa.value=st.ta;U.uSTc.value.set(st.tint);
    return st;
  }
  function pick(o,id){
    const d=DEFAULTS[id]||{};
    return set(o,{m:id,c1:d.c1||'#ffffff',c2:d.c2||'#000000',sc:d.sc||1});
  }
  return {SURF,set,pick,defaults:id=>({...(DEFAULTS[id]||{})}),
    clear(o){if(o&&o.surf)set(o,{m:''});},
    recolour(o,hex,amt){return set(o,{tint:hex,ta:amt==null?.9:amt});},
    textured(o){let t=false;o.holder.traverse(n=>{if(n.isMesh&&n.material){(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(m.map)t=true;});}});return t;},
    tick(t){for(const o of S.objs)if(o.surfU&&o.surf&&o.surf.m)o.surfU.uST.value=t;},
    any(){return S.objs.some(o=>o.surf&&o.surf.m);}};
}

/* a small material ball: the same surface shader on a sphere in its own little scene, to try a look before putting it on anything */
export function createBall(THREE,RoomEnvironment,size=104){
  const cv=document.createElement('canvas');cv.className='surfball';cv.style.cssText='width:'+size+'px;height:'+size+'px;border-radius:50%;display:block;background:#0b0b0c';
  let rn=null,ok=true;
  try{rn=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});}catch(e){ok=false;}
  if(!ok)return {el:cv,set(){},stop(){}};
  const dpr=Math.min(2,devicePixelRatio||1);rn.setPixelRatio(dpr);rn.setSize(size,size,false);
  const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(32,1,.1,20);cam.position.set(0,0,3.2);
  try{const pm=new THREE.PMREMGenerator(rn);sc.environment=pm.fromScene(new RoomEnvironment(),.04).texture;}catch(e){}
  const k=new THREE.DirectionalLight(0xffffff,2.2);k.position.set(2,3,3);sc.add(k,new THREE.HemisphereLight(0xffffff,0x333338,.5));
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),new THREE.MeshStandardMaterial({color:0xcfc8bd,roughness:.45,metalness:.1}));
  const g=new THREE.Group();g.add(mesh);sc.add(g);
  const fake={objs:[]},bs=createSurface({THREE,S:fake,objById:()=>null}),obj={id:-999,holder:g,surf:null};fake.objs.push(obj);
  let raf=0,last=0;
  const draw=now=>{raf=requestAnimationFrame(draw);if(!cv.isConnected){return;}if(cv.offsetParent===null)return;if(now-last<33)return;last=now;
    mesh.rotation.y=now/4000;bs.tick(now/1000);rn.render(sc,cam);};
  raf=requestAnimationFrame(draw);
  return {el:cv,set(st){bs.set(obj,st&&st.m?{...st}:{m:''});},stop(){cancelAnimationFrame(raf);}};
}
