// Geometry helpers for the festival props (course 3 「夏祭り花火ナイト」).
// All geometries produced here carry exactly position / normal / uv attributes and
// are indexed, so they can be merged freely.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Apply position / euler rotation (XYZ) / scale to a geometry in place. */
export function xf(geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) {
  _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  _q.setFromEuler(_e);
  if (typeof scl === 'number') _s.set(scl, scl, scl);
  else _s.set(scl[0], scl[1], scl[2]);
  _p.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/** Keep only position/normal/uv, make indexed, drop groups. */
export function clean(geo) {
  for (const k of Object.keys(geo.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

/** Merge a list of geometries into one (null entries ignored). */
export function merge(list) {
  const arr = list.filter(Boolean).map(clean);
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  return mergeGeometries(arr, false);
}

// ---------------------------------------------------------------------------
// UV helpers
// ---------------------------------------------------------------------------

/**
 * Box projected UVs (meters / size) keeping normals and index.
 * grain: axis that should map to texture v (wood grain direction): 'x' | 'y' | 'z'.
 */
export function boxUV(geo, size = 1, grain = 'y', ou = 0, ov = 0) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) {
      // top / bottom face: plane x-z
      if (grain === 'z') { u = x; v = z; } else { u = z; v = x; }
      if (grain === 'y') { u = x; v = z; }
    } else if (nx >= nz) {
      // side facing x: plane z-y
      if (grain === 'z') { u = y; v = z; } else { u = z; v = y; }
    } else {
      // side facing z: plane x-y
      if (grain === 'x') { u = y; v = x; } else { u = x; v = y; }
    }
    uv[i * 2] = u / size + ou;
    uv[i * 2 + 1] = v / size + ov;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Remap existing 0..1 UVs into an atlas rect [u0, v0, u1, v1]. */
export function remapUV(geo, r) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  }
  uv.needsUpdate = true;
  return geo;
}

/** Point every UV at one texel (solid color cell of an atlas). uv = [u, v]. */
export function solidUV(geo, uv) {
  const a = geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2);
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0], uv[1]);
  a.needsUpdate = true;
  geo.setAttribute('uv', a);
  return geo;
}

/** Scale / offset UVs. */
export function scaleUV(geo, su, sv = su, ou = 0, ov = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  uv.needsUpdate = true;
  return geo;
}

/** Planar UV from object-space positions (axis pair) into rect r, given the bounds. */
export function planarUV(geo, axisU, axisV, bounds, r = [0, 0, 1, 1]) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const get = (i, a) => (a === 'x' ? pos.getX(i) : a === 'y' ? pos.getY(i) : pos.getZ(i));
  const [u0, u1, v0, v1] = bounds;
  for (let i = 0; i < pos.count; i++) {
    const s = (get(i, axisU) - u0) / (u1 - u0);
    const t = (get(i, axisV) - v0) / (v1 - v0);
    uv[i * 2] = r[0] + s * (r[2] - r[0]);
    uv[i * 2 + 1] = r[1] + t * (r[3] - r[1]);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ---------------------------------------------------------------------------
// Primitive shortcuts
// ---------------------------------------------------------------------------

export function rbox(w, h, d, r = 0.02, seg = 1) {
  const rr = Math.max(0.0005, Math.min(r, Math.min(w, h, d) / 2 - 0.0005));
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 12, open = false, hs = 1) => new THREE.CylinderGeometry(rt, rb, h, seg, hs, open);
export const sphere = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);

/** Cylinder between two points. */
export function cylBetween(a, b, r, seg = 6, open = true) {
  const A = Array.isArray(a) ? V3(...a) : a;
  const B = Array.isArray(b) ? V3(...b) : b;
  const d = B.clone().sub(A);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return g;
}

/** Box beam between two points (square-ish section w × h; h along the "up" side). */
export function beamBetween(a, b, w, h, rounded = 0) {
  const A = Array.isArray(a) ? V3(...a) : a;
  const B = Array.isArray(b) ? V3(...b) : b;
  const d = B.clone().sub(A);
  const len = d.length();
  const g = rounded > 0 ? rbox(w, len, h, rounded) : box(w, len, h);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return g;
}

/**
 * Lathe around Y with u = 0.5 facing +Z (phiStart = PI) and v proportional to height
 * (0 at the lowest point, 1 at the highest).  points: [[r, y], ...] listed bottom → top
 * for outward normals.
 */
export function lathe(points, segments = 16, vByHeight = true, phiStart = Math.PI, phiLength = Math.PI * 2) {
  const geo = new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(Math.max(0, p[0]), p[1])), segments, phiStart, phiLength);
  if (vByHeight) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of points) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const hh = y1 - y0 || 1;
    for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - y0) / hh);
    uv.needsUpdate = true;
  }
  return geo;
}

/**
 * Regular grid surface. fn(s, t) → [x, y, z] with s, t in 0..1; uvFn(s, t) → [u, v].
 * Winding: s → +x, t → +y gives a +z facing surface. Use orient() to fix orientation.
 */
export function surface(nu, nv, fn, uvFn = (s, t) => [s, t]) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  let k = 0, q = 0;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv;
      const p = fn(s, t);
      pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2];
      const u = uvFn(s, t);
      uv[q++] = u[0]; uv[q++] = u[1];
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flip triangle winding (and recompute normals). */
export function flip(geo) {
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  geo.index.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Make the (area weighted) average face normal point along dir. */
export function orient(geo, dir) {
  const pos = geo.attributes.position, idx = geo.index.array;
  const a = V3(), b = V3(), c = V3(), n = V3(), sum = V3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
    n.subVectors(b, a).cross(c.sub(a));
    sum.add(n);
  }
  if (sum.x * dir[0] + sum.y * dir[1] + sum.z * dir[2] < 0) flip(geo);
  return geo;
}

/** Point on a sagging rope from a to b (parabolic sag). */
export function sagPoint(a, b, sag, t) {
  const p = V3().lerpVectors(a, b, t);
  p.y -= sag * 4 * t * (1 - t);
  return p;
}
export function sagPoints(a, b, sag, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(sagPoint(a, b, sag, i / n));
  return out;
}

/** Tube through points. */
export function tube(points, radius, radial = 5, tubular = null, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, tubular || Math.max(2, points.length * 2), radius, radial, closed);
}

/**
 * Hanging cloth in the XY plane, top edge at y = 0 from x = -w/2..w/2, hanging to y = -h.
 * folds: vertical pleats (sin in z) of amplitude `amp` and wavelength `wave`, growing towards
 * the bottom by `grow`. scallop: depth of a scalloped bottom edge (period = scallopW).
 * UV: u 0..1 across, v 1 (top) .. 0 (bottom).
 */
export function cloth({ w, h, nx = 16, ny = 4, amp = 0.02, wave = 0.3, grow = 0.5, phase = 0, bulge = 0, scallop = 0, scallopW = 0.5, swing = 0 }) {
  return surface(nx, ny, (s, t) => {
    const x = (s - 0.5) * w;
    const down = 1 - t; // 0 at top → 1 at bottom
    let y = -down * h;
    if (scallop > 0 && t === 0) {
      const f = ((x / scallopW) % 1 + 1) % 1;
      y += scallop * (1 - Math.pow(Math.sin(f * Math.PI), 0.8));
    }
    const z = Math.sin((x / wave) * Math.PI * 2 + phase) * amp * (1 - grow + grow * down)
      + bulge * Math.sin(s * Math.PI) * down + swing * down * down;
    return [x, y, z];
  }, (s, t) => [s, t]);
}

/**
 * Rectangular-section strip that follows a polyline (e.g. verge boards 破風).
 * The section hangs DOWN from each point by `h` and has thickness `w` across `side` vector.
 */
export function boardAlong(points, h, w, side = V3(1, 0, 0), uvLen = 1) {
  const n = points.length;
  const pos = [];
  const uv = [];
  const idx = [];
  const hw = side.clone().normalize().multiplyScalar(w / 2);
  let acc = 0;
  const corners = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (i > 0) acc += p.distanceTo(points[i - 1]);
    corners.push([
      p.clone().add(hw), p.clone().add(hw).setY(p.y - h),
      p.clone().sub(hw).setY(p.y - h), p.clone().sub(hw),
    ]);
    corners[i].acc = acc;
  }
  // 4 faces: outer (+side), bottom, inner (-side), top
  const faces = [[0, 1], [1, 2], [2, 3], [3, 0]];
  for (const [fa, fb] of faces) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const A = corners[i][fa], B = corners[i][fb];
      pos.push(A.x, A.y, A.z, B.x, B.y, B.z);
      uv.push(corners[i].acc / uvLen, 1, corners[i].acc / uvLen, 0);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Deformed icosahedron rock. */
export function rock(r, rand, detail = 1, squash = 0.7, rough = 0.28) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  // merge duplicate vertices so the noise is continuous
  const pos = g.attributes.position;
  const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const offs = new Map();
  const ax = rand() * 6.28, az = rand() * 6.28;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!offs.has(k)) offs.set(k, 1 + (rand() - 0.5) * rough * 2);
    const f = offs.get(k);
    const x = pos.getX(i) * f, y = pos.getY(i) * f, z = pos.getZ(i) * f;
    const yy = y > 0 ? y * squash : y * 0.35;
    pos.setXYZ(i, x * (1 + 0.15 * Math.sin(ax)), yy, z * (1 + 0.15 * Math.cos(az)));
  }
  g.deleteAttribute('normal');
  // re-index to share vertices for smooth normals
  return mergeVerts(g);
}

/** Merge coincident vertices (position only) then compute smooth normals + spherical uv. */
export function mergeVerts(g) {
  const pos = g.attributes.position;
  const map = new Map();
  const verts = [];
  const idx = [];
  const src = g.index ? g.index.array : null;
  const count = src ? src.length : pos.count;
  for (let n = 0; n < count; n++) {
    const i = src ? src[n] : n;
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let id = map.get(k);
    if (id === undefined) { id = verts.length / 3; map.set(k, id); verts.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    idx.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const uv = [];
  for (let i = 0; i < verts.length; i += 3) uv.push(verts[i] * 0.8, verts[i + 2] * 0.8 + verts[i + 1] * 0.5);
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// ---------------------------------------------------------------------------
// Japanese tiled roof
// ---------------------------------------------------------------------------

/**
 * Japanese roof with concave slopes, upswept corners and real thickness.
 * Local frame: eave outline W (x) × D (z) centred at the origin, eave top edge at y = 0.
 * type: 'hip' (寄棟 / 宝形 when W == D) | 'irimoya' (入母屋) | 'gable' (切妻) |
 *       'pent' (庇 ring band, uses hMax) | 'shed' (front-only 庇, uses hMax)
 * Returns geometries: { top, under, ridge, gable, verge, ridgeY }
 *   top   → roof tiles (UV: tile rows, 1 repeat = `tile` m, v runs up the slope)
 *   under → eave material: fascia band v∈[0.52,0.98], soffit band v∈[0.02,0.48], u repeat 0.6 m
 *   ridge → ridge + hip ridges + onigawara (plain tile material)
 *   gable → irimoya gable walls (box UV 1 m)
 *   verge → verge boards 破風 (box-ish UV 1 m)
 */
export function japaneseRoof(o) {
  const W = o.W, D = o.D;
  const type = o.type || 'hip';
  const H = D / 2;
  const hMax = Math.min(o.hMax ?? H, H);
  const rise = o.rise ?? H * 0.7;
  const curve = o.curve ?? 0.45;
  const sweep = o.sweep ?? 0.3;
  const sweepLen = o.sweepLen ?? Math.min(W, D) * 0.3;
  const sweepDepth = o.sweepDepth ?? Math.min(H * 0.8, 2);
  const thick = o.thick ?? 0.22;
  const soffitD = Math.min(o.soffit ?? 1.2, hMax);
  const tile = o.tile ?? 2;
  const segU = o.segU ?? 16;
  const segV = o.segV ?? 8;
  const hg = type === 'irimoya' ? H * (o.gableAt ?? 0.5) : H;
  const setback = o.setback ?? 0.3;
  const FT = 0.6;
  const ridgeH = o.ridgeH ?? 0.3;
  const ridgeW = o.ridgeW ?? 0.3;
  const hipR = o.hipR ?? 0.09;

  const yOf = (h) => { const t = h / H; return rise * ((1 - curve) * t + curve * t * t); };
  const lift = (e, h) => {
    const a = Math.max(0, 1 - e / sweepLen), b = Math.max(0, 1 - h / sweepDepth);
    return sweep * a * a * b * b;
  };

  const shrinkW = (h) => Math.max(0, W / 2 - h);
  const shrinkD = (h) => Math.max(0, D / 2 - h);
  const constW = () => W / 2;
  const distD = (h) => D / 2 - h;
  const distW = (h) => W / 2 - h;
  const planes = [];
  const want = o.sides || [1, 1, 1, 1];
  if (type === 'hip' || type === 'pent') {
    planes.push({ ang: 0, half: shrinkW, dist: distD, hTo: hMax, id: 0 });
    planes.push({ ang: Math.PI, half: shrinkW, dist: distD, hTo: hMax, id: 1 });
    planes.push({ ang: Math.PI / 2, half: shrinkD, dist: distW, hTo: hMax, id: 2 });
    planes.push({ ang: -Math.PI / 2, half: shrinkD, dist: distW, hTo: hMax, id: 3 });
  } else if (type === 'irimoya') {
    const half = (h) => W / 2 - Math.min(h, hg);
    planes.push({ ang: 0, half, dist: distD, hTo: H, id: 0, verge: true });
    planes.push({ ang: Math.PI, half, dist: distD, hTo: H, id: 1, verge: true });
    planes.push({ ang: Math.PI / 2, half: shrinkD, dist: distW, hTo: Math.min(H, hg + setback), id: 2 });
    planes.push({ ang: -Math.PI / 2, half: shrinkD, dist: distW, hTo: Math.min(H, hg + setback), id: 3 });
  } else if (type === 'gable') {
    planes.push({ ang: 0, half: constW, dist: distD, hTo: H, id: 0, ends: true });
    planes.push({ ang: Math.PI, half: constW, dist: distD, hTo: H, id: 1, ends: true });
  } else if (type === 'shed') {
    planes.push({ ang: 0, half: constW, dist: distD, hTo: hMax, id: 0, ends: true });
  }

  const tops = [], unders = [], ridges = [], gables = [], verges = [];

  // arc length along the slope (for tile v)
  const arcOf = (h) => {
    const n = 24;
    let acc = 0, py = 0;
    for (let i = 1; i <= n; i++) {
      const hh = (h * i) / n, y = yOf(hh);
      acc += Math.hypot(h / n, y - py);
      py = y;
    }
    return acc;
  };

  const rot = (x, y, z, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [x * c + z * s, y, -x * s + z * c];
  };

  for (const P of planes) {
    if (!want[P.id]) continue;
    const topPt = (s, t, down = 0) => {
      const h = t * P.hTo;
      const half = P.half(h);
      const a = (s - 0.5) * 2 * half;
      const e = half - Math.abs(a);
      const y = yOf(h) + lift(e, h) - down;
      return rot(a, y, P.dist(h), P.ang);
    };
    // top
    const top = surface(segU, segV, (s, t) => topPt(s, t), (s, t) => {
      const h = t * P.hTo;
      const a = (s - 0.5) * 2 * P.half(h);
      return [a / tile, arcOf(h) / tile];
    });
    orient(top, [0, 1, 0]);
    tops.push(top);
    // soffit
    const sd = Math.min(soffitD, P.hTo);
    const sv = Math.max(2, Math.round((segV * sd) / P.hTo));
    const soff = surface(segU, sv, (s, t) => {
      const h = t * sd;
      const half = P.half(h);
      const a = (s - 0.5) * 2 * half;
      const e = half - Math.abs(a);
      return rot(a, yOf(h) + lift(e, h) - thick, P.dist(h), P.ang);
    }, (s, t) => {
      const h = t * sd;
      const a = (s - 0.5) * 2 * P.half(h);
      return [a / FT, 0.48 - 0.46 * t];
    });
    orient(soff, [0, -1, 0]);
    unders.push(soff);
    // fascia (eave edge)
    const fas = surface(segU, 1, (s, t) => topPt(s, 0, (1 - t) * thick), (s, t) => {
      const a = (s - 0.5) * 2 * P.half(0);
      return [a / FT, 0.52 + 0.46 * t];
    });
    const out = rot(0, 0, 1, P.ang);
    orient(fas, out);
    unders.push(fas);
    // verge / end strips for gable & shed & irimoya upper part
    if (P.ends || P.verge) {
      for (const sgn of [-1, 1]) {
        const h0 = P.verge ? hg : 0;
        const n = Math.max(2, Math.round(segV * (P.hTo - h0) / P.hTo));
        const strip = surface(n, 1, (s, t) => {
          const h = h0 + s * (P.hTo - h0);
          const half = P.half(h);
          const a = sgn * half;
          const y = yOf(h) + lift(0, h) - (1 - t) * thick;
          return rot(a, y, P.dist(h), P.ang);
        }, (s, t) => [(s * (P.hTo - h0)) / FT, 0.52 + 0.46 * t]);
        orient(strip, rot(sgn, 0, 0, P.ang));
        unders.push(strip);
        // verge board (破風板) below the tiles
        if (o.vergeBoard !== false) {
          const pts = [];
          for (let i = 0; i <= n; i++) {
            const h = h0 + (i / n) * (P.hTo - h0);
            const half = P.half(h);
            const p = rot(sgn * (half + 0.02), yOf(h) + lift(0, h) - thick * 0.6, P.dist(h), P.ang);
            pts.push(V3(...p));
          }
          const side = V3(...rot(1, 0, 0, P.ang));
          verges.push(boardAlong(pts, o.vergeH ?? 0.32, o.vergeW ?? 0.07, side, 1));
        }
      }
    }
  }

  // ridge along x
  const ridgeY = yOf(H);
  const ridgeTop = ridgeY + ridgeH * 0.6;
  let ridgeHalf = 0;
  if (type === 'hip') ridgeHalf = Math.max(0, W / 2 - H);
  if (type === 'irimoya') ridgeHalf = W / 2 - hg;
  if (type === 'gable') ridgeHalf = W / 2;
  if (type === 'hip' || type === 'irimoya' || type === 'gable') {
    if (ridgeHalf > 0.05) {
      const L = ridgeHalf * 2 + (type === 'hip' ? ridgeW : 0.1);
      const rg = rbox(L, ridgeH, ridgeW, Math.min(0.06, ridgeH * 0.3), 1);
      rg.translate(0, ridgeY + ridgeH * 0.3, 0);
      boxUV(rg, 1, 'x');
      ridges.push(rg);
      // cap tile rounded on top
      const cap = cyl(ridgeW * 0.36, ridgeW * 0.36, L + 0.02, 8, false);
      cap.rotateZ(Math.PI / 2);
      cap.translate(0, ridgeY + ridgeH * 0.62, 0);
      ridges.push(cap);
      // onigawara at both ends
      if (o.oni !== false) {
        for (const sgn of [-1, 1]) {
          const oni = rbox(0.12, ridgeH * 1.9, ridgeW * 1.5, 0.04, 1);
          oni.translate(sgn * (L / 2 + 0.02), ridgeY + ridgeH * 0.65, 0);
          boxUV(oni, 1);
          ridges.push(oni);
          const curl = cyl(0.07, 0.07, 0.14, 8);
          curl.rotateZ(Math.PI / 2);
          curl.translate(sgn * (L / 2 + 0.02), ridgeY + ridgeH * 1.55, 0);
          ridges.push(curl);
        }
      }
    }
  }
  // hip ridges (隅棟)
  const hipTo = type === 'hip' ? H : type === 'irimoya' ? hg : type === 'pent' ? hMax : 0;
  if (hipTo > 0 && o.hips !== false && (type === 'hip' || type === 'irimoya' || type === 'pent')) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pts = [];
        const n = 8;
        for (let i = 0; i <= n; i++) {
          const h = (i / n) * hipTo;
          const hx = type === 'irimoya' ? W / 2 - h : shrinkW(h);
          pts.push(V3(sx * (hx), yOf(h) + lift(0, h) + hipR * 0.8, sz * (D / 2 - h)));
        }
        // tip
        const t0 = pts[0].clone();
        const dirOut = V3(sx, 0, sz).normalize().multiplyScalar(0.12);
        pts.unshift(t0.clone().add(dirOut).add(V3(0, hipR * 0.9, 0)));
        ridges.push(tube(pts, hipR, 5, 11));
      }
    }
  }
  // irimoya: descending verge ridges + gable walls
  if (type === 'irimoya') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pts = [];
        const n = 6;
        for (let i = 0; i <= n; i++) {
          const h = hg + (i / n) * (H - hg);
          pts.push(V3(sx * (W / 2 - hg - 0.05), yOf(h) + hipR * 0.8, sz * (D / 2 - h)));
        }
        ridges.push(tube(pts, hipR * 0.85, 5, 8));
      }
      // gable wall (triangle following the underside)
      const xg = sx * (W / 2 - hg - setback);
      const n = 8;
      const gw = surface(1, n, (s, t) => {
        const h = hg + t * (H - hg);
        const z = (s - 0.5) * 2 * (D / 2 - h);
        return [xg, yOf(h) - thick - (t === 0 ? 0.05 : 0), z];
      }, (s, t) => [0, 0]);
      orient(gw, [sx, 0, 0]);
      boxUV(gw, 1);
      gables.push(gw);
    }
  }

  return {
    top: merge(tops),
    under: merge(unders),
    ridge: merge(ridges.map((g) => (g.attributes.uv ? g : boxUV(g, 1)))),
    gable: gables.length ? merge(gables) : null,
    verge: verges.length ? merge(verges) : null,
    ridgeY,
    yOf,
    thick,
  };
}
