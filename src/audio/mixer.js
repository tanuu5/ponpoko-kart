// Mix bus shared by the realtime game audio and the offline self-test:
//   music (ducked) / jingle / sfx / ambience buses → master → high-pass → compressor → trim
//   → soft clipper (never exceeds ±0.92) → destination.  One convolution reverb for all sends.
import { cached, makeIR, clamp, fin } from './dsp.js';

export const DEFAULT_VOL = { master: 0.9, music: 0.55, sfx: 0.8 };
export const DUCK_GAIN = 0.4; // -8 dB
const AMB_REL = 0.75; // ambience level relative to the sfx volume
const TRIM = 0.72; // compensates the compressor's automatic make-up gain

function softClipCurve(n = 4096) {
  const c = new Float32Array(n);
  const knee = 0.72, room = 0.22;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

export function createMixer(ctx, dest = ctx.destination, vol = DEFAULT_VOL) {
  const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const master = G(vol.master);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 24;
  hp.Q.value = 0.6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const trim = G(TRIM);
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = 'none';
  master.connect(hp).connect(comp).connect(trim).connect(clip).connect(dest);

  const revIn = G(1);
  const conv = ctx.createConvolver();
  conv.buffer = cached('ir', ctx.sampleRate, (sr) => makeIR(sr));
  const revOut = G(0.55);
  revIn.connect(conv).connect(revOut).connect(master);

  const duckDry = G(1), duckWet = G(1);
  duckDry.connect(master);
  duckWet.connect(revIn);
  const bus = (v, dry, wet) => { const b = { dry: G(v), wet: G(v) }; b.dry.connect(dry); b.wet.connect(wet); return b; };
  const music = bus(vol.music, duckDry, duckWet);
  const jingle = bus(vol.music, master, revIn);
  const sfx = bus(vol.sfx, master, revIn);
  const amb = bus(vol.sfx * AMB_REL, master, revIn);

  const cur = { ...DEFAULT_VOL, ...vol };
  const set = (p, v) => { p.cancelScheduledValues(ctx.currentTime); p.setTargetAtTime(v, ctx.currentTime, 0.04); };
  return {
    ctx, master, music, jingle, sfx, amb, comp, revIn,
    get volume() { return { ...cur }; },
    setVolume(v = {}) {
      for (const k of ['master', 'music', 'sfx']) if (v[k] !== undefined) cur[k] = clamp(fin(v[k], cur[k]), 0, 1);
      set(master.gain, cur.master);
      for (const b of [music, jingle]) { set(b.dry.gain, cur.music); set(b.wet.gain, cur.music); }
      set(sfx.dry.gain, cur.sfx); set(sfx.wet.gain, cur.sfx);
      set(amb.dry.gain, cur.sfx * AMB_REL); set(amb.wet.gain, cur.sfx * AMB_REL);
    },
    /** duck the music bus: on → -8 dB quickly, off → back to 0 dB smoothly */
    duck(on, t = ctx.currentTime) {
      for (const p of [duckDry.gain, duckWet.gain]) {
        p.cancelScheduledValues(t);
        p.setTargetAtTime(on ? DUCK_GAIN : 1, t, on ? 0.05 : 0.35);
      }
    },
    dispose() { try { clip.disconnect(); } catch (e) { /* ignore */ } },
  };
}
