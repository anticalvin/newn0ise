/* Shared n0ise UI: icons, toast and the "⋯" menu dialog. Every page imports this; page code only supplies the menu entries.
   Entries: {h:'Section'} | {label, icon, href} | {label, icon, run:()=>void} | {label, icon, click:'#id'} (clicks a real control). */
export const ICONS={cube:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/>',more:'<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',plus:'<path d="M12 4v16M4 12h16"/>',sliders:'<path d="M3 6h11m4 0h3M3 12h4m4 0h10M3 18h12m4 0h2M14 4v4m-7 2v4m8 2v4"/>',undo:'<path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12h-3"/>',reset:'<path d="M20 10a8 8 0 1 0 0 5m0-11v6h-6"/>',expand:'<path d="M13 5h6v6M5 13v6h6"/>',play:'<path d="m8 4 13 8-13 8z" fill="currentColor" stroke="none"/>',pause:'<circle cx="12" cy="12" r="9"/><path d="M10 8v8m4-8v8"/>',presets:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',export:'<path d="M12 3v12m-4-4 4 4 4-4m-12 4v5h16v-5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',layers:'<path d="m2 8 10-5 10 5-10 6zM2 12l10 6 10-6M2 16l10 6 10-6"/>',chevron:'<path d="m6 9 6 6 6-6"/>',right:'<path d="m9 6 6 6-6 6"/>'};
export const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]||''}</svg>`;
let tt=0;
export function toast(msg,ms=2600){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';t.setAttribute('role','status');document.body.append(t);}t.textContent=msg;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>{t.hidden=true;},ms);}
/* the one dialog every "⋯" button opens */
export function openMenu(title,entries,opener){
  let d=document.getElementById('dialog');
  if(!d){d=document.createElement('dialog');d.id='dialog';d.setAttribute('aria-labelledby','dialog-title');d.innerHTML='<div class="dialog-head"><h2 id="dialog-title"></h2><form method="dialog"><button class="ghost" aria-label="Close dialog">'+icon('close')+'</button></form></div><div class="dialog-body" id="dialog-body"></div>';document.body.append(d);
    d.addEventListener('click',e=>{if(e.target===d)d.close();});}
  d.querySelector('#dialog-title').textContent=title;const body=d.querySelector('#dialog-body');body.textContent='';
  for(const e of entries){
    if(e.h){const h=document.createElement('h3');h.textContent=e.h;body.append(h);continue;}
    if(e.p){const p=document.createElement('p');p.className='hint';p.textContent=e.p;body.append(p);continue;}
    const el=document.createElement(e.href?'a':'button');el.className='pill';if(e.href)el.href=e.href;else el.type='button';
    el.innerHTML=(e.icon?icon(e.icon):'')+'<span></span>';el.lastChild.textContent=e.label;if(e.disabled)el.disabled=true;
    if(!e.href)el.addEventListener('click',()=>{d.close();if(e.click){const t=document.querySelector(e.click);t&&t.click();}else if(e.run)e.run();});
    else el.addEventListener('click',ev=>{if(e.soon){ev.preventDefault();d.close();toast('Coming soon');}});
    body.append(el);
  }
  d.addEventListener('close',()=>{opener&&opener.isConnected&&opener.focus();},{once:true});
  d.showModal();
}
export const SPACES=[['Camera','effects.html?cam=1'],['Effects','effects.html'],['3D','studio.html'],['Lab','lab.html']];
/* workspace links and the Studio button share one menu for global actions */
export function menuEntriesCommon(){return [{h:'Go to'},...SPACES.map(([l,h])=>({label:l,href:h})),{label:'Home',href:'index.html'}];}
