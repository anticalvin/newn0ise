// A measured ground grid: 1 m minor lines, 10 m major lines, drawn just above the flat ground. View aid only; never part of the authored scene geometry.
import * as THREE from 'three';
export class Grid {
  constructor(scene, terrain) {
    this.terrain = terrain; const half = 120, pos = [], col = [], minor = [0.30, 0.30, 0.29], major = [0.5, 0.5, 0.48];
    for (let i = -half; i <= half; i++) { const c = i % 10 === 0 ? major : minor; pos.push(-half, 0, i, half, 0, i, i, 0, -half, i, 0, half); for (let k = 0; k < 4; k++) col.push(...c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, fog: true, depthWrite: false })); this.mesh.visible = false; this.mesh.renderOrder = 2; this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  set(on) { this.mesh.visible = !!on; if (on) this.mesh.position.y = this.terrain.hAt(0, 0) + 0.03; }
  get on() { return this.mesh.visible; }
}
