// A small pool of real PointLights that are assigned each frame to the light anchors
// (lantern clusters, stalls...) nearest to the camera. Cheap "many lights" illusion.
import * as THREE from 'three';

export class LightPool {
  constructor(scene, { count = 6, color = 0xffa24a, intensity = 40, distance = 22, decay = 2 } = {}) {
    this.anchors = []; // { pos: Vector3, color?, intensity? }
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(color, 0, distance, decay);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.baseIntensity = intensity;
    this._tmp = [];
  }

  add(pos, { color = null, intensity = null } = {}) {
    this.anchors.push({ pos: pos.clone ? pos.clone() : new THREE.Vector3(...pos), color: color != null ? new THREE.Color(color) : null, intensity });
  }

  update(camera, time = 0) {
    const cp = camera.position;
    // camera forward (to prefer anchors in view)
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const arr = this._tmp;
    arr.length = 0;
    for (const a of this.anchors) {
      const dx = a.pos.x - cp.x, dy = a.pos.y - cp.y, dz = a.pos.z - cp.z;
      const d = Math.hypot(dx, dy, dz);
      const facing = (dx * f.x + dy * f.y + dz * f.z) / Math.max(d, 0.001);
      arr.push({ a, score: d * (facing > -0.2 ? 1 : 2.5) });
    }
    arr.sort((p, q) => p.score - q.score);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const it = arr[i];
      if (!it) { l.intensity = 0; continue; }
      l.position.copy(it.a.pos);
      if (it.a.color) l.color.copy(it.a.color);
      const flicker = 0.92 + 0.08 * Math.sin(time * 9 + i * 1.7) * Math.sin(time * 5.3 + i);
      // fade lights that are about to be swapped out (limits popping)
      const fade = THREE.MathUtils.clamp(1.4 - it.score / 90, 0, 1);
      l.intensity = (it.a.intensity ?? this.baseIntensity) * flicker * fade;
    }
  }
}
