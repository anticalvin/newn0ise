const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const {webcrypto} = require('node:crypto');
const input = name => readFileSync(join(__dirname,'..',name+'.js'),'utf8');
const {P,D} = runInNewContext(['graph-model','looks','document','pathedit'].map(input).join('\n')+'\n;({P:StudioPath,D:StudioDocument})',{crypto:webcrypto,structuredClone});
const plain = v => JSON.parse(JSON.stringify(v));
const near = (a,b,e = 1e-6) => assert.ok(Math.abs(a-b) < e,a+' vs '+b);

const arc = [[0,0,30,0],[100,0,30,0]]; /* smooth, mirrored handles */
test('smooth points mirror their handles, six numbers break the mirror',() => {
  assert.deepEqual(plain(P.inOf([10,10,5,-3])),[-5,3]); assert.deepEqual(plain(P.inOf([10,10,5,-3,2,2])),[2,2]);
  assert.equal(P.make(0,0,[4,0],[-4,0]).length,4); assert.equal(P.make(0,0,[4,0],[-1,0]).length,6);
  assert.equal(P.isSmooth([0,0,4,0]),true); assert.equal(P.isSmooth([0,0,0,0]),false); assert.equal(P.isSmooth([0,0,4,0,9,9]),false);
});
test('adding an anchor splits the curve without changing its shape',() => {
  const {points,index} = P.split(arc,false,0,.5);
  assert.equal(points.length,3); assert.equal(index,1);
  for (const t of [.1,.25,.5,.75,.9]) {
    const before = P.bezier(arc[0],arc[1],t);
    const first = t <= .5 ? P.bezier(points[0],points[1],t*2) : P.bezier(points[1],points[2],(t-.5)*2);
    near(before[0],first[0],1e-6); near(before[1],first[1],1e-6);
  }
  near(points[1][0],P.bezier(arc[0],arc[1],.5)[0]);
});
test('nearest finds the segment and parameter under a point',() => {
  const hit = P.nearest([[0,0],[100,0],[100,100]],false,{x:60,y:4});
  assert.equal(hit.seg,0); near(hit.point[0],60,.5); assert.ok(hit.dist < 5);
  assert.equal(P.nearest([[0,0],[100,0],[100,100]],true,{x:40,y:60}).seg,2);
});
test('deleting keeps at least two points on an open path and three on a closed one',() => {
  const tri = [[0,0],[10,0],[5,9]];
  assert.equal(P.removeAt(tri,true,0),null); assert.equal(P.removeAt(tri,false,0).length,2); assert.equal(P.removeAt([[0,0],[1,1]],false,0),null);
  assert.deepEqual(plain(P.removeAt([[0,0],[1,1],[2,2],[3,3]],true,1).map(p => p[0])),[0,2,3]);
});
test('corner and smooth conversion',() => {
  const pts = [[0,0,0,0],[50,0,0,0],[100,40,0,0]];
  const smooth = P.toSmooth(pts,false,1); assert.equal(P.isSmooth(smooth[1]),true); near(smooth[1][2],100/6); near(smooth[1][3],40/6);
  const corner = P.toCorner(smooth,1); assert.deepEqual(plain(corner[1]),[50,0,0,0]);
  assert.equal(P.toSmooth([[5,5]],false,0)[0][2],20);
});
test('handles move mirrored by default and independently when broken',() => {
  const pts = [[0,0,10,0],[50,50,10,0]];
  const mirrored = P.setHandle(pts,1,'out',[0,20],false); assert.deepEqual(plain(P.inOf(mirrored[1])),[0,-20]); assert.equal(mirrored[1].length,4);
  const broken = P.setHandle(pts,1,'in',[-8,3],true); assert.deepEqual(plain(P.inOf(broken[1])),[-8,3]); assert.deepEqual(plain(P.outOf(broken[1])),[10,0]); assert.equal(broken[1].length,6);
});
test('both point shapes survive save and reopen; malformed points are rejected',() => {
  const d = D.create('square',false);
  d.layers.push(D.layer('path',{points:[[0,0,10,0],[50,50,10,0,-3,4]],closed:false,fill:null,stroke:'#e9e5db',strokeWidth:4}));
  const back = D.normalize(plain(d)); assert.deepEqual(plain(back.layers[0].points),[[0,0,10,0],[50,50,10,0,-3,4]]);
  d.layers[0].points = [[0,0,1]]; assert.throws(() => D.normalize(plain(d)),/invalid path/);
});
