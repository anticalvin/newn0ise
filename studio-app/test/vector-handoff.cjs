'use strict';

const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {readFile} = require('node:fs/promises');
const assert = require('node:assert/strict');

const base = new URL(process.env.STUDIO_URL || 'http://127.0.0.1:8789/studio-app.html');
const url = name => new URL(name,base).href;
const waitPaint = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const files = page => page.locator('#layerlist .layertext').allTextContents();
const dialog = page => page.getByRole('dialog');
const menu = page => page.getByRole('menu',{name:'Studio actions'});
const edit = page => page.getByRole('textbox',{name:'Type on canvas'});
const pngData = page => page.locator('#preview').evaluate(c => c.toDataURL());

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on('pageerror',e => errors.push(e.message));
  try {
    await page.goto(url('studio-app.html'));
    await page.locator('#launcher .brand').click();
    await page.waitForURL(url('index.html'));
    await page.locator('#studio-link').click();
    await page.waitForURL(url('studio-app.html'));
    if (await page.locator('#launcher').isHidden()) {
      await page.locator('#menu').click();
      await page.locator('#modal').waitFor({state:'visible'});
      await page.locator('#modalcontent').getByRole('button',{name:'New composition…'}).click();
    }
    await page.locator('#launchCreate').click();
    await waitPaint(page);
    const board = await page.locator('#artboard').boundingBox();
    const point = (x,y) => [board.x+x*board.width,board.y+y*board.height];
    const text = point(.5,.41), star = point(.25,.3);
    await page.locator('[data-tool=text]').click();
    await page.mouse.click(...text);
    await edit(page).fill('Noise <vector> & Type');
    await edit(page).press('Control+Enter');
    await page.locator('[data-tool=shape]').click();
    await dialog(page).getByRole('button',{name:'Star',exact:true}).click();
    await page.mouse.click(...star);
    assert.deepEqual(await files(page),['Star','Text']);
    await page.mouse.click(...star,{button:'right'});
    await menu(page).getByRole('menuitem',{name:'Edit anchors'}).click();
    assert.equal(await page.locator('#overlay [data-anchor][data-tangent]').count(),10);
    await page.locator('#fit').click();
    const stage = await page.locator('#stagebody').boundingBox();
    await page.mouse.click(stage.x+4,stage.y+20);
    assert.equal(await page.locator('.layer.active').count(),0);
    await page.getByRole('button',{name:'Draw vector stroke'}).click();
    await page.mouse.move(...point(.38,.7));
    await page.mouse.down();
    await page.mouse.move(...point(.48,.64),{steps:12});
    await page.mouse.move(...point(.62,.72),{steps:12});
    await page.mouse.up();
    assert.equal((await files(page))[0],'Vector stroke');
    await page.locator('#layerlist').getByRole('button',{name:'Text',exact:true}).click({button:'right'});
    await menu(page).getByRole('menuitem',{name:'Duplicate'}).click();
    assert.equal((await files(page))[0],'Text copy');
    await page.locator('#undo').click();

    await page.locator('#export').click();
    const downloading = page.waitForEvent('download');
    await dialog(page).getByRole('button',{name:'Download SVG'}).click();
    const svg = await readFile(await (await downloading).path(),'utf8');
    assert.match(svg,/<text[\s>]/);
    assert.match(svg,/&lt;vector&gt; &amp; Type/);
    assert.equal((svg.match(/<path[\s>]/g)||[]).length,2);
    const svgCheck = await page.evaluate(async source => {
      const parsed = new DOMParser().parseFromString(source,'image/svg+xml');
      const image = new Image();
      image.src = 'data:image/svg+xml,'+encodeURIComponent(source);
      await image.decode();
      return [parsed.querySelector('parsererror') === null,image.width,image.height];
    },svg);
    assert.deepEqual(svgCheck,[true,1920,1080]);

    await page.locator('#export').click();
    const popup = page.waitForEvent('popup');
    const expected = await pngData(page);
    await dialog(page).getByRole('button',{name:'Open in Effects'}).click();
    const effect = await popup;
    await effect.waitForURL(/effects\.html/);
    await effect.getByText('Opened from studio',{exact:true}).waitFor({timeout:15000});
    await page.bringToFront();
    assert.deepEqual(await files(page),['Vector stroke','Star','Text']);
    assert.equal(await pngData(page),expected);
    await effect.close();

    await page.locator('#export').click();
    const reliefPopup = page.waitForEvent('popup');
    await dialog(page).getByRole('button',{name:'Open in 3D as relief'}).click();
    const relief = await reliefPopup;
    await relief.waitForURL(/studio\.html/);
    await relief.getByText('Opened from studio',{exact:true}).waitFor({timeout:24000});
    await relief.close();

    const lab = await browser.newPage();
    lab.setDefaultTimeout(18000);
    await lab.goto(url('lab.html'));
    await lab.frameLocator('#preview').locator('canvas').waitFor();
    const still = await lab.frameLocator('#preview').locator('canvas').evaluate(c => [c.width,c.height]);
    await lab.getByRole('button',{name:'Export',exact:true}).click();
    await lab.getByRole('button',{name:'Send still to Studio',exact:true}).click();
    await lab.waitForURL(/studio-app\.html/);
    await lab.getByText('Lab still opened.').waitFor();
    await waitPaint(lab);
    assert.deepEqual(await files(lab),['Lab still']);
    assert.deepEqual(await lab.locator('#preview').evaluate(c => [c.width,c.height]),still);
    assert.deepEqual(errors,[]);
    console.log('Passed: wordmark home, vector type, shapes, freehand, anchors, context menu, deselect, valid SVG, Effects and 3D relief handoffs, and real Lab still.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
