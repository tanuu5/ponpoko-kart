// Instanced vegetation: chunked InstancedMeshes (frustum + distance culled) with a wind vertex shader.
import * as THREE from 'three';

export const WindTime = { value: 0 };

/** MeshStandardMaterial with wind sway on vertices (amount grows with local height). */
export function windMaterial(params, { amp = 0.35, key = 'wind' } = {}) {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WindTime;
    shader.uniforms.uWindAmp = { value: amp };
    shader.vertexShader = 'uniform float uTime;\nuniform float uWindAmp;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wIp = instanceMatrix[3].xyz;
        mat3 wIm = mat3(instanceMatrix);
      #else
        vec3 wIp = vec3(0.0);
        mat3 wIm = mat3(1.0);
      #endif
      vec3 wWp = (modelMatrix * vec4(wIp, 1.0)).xyz;
      float wHgt = max(position.y, 0.0);
      float wBend = wHgt * wHgt * uWindAmp;
      float wPh = uTime * 1.9 + wWp.x * 0.23 + wWp.z * 0.19;
      float wGust = 0.55 + 0.45 * sin(uTime * 0.7 + wWp.x * 0.025 + wWp.z * 0.02);
      vec3 wDir = vec3(0.8, 0.0, 0.35) * (sin(wPh) * 0.55 + 0.45) * wGust + vec3(0.0, 0.0, 0.25) * cos(wPh * 1.3);
      float wS2 = max(dot(wIm[0], wIm[0]), 1e-4);
      vec3 wLocal = vec3(dot(wIm[0], wDir), dot(wIm[1], wDir), dot(wIm[2], wDir)) / wS2;
      transformed += wLocal * wBend;`,
    );
  };
  mat.customProgramCacheKey = () => key + amp;
  return mat;
}

/** A tuft of tapered blades. Normals are biased upward for soft, even lighting. */
export function tuftGeometry({ blades = 7, height = 0.45, spread = 0.12, width = 0.035, seed = 1, colorBase = [0.18, 0.3, 0.08], colorTip = [0.55, 0.72, 0.25], lean = 0.25 } = {}) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = [], col = [], nor = [];
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2;
    const h = height * (0.65 + r() * 0.5);
    const bx = Math.cos(a) * spread * r(), bz = Math.sin(a) * spread * r();
    const lx = Math.cos(a) * lean * h, lz = Math.sin(a) * lean * h;
    const px = -Math.sin(a) * width, pz = Math.cos(a) * width;
    const mx = bx + lx * 0.45, mz = bz + lz * 0.45;
    // two segments: base quad + tip triangle
    const v = [
      [bx - px, 0, bz - pz], [bx + px, 0, bz + pz], [mx + px * 0.7, h * 0.55, mz + pz * 0.7], [mx - px * 0.7, h * 0.55, mz - pz * 0.7],
      [bx + lx, h, bz + lz],
    ];
    const tri = (i, j, k) => {
      for (const q of [i, j, k]) {
        pos.push(...v[q]);
        const t = v[q][1] / h;
        col.push(colorBase[0] + (colorTip[0] - colorBase[0]) * t, colorBase[1] + (colorTip[1] - colorBase[1]) * t, colorBase[2] + (colorTip[2] - colorBase[2]) * t);
        nor.push(Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3);
      }
    };
    tri(0, 1, 2);
    tri(0, 2, 3);
    tri(3, 2, 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Merge several copies of a geometry along local X (a row of plants). */
export function rowGeometry(unit, count, spacing, jitter = 0.06, seed = 3) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const g = unit.clone();
    g.rotateY(r() * Math.PI * 2);
    const sc = 0.85 + r() * 0.3;
    g.scale(sc, sc * (0.9 + r() * 0.2), sc);
    g.translate((i - (count - 1) / 2) * spacing + (r() - 0.5) * jitter, 0, (r() - 0.5) * jitter);
    parts.push(g);
  }
  return mergeSimple(parts);
}

function mergeSimple(geos) {
  const attrs = ['position', 'normal', 'color'];
  const out = new THREE.BufferGeometry();
  for (const a of attrs) {
    if (!geos[0].attributes[a]) continue;
    const n = geos.reduce((acc, g) => acc + g.attributes[a].array.length, 0);
    const arr = new Float32Array(n);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[a].array, o);
      o += g.attributes[a].array.length;
    }
    out.setAttribute(a, new THREE.BufferAttribute(arr, geos[0].attributes[a].itemSize));
  }
  return out;
}

/**
 * Collects instance transforms into spatial chunks and builds one InstancedMesh per chunk.
 */
export class ScatterField {
  constructor(geometry, material, { chunk = 40, maxDist = 90, layer = 1, castShadow = false, receiveShadow = true, name = 'scatter' } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.chunk = chunk;
    this.maxDist = maxDist;
    this.layer = layer;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.name = name;
    this.buckets = new Map();
    this.meshes = [];
    this.count = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  add(x, y, z, rotY = 0, scale = 1, scaleY = null) {
    const key = `${Math.floor(x / this.chunk)},${Math.floor(z / this.chunk)}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = []));
    this._q.setFromEuler(this._e.set(0, rotY, 0));
    this._m.compose(this._p.set(x, y, z), this._q, this._s.set(scale, scaleY ?? scale, scale));
    b.push(this._m.clone());
    this.count++;
  }

  build(parent) {
    this.group = new THREE.Group();
    this.group.name = this.name;
    for (const [key, mats] of this.buckets) {
      const im = new THREE.InstancedMesh(this.geometry, this.material, mats.length);
      for (let i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = this.castShadow;
      im.receiveShadow = this.receiveShadow;
      im.layers.set(this.layer);
      im.matrixAutoUpdate = false;
      const [cx, cz] = key.split(',').map(Number);
      im.userData.center = new THREE.Vector3((cx + 0.5) * this.chunk, 0, (cz + 0.5) * this.chunk);
      this.meshes.push(im);
      this.group.add(im);
    }
    this.buckets.clear();
    parent.add(this.group);
    return this.group;
  }

  update(camera) {
    const cx = camera.position.x, cz = camera.position.z;
    const md = this.maxDist + this.chunk * 0.71;
    for (const m of this.meshes) {
      const c = m.userData.center;
      const dx = c.x - cx, dz = c.z - cz;
      m.visible = dx * dx + dz * dz < md * md;
    }
  }
}
