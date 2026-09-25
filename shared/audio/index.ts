import { createStore, type Store } from '../storage';
import { compileSong, createSequencer, type Sequencer, type Song } from './music';
import { createNoiseBuffer, playPatch, type Patch, type Sound } from './synth';

export { compileSong, type Song, type Track } from './music';
export { noteFrequency, parsePattern } from './notes';
export { envelopePoints, type Envelope, type Patch, type Sound } from './synth';

/** The listener's mix. Shared by every NeoArcade game, so muting once mutes the arcade. */
export interface AudioMix {
  volume: number;
  muted: boolean;
  music: number;
  sfx: number;
}

export interface PlayOptions {
  /** Pitch in Hz, overriding the patch's own. */
  frequency?: number;
  /** Seconds from now. */
  delay?: number;
  /** 0..1, scales the patch gain. */
  velocity?: number;
}

export interface AudioEngine {
  /** Plays a sound effect. Silently skipped until the first user gesture unlocks audio. */
  play(sound: Sound, options?: PlayOptions): void;
  /** Starts a song, replacing any other; waits for the unlock if needed. */
  playMusic(song: Song): void;
  stopMusic(): void;
  readonly mix: Readonly<AudioMix>;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  toggleMute(): void;
  setMusicVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  /** Calls back whenever the mix changes, e.g. to keep a mute button in sync. */
  onChange(listener: (mix: Readonly<AudioMix>) => void): () => void;
  readonly unlocked: boolean;
  dispose(): void;
}

export interface AudioOptions {
  store?: Store;
  createContext?: () => AudioContext;
  /** Where the first click, tap or key press is listened for. */
  unlockTarget?: EventTarget;
}

const DEFAULT_MIX: AudioMix = { volume: 0.8, muted: false, music: 0.6, sfx: 1 };
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;
const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;

interface Graph {
  context: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
}

export function createAudio({
  store = createStore('audio'),
  createContext = () => new AudioContext(),
  unlockTarget = window,
}: AudioOptions = {}): AudioEngine {
  const mix: AudioMix = { ...DEFAULT_MIX, ...store.get<Partial<AudioMix>>('mix', {}) };
  const listeners = new Set<(mix: Readonly<AudioMix>) => void>();
  let graph: Graph | null = null;
  let pendingSong: Song | null = null;
  let musicBus: GainNode | null = null;
  let sequencer: Sequencer | null = null;
  let musicTimer: ReturnType<typeof setInterval> | null = null;

  const applyMix = () => {
    if (!graph) return;
    const now = graph.context.currentTime;
    // A short time constant avoids clicks when a slider is dragged.
    graph.master.gain.setTargetAtTime(mix.muted ? 0 : mix.volume, now, 0.02);
    graph.music.gain.setTargetAtTime(mix.music, now, 0.02);
    graph.sfx.gain.setTargetAtTime(mix.sfx, now, 0.02);
  };

  const changeMix = (change: Partial<AudioMix>) => {
    Object.assign(mix, change);
    mix.volume = clamp01(mix.volume);
    mix.music = clamp01(mix.music);
    mix.sfx = clamp01(mix.sfx);
    store.set('mix', mix);
    applyMix();
    for (const listener of listeners) listener(mix);
  };

  const buildGraph = (): Graph => {
    const context = createContext();
    const master = context.createGain();
    const music = context.createGain();
    const sfx = context.createGain();
    music.connect(master);
    sfx.connect(master);
    master.connect(context.destination);
    return { context, master, music, sfx, noise: createNoiseBuffer(context) };
  };

  const unlock = () => {
    for (const type of UNLOCK_EVENTS) unlockTarget.removeEventListener(type, unlock);
    graph ??= buildGraph();
    void graph.context.resume();
    applyMix();
    if (pendingSong) {
      const song = pendingSong;
      pendingSong = null;
      startMusic(song);
    }
  };

  // Browsers pause audio for background tabs anyway; suspending saves battery.
  const onVisibilityChange = () => {
    if (!graph) return;
    if (document.hidden) void graph.context.suspend();
    else void graph.context.resume();
  };

  const stopMusic = () => {
    if (musicTimer !== null) clearInterval(musicTimer);
    musicTimer = null;
    sequencer = null;
    pendingSong = null;
    if (graph && musicBus) {
      const fading = musicBus;
      fading.gain.setTargetAtTime(0, graph.context.currentTime, 0.1);
      setTimeout(() => fading.disconnect(), 600);
    }
    musicBus = null;
  };

  const startMusic = (song: Song) => {
    if (!graph) return;
    const { context, music, noise } = graph;
    // Each song gets its own bus, so the old one can fade while the new one starts.
    const bus = context.createGain();
    bus.connect(music);
    musicBus = bus;
    const compiled = compileSong(song);
    sequencer = createSequencer(compiled, context.currentTime + 0.05, (note, when) =>
      playPatch(context, bus, note.patch, noise, {
        when,
        frequency: note.frequency,
        hold: note.holdSeconds,
        velocity: note.velocity,
      }),
    );
    const tick = () => {
      sequencer?.scheduleUntil(context.currentTime + LOOKAHEAD_SECONDS);
      if (sequencer?.finished && musicTimer !== null) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    };
    tick();
    musicTimer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  };

  for (const type of UNLOCK_EVENTS) unlockTarget.addEventListener(type, unlock);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    play(sound, { frequency, delay = 0, velocity } = {}) {
      if (!graph) return;
      const { context, sfx, noise } = graph;
      const when = context.currentTime + delay;
      for (const patch of layersOf(sound)) {
        playPatch(context, sfx, patch, noise, {
          when,
          frequency: frequency ?? patch.frequency,
          velocity,
        });
      }
    },
    playMusic(song) {
      stopMusic();
      if (graph) startMusic(song);
      else pendingSong = song;
    },
    stopMusic,
    mix,
    setVolume: (volume) => changeMix({ volume }),
    setMuted: (muted) => changeMix({ muted }),
    toggleMute: () => changeMix({ muted: !mix.muted }),
    setMusicVolume: (music) => changeMix({ music }),
    setSfxVolume: (sfx) => changeMix({ sfx }),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get unlocked() {
      return graph !== null;
    },
    dispose() {
      stopMusic();
      for (const type of UNLOCK_EVENTS) unlockTarget.removeEventListener(type, unlock);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      void graph?.context.close();
      graph = null;
      listeners.clear();
    },
  };
}

function layersOf(sound: Sound): readonly Patch[] {
  return Array.isArray(sound) ? (sound as readonly Patch[]) : [sound as Patch];
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
