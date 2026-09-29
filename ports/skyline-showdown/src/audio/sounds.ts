import { noteFrequency, type AudioEngine, type Patch, type Song, type Sound } from '@shared/audio';

/** Every sound in the game, synthesised; nothing is sampled. */
export const SOUNDS = {
  throw: [
    {
      wave: 'noise',
      frequency: 600,
      glideTo: 2.4,
      filter: { type: 'bandpass', frequency: 700, q: 2.5, sweepTo: 3.5 },
      envelope: { attack: 0.01, decay: 0.12, sustain: 0.25, release: 0.12 },
      gain: 0.4,
      duration: 0.16,
    },
    {
      wave: 'triangle',
      frequency: 200,
      glideTo: 2,
      envelope: { attack: 0.005, decay: 0.07, sustain: 0, release: 0.05 },
      gain: 0.25,
      duration: 0.07,
    },
  ],
  explosion: [
    {
      wave: 'noise',
      frequency: 320,
      glideTo: 0.3,
      filter: { type: 'lowpass', frequency: 2600, q: 0.7, sweepTo: 0.08 },
      envelope: { attack: 0.003, decay: 0.3, sustain: 0.3, release: 0.45 },
      gain: 0.65,
      duration: 0.3,
    },
    {
      wave: 'sine',
      frequency: 130,
      glideTo: 0.3,
      envelope: { attack: 0.004, decay: 0.28, sustain: 0, release: 0.2 },
      gain: 0.75,
      duration: 0.25,
    },
  ],
  bigBoom: [
    {
      wave: 'noise',
      frequency: 260,
      glideTo: 0.2,
      filter: { type: 'lowpass', frequency: 3200, q: 0.8, sweepTo: 0.05 },
      envelope: { attack: 0.003, decay: 0.6, sustain: 0.35, release: 1.1 },
      gain: 0.85,
      duration: 0.7,
    },
    {
      wave: 'sine',
      frequency: 95,
      glideTo: 0.35,
      envelope: { attack: 0.004, decay: 0.6, sustain: 0.1, release: 0.5 },
      gain: 0.9,
      duration: 0.5,
    },
    {
      wave: 'sawtooth',
      frequency: 60,
      glideTo: 0.5,
      filter: { type: 'lowpass', frequency: 300, q: 1 },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.3 },
      gain: 0.35,
      duration: 0.4,
    },
  ],
  gasp: [
    {
      wave: 'sine',
      frequency: 480,
      glideTo: 1.7,
      envelope: { attack: 0.02, decay: 0.15, sustain: 0.5, release: 0.15 },
      gain: 0.28,
      duration: 0.25,
    },
    {
      wave: 'triangle',
      frequency: 720,
      glideTo: 1.5,
      envelope: { attack: 0.02, decay: 0.15, sustain: 0.3, release: 0.12 },
      gain: 0.1,
      duration: 0.22,
    },
  ],
  pop: [
    {
      wave: 'noise',
      frequency: 1200,
      filter: { type: 'highpass', frequency: 1500, q: 0.8 },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.04 },
      gain: 0.5,
      duration: 0.04,
    },
    {
      wave: 'sine',
      frequency: 880,
      glideTo: 1.8,
      envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.1 },
      gain: 0.3,
      duration: 0.1,
    },
  ],
  bounce: {
    wave: 'sine',
    frequency: 170,
    glideTo: 2.6,
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.2, release: 0.15 },
    gain: 0.45,
    duration: 0.18,
  },
  tick: {
    wave: 'square',
    frequency: 1500,
    filter: { type: 'lowpass', frequency: 3000 },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
    gain: 0.05,
    duration: 0.02,
  },
  shield: [
    {
      wave: 'triangle',
      frequency: 1320,
      envelope: { attack: 0.005, decay: 0.5, sustain: 0, release: 0.4 },
      gain: 0.3,
      duration: 0.3,
    },
    {
      wave: 'sine',
      frequency: 1980,
      envelope: { attack: 0.005, decay: 0.7, sustain: 0, release: 0.5 },
      gain: 0.2,
      duration: 0.4,
    },
  ],
  street: {
    wave: 'noise',
    frequency: 200,
    filter: { type: 'lowpass', frequency: 500, q: 0.7 },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.2 },
    gain: 0.35,
    duration: 0.15,
  },
  thunder: {
    wave: 'noise',
    frequency: 140,
    glideTo: 0.6,
    filter: { type: 'lowpass', frequency: 260, q: 0.6, sweepTo: 0.5 },
    envelope: { attack: 0.3, decay: 0.8, sustain: 0.4, release: 1.4 },
    gain: 0.45,
    duration: 1,
  },
  click: {
    wave: 'square',
    frequency: 1200,
    glideTo: 1.3,
    filter: { type: 'lowpass', frequency: 2600 },
    envelope: { attack: 0.002, decay: 0.05, sustain: 0, release: 0.04 },
    gain: 0.08,
    duration: 0.04,
  },
  beep: {
    wave: 'square',
    frequency: 440,
    filter: { type: 'lowpass', frequency: 1800 },
    envelope: { attack: 0.005, decay: 0.05, sustain: 0.6, release: 0.05 },
    gain: 0.12,
    duration: 0.12,
  },
  crate: [
    {
      wave: 'noise',
      frequency: 500,
      filter: { type: 'bandpass', frequency: 900, q: 1.4, sweepTo: 0.4 },
      envelope: { attack: 0.002, decay: 0.12, sustain: 0.1, release: 0.12 },
      gain: 0.6,
      duration: 0.12,
    },
    {
      wave: 'triangle',
      frequency: 180,
      glideTo: 0.6,
      envelope: { attack: 0.002, decay: 0.1, sustain: 0, release: 0.06 },
      gain: 0.5,
      duration: 0.08,
    },
  ],
  bell: [
    {
      wave: 'sine',
      frequency: 1175,
      envelope: { attack: 0.002, decay: 1.4, sustain: 0, release: 0.9 },
      gain: 0.32,
      duration: 1,
    },
    {
      wave: 'sine',
      frequency: 2804,
      envelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.4 },
      gain: 0.12,
      duration: 0.5,
    },
    {
      wave: 'triangle',
      frequency: 587,
      envelope: { attack: 0.002, decay: 1.1, sustain: 0, release: 0.7 },
      gain: 0.16,
      duration: 0.9,
    },
  ],
  hoop: {
    wave: 'sine',
    frequency: 660,
    glideTo: 2,
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.2, release: 0.2 },
    gain: 0.25,
    duration: 0.22,
  },
} satisfies Record<string, Sound>;

export type SoundName = keyof typeof SOUNDS;

const LEAD: Patch = {
  wave: 'square',
  filter: { type: 'lowpass', frequency: 2400, q: 1 },
  envelope: { attack: 0.005, decay: 0.12, sustain: 0.45, release: 0.08 },
  gain: 0.13,
};

/** A few rising notes when a round begins. */
export function playFanfare(audio: AudioEngine, notes: readonly string[], gap = 0.09) {
  notes.forEach((note, index) =>
    audio.play({ ...LEAD, duration: 0.12 }, { frequency: noteFrequency(note), delay: index * gap }),
  );
}

const BASS: Patch = {
  wave: 'triangle',
  envelope: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.08 },
  gain: 0.38,
};
const PAD: Patch = {
  wave: 'sawtooth',
  detuneCents: 7,
  filter: { type: 'lowpass', frequency: 900, q: 0.8 },
  envelope: { attack: 0.3, decay: 0.3, sustain: 0.7, release: 0.6 },
  gain: 0.07,
};
const KICK: Patch = {
  wave: 'sine',
  glideTo: 0.3,
  envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.08 },
  gain: 0.55,
};
const SNARE: Patch = {
  wave: 'noise',
  filter: { type: 'bandpass', frequency: 1800, q: 0.9 },
  envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.08 },
  gain: 0.3,
};
const HAT: Patch = {
  wave: 'noise',
  filter: { type: 'highpass', frequency: 7000 },
  envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
  gain: 0.12,
};

/** The theme: an original, upbeat synth tune in C minor for the title and menus. */
export const THEME: Song = {
  bpm: 118,
  tracks: [
    {
      patch: LEAD,
      pattern: [
        'G4 - Eb4 . G4 . C5 - . Bb4 G4 . F4 - Eb4 .',
        'Eb4 - C4 . Eb4 . Ab4 - . G4 Eb4 . C4 - . .',
        'Bb4 - G4 . Bb4 . Eb5 - . D5 Bb4 . G4 - F4 .',
        'F4 - D4 . F4 . Bb4 - . Ab4 F4 . D4 - C4 .',
      ].join(' '),
    },
    {
      patch: BASS,
      pattern: [
        'C2 . C2 . C3 . C2 . C2 . C2 . G1 . Bb1 .',
        'Ab1 . Ab1 . Ab2 . Ab1 . Ab1 . Ab1 . Eb2 . G1 .',
        'Eb2 . Eb2 . Eb3 . Eb2 . Eb2 . Eb2 . Bb1 . D2 .',
        'Bb1 . Bb1 . Bb2 . Bb1 . Bb1 . Bb1 . F2 . A1 .',
      ].join(' '),
    },
    {
      patch: PAD,
      pattern: ['G3', 'C4', 'Bb3', 'D4'].map((note) => `${note}${' -'.repeat(15)}`).join(' '),
    },
    { patch: KICK, pattern: 'C3 . . . . . . . C3 . . C3 . . . .' },
    { patch: SNARE, pattern: '. . . . C4 . . . . . . . C4 . . .' },
    { patch: HAT, pattern: '. . C6 . . . C6 . . . C6 . . . C6 .' },
  ],
};

/** A crowd-free city at night: a low hum of traffic and air conditioning. */
export const CITY_HUM: Song = {
  bpm: 30,
  stepsPerBeat: 1,
  tracks: [
    {
      patch: {
        wave: 'noise',
        filter: { type: 'lowpass', frequency: 320, q: 0.5 },
        envelope: { attack: 1.8, decay: 0.5, sustain: 0.9, release: 2.2 },
        gain: 0.3,
      },
      pattern: 'A2 - - -',
    },
    {
      patch: {
        wave: 'sine',
        envelope: { attack: 2, decay: 0.5, sustain: 0.8, release: 2.5 },
        gain: 0.05,
      },
      pattern: 'A1 - - - E2 - - -',
    },
  ],
};

export const VICTORY: Song = {
  bpm: 150,
  loop: false,
  tracks: [
    { patch: LEAD, pattern: 'C5 . E5 . G5 . C6 - - . G5 . C6 - - - - - - -' },
    { patch: BASS, pattern: 'C2 . . . E2 . . . G2 . . . C3 - - - - - - -' },
    { patch: KICK, pattern: 'C3 . . . C3 . . . C3 . . . C3 . . . . . . .' },
  ],
};
