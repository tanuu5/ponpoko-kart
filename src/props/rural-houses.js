// Rural buildings: thatched minka, 2-story kawara house, kura storehouse.
import {
  THREE, V3, PI, lerp, clamp, getMat, mat, canvasTexture, TEX, rng,
  Bag, box, cbox, rbox, timber, cyl, barBetween, rodBetween, gridGeo, gridRows, sweep, rectProfile,
  capGeo, xf, boxUV, uvScale, normalMapTexture, merge, noise3, alignY, FONT_MIN, FONT_GOTH,
} from './rural-kit.js';

// ---------------------------------------------------------------------------
// Textures & materials
// ---------------------------------------------------------------------------
function r32(seed) { return rng(seed); }

function strokeWrap(g, w, h, x, y, dx, dy) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    if (x + ox + Math.max(0, dx) < -2 || x + ox + Math.min(0, dx) > w + 2) continue;
    if (y + oy + Math.max(0, dy) < -2 || y + oy + Math.min(0, dy) > h + 2) continue;
    g.beginPath();
    g.moveTo(x + ox, y + oy);
    g.lineTo(x + ox + dx, y + oy + dy);
    g.stroke();
  }
}

// straw laid down the slope (v = down/up the slope), tileable
function thatchTex() {
  return canvasTexture('rural.tex.thatch', 256, 256, (g, w, h) => {
    const r = r32(31);
    g.fillStyle = '#b39873';
    g.fillRect(0, 0, w, h);
    // soft clumps
    for (let i = 0; i < 70; i++) {
      const x = r() * w, bw = 5 + r() * 16, l = r() < 0.5 ? 'rgba(80,60,35,' : 'rgba(235,215,170,';
      g.fillStyle = l + (0.05 + r() * 0.08) + ')';
      g.fillRect(x, 0, bw, h);
      if (x + bw > w) g.fillRect(x - w, 0, bw, h);
    }
    // strands
    for (let i = 0; i < 4200; i++) {
      const x = r() * w, y = r() * h, len = 14 + r() * 46;
      const l = 30 + r() * 45;
      g.strokeStyle = `hsla(${32 + r() * 12},${22 + r() * 30}%,${l}%,${0.35 + r() * 0.35})`;
      g.lineWidth = 0.6 + r() * 1.1;
      strokeWrap(g, w, h, x, y, (r() - 0.5) * 2.5, len);
    }
    // gentle horizontal courses (soft, not lines)
    for (let k = 0; k < 4; k++) {
      const y0 = (k + 0.5) * (h / 4);
      const grd = g.createLinearGradient(0, y0 - 10, 0, y0 + 10);
      grd.addColorStop(0, 'rgba(60,40,20,0)');
      grd.addColorStop(0.5, 'rgba(60,40,20,0.10)');
      grd.addColorStop(1, 'rgba(60,40,20,0)');
      g.fillStyle = grd;
      g.fillRect(0, y0 - 10, w, 20);
    }
  });
}

// eave cut face: v = 0 (bottom of band) .. 1 (top), layered straw ends
function thatchEndTex() {
  return canvasTexture('rural.tex.thatchEnd', 256, 256, (g, w, h) => {
    const r = r32(404);
    // layers from the top of the canvas (top of the band) downwards
    const layers = [
      [0.0, 0.16, '#9c8058'], [0.16, 0.42, '#c3a676'], [0.42, 0.66, '#b99b6a'], [0.66, 0.86, '#c9ad7c'], [0.86, 1.0, '#6e5738'],
    ];
    for (const [a, b, c] of layers) { g.fillStyle = c; g.fillRect(0, a * h, w, (b - a) * h + 1); }
    // straw ends: tiny vertical dashes
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h;
      const l = r();
      g.fillStyle = l < 0.5 ? `rgba(70,50,25,${0.18 + r() * 0.25})` : `rgba(250,230,180,${0.12 + r() * 0.22})`;
      g.fillRect(x, y, 1 + r() * 1.2, 1.5 + r() * 2.5);
    }
    // grooves between layers
    for (const [a] of layers.slice(1)) {
      g.fillStyle = 'rgba(40,28,14,0.45)';
      g.fillRect(0, a * h - 1, w, 3);
      g.fillStyle = 'rgba(255,240,205,0.18)';
      g.fillRect(0, a * h + 2, w, 2);
    }
  });
}
function thatchNormal() {
  // strands along v with fine random ridges + faint horizontal layer steps
  const r = r32(7);
  const ph = Array.from({ length: 64 }, () => r() * 6.28);
  const amp = Array.from({ length: 64 }, () => 0.4 + r() * 0.6);
  return normalMapTexture('rural.nrm.thatch', 128, 128, (u, v) => {
    let h = 0;
    for (let k = 0; k < 12; k++) h += Math.sin(u * PI * 2 * (7 + k * 3) + ph[k] + v * ph[k + 12] * 0.3) * amp[k] * 0.012 / (1 + k * 0.3);
    const layer = (v * 4) % 1;
    h += (layer < 0.1 ? layer / 0.1 : 1) * 0.01;
    return h;
  }, 1.4);
}

function thatchMat() {
  return mat('rural.thatch', {
    color: 0xb09a7a, roughness: 1.0, map: thatchTex(), normalMap: thatchNormal(), vertexColors: true,
    normalScale: new THREE.Vector2(1.1, 1.1),
  });
}
function thatchEdgeMat() {
  return mat('rural.thatchEdge', { color: 0xe6d2ae, roughness: 1.0, map: thatchEndTex() });
}

function shojiTex() {
  return canvasTexture('rural.tex.shoji', 128, 256, (g, w, h) => {
    const r = r32(55);
    g.fillStyle = '#f3ecdc';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      g.strokeStyle = `rgba(150,130,100,${r() * 0.1})`;
      g.beginPath();
      const x = r() * w, y = r() * h;
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 20);
      g.stroke();
    }
    const kosh = h * 0.2; // lower wooden panel
    g.fillStyle = '#9b7550';
    g.fillRect(0, h - kosh, w, kosh);
    g.fillStyle = 'rgba(60,40,20,0.35)';
    for (let x = 12; x < w; x += 22) g.fillRect(x, h - kosh, 2, kosh);
    // kumiko lattice
    g.fillStyle = '#b89468';
    const cols = 3, rows = 6;
    for (let i = 1; i < cols; i++) g.fillRect((i * w) / cols - 2, 0, 4, h - kosh);
    for (let j = 1; j < rows; j++) g.fillRect(0, (j * (h - kosh)) / rows - 2, w, 4);
    g.fillRect(0, h - kosh - 4, w, 6);
    // frame
    g.fillStyle = '#8f6c46';
    g.fillRect(0, 0, 8, h);
    g.fillRect(w - 8, 0, 8, h);
    g.fillRect(0, 0, w, 8);
    g.fillRect(0, h - 8, w, 8);
  });
}
function shojiMat(lit) {
  if (lit) {
    return mat('rural.shojiLit', {
      color: 0xffffff, map: shojiTex(), emissive: 0xffb866, emissiveMap: shojiTex(), emissiveIntensity: 1.6, roughness: 0.9,
    });
  }
  return mat('rural.shoji', { color: 0xffffff, map: shojiTex(), roughness: 0.9 });
}

// Kawara (J-tile) texture + normal map. 512px = 4x4 tiles = 1.2m x 1.2m.
const TILE = 0.3;
function kawaraProfile(u) {
  // one tile column, u in [0,1): broad trough then narrow roll
  const x = u;
  if (x < 0.68) return -Math.sin((x / 0.68) * PI) * 0.35;
  const t = (x - 0.68) / 0.32;
  return Math.sin(t * PI) * 0.55;
}
function kawaraHeight(u, v) {
  const cu = (u * 4) % 1;
  const cv = (v * 4) % 1;
  let h = kawaraProfile(cu) * 0.07;
  h += (1 - cv) * 0.012;
  if (cv < 0.04) h -= (0.04 - cv) * 0.35;
  return h;
}
function kawaraTex() {
  return canvasTexture('rural.tex.kawara', 512, 512, (g, w, h) => {
    const r = r32(99);
    const img = g.createImageData(w, h);
    const tileTone = Array.from({ length: 16 }, () => 0.9 + r() * 0.2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = 1 - y / h;
        const cu = (u * 4) % 1, cv = (v * 4) % 1;
        const ti = Math.floor(u * 4) + Math.floor(v * 4) * 4;
        let l = 0.74 * tileTone[ti];
        const p = kawaraProfile(cu);
        l += p * 0.34;
        if (cv < 0.035) l *= 0.62 + cv * 8;
        else if (cv < 0.07) l *= 1.08;
        l += (r() - 0.5) * 0.035;
        const k = (y * w + x) * 4;
        img.data[k] = clamp(l * 236, 0, 255);
        img.data[k + 1] = clamp(l * 236, 0, 255);
        img.data[k + 2] = clamp(l * 238, 0, 255);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}
function kawaraNormal() {
  return normalMapTexture('rural.nrm.kawara', 256, 256, kawaraHeight, 1.0);
}
export function kawaraMat() {
  return mat('rural.kawara', {
    color: 0x86868b, roughness: 0.56, metalness: 0.1, map: kawaraTex(), normalMap: kawaraNormal(),
    normalScale: new THREE.Vector2(1.4, 1.4),
  });
}
function kawaraEdgeTex() {
  // eave front: round tomoe tile ends alternating with flat lip, v = height of band (0.3m)
  return canvasTexture('rural.tex.kawaraEdge', 256, 128, (g, w, h) => {
    g.fillStyle = '#50565e';
    g.fillRect(0, 0, w, h);
    // flat karakusa lip band
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#8d949c');
    grd.addColorStop(0.45, '#6d747c');
    grd.addColorStop(1, '#3f444b');
    g.fillStyle = grd;
    g.fillRect(0, h * 0.18, w, h * 0.5);
    g.strokeStyle = 'rgba(210,215,220,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * (w / 4) - w * 0.08;
      g.beginPath();
      g.moveTo(cx - 20, h * 0.44);
      g.bezierCurveTo(cx - 10, h * 0.25, cx + 10, h * 0.6, cx + 22, h * 0.4);
      g.stroke();
    }
    // round ends (at the roll positions 0.68..1 of each column)
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.84) * (w / 4);
      const cy = h * 0.42;
      const rr = w / 4 * 0.2;
      const rg = g.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, cx, cy, rr);
      rg.addColorStop(0, '#a3aab2');
      rg.addColorStop(1, '#4b5058');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(cx, cy, rr, 0, PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(40,44,50,0.8)';
      g.lineWidth = 2;
      g.stroke();
      // tomoe swirl
      g.fillStyle = 'rgba(60,64,70,0.7)';
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * PI * 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * rr * 0.35, cy + Math.sin(a) * rr * 0.35, rr * 0.22, 0, PI * 2);
        g.fill();
      }
    }
    // fascia board below (lower third)
    g.fillStyle = '#4a3a2c';
    g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, h * 0.7, w, 3);
  });
}
export function kawaraEdgeMat() {
  return mat('rural.kawaraEdge', { color: 0xffffff, roughness: 0.6, metalness: 0.1, map: kawaraEdgeTex() });
}

// ---------------------------------------------------------------------------
// Thatched roof (rounded hip / irimoya) built from lofted rings
// ---------------------------------------------------------------------------
function roundedRectRing(a, b, r, nc, ns, y) {
  r = Math.min(r, a * 0.999, b * 0.999);
  const pts = [];
  const C = [
    [a - r, -(b - r), 0],
    [-(a - r), -(b - r), PI / 2],
    [-(a - r), b - r, PI],
    [a - r, b - r, PI * 1.5],
  ];
  const arcPt = (k, t) => V3(C[k][0] + r * Math.cos(t), y, C[k][1] - r * Math.sin(t));
  for (let k = 0; k < 4; k++) {
    const t0 = C[k][2];
    for (let i = 0; i <= nc; i++) pts.push(arcPt(k, t0 + (i / nc) * (PI / 2)));
    const pEnd = pts[pts.length - 1];
    const k2 = (k + 1) % 4;
    const pNext = arcPt(k2, C[k2][2]);
    for (let i = 1; i < ns; i++) pts.push(pEnd.clone().lerp(pNext, i / ns));
  }
  return pts;
}

/** cumulative arc length per column along a closed ring (length+1 entries) */
function colU(row, scale) {
  const u = [0];
  for (let j = 1; j <= row.length; j++) u.push(u[j - 1] + row[j % row.length].distanceTo(row[j - 1]));
  return u.map((x) => x * scale);
}

/**
 * Thick thatched roof. A,B = wall half extents; ov = overhang; yW = wall top;
 * yEB = eave bottom; thick = eave cut height; yTop = thatch top at ridge; yg = gable start (irimoya)
 * Returns info for the ridge.
 */
function thatchRoof(bag, M, o) {
  const { A, B, ov, yW, yEB, thick, yTop, yg, bulge = 0.16, rc = 1.5, nc = 6, ns = 3, lean = 0.1 } = o;
  const bEave = B + ov;
  const ring = (a, b, y) => roundedRectRing(a, b, (rc * b) / bEave, nc, ns, y);

  // soffit (underside) rings
  const soff = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    const d = lerp(-0.04, ov - 0.03, t);
    const y = lerp(yW - 0.02, yEB + 0.03, Math.pow(t, 0.9));
    soff.push(ring(A + d, B + d, y));
  }
  const uS = colU(soff[soff.length - 1], 0.8);
  const gs = gridGeo(soff, { closed: true, uvFn: (p, i, j, ua, va) => [uS[j], va * 0.8], center: V3(0, yW + 5, 0) });
  bag.add(gs, M.soffit);

  // edge band + slope
  const prof = [
    [ov - 0.02, yEB], [ov + 0.04, yEB + 0.14], [ov + 0.075, yEB + thick * 0.4], [ov + 0.06, yEB + thick * 0.72],
    [ov + 0.0, yEB + thick * 0.92], [ov - 0.1, yEB + thick * 1.02], [ov - 0.22, yEB + thick * 1.08],
  ];
  const nEdge = 5; // rows 0..nEdge are edge material
  const d0 = prof[prof.length - 1][0], y0 = prof[prof.length - 1][1];
  const bTop = 0.2;
  const dTop = bTop - B;
  const N = 12;
  const tg = (yg - y0) / (yTop - y0);
  const slopeT = [];
  for (let i = 1; i <= N; i++) slopeT.push(i / N);
  if (o.irimoya) { slopeT.push(tg, tg); slopeT.sort((a, b) => a - b); }
  const dAt = (t) => lerp(d0, dTop, t);
  const yAt = (t) => lerp(y0, yTop, t) + bulge * Math.sin(PI * t);
  const aG = A + dAt(tg);
  const rows = prof.map(([d, y]) => ring(A + d, B + d, y));
  let passedG = false;
  for (const t of slopeT) {
    const d = dAt(t), y = yAt(t);
    let a = A + d;
    if (o.irimoya && t >= tg) {
      if (t === tg && !passedG) { passedG = true; } else a = aG - (t - tg) * (yTop - y0) * lean;
    }
    rows.push(ring(a, B + d, y));
  }
  // closing rows at the very top
  const aTop = o.irimoya ? aG - (1 - tg) * (yTop - y0) * lean : A + dTop;
  rows.push(ring(aTop, 0.06, yTop + 0.04));
  const uC = colU(rows[0], 0.9);
  let edgeLen = 0;
  for (let i = 1; i <= nEdge; i++) edgeLen += rows[i][0].distanceTo(rows[i - 1][0]);
  const g = gridGeo(rows, {
    closed: true,
    uvFn: (p, i, j, ua, va) => (i <= nEdge ? [uC[j] * 0.8, (va / edgeLen) * 0.995] : [uC[j], (va - edgeLen) * 0.95]),
    center: V3(0, yW - 2, 0),
  });
  const eg = gridRows(g, 0, nEdge);
  // slope part: separate UV row for the first slope row (it shares vertices with the edge top)
  const sg = gridRows(g, nEdge, rows.length - 1);
  const suv = sg.attributes.uv, spos = sg.attributes.position;
  for (let k = 0; k < suv.count; k++) if (suv.getY(k) > 0.9 && suv.getY(k) <= 1.0 && Math.abs(spos.getY(k) - rows[nEdge][0].y) < 0.02) suv.setY(k, 0);
  // vertex tint: moss patches low on the roof, sun-bleached towards the ridge
  const col = new Float32Array(spos.count * 3);
  const moss = new THREE.Color(0x8a9a5a), dark = new THREE.Color(0x7a6a55), c = new THREE.Color();
  for (let k = 0; k < spos.count; k++) {
    const x = spos.getX(k), y = spos.getY(k), z = spos.getZ(k);
    const hN = clamp((y - y0) / (yTop - y0), 0, 1);
    c.setRGB(1, 1, 1);
    const n = noise3(x * 0.45, y * 0.45, z * 0.45, o.seed || 3);
    const m = clamp((n - 0.05) * 2.2, 0, 1) * (1 - hN) * 0.75;
    c.lerp(moss, m);
    c.lerp(dark, clamp(0.35 - hN, 0, 0.35));
    const bright = 1 + hN * 0.12 + noise3(x * 1.3, y * 1.3, z * 1.3, 11) * 0.06;
    col[k * 3] = c.r * bright; col[k * 3 + 1] = c.g * bright; col[k * 3 + 2] = c.b * bright;
  }
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bag.add(eg, M.thatchEdge);
  bag.add(sg, M.thatch);
  return { aTop, aG, yg: yAt(tg), bG: B + dAt(tg), dAt, yAt, tg, bTop, y0, d0 };
}

// ---------------------------------------------------------------------------
// Kawara roof (hip / irimoya / gable) built side by side for crisp hips
// ---------------------------------------------------------------------------
/**
 * o: { A, B, yW, ov, ovX (gable overhang, default ov), pitch, eaveH, type:'hip'|'irimoya'|'gable',
 *      gFrac, verge, sori, rows, curve }
 * Adds: roof top (M.tile), eave band (M.edge), soffit (M.soffit), returns geometry info.
 */
function kawaraRoof(bag, M, o) {
  const { A, B, yW, ov, pitch = 0.5, eaveH = 0.24, type = 'hip', gFrac = 0.5, verge = 0.3, sori = 0.16, curve = 0.12 } = o;
  const ovX = o.ovX ?? ov;
  const nRows = o.rows ?? 6;
  const sMax = B + ov; // inset where both slopes meet
  const sStop = o.sStop ?? null; // skirt roofs stop here (no ridge)
  const H = pitch * sMax;
  const yE = yW + eaveH - ov * pitch * 0.92; // roof surface height at eave line
  const sG = type === 'irimoya' ? sMax * gFrac : type === 'gable' ? 0 : sMax;
  const aG = type === 'gable' ? A + ovX : A + ov - sG; // x half extent where gable wall stands
  const halfZ = (s) => B + ov - s;
  const halfX = (s, upper = false) => {
    if (type === 'gable') return A + ovX;
    if (type === 'irimoya' && upper) return aG + verge;
    return A + ov - s;
  };
  const yS = (s) => { const t = s / sMax; return yE + H * (t * (1 - curve) + curve * t * t); };
  const sL = type === 'gable' ? sMax * 0.5 : Math.max(0.01, Math.min(sG, sMax * 0.6, sStop ?? 1e9));
  const lift = (s, u) => {
    const f = Math.max(0, 1 - s / sL);
    return sori * Math.pow(Math.abs(u), 3) * f * f;
  };
  const U = [-1, -0.9, -0.72, -0.45, -0.15, 0.15, 0.45, 0.72, 0.9, 1];
  const slopeLen = Math.sqrt(1 + pitch * pitch);
  // row lists [s, upper]
  const longList = [], endList = [];
  if (sStop != null) {
    for (let i = 0; i <= nRows; i++) { longList.push([(sStop * i) / nRows, false]); endList.push([(sStop * i) / nRows, false]); }
  } else if (type === 'irimoya') {
    const n1 = Math.max(2, Math.round(nRows * gFrac)), n2 = Math.max(2, nRows - n1);
    for (let i = 0; i <= n1; i++) { longList.push([(sG * i) / n1, false]); endList.push([(sG * i) / n1, false]); }
    for (let i = 0; i <= n2; i++) longList.push([lerp(sG, sMax, i / n2), true]);
  } else {
    for (let i = 0; i <= nRows; i++) longList.push([(sMax * i) / nRows, false]);
    if (type === 'hip') for (let i = 0; i <= nRows; i++) endList.push([(sMax * i) / nRows, false]);
  }
  // long sides
  for (const sz of [1, -1]) {
    const rows = [], rs = [];
    for (const [s, up] of longList) {
      rows.push(U.map((u) => V3(u * halfX(s, up), yS(s) + lift(s, u), sz * halfZ(s))));
      rs.push(s);
    }
    if (sStop == null) {
      rows.push(rows[rows.length - 1].map((p) => V3(p.x, p.y + 0.02, -sz * 0.05)));
      rs.push(sMax + 0.05);
    }
    bag.add(gridGeo(rows, { uvFn: (p, i) => [(sz * p.x) / (TILE * 4), (rs[i] * slopeLen) / (TILE * 4)], awayDir: V3(0, 1, sz * 0.3) }), M.tile);
  }
  // hip ends
  for (const sx of [1, -1]) {
    if (!endList.length) break;
    const rows = [], rs = [];
    for (const [s] of endList) {
      rows.push(U.map((u) => V3(sx * halfX(s), yS(s) + lift(s, u), -sx * u * halfZ(s))));
      rs.push(s);
    }
    bag.add(gridGeo(rows, { uvFn: (p, i) => [(-sx * p.z) / (TILE * 4), (rs[i] * slopeLen) / (TILE * 4)], awayDir: V3(sx * 0.3, 1, 0) }), M.tile);
  }

  // eave band + soffit per side
  const eaveSide = (axis, sgn, halfLen0, halfLenW) => {
    const fixed0 = axis === 'z' ? halfZ(0) : halfX(0);
    const P = (u, y, inset, half) => (axis === 'z' ? V3(u * half, y, sgn * (fixed0 - inset)) : V3(sgn * (fixed0 - inset), y, -sgn * u * half));
    const top = U.map((u) => P(u, yS(0) + lift(0, u), 0, halfLen0));
    const bot = U.map((u) => P(u, yS(0) + lift(0, u) - eaveH, 0, halfLen0));
    const y0 = yS(0) - eaveH;
    bag.add(gridGeo([bot, top], {
      uvFn: (p) => [(axis === 'z' ? sgn * p.x : -sgn * p.z) / (TILE * 4), clamp((p.y - y0 - lift(0, 1) * 0) / eaveH, 0, 1) * 0.98 + 0.01],
      awayDir: axis === 'z' ? V3(0, 0, sgn) : V3(sgn, 0, 0),
    }), M.edge);
    const rowsS = [];
    const inset = axis === 'z' || type !== 'gable' ? ov : 0;
    for (const f of [0, 0.5, 1]) {
      const s = f * inset;
      const half = lerp(halfLen0, halfLenW, f);
      rowsS.push(U.map((u) => P(u, yS(0) - eaveH + s * pitch * 0.92 + lift(0, u) * (1 - f), s, half)));
    }
    bag.add(gridGeo(rowsS, { awayDir: V3(0, -1, 0) }), M.soffit);
  };
  for (const sz of [1, -1]) eaveSide('z', sz, halfX(0), type === 'gable' ? A + ovX : A);
  if (endList.length) for (const sx of [1, -1]) eaveSide('x', sx, halfZ(0), B);

  // verge (gable overhang) underside + edge band
  const vergeParts = (sFrom, sTo, xIn, xOut) => {
    const n = 4;
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const under = [], edge = [];
      for (let i = 0; i <= n; i++) {
        const s = lerp(sFrom, sTo, i / n);
        const y = yS(s) + lift(s, 1) * (type === 'gable' ? 1 : 0), z = sz * halfZ(s);
        under.push([V3(sx * xIn, y - eaveH, z), V3(sx * xOut, y - eaveH, z)]);
        edge.push([V3(sx * xOut, y - eaveH, z), V3(sx * xOut, y + 0.005, z)]);
      }
      bag.add(gridGeo(under, { awayDir: V3(0, -1, 0) }), M.soffit);
      bag.add(gridGeo(edge, { awayDir: V3(sx, 0, 0), uvFn: (p, i, j) => [(sz * p.z) / (TILE * 4), j ? 0.97 : 0.03] }), M.edge);
    }
  };
  if (type === 'gable' && sStop == null) vergeParts(0, sMax, A - 0.02, A + ovX);
  if (type === 'irimoya' && sStop == null) vergeParts(sG, sMax, aG - 0.05, aG + verge);

  return {
    yE, yS, halfX, halfZ, sG, sMax, aG, H, lift, U, yRidge: yS(sMax), eaveH, pitch, type, verge, ov,
    corner: (s, sx = 1, sz = 1) => V3(sx * halfX(s), yS(s) + lift(s, 1), sz * halfZ(s)),
  };
}

/** UVs for ridge pieces: sample a flat trough of the tile texture, with thin 'noshi' layer lines along the height. */
function ridgeUV(geo, layer = 0.075) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = 0.085; uv[i * 2 + 1] = pos.getY(i) / (layer * 4); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Ridge (大棟) with layered noshi tiles and onigawara at both ends
function onigawaraGeo(w, h, d) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * 0.5);
  s.quadraticCurveTo(w * 0.52, h * 0.78, w * 0.3, h * 0.8);
  s.quadraticCurveTo(w * 0.18, h * 0.8, w * 0.14, h * 0.9);
  s.quadraticCurveTo(0, h * 1.12, -w * 0.14, h * 0.9);
  s.quadraticCurveTo(-w * 0.18, h * 0.8, -w * 0.3, h * 0.8);
  s.quadraticCurveTo(-w * 0.52, h * 0.78, -w / 2, h * 0.5);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -d / 2);
  boxUV(g, 0.6);
  // emblem disc
  const disc = cyl(w * 0.2, w * 0.22, 0.05, 10, false);
  disc.rotateX(PI / 2);
  disc.translate(0, h * 0.42, d / 2 + 0.03);
  const disc2 = disc.clone().translate(0, 0, -d - 0.06);
  return merge([g, disc, disc2]);
}

function mainRidge(bag, M, x0, x1, y, w = 0.36, oni = true, scale = 1) {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  bag.add(ridgeUV(xf(cbox(len, 0.16 * scale, w, 0.02), [cx, y + 0.08 * scale, 0])), M.tile);
  bag.add(ridgeUV(xf(cbox(len - 0.06, 0.1 * scale, w * 0.82, 0.015), [cx, y + 0.21 * scale, 0])), M.tile);
  bag.add(ridgeUV(xf(cbox(len - 0.12, 0.09 * scale, w * 0.7, 0.015), [cx, y + 0.3 * scale, 0])), M.tile);
  const top = cyl(0.11 * scale, 0.11 * scale, len - 0.1, 12, false, 1);
  top.rotateZ(PI / 2);
  top.scale(1, 0.8, 1);
  top.translate(cx, y + 0.36 * scale, 0);
  bag.add(ridgeUV(top, 0.5), M.tile);
  if (oni) {
    for (const sx of [-1, 1]) {
      const og = onigawaraGeo(0.62 * scale, 0.62 * scale, 0.14 * scale);
      og.rotateY(PI / 2);
      og.translate(sx > 0 ? x1 + 0.02 : x0 - 0.02, y, 0);
      bag.add(ridgeUV(og, 0.2), M.tile);
    }
  }
}

// small ridge along a polyline (hip ridges / descending ridges)
function smallRidge(bag, M, pts, w = 0.22, h = 0.16, endTile = true) {
  const prof = rectProfile(w, h, 0, 0, h / 2 - 0.03);
  const rUV = (p, i, j, ua) => [0.085, ua / 0.3];
  bag.add(sweep(pts, prof, { capStart: true, capEnd: true, uvFn: rUV }), M.tile);
  // round top roll
  const roll = [];
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * PI; roll.push([Math.cos(a) * w * 0.36, h - 0.03 + Math.sin(a) * w * 0.3]); }
  roll.push([-w * 0.36, h - 0.03]);
  bag.add(sweep(pts, roll, { capStart: true, capEnd: true, uvFn: rUV }), M.tile);
  if (endTile) {
    // round end tile (巴瓦) facing outwards
    const p0 = pts[0], p1 = pts[1];
    const dir = V3().subVectors(p0, p1).normalize();
    const disc = ridgeUV(cyl(w * 0.5, w * 0.5, 0.05, 10, false), 0.5);
    alignY(disc, p0.clone().addScaledVector(dir, 0.0), p0.clone().addScaledVector(dir, 0.06));
    disc.translate(0, h * 0.55, 0);
    bag.add(disc, M.tile, false);
  }
}

// ---------------------------------------------------------------------------
// Wall helpers
// ---------------------------------------------------------------------------
/** Evenly spaced positions between a and b with roughly `step` spacing, including ends. */
function spaced(a, b, step) {
  const n = Math.max(1, Math.round((b - a) / step));
  return Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
}

/** Lattice window (連子窓): frame + vertical bars in front of a dark/paper backing. */
function renjiWindow(bag, M, cx, cy, w, h, z, face = 'z', sgn = 1, backing = null) {
  const parts = [];
  const push = (geo, m) => parts.push([geo, m]);
  const fw = 0.07;
  push(xf(timber(w + fw * 2, fw, 0.08, 'x'), [0, h / 2 + fw / 2, 0.02]), M.frame);
  push(xf(timber(w + fw * 2, fw, 0.1, 'x'), [0, -h / 2 - fw / 2, 0.03]), M.frame);
  push(xf(timber(h, fw, 0.08), [-w / 2 - fw / 2, 0, 0.02]), M.frame);
  push(xf(timber(h, fw, 0.08), [w / 2 + fw / 2, 0, 0.02]), M.frame);
  const nb = Math.max(3, Math.round(w / 0.11));
  for (let i = 1; i < nb; i++) push(xf(box(0.035, h, 0.035), [-w / 2 + (i * w) / nb, 0, 0.03]), M.frame);
  push(xf(box(w, h, 0.02), [0, 0, -0.01]), backing || M.shoji);
  for (const [geo, m] of parts) {
    if (face === 'z') { if (sgn < 0) geo.rotateY(PI); geo.translate(cx, cy, z); }
    else { geo.rotateY(sgn * PI / 2); geo.translate(z, cy, cx); }
    bag.add(geo, m, false);
  }
}

// ---------------------------------------------------------------------------
// 1. 茅葺き民家
// ---------------------------------------------------------------------------
export function createThatchedHouse(opts = {}) {
  const { seed = 1, lit = false } = opts;
  const r = rng(seed * 7919 + 13);
  const bag = new Bag();
  const M = {
    thatch: thatchMat(), thatchEdge: thatchEdgeMat(), soffit: getMat('barkDark'), frame: getMat('woodDark'),
    wood: getMat('wood'), plaster: getMat('plaster'), shoji: shojiMat(lit), stone: getMat('stone'),
  };
  const A = 4.55 + (r() - 0.5) * 0.3;
  const B = 3.15 + (r() - 0.5) * 0.2;
  const floorY = 0.55, yW = 3.0;
  const ov = 1.05;

  // --- stone footing + sill
  bag.add(xf(cbox(2 * A + 0.24, 0.36, 2 * B + 0.24, 0.04, 1.1), [0, 0.18, 0]), M.stone);
  bag.add(xf(timber(2 * A + 0.1, 0.2, 0.2, 'x'), [0, 0.46, B - 0.02]), M.frame);
  bag.add(xf(timber(2 * A + 0.1, 0.2, 0.2, 'x'), [0, 0.46, -B + 0.02]), M.frame);
  bag.add(xf(timber(2 * B, 0.2, 0.2, 'z'), [A - 0.02, 0.46, 0]), M.frame);
  bag.add(xf(timber(2 * B, 0.2, 0.2, 'z'), [-A + 0.02, 0.46, 0]), M.frame);

  // --- walls (plaster slabs, split around the entrance)
  const wallH = yW - floorY;
  const wy = floorY + wallH / 2;
  const e0 = -A + 0.38, e1 = e0 + 1.95, eTop = 2.28;
  const slab = (x0, x1, y0, y1, z) => bag.add(xf(box(x1 - x0, y1 - y0, 0.14, 1.2), [(x0 + x1) / 2, (y0 + y1) / 2, z]), M.plaster);
  slab(-A, e0, floorY, yW, B - 0.07);
  slab(e0, e1, eTop, yW, B - 0.07);
  slab(e1, A, floorY, yW, B - 0.07);
  slab(-A, A, floorY, yW, -B + 0.07);
  bag.add(xf(box(0.14, wallH, 2 * B, 1.2), [A - 0.07, wy, 0]), M.plaster);
  bag.add(xf(box(0.14, wallH, 2 * B, 1.2), [-A + 0.07, wy, 0]), M.plaster);
  // interior darkness behind the entrance
  bag.add(xf(box(e1 - e0, eTop - 0.3, 0.1), [(e0 + e1) / 2, (eTop + 0.3) / 2, B - 1.3]), M.soffit);
  bag.add(xf(box(0.1, eTop - 0.3, 1.2), [e0 + 0.05, (eTop + 0.3) / 2, B - 0.7]), M.soffit);
  bag.add(xf(box(0.1, eTop - 0.3, 1.2), [e1 - 0.05, (eTop + 0.3) / 2, B - 0.7]), M.soffit);
  bag.add(xf(box(e1 - e0, 0.1, 1.2), [(e0 + e1) / 2, eTop + 0.05, B - 0.7]), M.soffit);
  bag.add(xf(box(e1 - e0, 0.06, 1.25), [(e0 + e1) / 2, 0.33, B - 0.65]), M.stone);

  // --- timber frame
  const post = (x, z, h = wallH, s = 0.17) => bag.add(xf(timber(h, s, s), [x, floorY + h / 2, z]), M.frame);
  const beamX = (x0, x1, y, z, hh = 0.14, d = 0.17) => bag.add(xf(timber(x1 - x0, hh, d, 'x'), [(x0 + x1) / 2, y, z]), M.frame);
  const beamZ = (z0, z1, y, x, hh = 0.14, d = 0.17) => bag.add(xf(timber(z1 - z0, d, hh, 'z'), [x, y, (z0 + z1) / 2]), M.frame);
  const zF = B - 0.045, zBk = -B + 0.045, xR = A - 0.045, xL = -A + 0.045;
  // corner posts
  for (const x of [xL, xR]) for (const z of [zF, zBk]) post(x, z, wallH, 0.2);
  // front posts
  for (const x of [e0, e1]) post(x, zF);
  const frontPosts = spaced(e1, xR, 1.85).slice(1, -1);
  for (const x of frontPosts) post(x, zF);
  for (const x of spaced(xL, xR, 1.82).slice(1, -1)) post(x, zBk);
  for (const z of spaced(zBk, zF, 1.75).slice(1, -1)) { post(xL, z); post(xR, z); }
  // horizontal members
  beamX(-A - 0.02, A + 0.02, yW - 0.1, zF, 0.22, 0.19); // top plate
  beamX(-A - 0.02, A + 0.02, yW - 0.1, zBk, 0.22, 0.19);
  beamZ(-B, B, yW - 0.1, xL, 0.22, 0.19);
  beamZ(-B, B, yW - 0.1, xR, 0.22, 0.19);
  beamX(-A, A, eTop + 0.07, zF, 0.15, 0.18); // head beam (鴨居)
  beamX(-A, A, 2.2, zBk, 0.12, 0.17);
  beamZ(-B, B, 2.2, xL, 0.12, 0.17);
  beamZ(-B, B, 2.2, xR, 0.12, 0.17);
  beamX(-A, A, 1.35, zBk, 0.1, 0.165); // nuki
  beamZ(-B, B, 1.35, xL, 0.1, 0.165);
  beamZ(-B, B, 1.35, xR, 0.1, 0.165);
  beamX(-A, e0, 1.35, zF, 0.1, 0.165);

  // --- entrance door (板戸, half open) + lintel
  const dW = (e1 - e0) / 2 + 0.05;
  const door = cbox(dW, eTop - 0.35, 0.05, 0.012);
  bag.add(xf(door, [e0 + dW / 2 + 0.02, 0.35 + (eTop - 0.35) / 2, B + 0.03]), M.wood);
  for (let i = 0; i < 4; i++) bag.add(xf(box(dW - 0.04, 0.05, 0.03), [e0 + dW / 2 + 0.02, 0.6 + i * 0.52, B + 0.065]), M.frame, false);
  bag.add(xf(timber(e1 - e0 + 0.2, 0.08, 0.12, 'x'), [(e0 + e1) / 2, 0.3, B + 0.02]), M.frame);
  // stepping stone at entrance
  bag.add(xf(cbox(1.3, 0.22, 0.6, 0.05), [(e0 + e1) / 2 + 0.2, 0.11, B + 0.55]), M.stone);

  // --- shoji along the engawa + tobukuro
  const s0 = e1 + 0.12, s1 = A - 0.12;
  const nS = Math.round((s1 - s0) / 0.92);
  const sw = (s1 - s0) / nS;
  for (let i = 0; i < nS; i++) {
    const g = new THREE.PlaneGeometry(sw - 0.01, eTop - floorY - 0.02);
    g.translate(s0 + sw * (i + 0.5), (floorY + eTop) / 2, B + 0.012 + (i % 2) * 0.025);
    bag.add(g, M.shoji, false);
  }
  // engawa deck
  const dx0 = e1 + 0.04, dx1 = A + 0.18, dz = 0.95;
  bag.add(xf(timber(dx1 - dx0, 0.07, dz, 'x', 0.01), [(dx0 + dx1) / 2, floorY - 0.035, B + dz / 2]), M.wood);
  bag.add(xf(timber(dx1 - dx0 + 0.04, 0.12, 0.12, 'x'), [(dx0 + dx1) / 2, floorY - 0.1, B + dz - 0.04]), M.frame);
  for (const x of spaced(dx0 + 0.1, dx1 - 0.1, 1.8)) {
    bag.add(xf(timber(floorY - 0.2, 0.1, 0.1), [x, 0.12 + (floorY - 0.2) / 2, B + dz - 0.08]), M.frame);
    bag.add(xf(cbox(0.26, 0.14, 0.26, 0.04), [x, 0.07, B + dz - 0.08]), M.stone);
  }
  // kutsunugi-ishi (step stone)
  bag.add(xf(cbox(0.9, 0.28, 0.55, 0.06), [(dx0 + dx1) / 2 + r() * 0.6, 0.14, B + dz + 0.35]), M.stone);
  // tobukuro (shutter box) at the end of the veranda
  const tbx = A + 0.1;
  bag.add(xf(cbox(0.95, eTop - floorY + 0.1, 0.32, 0.015), [tbx + 0.4, (floorY + eTop + 0.1) / 2, B + dz - 0.2]), M.wood);
  for (let i = 0; i < 5; i++) bag.add(xf(box(0.03, eTop - floorY, 0.03), [tbx + 0.02 + i * 0.19, (floorY + eTop) / 2, B + dz - 0.03]), M.frame, false);

  // --- windows
  renjiWindow(bag, M, 1.6, 1.75, 1.3, 0.75, -B - 0.01, 'z', -1, M.frame);
  renjiWindow(bag, M, -1.9, 1.75, 1.0, 0.7, -B - 0.01, 'z', -1, M.frame);
  renjiWindow(bag, M, -0.8, 1.7, 1.2, 0.8, -A - 0.01, 'x', -1);
  renjiWindow(bag, M, 0.6, 1.7, 1.2, 0.8, A + 0.01, 'x', 1);

  // --- rafters under the eaves (long sides)
  const yEB = 2.5 + r() * 0.08;
  for (const sz of [1, -1]) {
    for (const x of spaced(-A + 0.3, A - 0.3, 0.62)) {
      const p0 = V3(x, yW - 0.05, sz * (B - 0.05));
      const p1 = V3(x * 1.04, yEB + 0.06, sz * (B + ov - 0.12));
      bag.add(rodBetween(p0, p1, 0.035, 0.035, 5, true), M.frame, false);
    }
  }

  // --- the roof
  const yTop = 7.45 + r() * 0.2;
  const R = thatchRoof(bag, M, {
    A, B, ov, yW, yEB, thick: 0.74, yTop, yg: 5.3 + r() * 0.2, irimoya: true, seed,
  });

  // gable triangles (smoke vents) at both ends
  for (const sx of [-1, 1]) {
    const x = sx * (R.aG + 0.01 - (0.35) * 0.1);
    const yb = R.yg + 0.35, yt = yTop - 0.3;
    const half = R.bG * (1 - 1.5 / (B + ov)) * 0.78;
    const tri = new THREE.BufferGeometry();
    const pts = [V3(x, yb, -half), V3(x, yb, half), V3(x, yt, 0)];
    tri.setFromPoints(pts);
    tri.computeVertexNormals();
    if (tri.attributes.normal.getX(0) * sx < 0) { tri.setFromPoints([pts[1], pts[0], pts[2]]); tri.computeVertexNormals(); }
    boxUV(tri, 1);
    bag.add(tri, M.soffit, false);
    const nb = 5;
    for (let i = 1; i < nb; i++) {
      const z = -half + (i * 2 * half) / nb;
      const top = lerp(yt, yb, Math.abs(z) / half);
      bag.add(xf(timber(top - yb, 0.05, 0.05), [x + sx * 0.03, (yb + top) / 2, z]), M.wood, false);
    }
    bag.add(xf(timber(2 * half, 0.1, 0.1, 'z'), [x + sx * 0.03, yb, 0]), M.frame, false);
  }

  // ridge: bark-covered log + bamboo holders + karasu-odori crosses
  const yRidge = yTop + 0.1;
  const rl = 2 * R.aTop + 0.5;
  const log = cyl(0.34, 0.34, rl, 14, false, 1);
  log.rotateZ(PI / 2);
  log.scale(1, 0.82, 1);
  log.translate(0, yRidge, 0);
  bag.add(log, M.frame);
  for (const sz of [-1, 1]) {
    const pole = cyl(0.05, 0.05, rl + 0.2, 6, false, 1);
    pole.rotateZ(PI / 2);
    pole.translate(0, yRidge - 0.12, sz * 0.36);
    bag.add(pole, M.thatchEdge, false);
  }
  for (const x of spaced(-rl / 2 + 0.2, rl / 2 - 0.2, 0.55)) {
    const band = cyl(0.36, 0.36, 0.08, 14, true, 1);
    band.rotateZ(PI / 2);
    band.scale(1, 0.84, 1);
    band.translate(x, yRidge, 0);
    bag.add(band, M.thatchEdge, false);
  }
  const nx = 5 + Math.round(r());
  for (const x of spaced(-rl / 2 + 0.55, rl / 2 - 0.55, (rl - 1.1) / nx)) {
    const yc = yRidge + 0.36;
    for (const sz of [-1, 1]) {
      const a = 0.6;
      const top = V3(x, yc + Math.cos(a) * 0.5, -sz * Math.sin(a) * 0.5);
      const bot = V3(x, yc - Math.cos(a) * 0.78, sz * Math.sin(a) * 0.78);
      bag.add(rodBetween(bot, top, 0.07, 0.06, 7, false), M.soffit);
    }
  }
  const group = bag.build();
  group.name = 'ThatchedHouse';
  group.userData.collider = { type: 'box', w: 2 * A + 0.4, d: 2 * B + 0.4 + 1.0 };
  return group;
}

// ---------------------------------------------------------------------------
// Facade helpers
// ---------------------------------------------------------------------------
const FACE = {
  '+z': { a: 0, n: [0, 1], t: [1, 0] },
  '+x': { a: PI / 2, n: [1, 0], t: [0, -1] },
  '-z': { a: PI, n: [0, -1], t: [-1, 0] },
  '-x': { a: -PI / 2, n: [-1, 0], t: [0, 1] },
};
/** Move a geometry built facing +Z (origin at its center) onto a wall face. u = horizontal offset along the face (left->right seen from outside). */
function faceXf(geo, face, u, y, off) {
  const f = FACE[face];
  geo.rotateY(f.a);
  geo.translate(f.n[0] * off + f.t[0] * u, y, f.n[1] * off + f.t[1] * u);
  return geo;
}

/** Aluminium sash window (two sliding panes), optional grille and sill. Local: faces +Z, back at z=0. */
function sashWindow(bag, M, face, u, y, off, w, h, opt = {}) {
  const { grille = false, glass = M.glass, sill = true } = opt;
  const fr = 0.05;
  const parts = [
    [box(w + fr * 2, fr, 0.08), [0, h / 2 + fr / 2, 0.04], M.metal],
    [box(w + fr * 2, fr, 0.08), [0, -h / 2 - fr / 2, 0.04], M.metal],
    [box(fr, h, 0.08), [-w / 2 - fr / 2, 0, 0.04], M.metal],
    [box(fr, h, 0.08), [w / 2 + fr / 2, 0, 0.04], M.metal],
    [box(0.04, h, 0.06), [0, 0, 0.05], M.metal],
    [new THREE.PlaneGeometry(w / 2, h), [-w / 4, 0, 0.025], glass],
    [new THREE.PlaneGeometry(w / 2, h), [w / 4, 0, 0.045], glass],
  ];
  if (sill) parts.push([box(w + 0.22, 0.05, 0.14), [0, -h / 2 - fr - 0.02, 0.07], M.metal]);
  if (grille) {
    const n = Math.max(3, Math.round(w / 0.2));
    for (let i = 0; i <= n; i++) parts.push([box(0.022, h + 0.04, 0.022), [-w / 2 + (i * w) / n, 0, 0.13], M.metal]);
    parts.push([box(w + 0.08, 0.03, 0.03), [0, h / 2 - 0.02, 0.13], M.metal]);
    parts.push([box(w + 0.08, 0.03, 0.03), [0, -h / 2 + 0.02, 0.13], M.metal]);
  }
  for (const [g, p, m] of parts) {
    g.translate(p[0], p[1], p[2]);
    faceXf(g, face, u, y, off);
    bag.add(g, m, false);
  }
}

/** Kawara tone variants (いぶし銀 / charcoal / 石州 red-brown). */
function kawaraVariant(k) {
  const base = kawaraMat();
  if (k === 0) return base;
  const def = k === 1
    ? { key: 'rural.kawaraCharcoal', color: 0x4a4d53, roughness: 0.32, metalness: 0.2 }
    : { key: 'rural.kawaraSekishu', color: 0xa45a3a, roughness: 0.38, metalness: 0.08 };
  return mat(def.key, {
    color: def.color, roughness: def.roughness, metalness: def.metalness, map: base.map, normalMap: base.normalMap,
    normalScale: base.normalScale.clone(),
  });
}

// ---------------------------------------------------------------------------
// 2. 瓦屋根の二階建て民家
// ---------------------------------------------------------------------------
export function createTileHouse(opts = {}) {
  const { seed = 1, lit = false } = opts;
  const r = rng(seed * 4481 + 91);
  const style = r() < 0.5 ? 0 : 1;
  const tone = r() < 0.7 ? 0 : r() < 0.6 ? 1 : 2;
  const bag = new Bag();
  const M = {
    tile: kawaraVariant(tone), edge: kawaraEdgeMat(), soffit: getMat('wood'), frame: getMat('woodDark'),
    plaster: getMat('plaster'), base: getMat('concrete'), metal: getMat('metal'), glass: lit ? getMat('windowGlow') : getMat('glass'),
  };
  const A1 = 4.7 + r() * 0.6, B1 = 3.5 + r() * 0.5;
  const inset = 0.85 + r() * 0.15;
  const A2 = A1 - inset, B2 = B1 - inset;
  const baseH = 0.45, yW1 = 3.05 + r() * 0.1, yW2 = yW1 + 2.75;

  // foundation + wall blocks
  bag.add(xf(cbox(2 * A1 + 0.08, baseH, 2 * B1 + 0.08, 0.02, 1.5), [0, baseH / 2, 0]), M.base);
  const wall1 = style === 0 ? M.frame : M.plaster;
  bag.add(xf(box(2 * A1, yW1 - baseH, 2 * B1, 1.0), [0, (yW1 + baseH) / 2, 0]), wall1);
  bag.add(xf(box(2 * A2, yW2 - yW1 + 0.4, 2 * B2, 1.2), [0, (yW2 + yW1 - 0.4) / 2, 0]), M.plaster);
  // trims: water-cut strip, corner boards, 1F lower wainscot / 2F timbers
  bag.add(xf(cbox(2 * A1 + 0.1, 0.06, 2 * B1 + 0.1, 0.01), [0, baseH + 0.03, 0]), M.metal, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bag.add(xf(timber(yW1 - baseH, 0.14, 0.14), [sx * (A1 - 0.05), (yW1 + baseH) / 2, sz * (B1 - 0.05)]), M.frame);
    bag.add(xf(timber(yW2 - yW1 + 0.2, 0.14, 0.14), [sx * (A2 - 0.05), (yW2 + yW1 + 0.2) / 2, sz * (B2 - 0.05)]), M.frame);
  }
  if (style === 1) {
    // 腰板 (wooden wainscot) on the plaster 1F
    bag.add(xf(box(2 * A1 + 0.04, 0.9, 2 * B1 + 0.04, 1.0), [0, baseH + 0.45, 0]), M.frame);
  }
  // 2F timber frame: floor beam + mid rail + posts
  bag.add(xf(box(2 * A2 + 0.06, 0.16, 2 * B2 + 0.06), [0, yW1 + 0.95, 0]), M.frame);
  bag.add(xf(box(2 * A2 + 0.06, 0.2, 2 * B2 + 0.06), [0, yW2 - 0.12, 0]), M.frame);
  for (const x of spaced(-A2, A2, 1.9).slice(1, -1)) for (const sz of [-1, 1]) bag.add(xf(box(0.12, yW2 - yW1 - 0.9, 0.06), [x, (yW1 + 0.95 + yW2) / 2, sz * (B2 + 0.02)]), M.frame, false);
  for (const z of spaced(-B2, B2, 1.9).slice(1, -1)) for (const sx of [-1, 1]) bag.add(xf(box(0.06, yW2 - yW1 - 0.9, 0.12), [sx * (A2 + 0.02), (yW1 + 0.95 + yW2) / 2, z]), M.frame, false);

  // entrance: sliding lattice doors + transom + porch
  const eu = -A1 + 1.55 + r() * 0.3;
  const dW = 0.9, dH = 1.95, dY = baseH + 0.15 + dH / 2;
  const doorParts = [];
  for (const k of [-1, 1]) {
    const cx = k * dW * 0.5 - k * 0.01;
    const dz = k < 0 ? 0.04 : 0.09;
    doorParts.push([box(dW, 0.07, 0.05), [cx, dH / 2 - 0.035, dz], M.soffit]);
    doorParts.push([box(dW, 0.1, 0.05), [cx, -dH / 2 + 0.05, dz], M.soffit]);
    doorParts.push([box(0.06, dH, 0.05), [cx - dW / 2 + 0.03, 0, dz], M.soffit]);
    doorParts.push([box(0.06, dH, 0.05), [cx + dW / 2 - 0.03, 0, dz], M.soffit]);
    doorParts.push([box(dW - 0.1, dH - 0.16, 0.01), [cx, 0.015, dz - 0.012], M.glass]);
    for (let i = 1; i < 7; i++) doorParts.push([box(0.022, dH - 0.16, 0.022), [cx - dW / 2 + 0.05 + (i * (dW - 0.1)) / 7, 0.015, dz + 0.012], M.soffit]);
    doorParts.push([box(dW - 0.1, 0.022, 0.022), [cx, -0.35, dz + 0.012], M.soffit]);
  }
  doorParts.push([box(2 * dW + 0.24, 0.12, 0.1), [0, dH / 2 + 0.06, 0.05], M.frame]);
  doorParts.push([box(0.12, dH + 0.1, 0.1), [-dW - 0.06, 0.05, 0.05], M.frame]);
  doorParts.push([box(0.12, dH + 0.1, 0.1), [dW + 0.06, 0.05, 0.05], M.frame]);
  doorParts.push([box(2 * dW, 0.4, 0.02), [0, dH / 2 + 0.34, 0.03], M.glass]);
  doorParts.push([box(2 * dW + 0.24, 0.08, 0.1), [0, dH / 2 + 0.58, 0.05], M.frame]);
  for (const [g, p, m] of doorParts) { g.translate(p[0], p[1], p[2]); faceXf(g, '+z', eu, dY, B1); bag.add(g, m, false); }
  bag.add(xf(cbox(2.5, 0.16, 1.1, 0.02), [eu, 0.08, B1 + 0.55]), M.base);
  bag.add(xf(cbox(1.2, 0.14, 0.5, 0.03), [eu + 0.1, 0.07, B1 + 1.4]), M.base);

  // windows
  const W = (face, u, y, off, w, h, o2) => sashWindow(bag, M, face, u, y, off, w, h, o2);
  const wy1 = baseH + 1.35, wy2 = yW1 + 1.65;
  W('+z', eu + 2.3, wy1, B1, 1.65, 1.1, { grille: true });
  W('+z', eu + 4.5, wy1, B1, 1.65, 1.1);
  W('-z', -1.8, wy1 + 0.15, B1, 1.2, 0.8, { grille: true });
  W('-z', 1.4, wy1, B1, 1.65, 1.1);
  W('+x', 0.2, wy1, A1, 1.65, 1.1);
  W('-x', -0.6, wy1 + 0.2, A1, 0.9, 0.7, { grille: true });
  W('+z', -1.5, wy2, B2, 1.65, 1.0);
  W('+z', 1.6, wy2, B2, 1.65, 1.0);
  W('-z', 0.4, wy2, B2, 1.65, 1.0);
  W('+x', 0, wy2, A2, 1.2, 0.9);
  W('-x', 0, wy2, A2, 1.2, 0.9);

  // roofs
  const skirt = kawaraRoof(bag, M, { A: A1, B: B1, yW: yW1, ov: 0.72, pitch: 0.42, eaveH: 0.2, type: 'hip', sStop: 0.72 + inset, rows: 3, sori: 0.1 });
  const main = kawaraRoof(bag, M, { A: A2, B: B2, yW: yW2, ov: 0.9, pitch: 0.52, eaveH: 0.24, type: 'irimoya', gFrac: 0.48 + r() * 0.08, verge: 0.32, rows: 6, sori: 0.2 });
  // skirt hips
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pts = [0, 0.3, 0.72 + inset].map((s) => skirt.corner(s, sx, sz));
    smallRidge(bag, M, pts, 0.18, 0.12, true);
  }
  // main hips (隅棟) + descending ridges (降り棟)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pts = [0, 0.35, main.sG * 0.6, main.sG].map((s) => main.corner(s, sx, sz));
    smallRidge(bag, M, pts, 0.22, 0.16, true);
    const d = [main.sG, lerp(main.sG, main.sMax, 0.5), main.sMax - 0.12].map((s) => V3(sx * (main.aG + main.verge * 0.45), main.yS(s) + 0.01, sz * main.halfZ(s)));
    smallRidge(bag, M, d, 0.18, 0.13, true);
  }
  const rx = main.aG + main.verge + 0.05;
  mainRidge(bag, M, -rx, rx, main.yRidge - 0.04, 0.38, true, 1.05);
  // gable walls (妻) + bargeboards (破風) + gegyo
  for (const sx of [-1, 1]) {
    const x = sx * (main.aG - 0.04);
    const zb = main.halfZ(main.sG);
    const yb = main.yS(main.sG) - 0.02, ya = main.yRidge - main.eaveH;
    const tri = new THREE.BufferGeometry().setFromPoints(sx > 0 ? [V3(x, yb, zb), V3(x, yb, -zb), V3(x, ya, 0)] : [V3(x, yb, -zb), V3(x, yb, zb), V3(x, ya, 0)]);
    tri.computeVertexNormals();
    boxUV(tri, 1.2);
    bag.add(tri, M.plaster);
    bag.add(xf(timber(2 * zb, 0.14, 0.1, 'z'), [x + sx * 0.04, yb + 0.06, 0]), M.frame);
    for (const k of [-0.5, 0, 0.5]) {
      const top = lerp(ya, yb, Math.abs(k));
      bag.add(xf(timber(top - yb - 0.1, 0.07, 0.06), [x + sx * 0.03, (yb + top) / 2, k * zb]), M.frame, false);
    }
    for (const sz of [-1, 1]) {
      const pts = [main.sG, lerp(main.sG, main.sMax, 0.33), lerp(main.sG, main.sMax, 0.66), main.sMax].map((s) => V3(sx * (main.aG + main.verge + 0.035), main.yS(s) - main.eaveH * 0.5 - 0.04, sz * Math.max(0.0, main.halfZ(s) - 0.0)));
      bag.add(sweep(pts, rectProfile(0.07, main.eaveH + 0.16, 0.012), { capStart: true, capEnd: true }), M.frame);
    }
    const gg = new THREE.CylinderGeometry(0.26, 0.2, 0.06, 6);
    gg.rotateZ(PI / 2);
    gg.scale(1, 1.25, 1);
    gg.translate(sx * (main.aG + main.verge + 0.07), main.yRidge - main.eaveH - 0.3, 0);
    boxUV(gg, 0.5);
    bag.add(gg, M.frame, false);
  }
  // rafters under the main eaves (long sides)
  for (const sz of [-1, 1]) {
    for (const x of spaced(-A2 - 0.6, A2 + 0.6, 0.5)) {
      const y0 = main.yS(0) - main.eaveH;
      const p0 = V3(x, yW2 - 0.03, sz * (B2 - 0.02));
      const p1 = V3(x, y0 + 0.02 + main.lift(0, x / (A2 + main.ov)) * 0.9, sz * (B2 + main.ov - 0.1));
      bag.add(alignY(box(0.06, p0.distanceTo(p1), 0.08), p0.add(V3(0, -0.05, 0)), p1.add(V3(0, -0.05, 0)), V3(0, 1, 0)), M.frame, false);
    }
  }

  const group = bag.build();
  group.name = 'TileHouse';
  group.userData.collider = { type: 'box', w: 2 * A1 + 0.2, d: 2 * B1 + 0.2 };
  return group;
}

// ---------------------------------------------------------------------------
// 3. 蔵 (storehouse) with namako-kabe
// ---------------------------------------------------------------------------
function namakoTex() {
  return canvasTexture('rural.tex.namako', 256, 256, (g, w, h) => {
    const r = r32(21);
    const n = 4, sp = w / n;
    g.fillStyle = '#3a3d43';
    g.fillRect(0, 0, w, h);
    // per-tile tone (tiles are diamonds between the diagonal joints)
    for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) {
      const cx = (i + 0.5) * sp, cy = (j + 0.5) * sp;
      const tone = 50 + r() * 16;
      g.fillStyle = `rgb(${tone},${tone + 3},${tone + 8})`;
      g.beginPath();
      g.moveTo(cx, cy - sp / 2); g.lineTo(cx + sp / 2, cy); g.lineTo(cx, cy + sp / 2); g.lineTo(cx - sp / 2, cy);
      g.closePath(); g.fill();
      g.fillStyle = `rgb(${tone - 8},${tone - 6},${tone - 2})`;
      g.beginPath();
      g.moveTo(cx, cy + sp / 2); g.lineTo(cx + sp / 2, cy + sp); g.lineTo(cx, cy + 1.5 * sp); g.lineTo(cx - sp / 2, cy + sp);
      g.closePath(); g.fill();
    }
    // raised white plaster joints (namako)
    const drawDiag = (lw, col) => {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.lineCap = 'round';
      for (let k = -n; k <= 2 * n; k++) {
        g.beginPath(); g.moveTo(k * sp, 0); g.lineTo(k * sp + h, h); g.stroke();
        g.beginPath(); g.moveTo(k * sp, 0); g.lineTo(k * sp - h, h); g.stroke();
      }
    };
    drawDiag(17, 'rgba(40,40,40,0.5)');
    drawDiag(13, '#cfccc4');
    drawDiag(7, '#f1eee7');
  });
}
function namakoNormal() {
  const sp = 1 / 4;
  return normalMapTexture('rural.nrm.namako', 256, 256, (u, v) => {
    const f1 = ((u + v) / sp) % 1, f2 = (((u - v) / sp) % 1 + 1) % 1;
    const d = Math.min(f1, 1 - f1, f2, 1 - f2) * sp * Math.SQRT1_2; // uv distance to a joint
    const w = 0.022;
    return d < w ? Math.sqrt(1 - (d / w) * (d / w)) * 0.012 : 0;
  }, 1.0);
}
function crestTex() {
  return canvasTexture('rural.tex.kuraCrest', 128, 128, (g, w, h) => {
    g.fillStyle = '#f1ede4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#26272b';
    g.lineWidth = 9;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, PI * 2); g.stroke();
    g.fillStyle = '#26272b';
    g.font = `bold 70px ${FONT_MIN}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('水', w / 2, h / 2 + 3);
  });
}

export function createKura(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 733 + 17);
  const bag = new Bag();
  const M = {
    tile: kawaraMat(), edge: kawaraEdgeMat(), soffit: getMat('plaster'), plaster: getMat('plaster'),
    namako: mat('rural.namako', { color: 0xffffff, roughness: 0.75, map: namakoTex(), normalMap: namakoNormal(), normalScale: new THREE.Vector2(1.5, 1.5) }),
    stone: getMat('stone'), frame: getMat('woodDark'), iron: getMat('metalDark'),
  };
  const crest = mat('rural.kuraCrest', { color: 0xffffff, roughness: 0.9, map: crestTex() });
  const A = 2.45 + r() * 0.4, B = 2.0 + r() * 0.3;
  const baseH = 0.5, yW = 5.1 + r() * 0.3, nkTop = baseH + 1.35 + r() * 0.3;

  // stone base (two courses)
  bag.add(xf(cbox(2 * A + 0.3, baseH * 0.55, 2 * B + 0.3, 0.05, 1.1), [0, baseH * 0.275, 0]), M.stone);
  bag.add(xf(cbox(2 * A + 0.16, baseH * 0.5, 2 * B + 0.16, 0.04, 1.1), [0, baseH * 0.75, 0]), M.stone);
  // walls
  bag.add(xf(box(2 * A, yW - baseH, 2 * B, 1.2), [0, (yW + baseH) / 2, 0]), M.plaster);
  const nk = box(2 * A + 0.06, nkTop - baseH, 2 * B + 0.06, 0.9);
  bag.add(xf(nk, [0, (nkTop + baseH) / 2, 0]), M.namako);
  // 水切り (tile ledge) above the namako
  bag.add(xf(cbox(2 * A + 0.26, 0.08, 2 * B + 0.26, 0.02), [0, nkTop + 0.04, 0]), M.tile);
  bag.add(xf(cbox(2 * A + 0.14, 0.06, 2 * B + 0.14, 0.02), [0, nkTop + 0.11, 0]), M.plaster);
  // wall-top cornice (鉢巻)
  bag.add(xf(cbox(2 * A + 0.14, 0.3, 2 * B + 0.14, 0.03, 1.2), [0, yW - 0.35, 0]), M.plaster);
  bag.add(xf(cbox(2 * A + 0.3, 0.22, 2 * B + 0.3, 0.03, 1.2), [0, yW - 0.1, 0]), M.plaster);
  // roof
  const roof = kawaraRoof(bag, M, { A, B: B + 0.15, yW: yW + 0.02, ov: 0.5, ovX: 0.42, pitch: 0.6, eaveH: 0.34, type: 'gable', sori: 0.05, curve: 0.08, rows: 5 });
  mainRidge(bag, M, -(A + 0.46), A + 0.46, roof.yRidge - 0.05, 0.42, true, 1.05);
  // gable wall triangles + crest
  for (const sx of [-1, 1]) {
    const x = sx * A;
    const yA = roof.yRidge - roof.eaveH - 0.02;
    const zb = B + 0.15;
    const tri = new THREE.BufferGeometry().setFromPoints(sx > 0 ? [V3(x, yW, zb), V3(x, yW, -zb), V3(x, yA, 0)] : [V3(x, yW, -zb), V3(x, yW, zb), V3(x, yA, 0)]);
    tri.computeVertexNormals();
    boxUV(tri, 1.2);
    bag.add(tri, M.plaster);
    const disc = cyl(0.36, 0.36, 0.05, 20, false);
    disc.rotateZ(-sx * PI / 2);
    disc.rotateX(PI / 2);
    // map crest on the cap: use planar uv from y/z
    const pos = disc.attributes.position, uv = disc.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + (sx * pos.getZ(i)) / 0.8 * -1 * -1, 0.5 + pos.getY(i) / 0.8);
    disc.translate(x + sx * 0.03, yW + (yA - yW) * 0.42, 0);
    bag.add(disc, crest, false);
  }
  // door: stepped frames + open heavy doors + inner lattice door + canopy + steps
  const dW = 1.25, dH = 2.05, dz = B;
  const frameStep = (w, h, t, z) => {
    bag.add(xf(cbox(w, 0.16, t, 0.02), [0, baseH + h + 0.08, dz + z]), M.plaster);
    bag.add(xf(cbox(0.16, h + 0.16, t, 0.02), [-w / 2 + 0.08, baseH + (h + 0.16) / 2, dz + z]), M.plaster);
    bag.add(xf(cbox(0.16, h + 0.16, t, 0.02), [w / 2 - 0.08, baseH + (h + 0.16) / 2, dz + z]), M.plaster);
  };
  frameStep(dW + 0.62, dH + 0.22, 0.12, 0.06);
  frameStep(dW + 0.36, dH + 0.1, 0.22, 0.11);
  bag.add(xf(box(dW, dH, 0.1), [0, baseH + dH / 2, dz - 0.02]), M.frame);
  for (let i = 1; i < 8; i++) bag.add(xf(box(0.045, dH, 0.05), [-dW / 2 + (i * dW) / 8, baseH + dH / 2, dz + 0.05]), M.frame, false);
  for (const y of [0.5, 1.4]) bag.add(xf(box(dW, 0.06, 0.05), [0, baseH + y, dz + 0.08]), M.frame, false);
  for (const k of [-1, 1]) {
    // thick plaster door leaf (観音開き), swung open ~150deg, stepped inner face
    const leaf = merge([cbox(dW / 2, dH, 0.16, 0.02), xf(cbox(dW / 2 - 0.14, dH - 0.14, 0.07, 0.015), [0, 0, 0.1]), xf(cbox(dW / 2 - 0.28, dH - 0.28, 0.06, 0.015), [0, 0, 0.15])]);
    leaf.translate(k * dW / 4, 0, 0);
    leaf.rotateY(-k * 0.5);
    leaf.translate(k * (dW / 2 + 0.33), baseH + dH / 2 + 0.02, dz + 0.3);
    bag.add(leaf, M.plaster);
  }
  // canopy (庇) over the door
  const cy0 = baseH + dH + 0.55;
  const can = kawaraCanopy(2.3, 0.85, 0.35);
  can.forEach(([g, key]) => { g.translate(0, cy0, dz + 0.02); bag.add(g, M[key]); });
  for (const k of [-1, 1]) bag.add(barBetween(V3(k * 0.95, cy0 - 0.85, dz + 0.02), V3(k * 0.95, cy0 - 0.47, dz + 0.62), 0.08, 0.1, V3(0, 0, 1)), M.frame, false);
  bag.add(xf(cbox(2.0, 0.22, 0.55, 0.04), [0, 0.11, dz + 0.45]), M.stone);
  bag.add(xf(cbox(1.6, 0.2, 0.45, 0.04), [0, 0.1, dz + 0.95]), M.stone);
  // small windows with iron bars + open plaster shutters
  const kWin = (face, u, y, off) => {
    const parts = [
      [cbox(1.05, 0.95, 0.22, 0.03), [0, 0, 0.0], M.plaster],
      [box(0.7, 0.6, 0.05), [0, 0, 0.1], M.frame],
    ];
    for (let i = 1; i < 5; i++) parts.push([cyl(0.022, 0.022, 0.62, 6, true), [-0.35 + i * 0.14, 0, 0.16], M.iron]);
    for (const k of [-1, 1]) {
      const sh = cbox(0.5, 0.82, 0.12, 0.02);
      sh.translate(k * 0.25, 0, 0);
      sh.rotateY(-k * 0.3);
      sh.translate(k * 0.54, 0, 0.14);
      parts.push([sh, [0, 0, 0], M.plaster]);
    }
    parts.push([cbox(1.3, 0.1, 0.4, 0.02), [0, 0.55, 0.12], M.tile]);
    for (const [g, p, m] of parts) { g.translate(p[0], p[1], p[2]); faceXf(g, face, u, y, off); bag.add(g, m, m === M.iron ? false : true); }
  };
  kWin('+z', 0, yW - 1.25, B);
  kWin('+x', r() < 0.5 ? -0.4 : 0.4, yW - 1.15, A);
  kWin('-x', 0, yW - 1.15, A);
  kWin('-z', -0.8, yW - 1.25, B);
  // 折れ釘 (plaster hooks) rows
  for (const [face, half, off] of [['+z', A, B], ['-z', A, B], ['+x', B, A], ['-x', B, A]]) {
    for (const u of spaced(-half + 0.5, half - 0.5, 1.0)) {
      for (const y of [nkTop + 1.0, yW - 0.7]) {
        if (face === '+z' && Math.abs(u) < 1.0 && y < 3.5) continue;
        const g = cbox(0.05, 0.05, 0.16, 0.01);
        g.translate(0, 0, 0.08);
        const g2 = cbox(0.05, 0.12, 0.05, 0.01);
        g2.translate(0, 0.04, 0.15);
        for (const gg of [g, g2]) { faceXf(gg, face, u, y, off); bag.add(gg, M.iron, false); }
      }
    }
  }
  const group = bag.build();
  group.name = 'Kura';
  group.userData.collider = { type: 'box', w: 2 * A + 0.4, d: 2 * B + 0.4 };
  return group;
}

/** Small lean-to kawara canopy (door hood): returns [geo, matKey] list; origin at wall top-center of hood. */
function kawaraCanopy(w, d, drop) {
  const out = [];
  const t = 0.12;
  const rows = [];
  const n = 3;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const z = d * (1 - f), y = -drop * (1 - f) + 0.02 * Math.sin(f * PI);
    rows.push([V3(-w / 2, y, z), V3(-w / 6, y, z), V3(w / 6, y, z), V3(w / 2, y, z)]);
  }
  out.push([gridGeo(rows, { awayDir: V3(0, 1, 0.3), uvFn: (p) => [p.x / (TILE * 4), (d - p.z) / (TILE * 4)] }), 'tile']);
  const bot = rows.map((r) => r.map((p) => V3(p.x, p.y - t, p.z)));
  out.push([gridGeo(bot, { awayDir: V3(0, -1, 0) }), 'soffit']);
  out.push([gridGeo([bot[0], rows[0]], { awayDir: V3(0, 0, 1), uvFn: (p) => [p.x / (TILE * 4), (p.y - (-drop - t)) / t * 0.98] }), 'edge']);
  for (const sx of [-1, 1]) {
    const side = rows.map((r, i) => [V3(sx * w / 2, bot[i][0].y, r[0].z), V3(sx * w / 2, r[0].y, r[0].z)]);
    out.push([gridGeo(side, { awayDir: V3(sx, 0, 0) }), 'edge']);
  }
  out.push([xf(cbox(w + 0.1, 0.1, 0.12, 0.02), [0, 0.02, 0.05]), 'tile']);
  return out;
}
