// Shared material + procedural texture cache.
// All props must get their materials from here (getMat / mat) so that identical
// materials are shared. The level builder merges geometry per material and
// instances props, so sharing materials directly reduces draw calls.
import * as THREE from 'three';

const matCache = new Map();
const texCache = new Map();

// ---------------------------------------------------------------------------
// Procedural canvas textures (light-toned, meant to be tinted by material.color)
// ---------------------------------------------------------------------------

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create (or fetch cached) CanvasTexture.
 * @param {string} key unique cache key
 * @param {number} w
 * @param {number} h
 * @param {(ctx:CanvasRenderingContext2D, w:number, h:number)=>void} draw
 * @param {{srgb?:boolean, repeat?:[number,number]}} [opts]
 */
export function canvasTexture(key, w, h, draw, opts = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

export const TEX = {
  // vertical wood grain; 1 repeat ~= 1m if used with applyBoxUV(geo, 1)
  wood: () => canvasTexture('wood', 256, 256, (g, w, h) => {
    const r = rand(11);
    g.fillStyle = '#d8d0c4';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = r() * w;
      const a = 0.05 + r() * 0.12;
      g.strokeStyle = `rgba(60,40,20,${a})`;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      g.moveTo(x, 0);
      let xx = x;
      for (let y = 0; y <= h; y += 16) {
        xx += (r() - 0.5) * 2.5;
        g.lineTo(xx, y);
      }
      g.stroke();
    }
    // plank seams
    g.fillStyle = 'rgba(30,20,10,0.35)';
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h);
  }),
  // dense straw strokes for thatched roofs / straw
  thatch: () => canvasTexture('thatch', 256, 256, (g, w, h) => {
    const r = rand(23);
    g.fillStyle = '#cdbb98';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w;
      const y = r() * h;
      const len = 10 + r() * 26;
      const l = 40 + r() * 50;
      g.strokeStyle = `hsla(${38 + r() * 10},${30 + r() * 25}%,${l}%,0.55)`;
      g.lineWidth = 0.8 + r() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y + len);
      g.stroke();
    }
    // horizontal binding bands
    g.fillStyle = 'rgba(60,40,20,0.18)';
    for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 5);
  }),
  // Japanese roof tiles (kawara): rows of rounded tiles. v runs down the slope.
  kawara: () => canvasTexture('kawara', 256, 256, (g, w, h) => {
    g.fillStyle = '#bfc3c8';
    g.fillRect(0, 0, w, h);
    const cols = 8;
    const rows = 8;
    const cw = w / cols;
    const rh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const gx = x * cw;
        const gy = y * rh;
        const grad = g.createLinearGradient(gx, 0, gx + cw, 0);
        grad.addColorStop(0, 'rgba(40,45,50,0.55)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.25)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.05)');
        grad.addColorStop(1, 'rgba(40,45,50,0.6)');
        g.fillStyle = grad;
        g.fillRect(gx, gy, cw, rh);
      }
      g.fillStyle = 'rgba(20,22,25,0.55)';
      g.fillRect(0, y * rh + rh - 4, w, 4);
    }
  }),
  // white plaster with faint mottling
  plaster: () => canvasTexture('plaster', 256, 256, (g, w, h) => {
    const r = rand(5);
    g.fillStyle = '#f2efe8';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(120,110,95,${r() * 0.05})`;
      const s = 4 + r() * 30;
      g.beginPath();
      g.arc(r() * w, r() * h, s, 0, Math.PI * 2);
      g.fill();
    }
  }),
  // irregular stone blocks
  stone: () => canvasTexture('stone', 256, 256, (g, w, h) => {
    const r = rand(77);
    g.fillStyle = '#6d6c68';
    g.fillRect(0, 0, w, h);
    const rows = 6;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 40;
      const rh = h / rows;
      while (x < w) {
        const bw = 30 + r() * 50;
        const l = 62 + r() * 22;
        g.fillStyle = `hsl(40,${4 + r() * 6}%,${l}%)`;
        g.fillRect(x + 2, y * rh + 2, bw - 4, rh - 4);
        for (let k = 0; k < 20; k++) {
          g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
          g.fillRect(x + 2 + r() * (bw - 6), y * rh + 2 + r() * (rh - 6), 3, 3);
        }
        x += bw;
      }
    }
  }),
  // washi paper fibers (lanterns, shoji)
  washi: () => canvasTexture('washi', 256, 256, (g, w, h) => {
    const r = rand(9);
    g.fillStyle = '#f7f3ea';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = `rgba(150,130,100,${r() * 0.12})`;
      g.lineWidth = 0.5 + r();
      g.beginPath();
      const x = r() * w;
      const y = r() * h;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 40, y + (r() - 0.5) * 40);
      g.stroke();
    }
  }),
  // generic noise for bark / ground tint
  bark: () => canvasTexture('bark', 128, 256, (g, w, h) => {
    const r = rand(31);
    g.fillStyle = '#c9bfb4';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(40,30,20,${0.08 + r() * 0.2})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 4, 10 + r() * 40);
    }
  }),
};

// ---------------------------------------------------------------------------
// Palette (colors are sRGB hex). Tweak here to restyle every prop at once.
// ---------------------------------------------------------------------------
const P = {
  vermilion: { color: 0xd8401f, roughness: 0.55 }, // 朱塗り
  vermilionDark: { color: 0x9a2b18, roughness: 0.6 },
  blackLacquer: { color: 0x1d1a19, roughness: 0.35 },
  gold: { color: 0xe0b04a, metalness: 1.0, roughness: 0.28 },
  brass: { color: 0xb88a3c, metalness: 1.0, roughness: 0.4 },
  woodLight: { color: 0xd6b48c, roughness: 0.8, map: 'wood' },
  wood: { color: 0xa47a52, roughness: 0.82, map: 'wood' },
  woodDark: { color: 0x5e4230, roughness: 0.85, map: 'wood' },
  woodAged: { color: 0x8a7a68, roughness: 0.9, map: 'wood' }, // weathered, grey-brown
  plaster: { color: 0xf3eee4, roughness: 0.95, map: 'plaster' }, // 漆喰
  kawara: { color: 0x59606b, roughness: 0.5, metalness: 0.2, map: 'kawara' }, // いぶし瓦
  kawaraPlain: { color: 0x4d535c, roughness: 0.5, metalness: 0.2 },
  thatch: { color: 0xb89462, roughness: 1.0, map: 'thatch' },
  straw: { color: 0xdcc07a, roughness: 1.0, map: 'thatch' },
  stone: { color: 0xa3a39b, roughness: 0.95, map: 'stone' },
  stonePlain: { color: 0x9b9b94, roughness: 0.95 },
  stoneDark: { color: 0x6c6d68, roughness: 0.95 },
  moss: { color: 0x5f7c3a, roughness: 1.0 },
  concrete: { color: 0xbcb9b0, roughness: 0.95 },
  metal: { color: 0xc3c7cc, metalness: 0.85, roughness: 0.4 }, // galvanized
  metalDark: { color: 0x3b3f45, metalness: 0.75, roughness: 0.45 },
  paintWhite: { color: 0xf4f4f0, roughness: 0.45 },
  paintYellow: { color: 0xf2c12e, roughness: 0.45 },
  paintBlack: { color: 0x1c1c1e, roughness: 0.5 },
  paintRed: { color: 0xd22a22, roughness: 0.45 },
  paintBlue: { color: 0x2b62b8, roughness: 0.45 },
  paintGreen: { color: 0x3f8f4a, roughness: 0.5 },
  paper: { color: 0xf7f1e3, roughness: 0.9, map: 'washi' }, // 和紙・障子
  fabricRed: { color: 0xc8262c, roughness: 0.9 },
  fabricIndigo: { color: 0x243a6b, roughness: 0.9 }, // 藍
  fabricWhite: { color: 0xf2efe6, roughness: 0.9 },
  rope: { color: 0xd6c08a, roughness: 1.0, map: 'thatch' }, // しめ縄
  leaf: { color: 0x4f8a35, roughness: 0.85 },
  leafDark: { color: 0x2e5b2c, roughness: 0.9 },
  leafLight: { color: 0x7fb24a, roughness: 0.85 },
  sakura: { color: 0xf7bfd0, roughness: 0.85 },
  sakuraDeep: { color: 0xee98b3, roughness: 0.85 },
  bark: { color: 0x5c4838, roughness: 1.0, map: 'bark' },
  barkDark: { color: 0x3b2e26, roughness: 1.0, map: 'bark' },
  bamboo: { color: 0x7fa846, roughness: 0.55 },
  glass: { color: 0x2a3440, roughness: 0.08, metalness: 0.3 }, // dark glossy (no transparency)
  rubber: { color: 0x1a1a1a, roughness: 0.8 },
  water: { color: 0x3a6a78, roughness: 0.05, metalness: 0.1 },
  // Emissive (glow with bloom). Intensities > 1 are intended for the HDR pipeline.
  lanternGlow: { color: 0xffe2b0, emissive: 0xff9a3c, emissiveIntensity: 2.2, roughness: 0.9, map: 'washi' },
  lanternGlowRed: { color: 0xff8a6a, emissive: 0xff3a1c, emissiveIntensity: 2.4, roughness: 0.9, map: 'washi' },
  windowGlow: { color: 0xffe0a8, emissive: 0xffb45a, emissiveIntensity: 1.6, roughness: 0.9 },
  lightWhite: { color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 3.0, roughness: 0.5 },
  lightRed: { color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 4.0, roughness: 0.5 },
};

/** List of palette names (for docs / debugging). */
export const PALETTE_NAMES = Object.keys(P);

function build(params) {
  const p = { ...params };
  if (typeof p.map === 'string') p.map = TEX[p.map]();
  return new THREE.MeshStandardMaterial(p);
}

/** Get a shared palette material by name (see PALETTE_NAMES). */
export function getMat(name) {
  if (matCache.has(name)) return matCache.get(name);
  const def = P[name];
  if (!def) throw new Error(`Unknown palette material: ${name}`);
  const m = build(def);
  m.name = name;
  matCache.set(name, m);
  return m;
}

/**
 * Get or create a custom shared material. Use a namespaced key, e.g. 'rural.mailboxRed'.
 * `params` are MeshStandardMaterial params; `map` may be a TEX key string or a Texture.
 * The first call defines the material; later calls with the same key return the same instance.
 */
export function mat(key, params) {
  if (matCache.has(key)) return matCache.get(key);
  const m = params && params.isMaterial ? params : build(params || {});
  m.name = key;
  matCache.set(key, m);
  return m;
}

export function allMaterials() {
  return [...matCache.values()];
}
