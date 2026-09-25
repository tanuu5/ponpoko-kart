// Continuous player sounds: kart engine and drift (tyre squeal + spark crackle).
// Both are built lazily, driven every frame with setTargetAtTime (no zipper noise / clicks),
// and torn down when idle so they cost nothing while silent.
import { clamp, fin, rng, Biquad, cached, normalize, noiseBuffer } from './dsp.js';

const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

export class Engine {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.n = null;
    this.stopTimer = 0;
  }

  start(t = this.ctx.currentTime) {
    clearTimeout(this.stopTimer);
    if (this.n) {
      this.n.vol.gain.cancelScheduledValues(t);
      this.n.vol.gain.setTargetAtTime(0.2, t, 0.05);
      this.running = true;
      return;
    }
    const ctx = this.ctx;
    const mk = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const n = {};
    n.oA = mk('sawtooth', 45); n.oB = mk('square', 90.4); n.oC = mk('sine', 22.5);
    n.lfo = mk('sine', 22.5);
    n.gA = G(0.5); n.gB = G(0.16); n.gC = G(0.55);
    n.lp = ctx.createBiquadFilter(); n.lp.type = 'lowpass'; n.lp.frequency.value = 600; n.lp.Q.value = 1.3;
    n.am = G(0.72); n.lfoG = G(0.28);
    n.vol = G(0);
    n.oA.connect(n.gA).connect(n.lp);
    n.oB.connect(n.gB).connect(n.lp);
    n.oC.connect(n.gC).connect(n.lp);
    n.lp.connect(n.am).connect(n.vol).connect(this.dest);
    n.lfo.connect(n.lfoG).connect(n.am.gain); // "putt-putt" firing pulse
    // off-road rumble and boost jet (noise based)
    n.nz = ctx.createBufferSource(); n.nz.buffer = noiseBuffer(ctx.sampleRate); n.nz.loop = true;
    n.offLp = ctx.createBiquadFilter(); n.offLp.type = 'lowpass'; n.offLp.frequency.value = 380;
    n.offG = G(0);
    n.jetBp = ctx.createBiquadFilter(); n.jetBp.type = 'bandpass'; n.jetBp.frequency.value = 1600; n.jetBp.Q.value = 1.2;
    n.jetG = G(0);
    n.nz.connect(n.offLp).connect(n.offG).connect(n.vol);
    n.nz.connect(n.jetBp).connect(n.jetG).connect(n.vol);
    for (const o of [n.oA, n.oB, n.oC, n.lfo, n.nz]) o.start(t);
    n.vol.gain.setValueAtTime(0, t);
    n.vol.gain.setTargetAtTime(0.2, t, 0.06);
    this.n = n;
    this.running = true;
    this.update({}, t);
  }

  /** p: { speed01 (0..1.6), throttle (0..1), boost, airborne, offroad } */
  update(p = {}, t = this.ctx.currentTime) {
    const n = this.n;
    if (!n || !this.running) return;
    const s = clamp(fin(p.speed01, 0), 0, 1.6);
    const th = clamp(fin(p.throttle, 0), 0, 1);
    const boost = clamp(fin(p.boost, 0), 0, 1);
    const air = fin(p.airborne, 0) > 0;
    const off = fin(p.offroad, 0) > 0 && !air;
    let rpm = s;
    if (air) rpm = Math.min(1.55, s + 0.25 + 0.35 * th); // no load: revs up
    else if (s < 0.15) rpm = Math.max(s, 0.55 * th); // free-revving at standstill
    const f = (42 + 80 * rpm) * (1 + 0.07 * boost);
    const tc = 0.06;
    n.oA.frequency.setTargetAtTime(f, t, tc);
    n.oB.frequency.setTargetAtTime(f * 2.004, t, tc);
    n.oC.frequency.setTargetAtTime(f * 0.5, t, tc);
    n.lfo.frequency.setTargetAtTime(f * 0.5, t, tc);
    const cut = clamp(420 + 1500 * rpm * (0.45 + 0.55 * th) + 500 * boost - (off ? 150 : 0), 250, 3600);
    n.lp.frequency.setTargetAtTime(cut, t, 0.08);
    n.lfoG.gain.setTargetAtTime(off ? 0.4 : 0.26, t, 0.1);
    n.vol.gain.setTargetAtTime(0.13 + 0.08 * th + 0.06 * Math.min(1, rpm), t, 0.08);
    n.offG.gain.setTargetAtTime(off ? 0.5 * Math.min(1, s * 2) : 0, t, 0.1);
    n.jetBp.frequency.setTargetAtTime(1300 + 900 * Math.min(1.6, s), t, 0.1);
    n.jetG.gain.setTargetAtTime(boost ? 0.35 : 0, t, boost ? 0.04 : 0.2);
  }

  stop(t = this.ctx.currentTime) {
    const n = this.n;
    if (!n || !this.running) return;
    this.running = false;
    n.vol.gain.cancelScheduledValues(t);
    n.vol.gain.setTargetAtTime(0, t, 0.05);
    const kill = () => {
      if (this.running || this.n !== n) return;
      for (const o of [n.oA, n.oB, n.oC, n.lfo, n.nz]) { try { o.stop(); } catch (e) { /* ignore */ } }
      for (const k in n) { try { n[k].disconnect(); } catch (e) { /* ignore */ } }
      this.n = null;
    };
    if (isOffline(this.ctx)) { for (const o of [n.oA, n.oB, n.oC, n.lfo, n.nz]) o.stop(t + 0.4); }
    else this.stopTimer = setTimeout(kill, 450);
  }
}

function sparksBuf(sr) { // dense tiny electric crackles, 2 s seamless (random) loop
  const n = Math.floor(sr * 2), out = new Float32Array(n), r = rng(313);
  for (let c = 0; c < 520; c++) {
    const i0 = Math.floor(r() * n);
    const amp = r() < 0.12 ? 1 : 0.25 + r() * 0.35;
    const w = 8 + Math.floor(r() * 60);
    for (let k = 0; k < w; k++) out[(i0 + k) % n] += (r() * 2 - 1) * amp * Math.exp(-k / (w * 0.25));
  }
  new Biquad('hp', 1500, 0.7, sr).run(out);
  return normalize(out, 0.8);
}

export class Drift {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.n = null;
    this.idleSince = null;
    this.r = rng(77);
  }
  _build(t) {
    const ctx = this.ctx;
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const n = {};
    n.nz = ctx.createBufferSource(); n.nz.buffer = noiseBuffer(ctx.sampleRate); n.nz.loop = true;
    n.bp1 = F('bandpass', 1250, 8); n.bp2 = F('bandpass', 2520, 11);
    n.g2 = G(0.6);
    n.sq = G(0);
    n.nz.connect(n.bp1).connect(n.sq);
    n.nz.connect(n.bp2).connect(n.g2).connect(n.sq);
    n.sq.connect(this.dest);
    n.sp = ctx.createBufferSource(); n.sp.buffer = cached('fx:sparks', ctx.sampleRate, sparksBuf); n.sp.loop = true;
    n.hp = F('highpass', 2000, 0.7);
    n.lp = F('lowpass', 8500, 0.7);
    n.spG = G(0);
    n.sp.connect(n.hp).connect(n.lp).connect(n.spG).connect(this.dest);
    n.nz.start(t, this.r() * 3);
    n.sp.start(t, this.r() * 2);
    this.n = n;
  }
  update(active, level, t = this.ctx.currentTime) {
    const on = !!active && fin(level, 0) >= 0;
    const lv = clamp(Math.round(fin(level, 0)), 0, 3);
    if (on && !this.n) this._build(t);
    const n = this.n;
    if (!n) return;
    if (on) {
      this.idleSince = null;
      const w = 1 + (this.r() - 0.5) * 0.07; // squeal wobble
      n.bp1.frequency.setTargetAtTime(1250 * (1 + 0.05 * lv) * w, t, 0.04);
      n.bp2.frequency.setTargetAtTime(2520 * (1 + 0.05 * lv) / w, t, 0.04);
      n.sq.gain.setTargetAtTime(0.9, t, 0.05);
      n.spG.gain.setTargetAtTime([0, 0.15, 0.21, 0.27][lv], t, 0.05);
      n.sp.playbackRate.setTargetAtTime(0.85 + 0.2 * lv, t, 0.1);
      n.hp.frequency.setTargetAtTime(1600 + 800 * lv, t, 0.1);
    } else {
      n.sq.gain.setTargetAtTime(0, t, 0.06);
      n.spG.gain.setTargetAtTime(0, t, 0.04);
      if (this.idleSince === null) this.idleSince = t;
      else if (t - this.idleSince > 0.5) this.dispose(t);
    }
  }
  dispose(t = this.ctx.currentTime) {
    const n = this.n;
    if (!n) return;
    this.n = null;
    this.idleSince = null;
    try { n.nz.stop(t + 0.05); n.sp.stop(t + 0.05); } catch (e) { /* ignore */ }
    if (!isOffline(this.ctx)) setTimeout(() => { for (const k in n) { try { n[k].disconnect(); } catch (e) { /* ignore */ } } }, 200);
  }
}
