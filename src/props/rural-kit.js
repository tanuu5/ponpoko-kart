// Shared helpers for the rural prop modules (rural-*.js). Not props themselves:
// nothing here is named create* so the preview grid ignores it.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { getMat, mat, canvasTexture, TEX } from './materials.js';
import { rng, mesh } from './util.js';

export { THREE, getMat, mat, canvasTexture, TEX, rng, mesh };

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const PI = Math.PI;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Apply translation / rotation (Euler XYZ) / scale to a geometry in place (scale first). */
export function xf(geo, pos = null, rot = null, scl = null) {
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, rot && rot[3] ? rot[3] : 'XYZ');
  _q.setFromEuler(_e);
  if (scl == null) _s.set(1, 1, 1);
  else if (typeof scl === 'number') _s.setScalar(scl);
  else _s.set(scl[0], scl[1], scl[2]);
  _p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/** Multiply existing UVs. */
export function uvScale(geo, su, sv = su) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

/** Box/tri-planar UV projection that keeps the geometry's own normals. size = meters per repeat. */
export function boxUV(geo, size = 1) {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / size;
    uv[i * 2 + 1] = v / size;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * Box UV chosen per triangle from its face normal (no smeared triangles on smooth organic meshes).
 * Returns a non-indexed geometry (keeps smooth vertex normals / colours).
 */
export function faceBoxUV(geo, size = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = V3(), b = V3(), c = V3(), n = V3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const nx = Math.abs(n.x), ny = Math.abs(n.y), nz = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      let u, v;
      if (ny >= nx && ny >= nz) { u = p.x; v = p.z; } else if (nx >= nz) { u = p.z; v = p.y; } else { u = p.x; v = p.y; }
      uv[(i + k) * 2] = u / size;
      uv[(i + k) * 2 + 1] = v / size;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Rebuild smooth normals (merging coincident vertices), then metric box UVs. */
export function smoothNormals(geo, uvSize = 1) {
  const g = geo.clone();
  g.deleteAttribute('normal');
  if (g.attributes.uv) g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return boxUV(m, uvSize);
}

/** Set a constant vertex color on a geometry (for vertexColors materials). */
export function tint(geo, color) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// ---------------------------------------------------------------------------
// Primitive builders (all with sensible metric UVs)
// ---------------------------------------------------------------------------

/** Plain box with metric box UVs. */
export function box(w, h, d, uvSize = 1) {
  return boxUV(new THREE.BoxGeometry(w, h, d), uvSize);
}

const _cboxCache = new Map();
/** Chamfered box (44 tris, flat facets => crisp highlight on every edge). */
export function cbox(w, h, d, c = 0.015, uvSize = 1) {
  c = Math.min(c, w * 0.3, h * 0.3, d * 0.3);
  if (c <= 0.0005) return box(w, h, d, uvSize);
  const key = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)},${c.toFixed(4)},${uvSize}`;
  let g = _cboxCache.get(key);
  if (!g) {
    const x = w / 2, y = h / 2, z = d / 2;
    const pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(V3(sx * x, sy * (y - c), sz * (z - c)));
      pts.push(V3(sx * (x - c), sy * y, sz * (z - c)));
      pts.push(V3(sx * (x - c), sy * (y - c), sz * z));
    }
    g = boxUV(new ConvexGeometry(pts), uvSize);
    _cboxCache.set(key, g);
  }
  return g.clone();
}

/** Rounded box (RoundedBoxGeometry) with per-face metric UVs. */
export function rbox(w, h, d, r = 0.03, segs = 2, uvSize = 1) {
  const g = new RoundedBoxGeometry(w, h, d, segs, r);
  const pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
  for (const grp of g.groups) {
    const axis = grp.materialIndex >> 1;
    for (let k = grp.start; k < grp.start + grp.count; k++) {
      const i = idx ? idx.getX(k) : k;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let u, v;
      if (axis === 0) { u = z; v = y; } else if (axis === 1) { u = x; v = z; } else { u = x; v = y; }
      uv.setXY(i, u / uvSize, v / uvSize);
    }
  }
  g.clearGroups();
  return g;
}

/**
 * Wooden timber whose grain runs along its length. Built along Y then rotated.
 * axis: 'x' | 'y' | 'z'. a/b = cross-section sizes (a along the first perpendicular axis).
 */
export function timber(len, a, b, axis = 'y', c = 0.012) {
  const g = cbox(a, len, b, c);
  if (axis === 'x') g.rotateZ(-PI / 2); // Y -> X ; a now along Y
  else if (axis === 'z') g.rotateX(PI / 2); // Y -> Z ; b now along Y
  return g;
}

/** Cylinder with metric UVs (u around, v along). */
export function cyl(rt, rb, h, seg = 12, open = false, uvSize = 1, hSeg = 1) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, hSeg, open);
  return uvScale(g, (PI * (rt + rb)) / uvSize, h / uvSize);
}

/** Orient a geometry built along +Y so that it goes from p0 to p1 (upHint picks the roll). */
export function alignY(geo, p0, p1, upHint = null) {
  const dir = V3().subVectors(p1, p0);
  const len = dir.length();
  const y = dir.clone().divideScalar(len || 1);
  let hint = upHint ? upHint.clone() : V3(0, 0, 1);
  if (Math.abs(hint.dot(y)) > 0.98) hint = Math.abs(y.x) < 0.9 ? V3(1, 0, 0) : V3(0, 0, 1);
  const x = V3().crossVectors(y, hint).normalize();
  const z = V3().crossVectors(x, y).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(V3().addVectors(p0, p1).multiplyScalar(0.5));
  geo.applyMatrix4(m);
  return geo;
}

/** Box/timber between two points; w = side width, h = thickness roughly toward upHint. */
export function barBetween(p0, p1, w, h, upHint = V3(0, 1, 0), c = 0.01, extend = 0) {
  const len = p0.distanceTo(p1) + extend * 2;
  const g = cbox(w, len, h, c);
  return alignY(g, p0, p1, upHint);
}

/** Cylinder between two points. */
export function rodBetween(p0, p1, r0, r1 = r0, seg = 8, open = false, extend = 0) {
  const len = p0.distanceTo(p1) + extend * 2;
  const g = cyl(r1, r0, len, seg, open, 1);
  return alignY(g, p0, p1);
}

// ---------------------------------------------------------------------------
// Grid / loft / sweep
// ---------------------------------------------------------------------------

function flipGeo(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  g.index.needsUpdate = true;
}

/**
 * Surface through rows of points (all rows the same length).
 * Quads connect row i -> i+1 and column j -> j+1 (wrapping when closed).
 * Default UVs: u = arc length along the row * us, v = arc length along the column * vs.
 * uvFn(p, i, j, uArc, vArc) => [u, v] overrides.
 * center (Vector3): if given, the surface is flipped so normals face away from it.
 * Duplicate a row (or a point in every row) to get a crisp crease.
 */
export function gridGeo(rows, opts = {}) {
  const { closed = false, us = 1, vs = 1, uvFn = null, center = null, awayDir = null } = opts;
  const R = rows.length, C = rows[0].length;
  const cols = closed ? C + 1 : C;
  const n = R * cols;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const vAcc = new Float64Array(cols);
  for (let i = 0; i < R; i++) {
    const row = rows[i];
    let uAcc = 0;
    for (let j = 0; j < cols; j++) {
      const p = row[j % C];
      if (j > 0) uAcc += p.distanceTo(row[(j - 1) % C]);
      if (i > 0) vAcc[j] += p.distanceTo(rows[i - 1][j % C]);
      const k = i * cols + j;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      if (uvFn) {
        const t = uvFn(p, i, j, uAcc, vAcc[j]); // j may equal C for the closing seam column
        uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1];
      } else {
        uv[k * 2] = uAcc * us; uv[k * 2 + 1] = vAcc[j] * vs;
      }
    }
  }
  const idx = [];
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols + 1, d = a + cols;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  if (closed) {
    const t = V3();
    for (let i = 0; i < R; i++) {
      const a = i * cols, b = a + cols - 1;
      t.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b));
      if (t.lengthSq() > 1e-12) t.normalize();
      nor.setXYZ(a, t.x, t.y, t.z);
      nor.setXYZ(b, t.x, t.y, t.z);
    }
  }
  if (center || awayDir) {
    let s = 0;
    for (let k = 0; k < n; k++) {
      if (awayDir) s += awayDir.x * nor.getX(k) + awayDir.y * nor.getY(k) + awayDir.z * nor.getZ(k);
      else s += (pos[k * 3] - center.x) * nor.getX(k) + (pos[k * 3 + 1] - center.y) * nor.getY(k) + (pos[k * 3 + 2] - center.z) * nor.getZ(k);
    }
    if (s < 0) flipGeo(g);
  }
  g.userData.cols = cols;
  g.userData.rows = R;
  return g;
}

/** Extract the quad strips between rows r0..r1 of a gridGeo result (keeps its normals). */
export function gridRows(g, r0, r1) {
  const per = (g.userData.cols - 1) * 6;
  return extractTris(g, r0 * per, r1 * per);
}

function extractTris(g, start, end) {
  const idx = g.index.array;
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'color']) {
    const a = g.attributes[k];
    if (!a) continue;
    const sz = a.itemSize;
    const arr = new Float32Array((end - start) * sz);
    for (let t = start; t < end; t++) {
      const vi = idx[t];
      for (let c = 0; c < sz; c++) arr[(t - start) * sz + c] = a.array[vi * sz + c];
    }
    out.setAttribute(k, new THREE.BufferAttribute(arr, sz));
  }
  return out;
}

/** Polygon cap (fan-triangulated via ShapeUtils) for a planar-ish ring of points. */
export function capGeo(points, normalHint) {
  // project to plane
  const c = V3();
  points.forEach((p) => c.add(p));
  c.divideScalar(points.length);
  const n = normalHint.clone().normalize();
  let t = Math.abs(n.x) > 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
  const b = V3().crossVectors(n, t).normalize();
  t = V3().crossVectors(b, n);
  const contour = points.map((p) => new THREE.Vector2(V3().subVectors(p, c).dot(t), V3().subVectors(p, c).dot(b)));
  let pts = points;
  let con = contour;
  if (!THREE.ShapeUtils.isClockWise(con)) { /* ccw ok */ } else { con = con.slice().reverse(); pts = pts.slice().reverse(); }
  const faces = THREE.ShapeUtils.triangulateShape(con, []);
  const pos = [], nor = [], uv = [];
  for (const f of faces) {
    for (const i of f) {
      pos.push(pts[i].x, pts[i].y, pts[i].z);
      nor.push(n.x, n.y, n.z);
      uv.push(con[i].x, con[i].y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // ensure winding matches normal
  const p0 = V3(pos[0], pos[1], pos[2]), p1 = V3(pos[3], pos[4], pos[5]), p2 = V3(pos[6], pos[7], pos[8]);
  const fn = V3().subVectors(p1, p0).cross(V3().subVectors(p2, p0));
  if (fn.dot(n) < 0) {
    const a = g.attributes.position.array, u = g.attributes.uv.array;
    for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const tmp = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = tmp; }
    for (let i = 0; i < u.length; i += 6) for (let k = 0; k < 2; k++) { const tmp = u[i + 2 + k]; u[i + 2 + k] = u[i + 4 + k]; u[i + 4 + k] = tmp; }
  }
  return g;
}

/**
 * Sweep a 2D cross-section along a 3D path.
 * profile: array of [x, y] in the section plane (x = sideways, y = "up"); closed loop unless open.
 * Put a point twice in a row for a crisp crease.
 * up: reference up vector for the section frame (default +Y; for vertical paths pass another).
 * scaleFn(t) optional per-path-point scale of the profile.
 */
export function sweep(path, profile, opts = {}) {
  const { up = V3(0, 1, 0), closed = true, capStart = false, capEnd = false, us = 1, vs = 1, scaleFn = null, center = null, uvFn = null } = opts;
  const rows = [];
  const N = path.length;
  const frames = [];
  for (let i = 0; i < N; i++) {
    const tng = V3();
    if (i > 0) tng.add(V3().subVectors(path[i], path[i - 1]).normalize());
    if (i < N - 1) tng.add(V3().subVectors(path[i + 1], path[i]).normalize());
    tng.normalize();
    let side = V3().crossVectors(tng, up);
    if (side.lengthSq() < 1e-8) side = V3().crossVectors(tng, V3(1, 0, 0));
    side.normalize();
    const u2 = V3().crossVectors(side, tng).normalize();
    frames.push({ side, up: u2, tng });
    const s = scaleFn ? scaleFn(i / (N - 1), i) : 1;
    const sx = Array.isArray(s) ? s[0] : s, sy = Array.isArray(s) ? s[1] : s;
    rows.push(profile.map(([x, y]) => V3().copy(path[i]).addScaledVector(side, x * sx).addScaledVector(u2, y * sy)));
  }
  const g = gridGeo(rows, { closed, us, vs, uvFn, center });
  if (closed && !center) {
    // orient outward: compare normals with (p - ring centroid)
    const nor = g.attributes.normal, pos = g.attributes.position, cols = g.userData.cols;
    let sAcc = 0;
    for (let i = 0; i < N; i++) {
      const c = V3();
      rows[i].forEach((p) => c.add(p));
      c.divideScalar(rows[i].length);
      for (let j = 0; j < cols; j++) {
        const k = i * cols + j;
        sAcc += (pos.getX(k) - c.x) * nor.getX(k) + (pos.getY(k) - c.y) * nor.getY(k) + (pos.getZ(k) - c.z) * nor.getZ(k);
      }
    }
    if (sAcc < 0) flipGeo(g);
  }
  if (!capStart && !capEnd) return g;
  const parts = [g];
  if (capStart) parts.push(capGeo(dedupe(rows[0]), frames[0].tng.clone().negate()));
  if (capEnd) parts.push(capGeo(dedupe(rows[N - 1]), frames[N - 1].tng.clone()));
  return merge(parts);
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) if (!out.length || out[out.length - 1].distanceToSquared(p) > 1e-10) out.push(p);
  if (out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) < 1e-10) out.pop();
  return out;
}

/** Rectangle profile (centered) with crisp corners, optional chamfer. */
export function rectProfile(w, h, ch = 0, cx = 0, cy = 0) {
  const x = w / 2, y = h / 2;
  let pts;
  if (ch <= 0) pts = [[x, -y], [x, y], [-x, y], [-x, -y]];
  else pts = [[x, -y + ch], [x, y - ch], [x - ch, y], [-x + ch, y], [-x, y - ch], [-x, -y + ch], [-x + ch, -y], [x - ch, -y]];
  const out = [];
  for (const p of pts) { out.push([p[0] + cx, p[1] + cy]); out.push([p[0] + cx, p[1] + cy]); }
  return out;
}

/** Circle profile. */
export function circleProfile(r, seg = 8, sx = 1, sy = 1) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * PI * 2;
    out.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]);
  }
  return out;
}

/** Tapered tube along a curve (THREE.Curve), radius rFn(t). */
export function taperTube(curve, tubular, radial, rFn, opts = {}) {
  const pts = [];
  for (let i = 0; i <= tubular; i++) pts.push(curve.getPointAt(i / tubular));
  const frames = curve.computeFrenetFrames(tubular, false);
  const rows = [];
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const r = rFn(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const row = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * PI * 2;
      row.push(V3().copy(pts[i]).addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r));
    }
    rows.push(row);
  }
  const g = gridGeo(rows, { closed: true, us: opts.us ?? 1, vs: opts.vs ?? 1 });
  // orient outward: compare normal with (p - axis point)
  const nor = g.attributes.normal, pos = g.attributes.position;
  let s = 0;
  const cols = g.userData.cols;
  for (let i = 0; i <= tubular; i++) for (let j = 0; j < cols; j++) {
    const k = i * cols + j;
    s += (pos.getX(k) - pts[i].x) * nor.getX(k) + (pos.getY(k) - pts[i].y) * nor.getY(k) + (pos.getZ(k) - pts[i].z) * nor.getZ(k);
  }
  if (s < 0) flipGeo(g);
  if (opts.capEnd) {
    const last = rows[rows.length - 1];
    const tip = pts[pts.length - 1].clone().addScaledVector(curve.getTangentAt(1), rFn(1) * 0.6);
    const cap = coneCap(last, tip);
    return merge([g, cap]);
  }
  return g;
}

function coneCap(ring, tip) {
  const pos = [];
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j], b = ring[(j + 1) % ring.length];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // orient outward from ring centroid
  const c = V3();
  ring.forEach((p) => c.add(p));
  c.divideScalar(ring.length);
  const n = g.attributes.normal;
  if ((tip.x - c.x) * n.getX(0) + (tip.y - c.y) * n.getY(0) + (tip.z - c.z) * n.getZ(0) < 0) {
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// ---------------------------------------------------------------------------
// Noise + organic blobs
// ---------------------------------------------------------------------------
function hash3(x, y, z, s) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth 3D value noise in [-1, 1]. */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf_ = x - xi, yf = y - yi, zf = z - zi;
  const u = smooth(xf_), v = smooth(yf), w = smooth(zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const h = hash3(xi + dx, yi + dy, zi + dz, seed);
    r += h * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r * 2 - 1;
}

/**
 * Lumpy blob (icosphere displaced by noise), smooth normals.
 * opts: detail, amp, freq, seed, scale [sx,sy,sz], flatBottom (0..1)
 */
export function blobGeo(radius, opts = {}) {
  const { detail = 2, amp = 0.18, freq = 1.6, seed = 1, scale = [1, 1, 1], flatBottom = 0 } = opts;
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise3(x * freq + seed * 7.1, y * freq, z * freq, seed) * 0.7 + noise3(x * freq * 2.3, y * freq * 2.3 + seed, z * freq * 2.3, seed + 3) * 0.3;
    let r = radius * (1 + amp * n);
    let yy = y * r * scale[1];
    if (flatBottom > 0 && yy < -radius * scale[1] * (1 - flatBottom)) yy = lerp(yy, -radius * scale[1] * (1 - flatBottom), 0.8);
    pos.setXYZ(i, x * r * scale[0], yy, z * r * scale[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** Vertex-color gradient by height (local y range) plus per-vertex jitter. */
export function colorByHeight(geo, cLow, cHigh, jitter = 0.04, seed = 1, y0 = null, y1 = null) {
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const lo = y0 ?? geo.boundingBox.min.y, hi = y1 ?? geo.boundingBox.max.y;
  const a = new THREE.Color(cLow), b = new THREE.Color(cHigh), c = new THREE.Color();
  const arr = new Float32Array(pos.count * 3);
  const r = rng(seed);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) - lo) / Math.max(1e-4, hi - lo), 0, 1);
    c.copy(a).lerp(b, t);
    const j = 1 + (r() - 0.5) * 2 * jitter;
    arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// ---------------------------------------------------------------------------
// Merging bag: collect geometry per material, output one mesh per material.
// ---------------------------------------------------------------------------
function prep(geo, vc) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(vc && k === 'color')) g.deleteAttribute(k);
  }
  if (vc && !g.attributes.color) tint(g, 0xffffff);
  if (vc && g.attributes.color.itemSize !== 3) tint(g, 0xffffff);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export function merge(geos) {
  const vc = geos.some((g) => g.attributes.color);
  const list = geos.map((g) => prep(g, vc));
  return list.length === 1 ? list[0] : mergeGeometries(list, false);
}

export class Bag {
  constructor() { this.buckets = new Map(); }
  /** Add a geometry (already in prop-local coordinates). cast=false for tiny parts. */
  add(geo, material, cast = true) {
    if (!geo) return geo;
    const key = material.uuid + (cast ? '|c' : '|n');
    let b = this.buckets.get(key);
    if (!b) { b = { material, cast, geos: [] }; this.buckets.set(key, b); }
    b.geos.push(geo);
    return geo;
  }
  /** Merge everything into meshes added to `group`. */
  build(group = new THREE.Group(), receive = true) {
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const vc = !!b.material.vertexColors;
      const list = b.geos.map((g) => prep(g, vc));
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      group.add(mesh(merged, b.material, { cast: b.cast, receive }));
    }
    this.buckets.clear();
    return group;
  }
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------
export const FONT_MIN = "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
export const FONT_GOTH = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',sans-serif";
export const FONT_MARU = "'Hiragino Maru Gothic ProN','Hiragino Sans','Yu Gothic',sans-serif";

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** Fit text into width (shrinks font px). */
export function fitText(g, text, x, y, maxW, px, family, weight = 'bold') {
  let s = px;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > 6) { s -= 1; g.font = `${weight} ${s}px ${family}`; }
  g.fillText(text, x, y);
}

/**
 * Build a tangent-space normal map from a height function h(u,v) (u,v in [0,1), tileable).
 * strength scales slopes.
 */
export function normalMapTexture(key, w, h, heightFn, strength = 2) {
  return canvasTexture(key, w, h, (g) => {
    const H = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = heightFn(x / w, y / h);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = H[y * w + ((x - 1 + w) % w)], r = H[y * w + ((x + 1) % w)];
        const d = H[((y + 1) % h) * w + x], u = H[((y - 1 + h) % h) * w + x];
        // canvas y goes down; texture v goes up -> dh/dv = (u - d)
        let nx = -(r - l) * strength * w * 0.5;
        let ny = -(u - d) * strength * h * 0.5;
        let nz = 1;
        const L = Math.hypot(nx, ny, nz);
        nx /= L; ny /= L; nz /= L;
        const k = (y * w + x) * 4;
        img.data[k] = (nx * 0.5 + 0.5) * 255;
        img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
}
