// Builds render meshes for a Track: road surface, edge skirts, ramps, dash panels,
// start line, bridge decks with parapets & pillars.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asphaltTextures, stoneTextures, dashPanelTexture, checkerTexture, plankTextures } from './roadTextures.js';
import { getMat } from '../props/materials.js';

const _p = new THREE.Vector3();

/**
 * Sweep a cross-section profile along the track between s0 and s1.
 * profile(frame, s, t) -> [[d, h], ...] polyline in the road's local (right, up) frame.
 * Each polyline segment becomes its own strip (hard edges between segments).
 */
export function sweep(track, s0, s1, step, profile, { uScale = 1, vScale = 10, flip = false } = {}) {
  let len = s1 - s0;
  if (len < 0) len += track.length;
  const n = Math.max(1, Math.ceil(len / step));
  const rows = [];
  for (let k = 0; k <= n; k++) {
    const s = s0 + (len * k) / n;
    const fr = track.frameAt(s, { pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() });
    rows.push({ fr, pts: profile(fr, s, k / n), v: (s - s0) / vScale + s0 / vScale });
  }
  const nSeg = rows[0].pts.length - 1;
  const pos = [];
  const uv = [];
  const idx = [];
  let base = 0;
  for (let j = 0; j < nSeg; j++) {
    // u coordinates from cumulative profile length (first row)
    const p0 = rows[0].pts;
    let u0 = 0;
    for (let q = 0; q < j; q++) u0 += Math.hypot(p0[q + 1][0] - p0[q][0], p0[q + 1][1] - p0[q][1]);
    const u1 = u0 + Math.hypot(p0[j + 1][0] - p0[j][0], p0[j + 1][1] - p0[j][1]);
    for (let k = 0; k <= n; k++) {
      const { fr, pts, v } = rows[k];
      for (const [pi, u] of [[j, u0], [j + 1, u1]]) {
        const [d, h] = pts[pi];
        _p.copy(fr.pos).addScaledVector(fr.right, d).addScaledVector(fr.up, h);
        pos.push(_p.x, _p.y, _p.z);
        uv.push(u / uScale, v);
      }
    }
    for (let k = 0; k < n; k++) {
      const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
      if (!flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
    base += (n + 1) * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Vertical quad across the road at s (facing +tangent), from d0..d1 and h0..h1. */
function rampCap(track, s, d0, d1, h0, h1) {
  const fr = track.frameAt(s);
  const P = (d, h) => fr.pos.clone().addScaledVector(fr.right, d).addScaledVector(fr.up, h);
  const a = P(d0, h0), b = P(d1, h0), c = P(d1, h1), d = P(d0, h1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  // normal must face +tangent: (b-a) x (d-a) = R x U = -T  -> so use a, d, c / a, c, b ordering
  geo.setIndex([0, 3, 2, 0, 2, 1]);
  geo.computeVertexNormals();
  return geo;
}

/** Split [0, L) into ranges that are not gaps. */
function roadRanges(track) {
  const ranges = [];
  const gaps = [...track.gaps].sort((a, b) => a.s0 - b.s0);
  if (!gaps.length) return [[0, track.length]];
  for (let i = 0; i < gaps.length; i++) {
    const a = gaps[i].s1;
    const b = gaps[(i + 1) % gaps.length].s0;
    ranges.push([a, b <= a ? b + track.length : b]);
  }
  return ranges;
}

export function buildTrackMeshes(track, style = {}, terrain = null) {
  const group = new THREE.Group();
  group.name = 'track';
  const texLen = style.texLen ?? 16;

  // ---------- road surface ----------
  let tex;
  if (style.road === 'stone') tex = stoneTextures(style.roadOpts || {});
  else tex = asphaltTextures(style.roadOpts || {});
  const roadMat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: style.roadRoughness ?? 0.82,
    metalness: 0.0,
    color: style.roadColor ?? 0xffffff,
  });
  roadMat.name = 'road';
  const ranges = roadRanges(track);
  const roadGeos = [];
  const skirtGeos = [];
  for (const [a, b] of ranges) {
    roadGeos.push(
      sweep(track, a, b, 1.0, (fr) => [[-fr.width, 0], [fr.width, 0]], { uScale: 1, vScale: texLen }),
    );
    // normalize u to 0..1 across the road: rewrite uv.x by d
    skirtGeos.push(
      sweep(track, a, b, 2.0, (fr) => [[-fr.width, -0.9], [-fr.width, 0.02]], { vScale: 4 }),
      sweep(track, a, b, 2.0, (fr) => [[fr.width, 0.02], [fr.width, -0.9]], { vScale: 4 }),
    );
  }
  const tiled = style.road === 'stone';
  const tile = style.tile ?? 4.2;
  for (const g of roadGeos) {
    // asphalt: u across = 0..1 (lane markings baked in); stone: tiled in meters
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      if (tiled) {
        if (i % 2 === 1) {
          const dx = pos.getX(i) - pos.getX(i - 1), dz = pos.getZ(i) - pos.getZ(i - 1);
          uv.setX(i - 1, 0);
          uv.setX(i, Math.hypot(dx, dz) / tile);
        }
        uv.setY(i, (uv.getY(i) * texLen) / tile);
      } else uv.setX(i, i % 2 === 0 ? 0 : 1);
    }
  }
  const roadGeo = mergeGeometries(roadGeos);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  road.name = 'road';
  group.add(road);
  const skirt = new THREE.Mesh(mergeGeometries(skirtGeos), getMat(style.skirtMat || 'stoneDark'));
  skirt.receiveShadow = true;
  group.add(skirt);

  // ---------- road edge curbs / lines (optional raised curb strips) ----------
  if (style.curbs) {
    const curbTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      const g = c.getContext('2d');
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? style.curbs[0] : style.curbs[1];
        g.fillRect(0, i * 64, 64, 64);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    })();
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6 });
    const curbGeos = [];
    for (const [a, b] of ranges) {
      curbGeos.push(sweep(track, a, b, 1.0, (fr) => [[-fr.width - 0.2, 0.0], [-fr.width + 0.6, 0.06], [-fr.width + 0.9, 0.0]], { vScale: 4 }));
      curbGeos.push(sweep(track, a, b, 1.0, (fr) => [[fr.width - 0.9, 0.0], [fr.width - 0.6, 0.06], [fr.width + 0.2, 0.0]], { vScale: 4 }));
    }
    const curbs = new THREE.Mesh(mergeGeometries(curbGeos), curbMat);
    curbs.receiveShadow = true;
    group.add(curbs);
  }

  // ---------- ramps ----------
  const planks = plankTextures();
  const rampMat = new THREE.MeshStandardMaterial({ map: planks.map, normalMap: planks.normalMap, roughness: 0.75, color: 0xffffff });
  const glideTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1b6fd6';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#7fe8ff';
    for (let k = 0; k < 2; k++) {
      const y0 = k * 128 + 20;
      g.beginPath();
      g.moveTo(40, y0 + 70); g.lineTo(128, y0); g.lineTo(216, y0 + 70);
      g.lineTo(216, y0 + 92); g.lineTo(128, y0 + 24); g.lineTo(40, y0 + 92);
      g.closePath(); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const glideMat = new THREE.MeshStandardMaterial({ map: glideTex, emissiveMap: glideTex, emissive: 0x3aa0ff, emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.1 });
  const sideMat = getMat('woodDark');
  const rampStripe = new THREE.MeshStandardMaterial({ color: 0xf2c12e, roughness: 0.5 });
  for (const r of track.ramps) {
    const s0 = r.s, s1 = r.s + r.len;
    const hAt = (t) => r.h * Math.pow(t, 1.35);
    const top = sweep(track, s0, s1, 0.5, (fr, s, t) => [[r.d0, hAt(t) + 0.02], [r.d1, hAt(t) + 0.02]], { vScale: r.type === 'glide' ? 3 : 2 });
    const uv = top.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (i % 2) * (r.d1 - r.d0) / 3);
    const sides = mergeGeometries([
      sweep(track, s0, s1, 0.5, (fr, s, t) => [[r.d0, -0.3], [r.d0, hAt(t) + 0.02]], { vScale: 2 }),
      sweep(track, s0, s1, 0.5, (fr, s, t) => [[r.d1, hAt(t) + 0.02], [r.d1, -0.3]], { vScale: 2 }),
      rampCap(track, s1, r.d0, r.d1, -0.3, r.h + 0.02),
    ]);
    const lip = sweep(track, s1 - 0.35, s1, 0.35, () => [[r.d0, r.h + 0.03], [r.d1, r.h + 0.03]], { vScale: 1 });
    const m1 = new THREE.Mesh(top, r.type === 'glide' ? glideMat : rampMat);
    const m2 = new THREE.Mesh(sides, sideMat);
    const m3 = new THREE.Mesh(lip, r.type === 'glide' ? getMat('gold') : rampStripe);
    for (const m of [m1, m2, m3]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }

  // ---------- dash panels ----------
  const dashTex = dashPanelTexture();
  const dashMat = new THREE.MeshStandardMaterial({
    map: dashTex, emissiveMap: dashTex, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.4,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const dashGeos = [];
  for (const b of track.boosts) {
    const g = sweep(track, b.s, b.s + b.len, 0.5, () => [[b.d - b.halfW, 0.03], [b.d + b.halfW, 0.03]], { vScale: b.len / 2 });
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, i % 2);
    dashGeos.push(g);
  }
  if (dashGeos.length) {
    const dash = new THREE.Mesh(mergeGeometries(dashGeos), dashMat);
    dash.receiveShadow = true;
    group.add(dash);
  }

  // ---------- start line ----------
  const chk = checkerTexture();
  const startMat = new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const sg = sweep(track, -1.0, 1.0, 1.0, (fr) => [[-fr.width, 0.02], [fr.width, 0.02]], { vScale: 2 });
  {
    const uv = sg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (i % 2) * 1, Math.floor(i / 2) / 2);
  }
  const startLine = new THREE.Mesh(sg, startMat);
  startLine.receiveShadow = true;
  group.add(startLine);

  // ---------- bridges ----------
  for (const br of track.bridges) {
    const railMat = getMat(br.style === 'red' ? 'vermilion' : br.style === 'wood' ? 'woodAged' : 'concrete');
    const deckMat = getMat(br.style === 'red' || br.style === 'wood' ? 'woodDark' : 'stonePlain');
    const s0 = br.s0 - 2, s1 = br.s1 + 2;
    const deck = sweep(track, s0, s1, 1.0, (fr) => [[fr.width + 0.6, 0.0], [fr.width + 0.6, -1.1], [-fr.width - 0.6, -1.1], [-fr.width - 0.6, 0.0]], { vScale: 4 });
    const dm = new THREE.Mesh(deck, deckMat);
    dm.castShadow = true; dm.receiveShadow = true;
    group.add(dm);
    if (br.rail) {
      const railProfile = (side) => (fr) => {
        const w = fr.width;
        return side < 0
          ? [[-w - 0.6, 0.0], [-w - 0.6, 1.0], [-w - 0.1, 1.0], [-w - 0.1, 0.0]]
          : [[w + 0.1, 0.0], [w + 0.1, 1.0], [w + 0.6, 1.0], [w + 0.6, 0.0]];
      };
      const rails = mergeGeometries([sweep(track, s0, s1, 1.0, railProfile(-1), { vScale: 3 }), sweep(track, s0, s1, 1.0, railProfile(1), { vScale: 3 })]);
      const rm = new THREE.Mesh(rails, railMat);
      rm.castShadow = true; rm.receiveShadow = true;
      group.add(rm);
    }
    // pillars
    if (terrain) {
      let len = s1 - s0;
      if (len < 0) len += track.length;
      const pillarGeos = [];
      for (let u = 6; u < len - 4; u += 12) {
        const fr = track.frameAt(s0 + u);
        for (const side of [-1, 1]) {
          const p = fr.pos.clone().addScaledVector(fr.right, side * (fr.width - 1.5));
          const ground = terrain.natural(p.x, p.z);
          const top = p.y - 1.0;
          const h = top - ground + 3;
          if (h < 0.5) continue;
          const g = new THREE.BoxGeometry(1.4, h, 1.4);
          g.translate(p.x, top - h / 2, p.z);
          pillarGeos.push(g);
        }
      }
      if (pillarGeos.length) {
        const pm = new THREE.Mesh(mergeGeometries(pillarGeos), getMat(br.style === 'red' ? 'vermilion' : 'concrete'));
        pm.castShadow = true; pm.receiveShadow = true;
        group.add(pm);
      }
    }
  }

  return {
    group,
    update(dt) {
      dashTex.offset.y -= dt * 1.6;
      glideTex.offset.y -= dt * 0.8;
    },
  };
}
