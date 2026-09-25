// Unified ground query for physics: road surface (with ramps / gaps / bridges) or terrain.
import * as THREE from 'three';
import { Track } from './Track.js';

export class Ground {
  /**
   * @param {Track} track
   * @param {import('../world/Terrain.js').Terrain} terrain
   * @param {object} stage { waterLevelAt(x,z), surfaceAt(x,z,sample) }
   */
  constructor(track, terrain, stage) {
    this.track = track;
    this.terrain = terrain;
    this.stage = stage;
    this._ts = {};
  }

  query(x, y, z, hint, out) {
    const t = this.track;
    if (!out.proj) out.proj = Track.newProj();
    if (!out.normal) out.normal = new THREE.Vector3();
    const p = t.project(x, y, z, hint, out.proj);
    out.ramp = null;
    out.waterY = -Infinity;
    out.roadY = p.roadY;
    const i = p.index;
    const gap = (t.flags[i] & Track.FLAGS.GAP) !== 0;
    const W = p.width;
    if (!gap && Math.abs(p.d) <= W + 0.02 && y > p.roadY - 2.5) {
      let h = p.roadY;
      out.normal.copy(p.frame.up);
      const r = t.rampAt(p.s, p.d);
      if (r) {
        h += r.h;
        out.ramp = r.ramp;
        // slope of the ramp profile along the track
        const rr = r.ramp;
        const f = Math.max(0.001, r.f);
        const slope = (rr.h * 1.35 * Math.pow(f, 0.35)) / rr.len;
        out.normal.addScaledVector(p.frame.tan, -slope).normalize();
      }
      out.y = h;
      out.surface = 'road';
      return out;
    }
    const ts = this.terrain.sample(x, z, this._ts);
    out.y = ts.h;
    this.terrain.normalAt(x, z, out.normal);
    const wl = this.stage.waterLevelAt ? this.stage.waterLevelAt(x, z) : -Infinity;
    out.waterY = wl;
    if (wl > ts.h + 0.05) {
      out.surface = wl - ts.h > 1.0 ? 'deep' : this.stage.shallowWater || 'water';
    } else {
      out.surface = this.stage.surfaceAt ? this.stage.surfaceAt(x, z, ts) : 'grass';
    }
    return out;
  }
}
