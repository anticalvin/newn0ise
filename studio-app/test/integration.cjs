'use strict';

const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {mkdir, readFile} = require('node:fs/promises');
const {join} = require('node:path');
const assert = require('node:assert/strict');

const url = process.env.STUDIO_URL || 'http://127.0.0.1:8789/studio-app.html';
const artifacts = process.env.STUDIO_ARTIFACTS || join(require('node:os').tmpdir(),'studio-integration');
const screenshot = (page,name) => page.screenshot({path:join(artifacts,name+'.png')});
const canvasData = page => page.locator('#preview').evaluate(c => c.toDataURL());
const forPaint = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));
const menu = page => page.getByRole('dialog');
const pngData = bytes => 'data:image/png;base64,'+bytes.toString('base64');

async function setNumber(page,label,value) {
  const field = page.getByLabel(label,{exact:true});
  await field.fill(String(value));
  await field.press('Tab');
  await forPaint(page);
}

async function clickAndDownload(page,button) {
  const pending = page.waitForEvent('download');
  await button.click();
  return pending;
}

async function downloadPNG(page) {
  await page.locator('#export').click();
  return clickAndDownload(page,menu(page).getByRole('button',{name:'Download PNG',exact:true}));
}

async function save(page) {
  await page.locator('#menu').click();
  return clickAndDownload(page,menu(page).getByRole('button',{name:'Save project',exact:true}));
}

async function newLandscape(page) {
  await page.locator('#menu').click();
  await menu(page).getByRole('button',{name:'New composition…'}).click();
  await page.locator('#launchRatio').selectOption('landscape');
  await page.locator('#launchCreate').click();
}

async function pixelsEqual(page,first,second) {
  return page.evaluate(async ([a,b]) => {
    async function decode(src) {
      const image = new Image();
      image.src = src;
      await image.decode();
      const c = document.createElement('canvas');
      c.width = image.width; c.height = image.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(image,0,0);
      return ctx.getImageData(0,0,c.width,c.height).data;
    }
    const [before,after] = await Promise.all([decode(a),decode(b)]);
    return before.length === after.length && before.every((value,i) => value === after[i]);
  },[first,second]);
}

(async () => {
  await mkdir(artifacts,{recursive:true});
  const browser = await chromium.launch({
    executablePath:process.env.CHROME,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  const errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror',error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    window.contexts = new Set();
    HTMLCanvasElement.prototype.getContext = function(type,...args) {
      const context = original.call(this,type,...args);
      if (type === 'webgl2' && context) contexts.add(context);
      return context;
    };
  });
  try {
    await page.goto(new URL('index.html',url).href);
    await page.locator('#studio-link').click();
    await page.waitForURL(url);
    await page.locator('#launcher').waitFor();
    await screenshot(page,'desktop-launcher');
    await page.locator('#launchDemo').click();
    await page.locator('#spatialTab').waitFor();
    await forPaint(page);
    await screenshot(page,'desktop-canvas');
    await newLandscape(page);
    await forPaint(page);
    assert.equal(await page.locator('#preview').evaluate(c => c.getContext('2d').getImageData(0,0,1,1).data[3]),0);

    await page.locator('#addLayer').click();
    await menu(page).getByRole('button',{name:'Metallic torus'}).click();
    await forPaint(page);
    const beforeSpatial = await canvasData(page);
    assert.equal(await page.locator('#preview').evaluate(c => c.getContext('2d').getImageData(1165,440,1,1).data[3]) > 0,true);
    assert.equal(await page.locator('#preview').evaluate(c => c.getContext('2d').getImageData(0,0,1,1).data[3]),0);
    await page.locator('#spatialTab').click();
    await setNumber(page,'Rotation Y °',32);
    assert.equal(await page.getByLabel('Rotation Y °',{exact:true}).inputValue(),'32');
    const spatial = await page.locator('#spatialCanvas').boundingBox();
    const x = spatial.x+spatial.width/2, y = spatial.y+spatial.height/2;
    const spin = () => page.getByLabel('Rotation Z °',{exact:true}).inputValue();
    const spinBefore = await spin();
    const radius = spatial.height*.097;
    await page.mouse.move(x+radius,y);
    await page.mouse.down();
    await page.mouse.move(x+radius*.62,y+radius*.78,{steps:10});
    await page.mouse.up();
    await forPaint(page);
    assert.notEqual(await spin(),spinBefore,'The Three.js rotation gizmo should change rotation');
    const finalRotation = [];
    for (const axis of ['X','Y','Z']) {
      finalRotation.push(Number(await page.getByLabel(`Rotation ${axis} °`,{exact:true}).inputValue())*Math.PI/180);
    }
    await screenshot(page,'desktop-spatial');
    await page.locator('[data-view=canvas]').click();
    await forPaint(page);
    assert.notEqual(await canvasData(page),beforeSpatial);

    const fixture = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 360;c.height = 200;
      const ctx = c.getContext('2d'), gradient = ctx.createLinearGradient(0,0,c.width,c.height);
      gradient.addColorStop(0,'#251f24');gradient.addColorStop(1,'#4c3442');
      ctx.fillStyle = gradient;ctx.fillRect(0,0,c.width,c.height);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#addLayer').click();
    const chooser = page.waitForEvent('filechooser');
    await menu(page).getByRole('button',{name:'Import background image…'}).click();
    await (await chooser).setFiles({
      name:'Studio backdrop.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')
    });
    await page.locator('.layertext').getByText('Studio backdrop.png',{exact:true}).waitFor();
    await page.locator('#layerlist').getByRole('button',{name:'Metallic torus',exact:true}).click();
    await forPaint(page);
    const original = await canvasData(page);

    await page.getByRole('button',{name:'Add effect',exact:true}).click();
    const search = menu(page).getByRole('searchbox',{name:'Search effects'});
    await search.fill('warm glow');
    await menu(page).getByRole('button',{name:/^Halation/}).click();
    await setNumber(page,'Strength',78);
    const effected = await canvasData(page);
    assert.notEqual(effected,original);

    await page.locator('[data-view=split]').click();
    await forPaint(page);
    await screenshot(page,'desktop-split');
    await page.locator('[data-view=graph]').click();
    await page.locator('[data-node]').first().waitFor();
    const messages = await page.locator('#graphsvg .node').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
    assert.deepEqual(messages,['Scene','Output','Halation']);
    assert.equal(await page.locator('#graphsvg .wire').count(),2);
    await setNumber(page,'Spread',30);
    await screenshot(page,'desktop-graph');
    await page.locator('[data-view=canvas]').click();
    await forPaint(page);
    const composed = await canvasData(page);
    assert.notEqual(composed,effected);

    const png = await downloadPNG(page);
    const bytes = await readFile(await png.path());
    assert.equal(bytes.readUInt32BE(16),1920);
    assert.equal(bytes.readUInt32BE(20),1080);
    assert(await pixelsEqual(page,composed,pngData(bytes)),'PNG must match the preview');
    await png.saveAs(join(artifacts,'torus-halation.png'));
    const editable = await save(page);
    const project = JSON.parse(await readFile(await editable.path(),'utf8'));
    const torus = project.layers.find(layer => layer.type === 'scene');
    assert(torus.asset.transform.rotation.every((value,i) => Math.abs(value-finalRotation[i])<0.001));
    assert.equal(torus.chain.nodes.find(n => n.type === 'effect').params.values.amt,78);
    assert.equal(torus.chain.nodes.find(n => n.type === 'effect').params.values.rad,30);
    assert.equal(torus.chain.edges.length,2);
    assert.equal(project.layers[1].name,'Studio backdrop.png');
    const projectFile = join(artifacts,'torus-halation.n0studio.json');
    await editable.saveAs(projectFile);
    await newLandscape(page);
    await page.locator('#openFile').setInputFiles(projectFile);
    await page.getByText('Project opened.').waitFor();
    await forPaint(page);
    assert(await pixelsEqual(page,composed,await canvasData(page)),'Rendered pixels must survive reopening');
    const reopened = JSON.parse(await readFile(await (await save(page)).path(),'utf8'));
    assert.deepEqual(reopened.layers,project.layers);

    assert.equal(await page.evaluate(() => contexts.size),1);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
    await page.waitForFunction(() => [...contexts].every(gl => gl.isContextLost()));
    assert.deepEqual(errors,[]);

    const mobile = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    mobile.on('pageerror',error => errors.push(error.message));
    await mobile.goto(url);
    await mobile.locator('#launcher').waitFor();
    await screenshot(mobile,'mobile-launcher');
    assert.equal(await mobile.locator('#launcher .brand').evaluate(link => link.href),new URL('index.html',url).href);
    assert.equal(await mobile.locator('#launchRatio').inputValue(),'custom');
    const screenSize = await mobile.evaluate(() => [
      Math.round((screen.width || innerWidth)*Math.max(1,devicePixelRatio)),
      Math.round((screen.height || innerHeight)*Math.max(1,devicePixelRatio))
    ]);
    assert.deepEqual(await Promise.all([
      mobile.getByLabel('Width (px)').inputValue().then(Number),
      mobile.getByLabel('Height (px)').inputValue().then(Number)
    ]),screenSize);
    await mobile.locator('#launchDemo').tap();
    await mobile.locator('#spatialTab').waitFor();
    await forPaint(mobile);
    assert.deepEqual(await mobile.locator('#preview').evaluate(c => [c.width,c.height]),screenSize);
    const mobileBoard = await mobile.locator('#artboard').boundingBox();
    assert(mobileBoard && mobileBoard.width > 100 && mobileBoard.height > 100,'Mobile artboard must have a visible, usable size.');
    assert(await mobile.evaluate(() => document.documentElement.scrollWidth === innerWidth));
    await screenshot(mobile,'mobile-canvas');
    await mobile.locator('#spatialTab').tap();
    await forPaint(mobile);
    await screenshot(mobile,'mobile-spatial');
    await mobile.locator('[data-view=canvas]').tap();
    for (const name of ['select','brush','pen','text','crop','lasso','eraser','line','gradient','picker']) {
      const button = mobile.locator(`.tool[data-tool="${name}"]`);
      await button.tap();
      assert(await button.evaluate(node => node.classList.contains('active')),`${name} tool should activate on touch.`);
      assert.equal(await mobile.locator('#stagebody').getAttribute('data-tool'),name);
    }
    const textButton = mobile.locator('.tool[data-tool=text]');
    await textButton.tap();
    const textPoint = {x:mobileBoard.x+mobileBoard.width*.5,y:mobileBoard.y+mobileBoard.height*.5};
    await mobile.touchscreen.tap(textPoint.x,textPoint.y);
    const mobileText = mobile.getByRole('textbox',{name:'Type on canvas'});
    await mobileText.waitFor();
    await mobileText.pressSequentially('Mobile type');
    await mobileText.press('Control+Enter');
    await mobile.locator('[data-mobile=left]').tap();
    await mobile.locator('#layerlist .layertext').getByText('Text',{exact:true}).waitFor();
    await mobile.locator('[data-mobile=canvas]').tap();
    await mobile.locator('.tool[data-tool=brush]').tap();
    const cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:textPoint.x-40,y:textPoint.y+70}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:textPoint.x+40,y:textPoint.y+90}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await mobile.waitForFunction(() => document.querySelector('#selectedName')?.textContent === 'Vector stroke');
    await mobile.locator('.tool[data-tool=select]').tap();
    await mobile.locator('#undo').tap();
    await mobile.locator('#redo').tap();
    await mobile.locator('#fit').tap();
    await mobile.locator('[data-mobile=right]').tap();
    assert(await mobile.locator('#right').evaluate(node => node.classList.contains('mobileopen')),'Inspector must open on mobile.');
    await mobile.locator('[data-mobile=canvas]').tap();
    await mobile.locator('#menu').tap();
    await menu(mobile).waitFor();
    await menu(mobile).getByRole('button',{name:'Keyboard and gestures'}).tap();
    await mobile.locator('#modal').waitFor({state:'visible'});
    await mobile.locator('#modalcancel').tap();
    await mobile.locator('[data-mobile=left]').tap();
    const mobileRows = () => mobile.locator('#layerlist .layertext').allTextContents();
    const grip = await mobile.getByRole('button',{name:'Reorder Background',exact:true}).boundingBox();
    const top = await mobile.getByRole('button',{name:'Reorder Metallic torus',exact:true}).boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:grip.x+grip.width/2,y:grip.y+grip.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:top.x+top.width/2,y:top.y+6}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const reorderedMobileRows = await mobileRows();
    assert(reorderedMobileRows.indexOf('Background') < reorderedMobileRows.indexOf('Metallic torus'),
      'A touch drag should reorder the selected layer before the target layer.');
    await mobile.close();

    const editor = await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    editor.on('pageerror',error => errors.push(error.message));
    await editor.goto(url);
    await editor.locator('#launcher').waitFor();
    await editor.locator('#launchRatio').selectOption('custom');
    await editor.getByLabel('Width (px)').fill('1050');
    await editor.getByLabel('Height (px)').fill('700');
    await editor.locator('#launchFile').setInputFiles({name:'proof.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
    await editor.locator('.layertext').getByText('proof.png',{exact:true}).waitFor();
    await forPaint(editor);
    assert.deepEqual(await editor.locator('#preview').evaluate(c => [c.width,c.height]),[360,200]);

    await editor.locator('[data-tool=text]').click();
    const artboard = await editor.locator('#artboard').boundingBox();
    const textX = artboard.x+artboard.width/2, textY = artboard.y+artboard.height*.5;
    await editor.mouse.click(textX,textY);
    const textInput = editor.getByRole('textbox',{name:'Type on canvas'});
    await textInput.waitFor();
    assert(await textInput.evaluate(input => input === document.activeElement));
    const emptyText = await canvasData(editor);
    await textInput.pressSequentially('NOISE TYPE');
    await forPaint(editor);
    assert.notEqual(await canvasData(editor),emptyText);
    await textInput.press('Control+Enter');
    // Inline text begins at the insertion point, so double-click inside the glyphs.
    await editor.mouse.dblclick(artboard.x+artboard.width*.75,textY);
    await textInput.waitFor();
    assert.equal(await textInput.inputValue(),'NOISE TYPE');
    await textInput.press('Escape');
    const rows = () => editor.locator('#layerlist .layertext').allTextContents();
    assert.deepEqual(await rows(),['Text','proof.png']);
    const textGrip = await editor.getByRole('button',{name:'Reorder Text',exact:true}).boundingBox();
    const imageGrip = await editor.getByRole('button',{name:'Reorder proof.png',exact:true}).boundingBox();
    await editor.mouse.move(textGrip.x+textGrip.width/2,textGrip.y+textGrip.height/2);
    await editor.mouse.down();
    await editor.mouse.move(imageGrip.x+imageGrip.width/2,imageGrip.y+imageGrip.height-5,{steps:10});
    await editor.mouse.up();
    assert.deepEqual(await rows(),['proof.png','Text']);
    await editor.locator('#undo').click();
    assert.deepEqual(await rows(),['Text','proof.png']);
    const customExport = await downloadPNG(editor);
    const customBytes = await readFile(await customExport.path());
    assert.equal(customBytes.readUInt32BE(16),360);
    assert.equal(customBytes.readUInt32BE(20),200);
    const customProject = await save(editor);
    const customJSON = JSON.parse(await readFile(await customProject.path(),'utf8'));
    assert.deepEqual(customJSON.size,[360,200]);
    assert.equal(customJSON.layers.find(l => l.type === 'text').text,'NOISE TYPE');
    await editor.locator('#menu').click();
    await menu(editor).getByRole('button',{name:'New composition…'}).click();
    await editor.locator('#launchFile').setInputFiles({name:'custom.n0studio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(customJSON))});
    await editor.locator('#launcher').waitFor({state:'hidden'});
    assert.deepEqual(await rows(),['Text','proof.png']);
    assert.deepEqual(errors,[]);
    console.log('Passed: Spatial gizmo, transparent torus, photo composition, real Halation, graph editing, exact PNG and reopen parity, one WebGL context, teardown, homepage entry, mobile and desktop drag, live typing, and custom-size upload, export and reopen.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
