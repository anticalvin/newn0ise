/* Lighting: a real sun, a sky and a day. Time of day, latitude and season set where the sun is (the same maths as the real sky), and the sun's
   colour, the sky, the ambient light, the reflections and the stars all follow from that. It is off until you turn it on, so a scene keeps
   exactly the lights it had. Turning it off puts the old values back. Lights you add (point, spot, sun) live in the same panel. */
import {Sky} from 'three/addons/objects/Sky.js';
const rad=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),sm=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const hhmm=h=>{const m=Math.round(((h%24)+24)%24*60);return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
export function createLighting(c){
  const {THREE,scene,camera,key,hemi,rim,deps}=c;
  const L={on:false,sky:true,stars:true,moon:true,hour:11,auto:false,speed:.5,lat:40,season:.5,north:0,haze:.35,clouds:.35,sunK:1,exp:1,fog:0,reach:12,shadowRes:2048};
  let sky=null,stars=null,saved=null,fogMine=false,dirV=new THREE.Vector3(0,1,0),elDeg=40,ct=0;
  const C=(h)=>new THREE.Color(h),tmp=new THREE.Color();
  const mix=(a,b,t)=>tmp.copy(C(a)).lerp(C(b),clamp(t,0,1)).clone();
  /* where the sun is: declination from the season, hour angle from the time, then elevation and azimuth */
  function sunVec(){
    const decl=-23.44*Math.cos(2*Math.PI*L.season)*rad,lat=L.lat*rad,H=(L.hour-12)*15*rad;
    const sinEl=Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(H),el=Math.asin(clamp(sinEl,-1,1));
    const A=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(lat)-Math.tan(decl)*Math.cos(lat)),ce=Math.cos(el);
    let x=-Math.sin(A)*ce,z=Math.cos(A)*ce;const n=L.north*rad,cx=x*Math.cos(n)-z*Math.sin(n),cz=x*Math.sin(n)+z*Math.cos(n);
    elDeg=el/rad;return dirV.set(cx,sinEl,cz).normalize();
  }
  /* the hour at which the sun is at a given height, in the morning or the evening, at this place and season */
  function hourFor(deg,evening){
    let best=evening?18:6,bd=1e9;const keep=L.hour;
    for(let h=evening?12:0;h<=(evening?24:12);h+=.05){L.hour=h;sunVec();const d=Math.abs(elDeg-deg);if(d<bd){bd=d;best=h;}}
    L.hour=keep;return best;
  }
  function ensureSky(){
    if(sky)return;
    sky=new Sky();sky.scale.setScalar(140);sky.frustumCulled=false;sky.renderOrder=-100;sky.userData.noView=true;
    const m=sky.material;m.depthTest=false;m.depthWrite=false;m.uniforms.uSkyK={value:.6};
    m.fragmentShader='uniform float uSkyK;\n'+m.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );','gl_FragColor = vec4( 1.0 - exp( -max(texColor,0.0) * uSkyK ), 1.0 );');
    m.uniforms.cloudScale.value=.0003;m.uniforms.cloudSpeed.value=.00004;
    const n=2600,pos=new Float32Array(n*3);for(let i=0;i<n;i++){const u=Math.random()*2-1,a=Math.random()*Math.PI*2,r=Math.sqrt(1-u*u);pos.set([r*Math.cos(a),u,r*Math.sin(a)],i*3);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    stars=new THREE.Points(g,new THREE.PointsMaterial({color:0x000000,size:1.6,sizeAttenuation:false,blending:THREE.AdditiveBlending,transparent:false,depthWrite:false,depthTest:false,fog:false,toneMapped:false}));
    stars.scale.setScalar(130);stars.renderOrder=-99;stars.frustumCulled=false;stars.userData.noView=true;
    scene.add(sky,stars);
  }
  function save(){
    if(saved)return;const d=deps();
    saved={ki:key.intensity,kc:key.color.clone(),kp:key.position.clone(),hi:hemi.intensity,hc:hemi.color.clone(),hg:hemi.groundColor.clone(),ri:rim.intensity,rc:rim.color.clone(),rp:rim.position.clone(),env:d.S.env,fog:scene.fog};
  }
  function restore(){
    if(!saved)return;const d=deps();
    key.intensity=saved.ki;key.color.copy(saved.kc);key.position.copy(saved.kp);hemi.intensity=saved.hi;hemi.color.copy(saved.hc);hemi.groundColor.copy(saved.hg);
    rim.intensity=saved.ri;rim.color.copy(saved.rc);rim.position.copy(saved.rp);scene.environmentIntensity=saved.env;if(fogMine)scene.fog=saved.fog;fogMine=false;
    key.target.position.set(0,0,0);saved=null;d.bump();
  }
  /* push everything the time of day decides onto the lights, the sky and the reflections */
  function apply(){
    if(!L.on)return;const d=deps();save();ensureSky();
    const dir=sunVec(),day=sm(-6,14,elDeg),high=sm(2,26,elDeg),night=1-sm(-10,0,elDeg),twi=Math.max(0,1-Math.abs(elDeg-3)/12);
    const R=22,tg=d.controls.target;
    key.target.position.copy(tg);if(!key.target.parent)scene.add(key.target);key.target.updateMatrixWorld();
    key.position.set(tg.x+dir.x*R,tg.y+Math.max(dir.y,.02)*R,tg.z+dir.z*R);
    key.color.copy(mix('#ff7a38','#fff3df',sm(3,34,elDeg)));key.intensity=L.sunK*L.exp*2.1*sm(-1.5,9,elDeg)*(.4+.6*high);
    const sc=key.shadow.camera;sc.left=sc.bottom=-L.reach;sc.right=sc.top=L.reach;sc.near=.5;sc.far=90;sc.updateProjectionMatrix();
    if(key.castShadow&&key.shadow.mapSize.x!==L.shadowRes){key.shadow.mapSize.set(L.shadowRes,L.shadowRes);if(key.shadow.map){key.shadow.map.dispose();key.shadow.map=null;}}
    /* the second light is the moon at night and a cool fill from the other side by day */
    if(day>.25||!L.moon){rim.position.set(tg.x-dir.x*10,tg.y+4,tg.z-dir.z*10);rim.color.copy(C('#b4c4ff'));rim.intensity=.35*day*L.exp;}
    else{rim.position.set(tg.x-dir.x*10,tg.y+Math.max(-dir.y,.1)*10,tg.z-dir.z*10);rim.color.copy(C('#8fa8ff'));rim.intensity=.3*night*L.exp;}
    hemi.color.copy(mix(mix('#0a1024','#e8a07a',twi*1.2+day*.2),'#c4d8ff',day*day));hemi.groundColor.copy(mix('#07080c','#44444a',day));hemi.intensity=(.03+.42*day)*L.exp;
    scene.environmentIntensity=d.S.env*(.05+.95*day)*L.exp*(.8+.2*high);
    const horizon=mix(mix('#05070d','#e0a074',twi*1.3+day*.15),'#b9cade',day*day);
    if(L.fog>0){scene.fog=new THREE.Fog(horizon,L.fog*.25,L.fog);fogMine=true;}else if(fogMine){scene.fog=saved.fog;fogMine=false;}
    sky.visible=L.sky;stars.visible=L.sky&&L.stars;
    const u=sky.material.uniforms;u.sunPosition.value.copy(dir);u.turbidity.value=1.5+L.haze*14;u.rayleigh.value=.7+(1-day)*1.6+twi*.6;u.mieCoefficient.value=.003+L.haze*.012;
    u.cloudCoverage.value=L.clouds;u.cloudDensity.value=.25+L.clouds*.45;
    const sk=clamp(night*1.1-.1,0,1);stars.material.color.setScalar(sk);if(sk<.02)stars.visible=false;
    d.bump();
  }
  function setOn(v){L.on=!!v;if(L.on)apply();else{if(sky){sky.visible=false;stars.visible=false;}restore();}deps().bump();}
  /* lights you add */
  const rig=[];let seq=0;
  const markerOf=(item)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.14,16,12),new THREE.MeshBasicMaterial({color:item.color,toneMapped:false}));m.userData.noView=true;m.userData.lightMarker=true;scene.add(m);return m;};
  async function addLight(type,patch){
    const d=deps(),t=d.controls.target,n=rig.length;
    const item={type,color:'#ffffff',intensity:type==='dir'?2:type==='spot'?60:20,pos:[t.x+(n%3-1)*2,t.y+3,t.z+Math.floor(n/3)*-1.5+1],angle:35,shadow:false,...(patch||{})};
    const r=await d.api.run({cmd:'light',op:'add',type,color:item.color,intensity:item.intensity,pos:item.pos,target:[t.x,t.y,t.z],angle:item.angle});
    item.id=r.id;item.name=({dir:'Sun',spot:'Spot',point:'Point'})[type]+' '+(++seq);item.marker=markerOf(item);item.marker.position.set(...item.pos);
    if(item.shadow)await d.api.run({cmd:'light',op:'set',id:item.id,shadow:true});
    rig.push(item);d.bump();return item;
  }
  async function setLight(item,patch){
    Object.assign(item,patch);const d=deps();
    await d.api.run({cmd:'light',op:'set',id:item.id,color:item.color,intensity:item.intensity,pos:item.pos,angle:item.angle,shadow:item.shadow});
    item.marker.position.set(...item.pos);item.marker.material.color.set(item.color);d.bump();
  }
  async function removeLight(item){
    const d=deps();await d.api.run({cmd:'light',op:'delete',id:item.id});scene.remove(item.marker);item.marker.geometry.dispose();item.marker.material.dispose();
    rig.splice(rig.indexOf(item),1);d.bump();
  }
  async function clearLights(){for(const it of rig.slice())await removeLight(it);}
  const state=()=>({L:{...L,auto:false},rig:rig.map(({type,color,intensity,pos,angle,shadow,name})=>({type,color,intensity,pos:[...pos],angle,shadow,name}))});
  async function restoreState(s){
    if(!s)return;await clearLights();Object.assign(L,s.L||{});L.auto=false;
    for(const it of s.rig||[]){const x=await addLight(it.type,it);if(it.name)x.name=it.name;}
    setOn(L.on);
  }
  /* ---- panel ---- */
  let paneHost=null,rebuild=()=>{},syncTime=null;
  function pane(parent,ui){
    const {sliderRow,chipRow,btn,el,sec,toast}=ui;
    const host=el('div');parent.appendChild(host);paneHost=host;
    const build=()=>{
      host.innerHTML='';
      const s=sec(host,'Sun and sky');
      s.appendChild(el('div','note','A real sun path with a sky, clouds, stars and a moon. Time, place and season decide the light. Off, your scene keeps the lights it has.'));
      const tg=el('div','chips');
      const tgl=(label,get,fn)=>{const b=el('button','chip',label);b.setAttribute('aria-pressed',!!get());b.addEventListener('click',()=>{fn(!get());b.setAttribute('aria-pressed',!!get());});tg.appendChild(b);};
      tgl('Sun and sky',()=>L.on,v=>{setOn(v);build();});
      if(L.on){tgl('Sky',()=>L.sky,v=>{L.sky=v;apply();});tgl('Stars',()=>L.stars,v=>{L.stars=v;apply();});tgl('Moon',()=>L.moon,v=>{L.moon=v;apply();});
        tgl('Play day',()=>L.auto,v=>{L.auto=v;if(!v)apply();});}
      s.appendChild(tg);
      if(!L.on)return;
      const pr=el('div','chips');[['Sunrise',3,0],['Morning',28,0],['Noon',null,0],['Golden hour',9,1],['Dusk',-4,1],['Night',null,2]].forEach(([l,e,k])=>pr.appendChild(btn(l,'',()=>{L.hour=k===2?0:e==null?12:hourFor(e,k===1);apply();timeRow.sync&&timeRow.sync();})));s.appendChild(pr);
      const timeRow=sliderRow(s,'Time',()=>L.hour,v=>{L.hour=v;apply();info.textContent=readout();},0,24,.05,hhmm);
      const info=el('div','note','');const readout=()=>'Sun '+(elDeg>=0?Math.round(elDeg)+'° above the horizon':Math.round(-elDeg)+'° below the horizon');info.textContent=readout();s.appendChild(info);syncTime=()=>{timeRow.sync&&timeRow.sync();info.textContent=readout();};
      sliderRow(s,'Day speed',()=>L.speed,v=>{L.speed=v;},.05,6,.05,v=>(+v).toFixed(2)+' h/s');
      sliderRow(s,'Latitude',()=>L.lat,v=>{L.lat=v;apply();info.textContent=readout();},-70,70,1,v=>Math.round(v)+'°');
      sliderRow(s,'Season',()=>L.season,v=>{L.season=v;apply();info.textContent=readout();},0,1,.01,v=>v<.15||v>.85?'Winter':v<.4?'Spring':v<.6?'Summer':'Autumn');
      sliderRow(s,'Turn the world',()=>L.north,v=>{L.north=v;apply();},0,360,1,v=>Math.round(v)+'°');
      sliderRow(s,'Haze',()=>L.haze,v=>{L.haze=v;apply();},0,1,.01);
      sliderRow(s,'Clouds',()=>L.clouds,v=>{L.clouds=v;apply();},0,1,.01);
      sliderRow(s,'Sun strength',()=>L.sunK,v=>{L.sunK=v;apply();},0,2,.05);
      sliderRow(s,'Exposure',()=>L.exp,v=>{L.exp=v;apply();},.2,3,.05);
      sliderRow(s,'Fog distance',()=>L.fog,v=>{L.fog=v;apply();},0,200,5,v=>+v?Math.round(v)+' m':'Off');
      s.appendChild(el('div','sub','Shadows'));
      chipRow(s,[['1024','Soft'],['2048','Normal'],['4096','Sharp']],v=>String(L.shadowRes)===v,v=>{L.shadowRes=+v;apply();});
      sliderRow(s,'Shadow reach',()=>L.reach,v=>{L.reach=v;apply();},4,40,1,v=>Math.round(v)+' m');
    };
    rebuild=build;build();
    /* lights you add */
    const ls=sec(parent,'Lights');
    ls.appendChild(el('div','note','Add lights and place them with the sliders. A small dot shows where each one is.'));
    const row=el('div','chips');
    row.append(btn('+ Point','',()=>addLight('point').then(paintList)),btn('+ Spot','',()=>addLight('spot').then(paintList)),btn('+ Sun','',()=>addLight('dir').then(paintList)),btn('Remove all','',()=>clearLights().then(paintList)));
    ls.appendChild(row);const list=el('div');ls.appendChild(list);
    let open=null;
    function paintList(){
      list.innerHTML='';
      if(!rig.length)list.appendChild(el('div','note','No lights yet.'));
      rig.forEach(it=>{
        const b=el('button','chip',(open===it?'▾ ':'▸ ')+it.name);b.style.margin='4px 0';b.addEventListener('click',()=>{open=open===it?null:it;paintList();});list.appendChild(b);
        if(open!==it)return;
        const box=el('div');box.style.cssText='padding:4px 0 8px';
        const cr=el('div','row');cr.innerHTML='<label>Colour</label><input type="color" style="width:100%;height:28px;border:1px solid var(--line);background:none;padding:0"><output></output>';
        const ci=cr.querySelector('input');ci.value=it.color;ci.addEventListener('input',()=>setLight(it,{color:ci.value}));box.appendChild(cr);
        sliderRow(box,'Strength',()=>it.intensity,v=>setLight(it,{intensity:v}),0,it.type==='dir'?10:200,it.type==='dir'?.1:1);
        ['X','Y','Z'].forEach((a,i)=>sliderRow(box,a,()=>it.pos[i],v=>{const p=[...it.pos];p[i]=v;setLight(it,{pos:p});},-25,25,.1));
        if(it.type==='spot')sliderRow(box,'Angle',()=>it.angle,v=>setLight(it,{angle:v}),5,80,1,v=>Math.round(v)+'°');
        if(it.type!=='point'){const sb=el('button','chip','Casts shadows');sb.setAttribute('aria-pressed',!!it.shadow);sb.addEventListener('click',()=>{setLight(it,{shadow:!it.shadow});sb.setAttribute('aria-pressed',!!it.shadow);if(it.shadow&&!deps().S.shadows)toast('Turn on Shadows in Stage to see them.');});box.appendChild(sb);}
        box.appendChild(btn('Delete light','',()=>{removeLight(it).then(()=>{open=null;paintList();});}));
        list.appendChild(box);
      });
    }
    paintList();rebuildList=paintList;
  }
  let rebuildList=()=>{};
  return {L,pane,state,restoreState,apply,setOn,addLight,removeLight,clearLights,rig,
    get on(){return L.on;},setHour(h){L.hour=((h%24)+24)%24;apply();},
    sunInfo:()=>({elevation:elDeg,dir:dirV.toArray()}),
    skyMesh:()=>sky&&sky.visible?sky:null,
    skyVis(v){if(!sky)return;if(!v){sky._h=[sky.visible,stars.visible];sky.visible=false;stars.visible=false;}else if(sky._h){sky.visible=sky._h[0];stars.visible=sky._h[1];sky._h=null;}},
    tick(t,dt){
      if(!L.on)return;
      if(sky){sky.position.copy(camera.position);stars.position.copy(camera.position);sky.material.uniforms.time.value=t;}
      if(L.auto){L.hour=(L.hour+dt*L.speed)%24;apply();if((ct+=dt)>.25){ct=0;syncTime&&syncTime();}}
    }};
}
