// Impact effects: spark/dust particle pools, expanding rings, and a tiny synthesized sound set (no audio files).
import * as THREE from 'three';

const VS = `attribute float aSize; attribute vec4 aCol; varying vec4 vC; uniform float uScale;
void main(){ vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.,aSize*uScale/max(.1,-mv.z)); }`;
const FS = `varying vec4 vC; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.15,d)*vC.a; if(a<.01) discard; gl_FragColor=vec4(vC.rgb,a); }`;

class Pool {
  constructor(n, additive, grav, drag) {
    this.n = n; this.grav = grav; this.drag = drag; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n); this.col = new Float32Array(n * 4); this.base = new Float32Array(n * 3); this.grow = new Float32Array(n); this.next = 0;
    const g = new THREE.BufferGeometry(); this.pa = new THREE.BufferAttribute(this.p, 3); this.sa = new THREE.BufferAttribute(new Float32Array(n), 1); this.ca = new THREE.BufferAttribute(this.col, 4);
    this.pa.setUsage(THREE.DynamicDrawUsage); this.sa.setUsage(THREE.DynamicDrawUsage); this.ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa); g.setAttribute('aSize', this.sa); g.setAttribute('aCol', this.ca); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.u = { uScale: { value: 600 } };
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 20;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grow = 0) {
    const i = this.next; this.next = (this.next + 1) % this.n; const o = i * 3;
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z; this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz; this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.base[o] = r; this.base[o + 1] = g; this.base[o + 2] = b; this.col[i * 4 + 3] = a;
  }
  update(dt) {
    const { p, v, life, max, size, col, base } = this, dk = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) { col[i * 4 + 3] = 0; this.sa.array[i] = 0; continue; }
      life[i] -= dt; const o = i * 3, t = Math.max(0, life[i] / max[i]);
      v[o] *= dk; v[o + 1] = v[o + 1] * dk - this.grav * dt; v[o + 2] *= dk; p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt;
      size[i] += this.grow[i] * dt; col[i * 4] = base[o]; col[i * 4 + 1] = base[o + 1]; col[i * 4 + 2] = base[o + 2]; col[i * 4 + 3] = t * t; this.sa.array[i] = size[i] * (0.4 + 0.6 * t);
    }
    this.pa.needsUpdate = this.sa.needsUpdate = this.ca.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, camera) {
    this.camera = camera; this.sparks = new Pool(400, true, 9, 1.6); this.dust = new Pool(300, false, -0.4, 2.6); scene.add(this.sparks.mesh, this.dust.mesh);
    const rg = new THREE.RingGeometry(0.8, 1, 36); this.rings = [];
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false })); m.visible = false; m.renderOrder = 30; m.userData = { t: 9, s: 1 }; scene.add(m); this.rings.push(m); }
    this.audio = null; this.sound = true;
  }
  spark(x, y, z, dx, dz, n = 14, col = [1, 0.8, 0.45], speed = 6) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, e = Math.random() * 1.2 - 0.2, sp = speed * (0.4 + Math.random());
      this.sparks.emit(x, y, z, (dx * 0.8 + Math.cos(a) * 0.6) * sp, (e + 0.4) * sp * 0.6, (dz * 0.8 + Math.sin(a) * 0.6) * sp, 0.22 + Math.random() * 0.25, 0.09 + Math.random() * 0.08, col[0], col[1], col[2]); }
  }
  dustPuff(x, y, z, n = 6, size = 0.9, col = [0.78, 0.66, 0.5], spread = 1.6) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = spread * (0.3 + Math.random()); this.dust.emit(x + Math.cos(a) * 0.15, y + 0.05, z + Math.sin(a) * 0.15, Math.cos(a) * sp, 0.4 + Math.random() * 0.9, Math.sin(a) * sp, 0.55 + Math.random() * 0.5, size * (0.7 + Math.random() * 0.6), col[0], col[1], col[2], 0.55, size * 0.9); }
  }
  ring(x, y, z, size = 1.2, col = 0xffe9b0) {
    const m = this.rings.reduce((a, b) => (b.userData.t > a.userData.t ? b : a)); m.userData.t = 0; m.userData.s = size; m.material.color.setHex(col); m.visible = true; m.position.set(x, y, z);
  }
  update(dt, renderer) {
    const h = renderer.domElement.height, s = h / (2 * Math.tan(this.camera.fov * Math.PI / 360)); this.sparks.u.uScale.value = this.dust.u.uScale.value = s;
    this.sparks.update(dt); this.dust.update(dt);
    for (const m of this.rings) { const u = m.userData; if (u.t > 0.35) { m.visible = false; continue; } u.t += dt; const k = u.t / 0.35; m.scale.setScalar((0.25 + k * 1.1) * u.s); m.material.opacity = (1 - k) * 0.85; m.quaternion.copy(this.camera.quaternion); }
  }
  // ---- sound ----
  // A small synth engine: everything goes through one master bus (soft compressor + a short generated room reverb), voices get random pitch and
  // level so repeats never sound identical, and positional sounds are panned and attenuated against the camera. No audio files.
  unlock() {
    if (!this.audio) { try { this.audio = new (window.AudioContext || window.webkitAudioContext)(); this.bus(); } catch (e) { /* no audio */ } }
    if (this.audio && this.audio.state === 'suspended') this.audio.resume();
  }
  bus() {
    const c = this.audio; this.out = c.createGain(); this.out.gain.value = this.vol != null ? this.vol : 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
    this.rev = c.createConvolver(); const n = (c.sampleRate * 1.1) | 0, ib = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ib.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    this.rev.buffer = ib; this.revG = c.createGain(); this.revG.gain.value = 0.2; this.out.connect(comp); comp.connect(c.destination); this.out.connect(this.rev); this.rev.connect(this.revG); this.revG.connect(comp);
  }
  // route for one voice: optional world position => pan + distance falloff
  dest(pos, vol) {
    const c = this.audio; if (!pos) return { node: this.out, vol };
    const cam = this.camera, dx = pos.x - cam.position.x, dy = pos.y - cam.position.y, dz = pos.z - cam.position.z, d = Math.hypot(dx, dy, dz);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), pan = Math.max(-1, Math.min(1, (dx * right.x + dy * right.y + dz * right.z) / Math.max(1, d) * 0.9));
    const v = vol / (1 + d * d * 0.012); if (v < 0.01) return null;
    const p = c.createStereoPanner ? c.createStereoPanner() : null; if (p) { p.pan.value = pan; p.connect(this.out); return { node: p, vol: v }; } return { node: this.out, vol: v };
  }
  // filtered noise burst with an attack/decay envelope and a moving band
  noise(dur, f0, f1, q, vol, o = {}) {
    const c = this.audio, t0 = c.currentTime + (o.delay || 0), n = Math.max(8, c.sampleRate * dur | 0), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0), pw = o.pow || 2;
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, pw);
    const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol * (o.gain || 1), t0 + (o.atk || 0.002)); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(f); f.connect(g); g.connect(o.node || this.out); s.start(t0);
  }
  tone(type, f0, f1, dur, vol, o = {}) {
    const c = this.audio, t = c.currentTime + (o.delay || 0), os = c.createOscillator(), g = c.createGain(); os.type = type; os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (o.atk || 0.003)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); os.connect(g); g.connect(o.node || this.out); os.start(t); os.stop(t + dur + 0.03);
  }
  play(kind, vol = 1, pos = null) {
    if (!this.sound || !this.audio || this.audio.state !== 'running') return;
    const r = this.dest(pos, Math.min(1.4, vol)); if (!r) return; const v = r.vol * (0.88 + Math.random() * 0.24), k = 0.93 + Math.random() * 0.14, node = r.node;
    const N = (d, a, b, q, m, o) => this.noise(d, a * k, b * k, q, m * v, { node, ...o }), T = (ty, a, b, d, m, o) => this.tone(ty, a * k, b * k, d, m * v, { node, ...o });
    switch (kind) {
      case 'punch': N(0.08, 2200, 600, 0.9, 0.5); T('sine', 190, 60, 0.12, 0.55); N(0.05, 400, 200, 0.5, 0.25, { type: 'lowpass' }); break;
      case 'kick': N(0.12, 1400, 300, 0.7, 0.6); T('sine', 130, 40, 0.2, 0.75); N(0.07, 600, 150, 0.5, 0.3, { type: 'lowpass' }); break;
      case 'heavy': N(0.22, 1000, 140, 0.6, 0.75); T('sine', 95, 28, 0.38, 0.95); T('sawtooth', 60, 30, 0.2, 0.25); N(0.3, 300, 80, 0.4, 0.4, { type: 'lowpass' }); break;
      case 'block': T('square', 700, 420, 0.06, 0.14); N(0.06, 3400, 1600, 2.2, 0.32); T('sine', 220, 120, 0.1, 0.3); break;
      case 'parry': T('triangle', 1500, 2000, 0.2, 0.26); T('sine', 2200, 2600, 0.3, 0.14); N(0.08, 5000, 3000, 3, 0.2); T('sine', 3300, 3300, 0.4, 0.06, { delay: 0.03 }); break;
      case 'whoosh': N(0.2, 300, 1800, 1.0, 0.18, { atk: 0.05, pow: 1.4 }); break;
      case 'shot': case 'pistol': N(0.1, 3200, 400, 0.6, 0.8); T('sine', 190, 48, 0.16, 0.85); N(0.5, 900, 120, 0.4, 0.28, { type: 'lowpass', pow: 3, delay: 0.015 }); break;
      case 'rifle': N(0.09, 3600, 500, 0.6, 0.85); T('sine', 160, 42, 0.14, 0.8); T('sawtooth', 240, 70, 0.07, 0.2); N(0.55, 1100, 140, 0.4, 0.3, { type: 'lowpass', pow: 3, delay: 0.012 }); break;
      case 'shotgun': N(0.16, 2400, 250, 0.5, 1.0); T('sine', 120, 30, 0.28, 1.0); T('sawtooth', 90, 35, 0.15, 0.35); N(0.8, 700, 90, 0.35, 0.45, { type: 'lowpass', pow: 2.6, delay: 0.02 }); break;
      case 'empty': T('square', 1100, 800, 0.025, 0.12); break;
      case 'reload': T('square', 800, 500, 0.03, 0.12); N(0.04, 4000, 2000, 3, 0.2); T('square', 520, 380, 0.04, 0.12, { delay: 0.14 }); N(0.05, 2500, 1200, 3, 0.2, { delay: 0.14 }); T('square', 1000, 700, 0.03, 0.16, { delay: 0.28 }); break;
      case 'click': T('square', 950, 720, 0.03, 0.12); break;
      case 'pickup': T('triangle', 520, 900, 0.12, 0.22); T('sine', 900, 1350, 0.18, 0.14); T('sine', 1350, 1800, 0.22, 0.08, { delay: 0.07 }); break;
      case 'thud': T('sine', 84, 32, 0.22, 0.6); N(0.12, 520, 150, 0.6, 0.35); break;
      case 'crate': N(0.1, 1200, 300, 0.9, 0.5); T('triangle', 160, 70, 0.1, 0.35); N(0.06, 2500, 900, 1.5, 0.25, { delay: 0.03 }); break;
      case 'barrel': T('sine', 130, 70, 0.3, 0.5); T('triangle', 260, 150, 0.2, 0.2); N(0.14, 1800, 500, 1.2, 0.3); break;
      case 'rock': T('sine', 70, 28, 0.3, 0.7); N(0.2, 700, 120, 0.5, 0.5); break;
      case 'step': N(0.06, 1500, 500, 0.8, 0.14, { pow: 3 }); T('sine', 110, 60, 0.06, 0.12); break;
      case 'stepSand': N(0.1, 2600, 900, 0.6, 0.12, { pow: 1.6, atk: 0.01 }); break;
      case 'jump': N(0.1, 500, 1100, 0.9, 0.12, { atk: 0.03 }); break;
      case 'land': T('sine', 100, 40, 0.14, 0.4); N(0.1, 900, 250, 0.6, 0.25); break;
      case 'hurt': T('sawtooth', 220, 110, 0.14, 0.2); N(0.1, 1200, 400, 0.8, 0.25); break;
      case 'splash': N(0.4, 2600, 500, 0.5, 0.28, { atk: 0.01, pow: 1.5 }); N(0.2, 800, 200, 0.5, 0.2, { type: 'lowpass' }); break;
      case 'grab': T('triangle', 300, 520, 0.08, 0.1); break;
      case 'ko': T('sine', 140, 26, 0.7, 0.85); N(0.5, 800, 90, 0.6, 0.55); T('sawtooth', 90, 30, 0.4, 0.2); break;
      case 'horn': T('square', 330, 330, 0.35, 0.15); T('square', 415, 415, 0.35, 0.12); break;
      case 'crash': N(0.35, 1800, 200, 0.5, 0.8); T('sine', 90, 30, 0.4, 0.8); N(0.2, 5000, 2000, 2, 0.2); break;
    }
  }
  // looping engine for the car: rpm 0..1; call every frame while driving, engine(false) to stop
  engine(on, rpm = 0, load = 0) {
    const c = this.audio; if (!c || !this.sound) on = false;
    if (!on) { if (this.eng) { const t = c.currentTime; this.eng.g.gain.setTargetAtTime(0, t, 0.08); const e = this.eng; this.eng = null; setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch (er) { /* done */ } }, 400); } return; }
    if (c.state !== 'running') return;
    if (!this.eng) { const g = c.createGain(), f = c.createBiquadFilter(), o1 = c.createOscillator(), o2 = c.createOscillator(); f.type = 'lowpass'; o1.type = 'sawtooth'; o2.type = 'square'; g.gain.value = 0; o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.out); o1.start(); o2.start(); this.eng = { g, f, o1, o2 }; }
    const e = this.eng, t = c.currentTime, fr = 38 + rpm * 90; e.o1.frequency.setTargetAtTime(fr, t, 0.05); e.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.05); e.f.frequency.setTargetAtTime(240 + rpm * 700 + load * 500, t, 0.05); e.g.gain.setTargetAtTime(0.06 + rpm * 0.07 + load * 0.04, t, 0.06);
  }
}
