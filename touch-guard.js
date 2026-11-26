/* No browser text selection, callout or double-tap zoom on the app surfaces. Text fields, code editors and anything marked .selectable stay selectable. */
(() => {
  const css = document.createElement('style');
  css.textContent = 'html,body{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%}'
    + 'input,textarea,select,[contenteditable="true"],[contenteditable="true"] *,.selectable,.selectable *,.cm-content,.cm-content *{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}'
    + 'img,canvas,svg,video{-webkit-user-drag:none;-webkit-touch-callout:none}';
  document.head.appendChild(css);
  const field = t => t && t.closest && t.closest('input,textarea,select,[contenteditable="true"],.selectable,.cm-content');
  for (const t of ['gesturestart','gesturechange','gestureend']) document.addEventListener(t,e => e.preventDefault(),{passive:false});
  document.addEventListener('dblclick',e => { if (!field(e.target)) e.preventDefault(); },{passive:false});
  document.addEventListener('selectstart',e => { if (!field(e.target)) e.preventDefault(); });
  document.addEventListener('contextmenu',e => { if (e.pointerType === 'touch' && !field(e.target)) e.preventDefault(); });
})();
