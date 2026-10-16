import type { AudioEngine, Sound } from '@shared/audio';
import type { GameEvent } from '../engine/events';
import type { World } from '../engine/world';
import type { ThemeId } from '../themes';

/** Every sound effect, synthesized; nothing is sampled. */
export const SOUNDS = {
  gun: {
    wave: 'noise',
    filter: { type: 'bandpass', frequency: 1700, q: 1.2 },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
    gain: 0.22,
    duration: 0.03,
  },
  /** The Airshow's paint gun: a soft pop rather than a crack. */
  paint: {
    wave: 'sine',
    frequency: 520,
    glideTo: 0.55,
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    gain: 0.16,
    duration: 0.04,
  },
  targetGun: {
    wave: 'noise',
    filter: { type: 'bandpass', frequency: 900, q: 1.6 },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.04 },
    gain: 0.14,
    duration: 0.05,
  },
  /** The falling whistle of a bomb on its way down. */
  whistle: {
    wave: 'sine',
    frequency: 1250,
    glideTo: 0.42,
    envelope: { attack: 0.08, decay: 0.2, sustain: 0.7, release: 0.2 },
    gain: 0.09,
    duration: 1.5,
  },
  boom: [
    {
      wave: 'noise',
      filter: { type: 'lowpass', frequency: 900, q: 0.7, sweepTo: 0.12 },
      envelope: { attack: 0.003, decay: 0.45, sustain: 0.15, release: 0.4 },
      gain: 0.55,
      duration: 0.35,
    },
    {
      wave: 'sine',
      frequency: 90,
      glideTo: 0.4,
      envelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.2 },
      gain: 0.5,
      duration: 0.25,
    },
  ],
  /** The Airshow's explosions: a balloon's pop and a fizz of confetti. */
  pop: [
    {
      wave: 'sine',
      frequency: 340,
      glideTo: 0.25,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
      gain: 0.4,
      duration: 0.06,
    },
    {
      wave: 'noise',
      filter: { type: 'highpass', frequency: 4000, q: 0.6 },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.3 },
      gain: 0.12,
      duration: 0.3,
    },
  ],
  thud: {
    wave: 'sine',
    frequency: 110,
    glideTo: 0.5,
    envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.08 },
    gain: 0.35,
    duration: 0.1,
  },
  /** Hit: a two-tone warble, as the 1984 speaker did it. */
  hit: [
    {
      wave: 'square',
      frequency: 660,
      filter: { type: 'lowpass', frequency: 2200 },
      envelope: { attack: 0.002, decay: 0.08, sustain: 0.4, release: 0.05 },
      gain: 0.12,
      duration: 0.09,
    },
    {
      wave: 'square',
      frequency: 440,
      filter: { type: 'lowpass', frequency: 2200 },
      envelope: { attack: 0.1, decay: 0.08, sustain: 0.4, release: 0.05 },
      gain: 0.12,
      duration: 0.2,
    },
  ],
  /** The stall: a wail sliding down. */
  stall: {
    wave: 'triangle',
    frequency: 880,
    glideTo: 0.33,
    filter: { type: 'lowpass', frequency: 2400 },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.4 },
    gain: 0.2,
    duration: 1.1,
  },
  splat: {
    wave: 'noise',
    filter: { type: 'lowpass', frequency: 600, q: 4, sweepTo: 0.3 },
    envelope: { attack: 0.002, decay: 0.12, sustain: 0.1, release: 0.1 },
    gain: 0.6,
    duration: 0.1,
  },
  squawk: {
    wave: 'square',
    frequency: 1900,
    glideTo: 0.5,
    filter: { type: 'bandpass', frequency: 1500, q: 2 },
    envelope: { attack: 0.002, decay: 0.06, sustain: 0.3, release: 0.05 },
    gain: 0.12,
    duration: 0.09,
  },
  /** The ox, unimpressed. The sound every player learns to fear. */
  moo: [
    {
      wave: 'sawtooth',
      frequency: 128,
      glideTo: 0.82,
      filter: { type: 'bandpass', frequency: 420, q: 3, sweepTo: 2.1 },
      envelope: { attack: 0.18, decay: 0.3, sustain: 0.8, release: 0.45 },
      gain: 0.5,
      duration: 0.95,
    },
    {
      wave: 'sawtooth',
      frequency: 64,
      glideTo: 0.85,
      filter: { type: 'lowpass', frequency: 300 },
      envelope: { attack: 0.2, decay: 0.3, sustain: 0.7, release: 0.4 },
      gain: 0.3,
      duration: 0.9,
    },
  ],
  landed: {
    wave: 'noise',
    filter: { type: 'lowpass', frequency: 300, q: 0.6 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.2 },
    gain: 0.25,
    duration: 0.25,
  },
  refuelled: [
    {
      wave: 'triangle',
      frequency: 660,
      envelope: { attack: 0.005, decay: 0.08, sustain: 0.3, release: 0.1 },
      gain: 0.1,
      duration: 0.08,
    },
    {
      wave: 'triangle',
      frequency: 990,
      envelope: { attack: 0.1, decay: 0.08, sustain: 0.3, release: 0.15 },
      gain: 0.1,
      duration: 0.2,
    },
  ],
  /** Water thrown up: a bomb in the sea, a plane ditching, a torpedo going in. */
  splash: {
    wave: 'noise',
    filter: { type: 'lowpass', frequency: 1800, q: 0.8, sweepTo: 0.2 },
    envelope: { attack: 0.004, decay: 0.5, sustain: 0.2, release: 0.5 },
    gain: 0.4,
    duration: 0.55,
  },
  /** A ship's horn: two low notes together, long and mournful. */
  horn: [
    {
      wave: 'sawtooth',
      frequency: 110,
      filter: { type: 'lowpass', frequency: 520 },
      envelope: { attack: 0.12, decay: 0.2, sustain: 0.8, release: 0.5 },
      gain: 0.18,
      duration: 1.1,
    },
    {
      wave: 'sawtooth',
      frequency: 165,
      filter: { type: 'lowpass', frequency: 600 },
      envelope: { attack: 0.14, decay: 0.2, sustain: 0.7, release: 0.5 },
      gain: 0.12,
      duration: 1.1,
    },
  ],
  /** The deck crew's whistle as a plane is waved off down the deck. */
  deckWhistle: [
    {
      wave: 'sine',
      frequency: 2700,
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.05 },
      gain: 0.09,
      duration: 0.16,
    },
    {
      wave: 'sine',
      frequency: 2900,
      envelope: { attack: 0.2, decay: 0.05, sustain: 0.8, release: 0.08 },
      gain: 0.09,
      duration: 0.42,
    },
  ],
  /** The hook takes a wire: a steel twang, and the thump of the plane brought up short. */
  wire: [
    {
      wave: 'square',
      frequency: 240,
      glideTo: 0.5,
      filter: { type: 'bandpass', frequency: 900, q: 6 },
      envelope: { attack: 0.002, decay: 0.25, sustain: 0.1, release: 0.2 },
      gain: 0.16,
      duration: 0.32,
    },
    {
      wave: 'sine',
      frequency: 80,
      glideTo: 0.6,
      envelope: { attack: 0.002, decay: 0.15, sustain: 0, release: 0.1 },
      gain: 0.35,
      duration: 0.14,
    },
  ],
  /** An anti-aircraft shell bursting: a flat, dull crack in the sky. */
  flak: [
    {
      wave: 'noise',
      filter: { type: 'bandpass', frequency: 520, q: 1.1 },
      envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.12 },
      gain: 0.22,
      duration: 0.14,
    },
    {
      wave: 'sine',
      frequency: 70,
      glideTo: 0.6,
      envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
      gain: 0.18,
      duration: 0.1,
    },
  ],
  /** A ship going down: its hull groaning, low and slow. */
  groan: {
    wave: 'sawtooth',
    frequency: 72,
    glideTo: 0.48,
    filter: { type: 'lowpass', frequency: 260, q: 4, sweepTo: 0.5 },
    envelope: { attack: 0.4, decay: 0.6, sustain: 0.7, release: 0.9 },
    gain: 0.4,
    duration: 2.6,
  },
} as const satisfies Record<string, Sound>;

export type SoundId = keyof typeof SOUNDS;

/** Sounds fade with distance from the listener's plane; this far away they are gone. */
const HEARING = 420;

/**
 * Plays the tick's events. Sounds come from where they happen, quieter the
 * further they are from `listenerX`; the player's own plane is always loud.
 */
export function playEvents(
  audio: AudioEngine,
  events: readonly GameEvent[],
  world: World,
  listeners: ReadonlySet<number>,
  listenerX: number,
  theme: ThemeId,
) {
  const near = (x: number) => Math.max(0, 1 - Math.abs(x - listenerX) / HEARING);
  const play = (sound: Sound, x: number, loudness = 1) => {
    const velocity = near(x) * loudness;
    if (velocity > 0.04) audio.play(sound, { velocity });
  };
  const festive = theme === 'airshow';
  for (const event of events) {
    switch (event.type) {
      case 'gun':
        play(festive ? SOUNDS.paint : SOUNDS.gun, event.x, listeners.has(event.plane) ? 1 : 0.6);
        break;
      case 'target-gun':
        play(SOUNDS.targetGun, event.x);
        break;
      case 'bomb-away':
        play(SOUNDS.whistle, event.x);
        break;
      case 'explosion':
        play(
          festive ? SOUNDS.pop : SOUNDS.boom,
          event.x,
          event.size === 'huge' ? 1 : event.size === 'large' ? 0.8 : 0.6,
        );
        break;
      case 'plane-wounded':
        if (listeners.has(event.plane)) audio.play(SOUNDS.hit);
        break;
      case 'stall':
        if (listeners.has(event.plane)) audio.play(SOUNDS.stall);
        break;
      case 'splat':
        if (listeners.has(event.plane))
          audio.play(event.kind === 'hole' ? SOUNDS.hit : SOUNDS.splat);
        break;
      case 'bird-hit':
        play(SOUNDS.squawk, event.x);
        break;
      case 'ox-hit':
      case 'ox-startled':
        play(SOUNDS.moo, world.oxen.find((ox) => ox.id === event.ox)?.x ?? listenerX, 1.2);
        break;
      case 'landed':
        if (listeners.has(event.plane)) audio.play(SOUNDS.landed);
        break;
      case 'refuelled':
        if (listeners.has(event.plane)) audio.play(SOUNDS.refuelled);
        break;
      case 'target-hit':
        play(SOUNDS.thud, event.x, 0.5);
        break;
      case 'splash':
        play(SOUNDS.splash, event.x, event.size === 'large' ? 1 : 0.55);
        break;
      case 'ditched':
        play(SOUNDS.splash, event.x, 1);
        break;
      case 'flak-burst':
        play(SOUNDS.flak, event.x, 0.7);
        break;
      case 'trap':
        if (listeners.has(event.plane)) audio.play(SOUNDS.wire);
        break;
      case 'touch-and-go':
        if (listeners.has(event.plane)) audio.play(SOUNDS.landed);
        break;
      case 'takeoff': {
        const plane = world.planes.find((candidate) => candidate.id === event.plane);
        if (plane?.base.carrier !== undefined && listeners.has(event.plane))
          audio.play(SOUNDS.deckWhistle);
        break;
      }
      case 'ship-turn': {
        const ship = world.ships.find((candidate) => candidate.id === event.ship);
        if (ship) play(SOUNDS.horn, ship.x, ship.kind === 'carrier' ? 0.9 : 0.5);
        break;
      }
      case 'ship-sinking':
        play(SOUNDS.groan, event.x, 1.2);
        break;
      default:
        break;
    }
  }
}
