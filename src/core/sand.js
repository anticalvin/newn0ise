// Sand grains: thousands of tiny visual particles. They are kicked up by footsteps, landings, boulders and the sculpt brush,
// and a light wind keeps a veil of grains hopping along dry sand near the camera. They are NOT a granular simulation:
// grains do not pile up or carry mass, they fall, bounce once or twice, and settle back into the terrain.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';
import { mulberry32, clamp } from './util.js';

const VERT = /* glsl */`
attribute float aSize; attribute float aA; attribute float aTone;
uniform float uScale; varying float vA; varying float vTone; varying float vDist;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z -= 0.0002 * gl_Position.w;   // grains sit a hair in front of the terrain so slopes never swallow them
  float d = max(-mv.z, 0.1);
  gl_PointSize = clamp(aSize * uScale / d, 2.0, 12.0);
  vA = aA; vTone = aTone; vDist = d;
}`;
const FRAG = /* glsl */`
precision highp float;
uniform vec3 uSun; varying float vA; varying float vTone; varying float vDist; uniform vec3 uCamPos;
${NOISE_GLSL}
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard;
  float day = smoothstep(-0.12, 0.3, uSun.y);
  vec3 sand = mix(vec3(1.0, 0.86, 0.60), vec3(0.70, 0.54, 0.32), vTone);
  vec3 col = sand * (0.10 + 0.95 * day) + vec3(0.22, 0.08, 0.02) * exp(-pow(uSun.y / 0.22, 2.0)) * 0.6;
  float a = vA * smoothstep(0.5, 0.28, r) * (1.0 - smoothstep(40.0, 120.0, vDist));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sand {
  constructor(shared, terrain, max = 9000) {
    this.T = terrain; this.max = max; this.i = 0; this.rnd = mulberry32(99); this.amb = 0; this.enabled = true;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max); this.bounce = new Uint8Array(max);
    this.aSize = new Float32Array(max); this.aA = new Float32Array(max); this.aTone = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1)); g.setAttribute('aTone', new THREE.BufferAttribute(this.aTone, 1));
    g.setAttribute('aA', new THREE.BufferAttribute(this.aA, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uScale = { value: 800 };
    this.mat = new THREE.ShaderMaterial({ uniforms: { uSun: shared.uSun, uScale: this.uScale, uCamPos: { value: new THREE.Vector3() } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, fog: false });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    for (let k = 0; k < max; k++) { this.pos[k * 3 + 1] = -9999; this.aTone[k] = this.rnd(); this.aSize[k] = 0.022 + this.rnd() * 0.03; }
    g.attributes.aTone.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
  get alive() { let n = 0; for (let k = 0; k < this.max; k++) if (this.life[k] > 0) n++; return n; }
  // spawn n grains around (x,y,z): speed in m/s, up is an extra upward bias, wind pushes them along
  burst(x, y, z, n, speed = 1.6, up = 1.2, spread = 0.25) {
    if (!this.enabled) return; const r = this.rnd;
    for (let c = 0; c < n; c++) {
      const k = this.i = (this.i + 1) % this.max, a = r() * 6.2832, s = speed * (0.3 + r() * 0.9), o = k * 3;
      this.pos[o] = x + (r() - 0.5) * spread; this.pos[o + 1] = y + 0.03 + r() * 0.05; this.pos[o + 2] = z + (r() - 0.5) * spread;
      this.vel[o] = Math.cos(a) * s; this.vel[o + 1] = up * (0.4 + r() * 1.1); this.vel[o + 2] = Math.sin(a) * s;
      this.life[k] = 0.9 + r() * 1.4; this.age[k] = 0; this.bounce[k] = 0; this.aSize[k] = 0.022 + r() * 0.03; this.aA[k] = 0.95;
    }
    this.mesh.geometry.attributes.aSize.needsUpdate = true;
  }
  update(dt, cam, focus, env, level) {
    if (!this.enabled) return;
    const T = this.T, p = this.pos, v = this.vel, wind = env.p.wind, wa = env.p.windAng, wx = Math.cos(wa), wz = Math.sin(wa);
    // ambient veil: grains hop along dry sand near the player; denser when it is windy
    this.amb += dt * (30 + 240 * wind * wind);
    while (this.amb >= 1) {
      this.amb--; const r = this.rnd, a = r() * 6.2832, d = Math.sqrt(r()) * 16, x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d, h = T.hAt(x, z);
      if (h < level + 0.35 || h > 3.2 || T.nAt(x, z).y < 0.8) continue;
      const pi = ((x / 256 + 0.5) * 512) | 0, pj = ((z / 256 + 0.5) * 512) | 0, o = (clamp(pj, 0, 511) * 512 + clamp(pi, 0, 511)) * 4;
      if (T.paint[o + 1] > 120 || T.paint[o] > 120) continue;   // painted grass or rock: no loose sand
      const k = this.i = (this.i + 1) % this.max, q = k * 3;
      p[q] = x; p[q + 1] = h + 0.02; p[q + 2] = z; const sp = 0.8 + wind * 2.6 * (0.5 + r());
      v[q] = wx * sp; v[q + 1] = 0.25 + r() * 0.5 + wind * 0.4; v[q + 2] = wz * sp;
      this.life[k] = 0.8 + r() * 1.2; this.age[k] = 0; this.bounce[k] = 0; this.aSize[k] = 0.018 + r() * 0.025; this.aA[k] = 0.75;
    }
    const geo = this.mesh.geometry, drag = Math.exp(-dt * 1.6);
    for (let k = 0; k < this.max; k++) {
      const l = this.life[k]; if (l <= 0) continue; const o = k * 3;
      this.age[k] += dt;
      v[o + 1] -= 9.81 * 0.7 * dt; v[o] = v[o] * drag + wx * wind * 2.0 * dt; v[o + 2] = v[o + 2] * drag + wz * wind * 2.0 * dt;
      p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt;
      const g = T.hAt(p[o], p[o + 2]) + 0.05;
      if (p[o + 1] < g) {
        p[o + 1] = g;
        if (this.bounce[k] < 2 && v[o + 1] < -0.5) { v[o + 1] *= -0.28; v[o] *= 0.55; v[o + 2] *= 0.55; this.bounce[k]++; } else { v[o] = v[o + 1] = v[o + 2] = 0; this.life[k] = Math.min(l, this.age[k] + 0.35); }
      }
      if (p[o + 1] < level - 0.02) this.life[k] = Math.min(l, this.age[k] + 0.05);   // grains that land in the sea vanish
      const rem = this.life[k] - this.age[k];
      if (rem <= 0) { this.life[k] = 0; p[o + 1] = -9999; this.aA[k] = 0; } else this.aA[k] = Math.min(0.95, rem * 3.0);
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aA.needsUpdate = true;
    this.mat.uniforms.uCamPos.value.copy(cam.position);
  }
  setScale(renderer, camera) { const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y; this.uScale.value = h / (2 * Math.tan(camera.fov * Math.PI / 360)); }
  clear() { this.life.fill(0); this.aA.fill(0); for (let k = 0; k < this.max; k++) this.pos[k * 3 + 1] = -9999; }
}
