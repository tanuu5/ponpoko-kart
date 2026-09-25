// Pre-computed instrument samples (mono AudioBuffers, cached per sample rate).
//  - pitched: shamisen / koto (Karplus-Strong), marimba, glock  → getNote(inst, midi, sr)
//  - drums & hits: taiko, shime, kane, chappa, kick, snare, ... → getSample(name, sr)
import { TAU, clamp, mtof, rng, Biquad, finish, peakOf, cached, whiteArr } from './dsp.js';

// ------------------------------------------------------------------ Karplus-Strong core
/**
 * Extended Karplus-Strong string: fractional (interpolated) delay for exact tuning,
 * 2-tap loop lowpass (`damp` 0..0.5), pluck-position comb, optional pitch "twang" at the
 * attack, and optional sawari buzz (one-sided soft barrier whose threshold follows the decay).
 */
function ks(sr, f, o) {
  const n = Math.floor(sr * o.len);
  const out = new Float32Array(n);
  const P = sr / f;
  const s = o.damp;
  const w = (TAU * f) / sr;
  const mag = Math.sqrt((1 - s) * (1 - s) + s * s + 2 * s * (1 - s) * Math.cos(w));
  const g = Math.min(0.99995, Math.pow(10, -3 / (o.t60 * f)) / mag);
  const D0 = P - s;
  const r = rng(o.seed);
  const exLen = Math.max(4, Math.floor(P * o.exLen));
  const ex = new Float32Array(exLen);
  const lp = new Biquad('lp', o.exCut, 0.7, sr);
  for (let i = 0; i < exLen; i++) ex[i] = lp.process(r() * 2 - 1) * (o.exShape ? Math.sin((Math.PI * i) / exLen) : 1);
  const pp = Math.max(1, Math.round(P * o.pos));
  for (let i = exLen - 1; i >= pp; i--) ex[i] -= ex[i - pp];
  const A0 = peakOf(ex) || 1;
  const tau = (o.t60 * sr) / 6.9;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const D = o.bend ? D0 * (1 - o.bend * Math.exp(-i / (o.bendT * sr))) : D0;
    const pos = i - D;
    let d = 0;
    if (pos >= 0) {
      const i0 = pos | 0;
      d = out[i0] + (out[i0 + 1] - out[i0]) * (pos - i0);
    }
    const fb = g * ((1 - s) * d + s * prev);
    prev = d;
    let y = (i < exLen ? ex[i] : 0) + fb;
    if (o.sawari) {
      const th = A0 * o.sawari * Math.exp(-i / tau);
      if (y > th) y = th + (y - th) * 0.3;
    }
    out[i] = y;
  }
  return out;
}

function shamisen(sr, midi) {
  const f = mtof(midi);
  const t60 = clamp(1.6 * Math.pow(220 / f, 0.35), 0.5, 2.2);
  const len = Math.min(1.5, t60 * 0.85 + 0.2);
  const out = ks(sr, f, { len, t60, damp: 0.22, exCut: 9000, exLen: 1, pos: 0.13, sawari: 0.42, bend: 0.006, bendT: 0.035, seed: midi * 7 + 1 });
  // bachi striking the skin: bright short noise + small low knock
  const r = rng(midi + 500);
  const bp = new Biquad('bp', 2600, 1.4, sr);
  const nk = Math.floor(0.03 * sr);
  for (let i = 0; i < nk; i++) {
    const t = i / sr;
    out[i] += bp.process(r() * 2 - 1) * Math.exp(-t / 0.006) * 1.3 + Math.sin(TAU * 210 * t) * Math.exp(-t / 0.012) * 0.45;
  }
  new Biquad('hp', 140, 0.7, sr).run(out); // thin, not boomy
  new Biquad('peak', 1900, 1.2, sr, 4).run(out); // nasal presence
  new Biquad('lp', 7500, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.1 });
}

function koto(sr, midi) {
  const f = mtof(midi);
  const t60 = clamp(3.0 * Math.pow(220 / f, 0.4), 1.0, 4.0);
  const len = Math.min(1.9, t60 * 0.6 + 0.25);
  const out = ks(sr, f, { len, t60, damp: 0.36, exCut: 4200, exLen: 0.7, exShape: true, pos: 0.2, sawari: 0, bend: 0.003, bendT: 0.05, seed: midi * 11 + 3 });
  const r = rng(midi + 900);
  const bp = new Biquad('bp', 3200, 1.0, sr);
  for (let i = 0; i < Math.floor(0.012 * sr); i++) {
    const t = i / sr;
    out[i] += bp.process(r() * 2 - 1) * Math.exp(-t / 0.003) * 0.5; // tsume click
  }
  new Biquad('hp', 90, 0.7, sr).run(out);
  new Biquad('peak', 320, 1.0, sr, 3).run(out); // wooden body warmth
  new Biquad('lp', 6000, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.2 });
}

function marimba(sr, midi) {
  const f = mtof(midi);
  const t60 = clamp(0.9 * Math.pow(262 / f, 0.5), 0.25, 1.4);
  const n = Math.floor(sr * Math.min(1.0, t60 + 0.1));
  const out = new Float32Array(n);
  const r = rng(midi + 1300);
  const lp = new Biquad('lp', 2500, 0.7, sr);
  const p = [[1, 1, 1], [3.93, 0.22, 0.22], [9.2, 0.06, 0.08]].filter((q) => q[0] * f < sr * 0.45);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const [m, a, d] of p) v += a * Math.sin(TAU * f * m * t) * Math.exp((-6.9 * t) / (t60 * d));
    out[i] = v * Math.min(1, t / 0.0015) + (t < 0.006 ? lp.process(r() * 2 - 1) * Math.exp(-t / 0.0015) * 0.25 : 0);
  }
  return finish(out, sr, { fade: 0.05 });
}

function glock(sr, midi) {
  const f = mtof(midi);
  const t60 = clamp(2.2 * Math.pow(523 / f, 0.3), 0.8, 3);
  const n = Math.floor(sr * Math.min(1.6, t60 * 0.7));
  const out = new Float32Array(n);
  const p = [[1, 1, 1], [2.76, 0.28, 0.3], [5.4, 0.1, 0.12], [8.93, 0.04, 0.05]].filter((q) => q[0] * f < sr * 0.45);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const [m, a, d] of p) v += a * Math.sin(TAU * f * m * t) * Math.exp((-6.9 * t) / (t60 * d));
    out[i] = v * Math.min(1, t / 0.0007);
  }
  return finish(out, sr, { fade: 0.1 });
}

const NOTE_GEN = { shamisen, koto, marimba, glock };
export const NOTE_INSTS = Object.keys(NOTE_GEN);

/** AudioBuffer for a pitched sample instrument at an integer MIDI note (clamped to a sane range) */
export function getNote(inst, midi, sr) {
  const m = clamp(Math.round(midi), 24, 108);
  return cached(inst + '@' + m, sr, (s) => NOTE_GEN[inst](s, m));
}

// ------------------------------------------------------------------ percussion
function env(t, a, d) { return Math.min(1, t / a) * Math.exp(-t / d); }

function taiko(sr) {
  const n = Math.floor(sr * 1.3), out = new Float32Array(n), r = rng(11);
  const lp = new Biquad('lp', 1300, 0.7, sr), lp2 = new Biquad('lp', 260, 0.7, sr);
  let p1 = 0, p2 = 0, p3 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 72 + 80 * Math.exp(-t / 0.035);
    p1 += (TAU * f) / sr; p2 += (TAU * f * 1.59) / sr; p3 += (TAU * f * 2.14) / sr;
    const body = Math.sin(p1) * Math.exp(-t / 0.42) + 0.4 * Math.sin(p2) * Math.exp(-t / 0.15) + 0.2 * Math.sin(p3) * Math.exp(-t / 0.07);
    const nz = r() * 2 - 1;
    const hit = lp.process(nz) * Math.exp(-t / 0.016) * 1.1 + lp2.process(nz) * Math.exp(-t / 0.2) * 0.9;
    out[i] = Math.tanh(1.5 * (body * Math.min(1, t / 0.002) + hit));
  }
  return finish(out, sr, { fade: 0.1 });
}
function taikoKa(sr) { // rim / wooden edge "ka"
  const n = Math.floor(sr * 0.15), out = new Float32Array(n), r = rng(12);
  const bp = new Biquad('bp', 1900, 2.5, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = bp.process(r() * 2 - 1) * Math.exp(-t / 0.012) * 1.6 + Math.sin(TAU * 880 * t) * Math.exp(-t / 0.018) * 0.6 + Math.sin(TAU * 1370 * t) * Math.exp(-t / 0.01) * 0.3;
  }
  return finish(out, sr);
}
function shime(sr) {
  const n = Math.floor(sr * 0.4), out = new Float32Array(n), r = rng(13);
  const bp = new Biquad('bp', 3000, 1.2, sr);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 380 + 150 * Math.exp(-t / 0.008);
    p += (TAU * f) / sr;
    const body = Math.sin(p) * Math.exp(-t / 0.075) + 0.3 * Math.sin(p * 1.6) * Math.exp(-t / 0.04);
    out[i] = Math.tanh(1.3 * (body + bp.process(r() * 2 - 1) * Math.exp(-t / 0.006) * 1.4));
  }
  return finish(out, sr);
}
function metal(sr, len, f0, parts, damp, seed, click) {
  const n = Math.floor(sr * len), out = new Float32Array(n), r = rng(seed);
  const ph = parts.map(() => r() * TAU);
  const hp = new Biquad('hp', 3000, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    parts.forEach(([m, a, d], k) => {
      const f = f0 * m;
      if (f < sr * 0.45) v += a * Math.sin(TAU * f * t + ph[k]) * Math.exp(-t / Math.min(d, damp)) + a * 0.5 * Math.sin(TAU * f * 1.0045 * t) * Math.exp(-t / Math.min(d, damp));
    });
    out[i] = v * Math.min(1, t / 0.0008) + (t < 0.02 ? hp.process(r() * 2 - 1) * Math.exp(-t / 0.003) * click : 0);
  }
  new Biquad('lp', 8000, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.02 });
}
const KANE_P = [[1, 1, 0.3], [2.37, 0.55, 0.2], [3.93, 0.35, 0.12], [5.72, 0.2, 0.08], [7.8, 0.1, 0.05]];
const kane = (sr) => metal(sr, 0.6, 1180, KANE_P, 1, 21, 0.6);
const kaneM = (sr) => metal(sr, 0.12, 1180, KANE_P, 0.025, 22, 0.8);

function chappa(sr, len = 0.5, damp = 0.2, seed = 31) {
  const n = Math.floor(sr * len), out = new Float32Array(n), r = rng(seed);
  const fs = [2080, 2970, 3610, 4430, 5390, 6710];
  const ph = fs.map(() => r() * TAU);
  const bp = new Biquad('bp', 6000, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    fs.forEach((f, k) => { v += Math.sin(TAU * f * t + ph[k] + 2 * Math.sin(TAU * 310 * t)) / (k + 1.5); });
    out[i] = (v * Math.exp(-t / damp) + bp.process(r() * 2 - 1) * Math.exp(-t / (damp * 0.6)) * 0.9) * Math.min(1, t / 0.001);
  }
  new Biquad('lp', 9000, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.03 });
}
function kick(sr) {
  const n = Math.floor(sr * 0.5), out = new Float32Array(n), r = rng(41);
  const lp = new Biquad('lp', 4000, 0.7, sr);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 48 + 110 * Math.exp(-t / 0.03);
    p += (TAU * f) / sr;
    out[i] = Math.tanh(1.8 * (Math.sin(p) * Math.exp(-t / 0.2) + (t < 0.004 ? lp.process(r() * 2 - 1) * 0.5 : 0)));
  }
  return finish(out, sr);
}
function snare(sr) {
  const n = Math.floor(sr * 0.35), out = new Float32Array(n), r = rng(42);
  const bp = new Biquad('bp', 2800, 0.6, sr), hp = new Biquad('hp', 900, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const body = (Math.sin(TAU * 185 * t) + 0.5 * Math.sin(TAU * 330 * t)) * Math.exp(-t / 0.05);
    out[i] = body * 0.6 + hp.process(bp.process(r() * 2 - 1)) * Math.exp(-t / 0.085) * 2.2;
  }
  new Biquad('lp', 9000, 0.7, sr).run(out);
  return finish(out, sr);
}
function clap(sr) {
  const n = Math.floor(sr * 0.4), out = new Float32Array(n), r = rng(43);
  const bp = new Biquad('bp', 1300, 1.3, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let e = 0;
    for (const o of [0, 0.011, 0.022]) if (t >= o) e += Math.exp(-(t - o) / 0.005);
    if (t >= 0.03) e += Math.exp(-(t - 0.03) / 0.09) * 0.8;
    out[i] = bp.process(r() * 2 - 1) * e;
  }
  return finish(out, sr);
}
function hat(sr, len, d, seed) {
  const n = Math.floor(sr * len), out = new Float32Array(n), r = rng(seed);
  const fs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * 1.7);
  const bp = new Biquad('bp', 7500, 0.9, sr), hp = new Biquad('hp', 5200, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let sq = 0;
    for (const f of fs) sq += Math.sin(TAU * f * t) > 0 ? 1 : -1;
    out[i] = hp.process(bp.process(sq * 0.3 + (r() * 2 - 1) * 0.8)) * env(t, 0.0005, d);
  }
  new Biquad('lp', 10500, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.01 });
}
function shaker(sr, len = 0.14, att = 0.012, d = 0.04, fc = 4500, am = 0, seed = 51) {
  const n = Math.floor(sr * len), out = new Float32Array(n), r = rng(seed);
  const bp = new Biquad('bp', fc, 1.4, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const mod = am ? 0.55 + 0.45 * Math.sin(TAU * am * t) : 1;
    out[i] = bp.process(r() * 2 - 1) * env(t, att, d) * mod;
  }
  return finish(out, sr, { fade: 0.02 });
}
function brush(sr) {
  const n = Math.floor(sr * 0.3), out = new Float32Array(n), r = rng(52);
  const lp = new Biquad('lp', 5500, 0.7, sr), bp = new Biquad('bp', 2600, 0.8, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const nz = r() * 2 - 1;
    out[i] = lp.process(nz) * env(t, 0.02, 0.09) * 0.6 + bp.process(nz) * Math.exp(-t / 0.012) * 1.2 + Math.sin(TAU * 190 * t) * Math.exp(-t / 0.03) * 0.15;
  }
  return finish(out, sr);
}
function crash(sr) {
  const n = Math.floor(sr * 2.2), out = new Float32Array(n), r = rng(53);
  const hp = new Biquad('hp', 500, 0.7, sr), lp = new Biquad('lp', 7500, 0.7, sr);
  const fs = whiteArr(10, r).map((x) => 900 + (x + 1) * 2800);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let m = 0;
    for (let k = 0; k < fs.length; k++) m += Math.sin(TAU * fs[k] * t + k);
    out[i] = lp.process(hp.process((r() * 2 - 1) + m * 0.06)) * env(t, 0.002, 0.55);
  }
  return finish(out, sr, { fade: 0.2 });
}
function wood(sr, f0 = 900, seed = 54) { // woodblock "kon"
  const n = Math.floor(sr * 0.18), out = new Float32Array(n), r = rng(seed);
  const bp = new Biquad('bp', 2500, 2, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0 * (1 + 0.08 * Math.exp(-t / 0.004));
    out[i] = Math.sin(TAU * f * t) * Math.exp(-t / 0.035) + 0.35 * Math.sin(TAU * f * 2.64 * t) * Math.exp(-t / 0.012) + bp.process(r() * 2 - 1) * Math.exp(-t / 0.002) * 0.6;
  }
  return finish(out, sr);
}
function hyoshigi(sr) { // wooden clappers "kachi!"
  const n = Math.floor(sr * 0.25), out = new Float32Array(n), r = rng(55);
  const bp = new Biquad('bp', 3200, 3, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = Math.sin(TAU * 2150 * t) * Math.exp(-t / 0.05) + 0.6 * Math.sin(TAU * 3580 * t) * Math.exp(-t / 0.03) + bp.process(r() * 2 - 1) * Math.exp(-t / 0.003) * 1.5;
  }
  return finish(out, sr);
}

// ------------------------------------------------------------------ festival shouts (formant synthesis)
function lerpSeg(segs, t) {
  let i = 0;
  while (i < segs.length - 2 && t > segs[i + 1][0]) i++;
  const [t0, a] = segs[i], [t1, b] = segs[i + 1];
  const k = clamp((t - t0) / Math.max(1e-6, t1 - t0), 0, 1);
  const o = {};
  for (const key in a) o[key] = a[key] + (b[key] - a[key]) * k;
  return o;
}
function formantVoice(sr, len, segs, pitch, seed, fs = 1) {
  const n = Math.floor(len * sr), out = new Float32Array(n), r = rng(seed);
  const F = [new Biquad('bp', 500, 5, sr), new Biquad('bp', 1000, 7, sr), new Biquad('bp', 2500, 8, sr)];
  const hp = new Biquad('hp', 3800, 0.8, sr);
  let ph = 0, c = segs[0][1];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 31) === 0) {
      c = lerpSeg(segs, t);
      F[0].set(c.f1 * fs, 5); F[1].set(c.f2 * fs, 7); F[2].set(c.f3 * fs, 8);
    }
    ph += pitch(t) / sr;
    if (ph >= 1) ph -= 1;
    const nz = r() * 2 - 1;
    const src = (2 * ph - 1) * c.v + nz * (c.h + 0.12 * c.v);
    out[i] = (F[0].process(src) + F[1].process(src) * 0.7 + F[2].process(src) * 0.35 + hp.process(nz) * c.s * 0.5) * c.a;
  }
  return out;
}
const V = (f1, f2, f3, v, h, s, a) => ({ f1, f2, f3, v, h, s, a });
function crowd(sr, len, segs, pitch, seed) {
  const out = new Float32Array(Math.floor(len * sr));
  [[1, 0, 1], [0.8, 0.013, 0.93], [1.22, 0.026, 1.07]].forEach(([pm, d, fs], k) => {
    const v = formantVoice(sr, len, segs, (t) => pitch(t) * pm, seed + k, fs);
    const off = Math.floor(d * sr);
    for (let i = 0; i + off < out.length; i++) out[i + off] += v[i] * (k ? 0.8 : 1);
  });
  new Biquad('lp', 5000, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.06 });
}
const soiya = (sr) => crowd(sr, 0.56, [
  [0, V(500, 900, 2600, 0, 0, 0, 0)], [0.01, V(500, 900, 2600, 0, 0, 1, 1)], [0.06, V(500, 900, 2600, 0, 0, 1, 1)],
  [0.08, V(500, 850, 2600, 1, 0, 0, 1)], [0.16, V(480, 880, 2600, 1, 0, 0, 1)], [0.2, V(320, 2100, 2900, 1, 0, 0, 0.9)],
  [0.26, V(290, 2200, 3000, 1, 0, 0, 0.8)], [0.31, V(780, 1250, 2600, 1, 0, 0, 1)], [0.44, V(760, 1220, 2600, 1, 0.1, 0, 0.9)],
  [0.54, V(700, 1150, 2500, 0.3, 0.2, 0, 0)],
], (t) => (t < 0.28 ? 210 + t * 150 : 280 - (t - 0.28) * 120), 61);
const hah = (sr) => crowd(sr, 0.26, [
  [0, V(800, 1250, 2600, 0, 1, 0, 0)], [0.012, V(800, 1250, 2600, 0, 1.2, 0, 1)], [0.045, V(800, 1250, 2600, 1, 0.3, 0, 1)],
  [0.18, V(760, 1200, 2600, 1, 0.2, 0, 0.8)], [0.25, V(700, 1150, 2500, 0.2, 0.2, 0, 0)],
], (t) => 270 - t * 300, 71);

const SAMPLE_GEN = {
  taiko, taikoKa, shime, kane, kaneM,
  chappa: (sr) => chappa(sr, 0.5, 0.2, 31), chappaM: (sr) => chappa(sr, 0.12, 0.035, 32),
  kick, snare, clap,
  hat: (sr) => hat(sr, 0.12, 0.03, 44), ohat: (sr) => hat(sr, 0.5, 0.2, 45),
  shaker: (sr) => shaker(sr), cicada: (sr) => shaker(sr, 0.2, 0.02, 0.07, 5200, 62, 56),
  brush, crash, wood: (sr) => wood(sr), hyoshigi, soiya, hah,
};
export const SAMPLE_NAMES = Object.keys(SAMPLE_GEN);
export function getSample(name, sr) {
  const g = SAMPLE_GEN[name];
  return g ? cached('smp:' + name, sr, g) : null;
}
