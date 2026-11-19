import { build } from 'esbuild'; import fs from 'fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2022', legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = fs.readFileSync('src/style.css', 'utf8'), tpl = fs.readFileSync('src/template.html', 'utf8');
fs.writeFileSync('n0ise-core-coast.html', tpl.replace('/*CSS*/', () => css).replace('/*JS*/', () => js));
console.log('ok', (js.length / 1024).toFixed(0) + ' KB js');
