// Stylized animated waterfall ribbon (scrolling streaks + foam) and falling-water mist.
import * as THREE from 'three';
import { FogState } from '../core/fog.js';

const vert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const frag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uFoam;
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_fragment>
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
void main() {
  vec2 uv = vUv;
  float streak = vn(vec2(uv.x * 24.0, uv.y * 3.0 + uTime * 2.2));
  streak = streak * 0.6 + vn(vec2(uv.x * 60.0, uv.y * 6.0 + uTime * 3.4)) * 0.4;
  float foam = smoothstep(0.15, 0.0, uv.y) + smoothstep(0.93, 1.0, uv.y) * 0.5;
  vec3 col = mix(uColor, uFoam, clamp(streak * 1.2 - 0.2 + foam, 0.0, 1.0));
  float edge = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
  float a = (0.75 + streak * 0.25) * edge;
  gl_FragColor = vec4(col * 1.25, a);
  #include <fog_fragment>
}
`;

/**
 * top: [x,y,z] lip of the fall, bottom: [x,y,z] base; width in meters. Slight outward curve.
 */
export function createWaterfall(top, bottom, width = 10, { color = 0x9fc7d8, foam = 0xffffff, heightAt = null } = {}) {
  const A = new THREE.Vector3(...top), B = new THREE.Vector3(...bottom);
  const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const segs = 40;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3().lerpVectors(A, B, t);
    if (!heightAt) p.addScaledVector(dir, Math.sin(t * Math.PI) * 2.0); // free fall arc
    for (const s of [-0.5, 0.5]) {
      const w = width * (1 + t * 0.35);
      const q = p.clone().addScaledVector(side, s * w);
      // cascade: hug the slope (never below the terrain)
      if (heightAt) q.y = Math.max(q.y, heightAt(q.x, q.z) + 0.45);
      pos.push(q.x, q.y, q.z);
      uv.push(s + 0.5, 1 - t);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uFoam: { value: new THREE.Color(foam) } }]),
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  Object.assign(mat.uniforms, FogState.uniforms());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'waterfall';
  mesh.renderOrder = 2;
  return {
    mesh,
    base: B,
    update(dt, fx) {
      mat.uniforms.uTime.value += dt;
      if (fx && Math.random() < dt * 40) {
        const o = side.clone().multiplyScalar((Math.random() - 0.5) * width * 1.3);
        fx.smoke.spawn({
          x: B.x + o.x, y: B.y + 0.5, z: B.z + o.z,
          vx: (Math.random() - 0.5) * 2 - dir.x * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2 - dir.z * 2,
          life: 2 + Math.random(), size: 2, size1: 6, r: 0.9, g: 0.95, b: 1.0, a: 0.28, a1: 0, drag: 0.8,
        });
      }
    },
  };
}
