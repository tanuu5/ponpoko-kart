// Instrument voices. Every function takes the target context + destination node explicitly,
// so the same code renders into a realtime AudioContext or an OfflineAudioContext.
//   playInst(ctx, dest, inst, t, midi | midi[], dur, vel, opt) → voice { stop(at) } | null
import { clamp, fin, mtof, noiseBuffer, rng } from './dsp.js';
import { getNote, getSample, NOTE_INSTS } from './samples.js';

// ------------------------------------------------------------------ periodic waves (cached per context)
const waveCache = new WeakMap();
const WAVES = {
  // shinobue: bright, a little shrill
  fue: [1, 0.42, 0.24, 0.12, 0.06, 0.03, 0.015],
  // shakuhachi: darker, mostly fundamental
  shaku: [1, 0.2, 0.09, 0.035, 0.012],
  // warm synth bass: strong fundamental (sub) + saw-like harmonics
  bass: Array.from({ length: 28 }, (_, i) => (i === 0 ? 1 : 0.55 / (i + 1))),
};
function wave(ctx, name) {
  let m = waveCache.get(ctx);
  if (!m) { m = {}; waveCache.set(ctx, m); }
  if (!m[name]) {
    const h = WAVES[name];
    const real = new Float32Array(h.length + 1), imag = new Float32Array(h.length + 1);
    h.forEach((a, i) => { imag[i + 1] = a; });
    m[name] = ctx.createPeriodicWave(real, imag);
  }
  return m[name];
}

const vrand = rng(4242);
/** schedule a gain envelope release + source stop, then disconnect everything when done */
function cleanup(src, nodes) {
  src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already gone */ } } };
}

// ------------------------------------------------------------------ sampled notes & hits
export function playBuffer(ctx, dest, buf, t, vel = 1, rate = 1, opt = {}) {
  if (!buf) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = clamp(fin(rate, 1), 0.05, 8);
  const g = ctx.createGain();
  g.gain.value = clamp(fin(vel, 0), 0, 4);
  src.connect(g).connect(dest);
  src.start(t, opt.offset || 0);
  cleanup(src, [src, g]);
  return {
    src, g,
    stop(at) {
      const a = Math.max(at, ctx.currentTime);
      g.gain.setTargetAtTime(0, a, 0.012);
      try { src.stop(a + 0.08); } catch (e) { /* not started */ }
    },
  };
}

// ------------------------------------------------------------------ flutes (shinobue / shakuhachi)
const FLUTE = {
  fue: { wave: 'fue', level: 0.8, att: 0.03, rel: 0.05, chiff: 0.5, breath: 0.07, vibHz: 5.4, vib: 0.011, scoop: 70, bpMul: 2.4 },
  shaku: { wave: 'shaku', level: 0.85, att: 0.06, rel: 0.09, chiff: 0.6, breath: 0.16, vibHz: 4.6, vib: 0.014, scoop: 120, bpMul: 1.6 },
};
function flute(ctx, dest, t, midi, dur, vel, opt, kind) {
  const P = FLUTE[kind];
  const f = mtof(midi);
  const end = t + dur;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(wave(ctx, P.wave));
  const fr = osc.frequency;
  if (opt.orn) { // grace note from a whole tone above
    fr.setValueAtTime(f * 1.1225, t);
    fr.setValueAtTime(f, t + 0.055);
  } else if (dur > 0.22 && !opt.lg) { // pitch scoop into long (non-legato) notes
    fr.setValueAtTime(f * Math.pow(2, -P.scoop / 1200), t);
    fr.exponentialRampToValueAtTime(f, t + 0.075);
  } else fr.setValueAtTime(f, t);
  const nodes = [osc];
  let lfo = null;
  if (dur > 0.32) { // vibrato that grows over long notes
    lfo = ctx.createOscillator();
    lfo.frequency.value = P.vibHz;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + 0.2);
    lg.gain.linearRampToValueAtTime(f * P.vib * Math.min(1, dur / 1.1), end);
    lfo.connect(lg).connect(fr);
    lfo.start(t);
    nodes.push(lfo, lg);
  }
  const a = vel * P.level;
  const att = opt.lg ? 0.012 : P.att; // legato: quick swell, the previous note is still releasing
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(a, t + att);
  env.gain.setTargetAtTime(a * 0.82, t + att, 0.35);
  env.gain.setTargetAtTime(0, end, P.rel);
  osc.connect(env).connect(dest);
  // breath noise: chiff at the attack then a quiet hiss
  const nz = ctx.createBufferSource();
  nz.buffer = noiseBuffer(ctx.sampleRate);
  nz.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(7000, f * P.bpMul);
  bp.Q.value = 1.1;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(a * P.chiff * (opt.lg ? 0.35 : 1), t + 0.012);
  ng.gain.setTargetAtTime(a * P.breath, t + 0.02, 0.05);
  ng.gain.setTargetAtTime(0, end, P.rel);
  nz.connect(bp).connect(ng).connect(dest);
  const stopAt = end + P.rel * 7;
  osc.start(t);
  nz.start(t, vrand() * 3);
  osc.stop(stopAt);
  nz.stop(stopAt);
  if (lfo) lfo.stop(stopAt);
  nodes.push(env, nz, bp, ng);
  cleanup(osc, nodes);
  return {
    stop(at) {
      const s = Math.max(at, ctx.currentTime);
      env.gain.cancelScheduledValues(s); env.gain.setTargetAtTime(0, s, 0.02);
      ng.gain.cancelScheduledValues(s); ng.gain.setTargetAtTime(0, s, 0.02);
    },
  };
}

// ------------------------------------------------------------------ synth bass
function bass(ctx, dest, t, midi, dur, vel, opt) {
  const f = mtof(midi);
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(wave(ctx, 'bass'));
  osc.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2.2;
  const c0 = opt.cut || 300;
  lp.frequency.setValueAtTime(c0 + 1300 * vel, t);
  lp.frequency.setTargetAtTime(c0, t + 0.01, 0.08);
  const g = ctx.createGain();
  const a = vel * 0.95;
  const end = t + Math.max(0.05, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(a, t + 0.006);
  g.gain.setTargetAtTime(a * 0.78, t + 0.02, 0.2);
  g.gain.setTargetAtTime(0, end - 0.015, 0.02);
  osc.connect(lp).connect(g).connect(dest);
  osc.start(t);
  osc.stop(end + 0.2);
  cleanup(osc, [osc, lp, g]);
  return { stop(at) { g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, 0.015); } };
}

// ------------------------------------------------------------------ pads / strings / brass (detuned saws)
function sawChord(ctx, dest, t, notes, dur, vel, P) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = P.q;
  const g = ctx.createGain();
  const end = t + Math.max(0.05, dur);
  const a = (vel * P.level) / Math.sqrt(notes.length * 2);
  if (P.fenv) {
    lp.frequency.setValueAtTime(P.cut * 0.3, t);
    lp.frequency.linearRampToValueAtTime(P.cut * (0.6 + 0.8 * vel), t + P.fenv);
    lp.frequency.setTargetAtTime(P.cut * 0.8, t + P.fenv, 0.2);
  } else lp.frequency.value = P.cut;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(a, t + P.att);
  g.gain.setTargetAtTime(a * P.sus, t + P.att, 0.4);
  g.gain.setTargetAtTime(0, end, P.rel / 3);
  const stopAt = end + P.rel * 2.2;
  const oscs = [];
  for (const m of notes) {
    for (const d of P.det) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = d + (vrand() - 0.5) * 4;
      o.connect(lp);
      o.start(t);
      o.stop(stopAt);
      oscs.push(o);
    }
  }
  lp.connect(g).connect(dest);
  cleanup(oscs[0], [...oscs, lp, g]);
  return { stop(at) { g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, 0.05); } };
}
const PAD = { level: 0.55, q: 0.4, cut: 1500, att: 0.35, sus: 0.9, rel: 0.7, det: [-9, 8] };
const STR = { level: 0.6, q: 0.6, cut: 2600, att: 0.14, sus: 0.85, rel: 0.35, det: [-7, 6] };
const BRASS = { level: 0.7, q: 1.6, cut: 2600, att: 0.02, sus: 0.8, rel: 0.12, det: [-6, 5], fenv: 0.05 };

// ------------------------------------------------------------------ dispatcher
export const INSTRUMENTS = [...NOTE_INSTS, 'flute', 'shaku', 'bass', 'pad', 'strings', 'brass'];

/**
 * Play one note (or chord) on an instrument.
 * @param midi number | number[]  (chords are strummed by opt.strum seconds, low → high)
 */
export function playInst(ctx, dest, inst, t, midi, dur, vel, opt = {}) {
  const notes = Array.isArray(midi) ? midi : [midi];
  vel = clamp(fin(vel, 0.8), 0, 1.5);
  dur = clamp(fin(dur, 0.2), 0.02, 30);
  t = Math.max(fin(t, 0), ctx.currentTime);
  if (NOTE_INSTS.includes(inst)) {
    const vs = notes.map((m, i) => playBuffer(ctx, dest, getNote(inst, m, ctx.sampleRate), t + i * (opt.strum || 0), vel * (i ? 0.85 : 1)));
    return { stop(at) { for (const v of vs) v && v.stop(at); } };
  }
  switch (inst) {
    case 'flute': return flute(ctx, dest, t, notes[0], dur, vel, opt, 'fue');
    case 'shaku': return flute(ctx, dest, t, notes[0], dur, vel, opt, 'shaku');
    case 'bass': return bass(ctx, dest, t, notes[0], dur, vel, opt);
    case 'pad': return sawChord(ctx, dest, t, notes, dur, vel, PAD);
    case 'strings': return sawChord(ctx, dest, t, notes, dur, vel, STR);
    case 'brass': return sawChord(ctx, dest, t, notes, dur, vel, BRASS);
    default: return null;
  }
}

/** play a named percussion sample (see samples.js SAMPLE_NAMES) */
export function playHit(ctx, dest, name, t, vel = 1, rate = 1) {
  return playBuffer(ctx, dest, getSample(name, ctx.sampleRate), Math.max(fin(t, 0), ctx.currentTime), vel, rate);
}

/** warm the sample cache for a list of [inst, midi] so the first bars don't stall */
export function prewarm(sr, list) {
  for (const [inst, m] of list) if (NOTE_INSTS.includes(inst)) getNote(inst, m, sr);
}
