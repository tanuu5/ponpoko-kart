// Course 3 decoration: festival street of yatai under lantern strings, yagura plaza,
// lantern bridge, onsen street with steam, floating lanterns on the river, fireworks.
import * as THREE from 'three';
import { WaterSystem, createWaterMaterial, buildWaterMesh } from '../../world/Water.js';
import { ScatterField, windMaterial, tuftGeometry } from '../../world/Vegetation.js';
import { PropInstancer } from '../../world/Instancer.js';
import { createRidgeRing } from '../../world/Backdrop.js';
import { LightPool } from '../../world/LightPool.js';
import { rng, alongTrack, ColliderGrid, createCornerSign } from '../common.js';
import { RIVER_WATER, CENTER, riverZ } from './terrain.js';

const has = (m, k) => m && typeof m[k] === 'function';
const YATAI = ['takoyaki', 'yakisoba', 'wataame', 'kingyo', 'ringoame', 'kakigori', 'omen'];

export async function buildMatsuri(ctx) {
  const { scene, track: T, terrain, world, renderer } = ctx;
  const S = await import('../../props/shrine.js').catch((e) => (console.warn('shrine props unavailable', e), {}));
  const F = await import('../../props/festival.js').catch((e) => (console.warn('festival props unavailable', e), {}));
  const R = await import('../../props/rural.js').catch((e) => (console.warn('rural props unavailable', e), {}));
  const updaters = [];
  const rand = rng(8080);
  const colliders = new ColliderGrid(12);
  world.colliders = colliders;
  const L = T.length;
  const b = T.bounds;
  const _ts = {};
  const P = new PropInstancer({ chunk: 140 });
  const ground = (x, z) => terrain.heightAt(x, z);
  const addProp = (key, fn, x, z, rotY = 0, scale = 1, opts = {}) => {
    const y = opts.y ?? ground(x, z);
    P.add(key, fn, { x, y, z, rotY, scale, collide: opts.collide ?? true });
  };
  const faceRoadYaw = (fr, side) => Math.atan2(-fr.right.x * side, -fr.right.z * side);
  const alongYaw = (fr) => Math.atan2(fr.tan.x, fr.tan.z);
  const lights = new LightPool(scene, { count: 8, color: 0xffa04a, intensity: 55, distance: 26 });
  const moonDir = new THREE.Vector3(...world.def.env.sky.moonDir).normalize();

  // ------------------------------------------------------------------ river with reflections
  const water = new WaterSystem(renderer.renderer, scene, moonDir, { reflection: world.quality !== 'low', reflectionHeight: RIVER_WATER, reflectionScale: 0.55 });
  const riverMat = createWaterMaterial({
    deep: 0x040a14, shallow: 0x0c1a24, skyTop: 0x0a1432, skyHorizon: 0x1a2650, sunColor: 0xc8d6ff,
    reflStrength: 1.0, waveAmp: 0.09, waveScale: 0.8, flow: 0.5, flowDir: [1, 0], edgeFade: 0.3, specular: 0.6,
  });
  const riverMesh = buildWaterMesh(terrain, RIVER_WATER, {
    minX: b.min.x - 700, maxX: b.max.x + 700, minZ: -40, maxZ: 40, cell: 3,
    include: (x, z) => Math.abs(z - riverZ(x)) < 24,
    material: riverMat,
  });
  water.add(riverMesh, { reflect: true });
  updaters.push((dt) => water.update(dt));
  world.beforeRender = (r, cam) => water.beforeRender(r, cam);
  world.water = water;

  // floating lanterns (灯籠流し)
  const flGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  flGeo.translate(0, 0.35, 0);
  const flMat = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xff9a3c, emissiveIntensity: 2.6, roughness: 0.9 });
  const baseGeo = new THREE.BoxGeometry(0.62, 0.1, 0.62);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 });
  const nFl = 90;
  const flMesh = new THREE.InstancedMesh(flGeo, flMat, nFl);
  const flBase = new THREE.InstancedMesh(baseGeo, baseMat, nFl);
  flMesh.frustumCulled = flBase.frustumCulled = false;
  const floats = [];
  for (let i = 0; i < nFl; i++) floats.push({ x: -350 + rand() * 900, off: (rand() - 0.5) * 26, speed: 0.6 + rand() * 0.5, ph: rand() * 10 });
  scene.add(flMesh, flBase);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  updaters.push((dt, t) => {
    for (let i = 0; i < nFl; i++) {
      const f = floats[i];
      f.x += f.speed * dt;
      if (f.x > 560) f.x = -350;
      const z = riverZ(f.x) + f.off * 0.8 + Math.sin(t * 0.3 + f.ph) * 0.8;
      _q.setFromEuler(_e.set(Math.sin(t * 1.3 + f.ph) * 0.05, f.ph, Math.cos(t * 1.1 + f.ph) * 0.05));
      _m.compose(_p.set(f.x, RIVER_WATER + 0.02 + Math.sin(t * 1.7 + f.ph) * 0.03, z), _q, _s);
      flMesh.setMatrixAt(i, _m);
      flBase.setMatrixAt(i, _m);
    }
    flMesh.instanceMatrix.needsUpdate = true;
    flBase.instanceMatrix.needsUpdate = true;
  });

  // ------------------------------------------------------------------ grass (sparse, dark)
  const grassMat = windMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }, { amp: 0.45, key: 'mgrass' });
  const grass = new ScatterField(tuftGeometry({ blades: 12, height: 0.45, spread: 0.24, width: 0.018, lean: 0.5, colorBase: [0.1, 0.18, 0.05], colorTip: [0.35, 0.5, 0.18], seed: 41 }), grassMat, { chunk: 40, maxDist: 90, name: 'grass' });
  for (let i = 0; i < 16000; i++) {
    const x = b.min.x - 120 + rand() * (b.max.x - b.min.x + 240);
    const z = b.min.z - 120 + rand() * (b.max.z - b.min.z + 240);
    const ts = terrain.sample(x, z, _ts);
    if (ts.edge < 4 || Math.abs(z - riverZ(x)) < 24) continue;
    grass.add(x, ts.h - 0.02, z, rand() * 6.28, 0.6 + rand() * 0.7);
  }
  grass.build(scene);
  updaters.push((dt, t, c) => { if (c && c.camera) grass.update(c.camera); });

  // ------------------------------------------------------------------ festival street
  const streetA = T.cpToS(14.9), streetB = T.cpToS(2.6);
  let yi = 0;
  for (const side of [-1, 1]) {
    alongTrack(T, streetA, streetB, 7.2, side, 6.2, (p, fr, s) => {
      if (Math.abs(T.deltaS(s, 0)) < 9) return;
      if (!has(F, 'createYatai')) return;
      const type = YATAI[yi % YATAI.length];
      yi++;
      addProp('yatai_' + type, () => F.createYatai({ type, lit: true, seed: yi % 3 }), p.x, p.z, faceRoadYaw(fr, side));
      lights.add(p.clone().add(new THREE.Vector3(0, 2.6, 0)).addScaledVector(fr.right, -side * 1.2), { intensity: 45 });
      // people browsing in front of every other stall
      if (has(F, 'createFestivalPerson') && yi % 2 === 0) {
        for (let k = 0; k < 3; k++) {
          const pp = p.clone().addScaledVector(fr.right, -side * (1.8 + rand() * 0.6)).addScaledVector(fr.tan, (rand() - 0.5) * 5);
          const seed = Math.floor(rand() * 8);
          addProp('person' + seed, () => F.createFestivalPerson({ seed }), pp.x, pp.z, faceRoadYaw(fr, -side) + (rand() - 0.5) * 1.5 + Math.PI, 1, { collide: false });
        }
      }
    });
  }
  // lantern strings across the street + poles
  if (has(F, 'createLanternString')) {
    const strings = new THREE.Group();
    let n = 0;
    alongTrack(T, streetA, streetB, 13, 1, 0, (p, fr, s) => {
      const w = fr.width + 4.2;
      const a = fr.pos.clone().addScaledVector(fr.right, -w);
      const bb = fr.pos.clone().addScaledVector(fr.right, w);
      a.y = ground(a.x, a.z) + 6.2;
      bb.y = ground(bb.x, bb.z) + 6.2;
      try {
        strings.add(F.createLanternString({ a: a.toArray(), b: bb.toArray(), count: 9, sag: 1.2, colors: ['red', 'white', 'red'], texts: ['祭', '祭', '夏'], seed: n++ }));
      } catch (e) { /* ignore */ }
      for (const q of [a, bb]) {
        addProp('lpole', () => {
          const g = new THREE.Group();
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6.6, 8), new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.9 }));
          m.position.y = 3.3;
          m.castShadow = true;
          g.add(m);
          return g;
        }, q.x, q.z, 0, 1, { collide: false });
      }
      lights.add(fr.pos.clone().setY(fr.pos.y + 5), { intensity: 45, color: 0xff9a4a });
    });
    merge(strings, scene);
  }
  // nobori flags
  if (has(F, 'createNobori')) {
    const texts = ['祭', '花火大会', '盆踊り', 'かき氷'];
    let n = 0;
    for (const side of [-1, 1]) {
      alongTrack(T, streetA, streetB, 21, side, 3.8, (p, fr) => {
        const t = texts[n++ % texts.length];
        addProp('nobori' + t, () => F.createNobori({ text: t, seed: n }), p.x, p.z, faceRoadYaw(fr, side), 1, { collide: false });
      });
    }
  }
  // machiya behind the stalls on the north side
  if (has(F, 'createMachiya')) {
    let n = 0;
    alongTrack(T, streetA, streetB, 10, -1, 16, (p, fr) => {
      const seed = n++ % 4;
      addProp('machiyaL' + seed, () => F.createMachiya({ lit: true, seed }), p.x, p.z, faceRoadYaw(fr, -1));
    });
    alongTrack(T, streetA, streetB, 12, 1, 16, (p, fr) => {
      if (Math.abs(p.z - riverZ(p.x)) < 28) return;
      const seed = n++ % 4;
      addProp('machiyaR' + seed, () => F.createMachiya({ lit: true, seed }), p.x, p.z, faceRoadYaw(fr, 1));
    });
  }

  // ------------------------------------------------------------------ yagura plaza
  const plaza = new THREE.Vector3(150, 0, -108);
  plaza.y = ground(plaza.x, plaza.z);
  if (has(F, 'createYagura')) {
    const yaw = 0.3;
    addProp('yagura', () => F.createYagura({ seed: 1, lit: true }), plaza.x, plaza.z, yaw);
    colliders.add(plaza.x, plaza.z, 3.5);
    lights.add(plaza.clone().add(new THREE.Vector3(0, 7, 0)), { intensity: 120, color: 0xff9a4a });
    // poles holding the ends of the radiating lantern strings
    let ends = null;
    try { ends = F.createYagura({ seed: 1, lit: true }).userData.stringEnds; } catch (e) { ends = null; }
    for (const e of ends || []) {
      const v = new THREE.Vector3(e.x ?? e[0], 0, e.z ?? e[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const x = plaza.x + v.x, z = plaza.z + v.z;
      addProp('ypole', () => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.7, 8), new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.9 }));
        m.position.y = 1.35;
        m.castShadow = true;
        g.add(m);
        return g;
      }, x, z, 0, 1);
      colliders.add(x, z, 0.3);
    }
  }
  if (has(F, 'createFestivalCrowd')) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = plaza.x + Math.cos(a) * 9, z = plaza.z + Math.sin(a) * 9;
      addProp('crowd' + (i % 3), () => F.createFestivalCrowd({ count: 6, radius: 2.4, seed: i % 3 }), x, z, -a + Math.PI / 2, 1, { collide: false });
    }
  }
  if (has(F, 'createTaiko')) addProp('taiko', () => F.createTaiko({ seed: 2 }), plaza.x + 13, plaza.z + 2, 0.4);

  // ------------------------------------------------------------------ bridge lanterns
  if (has(F, 'createChochin')) {
    for (const br of T.bridges) {
      for (const side of [-1, 1]) {
        alongTrack(T, br.s0 - 1, br.s1 + 1, 5, side, 0.35, (p, fr) => {
          const y = fr.pos.y + 1.9;
          addProp('bridgeChochin', () => F.createChochin({ color: 'red', text: '祭', lit: true, size: 0.9, seed: 1, detail: 'low' }), p.x, p.z, faceRoadYaw(fr, side), 1, { y, collide: false });
        });
        const mid = T.frameAt((br.s0 + br.s1) / 2);
        lights.add(mid.pos.clone().addScaledVector(mid.right, side * (mid.width + 0.5)).setY(mid.pos.y + 1.8), { intensity: 45 });
      }
    }
  }
  if (has(F, 'createWoodenBridgeLanterned')) addProp('footbridge', () => F.createWoodenBridgeLanterned({ length: 46, width: 4, lit: true, seed: 2 }), 60, riverZ(60), 0, 1, { y: 0.9, collide: false });

  // ------------------------------------------------------------------ onsen street
  const onsenA = T.cpToS(6.3), onsenB = T.cpToS(9.4);
  if (has(F, 'createRyokan')) {
    let n = 0;
    for (const side of [-1, 1]) {
      alongTrack(T, onsenA, onsenB, 19, side, 13, (p, fr) => {
        if (Math.abs(p.z - riverZ(p.x)) < 30) return;
        const seed = n++ % 3;
        addProp('ryokan' + seed, () => F.createRyokan({ floors: 2 + (seed % 2), lit: true, seed }), p.x, p.z, faceRoadYaw(fr, side));
        lights.add(p.clone().setY(ground(p.x, p.z) + 3).addScaledVector(fr.right, -side * 5), { intensity: 50 });
      });
    }
  }
  if (has(F, 'createStreetLamp')) {
    for (const side of [-1, 1]) {
      alongTrack(T, onsenA, onsenB, 16, side, 3.8, (p, fr) => addProp('lamp', () => F.createStreetLamp({ lit: true, seed: 1 }), p.x, p.z, faceRoadYaw(fr, side)));
    }
  }
  const steamVents = [];
  if (has(F, 'createOnsenSteamVent')) {
    for (const [cp, side] of [[6.9, 1], [7.6, -1], [8.3, 1], [8.9, -1]]) {
      const fr = T.frameAt(T.cpToS(cp));
      const p = fr.pos.clone().addScaledVector(fr.right, side * (fr.width + 6));
      addProp('vent', () => F.createOnsenSteamVent({ seed: 1 }), p.x, p.z, 0);
      steamVents.push(p.clone().setY(ground(p.x, p.z)));
    }
  }
  if (has(S, 'createTorii')) {
    const fr = T.frameAt(T.cpToS(8.5));
    addProp('stoneTorii', () => S.createTorii({ style: 'myojin', material: 'stone', height: 11, span: 20.5, plaque: '湯の町', seed: 4 }), fr.pos.x, fr.pos.z, alongYaw(fr), 1, { y: fr.pos.y - 0.2, collide: false });
    for (const sd of [-1, 1]) {
      const p = fr.pos.clone().addScaledVector(fr.right, sd * 10.25);
      colliders.add(p.x, p.z, 0.8);
    }
    // start gate
    const f0 = T.frameAt(0);
    addProp('startTorii', () => S.createTorii({ style: 'myojin', material: 'vermilion', height: 11.5, span: 21.5, plaque: 'ぽんぽこ', seed: 6 }), f0.pos.x, f0.pos.z, alongYaw(f0), 1, { y: f0.pos.y - 0.2, collide: false });
    for (const sd of [-1, 1]) {
      const p = f0.pos.clone().addScaledVector(f0.right, sd * 10.75);
      colliders.add(p.x, p.z, 0.8);
    }
  }
  if (has(S, 'createStoneLantern')) {
    for (const side of [-1, 1]) {
      alongTrack(T, T.cpToS(8.6), T.cpToS(9.3), 10, side, 3.4, (p, fr) => addProp('slantern', () => S.createStoneLantern({ lit: true, seed: 3 }), p.x, p.z, faceRoadYaw(fr, side)));
    }
  }

  // ------------------------------------------------------------------ glide hill: bamboo lights & trees
  if (has(F, 'createTakeAkari')) {
    for (const side of [-1, 1]) {
      alongTrack(T, T.cpToS(9.6), T.cpToS(12.2), 9, side, 1.6, (p, fr) => addProp('take', () => F.createTakeAkari({ count: 5, lit: true, seed: 2 }), p.x, p.z, rand() * 6.28, 1, { collide: false }));
    }
    const mid = T.frameAt(T.cpToS(11));
    lights.add(mid.pos.clone().setY(mid.pos.y + 1.5), { intensity: 30 });
  }
  if (has(R, 'createBambooClump')) {
    for (const [x, z] of [[-160, 70], [-150, 135], [-95, 130], [-170, 20], [-55, 125]]) addProp('bamboo' + (Math.abs(x) % 3), () => R.createBambooClump({ seed: Math.abs(x) % 3 }), x, z, rand() * 6.28);
  }
  if (has(S, 'createPine')) {
    let n = 0;
    for (let i = 0; i < 800 && n < 40; i++) {
      const x = b.min.x - 90 + rand() * (b.max.x - b.min.x + 180);
      const z = b.min.z - 90 + rand() * (b.max.z - b.min.z + 180);
      const s = terrain.sample(x, z, _ts);
      if (s.edge < 12 || Math.abs(z - riverZ(x)) < 26) continue;
      addProp('pine' + (n % 3), () => S.createPine({ seed: n % 3 }), x, z, rand() * 6.28, 0.9 + rand() * 0.4);
      n++;
    }
  }
  if (has(R, 'createCedar')) {
    let n = 0;
    for (let i = 0; i < 2000 && n < 120; i++) {
      const x = -300 + rand() * 650, z = -330 + rand() * 660;
      const s = terrain.sample(x, z, _ts);
      if (s.edge < 16 || s.h < 6 || Math.abs(z - riverZ(x)) < 26) continue;
      addProp('cedar' + (n % 4), () => R.createCedar({ seed: n % 4 }), x, z, rand() * 6.28, 0.8 + rand() * 0.5);
      n++;
    }
  }
  for (const [cp, dir] of [[3.0, 1], [10.9, 1], [13.4, 1]]) {
    const fr = T.frameAt(T.cpToS(cp));
    const p = fr.pos.clone().addScaledVector(fr.right, -dir * (fr.width + 2.0));
    addProp('sign' + dir, () => createCornerSign(dir), p.x, p.z, alongYaw(fr) + Math.PI, 1, { collide: false });
  }

  P.build(scene);
  for (const c of P.colliders) colliders.add(c.x, c.z, c.r);

  const ring = createRidgeRing({ radius: 2400, step: 480, layers: 3, minH: 110, maxH: 300, haze: 0x151c3a, color: 0x070a14, topColor: 0x1c2446, hazeBase: 0.25, hazeStep: 0.2, seed: 31 });
  ring.position.set(CENTER[0], -60, CENTER[1]);
  scene.add(ring);

  // ------------------------------------------------------------------ fireworks
  let fxRef = null;
  const flash = new THREE.PointLight(0xffffff, 0, 900, 1.2);
  flash.position.set(300, 120, 0);
  scene.add(flash);
  const hemi = world.env.hemi;
  const baseHemi = hemi.intensity;
  const fw = { t: 2, flash: 0, color: new THREE.Color(), pending: [], timers: new Set() };
  const colors = [[1, 0.35, 0.3], [1, 0.8, 0.3], [0.4, 0.75, 1], [0.8, 0.45, 1], [0.45, 1, 0.55], [1, 0.55, 0.85]];
  updaters.push((dt, t, c) => {
    if (!fxRef) return;
    fw.t -= dt;
    if (fw.t <= 0) {
      fw.t = 0.6 + Math.random() * 1.6;
      const burst = new THREE.Vector3(140 + Math.random() * 220, 115 + Math.random() * 70, riverZ(260) + (Math.random() - 0.5) * 140);
      const col = colors[Math.floor(Math.random() * colors.length)];
      // rising trail
      fw.pending.push({ at: t + 1.1, pos: burst, col, style: Math.random() < 0.3 ? 'willow' : 'peony' });
      for (let i = 0; i < 18; i++) {
        fxRef.sparks.spawn({ x: burst.x, y: burst.y - 70 + i * 3.6, z: burst.z, vy: 40, life: 0.12 + i * 0.05, size: 0.8, size1: 0.2, r: 1, g: 0.8, b: 0.5, a: 0.9, a1: 0, grav: 0, stretch: 0.2 });
      }
    }
    for (let i = fw.pending.length - 1; i >= 0; i--) {
      const p = fw.pending[i];
      if (t >= p.at) {
        fxRef.firework(p.pos, p.col, p.style);
        fw.flash = 1;
        fw.color.setRGB(p.col[0], p.col[1], p.col[2]);
        flash.position.copy(p.pos);
        flash.color.copy(fw.color);
        const cam = c && c.camera ? c.camera.position : p.pos;
        const dist = cam.distanceTo(p.pos);
        const delay = Math.min(1.5, dist / 340);
        const vol = Math.max(0.15, 1 - dist / 700);
        if (c && c.audio) {
          const tid = setTimeout(() => {
            fw.timers.delete(tid);
            c.audio.play('firework', { volume: vol });
          }, delay * 1000);
          fw.timers.add(tid);
        }
        fw.pending.splice(i, 1);
      }
    }
    fw.flash = Math.max(0, fw.flash - dt * 1.8);
    flash.intensity = fw.flash * fw.flash * 3500;
    hemi.intensity = baseHemi + fw.flash * 0.35;
  });

  // steam from the onsen vents
  updaters.push((dt) => {
    if (!fxRef) return;
    for (const v of steamVents) {
      if (Math.random() < dt * 6) {
        fxRef.smoke.spawn({
          x: v.x + (Math.random() - 0.5), y: v.y + 0.4, z: v.z + (Math.random() - 0.5),
          vx: 0.3 + Math.random() * 0.3, vy: 1.2 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.4,
          life: 3.5, size: 1.2, size1: 5, r: 0.7, g: 0.72, b: 0.78, a: 0.25, a1: 0, drag: 0.3, vrot: (Math.random() - 0.5),
        });
      }
    }
  });
  updaters.push((dt, t, c) => { if (c && c.camera) lights.update(c.camera, t); });

  return {
    update(dt, t, c) {
      for (const u of updaters) u(dt, t, c);
    },
    attachFX(fx) {
      fxRef = fx;
    },
    dispose() {
      // cancel firework booms that are still "travelling" (sound delay) when the race ends
      for (const id of fw.timers) clearTimeout(id);
      fw.timers.clear();
      fxRef = null;
    },
  };
}

/** Merge all meshes of a group into one mesh per material and add to the scene. */
function merge(group, scene) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let arr = byMat.get(o.material);
    if (!arr) byMat.set(o.material, (arr = []));
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    arr.push(g.applyMatrix4(o.matrixWorld));
  });
  for (const [m, geos] of byMat) {
    const n = geos.reduce((a, g) => a + g.attributes.position.count, 0);
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const size = name === 'uv' ? 2 : 3;
      const arr = new Float32Array(n * size);
      let o = 0;
      for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    const mesh = new THREE.Mesh(out, m);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    scene.add(mesh);
  }
}
