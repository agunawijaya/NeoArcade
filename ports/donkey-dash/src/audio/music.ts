import type { Patch, Song, Track } from '@shared/audio';
import type { RouteId } from '../engine/routes';

/**
 * The soundtrack: synthwave-country loops, one per route, each four bars
 * of sixteenth-note steps. Kick, snare and a train-beat hi-hat; a bass that
 * goes boom-chicka or pulses in eighths; a quiet low motor line that is the
 * engine humming along; held chords, an arpeggio, and a twangy lead.
 *
 * Runs are timed to the music: donkeys come into view on its beats, so every
 * song's tempo is the tempo of the road it plays on.
 */
export type SongId = RouteId | 'endless' | 'daily' | 'title';
type Groove = 'train' | 'drive' | 'slow';

interface Arrangement {
  bpm: number;
  /** One chord per bar, root first. */
  chords: readonly (readonly string[])[];
  /** Four bars of melody, sixteen steps each. */
  lead: readonly string[];
  groove: Groove;
}

const STEPS_PER_BAR = 16;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const KICK: Patch = {
  wave: 'sine',
  frequency: 150,
  glideTo: 0.3,
  envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.05 },
  gain: 0.7,
  duration: 0.12,
};
const SNARE: Patch = {
  wave: 'noise',
  filter: { type: 'bandpass', frequency: 1900, q: 0.9 },
  envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.08 },
  gain: 0.32,
  duration: 0.08,
};
const HAT: Patch = {
  wave: 'noise',
  filter: { type: 'highpass', frequency: 7000, q: 0.7 },
  envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
  gain: 0.12,
  duration: 0.02,
};
const BASS: Patch = {
  wave: 'sawtooth',
  filter: { type: 'lowpass', frequency: 520, q: 1.4 },
  envelope: { attack: 0.004, decay: 0.12, sustain: 0.5, release: 0.08 },
  gain: 0.3,
};
/** The engine: a low square, gated in sixteenths, under everything. */
const MOTOR: Patch = {
  wave: 'square',
  filter: { type: 'lowpass', frequency: 260, q: 0.8 },
  envelope: { attack: 0.004, decay: 0.05, sustain: 0.3, release: 0.03 },
  gain: 0.07,
};
const PAD: Patch = {
  wave: 'sawtooth',
  detuneCents: 7,
  filter: { type: 'lowpass', frequency: 1300, q: 0.6 },
  envelope: { attack: 0.25, decay: 0.4, sustain: 0.6, release: 0.5 },
  gain: 0.07,
};
const ARP: Patch = {
  wave: 'square',
  filter: { type: 'lowpass', frequency: 2400 },
  envelope: { attack: 0.002, decay: 0.08, sustain: 0.1, release: 0.05 },
  gain: 0.05,
};
/** Pluck-and-twang: a bright saw that dies fast, like a banjo run through a synth. */
const LEAD: Patch = {
  wave: 'sawtooth',
  filter: { type: 'lowpass', frequency: 3200, q: 2, sweepTo: 0.35 },
  envelope: { attack: 0.003, decay: 0.16, sustain: 0.35, release: 0.14 },
  gain: 0.13,
};

const ARRANGEMENTS: Record<SongId, Arrangement> = {
  farm: {
    bpm: 100,
    groove: 'train',
    chords: [
      ['G2', 'B2', 'D3'],
      ['C3', 'E3', 'G3'],
      ['D3', 'F#3', 'A3'],
      ['G2', 'B2', 'D3'],
    ],
    lead: [
      'D4 - . D4 G4 - B4 - A4 - G4 - . . . .',
      'E4 - . G4 C5 - B4 - A4 - G4 - E4 - . .',
      'F#4 - A4 - D5 - . C5 B4 - A4 - . . . .',
      'G4 - B4 - D5 - B4 - G4 - - - . . . .',
    ],
  },
  mountain: {
    bpm: 96,
    groove: 'slow',
    chords: [
      ['A2', 'C3', 'E3'],
      ['F2', 'A2', 'C3'],
      ['C3', 'E3', 'G3'],
      ['G2', 'B2', 'D3'],
    ],
    lead: [
      'E4 - - - A4 - C5 - B4 - A4 - . . . .',
      'F4 - - - A4 - C5 - D5 - C5 - . . . .',
      'E4 - G4 - C5 - - - B4 - G4 - E4 - . .',
      'D4 - G4 - B4 - D5 - B4 - - - . . . .',
    ],
  },
  desert: {
    bpm: 120,
    groove: 'drive',
    chords: [
      ['E2', 'G2', 'B2'],
      ['D2', 'F#2', 'A2'],
      ['C2', 'E2', 'G2'],
      ['B1', 'D#2', 'F#2'],
    ],
    lead: [
      'E4 . . E4 G4 . A4 . B4 - - - . . . .',
      'A4 . . A4 F#4 . D4 . E4 - - - . . . .',
      'C5 . B4 . A4 . G4 . A4 - - - E4 - . .',
      'D#4 - F#4 - B4 - - - A4 - G4 - F#4 - . .',
    ],
  },
  night: {
    bpm: 90,
    groove: 'slow',
    chords: [
      ['D2', 'F2', 'A2'],
      ['A#1', 'D2', 'F2'],
      ['F2', 'A2', 'C3'],
      ['C2', 'E2', 'G2'],
    ],
    lead: [
      'A4 - - - F4 - - - D5 - - - C5 - . .',
      'A#4 - - - D5 - - - F5 - - - E5 - . .',
      'C5 - - - A4 - - - F4 - G4 - A4 - . .',
      'G4 - - - E4 - - - C5 - - - . . . .',
    ],
  },
  snow: {
    bpm: 120,
    groove: 'drive',
    chords: [
      ['C3', 'E3', 'G3'],
      ['A2', 'C3', 'E3'],
      ['F2', 'A2', 'C3'],
      ['G2', 'B2', 'D3'],
    ],
    lead: [
      'E5 - G5 - E5 - C5 - D5 - E5 - . . . .',
      'C5 - E5 - A5 - G5 - E5 - C5 - . . . .',
      'F5 - E5 - D5 - C5 - A4 - C5 - D5 - . .',
      'B4 - D5 - G5 - - - F5 - E5 - D5 - . .',
    ],
  },
  endless: {
    bpm: 120,
    groove: 'drive',
    chords: [
      ['G2', 'B2', 'D3'],
      ['E2', 'G2', 'B2'],
      ['C3', 'E3', 'G3'],
      ['D3', 'F#3', 'A3'],
    ],
    lead: [
      'B4 - D5 - G5 - D5 - B4 - A4 - G4 - . .',
      'E4 - G4 - B4 - - - A4 - G4 - E4 - . .',
      'E5 - D5 - C5 - B4 - C5 - D5 - E5 - . .',
      'F#5 - - - E5 - D5 - C5 - A4 - F#4 - . .',
    ],
  },
  daily: {
    bpm: 112,
    groove: 'train',
    chords: [
      ['A2', 'C#3', 'E3'],
      ['D3', 'F#3', 'A3'],
      ['E3', 'G#3', 'B3'],
      ['A2', 'C#3', 'E3'],
    ],
    lead: [
      'E4 - A4 - C#5 - B4 - A4 - . E4 A4 - . .',
      'F#4 - A4 - D5 - C#5 - B4 - A4 - F#4 - . .',
      'G#4 - B4 - E5 - D5 - C#5 - B4 - G#4 - . .',
      'A4 - C#5 - E5 - - - C#5 - A4 - - - . .',
    ],
  },
  title: {
    bpm: 100,
    groove: 'train',
    chords: [
      ['C3', 'E3', 'G3'],
      ['F2', 'A2', 'C3'],
      ['G2', 'B2', 'D3'],
      ['C3', 'E3', 'G3'],
    ],
    lead: [
      'G4 - . G4 C5 - E5 - D5 - C5 - . . . .',
      'A4 - . C5 F5 - E5 - D5 - C5 - A4 - . .',
      'B4 - D5 - G5 - . F5 E5 - D5 - . . . .',
      'C5 - E5 - G5 - E5 - C5 - - - . . . .',
    ],
  },
};

export function songFor(id: SongId): Song {
  return arrange(ARRANGEMENTS[id]);
}

export function bpmOf(id: SongId): number {
  return ARRANGEMENTS[id].bpm;
}

function arrange({ bpm, chords, lead, groove }: Arrangement): Song {
  const bars = (build: (chord: readonly string[], bar: number) => string[]) =>
    chords.flatMap((chord, bar) => build(chord, bar)).join(' ');
  const hits = (steps: readonly number[], note: string) => (): string[] =>
    Array.from({ length: STEPS_PER_BAR }, (_, step) => (steps.includes(step) ? note : '.'));

  const kick = { train: [0, 8], drive: [0, 4, 8, 12], slow: [0, 10] }[groove];
  const snare = { train: [4, 12], drive: [4, 12], slow: [8] }[groove];
  const hat = { train: [2, 6, 10, 14, 3, 11], drive: [2, 6, 10, 14], slow: [4, 12] }[groove];

  const tracks: Track[] = [
    { patch: KICK, pattern: bars(hits(kick, 'D3')) },
    { patch: SNARE, pattern: bars(hits(snare, 'A4')) },
    { patch: HAT, pattern: bars(hits(hat, 'A5')) },
    { patch: BASS, pattern: bars((chord) => bassLine(chord, groove)) },
    {
      patch: MOTOR,
      pattern: bars((chord) => Array(STEPS_PER_BAR).fill(shift(chord[0] as string, -12))),
    },
    ...[0, 1, 2].map((voice) => ({
      patch: PAD,
      pattern: bars((chord) => [
        shift(chord[voice] as string, 12),
        ...Array(STEPS_PER_BAR - 1).fill('-'),
      ]),
    })),
    {
      patch: ARP,
      pattern: bars((chord) =>
        Array.from({ length: STEPS_PER_BAR }, (_, step) => shift(chord[step % 3] as string, 24)),
      ),
    },
    { patch: LEAD, pattern: lead.join(' ') },
  ];
  return { bpm, stepsPerBeat: 4, loop: true, tracks };
}

/** Boom-chicka for the country grooves, driving eighths for the synthwave one. */
function bassLine(chord: readonly string[], groove: Groove): string[] {
  const root = chord[0] as string;
  const fifth = chord[2] as string;
  if (groove === 'drive') {
    return Array.from({ length: STEPS_PER_BAR }, (_, step) =>
      step % 2 === 1 ? '.' : step % 4 === 0 ? root : shift(root, 12),
    );
  }
  const line = Array<string>(STEPS_PER_BAR).fill('.');
  line[0] = root;
  line[1] = '-';
  line[8] = shift(fifth, -12);
  line[9] = '-';
  if (groove === 'train') line[12] = root;
  return line;
}

/** Moves a note name up or down by semitones: shift('A2', 12) is 'A3'. */
export function shift(name: string, semitones: number): string {
  const match = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`Cannot read note "${name}".`);
  const [, letter = 'C', sharp, octave = '4'] = match;
  const midi = (Number(octave) + 1) * 12 + (LETTERS[letter] ?? 0) + (sharp ? 1 : 0) + semitones;
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Every song, for tests. */
export const SONG_IDS = Object.keys(ARRANGEMENTS) as SongId[];
