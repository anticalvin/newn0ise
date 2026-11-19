'use strict';

/* Controller layer for Studio (DualSense, Xbox and other standard pads). Plain Gamepad API, no dependencies.
   It drives the app the way a mouse and keyboard would: pointer events on the stage, clicks on buttons, and the
   existing keyboard shortcuts. app.js is untouched.

   Left stick   cursor (L3 = precise)          Right stick  pan the view
   A / cross    press, draw, drag, click       R2           pen pressure: pull harder for a thicker stroke
   B / circle   back, close, cancel            X / square   undo           Y / triangle  tap: redo, hold: tool wheel
   L1 / R1      previous, next tool            D-pad L R    previous, next view (over a slider or menu: change it)
   D-pad U D    zoom                           L2           shift (multi-select, 15° snap); L2 + D-pad nudges
   R3           fit to screen                  Options      menu     Create / View   help */
(() => {
  const ID = 777, PAN_ID = 778, DEAD = .16;
  const $ = id => document.getElementById(id);
  const stage = $('stagebody');
  if (!stage || !navigator.getGamepads) return;

  const TOOLS = [['select','Select','↖'],['lasso','Lasso','◌'],['brush','Brush','✎'],['eraser','Eraser','⌫'],['pen','Pen','♢'],['text','Text','T'],
    ['shape','Shape','□'],['line','Line','／'],['gradient','Gradient','◐'],['picker','Eyedropper','◉'],['crop','Crop','⌗']];
  const PIE = [...TOOLS,['effect','Add effect','≋']];   // the wheel also reaches the effect palette
  const VIEWS = ['canvas','split','graph'];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const cfg = {speed:1,rumble:true,...JSON.parse(localStorage.getItem('n0.studiopad') || '{}')};
  const saveCfg = () => { try { localStorage.setItem('n0.studiopad',JSON.stringify(cfg)); } catch {} };

  const st = {pad:null,x:innerWidth/2,y:innerHeight/2,on:false,idle:0,prev:[],down:null,pan:null,sony:false,
    pie:null,yAt:0,last:0,tool:'select',lastClick:{t:0,x:0,y:0},heldKeys:new Set(),repeat:{},hot:null};
  window.__studioPad = st;

  /* ---------- styling ---------- */
  const css = document.createElement('style');
  css.textContent = `
#padcur,#padbar,#padpie,#padtoast,#padhelp{inset:auto;margin:0;overflow:visible;color:#e9e6df}
#padhelp{overflow:auto}
#padcur{position:fixed;left:0;top:0;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1.5px #000a,0 3px 10px #0008;z-index:100000;pointer-events:none;display:none;transition:transform .1s,background .1s,width .1s,height .1s,margin .1s}
#padcur::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px #000a}
#padcur[data-down=true]{transform:scale(.62);background:#e8e1d5aa}
#padcur[data-slow=true]{width:18px;height:18px;margin:-9px 0 0 -9px}
#padcur i{position:absolute;left:34px;top:-4px;font:650 11px system-ui;font-style:normal;color:#fff;background:#000b;padding:3px 7px;border-radius:9px;white-space:nowrap;opacity:.9}
.pad-hot{outline:2px solid #fff !important;outline-offset:2px}
#padbar{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);transform:translateX(-50%);z-index:99999;display:none;gap:14px;align-items:center;padding:8px 16px;border-radius:24px;background:#1d1e20e6;border:1px solid #ffffff2e;box-shadow:inset 0 1px 0 #ffffff33,0 8px 30px #000a;-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);color:#e9e6df;font:600 12px system-ui;pointer-events:none;white-space:nowrap;max-width:calc(100vw - 20px);overflow:hidden}
#padbar span{display:inline-flex;gap:6px;align-items:center}
#padbar b{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:#ffffff26;border:1px solid #ffffff40;font-size:11px;font-weight:700}
#padpie{position:fixed;left:50%;top:50%;width:0;height:0;z-index:100002;display:none}
#padpie .pi{position:absolute;width:88px;height:46px;margin:-23px 0 0 -44px;display:grid;place-items:center;border-radius:20px;background:#1d1e20ee;border:1px solid #ffffff33;color:#e9e6df;font:650 12px/1.15 system-ui;text-align:center;transition:transform .08s,background .08s}
#padpie .pi em{display:block;font:400 16px system-ui;font-style:normal}
#padpie .pi.on{background:#e8e1d5;color:#161615;transform:scale(1.16);border-color:#fff}
#padpie .pd{position:absolute;width:12px;height:12px;margin:-6px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #000a}
#padtoast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 62px);transform:translate(-50%,-6px);opacity:0;transition:opacity .18s,transform .18s;z-index:100002;padding:9px 16px;border-radius:18px;background:#1d1e20ee;border:1px solid #ffffff33;color:#f1eee8;font:650 13px system-ui;pointer-events:none}
#padtoast.on{opacity:1;transform:translate(-50%,0)}
#padhelp{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100001;width:min(420px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:18px;border-radius:22px;background:#1d1e20f2;border:1px solid #ffffff33;box-shadow:inset 0 1px 0 #ffffff33,0 20px 60px #000c;-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);color:#e9e6df;font:500 12.5px/1.5 system-ui;display:none}
#padhelp h4{margin:0 0 10px;font:650 16px system-ui}
#padhelp .r{display:flex;gap:10px;margin:3px 0}#padhelp .r b{flex:none;min-width:88px;color:#e8e1d5}
#padhelp label{display:flex;gap:10px;align-items:center;min-height:44px}
#padhelp input[type=range]{flex:1;min-height:36px}
@media (prefers-reduced-motion:reduce){#padcur,#padpie .pi,#padtoast{transition:none}}`;
  document.head.append(css);
  const mk = (tag,id,attrs = {}) => { const e = document.createElement(tag); e.id = id; Object.assign(e,attrs); document.body.append(e); return e; };
  const cur = mk('div','padcur'); cur.setAttribute('aria-hidden','true'); cur.innerHTML = '<i></i>';
  const bar = mk('div','padbar'); bar.setAttribute('aria-hidden','true');
  const pie = mk('div','padpie'); pie.setAttribute('aria-hidden','true');
  const toastEl = mk('div','padtoast'); toastEl.setAttribute('role','status');
  const help = mk('div','padhelp'); help.setAttribute('role','dialog'); help.setAttribute('aria-label','Controller help');

  /* Modal dialogs live in the browser's top layer, which z-index cannot beat. Popovers share that layer, and the last one shown is on top. */
  const layers = [cur,bar,pie,toastEl,help];
  const raise = () => { for (const e of layers) { try { if (e.matches(':popover-open')) e.hidePopover(); e.showPopover(); } catch {} } };
  for (const e of layers) e.popover = 'manual';
  let dialogs = -1;
  const watchDialogs = () => { const n = document.querySelectorAll('dialog[open]').length; if (n !== dialogs) { dialogs = n; raise(); } };
  raise();

  let toastTimer = 0;
  const toast = text => { toastEl.textContent = text; toastEl.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'),1500); };

  /* ---------- helpers ---------- */
  const G = () => st.sony ? {a:'✕',b:'○',x:'□',y:'△',sel:'Create',opt:'Options',l1:'L1',r1:'R1',l2:'L2',r2:'R2'} : {a:'A',b:'B',x:'X',y:'Y',sel:'View',opt:'Menu',l1:'LB',r1:'RB',l2:'LT',r2:'RT'};
  const buzz = (ms,strong = .15,weak = .3) => {
    if (!cfg.rumble || !st.pad) return;
    try {
      const act = st.pad.vibrationActuator;
      if (act?.playEffect) act.playEffect('dual-rumble',{startDelay:0,duration:ms,weakMagnitude:weak,strongMagnitude:strong});
    } catch {}
  };
  const axis = (p,i) => { const v = p.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : Math.sign(v)*(Math.abs(v)-DEAD)/(1-DEAD); };
  const pressed = (p,i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > .6));
  const value = (p,i) => p.buttons[i]?.value || 0;
  const mode = () => stage.dataset.tool || 'select';
  const modalOpen = () => $('launcher')?.open || $('modal')?.open;
  const key = (k,extra = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown',{key:k,code:k.length === 1 ? 'Key'+k.toUpperCase() : k,bubbles:true,cancelable:true,...extra}));
  const keyUp = (k,extra = {}) => document.body.dispatchEvent(new KeyboardEvent('keyup',{key:k,bubbles:true,cancelable:true,...extra}));
  const click = el => { if (el.click && !(el instanceof SVGElement)) el.click(); else el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); };
  const pointer = (el,type,extra = {}) => el.dispatchEvent(new PointerEvent(type,{pointerId:ID,pointerType:'mouse',isPrimary:true,clientX:st.x,clientY:st.y,button:0,
    buttons:type === 'pointerup' ? 0 : 1,pressure:type === 'pointerup' ? 0 : .5,bubbles:true,cancelable:true,composed:true,shiftKey:st.shift,...extra}));

  /* the page's own setPointerCapture would throw for a pointer the browser has never seen */
  for (const fn of ['setPointerCapture','releasePointerCapture']) {
    const original = Element.prototype[fn];
    Element.prototype[fn] = function (id) { try { return original.call(this,id); } catch (e) { if (id !== ID && id !== PAN_ID) throw e; } };
  }

  const hit = () => {
    cur.style.display = 'none';
    const stack = document.elementsFromPoint(st.x,st.y);
    cur.style.display = 'block';
    const top = stack[0] || null, range = stack.find(e => e.matches?.('input[type=range]'));
    if (range && top && (top === range || top.contains(range) || range.contains(top))) return range;
    return top?.closest?.('label')?.querySelector('input[type=range]') || top;   // a slider's label counts as the slider   // thin sliders sit under their label
  };
  const interactive = t => t?.closest?.('button,a,input,select,textarea,summary,[role=button],[role=tab],label,.layer,.asset');
  const onStage = t => !!t && stage.contains(t) && !t.closest('button,#textEdit');
  function setHot(t) {
    const h = interactive(t);
    if (st.hot && st.hot !== h) st.hot.classList.remove('pad-hot');
    if (h && !onStage(h)) { h.classList.add('pad-hot'); st.hot = h; } else st.hot = null;
  }

  /* ---------- press / release ---------- */
  function press() {
    const t = hit(); if (!t) return;
    buzz(25,.1,.25);
    const el = interactive(t);
    if (el?.matches('input[type=range]')) { st.down = {t:el,slider:true}; slide(el); return; }
    if (el?.matches('select')) { cycleSelect(el,1); st.down = null; return; }
    if (el?.matches('input:not([type=range]):not([type=checkbox]),textarea')) { el.focus(); st.down = null; return; }
    const pen = onStage(t) && (mode() === 'brush' || mode() === 'eraser');
    st.down = {t,sx:st.x,sy:st.y,moved:false,pen,cap:t.ownerSVGElement || null};   // cap: where events go if the target is redrawn mid-drag
    const extra = pen ? {pointerType:'pen',pressure:Math.max(.2,value(st.pad,7) || .5)} : {};
    pointer(t,'pointerdown',extra);
    cur.dataset.down = 'true';
  }
  function release() {
    const d = st.down; cur.dataset.down = 'false';
    if (!d) return;
    st.down = null;
    if (d.slider) return;
    const extra = d.pen ? {pointerType:'pen'} : {};
    pointer(d.t.isConnected ? d.t : d.cap?.isConnected ? d.cap : document.body,'pointerup',extra);
    const near = Math.hypot(st.x-d.sx,st.y-d.sy) < 8;
    if (near && !onStage(d.t)) {
      const el = interactive(d.t) || d.t;
      if (!d.t.closest('[data-resize]')) click(el);
    }
    if (near && onStage(d.t)) {
      const n = performance.now(), c = st.lastClick;
      if (n-c.t < 380 && Math.hypot(st.x-c.x,st.y-c.y) < 14) { d.t.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:st.x,clientY:st.y,view:window})); st.lastClick = {t:0,x:0,y:0}; }
      else st.lastClick = {t:n,x:st.x,y:st.y};
    }
  }
  function slide(inp) {
    const r = inp.getBoundingClientRect(), f = clamp((st.x-r.left)/Math.max(1,r.width),0,1);
    const mn = +inp.min || 0, mx = +inp.max || 100, step = +inp.step || 1;
    const v = clamp(Math.round((mn+(mx-mn)*f)/step)*step,mn,mx);
    if (+inp.value !== v) { inp.value = v; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); buzz(8,.03,.12); }
  }
  function cycleSelect(sel,dir) {
    const n = sel.options.length; if (!n) return;
    sel.selectedIndex = (sel.selectedIndex+dir+n) % n;
    sel.dispatchEvent(new Event('input',{bubbles:true})); sel.dispatchEvent(new Event('change',{bubbles:true}));
    toast(sel.options[sel.selectedIndex].text); buzz(15,.06,.2);
  }

  /* ---------- tools, views, zoom, pan ---------- */
  function setTool(id) {
    if (id === 'effect') { const add = $('graphAdd'); if (add && !add.disabled) { click(add); toast('Add effect'); buzz(30,.12,.25); } else toast('Select a layer first'); return; }
    const b = document.querySelector(`[data-tool="${id}"]`);
    if (b) click(b); else key({select:'v',lasso:'l',brush:'b',eraser:'e',pen:'p',text:'t',shape:'r',line:'u',gradient:'g',picker:'i',crop:'c'}[id] || 'v');
    const t = TOOLS.find(x => x[0] === id); if (t) toast(t[2]+'  '+t[1]);
    buzz(30,.12,.25);
  }
  const stepTool = dir => { const i = Math.max(0,TOOLS.findIndex(t => t[0] === mode())); setTool(TOOLS[(i+dir+TOOLS.length) % TOOLS.length][0]); };
  function stepView(dir) {
    const cur = VIEWS.find(v => document.querySelector(`[data-view="${v}"]`)?.classList.contains('active')) || 'canvas';
    const next = VIEWS[clamp(VIEWS.indexOf(cur)+dir,0,VIEWS.length-1)];
    if (next === cur) { buzz(20,.2,.05); return; }
    click(document.querySelector(`[data-view="${next}"]`)); toast(next[0].toUpperCase()+next.slice(1)); buzz(30,.1,.3);
  }
  const zoom = f => stage.dispatchEvent(new WheelEvent('wheel',{deltaY:-f*260,clientX:st.x,clientY:st.y,bubbles:true,cancelable:true}));
  function panBy(dx,dy) {
    if (st.down) return;
    if (!st.pan) {
      const r = stage.getBoundingClientRect();
      st.pan = {x:r.left+r.width/2,y:r.top+r.height/2,t:stage};
      st.pan.t.dispatchEvent(new PointerEvent('pointerdown',{pointerId:PAN_ID,pointerType:'mouse',isPrimary:true,clientX:st.pan.x,clientY:st.pan.y,button:1,buttons:4,bubbles:true,cancelable:true}));
    }
    st.pan.x -= dx; st.pan.y -= dy;
    st.pan.t.dispatchEvent(new PointerEvent('pointermove',{pointerId:PAN_ID,pointerType:'mouse',isPrimary:true,clientX:st.pan.x,clientY:st.pan.y,button:-1,buttons:4,bubbles:true,cancelable:true}));
  }
  function panEnd() {
    if (!st.pan) return;
    st.pan.t.dispatchEvent(new PointerEvent('pointerup',{pointerId:PAN_ID,pointerType:'mouse',isPrimary:true,clientX:st.pan.x,clientY:st.pan.y,button:1,buttons:0,bubbles:true,cancelable:true}));
    st.pan = null;
  }
  function back() {
    if (help.style.display === 'block') { showHelp(false); return; }
    const ctx = $('studioContext'); if (ctx && !ctx.hidden) { key('Escape'); return; }
    if ($('launcher')?.open) { click($('launchClose')); return; }
    if ($('modal')?.open) { const c = $('modal').querySelector('[data-close],button[value=cancel],.close,button'); key('Escape'); if (c && $('modal').open) c.click(); return; }
    key('Escape');
  }

  /* ---------- tool wheel ---------- */
  function openPie() {
    const n = PIE.length, R = 182;
    pie.innerHTML = PIE.map((t,i) => {
      const a = i/n*Math.PI*2-Math.PI/2;
      return `<div class="pi" data-i="${i}" style="transform:translate(${Math.cos(a)*R}px,${Math.sin(a)*R}px)"><span><em>${t[2]}</em>${t[1]}</span></div>`;
    }).join('')+'<div class="pd"></div>';
    pie.style.display = 'block'; st.pie = {i:Math.max(0,PIE.findIndex(t => t[0] === mode()))}; pie.querySelectorAll('.pi').forEach(e => e.classList.toggle('on',+e.dataset.i === st.pie.i)); buzz(25,.1,.2);
  }
  function pieAim(x,y) {
    const m = Math.hypot(x,y), dot = pie.querySelector('.pd');
    dot.style.transform = `translate(${x*90}px,${y*90}px)`;
    if (m < .5) return;   // a stick that springs back to centre must not lose the pick
    const n = PIE.length, a = (Math.atan2(y,x)+Math.PI/2+Math.PI*2) % (Math.PI*2), i = Math.round(a/(Math.PI*2)*n) % n;
    if (i !== st.pie.i) { st.pie.i = i; pie.querySelectorAll('.pi').forEach(e => e.classList.toggle('on',+e.dataset.i === i)); buzz(8,.03,.15); }
  }
  function closePie(apply) {
    const i = st.pie?.i; pie.style.display = 'none'; st.pie = null;
    if (apply && i >= 0) setTool(PIE[i][0]);
  }

  /* ---------- help and hints ---------- */
  function showHelp(v) {
    if (v) {
      const g = G();
      help.innerHTML = '<h4>Controller</h4>'+[
        ['Left stick','Move the cursor'],['L3','Hold the stick down for a slow, precise cursor'],[g.a,'Press, draw, drag, click. Double-tap to edit text'],
        [g.r2,'Pen pressure. With Brush or Eraser, pull harder for a thicker stroke'],[g.b,'Back: close a menu or dialog, cancel, deselect'],[g.x,'Undo'],[g.y,'Tap: redo. Hold: tool wheel'],
        [g.l1+' / '+g.r1,'Previous and next tool'],['D-pad ◀ ▶','Previous and next view. Over a slider or menu: change it'],['D-pad ▲ ▼','Zoom in and out at the cursor'],
        ['Right stick','Pan the view'],[g.l2,'Hold for Shift: multi-select, 15° rotation, proportional resize. With the D-pad: nudge. With '+g.b+': delete the selection'],['Graph','Drag from an output to plug in. Drag off an input to unplug it, or onto another input to replug'],['R3','Fit to screen'],
        [g.opt,'Studio menu'],[g.sel,'This help']].map(([k,v]) => `<div class="r"><b>${k}</b><span>${v}</span></div>`).join('')+
      '<label><span class="r"><b>Cursor speed</b></span><input type="range" id="padspd" min="0.5" max="2" step="0.1" aria-label="Cursor speed"></label>'+
      '<label><input type="checkbox" id="padrum" style="width:22px;height:22px"> Vibration</label>';
      const s = help.querySelector('#padspd'); s.value = cfg.speed; s.oninput = () => { cfg.speed = +s.value; saveCfg(); };
      const r = help.querySelector('#padrum'); r.checked = cfg.rumble; r.onchange = () => { cfg.rumble = r.checked; saveCfg(); buzz(40,.2,.4); };
    }
    help.style.display = v ? 'block' : 'none';
  }
  let barKey = '';
  function hints(t) {
    const g = G(), m = mode(), onS = onStage(t), ctl = interactive(t);
    const a = ctl?.matches('input[type=range]') ? 'Slide' : ctl?.matches('select') ? 'Next option' : ctl ? 'Press' :
      !onS ? 'Select' : ({select:'Select / move',lasso:'Lasso',brush:'Draw',eraser:'Erase',pen:'Place point',text:'Place text',shape:'Draw shape',line:'Draw line',gradient:'Drag gradient',picker:'Pick colour',crop:'Crop'})[m] || 'Press';
    const items = [[g.a,a]];
    if (!ctl && onS && (m === 'brush' || m === 'eraser')) items.push([g.r2,'Pressure']);
    items.push([g.x,'Undo'],[g.y+' hold','Tools'],[g.l1+' '+g.r1,'Tool'],['◀ ▶','View'],['▲ ▼','Zoom'],[g.sel,'Help']);
    const k = items.map(i => i.join()).join('|');
    if (k !== barKey) { barKey = k; bar.innerHTML = items.map(([b,l]) => `<span><b>${b}</b>${l}</span>`).join(''); }
    cur.firstChild.textContent = ctl ? '' : onS ? (TOOLS.find(x => x[0] === m)?.[1] || '') : '';
  }

  /* ---------- the loop ---------- */
  const edge = (p,i) => { const now = pressed(p,i), was = st.prev[i]; st.prev[i] = now; return now && !was; };
  const lift = (p,i) => { const now = pressed(p,i), was = st.prev[i+100]; st.prev[i+100] = now; return !now && was; };
  function repeater(name,active,fire,first = 380,every = 70) {
    const r = st.repeat[name] ||= {t:0,n:0};
    const now = performance.now();
    if (!active) { r.t = 0; r.n = 0; return; }
    if (!r.t) { r.t = now+first; r.n = 0; fire(0); return; }
    if (now >= r.t) { r.t = now+every; fire(++r.n); }
  }
  function wake(p) {
    if (!st.on) {
      st.on = true; st.x = innerWidth/2; st.y = innerHeight/2; st.sony = /054c|dualsense|dualshock|playstation|wireless controller/i.test(p.id);
      cur.style.display = 'block'; bar.style.display = 'flex'; document.documentElement.dataset.pad = 'true';
      toast('Controller ready · '+G().sel+' for help'); buzz(60,.15,.3);
    }
    st.idle = 0;
  }
  function sleep() { st.on = false; cur.style.display = 'none'; bar.style.display = 'none'; delete document.documentElement.dataset.pad; if (st.down) release(); panEnd(); }

  const frame = now => { requestAnimationFrame(frame); step(now); };
  function step(now) {
    const dt = Math.min(.05,(now-(st.last || now))/1000); st.last = now;
    const p = [...navigator.getGamepads()].find(Boolean);
    if (!p) { if (st.on) sleep(); return; }
    st.pad = p;
    const active = p.buttons.some(b => b.pressed) || p.axes.some(a => Math.abs(a) > .3);
    if (active) wake(p);
    if (!st.on) return;
    st.shift = pressed(p,6);
    watchDialogs();

    /* cursor */
    let lx = axis(p,0), ly = axis(p,1);
    const slow = pressed(p,10), mag = Math.hypot(lx,ly);
    if (st.pie) { pieAim(lx,ly); lx = ly = 0; }
    if (mag) {
      const curve = Math.pow(Math.min(1,mag),1.7)/mag;
      const speed = (slow ? 260 : 1100)*cfg.speed*dt;
      st.x = clamp(st.x+lx*curve*speed,0,innerWidth-1); st.y = clamp(st.y+ly*curve*speed,0,innerHeight-1);
      st.idle = 0;
    }
    cur.style.transform = `translate(${st.x}px,${st.y}px)`; cur.style.left = '0'; cur.style.top = '0';
    cur.dataset.slow = slow;
    const t = hit();
    setHot(t);
    if (st.down) {
      if (st.down.slider) slide(st.down.t);
      else {
        if (Math.hypot(st.x-st.down.sx,st.y-st.down.sy) > 4) st.down.moved = true;
        const extra = st.down.pen ? {pointerType:'pen',pressure:Math.max(.12,value(p,7) || .5)} : {};
        if (mag) pointer(st.down.t.isConnected ? st.down.t : st.down.cap?.isConnected ? st.down.cap : document.body,'pointermove',extra);
        else if (st.down.pen && value(p,7)) pointer(st.down.t,'pointermove',extra);
      }
    }
    hints(t);

    if (help.style.display === 'block') {
      if (edge(p,1)) showHelp(false);
      if (edge(p,8)) showHelp(false);
      return;
    }

    /* buttons */
    if (edge(p,0)) press();
    if (lift(p,0)) release();
    if (edge(p,7) && !st.down && onStage(t) && (mode() === 'brush' || mode() === 'eraser')) press();   // R2 draws with analog pressure
    if (lift(p,7) && st.down?.pen) release();
    if (edge(p,1)) {
      if (st.pie) { closePie(false); st.yHeld = false; toast('Cancelled'); }
      else if (st.shift) { key('Delete'); toast('Deleted'); buzz(30,.2,.1); }   // L2 + B removes the selected layer, node or wire
      else back();
    }
    if (edge(p,2)) { key('z',{ctrlKey:true}); toast('Undo'); buzz(25,.08,.2); }
    if (edge(p,3)) { st.yAt = now; st.yHeld = true; }
    if (st.yHeld && !st.pie && now-st.yAt > 260 && pressed(p,3)) openPie();
    if (lift(p,3)) {
      st.yHeld = false;
      if (st.pie) closePie(true); else { key('z',{ctrlKey:true,shiftKey:true}); toast('Redo'); buzz(25,.08,.2); }
    }
    if (edge(p,4)) stepTool(-1);
    if (edge(p,5)) stepTool(1);
    if (edge(p,11)) { key('0'); toast('Fit'); buzz(20,.06,.2); }
    if (edge(p,9)) { const m = $('menu'); if (m) click(m); }
    if (edge(p,8)) showHelp(true);

    /* d-pad: slider and select first, then nudge (L2), then view and zoom */
    const hov = interactive(t), L = pressed(p,14), R = pressed(p,15), U = pressed(p,12), D = pressed(p,13);
    const horiz = L ? -1 : R ? 1 : 0;
    if (hov?.matches('input[type=range]') && horiz) {
      repeater('h',true,() => { const step = +hov.step || 1, mn = +hov.min || 0, mx = +hov.max || 100; hov.value = clamp(+hov.value+horiz*step*Math.max(1,Math.round((mx-mn)/50)),mn,mx); hov.dispatchEvent(new Event('input',{bubbles:true})); hov.dispatchEvent(new Event('change',{bubbles:true})); buzz(8,.03,.12); },300,60);
    } else if (hov?.matches('select') && horiz) {
      repeater('h',true,() => cycleSelect(hov,horiz),400,220);
    } else if (st.shift && (L || R || U || D)) {
      const k = L ? 'ArrowLeft' : R ? 'ArrowRight' : U ? 'ArrowUp' : 'ArrowDown';
      repeater('n',true,n => { key(k,{shiftKey:n > 8}); setTimeout(() => keyUp(k),30); },300,45);
      repeater('h',false);
    } else {
      repeater('n',false);
      repeater('h',false);
      if (edge(p,14)) stepView(-1);
      if (edge(p,15)) stepView(1);
      repeater('z',U || D,() => zoom(U ? 1 : -1),0,55);
    }

    /* right stick pans */
    const rx = axis(p,2), ry = axis(p,3);
    if (rx || ry) { panBy(rx*Math.abs(rx)*900*dt*cfg.speed,ry*Math.abs(ry)*900*dt*cfg.speed); st.idle = 0; } else panEnd();
  }
  addEventListener('gamepadconnected',e => { st.sony = /054c|dualsense|dualshock|playstation|wireless controller/i.test(e.gamepad.id); });
  addEventListener('blur',() => { if (st.down) release(); panEnd(); });
  st.step = step;
  requestAnimationFrame(frame);
})();
