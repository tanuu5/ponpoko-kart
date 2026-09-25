// Heightfield terrain that conforms to the race track.
// heightAt(x,z) is analytic (natural height blended to the road edges) and is used both
// to build the mesh and by the kart physics, so visuals and physics agree.
import * as THREE from 'three';
import { Track } from '../track/Track.js';
import { smoothstep, lerp, clamp } from './noise.js';
import { canvasTexture } from '../props/materials.js';

export class Terrain {
  /**
   * @param {Track} track
   * @param {object} o
   *  natural(x,z) -> height of the untouched landscape
   *  shoulder: flat shoulder width beyond the road edge (m)
   *  blend: distance over which the shoulder blends into natural terrain (m)
   *  waterLevelAt(x,z) -> water surface height or -Infinity
   *  surfaceAt(x,z,h,edgeDist) -> 'grass'|'dirt'|'sand'|'paddy'...
   *  colorAt(x,z,h,edgeDist,slope) -> [r,g,b] (linear 0..1)
   */
  constructor(track, o) {
    this.track = track;
    this.o = o;
    this.natural = o.natural;
    this.shoulder = o.shoulder ?? 2.5;
    this.blend = o.blend ?? 18;
    this.roadDrop = o.roadDrop ?? 0.05;
    this.waterLevelAt = o.waterLevelAt || (() => -Infinity);
    this.surfaceAt = o.surfaceAt || (() => 'grass');
    this.colorAt = o.colorAt || null;
    this._proj = Track.newProj();
    this._buildInfluence();
  }

  _buildInfluence() {
    const t = this.track;
    let maxW = 0;
    for (let i = 0; i < t.count; i++) maxW = Math.max(maxW, t.w[i]);
    const R = maxW + this.shoulder + this.blend + 8;
    const cell = 4;
    const b = t.bounds;
    this._icell = cell;
    this._iminX = b.min.x - R - cell;
    this._iminZ = b.min.z - R - cell;
    this._inx = Math.ceil((b.max.x - b.min.x + 2 * R) / cell) + 3;
    this._inz = Math.ceil((b.max.z - b.min.z + 2 * R) / cell) + 3;
    const N = this._inx * this._inz;
    const best = new Float32Array(N).fill(Infinity);
    const idx = new Int32Array(N).fill(-1);
    for (let i = 0; i < t.count; i++) {
      const px = t.px[i], pz = t.pz[i];
      const r = t.w[i] + this.shoulder + this.blend + 8;
      const c0 = Math.max(0, Math.floor((px - r - this._iminX) / cell));
      const c1 = Math.min(this._inx - 1, Math.floor((px + r - this._iminX) / cell));
      const r0 = Math.max(0, Math.floor((pz - r - this._iminZ) / cell));
      const r1 = Math.min(this._inz - 1, Math.floor((pz + r - this._iminZ) / cell));
      for (let cz = r0; cz <= r1; cz++) {
        const z = this._iminZ + (cz + 0.5) * cell;
        for (let cx = c0; cx <= c1; cx++) {
          const x = this._iminX + (cx + 0.5) * cell;
          const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
          const k = cz * this._inx + cx;
          if (d2 < r * r && d2 < best[k]) {
            best[k] = d2;
            idx[k] = i;
          }
        }
      }
    }
    this._iidx = idx;
  }

  _hint(x, z) {
    const cx = Math.floor((x - this._iminX) / this._icell);
    const cz = Math.floor((z - this._iminZ) / this._icell);
    if (cx < 0 || cz < 0 || cx >= this._inx || cz >= this._inz) return -1;
    return this._iidx[cz * this._inx + cx];
  }

  /** Full terrain sample. out: { h, natural, edge (m beyond road edge, <0 under road), s, d, follow } */
  sample(x, z, out = {}) {
    const n = this.natural(x, z);
    out.natural = n;
    out.edge = Infinity;
    out.follow = false;
    out.s = -1;
    out.d = 0;
    const hint = this._hint(x, z);
    if (hint < 0) {
      out.h = n;
      return out;
    }
    const t = this.track;
    const p = t.project(x, t.py[hint], z, hint, this._proj);
    out.s = p.s;
    out.d = p.d;
    if (t.flags[p.index] & Track.FLAGS.NO_TERRAIN_FOLLOW) {
      out.h = n;
      out.edge = Math.abs(p.d) - p.width;
      return out;
    }
    const W = p.width;
    const e = Math.abs(p.d) - W;
    out.edge = e;
    out.follow = true;
    const fr = p.frame;
    const rh = Math.hypot(fr.right.x, fr.right.z) || 1;
    const dEdge = clamp(p.d, -W, W);
    const edgeY = fr.pos.y + (fr.right.y / rh) * dEdge;
    if (e <= 0) out.h = edgeY - 0.12;
    else if (e < this.shoulder) out.h = edgeY - this.roadDrop;
    else out.h = lerp(edgeY - this.roadDrop, n, smoothstep(0, this.blend, e - this.shoulder));
    return out;
  }

  heightAt(x, z) {
    return this.sample(x, z, _s).h;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.6;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    out.set(hl - hr, 2 * e, hd - hu).normalize();
    return out;
  }

  /** Build the render mesh: dense grid around the track, growing spacing toward the horizon. */
  buildMesh({ res = 2, margin = 90, outer = 1800, growth = 1.13 } = {}) {
    const b = this.track.bounds;
    const axis = (lo, hi) => {
      const xs = [];
      const a = Math.floor((lo - margin) / res) * res;
      const c = Math.ceil((hi + margin) / res) * res;
      for (let v = a; v <= c + 1e-6; v += res) xs.push(v);
      let step = res;
      let v = a;
      const left = [];
      while (v > lo - outer) { step *= growth; v -= step; left.push(v); }
      step = res;
      v = c;
      const right = [];
      while (v < hi + outer) { step *= growth; v += step; right.push(v); }
      return [...left.reverse(), ...xs, ...right];
    };
    const xs = axis(b.min.x, b.max.x);
    const zs = axis(b.min.z, b.max.z);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const s = {};
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = xs[i], z = zs[j];
        this.sample(x, z, s);
        pos[k * 3] = x;
        pos[k * 3 + 1] = s.h;
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 5;
        uv[k * 2 + 1] = z / 5;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b2 = a + 1, c = a + nx, d = c + 1;
        // alternate diagonal for less directional artifacts
        if ((i + j) & 1) {
          idx[q++] = a; idx[q++] = c; idx[q++] = b2;
          idx[q++] = b2; idx[q++] = c; idx[q++] = d;
        } else {
          idx[q++] = a; idx[q++] = c; idx[q++] = d;
          idx[q++] = a; idx[q++] = d; idx[q++] = b2;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    // colors (need normals for slope)
    const nor = geo.attributes.normal;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = xs[i], z = zs[j];
        this.sample(x, z, s);
        const slope = 1 - nor.getY(k);
        const c = this.colorAt ? this.colorAt(x, z, s.h, s.edge, slope, s) : [0.3, 0.45, 0.2];
        col[k * 3] = c[0];
        col[k * 3 + 1] = c[1];
        col[k * 3 + 2] = c[2];
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();

    const detail = canvasTexture('terrainDetail', 512, 512, (g, w, h) => {
      g.fillStyle = '#b8b8b8';
      g.fillRect(0, 0, w, h);
      let seed = 7;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 9000; i++) {
        const x = r() * w, y = r() * h;
        const l = 150 + r() * 105;
        g.strokeStyle = `rgba(${l},${l},${l},${0.25 + r() * 0.35})`;
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 7);
        g.stroke();
      }
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = `rgba(60,60,60,${r() * 0.18})`;
        g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4);
      }
    });
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detail,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    });
    mat.name = 'terrain';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain';
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
    return mesh;
  }
}

const _s = {};
