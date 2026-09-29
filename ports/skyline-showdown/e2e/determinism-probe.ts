import { addDays } from '@shared/daily';
import { challengeStart, rebuildChallenge } from '../src/challenge/challenge';
import { decodeChallenge, encodeChallenge, type Challenge } from '../src/challenge/link';
import { DAILY, DAILY_LAUNCH, dailySkyline, startDaily } from '../src/daily/daily';
import { engineTrace, shotFingerprint } from '../src/engine/fingerprint';
import { previewTurn } from '../src/engine/match';
import { ENGINE_VERSION } from '../src/engine/version';
import { judgeThrow } from '../src/tricks/judge';
import { PUZZLES } from '../src/tricks/packs';
import { buildPuzzle } from '../src/tricks/puzzle';

/**
 * Everything that has to come out the same in every browser (ADR 0012),
 * one line per check: the engine's own trace, every Trick Shot reference
 * solution and its verdict, a year of Daily Skylines, and challenge links
 * of every kind decoded and replayed. The determinism test bundles this
 * file and compares its lines from each browser with Node's.
 */
export function determinismTrace(): string[] {
  return [...engineTrace(), ...puzzleTrace(), ...dailyTrace(), ...challengeTrace()];
}

function puzzleTrace(): string[] {
  return PUZZLES.map((puzzle) => {
    const built = buildPuzzle(puzzle);
    const shot = previewTurn(built.start(), { ...puzzle.solution, usePowerUp: true });
    const verdict = judgeThrow(built, shot);
    return `puzzle ${puzzle.id}: ${shotFingerprint(shot)} ${verdict.solved} ${verdict.styled}`;
  });
}

function dailyTrace(): string[] {
  return Array.from({ length: 366 }, (_, offset) => {
    const daily = dailySkyline(DAILY.forKey(addDays(DAILY_LAUNCH, offset)));
    const state = startDaily(daily);
    const shot = previewTurn(state, { angle: 45, velocity: 60 });
    return `daily ${daily.day.key}: ${daily.world} ${daily.twist} ${state.round.wind} ${shotFingerprint(shot)}`;
  });
}

const LINKS: Challenge['source'][] = [
  {
    kind: 'quick',
    roundSeed: 1990,
    round: 2,
    world: 'random',
    powerUps: ['golden', 'tri', 'bouncer'],
    firstTurn: 1,
    held: [null, 'tri'],
  },
  { kind: 'tour', stage: 4, roundSeed: 77, round: 1, firstTurn: 0 },
  { kind: 'tour', stage: 14, roundSeed: 4242, round: 3, firstTurn: 1 },
  { kind: 'trick', puzzle: 21 },
  { kind: 'daily', day: 12 },
];

function challengeTrace(): string[] {
  return LINKS.map((source, index) => {
    const shot = { angle: 38.5 + index, velocity: 64, usePowerUp: true };
    // A puzzle is one throw; a round can have throws before the one to match.
    const throws = source.kind === 'trick' ? [shot] : [{ angle: 170, velocity: 200 }, shot];
    const wind = challengeStart(source)?.state.round.wind ?? 0;
    const link = encodeChallenge({ version: ENGINE_VERSION, source, wind, throws, nickname: null });
    const decoded = decodeChallenge(link);
    const rebuilt = typeof decoded === 'string' ? decoded : rebuildChallenge(decoded);
    if (typeof rebuilt === 'string') return `challenge ${source.kind}: ${rebuilt}`;
    return `challenge ${source.kind}: ${shotFingerprint(rebuilt.theirs.record)} ${rebuilt.theirs.hit}`;
  });
}
