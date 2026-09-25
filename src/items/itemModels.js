// ぽんぽこカート — item models.
//
// ITEM_IDS = ['dango','daruma','shuriken','makibishi','manekineko','kanedarai','koban']
// createItemModel(id, opts) → THREE.Group   (origin at bottom center unless noted below)
//   dango      {count=3}  三色団子 skewer, ≈0.62 m tall (balls removed from the top as count drops)
//   daruma                red daruma, ≈0.8 m tall — origin at CENTER (it rolls)
//   shuriken              steel star, ≈0.7 m, flat in XZ — origin at CENTER
//   makibishi {icon}      4 iron caltrops + faint red ground glow (glow omitted with icon:true), ≈0.6 m
//   manekineko            lucky cat with raised left paw + koban, ≈0.8 m
//   kanedarai             金ダライ wash basin, ≈0.9 m Ø, 0.25 m tall — origin at CENTER OF THE RIM PLANE, opening DOWN
//   koban                 小判 gold oval coin standing upright facing +Z, ≈0.45 m — origin at CENTER
// createItemBox() → { group, update(dt, t), setOpacity(a), dispose() }
//   floating iridescent 福 box (≈1.1 m rounded glass cube), origin at the cube center. update() spins and
//   bobs an inner group (the engine keeps ownership of group.position).
// Preview helpers: createAllItemsLineup(), createItemBoxPreview().
// disposeItemResources() frees the shared caches (call when leaving the game).
//
// Geometry / materials / textures are cached and shared between instances (do not dispose them per item).
// The makibishi ground-glow disc is tagged userData.glow = true.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { superEllipsoid, lathe, smoothSeams, PartBuilder, heightToNormalCanvas } from '../kart/KartModel.js';

export const ITEM_IDS = ['dango', 'daruma', 'shuriken', 'makibishi', 'manekineko', 'kanedarai', 'koban'];

const TAU = Math.PI * 2;
const { clamp, lerp } = THREE.MathUtils;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const JP_SERIF = "'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif JP',serif";
const JP_BRUSH = "'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif JP',serif";

const matCache = new Map();
const geoCache = new Map();
const texCache = new Map();
function cm(key, make) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    m.name = 'item.' + key;
    matCache.set(key, m);
  }
  return m;
}
function cg(key, make) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
function canvasTex(key, w, h, draw, { linear = false, wrap = false } = {}) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h, c);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function centerText(g, text, cx, cy) {
  const m = g.measureText(text);
  const asc = m.actualBoundingBoxAscent || 0;
  const desc = m.actualBoundingBoxDescent || 0;
  const l = m.actualBoundingBoxLeft || 0;
  const r = m.actualBoundingBoxRight || 0;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillText(text, cx - (r - l) / 2 + (l - 0) * 0, cy + (asc - desc) / 2);
}

/** Cache merged geometry per key, then instantiate meshes (cheap) each call. */
function cachedModel(key, buildParts, mats, opts) {
  const merged = cg(key, () => buildParts().merge());
  const group = new THREE.Group();
  for (const [slot, geo] of merged) {
    const m = new THREE.Mesh(geo, mats()[slot]);
    m.castShadow = (opts?.cast ?? true) && !(opts?.noCast || []).includes(slot);
    m.receiveShadow = true;
    m.name = slot;
    group.add(m);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
const M = {
  gold: () => cm('gold', () => new THREE.MeshPhysicalMaterial({ color: 0xffc64a, metalness: 1, roughness: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.1 })),
  bamboo: () => cm('bamboo', () => new THREE.MeshStandardMaterial({ color: 0xd9bc7c, roughness: 0.55 })),
  ink: () => cm('ink', () => new THREE.MeshStandardMaterial({ color: 0x2a2022, roughness: 0.5 })),
  pinkNose: () => cm('pinkNose', () => new THREE.MeshPhysicalMaterial({ color: 0xf08aa0, roughness: 0.3, clearcoat: 1 })),
  red: () => cm('lacquerRed', () => new THREE.MeshPhysicalMaterial({ color: 0xd8262a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 })),
};

// ---------------------------------------------------------------------------
// 三色団子 dango
// ---------------------------------------------------------------------------
const DANGO_COLORS = [0x9fc766, 0xebe5d6, 0xf5a2b6]; // bottom → top: green, white, pink
function mochiMat(i) {
  return cm('mochi' + i, () => {
    const c = new THREE.Color(DANGO_COLORS[i]);
    return new THREE.MeshPhysicalMaterial({
      color: c, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35,
      sheen: 0.6, sheenRoughness: 0.4, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.6),
    });
  });
}
function createDango({ count = 3 } = {}) {
  count = clamp(Math.round(count), 0, 3);
  const g = new THREE.Group();
  const ball = cg('dangoBall', () => {
    const b = new THREE.SphereGeometry(0.086, 22, 15);
    b.scale(1, 0.9, 1);
    return b;
  });
  const stick = cg('dangoStick', () => {
    const P = new PartBuilder();
    P.add('bamboo', new THREE.CylinderGeometry(0.011, 0.012, 0.6, 8), [0, 0.3, 0]);
    P.add('bamboo', new THREE.ConeGeometry(0.011, 0.03, 8), [0, 0.615, 0]);
    P.add('bamboo', new THREE.CylinderGeometry(0.013, 0.013, 0.006, 8), [0, 0.07, 0]); // node
    return P.merge().get('bamboo');
  });
  const sm = new THREE.Mesh(stick, M.bamboo());
  sm.castShadow = true;
  g.add(sm);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(ball, mochiMat(i));
    m.position.y = 0.2 + i * 0.152;
    m.rotation.y = i * 1.3;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.userData.item = 'dango';
  return g;
}

// ---------------------------------------------------------------------------
// だるま daruma (origin at center)
// ---------------------------------------------------------------------------
function darumaTexture() {
  return canvasTex('daruma', 1024, 512, (g, w, h) => {
    // canvas x = around (u; u=0.5 is +Z front), canvas y = top(0) .. bottom(h)
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#e2342a');
    grd.addColorStop(0.6, '#d0251f');
    grd.addColorStop(1, '#a81b18');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const fx = w * 0.5;
    const fy = h * 0.31; // face center
    // gold decorations on the sides (swirls)
    g.strokeStyle = '#f2c65a';
    g.lineWidth = 9;
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      const cx = fx + side * w * 0.22;
      for (let k = 0; k < 3; k++) {
        const cy = h * (0.28 + k * 0.2);
        g.beginPath();
        for (let a = 0; a < TAU * 1.4; a += 0.1) {
          const r = 6 + a * 7.5;
          const x = cx + side * Math.cos(a + k) * r;
          const y = cy + Math.sin(a + k) * r * 0.9;
          if (a === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      // long gold lines framing the face
      g.beginPath();
      g.moveTo(fx + side * w * 0.14, h * 0.12);
      g.quadraticCurveTo(fx + side * w * 0.19, h * 0.45, fx + side * w * 0.13, h * 0.86);
      g.stroke();
    }
    // back: big 寿 in gold
    g.fillStyle = '#f2c65a';
    g.font = `bold 170px ${JP_SERIF}`;
    centerText(g, '寿', 0.0 * w + 2, h * 0.52);
    centerText(g, '寿', w - 2, h * 0.52);
    // face plate
    g.fillStyle = '#f7ecd6';
    g.beginPath();
    g.ellipse(fx, fy, w * 0.1, h * 0.19, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#e8c070';
    g.lineWidth = 6;
    g.stroke();
    // eyebrows (gentle crane-wing brows)
    g.strokeStyle = '#1f1a1c';
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(fx + s * 20, fy - h * 0.1);
      g.quadraticCurveTo(fx + s * 52, fy - h * 0.16, fx + s * 84, fy - h * 0.1);
      g.stroke();
    }
    // eyes: both filled (a completed wish)
    for (const s of [-1, 1]) {
      const ex = fx + s * 46;
      const ey = fy - h * 0.025;
      g.fillStyle = '#fbf8f0';
      g.beginPath();
      g.ellipse(ex, ey, 34, 33, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#1b1618';
      g.beginPath();
      g.ellipse(ex, ey + 2, 29, 29, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.arc(ex + 10, ey - 8, 8, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(ex - 9, ey + 12, 3.5, 0, TAU);
      g.fill();
    }
    // blush
    for (const s of [-1, 1]) {
      const gr = g.createRadialGradient(fx + s * 70, fy + h * 0.06, 2, fx + s * 70, fy + h * 0.06, 22);
      gr.addColorStop(0, 'rgba(255,120,130,0.8)');
      gr.addColorStop(1, 'rgba(255,120,130,0)');
      g.fillStyle = gr;
      g.fillRect(fx + s * 70 - 24, fy + h * 0.06 - 24, 48, 48);
    }
    // nose + cheerful open smile
    g.fillStyle = '#1f1a1c';
    g.beginPath();
    g.ellipse(fx, fy + h * 0.045, 6, 4.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#b8202a';
    g.beginPath();
    g.moveTo(fx - 22, fy + h * 0.08);
    g.quadraticCurveTo(fx, fy + h * 0.08 + 4, fx + 22, fy + h * 0.08);
    g.quadraticCurveTo(fx + 18, fy + h * 0.08 + 30, fx, fy + h * 0.08 + 31);
    g.quadraticCurveTo(fx - 18, fy + h * 0.08 + 30, fx - 22, fy + h * 0.08);
    g.fill();
    g.fillStyle = '#f07a86';
    g.beginPath();
    g.ellipse(fx, fy + h * 0.08 + 22, 11, 7, 0, 0, TAU);
    g.fill();
    // tiny whisker-like beard strokes at the sides (gold)
    g.strokeStyle = '#d9a842';
    g.lineWidth = 4;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        g.moveTo(fx + s * (40 + k * 10), fy + h * (0.1 + k * 0.03));
        g.quadraticCurveTo(fx + s * (58 + k * 10), fy + h * (0.11 + k * 0.03), fx + s * (70 + k * 8), fy + h * (0.085 + k * 0.03));
        g.stroke();
      }
    }
    // belly: gold ring + 福
    const by = h * 0.68;
    g.strokeStyle = '#f2c65a';
    g.lineWidth = 7;
    g.beginPath();
    g.ellipse(fx, by, 78, 70, 0, 0, TAU);
    g.stroke();
    g.font = `bold 118px ${JP_SERIF}`;
    g.lineWidth = 10;
    g.strokeStyle = '#7a1612';
    g.fillStyle = '#ffd36a';
    const m = g.measureText('福');
    const tx = fx - ((m.actualBoundingBoxRight || 0) - (m.actualBoundingBoxLeft || 0)) / 2;
    const ty = by + ((m.actualBoundingBoxAscent || 0) - (m.actualBoundingBoxDescent || 0)) / 2;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.strokeText('福', tx, ty);
    g.fillText('福', tx, ty);
  });
}
function darumaGeometry() {
  return cg('daruma', () => {
    // egg profile from bottom (y=-0.4) to top (y=+0.4)
    const prof = [];
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI;
      const y = -Math.cos(t) * 0.4;
      const bottomHeavy = 1 + 0.08 * Math.cos(t);
      let r = Math.sin(t) * 0.335 * bottomHeavy;
      if (i === 0 || i === N) r = 0;
      prof.push([r, y]);
    }
    const g = lathe(prof, 40, Math.PI, TAU);
    // flatten the face a little
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const ang = Math.atan2(x, z);
      const wFace = Math.max(0, Math.cos(ang * 2.4)) * Math.max(0, 1 - Math.abs((y - 0.2) / 0.17) ** 2);
      if (z > 0) p.setZ(i, z * (1 - 0.07 * wFace));
    }
    g.computeVertexNormals();
    smoothSeams(g);
    return g;
  });
}
function createDaruma() {
  const g = new THREE.Group();
  const mat = cm('daruma', () => new THREE.MeshPhysicalMaterial({
    map: darumaTexture(), roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08,
  }));
  const m = new THREE.Mesh(darumaGeometry(), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  g.userData.item = 'daruma';
  g.userData.radius = 0.36;
  return g;
}

// ---------------------------------------------------------------------------
// 手裏剣 shuriken (flat in XZ, origin at center)
// ---------------------------------------------------------------------------
function shurikenShape(scale = 1, hole = true) {
  const s = new THREE.Shape();
  const R = 0.335 * scale;
  const r = 0.085 * scale;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const a2 = a + Math.PI / 4;
    const tip = [Math.cos(a) * R, Math.sin(a) * R];
    const inner = [Math.cos(a2) * r, Math.sin(a2) * r];
    // concave blade edges
    const c1 = [Math.cos(a + 0.2) * R * 0.42, Math.sin(a + 0.2) * R * 0.42];
    if (i === 0) s.moveTo(tip[0], tip[1]);
    else s.lineTo(tip[0], tip[1]);
    s.quadraticCurveTo(c1[0], c1[1], inner[0], inner[1]);
    const a3 = a + Math.PI / 2;
    const c2 = [Math.cos(a3 - 0.2) * R * 0.42, Math.sin(a3 - 0.2) * R * 0.42];
    const next = [Math.cos(a3) * R, Math.sin(a3) * R];
    s.quadraticCurveTo(c2[0], c2[1], next[0], next[1]);
  }
  s.closePath();
  if (hole) {
    const h = new THREE.Path();
    h.absarc(0, 0, 0.045 * scale, 0, TAU, true);
    s.holes.push(h);
  }
  return s;
}
function createShuriken() {
  const g = new THREE.Group();
  const steel = cm('steel', () => new THREE.MeshPhysicalMaterial({ color: 0xb4bec9, metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.12 }));
  // beveled cutting edges glow a subtle cyan (emissive > 1 → blooms)
  const edgeGlow = cm('shurikenEdge', () => new THREE.MeshStandardMaterial({
    color: 0x7d97a6, metalness: 0.8, roughness: 0.22, emissive: 0x1fb4ff, emissiveIntensity: 1.05,
  }));
  const dark = cm('steelDark', () => new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.9, roughness: 0.35 }));
  const body = cg('shurikenBody', () => {
    const e = new THREE.ExtrudeGeometry(shurikenShape(), { depth: 0.014, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.016, bevelSegments: 1, curveSegments: 10 });
    e.translate(0, 0, -0.007);
    e.rotateX(-Math.PI / 2);
    return e; // groups: 0 = flat faces, 1 = bevels/sides
  });
  const details = cg('shurikenDetails', () => {
    const P = new PartBuilder();
    for (const y of [0.02, -0.02]) {
      P.add('dark', new THREE.TorusGeometry(0.07, 0.007, 6, 28), [0, y, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        const d = V(Math.cos(a), 0, -Math.sin(a));
        P.add('dark', new THREE.BoxGeometry(0.16, 0.004, 0.008), d.clone().multiplyScalar(0.17).setY(y), [0, a, 0]);
      }
    }
    return P.merge().get('dark');
  });
  const b = new THREE.Mesh(body, [steel, edgeGlow]);
  b.castShadow = true;
  b.receiveShadow = true;
  g.add(b);
  g.add(new THREE.Mesh(details, dark));
  g.userData.item = 'shuriken';
  return g;
}

// ---------------------------------------------------------------------------
// まきびし makibishi (origin bottom center)
// ---------------------------------------------------------------------------
function caltropGeometry() {
  return cg('caltrop', () => {
    const P = new PartBuilder();
    const L = 0.17;
    const dirs = [V(0, 1, 0)];
    const e = Math.acos(-1 / 3);
    for (let k = 0; k < 3; k++) {
      const phi = (k / 3) * TAU;
      dirs.push(V(Math.sin(e) * Math.cos(phi), Math.cos(e), Math.sin(e) * Math.sin(phi)));
    }
    const spike = new THREE.ConeGeometry(0.032, L, 7, 2);
    spike.translate(0, L / 2, 0);
    // slight twist/forge irregularity
    for (const d of dirs) P.add('iron', spike, [0, 0, 0], new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d));
    P.add('iron', new THREE.IcosahedronGeometry(0.038, 1), [0, 0, 0]);
    // glowing tips
    for (const d of dirs) P.add('tip', new THREE.SphereGeometry(0.012, 6, 4), d.clone().multiplyScalar(L * 0.93));
    const merged = P.merge();
    // move so the three lower tips touch the ground: lower tips at y = -L/3
    for (const geo of merged.values()) geo.translate(0, L / 3, 0);
    return merged;
  });
}
function glowDiscTexture() {
  return canvasTex('redGlow', 128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,60,40,0.9)');
    gr.addColorStop(0.45, 'rgba(255,40,20,0.35)');
    gr.addColorStop(1, 'rgba(255,20,10,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}
function createMakibishi({ icon = false } = {}) {
  const g = new THREE.Group();
  const iron = cm('iron', () => new THREE.MeshStandardMaterial({ color: 0x45464e, metalness: 0.8, roughness: 0.5 }));
  const tip = cm('ironTip', () => new THREE.MeshStandardMaterial({ color: 0xff5a40, emissive: 0xff2a10, emissiveIntensity: 2.2, roughness: 0.4 }));
  // the 4-caltrop cluster is merged once (2 draw calls)
  const cluster = cg('makibishiCluster', () => {
    const one = caltropGeometry();
    const P = new PartBuilder();
    const spots = [[0.0, 0.0, 0.3], [0.17, 0.08, 1.4], [-0.14, 0.12, 2.3], [0.03, -0.17, 3.9]];
    for (const [x, z, yaw] of spots) {
      P.add('iron', one.get('iron'), [x, 0, z], [0, yaw, 0]);
      P.add('tip', one.get('tip'), [x, 0, z], [0, yaw, 0]);
    }
    return P.merge();
  });
  const a = new THREE.Mesh(cluster.get('iron'), iron);
  a.castShadow = true;
  a.receiveShadow = true;
  g.add(a);
  g.add(new THREE.Mesh(cluster.get('tip'), tip));
  if (!icon) {
    const disc = new THREE.Mesh(
      cg('glowDisc', () => new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2)),
      cm('redGlowDisc', () => new THREE.MeshBasicMaterial({
        map: glowDiscTexture(), color: new THREE.Color(0.85, 0.22, 0.16), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })),
    );
    disc.position.y = 0.006;
    disc.renderOrder = 1;
    disc.userData.glow = true;
    g.add(disc);
  }
  g.userData.item = 'makibishi';
  return g;
}

// ---------------------------------------------------------------------------
// 小判 koban (standing, facing +Z, origin at center)
// ---------------------------------------------------------------------------
const KOBAN_A = 0.15; // half width
const KOBAN_B = 0.225; // half height
function kobanCanvases() {
  if (texCache.has('kobanMaps')) return texCache.get('kobanMaps');
  const W = 512;
  const H = 384;
  // color map: left half = front, right half = back
  const col = document.createElement('canvas');
  col.width = W;
  col.height = H;
  const cg2 = col.getContext('2d');
  const hgt = document.createElement('canvas');
  hgt.width = W;
  hgt.height = H;
  const hg = hgt.getContext('2d');
  cg2.fillStyle = '#ffffff';
  cg2.fillRect(0, 0, W, H);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, W, H);
  for (const half of [0, 1]) {
    const ox = half * 256;
    const cx = ox + 128;
    const cy = H / 2;
    const rx = 128 * 0.97;
    const ry = (H / 2) * 0.97;
    // goza-me (fine horizontal grooves)
    hg.save();
    hg.beginPath();
    hg.ellipse(cx, cy, rx * 0.86, ry * 0.88, 0, 0, TAU);
    hg.clip();
    for (let y = 0; y < H; y += 7) {
      hg.fillStyle = '#6a6a6a';
      hg.fillRect(ox, y, 256, 3);
    }
    hg.restore();
    // raised rim ring
    hg.strokeStyle = '#d8d8d8';
    hg.lineWidth = 12;
    hg.beginPath();
    hg.ellipse(cx, cy, rx * 0.93, ry * 0.94, 0, 0, TAU);
    hg.stroke();
    hg.strokeStyle = '#5a5a5a';
    hg.lineWidth = 3;
    hg.beginPath();
    hg.ellipse(cx, cy, rx * 0.86, ry * 0.885, 0, 0, TAU);
    hg.stroke();
    // stamps (桐紋 in small ovals)
    const stamps = half === 0 ? [cy - ry * 0.66, cy + ry * 0.66] : [cy];
    for (const sy of stamps) {
      hg.fillStyle = '#b8b8b8';
      hg.beginPath();
      hg.ellipse(cx, sy, 26, 30, 0, 0, TAU);
      hg.fill();
      hg.fillStyle = '#e8e8e8';
      // paulownia: 3 leaves + flower stalks
      for (const dx of [-11, 0, 11]) {
        hg.beginPath();
        hg.ellipse(cx + dx, sy + 8, 6, 9, dx * 0.03, 0, TAU);
        hg.fill();
      }
      for (const dx of [-12, 0, 12]) {
        for (let k = 0; k < 3; k++) {
          hg.beginPath();
          hg.arc(cx + dx, sy - 6 - k * 6, 2.6, 0, TAU);
          hg.fill();
        }
      }
      cg2.strokeStyle = 'rgba(150,100,30,0.55)';
      cg2.lineWidth = 2;
      cg2.beginPath();
      cg2.ellipse(cx, sy, 26, 30, 0, 0, TAU);
      cg2.stroke();
    }
    if (half === 0) {
      // ink: 壱両 (vertical) + 光次 + kao
      cg2.fillStyle = '#2a1a12';
      cg2.font = `bold 58px ${JP_BRUSH}`;
      centerText(cg2, '壱', cx, cy - 52);
      centerText(cg2, '両', cx, cy + 8);
      cg2.font = `bold 32px ${JP_BRUSH}`;
      centerText(cg2, '光次', cx, cy + 62);
      cg2.lineWidth = 4;
      cg2.strokeStyle = '#2a1a12';
      cg2.beginPath();
      cg2.moveTo(cx - 22, cy + 92);
      cg2.bezierCurveTo(cx - 5, cy + 78, cx + 6, cy + 104, cx + 24, cy + 86);
      cg2.stroke();
    }
    // subtle tone variation
    const gr = cg2.createRadialGradient(cx - 30, cy - 50, 10, cx, cy, ry);
    gr.addColorStop(0, 'rgba(255,255,240,0.0)');
    gr.addColorStop(1, 'rgba(200,150,60,0.18)');
    cg2.fillStyle = gr;
    cg2.fillRect(ox, 0, 256, H);
  }
  const normal = heightToNormalCanvas(hgt, 2.4, false);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const nmap = new THREE.CanvasTexture(normal);
  nmap.colorSpace = THREE.NoColorSpace;
  nmap.anisotropy = 8;
  const res = { map, nmap };
  texCache.set('kobanMaps', res);
  return res;
}
function kobanGeometry() {
  return cg('koban', () => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, KOBAN_A, KOBAN_B, 0, TAU, false, 0);
    const depth = 0.014;
    const bev = 0.011;
    const e = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 30 });
    e.translate(0, 0, -depth / 2);
    // UVs: caps → atlas halves, sides → plain rim area
    const uv = e.attributes.uv;
    const nrm = e.attributes.normal;
    const pos = e.attributes.position;
    const capGroup = e.groups[0];
    for (let i = 0; i < pos.count; i++) {
      const inCap = i >= capGroup.start && i < capGroup.start + capGroup.count;
      const x = pos.getX(i);
      const y = pos.getY(i);
      let u = (x + KOBAN_A) / (2 * KOBAN_A);
      const v = (y + KOBAN_B) / (2 * KOBAN_B);
      if (inCap) {
        if (nrm.getZ(i) > 0) uv.setXY(i, u * 0.5, v);
        else uv.setXY(i, 0.5 + (1 - u) * 0.5, v);
      } else {
        uv.setXY(i, 0.01, 0.5);
      }
    }
    e.clearGroups();
    return e;
  });
}
function kobanMaterial() {
  return cm('koban', () => {
    const { map, nmap } = kobanCanvases();
    return new THREE.MeshPhysicalMaterial({
      color: 0xffc444, metalness: 1, roughness: 0.2, map, normalMap: nmap, normalScale: new THREE.Vector2(1, 1),
      clearcoat: 0.5, clearcoatRoughness: 0.12,
    });
  });
}
function createKoban() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(kobanGeometry(), kobanMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  g.userData.item = 'koban';
  return g;
}

// ---------------------------------------------------------------------------
// 招き猫 manekineko (origin bottom center)
// ---------------------------------------------------------------------------
function manekiMats() {
  return {
    white: cm('manekiWhite', () => new THREE.MeshPhysicalMaterial({ color: 0xe8e2d9, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 })),
    red: M.red(),
    gold: M.gold(),
    ink: M.ink(),
    pink: M.pinkNose(),
    inner: cm('manekiInner', () => new THREE.MeshPhysicalMaterial({ color: 0xf29aa8, roughness: 0.35, clearcoat: 1 })),
    orange: cm('manekiOrange', () => new THREE.MeshPhysicalMaterial({ color: 0xf0993c, roughness: 0.3, clearcoat: 1 })),
    black: cm('manekiBlack', () => new THREE.MeshPhysicalMaterial({ color: 0x35302f, roughness: 0.3, clearcoat: 1 })),
    cushion: cm('manekiCushion', () => new THREE.MeshPhysicalMaterial({ color: 0x8c2440, roughness: 0.65, sheen: 0.8, sheenColor: new THREE.Color(0xff9ab8), sheenRoughness: 0.4 })),
    koban: kobanMaterial(),
    blush: cm('manekiBlush', () => new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.7, depthWrite: false })),
  };
}
function manekiParts() {
  const P = new PartBuilder();
  const Q = (x, y, z, o) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o || 'XYZ'));
  // cushion (座布団) with gold tassels
  P.add('cushion', new RoundedBoxGeometry(0.5, 0.07, 0.46, 2, 0.03), [0, 0.035, 0]);
  for (const [x, z] of [[0.24, 0.22], [-0.24, 0.22], [0.24, -0.22], [-0.24, -0.22]]) {
    P.add('gold', new THREE.SphereGeometry(0.018, 8, 6), [x, 0.05, z]);
    P.add('gold', new THREE.ConeGeometry(0.014, 0.05, 6), [x * 1.07, 0.03, z * 1.07]);
  }
  // body
  P.add('white', superEllipsoid(0.17, 0.19, 0.15, { ws: 20, hs: 14, deform: (v) => { if (v.y < 0) { v.x *= 1.12; v.z *= 1.12; } } }), [0, 0.25, 0]);
  // haunches + feet
  for (const s of [1, -1]) {
    P.add('white', new THREE.SphereGeometry(0.1, 14, 10), [s * 0.12, 0.14, -0.02], null, [1, 0.9, 1.15]);
    P.add('white', new THREE.SphereGeometry(0.055, 12, 8), [s * 0.07, 0.1, 0.14], null, [1, 0.75, 1.3]);
  }
  // head
  P.add('white', superEllipsoid(0.2, 0.17, 0.18, { ws: 26, hs: 18, deform: (v) => { if (v.y < 0) v.x *= 1 + 0.12 * Math.min(1, -v.y / 0.17); } }), [0, 0.57, 0.01]);
  // ears
  for (const s of [1, -1]) {
    P.add('white', new THREE.ConeGeometry(0.075, 0.13, 14), [s * 0.12, 0.73, 0.0], Q(0, 0, -s * 0.35), [1, 1, 0.55]);
    P.add('inner', new THREE.ConeGeometry(0.05, 0.09, 12), [s * 0.12, 0.72, 0.022], Q(0, 0, -s * 0.35), [1, 1, 0.3]);
  }
  // calico spots
  P.add('orange', new THREE.SphereGeometry(1, 14, 10), [0.1, 0.68, 0.06], Q(-0.6, 0.5, 0), [0.07, 0.06, 0.03]);
  P.add('black', new THREE.SphereGeometry(1, 14, 10), [-0.11, 0.66, 0.02], Q(-0.3, -0.9, 0), [0.06, 0.05, 0.03]);
  P.add('orange', new THREE.SphereGeometry(1, 12, 8), [-0.09, 0.32, -0.12], Q(0.3, -2.4, 0), [0.07, 0.07, 0.03]);
  // face: happy closed eyes (^ ^)
  for (const s of [1, -1]) {
    P.add('ink', new THREE.TorusGeometry(0.03, 0.007, 5, 12, Math.PI), [s * 0.075, 0.585, 0.172], Q(-0.25, s * 0.35, 0));
    P.add('blush', new THREE.CircleGeometry(0.03, 12), [s * 0.12, 0.54, 0.155], Q(-0.1, s * 0.6, 0), [1.2, 0.8, 1]);
  }
  P.add('pink', new THREE.SphereGeometry(0.016, 10, 8), [0, 0.555, 0.19], null, [1.3, 0.9, 1]);
  for (const s of [1, -1]) P.add('ink', new THREE.TorusGeometry(0.016, 0.004, 4, 10, Math.PI), [s * 0.016, 0.535, 0.186], Q(0, 0, Math.PI));
  // whiskers
  for (const s of [1, -1]) {
    for (let k = 0; k < 3; k++) {
      const d = V(s, 0.15 - k * 0.15, 0.25).normalize();
      P.add('ink', new THREE.CylinderGeometry(0.003, 0.002, 0.12, 4), V(s * 0.1, 0.54 - k * 0.012, 0.15).addScaledVector(d, 0.04), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d));
    }
  }
  // collar + bell
  P.add('red', new THREE.TorusGeometry(0.14, 0.022, 8, 28), [0, 0.43, 0.0], Q(Math.PI / 2 - 0.15, 0, 0), [1, 1, 1]);
  P.add('gold', new THREE.SphereGeometry(0.038, 16, 12), [0, 0.39, 0.155]);
  P.add('ink', new THREE.TorusGeometry(0.038, 0.004, 4, 16, Math.PI), [0, 0.385, 0.158], Q(0, 0, Math.PI));
  // raised LEFT paw (cat's left = +X)
  const shoulderL = V(0.13, 0.4, 0.06);
  const pawL = V(0.2, 0.66, 0.1);
  {
    const d = pawL.clone().sub(shoulderL);
    const arm = new THREE.CapsuleGeometry(0.05, d.length(), 4, 12);
    P.add('white', arm, shoulderL.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
    P.add('white', new THREE.SphereGeometry(0.058, 14, 10), pawL.clone().add(V(0, 0.02, 0.01)), null, [1, 1.05, 0.85]);
    P.add('inner', new THREE.SphereGeometry(0.02, 8, 6), pawL.clone().add(V(0, 0.015, 0.058)), null, [1, 1, 0.5]);
  }
  // right paw holding the koban
  const shoulderR = V(-0.13, 0.36, 0.08);
  const pawR = V(-0.08, 0.26, 0.2);
  {
    const d = pawR.clone().sub(shoulderR);
    P.add('white', new THREE.CapsuleGeometry(0.048, d.length(), 4, 12), shoulderR.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
  }
  const kob = kobanGeometry().clone();
  kob.scale(0.62, 0.62, 0.8);
  P.add('koban', kob, [0.0, 0.25, 0.2], Q(-0.12, 0, 0));
  P.add('white', new THREE.SphereGeometry(0.05, 12, 10), pawR.clone().add(V(0, 0.02, 0.03)), null, [1, 0.9, 0.9]);
  // tail curled on the back
  P.add('white', new THREE.TorusGeometry(0.07, 0.03, 8, 16, Math.PI * 1.2), [0.0, 0.12, -0.17], Q(0, 0, 0.4));
  return P;
}
function createManekineko() {
  const mats = manekiMats();
  const g = cachedModel('maneki', manekiParts, () => mats, { noCast: ['ink', 'blush', 'pink', 'inner'] });
  g.userData.item = 'manekineko';
  return g;
}

// ---------------------------------------------------------------------------
// 金ダライ kanedarai (origin at rim-plane center, opening facing DOWN)
// ---------------------------------------------------------------------------
function createKanedarai() {
  const geo = cg('kanedarai', () => {
    // upright profile (outer surface up the wall, rolled lip, back down the inside)
    const prof = [
      [0.0, 0.0], [0.08, 0.0], [0.085, 0.006], [0.09, 0.0], [0.15, 0.0], [0.155, 0.006], [0.16, 0.0],
      [0.25, 0.0], [0.268, 0.004], [0.28, 0.014], [0.33, 0.08], [0.38, 0.15], [0.415, 0.205], [0.432, 0.232],
      [0.442, 0.247], [0.452, 0.254], [0.461, 0.25], [0.463, 0.24], [0.456, 0.232], [0.444, 0.236],
      [0.426, 0.228], [0.405, 0.2], [0.37, 0.15], [0.32, 0.084], [0.272, 0.022], [0.255, 0.013], [0.16, 0.012],
      [0.155, 0.018], [0.15, 0.012], [0.09, 0.012], [0.085, 0.018], [0.08, 0.012], [0.0, 0.012],
    ];
    const g = lathe(prof, 40);
    g.rotateX(Math.PI); // opening faces down
    g.translate(0, 0.254, 0); // rim plane → y≈0
    return g;
  });
  const mat = cm('kanedarai', () => new THREE.MeshStandardMaterial({ color: 0xe2bd6c, metalness: 0.95, roughness: 0.36, side: THREE.DoubleSide }));
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  g.userData.item = 'kanedarai';
  return g;
}

/**
 * @param {string} id one of ITEM_IDS (throws on unknown ids)
 * @param {object} [opts] dango: {count}, makibishi: {icon: true → no ground glow}
 */
export function createItemModel(id = 'dango', opts = {}) {
  switch (id) {
    case 'dango': return createDango(opts);
    case 'daruma': return createDaruma(opts);
    case 'shuriken': return createShuriken(opts);
    case 'makibishi': return createMakibishi(opts);
    case 'manekineko': return createManekineko(opts);
    case 'kanedarai': return createKanedarai(opts);
    case 'koban': return createKoban(opts);
    default: throw new Error('unknown item id: ' + id);
  }
}

// ---------------------------------------------------------------------------
// Item box (福箱): iridescent glass cube with a glowing 福 inside
// ---------------------------------------------------------------------------
const BOX_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  #include <fog_pars_vertex>
  void main() {
    vP = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const BOX_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHalf;
  uniform float uAlpha;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  #include <fog_pars_fragment>
  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }
  void main() {
    vec3 n = normalize(vN);
    float vl = length(vV);
    vec3 v = vl > 1e-5 ? vV / vl : vec3(0.0, 0.0, 1.0);
    float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
    float fres = pow(max(1.0 - ndv, 0.0), 2.2);
    // distance to cube edges (object space)
    vec3 d = uHalf - abs(vP);
    float m1 = min(d.x, min(d.y, d.z));
    float m3 = max(d.x, max(d.y, d.z));
    float m2 = d.x + d.y + d.z - m1 - m3; // second smallest
    float edge = 1.0 - smoothstep(0.0, 0.16, max(m2, 0.0));
    float hue = fract(uTime * 0.08 + fres * 0.55 + dot(vP, vec3(0.45, 0.62, 0.31)) + edge * 0.15);
    vec3 rainbow = hsv2rgb(vec3(hue, 0.78, 1.0));
    vec3 col = rainbow * (0.2 + 1.15 * fres + 1.65 * edge);
    col += vec3(1.0, 0.96, 0.9) * pow(fres, 5.0) * 0.35;
    float a = clamp(0.12 + 0.6 * fres + 0.7 * edge, 0.0, 0.9) * uAlpha;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
let boxMaterials = null;
function getBoxMaterials() {
  if (boxMaterials) return boxMaterials;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uHalf: { value: 0.55 }, uAlpha: { value: 1 } }]);
  const mk = (side) => {
    const m = new THREE.ShaderMaterial({
      uniforms, vertexShader: BOX_VERT, fragmentShader: BOX_FRAG, transparent: true, depthWrite: false, side, fog: true,
    });
    m.uniforms = uniforms; // share the same uniform objects
    m.name = 'item.boxGlass' + side;
    return m;
  };
  const fuTex = canvasTex('fuGlyph', 256, 256, (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const halo = g.createRadialGradient(cx, cy, 10, cx, cy, w / 2);
    halo.addColorStop(0, 'rgba(255,220,120,0.55)');
    halo.addColorStop(0.5, 'rgba(255,190,60,0.18)');
    halo.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, w, h);
    g.font = `bold 170px ${JP_SERIF}`;
    const grd = g.createLinearGradient(0, cy - 80, 0, cy + 80);
    grd.addColorStop(0, '#fff6c8');
    grd.addColorStop(0.45, '#ffd14a');
    grd.addColorStop(1, '#e89a1c');
    g.lineWidth = 12;
    g.strokeStyle = 'rgba(140,60,10,0.9)';
    const m = g.measureText('福');
    const tx = cx - ((m.actualBoundingBoxRight || 0) - (m.actualBoundingBoxLeft || 0)) / 2;
    const ty = cy + ((m.actualBoundingBoxAscent || 0) - (m.actualBoundingBoxDescent || 0)) / 2;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.strokeText('福', tx, ty);
    g.fillStyle = grd;
    g.fillText('福', tx, ty);
  });
  const sparkTex = canvasTex('sparkle', 64, 64, (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.2, 'rgba(255,245,210,0.8)');
    gr.addColorStop(1, 'rgba(255,230,160,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(cx, 2);
    g.quadraticCurveTo(cx + 3, cy - 3, w - 2, cy);
    g.quadraticCurveTo(cx + 3, cy + 3, cx, h - 2);
    g.quadraticCurveTo(cx - 3, cy + 3, 2, cy);
    g.quadraticCurveTo(cx - 3, cy - 3, cx, 2);
    g.fill();
  });
  boxMaterials = {
    back: mk(THREE.BackSide),
    front: mk(THREE.FrontSide),
    uniforms,
    fu: new THREE.SpriteMaterial({ map: fuTex, color: new THREE.Color(1.55, 1.35, 1.0), transparent: true, depthWrite: false, fog: true }),
    spark: new THREE.PointsMaterial({ map: sparkTex, color: new THREE.Color(1.6, 1.45, 1.2), size: 0.15, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
  };
  boxMaterials.fu.name = 'item.boxFu';
  boxMaterials.spark.name = 'item.boxSpark';
  return boxMaterials;
}

let boxCounter = 0;
/** Floating item box. update(dt, t) spins/bobs it; group origin = cube center. */
export function createItemBox() {
  const mats = getBoxMaterials();
  const group = new THREE.Group();
  group.name = 'itemBox';
  const inner = new THREE.Group();
  group.add(inner);
  const spin = new THREE.Group();
  inner.add(spin);
  const geo = cg('boxGeo', () => new RoundedBoxGeometry(1.1, 1.1, 1.1, 4, 0.16));
  const back = new THREE.Mesh(geo, mats.back);
  back.renderOrder = 10;
  const front = new THREE.Mesh(geo, mats.front);
  front.renderOrder = 12;
  spin.add(back, front);
  const fu = new THREE.Sprite(mats.fu);
  fu.scale.setScalar(0.78);
  fu.renderOrder = 11;
  inner.add(fu);
  // sparkles orbiting inside
  const NSP = 10;
  const sp = new Float32Array(NSP * 3);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(spGeo, mats.spark);
  sparks.renderOrder = 11;
  sparks.frustumCulled = false;
  inner.add(sparks);
  const seeds = [];
  const r = rng(7);
  for (let i = 0; i < NSP; i++) seeds.push({ a: r() * TAU, y: (r() - 0.5) * 0.7, rr: 0.18 + r() * 0.2, sp: 0.6 + r() * 0.9 });
  const phase = (boxCounter++ * 1.618) % 10; // desync bobbing between boxes (deterministic)
  function update(dt, t) {
    const tt = t + phase;
    mats.uniforms.uTime.value = t;
    spin.rotation.set(0.42, tt * 0.9, 0.28);
    inner.position.y = Math.sin(tt * 2.1) * 0.08;
    fu.material.rotation = Math.sin(tt * 1.7) * 0.08;
    const s = 0.74 + Math.sin(tt * 3.1) * 0.04;
    fu.scale.setScalar(s);
    for (let i = 0; i < NSP; i++) {
      const o = seeds[i];
      const a = o.a + tt * o.sp;
      sp[i * 3] = Math.cos(a) * o.rr;
      sp[i * 3 + 1] = o.y + Math.sin(tt * 1.3 + i) * 0.08;
      sp[i * 3 + 2] = Math.sin(a) * o.rr;
    }
    spGeo.attributes.position.needsUpdate = true;
  }
  update(0, 0);
  return {
    group,
    update,
    /** Optional: fade the whole box (0..1), e.g. while respawning. */
    setOpacity(a) {
      mats.uniforms.uAlpha.value = a;
    },
    dispose() {
      group.parent?.remove(group);
      spGeo.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Preview helpers
// ---------------------------------------------------------------------------
/** Every item side by side (plus the item box), for the preview page. */
export function createAllItemsLineup() {
  const g = new THREE.Group();
  const list = [
    createItemModel('dango', { count: 3 }), createItemModel('dango', { count: 2 }), createItemModel('dango', { count: 1 }),
    createItemModel('daruma'), createItemModel('shuriken'), createItemModel('makibishi'), createItemModel('manekineko'),
    createItemModel('kanedarai'), createItemModel('koban'),
  ];
  let x = 0;
  for (const m of list) {
    const holder = new THREE.Group();
    holder.add(m);
    holder.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(holder);
    const id = m.userData.item;
    if (id === 'daruma' || id === 'koban') holder.position.y = -bb.min.y; // center-origin items: sit on ground
    if (id === 'shuriken') holder.position.y = 0.3;
    if (id === 'kanedarai') holder.position.y = 0.6; // floating (it falls)
    holder.position.x = x - bb.min.x;
    x += bb.max.x - bb.min.x + 0.3;
    g.add(holder);
  }
  const box = createItemBox();
  box.group.position.set(x + 0.6, 0.9, 0);
  g.add(box.group);
  g.userData.update = box.update;
  return g;
}

/** Item box alone (preview: &anim=… advances it via update()). */
export function createItemBoxPreview() {
  const b = createItemBox();
  const wrap = new THREE.Group();
  b.group.position.y = 1.0;
  wrap.add(b.group);
  return { group: wrap, update: b.update };
}

/** Free every cached item geometry / material / texture. */
export function disposeItemResources() {
  for (const g of geoCache.values()) {
    if (g instanceof Map) for (const x of g.values()) x.dispose?.();
    else g.dispose?.();
  }
  for (const m of matCache.values()) m.dispose();
  for (const t of texCache.values()) {
    if (t.isTexture) t.dispose();
    else for (const x of Object.values(t)) x.dispose?.();
  }
  if (boxMaterials) {
    boxMaterials.back.dispose();
    boxMaterials.front.dispose();
    boxMaterials.fu.dispose();
    boxMaterials.spark.dispose();
    boxMaterials = null;
  }
  geoCache.clear();
  matCache.clear();
  texCache.clear();
}
