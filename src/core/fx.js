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
  unlock() { if (!this.audio) { try { this.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } } if (this.audio && this.audio.state === 'suspended') this.audio.resume(); }
  noise(dur, f0, f1, q, vol) {
    const c = this.audio, n = c.sampleRate * dur | 0, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, c.currentTime); f.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur);
    const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  tone(type, f0, f1, dur, vol) {
    const c = this.audio, o = c.createOscillator(), g = c.createGain(), t = c.currentTime; o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(c.destination); o.start(); o.stop(t + dur + 0.02);
  }
  play(kind, vol = 1) {
    if (!this.sound || !this.audio || this.audio.state !== 'running') return; const v = Math.min(1, vol);
    switch (kind) {
      case 'punch': this.noise(0.09, 1800, 500, 0.8, 0.5 * v); this.tone('sine', 170, 55, 0.13, 0.55 * v); break;
      case 'kick': this.noise(0.13, 1200, 300, 0.7, 0.6 * v); this.tone('sine', 120, 38, 0.22, 0.7 * v); break;
      case 'heavy': this.noise(0.2, 900, 160, 0.6, 0.7 * v); this.tone('sine', 90, 30, 0.35, 0.9 * v); break;
      case 'block': this.tone('square', 640, 380, 0.07, 0.16 * v); this.noise(0.05, 3000, 1500, 2, 0.3 * v); break;
      case 'parry': this.tone('triangle', 1400, 1900, 0.18, 0.28 * v); this.tone('sine', 2100, 2400, 0.25, 0.14 * v); break;
      case 'whoosh': this.noise(0.18, 350, 1500, 1.1, 0.16 * v); break;
      case 'shot': this.noise(0.12, 2600, 300, 0.7, 0.7 * v); this.tone('sine', 150, 45, 0.16, 0.8 * v); break;
      case 'click': this.tone('square', 900, 700, 0.03, 0.12 * v); break;
      case 'pickup': this.tone('triangle', 520, 880, 0.12, 0.2 * v); this.tone('sine', 880, 1320, 0.16, 0.12 * v); break;
      case 'thud': this.tone('sine', 80, 32, 0.22, 0.6 * v); this.noise(0.12, 500, 150, 0.6, 0.35 * v); break;
      case 'splash': this.noise(0.35, 2400, 600, 0.5, 0.25 * v); break;
      case 'grab': this.tone('triangle', 300, 520, 0.08, 0.1 * v); break;
      case 'ko': this.tone('sine', 140, 28, 0.6, 0.8 * v); this.noise(0.4, 700, 100, 0.6, 0.5 * v); break;
    }
  }
}
