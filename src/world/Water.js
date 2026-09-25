// Water: planar-reflection capable water surfaces (rice paddies "水鏡", rivers, ponds).
import * as THREE from 'three';
import { FogState } from '../core/fog.js';

/** Renders a mirrored view of the scene about the plane y = height into a texture. */
export class PlanarReflection {
  constructor(height, { scale = 0.5 } = {}) {
    this.height = height;
    this.scale = scale;
    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 0 });
    this.target.texture.generateMipmaps = false;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.set(0); // layer 1 (small vegetation) is not reflected
    this.textureMatrix = new THREE.Matrix4();
    this.enabled = true;
    this.hide = []; // objects hidden during the reflection render
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._size = new THREE.Vector2();
  }

  update(renderer, scene, camera) {
    if (!this.enabled) return;
    // wait until the main pass has created the shadow maps (reflection reuses them)
    if ((this._frames = (this._frames || 0) + 1) < 3) return;
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(16, Math.floor(this._size.x * this.scale));
    const h = Math.max(16, Math.floor(this._size.y * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    const H = this.height;
    const cam = this.camera;
    camera.updateMatrixWorld();
    if (camera.position.y < H) return;
    // mirror camera
    cam.position.copy(camera.position);
    cam.position.y = 2 * H - camera.position.y;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    dir.y = -dir.y;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    up.y = -up.y;
    cam.up.copy(up);
    cam.lookAt(cam.position.clone().add(dir));
    cam.fov = camera.fov;
    cam.aspect = camera.aspect;
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // texture matrix (world -> reflection uv)
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix);
    this.textureMatrix.multiply(cam.matrixWorldInverse);
    // oblique near plane = water plane
    this._plane.set(new THREE.Vector3(0, 1, 0), -H);
    this._plane.applyMatrix4(cam.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = cam.projectionMatrix;
    const q = this._q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x;
    pm.elements[6] = clip.y;
    pm.elements[10] = clip.z + 1.0 - 0.003;
    pm.elements[14] = clip.w;
    cam.projectionMatrixInverse.copy(pm).invert();

    const vis = this.hide.map((o) => o.visible);
    for (const o of this.hide) o.visible = false;
    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    FogState.updateCamera(cam);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevAuto;
    this.hide.forEach((o, i) => (o.visible = vis[i]));
    FogState.updateCamera(camera);
  }
}

const waterVert = /* glsl */ `
attribute float depth;
uniform mat4 uReflMatrix;
varying vec3 vWorld;
varying vec4 vRefl;
varying float vDepth;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vRefl = uReflMatrix * wp;
  vDepth = depth;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const waterFrag = /* glsl */ `
uniform sampler2D tRefl;
uniform float uUseRefl;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uReflStrength;
uniform float uWaveAmp;
uniform float uWaveScale;
uniform float uFlow;
uniform vec2 uFlowDir;
uniform float uRows;       // rice rows pattern amount (paddies)
uniform vec3 uRowColor;
uniform float uEdgeFade;
uniform float uSpecular;
varying vec3 vWorld;
varying vec4 vRefl;
varying float vDepth;
#include <fog_pars_fragment>

float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }

vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 q = p * uWaveScale + uFlowDir * t * uFlow;
  // a few directional sines
  vec2 d1 = normalize(vec2(1.0, 0.3)), d2 = normalize(vec2(-0.4, 1.0)), d3 = normalize(vec2(0.7, -0.8));
  float w = vn(q * 0.35 + t * 0.05); // break up regularity
  g += d1 * cos(dot(q, d1) * 1.7 + t * 1.3 + w * 6.0) * 0.22;
  g += d2 * cos(dot(q, d2) * 2.9 - t * 1.7 + w * 4.0) * 0.14;
  g += d3 * cos(dot(q, d3) * 4.3 + t * 2.3) * 0.08;
  // noise ripples (two octaves)
  float e = 0.05;
  vec2 r = q * 3.0 + vec2(t * 0.4, -t * 0.3);
  float n0 = vn(r);
  g += vec2(vn(r + vec2(e, 0.0)) - n0, vn(r + vec2(0.0, e)) - n0) / e * 0.16;
  vec2 r2 = q * 7.0 + vec2(-t * 0.7, t * 0.5);
  float m0 = vn(r2);
  g += vec2(vn(r2 + vec2(e, 0.0)) - m0, vn(r2 + vec2(0.0, e)) - m0) / e * 0.07;
  return g * uWaveAmp;
}

void main() {
  vec2 g = waveGrad(vWorld.xz, uTime);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float ndv = max(dot(n, v), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  vec3 refl;
  if (uUseRefl > 0.5) {
    vec2 uv = vRefl.xy / max(vRefl.w, 1e-4) + n.xz * 0.035;
    refl = texture2D(tRefl, uv).rgb;
  } else {
    float ry = max(r.y, 0.0);
    refl = mix(uSkyHorizon, uSkyTop, pow(ry, 0.5));
  }
  float dep = max(vDepth, 0.0);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 2.0, dep));
  float reflAmt = clamp(uReflStrength * (0.35 + 0.65 * fres), 0.0, 1.0);
  vec3 col = mix(body, refl, reflAmt);
  // rice rows (paddies): seedlings interrupt the mirror
  if (uRows > 0.0) {
    float row = abs(fract(vWorld.x * 1.6) - 0.5);
    float plant = smoothstep(0.12, 0.02, row) * (0.6 + 0.4 * vn(vWorld.xz * 2.3));
    float dist = length(cameraPosition - vWorld);
    plant *= smoothstep(25.0, 60.0, dist) * uRows; // near: real 3D plants
    col = mix(col, uRowColor, plant * 0.75);
  }
  // sun glitter
  vec3 hv = normalize(uSunDir + v);
  float spec = pow(max(dot(n, hv), 0.0), 350.0) * 6.0 + pow(max(dot(n, hv), 0.0), 40.0) * 0.12;
  col += uSunColor * spec * uSpecular;
  float alpha = uEdgeFade > 0.0 ? smoothstep(0.0, uEdgeFade, dep) : 1.0;
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

export function createWaterMaterial(o = {}) {
  const c = (x) => new THREE.Color(x);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        tRefl: { value: null },
        uReflMatrix: { value: new THREE.Matrix4() },
        uUseRefl: { value: 0 },
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: c(o.sunColor ?? 0xffe0b0) },
        uDeep: { value: c(o.deep ?? 0x16323a) },
        uShallow: { value: c(o.shallow ?? 0x3a4a3a) },
        uSkyTop: { value: c(o.skyTop ?? 0x5577aa) },
        uSkyHorizon: { value: c(o.skyHorizon ?? 0xffc090) },
        uReflStrength: { value: o.reflStrength ?? 0.9 },
        uWaveAmp: { value: o.waveAmp ?? 0.08 },
        uWaveScale: { value: o.waveScale ?? 0.9 },
        uFlow: { value: o.flow ?? 0 },
        uFlowDir: { value: new THREE.Vector2(...(o.flowDir || [1, 0])) },
        uRows: { value: o.rows ?? 0 },
        uRowColor: { value: c(o.rowColor ?? 0x4f7a2a) },
        uEdgeFade: { value: o.edgeFade ?? 0.12 },
        uSpecular: { value: o.specular ?? 1 },
      },
    ]),
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  Object.assign(mat.uniforms, FogState.uniforms());
  return mat;
}

/**
 * Build a water surface mesh at height `level` over the area where terrain is below the water.
 * include(x,z) optional predicate to restrict the region.
 */
export function buildWaterMesh(terrain, level, { minX, maxX, minZ, maxZ, cell = 4, include = null, material }) {
  const nx = Math.ceil((maxX - minX) / cell) + 1;
  const nz = Math.ceil((maxZ - minZ) / cell) + 1;
  const pos = [];
  const dep = [];
  const idx = [];
  const map = new Int32Array(nx * nz).fill(-1);
  const H = new Float32Array(nx * nz);
  const ok = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = minX + i * cell, z = minZ + j * cell;
      const h = terrain.heightAt(x, z);
      H[j * nx + i] = h;
      ok[j * nx + i] = include ? (include(x, z) ? 1 : 0) : 1;
    }
  }
  const vert = (i, j) => {
    const k = j * nx + i;
    if (map[k] >= 0) return map[k];
    map[k] = pos.length / 3;
    pos.push(minX + i * cell, level, minZ + j * cell);
    dep.push(level - H[k]);
    return map[k];
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const ks = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1];
      let anyBelow = false;
      let allOk = true;
      for (const k of ks) {
        if (H[k] < level - 0.02) anyBelow = true;
        if (!ok[k]) allOk = false;
      }
      if (!anyBelow || !allOk) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('depth', new THREE.Float32BufferAttribute(dep, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return mesh;
}

/** Small helper that owns a set of water meshes, their reflection and per-frame updates. */
export class WaterSystem {
  constructor(renderer, scene, sunDir, { reflection = true, reflectionHeight = 0, reflectionScale = 0.5 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.materials = [];
    this.meshes = [];
    this.sunDir = sunDir;
    this.reflection = reflection ? new PlanarReflection(reflectionHeight, { scale: reflectionScale }) : null;
    this.time = 0;
  }

  add(mesh, { reflect = false } = {}) {
    this.scene.add(mesh);
    this.meshes.push(mesh);
    const m = mesh.material;
    if (!this.materials.includes(m)) this.materials.push(m);
    m.uniforms.uSunDir.value.copy(this.sunDir);
    if (reflect && this.reflection) {
      m.uniforms.tRefl.value = this.reflection.target.texture;
      m.uniforms.uReflMatrix.value = this.reflection.textureMatrix;
      m.uniforms.uUseRefl.value = 1;
    }
    if (this.reflection) this.reflection.hide.push(mesh);
    return mesh;
  }

  /** Hook for the scene pass (called before the main render). */
  beforeRender(renderer, camera) {
    if (this.reflection) this.reflection.update(renderer, this.scene, camera);
  }

  update(dt) {
    this.time += dt;
    for (const m of this.materials) m.uniforms.uTime.value = this.time;
  }

  dispose() {
    if (this.reflection) this.reflection.target.dispose();
    for (const m of this.materials) m.dispose();
  }
}
