import type { Patch, Song } from '@shared/audio';

/**
 * The title theme: a short, jaunty music-hall march in G, the sort of tune
 * a pilot might whistle walking out to the flight line. Eight bars of an
 * oompah bass, a brass-ish lead and a snare that rattles on the way back
 * round. It plays once on the title and on the results, then leaves the
 * stage to the engine.
 */
const LEAD: Patch = {
  wave: 'square',
  filter: { type: 'lowpass', frequency: 2200, q: 1.2 },
  envelope: { attack: 0.01, decay: 0.12, sustain: 0.55, release: 0.12 },
  gain: 0.08,
};

const BASS: Patch = {
  wave: 'triangle',
  envelope: { attack: 0.005, decay: 0.12, sustain: 0.4, release: 0.08 },
  gain: 0.22,
};

const CHORD: Patch = {
  wave: 'sawtooth',
  filter: { type: 'lowpass', frequency: 1200, q: 0.6 },
  envelope: { attack: 0.005, decay: 0.08, sustain: 0.25, release: 0.06 },
  gain: 0.04,
};

const SNARE: Patch = {
  wave: 'noise',
  filter: { type: 'bandpass', frequency: 2200, q: 0.8 },
  envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05 },
  gain: 0.12,
  duration: 0.05,
};

export const TITLE_THEME: Song = {
  bpm: 132,
  stepsPerBeat: 2,
  loop: false,
  tracks: [
    {
      patch: LEAD,
      pattern:
        'D5 - B4 G4 A4 B4 C5 D5 E5 - D5 B4 A4 - . . ' +
        'C5 - A4 F#4 G4 A4 B4 C5 D5 - C5 A4 G4 - . . ' +
        'D5 - B4 G4 A4 B4 C5 D5 E5 - G5 E5 D5 - B4 - ' +
        'C5 - A4 F#4 A4 - D5 - G4 - - - . . . .',
    },
    {
      patch: BASS,
      pattern:
        'G2 . D3 . G2 . D3 . C3 . G2 . D3 . A2 . ' +
        'D3 . A2 . D3 . A2 . D3 . A2 . G2 . D3 . ' +
        'G2 . D3 . G2 . D3 . C3 . G2 . G2 . B2 . ' +
        'D3 . A2 . D3 . F#2 . G2 . D3 . G2 . . .',
    },
    {
      patch: CHORD,
      pattern:
        '. B3 . B3 . B3 . B3 . C4 . C4 . A3 . A3 ' +
        '. A3 . A3 . A3 . A3 . C4 . C4 . B3 . B3 ' +
        '. B3 . B3 . B3 . B3 . C4 . C4 . B3 . B3 ' +
        '. A3 . A3 . C4 . C4 . B3 . . . . . . .',
    },
    {
      patch: SNARE,
      pattern:
        '. . C4 . . . C4 . . . C4 . . . C4 C4 ' +
        '. . C4 . . . C4 . . . C4 . . . C4 C4 ' +
        '. . C4 . . . C4 . . . C4 . . . C4 C4 ' +
        '. . C4 . . . C4 . C4 C4 C4 C4 . . . .',
    },
  ],
};
