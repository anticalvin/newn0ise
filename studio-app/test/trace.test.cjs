const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const T = runInNewContext(['trace','pathedit'].map(n => readFileSync(join(__dirname,'..',n+'.js'),'utf8')).join('\n')+'\n;({T:StudioTrace,P:StudioPath})').T;
const P = runInNewContext(['trace','pathedit'].map(n => readFileSync(join(__dirname,'..',n+'.js'),'utf8')).join('\n')+'\n;({T:StudioTrace,P:StudioPath})').P;
const ring = (w,h,cx,cy,ro,ri) => { const a = new Uint8Array(w*h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x+.5-cx,y+.5-cy); if (d <= ro && d >= ri) a[y*w+x] = 255; } return a; };
const area = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const [x0,y0] = pts[i],[x1,y1] = pts[(i+1)%pts.length]; s += x0*y1-x1*y0; } return Math.abs(s/2); };

test('a ring (the letter O) traces to an outer outline and a hole',() => {
  const loops = T.contours(ring(80,80,40,40,30,16),80,80); assert.equal(loops.length,2);
  const a = loops.map(l => area(l.map(p => [p[0],p[1]]))).sort((x,y) => y-x); assert.ok(Math.abs(a[0]-Math.PI*900) < 120); assert.ok(Math.abs(a[1]-Math.PI*256) < 80);
});
test('a solid square is one loop, two separate blobs are two',() => {
  const sq = new Uint8Array(400); for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) sq[y*20+x] = 255; assert.equal(T.contours(sq,20,20).length,1);
  const two = new Uint8Array(40*20); for (const ox of [3,25]) for (let y = 4; y < 14; y++) for (let x = ox; x < ox+8; x++) two[y*40+x] = 255; assert.equal(T.contours(two,40,20).length,2);
});
test('simplify drops the staircase but keeps real corners; curves become smooth points, corners stay corners',() => {
  const sq = new Uint8Array(900); for (let y = 5; y < 25; y++) for (let x = 5; x < 25; x++) sq[y*30+x] = 255;
  const sqPts = T.toPoints(T.contours(sq,30,30)[0]); assert.equal(sqPts.length,4); assert.ok(sqPts.every(p => !p[2] && !p[3]),'square corners have no handles');
  const circ = T.toPoints(T.contours(ring(120,120,60,60,50,0),120,120)[0]); assert.ok(circ.length > 8 && circ.length < 90); assert.ok(circ.filter(p => p[2] || p[3]).length > circ.length*.6,'most points of a circle are smooth');
});
test('compound(): one point list with breaks, mapped to layer coordinates, holes included',() => {
  const loops = T.contours(ring(80,80,40,40,30,16),80,80), c = T.compound(loops,{scale:.5,ox:40,oy:40});
  assert.equal(c.breaks.length,1); assert.ok(c.points.length > 8); const xs = c.points.map(p => p[0]); assert.ok(Math.min(...xs) < -13 && Math.max(...xs) > 13);
  assert.equal(P.ranges(c.points,c.breaks).length,2);
});
test('path node editing works across the outlines of a compound path',() => {
  const c = T.compound(T.contours(ring(80,80,40,40,30,16),80,80),{ox:40,oy:40}), n = c.points.length, br = c.breaks, start2 = br[0];
  const hit = P.nearest(c.points,true,{x:c.points[start2][0]+0.2,y:c.points[start2][1]},32,br); assert.ok(hit.i >= start2 || hit.j >= start2,'finds the hole outline');
  const sp = P.split(c.points,true,hit.seg,hit.t,br); assert.equal(sp.points.length,n+1); assert.ok(sp.breaks[0] === br[0] || sp.breaks[0] === br[0]+1);
  const rm = P.removeAtB(sp.points,true,sp.index,sp.breaks); assert.equal(rm.points.length,n); assert.equal(rm.breaks.length,1);
  const sm = P.toSmooth(c.points,true,start2,br); assert.ok(sm[start2][2] !== undefined);
  const tiny = [[0,0],[1,0],[0,1],[5,5],[6,5],[5,6]]; assert.equal(P.removeAtB(tiny,true,0,[3]),null,'an outline keeps three points');
});
