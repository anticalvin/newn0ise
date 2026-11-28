// Live-tunable constants. Every value here is read each frame/step by actor.js, camera.js, combat.js, so sliders in the Tune panel take effect instantly.
// SCHEMA drives the panel: [key, label, min, max, step]. Defaults are the shipped feel.
export const TUNE = {
  walk: 2.5, run: 5.7, accel: 34, decel: 42, airAccel: 7, dodgeSpeed: 9.5,
  jump: 7.4, gUp: 20, gCut: 36, gDown: 32, coyote: 0.12, jbuf: 0.14,
  dmg: 1, foeDmg: 1, kb: 1, hitstop: 1, slowmo: 1, ai: 1, god: 0, timeScale: 1,
  carEngine: 3200, carReverse: 1800, carTop: 38, carBrake: 1400, carStiff: 20, carDamp: 1.8, carRelax: 2.4, carSlipF: 4.0, carSlipR: 3.6, carSide: 0.55, carSteer: 0.55,
  camFollow: 0.09, camFollowY: 0.2, camRot: 28, camZoom: 9, fov: 58, shake: 1,
};
export const DEFAULTS = { ...TUNE };
export const SCHEMA = {
  'Locomotion': [['walk', 'Walk speed', 1, 5, 0.05], ['run', 'Run speed', 3, 10, 0.05], ['accel', 'Acceleration', 8, 80, 1], ['decel', 'Deceleration', 8, 80, 1], ['airAccel', 'Air control', 0, 30, 0.5], ['dodgeSpeed', 'Dodge speed', 4, 18, 0.1]],
  'Jump': [['jump', 'Jump speed', 4, 12, 0.1], ['gUp', 'Gravity (held)', 8, 40, 1], ['gCut', 'Gravity (released)', 12, 70, 1], ['gDown', 'Gravity (falling)', 12, 60, 1], ['coyote', 'Coyote time', 0, 0.3, 0.01], ['jbuf', 'Jump buffer', 0, 0.3, 0.01]],
  'Combat feel': [['dmg', 'Your damage ×', 0.2, 4, 0.05], ['foeDmg', 'Enemy damage ×', 0, 4, 0.05], ['kb', 'Knockback ×', 0, 3, 0.05], ['hitstop', 'Hit-stop ×', 0, 3, 0.05], ['slowmo', 'Parry slow-mo ×', 0, 2, 0.05]],
  'Camera': [['camFollow', 'Follow lag (s)', 0.01, 0.4, 0.01], ['camFollowY', 'Vertical lag (s)', 0.01, 0.6, 0.01], ['camRot', 'Orbit smoothing', 4, 60, 1], ['camZoom', 'Zoom smoothing', 2, 30, 0.5], ['fov', 'Field of view', 35, 90, 1], ['shake', 'Shake ×', 0, 3, 0.05]],
  'Vehicle': [['carEngine', 'Engine force', 1500, 9000, 100], ['carReverse', 'Reverse force', 800, 5000, 100], ['carTop', 'Top speed (m/s)', 12, 70, 1], ['carBrake', 'Brake force', 400, 4000, 50], ['carStiff', 'Suspension stiffness', 8, 80, 1], ['carDamp', 'Damping (compression)', 0.5, 8, 0.1], ['carRelax', 'Damping (relaxation)', 0.5, 8, 0.1], ['carSlipF', 'Friction slip, front', 1, 10, 0.1], ['carSlipR', 'Friction slip, rear', 1, 10, 0.1], ['carSide', 'Side friction stiffness', 0.1, 2, 0.05], ['carSteer', 'Max steer (rad)', 0.2, 0.9, 0.01]],
  'World': [['timeScale', 'Time scale', 0.1, 1.5, 0.05]],
};
