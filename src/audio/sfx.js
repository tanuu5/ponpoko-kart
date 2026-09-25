// One-shot sound effects, synthesized. Each entry is fn(v) → end time, where
//   v = { ctx, out (per-voice GainNode), t (start), p (pitch multiplier), r (rng), srcs: [] }
// Every created source node is pushed into v.srcs so the voice manager can steal/stop it.
import { TAU, rng, Biquad, cached, finish, noiseBuffer, pinkBuffer, normalize } from './dsp.js';
import { getSample, getNote } from './samples.js';

// ------------------------------------------------------------------ helpers
export function osc(v, type, f, t0, t1, dest) {
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  o.start(t0);
  o.stop(t1);
  if (dest) o.connect(dest);
  v.srcs.push(o);
  return o;
}
export function noise(v, t0, t1, dest, buffer) {
  const s = v.ctx.createBufferSource();
  s.buffer = buffer || noiseBuffer(v.ctx.sampleRate);
  s.loop = true;
  s.start(t0, v.r() * 3);
  s.stop(t1);
  if (dest) s.connect(dest);
  v.srcs.push(s);
  return s;
}
export function sbuf(v, b, t0, rate, dest, gain = 1) {
  if (!b) return null;
  const s = v.ctx.createBufferSource();
  s.buffer = b;
  s.playbackRate.value = rate;
  const g = gn(v, gain, dest);
  s.connect(g);
  s.start(t0);
  v.srcs.push(s);
  return s;
}
export function gn(v, val = 0, dest) {
  const g = v.ctx.createGain();
  g.gain.value = val;
  if (dest) g.connect(dest);
  return g;
}
export function filt(v, type, f, q = 0.7, dest) {
  const b = v.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  if (dest) b.connect(dest);
  return b;
}
/** attack (linear) then exponential-ish decay with time-constant d */
export function ad(param, t, a, peak, d) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(0, t + a, d);
}
/** attack, hold, release(time-constant r) */
export function ahr(param, t, a, peak, h, r) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setValueAtTime(peak, t + a + h);
  param.setTargetAtTime(0, t + a + h, r);
}
export function sweep(param, t, f0, f1, dur) {
  param.setValueAtTime(Math.max(1, f0), t);
  param.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
}
const note = (v, inst, midi, t, gain = 1, dest = v.out) => sbuf(v, getNote(inst, midi, v.ctx.sampleRate), t, v.p, dest, gain);
const hit = (v, name, t, rate = 1, gain = 1, dest = v.out) => sbuf(v, getSample(name, v.ctx.sampleRate), t, rate * v.p, dest, gain);

/** filtered-noise whoosh: bandpass centre sweeps f0 → f1 */
function whoosh(v, t, dur, f0, f1, peak, q = 1.2, dest = v.out) {
  const g = gn(v, 0, dest);
  const bp = filt(v, 'bandpass', f0 * v.p, q, g);
  sweep(bp.frequency, t, f0 * v.p, f1 * v.p, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(0, t + dur);
  noise(v, t, t + dur + 0.02, bp);
}
/** pitched blip with an exponential pitch sweep */
function blip(v, type, t, f0, f1, dur, peak, dest = v.out, sweepDur = dur) {
  const g = gn(v, 0, dest);
  const o = osc(v, type, f0 * v.p, t, t + dur + 0.05, g);
  sweep(o.frequency, t, f0 * v.p, f1 * v.p, sweepDur);
  ad(g.gain, t, 0.004, peak, dur / 4);
  return o;
}
function thud(v, t, f0, f1, dur, peak, dest = v.out) {
  blip(v, 'sine', t, f0, f1, dur, peak, dest, dur * 0.6);
  const g = gn(v, 0, dest);
  const lp = filt(v, 'lowpass', 700, 0.7, g);
  ad(g.gain, t, 0.002, peak * 0.6, dur / 6);
  noise(v, t, t + dur, lp);
}

// ------------------------------------------------------------------ precomputed special buffers
/** "ガーン": comedy metal washbasin (kanedarai) — wobbling inharmonic clang with a head bonk */
function kanedaraiBuf(sr) {
  const len = 2.0, n = Math.floor(sr * len), out = new Float32Array(n), r = rng(808);
  const f0 = 330;
  const P = [[1, 1, 1.5], [1.52, 0.85, 1.2], [2.21, 0.95, 1.0], [2.63, 0.7, 0.85], [3.37, 0.6, 0.65], [4.18, 0.45, 0.5], [5.06, 0.32, 0.38], [6.2, 0.2, 0.26], [7.4, 0.1, 0.18]];
  const ph = P.map(() => r() * TAU);
  const imp = new Biquad('bp', 1300, 0.8, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const bend = 1 - 0.035 * (1 - Math.exp(-t / 0.5)); // pitch sags as the basin wobbles
    const wob = 1 + 0.4 * Math.exp(-t / 0.55) * Math.sin(TAU * 6.5 * t); // rocking wobble
    let s = 0;
    for (let k = 0; k < P.length; k++) {
      const [m, a, d] = P[k];
      const f = f0 * m * bend;
      if (f > sr * 0.45) continue;
      const e = Math.exp(-t / d);
      s += a * e * (Math.sin(TAU * f * t + ph[k]) + 0.6 * Math.sin(TAU * f * 1.007 * t + ph[k] * 1.3));
    }
    let y = s * wob * Math.min(1, t / 0.0015) * 0.35;
    y += imp.process(r() * 2 - 1) * Math.exp(-t / 0.012) * 2.2; // impact
    y += Math.sin(TAU * (150 - 40 * Math.min(1, t / 0.08)) * t) * Math.exp(-t / 0.05) * 0.8; // "bonk"
    out[i] = Math.tanh(1.3 * y);
  }
  new Biquad('lp', 7000, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.25 });
}
/** crackle tail for fireworks (stereo): sparse bright pops thinning out */
export function crackleBuf(sr, len = 2.2, seed = 909) {
  const n = Math.floor(sr * len), L = new Float32Array(n), R = new Float32Array(n), r = rng(seed);
  const count = 420;
  for (let c = 0; c < count; c++) {
    const t = Math.pow(r(), 1.8) * (len - 0.1);
    const i0 = Math.floor(t * sr);
    const amp = (0.3 + r() * 0.7) * Math.exp(-t / 0.9);
    const pan = r();
    const w = 20 + Math.floor(r() * 80);
    for (let k = 0; k < w && i0 + k < n; k++) {
      const s = (r() * 2 - 1) * amp * Math.exp(-k / (w * 0.3));
      L[i0 + k] += s * (1 - pan);
      R[i0 + k] += s * pan;
    }
  }
  const hl = new Biquad('hp', 1800, 0.7, sr), hr = new Biquad('hp', 1800, 0.7, sr);
  const ll = new Biquad('lp', 8000, 0.7, sr), lr = new Biquad('lp', 8000, 0.7, sr);
  hl.run(L); hr.run(R); ll.run(L); lr.run(R);
  return normalize([L, R], 0.85);
}
function crossingStrike(sr, f0, seed) {
  const n = Math.floor(sr * 0.7), out = new Float32Array(n), r = rng(seed);
  const P = [[1, 1, 0.5], [2.02, 0.45, 0.32], [2.95, 0.3, 0.2], [4.1, 0.18, 0.12], [5.3, 0.08, 0.08]];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    for (const [m, a, d] of P) s += a * Math.sin(TAU * f0 * m * t) * Math.exp(-t / d);
    out[i] = s * Math.min(1, t / 0.001) + (t < 0.01 ? (r() * 2 - 1) * Math.exp(-t / 0.002) * 0.4 : 0);
  }
  new Biquad('lp', 6500, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.05 });
}
export const buffers = {
  kanedarai: (sr) => cached('fx:kanedarai', sr, kanedaraiBuf),
  crackle: (sr) => cached('fx:crackle', sr, (s) => crackleBuf(s)),
  crossA: (sr) => cached('fx:crossA', sr, (s) => crossingStrike(s, 760, 1)),
  crossB: (sr) => cached('fx:crossB', sr, (s) => crossingStrike(s, 705, 2)),
};

// ------------------------------------------------------------------ the effects
export const SFX = {
  count(v) {
    const { t } = v;
    hit(v, 'taiko', t, 1.3, 0.35);
    const g = gn(v, 0, v.out);
    osc(v, 'triangle', 784 * v.p, t, t + 0.6, g);
    const g2 = gn(v, 0.18, g);
    osc(v, 'sine', 1568 * v.p, t, t + 0.6, g2);
    ahr(g.gain, t, 0.005, 0.5, 0.16, 0.06);
    return t + 0.6;
  },
  go(v) {
    const { t } = v;
    hit(v, 'taiko', t, 1, 0.55);
    hit(v, 'kane', t, 1, 0.35);
    hit(v, 'crash', t + 0.01, 1, 0.3);
    const g = gn(v, 0, v.out);
    for (const f of [880, 1175, 1480]) osc(v, 'triangle', f * v.p, t, t + 1.3, g);
    ahr(g.gain, t, 0.006, 0.28, 0.45, 0.18);
    return t + 1.4;
  },
  drift_hop(v) {
    const { t } = v;
    blip(v, 'sine', t, 280, 600, 0.09, 0.5);
    thud(v, t, 140, 80, 0.06, 0.25);
    whoosh(v, t, 0.06, 2500, 1800, 0.08, 3);
    return t + 0.2;
  },
  turbo1(v) { return turbo(v, 1); },
  turbo2(v) { return turbo(v, 2); },
  turbo3(v) { return turbo(v, 3); },
  boost(v) {
    const { t } = v;
    whoosh(v, t, 0.9, 350, 2600, 0.55, 0.9);
    whoosh(v, t + 0.05, 0.7, 1200, 5000, 0.18, 1.5);
    const g = gn(v, 0, v.out);
    const lp = filt(v, 'lowpass', 900, 1.5, g);
    const o = osc(v, 'sawtooth', 90 * v.p, t, t + 1.0, lp);
    sweep(o.frequency, t, 90 * v.p, 260 * v.p, 0.6);
    sweep(lp.frequency, t, 400, 2200, 0.5);
    ahr(g.gain, t, 0.03, 0.22, 0.35, 0.15);
    thud(v, t, 110, 45, 0.3, 0.4);
    return t + 1.1;
  },
  dash_panel(v) {
    const { t } = v;
    const g = gn(v, 0, v.out);
    const lp = filt(v, 'lowpass', 3200, 1, g);
    for (const [m, dt] of [[1, 0], [1.5, 0.05]]) {
      const o = osc(v, 'square', 380 * m * v.p, t + dt, t + dt + 0.35, lp);
      sweep(o.frequency, t + dt, 380 * m * v.p, 1500 * m * v.p, 0.22);
    }
    ahr(g.gain, t, 0.01, 0.16, 0.18, 0.06);
    whoosh(v, t, 0.45, 600, 3500, 0.35, 1);
    return t + 0.55;
  },
  jump(v) {
    const { t } = v;
    whoosh(v, t, 0.3, 500, 1900, 0.3, 1.2);
    blip(v, 'sine', t, 180, 440, 0.18, 0.35);
    return t + 0.35;
  },
  land(v) {
    const { t } = v;
    thud(v, t, 95, 42, 0.22, 0.6);
    const g = gn(v, 0, v.out);
    const bp = filt(v, 'bandpass', 1500, 2, g);
    ad(g.gain, t, 0.002, 0.25, 0.015);
    noise(v, t, t + 0.1, bp);
    hit(v, 'wood', t + 0.01, 0.6, 0.12);
    return t + 0.35;
  },
  trick(v) {
    const { t } = v;
    whoosh(v, t, 0.35, 700, 3200, 0.35, 1.3);
    [84, 88, 91, 96].forEach((m, i) => note(v, 'glock', m, t + 0.06 + i * 0.035, 0.35));
    // "キラーン": a long shimmering ring
    const g = gn(v, 0, v.out);
    const o = osc(v, 'sine', 2637 * v.p, t + 0.18, t + 1.0, g);
    const lfo = osc(v, 'sine', 13, t + 0.18, t + 1.0);
    const lg = gn(v, 40 * v.p, o.frequency);
    lfo.connect(lg);
    ad(g.gain, t + 0.18, 0.01, 0.14, 0.22);
    return t + 1.0;
  },
  glider_open(v) {
    const { t } = v;
    // paper umbrella "バサッ": fluttering cloth burst with a falling band
    const lp = filt(v, 'lowpass', 5000, 0.7, v.out);
    const g = gn(v, 0, lp);
    const bp = filt(v, 'bandpass', 3000 * v.p, 0.9, g);
    sweep(bp.frequency, t, 3200 * v.p, 800 * v.p, 0.12);
    g.gain.setValueAtTime(0, t);
    [0, 0.028, 0.055, 0.085].forEach((d, i) => {
      g.gain.linearRampToValueAtTime(0.9 - i * 0.18, t + d + 0.004);
      g.gain.linearRampToValueAtTime(0.12, t + d + 0.024);
    });
    g.gain.setTargetAtTime(0, t + 0.11, 0.05);
    noise(v, t, t + 0.4, bp);
    blip(v, 'sine', t + 0.01, 320, 210, 0.08, 0.35); // the "pon" of the canopy
    return t + 0.45;
  },
  itembox(v) {
    const { t } = v;
    const g = gn(v, 0, v.out);
    const hp = filt(v, 'highpass', 2500, 0.7, g);
    ad(g.gain, t, 0.001, 0.5, 0.02);
    noise(v, t, t + 0.12, hp);
    for (let i = 0; i < 5; i++) blip(v, 'sine', t + 0.01 + v.r() * 0.06, 3000 + v.r() * 3000, 2600 + v.r() * 2000, 0.05, 0.12);
    [91, 95, 98, 103].forEach((m, i) => note(v, 'glock', m, t + 0.05 + i * 0.04, 0.28));
    return t + 0.9;
  },
  roulette(v) {
    const { t } = v;
    const f = (v.r() < 0.5 ? 1760 : 2093) * v.p;
    const g = gn(v, 0, v.out);
    osc(v, 'triangle', f, t, t + 0.08, g);
    ad(g.gain, t, 0.002, 0.3, 0.018);
    return t + 0.08;
  },
  item_get(v) {
    const { t } = v;
    note(v, 'glock', 88, t, 0.6);
    note(v, 'glock', 95, t + 0.005, 0.45);
    const g = gn(v, 0, v.out);
    osc(v, 'sine', 1318.5 * v.p, t, t + 1.2, g);
    ad(g.gain, t, 0.003, 0.25, 0.3);
    return t + 1.2;
  },
  throw(v) {
    const { t } = v;
    whoosh(v, t, 0.25, 1900, 500, 1.2, 2);
    return t + 0.3;
  },
  shuriken(v) {
    const { t } = v;
    // metallic FM ring, amplitude-chopped to suggest spinning "shing-shing"
    const chop = gn(v, 0.5, v.out); // 0.5 ± 0.5 tremolo stage after the envelope
    const g = gn(v, 0, chop);
    const lp = filt(v, 'lowpass', 7000, 0.7, g);
    const car = osc(v, 'sine', 3150 * v.p, t, t + 0.55, lp);
    const mod = osc(v, 'sine', 4480 * v.p, t, t + 0.55);
    const mg = gn(v, 2600 * v.p, car.frequency);
    mod.connect(mg);
    const lfo = osc(v, 'sine', 26, t, t + 0.55, gn(v, 0.5, chop.gain));
    sweep(lfo.frequency, t, 30, 18, 0.5);
    ad(g.gain, t, 0.004, 0.3, 0.14);
    whoosh(v, t, 0.3, 4000, 2200, 0.5, 2);
    return t + 0.6;
  },
  daruma_bounce(v) {
    const { t } = v;
    hit(v, 'wood', t, 0.55, 0.8);
    thud(v, t, 190, 150, 0.08, 0.35);
    return t + 0.25;
  },
  makibishi_drop(v) {
    const { t } = v;
    thud(v, t, 120, 70, 0.08, 0.2);
    for (let i = 0; i < 8; i++) {
      const tt = t + v.r() * 0.3;
      blip(v, 'sine', tt, 3200 + v.r() * 2600, 3000 + v.r() * 2000, 0.035, 0.12 + v.r() * 0.1);
    }
    return t + 0.45;
  },
  hit(v) {
    const { t } = v;
    thud(v, t, 75, 38, 0.4, 0.7);
    const g = gn(v, 0, v.out);
    const lp = filt(v, 'lowpass', 1800, 0.7, g);
    ad(g.gain, t, 0.002, 0.6, 0.09);
    noise(v, t, t + 0.4, lp);
    const g2 = gn(v, 0, v.out);
    const bp = filt(v, 'bandpass', 620, 1.5, g2);
    ad(g2.gain, t, 0.002, 0.5, 0.04);
    noise(v, t, t + 0.2, bp);
    hit(v, 'kaneM', t + 0.01, 0.45, 0.2);
    return t + 0.5;
  },
  spinout(v) {
    const { t } = v;
    // cartoon whirl: a warbling tone whose wobble speeds up while the pitch drops
    const g = gn(v, 0, v.out);
    const o = osc(v, 'triangle', 900 * v.p, t, t + 1.0, g);
    sweep(o.frequency, t, 900 * v.p, 420 * v.p, 0.9);
    const lfo = osc(v, 'sine', 8, t, t + 1.0);
    sweep(lfo.frequency, t, 7, 17, 0.9);
    const lg = gn(v, 170 * v.p, o.frequency);
    lfo.connect(lg);
    ahr(g.gain, t, 0.02, 0.22, 0.6, 0.12);
    whoosh(v, t, 0.9, 800, 1600, 0.15, 1.5);
    return t + 1.1;
  },
  manekineko(v) {
    const { t } = v;
    hit(v, 'kane', t, 1.5, 0.25);
    [84, 86, 88, 91, 93, 96, 98, 100].forEach((m, i) => note(v, 'glock', m, t + 0.03 + i * 0.045, 0.3));
    const g = gn(v, 0, v.out);
    for (const f of [1047, 1319, 1568, 2093]) {
      const o = osc(v, 'sine', f * v.p, t + 0.1, t + 1.6, g);
      const lfo = osc(v, 'sine', 6 + v.r() * 2, t + 0.1, t + 1.6);
      lfo.connect(gn(v, f * 0.006, o.frequency));
    }
    ahr(g.gain, t + 0.1, 0.25, 0.06, 0.4, 0.25);
    return t + 1.6;
  },
  kanedarai(v) {
    const { t } = v;
    sbuf(v, buffers.kanedarai(v.ctx.sampleRate), t, v.p, v.out, 0.95);
    return t + 2.0 / v.p;
  },
  coin(v) {
    const { t } = v;
    // koban "チャリン": a short 'cha' then a ringing 'rin' a little higher
    const g = gn(v, 0, v.out);
    const hp = filt(v, 'bandpass', 5200, 1.2, g);
    ad(g.gain, t, 0.001, 0.25, 0.008);
    noise(v, t, t + 0.05, hp);
    for (const [f, dt, a, d] of [[1976, 0, 0.3, 0.05], [2637, 0.065, 0.32, 0.16]]) {
      const gg = gn(v, 0, v.out);
      osc(v, 'sine', f * v.p, t + dt, t + dt + 0.7, gg);
      const g2 = gn(v, 0.3, gg);
      osc(v, 'sine', f * 2.41 * v.p, t + dt, t + dt + 0.7, g2);
      ad(gg.gain, t + dt, 0.001, a, d);
    }
    return t + 0.75;
  },
  wall(v) {
    const { t } = v;
    thud(v, t, 110, 55, 0.18, 0.6);
    hit(v, 'wood', t, 0.7, 0.25);
    return t + 0.3;
  },
  bump(v) {
    const { t } = v;
    const g = gn(v, 0, v.out);
    const o = osc(v, 'sine', 210 * v.p, t, t + 0.25, g);
    o.frequency.setValueAtTime(210 * v.p, t);
    o.frequency.exponentialRampToValueAtTime(130 * v.p, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(190 * v.p, t + 0.14);
    ad(g.gain, t, 0.003, 0.5, 0.05);
    hit(v, 'wood', t, 0.9, 0.2);
    return t + 0.3;
  },
  splash(v) {
    const { t } = v;
    const g = gn(v, 0, v.out);
    const lp = filt(v, 'lowpass', 4000, 0.7, g);
    sweep(lp.frequency, t, 4500, 600, 0.6);
    ad(g.gain, t, 0.01, 0.6, 0.18);
    noise(v, t, t + 0.9, lp);
    for (let i = 0; i < 9; i++) {
      const f = 600 + v.r() * 1300;
      blip(v, 'sine', t + 0.05 + v.r() * 0.6, f, f * 1.6, 0.04, 0.1 + v.r() * 0.08);
    }
    return t + 0.9;
  },
  lap(v) {
    const { t } = v;
    [84, 88, 91, 96].forEach((m, i) => note(v, 'glock', m, t + i * 0.075, i === 3 ? 0.6 : 0.45));
    return t + 1.6;
  },
  menu_move(v) {
    const { t } = v;
    hit(v, 'wood', t, 1.45, 1.0);
    return t + 0.15;
  },
  menu_ok(v) {
    const { t } = v;
    note(v, 'koto', 84, t, 0.55);
    note(v, 'koto', 91, t + 0.06, 0.55);
    note(v, 'glock', 96, t + 0.06, 0.12);
    hit(v, 'taikoKa', t, 1.2, 0.15);
    return t + 1.2;
  },
  menu_back(v) {
    const { t } = v;
    note(v, 'koto', 79, t, 0.45);
    note(v, 'koto', 74, t + 0.07, 0.45);
    return t + 1.0;
  },
  firework(v) {
    const { t } = v;
    thud(v, t, 70, 32, 0.9, 0.8);
    const g = gn(v, 0, v.out);
    const lp = filt(v, 'lowpass', 900, 0.7, g);
    ad(g.gain, t, 0.004, 0.7, 0.2);
    noise(v, t, t + 1.0, lp, pinkBuffer(v.ctx.sampleRate));
    sbuf(v, buffers.crackle(v.ctx.sampleRate), t + 0.18, v.p, v.out, 0.35);
    return t + 2.5;
  },
  train_horn(v) {
    const { t } = v;
    // two-tone electric horn "ファーン" (major third), with a slight sag and air noise
    const g = gn(v, 0, v.out);
    const lp = filt(v, 'lowpass', 2600, 0.7, g);
    const bp = filt(v, 'peaking', 1100, 1, lp);
    bp.gain.value = 5;
    for (const f of [370, 466]) {
      const o = osc(v, 'sawtooth', f * 1.03 * v.p, t, t + 1.8, bp);
      o.frequency.setValueAtTime(f * 1.03 * v.p, t);
      o.frequency.setTargetAtTime(f * v.p, t, 0.08);
      const lfo = osc(v, 'sine', 5.5, t, t + 1.8);
      lfo.connect(gn(v, f * 0.003, o.frequency));
    }
    ahr(g.gain, t, 0.06, 0.2, 1.15, 0.1);
    const gn2 = gn(v, 0, v.out);
    const nbp = filt(v, 'bandpass', 1400, 0.8, gn2);
    ahr(gn2.gain, t, 0.05, 0.05, 1.15, 0.1);
    noise(v, t, t + 1.8, nbp);
    return t + 1.8;
  },
  respawn(v) {
    const { t } = v;
    const trem = gn(v, 0.6, v.out);
    const g = gn(v, 0, trem);
    const o = osc(v, 'sine', 400 * v.p, t, t + 0.8, g);
    sweep(o.frequency, t, 400 * v.p, 1600 * v.p, 0.55);
    osc(v, 'sine', 18, t, t + 0.8, gn(v, 0.4, trem.gain));
    ahr(g.gain, t, 0.05, 0.14, 0.45, 0.08);
    whoosh(v, t, 0.6, 400, 2400, 0.2, 1);
    [79, 84, 88, 91].forEach((m, i) => note(v, 'glock', m, t + 0.3 + i * 0.06, 0.25));
    return t + 1.2;
  },
  wrong_way(v) {
    const { t } = v;
    // "ブッブー" (short, long) — soft square buzz, low-passed
    const g = gn(v, 0, v.out);
    const lp = filt(v, 'lowpass', 1300, 0.7, g);
    for (const f of [185, 196]) osc(v, 'square', f * v.p, t, t + 0.75, lp);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.setValueAtTime(0.12, t + 0.11);
    g.gain.linearRampToValueAtTime(0, t + 0.13);
    g.gain.setValueAtTime(0, t + 0.19);
    g.gain.linearRampToValueAtTime(0.12, t + 0.2);
    g.gain.setValueAtTime(0.12, t + 0.62);
    g.gain.linearRampToValueAtTime(0, t + 0.68);
    return t + 0.75;
  },
};

function turbo(v, lvl) {
  const { t } = v;
  const dur = 0.35 + 0.18 * lvl;
  whoosh(v, t, dur, 500, 2000 + 700 * lvl, 0.28 + 0.1 * lvl, 1.1);
  const g = gn(v, 0, v.out);
  const lp = filt(v, 'lowpass', 700, 1.4, g);
  const o = osc(v, 'sawtooth', 100 * v.p, t, t + dur + 0.1, lp);
  sweep(o.frequency, t, 100 * v.p, (160 + 60 * lvl) * v.p, dur * 0.6);
  sweep(lp.frequency, t, 500, 1400 + 500 * lvl, dur * 0.5);
  ahr(g.gain, t, 0.02, 0.1 + 0.05 * lvl, dur * 0.4, 0.08);
  if (lvl >= 2) thud(v, t, 130, 50, 0.2, 0.25 + 0.1 * lvl);
  if (lvl >= 3) [91, 96, 100].forEach((m, i) => note(v, 'glock', m, t + 0.04 + i * 0.03, 0.18));
  return t + dur + 0.2;
}

/** per-effect gain trim, voice limit and reverb send */
export const SFX_META = {
  count: { g: 0.71, max: 2, rev: 0.2 }, go: { g: 0.86, max: 1, rev: 0.3 },
  drift_hop: { g: 1.17, max: 2 }, turbo1: { g: 1.3, max: 2 }, turbo2: { g: 1.19, max: 2 }, turbo3: { g: 1.07, max: 2, rev: 0.1 },
  boost: { g: 1.29, max: 2 }, dash_panel: { g: 0.8, max: 2 }, jump: { g: 1.6, max: 2 }, land: { g: 0.81, max: 2 },
  trick: { g: 0.72, max: 2, rev: 0.2 }, glider_open: { g: 2.0, max: 2 }, itembox: { g: 0.83, max: 3, rev: 0.15 },
  roulette: { g: 2.4, max: 2 }, item_get: { g: 0.63, max: 2, rev: 0.2 }, throw: { g: 1.26, max: 3 },
  shuriken: { g: 1.4, max: 3 }, daruma_bounce: { g: 0.89, max: 3 }, makibishi_drop: { g: 1.55, max: 2 },
  hit: { g: 0.96, max: 3 }, spinout: { g: 1.07, max: 2 }, manekineko: { g: 0.78, max: 1, rev: 0.3 },
  kanedarai: { g: 0.77, max: 2, rev: 0.25 }, coin: { g: 0.75, max: 4, rev: 0.1 }, wall: { g: 1.03, max: 3 },
  bump: { g: 1.06, max: 3 }, splash: { g: 1.42, max: 2 }, lap: { g: 0.66, max: 1, rev: 0.25 },
  menu_move: { g: 0.93, max: 3 }, menu_ok: { g: 1.44, max: 2, rev: 0.15 }, menu_back: { g: 1.1, max: 2, rev: 0.15 },
  firework: { g: 0.59, max: 4, rev: 0.45 }, train_horn: { g: 0.92, max: 1, rev: 0.35 }, respawn: { g: 0.83, max: 1, rev: 0.25 },
  wrong_way: { g: 0.81, max: 1 },
};
export const SFX_NAMES = Object.keys(SFX);
