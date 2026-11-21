/* n0ise interface sounds: a handful of original, synthesised cues (no audio files).
   One place maps deliberate input (click, Enter, arrows, Escape, gamepad) to a cue.
   Silent until the first user gesture, never on hover, never while typing, throttled,
   off by default for reduced-motion users. Pages can call window.n0iseSound.play(name). */
const KEY = 'n0ise.sound';
const LEVELS = [['off', 0], ['low', .35], ['medium', .7]];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let level = 1;
try { const v = localStorage.getItem(KEY); level = v === null ? (reduced ? 0 : 1) : Math.max(0, Math.min(2, +v | 0)); } catch (_) { level = reduced ? 0 : 1; }

let ctx = null, master = null, lastAny = 0, lastKeyT = 0, modality = 'pointer';
const lastCue = {};

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = .5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = .4;
    master.connect(lp); lp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/* tone: soft sine with a quick attack and exponential release, optional pitch glide */
function tone(t, f, dur, vol, to) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + .008);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + .02);
}
/* air: a short band-passed noise breath, the "open" cue */
function air(t, dur, vol, f0, f1) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = b; f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .35); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
}

const CUES = {
  nav:     t => tone(t, 1180, .05, .11),
  focus:   t => tone(t, 1560, .035, .05),
  confirm: t => { tone(t, 740, .09, .16); tone(t + .055, 1110, .13, .15); },
  back:    t => { tone(t, 880, .08, .13); tone(t + .05, 590, .12, .12); },
  toggle:  t => tone(t, 980, .06, .13, 1320),
  open:    t => { air(t, .22, .09, 600, 2400); tone(t + .03, 660, .16, .08, 990); },
  close:   t => { air(t, .18, .07, 2200, 600); tone(t + .02, 880, .12, .07, 560); },
  success: t => { tone(t, 660, .1, .14); tone(t + .07, 830, .1, .14); tone(t + .14, 1240, .2, .14); },
  error:   t => { tone(t, 300, .11, .17, 250); tone(t + .1, 250, .16, .17, 200); },
  capture: t => { air(t, .05, .2, 3000, 1800); tone(t, 220, .06, .12, 120); },
  export:  t => { tone(t, 520, .08, .12); tone(t + .06, 780, .08, .12); tone(t + .12, 1040, .18, .13); }
};
const GAP = { nav: 70, focus: 90, toggle: 80 };

function play(name) {
  const lv = LEVELS[level][1];
  if (!lv || !CUES[name]) return;
  const now = performance.now();
  if (now - lastAny < 40 || now - (lastCue[name] || 0) < (GAP[name] || 120)) return;
  const a = audio();
  if (!a) return;
  lastAny = lastCue[name] = now;
  master.gain.setTargetAtTime(.55 * lv, a.currentTime, .005);
  CUES[name](a.currentTime + .005);
}

const typing = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(button|checkbox|radio|range|submit|reset)$/.test(el.type || '') || el.closest && el.closest('.cm-editor'));

/* ---- pointer, touch and Enter/Space all arrive as one click ---- */
const BACK = /^(close|back|cancel|done|dismiss|exit|×|✕|x)$/i;
function cueFor(el) {
  const t = el.closest('[data-sound],button,a[href],[role=button],[role=tab],[role=switch],[role=menuitem],[role=option],summary,label,input,select,.chip,.pill,.round,.door');
  if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return null;
  if (t.dataset.sound) return t.dataset.sound === 'none' ? null : t.dataset.sound;
  if (t.matches('input[type=range],input[type=text],input[type=number],input[type=search],textarea,select')) return null;
  const label = ((t.getAttribute('aria-label') || '') + ' ' + (t.textContent || '')).trim();
  if (BACK.test(t.textContent.trim()) || /\b(close|back|cancel)\b/i.test(t.getAttribute('aria-label') || '')) return 'back';
  if (t.hasAttribute('aria-pressed') || t.hasAttribute('aria-selected') || t.getAttribute('role') === 'switch' || t.matches('input[type=checkbox],input[type=radio]')) return 'toggle';
  if (t.hasAttribute('aria-haspopup') || t.hasAttribute('aria-expanded') || /^(menu|more|options|settings)/i.test(label)) return 'open';
  if (t.matches('a[href]') && !t.matches('.door,.round')) return 'nav';
  return 'confirm';
}
document.addEventListener('click', e => {
  if (!e.isTrusted || e.target.closest('#n0iseSound')) return;
  const c = cueFor(e.target);
  if (c) play(c);
}, true);

/* ---- keyboard: arrows move, Escape goes back; no repeats, never while typing ---- */
document.addEventListener('keydown', e => {
  lastKeyT = performance.now(); modality = 'key';
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
  if (e.key === 'Escape') play('back');
  else if (/^Arrow/.test(e.key) && !/^(range)$/.test(e.target.type || '')) play('nav');
}, true);
document.addEventListener('pointerdown', () => { modality = 'pointer'; if (level) audio(); }, true);
/* focus ticks only when focus moved because of the keyboard or a pad just now, not programmatically */
document.addEventListener('focusin', e => {
  if ((modality === 'key' || modality === 'pad') && performance.now() - lastKeyT < 350 && !typing(e.target) && e.key !== 'Tab') play('focus');
}, true);

/* ---- gamepad: d-pad / stick edges, A confirm, B back (polled only while a pad is connected) ---- */
let padOn = false, prev = {};
function poll() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  if (!pads.length) { padOn = false; return; }
  const p = pads[0], d = i => !!(p.buttons[i] && p.buttons[i].pressed);
  const st = { up: d(12) || p.axes[1] < -.6, down: d(13) || p.axes[1] > .6, left: d(14) || p.axes[0] < -.6, right: d(15) || p.axes[0] > .6, a: d(0), b: d(1) };
  const edge = k => st[k] && !prev[k];
  if (edge('up') || edge('down') || edge('left') || edge('right')) { modality = 'pad'; lastKeyT = performance.now(); play('nav'); }
  else if (edge('a')) { modality = 'pad'; play('confirm'); }
  else if (edge('b')) { modality = 'pad'; play('back'); }
  prev = st;
  requestAnimationFrame(poll);
}
const startPad = () => { if (!padOn) { padOn = true; prev = {}; requestAnimationFrame(poll); } };
addEventListener('gamepadconnected', startPad);
if (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)) startPad();

/* ---- the one control: Sound off / low / medium, remembered ---- */
function button() {
  if (document.getElementById('n0iseSound')) return;
  const b = document.createElement('button');
  b.id = 'n0iseSound'; b.type = 'button'; b.dataset.sound = 'none';
  const paint = () => {
    const n = LEVELS[level][0];
    b.setAttribute('aria-label', 'Sound ' + n + '. Press to change');
    b.title = 'Sound: ' + n;
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/>' +
      (level === 0 ? '<path d="m16 9 5 6M21 9l-5 6"/>' : level === 1 ? '<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/>' : '<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18.2 7a7 7 0 0 1 0 10"/>') + '</svg>';
  };
  b.addEventListener('click', () => {
    level = (level + 1) % 3;
    try { localStorage.setItem(KEY, level); } catch (_) {}
    paint(); play('toggle');
  });
  paint();
  const host = document.querySelector('.header-end, .topright, .hr');
  if (host) {
    b.className = host.matches('.topright') ? 'iconbtn' : 'round';
    b.style.cssText = 'color:inherit;cursor:pointer;min-width:44px;min-height:44px';
    host.insertBefore(b, host.firstChild);
  } else {
    b.style.cssText = 'position:fixed;right:max(10px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));z-index:60;width:44px;height:44px;display:grid;place-items:center;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(20,20,20,.55);color:#e9e5db;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);cursor:pointer';
    document.body.appendChild(b);
  }
}
if (document.body) button(); else addEventListener('DOMContentLoaded', button);

window.n0iseSound = { play, get level() { return LEVELS[level][0]; } };
