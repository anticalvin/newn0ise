const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const L = runInNewContext(['looks','lutlib'].map(n => readFileSync(join(__dirname,'..',n+'.js'),'utf8')).join('\n')+'\n;({L:StudioLutLib,K:StudioLooks})');
const {L:Lib,K} = L;
test('there are many looks in several groups, with unique names',() => {
  assert.ok(Lib.list.length >= 50,'got '+Lib.list.length); assert.ok([...Lib.groups().keys()].length >= 5);
  const names = Lib.list.map(x => x.name); assert.equal(new Set(names).size,names.length);
});
test('every look bakes into a valid .cube that the Looks engine can read',() => {
  for (const e of Lib.list) { const c = Lib.cube(e.name,9), t = K.parseCube(c); assert.equal(t.n,9,e.name); assert.equal(t.data.length,9*9*9*3); assert.ok(t.data.every(v => v >= 0 && v <= 1),e.name); }
});
test('Neutral is the identity and the others really change colour',() => {
  const id = Lib.grade(Lib.list[0].spec,.3,.6,.9); assert.ok(Math.abs(id[0]-.3)+Math.abs(id[1]-.6)+Math.abs(id[2]-.9) < 1e-6);
  let moved = 0; for (const e of Lib.list.slice(1)) { const c = Lib.grade(e.spec,.4,.5,.6); if (Math.abs(c[0]-.4)+Math.abs(c[1]-.5)+Math.abs(c[2]-.6) > .01) moved++; } assert.ok(moved >= Lib.list.length-3,'only '+moved+' looks changed the colour');
});
test('mono looks are gray and the teal and orange look splits warm highlights from cool shadows',() => {
  const mono = Lib.list.find(x => x.name === 'Classic silver'), c = Lib.grade(mono.spec,.8,.3,.2); assert.ok(Math.abs(c[0]-c[1]) < 1e-6 && Math.abs(c[1]-c[2]) < 1e-6);
  const to = Lib.list.find(x => x.name === 'Teal and orange blockbuster'), dark = Lib.grade(to.spec,.12,.12,.12), light = Lib.grade(to.spec,.88,.88,.88);
  assert.ok(dark[2] > dark[0],'shadows lean blue'); assert.ok(light[0] > light[2],'highlights lean warm');
});
