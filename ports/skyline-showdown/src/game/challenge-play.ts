import {
  judgeChallenge,
  shotOutcome,
  type RebuiltChallenge,
  type ShotOutcome,
} from '../challenge/challenge';
import type { Challenge } from '../challenge/link';
import { otherPlayer } from '../engine/gorillas';
import type { TurnAim } from '../engine/match';
import { ENGINE_VERSION } from '../engine/version';
import { lookFor, PLAYER_ACCENTS, type GorillaLook } from '../render/gorilla';
import { classicKit, KITS } from '../render/kits';
import type { SceneLook } from '../render/scene';
import { marksFor } from '../render/targets';
import { RIVALS } from '../tour/rivals';
import { STAGES } from '../tour/stages';
import { ruleText } from '../tricks/describe';
import { PUZZLES } from '../tricks/packs';
import { PAD_RADIUS_METRES } from '../tricks/puzzle';
import type { ChallengeResult } from '../ui/challenge-screens';
import { DEFAULT_OUTFITS } from '../wardrobe/items';
import { reportChallenge } from './pass-reporter';
import { sessionParts, type PlayContext } from './play-context';
import { ShotSession } from './shot-session';
import { METRES_PER_UNIT } from './so-close';

/** The challenger's gorilla, while their shot plays: a friend's colour, not yours. */
const FRIEND_ACCENT = '#b58cff';
const TARGET_ACCENT = '#ff5d5d';

/**
 * Playing a challenge link: the challenger's shot plays first from the
 * very moment they threw it, then you get your throw from the same moment,
 * as many tries as you like; the first win counts for the Arcade Pass.
 */
export class ChallengePlay {
  session: ShotSession | null = null;
  private challenge: RebuiltChallenge | null = null;
  private yours: TurnAim | null = null;
  private won = false;

  constructor(
    private readonly context: PlayContext,
    private readonly result: ChallengeResult,
  ) {}

  start(challenge: RebuiltChallenge): ShotSession {
    this.stop();
    this.challenge = challenge;
    this.won = false;
    const { context } = this;
    const { thrower, puzzle, state } = challenge;
    const theirShot = challenge.challenge.nickname
      ? `${challenge.challenge.nickname}’s shot`
      : 'Their shot';
    // A puzzle without a dummy has no gorilla to aim at; every other challenge does.
    const gorillaTarget = !puzzle || puzzle.targets.some((target) => target.kind === 'dummy');
    this.session = new ShotSession({
      ...sessionParts(context),
      state,
      thrower,
      look: { ...this.scenery(challenge), theme: context.theme(), looks: this.looks(challenge) },
      names: thrower === 0 ? ['You', targetName(challenge)] : [targetName(challenge), 'You'],
      aiming: context.settings().aiming,
      banner: { title: theirShot, subtitle: whereText(challenge) },
      label: whereText(challenge),
      rule: puzzle?.puzzle.rule ? ruleText(puzzle.puzzle.rule) : null,
      marks: puzzle ? marksFor(puzzle.targets, PAD_RADIUS_METRES / METRES_PER_UNIT) : [],
      markedTarget: gorillaTarget ? otherPlayer(thrower) : null,
      watch: {
        record: challenge.theirs.record,
        look: lookFor(DEFAULT_OUTFITS[1], FRIEND_ACCENT),
        label: theirShot,
        banner: 'Match it or beat it',
      },
      onPause: () => context.pause(),
      onAttempt: (record, aim) => {
        this.yours = aim;
        this.showVerdict(challenge, shotOutcome(challenge, record, aim));
        return { kind: 'wait' };
      },
      onTurnStart: () => context.toasts.hold(),
      onRetry: () => this.result.hide(),
    });
    return this.session;
  }

  retry() {
    this.result.hide();
    this.session?.retry();
  }

  /** Your last throw, sent back as a challenge of its own from the same moment. */
  reply(): Challenge | null {
    if (!this.challenge || !this.yours) return null;
    const original = this.challenge.challenge;
    return {
      version: ENGINE_VERSION,
      source: original.source,
      wind: original.wind,
      throws: [...original.throws.slice(0, -1), this.yours],
      nickname: null,
    };
  }

  stop() {
    this.session?.dispose();
    this.session = null;
    this.result.hide();
  }

  private showVerdict(challenge: RebuiltChallenge, yours: ShotOutcome) {
    const verdict = judgeChallenge(challenge.theirs, yours);
    const firstWin = verdict.outcome !== 'lost' && !this.won;
    if (verdict.outcome !== 'lost') this.won = true;
    const xp = reportChallenge(this.context.pass, verdict, firstWin);
    this.result.show({
      outcome: verdict.outcome,
      copycat: verdict.copycat,
      from: challenge.challenge.nickname ? `${challenge.challenge.nickname}’s` : null,
      theirs: describeShot(challenge.theirs),
      yours: describeShot(yours),
      xp,
    });
    this.context.toasts.flush();
  }

  private looks(challenge: RebuiltChallenge): [GorillaLook, GorillaLook] {
    const you = lookFor(this.context.outfits()[0], PLAYER_ACCENTS[0]);
    const source = challenge.challenge.source;
    const stage = source.kind === 'tour' ? STAGES[source.stage] : undefined;
    const rival = stage ? RIVALS[stage.rival] : null;
    const target = rival
      ? lookFor(rival.outfit, rival.colour)
      : lookFor(this.context.outfits()[1], TARGET_ACCENT);
    return challenge.thrower === 0 ? [you, target] : [target, you];
  }

  private scenery(challenge: RebuiltChallenge): Pick<SceneLook, 'timeOfDay' | 'weather' | 'kit'> {
    const source = challenge.challenge.source;
    const world = challenge.state.round.world.id;
    if (source.kind === 'tour') {
      const stage = STAGES[source.stage];
      if (stage) {
        return {
          kit: KITS[stage.kit],
          timeOfDay: stage.timeOfDay,
          weather: { ...stage.weather, lightning: stage.weather.rain },
        };
      }
    }
    const puzzle = source.kind === 'trick' ? PUZZLES[source.puzzle] : undefined;
    return { kit: classicKit(world), timeOfDay: puzzle?.timeOfDay ?? 0, weather: false };
  }
}

/** Where a challenge was thrown, for its intro and the corner of the screen. */
export function whereText(challenge: RebuiltChallenge): string {
  const source = challenge.challenge.source;
  switch (source.kind) {
    case 'quick':
      return `Quick Match · ${challenge.state.round.world.name} · round ${source.round}`;
    case 'tour':
      return `World Tour · ${STAGES[source.stage]?.city ?? ''}`;
    case 'trick':
      return `Trick Shot · ${PUZZLES[source.puzzle]?.name ?? ''}`;
    case 'daily':
      return `Daily Skyline #${source.day} · ${challenge.state.round.world.name}`;
  }
}

function targetName(challenge: RebuiltChallenge): string {
  const source = challenge.challenge.source;
  if (source.kind === 'tour') {
    const stage = STAGES[source.stage];
    return stage ? RIVALS[stage.rival].name : 'Rival';
  }
  if (source.kind === 'trick') return 'Dummy';
  return source.kind === 'quick' ? 'Opponent' : 'Target';
}

function describeShot(shot: ShotOutcome): string {
  if (shot.hit) return 'a hit';
  const metres = Math.sqrt(shot.distanceSquared) * METRES_PER_UNIT;
  return `landed ${metres.toFixed(1)} m from the target`;
}
