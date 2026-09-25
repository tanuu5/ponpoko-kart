// Canvas textures + shared materials for the festival props (course 3 「夏祭り花火ナイト」).
// Every material is created through mat()/getMat() from materials.js so it is shared.
import * as THREE from 'three';
import { canvasTexture, mat, getMat, TEX } from './materials.js';

export const FONT_MINCHO = "'Hiragino Mincho ProN','Hiragino Mincho Pro','Yu Mincho','YuMincho','Noto Serif JP','Noto Serif CJK JP','MS PMincho',serif";
export const FONT_GOTHIC = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','YuGothic','Noto Sans JP','Noto Sans CJK JP','Meiryo',sans-serif";
export const FONT_MARU = "'Hiragino Maru Gothic ProN','Hiragino Maru Gothic Pro','Rounded Mplus 1c','Yu Gothic','YuGothic','Noto Sans JP','Meiryo',sans-serif";

export function prand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Pixel rect of a canvas (W×H) → UV rect [u0, v0, u1, v1] (CanvasTexture flipY). */
export function rectUV(x, y, w, h, W, H) {
  return [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];
}
/** Pixel point → UV point. */
export function ptUV(x, y, W, H) { return [x / W, 1 - y / H]; }

/** Vertical (縦書き) text centred on (cx, cy). */
export function vText(g, text, cx, cy, size, { font = FONT_MINCHO, weight = 'bold', fill = '#1f1512', stroke = null, strokeW = 0, gap = 0.02, squeeze = 1 } = {}) {
  const chars = [...text];
  const step = size * (1 + gap);
  const total = step * chars.length - size * gap;
  g.save();
  g.translate(cx, cy);
  g.scale(squeeze, 1);
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let y = -total / 2 + size / 2;
  for (const ch of chars) {
    // small kana / long vowel adjustments for vertical writing
    let yy = y;
    let rot = 0;
    if ('ー〜-'.includes(ch)) rot = Math.PI / 2;
    if ('ゃゅょっぁぃぅぇぉャュョッァィゥェォ'.includes(ch)) yy -= size * 0.05;
    g.save();
    g.translate(0, yy);
    if (rot) g.rotate(rot);
    if (stroke && strokeW > 0) {
      g.lineJoin = 'round';
      g.strokeStyle = stroke;
      g.lineWidth = strokeW;
      g.strokeText(ch, 0, 0);
    }
    g.fillStyle = fill;
    g.fillText(ch, 0, 0);
    g.restore();
    y += step;
  }
  g.restore();
}

/** Horizontal text helper (auto fit to maxW). */
export function hText(g, text, cx, cy, size, { font = FONT_GOTHIC, weight = 'bold', fill = '#222', stroke = null, strokeW = 0, maxW = 1e9, shadow = null } = {}) {
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(text).width;
  const k = w > maxW ? maxW / w : 1;
  g.translate(cx, cy);
  g.scale(k, 1);
  if (shadow) {
    g.fillStyle = shadow;
    g.fillText(text, size * 0.05, size * 0.06);
  }
  if (stroke && strokeW > 0) {
    g.lineJoin = 'round';
    g.strokeStyle = stroke;
    g.lineWidth = strokeW;
    g.strokeText(text, 0, 0);
  }
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

/** Subtle fibre/noise overlay. */
export function fibres(g, x, y, w, h, n, rnd, color = '150,130,100', alpha = 0.1, len = 16) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let i = 0; i < n; i++) {
    g.strokeStyle = `rgba(${color},${rnd() * alpha})`;
    g.lineWidth = 0.5 + rnd();
    const px = x + rnd() * w, py = y + rnd() * h;
    g.beginPath();
    g.moveTo(px, py);
    g.quadraticCurveTo(px + (rnd() - 0.5) * len, py + (rnd() - 0.5) * len, px + (rnd() - 0.5) * len * 1.4, py + (rnd() - 0.5) * len * 1.4);
    g.stroke();
  }
  g.restore();
}

function rgb(c, k = 1) { return `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`; }

/** 三つ巴 (mitsudomoe) crest: three commas whose tails sweep along the rim. */
export function tomoe(g, cx, cy, r, fill = '#1d1a19', bg = null) {
  g.save();
  g.translate(cx, cy);
  if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = fill;
  const d = r * 0.42, a = r * 0.25, sweep = Math.PI * 0.92;
  for (let k = 0; k < 3; k++) {
    const th = (k * Math.PI * 2) / 3 - Math.PI / 2;
    g.beginPath();
    g.arc(Math.cos(th) * d, Math.sin(th) * d, a, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = i / n, ph = th + t * sweep;
      const ro = d + a + (r - d - a) * Math.sqrt(Math.sin((Math.min(t * 1.8, 1) * Math.PI) / 2)) - t * t * r * 0.06;
      g.lineTo(Math.cos(ph) * ro, Math.sin(ph) * ro);
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n, ph = th + t * sweep;
      const ri = (d - a) + (r * 0.96 - (d - a)) * Math.pow(t, 0.5);
      g.lineTo(Math.cos(ph) * ri, Math.sin(ph) * ri);
    }
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ===========================================================================
// Lantern atlas — every chochin, bulb and cord in this module shares ONE material.
// 2048 × 1024 canvas, 4 × 4 cells of 512 × 256. Cell 0 holds solid swatches.
// ===========================================================================
const LA_W = 2048, LA_H = 1024, LA_CW = 512, LA_CH = 256, LA_RS = 8; // rough map downscale
const LA = { init: false, map: null, emit: null, rough: null, cells: new Map(), next: 1 };

export const LANTERN_STYLES = {
  red: { paper: [206, 44, 30], edge: [150, 26, 18], ink: '#1e1311', glow: [255, 112, 46], band: null, bandGlow: null },
  white: { paper: [246, 238, 220], edge: [214, 196, 160], ink: '#1e1311', glow: [226, 164, 92], band: '#c8281e', bandGlow: [255, 70, 30] },
  yellow: { paper: [246, 196, 52], edge: [210, 150, 30], ink: '#b01d16', glow: [240, 150, 36], band: '#b01d16', bandGlow: [255, 80, 30] },
  shop: { paper: [245, 236, 214], edge: [205, 186, 150], ink: '#1a1210', glow: [226, 166, 98], band: '#1d1917', bandGlow: [60, 40, 25], crest: '#c8281e' },
  pink: { paper: [240, 150, 170], edge: [200, 100, 120], ink: '#5a1220', glow: [255, 120, 140], band: '#c8281e', bandGlow: [255, 60, 60] },
  blue: { paper: [120, 170, 225], edge: [70, 110, 170], ink: '#0f1d3a', glow: [120, 190, 255], band: '#f4efe4', bandGlow: [220, 235, 255] },
};

// swatch positions inside cell 0 (pixel centres)
const SW = { lacquer: [64, 128], bulb: [192, 128], glow: [320, 128], cord: [448, 64], rope: [448, 192] };
export const LUV = {};
for (const k of Object.keys(SW)) LUV[k] = ptUV(SW[k][0], SW[k][1], LA_W, LA_H);

function laInit() {
  if (LA.init) return;
  LA.init = true;
  LA.map = canvasTexture('festival.lanternAtlas.map', LA_W, LA_H, (g, w, h) => { g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, w, h); });
  LA.emit = canvasTexture('festival.lanternAtlas.emit', LA_W, LA_H, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); });
  LA.rough = canvasTexture('festival.lanternAtlas.rough', LA_W / LA_RS, LA_H / LA_RS, (g, w, h) => { g.fillStyle = 'rgb(0,220,0)'; g.fillRect(0, 0, w, h); }, { srgb: false });
  for (const t of [LA.map, LA.emit, LA.rough]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
  const g = LA.map.image.getContext('2d');
  const e = LA.emit.image.getContext('2d');
  const r = LA.rough.image.getContext('2d');
  // lacquer (black with faint warm sheen)
  const lg = g.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, '#2a2220'); lg.addColorStop(0.5, '#1f1a19'); lg.addColorStop(1, '#2a2220');
  g.fillStyle = lg; g.fillRect(0, 0, 128, 256);
  e.fillStyle = '#000'; e.fillRect(0, 0, 128, 256);
  r.fillStyle = 'rgb(0,70,0)'; r.fillRect(0, 0, 128 / LA_RS, 256 / LA_RS);
  // bulb
  g.fillStyle = '#fff4dc'; g.fillRect(128, 0, 128, 256);
  e.fillStyle = 'rgb(255,226,170)'; e.fillRect(128, 0, 128, 256);
  r.fillStyle = 'rgb(0,50,0)'; r.fillRect(128 / LA_RS, 0, 128 / LA_RS, 256 / LA_RS);
  // inner glow
  g.fillStyle = '#ffd88a'; g.fillRect(256, 0, 128, 256);
  e.fillStyle = 'rgb(255,176,80)'; e.fillRect(256, 0, 128, 256);
  // cord + rope
  g.fillStyle = '#3a302a'; g.fillRect(384, 0, 128, 128);
  g.fillStyle = '#b89c68'; g.fillRect(384, 128, 128, 128);
  e.fillStyle = '#000'; e.fillRect(384, 0, 128, 256);
  LA.map.needsUpdate = LA.emit.needsUpdate = LA.rough.needsUpdate = true;
}

const LANTERN_RIBS = 16;
export { LANTERN_RIBS };

function drawLanternCell(idx, style, text, squeeze, seed) {
  const g = LA.map.image.getContext('2d');
  const e = LA.emit.image.getContext('2d');
  const cx = (idx % 4) * LA_CW, cy = Math.floor(idx / 4) * LA_CH;
  const W = LA_CW, H = LA_CH;
  const S = LANTERN_STYLES[style] || LANTERN_STYLES.red;
  const rnd = prand(seed);
  g.save(); e.save();
  g.beginPath(); g.rect(cx, cy, W, H); g.clip();
  e.beginPath(); e.rect(cx, cy, W, H); e.clip();
  // paper base (slightly darker toward top & bottom where the paper turns)
  const pg = g.createLinearGradient(0, cy, 0, cy + H);
  pg.addColorStop(0, rgb(S.edge)); pg.addColorStop(0.18, rgb(S.paper)); pg.addColorStop(0.82, rgb(S.paper)); pg.addColorStop(1, rgb(S.edge));
  g.fillStyle = pg; g.fillRect(cx, cy, W, H);
  // glow base: brightest in the middle
  const eg = e.createLinearGradient(0, cy, 0, cy + H);
  eg.addColorStop(0, rgb(S.glow, 0.5)); eg.addColorStop(0.22, rgb(S.glow, 0.8)); eg.addColorStop(0.5, rgb(S.glow, 0.93));
  eg.addColorStop(0.78, rgb(S.glow, 0.84)); eg.addColorStop(1, rgb(S.glow, 0.56));
  e.fillStyle = eg; e.fillRect(cx, cy, W, H);
  // washi fibres
  fibres(g, cx, cy, W, H, 260, rnd, '255,255,255', 0.12, 18);
  fibres(g, cx, cy, W, H, 200, rnd, '80,50,30', 0.1, 18);
  fibres(e, cx, cy, W, H, 160, rnd, '0,0,0', 0.12, 18);
  // bands (dyed paper)
  if (S.band) {
    for (const [a, b] of [[0.07, 0.115], [0.135, 0.15], [0.85, 0.865], [0.885, 0.93]]) {
      g.fillStyle = S.band; g.fillRect(cx, cy + a * H, W, (b - a) * H);
      e.fillStyle = rgb(S.bandGlow, 0.75); e.fillRect(cx, cy + a * H, W, (b - a) * H);
    }
  }
  // ribs (bamboo hoops) — darker lines, stronger in the glow map
  for (let k = 1; k < LANTERN_RIBS; k++) {
    const y = cy + H - (k / LANTERN_RIBS) * H;
    g.fillStyle = 'rgba(40,20,10,0.16)'; g.fillRect(cx, y - 1, W, 2);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(cx, y + 1, W, 1);
    e.fillStyle = 'rgba(0,0,0,0.42)'; e.fillRect(cx, y - 1.5, W, 3);
  }
  // text front (u = 0.5) and back (u = 0 / 1)
  const chars = [...text];
  const n = chars.length;
  const band = H * (S.crest ? 0.5 : S.band ? 0.62 : 0.72);
  const size = Math.min(n === 1 ? H * 0.56 : (band / n) * 0.98, 150);
  const txtOpts = { font: FONT_MINCHO, weight: 'bold', fill: S.ink, squeeze };
  const ty = cy + H * 0.5 + (S.crest ? H * 0.08 : 0);
  for (const x of [cx + W / 2, cx, cx + W]) {
    if (S.crest) {
      g.fillStyle = S.crest; g.beginPath(); g.ellipse(x, cy + H * 0.215, H * 0.052 * squeeze, H * 0.052, 0, 0, Math.PI * 2); g.fill();
      e.fillStyle = rgb([255, 60, 30], 0.6); e.beginPath(); e.ellipse(x, cy + H * 0.215, H * 0.052 * squeeze, H * 0.052, 0, 0, Math.PI * 2); e.fill();
    }
    vText(g, text, x, ty, size, txtOpts);
    vText(e, text, x, ty, size, { ...txtOpts, fill: '#000', stroke: 'rgba(0,0,0,0.6)', strokeW: size * 0.05 });
  }
  g.restore(); e.restore();
  // roughness: paper is matte
  const r = LA.rough.image.getContext('2d');
  r.fillStyle = 'rgb(0,225,0)';
  r.fillRect(cx / LA_RS, cy / LA_RS, W / LA_RS, H / LA_RS);
  LA.map.needsUpdate = LA.emit.needsUpdate = LA.rough.needsUpdate = true;
}

/**
 * Atlas cell for a lantern design → UV rect. shape: 'round' | 'long'.
 * The text is squeezed horizontally so characters look right on the curved body.
 */
export function lanternCell(style, text, shape = 'round') {
  laInit();
  const key = `${style}|${text}|${shape}`;
  if (LA.cells.has(key)) return LA.cells.get(key);
  let idx = LA.next;
  if (idx >= 16) {
    // atlas full: reuse the first cell with the same style (rare)
    for (const [k, v] of LA.cells) if (k.startsWith(style + '|')) { LA.cells.set(key, v); return v; }
    return LA.cells.values().next().value;
  }
  LA.next++;
  // horizontal texel / vertical texel ratio on the body
  const rMid = shape === 'long' ? 0.14 : 0.17;
  const bodyH = 0.425;
  const ratio = ((2 * Math.PI * rMid) / LA_CW) / (bodyH / LA_CH);
  drawLanternCell(idx, style, text, 1 / ratio, hashStr(key));
  const cx = (idx % 4) * LA_CW, cy = Math.floor(idx / 4) * LA_CH;
  const rect = rectUV(cx + 0.5, cy + 0.5, LA_CW - 1, LA_CH - 1, LA_W, LA_H);
  LA.cells.set(key, rect);
  return rect;
}

/** THE lantern material (paper + lacquer + bulbs + cords). */
export function lanternMat(lit = true) {
  laInit();
  if (lit) {
    return mat('festival.lantern.lit', {
      map: LA.map, emissiveMap: LA.emit, emissive: 0xffffff, emissiveIntensity: 2.3,
      roughness: 1, roughnessMap: LA.rough, metalness: 0,
    });
  }
  return mat('festival.lantern', { map: LA.map, roughness: 1, roughnessMap: LA.rough, metalness: 0 });
}

// ===========================================================================
// Goods atlas (屋台の品物): 1024² canvas, 8 × 8 cells of 128 px. One material for all
// food / toys / small props; roughness + metalness via an ORM map (G = rough, B = metal).
// ===========================================================================
const GA = 1024, GC = 128;
export const GOODS = {
  tako: [0, 0], takoSauce: [1, 0], noodle: [2, 0], cabbage: [3, 0], iron: [4, 0], steel: [5, 0], woodTray: [6, 0], sauceBrown: [7, 0],
  apple: [0, 1], appleGreen: [1, 1], strawberry: [2, 1], grape: [3, 1], mikan: [4, 1], stick: [5, 1], syrupRed: [6, 1], syrupGreen: [7, 1],
  syrupBlue: [0, 2], syrupYellow: [1, 2], ice: [2, 2], cup: [3, 2], plastic: [4, 2], cardboard: [5, 2], blue: [6, 2], black: [7, 2],
  water: [0, 3, 2, 2], fishOrange: [2, 3], fishRed: [3, 3], fishBlack: [4, 3], poiPaper: [5, 3], pink: [6, 3], tub: [7, 3],
  bagWater: [2, 4], cottonPink: [3, 4], cottonWhite: [4, 4], cottonBlue: [5, 4], clear: [6, 4], pack: [7, 4],
  bag0: [0, 5, 1, 2], bag1: [1, 5, 1, 2], bag2: [2, 5, 1, 2], bag3: [3, 5, 1, 2],
  maskFox: [4, 5], maskHyottoko: [5, 5], maskOkame: [6, 5], maskOni: [7, 5], maskTanuki: [4, 6], maskCat: [5, 6], maskRabbit: [6, 6], maskTengu: [7, 6],
  red: [0, 7], yellow: [1, 7], green: [2, 7], cream: [3, 7], gold: [4, 7], orange: [5, 7], purple: [6, 7], white: [7, 7],
};
// [roughness, metalness]
const GOODS_ORM = {
  iron: [0.45, 0.8], steel: [0.28, 1], gold: [0.3, 1],
  apple: [0.1, 0], appleGreen: [0.1, 0], strawberry: [0.14, 0], grape: [0.1, 0], mikan: [0.1, 0],
  syrupRed: [0.08, 0], syrupGreen: [0.08, 0], syrupBlue: [0.08, 0], syrupYellow: [0.08, 0], sauceBrown: [0.2, 0],
  water: [0.05, 0], bagWater: [0.08, 0], clear: [0.12, 0], pack: [0.15, 0], tub: [0.3, 0], blue: [0.35, 0], plastic: [0.4, 0],
  takoSauce: [0.3, 0], fishOrange: [0.3, 0], fishRed: [0.3, 0], fishBlack: [0.3, 0], ice: [0.35, 0], black: [0.5, 0],
  maskFox: [0.35, 0], maskHyottoko: [0.35, 0], maskOkame: [0.35, 0], maskOni: [0.35, 0], maskTanuki: [0.35, 0], maskCat: [0.35, 0], maskRabbit: [0.35, 0], maskTengu: [0.35, 0],
  pink: [0.4, 0], red: [0.45, 0], yellow: [0.45, 0], green: [0.45, 0], orange: [0.45, 0], purple: [0.45, 0], white: [0.45, 0],
};

/** UV rect of a goods cell (inset by px). */
export function goodsRect(name, inset = 3) {
  const c = GOODS[name];
  const w = (c[2] || 1) * GC, h = (c[3] || 1) * GC;
  return rectUV(c[0] * GC + inset, c[1] * GC + inset, w - inset * 2, h - inset * 2, GA, GA);
}
/** UV centre of a goods cell. */
export function goodsUV(name) {
  const c = GOODS[name];
  return ptUV(c[0] * GC + ((c[2] || 1) * GC) / 2, c[1] * GC + ((c[3] || 1) * GC) / 2, GA, GA);
}

function blob(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function ell(g, x, y, rx, ry, rot, color) { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); }

function drawFish(g, x, y, s, ang, body, belly = null, fin = null) {
  g.save();
  g.translate(x, y); g.rotate(ang);
  // tail
  g.fillStyle = fin || body;
  g.globalAlpha *= 0.9;
  g.beginPath(); g.moveTo(-s * 0.7, 0); g.quadraticCurveTo(-s * 1.4, -s * 0.9, -s * 1.5, -s * 0.5); g.quadraticCurveTo(-s * 1.15, 0, -s * 1.5, s * 0.55); g.quadraticCurveTo(-s * 1.3, s * 0.9, -s * 0.7, 0); g.fill();
  g.globalAlpha /= 0.9;
  ell(g, 0, 0, s, s * 0.52, 0, body);
  if (belly) ell(g, s * 0.1, s * 0.15, s * 0.6, s * 0.25, 0, belly);
  blob(g, s * 0.62, -s * 0.12, s * 0.1, '#111');
  g.restore();
}

function drawMask(g, name, x, y, S) {
  const cx = x + S / 2, cy = y + S / 2;
  g.save();
  g.beginPath(); g.rect(x, y, S, S); g.clip();
  const face = (col) => { g.fillStyle = col; g.fillRect(x, y, S, S); };
  const k = S / 128;
  // NOTE: the mask shell maps u across (left → right) and v top → bottom; the cell is squeezed
  // a bit horizontally on the shell so features are drawn slightly narrow.
  if (name === 'maskFox') {
    face('#f7f2ea');
    // forehead flame
    g.fillStyle = '#d62a1e';
    g.beginPath(); g.moveTo(cx, y + 14 * k); g.quadraticCurveTo(cx + 9 * k, y + 30 * k, cx, y + 40 * k); g.quadraticCurveTo(cx - 9 * k, y + 30 * k, cx, y + 14 * k); g.fill();
    // brows / eye rims
    for (const s of [-1, 1]) {
      g.strokeStyle = '#d62a1e'; g.lineWidth = 6 * k; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx + s * 12 * k, y + 50 * k); g.quadraticCurveTo(cx + s * 30 * k, y + 36 * k, cx + s * 46 * k, y + 44 * k); g.stroke();
      g.fillStyle = '#111';
      g.beginPath(); g.moveTo(cx + s * 14 * k, y + 58 * k); g.quadraticCurveTo(cx + s * 30 * k, y + 50 * k, cx + s * 44 * k, y + 52 * k); g.quadraticCurveTo(cx + s * 30 * k, y + 60 * k, cx + s * 14 * k, y + 58 * k); g.fill();
      g.strokeStyle = '#e0b020'; g.lineWidth = 2 * k;
      g.beginPath(); g.moveTo(cx + s * 16 * k, y + 61 * k); g.quadraticCurveTo(cx + s * 30 * k, y + 57 * k, cx + s * 42 * k, y + 56 * k); g.stroke();
      // whiskers
      g.strokeStyle = '#c8261c'; g.lineWidth = 2.2 * k;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx + s * 16 * k, y + (86 + i * 6) * k); g.lineTo(cx + s * 44 * k, y + (80 + i * 9) * k); g.stroke(); }
    }
    // nose + mouth
    ell(g, cx, y + 98 * k, 7 * k, 5 * k, 0, '#1a1414');
    g.strokeStyle = '#c8261c'; g.lineWidth = 3 * k;
    g.beginPath(); g.moveTo(cx - 12 * k, y + 110 * k); g.quadraticCurveTo(cx, y + 118 * k, cx + 12 * k, y + 110 * k); g.stroke();
  } else if (name === 'maskHyottoko') {
    face('#f0c08c');
    // tenugui (blue with white dots) on the head
    g.fillStyle = '#2f5aa8'; g.fillRect(x, y, S, 30 * k);
    for (let i = 0; i < 10; i++) blob(g, x + ((i * 29) % 128) * k, y + (8 + (i % 3) * 8) * k, 3 * k, '#f4f4f0');
    // eyes (one bigger)
    blob(g, cx - 18 * k, y + 56 * k, 11 * k, '#fff'); blob(g, cx - 18 * k, y + 57 * k, 6 * k, '#111');
    blob(g, cx + 20 * k, y + 60 * k, 7 * k, '#fff'); blob(g, cx + 20 * k, y + 61 * k, 4 * k, '#111');
    g.strokeStyle = '#3a2a1e'; g.lineWidth = 3 * k;
    g.beginPath(); g.arc(cx - 18 * k, y + 50 * k, 16 * k, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.beginPath(); g.arc(cx + 20 * k, y + 54 * k, 12 * k, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    // cheeks + pursed mouth to the side
    ell(g, cx - 32 * k, y + 84 * k, 12 * k, 8 * k, 0, 'rgba(230,110,90,0.5)');
    ell(g, cx + 32 * k, y + 84 * k, 12 * k, 8 * k, 0, 'rgba(230,110,90,0.5)');
    blob(g, cx + 16 * k, y + 100 * k, 11 * k, '#c8342a'); blob(g, cx + 16 * k, y + 100 * k, 5 * k, '#3a1210');
  } else if (name === 'maskOkame') {
    face('#fbf3ea');
    // hair
    g.fillStyle = '#1e1a1a';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + S, y); g.lineTo(x + S, y + 26 * k); g.quadraticCurveTo(cx + 20 * k, y + 20 * k, cx, y + 34 * k); g.quadraticCurveTo(cx - 20 * k, y + 20 * k, x, y + 26 * k); g.closePath(); g.fill();
    // brow smudges
    ell(g, cx - 22 * k, y + 42 * k, 7 * k, 4 * k, 0, '#3a3030'); ell(g, cx + 22 * k, y + 42 * k, 7 * k, 4 * k, 0, '#3a3030');
    // smiling eyes
    g.strokeStyle = '#1a1414'; g.lineWidth = 3.5 * k; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 20 * k, y + 64 * k, 9 * k, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    // cheeks
    ell(g, cx - 34 * k, y + 82 * k, 15 * k, 11 * k, 0, 'rgba(240,120,130,0.65)');
    ell(g, cx + 34 * k, y + 82 * k, 15 * k, 11 * k, 0, 'rgba(240,120,130,0.65)');
    // tiny mouth
    ell(g, cx, y + 100 * k, 6 * k, 4 * k, 0, '#d8202a');
  } else if (name === 'maskOni') {
    face('#d8382a');
    g.fillStyle = '#2a1a14';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + s * 8 * k, y + 50 * k); g.lineTo(cx + s * 46 * k, y + 34 * k); g.lineTo(cx + s * 44 * k, y + 44 * k); g.closePath(); g.fill();
      ell(g, cx + s * 24 * k, y + 60 * k, 12 * k, 9 * k, 0, '#f2d23a');
      blob(g, cx + s * 22 * k, y + 60 * k, 5 * k, '#111');
    }
    ell(g, cx, y + 80 * k, 9 * k, 7 * k, 0, '#a8221a');
    g.fillStyle = '#5a0e0a';
    g.beginPath(); g.ellipse(cx, y + 104 * k, 30 * k, 12 * k, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f6f2e8';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 22 * k, y + 96 * k); g.lineTo(cx + s * 14 * k, y + 96 * k); g.lineTo(cx + s * 18 * k, y + 108 * k); g.closePath(); g.fill(); }
  } else if (name === 'maskTanuki') {
    face('#a8784e');
    ell(g, cx, y + 92 * k, 34 * k, 26 * k, 0, '#f2e2c4');
    for (const s of [-1, 1]) {
      ell(g, cx + s * 24 * k, y + 62 * k, 17 * k, 14 * k, s * 0.35, '#4a3020');
      blob(g, cx + s * 22 * k, y + 60 * k, 7 * k, '#111');
      blob(g, cx + s * 20 * k, y + 57 * k, 2.5 * k, '#fff');
    }
    ell(g, cx, y + 82 * k, 8 * k, 6 * k, 0, '#1a1210');
    g.strokeStyle = '#3a2418'; g.lineWidth = 3 * k;
    g.beginPath(); g.moveTo(cx - 10 * k, y + 96 * k); g.quadraticCurveTo(cx, y + 104 * k, cx + 10 * k, y + 96 * k); g.stroke();
    // leaf on the forehead
    g.fillStyle = '#4a9a3a'; g.beginPath(); g.ellipse(cx, y + 26 * k, 8 * k, 14 * k, 0.4, 0, Math.PI * 2); g.fill();
  } else if (name === 'maskCat') {
    face('#fbf7f0');
    ell(g, cx - 30 * k, y + 30 * k, 22 * k, 16 * k, -0.3, '#f0a040');
    for (const s of [-1, 1]) {
      g.strokeStyle = '#1a1414'; g.lineWidth = 4 * k; g.lineCap = 'round';
      g.beginPath(); g.arc(cx + s * 22 * k, y + 62 * k, 8 * k, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      ell(g, cx + s * 34 * k, y + 80 * k, 11 * k, 7 * k, 0, 'rgba(250,140,160,0.6)');
      g.lineWidth = 2 * k;
      for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(cx + s * 30 * k, y + (86 + i * 7) * k); g.lineTo(cx + s * 56 * k, y + (82 + i * 10) * k); g.stroke(); }
    }
    ell(g, cx, y + 80 * k, 6 * k, 4 * k, 0, '#f07890');
    g.strokeStyle = '#1a1414'; g.lineWidth = 3 * k;
    g.beginPath(); g.moveTo(cx - 10 * k, y + 90 * k); g.quadraticCurveTo(cx - 5 * k, y + 96 * k, cx, y + 88 * k); g.quadraticCurveTo(cx + 5 * k, y + 96 * k, cx + 10 * k, y + 90 * k); g.stroke();
  } else if (name === 'maskRabbit') {
    face('#fdfbf8');
    for (const s of [-1, 1]) {
      blob(g, cx + s * 22 * k, y + 60 * k, 9 * k, '#d8202a'); blob(g, cx + s * 20 * k, y + 57 * k, 3 * k, '#fff');
      ell(g, cx + s * 36 * k, y + 80 * k, 12 * k, 8 * k, 0, 'rgba(250,150,170,0.6)');
    }
    ell(g, cx, y + 80 * k, 6 * k, 5 * k, 0, '#f07890');
    g.strokeStyle = '#6a4a4a'; g.lineWidth = 3 * k;
    g.beginPath(); g.moveTo(cx, y + 84 * k); g.lineTo(cx, y + 92 * k); g.moveTo(cx - 9 * k, y + 96 * k); g.quadraticCurveTo(cx, y + 90 * k, cx + 9 * k, y + 96 * k); g.stroke();
  } else if (name === 'maskTengu') {
    face('#c8281e');
    g.fillStyle = '#f4f0e6';
    g.fillRect(x, y, S, 18 * k);
    for (const s of [-1, 1]) {
      g.fillStyle = '#f4f0e6';
      g.beginPath(); g.moveTo(cx + s * 6 * k, y + 44 * k); g.lineTo(cx + s * 50 * k, y + 30 * k); g.lineTo(cx + s * 48 * k, y + 44 * k); g.closePath(); g.fill();
      ell(g, cx + s * 24 * k, y + 56 * k, 11 * k, 8 * k, 0, '#f2d23a');
      blob(g, cx + s * 24 * k, y + 56 * k, 4.5 * k, '#111');
    }
    // beard
    g.fillStyle = '#f4f0e6';
    g.beginPath(); g.moveTo(cx - 40 * k, y + 96 * k); g.quadraticCurveTo(cx, y + 150 * k, cx + 40 * k, y + 96 * k); g.quadraticCurveTo(cx, y + 110 * k, cx - 40 * k, y + 96 * k); g.fill();
  }
  g.restore();
}

function drawBag(g, idx, x, y, w, h) {
  const bgs = ['#f9b8cf', '#fbe27a', '#b9e0fa', '#bfe9a6'];
  const g2 = g;
  g2.save();
  g2.beginPath(); g2.rect(x, y, w, h); g2.clip();
  g2.fillStyle = bgs[idx]; g2.fillRect(x, y, w, h);
  // stars / dots
  const rnd = prand(77 + idx);
  for (let i = 0; i < 16; i++) blob(g2, x + rnd() * w, y + rnd() * h, 2 + rnd() * 4, ['#fff', '#ff7aa8', '#7ac8ff', '#ffd23a'][i % 4]);
  // clear window band at the top (plastic)
  g2.fillStyle = 'rgba(255,255,255,0.45)'; g2.fillRect(x, y, w, 26);
  hText(g2, 'わたあめ', x + w / 2, y + 44, 22, { font: FONT_MARU, weight: 'bold', fill: '#e8327a', stroke: '#fff', strokeW: 5 });
  const cx = x + w / 2, cy = y + h * 0.6, R = w * 0.36;
  if (idx === 0) { // tanuki
    blob(g2, cx - R * 0.75, cy - R * 0.8, R * 0.3, '#8a5a36'); blob(g2, cx + R * 0.75, cy - R * 0.8, R * 0.3, '#8a5a36');
    blob(g2, cx, cy, R, '#a8744a'); ell(g2, cx, cy + R * 0.35, R * 0.55, R * 0.42, 0, '#f4e6cc');
    for (const s of [-1, 1]) { ell(g2, cx + s * R * 0.42, cy - R * 0.1, R * 0.3, R * 0.24, s * 0.4, '#4a3020'); blob(g2, cx + s * R * 0.4, cy - R * 0.12, R * 0.12, '#111'); blob(g2, cx + s * R * 0.36, cy - R * 0.18, R * 0.05, '#fff'); }
    blob(g2, cx, cy + R * 0.22, R * 0.1, '#1a1210');
    g2.fillStyle = '#4a9a3a'; g2.beginPath(); g2.ellipse(cx, cy - R * 0.9, R * 0.16, R * 0.3, 0.4, 0, Math.PI * 2); g2.fill();
  } else if (idx === 1) { // cat
    for (const s of [-1, 1]) { g2.fillStyle = '#fff'; g2.beginPath(); g2.moveTo(cx + s * R * 0.9, cy - R * 0.2); g2.lineTo(cx + s * R * 0.75, cy - R * 1.15); g2.lineTo(cx + s * R * 0.2, cy - R * 0.8); g2.closePath(); g2.fill(); }
    blob(g2, cx, cy, R, '#fff'); ell(g2, cx - R * 0.45, cy - R * 0.45, R * 0.35, R * 0.28, -0.4, '#f0a040');
    for (const s of [-1, 1]) { blob(g2, cx + s * R * 0.38, cy - R * 0.02, R * 0.12, '#222'); ell(g2, cx + s * R * 0.62, cy + R * 0.28, R * 0.16, R * 0.1, 0, '#f8a0b4'); }
    ell(g2, cx, cy + R * 0.18, R * 0.08, R * 0.06, 0, '#f07890');
  } else if (idx === 2) { // rabbit
    for (const s of [-1, 1]) { ell(g2, cx + s * R * 0.4, cy - R * 1.1, R * 0.22, R * 0.6, s * 0.15, '#fff'); ell(g2, cx + s * R * 0.4, cy - R * 1.1, R * 0.1, R * 0.45, s * 0.15, '#f8b4c4'); }
    blob(g2, cx, cy, R, '#fff');
    for (const s of [-1, 1]) { blob(g2, cx + s * R * 0.38, cy - R * 0.05, R * 0.12, '#d8202a'); ell(g2, cx + s * R * 0.6, cy + R * 0.28, R * 0.15, R * 0.1, 0, '#f8a0b4'); }
    ell(g2, cx, cy + R * 0.18, R * 0.08, R * 0.06, 0, '#f07890');
  } else { // frog
    blob(g2, cx - R * 0.5, cy - R * 0.75, R * 0.35, '#5ab83a'); blob(g2, cx + R * 0.5, cy - R * 0.75, R * 0.35, '#5ab83a');
    blob(g2, cx, cy, R, '#5ab83a');
    for (const s of [-1, 1]) { blob(g2, cx + s * R * 0.5, cy - R * 0.75, R * 0.24, '#fff'); blob(g2, cx + s * R * 0.5, cy - R * 0.72, R * 0.12, '#111'); ell(g2, cx + s * R * 0.62, cy + R * 0.2, R * 0.16, R * 0.1, 0, '#f8a0b4'); }
    g2.strokeStyle = '#2a5a1a'; g2.lineWidth = 3; g2.beginPath(); g2.arc(cx, cy + R * 0.05, R * 0.45, 0.2 * Math.PI, 0.8 * Math.PI); g2.stroke();
  }
  // plastic sheen
  const sh = g2.createLinearGradient(x, y, x + w, y);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.2, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.3, 'rgba(255,255,255,0)');
  g2.fillStyle = sh; g2.fillRect(x, y, w, h);
  g2.restore();
}

function drawGoodsAtlas(g) {
  const rnd = prand(4242);
  const cell = (name) => { const c = GOODS[name]; return [c[0] * GC, c[1] * GC, (c[2] || 1) * GC, (c[3] || 1) * GC]; };
  const fill = (name, col) => { const [x, y, w, h] = cell(name); g.fillStyle = col; g.fillRect(x, y, w, h); return [x, y, w, h]; };
  const speck = (x, y, w, h, n, cols, rmin, rmax) => { for (let i = 0; i < n; i++) blob(g, x + rnd() * w, y + rnd() * h, rmin + rnd() * (rmax - rmin), cols[i % cols.length]); };
  g.fillStyle = '#777'; g.fillRect(0, 0, GA, GA);
  // takoyaki
  let [x, y, w, h] = fill('tako', '#d89a42');
  speck(x, y, w, h, 60, ['#b8702a', '#e8b058', '#a05a1e'], 3, 9);
  [x, y, w, h] = fill('takoSauce', '#d89a42');
  speck(x, y + h * 0.5, w, h * 0.5, 40, ['#b8702a', '#e8b058'], 3, 8);
  g.fillStyle = '#4a2410'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * 0.55);
  for (let i = 8; i >= 0; i--) g.lineTo(x + (i / 8) * w, y + h * (0.5 + (i % 2) * 0.1));
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,220,180,0.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 20); g.lineTo(x + w, y + 26); g.stroke();
  g.strokeStyle = '#f6ecc6'; g.lineWidth = 4; g.beginPath();
  for (let i = 0; i <= 10; i++) g.lineTo(x + (i / 10) * w, y + (i % 2 ? 22 : 44));
  g.stroke();
  speck(x, y, w, h * 0.45, 70, ['#3f7a26', '#56942e'], 1, 2.5);
  speck(x, y, w, h * 0.4, 18, ['#d8a88a', '#c89070'], 2, 4);
  // noodles
  [x, y, w, h] = fill('noodle', '#8a5024');
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = ['#c88a4a', '#a8662e', '#6a3a18', '#d89a58'][i % 4]; g.lineWidth = 2 + rnd() * 2;
    g.beginPath(); let px = x + rnd() * w, py = y + rnd() * h; g.moveTo(px, py);
    for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 30; py += (rnd() - 0.5) * 30; g.lineTo(px, py); }
    g.stroke();
  }
  speck(x, y, w, h, 14, ['#c8e098', '#b0d080'], 4, 8);
  for (let i = 0; i < 10; i++) { g.fillStyle = '#e02838'; g.fillRect(x + rnd() * w, y + rnd() * h, 7, 2.5); }
  speck(x, y, w, h, 60, ['#3f7a26'], 1, 2);
  [x, y, w, h] = fill('cabbage', '#bcd88c'); speck(x, y, w, h, 30, ['#d8ecb0', '#9cc070'], 4, 10);
  [x, y, w, h] = fill('iron', '#2e2c2c'); speck(x, y, w, h, 80, ['#3a3636', '#262424'], 2, 6);
  fill('steel', '#c9ced3');
  [x, y, w, h] = fill('woodTray', '#dcc094');
  for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(120,80,40,0.18)'; g.fillRect(x, y + rnd() * h, w, 2); }
  fill('sauceBrown', '#4a2612');
  // candies
  const candy = (name, c0, c1) => { const [cx, cy, cw, ch] = cell(name); const gr = g.createLinearGradient(0, cy, 0, cy + ch); gr.addColorStop(0, c1); gr.addColorStop(0.5, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(cx, cy, cw, ch); };
  candy('apple', '#d8101e', '#9a0612'); candy('appleGreen', '#6ab82e', '#3a7a1a'); candy('grape', '#6a2a8a', '#3a1250'); candy('mikan', '#f7901a', '#d06008');
  [x, y, w, h] = fill('strawberry', '#e0182a'); speck(x, y, w, h, 40, ['#f7e07a'], 1.5, 2.5);
  fill('stick', '#ead6aa');
  fill('syrupRed', '#e4122a'); fill('syrupGreen', '#26b84a'); fill('syrupBlue', '#1a7ce0'); fill('syrupYellow', '#f6d21a');
  [x, y, w, h] = fill('ice', '#eef6fb'); speck(x, y, w, h, 70, ['#ffffff', '#d6e8f4'], 1, 3);
  [x, y, w, h] = fill('cup', '#f7f6f0');
  g.fillStyle = '#d8202a'; g.fillRect(x, y, w, 12);
  g.strokeStyle = '#2a6ac8'; g.lineWidth = 5;
  for (let r = 0; r < 3; r++) { g.beginPath(); for (let i = 0; i <= 16; i++) g.lineTo(x + (i / 16) * w, y + h - 18 - r * 12 + Math.sin(i * 1.6) * 5); g.stroke(); }
  fill('plastic', '#f2f0e8');
  [x, y, w, h] = fill('cardboard', '#bf9460');
  g.fillStyle = 'rgba(90,60,30,0.35)'; g.fillRect(x, y + h * 0.45, w, 10);
  hText(g, 'キャベツ', x + w / 2, y + h * 0.75, 24, { fill: '#2f8a3a', weight: '900' });
  fill('blue', '#2f6fb8'); fill('black', '#262626');
  // water with goldfish (256 × 256)
  [x, y, w, h] = cell('water');
  const wg = g.createLinearGradient(x, y, x + w, y + h);
  wg.addColorStop(0, '#6cc2e4'); wg.addColorStop(1, '#3f9cd0');
  g.fillStyle = wg; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.globalAlpha = 0.55;
  for (let i = 0; i < 10; i++) drawFish(g, x + rnd() * w, y + rnd() * h, 9 + rnd() * 5, rnd() * 6.28, ['#e8602a', '#d8301e', '#f08a3a'][i % 3]);
  g.globalAlpha = 1;
  for (let i = 0; i < 14; i++) {
    const kind = i % 5;
    const body = kind === 3 ? '#1e1a1a' : kind === 4 ? '#f6f0e8' : ['#f0581e', '#e02818', '#f7822a'][i % 3];
    const belly = kind === 4 ? '#e02818' : kind === 3 ? null : '#f7b060';
    drawFish(g, x + rnd() * w, y + rnd() * h, 10 + rnd() * 6, rnd() * 6.28, body, belly);
  }
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 12; i++) { const px = x + rnd() * w, py = y + rnd() * h; g.beginPath(); g.ellipse(px, py, 14 + rnd() * 20, 4 + rnd() * 5, 0, 0, Math.PI * 1.3); g.stroke(); }
  g.restore();
  const fishCell = (name, c0, c1) => { const [cx, cy, cw, ch] = cell(name); const gr = g.createLinearGradient(0, cy, 0, cy + ch); gr.addColorStop(0, c0); gr.addColorStop(0.65, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(cx, cy, cw, ch); };
  fishCell('fishOrange', '#f0561c', '#f7c080'); fishCell('fishRed', '#d82818', '#f6f0e8'); fishCell('fishBlack', '#1e1a1a', '#3a3434');
  fill('poiPaper', '#f6f6ee'); fill('pink', '#f27ab4'); fill('tub', '#2a7cd0');
  // goldfish bag
  [x, y, w, h] = cell('bagWater');
  const bg2 = g.createLinearGradient(x, y, x + w, y);
  bg2.addColorStop(0, '#9fd8ee'); bg2.addColorStop(0.5, '#cdeefa'); bg2.addColorStop(1, '#9fd8ee');
  g.fillStyle = bg2; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x + w * 0.62, y + 10, 6, h - 30);
  drawFish(g, x + w * 0.5, y + h * 0.66, 16, 0.3, '#f0501c', '#f7b060');
  drawFish(g, x + w * 0.02, y + h * 0.7, 14, 3.4, '#e02818', '#f7b060');
  drawFish(g, x + w * 0.98, y + h * 0.7, 14, 3.4, '#e02818', '#f7b060');
  const cotton = (name, c0, c1) => { const [cx, cy, cw, ch] = fill(name, c0); speck(cx, cy, cw, ch, 50, [c1, '#ffffff'], 4, 12); };
  cotton('cottonPink', '#f7b2cc', '#fbd0e0'); cotton('cottonWhite', '#f2f4fa', '#dfe6f4'); cotton('cottonBlue', '#bcdcf6', '#d8ecfb');
  [x, y, w, h] = fill('clear', '#d8e4ea'); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + 20, y, 10, h);
  // yakisoba pack (lid top view)
  [x, y, w, h] = fill('pack', '#9a5e2e');
  for (let i = 0; i < 40; i++) { g.strokeStyle = ['#c88a4a', '#6a3a18'][i % 2]; g.lineWidth = 2; g.beginPath(); const px = x + rnd() * w, py = y + rnd() * h; g.moveTo(px, py); g.quadraticCurveTo(px + 10, py + (rnd() - 0.5) * 20, px + 20, py + (rnd() - 0.5) * 10); g.stroke(); }
  speck(x, y, w, h, 8, ['#e02838', '#bcd88c'], 3, 5);
  g.fillStyle = 'rgba(230,240,245,0.35)'; g.fillRect(x, y, w, h);
  g.fillStyle = '#e03a4a'; g.fillRect(x + w * 0.45, y, 7, h);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 10, y, 8, h);
  // cotton candy bags
  for (let i = 0; i < 4; i++) { const [bx, by, bw, bh] = cell('bag' + i); drawBag(g, i, bx, by, bw, bh); }
  // masks
  for (const m of ['maskFox', 'maskHyottoko', 'maskOkame', 'maskOni', 'maskTanuki', 'maskCat', 'maskRabbit', 'maskTengu']) { const [mx, my] = cell(m); drawMask(g, m, mx, my, GC); }
  // solids
  fill('red', '#d8262a'); fill('yellow', '#f4c82a'); fill('green', '#3f9a44'); fill('cream', '#f6ecc8');
  fill('gold', '#e0b04a'); fill('orange', '#f28a24'); fill('purple', '#7a44a8'); fill('white', '#f4f2ec');
}

function drawGoodsORM(g, w, h) {
  const s = w / GA;
  g.fillStyle = 'rgb(0,178,0)'; g.fillRect(0, 0, w, h); // rough 0.7, metal 0
  for (const [name, c] of Object.entries(GOODS)) {
    const v = GOODS_ORM[name];
    if (!v) continue;
    g.fillStyle = `rgb(0,${Math.round(v[0] * 255)},${Math.round(v[1] * 255)})`;
    g.fillRect(c[0] * GC * s, c[1] * GC * s, (c[2] || 1) * GC * s, (c[3] || 1) * GC * s);
  }
}

/** Shared goods material. lit = warm fake light from the stall bulbs (night). */
export function goodsMat(lit = true) {
  const map = canvasTexture('festival.goods', GA, GA, drawGoodsAtlas);
  const orm = canvasTexture('festival.goods.orm', 256, 256, drawGoodsORM, { srgb: false });
  for (const t of [map, orm]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) {
    return mat('festival.goods.lit', {
      map, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
      emissiveMap: map, emissive: 0xffc890, emissiveIntensity: 0.42,
    });
  }
  return mat('festival.goods', { map, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1 });
}

// ===========================================================================
// Yatai signs (header valance, counter skirt, menu board, 氷 flag) — one canvas per type
// ===========================================================================
export const YATAI_TYPES = {
  takoyaki: { name: 'たこ焼き', canopy: ['#d8262a', '#f6f0e4'], bg: '#f7d23a', ink: '#d8202a', stroke: '#fff', border: '#d8202a', skirtBg: '#d8262a', skirtInk: '#fff', skirt: '名物たこ焼', price: '8個 500円', menu: ['たこ焼', '六個 三百円', '八個 五百円', 'ねぎ多め'], lantern: '祭' },
  yakisoba: { name: '焼きそば', canopy: ['#f08a1c', '#f6f0e4'], bg: '#fbfaf2', ink: '#1e1a18', stroke: '#f08a1c', border: '#1e1a18', skirtBg: '#1e1a18', skirtInk: '#f7a23a', skirt: 'ソース焼きそば', price: '大盛 600円', menu: ['焼きそば', '並 五百円', '大盛 六百円', '目玉焼のせ'], lantern: '祭' },
  wataame: { name: 'わたあめ', canopy: ['#f58ab8', '#fbf2f4'], bg: '#fde0ec', ink: '#e0307a', stroke: '#fff', border: '#e0307a', skirtBg: '#fbc6dc', skirtInk: '#c01e66', skirt: 'ふわふわ', price: '1袋 500円', menu: ['わたあめ', '一袋 五百円', 'いちご味', 'ソーダ味'], lantern: '祭' },
  kingyo: { name: '金魚すくい', canopy: ['#2a6ac8', '#f4f6f8'], bg: '#e4f4fb', ink: '#d8202a', stroke: '#fff', border: '#2a6ac8', skirtBg: '#2a6ac8', skirtInk: '#fff', skirt: '金魚すくい', price: '1回 300円', menu: ['金魚すくい', '一回 三百円', 'ポイ二枚', 'おまけ付'], lantern: '金魚' },
  ringoame: { name: 'りんご飴', canopy: ['#d81e5a', '#fbf0f2'], bg: '#d8202a', ink: '#fff', stroke: '#7a0a10', border: '#f7d23a', skirtBg: '#fbf4ea', skirtInk: '#d8202a', skirt: 'りんご飴', price: '1本 400円', menu: ['りんご飴', '大 五百円', '小 三百円', 'いちご飴'], lantern: '祭' },
  kakigori: { name: 'かき氷', canopy: ['#3aa8e0', '#f6fafc'], bg: '#fbfdff', ink: '#2a6ac8', stroke: '#fff', border: '#d8202a', skirtBg: '#fbfbf6', skirtInk: '#d8202a', skirt: '氷', price: '1杯 300円', menu: ['かき氷', 'いちご', 'メロン', 'ブルーハワイ'], lantern: '氷' },
  omen: { name: 'お面', canopy: ['#3a9a4a', '#f4f6ee'], bg: '#5b2a86', ink: '#fbd23a', stroke: '#2a0e44', border: '#fbd23a', skirtBg: '#5b2a86', skirtInk: '#fff', skirt: 'お面 各種', price: '1枚 800円', menu: ['お面', 'きつね', 'ひょっとこ', 'おかめ'], lantern: '祭' },
};
export const SIGN_W = 1024, SIGN_H = 768;
export const SIGN_RECT = {
  header: rectUV(0, 0, 1024, 176, SIGN_W, SIGN_H),
  skirt: rectUV(0, 176, 1024, 256, SIGN_W, SIGN_H),
  menu: rectUV(0, 432, 512, 336, SIGN_W, SIGN_H),
  flag: rectUV(512, 432, 256, 336, SIGN_W, SIGN_H),
  tag: rectUV(768, 432, 256, 336, SIGN_W, SIGN_H),
};

function waves(g, x, y, w, h, col, rows = 3, amp = 8) {
  g.strokeStyle = col; g.lineWidth = 6; g.lineCap = 'round';
  for (let r = 0; r < rows; r++) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) g.lineTo(x + (i / 40) * w, y + r * (h / rows) + Math.sin(i * 0.9 + r) * amp);
    g.stroke();
  }
}

function drawIllust(g, type, cx, cy, s) {
  if (type === 'takoyaki') { // octopus with hachimaki
    g.strokeStyle = '#d8202a'; g.lineWidth = s * 0.14; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(cx + (i - 2) * s * 0.18, cy + s * 0.2); g.quadraticCurveTo(cx + (i - 2) * s * 0.35, cy + s * 0.5, cx + (i - 2) * s * 0.28 + s * 0.12, cy + s * 0.62); g.stroke(); }
    blob(g, cx, cy - s * 0.1, s * 0.42, '#e8302a');
    g.fillStyle = '#fff'; g.fillRect(cx - s * 0.44, cy - s * 0.3, s * 0.88, s * 0.12);
    blob(g, cx - s * 0.15, cy, s * 0.06, '#111'); blob(g, cx + s * 0.15, cy, s * 0.06, '#111');
    blob(g, cx, cy + s * 0.14, s * 0.1, '#b0101a'); blob(g, cx, cy + s * 0.14, s * 0.05, '#e8302a');
  } else if (type === 'yakisoba') {
    ell(g, cx, cy + s * 0.25, s * 0.6, s * 0.2, 0, '#f4f4ee');
    ell(g, cx, cy + s * 0.08, s * 0.45, s * 0.28, 0, '#9a5a28');
    g.strokeStyle = '#c88a4a'; g.lineWidth = 4;
    for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(cx + (i - 3) * s * 0.1, cy + s * 0.05, s * 0.2, 3.6, 5.6); g.stroke(); }
    blob(g, cx + s * 0.1, cy - s * 0.1, s * 0.06, '#e02838'); blob(g, cx - s * 0.15, cy - s * 0.02, s * 0.05, '#e02838');
  } else if (type === 'wataame') {
    g.strokeStyle = '#e8d4a8'; g.lineWidth = s * 0.07; g.beginPath(); g.moveTo(cx, cy + s * 0.65); g.lineTo(cx, cy); g.stroke();
    for (let i = 0; i < 7; i++) blob(g, cx + Math.cos(i) * s * 0.22, cy - s * 0.15 + Math.sin(i * 1.7) * s * 0.18, s * 0.24, i % 2 ? '#f9b6cf' : '#fbc8dc');
    for (let i = 0; i < 4; i++) star(g, cx + (i - 1.5) * s * 0.5, cy - s * 0.55 + (i % 2) * s * 0.9, s * 0.1, '#ffd23a');
  } else if (type === 'kingyo') {
    drawFish(g, cx - s * 0.15, cy - s * 0.05, s * 0.3, 0.2, '#f0501c', '#f7b060');
    drawFish(g, cx + s * 0.3, cy + s * 0.25, s * 0.22, -0.4, '#e02818', '#f7b060');
    g.strokeStyle = '#2a6ac8'; g.lineWidth = 4;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx - s * 0.4 + i * s * 0.2, cy - s * 0.45, s * 0.05 + i * 2, 0, Math.PI * 2); g.stroke(); }
  } else if (type === 'ringoame') {
    g.strokeStyle = '#e8d4a8'; g.lineWidth = s * 0.07; g.beginPath(); g.moveTo(cx, cy - s * 0.2); g.lineTo(cx, cy - s * 0.7); g.stroke();
    blob(g, cx, cy, s * 0.42, '#c8101c'); blob(g, cx - s * 0.14, cy - s * 0.14, s * 0.1, 'rgba(255,255,255,0.7)');
    g.fillStyle = '#3f9a3a'; g.beginPath(); g.ellipse(cx + s * 0.2, cy - s * 0.42, s * 0.16, s * 0.08, -0.5, 0, Math.PI * 2); g.fill();
  } else if (type === 'kakigori') {
    g.fillStyle = '#f7f6f0'; g.beginPath(); g.moveTo(cx - s * 0.3, cy); g.lineTo(cx + s * 0.3, cy); g.lineTo(cx + s * 0.2, cy + s * 0.55); g.lineTo(cx - s * 0.2, cy + s * 0.55); g.closePath(); g.fill();
    g.fillStyle = '#2a6ac8'; g.fillRect(cx - s * 0.25, cy + s * 0.3, s * 0.5, s * 0.08);
    g.fillStyle = '#e4122a'; g.beginPath(); g.arc(cx, cy, s * 0.36, Math.PI, 0); g.fill();
    g.fillStyle = '#f4f8fb'; g.beginPath(); g.arc(cx + s * 0.1, cy - s * 0.12, s * 0.12, 0, Math.PI * 2); g.fill();
  } else if (type === 'omen') {
    ell(g, cx, cy, s * 0.36, s * 0.46, 0, '#f7f2ea');
    for (const sg of [-1, 1]) { g.fillStyle = '#f7f2ea'; g.beginPath(); g.moveTo(cx + sg * s * 0.1, cy - s * 0.35); g.lineTo(cx + sg * s * 0.34, cy - s * 0.7); g.lineTo(cx + sg * s * 0.36, cy - s * 0.2); g.closePath(); g.fill(); }
    g.strokeStyle = '#d62a1e'; g.lineWidth = 5;
    for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(cx + sg * s * 0.06, cy - s * 0.05); g.lineTo(cx + sg * s * 0.28, cy - s * 0.14); g.stroke(); }
    blob(g, cx, cy + s * 0.3, s * 0.05, '#111');
  }
}

function star(g, cx, cy, r, col) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}

function drawSign(type) {
  const T = YATAI_TYPES[type];
  return (g) => {
    const rnd = prand(hashStr(type));
    // --- header (1024 × 176) ---
    g.fillStyle = T.bg; g.fillRect(0, 0, 1024, 176);
    fibres(g, 0, 0, 1024, 176, 300, rnd, '0,0,0', 0.05, 20);
    g.strokeStyle = T.border; g.lineWidth = 10; g.strokeRect(8, 8, 1008, 160);
    g.lineWidth = 3; g.strokeRect(22, 22, 980, 132);
    drawIllust(g, type, 120, 88, 120);
    drawIllust(g, type, 904, 88, 120);
    hText(g, T.name, 512, 92, 128, { font: FONT_GOTHIC, weight: '900', fill: T.ink, stroke: T.stroke, strokeW: 20, maxW: 600, shadow: 'rgba(0,0,0,0.25)' });
    // --- skirt (1024 × 256) ---
    g.fillStyle = T.skirtBg; g.fillRect(0, 176, 1024, 256);
    fibres(g, 0, 176, 1024, 256, 300, rnd, '255,255,255', 0.06, 20);
    if (type === 'kakigori') {
      waves(g, 0, 176 + 180, 1024, 60, '#2a6ac8', 2, 10);
      hText(g, '氷', 512, 176 + 110, 190, { font: FONT_MINCHO, weight: 'bold', fill: '#d8202a', stroke: '#fff', strokeW: 6 });
      hText(g, T.price, 830, 176 + 120, 44, { fill: '#2a6ac8', weight: '900' });
      hText(g, 'いちご・メロン', 190, 176 + 110, 40, { fill: '#2a6ac8', weight: '900', maxW: 300 });
    } else {
      g.strokeStyle = T.skirtInk; g.globalAlpha = 0.6; g.lineWidth = 4; g.strokeRect(16, 192, 992, 224); g.globalAlpha = 1;
      hText(g, T.skirt, 440, 176 + 128, 104, { font: FONT_MINCHO, weight: 'bold', fill: T.skirtInk, maxW: 620 });
      g.fillStyle = T.skirtInk; g.beginPath(); g.arc(880, 176 + 128, 84, 0, Math.PI * 2); g.fill();
      hText(g, T.price.split(' ')[0], 880, 176 + 100, 40, { fill: T.skirtBg, weight: '900' });
      hText(g, T.price.split(' ')[1], 880, 176 + 152, 46, { fill: T.skirtBg, weight: '900' });
    }
    // --- menu board (512 × 336) ---
    const my = 432;
    const wg = g.createLinearGradient(0, my, 0, my + 336);
    wg.addColorStop(0, '#e4c898'); wg.addColorStop(1, '#d2b07a');
    g.fillStyle = wg; g.fillRect(0, my, 512, 336);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(110,70,30,${0.05 + rnd() * 0.08})`; g.fillRect(0, my + rnd() * 336, 512, 1 + rnd() * 2); }
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 10; g.strokeRect(5, my + 5, 502, 326);
    g.fillStyle = '#c8261e'; g.fillRect(420, my + 18, 70, 300);
    vText(g, 'お品書き', 455, my + 168, 58, { font: FONT_MINCHO, fill: '#fff' });
    T.menu.forEach((line, i) => vText(g, line, 360 - i * 92, my + 168, Math.min(58, 290 / [...line].length), { font: FONT_MINCHO, fill: '#1e1614' }));
    // --- 氷 flag (256 × 336) ---
    g.fillStyle = '#fbfbf6'; g.fillRect(512, my, 256, 336);
    g.fillStyle = '#2a6ac8'; g.fillRect(512, my, 256, 22);
    waves(g, 512, my + 262, 256, 60, '#2a6ac8', 3, 7);
    hText(g, '氷', 640, my + 150, 190, { font: FONT_MINCHO, weight: 'bold', fill: '#d8202a' });
    // --- tag (256 × 336) ---
    g.fillStyle = '#fff6d8'; g.fillRect(768, my, 256, 336);
    g.strokeStyle = '#d8202a'; g.lineWidth = 8; g.strokeRect(776, my + 8, 240, 320);
    vText(g, 'おいしいよ', 896, my + 168, 52, { font: FONT_MARU, fill: '#d8202a' });
  };
}

export function yataiSignMat(type, lit = true) {
  const tex = canvasTexture(`festival.sign.${type}`, SIGN_W, SIGN_H, drawSign(type));
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) {
    return mat(`festival.sign.${type}.lit`, { map: tex, emissiveMap: tex, emissive: 0xfff0dc, emissiveIntensity: 0.55, roughness: 0.85, side: THREE.DoubleSide });
  }
  return mat(`festival.sign.${type}`, { map: tex, roughness: 0.85, side: THREE.DoubleSide });
}

/** Striped canopy cloth; 1 repeat = 2 stripes. */
export function canopyMat(colors, lit = true) {
  const key = `festival.canopy.${colors[0]}.${colors[1]}`;
  const tex = canvasTexture(key, 256, 256, (g, w, h) => {
    const rnd = prand(hashStr(key));
    g.fillStyle = colors[0]; g.fillRect(0, 0, w / 2, h);
    g.fillStyle = colors[1]; g.fillRect(w / 2, 0, w / 2, h);
    // soft seam shading + weave
    const sg = g.createLinearGradient(0, 0, w / 2, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0.10)'); sg.addColorStop(0.1, 'rgba(0,0,0,0)'); sg.addColorStop(0.9, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.10)');
    g.fillStyle = sg; g.fillRect(0, 0, w / 2, h); g.save(); g.translate(w / 2, 0); g.fillRect(0, 0, w / 2, h); g.restore();
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(0,0,0,${0.025 + rnd() * 0.02})`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.02})`; g.fillRect(x, 0, 1, h); }
  });
  if (lit) return mat(key + '.lit', { map: tex, emissiveMap: tex, emissive: 0xffd8a8, emissiveIntensity: 0.28, roughness: 0.9, side: THREE.DoubleSide });
  return mat(key, { map: tex, roughness: 0.9, side: THREE.DoubleSide });
}

/** Stall wood; lit = faint warm fill as if lit by the stall's own bulbs (night). */
export function stallWoodMat(lit = true) {
  const base = { color: 0xa47a52, roughness: 0.82, map: TEX.wood() };
  if (lit) return mat('festival.stallWood.lit', { ...base, emissiveMap: TEX.wood(), emissive: 0xffa060, emissiveIntensity: 0.16 });
  return mat('festival.stallWood', base);
}

// ===========================================================================
// Roof eave (fascia tile ends + soffit rafters) — u repeats every 0.6 m
// ===========================================================================
export function eaveMat(lit = false) {
  const tex = canvasTexture('festival.eave', 512, 512, (g) => {
    const rnd = prand(31);
    // fascia (top half → v 0.5..1): round eave tiles with mitsudomoe
    g.fillStyle = '#4b5159'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#3a3f46'; g.fillRect(0, 200, 512, 56);
    for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(160,170,180,0.35)'; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= 512; x += 16) g.lineTo(x, 226 + Math.sin(x * 0.05 + i) * 6); g.stroke(); break; }
    for (const cx of [128, 384]) {
      g.fillStyle = '#2e3238'; g.beginPath(); g.arc(cx + 4, 108, 100, 0, Math.PI * 2); g.fill();
      const rg = g.createRadialGradient(cx - 30, 80, 10, cx, 104, 100);
      rg.addColorStop(0, '#8a939e'); rg.addColorStop(1, '#5d646e');
      g.fillStyle = rg; g.beginPath(); g.arc(cx, 104, 96, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#454b53'; g.lineWidth = 8; g.beginPath(); g.arc(cx, 104, 74, 0, Math.PI * 2); g.stroke();
      tomoe(g, cx, 104, 52, '#40454c');
    }
    // soffit (bottom half → v 0..0.5): boards + rafters running along v
    g.fillStyle = '#6e4c34'; g.fillRect(0, 256, 512, 256);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,25,15,${0.05 + rnd() * 0.1})`; g.fillRect(rnd() * 512, 256, 1 + rnd() * 3, 256); }
    for (const x of [64, 320]) {
      g.fillStyle = 'rgba(20,12,8,0.55)'; g.fillRect(x - 36, 256, 84, 256);
      const rg = g.createLinearGradient(x - 32, 0, x + 32, 0);
      rg.addColorStop(0, '#8a6444'); rg.addColorStop(0.5, '#a57a54'); rg.addColorStop(1, '#7a5638');
      g.fillStyle = rg; g.fillRect(x - 32, 256, 64, 256);
    }
  });
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) {
    // warm bounce on the soffit only (lanterns / windows below light the eaves at night)
    const em = canvasTexture('festival.eave.emit', 256, 256, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
      const gr = g.createLinearGradient(0, 128, 0, 256);
      gr.addColorStop(0, '#6a4228'); gr.addColorStop(1, '#a8703e');
      g.fillStyle = gr; g.fillRect(0, 128, 256, 128);
      for (const x of [32, 160]) { g.fillStyle = '#c08850'; g.fillRect(x - 16, 128, 32, 128); }
    });
    em.wrapT = THREE.ClampToEdgeWrapping;
    return mat('festival.eave.lit', { map: tex, roughness: 0.75, metalness: 0.05, emissiveMap: em, emissive: 0xffb070, emissiveIntensity: 0.36 });
  }
  return mat('festival.eave', { map: tex, roughness: 0.75, metalness: 0.05 });
}

// ===========================================================================
// 紅白幕 (red & white curtain) + yagura sign. Canvas 512 × 1024:
//   v 0.25..1 → stripes (u repeat 0.9 m = one red + one white stripe), top band with loops
//   v 0..0.25 → sign board 「盆踊り」
// ===========================================================================
export const KOHAKU_V = [0.25, 1.0];
export const KOHAKU_SIGN = rectUV(0, 768, 512, 256, 512, 1024);
export function kohakuMat(lit = true) {
  const tex = canvasTexture('festival.kohaku', 512, 1024, (g) => {
    const rnd = prand(5);
    g.fillStyle = '#d42330'; g.fillRect(0, 0, 256, 768);
    g.fillStyle = '#f5f0e6'; g.fillRect(256, 0, 256, 768);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.04})`; g.fillRect(rnd() * 512, rnd() * 768, 1, 6 + rnd() * 20); }
    // top band (navy) with white rope loops
    g.fillStyle = '#1f2a4a'; g.fillRect(0, 0, 512, 44);
    for (const x of [64, 192, 320, 448]) { g.strokeStyle = '#f2eee4'; g.lineWidth = 7; g.beginPath(); g.ellipse(x, 22, 16, 26, 0, 0, Math.PI * 2); g.stroke(); }
    // hem at the bottom
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 752, 512, 16);
    // sign board
    g.fillStyle = '#f7f2e6'; g.fillRect(0, 768, 512, 256);
    g.strokeStyle = '#c8261e'; g.lineWidth = 14; g.strokeRect(10, 778, 492, 236);
    g.lineWidth = 4; g.strokeRect(30, 798, 452, 196);
    hText(g, '盆踊り', 256, 900, 150, { font: FONT_MINCHO, weight: 'bold', fill: '#c8261e', maxW: 420 });
  });
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) return mat('festival.kohaku.lit', { map: tex, emissiveMap: tex, emissive: 0xffd2a8, emissiveIntensity: 0.32, roughness: 0.9, side: THREE.DoubleSide });
  return mat('festival.kohaku', { map: tex, roughness: 0.9, side: THREE.DoubleSide });
}

// ===========================================================================
// Taiko
// ===========================================================================
export function taikoBodyMat() {
  const tex = canvasTexture('festival.taikoBody', 512, 256, (g) => {
    const rnd = prand(8);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5a2414'); gr.addColorStop(0.5, '#7a3218'); gr.addColorStop(1, '#5a2414');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 160; i++) {
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '30,10,5' : '160,90,50'},${0.05 + rnd() * 0.12})`;
      g.lineWidth = 1 + rnd() * 2;
      const x = rnd() * 512;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 32) g.lineTo(x + Math.sin(y * 0.03 + i) * 6, y);
      g.stroke();
    }
  });
  return mat('festival.taikoBody', { map: tex, roughness: 0.32, metalness: 0.0 });
}
export function taikoHeadMat(lit = false) {
  const tex = canvasTexture('festival.taikoHead', 512, 512, (g) => {
    const rnd = prand(12);
    g.fillStyle = '#e6d8b8'; g.fillRect(0, 0, 512, 512);
    const rg = g.createRadialGradient(256, 256, 60, 256, 256, 256);
    rg.addColorStop(0, '#efe4c8'); rg.addColorStop(0.8, '#e6d6b2'); rg.addColorStop(0.97, '#cdb78c'); rg.addColorStop(1, '#b89c70');
    g.fillStyle = rg; g.beginPath(); g.arc(256, 256, 256, 0, Math.PI * 2); g.fill();
    fibres(g, 0, 0, 512, 512, 260, rnd, '120,90,50', 0.12, 30);
    g.fillStyle = 'rgba(90,60,30,0.10)'; g.beginPath(); g.arc(250, 262, 90, 0, Math.PI * 2); g.fill();
    tomoe(g, 256, 256, 120, '#1f1a19');
    g.strokeStyle = 'rgba(31,26,25,0.85)'; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 146, 0, Math.PI * 2); g.stroke();
  });
  if (lit) return mat('festival.taikoHead.lit', { map: tex, roughness: 0.6, emissiveMap: tex, emissive: 0xffc890, emissiveIntensity: 0.28 });
  return mat('festival.taikoHead', { map: tex, roughness: 0.6 });
}

/** Yagura / structural timber (slightly light so it reads at night). */
export function yaguraWoodMat(lit = false) {
  const base = { color: 0xc49a70, roughness: 0.8, map: TEX.wood() };
  if (lit) return mat('festival.yaguraWood.lit', { ...base, emissiveMap: TEX.wood(), emissive: 0xff9a50, emissiveIntensity: 0.14 });
  return mat('festival.yaguraWood', base);
}

// ===========================================================================
// Window atlas (shoji / glass / glow) — 1024 × 512, 8 cells of 256². lit → emissive warm light.
// ===========================================================================
export const WIN = {};
['shoji', 'shojiPerson', 'shojiDim', 'glassDoor', 'glow', 'yukimi', 'shojiPlant', 'amado'].forEach((k, i) => {
  WIN[k] = rectUV((i % 4) * 256 + 2, Math.floor(i / 4) * 256 + 2, 252, 252, 1024, 512);
});

function drawShoji(g, x, y, w, h, frame, bar, cols, rows, paperFn) {
  paperFn(x, y, w, h);
  g.fillStyle = bar;
  for (let c = 1; c < cols; c++) g.fillRect(x + (c * w) / cols - 2, y, 4, h);
  for (let r = 1; r < rows; r++) g.fillRect(x, y + (r * h) / rows - 2, w, 4);
  g.strokeStyle = frame; g.lineWidth = 14; g.strokeRect(x + 7, y + 7, w - 14, h - 14);
  g.fillStyle = frame; g.fillRect(x + w / 2 - 4, y, 8, h);
}

function drawWindows(emit) {
  return (g) => {
    const rnd = prand(emit ? 71 : 70);
    const frame = emit ? '#000' : '#4a3222';
    const bar = emit ? 'rgba(0,0,0,0.85)' : '#6a4a32';
    const paper = (bright) => (x, y, w, h) => {
      if (emit) {
        const gr = g.createRadialGradient(x + w / 2, y + h * 0.55, 10, x + w / 2, y + h / 2, w * 0.75);
        gr.addColorStop(0, `rgb(${Math.round(255 * bright)},${Math.round(208 * bright)},${Math.round(130 * bright)})`);
        gr.addColorStop(1, `rgb(${Math.round(220 * bright)},${Math.round(140 * bright)},${Math.round(70 * bright)})`);
        g.fillStyle = gr; g.fillRect(x, y, w, h);
      } else {
        g.fillStyle = '#efe8d8'; g.fillRect(x, y, w, h);
        fibres(g, x, y, w, h, 80, rnd, '150,130,100', 0.1, 14);
      }
    };
    g.fillStyle = emit ? '#000' : '#3a2a1e'; g.fillRect(0, 0, 1024, 512);
    // 0 shoji
    drawShoji(g, 0, 0, 256, 256, frame, bar, 4, 5, paper(1));
    // 1 shoji with a silhouette
    drawShoji(g, 256, 0, 256, 256, frame, bar, 4, 5, (x, y, w, h) => {
      paper(1)(x, y, w, h);
      g.fillStyle = emit ? 'rgba(60,30,10,0.75)' : 'rgba(80,70,60,0.35)';
      g.beginPath(); g.arc(x + 150, y + 96, 22, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(x + 112, y + 256); g.quadraticCurveTo(x + 118, y + 130, x + 150, y + 122); g.quadraticCurveTo(x + 188, y + 130, x + 196, y + 256); g.fill();
    });
    // 2 dim shoji
    drawShoji(g, 512, 0, 256, 256, frame, bar, 3, 4, paper(0.72));
    // 3 glass sliding door (entrance)
    {
      const x = 768, y = 0;
      if (emit) {
        const gr = g.createLinearGradient(0, y, 0, y + 256);
        gr.addColorStop(0, 'rgb(250,190,110)'); gr.addColorStop(1, 'rgb(255,214,150)');
        g.fillStyle = gr; g.fillRect(x, y, 256, 256);
        g.fillStyle = 'rgba(80,40,10,0.6)'; g.fillRect(x + 40, y + 150, 70, 80); g.fillRect(x + 150, y + 170, 60, 60);
        g.fillStyle = 'rgba(255,240,200,1)'; g.beginPath(); g.arc(x + 128, y + 60, 26, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = '#2c3440'; g.fillRect(x, y, 256, 256);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 30, y, 20, 256);
      }
      g.fillStyle = frame;
      g.fillRect(x, y, 256, 14); g.fillRect(x, y + 242, 256, 14); g.fillRect(x, y, 14, 256); g.fillRect(x + 242, y, 14, 256); g.fillRect(x + 122, y, 12, 256);
      g.fillRect(x, y + 200, 256, 8);
      for (const xx of [x + 64, x + 190]) g.fillRect(xx - 2, y, 4, 200);
    }
    // 4 plain warm glow (behind lattices)
    {
      const x = 0, y = 256;
      if (emit) {
        const gr = g.createRadialGradient(x + 128, y + 150, 10, x + 128, y + 128, 180);
        gr.addColorStop(0, 'rgb(255,214,140)'); gr.addColorStop(1, 'rgb(200,120,60)');
        g.fillStyle = gr; g.fillRect(x, y, 256, 256);
      } else { g.fillStyle = '#3a3028'; g.fillRect(x, y, 256, 256); g.fillStyle = '#e8e0cc'; g.fillRect(x + 20, y + 30, 216, 200); }
    }
    // 5 yukimi shoji (glass lower part)
    drawShoji(g, 256, 256, 256, 256, frame, bar, 4, 3, (x, y, w, h) => {
      paper(0.95)(x, y, w, h);
      if (emit) { g.fillStyle = 'rgb(255,190,110)'; g.fillRect(x, y + h * 0.6, w, h * 0.4); g.fillStyle = 'rgba(90,40,10,0.7)'; g.fillRect(x + 60, y + h * 0.75, 50, h * 0.25); }
      else { g.fillStyle = '#34404c'; g.fillRect(x, y + h * 0.6, w, h * 0.4); }
    });
    // 6 shoji with plant shadow
    drawShoji(g, 512, 256, 256, 256, frame, bar, 4, 5, (x, y, w, h) => {
      paper(0.9)(x, y, w, h);
      g.strokeStyle = emit ? 'rgba(70,35,10,0.7)' : 'rgba(80,90,70,0.3)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x + 60, y + 256); g.quadraticCurveTo(x + 90, y + 140, x + 70, y + 40); g.stroke();
      g.fillStyle = g.strokeStyle;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(x + 70 + (i % 2 ? 22 : -18), y + 60 + i * 20, 20, 6, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2); g.fill(); }
    });
    // 7 closed wooden shutters (amado) — dark even when lit
    {
      const x = 768, y = 256;
      g.fillStyle = emit ? '#000' : '#5a4030'; g.fillRect(x, y, 256, 256);
      if (!emit) for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + i * 32, y, 3, 256); }
    }
  };
}

export function windowMat(lit = true) {
  const map = canvasTexture('festival.windows', 1024, 512, drawWindows(false));
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) {
    const em = canvasTexture('festival.windows.emit', 1024, 512, drawWindows(true));
    em.wrapS = em.wrapT = THREE.ClampToEdgeWrapping;
    return mat('festival.windows.lit', { map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.85 });
  }
  return mat('festival.windows', { map, roughness: 0.6 });
}

// ===========================================================================
// Deco atlas (noren, signs, plaques) — 1024², lit → faint fill light so they read at night
// ===========================================================================
export const DECO = {
  norenYu: rectUV(0, 0, 512, 512, 1024, 1024),
  ryokanSign: rectUV(512, 0, 256, 1024, 1024, 1024),
  sugidama: rectUV(768, 0, 256, 256, 1024, 1024),
  gold: ptUV(900, 400, 1024, 1024),
  darkWood: ptUV(900, 470, 1024, 1024),
  plaque: rectUV(768, 512, 256, 512, 1024, 1024),
  noren: {
    '酒': rectUV(0, 512, 256, 256, 1024, 1024),
    '茶': rectUV(256, 512, 256, 256, 1024, 1024),
    '甘味': rectUV(0, 768, 256, 256, 1024, 1024),
    '宿': rectUV(256, 768, 256, 256, 1024, 1024),
  },
};
const NOREN_STYLE = {
  '酒': { bg: '#1f3260', ink: '#f4f0e6' },
  '茶': { bg: '#3f5a2c', ink: '#f4f0e6' },
  '甘味': { bg: '#8a2230', ink: '#f7efe2' },
  '宿': { bg: '#5a3a24', ink: '#f4ead8' },
};

function drawDeco(g) {
  const rnd = prand(99);
  g.fillStyle = '#444'; g.fillRect(0, 0, 1024, 1024);
  // ryokan noren 「ゆ」 (indigo)
  g.fillStyle = '#1d2f5e'; g.fillRect(0, 0, 512, 512);
  fibres(g, 0, 0, 512, 512, 500, rnd, '255,255,255', 0.06, 24);
  g.fillStyle = '#16244a'; g.fillRect(0, 0, 512, 40);
  // the 512² cell is stretched ≈3.1× horizontally on the 4-panel noren → draw squeezed
  g.save(); g.translate(256, 290); g.scale(1 / 3.1, 1);
  g.strokeStyle = '#f2eee4'; g.lineWidth = 30; g.beginPath(); g.arc(0, 0, 175, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 205, 0, Math.PI * 2); g.stroke();
  g.restore();
  g.save(); g.translate(256, 300); g.scale(1 / 3.1, 1);
  hText(g, 'ゆ', 0, 0, 270, { font: FONT_MINCHO, weight: 'bold', fill: '#f4f0e6' });
  g.restore();
  // small maker text at the corners
  vText(g, '源泉', 40, 150, 34, { font: FONT_MINCHO, fill: '#e8e2d2', squeeze: 1 / 3.1 });
  // ryokan hanging sign (dark wood board, carved gilt letters)
  {
    const x = 512, y = 0, w = 256, h = 1024;
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, '#2e1d12'); gr.addColorStop(0.5, '#4a3020'); gr.addColorStop(1, '#2e1d12');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + rnd() * 0.15})`; g.fillRect(x + rnd() * w, y, 1 + rnd() * 2, h); }
    g.strokeStyle = '#c8a050'; g.lineWidth = 10; g.strokeRect(x + 14, y + 14, w - 28, h - 28);
    vText(g, '旅館', x + w / 2, y + 190, 118, { font: FONT_MINCHO, fill: '#e8c46a', stroke: '#1a0f08', strokeW: 6 });
    vText(g, 'ぽんぽこ', x + w / 2, y + 620, 150, { font: FONT_MINCHO, fill: '#f0d27a', stroke: '#1a0f08', strokeW: 8, gap: -0.02 });
  }
  // sugidama (cedar ball) needles
  {
    const x = 768, y = 0;
    g.fillStyle = '#4a5a2a'; g.fillRect(x, y, 256, 256);
    for (let i = 0; i < 900; i++) { g.strokeStyle = ['#5f7a34', '#3a4a1e', '#7a8a3e', '#6a5a2a'][i % 4]; g.lineWidth = 2; const px = x + rnd() * 256, py = y + rnd() * 256, a = rnd() * 6.28; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8); g.stroke(); }
  }
  // swatches: gold, dark wood
  g.fillStyle = '#d8b050'; g.fillRect(768, 256, 256, 180);
  g.fillStyle = '#3a2618'; g.fillRect(768, 436, 256, 76);
  // plaque 扁額 (horizontal board 「ぽんぽこの湯」 drawn rotated in a 256 × 512 cell → mapped rotated)
  {
    const x = 768, y = 512, w = 256, h = 512;
    g.fillStyle = '#2e1d12'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#c8a050'; g.lineWidth = 12; g.strokeRect(x + 12, y + 12, w - 24, h - 24);
    vText(g, 'ぽんぽこの湯', x + w / 2, y + h / 2, 72, { font: FONT_MINCHO, fill: '#f0d27a', gap: 0.0 });
  }
  // machiya noren variants
  for (const [txt, st] of Object.entries(NOREN_STYLE)) {
    const r = DECO.noren[txt];
    const x = r[0] * 1024, y = (1 - r[3]) * 1024;
    g.fillStyle = st.bg; g.fillRect(x, y, 256, 256);
    fibres(g, x, y, 256, 256, 200, rnd, '255,255,255', 0.06, 18);
    // the cell is stretched ≈1.8× horizontally on the 2-panel noren → draw squeezed
    g.save(); g.translate(x + 128, y); g.scale(1 / 1.8, 1);
    g.strokeStyle = st.ink; g.lineWidth = 7; g.beginPath(); g.arc(0, 66, 40, 0, Math.PI * 2); g.stroke();
    hText(g, '丸', 0, 68, 44, { font: FONT_MINCHO, fill: st.ink });
    const n = [...txt].length;
    if (n === 1) hText(g, txt, 0, 172, 120, { font: FONT_MINCHO, fill: st.ink });
    else hText(g, txt, 0, 172, 110, { font: FONT_MINCHO, fill: st.ink, maxW: 380 });
    g.restore();
  }
}

export function decoMat(lit = true) {
  const map = canvasTexture('festival.deco', 1024, 1024, drawDeco);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) return mat('festival.deco.lit', { map, emissiveMap: map, emissive: 0xffd8b0, emissiveIntensity: 0.35, roughness: 0.85, side: THREE.DoubleSide });
  return mat('festival.deco', { map, roughness: 0.85, side: THREE.DoubleSide });
}

/** Building timber: 'dark' (焦茶) or 'bengara' (紅殻). lit → faint warm fill (windows / lanterns nearby). */
export function buildingWoodMat(kind = 'dark', lit = true) {
  const col = kind === 'bengara' ? 0x8a4a34 : kind === 'aged' ? 0x8a7a68 : 0x6e4e38;
  const base = { color: col, roughness: 0.82, map: TEX.wood() };
  const key = `festival.bwood.${kind}`;
  if (lit) return mat(key + '.lit', { ...base, emissiveMap: TEX.wood(), emissive: 0xff9a50, emissiveIntensity: 0.08 });
  return mat(key, base);
}

/** Clean lime plaster (fine grain + faint rain streaks), tinted per variant. 1 repeat = 2 m. */
export function plasterMat(tint = 'white') {
  const tex = canvasTexture('festival.plasterTex', 256, 256, (g) => {
    const rnd = prand(41);
    g.fillStyle = '#f6f3ee'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '120,110,100' : '255,255,255'},${rnd() * 0.06})`; g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5); }
    for (let i = 0; i < 18; i++) { const x = rnd() * 256; const gr = g.createLinearGradient(0, 0, 0, 120 + rnd() * 100); gr.addColorStop(0, 'rgba(110,100,90,0.07)'); gr.addColorStop(1, 'rgba(110,100,90,0)'); g.fillStyle = gr; g.fillRect(x, 0, 3 + rnd() * 8, 256); }
  });
  const col = { white: 0xf4f0e8, ochre: 0xe8d6b2, grey: 0xd8d6d0, rose: 0xecd6ca }[tint] || 0xf4f0e8;
  return mat(`festival.plaster.${tint}`, { color: col, roughness: 0.95, map: tex });
}

// ===========================================================================
// People atlas (festival goers) — 1024², ONE material for every person.
//   rows 0-1: 8 yukata patterns (256²; lathe u = around with 0.5 = front, v = hem → neck)
//   y 512-640: 4 faces (256 × 128; sphere u 0.25 = front)
//   y 640-768: 2 hair cells + 2 extra (256 × 128)
//   y 768-896: 32 solid swatches (64 × 64)
//   y 896-1024: uchiwa prints, goldfish bag, fox mask, candy bag (128²)
// ===========================================================================
export const YUKATA = ['asagao', 'asanoha', 'sakura', 'stripes', 'kasuri', 'goldfish', 'dots', 'hydrangea',
  'ajisaiWhite', 'navyAsagao', 'blackKingyo', 'greyStripes', 'brownKikko', 'greenTombo', 'lavenderSakura', 'orangeDots'];
const YUKATA_BASE = { asagao: '#f1efe8', asanoha: '#233a6b', sakura: '#f2b4c4', stripes: '#9aa8ba', kasuri: '#1f2a46', goldfish: '#d8323a', dots: '#f2cc48', hydrangea: '#6c5cae',
  ajisaiWhite: '#f3f1f4', navyAsagao: '#1c2c58', blackKingyo: '#23201f', greyStripes: '#4a4e56', brownKikko: '#3e3a44', greenTombo: '#2f5a44', lavenderSakura: '#9a86c8', orangeDots: '#f08a3a' };
export const PSW = ['skin', 'red', 'yellow', 'pink', 'navy', 'white', 'purple', 'green', 'orange', 'grey', 'brown', 'black', 'wood', 'hanao', 'kanzashi', 'ribbon',
  'lightblue', 'gold', 'cream', 'dark', 'skinShade', 'teal', 'lime', 'rose', 'maroon', 'sky', 'olive', 'lilac', 'peach', 'mint', 'sand', 'slate'];
const PSW_COL = ['#f4d2b8', '#d8283a', '#f4c632', '#f49ab8', '#24345e', '#f4f1e8', '#7a4aa8', '#3f9a4a', '#f28a2a', '#8a8f98', '#7a5234', '#2a2322', '#d8b27a', '#c8202a', '#f06a9a', '#e8323a',
  '#8ccaf0', '#e0b04a', '#f4e8c8', '#3a2c26', '#e4b89c', '#2a8a8a', '#a8d040', '#e87a8a', '#7a2230', '#5ab0e8', '#7a7a3a', '#b8a0d8', '#f8c0a0', '#a0e0c0', '#d8c8a0', '#5a6a80'];
const PH = 1536; // people atlas height
export const PEOPLE = {
  yukata: (i) => rectUV((i % 4) * 256 + 1, Math.floor(i / 4) * 256 + 1, 254, 254, 1024, PH),
  yukataPlain: (i) => rectUV((i % 4) * 256 + 20, Math.floor(i / 4) * 256 + 150, 216, 96, 1024, PH),
  face: (i) => rectUV(i * 256, 1024, 256, 128, 1024, PH),
  hair: (i) => rectUV(i * 256, 1152, 256, 128, 1024, PH),
  sw: (name) => { const i = PSW.indexOf(name); return ptUV((i % 16) * 64 + 32, 1280 + Math.floor(i / 16) * 64 + 32, 1024, PH); },
  uchiwa: (i) => rectUV(i * 128 + 2, 1410, 124, 124, 1024, PH),
  bag: rectUV(384 + 2, 1410, 124, 124, 1024, PH),
  fox: rectUV(512 + 3, 1411, 122, 122, 1024, PH),
  candy: rectUV(640 + 2, 1410, 124, 124, 1024, PH),
};

function flower(g, x, y, r, petals, col, center) {
  g.fillStyle = col;
  for (let i = 0; i < petals; i++) { const a = (i / petals) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.36, a, 0, Math.PI * 2); g.fill(); }
  if (center) { g.fillStyle = center; g.beginPath(); g.arc(x, y, r * 0.22, 0, Math.PI * 2); g.fill(); }
}

function drawYukata(g, name, x0, y0) {
  const S = 256;
  const rnd = prand(hashStr(name));
  g.save();
  g.beginPath(); g.rect(x0, y0, S, S); g.clip();
  const base = YUKATA_BASE[name];
  g.fillStyle = base; g.fillRect(x0, y0, S, S);
  // wrap-safe pattern: draw each motif at x and x ± S
  const wrap = (fn) => { for (const dx of [-S, 0, S]) fn(dx); };
  if (name === 'asagao') {
    for (let i = 0; i < 14; i++) {
      const px = rnd() * S, py = rnd() * S, r = 13 + rnd() * 7, c = ['#3a5ac8', '#7a4ab8', '#3a8ad8'][i % 3];
      wrap((dx) => {
        g.strokeStyle = '#4a8a3a'; g.lineWidth = 2.5; g.beginPath(); g.arc(x0 + px + dx - r, y0 + py + r, r * 1.2, -0.5, 1.2); g.stroke();
        g.fillStyle = '#5a9a3a'; g.beginPath(); g.ellipse(x0 + px + dx + r * 1.1, y0 + py + r * 0.6, r * 0.6, r * 0.35, 0.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = c; g.beginPath(); g.arc(x0 + px + dx, y0 + py, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f6f3fb'; star(g, x0 + px + dx, y0 + py, r * 0.55, '#f2eefb');
      });
    }
  } else if (name === 'asanoha') {
    g.strokeStyle = 'rgba(240,240,235,0.85)'; g.lineWidth = 1.6;
    const s = 22, hgt = s * Math.sqrt(3) / 2;
    for (let row = -1; row < S / hgt + 1; row++) {
      for (let col = -1; col < S / s + 1; col++) {
        const cx = x0 + col * s + (row % 2 ? s / 2 : 0), cy = y0 + row * hgt;
        for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * s / 2, cy + Math.sin(a) * s / 2); g.stroke(); }
        g.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k * Math.PI) / 3 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * s * 0.29, cy + Math.sin(a) * s * 0.29); } g.stroke();
      }
    }
  } else if (name === 'sakura') {
    for (let i = 0; i < 22; i++) { const px = rnd() * S, py = rnd() * S, r = 9 + rnd() * 8; wrap((dx) => flower(g, x0 + px + dx, y0 + py, r, 5, i % 3 ? '#fbf2f4' : '#e0506a', '#f4d04a')); }
  } else if (name === 'stripes') {
    for (let x = 0; x < S; x += 16) { g.fillStyle = '#3a4658'; g.fillRect(x0 + x, y0, 3, S); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0 + x + 7, y0, 1.5, S); }
  } else if (name === 'kasuri') {
    g.fillStyle = 'rgba(235,235,230,0.85)';
    for (let yy = 8; yy < S; yy += 28) for (let xx = (yy / 28) % 2 ? 14 : 0; xx < S; xx += 28) { g.fillRect(x0 + xx, y0 + yy, 10, 3); g.fillRect(x0 + xx + 3.5, y0 + yy - 3.5, 3, 10); }
  } else if (name === 'goldfish') {
    for (let i = 0; i < 10; i++) { const px = rnd() * S, py = rnd() * S; wrap((dx) => drawFish(g, x0 + px + dx, y0 + py, 11, rnd() * 6, i % 2 ? '#f6f0e4' : '#f7a23a', '#fff2d0', '#f6f0e4')); }
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(x0 + rnd() * S, y0 + rnd() * S, 2 + rnd() * 3, 0, Math.PI * 2); g.stroke(); }
  } else if (name === 'dots') {
    for (let yy = 10; yy < S; yy += 26) for (let xx = (yy / 26) % 2 ? 13 : 0; xx < S; xx += 26) blob(g, x0 + xx, y0 + yy, 5, (xx + yy) % 3 ? '#fbf6e8' : '#f28a2a');
  } else if (name === 'ajisaiWhite') {
    for (let i = 0; i < 9; i++) {
      const px = rnd() * S, py = rnd() * S;
      wrap((dx) => { for (let k = 0; k < 7; k++) flower(g, x0 + px + dx + Math.cos(k) * 11, y0 + py + Math.sin(k * 1.3) * 11, 8, 4, k % 2 ? '#7a8ad8' : '#b07ac8', '#f4f4f4'); });
    }
    for (let i = 0; i < 8; i++) { const px = rnd() * S, py = rnd() * S; wrap((dx) => { g.fillStyle = '#6a9a5a'; g.beginPath(); g.ellipse(x0 + px + dx, y0 + py, 12, 6, rnd() * 3, 0, 7); g.fill(); }); }
  } else if (name === 'navyAsagao') {
    for (let i = 0; i < 12; i++) {
      const px = rnd() * S, py = rnd() * S, r = 13 + rnd() * 7, c = ['#f4f2fb', '#8ab8f0', '#d8a8f0'][i % 3];
      wrap((dx) => { g.fillStyle = c; g.beginPath(); g.arc(x0 + px + dx, y0 + py, r, 0, 7); g.fill(); star(g, x0 + px + dx, y0 + py, r * 0.5, '#1c2c58'); });
    }
  } else if (name === 'blackKingyo') {
    for (let i = 0; i < 10; i++) { const px = rnd() * S, py = rnd() * S; wrap((dx) => drawFish(g, x0 + px + dx, y0 + py, 12, rnd() * 6, i % 3 ? '#e0302a' : '#f2f0e8', '#f7a060', '#f06a4a')); }
    g.strokeStyle = 'rgba(120,160,220,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(x0 + rnd() * S, y0 + rnd() * S, 8 + rnd() * 10, 3.6, 5.6); g.stroke(); }
  } else if (name === 'greyStripes') {
    for (let x = 0; x < S; x += 12) { g.fillStyle = 'rgba(230,230,225,0.8)'; g.fillRect(x0 + x, y0, 1.5, S); }
    for (let x = 6; x < S; x += 48) { g.fillStyle = 'rgba(20,20,24,0.5)'; g.fillRect(x0 + x, y0, 4, S); }
  } else if (name === 'brownKikko') {
    g.strokeStyle = 'rgba(220,210,190,0.45)'; g.lineWidth = 1.4;
    const s2 = 14, hh = s2 * Math.sqrt(3);
    for (let row = -1; row < S / hh + 1; row++) for (let col = -1; col < S / (s2 * 3) + 1; col++) {
      for (const [ox, oy] of [[0, 0], [s2 * 1.5, hh / 2]]) {
        const cx = x0 + col * s2 * 3 + ox, cy = y0 + row * hh + oy;
        g.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(cx + Math.cos(a) * s2 * 0.92, cy + Math.sin(a) * s2 * 0.92); } g.stroke();
      }
    }
  } else if (name === 'greenTombo') {
    for (let i = 0; i < 12; i++) {
      const px = rnd() * S, py = rnd() * S, a = rnd() * 6;
      wrap((dx) => {
        g.save(); g.translate(x0 + px + dx, y0 + py); g.rotate(a);
        g.fillStyle = '#f0ead8'; g.fillRect(-2, -16, 4, 30);
        g.fillStyle = 'rgba(240,234,216,0.75)';
        for (const sgn of [-1, 1]) for (const yy of [-9, -3]) { g.beginPath(); g.ellipse(sgn * 11, yy, 11, 3.5, sgn * 0.15, 0, 7); g.fill(); }
        g.restore();
      });
    }
  } else if (name === 'lavenderSakura') {
    for (let i = 0; i < 20; i++) { const px = rnd() * S, py = rnd() * S, r = 9 + rnd() * 7; wrap((dx) => flower(g, x0 + px + dx, y0 + py, r, 5, i % 4 ? '#f6f2fb' : '#f4b8d0', '#f4d04a')); }
  } else if (name === 'orangeDots') {
    for (let yy = 10; yy < S; yy += 24) for (let xx = (yy / 24) % 2 ? 12 : 0; xx < S; xx += 24) blob(g, x0 + xx, y0 + yy, 5.5, (xx + yy) % 5 ? '#fff4e0' : '#3a8ad8');
  } else if (name === 'hydrangea') {
    for (let i = 0; i < 9; i++) {
      const px = rnd() * S, py = rnd() * S;
      wrap((dx) => { for (let k = 0; k < 7; k++) flower(g, x0 + px + dx + Math.cos(k) * 11, y0 + py + Math.sin(k * 1.3) * 11, 8, 4, k % 2 ? '#a8c8f4' : '#e8b0e0', '#f4f4f4'); });
    }
  }
  // collar V (front centre = u 0.5) + front panel edge + hem
  const cx = x0 + S / 2;
  const light = ['asagao', 'sakura', 'dots', 'ajisaiWhite', 'lavenderSakura', 'orangeDots'].includes(name);
  const collar = light ? 'rgba(40,40,60,0.5)' : 'rgba(0,0,0,0.35)';
  g.lineCap = 'round';
  g.strokeStyle = collar; g.lineWidth = 15;
  g.beginPath(); g.moveTo(cx + 24, y0 - 4); g.lineTo(cx - 2, y0 + 56); g.stroke();
  g.beginPath(); g.moveTo(cx - 26, y0 - 4); g.lineTo(cx + 6, y0 + 60); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx - 18, y0 - 4); g.lineTo(cx + 10, y0 + 58); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx + 8, y0 + 60); g.lineTo(cx + 22, y0 + S); g.stroke();
  const sh = g.createLinearGradient(0, y0, 0, y0 + S);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.85, 'rgba(0,0,0,0.05)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = sh; g.fillRect(x0, y0, S, S);
  g.restore();
}

function drawFace(g, kind, x0, y0) {
  const W = 256, H = 128;
  g.fillStyle = '#f4d2b8'; g.fillRect(x0, y0, W, H);
  const cx = x0 + W * 0.25, cy = y0 + H * 0.56;
  const kid = kind >= 2, man = kind === 1 || kind === 3;
  const ex = kid ? 15 : 14, ey = cy + (kid ? 3 : 0), er = kid ? 6.5 : 5.5;
  for (const s of [-1, 1]) {
    // eyes: dark oval with highlight
    g.fillStyle = '#2a1e1c'; g.beginPath(); g.ellipse(cx + s * ex, ey, er * 0.8, er * 1.15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a3a30'; g.beginPath(); g.ellipse(cx + s * ex, ey + er * 0.35, er * 0.55, er * 0.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + s * ex - 1.5, ey - er * 0.45, er * 0.32, 0, Math.PI * 2); g.fill();
    // brows
    g.strokeStyle = '#3a2a24'; g.lineWidth = man ? 2.6 : 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + s * (ex - 5), ey - er - 6); g.quadraticCurveTo(cx + s * ex, ey - er - (man ? 8 : 9), cx + s * (ex + 5), ey - er - 6); g.stroke();
    // blush
    if (!man || kid) { g.fillStyle = 'rgba(240,120,120,0.35)'; g.beginPath(); g.ellipse(cx + s * (ex + 9), ey + 9, 6, 3.5, 0, 0, Math.PI * 2); g.fill(); }
  }
  // mouth
  g.strokeStyle = '#8a3a34'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy + 17, kid ? 4.5 : 3.5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  if (kind === 2) { g.fillStyle = '#e86a6a'; g.beginPath(); g.arc(cx, cy + 18.5, 2.2, 0, Math.PI); g.fill(); }
  // ears hint
  g.fillStyle = '#e8bca0';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 40, cy + 2, 4, 7, 0, 0, Math.PI * 2); g.fill(); }
}

function drawHair(g, col, hi, x0, y0) {
  const W = 256, H = 128;
  const rnd = prand(hashStr(col));
  g.fillStyle = col; g.fillRect(x0, y0, W, H);
  for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rnd() * 0.08})`; g.lineWidth = 1 + rnd(); const x = x0 + rnd() * W; g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + (rnd() - 0.5) * 10, y0 + H * 0.5, x + (rnd() - 0.5) * 16, y0 + H); g.stroke(); }
  const gr = g.createLinearGradient(0, y0 + H * 0.25, 0, y0 + H * 0.45);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, hi); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(x0, y0 + H * 0.25, W, H * 0.2);
}

function drawPeople(g) {
  g.fillStyle = '#888'; g.fillRect(0, 0, 1024, PH);
  YUKATA.forEach((n, i) => drawYukata(g, n, (i % 4) * 256, Math.floor(i / 4) * 256));
  for (let k = 0; k < 4; k++) drawFace(g, k, k * 256, 1024);
  drawHair(g, '#2c2220', 'rgba(170,150,190,0.35)', 0, 1152);
  drawHair(g, '#5a3826', 'rgba(230,190,150,0.35)', 256, 1152);
  drawHair(g, '#1e1a1c', 'rgba(150,160,200,0.3)', 512, 1152);
  drawHair(g, '#7a4a2a', 'rgba(250,210,160,0.35)', 768, 1152);
  PSW.forEach((n, i) => { g.fillStyle = PSW_COL[i]; g.fillRect((i % 16) * 64, 1280 + Math.floor(i / 16) * 64, 64, 64); });
  // uchiwa prints
  const U = [['#8fd0f0', 'fish'], ['#1f2a50', 'fire'], ['#f7f2e6', 'matsuri']];
  U.forEach(([bg, kind], i) => {
    const x = i * 128, y = 1408;
    g.fillStyle = bg; g.fillRect(x, y, 128, 128);
    if (kind === 'fish') { drawFish(g, x + 64, y + 70, 22, -0.3, '#f0501c', '#f7b060'); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(x + 30, y + 34, 8, 0, 7); g.stroke(); }
    if (kind === 'fire') { for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.strokeStyle = ['#ff6a8a', '#ffd23a', '#7ae0ff'][k % 3]; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 64 + Math.cos(a) * 12, y + 60 + Math.sin(a) * 12); g.lineTo(x + 64 + Math.cos(a) * 44, y + 60 + Math.sin(a) * 44); g.stroke(); } }
    if (kind === 'matsuri') { g.fillStyle = '#d8283a'; g.beginPath(); g.arc(x + 64, y + 64, 50, 0, 7); g.fill(); hText(g, '祭', x + 64, y + 66, 66, { font: FONT_MINCHO, fill: '#fff' }); }
  });
  // goldfish bag
  {
    const x = 384, y = 1408;
    const bg2 = g.createLinearGradient(x, y, x + 128, y);
    bg2.addColorStop(0, '#9fd8ee'); bg2.addColorStop(0.5, '#d6f2fb'); bg2.addColorStop(1, '#9fd8ee');
    g.fillStyle = bg2; g.fillRect(x, y, 128, 128);
    drawFish(g, x + 64, y + 84, 16, 0.3, '#f0501c', '#f7b060');
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x + 84, y + 20, 5, 80);
  }
  drawMask(g, 'maskFox', 512, 1408, 128);
  drawBag(g, 0, 640, 1408, 128, 128);
}

/** People material; lit = warm fill as if lit by the surrounding lanterns / stalls (night). */
export function peopleMat(lit = true) {
  const map = canvasTexture('festival.people', 1024, PH, drawPeople);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) return mat('festival.people.lit', { map, roughness: 0.78, emissiveMap: map, emissive: 0xffd2a8, emissiveIntensity: 0.3 });
  return mat('festival.people', { map, roughness: 0.78 });
}

// ===========================================================================
// のぼり旗 (per colour + text). Canvas 256 × 1024 → cloth 0.6 × 2.4 m.
// ===========================================================================
export const NOBORI_COLORS = {
  red: { bg: '#d42a2a', ink: '#fbf6ea', band: '#f4d23a', edge: '#8a1414', stroke: '#6a0e0e' },
  white: { bg: '#f6f2e6', ink: '#c8201e', band: '#c8201e', edge: '#c8201e', stroke: '#fff' },
  indigo: { bg: '#23366a', ink: '#fbf6ea', band: '#e8323a', edge: '#121e40', stroke: '#0c1430' },
  yellow: { bg: '#f4cc2c', ink: '#c01e18', band: '#c01e18', edge: '#b0801a', stroke: '#fff6d0' },
  green: { bg: '#2f8a44', ink: '#fbf6ea', band: '#f4d23a', edge: '#1a5a2a', stroke: '#123c1c' },
  pink: { bg: '#f27aa8', ink: '#fff', band: '#fbf2f6', edge: '#c0406a', stroke: '#a02a5a' },
  sky: { bg: '#4aaae0', ink: '#fff', band: '#f6f2e6', edge: '#2a6aa8', stroke: '#1a4a80' },
};
export function noboriMat(text = '祭', color = 'red', lit = false) {
  const C = NOBORI_COLORS[color] || NOBORI_COLORS.red;
  const key = `festival.nobori.${color}.${text}`;
  const tex = canvasTexture(key, 256, 1024, (g) => {
    const rnd = prand(hashStr(key));
    g.fillStyle = C.bg; g.fillRect(0, 0, 256, 1024);
    fibres(g, 0, 0, 256, 1024, 600, rnd, '255,255,255', 0.05, 26);
    // top band with a crest
    g.fillStyle = C.band; g.fillRect(0, 0, 256, 120);
    tomoe(g, 136, 60, 40, C.bg === '#f6f2e6' ? '#f6f2e6' : C.bg);
    // bottom waves
    g.fillStyle = C.band; g.fillRect(0, 940, 256, 84);
    g.strokeStyle = C.bg; g.lineWidth = 6;
    for (let i = 0; i < 3; i++) { g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, 960 + i * 20 + Math.sin(x * 0.06 + i) * 6); g.stroke(); }
    // loops (乳) along the pole side (u = 0)
    g.fillStyle = C.edge;
    for (let y = 130; y < 940; y += 88) g.fillRect(0, y, 18, 30);
    // text
    const n = [...text].length;
    const size = Math.min(n === 1 ? 210 : 760 / n, 200);
    vText(g, text, 136, 130 + (940 - 130) / 2, size, { font: FONT_MINCHO, weight: 'bold', fill: C.ink, stroke: C.stroke, strokeW: size * 0.1, gap: 0.04 });
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) return mat(key + '.lit', { map: tex, emissiveMap: tex, emissive: 0xffd8b0, emissiveIntensity: 0.3, roughness: 0.9, side: THREE.DoubleSide });
  return mat(key, { map: tex, roughness: 0.9, side: THREE.DoubleSide });
}

// ===========================================================================
// 竹灯り bamboo lights: 1024 × 576 canvas; 4 hole-pattern cells (256 × 512) + strip for inner glow
// ===========================================================================
export const TAKE = {
  cell: (i) => rectUV(i * 256, 0, 256, 512, 1024, 576),
  inner: ptUV(128, 544, 1024, 576),
  cut: ptUV(640, 544, 1024, 576),
};
function drawTake(emit) {
  return (g) => {
    const rnd = prand(emit ? 3 : 3);
    g.fillStyle = emit ? '#000' : '#6f9a3c'; g.fillRect(0, 0, 1024, 576);
    if (!emit) {
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '30,50,10' : '220,230,160'},${0.05 + rnd() * 0.08})`; g.fillRect(rnd() * 1024, 0, 1 + rnd() * 3, 512); }
      const sh = g.createLinearGradient(0, 0, 0, 512);
      sh.addColorStop(0, 'rgba(200,190,90,0.25)'); sh.addColorStop(1, 'rgba(40,60,20,0.2)');
      g.fillStyle = sh; g.fillRect(0, 0, 1024, 512);
    }
    const hole = (x, y, fn) => {
      for (const dx of [-256, 0, 256]) {
        const cx = x + dx;
        g.save();
        g.fillStyle = emit ? '#e8903a' : '#1e1a10';
        fn(cx, y);
        if (emit) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,220,150,0.35)'; fn(cx, y, 0.5); }
        g.restore();
      }
    };
    for (let c = 0; c < 4; c++) {
      g.save(); g.beginPath(); g.rect(c * 256, 0, 256, 512); g.clip();
      const X = c * 256;
      if (c === 0) { // dots + crescent moon
        for (let row = 0; row < 9; row++) for (let k = 0; k < 6; k++) hole(X + k * 42 + (row % 2) * 21, 70 + row * 42, (x, y, s = 1) => { g.beginPath(); g.arc(x, y, 7 * s, 0, 7); g.fill(); });
        hole(X + 128, 440, (x, y, s = 1) => { if (s !== 1) return; g.beginPath(); g.arc(x, y, 34, 0, 7); g.arc(x + 14, y - 8, 30, 0, 7, true); g.fill('evenodd'); });
      } else if (c === 1) { // sakura
        for (let i = 0; i < 14; i++) { const x = X + rnd() * 256, y = 50 + rnd() * 420; hole(x, y, (xx, yy, s = 1) => flower(g, xx, yy, 22 * s, 5, g.fillStyle, null)); }
      } else if (c === 2) { // stars
        for (let i = 0; i < 18; i++) { const x = X + rnd() * 256, y = 40 + rnd() * 440, r = 10 + rnd() * 12; hole(x, y, (xx, yy, s = 1) => star(g, xx, yy, r * s, g.fillStyle)); }
      } else { // spiral of drops
        for (let i = 0; i < 40; i++) { const t = i / 40; hole(X + ((t * 3 * 256) % 256), 40 + t * 440, (x, y, s = 1) => { g.beginPath(); g.ellipse(x, y, 9 * s, 13 * s, 0.5, 0, 7); g.fill(); }); }
      }
      g.restore();
    }
    // strip: inner glow + cut surface
    if (emit) {
      const gr = g.createLinearGradient(0, 512, 512, 576);
      gr.addColorStop(0, '#d89048'); gr.addColorStop(1, '#b86420');
      g.fillStyle = gr; g.fillRect(0, 512, 512, 64);
      g.fillStyle = '#000'; g.fillRect(512, 512, 512, 64);
    } else {
      g.fillStyle = '#e8d8a0'; g.fillRect(0, 512, 512, 64);
      g.fillStyle = '#d8d49a'; g.fillRect(512, 512, 512, 64);
    }
  };
}
export function takeMat(lit = true) {
  const map = canvasTexture('festival.take', 1024, 576, drawTake(false));
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) {
    const em = canvasTexture('festival.take.emit', 1024, 576, drawTake(true));
    em.wrapS = em.wrapT = THREE.ClampToEdgeWrapping;
    return mat('festival.take.lit', { map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.55, roughness: 0.5 });
  }
  return mat('festival.take', { map, roughness: 0.5 });
}

// ===========================================================================
// Street lamp glass (frosted, 「湯」 printed on two panes)
// ===========================================================================
export const LAMPGLASS = { plain: rectUV(0, 0, 128, 256, 256, 256), text: rectUV(128, 0, 128, 256, 256, 256) };
function drawLampGlass(emit) {
  return (g) => {
    for (const x0 of [0, 128]) {
      if (emit) {
        const gr = g.createRadialGradient(x0 + 64, 150, 8, x0 + 64, 128, 140);
        gr.addColorStop(0, '#ffe0a8'); gr.addColorStop(0.55, '#f0a050'); gr.addColorStop(1, '#b85a20');
        g.fillStyle = gr;
      } else {
        const gr = g.createLinearGradient(x0, 0, x0 + 128, 256);
        gr.addColorStop(0, '#dfe6e8'); gr.addColorStop(1, '#b8c2c6');
        g.fillStyle = gr;
      }
      g.fillRect(x0, 0, 128, 256);
      g.fillStyle = emit ? 'rgba(0,0,0,0.5)' : 'rgba(60,60,60,0.35)';
      g.fillRect(x0, 0, 128, 10); g.fillRect(x0, 246, 128, 10);
    }
    hText(g, '湯', 192, 132, 88, { font: FONT_MINCHO, fill: emit ? '#1a0a02' : '#3a3530', stroke: emit ? 'rgba(20,8,0,0.7)' : null, strokeW: emit ? 6 : 0 });
  };
}
export function lampGlassMat(lit = true) {
  const map = canvasTexture('festival.lampglass', 256, 256, drawLampGlass(false));
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  if (lit) {
    const em = canvasTexture('festival.lampglass.emit', 256, 256, drawLampGlass(true));
    em.wrapS = em.wrapT = THREE.ClampToEdgeWrapping;
    return mat('festival.lampglass.lit', { map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.35, roughness: 0.3 });
  }
  return mat('festival.lampglass', { map, roughness: 0.15, metalness: 0.1 });
}
export function ironMat() { return mat('festival.iron', { color: 0x2c3230, roughness: 0.45, metalness: 0.6 }); }

// ===========================================================================
// Nodate: red felt (毛氈) + red parasol paper
// ===========================================================================
export function feltMat(lit = false) {
  const tex = canvasTexture('festival.felt', 128, 128, (g) => {
    const rnd = prand(15);
    g.fillStyle = '#c42428'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,120,120'},${rnd() * 0.08})`; g.fillRect(rnd() * 128, rnd() * 128, 1.5, 1.5); }
  });
  if (lit) return mat('festival.felt.lit', { map: tex, roughness: 1.0, emissiveMap: tex, emissive: 0xffc8a0, emissiveIntensity: 0.22 });
  return mat('festival.felt', { map: tex, roughness: 1.0 });
}
export function parasolMat(lit = false) {
  const tex = canvasTexture('festival.parasol', 512, 256, (g) => {
    const rnd = prand(16);
    g.fillStyle = '#c8262c'; g.fillRect(0, 0, 512, 256);
    fibres(g, 0, 0, 512, 256, 400, rnd, '255,200,180', 0.08, 20);
    // v = 0 at the rim (bottom of canvas) → dark rim thread + white ring near the top (頭紙)
    g.fillStyle = '#7a1014'; g.fillRect(0, 244, 512, 12);
    g.fillStyle = '#f2e6d0'; g.fillRect(0, 0, 512, 18);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 512; x += 16) g.fillRect(x, 0, 1.5, 256);
  });
  if (lit) return mat('festival.parasol.lit', { map: tex, roughness: 0.8, side: THREE.DoubleSide, emissiveMap: tex, emissive: 0xffc8a0, emissiveIntensity: 0.22 });
  return mat('festival.parasol', { map: tex, roughness: 0.8, side: THREE.DoubleSide });
}

// ===========================================================================
// Onsen: rock, milky water, mineral crust
// ===========================================================================
export function rockMat() {
  const tex = canvasTexture('festival.rock', 256, 256, (g) => {
    const rnd = prand(21);
    g.fillStyle = '#8a8680'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) { const c = 90 + rnd() * 70; g.fillStyle = `rgba(${c},${c - 4},${c - 10},0.35)`; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 2 + rnd() * 10, 0, 7); g.fill(); }
    for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(40,36,32,0.35)'; g.lineWidth = 1 + rnd(); g.beginPath(); let x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  });
  return mat('festival.rock', { map: tex, roughness: 0.92 });
}
export function onsenWaterMat() {
  const tex = canvasTexture('festival.onsenWater', 256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, '#d4f2ec'); gr.addColorStop(0.7, '#9fd8d0'); gr.addColorStop(1, '#7cc0b8');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
    for (const r of [30, 58, 88, 112]) { g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke(); }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return mat('festival.onsenWater', { map: tex, roughness: 0.06, metalness: 0.1, emissiveMap: tex, emissive: 0x6aa8a0, emissiveIntensity: 0.25 });
}
export function crustMat() {
  const tex = canvasTexture('festival.crust', 256, 64, (g) => {
    const rnd = prand(22);
    g.fillStyle = '#d8d0a8'; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 500; i++) { g.fillStyle = ['rgba(240,236,210,0.6)', 'rgba(200,180,110,0.4)', 'rgba(150,150,130,0.3)'][i % 3]; g.beginPath(); g.arc(rnd() * 256, rnd() * 64, 1 + rnd() * 4, 0, 7); g.fill(); }
  });
  return mat('festival.crust', { map: tex, roughness: 0.95 });
}
