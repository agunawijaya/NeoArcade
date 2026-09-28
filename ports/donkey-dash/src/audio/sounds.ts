import type { AudioEngine, Patch, Sound } from '@shared/audio';
import type { HornSound } from '../garage';

/** Every sound effect, synthesized; nothing is sampled. */
export const SOUNDS = {
  whoosh: [
    {
      wave: 'noise',
      frequency: 500,
      glideTo: 2.2,
      filter: { type: 'bandpass', frequency: 900, q: 1.8, sweepTo: 3 },
      envelope: { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.08 },
      gain: 0.28,
      duration: 0.09,
    },
    {
      wave: 'triangle',
      frequency: 260,
      glideTo: 1.6,
      envelope: { attack: 0.003, decay: 0.05, sustain: 0, release: 0.03 },
      gain: 0.12,
      duration: 0.05,
    },
  ],
  squelch: [
    {
      wave: 'noise',
      frequency: 180,
      filter: { type: 'lowpass', frequency: 700, q: 3, sweepTo: 0.4 },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.2, release: 0.1 },
      gain: 0.5,
      duration: 0.12,
    },
    {
      wave: 'sine',
      frequency: 150,
      glideTo: 0.55,
      envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.08 },
      gain: 0.35,
      duration: 0.1,
    },
  ],
  crash: [
    {
      wave: 'noise',
      frequency: 300,
      glideTo: 0.25,
      filter: { type: 'lowpass', frequency: 3000, q: 0.8, sweepTo: 0.06 },
      envelope: { attack: 0.002, decay: 0.45, sustain: 0.3, release: 0.8 },
      gain: 0.75,
      duration: 0.5,
    },
    {
      wave: 'sine',
      frequency: 110,
      glideTo: 0.3,
      envelope: { attack: 0.003, decay: 0.5, sustain: 0.1, release: 0.4 },
      gain: 0.85,
      duration: 0.4,
    },
    {
      wave: 'square',
      frequency: 820,
      glideTo: 0.45,
      filter: { type: 'bandpass', frequency: 1400, q: 4 },
      envelope: { attack: 0.002, decay: 0.2, sustain: 0.1, release: 0.3 },
      gain: 0.18,
      duration: 0.25,
    },
  ],
  carrot: [
    {
      wave: 'noise',
      frequency: 1800,
      filter: { type: 'highpass', frequency: 2400, q: 0.7 },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.04 },
      gain: 0.35,
      duration: 0.04,
    },
    {
      wave: 'sine',
      frequency: 880,
      glideTo: 1.5,
      envelope: { attack: 0.004, decay: 0.1, sustain: 0, release: 0.08 },
      gain: 0.25,
      duration: 0.09,
    },
  ],
  onBeat: {
    wave: 'square',
    frequency: 1560,
    filter: { type: 'bandpass', frequency: 1800, q: 6 },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.05 },
    gain: 0.12,
    duration: 0.05,
  },
  tick: {
    wave: 'triangle',
    frequency: 660,
    envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.06 },
    gain: 0.25,
    duration: 0.06,
  },
  go: {
    wave: 'triangle',
    frequency: 1320,
    envelope: { attack: 0.002, decay: 0.2, sustain: 0.3, release: 0.25 },
    gain: 0.28,
    duration: 0.25,
  },
  hop: {
    wave: 'sine',
    frequency: 380,
    glideTo: 1.8,
    envelope: { attack: 0.004, decay: 0.08, sustain: 0, release: 0.05 },
    gain: 0.18,
    duration: 0.08,
  },
  commit: {
    wave: 'triangle',
    frequency: 190,
    envelope: { attack: 0.002, decay: 0.09, sustain: 0, release: 0.05 },
    gain: 0.35,
    duration: 0.07,
  },
  sign: {
    wave: 'sine',
    frequency: 988,
    envelope: { attack: 0.004, decay: 0.15, sustain: 0.2, release: 0.2 },
    gain: 0.18,
    duration: 0.12,
  },
} satisfies Record<string, Sound>;

export type SoundName = keyof typeof SOUNDS;

const BELL: Patch = {
  wave: 'triangle',
  envelope: { attack: 0.003, decay: 0.18, sustain: 0.2, release: 0.3 },
  gain: 0.26,
  duration: 0.08,
};

/** Near-miss chimes: the closer the shave, the longer the run of notes. */
export function playNearMiss(audio: AudioEngine, tier: 1 | 2 | 3, combo: number) {
  const lift = Math.min(combo - 1, 6) * 0.06;
  const notes =
    [
      [784, 1175],
      [784, 988, 1319],
      [784, 988, 1175, 1568],
    ][tier - 1] ?? [];
  notes.forEach((frequency, index) =>
    audio.play(BELL, { frequency: frequency * (1 + lift), delay: index * 0.055 }),
  );
}

/** The donkey's line: "hee" up high, "haw" down low, twice. */
export function playHeeHaw(audio: AudioEngine, pitch = 1, delay = 0) {
  const voice = (frequency: number, glide: number, length: number): Patch => ({
    wave: 'sawtooth',
    frequency: frequency * pitch,
    glideTo: glide,
    filter: { type: 'bandpass', frequency: 900 * pitch, q: 2.5 },
    envelope: { attack: 0.03, decay: 0.08, sustain: 0.7, release: 0.12 },
    gain: 0.22,
    duration: length,
  });
  for (let bray = 0; bray < 2; bray++) {
    const start = delay + bray * 0.6;
    audio.play(voice(720, 1.2, 0.2), { delay: start });
    audio.play(voice(300, 0.75, 0.3), { delay: start + 0.24 });
  }
}

const HORNS: Record<
  Exclude<HornSound, 'hee-haw'>,
  { patch: Patch; notes: number[]; gap: number }
> = {
  beep: {
    patch: {
      wave: 'square',
      filter: { type: 'lowpass', frequency: 1800 },
      gain: 0.16,
      duration: 0.12,
    },
    notes: [440, 440],
    gap: 0.16,
  },
  toot: {
    patch: { wave: 'triangle', gain: 0.35, duration: 0.2 },
    notes: [262, 330],
    gap: 0.24,
  },
  bell: {
    patch: {
      wave: 'sine',
      envelope: { attack: 0.002, decay: 0.3, sustain: 0.1, release: 0.4 },
      gain: 0.3,
      duration: 0.05,
    },
    notes: [2093, 2093],
    gap: 0.12,
  },
  air: {
    patch: {
      wave: 'sawtooth',
      filter: { type: 'lowpass', frequency: 1200 },
      gain: 0.14,
      duration: 0.6,
    },
    notes: [233, 294, 349],
    gap: 0,
  },
};

export function playHorn(audio: AudioEngine, horn: HornSound) {
  if (horn === 'hee-haw') {
    playHeeHaw(audio, 1.4);
    return;
  }
  const { patch, notes, gap } = HORNS[horn];
  notes.forEach((frequency, index) => audio.play(patch, { frequency, delay: index * gap }));
}

/** A little tune for a point, a finish or a new best, one note after another. */
export function playJingle(
  audio: AudioEngine,
  notes: readonly number[],
  step = 0.11,
  wave: OscillatorType = 'square',
) {
  const patch: Patch = {
    wave,
    filter: { type: 'lowpass', frequency: 2400 },
    envelope: { attack: 0.004, decay: 0.12, sustain: 0.4, release: 0.2 },
    gain: 0.16,
    duration: step * 0.8,
  };
  notes.forEach((frequency, index) => audio.play(patch, { frequency, delay: index * step }));
}

export const JINGLES = {
  driverPoint: [523, 659, 784, 1047],
  donkeyPoint: [392, 370, 349, 330],
  finish: [523, 659, 784, 1047, 784, 1047],
  best: [784, 988, 1175, 1568],
  gameOver: [440, 415, 392, 349],
} as const;
