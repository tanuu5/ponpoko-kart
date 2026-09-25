// Entry point: wires UI, audio, kart/item models and courses into the game.
import { Game } from './core/Game.js';
import { STAGES } from './stages/index.js';
import { runMenus } from './core/Menus.js';
import { CHARACTERS } from './kart/characters.js';
import { createKartModel } from './kart/KartModel.js';
import { createGlider } from './kart/Glider.js';
import * as itemModels from './items/itemModels.js';
import { UI } from './ui/UI.js';
import { GameAudio } from './audio/Audio.js';

function safeNew(label, fn) {
  try {
    return fn();
  } catch (e) {
    console.warn(`[main] ${label} unavailable`, e);
    return null;
  }
}

async function boot() {
  const app = document.getElementById('app');
  const q = new URLSearchParams(location.search);
  const kartApi = q.get('nokart') ? null : { createKartModel, createGlider };
  const ui = q.get('noui') ? null : safeNew('UI', () => new UI(document.body));
  const audio = q.get('noaudio') ? null : safeNew('audio', () => new GameAudio());
  const game = new Game(app, { ui, audio, stages: STAGES, characters: CHARACTERS, kartApi, itemApi: itemModels });
  window.__game = game;

  // ---- developer switches (URL parameters) ----
  game.devFlags = { autopilot: !!q.get('autopilot'), laps: q.get('laps') ? parseInt(q.get('laps'), 10) : null };
  if (q.get('timescale')) game.timeScale = parseFloat(q.get('timescale'));
  if (q.get('quality')) game.quality = q.get('quality');
  if (q.get('events')) {
    window.__events = [];
    const orig = game._playerEvent.bind(game);
    game._playerEvent = (k, e) => {
      window.__events.push(`${(game.race ? game.race.time : 0).toFixed(1)}:${e.type}${e.kind ? ':' + e.kind : ''}${e.level ? ':' + e.level : ''}`);
      orig(k, e);
    };
  }
  const dbg = document.getElementById('dbg');
  if (q.get('debug')) {
    let acc = 0, n = 0, fps = 0;
    game.debug = (dt) => {
      acc += dt; n++;
      if (acc > 0.5) { fps = n / acc; acc = 0; n = 0; }
      const k = game.race && game.race.player;
      if (!k) return;
      dbg.textContent = `fps ${fps.toFixed(0)} pr ${game.renderer.pixelRatio.toFixed(2)}\n` +
        `spd ${(k.speed * 3.6).toFixed(0)} s ${k.s.toFixed(0)} lap ${k.lapCount} pos ${k.position} surf ${k.surface} ${k.grounded ? 'G' : 'AIR'} ` +
        `drift ${k.drift.active ? k.drift.level : '-'} boost ${k.boostT.toFixed(1)} glide ${k.glide.active} item ${k.item || '-'}`;
    };
  }
  if (q.get('log')) {
    window.__log = [];
    let next = 0;
    const prevDebug = game.debug;
    game.debug = (dt) => {
      if (prevDebug) prevDebug(dt);
      const r = game.race;
      if (!r || r.time < next) return;
      next = r.time + 0.5;
      const k = r.player;
      window.__log.push([+r.time.toFixed(1), Math.round(k.s), +k.proj.d.toFixed(1), +k.pos.y.toFixed(1), Math.round(k.speed * 3.6), k.surface, k.grounded ? 'G' : k.glide.active ? 'GLIDE' : 'AIR', k.lapCount, k.position].join(' '));
    };
  }

  // Quick start straight into a race: ?race=inaka&char=tanuki&cc=150cc
  if (q.get('race') || !ui) {
    const opts = { courseId: q.get('race') || STAGES[0].id, characterId: q.get('char') || 'tanuki', difficulty: q.get('cc') || '100cc' };
    if (audio) {
      const unlock = () => {
        audio.unlock().then(() => {
          if (game.mode === 'racing') audio.playMusic(game.def.bgm || game.def.id);
          audio.playAmbience(game.def.ambience || game.def.id);
        });
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('pointerdown', unlock);
      };
      window.addEventListener('keydown', unlock);
      window.addEventListener('pointerdown', unlock);
    }
    await game.loadRace(opts);
    game._lastOpts = opts;
    if (q.get('at')) {
      const [s, d] = q.get('at').split(',').map(Number);
      game.race.player.place(s, d || 0);
    }
    if (q.get('skipintro') || q.get('at')) game._skipIntro();
    if (q.get('view')) {
      // static debug camera: ?view=x,y,z,lx,ly,lz[,fov]
      const v = q.get('view').split(',').map(Number);
      game.rig.playCinematic([{ from: v.slice(0, 3), to: v.slice(0, 3), look: v.slice(3, 6), dur: 1e9, fov: v[6] || 55 }]);
    }
    if (q.get('freeze')) game.race.karts.forEach((k) => (k.frozen = true));
    return;
  }

  if (audio) {
    // browsers only allow audio after a user gesture: unlock on the first one anywhere
    const unlock = () => {
      audio.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }
  runMenus(game, { ui, audio, characters: CHARACTERS, stages: STAGES });
}

boot();
