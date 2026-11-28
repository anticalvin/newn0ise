// Level creator (Blank scene): empty grid space, level kit prefabs as entities, Play runtime, guns, pickups, car, save/load.
export const tests=[];const t=(name,url,body)=>tests.push([name,url,body]);
const H="const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(700);const a=n0.app,C=a.combat,W=a.water;a.hold=true;const step=(n=1)=>{for(let i=0;i<n;i++)a.fixedStep({},false)};const ready=async()=>{for(let i=0;i<60&&!a.phys.ready;i++)await wait(250);return a.phys.ready};await ready();const ex=c=>n0.exec(c);";

t('level: Blank opens as an empty grid space in the editor','/core.html?start=blank',`async()=>{${H}
if(!a.level)return 'not a level arena';if(a.mode!=='edit')return 'mode '+a.mode;if(W.mesh.visible||a.palms.mesh.visible||a.grass.mesh.visible||a.terrain.mesh.visible)return 'island, water, palms or grass still visible';
if(!a.scene.getObjectByName('level-floor'))return 'no grid floor';if(a.entities.size||a.boulders.items.length||C.enemies().length)return 'not empty';if(a.name!=='Blank level')return a.name;
const r=ex({cmd:'state'});return true}`);

t('level: every level prefab can be placed, moved, undone and redone','/core.html?start=blank',`async()=>{${H}
const ids=['build.block','build.pillar','build.ramp','build.cylinder','build.sphere','prop.crate','prop.barrel','prop.boulder','pickup.pistol','pickup.rifle','pickup.shotgun','pickup.health','pickup.ammo','actor.brawler','actor.heavy','actor.dummy','spawn.player','vehicle.car','light.point'];
let i=0;for(const p of ids){const r=ex({cmd:'entity.create',prefab:p,position:[(i++%7)*4-12,0,Math.floor(i/7)*5-8]});if(!r.ok)return p+': '+r.msg}
if(a.entities.size!==ids.length)return 'placed '+a.entities.size;
const id=ex({cmd:'entity.list'}).entities[0].id;ex({cmd:'entity.set',id,position:[5,0,5],rotationDeg:[0,45,0],parameters:{size:[3,3,3]}});const r=a.entities.get(id);if(r.transform.position[0]!==5||r.parameters.size[0]!==3)return 'set failed';
ex({cmd:'undo'});if(a.entities.get(id).transform.position[0]===5)return 'undo of set did not work';ex({cmd:'redo'});if(a.entities.get(id).transform.position[0]!==5)return 'redo failed';
ex({cmd:'entity.remove',id});if(a.entities.size!==ids.length-1)return 'remove';ex({cmd:'undo'});if(a.entities.size!==ids.length)return 'undo remove';
const bad=ex({cmd:'entity.create',prefab:'build.block',parameters:{size:[0,0,0]}});if(!bad.ok||a.entities.get(bad.entity.id).parameters.size[0]!==0.1)return 'size not clamped to 0.1 m';const bad2=ex({cmd:'entity.create',prefab:'light.point',parameters:{color:'red'}});if(bad2.ok)return 'bad colour accepted';return true}`);

t('level: ramp, cylinder, sphere and block get real colliders; the player can stand on a block','/core.html?start=blank',`async()=>{${H}
ex({cmd:'entity.create',prefab:'build.block',position:[0,0,-3],parameters:{size:[4,1,4]}});ex({cmd:'entity.create',prefab:'build.ramp',position:[8,0,0]});ex({cmd:'entity.create',prefab:'build.cylinder',position:[-8,0,0]});ex({cmd:'entity.create',prefab:'build.sphere',position:[-14,0,0]});
await wait(300);const cols=a.entities.colliders();if(cols.length!==4)return 'colliders '+cols.length+' '+JSON.stringify(cols.map(c=>c.type||'box'));if(!cols.some(c=>c.type==='hull')||!cols.some(c=>c.type==='cyl')||!cols.some(c=>c.type==='ball'))return 'missing shapes';
a.setMode('explore');await wait(300);const P=a.player;P.pos.set(0,3,-3);P.prev.copy(P.pos);a.phys.teleport(P);step(120);if(!(P.pos.y>0.9&&P.pos.y<1.2))return 'not standing on the block: y='+P.pos.y;return true}`);

t('level: save, reload and Continue restore the level and the arena','/core.html?start=blank',`async()=>{${H}
ex({cmd:'level.sample'});const n=a.entities.size;if(n<20)return 'sample placed '+n;const d=await a.core.serialize();if(!d.level)return 'level flag not saved';
await a.start('coast');await wait(300);if(a.level)return 'coast is a level arena';if(!W.mesh.visible)return 'coast lost its water';
await a.core.load(JSON.parse(JSON.stringify(d)));await wait(300);if(!a.level)return 'arena not restored';if(a.entities.size!==n)return 'entities '+a.entities.size+' vs '+n;if(W.mesh.visible)return 'water visible in a level';
const doc=ex({cmd:'level.save'}).doc;if(doc.format!=='n0ise.level'||doc.ents.length!==n)return 'export '+doc.ents.length;a.entities.clear();const r=ex({cmd:'level.load',doc});if(!r.ok||a.entities.size!==n)return 'import '+r.msg;
const old=ex({cmd:'level.load',doc:{format:'n0ise.level',v:1,ents:[{id:'a',prefab:'build.block',p:[0,1,0],r:[0,0,0],s:[2,2,2],params:{}},{id:'b',prefab:'prop.crate',p:[3,0.5,0],r:[0,0,0],s:[1,1,1],params:{}},{id:'c',prefab:'nope.x',p:[0,0,0]}]}});
if(!old.ok||a.entities.size!==2||old.skipped.length!==1)return 'v1 import '+JSON.stringify(old);const blk=a.entities.get('a');if(Math.abs(blk.transform.position[1])>1e-6)return 'v1 block not moved to the floor: '+blk.transform.position[1];return true}`);

t('level: Play builds the runtime, Stop restores the editor untouched','/core.html?start=blank',`async()=>{${H}
ex({cmd:'level.sample'});await wait(200);const before=JSON.stringify(a.entities.serialize());const nb=a.boulders.items.length;
ex({cmd:'level.play'});await wait(400);if(a.mode!=='explore'||!a.lv.rt)return 'not playing';const rt=a.lv.rt;if(rt.props.length<8)return 'props '+rt.props.length;if(rt.actors.length!==3)return 'fighters '+rt.actors.length;if(rt.cars.length!==1)return 'cars';if(rt.pick.length!==5)return 'pickups '+rt.pick.length;
const P=a.player;step(60);if(Math.hypot(P.pos.x-0,P.pos.z-12)>0.6)return 'player not at spawn.player: '+P.pos.x.toFixed(2)+','+P.pos.z.toFixed(2);
step(300);const dumb=rt.actors[0];if(!dumb.alive)return 'a fighter died on its own';const crate=rt.props.find(b=>b.kind==='crate');if(!crate||!crate.body)return 'no crate body';
ex({cmd:'level.stop'});await wait(200);if(a.mode!=='edit'||a.lv.rt)return 'not stopped';if(a.boulders.items.length!==nb)return 'props leaked '+a.boulders.items.length;if(C.enemies().length)return 'fighters leaked';
const after=JSON.stringify(a.entities.serialize());if(after!==before)return 'entities changed by playing';return true}`);

t('level: pickups collect, guns shoot fighters and push crates','/core.html?start=blank',`async()=>{${H}
ex({cmd:'entity.create',prefab:'spawn.player',position:[0,0,10],rotationDeg:[0,180,0]});ex({cmd:'entity.create',prefab:'pickup.pistol',position:[0,0,8.5]});ex({cmd:'entity.create',prefab:'pickup.health',position:[3,0,10]});ex({cmd:'entity.create',prefab:'actor.dummy',position:[0,0,0]});ex({cmd:'entity.create',prefab:'prop.crate',position:[3,0,2]});
ex({cmd:'level.play'});await wait(400);const rt=a.lv.rt,P=a.player,G=a.guns;P.hp=50;P.pos.set(3,0,10);P.prev.copy(P.pos);a.phys.teleport(P);step(30);if(!(P.hp>=90))return 'health pickup did not heal '+P.hp;
P.pos.set(0,0,8.4);P.prev.copy(P.pos);a.phys.teleport(P);step(30);if(!G.inv.pistol||G.cur!=='pistol')return 'pistol not picked up';
const d=rt.actors[0],hp0=d.hp;P.pos.set(0,0,6);P.prev.copy(P.pos);a.phys.teleport(P);step(5);
a.cam.yaw=0;a.rig.snap&&a.rig.snap();for(let i=0;i<10&&d.hp>=hp0;i++){const ph=a.phys;const o={x:P.pos.x,y:P.pos.y+1.4,z:P.pos.z};const dir={x:d.pos.x-o.x,y:d.pos.y+1-o.y,z:d.pos.z-o.z};const L=Math.hypot(dir.x,dir.y,dir.z);G.shoot(new a.camera.position.constructor(o.x,o.y,o.z),new a.camera.position.constructor(dir.x/L,dir.y/L,dir.z/L),{dmg:20,range:90,imp:14,pellets:1},new a.camera.position.constructor(o.x,o.y,o.z),P);step(20)}
if(!(d.hp<hp0))return 'pistol shot did not damage the fighter';
const cr=rt.props.find(b=>b.kind==='crate'),x0=cr.cp.x;const o={x:cr.cp.x,y:cr.cp.y+0.2,z:cr.cp.z+5};const V=a.camera.position.constructor;G.shoot(new V(o.x,o.y,o.z),new V(0,0,-1),{dmg:20,range:90,imp:400,pellets:1},new V(o.x,o.y,o.z),P);step(30);const v=cr.body.linvel();if(!(Math.hypot(v.x,v.y,v.z)>0.3||Math.abs(cr.cp.z-2)>0.05))return 'shot did not push the crate';return true}`);

t('level: F enters and exits the car, it drives and does not flip','/core.html?start=blank',`async()=>{${H}
ex({cmd:'entity.create',prefab:'spawn.player',position:[0,0,6],rotationDeg:[0,180,0]});ex({cmd:'entity.create',prefab:'vehicle.car',position:[3,0,6]});ex({cmd:'level.play'});await wait(400);const rt=a.lv.rt,P=a.player,car=rt.cars[0];step(120);
P.pos.set(car.cp.x-2,0,car.cp.z);P.prev.copy(P.pos);a.phys.teleport(P);step(5);if(!a.lv.interact())return 'F found no car';if(a.driving!==car)return 'not driving';
const m=a.input.mv;m.y=1;m.x=0;a.input.jumpHeld=false;step(300);const sp=car.speed;if(!(sp>8))return 'car did not accelerate: '+sp;if(!(sp>8))return 'car did not accelerate: '+sp;m.x=-1;step(120);m.x=0;m.y=0;step(60);
const up=new a.camera.position.constructor(0,1,0).applyQuaternion(car.cq);if(up.y<0.7)return 'car flipped: up.y='+up.y;if(Math.abs(car.cp.y)>3)return 'car left the ground plane: '+car.cp.y;
a.lv.interact();if(a.driving)return 'still driving';if(P.hidden)return 'player still hidden';return true}`);

t('level: the camera boom is pushed in by level walls','/core.html?start=blank',`async()=>{${H}
ex({cmd:'entity.create',prefab:'spawn.player',position:[0,0,0],rotationDeg:[0,180,0]});ex({cmd:'entity.create',prefab:'build.block',position:[0,0,3],parameters:{size:[8,6,0.5]}});await wait(300);
ex({cmd:'level.play'});await wait(400);a.rig.setView(0,0.1,6);a.rig.snap();a.hold=false;await wait(800);a.hold=true;const d=a.camera.position.distanceTo(a.cam.target);const hit=a.phys.castBoom(a.cam.target,0,0,1,7);if(hit===null)return 'boom ray saw no wall';if(!(a.camera.position.z<2.9))return 'camera went through the wall: z='+a.camera.position.z;return true}`);

t('level: the player walks up a ramp and up stairs','/core.html?start=blank',`async()=>{${H}
ex({cmd:'entity.create',prefab:'build.ramp',position:[0,0,0]});ex({cmd:'entity.create',prefab:'build.stairs',position:[20,0,0],parameters:{width:3,length:5,height:2,steps:8}});a.phys.buildHeightfield();await wait(300);a.setMode('explore');await wait(300);
const P=a.player,mv=a.input.mv;const go=(x,z,dx,dz,n)=>{P.pos.set(x,0.5,z);P.prev.copy(P.pos);P.vel.set(0,0,0);a.phys.teleport(P);step(40);let top=0;mv.x=0;mv.y=0;for(let i=0;i<n;i++){const f=a.cam.yaw;mv.x=0;mv.y=1;const ang=Math.atan2(dx,dz);a.cam.yaw=Math.atan2(-dx,-dz);step(1);top=Math.max(top,P.pos.y)}mv.y=0;return top};
const ramp=go(0,6,0,-1,300);const st=[go(20,6,0,-1,300),go(20,-6,0,1,300),go(14,0,1,0,300),go(26,0,-1,0,300)];const best=Math.max(...st);
if(!(ramp>1.6))return 'ramp: reached y='+ramp.toFixed(2);if(!(best>1.5))return 'stairs: best '+st.map(v=>v.toFixed(2)).join(',');return true}`);

t('schema: every level and primitive prefab declares components and a schema; describe, validation and defaults come from it','/core.html?start=blank',`async()=>{${H}
const d=ex({cmd:'describe'}).prefabs;const need=['prim.box','build.block','build.ramp','prop.boulder','pickup.rifle','actor.brawler','vehicle.car','light.point','spawn.player','asset','build.wall'];
for(const n of need){if(!d[n])return 'describe missing '+n;if(!d[n].components.length)return n+' declares no components'}
if(!d['light.point'].parameters.find(f=>f.name==='intensity'&&f.max===400))return 'light schema';
let r=ex({cmd:'entity.create',prefab:'light.point',parameters:{intensity:999}});if(r.ok||!/0 to 400/.test(r.msg))return 'range not enforced: '+JSON.stringify(r);
r=ex({cmd:'entity.create',prefab:'vehicle.car',parameters:{color:'red'}});if(r.ok)return 'bad colour accepted';
r=ex({cmd:'entity.create',prefab:'prop.boulder'});if(!r.ok||r.entity.parameters.r!==1.1)return 'boulder default '+JSON.stringify(r.entity&&r.entity.parameters);
r=ex({cmd:'entity.create',prefab:'build.block',parameters:{size:[3,3,3]}});if(!r.ok||r.entity.parameters.color!=='#9aa1ab')return 'block default colour';
a.editor.select([r.entity.id]);const p=document.createElement('div');a.editor.panelScene(p);if(p.querySelectorAll('input[type=color]').length<1)return 'details panel has no colour field from the schema';
const h=n0.run('prefab light.point');if(!h.ok||!/intensity/.test(h.msg))return 'prefab help';
return true}`);
