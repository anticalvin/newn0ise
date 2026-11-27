// Shared GLSL: noise, analytic sky, aerial-perspective fog. Every material (terrain, water, foliage,
// rocks, character) uses the SAME sky function for fog, so the horizon always matches the sky.
import * as THREE from 'three';

export const NOISE_GLSL = /* glsl */`
float n0hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n0noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(n0hash(i),n0hash(i+vec2(1,0)),f.x),mix(n0hash(i+vec2(0,1)),n0hash(i+vec2(1,1)),f.x),f.y);}
float n0fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n0noise(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s;}
float n0fbm5(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n0noise(p);p=p*2.07+vec2(17.1,9.2);a*=.5;}return s;}
`;

export const SKY_GLSL = /* glsl */`
/* when the world is drawn into a post-processing target three leaves tone mapping to the output pass, so the fog colour is left linear here */
#ifndef TONE_MAPPING
vec3 toneMapping(vec3 c){ return c; }
#endif
uniform vec3 uSun; uniform float uCloud; uniform vec2 uCloudOff;
vec3 n0Sky(vec3 d, float disc, float clouds){
  float sunh = uSun.y;
  float dayAmt = smoothstep(-0.10, 0.28, sunh);
  float duskAmt = exp(-pow(sunh/0.22, 2.0));
  float night = 1.0 - smoothstep(-0.14, 0.04, sunh);
  vec3 zen = mix(vec3(0.004,0.007,0.024), vec3(0.055,0.16,0.40), dayAmt);
  vec3 hor = mix(vec3(0.010,0.016,0.040), vec3(0.40,0.50,0.60), dayAmt);
  float mu = max(dot(d, uSun), 0.0);
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(hor, zen, pow(up, 0.5));
  vec3 sunset = vec3(1.0, 0.36, 0.10);
  col += sunset * duskAmt * (pow(mu, 7.0) * 1.3 + pow(mu, 2.0) * 0.30 * (1.0 - up)) ;
  col += vec3(0.75, 0.28, 0.30) * duskAmt * 0.12 * pow(1.0 - up, 4.0);
  col += vec3(1.0, 0.80, 0.60) * pow(mu, 40.0) * 0.30 * dayAmt;
  if (disc > 0.5 && d.y > -0.02) col += vec3(1.0, 0.86, 0.66) * smoothstep(0.99955, 0.99985, mu) * 38.0 * smoothstep(-0.06, 0.02, sunh);
  col = mix(col, hor * 0.85, smoothstep(0.0, -0.14, d.y));
  if (night > 0.01 && d.y > 0.0) {
    vec3 q = d * 230.0; vec3 id = floor(q);
    float h = fract(sin(dot(id, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float st = step(0.9972, h) * smoothstep(0.0, 0.25, d.y);
    col += vec3(0.8, 0.86, 1.0) * st * smoothstep(0.38, 0.0, length(fract(q) - 0.5)) * night * 1.8;
    if (disc > 0.5) { float mm = max(dot(d, -uSun), 0.0); col += vec3(0.75, 0.82, 1.0) * smoothstep(0.9992, 0.9996, mm) * 2.6 * night; }
  }
  if (clouds > 0.5 && d.y > 0.0) {
    vec2 cp = d.xz / (d.y * 0.9 + 0.20) * 0.55 + uCloudOff;
    float c = n0fbm5(cp);
    float dens = smoothstep(1.0 - uCloud * 0.80 - 0.04, 1.0 - uCloud * 0.80 + 0.24, c);
    float c2 = n0fbm5(cp + uSun.xz * 0.20);
    float lit = clamp(0.55 + (c - c2) * 3.0, 0.0, 1.0);
    vec3 cl = mix(vec3(0.17, 0.19, 0.24), vec3(1.0, 0.96, 0.90), lit) * (0.10 + 0.90 * dayAmt);
    cl = mix(cl, cl * vec3(1.0, 0.52, 0.32) + vec3(0.30, 0.09, 0.02) * lit, duskAmt * 0.85);
    cl += vec3(0.03, 0.04, 0.07) * night;
    dens *= smoothstep(0.0, 0.16, d.y);
    col = mix(col, cl, dens * 0.93);
  }
  return col;
}
vec3 n0SkyFog(vec3 d){ return n0Sky(normalize(vec3(d.x, clamp(d.y, 0.0, 0.07), d.z)), 0.0, 0.0); }
`;

// Custom fog for MeshStandardMaterial: blend toward the analytic sky colour in the view direction.
const FOG_STD = /* glsl */`
#ifdef USE_FOG
  float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  vec3 n0wd = normalize(-vViewPosition * mat3(viewMatrix));
  vec3 n0fc = linearToOutputTexel(vec4(toneMapping(n0SkyFog(n0wd)), 1.0)).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, n0fc, fogFactor);
#endif
`;
export const FOG_WATER = /* glsl */`
#ifdef USE_FOG
  float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  vec3 n0fc = linearToOutputTexel(vec4(toneMapping(n0SkyFog(normalize(vW - cameraPosition))), 1.0)).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, n0fc, fogFactor);
#endif
`;

export function makeShared() {
  return {
    uSun: { value: new THREE.Vector3(-1, 0.1, 0) }, uCloud: { value: 0.35 }, uCloudOff: { value: new THREE.Vector2() },
    uTime: { value: 0 }, uWater: { value: 0 }, uSwash: { value: 0.35 }, uWind: { value: 0.5 },
  };
}

// Patch a MeshStandardMaterial: shared sky/fog + optional custom vertex/fragment snippets.
// hooks: vHead, vNormal (replaces beginnormal_vertex), vBegin (replaces begin_vertex), vAfter (appended after begin_vertex),
//        fHead, fColor (after color_fragment), fRough (replaces roughnessmap_fragment), fNormal (after normal_fragment_maps)
export function patchStandard(mat, shared, hooks = {}, key = 'std') {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, hooks.uniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + (hooks.vHead || ''))
      .replace('#include <beginnormal_vertex>', hooks.vNormal || '#include <beginnormal_vertex>')
      .replace('#include <begin_vertex>', (hooks.vBegin || '#include <begin_vertex>') + '\n' + (hooks.vAfter || ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL + SKY_GLSL + (hooks.fHead || ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (hooks.fColor || ''))
      .replace('#include <roughnessmap_fragment>', hooks.fRough || '#include <roughnessmap_fragment>')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (hooks.fNormal || ''))
      .replace('#include <fog_fragment>', FOG_STD);
  };
  mat.customProgramCacheKey = () => 'n0_' + key;
  return mat;
}
