import { PACKS, type Pack } from '../tricks/packs';
import {
  MAX_TRICK_STARS,
  nextPuzzle,
  PACK_OPENS_AFTER,
  packUnlocked,
  puzzleStars,
  solvedIn,
  totalTrickStars,
  type TrickSave,
} from '../tricks/progress';
import type { Puzzle } from '../tricks/puzzle';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { starText } from './tour-map';

export interface TrickMapHandlers {
  open(puzzle: Puzzle): void;
  back(): void;
}

export interface TrickMap {
  element: HTMLElement;
  refresh(save: TrickSave): void;
  focusNext(): void;
}

/**
 * Trick Shot's pack map: four packs side by side, each a column of six
 * puzzles with the stars earned on them. A locked pack says what opens it.
 */
export function buildTrickMap(handlers: TrickMapHandlers): TrickMap {
  const total = h('p', { class: 'tour__total tricks__total' });
  const info = h('p', { class: 'tricks__info', 'aria-live': 'polite' });
  const back = h(
    'button',
    { class: 'button button--quiet', type: 'button' },
    icon(ICONS.back),
    'Back',
  );
  back.addEventListener('click', handlers.back);
  const packs = h('div', { class: 'tricks__packs' });

  const element = h(
    'section',
    { class: 'screen screen--tricks', 'aria-labelledby': 'tricks-title', hidden: true },
    h(
      'header',
      { class: 'tour__head' },
      back,
      h('h2', { class: 'tour__title', id: 'tricks-title' }, 'Trick Shot'),
      total,
    ),
    packs,
    info,
  );

  let save: TrickSave | null = null;
  const buttons = new Map<string, HTMLButtonElement>();

  const packColumn = (pack: Pack, current: TrickSave, index: number) => {
    const open = packUnlocked(current, pack);
    const previous = PACKS[index - 1];
    const list = h(
      'ol',
      { class: 'pack__puzzles' },
      ...pack.puzzles.map((puzzle, number) => {
        const stars = puzzleStars(current, puzzle);
        const solved = current.puzzles[puzzle.id]?.solved === true;
        const button = h(
          'button',
          {
            class: `puzzle-tile${solved ? ' puzzle-tile--solved' : ''}`,
            type: 'button',
            'aria-disabled': String(!open),
            'aria-label': `${number + 1}. ${puzzle.name}${open ? `, ${stars} of 3 stars` : ', locked'}`,
            'data-puzzle': puzzle.id,
          },
          h('span', { class: 'puzzle-tile__number' }, String(number + 1)),
          h('span', { class: 'puzzle-tile__name' }, puzzle.name),
          h('span', { class: 'puzzle-tile__stars', 'aria-hidden': 'true' }, starText(stars)),
        );
        button.addEventListener('click', () => {
          if (open) handlers.open(puzzle);
          else info.textContent = lockedText(pack, previous);
        });
        button.addEventListener(
          'focus',
          () => (info.textContent = `${puzzle.name}: ${puzzle.brief}`),
        );
        buttons.set(puzzle.id, button);
        return h('li', {}, button);
      }),
    );
    return h(
      'article',
      {
        class: `pack${open ? '' : ' pack--locked'}`,
        style: `--pack: ${pack.colour}`,
        'aria-label': `${pack.name}: ${pack.idea}`,
      },
      h(
        'header',
        { class: 'pack__head' },
        h('p', { class: 'pack__idea' }, open ? pack.idea : icon(ICONS.lock), open ? '' : ' Locked'),
        h('h3', { class: 'pack__name' }, pack.name),
        h('p', { class: 'pack__blurb' }, open ? pack.blurb : lockedText(pack, previous)),
        h(
          'p',
          { class: 'pack__count' },
          `${solvedIn(current, pack)} / ${pack.puzzles.length} solved`,
        ),
      ),
      list,
    );
  };

  return {
    element,
    refresh(next) {
      save = next;
      buttons.clear();
      packs.replaceChildren(...PACKS.map((pack, index) => packColumn(pack, next, index)));
      const stars = totalTrickStars(next);
      total.replaceChildren(icon(ICONS.star), `${stars} / ${MAX_TRICK_STARS}`);
      total.setAttribute('aria-label', `${stars} of ${MAX_TRICK_STARS} stars`);
      const upcoming = nextPuzzle(next);
      info.textContent = upcoming
        ? `Next up: ${upcoming.name}. ${upcoming.brief}`
        : 'Every puzzle solved. Now chase the stars you missed.';
    },
    focusNext() {
      const upcoming = save ? nextPuzzle(save) : null;
      (buttons.get(upcoming?.id ?? '') ?? buttons.values().next().value ?? back).focus();
    },
  };
}

function lockedText(pack: Pack, previous: Pack | undefined): string {
  return previous
    ? `Solve ${PACK_OPENS_AFTER} puzzles in ${previous.name} to open ${pack.name}.`
    : `${pack.name} is locked.`;
}
