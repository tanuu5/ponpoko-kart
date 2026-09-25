// Minimap: the course centreline is rasterised once to an offscreen canvas (thick road,
// white edge, dark outline, checkered start line); every frame only the racer dots are drawn.
// World → map: +X = right, +Z = down (a non-mirrored top-down view).

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.path = null;
    this._dirty = true;
    this._cssW = 0;
    this._cssH = 0;
    this._dpr = 1;
    this._tf = { s: 1, ox: 0, oy: 0 };
    this._onResize = () => { this._dirty = true; };
    window.addEventListener('resize', this._onResize);
  }

  setPath(path) {
    this.path = Array.isArray(path) && path.length > 2 ? simplify(path, 900) : null;
    this._dirty = true;
    this._layout();
  }

  _layout() {
    const cssW = this.canvas.clientWidth, cssH = this.canvas.clientHeight;
    if (!cssW || !cssH) return false; // hidden (HUD not shown yet): retry on next draw
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this._cssW = cssW; this._cssH = cssH; this._dpr = dpr;
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.bg.width = W; this.bg.height = H;
    this._dirty = false;
    const g = this.bg.getContext('2d');
    g.clearRect(0, 0, W, H);
    const p = this.path;
    if (!p) return true;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of p) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const unit = W / 190; // one "design pixel" of the 190u-wide map
    const road = 6.5 * unit;
    const pad = road * 1.6 + 4 * unit;
    const s = Math.min((W - 2 * pad) / Math.max(1e-3, maxX - minX), (H - 2 * pad) / Math.max(1e-3, maxZ - minZ));
    const ox = (W - (maxX - minX) * s) / 2 - minX * s;
    const oy = (H - (maxZ - minZ) * s) / 2 - minZ * s;
    this._tf = { s, ox, oy, unit };

    const trace = () => {
      g.beginPath();
      for (let i = 0; i < p.length; i++) {
        const X = p[i][0] * s + ox, Y = p[i][1] * s + oy;
        if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
      }
      g.closePath();
    };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // soft shadow
    g.save();
    g.shadowColor = 'rgba(10,8,8,0.55)';
    g.shadowBlur = 6 * unit;
    g.shadowOffsetY = 2 * unit;
    trace(); g.strokeStyle = 'rgba(29,26,25,0.92)'; g.lineWidth = road + 6.5 * unit; g.stroke();
    g.restore();
    trace(); g.strokeStyle = '#fffaf0'; g.lineWidth = road + 3 * unit; g.stroke();
    trace(); g.strokeStyle = '#57504c'; g.lineWidth = road; g.stroke();
    // subtle centre dashes
    g.save();
    g.setLineDash([2.2 * unit, 4.2 * unit]);
    trace(); g.strokeStyle = 'rgba(247,241,227,0.35)'; g.lineWidth = 0.9 * unit; g.stroke();
    g.restore();

    // checkered start line across the road at path[0]
    let k = 1;
    while (k < p.length - 1 && Math.hypot(p[k][0] - p[0][0], p[k][1] - p[0][1]) < 1e-3) k++;
    const ang = Math.atan2(p[k][1] - p[0][1], p[k][0] - p[0][0]);
    const len = road + 3 * unit, thick = road * 0.62;
    g.save();
    g.translate(p[0][0] * s + ox, p[0][1] * s + oy);
    g.rotate(ang);
    g.fillStyle = '#1d1a19';
    g.fillRect(-thick / 2 - unit, -len / 2 - unit, thick + 2 * unit, len + 2 * unit);
    const cols = 2, rows = 4;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        g.fillStyle = (i + j) % 2 ? '#1d1a19' : '#fffaf0';
        g.fillRect(-thick / 2 + (i * thick) / cols, -len / 2 + (j * len) / rows, thick / cols + 0.5, len / rows + 0.5);
      }
    }
    g.restore();
    return true;
  }

  draw(dots) {
    if (this._dirty && !this._layout()) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!this.path) return;
    ctx.drawImage(this.bg, 0, 0);
    if (!dots || !dots.length) return;
    const { s, ox, oy, unit } = this._tf;
    let player = null;
    ctx.lineWidth = 1.8 * unit;
    ctx.strokeStyle = '#1d1a19';
    for (const d of dots) {
      if (d.isPlayer) { player = d; continue; }
      ctx.beginPath();
      ctx.arc(d.x * s + ox, d.z * s + oy, 4.6 * unit, 0, Math.PI * 2);
      ctx.fillStyle = d.color || '#e0b04a';
      ctx.fill();
      ctx.stroke();
    }
    if (player) {
      const X = player.x * s + ox, Y = player.z * s + oy;
      const t = (performance.now() % 1200) / 1200;
      ctx.beginPath();
      ctx.arc(X, Y, (7 + 9 * t) * unit, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,250,240,${(0.7 * (1 - t)).toFixed(3)})`;
      ctx.lineWidth = 2 * unit;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X, Y, 8.2 * unit, 0, Math.PI * 2);
      ctx.fillStyle = '#1d1a19';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(X, Y, 6.8 * unit, 0, Math.PI * 2);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(X, Y, 4.6 * unit, 0, Math.PI * 2);
      ctx.fillStyle = player.color || '#d8401f';
      ctx.fill();
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
  }
}

/** Keep at most `max` points (uniform decimation; the input is a dense centreline). */
function simplify(path, max) {
  const pts = path.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z ?? p.y]));
  if (pts.length <= max) return pts;
  const out = [];
  const step = pts.length / max;
  for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}
