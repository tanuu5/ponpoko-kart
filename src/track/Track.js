// Spline-based closed race track.
// A course is authored as control points [x, y, z, halfWidth?, bank?] (closed loop).
// The centerline is resampled every ~1 m with a local frame (tangent / right / up incl. banking).
// Positions along the track are given in "s" (meters from the start line) and "d"
// (lateral offset, + = right of driving direction).
//
// Zones (gaps for glider jumps, bridges, ramps, dash panels, walls...) are authored with
// "cp" positions: a number like 12.5 = halfway between control point 12 and 13 (by arc length).
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Track {
  constructor(def) {
    this.def = def;
    const pts = def.points;
    const n = pts.length;
    this.cpCount = n;
    this.defaultWidth = def.width ?? 8;
    const vecs = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(vecs, true, 'centripetal');
    const divisions = n * 96;
    curve.arcLengthDivisions = divisions;
    const lengths = curve.getLengths(divisions);
    const total = lengths[lengths.length - 1];
    this.curve = curve;
    this.length = total;

    // arc length of each control point
    this.cpS = [];
    for (let i = 0; i < n; i++) this.cpS.push(lengths[i * 96]);
    this.cpS.push(total);

    const spacing = def.sampleSpacing ?? 1.0;
    const count = Math.max(64, Math.round(total / spacing));
    this.count = count;
    this.ds = total / count;
    const pts2 = curve.getSpacedPoints(count); // count+1 points, last == first
    const A = (k) => new Float32Array(count);
    this.px = A(); this.py = A(); this.pz = A();
    this.tx = A(); this.ty = A(); this.tz = A();
    this.rx = A(); this.ry = A(); this.rz = A();
    this.ux = A(); this.uy = A(); this.uz = A();
    this.w = A(); this.bank = A(); this.curv = A(); this.heading = A();
    this.wallL = A(); this.wallR = A();
    this.flags = new Uint16Array(count);

    for (let i = 0; i < count; i++) {
      const p = pts2[i];
      this.px[i] = p.x; this.py[i] = p.y; this.pz[i] = p.z;
    }
    // per-sample width & bank from control points (smooth interpolation by arc length)
    for (let i = 0; i < count; i++) {
      const s = i * this.ds;
      const { w, bank } = this._cpAttr(s);
      this.w[i] = w;
      this.bank[i] = bank;
    }
    // tangents (central differences)
    for (let i = 0; i < count; i++) {
      const a = (i - 1 + count) % count;
      const b = (i + 1) % count;
      _v.set(this.px[b] - this.px[a], this.py[b] - this.py[a], this.pz[b] - this.pz[a]).normalize();
      this.tx[i] = _v.x; this.ty[i] = _v.y; this.tz[i] = _v.z;
      this.heading[i] = Math.atan2(_v.x, _v.z);
    }
    // curvature (signed yaw rate per meter; + = turning right), smoothed
    const rawC = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = (i - 2 + count) % count;
      const b = (i + 2) % count;
      let dh = this.heading[b] - this.heading[a];
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      rawC[i] = -dh / (4 * this.ds); // heading increases when turning left (+Y rotation)
    }
    const win = 6;
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let k = -win; k <= win; k++) sum += rawC[(i + k + count) % count];
      this.curv[i] = sum / (win * 2 + 1);
    }
    // frames with banking. right = normalize(t x up), bank > 0 lowers the right side.
    const T = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      T.set(this.tx[i], this.ty[i], this.tz[i]);
      R.crossVectors(T, THREE.Object3D.DEFAULT_UP).normalize();
      U.crossVectors(R, T).normalize();
      const b = this.bank[i];
      const cb = Math.cos(b), sb = Math.sin(b);
      // rotate R,U around T
      const rx = R.x * cb - U.x * sb, ry = R.y * cb - U.y * sb, rz = R.z * cb - U.z * sb;
      const ux = U.x * cb + R.x * sb, uy = U.y * cb + R.y * sb, uz = U.z * cb + R.z * sb;
      this.rx[i] = rx; this.ry[i] = ry; this.rz[i] = rz;
      this.ux[i] = ux; this.uy[i] = uy; this.uz[i] = uz;
    }

    // default walls
    const wallMargin = def.wallMargin ?? 16;
    for (let i = 0; i < count; i++) {
      this.wallL[i] = this.w[i] + wallMargin;
      this.wallR[i] = this.w[i] + wallMargin;
    }

    // zones
    this.gaps = [];
    this.bridges = [];
    this.ramps = [];
    this.boosts = [];
    this.itemRows = [];
    this.coinLines = [];
    this.zones = def.zones || {};
    this._buildZones(this.zones);

    this.bounds = new THREE.Box3();
    for (let i = 0; i < count; i++) this.bounds.expandByPoint(_v.set(this.px[i], this.py[i], this.pz[i]));
  }

  _cpAttr(s) {
    const pts = this.def.points;
    const n = this.cpCount;
    let i = 0;
    while (i < n - 1 && this.cpS[i + 1] <= s) i++;
    const s0 = this.cpS[i], s1 = this.cpS[i + 1];
    let f = (s - s0) / Math.max(1e-6, s1 - s0);
    f = f * f * (3 - 2 * f);
    const a = pts[i], b = pts[(i + 1) % n];
    const wa = a[3] ?? this.defaultWidth, wb = b[3] ?? this.defaultWidth;
    const ba = a[4] ?? 0, bb = b[4] ?? 0;
    return { w: wa + (wb - wa) * f, bank: ba + (bb - ba) * f };
  }

  /** Convert a control-point position (e.g. 12.5) to arc length s. */
  cpToS(cp) {
    const n = this.cpCount;
    let c = ((cp % n) + n) % n;
    const i = Math.floor(c);
    const f = c - i;
    return this.cpS[i] + (this.cpS[i + 1] - this.cpS[i]) * f;
  }

  _sOf(v) {
    // zone positions: {cp: 12.5} or {s: 120} or plain number = cp
    if (typeof v === 'number') return this.cpToS(v);
    if (v.s != null) return this.wrapS(v.s);
    return this.cpToS(v.cp) + (v.off || 0);
  }

  wrapS(s) {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  idx(s) {
    return ((Math.floor(this.wrapS(s) / this.ds) % this.count) + this.count) % this.count;
  }

  _forRange(s0, s1, fn) {
    // iterate sample indices covering [s0, s1] (wrapping)
    let len = s1 - s0;
    if (len < 0) len += this.length;
    const n = Math.ceil(len / this.ds);
    const i0 = this.idx(s0);
    for (let k = 0; k <= n; k++) fn((i0 + k) % this.count, k / Math.max(1, n));
  }

  _buildZones(z) {
    const F = Track.FLAGS;
    for (const g of z.gaps || []) {
      const s0 = this._sOf(g.from), s1 = this._sOf(g.to);
      this.gaps.push({ s0, s1, respawn: g.respawn != null ? this._sOf(g.respawn) : this.wrapS(s1 + 6), killY: g.killY ?? -3 });
      this._forRange(s0, s1, (i) => (this.flags[i] |= F.GAP | F.NO_TERRAIN_FOLLOW));
    }
    for (const b of z.bridges || []) {
      const s0 = this._sOf(b.from), s1 = this._sOf(b.to);
      this.bridges.push({ s0, s1, style: b.style || 'stone', rail: b.rail ?? true });
      this._forRange(s0 - 2, s1 + 2, (i) => {
        this.flags[i] |= F.BRIDGE | F.NO_TERRAIN_FOLLOW;
        if (b.rail ?? true) {
          this.wallL[i] = Math.min(this.wallL[i], this.w[i] + 0.1);
          this.wallR[i] = Math.min(this.wallR[i], this.w[i] + 0.1);
        }
      });
    }
    for (const r of z.ramps || []) {
      const s = this._sOf(r.at);
      this.ramps.push({
        s,
        len: r.len ?? 10,
        h: r.h ?? 1.6,
        d0: r.d0 ?? -4,
        d1: r.d1 ?? 4,
        type: r.type || 'jump', // 'jump' | 'glide'
        launch: r.launch ?? (r.type === 'glide' ? 11 : 8.5),
      });
    }
    for (const b of z.boosts || []) {
      this.boosts.push({ s: this._sOf(b.at), d: b.d ?? 0, len: b.len ?? 5, halfW: b.halfW ?? 1.6 });
    }
    for (const r of z.items || []) {
      this.itemRows.push({ s: this._sOf(r.at), count: r.count ?? 4, spread: r.spread ?? null, d: r.d ?? 0 });
    }
    for (const c of z.coins || []) {
      this.coinLines.push({ s0: this._sOf(c.from), s1: this._sOf(c.to), d: c.d ?? 0, count: c.count ?? 5, wave: c.wave ?? 0, h: c.h ?? 0.85, arc: c.arc ?? 0 });
    }
    for (const w of z.walls || []) {
      const s0 = this._sOf(w.from), s1 = this._sOf(w.to);
      const side = w.side || 'both';
      this._forRange(s0, s1, (i) => {
        const dist = w.offset != null ? this.w[i] + w.offset : this.w[i] + 1.0;
        if (side === 'left' || side === 'both') this.wallL[i] = Math.min(this.wallL[i], w.abs != null ? w.abs : dist);
        if (side === 'right' || side === 'both') this.wallR[i] = Math.min(this.wallR[i], w.abs != null ? w.abs : dist);
      });
    }
  }

  inGap(s) {
    for (const g of this.gaps) {
      if (g.s0 <= g.s1 ? s >= g.s0 && s <= g.s1 : s >= g.s0 || s <= g.s1) return g;
    }
    return null;
  }

  hasFlag(i, f) {
    return (this.flags[i] & f) !== 0;
  }

  /** Frame at arc length s (interpolated). Writes into out (object with Vector3 fields). */
  frameAt(s, out = Track.newFrame()) {
    s = this.wrapS(s);
    const f = s / this.ds;
    const i = Math.floor(f) % this.count;
    const j = (i + 1) % this.count;
    const t = f - Math.floor(f);
    const L = (a, b) => a + (b - a) * t;
    out.pos.set(L(this.px[i], this.px[j]), L(this.py[i], this.py[j]), L(this.pz[i], this.pz[j]));
    out.tan.set(L(this.tx[i], this.tx[j]), L(this.ty[i], this.ty[j]), L(this.tz[i], this.tz[j])).normalize();
    out.right.set(L(this.rx[i], this.rx[j]), L(this.ry[i], this.ry[j]), L(this.rz[i], this.rz[j])).normalize();
    out.up.set(L(this.ux[i], this.ux[j]), L(this.uy[i], this.uy[j]), L(this.uz[i], this.uz[j])).normalize();
    out.width = L(this.w[i], this.w[j]);
    out.wallL = L(this.wallL[i], this.wallL[j]);
    out.wallR = L(this.wallR[i], this.wallR[j]);
    out.curv = L(this.curv[i], this.curv[j]);
    out.index = i;
    out.s = s;
    return out;
  }

  static newFrame() {
    return {
      pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(),
      width: 8, wallL: 20, wallR: 20, curv: 0, index: 0, s: 0,
    };
  }

  /** World point at (s, d, h above the road surface). */
  pointAt(s, d, h = 0, out = new THREE.Vector3()) {
    const fr = this.frameAt(s, _tmpFrame);
    return out.copy(fr.pos).addScaledVector(fr.right, d).addScaledVector(fr.up, h);
  }

  /**
   * Project a world position onto the track. `hint` = previous sample index (or -1 for global search).
   * Returns (and reuses) out: { index, s, d, along, width, roadY, frame... }
   */
  project(x, y, z, hint = -1, out = Track.newProj()) {
    let best = -1;
    let bestD = Infinity;
    const count = this.count;
    const test = (i) => {
      const dx = x - this.px[i], dz = z - this.pz[i], dy = (y - this.py[i]) * 1.5;
      const d2 = dx * dx + dz * dz + dy * dy;
      if (d2 < bestD) { bestD = d2; best = i; }
    };
    if (hint >= 0) {
      for (let k = -45; k <= 45; k++) test((hint + k + count) % count);
      if (bestD > 40 * 40) hint = -1; // lost: fall back to global
    }
    if (hint < 0) {
      bestD = Infinity;
      for (let i = 0; i < count; i++) test(i);
    }
    // refine on neighbouring segment
    const i = best;
    const tx = this.tx[i], tz = this.tz[i];
    const along0 = (x - this.px[i]) * tx + (z - this.pz[i]) * tz;
    let s = i * this.ds + along0 / Math.max(0.2, Math.hypot(tx, tz));
    s = this.wrapS(s);
    const fr = this.frameAt(s, out.frame);
    const dx = x - fr.pos.x, dy = y - fr.pos.y, dz = z - fr.pos.z;
    // lateral offset measured in the horizontal plane
    const rh = Math.hypot(fr.right.x, fr.right.z) || 1;
    const d = (dx * fr.right.x + dz * fr.right.z) / rh;
    out.index = fr.index;
    out.s = s;
    out.d = d;
    out.width = fr.width;
    out.roadY = fr.pos.y + (fr.right.y / rh) * d; // road plane height at this lateral offset (banking)
    out.dy = dy;
    return out;
  }

  static newProj() {
    return { index: 0, s: 0, d: 0, width: 8, roadY: 0, dy: 0, frame: Track.newFrame() };
  }

  /** Extra height from ramps at (s, d). Returns { h, ramp } */
  rampAt(s, d) {
    for (const r of this.ramps) {
      let u = s - r.s;
      if (u < -this.length / 2) u += this.length;
      if (u > this.length / 2) u -= this.length;
      if (u < 0 || u > r.len) continue;
      if (d < r.d0 || d > r.d1) continue;
      const f = u / r.len;
      return { h: r.h * Math.pow(f, 1.35), ramp: r, f };
    }
    return null;
  }

  boostAt(s, d) {
    for (const b of this.boosts) {
      let u = s - b.s;
      if (u < -this.length / 2) u += this.length;
      if (u >= 0 && u <= b.len && Math.abs(d - b.d) <= b.halfW) return b;
    }
    return null;
  }

  /** Distance forward from s0 to s1 along the loop (0..length). */
  forwardDist(s0, s1) {
    let d = s1 - s0;
    if (d < 0) d += this.length;
    return d;
  }

  /** Signed shortest delta s1 - s0 in (-L/2, L/2]. */
  deltaS(s0, s1) {
    let d = s1 - s0;
    const L = this.length;
    if (d > L / 2) d -= L;
    if (d <= -L / 2) d += L;
    return d;
  }

  /** Centerline as [x,z] pairs (for the minimap). */
  minimapPath(step = 6) {
    const out = [];
    for (let i = 0; i < this.count; i += step) out.push([this.px[i], this.pz[i]]);
    return out;
  }
}

Track.FLAGS = { GAP: 1, BRIDGE: 2, NO_TERRAIN_FOLLOW: 4, TUNNEL: 8 };
const _tmpFrame = Track.newFrame();
