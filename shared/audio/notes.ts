const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequency of a note name such as "A4" (440 Hz), "C#5" or "Eb3". */
export function noteFrequency(name: string): number {
  const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`Cannot read note "${name}".`);
  const [, letter = 'A', accidental, octave = '4'] = match;
  const accidentalShift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  const semitone = (SEMITONES[letter.toUpperCase()] ?? 0) + accidentalShift;
  const midi = (Number(octave) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

export interface NoteEvent {
  /** Index of the step the note starts on. */
  step: number;
  frequency: number;
  /** How many steps the note is held. */
  length: number;
}

/**
 * Reads a one-line pattern where every token is one step:
 * a note ("C4", "F#3"), "." for a rest, or "-" to hold the previous note.
 *
 *   parsePattern('C4 - E4 . G4 - - -')
 */
export function parsePattern(pattern: string): { notes: NoteEvent[]; steps: number } {
  const tokens = pattern.trim().split(/\s+/).filter(Boolean);
  const notes: NoteEvent[] = [];
  let current: NoteEvent | null = null;

  tokens.forEach((token, step) => {
    if (token === '-') {
      if (current) current.length++;
      return;
    }
    current = null;
    if (token === '.') return;
    current = { step, frequency: noteFrequency(token), length: 1 };
    notes.push(current);
  });

  return { notes, steps: tokens.length };
}
