// Course ambience loops. Continuous "beds" (wind, stream, crowd) + randomly scheduled events
// (frogs, higurashi, uguisu, sparrows, distant taiko/flute, far fireworks, ...).
// Event sounds are pre-computed once into small buffers; the scheduler just triggers them.
import { TAU, clamp, rng, Biquad, cached, finish, normalize, loopify, pinkArr, pinkBuffer, noiseBuffer } from './dsp.js';
import { playInst, playHit } from './voices.js';
import { getNote } from './samples.js';
import { buffers } from './sfx.js';

const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
const BED_SR = 22050; // beds are band-limited: render them cheaper

// ------------------------------------------------------------------ creature / event buffers
function frogCall(sr, seed) {
  const r = rng(seed);
  const c = 900 + r() * 1300, pr = 80 + r() * 110;
  const notes = 3 + Math.floor(r() * 6), rate = 5 + r() * 4, nd = 0.035 + r() * 0.03;
  const n = Math.floor((notes / rate + 0.12) * sr), out = new Float32Array(n);
  for (let k = 0; k < notes; k++) {
    const i0 = Math.floor((k / rate) * sr), m = Math.floor(nd * sr);
    const amp = 0.6 + 0.4 * Math.sin(((k + 0.5) / notes) * Math.PI);
    for (let i = 0; i < m && i0 + i < n; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.004) * Math.exp(-t / (nd * 0.45));
      const pulse = Math.exp(-((t * pr) % 1) * 5);
      out[i0 + i] += Math.sin(TAU * c * (t - (0.05 * t * t) / nd)) * pulse * env * amp;
    }
  }
  new Biquad('bp', c, 1.5, sr).run(out);
  return finish(out, sr, { fade: 0.02 });
}
function higurashi(sr, seed) { // "kana-kana-kana…" slowing down and fading
  const r = rng(seed);
  const len = 5.5 + r() * 1.5, n = Math.floor(len * sr), out = new Float32Array(n);
  const base = 4100 + r() * 500;
  let t0 = 0.05, k = 0;
  while (t0 < len - 0.25) {
    const pg = t0 / len, el = 0.085 + 0.025 * pg, f = base * (k % 2 ? 0.9 : 1);
    const songEnv = Math.min(1, t0 / 0.5) * (1 - 0.8 * pg);
    const i0 = Math.floor(t0 * sr), m = Math.floor(el * sr);
    for (let i = 0; i < m && i0 + i < n; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.006) * Math.exp(-t / (el * 0.5));
      const am = 0.55 + 0.45 * Math.sin(TAU * 190 * t);
      out[i0 + i] += Math.sin(TAU * f * (t - (0.035 * t * t) / el)) * env * am * songEnv;
    }
    t0 += 0.115 + 0.065 * pg;
    k++;
  }
  new Biquad('lp', 6500, 0.7, sr).run(out);
  return finish(out, sr, { fade: 0.1 });
}
/** whistle syllables: [start, dur, f0, f1, amp, attack, trillHz] */
function whistle(sr, syl, len, h2 = 0.1) {
  const n = Math.floor(len * sr), out = new Float32Array(n);
  for (const [s, d, f0, f1, a, att = 0.2, tr = 0] of syl) {
    const i0 = Math.floor(s * sr), m = Math.floor(d * sr);
    let ph = 0;
    for (let i = 0; i < m && i0 + i < n; i++) {
      const u = i / m, t = i / sr;
      const f = f0 * Math.pow(f1 / f0, u) * (1 + 0.004 * Math.sin(TAU * 6 * t));
      ph += (TAU * f) / sr;
      const env = Math.min(1, u / att) * Math.min(1, (1 - u) / 0.15);
      const trill = tr ? 0.55 + 0.45 * Math.sin(TAU * tr * t) : 1;
      out[i0 + i] += (Math.sin(ph) + h2 * Math.sin(2 * ph)) * env * a * trill;
    }
  }
  return finish(out, sr, { fade: 0.02 });
}
const uguisuA = (sr) => whistle(sr, [
  [0, 1.1, 1150, 1260, 0.75, 0.3], [1.26, 0.12, 1520, 1420, 0.9, 0.2],
  [1.4, 0.09, 2300, 3800, 1, 0.3], [1.51, 0.32, 3500, 2000, 1, 0.1, 32],
], 1.95);
const uguisuB = (sr) => {
  const syl = [[0, 0.9, 1180, 1300, 0.7, 0.3], [1.02, 0.1, 1550, 1450, 0.85, 0.2], [1.14, 0.08, 2400, 3900, 1, 0.3], [1.24, 0.26, 3600, 2100, 1, 0.1, 30]];
  for (let k = 0; k < 4; k++) { const s = 1.75 + k * 0.26; syl.push([s, 0.07, 2500, 3700, 0.8 - k * 0.1, 0.3], [s + 0.08, 0.13, 3400, 2300, 0.8 - k * 0.1, 0.15]); }
  return whistle(sr, syl, 2.95);
};
const sparrow = (sr, k) => whistle(sr, [[0, 0.06 + k * 0.01, 5200 - k * 400, 3500 - k * 200, 1, 0.15, 110]], 0.1, 0.25);
const bulbul = (sr) => whistle(sr, [[0, 0.28, 2700, 3300, 0.9, 0.2], [0.3, 0.22, 3200, 2300, 1, 0.1]], 0.56, 0.22);
function crow(sr) { // "カァ カァ" — nasal buzzy call
  const n = Math.floor(sr * 1.3), out = new Float32Array(n);
  const b1 = new Biquad('bp', 1300, 3, sr), b2 = new Biquad('bp', 2300, 4, sr);
  for (const [s, a] of [[0, 1], [0.6, 0.85]]) {
    const i0 = Math.floor(s * sr), m = Math.floor(0.42 * sr);
    let ph = 0;
    for (let i = 0; i < m; i++) {
      const u = i / m;
      ph += (520 - 90 * u) / sr;
      ph -= Math.floor(ph);
      out[i0 + i] += (2 * ph - 1) * Math.min(1, u / 0.08) * Math.min(1, (1 - u) / 0.3) * a;
    }
  }
  for (let i = 0; i < n; i++) { const x = out[i]; out[i] = b1.process(x) + 0.6 * b2.process(x); }
  return finish(out, sr, { fade: 0.05 });
}
function suzumushi(sr) { // bell cricket "リーン リーン"
  const n = Math.floor(sr * 1.5), out = new Float32Array(n);
  for (let p = 0; p < 3; p++) {
    const i0 = Math.floor(p * 0.5 * sr), m = Math.floor(0.34 * sr);
    for (let i = 0; i < m; i++) {
      const t = i / sr, u = i / m;
      out[i0 + i] += Math.sin(TAU * 4400 * t) * (0.6 + 0.4 * Math.sin(TAU * 42 * t)) * Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.2);
    }
  }
  return finish(out, sr, { fade: 0.02 });
}
function streamBuf(sr) { // brook: soft band-passed noise + many small rising bubbles, stereo loop
  const len = 6.4, n = Math.floor(len * sr), r = rng(4040);
  const L = pinkArr(n, r), R = pinkArr(n, r);
  new Biquad('bp', 1100, 0.5, sr).run(L);
  new Biquad('bp', 1300, 0.5, sr).run(R);
  for (let i = 0; i < n; i++) { L[i] *= 0.5; R[i] *= 0.5; }
  const count = Math.floor(len * 80);
  for (let b = 0; b < count; b++) {
    const i0 = Math.floor(r() * n), f0 = 500 + r() * 1800, d = 0.012 + r() * 0.03, rise = 1.3 + r() * 0.5;
    const a = 0.1 + r() * 0.3, pan = r(), m = Math.floor(d * sr);
    let ph = 0;
    for (let i = 0; i < m && i0 + i < n; i++) {
      const u = i / m;
      ph += (TAU * f0 * (1 + (rise - 1) * u)) / sr;
      const s = Math.sin(ph) * a * Math.min(1, u / 0.1) * (1 - u);
      L[i0 + i] += s * (1 - pan);
      R[i0 + i] += s * pan;
    }
  }
  return normalize(loopify([L, R], sr, 0.4), 0.7);
}
const VOWELS = [[800, 1250], [300, 2200], [340, 1300], [500, 1900], [500, 850]]; // a i u e o
function crowdBuf(sr) { // festival babble: many formant-filtered "talkers", stereo loop
  const len = 8.5, n = Math.floor(len * sr), r = rng(5050);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let k = 0; k < 14; k++) {
    const pan = r(), f0 = 100 + r() * 150, lvl = 0.4 + r() * 0.6;
    const b1 = new Biquad('bp', 500, 5, sr), b2 = new Biquad('bp', 1500, 7, sr);
    let t = r() * 0.5, ph = 0;
    while (t < len) {
      if (r() < 0.22) { t += 0.2 + r() * 0.8; continue; }
      const d = 0.1 + r() * 0.14, [F1, F2] = VOWELS[Math.floor(r() * 5)], fs = 0.9 + r() * 0.2;
      b1.set(F1 * fs, 5); b2.set(F2 * fs, 7);
      const i0 = Math.floor(t * sr), m = Math.floor(d * sr), pitch = f0 * (0.9 + r() * 0.25);
      for (let i = 0; i < m && i0 + i < n; i++) {
        ph += pitch / sr;
        ph -= Math.floor(ph);
        const src = (2 * ph - 1) * 0.7 + (r() * 2 - 1) * 0.3;
        const e = Math.sin((Math.PI * i) / m) * lvl;
        const y = (b1.process(src) + 0.6 * b2.process(src)) * e;
        L[i0 + i] += y * (1 - pan * 0.8);
        R[i0 + i] += y * (0.2 + pan * 0.8);
      }
      t += d + r() * 0.05;
    }
  }
  new Biquad('lp', 2800, 0.7, sr).run(L);
  new Biquad('lp', 2800, 0.7, sr).run(R);
  return normalize(loopify([L, R], sr, 0.5), 0.7);
}
const B = {
  frog: (sr, k) => cached('amb:frog' + k, sr, (s) => frogCall(s, 100 + k)),
  higu: (sr, k) => cached('amb:higu' + k, sr, (s) => higurashi(s, 200 + k)),
  uguA: (sr) => cached('amb:uguA', sr, uguisuA),
  uguB: (sr) => cached('amb:uguB', sr, uguisuB),
  sparrow: (sr, k) => cached('amb:sparrow' + k, sr, (s) => sparrow(s, k)),
  bulbul: (sr) => cached('amb:bulbul', sr, bulbul),
  crow: (sr) => cached('amb:crow', sr, crow),
  suzu: (sr) => cached('amb:suzu', sr, suzumushi),
  stream: () => cached('amb:stream', BED_SR, streamBuf),
  crowd: () => cached('amb:crowd', BED_SR, crowdBuf),
};

// ------------------------------------------------------------------ per-course definitions
const MINYO = [74, 77, 79, 81, 84, 86]; // D5 F5 G5 A5 C6 D6
const AMB = {
  inaka: {
    beds: (a) => { a.wind(0.6, 520); },
    ev: {
      frog: [0.12, 0.5, (a, t) => a.shot(B.frog(a.sr, a.ri(6)), t, 0.85 + a.r() * 0.4, 0.06 + a.r() * 0.11, a.r() * 1.8 - 0.9, a.r() < 0.5)],
      higurashi: [5, 12, (a, t) => a.shot(B.higu(a.sr, a.ri(3)), t, 0.97 + a.r() * 0.06, 0.07 + a.r() * 0.05, a.r() * 1.6 - 0.8)],
      crow: [14, 30, (a, t) => a.shot(B.crow(a.sr), t, 0.9 + a.r() * 0.2, 0.09, a.r() * 1.4 - 0.7, true)],
    },
  },
  sakura: {
    beds: (a) => { a.wind(0.35, 750, true); a.bed(B.stream(), 0.2, -0.45); },
    ev: {
      uguisu: [7, 15, (a, t) => a.shot(a.r() < 0.65 ? B.uguA(a.sr) : B.uguB(a.sr), t, 0.96 + a.r() * 0.08, 0.13 + a.r() * 0.05, a.r() * 1.6 - 0.8)],
      sparrow: [1.5, 5, (a, t) => {
        const pan = a.r() * 1.6 - 0.8, k = a.ri(3);
        for (let i = 0, n = 2 + a.ri(3); i < n; i++) a.shot(B.sparrow(a.sr, k), t + i * (0.12 + a.r() * 0.15), 0.95 + a.r() * 0.1, 0.035, pan);
      }],
      bulbul: [12, 24, (a, t) => a.shot(B.bulbul(a.sr), t, 0.95 + a.r() * 0.1, 0.045, a.r() * 1.6 - 0.8, true)],
    },
  },
  matsuri: {
    beds: (a) => { a.bed(B.crowd(), 0.12, 0); a.wind(0.12, 400); },
    ev: {
      taiko: [5, 11, (a, t) => {
        const pat = [[0, 'taiko', 1], [0.36, 'taiko', 0.8], [0.72, 'taiko', 1], [0.9, 'taikoKa', 0.7], [1.08, 'taikoKa', 0.7], [1.44, 'taiko', 1]];
        for (const [d, s, v] of pat) playHit(a.ctx, a.far, s, t + d, v * 0.12);
      }],
      flute: [9, 18, (a, t) => {
        let tt = t;
        for (let i = 0, n = 4 + a.ri(4); i < n; i++) {
          const d = [0.2, 0.4, 0.6][a.ri(3)];
          playInst(a.ctx, a.far, 'flute', tt, MINYO[a.ri(MINYO.length)], d, 0.12);
          tt += d;
        }
      }],
      fireworks: [7, 15, (a, t) => {
        a.boom(t, 0.15);
        a.shot(buffers.crackle(a.sr), t + 0.25, 0.9 + a.r() * 0.2, 0.05, a.r() * 1.4 - 0.7, true);
      }],
      suzumushi: [4, 9, (a, t) => a.shot(B.suzu(a.sr), t, 0.98 + a.r() * 0.05, 0.018, a.r() * 1.8 - 0.9)],
      furin: [8, 16, (a, t) => {
        const pan = a.r() * 1.4 - 0.7;
        for (let i = 0, n = 2 + a.ri(2); i < n; i++) a.shot(getNote('glock', 96 + a.ri(5), a.sr), t + i * (0.15 + a.r() * 0.2), 1, 0.05, pan);
      }],
    },
  },
};
export const AMBIENCE_IDS = Object.keys(AMB);

/** small jobs that pre-compute every buffer an ambience uses (run them in idle slices) */
export function ambienceWarmJobs(id, sr) {
  const j = {
    inaka: [...[0, 1, 2, 3, 4, 5].map((k) => () => B.frog(sr, k)), ...[0, 1, 2].map((k) => () => B.higu(sr, k)), () => B.crow(sr), () => pinkBuffer(sr)],
    sakura: [() => B.uguA(sr), () => B.uguB(sr), ...[0, 1, 2].map((k) => () => B.sparrow(sr, k)), () => B.bulbul(sr), () => B.stream(), () => pinkBuffer(sr), () => noiseBuffer(sr)],
    matsuri: [() => B.crowd(), () => B.suzu(sr), () => buffers.crackle(sr), () => pinkBuffer(sr)],
  };
  return j[id] || [];
}

export class Ambience {
  constructor(ctx, bus, id, { seed = 1 } = {}) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    this.def = AMB[id];
    this.id = id;
    this.r = rng(seed * 7 + id.length);
    this.alive = true;
    this.srcs = [];
    this.nodes = [];
    this.timer = 0;
    this.out = this._g(0);
    this.out.connect(bus.dry);
    const send = this._g(0.25);
    this.out.connect(send).connect(bus.wet);
    // "far" chain: dull and reverberant, for distant festival sounds
    this.far = this.ctx.createBiquadFilter();
    this.far.type = 'lowpass';
    this.far.frequency.value = 1500;
    this.nodes.push(this.far);
    this.far.connect(this.out);
    this.far.connect(this._g(0.9)).connect(bus.wet);
  }
  ri(n) { return Math.floor(this.r() * n); }
  _g(v) { const g = this.ctx.createGain(); g.gain.value = v; this.nodes.push(g); return g; }

  start(fade = 1.5) {
    if (!this.def) return this;
    const t = this.ctx.currentTime;
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(1, t + fade);
    this.def.beds(this);
    this.next = {};
    for (const k in this.def.ev) this.next[k] = t + 0.3 + this.r() * this.def.ev[k][1] * 0.5;
    if (isOffline(this.ctx)) this.scheduleUntil(this.ctx.length / this.sr);
    else this._tick();
    return this;
  }
  _tick() {
    if (!this.alive) return;
    this.scheduleUntil(this.ctx.currentTime + 0.4);
    this.timer = setTimeout(() => this._tick(), 150);
  }
  scheduleUntil(until) {
    for (const k in this.def.ev) {
      const [lo, hi, fn] = this.def.ev[k];
      let guard = 0;
      while (this.next[k] < until && guard++ < 1000) {
        fn(this, this.next[k]);
        this.next[k] += lo + this.r() * (hi - lo);
      }
    }
    if (this.gust) this.gust(until);
  }
  stop(fade = 1.2) {
    if (!this.alive) return;
    this.alive = false;
    clearTimeout(this.timer);
    const t = this.ctx.currentTime, g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    for (const s of this.srcs) { try { s.stop(t + fade + 0.05); } catch (e) { /* ignore */ } }
    setTimeout(() => { for (const n of [...this.nodes, ...this.srcs]) { try { n.disconnect(); } catch (e) { /* ignore */ } } }, (fade + 0.4) * 1000);
  }

  // ---- building blocks
  shot(buf, t, rate, gain, pan = 0, far = false) {
    if (!buf) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    s.connect(g).connect(p).connect(far ? this.far : this.out);
    s.start(t);
    s.onended = () => { s.disconnect(); g.disconnect(); p.disconnect(); };
  }
  bed(buf, gain, pan = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    const g = this._g(gain);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    this.nodes.push(p);
    s.connect(g).connect(p).connect(this.out);
    s.start(this.ctx.currentTime, this.r() * buf.duration);
    this.srcs.push(s);
  }
  /** gusty wind: pink noise through a wandering low-pass (+ optional leaf rustle) */
  wind(gain, cut, leaves = false) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = pinkBuffer(this.sr);
    s.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cut;
    lp.Q.value = 0.9;
    const g = this._g(gain * 0.6);
    this.nodes.push(lp);
    s.connect(lp).connect(g).connect(this.out);
    s.start(ctx.currentTime, this.r() * 3);
    this.srcs.push(s);
    let lg = null;
    if (leaves) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(this.sr);
      n.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2800;
      lg = this._g(0);
      this.nodes.push(hp);
      n.connect(hp).connect(lg).connect(this.out);
      n.start(ctx.currentTime, this.r() * 3);
      this.srcs.push(n);
    }
    let nextGust = ctx.currentTime;
    this.gust = (until) => {
      while (nextGust < until) {
        const k = this.r();
        lp.frequency.setTargetAtTime(cut * (0.6 + 0.9 * k), nextGust, 0.8);
        g.gain.setTargetAtTime(gain * (0.35 + 0.65 * k), nextGust, 0.9);
        if (lg) lg.gain.setTargetAtTime(0.02 * k * k, nextGust, 0.6);
        nextGust += 1.5 + this.r() * 2.5;
      }
    };
  }
  /** distant firework boom */
  boom(t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(60, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.setTargetAtTime(0, t + 0.01, 0.25);
    o.connect(g).connect(this.far);
    o.start(t);
    o.stop(t + 1.5);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
}
