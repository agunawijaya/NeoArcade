import type { ResultLine, ResultsContent } from '../ui/overlays';
import { capitalised, THEMES, type ThemeId } from '../themes';
import { SEA_CHAPTERS, type SeaChapter } from './at-sea';
import { CHAPTERS, goalLabel, type Chapter, type ChapterCard } from './campaign';
import type { RoundRecord, SessionOutcome } from './session';
import { goalMet } from './stats';

/** The three stars a won (or lost) chapter earned this time. */
export function chapterStars(
  chapter: ChapterCard,
  record: RoundRecord | undefined,
): [boolean, boolean, boolean] {
  if (!record || record.winner !== 0) return [false, false, false];
  const pilot = [...record.tally.pilots.values()][0];
  return [
    true,
    goalMet(chapter.stars[0], record.tally, 0, pilot),
    goalMet(chapter.stars[1], record.tally, 0, pilot),
  ];
}

export interface ResultsActions {
  again(): void;
  menu(): void;
  /** The next chapter or mission, when there is one and this one was won. */
  next?: () => void;
  /** Back to the mode's own screen: the chapter list, the dogfight roster, the daily. */
  modeScreen?: () => void;
}

export interface ResultsExtras {
  theme: ThemeId;
  stars?: readonly [boolean, boolean, boolean];
  newStars?: number;
  share?: string;
  note?: string;
  xp?: number;
}

const number = (value: number) => value.toLocaleString('en');

function lines(outcome: SessionOutcome, theme: ThemeId): ResultLine[] {
  const copy = THEMES[theme];
  const sum = (pick: (record: RoundRecord) => number) =>
    outcome.rounds.reduce((total, record) => total + pick(record), 0);
  const result: ResultLine[] = [
    { label: 'Targets destroyed', value: number(sum((record) => record.tally.sides[0].targets)) },
    {
      label: `Enemy planes ${copy.shotDown}`,
      value: number(sum((record) => record.tally.sides[0].planesDowned)),
    },
    { label: 'Planes lost', value: number(sum((record) => record.tally.sides[0].planesLost)) },
  ];
  // At sea, what happened on the water too.
  if (outcome.plan.setup.mapFor(0).sea) {
    result.push(
      { label: 'Ships sunk', value: number(sum((record) => record.tally.sides[0].shipsSunk)) },
      {
        label: `${capitalised(copy.raiders.bomber)}s and ${copy.raiders.zeppelin}s down`,
        value: number(sum((record) => record.tally.sides[0].raidersDowned)),
      },
      {
        label: 'Deck landings',
        value: number(
          sum((record) =>
            [...record.tally.pilots.values()].reduce((total, pilot) => total + pilot.traps, 0),
          ),
        ),
      },
    );
  }
  const oxen = sum((record) => record.tally.sides[0].oxen);
  result.push({ label: 'Oxen harmed', value: oxen === 0 ? 'None. Well minded.' : number(oxen) });
  const bonus = sum((record) => (record.winner === 0 ? record.bonus : 0));
  if (bonus > 0) result.push({ label: 'Planes left over (bonus)', value: `+${number(bonus)}` });
  return result;
}

/**
 * The results card for a finished game: how it went in a sentence, the
 * tally, the stars, the score and where to go next.
 */
export function describeOutcome(
  outcome: SessionOutcome,
  extras: ResultsExtras,
  actions: ResultsActions,
): ResultsContent {
  const copy = THEMES[extras.theme];
  const request = outcome.plan.request;
  const last = outcome.rounds[outcome.rounds.length - 1];
  const won = last?.winner === 0;
  const xpNote = extras.xp ? ` +${extras.xp} XP.` : '';
  const starNote =
    (extras.newStars ? `${extras.newStars} new star${extras.newStars === 1 ? '' : 's'}.` : '') +
    xpNote;
  const footer = [
    ...(actions.next
      ? [
          {
            label: request.kind === 'at-sea' ? 'Next mission' : 'Next chapter',
            run: actions.next,
            primary: true,
          },
        ]
      : []),
    {
      label: request.kind === 'daily' ? 'Practise' : 'Fly again',
      run: actions.again,
      primary: !actions.next,
    },
    ...(actions.modeScreen ? [{ label: 'Back', run: actions.modeScreen }] : []),
    { label: 'Menu', run: actions.menu },
  ];

  switch (request.kind) {
    case 'campaign': {
      const chapter = outcome.plan.chapter ?? (CHAPTERS[0] as Chapter);
      const stars = extras.stars ?? [false, false, false];
      return {
        kicker: `Chapter ${CHAPTERS.indexOf(chapter as Chapter) + 1} · ${chapter.twistLabel}`,
        title: won
          ? `${chapter.title[extras.theme]}: won`
          : `${chapter.title[extras.theme]}: ${copy.theEnd}`,
        stars: [
          { earned: stars[0], label: 'Win the round' },
          ...chapter.stars.map((goal, index) => ({
            earned: stars[index + 1] === true,
            label: goalLabel(goal, copy),
          })),
        ],
        lines: lines(outcome, extras.theme),
        total: `Score ${number(outcome.scores[0])}`,
        note: starNote,
        actions: footer,
      };
    }
    case 'at-sea': {
      const chapter = (outcome.plan.chapter ?? SEA_CHAPTERS[0]) as SeaChapter;
      const stars = extras.stars ?? [false, false, false];
      return {
        kicker: `At Sea · Mission ${SEA_CHAPTERS.indexOf(chapter) + 1} · ${chapter.twistLabel}`,
        title: won
          ? `${chapter.title[extras.theme]}: complete`
          : `${chapter.title[extras.theme]}: ${copy.theEnd}`,
        stars: [
          { earned: stars[0], label: 'Complete the mission' },
          ...chapter.stars.map((goal, index) => ({
            earned: stars[index + 1] === true,
            label: goalLabel(goal, copy),
          })),
        ],
        lines: lines(outcome, extras.theme),
        total: `Score ${number(outcome.scores[0])}`,
        note: starNote,
        actions: footer,
      };
    }
    case 'sortie':
      return {
        kicker: `Custom Sortie · ${outcome.plan.sortie?.title ?? ''}`,
        title: won ? 'Mission complete' : copy.theEnd,
        lines: lines(outcome, extras.theme),
        total: `Score ${number(outcome.scores[0])}`,
        note: (extras.note ?? '') + xpNote,
        share: extras.share,
        actions: footer,
      };
    case 'dogfight': {
      const rival = THEMES[extras.theme].rivals[request.level];
      return {
        kicker: `Dogfight · 1 vs ${request.opponents}`,
        title: won ? `You beat ${rival.name}` : `${rival.name} wins`,
        lines: lines(outcome, extras.theme),
        total: `Score ${number(outcome.scores[0])}`,
        note: xpNote.trim() || undefined,
        actions: footer,
      };
    }
    case 'daily':
      return {
        kicker: `Daily Sortie #${request.day.number}${outcome.plan.sortie ? ' · at sea' : ''}${request.practice ? ' · practice' : ''}`,
        title: won ? copy.intoTheSun : copy.theEnd,
        lines: lines(outcome, extras.theme),
        total: `Score ${number(outcome.scores[0])}`,
        note: (extras.note ?? '') + xpNote,
        share: extras.share,
        actions: footer,
      };
    case 'two-player': {
      if (request.style === 'versus') {
        const [top, bottom] = outcome.roundsWon;
        return {
          kicker: 'Two players · Versus',
          title: top === bottom ? 'A draw' : top > bottom ? 'Player 1 wins' : 'Player 2 wins',
          lines: [
            { label: 'Rounds won', value: `${top} – ${bottom}` },
            {
              label: 'Points',
              value: `${number(outcome.scores[0])} – ${number(outcome.scores[1])}`,
            },
          ],
          total: '',
          note: xpNote.trim() || undefined,
          actions: footer,
        };
      }
      return {
        kicker: 'Two players · Co-op',
        title: `${outcome.roundsWon[0]} round${outcome.roundsWon[0] === 1 ? '' : 's'} won together`,
        lines: lines(outcome, extras.theme),
        total: `Score ${number(outcome.scores[0])}`,
        note: xpNote.trim() || undefined,
        actions: footer,
      };
    }
    case 'classic':
      return {
        kicker: 'Classic 1984',
        title: `${outcome.roundsWon[0]} round${outcome.roundsWon[0] === 1 ? '' : 's'} won`,
        lines: lines(outcome, extras.theme),
        total: `Final score ${number(outcome.scores[0])}`,
        note: (extras.note ?? '') + xpNote,
        actions: footer,
      };
  }
}
