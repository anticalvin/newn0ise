const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const P = runInNewContext(readFileSync(join(__dirname,'..','palette.js'),'utf8')+'\nStudioPalette');
const fill = (parts) => { const a = []; for (const [c,n] of parts) for (let i = 0; i < n; i++) a.push(...c,255); return new Uint8ClampedArray(a); };
const near = (h,c,t = 20) => { const v = [1,3,5].map(i => parseInt(h.slice(i,i+2),16)); return Math.hypot(v[0]-c[0],v[1]-c[1],v[2]-c[2]) < t; };

test('finds the dominant colours, most common first',() => {
  const out = P.extract(fill([[[200,30,30],600],[[20,60,200],300],[[240,240,240],100]]),3);
  assert.equal(out.length,3); assert.ok(near(out[0],[200,30,30])); assert.ok(near(out[1],[20,60,200])); assert.ok(near(out[2],[240,240,240]));
});
test('merges near-duplicates and honours the count',() => {
  const out = P.extract(fill([[[100,100,100],500],[[104,100,98],500],[[10,200,10],200]]),6);
  assert.equal(out.length,2,'two shades of gray are one key colour'); assert.ok(P.extract(fill([[[255,0,0],50],[[0,255,0],50],[[0,0,255],50]]),2).length <= 2);
});
test('ignores transparent pixels and handles empty or flat pictures',() => {
  const a = fill([[[255,0,0],100]]); for (let i = 3; i < a.length; i += 8) a[i] = 0;
  assert.equal(P.extract(a,4).length,1); assert.equal(P.extract(new Uint8ClampedArray(0)).length,0); assert.equal(P.extract(fill([[[5,5,5],10]]),5).length,1);
});
test('hex output is lower-case and padded',() => { assert.equal(P.hex([1,2,3]),'#010203'); assert.equal(P.hex([300,-4,16.4]),'#ff0010'); });
