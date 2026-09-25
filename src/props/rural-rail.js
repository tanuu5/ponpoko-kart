// Railway & vehicles: track segment, animated level crossing, local diesel train, kei truck.
import {
  THREE, V3, PI, lerp, clamp, smooth, getMat, mat, canvasTexture, rng,
  Bag, box, cbox, rbox, timber, cyl, barBetween, rodBetween, gridGeo, sweep, rectProfile, circleProfile,
  xf, boxUV, uvScale, merge, alignY, blobGeo, colorByHeight, tint, mesh, smoothNormals,
  FONT_GOTH, FONT_MIN, roundRect, fitText,
} from './rural-kit.js';

const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ---------------------------------------------------------------------------
// 14. 線路 (straight track segment along Z)
// ---------------------------------------------------------------------------
export const RAIL_GAUGE = 1.067;
// vertical stack of the track segment (metres above the segment origin = ground)
const BALLAST_H = 0.34;
const SLEEPER_Y = BALLAST_H - 0.05; // sleeper bottom
const RAIL_BASE_Y = SLEEPER_Y + 0.17 + 0.02; // rail foot (on tie plates)
export const RAIL_TOP_Y = RAIL_BASE_Y + 0.154; // rail-top height (≈0.634 m): put createTrain() groups at this y

function ballastTex() {
  return canvasTexture('rural.tex.ballast', 256, 256, (g, w, h) => {
    const r = rng(333);
    g.fillStyle = '#6f6a62';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, s = 2 + r() * 5;
      const l = 30 + r() * 36;
      g.fillStyle = `hsl(${30 + r() * 20},${4 + r() * 8}%,${l}%)`;
      g.beginPath();
      g.moveTo(x, y - s);
      g.lineTo(x + s * (0.6 + r() * 0.5), y - s * 0.2);
      g.lineTo(x + s * 0.4, y + s * (0.6 + r() * 0.4));
      g.lineTo(x - s * (0.6 + r() * 0.5), y + s * 0.3);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x - s * 0.5, y + s * 0.5, s, 1);
    }
    // rusty tint
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(120,70,40,${r() * 0.08})`;
      g.beginPath(); g.arc(r() * w, r() * h, 8 + r() * 20, 0, PI * 2); g.fill();
    }
  });
}

function railProfile() {
  // JIS 50kg-ish rail cross-section (x = sideways, y = up), origin at the foot bottom center.
  const P = [[0.064, 0], [0.064, 0.01], [0.012, 0.03], [0.009, 0.1], [0.033, 0.112], [0.033, 0.145], [0.027, 0.153], [-0.027, 0.153], [-0.033, 0.145], [-0.033, 0.112], [-0.009, 0.1], [-0.012, 0.03], [-0.064, 0.01], [-0.064, 0]];
  const out = [];
  for (const p of P) { out.push(p); out.push(p); }
  return out;
}

export function createRailSegment(opts = {}) {
  const { length = 20, seed = 1 } = opts;
  const r = rng(seed * 17 + 1);
  const bag = new Bag();
  const M = {
    ballast: mat('rural.ballast', { color: 0xffffff, roughness: 1.0, map: ballastTex() }),
    sleeper: mat('rural.sleeper', { color: 0xa6a298, roughness: 0.9 }),
    rail: mat('rural.railSide', { color: 0x5a4436, roughness: 0.7, metalness: 0.4 }),
    head: mat('rural.railHead', { color: 0xc9ccd0, roughness: 0.22, metalness: 1.0 }),
    clip: getMat('metalDark'),
  };
  const L = length / 2;
  // ballast bed (trapezoid), with slightly lumpy shoulders
  const bw = 1.65, tw = 1.25, bh = BALLAST_H;
  const prof = [[bw, 0], [tw + 0.1, bh * 0.8], [tw, bh], [-tw, bh], [-tw - 0.1, bh * 0.8], [-bw, 0]];
  const path = [V3(0, 0, L), V3(0, 0, -L)];
  const bal = sweep(path, prof, { closed: false, center: V3(0, -2, 0), uvFn: (p, i, j, ua, va) => [ua * 0.7, va * 0.7] });
  bag.add(bal, M.ballast);
  // end caps of ballast
  for (const z of [L, -L]) {
    const cap = new THREE.BufferGeometry().setFromPoints(prof.map(([x, y]) => V3(x, y, z)));
    cap.setIndex(z > 0 ? [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5] : [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]);
    cap.computeVertexNormals();
    bag.add(boxUV(cap, 1.4), M.ballast);
  }
  // sleepers (PC concrete) every ~0.6 m
  const n = Math.max(1, Math.round(length / 0.6));
  const yS = SLEEPER_Y;
  for (let i = 0; i < n; i++) {
    const z = -L + (i + 0.5) * (length / n);
    const sl = box(2.0, 0.17, 0.22);
    sl.translate((r() - 0.5) * 0.02, yS + 0.085, z + (r() - 0.5) * 0.02);
    bag.add(sl, M.sleeper);
    for (const sx of [-1, 1]) {
      bag.add(xf(box(0.2, 0.025, 0.16), [sx * (RAIL_GAUGE / 2 + 0.033), yS + 0.18, z]), M.clip, false);
    }
  }
  // rails
  const yR = RAIL_BASE_Y;
  for (const sx of [-1, 1]) {
    const x = sx * (RAIL_GAUGE / 2 + 0.033);
    const rail = sweep([V3(x, yR, L), V3(x, yR, -L)], railProfile(), { closed: true, uvFn: (p, i, j, ua, va) => [ua, va * 0.2] });
    bag.add(rail, M.rail);
    bag.add(xf(box(0.052, 0.006, length), [x, yR + 0.151, 0]), M.head, false);
  }
  const group = bag.build();
  group.name = 'RailSegment';
  group.userData.railTopY = RAIL_TOP_Y;
  group.userData.gauge = RAIL_GAUGE;
  group.userData.collider = { type: 'box', w: bw * 2, d: length };
  return group;
}

// ---------------------------------------------------------------------------
// 12. 踏切 (animated level crossing, one side)
// ---------------------------------------------------------------------------
function tigerTex() {
  return canvasTexture('rural.tex.tiger', 64, 64, (g, w, h) => {
    g.fillStyle = '#f2c12e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d1d1f';
    for (let k = -2; k < 4; k++) {
      g.beginPath();
      g.moveTo(k * 32, 0); g.lineTo(k * 32 + 16, 0); g.lineTo(k * 32 + 16 + 64, 64); g.lineTo(k * 32 + 64, 64);
      g.closePath(); g.fill();
    }
  });
}
function crossingPlateTex() {
  return canvasTexture('rural.tex.crossingPlate', 256, 128, (g, w, h) => {
    g.fillStyle = '#f7f6f0';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1d1d1f';
    g.lineWidth = 6;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#c62a2a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, '踏切注意', w / 2, h * 0.42, w - 30, 64, FONT_GOTH);
    g.fillStyle = '#1d1d1f';
    g.font = `bold 22px ${FONT_GOTH}`;
    g.fillText('とまれ　みよ', w / 2, h * 0.8);
  });
}

export function createRailwayCrossing(opts = {}) {
  const { active = false, armLength = 7.0 } = opts;
  const group = new THREE.Group();
  group.name = 'RailwayCrossing';
  const bag = new Bag();
  const M = {
    tiger: mat('rural.tiger', { color: 0xffffff, roughness: 0.5, map: tigerTex() }),
    yellow: getMat('paintYellow'),
    blackDS: mat('rural.blackDS', { color: 0x1c1c1e, roughness: 0.5, side: THREE.DoubleSide }),
    plate: mat('rural.crossingPlate', { color: 0xffffff, roughness: 0.5, map: crossingPlateTex() }),
    concrete: getMat('concrete'),
    lampOff: mat('rural.lampOff', { color: 0x5a1210, roughness: 0.25, metalness: 0.1 }),
    lampOn: mat('rural.lampOn', { color: 0xff4a30, emissive: 0xff2a10, emissiveIntensity: 4.0, roughness: 0.3 }),
  };
  M.black = M.blackDS;
  M.metal = M.blackDS;
  const H = 3.6;
  // foundation
  bag.add(xf(cbox(0.7, 0.2, 0.6, 0.03), [0.12, 0.1, 0]), M.concrete);
  // striped post
  const post = cyl(0.075, 0.08, H, 16, false);
  uvScale(post, 1 / (PI * 0.155) * 0.5 * 2, 1 / 0.5 * 1.0);
  post.translate(0, H / 2, 0);
  bag.add(post, M.tiger);
  bag.add(xf(cyl(0.09, 0.09, 0.04, 16), [0, H + 0.02, 0]), M.black, false);
  // speaker (警報音発生器) on top
  bag.add(xf(cbox(0.24, 0.26, 0.2, 0.03), [0, H + 0.17, 0.02]), M.black);
  const horn = lathe([[0.001, 0], [0.05, 0], [0.09, 0.08], [0.085, 0.085], [0.001, 0.03]], 12);
  horn.rotateX(PI / 2);
  horn.translate(0, H + 0.17, 0.12);
  bag.add(horn, M.black, false);
  // crossbuck (X of yellow/black striped slats)
  const yX = H - 0.45;
  for (const a of [PI / 4, -PI / 4]) {
    const slat = cbox(1.3, 0.2, 0.03, 0.01);
    // stripe UV along the slat
    const uv = slat.attributes.uv, pos = slat.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.42, pos.getY(i) / 0.42);
    slat.rotateZ(a);
    slat.translate(0, yX, 0.11);
    bag.add(slat, M.tiger);
  }
  bag.add(xf(box(0.08, 0.08, 0.12), [0, yX, 0.05]), M.black, false);
  // lamp bar with two lamps on each face (front +Z / back -Z)
  const yL = H - 1.25;
  bag.add(xf(cbox(1.05, 0.12, 0.1, 0.02), [0, yL, 0]), M.black);
  const lampMeshes = { on: [[], []], off: [[], []] };
  for (const [i, lx] of [[0, -0.36], [1, 0.36]]) {
    // backboard disc + visor
    for (const face of [1, -1]) {
      const board = cyl(0.23, 0.23, 0.04, 20, false);
      board.rotateX(PI / 2);
      board.translate(lx, yL, face * 0.07);
      bag.add(board, M.black);
      const visor = new THREE.CylinderGeometry(0.155, 0.155, 0.16, 16, 1, true, -PI / 2, PI);
      visor.rotateX(PI / 2);
      visor.rotateZ(PI / 2 + PI / 2);
      visor.translate(lx, yL + 0.005, face * 0.17);
      bag.add(visor, M.blackDS);
      const lensGeo = lathe([[0.001, -0.01], [0.13, -0.01], [0.13, 0.0], [0.11, 0.015], [0.06, 0.03], [0.001, 0.035]], 18);
      lensGeo.rotateX(face * PI / 2);
      lensGeo.translate(lx, yL, face * 0.1);
      const off = mesh(lensGeo, M.lampOff, { cast: false, receive: true });
      const on = mesh(lensGeo, M.lampOn, { cast: false, receive: false });
      on.visible = false;
      group.add(off, on);
      lampMeshes.on[i].push(on);
      lampMeshes.off[i].push(off);
    }
  }
  // arm from lamp bar to post
  bag.add(xf(box(0.06, 0.06, 0.16), [0, yL, 0]), M.metal, false);
  // warning plate
  const plate = new THREE.PlaneGeometry(0.62, 0.31);
  plate.translate(0, yL - 0.45, 0.09);
  bag.add(plate, M.plate, false);
  bag.add(xf(box(0.66, 0.35, 0.02), [0, yL - 0.45, 0.075]), M.black, false);
  // barrier machine (遮断機) beside the post (+X side)
  const mx = 0.42, my = 0.2;
  bag.add(xf(rbox(0.36, 0.95, 0.34, 0.03, 1), [mx, my + 0.475, 0]), M.yellow);
  bag.add(xf(cbox(0.4, 0.06, 0.38, 0.015), [mx, my + 0.97, 0]), M.black);
  bag.add(xf(box(0.3, 0.5, 0.012), [mx, my + 0.45, 0.176]), M.black, false);
  const pivotY = my + 0.8;
  bag.add(xf(cyl(0.07, 0.07, 0.5, 14), [mx, pivotY, 0], [PI / 2, 0, 0]), M.black);
  bag.build(group);

  // barrier arm on a pivot
  const pivot = new THREE.Group();
  pivot.position.set(mx, pivotY, 0.3);
  group.add(pivot);
  const armBag = new Bag();
  const arm = new THREE.CylinderGeometry(0.03, 0.045, armLength, 12, 1, false);
  // sample the diagonal tiger stripes along a vertical line => straight bands (0.45 m each)
  const auv = arm.attributes.uv;
  for (let i = 0; i < auv.count; i++) auv.setXY(i, 0.3, auv.getY(i) * (armLength / 1.8));
  arm.rotateZ(-PI / 2);
  arm.translate(armLength / 2 + 0.05, 0, 0);
  armBag.add(arm, M.tiger);
  // counterweight + hub
  armBag.add(xf(cbox(0.55, 0.16, 0.12, 0.02), [-0.3, 0, 0]), M.black);
  armBag.add(xf(cbox(0.2, 0.26, 0.16, 0.02), [-0.55, 0, 0]), M.black);
  armBag.add(xf(cyl(0.09, 0.09, 0.1, 14), [0, 0, 0], [PI / 2, 0, 0]), M.metal);
  // tip reflector
  armBag.add(xf(cyl(0.034, 0.034, 0.05, 10), [armLength + 0.07, 0, 0], [0, 0, PI / 2]), M.lampOff, false);
  armBag.build(pivot);

  const state = { active: !!active, t: 0, arm: 0 };
  const apply = () => {
    const e = smooth(clamp(state.arm, 0, 1));
    pivot.rotation.z = (1 - e) * (PI / 2);
    const phase = Math.floor(state.t * 1.2 * 2) % 2;
    for (let i = 0; i < 2; i++) {
      const lit = state.active && phase === i;
      lampMeshes.on[i].forEach((m) => { m.visible = lit; });
      lampMeshes.off[i].forEach((m) => { m.visible = !lit; });
    }
  };
  apply();
  group.userData.collider = { type: 'circle', r: 0.5 };
  return {
    group,
    update(dt) {
      state.t += dt;
      const target = state.active ? 1 : 0;
      const sp = dt / 1.5;
      state.arm += clamp(target - state.arm, -sp, sp);
      apply();
    },
    setActive(v) {
      if (!!v !== state.active) state.t = 0;
      state.active = !!v;
    },
    get active() { return state.active; },
  };
}

// ---------------------------------------------------------------------------
// 13. 気動車 (rural local diesel train, キハ style)
// ---------------------------------------------------------------------------
// atlas: top half = destination sign, bottom-left = headlight white, bottom-right = tail red
function trainLampTex() {
  return canvasTexture('rural.tex.trainLamps', 256, 128, (g, w) => {
    g.fillStyle = '#0c1016';
    g.fillRect(0, 0, w, 64);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#9a9a9a';
    g.font = `bold 38px ${FONT_GOTH}`;
    g.fillText('普通', 58, 34);
    g.fillStyle = '#b0741e';
    fitText(g, 'たんぼ行', 172, 34, 150, 40, FONT_GOTH);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 64, 128, 64);
    g.fillStyle = '#ff2a10';
    g.fillRect(128, 64, 128, 64);
  });
}
const LAMP_UV = { head: [0.25, 0.25], tail: [0.75, 0.25] };
function uvConst(geo, [u, v]) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return geo;
}

function trainBody(bag, M, L, lit, frontDetail, rearDetail, r) {
  // cross-section (x, y) of the car body, closed loop (counter-clockwise)
  const half = 1.45;
  const prof = [
    [0, 0.98], [1.3, 0.98], [1.42, 1.05], [half, 1.2], [half, 3.18], [1.4, 3.36], [1.2, 3.55], [0.7, 3.68], [0, 3.72],
    [-0.7, 3.68], [-1.2, 3.55], [-1.4, 3.36], [-half, 3.18], [-half, 1.2], [-1.42, 1.05], [-1.3, 0.98],
  ];
  const path = [V3(0, 0, -0.05), V3(0, 0, -L + 0.05)];
  // sweep expects profile x=side; path along -Z -> side = (-1,0,0)... flip x so +x maps to +X
  const P = prof.map(([x, y]) => [-x, y]);
  const body = sweep(path.map((p) => V3(p.x, 0, p.z)), P.map(([x, y]) => [x, y]), { closed: true, up: V3(0, 1, 0), capStart: true, capEnd: true, uvFn: (p, i, j, ua, va) => [va / 3, ua / 3] });
  bag.add(body, M.cream);
  // roof (gray) slightly proud
  const roofProf = prof.slice(5, 12).map(([x, y]) => [-x * 1.004, y + 0.012]);
  const roof = sweep(path, roofProf, { closed: false, uvFn: (p, i, j, ua, va) => [va / 3, ua / 3] });
  bag.add(roof, M.roof);
  // rain gutters
  for (const sx of [-1, 1]) bag.add(xf(box(0.04, 0.035, L - 0.1), [sx * 1.43, 3.3, -L / 2]), M.roof, false);
  // vermilion lower band + thin stripe above windows
  for (const sx of [-1, 1]) {
    bag.add(xf(box(0.012, 0.62, L - 0.12), [sx * (half + 0.006), 1.52, -L / 2]), M.red);
    bag.add(xf(box(0.012, 0.08, L - 0.12), [sx * (half + 0.006), 3.02, -L / 2]), M.red, false);
  }
  // windows + doors on each side
  const glass = lit ? M.glow : M.glass;
  const doors = [-1.6, -L + 1.6];
  for (const sx of [-1, 1]) {
    const x = sx * (half + 0.013);
    for (const dz of doors) {
      // door panel (slightly darker cream frame), door windows
      bag.add(xf(box(0.02, 1.95, 0.95), [x, 2.07, dz]), M.door);
      for (const k of [-1, 1]) bag.add(xf(box(0.02, 0.62, 0.34), [x + sx * 0.004, 2.55, dz + k * 0.22]), glass, false);
      bag.add(xf(box(0.02, 0.05, 0.02), [x + sx * 0.012, 2.0, dz + 0.4]), M.metal, false);
      // step
      bag.add(xf(box(0.14, 0.05, 0.95), [x - sx * 0.05, 1.05, dz]), M.under, false);
    }
    // passenger windows between the doors
    const z0 = doors[0] - 1.0, z1 = doors[1] + 1.0;
    const nw = Math.max(2, Math.round((z0 - z1) / 1.25));
    for (let i = 0; i < nw; i++) {
      const zc = lerp(z0, z1, (i + 0.5) / nw);
      bag.add(xf(box(0.02, 0.86, 1.02), [x, 2.46, zc]), M.frame, false);
      bag.add(xf(box(0.02, 0.36, 0.94), [x + sx * 0.005, 2.7, zc]), glass, false);
      bag.add(xf(box(0.02, 0.4, 0.94), [x + sx * 0.005, 2.25, zc]), glass, false);
    }
    // cab-side window near each end
    for (const zc of [-0.55, -L + 0.55]) bag.add(xf(box(0.02, 0.6, 0.55), [x + sx * 0.004, 2.55, zc]), glass, false);
  }
  // roof equipment: AC units + exhaust + vents
  for (const zc of [-L * 0.28, -L * 0.72]) {
    bag.add(xf(rbox(1.7, 0.26, 2.2, 0.08, 2), [0, 3.83, zc]), M.ac);
    bag.add(xf(box(1.2, 0.02, 1.7), [0, 3.97, zc]), M.roof, false);
    for (const k of [-1, 1]) bag.add(xf(cyl(0.18, 0.18, 0.04, 14), [k * 0.4, 3.97, zc + 0.45], [0, 0, 0]), M.under, false);
  }
  bag.add(xf(cyl(0.07, 0.08, 0.35, 10), [0.45, 3.85, -L * 0.5], [0, 0, 0]), M.under);
  bag.add(xf(cyl(0.07, 0.08, 0.35, 10), [-0.45, 3.85, -L * 0.5 - 0.3], [0, 0, 0]), M.under);
  for (const zc of [-L * 0.12, -L * 0.5 + 1.5, -L * 0.88]) bag.add(xf(rbox(0.5, 0.14, 0.5, 0.05, 1), [0, 3.76, zc]), M.ac, false);
  // underfloor equipment
  bag.add(xf(box(2.2, 0.55, L * 0.36), [0, 0.72, -L / 2]), M.under);
  bag.add(xf(box(1.6, 0.4, 1.6), [0.2, 0.78, -L * 0.3]), M.under, false);
  bag.add(xf(cyl(0.3, 0.3, 1.4, 12), [-0.6, 0.75, -L * 0.68], [PI / 2, 0, 0]), M.under, false);
  // ends
  if (frontDetail) trainFace(bag, M, 0, 1, lit, true);
  else trainGangway(bag, M, -0.05, 1);
  if (rearDetail) trainFace(bag, M, -L, -1, lit, false);
  else trainGangway(bag, M, -L + 0.05, -1);
  void r;
}

function trainFace(bag, M, z0, dir, lit, lead) {
  // dir: +1 => face points to +Z at z0; -1 => face points to -Z
  const f = (geo, x, y, dz, cast = true, m) => {
    if (dir < 0) geo.rotateY(PI);
    geo.translate(x * dir, y, z0 + dir * dz);
    bag.add(geo, m, cast);
  };
  const glass = lit ? M.glow : M.glass;
  // front windows (driver side / gangway door window / right)
  f(box(0.86, 0.78, 0.03), -0.84, 2.62, 0.0, false, glass);
  f(box(0.86, 0.78, 0.03), 0.84, 2.62, 0.0, false, glass);
  f(box(0.5, 0.82, 0.03), 0, 2.5, 0.01, false, glass);
  // window frames (dark rubber)
  for (const x of [-0.84, 0.84]) f(box(0.94, 0.86, 0.02), x, 2.62, -0.005, false, M.frame);
  // gangway door outline
  f(box(0.78, 2.0, 0.05), 0, 2.04, 0.0, true, M.door);
  f(box(0.58, 0.9, 0.02), 0, 2.5, 0.03, false, M.frame);
  f(box(0.5, 0.82, 0.03), 0, 2.5, 0.035, false, glass);
  // front vermilion band
  f(box(2.82, 0.62, 0.03), 0, 1.52, 0.0, true, M.red);
  f(box(2.82, 0.08, 0.02), 0, 3.02, 0.0, false, M.red);
  // destination sign
  f(box(0.64, 0.24, 0.1), 0, 3.2, 0.02, true, M.frame);
  const dest = new THREE.PlaneGeometry(0.56, 0.16);
  const duv = dest.attributes.uv;
  for (let i = 0; i < duv.count; i++) duv.setXY(i, duv.getX(i), 0.52 + duv.getY(i) * 0.46);
  f(dest, 0, 3.2, 0.071, false, M.lamps);
  // headlights (twin, top centre) + tail lights (lower corners)
  for (const x of [-0.42, 0.42]) {
    f(cyl(0.14, 0.14, 0.12, 16), x, 3.46, 0.02, true, M.under);
    const g = cyl(0.11, 0.11, 0.03, 16);
    g.rotateX(PI / 2);
    f(lead ? uvConst(g, LAMP_UV.head) : g, x, 3.46, 0.09, false, lead ? M.lamps : M.metal);
  }
  for (const x of [-1.12, 1.12]) {
    const g = cyl(0.075, 0.075, 0.04, 12);
    g.rotateX(PI / 2);
    f(lead ? g : uvConst(g, LAMP_UV.tail), x, 1.45, 0.035, false, lead ? M.metal : M.lamps);
  }
  // wipers, handrails
  for (const x of [-0.84, 0.84]) {
    const w = box(0.03, 0.6, 0.02);
    w.rotateZ(0.6);
    f(w, x + 0.1, 2.5, 0.03, false, M.frame);
  }
  for (const x of [-0.5, 0.5]) f(box(0.03, 0.8, 0.03), x, 1.95, 0.06, false, M.metal);
  // skirt (plow) + coupler
  f(box(2.4, 0.5, 0.1), 0, 0.72, 0.05, true, M.under);
  f(box(1.8, 0.3, 0.1), 0, 0.42, 0.12, true, M.under);
  f(box(0.3, 0.22, 0.45), 0, 0.85, 0.2, true, M.metal);
  f(cyl(0.05, 0.05, 0.3, 8), 0.6, 0.9, 0.15, false, M.under);
  // horn + marker
  f(cyl(0.05, 0.03, 0.2, 8), 0.95, 3.5, 0.05, false, M.metal);
}

function trainGangway(bag, M, z, dir) {
  // bellows toward the next car + coupler
  bag.add(xf(box(1.1, 2.1, 0.45), [0, 2.05, z + dir * 0.22]), M.bellows);
  bag.add(xf(box(0.34, 0.24, 0.5), [0, 0.85, z + dir * 0.25]), M.metal);
}

export function createTrain(opts = {}) {
  const { cars = 2, lit = false, carLength = 18 } = opts;
  const n = Math.max(1, Math.floor(cars));
  const r = rng(5);
  const group = new THREE.Group();
  group.name = 'Train';
  const M = {
    cream: mat('rural.trainCream', { color: 0xf1e5c2, roughness: 0.42, metalness: 0.05 }),
    red: mat('rural.trainRed', { color: 0xd8482a, roughness: 0.4, metalness: 0.05 }),
    roof: mat('rural.trainRoof', { color: 0x6c6e72, roughness: 0.7, metalness: 0.2 }),
    glass: getMat('glass'),
    glow: mat('rural.trainWindowLit', { color: 0xffe6bc, emissive: 0xffbe70, emissiveIntensity: 1.45, roughness: 0.6 }),
    frame: mat('rural.trainFrame', { color: 0x2a2c30, roughness: 0.5 }),
    under: mat('rural.trainUnder', { color: 0x333539, roughness: 0.75, metalness: 0.3 }),
    metal: getMat('metal'),
    lamps: mat('rural.trainLamps', { color: 0xffffff, map: trainLampTex(), emissive: 0xffffff, emissiveMap: trainLampTex(), emissiveIntensity: 2.6, roughness: 0.3 }),
  };
  M.door = M.cream;
  M.ac = M.metal;
  M.bellows = M.frame;
  const gap = 0.9;
  const wheelSets = [];
  for (let c = 0; c < n; c++) {
    const car = new THREE.Group();
    car.position.z = -c * (carLength + gap);
    group.add(car);
    const bag = new Bag();
    trainBody(bag, M, carLength, lit, c === 0, c === n - 1, r);
    bag.build(car);
    // bogies
    for (const bz of [-2.9, -carLength + 2.9]) {
      const bb = new Bag();
      bb.add(xf(box(2.1, 0.28, 2.7), [0, 0.62, bz]), M.under);
      for (const sx of [-1, 1]) {
        bb.add(xf(box(0.14, 0.34, 2.9), [sx * 0.95, 0.5, bz]), M.under);
        for (const k of [-1, 1]) bb.add(xf(cyl(0.09, 0.09, 0.3, 10), [sx * 0.95, 0.72, bz + k * 0.65]), M.metal, false);
      }
      bb.build(car);
      for (const k of [-1, 1]) {
        const ws = new THREE.Group();
        ws.position.set(0, 0.43, bz + k * 1.05);
        const wb = new Bag();
        for (const sx of [-1, 1]) {
          const x = sx * (RAIL_GAUGE / 2 + 0.035);
          const wheel = cyl(0.43, 0.43, 0.12, 18, false);
          wheel.rotateZ(PI / 2);
          wheel.translate(x, 0, 0);
          wb.add(wheel, M.under);
          const flange = cyl(0.47, 0.47, 0.025, 18, false);
          flange.rotateZ(PI / 2);
          flange.translate(x - sx * 0.07, 0, 0);
          wb.add(flange, M.under, false);
          const hub = cyl(0.12, 0.12, 0.16, 10, false);
          hub.rotateZ(PI / 2);
          hub.translate(x + sx * 0.03, 0, 0);
          wb.add(hub, M.metal, false);
          // spoke marks so rotation is visible
          wb.add(xf(box(0.01, 0.6, 0.06), [x + sx * 0.061, 0, 0]), M.metal, false);
        }
        const axle = cyl(0.07, 0.07, RAIL_GAUGE, 8, true);
        axle.rotateZ(PI / 2);
        wb.add(axle, M.under, false);
        wb.build(ws);
        car.add(ws);
        wheelSets.push(ws);
      }
    }
  }
  const length = n * carLength + (n - 1) * gap;
  const last = new THREE.Vector3();
  let hasLast = false;
  let speedOverride = null;
  return {
    group,
    length,
    /** Optional explicit speed (m/s) for wheel spin; otherwise derived from movement. */
    setSpeed(v) { speedOverride = v; },
    update(dt) {
      if (!(dt > 0)) return;
      group.updateMatrixWorld();
      const p = V3().setFromMatrixPosition(group.matrixWorld);
      let v = 0;
      if (speedOverride != null) v = speedOverride;
      else if (hasLast) v = p.distanceTo(last) / dt;
      last.copy(p);
      hasLast = true;
      const da = (v * dt) / 0.43;
      for (const ws of wheelSets) ws.rotation.x -= da;
    },
  };
}

// ---------------------------------------------------------------------------
// 10. 軽トラ (kei truck)
// ---------------------------------------------------------------------------
function keiPlateTex() {
  return canvasTexture('rural.tex.keiPlate', 256, 128, (g, w, h) => {
    g.fillStyle = '#f2cf2e';
    roundRect(g, 0, 0, w, h, 14);
    g.fill();
    g.strokeStyle = '#2a4a2a';
    g.lineWidth = 5;
    roundRect(g, 6, 6, w - 12, h - 12, 10);
    g.stroke();
    g.fillStyle = '#1f3a24';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 26px ${FONT_GOTH}`;
    g.fillText('たんぼ 480', w / 2, 30);
    g.font = `bold 30px ${FONT_GOTH}`;
    g.fillText('あ', 34, 88);
    g.font = `bold 62px ${FONT_GOTH}`;
    g.fillText('12-34', w / 2 + 18, 86);
  });
}

export function createKeiTruck(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 997 + 3);
  const bag = new Bag();
  const M = {
    body: mat('rural.keiWhite', { color: 0xf1f1ec, roughness: 0.3, metalness: 0.1 }),
    glass: getMat('glass'), black: mat('rural.keiBlack', { color: 0x222326, roughness: 0.6 }),
    tire: getMat('rubber'), metal: getMat('metal'),
    plate: mat('rural.keiPlate', { color: 0xffffff, roughness: 0.4, map: keiPlateTex() }),
    lens: mat('rural.keiLens', { color: 0xf4f1e8, roughness: 0.1, metalness: 0.2, emissive: 0xfff0d0, emissiveIntensity: 0.15 }),
    cargo: mat('rural.cargoVC', { color: 0xffffff, roughness: 0.8, vertexColors: true }),
  };
  const W = 1.47, halfW = W / 2;
  const zF = 1.62, zCab = 0.38, zB = -1.66;
  const wheelR = 0.28;
  // chassis
  bag.add(xf(box(1.2, 0.14, 3.2), [0, 0.36, 0]), M.black);
  // cab: rounded box + slanted windshield
  const cabH = 1.22, cabY0 = 0.55;
  let cab = rbox(W, cabH, zF - zCab, 0.09, 2);
  // taper the front top: move vertices with y high and z front backwards
  const cp = cab.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i), z = cp.getZ(i);
    const ty = clamp((y + cabH / 2 - 0.62) / (cabH - 0.62), 0, 1);
    if (z > 0) cp.setZ(i, z - ty * 0.34 * clamp((z + 0.3) / 0.93, 0, 1));
  }
  cab = smoothNormals(cab, 1);
  cab.translate(0, cabY0 + cabH / 2, (zF + zCab) / 2);
  bag.add(cab, M.body);
  // windshield
  const ws = new THREE.PlaneGeometry(W - 0.2, 0.52);
  ws.rotateX(-0.47);
  ws.translate(0, cabY0 + 0.9, zF - 0.19);
  bag.add(ws, M.glass, false);
  // side windows + door lines
  for (const sx of [-1, 1]) {
    const sw = new THREE.PlaneGeometry(0.72, 0.44);
    sw.rotateY(sx * PI / 2);
    sw.translate(sx * (halfW + 0.002), cabY0 + 0.88, (zF + zCab) / 2 - 0.08);
    bag.add(sw, M.glass, false);
    bag.add(xf(box(0.01, 0.62, 0.012), [sx * (halfW + 0.003), cabY0 + 0.38, zCab + 0.1]), M.black, false);
    bag.add(xf(box(0.01, 0.62, 0.012), [sx * (halfW + 0.003), cabY0 + 0.38, zF - 0.28]), M.black, false);
    bag.add(xf(box(0.02, 0.03, 0.14), [sx * (halfW + 0.008), cabY0 + 0.55, zCab + 0.25]), M.metal, false);
    // door mirror
    bag.add(xf(cbox(0.04, 0.14, 0.1, 0.01), [sx * (halfW + 0.12), cabY0 + 0.86, zF - 0.34]), M.black, false);
    bag.add(barBetween(V3(sx * halfW, cabY0 + 0.78, zF - 0.34), V3(sx * (halfW + 0.12), cabY0 + 0.84, zF - 0.34), 0.02, 0.02, V3(0, 1, 0), 0), M.black, false);
  }
  // front: grille, lights, bumper, plate
  bag.add(xf(cbox(W - 0.1, 0.18, 0.04, 0.01), [0, cabY0 + 0.3, zF + 0.005]), M.black);
  for (const sx of [-1, 1]) {
    const hl = cyl(0.085, 0.085, 0.04, 16);
    hl.rotateX(PI / 2);
    hl.translate(sx * 0.5, cabY0 + 0.32, zF + 0.02);
    bag.add(hl, M.lens, false);
    bag.add(tint(xf(cbox(0.12, 0.06, 0.03, 0.008), [sx * 0.62, cabY0 + 0.16, zF + 0.02]), 0xf2a324), M.cargo, false);
  }
  bag.add(xf(cbox(W + 0.02, 0.16, 0.12, 0.03), [0, 0.47, zF + 0.02]), M.black);
  const plate = new THREE.PlaneGeometry(0.33, 0.165);
  plate.translate(0, 0.47, zF + 0.085);
  bag.add(plate, M.plate, false);
  // cab rear window
  const rw = new THREE.PlaneGeometry(1.0, 0.36);
  rw.rotateY(PI);
  rw.translate(0, cabY0 + 0.9, zCab - 0.002);
  bag.add(rw, M.glass, false);
  // "torii" guard frame behind cab
  for (const sx of [-1, 1]) bag.add(xf(cyl(0.025, 0.025, 0.72, 8), [sx * 0.62, 1.42, zCab - 0.06]), M.black);
  bag.add(xf(cyl(0.025, 0.025, 1.3, 8), [0, 1.78, zCab - 0.06], [0, 0, PI / 2]), M.black);
  for (const x of [-0.3, 0, 0.3]) bag.add(xf(cyl(0.015, 0.015, 0.7, 6), [x, 1.42, zCab - 0.06]), M.black, false);
  // bed: deck + low side gates (あおり)
  const deckY = 0.72;
  bag.add(xf(box(W - 0.02, 0.06, zCab - zB), [0, deckY, (zCab + zB) / 2]), M.black);
  const gate = (w, len, x, z, rotY) => {
    const g = cbox(len, 0.3, 0.035, 0.01);
    const ribs = [];
    for (let i = 1; i < 4; i++) ribs.push(xf(box(0.02, 0.26, 0.02), [-len / 2 + (i * len) / 4, 0, 0.025]));
    const all = merge([g, ...ribs]);
    all.rotateY(rotY);
    all.translate(x, deckY + 0.18, z);
    bag.add(all, M.body);
  };
  gate(0, zCab - zB - 0.02, halfW - 0.02, (zCab + zB) / 2, PI / 2);
  gate(0, zCab - zB - 0.02, -halfW + 0.02, (zCab + zB) / 2, -PI / 2);
  gate(0, W - 0.04, 0, zB + 0.02, PI);
  bag.add(xf(box(W - 0.04, 0.3, 0.04), [0, deckY + 0.18, zCab - 0.01]), M.body);
  // tail lights
  for (const sx of [-1, 1]) bag.add(tint(xf(cbox(0.14, 0.1, 0.04, 0.01), [sx * 0.6, 0.5, zB - 0.02]), 0xc8201c), M.cargo, false);
  bag.add(xf(box(W, 0.1, 0.06), [0, 0.47, zB + 0.02]), M.black);
  // wheels + arches
  for (const wz of [zF - 0.42, zB + 0.62]) {
    for (const sx of [-1, 1]) {
      const t = cyl(wheelR, wheelR, 0.17, 18, false);
      t.rotateZ(PI / 2);
      t.translate(sx * (halfW - 0.1), wheelR, wz);
      bag.add(t, M.tire);
      const hub = cyl(0.12, 0.13, 0.02, 12, false);
      hub.rotateZ(PI / 2);
      hub.translate(sx * (halfW - 0.01), wheelR, wz);
      bag.add(hub, M.metal, false);
      bag.add(xf(box(0.03, 0.08, 0.66), [sx * (halfW - 0.005), wheelR + 0.36, wz]), M.black, false);
    }
  }
  // cargo by seed
  const kind = Math.floor(r() * 3);
  const cargoGeos = [];
  const addC = (g, col) => { tint(g, col); cargoGeos.push(g); };
  if (kind === 0) {
    // vegetable crates: daikon + cabbage
    const crateCols = [0x2f8a4a, 0xe0b92e, 0x2a5cb4];
    for (let i = 0; i < 4; i++) {
      const cx = (i % 2 ? 0.34 : -0.34), cz = zCab - 0.4 - Math.floor(i / 2) * 0.62;
      const col = crateCols[Math.floor(r() * 3)];
      addC(xf(box(0.56, 0.3, 0.5), [cx, deckY + 0.18, cz]), col);
      if (i % 2 === 0) {
        for (let k = 0; k < 5; k++) {
          const d = cyl(0.045, 0.03, 0.45, 7);
          d.rotateX(PI / 2);
          d.translate(cx - 0.2 + k * 0.1, deckY + 0.36, cz);
          addC(d, 0xf3f1ea);
          const lv = blobGeo(0.07, { detail: 0, amp: 0.3, seed: k, scale: [0.6, 0.6, 1.4] });
          lv.translate(cx - 0.2 + k * 0.1, deckY + 0.38, cz - 0.28);
          addC(lv, 0x4f8a35);
        }
      } else {
        for (let k = 0; k < 4; k++) {
          const c = blobGeo(0.12, { detail: 1, amp: 0.12, seed: k + i, scale: [1, 0.85, 1] });
          c.translate(cx + (k % 2 ? 0.12 : -0.12), deckY + 0.4, cz + (k < 2 ? 0.1 : -0.12));
          colorByHeight(c, 0x7fae4a, 0xc9e39a, 0.06, k);
          cargoGeos.push(c);
        }
      }
    }
  } else if (kind === 1) {
    // rice bags (30kg paper sacks)
    for (let i = 0; i < 6; i++) {
      const g = rbox(0.4, 0.14, 0.62, 0.06, 2);
      g.rotateY((r() - 0.5) * 0.3);
      g.translate(i % 2 ? 0.26 : -0.26, deckY + 0.1 + Math.floor(i / 4) * 0.14, zCab - 0.45 - (Math.floor(i / 2) % 2) * 0.66);
      addC(g, i % 3 ? 0xe8ddc2 : 0xd9c9a0);
    }
    for (let i = 0; i < 2; i++) {
      const g = rbox(0.4, 0.14, 0.62, 0.06, 2);
      g.translate(i ? 0.26 : -0.26, deckY + 0.24, zCab - 0.45);
      addC(g, 0xece2c8);
    }
  } else {
    // folded blue tarp + a few bamboo poles
    addC(xf(rbox(0.9, 0.12, 0.6, 0.05, 2), [0.1, deckY + 0.09, -0.6], [0, 0.2, 0]), 0x2a64c0);
    for (let k = 0; k < 3; k++) {
      const p = cyl(0.025, 0.025, 1.9, 6);
      p.rotateX(PI / 2);
      p.translate(-0.4 + k * 0.08, deckY + 0.06 + 0.26, -0.55);
      p.rotateX(-0.08);
      addC(p, 0xc2ad6e);
    }
  }
  if (cargoGeos.length) bag.add(merge(cargoGeos), M.cargo);
  const group = bag.build();
  group.name = 'KeiTruck';
  group.userData.collider = { type: 'box', w: W + 0.1, d: 3.45 };
  return group;
}
