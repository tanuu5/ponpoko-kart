// ぽんぽこカート — kart + chibi driver models.
//
// createKartModel(characterId, previewPose?) → {
//   root, body, chassis, driver, gliderMount, exhaustPoints, rearWheelContacts, radius, character,
//   animate(dt, s), dispose()
// }
// root  : engine-owned transform (origin = ground contact center, +Z forward, +Y up, right side = -X)
// body  : child of root; drift yaw / trick rotation (around the center of mass, 0.5 m up) / squash /
//         boost pitch are applied here
//         └ 4 wheel pivots (steer yaw, spin, suspension droop) and `chassis` (roll, engine jitter)
//             └ kart parts, steering wheel, driver, gliderMount, flags
// gliderMount : Object3D at the driver's raised right hand; add createGlider().group to it.
// exhaustPoints [left, right] / rearWheelContacts [left(+X), right(-X)] are root-space Vector3s;
//   animate() updates them in place so they follow drift yaw / tricks (keep the references).
// animate(dt, s) with s = { speed, steer, driftDir, boosting, airborne, gliding, trickT, trickType,
//   squash, spinOut, time } — every field optional; all motion is damped.
// previewPose (preview only): an animate() state that is applied and settled at creation,
//   plus { glider: 0..1 } to attach an opened glider.
//
// Also: createDriverModel(id) (portraits), createAllKartsLineup(pose, cols) (preview),
//   disposeKartResources() (frees the shared caches), and a few geometry helpers used by the items.
// Geometry and materials are cached and shared between karts (per character where colors differ);
// dispose() therefore only detaches the kart and frees its per-instance flag geometry.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHARACTERS, getCharacter } from './characters.js';
import { createGlider } from './Glider.js';

const { clamp, lerp, degToRad } = THREE.MathUtils;
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X_AXIS = Object.freeze(new THREE.Vector3(1, 0, 0));
const Y_AXIS = Object.freeze(new THREE.Vector3(0, 1, 0));
const Z_AXIS = Object.freeze(new THREE.Vector3(0, 0, 1));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const css = (hex) => '#' + new THREE.Color(hex).getHexString();

// ---------------------------------------------------------------------------
// Generic geometry helpers (also used by the item models)
// ---------------------------------------------------------------------------

/** Average normals of coincident vertices (fixes UV seams / poles of sphere-derived shapes). */
export function smoothSeams(geo) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let a = map.get(k);
    if (!a) map.set(k, (a = []));
    a.push(i);
  }
  const t = new THREE.Vector3();
  for (const a of map.values()) {
    if (a.length < 2) continue;
    t.set(0, 0, 0);
    for (const i of a) t.x += n.getX(i), t.y += n.getY(i), t.z += n.getZ(i);
    t.normalize();
    for (const i of a) n.setXYZ(i, t.x, t.y, t.z);
  }
  return geo;
}

/**
 * Superellipsoid built from a UV sphere (smooth normals). n1 = horizontal (xz) exponent,
 * n2 = vertical exponent (2 = ellipsoid, 3–5 = rounded box). deform(v) may move vertices.
 */
export function superEllipsoid(rx, ry, rz, o = {}) {
  const n1 = o.n1 ?? 2;
  const n2 = o.n2 ?? 2;
  const g = new THREE.SphereGeometry(1, o.ws ?? 32, o.hs ?? 16);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const h = Math.pow(Math.pow(Math.abs(v.x), n1) + Math.pow(Math.abs(v.z), n1), n2 / n1);
    const s = Math.pow(h + Math.pow(Math.abs(v.y), n2), -1 / n2);
    v.multiplyScalar(s);
    v.set(v.x * rx, v.y * ry, v.z * rz);
    if (o.deform) o.deform(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  smoothSeams(g);
  return g;
}

/** Lathe around +Y from [[r, y], ...] with arc-length v coordinates. */
export function lathe(profile, segments = 24, phiStart = 0, phiLength = TAU) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  const len = [0];
  for (let j = 1; j < pts.length; j++) len.push(len[j - 1] + pts[j].distanceTo(pts[j - 1]));
  const total = len[len.length - 1] || 1;
  const uv = g.attributes.uv;
  for (let i = 0; i <= segments; i++) for (let j = 0; j < pts.length; j++) uv.setY(i * pts.length + j, len[j] / total);
  return g;
}

/** Profile v-coordinates (arc length fractions) of a lathe profile. */
function profileV(profile) {
  const len = [0];
  for (let j = 1; j < profile.length; j++) {
    const dx = profile[j][0] - profile[j - 1][0];
    const dy = profile[j][1] - profile[j - 1][1];
    len.push(len[j - 1] + Math.hypot(dx, dy));
  }
  return len.map((l) => l / len[len.length - 1]);
}

/** Quaternion whose +Z points along n and +Y is as close as possible to `up`. */
function frameQuat(n, up = V(0, 1, 0)) {
  const z = n.clone().normalize();
  let x = new THREE.Vector3().crossVectors(up, z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Quaternion rotating +Y onto direction d. */
function yTo(d) {
  return new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
}

function eulerQ(x = 0, y = 0, z = 0, order = 'XYZ') {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));
}

/** Quaternion for a basis whose +Y = yDir and +Z ≈ zHint. */
function basisQuat(yDir, zHint) {
  const y = yDir.clone().normalize();
  const z = zHint.clone().addScaledVector(y, -zHint.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Bend a geometry built along +Y so it curls toward +Z (curvature k = 1/radius). */
export function bendAlongY(geo, k) {
  if (Math.abs(k) < 1e-6) return geo;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = k * y;
    const s = Math.sin(a);
    const c = Math.cos(a);
    p.setXYZ(i, x, s / k - z * s, (1 - c) / k + z * c);
  }
  geo.computeVertexNormals();
  if (geo.index) smoothSeams(geo);
  return geo;
}

/** Fluffy tail lathe along +Y: length L, max radius R, base radius r0. */
function tailLathe(L, R, r0, segs = 13, radial = 14) {
  const prof = [[0, -0.005]];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    let r = r0 + (R - r0) * Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.7) * 0.92 + 0.04));
    if (t > 0.8) r *= Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2));
    prof.push([i === segs ? 0 : r, t * L]);
  }
  return lathe(prof, radial);
}

function flipWinding(g) {
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
  } else {
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name];
      for (let i = 0; i < a.count; i += 3) {
        for (let c = 0; c < a.itemSize; c++) {
          const t = a.getComponent(i + 1, c);
          a.setComponent(i + 1, c, a.getComponent(i + 2, c));
          a.setComponent(i + 2, c, t);
        }
      }
    }
  }
}

function prepForMerge(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/**
 * Collects geometry per material slot (string key) and merges it.
 * add(slot, geo, pos=[x,y,z] | Vector3, rot=[x,y,z] | Quaternion, scale=number | [x,y,z])
 */
export class PartBuilder {
  constructor() {
    this.slots = new Map();
  }
  add(slot, geo, pos, rot, scl) {
    const g = geo.clone();
    const p = pos ? (pos.isVector3 ? pos : V(pos[0], pos[1], pos[2])) : V();
    const q = rot ? (rot.isQuaternion ? rot : eulerQ(rot[0], rot[1], rot[2], rot[3] || 'XYZ')) : new THREE.Quaternion();
    const s = scl == null ? V(1, 1, 1) : typeof scl === 'number' ? V(scl, scl, scl) : scl.isVector3 ? scl : V(scl[0], scl[1], scl[2]);
    const m = new THREE.Matrix4().compose(p, q, s);
    g.applyMatrix4(m);
    if (m.determinant() < 0) flipWinding(g);
    this.addRaw(slot, g);
    return g;
  }
  addRaw(slot, g) {
    let a = this.slots.get(slot);
    if (!a) this.slots.set(slot, (a = []));
    a.push(prepForMerge(g));
  }
  /** Merge into Map(slot → BufferGeometry). */
  merge() {
    const out = new Map();
    for (const [slot, geos] of this.slots) {
      const m = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      m.computeBoundingSphere();
      out.set(slot, m);
    }
    return out;
  }
}

/** Instantiate merged slot geometries with a slot→material map. */
function meshesFromSlots(merged, mats, parent, { cast = true, receive = true, noCast = [] } = {}) {
  for (const [slot, geo] of merged) {
    const mat = mats[slot];
    if (!mat) {
      console.warn('[kart] missing material for slot', slot);
      continue;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast && !noCast.includes(slot);
    mesh.receiveShadow = receive;
    mesh.name = slot;
    parent.add(mesh);
  }
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------
const matCache = new Map();
const geoCache = new Map();
const texCache = new Map();

function cmat(key, make) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    m.name = 'kart.' + key;
    matCache.set(key, m);
  }
  return m;
}
function cgeo(key, make) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
function ctex(key, w, h, draw, opts = {}) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  if (opts.wrapS) t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

/** Free every cached kart geometry / material / texture (call when leaving the game). */
export function disposeKartResources() {
  const seen = new Set();
  const deep = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (o.isBufferGeometry) {
      o.dispose();
      return;
    }
    if (o instanceof Map) for (const x of o.values()) deep(x);
    else if (Array.isArray(o)) for (const x of o) deep(x);
    else if (!o.isObject3D && !o.isVector3 && !o.isQuaternion) for (const x of Object.values(o)) deep(x);
  };
  for (const g of geoCache.values()) deep(g);
  for (const m of matCache.values()) m.dispose();
  for (const t of texCache.values()) t.dispose();
  geoCache.clear();
  matCache.clear();
  texCache.clear();
}

/** Convert a height canvas (grey = height) into a tangent-space normal map canvas. */
export function heightToNormalCanvas(src, strength = 2, wrap = true) {
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const H = (x, y) => {
    if (wrap) {
      x = (x + w) % w;
      y = (y + h) % h;
    } else {
      x = clamp(x, 0, w - 1);
      y = clamp(y, 0, h - 1);
    }
    return d[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength; // canvas rows go DOWN = -v (flipY)
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (y * w + x) * 4;
      img.data[o] = (nx * 0.5 + 0.5) * 255;
      img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

const JP_SERIF = "'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif JP','Noto Serif CJK JP',serif";
const JP_SANS = "'Hiragino Maru Gothic ProN','Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif";

/** Fill text centered exactly (uses actual glyph bounds). */
function centerText(g, text, cx, cy) {
  const m = g.measureText(text);
  const asc = m.actualBoundingBoxAscent || 0;
  const desc = m.actualBoundingBoxDescent || 0;
  const left = m.actualBoundingBoxLeft || 0;
  const right = m.actualBoundingBoxRight || 0;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillText(text, cx - (right - left) / 2, cy + (asc - desc) / 2);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const hx = (h) => h.toString(16).padStart(6, '0');

function paintMat(h) {
  return cmat('paint' + hx(h), () => new THREE.MeshPhysicalMaterial({
    color: h, roughness: 0.34, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.06,
  }));
}
function rimMat(h) {
  return cmat('rim' + hx(h), () => new THREE.MeshPhysicalMaterial({
    color: h, roughness: 0.24, metalness: 0.65, clearcoat: 1.0, clearcoatRoughness: 0.04,
  }));
}
function furMat(h, key = '') {
  return cmat('fur' + hx(h) + key, () => {
    const c = new THREE.Color(h);
    const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; // linear
    return new THREE.MeshPhysicalMaterial({
      color: c, roughness: 0.75, metalness: 0,
      sheen: lum > 0.6 ? 0.12 : 0.65, sheenRoughness: 0.55, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), lum > 0.6 ? 0.1 : 0.5),
    });
  });
}
function clothMat(h, rough = 0.7) {
  return cmat('cloth' + hx(h) + rough, () => new THREE.MeshPhysicalMaterial({
    color: h, roughness: rough, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(h).lerp(new THREE.Color(0xffffff), 0.4),
  }));
}
function glossMat(h, rough = 0.3) {
  return cmat('gloss' + hx(h) + rough, () => new THREE.MeshPhysicalMaterial({ color: h, roughness: rough, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
}
const SH = {
  chrome: () => cmat('chrome', () => new THREE.MeshStandardMaterial({ color: 0xeef1f6, metalness: 1, roughness: 0.14 })),
  darkMetal: () => cmat('darkMetal', () => new THREE.MeshStandardMaterial({ color: 0x484c55, metalness: 0.85, roughness: 0.36 })),
  black: () => cmat('blackPlastic', () => new THREE.MeshStandardMaterial({ color: 0x2a292f, roughness: 0.55 })),
  seat: () => cmat('seat', () => new THREE.MeshPhysicalMaterial({ color: 0x35313b, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 })),
  lamp: () => cmat('lamp', () => new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a0, emissiveIntensity: 1.15, roughness: 0.15 })),
  tailLamp: () => cmat('tailLamp', () => new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff2a18, emissiveIntensity: 1.6, roughness: 0.2 })),
  gold: () => cmat('gold', () => new THREE.MeshStandardMaterial({ color: 0xf2c257, metalness: 1, roughness: 0.22 })),
  eye: () => cmat('eye', () => new THREE.MeshPhysicalMaterial({ color: 0x1a1419, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 })),
  eyeRed: () => cmat('eyeRed', () => new THREE.MeshPhysicalMaterial({ color: 0xc2182f, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 })),
  hi: () => cmat('eyeHi', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.3 })),
  nose: () => cmat('nose', () => new THREE.MeshPhysicalMaterial({ color: 0x2c2224, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 })),
  mouth: () => cmat('mouth', () => new THREE.MeshStandardMaterial({ color: 0x4a2a28, roughness: 0.6 })),
  tongue: () => cmat('tongue', () => new THREE.MeshStandardMaterial({ color: 0xe8747c, roughness: 0.5 })),
  white: () => cmat('toothWhite', () => new THREE.MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.35 })),
  blush: () => cmat('blush', () => new THREE.MeshStandardMaterial({
    map: blushTexture(), transparent: true, depthWrite: false, color: 0xffffff, roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })),
  rubber: (kind) => cmat('rubber' + kind, () => new THREE.MeshStandardMaterial({
    color: 0x2e2c31, roughness: 0.78, normalMap: treadNormalMap(kind), normalScale: new THREE.Vector2(1.4, 1.4),
  })),
  star: () => cmat('star', () => new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc21a, emissiveIntensity: 1.7, roughness: 0.4 })),
  dizzy: () => cmat('dizzy', () => new THREE.MeshBasicMaterial({ map: dizzyTexture(), transparent: true, alphaTest: 0.3, depthWrite: false })),
};

function blushTexture() {
  return ctex('blush', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,120,140,0.85)');
    gr.addColorStop(0.55, 'rgba(255,125,145,0.55)');
    gr.addColorStop(1, 'rgba(255,130,150,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // tiny manga hatch lines
    g.strokeStyle = 'rgba(235,80,105,0.55)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(w / 2 + i * 11 - 4, h / 2 + 7);
      g.lineTo(w / 2 + i * 11 + 4, h / 2 - 7);
      g.stroke();
    }
  });
}
function hairStrandNormalMap() {
  const key = 'hairStrands';
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const v = 0.5 + 0.32 * Math.sin((x / 256) * TAU * 26) + 0.12 * Math.sin((x / 256) * TAU * 61 + 1.3);
    const l = Math.round(clamp(v, 0, 1) * 255);
    g.fillStyle = `rgb(${l},${l},${l})`;
    g.fillRect(x, 0, 1, 64);
  }
  const t = new THREE.CanvasTexture(heightToNormalCanvas(c, 2.2));
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}
function dizzyTexture() {
  return ctex('dizzy', 64, 64, (g, w, h) => {
    g.strokeStyle = '#231a20';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    for (let a = 0; a < TAU * 2.6; a += 0.1) {
      const r = 3 + a * 3.4;
      const x = w / 2 + Math.cos(a) * r;
      const y = h / 2 + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  });
}

// Tyre tread normal map. u = around the tyre, v = across (arc length of profile).
function treadNormalMap(kind) {
  const key = 'tread-' + kind;
  if (texCache.has(key)) return texCache.get(key);
  const { vA, vB } = TYRES[kind].band;
  const w = 1024;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);
  // canvas y = (1 - v) * h
  const yA = (1 - vB) * h;
  const yB = (1 - vA) * h;
  const mid = (yA + yB) / 2;
  const bw = yB - yA;
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, yA, w, bw);
  // chevron lugs
  const N = 22;
  g.strokeStyle = '#303030';
  g.lineCap = 'round';
  g.lineWidth = 7;
  for (let i = -1; i <= N; i++) {
    const x = (i / N) * w;
    g.beginPath();
    g.moveTo(x - 14, yA - 2);
    g.lineTo(x + 12, mid);
    g.lineTo(x - 14, yB + 2);
    g.stroke();
  }
  // center groove
  g.fillStyle = '#383838';
  g.fillRect(0, mid - 2.5, w, 5);
  // sidewall rings + lettering (raised)
  g.fillStyle = '#a0a0a0';
  const sw1 = yB + (h - yB) * 0.55;
  const sw0 = yA * 0.45;
  g.fillRect(0, sw1 - 1.5, w, 3);
  g.fillRect(0, sw0 - 1.5, w, 3);
  g.font = `bold ${Math.round(Math.min(18, (h - yB) * 0.42))}px ${JP_SANS}`;
  g.fillStyle = '#b4b4b4';
  for (let k = 0; k < 3; k++) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PONPOKO', ((k + 0.25) / 3) * w, (yB + h) / 2 + 3);
    g.fillText('PONPOKO', ((k + 0.75) / 3) * w, yA / 2 - 3);
  }
  const n = heightToNormalCanvas(c, 3.2);
  const t = new THREE.CanvasTexture(n);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Kart geometry (character independent, cached)
// ---------------------------------------------------------------------------
const TYRES = {
  rear: { R: 0.32, W: 0.27, rimR: 0.19, x: 0.53, z: -0.58, seg: 22 },
  front: { R: 0.26, W: 0.21, rimR: 0.155, x: 0.52, z: 0.6, seg: 20 },
};
function tyreProfile({ R, W, rimR }) {
  const hw = W / 2;
  const s = Math.min(0.065, W * 0.28); // shoulder radius
  const bulge = W * 0.07;
  const pts = [];
  for (let i = 0; i <= 2; i++) {
    const t = i / 2;
    pts.push([lerp(rimR, R - s, t), -hw - bulge * Math.sin(Math.PI * t) + (1 - t) * 0.012]);
  }
  for (let i = 1; i <= 2; i++) {
    const a = -Math.PI / 2 + (i / 2) * (Math.PI / 2);
    pts.push([R - s + s * Math.cos(a), -hw + s + s * Math.sin(a)]);
  }
  pts.push([R + 0.006, 0]);
  for (let i = 0; i < 2; i++) {
    const a = (i / 2) * (Math.PI / 2);
    pts.push([R - s + s * Math.cos(a), hw - s + s * Math.sin(a)]);
  }
  for (let i = 0; i <= 2; i++) {
    const t = i / 2;
    pts.push([lerp(R - s, rimR, t), hw + bulge * Math.sin(Math.PI * (1 - t)) - t * 0.012]);
  }
  return pts;
}
for (const k of Object.keys(TYRES)) {
  const prof = tyreProfile(TYRES[k]);
  const v = profileV(prof);
  TYRES[k].profile = prof;
  TYRES[k].band = { vA: v[3], vB: v[prof.length - 4] };
}

/** One wheel (outer side = +X): Map slot → geometry. */
function wheelGeometry(kind) {
  return cgeo('wheel-' + kind, () => {
    const T = TYRES[kind];
    const P = new PartBuilder();
    const tg = lathe(T.profile, T.seg);
    tg.rotateZ(-Math.PI / 2); // lathe axis Y → X, profile +y → outer side
    P.addRaw('rubber', tg);
    const disc = new THREE.CircleGeometry(T.rimR + 0.01, 14);
    P.add('rubber', disc, [-T.W * 0.25, 0, 0], [0, -Math.PI / 2, 0]);
    P.add('rubber', disc, [-T.W * 0.25 + 0.004, 0, 0], [0, Math.PI / 2, 0]);
    // toy rim: disc with 5 round holes
    const rimR = T.rimR + 0.012;
    const shape = new THREE.Shape();
    const NO = 24;
    for (let i = 0; i < NO; i++) {
      const a = (i / NO) * TAU;
      if (i === 0) shape.moveTo(Math.cos(a) * rimR, Math.sin(a) * rimR);
      else shape.lineTo(Math.cos(a) * rimR, Math.sin(a) * rimR);
    }
    shape.closePath();
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * TAU + Math.PI / 2;
      const hc = rimR * 0.58;
      const hr = rimR * 0.21;
      const hp = new THREE.Path();
      for (let i = 0; i < 8; i++) {
        const a = -(i / 8) * TAU;
        const x = Math.cos(a0) * hc + Math.cos(a) * hr;
        const y = Math.sin(a0) * hc + Math.sin(a) * hr;
        if (i === 0) hp.moveTo(x, y);
        else hp.lineTo(x, y);
      }
      hp.closePath();
      shape.holes.push(hp);
    }
    const rimG = new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelEnabled: false });
    rimG.translate(0, 0, -0.013);
    const rimX = T.W / 2 - 0.03;
    P.add('rim', rimG, [rimX, 0, 0], [0, Math.PI / 2, 0]);
    // hub cap
    const cap = lathe([[0.0, -0.005], [rimR * 0.36, -0.005], [rimR * 0.35, 0.016], [rimR * 0.26, 0.034], [rimR * 0.12, 0.043], [0.0, 0.045]], 10);
    P.add('chrome', cap, [rimX + 0.012, 0, 0], [0, 0, -Math.PI / 2]);
    return P.merge();
  });
}

// Layout constants (chassis space; right side = -X)
const K = {
  wheelCenter: V(0, 0.72, 0.08), // steering wheel center
  wheelTilt: 0.72, // rad, wheel plane tilt from vertical
  wheelR: 0.12,
  exhaust: [V(0.15, 0.56, -1.04), V(-0.15, 0.56, -1.04)],
  flagX: 0.3,
  flagZ: -0.84,
  com: V(0, 0.5, -0.05),
};

// Body loft: z, half width, bottom, top
const BODY_TABLE = [
  [-0.97, 0.3, 0.22, 0.44],
  [-0.84, 0.34, 0.19, 0.475],
  [-0.62, 0.37, 0.18, 0.51],
  [-0.38, 0.38, 0.18, 0.54],
  [-0.12, 0.38, 0.18, 0.545],
  [0.1, 0.37, 0.18, 0.565],
  [0.26, 0.335, 0.185, 0.6],
  [0.42, 0.3, 0.19, 0.545],
  [0.6, 0.285, 0.2, 0.475],
  [0.78, 0.265, 0.21, 0.425],
  [0.99, 0.22, 0.24, 0.38],
];
const Z_BACK = -0.975;
const Z_FRONT = 0.995;
const BODY_N_TOP = 2.4;
const BODY_N_BOT = 3.6;

function tableCurve(rows) {
  return (z) => {
    let i = 0;
    while (i < rows.length - 2 && z > rows[i + 1][0]) i++;
    const p0 = rows[Math.max(0, i - 1)];
    const p1 = rows[i];
    const p2 = rows[i + 1];
    const p3 = rows[Math.min(rows.length - 1, i + 2)];
    const t = clamp((z - p1[0]) / (p2[0] - p1[0]), 0, 1);
    const out = [];
    for (let k = 1; k < p1.length; k++) {
      const a = p0[k];
      const b = p1[k];
      const c = p2[k];
      const d = p3[k];
      out.push(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t));
    }
    return out;
  };
}
const bodyCurve = tableCurve(BODY_TABLE);
function bodySection(z) {
  const [w, bot, top] = bodyCurve(clamp(z, Z_BACK, Z_FRONT));
  let e = 1;
  const f0 = 0.83;
  const b0 = -0.83;
  if (z > f0) e = Math.sqrt(Math.max(0, 1 - ((z - f0) / (Z_FRONT - f0)) ** 2));
  if (z < b0) e = Math.sqrt(Math.max(0, 1 - ((z - b0) / (Z_BACK - b0)) ** 2));
  const yc = (top + bot) / 2;
  const h = (top - bot) / 2;
  return { w: w * e, yc, hTop: h * e, hBot: h * e };
}
/** Height of the body's top surface at (x, z). */
function bodyTopAt(x, z) {
  const s = bodySection(z);
  const r = Math.min(1, Math.abs(x) / Math.max(s.w, 1e-4));
  return s.yc + s.hTop * Math.pow(Math.max(0, 1 - Math.pow(r, BODY_N_TOP)), 1 / BODY_N_TOP);
}

/** Loft along Z of superellipse sections. section(z) → {w, yc, hTop, hBot}. */
export function loftGeometry(section, z0, z1, { stations = 34, radial = 28, nTop = 2.4, nBot = 3.6 } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < stations; i++) {
    const u = i / (stations - 1);
    const z = z0 + (z1 - z0) * (0.35 * u + 0.65 * (0.5 - 0.5 * Math.cos(Math.PI * u)));
    const s = section(z);
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * TAU;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const n = sn >= 0 ? nTop : nBot;
      const x = s.w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const y = s.yc + (sn >= 0 ? s.hTop : s.hBot) * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      pos.push(x, y, z);
      uv.push(j / radial, u);
    }
  }
  const R1 = radial + 1;
  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * R1 + j;
      const b = a + R1;
      const c = b + 1;
      const d = a + 1;
      idx.push(a, d, b, d, c, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  smoothSeams(g);
  return g;
}

const _ray = new THREE.Raycaster();
/** Ray-hit a mesh (world space in/out); returns { p, n } with an interpolated smooth normal, or null. */
function surfaceHit(mesh, origin, dir) {
  mesh.updateMatrixWorld(true);
  _ray.set(origin, dir.clone().normalize());
  _ray.far = 10;
  const h = _ray.intersectObject(mesh, false)[0];
  if (!h) return null;
  const g = mesh.geometry;
  const pa = g.attributes.position;
  const na = g.attributes.normal;
  const f = h.face;
  const local = mesh.worldToLocal(h.point.clone());
  const bc = new THREE.Vector3();
  THREE.Triangle.getBarycoord(local, V().fromBufferAttribute(pa, f.a), V().fromBufferAttribute(pa, f.b), V().fromBufferAttribute(pa, f.c), bc);
  const n = V()
    .addScaledVector(V().fromBufferAttribute(na, f.a), bc.x)
    .addScaledVector(V().fromBufferAttribute(na, f.b), bc.y)
    .addScaledVector(V().fromBufferAttribute(na, f.c), bc.z)
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
    .normalize();
  return { p: h.point.clone(), n };
}

/** Decal projector orientation: projector +Z = surface normal (out), image right = `right` (viewer's right). */
function decalEuler(n, right) {
  const z = n.clone().normalize();
  const x = right.clone().addScaledVector(z, -right.dot(z)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Chassis geometry by material slot (cached, shared by every kart). */
function chassisGeometry() {
  return cgeo('chassis', () => {
    const P = new PartBuilder();
    // --- main body (one smooth loft)
    const body = loftGeometry(bodySection, Z_BACK, Z_FRONT, { stations: 30, radial: 26, nTop: BODY_N_TOP, nBot: BODY_N_BOT });
    // two-tone paint: upper body = 'paint', lower skirt = 'accent' (split along the section angle)
    {
      const idx = body.index.array;
      const uv = body.attributes.uv;
      const upper = [];
      const lower = [];
      for (let i = 0; i < idx.length; i += 3) {
        let sn = 0;
        for (let k = 0; k < 3; k++) sn += Math.sin(uv.getX(idx[i + k]) * TAU);
        (sn / 3 < -0.3 ? lower : upper).push(idx[i], idx[i + 1], idx[i + 2]);
      }
      const up = body.clone();
      up.setIndex(upper);
      const lo = body.clone();
      lo.setIndex(lower);
      P.addRaw('paint', up);
      P.addRaw('accent', lo);
    }
    const bodyMesh = new THREE.Mesh(body);
    bodyMesh.updateMatrixWorld(true);
    // --- floor tray
    P.add('black', new THREE.BoxGeometry(0.62, 0.05, 1.45), [0, 0.18, -0.02]);
    // --- side pods (accent): jet-pod shape with a front intake
    const podProf = [[0.0, -0.27], [0.05, -0.255], [0.08, -0.2], [0.098, -0.1], [0.102, 0.02], [0.097, 0.14], [0.088, 0.21], [0.078, 0.245], [0.066, 0.255], [0.058, 0.24]];
    const pod = lathe(podProf, 14);
    pod.rotateX(Math.PI / 2); // lathe Y → Z
    const podPos = (s) => V(s * 0.43, 0.3, 0.035);
    for (const s of [1, -1]) {
      const p = podPos(s);
      P.add('accent', pod, p);
      P.add('chrome', new THREE.TorusGeometry(0.066, 0.011, 4, 14), p.clone().add(V(0, 0, 0.25)));
      P.add('black', new THREE.CircleGeometry(0.06, 12), p.clone().add(V(0, 0, 0.235)));
      // tiny fan blades hint
      P.add('darkMetal', new THREE.CylinderGeometry(0.018, 0.024, 0.03, 8, 1, true), p.clone().add(V(0, 0, 0.24)), [Math.PI / 2, 0, 0]);
    }
    // --- cockpit rim (padded)
    const rimPts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const x = 0.29 * Math.sign(c) * Math.pow(Math.abs(c), 0.6);
      const z = -0.2 + 0.31 * Math.sign(sn) * Math.pow(Math.abs(sn), 0.6);
      rimPts.push(V(x, bodyTopAt(x, z) + 0.004, z));
    }
    P.add('seat', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true, 'centripetal'), 32, 0.032, 5, true));
    // --- seat
    P.add('seat', new RoundedBoxGeometry(0.36, 0.07, 0.3, 1, 0.03), [0, 0.54, -0.27]);
    P.add('seat', new RoundedBoxGeometry(0.38, 0.15, 0.07, 1, 0.03), [0, 0.6, -0.465], [-0.2, 0, 0]);
    P.add('accent', new RoundedBoxGeometry(0.42, 0.18, 0.045, 1, 0.02), [0, 0.595, -0.505], [-0.2, 0, 0]);
    // --- front bumper
    const bumperPts = [V(0.34, 0.225, 0.8), V(0.27, 0.215, 0.93), V(0.1, 0.205, 1.0), V(-0.1, 0.205, 1.0), V(-0.27, 0.215, 0.93), V(-0.34, 0.225, 0.8)];
    P.add('trim', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bumperPts), 18, 0.04, 7, false));
    for (const s of [1, -1]) P.add('trim', new THREE.SphereGeometry(0.04, 8, 5), [s * 0.34, 0.225, 0.8]);
    for (const s of [1, -1]) P.add('darkMetal', new THREE.CylinderGeometry(0.016, 0.016, 0.14, 6), [s * 0.14, 0.215, 0.92], [Math.PI / 2, 0, 0]);
    // --- rear bumper
    const rb = [V(0.3, 0.25, -0.86), V(0.22, 0.235, -0.97), V(-0.22, 0.235, -0.97), V(-0.3, 0.25, -0.86)];
    P.add('black', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rb), 14, 0.032, 6, false));
    for (const s of [1, -1]) P.add('black', new THREE.SphereGeometry(0.032, 8, 5), [s * 0.3, 0.25, -0.86]);
    // --- headlights + tail lamps (placed on the body surface)
    for (const s of [1, -1]) {
      const h = surfaceHit(bodyMesh, V(s * 0.13, 0.35, 2), V(0, 0, -1));
      if (h) {
        P.add('lamp', new THREE.SphereGeometry(0.048, 8, 5), h.p.clone().addScaledVector(h.n, -0.01), frameQuat(h.n), [1, 1, 0.6]);
        P.add('chrome', new THREE.TorusGeometry(0.05, 0.01, 3, 12), h.p.clone().addScaledVector(h.n, 0.004), frameQuat(h.n));
      }
      const tl = surfaceHit(bodyMesh, V(s * 0.19, 0.34, -2), V(0, 0, 1));
      if (tl) {
        P.add('tailLamp', new THREE.SphereGeometry(0.03, 8, 5), tl.p.clone().addScaledVector(tl.n, -0.006), frameQuat(tl.n), [1.3, 0.8, 0.5]);
        P.add('chrome', new THREE.TorusGeometry(0.03, 0.007, 3, 12), tl.p.clone().addScaledVector(tl.n, 0.002), frameQuat(tl.n), [1.3, 0.8, 1]);
      }
    }
    // --- engine block
    P.add('darkMetal', new RoundedBoxGeometry(0.44, 0.2, 0.28, 1, 0.045), [0, 0.53, -0.76]);
    for (let i = 0; i < 3; i++) {
      for (const s of [1, -1]) P.add('chrome', new THREE.BoxGeometry(0.03, 0.016, 0.22), [s * 0.228, 0.47 + i * 0.045, -0.76]);
    }
    P.add('accent', superEllipsoid(0.19, 0.06, 0.13, { n1: 3, n2: 2.2, ws: 14, hs: 6 }), [0, 0.63, -0.76]);
    // air cleaner (chrome pancake)
    P.add('chrome', lathe([[0, 0], [0.07, 0], [0.078, 0.012], [0.078, 0.04], [0.07, 0.052], [0, 0.052]], 14), [0.07, 0.66, -0.74]);
    P.add('darkMetal', new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), [0.07, 0.65, -0.74]);
    // --- exhaust pipes
    const pipe = lathe([[0.032, 0], [0.032, 0.14], [0.036, 0.17], [0.048, 0.2], [0.05, 0.215], [0.038, 0.214], [0.028, 0.19]], 12);
    const pipeIn = new THREE.CircleGeometry(0.03, 10);
    for (const e of K.exhaust) {
      const dir = V(0, 0.28, -1).normalize();
      const start = e.clone().addScaledVector(dir, -0.215);
      P.add('chrome', pipe, start, yTo(dir));
      P.add('black', pipeIn, e.clone().addScaledVector(dir, -0.02), frameQuat(dir));
    }
    // --- suspension & axle stubs
    for (const s of [1, -1]) {
      P.add('darkMetal', new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), [s * 0.36, 0.26, 0.6], [0, 0, Math.PI / 2]);
      P.add('darkMetal', new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6), [s * 0.34, 0.31, 0.55], [0.5, 0, Math.PI / 2 - 0.25]);
      P.add('darkMetal', new THREE.CylinderGeometry(0.028, 0.028, 0.12, 8), [s * 0.42, 0.32, -0.58], [0, 0, Math.PI / 2]);
    }
    // --- steering column
    {
      const a = V(0, 0.56, 0.3);
      const b = K.wheelCenter.clone().add(V(0, -0.01, 0.02));
      const d = b.clone().sub(a);
      P.add('darkMetal', new THREE.CylinderGeometry(0.019, 0.024, d.length(), 8), a.clone().addScaledVector(d, 0.5), yTo(d));
    }
    // --- flag poles
    for (const s of [1, -1]) {
      const y0 = bodyTopAt(s * K.flagX, K.flagZ);
      const len = 1.06 - y0;
      P.add('chrome', new THREE.CylinderGeometry(0.011, 0.013, len, 8), [s * K.flagX, y0 + len / 2, K.flagZ]);
      P.add('gold', new THREE.SphereGeometry(0.022, 6, 4), [s * K.flagX, 1.075, K.flagZ]);
      P.add('darkMetal', new THREE.CylinderGeometry(0.02, 0.024, 0.05, 8), [s * K.flagX, y0 + 0.015, K.flagZ]);
    }

    const merged = P.merge();
    // paint UVs: side projection in chassis space (used by livery maps)
    for (const slot of ['paint', 'accent']) {
      const g = merged.get(slot);
      const p = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 0.5 + 0.5, p.getY(i) * 1.2 + p.getX(i) * 0.15);
    }

    // --- emblem decals
    const D = new PartBuilder();
    const hood = surfaceHit(bodyMesh, V(0, 2, 0.63), V(0, -1, 0));
    if (hood) {
      // readable from the front (viewer's right = +X)
      D.addRaw('emblem', new DecalGeometry(bodyMesh, hood.p, decalEuler(hood.n, V(1, 0, 0)), V(0.2, 0.2, 0.3)));
    }
    // small crest on the nose tip, between the headlights
    const tip = surfaceHit(bodyMesh, V(0, 0.325, 2), V(0, 0, -1));
    if (tip) D.addRaw('emblem', new DecalGeometry(bodyMesh, tip.p, decalEuler(tip.n, V(1, 0, 0)), V(0.12, 0.12, 0.12)));
    const podMesh = new THREE.Mesh(pod);
    for (const s of [1, -1]) {
      podMesh.position.copy(podPos(s));
      podMesh.updateMatrixWorld(true);
      const h = surfaceHit(podMesh, V(s * 2, 0.31, 0.05), V(-s, 0, 0));
      if (h) D.addRaw('emblem', new DecalGeometry(podMesh, h.p, decalEuler(h.n, V(0, 0, -s)), V(0.15, 0.15, 0.2)));
    }
    const seatBackMesh = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.18, 0.045, 1, 0.02));
    seatBackMesh.position.set(0, 0.595, -0.505);
    seatBackMesh.rotation.set(-0.2, 0, 0);
    seatBackMesh.updateMatrixWorld(true);
    const sb = surfaceHit(seatBackMesh, V(0, 0.6, -2), V(0, 0, 1));
    if (sb) D.addRaw('emblem', new DecalGeometry(seatBackMesh, sb.p, decalEuler(sb.n, V(-1, 0, 0)), V(0.15, 0.15, 0.1)));
    merged.set('emblem', D.merge().get('emblem'));
    return merged;
  });
}

function steeringWheelGeometry() {
  return cgeo('steer', () => {
    const P = new PartBuilder();
    const R = K.wheelR;
    P.add('black', new THREE.TorusGeometry(R, 0.021, 5, 20));
    for (const a of [Math.PI * 0.2, Math.PI * 0.8]) {
      P.add('accent', new THREE.TorusGeometry(R, 0.025, 6, 5, Math.PI * 0.26), [0, 0, 0], [0, 0, a - Math.PI * 0.13]);
    }
    for (const a of [Math.PI / 2 + Math.PI, Math.PI / 2 + 2.2, Math.PI / 2 - 2.2]) {
      const d = V(Math.cos(a), Math.sin(a), 0);
      P.add('chrome', new THREE.CylinderGeometry(0.011, 0.013, R, 6), d.clone().multiplyScalar(R / 2), yTo(d));
    }
    P.add('accent', new THREE.CylinderGeometry(0.04, 0.044, 0.032, 12), [0, 0, 0.005], [Math.PI / 2, 0, 0]);
    P.add('gold', new THREE.CylinderGeometry(0.02, 0.02, 0.012, 12), [0, 0, 0.024], [Math.PI / 2, 0, 0]);
    return P.merge();
  });
}

function starGeometry() {
  return cgeo('star', () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + Math.PI / 2;
      const r = i % 2 === 0 ? 0.055 : 0.024;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
    g.center();
    return g;
  });
}

// ---------------------------------------------------------------------------
// Textures per character
// ---------------------------------------------------------------------------
function kanjiInk(ch) {
  const c = new THREE.Color(ch.colors.body);
  const hsl = {};
  c.getHSL(hsl);
  if (hsl.l < 0.25) return c; // already dark (tengu)
  c.setHSL(hsl.h, Math.max(hsl.s, 0.55), Math.min(hsl.l, 0.34));
  return c;
}

function emblemTexture(ch) {
  return ctex('emblem-' + ch.id, 256, 256, (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    g.clearRect(0, 0, w, h);
    const circle = (r, fill) => {
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.fillStyle = fill;
      g.fill();
    };
    const ring = new THREE.Color(0xe7b64e);
    circle(126, css(0x6a4a1c));
    circle(122, '#' + ring.getHexString());
    circle(108, '#fbf7ee');
    g.lineWidth = 6;
    g.strokeStyle = '#' + kanjiInk(ch).getHexString();
    g.beginPath();
    g.arc(cx, cy, 97, 0, TAU);
    g.stroke();
    g.fillStyle = '#' + kanjiInk(ch).getHexString();
    g.font = `bold 132px ${JP_SERIF}`;
    centerText(g, ch.kanji, cx, cy + 2);
  });
}

function flagTexture(ch) {
  // atlas: left half = front side (pole band on the left), right half = back side (band on the right)
  return ctex('flag-' + ch.id, 256, 256, (g, W, h) => {
    const body = new THREE.Color(ch.colors.body);
    const lum = body.r * 0.3 + body.g * 0.59 + body.b * 0.11;
    const ink = lum > 0.62 ? '#2a2630' : '#fbf6ea';
    for (const half of [0, 1]) {
      const ox = half * 128;
      const w = 128;
      g.fillStyle = css(ch.colors.body);
      g.fillRect(ox, 0, w, h);
      g.fillStyle = css(ch.colors.accent);
      const bx = half === 0 ? ox : ox + w - 16;
      g.fillRect(bx, 0, 16, h);
      g.fillRect(ox, 0, w, 14);
      g.fillStyle = css(ch.colors.trim);
      g.fillRect(ox, h - 10, w, 10);
      const cx = ox + w / 2 + (half === 0 ? 8 : -8);
      g.fillStyle = ink;
      g.font = `bold 88px ${JP_SERIF}`;
      centerText(g, ch.kanji, cx, h * 0.38);
      g.font = `bold 28px ${JP_SANS}`;
      const name = ch.name;
      for (let i = 0; i < name.length; i++) centerText(g, name[i], cx, h * 0.64 + i * 29);
    }
  });
}

function tigerTexture(key, base, stripe, thin = 1) {
  return ctex(key, 512, 256, (g, w, h) => {
    g.fillStyle = css(base);
    g.fillRect(0, 0, w, h);
    g.fillStyle = css(stripe);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const x0 = ((i + 0.5) / n) * w + (r() - 0.5) * 10;
      const wd = (4 + r() * 4) * thin;
      const steps = 10;
      const ph = r() * 6;
      // a tapered, wavy stripe that fades out at one end (tiger-like)
      const y0 = -5 + r() * h * 0.15;
      const y1 = h + 5 - r() * h * 0.2;
      g.beginPath();
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const y = lerp(y0, y1, t);
        const x = x0 + Math.sin(t * 5 + ph) * 9;
        const ww = wd * (0.35 + Math.sin(Math.PI * t) * 0.9);
        if (k === 0) g.moveTo(x - ww, y);
        else g.lineTo(x - ww, y);
      }
      for (let k = steps; k >= 0; k--) {
        const t = k / steps;
        const y = lerp(y0, y1, t);
        const x = x0 + Math.sin(t * 5 + ph) * 9;
        const ww = wd * (0.35 + Math.sin(Math.PI * t) * 0.9);
        g.lineTo(x + ww, y);
      }
      g.closePath();
      g.fill();
      // side fork
      if (i % 2 === 0) {
        const yy = h * (0.3 + r() * 0.4);
        const xx = x0 + Math.sin(((yy - y0) / (y1 - y0)) * 5 + ph) * 9;
        g.beginPath();
        g.moveTo(xx, yy - 5 * thin);
        g.lineTo(xx + 22 + r() * 8, yy - 14);
        g.lineTo(xx, yy + 5 * thin);
        g.fill();
      }
    }
  }, { repeat: [1, 1] });
}

function cucumberTexture() {
  return ctex('cucumber', 256, 256, (g, w, h) => {
    g.fillStyle = css(0x5bb44a);
    g.fillRect(0, 0, w, h);
    // long light stripes along the kart length (u = z)
    for (let i = 0; i < 9; i++) {
      const y = (i / 9) * h;
      g.fillStyle = 'rgba(210,240,150,0.35)';
      g.fillRect(0, y, w, 7);
    }
    // bumps
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 110; i++) {
      g.fillStyle = 'rgba(240,255,200,0.55)';
      g.beginPath();
      g.arc(r() * w, r() * h, 2 + r() * 1.5, 0, TAU);
      g.fill();
    }
  }, { repeat: [3, 2] });
}

// Per-character kart materials
function kartMats(ch) {
  const c = ch.colors;
  const m = {
    paint: paintMat(c.body),
    accent: paintMat(c.accent),
    trim: paintMat(c.trim),
    rim: rimMat(c.accent),
    chrome: SH.chrome(),
    darkMetal: SH.darkMetal(),
    black: SH.black(),
    seat: SH.seat(),
    lamp: SH.lamp(),
    tailLamp: SH.tailLamp(),
    gold: SH.gold(),
    rubber: null,
    emblem: cmat('emblem-' + ch.id, () => new THREE.MeshPhysicalMaterial({
      map: emblemTexture(ch), alphaTest: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    })),
    flag: cmat('flag-' + ch.id, () => new THREE.MeshStandardMaterial({ map: flagTexture(ch), roughness: 0.8 })),
  };
  if (ch.id === 'oni') {
    m.paint = cmat('paint-oni', () => new THREE.MeshPhysicalMaterial({
      map: tigerTexture('tigerKart', 0xffc62a, 0x2b2530), roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.06,
    }));
    m.paint.map.repeat.set(1.35, 1.0);
  }
  if (ch.id === 'kappa') {
    m.paint = cmat('paint-kappa', () => new THREE.MeshPhysicalMaterial({
      map: cucumberTexture(), roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08,
    }));
  }
  return m;
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------
// Driver layout in chassis space. The driver group is placed at HIP; all
// parts below are given in chassis space and converted.
const HIP = V(0, 0.5, -0.27);
const NECK = V(0, 0.83, -0.24);
const HEAD_C = V(0, 1.095, -0.215); // head center (chassis space)
const TORSO_C = V(0, 0.655, -0.275);
const SHOULDER = [V(0.155, 0.765, -0.235), V(-0.155, 0.765, -0.235)]; // [left(+x), right(-x)]
const HEAD = { a: 0.29, b: 0.255, c: 0.265 };
// small face / accessory slots that don't need to cast shadows
const FACE_NO_SHADOW = ['blush', 'hi', 'mouth', 'eye', 'nose', 'tongue', 'white', 'whisker', 'pinkNose', 'kuma', 'leafVein', 'bandanaDot', 'gold', 'water'];

/** Head surface helper for a given head shape. */
function makeHeadShape(o = {}) {
  const a = o.a ?? HEAD.a;
  const b = o.b ?? HEAD.b;
  const c = o.c ?? HEAD.c;
  const cheek = o.cheek ?? 0.07;
  const flatTop = o.flatTop ?? 0;
  const f = (d) => {
    const s = smooth(0.25, -0.6, d.y);
    const top = d.y > 0 ? 1 - flatTop * d.y * d.y : 0.96;
    return V(a * d.x * (1 + cheek * s), b * d.y * top, c * d.z * (1 + cheek * 0.35 * s));
  };
  const dir = (yaw, pitch) => {
    const y = degToRad(yaw);
    const p = degToRad(pitch);
    return V(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
  };
  /** Point on head (head-local, relative to head center) and outward normal. */
  const at = (yaw, pitch) => {
    const p = f(dir(yaw, pitch));
    const e = 0.5;
    const pu = f(dir(yaw + e, pitch)).sub(f(dir(yaw - e, pitch)));
    const pv = f(dir(yaw, pitch + e)).sub(f(dir(yaw, pitch - e)));
    let n = new THREE.Vector3().crossVectors(pu, pv).normalize();
    if (n.dot(p) < 0) n.negate();
    if (Math.abs(pitch) > 89) n = V(0, Math.sign(pitch), 0);
    return { p, n };
  };
  const geometry = (ws = 34, hs = 26) => {
    const g = new THREE.SphereGeometry(1, ws, hs);
    const pa = g.attributes.position;
    const v = V();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).normalize();
      const q = f(v);
      pa.setXYZ(i, q.x, q.y, q.z);
    }
    g.computeVertexNormals();
    smoothSeams(g);
    return g;
  };
  return { at, geometry, f, dir };
}

const DRIVER_SPECS = {
  tanuki: { fur: 0x9a8570, fur2: 0xece0cb, dark: 0x4e3d33, inner: 0xe9d3b8, arm: 0x5c483b, paw: 0x4a392f, cheek: 0.1 },
  kitsune: { fur: 0xe2ddd6, fur2: 0xe8e3dc, orange: 0xf28a2e, dark: 0x3d2c28, inner: 0xe64a2c, arm: 0xf28a2e, paw: 0x3d2c28, cheek: 0.06 },
  neko: { fur: 0xe3ddd3, orange: 0xf29a42, black: 0x3b3438, inner: 0xf7b4c2, arm: 0xe3ddd3, paw: 0xe3ddd3, cheek: 0.09 },
  shiba: { fur: 0xdc8a45, fur2: 0xf0e4d0, inner: 0xf6dcc0, arm: 0xdc8a45, paw: 0xf8ecd8, cheek: 0.09 },
  usagi: { fur: 0xe4e1de, inner: 0xf5acc0, arm: 0xe4e1de, paw: 0xe4e1de, cheek: 0.06 },
  kappa: { fur: 0x78c35e, belly: 0xf2e7a2, beak: 0xf6bf38, shell: 0x6b7a3c, shellRim: 0xd9c77a, hair: 0x2e4f45, dish: 0xeef6f2, arm: 0x78c35e, paw: 0x78c35e, cheek: 0.05 },
  tengu: { fur: 0xdc3b2e, brow: 0xf2eee6, hair: 0xe8e2d8, robe: 0x2f3b70, pom: 0xf4eee2, hat: 0x2c2932, arm: 0x2f3b70, paw: 0xdc3b2e, cheek: 0.05 },
  oni: { fur: 0x5b8fe0, horn: 0xf8d86a, hair: 0x33376a, arm: 0x5b8fe0, paw: 0x5b8fe0, cheek: 0.07 },
};

/**
 * Build a driver (cached geometry per character).
 * Returns a controller: { group, headPivot, eyes, dizzy, stars, arms, hands, ears, tail, pose(dt, st) }.
 */
function buildDriver(ch) {
  const S = DRIVER_SPECS[ch.id] || DRIVER_SPECS.tanuki;
  const shape = makeHeadShape({ cheek: S.cheek, flatTop: ch.id === 'kappa' ? 0.12 : 0 });
  const hs = shape;
  const H0 = HEAD_C.clone().sub(NECK); // head center relative to neck pivot

  // materials
  const mats = {
    fur: furMat(S.fur),
    arm: furMat(S.arm),
    paw: furMat(S.paw),
    eye: ch.id === 'usagi' ? SH.eyeRed() : SH.eye(),
    hi: SH.hi(),
    blush: SH.blush(),
    nose: SH.nose(),
    mouth: SH.mouth(),
    tongue: SH.tongue(),
    white: SH.white(),
    gold: SH.gold(),
  };
  if (S.fur2) mats.fur2 = furMat(S.fur2);
  if (S.dark) mats.dark = furMat(S.dark);
  if (S.inner) mats.inner = furMat(S.inner, 'in');
  if (S.orange) mats.orange = furMat(S.orange);
  if (S.black) mats.black = furMat(S.black);

  const key = 'driver-' + ch.id;
  const built = cgeo(key, () => buildDriverGeometry(ch, S, shape, H0));
  const extraMats = built.mats(mats);
  Object.assign(mats, extraMats);

  // assemble
  const group = new THREE.Group();
  group.name = 'driver';
  group.position.copy(HIP);
  const torso = new THREE.Group();
  torso.name = 'torso';
  group.add(torso);
  meshesFromSlots(built.torso, mats, torso, { noCast: FACE_NO_SHADOW });
  const headPivot = new THREE.Group();
  headPivot.name = 'head';
  headPivot.position.copy(NECK).sub(HIP);
  group.add(headPivot);
  meshesFromSlots(built.head, mats, headPivot, { noCast: FACE_NO_SHADOW });
  // eyes (blink/dizzy)
  const eyes = new THREE.Group();
  eyes.position.copy(built.eyeCenter);
  headPivot.add(eyes);
  meshesFromSlots(built.eyes, mats, eyes, { cast: false });
  const dizzy = new THREE.Group();
  dizzy.visible = false;
  headPivot.add(dizzy);
  for (const e of built.eyeFrames) {
    const m = new THREE.Mesh(cgeo('dizzyPlane', () => new THREE.PlaneGeometry(0.1, 0.1)), SH.dizzy());
    m.position.copy(e.p).addScaledVector(e.n, 0.012);
    m.quaternion.copy(frameQuat(e.n));
    dizzy.add(m);
  }
  // stars (spin out)
  const stars = new THREE.Group();
  stars.visible = false;
  stars.position.copy(H0).add(V(0, HEAD.b + 0.14, 0));
  headPivot.add(stars);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(starGeometry(), SH.star());
    const a = (i / 3) * TAU;
    s.position.set(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
    stars.add(s);
  }
  // ears
  const ears = [];
  for (const e of built.ears) {
    const pivot = new THREE.Group();
    pivot.position.copy(e.pos);
    pivot.quaternion.copy(e.quat);
    const inner = new THREE.Group(); // animated sway
    pivot.add(inner);
    meshesFromSlots(e.slots, mats, inner);
    (e.parent === 'torso' ? torso : headPivot).add(pivot);
    ears.push({ pivot: inner, side: e.side, amp: e.amp ?? 1 });
  }
  // tail
  let tail = null;
  if (built.tail) {
    const pivot = new THREE.Group();
    pivot.position.copy(built.tail.pos);
    pivot.quaternion.copy(built.tail.quat);
    const inner = new THREE.Group();
    pivot.add(inner);
    meshesFromSlots(built.tail.slots, mats, inner);
    torso.add(pivot);
    tail = inner;
  }
  // arms + hands (dynamic)
  const armGeo = cgeo('arm', () => {
    const g = new THREE.CapsuleGeometry(0.052, 0.26, 3, 10);
    g.translate(0, 0.13, 0);
    return g;
  });
  const handGeo = cgeo('hand', () => superEllipsoid(0.058, 0.052, 0.062, { ws: 10, hs: 7 }));
  const arms = [];
  const hands = [];
  const armBase = 0.26; // capsule straight length
  for (let i = 0; i < 2; i++) {
    const am = new THREE.Mesh(armGeo, mats.arm);
    am.castShadow = true;
    group.add(am);
    arms.push(am);
    const hm = new THREE.Mesh(handGeo, mats.paw);
    hm.castShadow = true;
    group.add(hm);
    hands.push(hm);
  }
  if (built.cuffs) {
    // e.g. oni gold bracelets: attached to arms at the wrist
    for (const am of arms) {
      const cuff = new THREE.Mesh(cgeo('cuff', () => new THREE.TorusGeometry(0.056, 0.014, 8, 18).rotateX(Math.PI / 2)), mats.gold);
      cuff.position.y = 0.3;
      am.add(cuff);
    }
  }

  // --- animation state
  const st = {
    blinkT: 2 + (ch.id.length % 3), blink: 0,
    lean: 0, headTilt: 0, headYaw: 0, back: 0, up: [0, 0], glide: 0,
    hand: [V(), V()], handInit: false,
  };
  const tmpM = new THREE.Matrix4();
  const tmpV = V();
  const tgt = V();
  const upT = V();
  const grip = V();
  const shoulderLocal = SHOULDER.map((s) => s.clone().sub(HIP));

  /**
   * Pose the driver. `ctx` = { time, steer, drift, boost, trick (0..1 arms-up), glide (0..1), spin (bool),
   *   wheelMatrix (chassis-space matrix of the steering wheel, or null), gripPoint (chassis-space glider grip),
   *   portrait (bool: waving pose when there is no wheel) }
   */
  function pose(dt, ctx) {
    const t = ctx.time || 0;
    const leanT = clamp(ctx.steer * 0.1 + ctx.drift * 0.16, -0.3, 0.3);
    st.lean = damp(st.lean, leanT, 8, dt);
    st.back = damp(st.back, ctx.boost ? 1 : 0, 6, dt);
    group.rotation.set(-0.1 * st.back + Math.sin(t * 2.1) * 0.01, 0, st.lean);
    group.position.set(HIP.x, HIP.y, HIP.z - 0.03 * st.back);
    st.headTilt = damp(st.headTilt, ctx.steer * 0.12 + ctx.drift * 0.1, 7, dt);
    st.headYaw = damp(st.headYaw, -ctx.steer * 0.22 - ctx.drift * 0.12, 6, dt);
    const spinWobble = ctx.spin ? Math.sin(t * 9) * 0.25 : 0;
    headPivot.rotation.set(Math.sin(t * 1.7) * 0.02 + 0.06 * st.back, st.headYaw + spinWobble * 0.5, st.headTilt + spinWobble * 0.4);
    // breathing
    const br = 1 + Math.sin(t * 2.6) * 0.012;
    torso.scale.set(br, 1 + (br - 1) * 0.6, br);
    // blink (pseudo-random intervals)
    st.blinkT -= dt;
    if (st.blinkT <= 0) {
      st.blink = 0.14;
      st.blinkT = 2.5 + (((Math.sin(t * 12.9898) * 43758.5453) % 1) + 1) % 1 * 3;
    }
    if (st.blink > 0) st.blink -= dt;
    const bl = st.blink > 0 ? Math.max(0.12, Math.abs(st.blink - 0.07) / 0.07) : 1;
    eyes.scale.set(1, ctx.spin ? 1 : bl, 1);
    eyes.visible = !ctx.spin;
    dizzy.visible = !!ctx.spin;
    stars.visible = !!ctx.spin;
    if (ctx.spin) {
      stars.rotation.y = t * 5;
      for (const d of dizzy.children) d.rotation.z = -t * 8;
      for (const s of stars.children) s.rotation.y = -t * 5;
    }
    // ears & tail sway
    for (const e of ears) {
      e.pivot.rotation.set(Math.sin(t * 2.2 + e.side) * 0.05 * e.amp - st.back * 0.25 * e.amp, 0, Math.sin(t * 1.6 + e.side * 2) * 0.06 * e.amp + st.lean * 0.4 * e.amp);
    }
    if (tail) tail.rotation.set(Math.sin(t * 2.4) * 0.08, Math.sin(t * 1.9) * 0.28 + st.lean * 0.6, 0);

    // arms: targets in chassis space → driver local
    group.updateMatrix();
    tmpM.copy(group.matrix).invert();
    const trick = Math.max(ctx.trick || 0, 0);
    const glide = clamp(ctx.glide || 0, 0, 1);
    st.up[0] = damp(st.up[0], trick, 10, dt);
    st.up[1] = damp(st.up[1], Math.max(trick, glide), 10, dt);
    const k = st.handInit ? 1 - Math.exp(-18 * dt) : 1;
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1;
      const sh = shoulderLocal[i];
      if (ctx.wheelMatrix) {
        const a = sgn * 1.05; // ~10 / 2 o'clock on the rim
        tgt.set(Math.sin(a) * K.wheelR * 0.95, Math.cos(a) * K.wheelR * 0.95, 0.02).applyMatrix4(ctx.wheelMatrix).applyMatrix4(tmpM);
      } else if (ctx.portrait && i === 0) {
        tgt.copy(sh).add(tmpV.set(0.12, 0.2, 0.15)); // waving paw
      } else {
        tgt.copy(sh).add(tmpV.set(-sgn * 0.06, -0.03, 0.2)); // paws in front of the chest
      }
      // arms-up (trick) target
      upT.copy(sh).add(tmpV.set(sgn * 0.17, 0.28, 0.06 + Math.sin(t * 14 + i) * 0.02));
      tgt.lerp(upT, st.up[i]);
      // glide grip (right hand holds the umbrella)
      if (i === 1 && ctx.gripPoint && glide > 0) {
        grip.copy(ctx.gripPoint).applyMatrix4(tmpM);
        tgt.lerp(grip, glide * (1 - trick));
      }
      st.hand[i].lerp(tgt, k);
      const d = tmpV.copy(st.hand[i]).sub(sh);
      const len = Math.max(d.length(), 0.05);
      arms[i].position.copy(sh);
      arms[i].quaternion.setFromUnitVectors(Y_AXIS, d.divideScalar(len));
      arms[i].scale.set(1, clamp((len - 0.02) / armBase, 0.4, 2.2), 1);
      hands[i].position.copy(st.hand[i]);
      hands[i].quaternion.copy(arms[i].quaternion);
    }
    st.handInit = true;
  }

  return { group, headPivot, torso, eyes, dizzy, stars, arms, hands, ears, tail, pose };
}

/**
 * Character geometry (merged per material slot). Called once per character.
 */
function buildDriverGeometry(ch, S, hs, H0) {
  const torso = new PartBuilder();
  const head = new PartBuilder();
  const eyes = new PartBuilder();
  const earList = [];
  let tail = null;
  const extra = {}; // extra materials: slot → () => material
  const T = (p) => p.clone().sub(HIP); // chassis → driver-local
  const Hd = (p) => p.clone().add(H0); // head-center-relative → neck-pivot space

  // -------- torso (egg) --------
  const torsoGeo = superEllipsoid(0.19, 0.2, 0.16, { ws: 20, hs: 14, deform: (v) => { if (v.y < 0) { v.x *= 1.08; v.z *= 1.08; } } });
  const torsoSlot = { tengu: 'robe', oni: 'tiger', kitsune: 'fur' }[ch.id] || 'fur';
  torso.add(torsoSlot, torsoGeo, T(TORSO_C));
  // neck plug (hidden mostly)
  torso.add('fur', new THREE.CylinderGeometry(0.1, 0.12, 0.1, 12, 1, true), T(V(0, 0.82, -0.25)));
  // shoulders
  for (const s of SHOULDER) torso.add(ch.id === 'tengu' ? 'robe' : 'arm', new THREE.SphereGeometry(0.066, 10, 7), T(s));

  // -------- head --------
  const headSlot = 'fur';
  head.add(headSlot, hs.geometry(30, 22), H0);

  // helpers
  const onHead = (yaw, pitch, inset = 0) => {
    const { p, n } = hs.at(yaw, pitch);
    return { p: Hd(p).addScaledVector(n, -inset), n, q: frameQuat(n) };
  };
  const eyeFrames = [];
  const eyeY = { yaw: 25, pitch: -8 };
  const eyeSize = { w: 0.047, h: 0.063, d: 0.024 };
  if (ch.id === 'kitsune') Object.assign(eyeY, { yaw: 25, pitch: -6 });
  if (ch.id === 'tengu') Object.assign(eyeY, { yaw: 24, pitch: -2 });
  if (ch.id === 'kappa') Object.assign(eyeY, { yaw: 26, pitch: -4 });
  if (ch.id === 'oni') Object.assign(eyeY, { yaw: 25, pitch: -6 });

  // eye sockets
  const eyeGeo = new THREE.SphereGeometry(1, 12, 9);
  const hiGeo = new THREE.CircleGeometry(1, 10);
  const eyePts = [];
  for (const sgn of [1, -1]) {
    const f = onHead(sgn * eyeY.yaw, eyeY.pitch, eyeSize.d * 0.45);
    eyePts.push(f);
    eyeFrames.push({ p: f.p.clone().addScaledVector(f.n, eyeSize.d * 0.45), n: f.n });
  }
  const eyeCenter = eyePts[0].p.clone().add(eyePts[1].p).multiplyScalar(0.5);
  for (const f of eyePts) {
    const local = f.p.clone().sub(eyeCenter);
    eyes.add('eye', eyeGeo, local, f.q, [eyeSize.w, eyeSize.h, eyeSize.d]);
    // highlights (same screen side for both eyes)
    const x = V(1, 0, 0).applyQuaternion(f.q);
    const y = V(0, 1, 0).applyQuaternion(f.q);
    const surf = local.clone().addScaledVector(f.n, eyeSize.d * 0.93);
    eyes.add('hi', hiGeo, surf.clone().addScaledVector(x, eyeSize.w * 0.34).addScaledVector(y, eyeSize.h * 0.36).addScaledVector(f.n, -0.003), f.q, 0.018);
    eyes.add('hi', hiGeo, surf.clone().addScaledVector(x, -eyeSize.w * 0.3).addScaledVector(y, -eyeSize.h * 0.38).addScaledVector(f.n, -0.004), f.q, 0.008);
  }
  // blush
  const blushGeo = new THREE.PlaneGeometry(1, 1);
  for (const sgn of [1, -1]) {
    const f = onHead(sgn * 42, -22, -0.004);
    head.add('blush', blushGeo, f.p, f.q, [0.1, 0.065, 1]);
  }

  // ω mouth helper on a surface frame
  const addMouthW = (P, pos, q, size = 0.02, slot = 'mouth') => {
    const arc = new THREE.TorusGeometry(size, size * 0.26, 4, 9, Math.PI);
    const x = V(1, 0, 0).applyQuaternion(q);
    for (const s of [1, -1]) {
      const qq = q.clone().multiply(eulerQ(0, 0, Math.PI));
      P.add(slot, arc, pos.clone().addScaledVector(x, s * size), qq);
    }
  };
  const addSmile = (P, pos, q, w = 0.035, slot = 'mouth') => {
    const arc = new THREE.TorusGeometry(w, 0.0065, 4, 12, Math.PI * 0.8);
    P.add(slot, arc, pos, q.clone().multiply(eulerQ(0, 0, Math.PI + Math.PI * 0.1)));
  };
  // open happy mouth (half-disc) + tongue
  const addOpenMouth = (P, f, w = 0.045, h = 0.035) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w, 0);
    sh.quadraticCurveTo(0, -h * 2.1, w, 0);
    sh.quadraticCurveTo(0, h * 0.25, -w, 0);
    const g = new THREE.ShapeGeometry(sh, 10);
    P.add('mouth', g, f.p.clone().addScaledVector(f.n, 0.004), f.q);
    const t = new THREE.Shape();
    t.moveTo(-w * 0.55, -h * 0.75);
    t.quadraticCurveTo(0, -h * 1.6, w * 0.55, -h * 0.75);
    t.quadraticCurveTo(0, -h * 0.45, -w * 0.55, -h * 0.75);
    P.add('tongue', new THREE.ShapeGeometry(t, 8), f.p.clone().addScaledVector(f.n, 0.006), f.q);
  };

  // generic muzzle + nose + mouth
  const addMuzzle = (slot, { w = 0.1, h = 0.07, d = 0.08, pitch = -24, inset = 0.045, noseW = 0.034, noseH = 0.023, mouth = 'w', noseSlot = 'nose' } = {}) => {
    const f = onHead(0, pitch, inset);
    const q = f.q;
    head.add(slot, new THREE.SphereGeometry(1, 14, 10), f.p, q, [w, h, d]);
    // nose at the top-front of the muzzle
    const up = V(0, 1, 0).applyQuaternion(q);
    const fw = f.n.clone();
    const noseP = f.p.clone().addScaledVector(fw, d * 0.86).addScaledVector(up, h * 0.42);
    head.add(noseSlot, new THREE.SphereGeometry(1, 8, 6), noseP, q, [noseW, noseH, noseH * 0.9]);
    // nose shine
    head.add('hi', new THREE.CircleGeometry(1, 8), noseP.clone().addScaledVector(fw, noseH * 0.86).addScaledVector(up, noseH * 0.35).add(V(0.008, 0, 0)), q, 0.007);
    const mouthP = f.p.clone().addScaledVector(fw, d * 0.93).addScaledVector(up, -h * 0.28);
    if (mouth === 'w') addMouthW(head, mouthP, q, 0.019);
    return { f, noseP, mouthP, q };
  };

  // ear helper: returns an ear entry. geometry built pointing +Y from base (origin)
  const addEar = (side, yaw, pitch, build, { tilt = 0.25, lean = -0.1, twist = 0, amp = 1, inset = 0.02 } = {}) => {
    const f = onHead(side * yaw, pitch, inset);
    const P = new PartBuilder();
    build(P);
    // orient: ear up = blend of head normal and world up, tilted outward
    const up = f.n.clone().lerp(V(0, 1, 0), 0.45).normalize();
    const q = yTo(up);
    const out = eulerQ(lean, twist * side, -side * tilt);
    earList.push({ pos: f.p, quat: q.multiply(out), slots: P.merge(), side, amp });
  };

  /**
   * Hair shell hugging the head: grid over yaw [y0..y1] (deg) × rows from pitchTop down to pitchLow(yaw, col).
   * off(t, yaw) = distance from the head surface (t: 0 top → 1 lower edge).
   */
  const hairShell = ({ y0, y1, cols, rows, pitchTop, pitchLow, off }) => {
    const pos = [];
    const uvs = [];
    const idx = [];
    for (let i = 0; i <= cols; i++) {
      const yaw = lerp(y0, y1, i / cols);
      const low = pitchLow(yaw, i);
      for (let j = 0; j <= rows; j++) {
        const t = j / rows;
        const f = hs.at(yaw, lerp(pitchTop, low, t));
        const q = Hd(f.p).addScaledVector(f.n, off(t, yaw));
        pos.push(q.x, q.y, q.z);
        uvs.push(i / cols, 1 - t);
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * (rows + 1) + j;
        const b = a + rows + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  // -------- per character --------
  const id = ch.id;
  if (id === 'tanuki') {
    // eye mask patches (drooping outward)
    for (const sgn of [1, -1]) {
      const f = onHead(sgn * 28, -12, 0.03);
      head.add('dark', new THREE.SphereGeometry(1, 12, 8), f.p, f.q.clone().multiply(eulerQ(0, 0, sgn * 0.5)), [0.085, 0.06, 0.04]);
    }
    addMuzzle('fur2', { w: 0.11, h: 0.075, d: 0.085, pitch: -25 });
    // cheeks fluff (cream)
    for (const sgn of [1, -1]) {
      const f = onHead(sgn * 52, -28, 0.03);
      head.add('fur2', new THREE.SphereGeometry(1, 10, 7), f.p, f.q, [0.08, 0.06, 0.05]);
    }
    // round ears
    for (const s of [1, -1]) {
      addEar(s, 44, 50, (P) => {
        P.add('dark', new THREE.SphereGeometry(1, 12, 9), [0, 0.055, 0], null, [0.085, 0.08, 0.042]);
        P.add('inner', new THREE.SphereGeometry(1, 10, 7), [0, 0.05, 0.02], null, [0.055, 0.05, 0.025]);
      }, { tilt: 0.35, lean: 0.15 });
    }
    // transformation leaf on the head (big, standing, slightly to the right)
    const leaf = new THREE.Shape();
    leaf.moveTo(0, 0);
    leaf.bezierCurveTo(0.075, 0.03, 0.09, 0.15, 0.0, 0.25);
    leaf.bezierCurveTo(-0.09, 0.15, -0.075, 0.03, 0, 0);
    const lg = new THREE.ExtrudeGeometry(leaf, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
    lg.translate(0, 0, -0.0025);
    const bendLeaf = (g) => {
      const lp = g.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const x = lp.getX(i);
        const y = lp.getY(i);
        lp.setZ(i, lp.getZ(i) + 1.6 * x * x - 0.9 * y * y);
      }
      g.computeVertexNormals();
      return g;
    };
    bendLeaf(lg);
    const veinPts = [];
    for (let i = 0; i <= 8; i++) {
      const y = (i / 8) * 0.23;
      veinPts.push(V(0, y, -0.9 * y * y + 0.006));
    }
    const vein = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(veinPts), 8, 0.004, 4, false);
    const stemPts = [V(0, 0.005, 0), V(0.004, -0.03, 0.008), V(0.02, -0.05, 0.02)];
    const stem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stemPts), 6, 0.006, 5, false);
    extra.leaf = () => glossMat(0x62b33c, 0.4);
    extra.leafVein = () => glossMat(0x3f8a2a, 0.5);
    const lf = onHead(-14, 66, 0.012);
    const leafQ = basisQuat(lf.n.clone().multiplyScalar(0.6).add(V(0.08, 0.5, -0.35)), V(-0.15, 0.1, 1));
    head.add('leaf', lg, lf.p, leafQ);
    head.add('leafVein', vein, lf.p, leafQ);
    head.add('leafVein', stem, lf.p, leafQ);
    // round belly
    torso.add('fur2', new THREE.SphereGeometry(1, 14, 10), T(V(0, 0.63, -0.14)), null, [0.14, 0.14, 0.06]);
    // fat striped fluffy tail, curling up
    extra.tail = () => cmat('tanukiTail', () => new THREE.MeshPhysicalMaterial({
      map: ctex('tanukiTailStripes', 64, 256, (g, w, h) => {
        g.fillStyle = css(0x9a8570);
        g.fillRect(0, 0, w, h);
        g.fillStyle = css(0x4e3d33);
        for (const y of [0.28, 0.5, 0.7]) g.fillRect(0, (1 - y) * h - 16, w, 26);
        g.fillRect(0, 0, w, 0.12 * h);
      }), roughness: 0.75, sheen: 0.7, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xd8cbb8),
    }));
    const tg = bendAlongY(tailLathe(0.44, 0.135, 0.06), 2.2);
    tail = {
      pos: T(V(0, 0.64, -0.39)), quat: basisQuat(V(0, 0.3, -1), V(0, 1, 0)),
      slots: (() => { const P = new PartBuilder(); P.add('tail', tg); return P.merge(); })(),
    };
  } else if (id === 'kitsune') {
    // Inari fox markings (red flicks above eyes)
    extra.kuma = () => glossMat(0xd8321c, 0.5);
    for (const sgn of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const f = onHead(sgn * (14 + u * 30), 6 + u * 16 + Math.sin(u * Math.PI) * 4, -0.002);
        pts.push(f.p);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.TubeGeometry(curve, 16, 0.011, 6, false);
      // taper: scale radius along curve via vertex pull toward curve
      const tp = tube.attributes.position;
      const segs = 17;
      for (let i = 0; i < tp.count; i++) {
        const ring = Math.floor(i / 7);
        const u = ring / (segs - 1);
        const c = curve.getPoint(u);
        const k = 0.35 + 0.9 * Math.sin(Math.PI * Math.min(1, u * 1.1));
        tp.setXYZ(i, c.x + (tp.getX(i) - c.x) * k, c.y + (tp.getY(i) - c.y) * k, c.z + (tp.getZ(i) - c.z) * k);
      }
      tube.computeVertexNormals();
      head.add('kuma', tube);
      // red dot on forehead
    }
    const dot = onHead(0, 24, -0.001);
    head.add('kuma', new THREE.SphereGeometry(1, 12, 8), dot.p, dot.q, [0.022, 0.03, 0.01]);
    // snout
    addMuzzle('fur', { w: 0.09, h: 0.065, d: 0.11, pitch: -22, inset: 0.05, noseW: 0.03, noseH: 0.022 });
    // cheek fluff tufts
    for (const sgn of [1, -1]) {
      const f = onHead(sgn * 62, -30, 0.03);
      head.add('fur', new THREE.ConeGeometry(0.06, 0.13, 12), f.p.clone().add(V(sgn * 0.03, -0.01, 0)), yTo(V(sgn * 1, -0.35, 0.1)), [1, 1, 0.6]);
    }
    // tall pointy ears, orange back, red inner
    for (const s of [1, -1]) {
      addEar(s, 36, 50, (P) => {
        P.add('orange', new THREE.ConeGeometry(0.085, 0.24, 12), [0, 0.12, 0], null, [1, 1, 0.5]);
        P.add('inner', new THREE.ConeGeometry(0.055, 0.17, 10), [0, 0.1, 0.022], null, [1, 1, 0.35]);
        P.add('dark', new THREE.ConeGeometry(0.03, 0.06, 10), [0, 0.215, 0], null, [1, 1, 0.55]);
      }, { tilt: 0.28, lean: -0.05 });
    }
    // red bib (前掛け)
    extra.bib = () => clothMat(0xd8321c, 0.75);
    const bib = new THREE.Shape();
    bib.moveTo(-0.15, 0.03);
    bib.quadraticCurveTo(0, -0.02, 0.15, 0.03);
    bib.quadraticCurveTo(0.14, -0.18, 0, -0.22);
    bib.quadraticCurveTo(-0.14, -0.18, -0.15, 0.03);
    const bg = new THREE.ExtrudeGeometry(bib, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 12 });
    const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setZ(i, bp.getZ(i) - (bp.getX(i) ** 2) * 1.6 + bp.getY(i) * 0.25);
    bg.computeVertexNormals();
    torso.add('bib', bg, T(V(0, 0.8, -0.14)), eulerQ(-0.2, 0, 0));
    torso.add('bib', new THREE.TorusGeometry(0.12, 0.018, 8, 24), T(V(0, 0.82, -0.24)), eulerQ(Math.PI / 2 - 0.25, 0, 0));
    // orange body back/sides: add an orange shell on the back
    torso.add('orange', superEllipsoid(0.185, 0.19, 0.12, { ws: 16, hs: 10 }), T(V(0, 0.66, -0.33)));
    // big fluffy tail: orange with white tip, curling up
    extra.foxTail = () => cmat('foxTail', () => new THREE.MeshPhysicalMaterial({
      map: ctex('foxTailTex', 32, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, h, 0, 0);
        gr.addColorStop(0, css(0xf28a2e));
        gr.addColorStop(0.6, css(0xf5963a));
        gr.addColorStop(0.7, css(0xfaf5ee));
        gr.addColorStop(1, css(0xfaf5ee));
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }), roughness: 0.75, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffe0c0),
    }));
    const tg = bendAlongY(tailLathe(0.56, 0.155, 0.055), 2.6);
    tail = {
      pos: T(V(0, 0.62, -0.39)), quat: basisQuat(V(0, 0.25, -1), V(0, 1, 0)),
      slots: (() => { const P = new PartBuilder(); P.add('foxTail', tg); return P.merge(); })(),
    };
  } else if (id === 'neko') {
    // calico patches (flush with the fur, like paint)
    const patch = (slot, yaw, pitch, rx, ry, rot = 0) => {
      const f = onHead(yaw, pitch, 0.024);
      head.add(slot, new THREE.SphereGeometry(1, 12, 8), f.p, f.q.clone().multiply(eulerQ(0, 0, rot)), [rx, ry, 0.03]);
    };
    patch('orange', 38, 44, 0.1, 0.085, 0.4);
    patch('orange', 66, 8, 0.07, 0.085, -0.3);
    patch('black', -40, 46, 0.095, 0.08, -0.4);
    patch('black', -150, 34, 0.09, 0.075, 0.2);
    patch('orange', 160, 10, 0.08, 0.07, 0.5);
    extra.pinkNose = () => glossMat(0xf08aa0, 0.3);
    addMuzzle('fur', { w: 0.095, h: 0.06, d: 0.07, pitch: -26, noseW: 0.024, noseH: 0.016, noseSlot: 'pinkNose' });
    // whiskers
    extra.whisker = () => cmat('whisker', () => new THREE.MeshStandardMaterial({ color: 0x5a4a48, roughness: 0.6 }));
    for (const sgn of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const f = onHead(sgn * 30, -26 - k * 4, -0.01);
        const d = V(sgn, 0.12 - k * 0.12, 0.18).normalize();
        head.add('whisker', new THREE.CylinderGeometry(0.0035, 0.002, 0.13, 3), f.p.clone().addScaledVector(d, 0.065), yTo(d));
      }
    }
    for (const s of [1, -1]) {
      addEar(s, 38, 46, (P) => {
        P.add(s > 0 ? 'orange' : 'black', new THREE.ConeGeometry(0.1, 0.16, 12), [0, 0.07, 0], null, [1, 1, 0.5]);
        P.add('inner', new THREE.ConeGeometry(0.065, 0.11, 10), [0, 0.06, 0.02], null, [1, 1, 0.3]);
      }, { tilt: 0.32, lean: -0.05 });
    }
    // collar + bell
    extra.collar = () => glossMat(0xe0303a, 0.4);
    torso.add('collar', new THREE.TorusGeometry(0.125, 0.024, 6, 20), T(V(0, 0.82, -0.235)), eulerQ(Math.PI / 2 - 0.22, 0, 0));
    torso.add('gold', new THREE.SphereGeometry(0.042, 12, 8), T(V(0, 0.775, -0.105)));
    torso.add('nose', new THREE.TorusGeometry(0.042, 0.005, 4, 14, Math.PI), T(V(0, 0.775, -0.105)));
    torso.add('nose', new THREE.CylinderGeometry(0.006, 0.006, 0.03, 5), T(V(0, 0.76, -0.066)), eulerQ(Math.PI / 2 - 0.2, 0, 0));
    // body patches
    torso.add('orange', superEllipsoid(0.13, 0.12, 0.08, { ws: 14, hs: 9 }), T(V(0.09, 0.66, -0.36)));
    torso.add('black', superEllipsoid(0.1, 0.09, 0.06, { ws: 14, hs: 9 }), T(V(-0.1, 0.6, -0.38)));
    // tail (tube, orange with black tip), curving up like a question mark
    extra.catTail = () => cmat('catTail', () => new THREE.MeshPhysicalMaterial({
      map: ctex('catTailTex', 256, 16, (g, w, h) => {
        g.fillStyle = css(0xf29a42);
        g.fillRect(0, 0, w, h);
        g.fillStyle = css(0x3b3438);
        g.fillRect(w * 0.5, 0, w * 0.1, h);
        g.fillRect(w * 0.78, 0, w * 0.22, h);
      }), roughness: 0.75, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffe0c0),
    }));
    const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0.06, -0.12), V(0, 0.2, -0.2), V(0, 0.36, -0.17), V(0, 0.44, -0.07), V(0, 0.42, 0.0)]);
    const tube = new THREE.TubeGeometry(curve, 20, 0.034, 8, false);
    const cap = new THREE.SphereGeometry(0.034, 8, 6);
    tail = { pos: T(V(0, 0.58, -0.41)), quat: new THREE.Quaternion(), slots: (() => { const P = new PartBuilder(); P.add('catTail', tube); P.add('black', cap, V(0, 0.42, 0.0)); return P.merge(); })() };
  } else if (id === 'shiba') {
    // cream mask: muzzle + cheeks
    addMuzzle('fur2', { w: 0.11, h: 0.075, d: 0.09, pitch: -24, noseW: 0.034, noseH: 0.024 });
    for (const sgn of [1, -1]) {
      const f = onHead(sgn * 40, -30, 0.035);
      head.add('fur2', new THREE.SphereGeometry(1, 12, 9), f.p, f.q, [0.1, 0.075, 0.06]);
    }
    // maro eyebrows (麻呂眉)
    for (const sgn of [1, -1]) {
      const f = onHead(sgn * 22, 15, -0.002);
      head.add('fur2', new THREE.SphereGeometry(1, 10, 7), f.p, f.q, [0.03, 0.021, 0.012]);
    }
    for (const s of [1, -1]) {
      addEar(s, 38, 46, (P) => {
        P.add('fur', new THREE.ConeGeometry(0.1, 0.17, 12), [0, 0.075, 0], null, [1, 1, 0.5]);
        P.add('inner', new THREE.ConeGeometry(0.066, 0.12, 10), [0, 0.06, 0.02], null, [1, 1, 0.3]);
      }, { tilt: 0.3, lean: 0.05 });
    }
    // cream chest
    torso.add('fur2', new THREE.SphereGeometry(1, 14, 10), T(V(0, 0.64, -0.15)), null, [0.13, 0.15, 0.06]);
    // blue bandana: neck roll + draped triangle with white dots
    extra.bandana = () => clothMat(0x2f6fd6, 0.65);
    extra.bandanaDot = () => clothMat(0xf4f6fa, 0.7);
    torso.add('bandana', new THREE.TorusGeometry(0.128, 0.028, 8, 24), T(V(0, 0.825, -0.235)), eulerQ(Math.PI / 2 - 0.22, 0, 0));
    const tri = new THREE.Shape();
    tri.moveTo(-0.15, 0.0);
    tri.quadraticCurveTo(0, 0.025, 0.15, 0.0);
    tri.quadraticCurveTo(0.06, -0.08, 0.0, -0.17);
    tri.quadraticCurveTo(-0.06, -0.08, -0.15, 0.0);
    const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, curveSegments: 8 });
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setZ(i, tp.getZ(i) - tp.getX(i) ** 2 * 2.2 + tp.getY(i) * 0.3);
    tg.computeVertexNormals();
    torso.add('bandana', tg, T(V(0, 0.81, -0.13)), eulerQ(-0.25, 0, 0));
    for (const [x, y] of [[0.07, 0.795], [-0.07, 0.795], [0, 0.745], [0.035, 0.7], [-0.035, 0.7]]) {
      torso.add('bandanaDot', new THREE.SphereGeometry(1, 8, 5), T(V(x, y, -0.105 - Math.abs(x) * 0.2 + (0.8 - y) * 0.3)), eulerQ(-0.3, 0, 0), [0.014, 0.014, 0.006]);
    }
    // curled tail (torus arc)
    const tt = new THREE.TorusGeometry(0.085, 0.045, 10, 20, Math.PI * 1.55);
    tail = {
      pos: T(V(0, 0.6, -0.41)), quat: eulerQ(0, Math.PI / 2, 0),
      slots: (() => {
        const P = new PartBuilder();
        P.add('fur', tt, [0.0, 0.085, 0.0], [0, 0, -Math.PI / 2]);
        return P.merge();
      })(),
    };
  } else if (id === 'usagi') {
    addMuzzle('fur', { w: 0.08, h: 0.055, d: 0.06, pitch: -24, noseW: 0.02, noseH: 0.015 });
    // tooth
    const f = onHead(0, -36, 0.0);
    head.add('white', new RoundedBoxGeometry(0.03, 0.028, 0.01, 1, 0.004), f.p.clone().addScaledVector(f.n, 0.03), f.q);
    for (const s of [1, -1]) {
      addEar(s, 22, 60, (P) => {
        P.add('fur', new THREE.CapsuleGeometry(0.06, 0.3, 4, 12), [0, 0.2, 0], null, [1, 1, 0.55]);
        P.add('inner', new THREE.CapsuleGeometry(0.037, 0.24, 3, 8), [0, 0.2, 0.022], null, [1, 1, 0.3]);
      }, { tilt: 0.14, lean: -0.12, amp: 1.6 });
    }
    // crescent moon hairpin
    const moon = new THREE.Shape();
    moon.absarc(0, 0, 0.05, Math.PI * 0.35, Math.PI * 1.65, false);
    moon.absarc(0.022, 0, 0.04, Math.PI * 1.55, Math.PI * 0.45, true);
    const mg = new THREE.ExtrudeGeometry(moon, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
    const mf = onHead(-36, 40, -0.01);
    head.add('gold', mg, mf.p, mf.q.clone().multiply(eulerQ(0, 0, 0.6)));
    // ribbon bow at neck
    extra.ribbon = () => glossMat(0x8a5ce0, 0.45);
    torso.add('ribbon', new THREE.TorusGeometry(0.122, 0.02, 6, 20), T(V(0, 0.82, -0.235)), eulerQ(Math.PI / 2 - 0.22, 0, 0));
    for (const s of [1, -1]) torso.add('ribbon', new THREE.ConeGeometry(0.05, 0.1, 12), T(V(s * 0.055, 0.79, -0.1)), eulerQ(0, 0, s * Math.PI / 2), [1, 1, 0.45]);
    torso.add('ribbon', new THREE.SphereGeometry(0.026, 12, 8), T(V(0, 0.79, -0.1)));
    // pom tail
    tail = { pos: T(V(0, 0.55, -0.43)), quat: new THREE.Quaternion(), slots: (() => { const P = new PartBuilder(); P.add('fur', superEllipsoid(0.07, 0.065, 0.065, { ws: 14, hs: 10 })); return P.merge(); })() };
  } else if (id === 'kappa') {
    // beak
    extra.beak = () => glossMat(S.beak, 0.35);
    const bf = onHead(0, -20, 0.04);
    head.add('beak', new THREE.SphereGeometry(1, 16, 10), bf.p, bf.q, [0.11, 0.05, 0.1]);
    head.add('mouth', new THREE.TorusGeometry(0.09, 0.005, 6, 20, Math.PI * 0.7), bf.p.clone().addScaledVector(bf.n, 0.015).add(V(0, -0.004, 0)), bf.q.clone().multiply(eulerQ(Math.PI / 2 + 0.3, 0, Math.PI * 1.15)), [1, 0.9, 1]);
    for (const sgn of [1, -1]) head.add('nose', new THREE.SphereGeometry(0.008, 6, 4), bf.p.clone().addScaledVector(bf.n, 0.09).add(V(sgn * 0.02, 0.025, 0)));
    // dish (皿) on top + hair fringe
    extra.dish = () => cmat('kappaDish', () => new THREE.MeshPhysicalMaterial({ color: 0xf1f4ee, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
    extra.water = () => cmat('kappaWater', () => new THREE.MeshPhysicalMaterial({ color: 0x6cc6e2, roughness: 0.04, clearcoat: 1, metalness: 0.15, emissive: 0x1a6a88, emissiveIntensity: 0.25 }));
    extra.hair = () => cmat('kappaHair', () => new THREE.MeshPhysicalMaterial({ color: S.hair, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide }));
    const topY = hs.at(0, 90).p.y;
    const top = Hd(V(0, topY - 0.032, 0));
    head.add('dish', lathe([[0, 0], [0.11, 0.0], [0.148, 0.012], [0.162, 0.03], [0.16, 0.042], [0.149, 0.043], [0.137, 0.031], [0.0, 0.027]], 22), top);
    head.add('water', new THREE.CircleGeometry(0.139, 22), top.clone().add(V(0, 0.038, 0)), [-Math.PI / 2, 0, 0]);
    // okappa hair: a shell band hugging the head, jagged lower edge
    {
      const cols = 36;
      const rows = 5;
      const pos = [];
      const idx = [];
      for (let i = 0; i <= cols; i++) {
        const yaw = (i / cols) * 360;
        const front = Math.max(0, Math.cos(degToRad(yaw)));
        const jag = i % 2 === 0 ? 0 : 1;
        for (let j = 0; j <= rows; j++) {
          const t = j / rows;
          const lowP = 22 + front * 22 - jag * 9;
          const pitch = lerp(57, lowP, t);
          const f = hs.at(yaw, pitch);
          const q = Hd(f.p).addScaledVector(f.n, 0.012 + 0.016 * Math.sin(Math.PI * t) + 0.01 * t);
          pos.push(q.x, q.y, q.z);
        }
      }
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const a = i * (rows + 1) + j;
          const b = a + rows + 1;
          idx.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      hg.setIndex(idx);
      hg.computeVertexNormals();
      head.addRaw('hair', hg);
    }
    // shell on back
    extra.shell = () => cmat('kappaShell', () => new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: ctex('shellTex', 256, 256, (g, w, h) => {
        g.fillStyle = css(0x6b7a3c);
        g.fillRect(0, 0, w, h);
        g.strokeStyle = css(0x3f4a22);
        g.lineWidth = 6;
        const R = 36;
        for (let row = -1; row < 6; row++) {
          for (let col = -1; col < 6; col++) {
            const cx = col * R * 1.5;
            const cy = row * R * 1.732 + (col % 2 ? R * 0.866 : 0);
            g.beginPath();
            for (let k = 0; k <= 6; k++) {
              const a = (k / 6) * TAU;
              g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
            }
            g.stroke();
          }
        }
      }), roughness: 0.45, clearcoat: 0.6,
    }));
    extra.shellRim = () => glossMat(S.shellRim, 0.5);
    torso.add('shell', superEllipsoid(0.21, 0.23, 0.11, { ws: 20, hs: 12 }), T(V(0, 0.68, -0.38)));
    torso.add('shellRim', new THREE.TorusGeometry(0.2, 0.025, 6, 26), T(V(0, 0.68, -0.34)), null, [1, 1.12, 1]);
    // plastron
    extra.belly = () => furMat(S.belly);
    torso.add('belly', new THREE.SphereGeometry(1, 14, 10), T(V(0, 0.64, -0.15)), null, [0.14, 0.16, 0.06]);
    for (let k = 0; k < 3; k++) torso.add('shellRim', new THREE.TorusGeometry(0.1, 0.006, 6, 18, Math.PI), T(V(0, 0.6 + k * 0.05, -0.1)), eulerQ(0, 0, Math.PI), [1.1, 0.25, 1]);
  } else if (id === 'tengu') {
    extra.robe = () => clothMat(S.robe, 0.7);
    extra.robe2 = () => glossMat(0xe2b14c, 0.35);
    extra.hat = () => glossMat(S.hat, 0.3);
    extra.pom = () => furMat(S.pom, 'pom');
    extra.brow = () => furMat(S.brow, 'brow');
    // long nose
    const nf = onHead(0, -8, 0.02);
    const nd = V(0, 0.22, 1).normalize();
    head.add('fur', new THREE.CylinderGeometry(0.017, 0.046, 0.2, 12, 2), nf.p.clone().addScaledVector(nd, 0.1), yTo(nd));
    head.add('fur', new THREE.SphereGeometry(0.019, 8, 6), nf.p.clone().addScaledVector(nd, 0.2));
    // bushy brows
    for (const sgn of [1, -1]) {
      const f = onHead(sgn * 24, 12, 0.0);
      head.add('brow', superEllipsoid(0.062, 0.03, 0.03, { ws: 10, hs: 6 }), f.p, f.q.clone().multiply(eulerQ(0, 0, sgn * -0.35)));
    }
    // smile
    const mf = onHead(0, -30, 0);
    addSmile(head, mf.p.clone().addScaledVector(mf.n, 0.004), mf.q, 0.04);
    // white hair (old sage style): a thick rounded mass around the back and sides with scalloped lock tips;
    // the red crown stays bare under the black tokin
    extra.hair = () => cmat('tenguHair', () => new THREE.MeshPhysicalMaterial({
      color: S.hair, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide,
      normalMap: hairStrandNormalMap(), normalScale: new THREE.Vector2(1.2, 1.2),
    }));
    head.addRaw('hair', hairShell({
      y0: 76, y1: 284, cols: 44, rows: 8, pitchTop: 24,
      pitchLow: (yaw) => {
        const back = 1 - Math.min(1, Math.abs(yaw - 180) / 104);
        const scallop = 0.5 + 0.5 * Math.cos(degToRad(yaw - 180) * 7);
        return lerp(-14, -64, smooth(0.0, 0.6, back)) - 12 * scallop * (0.3 + 0.7 * back);
      },
      off: (t, yaw) => {
        const back = 1 - Math.min(1, Math.abs(yaw - 180) / 104);
        const lockBulge = Math.max(0, Math.cos(degToRad(yaw - 180) * 7)) * t;
        return 0.012 + (0.026 + 0.03 * back + 0.022 * lockBulge) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.6);
      },
    }));
    // little white goatee
    for (const [yaw, pitch, r] of [[0, -58, 0.052], [20, -51, 0.042], [-20, -51, 0.042]]) {
      const f = onHead(yaw, pitch, r * 0.5);
      head.add('hair', new THREE.SphereGeometry(1, 8, 6), f.p, f.q, [r, r * 1.1, r * 0.8]);
    }
    // tokin (頭襟): small black 12-sided cap on the forehead
    const tf = onHead(0, 58, 0.035);
    head.add('hat', new THREE.CylinderGeometry(0.056, 0.076, 0.085, 12), tf.p.clone().addScaledVector(tf.n, 0.035), yTo(tf.n));
    head.add('hat', new THREE.SphereGeometry(0.022, 8, 6), tf.p.clone().addScaledVector(tf.n, 0.082));
    // robe (indigo) with gold sash and white bonten pompoms
    torso.add('robe2', new THREE.TorusGeometry(0.132, 0.018, 5, 20), T(V(0, 0.82, -0.24)), eulerQ(Math.PI / 2 - 0.22, 0, 0));
    for (const sgn of [1, -1]) torso.add('robe2', new THREE.CylinderGeometry(0.016, 0.016, 0.26, 6), T(V(sgn * 0.09, 0.69, -0.125)), eulerQ(-0.14, 0, sgn * 0.08));
    const pomG = new THREE.IcosahedronGeometry(1, 1);
    {
      const pp = pomG.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const k = 1 + 0.12 * Math.sin(pp.getX(i) * 13) * Math.sin(pp.getY(i) * 11) * Math.sin(pp.getZ(i) * 12);
        pp.setXYZ(i, pp.getX(i) * k, pp.getY(i) * k, pp.getZ(i) * k);
      }
      pomG.computeVertexNormals();
    }
    for (let k = 0; k < 3; k++) {
      for (const sgn of [1, -1]) {
        torso.add('pom', pomG, T(V(sgn * 0.09, 0.78 - k * 0.07, -0.108 + k * 0.004)), null, 0.036 - k * 0.002);
      }
    }
    // little crow wings
    extra.wing = () => cmat('tenguWing', () => new THREE.MeshPhysicalMaterial({ color: 0x2c2a38, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color(0x6a6aa0), side: THREE.DoubleSide }));
    const wing = new THREE.Shape();
    wing.moveTo(0, 0);
    wing.quadraticCurveTo(0.12, 0.2, 0.3, 0.2);
    wing.lineTo(0.26, 0.14);
    wing.lineTo(0.28, 0.1);
    wing.lineTo(0.22, 0.06);
    wing.lineTo(0.23, 0.02);
    wing.lineTo(0.15, 0.0);
    wing.quadraticCurveTo(0.07, -0.04, 0, 0);
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 6 });
    for (const s of [1, -1]) {
      earList.push({
        parent: 'torso',
        pos: T(V(s * 0.08, 0.72, -0.38)),
        quat: eulerQ(0.2, s * -0.55, 0).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), s > 0 ? 0 : Math.PI)),
        slots: (() => { const P = new PartBuilder(); P.add('wing', wg, [0, 0, -0.006]); return P.merge(); })(),
        side: s, amp: 1.5,
      });
    }
  } else if (id === 'oni') {
    extra.horn = () => glossMat(S.horn, 0.35);
    extra.hair = () => furMat(S.hair, 'hair');
    extra.tiger = () => cmat('oniTiger', () => new THREE.MeshPhysicalMaterial({
      map: tigerTexture('tigerCloth', 0xf6b52a, 0x2a2328), roughness: 0.7, sheen: 0.4, sheenColor: new THREE.Color(0xffe0a0),
    }));
    // horns
    for (const sgn of [1, -1]) {
      const f = onHead(sgn * 30, 55, 0.02);
      const d = f.n.clone().lerp(V(0, 1, 0), 0.4).normalize();
      const hornG = new THREE.ConeGeometry(0.045, 0.13, 12, 2);
      head.add('horn', hornG, f.p.clone().addScaledVector(d, 0.06), yTo(d));
      head.add('horn', new THREE.TorusGeometry(0.043, 0.01, 4, 12), f.p.clone().addScaledVector(d, 0.02), yTo(d).multiply(eulerQ(Math.PI / 2, 0, 0)));
    }
    // curly hair: a dark cap with scalloped hem + curls on top
    extra.hair = () => cmat('oniHair', () => new THREE.MeshPhysicalMaterial({
      color: S.hair, roughness: 0.6, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x8890d0), side: THREE.DoubleSide,
    }));
    head.addRaw('hair', hairShell({
      y0: -180, y1: 180, cols: 36, rows: 5, pitchTop: 89.5,
      pitchLow: (yaw, i) => {
        const front = Math.max(0, Math.cos(degToRad(yaw)));
        return lerp(8, 30, front) + (i % 2 ? 7 : 0);
      },
      off: (t) => 0.018 + 0.012 * Math.sin(Math.PI * t),
    }));
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const curls = [[0, 76], [60, 64], [-60, 64], [105, 46], [-105, 46], [150, 56], [-150, 56], [180, 34], [135, 24], [-135, 24], [180, 70], [0, 52], [90, 76], [-90, 76]];
    for (const [yaw, pitch] of curls) {
      const f = onHead(yaw, pitch, 0.012);
      const rr = 0.058 + r() * 0.014;
      head.add('hair', new THREE.SphereGeometry(rr, 9, 6), f.p);
    }
    // happy open mouth with fangs
    const mf = onHead(0, -30, 0.0);
    addOpenMouth(head, mf, 0.05, 0.032);
    for (const sgn of [1, -1]) {
      const x = V(1, 0, 0).applyQuaternion(mf.q);
      head.add('white', new THREE.ConeGeometry(0.012, 0.03, 8), mf.p.clone().addScaledVector(x, sgn * 0.03).addScaledVector(mf.n, 0.004).add(V(0, 0.004, 0)), mf.q.clone().multiply(eulerQ(Math.PI / 2, 0, 0)).multiply(eulerQ(-Math.PI / 2, 0, 0)));
    }
    // brows
    for (const sgn of [1, -1]) {
      const f = onHead(sgn * 25, 13, -0.004);
      head.add('hair', superEllipsoid(0.04, 0.014, 0.012, { ws: 10, hs: 6 }), f.p, f.q.clone().multiply(eulerQ(0, 0, sgn * 0.25)));
    }
    // nose
    const nf = onHead(0, -14, -0.01);
    head.add('fur', new THREE.SphereGeometry(0.03, 12, 10), nf.p);
  }

  return {
    torso: torso.merge(),
    head: head.merge(),
    eyes: eyes.merge(),
    eyeCenter,
    eyeFrames: eyeFrames.map((e) => ({ p: e.p.clone(), n: e.n.clone() })),
    ears: earList,
    tail,
    cuffs: id === 'oni',
    mats: (base) => {
      const out = {};
      for (const [k, f] of Object.entries(extra)) out[k] = f();
      if (id === 'tengu') {
        out.arm = out.robe;
      }
      if (!base.dark) out.dark = base.nose;
      if (!base.inner) out.inner = base.fur;
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Flags (per instance: vertex flutter)
// ---------------------------------------------------------------------------
function makeFlag(ch, side) {
  // two single-sided layers (front faces +X, back faces -X) so the text reads correctly from both sides
  const front = new THREE.PlaneGeometry(0.16, 0.28, 6, 3);
  front.translate(0.08, 0, 0); // x in [0, 0.16] from the pole
  front.rotateY(Math.PI / 2); // plane in YZ, trailing toward -Z, facing +X
  const uvF = front.attributes.uv;
  for (let i = 0; i < uvF.count; i++) uvF.setX(i, uvF.getX(i) * 0.5);
  const back = front.clone();
  const uvB = back.attributes.uv;
  for (let i = 0; i < uvB.count; i++) uvB.setX(i, 0.5 + (0.5 - uvB.getX(i)));
  flipWinding(back);
  const g = mergeGeometries([front, back], false);
  const base = g.attributes.position.array.slice();
  const m = new THREE.Mesh(g, kartMats(ch).flag);
  m.position.set(side * K.flagX, 0.93, K.flagZ - 0.012);
  m.castShadow = true;
  const phase = side * 1.3;
  return {
    mesh: m,
    update(t, speed) {
      const p = g.attributes.position;
      const amp = 0.01 + Math.min(Math.abs(speed), 30) * 0.0011;
      const f = 7 + Math.min(Math.abs(speed), 30) * 0.12;
      for (let i = 0; i < p.count; i++) {
        const z = base[i * 3 + 2];
        const y = base[i * 3 + 1];
        const k = -z / 0.16; // 0 at pole → 1 at tip
        p.setX(i, base[i * 3] + Math.sin(t * f - k * 5 + y * 3 + phase) * amp * k * 3);
        p.setZ(i, z + (Math.cos(t * f - k * 5) - 1) * amp * k * 0.6);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
    },
    dispose() {
      g.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Kart assembly
// ---------------------------------------------------------------------------
const DEFAULT_STATE = {
  speed: 0, steer: 0, driftDir: 0, boosting: false, airborne: false, gliding: false,
  trickT: -1, trickType: 'flip', squash: 0, spinOut: false, time: 0,
};

/**
 * @param {string} characterId
 * @param {object} [previewPose] optional animate() state applied (and settled) for previews,
 *   e.g. { steer: 1, driftDir: 1 } — plus { glider: 1 } to attach an open glider.
 */
export function createKartModel(characterId = 'tanuki', previewPose = null) {
  const ch = getCharacter(characterId);
  const mats = kartMats(ch);

  const root = new THREE.Group();
  root.name = `kart-${ch.id}`;
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  body.add(chassis);

  // chassis parts
  meshesFromSlots(chassisGeometry(), mats, chassis, { noCast: ['emblem', 'lamp', 'tailLamp', 'gold', 'black'] });

  // steering wheel
  const steerPivot = new THREE.Group();
  steerPivot.position.copy(K.wheelCenter);
  steerPivot.rotation.x = -(Math.PI - K.wheelTilt); // face points back/up toward the driver
  chassis.add(steerPivot);
  const steerSpin = new THREE.Group();
  steerPivot.add(steerSpin);
  meshesFromSlots(steeringWheelGeometry(), mats, steerSpin, { noCast: ['gold', 'chrome'] });

  // wheels
  const wheels = [];
  for (const kind of ['front', 'rear']) {
    const T = TYRES[kind];
    const geos = wheelGeometry(kind);
    const rubber = SH.rubber(kind);
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * T.x, T.R, T.z);
      body.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      const holder = new THREE.Group();
      if (side < 0) holder.rotation.y = Math.PI;
      spin.add(holder);
      meshesFromSlots(geos, { rubber, rim: mats.rim, chrome: mats.chrome, darkMetal: mats.darkMetal }, holder, { noCast: ['rim', 'chrome'] });
      wheels.push({ kind, side, pivot, spin, R: T.R, baseY: T.R, droop: 0 });
    }
  }

  // flags
  const flags = [makeFlag(ch, 1), makeFlag(ch, -1)];
  for (const f of flags) chassis.add(f.mesh);

  // driver
  const drv = buildDriver(ch);
  chassis.add(drv.group);

  // glider mount: at the driver's raised right hand (driver's right = -X), shaft tilted toward center
  const gliderMount = new THREE.Object3D();
  gliderMount.name = 'gliderMount';
  gliderMount.position.set(-0.3, 1.08, -0.2);
  gliderMount.rotation.set(0, 0, -0.12);
  chassis.add(gliderMount);

  // outputs (root space, updated in animate)
  const exhaustLocal = K.exhaust.map((e) => e.clone());
  const exhaustPoints = exhaustLocal.map((e) => e.clone());
  const rearLocal = wheels.filter((w) => w.kind === 'rear').sort((a, b) => b.side - a.side).map((w) => V(w.side * TYRES.rear.x, 0, TYRES.rear.z));
  const rearWheelContacts = rearLocal.map((p) => p.clone());
  // [left(+x), right(-x)]

  // animation state (all smoothed)
  const A = { steer: 0, drift: 0, yaw: 0, roll: 0, pitch: 0, droop: 0, glide: 0 };
  const qTmp = new THREE.Quaternion();
  const qA = new THREE.Quaternion();
  const eTmp = new THREE.Euler();
  const com = K.com.clone();
  const comS = V();
  const wheelMatrix = new THREE.Matrix4();
  const gripPoint = V();
  const m4 = new THREE.Matrix4();
  const poseCtx = {
    time: 0, steer: 0, drift: 0, boost: false, trick: 0, glide: 0, spin: false, wheelMatrix, gripPoint, portrait: false,
  };
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

  /**
   * Per-frame animation. s = { speed, steer, driftDir, boosting, airborne, gliding, trickT, trickType,
   * squash, spinOut, time } (missing fields default to neutral values).
   */
  function animate(dt, s = {}) {
    dt = clamp(num(dt), 0, 0.1);
    const t = num(s.time);
    const speed = num(s.speed);
    const steer = clamp(num(s.steer), -1, 1);
    const drift = clamp(num(s.driftDir), -1, 1);
    const boosting = !!s.boosting;
    const spinOut = !!s.spinOut;

    // ---- smoothed parameters
    A.steer = damp(A.steer, steer, 12, dt);
    A.drift = damp(A.drift, drift, 8, dt);
    A.yaw = damp(A.yaw, -0.35 * drift, 7, dt);
    A.roll = damp(A.roll, -(steer * 0.035 + drift * 0.06) * Math.min(1, Math.abs(speed) / 8 + 0.2), 6, dt);
    A.pitch = damp(A.pitch, boosting ? -0.07 : 0, 5, dt);
    A.droop = damp(A.droop, s.airborne || s.gliding ? 0.08 : 0, s.airborne || s.gliding ? 6 : 14, dt);
    A.glide = damp(A.glide, s.gliding ? 1 : 0, 6, dt);

    // ---- wheels: spin (+X rotation rolls toward +Z), steer yaw, suspension droop
    for (const w of wheels) {
      w.spin.rotation.x = (w.spin.rotation.x + (speed / w.R) * dt) % TAU;
      w.pivot.position.y = w.baseY - A.droop;
      w.pivot.rotation.y = w.kind === 'front' ? -A.steer * 0.45 : 0;
    }

    // ---- steering wheel (turning right = clockwise from the driver's view)
    steerSpin.rotation.z = -A.steer * 1.25 - (spinOut ? Math.sin(t * 20) * 0.5 : 0);

    // ---- chassis: suspension roll (outward) + engine vibration
    const idle = 1 - Math.min(1, Math.abs(speed) / 12);
    const jit = (0.0025 + 0.002 * idle + (boosting ? 0.004 : 0)) * Math.sin(t * 61) + 0.0015 * Math.sin(t * 37.3);
    chassis.position.set(boosting ? Math.sin(t * 47) * 0.004 : 0, jit + A.droop * 0.25, 0);
    chassis.rotation.set(Math.sin(t * 23) * 0.002, 0, A.roll);

    // ---- body: drift yaw, boost pitch, tricks, squash (rotations pivot around the center of mass)
    let trickA = 0;
    let armsUp = 0;
    const tt = s.trickT;
    if (Number.isFinite(tt) && tt >= 0 && tt <= 1) {
      const e = tt < 0.5 ? 4 * tt * tt * tt : 1 - Math.pow(-2 * tt + 2, 3) / 2; // easeInOutCubic
      trickA = e * TAU;
      armsUp = Math.sin(Math.PI * clamp(tt * 1.15, 0, 1));
    }
    qTmp.setFromEuler(eTmp.set(A.pitch, A.yaw, 0, 'YXZ'));
    if (trickA !== 0) {
      if (s.trickType === 'spin') qA.setFromAxisAngle(Y_AXIS, trickA);
      else if (s.trickType === 'roll') qA.setFromAxisAngle(Z_AXIS, trickA);
      else qA.setFromAxisAngle(X_AXIS, trickA); // 'flip': nose dips first (front flip)
      qTmp.multiply(qA);
    }
    body.quaternion.copy(qTmp);
    const sq = clamp(num(s.squash), 0, 1);
    body.scale.set(1 + 0.08 * sq, 1 - 0.15 * sq, 1 + 0.08 * sq);
    // p = com - R * (S * com)
    comS.set(com.x * body.scale.x, com.y * body.scale.y, com.z * body.scale.z).applyQuaternion(qTmp);
    body.position.copy(com).sub(comS);
    if (spinOut) body.position.y += Math.abs(Math.sin(t * 10)) * 0.02;

    // ---- flags
    for (const f of flags) f.update(t, speed);

    // ---- driver
    chassis.updateMatrix();
    steerPivot.updateMatrix();
    steerSpin.updateMatrix();
    wheelMatrix.multiplyMatrices(steerPivot.matrix, steerSpin.matrix);
    gripPoint.copy(gliderMount.position);
    poseCtx.time = t;
    poseCtx.steer = A.steer;
    poseCtx.drift = A.drift;
    poseCtx.boost = boosting;
    poseCtx.trick = armsUp;
    poseCtx.glide = A.glide;
    poseCtx.spin = spinOut;
    drv.pose(dt, poseCtx);

    // ---- outputs in root space
    body.updateMatrix();
    m4.multiplyMatrices(body.matrix, chassis.matrix);
    for (let i = 0; i < exhaustPoints.length; i++) exhaustPoints[i].copy(exhaustLocal[i]).applyMatrix4(m4);
    for (let i = 0; i < rearWheelContacts.length; i++) {
      rearWheelContacts[i].copy(rearLocal[i]);
      rearWheelContacts[i].y = -A.droop;
      rearWheelContacts[i].applyMatrix4(body.matrix);
    }
  }

  const kart = {
    root, body, chassis, driver: drv.group, gliderMount, exhaustPoints, rearWheelContacts,
    radius: 1.0, character: ch, animate,
    dispose() {
      root.parent?.remove(root);
      for (const f of flags) f.dispose();
    },
  };

  animate(1 / 60, DEFAULT_STATE);
  if (previewPose) {
    const pose = { ...previewPose };
    if (pose.glider) {
      const gl = createGlider(ch.id);
      gl.setOpen(pose.glider);
      gliderMount.add(gl.group);
      pose.gliding = true;
      kart.glider = gl;
    }
    for (let i = 0; i < 180; i++) animate(1 / 60, { ...pose, time: (pose.time ?? 1) + i / 60 });
  }
  return kart;
}

/**
 * A standalone seated driver (no kart) for portraits / menus.
 * → { group, head (head pivot), headCenter (Vector3 in group space), pose(dt, ctx) }
 * group space = kart chassis space (ground at y=0, head center ≈ 1.1 m up).
 * pose ctx: { time, steer, drift, boost, trick, glide, spin, portrait } (portrait: true → waving paw).
 */
export function createDriverModel(characterId = 'tanuki') {
  const ch = getCharacter(characterId);
  const drv = buildDriver(ch);
  const wrap = new THREE.Group();
  wrap.add(drv.group);
  const base = { time: 0, steer: 0, drift: 0, boost: false, trick: 0, glide: 0, spin: false, wheelMatrix: null, gripPoint: null, portrait: false };
  drv.pose(1 / 60, { ...base, time: 0.5 });
  return {
    group: wrap,
    head: drv.headPivot,
    headCenter: HEAD_C.clone(),
    pose: (dt, ctx) => drv.pose(dt, { ...base, ...ctx }),
  };
}

// ---------------------------------------------------------------------------
// Preview helpers
// ---------------------------------------------------------------------------
/**
 * All 8 karts in a grid (for the preview page).
 * @param {object|null} pose previewPose passed to every kart
 * @param {number} cols karts per row (8 = single row)
 */
export function createAllKartsLineup(pose = null, cols = 8, spacing = 2.3) {
  const g = new THREE.Group();
  const rows = Math.ceil(CHARACTERS.length / cols);
  CHARACTERS.forEach((c, i) => {
    const k = createKartModel(c.id, pose);
    const col = i % cols;
    const row = Math.floor(i / cols);
    k.root.position.set((col - (Math.min(cols, CHARACTERS.length) - 1) / 2) * spacing, 0, (row - (rows - 1) / 2) * -3.2);
    g.add(k.root);
  });
  return g;
}
