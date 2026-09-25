// Small helpers shared by prop builders.
import * as THREE from 'three';

/** Deterministic PRNG (mulberry32). Returns () => [0,1). */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rewrite UVs with box (tri-planar style) projection in object space so that
 * texture density is consistent regardless of mesh size.
 * `size` = meters per texture repeat. Call AFTER all geometry transforms that
 * change scale (translate/rotate afterwards is fine for density).
 */
export function applyBoxUV(geo, size = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u / size;
    uv[i * 2 + 1] = v / size;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Create a mesh with shadow flags set. */
export function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Convenience: add a mesh to parent at position / rotation (Euler XYZ radians) / scale. */
export function place(parent, obj, pos = [0, 0, 0], rot = [0, 0, 0], scl = null) {
  obj.position.set(pos[0], pos[1], pos[2]);
  obj.rotation.set(rot[0], rot[1], rot[2]);
  if (scl != null) {
    if (typeof scl === 'number') obj.scale.setScalar(scl);
    else obj.scale.set(scl[0], scl[1], scl[2]);
  }
  parent.add(obj);
  return obj;
}

/**
 * A sagging cable (catenary-ish) between two points as a thin tube geometry.
 * sag = how far the middle drops (meters).
 */
export function cableGeometry(a, b, sag = 0.5, radius = 0.02, segments = 16) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, segments, radius, 4, false);
}
