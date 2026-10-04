import type { Patch, Song, Sound } from '@shared/audio';
import type { EventArt } from '../game/event-copy';

/**
 * Every sound in Long Haul, synthesized: no recordings. The road is a low
 * hum of saw waves, the CB a burst of filtered noise, a blowout a bang and
 * a falling hiss, the original's alarm clock a square-wave bell.
 */
export type SoundName =
  | `card:${EventArt}`
  | 'quick'
  | 'cb'
  | 'stop-offer'
  | 'passed'
  | 'horn'
  | 'detector'
  | 'pump'
  | 'register'
  | 'coffee'
  | 'door'
  | 'alarm'
  | 'stamp'
  | 'menu'
  | 'postcard';

const noise = (
  frequency: number,
  duration: number,
  gain: number,
  type: BiquadFilterType = 'bandpass',
  sweepTo?: number,
): Patch => ({
  wave: 'noise',
  duration,
  gain,
  filter: { type, frequency, q: 1.2, sweepTo },
  envelope: { attack: 0.005, decay: duration * 0.6, sustain: 0.3, release: duration * 0.5 },
});

const tone = (
  wave: OscillatorType,
  frequency: number,
  duration: number,
  gain: number,
  glideTo?: number,
): Patch => ({
  wave,
  frequency,
  duration,
  gain,
  glideTo,
  envelope: { attack: 0.005, decay: duration * 0.5, sustain: 0.5, release: 0.08 },
});

const SIREN: Sound = [
  tone('sawtooth', 620, 0.32, 0.12, 1.45),
  { ...tone('sawtooth', 900, 0.32, 0.12, 0.69), filter: { type: 'lowpass', frequency: 2400 } },
];
const AIR_BRAKE: Sound = noise(3200, 0.45, 0.22, 'highpass', 0.6);
const HORN: Sound = [
  { ...tone('sawtooth', 185, 0.7, 0.16), filter: { type: 'lowpass', frequency: 1200 } },
  { ...tone('sawtooth', 233, 0.7, 0.14), filter: { type: 'lowpass', frequency: 1200 } },
];

const CARD_SOUNDS: Readonly<Record<EventArt, Sound>> = {
  police: SIREN,
  radar: [tone('square', 1320, 0.08, 0.06), { ...tone('square', 1320, 0.08, 0.06) }],
  scale: [AIR_BRAKE, tone('triangle', 330, 0.25, 0.1)],
  construction: [tone('square', 440, 0.12, 0.08), { ...tone('square', 440, 0.12, 0.08) }],
  toll: [tone('triangle', 988, 0.12, 0.1), tone('triangle', 1319, 0.3, 0.08)],
  slide: [noise(180, 1.2, 0.35, 'lowpass', 0.4), tone('sine', 60, 1, 0.25, 0.5)],
  reefer: [tone('sawtooth', 110, 0.6, 0.1, 0.5), noise(800, 0.4, 0.1)],
  blowout: [
    noise(1200, 0.08, 0.6, 'lowpass'),
    noise(2600, 1.1, 0.25, 'highpass', 0.3),
    tone('sine', 90, 0.3, 0.3, 0.4),
  ],
  tow: [HORN, AIR_BRAKE].flat(),
  dry: [tone('sawtooth', 70, 1.2, 0.18, 0.4), noise(300, 0.8, 0.08, 'lowpass')],
  detour: [tone('triangle', 523, 0.15, 0.08), tone('triangle', 392, 0.3, 0.08)],
  crash: [
    noise(400, 1.6, 0.5, 'lowpass', 0.3),
    noise(3000, 0.6, 0.3, 'highpass'),
    tone('sine', 50, 1.2, 0.35, 0.5),
  ],
  jail: SIREN,
  'time-zone': [tone('sine', 880, 0.18, 0.06), tone('sine', 660, 0.25, 0.06)],
  arrival: [HORN, AIR_BRAKE].flat(),
  warehouse: [tone('triangle', 392, 0.2, 0.08), tone('triangle', 330, 0.3, 0.08)],
};

export const SOUNDS: Readonly<Record<Exclude<SoundName, `card:${EventArt}`>, Sound>> = {
  quick: tone('triangle', 660, 0.12, 0.07),
  cb: [noise(1800, 0.18, 0.12, 'bandpass'), tone('square', 1046, 0.05, 0.03)],
  'stop-offer': [tone('triangle', 784, 0.12, 0.08), tone('triangle', 1046, 0.2, 0.07)],
  passed: tone('sine', 1175, 0.18, 0.05),
  horn: HORN,
  detector: [tone('square', 2093, 0.06, 0.05), tone('square', 2637, 0.06, 0.05)],
  pump: [noise(500, 0.9, 0.12, 'lowpass'), tone('square', 1568, 0.05, 0.04)],
  register: [tone('square', 2349, 0.06, 0.06), tone('triangle', 1760, 0.4, 0.06)],
  coffee: noise(900, 0.6, 0.08, 'bandpass', 1.6),
  door: [tone('triangle', 1319, 0.15, 0.06), tone('triangle', 1047, 0.3, 0.05)],
  alarm: [
    tone('square', 1760, 0.09, 0.07),
    tone('square', 1760, 0.09, 0.07),
    tone('square', 1760, 0.09, 0.07),
  ],
  stamp: [noise(220, 0.12, 0.4, 'lowpass'), tone('sine', 110, 0.12, 0.2, 0.6)],
  menu: tone('triangle', 880, 0.06, 0.05),
  postcard: [tone('sine', 1319, 0.12, 0.06), tone('sine', 1760, 0.2, 0.05)],
};

/** Sounds layered with a short delay between them: [patch, seconds]. */
const SEQUENCES: Partial<Record<SoundName, readonly number[]>> = {
  alarm: [0, 0.14, 0.28],
  'card:radar': [0, 0.12],
  'card:construction': [0, 0.3],
  'card:toll': [0, 0.12],
  'card:time-zone': [0, 0.16],
  'card:detour': [0, 0.18],
  'card:warehouse': [0, 0.22],
  'stop-offer': [0, 0.12],
  detector: [0, 0.09],
  door: [0, 0.14],
  postcard: [0, 0.1],
};

export interface Played {
  sound: Sound;
  delay: number;
}

/** What to play for a name: one sound, or a few one after another. */
export function soundFor(name: SoundName): Played[] {
  const sound: Sound = name.startsWith('card:')
    ? CARD_SOUNDS[name.slice(5) as EventArt]
    : SOUNDS[name as keyof typeof SOUNDS];
  const delays = SEQUENCES[name];
  if (delays && Array.isArray(sound)) {
    return (sound as readonly Patch[]).map((patch, index) => ({
      sound: patch,
      delay: delays[index] ?? 0,
    }));
  }
  return [{ sound, delay: 0 }];
}

/** The title tune: a loping two-step on the open road. */
export const TITLE_SONG: Song = {
  bpm: 112,
  stepsPerBeat: 2,
  loop: true,
  tracks: [
    {
      patch: {
        wave: 'triangle',
        gain: 0.16,
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.15 },
      },
      pattern:
        'G4 - B4 D5 E5 - D5 B4 A4 - G4 E4 G4 - - . ' +
        'G4 - B4 D5 E5 - G5 E5 D5 - B4 A4 B4 - - . ' +
        'C5 - E5 G5 A5 - G5 E5 D5 - B4 G4 A4 - - . ' +
        'G4 - B4 D5 E5 - D5 B4 A4 - B4 A4 G4 - - .',
    },
    {
      patch: {
        wave: 'sawtooth',
        gain: 0.09,
        filter: { type: 'lowpass', frequency: 700 },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.1 },
      },
      pattern:
        'G2 . D3 . G2 . D3 . C3 . G2 . D3 . A2 . ' +
        'G2 . D3 . G2 . D3 . C3 . G2 . D3 . D3 . ' +
        'C3 . G2 . C3 . G2 . D3 . A2 . D3 . A2 . ' +
        'G2 . D3 . G2 . D3 . C3 . D3 . G2 . G2 .',
    },
    {
      patch: {
        wave: 'noise',
        gain: 0.05,
        filter: { type: 'highpass', frequency: 6000 },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
      },
      pattern: '. C4 . C4 . C4 . C4',
    },
  ],
};

/** On the road: just the rhythm section, quiet under the CB. */
export const ROAD_SONG: Song = {
  bpm: 96,
  stepsPerBeat: 2,
  loop: true,
  tracks: [
    {
      patch: {
        wave: 'sawtooth',
        gain: 0.07,
        filter: { type: 'lowpass', frequency: 500 },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.2, release: 0.1 },
      },
      pattern: 'E2 . B2 . E2 . B2 . A2 . E2 . B2 . B2 .',
    },
    {
      patch: {
        wave: 'noise',
        gain: 0.035,
        filter: { type: 'highpass', frequency: 7000 },
        envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
      },
      pattern: '. C4 . C4',
    },
    {
      patch: {
        wave: 'triangle',
        gain: 0.07,
        envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.3 },
      },
      pattern:
        'B3 - - - G#3 - - - A3 - - - B3 - - - ' +
        'E4 - - - D#4 - - - B3 - - - . . . . ' +
        'A3 - - - B3 - - - C#4 - - - B3 - - - ' +
        'G#3 - - - F#3 - - - E3 - - - . . . .',
    },
  ],
};
