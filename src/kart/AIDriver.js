// CPU racer: follows a personal racing line, drifts through long corners, uses items,
// performs tricks and gets mild rubber-banding relative to the player.
import * as THREE from 'three';

const _t = new THREE.Vector3();

export class AIDriver {
  constructor(kart, race, { skill = 0.8, seed = 1 } = {}) {
    this.kart = kart;
    this.race = race;
    this.track = kart.track;
    this.skill = skill;
    this.seed = seed;
    this.lineBias = ((seed * 37) % 7) / 3 - 1; // -1..1 personal lateral preference
    this.wander = 0;
    this.wanderT = 0;
    this.driftHold = false;
    this.itemTimer = 1 + ((seed * 13) % 5);
    this.jumpWas = false;
    this.c = { steer: 0, accel: 0, brake: 0, jump: false, jumpPressed: false, itemPressed: false, lookBack: false };
    this.mistakeT = 0;
    this.stuckT = 0;
    this.reverseT = 0;
  }

  /** Racing line lateral offset at s: inside of upcoming curves. */
  lineAt(s) {
    const t = this.track;
    // average curvature over a window ahead
    let c = 0;
    for (let k = 0; k < 6; k++) c += t.curv[t.idx(s + k * 5)];
    c /= 6;
    const w = t.w[t.idx(s)];
    // inside = right for positive curvature (turning right) -> positive d
    let d = THREE.MathUtils.clamp(c * 190, -1, 1) * w * 0.55;
    d += this.lineBias * w * 0.28 + this.wander;
    return THREE.MathUtils.clamp(d, -w + 1.6, w - 1.6);
  }

  update(dt, time) {
    const k = this.kart;
    const t = this.track;
    const c = this.c;
    c.jumpPressed = false;
    c.itemPressed = false;
    c.lookBack = false;
    if (k.frozen || k.finished && k.finishTime != null && time - k.finishTime > 6) {
      c.accel = k.finished ? 0.5 : 0;
      c.steer = 0;
      if (!k.frozen && k.finished) this._steerAlong(dt, 0.6);
      return c;
    }

    // wander (slow noise) for variety
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 1.5 + Math.random() * 2.5;
      this.wanderTarget = (Math.random() - 0.5) * 3.5 * (1.2 - this.skill);
    }
    this.wander += ((this.wanderTarget || 0) - this.wander) * Math.min(1, dt * 0.8);

    const speed = Math.max(0, k.speed);
    // shorter look-ahead in tight bends so the aim point doesn't cut across the inside of hairpins
    let cNear = 0;
    for (let j = 1; j <= 5; j++) cNear = Math.max(cNear, Math.abs(t.curv[t.idx(k.s + j * 4)]));
    const look = (7 + speed * 0.5) / (1 + cNear * 45);
    const sT = k.s + look;
    let dT = this.lineAt(sT);

    // go for item boxes when empty-handed
    if (!k.item && !k.itemRoulette) {
      const box = this.race.items && this.race.items.nearestBoxAhead(k, 45);
      if (box) dT = THREE.MathUtils.lerp(dT, box.d, 0.7);
    }
    // avoid hazards on the road
    if (this.race.items) {
      const hz = this.race.items.hazardAhead(k, 28);
      if (hz) dT = hz.d > dT ? hz.d - 3.2 : hz.d + 3.2;
    }

    const target = t.pointAt(sT, dT, 0, _t);
    const dx = target.x - k.pos.x, dz = target.z - k.pos.z;
    const want = Math.atan2(dx, dz);
    let err = want - k.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    // positive err = target to the left (heading must increase) -> steer negative
    let steer = THREE.MathUtils.clamp(-err * 2.6, -1, 1);

    // speed management: curvature ahead
    let cmax = 0;
    for (let j = 1; j <= 8; j++) cmax = Math.max(cmax, Math.abs(t.curv[t.idx(k.s + j * 6)]));
    const vSafe = Math.sqrt(26 / Math.max(0.0015, cmax));
    let accel = 1, brake = 0;
    if (speed > vSafe * 1.25 && !this.driftHold) { accel = 0; brake = speed > vSafe * 1.45 ? 0.6 : 0; }

    // drifting through long, tight-ish corners
    let curvAhead = 0;
    for (let j = 0; j < 5; j++) curvAhead += t.curv[t.idx(k.s + 4 + j * 5)];
    curvAhead /= 5;
    const tightEnough = Math.abs(curvAhead) > 0.018;
    let jump = false;
    if (k.grounded && !k.glide.active) {
      if (!this.driftHold && tightEnough && speed > 14 && Math.random() < 0.08 * this.skill + 0.02) {
        this.driftHold = true;
        this.driftDir = Math.sign(curvAhead);
        c.jumpPressed = true;
      }
      if (this.driftHold) {
        jump = true;
        // steer into the drift, modulated to stay on line
        if (k.drift.active) {
          // in a drift any steer value still turns toward driftDir (tighter or wider),
          // so plain target-seeking steering picks the right radius
          steer = THREE.MathUtils.clamp(steer * 1.25, -1, 1);
          // release when the corner ends, the mini-turbo is charged, or we must turn the other way
          const ending = Math.abs(curvAhead) < 0.008 || Math.sign(curvAhead) !== this.driftDir;
          const wrongWay = -err * this.driftDir < -0.28;
          if ((ending && k.drift.level >= 1) || k.drift.level >= 3 || (ending && k.drift.charge > 1.8) || wrongWay) {
            this.driftHold = false;
            jump = false;
          }
        } else if (k.grounded && !k.drift.active && time - k._hopLandT > 0.4 && k.airTime === 0 && !c.jumpPressed) {
          // hop didn't turn into a drift
          this.driftHold = false;
          jump = false;
        }
        if (Math.abs(this.kart.proj.d) > t.w[t.idx(k.s)] - 1) {
          this.driftHold = false;
          jump = false;
        }
      }
    }
    // tricks on ramps
    if (!k.grounded && k.trick.window > 0 && k.trick.t < 0 && Math.random() < 0.25 * this.skill) {
      c.jumpPressed = true;
    }
    // gliding: steer toward line, keep nose level
    if (k.glide.active) {
      brake = 0;
      accel = 1;
    }

    // stuck recovery (against a wall)
    if (!k.frozen && speed < 2 && k.grounded && k.spin.t < 0 && k.respawnT < 0) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.5) {
      this.reverseT = 1.0;
      this.stuckT = 0;
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      accel = 0;
      brake = 1;
      steer = -steer;
    }

    // items
    this._items(dt, time);

    c.steer = steer;
    c.accel = accel;
    c.brake = brake;
    c.jump = jump || (this.driftHold && c.jumpPressed);
    return c;
  }

  _steerAlong(dt, accel) {
    const k = this.kart;
    const t = this.track;
    const target = t.pointAt(k.s + 10, this.lineAt(k.s + 10), 0, _t);
    const want = Math.atan2(target.x - k.pos.x, target.z - k.pos.z);
    let err = want - k.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    this.c.steer = THREE.MathUtils.clamp(-err * 2.2, -1, 1);
    this.c.accel = accel;
  }

  _items(dt, time) {
    const k = this.kart;
    const c = this.c;
    if (!k.item || k.itemRoulette > 0) return;
    this.itemTimer -= dt;
    if (this.itemTimer > 0) return;
    const race = this.race;
    const id = k.item;
    let use = false;
    let back = false;
    if (id === 'dango') {
      let cmax = 0;
      for (let j = 1; j <= 6; j++) cmax = Math.max(cmax, Math.abs(this.track.curv[this.track.idx(k.s + j * 8)]));
      use = cmax < 0.012 || k.surface !== 'road';
    } else if (id === 'daruma') {
      const ahead = race.kartAhead(k, 45, 0.25);
      const behind = race.kartBehind(k, 25);
      if (ahead) use = true;
      else if (behind && Math.random() < 0.5) { use = true; back = true; }
      else use = Math.random() < 0.08;
    } else if (id === 'shuriken') {
      use = !!race.kartAhead(k, 120, 1.0) || k.position === 1 && Math.random() < 0.05;
      if (k.position === 1) back = true;
    } else if (id === 'makibishi') {
      use = !!race.kartBehind(k, 30) || Math.random() < 0.05;
      back = true;
    } else {
      use = true;
    }
    if (use) {
      c.itemPressed = true;
      c.itemBack = back;
      this.itemTimer = 0.8 + Math.random() * 2.5;
    } else {
      this.itemTimer = 0.4;
    }
  }
}
