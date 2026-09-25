// Course 3: 夏祭り花火ナイト — summer festival night in an onsen town by the river.
import { natural, waterLevelAt, surfaceAt, colorAt } from './terrain.js';
import { buildMatsuri } from './build.js';

export default {
  id: 'matsuri',
  name: '夏祭り花火ナイト',
  subtitle: 'Natsumatsuri Hanabi Night',
  description: '提灯きらめく屋台通りと温泉街。夜空に咲く花火の下、川を和傘でひとっ飛び！',
  laps: 3,
  bgm: 'matsuri',
  ambience: 'matsuri',
  colors: ['#ff8a3c', '#3a2a8a'],
  track: {
    width: 8,
    wallMargin: 12,
    points: [
      [-40, 1.0, -45, 8.5],
      [40, 1.0, -45, 8.5],
      [110, 1.0, -46, 8.5],
      [160, 1.0, -66, 8.5, 0.05],
      [196, 1.1, -40, 8],
      [205, 1.6, 0, 7.5],
      [200, 1.1, 45, 8],
      [150, 1.0, 72, 8, 0.04],
      [60, 1.0, 76, 8],
      [-20, 1.4, 70, 8],
      [-75, 4.0, 95, 8],
      [-120, 9.0, 102, 8.5, -0.06],
      [-138, 11.0, 62, 9],
      [-140, 2.0, -60, 9.5],
      [-115, 1.0, -88, 8.5, 0.05],
      [-80, 1.0, -62, 8.5],
    ],
    zones: {
      gaps: [{ from: 12.3, to: 12.82 }],
      bridges: [{ from: 4.6, to: 5.45, style: 'red' }],
      ramps: [
        { at: { cp: 12.3, off: -12 }, len: 12, h: 2.4, d0: -8.5, d1: 8.5, type: 'glide', launch: 10 },
        { at: 7.6, len: 8, h: 1.3, d0: -3.5, d1: 3.5, type: 'jump', launch: 8.5 },
      ],
      boosts: [
        { at: 1.6, d: 0, len: 5 },
        { at: 8.4, d: -3.5, len: 5 },
        { at: 10.4, d: 0, len: 5 },
        { at: 14.6, d: 3, len: 5 },
      ],
      items: [{ at: 0.7 }, { at: 6.6 }, { at: 11.3 }, { at: 14.1 }],
      coins: [
        { from: 1.9, to: 2.6, d: 3, count: 6 },
        { from: 7.9, to: 8.3, d: 0, count: 5 },
        { from: 9.2, to: 9.8, d: -3, count: 5 },
        { from: 13.2, to: 13.8, d: 0, count: 5 },
        // floating over the river under the fireworks
        { from: 12.36, to: 12.76, d: 1.5, count: 7, h: 4, arc: 2.5, wave: 3 },
      ],
      walls: [
        // festival street lined with stalls
        { from: 15.2, to: 2.7, side: 'both', offset: 3.2 },
        // onsen street
        { from: 6.4, to: 9.4, side: 'both', offset: 3.2 },
        // around the plaza
        { from: 2.7, to: 4.5, side: 'both', offset: 6 },
      ],
    },
  },
  trackStyle: { road: 'stone', roadOpts: { hue: 28, rows: 12, seed: 21, grout: '#3a3631' }, roadColor: 0xd8d0c8, roadRoughness: 0.7, skirtMat: 'stoneDark', texLen: 14, tile: 4.0 },
  terrain: { natural, shoulder: 2.0, blend: 8, waterLevelAt, surfaceAt, colorAt },
  terrainMesh: { res: 2, margin: 100, outer: 1600 },
  waterLevelAt,
  surfaceAt,
  shallowWater: 'water',
  killY: -12,
  build: buildMatsuri,
  introShots: (t) => [
    // glide over the festival street along the lantern strings
    { path: { track: t, s0: t.cpToS(0.2), s1: t.cpToS(1.7), h: 7.8, d: 0, ahead: 22 }, dur: 3.8, fov: 58 },
    // the river, floating lanterns and fireworks
    { from: [125, 5, -26], to: [70, 8, -22], look: [320, 110, 0], lookTo: [300, 100, 10], dur: 3.2, fov: 55 },
  ],
  env: {
    sky: {
      zenith: 0x040a1e,
      horizon: 0x1a2650,
      haze: 0x2c2c5e,
      ground: 0x08080c,
      sunDir: [0.3, 0.55, -0.78],
      sunColor: 0x000000,
      sunGlow: 0,
      sunDisk: 0,
      cloudCover: 0.62,
      cloudSoft: 0.25,
      cloudOpacity: 0.45,
      cloudLit: 0x39487a,
      cloudShade: 0x0e1328,
      stars: 1,
      moon: 1.2,
      moonDir: [0.3, 0.55, -0.78],
      gradExp: 0.5,
      billboards: { count: 8, lit: 0x3a4876, shade: 0x0c1024, opacity: 0.5, minH: 200, maxH: 420, dist: 2300, minW: 500, maxW: 1000, rimAmt: 0.2 },
    },
    sun: { color: 0x9cb4ff, intensity: 0.7, shadowFar: 140, shadowIntensity: 0.7 },
    hemi: { sky: 0x2c3c70, ground: 0x140e0a, intensity: 0.46 },
    headlights: true,
    fog: { color: 0x0e1530, density: 0.0017, sunColor: 0x26315e },
    envIntensity: 0.25,
    look: { exposure: 1.2, bloomStrength: 0.95, bloomRadius: 0.62, bloomThreshold: 0.75, saturation: 1.15, contrast: 1.06, tint: [1.0, 0.98, 1.04], lift: [0.005, 0.005, 0.02], vignette: 0.45, grain: 0.022 },
  },
};
