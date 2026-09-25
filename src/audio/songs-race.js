// Race music: inaka (G major, 150 BPM shuffle), sakura (A minor miyako-bushi → C major, 156 BPM),
// matsuri (D min'yō, 168 BPM matsuri-bayashi). All melodies are original.
import { tpl, padGen } from './sequencer.js';

// ================================================================== INAKA 夕焼けたんぼ道
// Nostalgic but upbeat evening ride: shinobue melody on G yonanuki (G A B D E), shamisen off-beat
// double stops, two-beat synth bass with ii–V walk-ups, brushes, cicada shaker.
const I = {
  in1: { br: '....x.......x...', ci: 'xoxoxoxoxoxoxoxo' },
  in2: { k: 'x.......x.......', br: '....x.......x.xx', ci: 'xoxoxoxoxoxoxoxo', don: '............x.x.' },
  a: { k: 'x.......x.......', br: '....x.......x...', ci: 'xoxoxoxoxoxoxoxo' },
  a1: { k: 'x.......x.......', br: '....x.......x...', ci: 'xoxoxoxoxoxoxoxo', cr: 'x...............' },
  a4: { k: 'x.......x.......', br: '....x.......x.xx', ci: 'xoxoxoxoxoxo....', don: '........x...x.x.' },
  a8: { k: 'x.......x...x...', s: '........o.o.xxXX', br: '....x...........', ci: 'xoxoxoxo........', don: 'x.......x.x.x.x.' },
  b: { k: 'x.......x.......', s: '....x.......x...', br: '....o.......o...', ci: 'xoxoxoxoxoxoxoxo', sh: '..x...x...x...x.' },
  b1: { k: 'x.......x.......', s: '....x.......x...', ci: 'xoxoxoxoxoxoxoxo', sh: '..x...x...x...x.', cr: 'X...............', don: 'x...............' },
  b4: { k: 'x.......x.......', s: '....x.......x.xx', ci: 'xoxoxoxoxoxo....', sh: '..x...x...xxxxxx' },
  b8: { k: 'x.......x.......', s: '....x...x.x.XXXX', ci: 'xoxoxoxo........', don: 'x.......x.x.xxXX' },
  fin: { sh: 'o.xoo.xoo.xoo.xo', h: '..x...x...x...x.' },
};
const twoBeat = tpl('R - . . L5 - . . R - . . L5 - . A?', 38);
const iiV = tpl('R - . . L5 - . . R - . . 3 - . .', 38);

export const inaka = {
  id: 'inaka', bpm: 150, swing: 0.12, gain: 1,
  kit: { k: { vol: 0.5 } },
  ch: {
    lead: { inst: 'flute', vol: 0.8, pan: 0.05, rev: 0.25, lp: 6500 },
    sham: { inst: 'shamisen', vol: 0.78, pan: -0.3, rev: 0.12, choke: true, strum: 0.009 },
    koto: { inst: 'koto', vol: 0.58, pan: 0.32, rev: 0.28, when: 'odd' },
    bass: { inst: 'bass', vol: 0.37 },
    pad: { inst: 'pad', vol: 0.37, rev: 0.4 },
    dr: { kit: true, vol: 0.7 },
    drF: { kit: true, vol: 1.35, when: 'final' },
  },
  sec: {
    intro: {
      chords: 'G D7',
      parts: {
        sham: tpl('8| . R+5 . R+5 . R+5 . R+5', 50),
        lead: [null, '. . . . . . . . . . G4 - A4 - B4 -'],
        bass: twoBeat,
        dr: [I.in1, I.in2],
      },
    },
    A: {
      chords: 'G Em Am7_D7 G C Bm7_Em Am7_D7 G',
      parts: {
        lead: [
          'D5 - - - E5 - G5 - - - E5 - D5 - B4 -',
          'D5 - - - - - - - . . B4 - D5 - E5 -',
          'G5 - - - E5 - D5 - E5 - - - D5 - B4 -',
          'B4 - - - A4 - G4 - - - - - . . . .',
          'E5 - - - G5 - A5 - - - G5 - E5 - D5 -',
          'D5 - - - - - B4 - D5 - - - E5 - - -',
          'G5 - - - E5 - D5 - E5 - - - A5 - G5 -',
          'G5 - - - - - - - - - - - . . D5 E5',
        ],
        sham: tpl('8| . R+5 . R+5 . R+5 . R+5?', 50),
        koto: tpl('8| R 5 8 10 12 10 8 5', 55),
        bass: [twoBeat, twoBeat, iiV, twoBeat, twoBeat, twoBeat, iiV, twoBeat],
        dr: [I.a1, I.a, I.a, I.a4, I.a, I.a, I.a, I.a8],
        drF: I.fin,
      },
    },
    B: {
      chords: 'C D Bm7 Em Am7 D7 Bm7_Em Am7_D7',
      parts: {
        lead: [
          'G5 - - - - - E5 - G5 - A5 - - - G5 -',
          'A5 - - - - - - - . . D5 - E5 - G5 -',
          'B5 - - - A5 - - - B5 - D6 - - - B5 -',
          'G5 - - - E5 - - - - - - - . . D5 E5',
          'G5 - - - E5 - D5 - E5 - - - G5 - A5 -',
          'A5 - - - - - - - D6 - B5 - A5 - D6 -',
          'B5 - - - A5 - G5 - E5 - - - D5 - E5 -',
          'G5 - - - - - - - A5 - - - . . . .',
        ],
        sham: tpl('8| . R+5 . R+5! . R+5 . R+5', 50),
        koto: tpl('8| R 5 8 10 12 10 8 5', 55),
        pad: padGen(55, 4),
        bass: [twoBeat, twoBeat, twoBeat, twoBeat, twoBeat, twoBeat, twoBeat, iiV],
        dr: [I.b1, I.b, I.b, I.b4, I.b, I.b, I.b, I.b8],
        drF: I.fin,
      },
    },
  },
};

// ================================================================== SAKURA 桜咲く千本鳥居
// Elegant and driving: 16th-note koto arpeggios, flute melody in miyako-bushi (E F A B C) over
// A minor, resolving into a bright C-major (yonanuki) B section doubled by strings.
const K = {
  in1: { don: 'X...............', h: '........x.x.x.x.' },
  in2: { don: 'X.......X...X.X.', h: 'xoxoxoxoxoxoxoxo', s: '............x.xx' },
  a: { k: 'X...x...X...x...', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', ka: '..........x.....' },
  a1: { k: 'X...x...X...x...', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', don: 'X...............', cr: 'X...............' },
  a4: { k: 'X...x...X...x...', s: '....X.......XxXX', h: 'xoxoxoxoxoxo....', don: '........X.x.X.X.' },
  a8: { k: 'X...x...X.......', s: '....X...X.X.XXXX', h: 'xoxoxoxo........', don: 'X.......X.X.XXXX' },
  b: { k: 'X...x...X...x...', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', oh: '..x...x...x...x.', sh: 'o..o..o.o..o..o.' },
  b1: { k: 'X...x...X...x...', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', oh: '..x...x...x...x.', don: 'X...............', cr: 'X...............' },
  b4: { k: 'X...x...X...x...', s: '....X.......XxXX', c: '....x.......x...', h: 'x.x.x.x.x.x.....', don: '........X...X.X.' },
  b8: { k: 'X...x...X.......', s: '....X...XXXXXXXX', don: 'X.......X.X.XXXX', cr: '................' },
  fin: { sh: 'xoxoxoxoxoxoxoxo' },
};
const sakBass = tpl('8| R! R 8 R R! R 8 R', 33);
const sakBassB = tpl('8| R! R 8 R R! 8 R 8', 33);

export const sakura = {
  id: 'sakura', bpm: 156, gain: 1,
  ch: {
    lead: { inst: 'flute', vol: 0.68, pan: 0.04, rev: 0.28, lp: 6500 },
    str: { inst: 'strings', vol: 0.6, pan: -0.14, rev: 0.35, copy: 'lead', tr: -12, secs: ['B'], when: 'odd' },
    koto: { inst: 'koto', vol: 0.68, pan: 0.28, rev: 0.24 },
    sham: { inst: 'shamisen', vol: 0.69, pan: -0.32, rev: 0.12, choke: true, strum: 0.008 },
    bass: { inst: 'bass', vol: 0.3 },
    pad: { inst: 'pad', vol: 0.37, rev: 0.4 },
    bell: { inst: 'glock', vol: 0.3, pan: 0.36, rev: 0.4 },
    dr: { kit: true, vol: 0.38 },
    drF: { kit: true, vol: 1.5, when: 'final' },
  },
  sec: {
    intro: {
      chords: 'Am E',
      parts: {
        koto: tpl('R 5 8 10 12 10 8 5 R 5 8 10 12 10 8 5', 52),
        lead: [null, '. . . . . . . . B4 - - - C5 - D5 -'],
        bass: [null, sakBass],
        dr: [K.in1, K.in2],
      },
    },
    A: {
      chords: 'Am Fmaj7 Dm7 Esus4_E Am_Dm7 Fmaj7 Dm7_E7sus4 Am',
      parts: {
        lead: [
          'E5 - - - F5 - E5 - C5 - - - B4 - A4 -',
          'B4 - - - C5 - - - A4 - - - - - - -',
          'A4 - - - C5 - D5 - E5 - - - F5 - E5 -',
          'E5 - - - - - - - B4 - - - . . E5 F5',
          'A5!* - - - B5 - A5 - F5 - - - E5 - C5 -',
          'E5 - - - F5 - - - C5 - - - - - - -',
          'D5 - - - C5 - B4 - A4 - - - B4 - C5 -',
          'B4 - - - - - - - A4 - - - . . . .',
        ],
        koto: tpl('R 5 8 10 12 10 8 5 R 5 8 10 12 10 8 5', 52),
        bass: sakBass,
        pad: padGen(57, 4),
        dr: [K.a1, K.a, K.a, K.a4, K.a, K.a, K.a, K.a8],
        drF: K.fin,
      },
    },
    B: {
      chords: 'Fmaj7 G Em7 Am7 Dm7 G C E7',
      parts: {
        lead: [
          'A5 - - - G5 - A5 - C6 - - - A5 - G5 -',
          'G5 - - - - - - - D5 - E5 - G5 - - -',
          'E5 - - - G5 - A5 - G5 - - - E5 - D5 -',
          'E5 - - - - - - - . . C5 - D5 - E5 -',
          'A5 - - - G5 - A5 - C6 - - - D6 - C6 -',
          'D6*! - - - - - - - C6 - A5 - G5 - - -',
          'E5 - - - G5 - - - C6 - - - - - - -',
          'B5 - - - - - - - G#5 - - - . . . .',
        ],
        koto: tpl('8| R 5 8 10 12 10 8 5', 55),
        sham: tpl('8| . R+5 . R+5 . R+5 . R+5', 52),
        bass: sakBassB,
        pad: padGen(57, 4),
        bell: ['8| . . . . . . . .', null, null, '8| . . . . . G6 A6 C7', null, null, null, '8| . . . . . . . .'],
        dr: [K.b1, K.b, K.b, K.b4, K.b1, K.b, K.b, K.b8],
        drF: K.fin,
      },
    },
  },
};

// ================================================================== MATSURI 夏祭り花火ナイト
// High-energy matsuri-bayashi: taiko "don-don kaka" ostinato, shime-daiko 16ths, kane & chappa,
// shinobue lead on the D min'yō scale (D F G A C), driving bass, four-on-the-floor, shouts.
const M = {
  in1: { don: 'X.x.X.x.X.x.X.x.', sh: '1.2.3.4.5.6.7.8.', sy: 'x...............' },
  in2: { don: 'X.x.X.x.XxXxXXXX', sh: 'XoxoXoxoXXXXXXXX', kn: 'x.......x.......', ha: '............x...' },
  a: { k: 'X...X...X...X...', c: '....X.......X...', don: 'X.x.....X.x.....', ka: '....x.x.....x.x.', sh: 'XoxoXoxoXoxoXoxo', cp: '..x...x...x...x.', kn: 'x.......x.......', km: '.....x.......x..' },
  a1: { k: 'X...X...X...X...', c: '....X.......X...', don: 'X.x.....X.x.....', ka: '....x.x.....x.x.', sh: 'XoxoXoxoXoxoXoxo', cp: '..x...x...x...x.', kn: 'x.......x.......', cr: 'X...............' },
  a4: { k: 'X...X...X...X...', c: '....X.......X...', don: 'X.x.X.x.X.x.XXXX', sh: 'XoxoXoxoXxxxXXXX', cp: '..x...x...x.....', kn: 'x.......x.......' },
  a8: { k: 'X...X...X.......', don: 'X.x.X.x.XxXxXXXX', sh: 'XxxxXxxxXXXXXXXX', kn: 'x...x...x.......', sy: '............x...' },
  b: { k: 'X...X...X...X...', c: '....X.......X...', don: 'X..x..x.X..x..x.', ka: '..x.......x.....', sh: 'XoxoXoxoXoxoXoxo', oh: '..x...x...x...x.', cp: '..x...x...x...x.', kn: 'x...x...x...x...' },
  b1: { k: 'X...X...X...X...', c: '....X.......X...', don: 'X..x..x.X..x..x.', sh: 'XoxoXoxoXoxoXoxo', oh: '..x...x...x...x.', cp: '..x...x...x...x.', kn: 'x...x...x...x...', cr: 'X...............' },
  b4: { k: 'X...X...X...X...', c: '....X.......X...', don: 'X..x..x.X.x.X.x.', sh: 'XoxoXoxoXxxxXxxx', cp: '..x...x.........', ha: '............x...' },
  b8: { k: 'X...X...X.......', don: 'X.x.X.x.XxXxXXXX', sh: 'XxxxXxxxXXXXXXXX', kn: 'x...x...x...x...', cr: '............X...' },
  fin: { h: 'xoxoxoxoxoxoxoxo', ka: '..x...x...x...x.', don: '......x.......x.' },
};
const matBass = tpl('8| R! 8 R 8 R! 8 R 8', 34);
const matBassFill = tpl('8| R! 8 R 8 5 5 A A', 34);

export const matsuri = {
  id: 'matsuri', bpm: 168, gain: 1,
  ch: {
    lead: { inst: 'flute', vol: 0.66, pan: 0.05, rev: 0.25, lp: 7000 },
    lead2: { inst: 'flute', vol: 0.31, pan: -0.22, rev: 0.3, copy: 'lead', tr: -12, when: 'odd' },
    sham: { inst: 'shamisen', vol: 0.66, pan: -0.3, rev: 0.12, choke: true },
    bass: { inst: 'bass', vol: 0.33 },
    pad: { inst: 'strings', vol: 0.37, pan: 0.1, rev: 0.35 },
    dr: { kit: true, vol: 0.52 },
    drF: { kit: true, vol: 0.55, when: 'final' },
  },
  sec: {
    intro: {
      chords: 'Dm Dm',
      parts: {
        lead: ['D6 - - - - - - - - - - - - - - -', '- - - - - - - - C6 - A5 - C6 - . .'],
        dr: [M.in1, M.in2],
      },
    },
    A: {
      chords: 'Dm C Bb C Dm C Bb_C Dm',
      parts: {
        lead: [
          'D6!* - - - C6 - A5 - C6 - D6 - A5 - G5 -',
          'A5 - - - - - G5 - A5 - C6 - - - A5 -',
          'G5 - - - F5 - D5 - F5 - G5 - A5 - C6 -',
          'A5 - - - - - - - G5 - - - A5 - - -',
          'D6!* - - - C6 - A5 - C6 - D6 - F6 - D6 -',
          'C6 - - - - - A5 - G5 - A5 - C6 - - -',
          'D6 - - - C6 - A5 - G5 - - - A5 - C6 -',
          'D6 - - - - - - - . . . . . . . .',
        ],
        sham: tpl('R! . R 5 . R 8 . R! . R 5 . R 8 5', 50),
        bass: [matBass, matBass, matBass, matBassFill, matBass, matBass, matBass, matBassFill],
        dr: [M.a1, M.a, M.a, M.a4, M.a, M.a, M.a, M.a8],
        drF: M.fin,
      },
    },
    B: {
      chords: 'Bb C Am Dm Bb C Dm C',
      parts: {
        lead: [
          'F5 - G5 - A5 - - - C6 - A5 - G5 - F5 -',
          'G5 - - - - - - - . . A5 - C6 - D6 -',
          'C6 - - - A5 - - - G5 - A5 - C6 - A5 -',
          'D6 - - - - - - - . . . . . . . .',
          'F6!* - - - D6 - C6 - D6 - - - C6 - A5 -',
          'C6 - - - - - A5 - G5 - A5 - C6 - D6 -',
          'D6 - - - C6 - A5 - G5 - F5 - G5 - A5 -',
          'G5 - - - - - - - - - - - . . . .',
        ],
        sham: tpl('8| . R+5 . R+5! . R+5 . R+5', 50),
        bass: [matBass, matBass, matBass, matBassFill, matBass, matBass, matBass, matBassFill],
        pad: padGen(57, 4),
        dr: [M.b1, M.b, M.b, M.b4, M.b1, M.b, M.b, M.b8],
        drF: M.fin,
      },
    },
  },
};
