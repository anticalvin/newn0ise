/* FIRST LIGHT menus: tabbed pause menu (Map, Brief, Gear, Settings) and the gear wheel.
   Layout language: bold condensed caps, a tab strip with key chips, a list whose selected row turns solid white, value steppers on the right. */
import {VEHICLE_PROFILES,distance} from './simulation.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const TABS=[['map','Map'],['brief','Brief'],['gear','Gear'],['pause','Settings']];
const ICON={
 hands:'<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V10m0-.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4.5A6 6 0 0 1 13 21h-1a6 6 0 0 1-5-2.7L4.6 14.5a1.4 1.4 0 0 1 2.3-1.6L7 13"/>',
 flashlight:'<path d="M8 3h8l-1 5H9zM9 8h6v3l-1 1v8a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-8l-1-1z"/>',
 camera:'<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>',
 map:'<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13M15 7v13"/>'
};
export const GEAR=[['hands','Hands','Nothing equipped'],['flashlight','Flashlight','Lights what is ahead'],['camera','Camera','Takes a photo'],['map','Map','Opens the map']];
const icon=(id,size=34)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICON[id]||''}</svg>`;
const key=k=>`<kbd>${esc(k)}</kbd>`;

/* the Settings list: one row per setting, each with its own label, value and how left, right and activate behave */
export function settingsRows(g){
 const s=g.session,weather=()=>s.rain>.5?'Rain':s.rain>.1?'Overcast':'Clear';
 const clock=()=>String(Math.floor(s.time)).padStart(2,'0')+':'+String(Math.floor((s.time%1)*60)).padStart(2,'0');
 const rows=[
  {label:'Camera',value:()=>g.firstPerson?'First person':'Third person',step:()=>g.action('camera')},
  {label:'Time of day',value:clock,left:()=>{s.time=(s.time+23)%24;},right:()=>{s.time=(s.time+1)%24;}},
  {label:'Weather',value:weather,left:()=>{s.rain=s.rain>.5?.35:s.rain>.1?0:.85;},right:()=>{s.rain=s.rain>.5?0:s.rain>.1?.85:.35;}},
  {label:'Radio',value:()=>s.radio?'Breakwater FM':'Off',toggle:true,step:()=>g.action('radio')},
  {label:'Volume',value:()=>Math.round(g.audio.volume*100)+'%',left:()=>g.audio.setVolume(Math.max(0,Math.round((g.audio.volume-.1)*10)/10)),right:()=>g.audio.setVolume(Math.min(1,Math.round((g.audio.volume+.1)*10)/10))},
  {label:'Sound',value:()=>g.audio.enabled?'On':'Muted',toggle:true,step:()=>g.action('mute')},
  {label:'Graphics',value:()=>g.highQuality?'High':'Balanced',step:()=>g.action('quality')},
  {label:'Diagnostics',value:()=>g.$('.fl-debug').hidden?'Off':'On',toggle:true,step:()=>g.action('debug')},
  {label:'Save game',value:()=>'',act:()=>g.action('save')},
  {label:'Load save',value:()=>g.hasSave()?'':'No save yet',off:()=>!g.hasSave(),act:()=>g.action('load')},
  {label:'Restart',value:()=>'',act:()=>g.action('restart')}
 ];
 if(g.onExit)rows.push({label:'Return to Core',value:()=>'',act:()=>g.action('exit')});
 return rows;
}
const rowHtml=(r,i,sel)=>{
 const v=r.value(),has=!!(r.left||r.right||r.step);
 const value=r.toggle?`<span class="fl-val"><span class="fl-switch" data-on="${/^(on|breakwater fm)$/i.test(v)}"><i></i></span>${esc(v)}</span>`:`<span class="fl-val">${esc(v)}${has&&!r.toggle?'<b data-adj="-1" aria-label="Previous">‹</b><b data-adj="1" aria-label="Next">›</b>':''}</span>`;
 return `<div class="fl-row${sel?' sel':''}${r.off&&r.off()?' off':''}" data-row="${i}" role="button" tabindex="-1"><span>${esc(r.label)}</span>${value}</div>`;
};

function tabsHtml(active){
 return `<nav class="fl-tabs" aria-label="Pause menu">${key('Q')}${TABS.map(([id,label])=>`<button type="button" data-act="${id==='pause'?'tab:pause':'tab:'+id}" class="${id===active?'on':''}" aria-current="${id===active}">${label}</button>`).join('')}${key('E')}</nav>`;
}
const hints=list=>`<footer class="fl-hints">${list.map(([k,t])=>`<span>${t}${key(k)}</span>`).join('')}</footer>`;

function mapInfo(g){
 const s=g.session,state=s.mission.def.states[s.mission.state],t=s.objects[state?.target]||s.vehicles.find(v=>v.id===state?.target);
 if(!t)return {title:'Free roam',text:'The delivery is done. The coast is yours.',a:'',b:''};
 const name=t.label||(t.profile&&VEHICLE_PROFILES[t.profile]?.name)||'Destination';
 return {title:name,text:s.mission.objective,a:s.mission.state==='deliver'?'Delivery':'Errand',b:Math.round(distance(s.current(),t))+' m'};
}

export function renderMenu(g,tab){
 const m=g.modalEl;
 g.menu=g.menu||{row:0};
 if(tab==='map'){
  const info=mapInfo(g);
  m.innerHTML=`<div class="fl-screen"><header><button type="button" class="fl-close" data-act="resume" aria-label="Resume game">✕</button><h2>Map</h2>${tabsHtml(tab)}</header><div class="fl-body fl-mapbody"><canvas class="fl-large-map" width="1200" height="760"></canvas><aside class="fl-card"><b>${esc(info.title)}</b><p>${esc(info.text)}</p><div><span>${esc(info.a)}</span><span>${esc(info.b)}</span></div></aside></div>${hints([['Q','Previous'],['E','Next'],['Esc','Resume']])}</div>`;
  g.drawLargeMap();
 }else if(tab==='brief'){
  const st=g.session.mission.def.states,cur=g.session.mission.state,ids=Object.keys(st),at=ids.indexOf(cur);
  m.innerHTML=`<div class="fl-screen"><header><button type="button" class="fl-close" data-act="resume" aria-label="Resume game">✕</button><h2>Brief</h2>${tabsHtml(tab)}</header><div class="fl-body"><div class="fl-list fl-steps">${ids.map((id,i)=>`<div class="fl-row${i===at?' sel':''}${i<at?' done':''}"><span>${esc(st[id].objective)}</span><span class="fl-val">${i<at?'Done':i===at?(st[id].complete?'Complete':'Now'):''}</span></div>`).join('')}</div></div>${hints([['Q','Previous'],['E','Next'],['Esc','Resume']])}</div>`;
 }else if(tab==='gear'){
  const items=g.session.inventory;
  m.innerHTML=`<div class="fl-screen"><header><button type="button" class="fl-close" data-act="resume" aria-label="Resume game">✕</button><h2>Gear</h2>${tabsHtml(tab)}</header><div class="fl-body"><div class="fl-tiles">${GEAR.map(([id,name,desc])=>`<button type="button" class="fl-tile${g.session.equipment===id?' on':''}" data-act="equip:${id}">${icon(id,38)}<b>${name}</b><small>${desc}</small></button>`).join('')}</div><p class="fl-note">${items.length?'Carrying: '+items.map(i=>esc(String(i).replace(/_/g,' '))).join(', '):'No mission items yet.'}</p></div>${hints([['Q','Previous'],['E','Next'],['Esc','Resume']])}</div>`;
 }else{
  const rows=settingsRows(g);g.menu.row=Math.min(g.menu.row,rows.length-1);
  m.innerHTML=`<div class="fl-screen"><header><button type="button" class="fl-close" data-act="resume" aria-label="Resume game">✕</button><h2>Settings</h2>${tabsHtml('pause')}</header><div class="fl-body"><div class="fl-list">${rows.map((r,i)=>rowHtml(r,i,i===g.menu.row)).join('')}</div></div><footer class="fl-hints"><span class="fl-count">${g.menu.row+1} <i>/ ${rows.length}</i></span><span>Change${key('←')}${key('→')}</span><span>Select${key('Enter')}</span><span>Resume${key('Esc')}</span></footer></div>`;
 }
}

/* keep the list in place and only repaint it, so a held key does not rebuild the whole screen */
export function repaintSettings(g){const rows=settingsRows(g),list=g.modalEl.querySelector('.fl-list');if(!list)return;list.innerHTML=rows.map((r,i)=>rowHtml(r,i,i===g.menu.row)).join('');const c=g.modalEl.querySelector('.fl-count');if(c)c.innerHTML=`${g.menu.row+1} <i>/ ${rows.length}</i>`;list.querySelector('.sel')?.scrollIntoView({block:'nearest'});}

export function menuClick(g,ev){
 const row=ev.target.closest('[data-row]');if(!row||g.modal!=='pause')return false;
 const rows=settingsRows(g),i=Number(row.dataset.row),r=rows[i];g.menu.row=i;
 const adj=ev.target.closest('[data-adj]');
 if(r&&!(r.off&&r.off())){
  if(adj&&(r.left||r.right)){(Number(adj.dataset.adj)<0?r.left:r.right)?.();}
  else (r.act||r.step||r.right)?.();
 }
 if(g.modal==='pause')repaintSettings(g);
 return true;
}

export function menuKey(g,ev){
 const t=g.modal;if(!['map','brief','gear','pause'].includes(t))return false;
 const k=ev.key.toLowerCase(),order=TABS.map(x=>x[0]),at=order.indexOf(t);
 if(k==='q'||k==='e'){g.open(order[(at+(k==='e'?1:order.length-1))%order.length]);return true;}
 if(t!=='pause')return false;
 const rows=settingsRows(g),r=rows[g.menu.row];
 if(['arrowdown','s'].includes(k)){g.menu.row=(g.menu.row+1)%rows.length;repaintSettings(g);return true;}
 if(['arrowup','w'].includes(k)){g.menu.row=(g.menu.row+rows.length-1)%rows.length;repaintSettings(g);return true;}
 if(r&&!(r.off&&r.off())){
  if(['arrowleft','a'].includes(k)){(r.left||r.step)?.();repaintSettings(g);return true;}
  if(['arrowright','d'].includes(k)){(r.right||r.step)?.();repaintSettings(g);return true;}
  if(['enter','f',' '].includes(k)){(r.act||r.step||r.right)?.();if(g.modal==='pause')repaintSettings(g);return true;}
 }
 return ['enter','f',' ','arrowleft','arrowright','a','d'].includes(k);
}

/* the gear wheel: tiles around a centre label, hover or press 1 to 4 to choose */
export function renderWheel(g,tab=g.wheelTab||'tools'){
 g.wheelTab=tab;const items=g.session.inventory;
 const slots=tab==='tools'?GEAR.map(([id,name,desc])=>({id,name,desc})):items.map(i=>({id:'item:'+i,name:String(i).replace(/_/g,' '),desc:'Mission item'}));
 const N=8,R=Math.min(190,Math.min(innerWidth,innerHeight)*.3),W=Math.min(124,R*.66),H=Math.round(W*.66);
 const tiles=Array.from({length:N},(_,i)=>{
  const a=i/N*Math.PI*2,x=Math.sin(a)*R,y=-Math.cos(a)*R,s=slots[i];
  const on=s&&tab==='tools'&&g.session.equipment===s.id;
  return `<button type="button" class="fl-slot${on?' on':''}${s?'':' empty'}" style="left:calc(50% + ${x.toFixed(1)}px - ${W/2}px);top:calc(50% + ${y.toFixed(1)}px - ${H/2}px);width:${W}px;height:${H}px" ${s&&tab==='tools'?`data-act="equip:${s.id}"`:''} ${s?`data-name="${esc(s.name)}" data-desc="${esc(s.desc)}"`:'disabled'}>${s?(tab==='tools'?icon(s.id,Math.round(H*.5))+`<small>${i+1}</small>`:`<b>${esc(s.name)}</b>`):''}</button>`;
 }).join('');
 const cur=tab==='tools'?GEAR.find(x=>x[0]===g.session.equipment):null;
 g.modalEl.innerHTML=`<div class="fl-wheel"><nav class="fl-tabs fl-wheeltabs">${key('E')}<button type="button" data-act="wheel:tools" class="${tab==='tools'?'on':''}">Tools</button><button type="button" data-act="wheel:items" class="${tab==='items'?'on':''}">Items</button></nav><div class="fl-ring">${tiles}<div class="fl-centre"><b data-role="wname">${esc(cur?cur[1]:tab==='items'?(items.length?'Items':'No items'):'Gear')}</b><span data-role="wdesc">${esc(cur?cur[2]:'')}</span></div></div>${hints([['1–4','Choose'],['E','Tools / items'],['Q','Close']])}</div>`;
 const ring=g.modalEl.querySelector('.fl-ring'),nm=g.modalEl.querySelector('[data-role="wname"]'),ds=g.modalEl.querySelector('[data-role="wdesc"]');
 ring.addEventListener('pointerover',e=>{const b=e.target.closest('.fl-slot[data-name]');if(b){nm.textContent=b.dataset.name;ds.textContent=b.dataset.desc;}});
}
