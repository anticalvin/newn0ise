// Fight HUD: player health, combo counter, floating enemy bars, lock-on reticle. Pure DOM, positioned from world space each frame.
import * as THREE from 'three';

export class Hud {
  constructor(app, root) {
    this.a = app; const el = document.createElement('div'); el.id = 'hud';
    el.innerHTML = '<div class="hp"><span>YOU</span><div class="bar"><i></i></div></div><div class="combo"><b></b><span>HIT</span></div><div class="lock"></div><div id="bars"></div>'; root.appendChild(el);
    this.hp = el.querySelector('.hp i'); this.hpBox = el.querySelector('.hp'); this.combo = el.querySelector('.combo'); this.lock = el.querySelector('.lock'); this.bars = el.querySelector('#bars'); this.pool = new Map(); this.v = new THREE.Vector3(); this.lastCombo = 0; this.shown = 0;
  }
  update(dt) {
    const A = this.a, P = A.player, C = A.combat, cam = A.camera;
    if (P) { const r = Math.max(0, P.hp / P.maxHp); this.hp.style.transform = `scaleX(${r})`; this.hpBox.classList.toggle('low', r < 0.3); this.hpBox.style.opacity = A.mode === 'explore' ? 1 : 0; }
    const n = C.combo.n; if (n !== this.lastCombo) { this.combo.firstChild.textContent = n; this.combo.classList.toggle('on', n >= 2); if (n >= 2) { this.combo.classList.remove('pop'); void this.combo.offsetWidth; this.combo.classList.add('pop'); } this.lastCombo = n; } if (C.combo.t <= 0) this.combo.classList.remove('on');
    const seen = new Set();
    for (const e of C.enemies()) {
      let b = this.pool.get(e); if (!b) { b = document.createElement('div'); b.className = 'ebar'; b.innerHTML = '<div class="bar"><i></i></div>'; this.bars.appendChild(b); this.pool.set(e, b); }
      seen.add(e); const d = e.pos.distanceTo(P.pos), locked = P.lock === e, show = A.mode === 'explore' && e.alive && !e.dummy && (e.hurtT > 0 || locked || d < 9) || (A.mode === 'explore' && e.dummy && e.hurtT > 0);
      this.v.set(e.rpos.x, e.rpos.y + 2.05 * e.scale, e.rpos.z).project(cam);
      const on = show && this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1; b.style.opacity = on ? 1 : 0;
      if (on) { b.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * innerWidth}px,${(-this.v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`; b.firstChild.firstChild.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp)})`; }
      if (locked && on) { this.lock.style.opacity = 1; this.lock.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * innerWidth}px,${(-this.v.y * 0.5 + 0.5) * innerHeight + 34}px) translate(-50%,0)`; }
    }
    if (!P.lock) this.lock.style.opacity = 0;
    for (const [e, b] of this.pool) if (!seen.has(e)) { b.remove(); this.pool.delete(e); }
  }
}
