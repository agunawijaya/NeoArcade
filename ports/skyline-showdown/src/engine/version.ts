/**
 * Which engine a challenge link was made with, and whether this one still
 * plays it the same way (ADR 0014). Two numbers:
 *
 * - ENGINE_VERSION goes up with every release that changes anything under
 *   src/engine, and every link carries it.
 * - The rules go up only when a change could make a banana fly differently
 *   or a seeded city come out differently. A link from an older engine
 *   version still plays if that version's rules are today's.
 *
 * RULES_FINGERPRINT pins the engine's fingerprint (fingerprint.ts), and a
 * test checks it. When a change moves the fingerprint, the rules changed:
 * add a version with a new rules number, then update the fingerprint.
 * Today's Daily Skyline changes too, so ship such changes between days.
 */
export const ENGINE_VERSION = 1;

/** The rules each engine version played by, oldest first: version v is entry v − 1. */
export const RULES_BY_VERSION: readonly number[] = [1];

export const RULES_FINGERPRINT = 'c5679af6';

export type Compatibility =
  /** Made by this very engine. */
  | 'current'
  /** An older engine with the same rules: it plays exactly as it did. */
  | 'sameRules'
  /** An older engine whose throws flew differently. */
  | 'olderRules'
  /** A newer engine than this page: a stale copy of the game, most likely. */
  | 'newer';

export function compatibilityOf(version: number): Compatibility {
  if (version === ENGINE_VERSION) return 'current';
  if (version > ENGINE_VERSION) return 'newer';
  return rulesOf(version) === rulesOf(ENGINE_VERSION) ? 'sameRules' : 'olderRules';
}

function rulesOf(version: number): number | undefined {
  return RULES_BY_VERSION[version - 1];
}
