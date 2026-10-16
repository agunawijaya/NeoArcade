import type { CpuLevel } from '../engine/world';
import { DOGFIGHT_LEVELS } from '../game/modes';
import type { Progress } from '../progress';
import type { Settings } from '../settings';
import { THEMES, type ThemeId } from '../themes';
import { button, choiceRow, h } from './dom';

export interface DogfightHandlers {
  settings(): Settings;
  progress: Progress;
  theme(): ThemeId;
  change(dogfight: Settings['dogfight']): void;
  play(): void;
  back(): void;
}

const LEVEL_NAMES: Readonly<Record<CpuLevel, string>> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  brutal: 'Brutal',
};

/**
 * Dogfight: no targets, just the sky, the birds, the oxen and the
 * computer's pilots. One opponent with five planes, or three with two
 * each; four pilots to choose from, each with a name, a paint job and a
 * way of flying.
 */
export function buildDogfightScreen(handlers: DogfightHandlers) {
  const pilots = h('div', { class: 'pilots', role: 'group', 'aria-label': 'Opponent' });
  const odds = choiceRow(
    'Odds',
    [
      { value: 1 as const, label: '1 vs 1' },
      { value: 3 as const, label: '1 vs 3' },
    ],
    () => handlers.settings().dogfight.opponents,
    (opponents) => handlers.change({ ...handlers.settings().dogfight, opponents }),
  );
  const takeOff = button('Take off', () => handlers.play(), 'card__button');

  const element = h(
    'section',
    { class: 'screen', 'aria-labelledby': 'dogfight-title', hidden: true },
    h(
      'div',
      { class: 'card card--wide' },
      h('h2', { class: 'card__title card__title--small', id: 'dogfight-title' }, 'Dogfight'),
      h(
        'p',
        { class: 'panel__subtitle' },
        'Bring down every enemy plane before they bring down yours. No targets, no excuses. Mind the ox.',
      ),
      odds.element,
      pilots,
      h('div', { class: 'card__footer' }, button('Back', handlers.back, 'chip'), takeOff),
    ),
  );

  const refresh = () => {
    const theme = THEMES[handlers.theme()];
    const current = handlers.settings().dogfight;
    odds.refresh();
    pilots.replaceChildren(
      ...DOGFIGHT_LEVELS.map((level) => {
        const rival = theme.rivals[level];
        const wins = handlers.progress.dogfightWins[level] ?? 0;
        return button(
          h('span', { class: 'pilot__level' }, LEVEL_NAMES[level]),
          () => {
            handlers.change({ ...handlers.settings().dogfight, level });
            refresh();
          },
          'pilot',
          { 'aria-pressed': String(current.level === level), 'data-level': level },
          h('span', { class: 'pilot__name' }, rival.name),
          h('span', { class: 'pilot__style' }, rival.style),
          h('span', { class: 'pilot__wins' }, wins > 0 ? `Beaten ${wins}×` : 'Not beaten yet'),
        );
      }),
    );
  };

  return {
    element,
    refresh,
    focusFirst() {
      takeOff.focus();
    },
  };
}
