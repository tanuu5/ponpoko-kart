// ぽんぽこカート UI — procedural SVG art.
// Traditional patterns (青海波 / 麻の葉 / 矢絣), paper texture, brush strokes, item icons,
// course emblems and small decorative pieces. Everything is generated as an SVG string;
// embed with dataUri() (for <img>) or cssUrl() (for CSS backgrounds).
// Note: SVG used as an image cannot use web fonts, so no text is drawn here.

export const PAL = {
  shu: '#d8401f', shuD: '#a02a12', shuL: '#f26a3f',
  gold: '#e0b04a', goldL: '#f8dd8c', goldD: '#a8781f',
  sumi: '#1d1a19', washi: '#f7f1e3', ai: '#243a6b', aiD: '#16244a',
  sakura: '#f4a7b9', sakuraL: '#ffd9e2', sakuraD: '#d9738e', matcha: '#7da34a',
};
const INK = '#2a1d17';

const n2 = (v) => Math.round(v * 100) / 100;
export const dataUri = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
export const cssUrl = (svg) => `url("${dataUri(svg)}")`;
const wrap = (w, h, body, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${attrs}>${body}</svg>`;

// ---------------------------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------------------------

/** 青海波 seigaiha (overlapping concentric waves). Needs an opaque background colour. */
export function seigaiha({ r = 24, bg = PAL.ai, fg = '#2e4a86', rings = 4, sw = 1.4 } = {}) {
  const w = r * 2, h = r;
  const one = (cx, cy) => {
    let s = `<circle cx="${cx}" cy="${cy}" r="${n2(r - sw / 2)}" fill="${bg}" stroke="${fg}" stroke-width="${sw}"/>`;
    for (let i = 1; i < rings; i++) {
      s += `<circle cx="${cx}" cy="${cy}" r="${n2((r - sw / 2) * (1 - i / rings))}" fill="none" stroke="${fg}" stroke-width="${sw}"/>`;
    }
    return s;
  };
  const body = `<rect width="${w}" height="${h}" fill="${bg}"/>` +
    one(r, -h / 2) + one(0, 0) + one(w, 0) + one(r, h / 2) + one(0, h) + one(w, h) + one(r, h * 1.5);
  return wrap(w, h, body);
}

/** 麻の葉 asanoha (hemp-leaf star lattice). Transparent background. */
export function asanoha({ s = 36, stroke = 'rgba(224,176,74,0.5)', sw = 1.2, bg = null } = {}) {
  const h = (s * Math.sqrt(3)) / 2;
  const W = s, H = 2 * h;
  let d = '';
  const seg = (a, b) => { d += `M${n2(a[0])} ${n2(a[1])}L${n2(b[0])} ${n2(b[1])}`; };
  const tri = (a, b, c) => {
    const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    seg(a, b); seg(b, c); seg(c, a); seg(a, m); seg(b, m); seg(c, m);
  };
  const off = (j) => ((((j % 2) + 2) % 2) ? s / 2 : 0);
  for (let j = -1; j <= 2; j++) {
    const y0 = j * h, y1 = (j + 1) * h, o0 = off(j), o1 = off(j + 1);
    for (let i = -2; i <= 2; i++) {
      tri([i * s + o0, y0], [(i + 1) * s + o0, y0], [(i + 0.5) * s + o0, y1]);
      tri([i * s + o1, y1], [(i + 1) * s + o1, y1], [(i + 0.5) * s + o1, y0]);
    }
  }
  const body = (bg ? `<rect width="${W}" height="${n2(H)}" fill="${bg}"/>` : '') +
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${n2(H)}" viewBox="0 0 ${W} ${n2(H)}">${body}</svg>`;
}

/** 矢絣 yagasuri (arrow-feather columns). */
export function yagasuri({ c = 22, p = 44, a = PAL.ai, b = PAL.washi } = {}) {
  const dd = p / 4;
  const band = (x0, y) =>
    `<path d="M${x0} ${y}L${x0 + c / 2} ${y + dd}L${x0 + c} ${y}L${x0 + c} ${y + p / 2}L${x0 + c / 2} ${y + dd + p / 2}L${x0} ${y + p / 2}Z" fill="${a}"/>`;
  const body = `<rect width="${2 * c}" height="${p}" fill="${b}"/>` +
    band(0, -p) + band(0, 0) + band(0, p) + band(c, -p / 2) + band(c, p / 2) + band(c, 1.5 * p);
  return wrap(2 * c, p, body);
}

/** Fine washi paper grain + long fibres (transparent overlay). */
export function paperNoise({ size = 256, strength = 1, seed = 7 } = {}) {
  const k = strength;
  const body =
    `<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" stitchTiles="stitch"/>` +
    `<feColorMatrix values="0 0 0 0 0.36  0 0 0 0 0.29  0 0 0 0 0.2  0 0 0 ${n2(0.3 * k)} ${n2(-0.12 * k)}"/></filter>` +
    `<filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.01 0.22" numOctaves="2" seed="${seed + 3}" stitchTiles="stitch"/>` +
    `<feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.24  0 0 0 ${n2(0.4 * k)} ${n2(-0.24 * k)}"/></filter>` +
    `<rect width="100%" height="100%" filter="url(#g)"/><rect width="100%" height="100%" filter="url(#f)"/>`;
  return wrap(size, size, body);
}

/** Horizontal sumi/vermilion brush stroke with a dry-brush tail (stretch with background-size). */
export function brushBand({ color = PAL.shu, seed = 4 } = {}) {
  const W = 640, H = 120;
  const body =
    `<defs><filter id="b" x="-4%" y="-25%" width="108%" height="150%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.016 0.2" numOctaves="3" seed="${seed}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="15" xChannelSelector="R" yChannelSelector="G"/></filter>` +
    `<mask id="m"><rect width="${W}" height="${H}" fill="#fff"/>` +
    `<g stroke="#000" stroke-linecap="round" fill="none">` +
    `<path d="M430 40 L618 44" stroke-width="2.2"/><path d="M470 56 L630 58" stroke-width="1.6"/>` +
    `<path d="M500 70 L626 67" stroke-width="2.6"/><path d="M455 83 L600 86" stroke-width="1.8"/>` +
    `<path d="M540 32 L632 36" stroke-width="1.4"/></g></mask></defs>` +
    `<g filter="url(#b)" mask="url(#m)" fill="${color}">` +
    `<path d="M30 34C90 18 200 22 330 22C450 22 540 16 592 28C618 34 630 50 626 62C622 78 596 90 548 94C440 102 300 96 190 100C110 103 50 106 26 92C6 80 8 46 30 34Z"/>` +
    `<path d="M500 26C560 22 612 28 638 40" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
    `<path d="M520 92C580 96 616 90 636 80" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
    `</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${body}</svg>`;
}

/** Single sakura petal (for ambient falling petals / confetti). */
export function petal({ fill = '#ffc7d6', edge = '#f08aa6' } = {}) {
  return wrap(40, 40,
    `<defs><linearGradient id="p" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff5f8"/><stop offset="1" stop-color="${fill}"/></linearGradient></defs>` +
    `<path d="M20 38C8 30 4 16 11 6L20 11L29 6C36 16 32 30 20 38Z" fill="url(#p)" stroke="${edge}" stroke-width="1.2"/>` +
    `<path d="M20 36L20 16" stroke="${edge}" stroke-width="0.8" opacity=".6"/>`);
}

// ---------------------------------------------------------------------------------------------
// Decorative pieces
// ---------------------------------------------------------------------------------------------

/** 狸の葉っぱ (the leaf a tanuki puts on its head to transform). */
export function leaf({ a = '#a8dc62', b = '#3f8a2e', line = '#1f4a18' } = {}) {
  return wrap(100, 120,
    `<defs><linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<path d="M50 104L50 116" stroke="${line}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M50 6C80 22 94 56 70 88C63 97 55 102 50 106C45 102 37 97 30 88C6 56 20 22 50 6Z" fill="url(#l)" stroke="${line}" stroke-width="4.5" stroke-linejoin="round"/>` +
    `<path d="M50 14L50 104" stroke="${line}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<g stroke="${line}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".85">` +
    `<path d="M50 34L66 24"/><path d="M50 52L74 40"/><path d="M50 70L72 60"/><path d="M50 88L64 80"/>` +
    `<path d="M50 34L34 24"/><path d="M50 52L26 40"/><path d="M50 70L28 60"/><path d="M50 88L36 80"/></g>` +
    `<path d="M40 22C34 30 30 40 30 50" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".45"/>`);
}

/** 家紋-style crest: vermilion disc with a washi leaf (used on the transition doors). */
export function crest({ disc = PAL.shu, fg = PAL.washi, ring = PAL.gold } = {}) {
  return wrap(100, 100,
    `<circle cx="50" cy="50" r="47" fill="${ring}"/><circle cx="50" cy="50" r="42.5" fill="${disc}"/>` +
    `<g transform="translate(50 50) rotate(-28) translate(-50 -56) scale(1 .96)">` +
    `<path d="M50 16C74 28 84 54 66 78C60 86 54 90 50 93C46 90 40 86 34 78C16 54 26 28 50 16Z" fill="${fg}"/>` +
    `<path d="M50 22L50 99" stroke="${disc}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<g stroke="${disc}" stroke-width="2.6" stroke-linecap="round"><path d="M50 40L63 31"/><path d="M50 55L68 45"/><path d="M50 70L64 62"/>` +
    `<path d="M50 40L37 31"/><path d="M50 55L32 45"/><path d="M50 70L36 62"/></g></g>`);
}

/** 三つ巴 mitsudomoe (loading spinner). */
export function tomoe({ fill = PAL.shu, R = 46 } = {}) {
  const d = R * 0.4, r = R * 0.31, tEnd = 165;
  const smooth = (x) => x * x * (3 - 2 * x);
  const P = (rho, deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [50 + rho * Math.cos(a), 50 + rho * Math.sin(a)];
  };
  const one = (rot) => {
    const pts = [];
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * tEnd;
      const ro = (d + r) + (R - (d + r)) * smooth(Math.min(1, t / 75));
      pts.push(P(ro, rot + t));
    }
    for (let i = N; i >= 0; i--) {
      const t = (i / N) * tEnd;
      const ri = d + (R - d) * Math.pow(t / tEnd, 0.85);
      pts.push(P(ri, rot + t));
    }
    const hc = P(d, rot);
    const poly = pts.map((p, k) => `${k ? 'L' : 'M'}${n2(p[0])} ${n2(p[1])}`).join('') + 'Z';
    return `<path d="${poly}"/><circle cx="${n2(hc[0])}" cy="${n2(hc[1])}" r="${n2(r)}"/>`;
  };
  return wrap(100, 100, `<g fill="${fill}">${one(0)}${one(120)}${one(240)}</g>`);
}

/** Wrong-way U-turn arrow. */
export function uturn() {
  const p = 'M68 86L68 46C68 30 58 20 46 20C34 20 26 30 26 44L26 56';
  return wrap(100, 100,
    `<path d="${p}" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M8 50L44 50L26 80Z" fill="${INK}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>` +
    `<path d="${p}" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M13 53L39 53L26 74Z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`);
}

/** Small stopwatch icon for the race timer. */
export function stopwatch({ c = PAL.washi } = {}) {
  return wrap(100, 100,
    `<g fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round">` +
    `<circle cx="50" cy="56" r="34"/><path d="M50 56L50 36"/><path d="M50 56L64 64"/><path d="M40 10L60 10"/><path d="M50 10L50 22"/><path d="M80 24L86 18"/></g>`);
}

// ---------------------------------------------------------------------------------------------
// Item icons (placeholders until the game supplies its own via UI.setAssets)
// ---------------------------------------------------------------------------------------------

function dangoIcon(n) {
  const cols = [['#ffd1dd', '#ef7f9e'], ['#fffdf5', '#e3d4b2'], ['#cbe89c', '#6fa446']]; // pink, white, green
  const P = (t) => [14 + 72 * t, 90 - 78 * t];
  const ts = [0.3, 0.545, 0.79];
  const order = [2, 1, 0]; // bottom → top: green, white, pink (eaten from the top)
  let defs = '<defs>';
  cols.forEach((c, i) => {
    defs += `<radialGradient id="d${i}" cx=".36" cy=".32" r=".78"><stop offset="0" stop-color="${c[0]}"/><stop offset=".62" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></radialGradient>`;
  });
  defs += '</defs>';
  let s = defs;
  s += `<path d="M14 90L86 12" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`;
  s += `<path d="M14 90L86 12" stroke="#dcaa62" stroke-width="4.6" stroke-linecap="round"/>`;
  for (let k = 0; k < n; k++) {
    const [x, y] = P(ts[k]);
    const ci = order[k];
    s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="16" fill="url(#d${ci})" stroke="${INK}" stroke-width="4"/>`;
    s += `<ellipse cx="${n2(x - 5.5)}" cy="${n2(y - 6)}" rx="5" ry="3.2" fill="#fff" opacity=".8" transform="rotate(-40 ${n2(x - 5.5)} ${n2(y - 6)})"/>`;
  }
  return wrap(100, 100, s);
}

function darumaIcon() {
  return wrap(100, 100,
    `<defs><radialGradient id="r" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#ff8a62"/><stop offset=".55" stop-color="${PAL.shu}"/><stop offset="1" stop-color="#8e1f0c"/></radialGradient></defs>` +
    `<path d="M50 7C77 7 91 28 91 54C91 80 75 94 50 94C25 94 9 80 9 54C9 28 23 7 50 7Z" fill="url(#r)" stroke="${INK}" stroke-width="4"/>` +
    `<path d="M50 23C67 23 75 35 75 48C75 62 65 69 50 69C35 69 25 62 25 48C25 35 33 23 50 23Z" fill="#fdf3e1" stroke="${INK}" stroke-width="3"/>` +
    `<g stroke="${INK}" stroke-linecap="round" fill="none"><path d="M30 37Q38 28 46 36" stroke-width="4.5"/><path d="M54 36Q62 28 70 37" stroke-width="4.5"/>` +
    `<path d="M39 58Q44 62 50 59Q56 62 61 58" stroke-width="3"/></g>` +
    `<circle cx="39" cy="46" r="6.2" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="39.5" cy="46.5" r="3.4" fill="${INK}"/>` +
    `<circle cx="61" cy="46" r="6.2" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="60.5" cy="46.5" r="3.4" fill="${INK}"/>` +
    `<g stroke="#f6cd62" stroke-linecap="round" fill="none"><path d="M28 80Q50 71 72 80" stroke-width="4.2"/><path d="M35 87Q50 82 65 87" stroke-width="3.2"/></g>` +
    `<ellipse cx="28" cy="27" rx="8" ry="4.5" fill="#fff" opacity=".5" transform="rotate(-38 28 27)"/>`);
}

function shurikenIcon() {
  const cx = 50, cy = 50, R = 46, ri = 12, rot = 18;
  const P = (rho, deg) => {
    const a = ((deg + rot) * Math.PI) / 180;
    return `${n2(cx + rho * Math.cos(a))} ${n2(cy + rho * Math.sin(a))}`;
  };
  let light = '', dark = '', outline = '';
  for (let k = 0; k < 4; k++) {
    const t = k * 90;
    light += `<path d="M${cx} ${cy}L${P(ri, t - 45)}L${P(R, t)}Z"/>`;
    dark += `<path d="M${cx} ${cy}L${P(R, t)}L${P(ri, t + 45)}Z"/>`;
    outline += `${k ? 'L' : 'M'}${P(R, t)}L${P(ri, t + 45)}`;
  }
  return wrap(100, 100,
    `<path d="${outline}Z" fill="none" stroke="#1b1f26" stroke-width="7" stroke-linejoin="round"/>` +
    `<g fill="#eef2f6">${light}</g><g fill="#7d8896">${dark}</g>` +
    `<path d="${outline}Z" fill="none" stroke="#1b1f26" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle cx="50" cy="50" r="8.5" fill="#39414d" stroke="#1b1f26" stroke-width="3"/><circle cx="50" cy="50" r="3.6" fill="#141820"/>`);
}

function makibishiIcon() {
  // scattered caltrops (撒菱): each has four iron spikes around a round knot; drawn back-to-front
  const caltrop = (cx, cy, k, rot) => {
    const R = (x, y) => {
      const a = (rot * Math.PI) / 180;
      return [cx + (x * Math.cos(a) - y * Math.sin(a)) * k, cy + (x * Math.sin(a) + y * Math.cos(a)) * k];
    };
    const c = R(0, 0);
    const spike = (tx, ty, w) => {
      const tip = R(tx, ty);
      const dx = tip[0] - c[0], dy = tip[1] - c[1];
      const L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * w * k, ny = (dx / L) * w * k;
      const a = `${n2(c[0] + nx)} ${n2(c[1] + ny)}`, b = `${n2(c[0] - nx)} ${n2(c[1] - ny)}`;
      const t = `${n2(tip[0])} ${n2(tip[1])}`;
      return `<path d="M${a}L${t}L${b}Z" fill="#3a3f49" stroke="${INK}" stroke-width="${n2(3.2 * Math.max(0.7, k))}" stroke-linejoin="round"/>` +
        `<path d="M${a}L${t}L${n2(c[0])} ${n2(c[1])}Z" fill="#9aa3b0"/>`;
    };
    return `<ellipse cx="${n2(c[0])}" cy="${n2(cy + 30 * k)}" rx="${n2(30 * k)}" ry="${n2(5 * k)}" fill="${INK}" opacity=".22"/>` +
      spike(-26, -30, 8) + spike(30, -18, 8) + spike(0, -44, 8.5) + spike(-30, 22, 8) + spike(28, 26, 8) +
      `<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${n2(9 * k)}" fill="#59606c" stroke="${INK}" stroke-width="${n2(3.2 * Math.max(0.7, k))}"/>` +
      `<circle cx="${n2(c[0] - 3 * k)}" cy="${n2(c[1] - 3 * k)}" r="${n2(3.2 * k)}" fill="#c3cad4"/>`;
  };
  return wrap(100, 100, caltrop(76, 30, 0.56, 20) + caltrop(19, 70, 0.46, -15) + caltrop(50, 58, 0.98, 0));
}

function manekinekoIcon() {
  return wrap(100, 100,
    `<defs><clipPath id="h"><circle cx="52" cy="40" r="23"/></clipPath></defs>` +
    // body + belly koban
    `<path d="M28 58C22 76 26 94 52 94C78 94 82 76 76 58Z" fill="#fffaf1" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<ellipse cx="52" cy="80" rx="8.5" ry="10.5" fill="#f3c55a" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M47.5 76L56.5 76M47 80L57 80M47.5 84L56.5 84" stroke="#b5821f" stroke-width="1.4"/>` +
    // raised paw (beckoning)
    `<path d="M30 62C20 54 17 42 20 30" stroke="${INK}" stroke-width="14" stroke-linecap="round" fill="none"/>` +
    `<path d="M30 62C20 54 17 42 20 30" stroke="#fffaf1" stroke-width="7.5" stroke-linecap="round" fill="none"/>` +
    `<circle cx="20" cy="25" r="8.5" fill="#fffaf1" stroke="${INK}" stroke-width="3.2"/>` +
    `<path d="M16 22L16 26M20 20L20 25M24 22L24 26" stroke="#f08aa6" stroke-width="1.8" stroke-linecap="round"/>` +
    // ears
    `<path d="M33 30L33 9L49 21Z" fill="#fffaf1" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>` +
    `<path d="M71 30L71 9L55 21Z" fill="#f29a3a" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>` +
    `<path d="M36 25L36 15L44 21Z" fill="#f7a8bb"/>` +
    // head + calico patches
    `<circle cx="52" cy="40" r="23" fill="#fffaf1"/>` +
    `<g clip-path="url(#h)"><path d="M56 14C72 14 80 26 78 36C68 35 60 28 56 14Z" fill="#f29a3a"/><path d="M28 30C34 26 40 26 42 18C34 16 28 22 28 30Z" fill="#3b3330"/></g>` +
    `<circle cx="52" cy="40" r="23" fill="none" stroke="${INK}" stroke-width="3.5"/>` +
    // face
    `<g stroke="${INK}" stroke-linecap="round" fill="none"><path d="M40 40Q44 35 48 40" stroke-width="3"/><path d="M56 40Q60 35 64 40" stroke-width="3"/>` +
    `<path d="M47 50Q49.5 53 52 50Q54.5 53 57 50" stroke-width="2"/>` +
    `<path d="M33 45L42 46M33 50L42 49M62 46L71 45M62 49L71 50" stroke-width="1.6"/></g>` +
    `<path d="M50 45.5L54 45.5L52 48Z" fill="#f07a9a" stroke="#f07a9a" stroke-width="1" stroke-linejoin="round"/>` +
    // collar + bell
    `<path d="M32 60Q52 70 72 60" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/>` +
    `<path d="M32 60Q52 70 72 60" stroke="${PAL.shu}" stroke-width="5.5" fill="none" stroke-linecap="round"/>` +
    `<circle cx="52" cy="67" r="5.5" fill="#f6cd62" stroke="${INK}" stroke-width="2.5"/><path d="M49 67L55 67" stroke="${INK}" stroke-width="1.5"/>`);
}

function kanedaraiIcon() {
  return wrap(100, 100,
    `<defs><linearGradient id="m" x1="0" x2="1"><stop offset="0" stop-color="#8a6118"/><stop offset=".22" stop-color="#fbe7a4"/>` +
    `<stop offset=".5" stop-color="#d9a93a"/><stop offset=".78" stop-color="#fdf0bf"/><stop offset="1" stop-color="#8a6118"/></linearGradient>` +
    `<linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e4c12"/><stop offset="1" stop-color="#d1a445"/></linearGradient></defs>` +
    `<g stroke="${INK}" stroke-width="3.2" stroke-linecap="round"><path d="M14 16L22 26"/><path d="M50 6L50 18"/><path d="M86 16L78 26"/></g>` +
    `<path d="M9 44L21 80C23 87 30 90 50 90C70 90 77 87 79 80L91 44Z" fill="url(#m)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M19 60Q50 71 81 60" stroke="#fff6cf" stroke-width="2.4" fill="none" opacity=".8"/>` +
    `<path d="M22 72Q50 81 78 72" stroke="#7a5512" stroke-width="2" fill="none" opacity=".55"/>` +
    `<ellipse cx="50" cy="44" rx="42" ry="13" fill="url(#m)" stroke="${INK}" stroke-width="4"/>` +
    `<ellipse cx="50" cy="44.5" rx="34.5" ry="8.6" fill="url(#i)"/>` +
    `<ellipse cx="38" cy="42" rx="10" ry="2.4" fill="#fff" opacity=".35"/>`);
}

export function kobanIcon() {
  let lines = '';
  for (let y = 18; y <= 82; y += 5.2) lines += `<path d="M20 ${n2(y)}L80 ${n2(y)}"/>`;
  return wrap(100, 100,
    `<defs><radialGradient id="g" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#f6cc4e"/><stop offset="1" stop-color="#b87916"/></radialGradient>` +
    `<clipPath id="c"><ellipse cx="50" cy="50" rx="24" ry="37"/></clipPath></defs>` +
    `<g transform="rotate(-16 50 50)">` +
    `<ellipse cx="50" cy="50" rx="31" ry="45" fill="url(#g)" stroke="${INK}" stroke-width="4"/>` +
    `<ellipse cx="50" cy="50" rx="24.5" ry="37.5" fill="none" stroke="#a4700f" stroke-width="2"/>` +
    `<g clip-path="url(#c)" stroke="#c9922a" stroke-width="1.6" opacity=".75">${lines}</g>` +
    `<rect x="42" y="32" width="16" height="22" rx="3" fill="#e8b23e" stroke="#8a5a0c" stroke-width="2"/>` +
    `<path d="M46 37L54 37M46 42L54 42M46 47L54 47" stroke="#6e460a" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="50" cy="22" r="4" fill="none" stroke="#8a5a0c" stroke-width="2"/><circle cx="50" cy="78" r="4" fill="none" stroke="#8a5a0c" stroke-width="2"/>` +
    `<ellipse cx="38" cy="28" rx="7" ry="11" fill="#fff" opacity=".4" transform="rotate(20 38 28)"/></g>`);
}

const ITEM_BUILDERS = {
  dango3: () => dangoIcon(3),
  dango2: () => dangoIcon(2),
  dango1: () => dangoIcon(1),
  daruma: darumaIcon,
  shuriken: shurikenIcon,
  makibishi: makibishiIcon,
  manekineko: manekinekoIcon,
  kanedarai: kanedaraiIcon,
  koban: kobanIcon,
};
export const ITEM_KEYS = Object.keys(ITEM_BUILDERS);
const itemCache = new Map();
/** Data URI of a built-in item icon (or null for unknown keys). */
export function itemIconUri(key) {
  if (!ITEM_BUILDERS[key]) return null;
  if (!itemCache.has(key)) itemCache.set(key, dataUri(ITEM_BUILDERS[key]()));
  return itemCache.get(key);
}

// ---------------------------------------------------------------------------------------------
// Course emblems (round medallions)
// ---------------------------------------------------------------------------------------------

function sakuraFlower(cx, cy, s, fill, edge) {
  let p = '';
  for (let k = 0; k < 5; k++) {
    p += `<path transform="translate(${cx} ${cy}) rotate(${k * 72}) scale(${s})" d="M0 0C-15 -8 -17 -29 -6.5 -38L0 -32.5L6.5 -38C17 -29 15 -8 0 0Z" fill="${fill}" stroke="${edge}" stroke-width="${n2(2 / s)}" stroke-linejoin="round"/>`;
  }
  p += `<circle cx="${cx}" cy="${cy}" r="${n2(5 * s)}" fill="#f6cd62" stroke="${edge}" stroke-width="1.2"/>`;
  return p;
}

export function courseEmblem(id, colors = ['#e0b04a', '#d8401f']) {
  const frame = `<circle cx="50" cy="50" r="46" fill="none" stroke="${INK}" stroke-width="4"/>` +
    `<circle cx="50" cy="50" r="41" fill="none" stroke="#fff" stroke-width="1.5" opacity=".55"/>`;
  const clip = `<clipPath id="c"><circle cx="50" cy="50" r="46"/></clipPath>`;
  if (id === 'inaka') {
    return wrap(100, 100,
      `<defs>${clip}<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd36e"/><stop offset=".55" stop-color="#ff8f45"/><stop offset="1" stop-color="#e0582c"/></linearGradient></defs>` +
      `<g clip-path="url(#c)"><rect width="100" height="100" fill="url(#s)"/>` +
      `<circle cx="42" cy="60" r="17" fill="#fff0c2"/><circle cx="42" cy="60" r="23" fill="#fff0c2" opacity=".25"/>` +
      `<path d="M0 62Q18 50 36 58T72 55T100 58V100H0Z" fill="#9b4a33" opacity=".75"/>` +
      `<path d="M0 68L100 64V100H0Z" fill="#6f8a2a"/>` +
      `<g stroke="#e8c85a" stroke-width="2.6" opacity=".9"><path d="M0 75L100 71"/><path d="M0 84L100 80"/><path d="M0 94L100 90"/></g>` +
      `<g stroke="#4f6a1c" stroke-width="1.6"><path d="M20 66L20 100"/><path d="M50 65L50 100"/><path d="M80 64L80 100"/></g>` +
      `<g transform="translate(70 30) rotate(-18)" fill="#8f2412"><path d="M-14 0L16 0" stroke="#8f2412" stroke-width="3.2" stroke-linecap="round"/>` +
      `<ellipse cx="-3" cy="-6" rx="3" ry="9" transform="rotate(-18 -3 -6)" opacity=".75"/><ellipse cx="3" cy="-6" rx="3" ry="9" transform="rotate(18 3 -6)" opacity=".75"/>` +
      `<ellipse cx="-3" cy="6" rx="3" ry="9" transform="rotate(18 -3 6)" opacity=".75"/><ellipse cx="3" cy="6" rx="3" ry="9" transform="rotate(-18 3 6)" opacity=".75"/>` +
      `<circle cx="-15" cy="0" r="3"/></g></g>` + frame);
  }
  if (id === 'sakura') {
    return wrap(100, 100,
      `<defs>${clip}<radialGradient id="s" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fff4f7"/><stop offset=".6" stop-color="#ffc4d3"/><stop offset="1" stop-color="#e9869f"/></radialGradient></defs>` +
      `<g clip-path="url(#c)"><rect width="100" height="100" fill="url(#s)"/>` +
      `<g fill="${PAL.shu}" stroke="${INK}" stroke-width="2"><path d="M18 86L82 86L80 81L20 81Z"/><rect x="28" y="86" width="5" height="20"/><rect x="67" y="86" width="5" height="20"/><rect x="22" y="92" width="56" height="4"/></g>` +
      sakuraFlower(50, 46, 0.95, '#fff6f9', '#d9738e') +
      sakuraFlower(20, 24, 0.35, '#ffe0e8', '#d9738e') + sakuraFlower(82, 30, 0.3, '#ffe0e8', '#d9738e') +
      `</g>` + frame);
  }
  if (id === 'matsuri') {
    let rays = '';
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      rays += `<path d="M${n2(66 + Math.cos(a) * 7)} ${n2(28 + Math.sin(a) * 7)}L${n2(66 + Math.cos(a) * 20)} ${n2(28 + Math.sin(a) * 20)}"/>`;
    }
    return wrap(100, 100,
      `<defs>${clip}<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2552"/><stop offset="1" stop-color="#3b2a6b"/></linearGradient>` +
      `<radialGradient id="l" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffb07a"/><stop offset=".5" stop-color="#e8431f"/><stop offset="1" stop-color="#8e1f0c"/></radialGradient></defs>` +
      `<g clip-path="url(#c)"><rect width="100" height="100" fill="url(#s)"/>` +
      `<g stroke="#ffd36e" stroke-width="2.4" stroke-linecap="round">${rays}</g><circle cx="66" cy="28" r="3" fill="#fff3c4"/>` +
      `<g stroke="#ff8fb0" stroke-width="1.8" stroke-linecap="round" opacity=".8"><path d="M22 20L22 26M19 23L25 23"/><path d="M86 58L86 62M84 60L88 60"/></g>` +
      `<path d="M40 30L40 38" stroke="${INK}" stroke-width="3"/>` +
      `<rect x="31" y="36" width="18" height="6" rx="2" fill="#2b2624" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="40" cy="62" rx="21" ry="23" fill="url(#l)" stroke="${INK}" stroke-width="3"/>` +
      `<g stroke="#7a1a0a" stroke-width="1.6" fill="none" opacity=".8"><path d="M20 55Q40 50 60 55"/><path d="M19.5 62Q40 57 60.5 62"/><path d="M20 69Q40 64 60 69"/></g>` +
      `<rect x="31" y="82" width="18" height="6" rx="2" fill="#2b2624" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M40 88L40 96" stroke="#f6cd62" stroke-width="3"/>` +
      `<ellipse cx="33" cy="52" rx="5" ry="8" fill="#fff" opacity=".35"/></g>` + frame);
  }
  const [a, b] = colors;
  return wrap(100, 100,
    `<defs>${clip}<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<g clip-path="url(#c)"><rect width="100" height="100" fill="url(#s)"/></g>` + frame);
}
