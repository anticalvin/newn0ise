import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {searchUrl,thumb,credit,unzip,CATEGORIES} from '../../src/sketchfab.js';

test('search url asks only for downloadable models and carries the filters', () => {
  const u = new URL(searchUrl({q:' red chair ',category:'furniture-home',sort:'-publishedAt',animated:true,license:'cc0',staff:true,count:12}));
  assert.equal(u.origin + u.pathname, 'https://api.sketchfab.com/v3/search');
  const p = u.searchParams;
  assert.equal(p.get('type'), 'models'); assert.equal(p.get('downloadable'), 'true'); assert.equal(p.get('q'), 'red chair');
  assert.equal(p.get('categories'), 'furniture-home'); assert.equal(p.get('sort_by'), '-publishedAt'); assert.equal(p.get('animated'), 'true');
  assert.equal(p.get('license'), 'cc0'); assert.equal(p.get('staffpicked'), 'true'); assert.equal(p.get('count'), '12');
  const plain = new URL(searchUrl()).searchParams; assert.equal(plain.get('q'), null); assert.equal(plain.get('license'), null);
  assert.ok(CATEGORIES.length > 6);
});
test('thumbnail picks a mid size image and credit names author and licence', () => {
  const m = {name:'Chair',user:{displayName:'Ana'},license:{label:'CC BY'},thumbnails:{images:[{url:'a',width:1920},{url:'b',width:256},{url:'c',width:64}]}};
  assert.equal(thumb(m), 'b'); assert.equal(credit(m), 'Chair by Ana (CC BY)'); assert.equal(thumb({}), '');
});
function zip(files) {
  const parts = [], cd = []; let off = 0;
  for (const [name, data, method] of files) {
    const raw = Buffer.from(data), body = method === 8 ? zlib.deflateRawSync(raw) : raw, nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nb, body); cd.push(ch, nb); off += 30 + nb.length + body.length;
  }
  const dir = Buffer.concat(cd), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(off, 16);
  const b = Buffer.concat([...parts, dir, end]); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}
test('unzip reads stored and deflated entries, keeps file names and skips folders', async () => {
  const out = await unzip(zip([['scene.gltf', '{"asset":{}}', 8], ['textures/wood.png', 'PNGDATA', 0], ['textures/', '', 0]]));
  assert.deepEqual(out.map(f => f.name), ['scene.gltf', 'wood.png']);
  assert.equal(new TextDecoder().decode(out[0].bytes), '{"asset":{}}'); assert.equal(new TextDecoder().decode(out[1].bytes), 'PNGDATA');
  await assert.rejects(() => unzip(new ArrayBuffer(40)), /not a zip/);
});
