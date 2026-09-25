// One-shot jingles (start / final_lap / finish_win / finish_lose) and the looping
// invincibility "star" music. Jingles are one section ('J') with no loop.
import { tpl } from './sequencer.js';

const J = (def) => ({ ...def, form: { intro: ['J'], loop: [] } });

// Pre-race intro sting (~3.3 s): taiko roll + rising shinobue run, then "D — A — D!" hits.
export const start = J({
  id: 'start', bpm: 150, gain: 1,
  ch: {
    lead: { inst: 'flute', vol: 0.66, pan: 0.05, rev: 0.28, lp: 7000 },
    sham: { inst: 'shamisen', vol: 0.75, pan: -0.28, rev: 0.12, choke: true },
    brass: { inst: 'brass', vol: 0.55, pan: 0.1, rev: 0.22 },
    bass: { inst: 'bass', vol: 0.36 },
    dr: { kit: true, vol: 0.65 },
  },
  sec: {
    J: {
      chords: 'D D',
      parts: {
        lead: ['D5 - E5 - F#5 - A5 - B5 - D6 - E6 - F#6 -', 'D6! - - - - - A5 - D6! - - - - - - -'],
        sham: ['D4? A4? D4? A4? D4? A4? D4 A4 D4 A4 D4 A4 D4! A4! D4! A4!', 'D5! . . . . . A4 . D5! . . . . . . .'],
        brass: [null, 'D4+F#4+A4+D5! - - - . . A3+E4+A4+C#5 - D4+F#4+A4+D5! - - - - - - -'],
        bass: [null, 'D2! - - - . . A1 - D2! - - - - - - -'],
        dr: [
          { don: 'X...X...X.X.XXXX', sh: '1122334455667789' },
          { k: 'X.....x.X.......', don: 'X.....X.X.......', cr: 'X.......X.......', kn: 'X.......X.......' },
        ],
      },
    },
  },
});

// Final-lap fanfare (~2.3 s)
export const final_lap = J({
  id: 'final_lap', bpm: 160, gain: 1,
  ch: {
    lead: { inst: 'flute', vol: 0.66, pan: 0.05, rev: 0.26, lp: 7000 },
    brass: { inst: 'brass', vol: 0.55, pan: -0.08, rev: 0.22 },
    bass: { inst: 'bass', vol: 0.36 },
    dr: { kit: true, vol: 0.65 },
  },
  sec: {
    J: {
      chords: 'D D',
      parts: {
        lead: ['A5 - A5 - A5 - D6! - - - - - B5 - C#6 -', 'D6! - - - - - - - . . . . . . . .'],
        brass: [
          'D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4+D5! - - - - - G4+B4+D5 - A4+C#5+E5 -',
          'D4+F#4+A4+D5! - - - - - - - . . . . . . . .',
        ],
        bass: ['D2 . D2 . D2 . D2 - - - - - G2 - A2 -', 'D2! - - - - - - - . . . . . . . .'],
        dr: [
          { don: 'X.X.X.X.....X.X.', sh: '..........xxxxxx', cr: '......X.........' },
          { don: 'X...............', cr: 'X...............', kn: 'X...............' },
        ],
      },
    },
  },
});

// Triumphant finish (1st–3rd), ~4 s: title motif → IV–V–I with bells
export const finish_win = J({
  id: 'finish_win', bpm: 132, gain: 1,
  ch: {
    lead: { inst: 'flute', vol: 0.66, pan: 0.05, rev: 0.3, lp: 7000 },
    bell: { inst: 'glock', vol: 0.4, pan: 0.3, rev: 0.4 },
    brass: { inst: 'brass', vol: 0.5, pan: -0.1, rev: 0.25 },
    str: { inst: 'strings', vol: 0.4, pan: 0.1, rev: 0.35 },
    sham: { inst: 'shamisen', vol: 0.66, pan: -0.3, rev: 0.12, choke: true },
    bass: { inst: 'bass', vol: 0.34 },
    dr: { kit: true, vol: 0.65 },
  },
  sec: {
    J: {
      chords: 'G_A D',
      parts: {
        lead: ['F#5 - A5 - B5! - - - A5 - B5 - D6 - E6 -', 'F#6! - - - - - - - - - - - - - - -'],
        bell: [null, 'D6 F#6 A6 D7 . . . . . . . . . . . .'],
        brass: ['G4+B4+D5 - - - - - - - A4+C#5+E5 - - - - - - -', 'D4+F#4+A4+D5! - - - - - - - - - - - - - - -'],
        str: ['2| G4+B4+D5 A4+C#5+E5', '1| F#4+A4+D5+F#5'],
        sham: ['G4 . D5 . G4 . D5 . A4 . E5 . A4 . C#5 .', 'D5! . . . . . . . . . . . . . . .'],
        bass: ['G2 - - - - - - - A2 - - - - - - -', 'D2! - - - - - - - - - - - - - - -'],
        dr: [
          { k: 'X.......X.......', don: 'X.......X...X.XX', s: '....X.......XXXX', h: 'x.x.x.x.x.x.x.x.' },
          { k: 'X...............', don: 'X...............', cr: 'X...............', kn: 'X...............' },
        ],
      },
    },
  },
});

// Gentle finish (4th or lower), ~3.3 s: shakuhachi sigh over Bm → G → D (plagal, warm)
export const finish_lose = J({
  id: 'finish_lose', bpm: 108, gain: 1,
  ch: {
    lead: { inst: 'shaku', vol: 0.62, pan: 0.05, rev: 0.4 },
    koto: { inst: 'koto', vol: 0.7, pan: -0.2, rev: 0.35, strum: 0.03 },
    pad: { inst: 'pad', vol: 0.42, rev: 0.45 },
    bass: { inst: 'bass', vol: 0.3, cut: 220 },
    dr: { kit: true },
  },
  sec: {
    J: {
      chords: 'Bm_G D',
      parts: {
        lead: ['A5 - - - F#5 - E5 - D5 - - - B4 - - -', 'D5 - - - - - - - . . . . . . . .'],
        koto: ['8| B5 F#5 D5 B4 G5 D5 B4 G4', '2| D4+A4+D5+F#5 .'],
        pad: ['2| B3+D4+F#4+A4 G3+B3+D4+G4', '2| A3+D4+F#4+A4 .'],
        bass: ['2| B1 G1', '2| D2 .'],
        dr: [null, { don: 'o...............' }],
      },
    },
  },
});

// Invincibility loop (manekineko): fast, bright, bouncy — plays over the ducked race music.
export const star = {
  id: 'star', bpm: 176, gain: 1,
  form: { intro: [], loop: ['L'] },
  kit: { k: { vol: 0.5 } },
  ch: {
    mar: { inst: 'marimba', vol: 0.9, pan: -0.1, rev: 0.18 },
    bell: { inst: 'glock', vol: 0.3, pan: 0.3, rev: 0.25, copy: 'mar' },
    sham: { inst: 'shamisen', vol: 0.65, pan: -0.3, rev: 0.1, choke: true },
    bass: { inst: 'bass', vol: 0.34 },
    dr: { kit: true, vol: 0.7 },
  },
  sec: {
    L: {
      chords: 'C F G C',
      parts: {
        mar: [
          'C5 . E5 G5 . E5 G5 . A5 . G5 . E5 . G5 .',
          'A5 . C6 A5 . G5 A5 . C6 . A5 . G5 . E5 .',
          'D5 . G5 A5 . G5 D6 . B5 . A5 . G5 . A5 .',
          'C6 . . G5 . . E5 . C6! . . . . . . .',
        ],
        sham: tpl('8| . R+5 . R+5 . R+5 . R+5', 55),
        bass: tpl('8| R! 8 R 8 R! 8 R 8', 36),
        dr: [
          { k: 'X...X...X...X...', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', sh: 'oxoxoxoxoxoxoxox' },
          { k: 'X...X...X...X...', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', sh: 'oxoxoxoxoxoxoxox' },
          { k: 'X...X...X...X...', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', sh: 'oxoxoxoxoxoxoxox' },
          { k: 'X...X...X...X...', c: '....X.......X...', h: 'xxxxxxxxxxxx....', sh: 'oxoxoxoxxxxxXXXX', kn: 'X...............' },
        ],
      },
    },
  },
};
