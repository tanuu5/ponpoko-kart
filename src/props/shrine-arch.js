// Hero architecture for the shrine set: 五重塔 pagoda, 拝殿 worship hall, 天守閣 castle keep.
import * as THREE from 'three';
import { getMat } from './materials.js';
import { rng, cableGeometry } from './util.js';
import {
  Builder, T, bevelBox, box, cylY, lathe, tube, sweep, grid, hipRoof, gableRoof, karaHafu, shide, twistedRope, giboshiGeo,
  extrudeShape, mergeParts, PI, TAU, lerp, V3, chamferRect, beamX, beamZ, postY,
} from './shrine-geo.js';
import { SM, HALL_ATLAS, atlasUV } from './shrine-tex.js';

const SIDES = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // outward normals (x, z): front, right, back, left
const square = (h) => [[-h, h], [h, h], [h, -h], [-h, -h]];

/** Square ring of 4 beams around a body of half-size `half` (beam centerlines on the square). */
function ringBeams(b, m, half, y, hgt, dep, chamfer = 0.015, ext = 0, cast = true) {
  const L = half + dep / 2 + ext;
  if (chamfer <= 0) {
    // plain boxes (cheap, for small repeated beams)
    b.add(box(2 * L, hgt, dep), m, { pos: [0, y, half], cast });
    b.add(box(2 * L, hgt, dep), m, { pos: [0, y, -half], cast });
    b.add(box(dep, hgt, 2 * half - dep), m, { pos: [half, y, 0], cast });
    b.add(box(dep, hgt, 2 * half - dep), m, { pos: [-half, y, 0], cast });
    return;
  }
  b.add(beamX(-L, L, y, half, dep, hgt, chamfer), m);
  b.add(beamX(-L, L, y, -half, dep, hgt, chamfer), m);
  b.add(beamZ(-half + dep / 2, half - dep / 2, y, half, dep, hgt, chamfer), m);
  b.add(beamZ(-half + dep / 2, half - dep / 2, y, -half, dep, hgt, chamfer), m);
}

/** Plane facing outward from a side of a square body, UV from an atlas rect [u0,v0,u1,v1]. */
function sidePlane(w, h, uvRect) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(uvRect[0], uvRect[2], uv.getX(i)), lerp(uvRect[1], uvRect[3], uv.getY(i)));
  return g;
}
/** Place geometry built facing +Z onto side (nx,nz) at distance d, tangent offset t. */
function onSide(g, nx, nz, d, t, y) {
  const rotY = Math.atan2(nx, nz);
  const tx = nz, tz = -nx; // tangent (right-hand when facing the side)
  return T(g, [nx * d + tx * t, y, nz * d + tz * t], [0, rotY, 0]);
}

/**
 * Stepped bracket band (tokyō / kumimono suggestion): corbelled arms + blocks at each post,
 * diagonal clusters at the corners, and beams ringing each step. Returns the top y of the last beam.
 */
function bracketBand(b, m, { half, y0, s, posts = [-1 / 3, 1 / 3], steps = 3, reach0 = 0.36 }) {
  const reach = [];
  for (let k = 0; k < steps; k++) reach.push(reach0 * (k + 1) * s);
  const armH = 0.15 * s, armW = 0.16 * s, blk = 0.24 * s, blkH = 0.13 * s;
  const beamH = 0.14 * s, beamD = 0.13 * s;
  const lvl = (k) => y0 + k * (armH + blkH + beamH) + armH / 2;
  for (const [nx, nz] of SIDES) {
    for (const p of posts) {
      const tx = nz, tz = -nx;
      const cx = nx * half + tx * p * half, cz = nz * half + tz * p * half;
      for (let k = 0; k < steps; k++) {
        const len = reach[k] + 0.14 * s;
        const arm = nx !== 0 ? box(len, armH, armW) : box(armW, armH, len);
        b.add(arm, m, { pos: [cx + nx * (len / 2 - 0.1 * s), lvl(k), cz + nz * (len / 2 - 0.1 * s)], cast: k === steps - 1 });
        b.add(box(blk, blkH, blk), m, { pos: [cx + nx * reach[k], lvl(k) + armH / 2 + blkH / 2, cz + nz * reach[k]], cast: false });
      }
    }
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let k = 0; k < steps; k++) {
      const len = reach[k] * Math.SQRT2 + 0.2 * s;
      const arm = box(len, armH, armW);
      const ang = Math.atan2(-sz, sx);
      const d = len / 2 - 0.1 * s;
      b.add(arm, m, { pos: [sx * half + (sx * d) / Math.SQRT2, lvl(k), sz * half + (sz * d) / Math.SQRT2], rot: [0, ang, 0], cast: k === steps - 1 });
      b.add(box(blk, blkH, blk), m, { pos: [sx * (half + reach[k]), lvl(k) + armH / 2 + blkH / 2, sz * (half + reach[k])], rot: [0, PI / 4, 0], cast: false });
    }
  }
  for (let k = 0; k < steps; k++) ringBeams(b, m, half + reach[k], lvl(k) + armH / 2 + blkH + beamH / 2, beamH, beamD, 0, 0.12 * s, k === steps - 1);
  return { top: lvl(steps - 1) + armH / 2 + blkH + beamH, outer: half + reach[steps - 1] };
}

/** Railing (高欄) around a square at half-size `h`, deck at y. */
function squareRailing(b, m, h, y, { height = 0.72, nPer = 3, post = 0.07, s = 1 } = {}) {
  for (const [nx, nz] of SIDES) {
    for (let i = 0; i <= nPer; i++) {
      const t = -h + (2 * h * i) / nPer;
      const tx = nz, tz = -nx;
      b.add(box(post * s, height, post * s), m, { pos: [nx * h + tx * t, y + height / 2, nz * h + tz * t], cast: false });
    }
  }
  ringBeams(b, m, h, y + height - 0.035 * s, 0.07 * s, 0.075 * s, 0, 0.1 * s, false);
  ringBeams(b, m, h, y + height * 0.55, 0.05 * s, 0.05 * s, 0, 0, false);
  ringBeams(b, m, h, y + 0.05 * s, 0.08 * s, 0.09 * s, 0, 0, false);
}

// ---------------------------------------------------------------------------
// 5. 五重塔 five-story pagoda
// ---------------------------------------------------------------------------
export function createPagoda(opts = {}) {
  const { seed = 1 } = opts;
  void seed;
  const b = new Builder();
  const V = getMat('vermilion');
  const W = getMat('plaster');
  const K = getMat('kawara');
  const E = SM.eave();
  const St = getMat('stone');
  const Au = getMat('gold');
  const Pn = SM.pagodaPanels();
  const Dk = getMat('woodDark');
  // --- podium (基壇) with steps on all four sides
  const podH = 0.9, podHalf = 5.9;
  b.add(bevelBox(2 * podHalf, podH, 2 * podHalf, 0.05, 1.8), St, { pos: [0, podH / 2, 0] });
  b.add(bevelBox(2 * podHalf + 0.16, 0.1, 2 * podHalf + 0.16, 0.03, 1.8), St, { pos: [0, podH - 0.03, 0] });
  for (const [nx, nz] of SIDES) {
    for (let k = 0; k < 3; k++) {
      const hh = (podH * (3 - k)) / 3;
      const d = podHalf + 0.18 + k * 0.36;
      const g = nx !== 0 ? box(0.36, hh, 2.8, 1.8) : box(2.8, hh, 0.36, 1.8);
      b.add(g, St, { pos: [nx * d, hh / 2, nz * d] });
    }
  }
  const tiers = [0, 1, 2, 3, 4].map((i) => ({ half: 3.2 - 0.26 * i, wallH: i === 0 ? 3.0 : 1.7, s: i === 0 ? 1 : 0.86, over: 2.7 - 0.1 * i }));
  let yF = podH;
  let topInfo = null;
  for (let i = 0; i < 5; i++) {
    const { half: h, wallH, s, over } = tiers[i];
    const yW1 = yF + wallH;
    // posts (round) at corners and bay divisions
    const pr = 0.15 * s;
    const seen = new Set();
    for (const [nx, nz] of SIDES) {
      for (const p of [-1, -1 / 3, 1 / 3, 1]) {
        const tx = nz, tz = -nx;
        const x = +(nx * h + tx * p * h).toFixed(3), z = +(nz * h + tz * p * h).toFixed(3);
        const key = `${x},${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        b.add(cylY(pr, pr * 0.95, yF, yW1 + 0.25 * s, 12, { open: true }), V, { pos: [x, 0, z] });
      }
    }
    // doors (center bay) & lattice windows (side bays of the ground floor)
    const bay = (2 * h) / 3;
    const doorH = wallH * 0.74 - 0.2;
    for (const [nx, nz] of SIDES) {
      b.add(onSide(sidePlane(bay - 2 * pr - 0.04, doorH, [0, 0, 0.5, 1]), nx, nz, h - 0.01, 0, yF + 0.18 + doorH / 2), Pn, { cast: false });
      if (i === 0) {
        for (const t of [-bay, bay]) {
          b.add(onSide(sidePlane(bay - 2 * pr - 0.3, 0.95, [0.5, 0, 1, 1]), nx, nz, h - 0.01, t, yF + wallH * 0.74 - 0.62), Pn, { cast: false });
        }
      }
    }
    // plaster core up into the bracket band (white walls between brackets)
    const brTopGuess = yW1 + 0.2 * s + 3 * (0.15 + 0.13 + 0.14) * s;
    b.add(box(2 * h - 0.05, brTopGuess - yF - 0.05, 2 * h - 0.05, 2), W, { pos: [0, (yF + brTopGuess - 0.05) / 2, 0] });
    // nageshi (horizontal tie beams)
    ringBeams(b, V, h + 0.02, yF + 0.09 * s, 0.18 * s, 0.1 * s, 0);
    ringBeams(b, V, h + 0.02, yF + wallH * 0.74, 0.15 * s, 0.1 * s, 0);
    ringBeams(b, V, h + 0.02, yW1 + 0.1 * s, 0.2 * s, 0.14 * s, 0.015, 0.15 * s);
    // brackets
    const br = bracketBand(b, V, { half: h, y0: yW1 + 0.2 * s, s });
    // roof
    const isTop = i === 4;
    const next = tiers[i + 1];
    const e = h + over;
    const yEave = br.top - 0.3 * s;
    const innerHalf = isTop ? 0.45 : next.half + 0.12;
    const run = e - innerHalf;
    const yTop = yEave + run * (isTop ? 0.62 : 0.5);
    const roof = hipRoof({
      outer: square(e), inner: square(innerHalf), soffitInner: square(br.outer), yEave, yTop, ySoffitIn: br.top,
      lift: 0.55 * s, liftPow: 2.6, flare: 0.28 * s, flarePow: 2.2, curveA: 0.28, curvePow: 2.1, thick: 0.55 * s, split: 0.38,
      segS: 10, segT: 6, segSoffit: 2, tile: 2.4, rafter: 1.0,
      ridge: { w: 0.34 * s, h: 0.26 * s, ext: 0.45 * s, curl: 0.3 * s, steps: 6 },
    });
    b.add(roof.top, K);
    b.add(roof.edge, K);
    b.add(roof.ridges, K);
    b.add(roof.band, E);
    b.add(roof.soffit, E);
    // wind bells (風鐸) under the four corners
    for (let k = 0; k < 4; k++) {
      const c = roof.flared[k];
      const bis = V3(c.x, 0, c.y).normalize();
      const p = V3(c.x, yEave + 0.55 * s - 0.55 * s * 0.4, c.y).addScaledVector(bis, -0.1);
      b.add(cylY(0.012, 0.012, p.y - 0.25, p.y, 4), Au, { pos: [p.x, 0, p.z], cast: false });
      b.add(lathe([[0.001, 0], [0.085, 0.01], [0.1, 0.06], [0.09, 0.2], [0.05, 0.26], [0.001, 0.28]], 8), Au, { pos: [p.x, p.y - 0.52, p.z], cast: false });
      b.add(box(0.1, 0.12, 0.012), Au, { pos: [p.x, p.y - 0.62, p.z], cast: false });
    }
    if (!isTop) {
      yF = yTop + 0.28 * s;
      // balcony (縁 + 高欄) of the next tier sitting on this roof
      const nh = next.half, ns = next.s;
      const deckOut = nh + 0.62;
      for (const [nx, nz] of SIDES) {
        const g = nx !== 0 ? box(deckOut - nh + 0.05, 0.12, 2 * deckOut, 1.2) : box(2 * deckOut, 0.12, deckOut - nh + 0.05, 1.2);
        b.add(g, Dk, { pos: [nx * (nh + deckOut) / 2, yF - 0.06, nz * (nh + deckOut) / 2] });
      }
      ringBeams(b, V, deckOut - 0.03, yF - 0.2, 0.16, 0.1, 0);
      ringBeams(b, V, nh + 0.35, yF - 0.38, 0.22, 0.14, 0);
      squareRailing(b, V, deckOut - 0.1, yF, { height: 0.72, nPer: 4, s: ns });
    } else {
      topInfo = { y: yTop, corners: roof.flared, yCorner: yEave + 0.55 * s };
    }
  }
  // --- 相輪 sōrin spire
  const ys = topInfo.y - 0.15;
  b.add(bevelBox(1.15, 0.5, 1.15, 0.04), Au, { pos: [0, ys + 0.25, 0] }); // 露盤
  b.add(lathe([[0.5, ys + 0.5], [0.56, ys + 0.62], [0.52, ys + 0.82], [0.36, ys + 0.98], [0.14, ys + 1.05], [0.1, ys + 1.06]], 16), Au); // 伏鉢
  b.add(lathe([[0.12, ys + 1.05], [0.26, ys + 1.12], [0.42, ys + 1.28], [0.44, ys + 1.34], [0.3, ys + 1.3], [0.12, ys + 1.3]], 16), Au); // 請花
  const yr0 = ys + 1.55;
  b.add(cylY(0.11, 0.08, ys + 1.0, yr0 + 9 * 0.4 + 2.4, 10), Au); // 擦管
  for (let k = 0; k < 9; k++) {
    const R = lerp(0.6, 0.46, k / 8);
    b.add(new THREE.TorusGeometry(R, 0.065, 5, 16), Au, { pos: [0, yr0 + k * 0.4, 0], rot: [PI / 2, 0, 0] });
    b.add(cylY(0.13, 0.13, yr0 + k * 0.4 - 0.05, yr0 + k * 0.4 + 0.05, 8), Au, { cast: false });
  }
  // 水煙 flame-shaped openwork wings
  const ySu = yr0 + 9 * 0.4 - 0.05;
  const flame = new THREE.Shape();
  flame.moveTo(0.06, 0);
  flame.bezierCurveTo(0.35, 0.05, 0.62, 0.35, 0.5, 0.62);
  flame.bezierCurveTo(0.68, 0.76, 0.6, 1.02, 0.42, 1.12);
  flame.bezierCurveTo(0.5, 1.3, 0.3, 1.48, 0.12, 1.6);
  flame.lineTo(0.06, 1.6);
  flame.lineTo(0.06, 0);
  for (const [cx, cy, rx, ry] of [[0.3, 0.45, 0.1, 0.13], [0.3, 0.9, 0.08, 0.12], [0.2, 1.28, 0.05, 0.09]]) {
    const hole = new THREE.Path();
    hole.absellipse(cx, cy, rx, ry, 0, TAU, true);
    flame.holes.push(hole);
  }
  for (let k = 0; k < 4; k++) b.add(extrudeShape(flame, 0.05, { curveSegments: 6 }), Au, { pos: [0, ySu, 0], rot: [0, (k * PI) / 2 + PI / 4, 0] });
  b.add(new THREE.TorusGeometry(0.2, 0.05, 6, 14), Au, { pos: [0, ySu + 1.75, 0], rot: [PI / 2, 0, 0] }); // 竜車
  b.add(lathe([[0.001, ySu + 1.85], [0.14, ySu + 1.92], [0.2, ySu + 2.05], [0.18, ySu + 2.18], [0.1, ySu + 2.3], [0.03, ySu + 2.38], [0.001, ySu + 2.42]], 12), Au); // 宝珠
  // chains (宝鎖) from the spire to the top roof corners
  for (const c of topInfo.corners) {
    const a = V3(0, ySu + 0.2, 0);
    const bb = V3(c.x * 0.93, topInfo.yCorner + 0.1, c.y * 0.93);
    b.add(cableGeometry(a, bb, 0.35, 0.025, 14), Au, { cast: false });
  }
  const g = b.build();
  g.name = 'pagoda';
  g.userData.collider = { type: 'box', w: 2 * podHalf + 2.2, d: 2 * podHalf + 2.2 };
  return g;
}


// ---------------------------------------------------------------------------
// 4. 拝殿 worship hall (nagare-zukuri, copper roof, kōhai over the steps)
// ---------------------------------------------------------------------------
function gegyoShape(scale = 1) {
  // 猪目懸魚: heart-shaped board with a heart-shaped hole and side fins
  const sh = new THREE.Shape();
  const k = scale;
  sh.moveTo(0, 0);
  sh.bezierCurveTo(0.2 * k, 0.02 * k, 0.34 * k, -0.2 * k, 0.24 * k, -0.4 * k);
  sh.bezierCurveTo(0.18 * k, -0.52 * k, 0.06 * k, -0.6 * k, 0, -0.72 * k);
  sh.bezierCurveTo(-0.06 * k, -0.6 * k, -0.18 * k, -0.52 * k, -0.24 * k, -0.4 * k);
  sh.bezierCurveTo(-0.34 * k, -0.2 * k, -0.2 * k, 0.02 * k, 0, 0);
  const hole = new THREE.Path();
  hole.moveTo(0, -0.2 * k);
  hole.bezierCurveTo(-0.1 * k, -0.12 * k, -0.16 * k, -0.28 * k, 0, -0.44 * k);
  hole.bezierCurveTo(0.16 * k, -0.28 * k, 0.1 * k, -0.12 * k, 0, -0.2 * k);
  sh.holes.push(hole);
  return sh;
}

export function createShrineHall(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 43 + 5);
  const b = new Builder();
  const V = getMat('vermilion');
  const W = getMat('plaster');
  const Cu = SM.copper();
  const E = SM.eave();
  const Wd = getMat('wood');
  const St = getMat('stone');
  const Au = getMat('gold');
  const A = SM.hallAtlas();
  const X0 = 4.2, ZF = 1.5, ZB = -3.5, YF = 1.2, YW = 4.3;
  const xFront = [-X0, -1.75, 1.75, X0];
  // --- stone footing & veranda platform
  b.add(bevelBox(2 * X0 + 2.5, 0.55, ZF - ZB + 1.7, 0.04, 1.4), St, { pos: [0, 0.275, (ZF + ZB) / 2 + 0.55] });
  b.add(box(2 * X0 + 0.1, 0.55, ZF - ZB + 0.1), A, { pos: [0, 0.55 + 0.25, (ZF + ZB) / 2] }); // shadowed under-floor
  atlasUV(b.buckets.get([...b.buckets.keys()].pop()).list.slice(-1)[0], HALL_ATLAS.dark);
  const deckX = X0 + 1.0, deckZ = ZF + 1.0;
  b.add(box(2 * deckX, 0.12, deckZ - ZB, 1.6), Wd, { pos: [0, YF - 0.06, (deckZ + ZB) / 2] });
  // veranda edge beam + short posts
  b.add(beamX(-deckX, deckX, YF - 0.2, deckZ - 0.06, 0.12, 0.18, 0.015), V);
  for (const sx of [-1, 1]) b.add(beamZ(ZB, deckZ, YF - 0.2, sx * (deckX - 0.06), 0.12, 0.18, 0.015), V);
  for (let i = 0; i <= 6; i++) {
    const x = -deckX + 0.1 + (i / 6) * (2 * deckX - 0.2);
    b.add(box(0.12, YF - 0.3 - 0.55, 0.12), V, { pos: [x, (YF - 0.3 + 0.55) / 2, deckZ - 0.12], cast: false });
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = ZB + 0.3 + (i / 3) * (deckZ - ZB - 0.5);
    b.add(box(0.12, YF - 0.3 - 0.55, 0.12), V, { pos: [sx * (deckX - 0.12), (YF - 0.3 + 0.55) / 2, z], cast: false });
  }
  // --- main pillars
  const pillars = [];
  for (const x of xFront) { pillars.push([x, ZF]); pillars.push([x, ZB]); }
  pillars.push([-X0, -1.0], [X0, -1.0]);
  for (const [x, z] of pillars) b.add(cylY(0.2, 0.19, 0.55, YW + 0.05, 16, { open: true }), V, { pos: [x, 0, z] });
  // --- walls: plaster core + front lattice doors / windows
  b.add(box(2 * X0 - 0.12, YW - YF, ZF - ZB - 0.12, 2), W, { pos: [0, (YF + YW) / 2, (ZF + ZB) / 2] });
  const dark = (w, h) => atlasUV(new THREE.PlaneGeometry(w, h), HALL_ATLAS.dark);
  b.add(dark(3.1, 2.1), A, { pos: [0, YF + 0.2 + 1.05, ZF - 0.055], cast: false });
  // lattice doors (格子戸)
  for (let i = 0; i <= 14; i++) b.add(box(0.045, 2.1, 0.05), V, { pos: [-1.55 + (i / 14) * 3.1, YF + 0.2 + 1.05, ZF - 0.02], cast: false });
  for (let j = 0; j <= 5; j++) b.add(box(3.1, 0.05, 0.06), V, { pos: [0, YF + 0.2 + (j / 5) * 2.1, ZF - 0.015], cast: false });
  b.add(box(0.07, 2.1, 0.08), V, { pos: [0, YF + 1.25, ZF - 0.01], cast: false });
  // side-bay lattice windows (連子窓)
  for (const sx of [-1, 1]) {
    const cx = sx * (X0 + 1.75) / 2;
    b.add(dark(1.7, 0.75), A, { pos: [cx, YF + 1.95, ZF - 0.055], cast: false });
    for (let i = 0; i <= 10; i++) b.add(box(0.04, 0.75, 0.05), V, { pos: [cx - 0.85 + (i / 10) * 1.7, YF + 1.95, ZF - 0.02], cast: false });
    b.add(box(1.8, 0.08, 0.08), V, { pos: [cx, YF + 1.55, ZF - 0.01], cast: false });
    b.add(box(1.8, 0.08, 0.08), V, { pos: [cx, YF + 2.35, ZF - 0.01], cast: false });
  }
  // nageshi rings
  const ringXZ = (y, h, d, ext = 0.1) => {
    b.add(beamX(-X0 - ext, X0 + ext, y, ZF + 0.01, d, h, 0.015), V);
    b.add(beamX(-X0 - ext, X0 + ext, y, ZB - 0.01, d, h, 0.015), V);
    for (const sx of [-1, 1]) b.add(beamZ(ZB, ZF, y, sx * (X0 + 0.01), d, h, 0.015), V);
  };
  ringXZ(YF + 0.1, 0.2, 0.12);
  ringXZ(YF + 2.35 + 0.05, 0.16, 0.12);
  ringXZ(YW - 0.1, 0.22, 0.16, 0.25);
  // --- roof (流造 nagare: long front slope over the kōhai)
  const roof = gableRoof({
    halfX: X0 + 1.6, zR: -1.0, yR: 8.3, zF: 5.9, yF: 3.85, zB: -5.2, yB: 4.55, lift: 0.38, liftPow: 2.5, flare: 0.25, flarePow: 2.5,
    curveA: 0.28, curvePow: 2.2, thick: 0.42, split: 0.42, segX: 16, segT: 12, tile: 2.4, rafter: 1.0,
    barge: { h: 0.62, d: 0.1, over: 0.05 }, gable: { x: X0, yBottom: YW - 0.05, zFront: ZF, zBack: ZB, seg: 12 },
    ridgeCap: { w: 0.55, h: 0.45, ext: 0.2 },
  });
  b.add(roof.top, Cu);
  b.add(roof.edge, Cu);
  b.add(roof.ridgeCap, Cu);
  b.add(roof.band, E);
  b.add(roof.soffit, E);
  b.add(roof.verge, E);
  b.add(roof.barge, V);
  b.add(roof.gable, W);
  const ySoff = (x, z) => roof.yAt(x, z) - roof.thick;
  // brackets (出三斗) on the wall pillars + purlins
  for (const [x, z] of pillars) {
    const onFB = Math.abs(z - ZF) < 0.01 || Math.abs(z - ZB) < 0.01;
    b.add(box(0.32, 0.16, 0.32), V, { pos: [x, YW + 0.08, z] });
    const arm = onFB ? box(1.0, 0.14, 0.16) : box(0.16, 0.14, 1.0);
    b.add(arm, V, { pos: [x, YW + 0.23, z] });
    for (const o of [-0.38, 0, 0.38]) b.add(box(0.2, 0.1, 0.2), V, { pos: [x + (onFB ? o : 0), YW + 0.35, z + (onFB ? 0 : o)], cast: false });
  }
  b.add(beamX(-X0 - 0.4, X0 + 0.4, YW + 0.5, ZF, 0.2, 0.2, 0.02), V);
  b.add(beamX(-X0 - 0.4, X0 + 0.4, YW + 0.5, ZB, 0.2, 0.2, 0.02), V);
  // plaster bands (小壁) between the purlins and the roof soffit, front & back
  for (const [z, sgn] of [[ZF - 0.03, 1], [ZB + 0.03, -1]]) {
    b.add(grid(12, 1, (u, k, p) => {
      const x = lerp(-X0, X0, u);
      return p.set(x, lerp(YW + 0.58, ySoff(x, z) + 0.03, k), z);
    }, { face: [0, 0, sgn] }), W);
  }
  // gable decoration: tie beam + king post, gold gegyo at the apex
  for (const sx of [-1, 1]) {
    const x = sx * (X0 + 0.02);
    b.add(beamZ(ZB - 0.3, ZF + 0.3, YW + 0.95, x, 0.16, 0.26, 0.02), V);
    b.add(postY(x, -1.0, YW + 1.05, ySoff(x, -1.0) - 0.02, 0.16, 0.16, 0.02), V);
    const gx = sx * (X0 + 1.72);
    b.add(extrudeShape(gegyoShape(1.0), 0.06, { curveSegments: 8 }), Au, { pos: [gx, 8.3 - 0.35, -1.0], rot: [0, PI / 2, 0], cast: false });
    for (const fz of [-1, 1]) {
      const fin = extrudeShape(gegyoShape(0.45), 0.05, { curveSegments: 6 });
      b.add(fin, Au, { pos: [gx, 8.3 - 0.75, -1.0 + fz * 0.3], rot: [0, PI / 2, fz * 0.9], cast: false });
    }
  }
  // chigi (crossed rafters) at both ridge ends + katsuogi logs on the ridge
  const yRidgeTop = 8.3 + 0.45 - 0.05;
  const angF = Math.atan2(0.5, 0.45) + 0.25, angB = angF + 0.1;
  for (const sx of [-1, 1]) {
    const x = sx * (X0 + 1.45);
    for (const [ang, sgn] of [[angF, 1], [angB, -1]]) {
      const board = bevelBox(0.14, 2.6, 0.34, 0.02);
      T(board, [0, 0.45, 0], null);
      T(board, [x, 8.2, -1.0], [sgn * (PI / 2 - ang) * -1, 0, 0]);
      b.add(board, Cu);
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = -3.0 + i * 1.5;
    const log = new THREE.CylinderGeometry(0.17, 0.17, 1.35, 14);
    b.add(log, Cu, { pos: [x, yRidgeTop + 0.16, -1.0], rot: [PI / 2, 0, 0] });
    for (const z of [-0.69, 0.69]) b.add(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 14), Au, { pos: [x, yRidgeTop + 0.16, -1.0 + z], rot: [PI / 2, 0, 0], cast: false });
  }
  // gold ridge-end fittings
  for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), Au, { pos: [sx * (X0 + 1.82), 8.3 + 0.18, -1.0], rot: [0, 0, PI / 2], cast: false });
  // --- veranda railing (高欄) with giboshi at the stair ends
  const yRail = YF;
  const railRun = (pts) => {
    b.add(tube(pts.map((p) => V3(p[0], yRail + 0.82, p[1])), { segs: 8, radial: 8, radius: 0.045, curveType: 'catmullrom' }), V);
    b.add(sweep(pts.map((p) => V3(p[0], yRail + 0.48, p[1])), chamferRect(0.06, 0.1, 0.01), { perp: false }), V);
    b.add(sweep(pts.map((p) => V3(p[0], yRail + 0.06, p[1])), chamferRect(0.1, 0.12, 0.012), { perp: false }), V);
  };
  const rx = deckX - 0.12, rz = deckZ - 0.12;
  for (const sx of [-1, 1]) {
    railRun([[sx * rx, ZB + 0.1], [sx * rx, rz]]);
    railRun([[sx * rx, rz], [sx * 1.62, rz]]);
    for (let i = 0; i <= 5; i++) {
      const z = ZB + 0.1 + (i / 5) * (rz - ZB - 0.1);
      b.add(box(0.09, 0.82, 0.09), V, { pos: [sx * rx, yRail + 0.41, z], cast: false });
    }
    for (let i = 0; i <= 3; i++) {
      const x = sx * lerp(rx, 1.62, i / 3);
      b.add(box(0.09, 0.82, 0.09), V, { pos: [x, yRail + 0.41, rz], cast: false });
    }
  }
  // --- steps (木階) with sloped railings and giboshi posts
  const nSt = 5, zTop = deckZ, zBot = deckZ + 1.6;
  for (let k = 0; k < nSt; k++) {
    const y = YF - ((k + 1) * YF) / (nSt + 1);
    const z = zTop + ((k + 0.5) * (zBot - zTop)) / nSt;
    b.add(box(2.9, 0.07, (zBot - zTop) / nSt + 0.04, 1.2), Wd, { pos: [0, y + 0.035, z] });
  }
  for (const sx of [-1, 1]) {
    const x = sx * 1.52;
    b.add(sweep([V3(x, YF - 0.12, zTop - 0.1), V3(x, -0.12, zBot + 0.05)], chamferRect(0.1, 0.34, 0.015), { perp: true }), V);
    const x2 = sx * 1.62;
    b.add(tube([V3(x2, yRail + 0.82, rz), V3(x2, 0.95, zBot)], { segs: 4, radial: 8, radius: 0.045 }), V);
    b.add(sweep([V3(x2, yRail + 0.48, rz), V3(x2, 0.6, zBot)], chamferRect(0.06, 0.1, 0.01), { perp: true }), V);
    for (const [z, y0, h] of [[rz, yRail, 1.05], [zBot, 0, 1.15]]) {
      b.add(postY(x2, z, y0, y0 + h, 0.16, 0.16, 0.02), V);
      b.add(giboshiGeo(0.1, 14), Au, { pos: [x2, y0 + h, z] });
    }
  }
  // --- 向拝 kōhai: pillars, rainbow beam, kaerumata, shrimp beams
  const kz = 4.45, kx = 1.75;
  for (const sx of [-1, 1]) {
    b.add(bevelBox(0.5, 0.2, 0.5, 0.03), St, { pos: [sx * kx, 0.1, kz] });
    b.add(postY(sx * kx, kz, 0.2, 3.5, 0.25, 0.25, 0.035), V);
    b.add(box(0.36, 0.16, 0.36), V, { pos: [sx * kx, 3.58, kz] });
    b.add(box(0.2, 0.16, 0.95), V, { pos: [sx * kx, 3.58, kz - 0.2] });
    // 海老虹梁 connecting to the main pillars
    b.add(sweep([V3(sx * kx, 3.0, kz), V3(sx * kx, 2.85, kz - 0.9), V3(sx * kx, 3.35, kz - 1.9), V3(sx * kx, 3.8, ZF)], chamferRect(0.14, 0.24, 0.02), { perp: true }), V);
  }
  const kPath = [];
  for (let i = 0; i <= 8; i++) {
    const x = lerp(-kx - 0.2, kx + 0.2, i / 8);
    kPath.push(V3(x, 3.02 + 0.08 * Math.sin((i / 8) * PI), kz));
  }
  b.add(sweep(kPath, chamferRect(0.2, 0.3, 0.025), { perp: false }), V);
  b.add(beamX(-kx - 0.9, kx + 0.9, 3.72, kz, 0.2, 0.2, 0.02), V);
  const kae = new THREE.Shape();
  kae.moveTo(-0.45, 0);
  kae.bezierCurveTo(-0.42, 0.22, -0.18, 0.3, -0.08, 0.36);
  kae.lineTo(0.08, 0.36);
  kae.bezierCurveTo(0.18, 0.3, 0.42, 0.22, 0.45, 0);
  kae.lineTo(0.3, 0);
  kae.bezierCurveTo(0.22, 0.14, 0.1, 0.2, 0, 0.2);
  kae.bezierCurveTo(-0.1, 0.2, -0.22, 0.14, -0.3, 0);
  kae.lineTo(-0.45, 0);
  b.add(extrudeShape(kae, 0.12, { curveSegments: 6 }), V, { pos: [0, 3.17, kz] });
  b.add(new THREE.SphereGeometry(0.08, 10, 8), Au, { pos: [0, 3.3, kz + 0.07], cast: false });
  // --- shimenawa between the kōhai pillars + shide + sagari
  const ropePts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    ropePts.push(V3(lerp(-kx + 0.12, kx - 0.12, t), 3.28 - 0.3 * Math.sin(t * PI), kz + 0.02));
  }
  const rope = twistedRope(ropePts, { radius: (t) => 0.07 + 0.17 * Math.pow(Math.sin(t * PI), 0.8), strands: 3, twist: 0.9, segs: 40, radial: 7, uvV: 1 });
  atlasUV(rope, HALL_ATLAS.straw, { wrapV: 8 });
  b.add(rope, A);
  const ropeY = (x) => 3.28 - 0.3 * Math.sin(((x + kx - 0.12) / (2 * kx - 0.24)) * PI);
  for (const x of [-1.15, -0.5, 0.5, 1.15]) {
    const sg = atlasUV(shide(0.62, 0.11, 0.008), HALL_ATLAS.paper);
    const rr = 0.07 + 0.17 * Math.pow(Math.sin(((x + kx - 0.12) / (2 * kx - 0.24)) * PI), 0.8);
    b.add(sg, A, { pos: [x, ropeY(x) - rr * 0.7, kz + 0.06], cast: false });
  }
  for (const x of [-0.82, 0.82]) {
    const sag = tube([V3(x, ropeY(x) - 0.1, kz + 0.02), V3(x, ropeY(x) - 0.35, kz + 0.03), V3(x, ropeY(x) - 0.55, kz + 0.02)], { segs: 4, radial: 7, radius: (t) => 0.06 * (1 - 0.55 * t) + 0.01, capEnd: true, uvV: 1 });
    b.add(atlasUV(sag, HALL_ATLAS.straw, { wrapV: 1 }), A, { cast: false });
  }
  // --- bell (鈴) and bell rope (鈴緒) hanging in front of the kōhai
  const bz = 5.3, by = 3.05;
  b.add(cylY(0.015, 0.015, by + 0.2, ySoff(0, bz) + 0.05, 4), Au, { pos: [0, 0, bz], cast: false });
  b.add(lathe([[0.001, by - 0.2], [0.1, by - 0.19], [0.18, by - 0.12], [0.21, by], [0.18, by + 0.12], [0.1, by + 0.19], [0.001, by + 0.21]], 16), Au, { pos: [0, 0, bz] });
  b.add(new THREE.TorusGeometry(0.21, 0.018, 6, 20), Au, { pos: [0, by - 0.02, bz], rot: [PI / 2, 0, 0], cast: false });
  b.add(new THREE.TorusGeometry(0.05, 0.015, 6, 12), Au, { pos: [0, by + 0.24, bz], cast: false });
  const suzuo = tube([V3(0, by - 0.18, bz), V3(0.02, by - 0.9, bz + 0.03), V3(-0.01, 1.5, bz + 0.05), V3(0, 1.0, bz + 0.04)], { segs: 12, radial: 8, radius: (t) => 0.045 + 0.02 * Math.max(0, (t - 0.85) / 0.15), capEnd: true, uvV: 1 });
  b.add(atlasUV(suzuo, HALL_ATLAS.suzuo, { wrapV: 1.2 }), A);
  // --- 賽銭箱 offering box with slatted top
  const bxz = 4.92;
  b.add(bevelBox(1.6, 0.72, 0.72, 0.03, 1.2), Wd, { pos: [0, 0.36, bxz] });
  b.add(atlasUV(new THREE.PlaneGeometry(1.5, 0.62), HALL_ATLAS.saisen), A, { pos: [0, 0.37, bxz + 0.362], cast: false });
  const slat = new THREE.Shape();
  slat.moveTo(-0.06, 0);
  slat.lineTo(0.06, 0);
  slat.lineTo(0, 0.08);
  slat.lineTo(-0.06, 0);
  for (let i = 0; i < 7; i++) b.add(extrudeShape(slat, 1.55, { curveSegments: 1 }), Wd, { pos: [0, 0.72, bxz - 0.3 + i * 0.1], rot: [0, PI / 2, 0], cast: false });
  for (const sx of [-1, 1]) b.add(box(0.06, 0.1, 0.74), Au, { pos: [sx * 0.8, 0.66, bxz], cast: false });
  const g = b.build();
  g.name = 'shrineHall';
  g.userData.collider = { type: 'box', w: 2 * deckX + 0.4, d: 10 };
  void r;
  return g;
}

// ---------------------------------------------------------------------------
// 10. 天守閣 castle keep (background hero; bold silhouette)
// ---------------------------------------------------------------------------
const rect = (hx, hz) => [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]];

/** Chidori-hafu (triangular dormer gable) facing direction (nx,nz) placed at (cx, cz), base height y0. */
function chidoriHafu(b, M, { cx, cz, nx, nz, w, depth, y0, pitch = 0.9, thick = 0.35 }) {
  const halfX = depth / 2;
  const rise = (w / 2) * pitch;
  const roof = gableRoof({
    halfX, zR: 0, yR: y0 + rise, zF: w / 2 + 0.35, yF: y0 - 0.05, zB: -w / 2 - 0.35, yB: y0 - 0.05, lift: 0.18, flare: 0.05,
    curveA: 0.45, curvePow: 1.8, thick, split: 0.5, segX: 4, segT: 5, tile: 2.4, rafter: 2, soffitMode: 'plain',
    barge: { h: thick * 1.9, d: 0.16, steps: 5 }, gable: { x: halfX - 0.25, yBottom: y0 - 1.0, zFront: w / 2, zBack: -w / 2, seg: 8 },
    front: true, back: true,
  });
  const rotY = Math.atan2(nz, nx); // local +X -> (nx, nz)
  const place = (g) => T(g, [cx, 0, cz], [0, -rotY, 0]);
  b.add(place(roof.top), M.K);
  b.add(place(roof.edge), M.K);
  b.add(place(roof.band), M.W);
  b.add(place(roof.soffit), M.W);
  b.add(place(roof.verge), M.W);
  b.add(place(roof.barge), M.Bk);
  b.add(place(roof.gable), M.W);
  // gold gegyo + ridge end tile
  const gg = extrudeShape(gegyoShape(0.9), 0.08, { curveSegments: 6 });
  T(gg, [halfX + 0.1, y0 + rise - 0.25, 0], [0, PI / 2, 0]);
  b.add(place(gg), M.Au, { cast: false });
  const ridge = beamX(-halfX, halfX + 0.25, y0 + rise + 0.12, 0, 0.35, 0.3, 0.05, 2.4);
  b.add(place(ridge), M.K);
}

/** Stylized golden shachihoko (tiger-fish ridge ornament); faces +X (outward), tail up. */
function shachihoko(size = 1.4) {
  const k = size / 1.4;
  const pts = [V3(0.35, 0.25, 0), V3(0.05, 0.45, 0), V3(-0.12, 0.85, 0), V3(-0.02, 1.2, 0), V3(0.25, 1.42, 0)].map((p) => p.multiplyScalar(k));
  const body = tube(pts, { segs: 14, radial: 10, radius: (t) => k * (0.26 * (1 - t) + 0.05 + 0.08 * Math.sin(t * PI)), capStart: true, capEnd: false });
  const parts = [body];
  // tail fin (two lobes)
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.bezierCurveTo(0.25, 0.05, 0.45, 0.25, 0.42, 0.5);
  fin.bezierCurveTo(0.3, 0.35, 0.18, 0.3, 0.05, 0.32);
  fin.bezierCurveTo(-0.05, 0.5, -0.2, 0.6, -0.35, 0.62);
  fin.bezierCurveTo(-0.25, 0.4, -0.15, 0.15, 0, 0);
  const f = extrudeShape(fin, 0.06 * k, { curveSegments: 5 });
  T(f, [0.25 * k, 1.38 * k, 0], [0, 0, -0.35], k);
  parts.push(f);
  // dorsal fin + eyes bump
  const dfin = new THREE.Shape();
  dfin.moveTo(0, 0);
  dfin.lineTo(0.28, 0.02);
  dfin.lineTo(0.1, 0.25);
  dfin.lineTo(0, 0);
  const d = extrudeShape(dfin, 0.05 * k, { curveSegments: 1 });
  T(d, [-0.3 * k, 0.78 * k, 0], [0, 0, 1.2], k);
  parts.push(d);
  parts.push(T(new THREE.SphereGeometry(0.2 * k, 10, 8), [0.4 * k, 0.25 * k, 0], null, [1.3, 0.9, 1.0]));
  return mergeParts(parts);
}

export function createCastle(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 53 + 17);
  const b = new Builder();
  const M = { W: SM.castleWhite(), K: SM.castleRoof(), St: getMat('stone'), Bk: getMat('blackLacquer'), Au: getMat('gold') };
  // --- ishigaki: concave "fan slope" stone base
  const H0 = 8.5;
  const bot = [13.5, 11.5], topH = [10.6, 8.6];
  const ishi = (u, v, p, side) => {
    // side 0:+z 1:+x 2:-z 3:-x ; u along side (0..1), v up (0..1)
    const inset = (1 - (1 - v) * (1 - v)); // steep at top, flared at bottom
    const hx = lerp(bot[0], topH[0], inset), hz = lerp(bot[1], topH[1], inset);
    const y = v * H0;
    if (side === 0) return p.set(lerp(-hx, hx, u), y, hz);
    if (side === 1) return p.set(hx, y, lerp(hz, -hz, u));
    if (side === 2) return p.set(lerp(hx, -hx, u), y, -hz);
    return p.set(-hx, y, lerp(-hz, hz, u));
  };
  for (let sd = 0; sd < 4; sd++) {
    const nrm = SIDES[sd];
    b.add(grid(14, 8, (u, v, p) => ishi(u, v, p, sd), {
      face: [nrm[0], 0.3, nrm[1]],
      uv: (i, j, u, v, P) => [(nrm[0] !== 0 ? P[j][i].z : P[j][i].x) / 6, P[j][i].y / 5],
    }), M.St);
  }
  b.add(box(2 * topH[0], 0.2, 2 * topH[1], 3), M.St, { pos: [0, H0 - 0.1, 0] });
  // --- stories
  const stories = [
    { hx: 9.6, hz: 7.6, wall: 4.0, over: 1.7 },
    { hx: 7.9, hz: 6.1, wall: 3.5, over: 1.55 },
    { hx: 6.4, hz: 4.9, wall: 3.3, over: 1.45 },
    { hx: 5.1, hz: 3.9, wall: 3.1, over: 1.35 },
    { hx: 4.2, hz: 3.2, wall: 3.2, over: 1.35 },
  ];
  let yF = H0;
  for (let i = 0; i < stories.length; i++) {
    const st = stories[i];
    const { hx, hz, wall, over } = st;
    const yW = yF + wall;
    // white walls + dark lower weatherboard band
    b.add(box(2 * hx, wall + 0.4, 2 * hz, 2), M.W, { pos: [0, yF + (wall + 0.4) / 2 - 0.2, 0] });
    b.add(box(2 * hx + 0.08, wall * 0.3, 2 * hz + 0.08, 2), M.Bk, { pos: [0, yF + wall * 0.15, 0] });
    b.add(box(2 * hx + 0.1, 0.12, 2 * hz + 0.1, 2), M.W, { pos: [0, yF + wall * 0.3 + 0.06, 0] });
    // windows (dark lattice windows with white bars)
    for (const [nx, nz] of SIDES) {
      const len = nx !== 0 ? 2 * hz : 2 * hx;
      const n = Math.max(2, Math.floor(len / 2.3));
      for (let k = 0; k < n; k++) {
        const t = -len / 2 + ((k + 0.5) / n) * len;
        const wy = yF + wall * 0.62;
        const px = nx !== 0 ? nx * (hx + 0.02) : t, pz = nz !== 0 ? nz * (hz + 0.02) : -t;
        const win = nx !== 0 ? box(0.12, 1.05, 0.95) : box(0.95, 1.05, 0.12);
        b.add(win, M.Bk, { pos: [px, wy, pz], cast: false });
        for (const o of [-0.22, 0.22]) {
          const bar = nx !== 0 ? box(0.14, 1.05, 0.07) : box(0.07, 1.05, 0.14);
          b.add(bar, M.W, { pos: [px + (nx !== 0 ? 0 : o), wy, pz + (nx !== 0 ? o : 0)], cast: false });
        }
      }
    }
    const isTop = i === stories.length - 1;
    const next = stories[i + 1];
    const ex = hx + over, ez = hz + over;
    const yEave = yW + 0.25;
    if (!isTop) {
      const ix = next.hx + 0.1, iz = next.hz + 0.1;
      const run = ((ex - ix) + (ez - iz)) / 2;
      const yTop = yEave + run * 0.62;
      const roof = hipRoof({
        outer: rect(ex, ez), inner: rect(ix, iz), soffitInner: rect(hx, hz), yEave, yTop, ySoffitIn: yW - 0.05,
        lift: 0.55, liftPow: 2.6, flare: 0.3, curveA: 0.35, curvePow: 1.8, thick: 0.5, split: 0.45,
        segS: 8, segT: 4, segSoffit: 1, tile: 2.4, rafter: 2, soffitMode: 'planar', bandMode: 'plain',
        ridge: { w: 0.4, h: 0.32, ext: 0.4, curl: 0.3, steps: 4 },
      });
      b.add(roof.top, M.K);
      b.add(roof.edge, M.K);
      b.add(roof.ridges, M.K);
      b.add(roof.band, M.W);
      b.add(roof.soffit, M.W);
      // gables on the roof slopes
      const yMid = lerp(yEave, yTop, 0.45);
      if (i === 0) {
        // kara-hafu on the front, chidori-hafu on the sides
        const kh = karaHafu({ halfW: 2.9, zBack: hz - 0.2, zFront: ez + 0.15, y0: yEave + 0.2, h: 1.25, thick: 0.35, bargeH: 0.55, bargeD: 0.2, segX: 18, segZ: 3, drop: 0.2 });
        b.add(kh.top, M.K);
        b.add(kh.soffit, M.W);
        b.add(kh.barge, M.Bk);
        b.add(grid(18, 1, (u, k, p) => {
          const x = lerp(-2.9, 2.9, u);
          return p.set(x, lerp(yEave - 0.35, kh.yAt(x, ez + 0.15) - 0.34, k), ez + 0.02);
        }, { face: [0, 0, 1] }), M.W);
        b.add(new THREE.SphereGeometry(0.28, 12, 8), M.Au, { pos: [0, yEave + 0.2 + 1.25 - 0.3, ez + 0.32], cast: false });
        for (const sx of [-1, 1]) chidoriHafu(b, M, { cx: sx * (ex - 1.9), cz: 0, nx: sx, nz: 0, w: 4.4, depth: 3.2, y0: yMid });
      } else if (i === 1) {
        chidoriHafu(b, M, { cx: 0, cz: ez - 1.8, nx: 0, nz: 1, w: 5.0, depth: 3.0, y0: yMid });
        chidoriHafu(b, M, { cx: 0, cz: -(ez - 1.8), nx: 0, nz: -1, w: 5.0, depth: 3.0, y0: yMid });
      } else if (i === 2) {
        for (const sx of [-1, 1]) chidoriHafu(b, M, { cx: sx * (ex - 1.6), cz: 0, nx: sx, nz: 0, w: 3.8, depth: 2.8, y0: yMid });
        chidoriHafu(b, M, { cx: 0, cz: ez - 1.55, nx: 0, nz: 1, w: 3.6, depth: 2.6, y0: yMid });
      }
      yF = yTop;
    } else {
      // top story: irimoya (hip skirt + gabled upper roof with side gables) + shachihoko
      const gx = hx - 0.7, gz = hz - 0.3;
      const ySk = yEave + 1.3;
      const skirt = hipRoof({
        outer: rect(ex, ez), inner: rect(gx, gz), soffitInner: rect(hx, hz), yEave, yTop: ySk, ySoffitIn: yW - 0.05,
        lift: 0.6, liftPow: 2.6, flare: 0.3, curveA: 0.35, curvePow: 1.8, thick: 0.5, split: 0.45,
        segS: 8, segT: 3, segSoffit: 1, tile: 2.4, rafter: 2, soffitMode: 'planar', bandMode: 'plain',
        ridge: { w: 0.4, h: 0.32, ext: 0.45, curl: 0.35, steps: 3 },
      });
      b.add(skirt.top, M.K);
      b.add(skirt.edge, M.K);
      b.add(skirt.ridges, M.K);
      b.add(skirt.band, M.W);
      b.add(skirt.soffit, M.W);
      const yR = ySk + 2.4;
      const up = gableRoof({
        halfX: gx + 0.45, zR: 0, yR, zF: gz + 0.5, yF: ySk - 0.25, zB: -gz - 0.5, yB: ySk - 0.25, lift: 0.25, flare: 0.1,
        curveA: 0.35, curvePow: 2.0, thick: 0.4, split: 0.5, segX: 10, segT: 6, tile: 2.4, rafter: 2, soffitMode: 'plain',
        barge: { h: 0.75, d: 0.18 }, gable: { x: gx - 0.1, yBottom: ySk - 1.2, zFront: gz, zBack: -gz, seg: 8 }, ridgeCap: { w: 0.5, h: 0.45, ext: 0.2 },
      });
      b.add(up.top, M.K);
      b.add(up.edge, M.K);
      b.add(up.ridgeCap, M.K);
      b.add(up.band, M.W);
      b.add(up.soffit, M.W);
      b.add(up.verge, M.W);
      b.add(up.barge, M.Bk);
      b.add(up.gable, M.W);
      for (const sx of [-1, 1]) {
        const gg = extrudeShape(gegyoShape(1.1), 0.1, { curveSegments: 6 });
        b.add(gg, M.Au, { pos: [sx * (gx + 0.55), yR - 0.3, 0], rot: [0, PI / 2, 0], cast: false });
        const sh = shachihoko(1.5);
        if (sx < 0) T(sh, null, [0, PI, 0]);
        b.add(sh, M.Au, { pos: [sx * (gx + 0.3), yR + 0.35, 0] });
      }
      // front kara-hafu-like chidori on the top skirt
      chidoriHafu(b, M, { cx: 0, cz: ez - 1.2, nx: 0, nz: 1, w: 3.0, depth: 2.2, y0: yEave + 0.55, thick: 0.3 });
    }
  }
  void r;
  const g = b.build();
  // normalize overall height to ~35 m (incl. base and shachihoko)
  const bb = new THREE.Box3().setFromObject(g);
  const k = 35 / (bb.max.y - bb.min.y);
  g.traverse((o) => {
    if (o.isMesh) {
      o.geometry.scale(k, k, k);
      o.geometry.computeBoundingBox();
      o.geometry.computeBoundingSphere();
    }
  });
  g.name = 'castle';
  g.userData.collider = { type: 'box', w: 2 * bot[0] * k, d: 2 * bot[1] * k };
  return g;
}
