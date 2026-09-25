// Geometry helpers for the shrine / temple / spring prop set (course 2 "桜咲く千本鳥居").
// Everything here is pure geometry (no materials) so the prop builders stay readable.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyBoxUV } from './util.js';

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// transforms
// ---------------------------------------------------------------------------
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Transform a geometry in place. pos [x,y,z], rot [rx,ry,rz] (radians), scl number | [x,y,z]. */
export function T(geo, pos, rot, scl, order = 'XYZ') {
  _p.set(0, 0, 0);
  if (pos) _p.set(pos[0], pos[1], pos[2]);
  _e.set(0, 0, 0, order);
  if (rot) _e.set(rot[0], rot[1], rot[2], order);
  _q.setFromEuler(_e);
  if (scl == null) _s.set(1, 1, 1);
  else if (typeof scl === 'number') _s.setScalar(scl);
  else _s.set(scl[0], scl[1], scl[2]);
  _m4.compose(_p, _q, _s);
  geo.applyMatrix4(_m4);
  return geo;
}

/** Rotate a geometry so that its +Y axis points along `dir`, then move it to `pos`. */
export function alignY(geo, dir, pos) {
  const d = dir.clone().normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  _m4.makeRotationFromQuaternion(_q);
  geo.applyMatrix4(_m4);
  if (pos) geo.translate(pos.x, pos.y, pos.z);
  return geo;
}

/** Mirror a geometry across the YZ plane (x -> -x) keeping correct winding. */
export function mirrorX(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, -p.getX(i));
    if (n) n.setX(i, -n.getX(i));
  }
  // flip triangle winding
  const swap = (attr) => {
    if (!attr) return;
    const s = attr.itemSize;
    const a = attr.array;
    for (let i = 0; i < attr.count; i += 3) {
      for (let k = 0; k < s; k++) {
        const t = a[(i + 1) * s + k];
        a[(i + 1) * s + k] = a[(i + 2) * s + k];
        a[(i + 2) * s + k] = t;
      }
    }
    attr.needsUpdate = true;
  };
  for (const k of Object.keys(g.attributes)) swap(g.attributes[k]);
  return g;
}

// ---------------------------------------------------------------------------
// Builder: collects geometries per material and merges them into few meshes.
// ---------------------------------------------------------------------------
const KEEP = new Set(['position', 'normal', 'uv', 'color']);

function prepGeo(g, vc, colorSize) {
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (vc) {
    if (!g.attributes.color || g.attributes.color.itemSize !== colorSize) {
      const c = new Float32Array(n * colorSize).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, colorSize));
    }
  } else if (g.attributes.color) g.deleteAttribute('color');
  if (!g.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export class Builder {
  constructor() {
    this.buckets = new Map();
  }
  /** Add a geometry (consumed, transformed in place) with a material. o: {pos, rot, scl, cast, receive} */
  add(geo, material, o = {}) {
    if (!geo) return null;
    if (o.pos || o.rot || o.scl != null) T(geo, o.pos, o.rot, o.scl, o.order);
    const cast = o.cast !== false;
    const receive = o.receive !== false;
    const key = `${material.uuid}|${cast ? 1 : 0}${receive ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { material, cast, receive, list: [] };
      this.buckets.set(key, b);
    }
    b.list.push(geo);
    return geo;
  }
  /** Merge into meshes (one per material + shadow flags) and add to a Group. */
  build(group = new THREE.Group()) {
    for (const b of this.buckets.values()) {
      const vc = !!b.material.vertexColors;
      let colorSize = 3;
      if (vc) for (const g of b.list) if (g.attributes.color && g.attributes.color.itemSize === 4) colorSize = 4;
      const list = b.list.map((g) => prepGeo(g, vc, colorSize));
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) throw new Error(`shrine: merge failed for material ${b.material.name}`);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const m = new THREE.Mesh(merged, b.material);
      m.name = b.material.name;
      m.castShadow = b.cast;
      m.receiveShadow = b.receive;
      group.add(m);
    }
    return group;
  }
}

/** Count triangles of an Object3D (for budgets). */
export function countTris(obj) {
  let t = 0;
  obj.traverse((o) => {
    if (o.isMesh) {
      const g = o.geometry;
      t += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  return Math.round(t);
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/** Simple box with box-projected UVs (flat normals). */
export function box(w, h, d, uv = 1) {
  return applyBoxUV(new THREE.BoxGeometry(w, h, d), uv);
}

function orient(poly, dir) {
  const a = poly[0];
  const b = poly[1];
  const c = poly[2];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * dir[0] + ny * dir[1] + nz * dir[2] < 0) poly.reverse();
  return poly;
}

/** Convert planar convex polygons ([[x,y,z],...]) to a flat-shaded non-indexed geometry with box UVs. */
export function polysGeo(polys, uvSize = 1) {
  const pos = [];
  const nor = [];
  const uv = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3();
  for (const p of polys) {
    for (let i = 1; i < p.length - 1; i++) {
      a.fromArray(p[0]);
      b.fromArray(p[i]);
      c.fromArray(p[i + 1]);
      n.subVectors(b, a).cross(t.subVectors(c, a));
      if (n.lengthSq() < 1e-14) continue;
      n.normalize();
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      for (const q of [p[0], p[i], p[i + 1]]) {
        pos.push(q[0], q[1], q[2]);
        nor.push(n.x, n.y, n.z);
        let u, v;
        if (ay >= ax && ay >= az) { u = q[0]; v = q[2]; }
        else if (ax >= az) { u = q[2]; v = q[1]; }
        else { u = q[0]; v = q[1]; }
        uv.push(u / uvSize, v / uvSize);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Chamfered box (44 triangles): crisp small bevels that catch the light. */
export function bevelBox(w, h, d, e = 0.02, uvSize = 1, jitter = null) {
  const a = w / 2, b = h / 2, c = d / 2;
  e = Math.max(0.0005, Math.min(e, a * 0.45, b * 0.45, c * 0.45));
  const A = a - e, B = b - e, C = c - e;
  const P = [];
  for (const s of [1, -1]) {
    P.push(orient([[s * a, -B, -C], [s * a, B, -C], [s * a, B, C], [s * a, -B, C]], [s, 0, 0]));
    P.push(orient([[-A, s * b, -C], [A, s * b, -C], [A, s * b, C], [-A, s * b, C]], [0, s, 0]));
    P.push(orient([[-A, -B, s * c], [A, -B, s * c], [A, B, s * c], [-A, B, s * c]], [0, 0, s]));
  }
  for (const s1 of [1, -1]) {
    for (const s2 of [1, -1]) {
      P.push(orient([[s1 * a, s2 * B, -C], [s1 * A, s2 * b, -C], [s1 * A, s2 * b, C], [s1 * a, s2 * B, C]], [s1, s2, 0]));
      P.push(orient([[s1 * a, -B, s2 * C], [s1 * A, -B, s2 * c], [s1 * A, B, s2 * c], [s1 * a, B, s2 * C]], [s1, 0, s2]));
      P.push(orient([[-A, s1 * b, s2 * C], [-A, s1 * B, s2 * c], [A, s1 * B, s2 * c], [A, s1 * b, s2 * C]], [0, s1, s2]));
    }
  }
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) for (const s3 of [1, -1]) {
    P.push(orient([[s1 * a, s2 * B, s3 * C], [s1 * A, s2 * b, s3 * C], [s1 * A, s2 * B, s3 * c]], [s1, s2, s3]));
  }
  if (jitter) {
    // displace shared corners consistently (deterministic by position)
    const cache = new Map();
    for (const poly of P) {
      for (let i = 0; i < poly.length; i++) {
        const q = poly[i];
        const key = q.map((v) => v.toFixed(5)).join(',');
        let j = cache.get(key);
        if (!j) { j = jitter(q); cache.set(key, j); }
        poly[i] = j;
      }
    }
  }
  return polysGeo(P, uvSize);
}

/** Cylinder from y0 to y1 (r0 bottom radius, r1 top radius) with UVs in meters/uv. */
export function cylY(r0, r1, y0, y1, seg = 16, { open = false, uv = 1, phase = 0 } = {}) {
  const h = y1 - y0;
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open, phase);
  g.translate(0, y0 + h / 2, 0);
  const a = g.attributes.uv;
  const su = (TAU * Math.max(r0, r1)) / uv;
  const sv = h / uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv);
  return g;
}

/** Cylinder between two points. */
export function cylBetween(a, b, r0, r1 = r0, seg = 8, open = false) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  g.translate(0, len / 2, 0);
  return alignY(g, d, a);
}

/**
 * Lathe around Y. points: [[r, y], ...] bottom -> top (repeat a point for a hard edge).
 * seg radial segments; phase = start angle (x = r sin(phi), z = r cos(phi)).
 * flat: flat-shaded facets (for hexagonal stone parts).
 */
export function lathe(points, seg = 16, { phase = 0, uv = 1, flat = false } = {}) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
  let g = new THREE.LatheGeometry(pts, seg, phase);
  // UVs in meters: u around (at max radius), v along profile length
  const cum = [0];
  for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + pts[j].distanceTo(pts[j - 1]));
  const rMax = Math.max(...pts.map((p) => p.x));
  const a = g.attributes.uv;
  const np = pts.length;
  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j < np; j++) a.setXY(i * np + j, ((i / seg) * TAU * rMax) / uv, cum[j] / uv);
  }
  if (flat) {
    g = g.toNonIndexed();
    g.computeVertexNormals();
  }
  return g;
}

// ---------------------------------------------------------------------------
// beams & posts
// ---------------------------------------------------------------------------

/** Chamfered rectangle profile (for sweeps). */
export function chamferRect(w, h, c) {
  const a = w / 2, b = h / 2;
  c = Math.min(c, a * 0.45, b * 0.45);
  return [[-a + c, -b], [a - c, -b], [a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c]];
}

/** Straight beam along X (wood grain along the beam). */
export function beamX(x0, x1, y, z, depth, height, chamfer = 0.02, uv = 1) {
  return sweep([V3(x0, y, z), V3(x1, y, z)], chamferRect(depth, height, chamfer), { perp: false, uv });
}
/** Straight beam along Z. */
export function beamZ(z0, z1, y, x, width, height, chamfer = 0.02, uv = 1) {
  return sweep([V3(x, y, z0), V3(x, y, z1)], chamferRect(width, height, chamfer), { perp: false, uv });
}
/** Vertical post (square, chamfered) from y0 to y1. */
export function postY(x, z, y0, y1, w, d = w, chamfer = 0.015, uv = 1) {
  const g = bevelBox(w, y1 - y0, d, chamfer, uv);
  return T(g, [x, (y0 + y1) / 2, z]);
}

// ---------------------------------------------------------------------------
// tubes & sweeps
// ---------------------------------------------------------------------------

/**
 * Tube along points/curve with variable radius radius(t, theta).
 * Smooth normals (analytic unless `computeNormals`), UV u around (uvU total), v along length in meters/uvV.
 */
export function tube(pts, o = {}) {
  const {
    segs = null,
    radial = 8,
    radius = 0.1,
    closed = false,
    capStart = false,
    capEnd = false,
    uvU = 1,
    uvV = 1,
    computeNormals = false,
    curveType = 'centripetal',
  } = o;
  const curve = typeof pts.getPointAt === "function" ? pts : new THREE.CatmullRomCurve3(pts, closed, curveType);
  const n = segs || Math.max(4, (pts.length || 4) * 3);
  const frames = curve.computeFrenetFrames(n, closed);
  const L = curve.getLength();
  const rf = typeof radius === 'function' ? radius : () => radius;
  const verts = [];
  const norms = [];
  const uvs = [];
  const idx = [];
  const P = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const R = radial + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPointAt(Math.min(t, 1), P);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * TAU;
      const c = Math.cos(th), s = Math.sin(th);
      dir.set(N.x * c + B.x * s, N.y * c + B.y * s, N.z * c + B.z * s);
      const r = rf(t, th);
      verts.push(P.x + dir.x * r, P.y + dir.y * r, P.z + dir.z * r);
      norms.push(dir.x, dir.y, dir.z);
      uvs.push((j / radial) * uvU, (t * L) / uvV);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * R + j, b = a + R, c = b + 1, d = a + 1;
      idx.push(a, d, c, a, c, b);
    }
  }
  const addCap = (i, sign) => {
    const t = i / n;
    curve.getPointAt(Math.min(t, 1), P);
    const Tn = frames.tangents[i].clone().multiplyScalar(sign);
    const base = verts.length / 3;
    verts.push(P.x, P.y, P.z);
    norms.push(Tn.x, Tn.y, Tn.z);
    uvs.push(0.5, 0.5);
    for (let j = 0; j <= radial; j++) {
      const k = (i * R + j) * 3;
      verts.push(verts[k], verts[k + 1], verts[k + 2]);
      norms.push(Tn.x, Tn.y, Tn.z);
      const th = (j / radial) * TAU;
      uvs.push(0.5 + Math.cos(th) * 0.5, 0.5 + Math.sin(th) * 0.5);
    }
    for (let j = 0; j < radial; j++) {
      if (sign < 0) idx.push(base, base + 2 + j, base + 1 + j);
      else idx.push(base, base + 1 + j, base + 2 + j);
    }
  };
  if (capStart && !closed) addCap(0, -1);
  if (capEnd && !closed) addCap(n, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  if (computeNormals) {
    const nAttr = g.attributes.normal;
    const saved = capStart || capEnd ? nAttr.array.slice((n + 1) * R * 3) : null;
    g.computeVertexNormals();
    // weld the seam
    for (let i = 0; i <= n; i++) {
      const a = i * R, b = i * R + radial;
      const x = nAttr.getX(a) + nAttr.getX(b), y = nAttr.getY(a) + nAttr.getY(b), z = nAttr.getZ(a) + nAttr.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      nAttr.setXYZ(a, x / l, y / l, z / l);
      nAttr.setXYZ(b, x / l, y / l, z / l);
    }
    if (saved) nAttr.array.set(saved, (n + 1) * R * 3);
  }
  return g;
}

/**
 * Sweep a 2D profile [[x, y], ...] (closed polygon) along a polyline path (Vector3[]).
 * Hard edges across the profile, smooth along the path.
 * perp: sections perpendicular to the path (else vertical sections).
 * up: reference up vector. Lateral axis = normalize(tangent x up).
 * scale(t) -> [sx, sy]; shiftStart/shiftEnd(px, py) -> extra offset along the tangent at the ends.
 * UV: u = around profile (meters/uv), v = along path (meters/uv) -> wood grain runs along the path.
 */
export function sweep(path, profile, o = {}) {
  const { perp = true, up = new THREE.Vector3(0, 1, 0), caps = true, uv = 1, scale = null, shiftStart = null, shiftEnd = null } = o;
  const n = path.length;
  const m = profile.length;
  const Tn = [], S = [], U = [];
  for (let i = 0; i < n; i++) {
    const t = new THREE.Vector3().subVectors(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)]).normalize();
    const s = new THREE.Vector3().crossVectors(t, up);
    if (s.lengthSq() < 1e-8) s.set(1, 0, 0);
    s.normalize();
    const u = perp ? new THREE.Vector3().crossVectors(s, t).normalize() : up.clone().normalize();
    Tn.push(t);
    S.push(s);
    U.push(u);
  }
  const cumL = [0];
  for (let i = 1; i < n; i++) cumL.push(cumL[i - 1] + path[i].distanceTo(path[i - 1]));
  const cumP = [0];
  for (let k = 1; k <= m; k++) {
    const a = profile[k - 1], b = profile[k % m];
    cumP.push(cumP[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const pt = (i, k) => {
    const [px, py] = profile[k % m];
    let sx = 1, sy = 1;
    if (scale) {
      const sc = scale(i / (n - 1));
      if (typeof sc === 'number') { sx = sc; sy = sc; } else { sx = sc[0]; sy = sc[1]; }
    }
    const p = path[i].clone().addScaledVector(S[i], px * sx).addScaledVector(U[i], py * sy);
    if (i === 0 && shiftStart) p.addScaledVector(Tn[0], shiftStart(px, py));
    if (i === n - 1 && shiftEnd) p.addScaledVector(Tn[n - 1], shiftEnd(px, py));
    return p;
  };
  const pos = [];
  const uvs = [];
  const idx = [];
  // winding test (profile orientation)
  let cx = 0, cy = 0;
  for (const [x, y] of profile) { cx += x; cy += y; }
  cx /= m; cy /= m;
  let area = 0;
  for (let k = 0; k < m; k++) {
    const a = profile[k], b = profile[(k + 1) % m];
    area += a[0] * b[1] - b[0] * a[1];
  }
  // For S = T x up, U = S x T: (S, U, T) is left-handed => CCW profile needs flipped order.
  const flip = area > 0;
  for (let k = 0; k < m; k++) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = pt(i, k), b = pt(i, k + 1);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      uvs.push(cumP[k] / uv, cumL[i] / uv, cumP[k + 1] / uv, cumL[i] / uv);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 3, d = a + 2;
      if (!flip) idx.push(a, b, c, a, c, d);
      else idx.push(a, c, b, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // verify winding empirically on the widest edge, flip everything if wrong
  {
    let best = 0, bk = 0;
    for (let k = 0; k < m; k++) {
      const a = profile[k], b = profile[(k + 1) % m];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > best) { best = l; bk = k; }
    }
    const i = Math.floor((n - 1) / 2);
    const a = pt(i, bk), b = pt(i, bk + 1);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const cen = path[i].clone().addScaledVector(S[i], cx).addScaledVector(U[i], cy);
    const out = mid.clone().sub(cen);
    const vi = (bk * n + i) * 2;
    const nn = new THREE.Vector3(g.attributes.normal.getX(vi), g.attributes.normal.getY(vi), g.attributes.normal.getZ(vi));
    if (nn.dot(out) < 0) {
      const ia = g.index.array;
      for (let q = 0; q < ia.length; q += 3) { const t = ia[q + 1]; ia[q + 1] = ia[q + 2]; ia[q + 2] = t; }
      g.computeVertexNormals();
    }
  }
  if (!caps) return g;
  const parts = [g];
  for (const end of [0, n - 1]) {
    const ring = [];
    for (let k = 0; k < m; k++) ring.push(pt(end, k));
    const cen = new THREE.Vector3();
    ring.forEach((p) => cen.add(p));
    cen.multiplyScalar(1 / m);
    const polys = [];
    for (let k = 0; k < m; k++) {
      const a = ring[k], b = ring[(k + 1) % m];
      const dir = Tn[end].clone().multiplyScalar(end === 0 ? -1 : 1);
      polys.push(orient([cen.toArray(), a.toArray(), b.toArray()], dir.toArray()));
    }
    parts.push(polysGeo(polys, uv));
  }
  return mergeParts(parts);
}

/** Merge geometries (mixed indexed / non-indexed ok) keeping position/normal/uv(/color). */
export function mergeParts(parts) {
  const hasColor = parts.some((p) => p.attributes.color);
  const list = parts.map((p) => {
    let g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (!KEEP.has(k) || (k === 'color' && !hasColor)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (hasColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    g.morphAttributes = {};
    g.clearGroups();
    return g;
  });
  return mergeGeometries(list, false);
}

// ---------------------------------------------------------------------------
// parametric grids
// ---------------------------------------------------------------------------

/**
 * Parametric surface grid. fn(u, v, target:Vector3). Returns indexed geometry with smooth normals.
 * face: expected normal direction [x,y,z] (auto-flips winding). uv(i, j, u, v, P) -> [u, v] where P[j][i] are the points.
 */
export function grid(nu, nv, fn, { face = null, uv = null } = {}) {
  const P = [];
  for (let j = 0; j <= nv; j++) {
    const row = [];
    for (let i = 0; i <= nu; i++) {
      const p = new THREE.Vector3();
      fn(i / nu, j / nv, p);
      row.push(p);
    }
    P.push(row);
  }
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      const p = P[j][i];
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      const t = uv ? uv(i, j, i / nu, j / nv, P) : [i / nu, j / nv];
      uvs[k * 2] = t[0];
      uvs[k * 2 + 1] = t[1];
    }
  }
  let flip = false;
  if (face) {
    const i = Math.floor(nu / 2), j = Math.floor(nv / 2);
    const a = P[j][i], b = P[j][Math.min(i + 1, nu)], c = P[Math.min(j + 1, nv)][i];
    const nn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (nn.x * face[0] + nn.y * face[1] + nn.z * face[2] < 0) flip = true;
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (!flip) idx.push(a, b, d, a, d, c);
      else idx.push(a, d, b, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.P = P;
  return g;
}

/** Per-row cumulative arc length helper for grid uv callbacks (along v). */
export function arcV(P, i, j) {
  let s = 0;
  for (let k = 1; k <= j; k++) s += P[k][i].distanceTo(P[k - 1][i]);
  return s;
}

// ---------------------------------------------------------------------------
// noise & organic blobs
// ---------------------------------------------------------------------------
function ihash(x, y, z, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function vnoise(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a, b, c) => ihash(xi + a, yi + b, zi + c, s);
  const x00 = lerp(h(0, 0, 0), h(1, 0, 0), u);
  const x10 = lerp(h(0, 1, 0), h(1, 1, 0), u);
  const x01 = lerp(h(0, 0, 1), h(1, 0, 1), u);
  const x11 = lerp(h(0, 1, 1), h(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}
export function fbm(x, y, z, s = 0, oct = 3) {
  let a = 0.5, f = 1, sum = 0, nrm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * vnoise(x * f, y * f, z * f, s + i * 17);
    nrm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / nrm;
}

/**
 * Lumpy blob (displaced icosahedron), indexed with smooth normals, centered at origin.
 * flatBottom: y (relative, in units of r*sy) below which the blob gets squashed flat.
 */
export function blob(seed, { r = 1, detail = 1, sx = 1, sy = 1, sz = 1, amp = 0.18, freq = 1.4, flatBottom = null, flatK = 0.25 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const o = (seed % 997) * 3.17;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 1 + amp * fbm(v.x * freq + o, v.y * freq - o * 0.7, v.z * freq + o * 1.3, seed, 2) * 1.6;
    let x = v.x * k * sx * r, y = v.y * k * sy * r, z = v.z * k * sz * r;
    if (flatBottom != null) {
      const fb = flatBottom * r * sy;
      if (y < fb) y = fb + (y - fb) * flatK;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Per-face box projection UVs without touching normals (converts to non-indexed). */
export function faceBoxUV(geo, size = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(t.subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const q = k === 0 ? a : k === 1 ? b : c;
      let u, v;
      if (ay >= ax && ay >= az) { u = q.x; v = q.z; }
      else if (ax >= az) { u = q.z; v = q.y; }
      else { u = q.x; v = q.y; }
      uv[(i + k) * 2] = u / size;
      uv[(i + k) * 2 + 1] = v / size;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Canopy color at point p with normal n (same model used by foliageShade and tuft cards).
 * Returns [r,g,b] (linear).
 */
export function canopyColor(p, n, o, out = [0, 0, 0]) {
  const { center, radii, tint = null, grad = null, gradNoise = 0.25, aoLow = 0.6, aoHigh = 1.0, yMin = 0, yMax = 10, downDark = 0.18, seed = 1, varAmt = 0.06, mul = 1 } = o;
  const dx = (p.x - center.x) / radii.x, dy = (p.y - center.y) / radii.y, dz = (p.z - center.z) / radii.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const h = clamp((p.y - yMin) / Math.max(yMax - yMin, 1e-3), 0, 1);
  let ao = lerp(aoLow, aoHigh, clamp(0.45 * h + 0.55 * sstep(0.3, 1.0, d), 0, 1));
  ao *= 1 - downDark * clamp(-n.y, 0, 1);
  const nv = (1 + varAmt * vnoise(p.x * 1.7, p.y * 1.7, p.z * 1.7, seed)) * mul;
  let r, g, b;
  if (grad) {
    const k = sstep(0.1, 0.9, clamp(0.5 + 0.55 * dy + gradNoise * vnoise(p.x * 0.35, p.y * 0.35, p.z * 0.35, 77), 0, 1));
    r = lerp(grad[0].r, grad[1].r, k); g = lerp(grad[0].g, grad[1].g, k); b = lerp(grad[0].b, grad[1].b, k);
  } else { r = tint.r; g = tint.g; b = tint.b; }
  out[0] = r * ao * nv; out[1] = g * ao * nv; out[2] = b * ao * nv;
  return out;
}

/** Ellipsoid (canopy volume) normal at p. */
export function canopyNormal(p, center, radii, out = new THREE.Vector3()) {
  out.set((p.x - center.x) / (radii.x * radii.x), (p.y - center.y) / (radii.y * radii.y), (p.z - center.z) / (radii.z * radii.z));
  if (out.lengthSq() < 1e-12) out.set(0, 1, 0);
  return out.normalize();
}

/**
 * Alpha-cut tuft cards sticking out of foliage clumps: crossed pairs of quads that contain the canopy normal,
 * with vertex normals = canopy normal (so they shade like the soft volume) and canopy colors.
 * clumps: [{p: Vector3, r, sy?}]. Returns a geometry (position/normal/uv/color).
 */
export function tuftCards(clumps, o) {
  const { rand, count = 2, size = [0.8, 1.1], minOut = 0.2, embed = 0.32, sizeScale = 1 } = o;
  const pos = [], nor = [], uv = [], colr = [], idx = [];
  const d = new THREE.Vector3(), N = new THREE.Vector3(), T1 = new THREE.Vector3(), T2 = new THREE.Vector3(), P = new THREE.Vector3(), cn = new THREE.Vector3(), tmp = new THREE.Vector3();
  const c3 = [0, 0, 0];
  for (const q of clumps) {
    canopyNormal(q.p, o.center, o.radii, cn);
    for (let k = 0; k < count; k++) {
      d.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (d.lengthSq() < 1e-4) d.set(0, 1, 0);
      d.normalize();
      if (d.dot(cn) < minOut) d.addScaledVector(cn, minOut - d.dot(cn) + 0.3).normalize();
      P.copy(q.p).addScaledVector(d, q.r * 0.9);
      P.y = q.p.y + (P.y - q.p.y) * (q.sy || 0.85);
      canopyNormal(P, o.center, o.radii, N);
      N.lerp(d, 0.4).normalize();
      const w = (size[0] + (size[1] - size[0]) * rand()) * sizeScale;
      tmp.set(0, 1, 0);
      if (Math.abs(N.y) > 0.9) tmp.set(1, 0, 0);
      T1.crossVectors(N, tmp).normalize();
      T1.applyAxisAngle(N, rand() * PI);
      T2.crossVectors(N, T1).normalize();
      canopyColor(P, N, o, c3);
      const nn = N.clone().lerp(new THREE.Vector3(0, 1, 0), 0.15).normalize();
      for (const Tt of [T1, T2]) {
        const base = pos.length / 3;
        const corners = [[-0.5, -embed], [0.5, -embed], [0.5, 1 - embed], [-0.5, 1 - embed]];
        for (const [a, bb] of corners) {
          pos.push(P.x + Tt.x * a * w + N.x * bb * w, P.y + Tt.y * a * w + N.y * bb * w, P.z + Tt.z * a * w + N.z * bb * w);
          nor.push(nn.x, nn.y, nn.z);
          colr.push(c3[0], c3[1], c3[2]);
        }
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        // front + back faces share the canopy normal (a DoubleSide material would flip it on the back)
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Soft foliage shading for a clump already positioned in prop space:
 * blends normals toward a big ellipsoid volume normal (reads as one soft canopy),
 * bakes tint * ambient-occlusion into vertex colors and adds face box UVs.
 */
export function foliageShade(geo, o) {
  const {
    center, radii, blend = 0.45, tint = null, tint2 = null, aoLow = 0.6, aoHigh = 1.0, yMin = 0, yMax = 10, uvSize = 0.6,
    downDark = 0.18, seed = 1, varAmt = 0.06, grad = null, gradNoise = 0.25, mul = 1,
  } = o;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), cn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const dx = (p.x - center.x) / radii.x, dy = (p.y - center.y) / radii.y, dz = (p.z - center.z) / radii.z;
    cn.set(dx / radii.x, dy / radii.y, dz / radii.z);
    if (cn.lengthSq() < 1e-10) cn.set(0, 1, 0);
    cn.normalize();
    n.lerp(cn, blend);
    if (n.lengthSq() < 1e-10) n.set(0, 1, 0);
    n.normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const h = clamp((p.y - yMin) / Math.max(yMax - yMin, 1e-3), 0, 1);
    let ao = lerp(aoLow, aoHigh, clamp(0.45 * h + 0.55 * sstep(0.3, 1.0, d), 0, 1));
    ao *= 1 - downDark * clamp(-n.y, 0, 1);
    const nv = (1 + varAmt * vnoise(p.x * 1.7, p.y * 1.7, p.z * 1.7, seed)) * mul;
    let r, g, b;
    if (grad) {
      // coherent vertical gradient across the whole canopy (low = shaded underside color, high = sunlit top)
      const k = sstep(0.1, 0.9, clamp(0.5 + 0.55 * dy + gradNoise * vnoise(p.x * 0.35, p.y * 0.35, p.z * 0.35, 77), 0, 1));
      r = lerp(grad[0].r, grad[1].r, k); g = lerp(grad[0].g, grad[1].g, k); b = lerp(grad[0].b, grad[1].b, k);
    } else { r = tint.r; g = tint.g; b = tint.b; }
    if (tint2) {
      const k = clamp(0.5 + 0.9 * vnoise(p.x * 0.9 + 3.1, p.y * 0.9, p.z * 0.9 - 1.7, seed + 5), 0, 1);
      r = lerp(r, tint2.r, k); g = lerp(g, tint2.g, k); b = lerp(b, tint2.b, k);
    }
    col[i * 3] = r * ao * nv;
    col[i * 3 + 1] = g * ao * nv;
    col[i * 3 + 2] = b * ao * nv;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return faceBoxUV(geo, uvSize);
}

// ---------------------------------------------------------------------------
// Japanese roofs
// ---------------------------------------------------------------------------
const v2 = (a) => new THREE.Vector2(a[0], a[1]);

/**
 * Hipped roof "skirt" over a convex polygon (pagoda tiers, castle tiers, lantern caps, pyramids).
 * outer: eave corners [[x,z],...] (convex, any winding); inner: top boundary corners (same count).
 * Returns geometries { top, edge, band, soffit, ridges[] } (any may be null) plus helpers.
 * - curved concave slope, upswept corners (lift), corners projecting outward (flare)
 * - visible eave thickness: `edge` (roof-material upper band) + `band` (rafter-end band) + `soffit` underside.
 */
export function hipRoof(o) {
  const n = o.outer.length;
  const outer = o.outer.map(v2);
  const inner = o.inner.map(v2);
  const sIn = (o.soffitInner || o.inner).map(v2);
  const {
    yEave, yTop, ySoffitIn = yEave, lift = 0.4, liftPow = 2.4, flare = 0.3, flarePow = 2.2, curveA = 0.35, curvePow = 2.0,
    thick = 0.4, split = 0.45, segS = 10, segT = 6, segSoffit = 2, tile = 2.4, rafter = 1, soffitMode = 'rafter',
    ridge = null, soffit = true, bandMode = 'rafter', liftFade = null,
  } = o;
  const F = (t) => curveA * t + (1 - curveA) * Math.pow(t, curvePow);
  const cen = new THREE.Vector2();
  outer.forEach((p) => cen.add(p));
  cen.multiplyScalar(1 / n);
  const edges = [];
  for (let i = 0; i < n; i++) {
    const A = outer[i], B = outer[(i + 1) % n];
    const e = B.clone().sub(A).normalize();
    const nn = new THREE.Vector2(e.y, -e.x);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    if (nn.dot(mid.clone().sub(cen)) < 0) nn.negate();
    edges.push({ e, n: nn });
  }
  const bis = outer.map((A, i) => edges[(i - 1 + n) % n].n.clone().add(edges[i].n).normalize());
  const flared = outer.map((A, i) => A.clone().addScaledVector(bis[i], flare));
  const sides = [];
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    const { e, n: nn } = edges[i];
    const Af = flared[i], Bf = flared[i1];
    const shift = (Af.clone().sub(outer[i]).dot(nn) + Bf.clone().sub(outer[i1]).dot(nn)) / 2;
    const eave = (s) => {
      const u = Math.abs(2 * s - 1);
      const pl = new THREE.Vector2().lerpVectors(Af, Bf, s).addScaledVector(nn, -shift * (1 - Math.pow(u, flarePow)));
      return { pl, y: yEave + lift * Math.pow(u, liftPow) };
    };
    const top = (s, t, out) => {
      const E = eave(s);
      const I = new THREE.Vector2().lerpVectors(inner[i], inner[i1], s);
      const pl = E.pl.clone().lerp(I, t);
      if (liftFade != null) {
        // corner lift concentrated near the eave (less twist further up the slope)
        const u = Math.abs(2 * s - 1);
        return out.set(pl.x, yEave + (yTop - yEave) * F(t) + lift * Math.pow(u, liftPow) * Math.pow(1 - t, liftFade), pl.y);
      }
      return out.set(pl.x, E.y + (yTop - E.y) * F(t), pl.y);
    };
    const under = (s, t, out) => {
      const E = eave(s);
      const I = new THREE.Vector2().lerpVectors(sIn[i], sIn[i1], s);
      const pl = E.pl.clone().lerp(I, t);
      const y0 = E.y - thick;
      return out.set(pl.x, y0 + (ySoffitIn - y0) * t, pl.y);
    };
    sides.push({ e, n: nn, eave, top, under });
  }
  const res = { top: [], edge: [], band: [], soffit: [], ridges: [], sides, flared, edges };
  for (const sd of sides) {
    const { e, n: nn } = sd;
    // slope length along the middle of the side: tile rows follow iso-t lines (parallel to the eave)
    let Lmid = 0;
    const qa = new THREE.Vector3(), qb = new THREE.Vector3();
    for (let k = 1; k <= 16; k++) Lmid += sd.top(0.5, k / 16, qa).distanceTo(sd.top(0.5, (k - 1) / 16, qb));
    res.top.push(grid(segS, segT, (s, t, p) => sd.top(s, t, p), {
      face: [nn.x, 1.2, nn.y],
      uv: (i, j, s, t, P) => [(P[j][i].x * e.x + P[j][i].z * e.y) / tile, (t * Lmid) / tile],
    }));
    const eH = thick * split;
    res.edge.push(grid(segS, 1, (s, k, p) => { const E = sd.eave(s); return p.set(E.pl.x, E.y - k * eH, E.pl.y); }, {
      face: [nn.x, 0, nn.y],
      uv: (i, j, s, k, P) => bandMode === 'rafter'
        ? [(P[j][i].x * e.x + P[j][i].z * e.y) / tile, 0.02 + (1 - k) * 0.05]
        : [(P[j][i].x * e.x + P[j][i].z * e.y) / tile, P[j][i].y / tile],
    }));
    res.band.push(grid(segS, 1, (s, k, p) => { const E = sd.eave(s); return p.set(E.pl.x, E.y - eH - k * (thick - eH), E.pl.y); }, {
      face: [nn.x, 0, nn.y],
      uv: (i, j, s, k, P) => bandMode === 'rafter'
        ? [(P[j][i].x * e.x + P[j][i].z * e.y) / rafter, lerp(0.48, 0.02, k)]
        : [(P[j][i].x * e.x + P[j][i].z * e.y) / rafter, P[j][i].y / rafter],
    }));
    if (soffit) {
      res.soffit.push(grid(segS, segSoffit, (s, t, p) => sd.under(s, t, p), {
        face: [0, -1, 0],
        uv: (i, j, s, t, P) => soffitMode === 'rafter'
          ? [(P[j][i].x * e.x + P[j][i].z * e.y) / rafter, 0.75]
          : [(P[j][i].x * e.x + P[j][i].z * e.y) / rafter, (P[j][i].x * nn.x + P[j][i].z * nn.y) / rafter],
      }));
    }
  }
  if (ridge) {
    const { w = 0.25, h = 0.2, ext = 0.35, curl = 0.25, steps = segT, lite = false } = ridge;
    const prof = lite
      ? [[-w / 2, -h * 0.6], [w / 2, -h * 0.6], [w * 0.3, h * 0.5], [-w * 0.3, h * 0.5]]
      : [[-w / 2, -h * 0.6], [w / 2, -h * 0.6], [w / 2, h * 0.2], [w * 0.2, h * 0.5], [-w * 0.2, h * 0.5], [-w / 2, h * 0.2]];
    for (let i = 0; i < n; i++) {
      const sd = sides[i];
      const pts = [];
      for (let k = steps; k >= 0; k--) {
        const p = sd.top(0, k / steps, new THREE.Vector3());
        p.y += h * 0.45;
        pts.push(p);
      }
      // outward flick past the corner
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const d = last.clone().sub(prev);
      d.y = 0;
      d.normalize();
      for (let k = 1; k <= (ext > 0 ? 3 : 0); k++) {
        const f = k / 3;
        pts.push(last.clone().addScaledVector(d, ext * f).add(new THREE.Vector3(0, curl * f * f + (last.y - prev.y) * 0.0, 0)));
      }
      const nP = pts.length;
      res.ridges.push(sweep(pts, prof, { perp: true, uv: tile, scale: (t) => 1 - 0.3 * Math.max(0, (t * (nP - 1) - (nP - 4)) / 3) }));
      if (lite) continue;
      // round end tile (巴瓦) at the tip
      const tip = pts[nP - 1], pre = pts[nP - 2];
      const dir = tip.clone().sub(pre).normalize();
      const disc = new THREE.CylinderGeometry(w * 0.42, w * 0.42, w * 0.3, 10);
      disc.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      disc.translate(tip.x + dir.x * w * 0.1, tip.y + dir.y * w * 0.1, tip.z + dir.z * w * 0.1);
      res.ridges.push(disc);
    }
  }
  const cat = (arr) => (arr.length ? mergeParts(arr) : null);
  return { top: cat(res.top), edge: cat(res.edge), band: cat(res.band), soffit: cat(res.soffit), ridges: cat(res.ridges), sides, flared, F };
}

/**
 * Gabled roof with the ridge along X (kirizuma / nagare when asymmetric).
 * Front slope goes toward +Z (eave at zF, height yF), back slope toward -Z (zB, yB). Ridge at (zR, yR).
 * halfX = half length including verge overhang.
 * Returns { top, edge, band, soffit, verge, barge, gable, ridgeCap, yAt(x, z, front) }.
 */
export function gableRoof(o) {
  const {
    halfX, zR, yR, zF, yF, zB, yB, lift = 0.3, liftPow = 2.5, flare = 0.2, flarePow = 2.5, curveA = 0.35, curvePow = 2,
    thick = 0.35, split = 0.45, segX = 12, segT = 8, tile = 2.4, rafter = 1, barge = null, gable = null, ridgeCap = null,
    soffitMode = 'rafter', front = true, back = true,
  } = o;
  const F = (t) => curveA * t + (1 - curveA) * Math.pow(t, curvePow);
  const slope = (sgn) => {
    const zE0 = sgn > 0 ? zF : zB;
    const yE0 = sgn > 0 ? yF : yB;
    return (s, t, out) => {
      const x = -halfX + 2 * halfX * s;
      const u = Math.abs(2 * s - 1);
      const zE = zE0 + sgn * flare * Math.pow(u, flarePow);
      const yE = yE0 + lift * Math.pow(u, liftPow);
      return out.set(x, yE + (yR - yE) * F(t), zE + (zR - zE) * t);
    };
  };
  const res = { top: [], edge: [], band: [], soffit: [], verge: [], barge: [], gable: [], ridgeCap: null };
  const eH = thick * split;
  const sgns = [];
  if (front) sgns.push(1);
  if (back) sgns.push(-1);
  const fns = {};
  for (const sgn of sgns) {
    const f = slope(sgn);
    fns[sgn] = f;
    res.top.push(grid(segX, segT, f, { face: [0, 1, sgn * 0.5], uv: (i, j, s, t, P) => [P[j][i].x / tile, arcV(P, i, j) / tile] }));
    res.soffit.push(grid(segX, segT, (s, t, p) => f(s, t, p).setY(p.y - thick), {
      face: [0, -1, 0],
      uv: (i, j, s, t, P) => (soffitMode === 'rafter' ? [P[j][i].x / rafter, 0.75] : [P[j][i].x / rafter, P[j][i].z / rafter]),
    }));
    res.edge.push(grid(segX, 1, (s, k, p) => f(s, 0, p).setY(p.y - k * eH), { face: [0, 0, sgn], uv: (i, j, s, k, P) => [P[j][i].x / tile, 0.02 + (1 - k) * 0.05] }));
    res.band.push(grid(segX, 1, (s, k, p) => f(s, 0, p).setY(p.y - eH - k * (thick - eH)), {
      face: [0, 0, sgn],
      uv: (i, j, s, k, P) => [P[j][i].x / rafter, lerp(0.48, 0.02, k)],
    }));
    // verge (side edges of the slab)
    for (const s of [0, 1]) {
      res.verge.push(grid(1, segT, (k, t, p) => f(s, t, p).setY(p.y - k * thick), {
        face: [s ? 1 : -1, 0, 0],
        uv: (i, j, k, t, P) => [P[j][i].z / tile, P[j][i].y / tile],
      }));
    }
  }
  // bargeboards (hafu-ita) following the verge, meeting at the apex
  if (barge) {
    const { h = thick * 1.6, d = 0.08, over = 0.04, steps = segT } = barge;
    for (const s of [0, 1]) {
      const pts = [];
      if (front) for (let k = 0; k <= steps; k++) pts.push(fns[1](s, k / steps, new THREE.Vector3()));
      if (back) for (let k = steps - (front ? 1 : 0); k >= 0; k--) pts.push(fns[-1](s, k / steps, new THREE.Vector3()));
      const x = (s ? 1 : -1) * (halfX + d / 2);
      pts.forEach((p) => { p.x = x; });
      const prof = [[-d / 2, -h + over], [d / 2, -h + over], [d / 2, over], [-d / 2, over]];
      res.barge.push(sweep(pts, prof, { perp: false, uv: 1 }));
    }
  }
  // gable walls (tsuma) under the roof at x = +-gable.x
  if (gable) {
    const { x: gx, yBottom, zFront, zBack, seg = 10 } = gable;
    const soffitY = (z) => {
      // find t on the proper slope for this z at s corresponding to x
      const sgn = z >= zR ? 1 : -1;
      const zE = sgn > 0 ? zF : zB;
      const yE = sgn > 0 ? yF : yB;
      const t = clamp((z - zE) / (zR - zE), 0, 1);
      const u = Math.abs(gx / halfX);
      const yEl = yE + lift * Math.pow(u, liftPow);
      return yEl + (yR - yEl) * F(t) - thick;
    };
    for (const sx of [-1, 1]) {
      res.gable.push(grid(seg, 1, (a, k, p) => {
        const z = lerp(zBack, zFront, a);
        return p.set(sx * gx, lerp(yBottom, soffitY(z) + 0.02, k), z);
      }, { face: [sx, 0, 0], uv: (i, j, a, k, P) => [P[j][i].z / 2, P[j][i].y / 2] }));
    }
    res.soffitY = soffitY;
  }
  if (ridgeCap) {
    const { w = 0.4, h = 0.3, ext = 0.1 } = ridgeCap;
    res.ridgeCap = bevelBox(2 * halfX + 2 * ext, h, w, Math.min(0.05, h * 0.2), tile);
    T(res.ridgeCap, [0, yR + h / 2 - 0.05, zR]);
  }
  const cat = (arr) => (arr.length ? mergeParts(arr) : null);
  /** Top-surface height of the roof at (x, z) (sgn: +1 front slope, -1 back slope). */
  const yAt = (x, z, sgn = z >= zR ? 1 : -1) => {
    const zE0 = sgn > 0 ? zF : zB, yE0 = sgn > 0 ? yF : yB;
    const u = Math.min(1, Math.abs(x / halfX));
    const zE = zE0 + sgn * flare * Math.pow(u, flarePow);
    const t = clamp((z - zE) / (zR - zE), 0, 1);
    const yE = yE0 + lift * Math.pow(u, liftPow);
    return yE + (yR - yE) * F(t);
  };
  return {
    top: cat(res.top), edge: cat(res.edge), band: cat(res.band), soffit: cat(res.soffit), verge: cat(res.verge),
    barge: cat(res.barge), gable: cat(res.gable), ridgeCap: res.ridgeCap, soffitY: res.soffitY, F, slope: fns, yAt, thick,
  };
}

/**
 * Kara-hafu (bell-curved gable) roof segment, front facing +Z.
 * Cross-section y(x) = y0 + h * bell(x/halfW), extruded from zBack to zFront.
 */
export function karaHafu(o) {
  const { halfW, zBack, zFront, y0, h, thick = 0.3, bargeH = 0.45, bargeD = 0.12, segX = 16, segZ = 3, pow = 1.0, tile = 2.4, drop = 0.25 } = o;
  const bell = (x) => Math.pow((1 + Math.cos(PI * clamp(x / halfW, -1, 1))) / 2, pow);
  const yAt = (x, z) => y0 + h * bell(x) - drop * clamp((z - zBack) / (zFront - zBack), 0, 1);
  const top = grid(segX, segZ, (s, t, p) => {
    const x = lerp(-halfW, halfW, s);
    const z = lerp(zBack, zFront, t);
    return p.set(x, yAt(x, z), z);
  }, { face: [0, 1, 0], uv: (i, j, s, t, P) => [P[j][i].z / tile, (P[j][i].x + 20) / tile] });
  const soffit = grid(segX, segZ, (s, t, p) => {
    const x = lerp(-halfW, halfW, s);
    const z = lerp(zBack, zFront, t);
    return p.set(x, yAt(x, z) - thick, z);
  }, { face: [0, -1, 0] });
  const pts = [];
  for (let k = 0; k <= segX; k++) {
    const x = lerp(-halfW, halfW, k / segX);
    pts.push(new THREE.Vector3(x, yAt(x, zFront), zFront + bargeD / 2));
  }
  const barge = sweep(pts, [[-bargeD / 2, -bargeH], [bargeD / 2, -bargeH], [bargeD / 2, 0.04], [-bargeD / 2, 0.04]], { perp: false, up: new THREE.Vector3(0, 1, 0) });
  return { top, soffit, barge, yAt, bell };
}

// ---------------------------------------------------------------------------
// ropes, paper streamers, ornaments
// ---------------------------------------------------------------------------

/**
 * Twisted multi-strand rope (shimenawa / suzu-no-o) along a center polyline.
 * radius(t) = overall rope radius. Returns one geometry with all strands.
 */
export function twistedRope(pts, { radius = 0.1, strands = 3, twist = 1.2, segs = 48, radial = 7, closed = false, uvV = 0.5, strandScale = 0.62, off = 0.5 } = {}) {
  const curve = typeof pts.getPointAt === "function" ? pts : new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, closed);
  const L = curve.getLength();
  const rf = typeof radius === 'function' ? radius : () => radius;
  const parts = [];
  for (let k = 0; k < strands; k++) {
    const sp = [];
    const ph = (k / strands) * TAU;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const P = curve.getPointAt(Math.min(t, 1));
      const N = frames.normals[i], B = frames.binormals[i];
      const a = ph + (t * L * TAU) / twist;
      const r = rf(t) * off;
      sp.push(P.clone().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r));
    }
    if (closed) sp.pop();
    const sc = new THREE.CatmullRomCurve3(sp, closed, 'centripetal');
    parts.push(tube(sc, { segs: Math.round(segs * 1.5), radial, radius: (t) => rf(t) * strandScale, uvU: 1, uvV, closed }));
  }
  return mergeParts(parts);
}

/** Zig-zag shide paper streamer hanging down from (0,0,0) in the XY plane (thin, two-sided). */
export function shide(h = 0.5, w = 0.07, th = 0.004) {
  const parts = [];
  const seg = h / 4;
  const offs = [0, w * 0.55, 0, w * 0.55];
  for (let k = 0; k < 4; k++) {
    const g = box(w, seg * 1.02, th, 0.5);
    T(g, [offs[k] - w * 0.2, -seg * (k + 0.5), 0], [0, (k % 2 ? 1 : -1) * 0.35, 0]);
    parts.push(g);
  }
  // small top tab
  parts.push(T(box(w * 0.5, seg * 0.35, th, 0.5), [-w * 0.2, seg * 0.1, 0]));
  return mergeParts(parts);
}

/** Onion-shaped giboshi finial (lathe), base at y=0. */
export function giboshiGeo(r = 0.12, seg = 14) {
  const pts = [
    [r * 0.55, 0], [r * 0.62, 0.02 * r / 0.12], [r * 0.62, 0.05 * r / 0.12], [r * 0.5, 0.07 * r / 0.12],
    [r * 0.5, 0.1 * r / 0.12], [r * 0.7, 0.12 * r / 0.12], [r * 0.7, 0.14 * r / 0.12], [r * 0.52, 0.16 * r / 0.12],
    [r * 0.85, 0.24 * r / 0.12], [r * 1.0, 0.33 * r / 0.12], [r * 0.9, 0.42 * r / 0.12], [r * 0.55, 0.5 * r / 0.12],
    [r * 0.22, 0.57 * r / 0.12], [r * 0.08, 0.63 * r / 0.12], [0.001, 0.7 * r / 0.12],
  ];
  return lathe(pts, seg);
}

/** Simple extruded shape helper (Shape in XY, extruded along +Z by depth, centered on z). */
export function extrudeShape(shape, depth, { bevel = 0, uv = 1, curveSegments = 8 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) / uv, a.getY(i) / uv);
  return g;
}

/** Recolor: add a constant vertex color to a geometry (for vertex-colored materials). */
export function paint(geo, color, alpha = null) {
  const n = geo.attributes.position.count;
  const size = alpha == null ? 3 : 4;
  const c = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    c[i * size] = color.r;
    c[i * size + 1] = color.g;
    c[i * size + 2] = color.b;
    if (size === 4) c[i * size + 3] = alpha;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, size));
  return geo;
}

/** Deterministic pick helpers. */
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export const range = (r, a, b) => a + (b - a) * r();
