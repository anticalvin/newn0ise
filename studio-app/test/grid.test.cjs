const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const G = runInNewContext(readFileSync(join(__dirname,'..','grid.js'),'utf8')+'\nStudioGrid');
const plain = v => JSON.parse(JSON.stringify(v));

test('settings are normalised and clamped',() => {
  const c = G.normalize({kind:'nope',size:-4,subs:99,cols:0,opacity:500,guides:[{axis:'x',at:10},{axis:'z',at:1},{axis:'y',at:'a'}]});
  assert.equal(c.kind,'square'); assert.equal(c.size,4); assert.equal(c.subs,16); assert.equal(c.cols,1); assert.equal(c.opacity,100); assert.equal(JSON.stringify(c.guides),'[{"axis":"x","at":10}]');
  assert.equal(c.show,false); assert.equal(c.snapGrid,false); assert.equal(c.snapGuides,true);
});
test('square grid has major lines at the spacing and minor lines for subdivisions',() => {
  const t = G.ticks(400,100,2); assert.equal(JSON.stringify(t.major),'[0,100,200,300,400]'); assert.equal(JSON.stringify(t.minor),'[50,150,250,350]');
  const l = G.lines({kind:'square',size:100,subs:2},300,200); assert.ok(l.major.includes('M 100 0 V 200')); assert.ok(l.minor.includes('M 50 0 V 200'));
});
test('columns, baseline and isometric layouts produce their own lines',() => {
  assert.ok(G.lines({kind:'columns',cols:4},400,300).major.includes('M 200 0 V 300'));
  const b = G.lines({kind:'baseline',baseline:20},200,100); assert.ok(b.minor.includes('M 0 20 H 200')); assert.ok(b.major.includes('M 0 80 H 200'));
  const iso = G.lines({kind:'isometric',size:50},300,300); assert.ok(iso.minor.split('M').length > 10); assert.ok(/L 300/.test(iso.minor));
});
test('showing and snapping are independent: snapping works with the grid hidden, and hidden snapping does nothing',() => {
  const off = G.snapPoint({show:true,snapGrid:false},{x:103,y:197},1000,1000,8); assert.equal(off.x,103); assert.equal(off.on.length,0);
  const on = G.snapPoint({show:false,snapGrid:true,size:100},{x:103,y:197},1000,1000,8); assert.equal(on.x,100); assert.equal(on.y,200); assert.equal(on.on.join(),'grid,grid');
  assert.equal(G.snapPoint({snapGrid:true,size:100},{x:150,y:150},1000,1000,8).x,150);
});
test('guides win over the grid and respect their own switch',() => {
  const cfg = {snapGrid:true,size:100,guides:[{axis:'x',at:105}]};
  assert.equal(G.snapPoint(cfg,{x:103,y:50},1000,1000,8).x,105); assert.equal(G.snapPoint(cfg,{x:103,y:50},1000,1000,8).on[0],'guide');
  assert.equal(G.snapPoint({...cfg,snapGuides:false},{x:103,y:50},1000,1000,8).x,100);
});
test('a moving box snaps an edge or its centre to guides, then to grid lines',() => {
  const r = G.snapBox({snapGrid:true,size:100},{left:97,right:197,top:40,bottom:140},1000,1000,6);
  assert.equal(r.x,3); assert.equal(r.snappedX,true);
  const g = G.snapBox({snapGrid:false,guides:[{axis:'y',at:90}]},{left:0,right:50,top:70,bottom:110},1000,1000,6); assert.equal(g.y,0); assert.equal(g.snappedY,true);
  const none = G.snapBox({snapGrid:true,size:100},{left:30,right:70,top:30,bottom:70},1000,1000,6); assert.equal(none.snappedX || none.snappedY,false);
});
