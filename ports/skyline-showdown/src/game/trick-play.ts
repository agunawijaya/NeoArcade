import type { Challenge } from '../challenge/link';
import { otherPlayer, type PlayerIndex } from '../engine/gorillas';
import type { TurnAim } from '../engine/match';
import type { ShotRecord } from '../engine/shot';
import { ENGINE_VERSION } from '../engine/version';
import { lookFor, PLAYER_ACCENTS, type GorillaLook } from '../render/gorilla';
import { classicKit } from '../render/kits';
import { marksFor } from '../render/targets';
import { failureText, ruleText } from '../tricks/describe';
import { judgeThrow } from '../tricks/judge';
import { packOf, PUZZLES } from '../tricks/packs';
import {
  packUnlocked,
  puzzleStars,
  recordSolve,
  starsOf,
  type TrickSave,
} from '../tricks/progress';
import { buildPuzzle, PAD_RADIUS_METRES, type BuiltPuzzle, type Puzzle } from '../tricks/puzzle';
import type { SolveCard, TrickPanel } from '../ui/trick-panel';
import { reportSolve } from './pass-reporter';
import { sessionParts, type PlayContext } from './play-context';
import { ShotSession, type AttemptReaction } from './shot-session';
import { METRES_PER_UNIT } from './so-close';

/** The hint shows after this many misses on one visit. */
const HINT_AFTER = 4;
/** The dummy wears the second player's outfit, in a colour that says "aim here". */
const DUMMY_ACCENT = '#ff5d5d';

export interface TrickPlayHandlers {
  /** The save changed: store it. */
  saved(save: TrickSave): void;
  packs(): void;
  challenge(challenge: Challenge): void;
}

/**
 * Playing Trick Shot puzzles: each visit to a puzzle is a shot session,
 * every attempt is judged against the puzzle, a solve is folded into the
 * save and reported to the Arcade Pass, and the card after it leads on.
 */
export class TrickPlay {
  session: ShotSession | null = null;
  private puzzle: Puzzle | null = null;
  private lastSolve: TurnAim | null = null;

  constructor(
    private readonly context: PlayContext,
    private readonly panel: TrickPanel,
    private readonly card: SolveCard,
    private readonly handlers: TrickPlayHandlers,
    private save: () => TrickSave,
  ) {}

  get current(): Puzzle | null {
    return this.puzzle;
  }

  start(puzzle: Puzzle): ShotSession {
    this.stop();
    const { context } = this;
    const built = buildPuzzle(puzzle);
    const pack = packOf(puzzle);
    const dummy = built.targets.find((target) => target.kind === 'dummy');
    this.puzzle = puzzle;
    this.lastSolve = null;
    this.panel.show(puzzle, starsOf(puzzle, this.save().puzzles[puzzle.id]));
    this.session = new ShotSession({
      ...sessionParts(context),
      state: built.start(),
      thrower: built.thrower,
      look: {
        timeOfDay: puzzle.timeOfDay ?? 0,
        theme: context.theme(),
        weather: false,
        kit: classicKit(puzzle.world),
        looks: this.looks(built.thrower),
      },
      names: built.thrower === 0 ? ['You', 'Dummy'] : ['Dummy', 'You'],
      aiming: context.settings().aiming,
      banner: { title: puzzle.name, subtitle: puzzle.brief },
      label: `${pack.name} · ${pack.puzzles.indexOf(puzzle) + 1} of ${pack.puzzles.length}`,
      rule: puzzle.rule ? ruleText(puzzle.rule) : null,
      marks: marksFor(built.targets, PAD_RADIUS_METRES / METRES_PER_UNIT),
      markedTarget: dummy ? otherPlayer(built.thrower) : null,
      watch: null,
      onPause: () => context.pause(),
      onAttempt: (record, aim, attempt) => this.judge(built, record, aim, attempt),
      onTurnStart: () => context.toasts.hold(),
      onRetry: () => this.card.hide(),
    });
    return this.session;
  }

  retry() {
    this.card.hide();
    this.session?.retry();
  }

  /** The next puzzle after the current one, if it is open. */
  next(): Puzzle | null {
    if (!this.puzzle) return null;
    const following = PUZZLES[PUZZLES.indexOf(this.puzzle) + 1];
    return following && packUnlocked(this.save(), packOf(following)) ? following : null;
  }

  /** The last solve as a challenge link. */
  challenge(): Challenge | null {
    if (!this.puzzle || !this.lastSolve) return null;
    return {
      version: ENGINE_VERSION,
      source: { kind: 'trick', puzzle: PUZZLES.indexOf(this.puzzle) },
      wind: this.puzzle.wind,
      throws: [this.lastSolve],
      nickname: null,
    };
  }

  stop() {
    this.session?.dispose();
    this.session = null;
    this.panel.hide();
    this.card.hide();
  }

  private looks(thrower: PlayerIndex): [GorillaLook, GorillaLook] {
    const [yours, theirs] = this.context.outfits();
    const you = lookFor(yours, PLAYER_ACCENTS[0]);
    const dummy = lookFor(theirs, DUMMY_ACCENT);
    return thrower === 0 ? [you, dummy] : [dummy, you];
  }

  private judge(
    built: BuiltPuzzle,
    record: ShotRecord,
    aim: TurnAim,
    attempt: number,
  ): AttemptReaction {
    const puzzle = built.puzzle;
    const verdict = judgeThrow(built, record);
    this.panel.update(attempt, attempt >= HINT_AFTER && !verdict.solved ? puzzle.hint : null);
    if (!verdict.solved) {
      const failure = verdict.failure ?? 'missed';
      return {
        kind: 'retry',
        miss: {
          label: failure === 'missed' ? `${verdict.metres.toFixed(1)} m off` : 'Not quite',
          comment: failureText(failure),
          landing: verdict.landing,
        },
      };
    }
    this.lastSolve = aim;
    const recorded = recordSolve(this.save(), puzzle, {
      attempts: attempt,
      styled: verdict.styled,
    });
    this.handlers.saved(recorded.save);
    const xp = reportSolve(this.context.pass, puzzle, recorded);
    this.panel.show(puzzle, starsOf(puzzle, recorded.save.puzzles[puzzle.id]));
    this.card.show({
      puzzle,
      attempts: attempt,
      recorded,
      stars: puzzleStars(recorded.save, puzzle),
      xp,
      next: this.next(),
    });
    this.context.toasts.flush();
    return { kind: 'wait' };
  }
}
