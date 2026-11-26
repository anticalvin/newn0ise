// FIRST LIGHT browser tests: the isolated gameplay host, HUD, menus and clean return to Core. Format: [name, url, async body] returning true or a failure string.
export const tests = [];
const t = (name, url, body) => tests.push([name, url, body]);
const BOOT = `const wait=ms=>new Promise(r=>setTimeout(r,ms));const boot=async()=>{for(let i=0;i<80&&!document.querySelector('[data-act="begin"]');i++)await wait(150);const b=document.querySelector('[data-act="begin"]');if(!b)return false;b.click();await wait(900);return !!window.__fl};const key=(k)=>window.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));`;

t('first light: starts with the human rig, HUD shows objective, stamina and minimap', '/core.html?start=first-light&fldebug', `async()=>{${BOOT}if(!(await boot()))return 'did not start';
 for(let i=0;i<60&&!window.__fl.visual.player.bones;i++)await wait(200);
 if(!window.__fl.visual.player.bones)return 'character is not the skinned human rig';
 const q=s=>document.querySelector(s);if(!q('.fl-status [data-bar=stamina]'))return 'no stamina bar';if(!q('.fl-map'))return 'no minimap';
 if(!/keys/i.test(q('[data-role=objective]').textContent))return 'objective: '+q('[data-role=objective]').textContent;
 if(!document.body.classList.contains('first-light-active'))return 'host class missing';return true}`);

t('first light: pause menu tabs, settings list, gear wheel and a clean exit', '/core.html?start=first-light&fldebug', `async()=>{${BOOT}if(!(await boot()))return 'did not start';
 key('Escape');await wait(300);const tabs=()=>[...document.querySelectorAll('.fl-tabs button')].map(b=>b.textContent.trim());
 if(tabs().join()!=='Map,Brief,Gear,Settings')return 'tabs '+tabs();
 const rows=document.querySelectorAll('.fl-row').length;if(rows<10)return 'settings rows '+rows;
 const sel=()=>document.querySelector('.fl-row.sel span').textContent;const first=sel();key('ArrowDown');await wait(100);if(sel()===first)return 'arrow down did not move the selection';
 key('e');await wait(200);if(document.querySelector('.fl-tabs .on')?.textContent!=='Map')return 'E from Settings should wrap to Map';if(!document.querySelector('.fl-large-map'))return 'no large map';
 key('e');await wait(200);if(document.querySelector('.fl-tabs .on')?.textContent!=='Brief')return 'E did not go to Brief';key('m');await wait(300);if(document.querySelector('.fl-tabs .on')?.textContent!=='Map')return 'M did not jump to the map tab';
 key('Escape');await wait(300);if(window.__fl.modal)return 'Escape did not close the menu';
 key('q');await wait(300);if(document.querySelectorAll('.fl-slot').length!==8)return 'gear wheel has '+document.querySelectorAll('.fl-slot').length+' slots';
 key('2');await wait(200);if(window.__fl.session.equipment!=='flashlight')return 'slot 2 did not equip the flashlight, got '+window.__fl.session.equipment;
 if(window.__fl.modal)return 'choosing a slot should close the wheel';
 const before=window.__fl.stamina;if(!(before>0))return 'no stamina';
 window.__fl.action('exit');await wait(400);if(document.body.classList.contains('first-light-active'))return 'host class stayed after exit';if(window.__fl&&!window.__fl.closed)return 'game not disposed';return true}`);
