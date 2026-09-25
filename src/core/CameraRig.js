// Chase camera with smoothing, speed-dependent FOV, drift swing, shake, and cinematic modes.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _look = new THREE.Vector3();

export class CameraRig {
  constructor(camera, ground) {
    this.camera = camera;
    this.ground = ground;
    this.mode = 'chase';
    this.target = null;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.fov = 62;
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.lookBack = false;
    this.height = 2.0;
    this.dist = 4.7;
    this.cine = null; // { shots: [{from, to, look, lookTo, dur}], t, i, done }
    this._gq = {};
  }

  snapTo(kart) {
    this.target = kart;
    this.yaw = kart.heading;
    const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.copy(kart.pos).addScaledVector(f, -this.dist).add(_w.set(0, this.height, 0));
    this.lookAt.copy(kart.pos).addScaledVector(f, 3).add(_w.set(0, 1.0, 0));
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.lookAt);
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** Play a sequence of cinematic camera moves. shots: [{from:[x,y,z], to:[x,y,z], look:[x,y,z], lookTo?, dur}] */
  playCinematic(shots, onDone) {
    this.mode = 'cine';
    this.cine = { shots, t: 0, i: 0, onDone };
  }

  update(dt) {
    const cam = this.camera;
    if (this.mode === 'cine' && this.cine) {
      const c = this.cine;
      const sh = c.shots[c.i];
      c.t += dt;
      const k = Math.min(1, c.t / sh.dur);
      const e = k * k * (3 - 2 * k);
      if (sh.path) {
        // fly along the track: { track, s0, s1, h, d, ahead }
        const p = sh.path;
        const s = p.s0 + (p.s1 - p.s0) * (sh.ease === false ? k : e * 0.5 + k * 0.5);
        cam.position.copy(p.track.pointAt(s, p.d ?? 0, p.h ?? 2.5, _v));
        const la = p.track.pointAt(s + (p.ahead ?? 12), (p.d ?? 0) * 0.5, (p.h ?? 2.5) * 0.6, _w);
        cam.lookAt(la);
      } else {
        const from = _v.fromArray(sh.from), to = _w.fromArray(sh.to);
        cam.position.lerpVectors(from, to, sh.ease === false ? k : e);
        const la = new THREE.Vector3().fromArray(sh.look);
        if (sh.lookTo) la.lerp(new THREE.Vector3().fromArray(sh.lookTo), e);
        cam.lookAt(la);
      }
      cam.fov = sh.fov ?? 55;
      cam.updateProjectionMatrix();
      if (c.t >= sh.dur) {
        c.i++;
        c.t = 0;
        if (c.i >= c.shots.length) {
          this.cine = null;
          this.mode = 'chase';
          if (this.target) this.snapTo(this.target);
          if (c.onDone) c.onDone();
        }
      }
      return;
    }
    const k = this.target;
    if (!k) return;

    if (this.mode === 'orbit') {
      // finish orbit around the kart
      this._orbit = (this._orbit || 0) + dt * 0.35;
      const a = k.heading + Math.PI + this._orbit;
      const p = _v.set(Math.sin(a) * 8.5, 4.2, Math.cos(a) * 8.5).add(k.pos);
      cam.position.lerp(p, Math.min(1, dt * 3));
      _look.copy(k.pos).add(_w.set(0, 1.0, 0));
      cam.lookAt(_look);
      cam.fov += (50 - cam.fov) * Math.min(1, dt * 2);
      cam.updateProjectionMatrix();
      return;
    }

    // chase
    const speed = Math.abs(k.speed);
    const sp01 = Math.min(1.3, speed / 30);
    let targetYaw = k.heading;
    // when drifting, let the camera lag so the kart swings sideways in frame
    const driftLag = k.driftVisual * -0.28;
    targetYaw += driftLag;
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const yawRate = k.grounded ? 6.5 : 3.5;
    this.yaw += dy * Math.min(1, dt * yawRate);

    let dist = this.dist + sp01 * 0.9;
    let height = this.height + sp01 * 0.15;
    if (!k.grounded) {
      height += Math.min(1.8, k.airTime * 2.5);
      dist += Math.min(1.5, k.airTime * 1.5);
    }
    if (k.glide.active) {
      height += 1.2;
      dist += 1.6;
    }
    const back = this.lookBack ? -1 : 1;
    const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(back);
    const desired = _w.copy(k.pos).addScaledVector(f, -dist);
    desired.y = k.pos.y + height;
    // follow vertical more loosely when airborne (gives a sense of height)
    const posRate = this.lookBack ? 30 : 10;
    this.pos.x += (desired.x - this.pos.x) * Math.min(1, dt * posRate);
    this.pos.z += (desired.z - this.pos.z) * Math.min(1, dt * posRate);
    this.pos.y += (desired.y - this.pos.y) * Math.min(1, dt * (k.grounded ? 8 : 4));
    // keep above ground
    const g = this.ground.query(this.pos.x, this.pos.y, this.pos.z, k.trackIndex, this._gq);
    const minY = Math.max(g.y, g.waterY) + 0.8;
    if (this.pos.y < minY) this.pos.y = minY;

    _look.copy(k.pos).addScaledVector(f, 3.2);
    _look.y = k.pos.y + 1.05 + (k.glide.active ? -0.5 : 0);
    this.lookAt.lerp(_look, Math.min(1, dt * 14));

    cam.position.copy(this.pos);
    // shake
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 40;
      const s = this.shakeAmt;
      cam.position.x += Math.sin(this.shakeT * 1.3) * s * 0.3;
      cam.position.y += Math.sin(this.shakeT * 1.7 + 1.0) * s * 0.3;
      this.shakeAmt *= Math.exp(-dt * 7);
    }
    // subtle speed rumble
    if (k.boostT > 0) {
      cam.position.y += Math.sin(performance.now() * 0.05) * 0.02;
    }
    cam.lookAt(this.lookAt);
    const boost = k.boostT > 0 ? 1 : 0;
    const targetFov = 62 + sp01 * 9 + boost * 7;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }
}
