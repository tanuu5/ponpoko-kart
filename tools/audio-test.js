// Audio test page: manual buttons for every sound + an automatic offline self-test.
//   ?selftest=1          render every music track / jingle / sfx / loop / ambience offline and report
//                        peak, RMS, HF ratio, DC and NaN → console + window.__selftest
//   ?selftest=music      only the music section (faster)
//   ?stems=<musicId>&sec=20   per-channel loudness of one track (mixing aid)
//   ?spectro=<id>&sec=14      draw a spectrogram of an offline render (id: music/jingle id, sfx:name, amb:id, loop:name)
import { GameAudio } from '../src/audio/Audio.js';
import { createMixer, DEFAULT_VOL } from '../src/audio/mixer.js';
import { Sequencer } from '../src/audio/sequencer.js';
import { getSong, MUSIC_IDS, JINGLE_IDS } from '../src/audio/songs.js';
import { SFX, SFX_META, SFX_NAMES } from '../src/audio/sfx.js';
import { createLoop, LOOP_NAMES } from '../src/audio/loops.js';
import { Engine, Drift } from '../src/audio/engine.js';
import { Ambience, AMBIENCE_IDS } from '../src/audio/ambience.js';
import { prewarm } from '../src/audio/voices.js';
import { rng, Biquad, makeIR, cacheStats } from '../src/audio/dsp.js';
import { getSample, SAMPLE_NAMES } from '../src/audio/samples.js';
import { buffers } from '../src/audio/sfx.js';

const $ = (id) => document.getElementById(id);
const audio = new GameAudio();
window.audio = audio;

// ------------------------------------------------------------------ manual UI
function btn(parent, label, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => { audio.unlock().then(() => fn(b)); };
  parent.appendChild(b);
  return b;
}
$('unlock').onclick = async () => { await audio.unlock(); $('status').textContent = audio.ready ? `running @ ${audio.ctx.sampleRate} Hz` : 'not running'; };
const vols = () => audio.setVolume({ master: +$('vMaster').value, music: +$('vMusic').value, sfx: +$('vSfx').value });
for (const id of ['vMaster', 'vMusic', 'vSfx']) $(id).oninput = vols;

for (const id of MUSIC_IDS) btn($('music'), id, () => audio.playMusic(id));
btn($('music'), '■ stop', () => audio.stopMusic());
const fl = btn($('music'), 'final lap: off', (b) => { const on = !audio.finalLap; audio.setFinalLap(on); b.textContent = 'final lap: ' + (on ? 'ON' : 'off'); b.classList.toggle('on', on); });
for (const id of JINGLE_IDS) btn($('jingles'), id, () => audio.playJingle(id));
for (const id of AMBIENCE_IDS) btn($('amb'), id, () => audio.playAmbience(id));
btn($('amb'), '■ stop', () => audio.stopAmbience());
for (const n of SFX_NAMES) btn($('sfx'), n, () => audio.play(n, { pan: +$('sPan').value, pitch: +$('sPitch').value, volume: +$('sVol').value }));
let lastLoop = null;
const loopsOn = {};
for (const n of LOOP_NAMES) {
  btn($('loops'), n, (b) => {
    if (loopsOn[n]) { loopsOn[n].stop(); loopsOn[n] = null; b.classList.remove('on'); return; }
    loopsOn[n] = lastLoop = audio.startLoop(n, { volume: +$('lVol').value, pan: +$('lPan').value });
    b.classList.add('on');
  });
}
$('lVol').oninput = () => lastLoop && lastLoop.setVolume(+$('lVol').value);
$('lPan').oninput = () => lastLoop && lastLoop.setPan(+$('lPan').value);
$('lRate').oninput = () => lastLoop && lastLoop.setRate(+$('lRate').value);
let engineOn = false;
$('engOn').onclick = async () => { await audio.unlock(); audio.engineStart(); engineOn = true; };
$('engOff').onclick = () => { audio.engineStop(); engineOn = false; };
(function frame() {
  if (engineOn) audio.engineUpdate({ speed01: +$('eSpeed').value, throttle: +$('eThr').value, boost: $('eBoost').checked, airborne: $('eAir').checked, offroad: $('eOff').checked });
  audio.driftUpdate($('dOn').checked, +$('dLvl').value);
  requestAnimationFrame(frame);
})();

// ------------------------------------------------------------------ offline self-test
const SR = 48000;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
const r3 = (x) => Math.round(x * 1000) / 1000;

function analyze(buf, skip = 0) {
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const h1 = new Biquad('hp', 6000, 0.707, SR), h2 = new Biquad('hp', 6000, 0.707, SR);
  const win = Math.floor(0.1 * SR);
  let peak = 0, sum = 0, n = 0, nan = 0, dc = 0, hs = 0, wsum = 0, wmax = 0, wn = 0;
  for (let i = Math.floor(skip * SR); i < L.length; i++) {
    const l = L[i], r = R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    const e = l * l + r * r;
    sum += e; n += 2; dc += l + r;
    const h = h2.process(h1.process((l + r) * 0.5));
    hs += h * h * 2;
    wsum += e; wn += 2;
    if (wn >= win * 2) { wmax = Math.max(wmax, Math.sqrt(wsum / wn)); wsum = 0; wn = 0; }
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  // coarse spectral balance: energy per band relative to the total (dB)
  const edges = [[0, 120], [120, 500], [500, 2000], [2000, 6000], [6000, 0]];
  const bands = edges.map(([lo, hi]) => {
    const fs = [];
    if (lo) fs.push(new Biquad('hp', lo, 0.707, SR), new Biquad('hp', lo, 0.707, SR));
    if (hi) fs.push(new Biquad('lp', hi, 0.707, SR), new Biquad('lp', hi, 0.707, SR));
    let e = 0;
    for (let i = Math.floor(skip * SR); i < L.length; i++) {
      let x = (L[i] + R[i]) * 0.5;
      if (!Number.isFinite(x)) continue;
      for (const f of fs) x = f.process(x);
      e += x * x;
    }
    return e;
  });
  const et = bands.reduce((a, b) => a + b, 0) || 1;
  const bandDb = bands.map((e) => Math.round(10 * Math.log10(e / et + 1e-12) * 10) / 10);
  return { bandDb, peak: r3(peak), peakDb: r3(db(peak)), rms: r3(rms), rmsDb: r3(db(rms)), maxRms100ms: r3(wmax), loudDb: r3(db(wmax)), hfDb: r3(db(Math.sqrt(hs / Math.max(1, n)) / (rms || 1))), dc: Number((dc / Math.max(1, n)).toExponential(2)), nan };
}

async function render(dur, setup, skip = 0) {
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const mix = createMixer(ctx, ctx.destination, DEFAULT_VOL);
  const a = performance.now();
  await setup(ctx, mix);
  const setupMs = r3(performance.now() - a);
  const b = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - b;
  return { ...analyze(buf, skip), setupMs, xRealtime: r3((dur * 1000) / renderMs) };
}

const T = (d) => new Promise((r) => setTimeout(r, d));

async function selftest(scope = 'all') {
  const out = { ok: false, done: false, items: [], warnings: [], started: new Date().toISOString() };
  window.__selftest = out;
  const t0 = performance.now();
  // main-thread cost of pre-computing buffers (cold cache): what the game pays once
  {
    const tm = {};
    const time = (k, f) => { const a = performance.now(); f(); tm[k] = r3(performance.now() - a); };
    time('reverbIR', () => makeIR(SR));
    for (const n of SAMPLE_NAMES) time('smp:' + n, () => getSample(n, SR));
    time('fx:kanedarai', () => buffers.kanedarai(SR));
    time('fx:crackle', () => buffers.crackle(SR));
    for (const id of [...MUSIC_IDS, ...JINGLE_IDS, 'star']) time('notes:' + id, () => prewarm(SR, getSong(id).notesUsed));
    out.timingMs = tm;
    out.timingTotalMs = r3(Object.values(tm).reduce((a, b) => a + b, 0));
    out.timingMaxMs = Object.entries(tm).sort((a, b) => b[1] - a[1]).slice(0, 5);
    out.cache = cacheStats();
  }
  const add = (kind, name, res, extra = {}) => {
    const silent = res.peak < 0.005 || res.rms < 1e-4;
    const it = { kind, name, ...res, ...extra, silent, pass: !silent && res.nan === 0 && res.peak <= 0.95 };
    out.items.push(it);
    $('testStatus').textContent = `${kind}/${name}…`;
    return it;
  };
  // calibration: chain gain for quiet & loud signals through the sfx bus
  if (scope === 'all') {
    for (const [name, amp] of [['cal_sine_-20dB', 0.1], ['cal_sine_-1dB', 0.9]]) {
      const res = await render(1.5, (ctx, mix) => {
        const o = ctx.createOscillator(); o.frequency.value = 440;
        const g = ctx.createGain(); g.gain.value = amp;
        o.connect(g).connect(mix.sfx.dry); o.start(0);
      }, 0.5);
      add('cal', name, res, { inPeak: amp * DEFAULT_VOL.sfx * DEFAULT_VOL.master, gain: r3(res.peak / (amp * DEFAULT_VOL.sfx * DEFAULT_VOL.master)) });
    }
  }
  // music: intro + full A/B loop (+ a bit of the second pass)
  for (const id of MUSIC_IDS) {
    const song = getSong(id);
    out.warnings.push(...song.warnings);
    prewarm(SR, song.notesUsed);
    const dur = Math.min(40, song.introSec + song.loopSec + 1.5);
    const res = await render(dur, (ctx, mix) => { new Sequencer(ctx, mix.music, song, { loop: true }).start(0, 0); }, song.introSec * 0.5);
    add('music', id, res, { sec: r3(dur), bpm: song.bpm });
    await T(0);
  }
  // final-lap variant of one race track (tempo + extra layer from bar 1)
  {
    const song = getSong('matsuri');
    const res = await render(12, (ctx, mix) => { const s = new Sequencer(ctx, mix.music, song, { loop: true }); s.final = true; s.tempo = 1.12; s.start(0, 0); });
    add('music', 'matsuri(final)', res);
  }
  if (scope === 'all') {
    for (const id of [...JINGLE_IDS, 'star']) {
      const song = getSong(id);
      out.warnings.push(...song.warnings);
      prewarm(SR, song.notesUsed);
      const dur = id === 'star' ? 8 : song.endSec + 1.5;
      const res = await render(dur, (ctx, mix) => { new Sequencer(ctx, mix.jingle, song, { loop: id === 'star' }).start(0, 0); });
      add('jingle', id, res, { sec: r3(id === 'star' ? song.loopSec : song.endSec) });
    }
    for (const name of SFX_NAMES) {
      const meta = SFX_META[name] || {};
      const res = await render(3, (ctx, mix) => {
        const outG = ctx.createGain(); outG.gain.value = meta.g ?? 0.7;
        outG.connect(mix.sfx.dry);
        if (meta.rev) { const s = ctx.createGain(); s.gain.value = meta.rev; outG.connect(s).connect(mix.sfx.wet); }
        SFX[name]({ ctx, out: outG, t: 0.02, p: 1, r: rng(5), srcs: [] });
      });
      add('sfx', name, res);
    }
    for (const name of LOOP_NAMES) {
      const res = await render(name === 'star_music' ? 7 : 5, (ctx, mix) => {
        const l = createLoop(name, ctx, name === 'star_music' ? mix.jingle : mix.sfx, { volume: 1, pan: 0 });
        l.setRate(1.1);
      }, 0.3);
      add('loop', name, res);
    }
    for (const id of AMBIENCE_IDS) {
      const res = await render(14, (ctx, mix) => { new Ambience(ctx, mix.amb, id, { seed: 3 }).start(0.5); }, 1);
      add('ambience', id, res);
    }
    {
      const res = await render(5, (ctx, mix) => {
        const e = new Engine(ctx, mix.sfx.dry);
        e.start(0);
        for (let t = 0; t < 4.6; t += 0.05) {
          const s = Math.min(1.6, t / 2.5);
          e.update({ speed01: s, throttle: t < 3.8 ? 1 : 0, boost: t > 2.6 && t < 3.2, airborne: t > 3.3 && t < 3.8, offroad: t > 4.0 }, t);
        }
        e.update({ speed01: NaN, throttle: Infinity, boost: 'x', airborne: undefined, offroad: null }, 4.7);
      }, 0.1);
      add('engine', 'sweep', res);
    }
    {
      const res = await render(3.5, (ctx, mix) => {
        const d = new Drift(ctx, mix.sfx.dry);
        for (let t = 0; t < 3.4; t += 0.033) d.update(t < 2.9, Math.floor(t / 0.75), t);
      }, 0.05);
      add('drift', 'levels0-3', res);
    }
    // realtime API robustness: nothing may throw, before or after unlock, with junk inputs
    const errors = [];
    const tryIt = async (label, fn) => { try { await fn(); } catch (e) { errors.push(label + ': ' + e.message); } };
    const junk = new GameAudio();
    const calls = (a) => [
      () => a.setVolume({ master: NaN, music: -3, sfx: 'x' }), () => a.playMusic('title'), () => a.playMusic('nope'), () => a.setFinalLap(true),
      () => a.playJingle('final_lap'), () => a.playAmbience('sakura'), () => a.engineStart(),
      () => a.engineUpdate({ speed01: NaN, throttle: Infinity, boost: true, airborne: 1, offroad: false }), () => a.engineUpdate(null),
      () => a.driftUpdate(true, NaN), () => a.driftUpdate(true, 99), () => a.play('coin', { volume: NaN, pan: Infinity, pitch: -1 }),
      () => a.play('nope'), () => { const h = a.startLoop('crossing_bell', { volume: NaN }); h.setRate(NaN); h.setPan(9); h.setVolume(Infinity); h.stop(); h.stop(); },
      () => a.startLoop('nope').stop(), () => a.stopAmbience(), () => a.engineStop(), () => a.stopMusic({ fadeOut: NaN }),
      () => a.play('coin', null), () => a.playMusic('select', null), () => a.stopMusic(null), () => a.startLoop('waterfall', null).stop(), () => a.setVolume(null), () => a.playJingle(null), () => a.playAmbience(undefined),
    ];
    for (const [i, f] of calls(junk).entries()) await tryIt('pre-unlock#' + i, f);
    await tryIt('unlock', () => junk.unlock());
    await tryIt('unlock-again', () => junk.unlock());
    for (const [i, f] of calls(junk).entries()) await tryIt('post-unlock#' + i, f);
    junk.setVolume({ master: 0 });
    out.api = { errors, readyAfterUnlock: junk.ready, state: junk.ctx && junk.ctx.state };
    junk.stopMusic({ fadeOut: 0.05 }); junk.stopAmbience(); junk.engineStop();
    // realtime scheduler check: music must keep sounding and the look-ahead must stay ahead of the clock
    if (junk.ready) {
      junk.setVolume({ master: 0.9 });
      const an = junk.ctx.createAnalyser();
      an.fftSize = 2048;
      junk.mix.master.connect(an);
      await T(300);
      junk.playMusic('matsuri', { fadeIn: 0 });
      junk.setFinalLap(true);
      const data = new Float32Array(an.fftSize);
      const rt = { rms: [], lead: [] };
      for (let i = 0; i < 25; i++) {
        await T(100);
        an.getFloatTimeDomainData(data);
        rt.rms.push(r3(Math.sqrt(data.reduce((a, x) => a + x * x, 0) / data.length)));
        if (junk.music) rt.lead.push(r3(junk.music.nextTime - junk.ctx.currentTime));
      }
      rt.tempo = junk.music && junk.music.tempo;
      rt.silentFrames = rt.rms.slice(3).filter((x) => x < 1e-3).length;
      rt.minLead = Math.min(...rt.lead);
      rt.ok = rt.silentFrames === 0 && rt.minLead > 0 && rt.tempo > 1.1;
      out.realtime = rt;
      junk.stopMusic({ fadeOut: 0.1 });
      an.disconnect();
    }
  }
  // CPU: render a worst-case scene and measure how much faster than realtime the graph renders
  if (scope === 'all') {
    const dur = 10;
    const ctx = new OfflineAudioContext(2, dur * SR, SR);
    const mix = createMixer(ctx, ctx.destination, DEFAULT_VOL);
    new Sequencer(ctx, mix.music, getSong('matsuri'), { loop: true }).start(0, 0);
    new Ambience(ctx, mix.amb, 'matsuri', { seed: 2 }).start(0.2);
    const e = new Engine(ctx, mix.sfx.dry); e.start(0);
    const d = new Drift(ctx, mix.sfx.dry);
    for (let t = 0; t < dur; t += 0.05) { e.update({ speed01: 1, throttle: 1, boost: t % 3 < 1 }, t); d.update(t % 4 < 3, 2, t); }
    createLoop('crossing_bell', ctx, mix.sfx, {}); createLoop('train_run', ctx, mix.sfx, {}); createLoop('star_music', ctx, mix.jingle, {});
    const names = SFX_NAMES;
    for (let i = 0; i < 60; i++) {
      const g = ctx.createGain(); g.gain.value = 0.5; g.connect(mix.sfx.dry);
      SFX[names[i % names.length]]({ ctx, out: g, t: (i / 60) * (dur - 2), p: 1, r: rng(i), srcs: [] });
    }
    const a = performance.now();
    await ctx.startRendering();
    const ms = performance.now() - a;
    out.cpu = { scene: 'matsuri music+amb+engine+drift+3 loops+60 sfx', renderMs: r3(ms), realtimeFactor: r3((dur * 1000) / ms), approxCorePct: r3((ms / (dur * 1000)) * 100) };
  }
  // summary: music loudness balance
  const mus = out.items.filter((i) => i.kind === 'music' && !i.name.includes('('));
  const mean = mus.reduce((a, i) => a + i.rmsDb, 0) / Math.max(1, mus.length);
  out.musicBalance = { meanRmsDb: r3(mean), spreadDb: mus.map((i) => [i.name, r3(i.rmsDb - mean)]), ok: mus.every((i) => Math.abs(i.rmsDb - mean) <= 3) };
  out.ok = out.items.every((i) => i.pass) && out.musicBalance.ok && (!out.api || out.api.errors.length === 0) && (!out.realtime || out.realtime.ok);
  out.failed = out.items.filter((i) => !i.pass).map((i) => i.kind + '/' + i.name);
  out.cacheAfter = cacheStats();
  out.seconds = r3((performance.now() - t0) / 1000);
  out.done = true;
  showResults(out);
  console.log('[selftest]', JSON.stringify(out));
  $('testStatus').textContent = (out.ok ? 'PASS' : 'FAIL') + ` in ${out.seconds}s`;
  return out;
}

function showResults(o) {
  const rows = o.items.map((i) => `<tr><td class="${i.pass ? 'ok' : 'bad'}">${i.kind}/${i.name}</td><td>${i.peak}</td><td>${i.rmsDb}</td><td>${i.loudDb}</td><td>${i.hfDb}</td><td>${i.dc}</td><td>${i.nan}</td></tr>`).join('');
  $('results').innerHTML = `<table><tr><th>item</th><th>peak</th><th>RMS dB</th><th>loud(100ms) dB</th><th>HF>6k dB</th><th>DC</th><th>NaN</th></tr>${rows}</table>
    <pre>${JSON.stringify({ ok: o.ok, failed: o.failed, musicBalance: o.musicBalance, api: o.api, warnings: o.warnings, seconds: o.seconds }, null, 1)}</pre>`;
}

async function stems(id, secs = 20) {
  const base = getSong(id);
  // ignore pass / final-lap conditions so every channel is heard
  const song = { ...base, channels: base.channels.map((c) => ({ ...c, when: undefined })) };
  prewarm(SR, song.notesUsed);
  const dur = Math.min(secs, song.introSec + song.loopSec);
  const res = { id, channels: {} };
  window.__stems = res;
  for (const ch of song.channels) {
    const r = await render(dur, (ctx, mix) => { const s = new Sequencer(ctx, mix.music, song, { loop: true, solo: ch.name }); s.pass = 1; s.start(0, 0); });
    res.channels[ch.name] = { rmsDb: r.rmsDb, loudDb: r.loudDb, peak: r.peak, hfDb: r.hfDb };
  }
  res.done = true;
  console.log('[stems]', JSON.stringify(res));
  $('results').innerHTML = `<pre>${JSON.stringify(res, null, 1)}</pre>`;
  return res;
}

$('runTest').onclick = () => selftest('all');
const q = new URLSearchParams(location.search);
if (q.get('selftest')) window.__selftestDone = selftest(q.get('selftest') === 'music' ? 'music' : 'all');
if (q.get('stems')) window.__selftestDone = stems(q.get('stems'), Number(q.get('sec') || 20));

// ------------------------------------------------------------------ spectrogram (visual check of a render)
//   ?spectro=<musicId|jingleId|sfx:name|amb:id>&sec=20
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
async function spectro(what, secs) {
  let buf;
  const ctxDur = secs;
  const ctx = new OfflineAudioContext(2, Math.ceil(ctxDur * SR), SR);
  const mix = createMixer(ctx, ctx.destination, DEFAULT_VOL);
  if (what.startsWith('sfx:')) {
    const name = what.slice(4), meta = SFX_META[name] || {};
    const g = ctx.createGain(); g.gain.value = meta.g ?? 0.7; g.connect(mix.sfx.dry);
    SFX[name]({ ctx, out: g, t: 0.05, p: 1, r: rng(5), srcs: [] });
  } else if (what.startsWith('amb:')) {
    new Ambience(ctx, mix.amb, what.slice(4), { seed: 3 }).start(0.3);
  } else if (what.startsWith('loop:')) {
    createLoop(what.slice(5), ctx, what === 'loop:star_music' ? mix.jingle : mix.sfx, {});
  } else {
    const song = getSong(what);
    new Sequencer(ctx, JINGLE_IDS.includes(what) ? mix.jingle : mix.music, song, { loop: !JINGLE_IDS.includes(what) }).start(0, 0);
  }
  buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const W = 1200, H = 520, WAVE = 120, N = 4096, hop = Math.max(256, Math.floor(L.length / W));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H + WAVE;
  const g2 = cv.getContext('2d');
  g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H + WAVE);
  const img = g2.createImageData(W, H);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const fLo = 40, fHi = 18000;
  for (let x = 0; x < W; x++) {
    const s0 = Math.floor((x / W) * (L.length - N));
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let i = 0; i < N; i++) re[i] = ((L[s0 + i] || 0) + (R[s0 + i] || 0)) * 0.5 * win[i];
    fft(re, im);
    for (let y = 0; y < H; y++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - y / H);
      const k = Math.min(N / 2 - 1, Math.round((f / SR) * N));
      const mag = Math.hypot(re[k], im[k]) / (N / 4);
      const d = Math.max(0, Math.min(1, (20 * Math.log10(mag + 1e-9) + 90) / 80));
      const o = (y * W + x) * 4;
      img.data[o] = 255 * Math.min(1, d * 1.6); img.data[o + 1] = 255 * Math.max(0, d * 1.6 - 0.6); img.data[o + 2] = 255 * Math.max(0, 1 - Math.abs(d - 0.35) * 3) * 0.8; img.data[o + 3] = 255;
    }
  }
  g2.putImageData(img, 0, 0);
  g2.fillStyle = '#9cf';
  for (let x = 0; x < W; x++) {
    let p = 0;
    const s0 = Math.floor((x / W) * L.length), s1 = Math.floor(((x + 1) / W) * L.length);
    for (let i = s0; i < s1; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
    g2.fillRect(x, H + WAVE / 2 - p * WAVE / 2, 1, Math.max(1, p * WAVE));
  }
  g2.fillStyle = '#fff'; g2.font = '14px sans-serif';
  for (const f of [100, 300, 1000, 3000, 10000]) { const y = H * (1 - Math.log(f / fLo) / Math.log(fHi / fLo)); g2.fillRect(0, y, 8, 1); g2.fillText(f >= 1000 ? f / 1000 + 'k' : f, 10, y + 4); }
  g2.fillText(`${what}  ${secs}s`, W - 220, 16);
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.appendChild(cv);
  window.__spectroDone = true;
}
if (q.get('spectro')) window.__selftestDone = spectro(q.get('spectro'), Number(q.get('sec') || 20));
