/* Find anything: one box that searches every effect, look and action. Opens with Cmd/Ctrl+K or "/".
   items() returns [{name, kind, hint?, run(alt)}]; alt is true when Shift is held (effects use it to add a layer instead of replacing). */
const CSS=`.kp{position:fixed;inset:0;z-index:60;background:#05050acc;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);display:flex;justify-content:center;align-items:flex-start;padding:max(10vh,calc(env(safe-area-inset-top,0px) + 12px)) 12px 12px}
.kp>div{width:100%;max-width:520px;max-height:min(70dvh,560px);display:flex;flex-direction:column;background:var(--panel,#111110);border:1px solid var(--line,#2a2927);border-radius:var(--rad,3px);overflow:hidden;animation:kpin .16s cubic-bezier(.2,.8,.2,1)}
@keyframes kpin{from{transform:translateY(-8px) scale(.98);opacity:0}}
.kp input{flex:none;height:52px;padding:0 16px;border:0;border-bottom:1px solid var(--line,#2a2927);background:none;color:var(--ink,#f2efe8);font:500 16px var(--mono,ui-monospace,monospace);outline:0}
.kp ul{list-style:none;margin:0;padding:4px;overflow:auto;overscroll-behavior:contain}
.kp li{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:0 12px;border-radius:var(--rad,3px);cursor:pointer}
.kp li[aria-selected=true]{background:var(--accent,#ff5a1f);color:var(--on-accent,#0a0a0a)}
.kp li b{font-weight:700}.kp li span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kp li i{flex:none;font-style:normal;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;opacity:.65}
.kp p{flex:none;margin:0;padding:8px 16px;border-top:1px solid var(--line,#2a2927);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute,#8d8a82)}
.kp .none{padding:18px 16px;color:var(--mute,#8d8a82)}
@media (prefers-reduced-motion:reduce){.kp>div{animation:none}}`;
/* subsequence match. Higher is better; word starts and unbroken runs score more. Returns null when q is not in s. */
export function fuzzy(q,s){
  const a=q.toLowerCase(),b=s.toLowerCase();if(!a)return{score:0,hit:[]};
  let i=0,score=0,run=0;const hit=[];
  for(let j=0;j<b.length&&i<a.length;j++){
    if(b[j]===a[i]){const start=j===0||/[\s/·:()-]/.test(b[j-1]);run++;score+=1+run*2+(start?6:0)+(j===i?2:0);hit.push(j);i++;}else run=0;
  }
  return i<a.length?null:{score:score-b.length*.02,hit};
}
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export function createPalette({items,recent=()=>[],hint='Enter to use · Shift+Enter to add as a layer · Esc to close'}){
  let box=null,list=[],sel=0,back=null;
  const close=()=>{if(!box)return;box.remove();box=null;if(back&&back.focus)try{back.focus();}catch(e){}};
  const open=()=>{
    if(box){close();return;}
    if(!document.getElementById('kpcss')){const st=document.createElement('style');st.id='kpcss';st.textContent=CSS;document.head.appendChild(st);}
    back=document.activeElement;const all=items();
    box=document.createElement('div');box.className='kp';box.setAttribute('role','dialog');box.setAttribute('aria-label','Find anything');
    box.innerHTML=`<div><input type="text" placeholder="Find an effect, look or action" aria-label="Find" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="kpl"><ul id="kpl" role="listbox"></ul><p>${hint}</p></div>`;
    const inp=box.querySelector('input'),ul=box.querySelector('ul');
    const draw=()=>{
      const q=inp.value.trim();
      if(q){list=[];for(const it of all){const m=fuzzy(q,it.name);if(m)list.push({it,s:m.score+10,hit:m.hit});else if((it.kind+' '+(it.hint||'')).toLowerCase().includes(q.toLowerCase()))list.push({it,s:0,hit:[]});}
        list.sort((x,y)=>y.s-x.s);list=list.slice(0,40);}
      else{const rc=recent(),r=rc.map(id=>all.find(x=>x.id===id)).filter(Boolean);list=[...r.map(it=>({it,hit:[],rec:1})),...all.filter(x=>x.kind==='Action'||x.kind==='Look').slice(0,40-r.length).map(it=>({it,hit:[]}))];}
      sel=Math.min(sel,Math.max(0,list.length-1));
      ul.innerHTML=list.length?list.map((r,i)=>{const n=r.it.name,h=new Set(r.hit);let s='';for(let c=0;c<n.length;c++)s+=h.has(c)?'<b>'+esc(n[c])+'</b>':esc(n[c]);
        return `<li role="option" id="kpo${i}" data-i="${i}" aria-selected="${i===sel}"><span>${s}</span><i>${esc(r.rec?'Recent':r.it.kind)}</i></li>`;}).join(''):'<li class="none">Nothing matches. Try fewer letters.</li>';
      inp.setAttribute('aria-activedescendant','kpo'+sel);
      const cur=ul.querySelector('[aria-selected=true]');if(cur)cur.scrollIntoView({block:'nearest'});
    };
    const go=alt=>{const r=list[sel];if(!r)return;close();try{r.it.run(!!alt);}catch(e){console.error(e);}};
    inp.addEventListener('input',()=>{sel=0;draw();});
    inp.addEventListener('keydown',e=>{
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=list.length||1;sel=(sel+(e.key==='ArrowDown'?1:-1)+n)%n;draw();}
      else if(e.key==='Enter'){e.preventDefault();go(e.shiftKey);}
      else if(e.key==='Escape'){e.preventDefault();close();}
      else if(e.key==='Tab'){e.preventDefault();}
      e.stopPropagation();
    });
    ul.addEventListener('click',e=>{const li=e.target.closest('li[data-i]');if(!li)return;sel=+li.dataset.i;go(e.shiftKey);});
    box.addEventListener('pointerdown',e=>{if(e.target===box)close();});
    document.body.appendChild(box);draw();inp.focus();
  };
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase(),typing=/INPUT|TEXTAREA|SELECT/.test((e.target||{}).tagName||'')||(e.target&&e.target.isContentEditable);
    if((e.metaKey||e.ctrlKey)&&!e.altKey&&k==='k'){e.preventDefault();open();}
    else if(k==='/'&&!e.shiftKey&&!e.metaKey&&!e.ctrlKey&&!typing&&!box){e.preventDefault();open();}
  });
  return{open,close,get isOpen(){return!!box;}};
}
