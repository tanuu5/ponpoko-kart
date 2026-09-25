// Course 2 decoration: castle town, thousand-torii tunnel, shrine plateau with pagoda,
// waterfall & pond, sakura everywhere, falling petals, Mt. Fuji.
import * as THREE from 'three';
import { WaterSystem, createWaterMaterial, buildWaterMesh } from '../../world/Water.js';
import { ScatterField, windMaterial, tuftGeometry } from '../../world/Vegetation.js';
import { PropInstancer } from '../../world/Instancer.js';
import { createFuji, createRidgeRing } from '../../world/Backdrop.js';
import { createWaterfall } from '../../world/Waterfall.js';
import { rng, alongTrack, ColliderGrid, createCornerSign } from '../common.js';
import { POND_WATER, POND, CENTER, FUJI_ANGLE, PLATEAU_Y, streamDist, townMask } from './terrain.js';

const has = (m, k) => m && typeof m[k] === 'function';

export async function buildSakura(ctx) {
  const { scene, track: T, terrain, world, renderer } = ctx;
  const S = await import('../../props/shrine.js').catch((e) => (console.warn('shrine props unavailable', e), {}));
  const F = await import('../../props/festival.js').catch((e) => (console.warn('festival props unavailable', e), {}));
  const R = await import('../../props/rural.js').catch((e) => (console.warn('rural props unavailable', e), {}));
  const sunDir = world.env.sky.sunDir.clone();
  const updaters = [];
  const rand = rng(777);
  const colliders = new ColliderGrid(12);
  world.colliders = colliders;
  const L = T.length;
  const b = T.bounds;
  const _ts = {};
  const P = new PropInstancer({ chunk: 160 });
  const ground = (x, z) => terrain.heightAt(x, z);
  const addProp = (key, fn, x, z, rotY = 0, scale = 1, opts = {}) => {
    const y = opts.y ?? ground(x, z);
    P.add(key, fn, { x, y, z, rotY, scale, collide: opts.collide ?? true });
  };
  const faceRoadYaw = (fr, side) => Math.atan2(-fr.right.x * side, -fr.right.z * side);
  const alongYaw = (fr) => Math.atan2(fr.tan.x, fr.tan.z);
  const treeOK = (x, z, minEdge = 5) => {
    const s = terrain.sample(x, z, _ts);
    if (s.edge < minEdge) return false;
    if (streamDist(x, z) < 9 || Math.hypot(x - POND[0], z - POND[1]) < 30) return false;
    return true;
  };

  // ------------------------------------------------------------------ water (pond + stream)
  const water = new WaterSystem(renderer.renderer, scene, sunDir, { reflection: world.quality !== 'low', reflectionHeight: POND_WATER, reflectionScale: 0.5 });
  const pondMat = createWaterMaterial({
    deep: 0x1f4a52, shallow: 0x5a8a78, skyTop: 0x3a78d0, skyHorizon: 0xd8e8f8, sunColor: 0xfff4e0,
    reflStrength: 0.85, waveAmp: 0.1, waveScale: 0.9, flow: 0.3, edgeFade: 0.2, specular: 1.0,
  });
  const pondMesh = buildWaterMesh(terrain, POND_WATER, {
    minX: -200, maxX: 60, minZ: -360, maxZ: 120, cell: 2.5,
    include: (x, z) => Math.hypot(x - POND[0], z - POND[1]) < 34 || streamDist(x, z) < 9,
    material: pondMat,
  });
  water.add(pondMesh, { reflect: true });
  updaters.push((dt) => water.update(dt));
  world.beforeRender = (r, cam) => water.beforeRender(r, cam);
  world.water = water;

  // waterfall from the plateau cliff into the pond
  const wf = createWaterfall([74, PLATEAU_Y - 0.6, -352], [POND[0] + 12, POND_WATER, POND[1] - 10], 8, { heightAt: (x, z) => terrain.heightAt(x, z) });
  scene.add(wf.mesh);
  let fxRef = null;
  updaters.push((dt) => wf.update(dt, fxRef));

  // ------------------------------------------------------------------ vegetation
  const grassMat = windMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }, { amp: 0.55, key: 'sgrass' });
  const grassGeo = tuftGeometry({ blades: 14, height: 0.4, spread: 0.26, width: 0.018, lean: 0.5, colorBase: [0.14, 0.26, 0.06], colorTip: [0.5, 0.72, 0.22], seed: 21 });
  const grass = new ScatterField(grassGeo, grassMat, { chunk: 40, maxDist: 110, name: 'grass' });
  // nanohana (yellow rapeseed blossoms): tufts with yellow tips
  const flowerMat = windMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }, { amp: 0.7, key: 'nanohana' });
  const flowerGeo = tuftGeometry({ blades: 10, height: 0.75, spread: 0.2, width: 0.03, lean: 0.25, colorBase: [0.15, 0.32, 0.07], colorTip: [1.0, 0.86, 0.1], seed: 31 });
  const flowers = new ScatterField(flowerGeo, flowerMat, { chunk: 40, maxDist: 120, name: 'nanohana' });
  for (let s = 0; s < L; s += 0.9) {
    if (T.inGap(s)) continue;
    const fr = T.frameAt(s);
    for (const side of [-1, 1]) {
      const e = 0.3 + rand() * 4;
      const p = fr.pos.clone().addScaledVector(fr.right, side * (fr.width + e));
      const ts = terrain.sample(p.x, p.z, _ts);
      if (Math.abs(ts.h - fr.pos.y) > 3) continue;
      grass.add(p.x, ts.h - 0.02, p.z, rand() * 6.28, 0.7 + rand() * 0.6);
    }
  }
  for (let i = 0; i < 30000; i++) {
    const x = b.min.x - 150 + rand() * (b.max.x - b.min.x + 300);
    const z = b.min.z - 150 + rand() * (b.max.z - b.min.z + 300);
    const ts = terrain.sample(x, z, _ts);
    if (ts.edge < 0.6 || streamDist(x, z) < 6 || Math.hypot(x - POND[0], z - POND[1]) < 28) continue;
    if (townMask(x, z) > 0.5 && ts.edge > 8) continue;
    // meadow west: nanohana patches
    const meadow = x < -40 && z > -220 && z < 90;
    if (meadow && Math.sin(x * 0.05) + Math.cos(z * 0.045) > 0.4 && rand() < 0.7) flowers.add(x, ts.h - 0.02, z, rand() * 6.28, 0.8 + rand() * 0.5);
    else grass.add(x, ts.h - 0.02, z, rand() * 6.28, 0.6 + rand() * 0.8);
  }
  grass.build(scene);
  flowers.build(scene);
  updaters.push((dt, t, c) => {
    if (c && c.camera) {
      grass.update(c.camera);
      flowers.update(c.camera);
    }
  });

  // ------------------------------------------------------------------ thousand torii tunnel
  if (has(S, 'createTorii')) {
    const s0 = T.cpToS(11.05), s1 = T.cpToS(13.9);
    let len = s1 - s0;
    if (len < 0) len += L;
    const step = 3.1;
    let k = 0;
    for (let u = 0; u < len; u += step) {
      const fr = T.frameAt(s0 + u);
      const variant = k % 3;
      addProp('senbon' + variant, () => S.createTorii({ style: 'myojin', material: 'vermilion', height: 7.4, span: 15.4, plaque: variant === 0 ? '奉納' : null, seed: 20 + variant }), fr.pos.x, fr.pos.z, alongYaw(fr), 1, { y: fr.pos.y - 0.15, collide: false });
      k++;
    }
    // big gate at the entrance
    const fr0 = T.frameAt(s0 - 10);
    addProp('bigTorii', () => S.createTorii({ style: 'myojin', material: 'vermilion', height: 11, span: 19.5, plaque: '稲荷神社', seed: 3 }), fr0.pos.x, fr0.pos.z, alongYaw(fr0), 1, { y: fr0.pos.y - 0.2, collide: false });
    for (const sd of [-1, 1]) {
      const p = fr0.pos.clone().addScaledVector(fr0.right, sd * 9.75);
      colliders.add(p.x, p.z, 0.8);
    }
  }
  // start gate over the town street
  if (has(S, 'createTorii')) {
    const fr = T.frameAt(0);
    addProp('startTorii', () => S.createTorii({ style: 'myojin', material: 'vermilion', height: 11.5, span: 21.5, plaque: 'ぽんぽこ', seed: 5 }), fr.pos.x, fr.pos.z, alongYaw(fr), 1, { y: fr.pos.y - 0.2, collide: false });
    for (const sd of [-1, 1]) {
      const p = fr.pos.clone().addScaledVector(fr.right, sd * 10.75);
      colliders.add(p.x, p.z, 0.8);
    }
  }

  // ------------------------------------------------------------------ plateau shrine grounds
  if (has(S, 'createPagoda')) addProp('pagoda', () => S.createPagoda({ seed: 1 }), 150, -372, Math.PI * 0.85);
  if (has(S, 'createShrineHall')) addProp('hall', () => S.createShrineHall({ seed: 1 }), 95, -382, 0.15);
  if (has(S, 'createKomainu')) {
    addProp('komaA', () => S.createKomainu({ side: 'a', seed: 1 }), 84, -360, 0.15 + 0.3);
    addProp('komaU', () => S.createKomainu({ side: 'un', seed: 1 }), 106, -358, 0.15 - 0.3);
  }
  if (has(S, 'createGoshinboku')) addProp('goshin', () => S.createGoshinboku({ seed: 2 }), 185, -335, 0.7);
  if (has(S, 'createEmaRack')) addProp('ema', () => S.createEmaRack({ seed: 1 }), 122, -368, 0.2);
  if (has(S, 'createTemizuya')) addProp('temizu', () => S.createTemizuya({ seed: 1 }), 70, -365, 0.4);
  if (has(S, 'createStoneLantern')) {
    for (const side of [-1, 1]) {
      alongTrack(T, T.cpToS(14.1), T.cpToS(15.9), 11, side, 3.8, (p, fr) => addProp('slantern', () => S.createStoneLantern({ lit: false, seed: 2 }), p.x, p.z, faceRoadYaw(fr, side)));
      alongTrack(T, T.cpToS(1.0), T.cpToS(2.0), 14, side, 3.0, (p, fr) => addProp('slantern', () => S.createStoneLantern({ lit: false, seed: 2 }), p.x, p.z, faceRoadYaw(fr, side)));
    }
  }
  if (has(S, 'createToro')) {
    alongTrack(T, T.cpToS(13.9), T.cpToS(14.9), 9, 1, 2.5, (p, fr) => addProp('toro', () => S.createToro({ lit: false, seed: 1 }), p.x, p.z, faceRoadYaw(fr, 1)));
  }

  // ------------------------------------------------------------------ switchback stone walls (visual)
  if (has(S, 'createStoneWall')) {
    const wallSpans = [[4.4, 11.0, -1], [4.4, 11.0, 1], [13.95, 16.0, -1], [13.95, 16.0, 1]];
    for (const [a, bb, side, off] of wallSpans) {
      alongTrack(T, T.cpToS(a), T.cpToS(bb), 7.5, side, off ?? (a > 13 ? 3.3 : 2.8), (p, fr) => addProp('swall', () => S.createStoneWall({ length: 8, height: 1.1, seed: 6 }), p.x, p.z, faceRoadYaw(fr, side), 1, { collide: false }));
    }
  }

  // ------------------------------------------------------------------ town: machiya & houses, nobori, lanterns
  const townSides = [
    [T.cpToS(22.6), T.cpToS(23.95)],
    [0, T.cpToS(1.9)],
  ];
  let hi = 0;
  for (const [a, bb] of townSides) {
    for (const side of [-1, 1]) {
      alongTrack(T, a, bb, 11, side, 9.5, (p, fr, s) => {
        if (Math.abs(T.deltaS(s, 0)) < 12) return;
        hi++;
        const yaw = faceRoadYaw(fr, side);
        if (has(F, 'createMachiya') && hi % 3 !== 0) {
          const seed = hi % 4;
          const pp = p.clone().addScaledVector(fr.right, side * 3.5);
          addProp('machiya' + seed, () => F.createMachiya({ lit: false, seed }), pp.x, pp.z, yaw);
        } else if (has(R, 'createTileHouse')) {
          const pp = p.clone().addScaledVector(fr.right, side * 5);
          addProp('tile' + (hi % 3), () => R.createTileHouse({ seed: hi % 3 }), pp.x, pp.z, yaw);
        }
      });
      if (has(F, 'createNobori')) {
        const texts = ['桜まつり', '団子', '甘味', '茶屋'];
        let n = 0;
        alongTrack(T, a, bb, 16, side, 2.4, (p, fr) => {
          const t = texts[n++ % texts.length];
          addProp('nobori' + t, () => F.createNobori({ text: t, seed: n, lit: false }), p.x, p.z, faceRoadYaw(fr, side), 1, { collide: false });
        });
      }
    }
  }
  if (has(F, 'createNodateBench')) {
    const fr = T.frameAt(T.cpToS(0.6));
    const p = fr.pos.clone().addScaledVector(fr.right, -(fr.width + 5));
    addProp('bench', () => F.createNodateBench({ seed: 1, lit: false }), p.x, p.z, faceRoadYaw(fr, -1));
  }

  // ------------------------------------------------------------------ castle on the east hill
  if (has(S, 'createCastle')) addProp('castle', () => S.createCastle({ seed: 1 }), 185, 70, -2.4, 1.0);

  // red bridge over the stream in the meadow (decorative)
  if (has(S, 'createRedBridge')) addProp('redbridge', () => S.createRedBridge({ length: 16, width: 3.2, seed: 1 }), -148, -96, 0.05, 1, { y: POND_WATER + 0.4 });

  // ------------------------------------------------------------------ sakura trees everywhere
  if (has(S, 'createSakuraTree')) {
    // lining the town street and the meadow road
    for (const [a, bb, spacing] of [[T.cpToS(22.3), T.cpToS(23.99), 13], [0, T.cpToS(2.6), 13], [T.cpToS(18.3), T.cpToS(22.0), 17], [T.cpToS(2.8), T.cpToS(4.6), 18]]) {
      for (const side of [-1, 1]) {
        alongTrack(T, a, bb, spacing, side, 4.2 + rand() * 1.5, (p, fr, s) => {
          if (Math.abs(T.deltaS(s, 0)) < 10) return;
          if (!treeOK(p.x, p.z, 3)) return;
          const v = Math.floor(rand() * 4);
          const flat = terrain.normalAt(p.x, p.z).y > 0.985;
          addProp('sakura' + v + (flat ? '' : 'nc'), () => S.createSakuraTree({ seed: 10 + v, size: 1, carpet: flat }), p.x, p.z, rand() * 6.28, 0.85 + rand() * 0.3);
        });
      }
    }
    // around the plateau and the mountain
    let n = 0;
    for (let i = 0; i < 2500 && n < 120; i++) {
      const x = -60 + rand() * 300, z = -440 + rand() * 330;
      if (!treeOK(x, z, 7)) continue;
      const h = ground(x, z);
      if (h < 3) continue;
      const v = Math.floor(rand() * 4);
      const flat = terrain.normalAt(x, z).y > 0.985;
      addProp('sakura' + v + (flat ? '' : 'nc'), () => S.createSakuraTree({ seed: 10 + v, size: 1, carpet: flat }), x, z, rand() * 6.28, 0.8 + rand() * 0.35);
      n++;
    }
  }
  if (has(S, 'createWeepingSakura')) {
    for (const [x, z] of [[-120, -150], [-118, -40], [-60, -110], [-125, 30], [60, -350], [130, -318]]) {
      if (!treeOK(x, z, 4)) continue;
      const flat = terrain.normalAt(x, z).y > 0.985;
      addProp('shidare' + (flat ? '' : 'nc'), () => S.createWeepingSakura({ seed: 4, carpet: flat }), x, z, rand() * 6.28, 1);
    }
  }
  if (has(S, 'createPine')) {
    let n = 0;
    for (let i = 0; i < 1500 && n < 50; i++) {
      const x = b.min.x - 80 + rand() * (b.max.x - b.min.x + 160);
      const z = b.min.z - 80 + rand() * (b.max.z - b.min.z + 160);
      if (!treeOK(x, z, 8)) continue;
      if (ground(x, z) < 8) continue;
      addProp('pine' + (n % 3), () => S.createPine({ seed: n % 3 }), x, z, rand() * 6.28, 0.9 + rand() * 0.4);
      n++;
    }
  }
  if (has(R, 'createCedar')) {
    let n = 0;
    for (let i = 0; i < 3000 && n < 140; i++) {
      const x = -150 + rand() * 450, z = -560 + rand() * 260;
      if (!treeOK(x, z, 10)) continue;
      if (ground(x, z) < 12) continue;
      addProp('cedar' + (n % 4), () => R.createCedar({ seed: n % 4 }), x, z, rand() * 6.28, 0.8 + rand() * 0.5);
      n++;
    }
  }
  if (has(R, 'createBambooClump')) {
    for (const [x, z] of [[-30, -160], [20, -150], [200, -205], [215, -150], [-150, 100], [60, -60]]) {
      if (treeOK(x, z, 6)) addProp('bamboo' + (Math.abs(Math.round(x)) % 3), () => R.createBambooClump({ seed: Math.abs(Math.round(x)) % 3 }), x, z, rand() * 6.28);
    }
  }
  // corner signs at the hairpins
  for (const [cp, dir] of [[5.4, -1], [9.4, 1], [13.2, -1], [21.9, -1]]) {
    const s = T.cpToS(cp);
    const fr = T.frameAt(s);
    const p = fr.pos.clone().addScaledVector(fr.right, -dir * (fr.width + 2.0));
    addProp('sign' + dir, () => createCornerSign(dir), p.x, p.z, alongYaw(fr) + Math.PI, 1, { collide: false });
  }

  P.build(scene);
  for (const c of P.colliders) colliders.add(c.x, c.z, c.r);

  // ------------------------------------------------------------------ backdrop
  const fuji = createFuji({
    height: 950, radius: 2600, color: 0x5a6f9e, snowColor: 0xffffff, haze: 0xc6daf0, hazeAmt: 0.45,
    sunDir: sunDir.toArray(), sunColor: 0xfff0e0, ambient: 0x8a9ac0, snowLine: 0.6,
  });
  fuji.position.set(CENTER[0] + Math.cos(FUJI_ANGLE) * 4200, -80, CENTER[1] + Math.sin(FUJI_ANGLE) * 4200);
  scene.add(fuji);
  const ring = createRidgeRing({ radius: 2600, step: 500, layers: 3, minH: 100, maxH: 300, haze: 0xbfd3ea, color: 0x3e5a6e, topColor: 0xa9c3dd, hazeBase: 0.35, hazeStep: 0.18, gap: { angle: FUJI_ANGLE, width: 0.3 }, seed: 12 });
  ring.position.set(CENTER[0], -60, CENTER[1]);
  scene.add(ring);

  // ------------------------------------------------------------------ falling petals around the camera
  const petalState = { acc: 0 };
  updaters.push((dt, t, c) => {
    if (!fxRef || !c || !c.camera) return;
    petalState.acc += dt * 70;
    const cam = c.camera.position;
    while (petalState.acc > 1) {
      petalState.acc -= 1;
      const x = cam.x + (Math.random() - 0.5) * 60;
      const z = cam.z + (Math.random() - 0.5) * 60;
      const y = cam.y + 4 + Math.random() * 10;
      const tint = Math.random();
      fxRef.petals.spawn({
        x, y, z, vx: 0.8 + Math.random() * 0.8, vy: -0.7 - Math.random() * 0.5, vz: 0.3 + Math.random() * 0.4,
        life: 9, size: 0.1 + Math.random() * 0.05, size1: 0.1,
        r: 1.0, g: 0.74 + tint * 0.12, b: 0.82 + tint * 0.08, a: 1, a1: 0.8, drag: 0.3,
        vrot: (Math.random() - 0.5) * 6, flutter: 2.2, floorY: ground(x, z) + 0.03,
      });
    }
  });

  return {
    update(dt, t, c) {
      for (const u of updaters) u(dt, t, c);
    },
    attachFX(fx) {
      fxRef = fx;
    },
  };
}
