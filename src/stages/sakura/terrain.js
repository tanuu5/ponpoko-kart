// Course 2 landscape: castle town, shrine mountain with switchbacks, cliff & waterfall valley, meadow.
import { makeNoise2D, fbm, smoothstep, lerp } from '../../world/noise.js';

const noise = makeNoise2D(4242);
const noise2 = makeNoise2D(99);

export const POND_WATER = 1.2;
export const PLATEAU_Y = 45;
export const CENTER = [40, -120];
export const FUJI_ANGLE = -2.2; // north-west
export const POND = [14, -326];

function hill(x, z, cx, cz, h, r) {
  const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
  return h * Math.exp(-d2 / (2 * r * r));
}

/** Distance from point to segment. */
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Stream from the pond down to the south-west. */
export function streamDist(x, z) {
  return Math.min(
    segDist(x, z, POND[0], POND[1], -60, -230),
    segDist(x, z, -60, -230, -140, -150),
    segDist(x, z, -140, -150, -150, -40),
    segDist(x, z, -150, -40, -135, 60),
  );
}

export function townMask(x, z) {
  return smoothstep(70, 45, Math.abs(x + 5)) * smoothstep(-95, -60, z) * smoothstep(175, 150, z);
}

export function natural(x, z) {
  let h = 0.2 + fbm(noise, x / 90, z / 90, 3) * 1.2;
  // meadow undulation (west)
  h += smoothstep(-40, -120, x) * (2.5 + fbm(noise2, x / 60, z / 60, 3) * 2.5);
  // shrine mountain + neighbours
  h += hill(x, z, 110, -300, 64, 115) + hill(x, z, 175, -380, 46, 90) + hill(x, z, 25, -430, 55, 110) + hill(x, z, 220, -250, 30, 70);
  h += hill(x, z, 185, 70, 10, 30); // castle hill
  // open valley west of the plateau, down to the pond (wide, ~30 degree slopes)
  const vd = segDist(x, z, 25, -312, -70, -236);
  const valley = smoothstep(80, 18, vd) * smoothstep(-480, -330, z);
  h = lerp(h, 1.5 + fbm(noise2, x / 20, z / 20, 2) * 1.5, valley * 0.95);
  // plateau for the shrine grounds (applied after the valley so its edge forms a cliff)
  const pm = smoothstep(84, 56, Math.hypot(x - 118, z - 345));
  h = lerp(h, PLATEAU_Y - 0.3, pm);
  // pond + stream bed
  const sd = streamDist(x, z);
  const pondD = Math.hypot(x - POND[0], z - POND[1]);
  const bed = POND_WATER - 1.6;
  h = lerp(h, Math.min(h, bed), smoothstep(26, 16, pondD));
  h = lerp(h, Math.min(h, POND_WATER - 0.9), smoothstep(7, 3, sd));
  // town stays flat
  h = lerp(h, 0.2, townMask(x, z) * 0.85);
  // distant rim mountains (lower toward Fuji)
  const dx = x - CENTER[0], dz = z - CENTER[1];
  const r = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  const da = Math.abs(((ang - FUJI_ANGLE + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
  const gap = 0.35 + 0.65 * smoothstep(0.1, 0.55, da);
  h += smoothstep(480, 900, r) * (30 + 70 * (0.5 + 0.5 * fbm(noise, x / 250, z / 250, 4))) * gap;
  h += smoothstep(850, 1500, r) * (80 + 200 * (0.5 + 0.5 * fbm(noise2, x / 400, z / 400, 4))) * gap;
  return h;
}

export function waterLevelAt(x, z) {
  const pondD = Math.hypot(x - POND[0], z - POND[1]);
  if (pondD < 30 || streamDist(x, z) < 8) return POND_WATER;
  return -Infinity;
}

export function surfaceAt(x, z, s) {
  if (s.edge < 2.5) return 'dirt';
  return 'grass';
}

export function colorAt(x, z, h, edge, slope) {
  const n = fbm(noise2, x / 12, z / 12, 3);
  const n2 = fbm(noise, x / 60, z / 60, 2);
  // fresh spring grass
  let c = [0.2 + n2 * 0.05, 0.4 + n * 0.07, 0.1];
  // petals carpet tint near the town & plateau
  const pink = Math.max(townMask(x, z) * 0.35, smoothstep(80, 40, Math.hypot(x - 118, z + 345)) * 0.3) * (0.5 + n * 0.8);
  c = [lerp(c[0], 0.75, pink * 0.4), lerp(c[1], 0.52, pink * 0.4), lerp(c[2], 0.55, pink * 0.4)];
  if (h < POND_WATER - 0.2) c = [0.2, 0.22, 0.16];
  if (edge < 2.8) {
    const k = smoothstep(2.8, 0.6, edge);
    c = [lerp(c[0], 0.45, k), lerp(c[1], 0.4, k), lerp(c[2], 0.32, k)];
  }
  // steep slopes: mossy earth with rock outcrops (not a flat grey)
  const sl = smoothstep(0.3, 0.6, slope);
  const rock = smoothstep(0.35, 0.65, fbm(noise, x / 9, z / 9, 3) * 0.5 + 0.5);
  const slopeCol = [lerp(0.2, 0.42, rock), lerp(0.3, 0.4, rock), lerp(0.1, 0.34, rock)];
  c = [lerp(c[0], slopeCol[0], sl), lerp(c[1], slopeCol[1], sl), lerp(c[2], slopeCol[2], sl)];
  const r = Math.hypot(x - CENTER[0], z - CENTER[1]);
  const far = smoothstep(460, 820, r);
  c = [lerp(c[0], 0.1 + n2 * 0.03, far), lerp(c[1], 0.24 + n * 0.04, far), lerp(c[2], 0.12, far)];
  return c;
}
