// Menu flow (title -> character -> course -> race -> results) with a 3D diorama
// rendered behind the DOM menus: a kart on a turntable under a sakura tree and a torii.
import * as THREE from 'three';
import { Sky } from '../world/Sky.js';
import { FogState } from './fog.js';
import { FX } from '../fx/Particles.js';
import { PropInstancer } from '../world/Instancer.js';

const MOODS = {
  title: {
    sky: { zenith: 0x3a5f9e, horizon: 0xf2b27a, haze: 0xffb070, sunDir: [-0.7, 0.18, -0.7], sunColor: 0xffb45e, sunGlow: 1.3, sunDisk: 14, cloudCover: 0.55, cloudLit: 0xffc9a0, cloudShade: 0x8a6f86, gradExp: 0.45 },
    sun: [0xffc080, 3.6], hemi: [0x8aa3d6, 0x5a4430, 0.7], env: 0.7, exposure: 1.05, lanterns: 0, petals: 0.6, fireworks: false,
  },
  inaka: {
    sky: { zenith: 0x3a5f9e, horizon: 0xf2b27a, haze: 0xffb070, sunDir: [-0.7, 0.18, -0.7], sunColor: 0xffb45e, sunGlow: 1.3, sunDisk: 14, cloudCover: 0.55, cloudLit: 0xffc9a0, cloudShade: 0x8a6f86, gradExp: 0.45 },
    sun: [0xffc080, 3.6], hemi: [0x8aa3d6, 0x5a4430, 0.7], env: 0.7, exposure: 1.05, lanterns: 0, petals: 0.2, fireworks: false,
  },
  sakura: {
    sky: { zenith: 0x2f6fd0, horizon: 0xcfe6ff, haze: 0xeaf2ff, sunDir: [0.4, 0.75, 0.5], sunColor: 0xfff2d8, sunGlow: 0.8, sunDisk: 10, cloudCover: 0.5, cloudLit: 0xffffff, cloudShade: 0xa9b8d0, gradExp: 0.6 },
    sun: [0xfff0dc, 3.4], hemi: [0xbcd6ff, 0x6a7a4a, 1.0], env: 1.0, exposure: 1.0, lanterns: 0, petals: 1.4, fireworks: false,
  },
  matsuri: {
    sky: { zenith: 0x050b1f, horizon: 0x1c2a52, haze: 0x2a3060, ground: 0x0a0a10, sunDir: [0.3, 0.5, -0.8], sunColor: 0x000000, sunGlow: 0, sunDisk: 0, cloudCover: 0.62, cloudOpacity: 0.5, cloudLit: 0x3a4a78, cloudShade: 0x10142a, stars: 1, moon: 1, moonDir: [0.35, 0.45, -0.8], gradExp: 0.5 },
    sun: [0x8ea8e8, 0.6], hemi: [0x3a4a80, 0x140e0a, 0.55], env: 0.35, exposure: 1.15, lanterns: 1, petals: 0, fireworks: true,
  },
};

class MenuScene {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 3000);
    this.camera.layers.enable(1);
    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    this.karts = new Map();
    this.current = null;
    this.time = 0;
    this.orbit = 0;
    this.fx = new FX(this.scene);
    this.lights = new THREE.Group();
    this.scene.add(this.lights);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    this.lanternLight = new THREE.PointLight(0xffa050, 0, 30, 2);
    this.lanternLight.position.set(-3, 3.2, -2);
    this.scene.add(this.lanternLight);
    this._buildGround();
    this.mood = null;
    this.setMood('title');
  }

  _buildGround() {
    // stone-edged grassy platform
    const top = new THREE.Mesh(new THREE.CylinderGeometry(13, 13.4, 0.6, 64), new THREE.MeshStandardMaterial({ color: 0x5f7d3a, roughness: 1 }));
    top.position.y = -0.3;
    top.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(13.6, 14.2, 1.4, 64), new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 0.95 }));
    rim.position.y = -1.0;
    rim.receiveShadow = true;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.18, 48), new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.7 }));
    pad.position.y = 0.05;
    pad.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.05, 8, 64), new THREE.MeshStandardMaterial({ color: 0xe0b04a, metalness: 1, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    this.scene.add(top, rim, pad, ring);
    // far ground so the horizon isn't empty
    const far = new THREE.Mesh(new THREE.CircleGeometry(1500, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f5a2c, roughness: 1 }));
    far.position.y = -3;
    this.scene.add(far);
    this.farGround = far;
  }

  async decorate() {
    const S = await import('../props/shrine.js').catch(() => ({}));
    const F = await import('../props/festival.js').catch(() => ({}));
    const P = new PropInstancer({ chunk: 1000 });
    const add = (key, fn, x, z, rotY = 0, scale = 1) => P.add(key, fn, { x, y: 0, z, rotY, scale, collide: false });
    if (S.createTorii) add('torii', () => S.createTorii({ style: 'myojin', material: 'vermilion', height: 6.5, span: 5.5, plaque: 'ぽんぽこ', seed: 2 }), 0, -8.5, 0);
    if (S.createSakuraTree) {
      add('sakuraA', () => S.createSakuraTree({ seed: 3, size: 1.1 }), -8, -4, 0.4);
      add('sakuraB', () => S.createSakuraTree({ seed: 7, size: 0.9 }), 8.5, -5.5, 1.3);
    }
    if (S.createStoneLantern) {
      add('lanternL', () => S.createStoneLantern({ lit: true, seed: 1 }), -3.6, -6.8, 0.3);
      add('lanternL', () => S.createStoneLantern({ lit: true, seed: 1 }), 3.6, -6.8, -0.3);
    }
    if (S.createPine) add('pine', () => S.createPine({ seed: 2 }), 10, 4, 2.2, 0.8);
    P.build(this.scene);
    // festival lanterns (night mood only)
    this.nightGroup = new THREE.Group();
    if (F.createLanternString) {
      try {
        this.nightGroup.add(F.createLanternString({ a: [-9, 5.2, -6], b: [9, 5.2, -6], count: 9, sag: 1.0, colors: ['red', 'white'], texts: ['祭'] }));
        this.nightGroup.add(F.createLanternString({ a: [-10, 4.6, 1], b: [-3, 5.8, -9], count: 5, sag: 0.6, colors: ['red'], texts: ['祭'] }));
      } catch (e) {
        console.warn(e);
      }
    }
    this.scene.add(this.nightGroup);
    this.nightGroup.visible = this.mood === 'matsuri';
  }

  setMood(id) {
    const m = MOODS[id] || MOODS.title;
    if (this.mood === id) return;
    this.mood = id;
    if (this.sky) {
      this.scene.remove(this.sky.group);
      this.sky.dome.material.dispose();
    }
    this.sky = new Sky({ ...m.sky, billboards: { count: 8, lit: m.sky.cloudLit, shade: m.sky.cloudShade, opacity: id === 'matsuri' ? 0.35 : 0.9, minH: 120, maxH: 320, dist: 1800, minW: 400, maxW: 800 } });
    this.scene.add(this.sky.group);
    const sd = this.sky.sunDir;
    this.sun.position.copy(sd).multiplyScalar(40);
    this.sun.color.set(m.sun[0]);
    this.sun.intensity = m.sun[1];
    this.hemi.color.set(m.hemi[0]);
    this.hemi.groundColor.set(m.hemi[1]);
    this.hemi.intensity = m.hemi[2];
    if (this.envTex) this.envTex.dispose();
    this.envTex = this.sky.buildEnvironment(this.game.renderer.renderer);
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = m.env;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(m.sky.horizon), id === 'matsuri' ? 0.004 : 0.0022);
    FogState.sunDirWorld.copy(sd);
    FogState.setSunColor(new THREE.Color(m.sky.haze));
    this.farGround.material.color.set(id === 'matsuri' ? 0x141a14 : id === 'sakura' ? 0x5f8a3a : 0x4b5f2c);
    this.lanternLight.intensity = m.lanterns ? 30 : 0;
    if (this.nightGroup) this.nightGroup.visible = id === 'matsuri';
    this.moodDef = m;
    this.game.renderer.renderer.toneMappingExposure = m.exposure;
    this.game.renderer.setLook({ exposure: m.exposure, bloomStrength: id === 'matsuri' ? 0.9 : 0.45, bloomThreshold: id === 'matsuri' ? 0.8 : 0.95, vignette: 0.45, saturation: 1.1, contrast: 1.05 });
  }

  showKart(characterId) {
    const api = this.game.kartApi;
    if (!this.karts.has(characterId)) {
      let model = null;
      try {
        if (api && api.createKartModel) model = api.createKartModel(characterId);
      } catch (e) {
        console.warn(e);
      }
      if (!model) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.9), new THREE.MeshStandardMaterial({ color: 0xff8830 })));
        model = { root: g, animate() {} };
      }
      model.root.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      this.karts.set(characterId, model);
    }
    if (this.current) this.turntable.remove(this.current.root);
    this.current = this.karts.get(characterId);
    this.turntable.add(this.current.root);
    this.current.root.position.set(0, 0.14, 0);
    this._pop = 0;
  }

  hideKart() {
    if (this.current) this.turntable.remove(this.current.root);
    this.current = null;
  }

  update(dt, previewRect) {
    this.time += dt;
    this.turntable.rotation.y += dt * 0.55;
    if (this.current) {
      this._pop = Math.min(1, (this._pop ?? 1) + dt * 4);
      const s = 0.6 + 0.4 * easeOutBack(this._pop);
      this.current.root.scale.setScalar(s);
      try {
        this.current.animate(dt, { speed: 0, steer: Math.sin(this.time * 0.8) * 0.4, driftDir: 0, driftLevel: 0, boosting: false, airborne: false, gliding: false, trickT: -1, trickType: 'flip', squash: 0, spinOut: false, time: this.time });
      } catch (e) { /* ignore */ }
    }
    // camera: slow orbit, framed on the preview rect if given
    const w = innerWidth, h = innerHeight;
    this.orbit += dt * 0.05;
    const a = 0.55 + Math.sin(this.orbit) * 0.25;
    const dist = previewRect ? 8.6 * Math.min(1.6, Math.max(0.8, (h / Math.max(200, previewRect.height)) * 0.62)) : 16;
    const lookY = previewRect ? 0.8 : 2.4;
    this.camera.position.set(Math.sin(a) * dist, 1.6 + dist * 0.16, Math.cos(a) * dist);
    this.camera.lookAt(0, lookY, previewRect ? 0 : -2.5);
    this.camera.aspect = w / h;
    if (previewRect) this.camera.setViewOffset(w, h, w / 2 - previewRect.cx, h / 2 - previewRect.cy, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.sky.update(dt, this.camera);
    // particles
    const m = this.moodDef;
    if (m.petals > 0 && Math.random() < dt * 30 * m.petals) {
      this.fx.petals.spawn({
        x: (Math.random() - 0.5) * 24, y: 7 + Math.random() * 4, z: (Math.random() - 0.5) * 20,
        vx: 0.6 + Math.random() * 0.6, vy: -0.8, vz: 0.2, life: 8, size: 0.12, size1: 0.12,
        r: 1.0, g: 0.78, b: 0.85, a: 1, a1: 0.9, drag: 0.4, vrot: (Math.random() - 0.5) * 6, flutter: 2.5, floorY: 0.02,
      });
    }
    if (m.fireworks) {
      this._fwT = (this._fwT ?? 1) - dt;
      if (this._fwT <= 0) {
        this._fwT = 0.8 + Math.random() * 1.4;
        const cols = [[1, 0.4, 0.3], [1, 0.85, 0.3], [0.4, 0.8, 1], [0.8, 0.5, 1], [0.5, 1, 0.6]];
        const p = new THREE.Vector3((Math.random() - 0.5) * 160, 50 + Math.random() * 40, -120 - Math.random() * 80);
        this.fx.firework(p, cols[Math.floor(Math.random() * cols.length)], Math.random() < 0.3 ? 'willow' : 'peony');
        this._flash = 1;
        this.game.audio.play('firework', { volume: 0.35 });
      }
      this._flash = Math.max(0, (this._flash || 0) - dt * 2.5);
      this.hemi.intensity = m.hemi[2] + this._flash * 0.6;
    }
    this.fx.update(dt);
  }
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function runMenus(game, { ui, audio, characters, stages }) {
  const menu = new MenuScene(game);
  menu.decorate();
  const state = { characterId: characters[0].id, courseId: stages[0].id, difficulty: '100cc' };
  try {
    const saved = JSON.parse(localStorage.getItem('ponpoko.prefs') || '{}');
    if (saved.characterId && characters.find((c) => c.id === saved.characterId)) state.characterId = saved.characterId;
    if (saved.courseId && stages.find((s) => s.id === saved.courseId)) state.courseId = saved.courseId;
    if (saved.difficulty) state.difficulty = saved.difficulty;
  } catch { /* ignore */ }
  const save = () => {
    try { localStorage.setItem('ponpoko.prefs', JSON.stringify(state)); } catch { /* ignore */ }
  };
  if (audio) ui.onSound = (name) => audio.play(name);

  const enterMenuScene = () => {
    game.renderer.setScene(menu.scene, menu.camera);
    game.renderer.scenePass.beforeRender = null;
    menu.setMood(menu.mood || 'title');
    const m = MOODS[menu.mood];
    game.renderer.setLook({ exposure: m.exposure, bloomStrength: menu.mood === 'matsuri' ? 0.9 : 0.45, bloomThreshold: menu.mood === 'matsuri' ? 0.8 : 0.95, vignette: 0.45 });
    game.menuRender = (dt) => {
      menu.update(dt, ui.getPreviewRect ? ui.getPreviewRect() : null);
      FogState.updateCamera(menu.camera);
      game.renderer.render(dt);
    };
  };

  const title = () => {
    menu.setMood('title');
    menu.showKart(state.characterId);
    ui.hideHUD();
    ui.showTitle({
      onStart: () => {
        if (audio) audio.unlock().then(() => audio.playMusic('select', { fadeIn: 0.8 }));
        chars();
      },
    });
    // queued until the first user gesture unlocks audio
    if (audio) audio.playMusic('title', { fadeIn: 1.0 });
  };

  const chars = () => {
    menu.setMood('title');
    menu.showKart(state.characterId);
    ui.showCharacterSelect({
      characters,
      selectedId: state.characterId,
      onHover: (id) => menu.showKart(id),
      onConfirm: (id) => {
        state.characterId = id;
        save();
        courses();
      },
      onBack: () => title(),
    });
  };

  const courses = () => {
    menu.showKart(state.characterId);
    menu.setMood(state.courseId);
    ui.showCourseSelect({
      courses: stages.map((s) => ({ id: s.id, name: s.name, subtitle: s.subtitle, description: s.description, colors: s.colors || ['#e0b04a', '#d8401f'], laps: s.laps ?? 3 })),
      selectedId: state.courseId,
      difficulty: state.difficulty,
      onHover: (id) => menu.setMood(id),
      onConfirm: ({ courseId, difficulty }) => {
        state.courseId = courseId;
        state.difficulty = difficulty || state.difficulty;
        save();
        game.menuRender = null;
        game.startRace({ courseId: state.courseId, characterId: state.characterId, difficulty: state.difficulty });
      },
      onBack: () => chars(),
    });
  };

  game.onQuit = () => {
    ui.hideHUD();
    enterMenuScene();
    if (audio) audio.playMusic('select', { fadeIn: 0.8 });
    courses();
  };
  game.onTitle = () => {
    enterMenuScene();
    title();
  };

  // item icons & portraits (rendered once from the 3D models)
  import('../items/icons.js')
    .then(async (m) => {
      const [itemIcons, portraits] = await Promise.all([m.renderItemIcons ? m.renderItemIcons() : null, m.renderPortraits ? m.renderPortraits() : null]);
      ui.setAssets({ itemIcons: itemIcons || undefined, portraits: portraits || undefined });
    })
    .catch((e) => console.warn('icons unavailable', e));

  enterMenuScene();
  title();
  return menu;
}
