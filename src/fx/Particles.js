// Instanced billboard particle system (CPU simulated, GPU drawn in one call per system).
import * as THREE from 'three';
import { FogState } from '../core/fog.js';

const vert = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec3 iMisc;   // size, rotation, stretch
attribute vec3 iVel;
varying vec4 vCol;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = position.xy + 0.5;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  float size = iMisc.x;
  vec2 corner = position.xy;
#ifdef SPARK
  vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
  float vl = length(vv.xy);
  vec2 dir = vl > 1e-4 ? vv.xy / vl : vec2(0.0, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float st = 1.0 + iMisc.z * vl;
  corner = dir * position.y * st + perp * position.x;
#else
  float c = cos(iMisc.y), s = sin(iMisc.y);
  corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
#endif
  mvPosition.xy += corner * size;
  gl_Position = projectionMatrix * mvPosition;
  vCol = iCol;
  #include <fog_vertex>
}
`;

const frag = /* glsl */ `
uniform float uIntensity;
varying vec4 vCol;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec2 p = vUv - 0.5;
  float a;
#if defined(PETAL)
  // petal: notched ellipse
  vec2 q = vec2(p.x * 1.6, p.y);
  float e = length(q) * 2.0;
  float notch = smoothstep(0.08, 0.0, abs(p.x)) * smoothstep(0.2, 0.45, p.y);
  a = smoothstep(1.0, 0.85, e) * (1.0 - notch);
  vec3 col = vCol.rgb * (0.85 + 0.3 * (0.5 - p.y));
#elif defined(RING)
  float r = length(p) * 2.0;
  a = smoothstep(1.0, 0.8, r) * smoothstep(0.55, 0.8, r);
  vec3 col = vCol.rgb;
#elif defined(SPARK)
  float r = length(p * vec2(2.2, 1.0)) * 2.0;
  a = smoothstep(1.0, 0.0, r);
  a = a * a;
  vec3 col = vCol.rgb;
#else
  float r = length(p) * 2.0;
  a = smoothstep(1.0, 0.0, r);
  a *= a * (3.0 - 2.0 * a);
  vec3 col = vCol.rgb;
#endif
  a *= vCol.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * uIntensity, a);
  #include <fog_fragment>
}
`;

export class Particles {
  /**
   * @param {number} max
   * @param {{ additive?: boolean, shape?: 'soft'|'spark'|'petal'|'ring', intensity?: number, fog?: boolean, renderOrder?: number }} o
   */
  constructor(max = 2000, o = {}) {
    this.max = max;
    this.count = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    this.geo = geo;
    const defines = {};
    if (o.shape === 'spark') defines.SPARK = '';
    if (o.shape === 'petal') defines.PETAL = '';
    if (o.shape === 'ring') defines.RING = '';
    const fog = o.fog !== false;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uIntensity: { value: o.intensity ?? 1 } }]),
      vertexShader: vert,
      fragmentShader: frag,
      defines,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog,
      side: THREE.DoubleSide,
    });
    Object.assign(this.mat.uniforms, FogState.uniforms());
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder ?? 10;
    // simulation state (SoA)
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.cr = new Float32Array(max); this.cg = new Float32Array(max); this.cb = new Float32Array(max);
    this.a0 = new Float32Array(max); this.a1 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.rot = new Float32Array(max); this.vrot = new Float32Array(max);
    this.stretch = new Float32Array(max);
    this.flutter = new Float32Array(max);
    this.floorY = new Float32Array(max);
  }

  spawn(p) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.px[i] = p.x; this.py[i] = p.y; this.pz[i] = p.z;
    this.vx[i] = p.vx || 0; this.vy[i] = p.vy || 0; this.vz[i] = p.vz || 0;
    this.life[i] = p.life || 1; this.age[i] = 0;
    this.s0[i] = p.size ?? 0.5; this.s1[i] = p.size1 ?? this.s0[i];
    this.cr[i] = p.r ?? 1; this.cg[i] = p.g ?? 1; this.cb[i] = p.b ?? 1;
    this.a0[i] = p.a ?? 1; this.a1[i] = p.a1 ?? 0;
    this.grav[i] = p.grav ?? 0; this.drag[i] = p.drag ?? 0;
    this.rot[i] = p.rot ?? Math.random() * 6.28; this.vrot[i] = p.vrot ?? 0;
    this.stretch[i] = p.stretch ?? 0.05;
    this.flutter[i] = p.flutter ?? 0;
    this.floorY[i] = p.floorY ?? -1e9;
  }

  _kill(i) {
    const j = --this.count;
    if (i === j) return;
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.life[i] = this.life[j]; this.age[i] = this.age[j];
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.cr[i] = this.cr[j]; this.cg[i] = this.cg[j]; this.cb[i] = this.cb[j];
    this.a0[i] = this.a0[j]; this.a1[i] = this.a1[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
    this.rot[i] = this.rot[j]; this.vrot[i] = this.vrot[j];
    this.stretch[i] = this.stretch[j]; this.flutter[i] = this.flutter[j]; this.floorY[i] = this.floorY[j];
  }

  update(dt, time = 0) {
    const P = this.aPos.array, C = this.aCol.array, M = this.aMisc.array, V = this.aVel.array;
    let i = 0;
    while (i < this.count) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this._kill(i);
        continue;
      }
      const k = this.age[i] / this.life[i];
      const drag = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= drag; this.vy[i] *= drag; this.vz[i] *= drag;
      this.vy[i] -= this.grav[i] * dt;
      if (this.flutter[i] > 0) {
        const f = this.flutter[i];
        this.vx[i] += Math.sin(time * 2.1 + i * 1.7) * f * dt;
        this.vz[i] += Math.cos(time * 1.7 + i * 2.3) * f * dt;
      }
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.floorY[i]) {
        this.py[i] = this.floorY[i];
        this.vy[i] *= -0.3;
        this.vx[i] *= 0.6;
        this.vz[i] *= 0.6;
      }
      this.rot[i] += this.vrot[i] * dt;
      const i3 = i * 3, i4 = i * 4;
      P[i3] = this.px[i]; P[i3 + 1] = this.py[i]; P[i3 + 2] = this.pz[i];
      V[i3] = this.vx[i]; V[i3 + 1] = this.vy[i]; V[i3 + 2] = this.vz[i];
      C[i4] = this.cr[i]; C[i4 + 1] = this.cg[i]; C[i4 + 2] = this.cb[i];
      C[i4 + 3] = this.a0[i] + (this.a1[i] - this.a0[i]) * k;
      M[i3] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      M[i3 + 1] = this.rot[i];
      M[i3 + 2] = this.stretch[i];
      i++;
    }
    this.geo.instanceCount = this.count;
    if (this.count > 0) {
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aMisc.needsUpdate = true;
      this.aVel.needsUpdate = true;
      this.aPos.clearUpdateRanges();
      this.aPos.addUpdateRange(0, this.count * 3);
      this.aCol.clearUpdateRanges();
      this.aCol.addUpdateRange(0, this.count * 4);
      this.aMisc.clearUpdateRanges();
      this.aMisc.addUpdateRange(0, this.count * 3);
      this.aVel.clearUpdateRanges();
      this.aVel.addUpdateRange(0, this.count * 3);
    }
  }

  clear() {
    this.count = 0;
    this.geo.instanceCount = 0;
  }
}

/** Bundle of the particle systems used in races + convenience emitters. */
export class FX {
  constructor(scene) {
    this.sparks = new Particles(3000, { additive: true, shape: 'spark', intensity: 3.0, renderOrder: 12 });
    this.glow = new Particles(1500, { additive: true, shape: 'soft', intensity: 2.0, renderOrder: 12 });
    this.smoke = new Particles(2500, { additive: false, shape: 'soft', intensity: 1.0, renderOrder: 11 });
    this.petals = new Particles(2500, { additive: false, shape: 'petal', intensity: 1.0, renderOrder: 11 });
    this.rings = new Particles(200, { additive: true, shape: 'ring', intensity: 2.0, renderOrder: 12 });
    this.fireworks = new Particles(6000, { additive: true, shape: 'spark', intensity: 4.0, fog: false, renderOrder: 13 });
    this.systems = [this.sparks, this.glow, this.smoke, this.petals, this.rings, this.fireworks];
    for (const s of this.systems) scene.add(s.mesh);
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    for (const s of this.systems) s.update(dt, this.time);
  }

  clear() {
    for (const s of this.systems) s.clear();
  }

  dispose(scene) {
    for (const s of this.systems) {
      scene.remove(s.mesh);
      s.geo.dispose();
      s.mat.dispose();
    }
  }

  // ---- emitters ----
  driftSparks(pos, dirX, dirZ, level, sideX, sideZ) {
    const col = level >= 3 ? [1.0, 0.35, 1.0] : level === 2 ? [1.0, 0.55, 0.12] : level === 1 ? [0.3, 0.6, 1.0] : [1, 0.9, 0.6];
    const n = level > 0 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const sp = 3 + Math.random() * 5;
      this.sparks.spawn({
        x: pos.x, y: pos.y + 0.08, z: pos.z,
        vx: -dirX * sp + sideX * (Math.random() * 3) + (Math.random() - 0.5) * 2,
        vy: 1.5 + Math.random() * 3.5,
        vz: -dirZ * sp + sideZ * (Math.random() * 3) + (Math.random() - 0.5) * 2,
        life: 0.25 + Math.random() * 0.25, size: level > 0 ? 0.09 : 0.06, size1: 0.02,
        r: col[0], g: col[1], b: col[2], a: 1, a1: 0.2, grav: 14, drag: 2, stretch: 0.06,
      });
    }
    if (level > 0 && Math.random() < 0.6) {
      this.glow.spawn({
        x: pos.x, y: pos.y + 0.15, z: pos.z, life: 0.12, size: 0.5 + level * 0.12, size1: 0.2,
        r: col[0], g: col[1], b: col[2], a: 0.8, a1: 0,
      });
    }
  }

  boostFlame(pos, dirX, dirZ, strength = 1, color = [1, 0.55, 0.15]) {
    this.glow.spawn({
      x: pos.x + (Math.random() - 0.5) * 0.05, y: pos.y + (Math.random() - 0.5) * 0.05, z: pos.z + (Math.random() - 0.5) * 0.05,
      vx: -dirX * (4 + Math.random() * 3), vy: 0.4, vz: -dirZ * (4 + Math.random() * 3),
      life: 0.14 + Math.random() * 0.08, size: 0.32 * strength, size1: 0.08,
      r: color[0], g: color[1], b: color[2], a: 0.9, a1: 0,
    });
  }

  dust(pos, color = [0.55, 0.45, 0.35], amount = 1, vel = null) {
    for (let i = 0; i < amount; i++) {
      this.smoke.spawn({
        x: pos.x + (Math.random() - 0.5) * 0.6, y: pos.y + 0.15, z: pos.z + (Math.random() - 0.5) * 0.6,
        vx: (vel ? vel.x * 0.2 : 0) + (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random() * 1.0, vz: (vel ? vel.z * 0.2 : 0) + (Math.random() - 0.5) * 1.5,
        life: 0.7 + Math.random() * 0.6, size: 0.5, size1: 1.8 + Math.random(),
        r: color[0], g: color[1], b: color[2], a: 0.35, a1: 0, drag: 1.5, vrot: (Math.random() - 0.5) * 2,
      });
    }
  }

  splash(pos, amount = 6, strength = 1) {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 3) * strength;
      this.sparks.spawn({
        x: pos.x, y: pos.y + 0.1, z: pos.z,
        vx: Math.cos(a) * sp, vy: (3 + Math.random() * 4) * strength, vz: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.3, size: 0.07, size1: 0.05,
        r: 0.35, g: 0.42, b: 0.5, a: 0.9, a1: 0.0, grav: 16, stretch: 0.05,
      });
    }
    this.smoke.spawn({
      x: pos.x, y: pos.y + 0.2, z: pos.z, vy: 1.2, life: 0.5, size: 0.6, size1: 2.2,
      r: 0.85, g: 0.88, b: 0.92, a: 0.35, a1: 0,
    });
  }

  burst(pos, color = [1, 0.9, 0.5], n = 24, speed = 6, size = 0.12) {
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = speed * (0.6 + Math.random() * 0.6);
      this.sparks.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: r * Math.cos(th) * sp, vy: u * sp + 2, vz: r * Math.sin(th) * sp,
        life: 0.4 + Math.random() * 0.4, size, size1: 0.02,
        r: color[0], g: color[1], b: color[2], a: 1, a1: 0, grav: 6, drag: 2.5, stretch: 0.05,
      });
    }
    this.rings.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.35, size: 0.4, size1: 4, r: color[0], g: color[1], b: color[2], a: 0.9, a1: 0 });
  }

  /** Big firework shell burst in the sky. */
  firework(pos, color, style = 'peony') {
    const n = style === 'willow' ? 200 : 280;
    const speed = style === 'willow' ? 22 : 34;
    const col2 = [Math.min(1, color[0] + 0.4), Math.min(1, color[1] + 0.4), Math.min(1, color[2] + 0.4)];
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = speed * (0.85 + Math.random() * 0.3);
      const c = Math.random() < 0.3 ? col2 : color;
      this.fireworks.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: r * Math.cos(th) * sp, vy: u * sp, vz: r * Math.sin(th) * sp,
        life: style === 'willow' ? 2.8 + Math.random() * 0.8 : 1.6 + Math.random() * 0.6,
        size: style === 'willow' ? 1.8 : 2.4, size1: 0.6,
        r: c[0], g: c[1], b: c[2], a: 1, a1: 0,
        grav: style === 'willow' ? 5 : 3, drag: style === 'willow' ? 1.4 : 1.6, stretch: 0.09,
      });
    }
    this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.35, size: 18, size1: 34, r: color[0], g: color[1], b: color[2], a: 0.35, a1: 0 });
  }

  confetti(pos, n = 80) {
    const cols = [[1, 0.3, 0.3], [1, 0.85, 0.2], [0.3, 0.7, 1], [0.4, 0.95, 0.5], [1, 0.5, 0.85]];
    for (let i = 0; i < n; i++) {
      const c = cols[i % cols.length];
      this.petals.spawn({
        x: pos.x + (Math.random() - 0.5) * 3, y: pos.y + 2 + Math.random() * 2, z: pos.z + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 8, vy: 4 + Math.random() * 6, vz: (Math.random() - 0.5) * 8,
        life: 2.5 + Math.random() * 1.5, size: 0.22, size1: 0.22,
        r: c[0], g: c[1], b: c[2], a: 1, a1: 0.8, grav: 5, drag: 1.8, vrot: (Math.random() - 0.5) * 10, flutter: 3,
      });
    }
  }
}
