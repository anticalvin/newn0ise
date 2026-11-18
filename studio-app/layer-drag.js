'use strict';

function studioLayerDrag(list,move) {
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
    const candidates = rows().filter(row => row.dataset.layerId !== drag.id);
    const next = candidates.find(row => {
      const rect = row.getBoundingClientRect();
      return drag.y < rect.top+rect.height/2;
    });
    const last = candidates.at(-1);
    drag.before = next?.dataset.layerId ?? null;
    for (const row of candidates) {
      row.classList.toggle('drop-before',row === next);
      row.classList.toggle('drop-after',!next && row === last);
    }
    frame = requestAnimationFrame(update);
  }
  function end(e,commit) {
    if (e.pointerId !== drag?.pointer) return;
    const current = drag;
    drag = null;
    cancelAnimationFrame(frame);
    for (const row of rows()) row.classList.remove('drag-layer','drop-before','drop-after');
    if (commit && current.active) move(current.id,current.before);
  }
  list.addEventListener('pointerdown',e => {
    const grip = e.target.closest('[data-layer-grip]');
    if (!grip || drag || e.button !== 0) return;
    grip.focus({preventScroll:true});
    grip.setPointerCapture(e.pointerId);
    drag = {id:grip.dataset.layerGrip,pointer:e.pointerId,origin:e.clientY,y:e.clientY};
  });
  list.addEventListener('pointermove',e => {
    if (e.pointerId !== drag?.pointer) return;
    drag.y = e.clientY;
    if (drag.active || Math.abs(drag.y-drag.origin) < 5) return;
    drag.active = true;
    e.target.closest('[data-layer-id]')?.classList.add('drag-layer');
    update();
  });
  list.addEventListener('pointerup',e => {
    if (drag?.active) {
      drag.y = e.clientY;
      cancelAnimationFrame(frame);
      update();
    }
    end(e,true);
  });
  list.addEventListener('pointercancel',e => end(e,false));
  list.addEventListener('lostpointercapture',e => end(e,false));
}
