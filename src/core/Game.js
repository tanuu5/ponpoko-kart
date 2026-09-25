// Game orchestrator: menus <-> race, course loading, per-frame update, events -> audio/UI/FX.
import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { World } from './World.js';
import { Race } from './Race.js';
import { CameraRig } from './CameraRig.js';
import { FX } from '../fx/Particles.js';
import { KartView } from '../kart/KartView.js';

const noop = () => {};
const _sp = new THREE.Vector3();

/** Wrap an object so that missing methods are no-ops (UI / audio are optional). */
function safe(obj) {
  return new Proxy(obj || {}, {
    get(t, p) {
      const v = t[p];
      if (typeof v === 'function') return v.bind(t);
      if (v === undefined) return noop;
      return v;
    },
  });
}

export class Game {
  constructor(app, { ui = null, audio = null, stages = [], characters = [], kartApi = null, itemApi = null } = {}) {
    this.app = app;
    this.renderer = new Renderer(app);
    this.input = new Input();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);
    this.camera.layers.enable(1); // small vegetation (not rendered into reflections)
    this.ui = safe(ui);
    this.audio = safe(audio);
    this.stages = stages;
    this.characters = characters;
    this.kartApi = kartApi;
    this.itemApi = itemApi;
    this.world = null;
    this.race = null;
    this.views = [];
    this.fx = null;
    this.rig = null;
    this.mode = 'idle'; // idle | loading | intro | countdown | racing | finished | results | paused
    this.time = 0;
    this.paused = false;
    this.menuScene = null;
    this._last = performance.now();
    this.onRaceEnd = null; // callback(results)
    this.onQuit = null;
    this.debug = null;
    requestAnimationFrame((t) => this._frame(t));
  }

  // ------------------------------------------------------------------ loading
  async loadRace({ courseId, characterId, difficulty = '100cc', playerGrid = 5 }) {
    this.mode = 'loading';
    this.disposeRace();
    // per-race presentation state must start fresh (otherwise the HUD stays frozen after a results screen)
    this._resultsShown = false;
    this._hitFlash = 0;
    this._sunVis = 0;
    const def = this.stages.find((s) => s.id === courseId) || this.stages[0];
    this.def = def;
    await new Promise((r) => setTimeout(r, 30)); // let the loading screen paint
    const world = new World(this.renderer, def, { quality: this.quality });
    await world.decorate({ fx: null, audio: this.audio });
    this.world = world;
    this.fx = new FX(world.scene);
    world.fx = this.fx;
    if (world.stageRuntime && world.stageRuntime.attachFX) world.stageRuntime.attachFX(this.fx);

    // racers
    const chars = this.characters;
    const player = chars.find((c) => c.id === characterId) || chars[0];
    const rivals = chars.filter((c) => c.id !== player.id).slice(0, 7);
    const toDef = (c) => ({ character: c.id, name: c.name, stats: c.stats, color: '#' + new THREE.Color(c.colors ? c.colors.body : 0xffffff).getHexString() });
    this.race = new Race(world, {
      laps: def.laps ?? 3,
      difficulty,
      player: toDef(player),
      rivals: rivals.map(toDef),
      fx: this.fx,
      itemModels: this.itemApi,
      playerGrid,
    });
    this.views = this.race.karts.map((k) => new KartView(k, this.kartApi, world.scene, this.fx));
    // night courses: a headlight for the player's kart
    if (def.env.headlights) {
      const pv = this.views.find((v) => v.kart.isPlayer);
      const spot = new THREE.SpotLight(0xfff0d8, 90, 45, 0.55, 0.6, 1.6);
      spot.position.set(0, 0.9, 0.9);
      spot.target.position.set(0, 0, 14);
      pv.model.root.add(spot, spot.target);
    }
    this.rig = new CameraRig(this.camera, world.ground);
    this.rig.target = this.race.player;
    if (this.devFlags && this.devFlags.autopilot) this.race.autopilot = true;
    if (this.devFlags && this.devFlags.laps) this.race.laps = this.devFlags.laps;
    this.renderer.setScene(world.scene, this.camera);
    this.renderer.setLook(def.env.look);
    this.renderer.scenePass.beforeRender = world.beforeRender ? (r) => world.beforeRender(r, this.camera) : null;
    this.ui.setMinimap(world.track.minimapPath(4));
    // warm up: compile shaders up front (incl. items that only appear later) to avoid hitches
    this.rig.snapTo(this.race.player);
    const warm = new THREE.Group();
    if (this.itemApi && this.itemApi.createItemModel) {
      for (const id of ['dango', 'daruma', 'shuriken', 'makibishi', 'manekineko', 'kanedarai', 'koban']) {
        try { warm.add(this.itemApi.createItemModel(id)); } catch (e) { /* ignore */ }
      }
    }
    warm.position.copy(this.race.player.pos);
    world.scene.add(warm);
    this.renderer.renderer.compile(world.scene, this.camera);
    world.scene.remove(warm);
    this.courseDef = def;
    this.mode = 'intro';
    this._introStart();
  }

  disposeRace() {
    const fx = this.renderer.fx;
    fx.uSunVis.value = 0;
    fx.uBoost.value = 0;
    fx.uSpeedLines.value = 0;
    fx.uCA.value = 0.004;
    fx.uFlash.value = 0;
    clearTimeout(this._resultsTimer);
    this._resultsTimer = null;
    this._resultsShown = false;
    this.ui.hideHUD(); // also cancels a running item roulette
    this.ui.showWrongWay(false);
    if (!this.world) return;
    const rt = this.world.stageRuntime;
    if (rt && rt.dispose) {
      try { rt.dispose(); } catch (e) { console.warn('stage dispose failed', e); }
    }
    for (const v of this.views) v.dispose();
    this.views = [];
    if (this.fx) this.fx.dispose(this.world.scene);
    this.world.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    if (this.world.env) this.world.env.dispose();
    if (this.world.water) this.world.water.dispose();
    this.renderer.scenePass.beforeRender = null;
    this.world = null;
    this.race = null;
    this.audio.engineStop();
    this.audio.stopAmbience();
    this.audio.driftUpdate(false, 0);
    if (this._starLoop) { this._starLoop.stop(); this._starLoop = null; }
  }

  _introStart() {
    const t = this.world.track;
    const p = this.race.player;
    let shots;
    try {
      shots = this.def.introShots ? [...this.def.introShots(t), gridShot(t, p)] : autoIntro(t, p);
    } catch (e) {
      console.warn('intro shots failed', e);
      shots = autoIntro(t, p);
    }
    this.ui.hideMenus();
    this.ui.showHUD();
    this.ui.banner(this.def.name, { style: 'info', durationMs: 3200 });
    this.audio.playAmbience(this.def.ambience || this.def.id);
    this.audio.playJingle('start');
    this.rig.playCinematic(shots, () => this._beginCountdown());
    this._skipIntro = () => {
      if (this.mode !== 'intro') return;
      this.rig.cine = null;
      this.rig.mode = 'chase';
      this.rig.snapTo(this.race.player);
      this._beginCountdown();
    };
  }

  _beginCountdown() {
    if (this.mode !== 'intro') return;
    this.mode = 'countdown';
    this.rig.mode = 'chase';
    this.rig.snapTo(this.race.player);
    this.race.startCountdown();
    this.audio.engineStart();
  }

  // ------------------------------------------------------------------ frame
  _frame(now) {
    requestAnimationFrame((t) => this._frame(t));
    const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000)) * (this.timeScale || 1);
    this._last = now;
    this.input.pollGamepad();
    for (const a of this.input.menuActions) {
      if (a !== 'start') this.ui.nav(a);
    }
    if (this.mode === 'idle' || this.mode === 'loading' || !this.world) {
      if (this.menuRender) this.menuRender(dt);
      this.input.endFrame();
      return;
    }
    const inRace = ['intro', 'countdown', 'racing', 'finished'].includes(this.mode);
    this.input.gameActive = inRace;
    if (inRace && this.input.pausePressed() && this.mode !== 'finished') {
      this.togglePause();
    }
    if (this.paused) {
      this.renderer.render(0);
      this.input.endFrame();
      return;
    }
    this.time += dt;
    const c = this.input.controls();
    if (this.mode === 'intro' && (c.jumpPressed || c.itemPressed || this.input.hit('Enter'))) this._skipIntro();

    const race = this.race;
    if (this.mode === 'countdown' || this.mode === 'racing' || this.mode === 'finished') {
      race.setPlayerInput(c);
      race.update(dt);
      if (this.mode === 'countdown' && race.state === 'racing') {
        this.mode = 'racing';
        this.audio.playMusic(this.def.bgm || this.def.id, { fadeIn: 0.3 });
      }
    }
    this.rig.lookBack = c.lookBack && this.mode === 'racing';

    // views & fx
    for (const v of this.views) v.update(dt, this.time);
    this.world.update(dt, this.time, { race, camera: this.camera, fx: this.fx, audio: this.audio });
    this.fx.update(dt);
    this.rig.update(dt);
    this.world.env.update(dt, this.camera);

    this._handleEvents();
    this._updateHUD(dt);
    this._updateAudio(dt);
    this._updatePost(dt);
    this.renderer.render(dt);
    if (this.debug) this.debug(dt);
    for (const k of race.karts) k.events.length = 0;
    this.input.endFrame();
  }

  togglePause() {
    if (!this.race) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.audio.engineStop();
      this.audio.driftUpdate(false, 0);
      this.ui.showPause({
        onResume: () => this.togglePause(),
        onRestart: () => { this.paused = false; this.ui.hidePause(); this.restart(); },
        onQuit: () => { this.paused = false; this.ui.hidePause(); this.quitToMenu(); },
      });
    } else {
      this.ui.hidePause();
      this.audio.engineStart();
    }
  }

  async restart() {
    const opts = this._lastOpts;
    if (!opts) return;
    await this.ui.fade(true, 300);
    this.ui.showLoading('コースを準備中…');
    await this.loadRace(opts);
    this.ui.hideLoading();
    await this.ui.fade(false, 400);
  }

  quitToMenu() {
    this.audio.stopMusic({ fadeOut: 0.5 });
    this.disposeRace();
    this.mode = 'idle';
    if (this.onQuit) this.onQuit();
  }

  async startRace(opts) {
    this._lastOpts = opts;
    await this.ui.fade(true, 350);
    this.ui.hideMenus();
    this.ui.showLoading('コースを準備中…');
    this.audio.stopMusic({ fadeOut: 0.4 });
    await this.loadRace(opts);
    this.ui.hideLoading();
    await this.ui.fade(false, 500);
  }

  // ------------------------------------------------------------------ events
  _handleEvents() {
    const race = this.race;
    const P = race.player;
    for (const e of race.events) {
      switch (e.type) {
        case 'count':
          this.ui.countdown(e.n);
          this.audio.play(e.n === 0 ? 'go' : 'count');
          break;
        case 'rocket':
          if (e.good) this.ui.toast('ロケットスタート！');
          else this.ui.toast('エンスト…');
          break;
        case 'lap':
          this.ui.banner(`LAP ${e.lap}/${race.laps}`, { style: 'lap', durationMs: 1500 });
          this.audio.play('lap');
          break;
        case 'final_lap':
          this.ui.banner('ファイナルラップ！', { style: 'final', durationMs: 2200 });
          this.audio.playJingle('final_lap');
          this.audio.setFinalLap(true);
          break;
        case 'finish':
          if (e.kart === P) this._playerFinished(e.rank);
          break;
      }
    }
    race.events.length = 0;

    for (const k of race.karts) {
      const isP = k === P;
      const dist = k.pos.distanceTo(this.camera.position);
      const near = Math.max(0, 1 - dist / 45);
      for (const e of k.events) {
        if (isP) this._playerEvent(k, e);
        else if (near > 0.05) this._rivalEvent(k, e, near);
      }
    }
  }

  _playerEvent(k, e) {
    const A = this.audio;
    switch (e.type) {
      case 'hop': A.play('drift_hop', { volume: 0.7 }); break;
      case 'boost':
        if (e.kind === 'turbo1') A.play('turbo1');
        else if (e.kind === 'turbo2') A.play('turbo2');
        else if (e.kind === 'turbo3') A.play('turbo3');
        else if (e.kind === 'dash') A.play('dash_panel');
        else if (e.kind === 'dango' || e.kind === 'rocket') A.play('boost');
        break;
      case 'launch':
        A.play('jump');
        if (e.ramp === 'glide') A.play('glider_open');
        break;
      case 'glide_start': A.play('glider_open'); this.ui.toast('和傘グライダー！'); break;
      case 'trick': A.play('trick'); break;
      case 'trick_land': this.ui.toast('ナイス！'); break;
      case 'land':
        A.play('land', { volume: Math.min(1, e.impact / 12) });
        this.rig.shake(Math.min(0.5, e.impact / 30));
        this.fx.dust(k.pos, [0.6, 0.55, 0.5], 6);
        break;
      case 'wall': A.play('wall', { volume: Math.min(1, e.impact / 12) }); this.rig.shake(0.25); break;
      case 'bump': A.play('bump', { volume: Math.min(1, e.impact / 10) }); this.rig.shake(0.15); break;
      case 'hit':
        A.play('hit');
        A.play('spinout');
        this.rig.shake(0.6);
        this._hitFlash = 1;
        break;
      case 'kanedarai_hit': A.play('kanedarai'); break;
      case 'itembox': A.play('itembox'); break;
      case 'item_roulette': this.ui.rouletteItem(this._iconKeyForPending(e.item), 1800); break;
      case 'item_used':
        if (e.item === 'daruma') A.play('throw');
        if (e.item === 'shuriken') A.play('shuriken');
        if (e.item === 'makibishi') A.play('makibishi_drop');
        if (e.item === 'kanedarai') A.play('kanedarai', { volume: 0.4, pitch: 1.3 });
        break;
      case 'star_start':
        A.play('manekineko');
        if (this._starLoop) this._starLoop.stop();
        this._starLoop = A.startLoop('star_music', { volume: 0.8 });
        break;
      case 'coin': A.play('coin'); break;
      case 'respawn_start':
        A.play('respawn');
        Promise.resolve(this.ui.fade(true, 300, { style: 'black' })).then(() => setTimeout(() => this.ui.fade(false, 350, { style: 'black' }), 250));
        break;
      case 'proj_bounce': A.play('daruma_bounce', { volume: 0.5 }); break;
    }
  }

  _rivalEvent(k, e, near) {
    const A = this.audio;
    const v = near;
    switch (e.type) {
      case 'hit': A.play('hit', { volume: v * 0.8 }); break;
      case 'kanedarai_hit': A.play('kanedarai', { volume: v }); break;
      case 'bump': A.play('bump', { volume: v * 0.6 }); break;
      case 'boost': if (e.kind === 'turbo2' || e.kind === 'turbo3' || e.kind === 'dango') A.play('boost', { volume: v * 0.35 }); break;
      case 'proj_bounce': A.play('daruma_bounce', { volume: v * 0.5 }); break;
      case 'throw': A.play('throw', { volume: v * 0.5 }); break;
    }
  }

  _iconKeyForPending(id) {
    return id;
  }

  _playerFinished(rank) {
    this.mode = 'finished';
    this.rig.mode = 'orbit';
    this.ui.banner('ゴール！', { style: 'finish', durationMs: 3000 });
    this.audio.setFinalLap(false);
    this.audio.stopMusic({ fadeOut: 0.3 });
    this.audio.playJingle(rank <= 3 ? 'finish_win' : 'finish_lose');
    this.fx.confetti(this.race.player.pos, 120);
    clearTimeout(this._resultsTimer);
    const race = this.race;
    this._resultsTimer = setTimeout(() => {
      this._resultsTimer = null;
      if (this.mode !== 'finished' || this.race !== race || this._resultsShown) return;
      this._showResults();
    }, 4200);
  }

  _showResults() {
    this.mode = 'results';
    const rows = this.race.results().map((r, i) => ({
      rank: i + 1,
      name: r.kart.name,
      characterId: r.kart.character,
      time: r.time,
      estimated: r.estimated,
      isPlayer: r.kart.isPlayer,
      color: r.kart.color,
    }));
    this.audio.playMusic('results', { fadeIn: 1.0 });
    this.ui.hideHUD();
    document.querySelectorAll('.pk-toast').forEach((e) => e.remove());
    this.ui.showResults({
      rows,
      courseName: this.def.name,
      onRetry: () => this.restart(),
      onCourseSelect: () => this.quitToMenu(),
      onTitle: () => {
        this.audio.stopMusic({ fadeOut: 0.5 });
        this.disposeRace();
        this.mode = 'idle';
        if (this.onTitle) this.onTitle();
      },
    });
    // keep the orbit camera running behind the results
    this.mode = 'finished';
    this._resultsShown = true;
  }

  // ------------------------------------------------------------------ HUD / audio / post
  _updateHUD(dt) {
    const race = this.race;
    const P = race.player;
    if (!this._resultsShown) {
      this.ui.updateHUD({
        position: P.position,
        total: race.karts.length,
        lap: Math.max(1, Math.min(race.laps, P.lapCount)),
        laps: race.laps,
        time: race.time,
        coins: P.coins,
        speedKmh: Math.abs(P.speed) * 3.6,
        item: P.itemRoulette > 0 ? undefined : race.items.iconKey(P),
        itemCount: P.item === 'dango' ? 1 : P.itemCount,
      });
      this.ui.showWrongWay(P.wrongWayT > 1.3 && this.mode === 'racing');
    }
    const dots = race.karts.map((k) => ({ x: k.pos.x, z: k.pos.z, color: k.color, isPlayer: k.isPlayer }));
    this.ui.updateMinimap(dots);
  }

  _updateAudio(dt) {
    const P = this.race.player;
    if (this.mode === 'racing' || this.mode === 'countdown' || this.mode === 'finished') {
      this.audio.engineUpdate({
        speed01: Math.min(1.6, Math.abs(P.speed) / 30),
        throttle: this.mode === 'countdown' ? this.race.playerControls.accel : P.throttle,
        boost: P.boostT > 0,
        airborne: !P.grounded,
        offroad: !P.onRoad,
      });
      this.audio.driftUpdate(P.drift.active && P.grounded, P.drift.level);
    }
    if (this._starLoop && P.invincibleT <= 0) {
      this._starLoop.stop();
      this._starLoop = null;
    }
  }

  _updatePost(dt) {
    const P = this.race.player;
    const fx = this.renderer.fx;
    const boosting = P.boostT > 0 && this.mode !== 'finished' ? 1 : 0;
    fx.uBoost.value += (boosting * (P.boostPower >= 9 ? 1 : 0.7) - fx.uBoost.value) * Math.min(1, dt * 5);
    fx.uSpeedLines.value = fx.uBoost.value;
    this._hitFlash = Math.max(0, (this._hitFlash || 0) - dt * 3);
    fx.uCA.value = 0.004 + this._hitFlash * 0.03 + fx.uBoost.value * 0.01;

    // lens flare when looking toward the sun (terrain-occlusion tested)
    const envDef = this.def.env;
    let vis = 0;
    if ((envDef.sky.sunDisk ?? 0) > 0 && envDef.flare !== false) {
      const sd = this.world.env.sky.sunDir;
      const cam = this.camera.position;
      _sp.copy(cam).addScaledVector(sd, 1000).project(this.camera);
      if (_sp.z < 1 && Math.abs(_sp.x) < 1.25 && Math.abs(_sp.y) < 1.25) {
        vis = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(_sp.x), Math.abs(_sp.y)), 0.85, 1.25);
        for (const d of [12, 35, 80, 160, 300, 520]) {
          if (this.world.terrain.heightAt(cam.x + sd.x * d, cam.z + sd.z * d) > cam.y + sd.y * d) { vis = 0; break; }
        }
        fx.uSunPos.value.set(_sp.x * 0.5 + 0.5, _sp.y * 0.5 + 0.5);
      }
    }
    this._sunVis = (this._sunVis || 0) + (vis - (this._sunVis || 0)) * Math.min(1, dt * 5);
    fx.uSunVis.value = this._sunVis * (envDef.flareStrength ?? 1);
    fx.uFlareColor.value.set(envDef.sky.sunColor ?? 0xffd0a0);
  }
}

/** Final intro shot: swoop down behind the starting grid onto the player. */
function gridShot(track, player) {
  const fs = track.frameAt(track.length - 30);
  const grid = fs.pos.clone();
  return {
    from: grid.clone().addScaledVector(fs.right, -18).add(new THREE.Vector3(0, 7, 0)).addScaledVector(fs.tan, 30).toArray(),
    to: player.pos.clone().addScaledVector(player.forward(new THREE.Vector3()), -9).add(new THREE.Vector3(0, 3.2, 0)).toArray(),
    look: grid.toArray(),
    lookTo: player.pos.clone().add(new THREE.Vector3(0, 1, 0)).toArray(),
    dur: 2.6,
    fov: 58,
  };
}

/** Default intro cinematic: overview -> sweep along the course -> behind the grid. */
function autoIntro(track, player) {
  const c = track.bounds.getCenter(new THREE.Vector3());
  const size = track.bounds.getSize(new THREE.Vector3());
  const R = Math.max(size.x, size.z) * 0.55;
  const s1 = track.length * 0.35;
  const f1 = track.frameAt(s1);
  const a = f1.pos.clone().addScaledVector(f1.right, 14).add(new THREE.Vector3(0, 5, 0));
  const b = track.frameAt(s1 + 60).pos.clone().addScaledVector(f1.right, 10).add(new THREE.Vector3(0, 4, 0));
  const fs = track.frameAt(track.length - 30);
  const grid = fs.pos.clone();
  return [
    { from: [c.x - R, c.y + R * 0.55, c.z + R], to: [c.x + R * 0.3, c.y + R * 0.45, c.z + R * 0.9], look: [c.x, c.y, c.z], dur: 3.2, fov: 50 },
    { from: a.toArray(), to: b.toArray(), look: track.frameAt(s1 + 30).pos.toArray(), lookTo: track.frameAt(s1 + 90).pos.toArray(), dur: 2.8, fov: 55 },
    {
      from: grid.clone().addScaledVector(fs.right, -18).add(new THREE.Vector3(0, 7, 0)).addScaledVector(fs.tan, 30).toArray(),
      to: player.pos.clone().addScaledVector(player.forward(new THREE.Vector3()), -9).add(new THREE.Vector3(0, 3.2, 0)).toArray(),
      look: grid.toArray(),
      lookTo: player.pos.clone().add(new THREE.Vector3(0, 1, 0)).toArray(),
      dur: 2.6,
      fov: 58,
    },
  ];
}
