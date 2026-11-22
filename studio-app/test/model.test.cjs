'use strict';

const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const {webcrypto} = require('node:crypto');
const {test} = require('node:test');
const assert = require('node:assert/strict');

const input = name => readFileSync(join(__dirname,'..',name+'.js'),'utf8');
const {G,D,S} = runInNewContext(
  ['graph-model','looks','document','snapping'].map(input).join('\n')+
  '\n;({G:StudioGraph,D:StudioDocument,S:StudioSnap})',{crypto:webcrypto,structuredClone});
const plain = value => JSON.parse(JSON.stringify(value));

test('scene assets, effect parameters and graph connections survive serialization',() => {
  const d = D.create('landscape',true), torus = d.layers[0];
  G.insertEffect(torus.chain,'fx','halation',{amt:72,rad:30,thr:64});
  const copy = D.normalize(plain(d));
  assert.equal(copy.version,2);
  assert.deepEqual(plain(copy.layers[0]),plain(torus));
});

test('pipeline traverses only the requested output and rejects port mismatch and cycles',() => {
  const g = G.create('layer');
  G.insertEffect(g,'one','halation',{});
  G.insertEffect(g,'two','clarity',{});
  G.insertEffect(g,'skip','promist',{});
  assert.equal(G.connect(g,'two','output'),null);
  assert.match(G.connect(g,'source','output'),/compatible/);
  assert.match(G.connect(g,'two','one'),/cycle/);
  assert.deepEqual(plain(G.plan(g).map(({node}) => node.id)),['source','upload','one','two','output']);
});

test('unsupported nodes are retained, with a recoverable evaluation error',() => {
  const g = G.create('scene');
  G.insertEffect(g,'future','halation',{});
  g.nodes[2].version = 2;
  const loaded = G.normalize(plain(g),'scene');
  assert.deepEqual(plain(loaded),plain(g));
  assert.throws(() => G.plan(loaded),/unavailable/);
  loaded.edges.push({from:'future',out:'frame',to:'future',in:'input'});
  assert.throws(() => G.normalize(loaded,'scene'),/connection|cycle/);
});

test('previous Studio documents open with their original 2D artwork',() => {
  const project = {
    format:'n0ise-studio',version:1,ratio:'square',
    layers:[D.layer('chrome',{name:'Old chrome'})]
  };
  const loaded = D.normalize(plain(project));
  assert.equal(loaded.version,2);
  assert.equal(loaded.layers[0].type,'chrome');
  assert.equal(loaded.layers[0].name,'Old chrome');
});

test('snapping uses screen pixels rather than document pixels',() => {
  const b = {left:16,right:91,top:43,bottom:80};
  assert.equal(S.move(b,[],800,680,.25).x,-16);
  assert.equal(S.move(b,[],800,680,1).x,0);
  assert.equal(S.move(S.translate(b,-12,0),[],800,680,1).x,-4);
});

test('custom canvas dimensions round-trip and reject oversized or fractional surfaces',() => {
  const doc = D.create('custom',false,[1050,700]);
  const restored = D.normalize(plain(doc));
  assert.deepEqual(plain(D.dimensions(restored)),[1050,700]);
  assert.equal(D.ratioName(restored),'3:2');
  assert.throws(() => D.create('custom',false,[4096,4096]),/dimensions/);
  assert.throws(() => D.normalize({...plain(doc),size:[1050.5,700]}),/supported/);
});

test('text, shapes and paths stay editable objects through save and reopen (N0I-31)',() => {
  const d = D.create('square',false);
  const text = D.layer('text',{text:'Resolution independent',font:'serif',fontSize:144,fill:'#ff3b30',stroke:'#101010',strokeWidth:2});
  const shape = D.layer('shape',{shape:'ellipse',width:320,height:180,fill:'#d5d0c5',stroke:'#e9e5db',strokeWidth:4});
  const pts = [[-100,0,0,-60],[0,80,60,0],[100,0,0,60]];
  const path = D.layer('path',{points:pts,closed:true,fill:null,stroke:'#e9e5db',strokeWidth:6});
  d.layers.push(text,shape,path);
  const back = D.normalize(plain(d));
  const [t,s,p] = back.layers;
  assert.equal(t.type,'text'); assert.equal(t.text,'Resolution independent'); assert.equal(t.font,'serif'); assert.equal(t.fontSize,144);
  assert.equal(s.type,'shape'); assert.equal(s.shape,'ellipse'); assert.equal(s.width,320); assert.equal(s.height,180);
  assert.equal(p.type,'path'); assert.deepEqual(plain(p.points),pts); assert.equal(p.closed,true);
  for (const l of back.layers) assert.ok(!('src' in l),l.type+' was flattened into a bitmap');
});

test('several artboards, compound outlines and photo colours survive save and reopen',() => {
  const d = D.create('square',false), a = D.layer('shape',{shape:'rectangle',width:100,height:100,fill:'#d5d0c5',stroke:'#e9e5db',strokeWidth:0});
  d.layers.push(a); d.artboards = [{id:'a1',name:'Cover'},{id:'a2',name:'Story',ratio:'portrait',layers:[D.layer('path',{points:[[0,0,0,0],[10,0,0,0],[10,10,0,0],[20,20,0,0],[30,20,0,0],[30,30,0,0]],closed:true,breaks:[3],fill:'#fff',stroke:'#fff',strokeWidth:0})],graph:D.create('portrait',false).graph}]; d.activeArtboard = 'a1';
  const back = D.normalize(plain(d));
  assert.equal(back.artboards.length,2); assert.equal(back.activeArtboard,'a1'); assert.equal(back.artboards[0].layers,undefined,'the active artboard keeps its layers on the document');
  assert.equal(back.artboards[1].ratio,'portrait'); assert.deepEqual(plain(back.artboards[1].layers[0].breaks),[3]); assert.equal(back.layers.length,1);
  const single = plain(d); delete single.artboards; delete single.activeArtboard; assert.equal(D.normalize(single).artboards,undefined,'old single-artboard projects still open');
  const bad = plain(d); bad.artboards[1].id = 'a1'; assert.throws(() => D.normalize(bad),/invalid artboard/);
  const img = D.layer('image',{src:'data:image/png;base64,AAAA',width:10,height:10,palette:['#AA0000','nope','#00ff00']}); d.layers.push(img); const p2 = D.normalize(plain(d)).layers.find(l => l.type === 'image'); assert.deepEqual(plain(p2.palette),['#aa0000','#00ff00']);
});
