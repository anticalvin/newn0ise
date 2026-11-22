const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const T = runInNewContext(readFileSync(join(__dirname,'..','timeline-view.js'),'utf8')+'\nStudioTimelineView');
const near = (a,b,e = 1e-6) => assert.ok(Math.abs(a-b) < e,a+' vs '+b);

test('limits adapt to the sequence: long sequences can zoom out to fit, short ones can zoom in to frames',() => {
  const long = T.limits(600,390), short = T.limits(2,390);
  assert.ok(long.min < .3,'600 s on a phone needs a very small scale, got '+long.min); assert.ok(long.fit >= long.min*2);
  assert.ok(short.max >= 400); assert.ok(T.limits(8,1200).min <= 8);
});
test('zoom keeps the time under the anchor fixed',() => {
  const lim = T.limits(60,800), v = {pps:40,scrollLeft:120}, anchor = 300, t = (v.scrollLeft+anchor)/v.pps;
  const z = T.zoomAround(v,2,anchor,lim); near((z.scrollLeft+anchor)/z.pps,t); assert.equal(z.pps,80);
  const w = {pps:40,scrollLeft:2000}, tw = (2000+anchor)/40, out = T.zoomAround(w,.5,anchor,lim); near((out.scrollLeft+anchor)/out.pps,tw,1e-6);
});
test('zoom is clamped to the limits and scroll never goes negative',() => {
  const lim = T.limits(30,600), z = T.zoomAround({pps:20,scrollLeft:0},1e6,10,lim); assert.equal(z.pps,lim.max);
  const o = T.zoomAround({pps:20,scrollLeft:0},1e-6,10,lim); assert.equal(o.pps,lim.min); assert.ok(o.scrollLeft >= 0);
});
test('fit sequence shows everything; fit selection frames a clip with margin',() => {
  const lim = T.limits(30,600), f = T.fitSequence(30,600,lim); assert.ok(f.pps*30+T.PAD <= 600+1e-6); assert.equal(f.scrollLeft,0);
  const r = T.fitRange(10,14,600,lim), left = r.scrollLeft, right = r.scrollLeft+600;
  assert.ok(10*r.pps >= left && 14*r.pps <= right); assert.ok((14-10)*r.pps > 600*.6);
  assert.ok(T.fitRange(5,5.001,600,lim).pps <= lim.max);
});
test('pinch is anchored at the midpoint and ratio-based',() => {
  const lim = T.limits(60,800), base = {pps:30,scrollLeft:90}, p = T.pinch(base,100,200,250,lim,base); assert.equal(p.pps,60);
  near((p.scrollLeft+250)/p.pps,(90+250)/30);
});
test('the playhead is followed only when it leaves the window',() => {
  const v = {pps:50,scrollLeft:100}; assert.equal(T.followPlayhead(v,4,400),100); assert.ok(T.followPlayhead(v,12,400) > 100); assert.equal(T.followPlayhead(v,1,400),Math.max(0,50-40));
});
