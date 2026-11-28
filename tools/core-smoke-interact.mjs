// Interaction foundation: one affordance system for doors, chairs, drinks and parcels, for the player and for fighters, through Core commands.
export const tests=[];const t=(name,url,body)=>tests.push([name,url,body]);
const H="const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(700);const a=n0.app,W=a.water;a.hold=true;const step=(n=1)=>{for(let i=0;i<n;i++)a.fixedStep({},false)};for(let i=0;i<60&&!a.phys.ready;i++)await wait(250);const ex=c=>n0.exec(c);const put=(P,x,y,z,yaw)=>{P.pos.set(x,y,z);P.prev.copy(P.pos);P.yaw=yaw;P.vel.set(0,0,0);a.phys.teleport(P)};const mk=(prefab,x,y,z,ry=0,parameters={})=>ex({cmd:'entity.create',prefab,id:undefined,position:[x,y,z],rotationDeg:[0,ry,0],parameters});";

t('interact: door opens away from the actor, blocks only when shut, and Stop leaves the record untouched','/core.html?start=blank',`async()=>{${H}
const bad=ex({cmd:'interact.perform',entity:'x',type:'open'});if(bad.code!=='interact.idle')return 'outside Play: '+JSON.stringify(bad);
mk('spawn.player',0,0,6,180);const d=mk('interact.door',0,0,0).entity.id;const before=JSON.stringify(a.entities.serialize());
ex({cmd:'level.play'});await wait(400);const P=a.player,w=a.lv.rt.interact;put(P,0,0,6,Math.PI);const far=ex({cmd:'interact.perform',entity:d,type:'open'});if(far.code!=='interact.range')return 'far door should say range: '+JSON.stringify(far);put(P,0,0,1.6,Math.PI);
const list=ex({cmd:'interact.discover'}).list;if(!list.find(x=>x.entity===d&&x.type==='open'&&x.available))return 'door not discovered '+JSON.stringify(list);
const closedBoxes=a.entities.rt.get(d).colliders().length;if(closedBoxes!==1)return 'closed door collider '+closedBoxes;
const r=ex({cmd:'interact.perform',entity:d,type:'open'});if(!r.ok)return r.msg;step(2);if(a.entities.rt.get(d).colliders().length!==0)return 'collider should be off while swinging';
step(120);const leaf=a.entities.rt.get(d).parts.leaf,deg=leaf.rotation.y*180/Math.PI;if(Math.abs(Math.abs(deg)-100)>1)return 'leaf angle '+deg;
if(deg<0)return 'door swung toward the actor ('+deg+'); actor stood at +z so it should swing to -z (positive y rotation)';
const ev=a.events.log.map(e=>e.type);if(!ev.includes('interaction.opened')||!ev.includes('interaction.settled'))return 'events '+ev;
ex({cmd:'interact.perform',entity:d,type:'open'});step(150);if(Math.abs(leaf.rotation.y)>0.01)return 'did not close';if(a.entities.rt.get(d).colliders().length!==1)return 'collider not back';
ex({cmd:'interact.perform',entity:d,type:'open'});step(60);ex({cmd:'level.stop'});await wait(300);
if(JSON.stringify(a.entities.serialize())!==before)return 'Play changed the authored records';if(Math.abs(a.entities.rt.get(d).parts.leaf.rotation.y)>1e-6)return 'leaf not restored';return true}`);

t('interact: a chair seats one actor at a time; a second actor is refused with a reason; standing releases it','/core.html?start=blank',`async()=>{${H}
mk('spawn.player',0,0,6,180);const c=mk('interact.chair',0,0,0).entity.id;mk('actor.brawler',3,0,3);ex({cmd:'level.play'});await wait(400);const P=a.player,w=a.lv.rt.interact,E=a.lv.rt.actors[0];
put(P,0,0,1.0,Math.PI);const r=ex({cmd:'interact.perform',entity:c,type:'sit'});if(!r.ok)return r.msg;if(!P.frozen)return 'player not seated (frozen)';
const seatY=a.entities.get(c).parameters.seatHeight;if(Math.abs(P.pos.y-(seatY-0.55))>0.02)return 'seat height '+P.pos.y;
E.pos.set(0.3,0,0.9);E.prev.copy(E.pos);E.yaw=Math.PI;const r2=ex({cmd:'interact.perform',entity:c,type:'sit',actor:E.id});if(r2.ok||r2.code!=='interact.busy')return 'second actor should be refused: '+JSON.stringify(r2);
const dl=ex({cmd:'interact.discover'}).list;if(dl.length!==1||dl[0].type!=='stand')return 'while seated only stand: '+JSON.stringify(dl);
const s=ex({cmd:'interact.perform',entity:c,type:'stand'});if(!s.ok)return s.msg;if(P.frozen)return 'still frozen';if(Math.abs(P.pos.z-0.85)>0.02)return 'exit point '+P.pos.z;
const r3=ex({cmd:'interact.perform',entity:c,type:'sit',actor:E.id});if(!r3.ok)return 'chair should be free after standing: '+r3.msg;
ex({cmd:'level.stop'});await wait(300);if(E.frozen)return 'stop left a fighter frozen';return true}`);

t('interact: carry a drink and a parcel (different profiles), sip, and put one on a table by surface','/core.html?start=blank',`async()=>{${H}
mk('spawn.player',0,0,6,180);mk('build.block',0,0,0,0,{size:[1.4,0.8,0.8]});const dr=mk('interact.drink',-4,0,3).entity.id,pa=mk('interact.parcel',4,0,3,0,{mass:12}).entity.id,pn=mk('interact.parcel',-4.6,0,3).entity.id;
ex({cmd:'level.play'});await wait(400);const P=a.player,base=P.speedMul;
put(P,-4,0,4.2,Math.PI);const c1=ex({cmd:'interact.perform',entity:dr,type:'carry'});if(!c1.ok)return c1.msg;const sd=P.speedMul;step(30);
const o=a.entities.rt.get(dr).object,hand=o.position.y;if(hand<0.7||hand>1.2)return 'drink should be at hand height, y='+hand;
const full=ex({cmd:'interact.perform',entity:pn,type:'carry'});if(full.ok||!/full/i.test(full.msg))return 'hands should be full: '+JSON.stringify(full);
for(let i=0;i<3;i++)if(!ex({cmd:'interact.perform',entity:dr,type:'consume'}).ok)return 'sip '+i;if(a.lv.rt.interact.entries.get(dr).st.left!==0)return 'not empty';const e=ex({cmd:'interact.perform',entity:dr,type:'consume'});if(e.ok)return 'empty cup should refuse';
if(a.entities.get(dr).state.left!==1)return 'sipping wrote to the authored record';
put(P,0,0,1.15,Math.PI);P.pos.x=0;const pl=ex({cmd:'interact.perform',entity:dr,type:'place'});if(!pl.ok)return pl.msg;const ty=a.entities.rt.get(dr).object.position.y;if(Math.abs(ty-0.8)>0.03)return 'drink should sit on the table (0.8), y='+ty;
put(P,4,0,4.2,Math.PI);if(!ex({cmd:'interact.perform',entity:pa,type:'carry'}).ok)return 'parcel';if(!(P.speedMul<sd))return 'a 12 kg parcel should slow you more than a cup ('+P.speedMul+' vs '+sd+')';
step(30);const hug=a.entities.rt.get(pa).object.position.y;if(hug<0.8)return 'parcel should be held at the chest '+hug;
ex({cmd:'interact.perform',entity:pa,type:'place'});if(Math.abs(P.speedMul-base)>1e-9)return 'speed not restored';
ex({cmd:'level.stop'});await wait(300);const r=a.entities.get(dr);if(Math.abs(a.entities.rt.get(dr).object.position.x-(-4))>1e-6)return 'drink not back at its authored place';return true}`);

t('interact: sample level has the interactive set and the Use key (F) path works','/core.html?start=blank',`async()=>{${H}
ex({cmd:'level.sample'});const need=['interact.door','interact.chair','interact.drink','interact.parcel'];for(const p of need)if(![...a.entities.recs.values()].some(r=>r.prefab===p))return 'missing '+p;
const d=ex({cmd:'describe'});const txt=JSON.stringify(d);if(!txt.includes('interact.perform'))return 'describe lacks interact.perform';
ex({cmd:'level.play'});await wait(400);const P=a.player;const chair=[...a.entities.recs.values()].find(r=>r.prefab==='interact.chair');
put(P,chair.transform.position[0],0,chair.transform.position[2]+0.9,Math.PI);
if(!a.interact().ok)return 'Use key did nothing';if(!P.frozen)return 'Use key did not sit';a.interact();if(P.frozen)return 'Use key did not stand';return true}`);
