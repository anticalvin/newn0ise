'use strict';

const assert = require('node:assert/strict');
const {readFile} = require('node:fs/promises');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.STUDIO_URL || 'http://127.0.0.1:8789/studio-app.html';
const url = path => new URL(path,base).href;
const chrome = process.env.CHROME;
const source = page => page.locator('.cm-content');
const preview = page => page.locator('#vector-preview svg');
const read = page => page.evaluate(() => window.n0vector.run({cmd:'getVectorDocument'}));
const activeLayer = page => page.locator('#layerlist [data-layer-id]').first();
const drawer = (page,name) => page.locator(`[data-vector-drawer="${name}"]`);
const watch = (page,errors) => page.on('pageerror',error => errors.push(error.message));
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const canvas = page => page.locator('#preview').evaluate(el => el.toDataURL());
const settle = async (page,expected) => {
  await page.waitForFunction(value => window.n0vector?.run({cmd:'getVectorDocument'}).parameters.count === value,expected);
  await frame(page);
};

async function download(page,element) {
  const item = page.waitForEvent('download');
  await element.click();
  return readFile(await (await item).path(),'utf8');
}

async function openProject(page,project) {
  await page.goto(url('studio-app.html'));
  await page.locator('#launcher').waitFor();
  await page.locator('#launchFile').setInputFiles({name:'vector.n0studio.json',
    mimeType:'application/json',buffer:Buffer.from(typeof project === 'string' ? project : JSON.stringify(project))});
  await page.locator('#launcher').waitFor({state:'hidden'});
  await frame(page);
}

async function saveStudio(page) {
  await page.locator('#export').click();
  const text = await download(page,page.getByRole('button',{name:'Save editable project'}));
  return JSON.parse(text);
}

async function studioSVG(page) {
  await page.locator('#export').click();
  return download(page,page.getByRole('button',{name:'Download SVG'}));
}

async function changeValue(page,id,value) {
  const input = page.locator('#'+id);
  await input.fill(String(value));
  await input.press('Tab');
}
async function openPopup(page,button,route,errors) {
  const opened = page.context().waitForEvent('page');
  await button.click();
  const popup = await opened;
  watch(popup,errors);
  await popup.waitForURL(route);
  return popup;
}

(async () => {
  const browser = await chromium.launch({executablePath:chrome,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  context.setDefaultTimeout(12000);
  const errors = [];
  try {
    const lab = await context.newPage();
    watch(lab,errors);
    await lab.goto(url('lab.html'));
    const p5 = await source(lab).innerText();
    await source(lab).press('End');
    await source(lab).press('x');
    const sketchDraft = await lab.evaluate(() => window.__ED.get());
    assert.notEqual(sketchDraft,p5);
    await lab.getByRole('button',{name:'Vector',exact:true}).click();
    await lab.getByRole('button',{name:'Concentric Geometry',exact:true}).click();
    const originalMark = await preview(lab).innerHTML();
    await drawer(lab,'params').click();
    const slider = lab.getByRole('slider',{name:'Count slider',exact:true});
    await slider.focus();
    await slider.press('ArrowRight');
    await settle(lab,17);
    const countMark = await preview(lab).innerHTML();
    assert.notEqual(countMark,originalMark);
    await changeValue(lab,'vector-input-offset',71.5);
    await frame(lab);
    assert.notEqual(await preview(lab).innerHTML(),countMark);
    assert.equal((await read(lab)).parameters.offset,71.5);
    await lab.getByRole('button',{name:'Undo',exact:true}).click();
    assert.equal((await read(lab)).parameters.offset,32);
    await lab.getByRole('button',{name:'Redo',exact:true}).click();
    assert.equal((await read(lab)).parameters.offset,71.5);

    await lab.locator('#src-toggle').click();
    let project = await read(lab);
    project.parameters.count = 23;
    await source(lab).fill(JSON.stringify(project,null,2));
    await source(lab).press('Control+Enter');
    await settle(lab,23);
    assert.equal(await preview(lab).locator('path').count(),23);
    await source(lab).fill('<svg onload="alert(1)"/>');
    await lab.locator('#vector-apply').click();
    assert.ok(await lab.locator('#vector-error').innerText());
    assert.equal((await read(lab)).parameters.count,23);
    await lab.locator('#modeSketch').click();
    assert.equal(await lab.evaluate(() => window.__ED.get()),sketchDraft);
    await lab.locator('#modeVector').click();
    assert.match(await lab.evaluate(() => window.__ED.get()),/<svg onload/);
    await lab.locator('#vector-restore').click();

    await lab.evaluate(() => window.n0vector.run({cmd:'setVectorParameters',parameters:{count:25}}));
    await lab.waitForFunction(() => document.querySelectorAll('#vector-preview path').length === 25);
    assert.equal((await read(lab)).parameters.count,23);
    await lab.getByRole('button',{name:'Dismiss',exact:true}).click();
    await settle(lab,23);
    await lab.evaluate(() => window.n0vector.run({cmd:'setVectorParameters',parameters:{count:26}}));
    await lab.getByRole('button',{name:'Apply proposal'}).click();
    await settle(lab,26);

    await drawer(lab,'export').click();
    const saved = await download(lab,lab.locator('#vector-save'));
    const savedProject = JSON.parse(saved);
    await lab.reload();
    await lab.locator('#modeVector').click();
    assert.deepEqual(await read(lab),savedProject);
    await lab.locator('#vector-look-list button').nth(1).click();
    await drawer(lab,'export').click();
    await lab.locator('#vector-file').setInputFiles({name:'saved.n0vector.json',mimeType:'application/json',buffer:Buffer.from(saved)});
    await settle(lab,26);
    assert.deepEqual(await read(lab),savedProject);
    const svg = await download(lab,lab.locator('#vector-svg'));
    const check = await lab.evaluate(async markup => {
      const node = new DOMParser().parseFromString(markup,'image/svg+xml');
      const image = new Image();
      image.src = 'data:image/svg+xml,'+encodeURIComponent(markup);
      await image.decode();
      return {paths:[...node.querySelectorAll('path')].map(path => path.getAttribute('d')),scripts:node.querySelectorAll('script,image,parsererror').length};
    },svg);
    assert.equal(check.paths.length,26);
    assert.equal(check.scripts,0);

    const studio = await openPopup(lab,lab.locator('#vector-studio'),/studio-app\.html/,errors);
    await activeLayer(studio).waitFor();
    assert.equal(await studio.locator('#layerlist [data-layer-id]').count(),1);
    assert.equal(await activeLayer(studio).getAttribute('data-type'),'procedure');
    const exported = await studioSVG(studio);
    const decoded = await studio.evaluate(async ({labSVG,studioSVG}) => {
      const parser = new DOMParser();
      const paths = [...parser.parseFromString(studioSVG,'image/svg+xml').querySelectorAll('path')].map(path => path.getAttribute('d'));
      const paint = document.querySelector('#preview');
      const labImage = new Image();
      labImage.src = 'data:image/svg+xml,'+encodeURIComponent(labSVG);
      await labImage.decode();
      const reference = document.createElement('canvas');
      reference.width = paint.width;
      reference.height = paint.height;
      const ctx = reference.getContext('2d');
      ctx.drawImage(labImage,0,0);
      const a = ctx.getImageData(0,0,paint.width,paint.height).data;
      const b = paint.getContext('2d').getImageData(0,0,paint.width,paint.height).data;
      let difference = 0;
      for (let i = 3; i < a.length; i += 4) difference += Math.abs(a[i]-b[i]);
      return {paths,difference:difference/(a.length/4)};
    },{labSVG:svg,studioSVG:exported});
    assert.deepEqual(decoded.paths,check.paths);
    assert.ok(decoded.difference < 2,`Canvas/SVG mean alpha error ${decoded.difference}`);

    for (const [id,value] of Object.entries({posX:27,posY:-14,scale:123,rotation:29})) await changeValue(studio,id,value);
    await studio.locator('#opacity').focus();
    await studio.locator('#opacity').press('ArrowLeft');
    await studio.locator('#addLayer').click();
    await studio.getByRole('button',{name:'Centered shape',exact:true}).click();
    await studio.getByRole('button',{name:'Hide Shape',exact:true}).click();
    const transformed = await saveStudio(studio);
    const [otherLayer,original] = transformed.layers;
    assert.equal(otherLayer.type,'shape');
    assert.equal(otherLayer.visible,false);
    assert.deepEqual([original.x,original.y,original.scale,original.rotation,original.opacity],[27,-14,123,29,99]);
    assert.deepEqual(original.definition,savedProject);
    const reopened = await context.newPage();
    watch(reopened,errors);
    await openProject(reopened,transformed);
    const procedural = reopened.locator('#layerlist [data-type=procedure]');
    assert.equal(await procedural.getAttribute('data-layer-id'),original.id);
    await procedural.locator('[data-action$=":select"]').click();
    const previousPixels = await canvas(reopened);
    const editor = await openPopup(reopened,reopened.getByRole('button',{name:'Edit in Lab',exact:true}),/lab\.html/,errors);
    await settle(editor,26);
    await changeValue(editor,'vector-input-count',31);
    await settle(editor,31);
    await drawer(editor,'export').click();
    const close = editor.waitForEvent('close');
    await editor.locator('#vector-studio').click();
    await close;
    await frame(reopened);
    assert.notEqual(await canvas(reopened),previousPixels);
    const updated = await saveStudio(reopened);
    assert.deepEqual(updated.layers,[otherLayer,{...original,definition:{...savedProject,parameters:{...savedProject.parameters,count:31}}}]);
    await reopened.locator('#undo').click();
    await frame(reopened);
    assert.equal(await canvas(reopened),previousPixels);
    assert.deepEqual((await saveStudio(reopened)).layers,[otherLayer,original]);
    await reopened.locator('#redo').click();
    assert.deepEqual((await saveStudio(reopened)).layers,updated.layers);

    await reopened.locator('#opacity').focus();
    await reopened.locator('#opacity').press('End');
    await reopened.getByRole('button',{name:'Expand to Paths',exact:true}).click();
    assert.equal(await reopened.locator('#layerlist [data-type=path]').count(),31);
    const expansion = await saveStudio(reopened);
    assert.deepEqual(expansion.layers[0],otherLayer);
    assert.ok(expansion.layers.slice(1).every(layer => layer.points.length && layer.fill === null));
    await reopened.locator('#undo').click();
    await reopened.getByRole('button',{name:'Rasterize vector',exact:true}).click();
    assert.equal(await reopened.locator('#layerlist [data-type=image]').count(),1);
    await reopened.locator('#undo').click();
    assert.equal(await reopened.locator('#layerlist [data-type=procedure]').count(),1);

    for (const [width,height] of [[360,640],[820,1180]]) {
      const touch = await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
      watch(touch,errors);
      await touch.goto(url('lab.html?vector'));
      await preview(touch).waitFor();
      await drawer(touch,'params').click();
      const size = await preview(touch).boundingBox();
      assert.ok(size.width >= 250 && size.height >= 160);
      assert.ok(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await touch.locator('#src-toggle').click();
      await source(touch).waitFor();
      assert.ok(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await touch.close();
    }
    assert.deepEqual(errors,[]);
    console.log('Passed Vector Lab editing, files, SVG parity, Studio round trip, history, conversions and responsive layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
