// ?debug=1 telemetry: frame time, fps, draw calls, triangles, physics bodies, instances, loaded assets, JS heap. Read-only, off by default.
// window.n0.telemetry() returns the same numbers for tests (tools/core-smoke.mjs).
export function createTelemetry(app) {
  const r = app.renderer; let ema = 16.7, last = performance.now(), el = null;
  const read = () => ({
    fps: +(1000 / ema).toFixed(1), frameMs: +ema.toFixed(2), pixelRatio: app.pr, calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures,
    bodies: app.phys.ready ? app.phys.world.bodies.len() : 0, physics: app.phys.ready ? 'rapier' : 'fallback', palms: app.palms.items.length, boulders: app.boulders.items.length, entities: app.entities ? app.entities.size : 0,
    instances: app.entities ? app.entities.instanceCount() : 0, assets: app.assets ? app.assets.loaded() : 0, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null });
  function tick(now) { ema += ((now - last) - ema) * 0.08; last = now; if (el && (tick.n = (tick.n || 0) + 1) % 20 === 0) { const t = read(); el.textContent = `${t.fps} fps  ${t.frameMs} ms  pr ${t.pixelRatio}\ncalls ${t.calls}  tris ${t.triangles}\nbodies ${t.bodies} (${t.physics})  entities ${t.entities}  instances ${t.instances}\nassets ${t.assets}  heap ${t.heapMB ?? '?'} MB`; } }
  if (new URLSearchParams(location.search).get('debug')) { el = document.createElement('pre'); el.id = 'dbg'; el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9;margin:0;padding:6px 8px;font:11px/1.4 ui-monospace,monospace;color:#ede8df;background:rgba(0,0,0,.55);border-radius:8px;pointer-events:none;white-space:pre'; document.body.appendChild(el); }
  return { tick, read };
}
