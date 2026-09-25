// Course 3 landscape: a river through an old onsen town, festival bank, hill for the glide.
import { makeNoise2D, fbm, smoothstep, lerp } from '../../world/noise.js';

const noise = makeNoise2D(5151);
const noise2 = makeNoise2D(313);

export const RIVER_WATER = -2.2;
export const CENTER = [30, 10];
export const riverZ = (x) => 4 * Math.sin(x / 90) + 2 * Math.sin(x / 31 + 0.7);

function hill(x, z, cx, cz, h, r) {
  const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
  return h * Math.exp(-d2 / (2 * r * r));
}

export function natural(x, z) {
  let h = 0.8 + fbm(noise, x / 80, z / 80, 3) * 0.4;
  // glide hill (south-west) and wooded hills around
  // gentle glide hill that stays below the road (the road rides its crest), bigger hills further out
  h += hill(x, z, -134, 76, 7, 26) + hill(x, z, -260, 200, 30, 70);
  h += hill(x, z, 250, -170, 30, 80) + hill(x, z, 60, -230, 26, 90) + hill(x, z, -60, 220, 30, 90);
  // keep the festival quarter (north bank) and the onsen street (south bank) flat
  const north = smoothstep(-175, -135, x) * smoothstep(250, 215, x) * smoothstep(-150, -115, z) * smoothstep(-8, -25, z);
  const south = smoothstep(-100, -60, x) * smoothstep(250, 220, x) * smoothstep(20, 35, z) * smoothstep(130, 110, z);
  h = lerp(h, 0.8 + fbm(noise, x / 50, z / 50, 2) * 0.2, Math.max(north, south));
  // river channel
  const dz = Math.abs(z - riverZ(x));
  const bed = RIVER_WATER - 1.8;
  h = lerp(bed, h, smoothstep(12, 22, dz));
  // hills ring
  const r = Math.hypot(x - CENTER[0], z - CENTER[1]);
  h += smoothstep(380, 800, r) * (40 + 90 * (0.5 + 0.5 * fbm(noise2, x / 260, z / 260, 4)));
  h += smoothstep(800, 1500, r) * (90 + 200 * (0.5 + 0.5 * fbm(noise, x / 420, z / 420, 4)));
  return h;
}

export function waterLevelAt(x, z) {
  if (Math.abs(z - riverZ(x)) < 22) return RIVER_WATER;
  return -Infinity;
}

export function surfaceAt(x, z, s) {
  if (s.edge < 2.5) return 'dirt';
  return 'grass';
}

export function colorAt(x, z, h, edge, slope) {
  const n = fbm(noise2, x / 12, z / 12, 3);
  const n2 = fbm(noise, x / 60, z / 60, 2);
  let c = [0.13 + n2 * 0.04, 0.22 + n * 0.05, 0.08];
  if (h < RIVER_WATER + 0.4) c = [0.12, 0.12, 0.1];
  if (edge < 3) {
    const k = smoothstep(3, 0.5, edge);
    c = [lerp(c[0], 0.36, k), lerp(c[1], 0.32, k), lerp(c[2], 0.27, k)];
  }
  // river banks: stone embankment tint
  const dz = Math.abs(z - riverZ(x));
  const bank = smoothstep(24, 16, dz) * smoothstep(8, 13, dz);
  c = [lerp(c[0], 0.24, bank), lerp(c[1], 0.23, bank), lerp(c[2], 0.22, bank)];
  const sl = smoothstep(0.25, 0.55, slope);
  c = [lerp(c[0], 0.3, sl), lerp(c[1], 0.29, sl), lerp(c[2], 0.26, sl)];
  const r = Math.hypot(x - CENTER[0], z - CENTER[1]);
  const far = smoothstep(380, 700, r);
  c = [lerp(c[0], 0.07, far), lerp(c[1], 0.12, far), lerp(c[2], 0.07, far)];
  return c;
}
