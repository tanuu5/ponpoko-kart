// Static prop instancing: each prototype Group is flattened and merged per material once,
// then drawn with InstancedMesh (split into spatial chunks for frustum culling).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/** Flatten a prop hierarchy into { material -> merged geometry, cast, receive }. */
export function flattenByMaterial(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (o.visible === false) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let geo = o.geometry;
    _m.multiplyMatrices(_inv, o.matrixWorld);
    if (Array.isArray(o.material) && geo.groups.length) {
      // split multi-material geometry by groups
      for (const grp of geo.groups) {
        const mat = mats[grp.materialIndex];
        const sub = extractGroup(geo, grp);
        push(buckets, mat, sub.applyMatrix4(_m), o);
      }
      return;
    }
    push(buckets, mats[0], geo.clone().applyMatrix4(_m), o);
  });
  const out = [];
  for (const [mat, b] of buckets) {
    const geos = normalizeAttributes(b.geos);
    let merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) {
      console.warn('[Instancer] merge failed for material', mat.name);
      continue;
    }
    merged.computeBoundingSphere();
    out.push({ material: mat, geometry: merged, cast: b.cast > 0, receive: b.receive > 0 });
  }
  return out;
}

function push(buckets, mat, geo, o) {
  let b = buckets.get(mat);
  if (!b) buckets.set(mat, (b = { geos: [], cast: 0, receive: 0 }));
  b.geos.push(geo);
  if (o.castShadow) b.cast++;
  if (o.receiveShadow) b.receive++;
}

function extractGroup(geo, grp) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const start = geo.index ? grp.start : grp.start;
  const count = grp.count;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}

/** Make all geometries share the same attribute set (position, normal, uv[, color]) and indexing. */
function normalizeAttributes(geos) {
  const wantColor = geos.some((g) => g.attributes.color);
  // keep RGBA vertex colours when present (some materials alpha-test on vertex alpha)
  const colorSize = wantColor ? Math.max(...geos.map((g) => (g.attributes.color ? g.attributes.color.itemSize : 3))) : 3;
  return geos.map((g0) => {
    let g = g0.index ? g0.toNonIndexed() : g0;
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const keep = new Set(['position', 'normal', 'uv']);
    if (wantColor) {
      keep.add('color');
      const src = g.attributes.color;
      if (!src || src.itemSize !== colorSize || src.normalized || !(src.array instanceof Float32Array)) {
        const c = new Float32Array(n * colorSize).fill(1);
        if (src) {
          for (let i = 0; i < n; i++) {
            c[i * colorSize] = src.getX(i);
            c[i * colorSize + 1] = src.getY(i);
            c[i * colorSize + 2] = src.getZ(i);
            if (colorSize === 4) c[i * colorSize + 3] = src.itemSize === 4 ? src.getW(i) : 1;
          }
        }
        g.setAttribute('color', new THREE.BufferAttribute(c, colorSize));
      }
    }
    for (const name of Object.keys(g.attributes)) if (!keep.has(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    return g;
  });
}

export class PropInstancer {
  constructor({ chunk = 160 } = {}) {
    this.chunk = chunk;
    this.protos = new Map(); // key -> { parts, placements: [] }
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.colliders = [];
  }

  /**
   * Register placement of a prop. `factory` is only called the first time a key is seen.
   * transform: { x, y, z, rotY, scale } ; collider radius taken from the prop's userData.collider.
   */
  add(key, factory, { x, y, z, rotY = 0, scale = 1, collide = true }) {
    let p = this.protos.get(key);
    if (!p) {
      let proto;
      try {
        proto = factory();
      } catch (e) {
        console.warn('[Instancer] prop factory failed:', key, e);
        proto = null;
      }
      if (proto && !proto.isObject3D) proto = proto.group || proto.root || null;
      p = { parts: proto ? flattenByMaterial(proto) : [], placements: [], collider: proto && proto.userData ? proto.userData.collider : null };
      this.protos.set(key, p);
    }
    p.placements.push({ x, y, z, rotY, scale });
    if (collide && p.collider) {
      const c = p.collider;
      if (c.type === 'circle') this.colliders.push({ x, z, r: c.r * scale });
      else if (c.type === 'box') this.colliders.push({ x, z, r: Math.max(c.w, c.d) * 0.5 * scale * 0.9 });
    }
    return this;
  }

  build(parent) {
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (const [key, p] of this.protos) {
      if (!p.parts.length) continue;
      // bucket placements by chunk
      const chunks = new Map();
      for (const pl of p.placements) {
        const ck = `${Math.floor(pl.x / this.chunk)},${Math.floor(pl.z / this.chunk)}`;
        let arr = chunks.get(ck);
        if (!arr) chunks.set(ck, (arr = []));
        arr.push(pl);
      }
      for (const [, pls] of chunks) {
        for (const part of p.parts) {
          const im = new THREE.InstancedMesh(part.geometry, part.material, pls.length);
          pls.forEach((pl, i) => {
            q.setFromEuler(e.set(0, pl.rotY, 0));
            _m.compose(pos.set(pl.x, pl.y, pl.z), q, scl.setScalar(pl.scale));
            im.setMatrixAt(i, _m);
          });
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          im.castShadow = part.cast;
          im.receiveShadow = part.receive;
          im.matrixAutoUpdate = false;
          im.name = key;
          this.group.add(im);
        }
      }
    }
    parent.add(this.group);
    return this.group;
  }
}
