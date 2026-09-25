import { parsePattern } from './notes';
import type { Patch } from './synth';

/**
 * A song is a few tracks of step patterns played by synth patches. Shorter
 * tracks repeat to fill the longest one, so a two-bar drum loop can sit under
 * an eight-bar melody.
 */
export interface Song {
  bpm: number;
  /** Steps per beat; 4 makes every step a sixteenth note. */
  stepsPerBeat?: number;
  loop?: boolean;
  tracks: readonly Track[];
}

export interface Track {
  patch: Patch;
  /** See parsePattern: notes, "." rests and "-" holds, one token per step. */
  pattern: string;
  velocity?: number;
}

export interface ScheduledNote {
  step: number;
  frequency: number;
  holdSeconds: number;
  patch: Patch;
  velocity: number;
}

export interface CompiledSong {
  stepSeconds: number;
  lengthSteps: number;
  loop: boolean;
  /** Notes grouped by the step they start on. */
  notesByStep: Map<number, ScheduledNote[]>;
}

export function compileSong(song: Song): CompiledSong {
  const stepSeconds = 60 / song.bpm / (song.stepsPerBeat ?? 4);
  const parsed = song.tracks.map((track) => ({ track, ...parsePattern(track.pattern) }));
  const lengthSteps = Math.max(0, ...parsed.map((entry) => entry.steps));
  const notesByStep = new Map<number, ScheduledNote[]>();

  for (const { track, notes, steps } of parsed) {
    if (steps === 0) continue;
    for (let offset = 0; offset < lengthSteps; offset += steps) {
      for (const note of notes) {
        const step = offset + note.step;
        if (step >= lengthSteps) break;
        const scheduled: ScheduledNote = {
          step,
          frequency: note.frequency,
          holdSeconds: note.length * stepSeconds,
          patch: track.patch,
          velocity: track.velocity ?? 1,
        };
        notesByStep.set(step, [...(notesByStep.get(step) ?? []), scheduled]);
      }
    }
  }

  return { stepSeconds, lengthSteps, loop: song.loop ?? true, notesByStep };
}

export interface MusicClock {
  readonly currentTime: number;
}

export interface Sequencer {
  /** Schedules every note that starts before `horizon` (in context time). */
  scheduleUntil(horizon: number): void;
  readonly finished: boolean;
}

/**
 * Walks through a compiled song step by step, handing each note to `play`
 * slightly ahead of time so timers firing late never make the beat stumble.
 */
export function createSequencer(
  song: CompiledSong,
  startTime: number,
  play: (note: ScheduledNote, when: number) => void,
): Sequencer {
  let step = 0;
  let stepTime = startTime;
  let finished = song.lengthSteps === 0;

  return {
    scheduleUntil(horizon) {
      while (!finished && stepTime < horizon) {
        const songStep = step % song.lengthSteps;
        for (const note of song.notesByStep.get(songStep) ?? []) play(note, stepTime);
        step++;
        stepTime += song.stepSeconds;
        if (!song.loop && step >= song.lengthSteps) finished = true;
      }
    },
    get finished() {
      return finished;
    },
  };
}
