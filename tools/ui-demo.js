// UI demo / verification page for src/ui/UI.js.
//   /tools/ui-demo.html?screen=title|chars|course|loading|hud|roulette|countdown|banner|toast|wrong|results|pause|fade|icons
// options:
//   t=<ms>        freeze all running animations at this time (after the screen is shown)
//   n=3|2|1|0     countdown number (countdown screen)
//   style=info|lap|final|finish   text=<banner text>   (banner screen)
//   pos=1..8      player position (hud) / player rank (results)
//   assets=1      feed canvas-generated portraits through setAssets (tests the image path)
//   debug=1       outline the preview rect reported by ui.getPreviewRect()
//   nofonts=1     skip the Google Fonts link (check the system-font fallbacks)
//   screen=flow&auto=1   full title → chars → course → loading → race flow driven by fake key presses
//   keys are live: arrows/WASD, Enter/Space, Esc — sounds are logged to window.__sounds
import { UI } from '../src/ui/UI.js';
import { ITEM_KEYS, itemIconUri, courseEmblem, dataUri } from '../src/ui/art.js';
import { CHARACTERS } from '../src/kart/characters.js';

const q = new URLSearchParams(location.search);
const screen = q.get('screen') || 'title';
const bg = document.getElementById('bg');

const COURSES = [
  { id: 'inaka', name: '夕焼けたんぼ道', subtitle: '夕日にそまる田園ラリー', description: '黄金色にかがやく田んぼの中を走りぬけよう。踏切と赤とんぼに気をつけて！', colors: ['#ffb347', '#e0582c'], laps: 3 },
  { id: 'sakura', name: '桜咲く千本鳥居', subtitle: '春の山寺・花吹雪コース', description: '満開の桜と千本鳥居のトンネル。五重塔をめざして山道をかけあがれ！', colors: ['#ffc4d3', '#d9738e'], laps: 3 },
  { id: 'matsuri', name: '夏祭り花火ナイト', subtitle: '提灯ゆれる夜店ストリート', description: '夜空に花火が咲く夏祭り。屋台のあいだをすりぬけて、やぐらのまわりを駆けめぐれ！', colors: ['#3b2a6b', '#e8431f'], laps: 3 },
];

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const CHAR_COLORS = Object.fromEntries(CHARACTERS.map((c) => [c.id, hex(c.colors.body === 0x2a2831 ? c.colors.accent : c.colors.body)]));

// ---- fake 3D backdrops -----------------------------------------------------------------------
function scene(kind) {
  const add = (cls, style = '') => { const d = document.createElement('div'); d.className = cls; d.style.cssText = style; bg.appendChild(d); return d; };
  bg.textContent = '';
  if (kind === 'day') {
    add('sky-day');
    add('sun', 'left:62%;top:14%');
    add('mount');
    add('hill');
    add('hill2');
    for (const [x, y, s] of [[8, 46, 22], [18, 52, 16], [80, 44, 26], [90, 54, 18], [70, 58, 12]]) {
      add('trunk', `left:${x + s / 2 - 0.7}vw;top:${y + s * 0.6}vh;height:${s * 0.8}vh`);
      add('blossom', `left:${x}vw;top:${y}vh;width:${s}vw;height:${s * 0.9}vw`);
    }
  } else if (kind === 'studio') {
    add('sky-studio');
    for (let i = 0; i < 14; i++) {
      const s = 3 + ((i * 37) % 7);
      add('bokeh', `left:${(i * 53) % 100}vw;top:${(i * 29) % 90}vh;width:${s}vmin;height:${s}vmin`);
    }
  } else if (kind === 'sunset') {
    add('sky-sunset');
    add('sun', 'left:58%;top:30%;width:34vmin;height:34vmin');
    add('mount', 'background:#5a3d62;bottom:32%;opacity:.9');
    add('paddy');
  } else if (kind === 'night') {
    add('sky-night');
    for (let i = 0; i < 16; i++) add('lantern', `left:${4 + i * 6.2}vw;top:${40 + Math.sin(i) * 3}vh`);
    add('grass', 'background:linear-gradient(180deg,#2a2c44,#161826);height:44%');
  } else {
    add('sky-day');
    add('mount', 'bottom:40%');
    add('grass');
    add('road');
    add('line');
    for (const [x, y, s] of [[4, 34, 14], [84, 32, 18], [18, 38, 8], [72, 38, 9]]) add('blossom', `left:${x}vw;top:${y}vh;width:${s}vw;height:${s * 0.8}vw;background:radial-gradient(circle at 40% 35%,#cfe9a0,#7fb45a 55%,#4d8a3a)`);
    add('kart', 'left:50%;top:76%;width:18vmin;height:10vmin');
  }
}

function fakeKart(rect) {
  if (!rect) return;
  const floor = document.createElement('div');
  floor.className = 'floor';
  floor.style.cssText = `left:${rect.cx}px;top:${rect.cy + rect.height * 0.2}px;width:${rect.width * 1.1}px;height:${rect.width * 0.4}px`;
  const ring = document.createElement('div');
  ring.className = 'ring';
  ring.style.cssText = `position:absolute;left:${rect.cx}px;top:${rect.cy + rect.height * 0.2}px;width:${rect.width * 0.8}px;height:${rect.width * 0.8}px`;
  const kart = document.createElement('div');
  kart.className = 'kart';
  kart.style.cssText = `left:${rect.cx}px;top:${rect.cy + rect.height * 0.12}px;width:${rect.width * 0.46}px;height:${rect.width * 0.24}px`;
  kart.appendChild(Object.assign(document.createElement('div'), { className: 'head' }));
  bg.append(floor, ring, kart);
}

function debugRect(rect) {
  if (!rect || q.get('debug') !== '1') return;
  const d = document.createElement('div');
  d.id = 'dbg';
  Object.assign(d.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  document.body.appendChild(d);
}

function fakePortraits() {
  const out = {};
  for (const c of CHARACTERS) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(110, 90, 10, 128, 128, 140);
    grd.addColorStop(0, '#fff');
    grd.addColorStop(1, CHAR_COLORS[c.id]);
    g.fillStyle = grd;
    g.beginPath(); g.arc(128, 150, 96, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d1a19';
    g.font = "bold 110px 'Hiragino Mincho ProN', serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(c.kanji, 128, 156);
    out[c.id] = cv.toDataURL();
  }
  return out;
}

function loopPath() {
  // Catmull-Rom through a few control points → a plausible kart circuit
  const cp = [[-170, -40], [-120, -120], [-10, -130], [60, -80], [150, -110], [210, -30], [170, 60], [60, 70], [20, 130], [-90, 130], [-160, 70]];
  const pts = [];
  const n = cp.length;
  for (let i = 0; i < n; i++) {
    const p0 = cp[(i - 1 + n) % n], p1 = cp[i], p2 = cp[(i + 1) % n], p3 = cp[(i + 2) % n];
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return pts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fontsReady() {
  const link = document.querySelector('link[data-pk-fonts]');
  if (link && !link.sheet) {
    await new Promise((r) => { link.addEventListener('load', r, { once: true }); link.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
  }
  await Promise.race([
    Promise.all([
      document.fonts.load('900 60px "Dela Gothic One"', 'ぽんカート0123456789GO!位LAPゴールファイナルラップ逆走中'),
      document.fonts.load('800 20px "M PLUS Rounded 1c"', 'えらぶナイス'),
      document.fonts.load('500 20px "M PLUS Rounded 1c"', 'えらぶ'),
      document.fonts.load('400 40px "Yuji Syuku"', '狸狐猫犬兎河天鬼'),
    ]).catch(() => null),
    sleep(4000),
  ]);
}
/** Freeze everything (CSS + WAAPI animations and the UI's removal timers) `ms` after now. */
async function freezeAfter(ms) {
  await sleep(ms);
  hudAnim = false;
  for (const a of document.getAnimations()) a.pause();
  for (const id of ui._timers) clearTimeout(id);
  ui._timers.clear();
  if (ui._roulette) clearTimeout(ui._roulette.timer);
  // headless capture can reuse a stale compositor frame: force a few main-thread commits
  for (let i = 0; i < 4; i++) {
    document.documentElement.style.setProperty('--demo-frame', String(i));
    void document.body.offsetHeight;
    await new Promise((r) => requestAnimationFrame(r));
  }
}

// ---- UI --------------------------------------------------------------------------------------
if (q.get('nofonts') === '1') {
  // simulate offline Google Fonts: a placeholder link makes the UI skip its font injection
  const l = document.createElement('link');
  l.dataset.pkFonts = 'blocked';
  document.head.appendChild(l);
}
const ui = new UI(document.body);
window.ui = ui;
window.__sounds = [];
ui.onSound = (n) => window.__sounds.push(n);
const log = (...a) => console.log('[demo]', ...a);
if (q.get('assets') === '1') ui.setAssets({ portraits: fakePortraits() });

const pos = Math.max(1, Math.min(8, parseInt(q.get('pos') || '1', 10)));
const path = loopPath();
let hudAnim = false;

function startHUD(extra = {}) {
  ui.showHUD();
  ui.setMinimap(path);
  const state = { position: pos, total: 8, lap: 2, laps: 3, time: 83.456, coins: 7, speedKmh: 128, item: 'dango3', itemCount: 0, ...extra };
  ui.updateHUD(state);
  const ids = CHARACTERS.map((c) => c.id);
  const dotsAt = (t) => ids.map((id, k) => {
    const f = (((0.9 - k * 0.035 + t * (0.05 + k * 0.002)) % 1) + 1) % 1;
    const p = path[Math.floor(f * path.length) % path.length];
    return { x: p[0], z: p[1], color: CHAR_COLORS[id], isPlayer: k === pos - 1 };
  });
  ui.updateMinimap(dotsAt(0));
  if (!q.has('t')) {
    hudAnim = true;
    const t0 = performance.now();
    const loop = (now) => {
      if (!hudAnim) return;
      const t = (now - t0) / 1000;
      ui.updateHUD({ ...state, time: state.time + t, speedKmh: 120 + 12 * Math.sin(t * 2) });
      ui.updateMinimap(dotsAt(t));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return state;
}

async function setup() {
  switch (screen) {
    case 'title':
      scene('day');
      ui.showTitle({ onStart: () => log('onStart') });
      break;
    case 'chars': {
      scene('studio');
      ui.showCharacterSelect({
        characters: CHARACTERS,
        selectedId: q.get('id') || 'tanuki',
        onHover: (id) => log('hover', id),
        onConfirm: (id) => log('confirm', id),
        onBack: () => log('back'),
      });
      await new Promise((r) => requestAnimationFrame(r));
      const rect = ui.getPreviewRect();
      fakeKart(rect);
      debugRect(rect);
      break;
    }
    case 'course': {
      scene('sunset');
      ui.showCourseSelect({
        courses: COURSES,
        selectedId: q.get('id') || 'inaka',
        difficulty: q.get('diff') || '100cc',
        onHover: (id) => log('hover', id),
        onConfirm: (r) => log('confirm', JSON.stringify(r)),
        onBack: () => log('back'),
      });
      await new Promise((r) => requestAnimationFrame(r));
      debugRect(ui.getPreviewRect());
      break;
    }
    case 'loading':
      scene('night');
      ui.showLoading(q.get('text') || 'コースを準備中…', { title: q.get('title') || undefined });
      break;
    case 'hud': {
      scene('road');
      const st = startHUD();
      if (q.get('wrong') === '1') ui.showWrongWay(true);
      if (q.get('change') === '1') {
        // exercise the change animations: position up, coin +1, lap +1, item used
        await fontsReady();
        await sleep(300);
        Object.assign(st, { position: Math.max(1, pos - 1), coins: st.coins + 1, lap: 3, item: 'dango2' });
        ui.updateHUD(st);
      }
      break;
    }
    case 'roulette':
      scene('road');
    {
      const st = startHUD({ item: null });
      await fontsReady();
      const fin = q.get('item') || 'manekineko';
      st.item = fin; // the game stores the item right away; the slot shows it when the roulette lands
      ui.rouletteItem(fin, parseInt(q.get('dur') || '1800', 10)).then((k) => log('roulette landed', k));
      break;
    }
    case 'countdown':
      scene('road');
      startHUD({ item: null, time: 0, speedKmh: 0, lap: 1 });
      await fontsReady();
      if (q.get('seq') === '1') {
        for (const n of [3, 2, 1, 0]) { ui.countdown(n); if (n) await sleep(1000); }
      } else ui.countdown(parseInt(q.get('n') ?? '3', 10));
      break;
    case 'banner': {
      scene('road');
      startHUD();
      await fontsReady();
      const style = q.get('style') || 'final';
      const text = q.get('text') || { info: 'ベストラップ！', lap: 'ラップ 2/3', final: 'ファイナルラップ！', finish: 'ゴール！' }[style];
      ui.banner(text, { style, durationMs: parseInt(q.get('dur') || '3000', 10) });
      break;
    }
    case 'toast':
      scene('road');
      startHUD();
      await fontsReady();
      ui.toast('ミニターボ！', { style: 'blue' });
      setTimeout(() => ui.toast('ナイス！'), 250);
      setTimeout(() => ui.toast('スーパーミニターボ！', { style: 'orange' }), 500);
      setTimeout(() => ui.toast('ウルトラミニターボ！', { style: 'purple' }), 750);
      break;
    case 'wrong':
      scene('road');
      startHUD();
      ui.showWrongWay(true);
      break;
    case 'pause':
      scene('road');
      startHUD();
      hudAnim = false;
      ui.showPause({ onResume: () => log('resume'), onRestart: () => log('restart'), onQuit: () => log('quit') });
      break;
    case 'results': {
      scene('road');
      const names = CHARACTERS.map((c) => c.id);
      const order = names.slice();
      // put the player (tanuki) at the requested rank
      order.splice(order.indexOf('tanuki'), 1);
      order.splice(pos - 1, 0, 'tanuki');
      const rows = order.map((id, i) => {
        const c = CHARACTERS.find((x) => x.id === id);
        return { rank: i + 1, name: c.name, characterId: id, time: i === 7 ? null : 118.37 + i * 1.93 + (i * i) * 0.11, isPlayer: id === 'tanuki', color: CHAR_COLORS[id] };
      });
      ui.showResults({ rows, courseName: '夕焼けたんぼ道', onRetry: () => log('retry'), onCourseSelect: () => log('course'), onTitle: () => log('title') });
      break;
    }
    case 'fade':
      scene('day');
      ui.showTitle({ onStart: () => {} });
      await ui.fade(true, 400);
      log('fade closed');
      if (q.get('open') === '1') { await ui.fade(false, 400); log('fade opened'); }
      break;
    case 'flow': {
      // full menu → race flow; with auto=1 it drives itself with synthetic key presses
      const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true }));
      const toRace = async ({ courseId, difficulty }) => {
        log('race', courseId, difficulty);
        await ui.fade(true, 350);
        ui.hideMenus();
        ui.showLoading('コースを準備中…', { title: COURSES.find((c) => c.id === courseId).name });
        await sleep(900);
        scene('road');
        startHUD({ item: null, time: 0, speedKmh: 0, lap: 1 });
        ui.hideLoading();
        await ui.fade(false, 400);
        for (const n of [3, 2, 1, 0]) { ui.countdown(n); await sleep(1000); }
        ui.banner('ファイナルラップ！', { style: 'final', durationMs: 2200 });
      };
      const toCourse = async () => {
        await ui.fade(true, 350);
        scene('sunset');
        ui.showCourseSelect({ courses: COURSES, selectedId: 'sakura', difficulty: '150cc', onHover: (id) => log('hover', id), onConfirm: toRace, onBack: toChars });
        await ui.fade(false, 400);
        if (auto) { await sleep(700); key('ArrowDown'); await sleep(300); key('Enter'); }
      };
      const toChars = async () => {
        await ui.fade(true, 350);
        scene('studio');
        ui.showCharacterSelect({ characters: CHARACTERS, selectedId: 'tanuki', onHover: (id) => log('hover', id), onConfirm: toCourse, onBack: toTitle });
        await ui.fade(false, 400);
        if (auto) { await sleep(700); key('ArrowRight'); await sleep(300); key('Enter'); }
      };
      const toTitle = async () => {
        scene('day');
        ui.hideHUD();
        ui.showTitle({ onStart: toChars });
        if (auto) { await sleep(1500); key('Enter'); }
      };
      const auto = q.get('auto') === '1';
      await toTitle();
      break;
    }
    case 'icons': {
      scene('studio');
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;display:flex;flex-wrap:wrap;gap:24px;padding:40px;align-content:flex-start;z-index:50';
      const add = (src, label) => {
        const box = document.createElement('div');
        box.style.cssText = 'width:150px;height:170px;background:#f7f1e3;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;font:12px sans-serif;color:#1d1a19';
        const img = new Image();
        img.src = src;
        img.style.cssText = 'width:120px;height:120px';
        box.append(img, label);
        wrap.appendChild(box);
      };
      for (const k of ITEM_KEYS) add(itemIconUri(k), k);
      for (const c of COURSES) add(dataUri(courseEmblem(c.id, c.colors)), c.id);
      document.body.appendChild(wrap);
      break;
    }
    default:
      log('unknown screen', screen);
  }

  if (q.has('t')) await freezeAfter(parseFloat(q.get('t')));
}

setup().catch((e) => console.error(e));
window.__fontsReady = document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
