import { drawCityPreview } from '../render/city-preview';
import type { Theme } from '../render/palette';
import { marksFor } from '../render/targets';
import { goalTexts, kitText, ruleText } from '../tricks/describe';
import { packOf } from '../tricks/packs';
import { starsOf, type PuzzleRecord } from '../tricks/progress';
import { buildPuzzle, PAD_RADIUS_METRES, type Puzzle } from '../tricks/puzzle';
import { METRES_PER_UNIT } from '../game/so-close';
import { otherPlayer } from '../engine/gorillas';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface PuzzleCardHandlers {
  play(puzzle: Puzzle): void;
  close(): void;
}

export interface PuzzleCard {
  element: HTMLElement;
  open(puzzle: Puzzle, record: PuzzleRecord | undefined, theme: Theme): void;
  close(): void;
}

/** The card before a puzzle: a picture of the set-up, the task, and the three stars on offer. */
export function buildPuzzleCard(handlers: PuzzleCardHandlers): PuzzleCard {
  const packLine = h('p', { class: 'card__chapter' });
  const name = h('h2', { class: 'card__city', id: 'puzzle-card-title' });
  const picture = h('canvas', { class: 'puzzle-card__picture', 'aria-hidden': 'true' });
  const brief = h('p', { class: 'puzzle-card__brief' });
  const rule = h('p', { class: 'puzzle-card__rule' });
  const kit = h('p', { class: 'puzzle-card__kit' });
  const goals = h('ul', { class: 'card__goals' });
  const play = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.play),
    'Play',
  );
  const back = h(
    'button',
    { class: 'button button--quiet', type: 'button' },
    icon(ICONS.map),
    'Packs',
  );
  back.addEventListener('click', handlers.close);

  const element = h(
    'section',
    {
      class: 'overlay overlay--card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'puzzle-card-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel card puzzle-card' },
      h('div', { class: 'puzzle-card__side' }, picture),
      h(
        'div',
        { class: 'card__stage-side' },
        packLine,
        name,
        brief,
        rule,
        kit,
        goals,
        h('div', { class: 'menu menu--row card__actions' }, back, play),
      ),
    ),
  );

  let current: Puzzle | null = null;
  play.addEventListener('click', () => {
    if (current) handlers.play(current);
  });

  return {
    element,
    open(puzzle, record, theme) {
      current = puzzle;
      const pack = packOf(puzzle);
      element.style.setProperty('--rival', pack.colour);
      packLine.textContent = `${pack.name} · Puzzle ${pack.puzzles.indexOf(puzzle) + 1} of ${pack.puzzles.length}`;
      name.textContent = puzzle.name;
      brief.textContent = puzzle.brief;
      rule.textContent = puzzle.rule ? `Rule: ${ruleText(puzzle.rule)}` : '';
      rule.hidden = !puzzle.rule;
      const kitLine = kitText(puzzle);
      kit.textContent = kitLine ?? '';
      kit.hidden = kitLine === null;
      const earned = starsOf(puzzle, record);
      const done = [earned.solved, earned.par, earned.style];
      goals.replaceChildren(
        ...goalTexts(puzzle).map((text, index) =>
          h(
            'li',
            { class: done[index] ? 'card__goal card__goal--earned' : 'card__goal' },
            h('span', { class: 'card__star', 'aria-hidden': 'true' }, icon(ICONS.star)),
            text,
          ),
        ),
      );
      goals.setAttribute('aria-label', `Star goals: ${done.filter(Boolean).length} of 3 earned.`);
      element.hidden = false;
      const built = buildPuzzle(puzzle);
      drawCityPreview(picture, {
        round: built.round,
        marks: marksFor(built.targets, PAD_RADIUS_METRES / METRES_PER_UNIT),
        target: built.targets.some((target) => target.kind === 'dummy')
          ? otherPlayer(built.thrower)
          : null,
        theme,
        timeOfDay: puzzle.timeOfDay,
      });
      play.focus();
    },
    close() {
      element.hidden = true;
      current = null;
    },
  };
}
