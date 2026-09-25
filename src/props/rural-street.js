// Rural street furniture & small props.
import {
  THREE, V3, PI, lerp, clamp, getMat, mat, canvasTexture, rng,
  Bag, box, cbox, rbox, timber, cyl, barBetween, rodBetween, gridGeo, sweep, rectProfile, circleProfile,
  xf, boxUV, uvScale, merge, alignY, blobGeo, colorByHeight, tint, noise3, taperTube,
  FONT_MIN, FONT_GOTH, FONT_MARU, roundRect, fitText,
} from './rural-kit.js';
import { cableGeometry } from './util.js';
import { kawaraMat } from './rural-houses.js';

const lathe = (pts, seg = 16, phiStart = 0, phiLen = PI * 2) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLen);

// ---------------------------------------------------------------------------
// 4. 電柱 (concrete utility pole) + wire span
// ---------------------------------------------------------------------------
function poleAdTex(seed) {
  const k = seed % 3;
  return canvasTexture(`rural.tex.poleAd${k}`, 128, 512, (g, w, h) => {
    const bg = ['#f4d23c', '#f7f4ea', '#3c7fc4'][k];
    const fg = ['#1f1f22', '#b42424', '#ffffff'][k];
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lines = [['たぬき医院', 'この先 300m'], ['ぽんぽこ米店', '右へ 50m'], ['きつね歯科', '次の角 左']][k];
    // vertical text
    g.font = `bold 58px ${FONT_GOTH}`;
    const t = lines[0];
    for (let i = 0; i < t.length; i++) g.fillText(t[i], w / 2, 50 + i * 62);
    g.fillRect(12, h - 118, w - 24, 4);
    g.font = `bold 26px ${FONT_GOTH}`;
    const t2 = lines[1];
    g.fillText(t2, w / 2, h - 80);
    g.font = `bold 22px ${FONT_GOTH}`;
    g.fillText('☎ 0120-00-0000', w / 2, h - 40);
  });
}

/**
 * Concrete telephone/electric pole (≈9.5 m). Wires run along local X; crossarms span local Z.
 * userData.wireAnchors: [upper -Z, upper +Z, lower +Z, comm cable] (local positions).
 */
export function createUtilityPole(opts = {}) {
  const { seed = 1, transformer = false } = opts;
  const r = rng(seed * 97 + 5);
  const bag = new Bag();
  const M = {
    concrete: getMat('concrete'), steel: getMat('metalDark'), porcelain: mat('rural.porcelain', { color: 0xf1efe8, roughness: 0.25 }),
    ad: mat(`rural.poleAd${seed % 3}`, { color: 0xffffff, roughness: 0.6, map: poleAdTex(seed) }),
    gray: getMat('metal'), cable: mat('rural.cable', { color: 0x2a2a2d, roughness: 0.65 }),
  };
  const H = 9.5 + (r() - 0.5) * 0.4;
  const pole = cyl(0.095, 0.165, H, 16, false, 1, 1);
  pole.translate(0, H / 2, 0);
  bag.add(pole, M.concrete);
  // top cap
  bag.add(xf(cyl(0.1, 0.1, 0.06, 16, false), [0, H + 0.03, 0]), M.steel, false);
  // pole-wrapped sign (電柱広告)
  if (r() < 0.75) {
    const part = new THREE.CylinderGeometry(0.162, 0.166, 1.6, 12, 1, true, -PI * 0.45, PI * 0.9);
    part.translate(0, 2.1, 0);
    bag.add(part, M.ad, false);
  }
  // step bolts
  for (let i = 0; i < 12; i++) {
    const y = 2.6 + i * 0.45;
    const s = i % 2 ? 1 : -1;
    const rad = lerp(0.165, 0.095, y / H);
    bag.add(rodBetween(V3(s * rad * 0.7, y, 0), V3(s * (rad + 0.2), y, 0), 0.012, 0.012, 5, true), M.steel, false);
  }
  const anchors = [];
  const crossarm = (y, half, ins) => {
    bag.add(xf(box(0.08, 0.08, half * 2 + 0.1), [0, y, 0.0]), M.steel);
    bag.add(xf(box(0.04, 0.02, half * 2 + 0.1), [0, y + 0.05, -0.02]), M.steel, false);
    // braces
    for (const s of [-1, 1]) bag.add(barBetween(V3(0, y - 0.55, 0), V3(0, y - 0.02, s * half * 0.62), 0.03, 0.012, V3(1, 0, 0), 0), M.steel, false);
    // insulators (stacked porcelain)
    for (const z of ins) {
      const pts = [[0.001, 0], [0.035, 0], [0.04, 0.03], [0.075, 0.06], [0.07, 0.085], [0.045, 0.1], [0.07, 0.13], [0.065, 0.155], [0.04, 0.17], [0.03, 0.2], [0.001, 0.205]];
      const g = lathe(pts, 10);
      g.translate(0, y + 0.04, z);
      bag.add(g, M.porcelain, false);
      bag.add(xf(cyl(0.012, 0.012, 0.06, 5, true), [0, y + 0.03, z]), M.steel, false);
      anchors.push(V3(0, y + 0.23, z));
    }
  };
  crossarm(H - 0.35, 0.85, [-0.72, 0.72]);
  crossarm(H - 1.25, 0.65, [0.55]);
  // communication cable bracket (lower)
  const cy = H - 3.9;
  bag.add(xf(box(0.06, 0.06, 0.45), [0, cy, 0.2]), M.steel, false);
  bag.add(xf(cyl(0.05, 0.05, 0.14, 8), [0, cy - 0.06, 0.4]), M.steel, false);
  anchors.push(V3(0, cy - 0.1, 0.4));
  // number plate
  bag.add(xf(box(0.14, 0.26, 0.012), [0, 1.7, 0.168]), M.porcelain, false);

  if (transformer) {
    const ty = H - 2.7;
    const tz = -0.5;
    const tank = cyl(0.26, 0.26, 0.78, 16, false);
    tank.translate(0, ty, tz);
    bag.add(tank, M.gray);
    const lid = lathe([[0.001, -0.02], [0.28, -0.02], [0.28, 0.0], [0.22, 0.04], [0.1, 0.075], [0.001, 0.08]], 16);
    lid.translate(0, ty + 0.4, tz);
    bag.add(lid, M.gray);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + PI / 8;
      if (Math.cos(a) > 0.6) continue;
      bag.add(xf(box(0.02, 0.6, 0.09), [Math.cos(a) * 0.29 * 0 + Math.sin(a) * 0.29, ty - 0.02, tz + Math.cos(a) * 0.29], [0, a, 0]), M.gray, false);
    }
    for (const bx of [-0.12, 0, 0.12]) {
      const b = lathe([[0.001, 0], [0.035, 0], [0.045, 0.04], [0.03, 0.05], [0.045, 0.09], [0.03, 0.1], [0.02, 0.16], [0.001, 0.16]], 8);
      b.translate(bx, ty + 0.46, tz - 0.05);
      bag.add(b, M.porcelain, false);
    }
    // mounting bands
    for (const dy of [-0.22, 0.22]) bag.add(xf(box(0.08, 0.06, 0.36), [0, ty + dy, -0.2]), M.steel, false);
    // drop wires to the top line
    for (const bx of [-0.12, 0.12]) {
      const a = V3(bx, ty + 0.62, tz - 0.05);
      const b = V3(0, H - 0.12, bx < 0 ? -0.72 : 0.72);
      bag.add(cableGeometry(a, b, 0.25, 0.01, 8), M.cable, false);
    }
  }
  const group = bag.build();
  group.name = 'UtilityPole';
  group.userData.wireAnchors = anchors;
  group.userData.collider = { type: 'circle', r: 0.2 };
  return group;
}

/** Thin dark cable between two world points (geometry is in the given coordinates). */
export function createWireSpan(aWorld, bWorld, opts = {}) {
  const { sag = 0.6, radius = 0.016 } = opts;
  const a = aWorld instanceof THREE.Vector3 ? aWorld : V3(...(aWorld || [0, 8, 0]));
  const b = bWorld instanceof THREE.Vector3 ? bWorld : V3(...(bWorld || [30, 8, 0]));
  const g = new THREE.Group();
  const m = new THREE.Mesh(cableGeometry(a, b, sag, radius, 20), mat('rural.cable', { color: 0x2a2a2d, roughness: 0.65 }));
  m.castShadow = false;
  m.receiveShadow = false;
  g.add(m);
  g.name = 'WireSpan';
  return g;
}

// ---------------------------------------------------------------------------
// 11. ガードレール (W-beam)
// ---------------------------------------------------------------------------
export function createGuardrail(opts = {}) {
  const { length = 8 } = opts;
  const bag = new Bag();
  const white = mat('rural.guardWhite', { color: 0xf0f0ea, roughness: 0.38, metalness: 0.15 });
  const dark = getMat('metalDark');
  const refl = mat('rural.reflector', { color: 0xffa21e, emissive: 0xff7a00, emissiveIntensity: 0.35, roughness: 0.3 });
  const yC = 0.62; // rail center height
  const zF = 0.14; // rail back plane (toward +Z from posts)
  // W profile (x = depth toward +Z, y = height), thin closed sheet
  const front = [], back = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = (t - 0.5) * 0.31;
    const d = 0.0415 * (1 - Math.cos(2 * PI * ((y + 0.155) / 0.155)));
    const lip = t < 0.06 || t > 0.94 ? -0.012 : 0;
    front.push([d + lip, y]);
    back.push([d + lip - 0.0045, y]);
  }
  const prof = [...front, ...back.reverse()];
  const L = length / 2;
  // path along X with curled ends (袖) bending back to -Z
  const path = [];
  const endR = 0.3;
  for (let i = 0; i <= 3; i++) { const a = (i / 3) * (PI / 2); path.push(V3(-L - Math.sin(a) * endR * 0.35 + 0.0, 0, -endR + Math.cos(a) * endR)); }
  path.reverse();
  path.push(V3(-L + 0.15, 0, 0));
  path.push(V3(L - 0.15, 0, 0));
  for (let i = 0; i <= 3; i++) { const a = (i / 3) * (PI / 2); path.push(V3(L + Math.sin(a) * endR * 0.35, 0, -endR + Math.cos(a) * endR)); }
  // sweep: profile x = side (horizontal perpendicular to path), y = up
  const pathW = path.map((p) => V3(p.x, yC, p.z + zF));
  // the side vector for a path along +X is (0,0,-1) with up (0,1,0): flip x to point to +Z
  const rail = sweep(pathW, prof, { closed: true, uvFn: (p, i, j, ua, va) => [va * 0.5, ua] });
  bag.add(rail, white);
  // posts every 2 m
  const n = Math.max(1, Math.round(length / 2));
  for (let i = 0; i <= n; i++) {
    const x = -L + (i * length) / n;
    const xx = clamp(x, -L + 0.1, L - 0.1);
    bag.add(xf(cyl(0.07, 0.07, 1.0, 10, false), [xx, 0.5, 0]), white);
    bag.add(xf(cyl(0.075, 0.072, 0.03, 10, true), [xx, 0.985, 0]), white, false);
    // spacer bracket
    bag.add(xf(cbox(0.1, 0.24, zF + 0.02, 0.01), [xx, yC, zF / 2 - 0.01]), white, false);
    bag.add(xf(cyl(0.014, 0.014, 0.03, 6, false), [xx, yC, zF + 0.075], [PI / 2, 0, 0]), dark, false);
    if (i % 2 === 0) bag.add(xf(cyl(0.05, 0.05, 0.02, 10, false), [xx, yC + 0.2, zF + 0.05], [PI / 2, 0, 0]), refl, false);
  }
  const group = bag.build();
  group.name = 'Guardrail';
  group.userData.collider = { type: 'box', w: length + 0.3, d: 0.4 };
  return group;
}

// ---------------------------------------------------------------------------
// 7. 自動販売機
// ---------------------------------------------------------------------------
function drinkDisplayTex() {
  return canvasTexture('rural.tex.vmDisplay', 512, 512, (g, w, h) => {
    const r = rng(8080);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#dfe6ea');
    bg.addColorStop(1, '#c4ccd2');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const drinks = [
      { c: '#2f8a3e', b: '#e8f3dc', t: '緑茶', k: 'pet' }, { c: '#5a3a22', b: '#e9d7b8', t: '珈琲', k: 'can' },
      { c: '#e0762a', b: '#fff1d6', t: 'みかん', k: 'can' }, { c: '#3ea0d8', b: '#ffffff', t: 'サイダー', k: 'can' },
      { c: '#f2f6fb', b: '#2f78c8', t: '天然水', k: 'pet' }, { c: '#2c5fae', b: '#e9f1fb', t: 'スポーツ', k: 'pet' },
      { c: '#c9a36b', b: '#fff8ea', t: 'ミルクティー', k: 'can' }, { c: '#1b1b1d', b: '#c8a255', t: 'ブラック', k: 'can' },
      { c: '#f3cf36', b: '#ffffff', t: 'コーン', k: 'can' }, { c: '#8a2233', b: '#f7d9df', t: 'いちご', k: 'pet' },
      { c: '#6bb04a', b: '#ffffff', t: 'ほうじ茶', k: 'pet' }, { c: '#e33b2e', b: '#ffffff', t: 'エナジー', k: 'bottle' },
    ];
    const rows = 3, cols = 8;
    const top = 22, rowH = (h - top - 10) / rows;
    // header
    g.fillStyle = '#2f5fae';
    g.fillRect(0, 0, w, top - 4);
    g.fillStyle = '#ffffff';
    g.font = `bold 15px ${FONT_MARU}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('つめた〜い', w * 0.3, top / 2 - 2);
    g.fillStyle = '#d8383a';
    g.fillRect(w * 0.62, 0, w * 0.38, top - 4);
    g.fillStyle = '#ffffff';
    g.fillText('あったか〜い', w * 0.81, top / 2 - 2);
    for (let row = 0; row < rows; row++) {
      const y0 = top + row * rowH;
      // shelf back glow
      const sh = g.createLinearGradient(0, y0, 0, y0 + rowH);
      sh.addColorStop(0, 'rgba(255,255,255,0.0)');
      sh.addColorStop(0.75, 'rgba(210,220,230,0.5)');
      sh.addColorStop(1, 'rgba(120,130,140,0.9)');
      g.fillStyle = sh;
      g.fillRect(0, y0, w, rowH);
      for (let c = 0; c < cols; c++) {
        const d = drinks[(row * 5 + c * 3 + Math.floor(r() * 2)) % drinks.length];
        const cw = w / cols;
        const cx = c * cw + cw / 2;
        const itemH = rowH * 0.62;
        const iy = y0 + rowH * 0.06;
        g.save();
        if (d.k === 'can') {
          const iw = cw * 0.56;
          g.fillStyle = d.c;
          roundRect(g, cx - iw / 2, iy + itemH * 0.18, iw, itemH * 0.82, 6);
          g.fill();
          g.fillStyle = d.b;
          g.fillRect(cx - iw / 2, iy + itemH * 0.45, iw, itemH * 0.22);
          g.fillStyle = '#c9ccd0';
          g.fillRect(cx - iw / 2 + 2, iy + itemH * 0.14, iw - 4, itemH * 0.06);
        } else {
          const iw = d.k === 'bottle' ? cw * 0.4 : cw * 0.54;
          g.fillStyle = d.k === 'pet' ? 'rgba(200,225,235,0.9)' : d.c;
          roundRect(g, cx - iw / 2, iy + itemH * 0.22, iw, itemH * 0.78, 8);
          g.fill();
          g.beginPath();
          g.moveTo(cx - iw / 2, iy + itemH * 0.3);
          g.quadraticCurveTo(cx - iw * 0.2, iy + itemH * 0.05, cx - iw * 0.18, iy + itemH * 0.02);
          g.lineTo(cx + iw * 0.18, iy + itemH * 0.02);
          g.quadraticCurveTo(cx + iw * 0.2, iy + itemH * 0.05, cx + iw / 2, iy + itemH * 0.3);
          g.fill();
          g.fillStyle = d.k === 'pet' ? d.c : '#f4d23c';
          g.fillRect(cx - iw * 0.18, iy - itemH * 0.04, iw * 0.36, itemH * 0.08);
          g.fillStyle = d.k === 'pet' ? d.b : '#ffffff';
          g.fillRect(cx - iw / 2, iy + itemH * 0.45, iw, itemH * 0.3);
          if (d.k === 'pet') { g.fillStyle = d.c; g.fillRect(cx - iw / 2, iy + itemH * 0.48, iw, itemH * 0.24); }
        }
        // label text
        g.fillStyle = d.k === 'pet' ? '#ffffff' : (d.b === '#ffffff' ? '#222' : '#222');
        g.font = `bold 11px ${FONT_GOTH}`;
        fitText(g, d.t, cx, iy + itemH * 0.59, cw * 0.55, 11, FONT_GOTH);
        g.restore();
        // price + button
        const hot = c >= 6 && row === 1;
        g.fillStyle = hot ? '#d8383a' : '#2f5fae';
        g.fillRect(cx - cw * 0.42, y0 + rowH * 0.7, cw * 0.84, rowH * 0.11);
        g.fillStyle = '#ffffff';
        g.font = `bold 13px ${FONT_GOTH}`;
        g.fillText(String([120, 130, 150, 160][(row + c) % 4]), cx, y0 + rowH * 0.755);
        g.fillStyle = '#1a1c1f';
        roundRect(g, cx - cw * 0.3, y0 + rowH * 0.84, cw * 0.6, rowH * 0.1, 4);
        g.fill();
        g.fillStyle = hot ? '#ff7a6a' : '#6fd0ff';
        roundRect(g, cx - cw * 0.22, y0 + rowH * 0.86, cw * 0.44, rowH * 0.06, 3);
        g.fill();
      }
    }
  });
}

export function createVendingMachine(opts = {}) {
  const { seed = 1, lit = true } = opts;
  const r = rng(seed * 313 + 1);
  const variants = [
    ['rural.vmRed', 0xc62a2a], ['rural.vmWhite', 0xeeeeea], ['rural.vmBlue', 0x2a5cb4], ['rural.vmGreen', 0x2f8a4a],
  ];
  const [vk, vc] = variants[Math.floor(r() * variants.length) % variants.length];
  const bag = new Bag();
  const M = {
    body: mat(vk, { color: vc, roughness: 0.32, metalness: 0.1 }),
    disp: lit
      ? mat('rural.vmDisplayLit', { color: 0x7a7a7a, map: drinkDisplayTex(), emissive: 0xffffff, emissiveMap: drinkDisplayTex(), emissiveIntensity: 1.0, roughness: 0.25 })
      : mat('rural.vmDisplay', { color: 0xffffff, map: drinkDisplayTex(), roughness: 0.3 }),
    dark: mat('rural.vmPanel', { color: 0x26282c, roughness: 0.45, metalness: 0.3 }),
    silver: getMat('metal'),
    glow: lit ? mat('rural.vmGlowGreen', { color: 0x7dffa0, emissive: 0x3aff6a, emissiveIntensity: 1.3 }) : mat('rural.vmLedOff', { color: 0x2f4a36, roughness: 0.4 }),
    white: getMat('paintWhite'),
  };
  const W = 1.0, H = 1.85, D = 0.8;
  const zf = D / 2;
  bag.add(xf(rbox(W, H - 0.06, D, 0.035, 2), [0, (H - 0.06) / 2 + 0.06, 0]), M.body);
  bag.add(xf(box(W - 0.04, 0.06, D - 0.04), [0, 0.03, 0]), M.dark);
  // top header band (white) with slight overhang
  bag.add(xf(rbox(W + 0.02, 0.12, D + 0.02, 0.03, 1), [0, H - 0.06, 0]), M.white);
  // display window + bezel
  const dw = 0.88, dh = 0.86, dy = 1.3;
  bag.add(xf(cbox(dw + 0.07, dh + 0.07, 0.03, 0.012), [0, dy, zf + 0.005]), M.dark);
  const disp = new THREE.PlaneGeometry(dw, dh);
  disp.translate(0, dy, zf + 0.022);
  bag.add(disp, M.disp, false);
  // glass sheen strip (top edge)
  bag.add(xf(box(dw + 0.07, 0.02, 0.05), [0, dy + dh / 2 + 0.035, zf + 0.02]), M.silver, false);
  // control panel (right)
  bag.add(xf(cbox(0.3, 0.3, 0.03, 0.01), [0.28, 0.7, zf + 0.012]), M.silver);
  bag.add(xf(box(0.018, 0.07, 0.02), [0.2, 0.74, zf + 0.03]), M.dark, false); // coin slot
  bag.add(xf(box(0.14, 0.05, 0.02), [0.32, 0.64, zf + 0.03]), M.dark, false); // bill slot
  bag.add(xf(box(0.12, 0.012, 0.022), [0.32, 0.63, zf + 0.032]), M.glow, false);
  bag.add(xf(box(0.1, 0.035, 0.02), [0.32, 0.79, zf + 0.03]), M.glow, false); // LED display
  bag.add(xf(cyl(0.022, 0.022, 0.03, 10), [0.2, 0.62, zf + 0.03], [PI / 2, 0, 0]), getMat('paintRed'), false);
  // coin return cup
  bag.add(xf(cbox(0.12, 0.08, 0.05, 0.01), [0.3, 0.46, zf + 0.02]), M.dark, false);
  // left panel graphic (vertical white stripe)
  bag.add(xf(box(0.08, 0.6, 0.012), [-0.36, 0.62, zf + 0.004]), M.white, false);
  // pickup door (取出口)
  bag.add(xf(cbox(0.78, 0.3, 0.04, 0.012), [0, 0.26, zf + 0.005]), M.silver);
  bag.add(xf(box(0.7, 0.22, 0.02), [0, 0.26, zf + 0.022], [-0.12, 0, 0]), M.dark, false);
  // side vents / feet
  for (const sx of [-1, 1]) bag.add(xf(box(0.012, 0.28, 0.4), [sx * (W / 2 + 0.004), 0.3, 0]), M.dark, false);
  const group = bag.build();
  group.name = 'VendingMachine';
  group.userData.collider = { type: 'box', w: W + 0.1, d: D + 0.1 };
  return group;
}

// ---------------------------------------------------------------------------
// 8. バス停 (rural bus stop)
// ---------------------------------------------------------------------------
function busAtlasTex(name) {
  return canvasTexture(`rural.tex.busAtlas.${name}`, 512, 512, (g) => {
    // --- round sign in [0,256]x[0,256]
    const cx = 128, cy = 128;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#1d7a4c';
    g.beginPath(); g.arc(cx, cy, 124, 0, PI * 2); g.fill();
    g.fillStyle = '#fbfaf5';
    g.beginPath(); g.arc(cx, cy, 108, 0, PI * 2); g.fill();
    g.fillStyle = '#1d7a4c';
    g.fillRect(22, 98, 212, 64);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#1d7a4c';
    g.font = `bold 24px ${FONT_GOTH}`;
    g.fillText('ぽんぽこバス', cx, 62);
    g.fillStyle = '#ffffff';
    fitText(g, name, cx, 131, 196, 46, FONT_GOTH);
    g.fillStyle = '#c62a2a';
    g.font = `bold 34px ${FONT_GOTH}`;
    g.fillText('バス停', cx, 196);
    // --- timetable in [256,512]x[0,384]
    const tx = 256;
    g.fillStyle = '#fbfbf7';
    g.fillRect(tx, 0, 256, 384);
    g.fillStyle = '#2f5fae';
    g.fillRect(tx, 0, 256, 56);
    g.fillStyle = '#ffffff';
    g.font = `bold 22px ${FONT_GOTH}`;
    g.fillText('時刻表', tx + 128, 18);
    g.font = `bold 16px ${FONT_GOTH}`;
    fitText(g, `${name}  駅方面`, tx + 128, 42, 230, 16, FONT_GOTH);
    const times = [['6', '52'], ['7', '15  48'], ['8', '30'], ['9', ''], ['10', '05'], ['12', '10'], ['14', '20'], ['16', '35'], ['17', '40'], ['18', '55'], ['20', '10']];
    g.font = `bold 17px ${FONT_GOTH}`;
    times.forEach(([hh, mm], i) => {
      const y = 72 + i * 28;
      g.fillStyle = i % 2 ? '#eef2f8' : '#ffffff';
      g.fillRect(tx + 6, y - 13, 244, 26);
      g.fillStyle = '#2f5fae';
      g.fillRect(tx + 6, y - 13, 44, 26);
      g.fillStyle = '#ffffff';
      g.fillText(hh, tx + 28, y);
      g.fillStyle = '#222';
      g.textAlign = 'left';
      g.fillText(mm, tx + 62, y);
      g.textAlign = 'center';
    });
    g.strokeStyle = '#2f5fae';
    g.lineWidth = 4;
    g.strokeRect(tx + 2, 2, 252, 380);
    // --- posters in [0,256]x[256,512]
    g.fillStyle = '#f3e3c8';
    g.fillRect(0, 256, 128, 256);
    g.fillStyle = '#b8322a';
    g.font = `bold 30px ${FONT_MIN}`;
    ['夏', '祭', 'り'].forEach((ch, i) => g.fillText(ch, 40, 300 + i * 40));
    g.font = `bold 15px ${FONT_GOTH}`;
    g.fillStyle = '#333';
    g.fillText('八月十五日', 90, 310);
    g.fillText('ぽんぽこ神社', 88, 470);
    g.fillStyle = '#e5873a';
    g.beginPath(); g.arc(90, 400, 26, 0, PI * 2); g.fill();
    g.fillStyle = '#dfeef2';
    g.fillRect(128, 256, 128, 256);
    g.fillStyle = '#1f6d9a';
    g.font = `bold 26px ${FONT_GOTH}`;
    ['交', '通', '安', '全'].forEach((ch, i) => g.fillText(ch, 192, 300 + i * 34));
    g.fillStyle = '#e0b92e';
    g.fillRect(140, 450, 104, 34);
    g.fillStyle = '#333';
    g.font = `bold 14px ${FONT_GOTH}`;
    g.fillText('とびだし注意', 192, 467);
    // --- corrugated tin rust streaks in [256,512]x[384,512]
    g.fillStyle = '#9a5a40';
    g.fillRect(256, 384, 256, 128);
    const r = rng(77);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '60,30,20' : '190,120,80'},${0.1 + r() * 0.25})`;
      g.fillRect(256 + r() * 256, 384 + r() * 40, 2 + r() * 5, 30 + r() * 90);
    }
  });
}

export function createBusStop(opts = {}) {
  const { seed = 1, name = 'たんぼ前' } = opts;
  const r = rng(seed * 59 + 3);
  const bag = new Bag();
  const atlas = busAtlasTex(name);
  const M = {
    post: getMat('woodDark'), plank: getMat('woodAged'), seat: getMat('wood'),
    tin: r() < 0.6
      ? mat('rural.tin', { color: 0xffffff, map: atlas, roughness: 0.55, metalness: 0.25 })
      : mat('rural.tinBlue', { color: 0x7fa6c8, map: atlas, roughness: 0.55, metalness: 0.25 }),
    sign: mat(`rural.busSign.${name}`, { color: 0xffffff, map: atlas, roughness: 0.4 }),
    pole: getMat('paintWhite'), concrete: getMat('concrete'), steel: getMat('metalDark'),
  };
  // atlas regions -> UV remap helpers
  const setUV = (geo, u0, v0, u1, v1) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
    return geo;
  };
  const W = 2.6, D = 1.4, Hf = 2.35, Hb = 2.05;
  // posts
  for (const sx of [-1, 1]) {
    bag.add(xf(timber(Hf, 0.11, 0.11), [sx * (W / 2 - 0.06), Hf / 2, D / 2 - 0.06]), M.post);
    bag.add(xf(timber(Hb, 0.11, 0.11), [sx * (W / 2 - 0.06), Hb / 2, -D / 2 + 0.06]), M.post);
  }
  // back wall planks + side walls (half)
  for (let i = 0; i < 11; i++) {
    const x = -W / 2 + 0.12 + i * ((W - 0.24) / 10);
    bag.add(xf(timber(Hb - 0.1, 0.235, 0.03, 'y', 0.006), [x, (Hb - 0.1) / 2 + 0.05, -D / 2 + 0.02]), M.plank);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = -D / 2 + 0.2 + i * 0.22;
      const top = lerp(Hb, Hf, (z + D / 2) / D) - 0.35;
      bag.add(xf(timber(top - 0.05, 0.03, 0.21, 'y', 0.006), [sx * (W / 2 - 0.03), top / 2 + 0.03, z]), M.plank);
    }
  }
  // beams
  bag.add(xf(timber(W, 0.12, 0.1, 'x'), [0, Hf - 0.06, D / 2 - 0.06]), M.post);
  bag.add(xf(timber(W, 0.12, 0.1, 'x'), [0, Hb - 0.06, -D / 2 + 0.06]), M.post);
  for (const sx of [-1, 1]) bag.add(barBetween(V3(sx * (W / 2 - 0.06), Hb - 0.02, -D / 2), V3(sx * (W / 2 - 0.06), Hf - 0.02, D / 2), 0.08, 0.1), M.post);
  // corrugated tin roof (lean-to, sloping to the back)
  const ov = 0.3;
  const rows = [];
  const nW = 26;
  for (const f of [0, 1]) {
    const z = lerp(D / 2 + ov, -D / 2 - ov * 0.7, f);
    const y = lerp(Hf + 0.05, Hb + 0.02, (z - D / 2 - ov) / (-D - ov * 1.7)) ;
    const row = [];
    for (let i = 0; i <= nW * 4; i++) {
      const x = -W / 2 - 0.2 + (i / (nW * 4)) * (W + 0.4);
      row.push(V3(x, y + 0.025 * Math.sin((i / 4) * PI * 2), z));
    }
    rows.push(row);
  }
  const top = gridGeo(rows, { awayDir: V3(0, 1, 0), uvFn: (p) => [0.75 + (p.x / (W + 0.4)) * 0.48, 0.02 + (p.z + D) / (D * 3) * 0.23] });
  bag.add(top, M.tin);
  const under = gridGeo(rows.map((rw) => rw.map((p) => V3(p.x, p.y - 0.004, p.z))), { awayDir: V3(0, -1, 0), uvFn: (p) => [0.75 + (p.x / (W + 0.4)) * 0.48, 0.02 + (p.z + D) / (D * 3) * 0.23] });
  bag.add(under, M.tin);
  // bench
  bag.add(xf(timber(W - 0.4, 0.05, 0.36, 'x', 0.008), [0, 0.45, -D / 2 + 0.3]), M.seat);
  for (const sx of [-1, 0, 1]) bag.add(xf(box(0.06, 0.42, 0.3), [sx * (W / 2 - 0.35), 0.21, -D / 2 + 0.3]), M.post, false);
  bag.add(xf(timber(W - 0.4, 0.18, 0.03, 'x', 0.006), [0, 0.78, -D / 2 + 0.07]), M.seat, false);
  // posters on the back wall (inside)
  const poster = setUV(new THREE.PlaneGeometry(0.9, 0.9), 0, 0, 0.5, 0.5);
  poster.translate(-0.3, 1.45, -D / 2 + 0.042);
  bag.add(poster, M.sign, false);
  // concrete pad
  bag.add(xf(cbox(W + 0.3, 0.06, D + 0.4, 0.015, 1.5), [0, 0.03, 0.05]), M.concrete);

  // round sign on a pole with a weighted base
  const sxp = W / 2 + 0.55, szp = D / 2 + 0.25;
  const base = lathe([[0.001, 0], [0.3, 0], [0.3, 0.1], [0.24, 0.16], [0.05, 0.19], [0.001, 0.19]], 18);
  base.translate(sxp, 0, szp);
  bag.add(base, M.concrete);
  bag.add(xf(cyl(0.03, 0.03, 1.86, 10), [sxp, 0.19 + 0.93, szp]), M.pole);
  bag.add(xf(cbox(0.06, 0.1, 0.12, 0.01), [sxp, 2.02, szp]), M.steel, false);
  const disc = new THREE.CylinderGeometry(0.3, 0.3, 0.025, 28, 1, false);
  // map caps to the sign region (planar)
  const dp = disc.attributes.position, du = disc.attributes.uv, dn = disc.attributes.normal;
  for (let i = 0; i < dp.count; i++) {
    if (Math.abs(dn.getY(i)) > 0.5) {
      const s = dn.getY(i) > 0 ? 1 : -1;
      du.setXY(i, 0.25 + (s * dp.getZ(i)) / 0.6 * 0.5, 0.75 + dp.getX(i) / 0.6 * 0.5);
    } else du.setXY(i, 0.49, 0.98);
  }
  disc.rotateZ(PI / 2);
  disc.translate(sxp, 2.3, szp);
  bag.add(disc, M.sign);
  bag.add(xf(torusRing(0.305, 0.018, 28), [sxp, 2.3, szp], [0, PI / 2, 0]), M.pole, false);
  // timetable board (both faces)
  const tt = setUV(new THREE.PlaneGeometry(0.34, 0.51), 0.5, 0.25, 1.0, 1.0);
  const tt2 = tt.clone();
  tt.rotateY(PI / 2);
  tt.translate(sxp + 0.035, 1.45, szp);
  tt2.rotateY(-PI / 2);
  tt2.translate(sxp - 0.035, 1.45, szp);
  bag.add(tt, M.sign, false);
  bag.add(tt2, M.sign, false);
  bag.add(xf(box(0.05, 0.55, 0.38), [sxp, 1.45, szp]), M.steel, false);
  const group = bag.build();
  group.name = 'BusStop';
  group.userData.collider = { type: 'box', w: W + 1.4, d: D + 0.5 };
  return group;
}

function torusRing(R, r, seg) {
  const g = new THREE.TorusGeometry(R, r, 6, seg);
  return g;
}

// ---------------------------------------------------------------------------
// 9. お地蔵さん
// ---------------------------------------------------------------------------
function jizoFigure(bag, M, x, z, s, rot, rr, lo = false) {
  const parts = [];
  const q = (a, b) => (lo ? b : a);
  // body (robe): lathe
  const body = lathe([[0.001, 0], [0.19, 0], [0.2, 0.05], [0.19, 0.2], [0.175, 0.36], [0.16, 0.46], [0.13, 0.52], [0.075, 0.56], [0.06, 0.58], [0.001, 0.585]], q(12, 10));
  body.scale(1, 1, 0.82);
  parts.push([body, M.stone]);
  const head = new THREE.SphereGeometry(0.11, q(14, 11), q(10, 8));
  head.scale(1, 1.08, 1);
  head.translate(0, 0.66, 0.0);
  parts.push([head, M.face]);
  const nose = new THREE.SphereGeometry(0.018, q(6, 4), q(5, 3));
  nose.scale(0.9, 1.1, 0.8);
  nose.translate(0, 0.655, 0.105);
  parts.push([nose, M.stone]);
  // ears
  for (const sx of [-1, 1]) { const e = new THREE.SphereGeometry(0.03, q(6, 4), q(5, 3)); e.scale(0.6, 1.6, 1); e.translate(sx * 0.105, 0.64, 0); parts.push([e, M.stone]); }
  // hands together (gassho) and robe fold
  const hands = cbox(0.075, 0.1, 0.07, 0.02);
  hands.rotateX(-0.25);
  hands.translate(0, 0.31, 0.175);
  parts.push([hands, M.stone]);
  const sleeve = lathe([[0.001, 0], [0.07, 0], [0.085, 0.09], [0.001, 0.1]], 10);
  sleeve.scale(1.6, 1, 0.8);
  sleeve.translate(0, 0.22, 0.13);
  parts.push([sleeve, M.stone]);
  // jewel (宝珠) in the hands
  const jewel = new THREE.SphereGeometry(0.03, q(8, 5), q(6, 4));
  jewel.scale(1, 1.2, 1);
  jewel.translate(0, 0.37, 0.2);
  parts.push([jewel, M.stone]);
  // red bib: cone segment in front of the chest
  const bib = lathe([[0.075, 0.565], [0.12, 0.52], [0.175, 0.44], [0.205, 0.36]].map(([rr2, y]) => [rr2 + 0.012, y]).reverse(), 12, -PI * 0.55 + PI / 2 - PI / 2 + PI * 0.0, PI * 1.1);
  bib.rotateY(-PI * 0.05);
  bib.scale(1, 1, 0.9);
  parts.push([bib, M.red]);
  // knit cap
  const cap = new THREE.SphereGeometry(0.122, q(12, 10), q(5, 4), 0, PI * 2, 0, PI * 0.52);
  cap.translate(0, 0.675, 0);
  parts.push([cap, M.red]);
  const rim = new THREE.TorusGeometry(0.118, 0.022, q(5, 4), q(14, 10));
  rim.rotateX(PI / 2);
  rim.translate(0, 0.68, 0);
  parts.push([rim, M.red]);
  const pom = new THREE.SphereGeometry(0.035, q(8, 5), q(6, 4));
  pom.translate(0, 0.8, 0);
  parts.push([pom, M.red]);
  for (const [g, m] of parts) {
    g.scale(s, s, s);
    g.rotateY(rot);
    g.translate(x, 0.34, z);
    bag.add(g, m, m === M.red ? true : true);
  }
  void rr;
}

export function createJizo(opts = {}) {
  const { count = 1, seed = 1 } = opts;
  const r = rng(seed * 811 + 29);
  const bag = new Bag();
  const M = {
    stone: mat('rural.jizoStone', { color: 0xa8a69c, roughness: 0.95, map: jizoStoneTex() }),
    face: mat('rural.jizoFace', { color: 0xa8a69c, roughness: 0.95, map: jizoFaceTex() }),
    base: getMat('stonePlain'), red: getMat('fabricRed'), wood: getMat('woodAged'), dark: getMat('woodDark'),
    roof: getMat('kawaraPlain'), flower: mat('rural.flowerVC', { color: 0xffffff, roughness: 0.8, vertexColors: true }),
  };
  const n = Math.max(1, Math.floor(count));
  const sp = 0.52;
  const W = n * sp + 0.2;
  // base plinth
  bag.add(xf(cbox(W, 0.18, 0.62, 0.03, 1), [0, 0.09, 0]), M.base);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * sp;
    bag.add(xf(cbox(0.42, 0.16, 0.42, 0.03, 1), [x, 0.26, 0]), M.base);
    const s = 1 + (r() - 0.5) * 0.14;
    jizoFigure(bag, M, x, 0.0, s, (r() - 0.5) * 0.15, r, n > 2);
    // offering cup + flowers in front
    if (n === 1 || i % 2 === 0) {
      const cup = lathe([[0.001, 0], [0.03, 0], [0.04, 0.07], [0.036, 0.07], [0.001, 0.02]], 10);
      cup.translate(x + 0.14, 0.18, 0.22);
      bag.add(tint(cup, 0xf2f0ea), M.flower, false);
    }
  }
  // flower vase pair
  for (const sx of [-1, 1]) {
    const vx = sx * (W / 2 - 0.08);
    const vase = lathe([[0.001, 0], [0.045, 0], [0.055, 0.1], [0.035, 0.16], [0.045, 0.2], [0.001, 0.18]], 10);
    vase.translate(vx, 0.18, 0.2);
    bag.add(tint(vase, 0x7c7e7a), M.flower, false);
    const fc = [[0xd9b53a, 0xf0d870], [0x8a4aa8, 0xb07ad0], [0xe8e4dc, 0xffffff], [0xc0303a, 0xe06070]];
    for (let k = 0; k < 7; k++) {
      const [c0, c1] = fc[(k + (sx > 0 ? 1 : 0)) % fc.length];
      const f = blobGeo(0.026, { detail: 0, amp: 0.3, freq: 4, seed: k + 3, scale: [1, 0.7, 1] });
      colorByHeight(f, c0, c1, 0.08, k);
      const fx = vx + (r() - 0.5) * 0.11, fy = 0.43 + r() * 0.08, fz = 0.2 + (r() - 0.5) * 0.09;
      f.translate(fx, fy, fz);
      bag.add(f, M.flower, false);
      const st = rodBetween(V3(vx, 0.33, 0.2), V3(fx, fy - 0.01, fz), 0.004, 0.004, 3, true);
      bag.add(tint(st, 0x3f7a2c), M.flower, false);
      if (k % 2 === 0) {
        const lf = blobGeo(0.03, { detail: 0, amp: 0.2, seed: k + 9, scale: [0.5, 1.2, 0.25] });
        colorByHeight(lf, 0x2e5a26, 0x4f8a3a, 0.05, k);
        lf.rotateZ((r() - 0.5) * 1.2);
        lf.translate(lerp(vx, fx, 0.6), lerp(0.36, fy, 0.5), lerp(0.2, fz, 0.6));
        bag.add(lf, M.flower, false);
      }
    }
  }
  if (n > 1) {
    // small wooden shelter roof
    const H = 1.55, D = 0.9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      bag.add(xf(timber(H, 0.09, 0.09), [sx * (W / 2 + 0.05), H / 2, sz * (D / 2 - 0.05)]), M.wood);
    }
    bag.add(xf(timber(W + 0.2, 0.1, 0.1, 'x'), [0, H - 0.05, D / 2 - 0.05]), M.wood);
    bag.add(xf(timber(W + 0.2, 0.1, 0.1, 'x'), [0, H - 0.05, -D / 2 + 0.05]), M.wood);
    // gable roof: two slabs
    for (const sz of [-1, 1]) {
      const slab = cbox(W + 0.6, 0.06, 0.78, 0.015);
      slab.rotateX(sz * 0.42);
      slab.translate(0, H + 0.2, sz * 0.34);
      bag.add(slab, M.roof);
    }
    bag.add(xf(cyl(0.06, 0.06, W + 0.66, 10), [0, H + 0.36, 0], [0, 0, PI / 2]), M.roof);
    for (const sx of [-1, 1]) {
      // gable boards
      const tri = new THREE.BufferGeometry().setFromPoints([V3(0, H, D / 2 + 0.1), V3(0, H, -D / 2 - 0.1), V3(0, H + 0.36, 0)]);
      tri.computeVertexNormals();
      const t2 = tri.clone();
      tri.translate(sx * (W / 2 + 0.06), 0, 0);
      t2.rotateY(PI);
      t2.translate(sx * (W / 2 + 0.06), 0, 0);
      bag.add(boxUV(tri, 1), M.dark, false);
      bag.add(boxUV(t2, 1), M.dark, false);
    }
  }
  const group = bag.build();
  group.name = n > 1 ? 'RokuJizo' : 'Jizo';
  group.userData.collider = n > 1 ? { type: 'box', w: W + 0.3, d: 1.0 } : { type: 'circle', r: 0.4 };
  return group;
}

function jizoFaceTex() {
  return canvasTexture('rural.tex.jizoFace', 256, 128, (g, w, h) => {
    g.drawImage(jizoStoneTex().image, 0, 0, 128, 128);
    g.drawImage(jizoStoneTex().image, 128, 0, 128, 128);
    // gentle closed eyes + smile centred on u=0.25 (sphere front)
    const cx = w * 0.25, cy = h * 0.5 + 6;
    g.strokeStyle = 'rgba(55,52,45,0.85)';
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(cx + s * 11, cy - 4, 6, PI * 0.15, PI * 0.85); g.stroke();
      g.beginPath(); g.moveTo(cx + s * 17, cy - 15); g.quadraticCurveTo(cx + s * 11, cy - 19, cx + s * 5, cy - 16); g.stroke();
    }
    g.beginPath(); g.arc(cx, cy + 12, 6, PI * 0.2, PI * 0.8); g.stroke();
    // urna (白毫)
    g.fillStyle = 'rgba(60,55,50,0.6)';
    g.beginPath(); g.arc(cx, cy - 22, 1.8, 0, PI * 2); g.fill();
  });
}

function jizoStoneTex() {
  return canvasTexture('rural.tex.jizoStone', 128, 128, (g, w, h) => {
    const r = rng(12);
    g.fillStyle = '#c9c6bc';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const l = r();
      g.fillStyle = l < 0.5 ? `rgba(70,70,60,${r() * 0.18})` : `rgba(255,255,245,${r() * 0.15})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
    // lichen spots
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(${120 + r() * 40},${130 + r() * 30},${80 + r() * 20},0.14)`;
      g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 5, 0, PI * 2); g.fill();
    }
  });
}

// ---------------------------------------------------------------------------
// 21. 飛び出し坊や (plywood cut-out of a running kid)
// ---------------------------------------------------------------------------
const _contourCache = new Map();
function tobidashiTex() {
  const key = 'rural.tex.tobidashi';
  return canvasTexture(key, 256, 512, (g, w, h) => {
    const OUT = '#ffffff';
    const lineW = 16;
    // draw helper: every shape twice (white outline pass, then color)
    const shapes = [];
    const circle = (x, y, rad, col) => shapes.push({ t: 'c', x, y, rad, col });
    const limb = (pts, wdt, col) => shapes.push({ t: 'l', pts, wdt, col });
    const poly = (pts, col) => shapes.push({ t: 'p', pts, col });
    // legs (behind body)
    limb([[118, 330], [80, 385], [44, 420]], 30, '#f3c9a0'); // back leg thigh->shin
    limb([[150, 330], [196, 372], [182, 440]], 30, '#f3c9a0'); // front leg
    limb([[44, 420], [30, 428]], 30, '#ffffff'); // socks
    limb([[182, 440], [183, 452]], 30, '#ffffff');
    poly([[8, 418], [52, 408], [58, 440], [14, 446]], '#d7332c'); // back shoe
    poly([[160, 452], [214, 448], [218, 476], [158, 480]], '#d7332c'); // front shoe
    // shorts
    poly([[98, 300], [170, 300], [184, 346], [140, 354], [128, 336], [104, 352], [78, 342]], '#2a58b0');
    // back arm
    limb([[112, 212], [66, 250], [34, 222]], 26, '#d7332c');
    circle(30, 218, 17, '#f3c9a0');
    // torso (shirt)
    poly([[96, 196], [166, 190], [182, 300], [92, 308]], '#d7332c');
    // front arm
    limb([[160, 208], [206, 236], [236, 210]], 26, '#d7332c');
    circle(238, 204, 17, '#f3c9a0');
    // head
    circle(134, 118, 70, '#f6d3b1');
    // school cap
    shapes.push({ t: 'cap' });
    const drawShape = (s, outline) => {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      if (s.t === 'c') {
        g.beginPath(); g.arc(s.x, s.y, s.rad + (outline ? lineW / 2 : 0), 0, PI * 2);
        g.fillStyle = outline ? OUT : s.col; g.fill();
      } else if (s.t === 'l') {
        g.beginPath(); g.moveTo(s.pts[0][0], s.pts[0][1]);
        for (const p of s.pts.slice(1)) g.lineTo(p[0], p[1]);
        g.strokeStyle = outline ? OUT : s.col; g.lineWidth = s.wdt + (outline ? lineW : 0); g.stroke();
      } else if (s.t === 'p') {
        g.beginPath(); g.moveTo(s.pts[0][0], s.pts[0][1]);
        for (const p of s.pts.slice(1)) g.lineTo(p[0], p[1]);
        g.closePath();
        if (outline) { g.strokeStyle = OUT; g.lineWidth = lineW; g.stroke(); g.fillStyle = OUT; g.fill(); } else { g.fillStyle = s.col; g.fill(); }
      } else if (s.t === 'cap') {
        g.beginPath();
        g.arc(134, 100, 72 + (outline ? lineW / 2 : 0), PI * 1.02, PI * 1.98);
        g.closePath();
        g.fillStyle = outline ? OUT : '#f2c417'; g.fill();
        g.beginPath();
        g.ellipse(178, 96, 58 + (outline ? lineW / 2 : 0), 12 + (outline ? lineW / 2 : 0), -0.12, 0, PI * 2);
        g.fill();
      }
    };
    for (const s of shapes) drawShape(s, true);
    // text plate at the bottom (part of the cut-out)
    g.fillStyle = OUT;
    roundRect(g, 18, 470, 220, 40, 10);
    g.fill();
    for (const s of shapes) drawShape(s, false);
    // face details
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(146, 118, 17, 21, 0, 0, PI * 2); g.fill();
    g.beginPath(); g.ellipse(186, 116, 15, 20, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#1b1b1d';
    g.beginPath(); g.arc(153, 121, 9, 0, PI * 2); g.fill();
    g.beginPath(); g.arc(192, 119, 8, 0, PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#1b1b1d';
    g.beginPath(); g.moveTo(130, 92); g.lineTo(158, 88); g.stroke();
    g.beginPath(); g.moveTo(176, 88); g.lineTo(200, 92); g.stroke();
    g.fillStyle = '#a0282a';
    g.beginPath(); g.ellipse(170, 160, 16, 12, 0, 0, PI * 2); g.fill();
    g.fillStyle = 'rgba(240,120,110,0.55)';
    g.beginPath(); g.arc(122, 146, 12, 0, PI * 2); g.fill();
    g.fillStyle = '#1b1b1d';
    g.beginPath(); g.arc(90, 70, 14, PI * 0.9, PI * 1.9); g.fill();
    // hair tufts below cap
    g.beginPath(); g.moveTo(66, 106); g.lineTo(84, 96); g.lineTo(76, 124); g.fill();
    // shirt stripe + shorts line
    g.fillStyle = '#ffffff';
    g.fillRect(96, 240, 84, 10);
    // text
    g.fillStyle = '#d7332c';
    roundRect(g, 24, 476, 208, 28, 8);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `bold 22px ${FONT_GOTH}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('とびだし注意', 128, 491);
    // --- extract the silhouette contour from alpha before filling the background
    const img = g.getImageData(0, 0, w, h).data;
    const S = 2; // sample every 2 px
    const mw = w / S, mh = h / S;
    const mask = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) mask[y * mw + x] = img[((y * S) * w + x * S) * 4 + 3] > 100 ? 1 : 0;
    const pts = mooreTrace(mask, mw, mh).map(([x, y]) => [(x + 0.5) / mw, 1 - (y + 0.5) / mh]);
    _contourCache.set(key, rdp(pts, 0.004));
    // fill the background white so edge texels are not black
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = OUT;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  });
}

function mooreTrace(mask, W, H) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0);
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y)) { sx = x; sy = y; break outer; }
  if (sx < 0) return [];
  // clockwise neighbourhood starting west
  const D = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const out = [[sx, sy]];
  let px = sx, py = sy;
  let bdir = 0; // backtrack = west
  for (let iter = 0; iter < W * H * 4; iter++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (bdir + k) % 8;
      if (at(px + D[d][0], py + D[d][1])) { found = d; break; }
    }
    if (found < 0) break;
    const nx = px + D[found][0], ny = py + D[found][1];
    // new backtrack (direction from the new pixel to the last outside cell checked)
    bdir = (found + (found % 2 === 0 ? 6 : 5)) % 8;
    px = nx; py = ny;
    if (px === sx && py === sy) break;
    out.push([px, py]);
  }
  return out;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy || 1e-12;
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L, 0, 1);
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const rec = (s, e, out) => {
    let md = 0, mi = -1;
    for (let i = s + 1; i < e; i++) { const d = dist(pts[i], pts[s], pts[e]); if (d > md) { md = d; mi = i; } }
    if (md > eps) { rec(s, mi, out); rec(mi, e, out); } else out.push(pts[s]);
  };
  const out = [];
  rec(0, pts.length - 1, out);
  out.push(pts[pts.length - 1]);
  return out;
}

export function createTobidashiBoya(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 71 + 9);
  const tex = tobidashiTex();
  const contour = _contourCache.get('rural.tex.tobidashi');
  const bag = new Bag();
  const paint = mat('rural.tobidashi', { color: 0xffffff, map: tex, roughness: 0.55 });
  const edge = getMat('woodLight');
  const post = getMat('woodAged');
  const Wm = 0.62, Hm = 1.24;
  const shape = new THREE.Shape(contour.map(([x, y]) => new THREE.Vector2(x, y)));
  const ex = new THREE.ExtrudeGeometry(shape, { depth: 0.025 / Hm, bevelEnabled: false, curveSegments: 1 });
  // split caps (group 0) and walls (group 1)
  const caps = splitGroup(ex, 0), walls = splitGroup(ex, 1);
  for (const g of [caps, walls]) {
    g.scale(Wm, Hm, Hm);
    g.translate(-Wm / 2, 0.28, 0.02);
  }
  bag.add(caps, paint);
  bag.add(walls, edge);
  // stake behind
  bag.add(xf(timber(1.15, 0.06, 0.05), [0.02, 0.575, -0.01]), post);
  bag.add(xf(box(0.3, 0.05, 0.03), [0.02, 0.5, 0.005]), post, false);
  const group = bag.build();
  // old signs lean a little (deterministic per seed)
  const lean = (r() - 0.5) * 0.09, twist = (r() - 0.5) * 0.25;
  group.children.forEach((m) => { m.geometry.rotateZ(lean); m.geometry.rotateY(twist); });
  group.name = 'TobidashiBoya';
  group.userData.collider = { type: 'circle', r: 0.25 };
  return group;
}

function splitGroup(geo, gi) {
  const grp = geo.groups.find((g) => g.materialIndex === gi);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = geo.attributes[k];
    out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. かかし (scarecrow)
// ---------------------------------------------------------------------------
function scarecrowFaceTex() {
  return canvasTexture('rural.tex.henohenomoheji', 512, 256, (g, w, h) => {
    const r = rng(5);
    g.fillStyle = '#e9d6ae';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(120,100,70,${r() * 0.08})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // weave lines
    g.strokeStyle = 'rgba(140,120,90,0.12)';
    for (let x = 0; x < w; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    // へのへのもへじ face centred on u=0.25 (front)
    const cx = w * 0.25 - 14, cy = h * 0.5;
    g.fillStyle = '#1e1c1a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 46px ${FONT_MIN}`;
    g.fillText('へ', cx - 30, cy - 50);
    g.fillText('へ', cx + 26, cy - 50);
    g.font = `bold 44px ${FONT_MIN}`;
    g.fillText('の', cx - 30, cy - 12);
    g.fillText('の', cx + 26, cy - 12);
    g.font = `bold 48px ${FONT_MIN}`;
    g.fillText('も', cx - 2, cy + 28);
    g.font = `bold 46px ${FONT_MIN}`;
    g.fillText('へ', cx - 2, cy + 68);
    g.save();
    g.translate(cx + 74, cy + 16);
    g.scale(0.62, 1);
    g.font = `bold 118px ${FONT_MIN}`;
    g.fillText('じ', 0, 0);
    g.restore();
    // patch on the back
    g.fillStyle = '#b9a07a';
    g.fillRect(w * 0.7, h * 0.3, 70, 60);
    g.strokeStyle = 'rgba(60,40,20,0.6)';
    g.setLineDash([5, 4]);
    g.strokeRect(w * 0.7, h * 0.3, 70, 60);
  });
}

export function createScarecrow(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 19 + 3);
  const bag = new Bag();
  const kimonoCols = [['rural.kimonoIndigo', 0x2f4a7a], ['rural.kimonoGreen', 0x4f6e3a], ['rural.kimonoBrown', 0x7a4a2e]];
  const [kk, kc] = kimonoCols[Math.floor(r() * 3) % 3];
  const M = {
    wood: getMat('woodAged'), straw: getMat('straw'),
    kimono: mat(kk, { color: kc, roughness: 0.95, map: clothTex() }),
    patch: mat('rural.patchCloth', { color: 0xc4945a, roughness: 0.95, map: clothTex() }),
    face: mat('rural.scarecrowFace', { color: 0xffffff, roughness: 0.95, map: scarecrowFaceTex() }),
    collar: getMat('fabricWhite'),
    obi: getMat('fabricRed'),
  };
  M.rope = M.straw;
  const lean = (r() - 0.5) * 0.08;
  // pole & crossbar
  bag.add(xf(cyl(0.035, 0.045, 2.3, 8), [0, 1.15 - 0.15, 0]), M.wood);
  const yArm = 1.52;
  bag.add(xf(cyl(0.03, 0.03, 1.55, 8), [0, yArm, 0], [0, 0, PI / 2]), M.wood);
  // torso kimono (lathe, flattened)
  const torso = lathe([[0.001, 0.82], [0.26, 0.82], [0.24, 1.0], [0.22, 1.2], [0.22, 1.4], [0.2, 1.55], [0.13, 1.6], [0.001, 1.62]], 14);
  torso.scale(1, 1, 0.62);
  bag.add(torso, M.kimono);
  // collar (V overlap)
  for (const s of [-1, 1]) bag.add(barBetween(V3(s * 0.1, 1.6, 0.1), V3(-s * 0.012, 1.29, 0.145), 0.055, 0.018, V3(0, 0, 1), 0.004), M.collar, false);
  // obi
  const obi = cyl(0.235, 0.235, 0.12, 14, true);
  obi.scale(1, 1, 0.66);
  obi.translate(0, 1.22, 0);
  bag.add(obi, M.obi);
  // sleeves: big hanging tamoto from the crossbar
  for (const s of [-1, 1]) {
    const sl = rbox(0.5, 0.42, 0.14, 0.05, 2);
    sl.translate(s * 0.44, yArm - 0.14, 0);
    sl.rotateZ(s * 0.04);
    bag.add(sl, M.kimono);
    // straw tufts at the hands
    for (let k = 0; k < 4; k++) {
      const c = new THREE.ConeGeometry(0.035, 0.2, 5, 1, true);
      c.rotateZ(-s * (PI / 2) + (r() - 0.5) * 0.9);
      c.rotateX((r() - 0.5) * 0.8);
      c.translate(s * (0.72 + 0.06), yArm - 0.04 + (r() - 0.5) * 0.08, (r() - 0.5) * 0.08);
      bag.add(c, M.straw, false);
    }
    // patch
    bag.add(xf(box(0.14, 0.12, 0.02), [s * 0.38, yArm - 0.2, 0.08], [0, 0, 0.2 * s]), M.patch, false);
  }
  // patches on the torso
  bag.add(xf(box(0.12, 0.1, 0.02), [0.1, 0.98, 0.16], [0, 0, 0.1]), M.patch, false);
  bag.add(xf(box(0.09, 0.12, 0.02), [-0.12, 1.08, -0.15], [0, 0, -0.2]), M.patch, false);
  // straw sticking out below the hem
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2;
    const c = new THREE.ConeGeometry(0.03, 0.18, 4, 1, true);
    c.rotateX(PI);
    c.translate(Math.cos(a) * 0.18, 0.78, Math.sin(a) * 0.11);
    bag.add(c, M.straw, false);
  }
  // head: cloth sack with face
  const head = new THREE.SphereGeometry(0.17, 18, 12);
  head.scale(1, 1.1, 0.92);
  head.translate(0, 1.84, 0.01);
  bag.add(head, M.face);
  const neck = cyl(0.06, 0.08, 0.12, 8);
  neck.translate(0, 1.66, 0);
  bag.add(neck, M.rope, false);
  // sugegasa (conical straw hat) with thickness
  const hat = lathe([[0.001, 0.16], [0.04, 0.15], [0.2, 0.05], [0.34, -0.02], [0.375, -0.03], [0.37, -0.01], [0.22, 0.07], [0.04, 0.19], [0.001, 0.2]], 22);
  hat.rotateZ(lean * 2 + 0.08);
  hat.translate(0, 1.98, 0);
  bag.add(hat, M.straw);
  const group = bag.build();
  group.rotation.set(0, 0, 0);
  group.name = 'Scarecrow';
  group.userData.collider = { type: 'circle', r: 0.3 };
  return group;
}

function clothTex() {
  return canvasTexture('rural.tex.cloth', 128, 128, (g, w, h) => {
    const r = rng(3);
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(60,50,40,${r() * 0.12})`; g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 10, 0, PI * 2); g.fill(); }
  });
}

// ---------------------------------------------------------------------------
// 6. 稲架掛け (rice drying rack)
// ---------------------------------------------------------------------------
export function createHazakake(opts = {}) {
  const { length = 8, seed = 1 } = opts;
  const r = rng(seed * 1231 + 77);
  const bag = new Bag();
  const M = {
    pole: getMat('woodAged'), bar: mat('rural.bambooDry', { color: 0xb7a26a, roughness: 0.6 }),
    rice: mat('rural.riceVC', { color: 0xffffff, roughness: 0.95, map: riceTex(), vertexColors: true }),
    rope: getMat('rope'),
  };
  const L = length;
  const nPoles = Math.max(2, Math.round(L / 2) + 1);
  const H = 2.55;
  const bars = [0.95, 1.55, 2.15];
  for (let i = 0; i < nPoles; i++) {
    const x = -L / 2 + (i * L) / (nPoles - 1);
    bag.add(xf(cyl(0.045, 0.06, H + 0.3, 7), [x, (H + 0.3) / 2 - 0.15, 0], [(r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.04]), M.pole);
    for (const y of bars) bag.add(xf(cyl(0.065, 0.065, 0.06, 7, true), [x, y, 0]), M.rope, false);
  }
  // end braces
  for (const s of [-1, 1]) {
    const x = s * L / 2;
    bag.add(rodBetween(V3(x + s * 0.9, 0, 0.35), V3(x, H - 0.2, 0), 0.04, 0.035, 6), M.pole);
    bag.add(rodBetween(V3(x + s * 0.9, 0, -0.35), V3(x, H - 0.2, 0), 0.04, 0.035, 6), M.pole);
  }
  for (const y of bars) bag.add(xf(cyl(0.028, 0.028, L + 0.5, 7), [0, y + 0.03, 0], [0, 0, PI / 2]), M.bar);
  // sheaves: inverted-V bundles over each bar (tapered 5-sided prisms, open top)
  const sheafGeos = [];
  const straw = new THREE.Color(0xe7cf86), grain = new THREE.Color(0xc98f2c), tie = new THREE.Color(0x9c7a44);
  const NS = 5;
  const sheaf = (len, r0, r1, s) => {
    const pos = [], col = [], uv = [];
    const ring = (y, rad) => Array.from({ length: NS }, (_, k) => {
      const a = (k / NS) * PI * 2 + 0.3;
      return [Math.cos(a) * rad * 1.25, y, Math.sin(a) * rad * 0.7];
    });
    const top = ring(0, r0), bot = ring(-len, r1);
    const cOf = (t) => {
      const c = (t < 0.1 ? tie : straw).clone();
      if (s > 0 && t > 0.5) c.lerp(grain, clamp((t - 0.5) * 2.2, 0, 1));
      const j = 0.9 + r() * 0.2;
      return [c.r * j, c.g * j, c.b * j];
    };
    const push = (p, t, u) => { pos.push(p[0], p[1], p[2]); col.push(...cOf(t)); uv.push(u, p[1] * 1.6); };
    const band = (A, B, ta, tb) => {
      for (let k = 0; k < NS; k++) {
        const k2 = (k + 1) % NS;
        const u0 = k / NS, u1 = (k + 1) / NS;
        push(A[k], ta, u0); push(B[k], tb, u0); push(B[k2], tb, u1);
        push(A[k], ta, u0); push(B[k2], tb, u1); push(A[k2], ta, u1);
      }
    };
    band(top, bot, 0, 1);
    // bottom cap (cut ends)
    for (let k = 1; k < NS - 1; k++) { push(bot[0], 1, 0.5); push(bot[k + 1], 1, 0.6); push(bot[k], 1, 0.4); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  for (let bi = 0; bi < bars.length; bi++) {
    const y = bars[bi];
    const fill = bi === bars.length - 1 ? 0.7 + r() * 0.3 : 1;
    const x0 = -L / 2 + 0.12, x1 = x0 + (L - 0.24) * fill;
    for (let x = x0; x < x1; x += 0.16 + r() * 0.025) {
      for (const s of [-1, 1]) {
        const len = 0.52 + r() * 0.1;
        const g = sheaf(len, 0.035, 0.09 + r() * 0.02, s);
        g.rotateX(s * (0.3 + r() * 0.1));
        g.rotateY((r() - 0.5) * 0.35);
        g.rotateZ((r() - 0.5) * 0.12);
        g.translate(x, y + 0.05, s * 0.025);
        sheafGeos.push(g);
      }
    }
  }
  bag.add(merge(sheafGeos), M.rice);
  const group = bag.build();
  group.name = 'Hazakake';
  group.userData.collider = { type: 'box', w: L + 1.8, d: 0.9 };
  return group;
}

function riceTex() {
  return canvasTexture('rural.tex.riceStraw', 128, 128, (g, w, h) => {
    const r = rng(41);
    g.fillStyle = '#e8e0c8';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '120,95,50' : '255,245,210'},${0.15 + r() * 0.3})`;
      g.lineWidth = 0.6 + r();
      const x = r() * w, y = r() * h;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y + 10 + r() * 20); g.stroke();
    }
  });
}

// ---------------------------------------------------------------------------
// 20. 祠 (tiny roadside shrine)
// ---------------------------------------------------------------------------
export function createHokora(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 353 + 11);
  const bag = new Bag();
  const M = {
    stone: getMat('stone'), wood: getMat('woodAged'), dark: getMat('woodDark'),
    roof: r() < 0.65 ? mat('rural.copperRoof', { color: 0x5f9a86, roughness: 0.6, metalness: 0.35 }) : getMat('woodDark'),
    rope: getMat('rope'), paper: mat('rural.shide', { color: 0xf7f4ea, roughness: 0.8, side: THREE.DoubleSide }),
    white: getMat('paintWhite'), fruit: mat('rural.fruitVC', { color: 0xffffff, roughness: 0.5, vertexColors: true }),
  };
  // stone pedestal (2 tiers)
  bag.add(xf(cbox(1.0, 0.25, 0.85, 0.04, 1), [0, 0.125, 0]), M.stone);
  bag.add(xf(cbox(0.8, 0.35, 0.66, 0.035, 1), [0, 0.425, 0]), M.stone);
  const y0 = 0.6;
  // body
  const bw = 0.52, bh = 0.5, bd = 0.44;
  bag.add(xf(cbox(bw + 0.1, 0.05, bd + 0.16, 0.01), [0, y0 + 0.025, 0.03]), M.dark);
  bag.add(xf(box(bw, bh, bd, 0.6), [0, y0 + 0.05 + bh / 2, -0.02]), M.wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bag.add(xf(timber(bh, 0.05, 0.05), [sx * bw / 2, y0 + 0.05 + bh / 2, -0.02 + sz * bd / 2]), M.dark, false);
  // lattice doors
  const dz = bd / 2 - 0.02 + 0.005;
  bag.add(xf(box(bw - 0.08, bh - 0.08, 0.01), [0, y0 + 0.05 + bh / 2, dz]), M.dark, false);
  for (let i = 1; i < 6; i++) bag.add(xf(box(0.012, bh - 0.08, 0.015), [-bw / 2 + 0.04 + (i * (bw - 0.08)) / 6, y0 + 0.05 + bh / 2, dz + 0.01]), M.wood, false);
  for (let j = 1; j < 5; j++) bag.add(xf(box(bw - 0.08, 0.012, 0.015), [0, y0 + 0.09 + (j * (bh - 0.08)) / 5, dz + 0.01]), M.wood, false);
  // gable roof (curved copper)
  const yR = y0 + 0.05 + bh;
  const span = bd / 2 + 0.2, rise = 0.2, len = bw + 0.34;
  for (const sz of [-1, 1]) {
    const rows = [];
    for (let i = 0; i <= 4; i++) {
      const f = i / 4;
      const z = sz * span * (1 - f), y = yR + rise * f - 0.03 * Math.sin(f * PI) + 0.04;
      rows.push([V3(-len / 2, y, z), V3(len / 2, y, z)]);
    }
    const top = gridGeo(rows, { awayDir: V3(0, 1, sz) });
    const bot = gridGeo(rows.map((rw) => rw.map((p) => V3(p.x, p.y - 0.035, p.z))), { awayDir: V3(0, -1, 0) });
    bag.add(top, M.roof);
    bag.add(bot, M.roof);
    const edge = gridGeo([rows[0].map((p) => V3(p.x, p.y - 0.035, p.z)), rows[0]], { awayDir: V3(0, 0, sz) });
    bag.add(edge, M.roof);
    for (const sx of [-1, 1]) bag.add(gridGeo(rows.map((rw) => [V3(sx * len / 2, rw[0].y - 0.035, rw[0].z), V3(sx * len / 2, rw[0].y, rw[0].z)]), { awayDir: V3(sx, 0, 0) }), M.roof);
  }
  // ridge + katsuogi + chigi
  bag.add(xf(cyl(0.035, 0.035, len + 0.04, 8), [0, yR + rise + 0.045, 0], [0, 0, PI / 2]), M.roof);
  for (const x of [-0.14, 0, 0.14]) bag.add(xf(cyl(0.028, 0.028, 0.16, 8), [x, yR + rise + 0.085, 0], [PI / 2, 0, 0]), M.dark, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p0 = V3(sx * (len / 2 - 0.02), yR + rise - 0.02, sz * 0.02);
    const p1 = V3(sx * (len / 2 - 0.02), yR + rise + 0.2, -sz * 0.14);
    bag.add(barBetween(p0, p1, 0.018, 0.04, V3(1, 0, 0), 0.004), M.dark, false);
  }
  // gable triangles
  for (const sx of [-1, 1]) {
    const tri = new THREE.BufferGeometry().setFromPoints(sx > 0 ? [V3(0, yR, bd / 2), V3(0, yR, -bd / 2), V3(0, yR + rise, 0)] : [V3(0, yR, -bd / 2), V3(0, yR, bd / 2), V3(0, yR + rise, 0)]);
    tri.translate(sx * bw / 2, 0, -0.02);
    tri.computeVertexNormals();
    bag.add(boxUV(tri, 0.6), M.wood, false);
  }
  // shimenawa (sagging rope) + shide
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V3(lerp(-bw / 2 - 0.04, bw / 2 + 0.04, t), yR - 0.04 - 0.07 * Math.sin(t * PI), bd / 2 + 0.06)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  bag.add(taperTube(curve, 12, 6, (t) => 0.018 + 0.012 * Math.sin(t * PI)), M.rope, false);
  for (const t of [0.25, 0.5, 0.75]) {
    const p = curve.getPointAt(t);
    bag.add(shideGeo(p.x, p.y - 0.01, p.z + 0.012, 0.16, 0.05), M.paper, false);
  }
  // offerings: vases with sakaki, sake cup, mikan
  for (const sx of [-1, 1]) {
    const v = lathe([[0.001, 0], [0.025, 0], [0.03, 0.05], [0.018, 0.1], [0.024, 0.12], [0.001, 0.11]], 10);
    v.translate(sx * 0.2, y0 + 0.05, bd / 2 + 0.03);
    bag.add(v, M.white, false);
    const leaf = blobGeo(0.05, { detail: 0, amp: 0.25, seed: 5 + sx, scale: [0.8, 1.2, 0.8] });
    colorByHeight(leaf, 0x2f5a2a, 0x5c8f3a, 0.05, 3);
    leaf.translate(sx * 0.2, y0 + 0.23, bd / 2 + 0.03);
    bag.add(leaf, M.fruit, false);
  }
  const cup = lathe([[0.001, 0], [0.018, 0], [0.03, 0.025], [0.026, 0.026], [0.001, 0.008]], 10);
  cup.translate(-0.05, y0 + 0.05, bd / 2 + 0.05);
  bag.add(cup, M.white, false);
  const mikan = new THREE.SphereGeometry(0.035, 8, 6);
  mikan.scale(1, 0.85, 1);
  tint(mikan, 0xf08a20);
  mikan.translate(0.07, y0 + 0.085, bd / 2 + 0.05);
  bag.add(mikan, M.fruit, false);
  const group = bag.build();
  group.name = 'Hokora';
  group.userData.collider = { type: 'box', w: 1.05, d: 0.9 };
  return group;
}

/** Zigzag shide paper strip hanging from (x,y,z). */
function shideGeo(x, y, z, h, w) {
  const pos = [];
  const n = 4;
  const seg = h / n;
  for (let i = 0; i < n; i++) {
    const yT = y - i * seg, yB = yT - seg;
    const off = (i % 2 ? 1 : -1) * w * 0.25;
    const xa = x + off - w / 2, xb = x + off + w / 2;
    pos.push(xa, yT, z, xa, yB, z, xb, yB, z, xa, yT, z, xb, yB, z, xb, yT, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// 22. 井戸 (old well with pulley)
// ---------------------------------------------------------------------------
export function createIdo(opts = {}) {
  const { seed = 1 } = opts;
  const r = rng(seed * 263 + 41);
  const bag = new Bag();
  const M = {
    stone: mat('rural.wellStone', { color: 0xa9a79e, roughness: 0.95, map: jizoStoneTex() }),
    wood: getMat('woodAged'), dark: getMat('woodDark'), water: getMat('water'), rope: getMat('rope'),
    iron: getMat('metalDark'), roof: kawaraMat(), stoneDark: getMat('stoneDark'),
  };
  // stone well curb: ring of carved blocks (lathe with grooves)
  const ringPts = [[0.46, 0], [0.62, 0], [0.62, 0.34], [0.605, 0.36], [0.62, 0.38], [0.62, 0.72], [0.6, 0.76], [0.48, 0.76], [0.46, 0.74], [0.46, 0.0]];
  const ring = lathe(ringPts, 20);
  uvScale(ring, 3.5, 1.5);
  bag.add(ring, M.stone);
  // water surface
  const water = new THREE.CircleGeometry(0.46, 20);
  water.rotateX(-PI / 2);
  water.translate(0, 0.35, 0);
  bag.add(water, M.water, false);
  // lid boards (half cover)
  for (let i = 0; i < 3; i++) bag.add(xf(timber(1.3, 0.035, 0.2, 'x', 0.006), [0, 0.78, -0.42 + i * 0.21]), M.wood);
  bag.add(xf(timber(0.7, 0.04, 0.05, 'z', 0.006), [-0.4, 0.815, -0.26]), M.dark, false);
  bag.add(xf(timber(0.7, 0.04, 0.05, 'z', 0.006), [0.4, 0.815, -0.26]), M.dark, false);
  // frame posts + beam + small roof
  const H = 2.25;
  for (const sx of [-1, 1]) {
    bag.add(xf(timber(H, 0.1, 0.1), [sx * 0.78, H / 2, 0]), M.wood);
    bag.add(xf(cbox(0.2, 0.1, 0.2, 0.02), [sx * 0.78, 0.05, 0]), M.stone);
  }
  bag.add(xf(timber(1.9, 0.12, 0.12, 'x'), [0, H - 0.06, 0]), M.wood);
  bag.add(xf(timber(1.72, 0.08, 0.08, 'x'), [0, H - 0.5, 0]), M.dark);
  for (const sz of [-1, 1]) {
    const slab = cbox(2.1, 0.06, 0.62, 0.012, 1.2);
    slab.rotateX(sz * 0.5);
    slab.translate(0, H + 0.14, sz * 0.26);
    bag.add(slab, M.roof);
  }
  const ridgeTop = xf(cyl(0.06, 0.06, 2.14, 10), [0, H + 0.3, 0], [0, 0, PI / 2]);
  bag.add(ridgeTop, M.roof);
  for (const sx of [-1, 1]) {
    const tri = new THREE.BufferGeometry().setFromPoints([V3(0, H, 0.5), V3(0, H, -0.5), V3(0, H + 0.28, 0)]);
    tri.computeVertexNormals();
    const t2 = tri.clone();
    t2.rotateY(PI);
    tri.translate(sx * 0.8, 0, 0);
    t2.translate(sx * 0.8, 0, 0);
    bag.add(boxUV(tri, 1), M.dark, false);
    bag.add(boxUV(t2, 1), M.dark, false);
  }
  // pulley (滑車)
  const py = H - 0.3;
  const wheel = lathe([[0.03, -0.03], [0.11, -0.03], [0.11, -0.012], [0.09, 0], [0.11, 0.012], [0.11, 0.03], [0.03, 0.03]], 16);
  wheel.rotateZ(PI / 2);
  wheel.translate(0, py, 0);
  bag.add(wheel, M.wood, false);
  bag.add(xf(cbox(0.06, 0.25, 0.04, 0.01), [0.07, py + 0.1, 0]), M.iron, false);
  bag.add(xf(cbox(0.06, 0.25, 0.04, 0.01), [-0.07, py + 0.1, 0]), M.iron, false);
  // rope down into the well and to the bucket on the rim
  const bucketPos = V3(0.38 + r() * 0.05, 0.78, 0.25);
  const rope1 = new THREE.CatmullRomCurve3([V3(0, py + 0.1, 0.08), V3(0, py - 0.4, 0.1), V3(0, 0.9, 0.12), V3(0, 0.36, 0.12)]);
  bag.add(taperTube(rope1, 10, 5, () => 0.012), M.rope, false);
  const rope2 = new THREE.CatmullRomCurve3([V3(0, py + 0.1, -0.08), V3(0.1, py - 0.3, -0.06), V3(bucketPos.x * 0.7, 1.3, bucketPos.z * 0.5), V3(bucketPos.x, bucketPos.y + 0.36, bucketPos.z)]);
  bag.add(taperTube(rope2, 12, 5, () => 0.012), M.rope, false);
  // wooden bucket with iron hoops + handle
  const bucket = lathe([[0.001, 0.01], [0.12, 0.01], [0.125, 0.0], [0.135, 0.02], [0.155, 0.26], [0.145, 0.26], [0.125, 0.03], [0.001, 0.03]], 16);
  bucket.translate(bucketPos.x, bucketPos.y, bucketPos.z);
  bag.add(bucket, M.wood);
  for (const hy of [0.06, 0.21]) bag.add(xf(cyl(0.132 + hy * 0.09, 0.128 + hy * 0.09, 0.025, 16, true), [bucketPos.x, bucketPos.y + hy, bucketPos.z]), M.iron, false);
  const handle = new THREE.TorusGeometry(0.15, 0.012, 5, 12, PI);
  handle.translate(bucketPos.x, bucketPos.y + 0.26, bucketPos.z);
  bag.add(handle, M.wood, false);
  // flat stones around
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + r();
    const s = blobGeo(0.18 + r() * 0.1, { detail: 1, amp: 0.3, seed: i + 7, scale: [1.3, 0.3, 1], flatBottom: 0.5 });
    s.rotateY(r() * 3);
    s.translate(Math.cos(a) * (0.95 + r() * 0.15), -0.01, Math.sin(a) * (0.95 + r() * 0.15));
    bag.add(boxUV(s, 0.8), M.stoneDark);
  }
  const group = bag.build();
  group.name = 'Ido';
  group.userData.collider = { type: 'circle', r: 0.8 };
  return group;
}
