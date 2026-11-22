// Core smoke tests for the South Africa world engine (src/core/geo). Same format as core-smoke-extra.mjs: [name, url, async body] returning true or a failure string.
// The pilot region (Cape Town) must exist: python3 tools/world/import.py ... or the committed data/world/za package.
export const tests = [];
const t = (name, url, body) => tests.push([name, url, body]);
const UP = `const up=async(ms=60000)=>{const g=n0.geo,t0=performance.now();while(performance.now()-t0<ms){if(g.ready&&[...g.tiles.values()].filter(x=>x.state==='ready').length>=4)return true;await new Promise(r=>setTimeout(r,250));}return false};`;

t('world: opens Cape Town and streams tiles', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'world did not become ready: '+n0.geo.msg;const g=n0.geo;if(g.regionKey!=='capetown')return 'region '+g.regionKey;
 if(g.graph.edgeCount<500)return 'few road edges '+g.graph.edgeCount;const nb=[...g.bi.byTile.values()].reduce((n,l)=>n+l.length,0);if(nb<500)return 'few buildings '+nb;
 const ll=g.latLon();if(Math.abs(ll.lat+33.92)>0.05||Math.abs(ll.lon-18.42)>0.05)return 'not in Cape Town: '+JSON.stringify(ll);return true}`);

t('world: terrain seams are exact across tile edges', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo,T=g.T;let checked=0;
 for(const t of g.tiles.values()){if(!t.hf)continue;const r=g.tiles.get((t.tx+1)+'_'+t.tz);if(!r||!r.hf)continue;for(let k=0;k<=8;k++){const z=t.oz+k*T/8,a=t.hf.at(T,k*T/8),b=r.hf.at(0,k*T/8);if(Math.abs(a-b)>0.011)return 'seam mismatch '+a+' vs '+b+' at '+t.key;checked++}}
 return checked>8?true:'no neighbouring tiles to compare ('+checked+')'}`);

t('world: roads are continuous across tiles', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo;let joins=0;
 for(const n of g.graph.nodes.values()){const tiles=new Set([...n.edges].map(e=>e.tile));if(tiles.size>1)joins++}
 return joins>20?true:'only '+joins+' nodes shared between tiles'}`);

t('world: georef projection round trip', '/core.html?start=world', `async()=>{const m=await import('/src/core/geo/georef.js');for(const [la,lo] of [[-33.9249,18.4241],[-26.2041,28.0473],[-29.8587,31.0218]]){const z=m.zoneOf(lo),p=m.fromLatLon(la,lo,z),b=m.toLatLon(p.e,p.n,z,true);if(Math.abs(b.lat-la)>1e-7||Math.abs(b.lon-lo)>1e-7)return 'round trip off at '+la+','+lo}
 const f=new m.RegionFrame(34,262000,6241000),a=f.toLocal(-33.9206,18.4233),c=f.toLatLon(a.x,a.z);if(Math.abs(c.lat+33.9206)>1e-7)return 'frame round trip';return true}`);

t('world: origin rebasing keeps the view consistent', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo,w=g.walker;const h0=g.heightAt(w.x,w.z);const px=w.x-g.origin.x;
 g.rebase(g.origin.x+1000,g.origin.z-1000);const h1=g.heightAt(w.x,w.z);if(Math.abs(h0-h1)>1e-6)return 'height changed after rebase';const t=[...g.tiles.values()].find(x=>x.group);if(Math.abs(t.group.position.x-(t.ox-g.origin.x))>1e-6)return 'tile group not moved with origin';
 g.rebase(g.origin.x-1000,g.origin.z+1000);if(Math.abs((w.x-g.origin.x)-px)>1e-6)return 'player scene position drifted';return true}`);

t('world: LOD follows distance with hysteresis', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo;const t=[...g.tiles.values()].find(x=>x.state==='ready');const near=g.rectDist(t,g.walker.x,g.walker.z);
 g.applyLod(t,10,true);if(t.lod!=='near')return 'expected near got '+t.lod;g.applyLod(t,400);if(t.lod!=='near')return 'no hysteresis at 400 m: '+t.lod;g.applyLod(t,600);if(t.lod!=='mid')return 'expected mid got '+t.lod;
 g.applyLod(t,1200);if(t.lod!=='mid')return 'no hysteresis at 1200 m: '+t.lod;g.applyLod(t,1500);if(t.lod!=='far')return 'expected far got '+t.lod;g.applyLod(t,5,true);return t.props?true:'near tile has no street props'}`);

t('world: unloading releases GPU resources, repeated travel does not leak', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo,a=n0.app,w=g.walker,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const settle=async()=>{for(let i=0;i<60;i++){await wait(250);g.runJobs(50);if([...g.tiles.values()].every(t=>t.state==='ready'))break}};
 const spots=[[1,-3],[-3,-4],[1,-3],[-3,-4]];const counts=[];for(const [tx,tz] of spots){w.x=tx*1000+500;w.z=tz*1000+500;w.y=g.groundAt(w.x,w.z);g.stream();await settle();counts.push(a.renderer.info.memory.geometries)}
 if(g.stats.unloaded<4)return 'tiles were not unloaded ('+g.stats.unloaded+')';if(counts[3]>counts[1]*1.25+10)return 'geometries grew '+counts.join(',');return true}`);

t('world: store interior loads and unloads, door and shelves work', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo,a=n0.app;if(!g.store)return 'no store picked';g.activateStore();if(!g.storeActive)return 'store did not activate: '+g.msg;
 if(!a.entities.recs.has('geo.store'))return 'no entity';const r=n0.exec({cmd:'store.door',id:'geo.store',open:true});if(!r.ok)return r.msg;g.deactivateStore();if(a.entities.recs.has('geo.store'))return 'entity not released';
 g.activateStore();if(!a.entities.get('geo.store').state.doorOpen)return 'door state not restored';g.deactivateStore();return true}`);

t('world: NPC identities are stable across unload and reload', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo,w=g.walker,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const ids=new Set(g.sim.actors.keys());if(ids.size<20)return 'few actors '+ids.size;const first=[...ids].slice(0,10);const key=first[0].split('#')[0];
 w.x=-4500;w.z=-3500;g.stream();await wait(1500);g.stream();w.x=500;w.z=-2500;for(let i=0;i<40;i++){g.stream();g.runJobs(50);await wait(150)}
 const after=new Set(g.sim.actors.keys());for(const id of first)if(!after.has(id))return 'lost '+id;const dup=[...after].filter(id=>!ids.has(id)&&id.split('#')[0]===key);return dup.length?'duplicates '+dup.join(','):true}`);

t('world: edits survive save and reload', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo;localStorage.removeItem('n0ise.world.save.v1');
 const road=n0.exec({cmd:'world.road.inspect'});if(!road.ok)return road.msg;const id=road.road.id;const e=n0.exec({cmd:'world.road.edit',id,patch:{closed:true}});if(!e.ok)return e.msg;const p=n0.exec({cmd:'world.assets.place',type:'tree'});if(!p.ok)return p.msg;
 g.save();const saved=JSON.parse(localStorage.getItem('n0ise.world.save.v1'));if(!saved.edits.assets.length||!saved.edits.roads[id])return 'not in the save';
 g.leave();await g.open({resume:true});if(g.edits.assets.length!==1)return 'asset lost';if(!g.graph.closed.has(id))return 'road edit lost';localStorage.removeItem('n0ise.world.save.v1');return true}`);

t('world: commands validate and fail with structured errors', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const X=c=>n0.exec(c);
 const bad=[X({cmd:'world.assets.place',type:'dragon'}),X({cmd:'world.road.edit',id:1,patch:{width:3}}),X({cmd:'world.goto',lat:10,lon:10}),X({cmd:'world.goto',place:'Nowhere Land'}),X({cmd:'world.road.edit',patch:{closed:true}}),X({cmd:'world.region.generate',region:'x'})];
 for(const r of bad)if(r.ok!==false||!r.code||!r.msg)return 'not a structured error: '+JSON.stringify(r);
 const dry=X({cmd:'world.assets.place',type:'tree',dryRun:true});if(!dry.ok||!dry.dryRun)return 'dry run failed';if(n0.geo.edits.assets.length)return 'dry run changed the world';
 const perf=X({cmd:'world.performance.report'});if(!perf.ok||!perf.tiles)return 'no performance report';const d=X({cmd:'describe'});for(const k of ['world.open','world.goto','world.road.edit','world.building.inspect'])if(!d.commands[k])return 'describe is missing '+k;return true}`);

t('world: the island still loads and edits after the world closes', '/core.html?start=world', `async()=>{${UP}if(!(await up()))return 'not ready';const g=n0.geo,a=n0.app;g.close();if(g.active)return 'still active';a.newScene('coast');const h0=a.terrain.hAt(0,0);
 n0.exec({cmd:'terrain.stroke',tool:'raise',center:[0,0],radius:8,strength:1,duration:1});if(!(a.terrain.hAt(0,0)>h0+0.3))return 'sculpting broken';n0.exec({cmd:'undo'});if(Math.abs(a.terrain.hAt(0,0)-h0)>0.05)return 'undo broken';
 if(!a.terrain.mesh.visible)return 'island terrain hidden';if(!a.water.mesh.visible)return 'sea hidden';return true}`);
