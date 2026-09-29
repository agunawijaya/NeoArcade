import type { Streak } from '@shared/daily';
import { DAILY_THROWS, resumeDaily, type DailyResult, type DailySkyline } from '../daily/daily';
import { WORLDS } from '../engine/worlds';
import { drawCityPreview, type PreviewPath } from '../render/city-preview';
import { mixColours, type Theme } from '../render/palette';
import { nextDailyText } from './daily-screen';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { buildShareBox } from './share-box';

export interface DailyResultsHandlers {
  practice(): void;
  daily(): void;
  challenge(): void;
}

export interface DailyResultsView {
  skyline: DailySkyline;
  result: DailyResult;
  /** The day's one scored attempt, rather than practice. */
  scored: boolean;
  shareLine: string | null;
  streak: Streak | null;
  xp: number;
  /** A practice hit can be sent to a friend. */
  challengeable: boolean;
  now: Date;
  theme: Theme;
}

export interface DailyResults {
  element: HTMLElement;
  show(view: DailyResultsView): void;
  hide(): void;
}

const EARLY = '#8e87aa';
const LATE = '#ffb03d';
const HIT = '#ff5d5d';

/**
 * After a daily: how many bananas it took, every throw of the attempt drawn
 * over the city (the hit bold), and the spoiler-free line to share.
 */
export function buildDailyResults(handlers: DailyResultsHandlers): DailyResults {
  const kicker = h('p', { class: 'card__chapter' });
  const title = h('h2', { class: 'results__title', id: 'daily-results-title' });
  const bananas = h('p', { class: 'daily-results__bananas', role: 'img' });
  const picture = h('canvas', { class: 'daily-results__picture', role: 'img' });
  const share = buildShareBox('Your result, ready to share');
  const streakLine = h('p', { class: 'daily-results__streak' });
  const notes = h('div', { class: 'results__notes' });
  const nextLine = h('p', { class: 'daily__next' });
  const actions = h('div', { class: 'menu menu--row' });
  const element = h(
    'section',
    {
      class: 'overlay overlay--daily-results',
      role: 'dialog',
      'aria-labelledby': 'daily-results-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel results daily-results' },
      h('div', { class: 'daily-results__main' }, kicker, title, bananas, picture),
      h(
        'div',
        { class: 'daily-results__side' },
        share.element,
        streakLine,
        notes,
        nextLine,
        actions,
      ),
    ),
  );

  const button = (label: string, symbol: string, action: () => void, primary = false) => {
    const control = h(
      'button',
      { class: `button${primary ? ' button--primary' : ''}`, type: 'button' },
      icon(symbol),
      label,
    );
    control.addEventListener('click', action);
    return control;
  };

  return {
    element,
    show(view) {
      const { skyline, result, scored } = view;
      kicker.textContent = `Daily #${skyline.day.number} · ${WORLDS[skyline.world].name}${scored ? '' : ' · practice, not scored'}`;
      title.textContent =
        result.outcome === 'hit'
          ? result.throws === 1
            ? 'Hole in one!'
            : `Hit in ${result.throws}!`
          : result.outcome === 'selfHit'
            ? 'Bonk. That was you.'
            : 'Out of bananas';
      const strip = [
        ...Array.from(
          { length: result.outcome === 'hit' ? result.throws - 1 : result.throws },
          () => '🍌',
        ),
        result.outcome === 'hit' ? '💥' : result.outcome === 'selfHit' ? '🙈' : '',
      ].join('');
      bananas.textContent = `${strip}  ${result.outcome === 'hit' ? result.throws : 'X'}/${DAILY_THROWS}`;
      bananas.setAttribute(
        'aria-label',
        result.outcome === 'hit'
          ? `${result.throws} of ${DAILY_THROWS} bananas`
          : `No hit in ${result.throws} bananas`,
      );

      element.hidden = false;
      const { state, results } = resumeDaily(
        skyline,
        result.aims.map(([angle, velocity]) => ({ angle, velocity })),
      );
      const paths: PreviewPath[] = results.map((turn, index) => {
        const last = index === results.length - 1;
        const points = turn.shot.tracks[0]?.points ?? [];
        const colour =
          last && result.outcome === 'hit'
            ? HIT
            : mixColours(EARLY, LATE, results.length > 1 ? index / (results.length - 1) : 1);
        return { points, colour, bold: last, end: points.at(-1) };
      });
      drawCityPreview(picture, { round: state.round, target: 1, paths, theme: view.theme });
      picture.setAttribute(
        'aria-label',
        `The city with all ${results.length} throws drawn over it`,
      );

      share.element.hidden = view.shareLine === null;
      if (view.shareLine) share.show(view.shareLine);
      streakLine.hidden = view.streak === null;
      if (view.streak) {
        streakLine.replaceChildren(
          icon(ICONS.flame),
          ` Streak ${view.streak.current} · best ${view.streak.best}`,
        );
      }
      notes.replaceChildren(
        ...(view.xp > 0 ? [h('p', {}, `+${view.xp} XP on your Arcade Pass`)] : []),
      );
      nextLine.textContent = nextDailyText(view.now);
      actions.replaceChildren(
        button(
          scored ? 'Practice' : 'Practice again',
          ICONS.retry,
          handlers.practice,
          !view.challengeable,
        ),
        ...(view.challengeable
          ? [button('Challenge a friend', ICONS.swords, handlers.challenge, true)]
          : []),
        button('Daily', ICONS.calendar, handlers.daily),
      );
      actions.querySelector<HTMLElement>('.button--primary')?.focus();
    },
    hide() {
      element.hidden = true;
    },
  };
}
