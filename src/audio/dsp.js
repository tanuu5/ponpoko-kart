// Small DSP toolkit used to PRE-COMPUTE sounds into AudioBuffers (plucks, drums, bells,
// ambience beds, reverb impulse). Plain JS math, run once per sample rate and cached,
// so the realtime audio graph stays cheap (mostly AudioBufferSourceNodes).

export const TAU = Math.PI * 2;
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
/** finite-or-default: guards externally supplied numbers against NaN / Infinity / non-numbers */
export const fin = (x, d = 0) => {
  const v = typeof x === 'boolean' ? (x ? 1 : 0) : x;
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
};
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db) => Math.pow(10, db / 20);

/** deterministic PRNG (mulberry32) → [0,1) */
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ-cookbook biquad for offline buffer processing. type: 'lp' | 'hp' | 'bp' | 'peak' */
export class Biquad {
  constructor(type, f, q, sr, gainDb = 0) {
    this.type = type;
    this.sr = sr;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(f, q, gainDb);
  }
  set(f, q = this.q, gainDb = this.g) {
    this.q = q;
    this.g = gainDb;
    const w = (TAU * clamp(f, 5, this.sr * 0.49)) / this.sr;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * Math.max(1e-4, q));
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (this.type) {
      case 'lp': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'hp': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'peak': b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
      default: throw new Error('Biquad: unknown type ' + this.type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  run(buf) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.process(buf[i]);
    return buf;
  }
}

/** one-pole DC blocker (in place) */
export function dcBlock(buf, sr, f = 18) {
  const R = Math.exp((-TAU * f) / sr);
  let x1 = 0, y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = x - x1 + R * y1;
    x1 = x; y1 = y;
    buf[i] = y;
  }
  return buf;
}

export function fadeIn(buf, sr, sec) {
  const n = Math.min(buf.length, Math.floor(sec * sr));
  for (let i = 0; i < n; i++) buf[i] *= i / n;
  return buf;
}
export function fadeOut(buf, sr, sec) {
  const n = Math.min(buf.length, Math.floor(sec * sr));
  const s = buf.length - n;
  for (let i = 0; i < n; i++) buf[s + i] *= 1 - i / n;
  return buf;
}
export function peakOf(...bufs) {
  let p = 0;
  for (const b of bufs) for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a; }
  return p;
}
/** scale one or more channels together so the joint peak == target */
export function normalize(bufs, target = 0.9) {
  const list = Array.isArray(bufs) ? bufs : [bufs];
  const p = peakOf(...list);
  if (p > 1e-9 && Number.isFinite(p)) for (const b of list) for (let i = 0; i < b.length; i++) b[i] *= target / p;
  return bufs;
}
/** replace any non-finite sample with 0 (belt and braces) */
export function sanitize(buf) {
  for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) buf[i] = 0;
  return buf;
}

/** common tail for one-shot samples: DC block, short fade, NaN scrub, normalize */
export function finish(buf, sr, { peak = 0.9, fade = 0.03, dc = true } = {}) {
  sanitize(buf);
  if (dc) dcBlock(buf, sr);
  fadeOut(buf, sr, fade);
  return normalize(buf, peak);
}

export function whiteArr(n, r) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = r() * 2 - 1;
  return a;
}
/** Paul Kellet's economy pink noise */
export function pinkArr(n, r) {
  const a = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
  }
  return a;
}
export function brownArr(n, r) {
  const a = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = (v + (r() * 2 - 1) * 0.04) * 0.998;
    a[i] = v * 3;
  }
  return a;
}

/** make a seamless loop: the last `xf` seconds are cross-faded into the start (buffer shrinks) */
export function loopify(chans, sr, xf = 0.25) {
  const n = Math.floor(xf * sr);
  return chans.map((c) => {
    const len = c.length - n;
    const out = c.slice(0, len);
    for (let i = 0; i < n; i++) {
      const k = i / n; // equal-power crossfade
      out[i] = c[len + i] * Math.cos(k * Math.PI * 0.5) + c[i] * Math.sin(k * Math.PI * 0.5);
    }
    return out;
  });
}

// ---------------------------------------------------------------- buffer cache
const cache = new Map();
/** cached(key, sr, gen) — gen(sr) returns Float32Array | Float32Array[] ; result is an AudioBuffer */
export function cached(key, sr, gen) {
  const k = sr + ':' + key;
  let b = cache.get(k);
  if (!b) {
    const data = gen(sr);
    b = toBuffer(Array.isArray(data) ? data : [data], sr);
    cache.set(k, b);
  }
  return b;
}
/** number and total bytes of cached AudioBuffers (for diagnostics) */
export function cacheStats() {
  let bytes = 0;
  for (const b of cache.values()) bytes += b.length * b.numberOfChannels * 4;
  return { count: cache.size, mb: Math.round((bytes / 1048576) * 10) / 10 };
}
export function toBuffer(chans, sr) {
  const len = Math.max(1, chans[0].length);
  const b = new AudioBuffer({ length: len, numberOfChannels: chans.length, sampleRate: sr });
  chans.forEach((c, i) => b.copyToChannel(c, i));
  return b;
}

/** 4 s of white noise (looping source for breath / wind / squeal) */
export const noiseBuffer = (sr) => cached('noise', sr, (s) => whiteArr(Math.floor(s * 4), rng(99)));
export const pinkBuffer = (sr) => cached('pink', sr, (s) => normalize(pinkArr(Math.floor(s * 4), rng(98)), 0.8));
export const brownBuffer = (sr) => cached('brown', sr, (s) => normalize(dcBlock(brownArr(Math.floor(s * 4), rng(97)), s, 10), 0.8));

/** stereo reverb impulse: early reflections + exponentially decaying noise that darkens over time */
export function makeIR(sr, secs = 1.8) {
  const n = Math.floor(sr * secs);
  const L = new Float32Array(n), R = new Float32Array(n);
  const r = rng(77);
  const pre = Math.floor(0.012 * sr);
  let lL = 0, lR = 0;
  for (let i = pre; i < n; i++) {
    const t = (i - pre) / sr;
    const env = Math.exp((-6.9 * t) / (secs * 0.8)) * Math.min(1, t / 0.015);
    const fc = 7500 * Math.exp(-t * 1.6) + 900; // damping: highs die first
    const c = Math.exp((-TAU * fc) / sr);
    lL = lL * c + (r() * 2 - 1) * (1 - c);
    lR = lR * c + (r() * 2 - 1) * (1 - c);
    L[i] = lL * env * 2.2;
    R[i] = lR * env * 2.2;
  }
  const taps = [[0.009, 0.55, 0.25], [0.017, 0.4, 0.5], [0.023, 0.32, 0.3], [0.031, 0.28, 0.6], [0.043, 0.22, 0.35], [0.058, 0.16, 0.55]];
  for (const [d, g, p] of taps) {
    const i = pre + Math.floor(d * sr);
    if (i < n) { L[i] += g * (1 - p); R[i + 7 < n ? i + 7 : i] += g * p; }
  }
  return [L, R];
}
