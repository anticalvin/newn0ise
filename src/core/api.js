// AI surface for Core. Same bridge protocol as src/studio-api.js / tools/mcp/server.mjs: the page connects to ws://localhost:8787 (open core.html?mcp=1),
// every message {id,args} is answered with {id,result} or {id,error}. Commands run through Core.exec, so an AI gets exactly the validation,
// limits and undo history a person gets. Accepts {cmd:"core",command:{...}}, a raw Core command ({cmd:"scene.new",...}), batch, render and describe.
export function createCoreApi(app) {
  const core = app.core;
  const out = r => { if (r && r.ok === false) throw new Error(r.msg || 'Command failed'); return r; };
  async function run(a) {
    if (!a || typeof a !== 'object') throw new Error('Pass an object like {cmd:"describe"}.');
    let c = a.cmd === 'core' ? a.command : a;
    if (!c || typeof c.cmd !== 'string') throw new Error('Missing "cmd". Run {cmd:"describe"} for the list.');
    switch (c.cmd) {
      case 'batch': { const res = []; for (const op of c.ops || []) { try { res.push(await run(op)); } catch (e) { res.push({ error: String(e.message || e) }); if (c.stopOnError) break; } } return { results: res }; }
      case 'render': {
        const w = Math.min(2400, Math.max(160, +c.width || 960)), r = app.renderer, cv = r.domElement, W = cv.width, H = cv.height, pr = r.getPixelRatio();
        const h = Math.round(w * innerHeight / innerWidth); r.setPixelRatio(1); r.setSize(w, h, false); app.camera.aspect = w / h; app.camera.updateProjectionMatrix(); r.render(app.scene, app.camera);
        const data = cv.toDataURL('image/png').split(',')[1]; r.setPixelRatio(pr); r.setSize(W / pr, H / pr, false); app.camera.aspect = innerWidth / innerHeight; app.camera.updateProjectionMatrix();
        return { base64: data, mime: 'image/png', pass: 'beauty', width: w, height: h };
      }
      case 'camera': { const cam = app.cam; if (c.mode === 'edit' || c.mode === 'explore') app.setMode(c.mode); if (Number.isFinite(+c.yaw)) cam.yaw = +c.yaw; if (Number.isFinite(+c.pitch)) cam.pitch = Math.min(1.45, Math.max(0.03, +c.pitch)); if (Number.isFinite(+c.dist)) cam.dist = Math.min(160, Math.max(2, +c.dist));
        if (Array.isArray(c.target) && app.mode === 'edit') cam.target.set(+c.target[0], app.terrain.hAt(+c.target[0], +c.target[1]), +c.target[1]); return { mode: app.mode, yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist }; }
      default: { let r = core.exec(c); if (r && typeof r.then === 'function') r = await r; return out(r); }
    }
  }
  return { run };
}

export function connectBridge(app, url = 'ws://localhost:8787') {
  const api = createCoreApi(app); let ws, tries = 0;
  const open = () => {
    try { ws = new WebSocket(url); } catch (e) { app.ui.toast('Could not open ' + url); return; }
    ws.onopen = () => { tries = 0; ws.send(JSON.stringify({ hello: 'n0ise-core', v: 1 })); app.ui.toast('AI connected'); };
    ws.onmessage = async ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.id == null) return;
      try { ws.send(JSON.stringify({ id: m.id, result: await api.run(m.args || {}) })); } catch (e) { ws.send(JSON.stringify({ id: m.id, error: String(e && e.message || e) })); } app.ui.updHist(); app.ui.render(); };
    ws.onclose = ev => { if (ev && ev.code === 4000) { app.ui.toast('Another tab took over the AI connection'); return; } if (tries++ < 20) setTimeout(open, 2500); };
    ws.onerror = () => { if (tries === 0) app.ui.toast('No AI bridge at ' + url + ' yet. Start it with: node tools/mcp/server.mjs', 5000); };
  };
  open();
}
