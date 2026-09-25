// Course 2: 桜咲く千本鳥居 — spring shrine mountain with a thousand-torii tunnel.
import { natural, waterLevelAt, surfaceAt, colorAt } from './terrain.js';
import { buildSakura } from './build.js';

export default {
  id: 'sakura',
  name: '桜咲く千本鳥居',
  subtitle: 'Sakura Senbon Torii',
  description: '満開の桜の城下町から山道をのぼり、千本鳥居をくぐって山頂の五重塔へ。崖から滝つぼを越えてグライド！',
  laps: 3,
  bgm: 'sakura',
  ambience: 'sakura',
  colors: ['#f7a8c4', '#6aa8e8'],
  track: {
    width: 8,
    wallMargin: 14,
    points: [
      [0, 0.2, 60, 8.5],
      [0, 0.2, -10, 8.5],
      [8, 1.5, -70, 8],
      [45, 4, -105, 7.5, 0.04],
      [115, 8, -112, 7.5],
      [162, 12, -135, 7.5, -0.06],
      [172, 15, -172, 7.5, -0.08],
      [132, 19, -190, 7.5, -0.04],
      [88, 23, -186, 7.5],
      [52, 26, -200, 7.5, 0.06],
      [50, 29, -235, 7.5, 0.08],
      [95, 33, -248, 6.5],
      [148, 37, -258, 6.5, -0.03],
      [176, 41, -290, 6.5, -0.05],
      [158, 44, -325, 7],
      [108, 45, -340, 8],
      [60, 45, -328, 8.5],
      [-45, 27, -232, 9],
      [-85, 13, -168, 8.5],
      [-98, 4.5, -90, 8],
      [-82, 1.8, -12, 8],
      [-72, 0.6, 48, 8],
      [-52, 0.2, 112, 8, -0.06],
      [-14, 0.2, 128, 8.5, -0.05],
    ],
    zones: {
      gaps: [{ from: 16.12, to: 16.78 }],
      ramps: [
        { at: { cp: 16.12, off: -12 }, len: 12, h: 2.4, d0: -8, d1: 8, type: 'glide', launch: 10 },
        { at: 19.55, len: 8, h: 1.4, d0: -3.5, d1: 3.5, type: 'jump', launch: 9 },
      ],
      boosts: [
        { at: 2.3, d: 3.5, len: 5 },
        { at: 7.6, d: 0, len: 5 },
        { at: 11.4, d: 0, len: 5 },
        { at: 21.4, d: -3, len: 5 },
      ],
      items: [{ at: 1.2 }, { at: 8.4 }, { at: 15.3 }, { at: 20.3 }],
      coins: [
        { from: 3.3, to: 3.9, d: 2.5, count: 6 },
        { from: 11.6, to: 12.4, d: 0, count: 8 },
        { from: 17.3, to: 17.9, d: -2, count: 6 },
        { from: 22.1, to: 22.8, d: 3, count: 5 },
        // floating above the waterfall valley
        { from: 16.2, to: 16.72, d: -2, count: 8, h: 6, arc: 3, wave: 3.5 },
      ],
      walls: [
        // switchbacks: stone walls both sides (keeps karts from dropping to the road below)
        { from: 4.4, to: 11.0, side: 'both', offset: 2.5 },
        // thousand torii tunnel: tight walls just inside the pillars
        { from: 11.0, to: 13.95, side: 'both', offset: 0.9 },
        // shrine plateau approach
        { from: 13.95, to: 16.0, side: 'both', offset: 3.0 },
        // town street
        { from: 23.2, to: 25.9, side: 'both', offset: 5.0 },
        { from: 0, to: 2.1, side: 'both', offset: 5.0 },
      ],
    },
  },
  trackStyle: { road: 'stone', roadOpts: { hue: 32, rows: 12, moss: true, seed: 8 }, roadRoughness: 0.88, skirtMat: 'stoneDark', texLen: 14 },
  terrain: { natural, shoulder: 2.0, blend: 9, waterLevelAt, surfaceAt, colorAt },
  terrainMesh: { res: 2, margin: 100, outer: 1800 },
  waterLevelAt,
  surfaceAt,
  shallowWater: 'water',
  killY: -10,
  build: buildSakura,
  introShots: (t) => [
    // fly through the thousand-torii tunnel
    { path: { track: t, s0: t.cpToS(11.1), s1: t.cpToS(12.7), h: 2.6, d: 0, ahead: 14 }, dur: 3.8, fov: 62 },
    // over the waterfall valley toward the pagoda
    { from: [-115, 24, -200], to: [-85, 30, -238], look: [30, 36, -335], lookTo: [110, 50, -362], dur: 3.2, fov: 55 },
  ],
  env: {
    sky: {
      zenith: 0x2a66cc,
      horizon: 0xcfe4fa,
      haze: 0xeef4ff,
      ground: 0x4a5a3a,
      sunDir: [0.42, 0.72, 0.55],
      sunColor: 0xfff3dd,
      sunSize: 0.0006,
      sunGlow: 0.7,
      sunDisk: 12,
      cloudCover: 0.52,
      cloudSoft: 0.2,
      cloudOpacity: 0.85,
      cloudLit: 0xffffff,
      cloudShade: 0xb3c2da,
      gradExp: 0.6,
      billboards: { count: 12, lit: 0xffffff, shade: 0xaebed8, opacity: 0.92, minH: 180, maxH: 420, dist: 2400, minW: 500, maxW: 1000, rimAmt: 0.4 },
    },
    sun: { color: 0xfff1de, intensity: 3.6, shadowFar: 200 },
    hemi: { sky: 0xbcd6ff, ground: 0x6a7a4a, intensity: 1.0 },
    fog: { color: 0xc8dcf0, density: 0.0011, sunColor: 0xfff4e6 },
    envIntensity: 1.0,
    look: { exposure: 1.0, bloomStrength: 0.35, bloomRadius: 0.55, bloomThreshold: 1.0, saturation: 1.12, contrast: 1.04, tint: [1.0, 0.99, 1.0], lift: [0.01, 0.005, 0.015], vignette: 0.32, grain: 0.012 },
  },
};
