import type { DailyLog } from '@shared/daily';
import type { HighScoreTable } from '@shared/storage';
import type { DuelState } from '../engine/duel';
import type { Difficulty } from '../engine/modes';
import { ROUTES, type RouteId } from '../engine/routes';
import { legStars, metresDriven, runScore, type RunState } from '../engine/run';
import {
  allRoutesFinished,
  allStars,
  isLegOpen,
  recordLeg,
  totalStars,
  type Progress,
} from '../progress';
import { DIFFICULTY_NAMES } from '../settings';
import type { ResultsContent } from '../ui/overlays';
import { shareText, type DailyResult } from './daily';
import type { PassReporter } from './pass-report';
import type { SessionOutcome } from './session';

export interface WrapUpContext {
  progress: Progress;
  pass: PassReporter;
  daily: DailyLog<DailyResult>;
  endlessBest: HighScoreTable;
  difficulty: Difficulty;
  cgaThroughout: boolean;
  /** Today's UTC day key. */
  today: string;
  resultOf(state: RunState): DailyResult;
  retry(): void;
  menu(): void;
  next(route: RouteId, leg: number): void;
  trip(): void;
}

const NAMES = ['Player 1', 'Player 2'] as const;

/**
 * Settles a finished run or match: keeps what should be kept (stars, bests,
 * the day's Daily Road result, Pass badges and XP) and says how it went.
 */
export function describeOutcome(outcome: SessionOutcome, context: WrapUpContext): ResultsContent {
  if (outcome.kind === 'duel') return duelResults(outcome.state, outcome.lastPoint, context);
  const { request, state } = outcome;
  if (request.kind === 'trip') return legResults(state, request.route, request.leg, context);
  if (request.kind === 'daily')
    return dailyResults(state, request.day.number, !request.practice, context);
  return endlessResults(state, context);
}

function runStats(state: RunState): ResultsContent['stats'] {
  const { stats } = state;
  const nearMisses = stats.nearMisses.reduce((sum, count) => sum + count, 0);
  return [
    { label: 'Distance', value: `${metresDriven(state).toLocaleString('en')} m` },
    { label: 'Score', value: runScore(state).toLocaleString('en') },
    {
      label: 'Near misses',
      value: `${nearMisses} (${stats.nearMissPoints.toLocaleString('en')} pts)`,
    },
    { label: 'Best combo', value: stats.bestCombo > 0 ? `${stats.bestCombo} in a row` : '–' },
    { label: 'Carrots', value: String(stats.carrots) },
    { label: 'Crashes', value: String(stats.crashes) },
  ];
}

function endlessResults(state: RunState, context: WrapUpContext): ResultsContent {
  const score = runScore(state);
  const metres = metresDriven(state);
  const rank = context.endlessBest.submit('You', score);
  context.pass.finishRun({
    mode: 'endless',
    metres,
    crashes: state.stats.crashes,
    finished: false,
    livesLeft: state.lives,
    scored: false,
  });
  return {
    title: 'Out of lives',
    subtitle: `Endless · ${DIFFICULTY_NAMES[context.difficulty]}`,
    tone: rank === 1 ? 'good' : 'plain',
    stats: runStats(state),
    notes: rank === 1 ? ['A new best!'] : rank !== null ? [`Number ${rank} on your list`] : [],
    actions: [
      { label: 'Drive again', primary: true, run: context.retry },
      { label: 'Main menu', run: context.menu },
    ],
  };
}

function dailyResults(
  state: RunState,
  number: number,
  scored: boolean,
  context: WrapUpContext,
): ResultsContent {
  const result = context.resultOf(state);
  const counted = scored && context.daily.record(context.today, result);
  const streak = context.daily.streak(context.today);
  context.pass.finishRun({
    mode: 'daily',
    metres: result.metres,
    crashes: result.crashes,
    finished: result.finished,
    livesLeft: state.lives,
    scored: counted,
    dailyNumber: number,
    dailyStreak: streak.current,
  });
  const kept = context.daily.get(context.today);
  const day = { key: context.today, number, seed: 0 };
  return {
    title: result.finished ? `Daily Road #${number} · Finished!` : `Daily Road #${number}`,
    subtitle: counted
      ? 'This is today’s run. Practise as much as you like; it will not change.'
      : 'Practice run: today’s scored run stays as it was.',
    tone: result.finished ? 'good' : 'plain',
    stats: runStats(state),
    notes: streak.current > 1 ? [`${streak.current}-day streak (best ${streak.best})`] : [],
    share: kept ? shareText(day, kept) : undefined,
    actions: [
      { label: 'Practise', primary: true, run: context.retry },
      { label: 'Main menu', run: context.menu },
    ],
  };
}

function legResults(
  state: RunState,
  route: RouteId,
  leg: number,
  context: WrapUpContext,
): ResultsContent {
  const { progress } = context;
  const stars = legStars(state);
  const earned: [boolean, boolean, boolean] = [stars.finished, stars.clean, stars.target];
  const before = [0, 1, 2].map((index) => progress.legs[`${route}-${leg}`]?.stars[index] === true);
  const outcome = recordLeg(progress, route, leg, earned, runScore(state));
  context.pass.finishRun({
    mode: 'trip',
    metres: metresDriven(state),
    crashes: state.stats.crashes,
    finished: stars.finished,
    livesLeft: state.lives,
    scored: false,
    trip: {
      route,
      leg,
      stars: stars.count,
      newStars: outcome.newStars,
      firstFinish: outcome.firstFinish,
      routeClean: outcome.routeClean,
      allRoutes: allRoutesFinished(progress),
      allStars: allStars(progress),
      totalStars: totalStars(progress),
    },
  });
  const info = ROUTES[route];
  const legInfo = info.legs[leg];
  const nextLeg = leg + 1;
  const canContinue = stars.finished && nextLeg < 3 && isLegOpen(progress, route, nextLeg);
  const notes = outcome.opened.map((id) => `${ROUTES[id].name} is open!`);
  if (outcome.bestScore && stars.finished) notes.unshift('A new best for this leg!');
  return {
    title: stars.finished ? `${legInfo?.name ?? info.name}: made it!` : 'Out of lives',
    subtitle: `${info.name} · leg ${leg + 1} of 3`,
    tone: stars.finished ? 'good' : 'bad',
    stars: {
      earned: [0, 1, 2].map((index) => earned[index] === true || before[index] === true),
      fresh: [0, 1, 2].map((index) => earned[index] === true && before[index] !== true),
      labels: [
        'Finish',
        'No crashes',
        `${legInfo?.nearMissTarget.toLocaleString('en')} near-miss points`,
      ],
    },
    stats: runStats(state),
    notes,
    actions: [
      canContinue
        ? { label: 'Next leg', primary: true, run: () => context.next(route, nextLeg) }
        : {
            label: stars.finished ? 'Drive it again' : 'Try again',
            primary: true,
            run: context.retry,
          },
      ...(canContinue ? [{ label: 'Drive it again', run: context.retry }] : []),
      { label: 'Routes', run: context.trip },
    ],
  };
}

function duelResults(
  state: DuelState,
  lastPoint: 'donkey' | 'driver' | null,
  context: WrapUpContext,
): ResultsContent {
  const { winner, config } = state;
  const wonAsDonkey = config.versus && lastPoint === 'donkey';
  context.pass.finishDuel({
    versus: config.versus,
    winner: winner ?? 'donkey',
    scores: state.scores,
    wonAsDonkey,
    cgaThroughout: context.cgaThroughout,
    donkeyStreak: context.progress.donkeyStreak,
  });
  const actions = [
    { label: 'Rematch', primary: true, run: context.retry },
    { label: 'Main menu', run: context.menu },
  ];
  if (config.versus) {
    const who = winner === 0 || winner === 1 ? NAMES[winner] : 'Nobody';
    return {
      title: `${who} wins!`,
      subtitle: wonAsDonkey
        ? 'The winning point was scored as the donkey. Hee-haw.'
        : 'The winning point was scored at the wheel.',
      tone: 'good',
      stats: [
        { label: NAMES[0], value: String(state.playerScores[0]) },
        { label: NAMES[1], value: String(state.playerScores[1]) },
      ],
      actions,
    };
  }
  const driverWon = winner === 'driver';
  return {
    title: driverWon ? 'Donkey loses!' : 'The Donkey wins',
    subtitle: driverWon
      ? 'You reached the top of the road first.'
      : 'It did not even look impressed.',
    tone: driverWon ? 'good' : 'bad',
    stats: [
      { label: 'Driver', value: String(state.scores.driver) },
      { label: 'Donkey', value: String(state.scores.donkey) },
    ],
    actions,
  };
}
