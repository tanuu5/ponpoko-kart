// Course 3 「夏祭り花火ナイト」 — summer festival night in an old onsen town.
// Props: lanterns (提灯), lantern strings, food stalls (屋台), bon-odori tower (やぐら), ryokan,
// machiya, festival goers, nobori, taiko, bamboo lights, street lamps, nodate bench,
// onsen steam vent, lantern bridge.
// Conventions: meters, +Y up, origin at ground centre, front faces +Z, shared materials.
import * as THREE from 'three';
import { getMat } from './materials.js';
import { rng, mesh } from './util.js';
import {
  V3, xf, merge, lathe, remapUV, solidUV, scaleUV, cyl, sphere, rbox, box, boxUV, beamBetween, cylBetween,
  surface, cloth, sagPoint, sagPoints, tube, planarUV, japaneseRoof, boardAlong, orient, rock,
} from './festival-geo.js';
import {
  lanternCell, lanternMat, LUV, LANTERN_RIBS, stallWoodMat, goodsMat, eaveMat, kohakuMat, KOHAKU_V, KOHAKU_SIGN,
  taikoBodyMat, taikoHeadMat, yaguraWoodMat, windowMat, WIN, decoMat, DECO, buildingWoodMat, plasterMat, peopleMat, PEOPLE,
  noboriMat, NOBORI_COLORS, takeMat, TAKE, lampGlassMat, LAMPGLASS, ironMat, feltMat, parasolMat, rockMat, onsenWaterMat, crustMat, goodsRect, goodsUV, yataiSignMat, SIGN_RECT, canopyMat, YATAI_TYPES,
} from './festival-tex.js';

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
/** Collects geometries per material, then merges them into one mesh per material. */
class Parts {
  constructor() { this.map = new Map(); }
  add(material, geo) {
    if (!geo) return geo;
    if (!this.map.has(material)) this.map.set(material, []);
    this.map.get(material).push(geo);
    return geo;
  }
  build(group, opts = {}) {
    for (const [m, list] of this.map) {
      const cast = typeof opts.cast === 'function' ? opts.cast(m) : opts.cast !== false;
      addMesh(group, merge(list), m, { cast });
    }
    return group;
  }
}

function addMesh(parent, geo, material, opts = {}) {
  if (!geo) return null;
  const m = mesh(geo, material, { cast: opts.cast !== false, receive: opts.receive !== false });
  if (opts.name) m.name = opts.name;
  parent.add(m);
  return m;
}

// ===========================================================================
// 1. 提灯 chochin
// ===========================================================================
function lanternRadius(shape, t, rMax, rEnd) {
  const s = 2 * t - 1;
  if (shape === 'long') {
    const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 3)), 0.5);
    return rEnd + (rMax - rEnd) * k;
  }
  const kk = 1 - (rEnd / rMax) ** 2;
  return rMax * Math.sqrt(Math.max(0, 1 - kk * s * s));
}

/**
 * Lantern geometry (single material: lanternMat). Origin = top hanging point, hangs down to
 * y = -0.55 * size. detail: 'high' (ribbed, ~1.5k tris) | 'low' (~210 tris).
 */
export function chochinGeometry({ color = 'red', text = '祭', size = 1, detail = 'high' } = {}) {
  const shape = color === 'shop' ? 'long' : 'round';
  const rect = lanternCell(color, text, shape);
  const hi = detail === 'high';
  const seg = hi ? 18 : 10;
  const yT = -0.08, yB = -0.5, bodyH = yT - yB;
  const rMax = shape === 'long' ? 0.14 : 0.17;
  const rEnd = shape === 'long' ? 0.096 : 0.09;
  const n = hi ? LANTERN_RIBS * 2 : 6;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let r = lanternRadius(shape, t, rMax, rEnd);
    if (hi) r += k % 2 === 0 ? 0.0032 : -0.0012;
    pts.push([r, yB + t * bodyH]);
  }
  const body = lathe(pts, seg);
  remapUV(body, rect);
  const parts = [body];
  const rc = rEnd + 0.012;
  const capT = hi
    ? lathe([[rc - 0.012, -0.095], [rc, -0.093], [rc + 0.006, -0.085], [rc + 0.006, -0.055], [rc, -0.047], [rc * 0.5, -0.044], [0.0, -0.043]], seg)
    : lathe([[rc, -0.092], [rc, -0.047], [0, -0.045]], seg);
  parts.push(solidUV(capT, LUV.lacquer));
  const rb = rEnd + 0.012;
  const capB = hi
    ? lathe([[rb - 0.03, -0.55], [rb, -0.55], [rb + 0.006, -0.542], [rb + 0.006, -0.5], [rb, -0.49], [rb - 0.03, -0.49], [rb - 0.03, -0.548]], seg)
    : lathe([[rb - 0.03, -0.55], [rb, -0.55], [rb, -0.49]], seg);
  parts.push(solidUV(capB, LUV.lacquer));
  const disc = new THREE.CircleGeometry(rb - 0.028, hi ? 16 : 8);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, -0.53, 0);
  parts.push(solidUV(disc, LUV.glow));
  if (hi) {
    const ring = new THREE.TorusGeometry(0.016, 0.0035, 5, 10);
    ring.translate(0, -0.02, 0);
    parts.push(solidUV(ring, LUV.lacquer));
    const wire = cyl(0.0025, 0.0025, 0.012, 4, true);
    wire.translate(0, -0.04, 0);
    parts.push(solidUV(wire, LUV.lacquer));
  } else {
    const wire = cyl(0.003, 0.003, 0.046, 3, true);
    wire.translate(0, -0.023, 0);
    parts.push(solidUV(wire, LUV.cord));
  }
  const geo = merge(parts);
  if (size !== 1) geo.scale(size, size, size);
  return geo;
}

/**
 * 提灯 paper lantern. Origin at the top hanging point (y = 0), body hangs below (≈0.55 m × size).
 * color: 'red' | 'white' | 'yellow' | 'shop' (also 'pink', 'blue'). text is written vertically.
 */
export function createChochin({ color = 'red', text = '祭', lit = true, size = 1, seed = 1, detail = 'high' } = {}) {
  const g = new THREE.Group();
  g.name = 'chochin';
  const geo = chochinGeometry({ color, text, size, detail });
  const r = rng(seed);
  // tiny deterministic sway so rows of lanterns do not look cloned
  geo.rotateY((r() - 0.5) * 0.2);
  addMesh(g, geo, lanternMat(lit));
  return g;
}

// ===========================================================================
// 2. Lantern string
// ===========================================================================
/** Geometry of a lantern string (single lantern material). */
export function lanternStringGeometry({ a = [-6, 4, 0], b = [6, 4, 0], count = 8, sag = 0.8, colors = ['red', 'white'], texts = ['祭'], size = 0.8, seed = 1, tStart = null, tEnd = null } = {}) {
  const r = rng(seed);
  const A = Array.isArray(a) ? V3(...a) : a.clone();
  const B = Array.isArray(b) ? V3(...b) : b.clone();
  const parts = [];
  const span = A.distanceTo(B);
  const rope = tube(sagPoints(A, B, sag, 20), 0.012, 3, Math.max(10, Math.round(span * 2)));
  parts.push(solidUV(rope, LUV.cord));
  const dx = B.x - A.x, dz = B.z - A.z;
  const yaw = Math.atan2(-dz, dx);
  const t0 = tStart ?? 0.5 / count;
  const t1 = tEnd ?? 1 - 0.5 / count;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? (t0 + t1) / 2 : t0 + ((t1 - t0) * i) / (count - 1);
    const p = sagPoint(A, B, sag, t);
    const drop = 0.03 + r() * 0.06;
    const color = colors[i % colors.length];
    const text = texts[i % texts.length];
    const lg = chochinGeometry({ color, text, size, detail: 'low' });
    xf(lg, [p.x, p.y - drop, p.z], [(r() - 0.5) * 0.06, yaw + (r() - 0.5) * 0.5, (r() - 0.5) * 0.06]);
    parts.push(lg);
    const cord = cyl(0.004, 0.004, drop + 0.01, 3, true);
    cord.translate(p.x, p.y - drop / 2, p.z);
    parts.push(solidUV(cord, LUV.cord));
  }
  return merge(parts);
}

/**
 * A sagging rope from a to b (world coords) with `count` chochin hanging from it.
 * Group origin = world origin. Each lantern ≈ 210 triangles.
 */
export function createLanternString({ a = [-6, 4, 0], b = [6, 4, 0], count = 8, sag = 0.8, colors = ['red', 'white'], texts = ['祭'], size = 0.8, lit = true, seed = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'lanternString';
  addMesh(g, lanternStringGeometry({ a, b, count, sag, colors, texts, size, seed }), lanternMat(lit), { cast: false });
  return g;
}

// ===========================================================================
// 3. 屋台 food stall
// ===========================================================================
const gRect = (geo, cell) => remapUV(geo, goodsRect(cell));
const gSolid = (geo, cell) => solidUV(geo, goodsUV(cell));
/** Bulb hanging from yTop with the glass centred at yBulb (lantern material). */
function bulbParts(x, yTop, yBulb, z) {
  const socketTop = yBulb + 0.075;
  const cord = cyl(0.004, 0.004, Math.max(0.01, yTop - socketTop), 3, true);
  cord.translate(x, (yTop + socketTop) / 2, z);
  const sock = cyl(0.019, 0.024, 0.05, 8);
  sock.translate(x, yBulb + 0.05, z);
  const bulb = sphere(0.04, 8, 6);
  bulb.scale(1, 1.18, 1);
  bulb.translate(x, yBulb, z);
  return [solidUV(cord, LUV.cord), solidUV(sock, LUV.lacquer), solidUV(bulb, LUV.bulb)];
}

function hemi(r, ws = 8, hs = 4) { return new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2); }

function lumpy(geo, rand, amt) {
  const pos = geo.attributes.position;
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!cache.has(k)) cache.set(k, 1 + (rand() - 0.5) * amt);
    const f = cache.get(k);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * (0.5 + f * 0.5), pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  return geo;
}

function yataiGoods(type, P, M, r) {
  const G = M.goods, Wd = M.wood, S = M.sign, L = M.lamp;
  const top = 0.95; // counter top
  if (type === 'takoyaki') {
    P.add(G, xf(gSolid(rbox(1.34, 0.1, 0.54, 0.02), 'iron'), [-0.35, top + 0.05, 0.78]));
    P.add(Wd, xf(boxUV(rbox(1.44, 0.06, 0.64, 0.015), 1, 'x'), [-0.35, top + 0.03, 0.78]));
    const ball = hemi(0.05, 8, 3);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        const b = gRect(ball.clone(), (row + col) % 5 === 0 ? 'takoSauce' : 'tako');
        P.add(G, xf(b, [-0.35 + (col - 3.5) * 0.155, top + 0.095, 0.78 + (row - 1) * 0.16], [(r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5]));
      }
    }
    // boats (舟皿) with sauced balls
    const sb = sphere(0.037, 7, 5);
    for (let k = 0; k < 3; k++) {
      const bx = 0.62 + k * 0.33, bz = 0.8 + (k % 2) * 0.08;
      P.add(G, xf(gRect(rbox(0.26, 0.03, 0.14, 0.01), 'woodTray'), [bx, top + 0.015, bz], [0, (r() - 0.5) * 0.3, 0]));
      for (let i = 0; i < 6; i++) P.add(G, xf(gRect(sb.clone(), 'takoSauce'), [bx + ((i % 3) - 1) * 0.075, top + 0.058, bz + (Math.floor(i / 3) - 0.5) * 0.065], [0, r() * 6, 0]));
    }
    // batter pitcher + picks cup
    P.add(G, xf(gSolid(lathe([[0.001, 0], [0.06, 0], [0.066, 0.02], [0.07, 0.19], [0.078, 0.2], [0.07, 0.2], [0.064, 0.18], [0.001, 0.17]], 12), 'steel'), [-1.25, top, 0.72]));
    P.add(G, xf(gSolid(cyl(0.04, 0.035, 0.1, 10), 'red'), [1.45, top + 0.05, 0.62]));
  } else if (type === 'yakisoba') {
    P.add(G, xf(gSolid(rbox(1.7, 0.1, 0.6, 0.02), 'iron'), [-0.2, top + 0.05, 0.78]));
    const heap = lumpy(new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), r, 0.25);
    heap.scale(0.58, 0.16, 0.24);
    P.add(G, xf(gRect(heap, 'noodle'), [-0.42, top + 0.1, 0.8]));
    const cab = lumpy(new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), r, 0.3);
    cab.scale(0.22, 0.12, 0.18);
    P.add(G, xf(gRect(cab, 'cabbage'), [0.38, top + 0.1, 0.8]));
    for (const k of [0, 1]) {
      const bx = -0.05 + k * 0.16;
      P.add(G, xf(gSolid(box(0.1, 0.006, 0.09), 'steel'), [bx, top + 0.13, 0.72 + k * 0.05], [0.25, 0.3 * k, 0]));
      P.add(G, xf(gSolid(cyl(0.012, 0.012, 0.14, 6), 'woodTray'), [bx, top + 0.18, 0.64 + k * 0.05], [1.1, 0.3 * k, 0]));
    }
    for (let st = 0; st < 3; st++) {
      for (let i = 0; i < 3 - (st === 2 ? 1 : 0); i++) {
        P.add(G, xf(gRect(rbox(0.19, 0.045, 0.14, 0.01), 'pack'), [0.95 + st * 0.22, top + 0.024 + i * 0.047, 0.8 + (r() - 0.5) * 0.03], [0, (r() - 0.5) * 0.15, 0]));
      }
    }
    const bottle = lathe([[0.001, 0], [0.04, 0], [0.042, 0.015], [0.042, 0.17], [0.03, 0.2], [0.014, 0.23], [0.001, 0.235]], 10);
    P.add(G, xf(gSolid(bottle.clone(), 'sauceBrown'), [-1.3, top, 0.66]));
    P.add(G, xf(gSolid(bottle.clone(), 'cream'), [-1.19, top, 0.7], [0, 0, 0], [0.9, 0.95, 0.9]));
    P.add(G, xf(gSolid(cyl(0.015, 0.015, 0.03, 8), 'red'), [-1.19, top + 0.23, 0.7]));
  } else if (type === 'wataame') {
    P.add(G, xf(gSolid(rbox(0.44, 0.2, 0.44, 0.03), 'white'), [0.3, top + 0.1, 0.78]));
    const bowl = lathe([[0.1, 0], [0.3, 0.02], [0.33, 0.17], [0.345, 0.2], [0.33, 0.205], [0.31, 0.05], [0.1, 0.035]], 20);
    P.add(G, xf(gSolid(bowl, 'steel'), [0.3, top + 0.2, 0.78]));
    const cloud = lumpy(sphere(1, 12, 8), r, 0.3);
    cloud.scale(0.2, 0.12, 0.2);
    P.add(G, xf(gRect(cloud, 'cottonPink'), [0.3, top + 0.32, 0.78]));
    // finished cotton candy on sticks in a holder
    P.add(G, xf(gSolid(cyl(0.06, 0.05, 0.12, 10), 'blue'), [-0.6, top + 0.06, 0.78]));
    const cc = ['cottonPink', 'cottonWhite', 'cottonBlue'];
    for (let i = 0; i < 3; i++) {
      const cx = -0.62 + (i - 1) * 0.06, lean = (i - 1) * 0.25;
      P.add(G, xf(gSolid(cyl(0.006, 0.006, 0.35, 4, true), 'stick'), [cx + lean * 0.17, top + 0.26, 0.78], [0, 0, -lean]));
      const c = lumpy(sphere(1, 10, 7), r, 0.25);
      c.scale(0.13, 0.15, 0.13);
      P.add(G, xf(gRect(c, cc[i]), [cx + lean * 0.4, top + 0.52, 0.78], [0, 0, -lean]));
    }
    // printed bags hanging at the front
    const bag = rbox(0.26, 0.4, 0.1, 0.035, 1);
    const hangs = [];
    for (let i = 0; i < 8; i++) hangs.push([-1.58 + i * 0.45, 1.84, 1.18]);
    for (const x of [-1.58, -1.22, 1.22, 1.58]) hangs.push([x, 1.36, 1.18]);
    hangs.forEach(([x, y, z], i) => {
      P.add(G, xf(gRect(bag.clone(), 'bag' + ((i * 3 + 1) % 4)), [x, y - 0.24, z], [0, (r() - 0.5) * 0.3, (r() - 0.5) * 0.08]));
      P.add(G, xf(gSolid(cyl(0.012, 0.03, 0.04, 6), 'gold'), [x, y - 0.03, z]));
    });
    for (const [x0, x1, y] of [[-1.8, 1.8, 1.86], [-1.8, -1.05, 1.38], [1.05, 1.8, 1.38]]) {
      P.add(Wd, boxUV(cylBetween([x0, y, 1.18], [x1, y, 1.18], 0.013, 6, false), 1, 'x'));
    }
  } else if (type === 'kingyo') {
    // low frame + blue tub with water & goldfish
    const ty = 0.2, th = 0.3, tw = 2.7, td = 1.0, tz = 0.5;
    P.add(Wd, xf(boxUV(rbox(tw - 0.1, ty, td - 0.1, 0.02), 1, 'x'), [0, ty / 2, tz]));
    for (const s of [-1, 1]) {
      P.add(G, xf(gSolid(rbox(tw, th, 0.06, 0.025), 'tub'), [0, ty + th / 2, tz + s * (td / 2 - 0.03)]));
      P.add(G, xf(gSolid(rbox(0.06, th, td, 0.025), 'tub'), [s * (tw / 2 - 0.03), ty + th / 2, tz]));
    }
    const wy = ty + th - 0.05;
    for (let i = 0; i < 3; i++) {
      const wp = new THREE.PlaneGeometry(0.86, 0.9);
      wp.rotateX(-Math.PI / 2);
      if (i === 1) wp.rotateY(Math.PI);
      P.add(G, xf(gRect(wp, 'water'), [(i - 1) * 0.86, wy, tz]));
    }
    const fishBody = sphere(1, 8, 5);
    for (let i = 0; i < 10; i++) {
      const fx = (r() - 0.5) * 2.3, fz = tz + (r() - 0.5) * 0.7, ang = r() * 6.28;
      const kind = ['fishOrange', 'fishOrange', 'fishRed', 'fishBlack'][i % 4];
      const b = xf(gSolid(fishBody.clone(), kind), [0, 0, 0], [0, 0, 0], [0.05, 0.016, 0.024]);
      const tail = xf(gSolid(new THREE.ConeGeometry(0.022, 0.05, 4), kind), [-0.06, 0, 0], [0, 0, Math.PI / 2], [1, 1, 0.35]);
      for (const gg of [b, tail]) P.add(G, xf(gg, [fx, wy + 0.005, fz], [0, ang, 0]));
    }
    // bowls on the rim + poi tray
    const bowl = lathe([[0.001, 0], [0.04, 0], [0.07, 0.05], [0.075, 0.06], [0.068, 0.06], [0.036, 0.012], [0.001, 0.012]], 12);
    for (let i = 0; i < 4; i++) P.add(G, xf(gSolid(bowl.clone(), 'white'), [-1.1 + i * 0.7, ty + th + 0.001, tz + td / 2 - 0.03]));
    P.add(G, xf(gSolid(rbox(0.3, 0.05, 0.22, 0.01), 'woodTray'), [1.35, 0.97, -0.7]));
    for (let i = 0; i < 5; i++) {
      P.add(G, xf(gSolid(cyl(0.05, 0.05, 0.008, 12), 'poiPaper'), [1.28 + (i % 3) * 0.02, 1.0 + i * 0.01, -0.7], [0, i, 0]));
      P.add(G, xf(gSolid(box(0.09, 0.008, 0.016), 'pink'), [1.37 + (i % 3) * 0.02, 1.0 + i * 0.01, -0.7]));
    }
    // goldfish bags on display
    const gb = lathe([[0.001, 0], [0.05, 0.01], [0.075, 0.06], [0.07, 0.12], [0.03, 0.18], [0.012, 0.2], [0.02, 0.22], [0.001, 0.225]], 10);
    for (let i = 0; i < 4; i++) {
      const x = -1.5 + i * 0.26;
      P.add(G, xf(gRect(gb.clone(), 'bagWater'), [x, 1.36, 1.12], [0, r() * 0.6, 0]));
      P.add(G, xf(gSolid(cyl(0.003, 0.003, 0.22, 3, true), 'red'), [x, 1.69, 1.12]));
    }
    P.add(Wd, boxUV(cylBetween([-1.8, 1.8, 1.12], [-0.6, 1.8, 1.12], 0.013, 6, false), 1, 'x'));
  } else if (type === 'ringoame') {
    for (let t = 0; t < 3; t++) {
      const y = top + 0.05 + t * 0.12, z = 0.98 - t * 0.2;
      P.add(Wd, xf(boxUV(rbox(2.3, 0.1 + t * 0.12, 0.2, 0.015), 1, 'x'), [-0.15, top + (0.1 + t * 0.12) / 2, z]));
      P.add(G, xf(gSolid(box(2.24, 0.04, 0.16), 'white'), [-0.15, y + 0.07, z]));
      const n = 9 - t;
      for (let i = 0; i < n; i++) {
        const x = -0.15 + (i - (n - 1) / 2) * 0.24;
        const small = r() < 0.2;
        const rad = small ? 0.038 : 0.052;
        const kind = r() < 0.12 ? 'appleGreen' : r() < 0.08 ? 'mikan' : 'apple';
        P.add(G, xf(gSolid(cyl(0.006, 0.006, 0.14, 4, true), 'stick'), [x, y + 0.16, z]));
        const ap = sphere(rad * 1.12, 8, 6);
        ap.scale(1, 0.92, 1);
        P.add(G, xf(gSolid(ap, kind), [x + (r() - 0.5) * 0.02, y + 0.23 + rad * 0.7, z]));
      }
    }
    // strawberry & grape skewers
    for (let i = 0; i < 5; i++) {
      const x = 1.2 + (i % 3) * 0.1, z = 0.7 + Math.floor(i / 3) * 0.14;
      P.add(G, xf(gSolid(cyl(0.004, 0.004, 0.3, 3, true), 'stick'), [x, top + 0.15, z]));
      for (let k = 0; k < 3; k++) P.add(G, xf(gSolid(new THREE.ConeGeometry(0.022, 0.04, 7), 'strawberry'), [x, top + 0.2 + k * 0.045, z], [Math.PI, 0, 0]));
    }
    P.add(G, xf(gSolid(rbox(0.36, 0.08, 0.3, 0.02), 'white'), [1.3, top + 0.04, 0.77]));
    P.add(G, xf(gSolid(lathe([[0.001, 0], [0.14, 0], [0.15, 0.02], [0.15, 0.18], [0.16, 0.19], [0.14, 0.19], [0.14, 0.03], [0.001, 0.03]], 14), 'steel'), [-1.3, 0.87, -0.8]));
  } else if (type === 'kakigori') {
    const mx = -0.8, mz = 0.8;
    P.add(G, xf(gSolid(rbox(0.38, 0.06, 0.38, 0.02), 'blue'), [mx, top + 0.03, mz]));
    P.add(G, xf(gSolid(rbox(0.08, 0.62, 0.07, 0.02), 'blue'), [mx, top + 0.34, mz - 0.16]));
    P.add(G, xf(gSolid(rbox(0.09, 0.07, 0.34, 0.02), 'blue'), [mx, top + 0.62, mz - 0.02]));
    P.add(G, xf(gSolid(cyl(0.014, 0.014, 0.26, 6), 'steel'), [mx, top + 0.5, mz]));
    const wheel = new THREE.TorusGeometry(0.17, 0.017, 6, 22);
    wheel.rotateX(Math.PI / 2);
    P.add(G, xf(gSolid(wheel, 'red'), [mx, top + 0.72, mz]));
    for (let k = 0; k < 4; k++) P.add(G, xf(gSolid(box(0.34, 0.016, 0.016), 'red'), [mx, top + 0.72, mz], [0, (k * Math.PI) / 4, 0]));
    P.add(G, xf(gSolid(cyl(0.012, 0.012, 0.12, 6), 'woodTray'), [mx + 0.17, top + 0.79, mz]));
    P.add(G, xf(gRect(rbox(0.18, 0.15, 0.18, 0.025), 'ice'), [mx, top + 0.3, mz]));
    P.add(G, xf(gSolid(cyl(0.12, 0.12, 0.012, 16), 'steel'), [mx, top + 0.22, mz]));
    const cup = lathe([[0.001, 0], [0.045, 0], [0.062, 0.1], [0.066, 0.1], [0.05, 0.004], [0.001, 0.004]], 12);
    P.add(G, xf(gRect(cup.clone(), 'cup'), [mx, top + 0.06, mz]));
    const mound = hemi(0.06, 10, 4);
    mound.scale(1, 1.2, 1);
    P.add(G, xf(gRect(mound.clone(), 'ice'), [mx, top + 0.16, mz]));
    const bottle = lathe([[0.001, 0], [0.045, 0], [0.05, 0.012], [0.05, 0.17], [0.036, 0.205], [0.018, 0.225], [0.018, 0.25], [0.001, 0.25]], 10);
    ['syrupRed', 'syrupGreen', 'syrupBlue', 'syrupYellow'].forEach((c, i) => {
      const bx = -0.2 + i * 0.16;
      P.add(G, xf(gSolid(bottle.clone(), c), [bx, top, 0.7]));
      P.add(G, xf(gSolid(new THREE.ConeGeometry(0.012, 0.07, 6), 'steel'), [bx + 0.02, top + 0.27, 0.7], [0, 0, -0.9]));
    });
    ['syrupRed', 'syrupGreen', 'syrupBlue'].forEach((c, i) => {
      const bx = 0.62 + i * 0.22, bz = 0.86 + (i % 2) * 0.08;
      P.add(G, xf(gRect(cup.clone(), 'cup'), [bx, top, bz]));
      P.add(G, xf(gSolid(mound.clone(), c), [bx, top + 0.1, bz], [0, 0, 0], [1.05, 1.1, 1.05]));
      P.add(G, xf(gSolid(cyl(0.004, 0.004, 0.14, 3, true), 'red'), [bx + 0.02, top + 0.2, bz], [0, 0, -0.35]));
    });
    P.add(G, xf(gRect(cyl(0.048, 0.04, 0.2, 12), 'cup'), [1.42, top + 0.1, 0.66]));
    // 氷 flag hanging at the front
    const flag = cloth({ w: 0.5, h: 0.6, nx: 6, ny: 3, amp: 0.012, wave: 0.35 });
    P.add(S, xf(remapUV(flag, SIGN_RECT.flag), [1.3, 1.86, 1.22]));
    P.add(Wd, boxUV(cylBetween([1.0, 1.87, 1.22], [1.6, 1.87, 1.22], 0.012, 6, false), 1, 'x'));
  } else if (type === 'omen') {
    P.add(Wd, xf(boxUV(rbox(3.1, 1.12, 0.06, 0.02), 1, 'x'), [0, top + 0.58, 0.6]));
    P.add(G, xf(gSolid(box(2.96, 1.0, 0.02), 'purple'), [0, top + 0.58, 0.64]));
    const shell = new THREE.SphereGeometry(0.1, 8, 6, Math.PI / 2 - 1.2, 2.4, 0.38, 2.3);
    const kinds = ['maskFox', 'maskHyottoko', 'maskOkame', 'maskFox', 'maskTanuki', 'maskOni', 'maskCat', 'maskFox', 'maskRabbit', 'maskTengu', 'maskOkame', 'maskHyottoko'];
    let k = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 7; i++) {
        const kind = kinds[(k++ * 5 + row) % kinds.length];
        const x = (i - 3) * 0.41 + (row % 2) * 0.06, y = top + 0.2 + row * 0.33, z = 0.66;
        const m = remapUV(shell.clone(), goodsRect(kind, 5));
        m.scale(1, 1.25, 0.55);
        P.add(G, xf(m, [x, y, z], [0, 0, (r() - 0.5) * 0.12]));
        const ear = (cell, sx, len = 0.07, rad = 0.028) => {
          const e = new THREE.ConeGeometry(rad, len, 5);
          P.add(G, xf(gSolid(e, cell), [x + sx * 0.06, y + 0.12, z + 0.01], [0, 0, -sx * 0.35]));
        };
        if (kind === 'maskFox' || kind === 'maskCat') { ear('white', -1); ear('white', 1); }
        if (kind === 'maskTanuki') { ear('orange', -1, 0.05, 0.03); ear('orange', 1, 0.05, 0.03); }
        if (kind === 'maskRabbit') { ear('white', -1, 0.14, 0.022); ear('white', 1, 0.14, 0.022); }
        if (kind === 'maskOni') { ear('yellow', -1, 0.06, 0.016); ear('yellow', 1, 0.06, 0.016); }
        if (kind === 'maskTengu') P.add(G, xf(gSolid(new THREE.ConeGeometry(0.02, 0.13, 6), 'red'), [x, y - 0.01, z + 0.11], [Math.PI / 2 - 0.25, 0, 0]));
      }
    }
    // water yo-yo balloons in a basin
    P.add(G, xf(gSolid(lathe([[0.001, 0], [0.2, 0], [0.24, 0.1], [0.25, 0.11], [0.235, 0.11], [0.195, 0.015], [0.001, 0.015]], 16), 'blue'), [1.2, top, 0.86]));
    const bal = sphere(0.055, 9, 7);
    ['red', 'yellow', 'green', 'pink', 'orange', 'purple'].forEach((c, i) => {
      P.add(G, xf(gSolid(bal.clone(), c), [1.2 + Math.cos(i) * 0.12, top + 0.1, 0.86 + Math.sin(i) * 0.1]));
    });
  }
}

/**
 * 屋台 food stall ≈ 3.6 m wide × 2.4 m deep × 3 m tall. Front (customer side) faces +Z.
 * type: 'takoyaki' | 'yakisoba' | 'wataame' | 'kingyo' | 'ringoame' | 'kakigori' | 'omen'
 */
export function createYatai({ type = 'takoyaki', lit = true, seed = 1 } = {}) {
  const T = YATAI_TYPES[type] ? type : 'takoyaki';
  const D0 = YATAI_TYPES[T];
  const r = rng(seed * 7 + 3);
  const g = new THREE.Group();
  g.name = 'yatai_' + T;
  const M = {
    wood: stallWoodMat(lit), cano: canopyMat(D0.canopy, lit), sign: yataiSignMat(T, lit),
    goods: goodsMat(lit), lamp: lanternMat(lit),
  };
  const P = new Parts();
  const eaveY = 2.5, ridgeY = 3.0, px = 1.72, pz = 1.12, cx = 1.9, cz = 1.34;
  // --- frame ---
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) P.add(M.wood, xf(boxUV(rbox(0.085, eaveY, 0.085, 0.014), 1, 'y'), [sx * px, eaveY / 2, sz * pz]));
    P.add(M.wood, xf(boxUV(rbox(0.07, ridgeY - eaveY, 0.07, 0.012), 1, 'y'), [sx * px, (eaveY + ridgeY) / 2 - 0.03, 0]));
    P.add(M.wood, xf(boxUV(rbox(0.07, 0.07, 2 * pz + 0.1, 0.012), 1, 'z'), [sx * px, eaveY - 0.05, 0]));
  }
  P.add(M.wood, xf(boxUV(rbox(4.1, 0.08, 0.08, 0.014), 1, 'x'), [0, eaveY - 0.05, pz]));
  P.add(M.wood, xf(boxUV(rbox(3.6, 0.08, 0.08, 0.014), 1, 'x'), [0, eaveY - 0.05, -pz]));
  P.add(M.wood, xf(boxUV(rbox(3.7, 0.07, 0.07, 0.012), 1, 'x'), [0, ridgeY - 0.06, 0]));
  for (const x of [-px, 0, px]) {
    for (const sz of [-1, 1]) P.add(M.wood, boxUV(beamBetween([x, ridgeY - 0.05, 0], [x, eaveY - 0.03, sz * cz], 0.045, 0.045), 1, 'y'));
  }
  // --- canopy (two slopes, cloth sagging between rafters) ---
  for (const sz of [-1, 1]) {
    const slope = surface(20, 5, (s, t) => {
      const x = (s - 0.5) * 2 * cx;
      const z = sz * t * cz;
      const sagX = 0.03 * Math.abs(Math.sin((Math.PI * x) / px));
      const y = ridgeY + (eaveY - ridgeY) * t + 0.04 - sagX * Math.sin(Math.PI * Math.min(1, t * 1.15));
      return [x, y, z];
    }, (s, t) => [((s - 0.5) * 2 * cx) / 0.6, (t * Math.hypot(cz, ridgeY - eaveY)) / 0.6]);
    P.add(M.cano, slope);
    // back valance
    if (sz < 0) {
      const bv = cloth({ w: 2 * cx, h: 0.3, nx: 20, ny: 1, amp: 0.012, wave: 0.4, scallop: 0.06, scallopW: 0.3 });
      scaleUV(bv, (2 * cx) / 0.6, 0.3 / 0.6);
      bv.rotateY(Math.PI);
      P.add(M.cano, xf(bv, [0, eaveY + 0.01, -cz]));
    }
  }
  for (const sx of [-1, 1]) {
    const gab = surface(8, 4, (s, t) => [sx * cx, eaveY + t * (ridgeY - eaveY) - 0.02, (s - 0.5) * 2 * cz * (1 - t)], (s, t) => [((s - 0.5) * 2 * cz) / 0.6, t]);
    P.add(M.cano, gab);
  }
  // header valance with the stall name
  const hv = cloth({ w: 2 * cx, h: 0.62, nx: 24, ny: 2, amp: 0.01, wave: 0.5 });
  P.add(M.sign, xf(remapUV(hv, SIGN_RECT.header), [0, eaveY + 0.02, cz + 0.02]));
  // back wall + side walls (canopy cloth)
  const bw = cloth({ w: 2 * px - 0.06, h: eaveY - 0.15, nx: 16, ny: 3, amp: 0.025, wave: 0.42, grow: 0.2 });
  scaleUV(bw, (2 * px) / 0.6, (eaveY - 0.15) / 0.6);
  P.add(M.cano, xf(bw, [0, eaveY - 0.08, -pz - 0.05]));
  for (const sx of [-1, 1]) {
    const sw = cloth({ w: 1.3, h: 1.5, nx: 8, ny: 2, amp: 0.02, wave: 0.4, grow: 0.2 });
    scaleUV(sw, 1.3 / 0.6, 1.5 / 0.6);
    P.add(M.cano, xf(sw, [sx * (px + 0.05), eaveY - 0.08, -0.45], [0, sx * Math.PI / 2, 0]));
  }
  // --- counter / back table ---
  if (T !== 'kingyo') {
    P.add(M.wood, xf(boxUV(rbox(3.2, 0.9, 0.56, 0.02), 1, 'x'), [0, 0.45, 0.79]));
    P.add(M.wood, xf(boxUV(rbox(3.4, 0.05, 0.74, 0.015), 1, 'x'), [0, 0.925, 0.8]));
    const sk = cloth({ w: 3.3, h: 0.8, nx: 20, ny: 2, amp: 0.012, wave: 0.5, grow: 0.8 });
    P.add(M.sign, xf(remapUV(sk, SIGN_RECT.skirt), [0, 0.9, 1.1]));
  } else {
    // kingyo: vendor bench at the back
    P.add(M.wood, xf(boxUV(rbox(0.5, 0.35, 0.35, 0.02), 1, 'x'), [-1.2, 0.175, -0.7]));
  }
  P.add(M.wood, xf(boxUV(rbox(3.0, 0.05, 0.5, 0.012), 1, 'x'), [0, 0.82, -0.8]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add(M.wood, xf(boxUV(box(0.05, 0.8, 0.05), 1, 'y'), [sx * 1.4, 0.4, -0.8 + sz * 0.2]));
  P.add(M.goods, xf(gRect(rbox(0.5, 0.34, 0.36, 0.012), 'cardboard'), [0.9, 1.015, -0.8], [0, 0.1, 0]));
  P.add(M.goods, xf(gRect(rbox(0.44, 0.3, 0.34, 0.012), 'cardboard'), [0.95, 1.33, -0.82], [0, -0.1, 0]));
  P.add(M.goods, xf(gSolid(rbox(0.5, 0.32, 0.34, 0.03), 'blue'), [0.2, 1.0, -0.8]));
  P.add(M.goods, xf(gSolid(rbox(0.52, 0.06, 0.36, 0.025), 'white'), [0.2, 1.18, -0.8]));
  // menu board on the back wall
  P.add(M.sign, xf(remapUV(rbox(0.9, 0.6, 0.025, 0.008), SIGN_RECT.menu), [-0.85, 1.72, -pz + 0.02]));
  // --- goods ---
  yataiGoods(T, P, M, r);
  // --- bulbs + chochin ---
  for (let i = 0; i < 5; i++) for (const b of bulbParts(-1.4 + i * 0.7, eaveY - 0.09, 1.83, pz - 0.06)) P.add(M.lamp, b);
  for (const sx of [-1, 1]) {
    const lg = chochinGeometry({ color: T === 'kakigori' ? 'white' : 'red', text: D0.lantern, size: 0.85, detail: 'low' });
    lg.rotateY((r() - 0.5) * 0.4);
    P.add(M.lamp, xf(lg, [sx * 1.98, eaveY - 0.08, pz]));
  }
  P.build(g);
  g.userData.collider = { type: 'box', w: 3.9, d: 2.7 };
  return g;
}

// ===========================================================================
// 9. 長胴太鼓 taiko (defined before the yagura, which uses it)
// ===========================================================================
function taikoBodyR(y, R, L, bulge) { const s = (2 * y) / L; return R + bulge * (1 - s * s); }

/**
 * Taiko drum parts. Drum axis along +Z (front head faces +Z) centred at c, tilted by `tilt`
 * (negative = front head raised), rotated by yaw. M = { body, head, brass }.
 */
function taikoDrumParts(P, M, { c = [0, 1, 0], R = 0.35, L = 0.8, bulge = 0.065, tilt = -0.22, yaw = 0, tacks = 30, seg = 22 } = {}) {
  const body = [], head = [], brass = [];
  const bodyPts = [];
  for (let k = 0; k <= 10; k++) { const y = -L / 2 + (k / 10) * L; bodyPts.push([taikoBodyR(y, R, L, bulge), y]); }
  body.push(lathe(bodyPts, seg));
  const Rh = R + 0.014;
  for (const sgn of [1, -1]) {
    const h = lathe([[Rh, 0], [R * 0.93, 0.005], [R * 0.55, 0.011], [0.0, 0.013]], seg, false);
    planarUV(h, 'x', 'z', [-Rh, Rh, Rh, -Rh]);
    const bandPts = [];
    for (const dy of [-0.085, -0.06, -0.035, -0.012]) bandPts.push([taikoBodyR(L / 2 + dy, R, L, bulge) + 0.006, dy]);
    bandPts.push([Rh, 0]);
    const band = solidUV(lathe(bandPts, seg, false), [0.02, 0.02]);
    for (const gg of [h, band]) {
      if (sgn < 0) gg.rotateX(Math.PI);
      gg.translate(0, (sgn * L) / 2, 0);
      head.push(gg);
    }
    const tk = new THREE.ConeGeometry(0.012, 0.014, 5);
    tk.rotateZ(-Math.PI / 2);
    const ty = L / 2 - 0.05;
    const rt = taikoBodyR(ty, R, L, bulge) + 0.012;
    for (let i = 0; i < tacks; i++) {
      const a = ((i + 0.5) / tacks) * Math.PI * 2;
      const t = tk.clone();
      t.translate(rt, 0, 0);
      t.rotateY(-a);
      t.translate(0, sgn * ty, 0);
      brass.push(t);
    }
  }
  // 鐶 ring handles on both sides (drum space: +Z = world down)
  const rb = R + bulge;
  for (const sx of [-1, 1]) {
    brass.push(xf(box(0.014, 0.1, 0.07), [sx * (rb + 0.004), 0, 0.01]));
    const ring = new THREE.TorusGeometry(0.05, 0.009, 5, 12);
    ring.rotateY(Math.PI / 2);
    brass.push(xf(ring, [sx * (rb + 0.016), 0, 0.06]));
  }
  const finish = (geo) => { geo.rotateX(Math.PI / 2 + tilt); geo.rotateY(yaw); geo.translate(c[0], c[1], c[2]); return geo; };
  for (const gg of body) P.add(M.body, finish(gg));
  for (const gg of head) P.add(M.head, finish(gg));
  for (const gg of brass) P.add(M.brass, finish(gg));
}

/** Slanted wooden stand for a drum made with the same parameters (world space, yaw = 0). */
function taikoStandParts(P, wood, { c = [0, 1, 0], R = 0.35, L = 0.8, bulge = 0.065, tilt = -0.22 } = {}) {
  const st = -Math.sin(tilt), ct = Math.cos(tilt);
  const legX = R * 0.95;
  const cr = [];
  for (const a of [-0.26, 0.26]) {
    const r0 = taikoBodyR(a, R, L, bulge);
    const cy = c[1] + a * st, cz = c[2] + a * ct;
    const under = cy - r0 * ct;
    cr.push({ z: cz, top: under });
    P.add(wood, xf(boxUV(rbox(2 * legX + 0.16, 0.1, 0.1, 0.02), 1, 'x'), [c[0], under - 0.03, cz]));
    for (const sx of [-1, 1]) {
      const h = under - 0.08;
      P.add(wood, xf(boxUV(box(0.085, h, 0.085), 1, 'y'), [c[0] + sx * legX, h / 2, cz]));
      // chocks hugging the drum
      const xx = R * 0.62;
      const yy = cy - Math.sqrt(Math.max(0, r0 * r0 - xx * xx)) * ct;
      P.add(wood, xf(boxUV(box(0.12, 0.09, 0.09), 1, 'x'), [c[0] + sx * xx, Math.min(yy, under + 0.1) - 0.01, cz], [0, 0, sx * 0.5]));
    }
  }
  const [f, b] = [cr[1], cr[0]];
  for (const sx of [-1, 1]) {
    const len = Math.abs(f.z - b.z) + 0.1;
    P.add(wood, xf(boxUV(box(0.07, 0.07, len), 1, 'z'), [c[0] + sx * legX, 0.14, (f.z + b.z) / 2]));
  }
  P.add(wood, xf(boxUV(box(2 * legX, 0.06, 0.06), 1, 'x'), [c[0], 0.3, b.z]));
}

/** 長胴太鼓 big festival drum on a slanted wooden stand. Front head (三つ巴) faces +Z. ≈1.3 m tall. */
export function createTaiko({ seed = 1, detail = 'high', lit = true } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.name = 'taiko';
  const M = { body: taikoBodyMat(), head: taikoHeadMat(lit), brass: getMat('brass') };
  const P = new Parts();
  const hi = detail !== 'low';
  const opt = { c: [0, 0.98, 0], R: 0.36, L: 0.82, bulge: 0.065, tilt: -0.24, tacks: hi ? 26 : 18, seg: hi ? 20 : 14 };
  taikoDrumParts(P, M, opt);
  const wood = getMat('woodDark');
  taikoStandParts(P, wood, opt);
  // bachi resting on the drum top
  const topY = opt.c[1] + (opt.R + opt.bulge) * Math.cos(opt.tilt) + 0.02;
  for (const sx of [-1, 1]) {
    const stick = rbox(0.034, 0.034, 0.44, 0.016, 1);
    P.add(getMat('woodLight'), xf(boxUV(stick, 1, 'z'), [sx * 0.06, topY, 0], [opt.tilt, sx * 0.12 + (r() - 0.5) * 0.05, 0]));
  }
  P.build(g);
  g.userData.collider = { type: 'circle', r: 0.6 };
  return g;
}

// ===========================================================================
// 4. 盆踊りやぐら (hero)
// ===========================================================================
/**
 * Bon-odori tower: 4 × 4 m base, ≈7.1 m to the finial. Lower level wrapped in 紅白幕, upper stage with
 * railing + taiko, pyramid kawara roof with upswept corners, lanterns under the roof and (optionally)
 * 8 radiating lantern strings from the finial down to y = stringEndY at radius stringReach.
 * group.userData.stringEnds lists the far ends (world coords) so poles can be placed there.
 */
export function createYagura({ seed = 1, lit = true, strings = true, stringCount = 8, stringReach = 9.4, stringEndY = 2.5, stringLanterns = 7 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.name = 'yagura';
  const M = {
    wood: yaguraWoodMat(lit), kohaku: kohakuMat(lit), kawara: getMat('kawara'), eave: eaveMat(lit), lamp: lanternMat(lit),
    body: taikoBodyMat(), head: taikoHeadMat(lit), brass: getMat('brass'),
  };
  const P = new Parts();
  const post = 1.9, stageY = 2.5, railH = 0.95, headY = 5.0, roofY = 5.2;
  const floorTop = stageY + 0.06;
  // --- posts & beams ---
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add(M.wood, xf(boxUV(rbox(0.2, roofY, 0.2, 0.025), 1, 'y'), [sx * post, roofY / 2, sz * post]));
  for (const s of [-1, 1]) {
    P.add(M.wood, xf(boxUV(rbox(2 * post + 0.3, 0.22, 0.18, 0.02), 1, 'x'), [0, stageY - 0.17, s * post]));
    P.add(M.wood, xf(boxUV(rbox(0.18, 0.22, 2 * post + 0.3, 0.02), 1, 'z'), [s * post, stageY - 0.17, 0]));
    P.add(M.wood, xf(boxUV(rbox(2 * post + 0.5, 0.26, 0.18, 0.02), 1, 'x'), [0, headY, s * post]));
    P.add(M.wood, xf(boxUV(rbox(0.18, 0.26, 2 * post + 0.5, 0.02), 1, 'z'), [s * post, headY, 0]));
    // low tie beams (visible under the curtain hem)
    P.add(M.wood, xf(boxUV(box(2 * post, 0.14, 0.12), 1, 'x'), [0, 0.35, s * post]));
    P.add(M.wood, xf(boxUV(box(0.12, 0.14, 2 * post), 1, 'z'), [s * post, 0.35, 0]));
  }
  P.add(M.wood, xf(boxUV(box(2 * post, 0.2, 0.16), 1, 'x'), [0, stageY - 0.16, 0]));
  P.add(M.wood, xf(boxUV(box(0.16, 0.2, 2 * post), 1, 'z'), [0, stageY - 0.16, 0]));
  P.add(M.wood, xf(boxUV(rbox(4.6, 0.12, 4.6, 0.02), 1, 'x'), [0, stageY, 0]));
  P.add(M.wood, xf(boxUV(box(2 * post + 0.2, 0.05, 2 * post + 0.2), 1, 'x'), [0, headY + 0.155, 0]));
  // --- railing ---
  const rr = 2.2;
  for (const x of [-rr, 0, rr]) {
    for (const z of [-rr, 0, rr]) {
      if (x === 0 && z === 0) continue;
      if (Math.abs(x) < rr && Math.abs(z) < rr) continue;
      P.add(M.wood, xf(boxUV(box(0.1, railH + 0.05, 0.1), 1, 'y'), [x, floorTop + (railH + 0.05) / 2, z]));
    }
  }
  for (const s of [-1, 1]) {
    for (const [y, h] of [[floorTop + railH, 0.08], [floorTop + 0.55, 0.05], [floorTop + 0.1, 0.06]]) {
      P.add(M.wood, xf(boxUV(y > floorTop + 0.8 ? rbox(2 * rr + 0.12, h, 0.08, 0.012) : box(2 * rr + 0.12, h, 0.08), 1, 'x'), [0, y, s * rr]));
      P.add(M.wood, xf(boxUV(y > floorTop + 0.8 ? rbox(0.08, h, 2 * rr + 0.12, 0.012) : box(0.08, h, 2 * rr + 0.12), 1, 'z'), [s * rr, y, 0]));
    }
    for (let i = 1; i < 18; i++) {
      const u = -rr + (i / 18) * 2 * rr;
      if (Math.abs(u) < 0.08) continue;
      const bh = railH - 0.18;
      P.add(M.wood, xf(box(0.03, bh, 0.03), [u, floorTop + 0.13 + bh / 2, s * rr]));
      P.add(M.wood, xf(box(0.03, bh, 0.03), [s * rr, floorTop + 0.13 + bh / 2, u]));
    }
  }
  // sign board on the front railing
  P.add(M.kohaku, xf(remapUV(rbox(1.5, 0.5, 0.05, 0.012), KOHAKU_SIGN), [0, floorTop + 0.55, rr + 0.07]));
  // --- 紅白幕 around the lower level ---
  const cw = 4.5, ch = stageY - 0.12;
  for (let k = 0; k < 4; k++) {
    const cl = cloth({ w: cw, h: ch, nx: 32, ny: 2, amp: 0.035, wave: 0.3, grow: 0.25, phase: k });
    scaleUV(cl, cw / 0.9, KOHAKU_V[1] - KOHAKU_V[0], 0, KOHAKU_V[0]);
    cl.translate(0, stageY - 0.07, 2.26);
    cl.rotateY((k * Math.PI) / 2);
    P.add(M.kohaku, cl);
  }
  // --- ladder at the back ---
  for (const sx of [-1, 1]) P.add(M.wood, boxUV(beamBetween([sx * 0.3, 0, -3.05], [sx * 0.3, floorTop + 0.9, -2.3], 0.07, 0.06), 1, 'y'));
  for (let i = 1; i <= 8; i++) {
    const t = i / 9.5;
    P.add(M.wood, xf(boxUV(box(0.6, 0.04, 0.06), 1, 'x'), [0, t * (floorTop + 0.9), -3.05 + t * 0.75]));
  }
  // --- roof ---
  const roof = japaneseRoof({ type: 'hip', W: 5.0, D: 5.0, rise: 1.5, curve: 0.5, sweep: 0.34, sweepLen: 1.5, sweepDepth: 1.1, thick: 0.2, soffit: 1.0, segU: 12, segV: 7, tile: 1.6, hipR: 0.075 });
  P.add(M.kawara, xf(roof.top, [0, roofY, 0]));
  P.add(M.eave, xf(roof.under, [0, roofY, 0]));
  P.add(M.eave, xf(remapUV(roof.ridge, [0, 0.62, 5, 0.9]), [0, roofY, 0]));
  const apex = roofY + roof.ridgeY;
  P.add(M.brass, xf(rbox(0.34, 0.14, 0.34, 0.03), [0, apex + 0.02, 0]));
  P.add(M.brass, lathe([[0.001, 0], [0.09, 0.02], [0.12, 0.1], [0.1, 0.19], [0.05, 0.27], [0.012, 0.34], [0.001, 0.36]], 14).translate(0, apex + 0.09, 0));
  // --- taiko on the stage ---
  const topt = { c: [0, floorTop + 0.98, 0.25], R: 0.37, L: 0.84, bulge: 0.065, tilt: -0.22, tacks: 22, seg: 16 };
  taikoDrumParts(P, M, topt);
  taikoStandParts(P, M.wood, topt);
  // --- lanterns under the head beams ---
  let li = 0;
  for (let k = 0; k < 4; k++) {
    for (const u of [-1.05, 0, 1.05]) {
      const lg = chochinGeometry({ color: li % 2 ? 'red' : 'white', text: '祭', size: 0.95, detail: 'low' });
      lg.rotateY((r() - 0.5) * 0.3);
      lg.translate(u, headY - 0.13, post + 0.02);
      lg.rotateY((k * Math.PI) / 2);
      P.add(M.lamp, lg);
      li++;
    }
  }
  // --- radiating lantern strings ---
  const ends = [];
  if (strings) {
    const A = V3(0, apex + 0.3, 0);
    for (let k = 0; k < stringCount; k++) {
      const ang = ((k + 0.5) / stringCount) * Math.PI * 2;
      const B = V3(Math.sin(ang) * stringReach, stringEndY, Math.cos(ang) * stringReach);
      ends.push([+B.x.toFixed(3), B.y, +B.z.toFixed(3)]);
      P.add(M.lamp, lanternStringGeometry({ a: A, b: B, count: stringLanterns, sag: 0.35, colors: k % 2 ? ['red', 'white'] : ['white', 'red'], texts: ['祭'], size: 0.8, seed: seed * 31 + k, tStart: 0.36, tEnd: 0.96 }));
    }
  }
  P.build(g, { cast: (m) => m !== M.lamp });
  g.userData.stringEnds = ends;
  g.userData.collider = { type: 'box', w: 4.7, d: 4.7 };
  return g;
}

// ===========================================================================
// Building helpers
// ===========================================================================
/** Window plane (window atlas cell) facing +Z, rotated by ry, centred at pos. */
function winPlane(cell, w, h, pos, ry = 0) {
  const pl = remapUV(new THREE.PlaneGeometry(w, h), WIN[cell]);
  pl.rotateY(ry);
  pl.translate(pos[0], pos[1], pos[2]);
  return pl;
}
function pickWin(r) {
  const x = r();
  if (x < 0.55) return 'shoji';
  if (x < 0.66) return 'shojiPerson';
  if (x < 0.76) return 'shojiPlant';
  if (x < 0.86) return 'shojiDim';
  if (x < 0.94) return 'yukimi';
  return 'amado';
}

/**
 * 唐破風 (karahafu) porch roof: bow-shaped gable facing +Z, extruded from z0 (wall) to z1 (front).
 * Returns { top, under, board: points of the front curve }.
 */
function karahafuRoof({ halfW = 2.2, z0 = 5, z1 = 7.2, yTop = 3.4, drop = 0.6, thick = 0.2 }) {
  const yAt = (x) => { const q = Math.min(1, Math.abs(x) / halfW); return yTop - drop * (2 * q * q - q * q * q * q); };
  const nx = 18, nz = 3;
  const arc = [0];
  for (let i = 1; i <= nx; i++) {
    const xa = -halfW + ((i - 1) / nx) * 2 * halfW, xb = -halfW + (i / nx) * 2 * halfW;
    arc.push(arc[i - 1] + Math.hypot(xb - xa, yAt(xb) - yAt(xa)));
  }
  const top = surface(nx, nz, (s, t) => { const x = -halfW + s * 2 * halfW; return [x, yAt(x), z0 + t * (z1 - z0)]; },
    (s, t) => [(z0 + t * (z1 - z0)) / 2, arc[Math.round(s * nx)] / 2]);
  orient(top, [0, 1, 0]);
  const under = surface(nx, nz, (s, t) => { const x = -halfW + s * 2 * halfW; return [x, yAt(x) - thick, z0 + t * (z1 - z0)]; },
    (s, t) => [(z0 + t * (z1 - z0)) / 0.6, 0.02 + 0.46 * s]);
  orient(under, [0, -1, 0]);
  const edges = [];
  for (const sx of [-1, 1]) {
    const e = surface(nz, 1, (s, t) => [sx * halfW, yTop - drop - (1 - t) * thick, z0 + s * (z1 - z0)], (s, t) => [(s * (z1 - z0)) / 0.6, 0.52 + 0.46 * t]);
    orient(e, [sx, 0, 0]);
    edges.push(e);
  }
  const board = [];
  for (let i = 0; i <= 24; i++) { const x = -halfW - 0.06 + (i / 24) * (2 * halfW + 0.12); board.push(V3(x, yAt(x) - 0.02, z1 + 0.04)); }
  return { top, under: merge([under, ...edges]), board, yAt };
}

// ===========================================================================
// 5. 温泉旅館 ryokan
// ===========================================================================
/**
 * Onsen ryokan ≈ 14 m wide × 10 m deep (+ porch / balconies), 3 floors (floors = 2 | 3), ≈13 m to the ridge.
 * Dark timber, plaster, continuous front balconies, glowing shoji, pent roof ring + irimoya main roof,
 * karahafu entrance porch with 「ゆ」 noren, hanging sign 「旅館 ぽんぽこ」, entrance lanterns.
 */
export function createRyokan({ floors = 3, lit = true, seed = 1 } = {}) {
  const r = rng(seed * 13 + 5);
  const g = new THREE.Group();
  g.name = 'ryokan';
  const M = {
    wood: buildingWoodMat('dark', lit), plaster: plasterMat('white'), kawara: getMat('kawara'), stone: getMat('stone'),
    eave: eaveMat(lit), win: windowMat(lit), deco: decoMat(lit), lamp: lanternMat(lit),
  };
  const P = new Parts();
  const nF = Math.max(2, Math.min(3, floors));
  const W = 14, D = 10, hw = W / 2, hd = D / 2;
  const base = 0.45;
  const lv = [base, 3.7, 7.0, 9.8].slice(0, nF + 1);
  if (nF === 2) lv[2] = 7.0;
  const topY = lv[nF];
  // --- plinth + step ---
  P.add(M.stone, xf(boxUV(box(W + 0.3, base, D + 0.3), 1.5), [0, base / 2, 0]));
  P.add(M.stone, xf(boxUV(box(3.8, 0.22, 0.9), 1.5), [0, 0.11, hd + 0.55]));
  // --- walls ---
  P.add(M.wood, xf(boxUV(box(W, lv[1] - base, D), 1, 'y'), [0, (base + lv[1]) / 2, 0]));
  for (let f = 1; f < nF; f++) P.add(M.plaster, xf(boxUV(box(W - 0.02, lv[f + 1] - lv[f], D - 0.02), 2), [0, (lv[f] + lv[f + 1]) / 2, 0]));
  for (let f = 1; f <= nF; f++) P.add(M.wood, xf(boxUV(rbox(W + 0.12, 0.28, D + 0.12, 0.03), 1, 'x'), [0, lv[f] - (f === nF ? 0.14 : 0), 0]));
  // posts / rails on plaster floors
  for (let f = 1; f < nF; f++) {
    const y0 = lv[f], y1 = lv[f + 1], h = y1 - y0;
    for (let k = 0; k <= 8; k++) {
      const x = -hw + k * 1.75;
      P.add(M.wood, xf(box(0.18, h, 0.08), [x, (y0 + y1) / 2, hd + 0.03]));
      P.add(M.wood, xf(box(0.18, h, 0.08), [x, (y0 + y1) / 2, -hd - 0.03]));
    }
    for (let k = 0; k <= 4; k++) {
      const z = -hd + k * 2.5;
      for (const sx of [-1, 1]) P.add(M.wood, xf(box(0.08, h, 0.18), [sx * (hw + 0.03), (y0 + y1) / 2, z]));
    }
    for (const dy of [0.72, 2.42]) {
      for (const sz of [-1, 1]) P.add(M.wood, xf(boxUV(box(W + 0.08, 0.09, 0.06), 1, 'x'), [0, y0 + dy, sz * (hd + 0.05)]));
      for (const sx of [-1, 1]) P.add(M.wood, xf(boxUV(box(0.06, 0.09, D + 0.08), 1, 'z'), [sx * (hw + 0.05), y0 + dy, 0]));
    }
    // windows: front (behind the balcony), back, sides
    for (let k = 0; k < 8; k++) {
      const x = -hw + 0.875 + k * 1.75;
      P.add(M.win, winPlane(pickWin(r), 1.5, 1.62, [x, y0 + 1.57, hd + 0.02]));
      if (k % 2 === 0) P.add(M.win, winPlane(pickWin(r), 1.5, 1.4, [x + 0.875, y0 + 1.55, -hd - 0.02], Math.PI));
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      if (k === 1 && f === 1) continue;
      P.add(M.win, winPlane(pickWin(r), 1.6, 1.5, [sx * (hw + 0.02), y0 + 1.57, -hd + 1.25 + k * 2.5], sx * Math.PI / 2));
    }
  }
  // --- balconies (front, upper floors) ---
  for (let f = 1; f < nF; f++) {
    const y = lv[f] + 0.02, bz = hd + 0.6, rz = hd + 1.12;
    P.add(M.wood, xf(boxUV(rbox(W + 0.4, 0.16, 1.25, 0.03), 1, 'x'), [0, y - 0.08, bz]));
    P.add(M.wood, xf(boxUV(rbox(W + 0.44, 0.08, 0.12, 0.02), 1, 'x'), [0, y + 0.86, rz]));
    P.add(M.wood, xf(boxUV(box(W + 0.4, 0.06, 0.07), 1, 'x'), [0, y + 0.12, rz]));
    P.add(M.wood, xf(boxUV(box(W + 0.4, 0.05, 0.06), 1, 'x'), [0, y + 0.62, rz]));
    for (let k = 0; k <= 8; k++) {
      const x = -hw - 0.15 + k * ((W + 0.3) / 8);
      P.add(M.wood, xf(box(0.1, 0.9, 0.1), [x, y + 0.45, rz]));
      P.add(M.wood, beamBetween([x, y - 0.75, hd + 0.05], [x, y - 0.12, hd + 1.0], 0.08, 0.08));
    }
    for (let i = 0; i < 46; i++) {
      const x = -hw - 0.1 + ((i + 0.5) / 46) * (W + 0.2);
      P.add(M.wood, xf(box(0.03, 0.46, 0.03), [x, y + 0.37, rz]));
    }
    for (const sx of [-1, 1]) {
      P.add(M.wood, xf(boxUV(box(0.08, 0.08, 1.12), 1, 'z'), [sx * (hw + 0.18), y + 0.86, hd + 0.56]));
      P.add(M.wood, xf(boxUV(box(0.06, 0.06, 1.12), 1, 'z'), [sx * (hw + 0.18), y + 0.12, hd + 0.56]));
    }
  }
  // --- ground floor front: entrance + lattice windows ---
  const doorW = 3.4;
  for (let i = 0; i < 2; i++) P.add(M.win, winPlane('glassDoor', doorW / 2, 2.3, [(i - 0.5) * (doorW / 2), base + 1.15, hd + 0.02]));
  P.add(M.win, winPlane('shoji', doorW, 0.55, [0, base + 2.62, hd + 0.02]));
  P.add(M.wood, xf(boxUV(box(doorW + 0.3, 0.14, 0.12), 1, 'x'), [0, base + 2.33, hd + 0.05]));
  for (const sx of [-1, 1]) {
    P.add(M.wood, xf(box(0.16, 2.9, 0.14), [sx * (doorW / 2 + 0.08), base + 1.45, hd + 0.06]));
    const cx = sx * 4.3;
    P.add(M.win, winPlane('glow', 3.6, 1.45, [cx, base + 1.75, hd + 0.02]));
    for (const yy of [base + 1.0, base + 2.5]) P.add(M.wood, xf(boxUV(box(3.8, 0.08, 0.1), 1, 'x'), [cx, yy, hd + 0.06]));
    for (let i = 0; i <= 30; i++) P.add(M.wood, xf(box(0.035, 1.5, 0.05), [cx - 1.8 + (i / 30) * 3.6, base + 1.75, hd + 0.06]));
    // side windows ground floor
    P.add(M.win, winPlane('yukimi', 1.6, 1.4, [sx * (hw + 0.02), base + 1.6, -1.25], sx * Math.PI / 2));
    P.add(M.win, winPlane('shojiDim', 1.6, 1.4, [sx * (hw + 0.02), base + 1.6, 3.2], sx * Math.PI / 2));
  }
  // --- karahafu entrance porch ---
  const kh = karahafuRoof({ halfW: 2.25, z0: hd, z1: hd + 2.1, yTop: 3.42, drop: 0.58, thick: 0.2 });
  P.add(M.kawara, kh.top);
  P.add(M.eave, kh.under);
  P.add(M.wood, boardAlong(kh.board, 0.34, 0.12, V3(0, 0, 1), 1));
  P.add(M.kawara, xf(boxUV(cyl(0.1, 0.1, 2.25, 8), 1), [0, 3.47, hd + 1.05], [Math.PI / 2, 0, 0]));
  P.add(M.deco, xf(solidUV(rbox(0.5, 0.22, 0.05, 0.02), DECO.gold), [0, 3.02, hd + 2.2]));
  for (const sx of [-1, 1]) {
    P.add(M.wood, xf(boxUV(rbox(0.2, 2.35, 0.2, 0.03), 1, 'y'), [sx * 1.9, base + 1.175, hd + 1.9]));
    P.add(M.stone, xf(boxUV(rbox(0.34, 0.22, 0.34, 0.03), 1), [sx * 1.9, base + 0.11, hd + 1.9]));
    P.add(M.wood, xf(boxUV(box(0.14, 0.24, 1.95), 1, 'z'), [sx * 1.9, base + 2.28, hd + 0.98]));
  }
  P.add(M.wood, xf(boxUV(rbox(4.2, 0.3, 0.2, 0.04), 1, 'x'), [0, base + 2.4, hd + 1.92]));
  // noren 「ゆ」 in four panels
  P.add(M.wood, xf(boxUV(cyl(0.025, 0.025, 3.3, 6), 1), [0, base + 2.2, hd + 0.35], [0, 0, Math.PI / 2]));
  for (let i = 0; i < 4; i++) {
    const nr = cloth({ w: 0.78, h: 1.05, nx: 3, ny: 3, amp: 0.012, wave: 0.4, phase: i * 1.3 });
    const R0 = DECO.norenYu;
    remapUV(nr, [R0[0] + ((R0[2] - R0[0]) * i) / 4, R0[1], R0[0] + ((R0[2] - R0[0]) * (i + 1)) / 4, R0[3]]);
    P.add(M.deco, xf(nr, [(i - 1.5) * 0.81, base + 2.2, hd + 0.37]));
  }
  // hanging sign 「旅館 ぽんぽこ」 (perpendicular to the facade)
  P.add(M.wood, xf(boxUV(box(0.1, 0.1, 1.25), 1, 'z'), [-2.75, base + 3.0, hd + 0.62]));
  for (const dz of [-0.2, 0.2]) P.add(M.wood, xf(cyl(0.012, 0.012, 0.22, 4, true), [-2.75, base + 2.85, hd + 0.75 + dz]));
  P.add(M.deco, xf(remapUV(rbox(0.07, 2.0, 0.56, 0.02), DECO.ryokanSign), [-2.75, base + 1.72, hd + 0.75]));
  // wall plaque 「ぽんぽこの湯」 right of the door
  P.add(M.deco, xf(remapUV(rbox(0.46, 0.92, 0.05, 0.015), DECO.plaque), [2.55, base + 1.6, hd + 0.06]));
  // entrance lanterns
  for (const sx of [-1, 1]) {
    const lg = chochinGeometry({ color: 'shop', text: 'ぽんぽこ', size: 1.0, detail: 'low' });
    P.add(M.lamp, xf(lg, [sx * 1.45, base + 2.25, hd + 1.9], [0, (r() - 0.5) * 0.3, 0]));
  }
  // --- pent roof ring between the upper floors ---
  if (nF === 3) {
    const pr = japaneseRoof({ type: 'pent', W: W + 2.8, D: D + 2.8, hMax: 1.55, rise: 2.8, curve: 0.2, sweep: 0.3, sweepLen: 2.2, sweepDepth: 1.2, thick: 0.2, soffit: 1.55, segU: 14, segV: 3, tile: 2, hipR: 0.07 });
    const py = lv[2] - 0.55;
    P.add(M.kawara, xf(pr.top, [0, py, 0]));
    P.add(M.eave, xf(pr.under, [0, py, 0]));
    P.add(M.kawara, xf(pr.ridge, [0, py, 0]));
  }
  // --- main irimoya roof ---
  const mr = japaneseRoof({ type: 'irimoya', W: W + 3.0, D: D + 3.0, rise: 3.1, curve: 0.45, sweep: 0.45, sweepLen: 3.0, sweepDepth: 2.0, thick: 0.28, soffit: 1.7, segU: 14, segV: 7, tile: 2, gableAt: 0.55, setback: 0.35, ridgeH: 0.4, ridgeW: 0.36, hipR: 0.1, vergeH: 0.36 });
  const ry = topY + 0.05;
  P.add(M.kawara, xf(mr.top, [0, ry, 0]));
  P.add(M.eave, xf(mr.under, [0, ry, 0]));
  P.add(M.kawara, xf(mr.ridge, [0, ry, 0]));
  P.add(M.plaster, xf(mr.gable, [0, ry, 0]));
  P.add(M.wood, xf(mr.verge, [0, ry, 0]));
  // gable ornaments (懸魚)
  const gx = (W + 3.0) / 2 - (D + 3.0) / 2 * 0.55 + 0.05;
  for (const sx of [-1, 1]) P.add(M.deco, xf(solidUV(rbox(0.06, 0.5, 0.4, 0.02), DECO.gold), [sx * gx, ry + mr.ridgeY - 0.75, 0]));
  P.build(g, { cast: (m) => m !== M.win });
  g.userData.collider = { type: 'box', w: W + 0.4, d: D + 0.4 };
  return g;
}

// ===========================================================================
// 6. 京町家 machiya
// ===========================================================================
/**
 * Kyoto-style townhouse ≈ 6 m wide × 10 m deep, 2 storeys (≈7.6 m to the ridge). Front faces +Z.
 * Koshi lattice (glowing when lit), inuyarai, pent roof, mushiko-mado, udatsu, gable kawara roof,
 * noren with a shop crest. Variants by seed (timber colour, plaster tint, noren 酒 / 茶 / 甘味 / 宿)
 * or pass text explicitly.
 */
export function createMachiya({ lit = true, seed = 1, text = null } = {}) {
  const r = rng(seed * 17 + 11);
  const shops = ['酒', '茶', '甘味', '宿'];
  const shop = text && DECO.noren[text] ? text : shops[Math.abs(Math.floor(seed)) % 4];
  const woodKind = r() < 0.55 ? 'bengara' : 'dark';
  const tint = ['white', 'ochre', 'grey', 'white', 'rose'][Math.floor(r() * 5)];
  const g = new THREE.Group();
  g.name = 'machiya';
  const M = {
    wood: buildingWoodMat(woodKind, lit), plaster: plasterMat(tint), kawara: getMat('kawara'), eave: eaveMat(lit),
    win: windowMat(lit), deco: decoMat(lit), lamp: lanternMat(lit), stone: getMat('stonePlain'),
  };
  const P = new Parts();
  const W = 6, D = 10, hw = 3, hd = 5, base = 0.28, f1 = 3.1, f2 = 5.3;
  const zf = hd;
  // --- core ---
  P.add(M.stone, xf(boxUV(box(W + 0.12, base, D + 0.12), 1), [0, base / 2, 0]));
  P.add(M.plaster, xf(boxUV(box(W, f1 - base, D), 2), [0, (base + f1) / 2, 0]));
  P.add(M.plaster, xf(boxUV(box(W - 0.02, f2 - f1, D - 0.02), 2), [0, (f1 + f2) / 2, 0]));
  for (const sx of [-1, 1]) P.add(M.wood, xf(boxUV(box(0.05, 1.0, D - 0.4), 1, 'z'), [sx * (hw + 0.02), base + 0.5, -0.2]));
  P.add(M.wood, xf(boxUV(box(W - 0.4, 1.0, 0.05), 1, 'x'), [0, base + 0.5, -hd - 0.02]));
  // corner posts (full height) + floor beams
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add(M.wood, xf(boxUV(rbox(0.17, f2 - base, 0.17, 0.02), 1, 'y'), [sx * hw, (base + f2) / 2, sz * hd]));
  P.add(M.wood, xf(boxUV(rbox(W + 0.12, 0.24, 0.2, 0.025), 1, 'x'), [0, f1 - 0.3, zf + 0.03]));
  P.add(M.wood, xf(boxUV(rbox(W + 0.12, 0.16, 0.16, 0.02), 1, 'x'), [0, f1 + 0.02, zf + 0.02]));
  P.add(M.wood, xf(boxUV(rbox(W + 0.12, 0.18, 0.16, 0.02), 1, 'x'), [0, f2 - 0.08, zf + 0.02]));
  // --- ground floor front: entrance + koshi lattice ---
  const ex0 = -hw + 0.08, ex1 = -1.2;
  const ew = ex1 - ex0, ecx = (ex0 + ex1) / 2;
  P.add(M.win, winPlane('glassDoor', ew, 2.3, [ecx, base + 1.15, zf + 0.01]));
  P.add(M.wood, xf(boxUV(rbox(0.16, f1 - base - 0.3, 0.16, 0.02), 1, 'y'), [ex1 - 0.03, base + (f1 - base - 0.3) / 2, zf + 0.04]));
  P.add(M.stone, xf(boxUV(box(ew, 0.08, 0.5), 1), [ecx, 0.04, zf + 0.25]));
  // noren (2 panels)
  const NR = DECO.noren[shop];
  P.add(M.wood, xf(cyl(0.02, 0.02, ew + 0.1, 6), [ecx, base + 2.3, zf + 0.12], [0, 0, Math.PI / 2]));
  for (let i = 0; i < 2; i++) {
    const nr = cloth({ w: ew / 2 - 0.02, h: 0.95, nx: 3, ny: 3, amp: 0.01, wave: 0.35, phase: i * 1.7 });
    remapUV(nr, [NR[0] + ((NR[2] - NR[0]) * i) / 2, NR[1], NR[0] + ((NR[2] - NR[0]) * (i + 1)) / 2, NR[3]]);
    P.add(M.deco, xf(nr, [ecx + (i - 0.5) * (ew / 2), base + 2.3, zf + 0.14]));
  }
  // koshi lattice in front of a warm glow
  const lx0 = ex1 + 0.1, lx1 = hw - 0.1, lw = lx1 - lx0, lcx = (lx0 + lx1) / 2;
  P.add(M.win, winPlane('glow', lw, 2.05, [lcx, base + 1.36, zf + 0.01]));
  for (const yy of [base + 0.32, base + 2.38, base + 1.86]) P.add(M.wood, xf(boxUV(box(lw, 0.06, 0.08), 1, 'x'), [lcx, yy, zf + 0.06]));
  const nSlat = Math.round(lw / 0.095);
  for (let i = 0; i <= nSlat; i++) {
    const x = lx0 + (i / nSlat) * lw;
    const thick = i % 4 === 0;
    P.add(M.wood, xf(box(thick ? 0.045 : 0.03, 2.06, thick ? 0.06 : 0.045), [x, base + 1.35, zf + 0.06]));
  }
  // inuyarai (curved bamboo fence) at the foot of the lattice: individual curved slats
  const nIn = Math.round((lw - 0.1) / 0.075);
  for (let i = 0; i <= nIn; i++) {
    const x = lx0 + 0.05 + (i / nIn) * (lw - 0.1);
    const slat = surface(1, 5, (s2, t) => {
      const a = (t * Math.PI) / 2;
      return [x + (s2 - 0.5) * 0.045, 0.02 + 0.85 * Math.sin(a), zf + 0.1 + 0.5 * Math.cos(a)];
    }, (s2, t) => [x * 3 + s2 * 0.1, t * 1.2]);
    orient(slat, [0, 0.5, 1]);
    P.add(M.wood, slat);
  }
  for (const [yy, zz] of [[0.3, zf + 0.57], [0.72, zf + 0.33]]) P.add(M.wood, xf(boxUV(cyl(0.012, 0.012, lw - 0.1, 5), 1, 'y'), [lcx, yy, zz], [0, 0, Math.PI / 2]));
  // --- pent roof (一文字庇) ---
  const pr = japaneseRoof({ type: 'shed', W: W + 0.5, D: 2 * (hd + 0.95), hMax: 1.0, rise: 2.6, curve: 0.1, sweep: 0, thick: 0.15, soffit: 1.0, segU: 12, segV: 2, tile: 1.6, vergeBoard: false });
  P.add(M.kawara, xf(pr.top, [0, f1 - 0.12, 0]));
  P.add(M.eave, xf(pr.under, [0, f1 - 0.12, 0]));
  P.add(M.kawara, xf(boxUV(rbox(W + 0.5, 0.1, 0.16, 0.03), 1, 'x'), [0, f1 + 0.33, zf + 0.06]));
  // --- upper floor: mushiko-mado + udatsu ---
  for (const cx of [-1.45, 1.45]) {
    P.add(M.win, winPlane('glow', 1.5, 0.78, [cx, f1 + 1.15, zf + 0.015]));
    for (const [w, h, x, y] of [[1.74, 0.12, 0, 0.45], [1.74, 0.12, 0, -0.45], [0.12, 1.02, -0.81, 0], [0.12, 1.02, 0.81, 0]]) {
      P.add(M.plaster, xf(boxUV(rbox(w, h, 0.12, 0.04), 1), [cx + x, f1 + 1.15 + y, zf + 0.05]));
    }
    for (let i = 0; i < 8; i++) P.add(M.plaster, xf(boxUV(rbox(0.075, 0.8, 0.1, 0.03), 1), [cx - 0.66 + (i / 7) * 1.32, f1 + 1.15, zf + 0.05]));
  }
  for (const sx of [-1, 1]) {
    P.add(M.plaster, xf(boxUV(rbox(0.2, 1.95, 0.6, 0.03), 1), [sx * (hw + 0.1), f1 + 1.05, zf + 0.26]));
    P.add(M.kawara, xf(boxUV(rbox(0.34, 0.12, 0.72, 0.03), 1), [sx * (hw + 0.1), f1 + 2.07, zf + 0.26]));
  }
  // --- main gable roof ---
  const mr = japaneseRoof({ type: 'gable', W: W + 0.55, D: D + 1.8, rise: 2.1, curve: 0.2, sweep: 0, thick: 0.22, soffit: 0.95, segU: 12, segV: 6, tile: 1.8, vergeH: 0.26, ridgeH: 0.3, ridgeW: 0.3 });
  const ry = f2 + 0.05;
  P.add(M.kawara, xf(mr.top, [0, ry, 0]));
  P.add(M.eave, xf(mr.under, [0, ry, 0]));
  P.add(M.kawara, xf(mr.ridge, [0, ry, 0]));
  P.add(M.wood, xf(mr.verge, [0, ry, 0]));
  // gable end walls
  const H = (D + 1.8) / 2;
  for (const sx of [-1, 1]) {
    const gw = surface(1, 6, (s, t) => {
      const h = 0.9 + t * (H - 0.9);
      const y = t === 0 ? f2 - 0.02 : ry + mr.yOf(h) - mr.thick;
      return [sx * (hw - 0.01), y, (s - 0.5) * 2 * (H - h)];
    }, (s, t) => [s, t]);
    orient(gw, [sx, 0, 0]);
    boxUV(gw, 2);
    P.add(M.plaster, gw);
  }
  // back windows
  P.add(M.win, winPlane('shojiDim', 1.2, 1.1, [1.3, base + 1.6, -hd - 0.02], Math.PI));
  P.add(M.win, winPlane('shoji', 1.4, 0.9, [-1.2, f1 + 1.1, -hd - 0.02], Math.PI));
  // --- lantern + sugidama ---
  const lg = chochinGeometry({ color: 'shop', text: shop, size: 0.8, detail: 'low' });
  P.add(M.lamp, xf(lg, [-0.95, f1 - 0.2, zf + 0.55], [0, (r() - 0.5) * 0.3, 0]));
  P.add(M.lamp, xf(solidUV(cyl(0.004, 0.004, 0.2, 3, true), LUV.cord), [-0.95, f1 - 0.1, zf + 0.55]));
  if (shop === '酒') {
    const sg = remapUV(lumpy(sphere(0.3, 12, 9), r, 0.12), DECO.sugidama);
    P.add(M.deco, xf(sg, [-2.35, 2.25, zf + 0.7]));
    P.add(M.lamp, xf(solidUV(cyl(0.006, 0.006, 0.45, 3, true), LUV.cord), [-2.35, 2.75, zf + 0.7]));
  }
  P.build(g, { cast: (m) => m !== M.win });
  g.userData.collider = { type: 'box', w: W + 0.3, d: D + 0.3 };
  g.userData.shop = shop;
  return g;
}

// ===========================================================================
// 7. 浴衣の人 festival goer
// ===========================================================================
const PERSON_KINDS = {
  woman: { headR: 0.158, shY: 1.16, hemY: 0.11, bodyR: 0.165, obiF: 0.72, obiH: 0.17, pats: [0, 2, 7, 1, 8, 9, 10, 14], obis: ['red', 'yellow', 'pink', 'navy', 'cream', 'purple'], hair: [0, 1, 2], face: 0, shoulder: [0.94, 0.78] },
  man: { headR: 0.16, shY: 1.26, hemY: 0.1, bodyR: 0.185, obiF: 0.6, obiH: 0.1, pats: [3, 4, 1, 11, 12, 13], obis: ['navy', 'grey', 'brown', 'dark', 'olive'], hair: [2, 0, 1], face: 1, shoulder: [1.0, 0.86] },
  girl: { headR: 0.146, shY: 0.72, hemY: 0.1, bodyR: 0.13, obiF: 0.66, obiH: 0.12, pats: [5, 2, 6, 0, 14, 15, 10], obis: ['red', 'pink', 'yellow', 'lilac'], hair: [0, 3], face: 2, shoulder: [0.95, 0.8] },
  boy: { headR: 0.142, shY: 0.68, hemY: 0.17, bodyR: 0.13, obiF: 0.6, obiH: 0.08, pats: [6, 4, 13, 15, 12], obis: ['navy', 'red', 'yellow', 'sky'], hair: [2, 3], face: 3, shoulder: [1.0, 0.84] },
};

function personBodyR(K, f) {
  const F = [[0, 1.0], [0.1, 0.96], [0.35, 0.92], [0.55, 0.97], [0.7, 0.9], [0.84, 0.96], [0.95, K.shoulder[0]], [1.0, K.shoulder[1]]];
  for (let i = 1; i < F.length; i++) {
    if (f <= F[i][0]) { const t = (f - F[i - 1][0]) / (F[i][0] - F[i - 1][0]); return K.bodyR * (F[i - 1][1] + (F[i][1] - F[i - 1][1]) * t); }
  }
  return K.bodyR * F[F.length - 1][1];
}

/**
 * Festival goer in yukata (chibi proportions, ≈1.0–1.65 m, ≤ 1.2k tris, ONE shared material).
 * seed picks kind (woman / man / girl / boy), yukata pattern, obi, hair and accessories
 * (uchiwa, goldfish bag, fox mask on the side of the head, candy apple, cotton candy bag).
 * Optional overrides: kind, pattern (0-7).
 */
export function createFestivalPerson({ seed = 1, kind = null, pattern = null, lit = true } = {}) {
  const r = rng(seed * 101 + 7);
  r(); r();
  const kinds = ['woman', 'woman', 'man', 'man', 'girl', 'boy', 'woman', 'man', 'girl', 'boy'];
  const kname = PERSON_KINDS[kind] ? kind : kinds[Math.floor(r() * kinds.length)];
  const K = PERSON_KINDS[kname];
  const pat = pattern != null ? pattern % 16 : K.pats[Math.floor(r() * K.pats.length)];
  const obi = K.obis[Math.floor(r() * K.obis.length)];
  const hairCell = K.hair[Math.floor(r() * K.hair.length)];
  const kid = kname === 'girl' || kname === 'boy';
  const sw = (geo, name) => solidUV(geo, PEOPLE.sw(name));
  const parts = [];
  const add = (geo) => { parts.push(geo); return geo; };
  // --- body (lathe, elliptical) ---
  const pts = [[0.02, K.hemY + 0.05]];
  for (const f of [0, 0.3, 0.55, 0.7, 0.84, 0.95, 1.0]) pts.push([personBodyR(K, f), K.hemY + f * (K.shY - K.hemY)]);
  pts.push([K.bodyR * 0.42, K.shY + 0.035], [K.bodyR * 0.3, K.shY + 0.05]);
  const body = remapUV(lathe(pts, 11), PEOPLE.yukata(pat));
  body.scale(1, 1, 0.8);
  add(body);
  // --- obi ---
  const oy = K.hemY + K.obiF * (K.shY - K.hemY);
  const orad = personBodyR(K, K.obiF) * 1.07 + 0.006;
  const ob = cyl(orad, orad, K.obiH, 11, true);
  ob.scale(1, 1, 0.82);
  add(xf(sw(ob, obi), [0, oy, 0]));
  if (kname === 'woman') {
    const cord = cyl(orad + 0.006, orad + 0.006, 0.018, 11, true);
    cord.scale(1, 1, 0.82);
    add(xf(sw(cord, ['red', 'green', 'white', 'yellow'][Math.floor(r() * 4)]), [0, oy - 0.01, 0]));
  }
  const zb = -orad * 0.82;
  if (kname === 'woman' || kid) {
    const lobe = sphere(1, 6, 4);
    const lw = kid ? 0.1 : 0.12, lh = kid ? 0.085 : 0.075;
    for (const sx of [-1, 1]) add(xf(sw(lobe.clone(), obi), [sx * lw * 0.75, oy + 0.02, zb - 0.04], [0, 0, sx * 0.25], [lw, lh, 0.045]));
    add(xf(sw(box(0.06, 0.1, 0.05), obi), [0, oy + 0.01, zb - 0.05]));
    add(xf(sw(box(0.07, kid ? 0.2 : 0.15, 0.02), obi), [0.02, oy - 0.1, zb - 0.045], [0.12, 0, -0.1]));
  } else {
    add(xf(sw(box(0.07, 0.055, 0.04), obi), [0.03, oy, zb - 0.025]));
    add(xf(sw(box(0.04, 0.11, 0.015), obi), [0.05, oy - 0.07, zb - 0.02], [0.1, 0, 0.3]));
  }
  // --- head ---
  const hr = K.headR;
  const neckTop = K.shY + 0.06;
  const hy = neckTop + hr * 0.82;
  add(xf(sw(cyl(0.04, 0.045, 0.1, 7, true), 'skin'), [0, K.shY + 0.03, 0]));
  const head = remapUV(new THREE.SphereGeometry(hr, 11, 8), PEOPLE.face(K.face));
  add(xf(head, [0, hy, 0]));
  const cap = remapUV(new THREE.SphereGeometry(hr * 1.07, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.56), PEOPLE.hair(hairCell));
  cap.rotateX(-0.5);
  add(xf(cap, [0, hy + hr * 0.02, -hr * 0.02]));
  if (kname === 'woman') {
    add(xf(remapUV(sphere(1, 7, 5), PEOPLE.hair(hairCell)), [0, hy + hr * 0.62, -hr * 0.78], [0, 0, 0], [0.08, 0.07, 0.07]));
    add(xf(sw(sphere(0.024, 6, 4), 'kanzashi'), [hr * 0.45, hy + hr * 0.78, -hr * 0.62]));
    add(xf(sw(sphere(0.018, 6, 4), 'red'), [hr * 0.6, hy + hr * 0.66, -hr * 0.55]));
    add(xf(sw(cyl(0.004, 0.004, 0.08, 3, true), 'gold'), [hr * 0.52, hy + hr * 0.6, -hr * 0.62], [0.3, 0, 0.9]));
  } else if (kname === 'girl') {
    for (const sx of [-1, 1]) add(xf(remapUV(sphere(1, 7, 4), PEOPLE.hair(hairCell)), [sx * hr * 0.68, hy + hr * 0.62, -hr * 0.25], [0, 0, 0], [0.058, 0.058, 0.058]));
    add(xf(sw(box(0.09, 0.04, 0.02), 'ribbon'), [hr * 0.7, hy + hr * 0.2, -hr * 0.3], [0, 0.6, 0.3]));
  }
  // --- arms: pose + items ---
  const items = { right: null, left: null, mask: false };
  const x = r();
  if (kname === 'woman') { if (x < 0.45) items.right = 'uchiwa'; else if (x < 0.6) items.right = 'apple'; if (r() < 0.3) items.left = 'bag'; items.mask = r() < 0.22; }
  else if (kname === 'man') { if (x < 0.45) items.right = 'uchiwa'; items.mask = r() < 0.18; if (r() < 0.15) items.left = 'bag'; }
  else if (kname === 'girl') { if (x < 0.35) items.right = 'apple'; else if (x < 0.6) items.right = 'candy'; if (r() < 0.5) items.left = 'bag'; items.mask = r() < 0.35; }
  else { if (x < 0.3) items.right = 'apple'; else if (x < 0.5) items.right = 'uchiwa'; if (r() < 0.3) items.left = 'bag'; items.mask = r() < 0.45; }
  const plain = PEOPLE.yukataPlain(pat);
  const sc = kid ? 0.72 : 1;
  for (const side of [1, -1]) {
    const item = side > 0 ? items.right : items.left;
    const hold = !!item && item !== 'bag' ? true : r() < 0.35;
    const S = V3(side * K.bodyR * 0.92, K.shY - 0.03, 0);
    const Wr = hold ? V3(side * K.bodyR * 0.72, oy + 0.02 * sc, K.bodyR * 1.05) : V3(side * (K.bodyR + 0.035), oy - 0.12 * sc, 0.04);
    const E = V3(side * (K.bodyR + 0.05 * sc), (S.y + Wr.y) / 2 - 0.02, hold ? 0.0 : 0.0);
    add(remapUV(cylBetween(S, E, 0.052 * sc + 0.006, 6, true), plain));
    add(remapUV(cylBetween(E, Wr, 0.047 * sc + 0.005, 6, true), plain));
    // hanging sleeve (tamoto)
    const mid = E.clone().lerp(Wr, 0.35);
    const sl = remapUV(box(0.035, 0.26 * sc, 0.2 * sc), plain);
    const ang = Math.atan2(Wr.x - E.x, Wr.z - E.z);
    add(xf(sl, [mid.x + side * 0.012, mid.y - 0.1 * sc, mid.z], [0, ang, 0]));
    add(xf(sw(sphere(0.036 * (kid ? 0.85 : 1), 5, 4), 'skin'), [Wr.x, Wr.y, Wr.z + 0.02]));
    // held items
    const hx = Wr.x, hyy = Wr.y, hz = Wr.z + 0.03;
    if (item === 'uchiwa') {
      const u = remapUV(cyl(0.1 * (kid ? 0.8 : 1), 0.1 * (kid ? 0.8 : 1), 0.006, 10), PEOPLE.uchiwa(Math.floor(r() * 3)));
      u.rotateX(Math.PI / 2);
      add(xf(u, [hx + side * 0.03, hyy + 0.17 * sc, hz + 0.02], [-0.25, side * 0.35, side * 0.2]));
      add(xf(sw(box(0.016, 0.12 * sc, 0.01), 'wood'), [hx + side * 0.01, hyy + 0.04, hz + 0.01], [0, 0, side * 0.2]));
    } else if (item === 'apple') {
      add(xf(sw(cyl(0.004, 0.004, 0.16, 3, true), 'cream'), [hx, hyy + 0.06, hz]));
      add(xf(sw(sphere(0.042, 7, 5), 'red'), [hx, hyy + 0.16, hz]));
    } else if (item === 'candy') {
      add(xf(remapUV(box(0.13, 0.19, 0.05), PEOPLE.candy), [hx, hyy - 0.07, hz + 0.02]));
    } else if (item === 'bag') {
      const bag = lathe([[0.001, 0], [0.045, 0.01], [0.062, 0.05], [0.058, 0.1], [0.024, 0.15], [0.012, 0.165], [0.001, 0.17]], 7);
      add(xf(remapUV(bag, PEOPLE.bag), [hx, hyy - 0.27 * sc, hz - 0.01]));
      add(xf(sw(cyl(0.003, 0.003, 0.1, 3, true), 'hanao'), [hx, hyy - 0.07, hz - 0.01]));
    }
  }
  // fox mask on the side of the head
  if (items.mask) {
    const shell = new THREE.SphereGeometry(0.075 * (kid ? 0.9 : 1), 7, 5, Math.PI / 2 - 1.2, 2.4, 0.42, 2.25);
    remapUV(shell, PEOPLE.fox);
    shell.scale(1, 1.25, 0.55);
    const mx = hr * 0.93;
    add(xf(shell, [mx, hy + hr * 0.12, -hr * 0.1], [0, Math.PI / 2 - 0.25, -0.35]));
    for (const dz of [-0.04, 0.04]) add(xf(sw(new THREE.ConeGeometry(0.02, 0.05, 4), 'white'), [mx + 0.01, hy + hr * 0.12 + 0.1, -hr * 0.1 + dz], [0, 0, -0.35]));
  }
  // --- legs + geta ---
  for (const sx of [-1, 1]) {
    const lx = sx * K.bodyR * 0.36;
    add(xf(sw(cyl(0.03, 0.028, K.hemY + 0.02, 5, true), 'skin'), [lx, 0.065 + (K.hemY + 0.02) / 2 - 0.01, 0.01]));
    add(xf(sw(box(0.08, 0.028, 0.19 * (kid ? 0.85 : 1)), 'wood'), [lx, 0.044, 0.03]));
    for (const dz of [-0.045, 0.06]) add(xf(sw(box(0.07, 0.03, 0.025), 'wood'), [lx, 0.015, 0.03 + dz * (kid ? 0.85 : 1)]));
    add(xf(sw(box(0.016, 0.02, 0.07), 'hanao'), [lx, 0.09, 0.07]));
  }
  const g = new THREE.Group();
  g.name = 'festivalPerson';
  addMesh(g, merge(parts), peopleMat(lit));
  g.userData.kind = kname;
  g.userData.collider = { type: 'circle', r: kid ? 0.22 : 0.28 };
  return g;
}

// ===========================================================================
// 8. のぼり旗 nobori banner
// ===========================================================================
/** Tall vertical banner: ≈4 m pole, 0.6 × 2.4 m cloth with bold vertical text. color: red | white | indigo | yellow | green | pink | sky */
export function createNobori({ text = '祭', color = null, lit = true, seed = 1 } = {}) {
  const r = rng(seed * 5 + 1);
  const cols = Object.keys(NOBORI_COLORS);
  const col = color && NOBORI_COLORS[color] ? color : cols[Math.floor(r() * cols.length)];
  const g = new THREE.Group();
  g.name = 'nobori';
  const P = new Parts();
  const pole = getMat('woodLight'), black = getMat('paintBlack');
  P.add(pole, xf(boxUV(cyl(0.022, 0.027, 4.0, 8), 1, 'y'), [0, 2.0, 0]));
  P.add(pole, xf(sphere(0.03, 8, 6), [0, 4.02, 0]));
  P.add(pole, xf(boxUV(cyl(0.014, 0.014, 0.68, 6), 1, 'y'), [0.34, 3.8, 0], [0, 0, Math.PI / 2]));
  P.add(black, xf(cyl(0.2, 0.25, 0.14, 14), [0, 0.07, 0]));
  P.add(black, xf(cyl(0.05, 0.065, 0.22, 10), [0, 0.25, 0]));
  const ph = r() * 6;
  const cl = surface(4, 12, (s, t) => {
    const x = 0.035 + s * 0.6, y = 1.36 + t * 2.4;
    const z = 0.035 * Math.sin(s * Math.PI * 0.9) * Math.sin(t * 3.2 + ph) + 0.03 * s * Math.sin(t * 5.5 + ph);
    return [x, y, z];
  }, (s, t) => [s, t]);
  P.add(noboriMat(text, col, lit), cl);
  P.build(g);
  g.userData.collider = { type: 'circle', r: 0.3 };
  return g;
}

// ===========================================================================
// 10. 竹灯り bamboo lights
// ===========================================================================
function bambooTube(h, rad, cell, slopeDir, rnd) {
  const k = 0.75 + rnd() * 0.25; // cut slope (tan)
  const cutY = (x, z) => h + k * (x * Math.cos(slopeDir) + z * Math.sin(slopeDir));
  const nodes = [];
  for (let y = 0.18 + rnd() * 0.1; y < h - 0.16; y += 0.26 + rnd() * 0.08) nodes.push(y);
  const pts = [[rad, 0]];
  for (const y of nodes) pts.push([rad, y - 0.012], [rad + 0.005, y], [rad, y + 0.012]);
  pts.push([rad, h]);
  const outer = lathe(pts, 14);
  remapUV(outer, TAKE.cell(cell));
  const inner = lathe([[rad - 0.008, h], [rad - 0.008, 0.03]], 14, false);
  solidUV(inner, TAKE.inner);
  for (const geo of [outer, inner]) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - h) < 1e-5) pos.setY(i, cutY(pos.getX(i), pos.getZ(i)));
    pos.needsUpdate = true;
  }
  const rim = surface(14, 1, (s, t) => {
    const a = Math.PI + s * Math.PI * 2;
    const rr = rad - 0.008 * t;
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    return [x, cutY(x, z) + 0.0005, z];
  }, () => TAKE.cut);
  orient(rim, [0, 1, 0]);
  const floor = new THREE.CircleGeometry(rad - 0.008, 10);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0.03, 0);
  solidUV(floor, TAKE.inner);
  return merge([outer, inner, rim, floor]);
}

/** 竹灯り: cluster of cut bamboo tubes with glowing patterned holes (lit) + pebbles + straw rope. */
export function createTakeAkari({ count = 5, lit = true, seed = 1 } = {}) {
  const r = rng(seed * 3 + 2);
  const g = new THREE.Group();
  g.name = 'takeAkari';
  const P = new Parts();
  const T = takeMat(lit), stone = rockMat(), lamp = lanternMat(lit);
  const n = Math.max(1, Math.min(12, count));
  let maxR = 0.3;
  for (let i = 0; i < n; i++) {
    const rad = 0.055 + r() * 0.03;
    const ang = i * 2.39996 + r() * 0.4;
    const d = i === 0 ? 0 : 0.14 + Math.sqrt(i) * 0.09 + r() * 0.04;
    const h = (i === 0 ? 0.95 : 0.4 + r() * 0.5) + r() * 0.15;
    const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
    maxR = Math.max(maxR, d + rad);
    const tubeGeo = bambooTube(h, rad, i % 4, Math.PI / 2 + (r() - 0.5) * 1.2, r);
    tubeGeo.rotateY(r() * 6.28);
    P.add(T, xf(tubeGeo, [x, 0, z]));
    if (i < 3) {
      const rope = new THREE.TorusGeometry(rad + 0.006, 0.008, 4, 14);
      rope.rotateX(Math.PI / 2);
      P.add(lamp, xf(solidUV(rope, LUV.rope), [x, 0.2 + r() * 0.1, z]));
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.5, d = maxR + 0.06 + r() * 0.08;
    P.add(stone, xf(boxUV(rock(0.05 + r() * 0.05, r, 0, 0.6, 0.3), 0.3), [Math.cos(a) * d, 0.015, Math.sin(a) * d], [0, r() * 6, 0]));
  }
  P.build(g, { cast: (m) => m !== lamp });
  g.userData.collider = { type: 'circle', r: maxR + 0.15 };
  return g;
}

// ===========================================================================
// 11. 温泉街の街灯 street lamp
// ===========================================================================
/** Onsen-town gas-lamp style street lamp ≈3.2 m: stone foot, cast-iron post, 4-pane glowing lantern with a flared roof. */
export function createStreetLamp({ lit = true, seed = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'streetLamp';
  const P = new Parts();
  const iron = ironMat(), glass = lampGlassMat(lit), stone = getMat('stone');
  P.add(stone, xf(boxUV(rbox(0.44, 0.2, 0.44, 0.03), 0.8), [0, 0.1, 0]));
  P.add(iron, lathe([[0.001, 0.2], [0.16, 0.2], [0.16, 0.25], [0.13, 0.28], [0.1, 0.4], [0.075, 0.52], [0.088, 0.56], [0.088, 0.6], [0.062, 0.62], [0.001, 0.62]], 14));
  P.add(iron, xf(cyl(0.05, 0.058, 1.72, 12), [0, 0.62 + 0.86, 0]));
  for (const y of [1.5, 2.15]) P.add(iron, xf(new THREE.TorusGeometry(0.056, 0.012, 5, 14), [0, y, 0], [Math.PI / 2, 0, 0]));
  P.add(iron, lathe([[0.05, 2.3], [0.07, 2.34], [0.16, 2.38], [0.2, 2.4], [0.2, 2.43], [0.001, 2.43]], 12));
  const by = 2.43, bh = 0.42, hs = 0.165;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add(iron, xf(box(0.03, bh, 0.03), [sx * hs, by + bh / 2, sz * hs]));
  P.add(iron, xf(rbox(0.4, 0.035, 0.4, 0.012), [0, by + 0.015, 0]));
  P.add(iron, xf(rbox(0.42, 0.04, 0.42, 0.012), [0, by + bh + 0.01, 0]));
  for (let k = 0; k < 4; k++) {
    const pl = remapUV(new THREE.PlaneGeometry(0.3, bh - 0.04), k % 2 === 0 ? LAMPGLASS.text : LAMPGLASS.plain);
    pl.translate(0, 0, hs - 0.004);
    pl.rotateY((k * Math.PI) / 2);
    P.add(glass, xf(pl, [0, by + bh / 2, 0]));
  }
  const roof = japaneseRoof({ type: 'hip', W: 0.62, D: 0.62, rise: 0.19, curve: 0.5, sweep: 0.04, sweepLen: 0.12, sweepDepth: 0.1, thick: 0.025, soffit: 0.12, segU: 4, segV: 3, tile: 0.5, hips: false });
  for (const k of ['top', 'under']) P.add(iron, xf(roof[k], [0, by + bh + 0.03, 0]));
  P.add(iron, lathe([[0.001, 0], [0.035, 0.02], [0.042, 0.05], [0.022, 0.09], [0.004, 0.12], [0.001, 0.125]], 10).translate(0, by + bh + 0.03 + 0.18, 0));
  P.build(g, { cast: (m) => m !== glass });
  g.userData.collider = { type: 'circle', r: 0.25 };
  return g;
}

// ===========================================================================
// 12. 縁台 + 野点傘 nodate bench
// ===========================================================================
/** Red-felt bench (縁台) with a tea tray + a big red 野点傘 parasol (≈3 m) behind it. */
export function createNodateBench({ lit = true, seed = 1 } = {}) {
  const r = rng(seed * 9 + 4);
  const g = new THREE.Group();
  g.name = 'nodateBench';
  const P = new Parts();
  const wood = getMat('wood'), felt = feltMat(lit), paper = parasolMat(lit), bamboo = getMat('woodLight'), goods = goodsMat(false);
  // bench
  P.add(wood, xf(boxUV(rbox(1.8, 0.05, 0.6, 0.012), 1, 'x'), [0, 0.395, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add(wood, xf(boxUV(rbox(0.07, 0.37, 0.07, 0.012), 1, 'y'), [sx * 0.78, 0.185, sz * 0.23]));
  for (const sz of [-1, 1]) P.add(wood, xf(boxUV(box(1.5, 0.06, 0.04), 1, 'x'), [0, 0.13, sz * 0.23]));
  for (const sx of [-1, 1]) P.add(wood, xf(boxUV(box(0.04, 0.06, 0.42), 1, 'z'), [sx * 0.78, 0.13, 0]));
  // felt (毛氈): top + drapes front / back
  P.add(felt, xf(boxUV(rbox(1.84, 0.014, 0.62, 0.006), 0.5), [0, 0.426, 0]));
  for (const sz of [-1, 1]) {
    const dr = cloth({ w: 1.84, h: 0.17, nx: 10, ny: 1, amp: 0.008, wave: 0.3, swing: 0.02 });
    scaleUV(dr, 3.6, 0.35);
    dr.translate(0, 0.43, 0.312);
    if (sz < 0) dr.rotateY(Math.PI);
    P.add(felt, dr);
  }
  // tea tray: two cups of matcha + 三色団子
  P.add(goods, xf(gSolid(rbox(0.38, 0.022, 0.26, 0.008), 'black'), [0.42, 0.444, 0.04], [0, 0.15, 0]));
  const cup = lathe([[0.001, 0], [0.03, 0], [0.042, 0.02], [0.046, 0.06], [0.041, 0.062], [0.036, 0.024], [0.001, 0.02]], 10);
  for (const [dx, dz] of [[0.34, 0.08], [0.46, -0.02]]) {
    P.add(goods, xf(gSolid(cup.clone(), 'cream'), [dx, 0.455, dz]));
    P.add(goods, xf(gSolid(new THREE.CircleGeometry(0.036, 10).rotateX(-Math.PI / 2), 'green'), [dx, 0.502, dz]));
  }
  P.add(goods, xf(gSolid(cyl(0.07, 0.06, 0.012, 12), 'white'), [0.56, 0.462, 0.1]));
  P.add(goods, xf(gSolid(cyl(0.003, 0.003, 0.16, 3, true), 'stick'), [0.56, 0.49, 0.1], [0, 0.4, Math.PI / 2]));
  ['pink', 'white', 'green'].forEach((c, i) => P.add(goods, xf(gSolid(sphere(0.019, 7, 5), c), [0.52 + i * 0.037, 0.49, 0.1 - i * 0.015])));
  // parasol
  const pz = -0.52, apex = 2.98;
  P.add(bamboo, xf(boxUV(cyl(0.024, 0.028, apex - 0.02, 8), 1, 'y'), [0, (apex - 0.02) / 2, pz]));
  P.add(wood, xf(boxUV(box(0.5, 0.08, 0.08), 1, 'x'), [0, 0.04, pz]));
  P.add(wood, xf(boxUV(box(0.08, 0.08, 0.5), 1, 'z'), [0, 0.04, pz]));
  const prof = [[1.32, apex - 0.46], [1.0, apex - 0.3], [0.65, apex - 0.17], [0.32, apex - 0.07], [0.1, apex - 0.015], [0.001, apex]];
  const can = lathe(prof, 64);
  const nR = 32;
  {
    const pos = can.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), rr = Math.hypot(x, z);
      const a = Math.atan2(x, z) + Math.PI * 2;
      const f = ((a / (Math.PI * 2)) * nR) % 1;
      pos.setY(i, pos.getY(i) - 0.022 * Math.sin(Math.PI * f) * Math.min(1, rr / 1.32));
    }
    pos.needsUpdate = true;
    can.computeVertexNormals();
  }
  P.add(paper, xf(can, [0, 0, pz]));
  P.add(bamboo, xf(cyl(0.06, 0.07, 0.05, 10), [0, apex + 0.005, pz]));
  // ribs (under the canopy) + stretchers from the runner
  const runnerY = 2.2;
  P.add(bamboo, xf(cyl(0.05, 0.05, 0.1, 10), [0, runnerY, pz]));
  const yAtR = (rr) => {
    for (let i = 1; i < prof.length; i++) {
      const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
      if (rr <= r0 && rr >= r1) return y0 + ((rr - r0) / (r1 - r0)) * (y1 - y0);
    }
    return apex;
  };
  for (let i = 0; i < nR; i++) {
    const a = (i / nR) * Math.PI * 2;
    const dir = (rr, y) => V3(Math.sin(a) * rr, y, pz + Math.cos(a) * rr);
    const p0 = dir(0.06, yAtR(0.06) - 0.03), p1 = dir(0.7, yAtR(0.7) - 0.028), p2 = dir(1.3, yAtR(1.3) - 0.02);
    P.add(bamboo, beamBetween(p0, p1, 0.012, 0.01));
    P.add(bamboo, beamBetween(p1, p2, 0.012, 0.01));
    P.add(bamboo, beamBetween(dir(0.05, runnerY + 0.03), dir(0.55, yAtR(0.55) - 0.03), 0.008, 0.008));
  }
  P.build(g);
  g.userData.collider = { type: 'box', w: 1.9, d: 0.7 };
  return g;
}

// ===========================================================================
// 13. 湯けむり onsen steam vent
// ===========================================================================
/** Small stone-lined hot-spring outlet (≈2 m across): ring of rocks, milky water, mineral crust, bamboo spout. Steam is added by the engine at group.userData.steamPoint. */
export function createOnsenSteamVent({ seed = 1 } = {}) {
  const r = rng(seed * 11 + 3);
  const g = new THREE.Group();
  g.name = 'onsenSteamVent';
  const P = new Parts();
  const rockM = rockMat(), water = onsenWaterMat(), crust = crustMat(), bamboo = getMat('bamboo'), wood = getMat('woodDark');
  const wy = 0.1;
  const wgeo = new THREE.CircleGeometry(0.8, 32);
  wgeo.rotateX(-Math.PI / 2);
  P.add(water, xf(wgeo, [0, wy, 0]));
  const ring = new THREE.RingGeometry(0.66, 0.92, 32, 1);
  ring.rotateX(-Math.PI / 2);
  P.add(crust, xf(ring, [0, wy + 0.004, 0]));
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.25;
    const size = 0.17 + r() * 0.12;
    const d = 0.86 + r() * 0.08 + size * 0.2;
    const rk = rock(size, r, 1, 0.6 + r() * 0.3, 0.3);
    boxUV(rk, 0.8);
    P.add(rockM, xf(rk, [Math.cos(a) * d, size * 0.22, Math.sin(a) * d], [0, r() * 6, 0]));
  }
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2, d = 1.12 + r() * 0.2, size = 0.08 + r() * 0.07;
    const rk = boxUV(rock(size, r, 0, 0.6, 0.3), 0.8);
    P.add(rockM, xf(rk, [Math.cos(a) * d, size * 0.15, Math.sin(a) * d], [0, r() * 6, 0]));
  }
  // bamboo spout from a wooden post
  P.add(wood, xf(boxUV(rbox(0.1, 0.72, 0.1, 0.015), 1, 'y'), [1.12, 0.36, -0.52]));
  P.add(bamboo, cylBetween([1.16, 0.62, -0.54], [0.5, 0.36, -0.24], 0.035, 10, false));
  P.add(water, cylBetween([0.48, 0.35, -0.23], [0.4, wy, -0.19], 0.012, 6, true));
  P.build(g);
  g.userData.collider = { type: 'circle', r: 1.15 };
  g.userData.steamPoint = [0, wy, 0];
  return g;
}

// ===========================================================================
// 14. 提灯の木橋 lantern bridge
// ===========================================================================
/**
 * Flat wooden footbridge spanning along Z (decorative), deck top at y = 0.3, piers reach y = -2.8.
 * Railings with bronze giboshi; bamboo poles carry lantern strings along both railings.
 */
export function createWoodenBridgeLanterned({ length = 16, width = 4, lit = true, seed = 1 } = {}) {
  const r = rng(seed * 19 + 5);
  const g = new THREE.Group();
  g.name = 'lanternBridge';
  const P = new Parts();
  const wood = yaguraWoodMat(lit), dark = buildingWoodMat('dark', lit), brass = getMat('brass'), lamp = lanternMat(lit), bamboo = getMat('bamboo');
  const L = Math.max(4, length), hw = Math.max(1.5, width) / 2, dy = 0.3;
  const rx = hw - 0.08;
  P.add(wood, xf(boxUV(box(hw * 2, 0.1, L), 1, 'x'), [0, dy - 0.05, 0]));
  for (const sx of [-1, 1]) {
    P.add(wood, xf(boxUV(rbox(0.16, 0.14, L + 0.1, 0.02), 1, 'z'), [sx * rx, dy + 0.07, 0]));
    P.add(dark, xf(boxUV(box(0.22, 0.34, L), 1, 'z'), [sx * (hw - 0.35), dy - 0.27, 0]));
  }
  for (let z = -L / 2 + 0.5; z <= L / 2 - 0.4; z += 1.5) P.add(dark, xf(boxUV(box(hw * 2 - 0.2, 0.1, 0.12), 1, 'x'), [0, dy - 0.15, z]));
  // piers
  const nP = Math.max(1, Math.round(L / 4));
  for (let k = 0; k < nP; k++) {
    const z = -L / 2 + ((k + 0.5) / nP) * L;
    const px = hw - 0.5;
    for (const sx of [-1, 1]) P.add(dark, xf(boxUV(cyl(0.13, 0.15, 3.0, 8), 1, 'y'), [sx * px, dy - 0.44 - 1.5, z]));
    P.add(dark, xf(boxUV(box(hw * 2 - 0.3, 0.2, 0.3), 1, 'x'), [0, dy - 0.54, z]));
    P.add(dark, xf(boxUV(box(hw * 2 - 0.9, 0.14, 0.18), 1, 'x'), [0, -1.3, z]));
    for (const s of [-1, 1]) P.add(dark, boxUV(beamBetween([s * px, dy - 0.7, z], [-s * px, -1.25, z], 0.1, 0.1), 1, 'y'));
  }
  // railings
  const nPost = Math.max(2, Math.round(L / 2) + 1);
  const railTop = dy + 0.92;
  for (const sx of [-1, 1]) {
    for (let k = 0; k < nPost; k++) {
      const z = -L / 2 + 0.12 + (k / (nPost - 1)) * (L - 0.24);
      const end = k === 0 || k === nPost - 1;
      if (end) {
        P.add(dark, xf(boxUV(rbox(0.2, 1.2, 0.2, 0.03), 1, 'y'), [sx * rx, dy + 0.6, z]));
        P.add(brass, lathe([[0.001, 0], [0.1, 0.0], [0.1, 0.05], [0.07, 0.07], [0.09, 0.13], [0.07, 0.2], [0.03, 0.26], [0.012, 0.31], [0.001, 0.33]], 10).translate(sx * rx, dy + 1.2, z));
      } else {
        P.add(dark, xf(boxUV(box(0.11, railTop - dy + 0.02, 0.11), 1, 'y'), [sx * rx, (dy + railTop) / 2, z]));
      }
    }
    P.add(wood, xf(boxUV(cyl(0.045, 0.045, L - 0.3, 8), 1, 'y'), [sx * rx, railTop, 0], [Math.PI / 2, 0, 0]));
    P.add(wood, xf(boxUV(box(0.06, 0.1, L - 0.3), 1, 'z'), [sx * rx, dy + 0.52, 0]));
    // bamboo lantern poles + strings
    const nPole = Math.max(2, Math.round(L / 5.2) + 1);
    const poleTop = dy + 2.7;
    let prev = null;
    for (let k = 0; k < nPole; k++) {
      const z = -L / 2 + 0.3 + (k / (nPole - 1)) * (L - 0.6);
      const x = sx * (hw + 0.02);
      P.add(bamboo, xf(cyl(0.028, 0.032, poleTop - dy + 0.1, 8), [x, (dy + poleTop) / 2, z]));
      const top = V3(x, poleTop - 0.08, z);
      if (prev) P.add(lamp, lanternStringGeometry({ a: prev, b: top, count: 3, sag: 0.36, colors: k % 2 ? ['red', 'white', 'red'] : ['white', 'red', 'white'], texts: ['祭'], size: 0.85, seed: seed * 7 + k * 3 + (sx > 0 ? 1 : 0), tStart: 0.22, tEnd: 0.78 }));
      prev = top;
    }
  }
  P.build(g, { cast: (m) => m !== lamp });
  g.userData.collider = { type: 'box', w: hw * 2 + 0.2, d: L };
  g.userData.deckY = dy;
  return g;
}

// ===========================================================================
// Bonus: a small crowd cluster (all people merged; one material)
// ===========================================================================
/** Cluster of `count` festival goers scattered within `radius` m (merged into one mesh). */
export function createFestivalCrowd({ count = 8, radius = 2.2, lit = true, seed = 1 } = {}) {
  const r = rng(seed * 23 + 9);
  const g = new THREE.Group();
  g.name = 'festivalCrowd';
  const pts = [];
  const geos = [];
  for (let i = 0; i < count; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
      x = Math.cos(a) * d; z = Math.sin(a) * d;
      if (pts.every(([px, pz]) => Math.hypot(px - x, pz - z) > 0.55)) break;
    }
    pts.push([x, z]);
    const p = createFestivalPerson({ seed: seed * 97 + i * 13 + 1 });
    const m = p.children[0];
    const geo = m.geometry.clone();
    geo.rotateY((r() - 0.5) * 2.4 + (r() < 0.3 ? Math.PI : 0));
    geo.translate(x, 0, z);
    geos.push(geo);
  }
  addMesh(g, merge(geos), peopleMat(lit));
  g.userData.collider = { type: 'circle', r: radius + 0.3 };
  return g;
}
