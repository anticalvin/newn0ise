const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const G = runInNewContext(readFileSync(join(__dirname,'..','procgraph.js'),'utf8')+'\nStudioProc');
const plain = v => JSON.parse(JSON.stringify(v));
const mean = a => { let s = 0; for (let i = 0; i < a.length; i += 4) s += a[i]; return s/(a.length/4); };
const diff = (a,b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i]-b[i]); return s/(a.length/4); };

test('typed ports: images and numbers do not mix, loops are refused, feedback may loop',() => {
  const g = G.create(), n = G.createNode('noise'), t = G.createNode('time'), b = G.createNode('blend'), f = G.createNode('feedback');
  g.nodes.push(n,t,b,f);
  assert.match(G.connect(g,t.id,'output','input'),/needs an image/); assert.equal(G.connect(g,n.id,b.id,'a'),null);
  assert.match(G.connect(g,n.id,b.id,'missing'),/does not exist/); assert.equal(G.connect(g,b.id,f.id,'input'),null); assert.equal(G.connect(g,f.id,b.id,'b'),null,'a loop through Feedback is allowed');
  const th = G.createNode('threshold'); g.nodes.push(th); G.connect(g,b.id,th.id,'input'); assert.match(G.connect(g,th.id,b.id,'a'),/loop/);
  assert.match(G.bind(g,n.id,th.id,'level'),/number node/); assert.equal(G.bind(g,t.id,th.id,'level'),null);
});
test('serialisation round-trips and rejects bad graphs',() => {
  const g = G.templates['Noise threshold'](), back = G.normalize(plain(g));
  assert.equal(back.nodes.length,g.nodes.length); assert.equal(back.edges.length,g.edges.length); assert.deepEqual(plain(back.nodes.find(n => n.type === 'threshold').bind),plain(g.nodes.find(n => n.type === 'threshold').bind));
  assert.throws(() => G.normalize({version:2,nodes:[],edges:[]}),/Unsupported/);
  const bad = plain(g); bad.nodes[0].type = 'nope'; assert.throws(() => G.normalize(bad),/Invalid procedural node/);
  const noOut = plain(g); noOut.nodes = noOut.nodes.filter(n => n.id !== 'output'); noOut.edges = []; assert.throws(() => G.normalize(noOut),/no output/);
  const odd = plain(g); odd.nodes.find(n => n.type === 'threshold').params.level = 99; assert.equal(G.normalize(odd).nodes.find(n => n.type === 'threshold').params.level,1,'values are clamped');
});
test('Noise -> Threshold -> Output renders a two-tone picture; the level changes the result',() => {
  const g = G.create(), n = G.createNode('noise'), t = G.createNode('threshold'); n.params.speed = 0; g.nodes.push(n,t); G.connect(g,n.id,t.id,'input'); G.connect(g,t.id,'output','input');
  const rt = new G.Runtime(g), a = rt.render(0,64,48); assert.equal(a.image.length,64*48*4); assert.equal(a.errors.size,0);
  let mid = 0; for (let i = 0; i < a.image.length; i += 4) if (a.image[i] > 20 && a.image[i] < 235) mid++; assert.ok(mid/(64*48) < .12,'mostly two-tone, mid-tones '+mid);
  t.params.level = .8; const b = rt.render(0,64,48); assert.ok(mean(b.image) < mean(a.image),'a higher threshold gives less light');
});
test('caching: a second frame at the same time reuses everything; a parameter change recomputes only what depends on it',() => {
  const g = G.create(), n = G.createNode('noise'), c = G.createNode('color'), t = G.createNode('threshold'); n.params.speed = 0; g.nodes.push(n,c,t);
  G.connect(g,n.id,c.id,'input'); G.connect(g,c.id,t.id,'input'); G.connect(g,t.id,'output','input'); const rt = new G.Runtime(g);
  const f1 = rt.render(1,48,48); assert.equal(f1.stats.evaluated,3); const f2 = rt.render(2,48,48); assert.equal(f2.stats.evaluated,0,'static nodes are not re-evaluated'); assert.equal(f2.stats.cached,3);
  t.params.level = .3; const f3 = rt.render(2,48,48); assert.equal(f3.stats.evaluated,1,'only the threshold re-runs'); n.params.seed = 5; assert.equal(rt.render(2,48,48).stats.evaluated,3);
  const f4 = rt.render(2,64,64); assert.equal(f4.stats.evaluated,3,'a size change recomputes');
});
test('animation: a bound oscillator moves a parameter over time; a Time node and keyframes drive parameters too',() => {
  const g = G.create(), n = G.createNode('noise'), th = G.createNode('threshold'), l = G.createNode('lfo'); n.params.speed = 0; l.params.freq = .5; g.nodes.push(n,th,l);
  G.connect(g,n.id,th.id,'input'); G.connect(g,th.id,'output','input'); assert.equal(G.bind(g,l.id,th.id,'level'),null); const rt = new G.Runtime(g);
  const a = rt.render(0,48,48), b = rt.render(.5,48,48); assert.ok(diff(a.image,b.image) > 1,'the picture changes with time'); assert.equal(b.stats.evaluated >= 2,true);
  assert.equal(rt.render(.7,48,48).stats.evaluated >= 2,true,'dynamic nodes re-evaluate on the next frame'); assert.equal(rt.render(.7,48,48).stats.evaluated,0,'and are reused within the same frame');
  assert.equal(G.sampleKeys(G.keyframes('0:0, 2:1, 4:0'),1,false,false),.5); assert.equal(G.sampleKeys(G.keyframes('0:0, 2:1'),3,false,true),.5);
  const tn = G.createNode('time'); tn.params.scale = 2; assert.equal(G.NODES.time.value({p:tn.params,t:3}),6);
});
test('feedback is a one-frame delay: trails build up and the loop does not break evaluation',() => {
  const g = G.create(), s = G.createNode('shape'), f = G.createNode('feedback'); s.params.size = .2; s.params.transparent = false; g.nodes.push(s,f);
  G.connect(g,s.id,f.id,'input'); G.connect(g,f.id,'output','input'); const rt = new G.Runtime(g), a = rt.render(0,48,48);
  s.params.x = .8; const b = rt.render(.1,48,48), c = rt.render(.2,48,48);
  assert.equal(a.errors.size,0); assert.ok(mean(c.image) >= mean(b.image)*.5);
  const loop = G.create(), sh = G.createNode('shape'), bl = G.createNode('blend'), fb = G.createNode('feedback'); loop.nodes.push(sh,bl,fb);
  assert.equal(G.connect(loop,sh.id,bl.id,'a'),null); assert.equal(G.connect(loop,bl.id,fb.id,'input'),null); assert.equal(G.connect(loop,fb.id,bl.id,'b'),null); G.connect(loop,bl.id,'output','input');
  const lr = new G.Runtime(loop); for (let i = 0; i < 4; i++) { const r = lr.render(i*.1,32,32); assert.equal(r.errors.size,0); assert.ok(r.image); }
});
test('errors stay on their node and the rest keeps running; bypass passes the input through',() => {
  const g = G.create(), v = G.createNode('video'), th = G.createNode('threshold'); g.nodes.push(v,th); G.connect(g,v.id,th.id,'input'); G.connect(g,th.id,'output','input');
  const rt = new G.Runtime(g,{source:() => null}), r = rt.render(0,32,32); assert.match(r.errors.get(v.id),/No video layer/); assert.equal(r.errors.has(th.id),false);
  const g2 = G.create(), sh = G.createNode('shape'), co = G.createNode('color'); co.params.invert = true; g2.nodes.push(sh,co); G.connect(g2,sh.id,co.id,'input'); G.connect(g2,co.id,'output','input');
  const rt2 = new G.Runtime(g2), a = rt2.render(0,32,32); co.bypass = true; const b = rt2.render(0,32,32); assert.ok(diff(a.image,b.image) > 20,'bypass changes the result'); assert.equal(mean(b.image) > 0,true);
});
test('every node type evaluates without errors on a small frame',() => {
  for (const [type,def] of Object.entries(G.NODES)) {
    if (type === 'output' || def.out === 'number' || def.source) continue;
    const g = G.create(), n = G.createNode(type), src = G.createNode('noise'); g.nodes.push(n,src); src.params.speed = 0;
    for (const input of Object.keys(def.inputs)) G.connect(g,src.id,n.id,input); G.connect(g,n.id,'output','input');
    const r = new G.Runtime(g).render(.5,32,24); assert.equal(r.errors.size,0,type+': '+[...r.errors.values()].join()); assert.ok(r.image && r.image.length === 32*24*4,type);
  }
});
test('templates build valid graphs, including the video threshold example',() => {
  for (const [name,make] of Object.entries(G.templates)) { const g = make(); assert.equal(G.normalize(plain(g)).nodes.length,g.nodes.length,name); }
  assert.ok(G.templates['Video threshold + noise']().nodes.some(n => n.type === 'video' && true));
});
