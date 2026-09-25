// Procedural road textures (albedo + normal map) drawn on canvases.
import * as THREE from 'three';

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toTexture(canvas, srgb, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Height canvas -> tangent-space normal map canvas. */
function normalFromHeight(hc, strength = 2.0) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d');
  const img = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const k = (y * w + x) * 4;
      img.data[k] = (nx * 0.5 + 0.5) * 255;
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

const cache = new Map();

/**
 * Asphalt road texture. u (x) = across the road (0..1), v (y) = along (one repeat = `lengthM` meters).
 * opts: { lines: 'white'|'none', center: 'dash'|'solid'|'none', tone: css color, wear: 0..1 }
 */
export function asphaltTextures(opts = {}) {
  const key = 'asphalt:' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const W = 1024, H = 1024;
  const r = rand(opts.seed ?? 3);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const hc = document.createElement('canvas');
  hc.width = W; hc.height = H;
  const hg = hc.getContext('2d');
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, W, H);

  g.fillStyle = opts.tone || '#55565a';
  g.fillRect(0, 0, W, H);
  // large tonal patches
  for (let i = 0; i < 60; i++) {
    const x = r() * W, y = r() * H, s = 40 + r() * 160;
    const l = r() < 0.5 ? 0 : 255;
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    grd.addColorStop(0, `rgba(${l},${l},${l},${0.035 + r() * 0.04})`);
    grd.addColorStop(1, `rgba(${l},${l},${l},0)`);
    g.fillStyle = grd;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  // aggregate speckles (albedo + height): fine and subtle
  for (let i = 0; i < 90000; i++) {
    const x = r() * W, y = r() * H;
    const sz = 0.8 + r() * 1.4;
    const l = r();
    if (l > 0.6) {
      const v = 95 + r() * 55;
      g.fillStyle = `rgba(${v},${v},${v + 3},${0.12 + r() * 0.22})`;
      hg.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.3})`;
    } else {
      const v = 25 + r() * 25;
      g.fillStyle = `rgba(${v},${v},${v},${0.12 + r() * 0.2})`;
      hg.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.25})`;
    }
    g.fillRect(x, y, sz, sz);
    hg.fillRect(x, y, sz, sz);
  }
  // wheel wear lanes (slightly darker, smoother)
  const wear = opts.wear ?? 0.6;
  for (const u of [0.28, 0.4, 0.6, 0.72]) {
    const grd = g.createLinearGradient((u - 0.06) * W, 0, (u + 0.06) * W, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.5, `rgba(20,20,25,${0.16 * wear})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect((u - 0.06) * W, 0, 0.12 * W, H);
  }
  // cracks
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = r() * W, y = r() * H;
    g.strokeStyle = `rgba(15,15,18,${0.35 + r() * 0.3})`;
    hg.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = hg.lineWidth = 1 + r() * 1.5;
    g.beginPath(); hg.beginPath();
    g.moveTo(x, y); hg.moveTo(x, y);
    const n = 4 + Math.floor(r() * 8);
    for (let k = 0; k < n; k++) {
      x += (r() - 0.5) * 50;
      y += (r() - 0.5) * 50;
      g.lineTo(x, y); hg.lineTo(x, y);
    }
    g.stroke(); hg.stroke();
  }
  // patch repairs
  for (let i = 0; i < 5; i++) {
    const x = r() * W * 0.8 + W * 0.1, y = r() * H, w = 60 + r() * 140, h = 50 + r() * 200;
    g.fillStyle = `rgba(${30 + r() * 20},${30 + r() * 20},${34 + r() * 20},0.45)`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(10,10,10,0.35)';
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
  }
  // painted lines
  const paint = (x0, x1, y0, y1, color) => {
    g.fillStyle = color;
    g.fillRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
    hg.fillStyle = 'rgba(255,255,255,0.35)';
    hg.fillRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
    // wear on paint
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(60,60,64,${r() * 0.55})`;
      g.fillRect((x0 + r() * (x1 - x0)) * W, (y0 + r() * (y1 - y0)) * H, 2 + r() * 3, 2 + r() * 3);
    }
  };
  const lineCol = opts.lineColor || 'rgba(236,236,228,0.92)';
  if ((opts.lines ?? 'white') !== 'none') {
    paint(0.035, 0.055, 0, 1, lineCol);
    paint(0.945, 0.965, 0, 1, lineCol);
  }
  const center = opts.center ?? 'dash';
  if (center === 'dash') {
    paint(0.492, 0.508, 0.0, 0.3, lineCol);
    paint(0.492, 0.508, 0.5, 0.8, lineCol);
  } else if (center === 'solid') {
    paint(0.49, 0.51, 0, 1, opts.centerColor || 'rgba(240,190,40,0.95)');
  }
  // dirt / sand drifting onto the edges
  if (opts.edgeDirt) {
    for (const side of [0, 1]) {
      const grd = g.createLinearGradient(side ? W : 0, 0, side ? W * 0.9 : W * 0.1, 0);
      grd.addColorStop(0, opts.edgeDirt);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(side ? W * 0.9 : 0, 0, W * 0.1, H);
    }
  }
  const res = { map: toTexture(c, true), normalMap: toTexture(normalFromHeight(hc, 2.5), false) };
  cache.set(key, res);
  return res;
}

/** Stone paving (石畳) texture. */
export function stoneTextures(opts = {}) {
  const key = 'stone:' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const W = 1024, H = 1024;
  const r = rand(opts.seed ?? 5);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const hc = document.createElement('canvas');
  hc.width = W; hc.height = H;
  const hg = hc.getContext('2d');
  g.fillStyle = opts.grout || '#4a463f';
  g.fillRect(0, 0, W, H);
  hg.fillStyle = '#202020';
  hg.fillRect(0, 0, W, H);
  const rows = opts.rows ?? 14;
  const rh = H / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 80;
    while (x < W) {
      const bw = 70 + r() * 90;
      const hue = opts.hue ?? 35;
      const l = 48 + r() * 18;
      const pad = 5;
      g.fillStyle = `hsl(${hue + (r() - 0.5) * 12},${6 + r() * 10}%,${l}%)`;
      const rx = x + pad, ry = y * rh + pad, rw = bw - pad * 2, rhh = rh - pad * 2;
      const rad = 10;
      const rr = (ctx) => {
        ctx.beginPath();
        ctx.moveTo(rx + rad, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rhh, rad);
        ctx.arcTo(rx + rw, ry + rhh, rx, ry + rhh, rad);
        ctx.arcTo(rx, ry + rhh, rx, ry, rad);
        ctx.arcTo(rx, ry, rx + rw, ry, rad);
        ctx.closePath();
      };
      rr(g); g.fill();
      const hgGrad = hg.createRadialGradient(rx + rw / 2, ry + rhh / 2, 0, rx + rw / 2, ry + rhh / 2, Math.max(rw, rhh) * 0.7);
      hgGrad.addColorStop(0, '#f0f0f0');
      hgGrad.addColorStop(1, '#a0a0a0');
      hg.fillStyle = hgGrad;
      rr(hg); hg.fill();
      for (let k = 0; k < 60; k++) {
        g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() * 0.05})`;
        g.fillRect(rx + r() * rw, ry + r() * rhh, 3 + r() * 6, 3 + r() * 6);
      }
      // wrap copies (seamless horizontally)
      if (x + bw > W) {
        g.save(); g.translate(-W, 0); rr(g); g.fill(); g.restore();
        hg.save(); hg.translate(-W, 0); rr(hg); hg.fill(); hg.restore();
      }
      x += bw;
    }
  }
  if (opts.moss) {
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(70,95,40,${r() * 0.25})`;
      const x = r() * W, y = Math.floor(r() * rows) * rh - 3 + r() * 6;
      g.fillRect(x, y, 3 + r() * 8, 2 + r() * 4);
    }
  }
  const res = { map: toTexture(c, true), normalMap: toTexture(normalFromHeight(hc, 3.0), false) };
  cache.set(key, res);
  return res;
}

/** Scrolling chevron texture for dash panels (emissive). */
export function dashPanelTexture() {
  if (cache.has('dash')) return cache.get('dash');
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#ff7a00');
  grd.addColorStop(1, '#ffb000');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff6c0';
  for (let k = 0; k < 2; k++) {
    const y0 = k * H / 2;
    g.beginPath();
    g.moveTo(W * 0.12, y0 + H * 0.36);
    g.lineTo(W * 0.5, y0 + H * 0.06);
    g.lineTo(W * 0.88, y0 + H * 0.36);
    g.lineTo(W * 0.88, y0 + H * 0.46);
    g.lineTo(W * 0.5, y0 + H * 0.2);
    g.lineTo(W * 0.12, y0 + H * 0.46);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(120,40,0,0.8)';
  g.lineWidth = 10;
  g.strokeRect(0, -10, W, H + 20);
  const t = toTexture(c, true);
  cache.set('dash', t);
  return t;
}

/** Checkered start line texture. */
export function checkerTexture() {
  if (cache.has('checker')) return cache.get('checker');
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  const n = 16;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#1c1c1c' : '#f2f2ee';
      g.fillRect((i * 512) / n, j * 32, 512 / n, 32);
    }
  }
  const t = toTexture(c, true);
  t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set('checker', t);
  return t;
}

/** Wooden planks texture (ramps / bridges). */
export function plankTextures() {
  if (cache.has('plank')) return cache.get('plank');
  const W = 512, H = 512;
  const r = rand(9);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const hc = document.createElement('canvas');
  hc.width = W; hc.height = H;
  const hg = hc.getContext('2d');
  const n = 8;
  for (let i = 0; i < n; i++) {
    const y = (i * H) / n;
    const l = 45 + r() * 15;
    g.fillStyle = `hsl(28,${35 + r() * 15}%,${l}%)`;
    g.fillRect(0, y, W, H / n);
    hg.fillStyle = '#c0c0c0';
    hg.fillRect(0, y + 3, W, H / n - 6);
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(60,35,15,${0.1 + r() * 0.2})`;
      g.lineWidth = 1;
      g.beginPath();
      const yy = y + r() * (H / n);
      g.moveTo(0, yy);
      g.bezierCurveTo(W * 0.3, yy + (r() - 0.5) * 8, W * 0.6, yy + (r() - 0.5) * 8, W, yy);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,18,8,0.8)';
    g.fillRect(0, y, W, 3);
    // nails
    for (const x of [W * 0.1, W * 0.9]) {
      g.fillStyle = 'rgba(40,40,40,0.9)';
      g.beginPath();
      g.arc(x, y + H / n / 2, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  const res = { map: toTexture(c, true), normalMap: toTexture(normalFromHeight(hc, 2.0), false) };
  cache.set('plank', res);
  return res;
}
