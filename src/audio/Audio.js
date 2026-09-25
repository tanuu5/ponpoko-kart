// ぽんぽこカート — game audio. Everything is synthesized with the Web Audio API
// (no audio files). See README-style notes at the bottom of this file for the API.
import { clamp, fin, rng } from './dsp.js';
import { createMixer, DEFAULT_VOL } from './mixer.js';
import { Sequencer } from './sequencer.js';
import { getSong, MUSIC_IDS, JINGLE_IDS } from './songs.js';
import { SFX, SFX_META, buffers } from './sfx.js';
import { createLoop, LOOP_NAMES } from './loops.js';
import { Engine, Drift } from './engine.js';
import { Ambience, AMBIENCE_IDS, ambienceWarmJobs } from './ambience.js';
import { getSample, getNote, SAMPLE_NAMES } from './samples.js';

const NOOP_LOOP = Object.freeze({ setVolume() {}, setPan() {}, setRate() {}, stop() {} });
let warned = 0;
function warn(where, e) {
  if (warned++ < 8) console.warn('[audio] ' + where + ':', e);
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.mix = null;
    this.vol = { ...DEFAULT_VOL };
    this.music = null;
    this.musicId = null;
    this.finalLap = false;
    this.jingleUntil = 0;
    this.stars = new Set();
    this.loops = new Set();
    this.amb = null;
    this.ambId = null;
    this.engine = null;
    this.drift = null;
    this.voices = [];
    this.rand = rng(1234);
    this.pendingMusic = null;
    this.pendingAmb = null;
    this._ducked = false;
    this._janitor = 0;
    this._seed = 1;
    this._engineWanted = false;
    this._warmJobs = [];
    this._warmTimer = 0;
    this._pump = this._pump.bind(this);
  }

  /** Create / resume the AudioContext. Call from a user gesture; safe to call many times. */
  async unlock() {
    try {
      if (!this.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return false;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.mix = createMixer(this.ctx, this.ctx.destination, this.vol);
        this.engine = new Engine(this.ctx, this.mix.sfx.dry);
        this.drift = new Drift(this.ctx, this.mix.sfx.dry);
        this._janitor = setInterval(() => this._reap(), 2000);
        this._warmup();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch (e) {
      warn('unlock', e);
    }
    try {
      if (this.pendingMusic && !this.music) {
        const p = this.pendingMusic;
        this.pendingMusic = null;
        this.playMusic(p.id, p.opts);
      }
      if (this.pendingAmb && !this.amb) {
        const id = this.pendingAmb;
        this.pendingAmb = null;
        this.playAmbience(id);
      }
    } catch (e) {
      warn('unlock/pending', e);
    }
    return this.ready;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolume(v) {
    try {
      for (const k of ['master', 'music', 'sfx']) if (v && v[k] !== undefined) this.vol[k] = clamp(fin(v[k], this.vol[k]), 0, 1);
      if (this.mix) this.mix.setVolume(this.vol);
    } catch (e) { warn('setVolume', e); }
  }

  // ---------------------------------------------------------------- music
  playMusic(id, opts) {
    try {
      const { fadeIn = 0.6 } = opts || {};
      if (!MUSIC_IDS.includes(id)) return;
      if (!this.ctx) { this.pendingMusic = { id, opts: { fadeIn } }; return; }
      if (this.music && this.musicId === id) return;
      const song = getSong(id);
      this._warmSong(song, true); // anything not ready yet is generated lazily on first use
      if (this.music) this.music.stop(0.5);
      this.finalLap = false;
      this.music = new Sequencer(this.ctx, this.mix.music, song, { loop: true, seed: this._seed++ });
      this.music.start(this.ctx.currentTime + 0.06, clamp(fin(fadeIn, 0.6), 0, 10));
      this.musicId = id;
    } catch (e) { warn('playMusic', e); }
  }

  stopMusic(opts) {
    try {
      const { fadeOut = 0.8 } = opts || {};
      this.pendingMusic = null;
      if (this.music) this.music.stop(clamp(fin(fadeOut, 0.8), 0.02, 10));
      this.music = null;
      this.musicId = null;
    } catch (e) { warn('stopMusic', e); }
  }

  /** final lap: tempo ×1.12 + extra percussion layer, switched at the next bar line */
  setFinalLap(on) {
    try {
      this.finalLap = !!on;
      if (this.music) this.music.setFinal(this.finalLap);
    } catch (e) { warn('setFinalLap', e); }
  }

  playJingle(id) {
    try {
      if (!this.ready || !JINGLE_IDS.includes(id)) return;
      const song = getSong(id);
      const ctx = this.ctx;
      const t0 = ctx.currentTime + 0.03;
      const seq = new Sequencer(ctx, this.mix.jingle, song, { loop: false, seed: this._seed++ });
      seq.start(t0, 0);
      const end = t0 + song.endSec + 0.15;
      this.jingleUntil = Math.max(this.jingleUntil, end);
      this._applyDuck();
      setTimeout(() => this._applyDuck(), (end - ctx.currentTime) * 1000 + 40);
      setTimeout(() => seq.dispose(), (end - ctx.currentTime + 3) * 1000);
    } catch (e) { warn('playJingle', e); }
  }

  _applyDuck() {
    if (!this.mix) return;
    const on = this.stars.size > 0 || this.jingleUntil > this.ctx.currentTime + 0.02;
    if (on === this._ducked) return;
    this._ducked = on;
    this.mix.duck(on);
  }

  // ---------------------------------------------------------------- ambience
  playAmbience(id) {
    try {
      if (!AMBIENCE_IDS.includes(id)) { this.stopAmbience(); return; }
      if (!this.ctx) { this.pendingAmb = id; return; }
      if (this.amb && this.ambId === id) return;
      this.stopAmbience();
      this.amb = new Ambience(this.ctx, this.mix.amb, id, { seed: this._seed++ }).start(1.5);
      this.ambId = id;
    } catch (e) { warn('playAmbience', e); }
  }

  stopAmbience() {
    try {
      this.pendingAmb = null;
      if (this.amb) this.amb.stop(1.0);
      this.amb = null;
      this.ambId = null;
    } catch (e) { warn('stopAmbience', e); }
  }

  // ---------------------------------------------------------------- player engine & drift
  engineStart() {
    try {
      this._engineWanted = true; // remembered: starts as soon as audio is unlocked
      if (this.ready) this.engine.start();
    } catch (e) { warn('engineStart', e); }
  }
  engineStop() {
    try {
      this._engineWanted = false;
      if (this.engine) this.engine.stop();
    } catch (e) { warn('engineStop', e); }
  }
  engineUpdate(p) {
    try {
      if (!this.ready || !p || typeof p !== 'object') return;
      if (this._engineWanted && !this.engine.running) this.engine.start();
      this.engine.update(p);
    } catch (e) { warn('engineUpdate', e); }
  }
  driftUpdate(active, level) {
    try {
      if (!this.drift) return;
      if (!this.ready) { this.drift.dispose(); return; }
      this.drift.update(active, level);
    } catch (e) { warn('driftUpdate', e); }
  }

  // ---------------------------------------------------------------- one-shot sfx
  play(name, opts) {
    try {
      const { volume = 1, pan = 0, pitch = 1 } = opts || {};
      if (!this.ready) return;
      const fn = SFX[name];
      if (!fn) return;
      const meta = SFX_META[name] || {};
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const vol = clamp(fin(volume, 1), 0, 2);
      if (vol <= 0.001) return;
      this._reap();
      const same = this.voices.filter((v) => v.name === name && !v.stolen && v.end > now);
      if (same.length >= (meta.max || 4)) this._steal(same[0], now);
      const live = this.voices.filter((v) => !v.stolen && v.end > now);
      if (live.length >= 32) this._steal(live[0], now);
      const out = ctx.createGain();
      out.gain.value = vol * (meta.g ?? 0.7);
      const pn = ctx.createStereoPanner();
      pn.pan.value = clamp(fin(pan, 0), -1, 1);
      out.connect(pn).connect(this.mix.sfx.dry);
      let sg = null;
      if (meta.rev) {
        sg = ctx.createGain();
        sg.gain.value = meta.rev;
        pn.connect(sg).connect(this.mix.sfx.wet);
      }
      const v = { ctx, out, t: now + 0.005, p: clamp(fin(pitch, 1), 0.25, 4), r: this.rand, srcs: [] };
      const end = fn(v);
      this.voices.push({ name, out, pn, sg, srcs: v.srcs, end: fin(end, now + 2), stolen: false });
    } catch (e) { warn('play ' + name, e); }
  }

  _steal(v, now) {
    v.stolen = true;
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setTargetAtTime(0, now, 0.008);
    for (const s of v.srcs) { try { s.stop(now + 0.05); } catch (e) { /* ignore */ } }
    v.end = now;
  }

  _reap() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => {
      if (v.end + 0.25 < now) {
        for (const n of [v.out, v.pn, v.sg]) { if (n) { try { n.disconnect(); } catch (e) { /* ignore */ } } }
        return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------- loops
  startLoop(name, opts) {
    try {
      const { volume = 1, pan = 0 } = opts || {};
      if (!this.ready || !LOOP_NAMES.includes(name)) return NOOP_LOOP;
      const isStar = name === 'star_music';
      const loop = createLoop(name, this.ctx, isStar ? this.mix.jingle : this.mix.sfx, { volume, pan });
      if (!loop) return NOOP_LOOP;
      this.loops.add(loop);
      if (isStar) this.stars.add(loop);
      loop.onStop = () => {
        this.loops.delete(loop);
        this.stars.delete(loop);
        this._applyDuck();
      };
      this._applyDuck();
      return {
        setVolume: (v) => { try { loop.setVolume(v); } catch (e) { warn('loop.setVolume', e); } },
        setPan: (p) => { try { loop.setPan(p); } catch (e) { warn('loop.setPan', e); } },
        setRate: (r) => { try { loop.setRate(r); } catch (e) { warn('loop.setRate', e); } },
        stop: () => { try { loop.stop(); } catch (e) { warn('loop.stop', e); } },
      };
    } catch (e) {
      warn('startLoop ' + name, e);
      return NOOP_LOOP;
    }
  }

  // ---------------------------------------------------------------- internals
  /** pre-compute every buffer in small idle slices (≤ 6 ms) so the first notes never stall a frame */
  _warmup() {
    const sr = this.ctx.sampleRate;
    this._queue(SAMPLE_NAMES.map((n) => () => getSample(n, sr)));
    for (const id of ['title', 'select', 'start', 'final_lap', 'finish_win', 'finish_lose', 'star', 'inaka', 'sakura', 'matsuri', 'results']) this._warmSong(getSong(id));
    this._queue([() => buffers.kanedarai(sr), () => buffers.crackle(sr)]);
    for (const id of AMBIENCE_IDS) this._queue(ambienceWarmJobs(id, sr));
  }
  _warmSong(song, first = false) {
    if (!song || !this.ctx) return;
    const sr = this.ctx.sampleRate;
    this._queue(song.notesUsed.map(([inst, m]) => () => getNote(inst, m, sr)), first);
  }
  _queue(jobs, first = false) {
    if (first) this._warmJobs.unshift(...jobs);
    else this._warmJobs.push(...jobs);
    if (!this._warmTimer) this._warmTimer = setTimeout(this._pump, 30);
  }
  _pump() {
    this._warmTimer = 0;
    const t0 = performance.now();
    while (this._warmJobs.length && performance.now() - t0 < 6) {
      try { this._warmJobs.shift()(); } catch (e) { warn('warmup', e); }
    }
    if (this._warmJobs.length) this._warmTimer = setTimeout(this._pump, 20);
  }
}

// API summary
//   await audio.unlock()                       — first user gesture
//   audio.setVolume({ master, music, sfx })    — 0..1 (defaults 0.9 / 0.55 / 0.8)
//   audio.playMusic(id, { fadeIn }) / stopMusic({ fadeOut }) / setFinalLap(on)
//      ids: title select inaka sakura matsuri results
//   audio.playJingle(id)                       — start final_lap finish_win finish_lose (ducks music −8 dB)
//   audio.playAmbience(id) / stopAmbience()    — inaka sakura matsuri
//   audio.engineStart() / engineStop() / engineUpdate({ speed01, throttle, boost, airborne, offroad })
//   audio.driftUpdate(active, level)           — level 0..3
//   audio.play(name, { volume, pan, pitch })   — see SFX names in sfx.js
//   audio.startLoop(name, { volume, pan })     — crossing_bell train_run waterfall star_music
//      → { setVolume, setPan, setRate, stop }
