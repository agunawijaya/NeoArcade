import { goalTexts } from '../tricks/describe';
import type { PuzzleRecorded, TrickStars } from '../tricks/progress';
import type { Puzzle } from '../tricks/puzzle';
import { h, icon } from './dom';
import { ICONS } from './icons';

/**
 * Trick Shot's two overlays during play: the goals panel at the top, which
 * fills its stars as they are earned and offers the hint after a few
 * misses, and the card that follows a solve.
 */
export interface TrickPanel {
  element: HTMLElement;
  show(puzzle: Puzzle, best: TrickStars): void;
  /** After each attempt: how many so far, and whether the hint is due. */
  update(attempts: number, hint: string | null): void;
  hide(): void;
}

export function buildTrickPanel(): TrickPanel {
  const name = h('strong', { class: 'trick-panel__name' });
  const goals = h('ul', { class: 'trick-panel__goals' });
  const hint = h('p', { class: 'trick-panel__hint', hidden: true });
  const element = h(
    'aside',
    { class: 'trick-panel', 'aria-label': 'Puzzle goals', hidden: true },
    name,
    goals,
    hint,
  );
  let current: Puzzle | null = null;
  let best: TrickStars = { solved: false, par: false, style: false };

  const render = (attempts: number) => {
    const puzzle = current;
    if (!puzzle) return;
    const earned = [best.solved, best.par, best.style];
    // Over par this visit: the second star has to wait for another visit.
    const parGone = attempts >= puzzle.par && !best.par;
    goals.replaceChildren(
      ...goalTexts(puzzle).map((text, index) =>
        h(
          'li',
          {
            class: [
              'trick-panel__goal',
              earned[index] ? 'trick-panel__goal--earned' : '',
              index === 1 && parGone ? 'trick-panel__goal--gone' : '',
            ]
              .filter(Boolean)
              .join(' '),
          },
          icon(ICONS.star),
          index === 1 && !earned[1]
            ? `${text} (${Math.min(attempts, puzzle.par)}/${puzzle.par})`
            : text,
        ),
      ),
    );
  };

  return {
    element,
    show(puzzle, stars) {
      current = puzzle;
      best = stars;
      name.textContent = puzzle.name;
      hint.hidden = true;
      render(0);
      element.hidden = false;
    },
    update(attempts, hintText) {
      render(attempts);
      hint.hidden = hintText === null;
      hint.textContent = hintText ? `Hint: ${hintText}` : '';
    },
    hide() {
      element.hidden = true;
      current = null;
    },
  };
}

export interface SolveCardHandlers {
  next(): void;
  retry(): void;
  challenge(): void;
  packs(): void;
}

export interface SolveResult {
  puzzle: Puzzle;
  attempts: number;
  recorded: PuzzleRecorded;
  /** Stars now held on this puzzle, best ever. */
  stars: number;
  xp: number;
  /** The puzzle after this one, if it is open. */
  next: Puzzle | null;
}

export interface SolveCard {
  element: HTMLElement;
  show(result: SolveResult): void;
  hide(): void;
}

export function buildSolveCard(handlers: SolveCardHandlers): SolveCard {
  const title = h('h2', { class: 'results__title', id: 'solve-title' });
  const stars = h('div', { class: 'results__stars', role: 'img' });
  const goals = h('ul', { class: 'results__goals solve__goals' });
  const notes = h('div', { class: 'results__notes' });
  const actions = h('div', { class: 'menu menu--row' });
  const element = h(
    'section',
    {
      class: 'overlay overlay--solve',
      role: 'dialog',
      'aria-labelledby': 'solve-title',
      hidden: true,
    },
    h('div', { class: 'panel results solve' }, title, stars, goals, notes, actions),
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
    show(result) {
      const { puzzle, recorded } = result;
      const { earned } = recorded;
      title.textContent = earned.style ? 'Solved, with style!' : 'Solved!';
      stars.replaceChildren(
        ...[0, 1, 2].map((index) =>
          h(
            'span',
            {
              class: index < result.stars ? 'results__star results__star--earned' : 'results__star',
              style: `--delay: ${0.2 + index * 0.3}s`,
            },
            icon(ICONS.star),
          ),
        ),
      );
      stars.setAttribute('aria-label', `${result.stars} of 3 stars`);
      const [solveText, parText, styleText] = goalTexts(puzzle);
      const goal = (done: boolean, text: string) =>
        h(
          'li',
          { class: done ? 'results__goal results__goal--done' : 'results__goal' },
          h('span', { 'aria-hidden': 'true' }, done ? '✓' : '✗'),
          text,
        );
      goals.replaceChildren(
        goal(true, solveText),
        goal(earned.par, `${parText} (took ${result.attempts})`),
        goal(earned.style, styleText),
      );
      const news = [
        recorded.newStars > 0
          ? `+${recorded.newStars} new star${recorded.newStars === 1 ? '' : 's'}`
          : null,
        result.xp > 0 ? `+${result.xp} XP on your Arcade Pass` : null,
        ...recorded.opened.map((pack) => `${pack.name} is open!`),
        recorded.allSolved && recorded.firstSolve ? 'Every puzzle solved. Puzzle Master!' : null,
      ].filter((text): text is string => text !== null);
      notes.replaceChildren(...news.map((text) => h('p', {}, text)));
      actions.replaceChildren(
        ...(result.next ? [button('Next puzzle', ICONS.next, handlers.next, true)] : []),
        button('Try again', ICONS.retry, handlers.retry, !result.next),
        button('Challenge a friend', ICONS.share, handlers.challenge),
        button('Packs', ICONS.map, handlers.packs),
      );
      element.hidden = false;
      actions.querySelector<HTMLElement>('button')?.focus();
    },
    hide() {
      element.hidden = true;
    },
  };
}
