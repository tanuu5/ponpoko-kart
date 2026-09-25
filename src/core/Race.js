// Race logic: grid, countdown (with rocket start), fixed-step simulation, kart-kart
// collisions, positions, laps, finishing.
import * as THREE from 'three';
import { Kart, DIFFICULTY } from '../kart/Kart.js';
import { AIDriver } from '../kart/AIDriver.js';
import { ItemSystem } from '../items/ItemSystem.js';

export const STEP = 1 / 120;

export class Race {
  /**
   * o: { laps, difficulty, player: {character, name, stats, color}, rivals: [{character,name,stats,color}], fx, itemModels, playerGrid }
   */
  constructor(world, o) {
    this.world = world;
    this.track = world.track;
    this.ground = world.ground;
    this.laps = o.laps ?? 3;
    this.difficulty = o.difficulty || '100cc';
    this.fx = o.fx;
    this.karts = [];
    this.ai = [];
    this.state = 'pre';
    this.time = 0; // race clock (starts at GO)
    this.simTime = 0;
    this.countT = 0;
    this.acc = 0;
    this.finishOrder = [];
    this.events = [];
    const all = [o.player, ...o.rivals];
    const gridSlot = Math.min(all.length - 1, o.playerGrid ?? all.length - 1);
    // assign grid slots: player at gridSlot, rivals fill others in order
    const order = [];
    let r = 1;
    for (let slot = 0; slot < all.length; slot++) order.push(slot === gridSlot ? 0 : r++);
    for (let slot = 0; slot < all.length; slot++) {
      const idx = order[slot];
      const def = all[idx];
      const k = new Kart(world, {
        id: idx,
        character: def.character,
        name: def.name,
        stats: def.stats,
        color: def.color,
        isPlayer: idx === 0,
        difficulty: this.difficulty,
      });
      // grid: two columns, staggered
      const row = slot;
      const s = this.track.length - 7 - row * 4.2;
      const d = (row % 2 === 0 ? -1 : 1) * 3.2;
      k.place(s, d);
      k.gridSlot = slot;
      k.lapCount = 0;
      this.karts.push(k);
      if (idx === 0) this.player = k;
      else {
        const skillBase = DIFFICULTY[this.difficulty].ai;
        const skill = Math.min(1, skillBase - 0.1 + (idx / all.length) * 0.15 + Math.random() * 0.05);
        const ai = new AIDriver(k, this, { skill, seed: idx * 7 + 3 });
        k.ai = ai;
        // AI top speed scaling
        k.baseMax *= 0.93 + skill * 0.07;
        this.ai.push(ai);
      }
    }
    this.items = new ItemSystem(this, world.scene, o.itemModels, this.fx);
    this.playerControls = { steer: 0, accel: 0, brake: 0, jump: false, jumpPressed: false, itemPressed: false };
    this._jumpLatch = false;
    this._itemLatch = false;
    this._itemBack = false;
    this.rocket = { firstPress: -1 };
    this.updatePositions();
  }

  startCountdown() {
    this.state = 'countdown';
    this.countT = 0;
    this._lastCount = 4;
  }

  kartAhead(k, range, cone = 0.3) {
    const f = k.forward(_v);
    let best = null, bestD = range;
    for (const o of this.karts) {
      if (o === k) continue;
      const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD || d < 0.5) continue;
      const cos = (dx * f.x + dz * f.z) / d;
      if (cos > 1 - cone) { best = o; bestD = d; }
    }
    return best;
  }

  kartBehind(k, range) {
    const f = k.forward(_v);
    for (const o of this.karts) {
      if (o === k) continue;
      const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < range && (dx * f.x + dz * f.z) / Math.max(d, 0.01) < -0.6) return o;
    }
    return null;
  }

  /** The racer one position ahead (for homing shuriken). */
  kartAheadOf(k) {
    const sorted = this.standings;
    const i = sorted.indexOf(k);
    if (i <= 0) return null;
    return sorted[i - 1];
  }

  updatePositions() {
    const arr = [...this.karts];
    arr.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceDist - a.raceDist;
    });
    arr.forEach((k, i) => (k.position = i + 1));
    this.standings = arr;
  }

  /** Feed player input once per frame. */
  setPlayerInput(c) {
    const p = this.playerControls;
    p.steer = c.steer;
    p.accel = c.accel;
    p.brake = c.brake;
    p.jump = c.jump;
    if (c.jumpPressed) this._jumpLatch = true;
    if (c.itemPressed) {
      this._itemLatch = true;
      this._itemBack = c.brake > 0.5;
    }
  }

  update(dt) {
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= STEP && steps < 30) {
      this._step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= 30) this.acc = 0;
  }

  _step(dt) {
    this.simTime += dt;
    if (this.state === 'countdown') {
      this.countT += dt;
      const n = 3 - Math.floor(this.countT);
      if (n !== this._lastCount && n >= 0) {
        this._lastCount = n;
        this.events.push({ type: 'count', n });
      }
      // rocket start: first accel press timing
      if (this.playerControls.accel > 0.5 && this.rocket.firstPress < 0) this.rocket.firstPress = this.countT;
      if (this.countT >= 3) {
        this.state = 'racing';
        this.time = 0;
        for (const k of this.karts) {
          k.frozen = false;
          k.lapStart = 0;
        }
        const fp = this.rocket.firstPress;
        if (fp >= 1.35 && fp <= 2.15 && this.playerControls.accel > 0.5) {
          this.player.addBoost(1.4, 9, 'rocket');
          this.events.push({ type: 'rocket', good: true });
        } else if (fp >= 0 && fp < 0.9) {
          this.player.hit('spin');
          this.events.push({ type: 'rocket', good: false });
        }
        for (const k of this.karts) {
          if (!k.isPlayer && Math.random() < 0.55) k.addBoost(1.1, 7, 'rocket');
        }
      }
    }
    if (this.state === 'racing' || this.state === 'done') this.time += dt;

    // controls
    for (const k of this.karts) {
      let c;
      if (k.isPlayer && !k.finished && this.autopilot) {
        if (!k._autoAI) k._autoAI = new AIDriver(k, this, { skill: 1, seed: 5 });
        c = k._autoAI.update(dt, this.time);
      } else if (k.isPlayer && !k.finished) {
        c = this.playerControls;
        c.jumpPressed = this._jumpLatch;
        c.itemPressed = this._itemLatch;
        this._jumpLatch = false;
        this._itemLatch = false;
      } else if (k.ai) {
        c = k.ai.update(dt, this.time);
      } else {
        // finished player: autopilot
        if (!k._autoAI) k._autoAI = new AIDriver(k, this, { skill: 0.7, seed: 99 });
        c = k._autoAI.update(dt, this.time);
        c.accel = Math.min(c.accel, 0.6);
        c.itemPressed = false;
      }
      const ev0 = k.events.length;
      k.step(dt, c, this.simTime);
      for (let e = ev0; e < k.events.length; e++) this._onKartEvent(k, k.events[e]);
      if (c.itemPressed && !k.frozen) {
        const back = k.isPlayer ? this._itemBack : !!c.itemBack;
        this.items.use(k, back);
      }
      c.jumpPressed = false;
      c.itemPressed = false;
    }
    this._collide(dt);
    this.items.update(dt, this.simTime);
    this.updatePositions();

    // rubber banding for AI (relative to the player)
    const p = this.player;
    for (const k of this.karts) {
      if (!k.ai) continue;
      const gap = k.raceDist - p.raceDist; // + = ahead of player
      const t = THREE.MathUtils.clamp(gap / 180, -1, 1);
      k.rubber = t > 0 ? 1 - 0.07 * t : 1 - 0.1 * t;
      k.baseMaxRubber = k.rubber;
    }

    // rubber banding applied through the kart's max speed
    for (const k of this.karts) if (k.ai) k.rubberMul = k.rubber ?? 1;
  }

  _onKartEvent(k, e) {
    if (e.type !== 'lap' || this.state === 'pre' || k.finished) return;
    if (e.lap >= 2 && e.lap - 1 > k.lapTimes.length) {
      k.lapTimes.push(this.time - k.lapStart);
      k.lapStart = this.time;
    }
    if (e.lap > this.laps) {
      k.finished = true;
      k.finishTime = this.time;
      this.finishOrder.push(k);
      this.events.push({ type: 'finish', kart: k, rank: this.finishOrder.length });
      if (k.isPlayer) this.state = 'done';
    } else if (k.isPlayer && e.lap === this.laps && !k._finalLapShown) {
      k._finalLapShown = true;
      this.events.push({ type: 'final_lap' });
    } else if (k.isPlayer && e.lap >= 2 && e.lap < this.laps) {
      this.events.push({ type: 'lap', lap: e.lap });
    }
  }

  /** Final standings with estimated times for racers that haven't finished yet. */
  results() {
    const avg = this.track.length * this.laps / Math.max(1, this.time);
    const rows = this.standings.map((k) => {
      let time = k.finishTime;
      let estimated = false;
      if (time == null) {
        const remaining = this.track.length * this.laps - Math.max(0, k.raceDist);
        time = this.time + remaining / Math.max(8, avg * 0.97);
        estimated = true;
      }
      return { kart: k, time, estimated };
    });
    rows.sort((a, b) => a.time - b.time);
    // keep the finished order intact at the top
    return rows;
  }

  _collide(dt) {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i];
      if (a.respawnT >= 0) continue;
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        if (b.respawnT >= 0) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
        if (Math.abs(dy) > 1.4) continue;
        const d2 = dx * dx + dz * dz;
        const R = a.radius + b.radius - 0.2;
        if (d2 > R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const pen = R - d;
        const wa = b.weight / (a.weight + b.weight), wb = a.weight / (a.weight + b.weight);
        a.pos.x -= nx * pen * wa; a.pos.z -= nz * pen * wa;
        b.pos.x += nx * pen * wb; b.pos.z += nz * pen * wb;
        const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          const jimp = -(1.35) * rv / (1 / a.weight + 1 / b.weight);
          a.vel.x -= (jimp / a.weight) * nx; a.vel.z -= (jimp / a.weight) * nz;
          b.vel.x += (jimp / b.weight) * nx; b.vel.z += (jimp / b.weight) * nz;
          if (-rv > 3) {
            a.emit('bump', { impact: -rv, other: b });
            b.emit('bump', { impact: -rv, other: a });
          }
        }
        // invincible karts knock others out
        if (a.invincibleT > 0 && b.invincibleT <= 0) { if (b.hit('tumble')) this.items._loseCoins(b); }
        else if (b.invincibleT > 0 && a.invincibleT <= 0) { if (a.hit('tumble')) this.items._loseCoins(a); }
      }
    }
  }
}

const _v = new THREE.Vector3();
