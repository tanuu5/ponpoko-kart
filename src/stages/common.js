// Shared helpers for course decoration.
import * as THREE from 'three';

/** Deterministic PRNG. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Horizontal yaw that makes a +Z-facing prop face the direction (dx, dz). */
export function yawToward(dx, dz) {
  return Math.atan2(dx, dz);
}

/**
 * Iterate positions along the track at a lateral offset.
 * cb(pos, frame, s) ; side: 1 right, -1 left ; offset measured from the road edge.
 */
export function alongTrack(track, s0, s1, spacing, side, offset, cb) {
  let len = s1 - s0;
  if (len < 0) len += track.length;
  const n = Math.max(1, Math.floor(len / spacing));
  for (let i = 0; i <= n; i++) {
    const s = s0 + (len * i) / n;
    const fr = track.frameAt(s);
    const d = side * (fr.width + offset);
    const pos = fr.pos.clone().addScaledVector(fr.right, d);
    cb(pos, fr, track.wrapS(s), d);
  }
}

/** Minimum distance from (x,z) to the track centerline minus the road half width (edge distance). */
export function edgeDistance(track, x, z) {
  const p = track.project(x, 0, z, -1);
  return Math.abs(p.d) - p.width;
}

/** Collision grid of circles for props (trees, houses, poles). */
export class ColliderGrid {
  constructor(cell = 12) {
    this.cell = cell;
    this.map = new Map();
  }
  add(x, z, r) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push({ x, z, r });
  }
  key(i, j) {
    return i * 73856093 ^ j * 19349663;
  }
  /** Push a circle (x,z,r) out of colliders. Returns {nx, nz, pen} of the deepest hit or null. */
  resolve(pos, r) {
    const ci = Math.floor(pos.x / this.cell), cj = Math.floor(pos.z / this.cell);
    let hit = null;
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const a = this.map.get(this.key(i, j));
        if (!a) continue;
        for (const c of a) {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const rr = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            const pen = rr - d;
            pos.x += (dx / d) * pen;
            pos.z += (dz / d) * pen;
            if (!hit || pen > hit.pen) hit = { nx: dx / d, nz: dz / d, pen };
          }
        }
      }
    }
    return hit;
  }
}

/** Canvas-textured sign board (e.g. corner arrows). */
export function arrowSignTexture(dir = 1) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c12e';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#1c1c1e';
  for (let i = 0; i < 3; i++) {
    const x = 40 + i * 70;
    g.beginPath();
    if (dir > 0) {
      g.moveTo(x, 20); g.lineTo(x + 40, 64); g.lineTo(x, 108); g.lineTo(x + 22, 108); g.lineTo(x + 62, 64); g.lineTo(x + 22, 20);
    } else {
      g.moveTo(x + 62, 20); g.lineTo(x + 22, 64); g.lineTo(x + 62, 108); g.lineTo(x + 40, 108); g.lineTo(x, 64); g.lineTo(x + 40, 20);
    }
    g.closePath();
    g.fill();
  }
  g.strokeStyle = '#1c1c1e';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 120);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Chevron corner sign on two posts. dir: 1 = turn right, -1 = turn left. */
export function createCornerSign(dir = 1) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.08), [
    new THREE.MeshStandardMaterial({ color: 0x333333 }),
    new THREE.MeshStandardMaterial({ color: 0x333333 }),
    new THREE.MeshStandardMaterial({ color: 0x333333 }),
    new THREE.MeshStandardMaterial({ color: 0x333333 }),
    new THREE.MeshStandardMaterial({ map: arrowSignTexture(dir), roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.6 }),
  ]);
  board.position.y = 1.5;
  board.castShadow = true;
  g.add(board);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8a8d91, metalness: 0.7, roughness: 0.4 });
  for (const x of [-0.8, 0.8]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), postMat);
    p.position.set(x, 0.8, -0.06);
    p.castShadow = true;
    g.add(p);
  }
  return g;
}
