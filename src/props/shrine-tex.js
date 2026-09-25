// Canvas textures + shared custom materials for the shrine prop set.
// All materials come from materials.js (getMat / mat) so they are shared & cached.
import * as THREE from 'three';
import { canvasTexture, getMat, mat } from './materials.js';
import { rng } from './util.js';

const TAU = Math.PI * 2;
export const MINCHO = "'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif JP','Noto Serif CJK JP',serif";
export const GOTHIC = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',sans-serif";
export const BRUSH = "'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif JP',serif";

// ---------------------------------------------------------------------------
// drawing helpers
// ---------------------------------------------------------------------------

/** Call fn(x, y) for (x,y) and its wrapped copies when near the canvas edge (seamless tiling). */
function wrap(w, h, x, y, rad, fn) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      const xx = x + dx, yy = y + dy;
      if (xx + rad < 0 || xx - rad > w || yy + rad < 0 || yy - rad > h) continue;
      fn(xx, yy);
    }
  }
}

/** Vertical Japanese text, centered in column cx between top and bottom. */
export function vText(g, text, cx, top, bottom, { font = MINCHO, weight = '800', color = '#111', maxSize = 999, stroke = null, strokeW = 0, squash = 1 } = {}) {
  const chars = [...text];
  const step = (bottom - top) / chars.length;
  const size = Math.min((step * 0.92) / squash, maxSize);
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const y = top + step * (i + 0.5);
    g.save();
    g.translate(cx, y);
    g.scale(1, squash);
    // rotate long-vowel / small dashes for vertical writing
    if (ch === 'ー' || ch === '〜' || ch === '―') g.rotate(Math.PI / 2);
    if (stroke) {
      g.lineWidth = strokeW;
      g.strokeStyle = stroke;
      g.lineJoin = 'round';
      g.strokeText(ch, 0, 0);
    }
    g.fillStyle = color;
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.restore();
}

function grain(g, x0, y0, w, h, r, { color = 'rgba(60,35,15,', n = 40, vertical = true } = {}) {
  for (let i = 0; i < n; i++) {
    g.strokeStyle = `${color}${0.05 + r() * 0.12})`;
    g.lineWidth = 0.6 + r() * 1.6;
    g.beginPath();
    if (vertical) {
      let x = x0 + r() * w;
      g.moveTo(x, y0);
      for (let y = y0; y <= y0 + h; y += 12) { x += (r() - 0.5) * 2; g.lineTo(x, y); }
    } else {
      let y = y0 + r() * h;
      g.moveTo(x0, y);
      for (let x = x0; x <= x0 + w; x += 12) { y += (r() - 0.5) * 2; g.lineTo(x, y); }
    }
    g.stroke();
  }
}

function speckle(g, x0, y0, w, h, r, n, cols) {
  for (let i = 0; i < n; i++) {
    const c = cols[Math.floor(r() * cols.length)];
    g.fillStyle = c.replace('A', (0.2 + r() * 0.5).toFixed(2));
    const s = 0.6 + r() * 1.8;
    g.fillRect(x0 + r() * w, y0 + r() * h, s, s);
  }
}

function flower(g, x, y, rad, rot, petal, center) {
  g.fillStyle = petal;
  for (let k = 0; k < 5; k++) {
    const a = rot + (k * TAU) / 5;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * rad * 0.52, y + Math.sin(a) * rad * 0.52, rad * 0.52, rad * 0.4, a, 0, TAU);
    g.fill();
  }
  if (center) {
    g.fillStyle = center;
    g.beginPath();
    g.arc(x, y, rad * 0.24, 0, TAU);
    g.fill();
  }
}

// ---------------------------------------------------------------------------
// tiling textures
// ---------------------------------------------------------------------------
export const graniteTex = () => canvasTexture('shrine.granite', 256, 256, (g, w, h) => {
  const r = rng(101);
  g.fillStyle = '#d4d1c9';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = r() * w, y = r() * h, s = 12 + r() * 46;
    const col = r() < 0.5 ? `rgba(95,92,84,${0.03 + r() * 0.05})` : `rgba(255,252,246,${0.04 + r() * 0.05})`;
    wrap(w, h, x, y, s, (xx, yy) => { g.fillStyle = col; g.beginPath(); g.arc(xx, yy, s, 0, TAU); g.fill(); });
  }
  speckle(g, 0, 0, w, h, r, 3200, ['rgba(55,53,50,A)', 'rgba(55,53,50,A)', 'rgba(250,248,244,A)', 'rgba(170,140,125,A)']);
});

export const copperTex = () => canvasTexture('shrine.copper', 256, 256, (g, w, h) => {
  const r = rng(202);
  g.fillStyle = '#dde7e1';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    const x = r() * w, y = r() * h, s = 8 + r() * 40;
    const col = r() < 0.5 ? `rgba(245,252,248,${0.04 + r() * 0.05})` : `rgba(120,150,135,${0.03 + r() * 0.04})`;
    wrap(w, h, x, y, s, (xx, yy) => { g.fillStyle = col; g.beginPath(); g.arc(xx, yy, s, 0, TAU); g.fill(); });
  }
  const cw = 32;
  for (let c = 0; c < w / cw; c++) {
    const x = c * cw;
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(x, 0, 2, h);
    g.fillStyle = 'rgba(70,95,82,0.45)';
    g.fillRect(x + 2, 0, 1.5, h);
    const y0 = (c % 2) * 32;
    g.fillStyle = 'rgba(70,95,82,0.28)';
    for (let y = y0; y < h + 64; y += 64) g.fillRect(x, y % h, cw, 1.5);
  }
});

// Soffit rafters (upper half, v 0.5..1) + eave band with rafter ends (lower half, v 0..0.5). 1 repeat = 4 rafters.
export const eaveTex = () => canvasTexture('shrine.eave', 256, 256, (g, w, h) => {
  const r = rng(303);
  // soffit: cream boards between vermilion rafters
  g.fillStyle = '#eee3cc';
  g.fillRect(0, 0, w, 128);
  for (let k = 0; k < 4; k++) {
    const x = k * 64 + 18;
    const sg = g.createLinearGradient(x - 10, 0, x + 38, 0);
    sg.addColorStop(0, 'rgba(120,90,60,0)');
    sg.addColorStop(0.18, 'rgba(120,90,60,0.35)');
    sg.addColorStop(0.82, 'rgba(120,90,60,0.35)');
    sg.addColorStop(1, 'rgba(120,90,60,0)');
    g.fillStyle = sg;
    g.fillRect(x - 10, 0, 48, 128);
    const rg = g.createLinearGradient(x, 0, x + 28, 0);
    rg.addColorStop(0, '#a93a22');
    rg.addColorStop(0.3, '#d4532f');
    rg.addColorStop(0.75, '#c8472a');
    rg.addColorStop(1, '#8a2c1a');
    g.fillStyle = rg;
    g.fillRect(x, 0, 28, 128);
  }
  grain(g, 0, 0, w, 128, r, { color: 'rgba(90,60,30,', n: 20 });
  // eave band
  g.fillStyle = '#f0e8d6'; // kaya-oi board
  g.fillRect(0, 128, w, 30);
  g.fillStyle = 'rgba(80,60,40,0.5)';
  g.fillRect(0, 156, w, 3);
  g.fillStyle = '#4a2418'; // shadow between rafter ends
  g.fillRect(0, 159, w, 97);
  for (let k = 0; k < 4; k++) {
    const x = k * 64 + 18;
    g.fillStyle = '#c8472a';
    g.fillRect(x - 1, 162, 30, 86);
    g.fillStyle = '#f2e3b8'; // painted rafter end
    g.fillRect(x + 1, 164, 26, 30);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 1, 192, 26, 3);
  }
  g.fillStyle = 'rgba(30,15,10,0.6)';
  g.fillRect(0, 250, w, 6);
});

// Blossom micro-texture (neutral, tinted by vertex colors). 1 repeat ~ 0.55 m.
export const blossomTex = () => canvasTexture('shrine.blossom', 256, 256, (g, w, h) => {
  const r = rng(404);
  g.fillStyle = '#e2d3d8';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, s = 8 + r() * 22;
    const c = r() < 0.5 ? 'rgba(150,100,115,0.10)' : 'rgba(255,250,252,0.16)';
    wrap(w, h, x, y, s, (xx, yy) => { g.fillStyle = c; g.beginPath(); g.arc(xx, yy, s, 0, TAU); g.fill(); });
  }
  for (let i = 0; i < 260; i++) {
    const x = r() * w, y = r() * h, rad = 5.5 + r() * 5, rot = r() * TAU;
    const l = 95 + r() * 5;
    const petal = `hsl(${342 + r() * 14},${30 + r() * 40}%,${l}%)`;
    const center = r() < 0.7 ? `hsl(${345 + r() * 10},45%,${80 + r() * 8}%)` : null;
    wrap(w, h, x, y, rad * 1.2, (xx, yy) => flower(g, xx, yy, rad, rot, petal, center));
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * w, y = r() * h;
    g.fillStyle = `rgba(200,110,140,${0.25 + r() * 0.3})`;
    g.beginPath();
    g.arc(x, y, 0.8 + r() * 1.2, 0, TAU);
    g.fill();
  }
});

// Fallen petals on the ground (tiling, alpha): base alpha 0.55 + opaque petals. 1 repeat ~ 1 m.
export const petalTex = () => canvasTexture('shrine.petals', 256, 256, (g, w, h) => {
  const r = rng(505);
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(236,178,197,0.56)';
  g.fillRect(0, 0, w, h);
  const cols = ['#f7d3de', '#f0b1c4', '#fbe4ea', '#e998b2', '#f4c1d0', '#e58aa8'];
  for (let i = 0; i < 1400; i++) {
    const x = r() * w, y = r() * h, s = 2.6 + r() * 2.8, a = r() * TAU;
    const c = cols[Math.floor(r() * cols.length)];
    wrap(w, h, x, y, s * 2, (xx, yy) => {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(xx, yy, s, s * 0.62, a, 0, TAU);
      g.fill();
    });
  }
});

// Hanging blossom strand for weeping cherry (alpha cut-out). Tiles vertically.
export const weepTex = () => canvasTexture('shrine.weep', 128, 512, (g, w, h) => {
  const r = rng(606);
  g.clearRect(0, 0, w, h);
  const cx = (y) => w / 2 + Math.sin((y / h) * TAU * 2) * 5;
  // twig
  g.strokeStyle = 'rgba(85,60,55,1)';
  g.lineWidth = 2.5;
  g.beginPath();
  for (let y = -8; y <= h + 8; y += 8) (y === -8 ? g.moveTo(cx(y), y) : g.lineTo(cx(y), y));
  g.stroke();
  const cols = ['#fbd3df', '#f7bccd', '#f4a9c0', '#fde6ed', '#f19bb6'];
  // clusters of flowers along the twig
  for (let y = 0; y < h; y += 13) {
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const x = cx(y) + (r() - 0.5) * 2 * (w / 2 - 14) * Math.sqrt(r());
      const rad = 6.5 + r() * 4.5;
      const yy = y + (r() - 0.5) * 12;
      wrap(w, h, x, yy, rad * 1.3, (xx, y2) => {
        if (xx < rad || xx > w - rad) return;
        flower(g, xx, y2, rad, r() * TAU, cols[Math.floor(r() * cols.length)], '#e89ab2');
      });
    }
  }
});

// Blossom tuft sprite (alpha cut-out cluster of flowers) used to break up canopy silhouettes.
export const tuftTex = (kind = 'blossom') => canvasTexture(`shrine.tuft.${kind}`, 128, 128, (g, w, h) => {
  const r = rng(kind === 'blossom' ? 1414 : kind === 'pine' ? 1415 : 1416);
  g.clearRect(0, 0, w, h);
  if (kind === 'blossom') {
    g.strokeStyle = 'rgba(80,58,52,1)';
    g.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(64, 128);
      g.quadraticCurveTo(64 + (r() - 0.5) * 30, 90, 64 + (r() - 0.5) * 80, 30 + r() * 30);
      g.stroke();
    }
    // tones matched to the blossom micro-texture average so the tufts blend into the masses
    const cols = ['#f2e8eb', '#ecdfe3', '#e6d6db', '#f6eef0', '#e2cfd5'];
    for (let i = 0; i < 80; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 50;
      const x = 64 + Math.cos(a) * d, y = 62 + Math.sin(a) * d * 0.9;
      const rad = 6.5 + r() * 4.5;
      flower(g, x, y, rad, r() * TAU, cols[Math.floor(r() * cols.length)], r() < 0.7 ? '#d9a9b8' : null);
    }
  } else {
    // needle / leaf tuft
    const cols = kind === 'pine' ? ['rgba(150,165,145,1)', 'rgba(200,215,190,1)', 'rgba(235,242,225,1)'] : ['rgba(170,185,160,1)', 'rgba(210,222,195,1)', 'rgba(240,246,230,1)'];
    for (let i = 0; i < (kind === 'pine' ? 90 : 60); i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 46;
      const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      if (kind === 'pine') {
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 2;
        g.beginPath();
        const n = 6;
        for (let k = 0; k < n; k++) {
          const b = r() * TAU;
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(b) * 11, y + Math.sin(b) * 11);
        }
        g.stroke();
      } else {
        g.beginPath();
        g.ellipse(x, y, 9, 4.5, r() * TAU, 0, TAU);
        g.fill();
      }
    }
  }
});

export const pineTex = () => canvasTexture('shrine.pine', 256, 256, (g, w, h) => {
  const r = rng(707);
  g.fillStyle = '#8ea487';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const x = r() * w, y = r() * h;
    const n = 5 + Math.floor(r() * 5);
    const len = 5 + r() * 7;
    const base = r() * TAU;
    const col = r() < 0.4 ? 'rgba(52,72,48,0.55)' : r() < 0.7 ? 'rgba(170,196,150,0.5)' : 'rgba(215,230,190,0.45)';
    wrap(w, h, x, y, len, (xx, yy) => {
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const a = base + (k / n) * Math.PI - Math.PI / 2;
        g.moveTo(xx, yy);
        g.lineTo(xx + Math.cos(a) * len, yy + Math.sin(a) * len);
      }
      g.stroke();
    });
  }
});

export const leafTex = () => canvasTexture('shrine.leaf', 256, 256, (g, w, h) => {
  const r = rng(808);
  g.fillStyle = '#869c78';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const x = r() * w, y = r() * h, s = 3.5 + r() * 4.5, a = r() * TAU;
    const l = 45 + r() * 45;
    const col = `hsl(${80 + r() * 25},${22 + r() * 25}%,${l}%)`;
    wrap(w, h, x, y, s * 2, (xx, yy) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(xx, yy, s * 1.5, s * 0.75, a, 0, TAU);
      g.fill();
      if (l > 70) {
        g.fillStyle = 'rgba(255,255,240,0.35)';
        g.beginPath();
        g.ellipse(xx - 1, yy - 1, s * 0.6, s * 0.25, a, 0, TAU);
        g.fill();
      }
    });
  }
});

// Sakura bark: dark grey-brown with horizontal lenticels (皮目).
export const sakuraBarkTex = () => canvasTexture('shrine.sakuraBark', 128, 256, (g, w, h) => {
  const r = rng(909);
  g.fillStyle = '#a0928a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = r() * w;
    g.strokeStyle = `rgba(40,30,28,${0.1 + r() * 0.15})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    g.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y <= h; y += 16) { xx += (r() - 0.5) * 4; g.lineTo(xx, y); }
    g.stroke();
  }
  for (let i = 0; i < 150; i++) {
    const x = r() * w, y = r() * h, len = 6 + r() * 26, th = 1 + r() * 2.2;
    const light = r() < 0.55;
    wrap(w, h, x, y, len, (xx, yy) => {
      g.fillStyle = light ? `rgba(190,175,160,${0.35 + r() * 0.3})` : `rgba(35,25,22,${0.4 + r() * 0.3})`;
      g.fillRect(xx - len / 2, yy, len, th);
    });
  }
});

export const pineBarkTex = () => canvasTexture('shrine.pineBark', 128, 256, (g, w, h) => {
  const r = rng(1010);
  g.fillStyle = '#1f1916';
  g.fillRect(0, 0, w, h);
  // black-pine bark: irregular, vertically elongated plates split by deep fissures
  const cols = 4, rows = 6;
  const cw = w / cols, rh = h / rows;
  for (let j = -1; j <= rows; j++) {
    for (let i = -1; i <= cols; i++) {
      const cx = (i + 0.5 + (j % 2) * 0.5) * cw + (r() - 0.5) * cw * 0.4;
      const cy = (j + 0.5) * rh + (r() - 0.5) * rh * 0.35;
      const pw = cw * (0.36 + r() * 0.1), ph = rh * (0.42 + r() * 0.12);
      const l = 24 + r() * 16;
      const fill = `hsl(${20 + r() * 15},${4 + r() * 7}%,${l}%)`;
      const pts = [];
      const n = 6;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + (r() - 0.5) * 0.5;
        const rr = 0.7 + r() * 0.45;
        pts.push([Math.cos(a) * pw * rr, Math.sin(a) * ph * rr * (Math.abs(Math.sin(a)) > 0.8 ? 1.25 : 1)]);
      }
      wrap(w, h, cx, cy, Math.max(pw, ph) * 1.4, (xx, yy) => {
        g.fillStyle = fill;
        g.beginPath();
        pts.forEach(([x, y], k) => (k ? g.lineTo(xx + x, yy + y) : g.moveTo(xx + x, yy + y)));
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,235,215,0.08)';
        g.lineWidth = 1;
        for (let q = 0; q < 3; q++) {
          g.beginPath();
          g.moveTo(xx - pw * 0.5, yy - ph * 0.3 + q * ph * 0.3);
          g.lineTo(xx + pw * 0.5, yy - ph * 0.35 + q * ph * 0.3);
          g.stroke();
        }
      });
    }
  }
});

export const camphorBarkTex = () => canvasTexture('shrine.camphorBark', 128, 256, (g, w, h) => {
  const r = rng(1111);
  g.fillStyle = '#7b6f62';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    g.strokeStyle = `rgba(35,28,22,${0.35 + r() * 0.3})`;
    g.lineWidth = 2 + r() * 4;
    g.beginPath();
    let xx = x;
    g.moveTo(xx, -10);
    for (let yy = -10; yy <= h + 10; yy += 14) { xx += (r() - 0.5) * 9; g.lineTo(xx, yy); }
    g.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const x = r() * w;
    g.strokeStyle = `rgba(200,190,170,${0.1 + r() * 0.12})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    let xx = x;
    g.moveTo(xx, 0);
    for (let yy = 0; yy <= h; yy += 14) { xx += (r() - 0.5) * 6; g.lineTo(xx, yy); }
    g.stroke();
  }
});

export const bambooTex = () => canvasTexture('shrine.bamboo', 64, 256, (g, w, h) => {
  const r = rng(1212);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#d9d6c4');
  grd.addColorStop(0.5, '#f0ecdc');
  grd.addColorStop(1, '#d6d2bf');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(120,110,80,${0.05 + r() * 0.08})`;
    g.fillRect(r() * w, 0, 1 + r() * 2, h);
  }
  // node ring at the top/bottom edge
  g.fillStyle = 'rgba(90,80,50,0.55)';
  g.fillRect(0, 0, w, 3);
  g.fillStyle = 'rgba(255,255,240,0.6)';
  g.fillRect(0, 3, w, 3);
  g.fillStyle = 'rgba(90,80,50,0.3)';
  g.fillRect(0, h - 4, w, 4);
});

export const latticeTex = (lit) => canvasTexture(lit ? 'shrine.latticeLit' : 'shrine.lattice', 128, 128, (g, w, h) => {
  g.fillStyle = lit ? '#ffd9a0' : '#2a2019';
  g.fillRect(0, 0, w, h);
  g.fillStyle = lit ? '#3b2d1f' : '#6a5a40';
  for (let k = 0; k <= 4; k++) {
    g.fillRect(k * 32 - 3, 0, 6, h);
    g.fillRect(0, k * 32 - 3, w, 6);
  }
  g.strokeStyle = lit ? '#3b2d1f' : '#6a5a40';
  g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j < 4; j++) {
      g.beginPath();
      g.arc(k * 32 + 16, j * 32 + 16, 8, 0, TAU);
      g.stroke();
    }
  }
});

// red & white twisted bell rope (suzu-no-o)
export const suzuoTex = () => canvasTexture('shrine.suzuo', 64, 256, (g, w, h) => {
  g.fillStyle = '#f2ece2';
  g.fillRect(0, 0, w, h);
  const cols = ['#c7202a', '#f2ece2', '#c7202a', '#5a2d7a'];
  const bw = 16;
  for (let k = -20; k < 40; k++) {
    g.fillStyle = cols[((k % 4) + 4) % 4];
    g.beginPath();
    const y = k * bw;
    g.moveTo(0, y);
    g.lineTo(w, y - w * 0.9);
    g.lineTo(w, y - w * 0.9 + bw);
    g.lineTo(0, y + bw);
    g.closePath();
    g.fill();
  }
  for (let k = -20; k < 40; k++) {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1.2;
    g.beginPath();
    const y = k * bw;
    g.moveTo(0, y);
    g.lineTo(w, y - w * 0.9);
    g.stroke();
  }
});

// ---------------------------------------------------------------------------
// text textures
// ---------------------------------------------------------------------------
function granitePaint(g, w, h, seed) {
  const r = rng(seed);
  g.fillStyle = '#cfccc4';
  g.fillRect(0, 0, w, h);
  speckle(g, 0, 0, w, h, r, (w * h) / 22, ['rgba(55,53,50,A)', 'rgba(250,248,244,A)', 'rgba(170,140,125,A)']);
}

function engraved(g, text, cx, top, bottom, opts = {}) {
  vText(g, text, cx + 2, top + 2, bottom + 2, { ...opts, color: 'rgba(255,255,250,0.55)' });
  vText(g, text, cx, top, bottom, { ...opts, color: '#4b4944' });
}

/** Vertical plaque texture (torii gaku). style: 'lacquer' | 'stone' | 'wood'. */
export function plaqueTex(text, style = 'lacquer') {
  return canvasTexture(`shrine.plaque.${style}.${text}`, 256, 512, (g, w, h) => {
    const n = [...text].length;
    if (style === 'stone') {
      granitePaint(g, w, h, 55);
      g.strokeStyle = 'rgba(70,68,62,0.7)';
      g.lineWidth = 6;
      g.strokeRect(18, 18, w - 36, h - 36);
      engraved(g, text, w / 2, 50, h - 50, { maxSize: w * 0.6 });
    } else if (style === 'wood') {
      const r = rng(66);
      g.fillStyle = '#4a3322';
      g.fillRect(0, 0, w, h);
      grain(g, 0, 0, w, h, r, { color: 'rgba(20,10,5,', n: 50 });
      g.strokeStyle = '#d8c7a0';
      g.lineWidth = 5;
      g.strokeRect(16, 16, w - 32, h - 32);
      vText(g, text, w / 2, 46, h - 46, { color: '#f1e7cf', maxSize: w * 0.62 });
    } else {
      g.fillStyle = '#1d1a20';
      g.fillRect(0, 0, w, h);
      const gold = g.createLinearGradient(0, 0, w, h);
      gold.addColorStop(0, '#f6dc8c');
      gold.addColorStop(0.5, '#d9a93f');
      gold.addColorStop(1, '#f3d27a');
      g.strokeStyle = gold;
      g.lineWidth = 8;
      g.strokeRect(12, 12, w - 24, h - 24);
      g.lineWidth = 2;
      g.strokeRect(28, 28, w - 56, h - 56);
      const pad = n <= 2 ? 90 : 48;
      vText(g, text, w / 2, pad, h - pad, { color: '#f0c85a', maxSize: w * 0.62, stroke: 'rgba(90,60,10,0.8)', strokeW: 3 });
    }
  });
}

/** Torii pillar inscriptions (black sumi on vermilion). 8 columns: 4 donor names + 4 dates. */
export const inscriptionTex = () => canvasTexture('shrine.toriiInscr', 1024, 512, (g, w, h) => {
  g.fillStyle = '#d8401f';
  g.fillRect(0, 0, w, h);
  const names = ['奉納　ぽんぽこ運送株式会社', '奉納　狸谷商店', '奉納　葉っぱ銀行', '奉納　分福茶釜工業'];
  const dates = ['令和七年四月吉日', '令和五年三月吉日', '令和六年十月吉日', '平成三十年九月吉日'];
  const cols = [...names, ...dates];
  cols.forEach((t, i) => {
    const cx = i * 128 + 64;
    const len = [...t].length;
    const bottom = Math.min(h - 16, 30 + len * 46);
    vText(g, t, cx, 20, bottom, { color: '#1c1512', maxSize: 40, font: BRUSH, weight: '700', squash: 1.25 });
  });
});

/** Draw the offering-box front (賽銭) into a rect. */
function drawSaisen(g, x0, y0, w, h) {
  const r = rng(77);
  g.save();
  g.translate(x0, y0);
  g.scale(w / 512, h / 256);
  const W = 512, H = 256;
  g.fillStyle = '#4a2f1d';
  g.fillRect(0, 0, W, H);
  grain(g, 0, 0, W, H, r, { color: 'rgba(15,8,3,', n: 60, vertical: false });
  const gold = '#e2b451';
  g.strokeStyle = gold;
  g.lineWidth = 6;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = gold;
  for (const [x, y] of [[10, 10], [W - 10, 10], [10, H - 10], [W - 10, H - 10]]) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (x < W / 2 ? 46 : -46), y);
    g.lineTo(x, y + (y < H / 2 ? 46 : -46));
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.arc(W / 2, H / 2, 34, 0, TAU);
  g.fill();
  g.fillStyle = '#4a2f1d';
  for (let k = 0; k < 3; k++) {
    const a = (k * TAU) / 3;
    g.beginPath();
    g.arc(W / 2 + Math.cos(a) * 13, H / 2 + Math.sin(a) * 13, 10, 0, TAU);
    g.fill();
  }
  g.font = `900 110px ${MINCHO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f4ead4';
  g.fillText('賽', W * 0.23, H / 2 + 4);
  g.fillText('銭', W * 0.77, H / 2 + 4);
  g.restore();
}

/** Offering box front (賽銭). */
export const saisenTex = () => canvasTexture('shrine.saisen', 512, 256, (g, w, h) => drawSaisen(g, 0, 0, w, h));

/**
 * Shrine-hall detail atlas (512x512). Regions (canvas px):
 *  saisen [0,0,256,128] | suzuo stripes [256,0,64,256] | straw rope [320,0,128,256] | paper [448,0,64,64] | dark wood [448,64,64,64]
 */
export const HALL_ATLAS = {
  saisen: [0, 0, 256, 128], suzuo: [256, 0, 64, 256], straw: [320, 0, 128, 256], paper: [448, 0, 64, 64], dark: [448, 64, 64, 64],
};
export const hallAtlasTex = () => canvasTexture('shrine.hallAtlas', 512, 512, (g) => {
  const r = rng(3131);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 512, 512);
  drawSaisen(g, 0, 0, 256, 128);
  // suzuo stripes
  g.save();
  g.beginPath();
  g.rect(256, 0, 64, 256);
  g.clip();
  const cols = ['#c7202a', '#f2ece2', '#c7202a', '#5a2d7a'];
  for (let k = -24; k < 40; k++) {
    g.fillStyle = cols[((k % 4) + 4) % 4];
    const y = k * 16;
    g.beginPath();
    g.moveTo(256, y);
    g.lineTo(320, y - 58);
    g.lineTo(320, y - 58 + 16);
    g.lineTo(256, y + 16);
    g.closePath();
    g.fill();
  }
  g.restore();
  // straw
  g.fillStyle = '#cdb27a';
  g.fillRect(320, 0, 128, 256);
  for (let i = 0; i < 900; i++) {
    const x = 320 + r() * 128, y = r() * 256;
    const l = 18 + r() * 40;
    g.strokeStyle = `hsla(${40 + r() * 12},${35 + r() * 30}%,${45 + r() * 35}%,0.6)`;
    g.lineWidth = 0.8 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y + l);
    g.stroke();
  }
  g.fillStyle = '#f7f4ec';
  g.fillRect(448, 0, 64, 64);
  g.fillStyle = '#2b1f18';
  g.fillRect(448, 64, 64, 64);
});

/** Remap a geometry's uv (assumed 0..1 or tiling) into an atlas region [x,y,w,h] (canvas px of a 512 atlas). */
export function atlasUV(geo, region, { wrapU = 1, wrapV = 1, size = 512 } = {}) {
  const [x, y, w, h] = region;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i) / wrapU, v = uv.getY(i) / wrapV;
    if (u > 1.0001 || u < 0) u = u - Math.floor(u);
    v = Math.min(Math.max(v, 0), 1);
    const px = x + (0.02 + u * 0.96) * w;
    const py = y + (0.02 + (1 - v) * 0.96) * h;
    uv.setXY(i, px / size, 1 - py / size);
  }
  return geo;
}

/** Pagoda panels: left half = vermilion double doors with gold studs, right half = 連子窓 lattice window. */
export const pagodaPanelTex = () => canvasTexture('shrine.pagodaPanels', 512, 256, (g) => {
  const r = rng(4242);
  // doors
  g.fillStyle = '#c9401f';
  g.fillRect(0, 0, 256, 256);
  grain(g, 0, 0, 256, 256, r, { color: 'rgba(80,20,5,', n: 20 });
  g.fillStyle = '#8a2a14';
  g.fillRect(126, 0, 4, 256);
  g.strokeStyle = '#8a2a14';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 250);
  for (const x0 of [0, 128]) {
    for (let row = 0; row < 5; row++) {
      for (let c = 0; c < 4; c++) {
        const x = x0 + 22 + c * 28, y = 34 + row * 46;
        const gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, 8);
        gr.addColorStop(0, '#fff2b0');
        gr.addColorStop(0.5, '#e0b04a');
        gr.addColorStop(1, '#7a5a18');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, 7, 0, TAU);
        g.fill();
      }
    }
  }
  g.fillStyle = '#e0b04a';
  g.fillRect(112, 120, 10, 26);
  g.fillRect(134, 120, 10, 26);
  // lattice window
  g.fillStyle = '#2a1d15';
  g.fillRect(256, 0, 256, 256);
  g.fillStyle = '#c9401f';
  g.fillRect(256, 0, 256, 16);
  g.fillRect(256, 240, 256, 16);
  g.fillRect(256, 0, 16, 256);
  g.fillRect(496, 0, 16, 256);
  for (let k = 0; k < 11; k++) {
    const x = 272 + 9 + k * 20.5;
    const gr = g.createLinearGradient(x - 5, 0, x + 5, 0);
    gr.addColorStop(0, '#9a3018');
    gr.addColorStop(0.5, '#e05a33');
    gr.addColorStop(1, '#9a3018');
    g.fillStyle = gr;
    g.fillRect(x - 5, 16, 10, 224);
  }
});

/** Engraved text on granite, vertical (e.g. 奉納) or horizontal (e.g. 洗心). */
export function engravedTex(text, { vertical = true, w = 256, h = 512 } = {}) {
  return canvasTexture(`shrine.engr.${vertical ? 'v' : 'h'}.${text}`, w, h, (g) => {
    granitePaint(g, w, h, 88);
    if (vertical) engraved(g, text, w / 2, h * 0.12, h * 0.88, { maxSize: w * 0.6 });
    else {
      g.font = `800 ${h * 0.6}px ${MINCHO}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const chars = [...text];
      chars.forEach((ch, i) => {
        // traditional right-to-left
        const x = w - (w / chars.length) * (i + 0.5);
        g.fillStyle = 'rgba(255,255,250,0.55)';
        g.fillText(ch, x + 3, h / 2 + 3);
        g.fillStyle = '#4b4944';
        g.fillText(ch, x, h / 2);
      });
    }
  });
}

/** Ema atlas: 4 x 4 cells of 256 x 128 (pentagon plaques). Cells 0..11 fronts, 12..15 backs. */
export const emaTex = () => canvasTexture('shrine.ema', 1024, 512, (g, W, H) => {
  const r = rng(1313);
  const cw = 256, ch = 128;
  const designs = [
    (x, y) => { // horse
      g.fillStyle = '#f3efe6';
      g.beginPath(); g.ellipse(x + 128, y + 80, 58, 22, 0, 0, TAU); g.fill();
      g.fillRect(x + 80, y + 88, 8, 30); g.fillRect(x + 100, y + 88, 8, 30); g.fillRect(x + 150, y + 88, 8, 30); g.fillRect(x + 168, y + 88, 8, 30);
      g.beginPath(); g.ellipse(x + 190, y + 55, 14, 26, 0.6, 0, TAU); g.fill();
      g.fillStyle = '#c42b2b'; g.fillRect(x + 110, y + 60, 40, 22);
      g.fillStyle = '#222'; g.beginPath(); g.moveTo(x + 176, y + 40); g.lineTo(x + 150, y + 62); g.lineTo(x + 176, y + 58); g.fill();
      g.fillRect(x + 66, y + 74, 12, 4);
    },
    (x, y) => { hText(x, y, '合格祈願', '#1b1b1b'); seal(x + 206, y + 96); },
    (x, y) => { // sakura
      for (let k = 0; k < 5; k++) flower(g, x + 70 + k * 30 + r() * 10, y + 60 + (r() - 0.5) * 40, 16 + r() * 6, r() * TAU, '#f6b8cb', '#c9486e');
      g.strokeStyle = '#4b3025'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 40, y + 110); g.quadraticCurveTo(x + 120, y + 70, x + 220, y + 50); g.stroke();
    },
    (x, y) => { // tanuki face
      g.fillStyle = '#8a6a4a'; g.beginPath(); g.ellipse(x + 128, y + 78, 52, 40, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(x + 90, y + 40, 14, 0, TAU); g.arc(x + 166, y + 40, 14, 0, TAU); g.fill();
      g.fillStyle = '#3a2a20'; g.beginPath(); g.ellipse(x + 106, y + 76, 17, 13, -0.3, 0, TAU); g.ellipse(x + 150, y + 76, 17, 13, 0.3, 0, TAU); g.fill();
      g.fillStyle = '#f7f0e0'; g.beginPath(); g.ellipse(x + 128, y + 98, 24, 16, 0, 0, TAU); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(x + 106, y + 76, 5, 0, TAU); g.arc(x + 150, y + 76, 5, 0, TAU); g.arc(x + 128, y + 90, 6, 0, TAU); g.fill();
    },
    (x, y) => { hText(x, y, '家内安全', '#1b1b1b'); seal(x + 206, y + 96); },
    (x, y) => { // torii
      g.fillStyle = '#d8401f';
      g.fillRect(x + 70, y + 36, 116, 12); g.fillRect(x + 80, y + 60, 96, 8);
      g.fillRect(x + 90, y + 40, 10, 76); g.fillRect(x + 156, y + 40, 10, 76);
      g.fillStyle = '#222'; g.fillRect(x + 64, y + 28, 128, 9);
    },
    (x, y) => { hText(x, y, '商売繁盛', '#1b1b1b'); g.fillStyle = '#e0b04a'; g.beginPath(); g.ellipse(x + 206, y + 96, 14, 20, 0, 0, TAU); g.fill(); },
    (x, y) => { // white fox
      g.fillStyle = '#f7f3ea';
      g.beginPath(); g.moveTo(x + 128, y + 116); g.lineTo(x + 84, y + 60); g.lineTo(x + 92, y + 22); g.lineTo(x + 114, y + 48); g.lineTo(x + 142, y + 48); g.lineTo(x + 164, y + 22); g.lineTo(x + 172, y + 60); g.closePath(); g.fill();
      g.strokeStyle = '#c42b2b'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x + 104, y + 70); g.lineTo(x + 118, y + 64); g.moveTo(x + 152, y + 70); g.lineTo(x + 138, y + 64); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(x + 128, y + 108, 5, 0, TAU); g.fill();
    },
    (x, y) => { hText(x, y, '無病息災', '#1b1b1b'); seal(x + 206, y + 96); },
    (x, y) => { // Mt. Fuji
      g.fillStyle = '#3d5f9a'; g.beginPath(); g.moveTo(x + 50, y + 116); g.lineTo(x + 128, y + 34); g.lineTo(x + 206, y + 116); g.fill();
      g.fillStyle = '#f5f5f5'; g.beginPath(); g.moveTo(x + 106, y + 57); g.lineTo(x + 128, y + 34); g.lineTo(x + 150, y + 57); g.lineTo(x + 138, y + 52); g.lineTo(x + 128, y + 60); g.lineTo(x + 117, y + 52); g.fill();
      g.fillStyle = '#d8401f'; g.beginPath(); g.arc(x + 190, y + 44, 14, 0, TAU); g.fill();
    },
    (x, y) => { hText(x, y, '安全運転', '#1b1b1b'); seal(x + 206, y + 96); },
    (x, y) => { hText(x, y, '優勝祈願', '#b3261e'); g.fillStyle = '#e0b04a'; g.beginPath(); g.arc(x + 206, y + 96, 12, 0, TAU); g.fill(); },
  ];
  function hText(x, y, t, col) {
    g.font = `700 36px ${BRUSH}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = col;
    g.fillText(t, x + 128, y + 76);
  }
  function seal(x, y) {
    g.fillStyle = '#c42b2b';
    g.fillRect(x - 10, y - 10, 20, 20);
  }
  for (let cell = 0; cell < 16; cell++) {
    const x = (cell % 4) * cw, y = Math.floor(cell / 4) * ch;
    // wood plaque background
    g.fillStyle = '#dcbd8e';
    g.fillRect(x, y, cw, ch);
    grain(g, x, y, cw, ch, r, { color: 'rgba(110,70,30,', n: 24, vertical: false });
    // roof-shaped top band
    g.fillStyle = 'rgba(120,80,40,0.35)';
    g.fillRect(x, y, cw, 6);
    if (cell < 12) designs[cell](x, y);
    else {
      // handwritten wishes (back side)
      g.strokeStyle = 'rgba(25,20,18,0.85)';
      g.lineWidth = 2.2;
      for (let l = 0; l < 5; l++) {
        const lx = x + 190 - l * 30;
        g.beginPath();
        let yy = y + 30 + r() * 10;
        g.moveTo(lx, yy);
        while (yy < y + 100 + r() * 16) {
          const nx = lx + (r() - 0.5) * 12;
          yy += 5 + r() * 8;
          g.lineTo(nx, yy);
        }
        g.stroke();
      }
    }
  }
});

// ---------------------------------------------------------------------------
// shared materials (created lazily, cached by key in materials.js)
// ---------------------------------------------------------------------------
export const SM = {
  granite: () => mat('shrine.granite', { color: 0xbab6ac, roughness: 0.9, map: graniteTex() }),
  graniteDark: () => mat('shrine.graniteDark', { color: 0x8f8c84, roughness: 0.92, map: graniteTex() }),
  copper: () => mat('shrine.copper', { color: 0x58967f, roughness: 0.62, metalness: 0.12, map: copperTex() }),
  eave: () => mat('shrine.eave', { color: 0xffffff, roughness: 0.75, map: eaveTex() }),
  bronze: () => mat('shrine.bronze', { color: 0xa5834e, roughness: 0.38, metalness: 0.85 }),
  bronzeGreen: () => mat('shrine.bronzeGreen', { color: 0x5d7a62, roughness: 0.6, metalness: 0.45 }),
  fire: () => mat('shrine.fire', { color: 0xffe2b8, emissive: 0xffa04a, emissiveIntensity: 2.6, roughness: 0.9 }),
  cavity: () => mat('shrine.cavity', { color: 0x2c2723, roughness: 1.0 }),
  shide: () => mat('shrine.shide', { color: 0xf8f5ec, roughness: 0.8, map: 'washi' }),
  tuft: (kind = 'blossom') => mat(`shrine.tuft.${kind}`, { color: 0xffffff, roughness: 0.85, vertexColors: true, map: tuftTex(kind), alphaTest: 0.5 }),
  blossom: () => mat('shrine.blossom', { color: 0xffffff, roughness: 0.86, vertexColors: true, map: blossomTex() }),
  petals: () => mat('shrine.petalCarpet', { color: 0xffffff, roughness: 0.92, vertexColors: true, map: petalTex(), alphaTest: 0.5 }),
  weep: () => mat('shrine.weepStrand', { color: 0xffffff, roughness: 0.85, map: weepTex(), alphaTest: 0.42, side: THREE.DoubleSide }),
  sakuraBark: () => mat('shrine.sakuraBark', { color: 0x8a7b74, roughness: 0.95, map: sakuraBarkTex() }),
  pineNeedle: () => mat('shrine.pineNeedle', { color: 0xffffff, roughness: 0.9, vertexColors: true, map: pineTex() }),
  pineBark: () => mat('shrine.pineBark', { color: 0xc9bcb2, roughness: 0.95, map: pineBarkTex() }),
  camphorLeaf: () => mat('shrine.camphorLeaf', { color: 0xffffff, roughness: 0.7, vertexColors: true, map: leafTex() }),
  camphorBark: () => mat('shrine.camphorBark', { color: 0x9a8b7c, roughness: 0.96, map: camphorBarkTex() }),
  bambooDry: () => mat('shrine.bambooDry', { color: 0xc9bb7a, roughness: 0.55, map: bambooTex() }),
  bambooGreen: () => mat('shrine.bambooGreen', { color: 0x8bb050, roughness: 0.5, map: bambooTex() }),
  suzuo: () => mat('shrine.suzuo', { color: 0xffffff, roughness: 0.85, map: suzuoTex() }),
  inscription: () => mat('shrine.toriiInscr', { color: 0xffffff, roughness: 0.55, map: inscriptionTex() }),
  saisen: () => mat('shrine.saisen', { color: 0xffffff, roughness: 0.6, map: saisenTex() }),
  hallAtlas: () => mat('shrine.hallAtlas', { color: 0xffffff, roughness: 0.85, map: hallAtlasTex() }),
  pagodaPanels: () => mat('shrine.pagodaPanels', { color: 0xffffff, roughness: 0.55, map: pagodaPanelTex() }),
  ema: () => mat('shrine.ema', { color: 0xffffff, roughness: 0.8, map: emaTex() }),
  lanternLit: () => mat('shrine.lanternLit', { color: 0xffffff, map: latticeTex(true), emissive: 0xffb060, emissiveMap: latticeTex(true), emissiveIntensity: 2.4, roughness: 0.6 }),
  lanternDark: () => mat('shrine.lanternDark', { color: 0xffffff, map: latticeTex(false), roughness: 0.55, metalness: 0.3 }),
  plaque: (text, style) => mat(`shrine.plaque.${style}.${text}`, { color: 0xffffff, roughness: style === 'lacquer' ? 0.35 : 0.8, map: plaqueTex(text, style) }),
  engraved: (text, vertical = true) => mat(`shrine.engr.${vertical ? 'v' : 'h'}.${text}`, {
    color: 0xbab6ac, roughness: 0.9, map: vertical ? engravedTex(text) : engravedTex(text, { vertical: false, w: 512, h: 256 }),
  }),
  castleRoof: () => mat('shrine.castleRoof', { color: 0x55575b, roughness: 0.6, metalness: 0.06, map: 'kawara' }),
  castleWhite: () => mat('shrine.castleWhite', { color: 0xefede6, roughness: 0.85 }),
  pal: (name) => getMat(name),
};
