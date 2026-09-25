// ぽんぽこカート — DOM/CSS game UI overlay (menus, race HUD, banners, transitions).
//
// The overlay sits above the full-screen WebGL canvas. Menus leave see-through areas for the
// 3D scene (use getPreviewRect() to find the reserved area of the current screen).
// Everything scales with --u (= 1 design pixel of a 1280×720 layout).
//
//   const ui = new UI(document.body);
//   ui.onSound = (name) => audio.play(name);  // 'menu_move','menu_ok','menu_back','roulette','item_get'
//   ui.showTitle({ onStart });  ui.showCharacterSelect({...});  ui.showCourseSelect({...});
//   ui.showHUD(); ui.updateHUD({...}) every frame; ui.updateMinimap(dots) every frame.
//
// While a menu is visible the UI owns the keyboard: arrows/WASD, Enter/Space (ok),
// Escape/Backspace (back) are consumed in the capture phase (preventDefault + stopPropagation),
// so the game never sees them. Gamepads: call ui.nav('up'|'down'|'left'|'right'|'ok'|'back').
// After ok/back a screen stays locked (ignores input) until the next show*() call; nav is also
// ignored while the loading overlay is up or fade(true) covers the screen.
//
// Beyond the base API:
//   showTitle({ onStart, controls })      controls: [[keys, label], ...] (default DEFAULT_CONTROLS)
//   showLoading(text, { title, tip })     title = big heading (course name), tip = hint line
//   rouletteItem() / banner() return Promises; fade(on, ms, { style: 'doors' | 'black' })
//   toast(text, { style: 'blue'|'orange'|'purple'|'gold'|'red' })
//   getPreviewRect() → {x,y,width,height,cx,cy} of the open 3D area on chars/course screens
//   speedGaugeMax (km/h for a full speed bar, default 160)
import './ui.css';
import * as ART from './art.js';
import { Minimap } from './minimap.js';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@500;800&family=Yuji+Syuku&display=swap';

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back',
};

const STATS = [['speed', 'スピード'], ['accel', 'かそく'], ['handling', 'ハンドリング'], ['weight', 'おもさ']];
const DIFFS = [
  { id: '50cc', label: 'ゆったり', lv: 1 },
  { id: '100cc', label: 'ふつう', lv: 2 },
  { id: '150cc', label: 'はやい', lv: 3 },
];
const DEFAULT_KANJI = { tanuki: '狸', kitsune: '狐', neko: '猫', shiba: '犬', usagi: '兎', kappa: '河', tengu: '天', oni: '鬼' };
const COURSE_NUM = ['壱', '弐', '参', '肆', '伍', '陸'];
const ROULETTE_KEYS = ['dango3', 'daruma', 'shuriken', 'makibishi', 'manekineko', 'kanedarai', 'koban'];
export const DEFAULT_CONTROLS = [
  ['↑ / W', 'アクセル'],
  ['↓ / S', 'ブレーキ'],
  ['← → / A D', 'ハンドル'],
  ['Space / Shift', 'ジャンプ・ドリフト'],
  ['E / X', 'アイテム'],
  ['Esc', 'ポーズ'],
];
const TIPS = [
  'ドリフトを長くつづけると、火花の色が 青 → オレンジ → むらさき に変わるよ！',
  'ジャンプ台で飛んだ瞬間にジャンプボタンを押すと、トリックが決まって加速！',
  '小判を集めると最高速が少しアップ。最大10枚まで持てるよ。',
  '和傘グライダーで空をすべろう。ゆっくり降りればショートカットも…？',
  'ダッシュ板を踏むと一気に加速！コースの矢印をよく見よう。',
  '金だらいは上から降ってくる！ 音がしたら気をつけて。',
  'だるまはライバルを追いかけて転がっていくよ。',
  'アイテムを持ったまま ↓ を押しながら使うと、うしろに投げられる。',
];

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

/** 83.456 → 1'23"45 (minutes'seconds"hundredths). null/NaN → '--'. */
export function formatTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return '--';
  const cs = Math.floor(Math.max(0, sec) * 100 + 1e-7);
  const m = Math.floor(cs / 6000);
  const s = Math.floor(cs / 100) % 60;
  const hh = cs % 100;
  return `${m}'${String(s).padStart(2, '0')}"${String(hh).padStart(2, '0')}`;
}

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
/** Outlined game text: <span class="pk-ot" data-text="…"><span>…</span></span> */
function ot(text, cls = '') {
  const e = h('span', `pk-ot ${cls}`);
  e.dataset.text = text;
  e.appendChild(h('span', null, text));
  return e;
}
function setOt(e, text) {
  text = String(text);
  if (e.dataset.text === text) return;
  e.dataset.text = text;
  e.firstChild.textContent = text;
}
function cssColor(c) {
  if (c == null || c === '') return null;
  if (typeof c === 'number') return `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  if (typeof c === 'object' && typeof c.getHexString === 'function') return `#${c.getHexString()}`;
  return String(c);
}
function luminance(css) {
  const m = /^#([0-9a-f]{6})$/i.exec(css || '');
  if (!m) return 0.5;
  const v = parseInt(m[1], 16);
  const ch = (x) => { x /= 255; return x <= 0.04 ? x / 12.9 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch((v >> 16) & 255) + 0.7152 * ch((v >> 8) & 255) + 0.0722 * ch(v & 255);
}
function charColor(c) {
  const direct = cssColor(c && c.color);
  if (direct) return direct;
  const cols = (c && c.colors) || {};
  const cands = [cols.body, cols.accent, cols.fur].map(cssColor).filter(Boolean);
  for (const x of cands) if (luminance(x) > 0.06) return x;
  return cands[0] || '#d8401f';
}
function charType(c) {
  if (c.type) return c.type;
  const s = c.stats || {};
  const v = { speed: s.speed || 0, accel: s.accel || 0, handling: s.handling || 0, weight: s.weight || 0 };
  const vals = Object.values(v);
  const max = Math.max(...vals), min = Math.min(...vals);
  if (max - min <= 1) return 'バランス型';
  if (v.handling === max) return 'テクニック型';
  if (v.speed === max) return 'スピード型';
  if (v.accel === max) return 'ダッシュ型';
  return 'パワー型';
}
const uPx = () => Math.min(window.innerWidth / 1280, window.innerHeight / 720);

let fontsInjected = false;
function injectFonts() {
  if (fontsInjected) return;
  fontsInjected = true;
  if (document.querySelector('link[data-pk-fonts]')) return;
  const a = document.createElement('link');
  a.rel = 'preconnect'; a.href = 'https://fonts.googleapis.com';
  const b = document.createElement('link');
  b.rel = 'preconnect'; b.href = 'https://fonts.gstatic.com'; b.crossOrigin = 'anonymous';
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = FONT_HREF; l.dataset.pkFonts = '1';
  document.head.append(a, b, l);
}

let artVars = null;
function getArtVars() {
  if (artVars) return artVars;
  artVars = {
    '--pat-seigaiha-ai': ART.cssUrl(ART.seigaiha({ r: 24, bg: '#1f3363', fg: '#2d4883', sw: 1.7 })),
    '--pat-seigaiha-sumi': ART.cssUrl(ART.seigaiha({ r: 24, bg: '#1d1a19', fg: '#2d2826', sw: 1.7 })),
    '--pat-seigaiha-shu': ART.cssUrl(ART.seigaiha({ r: 24, bg: '#c93a1b', fg: '#df5530', sw: 1.7 })),
    '--pat-seigaiha-washi': ART.cssUrl(ART.seigaiha({ r: 24, bg: '#f5eedd', fg: '#e9dec4', sw: 1.7 })),
    '--pat-asanoha-gold': ART.cssUrl(ART.asanoha({ s: 36, stroke: 'rgba(224,176,74,0.62)', sw: 1.3 })),
    '--pat-asanoha-white': ART.cssUrl(ART.asanoha({ s: 36, stroke: 'rgba(255,255,255,0.32)', sw: 1.4 })),
    '--pat-asanoha-ink': ART.cssUrl(ART.asanoha({ s: 36, stroke: 'rgba(29,26,25,0.085)', sw: 1.3 })),
    '--pat-yagasuri': ART.cssUrl(ART.yagasuri({ a: '#243a6b', b: '#f3ead6' })),
    '--pat-paper': ART.cssUrl(ART.paperNoise()),
    '--img-brush-shu': ART.cssUrl(ART.brushBand({ color: '#d8401f' })),
    '--img-brush-sumi': ART.cssUrl(ART.brushBand({ color: '#1d1a19', seed: 9 })),
    '--img-brush-ai': ART.cssUrl(ART.brushBand({ color: '#243a6b', seed: 5 })),
    '--img-leaf': ART.cssUrl(ART.leaf()),
    '--img-crest': ART.cssUrl(ART.crest()),
    '--img-tomoe': ART.cssUrl(ART.tomoe()),
    '--img-uturn': ART.cssUrl(ART.uturn()),
    '--img-petal': ART.cssUrl(ART.petal()),
    '--img-watch': ART.cssUrl(ART.stopwatch()),
  };
  return artVars;
}

const DIGIT_CELL = /[0-9\u2007]/; // digits and figure spaces get full-width cells

/** Fixed-width character cells (no jitter for proportional digits); only changed cells are touched. */
class Digits {
  constructor(el) { this.el = el; this.cells = []; this.str = null; }
  set(str) {
    if (str === this.str) return;
    if (this.str == null || str.length !== this.str.length) {
      this.el.textContent = '';
      this.cells = [...str].map((ch) => {
        const c = h('span', DIGIT_CELL.test(ch) ? 'pk-dg' : 'pk-dg pk-dg--sep', ch);
        this.el.appendChild(c);
        return c;
      });
    } else {
      for (let i = 0; i < str.length; i++) {
        if (str[i] !== this.str[i]) {
          this.cells[i].textContent = str[i];
          this.cells[i].className = DIGIT_CELL.test(str[i]) ? 'pk-dg' : 'pk-dg pk-dg--sep';
        }
      }
    }
    this.str = str;
  }
}

// ---------------------------------------------------------------------------------------------

export class UI {
  constructor(root = document.body) {
    this.onSound = null;
    /** km/h at which the little speed bar under the readout is full. */
    this.speedGaugeMax = 160;
    this._assets = { itemIcons: {}, portraits: {} };
    this._charInfo = new Map();
    this._timers = new Set();
    this._screen = null;
    this._screenAt = 0;
    this._locked = false;
    this._mouseArmed = false;
    this._loadingOn = false;

    injectFonts();
    const el = (this.el = h('div', 'pk-ui'));
    el.lang = 'ja';
    if (root !== document.body && root !== document.documentElement) el.classList.add('pk-ui--contained');
    for (const [k, v] of Object.entries(getArtVars())) el.style.setProperty(k, v);

    this._buildHUD();
    this._fx = h('div', 'pk-layer pk-fx');
    this._menu = h('div', 'pk-layer pk-menu');
    el.append(this._hud.root, this._fx, this._menu);
    this._buildWrongWay();
    this._buildFade();
    this._buildLoading();
    root.appendChild(el);

    this._onKeyDown = (e) => this._handleKey(e);
    this._onPointerMove = (e) => { if (e.movementX || e.movementY) this._mouseArmed = true; };
    window.addEventListener('keydown', this._onKeyDown, true);
    window.addEventListener('pointermove', this._onPointerMove, true);
  }

  // ------------------------------------------------------------------------------ assets / sfx

  setAssets({ itemIcons, portraits } = {}) {
    if (itemIcons) this._assets.itemIcons = { ...this._assets.itemIcons, ...itemIcons };
    if (portraits) this._assets.portraits = { ...this._assets.portraits, ...portraits };
    this.el.querySelectorAll('[data-portrait]').forEach((w) => this._fillPortrait(w, w.dataset.portrait));
    this._hud.coinIcon.src = this._itemSrc('koban');
    if (this._hud.shownItem && !this._roulette) this._hud.img.src = this._itemSrc(this._hud.shownItem);
  }

  _itemSrc(key) {
    return (this._assets.itemIcons && this._assets.itemIcons[key]) || ART.itemIconUri(key) || ART.itemIconUri('koban');
  }

  _sfx(name) {
    if (typeof this.onSound !== 'function') return;
    try { this.onSound(name); } catch (e) { console.error(e); }
  }

  _later(fn, ms) {
    const id = setTimeout(() => { this._timers.delete(id); fn(); }, ms);
    this._timers.add(id);
    return id;
  }

  _rememberChars(chars) {
    for (const c of chars || []) {
      this._charInfo.set(c.id, {
        kanji: c.kanji || DEFAULT_KANJI[c.id] || (c.name || '？')[0],
        color: charColor(c),
        name: c.name,
      });
    }
  }

  _portrait(id, cls = '', fallbackColor = null) {
    const w = h('div', `pk-portrait ${cls}`);
    w.dataset.portrait = id;
    if (fallbackColor) w.dataset.color = fallbackColor;
    this._fillPortrait(w, id);
    return w;
  }

  _fillPortrait(w, id) {
    w.textContent = '';
    const url = this._assets.portraits && this._assets.portraits[id];
    const info = this._charInfo.get(id);
    const color = (info && info.color) || w.dataset.color || '#8f7760';
    w.style.setProperty('--pc', color);
    if (url) {
      w.classList.remove('is-ph');
      const img = new Image();
      img.alt = '';
      img.draggable = false;
      img.src = url;
      w.appendChild(img);
    } else {
      w.classList.add('is-ph');
      const ph = h('div', 'pk-portrait__ph');
      ph.appendChild(h('span', 'pk-portrait__k', (info && info.kanji) || DEFAULT_KANJI[id] || '？'));
      w.appendChild(ph);
    }
  }

  // ------------------------------------------------------------------------------ input

  _handleKey(e) {
    if (!this._screen) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.timeStamp && e.timeStamp < this._screenAt) return; // the event that opened this menu
    if (e.repeat && (a === 'ok' || a === 'back')) return;
    this.nav(a);
  }

  nav(action) {
    const s = this._screen;
    // ignored while locked (after ok/back until the next screen opens), behind the loading
    // overlay, and while the transition covers the screen
    if (!s || this._locked || this._loadingOn || this._fade.closed) return;
    if (s.nav) s.nav(action);
  }

  /** Bounding rect (CSS px) of the area the current menu leaves open for the 3D preview, or null. */
  getPreviewRect() {
    const s = this._screen;
    const slot = s && s.root.querySelector('.pk-preview-slot');
    if (!slot) return null;
    const r = slot.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  // ------------------------------------------------------------------------------ screen stack

  _open(name, root, api = {}) {
    this._closeScreen();
    root.classList.add(`pk-scr--${name}`);
    if (this._fade.closed || this._loadingOn) root.classList.add('is-held');
    this._menu.appendChild(root);
    this._screen = { name, root, ...api };
    this._screenAt = performance.now();
    this._locked = false;
    this._mouseArmed = false;
    return this._screen;
  }

  _closeScreen() {
    const s = this._screen;
    if (!s) return;
    this._screen = null;
    this._locked = false;
    try { if (s.destroy) s.destroy(); } catch (e) { console.error(e); }
    const r = s.root;
    r.style.pointerEvents = 'none';
    const a = r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = () => r.remove();
    this._later(() => r.remove(), 450);
  }

  _releaseHeld() {
    this._menu.querySelectorAll('.pk-scr.is-held').forEach((e) => e.classList.remove('is-held'));
  }

  hideMenus() { this._closeScreen(); }

  _pick(fn, delay = 240) {
    this._locked = true;
    this._sfx('menu_ok');
    this._later(() => { if (typeof fn === 'function') fn(); }, delay);
  }

  _goBack(fn) {
    if (typeof fn !== 'function') return;
    this._locked = true;
    this._sfx('menu_back');
    this._later(fn, 90);
  }

  // shared building blocks ----------------------------------------------------------------------

  _topbar(title, sub, step = null, chip = null) {
    const bar = h('div', 'pk-topbar');
    const head = h('div', 'pk-head');
    head.appendChild(h('div', 'pk-head__brush'));
    head.appendChild(h('div', 'pk-head__sub', sub));
    head.appendChild(ot(title, 'pk-d pk-head__title'));
    bar.appendChild(head);
    if (step != null) {
      const steps = h('div', 'pk-steps');
      ['キャラ', 'コース', 'レース'].forEach((label, i) => {
        if (i) steps.appendChild(h('i', 'pk-steps__line' + (i <= step ? ' is-done' : '')));
        const st = h('div', 'pk-step' + (i < step ? ' is-done' : i === step ? ' is-active' : ''));
        st.appendChild(h('span', 'pk-step__n', String(i + 1)));
        st.appendChild(h('span', 'pk-step__l', label));
        steps.appendChild(st);
      });
      bar.appendChild(steps);
    }
    if (chip) {
      const c = h('div', 'pk-topchip');
      c.appendChild(h('span', 'pk-topchip__label', 'コース'));
      c.appendChild(h('span', 'pk-topchip__text', chip));
      bar.appendChild(c);
    }
    return bar;
  }

  _footer(hints, { ok, back, backLabel = 'もどる' } = {}) {
    const f = h('div', 'pk-foot');
    const left = h('div', 'pk-foot__left');
    if (back) {
      const b = h('div', 'pk-backbtn');
      b.setAttribute('role', 'button');
      b.appendChild(h('span', 'pk-backbtn__arrow'));
      b.appendChild(h('span', null, backLabel));
      b.appendChild(h('span', 'pk-key pk-key--dark', 'Esc'));
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!this._locked) back(); });
      left.appendChild(b);
    }
    const right = h('div', 'pk-foot__right');
    for (const [keys, label, act] of hints) {
      const hint = h('div', 'pk-hint' + (act ? ' pk-hint--btn' : ''));
      for (const k of keys.split(' ')) hint.appendChild(h('span', 'pk-key', k));
      hint.appendChild(h('span', 'pk-hint__l', label));
      if (act === 'ok' && ok) hint.addEventListener('click', (e) => { e.stopPropagation(); if (!this._locked) ok(); });
      right.appendChild(hint);
    }
    f.append(left, right);
    return f;
  }

  _button(label, cls = '') {
    const b = h('div', `pk-btn ${cls}`);
    b.setAttribute('role', 'button');
    const inner = h('div', 'pk-btn__in');
    const shine = h('span', 'pk-btn__shine');
    inner.append(shine, h('span', 'pk-btn__label', label));
    b.appendChild(inner);
    return b;
  }

  /** Focus list for buttons (pause / results). */
  _menuList(buttons, { initial = 0, onPick, horizontal = false }) {
    const n = buttons.length;
    let idx = -1;
    const set = (i, silent) => {
      if (i === idx) return;
      if (idx >= 0) buttons[idx].classList.remove('is-focus');
      idx = i;
      buttons[idx].classList.add('is-focus');
      if (!silent) this._sfx('menu_move');
    };
    const pick = () => {
      const b = buttons[idx];
      b.classList.add('is-pressed');
      onPick(idx);
    };
    buttons.forEach((b, i) => {
      b.addEventListener('pointerenter', () => { if (this._mouseArmed && !this._locked) set(i); });
      b.addEventListener('click', (e) => { e.stopPropagation(); if (this._locked) return; set(i, true); pick(); });
    });
    set(initial, true);
    return (a) => {
      const prev = horizontal ? 'left' : 'up', next = horizontal ? 'right' : 'down';
      if (a === prev || a === (horizontal ? 'up' : 'left')) set((idx - 1 + n) % n);
      else if (a === next || a === (horizontal ? 'down' : 'right')) set((idx + 1) % n);
      else if (a === 'ok') pick();
    };
  }

  // ------------------------------------------------------------------------------ title

  showTitle({ onStart, controls = DEFAULT_CONTROLS } = {}) {
    const root = h('div', 'pk-scr pk-title');
    root.appendChild(h('div', 'pk-title__shade'));
    const petals = h('div', 'pk-petals');
    for (let i = 0; i < 16; i++) {
      const p = h('i', 'pk-petal');
      const r = (k) => ((Math.sin((i + 1) * 12.9898 * k) * 43758.5453) % 1 + 1) % 1;
      p.style.setProperty('--x', `${(r(1) * 100).toFixed(1)}vw`);
      p.style.setProperty('--dx', `${(r(2) * 30 - 10).toFixed(1)}vw`);
      p.style.setProperty('--d', `${(9 + r(3) * 8).toFixed(2)}s`);
      p.style.setProperty('--delay', `${(-r(4) * 16).toFixed(2)}s`);
      p.style.setProperty('--s', (0.55 + r(5) * 0.7).toFixed(2));
      p.style.setProperty('--sw', `${(2.2 + r(6) * 2).toFixed(2)}s`);
      p.appendChild(h('i', 'pk-petal__in'));
      petals.appendChild(p);
    }
    root.appendChild(petals);

    const main = h('div', 'pk-title__main');
    const logo = h('div', 'pk-logo');
    logo.appendChild(h('div', 'pk-logo__glow'));
    logo.appendChild(h('div', 'pk-logo__disc'));
    const rowA = h('div', 'pk-logo__row pk-logo__row--a');
    const rowB = h('div', 'pk-logo__row pk-logo__row--b');
    const addChars = (row, text, start) => {
      [...text].forEach((ch, k) => {
        const i = start + k;
        const c = h('span', 'pk-lc');
        c.style.setProperty('--i', i);
        const bob = h('span', 'pk-lc__bob');
        bob.appendChild(ot(ch, 'pk-d pk-lc__t'));
        c.appendChild(bob);
        row.appendChild(c);
      });
    };
    addChars(rowA, 'ぽんぽこ', 0);
    addChars(rowB, 'カート', 4);
    logo.append(rowA, rowB);
    logo.appendChild(h('div', 'pk-logo__leaf'));
    logo.appendChild(h('div', 'pk-logo__en', 'PONPOKO KART'));
    const ribbon = h('div', 'pk-logo__ribbon');
    ribbon.appendChild(h('span', 'pk-logo__ribbon-end pk-logo__ribbon-end--l'));
    ribbon.appendChild(h('span', 'pk-logo__ribbon-end pk-logo__ribbon-end--r'));
    const rb = h('span', 'pk-logo__ribbon-body');
    rb.appendChild(ot('ニッポン爆走グランプリ', 'pk-d pk-logo__ribbon-text'));
    ribbon.appendChild(rb);
    logo.appendChild(ribbon);
    main.appendChild(logo);

    const start = h('div', 'pk-title__start');
    start.appendChild(h('span', 'pk-title__tri'));
    start.appendChild(h('span', 'pk-title__start-t', 'Enter または クリックでスタート'));
    start.appendChild(h('span', 'pk-title__tri pk-title__tri--r'));
    main.appendChild(start);
    root.appendChild(main);

    const bottom = h('div', 'pk-title__bottom');
    const ctl = h('div', 'pk-controls');
    for (const [keys, label] of controls || []) {
      const row = h('div', 'pk-controls__row');
      row.appendChild(h('span', 'pk-controls__k', keys));
      row.appendChild(h('span', 'pk-controls__l', label));
      ctl.appendChild(row);
    }
    bottom.appendChild(ctl);
    bottom.appendChild(h('div', 'pk-credit', '© 2026 たぬ'));
    root.appendChild(bottom);

    const go = () => {
      if (this._locked) return;
      root.classList.add('is-starting');
      this._pick(onStart, 420);
    };
    root.addEventListener('click', go);
    this._open('title', root, { nav: (a) => { if (a === 'ok') go(); } });
  }

  // ------------------------------------------------------------------------------ character select

  showCharacterSelect({ characters = [], selectedId, onHover, onConfirm, onBack } = {}) {
    const chars = characters.slice();
    this._rememberChars(chars);
    const n = chars.length;
    if (!n) return;
    const cols = n <= 4 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);

    const root = h('div', 'pk-scr pk-chars');
    root.appendChild(h('div', 'pk-vignette'));
    root.appendChild(this._topbar('キャラクターをえらぶ', 'CHOOSE YOUR RACER', 0));

    const panel = h('div', 'pk-chars__panel');
    const grid = h('div', 'pk-chars__grid');
    grid.style.setProperty('--cols', cols);
    let idx = -1;
    const cards = chars.map((c, i) => {
      const card = h('div', 'pk-ccard');
      card.style.setProperty('--cc', charColor(c));
      card.style.setProperty('--i', i);
      const inner = h('div', 'pk-ccard__in');
      const art = h('div', 'pk-ccard__art');
      art.appendChild(this._portrait(c.id, 'pk-ccard__portrait'));
      inner.appendChild(art);
      inner.appendChild(h('div', 'pk-ccard__name', c.name));
      inner.appendChild(h('div', 'pk-ccard__tag', '1P'));
      inner.appendChild(h('div', 'pk-ccard__stamp', '決定'));
      card.appendChild(inner);
      card.addEventListener('pointerenter', () => { if (this._mouseArmed && !this._locked) setFocus(i); });
      card.addEventListener('click', (e) => { e.stopPropagation(); if (this._locked) return; setFocus(i, true); confirm(); });
      grid.appendChild(card);
      return card;
    });
    panel.appendChild(grid);
    root.appendChild(panel);
    root.appendChild(h('div', 'pk-preview-slot pk-preview-slot--chars'));

    // info panel
    const info = h('div', 'pk-cinfo');
    const band = h('div', 'pk-cinfo__band');
    const kanji = h('div', 'pk-cinfo__kanji');
    const body = h('div', 'pk-cinfo__body');
    const top = h('div', 'pk-cinfo__top');
    const type = h('span', 'pk-cinfo__type');
    const romaji = h('span', 'pk-cinfo__romaji');
    top.append(type, romaji);
    const name = ot('', 'pk-d pk-cinfo__name');
    const desc = h('div', 'pk-cinfo__desc');
    const stats = h('div', 'pk-stats');
    const bars = {};
    for (const [key, label] of STATS) {
      const row = h('div', 'pk-stat');
      row.appendChild(h('span', 'pk-stat__label', label));
      const bar = h('span', 'pk-stat__bar');
      bars[key] = [];
      for (let k = 0; k < 5; k++) { const seg = h('i'); bar.appendChild(seg); bars[key].push(seg); }
      row.appendChild(bar);
      stats.appendChild(row);
    }
    const cta = this._button('このキャラで けってい！', 'pk-btn--cta');
    cta.addEventListener('click', (e) => { e.stopPropagation(); if (!this._locked) confirm(); });
    body.append(top, name, desc, stats);
    info.append(band, kanji, body, cta);
    root.appendChild(info);

    const confirm = () => {
      if (this._locked) return;
      const card = cards[idx];
      card.classList.add('is-picked');
      cta.classList.add('is-pressed');
      this._pick(() => onConfirm && onConfirm(chars[idx].id), 480);
    };
    const back = () => this._goBack(onBack);
    root.appendChild(this._footer([['← ↑ ↓ →', 'えらぶ'], ['Enter', 'けってい', 'ok']], { ok: confirm, back: onBack ? back : null }));

    const fillInfo = (c, animate) => {
      info.style.setProperty('--cc', charColor(c));
      kanji.textContent = c.kanji || DEFAULT_KANJI[c.id] || '';
      type.textContent = charType(c);
      romaji.textContent = (c.romaji || c.id || '').toUpperCase();
      setOt(name, c.name || '');
      desc.textContent = c.description || '';
      for (const [key] of STATS) {
        const v = Math.max(0, Math.min(5, Math.round((c.stats && c.stats[key]) || 0)));
        bars[key].forEach((seg, k) => {
          const on = k < v;
          seg.classList.toggle('on', on);
          if (animate && on) {
            seg.animate(
              [{ transform: 'skewX(-18deg) scaleY(0.2)', opacity: 0.2 }, { transform: 'skewX(-18deg) scaleY(1.25)', opacity: 1, offset: 0.6 }, { transform: 'skewX(-18deg) scaleY(1)', opacity: 1 }],
              { duration: 260, delay: k * 45, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' });
          }
        });
      }
      if (animate) {
        body.animate([{ opacity: 0, transform: `translateX(${14 * uPx()}px)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
        kanji.animate([{ opacity: 0, transform: 'scale(1.25) rotate(6deg)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' });
      }
    };
    const setFocus = (i, silent = false) => {
      if (i === idx) return;
      if (idx >= 0) cards[idx].classList.remove('is-focus');
      const first = idx < 0;
      idx = i;
      cards[idx].classList.add('is-focus');
      fillInfo(chars[idx], !first);
      if (!first && !silent) this._sfx('menu_move');
      if (typeof onHover === 'function') onHover(chars[idx].id);
    };

    this._open('chars', root, {
      nav: (a) => {
        const row = Math.floor(idx / cols), col = idx % cols;
        const rowLen = row === rows - 1 ? n - row * cols : cols;
        if (a === 'left') setFocus(row * cols + ((col - 1 + rowLen) % rowLen));
        else if (a === 'right') setFocus(row * cols + ((col + 1) % rowLen));
        else if (a === 'up' || a === 'down') {
          if (rows < 2) return;
          const nr = (row + (a === 'up' ? -1 : 1) + rows) % rows;
          setFocus(Math.min(nr * cols + col, n - 1));
        } else if (a === 'ok') confirm();
        else if (a === 'back') back();
      },
    });
    const start = chars.findIndex((c) => c.id === selectedId);
    setFocus(start >= 0 ? start : 0);
  }

  // ------------------------------------------------------------------------------ course select

  showCourseSelect({ courses = [], selectedId, difficulty = '100cc', onHover, onConfirm, onBack } = {}) {
    const list = courses.slice();
    const n = list.length;
    if (!n) return;
    const root = h('div', 'pk-scr pk-courses');
    root.appendChild(h('div', 'pk-vignette pk-vignette--course'));
    root.appendChild(this._topbar('コースをえらぶ', 'SELECT COURSE', 1));

    const col = h('div', 'pk-courses__col');
    const listEl = h('div', 'pk-courses__list');
    let sel = Math.max(0, list.findIndex((c) => c.id === selectedId));
    let focus = sel;
    let diff = Math.max(0, DIFFS.findIndex((d) => d.id === difficulty));

    const cards = list.map((c, i) => {
      const card = h('div', 'pk-course');
      const [ca, cb] = (c.colors && c.colors.length ? c.colors : ['#e0b04a', '#d8401f']).map(cssColor);
      card.style.setProperty('--ca', ca);
      card.style.setProperty('--cb', cb || ca);
      card.style.setProperty('--i', i);
      const inner = h('div', 'pk-course__in');
      const num = h('div', 'pk-course__num', COURSE_NUM[i] || String(i + 1));
      const em = new Image();
      em.className = 'pk-course__emblem';
      em.alt = '';
      em.draggable = false;
      em.src = ART.dataUri(ART.courseEmblem(c.id, [ca, cb || ca]));
      const txt = h('div', 'pk-course__txt');
      txt.appendChild(h('div', 'pk-course__name pk-d', c.name || c.id));
      txt.appendChild(h('div', 'pk-course__sub', c.subtitle || ''));
      const laps = h('div', 'pk-course__laps');
      laps.appendChild(h('b', 'pk-d', String(c.laps || 3)));
      laps.appendChild(h('span', null, '周'));
      inner.append(num, em, txt, laps);
      card.appendChild(inner);
      card.addEventListener('pointerenter', () => { if (this._mouseArmed && !this._locked) setFocus(i); });
      card.addEventListener('click', (e) => { e.stopPropagation(); if (this._locked) return; setFocus(i, true); confirm(); });
      listEl.appendChild(card);
      return card;
    });
    col.appendChild(listEl);

    const diffEl = h('div', 'pk-diff');
    const dHead = h('div', 'pk-diff__head');
    dHead.appendChild(h('span', 'pk-diff__label', 'むずかしさ'));
    const dHint = h('span', 'pk-diff__hint');
    dHint.append(h('span', 'pk-key pk-key--s', '←'), h('span', 'pk-key pk-key--s', '→'), h('span', null, 'でかえる'));
    dHead.appendChild(dHint);
    const dRow = h('div', 'pk-diff__row');
    dRow.appendChild(h('span', 'pk-diff__arrow pk-diff__arrow--l'));
    const opts = DIFFS.map((d, i) => {
      const o = h('div', 'pk-diff__opt');
      o.style.setProperty('--lv', d.lv);
      o.appendChild(h('span', 'pk-diff__cc pk-d', d.id));
      o.appendChild(h('span', 'pk-diff__jp', d.label));
      const lv = h('span', 'pk-diff__lv');
      for (let k = 0; k < 3; k++) lv.appendChild(h('i', k < d.lv ? 'on' : ''));
      o.appendChild(lv);
      o.addEventListener('pointerenter', () => { if (this._mouseArmed && !this._locked) setFocus(n); });
      o.addEventListener('click', (e) => { e.stopPropagation(); if (this._locked) return; setFocus(n, true); setDiff(i); });
      dRow.appendChild(o);
      return o;
    });
    dRow.appendChild(h('span', 'pk-diff__arrow pk-diff__arrow--r'));
    diffEl.append(dHead, dRow);
    col.appendChild(diffEl);

    const go = this._button('しゅっぱつ！', 'pk-btn--cta pk-btn--go');
    go.addEventListener('click', (e) => { e.stopPropagation(); if (!this._locked) confirm(); });
    col.appendChild(go);
    root.appendChild(col);

    // preview frame (corner brackets) — the 3D course flyover shows through here
    const slot = h('div', 'pk-preview-slot pk-preview-slot--course');
    for (const k of ['tl', 'tr', 'bl', 'br']) slot.appendChild(h('i', `pk-corner pk-corner--${k}`));
    root.appendChild(slot);

    // info card
    const info = h('div', 'pk-coinfo');
    const iNum = h('div', 'pk-coinfo__num');
    const iName = ot('', 'pk-d pk-coinfo__name');
    const iSub = h('div', 'pk-coinfo__sub');
    const iDesc = h('div', 'pk-coinfo__desc');
    const iChips = h('div', 'pk-coinfo__chips');
    const chipLaps = h('span', 'pk-chip');
    const chipDiff = h('span', 'pk-chip pk-chip--shu');
    iChips.append(chipLaps, chipDiff);
    info.append(h('div', 'pk-coinfo__stripe'), iNum, iName, iSub, iDesc, iChips);
    root.appendChild(info);

    const confirm = () => {
      if (this._locked) return;
      cards[sel].classList.add('is-picked');
      go.classList.add('is-pressed');
      this._pick(() => onConfirm && onConfirm({ courseId: list[sel].id, difficulty: DIFFS[diff].id }), 420);
    };
    const back = () => this._goBack(onBack);
    root.appendChild(this._footer(
      [['↑ ↓', 'コース'], ['← →', 'むずかしさ'], ['Enter', 'しゅっぱつ', 'ok']],
      { ok: confirm, back: onBack ? back : null }));

    const fillInfo = (animate) => {
      const c = list[sel];
      const [ca, cb] = (c.colors && c.colors.length ? c.colors : ['#e0b04a', '#d8401f']).map(cssColor);
      info.style.setProperty('--ca', ca);
      info.style.setProperty('--cb', cb || ca);
      iNum.textContent = `COURSE ${sel + 1}`;
      setOt(iName, c.name || c.id);
      iSub.textContent = c.subtitle || '';
      iDesc.textContent = c.description || '';
      chipLaps.textContent = `${c.laps || 3}周`;
      if (animate) info.animate([{ opacity: 0, transform: `translateY(${10 * uPx()}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
    };
    const fillDiff = () => {
      opts.forEach((o, i) => o.classList.toggle('is-on', i === diff));
      chipDiff.textContent = `${DIFFS[diff].id}  ${DIFFS[diff].label}`;
      diffEl.classList.toggle('at-min', diff === 0);
      diffEl.classList.toggle('at-max', diff === DIFFS.length - 1);
    };
    const setDiff = (i) => {
      const j = Math.max(0, Math.min(DIFFS.length - 1, i));
      if (j === diff) {
        dRow.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${(i < diff ? -5 : 5) * uPx()}px)` }, { transform: 'translateX(0)' }], { duration: 160 });
        return;
      }
      diff = j;
      fillDiff();
      opts[diff].animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      this._sfx('menu_move');
    };
    const setFocus = (i, silent = false) => {
      if (i === focus && !silent) return;
      const prevFocus = focus;
      focus = i;
      cards.forEach((c, k) => c.classList.toggle('is-focus', k === focus));
      diffEl.classList.toggle('is-focus', focus === n);
      if (focus < n && focus !== sel) {
        sel = focus;
        cards.forEach((c, k) => c.classList.toggle('is-sel', k === sel));
        fillInfo(true);
        if (typeof onHover === 'function') onHover(list[sel].id);
      }
      if (!silent && prevFocus !== focus) this._sfx('menu_move');
    };

    this._open('course', root, {
      nav: (a) => {
        if (a === 'up') setFocus((focus - 1 + n + 1) % (n + 1));
        else if (a === 'down') setFocus((focus + 1) % (n + 1));
        else if ((a === 'left' || a === 'right') && focus === n) setDiff(diff + (a === 'left' ? -1 : 1));
        else if (a === 'ok') confirm();
        else if (a === 'back') back();
      },
    });
    cards.forEach((c, k) => { c.classList.toggle('is-sel', k === sel); c.classList.toggle('is-focus', k === focus); });
    fillInfo(false);
    fillDiff();
    if (typeof onHover === 'function') onHover(list[sel].id);
  }

  // ------------------------------------------------------------------------------ loading

  _buildLoading() {
    const root = h('div', 'pk-layer pk-loading pk-hidden');
    root.appendChild(h('div', 'pk-loading__bg'));
    const center = h('div', 'pk-loading__center');
    const title = h('div', 'pk-loading__title');
    center.appendChild(title);
    const drum = h('div', 'pk-loading__drum');
    drum.appendChild(h('div', 'pk-loading__tacks'));
    drum.appendChild(h('div', 'pk-loading__tomoe'));
    const text = h('div', 'pk-loading__text');
    const label = h('span', 'pk-loading__label');
    const dots = h('span', 'pk-dots');
    for (let i = 0; i < 3; i++) dots.appendChild(h('i', null, '・'));
    text.append(label, dots);
    center.append(drum, text);
    const tip = h('div', 'pk-loading__tip');
    tip.appendChild(h('span', 'pk-loading__tiplabel', 'ヒント'));
    const tipText = h('span', 'pk-loading__tiptext');
    tip.appendChild(tipText);
    root.append(center, tip, h('div', 'pk-loading__wave'));
    this.el.appendChild(root);
    this._loading = { root, label, tipText, title, anim: null };
  }

  /** Full-screen loading overlay. opts.title: optional big heading (e.g. the course name); opts.tip: hint text. */
  showLoading(text = 'コースを準備中…', { tip, title } = {}) {
    const L = this._loading;
    L.label.textContent = String(text).replace(/(…|\.\.\.|・・・)$/, '');
    L.title.textContent = title || '';
    L.title.classList.toggle('pk-hidden', !title);
    L.tipText.textContent = tip || TIPS[Math.floor(Math.random() * TIPS.length)];
    if (this._loadingOn) return;
    this._loadingOn = true;
    if (L.anim) L.anim.cancel();
    L.root.classList.remove('pk-hidden');
    L.anim = L.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }

  hideLoading() {
    const L = this._loading;
    if (!this._loadingOn) return;
    this._loadingOn = false;
    if (L.anim) L.anim.cancel();
    L.anim = L.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
    L.anim.onfinish = () => { if (!this._loadingOn) { L.root.classList.add('pk-hidden'); L.anim.cancel(); } };
    if (!this._fade.closed) this._releaseHeld();
  }

  // ------------------------------------------------------------------------------ HUD

  _buildHUD() {
    const root = h('div', 'pk-layer pk-hud pk-hidden');
    // item slot (top-left)
    const itemWrap = h('div', 'pk-hud__item');
    const slot = h('div', 'pk-islot is-empty');
    const glow = h('div', 'pk-islot__glow');
    const ring = h('div', 'pk-islot__ring');
    const face = h('div', 'pk-islot__face');
    const reel = h('div', 'pk-islot__reel');
    const img = new Image();
    img.className = 'pk-islot__img';
    img.alt = '';
    img.draggable = false;
    reel.appendChild(img);
    face.appendChild(reel);
    const flash = h('div', 'pk-islot__flash');
    const count = h('div', 'pk-islot__count pk-d');
    slot.append(glow, ring, face, flash, count);
    itemWrap.appendChild(slot);

    // lap / time / minimap (top-right)
    const tr = h('div', 'pk-hud__tr');
    const lap = h('div', 'pk-lap');
    const lapLabel = ot('LAP', 'pk-d pk-lap__label');
    const lapNum = ot('1', 'pk-d pk-lap__num');
    const lapTot = ot('/3', 'pk-d pk-lap__tot');
    lap.append(lapLabel, lapNum, lapTot);
    const time = h('div', 'pk-time');
    time.appendChild(h('span', 'pk-time__icon'));
    const timeDigits = h('span', 'pk-time__digits pk-d');
    time.appendChild(timeDigits);
    const map = h('canvas', 'pk-map');
    tr.append(lap, time, map);

    // coins + speed (bottom-left)
    const bl = h('div', 'pk-hud__bl');
    const coins = h('div', 'pk-coins');
    const coinIcon = new Image();
    coinIcon.className = 'pk-coins__icon';
    coinIcon.alt = '';
    coinIcon.draggable = false;
    coinIcon.src = this._itemSrc('koban');
    const coinX = ot('×', 'pk-d pk-coins__x');
    const coinNum = ot('0', 'pk-d pk-coins__num');
    coins.append(coinIcon, coinX, coinNum);
    const speed = h('div', 'pk-speed');
    const speedDigits = h('span', 'pk-speed__digits pk-d');
    const speedBar = h('span', 'pk-speed__bar');
    const speedFill = h('i');
    speedBar.appendChild(speedFill);
    speed.append(speedDigits, h('span', 'pk-speed__unit', 'km/h'), speedBar);
    bl.append(coins, speed);

    // position (bottom-right)
    const posWrap = h('div', 'pk-hud__pos');
    const pos = h('div', 'pk-pos pk-pos--1');
    const posNum = ot('1', 'pk-d pk-pos__n');
    const posSuf = ot('位', 'pk-d pk-pos__s');
    pos.append(posNum, posSuf);
    const posDelta = h('div', 'pk-pos__delta');
    posWrap.append(pos, posDelta);

    root.append(itemWrap, tr, bl, posWrap);
    this._hud = {
      root, slot, img, reel, count, flash, lapNum, lapTot, lap, timeDigits: new Digits(timeDigits),
      map, coins, coinIcon, coinNum, speedDigits: new Digits(speedDigits), speedFill, pos, posNum, posSuf, posDelta,
      shownItem: null, cache: {}, visible: false,
    };
    this._minimap = new Minimap(map);
  }

  showHUD() {
    const H = this._hud;
    if (H.visible) return;
    H.visible = true;
    H.root.classList.remove('pk-hidden');
    H.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
  }

  hideHUD() {
    const H = this._hud;
    H.visible = false;
    H.root.classList.add('pk-hidden');
    this._stopRoulette(false);
    this.showWrongWay(false);
  }

  updateHUD(s = {}) {
    const H = this._hud, c = H.cache;
    if (s.position !== undefined && (s.position !== c.position || s.total !== c.total)) {
      const prev = c.position;
      c.position = s.position; c.total = s.total;
      this._setPosition(s.position, prev);
    }
    if (s.lap !== undefined && (s.lap !== c.lap || s.laps !== c.laps)) {
      const prev = c.lap;
      c.lap = s.lap; c.laps = s.laps;
      const laps = s.laps || 3;
      setOt(H.lapNum, String(Math.max(1, Math.min(laps, s.lap || 1))));
      setOt(H.lapTot, `/${laps}`);
      if (prev !== undefined && s.lap !== prev) {
        H.lap.animate([{ transform: 'scale(1.45)' }, { transform: 'scale(.92)', offset: 0.55 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
      }
    }
    if (s.time !== undefined) H.timeDigits.set(formatTime(s.time ?? 0));
    if (s.coins !== undefined && s.coins !== c.coins) {
      const prev = c.coins;
      c.coins = s.coins;
      const v = Math.max(0, s.coins | 0);
      setOt(H.coinNum, String(v));
      H.coins.classList.toggle('is-max', v >= 10);
      if (prev !== undefined && v > prev) {
        H.coinIcon.animate([{ transform: 'scale(1.35) rotate(-12deg)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.5,.5,1)' });
        H.coinNum.animate([{ transform: 'translateY(-18%) scale(1.2)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      } else if (prev !== undefined && v < prev) {
        H.coins.animate([{ transform: 'translateX(-4%)' }, { transform: 'translateX(4%)' }, { transform: 'translateX(-2%)' }, { transform: 'none' }], { duration: 260 });
      }
    }
    if (s.speedKmh !== undefined) {
      const v = Math.max(0, Math.round(s.speedKmh || 0));
      if (v !== c.speed) {
        c.speed = v;
        H.speedDigits.set(String(v).padStart(3, '\u2007'));
        H.speedFill.style.transform = `scaleX(${Math.min(1, v / (this.speedGaugeMax || 160)).toFixed(3)})`;
      }
    }
    const item = s.item === undefined ? c.item : (s.item || null);
    const itemCount = s.itemCount === undefined ? c.itemCount : s.itemCount;
    if (item !== c.item || itemCount !== c.itemCount) {
      if (this._roulette) {
        // the roulette owns the slot; remember the game's value for later
        c.item = item; c.itemCount = itemCount;
      } else if (!(item == null && performance.now() < (this._rouletteGraceUntil || 0))) {
        c.item = item; c.itemCount = itemCount;
        this._renderItem(item, itemCount, true);
      }
    }
  }

  _setPosition(p, prev) {
    const H = this._hud;
    const v = Math.max(1, p | 0);
    setOt(H.posNum, String(v));
    H.pos.className = `pk-pos pk-pos--${v <= 3 ? v : 'n'}`;
    if (prev !== undefined && prev !== v) {
      H.pos.animate(
        [{ transform: 'scale(1.55) rotate(-8deg)' }, { transform: 'scale(.9) rotate(2deg)', offset: 0.5 }, { transform: 'scale(1.04)', offset: 0.75 }, { transform: 'none' }],
        { duration: 460, easing: 'cubic-bezier(.2,.8,.3,1)' });
      const up = v < prev;
      H.posDelta.className = `pk-pos__delta ${up ? 'is-up' : 'is-down'}`;
      H.posDelta.animate(
        [{ opacity: 0, transform: `translateY(${up ? 20 : -20}%)` }, { opacity: 1, transform: 'none', offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: `translateY(${up ? -40 : 40}%)` }],
        { duration: 800, easing: 'ease-out' });
    }
  }

  _renderItem(key, count, animate) {
    const H = this._hud;
    const prev = H.shownItem;
    H.shownItem = key;
    if (!key) {
      if (prev) {
        H.slot.classList.add('is-empty');
        H.reel.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.3) rotate(-30deg)', opacity: 0 }], { duration: 200, easing: 'ease-in' });
      } else H.slot.classList.add('is-empty');
      H.count.textContent = '';
      H.count.classList.remove('is-on');
      return;
    }
    H.slot.classList.remove('is-empty');
    H.img.src = this._itemSrc(key);
    const nC = count | 0;
    H.count.textContent = nC > 1 ? `×${nC}` : '';
    H.count.classList.toggle('is-on', nC > 1);
    if (animate && key !== prev) {
      H.reel.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    }
  }

  rouletteItem(finalKey, durationMs = 1800) {
    this._stopRoulette(false);
    const H = this._hud;
    const keys = ROULETTE_KEYS.slice();
    let i = Math.floor(Math.random() * keys.length);
    let t = 0;
    H.slot.classList.remove('is-empty');
    H.slot.classList.add('is-rolling');
    H.count.classList.remove('is-on');
    return new Promise((resolve) => {
      const r = (this._roulette = { timer: null, resolve });
      const land = () => {
        this._roulette = null;
        H.slot.classList.remove('is-rolling');
        this._hud.cache.item = finalKey;
        this._rouletteGraceUntil = performance.now() + 300;
        this._renderItem(finalKey || null, this._hud.cache.itemCount, false);
        if (finalKey) {
          H.reel.animate(
            [{ transform: 'scale(1.7)', opacity: 0.4 }, { transform: 'scale(.86)', opacity: 1, offset: 0.45 }, { transform: 'scale(1.08)', offset: 0.75 }, { transform: 'scale(1)' }],
            { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
          H.flash.animate([{ opacity: 0.95, transform: 'scale(.7)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 520, easing: 'ease-out' });
          H.slot.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.6,.5,1)' });
          this._sfx('item_get');
        }
        resolve(finalKey);
      };
      const tick = () => {
        const p = t / durationMs;
        if (p >= 1) { land(); return; }
        i = (i + 1) % keys.length;
        H.img.src = this._itemSrc(keys[i]);
        const interval = 55 + 250 * Math.pow(p, 2.3);
        H.reel.animate([{ transform: 'translateY(-70%)', opacity: 0.2 }, { transform: 'translateY(6%)', opacity: 1, offset: 0.75 }, { transform: 'translateY(0)' }],
          { duration: Math.max(50, interval * 0.9), easing: 'ease-out' });
        this._sfx('roulette');
        t += interval;
        r.timer = setTimeout(tick, interval);
      };
      tick();
    });
  }

  _stopRoulette(land) {
    const r = this._roulette;
    if (!r) return;
    clearTimeout(r.timer);
    this._roulette = null;
    this._hud.slot.classList.remove('is-rolling');
    if (!land) {
      this._renderItem(this._hud.cache.item || null, this._hud.cache.itemCount, false);
      r.resolve(null);
    }
  }

  setMinimap(path) { this._minimap.setPath(path); }

  updateMinimap(dots) {
    if (!this._hud.visible) return;
    this._minimap.draw(dots);
  }

  // ------------------------------------------------------------------------------ race FX

  countdown(n) {
    const goNow = !(n > 0);
    const el = h('div', `pk-count ${goNow ? 'pk-count--go' : `pk-count--${Math.min(3, n)}`}`);
    el.appendChild(h('div', 'pk-count__ring'));
    el.appendChild(h('div', 'pk-count__ring pk-count__ring--b'));
    if (goNow) {
      const burst = h('div', 'pk-count__burst');
      for (let k = 0; k < 12; k++) {
        const s = h('i');
        s.style.setProperty('--a', `${k * 30 + 15}deg`);
        burst.appendChild(s);
      }
      el.appendChild(burst);
    }
    el.appendChild(ot(goNow ? 'GO!' : String(n), 'pk-d pk-count__num'));
    this._fx.appendChild(el);
    this._later(() => el.remove(), goNow ? 1500 : 1050);
  }

  banner(text, { style = 'info', durationMs = 2000 } = {}) {
    const dur = Math.max(700, durationMs);
    const el = h('div', `pk-banner pk-banner--${style}`);
    const band = h('div', 'pk-banner__band');
    band.appendChild(h('div', 'pk-banner__pat'));
    const txt = ot(text, 'pk-d pk-banner__text');
    el.append(band, txt);
    this._fx.appendChild(el);
    const inT = Math.min(0.3, 340 / dur), outT = Math.max(0.7, 1 - 320 / dur);
    const W = window.innerWidth;
    const OUT = 'cubic-bezier(.15,.85,.3,1)', IN = 'cubic-bezier(.6,0,.9,.45)';
    const opt = { duration: dur, fill: 'both' };
    if (style === 'final') {
      band.animate([
        { transform: 'scaleY(0)', easing: OUT }, { transform: 'scaleY(1.18)', offset: inT * 0.55, easing: 'ease-in-out' },
        { transform: 'scaleY(1)', offset: inT }, { transform: 'scaleY(1)', offset: outT, easing: IN }, { transform: 'scaleY(0)' }], opt);
      band.firstChild.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-W * 0.12}px)` }], { duration: dur, fill: 'both' });
      txt.animate([
        { transform: `translateX(${W * 0.75}px) skewX(-14deg)`, easing: OUT },
        { transform: 'translateX(0) skewX(-4deg)', offset: inT },
        { transform: `translateX(${-W * 0.035}px) skewX(-4deg)`, offset: outT, easing: IN },
        { transform: `translateX(${-W * 0.8}px) skewX(-14deg)` }], opt);
    } else if (style === 'finish') {
      band.animate([
        { transform: 'scaleX(0)', opacity: 1, easing: OUT }, { transform: 'scaleX(1)', opacity: 1, offset: inT },
        { transform: 'scaleX(1)', opacity: 1, offset: outT, easing: 'ease-in' }, { transform: 'scaleX(1)', opacity: 0 }], opt);
      txt.animate([
        { transform: 'scale(3) rotate(-8deg)', opacity: 0, easing: 'cubic-bezier(.3,0,.7,.6)' },
        { transform: 'scale(.86) rotate(2deg)', opacity: 1, offset: inT * 0.75, easing: 'ease-out' },
        { transform: 'scale(1.07) rotate(-1deg)', opacity: 1, offset: inT * 1.25, easing: 'ease-in-out' },
        { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: inT * 1.7 },
        { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: outT, easing: 'ease-in' },
        { transform: 'scale(1.3) rotate(0deg)', opacity: 0 }], opt);
      this._later(() => this._confetti(el), dur * inT * 0.7);
    } else {
      band.animate([
        { transform: 'scaleX(0)', opacity: 1, easing: OUT }, { transform: 'scaleX(1)', opacity: 1, offset: inT },
        { transform: 'scaleX(1)', opacity: 1, offset: outT, easing: 'ease-in' }, { transform: 'scaleX(1)', opacity: 0 }], opt);
      txt.animate([
        { transform: `translateX(${W * 0.22}px)`, opacity: 0, easing: OUT }, { transform: 'translateX(0)', opacity: 1, offset: inT },
        { transform: `translateX(${-W * 0.01}px)`, opacity: 1, offset: outT, easing: IN }, { transform: `translateX(${-W * 0.2}px)`, opacity: 0 }], opt);
    }
    return new Promise((resolve) => this._later(() => { el.remove(); resolve(); }, dur + 40));
  }

  _confetti(host) {
    const W = window.innerWidth, H = window.innerHeight, u = uPx();
    const colors = ['#d8401f', '#e0b04a', '#f8dd8c', '#f7f1e3', '#f4a7b9', '#3a5895', '#7da34a', '#ff8a3d'];
    const layer = h('div', 'pk-confetti-layer');
    host.appendChild(layer);
    const spawn = (x0, y0, angC, spread, count, power) => {
      for (let i = 0; i < count; i++) {
        const kind = i % 5 === 0 ? 'is-petal' : i % 3 === 0 ? 'is-round' : '';
        const p = h('i', `pk-confetti ${kind}`);
        const sz = (7 + Math.random() * 9) * u;
        p.style.width = `${sz}px`;
        p.style.height = `${kind === 'is-petal' ? sz * 1.1 : kind === 'is-round' ? sz * 0.8 : sz * 0.55}px`;
        if (kind !== 'is-petal') p.style.background = colors[(Math.random() * colors.length) | 0];
        p.style.left = `${x0}px`;
        p.style.top = `${y0}px`;
        layer.appendChild(p);
        const ang = angC + (Math.random() - 0.5) * spread;
        const v = (0.45 + Math.random() * 0.55) * power;
        const x1 = Math.cos(ang) * v, y1 = Math.sin(ang) * v;
        const x2 = x1 * 1.25 + (Math.random() - 0.5) * 160 * u, y2 = y1 + H * (0.55 + Math.random() * 0.45);
        const rot = (Math.random() - 0.5) * 1600;
        const dur = 1700 + Math.random() * 1300;
        p.animate([
          { transform: 'translate(0,0) rotate(0deg) scale(.5)', opacity: 1, easing: 'cubic-bezier(.1,.75,.3,1)' },
          { transform: `translate(${x1}px,${y1}px) rotate(${rot * 0.35}deg) scale(1)`, opacity: 1, offset: 0.3, easing: 'cubic-bezier(.45,0,.8,.6)' },
          { transform: `translate(${x2}px,${y2}px) rotate(${rot}deg) scale(.9)`, opacity: 0 }],
        { duration: dur, delay: Math.random() * 140, fill: 'both' });
      }
    };
    spawn(W * 0.5, H * 0.44, -Math.PI / 2, Math.PI * 1.6, 34, H * 0.55);
    spawn(-10 * u, H * 1.02, -Math.PI * 0.32, 0.55, 26, H * 1.05);
    spawn(W + 10 * u, H * 1.02, -Math.PI * 0.68, 0.55, 26, H * 1.05);
    this._later(() => layer.remove(), 3400);
  }

  /** Small popup near lower-centre. opts.style: 'blue' | 'orange' | 'purple' | 'gold' | 'red' (default indigo). */
  toast(text, { style } = {}) {
    let wrap = this._toasts;
    if (!wrap || !wrap.isConnected) {
      wrap = this._toasts = h('div', 'pk-toasts');
      this._fx.appendChild(wrap);
    }
    // FLIP: remember positions of existing toasts, append, then animate them to their new spot
    const olds = [...wrap.children].filter((c) => !c.classList.contains('is-out'));
    const before = olds.map((c) => c.getBoundingClientRect().top);
    while (olds.length >= 3) { const o = olds.shift(); before.shift(); o.remove(); }
    const t = h('div', `pk-toast${style ? ` pk-toast--${style}` : ''}`);
    t.appendChild(h('span', 'pk-toast__spark'));
    t.appendChild(ot(text, 'pk-d pk-toast__t'));
    t.appendChild(h('span', 'pk-toast__spark pk-toast__spark--r'));
    wrap.appendChild(t);
    olds.forEach((c, k) => {
      const dy = before[k] - c.getBoundingClientRect().top;
      if (dy) c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
    });
    t.animate([
      { transform: 'scale(.4) translateY(40%)', opacity: 0 }, { transform: 'scale(1.12)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1.2)' });
    this._later(() => {
      t.classList.add('is-out');
      const a = t.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-60%) scale(.9)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = () => t.remove();
    }, 1250);
  }

  _buildWrongWay() {
    const el = h('div', 'pk-wrong');
    const inner = h('div', 'pk-wrong__in');
    inner.appendChild(h('span', 'pk-wrong__icon'));
    inner.appendChild(ot('逆走中！', 'pk-d pk-wrong__t'));
    el.appendChild(inner);
    this._fx.appendChild(el);
    this._wrong = el;
    this._wrongOn = false;
  }

  showWrongWay(on) {
    on = !!on;
    if (on === this._wrongOn) return;
    this._wrongOn = on;
    this._wrong.classList.toggle('is-on', on);
  }

  // ------------------------------------------------------------------------------ pause

  showPause({ onResume, onRestart, onQuit } = {}) {
    const root = h('div', 'pk-scr pk-pause');
    root.appendChild(h('div', 'pk-pause__dim'));
    const panel = h('div', 'pk-pause__panel');
    const title = h('div', 'pk-pause__title');
    title.appendChild(h('div', 'pk-pause__brush'));
    title.appendChild(ot('ポーズ', 'pk-d pk-pause__t'));
    panel.appendChild(title);
    panel.appendChild(h('div', 'pk-pause__leaf'));
    const labels = [['つづける', onResume], ['やりなおす', onRestart], ['コースえらびへ', onQuit]];
    const btns = labels.map(([l]) => this._button(l, 'pk-btn--wide'));
    const list = h('div', 'pk-pause__btns');
    btns.forEach((b) => list.appendChild(b));
    panel.appendChild(list);
    const hint = h('div', 'pk-pause__hint');
    hint.append(h('span', 'pk-key', '↑'), h('span', 'pk-key', '↓'), h('span', null, 'えらぶ'),
      h('span', 'pk-key', 'Enter'), h('span', null, 'けってい'), h('span', 'pk-key', 'Esc'), h('span', null, 'つづける'));
    panel.appendChild(hint);
    root.appendChild(panel);
    const nav = this._menuList(btns, { onPick: (i) => this._pick(labels[i][1], 200) });
    this._open('pause', root, {
      nav: (a) => {
        if (a === 'back') { if (onResume) { this._locked = true; this._sfx('menu_back'); this._later(onResume, 60); } }
        else nav(a);
      },
    });
  }

  hidePause() {
    if (this._screen && this._screen.name === 'pause') this._closeScreen();
  }

  // ------------------------------------------------------------------------------ results

  showResults({ rows = [], courseName = '', onRetry, onCourseSelect, onTitle } = {}) {
    const root = h('div', 'pk-scr pk-results');
    root.appendChild(h('div', 'pk-results__shade'));
    root.appendChild(this._topbar('リザルト', 'RACE RESULTS', null, courseName || null));

    const me = rows.find((r) => r.isPlayer);
    if (me) {
      const box = h('div', 'pk-rme');
      const rank = me.rank | 0;
      const dnf = me.time == null;
      box.appendChild(h('div', 'pk-rme__label', 'あなたの順位'));
      const big = h('div', `pk-pos pk-rme__pos pk-pos--${rank >= 1 && rank <= 3 ? rank : 'n'}`);
      big.append(ot(String(rank || '-'), 'pk-d pk-pos__n'), ot('位', 'pk-d pk-pos__s'));
      box.appendChild(big);
      const msg = dnf ? 'リタイア…' : rank === 1 ? '優勝！' : rank <= 3 ? '表彰台！' : 'ゴール！';
      const sub = dnf ? 'つぎはゴールをめざそう！' : rank === 1 ? 'おめでとう！' : rank <= 3 ? 'ナイスラン！' : 'つぎは表彰台をめざそう！';
      const m = h('div', 'pk-rme__msg');
      m.appendChild(ot(msg, 'pk-d pk-rme__msgt'));
      box.appendChild(m);
      box.appendChild(h('div', 'pk-rme__sub', sub));
      const tm = h('div', 'pk-rme__time');
      tm.appendChild(h('span', 'pk-rme__timel', 'タイム'));
      tm.appendChild(h('span', 'pk-d', formatTime(me.time)));
      box.appendChild(tm);
      if (rank === 1) box.classList.add('is-win');
      root.appendChild(box);
    }

    const board = h('div', 'pk-board');
    const head = h('div', 'pk-board__head');
    head.append(h('span', null, '順位'), h('span', null, ''), h('span', null, 'なまえ'), h('span', null, 'タイム'));
    board.appendChild(head);
    rows.forEach((r, i) => {
      const row = h('div', 'pk-rrow' + (r.isPlayer ? ' is-player' : ''));
      row.style.setProperty('--i', i);
      row.style.setProperty('--rc', cssColor(r.color) || '#8f7760');
      const inner = h('div', 'pk-rrow__in');
      const rank = h('div', `pk-rrow__rank pk-rrow__rank--${r.rank >= 1 && r.rank <= 3 ? r.rank : 'n'}`);
      rank.appendChild(h('span', 'pk-d', String(r.rank)));
      const face = this._portrait(r.characterId, 'pk-rrow__face', cssColor(r.color));
      const nm = h('div', 'pk-rrow__name');
      nm.appendChild(h('span', null, r.name || ''));
      if (r.isPlayer) nm.appendChild(h('span', 'pk-rrow__you', 'あなた'));
      const tm = h('div', 'pk-rrow__time pk-d', r.time == null ? '--' : formatTime(r.time));
      inner.append(rank, face, nm, tm);
      row.appendChild(inner);
      board.appendChild(row);
    });
    root.appendChild(board);

    const labels = [['もういちど', onRetry], ['コースえらび', onCourseSelect], ['タイトルへ', onTitle]];
    const btnRow = h('div', 'pk-results__btns');
    const btns = labels.map(([l], i) => { const b = this._button(l, i === 0 ? 'pk-btn--primary' : ''); b.style.setProperty('--i', i); btnRow.appendChild(b); return b; });
    root.appendChild(btnRow);
    const nav = this._menuList(btns, { horizontal: true, onPick: (i) => this._pick(labels[i][1], 220) });
    this._open('results', root, { nav: (a) => { if (a !== 'back') nav(a); } });
  }

  // ------------------------------------------------------------------------------ transition

  _buildFade() {
    const root = h('div', 'pk-layer pk-fade');
    const black = h('div', 'pk-fade__black');
    const l = h('div', 'pk-door pk-door--l');
    const r = h('div', 'pk-door pk-door--r');
    for (const d of [l, r]) {
      d.appendChild(h('div', 'pk-door__lattice'));
      d.appendChild(h('div', 'pk-door__kick'));
      d.appendChild(h('div', 'pk-door__crest'));
    }
    root.append(black, l, r);
    this.el.appendChild(root);
    this._fade = { root, black, l, r, closed: false, token: 0, anims: [] };
  }

  /**
   * Full-screen transition. on=true covers the screen (shoji doors slide shut), on=false reveals.
   * opts.style: 'doors' (default) | 'black' (plain fade). Resolves when the animation is done.
   */
  fade(on, ms = 400, { style = 'doors' } = {}) {
    const F = this._fade;
    const token = ++F.token;
    // interrupting a running transition: continue from where it currently is
    F.anims.forEach((a) => { try { a.commitStyles(); } catch { /* not rendered */ } a.cancel(); });
    F.anims = [];
    F.closed = !!on;
    F.root.classList.toggle('is-blocking', !!on);
    if (!on) this._releaseHeld();
    const dur = Math.max(1, ms);
    const anims = [];
    const toL = on ? 'translateX(0%)' : 'translateX(-101%)', toR = on ? 'translateX(0%)' : 'translateX(101%)';
    if (style === 'black') {
      const from = getComputedStyle(F.black).opacity;
      anims.push(F.black.animate([{ opacity: from }, { opacity: on ? 1 : 0 }], { duration: dur, easing: 'ease-in-out', fill: 'forwards' }));
    } else {
      const fromL = getComputedStyle(F.l).transform, fromR = getComputedStyle(F.r).transform;
      const easing = on ? 'cubic-bezier(.62,0,.84,.5)' : 'cubic-bezier(.2,.6,.35,1)';
      anims.push(F.l.animate([{ transform: fromL === 'none' ? 'translateX(-101%)' : fromL }, { transform: toL }], { duration: dur, easing, fill: 'forwards' }));
      anims.push(F.r.animate([{ transform: fromR === 'none' ? 'translateX(101%)' : fromR }, { transform: toR }], { duration: dur, easing, fill: 'forwards' }));
      if (!on && getComputedStyle(F.black).opacity !== '0') {
        anims.push(F.black.animate([{ opacity: getComputedStyle(F.black).opacity }, { opacity: 0 }], { duration: dur * 0.6, fill: 'forwards' }));
      }
    }
    F.anims = anims;
    return new Promise((resolve) => {
      Promise.all(anims.map((a) => a.finished.catch(() => null))).then(() => {
        if (token === F.token) {
          // settle on resolution-independent end states (percentages), then drop the animations
          if (style === 'black') {
            F.black.style.opacity = on ? '1' : '0';
            if (!on) { F.l.style.transform = ''; F.r.style.transform = ''; }
          } else {
            F.l.style.transform = on ? toL : '';
            F.r.style.transform = on ? toR : '';
            if (!on) F.black.style.opacity = '0';
          }
          anims.forEach((a) => a.cancel());
          F.anims = [];
          if (on && style !== 'black') {
            // closing thud
            F.root.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${3 * uPx()}px)` }, { transform: 'translateY(0)' }], { duration: 120, easing: 'ease-out' });
          }
        }
        resolve();
      });
    });
  }

  // ------------------------------------------------------------------------------ teardown

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown, true);
    window.removeEventListener('pointermove', this._onPointerMove, true);
    this._stopRoulette(false);
    for (const id of this._timers) clearTimeout(id);
    this._timers.clear();
    this._minimap.dispose();
    this._screen = null;
    this.el.remove();
  }
}
