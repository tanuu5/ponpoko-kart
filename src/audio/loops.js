// Positional-ish loops returned by GameAudio.startLoop(name):
//   'crossing_bell' (踏切 カンカン), 'train_run' (rail clatter + rumble + motor), 'waterfall', 'star_music'
// Handle: { setVolume(v), setPan(p), setRate(r), stop() } — all calls are safe after stop().
import { TAU, clamp, fin, rng, Biquad, cached, finish, pinkBuffer, brownBuffer } from './dsp.js';
import { buffers } from './sfx.js';
import { getSong } from './songs.js';
import { Sequencer } from './sequencer.js';

export const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

function clackBuf(sr) { // one wheel hitting a rail joint
  const n = Math.floor(sr * 0.25), out = new Float32Array(n), r = rng(515);
  const bp = new Biquad('bp', 420, 1.1, sr), hp = new Biquad('hp', 2800, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const nz = r() * 2 - 1;
    out[i] = bp.process(nz) * Math.exp(-t / 0.03) * 2.2 + Math.sin(TAU * 92 * t) * Math.exp(-t / 0.045) * 0.8 + hp.process(nz) * Math.exp(-t / 0.004) * 0.35;
  }
  return finish(out, sr);
}

class LoopBase {
  constructor(ctx, bus, { volume = 1, pan = 0 } = {}, { level = 0.5, rev = 0.15 } = {}) {
    this.ctx = ctx;
    this.level = level;
    this.vol = clamp(fin(volume, 1), 0, 2);
    this.rate = 1;
    this.alive = true;
    this.srcs = [];
    this.nodes = [];
    this.timer = 0;
    this.out = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = clamp(fin(pan, 0), -1, 1);
    this.send = ctx.createGain();
    this.send.gain.value = rev;
    this.out.connect(this.panner).connect(bus.dry);
    this.panner.connect(this.send).connect(bus.wet);
    const t = ctx.currentTime;
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(this.vol * level, t + 0.12);
  }
  node(n) { this.nodes.push(n); return n; }
  src(n) { this.srcs.push(n); return n; }
  setVolume(v) {
    if (!this.alive) return;
    this.vol = clamp(fin(v, this.vol), 0, 2);
    this.out.gain.setTargetAtTime(this.vol * this.level, this.ctx.currentTime, 0.05);
  }
  setPan(p) {
    if (!this.alive) return;
    this.panner.pan.setTargetAtTime(clamp(fin(p, 0), -1, 1), this.ctx.currentTime, 0.05);
  }
  setRate(r) {
    if (!this.alive) return;
    this.rate = clamp(fin(r, 1), 0.25, 3);
    this.onRate();
  }
  onRate() {}
  stop(fade = 0.25) {
    if (!this.alive) return;
    this.alive = false;
    clearTimeout(this.timer);
    const t = this.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    for (const s of this.srcs) { try { s.stop(t + fade + 0.05); } catch (e) { /* not started */ } }
    if (this.onStop) this.onStop();
    setTimeout(() => this.dispose(), (fade + 0.3) * 1000);
  }
  dispose() {
    for (const n of [...this.nodes, ...this.srcs, this.out, this.panner, this.send]) { try { n.disconnect(); } catch (e) { /* ignore */ } }
  }
  /** look-ahead scheduler for discrete events: fn(untilTime) */
  schedule(fn, ahead = 0.25) {
    if (isOffline(this.ctx)) { fn(this.ctx.length / this.ctx.sampleRate); return; }
    const tick = () => {
      if (!this.alive) return;
      fn(this.ctx.currentTime + ahead);
      this.timer = setTimeout(tick, 60);
    };
    tick();
  }
  loopSrc(buf, offset = 0, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.ctx.currentTime, offset);
    return this.src(s);
  }
  gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return this.node(g); }
  filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return this.node(b); }
  oneShot(buf, t, rate, gain) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(this.out);
    s.start(t);
    s.onended = () => { s.disconnect(); g.disconnect(); };
  }
}

/** 踏切 "カンカンカン": two bell pitches alternating ~2.6 times per second */
class CrossingBell extends LoopBase {
  constructor(ctx, bus, opts) {
    super(ctx, bus, opts, { level: 0.55, rev: 0.22 });
    const sr = ctx.sampleRate;
    const A = buffers.crossA(sr), B = buffers.crossB(sr);
    let next = ctx.currentTime + 0.02, k = 0;
    this.schedule((until) => {
      while (next < until) {
        this.oneShot(k++ % 2 ? B : A, next, 1, 0.9);
        next += 0.38 / this.rate;
      }
    });
  }
}

/** passing train: low rumble + rail roar + motor whine + "ta-tan ta-tan" joint clatter */
class TrainRun extends LoopBase {
  constructor(ctx, bus, opts) {
    super(ctx, bus, opts, { level: 0.6, rev: 0.1 });
    const sr = ctx.sampleRate;
    this.rum = this.loopSrc(brownBuffer(sr), 0.3);
    this.rumLp = this.filter('lowpass', 170, 0.8);
    this.rum.connect(this.rumLp).connect(this.gain(0.9)).connect(this.out);
    this.roar = this.loopSrc(pinkBuffer(sr), 1.1);
    this.roarBp = this.filter('bandpass', 650, 0.7);
    this.roar.connect(this.roarBp).connect(this.gain(0.28)).connect(this.out);
    this.mot = this.src(ctx.createOscillator());
    this.mot.type = 'triangle';
    this.mot.frequency.value = 118;
    this.mot.connect(this.gain(0.06)).connect(this.out);
    this.whine = this.src(ctx.createOscillator());
    this.whine.type = 'sawtooth';
    this.whine.frequency.value = 820;
    this.whine.connect(this.filter('bandpass', 1100, 3)).connect(this.gain(0.016)).connect(this.out);
    this.mot.start(); this.whine.start();
    const clack = cached('fx:clack', sr, clackBuf);
    const pat = [0, 0.12, 0.35, 0.47];
    let cyc = ctx.currentTime + 0.05, k = 0;
    this.schedule((until) => {
      while (cyc + pat[k] / this.rate < until) {
        const t = cyc + pat[k] / this.rate;
        this.oneShot(clack, t, 0.9 + 0.1 * this.rate, k % 2 ? 0.75 : 0.95);
        k++;
        if (k >= pat.length) { k = 0; cyc += 1.05 / this.rate; }
      }
    });
    this.onRate();
  }
  onRate() {
    const t = this.ctx.currentTime, r = this.rate;
    this.rum.playbackRate.setTargetAtTime(0.8 + 0.2 * r, t, 0.2);
    this.roarBp.frequency.setTargetAtTime(450 + 250 * r, t, 0.2);
    this.mot.frequency.setTargetAtTime(90 + 40 * r, t, 0.3);
    this.whine.frequency.setTargetAtTime(500 + 380 * r, t, 0.3);
  }
}

/** waterfall: wide decorrelated noise with a low rumble */
class Waterfall extends LoopBase {
  constructor(ctx, bus, opts) {
    super(ctx, bus, opts, { level: 0.5, rev: 0.25 });
    const sr = ctx.sampleRate;
    const lp = this.filter('lowpass', 2300, 0.6);
    const hp = this.filter('highpass', 150, 0.6);
    lp.connect(hp).connect(this.out);
    this.a = this.loopSrc(pinkBuffer(sr), 0.2);
    this.b = this.loopSrc(pinkBuffer(sr), 2.1);
    for (const [s, p] of [[this.a, -0.7], [this.b, 0.7]]) {
      const pn = this.node(ctx.createStereoPanner());
      pn.pan.value = p;
      s.connect(pn).connect(lp);
    }
    this.c = this.loopSrc(brownBuffer(sr), 1.3);
    this.c.connect(this.filter('lowpass', 320, 0.7)).connect(this.gain(0.7)).connect(this.out);
  }
  onRate() {
    const t = this.ctx.currentTime;
    for (const s of [this.a, this.b, this.c]) s.playbackRate.setTargetAtTime(this.rate, t, 0.2);
  }
}

/** invincibility music: a looping mini-song played on the jingle bus (music is ducked meanwhile) */
class StarMusic extends LoopBase {
  constructor(ctx, bus, opts) {
    super(ctx, bus, opts, { level: 1, rev: 0 });
    this.wet = this.gain(this.vol);
    this.wet.connect(bus.wet);
    this.seq = new Sequencer(ctx, { dry: this.out, wet: this.wet }, getSong('star'), { loop: true, seed: 3 });
    this.seq.start(ctx.currentTime + 0.03, 0.05);
  }
  setVolume(v) {
    super.setVolume(v);
    if (this.alive) this.wet.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.05);
  }
  onRate() { this.seq.setRate(this.rate); }
  stop(fade = 0.4) {
    if (!this.alive) return;
    this.seq.stop(fade);
    super.stop(fade);
  }
}

const LOOPS = { crossing_bell: CrossingBell, train_run: TrainRun, waterfall: Waterfall, star_music: StarMusic };
export const LOOP_NAMES = Object.keys(LOOPS);

/** create a loop; bus = { dry, wet } */
export function createLoop(name, ctx, bus, opts) {
  const C = LOOPS[name];
  return C ? new C(ctx, bus, opts) : null;
}
