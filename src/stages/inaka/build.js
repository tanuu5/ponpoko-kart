// Course 1 decoration: paddy water mirror, rice, ridges, grass, village & farm props,
// railway with a passing train and level crossings, Mt. Fuji backdrop, dragonflies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMat, mat } from '../../props/materials.js';
import { WaterSystem, createWaterMaterial, buildWaterMesh } from '../../world/Water.js';
import { ScatterField, windMaterial, tuftGeometry, rowGeometry } from '../../world/Vegetation.js';
import { PropInstancer } from '../../world/Instancer.js';
import { createFuji, createRidgeRing } from '../../world/Backdrop.js';
import { rng, alongTrack, ColliderGrid, createCornerSign } from '../common.js';
import { riverZ, RAIL_X, RAIL_H, TUNNEL_Z, PADDY_WATER, PADDY_FLOOR, RIVER_WATER, CENTER, FUJI_ANGLE, isPaddy, dryMask } from './terrain.js';

const has = (m, k) => m && typeof m[k] === 'function';
// prop libraries are loaded defensively so a broken/missing module never blocks the course
let R = {};
let S = {};

export async function buildInaka(ctx) {
  R = await import('../../props/rural.js').catch((e) => (console.warn('rural props unavailable', e), {}));
  S = await import('../../props/shrine.js').catch((e) => (console.warn('shrine props unavailable', e), {}));
  const { scene, track, terrain, world, renderer } = ctx;
  const env = world.env;
  const sunDir = env.sky.sunDir.clone();
  const updaters = [];
  const rand = rng(2024);
  const colliders = new ColliderGrid(12);
  world.colliders = colliders;
  const T = track;
  const L = T.length;
  const Q = new URLSearchParams(location.search);
  const _ts = {};
  let _tl = performance.now();
  const tm = (label) => {
    const now = performance.now();
    console.log(`[build] ${label} ${(now - _tl).toFixed(0)}ms`);
    _tl = now;
  };

  // ------------------------------------------------------------------ water
  const water = new WaterSystem(renderer.renderer, scene, sunDir, { reflection: world.quality !== 'low', reflectionHeight: PADDY_WATER, reflectionScale: 0.5 });
  const paddyMat = createWaterMaterial({
    deep: 0x2a2a22, shallow: 0x4a4430, skyTop: 0x5a78b0, skyHorizon: 0xffb27a, sunColor: 0xffc890,
    reflStrength: 0.92, waveAmp: 0.05, waveScale: 1.3, rows: 1, rowColor: 0x587d2c, edgeFade: 0.1, specular: 1.2,
  });
  const b = T.bounds;
  const paddyMesh = buildWaterMesh(terrain, PADDY_WATER, {
    minX: b.min.x - 420, maxX: b.max.x + 420, minZ: b.min.z - 420, maxZ: b.max.z + 420, cell: 4,
    include: (x, z) => Math.abs(z - riverZ(x)) > 22,
    material: paddyMat,
  });
  water.add(paddyMesh, { reflect: true });
  const riverMat = createWaterMaterial({
    deep: 0x1d3b44, shallow: 0x44604f, skyTop: 0x5a78b0, skyHorizon: 0xffb27a, sunColor: 0xffc890,
    reflStrength: 0.75, waveAmp: 0.14, waveScale: 0.6, flow: 0.9, flowDir: [1, 0.1], rows: 0, edgeFade: 0.25, specular: 1.0,
  });
  const riverMesh = buildWaterMesh(terrain, RIVER_WATER, {
    minX: b.min.x - 700, maxX: b.max.x + 700, minZ: 20, maxZ: 170, cell: 3,
    include: (x, z) => Math.abs(z - riverZ(x)) < 30,
    material: riverMat,
  });
  water.add(riverMesh);
  updaters.push((dt) => water.update(dt));
  world.beforeRender = (r, cam) => water.beforeRender(r, cam);
  world.water = water;
  tm('water');

  // ------------------------------------------------------------------ vegetation
  if (!Q.get('noveg')) {
  const riceMat = windMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }, { amp: 0.5, key: 'rice' });
  const riceTuft = tuftGeometry({ blades: 5, height: 0.42, spread: 0.05, width: 0.022, lean: 0.35, colorBase: [0.16, 0.28, 0.06], colorTip: [0.5, 0.75, 0.22], seed: 11 });
  riceTuft.translate(0, PADDY_WATER - PADDY_FLOOR - 0.05, 0); // stand in the water (base at paddy floor)
  const riceRow = rowGeometry(riceTuft, 5, 0.46, 0.05, 7);
  const rice = new ScatterField(riceRow, riceMat, { chunk: 32, maxDist: 75, name: 'rice' });
  // ridges between paddies (畦)
  const ridgeGeo = new THREE.BoxGeometry(1, 1, 1);
  ridgeGeo.translate(0, 0.5, 0);
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x5d6a33, roughness: 1 });
  const ridges = new ScatterField(ridgeGeo, ridgeMat, { chunk: 64, maxDist: 400, layer: 0, receiveShadow: true, name: 'ridges' });
  const ridgeTop = PADDY_WATER + 0.14;
  const ridgeH = ridgeTop - PADDY_FLOOR;
  const cellX = 28, cellZ = 19;
  const x0 = Math.floor((b.min.x - 260) / cellX) * cellX, x1 = b.max.x + 260;
  const z0 = Math.floor((b.min.z - 260) / cellZ) * cellZ, z1 = b.max.z + 260;
  // rows of rice: along X, spacing 0.62 m in Z; only within ~75 m of the road
  for (let cz = z0; cz < z1; cz += cellZ) {
    for (let cx = x0; cx < x1; cx += cellX) {
      const mx = cx + cellX / 2, mz = cz + cellZ / 2;
      if (!isPaddy(mx, mz)) continue;
      const s = terrain.sample(mx, mz, _ts);
      if (s.edge < 3) continue;
      const plantRice = s.edge < 80;
      // skip ~12% of paddies (fallow / just flooded mirror)
      if (rand() < 0.12) continue;
      if (plantRice) {
        const rot = rand() < 0.5 ? 0 : Math.PI / 2;
        if (rot === 0) {
          for (let z = cz + 0.9; z < cz + cellZ - 0.6; z += 0.62) {
            for (let x = cx + 1.6; x < cx + cellX - 1.4; x += 2.3) {
              if (!isPaddy(x, z)) continue;
              if (terrain.sample(x, z, _ts).edge < 2.2) continue;
              rice.add(x, PADDY_FLOOR, z, rand() < 0.5 ? 0 : Math.PI, 0.9 + rand() * 0.25);
            }
          }
        } else {
          for (let x = cx + 0.9; x < cx + cellX - 0.6; x += 0.62) {
            for (let z = cz + 1.6; z < cz + cellZ - 1.4; z += 2.3) {
              if (!isPaddy(x, z)) continue;
              if (terrain.sample(x, z, _ts).edge < 2.2) continue;
              rice.add(x, PADDY_FLOOR, z, Math.PI / 2 + (rand() < 0.5 ? 0 : Math.PI), 0.9 + rand() * 0.25);
            }
          }
        }
      }
    }
  }
  // ridge segments along the paddy grid lines
  const addRidgeLine = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / 2);
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const ok = i < n && isPaddy(x, z) && terrain.sample(x, z, _ts).edge > 1.5;
      if (ok && start < 0) start = i;
      if ((!ok || i === n) && start >= 0) {
        const t0 = start / n, t1 = i / n;
        const sx = ax + (bx - ax) * t0, sz = az + (bz - az) * t0;
        const ex = ax + (bx - ax) * t1, ez = az + (bz - az) * t1;
        const seg = Math.hypot(ex - sx, ez - sz);
        if (seg > 1.5) {
          const m = new THREE.Matrix4();
          const horizontal = Math.abs(bx - ax) > Math.abs(bz - az);
          m.compose(
            new THREE.Vector3((sx + ex) / 2, PADDY_FLOOR, (sz + ez) / 2),
            new THREE.Quaternion(),
            horizontal ? new THREE.Vector3(seg, ridgeH, 0.55) : new THREE.Vector3(0.55, ridgeH, seg),
          );
          const key = `${Math.floor(m.elements[12] / ridges.chunk)},${Math.floor(m.elements[14] / ridges.chunk)}`;
          let bk = ridges.buckets.get(key);
          if (!bk) ridges.buckets.set(key, (bk = []));
          bk.push(m);
        }
        start = -1;
      }
    }
  };
  for (let cz = z0; cz <= z1; cz += cellZ) addRidgeLine(x0, cz, x1, cz);
  for (let cx = x0; cx <= x1; cx += cellX) addRidgeLine(cx, z0, cx, z1);
  rice.build(scene);
  ridges.build(scene);
  updaters.push((dt, t, c) => { if (c && c.camera) rice.update(c.camera); });

  // roadside grass
  const grassMat = windMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }, { amp: 0.6, key: 'grass' });
  const grassGeo = tuftGeometry({ blades: 14, height: 0.42, spread: 0.26, width: 0.018, lean: 0.55, colorBase: [0.13, 0.22, 0.06], colorTip: [0.45, 0.6, 0.2], seed: 5 });
  const grass = new ScatterField(grassGeo, grassMat, { chunk: 40, maxDist: 110, name: 'grass' });
  const flowerGeo = (() => {
    const g = tuftGeometry({ blades: 5, height: 0.5, spread: 0.1, width: 0.025, lean: 0.25, colorBase: [0.15, 0.25, 0.08], colorTip: [0.4, 0.55, 0.2], seed: 9 });
    return g;
  })();
  for (let s = 0; s < L; s += 0.8) {
    const fr = T.frameAt(s);
    if (T.inGap(s)) continue;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const e = 0.3 + rand() * 4.5;
        const d = side * (fr.width + e);
        const p = fr.pos.clone().addScaledVector(fr.right, d);
        p.x += (rand() - 0.5) * 0.8;
        p.z += (rand() - 0.5) * 0.8;
        const ts = terrain.sample(p.x, p.z, _ts);
        if (ts.h < PADDY_WATER + 0.05) continue;
        grass.add(p.x, ts.h - 0.02, p.z, rand() * 6.28, 0.7 + rand() * 0.7);
      }
    }
  }
  // dry areas & hill: scattered grass
  for (let i = 0; i < 26000; i++) {
    const x = b.min.x - 140 + rand() * (b.max.x - b.min.x + 280);
    const z = b.min.z - 140 + rand() * (b.max.z - b.min.z + 280);
    const ts = terrain.sample(x, z, _ts);
    if (ts.h < PADDY_WATER + 0.12 || ts.edge < 0.5) continue;
    grass.add(x, ts.h - 0.02, z, rand() * 6.28, 0.6 + rand() * 0.9);
  }
  grass.build(scene);
  updaters.push((dt, t, c) => { if (c && c.camera) grass.update(c.camera); });
  tm(`vegetation rice=${rice.meshes.reduce((a, m) => a + m.count, 0)} grass=${grass.meshes.reduce((a, m) => a + m.count, 0)}`);
  }

  // ------------------------------------------------------------------ props
  const P = new PropInstancer({ chunk: 180 });
  const ground = (x, z) => terrain.heightAt(x, z);
  const addProp = (key, fn, x, z, rotY = 0, scale = 1, opts = {}) => {
    const y = opts.y ?? ground(x, z);
    P.add(key, fn, { x, y, z, rotY, scale, collide: opts.collide ?? true });
  };
  const faceRoadYaw = (fr, side) => Math.atan2(-fr.right.x * side, -fr.right.z * side); // +Z faces the road
  const alongYaw = (fr) => Math.atan2(fr.tan.x, fr.tan.z);

  // --- start gate: big vermilion torii over the start line
  if (has(S, 'createTorii')) {
    const fr = T.frameAt(0);
    addProp('startTorii', () => S.createTorii({ style: 'myojin', material: 'vermilion', height: 11.5, span: 23.5, plaque: 'ぽんぽこ', seed: 3 }), fr.pos.x, fr.pos.z, alongYaw(fr), 1, { y: fr.pos.y - 0.2, collide: false });
    for (const sd of [-1, 1]) {
      const p = fr.pos.clone().addScaledVector(fr.right, sd * 11.75);
      colliders.add(p.x, p.z, 0.8);
    }
  }

  // --- village along the start straight: walls, houses, street furniture
  const villageS0 = L - 45, villageS1 = 135;
  const housesL = [], housesR = [];
  const houseTypes = [
    ['tile', (seed) => R.createTileHouse({ seed, lit: false })],
    ['thatch', (seed) => R.createThatchedHouse({ seed })],
    ['kura', (seed) => R.createKura({ seed })],
  ];
  let hi = 0;
  alongTrack(T, villageS0, villageS1, 24, 1, 16, (p, fr, s) => housesR.push({ p, fr, s }));
  alongTrack(T, villageS0 + 10, villageS1, 26, -1, 16, (p, fr, s) => housesL.push({ p, fr, s }));
  for (const [list, side] of [[housesL, -1], [housesR, 1]]) {
    for (const h of list) {
      if (Math.abs(T.deltaS(h.s, 0)) < 14) continue; // keep the start gate clear
      const [kind, make] = houseTypes[hi % houseTypes.length];
      hi++;
      const seed = 10 + hi;
      if (!has(R, kind === 'tile' ? 'createTileHouse' : kind === 'thatch' ? 'createThatchedHouse' : 'createKura')) continue;
      const off = kind === 'thatch' ? 7 : 4;
      const p = h.p.clone().addScaledVector(h.fr.right, side * off);
      addProp(`${kind}${seed % 4}`, () => make(seed % 4), p.x, p.z, faceRoadYaw(h.fr, side), 1);
    }
  }
  // village walls (physics) + visible stone walls / hedges
  T.zones.walls = T.zones.walls || [];
  for (let i = 0; i < T.count; i++) {
    const s = i * T.ds;
    const inVillage = T.forwardDist(villageS0, s) < T.forwardDist(villageS0, villageS1);
    if (inVillage) {
      T.wallL[i] = Math.min(T.wallL[i], T.w[i] + 5.2);
      T.wallR[i] = Math.min(T.wallR[i], T.w[i] + 5.2);
    }
  }
  if (has(S, 'createStoneWall')) {
    for (const side of [-1, 1]) {
      alongTrack(T, villageS0, villageS1, 8, side, 5.5, (p, fr, s) => {
        if (Math.abs(T.deltaS(s, 0)) < 16) return;
        addProp('stoneWall', () => S.createStoneWall({ length: 8, height: 0.9, seed: 4 }), p.x, p.z, faceRoadYaw(fr, side), 1, { collide: false });
      });
    }
  }
  // utility poles with wires along the village street and the paddy road
  if (has(R, 'createUtilityPole')) {
    const poleSides = [
      { s0: villageS0, s1: villageS1, side: 1, off: 3.2, spacing: 32 },
      { s0: 150, s1: 470, side: 1, off: 3.6, spacing: 36 },
      { s0: 900, s1: 1030, side: -1, off: 3.6, spacing: 36 },
    ];
    for (const ps of poleSides) {
      const poles = [];
      alongTrack(T, ps.s0, ps.s1, ps.spacing, ps.side, ps.off, (p, fr) => {
        const y = ground(p.x, p.z);
        const yaw = alongYaw(fr) + Math.PI / 2;
        addProp('pole' + (poles.length % 3 === 0 ? 'T' : ''), () => R.createUtilityPole({ seed: 2, transformer: poles.length % 3 === 0 }), p.x, p.z, yaw, 1, { y });
        poles.push({ p: new THREE.Vector3(p.x, y, p.z), yaw });
      });
      // wires
      const proto = R.createUtilityPole({ seed: 2 });
      const anchors = (proto.userData && proto.userData.wireAnchors) || [new THREE.Vector3(0, 9, 0)];
      const wireGroup = new THREE.Group();
      for (let i = 0; i + 1 < poles.length; i++) {
        const A = poles[i], B = poles[i + 1];
        for (const a of anchors) {
          const wa = a.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), A.yaw).add(A.p);
          const wb = a.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), B.yaw).add(B.p);
          if (has(R, 'createWireSpan')) wireGroup.add(R.createWireSpan(wa, wb, { sag: 0.7 }));
        }
      }
      if (wireGroup.children.length) {
        wireGroup.updateMatrixWorld(true);
        const geos = [];
        let wmat = null;
        wireGroup.traverse((o) => {
          if (!o.isMesh) return;
          wmat = wmat || o.material;
          const g2 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
          for (const k of Object.keys(g2.attributes)) if (!['position', 'normal'].includes(k)) g2.deleteAttribute(k);
          geos.push(g2.applyMatrix4(o.matrixWorld));
        });
        const merged = mergeGeometries(geos, false);
        if (merged) {
          const wm = new THREE.Mesh(merged, wmat);
          wm.name = 'wires';
          scene.add(wm);
        }
      }
    }
  }
  // vending machines, bus stop, jizo, tobidashi-boya, hokora along the village
  const place1 = (key, fn, s, side, off, extraYaw = 0, collide = true) => {
    const fr = T.frameAt(s);
    const p = fr.pos.clone().addScaledVector(fr.right, side * (fr.width + off));
    addProp(key, fn, p.x, p.z, faceRoadYaw(fr, side) + extraYaw, 1, { collide });
  };
  if (has(R, 'createVendingMachine')) {
    place1('vend0', () => R.createVendingMachine({ seed: 1, lit: true }), 34, -1, 3.2);
    place1('vend1', () => R.createVendingMachine({ seed: 2, lit: true }), 35.3, -1, 3.2);
    place1('vend2', () => R.createVendingMachine({ seed: 3, lit: true }), 610, 1, 3.4);
  }
  if (has(R, 'createBusStop')) place1('busstop', () => R.createBusStop({ seed: 1, name: 'たんぼ前' }), 78, 1, 3.0);
  if (has(R, 'createJizo')) {
    place1('jizo6', () => R.createJizo({ count: 6, seed: 2 }), 112, -1, 3.2);
    place1('jizo1', () => R.createJizo({ count: 1, seed: 5 }), 700, -1, 3.0);
  }
  if (has(R, 'createTobidashiBoya')) {
    place1('tobidashi', () => R.createTobidashiBoya({ seed: 1 }), 58, 1, 1.8, 0, false);
    place1('tobidashi', () => R.createTobidashiBoya({ seed: 1 }), L - 30, -1, 1.8, 0, false);
    place1('tobidashi', () => R.createTobidashiBoya({ seed: 1 }), 930, 1, 2.2, 0, false);
  }
  if (has(R, 'createHokora')) {
    place1('hokora', () => R.createHokora({ seed: 3 }), 128, 1, 3.5);
    place1('hokora', () => R.createHokora({ seed: 3 }), 560, -1, 4.0);
  }
  if (has(R, 'createIdo')) place1('ido', () => R.createIdo({ seed: 1 }), 20, 1, 12);

  // farmhouse clusters away from the road
  const farm = (x, z, yaw, i) => {
    if (has(R, 'createThatchedHouse')) addProp('thatch' + (i % 4), () => R.createThatchedHouse({ seed: i % 4 }), x, z, yaw);
  };
  farm(140, -212, 0.2, 1);
  farm(166, -195, -0.4, 2);
  farm(88, -240 + 470, Math.PI + 0.3, 3);
  farm(108, 250, Math.PI - 0.2, 0);
  farm(-78, -184, 0.9, 2);
  if (has(R, 'createKura')) {
    addProp('kura1', () => R.createKura({ seed: 1 }), 128, -198, 0.2);
    addProp('kura2', () => R.createKura({ seed: 2 }), 72, 236, Math.PI);
  }
  if (has(R, 'createKeiTruck')) {
    addProp('kei0', () => R.createKeiTruck({ seed: 1 }), 152, -182, 1.2);
    addProp('kei1', () => R.createKeiTruck({ seed: 2 }), 96, 213, -0.4);
  }
  if (has(R, 'createHazakake')) {
    for (let i = 0; i < 5; i++) addProp('haza', () => R.createHazakake({ length: 8, seed: 3 }), 110 + i * 11, -172, 0);
    for (let i = 0; i < 4; i++) addProp('haza', () => R.createHazakake({ length: 8, seed: 3 }), 60 + i * 10, 205, 0.05);
  }
  if (has(R, 'createScarecrow')) {
    let n = 0;
    for (let i = 0; i < 400 && n < 16; i++) {
      const x = b.min.x - 60 + rand() * (b.max.x - b.min.x + 120);
      const z = b.min.z - 60 + rand() * (b.max.z - b.min.z + 120);
      if (!isPaddy(x, z)) continue;
      const e = terrain.sample(x, z, _ts).edge;
      if (e < 8 || e > 60) continue;
      addProp('scare' + (n % 3), () => R.createScarecrow({ seed: n % 3 }), x, z, rand() * 6.28, 1, { y: PADDY_FLOOR, collide: false });
      n++;
    }
  }

  // trees: persimmons & broadleaf near houses, cedars / bamboo on the hill, bushes
  const treeOK = (x, z, minEdge = 6) => {
    const s = terrain.sample(x, z, _ts);
    return s.edge > minEdge && s.h > PADDY_WATER + 0.2;
  };
  if (has(R, 'createCedar')) {
    let n = 0;
    for (let i = 0; i < 3000 && n < 170; i++) {
      const x = 180 + rand() * 260, z = -110 + rand() * 230;
      const s = terrain.sample(x, z, _ts);
      if (s.h < 2.5 || s.edge < 7) continue;
      if (Math.abs(z - riverZ(x)) < 30) continue;
      addProp('cedar' + (n % 4), () => R.createCedar({ seed: n % 4 }), x, z, rand() * 6.28, 0.8 + rand() * 0.45);
      n++;
    }
    // tunnel hills & west hill
    for (const [cx, cz, cnt] of [[RAIL_X, -600, 60], [RAIL_X, 610, 60], [-60, -230, 30], [60, 290, 30]]) {
      for (let i = 0; i < cnt; i++) {
        const a = rand() * 6.28, r = Math.sqrt(rand()) * 70;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!treeOK(x, z, 8)) continue;
        if (Math.abs(x - RAIL_X) < 8) continue;
        addProp('cedar' + (i % 4), () => R.createCedar({ seed: i % 4 }), x, z, rand() * 6.28, 0.8 + rand() * 0.5);
      }
    }
  }
  if (has(R, 'createBambooClump')) {
    for (const [x, z] of [[258, -40], [345, 20], [360, -30], [205, 30], [-55, -140], [30, 262], [150, -232], [-40, 95]]) {
      if (treeOK(x, z, 6)) addProp('bamboo' + (Math.abs(Math.round(x)) % 3), () => R.createBambooClump({ seed: Math.abs(Math.round(x)) % 3 }), x, z, rand() * 6.28);
    }
  }
  if (has(R, 'createPersimmonTree')) {
    for (const [x, z] of [[-40, -30], [-45, 20], [34, -60], [30, 50], [155, -175], [120, -225], [100, 222], [82, 262], [190, 182], [-80, -160]]) {
      if (treeOK(x, z, 5)) addProp('kaki' + (Math.abs(Math.round(z)) % 3), () => R.createPersimmonTree({ seed: Math.abs(Math.round(z)) % 3 }), x, z, rand() * 6.28, 0.9 + rand() * 0.3);
    }
  }
  if (has(R, 'createBroadleafTree')) {
    let n = 0;
    for (let i = 0; i < 2000 && n < 70; i++) {
      const x = b.min.x - 120 + rand() * (b.max.x - b.min.x + 240);
      const z = b.min.z - 120 + rand() * (b.max.z - b.min.z + 240);
      if (!treeOK(x, z, 9)) continue;
      if (dryMask(x, z) < 0.2 && terrain.sample(x, z, _ts).h < 1.5) continue;
      addProp('broad' + (n % 4), () => R.createBroadleafTree({ seed: n % 4 }), x, z, rand() * 6.28, 0.8 + rand() * 0.5);
      n++;
    }
  }
  if (has(R, 'createBush')) {
    let n = 0;
    for (let i = 0; i < 1500 && n < 90; i++) {
      const x = b.min.x - 60 + rand() * (b.max.x - b.min.x + 120);
      const z = b.min.z - 60 + rand() * (b.max.z - b.min.z + 120);
      if (!treeOK(x, z, 3.5)) continue;
      addProp('bush' + (n % 3), () => R.createBush({ seed: n % 3, flowers: n % 3 === 0 }), x, z, rand() * 6.28, 0.8 + rand() * 0.6, { collide: false });
      n++;
    }
  }

  // hilltop shrine: torii over the road + lanterns
  if (has(S, 'createTorii')) {
    const s = T.cpToS(11.55);
    const fr = T.frameAt(s);
    addProp('hillTorii', () => S.createTorii({ style: 'myojin', material: 'vermilion', height: 10.5, span: 20.5, plaque: '稲荷神社', seed: 8 }), fr.pos.x, fr.pos.z, alongYaw(fr), 1, { y: fr.pos.y - 0.2, collide: false });
    for (const sd of [-1, 1]) {
      const p = fr.pos.clone().addScaledVector(fr.right, sd * 10.25);
      colliders.add(p.x, p.z, 0.8);
    }
  }
  if (has(S, 'createStoneLantern')) {
    for (const side of [-1, 1]) {
      alongTrack(T, T.cpToS(11.7), T.cpToS(12.8), 12, side, 1.6, (p, fr) => addProp('lantern', () => S.createStoneLantern({ lit: false, seed: 1 }), p.x, p.z, faceRoadYaw(fr, side)));
    }
  }
  // guardrails on the hill's outer edge & the bridge approach
  if (has(R, 'createGuardrail')) {
    const rails = [
      { s0: T.cpToS(9.2), s1: T.cpToS(10.4), side: -1 },
      { s0: T.cpToS(12.2), s1: T.cpToS(13.1), side: 1 },
      { s0: T.cpToS(12.2), s1: T.cpToS(13.1), side: -1 },
      { s0: T.cpToS(18.2), s1: T.cpToS(18.72), side: -1 },
      { s0: T.cpToS(18.2), s1: T.cpToS(18.72), side: 1 },
      { s0: T.cpToS(19.35), s1: T.cpToS(19.8), side: -1 },
      { s0: T.cpToS(19.35), s1: T.cpToS(19.8), side: 1 },
    ];
    for (const g of rails) {
      alongTrack(T, g.s0, g.s1, 8, g.side, 1.0, (p, fr) => {
        addProp('guardrail', () => R.createGuardrail({ length: 8 }), p.x, p.z, faceRoadYaw(fr, g.side), 1, { collide: false });
      });
      const i0 = T.idx(g.s0), n = Math.ceil(T.forwardDist(g.s0, g.s1) / T.ds);
      for (let k = 0; k <= n; k++) {
        const i = (i0 + k) % T.count;
        if (g.side < 0) T.wallL[i] = Math.min(T.wallL[i], T.w[i] + 0.9);
        else T.wallR[i] = Math.min(T.wallR[i], T.w[i] + 0.9);
      }
    }
  }
  // corner signs on the outside of the sharp turns
  const signs = [[3.1, -1], [8.9, -1], [9.6, -1], [17.9, -1], [18.4, -1]];
  for (const [cp, side] of signs) {
    const s = T.cpToS(cp);
    const fr = T.frameAt(s);
    const dir = T.curv[T.idx(s + 15)] > 0 ? 1 : -1;
    const sd = -dir; // outside of the corner
    const p = fr.pos.clone().addScaledVector(fr.right, sd * (fr.width + 2.2));
    addProp('sign' + dir, () => createCornerSign(dir), p.x, p.z, alongYaw(fr) + Math.PI, 1, { collide: false });
  }

  tm('props placed');
  // ------------------------------------------------------------------ railway
  const railway = Q.get('norail') ? null : buildRailway(ctx, colliders, addProp, water);
  if (railway) updaters.push(railway.update);
  tm('railway');

  P.build(scene);
  for (const c of P.colliders) colliders.add(c.x, c.z, c.r);
  tm(`props built (${P.protos.size} protos, ${P.group.children.length} meshes)`);

  // ------------------------------------------------------------------ backdrop
  const fujiDist = 4300;
  const fuji = createFuji({
    height: 880, radius: 2500, color: 0x4a4f72, snowColor: 0xfff0ea, haze: 0xd9a896, hazeAmt: 0.58,
    sunDir: sunDir.toArray(), sunColor: 0xffb070, ambient: 0x7a7498, snowLine: 0.7,
  });
  fuji.position.set(CENTER[0] + Math.cos(FUJI_ANGLE + 0.18) * fujiDist, -80, CENTER[1] + Math.sin(FUJI_ANGLE + 0.18) * fujiDist);
  scene.add(fuji);
  const ridges2 = createRidgeRing({ radius: 2700, step: 520, layers: 3, minH: 90, maxH: 260, haze: 0xc6a0a0, color: 0x353b52, hazeBase: 0.4, hazeStep: 0.18, gap: { angle: FUJI_ANGLE + 0.18, width: 0.35 }, seed: 9 });
  ridges2.position.set(CENTER[0], -60, CENTER[1]);
  scene.add(ridges2);

  // ------------------------------------------------------------------ dragonflies
  const dragonflies = createDragonflies(scene, 36);
  updaters.push((dt, t, c) => dragonflies.update(dt, t, c && c.camera, terrain));

  return {
    update(dt, t, c) {
      for (const u of updaters) u(dt, t, c);
    },
    attachFX(fx) {
      if (railway) railway.fx = fx;
    },
    dispose() {
      // stop looping sounds (crossing bell / train rumble) so they never leak into the next race
      if (railway) railway.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------
function buildRailway(ctx, colliders, addProp, water) {
  const { scene, track: T, terrain } = ctx;
  const railLen = 2 * (TUNNEL_Z + 30);
  const g = new THREE.Group();
  g.name = 'railway';
  // ballast + sleepers + rails as merged strips following the terrain
  const ballast = [], sleepers = [], rails = [];
  const step = 2;
  const H = (z) => (Math.abs(z) < TUNNEL_Z ? terrain.heightAt(RAIL_X, z) : RAIL_H);
  for (let z = -railLen / 2; z < railLen / 2; z += step) {
    const y0 = H(z), y1 = H(z + step);
    const inRiver = Math.abs(z - riverZ(RAIL_X)) < 22;
    const ry0 = inRiver ? 0.7 : y0, ry1 = Math.abs(z + step - riverZ(RAIL_X)) < 22 ? 0.7 : y1;
    if (!inRiver) {
      const bg = new THREE.BoxGeometry(3.6, 0.35, step + 0.02);
      bg.translate(RAIL_X, (y0 + y1) / 2 + 0.05, z + step / 2);
      ballast.push(bg);
    }
    for (let s = 0; s < step; s += 0.66) {
      const sg = new THREE.BoxGeometry(2.3, 0.14, 0.22);
      const y = ry0 + (ry1 - ry0) * (s / step);
      sg.translate(RAIL_X, y + 0.26, z + s);
      sleepers.push(sg);
    }
    for (const dx of [-0.535, 0.535]) {
      const rg = new THREE.BoxGeometry(0.08, 0.14, step + 0.01);
      const ang = Math.atan2(ry1 - ry0, step);
      rg.rotateX(-ang);
      rg.translate(RAIL_X + dx, (ry0 + ry1) / 2 + 0.4, z + step / 2);
      rails.push(rg);
    }
  }
  const merge = (arr) => {
    const out = new THREE.BufferGeometry();
    const geos = arr.map((a) => a.toNonIndexed());
    for (const name of ['position', 'normal', 'uv']) {
      const n = geos.reduce((acc, g2) => acc + g2.attributes[name].array.length, 0);
      const buf = new Float32Array(n);
      let o = 0;
      for (const g2 of geos) { buf.set(g2.attributes[name].array, o); o += g2.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(buf, geos[0].attributes[name].itemSize));
    }
    return out;
  };
  const mk = (geos, m, cast = true) => {
    const mesh = new THREE.Mesh(merge(geos), m);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  mk(ballast, mat('inaka.ballast', { color: 0x7d7770, roughness: 1 }), false);
  mk(sleepers, getMat('woodDark'));
  mk(rails, mat('inaka.rail', { color: 0x8a8580, metalness: 0.9, roughness: 0.35 }));
  // railway bridge over the river
  const rz = riverZ(RAIL_X);
  const girder = new THREE.BoxGeometry(3.2, 1.2, 46);
  girder.translate(RAIL_X, 0.0, rz);
  const gm = new THREE.Mesh(girder, mat('inaka.girder', { color: 0x9c3b2a, metalness: 0.5, roughness: 0.55 }));
  gm.castShadow = true;
  gm.receiveShadow = true;
  g.add(gm);
  for (const dz of [-12, 0, 12]) {
    const pier = new THREE.BoxGeometry(2.4, 6, 2);
    pier.translate(RAIL_X, -3.4, rz + dz);
    const pm = new THREE.Mesh(pier, getMat('concrete'));
    pm.castShadow = true;
    g.add(pm);
  }
  // tunnel portals (concrete face set into the hillside, dark mouth)
  for (const sgn of [-1, 1]) {
    const zz = sgn * TUNNEL_Z;
    const portal = new THREE.Group();
    const face = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 3), getMat('concrete'));
    face.position.y = 5;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(13, 0.8, 3.6), getMat('stoneDark'));
    cap.position.y = 10.2;
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 3.4, 24, 1, false, 0, Math.PI), mat('inaka.tunnelDark', { color: 0x040404, roughness: 1 }));
    mouth.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    mouth.position.y = 3.6;
    const mouthLow = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.6, 3.4), mouth.material);
    mouthLow.position.y = 1.8;
    portal.add(face, cap, mouth, mouthLow);
    for (const o of portal.children) { o.castShadow = true; o.receiveShadow = true; }
    portal.position.set(RAIL_X, RAIL_H - 0.3, zz + sgn * 1.2);
    scene.add(portal);
  }
  scene.add(g);

  // level crossings: find where the track crosses x = RAIL_X
  const crossings = [];
  for (let i = 0; i < T.count; i++) {
    const j = (i + 1) % T.count;
    if ((T.px[i] - RAIL_X) * (T.px[j] - RAIL_X) <= 0 && !T.inGap(i * T.ds)) {
      const s = i * T.ds;
      if (crossings.some((c) => Math.abs(T.deltaS(c.s, s)) < 30)) continue;
      crossings.push({ s, z: T.pz[i], units: [] });
    }
  }
  const R_ = R;
  for (const c of crossings) {
    if (!has(R_, 'createRailwayCrossing')) break;
    const fr = T.frameAt(c.s);
    for (const side of [-1, 1]) {
      const unit = R_.createRailwayCrossing({ active: false });
      // stand beside the road, before (side -1) / after (side +1) the rails
      const along = side * 4.2;
      const p = fr.pos.clone().addScaledVector(fr.tan, along).addScaledVector(fr.right, side * (fr.width + 1.3));
      p.y = terrain.heightAt(p.x, p.z);
      unit.group.position.copy(p);
      // local +X (arm direction) must point toward the road center: -side * right
      const ax = -side * fr.right.x, az = -side * fr.right.z;
      unit.group.rotation.y = Math.atan2(-az, ax);
      scene.add(unit.group);
      c.units.push(unit);
      colliders.add(p.x, p.z, 0.5);
    }
  }

  // train
  let train = null;
  if (has(R_, 'createTrain')) {
    train = R_.createTrain({ cars: 2, lit: true });
    scene.add(train.group);
  }
  const trainLen = train ? train.length || 37 : 37;
  const state = { z: railLen / 2, dir: -1, wait: 6, speed: 26 };
  const api = {
    fx: null,
    dispose() {
      if (api.bell && api.bell.stop) api.bell.stop();
      if (api.run && api.run.stop) api.run.stop();
      api.bell = null;
      api.run = null;
    },
    update(dt, t, ctx2) {
      // train cycle: run across, wait, run back
      if (state.wait > 0) {
        state.wait -= dt;
        if (train) train.group.visible = false;
      } else {
        state.z += state.dir * state.speed * dt;
        if (train) train.group.visible = true;
        if (state.dir < 0 && state.z < -railLen / 2 - trainLen) { state.dir = 1; state.wait = 18 + Math.random() * 10; state.z = -railLen / 2 - trainLen; }
        else if (state.dir > 0 && state.z > railLen / 2 + trainLen) { state.dir = -1; state.wait = 18 + Math.random() * 10; state.z = railLen / 2 + trainLen; }
      }
      const front = state.z;
      const back = state.z - state.dir * trainLen;
      if (train) {
        train.group.position.set(RAIL_X, 0, front);
        train.group.rotation.y = state.dir > 0 ? 0 : Math.PI;
        // follow terrain height (average of ends)
        const y = Math.max(H(front), H((front + back) / 2)) + 0.46;
        train.group.position.y = Math.abs(front - riverZ(RAIL_X)) < 22 ? 1.1 : y;
        if (train.update) train.update(dt, t);
      }
      // crossings
      for (const c of crossings) {
        const zmin = Math.min(front, back), zmax = Math.max(front, back);
        const dist = state.wait > 0 ? Infinity : (c.z < zmin ? zmin - c.z : c.z > zmax ? c.z - zmax : 0);
        const approaching = dist < 170;
        for (const u of c.units) {
          u.setActive(approaching);
          if (u.update) u.update(dt, t);
        }
        c.active = approaching;
      }
      // collisions with karts & crossing bell audio
      if (ctx2 && ctx2.race) {
        const zmin = Math.min(front, back), zmax = Math.max(front, back);
        for (const k of ctx2.race.karts) {
          if (state.wait > 0) break;
          if (Math.abs(k.pos.x - RAIL_X) < 2.4 && k.pos.z > zmin - 1 && k.pos.z < zmax + 1 && k.pos.y < H(k.pos.z) + 4.5) {
            const side = k.pos.x < RAIL_X ? -1 : 1;
            k.pos.x = RAIL_X + side * 2.6;
            k.vel.x = side * 14;
            k.vel.z += state.dir * state.speed * 0.6;
            if (k.hit('tumble')) k.emit('train_hit');
          }
        }
        const P = ctx2.race.player;
        let bellVol = 0;
        for (const c of crossings) if (c.active) bellVol = Math.max(bellVol, Math.max(0, 1 - P.pos.distanceTo(T.frameAt(c.s).pos) / 140));
        const audio = ctx2.audio;
        if (audio) {
          if (bellVol > 0.01 && !api.bell) api.bell = audio.startLoop('crossing_bell', { volume: bellVol });
          if (api.bell && api.bell.setVolume) api.bell.setVolume(bellVol);
          if (bellVol <= 0.01 && api.bell) { if (api.bell.stop) api.bell.stop(); api.bell = null; }
          const trainDist = Math.abs(P.pos.x - RAIL_X) + Math.max(0, Math.max(zmin - P.pos.z, P.pos.z - zmax));
          const tv = state.wait > 0 ? 0 : Math.max(0, 1 - trainDist / 220);
          if (tv > 0.01 && !api.run) api.run = audio.startLoop('train_run', { volume: tv });
          if (api.run && api.run.setVolume) api.run.setVolume(tv);
          if (tv <= 0.01 && api.run) { if (api.run.stop) api.run.stop(); api.run = null; }
          if (tv > 0.25 && !api.horned) { audio.play('train_horn', { volume: tv }); api.horned = true; }
          if (tv < 0.05) api.horned = false;
        }
      }
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------
function createDragonflies(scene, count) {
  const body = new THREE.CylinderGeometry(0.012, 0.02, 0.16, 5).rotateX(Math.PI / 2);
  const wing = new THREE.PlaneGeometry(0.2, 0.05);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8401f, roughness: 0.5, emissive: 0x401005 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const flies = [];
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const f = new THREE.Group();
    f.add(new THREE.Mesh(body, bodyMat));
    for (const [x, z] of [[-0.1, 0.03], [0.1, 0.03], [-0.09, -0.02], [0.09, -0.02]]) {
      const w = new THREE.Mesh(wing, wingMat);
      w.position.set(x, 0.01, z);
      w.rotation.x = -Math.PI / 2;
      f.add(w);
    }
    f.scale.setScalar(1.6);
    group.add(f);
    flies.push({ obj: f, phase: Math.random() * 100, center: new THREE.Vector3(), r: 2 + Math.random() * 6, h: 1 + Math.random() * 3, speed: 0.4 + Math.random() * 0.6, init: false });
  }
  scene.add(group);
  return {
    update(dt, t, camera, terrain) {
      if (!camera) return;
      for (const f of flies) {
        if (!f.init || f.center.distanceTo(camera.position) > 60) {
          const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 40;
          f.center.set(camera.position.x + Math.cos(a) * r, 0, camera.position.z + Math.sin(a) * r);
          f.center.y = Math.max(terrain.heightAt(f.center.x, f.center.z), PADDY_WATER) + f.h;
          f.init = true;
        }
        const tt = t * f.speed + f.phase;
        f.obj.position.set(f.center.x + Math.cos(tt) * f.r + Math.sin(tt * 3.1) * 0.5, f.center.y + Math.sin(tt * 2.3) * 0.4, f.center.z + Math.sin(tt * 0.8) * f.r);
        f.obj.rotation.y = -tt + Math.PI / 2;
        const flap = Math.sin(t * 60 + f.phase) * 0.4;
        f.obj.children[1].rotation.z = flap;
        f.obj.children[2].rotation.z = -flap;
      }
    },
  };
}
