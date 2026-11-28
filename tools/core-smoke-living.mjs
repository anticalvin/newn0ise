// Living-world layer: actors, fixed-step movement, combat, grab, props, saves, lab. Same format as core-smoke.mjs.
// The page's own loop is held (app.hold) and the fixed 60 Hz step is driven by hand, so results do not depend on the software-GL frame rate.
export const tests=[];const t=(name,url,body)=>tests.push([name,url,body]);
const H="const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(700);const a=n0.app,C=a.combat,P=a.player,W=a.water;a.hold=true;const mv=(x,y,run=false,analog=false)=>{const m=a.input.mv;m.x=x;m.y=y;m.run=run;m.analog=analog};const step=(n=1)=>{for(let i=0;i<n;i++)a.fixedStep({},false)};const ready=async()=>{for(let i=0;i<60&&!a.phys.ready;i++)await wait(250);return a.phys.ready};await ready();";

for(const [nm,url] of [['blank','/core.html?start=island'],['coast','/core.html?start=coast'],['lab','/core.html?start=lab']])
t('living: '+nm+' starts clean with the player as an Actor',url,`async()=>{${H}
if(!(P.isPlayer&&typeof P.tryAttack==='function'&&P.character))return 'player is not an Actor';if(!a.phys.ready)return 'physics '+a.phys.error;if(a.session.owner()!=='play')return 'owner '+a.session.owner();
step(90);if(!P.onGround)return 'player not standing after 1.5 s';if(!(a.character&&a.character===P.character))return 'app.character not the actor character';
if('${nm}'==='coast'){if(C.enemies().length!==2)return 'coast fighters '+C.enemies().length;if(!a.boulders.items.some(b=>b.kind==='crate')||!a.boulders.items.some(b=>b.kind==='barrel'))return 'coast props missing'}
if('${nm}'==='blank'&&(C.enemies().length||a.boulders.items.length))return 'blank not empty';
if('${nm}'==='lab'){if(a.name!=='COMBAT LAB')return a.name;if(!a.core.noSave)return 'lab can overwrite the autosave'}
return true}`);

t('living: walk, run and jump with analog speed and variable height','/core.html?start=island',`async()=>{${H}
mv(0,1,false);step(120);const walk=P.speed;mv(0,1,true);step(120);const run=P.speed;
if(Math.abs(walk-2.5)>0.3)return 'walk '+walk;if(Math.abs(run-5.7)>0.4)return 'run '+run;
mv(0,0);step(60);let y0=P.pos.y;a.input.edge.jump=true;a.input.jumpHeld=true;let top=y0;for(let i=0;i<70;i++){a.fixedStep({},false);top=Math.max(top,P.pos.y)}const full=top-y0;
step(90);y0=P.pos.y;a.input.edge.jump=true;a.input.jumpHeld=false;let top2=y0;for(let i=0;i<70;i++){a.fixedStep({},false);top2=Math.max(top2,P.pos.y)}const tap=top2-y0;
if(!(full>1.0))return 'jump too low '+full;if(!(tap<full*0.8))return 'tap jump is not shorter: '+tap+' vs '+full;
mv(0,0.5,false,true);step(120);if(!(P.speed<TUNE_WALK()+0.2&&P.speed>0.6))return 'analog half stick '+P.speed;return true;function TUNE_WALK(){return 2.5}}`);

t('living: camera and render motion stay smooth at 30, 60 and 144 fps','/core.html?start=island',`async()=>{${H}
const out=[];for(const fps of [30,60,144]){P.respawn(0,0,0);P.inv=0;a.rig.snap();step(60);mv(0,1,true);a.cam.yaw=0;a.rig.tYaw=0;a.rig.yaw=0;
 let acc=0,last=null,max=0,sum=0,n=0;const dt=1/fps;const cp=new a.camera.position.constructor();
 for(let f=0;f<fps*3;f++){acc+=dt;while(acc>=1/60){a.fixedStep({},false);acc-=1/60}const al=acc*60;a.phys.interp(al);for(const x of C.actors)x.render(al,dt);a.cam.target.set(P.rpos.x,P.rpos.y+1.5,P.rpos.z);a.rig.update(dt,{explore:true,player:P.pos,vel:P.vel,speed:P.speed,lock:null,combat:false,dodge:false});
  if(f>fps){if(last){const d=a.camera.position.distanceTo(last)/dt;sum+=d;n++;max=Math.max(max,Math.abs(d-(sum/n)))}last=a.camera.position.clone()}}
 out.push([fps,+(sum/n).toFixed(2),+max.toFixed(2)]);}
for(const [fps,mean,dev] of out){if(!(mean>3))return 'camera not following at '+fps+' fps: '+mean;if(dev>mean*0.18)return 'camera jitter at '+fps+' fps: deviation '+dev+' of mean '+mean}return true}`);

t('living: grab lifts a crate, drags a heavy boulder low, a thrown crate hurts a fighter','/core.html?start=island',`async()=>{${H}
const gy=x=>a.terrain.hAt(x,6);const crate=a.boulders.add(3,gy(3)+0.6,6,0.5,undefined,'crate'),boul=a.boulders.add(-4,gy(-4)+1.9,6,1.9,undefined,'boulder');step(90);
const ndc=new a.ndcClass(0,-0.05);a.cam.target.set(P.pos.x,P.pos.y+1.5,P.pos.z);a.rig.snap();a.rig.update(0.016,{explore:true,player:P.pos,vel:P.vel,speed:0,lock:null,combat:false,dodge:false});
if(!a.grab.start(ndc,{p:crate,point:crate.p.clone(),dist:6}))return 'grab did not start';a.grab.liftBias=3;step(150);const lift=crate.cp.y-crate.r-gy(crate.cp.x);a.grab.release();
if(!(lift>=2))return 'crate lifted only '+lift.toFixed(2)+' m';step(120);
a.grab.start(ndc,{p:boul,point:boul.p.clone(),dist:7});a.grab.liftBias=3;step(150);const bl=boul.cp.y-boul.r-gy(boul.cp.x);a.grab.release();if(!(bl<1.2))return 'heavy boulder was lifted '+bl.toFixed(2)+' m';
const f=C.add('brawler',20,6,Math.PI/2);step(60);const hp=f.hp,c2=a.boulders.add(10,f.pos.y+1.4,6,0.5,undefined,'crate');c2.body.setGravityScale(0,true);c2.body.setLinvel({x:16,y:0,z:0},true);a.input.clearEdges();step(40);
if(!(f.hp<hp))return 'thrown crate did not hurt: '+f.hp+' of '+hp;return true}`);

t('living: jab, cross and hook chain, combo counter rises, block, parry and dodge frames','/core.html?start=island',`async()=>{${H}
const d=C.add('heavy',0,2.0,Math.PI);d.faceTarget=false;d.dummy=true;d.maxHp=d.hp=999;a.core.noSave=true;P.respawn(0,0,0);P.yaw=0;P.inv=0;step(30);const names=[];
P.tryAttack('p');for(let i=0;i<150&&names.length<3;i++){a.fixedStep({},false);if(P.state==='attack'){if(names[names.length-1]!==P.atkName)names.push(P.atkName);if(!P.queued&&P.atkT>0.03&&names.length<3)P.tryAttack('p')}}
if(names.join()!=='jab,cross,hook')return 'chain '+names.join();if(!(C.combo.n>=2))return 'combo counter '+C.combo.n;
// block vs unblocked
const E=C.add('brawler',0,6,Math.PI);E.dummy=true;const J={dmg:20,kb:2,stun:.3,hs:.05};const dir={x:0,z:-1};
P.respawn(0,0,0);P.yaw=0;P.inv=0;step(2);P.hp=100;const r1=P.receiveHit(E,J,{x:0,z:-1});const lost=100-P.hp;
P.respawn(0,0,0);P.yaw=0;P.inv=0;step(2);P.hp=100;P.setBlock(true);P.blockT=0.5;const r2=P.receiveHit(E,J,{x:0,z:-1});const lostB=100-P.hp;
if(r1==='ignore'||!(lostB<lost*0.4))return 'block did not cut damage: '+r2+' '+lostB+' vs '+lost;
P.respawn(0,0,0);P.yaw=0;P.inv=0;step(2);E.state='attack';P.setBlock(true);P.blockT=0.05;const r3=P.receiveHit(E,J,{x:0,z:-1});if(r3!=='parry')return 'timed block gave '+r3;
P.respawn(0,0,0);P.yaw=0;P.inv=0;step(60);P.state='free';P.lastDodge=-9;if(!P.tryDodge(1,0))return 'dodge refused';step(3);const hp=P.hp,r4=P.receiveHit(E,J,{x:0,z:-1});if((r4!=='dodge'&&r4!=='ignore')||P.hp!==hp)return 'dodge i-frames '+r4+' hp '+P.hp;return true}`);

t('living: knockdown, getup, KO and respawn all complete','/core.html?start=island',`async()=>{${H}
const E=C.add('brawler',0,4,Math.PI);E.faceTarget=false;E.brain=null;step(30);const K={dmg:16,kb:8,stun:.6,hs:.1,knock:true};
const r=E.receiveHit(P,K,{x:0,z:1});if(r!=='knock'||E.state!=='down')return 'knockdown '+r+' '+E.state;let st=[];for(let i=0;i<260&&E.state!=='free';i++){a.fixedStep({},false);if(st[st.length-1]!==E.state)st.push(E.state)}
if(E.state!=='free'||!st.includes('getup'))return 'getup path '+st.join('>');
E.hp=1;E.inv=0;E.receiveHit(P,{dmg:50,kb:4,stun:.4,hs:.05},{x:0,z:1});if(E.state!=='dead')return 'no KO '+E.state;
E.koAt=C.t;for(let i=0;i<420&&E.state==='dead';i++)a.fixedStep({},false);if(E.state==='dead'||E.hp<=0)return 'fighter did not respawn';
P.hp=1;P.inv=0;P.receiveHit(E,{dmg:50,kb:4,stun:.4,hs:.05},{x:0,z:-1},{unblockable:true});if(P.state!=='dead')return 'player not KO '+P.state;C.respawnPlayer();step(5);if(P.state==='dead'||!(P.hp>0))return 'player did not respawn';return true}`);

t('living: sculpting under a standing actor and a prop does not drop them through','/core.html?start=island',`async()=>{${H}
const crate=a.boulders.add(6,a.terrain.hAt(6,0)+0.6,0,0.5,undefined,'crate');P.respawn(0,0,0);P.inv=0;step(120);
a.core.muted=false;n0.exec({cmd:'terrain.stroke',tool:'raise',center:[0,0],radius:12,strength:1,duration:2.5});await wait(900);a.phys.syncTerrain(false);await wait(300);a.phys.syncTerrain(false);step(300);
const g=a.terrain.hAt(P.pos.x,P.pos.z);if(P.pos.y<g-0.15)return 'actor under ground '+(g-P.pos.y).toFixed(2);const gc=a.terrain.hAt(crate.cp.x,crate.cp.z);if(crate.cp.y<gc-0.1)return 'crate under ground '+(gc-crate.cp.y).toFixed(2);return true}`);

t('living: save, reload and Continue restore actors and prop kinds; old saves still load','/core.html?start=island',`async()=>{${H}
a.core.noSave=false;C.add('heavy',10,10,0);C.add('dummy',-10,10,0);a.boulders.add(5,a.terrain.hAt(5,5)+1,5,0.5,undefined,'crate');a.boulders.add(-5,a.terrain.hAt(-5,5)+1,5,0.45,undefined,'barrel');
const d=JSON.parse(JSON.stringify(await a.core.serialize()));if(d.actors.length!==2)return 'saved actors '+d.actors.length;if(!d.boulders.some(b=>b[5]==='crate')||!d.boulders.some(b=>b[5]==='barrel'))return 'prop kinds not saved';
n0.exec({cmd:'scene.new',preset:'blank'});if(C.enemies().length||a.boulders.items.length)return 'scene.new kept things';
await a.core.load(d);await wait(200);const kinds=C.enemies().map(e=>e.kind).sort().join(),pk=a.boulders.items.map(b=>b.kind).sort().join();
if(kinds!=='dummy,heavy')return 'restored actors '+kinds;if(pk!=='barrel,crate')return 'restored props '+pk;
const old=JSON.parse(JSON.stringify(d));delete old.actors;old.boulders=old.boulders.map(b=>b.slice(0,5));await a.core.load(old);await wait(100);if(C.enemies().length!==0)return 'old save kept fighters';if(!a.boulders.items.every(b=>b.kind==='boulder'))return 'old props not boulders';
await a.core.autosave();const ok=await a.core.restore();if(!ok)return 'Continue could not restore';return true}`);

t('living: commands and console words, limits, undo','/core.html?start=island',`async()=>{${H}
let r=n0.exec({cmd:'actor.spawn',kind:'brawler',x:8,z:8});if(!r.ok||C.enemies().length!==1)return 'spawn '+r.msg;r=n0.exec({cmd:'boulder.drop',kind:'barrel',x:0,z:8});if(!r.ok||!a.boulders.items.some(b=>b.kind==='barrel'))return 'barrel '+r.msg;
for(const w of ['crate','heavy','dummy','fighter']){const q=n0.run(w);if(!q.ok)return w+': '+q.msg}if(C.enemies().length!==4)return 'console fighters '+C.enemies().length;
n0.exec({cmd:'undo'});n0.exec({cmd:'undo'});r=n0.exec({cmd:'actor.clear'});if(!r.ok||C.enemies().length)return 'clear '+r.msg;n0.exec({cmd:'undo'});if(!C.enemies().length)return 'undo clear failed';
for(let i=0;i<12;i++)n0.exec({cmd:'actor.spawn',kind:'dummy',x:i,z:-10});if(C.enemies().length>8)return 'fighter limit '+C.enemies().length;
if(!n0.exec({cmd:'describe'}).commands['actor.spawn'])return 'describe lacks actor.spawn';return true}`);

t('living: input has one owner, combat keys act only in Play, Tab locks on, Tune toggles','/core.html?start=coast',`async()=>{${H}
const key=(k,o={})=>dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,...o}));
a.setMode('edit');key('j');if(a.input.edge.punch)return 'punch latched in the editor';a.setMode('explore');key('j');if(!a.input.edge.punch)return 'J did not latch in Play';a.input.clearEdges();key('k');key('c');if(!a.input.edge.kick||!a.input.edge.dodge)return 'K or C not latched';a.input.clearEdges();
a.ui.showGuide();key('j');if(a.input.edge.punch)return 'punch under a sheet';a.ui.closeAll();
const f=C.enemies().find(e=>e.kind==='brawler');P.pos.set(f.pos.x-4,f.pos.y,f.pos.z);a.cam.yaw=Math.atan2(-(f.pos.x-P.pos.x),-(f.pos.z-P.pos.z));key('Tab');if(!P.lock)return 'Tab did not lock on';key('Tab');if(P.lock)return 'Tab did not release';
const tp=document.querySelector('.tune');if(!tp)return 'no tune panel';const was=tp.hidden;key('t',{code:'KeyT'});await wait(50);if(tp.hidden===was)return 'T did not toggle tune';return true}`);

t('living: Tune values act immediately and the Labs entry exists','/core.html',`async()=>{${H}
const TUNE=a.tune;const keep=TUNE.walk;TUNE.walk=1.2;P.respawn(0,0,0);mv(0,1,false);step(120);const slow=P.speed;TUNE.walk=keep;if(slow>1.5)return 'TUNE.walk ignored: '+slow;
document.querySelector('[data-tab="Labs"]').click();if(![...document.querySelectorAll('.ws-template')].some(b=>/Combat lab/.test(b.textContent)))return 'no Combat lab entry';return true}`);

t('living: lab never overwrites the autosave and leaving it restores the scene','/core.html?start=island',`async()=>{${H}
a.core.noSave=false;await a.core.autosave();const before=localStorage.getItem('n0ise.core.scene');if(!before)return 'no baseline save';
await a.start('lab');await wait(300);n0.exec({cmd:'scatter.add',center:[5,5],count:3});await a.core.autosave();if(localStorage.getItem('n0ise.core.scene')!==before)return 'lab overwrote the autosave';
if(a.water.mesh.visible)return 'water visible in arena';await a.start('island');await wait(300);if(!a.water.mesh.visible)return 'water not restored after the lab';if(a.core.noSave)return 'noSave stuck';return true}`);

t('living: first person shooter still runs with the actor player','/core.html?start=island',`async()=>{${H}
a.hold=false;await a.shooter.enter({});await wait(600);if(!a.shooter.active)return 'shooter did not start';a.input.keys.add('w');await wait(5000);a.input.keys.delete('w');const moved=Math.hypot(P.pos.x,P.pos.z);a.shooter.exit();await wait(300);
if(!(moved>0.15))return 'player did not move in first person: '+moved;if(!a.character.root.visible)return 'character hidden after leaving first person';return true}`);

t('physics: the test page opens the model yard and every model rests on the ground','/physics.html',`async()=>{${H}
if(a.name!=='PHYSICS TEST')return 'name '+a.name;const n=a.dyn.count;if(n<30)return 'only '+n+' physical models';step(480);
const bad=[];for(const[id,L]of a.dyn.live){const p=L.b.p,g=a.terrain.hAt(p.x,p.z);if(p.y<g-0.2||!isFinite(p.y)||Math.abs(p.x)>126)bad.push(id+' y='+p.y.toFixed(2)+' g='+g.toFixed(2))}
if(bad.length)return 'models below ground or lost: '+bad.slice(0,4).join('; ');
const moving=[...a.dyn.live.values()].filter(L=>L.b.body&&!L.b.body.isSleeping()&&L.b.v.length()>1.5).length;if(moving>3)return moving+' models still moving fast after 8 s';return true}`);

t('physics: a placed model can be made physical, shoved, saved and loaded again','/core.html?start=island',`async()=>{${H}
a.core.exec({cmd:'asset.place',assetId:'nature.rock',at:[3,0]});const id=a.entities.list()[0].id;const r=a.core.exec({cmd:'entity.physics',id});if(!r.ok)return r.msg;
if(!a.dyn.live.has(id))return 'not attached';const b=a.dyn.live.get(id).b;step(120);b.body.applyImpulse({x:b.mass*3,y:0,z:0},true);step(90);a.phys.interp(1);const mx=b.p.x;if(!(mx>3.3))return 'impulse did not move the model: '+mx;
const sv=await a.core.serialize();const rec=sv.entities.find(e=>e.id===id);if(rec.components.collider.type!=='dynamic')return 'collider not saved';if(Math.abs(rec.transform.position[0]-mx)>0.5)return 'resting place not saved '+rec.transform.position[0]+' vs '+mx;
if(sv.boulders.some(x=>x[5]==='model'))return 'model leaked into boulders';
a.core.exec({cmd:'scene.new',preset:'blank'});if(a.dyn.count)return 'bodies left after new scene';await a.core.load(sv);
await wait(200);step(30);if(!a.dyn.live.has(id))return 'not physical after load';const r2=a.core.exec({cmd:'entity.physics',id,mode:'static'});if(!r2.ok||a.dyn.live.has(id))return 'could not fix it again';return true}`);

t('physics: shooting while aiming down sights (right button held, then left)','/core.html?start=island',`async()=>{${H}
a.hold=false;await a.shooter.enter({});await wait(600);const S=a.shooter,cv=a.canvas;
const ev=(type,buttons,button)=>window.dispatchEvent(new PointerEvent(type,{pointerType:'mouse',buttons,button,bubbles:true,cancelable:true}));
S.locked=true;Object.defineProperty(document,'pointerLockElement',{get:()=>cv,configurable:true});
ev('pointermove',2,-1);await wait(100);if(!S.adsHold)return 'right button did not aim';
ev('pointermove',3,-1);await wait(100);if(!S.trigger)return 'left button while aiming did not fire (no pointerdown is sent in that case)';
const shots=S.shots;await wait(400);S.trigger=true;await wait(500);ev('pointermove',2,-1);await wait(100);if(S.trigger)return 'releasing left kept firing';if(!S.adsHold)return 'releasing left dropped the aim';ev('pointermove',0,-1);await wait(100);if(S.adsHold)return 'aim stuck';S.exit();return true}`);
