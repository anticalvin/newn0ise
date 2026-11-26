// WaterService: Gerstner ocean on a camera-centred polar grid, depth-aware shoaling, shoreline foam,
// swash that matches the wet-sand line on the terrain, and a shared heightAt(x,z,t) CPU query.
import * as THREE from 'three';
import { NOISE_GLSL, SKY_GLSL, FOG_WATER } from './glsl.js';
import { S, N } from './terrain.js';

const WAVES = /* glsl */`
uniform float uTime, uSea, uWindAng;
void n0waves(vec2 p, float damp, out vec3 disp, out vec3 nrm){
  disp = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float L   = i==0?58.0 : i==1?31.0 : i==2?17.0 : i==3?9.5 : i==4?5.2 : 2.7;
    float amp = i==0?0.52 : i==1?0.32 : i==2?0.17 : i==3?0.095 : i==4?0.05 : 0.028;
    float off = i==0?0.0 : i==1?0.35 : i==2?-0.5 : i==3?0.9 : i==4?-1.1 : 1.6;
    float a = uWindAng + off * 0.55; vec2 d = vec2(cos(a), sin(a));
    float k = 6.2831853 / L, w = sqrt(9.81 * k);
    float ph = k * dot(d, p) - w * uTime + fi * 1.7;
    float A = amp * uSea * damp, steep = 0.15 * uSea * damp;
    float c = cos(ph), s = sin(ph);
    disp += vec3(d.x * steep / k * c, A * s, d.y * steep / k * c);
    n += vec3(-d.x * k * A * c, -steep * s, -d.y * k * A * c);
  }
  nrm = normalize(n);
}`;
const TERR = /* glsl */`
uniform sampler2D uHeight; uniform float uN; uniform float uS; uniform vec2 uTC;
float n0hf(ivec2 p){ return texelFetch(uHeight, clamp(p, ivec2(0), ivec2(int(uN))), 0).r; }
float terrH(vec2 xz){ vec2 g = ((xz - uTC) / uS + 0.5) * uN; g = clamp(g, vec2(0.0), vec2(uN) - 1e-3);
  ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
  return mix(mix(n0hf(i), n0hf(i+ivec2(1,0)), f.x), mix(n0hf(i+ivec2(0,1)), n0hf(i+ivec2(1,1)), f.x), f.y); }`;

const VERT = /* glsl */`
uniform float uLevel, uSwash; uniform vec2 uCenter;
varying vec3 vW; varying vec2 vP; varying float vH;
#include <fog_pars_vertex>
${NOISE_GLSL}${TERR}${WAVES}
void main(){
  vec2 p = position.xz + uCenter;
  float nz = n0fbm(p * 0.35);
  float lvl = uLevel + uSwash * (0.5 + 0.5 * sin(uTime * 0.55 + nz * 4.0));
  float depth0 = lvl - terrH(p);
  float damp = smoothstep(0.1, 3.2, depth0);
  vec3 disp, nrm; n0waves(p, damp, disp, nrm);
  vec3 wp = vec3(p.x + disp.x, lvl + disp.y, p.y + disp.z);
  vW = wp; vP = p; vH = disp.y;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform vec3 uLightDir, uLightCol; uniform float uDay;
varying vec3 vW; varying vec2 vP; varying float vH;
#include <fog_pars_fragment>
${NOISE_GLSL}${SKY_GLSL}${TERR}${WAVES}
void main(){
  float depth = vW.y - terrH(vW.xz);
  if (depth < 0.0) discard;
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW);
  float damp = smoothstep(0.1, 3.2, depth);
  vec3 dd, N; n0waves(vP, damp, dd, N);
  vec2 q = vP * 0.9 + vec2(uTime * 0.05, uTime * 0.03), e = vec2(0.03, 0.0);
  vec2 g = vec2(n0noise(q + e.xy) - n0noise(q - e.xy), n0noise(q + e.yx) - n0noise(q - e.yx)) / (2.0 * e.x);
  vec2 q2 = vP * 3.1 - vec2(uTime * 0.09, -uTime * 0.05);
  vec2 g2 = vec2(n0noise(q2 + e.xy) - n0noise(q2 - e.xy), n0noise(q2 + e.yx) - n0noise(q2 - e.yx)) / (2.0 * e.x);
  float fadeD = exp(-dist * 0.0045);
  N = normalize(N + vec3(g.x + 0.5 * g2.x, 0.0, g.y + 0.5 * g2.y) * (0.012 + 0.05 * uSea) * fadeD);
  bool under = cameraPosition.y < vW.y;
  if (under) N = -N;
  float ndv = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.005;
  vec3 refl = n0Sky(normalize(R), 0.0, 1.0);
  float kk = 1.0 - exp(-depth * 0.26);
  vec3 body = mix(vec3(0.05, 0.30, 0.29), vec3(0.006, 0.055, 0.105), kk);
  vec3 tint = mix(vec3(1.0), uLightCol / max(max(uLightCol.r, uLightCol.g), max(uLightCol.b, 0.001)), 0.55);
  body *= (0.10 + 0.90 * uDay) * tint;
  float crestN = clamp(vH / (0.9 * uSea + 0.05), 0.0, 1.0);
  body += vec3(0.02, 0.28, 0.22) * pow(crestN, 2.0) * uDay * 0.35 * (1.0 - kk * 0.6);
  vec3 H = normalize(V + uLightDir);
  float ndh = max(dot(N, H), 0.0);
  vec3 spec = uLightCol * (pow(ndh, 700.0) * 9.0 + pow(ndh, 80.0) * 0.35) * smoothstep(-0.02, 0.06, uLightDir.y) * fadeD;
  vec3 col = body * (1.0 - F) + refl * F + spec;
  // foam: shoreline + breaking crests
  float fn  = n0fbm(vP * 0.9 + vec2(uTime * 0.07, 0.0));
  float fn2 = n0fbm(vP * 3.6 - uTime * 0.12);
  float shore = smoothstep(0.85, 0.0, depth);
  float lines = smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(depth * 7.0 - uTime * 1.7 + fn * 5.0)) * smoothstep(2.4, 0.3, depth) * (0.35 + 0.65 * fn2);
  float crest = smoothstep(0.62, 1.0, crestN) * smoothstep(0.30, 0.70, fn2) * clamp(uSea * 1.2, 0.0, 1.0);
  float foam = clamp(shore * smoothstep(0.30, 0.72, fn + 0.6 * shore) + lines * 0.55 + crest * 0.8, 0.0, 1.0);
  vec3 foamCol = vec3(0.86, 0.90, 0.92) * (0.16 + 0.84 * uDay) * tint;
  col = mix(col, foamCol, foam);
  float alpha = (1.0 - exp(-depth * 2.0)) * smoothstep(0.0, 0.10, depth);
  alpha = clamp(mix(alpha * 0.94, 1.0, F), 0.0, 1.0);
  alpha = max(alpha, foam * 0.92);
  if (under) { col = vec3(0.01, 0.09, 0.12) * (0.2 + 0.8 * uDay); alpha = 0.85; }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  ${FOG_WATER}
}`;

export class Water {
  constructor(shared, terrain, env) {
    this.shared = shared; this.terrain = terrain; this.env = env; this.level = 0; this.ripples = [];
    const R = 280, A = 320, rmax = 3000, pw = 1.9, pos = new Float32Array((R + 1) * A * 3); let k = 0;
    for (let i = 0; i <= R; i++) { const r = rmax * Math.pow(i / R, pw);
      for (let a = 0; a < A; a++) { const th = a / A * Math.PI * 2; pos[k++] = Math.cos(th) * r; pos[k++] = 0; pos[k++] = Math.sin(th) * r; } }
    const idx = new Uint32Array(R * A * 6); k = 0;
    for (let i = 0; i < R; i++) for (let a = 0; a < A; a++) { const a2 = (a + 1) % A, p0 = i * A + a, p1 = i * A + a2, p2 = (i + 1) * A + a, p3 = (i + 1) * A + a2; idx.set([p0, p2, p1, p1, p2, p3], k); k += 6; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: shared.uTime, uSea: { value: 0.5 }, uWindAng: { value: 0 }, uLevel: { value: 0 }, uSwash: shared.uSwash, uTC: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLightCol: { value: new THREE.Color() }, uDay: { value: 1 },
      uSun: shared.uSun, uCloud: shared.uCloud, uCloudOff: shared.uCloudOff }]);
    Object.assign(this.u, terrain.uniforms);
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    // ripple pool (boulder splashes, wading)
    const rg = new THREE.RingGeometry(0.85, 1, 40); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false })); m.visible = false; m.renderOrder = 6; this.ripples.push({ m, t: 99, s: 1 }); }
  }
  // CPU mirror of the dominant wave terms, for buoyancy and splashes (matches the shader approximately).
  heightAt(x, z, t) {
    const sea = this.u.uSea.value, wa = this.u.uWindAng.value; let y = 0;
    const L = [58, 31, 17, 9.5, 5.2, 2.7], A = [0.52, 0.32, 0.17, 0.095, 0.05, 0.028], O = [0, 0.35, -0.5, 0.9, -1.1, 1.6];
    for (let i = 0; i < 6; i++) { const a = wa + O[i] * 0.55, k = 6.2831853 / L[i], w = Math.sqrt(9.81 * k);
      y += A[i] * sea * Math.sin(k * (Math.cos(a) * x + Math.sin(a) * z) - w * t + i * 1.7); }
    return this.level + y * Math.min(1, Math.max(0, (this.level - this.terrain.hAt(x, z) - 0.1) / 3.1));
  }
  splash(x, z, s = 1) {
    const r = this.ripples.reduce((a, b) => (b.t > a.t ? b : a)); r.t = 0; r.s = s; r.m.visible = true; r.m.position.set(x, this.level + 0.04, z);
  }
  update(dt, cam, p, env) {
    this.level = p.tide; this.shared.uWater.value = p.tide; this.u.uLevel.value = p.tide;
    this.u.uSea.value = p.sea; this.u.uWindAng.value = p.windAng; this.u.uCenter.value.set(cam.position.x, cam.position.z);
    this.u.uLightDir.value.copy(env.lightDir); this.u.uLightCol.value.copy(env.sun.color).multiplyScalar(Math.min(1, env.sun.intensity / 3.4 + 0.02)); this.u.uDay.value = env.day;
    this.u.fogDensity.value = env.scene.fog.density;
    for (const r of this.ripples) { if (r.t > 2.4) { r.m.visible = false; continue; } r.t += dt;
      const k = r.t / 2.4, sc = (0.4 + k * 4.5) * r.s; r.m.scale.set(sc, 1, sc); r.m.material.opacity = (1 - k) * 0.55 * Math.min(1, r.s); }
  }
}
