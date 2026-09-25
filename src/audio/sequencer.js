// Song compiler + look-ahead step sequencer.
//
// Songs are written as data (see songs.js). Pitched parts use a tracker-like token grammar,
// one bar per string, one token per 16th note (or per 8th/quarter/... with a '8|' '4|' '2|' '1|' prefix):
//   'C5'  note           'C4+E4+G4' chord        '-' hold previous note     '.' rest
//   'n62' MIDI number    suffix '!' accent, '?' ghost, '*' ornament (grace note from above)
// Notes may be held across bar lines ('-' at the start of the next bar extends the note).
// Chord-relative templates (tpl) turn 'R 5 8 10' etc. into notes for each bar's chord.
// Drum parts are objects { kitKey: 'x...X...o...' } with x=normal X=accent o=ghost 1-9=velocity.
import { playInst, playHit } from './voices.js';
import { NOTE_INSTS } from './samples.js';
import { clamp, rng } from './dsp.js';

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const acc = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
export function noteToMidi(s) {
  if (s[0] === 'n') return Number(s.slice(1));
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  return m ? 12 * (Number(m[3]) + 1) + PC[m[1]] + acc(m[2]) : NaN;
}

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], dim: [0, 3, 6], 9: [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14], madd9: [0, 3, 7, 14], maj9: [0, 4, 7, 11, 14],
};
export function parseChord(sym) {
  const [main, slash] = sym.split('/');
  const m = /^([A-G])(#|b)?(.*)$/.exec(main);
  if (!m || !QUAL[m[3]]) throw new Error('bad chord ' + sym);
  const root = (PC[m[1]] + acc(m[2]) + 12) % 12;
  let bass = root;
  if (slash) {
    const b = /^([A-G])(#|b)?$/.exec(slash);
    bass = (PC[b[1]] + acc(b[2]) + 12) % 12;
  }
  return { sym, root, ints: QUAL[m[3]], bass };
}

// ------------------------------------------------------------------ bar parsing
function expandBar(str, len, warn, where) {
  let s = String(str).trim();
  let res = len;
  const m = /^(\d+)\|/.exec(s);
  if (m) { res = Number(m[1]); s = s.slice(m[0].length); }
  const toks = s.split(/\s+/).filter(Boolean);
  if (toks.length !== res && warn) warn.push(`${where}: ${toks.length} tokens (expected ${res})`);
  const per = len / res;
  const out = new Array(len).fill('.');
  toks.forEach((tk, k) => {
    const s0 = Math.round(k * per);
    if (s0 >= len) return;
    out[s0] = tk;
    for (let j = 1; j < per; j++) if (s0 + j < len) out[s0 + j] = tk === '.' ? '.' : '-';
  });
  return out;
}

function streamNotes(toks, ci, defVel, evs, warn, where) {
  let cur = null;
  toks.forEach((tk, i) => {
    if (tk === '-') { if (cur) cur.l++; return; }
    if (tk === '.') { cur = null; return; }
    const m = /^([^!?*]+)([!?*]*)$/.exec(tk);
    const ms = m ? m[1].split('+').map(noteToMidi) : [NaN];
    if (ms.some((x) => !Number.isFinite(x))) { warn.push(`${where}: bad token '${tk}'`); cur = null; return; }
    const suf = m[2];
    let v = defVel;
    if (suf.includes('!')) v = Math.min(1, defVel * 1.25);
    if (suf.includes('?')) v = defVel * 0.55;
    cur = { c: ci, s: i, m: ms.length > 1 ? ms : ms[0], l: 1, v, o: suf.includes('*'), lg: cur !== null };
    evs.push(cur);
  });
}

const DRUM_VEL = { x: 0.8, X: 1, o: 0.45 };
function kitEvents(pat, bar, ci, evs, len, warn, where) {
  for (const key in pat) {
    let s = String(pat[key]).replace(/\s+/g, '');
    let res = len;
    const m = /^(\d+)\|/.exec(s);
    if (m) { res = Number(m[1]); s = s.slice(m[0].length); }
    if (s.length !== res) warn.push(`${where}/${key}: ${s.length} steps (expected ${res})`);
    const per = len / res;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      const v = DRUM_VEL[c] ?? (c >= '1' && c <= '9' ? Number(c) / 9 : 0);
      if (v > 0) evs.push({ c: ci, s: bar.i * len + Math.round(k * per), d: key, v });
    }
  }
}

// ------------------------------------------------------------------ generators (chord-relative)
const inReg = (pc, base) => base + ((((pc - base) % 12) + 12) % 12);
function degMidi(d, ch, base, next) {
  const r = inReg(ch.root, base);
  const third = ch.ints.find((x) => x >= 2 && x <= 5) ?? 4;
  const fifth = ch.ints.find((x) => x >= 6 && x <= 8) ?? 7;
  const sev = ch.ints.find((x) => x >= 9 && x <= 11) ?? 12;
  const nr = next ? inReg(next.root, base) : r;
  switch (d) {
    case 'R': return r;
    case 'B': return inReg(ch.bass, base);
    case '2': return r + 2;
    case '3': return r + third;
    case '5': return r + fifth;
    case '6': return r + 9;
    case '7': return r + sev;
    case '8': return r + 12;
    case '9': return r + 14;
    case '10': return r + 12 + third;
    case '12': return r + 12 + fifth;
    case '14': return r + 12 + sev;
    case '15': return r + 24;
    case 'L5': return r + fifth - 12;
    case 'L3': return r + third - 12;
    case 'L7': return r + sev - 12;
    case 'A': return nr - 1; // chromatic approach (from below) to the next bar's root
    case 'W': return nr + 2; // approach from a whole step above
    case 'V': return nr + 7 - (nr + 7 - r > 9 ? 12 : 0); // the fifth of the next chord
    default: return noteToMidi(d);
  }
}
/** chord-relative template → per-bar generator. base = lowest MIDI note the root may take. */
export function tpl(pattern, base) {
  return (bar) => {
    const toks = expandBar(pattern, bar.len);
    return toks.map((tk, step) => {
      if (tk === '.' || tk === '-') return tk;
      const ch = step < bar.len / 2 || !bar.chords[1] ? bar.chords[0] : bar.chords[1];
      const m = /^([^!?*]+)([!?*]*)$/.exec(tk);
      return m[1].split('+').map((d) => 'n' + degMidi(d, ch, base, bar.next)).join('+') + m[2];
    }).join(' ');
  };
}
/** close-position voicing (every inversion considered) with the least motion from `prev` */
function voicing(ch, prev, lo, n) {
  const pcs = [...new Set(ch.ints.map((x) => (ch.root + x) % 12))];
  while (pcs.length > n) pcs.splice(2, 1); // drop the fifth first
  const cands = [];
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = pcs.slice(rot).concat(pcs.slice(0, rot));
    const v = [];
    let cur = lo - 1;
    for (const pc of order) {
      let m = cur + 1;
      while ((m % 12 + 12) % 12 !== pc) m++;
      v.push(m);
      cur = m;
    }
    cands.push(v);
  }
  const avg = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const near = (m, set) => Math.min(...set.map((p) => Math.abs(m - p)));
  const score = prev
    ? (v) => v.reduce((a, m) => a + near(m, prev), 0) + prev.reduce((a, p) => a + near(p, v), 0) + Math.abs(avg(v) - (lo + 8)) * 0.3
    : (v) => Math.abs(avg(v) - (lo + 8));
  return cands.sort((a, b) => score(a) - score(b))[0];
}
/** sustained chords with smooth voice leading. lo = lowest note, n = voices */
export function padGen(lo = 55, n = 4) {
  let prev = null;
  return (bar) => {
    const vs = bar.chords.map((c) => (prev = voicing(c, prev, lo, n)));
    const tok = (v) => v.map((m) => 'n' + m).join('+');
    return vs.length === 1 ? '1| ' + tok(vs[0]) : '2| ' + vs.map(tok).join(' ');
  };
}

// ------------------------------------------------------------------ drum kit
export const KIT = {
  k: { s: 'kick', vol: 0.62, pan: 0, rev: 0.03 },
  s: { s: 'snare', vol: 0.34, pan: 0.04, rev: 0.16 },
  c: { s: 'clap', vol: 0.26, pan: -0.05, rev: 0.2 },
  h: { s: 'hat', vol: 0.2, pan: 0.28, rev: 0.04 },
  oh: { s: 'ohat', vol: 0.17, pan: 0.28, rev: 0.08 },
  sk: { s: 'shaker', vol: 0.19, pan: -0.32, rev: 0.06 },
  ci: { s: 'cicada', vol: 0.16, pan: 0.36, rev: 0.1 },
  br: { s: 'brush', vol: 0.3, pan: 0.08, rev: 0.14 },
  cr: { s: 'crash', vol: 0.17, pan: -0.22, rev: 0.18 },
  don: { s: 'taiko', vol: 0.6, pan: 0, rev: 0.32 },
  ka: { s: 'taikoKa', vol: 0.26, pan: 0.12, rev: 0.16 },
  sh: { s: 'shime', vol: 0.26, pan: 0.22, rev: 0.1 },
  kn: { s: 'kane', vol: 0.13, pan: -0.3, rev: 0.12 },
  km: { s: 'kaneM', vol: 0.13, pan: -0.3, rev: 0.05 },
  cp: { s: 'chappa', vol: 0.11, pan: 0.34, rev: 0.12 },
  cpm: { s: 'chappaM', vol: 0.11, pan: 0.34, rev: 0.05 },
  wb: { s: 'wood', vol: 0.2, pan: -0.18, rev: 0.12 },
  hy: { s: 'hyoshigi', vol: 0.22, pan: 0.2, rev: 0.25 },
  sy: { s: 'soiya', vol: 0.34, pan: 0, rev: 0.28 },
  ha: { s: 'hah', vol: 0.3, pan: 0, rev: 0.28 },
};

// ------------------------------------------------------------------ compile
const pick = (part, bar) => (Array.isArray(part) ? part[bar.i] ?? null : part);
const trans = (m, k) => (Array.isArray(m) ? m.map((x) => x + k) : m + k);

export function compileSong(def) {
  const len = def.len || 16;
  const warn = [];
  const names = Object.keys(def.ch);
  const channels = names.map((name) => ({ name, vel: 0.8, ...def.ch[name] }));
  const idx = Object.fromEntries(names.map((n, i) => [n, i]));
  const form = def.form || { intro: def.sec.intro ? ['intro'] : [], loop: ['A', 'B'] };
  const secOut = {};
  const chordsOf = (sn) => def.sec[sn].chords.trim().split(/\s+/).map((b) => b.split('_').map(parseChord));
  // the section that follows each section in the form (the loop wraps around)
  const order = [...form.intro, ...form.loop];
  const follow = (sn) => {
    const i = order.indexOf(sn);
    if (i < order.length - 1) return order[i + 1];
    return form.loop.length ? form.loop[0] : sn;
  };
  for (const sname of new Set(order)) {
    const sec = def.sec[sname];
    const chordBars = chordsOf(sname);
    const nextFirst = chordsOf(follow(sname))[0][0];
    const bars = chordBars.map((chords, i) => ({ i, len, chords, next: chordBars[i + 1] ? chordBars[i + 1][0] : nextFirst, sec: sname }));
    const evs = [];
    channels.forEach((ch, ci) => {
      if (ch.copy) return;
      const part = sec.parts[ch.name];
      if (part == null) return;
      const where = `${def.id}/${sname}/${ch.name}`;
      if (ch.kit) {
        for (const bar of bars) {
          let p = pick(part, bar);
          if (typeof p === 'function') p = p(bar);
          if (p) kitEvents(p, bar, ci, evs, len, warn, where + '/' + bar.i);
        }
      } else {
        const toks = [];
        for (const bar of bars) {
          let p = pick(part, bar);
          if (typeof p === 'function') p = p(bar);
          toks.push(...(p ? expandBar(p, len, warn, where + '/' + bar.i) : new Array(len).fill('.')));
        }
        streamNotes(toks, ci, ch.vel, evs, warn, where);
      }
    });
    channels.forEach((ch, ci) => {
      if (!ch.copy || (ch.secs && !ch.secs.includes(sname))) return;
      for (const e of evs.filter((x) => x.c === idx[ch.copy])) evs.push({ ...e, c: ci, m: trans(e.m, ch.tr || 0), v: e.v * (ch.vmul ?? 1) });
    });
    secOut[sname] = { nb: bars.length, evs };
  }
  const used = new Set();
  const build = (list) => {
    const out = [];
    for (const n of list) {
      const s = secOut[n];
      const bars = Array.from({ length: s.nb }, () => ({ len, steps: new Array(len) }));
      for (const e of s.evs) {
        const b = bars[Math.floor(e.s / len)];
        if (!b) continue;
        (b.steps[e.s % len] ||= []).push(e);
        const ch = channels[e.c];
        if (!ch.kit && NOTE_INSTS.includes(ch.inst)) for (const m of [].concat(e.m)) used.add(ch.inst + ':' + m);
      }
      out.push(...bars);
    }
    return out;
  };
  const intro = build(form.intro);
  const loop = build(form.loop);
  const sd = 15 / def.bpm;
  return {
    id: def.id, bpm: def.bpm, swing: def.swing || 0, gain: def.gain ?? 1, len, channels, kit: def.kit || {},
    intro, loop, warnings: warn,
    notesUsed: [...used].map((k) => { const [i, m] = k.split(':'); return [i, Number(m)]; }),
    introSec: intro.length * len * sd,
    loopSec: loop.length * len * sd,
    // one-shots (jingles): time of the end of the last note
    endSec: (form.loop.length ? (intro.length + loop.length) * len : endOf(intro, len)) * sd,
  };
}
function endOf(bars, len) {
  let end = 0;
  bars.forEach((b, bi) => b.steps.forEach((evs, st) => evs && evs.forEach((e) => { end = Math.max(end, bi * len + st + (e.l || 2)); })));
  return end;
}

// ------------------------------------------------------------------ sequencer
const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

export class Sequencer {
  /**
   * @param bus { dry: AudioNode, wet: AudioNode } — dry output and reverb send
   * @param opts { loop, onEnd, solo, seed }
   */
  constructor(ctx, bus, song, { loop = true, onEnd = null, solo = null, seed = 7 } = {}) {
    this.ctx = ctx;
    this.song = song;
    this.loopOn = loop;
    this.onEnd = onEnd;
    this.solo = solo;
    this.rand = rng(seed);
    this.tempo = 1;
    this.pendingTempo = null;
    this.final = false;
    this.pendingFinal = null;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(bus.dry);
    this.send = ctx.createGain();
    this.send.gain.value = 0;
    this.send.connect(bus.wet);
    this.strips = new Map();
    this.last = new Map();
    this.running = false;
    this.stopped = false;
    this.timer = 0;
    this._tick = this._tick.bind(this);
  }

  _strip(key, def) {
    let s = this.strips.get(key);
    if (!s) {
      const ctx = this.ctx;
      const inp = ctx.createGain();
      inp.gain.value = def.vol ?? 0.5;
      const nodes = [inp];
      let head = inp;
      if (def.lp) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = def.lp;
        f.Q.value = 0.5;
        head.connect(f);
        head = f;
        nodes.push(f);
      }
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp(def.pan ?? 0, -1, 1);
      head.connect(pan).connect(this.out);
      nodes.push(pan);
      if (def.rev) {
        const sg = ctx.createGain();
        sg.gain.value = def.rev;
        head.connect(sg).connect(this.send);
        nodes.push(sg);
      }
      s = { inp, nodes };
      this.strips.set(key, s);
    }
    return s.inp;
  }

  start(t0 = this.ctx.currentTime + 0.05, fadeIn = 0) {
    const ctx = this.ctx;
    t0 = Math.max(t0, ctx.currentTime);
    const lvl = this.song.gain;
    for (const p of [this.out.gain, this.send.gain]) {
      p.setValueAtTime(fadeIn > 0 ? 0 : lvl, t0);
      if (fadeIn > 0) p.linearRampToValueAtTime(lvl, t0 + fadeIn);
    }
    this.t0 = t0;
    this.nextTime = t0;
    this.phase = this.song.intro.length ? 'intro' : 'loop';
    this.bar = 0;
    this.step = 0;
    this.pass = 0;
    this.running = true;
    if (isOffline(ctx)) this.scheduleUntil(ctx.length / ctx.sampleRate);
    else this._tick();
    return this;
  }

  /** tempo multiplier / final-lap layer, applied at the next bar line */
  setFinal(on) {
    this.pendingTempo = on ? 1.12 : 1;
    this.pendingFinal = !!on;
  }
  setRate(r) { this.pendingTempo = null; this.tempo = clamp(r, 0.25, 4); }

  stop(fade = 0.5) {
    if (this.stopped) return;
    this.stopped = true;
    this.running = false;
    clearTimeout(this.timer);
    const now = this.ctx.currentTime;
    fade = Math.max(0.02, fade);
    for (const p of [this.out.gain, this.send.gain]) {
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + fade);
    }
    setTimeout(() => this.dispose(), (fade + 0.3) * 1000);
  }

  dispose() {
    this.running = false;
    clearTimeout(this.timer);
    for (const s of this.strips.values()) for (const n of s.nodes) n.disconnect();
    this.strips.clear();
    try { this.out.disconnect(); this.send.disconnect(); } catch (e) { /* ignore */ }
  }

  _tick() {
    if (!this.running) return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    this.scheduleUntil(this.ctx.currentTime + (hidden ? 1.5 : 0.13));
    if (this.running) this.timer = setTimeout(this._tick, 25);
  }

  scheduleUntil(until) {
    const ctx = this.ctx;
    if (!isOffline(ctx) && this.nextTime < ctx.currentTime - 0.2) {
      // the tab was frozen: skip ahead silently instead of bursting all missed notes
      let g = 0;
      while (this.running && this.nextTime < ctx.currentTime && g++ < 100000) this._advance();
    }
    let guard = 0;
    while (this.running && this.nextTime < until && guard++ < 20000) {
      const bar = this._bars()[this.bar];
      if (!bar) { this._finish(); break; }
      const evs = bar.steps[this.step];
      if (evs) for (const e of evs) this._play(e, this.nextTime);
      this._advance();
    }
  }

  _bars() { return this.phase === 'intro' ? this.song.intro : this.song.loop; }

  _advance() {
    const sd = 15 / (this.song.bpm * this.tempo);
    const sw = this.song.swing;
    this.nextTime += (this.step % 2 === 0 ? 1 + sw : 1 - sw) * sd;
    const bar = this._bars()[this.bar];
    if (!bar) return;
    if (++this.step >= bar.len) {
      this.step = 0;
      this.bar++;
      if (this.bar >= this._bars().length && this.loopOn && this.song.loop.length) {
        if (this.phase === 'intro') this.phase = 'loop';
        else this.pass++;
        this.bar = 0;
      }
      if (this.pendingTempo != null) { this.tempo = this.pendingTempo; this.pendingTempo = null; }
      if (this.pendingFinal != null) { this.final = this.pendingFinal; this.pendingFinal = null; }
    }
  }

  _finish() {
    this.running = false;
    clearTimeout(this.timer);
    if (this.onEnd) this.onEnd(this.nextTime);
  }

  _on(ch) {
    const loopOdd = this.phase === 'loop' && this.pass % 2 === 1;
    switch (ch.when) {
      case 'odd': return loopOdd;
      case 'even': return !loopOdd;
      case 'final': return this.final;
      case 'notfinal': return !this.final;
      case 'oddfinal': return loopOdd || this.final;
      default: return true;
    }
  }

  _play(e, t) {
    const ch = this.song.channels[e.c];
    if (this.solo && ch.name !== this.solo) return;
    if (!this._on(ch)) return;
    const ctx = this.ctx;
    if (ch.kit) {
      const d = KIT[e.d];
      if (!d) return;
      const dest = this._strip('kit:' + e.d, { ...d, ...(this.song.kit[e.d] || {}) });
      const hv = 1 + (this.rand() - 0.5) * 0.12; // light humanisation: velocity and a hair of pitch
      const hr = 1 + (this.rand() - 0.5) * 0.02;
      playHit(ctx, dest, d.s, t, e.v * hv * (ch.vol ?? 1), ((this.song.kit[e.d] || {}).rate || 1) * hr);
      return;
    }
    const sd = 15 / (this.song.bpm * this.tempo);
    const dest = this._strip(ch.name, ch);
    const jit = ch.human === false ? 0 : (this.rand() - 0.5) * 0.006;
    const v = e.v * (1 + (this.rand() - 0.5) * 0.1);
    const sustained = ch.inst === 'flute' || ch.inst === 'shaku' || ch.inst === 'strings';
    const dur = e.l * sd * (ch.legato ?? (sustained ? 1 : 0.94));
    if (ch.choke) {
      const lv = this.last.get(e.c);
      if (lv) lv.stop(t + jit);
    }
    const voice = playInst(ctx, dest, ch.inst, t + jit, e.m, dur, v, { orn: e.o, lg: e.lg, strum: ch.strum, cut: ch.cut });
    if (ch.choke && voice) this.last.set(e.c, voice);
  }
}
