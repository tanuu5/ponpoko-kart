// Trees for the shrine set: 桜 (Somei-Yoshino), しだれ桜, 松 (niwaki black pine), 御神木 (sacred camphor).
import * as THREE from 'three';
import { getMat } from './materials.js';
import { rng } from './util.js';
import { Builder, T, tube, blob, foliageShade, tuftCards, twistedRope, shide, mergeParts, sstep, PI, TAU, lerp, clamp, V3, range, vnoise } from './shrine-geo.js';
import { SM } from './shrine-tex.js';

const col = (hex) => new THREE.Color(hex);

/** Point on a CatmullRom through pts at t (0..1). */
function curveOf(pts) {
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

/** Branch helper: builds a tapered, slightly lumpy tube. Returns the curve. */
function branch(b, m, pts, r0, r1, { segs = 8, radial = 8, lumpy = 0.06, seed = 1, capEnd = true, flare = 0 } = {}) {
  const c = curveOf(pts);
  b.add(tube(c, {
    segs, radial, capEnd, uvU: Math.max(1, Math.round(r0 * TAU / 0.5)), uvV: 1.0,
    radius: (t, th) => {
      let r = lerp(r0, r1, Math.pow(t, 0.85));
      if (flare) r *= 1 + flare * Math.pow(1 - sstep(0, 0.2, t), 2);
      return r * (1 + lumpy * vnoise(Math.cos(th) * 2 + seed, t * 6, Math.sin(th) * 2, seed));
    },
    computeNormals: lumpy > 0 || flare > 0,
  }), m);
  return c;
}

/** Fibonacci directions on the unit sphere. */
function fibDirs(n, seedOff = 0) {
  const out = [];
  const ga = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = ga * i + seedOff;
    out.push(V3(Math.cos(th) * rr, y, Math.sin(th) * rr));
  }
  return out;
}

/** Irregular petal-carpet disc (alpha-tested fallen petals), vertex alpha fades at the rim. */
function petalCarpet(b, cx, cz, R, seed) {
  const segs = 44;
  const rings = [0, 0.45, 0.66, 0.82, 1.0];
  const alphas = [1, 1, 0.97, 0.66, 0.2];
  const pos = [], colr = [], uv = [], idx = [];
  const r = rng(seed * 17 + 5);
  const wob = [];
  for (let i = 0; i < segs; i++) wob.push(1 + 0.16 * vnoise(Math.cos((i / segs) * TAU) * 1.6, Math.sin((i / segs) * TAU) * 1.6, 0.5, seed) + (r() - 0.5) * 0.06);
  pos.push(cx, 0.03, cz);
  colr.push(1, 1, 1, 1);
  uv.push(cx, cz);
  for (let k = 1; k < rings.length; k++) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      const rr = R * rings[k] * (k > 1 ? wob[i] : 1);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      pos.push(x, 0.03, z);
      const al = clamp(alphas[k] + (k >= 3 ? (r() - 0.5) * 0.25 : 0), 0, 1);
      colr.push(1, 1, 1, al);
      uv.push(x, z);
    }
  }
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let k = 1; k < rings.length - 1; k++) {
    const a0 = 1 + (k - 1) * segs, a1 = 1 + k * segs;
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % segs;
      idx.push(a0 + i, a0 + i1, a1 + i1, a0 + i, a1 + i1, a1 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // winding: make normals face up
  const ia = g.index.array;
  const p = g.attributes.position;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  A.fromBufferAttribute(p, ia[0]); B.fromBufferAttribute(p, ia[1]); C.fromBufferAttribute(p, ia[2]);
  if (B.sub(A).cross(C.sub(A)).y < 0) for (let q = 0; q < ia.length; q += 3) { const t = ia[q + 1]; ia[q + 1] = ia[q + 2]; ia[q + 2] = t; }
  b.add(g, SM.petals(), { cast: false, receive: true });
}

// ---------------------------------------------------------------------------
// 6. 桜 Somei-Yoshino in full bloom
// ---------------------------------------------------------------------------
/**
 * createSakuraTree({seed, size}) — ≈8 m tall, ≈10 m wide at size=1.
 * Layered blossom masses along wide-spreading limbs (dark branches visible between tiers),
 * fluffy flower tufts on the silhouette, and a fallen-petal carpet disc.
 */
export function createSakuraTree(opts = {}) {
  const { seed = 1, size = 1 } = opts;
  const s = size;
  const r = rng(seed * 101 + 7);
  const b = new Builder();
  const bark = SM.sakuraBark();
  const bloom = SM.blossom();
  // shaded underside (deeper pink) -> sunlit top (pale pink)
  const gLow = col(0xf0a3bd), gHigh = col(0xfcdce6);

  // --- trunk
  const la = r() * TAU;
  const lean = range(r, 0.2, 0.45) * s;
  const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
  const trunkH = range(r, 2.1, 2.5) * s;
  const top = V3(lx, trunkH, lz);
  const trunkPts = [V3(0, -0.1, 0), V3(lx * 0.12 + 0.07 * s, 0.75 * s, lz * 0.12), V3(lx * 0.55, 1.5 * s, lz * 0.55 - 0.07 * s), top];
  branch(b, bark, trunkPts, 0.4 * s, 0.3 * s, { segs: 10, radial: 12, lumpy: 0.1, seed, capEnd: false, flare: 0.5 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + r() * 0.6;
    const d = V3(Math.cos(a), 0, Math.sin(a));
    const len = range(r, 0.8, 1.3) * s;
    branch(b, bark, [V3(0, 0.4 * s, 0).addScaledVector(d, 0.14 * s), V3(0, 0.1 * s, 0).addScaledVector(d, 0.52 * s), V3(0, -0.06, 0).addScaledVector(d, len)], 0.17 * s, 0.04 * s, { segs: 4, radial: 6, lumpy: 0, capEnd: false });
  }

  // --- limbs spreading like an umbrella; blossom masses sit along the outer branches
  const masses = []; // {p, r, az}
  const nL = 6;
  const a0 = r() * TAU;
  for (let i = 0; i < nL; i++) {
    const az = a0 + (i / nL) * TAU + (r() - 0.5) * 0.45;
    const out = V3(Math.cos(az), 0, Math.sin(az));
    const perp = V3(-out.z, 0, out.x);
    const k = range(r, 0.85, 1.1);
    const p0 = top.clone().add(V3(0, -0.25 * s, 0)).addScaledVector(out, 0.1 * s);
    const p1 = p0.clone().addScaledVector(out, 0.95 * s * k).add(V3(0, 1.55 * s, 0)).addScaledVector(perp, (r() - 0.5) * 0.4 * s);
    const p2 = p1.clone().addScaledVector(out, 1.2 * s * k).add(V3(0, range(r, 0.8, 1.25) * s, 0)).addScaledVector(perp, (r() - 0.5) * 0.6 * s);
    const p3 = p2.clone().addScaledVector(out, 1.3 * s * k).add(V3(0, range(r, -0.1, 0.35) * s, 0));
    const c = branch(b, bark, [p0, p1, p2, p3], 0.19 * s, 0.05 * s, { segs: 9, radial: 8, lumpy: 0.07, seed: seed + i });
    for (const t of [0.72, 1.0]) masses.push({ p: c.getPointAt(t).add(V3(0, 0.25 * s, 0)), r: range(r, 1.05, 1.3) * s, az });
    // sub-branches
    const nS = 2 + (r() < 0.5 ? 1 : 0);
    for (let j = 0; j < nS; j++) {
      const t0 = range(r, 0.35, 0.7);
      const sp = c.getPointAt(t0);
      const az2 = az + (j % 2 ? 1 : -1) * range(r, 0.5, 0.95);
      const out2 = V3(Math.cos(az2), 0, Math.sin(az2));
      const len = range(r, 1.5, 2.3) * s;
      const rise = range(r, 0.7, 1.7) * s;
      const q1 = sp.clone().addScaledVector(out2, len * 0.5).add(V3(0, rise * 0.7, 0));
      const q2 = sp.clone().addScaledVector(out2, len).add(V3(0, rise, 0));
      const c2 = branch(b, bark, [sp, q1, q2], 0.085 * s, 0.025 * s, { segs: 5, radial: 6, lumpy: 0, seed: seed + i * 7 + j });
      masses.push({ p: c2.getPointAt(1).add(V3(0, 0.22 * s, 0)), r: range(r, 0.95, 1.2) * s, az: az2 });
      if (r() < 0.6) masses.push({ p: c2.getPointAt(0.55).add(V3(0, 0.3 * s, 0)), r: range(r, 0.8, 1.0) * s, az: az2 });
      // dark twig tips peeking out of the masses
      if (r() < 0.5) {
        const tw = c2.getPointAt(1);
        const twDir = out2.clone().add(V3(0, range(r, 0.1, 0.6), 0)).normalize();
        branch(b, bark, [tw, tw.clone().addScaledVector(twDir, 0.6 * s), tw.clone().addScaledVector(twDir, 1.1 * s).add(V3(0, 0.12 * s, 0))], 0.03 * s, 0.01 * s, { segs: 3, radial: 4, lumpy: 0 });
      }
    }
  }
  // crown masses to round off the top
  const C = V3(lx, 0, lz);
  let yTop = 0;
  masses.forEach((m) => { yTop = Math.max(yTop, m.p.y); });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + r();
    const d = k === 0 ? 0 : range(r, 0.8, 2.4) * s;
    masses.push({ p: V3(C.x + Math.cos(a) * d, yTop + (k === 0 ? 0.8 : range(r, 0.0, 0.55)) * s, C.z + Math.sin(a) * d), r: range(r, 1.1, 1.35) * s, az: a });
  }
  // canopy volume for soft shading
  let cy = 0;
  masses.forEach((m) => { cy += m.p.y; });
  cy /= masses.length;
  C.y = cy;
  let rx = 0;
  masses.forEach((m) => { rx = Math.max(rx, Math.hypot(m.p.x - C.x, m.p.z - C.z) + m.r); });
  const ry = (yTop - cy) + 1.4 * s;
  const shade = {
    center: C, radii: V3(rx, ry, rx), grad: [gLow, gHigh], gradNoise: 0.35,
    yMin: cy - ry * 1.3, yMax: cy + ry, aoLow: 0.74, aoHigh: 1.03, downDark: 0.14, varAmt: 0.05,
  };
  const clumps = [];
  masses.forEach((m, i) => {
    const g = blob(seed * 1000 + i, { r: m.r, detail: 1, sx: 1.3, sy: 0.66, sz: 1.0, amp: 0.13, freq: 1.3, flatBottom: -0.55, flatK: 0.7 });
    T(g, null, [0, -m.az, 0]);
    g.translate(m.p.x, m.p.y, m.p.z);
    b.add(foliageShade(g, { ...shade, blend: 0.55, uvSize: 0.6, seed: seed + i, mul: range(r, 0.97, 1.03) }), bloom);
    clumps.push({ p: m.p, r: m.r * 1.05, sy: 0.62 });
  });
  // fluffy flower tufts on the silhouette
  b.add(tuftCards(clumps, { ...shade, rand: r, count: 4, size: [0.44, 0.7], sizeScale: s, embed: 0.42, minOut: 0.0, seed }), SM.tuft('blossom'), { cast: true });

  // --- fallen petals
  petalCarpet(b, C.x * 0.8, C.z * 0.8, 4.8 * s, seed);

  const grp = b.build();
  grp.name = 'sakuraTree';
  grp.userData.collider = { type: 'circle', r: 0.45 * s };
  return grp;
}

// ---------------------------------------------------------------------------
// 7. しだれ桜 weeping cherry
// ---------------------------------------------------------------------------
export function createWeepingSakura(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 57 + 11);
  const b = new Builder();
  const bark = SM.sakuraBark();
  const bloom = SM.blossom();
  const strandM = SM.weep();
  // trunk: short, thick and gnarled
  const tH = 2.6;
  const top = V3(range(r, -0.3, 0.3), tH, range(r, -0.3, 0.3));
  branch(b, bark, [V3(0, -0.1, 0), V3(0.12, 0.9, -0.05), V3(top.x * 0.6, 1.8, top.z * 0.6), top], 0.42, 0.3, { segs: 10, radial: 12, lumpy: 0.14, seed, capEnd: false, flare: 0.5 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + r();
    const d = V3(Math.cos(a), 0, Math.sin(a));
    branch(b, bark, [V3(0, 0.4, 0).addScaledVector(d, 0.15), V3(0, 0.1, 0).addScaledVector(d, 0.55), V3(0, -0.06, 0).addScaledVector(d, 1.1)], 0.17, 0.04, { segs: 4, radial: 6, lumpy: 0, capEnd: false });
  }
  // arching main limbs
  const C = V3(top.x * 0.5, 6.7, top.z * 0.5);
  const crownTips = [];
  const nL = 5;
  const a0 = r() * TAU;
  for (let i = 0; i < nL; i++) {
    const az = a0 + (i / nL) * TAU + (r() - 0.5) * 0.4;
    const out = V3(Math.cos(az), 0, Math.sin(az));
    const p0 = top.clone().add(V3(0, -0.2, 0));
    const p1 = p0.clone().addScaledVector(out, 0.7).add(V3(0, 1.9, 0));
    const p2 = p0.clone().addScaledVector(out, 1.6).add(V3(0, 3.9, 0));
    const p3 = p0.clone().addScaledVector(out, 2.5).add(V3(0, 4.5 + r() * 0.3, 0));
    const p4 = p0.clone().addScaledVector(out, 3.1).add(V3(0, 4.15 + r() * 0.2, 0));
    const c = branch(b, bark, [p0, p1, p2, p3, p4], 0.2, 0.05, { segs: 10, radial: 7, lumpy: 0.08, seed: seed + i });
    for (const t of [0.6, 0.8]) crownTips.push(c.getPointAt(t));
  }
  // crown filler volume (small dome of clumps under the arching strands)
  const gLow = col(0xec9ab4), gHigh = col(0xfad3de);
  const radii = V3(3.6, 1.6, 3.6);
  const clumps = crownTips.map((p) => ({ p: p.clone().add(V3(0, 0.1, 0)), r: range(r, 0.7, 0.9) }));
  for (const d of fibDirs(30, r() * 7)) {
    if (d.y < 0.15) continue;
    const p = V3(C.x + d.x * 2.4, C.y + 0.2 + d.y * 1.0, C.z + d.z * 2.4);
    const rad = range(r, 0.75, 0.95);
    let ok = true;
    for (const q of clumps) if (q.p.distanceTo(p) < (q.r + rad) * 0.65) { ok = false; break; }
    if (ok) clumps.push({ p, r: rad });
  }
  const shadeW = { center: C, radii, grad: [gLow, gHigh], yMin: C.y - 2, yMax: C.y + 1.6, aoLow: 0.72, downDark: 0.1 };
  clumps.forEach((q, i) => {
    const g = blob(seed * 500 + i, { r: q.r, detail: 1, sx: 1.15, sy: 0.75, sz: 1.15, amp: 0.1, freq: 1.2 });
    g.translate(q.p.x, q.p.y, q.p.z);
    b.add(foliageShade(g, { ...shadeW, blend: 0.8, uvSize: 0.55, seed: seed + i }), bloom);
  });
  b.add(tuftCards(clumps, { ...shadeW, aoLow: 0.75, rand: r, count: 2, size: [0.7, 1.0], seed }), SM.tuft('blossom'));
  // cascading strands: each arches outward over the crown, then falls like a fountain
  const nStr = 96;
  const parts = [];
  const up = V3(0, 1, 0);
  for (let i = 0; i < nStr; i++) {
    const a = (i / nStr) * TAU * 7.0 + r() * 0.5;
    const rho0 = 0.5 + Math.sqrt(r()) * 2.4;
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const tangent = V3(-out.z, 0, out.x);
    const y0 = C.y + 0.95 - Math.pow(rho0 / 3.0, 2) * 0.9;
    const reach = 0.5 + rho0 * 0.3 + range(r, 0.3, 0.8);
    const outer = clamp((rho0 + reach) / 4.3, 0, 1);
    const endY = lerp(3.2, 0.35, outer) + range(r, -0.25, 0.35);
    const ta = 0.3;
    const segs = 10;
    const pts = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const ua = Math.min(t / ta, 1);
      const hdisp = reach * Math.sin(ua * PI * 0.5) + (t > ta ? 0.25 * reach * ((t - ta) / (1 - ta)) : 0);
      const yArch = y0 + 0.28 * Math.sin(ua * PI);
      const y = t <= ta ? yArch : y0 - (y0 - endY) * Math.pow((t - ta) / (1 - ta), 1.15);
      pts.push(V3(C.x, y, C.z).addScaledVector(out, rho0 + hdisp + 0.05 * Math.sin(t * 7 + i)));
    }
    const w0 = range(r, 0.5, 0.62), w1 = w0 * 0.5;
    for (const cross of [0, 1]) {
      const pos = [], uv = [], idx = [], nor = [];
      let vlen = i * 0.37;
      for (let k = 0; k <= segs; k++) {
        const p = pts[k];
        const dir = pts[Math.min(k + 1, segs)].clone().sub(pts[Math.max(k - 1, 0)]).normalize();
        const lat = cross ? new THREE.Vector3().crossVectors(dir, tangent).normalize() : tangent;
        const w = lerp(w0, w1, k / segs) * 0.5;
        pos.push(p.x - lat.x * w, p.y - lat.y * w, p.z - lat.z * w, p.x + lat.x * w, p.y + lat.y * w, p.z + lat.z * w);
        if (k > 0) vlen += p.distanceTo(pts[k - 1]) / 2.4;
        uv.push(0, -vlen, 1, -vlen);
        const t = k / segs;
        const n = out.clone().multiplyScalar(0.8).addScaledVector(up, 0.95 - 0.45 * t).normalize();
        nor.push(n.x, n.y, n.z, n.x, n.y, n.z);
      }
      for (let k = 0; k < segs; k++) {
        const q = k * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setIndex(idx);
      parts.push(g);
    }
  }
  b.add(mergeParts(parts), strandM, { cast: true });
  petalCarpet(b, C.x * 0.5, C.z * 0.5, 4.8, seed + 3);
  const grp = b.build();
  grp.name = 'weepingSakura';
  grp.userData.collider = { type: 'circle', r: 0.5 };
  return grp;
}

// ---------------------------------------------------------------------------
// 8. 松 Japanese black pine (niwaki cloud pruning)
// ---------------------------------------------------------------------------
export function createPine(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 31 + 3);
  const b = new Builder();
  const bark = SM.pineBark();
  const needle = SM.pineNeedle();
  const rot = r() * TAU;
  const R = (v) => v.applyAxisAngle(V3(0, 1, 0), rot);
  // twisted leaning S trunk
  const tp = [V3(0, -0.1, 0), V3(0.3, 1.2, 0.05), V3(1.0, 2.4, 0.2), V3(1.15, 3.6, 0.0), V3(0.65, 4.8, -0.15), V3(0.25, 5.8, -0.05), V3(0.3, 6.5, 0)].map(R);
  const trunk = branch(b, bark, tp, 0.4, 0.1, { segs: 16, radial: 11, lumpy: 0.12, seed, capEnd: true, flare: 0.45 });
  const pads = [];
  const hts = [0.34, 0.46, 0.57, 0.67, 0.77, 0.86];
  let az = r() * TAU;
  hts.forEach((t, i) => {
    az += 2.4 + (r() - 0.5) * 0.5;
    const p0 = trunk.getPointAt(t);
    const out = V3(Math.cos(az), 0, Math.sin(az));
    const L = range(r, 1.3, 2.1) * (1 - t * 0.3);
    const p1 = p0.clone().addScaledVector(out, L * 0.45).add(V3(0, -0.18, 0));
    const p2 = p0.clone().addScaledVector(out, L).add(V3(0, 0.12, 0));
    branch(b, bark, [p0, p1, p2], 0.12 * (1 - t * 0.5), 0.04, { segs: 5, radial: 6, lumpy: 0.06, seed: seed + i });
    pads.push({ p: p2.clone().add(V3(0, 0.18, 0)), R: range(r, 0.95, 1.3) * (1 - t * 0.25) });
  });
  pads.push({ p: trunk.getPointAt(1).add(V3(0, 0.12, 0)), R: 1.15 });
  const dark = col(0x24452a), light = col(0x5a8a45);
  pads.forEach((pd, i) => {
    const n = 6;
    const shade = {
      center: pd.p.clone().add(V3(0, -0.2, 0)), radii: V3(pd.R * 1.25, 0.55, pd.R * 1.25), grad: [dark, light], gradNoise: 0.15,
      yMin: pd.p.y - 0.4, yMax: pd.p.y + 0.45, aoLow: 0.62, aoHigh: 1.05, downDark: 0.3,
    };
    for (let k = 0; k < n; k++) {
      const a = (k / (n - 1)) * TAU + r();
      const d = k === 0 ? 0 : range(r, 0.4, 0.62) * pd.R;
      const c = pd.p.clone().add(V3(Math.cos(a) * d, k === 0 ? 0.14 : (r() - 0.5) * 0.08, Math.sin(a) * d));
      const rad = (k === 0 ? 0.62 : range(r, 0.42, 0.55)) * pd.R;
      const g = blob(seed * 300 + i * 20 + k, { r: rad, detail: 1, sx: 1.2, sy: 0.62, sz: 1.2, amp: 0.14, freq: 1.6, flatBottom: -0.3, flatK: 0.35 });
      g.translate(c.x, c.y, c.z);
      b.add(foliageShade(g, { ...shade, blend: 0.55, uvSize: 0.5, seed: seed + i * 9 + k }), needle);
    }
  });
  const g = b.build();
  g.name = 'pine';
  g.userData.collider = { type: 'circle', r: 0.45 };
  return g;
}

// ---------------------------------------------------------------------------
// 16. 御神木 sacred camphor tree with shimenawa
// ---------------------------------------------------------------------------
export function createGoshinboku(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 71 + 5);
  const b = new Builder();
  const bark = SM.camphorBark();
  const leaf = SM.camphorLeaf();
  // massive buttressed trunk
  const phase = r() * TAU;
  const trunkPts = [V3(0, -0.2, 0), V3(0.1, 1.8, 0.05), V3(-0.1, 3.6, 0.15), V3(0.15, 5.6, 0)];
  const trunkC = curveOf(trunkPts);
  const rBase = 1.3;
  const trunkR = (t, th) => {
    const flare = Math.pow(1 - sstep(0, 0.42, t), 2.2);
    const butt = Math.pow(Math.max(0, Math.cos(6 * th + phase + t * 1.5)), 3);
    const base = lerp(rBase, rBase * 0.72, t) * (1 + 0.55 * flare);
    return base * (1 + (0.28 * flare + 0.05) * butt + 0.05 * vnoise(Math.cos(th) * 2, t * 8, Math.sin(th) * 2, seed));
  };
  b.add(tube(trunkC, { segs: 14, radial: 20, uvU: 5, uvV: 1.2, capEnd: false, computeNormals: true, radius: trunkR }), bark);
  // big limbs, sweeping up and out with a bend
  const tips = [];
  const nL = 5;
  for (let i = 0; i < nL; i++) {
    const az = phase + (i / nL) * TAU + (r() - 0.5) * 0.5;
    const out = V3(Math.cos(az), 0, Math.sin(az));
    const perp = V3(-out.z, 0, out.x);
    const p0 = trunkC.getPointAt(range(r, 0.78, 0.94));
    const p1 = p0.clone().addScaledVector(out, 1.5).add(V3(0, 1.9, 0)).addScaledVector(perp, (r() - 0.5) * 0.8);
    const p2 = p0.clone().addScaledVector(out, 3.4).add(V3(0, 3.2, 0)).addScaledVector(perp, (r() - 0.5) * 1.2);
    const p3 = p0.clone().addScaledVector(out, 5.4).add(V3(0, 4.0 + r() * 0.8, 0));
    const c = branch(b, bark, [p0, p1, p2, p3], 0.62, 0.16, { segs: 10, radial: 10, lumpy: 0.1, seed: seed + i });
    tips.push(p3);
    for (let k = 0; k < 2; k++) {
      const sp = c.getPointAt(range(r, 0.4, 0.7));
      const pp = perp.clone().multiplyScalar(k ? 1 : -1);
      const d = out.clone().multiplyScalar(0.55).add(pp).add(V3(0, 0.75, 0)).normalize();
      const q2 = sp.clone().addScaledVector(d, 3.4);
      branch(b, bark, [sp, sp.clone().addScaledVector(d, 1.7).add(V3(0, 0.25, 0)), q2], 0.22, 0.07, { segs: 5, radial: 7, lumpy: 0.05 });
      tips.push(q2);
    }
  }
  // canopy: many medium clumps, dark glossy green with fresh spring highlights
  const C = V3(0, 11.3, 0);
  const radii = V3(8.2, 4.4, 8.2);
  const clumps = tips.map((p) => ({ p: p.clone().add(V3(0, 0.5, 0)), r: range(r, 1.6, 2.0) }));
  for (const d of fibDirs(90, r() * 5)) {
    if (d.y < -0.45) continue;
    const k = range(r, 0.8, 0.97);
    const p = V3(C.x + d.x * 7.0 * k, C.y + d.y * 3.9 * k, C.z + d.z * 7.0 * k);
    const rad = range(r, 1.45, 1.95);
    let ok = true;
    for (const q of clumps) if (q.p.distanceTo(p) < (q.r + rad) * 0.6) { ok = false; break; }
    if (ok) clumps.push({ p, r: rad });
    if (clumps.length >= 54) break;
  }
  const shade = {
    center: C, radii, grad: [col(0x335a2c), col(0x6f9844)], gradNoise: 0.35, tint2: null,
    yMin: C.y - 5.5, yMax: C.y + 4.6, aoLow: 0.6, aoHigh: 1.05, downDark: 0.25,
  };
  clumps.forEach((q, i) => {
    const g = blob(seed * 900 + i, { r: q.r, detail: 1, sx: 1.12, sy: 0.85, sz: 1.12, amp: 0.12, freq: 1.3, flatBottom: -0.5, flatK: 0.5 });
    g.translate(q.p.x, q.p.y, q.p.z);
    b.add(foliageShade(g, { ...shade, blend: 0.6, uvSize: 0.9, seed: seed + i, mul: range(r, 0.95, 1.05) }), leaf);
  });
  b.add(tuftCards(clumps.map((q) => ({ p: q.p, r: q.r * 1.05, sy: 0.85 })), { ...shade, rand: r, count: 2, size: [1.0, 1.4], embed: 0.45, minOut: 0.1 }), SM.tuft('leaf'));
  // shimenawa around the trunk + shide
  const yR = 2.3;
  const tR = yR / 5.8;
  let ringR = 0;
  for (let k = 0; k < 64; k++) ringR = Math.max(ringR, trunkR(tR, (k / 64) * TAU));
  ringR += 0.12;
  const c0 = trunkC.getPointAt(tR);
  const ring = [];
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * TAU;
    ring.push(V3(c0.x + Math.sin(a) * ringR, yR + 0.1 * Math.cos(a), c0.z + Math.cos(a) * ringR));
  }
  const rope = getMat('rope');
  b.add(twistedRope(ring, { radius: 0.2, strands: 3, twist: 1.1, segs: 32, radial: 5, closed: true, uvV: 0.6, strandScale: 0.58, off: 0.45 }), rope);
  const sm = SM.shide();
  for (let k = 0; k < 5; k++) {
    const a = (k - 2) * 0.38;
    const g = shide(0.8, 0.13, 0.008);
    T(g, [c0.x + Math.sin(a) * (ringR + 0.16), yR - 0.05, c0.z + Math.cos(a) * (ringR + 0.16)], [0, a, 0]);
    b.add(g, sm, { cast: false });
  }
  // rope knot in front with hanging straw ends
  b.add(blob(seed + 99, { r: 0.26, detail: 1, sx: 1.4, sy: 1, sz: 0.8, amp: 0.1 }), rope, { pos: [c0.x, yR + 0.1, c0.z + ringR + 0.08] });
  for (const dx of [-0.14, 0.14]) {
    b.add(tube([V3(c0.x + dx, yR, c0.z + ringR + 0.12), V3(c0.x + dx * 1.3, yR - 0.35, c0.z + ringR + 0.16), V3(c0.x + dx * 1.5, yR - 0.75, c0.z + ringR + 0.14)], { segs: 4, radial: 6, radius: (t) => 0.08 * (1 - t * 0.5), capEnd: true }), rope, { cast: false });
  }
  const g = b.build();
  g.name = 'goshinboku';
  g.userData.collider = { type: 'circle', r: 2.1 };
  return g;
}
