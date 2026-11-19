// EnvironmentSystem: ONE state (time, cloud, wind, sea, tide) drives sun, sky, fog, lighting, water and foliage wind.
import * as THREE from 'three';
import { NOISE_GLSL, SKY_GLSL } from './glsl.js';
import { clamp, smooth, lerp } from './util.js';

function skyMaterial(shared, disc) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uDisc: { value: disc } },
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: NOISE_GLSL + SKY_GLSL + `varying vec3 vDir; uniform float uDisc;
      void main(){ gl_FragColor = vec4(n0Sky(normalize(vDir), uDisc, 1.0), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
}

export class Environment {
  constructor(renderer, scene, shared) {
    this.renderer = renderer; this.scene = scene; this.shared = shared;
    this.p = { time: 17.4, cloud: 0.38, wind: 0.55, windAng: 0, sea: 0.55, tide: 0.0 };
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 20; sc.far = 520;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.25;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd0ff, 0x6b5a48, 0.3); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0x9aa5ad, 0.0011);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(shared, 1));
    this.sky.scale.setScalar(4000); this.sky.renderOrder = -100; this.sky.frustumCulled = false; scene.add(this.sky);
    this.envScene = new THREE.Scene(); this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial(shared, 0)));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envDirty = true; this.envAt = 0; this.cloudT = 0;
    this.sunCol = new THREE.Color(); this.lightDir = new THREE.Vector3(); this.day = 1;
    this.set({});
  }
  set(ch) {
    Object.assign(this.p, ch);
    const p = this.p, a = (p.time - 6) / 12 * Math.PI;
    const sun = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.9, -0.22 * Math.sin(a)).normalize();
    this.shared.uSun.value.copy(sun); this.shared.uCloud.value = p.cloud; this.shared.uWind.value = p.wind;
    const e = sun.y; this.day = smooth(-0.08, 0.22, e);
    const warm = 1 - smooth(0.0, 0.5, e);
    this.sunCol.setRGB(1, lerp(0.95, 0.46, Math.pow(warm, 1.1)), lerp(0.88, 0.16, Math.pow(warm, 1.1)));
    const moon = e < 0.06;
    if (moon) { this.lightDir.copy(sun).negate(); this.sun.color.setRGB(0.55, 0.65, 1.0); this.sun.intensity = 0.5 * smooth(0.06, -0.25, e); }
    else { this.lightDir.copy(sun); this.sun.color.copy(this.sunCol); this.sun.intensity = 3.4 * smooth(-0.02, 0.2, e) + 0.0; }
    this.hemi.intensity = 0.3 + 0.55 * this.day; this.hemi.color.setRGB(0.62 + 0.1 * this.day, 0.74 + 0.06 * this.day, 1.0); this.scene.environmentIntensity = 0.12 + 0.7 * this.day * (1 - 0.4 * p.cloud);
    this.scene.fog.density = 0.0009 + 0.0007 * p.cloud + 0.0009 * Math.max(0, p.sea - 0.9);
    this.envDirty = true; this.envAt = performance.now() + 200;
  }
  update(dt, cam, focus) {
    this.cloudT += dt;
    const sp = 0.004 + 0.02 * this.p.wind;
    this.shared.uCloudOff.value.set(this.cloudT * sp, this.cloudT * sp * 0.4);
    this.sky.position.copy(cam.position);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 200); this.sun.target.position.copy(focus);
    if (this.envDirty && performance.now() > this.envAt) {
      this.envDirty = false;
      const rt = this.pmrem.fromScene(this.envScene, 0.04);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt; this.scene.environment = rt.texture;
    }
  }
}
