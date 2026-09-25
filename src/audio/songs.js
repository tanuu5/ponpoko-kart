// Song registry: compiles song data lazily (once) and exposes it by id.
import { compileSong } from './sequencer.js';
import { title, select, results } from './songs-menu.js';
import { inaka, sakura, matsuri } from './songs-race.js';
import { start, final_lap, finish_win, finish_lose, star } from './songs-jingles.js';

export const MUSIC_IDS = ['title', 'select', 'inaka', 'sakura', 'matsuri', 'results'];
export const JINGLE_IDS = ['start', 'final_lap', 'finish_win', 'finish_lose'];
const DEFS = { title, select, inaka, sakura, matsuri, results, start, final_lap, finish_win, finish_lose, star };

const compiled = new Map();
/** compiled song by id (music, jingle or 'star'); null if unknown */
export function getSong(id) {
  if (!DEFS[id]) return null;
  let s = compiled.get(id);
  if (!s) {
    s = compileSong(DEFS[id]);
    if (s.warnings.length) console.warn('[audio] song ' + id + ':\n  ' + s.warnings.join('\n  '));
    compiled.set(id, s);
  }
  return s;
}
