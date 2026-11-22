import test from 'node:test';
import assert from 'node:assert/strict';
import {RATIOS,dimsFor,normalize,flipped,frameViewBox,fromLegacyAspect,labelFor,clampDim} from '../../src/lab-canvas.js';
import {createDefinition,exportVectorSVG,viewBox,generateGeometry} from '../../src/vector-generator.js';

test('presets keep the long side at 700 and flip orientation', () => {
  assert.deepEqual(dimsFor({ratio:'1:1'}),{w:700,h:700});
  assert.deepEqual(dimsFor({ratio:'4:5'}),{w:560,h:700});
  assert.deepEqual(dimsFor({ratio:'9:16'}),{w:394,h:700});
  assert.deepEqual(dimsFor({ratio:'16:9'}),{w:700,h:394});
  assert.deepEqual(dimsFor({ratio:'3:2'}),{w:700,h:467});
  assert.deepEqual(dimsFor(flipped({ratio:'4:5'})),{w:700,h:560});
  assert.equal(dimsFor({ratio:'code'}),null); assert.equal(labelFor({ratio:'code'}),'sketch size');
  assert.ok(RATIOS.map(r => r[0]).includes('custom'));
});
test('custom sizes are exact, clamped, and swap on orientation change', () => {
  assert.deepEqual(dimsFor({ratio:'custom',w:900,h:300}),{w:900,h:300});
  assert.deepEqual(dimsFor(flipped({ratio:'custom',w:900,h:300})),{w:300,h:900});
  assert.equal(clampDim(1),16); assert.equal(clampDim(99999),4096); assert.equal(clampDim('abc'),700);
  assert.deepEqual(normalize({ratio:'nonsense',w:-5}),{ratio:'code',w:16,h:700,flip:false});
});
test('old single-number aspect saves migrate to presets', () => {
  assert.equal(fromLegacyAspect(1).ratio,'code'); assert.equal(fromLegacyAspect(.8).ratio,'4:5');
  assert.equal(fromLegacyAspect(16/9).ratio,'16:9'); assert.equal(fromLegacyAspect(.5625).ratio,'9:16'); assert.equal(fromLegacyAspect('x').ratio,'code');
});
test('framing a square viewBox grows the long side around the same centre and never crops', () => {
  const sq = [-220,-220,440,440], wide = frameViewBox(sq,16,9), tall = frameViewBox(sq,4,5);
  assert.ok(Math.abs(wide[2]/wide[3]-16/9) < 1e-9); assert.equal(wide[3],440); assert.ok(wide[0] < -220 && wide[0]+wide[2] > 220);
  assert.ok(Math.abs(tall[2]/tall[3]-4/5) < 1e-9); assert.equal(tall[2],440);
  assert.ok(Math.abs(wide[0]+wide[2]/2) < 1e-9 && Math.abs(tall[1]+tall[3]/2) < 1e-9);
});
test('exported SVG width, height and viewBox agree with the chosen canvas', () => {
  const def = createDefinition(); const plain = exportVectorSVG(def), framed = exportVectorSVG(def,{w:700,h:394});
  assert.match(plain,/viewBox="-?\d+ -?\d+ \d+ \d+"/);
  const m = /width="(\d+)" height="(\d+)" viewBox="([^"]+)"/.exec(framed); const [x,y,w,h] = m[3].split(' ').map(Number);
  assert.equal(+m[1],700); assert.equal(+m[2],394); assert.ok(Math.abs(w/h-700/394) < 1e-3);
  const base = viewBox(generateGeometry(def)); assert.equal(h,base[3]);
});
