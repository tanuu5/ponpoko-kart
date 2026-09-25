// Item boxes, koban coins, projectiles (daruma / shuriken), traps (makibishi),
// kanedarai strikes and item effects.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// item table by race position group
const TABLE = [
  // 1st
  [['makibishi', 34], ['daruma', 30], ['koban', 24], ['dango1', 12]],
  // 2nd-3rd
  [['daruma', 24], ['makibishi', 16], ['shuriken', 20], ['dango1', 18], ['koban', 10], ['dango3', 12]],
  // 4th-5th
  [['shuriken', 24], ['dango3', 24], ['daruma', 14], ['dango1', 14], ['manekineko', 12], ['makibishi', 6], ['kanedarai', 6]],
  // 6th-8th
  [['dango3', 30], ['manekineko', 24], ['shuriken', 20], ['kanedarai', 14], ['dango1', 12]],
];

function pickItem(position, total) {
  const g = position === 1 ? 0 : position <= 3 ? 1 : position <= Math.ceil(total * 0.62) ? 2 : 3;
  const table = TABLE[g];
  let sum = 0;
  for (const [, w] of table) sum += w;
  let r = Math.random() * sum;
  for (const [id, w] of table) {
    r -= w;
    if (r <= 0) return id;
  }
  return table[0][0];
}

function placeholderModel(id) {
  const colors = { dango: 0xf7a1c4, daruma: 0xd8261e, shuriken: 0x9aa3b0, makibishi: 0x333338, manekineko: 0xffffff, kanedarai: 0xd9a441, koban: 0xf2c230 };
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshStandardMaterial({ color: colors[id] ?? 0xffffff, roughness: 0.4 }));
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export class ItemSystem {
  /**
   * @param {object} race  Race instance (karts, positions, track, ground)
   * @param {THREE.Scene} scene
   * @param {object|null} models  { createItemModel(id, opts), createItemBox() }
   * @param {import('../fx/Particles.js').FX} fx
   */
  constructor(race, scene, models, fx) {
    this.race = race;
    this.scene = scene;
    this.models = models;
    this.fx = fx;
    this.track = race.track;
    this.ground = race.ground;
    this.group = new THREE.Group();
    this.group.name = 'items';
    scene.add(this.group);
    this.boxes = [];
    this.coins = [];
    this.projectiles = [];
    this.hazards = [];
    this.strikes = [];
    this._gq = {};
    this._buildBoxes();
    this._buildCoins();
  }

  model(id, opts) {
    try {
      if (this.models && this.models.createItemModel) return this.models.createItemModel(id, opts);
    } catch (e) {
      console.warn('item model failed', id, e);
    }
    return placeholderModel(id);
  }

  _buildBoxes() {
    const t = this.track;
    for (const row of t.itemRows) {
      const w = t.w[t.idx(row.s)];
      const n = row.count;
      const spread = row.spread ?? w * 0.62;
      for (let i = 0; i < n; i++) {
        const d = row.d + (n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1));
        const pos = t.pointAt(row.s, d, 1.25, new THREE.Vector3());
        let obj;
        let upd = null;
        if (this.models && this.models.createItemBox) {
          const b = this.models.createItemBox();
          obj = b.group || b;
          upd = b.update ? b.update.bind(b) : null;
        } else {
          obj = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x66ccff, transparent: true, opacity: 0.6, emissive: 0x2266ff, emissiveIntensity: 0.6 }));
        }
        obj.position.copy(pos);
        this.group.add(obj);
        this.boxes.push({ s: row.s, d, pos, obj, upd, active: true, respawnT: 0, phase: i * 0.7 });
      }
    }
  }

  _buildCoins() {
    const t = this.track;
    for (const line of t.coinLines) {
      let len = line.s1 - line.s0;
      if (len < 0) len += t.length;
      for (let i = 0; i < line.count; i++) {
        const s = line.s0 + (len * i) / Math.max(1, line.count - 1);
        const d = line.d + Math.sin(i * 0.9) * line.wave;
        const u = line.count > 1 ? i / (line.count - 1) : 0;
        const pos = t.pointAt(s, d, line.h + line.arc * Math.sin(Math.PI * u), new THREE.Vector3());
        const obj = this.model('koban');
        // make coins read as bright gold even when backlit (shared materials: done once)
        obj.traverse((o) => {
          if (!o.isMesh) return;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m && m.emissive && !m.userData.kobanGlow) {
              m.userData.kobanGlow = true;
              m.emissive.setHex(0xb07818);
              m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.55);
            }
          }
        });
        obj.position.copy(pos);
        obj.scale.setScalar(1.25);
        this.group.add(obj);
        this.coins.push({ s, d, pos, obj, active: true, respawnT: 0, phase: i * 0.5 });
      }
    }
  }

  nearestBoxAhead(kart, range) {
    let best = null;
    let bestDist = range;
    for (const b of this.boxes) {
      if (!b.active) continue;
      const ds = this.track.forwardDist(kart.s, b.s);
      if (ds > 4 && ds < bestDist) { bestDist = ds; best = b; }
    }
    return best;
  }

  hazardAhead(kart, range) {
    for (const h of this.hazards) {
      const ds = this.track.forwardDist(kart.s, h.s);
      if (ds > 2 && ds < range && Math.abs(h.d - kart.proj.d) < 3.5) return h;
    }
    return null;
  }

  /** Called when a kart drives through an item box. */
  _giveItem(kart) {
    if (kart.item || kart.itemRoulette > 0) return;
    const id = pickItem(kart.position, this.race.karts.length);
    kart.itemRoulette = kart.isPlayer ? 1.8 : 0.9;
    kart._pendingItem = id;
    kart.emit('item_roulette', { item: id });
  }

  _setItem(kart, id) {
    if (id === 'dango3') { kart.item = 'dango'; kart.itemCount = 3; }
    else if (id === 'dango1') { kart.item = 'dango'; kart.itemCount = 1; }
    else { kart.item = id; kart.itemCount = 1; }
    kart.emit('item_get', { item: kart.item, count: kart.itemCount });
  }

  iconKey(kart) {
    if (!kart.item) return null;
    if (kart.item === 'dango') return 'dango' + Math.max(1, Math.min(3, kart.itemCount));
    return kart.item;
  }

  /** Use the held item. back = throw/drop backward. */
  use(kart, back = false) {
    if (!kart.item || kart.itemRoulette > 0 || kart.respawnT >= 0 || kart.spin.t >= 0) return;
    const id = kart.item;
    const f = kart.forward(_v);
    switch (id) {
      case 'dango':
        kart.addBoost(1.3, 10, 'dango');
        kart.emit('use_dango');
        break;
      case 'koban':
        kart.coins = Math.min(10, kart.coins + 3);
        kart.emit('coin', { count: 3 });
        break;
      case 'manekineko':
        kart.invincibleT = 7.5;
        kart.addBoost(1.0, 6, 'star');
        kart.emit('star_start');
        break;
      case 'kanedarai':
        this._kanedarai(kart);
        break;
      case 'makibishi':
        this._dropTrap(kart, back);
        break;
      case 'daruma':
        this._launch(kart, 'daruma', back);
        break;
      case 'shuriken':
        this._launch(kart, 'shuriken', back);
        break;
    }
    kart.itemCount--;
    if (kart.itemCount <= 0) {
      kart.item = null;
      kart.itemCount = 0;
    }
    kart.emit('item_used', { item: id });
  }

  _dropTrap(kart, forwardThrow) {
    const f = kart.forward(_v);
    const obj = this.model('makibishi');
    const pos = kart.pos.clone().addScaledVector(f, forwardThrow ? 0 : -2.6);
    const h = { type: 'makibishi', pos, vel: new THREE.Vector3(), obj, life: 45, s: kart.s, d: kart.proj.d, owner: kart, ownerSafe: 0.6, airborne: false };
    if (forwardThrow) {
      h.vel.copy(f).multiplyScalar(22).add(_w.set(0, 7, 0)).add(new THREE.Vector3(kart.vel.x, 0, kart.vel.z).multiplyScalar(0.5));
      h.airborne = true;
      h.pos.y += 1.2;
    }
    obj.position.copy(pos);
    this.group.add(obj);
    this.hazards.push(h);
    kart.emit('drop');
  }

  _launch(kart, type, back) {
    const f = kart.forward(_v);
    const dir = back ? -1 : 1;
    const speed = type === 'shuriken' ? 44 : 38;
    const obj = this.model(type);
    const pos = kart.pos.clone().addScaledVector(f, dir * 2.2);
    pos.y += type === 'shuriken' ? 0.9 : 0.45;
    const vel = f.clone().multiplyScalar(back ? -speed * 0.55 : Math.max(speed, kart.speed + 14));
    let target = null;
    if (type === 'shuriken' && !back) target = this.race.kartAheadOf(kart);
    const p = { type, pos, vel, obj, owner: kart, life: type === 'shuriken' ? 9 : 10, age: 0, target, trackIndex: kart.trackIndex, s: kart.s, bounces: 0, spin: 0 };
    obj.position.copy(pos);
    this.group.add(obj);
    this.projectiles.push(p);
    kart.emit('throw', { item: type });
  }

  _kanedarai(user) {
    for (const k of this.race.karts) {
      if (k === user || k.finished) continue;
      if (k.raceDist <= user.raceDist) continue;
      const obj = this.model('kanedarai');
      obj.position.copy(k.pos).add(_w.set(0, 14, 0));
      this.group.add(obj);
      this.strikes.push({ kart: k, obj, t: -0.3 - Math.random() * 0.5, hit: false });
    }
    user.emit('kanedarai_cast');
  }

  _removeObj(o) {
    this.group.remove(o);
  }

  update(dt, time) {
    const t = this.track;
    const karts = this.race.karts;
    // ---- item boxes ----
    for (const b of this.boxes) {
      if (!b.active) {
        b.respawnT -= dt;
        if (b.respawnT <= 0) {
          b.active = true;
          b.obj.visible = true;
          b.grow = 0;
        }
        continue;
      }
      if (b.grow !== undefined && b.grow < 1) {
        b.grow = Math.min(1, b.grow + dt * 3);
        b.obj.scale.setScalar(b.grow);
      }
      b.obj.position.y = b.pos.y + Math.sin(time * 2 + b.phase) * 0.15;
      if (b.upd) b.upd(dt, time);
      else b.obj.rotation.set(time * 0.7 + b.phase, time + b.phase, 0);
      for (const k of karts) {
        if (k.respawnT >= 0) continue;
        const dx = k.pos.x - b.pos.x, dz = k.pos.z - b.pos.z, dy = k.pos.y + 0.6 - b.pos.y;
        if (dx * dx + dz * dz < 2.0 * 2.0 && Math.abs(dy) < 2.2) {
          b.active = false;
          b.obj.visible = false;
          b.respawnT = 1.8;
          this.fx.burst(b.pos, [0.6, 0.85, 1.0], 26, 7, 0.14);
          k.emit('itembox');
          this._giveItem(k);
          break;
        }
      }
    }
    // ---- coins ----
    for (const c of this.coins) {
      if (!c.active) {
        c.respawnT -= dt;
        if (c.respawnT <= 0) { c.active = true; c.obj.visible = true; }
        continue;
      }
      c.obj.rotation.y = time * 3 + c.phase;
      c.obj.position.y = c.pos.y + Math.sin(time * 3 + c.phase) * 0.1;
      for (const k of karts) {
        if (k.respawnT >= 0) continue;
        const dx = k.pos.x - c.pos.x, dz = k.pos.z - c.pos.z, dy = k.pos.y + 0.5 - c.pos.y;
        if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(dy) < 1.8) {
          c.active = false;
          c.obj.visible = false;
          c.respawnT = 10;
          if (k.coins < 10) {
            k.coins++;
            if (k.coins < 10 || true) k.addBoost(0.25, 3, 'coin');
          }
          k.emit('coin', { count: 1 });
          this.fx.burst(c.pos, [1.0, 0.8, 0.25], 10, 4, 0.08);
          break;
        }
      }
    }
    // ---- roulette timers ----
    for (const k of karts) {
      if (k.itemRoulette > 0) {
        k.itemRoulette -= dt;
        if (k.itemRoulette <= 0) {
          k.itemRoulette = 0;
          this._setItem(k, k._pendingItem);
        }
      }
    }
    // ---- projectiles ----
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.life -= dt;
      let dead = p.life <= 0;
      if (!dead) this._stepProjectile(p, dt);
      // collisions with karts
      if (!dead) {
        for (const k of karts) {
          if (k === p.owner && p.age < 0.5) continue;
          if (k.respawnT >= 0) continue;
          const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z, dy = k.pos.y + 0.5 - p.pos.y;
          if (dx * dx + dz * dz < 1.7 * 1.7 && Math.abs(dy) < 2) {
            const hit = k.hit(p.type === 'shuriken' ? 'tumble' : 'tumble');
            this.fx.burst(p.pos, p.type === 'shuriken' ? [0.7, 0.9, 1] : [1, 0.4, 0.3], 30, 8, 0.15);
            k.emit(hit ? 'hit_by' : 'blocked', { by: p.type, attacker: p.owner });
            if (hit) this._loseCoins(k);
            dead = true;
            break;
          }
        }
      }
      // projectile vs hazard
      if (!dead) {
        for (let j = this.hazards.length - 1; j >= 0; j--) {
          const h = this.hazards[j];
          if (h.pos.distanceToSquared(p.pos) < 1.8 * 1.8) {
            this.fx.burst(h.pos, [1, 0.7, 0.3], 20, 6, 0.12);
            this._removeObj(h.obj);
            this.hazards.splice(j, 1);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this._removeObj(p.obj);
        this.projectiles.splice(i, 1);
      }
    }
    // ---- hazards ----
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      h.ownerSafe -= dt;
      if (h.airborne) {
        h.vel.y -= 30 * dt;
        h.pos.addScaledVector(h.vel, dt);
        const g = this.ground.query(h.pos.x, h.pos.y, h.pos.z, -1, this._gq);
        if (h.pos.y <= g.y) {
          h.pos.y = g.y;
          h.airborne = false;
          const pr = t.project(h.pos.x, h.pos.y, h.pos.z, -1);
          h.s = pr.s;
          h.d = pr.d;
        }
        h.obj.position.copy(h.pos);
      }
      let dead = h.life <= 0;
      if (!dead && !h.airborne) {
        for (const k of karts) {
          if (k === h.owner && h.ownerSafe > 0) continue;
          if (k.respawnT >= 0 || !k.grounded) continue;
          const dx = k.pos.x - h.pos.x, dz = k.pos.z - h.pos.z;
          if (dx * dx + dz * dz < 1.5 * 1.5 && Math.abs(k.pos.y - h.pos.y) < 1.5) {
            const hit = k.hit('spin');
            if (hit) this._loseCoins(k);
            k.emit(hit ? 'hit_by' : 'blocked', { by: 'makibishi', attacker: h.owner });
            this.fx.burst(h.pos, [0.9, 0.9, 0.9], 16, 5, 0.1);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this._removeObj(h.obj);
        this.hazards.splice(i, 1);
      }
    }
    // ---- kanedarai strikes ----
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const st = this.strikes[i];
      st.t += dt;
      const k = st.kart;
      if (st.t < 0) {
        st.obj.position.set(k.pos.x, k.pos.y + 14, k.pos.z);
        continue;
      }
      if (!st.hit) {
        const fall = 14 - 0.5 * 40 * st.t * st.t;
        st.obj.position.set(k.pos.x, k.pos.y + Math.max(1.9, fall), k.pos.z);
        st.obj.rotation.z = Math.sin(st.t * 20) * 0.2;
        if (fall <= 1.9) {
          st.hit = true;
          st.hitT = 0;
          const hit = k.hit('squash', { ignoreSafe: true });
          if (hit) {
            k.squash = 1;
            this._loseCoins(k);
          }
          k.emit(hit ? 'kanedarai_hit' : 'blocked', { by: 'kanedarai' });
          this.fx.burst(_w.copy(k.pos).add(_v.set(0, 1.8, 0)), [1, 0.9, 0.4], 18, 5, 0.12);
        }
      } else {
        st.hitT += dt;
        // bounce off and tumble away
        st.obj.position.set(k.pos.x + st.hitT * 3, k.pos.y + 1.9 + st.hitT * 6 - 15 * st.hitT * st.hitT, k.pos.z);
        st.obj.rotation.z += dt * 12;
        if (st.hitT > 0.9) {
          this._removeObj(st.obj);
          this.strikes.splice(i, 1);
        }
      }
    }
  }

  _loseCoins(k) {
    const n = Math.min(k.coins, 3);
    k.coins -= n;
    if (n > 0) {
      this.fx.burst(_w.copy(k.pos).add(_v.set(0, 1, 0)), [1, 0.8, 0.2], 8 * n, 5, 0.1);
      k.emit('coin_lost', { count: n });
    }
  }

  _stepProjectile(p, dt) {
    const t = this.track;
    if (p.type === 'shuriken' && p.target && !p.target.finished) {
      // follow the track toward the target, then home directly
      const tk = p.target;
      const pr = t.project(p.pos.x, p.pos.y, p.pos.z, p.trackIndex);
      p.trackIndex = pr.index;
      const dist = p.pos.distanceTo(tk.pos);
      const speed = 46;
      let aim;
      if (dist < 22) aim = _w.copy(tk.pos).add(_v.set(0, 0.6, 0));
      else aim = t.pointAt(pr.s + 12, THREE.MathUtils.lerp(pr.d, tk.proj.d, 0.5), 0.9, _w);
      const desired = _v.copy(aim).sub(p.pos).normalize().multiplyScalar(speed);
      p.vel.lerp(desired, Math.min(1, dt * 6));
      p.pos.addScaledVector(p.vel, dt);
      const g = this.ground.query(p.pos.x, p.pos.y + 1, p.pos.z, p.trackIndex, this._gq);
      if (p.pos.y < g.y + 0.6) p.pos.y = g.y + 0.6;
      p.obj.position.copy(p.pos);
      p.obj.rotation.y += dt * 25;
      return;
    }
    // ground-hugging straight projectile with wall bounces (daruma, or shuriken thrown back / no target)
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    const g = this.ground.query(p.pos.x, p.pos.y + 1.5, p.pos.z, p.trackIndex, this._gq);
    p.trackIndex = g.proj.index;
    const hover = p.type === 'shuriken' ? 0.8 : 0.45;
    if (g.surface === 'deep' || g.y < p.pos.y - 6) {
      p.life = 0;
      return;
    }
    p.pos.y += (g.y + hover - p.pos.y) * Math.min(1, dt * 20);
    // walls
    const pr = g.proj;
    const i = pr.index;
    const wl = t.wallL[i], wr = t.wallR[i];
    const lim = Math.min(wr, t.w[i] + 6);
    const liml = Math.min(wl, t.w[i] + 6);
    let side = 0;
    if (pr.d > lim - 0.5) side = 1;
    else if (pr.d < -(liml - 0.5)) side = -1;
    if (side !== 0) {
      const R = pr.frame.right;
      const rh = Math.hypot(R.x, R.z) || 1;
      const nx = (R.x / rh) * side, nz = (R.z / rh) * side;
      const vn = p.vel.x * nx + p.vel.z * nz;
      if (vn > 0) {
        p.vel.x -= 2 * vn * nx;
        p.vel.z -= 2 * vn * nz;
        p.bounces++;
        p.owner.emit('proj_bounce', { pos: p.pos.clone() });
      }
    }
    p.obj.position.copy(p.pos);
    if (p.type === 'daruma') {
      // roll: rotate around axis perpendicular to velocity
      const sp = Math.hypot(p.vel.x, p.vel.z);
      p.spin += (sp / 0.4) * dt;
      p.obj.rotation.set(0, Math.atan2(p.vel.x, p.vel.z), 0);
      p.obj.rotateX(p.spin);
    } else {
      p.obj.rotation.y += dt * 25;
    }
  }

  clear() {
    this.scene.remove(this.group);
  }
}
