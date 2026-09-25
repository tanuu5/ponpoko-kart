// Menu music: title (D major yonanuki, 132 BPM), select (F major, 108 BPM), results (Bb major, 100 BPM).
// All melodies are original. Token grammar: see sequencer.js.
import { tpl, padGen } from './sequencer.js';

// ================================================================== TITLE
// Heroic-cute main theme. Shinobue melody on the yonanuki major scale (D E F# A B),
// shamisen ostinato, synth bass, strings, taiko layered with modern drums.
const T = {
  in1: { don: 'X.......X...X.X.', sh: '1122334455667789' },
  in2: { k: 'X.....x.X.......', don: 'X.....x.X.......', s: '....X.......X.XX', c: '....x.......x...', h: 'x.x.x.x.x.x.....', cr: 'X...............' },
  a: { k: 'X.....x.X.......', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.xo', don: 'X.......X.......' },
  a1: { k: 'X.....x.X.......', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.xo', don: 'X.......X.......', cr: 'X...............' },
  a4: { k: 'X.....x.X.......', s: '....X.......X.xx', c: '....x.......x...', h: 'x.x.x.x.x.x.....', don: 'X.......X.X.X.XX', ka: '..x...x.........' },
  a8: { k: 'X.....x.X.......', s: '....X...xxxxXXXX', h: 'x.x.x.x.........', don: 'X.......X.X.XXXX' },
  b1: { k: 'X.....x.X.....x.', s: '....X.......X...', c: '....x.......x...', oh: '..x...x...x...x.', don: 'X...............', cr: 'X...............', sh: 'o.ox..ox..oxo.ox' },
  b: { k: 'X.....x.X.....x.', s: '....X.......X...', c: '....x.......x...', oh: '..x...x...x...x.', sh: 'o.ox..ox..oxo.ox', ka: '..............x.' },
  b4: { k: 'X.....x.X.......', s: '....X.......XxXX', c: '....x.......x...', oh: '..x...x.........', don: '........X.X.X.X.', sh: 'o.ox..ox........' },
  b8: { k: 'X.....x.X.......', s: '....X...X.X.XXXX', don: 'X.......XXX.XXXX', cr: '............X...' },
  fin: { sh: 'xoxoxoxoxoxoxoxo', kn: '..x...x...x...x.' },
};
const titleBass = tpl('8| R! R 8 R R! R 8 R', 38);
const titleBassFill = tpl('8| R! R 8 R 5 5 A A', 38);

export const title = {
  id: 'title', bpm: 132, gain: 1,
  ch: {
    lead: { inst: 'flute', vol: 0.69, pan: 0.06, rev: 0.26, lp: 7000 },
    bell: { inst: 'glock', vol: 0.27, pan: 0.3, rev: 0.32, copy: 'lead', secs: ['B'], when: 'odd' },
    sham: { inst: 'shamisen', vol: 0.9, pan: -0.28, rev: 0.12, choke: true, strum: 0.008 },
    koto: { inst: 'koto', vol: 0.7, pan: 0.32, rev: 0.28 },
    bass: { inst: 'bass', vol: 0.34 },
    pad: { inst: 'strings', vol: 0.4, pan: -0.1, rev: 0.35 },
    padA: { inst: 'strings', vol: 0.32, pan: -0.1, rev: 0.35, when: 'odd' },
    brass: { inst: 'brass', vol: 0.47, pan: 0.12, rev: 0.2 },
    dr: { kit: true, vol: 0.55 },
    drF: { kit: true, vol: 1.3, when: 'final' },
  },
  sec: {
    intro: {
      chords: 'D D',
      parts: {
        sham: ['D4! . A4 D5 . A4 E5 . D5! . A4 B4 . A4 F#4 A4', 'D4! . A4 D5 . A4 E5 . D5! . A4 B4 . A4 F#4 A4'],
        lead: ['. . . . . . . . . . . . . . . .', 'A5 - - - - - - - B5 - A5 - F#5 - E5 -'],
        brass: [null, 'D4+F#4+A4+D5! - - - . . . . . . . . . . . .'],
        bass: ['D2 - - - - - - - - - - - - - - -', titleBass],
        dr: [T.in1, T.in2],
      },
    },
    A: {
      chords: 'D D G A Bm G A D',
      parts: {
        lead: [
          'F#5 - A5 - B5! - - - A5 - F#5 - E5 - - -',
          'D5 - E5 - F#5 - - - - - - - . . A4 -',
          'B4 - D5 - E5! - - - D5 - B4 - A4 - - -',
          'B4 - - - A4 - - - E5 - - - - - . .',
          'F#5 - A5 - B5! - - - D6 - B5 - A5 - - -',
          'B5 - A5 - B5 - - - - - - - . . D6 -',
          'E6!* - - - D6 - B5 - A5 - - - B5 - A5 -',
          'D6 - - - - - - - - - - - . . . .',
        ],
        sham: tpl('R! . 5 . 8 . 5 R R! . 5 . 8 . 5 .', 52),
        bass: [titleBass, titleBass, titleBass, titleBassFill, titleBass, titleBass, titleBass, titleBassFill],
        padA: padGen(57, 4),
        brass: [tpl('R+3+5+8! - - - . . . . . . . . . . . .', 57)],
        dr: [T.a1, T.a, T.a, T.a4, T.a, T.a, T.a, T.a8],
        drF: T.fin,
      },
    },
    B: {
      chords: 'G A F#m Bm G A D A',
      parts: {
        lead: [
          'D6!* - - - B5 - - - A5 - B5 - - - D6 -',
          'E6 - - - - - - - D6 - B5 - A5 - - -',
          'A5 - - - F#5 - - - E5 - F#5 - - - A5 -',
          'B5 - - - - - - - - - - - A5 - B5 -',
          'D6!* - - - B5 - - - A5 - B5 - - - D6 -',
          'E6 - - - - - - - F#6 - E6 - D6 - E6 -',
          'F#6! - - - - - - - E6 - D6 - B5 - A5 -',
          'B5 - - - A5 - - - - - - - . . . .',
        ],
        sham: tpl('8| . R+5 . R+5! . R+5 . R+5', 52),
        koto: tpl('8| R 5 8 10 12 10 8 5', 55),
        bass: [
          tpl('R! - - R - - R - R! - - R - - 8 -', 38), tpl('R! - - R - - R - R! - - R - - 8 -', 38),
          tpl('R! - - R - - R - R! - - R - - 8 -', 38), tpl('8| R! R 8 R 5 5 A A', 38),
          tpl('R! - - R - - R - R! - - R - - 8 -', 38), tpl('R! - - R - - R - R! - - R - - 8 -', 38),
          tpl('R! - - R - - R - R! - - R - - 8 -', 38), tpl('8| R! R 8 R 5 5 A A', 38),
        ],
        pad: padGen(57, 4),
        brass: [tpl('R+3+5! - - - . . . . . . . . . . . .', 57), null, null, null, tpl('R+3+5! - - - . . . . . . . . . . . .', 57)],
        dr: [T.b1, T.b, T.b, T.b4, T.b1, T.b, T.b, T.b8],
        drF: T.fin,
      },
    },
  },
};

// ================================================================== SELECT
// Relaxed menu loop: marimba motif, koto, soft pad, light percussion (woodblock, shaker).
const S = {
  a: { k: 'x.......x.......', wb: '....x.......x...', sk: 'x.x.x.x.x.x.x.x.' },
  a4: { k: 'x.......x.......', wb: '....x.......x.x.', sk: 'x.x.x.x.x.xxxxxx' },
  b: { k: 'x.......x.......', wb: '....x.......x...', sk: 'x.x.x.x.x.x.x.x.', hy: '..............o.' },
  b8: { k: 'x.......x...x...', wb: '....x...x.x.x.x.', sk: 'x.x.x.x.xxxxxxxx' },
};
const selBass = tpl('R - - - - - 5 - 8 - - - 5 - - -', 33);

export const select = {
  id: 'select', bpm: 108, gain: 1.45,
  kit: { k: { vol: 0.42 } },
  ch: {
    mar: { inst: 'marimba', vol: 0.96, pan: -0.12, rev: 0.22 },
    koto: { inst: 'koto', vol: 0.69, pan: 0.26, rev: 0.3 },
    kotoM: { inst: 'koto', vol: 1.55, pan: 0.12, rev: 0.3 },
    marA: { inst: 'marimba', vol: 0.43, pan: -0.28, rev: 0.2 },
    shaku: { inst: 'shaku', vol: 0.24, pan: 0.05, rev: 0.42, when: 'odd' },
    bass: { inst: 'bass', vol: 0.29, cut: 220 },
    pad: { inst: 'pad', vol: 0.34, rev: 0.42 },
    bell: { inst: 'glock', vol: 0.3, pan: 0.35, rev: 0.45 },
    dr: { kit: true, vol: 0.85 },
  },
  sec: {
    intro: {
      chords: 'Fmaj7',
      parts: {
        koto: tpl('8| R 5 8 . 10 . 8 5', 53),
        bell: ['8| . . . . . C6 D6 F6'],
        dr: [{ sk: 'x.x.x.x.x.x.x.x.' }],
      },
    },
    A: {
      chords: 'Fmaj7 Am7 Bbmaj7 C7sus4 Fmaj7 Am7 Gm7 C7sus4_C7',
      parts: {
        mar: [
          '8| C5 D5 F5 . D5 C5 A4 .',
          '8| C5 . . . . . G4 A4',
          '8| C5 D5 F5 . G5 F5 D5 .',
          '8| F5 . . . . . D5 C5',
          '8| C5 D5 F5 . D5 C5 A4 .',
          '8| C5 . . . . . D5 F5',
          '8| G5 . F5 D5 C5 . D5 .',
          '8| F5 . . . . . . .',
        ],
        koto: tpl('8| R 5 8 . 10 . 8 5', 53),
        bass: selBass,
        pad: padGen(55, 4),
        bell: [null, null, null, '8| . . . . . C6 D6 F6', null, null, null, '8| . . . . . F6 G6 A6'],
        dr: [S.a, S.a, S.a, S.a4, S.a, S.a, S.a, S.a4],
      },
    },
    B: {
      chords: 'Bbmaj7 C Dm7 Am7 Gm7 C Fmaj7_Dm7 Gm7_C7',
      parts: {
        kotoM: [
          '8| D5 - F5 - G5 - F5 D5',
          '8| C5 - - - . . D5 F5',
          '8| G5 - F5 - D5 - C5 -',
          '8| D5 - - - . . . .',
          '8| D5 - F5 - G5 - A5 -',
          '8| G5 - - - A5 - D5 -',
          '8| C5 - A4 - C5 - D5 -',
          '8| C5 - - - . . . .',
        ],
        marA: tpl('8| . 5 8 10 . 8 5 .', 55),
        shaku: ['1| F4', '1| G4', '1| F4', '1| E4', '1| D4', '1| E4', '2| C4 D4', '2| D4 E4'],
        bass: selBass,
        pad: padGen(55, 4),
        dr: [S.b, S.b, S.b, S.a4, S.b, S.b, S.b, S.b8],
      },
    },
  },
};

// ================================================================== RESULTS
// Warm and satisfied: shakuhachi then koto melody, koto arpeggios, marimba comping, pad.
const R = {
  a: { k: 'x.......x.......', br: '....x.......x...', sk: 'x.x.x.x.x.x.x.x.' },
  a4: { k: 'x.......x.......', br: '....x.......x.x.', sk: 'x.x.x.x.x.x.x.x.', wb: '............x.x.' },
};
export const results = {
  id: 'results', bpm: 100, gain: 1.2,
  kit: { k: { vol: 0.4 }, br: { vol: 0.24 } },
  ch: {
    lead: { inst: 'shaku', vol: 0.6, pan: 0.05, rev: 0.4 },
    kotoM: { inst: 'koto', vol: 1.64, pan: -0.08, rev: 0.32 },
    koto: { inst: 'koto', vol: 0.58, pan: 0.3, rev: 0.32 },
    mar: { inst: 'marimba', vol: 0.28, pan: -0.3, rev: 0.25 },
    bass: { inst: 'bass', vol: 0.3, cut: 230 },
    pad: { inst: 'pad', vol: 0.41, rev: 0.45 },
    bell: { inst: 'glock', vol: 0.3, pan: 0.32, rev: 0.45 },
    dr: { kit: true, vol: 0.8 },
  },
  sec: {
    intro: {
      chords: 'Bbmaj7',
      parts: {
        koto: tpl('8| R 5 8 10 12 10 8 5', 50),
        pad: padGen(55, 4),
        bell: ['8| . . . . F6 G6 Bb6 .'],
      },
    },
    A: {
      chords: 'Bbmaj7 Cm7 Dm7 Ebmaj7 Bbmaj7 Gm7 Cm7 F7sus4',
      parts: {
        lead: [
          '8| D5 - F5 - G5 - F5 D5',
          '8| C5 - - - - - D5 F5',
          '8| F5 - - - D5 - C5 -',
          '8| Bb4 - - - - - . .',
          '8| D5 - F5 - G5 - Bb5 -',
          '8| G5 - F5 - D5 - - -',
          '8| C5 - D5 - F5 - G5 -',
          '8| F5 - - - - - . .',
        ],
        koto: tpl('8| R 5 8 10 12 10 8 5', 50),
        mar: tpl('4| . 3+5+8 . 3+5+8', 58),
        bass: tpl('R - - - - - - 5 R - - - - - 8 -', 34),
        pad: padGen(55, 4),
        bell: [null, null, null, '8| . . . . . D6 F6 G6', null, null, null, '8| . . . . . F6 G6 Bb6'],
        dr: [R.a, R.a, R.a, R.a4, R.a, R.a, R.a, R.a4],
      },
    },
    B: {
      chords: 'Ebmaj7 F Dm7 Gm7 Cm7 F Bbmaj7 F7sus4',
      parts: {
        kotoM: [
          '8| G5 - - - F5 - G5 Bb5',
          '8| C6 - - - D6 - C6 -',
          '8| F5 - - - D5 - F5 G5',
          '8| G5 - - - - - . .',
          '8| G5 - F5 - D5 - C5 -',
          '8| C5 - D5 - F5 - - -',
          '8| D5 - - - C5 - Bb4 -',
          '8| C5 - - - - - . .',
        ],
        koto: tpl('8| R 5 8 10 12 10 8 5', 50),
        mar: tpl('4| . 3+5+8 . 3+5+8', 58),
        bass: tpl('R - - - - - - 5 R - - - - - 8 -', 34),
        pad: padGen(55, 4),
        dr: [R.a, R.a, R.a, R.a4, R.a, R.a, R.a, R.a4],
      },
    },
  },
};
