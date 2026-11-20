/* Live mode: a little Sim moves into your house. It has needs (hunger, energy, fun, hygiene) that run down, finds the furniture
   that fixes them, walks there around the walls and furniture, and uses it. You can let it run its own day or tap things to send it.
   Furniture is recognised from the model's name (bed, sofa, fridge, shower, TV...). Plain canvas-free three.js, no library. */
const NEEDS=[['hunger','Hunger','#ffb347'],['energy','Energy','#7aa7ff'],['fun','Fun','#ff7ab8'],['hygiene','Hygiene','#5fe0c4']];
const DECAY={hunger:.9,energy:.55,fun:.8,hygiene:.65};
const USES=[
  [/bed|bunk|cot\b|hammock|sleeping/i,'energy','Sleep',9],
  [/tv|television|radio|piano|guitar|computer|laptop|game|arcade|console|speaker|record/i,'fun','Have fun',7],
  [/sofa|couch|arm.?chair|bench|lounger|stool|chair/i,'fun','Relax',6],
  [/fridge|refrigerator|stove|oven|cooker|microwave|kitchen|pizza|cake|bread|fruit|food|dining|(?<!coffee[ _-]?|side[ _-]?|end[ _-]?|night[ _-]?|bed[ _-]?)table/i,'hunger','Eat',7],
  [/shower|bath|toilet|sink|basin|washing|tub/i,'hygiene','Wash',7]
];
export function createLive(c){
  const {THREE,S,scene,objById,toast,el,btn,stage,bump,dom,camera,host}=c;
  const L={sim:null,auto:true,control:true,speed:3,cands:[]};
  const CELL=.4;let hud=null;

  /* ---- the figure ---- */
  function figure(){
    const g=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:'#f0c8a0',roughness:.7}),cloth=new THREE.MeshStandardMaterial({color:'#4d7cff',roughness:.6}),pants=new THREE.MeshStandardMaterial({color:'#2d3040',roughness:.8});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.2,.5,6,12),cloth);body.position.y=1.05;
    const head=new THREE.Mesh(new THREE.SphereGeometry(.17,16,12),skin);head.position.y=1.62;
    const mkLeg=x=>{const p=new THREE.Group(),m=new THREE.Mesh(new THREE.CapsuleGeometry(.075,.55,4,8),pants);m.position.y=-.3;p.add(m);p.position.set(x,.8,0);return p;};
    const mkArm=x=>{const p=new THREE.Group(),m=new THREE.Mesh(new THREE.CapsuleGeometry(.06,.45,4,8),cloth);m.position.y=-.26;p.add(m);p.position.set(x,1.3,0);return p;};
    const legL=mkLeg(-.1),legR=mkLeg(.1),armL=mkArm(-.27),armR=mkArm(.27);
    const bob=new THREE.Group();bob.add(body,head,legL,legR,armL,armR);g.add(bob);
    const pm=new THREE.Mesh(new THREE.OctahedronGeometry(.13),new THREE.MeshStandardMaterial({color:'#3ddc6a',emissive:'#3ddc6a',emissiveIntensity:1.4,roughness:.3}));pm.scale.y=1.7;pm.position.y=2.15;g.add(pm);
    g.traverse(n=>{if(n.isMesh)n.castShadow=true;});
    return {g,bob,legL,legR,armL,armR,plumb:pm};
  }

  /* ---- the walkable grid ---- */
  function boxesNow(skip){
    const out=(host.colliders()||[]).map(b=>b.clone());
    S.objs.forEach(o=>{if(o===skip||!o.meta||!o.meta.phModel||o.vis===false)return;const b=new THREE.Box3().setFromObject(o.holder);if(isFinite(b.min.x)&&b.min.y<host.floorY()+1.3)out.push(b);});
    return out;
  }
  function gridFor(skip){
    const hb=host.bounds(),mn=host.toWorld(hb.min),mx=host.toWorld(hb.max);
    const x0=Math.min(mn.x,mx.x)-3,x1=Math.max(mn.x,mx.x)+3,z0=Math.min(mn.z,mx.z)-3,z1=Math.max(mn.z,mx.z)+3;
    const W=Math.min(90,Math.ceil((x1-x0)/CELL)),H=Math.min(90,Math.ceil((z1-z0)/CELL)),bl=new Uint8Array(W*H),fy=host.floorY(),R=.22;
    boxesNow(skip).forEach(b=>{if(b.max.y<fy+.1)return;const i0=Math.max(0,Math.floor((b.min.x-R-x0)/CELL)),i1=Math.min(W-1,Math.floor((b.max.x+R-x0)/CELL)),j0=Math.max(0,Math.floor((b.min.z-R-z0)/CELL)),j1=Math.min(H-1,Math.floor((b.max.z+R-z0)/CELL));
      for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)bl[j*W+i]=1;});
    return {x0,z0,W,H,bl};
  }
  const cellOf=(G,x,z)=>[Math.max(0,Math.min(G.W-1,Math.floor((x-G.x0)/CELL))),Math.max(0,Math.min(G.H-1,Math.floor((z-G.z0)/CELL)))];
  const centre=(G,i,j)=>[G.x0+(i+.5)*CELL,G.z0+(j+.5)*CELL];
  function nearestFree(G,i,j){if(!G.bl[j*G.W+i])return [i,j];for(let r=1;r<12;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;const a=i+di,b=j+dj;if(a<0||b<0||a>=G.W||b>=G.H)continue;if(!G.bl[b*G.W+a])return [a,b];}return null;}
  function astar(G,s,e){
    const W=G.W,N=W*G.H,gs=new Float32Array(N).fill(1e9),from=new Int32Array(N).fill(-1),closed=new Uint8Array(N),open=[],h=(i,j)=>Math.hypot(i-e[0],j-e[1]);
    const si=s[1]*W+s[0],ei=e[1]*W+e[0];gs[si]=0;open.push([h(s[0],s[1]),si]);let it=0;
    while(open.length&&it++<9000){open.sort((a,b)=>a[0]-b[0]);const [,cur]=open.shift();if(cur===ei)break;if(closed[cur])continue;closed[cur]=1;const ci=cur%W,cj=(cur/W)|0;
      for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const a=ci+di,b=cj+dj;if(a<0||b<0||a>=W||b>=G.H||G.bl[b*W+a])continue;if(di&&dj&&(G.bl[cj*W+a]||G.bl[b*W+ci]))continue;
        const n=b*W+a,cost=gs[cur]+(di&&dj?1.414:1);if(cost<gs[n]){gs[n]=cost;from[n]=cur;open.push([cost+h(a,b),n]);}}}
    if(from[ei]<0&&si!==ei)return null;const path=[];let n=ei;while(n!==-1&&n!==si){path.push([n%W,(n/W)|0]);n=from[n];}return path.reverse().map(([i,j])=>centre(G,i,j));
  }

  /* ---- the sim ---- */
  function spawn(){
    if(L.sim){toast('A Sim already lives here.');return;}
    const f=figure(),fy=host.floorY(),hb=host.bounds(),cn=host.toWorld(hb.getCenter(new THREE.Vector3()));
    const G=gridFor(null),c0=nearestFree(G,...cellOf(G,cn.x,cn.z));const p=c0?centre(G,c0[0],c0[1]):[cn.x,cn.z];
    f.g.position.set(p[0],fy,p[1]);scene.add(f.g);
    L.sim={...f,needs:{hunger:80,energy:85,fun:70,hygiene:80},path:[],state:'idle',idle:1,use:null,t:0,label:'Just moved in'};
    showHud(true);toast('A Sim moved in. Watch it, or tap furniture to send it.',4000);scan();paintHud();bump();
  }
  function remove(){if(!L.sim)return;scene.remove(L.sim.g);L.sim.g.traverse(n=>{if(n.geometry)n.geometry.dispose();});L.sim=null;showHud(false);bump();}
  function scan(){
    L.cands=[];S.objs.forEach(o=>{if(!o.meta||!o.meta.phModel||o.vis===false)return;const nm=o.name||'';for(const [re,need,verb,secs] of USES){if(re.test(nm)){L.cands.push({o,need,verb,secs,name:nm});break;}}});
    return L.cands;
  }
  function goTo(cand){
    const s=L.sim;if(!s)return false;
    const G=gridFor(cand.o),b=new THREE.Box3().setFromObject(cand.o.holder),ctr=b.getCenter(new THREE.Vector3());
    const e=nearestFree(G,...cellOf(G,ctr.x,ctr.z)),st0=cellOf(G,s.g.position.x,s.g.position.z),st=nearestFree(G,...st0);
    if(!e||!st){toast('There’s no way through to the '+cand.name+'.');return false;}
    const path=astar(G,st,e);if(!path){toast('The Sim can’t reach the '+cand.name+'. Check there’s a door.',3500);return false;}
    s.path=path;s.target=cand;s.state='walk';s.label='Heading to the '+cand.name;paintHud();return true;
  }
  function chooseNext(){
    const s=L.sim,low=NEEDS.map(([k])=>[k,s.needs[k]]).sort((a,b)=>a[1]-b[1])[0];
    if(low[1]<72){const opts=scan().filter(c=>c.need===low[0]);
      if(opts.length){const p=s.g.position;opts.sort((a,b)=>a.o.holder.position.distanceTo(p)-b.o.holder.position.distanceTo(p));for(const c of opts.slice(0,3))if(goTo(c))return;}}
    /* nothing to fix: stroll */
    const G=gridFor(null),here=cellOf(G,s.g.position.x,s.g.position.z);
    for(let k=0;k<8;k++){const i=Math.max(0,Math.min(G.W-1,here[0]+Math.round((Math.random()-.5)*14))),j=Math.max(0,Math.min(G.H-1,here[1]+Math.round((Math.random()-.5)*14)));const e=nearestFree(G,i,j);if(!e)continue;const path=astar(G,nearestFree(G,...here)||here,e);if(path&&path.length>1){s.path=path;s.state='walk';s.target=null;s.label='Wandering';paintHud();return;}}
    s.idle=2;
  }
  function tick(dt){
    const s=L.sim;if(!s)return;dt=Math.min(dt,.1);s.t+=dt;
    NEEDS.forEach(([k])=>{s.needs[k]=Math.max(0,s.needs[k]-DECAY[k]*dt*L.speed*.35);});
    const worst=Math.min(...NEEDS.map(([k])=>s.needs[k])),mood=NEEDS.reduce((a,[k])=>a+s.needs[k],0)/4;
    s.plumb.rotation.y+=dt*1.6;s.plumb.position.y=2.15+Math.sin(s.t*2)*.05;
    const col=mood>66?'#3ddc6a':mood>38?'#ffd23d':'#ff4d4d';s.plumb.material.color.set(col);s.plumb.material.emissive.set(col);
    if(s.state==='walk'){
      const next=s.path[0];
      if(!next){s.state=s.target?'use':'idle';if(s.target){s.use={c:s.target,left:s.target.secs/L.speed};s.label=s.target.verb+' ('+s.target.name+')';const b=new THREE.Box3().setFromObject(s.target.o.holder).getCenter(new THREE.Vector3());s.g.rotation.y=Math.atan2(b.x-s.g.position.x,b.z-s.g.position.z);if(s.target.need==='energy'){s.bob.rotation.x=-1.45;s.bob.position.y=.75;}paintHud();}else s.idle=1.2;}
      else{const p=s.g.position,dx=next[0]-p.x,dz=next[1]-p.z,d=Math.hypot(dx,dz),sp=1.5*L.speed*dt;
        if(d<=sp){p.x=next[0];p.z=next[1];s.path.shift();}else{p.x+=dx/d*sp;p.z+=dz/d*sp;}
        const ty=Math.atan2(dx,dz);let da=ty-s.g.rotation.y;while(da>Math.PI)da-=6.283;while(da<-Math.PI)da+=6.283;s.g.rotation.y+=da*Math.min(1,dt*12);
        const sw=Math.sin(s.t*9*Math.min(2,L.speed));s.legL.rotation.x=sw*.7;s.legR.rotation.x=-sw*.7;s.armL.rotation.x=-sw*.5;s.armR.rotation.x=sw*.5;s.bob.position.y=Math.abs(sw)*.04;}
    }else if(s.state==='use'){
      const u=s.use;u.left-=dt;s.legL.rotation.x=s.legR.rotation.x=s.armL.rotation.x=s.armR.rotation.x=0;
      s.needs[u.c.need]=Math.min(100,s.needs[u.c.need]+ (62/(u.c.secs/L.speed))*dt);
      if(u.c.need!=='energy')s.bob.position.y=Math.sin(s.t*3)*.015;
      if(u.left<=0||s.needs[u.c.need]>=99){s.use=null;s.state='idle';s.idle=1;s.bob.rotation.x=0;s.bob.position.y=0;s.label='Done';paintHud();}
    }else{s.legL.rotation.x=s.legR.rotation.x=s.armL.rotation.x=s.armR.rotation.x=0;s.idle-=dt;if(s.idle<=0&&L.auto)chooseNext();else if(s.idle<=0)s.idle=1;}
    bump();
    if(hud&&((s.t*4|0)!==(s._h|0))){s._h=s.t*4;paintHud();}
    void worst;
  }

  /* ---- tap to direct ---- */
  const ray=new THREE.Raycaster(),v2=new THREE.Vector2();
  dom.addEventListener('pointerdown',e=>{
    if(!L.sim||!L.control||host.busy()||e.button!==0||!hudOn)return;
    const rc=dom.getBoundingClientRect();v2.set((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);ray.setFromCamera(v2,camera);
    scan();for(const cnd of L.cands){const hit=ray.intersectObject(cnd.o.holder,true)[0];if(hit){e.stopImmediatePropagation();e.preventDefault();if(goTo(cnd))toast('Sending the Sim to the '+cnd.name+'.');return;}}
  },true);

  /* ---- floating status ---- */
  let hudOn=false;
  function showHud(v){hudOn=v&&!!L.sim;if(!hud){hud=el('div','lv-hud');hud.style.cssText='position:absolute;left:8px;top:112px;z-index:20;width:170px;padding:8px 10px;border-radius:14px;background:rgba(14,15,18,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);color:#eee;font:600 10.5px var(--lab,monospace);pointer-events:none;display:none';stage.appendChild(hud);}
    hud.style.display=hudOn?'block':'none';if(hudOn)paintHud();}
  function paintHud(){
    if(!hud||!hudOn||!L.sim)return;const s=L.sim,mood=Math.round(NEEDS.reduce((a,[k])=>a+s.needs[k],0)/4);
    hud.innerHTML='<div style="display:flex;justify-content:space-between;margin-bottom:4px"><b style="letter-spacing:.08em">SIM</b><span>Mood '+mood+'</span></div>'+
      NEEDS.map(([k,n,col])=>'<div style="display:flex;align-items:center;gap:6px;margin:3px 0"><span style="width:52px;opacity:.8">'+n+'</span><i style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden"><b style="display:block;height:100%;width:'+Math.round(s.needs[k])+'%;background:'+col+'"></b></i></div>').join('')+
      '<div style="opacity:.75;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+s.label+'</div>';
  }

  /* ---- the panel inside Build ---- */
  function panel(parent,refresh){
    const s=sec_(parent,'Live','a Sim in your house');
    s.appendChild(el('div','note','Move a Sim in. Its needs run down; it finds a bed, sofa, fridge, TV or shower, walks there around your walls, and uses it. Needs furniture from the Furnish tab with matching names.'));
    const r=el('div','chips');
    if(!L.sim)r.appendChild(btn('Move a Sim in','pri',()=>{spawn();refresh();}));
    else{r.append(btn('Remove Sim','',()=>{remove();refresh();}),btn('Send to bed','',()=>send('energy')),btn('Send to eat','',()=>send('hunger')),btn('Send to relax','',()=>send('fun')),btn('Send to wash','',()=>send('hygiene')));}
    s.appendChild(r);
    if(L.sim){
      const t=el('div','chips');
      [['Autonomous: '+(L.auto?'on':'off'),()=>{L.auto=!L.auto;refresh();},L.auto],['Tap to direct: '+(L.control?'on':'off'),()=>{L.control=!L.control;refresh();},L.control]].forEach(([l,f,on])=>{const b=el('button','chip',l);b.type='button';b.setAttribute('aria-pressed',!!on);b.addEventListener('click',f);t.appendChild(b);});
      s.appendChild(t);s.appendChild(el('div','sub','Speed'));
      const sp=el('div','chips');[[1,'Normal'],[3,'Fast'],[8,'Very fast']].forEach(([v,l])=>{const b=el('button','chip',l);b.type='button';b.setAttribute('aria-pressed',L.speed===v);b.addEventListener('click',()=>{L.speed=v;refresh();});sp.appendChild(b);});s.appendChild(sp);
      scan();s.appendChild(el('div','sub','Things the Sim can use ('+L.cands.length+')'));
      const lc=el('div','chips');L.cands.slice(0,16).forEach(cd=>lc.appendChild(btn(cd.verb+': '+cd.name,'',()=>{if(goTo(cd))toast('On its way.');})));s.appendChild(lc);
      if(!L.cands.length)s.appendChild(el('div','note','Nothing usable yet. Furnish a room in the Furnish tab, then come back.'));
    }
  }
  const sec_=(p,t,r)=>c.sec(p,t,r);
  function send(need){scan();const s=L.sim;if(!s)return;const o=L.cands.filter(x=>x.need===need);if(!o.length){toast('No furniture for that yet. Furnish a room first.');return;}o.sort((a,b)=>a.o.holder.position.distanceTo(s.g.position)-b.o.holder.position.distanceTo(s.g.position));goTo(o[0]);}
  return {tick,panel,showHud,spawn,remove,has:()=>!!L.sim};
}
