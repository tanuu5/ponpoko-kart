// ぽんぽこカート — shrine / temple / spring props.
// Mainly for course 2 "桜咲く千本鳥居" (spring mountain shrine), reused in other courses.
// Conventions: meters, +Y up, origin at ground center, front faces +Z. Gates/bridges: passage along Z.
// Static props return a THREE.Group whose meshes are already merged per material.
import * as THREE from 'three';
import { getMat, mat } from './materials.js';
import { rng } from './util.js';
import {
  Builder, T, bevelBox, box, cylY, lathe, tube, sweep, blob, hipRoof, gableRoof,
  giboshiGeo, extrudeShape, faceBoxUV, paint, polysGeo, PI, TAU, lerp, V3, range,
  chamferRect, beamX, beamZ, postY,
} from './shrine-geo.js';
import { SM } from './shrine-tex.js';

export { createSakuraTree, createWeepingSakura, createPine, createGoshinboku } from './shrine-trees.js';
export { createShrineHall, createPagoda, createCastle } from './shrine-arch.js';

// ---------------------------------------------------------------------------
// 1. 鳥居 Torii
// ---------------------------------------------------------------------------
/**
 * createTorii({style:'myojin'|'shinmei', material:'vermilion'|'stone'|'wood', height, span, plaque, seed})
 * Pillars at x = ±span/2, passage along Z, plaque faces +Z. Donor inscriptions (vermilion myōjin) on the -Z side.
 */
export function createTorii(opts = {}) {
  const { style = 'myojin', material = 'vermilion', height = 6, span = 4.5, plaque = null, seed = 1 } = opts;
  const H = height, S = span;
  const myo = style !== 'shinmei';
  const isV = material === 'vermilion';
  const isStone = material === 'stone';
  const isWood = !isV && !isStone;
  const mMain = isV ? getMat('vermilion') : isStone ? SM.granite() : getMat('woodAged');
  const mCap = isV ? getMat('blackLacquer') : mMain;
  const mBase = SM.granite();
  const b = new Builder();
  const seg = 16;
  const pr = (isStone ? 0.05 : 0.045) * H; // pillar radius at the base
  const prT = pr * (myo ? 0.88 : 0.95);
  const lean = myo ? 0.02 : 0;
  const baseH = 0.045 * H;
  const uvW = isWood ? 1.2 : 1;

  // --- heights
  let yPT; // pillar top (at pillar position)
  let kasagiY; // function x -> center y of kasagi
  let L; // kasagi length
  const kh = (myo ? 0.058 : 0.1) * H;
  const sh = 0.05 * H;
  const rise = myo ? 0.05 * H : 0;
  const nh = 0.05 * H;
  const nd = pr * 1.25;
  const yn = (myo ? 0.715 : 0.76) * H;
  const topAt = (x, halfL) => rise * Math.pow(Math.min(Math.abs(x) / halfL, 1), 2.2);
  if (myo) {
    const yMidTop = H - rise;
    const yShimakiBot0 = yMidTop - kh - sh;
    // first guess of kasagi length from pillar top positions
    const xTop = S / 2 - yShimakiBot0 * Math.sin(lean);
    L = 2 * xTop + 2 * (0.27 * S + pr);
    yPT = yShimakiBot0 + topAt(xTop, L / 2);
    kasagiY = (x) => yMidTop - kh / 2 + topAt(x, L / 2);
  } else {
    L = S + 2 * (0.2 * S + pr);
    yPT = H - kh;
    kasagiY = () => H - kh / 2;
  }
  const pxAt = (y) => S / 2 - y * Math.sin(lean); // pillar center x at height y

  // --- pillars (+ nemaki collar + daiwa ring + stone base)
  const inscr = isV && myo;
  const colName = Math.abs(seed | 0) % 4;
  for (const side of [-1, 1]) {
    const parts = [];
    const y0 = baseH + (isV ? 0.1 * H : 0);
    const rAt = (y) => lerp(pr, prT, (y - baseH) / (yPT - baseH));
    if (inscr) {
      const z0 = 0.22 * H, z1 = 0.62 * H;
      parts.push([cylY(rAt(y0), rAt(z0), y0, z0, seg, { open: true }), mMain]);
      const front = new THREE.CylinderGeometry(rAt(z1), rAt(z0), z1 - z0, seg / 2, 1, true, -PI / 2, PI);
      front.translate(0, (z0 + z1) / 2, 0);
      parts.push([front, mMain]);
      const back = new THREE.CylinderGeometry(rAt(z1), rAt(z0), z1 - z0, seg / 2, 1, true, PI / 2, PI);
      back.translate(0, (z0 + z1) / 2, 0);
      const col = side < 0 ? colName : 4 + colName;
      const uv = back.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (col + 0.2 + uv.getX(i) * 0.6) / 8);
      parts.push([back, SM.inscription()]);
      parts.push([cylY(rAt(z1), rAt(yPT), z1, yPT + 0.02, seg, { open: true }), mMain]);
    } else {
      parts.push([cylY(rAt(y0), rAt(yPT), y0, yPT + 0.02, seg, { open: true, uv: uvW }), mMain]);
    }
    if (isV) {
      // 根巻 black base collar with a lip
      const r1 = pr * 1.1, y1 = baseH + 0.1 * H, lip = 0.012 * H;
      parts.push([lathe([[r1, baseH - 0.01], [r1, y1 - lip], [r1, y1 - lip], [r1 + lip * 0.5, y1 - lip], [r1 + lip * 0.5, y1], [r1 + lip * 0.5, y1], [pr * 0.9, y1]], seg), getMat('blackLacquer')]);
    }
    if (myo && isV) {
      // 台輪 daiwa ring under the shimaki (Inari style)
      const dh = 0.03 * H, rr = prT * 1.28;
      parts.push([lathe([[prT, yPT - dh - 0.01], [rr, yPT - dh], [rr, yPT - dh], [rr, yPT], [rr, yPT], [prT * 0.5, yPT]], seg), mMain]);
    }
    for (const [g, m] of parts) {
      T(g, null, [0, 0, side * lean]);
      g.translate(side * S / 2, 0, 0);
      b.add(g, m);
    }
    // stone base (亀腹-like)
    const br = pr * (isStone ? 1.45 : 1.6);
    b.add(lathe([[br, -0.05], [br, baseH * 0.45], [br, baseH * 0.45], [br * 0.93, baseH * 0.8], [br * 0.78, baseH], [pr * 0.9, baseH]], seg, { uv: 0.8 }), mBase, { pos: [side * S / 2, 0, 0] });
  }

  if (myo) {
    // --- 笠木 kasagi (black cap, upswept) + 島木 shimaki
    const n = 18;
    const kd = pr * 2.5;
    const path = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (t * 2 - 1) * L / 2;
      path.push(V3(x, kasagiY(x), 0));
    }
    const kProf = [[-kd / 2, -kh / 2], [kd / 2, -kh / 2], [kd / 2, kh * 0.18], [kd * 0.36, kh / 2], [-kd * 0.36, kh / 2], [-kd / 2, kh * 0.18]];
    const cut = 0.45 * kh;
    b.add(sweep(path, kProf, {
      perp: false, uv: uvW,
      shiftStart: (px, py) => -(py + kh / 2) / kh * cut,
      shiftEnd: (px, py) => (py + kh / 2) / kh * cut,
    }), mCap);
    const Ls = L - 0.07 * S;
    const sd = pr * 2.15;
    const spath = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n * 2 - 1) * Ls / 2;
      spath.push(V3(x, kasagiY(x) - kh / 2 - sh / 2 + 0.005, 0));
    }
    b.add(sweep(spath, chamferRect(sd, sh, sh * 0.12), {
      perp: false, uv: uvW,
      shiftStart: (px, py) => -(py + sh / 2) / sh * cut * 0.6,
      shiftEnd: (px, py) => (py + sh / 2) / sh * cut * 0.6,
    }), mMain);
    // --- 貫 nuki passing through the pillars
    const xn = pxAt(yn);
    const Ln = 2 * xn + 2 * (0.12 * S + pr);
    b.add(beamX(-Ln / 2, Ln / 2, yn, 0, nd, nh, nh * 0.1, uvW), mMain);
    // 楔 kusabi wedges beside the pillars
    for (const side of [-1, 1]) {
      const x = side * (xn + pr * 1.28);
      b.add(bevelBox(pr * 0.34, nh * 1.18, nd * 1.12, 0.006), isV ? getMat('vermilionDark') : mMain, { pos: [x, yn, 0], cast: false });
    }
    // --- 額束 gakuzuka
    const yg0 = yn + nh / 2;
    const yg1 = kasagiY(0) - kh / 2 - sh + 0.01;
    b.add(postY(0, 0, yg0 - 0.01, yg1, pr * 1.35, nd * 0.85, 0.01, uvW), mMain);
    // --- 扁額 plaque
    if (plaque) {
      const style2 = isV ? 'lacquer' : isStone ? 'stone' : 'wood';
      const gap = yg1 - yg0;
      const ph = gap * 1.55;
      const pw = ph * 0.58;
      const pt = 0.05 * H * 0.6;
      const yc = (yg0 + yg1) / 2;
      const zc = nd * 0.42 + pt / 2 + 0.01;
      const frameMat = isV ? getMat('blackLacquer') : isStone ? SM.granite() : getMat('woodDark');
      b.add(bevelBox(pw, ph, pt, pt * 0.3), frameMat, { pos: [0, yc, zc] });
      const face = new THREE.PlaneGeometry(pw * 0.9, ph * 0.93);
      b.add(face, SM.plaque(plaque, style2), { pos: [0, yc, zc + pt / 2 + 0.003], cast: false });
    }
  } else {
    // --- shinmei: straight round kasagi, nuki between the pillars
    const kr = kh / 2;
    const kas = new THREE.CylinderGeometry(kr, kr, L, 16, 1, false);
    const kuv = kas.attributes.uv;
    for (let i = 0; i < kuv.count; i++) kuv.setXY(i, kuv.getX(i) * TAU * kr / uvW, kuv.getY(i) * L / uvW);
    b.add(kas, mCap, { pos: [0, H - kr, 0], rot: [0, 0, PI / 2] });
    // small end caps (black rings) for vermilion
    if (isV) {
      for (const side of [-1, 1]) {
        b.add(new THREE.CylinderGeometry(kr * 1.02, kr * 1.02, 0.04 * H, 16), getMat('blackLacquer'), { pos: [side * (L / 2 - 0.02 * H), H - kr, 0], rot: [0, 0, PI / 2], cast: false });
      }
    }
    const Ln = S + 2 * pr * 0.98;
    b.add(beamX(-Ln / 2, Ln / 2, yn, 0, nd * 0.95, nh * 1.1, nh * 0.08, uvW), mMain);
    if (plaque) {
      const style2 = isV ? 'lacquer' : isStone ? 'stone' : 'wood';
      const yg0 = yn + nh * 0.55, yg1 = H - kh;
      b.add(postY(0, 0, yg0, yg1, pr * 0.9, nd * 0.7, 0.01, uvW), mMain);
      const ph = (yg1 - yg0) * 1.25, pw = ph * 0.6, pt = 0.03 * H;
      const yc = (yg0 + yg1) / 2, zc = nd * 0.4 + pt / 2 + 0.01;
      b.add(bevelBox(pw, ph, pt, pt * 0.3), isV ? getMat('blackLacquer') : mMain, { pos: [0, yc, zc] });
      b.add(new THREE.PlaneGeometry(pw * 0.9, ph * 0.93), SM.plaque(plaque, style2), { pos: [0, yc, zc + pt / 2 + 0.003], cast: false });
    }
  }
  const g = b.build();
  g.name = `torii_${style}_${material}`;
  // two pillar colliders (a single footprint collider would block the passage)
  g.userData.colliders = [
    { type: 'circle', r: pr * 1.6, x: -S / 2, z: 0 },
    { type: 'circle', r: pr * 1.6, x: S / 2, z: 0 },
  ];
  g.userData.passage = { axis: 'z', width: S - 2 * pr };
  return g;
}

// ---------------------------------------------------------------------------
// 2. 石灯籠 Kasuga stone lantern
// ---------------------------------------------------------------------------
export function createStoneLantern(opts = {}) {
  const { lit = false, seed = 1 } = opts;
  const r = rng(seed * 7 + 3);
  const b = new Builder();
  const G = SM.granite();
  const core = lit ? SM.fire() : SM.cavity();
  const hx = -PI / 6; // flat hexagon face toward +Z
  const flat = { phase: hx, flat: true, uv: 0.7 };
  // 基礎 base: hexagonal plinth with a two-step lotus slope (返花)
  b.add(lathe([[0.001, 0], [0.47, 0], [0.47, 0.1], [0.44, 0.125], [0.4, 0.15], [0.36, 0.19], [0.3, 0.215], [0.24, 0.245], [0.2, 0.255], [0.001, 0.255]], 6, flat), G);
  // 竿 round pole with a central node (節)
  b.add(lathe([
    [0.15, 0.25], [0.15, 0.29], [0.15, 0.29], [0.115, 0.31], [0.108, 0.57], [0.108, 0.57], [0.132, 0.585], [0.132, 0.64], [0.108, 0.655],
    [0.108, 0.655], [0.103, 0.94], [0.103, 0.94], [0.135, 0.97], [0.14, 1.0], [0.001, 1.0],
  ], 12, { uv: 0.7 }), G);
  // 中台 platform (hex, lotus flare)
  b.add(lathe([[0.001, 0.99], [0.15, 0.99], [0.2, 1.02], [0.3, 1.075], [0.37, 1.1], [0.385, 1.115], [0.385, 1.19], [0.001, 1.19]], 6, flat), G);
  // 火袋 fire box
  const y0 = 1.19, y1 = 1.53;
  const rc = 0.26;
  b.add(lathe([[0.001, y0], [0.215, y0], [0.215, y1], [0.001, y1]], 6, flat), core, { cast: false });
  for (let k = 0; k < 6; k++) {
    const a = hx + (k * TAU) / 6;
    b.add(box(0.075, y1 - y0, 0.075, 0.7), G, { pos: [Math.sin(a) * rc, (y0 + y1) / 2, Math.cos(a) * rc], rot: [0, a, 0] });
  }
  for (let k = 0; k < 6; k++) {
    const a = hx + ((k + 0.5) * TAU) / 6;
    const dist = rc * Math.cos(PI / 6);
    const w = rc;
    const fx = Math.sin(a), fz = Math.cos(a);
    const isWindow = Math.abs(fz) > 0.9; // front / back: open fire windows
    const place = (geo, m, y, off = 0, o = {}) => b.add(geo, m, { pos: [fx * (dist + off), y, fz * (dist + off)], rot: [0, a, 0], ...o });
    if (isWindow) {
      place(box(w, 0.06, 0.06, 0.7), G, y0 + 0.03);
      place(box(w, 0.05, 0.06, 0.7), G, y1 - 0.025);
      place(box(0.018, y1 - y0 - 0.1, 0.02, 0.7), G, (y0 + y1) / 2 + 0.005, 0, { cast: false });
    } else {
      place(box(w, y1 - y0, 0.05, 0.7), G, (y0 + y1) / 2, -0.01);
      if (k === 1 || k === 4) {
        place(new THREE.CircleGeometry(0.055, 14), core, (y0 + y1) / 2 + 0.02, 0.018, { cast: false }); // sun
      } else {
        const sh = new THREE.Shape();
        sh.absarc(0, 0, 0.055, 0, TAU, false);
        const hole = new THREE.Path();
        hole.absarc(0.028, 0.012, 0.05, 0, TAU, true);
        sh.holes.push(hole);
        place(new THREE.ShapeGeometry(sh, 10), core, (y0 + y1) / 2 + 0.02, 0.018, { cast: false }); // crescent moon
      }
    }
  }
  b.add(lathe([[0.001, y1], [0.3, y1], [0.3, y1 + 0.04], [0.001, y1 + 0.04]], 6, flat), G);
  // 笠 hexagonal roof with curled corners
  const oc = [], ic = [], sc = [];
  for (let k = 0; k < 6; k++) {
    const a = hx + (k * TAU) / 6;
    oc.push([Math.sin(a) * 0.54, Math.cos(a) * 0.54]);
    ic.push([Math.sin(a) * 0.1, Math.cos(a) * 0.1]);
    sc.push([Math.sin(a) * 0.28, Math.cos(a) * 0.28]);
  }
  const roof = hipRoof({
    outer: oc, inner: ic, soffitInner: sc, yEave: y1 + 0.1, yTop: y1 + 0.34, ySoffitIn: y1 + 0.04, lift: 0.07, liftPow: 2.6,
    flare: 0.03, curveA: 0.3, curvePow: 1.9, thick: 0.065, split: 0.5, segS: 5, segT: 4, segSoffit: 1, tile: 0.7, rafter: 0.7,
    soffitMode: 'planar', bandMode: 'plain', ridge: { w: 0.05, h: 0.035, ext: 0.0, curl: 0.0, steps: 3, lite: true },
  });
  for (const k of ['top', 'edge', 'band', 'soffit', 'ridges']) if (roof[k]) b.add(roof[k], G);
  // 蕨手 warabite curls at the corners
  for (let k = 0; k < 6; k++) {
    const a = hx + (k * TAU) / 6;
    const rad = V3(Math.sin(a), 0, Math.cos(a));
    const tip = V3(rad.x * 0.56, y1 + 0.16, rad.z * 0.56);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      const phi = f * 1.55 * PI;
      const rho = 0.05 * (1 - 0.5 * f);
      pts.push(tip.clone().addScaledVector(rad, rho * Math.sin(phi) - 0.02 * f).add(V3(0, rho * (1 - Math.cos(phi)), 0)));
    }
    b.add(tube(pts, { segs: 8, radial: 5, radius: (t) => 0.026 * (1 - 0.45 * t), capEnd: true }), G, { cast: false });
  }
  // 宝珠 jewel with lotus base
  b.add(lathe([
    [0.13, y1 + 0.32], [0.13, y1 + 0.35], [0.1, y1 + 0.37], [0.075, y1 + 0.39], [0.1, y1 + 0.41], [0.125, y1 + 0.435],
    [0.075, y1 + 0.45], [0.115, y1 + 0.5], [0.125, y1 + 0.55], [0.1, y1 + 0.6], [0.055, y1 + 0.645], [0.001, y1 + 0.69],
  ], 12, { uv: 0.7 }), G);
  const g = b.build();
  g.name = lit ? 'stoneLantern_lit' : 'stoneLantern';
  g.userData.collider = { type: 'circle', r: 0.45 };
  return g;
}

// ---------------------------------------------------------------------------
// 3. 狛犬 Komainu (stone guardian lion-dog on a tall pedestal)
// ---------------------------------------------------------------------------
/** Scaled sphere / icosphere part helper. */
function ell(rx, ry, rz, pos, rot = [0, 0, 0], hi = false, lo = false) {
  const g = hi ? new THREE.SphereGeometry(1, 11, 8) : new THREE.IcosahedronGeometry(1, lo ? 0 : 1);
  if (!hi) {
    // smooth icosphere normals (Icosahedron is non-indexed with per-face normals at detail>0 averaged)
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const l = Math.hypot(x, y, z) || 1;
      n.setXYZ(i, x / l, y / l, z / l);
    }
  }
  T(g, null, null, [rx, ry, rz]);
  T(g, pos, rot);
  return g;
}

export function createKomainu(opts = {}) {
  const { side = 'a', seed = 1 } = opts;
  const open = side !== 'un';
  const r = rng(seed * 13 + (open ? 1 : 2));
  const b = new Builder();
  const G = SM.granite();
  const D = SM.cavity();
  // --- pedestal (台座)
  b.add(bevelBox(0.94, 0.16, 0.8, 0.03, 0.7), G, { pos: [0, 0.08, 0] });
  b.add(bevelBox(0.82, 0.06, 0.7, 0.015, 0.7), G, { pos: [0, 0.19, 0] });
  b.add(bevelBox(0.68, 0.54, 0.58, 0.02, 0.7), G, { pos: [0, 0.49, 0] });
  b.add(new THREE.PlaneGeometry(0.3, 0.4), SM.engraved('奉納'), { pos: [0, 0.49, 0.2915], cast: false });
  b.add(bevelBox(0.78, 0.06, 0.66, 0.015, 0.7), G, { pos: [0, 0.79, 0] });
  b.add(bevelBox(0.88, 0.1, 0.74, 0.03, 0.7), G, { pos: [0, 0.87, 0] });
  const rock = blob(seed * 3 + 1, { r: 0.36, detail: 1, sx: 1.12, sy: 0.3, sz: 0.92, amp: 0.2, flatBottom: -0.3, flatK: 0.2 });
  b.add(faceBoxUV(rock, 0.7), G, { pos: [0, 0.97, 0.01] });
  // --- statue (local origin on the rock, facing +Z)
  const Y = 1.0;
  const P = (x, y, z) => [x, Y + y, z];
  const add = (g) => b.add(g, G);
  // body
  add(ell(0.15, 0.14, 0.18, P(-0.15, 0.15, -0.1)));
  add(ell(0.15, 0.14, 0.18, P(0.15, 0.15, -0.1)));
  add(ell(0.08, 0.05, 0.1, P(-0.21, 0.045, 0.05), [0, 0, 0], false, true));
  add(ell(0.08, 0.05, 0.1, P(0.21, 0.045, 0.05), [0, 0, 0], false, true));
  add(ell(0.18, 0.27, 0.17, P(0, 0.33, -0.03), [0.28, 0, 0], true));
  add(ell(0.155, 0.16, 0.13, P(0, 0.38, 0.08), [0, 0, 0], true));
  // front legs + paws (the 'a' lion rests a paw on a ball)
  for (const sx of [-1, 1]) {
    const onBall = open && sx > 0;
    const px = sx * 0.1;
    const legTop = P(px, 0.33, 0.12);
    const pawY = onBall ? 0.16 : 0.04;
    const legLen = legTop[1] - (Y + pawY);
    const leg = new THREE.CapsuleGeometry(0.058, Math.max(0.05, legLen - 0.06), 3, 8);
    T(leg, [px, Y + pawY + legLen / 2 + 0.01, 0.14 + (onBall ? 0.03 : 0)], [onBall ? -0.25 : 0, 0, 0]);
    add(leg);
    add(ell(0.075, 0.045, 0.095, P(px, pawY, 0.2 + (onBall ? 0.03 : 0))));
    // toes
    for (const tx of [-0.035, 0, 0.035]) add(ell(0.022, 0.02, 0.022, P(px + tx, pawY - 0.005, 0.28 + (onBall ? 0.03 : 0)), [0, 0, 0], false, true));
    // elbow curls
    add(ell(0.04, 0.04, 0.04, P(sx * 0.155, 0.25, 0.12), [0, 0, 0], false, true));
    add(ell(0.035, 0.035, 0.035, P(sx * 0.16, 0.17, 0.13), [0, 0, 0], false, true));
  }
  if (open) {
    add(ell(0.085, 0.085, 0.085, P(0.1, 0.075, 0.23), [0, 0, 0], true)); // 玉
    b.add(new THREE.TorusGeometry(0.086, 0.01, 5, 14), G, { pos: P(0.1, 0.075, 0.23), rot: [0.5, 0.3, 0] });
  }
  // head
  add(ell(0.17, 0.155, 0.16, P(0, 0.62, 0.09), [0, 0, 0], true));
  add(ell(0.08, 0.06, 0.06, P(-0.085, 0.575, 0.2), [0, 0, 0], false, true));
  add(ell(0.08, 0.06, 0.06, P(0.085, 0.575, 0.2), [0, 0, 0], false, true));
  if (open) {
    add(ell(0.115, 0.058, 0.09, P(0, 0.6, 0.2), [0, 0, 0], true));
    b.add(ell(0.078, 0.05, 0.06, P(0, 0.54, 0.225)), D, { cast: false });
    add(ell(0.09, 0.035, 0.075, P(0, 0.49, 0.19), [-0.15, 0, 0]));
    for (const fx of [-0.055, 0.055]) {
      const fang = new THREE.ConeGeometry(0.013, 0.035, 6);
      b.add(fang, G, { pos: P(fx, 0.54, 0.27), rot: [PI, 0, 0], cast: false });
    }
    b.add(ell(0.045, 0.012, 0.035, P(0, 0.515, 0.225)), getMat('vermilionDark'), { cast: false }); // tongue hint
  } else {
    add(ell(0.115, 0.08, 0.09, P(0, 0.575, 0.2), [0, 0, 0], true));
    b.add(ell(0.075, 0.009, 0.02, P(0, 0.535, 0.274)), D, { cast: false });
    for (const fx of [-0.05, 0.05]) b.add(new THREE.ConeGeometry(0.012, 0.03, 6), G, { pos: P(fx, 0.55, 0.272), cast: false });
    // horn (the 'un' komainu traditionally has one)
    const horn = new THREE.ConeGeometry(0.035, 0.1, 10);
    b.add(horn, G, { pos: P(0, 0.79, 0.05), rot: [-0.35, 0, 0] });
  }
  add(ell(0.05, 0.03, 0.035, P(0, 0.625, 0.285)));
  for (const sx of [-1, 1]) {
    add(ell(0.036, 0.036, 0.03, P(sx * 0.068, 0.67, 0.215)));
    b.add(ell(0.018, 0.018, 0.012, P(sx * 0.068, 0.67, 0.242), [0, 0, 0], false, true), D, { cast: false });
    add(ell(0.06, 0.022, 0.035, P(sx * 0.072, 0.708, 0.205), [0, 0, sx * 0.32]));
    add(ell(0.032, 0.07, 0.045, P(sx * 0.165, 0.665, 0.07), [0, 0, sx * 0.95], false, true));
  }
  // mane: curls framing the face, second row behind, beard, cascade on the back
  const curl = (x, y, z, rad, lo = true) => add(ell(rad, rad, rad * 0.85, P(x, y, z), [0, 0, 0], false, lo));
  for (let k = 0; k <= 9; k++) {
    const a = lerp(-2.0, 2.0, k / 9);
    curl(Math.sin(a) * 0.2, 0.6 + Math.cos(a) * 0.19, 0.02 - 0.03 * Math.abs(Math.sin(a)), 0.058 + 0.008 * Math.cos(a), false);
  }
  for (let k = 0; k <= 6; k++) {
    const a = lerp(-1.6, 1.6, k / 6);
    curl(Math.sin(a) * 0.16, 0.6 + Math.cos(a) * 0.14, -0.08, 0.07);
  }
  for (const [x, y, z] of [[-0.075, 0.45, 0.16], [0, 0.43, 0.18], [0.075, 0.45, 0.16]]) curl(x, y, z, 0.052, true);
  for (const [x, y, z] of [[-0.1, 0.5, -0.13], [0.1, 0.5, -0.13], [-0.05, 0.4, -0.18], [0.05, 0.4, -0.18]]) curl(x, y, z, 0.06);
  // flame-like tail
  for (const [x, y, z, rad] of [[0, 0.2, -0.27, 0.07], [-0.07, 0.3, -0.29, 0.06], [0.07, 0.3, -0.29, 0.06], [0, 0.4, -0.31, 0.068], [-0.06, 0.5, -0.3, 0.052], [0.06, 0.5, -0.3, 0.052], [0, 0.58, -0.27, 0.045]]) curl(x, y, z, rad);
  // a little moss on the pedestal top
  const g = b.build();
  // normalize to ~1.7 m overall (pedestal + statue)
  const k = 1.7 / 1.85;
  g.traverse((o) => {
    if (o.isMesh) {
      o.geometry.scale(k, k, k);
      o.geometry.computeBoundingBox();
      o.geometry.computeBoundingSphere();
    }
  });
  g.name = `komainu_${open ? 'a' : 'un'}`;
  g.userData.collider = { type: 'box', w: 0.94 * k, d: 0.8 * k };
  return g;
}

// ---------------------------------------------------------------------------
// 9. 神橋 red arched bridge (spans along Z)
// ---------------------------------------------------------------------------
const rectProf = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

export function createRedBridge(opts = {}) {
  const { length = 14, width = 3.2, seed = 1 } = opts;
  const L = length, W = width;
  const r = rng(seed * 19 + 4);
  const b = new Builder();
  const V = getMat('vermilion');
  const plank = getMat('woodAged');
  const bronze = SM.bronze();
  const stone = getMat('stone');
  const blk = getMat('blackLacquer');
  const rise = Math.min(1.2, L * 0.08);
  const y0 = 0.18;
  const deckY = (z) => y0 + rise * (1 - Math.pow((2 * z) / L, 2));
  const slope = (z) => (-8 * rise * z) / (L * L);
  const n = Math.max(12, Math.round(L * 1.3));
  const arch = (x, dy, z0 = -L / 2, z1 = L / 2) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const z = lerp(z0, z1, i / n);
      pts.push(V3(x, deckY(z) + dy, z));
    }
    return pts;
  };
  // deck planks (across X)
  const np = Math.round(L / 0.3);
  for (let i = 0; i < np; i++) {
    const z = -L / 2 + (i + 0.5) * (L / np);
    b.add(box(W - 0.06, 0.07, L / np - 0.018, 0.8), plank, { pos: [(r() - 0.5) * 0.02, deckY(z) - 0.035 + (r() - 0.5) * 0.008, z], rot: [-Math.atan(slope(z)) + (r() - 0.5) * 0.01, 0, 0] });
  }
  // outer fascia beams (keta, chamfered) + inner girders
  for (const x of [-W / 2 + 0.07, W / 2 - 0.07]) b.add(sweep(arch(x, -0.2), chamferRect(0.14, 0.34, 0.02), { perp: true }), V);
  for (const x of [-W / 4, W / 4]) b.add(sweep(arch(x, -0.21), rectProf(0.12, 0.28), { perp: true }), V, { cast: false });
  // piers
  for (const z of [-L * 0.3, 0, L * 0.3]) {
    const yb = deckY(z) - 0.37;
    b.add(beamX(-W / 2 - 0.25, W / 2 + 0.25, yb - 0.12, z, 0.26, 0.24, 0.02), V);
    for (const x of [-W / 2 + 0.25, 0, W / 2 - 0.25]) {
      b.add(cylY(0.12, 0.11, -1.0, yb - 0.2, 10, { open: true }), V, { pos: [x, 0, z] });
      b.add(cylY(0.135, 0.135, -1.6, -0.9, 10, { open: true }), blk, { pos: [x, 0, z] });
    }
    b.add(box(W + 0.2, 0.16, 0.14), V, { pos: [0, -0.55, z] });
  }
  // stone abutments at both ends
  for (const sgn of [-1, 1]) b.add(box(W + 0.7, 0.7, 1.1, 1.2), stone, { pos: [0, -0.3, sgn * (L / 2 + 0.25)] });
  // railings (高欄): 地覆, 平桁, round 架木, posts with little blocks, bronze giboshi on the main posts
  const rh = 0.95;
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.08);
    b.add(sweep(arch(x, 0.05, -L / 2 + 0.1, L / 2 - 0.1), rectProf(0.1, 0.12), { perp: true }), V);
    b.add(sweep(arch(x, 0.5, -L / 2 + 0.2, L / 2 - 0.2), rectProf(0.06, 0.1), { perp: true }), V, { cast: false });
    b.add(tube(arch(x, rh, -L / 2 + 0.2, L / 2 - 0.2), { segs: n + 6, radial: 7, radius: 0.045 }), V);
    const nPost = Math.max(4, Math.round(L / 1.3));
    for (let i = 1; i < nPost; i++) {
      const z = -L / 2 + 0.2 + (i / nPost) * (L - 0.4);
      if (Math.abs(z) < 0.3) continue;
      const yb = deckY(z);
      b.add(box(0.09, rh - 0.12, 0.09), V, { pos: [x, yb + 0.1 + (rh - 0.12) / 2, z], cast: false });
      b.add(box(0.13, 0.06, 0.13), V, { pos: [x, yb + rh - 0.07, z], cast: false });
    }
    for (const z of [-L / 2 + 0.12, L / 2 - 0.12]) {
      const yb = deckY(z);
      b.add(postY(x, z, yb - 0.3, yb + 1.15, 0.2, 0.2, 0.025), V);
      b.add(cylY(0.13, 0.13, yb + 1.15, yb + 1.19, 12), bronze, { pos: [x, 0, z], cast: false });
      b.add(giboshiGeo(0.13, 10), bronze, { pos: [x, yb + 1.19, z] });
      b.add(box(0.24, 0.2, 0.24), blk, { pos: [x, yb - 0.2, z], cast: false });
    }
    b.add(postY(x, 0, deckY(0) + 0.1, deckY(0) + 1.1, 0.16, 0.16, 0.02), V);
    b.add(giboshiGeo(0.1, 10), bronze, { pos: [x, deckY(0) + 1.1, 0] });
  }
  const g = b.build();
  g.name = 'redBridge';
  g.userData.deck = { length: L, width: W, rise, y0 };
  return g;
}

// ---------------------------------------------------------------------------
// 11. 絵馬掛け ema rack
// ---------------------------------------------------------------------------
function emaGeo(w, h, t, cellFront, cellBack) {
  const top = h / 2, sh = h / 2 - h * 0.3;
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, sh], [0, top], [-w / 2, sh]];
  const pos = [], uv = [], nor = [];
  const cellUV = (cell, x, y, mirror) => {
    const cx = cell % 4, cy = Math.floor(cell / 4);
    let u = (x + w / 2) / w;
    if (mirror) u = 1 - u;
    const v = (y + h / 2) / h;
    return [(cx + 0.03 + u * 0.94) / 4, 1 - (cy + 0.03 + (1 - v) * 0.94) / 4];
  };
  const face = (z, nz, cell, mirror) => {
    const tri = [[0, 1, 2], [0, 2, 4], [2, 3, 4]];
    for (const t3 of tri) {
      const order = nz > 0 ? t3 : [t3[0], t3[2], t3[1]];
      for (const k of order) {
        pos.push(pts[k][0], pts[k][1], z);
        nor.push(0, 0, nz);
        uv.push(...cellUV(cell, pts[k][0], pts[k][1], mirror));
      }
    }
  };
  face(t / 2, 1, cellFront, false);
  face(-t / 2, -1, cellBack, true);
  for (let k = 0; k < 5; k++) {
    const a = pts[k], c = pts[(k + 1) % 5];
    const ex = c[0] - a[0], ey = c[1] - a[1];
    const l = Math.hypot(ex, ey);
    const nx = ey / l, ny = -ex / l;
    const quad = [[a, t / 2], [c, t / 2], [c, -t / 2], [a, t / 2], [c, -t / 2], [a, -t / 2]];
    const q2 = [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]];
    for (const [p2, z] of q2) {
      pos.push(p2[0], p2[1], z);
      nor.push(nx, ny, 0);
      uv.push(0.01, 0.99);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function createEmaRack(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 23 + 9);
  const b = new Builder();
  const wood = getMat('woodAged');
  const roofM = getMat('woodDark');
  const emaM = SM.ema();
  const G = SM.granite();
  const hw = 1.15;
  for (const x of [-hw, hw]) {
    b.add(postY(x, 0, 0.12, 2.2, 0.13, 0.13, 0.015, 1.2), wood);
    b.add(bevelBox(0.3, 0.14, 0.3, 0.02, 0.7), G, { pos: [x, 0.07, 0] });
  }
  // top beam + roof
  b.add(beamX(-hw - 0.2, hw + 0.2, 2.16, 0, 0.14, 0.12, 0.015, 1.2), wood);
  const roof = gableRoof({
    halfX: hw + 0.42, zR: 0, yR: 2.62, zF: 0.62, yF: 2.24, zB: -0.62, yB: 2.24, lift: 0.08, flare: 0.05, curveA: 0.4, curvePow: 2,
    thick: 0.07, split: 0.5, segX: 8, segT: 4, tile: 1.2, rafter: 0.6, soffitMode: 'plain', barge: { h: 0.14, d: 0.04 },
    ridgeCap: { w: 0.14, h: 0.1, ext: 0.05 },
  });
  for (const k of ['top', 'edge', 'band', 'verge']) if (roof[k]) b.add(roof[k], roofM);
  b.add(roof.soffit, wood);
  b.add(roof.barge, wood);
  b.add(roof.ridgeCap, roofM);
  // struts from the posts to the ridge
  for (const x of [-hw, hw]) b.add(postY(x, 0, 2.22, 2.6, 0.08, 0.08, 0.01), wood);
  // hanging bars
  const bars = [0.95, 1.35, 1.75];
  for (const y of bars) b.add(beamX(-hw, hw, y, 0, 0.05, 0.05, 0.008, 1.2), wood);
  // ema plaques (front and back)
  const ew = 0.2, eh = 0.145, et = 0.012;
  for (const y of bars) {
    for (const sgn of [1, -1]) {
      const n = sgn > 0 ? 11 : 9;
      for (let i = 0; i < n; i++) {
        if (r() < 0.12) continue;
        const x = -hw + 0.12 + ((i + 0.5) / n) * (2 * hw - 0.24) + (r() - 0.5) * 0.04;
        const cell = Math.floor(r() * 12);
        const back = 12 + Math.floor(r() * 4);
        const g = emaGeo(ew, eh, et, cell, back);
        const tilt = (r() - 0.5) * 0.3;
        T(g, [0, -eh / 2 - 0.035, 0], null);
        T(g, [x, y + (r() - 0.5) * 0.015, sgn * (0.04 + r() * 0.012)], [-(0.05 + r() * 0.08), sgn > 0 ? 0 : PI, tilt], null, 'YXZ');
        b.add(g, emaM, { cast: false });
      }
    }
  }
  const g = b.build();
  g.name = 'emaRack';
  g.userData.collider = { type: 'box', w: 2.6, d: 0.6 };
  return g;
}

// ---------------------------------------------------------------------------
// 12. 手水舎 Temizuya (purification pavilion)
// ---------------------------------------------------------------------------
export function createTemizuya(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 29 + 1);
  const b = new Builder();
  const V = getMat('vermilion');
  const G = SM.granite();
  const cu = SM.copper();
  const eave = SM.eave();
  const bam = SM.bambooGreen();
  const gold = getMat('gold');
  // stone platform
  b.add(bevelBox(3.3, 0.16, 2.5, 0.03, 0.8), G, { pos: [0, 0.08, 0] });
  // posts & beams
  const px = 1.25, pz = 0.82, yTop = 2.45;
  for (const x of [-px, px]) {
    for (const z of [-pz, pz]) {
      b.add(postY(x, z, 0.16, yTop, 0.17, 0.17, 0.025), V);
      b.add(cylY(0.13, 0.13, 0.16, 0.26, 12), G, { pos: [x, 0, z] });
    }
  }
  for (const z of [-pz, pz]) {
    b.add(beamX(-px - 0.25, px + 0.25, yTop - 0.1, z, 0.15, 0.2, 0.02), V);
    b.add(beamX(-px, px, yTop - 0.55, z, 0.1, 0.12, 0.015), V); // 虹梁-ish lower tie
  }
  for (const x of [-px, px]) b.add(beamZ(-pz - 0.2, pz + 0.2, yTop - 0.1, x, 0.15, 0.2, 0.02), V);
  // roof (kirizuma, copper, curved, upswept)
  const roof = gableRoof({
    halfX: px + 0.8, zR: 0, yR: 3.55, zF: pz + 0.85, yF: 2.62, zB: -pz - 0.85, yB: 2.62, lift: 0.16, liftPow: 2.5, flare: 0.08,
    curveA: 0.3, curvePow: 2.1, thick: 0.2, split: 0.42, segX: 12, segT: 7, tile: 1.6, rafter: 0.8,
    barge: { h: 0.3, d: 0.07 }, ridgeCap: { w: 0.26, h: 0.22, ext: 0.12 },
  });
  b.add(roof.top, cu);
  b.add(roof.edge, cu);
  b.add(roof.ridgeCap, cu);
  b.add(roof.band, eave);
  b.add(roof.soffit, eave);
  b.add(roof.verge, eave);
  b.add(roof.barge, V);
  // gable truss (tsuka + tie) and a gold gegyo ornament under the apex
  for (const sx of [-1, 1]) {
    const x = sx * (px + 0.02);
    b.add(postY(x, 0, yTop, 3.25, 0.1, 0.1, 0.012), V);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(0.16, -0.02, 0.18, -0.2, 0, -0.32);
    sh.bezierCurveTo(-0.18, -0.2, -0.16, -0.02, 0, 0);
    b.add(extrudeShape(sh, 0.03, { curveSegments: 6 }), gold, { pos: [sx * (px + 0.82), 3.32, 0], rot: [0, PI / 2, 0], cast: false });
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), gold, { pos: [sx * (px + 0.84), 3.35, 0], rot: [0, 0, PI / 2], cast: false });
  }
  // chozubachi basin (hollow granite block) on two stone supports
  const bw = 1.7, bd = 0.78, bh = 0.52, wt = 0.11, y0 = 0.42;
  for (const x of [-0.55, 0.55]) b.add(bevelBox(0.45, y0 - 0.16, 0.6, 0.03, 0.8), G, { pos: [x, (y0 + 0.16) / 2, 0] });
  const yb = y0 + bh / 2;
  b.add(bevelBox(bw, bh, wt, 0.025, 0.8), G, { pos: [0, yb, bd / 2 - wt / 2] });
  b.add(bevelBox(bw, bh, wt, 0.025, 0.8), G, { pos: [0, yb, -bd / 2 + wt / 2] });
  b.add(bevelBox(wt, bh, bd - 2 * wt + 0.02, 0.025, 0.8), G, { pos: [bw / 2 - wt / 2, yb, 0] });
  b.add(bevelBox(wt, bh, bd - 2 * wt + 0.02, 0.025, 0.8), G, { pos: [-bw / 2 + wt / 2, yb, 0] });
  b.add(box(bw - 0.1, 0.1, bd - 0.1, 0.8), G, { pos: [0, y0 + 0.05, 0] });
  b.add(new THREE.PlaneGeometry(0.8, 0.34), SM.engraved('洗心', false), { pos: [0, yb - 0.02, bd / 2 + 0.002], cast: false });
  const water = new THREE.PlaneGeometry(bw - 2 * wt + 0.01, bd - 2 * wt + 0.01);
  b.add(water, getMat('water'), { pos: [0, y0 + bh - 0.07, 0], rot: [-PI / 2, 0, 0], cast: false });
  // bamboo spout (kakehi) with a thin stream
  const sx0 = -0.35;
  b.add(cylY(0.05, 0.05, 0.16, 1.45, 10, { uv: 0.35 }), bam, { pos: [sx0, 0, -bd / 2 - 0.12] });
  const spout = tube([V3(sx0, 1.38, -bd / 2 - 0.12), V3(sx0, 1.36, -bd / 2 + 0.1), V3(sx0, 1.3, -0.02)], { segs: 4, radial: 8, radius: 0.035, capEnd: true, uvV: 0.35 });
  b.add(spout, bam);
  b.add(cylY(0.012, 0.018, y0 + bh - 0.07, 1.3, 6, { open: true }), getMat('water'), { pos: [sx0, 0, 0.0], cast: false });
  // ladle rack + hishaku ladles
  for (const z of [0.12, 0.3]) b.add(cylY(0.016, 0.016, -bw / 2 + 0.05, bw / 2 - 0.05, 8), bam, { pos: [0, y0 + bh + 0.02, z], rot: [0, 0, PI / 2], cast: false });
  for (let i = 0; i < 5; i++) {
    const x = -0.6 + i * 0.3 + (r() - 0.5) * 0.05;
    const yaw = (r() - 0.5) * 0.15;
    const handle = cylY(0.009, 0.009, 0, 0.5, 6);
    b.add(handle, bam, { pos: [x, y0 + bh + 0.045, 0.06], rot: [PI / 2 - 0.05, yaw, 0], cast: false });
    const cup = lathe([[0.001, 0], [0.042, 0], [0.045, 0.004], [0.045, 0.075], [0.04, 0.075], [0.001, 0.07]], 12, { uv: 0.35 });
    b.add(cup, bam, { pos: [x + Math.sin(yaw) * 0.02, y0 + bh + 0.04, -0.02], rot: [PI, 0, 0], cast: false });
  }
  const g = b.build();
  g.name = 'temizuya';
  g.userData.collider = { type: 'box', w: 3.3, d: 2.5 };
  return g;
}

// ---------------------------------------------------------------------------
// 13. 竹垣 bamboo fence (yotsume-gaki), along X
// ---------------------------------------------------------------------------
export function createBambooFence(opts = {}) {
  const { length = 6, seed = 1 } = opts;
  const L = length;
  const r = rng(seed * 37 + 2);
  const b = new Builder();
  const bam = SM.bambooDry();
  const post = getMat('woodDark');
  const tie = mat('shrine.shuro', { color: 0x2b221d, roughness: 1 });
  const H = 1.1;
  const nSpan = Math.max(1, Math.ceil(L / 1.9));
  for (let i = 0; i <= nSpan; i++) {
    const x = -L / 2 + (i / nSpan) * L;
    b.add(cylY(0.06, 0.055, -0.1, H + 0.12, 12, { uv: 0.6 }), post, { pos: [x, 0, 0] });
    b.add(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 12), post, { pos: [x, H + 0.13, 0] });
  }
  // vertical bamboo (立子)
  const nV = Math.max(2, Math.round(L / 0.3));
  const rails = [0.28, 0.55, 0.82, 1.02];
  for (let i = 0; i < nV; i++) {
    const x = -L / 2 + ((i + 0.5) / nV) * L;
    const h = H - 0.04 + (r() - 0.5) * 0.04;
    const rv = 0.019 + r() * 0.004;
    const g = new THREE.CylinderGeometry(rv, rv, h + 0.1, 8, 1, false);
    const uv = g.attributes.uv;
    const ph = r();
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), ph + (uv.getY(k) * (h + 0.1)) / 0.36);
    b.add(g, bam, { pos: [x, (h + 0.1) / 2 - 0.1, i % 2 ? -0.03 : 0.03] });
    // rope ties at each crossing
    for (const y of rails) b.add(box(0.05, 0.022, 0.1, 1), tie, { pos: [x, y, 0], rot: [0, 0, (i + rails.indexOf(y)) % 2 ? 0.7 : -0.7], cast: false });
  }
  // horizontal bamboo rails (胴縁) in front
  for (const y of rails) {
    const g = new THREE.CylinderGeometry(0.02, 0.02, L + 0.08, 8);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), (uv.getY(k) * (L + 0.08)) / 0.4);
    b.add(g, bam, { pos: [0, y, 0], rot: [0, 0, PI / 2] });
  }
  const g = b.build();
  g.name = 'bambooFence';
  g.userData.collider = { type: 'box', w: L, d: 0.2 };
  return g;
}

// ---------------------------------------------------------------------------
// 14. 石垣 fitted stone wall, along X, front face +Z
// ---------------------------------------------------------------------------
/** Clip a convex polygon [[x,y],...] by the half-plane (p - m)·n <= 0. */
function clipHalf(poly, mx, my, nx, ny) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const da = (a[0] - mx) * nx + (a[1] - my) * ny;
    const dc = (c[0] - mx) * nx + (c[1] - my) * ny;
    if (da <= 0) out.push(a);
    if ((da < 0 && dc > 0) || (da > 0 && dc < 0)) {
      const t = da / (da - dc);
      out.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Pillowed stone from a convex 2D outline (in the XY plane), front at z=zf, back at z=zb. Flat-shaded facets. */
function stoneFromPoly(poly, zf, zb, bevel, bulge) {
  const n = poly.length;
  let cx = 0, cy = 0;
  for (const [x, y] of poly) { cx += x; cy += y; }
  cx /= n; cy /= n;
  const inset = poly.map(([x, y]) => {
    const dx = cx - x, dy = cy - y;
    const l = Math.hypot(dx, dy) || 1;
    const k = Math.min(bevel, l * 0.4) / l;
    return [x + dx * k, y + dy * k];
  });
  const P = [];
  const F = [cx, cy, zf + bulge];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = [...inset[i], zf], c = [...inset[j], zf];
    P.push([F, a, c]);
    P.push([a, [...poly[i], zf - bevel * 0.8], [...poly[j], zf - bevel * 0.8], c]);
    P.push([[...poly[i], zf - bevel * 0.8], [...poly[i], zb], [...poly[j], zb], [...poly[j], zf - bevel * 0.8]]);
  }
  // make windings face outward (front faces +z, sides outward from the centroid)
  for (const poly3 of P) {
    const [a, bb, c] = poly3;
    const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let mx = 0, my = 0, mz = 0;
    for (const q of poly3) { mx += q[0]; my += q[1]; mz += q[2]; }
    mx = mx / poly3.length - cx; my = my / poly3.length - cy; mz = mz / poly3.length - (zf + zb) / 2;
    if (nx * mx + ny * my + nz * mz < 0) poly3.reverse();
  }
  return polysGeo(P, 0.9);
}

export function createStoneWall(opts = {}) {
  const { length = 8, height = 1.2, seed = 1 } = opts;
  const L = length, H = height;
  const r = rng(seed * 41 + 7);
  const b = new Builder();
  const m = mat('shrine.wallStone', { color: 0xffffff, roughness: 0.92, vertexColors: true, map: SM.granite().map });
  const D = 0.6;
  const capH = 0.16;
  const bodyH = H - capH;
  const palette = [0xb9b5ab, 0xa9a59b, 0xc4bfb3, 0x9e9a90, 0xb3ab9c, 0xa6a89c, 0x9aa090];
  // jittered seed points on the wall face
  const cellW = 0.55, cellH = 0.36;
  const nx = Math.max(2, Math.round(L / cellW)), ny = Math.max(1, Math.round(bodyH / cellH));
  const pts = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const off = (j % 2) * 0.5;
      pts.push([-L / 2 + ((i + 0.5 + off * (i < nx - 1 ? 1 : 0)) / nx) * L + (r() - 0.5) * cellW * 0.55, ((j + 0.5) / ny) * bodyH + (r() - 0.5) * cellH * 0.5]);
    }
  }
  const gap = 0.018;
  const batter = 0.06;
  pts.forEach(([px, py], i) => {
    let poly = [[-L / 2, 0], [L / 2, 0], [L / 2, bodyH], [-L / 2, bodyH]];
    for (let k = 0; k < pts.length; k++) {
      if (k === i) continue;
      const [qx, qy] = pts[k];
      if (Math.abs(qx - px) > 2.5 * cellW || Math.abs(qy - py) > 3 * cellH) continue;
      poly = clipHalf(poly, (px + qx) / 2, (py + qy) / 2, qx - px, qy - py);
      if (poly.length < 3) return;
    }
    // shrink for mortar gaps
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x; cy += y; }
    cx /= poly.length; cy /= poly.length;
    poly = poly.map(([x, y]) => {
      const dx = cx - x, dy = cy - y;
      const l = Math.hypot(dx, dy) || 1;
      return [x + (dx / l) * gap, y + (dy / l) * gap];
    });
    const zf = D / 2 - batter * (cy / bodyH) + range(r, -0.01, 0.025);
    const g = stoneFromPoly(poly, zf, -D / 2 + 0.05, range(r, 0.035, 0.055), range(r, 0.004, 0.014));
    const c = new THREE.Color(palette[Math.floor(r() * palette.length)]);
    c.offsetHSL(0, 0, (r() - 0.5) * 0.06);
    b.add(paint(g, c), m);
  });
  // dark core behind the stones (mortar / shadow in the joints)
  b.add(paint(box(L - 0.02, bodyH, D - 0.2), new THREE.Color(0x3d3c38)), m, { pos: [0, bodyH / 2, -0.02], cast: false });
  // cap stones (笠石)
  let x = -L / 2;
  while (x < L / 2 - 0.01) {
    const w = range(r, 0.9, 1.4);
    const x1 = Math.min(L / 2, x + w);
    if (x1 - x > 0.15) {
      const g = bevelBox(x1 - x - 0.02, capH, D + 0.06, 0.035, 0.9);
      T(g, [(x + x1) / 2, bodyH + capH / 2, 0.0 - batter * 0.5]);
      const c = new THREE.Color(palette[Math.floor(r() * palette.length)]);
      b.add(paint(g, c), m);
    }
    x += w;
  }
  const g = b.build();
  g.name = 'stoneWall';
  g.userData.collider = { type: 'box', w: L, d: D + 0.1 };
  return g;
}

// ---------------------------------------------------------------------------
// 15. 釣灯籠 hanging bronze lantern on a wooden post arm
// ---------------------------------------------------------------------------
export function createToro(opts = {}) {
  const { lit = true, seed = 1 } = opts;
  const b = new Builder();
  const wood = getMat('woodDark');
  const br = SM.bronze();
  const panel = lit ? SM.lanternLit() : SM.lanternDark();
  const G = SM.granite();
  // post + arm + brace
  b.add(bevelBox(0.32, 0.16, 0.32, 0.025, 0.7), G, { pos: [0, 0.08, 0] });
  b.add(postY(0, 0, 0.16, 2.72, 0.15, 0.15, 0.02, 1.2), wood);
  b.add(bevelBox(0.26, 0.06, 0.26, 0.015), wood, { pos: [0, 2.75, 0] });
  b.add(beamX(-0.1, 0.86, 2.6, 0, 0.1, 0.12, 0.015, 1.2), wood);
  const brace = sweep([V3(0.05, 2.12, 0), V3(0.22, 2.32, 0), V3(0.42, 2.55, 0)], chamferRect(0.07, 0.07, 0.01), { perp: true });
  b.add(brace, wood);
  b.add(bevelBox(0.06, 0.14, 0.14, 0.01), br, { pos: [0.87, 2.6, 0], cast: false }); // metal end cap
  // hook & chain
  const hx = 0.72;
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.TorusGeometry(0.028, 0.007, 5, 10);
    b.add(ring, br, { pos: [hx, 2.5 - k * 0.048, 0], rot: [0, k % 2 ? PI / 2 : 0, 0], cast: false });
  }
  // lantern body (hexagonal)
  const hx6 = -PI / 6;
  const yT = 2.37, yRoof = 2.3, yBody1 = 2.12, yBody0 = 1.82;
  b.add(new THREE.TorusGeometry(0.035, 0.01, 6, 12), br, { pos: [hx, yT + 0.02, 0], cast: false });
  b.add(lathe([[0.001, yRoof + 0.06], [0.04, yRoof + 0.06], [0.05, yRoof + 0.02], [0.03, yRoof - 0.02], [0.001, yRoof - 0.02]], 10), br, { pos: [hx, 0, 0] });
  const oc = [], ic = [], sc = [];
  for (let k = 0; k < 6; k++) {
    const a = hx6 + (k * TAU) / 6;
    oc.push([hx + Math.sin(a) * 0.27, Math.cos(a) * 0.27]);
    ic.push([hx + Math.sin(a) * 0.05, Math.cos(a) * 0.05]);
    sc.push([hx + Math.sin(a) * 0.17, Math.cos(a) * 0.17]);
  }
  const roof = hipRoof({
    outer: oc, inner: ic, soffitInner: sc, yEave: yBody1 + 0.04, yTop: yRoof, ySoffitIn: yBody1 + 0.02, lift: 0.045, flare: 0.01,
    curveA: 0.25, curvePow: 1.8, thick: 0.03, split: 0.5, segS: 4, segT: 3, segSoffit: 1, tile: 0.5, rafter: 0.5, soffitMode: 'planar', bandMode: 'plain',
  });
  for (const k2 of ['top', 'edge', 'band', 'soffit']) if (roof[k2]) b.add(roof[k2], br);
  for (let k = 0; k < 6; k++) {
    const a = hx6 + (k * TAU) / 6;
    const rad = V3(Math.sin(a), 0, Math.cos(a));
    const tip = V3(hx + rad.x * 0.28, yBody1 + 0.04 + 0.045, rad.z * 0.28);
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const f = i / 6, phi = f * 1.5 * PI, rho = 0.03 * (1 - 0.4 * f);
      pts.push(tip.clone().addScaledVector(rad, rho * Math.sin(phi)).add(V3(0, rho * (1 - Math.cos(phi)), 0)));
    }
    b.add(tube(pts, { segs: 6, radial: 5, radius: 0.011, capEnd: true }), br, { cast: false });
  }
  // body: glowing lattice panels + bronze frame
  b.add(lathe([[0.001, yBody0], [0.16, yBody0], [0.16, yBody1], [0.001, yBody1]], 6, { phase: hx6, flat: true }), panel, { pos: [hx, 0, 0], cast: false });
  const pan = panel;
  void pan;
  for (let k = 0; k < 6; k++) {
    const a = hx6 + (k * TAU) / 6;
    b.add(bevelBox(0.024, yBody1 - yBody0, 0.024, 0.004), br, { pos: [hx + Math.sin(a) * 0.165, (yBody0 + yBody1) / 2, Math.cos(a) * 0.165], rot: [0, a, 0], cast: false });
  }
  b.add(lathe([[0.001, yBody1], [0.19, yBody1], [0.19, yBody1 + 0.025], [0.001, yBody1 + 0.025]], 6, { phase: hx6, flat: true }), br, { pos: [hx, 0, 0] });
  b.add(lathe([[0.001, yBody0 - 0.07], [0.12, yBody0 - 0.07], [0.19, yBody0 - 0.02], [0.19, yBody0], [0.001, yBody0]], 6, { phase: hx6, flat: true }), br, { pos: [hx, 0, 0] });
  b.add(lathe([[0.001, yBody0 - 0.16], [0.02, yBody0 - 0.13], [0.035, yBody0 - 0.1], [0.02, yBody0 - 0.07], [0.001, yBody0 - 0.07]], 8), br, { pos: [hx, 0, 0], cast: false });
  const g = b.build();
  g.name = lit ? 'toro_lit' : 'toro';
  g.userData.collider = { type: 'circle', r: 0.2 };
  return g;
}
