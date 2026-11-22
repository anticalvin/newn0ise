const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const V = runInNewContext(readFileSync(join(__dirname,'..','viewport.js'),'utf8')+'\nStudioViewport');

test('fit centres the artboard and fills the stage when ratios match', () => {
  const flush = V.fitTransform(1000,500,800,400);
  assert.equal(flush.flush,true); assert.equal(flush.zoom,.8); assert.equal(JSON.stringify(flush.pan),'{"x":0,"y":0}');
  const margin = V.fitTransform(1920,1080,800,600);
  assert.equal(margin.flush,false); assert.ok(margin.zoom < 800/1920); assert.equal(margin.pan.y,-18);
});
test('zoom about a point keeps that point of the artboard under the cursor', () => {
  const v = V.create(), stage = {left:0,top:0,width:800,height:600};
  const z = V.zoomAbout(v,{x:600,y:200,stage,w:1000,h:800,value:1});
  const z2 = V.zoomAbout(z,{x:600,y:200,stage,w:1000,h:800,value:2});
  const art = (view,x,y) => ({x:(x-400-view.pan.x)/view.zoom+500,y:(y-300-view.pan.y)/view.zoom+400});
  const a = art(z,600,200), b = art(z2,600,200);
  assert.ok(Math.abs(a.x-b.x) < 1e-9 && Math.abs(a.y-b.y) < 1e-9);
  assert.equal(z2.fitted,false);
});
test('a locked viewport ignores zoom from every path and counts the blocked attempts', () => {
  const v = V.create(true), stage = {left:0,top:0,width:800,height:600};
  const before = JSON.stringify({zoom:v.zoom,pan:v.pan});
  for (const value of [.1,.5,3,4]) { const r = V.zoomAbout(v,{x:100,y:100,stage,w:500,h:500,value}); assert.equal(r,v); }
  assert.equal(JSON.stringify({zoom:v.zoom,pan:v.pan}),before); assert.equal(v.blocked,4);
  assert.equal(V.allow(v,'pan'),false); v.locked = false; assert.equal(V.allow(v,'pan'),true);
});
test('zoom is clamped between a small floor and 400 percent', () => {
  const v = V.create(), stage = {left:0,top:0,width:800,height:600};
  assert.equal(V.zoomAbout(v,{x:0,y:0,stage,w:500,h:500,value:99}).zoom,4);
  assert.equal(V.zoomAbout(v,{x:0,y:0,stage,w:500,h:500,value:.0001}).zoom,.05);
});
