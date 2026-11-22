'use strict';

/* move(id,beforeId,toBin): when the pointer is released over the bin, toBin is true and nothing is reordered. Escape or a cancelled pointer drops nothing. */
function studioLayerDrag(list,move,bin) {
  let drag, frame = 0, swallow = false;
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
    if (current.active && current.fromRow) { swallow = true; setTimeout(() => { swallow = false; },60); }
    if (commit && current.active) move(current.id,current.before,!!current.bin);
  }
  /* a layer can be picked up anywhere on its row, not only by the grip. Mouse and pen start after 5 px; on touch a short hold starts the drag so scrolling the list still works. */
  let hold = 0, startedBy = null;
  const interactive = t => t.closest('input,select,textarea,.eye,.layer-lock,[data-action$=":lock"],[data-action$=":visible"]');
  list.addEventListener('pointerdown',e => {
    if (drag || e.button !== 0) return;
    const grip = e.target.closest('[data-layer-grip]'), row = e.target.closest('[data-layer-id]');
    if (!grip && (!row || interactive(e.target))) return;
    const id = grip ? grip.dataset.layerGrip : row.dataset.layerId, el = grip || row;
    if (grip) grip.focus({preventScroll:true});
    const begin = () => { try { el.setPointerCapture(e.pointerId); } catch {} drag = {id,pointer:e.pointerId,origin:e.clientY,y:e.clientY,x:e.clientX,fromRow:!grip,touch:e.pointerType === 'touch',ready:true}; };
    if (!grip && e.pointerType === 'touch') {
      startedBy = {x:e.clientX,y:e.clientY,pointer:e.pointerId};
      hold = setTimeout(() => { hold = 0; begin(); drag.active = true; navigator.vibrate?.(8); e.target.closest('[data-layer-id]')?.classList.add('drag-layer'); bin?.classList.add('dragging'); update(); },260);
    } else begin();
  });
  addEventListener('pointermove',e => { if (hold && startedBy && e.pointerId === startedBy.pointer && Math.hypot(e.clientX-startedBy.x,e.clientY-startedBy.y) > 8) { clearTimeout(hold); hold = 0; } },true);
  const clearHold = () => { clearTimeout(hold); hold = 0; };
  addEventListener('pointerup',clearHold,true); addEventListener('pointercancel',clearHold,true);
  /* a drag that started on a row must not also select it */
  list.addEventListener('click',e => { if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; } },true);
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
