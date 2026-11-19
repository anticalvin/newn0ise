'use strict';

function studioContextMenu(element) {
  let previous;
  function close(restore = false) {
    if (element.hidden) return;
    element.hidden = true;
    if (restore && previous?.isConnected) previous.focus({preventScroll:true});
  }
  function show(x,y,actions) {
    if (element.hidden) previous = document.activeElement;
    element.replaceChildren();
    for (const [label,run] of actions) {
      const button = document.createElement('button');
      button.textContent = label;
      button.setAttribute('role','menuitem');
      button.onclick = () => { close(); run(); };
      element.append(button);
    }
    element.hidden = false;
    element.style.left = Math.max(6,Math.min(x,innerWidth-element.offsetWidth-6))+'px';
    element.style.top = Math.max(6,Math.min(y,innerHeight-element.offsetHeight-6))+'px';
    element.firstElementChild?.focus({preventScroll:true});
  }
  element.addEventListener('keydown',e => {
    if (e.key === 'Tab') { close(true); return; }
    if (!['Escape','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { close(true); return; }
    const items = [...element.children], index = items.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 :
      (index+(e.key === 'ArrowUp' ? -1 : 1)+items.length)%items.length;
    items[next]?.focus({preventScroll:true});
  });
  document.addEventListener('pointerdown',e => { if (!element.contains(e.target)) close(); },true);
  window.addEventListener('resize',() => close());
  return {show,close};
}
