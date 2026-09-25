// Course 1 landscape functions: terrain height, water levels, surfaces, colors.
import { makeNoise2D, fbm, smoothstep, lerp } from '../../world/noise.js';

const noise = makeNoise2D(1234);
const noise2 = makeNoise2D(777);

export const RIVER_WATER = -3.0;
export const PADDY_WATER = -0.55;
export const PADDY_FLOOR = -0.85;
export const RAIL_X = 205;
export const RAIL_H = 0.35;
export const CENTER = [150, 0];
// direction (from course center) toward Mt. Fuji / the setting sun
export const FUJI_ANGLE = -2.55;

/** River centerline (runs east-west). */
export const riverZ = (x) => 92 + 8 * Math.sin(x / 70) + 4 * Math.sin(x / 23 + 1.3);

function hill(x, z, cx, cz, h, r) {
  const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
  return h * Math.exp(-d2 / (2 * r * r));
}

/** Dry land mask (villages, farmhouse clusters). */
export function dryMask(x, z) {
  const v = smoothstep(58, 38, Math.abs(x + 18)) * smoothstep(-135, -105, z) * smoothstep(82, 62, z);
  const f = smoothstep(46, 30, Math.hypot(x - 150, z + 208));
  const s = smoothstep(50, 32, Math.hypot(x - 95, z - 232));
  const w = smoothstep(40, 26, Math.hypot(x + 70, z + 180));
  return Math.max(v, f, s, w);
}

export const TUNNEL_Z = 560;

export function railMask(x, z) {
  if (Math.abs(z) > TUNNEL_Z) return 0;
  const inRiver = Math.abs(z - riverZ(x)) < 20;
  if (inRiver) return 0;
  // wider, sloped cutting where the line approaches the tunnel hills
  const cut = smoothstep(TUNNEL_Z - 160, TUNNEL_Z - 20, Math.abs(z));
  return smoothstep(7 + cut * 16, 3.2 + cut * 3, Math.abs(x - RAIL_X));
}

export function natural(x, z) {
  let h = PADDY_FLOOR;
  h = lerp(h, 0.25 + fbm(noise, x / 60, z / 60, 2) * 0.3, dryMask(x, z));
  // the big hill in the south-east + smaller bumps
  h += hill(x, z, 300, 5, 17, 58) + hill(x, z, 350, 60, 12, 45) + hill(x, z, 250, -10, 5, 30);
  h += hill(x, z, -60, -230, 9, 40) + hill(x, z, 60, 290, 7, 45);
  // tunnel hills where the railway leaves the valley
  h += hill(x, z, RAIL_X, -TUNNEL_Z - 70, 40, 75) + hill(x, z, RAIL_X, TUNNEL_Z + 70, 40, 75);
  // surrounding hills, lower toward Mt. Fuji
  const dx = x - CENTER[0], dz = z - CENTER[1];
  const r = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  let da = Math.abs(((ang - FUJI_ANGLE + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
  const gap = 0.3 + 0.7 * smoothstep(0.15, 0.6, da);
  const f1 = 0.5 + 0.5 * fbm(noise, x / 260, z / 260, 4);
  h += smoothstep(430, 850, r) * (18 + 55 * f1) * gap;
  h += smoothstep(800, 1500, r) * (60 + 190 * (0.5 + 0.5 * fbm(noise2, x / 420, z / 420, 4))) * gap;
  h += smoothstep(330, 560, r) * (fbm(noise2, x / 90, z / 90, 3) * 5 + 2.5);
  // railway embankment / cutting
  const rm = railMask(x, z);
  if (rm > 0) h = lerp(h, RAIL_H, rm);
  // river valley
  const dzr = Math.abs(z - riverZ(x));
  const bed = RIVER_WATER - 1.6 + fbm(noise2, x / 30, z / 30, 2) * 0.4;
  const bank = smoothstep(11, 26, dzr);
  h = lerp(Math.min(bed, h), h, bank);
  return h;
}

export function waterLevelAt(x, z) {
  if (Math.abs(z - riverZ(x)) < 24) return RIVER_WATER;
  return PADDY_WATER;
}

export function surfaceAt(x, z, s) {
  if (s.edge < 3.0) return 'dirt';
  return 'grass';
}

export function colorAt(x, z, h, edge, slope) {
  const n = fbm(noise2, x / 14, z / 14, 3);
  const n2 = fbm(noise, x / 70, z / 70, 2);
  let c = [0.2 + n2 * 0.05, 0.33 + n * 0.06, 0.1];
  if (h < PADDY_WATER - 0.1) c = [0.16, 0.14, 0.09];
  if (h < RIVER_WATER + 0.3) c = [0.13, 0.12, 0.1];
  const dm = dryMask(x, z);
  if (dm > 0.3) c = [lerp(c[0], 0.28 + n * 0.05, dm * 0.5), lerp(c[1], 0.34, dm * 0.3), lerp(c[2], 0.13, dm * 0.5)];
  const rm = railMask(x, z);
  if (rm > 0.5) c = [0.36, 0.33, 0.3];
  if (edge < 3.2) {
    const k = smoothstep(3.2, 0.8, edge);
    c = [lerp(c[0], 0.4, k), lerp(c[1], 0.33, k), lerp(c[2], 0.22, k)];
  }
  const sl = smoothstep(0.08, 0.35, slope);
  c = [lerp(c[0], 0.24, sl * 0.5), lerp(c[1], 0.25, sl * 0.5), lerp(c[2], 0.13, sl * 0.5)];
  const r = Math.hypot(x - CENTER[0], z - CENTER[1]);
  const far = smoothstep(420, 800, r);
  c = [lerp(c[0], 0.07 + n2 * 0.03, far), lerp(c[1], 0.16 + n * 0.04, far), lerp(c[2], 0.08, far)];
  return c;
}

/** Is (x,z) inside a flooded paddy (for rice planting / ridges)? */
export function isPaddy(x, z) {
  if (dryMask(x, z) > 0.05) return false;
  if (Math.abs(z - riverZ(x)) < 30) return false;
  if (railMask(x, z) > 0.02) return false;
  return natural(x, z) < PADDY_WATER - 0.12;
}
