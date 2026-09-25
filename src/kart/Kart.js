// Arcade kart physics (fixed-step). One instance per racer.
// Coordinate conventions: +Y up, heading = yaw angle, forward = (sin h, 0, cos h).
// steer +1 = right turn (heading decreases). Right vector = (-cos h, 0, sin h).
import * as THREE from 'three';
import { Track } from '../track/Track.js';

export const DIFFICULTY = {
  '50cc': { maxSpeed: 23, accel: 13, ai: 0.9 },
  '100cc': { maxSpeed: 27, accel: 15, ai: 0.96 },
  '150cc': { maxSpeed: 31.5, accel: 17, ai: 1.0 },
};

const GRAVITY = 30;
const SURFACE_SPEED = { road: 1.0, dirt: 0.82, sand: 0.7, grass: 0.62, paddy: 0.52, water: 0.5, shallow: 0.5 };

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _n = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class Kart {
  /**
   * @param {object} world { track, ground (Ground), stage }
   * @param {object} o { id, character, stats, isPlayer, difficulty }
   */
  constructor(world, o) {
    this.world = world;
    this.track = world.track;
    this.id = o.id;
    this.character = o.character;
    this.name = o.name || o.character;
    this.isPlayer = !!o.isPlayer;
    this.color = o.color || '#ffffff';
    const diff = DIFFICULTY[o.difficulty || '100cc'];
    const st = o.stats || { speed: 3, accel: 3, handling: 3, weight: 3 };
    this.stats = st;
    this.baseMax = diff.maxSpeed * (0.965 + 0.0175 * st.speed);
    this.accelRate = diff.accel * (0.84 + 0.08 * st.accel);
    this.turnMul = 0.9 + 0.05 * st.handling;
    this.weight = 0.8 + 0.1 * st.weight;
    this.radius = 0.95;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.up = new THREE.Vector3(0, 1, 0); // smoothed ground normal (visual)
    this.groundN = new THREE.Vector3(0, 1, 0);
    this.grounded = true;
    this.airTime = 0;
    this.speed = 0; // forward speed (signed)
    this.steerSmooth = 0;
    this.throttle = 0;
    this.surface = 'road';
    this.onRoad = true;

    this.drift = { active: false, dir: 0, charge: 0, level: 0, pendingHop: false, hopT: 0 };
    this.hopQueued = false;
    this.boostT = 0;
    this.boostPower = 0;
    this.boostKind = '';
    this.glide = { active: false, open: 0, t: 0 };
    this.trick = { t: -1, type: 'flip', window: 0, done: false };
    this.spin = { t: -1, dur: 1.1, kind: 'spin' };
    this.squash = 0;
    this.invincibleT = 0; // manekineko
    this.safeT = 0; // post-hit immunity
    this.starT = 0;
    this.shrinkT = 0;
    this.rampLaunch = null;
    this.lastRamp = null;
    this.onRampPrev = null;
    this.respawnT = -1;
    this.respawnS = 0;
    this.lastSafeS = 0;
    this.lastSafeD = 0;

    this.proj = Track.newProj();
    this.trackIndex = -1;
    this.s = 0;
    this.lapCount = 0;
    this.raceDist = 0;
    this.finished = false;
    this.finishTime = null;
    this.lapTimes = [];
    this.lapStart = 0;
    this.wrongWayT = 0;
    this.coins = 0;
    this.item = null;
    this.itemCount = 0;
    this.itemRoulette = 0;
    this.position = 1;

    this.events = []; // {type, ...} consumed by the game (sound / fx / ui)
    this.visualYaw = 0; // extra yaw (spin-out) for rendering
    this.driftVisual = 0;
    this.frozen = true; // until race start
    this.wallCooldown = 0;
    this._hopLandT = -10;
    this._time = 0;
    this._jumpHeld = false;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  place(s, d, heading = null) {
    const t = this.track;
    const fr = t.frameAt(s);
    this.pos.copy(fr.pos).addScaledVector(fr.right, d);
    const g = this.world.ground.query(this.pos.x, this.pos.y + 2, this.pos.z, t.idx(s), _gq);
    this.pos.y = g.y;
    this.heading = heading != null ? heading : Math.atan2(fr.tan.x, fr.tan.z);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.grounded = true;
    this.trackIndex = t.idx(s);
    this.s = t.wrapS(s);
    this.lastSafeS = this.s;
    this.lastSafeD = d;
    this.groundN.copy(g.normal);
    this.up.copy(g.normal);
  }

  get maxSpeed() {
    return this.baseMax * (1 + 0.006 * this.coins) * (this.rubberMul ?? 1);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  addBoost(time, power, kind = 'boost') {
    this.boostT = Math.max(this.boostT, time);
    this.boostPower = Math.max(this.boostT > 0 ? this.boostPower : 0, power);
    this.boostKind = kind;
    this.emit('boost', { kind, power });
  }

  /** Hit by an item / hazard. kind: 'spin' | 'tumble' | 'squash' */
  hit(kind = 'spin', { ignoreSafe = false } = {}) {
    if (this.invincibleT > 0) return false;
    if (this.safeT > 0 && !ignoreSafe) return false;
    if (this.respawnT >= 0) return false;
    this.spin.t = 0;
    this.spin.kind = kind;
    this.spin.dur = kind === 'tumble' ? 1.6 : kind === 'squash' ? 1.0 : 1.15;
    this.drift.active = false;
    this.drift.level = 0;
    this.boostT = 0;
    this.glide.active = false;
    if (kind === 'tumble') this.vel.y = Math.max(this.vel.y, 7);
    this.safeT = this.spin.dur + 1.2;
    this.emit('hit', { kind });
    return true;
  }

  startRespawn(reason = 'fall') {
    if (this.respawnT >= 0) return;
    this.respawnT = 0;
    const gap = this.track.inGap(this.s);
    this.respawnS = gap ? gap.respawn : this.lastSafeS;
    this.respawnD = gap ? 0 : Math.max(-this.track.w[this.track.idx(this.respawnS)] + 2, Math.min(this.track.w[this.track.idx(this.respawnS)] - 2, this.lastSafeD));
    this.glide.active = false;
    this.drift.active = false;
    this.boostT = 0;
    this.emit('respawn_start', { reason });
  }

  /**
   * One physics step.
   * c: { steer, accel, brake, jump, jumpPressed } (already latched for this step)
   */
  step(dt, c, time) {
    const t = this.track;
    this._time = time;
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.safeT = Math.max(0, this.safeT - dt);
    this.invincibleT = Math.max(0, this.invincibleT - dt);
    this.squash = Math.max(0, this.squash - dt * 3.5);

    // ---------- respawn sequence ----------
    if (this.respawnT >= 0) {
      this.respawnT += dt;
      if (this.respawnT >= 0.9 && !this._respawnPlaced) {
        this._respawnPlaced = true;
        this.place(this.respawnS, this.respawnD);
        this.pos.y += 3.0;
        this.grounded = false;
        this.emit('respawn_place');
      }
      if (this.respawnT >= 0.9) {
        // fall gently onto the track
        this.vel.set(0, -4, 0);
        this.pos.y += this.vel.y * dt;
        const g = this.world.ground.query(this.pos.x, this.pos.y, this.pos.z, this.trackIndex, _gq);
        if (this.pos.y <= g.y) {
          this.pos.y = g.y;
          this.respawnT = -1;
          this._respawnPlaced = false;
          this.grounded = true;
          this.safeT = 1.5;
          this.emit('respawn_done');
        }
      }
      this._updateProgress(time, dt);
      return;
    }

    const frozen = this.frozen;
    let steer = frozen ? 0 : c.steer;
    let accel = frozen ? 0 : c.accel;
    let brake = frozen ? 0 : c.brake;
    let jump = frozen ? false : c.jump;
    let jumpPressed = frozen ? false : c.jumpPressed;
    this._jumpHeld = jump;

    // spin-out: no control
    if (this.spin.t >= 0) {
      this.spin.t += dt;
      const k = this.spin.t / this.spin.dur;
      this.visualYaw = this.spin.kind === 'squash' ? 0 : -Math.PI * 4 * easeOut(Math.min(1, k));
      steer = 0; accel = 0; brake = 0; jump = false; jumpPressed = false;
      if (k >= 1) {
        this.spin.t = -1;
        this.visualYaw = 0;
      }
    }

    // steering smoothing (keyboards are digital)
    const sr = Math.abs(steer) > Math.abs(this.steerSmooth) ? 7 : 10;
    this.steerSmooth += (steer - this.steerSmooth) * Math.min(1, sr * dt);
    steer = this.steerSmooth;
    this.throttle = accel;

    // ---------- ground info at current position ----------
    const g = this.world.ground.query(this.pos.x, this.pos.y, this.pos.z, this.trackIndex, _gq);
    this.trackIndex = g.proj.index;

    // ---------- boost timer ----------
    if (this.boostT > 0) {
      this.boostT -= dt;
      if (this.boostT <= 0) { this.boostT = 0; this.boostPower = 0; }
    }
    const boosting = this.boostT > 0 || this.invincibleT > 0;
    const boostExtra = this.boostT > 0 ? this.boostPower : 0;
    const starExtra = this.invincibleT > 0 ? 5 : 0;

    const fwd = this.forward(_f);
    if (this.grounded) {
      // basis on the ground plane
      const n = _n.copy(g.normal);
      fwd.addScaledVector(n, -fwd.dot(n));
      if (fwd.lengthSq() < 1e-6) fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      fwd.normalize();
      const right = _r.crossVectors(fwd, n).normalize();
      let vF = this.vel.dot(fwd);
      let vR = this.vel.dot(right);

      // surface
      this.surface = g.surface;
      this.onRoad = g.surface === 'road';
      let surfMul = SURFACE_SPEED[g.surface] ?? 0.6;
      if (boosting) surfMul = Math.max(surfMul, 0.95);
      const vmax = this.maxSpeed * surfMul + boostExtra + starExtra;

      // longitudinal
      if (accel > 0.05 && vF > -0.5) {
        if (vF < vmax) {
          const x = Math.max(0, vF / Math.max(1, vmax));
          vF += this.accelRate * accel * Math.max(0.12, 1 - Math.pow(x, 1.9)) * dt;
          if (boosting) vF += 18 * dt;
          vF = Math.min(vF, vmax + 0.01);
        }
      }
      if (vF > vmax) vF -= Math.min(vF - vmax, (vF - vmax) * 1.3 * dt + 4 * dt);
      if (brake > 0.05) {
        if (vF > 0.8) vF -= 26 * brake * dt;
        else vF = Math.max(-9, vF - 9 * brake * dt);
      }
      if (accel <= 0.05 && brake <= 0.05) {
        const dec = (this.onRoad ? 4.5 : 9) * dt;
        vF = Math.abs(vF) < dec ? 0 : vF - Math.sign(vF) * dec;
      }
      if (accel > 0.05 && vF < -0.5) vF += 20 * dt; // accelerating out of reverse
      // gravity along slope (mild, arcade)
      vF -= GRAVITY * fwd.y * 0.55 * dt;

      // ---------- hop & drift ----------
      const doHop = jumpPressed && this.spin.t < 0;
      if (!this.drift.active && jump && time - this._hopLandT < 0.25 && Math.abs(steer) > 0.4 && vF > 10 && this.spin.t < 0) {
        this.drift.active = true;
        this.drift.dir = Math.sign(steer);
        this.drift.charge = 0;
        this.drift.level = 0;
        this.emit('drift_start', { dir: this.drift.dir });
      }
      if (this.drift.active) {
        const d = this.drift;
        if (!jump || vF < 9 || !this.onRoad && g.surface !== 'dirt' && !boosting && vF < 12) {
          this._releaseDrift();
        } else {
          const into = Math.max(0, steer * d.dir);
          d.charge += dt * (0.75 + 0.9 * into);
          const newLevel = d.charge > 3.3 ? 3 : d.charge > 2.05 ? 2 : d.charge > 0.95 ? 1 : 0;
          if (newLevel > d.level) {
            d.level = newLevel;
            this.emit('drift_level', { level: newLevel });
          }
        }
      }

      // ---------- steering ----------
      const spd = Math.abs(vF);
      let yawRate;
      if (this.drift.active) {
        const d = this.drift;
        const rel = steer * d.dir; // -1 (wide) .. +1 (tight)
        yawRate = d.dir * (1.05 + (rel > 0 ? rel * 0.85 : rel * 0.6)) * Math.min(1, spd / 12) * this.turnMul;
      } else {
        const low = Math.min(1, spd / 6);
        const turn = 2.05 - 0.55 * Math.min(1, spd / this.maxSpeed);
        yawRate = steer * turn * low * this.turnMul;
        if (vF < -0.5) yawRate = -yawRate;
        if (!this.onRoad) yawRate *= 0.9;
      }
      this.heading -= yawRate * dt;

      // lateral grip
      const grip = this.drift.active ? 5.5 : this.onRoad ? 14 : 9;
      vR *= Math.exp(-grip * dt);
      // recompose (drop normal component: we are on the ground)
      this.vel.copy(fwd).multiplyScalar(vF).addScaledVector(right, vR);
      this.speed = vF;
      if (doHop) this._hop(n);

      // dash panel
      const bp = t.boostAt(g.proj.s, g.proj.d);
      if (bp && g.surface === 'road' && this.pos.y - g.roadY < 0.6) {
        if (!this._onDash) this.addBoost(1.25, 10, 'dash');
        this._onDash = true;
        this.boostT = Math.max(this.boostT, 0.9);
      } else this._onDash = false;

      // remember ramp under us
      this.onRampPrev = g.ramp;
      if (g.ramp) this.lastRamp = g.ramp;
      this.airTime = 0;
    } else {
      // ---------- airborne ----------
      this.airTime += dt;
      if (this.glide.active) {
        this._glideStep(dt, steer, accel, brake);
      } else {
        this.vel.y -= GRAVITY * dt;
        // light air control
        const yaw = steer * 0.9 * dt;
        this.heading -= yaw;
        const h = Math.hypot(this.vel.x, this.vel.z);
        if (h > 0.1) {
          // rotate horizontal velocity toward heading slowly
          const want = Math.atan2(this.vel.x, this.vel.z);
          let dh = this.heading - want;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          const rot = dh * Math.min(1, 1.2 * dt);
          const a = want + rot;
          this.vel.x = Math.sin(a) * h;
          this.vel.z = Math.cos(a) * h;
        }
        if (this.drift.active && !jump) this._releaseDrift();
      }
      // tricks
      if (jumpPressed && this.trick.window > 0 && this.trick.t < 0 && this.spin.t < 0) {
        this.trick.t = 0;
        this.trick.type = ['flip', 'spin', 'roll'][Math.floor(Math.random() * 3)];
        this.trick.done = false;
        this.emit('trick');
      }
      this.speed = this.vel.dot(this.forward(_tmp));
    }
    if (this.trick.window > 0) this.trick.window -= dt;
    if (this.trick.t >= 0) {
      this.trick.t += dt / 0.5;
      if (this.trick.t >= 1) {
        this.trick.t = -1;
        this.trick.done = true;
      }
    }
    // spin-out friction
    if (this.spin.t >= 0) {
      const k = this.spin.kind === 'squash' ? 5 : 2.2;
      this.vel.x *= Math.exp(-k * dt);
      this.vel.z *= Math.exp(-k * dt);
    }

    // ---------- integrate ----------
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);

    // ---------- ground contact ----------
    const g2 = this.world.ground.query(this.pos.x, this.pos.y, this.pos.z, this.trackIndex, _gq);
    this.trackIndex = g2.proj.index;
    if (this.grounded) {
      const drop = this.pos.y - g2.y;
      const snap = 0.25 + Math.abs(this.speed) * dt * 0.9;
      const leavingRamp = this.onRampPrev && !g2.ramp;
      // convex crest: leave the ground when v^2 * curvature exceeds gravity
      const hv = Math.hypot(this.vel.x, this.vel.z);
      let crest = false;
      if (hv > 8) {
        const fx = this.vel.x / hv, fz = this.vel.z / hv;
        const dn = (g2.normal.x - this.groundN.x) * fx + (g2.normal.z - this.groundN.z) * fz;
        const kappa = dn / Math.max(0.02, hv * dt);
        crest = kappa * hv * hv > GRAVITY * 1.15;
      }
      if (!leavingRamp && !crest && drop < snap && drop > -1.5 && !this._hopping) {
        this.pos.y = g2.y;
        const vn = this.vel.dot(g2.normal);
        this.vel.addScaledVector(g2.normal, -vn);
        this.groundN.copy(g2.normal);
      } else if (drop < -1.5 && g2.surface !== 'none') {
        // stepped into a big wall of ground (shouldn't happen) -> push up
        this.pos.y = g2.y;
      } else {
        this._leaveGround(leavingRamp ? this.onRampPrev : null);
      }
    } else if (this.pos.y <= g2.y && this.vel.y <= 0.5) {
      this._land(g2, prevY);
    }
    this._hopping = false;

    // ---------- walls ----------
    this._walls();

    // ---------- visual up vector smoothing ----------
    const targetUp = this.grounded ? this.groundN : _tmp.set(0, 1, 0);
    this.up.lerp(targetUp, Math.min(1, dt * (this.grounded ? 12 : 3))).normalize();

    // ---------- water / fall checks ----------
    if (!this.glide.active) {
      if (g2.surface === 'deep' && this.pos.y < g2.waterY + 0.2) this.startRespawn('water');
      if (this.pos.y < (this.world.stage.killY ?? -30)) this.startRespawn('fall');
      const gap = t.inGap(this.s);
      if (gap && this.pos.y < gap.killY && !this.grounded) this.startRespawn('fall');
    }
    if (this.grounded && g2.surface !== 'deep' && Math.abs(g2.proj.d) < g2.proj.width + 3 && !t.inGap(g2.proj.s)) {
      this.lastSafeS = g2.proj.s;
      this.lastSafeD = g2.proj.d;
    }
    if (this.grounded && (g2.surface === 'water' || g2.surface === 'paddy') && Math.abs(this.speed) > 6 && Math.random() < dt * 30) {
      this.emit('splash_fx');
    }

    // drift visual angle
    const dv = this.drift.active ? this.drift.dir : 0;
    this.driftVisual += (dv - this.driftVisual) * Math.min(1, dt * 8);

    this._updateProgress(time, dt);
  }

  _hop(n) {
    if (!this.grounded) return;
    this.vel.addScaledVector(n, 4.2);
    this.grounded = false;
    this._hopping = true;
    this.hopLand = true;
    this.emit('hop');
  }

  _leaveGround(ramp) {
    this.grounded = false;
    this.airTime = 0;
    if (ramp) {
      // ramp launch
      const up = ramp.type === 'glide' ? ramp.launch : ramp.launch;
      this.vel.y = Math.max(this.vel.y, up);
      const h = Math.hypot(this.vel.x, this.vel.z);
      if (h < 16) {
        const k = 16 / Math.max(0.1, h);
        this.vel.x *= k;
        this.vel.z *= k;
      }
      this.trick.window = 0.45;
      if (ramp.type === 'glide') {
        this.glide.active = true;
        this.glide.t = 0;
        this.emit('glide_start');
      }
      this.emit('launch', { ramp: ramp.type });
      if (this.drift.active) this._releaseDrift();
    } else if (!this.hopLand && Math.abs(this.speed) > 12) {
      // natural crest jump: allow tricks too
      this.trick.window = 0.3;
    }
  }

  _land(g, prevY) {
    const impact = -this.vel.y;
    this.pos.y = g.y;
    const vn = this.vel.dot(g.normal);
    if (vn < 0) this.vel.addScaledVector(g.normal, -vn);
    this.grounded = true;
    this.groundN.copy(g.normal);
    const wasGliding = this.glide.active;
    this.glide.active = false;
    if (this.airTime > 0.42 || impact > 7) {
      this.squash = Math.min(1, impact / 14);
      this.emit('land', { impact, airTime: this.airTime });
    }
    if (wasGliding) this.emit('glide_end');
    // trick landing boost
    if (this.trick.done || this.trick.t >= 0) {
      this.trick.t = -1;
      this.trick.done = false;
      this.addBoost(0.8, 6, 'trick');
      this.emit('trick_land');
    }
    this.trick.window = 0;
    // hop landing -> start drift if steering
    if (this.hopLand) {
      this.hopLand = false;
      this._hopLandT = this._time;
      const st = this.steerSmooth;
      if (this._jumpHeld && Math.abs(st) > 0.25 && Math.abs(this.speed) > 10 && this.spin.t < 0) {
        this.drift.active = true;
        this.drift.dir = Math.sign(st);
        this.drift.charge = 0;
        this.drift.level = 0;
        this.emit('drift_start', { dir: this.drift.dir });
      }
    }
    this.airTime = 0;
  }

  _releaseDrift() {
    const d = this.drift;
    if (!d.active) return;
    d.active = false;
    if (d.level >= 1) {
      const table = { 1: [0.65, 5.5], 2: [1.15, 6.5], 3: [1.8, 7.5] };
      const [tm, pw] = table[d.level];
      this.addBoost(tm, pw, 'turbo' + d.level);
    }
    d.level = 0;
    d.charge = 0;
    this.emit('drift_end');
  }

  _glideStep(dt, steer, accel, brake) {
    const gl = this.glide;
    gl.t += dt;
    gl.open = Math.min(1, gl.open + dt * 3);
    // horizontal speed control
    let h = Math.hypot(this.vel.x, this.vel.z);
    const pitchUp = brake > 0.05;
    const target = pitchUp ? 19 : 25 + (this.boostT > 0 ? this.boostPower : 0);
    h += (target - h) * Math.min(1, dt * 0.8);
    // descent
    const vyT = pitchUp ? -2.4 : -5.0;
    if (gl.t < 0.35) this.vel.y -= GRAVITY * 0.6 * dt; // initial rise decays
    else this.vel.y += (vyT - this.vel.y) * Math.min(1, dt * 2.2);
    this.heading -= steer * 1.25 * dt;
    this.vel.x = Math.sin(this.heading) * h;
    this.vel.z = Math.cos(this.heading) * h;
  }

  _walls() {
    const t = this.track;
    const p = t.project(this.pos.x, this.pos.y, this.pos.z, this.trackIndex, this.proj);
    this.trackIndex = p.index;
    if (this.glide.active && this.pos.y > p.frame.pos.y + 3) return; // flying over
    const i = p.index;
    const wl = t.wallL[i], wr = t.wallR[i];
    const r = 0.8;
    let pen = 0;
    let side = 0;
    if (p.d > wr - r) { pen = p.d - (wr - r); side = 1; }
    else if (p.d < -(wl - r)) { pen = -(wl - r) - p.d; side = -1; }
    // props (trees, poles, houses)
    const cg = this.world.colliders;
    if (cg && !(this.glide.active && this.pos.y > p.frame.pos.y + 2)) {
      const hit = cg.resolve(this.pos, 0.85);
      if (hit) {
        const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
        if (vn < 0) {
          this.vel.x -= hit.nx * vn * 1.3;
          this.vel.z -= hit.nz * vn * 1.3;
          if (-vn > 4 && this.wallCooldown <= 0) {
            this.wallCooldown = 0.35;
            this.vel.x *= 0.85;
            this.vel.z *= 0.85;
            this.emit('wall', { impact: -vn });
          }
        }
      }
    }
    if (pen > 0) {
      const R = p.frame.right;
      const rh = Math.hypot(R.x, R.z) || 1;
      const nx = (R.x / rh) * side, nz = (R.z / rh) * side; // outward normal
      this.pos.x -= nx * pen;
      this.pos.z -= nz * pen;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn > 0) {
        this.vel.x -= nx * vn * 1.35;
        this.vel.z -= nz * vn * 1.35;
        if (vn > 4 && this.wallCooldown <= 0) {
          this.vel.x *= 0.9;
          this.vel.z *= 0.9;
          this.wallCooldown = 0.35;
          this.emit('wall', { impact: vn });
        }
      }
    }
  }

  _updateProgress(time, dt = 1 / 120) {
    const t = this.track;
    const p = t.project(this.pos.x, this.pos.y, this.pos.z, this.trackIndex, this.proj);
    this.trackIndex = p.index;
    const prevS = this.s;
    const s = p.s;
    const L = t.length;
    if (prevS > L * 0.75 && s < L * 0.25) {
      this.lapCount++;
      this.emit('lap', { lap: this.lapCount });
    } else if (prevS < L * 0.25 && s > L * 0.75) {
      this.lapCount--;
    }
    this.s = s;
    this.raceDist = (this.lapCount - 1) * L + s;
    // wrong way
    const f = this.forward(_tmp);
    const along = f.x * p.frame.tan.x + f.z * p.frame.tan.z;
    if (along < -0.35 && Math.abs(this.speed) > 3 && !this.frozen) this.wrongWayT += dt;
    else this.wrongWayT = Math.max(0, this.wrongWayT - 2 * dt);
  }

  /** Latch jump-held state (used by drift start on hop landing). */
  setJumpHeld(v) {
    this._jumpHeld = v;
  }

  /** Orientation quaternion for rendering (heading + ground tilt + drift angle + spin). */
  renderQuaternion(out = new THREE.Quaternion()) {
    const yaw = this.heading + this.visualYaw;
    const f = _tmp.set(Math.sin(yaw), 0, Math.cos(yaw));
    const up = this.up;
    f.addScaledVector(up, -f.dot(up)).normalize();
    const right = _r.crossVectors(f, up).normalize();
    // basis: X = -right (model's +X is the kart's left), Y = up, Z = forward
    _m.makeBasis(_left.copy(right).negate(), up, f);
    out.setFromRotationMatrix(_m);
    return out;
  }
}

function easeOut(x) {
  return 1 - Math.pow(1 - x, 2.2);
}

const _gq = {};
const _left = new THREE.Vector3();
