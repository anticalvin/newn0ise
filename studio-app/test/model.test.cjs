'use strict';

const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const {webcrypto} = require('node:crypto');
const {test} = require('node:test');
const assert = require('node:assert/strict');

const input = name => readFileSync(join(__dirname,'..',name+'.js'),'utf8');
const {G,D,S} = runInNewContext(
  ['graph-model','document','snapping'].map(input).join('\n')+
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
