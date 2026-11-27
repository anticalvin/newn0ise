// Optional post processing for Core: HDR bloom so muzzle flashes, tracers, red-dot sights and the sun glow. Off by default; the shooter turns it on.
// The composer renders the world, then optional overlay scenes (the first-person weapon, with its depth cleared so it never clips into walls), then bloom, then tone mapping.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createPost(app) {
  const { renderer, scene, camera } = app; const P = { on: false, strength: 0.55, threshold: 0.92, radius: 0.5, overlay: null }; let comp = null, bloom = null, ovPass = null, w = 0, h = 0, hdr = null;
  function build() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2()); w = size.x; h = size.y;
    hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }); comp = new EffectComposer(renderer, hdr); comp.setPixelRatio(1); comp.setSize(w, h);
    comp.addPass(new RenderPass(scene, camera)); ovPass = new RenderPass(new THREE.Scene(), camera); ovPass.clear = false; ovPass.clearDepth = true; ovPass.enabled = false; comp.addPass(ovPass);
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), P.strength, P.radius, P.threshold); comp.addPass(bloom); comp.addPass(new OutputPass());
  }
  P.set = o => { Object.assign(P, o); if (bloom) { bloom.strength = P.strength; bloom.radius = P.radius; bloom.threshold = P.threshold; } };
  P.render = () => {
    if (!comp) build(); const s = renderer.getDrawingBufferSize(new THREE.Vector2()); if (s.x !== w || s.y !== h) { w = s.x; h = s.y; comp.setSize(w, h); bloom.resolution.set(w, h); }
    ovPass.scene = P.overlay || ovPass.scene; ovPass.enabled = !!P.overlay; comp.render();
  };
  P.dispose = () => { if (comp) { comp.dispose(); hdr.dispose(); comp = null; } };
  return P;
}
