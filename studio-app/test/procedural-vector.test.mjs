import assert from 'node:assert/strict';
import test from 'node:test';
import {GENERATORS,applyVectorPatch,createDefinition,createVectorVariation,exportVectorSVG,generateGeometry,
  parseDefinition,viewBox} from '../../src/vector-generator.js';
import {createVectorAPI} from '../../src/vector-api.js';

test('six vector families produce deterministic and bounded editable anchors and SVG', () => {
  for (const [generator,{parameters}] of Object.entries(GENERATORS)) {
    const definition = createDefinition(generator,'test-project');
    const reload = parseDefinition(JSON.stringify(definition));
    assert.deepEqual(reload,definition);
    assert.deepEqual(generateGeometry(reload),generateGeometry(definition));
    const maximum = Object.fromEntries(Object.entries(parameters).map(([key,spec]) => [key,spec.max ?? spec.options[0]]));
    const extreme = applyVectorPatch(definition,{parameters:maximum,style:{stroke:12,progress:3,rotation:180}});
    const paths = generateGeometry(extreme);
    assert.ok(paths.length > 0 && paths.length <= 800,generator);
    assert.ok(paths.reduce((total,path) => total+path.points.length,0) <= 12288,generator);
    for (const path of paths) assert.ok(path.points.every(point => point.length === 4 && point.every(Number.isFinite)));
    assert.ok(viewBox(paths)[2] < 4096);
    assert.doesNotMatch(exportVectorSVG(extreme),/NaN|Infinity|<image|<script|href=/);
  }
});

test('invalid JSON, unsupported versions, invalid SVG and nonfinite values are rejected atomically', () => {
  const definition = createDefinition('concentric','test');
  const original = structuredClone(definition);
  assert.throws(() => parseDefinition('{'));
  assert.throws(() => parseDefinition('<svg onload="alert(1)"/>'));
  assert.throws(() => parseDefinition(JSON.stringify({...definition,version:2})),/version/);
  assert.throws(() => parseDefinition(' '.repeat(20000)),/16 KB/);
  assert.throws(() => applyVectorPatch(definition,{parameters:{count:1e8}}),/Count/);
  assert.throws(() => applyVectorPatch(definition,{parameters:{offset:NaN,count:29}}),/Displacement/);
  assert.throws(() => applyVectorPatch(definition,JSON.parse('{"parameters":{"__proto__":10}}')),/Unknown/);
  assert.throws(() => applyVectorPatch(definition,{style:{color:'"><script/>'}}),/color/);
  assert.deepEqual(definition,original);
});

test('locked parameters and style survive deterministic seeded variations', () => {
  const definition = applyVectorPatch(createDefinition('concentric','test'),{locks:['count','style.stroke']});
  const varied = createVectorVariation(definition,122);
  assert.equal(varied.parameters.count,definition.parameters.count);
  assert.equal(varied.style.stroke,definition.style.stroke);
  assert.equal(varied.seed,122);
  assert.deepEqual(varied,createVectorVariation(definition,122));
  assert.notDeepEqual(varied.parameters,createVectorVariation(definition,123).parameters);
});

test('agent mutations are proposed without writing the current document', () => {
  const definition = createDefinition('radial','test');
  const api = createVectorAPI(() => definition,(next,send = false) => ({next,send}));
  assert.equal(api({cmd:'setVectorParameters',parameters:{count:18}}).next.parameters.count,18);
  assert.equal(api({cmd:'getVectorDocument'}).parameters.count,definition.parameters.count);
  assert.notEqual(api({cmd:'duplicateVectorGenerator'}).next.id,definition.id);
  assert.equal(api({cmd:'sendVectorToStudio'}).send,true);
  assert.throws(() => api({cmd:'applyVectorPatch',patch:{parameters:{count:-1}}}),/Segments/);
  assert.match(api({cmd:'exportVectorSVG'}),/<path /);
});
