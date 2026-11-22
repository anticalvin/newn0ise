'use strict';

/* move(id,beforeId,toBin): when the pointer is released over the bin, toBin is true and nothing is reordered. Escape or a cancelled pointer drops nothing. */
function studioLayerDrag(list,move,bin) {
  let drag, frame = 0;
  const rows = () => [...list.querySelectorAll('[data-layer-id]')];
  function update() {
    if (!drag?.active) return;
    const bounds = list.getBoundingClientRect();
    const top = drag.y-bounds.top, bottom = bounds.bottom-drag.y;
    if (top < 27 || bottom < 27) {
      const delta = top < 27 ? -Math.min(14,27-top) : Math.min(14,27-bottom);
      list.scrollTop += delta;
    }
    const overBin = !!bin && (() => { const b = bin.getBoundingClientRect(); return drag.y >= b.top-4 && drag.y <= b.bottom+4 && drag.x >= b.left && drag.x <= b.right; })();
    drag.bin = overBin; bin?.classList.toggle('armed',overBin);
    const candidates = rows().filter(row => row.dataset.layerId !== drag.id);
    const next = candidates.find(row => {
      const rect = row.getBoundingClientRect();
      return drag.y < rect.top+rect.height/2;
    });
    const last = candidates.at(-1);
    drag.before = next?.dataset.layerId ?? null;
    for (const row of candidates) {
      row.classList.toggle('drop-before',!overBin && row === next);
      row.classList.toggle('drop-after',!overBin && !next && row === last);
    }
    frame = requestAnimationFrame(update);
  }
  function end(e,commit) {
    if (e.pointerId !== drag?.pointer) return;
    const current = drag;
    drag = null;
    cancelAnimationFrame(frame);
    for (const row of rows()) row.classList.remove('drag-layer','drop-before','drop-after');
    bin?.classList.remove('armed','dragging');
    if (commit && current.active) move(current.id,current.before,!!current.bin);
  }
  list.addEventListener('pointerdown',e => {
    const grip = e.target.closest('[data-layer-grip]');
    if (!grip || drag || e.button !== 0) return;
    grip.focus({preventScroll:true});
    try { grip.setPointerCapture(e.pointerId); } catch {}
    drag = {id:grip.dataset.layerGrip,pointer:e.pointerId,origin:e.clientY,y:e.clientY,x:e.clientX};
  });
  list.addEventListener('pointermove',e => {
    if (e.pointerId !== drag?.pointer) return;
    drag.y = e.clientY; drag.x = e.clientX;
    if (drag.active || Math.abs(drag.y-drag.origin) < 5) return;
    drag.active = true; bin?.classList.add('dragging');
    e.target.closest('[data-layer-id]')?.classList.add('drag-layer');
    update();
  });
  list.addEventListener('pointerup',e => {
    if (drag?.active) {
      drag.y = e.clientY; drag.x = e.clientX;
      cancelAnimationFrame(frame);
      update();
    }
    end(e,true);
  });
  list.addEventListener('pointercancel',e => end(e,false));
  addEventListener('keydown',e => { if (e.key === 'Escape' && drag?.active) { e.preventDefault(); end({pointerId:drag.pointer},false); } });
  list.addEventListener('lostpointercapture',e => end(e,false));
}
