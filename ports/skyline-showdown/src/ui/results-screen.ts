import { lookFor } from '../render/gorilla';
import { GorillaPreview } from '../render/preview';
import type { StageRecorded } from '../tour/progress';
import { RIVALS } from '../tour/rivals';
import type { Stage } from '../tour/stages';
import type { WardrobeItem } from '../wardrobe/items';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface ResultsHandlers {
  next(stage: Stage): void;
  retry(stage: Stage): void;
  map(): void;
  challenge(): void;
}

export interface TourResult {
  stage: Stage;
  recorded: StageRecorded;
  /** Your throws, and the points the rival scored. */
  throws: number;
  timesHit: number;
  /** XP the Arcade Pass granted for the stage. */
  xp: number;
  /** Wardrobe items this result unlocked. */
  unlocked: readonly WardrobeItem[];
  /** The stage to go on to, if there is one open. */
  next: Stage | null;
  /** One of your hits can be sent to a friend as a challenge. */
  challengeable: boolean;
}

export interface ResultsScreen {
  element: HTMLElement;
  show(result: TourResult): void;
  hide(): void;
  animate(delta: number, reducedMotion: boolean): void;
}

/** After a World Tour duel: the stars, one by one, what they were for, and where next. */
export function buildResultsScreen(handlers: ResultsHandlers): ResultsScreen {
  const title = h('h2', { class: 'results__title', id: 'results-title' });
  const stars = h('div', { class: 'results__stars' });
  const goals = h('ul', { class: 'results__goals' });
  const notes = h('div', { class: 'results__notes' });
  const portraitHolder = h('div', { class: 'results__portrait' });
  const line = h('blockquote', { class: 'results__line' });
  const actions = h('div', { class: 'menu menu--row' });

  const element = h(
    'section',
    {
      class: 'overlay overlay--results',
      role: 'dialog',
      'aria-labelledby': 'results-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel results' },
      title,
      stars,
      h(
        'div',
        { class: 'results__body' },
        goals,
        h('div', { class: 'results__rival' }, portraitHolder, line),
      ),
      notes,
      actions,
    ),
  );

  let preview: GorillaPreview | null = null;

  const button = (label: string, symbol: string, action: () => void, primary = false) => {
    const element = h(
      'button',
      { class: `button${primary ? ' button--primary' : ''}`, type: 'button' },
      icon(symbol),
      label,
    );
    element.addEventListener('click', action);
    return element;
  };

  return {
    element,
    show(result) {
      const { stage, recorded } = result;
      const { goals: achieved, stars: earned, capped } = recorded.result;
      const rival = RIVALS[stage.rival];
      element.style.setProperty('--rival', rival.colour);
      title.textContent = achieved.win ? `${stage.city} cleared!` : 'Not this time';

      stars.replaceChildren(
        ...[0, 1, 2].map((index) =>
          h(
            'span',
            {
              class: index < earned ? 'results__star results__star--earned' : 'results__star',
              style: `--delay: ${0.35 + index * 0.4}s`,
            },
            icon(ICONS.star),
          ),
        ),
      );
      stars.setAttribute('role', 'img');
      stars.setAttribute('aria-label', `${earned} of 3 stars`);

      const goal = (done: boolean, text: string) =>
        h(
          'li',
          { class: done ? 'results__goal results__goal--done' : 'results__goal' },
          h('span', { 'aria-hidden': 'true' }, done ? '✓' : '✗'),
          text,
        );
      goals.replaceChildren(
        goal(achieved.win, achieved.win ? `Beat ${rival.name}` : `${rival.name} won this one`),
        goal(achieved.budget, `Within ${stage.throwBudget} throws (you took ${result.throws})`),
        goal(
          achieved.flawless,
          result.timesHit === 0 ? 'Never hit' : `Never hit (hit ${result.timesHit}×)`,
        ),
      );

      preview = new GorillaPreview(lookFor(rival.outfit, rival.colour));
      preview.show(achieved.win ? 'sulk' : 'victory');
      portraitHolder.replaceChildren(preview.canvas);
      line.textContent = `“${achieved.win ? rival.lines.defeat : rival.lines.victory}” — ${rival.name}`;

      const news = [
        capped ? 'Aim assist was on, so this stage stops at one star.' : null,
        recorded.newStars > 0
          ? `+${recorded.newStars} new star${recorded.newStars === 1 ? '' : 's'}`
          : null,
        result.xp > 0 ? `+${result.xp} XP on your Arcade Pass` : null,
        recorded.rivalFirstDefeat ? `${rival.name} can now be picked in Quick Match` : null,
        result.unlocked.length > 0
          ? `New in the Wardrobe: ${result.unlocked.map((item) => item.name).join(', ')}`
          : null,
        ...recorded.opened.map((chapter) => `${chapter.name} is open!`),
        recorded.tourComplete && recorded.firstWin
          ? 'World Tour complete! The skyline is yours.'
          : null,
      ].filter((text): text is string => text !== null);
      notes.replaceChildren(...news.map((text) => h('p', {}, text)));

      const nextStage = achieved.win ? result.next : null;
      actions.replaceChildren(
        ...(nextStage
          ? [button('Next stop', ICONS.next, () => handlers.next(nextStage), true)]
          : []),
        button('Retry', ICONS.retry, () => handlers.retry(stage), !nextStage),
        ...(result.challengeable
          ? [button('Challenge a friend', ICONS.swords, handlers.challenge)]
          : []),
        button('Map', ICONS.map, handlers.map),
      );
      element.hidden = false;
      actions.querySelector<HTMLElement>('button')?.focus();
    },
    hide() {
      element.hidden = true;
      preview = null;
    },
    animate(delta, reducedMotion) {
      if (element.hidden || !preview) return;
      preview.update(delta, reducedMotion);
      preview.draw();
    },
  };
}
