// Rural vegetation: cedar, persimmon, bamboo clump, broadleaf tree, bush.
// All foliage uses vertex colours on shared materials so hundreds of instances stay cheap.
import {
  THREE, V3, PI, lerp, clamp, getMat, mat, canvasTexture, rng, TEX,
  Bag, cyl, gridGeo, xf, boxUV, faceBoxUV, merge, blobGeo, colorByHeight, tint, noise3, taperTube, normalMapTexture,
} from './rural-kit.js';

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
function leafTex() {
  return canvasTexture('rural.tex.leaves', 256, 256, (g, w, h) => {
    const r = rng(2024);
    g.fillStyle = '#9a9a92';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const x = r() * w, y = r() * h;
      const l = 150 + r() * 105;
      const warm = (r() - 0.5) * 24;
      g.fillStyle = `rgb(${clamp(l + warm, 0, 255)},${clamp(l + 6, 0, 255)},${clamp(l - warm - 8, 0, 255)})`;
      g.save();
      g.translate(x, y);
      g.rotate(r() * PI * 2);
      g.beginPath();
      g.ellipse(0, 0, 3 + r() * 5, 1.6 + r() * 2.2, 0, 0, PI * 2);
      g.fill();
      g.restore();
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(30,40,25,${0.15 + r() * 0.3})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  });
}
function leafNormal() {
  const N = 14;
  const r = rng(77);
  const cells = Array.from({ length: N * N }, () => [r(), r(), 0.35 + r() * 0.35]);
  return normalMapTexture('rural.nrm.leaves', 128, 128, (u, v) => {
    const cx = Math.floor(u * N), cy = Math.floor(v * N);
    let hgt = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ix = (cx + dx + N) % N, iy = (cy + dy + N) % N;
      const c = cells[iy * N + ix];
      const px = (cx + dx + c[0]) / N, py = (cy + dy + c[1]) / N;
      const d = Math.hypot(u - px, v - py) * N / c[2];
      if (d < 1) hgt = Math.max(hgt, Math.sqrt(1 - d * d));
    }
    return hgt * 0.02;
  }, 1.0);
}
export function foliageMat() {
  return mat('rural.foliageVC', {
    color: 0xffffff, roughness: 0.88, vertexColors: true, map: leafTex(), normalMap: leafNormal(),
    normalScale: new THREE.Vector2(1.3, 1.3),
  });
}
function barkMat() {
  return mat('rural.barkVC', { color: 0xffffff, roughness: 1.0, vertexColors: true, map: TEX.bark() });
}
function fruitMat() {
  return mat('rural.fruitVC', { color: 0xffffff, roughness: 0.5, vertexColors: true });
}

/** Vertex colours for a foliage blob: per-blob hue, darker underside and towards `center` (fake AO). */
function shadeBlob(geo, base, center, seed, opts = {}) {
  const { top = 1.12, bottom = 0.55, ao = 0.35, jitter = 0.06 } = opts;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  geo.computeBoundingBox();
  const lo = geo.boundingBox.min.y, hi = geo.boundingBox.max.y;
  const c = new THREE.Color(base);
  const col = new Float32Array(pos.count * 3);
  const d = V3(), n = V3();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = clamp((y - lo) / Math.max(1e-3, hi - lo), 0, 1);
    let k = lerp(bottom, top, Math.pow(t, 0.8));
    if (center) {
      d.set(pos.getX(i) - center.x, pos.getY(i) - center.y, pos.getZ(i) - center.z).normalize();
      n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      k *= 1 - ao * clamp(0.5 - 0.5 * d.dot(n), 0, 1);
    }
    k *= 1 + noise3(pos.getX(i) * 2.1, pos.getY(i) * 2.1, pos.getZ(i) * 2.1, seed) * jitter;
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function leafBlob(radius, opts, base, center, seed, shade) {
  const g = blobGeo(radius, opts);
  shadeBlob(g, base, center, seed, shade);
  return faceBoxUV(g, 0.9);
}

/** A tapered branch along points (Catmull-Rom), radii r0 -> r1, tinted. */
function branch(points, r0, r1, radial, segs, color) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = taperTube(curve, segs, radial, (t) => lerp(r0, r1, t), { us: 1.6, vs: 0.7, capEnd: true });
  return tint(g, color);
}

// ---------------------------------------------------------------------------
// 15. 杉 (Japanese cedar) — tiers of drooping, lobed foliage skirts
// ---------------------------------------------------------------------------
function cedarTier(R, h, r) {
  // drooping, lobed umbrella of foliage centred at y=0 (top at +h*0.5)
  const SEG = 14;
  const lobes = 4 + Math.floor(r() * 3);
  const ph = r() * PI * 2, ph2 = r() * PI * 2;
  const yT = h * 0.5;
  const rowsDef = [
    // [radius factor, y, lobe influence]
    [0.1, yT, 0], [0.5, yT - h * 0.36, 0.45], [0.9, yT - h * 0.78, 0.9], [1.0, yT - h * 1.0, 1], [0.6, yT - h * 0.82, 0.6], [0.12, yT - h * 0.5, 0],
  ];
  const rows = [];
  for (const [rf, y, lf] of rowsDef) {
    const row = [];
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * PI * 2;
      const lobe = Math.sin(lobes * a + ph) * 0.2 + Math.sin(lobes * 2.3 * a + ph2) * 0.09;
      const rr = R * rf * (1 + lobe * lf);
      const yy = y - Math.max(0, lobe) * lf * h * 0.25;
      row.push(V3(Math.cos(a) * rr, yy, Math.sin(a) * rr));
    }
    rows.push(row);
  }
  const g = gridGeo(rows, { closed: true, center: V3(0, yT - h * 0.6, 0) });
  const cols = g.userData.cols;
  const cTop = new THREE.Color(0x335f33), cMid = new THREE.Color(0x3f6e3a), cRim = new THREE.Color(0x4f7f42), cDark = new THREE.Color(0x152b1c);
  const rowCol = [cTop, cMid, cRim, cRim.clone().lerp(cDark, 0.45), cDark, cDark];
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < cols; j++) {
    const k = i * cols + j;
    const c = rowCol[i];
    const jit = 0.88 + r() * 0.24;
    col[k * 3] = c.r * jit; col[k * 3 + 1] = c.g * jit; col[k * 3 + 2] = c.b * jit;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return faceBoxUV(g, 1.1);
}

export function createCedar(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 2654435 + 11);
  const bag = new Bag();
  const H = 14 + r() * 4;
  const yStart = H * (0.3 + r() * 0.1);
  const Rb = 1.9 + r() * 0.5;
  const lean = [(r() - 0.5) * 0.25, (r() - 0.5) * 0.25];
  // trunk
  const tr = [V3(0, -0.2, 0), V3(lean[0] * 0.3, H * 0.35, lean[1] * 0.3), V3(lean[0] * 0.7, H * 0.7, lean[1] * 0.7), V3(lean[0], H, lean[1])];
  bag.add(branch(tr, 0.3 + r() * 0.06, 0.04, 7, 5, 0x9a6a4e), barkMat());
  // root flare
  bag.add(tint(xf(cyl(0.3, 0.46, 0.5, 7, true), [0, 0.1, 0]), 0x8a5e44), barkMat(), false);
  // foliage tiers
  const N = 11 + Math.floor(r() * 3);
  const geos = [];
  const sp = (H - 1.0 - yStart) / N;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = lerp(yStart + sp * 0.6, H - 1.3, t);
    const R = Rb * Math.pow(1 - t * 0.92, 1.1) + 0.3;
    const g = cedarTier(R, sp * 1.9, r);
    g.rotateY(r() * PI * 2);
    g.rotateX((r() - 0.5) * 0.1);
    g.rotateZ((r() - 0.5) * 0.1);
    const f = y / H;
    g.translate(lean[0] * f + (r() - 0.5) * 0.1, y, lean[1] * f + (r() - 0.5) * 0.1);
    geos.push(g);
  }
  // top spire
  const spire = new THREE.ConeGeometry(0.42, 2.0, 9, 2);
  spire.translate(lean[0], H - 0.55, lean[1]);
  colorByHeight(spire, 0x24492a, 0x467a3c, 0.05, seed);
  geos.push(faceBoxUV(spire, 1));
  bag.add(merge(geos), foliageMat());
  const group = bag.build();
  group.name = 'Cedar';
  group.userData.collider = { type: 'circle', r: 0.4 };
  return group;
}

// ---------------------------------------------------------------------------
// 16. 柿の木 (persimmon tree) — gnarly branches, sparse autumn canopy, many fruits
// ---------------------------------------------------------------------------
export function createPersimmonTree(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 7477 + 5);
  const bag = new Bag();
  const bark = barkMat(), leaves = foliageMat(), fruitM = fruitMat();
  const barkCol = 0x5a4a40;
  const Ht = 1.6 + r() * 0.5;
  const top = V3((r() - 0.5) * 0.5, Ht, (r() - 0.5) * 0.5);
  bag.add(branch([V3(0, -0.2, 0), V3(0.12, Ht * 0.4, -0.05), V3(-0.08, Ht * 0.75, 0.1), top], 0.24, 0.14, 8, 6, barkCol), bark);
  const woodGeos = [], leafGeos = [], fruitGeos = [];
  const tips = [];
  const nMain = 4 + Math.floor(r() * 2);
  for (let i = 0; i < nMain; i++) {
    const a = (i / nMain) * PI * 2 + r() * 0.6;
    const len = 2.5 + r() * 0.9;
    const up = 1.15 + r() * 0.6;
    const dir = V3(Math.cos(a), up, Math.sin(a)).normalize();
    const p1 = top.clone().addScaledVector(dir, len * 0.4).add(V3((r() - 0.5) * 0.4, (r() - 0.5) * 0.2, (r() - 0.5) * 0.4));
    const p2 = top.clone().addScaledVector(dir, len).add(V3((r() - 0.5) * 0.5, (r() - 0.3) * 0.5, (r() - 0.5) * 0.5));
    woodGeos.push(branch([top.clone(), p1, p2], 0.11, 0.035, 6, 6, barkCol));
    tips.push(p2);
    // secondary branches
    const nSub = 2 + Math.floor(r() * 2);
    for (let k = 0; k < nSub; k++) {
      const f = 0.4 + r() * 0.45;
      const s0 = top.clone().lerp(p1, 1).lerp(p2, f - 0.3 > 0 ? f - 0.3 : 0);
      const b = a + (r() - 0.5) * 1.6;
      const sl = 0.8 + r() * 0.8;
      const sd = V3(Math.cos(b), 0.5 + r() * 0.6, Math.sin(b)).normalize();
      const s1 = s0.clone().addScaledVector(sd, sl * 0.55).add(V3(0, 0.15, 0));
      const s2 = s0.clone().addScaledVector(sd, sl).add(V3(0, -0.15 - r() * 0.2, 0));
      woodGeos.push(branch([s0, s1, s2], 0.05, 0.018, 5, 4, barkCol));
      tips.push(s2);
    }
  }
  bag.add(merge(woodGeos), bark);
  // canopy clumps (sparse, autumn colours) around the tips
  const cols = [0x6f8a38, 0x9a9a3a, 0xc08a34, 0xb0602c, 0x7f8f3a];
  const center = top.clone().add(V3(0, 1.6, 0));
  const clumps = [];
  for (let i = 0; i < tips.length; i++) {
    if (r() < 0.15) continue;
    const t = tips[i];
    const rad = 0.42 + r() * 0.35;
    const g = blobGeo(rad, { detail: 1, amp: 0.34, freq: 2.2, seed: seed * 13 + i, scale: [1.1, 0.8, 1.1] });
    shadeBlob(g, cols[Math.floor(r() * cols.length)], center.clone().sub(t), seed + i, { ao: 0.3 });
    g.translate(t.x, t.y + 0.1, t.z);
    clumps.push(g);
    leafGeos.push(faceBoxUV(g, 0.9));
  }
  // filler clumps inside the crown so it reads as one sparse canopy
  const nFill = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nFill; i++) {
    const a = r() * PI * 2, d = 0.6 + r() * 0.9;
    const p = V3(top.x + Math.cos(a) * d, top.y + 1.5 + r() * 1.8, top.z + Math.sin(a) * d);
    const g = blobGeo(0.45 + r() * 0.3, { detail: 1, amp: 0.35, freq: 2.2, seed: seed * 29 + i, scale: [1.1, 0.8, 1.1] });
    shadeBlob(g, cols[Math.floor(r() * cols.length)], center.clone().sub(p), seed + 50 + i, { ao: 0.35 });
    g.translate(p.x, p.y, p.z);
    clumps.push(g);
    leafGeos.push(faceBoxUV(g, 0.9));
  }
  bag.add(merge(leafGeos), leaves);
  // persimmons: on the outer surface of the clumps and hanging at tips
  const fruitCols = [0xf0761a, 0xe85a16, 0xf2902a, 0xf07e24];
  const nF = 48 + Math.floor(r() * 14);
  for (let i = 0; i < nF; i++) {
    const cg = clumps[Math.floor(r() * clumps.length)];
    const cp = cg.attributes.position, cn = cg.attributes.normal;
    let vi = Math.floor(r() * cp.count);
    for (let tries = 0; tries < 6; tries++) {
      const out = V3(cp.getX(vi) - center.x, 0, cp.getZ(vi) - center.z).normalize();
      if (cn.getX(vi) * out.x + cn.getZ(vi) * out.z + cn.getY(vi) * 0.2 > 0.1) break;
      vi = Math.floor(r() * cp.count);
    }
    const p = V3(cp.getX(vi), cp.getY(vi), cp.getZ(vi)).addScaledVector(V3(cn.getX(vi), cn.getY(vi), cn.getZ(vi)), 0.03);
    const rad = 0.075 + r() * 0.02;
    const f = new THREE.SphereGeometry(rad, 7, 4);
    f.scale(1, 0.82, 1);
    f.translate(p.x, p.y, p.z);
    tint(f, fruitCols[Math.floor(r() * fruitCols.length)]);
    fruitGeos.push(f);
    const cal = new THREE.ConeGeometry(rad * 0.7, rad * 0.35, 4, 1, true);
    cal.translate(p.x, p.y + rad * 0.85, p.z);
    tint(cal, 0x3f4a26);
    fruitGeos.push(cal);
  }
  bag.add(merge(fruitGeos), fruitM, true);
  const group = bag.build();
  group.name = 'PersimmonTree';
  group.userData.collider = { type: 'circle', r: 0.3 };
  return group;
}

// ---------------------------------------------------------------------------
// 17. 竹林 (bamboo clump)
// ---------------------------------------------------------------------------
function culmTex() {
  return canvasTexture('rural.tex.bambooCulm', 64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#b9c9a0');
    grd.addColorStop(0.45, '#eef4de');
    grd.addColorStop(1, '#a9b98f');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const r = rng(4);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(80,100,60,${r() * 0.1})`;
      g.fillRect(r() * w, r() * h, 1, 10 + r() * 30);
    }
    // node ring (one per repeat) at the bottom of the tile
    g.fillStyle = 'rgba(70,80,50,0.75)';
    g.fillRect(0, h - 10, w, 4);
    g.fillStyle = 'rgba(255,255,240,0.7)';
    g.fillRect(0, h - 6, w, 3);
    g.fillStyle = 'rgba(90,100,70,0.35)';
    g.fillRect(0, h - 24, w, 14);
  });
}
function bambooLeafTex() {
  return canvasTexture('rural.tex.bambooLeaves', 256, 256, (g, w, h) => {
    const r = rng(99);
    g.clearRect(0, 0, w, h);
    const spray = (x, y, ang, n, len) => {
      // twig
      g.strokeStyle = 'rgba(90,110,50,1)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      const ex = x + Math.cos(ang) * len * 0.8, ey = y + Math.sin(ang) * len * 0.8;
      g.lineTo(ex, ey);
      g.stroke();
      for (let i = 0; i < n; i++) {
        const t = 0.25 + (i / n) * 0.75;
        const px = lerp(x, ex, t), py = lerp(y, ey, t);
        const side = i % 2 ? 1 : -1;
        const la = ang + side * (0.5 + r() * 0.5) + 0.25;
        const ll = 26 + r() * 22, lw = 4 + r() * 2.5;
        const l = 70 + r() * 70;
        g.fillStyle = `rgb(${50 + r() * 30},${l + 30},${30 + r() * 25})`;
        g.save();
        g.translate(px, py);
        g.rotate(la);
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(ll * 0.4, -lw, ll, 0);
        g.quadraticCurveTo(ll * 0.4, lw, 0, 0);
        g.fill();
        g.restore();
      }
    };
    for (let k = 0; k < 16; k++) spray(20 + r() * (w - 40), 10 + r() * (h * 0.5), PI * 0.35 + (r() - 0.5) * 1.2, 5 + Math.floor(r() * 4), 50 + r() * 50);
  });
}

export function createBambooClump(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 3571 + 17);
  const bag = new Bag();
  const culmM = mat('rural.bambooCulm', { color: 0xffffff, roughness: 0.45, vertexColors: true, map: culmTex() });
  const leafM = mat('rural.bambooLeaf', { color: 0xdfe8c8, roughness: 0.8, map: bambooLeafTex(), alphaTest: 0.5, side: THREE.DoubleSide });
  const n = 12 + Math.floor(r() * 9);
  const culms = [], cards = [];
  const culmCols = [0x7fa846, 0x93b04e, 0x6f9a3e, 0xa9b458, 0x86a24a];
  for (let i = 0; i < n; i++) {
    const a = r() * PI * 2, d = Math.sqrt(r()) * 1.3;
    const base = V3(Math.cos(a) * d, -0.1, Math.sin(a) * d);
    const H = 8 + r() * 4;
    const lean = V3(Math.cos(a) * (0.15 + d * 0.35), 0, Math.sin(a) * (0.15 + d * 0.35)).add(V3((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4));
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pts.push(V3(base.x + lean.x * H * 0.12 * t * t * 1.4, base.y + H * t, base.z + lean.z * H * 0.12 * t * t * 1.4));
    }
    const rad = 0.045 + r() * 0.035;
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = taperTube(curve, 6, 6, (t) => rad * (1 - t * 0.65), { us: 1 / (PI * rad * 2), vs: 1 / 0.38 });
    // uv u must stay in [0,1] around; normalise per culm
    tint(g, culmCols[Math.floor(r() * culmCols.length)]);
    culms.push(g);
    // leaf cards in the upper part: crossed quads drooping outward
    const nc = 5 + Math.floor(r() * 4);
    for (let k = 0; k < nc; k++) {
      const t = 0.5 + (k / nc) * 0.5 + r() * 0.05;
      const p = curve.getPointAt(Math.min(1, t));
      const size = 1.3 + r() * 0.8 * (1.2 - t);
      const q = new THREE.PlaneGeometry(size, size * 0.9);
      q.translate(size * 0.45, -size * 0.2, 0);
      q.rotateZ(-0.35 - r() * 0.4);
      q.rotateY(r() * PI * 2);
      q.translate(p.x, p.y, p.z);
      // normals pointing away from the clump axis (volumetric lighting on cards)
      const nor = q.attributes.normal, pos = q.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const nn = V3(pos.getX(v) - base.x * 0.3, (pos.getY(v) - H * 0.6) * 0.5 + 1.5, pos.getZ(v) - base.z * 0.3).normalize();
        nor.setXYZ(v, nn.x, nn.y, nn.z);
      }
      cards.push(q);
    }
  }
  bag.add(merge(culms), culmM);
  bag.add(merge(cards), leafM, true);
  // a few low shoots / fallen sheaths at the base
  const base = [];
  for (let i = 0; i < 5; i++) {
    const a = r() * PI * 2, d = r() * 1.2;
    const s = new THREE.ConeGeometry(0.06, 0.35 + r() * 0.3, 6, 1, false);
    s.translate(Math.cos(a) * d, 0.15, Math.sin(a) * d);
    tint(s, 0x8a6a3c);
    base.push(s);
  }
  bag.add(merge(base), culmM, false);
  const group = bag.build();
  group.name = 'BambooClump';
  group.userData.collider = { type: 'circle', r: 1.4 };
  return group;
}

// ---------------------------------------------------------------------------
// 18. 広葉樹 (generic round deciduous tree)
// ---------------------------------------------------------------------------
export function createBroadleafTree(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 9151 + 3);
  const bag = new Bag();
  const barkCol = 0x6e645a;
  const Ht = 2.0 + r() * 0.6;
  const H = 7 + r() * 2.5;
  const trunkTop = V3((r() - 0.5) * 0.4, Ht, (r() - 0.5) * 0.4);
  const wood = [branch([V3(0, -0.2, 0), V3(0.05, Ht * 0.5, 0.03), trunkTop], 0.3, 0.2, 8, 4, barkCol)];
  bag.add(tint(xf(cyl(0.3, 0.45, 0.4, 8, true), [0, 0.1, 0]), 0x62584e), barkMat(), false);
  // crown: blob centres on a dome
  const crownC = V3(trunkTop.x, Ht + (H - Ht) * 0.55, trunkTop.z);
  const nb = 8 + Math.floor(r() * 4);
  const centers = [];
  centers.push(V3(crownC.x + (r() - 0.5) * 0.4, H - 1.4, crownC.z + (r() - 0.5) * 0.4));
  for (let i = 1; i < nb; i++) {
    // points on a wide ellipsoidal dome
    const a = i * 2.39996 + r() * 0.4;
    const el = lerp(-0.25, 0.75, (i % 4) / 3) + (r() - 0.5) * 0.2;
    const rr = 2.3 * Math.cos(el * 1.2) + 0.2;
    centers.push(V3(crownC.x + Math.cos(a) * rr, crownC.y + Math.sin(el) * 1.6, crownC.z + Math.sin(a) * rr));
  }
  for (const c of centers.slice(0, 5)) {
    const mid = trunkTop.clone().lerp(c, 0.5).add(V3((r() - 0.5) * 0.4, 0.2, (r() - 0.5) * 0.4));
    wood.push(branch([trunkTop.clone(), mid, c.clone().lerp(trunkTop, 0.25)], 0.14, 0.05, 6, 4, barkCol));
  }
  bag.add(merge(wood), barkMat());
  const greens = [0x4d7c31, 0x5a8a38, 0x3f6d2a, 0x679a3f, 0x557f34];
  const leafGeos = [];
  centers.forEach((c, i) => {
    const rad = (i === 0 ? 1.5 : 1.05) + r() * 0.45;
    const g = leafBlob(rad, { detail: i < 5 ? 3 : 2, amp: 0.22, freq: 1.4, seed: seed * 31 + i, scale: [1, 0.82, 1] }, greens[Math.floor(r() * greens.length)], crownC.clone().sub(c), seed + i, { ao: 0.45 });
    g.translate(c.x, c.y, c.z);
    leafGeos.push(g);
  });
  bag.add(merge(leafGeos), foliageMat());
  const group = bag.build();
  group.name = 'BroadleafTree';
  group.userData.collider = { type: 'circle', r: 0.35 };
  return group;
}

/** 5-petal star flower facing +Z with a slightly cupped centre. */
function starFlower(rad) {
  const pos = [];
  const pt = (k) => {
    const a = (k / 10) * PI * 2;
    const rr = k % 2 ? rad * 0.5 : rad;
    return [Math.cos(a) * rr, Math.sin(a) * rr, k % 2 ? 0.004 : 0.01];
  };
  for (let k = 0; k < 10; k++) {
    const a = pt(k), b = pt((k + 1) % 10);
    pos.push(0, 0, -0.008, ...a, ...b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// 19. 植え込み (azalea-like bush, optional flowers)
// ---------------------------------------------------------------------------
export function createBush(opts = {}) {
  const { seed = 1, flowers = false } = opts;
  const r = rng(seed * 6007 + 23);
  const bag = new Bag();
  const nb = 3 + Math.floor(r() * 3);
  const leafGeos = [];
  const blobs = [];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * PI * 2 + r();
    const d = i === 0 ? 0 : 0.35 + r() * 0.2;
    const rad = (i === 0 ? 0.62 : 0.45) + r() * 0.15;
    const c = V3(Math.cos(a) * d, rad * 0.62, Math.sin(a) * d);
    const g = blobGeo(rad, { detail: flowers ? 2 : 3, amp: 0.14, freq: 2.6, seed: seed * 7 + i, scale: [1, 0.9, 1], flatBottom: 0.3 });
    shadeBlob(g, [0x3a6a2c, 0x46783a, 0x33602a][i % 3], V3(-c.x, -0.3, -c.z), seed + i, { ao: 0.3, bottom: 0.5 });
    if (flowers) {
      const pos = g.attributes.position, col = g.attributes.color;
      const pink = new THREE.Color(0xf0609a);
      for (let v = 0; v < pos.count; v++) {
        const nz = noise3(pos.getX(v) * 3.2 + c.x * 3, pos.getY(v) * 3.2, pos.getZ(v) * 3.2 + c.z * 3, seed + 9);
        const m = clamp((nz + 0.05) * 5.0, 0, 1) * clamp((pos.getY(v) + rad * 0.5) / rad, 0, 1);
        const k = 0.75 + 0.35 * (pos.getY(v) / rad);
        col.setXYZ(v, lerp(col.getX(v), pink.r * k, m), lerp(col.getY(v), pink.g * k, m), lerp(col.getZ(v), pink.b * k, m));
      }
    }
    g.translate(c.x, c.y, c.z);
    blobs.push([g, c, rad]);
    leafGeos.push(faceBoxUV(g, 0.7));
  }
  bag.add(merge(leafGeos), foliageMat());
  if (flowers) {
    const fl = [];
    const pal = [0xf05a9a, 0xd8307a, 0xf38ab8, 0xe84a8a];
    for (const [g, c] of blobs) {
      const pos = g.attributes.position, nor = g.attributes.normal;
      const cnt = 44;
      for (let k = 0; k < cnt; k++) {
        const vi = Math.floor(r() * pos.count);
        const n = V3(nor.getX(vi), nor.getY(vi), nor.getZ(vi));
        if (n.y < -0.2) continue;
        const p = V3(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).addScaledVector(n, 0.015);
        // skip points buried inside a neighbouring blob
        if (blobs.some(([g2, c2, r2]) => g2 !== g && p.distanceTo(c2) < r2 * 0.92)) continue;
        const f = starFlower(0.045 + r() * 0.02);
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), n);
        f.applyQuaternion(q);
        f.translate(p.x, p.y, p.z);
        tint(f, pal[Math.floor(r() * pal.length)]);
        fl.push(f);
      }
      void c;
    }
    bag.add(merge(fl), fruitMat(), false);
  }
  const group = bag.build();
  group.name = flowers ? 'BushFlowering' : 'Bush';
  group.userData.collider = { type: 'circle', r: 0.8 };
  return group;
}
