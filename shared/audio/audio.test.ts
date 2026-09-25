import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../storage';
import { compileSong, createSequencer } from './music';
import { noteFrequency, parsePattern } from './notes';
import { envelopePoints, resolveEnvelope } from './synth';
import { createAudio, type AudioEngine } from './index';

describe('noteFrequency', () => {
  it('tunes to A4 = 440 Hz', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440);
    expect(noteFrequency('A5')).toBeCloseTo(880);
    expect(noteFrequency('C4')).toBeCloseTo(261.63, 1);
  });

  it('handles sharps and flats', () => {
    expect(noteFrequency('C#4')).toBeCloseTo(noteFrequency('Db4'));
    expect(noteFrequency('Eb3')).toBeCloseTo(155.56, 1);
  });

  it('rejects anything that is not a note', () => {
    expect(() => noteFrequency('H2')).toThrow();
    expect(() => noteFrequency('C')).toThrow();
  });
});

describe('parsePattern', () => {
  it('reads notes, rests and holds', () => {
    const { notes, steps } = parsePattern('C4 - E4 . G4 - -');
    expect(steps).toBe(7);
    expect(notes.map(({ step, length }) => ({ step, length }))).toEqual([
      { step: 0, length: 2 },
      { step: 2, length: 1 },
      { step: 4, length: 3 },
    ]);
  });

  it('ignores a hold that follows a rest', () => {
    expect(parsePattern('. - A4').notes).toEqual([
      { step: 2, frequency: noteFrequency('A4'), length: 1 },
    ]);
  });
});

describe('envelopePoints', () => {
  it('rises, decays to sustain, holds and releases', () => {
    const envelope = resolveEnvelope({ attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 });
    const points = envelopePoints(envelope, 1, 1, 0.8);
    expect(points.map((point) => point.time)).toEqual([1, 1.1, expect.closeTo(1.3), 2, 2.3]);
    expect(points[1]?.value).toBeCloseTo(0.8);
    expect(points[2]?.value).toBeCloseTo(0.4);
    expect(points[4]?.value).toBeLessThan(0.001);
  });

  it('never releases before the decay finishes', () => {
    const envelope = resolveEnvelope({ attack: 0.1, decay: 0.2, release: 0.1 });
    const points = envelopePoints(envelope, 0, 0.05, 1);
    expect(points[3]?.time).toBeCloseTo(0.3);
  });

  it('keeps every level above zero for exponential ramps', () => {
    const points = envelopePoints(resolveEnvelope({ sustain: 0 }), 0, 0.5, 0);
    for (const point of points) expect(point.value).toBeGreaterThan(0);
  });
});

describe('compileSong', () => {
  const bass = { wave: 'triangle' as const };
  const lead = { wave: 'square' as const };

  it('turns tempo into step length', () => {
    expect(compileSong({ bpm: 120, tracks: [] }).stepSeconds).toBeCloseTo(0.125);
    expect(compileSong({ bpm: 120, stepsPerBeat: 2, tracks: [] }).stepSeconds).toBeCloseTo(0.25);
  });

  it('repeats shorter tracks to fill the longest', () => {
    const song = compileSong({
      bpm: 120,
      tracks: [
        { patch: lead, pattern: 'C5 . . . . . . .' },
        { patch: bass, pattern: 'C3 . E3 .' },
      ],
    });
    expect(song.lengthSteps).toBe(8);
    expect([...song.notesByStep.keys()].sort((a, b) => a - b)).toEqual([0, 2, 4, 6]);
    expect(song.notesByStep.get(0)).toHaveLength(2);
  });

  it('holds notes for the length of their dashes', () => {
    const song = compileSong({
      bpm: 60,
      stepsPerBeat: 1,
      tracks: [{ patch: lead, pattern: 'A4 - - .' }],
    });
    expect(song.notesByStep.get(0)?.[0]?.holdSeconds).toBeCloseTo(3);
  });
});

describe('createSequencer', () => {
  const song = compileSong({
    bpm: 60,
    stepsPerBeat: 1,
    tracks: [{ patch: { wave: 'sine' }, pattern: 'C4 D4' }],
  });

  it('schedules notes up to the horizon and loops', () => {
    const played: [number, number][] = [];
    const sequencer = createSequencer(song, 10, (note, when) => played.push([note.step, when]));
    sequencer.scheduleUntil(10.5);
    expect(played).toEqual([[0, 10]]);
    sequencer.scheduleUntil(13.5);
    expect(played).toEqual([
      [0, 10],
      [1, 11],
      [0, 12],
      [1, 13],
    ]);
    expect(sequencer.finished).toBe(false);
  });

  it('finishes songs that do not loop', () => {
    const once = { ...song, loop: false };
    const played: number[] = [];
    const sequencer = createSequencer(once, 0, (note) => played.push(note.step));
    sequencer.scheduleUntil(100);
    expect(played).toEqual([0, 1]);
    expect(sequencer.finished).toBe(true);
  });
});

/** Just enough of the Web Audio API to see what the engine builds. */
function fakeAudioContext() {
  const param = () => ({
    value: 1,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const created: string[] = [];
  const context = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'suspended',
    destination: node(),
    resume: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => {
      created.push('gain');
      return { ...node(), gain: param() };
    },
    createOscillator: () => {
      created.push('oscillator');
      return {
        ...node(),
        type: 'sine',
        frequency: param(),
        detune: param(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    },
    createBufferSource: () => {
      created.push('noise');
      return { ...node(), playbackRate: param(), start: vi.fn(), stop: vi.fn() };
    },
    createBiquadFilter: () => {
      created.push('filter');
      return { ...node(), type: 'lowpass', frequency: param(), Q: param() };
    },
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  };
  return { context, created };
}

describe('createAudio', () => {
  const setup = (store = createStore('audio', null)) => {
    const fake = fakeAudioContext();
    const target = new EventTarget();
    const audio: AudioEngine = createAudio({
      store,
      unlockTarget: target,
      createContext: () => fake.context as unknown as AudioContext,
    });
    const gesture = () => target.dispatchEvent(new Event('pointerdown'));
    return { audio, gesture, ...fake };
  };

  it('stays silent until the first gesture unlocks it', () => {
    const { audio, gesture, context, created } = setup();
    audio.play({ wave: 'square' });
    expect(audio.unlocked).toBe(false);
    expect(created).toEqual([]);

    gesture();
    expect(audio.unlocked).toBe(true);
    expect(context.resume).toHaveBeenCalled();

    audio.play({ wave: 'square', filter: { type: 'lowpass', frequency: 800 } });
    expect(created).toContain('oscillator');
    expect(created).toContain('filter');
    audio.dispose();
  });

  it('plays every layer of a layered sound', () => {
    const { audio, gesture, created } = setup();
    gesture();
    created.length = 0;
    audio.play([{ wave: 'noise' }, { wave: 'sine' }]);
    expect(created.filter((kind) => kind === 'noise' || kind === 'oscillator')).toHaveLength(2);
    audio.dispose();
  });

  it('remembers volume and mute across sessions', () => {
    const store = createStore('audio', null);
    const first = setup(store).audio;
    first.setVolume(0.3);
    first.toggleMute();
    first.dispose();

    const second = setup(store).audio;
    expect(second.mix).toMatchObject({ volume: 0.3, muted: true });
    second.dispose();
  });

  it('clamps levels and tells listeners about changes', () => {
    const { audio } = setup();
    const listener = vi.fn();
    const unsubscribe = audio.onChange(listener);
    audio.setMusicVolume(4);
    expect(audio.mix.music).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    audio.setSfxVolume(-1);
    expect(audio.mix.sfx).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    audio.dispose();
  });

  it('holds a song requested before the unlock and starts it afterwards', () => {
    vi.useFakeTimers();
    const { audio, gesture, created } = setup();
    audio.playMusic({ bpm: 120, tracks: [{ patch: { wave: 'triangle' }, pattern: 'C4 E4 G4' }] });
    expect(created).toEqual([]);
    gesture();
    expect(created).toContain('oscillator');
    audio.dispose();
    vi.useRealTimers();
  });
});
