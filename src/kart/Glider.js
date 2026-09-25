// ぽんぽこカート — glider: a Japanese umbrella 和傘 (janome 蛇の目 pattern).
//
// createGlider(characterId?) → { group, setOpen(t), dispose() }
//   group origin = mount point (the grip). The shaft rises from the origin (tilted slightly
//   forward, +Z), the canopy (≈3.2 m diameter) sits with its top ≈2.0 m above the mount.
//   setOpen(0) = closed & folded (hidden), setOpen(1) = fully open. Intermediate values animate
//   the ribs / paper pleats opening and the runner sliding up the shaft.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getCharacter } from './characters.js';

const TAU = Math.PI * 2;
const { clamp, lerp } = THREE.MathUtils;

const N = 32; // ribs
const RINGS = 11; // radial rings of canopy vertices
const RIB_LEN = 1.62;
const TOP = 2.0; // hub height above the mount
const HUB_R = 0.045;
const STRETCH_D = 0.72; // stretcher attach distance along rib
const STRETCH_L = 0.78; // stretcher length
const RUNNER_R = 0.032;

const matCache = new Map();
const texCache = new Map();
function cm(key, make) {
  if (!matCache.has(key)) {
    const m = make();
    m.name = 'glider.' + key;
    matCache.set(key, m);
  }
  return matCache.get(key);
}
const css = (h) => '#' + new THREE.Color(h).getHexString();

function janomeTexture(color) {
  const key = 'janome' + color;
  if (texCache.has(key)) return texCache.get(key);
  const w = 512;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.7);
  const cream = '#f6eedb';
  // x = radial fraction (0 = hub, 1 = edge)
  const band = (a, b, fill) => {
    g.fillStyle = fill;
    g.fillRect(a * w, 0, (b - a) * w + 1, h);
  };
  band(0, 1, css(color));
  band(0, 0.1, '#2d2524'); // 頭紙 (dark top paper)
  band(0.1, 0.115, '#c9a45a');
  band(0.43, 0.63, cream); // 蛇の目 ring
  band(0.43, 0.437, '#' + dark.getHexString());
  band(0.623, 0.63, '#' + dark.getHexString());
  band(0.955, 1.0, '#' + dark.getHexString()); // 軒紙 edge
  // subtle washi fibers
  let s = 5;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.06})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 6, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

function threadTexture() {
  if (texCache.has('thread')) return texCache.get('thread');
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d');
  const cols = ['#e8433a', '#f2c230', '#2f9a5a', '#f7f3ea', '#3a62c8', '#e8433a', '#f7f3ea', '#b8409a'];
  for (let i = 0; i < 32; i++) {
    g.fillStyle = cols[i % cols.length];
    g.fillRect(0, i, 256, 1);
  }
  for (let x = 0; x < 256; x += 8) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x, 0, 1, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(8, 1);
  texCache.set('thread', t);
  return t;
}

/** Shared static geometry (shaft, grip, hub, runner). */
let staticGeo = null;
function getStaticGeo() {
  if (staticGeo) return staticGeo;
  const shaft = new THREE.CylinderGeometry(0.018, 0.02, TOP - 0.12, 12);
  shaft.translate(0, 0.12 + (TOP - 0.12) / 2, 0);
  const grip = new THREE.CylinderGeometry(0.027, 0.03, 0.34, 14);
  grip.translate(0, 0.05, 0);
  const gripBands = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.TorusGeometry(0.03, 0.006, 4, 12);
    b.rotateX(Math.PI / 2);
    b.translate(0, -0.08 + i * 0.065, 0);
    gripBands.push(b);
  }
  const knob = new THREE.SphereGeometry(0.032, 12, 8);
  knob.translate(0, -0.12, 0);
  const hub = new THREE.CylinderGeometry(HUB_R, HUB_R * 1.1, 0.07, 16);
  hub.translate(0, TOP - 0.01, 0);
  const cap = new THREE.ConeGeometry(0.1, 0.07, 20);
  cap.translate(0, TOP + 0.055, 0);
  const finial = new THREE.SphereGeometry(0.022, 10, 8);
  finial.translate(0, TOP + 0.1, 0);
  const runner = new THREE.CylinderGeometry(RUNNER_R + 0.006, RUNNER_R + 0.01, 0.1, 14);
  // merged per material: wood / lacquer / dark (fewer draw calls)
  staticGeo = {
    wood: mergeGeometries([shaft, hub], false),
    lacquer: mergeGeometries([grip, knob, finial], false),
    dark: mergeGeometries([...gripBands, cap], false),
    runner,
  };
  return staticGeo;
}

export function createGlider(characterId = 'tanuki') {
  const ch = getCharacter(characterId);
  const canopyColor = ch.colors.umbrella ?? ch.colors.accent;

  const paperMat = cm('paper' + canopyColor, () => new THREE.MeshStandardMaterial({
    map: janomeTexture(canopyColor), side: THREE.DoubleSide, roughness: 0.55, metalness: 0,
    emissive: 0xffffff, emissiveMap: janomeTexture(canopyColor), emissiveIntensity: 0.08,
  }));
  const bambooMat = cm('bamboo', () => new THREE.MeshStandardMaterial({ color: 0xd2ad72, roughness: 0.55 }));
  const woodMat = cm('wood', () => new THREE.MeshStandardMaterial({ color: 0x9a6a42, roughness: 0.5 }));
  const lacquerMat = cm('lacquer', () => new THREE.MeshPhysicalMaterial({ color: 0x8a1f1c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const darkMat = cm('dark', () => new THREE.MeshStandardMaterial({ color: 0x2d2524, roughness: 0.6 }));
  const threadMat = cm('thread', () => new THREE.MeshStandardMaterial({ map: threadTexture(), side: THREE.DoubleSide, roughness: 0.8 }));

  const group = new THREE.Group();
  group.name = 'glider';
  const pivot = new THREE.Group();
  pivot.rotation.x = 0.12; // slightly forward
  group.add(pivot);
  const scaler = new THREE.Group();
  pivot.add(scaler);

  const G = getStaticGeo();
  const add = (geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    scaler.add(m);
    return m;
  };
  add(G.wood, woodMat);
  add(G.lacquer, lacquerMat);
  add(G.dark, darkMat, false);
  const runner = add(G.runner, woodMat);

  // --- dynamic geometry (per instance)
  // canopy: 2N angular vertices (rib, mid, rib, mid...) × RINGS; flat-shaded non-indexed triangles
  const canopyTris = 2 * N * (RINGS - 1) * 2;
  const canopyPos = new Float32Array(canopyTris * 9);
  const canopyUV = new Float32Array(canopyTris * 6);
  const canopyGeo = new THREE.BufferGeometry();
  canopyGeo.setAttribute('position', new THREE.BufferAttribute(canopyPos, 3));
  canopyGeo.setAttribute('uv', new THREE.BufferAttribute(canopyUV, 2));
  canopyGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(canopyTris * 9), 3));
  const canopy = add(canopyGeo, paperMat);

  // ribs + stretchers: triangular prisms (6 tris each)
  const PRISM_V = 18; // 6 triangles * 3
  const sticks = N * 2; // rib + stretcher
  const stickPos = new Float32Array(sticks * PRISM_V * 3);
  const stickGeo = new THREE.BufferGeometry();
  stickGeo.setAttribute('position', new THREE.BufferAttribute(stickPos, 3));
  stickGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(sticks * PRISM_V * 3), 3));
  const ribMesh = add(stickGeo, bambooMat, false);

  // decorative thread band (between stretchers)
  const threadTris = N * 2;
  const threadPos = new Float32Array(threadTris * 9);
  const threadUV = new Float32Array(threadTris * 6);
  const threadGeo = new THREE.BufferGeometry();
  threadGeo.setAttribute('position', new THREE.BufferAttribute(threadPos, 3));
  threadGeo.setAttribute('uv', new THREE.BufferAttribute(threadUV, 2));
  threadGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(threadTris * 9), 3));
  const thread = add(threadGeo, threadMat, false);

  // UVs are constant (u around, v=0.5)
  {
    let o = 0;
    for (let i = 0; i < 2 * N; i++) {
      for (let j = 0; j < RINGS - 1; j++) {
        const f0 = ringF(j);
        const f1 = ringF(j + 1);
        const quad = [[f0, 0.5], [f1, 0.5], [f1, 0.5], [f0, 0.5], [f1, 0.5], [f0, 0.5]];
        for (const [u, v] of quad) {
          canopyUV[o++] = u;
          canopyUV[o++] = v;
        }
      }
    }
    o = 0;
    for (let i = 0; i < N; i++) {
      const u0 = i / N;
      const u1 = (i + 1) / N;
      const q = [[u0, 0], [u1, 0], [u1, 1], [u0, 0], [u1, 1], [u0, 1]];
      for (const [u, v] of q) {
        threadUV[o++] = u;
        threadUV[o++] = v;
      }
    }
  }

  function ringF(j) {
    const f = j / (RINGS - 1);
    return 0.035 + f * 0.965;
  }

  const ribPts = []; // [i][j] Vector3 of rib i at ring j
  for (let i = 0; i < N; i++) {
    ribPts.push([]);
    for (let j = 0; j < RINGS; j++) ribPts[i].push(new THREE.Vector3());
  }
  const midPts = [];
  for (let i = 0; i < N; i++) {
    midPts.push([]);
    for (let j = 0; j < RINGS; j++) midPts[i].push(new THREE.Vector3());
  }
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  function writePrism(arr, offset, a, b, r0, r1, up) {
    // triangular prism from a to b; cross-section triangle radius r0 at a, r1 at b
    const d = tmpA.subVectors(b, a).normalize();
    const side = tmpB.crossVectors(d, up).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    const up2 = tmpC.crossVectors(side, d).normalize();
    const cs = [];
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * TAU + Math.PI / 2;
      cs.push([Math.cos(ang), Math.sin(ang)]);
    }
    const P = (base, r, k) => [
      base.x + (side.x * cs[k][0] + up2.x * cs[k][1]) * r,
      base.y + (side.y * cs[k][0] + up2.y * cs[k][1]) * r,
      base.z + (side.z * cs[k][0] + up2.z * cs[k][1]) * r,
    ];
    let o = offset;
    for (let k = 0; k < 3; k++) {
      const k2 = (k + 1) % 3;
      const a0 = P(a, r0, k);
      const a1 = P(a, r0, k2);
      const b0 = P(b, r1, k);
      const b1 = P(b, r1, k2);
      for (const v of [a0, b0, b1, a0, b1, a1]) {
        arr[o++] = v[0];
        arr[o++] = v[1];
        arr[o++] = v[2];
      }
    }
    return o;
  }

  let current = -1;
  function setOpen(tIn) {
    const t = clamp(tIn, 0, 1);
    group.visible = t > 0.002;
    if (Math.abs(t - current) < 1e-4) return;
    current = t;
    // pop-up scale then rib opening
    const sT = clamp(t / 0.3, 0, 1);
    const sc = lerp(0.25, 1, 1 - Math.pow(1 - sT, 3));
    scaler.scale.setScalar(sc);
    const oT = clamp((t - 0.08) / 0.92, 0, 1);
    const open = 1 - Math.pow(1 - oT, 2.2);
    const alpha = lerp(THREE.MathUtils.degToRad(86), THREE.MathUtils.degToRad(17), open); // rib angle below horizontal
    const fold = (1 - open) * 0.6; // pleat depth
    const bend = 0.07 * open;

    // ribs and mid points
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU;
      const cx = Math.cos(th);
      const sz = Math.sin(th);
      for (let j = 0; j < RINGS; j++) {
        const f = ringF(j);
        const r = HUB_R + Math.cos(alpha) * RIB_LEN * f;
        const y = TOP - Math.sin(alpha) * RIB_LEN * f - bend * f * f;
        ribPts[i][j].set(cx * r, y, sz * r);
      }
    }
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      for (let j = 0; j < RINGS; j++) {
        const m = midPts[i][j].addVectors(ribPts[i][j], ribPts[i2][j]).multiplyScalar(0.5);
        const rr = Math.hypot(m.x, m.z);
        const k = 1 - fold * (0.3 + 0.7 * ringF(j));
        const nr = Math.max(0.02, rr * k);
        if (rr > 1e-5) {
          m.x *= nr / rr;
          m.z *= nr / rr;
        }
        m.y += 0.012 * open * ringF(j); // slight paper puff between ribs
      }
    }
    // canopy triangles
    let o = 0;
    const push = (v) => {
      canopyPos[o++] = v.x;
      canopyPos[o++] = v.y;
      canopyPos[o++] = v.z;
    };
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      for (let half = 0; half < 2; half++) {
        const A = half === 0 ? ribPts[i] : midPts[i];
        const B = half === 0 ? midPts[i] : ribPts[i2];
        for (let j = 0; j < RINGS - 1; j++) {
          // quad: A[j], A[j+1], B[j+1], B[j]  — outward facing up
          push(A[j]); push(A[j + 1]); push(B[j + 1]);
          push(A[j]); push(B[j + 1]); push(B[j]);
        }
      }
    }
    canopyGeo.attributes.position.needsUpdate = true;
    canopyGeo.computeVertexNormals();
    canopyGeo.computeBoundingSphere();

    // runner position from stretcher geometry
    const Ar = HUB_R + Math.cos(alpha) * STRETCH_D;
    const Ay = TOP - Math.sin(alpha) * STRETCH_D - bend * (STRETCH_D / RIB_LEN) ** 2;
    const dr = Ar - RUNNER_R;
    const runnerY = Ay - Math.sqrt(Math.max(0.0001, STRETCH_L * STRETCH_L - dr * dr));
    runner.position.y = runnerY;

    // ribs (under paper) + stretchers
    let so = 0;
    const up = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU;
      const cx = Math.cos(th);
      const sz = Math.sin(th);
      const tip = ribPts[i][RINGS - 1];
      a.set(cx * HUB_R, TOP - 0.012, sz * HUB_R);
      b.copy(tip).addScaledVector(up, -0.012);
      so = writePrism(stickPos, so, a, b, 0.009, 0.006, up);
      // stretcher
      a.set(cx * RUNNER_R, runnerY + 0.03, sz * RUNNER_R);
      b.set(cx * Ar, Ay - 0.014, sz * Ar);
      so = writePrism(stickPos, so, a, b, 0.006, 0.006, up);
    }
    stickGeo.attributes.position.needsUpdate = true;
    stickGeo.computeVertexNormals();
    stickGeo.computeBoundingSphere();

    // thread band between stretchers at 12%..32% of their length
    let to = 0;
    const tp = (v) => {
      threadPos[to++] = v.x;
      threadPos[to++] = v.y;
      threadPos[to++] = v.z;
    };
    const s0 = 0.12;
    const s1 = 0.34;
    const P0 = [];
    const P1 = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU;
      const cx = Math.cos(th);
      const sz = Math.sin(th);
      const ax = cx * RUNNER_R;
      const az = sz * RUNNER_R;
      const ay = runnerY + 0.03;
      const bx = cx * Ar;
      const bz = sz * Ar;
      const by = Ay - 0.014;
      P0.push(new THREE.Vector3(lerp(ax, bx, s0), lerp(ay, by, s0), lerp(az, bz, s0)));
      P1.push(new THREE.Vector3(lerp(ax, bx, s1), lerp(ay, by, s1), lerp(az, bz, s1)));
    }
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      tp(P0[i]); tp(P0[i2]); tp(P1[i2]);
      tp(P0[i]); tp(P1[i2]); tp(P1[i]);
    }
    threadGeo.attributes.position.needsUpdate = true;
    threadGeo.computeVertexNormals();
    threadGeo.computeBoundingSphere();
    thread.visible = open > 0.15;
    ribMesh.visible = true;
    canopy.visible = true;
  }

  setOpen(1);
  return {
    group,
    setOpen,
    dispose() {
      group.parent?.remove(group);
      canopyGeo.dispose();
      stickGeo.dispose();
      threadGeo.dispose();
    },
  };
}

/** Preview helper: an open glider standing on the ground. */
export function createGliderPreview(characterId = 'tanuki', open = 1) {
  const g = createGlider(characterId);
  g.setOpen(open);
  const wrap = new THREE.Group();
  g.group.position.y = 0.3;
  wrap.add(g.group);
  return wrap;
}
