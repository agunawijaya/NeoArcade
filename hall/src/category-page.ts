import type { BadgeTally } from '@shared/pass';
import type { Store } from '@shared/storage';
import { buildCard, type Card } from './card';
import { categoryById, categoryStyle, type CategoryId } from './categories';
import type { GameEntry } from './catalog';
import { h, icon } from './dom';
import { categoryEmblem } from './emblems';
import { ARROW_DIRECTIONS, itemsOf, makeTabStop, stepInGrid } from './focus-groups';
import { ICONS } from './icons';
import { inCategory, selectGames, type PlayCounts, type SortOrder } from './library';
import { routeToHash } from './routes';

/** Every game in one category as a grid, sorted A–Z, newest first or most played. */
export interface CategoryPage {
  element: HTMLElement;
  show(category: CategoryId): void;
  hide(): void;
  /** Puts focus back on a game's card, e.g. after its detail panel closes. */
  focusGame(slug: string): boolean;
  showBadges(tallyFor: (slug: string) => BadgeTally | null): void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  title: 'A–Z',
  added: 'Newest',
  played: 'Most played',
};
const SORT_KEY = 'category-sort';

export function createCategoryPage(
  games: readonly GameEntry[],
  store: Store,
  plays: () => PlayCounts,
): CategoryPage {
  const heading = h('div', { class: 'category-page__head' });
  const sortButtons = (Object.keys(SORT_LABELS) as SortOrder[]).map((sort) =>
    h('button', { class: 'segment', type: 'button', 'data-sort': sort }, SORT_LABELS[sort]),
  );
  const grid = h('ul', { class: 'grid', 'data-grid': '', 'aria-label': 'Games' });
  const element = h(
    'section',
    { class: 'category-page has-category', hidden: true, tabindex: -1 },
    h(
      'div',
      { class: 'page-bar' },
      h(
        'a',
        { class: 'page-bar__back', href: routeToHash({ view: 'lobby' }) },
        icon(ICONS.back),
        'The Hall',
      ),
    ),
    heading,
    h(
      'div',
      { class: 'category-page__tools' },
      h('div', { class: 'segments', role: 'group', 'aria-label': 'Sort order' }, ...sortButtons),
    ),
    grid,
  );

  const cards = new Map<string, Card>();
  let showing: CategoryId | null = null;
  let tallyFor: (slug: string) => BadgeTally | null = () => null;
  let sort: SortOrder = readSort(store);

  const cardFor = (game: GameEntry, category: CategoryId) => {
    const key = `${category}/${game.slug}`;
    let card = cards.get(key);
    if (!card) {
      card = buildCard(game, {
        place: `page-${category}`,
        visiting: game.category !== category,
      });
      cards.set(key, card);
    }
    card.setBadges(tallyFor(game.slug));
    return card;
  };

  const render = () => {
    if (!showing) return;
    const category = categoryById(showing);
    const members = inCategory(games, showing);
    const ordered = selectGames(members, { search: '', genre: null, sort }, plays());
    const slots = ordered.map((game) => cardFor(game, category.id));
    grid.replaceChildren(...slots.map((card) => card.slot));
    const focused = slots.find((card) => card.link === document.activeElement) ?? slots[0];
    for (const card of slots) card.link.tabIndex = card === focused ? 0 : -1;
    for (const button of sortButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.sort === sort));
    }
    element.setAttribute('style', categoryStyle(category));
    heading.replaceChildren(
      h('span', { class: 'category-page__emblem' }, categoryEmblem(category)),
      h(
        'div',
        {},
        h(
          'p',
          { class: 'category-page__eyebrow' },
          `${members.length} game${members.length === 1 ? '' : 's'}`,
        ),
        h('h1', { class: 'category-page__title' }, category.name),
        h('p', { class: 'category-page__blurb' }, category.blurb),
      ),
    );
  };

  // The grid is one tab stop; the arrow keys move between its cards.
  grid.addEventListener('focusin', (event) => makeTabStop(event.target as HTMLElement));
  grid.addEventListener('keydown', (event) => {
    const from = event.target as HTMLElement;
    if (event.key === ' ') {
      event.preventDefault();
      from.click();
      return;
    }
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const cards = itemsOf(grid);
    const next = direction
      ? stepInGrid(grid, from, direction)
      : event.key === 'Home'
        ? cards[0]
        : cards.at(-1);
    next?.focus();
  });

  for (const button of sortButtons) {
    button.addEventListener('click', () => {
      sort = (button.dataset.sort as SortOrder | undefined) ?? 'added';
      store.set(SORT_KEY, sort);
      render();
    });
  }

  return {
    element,
    show(category) {
      // Already showing, e.g. under a game's panel opened from it: leave the grid and its focus be.
      if (showing === category && !element.hidden) return;
      showing = category;
      element.hidden = false;
      document.title = `${categoryById(category).name} · NeoArcade`;
      render();
      window.scrollTo({ top: 0 });
    },
    hide() {
      element.hidden = true;
      showing = null;
    },
    focusGame(slug) {
      const card = [...grid.querySelectorAll<HTMLAnchorElement>('.card')].find(
        (link) => link.dataset.slug === slug,
      );
      if (!card || element.hidden) return false;
      card.focus();
      return true;
    },
    showBadges(next) {
      tallyFor = next;
      for (const [key, card] of cards) card.setBadges(tallyFor(key.split('/')[1] ?? ''));
    },
  };
}

function readSort(store: Store): SortOrder {
  const stored = store.get<string>(SORT_KEY, 'added');
  return stored === 'title' || stored === 'played' ? stored : 'added';
}
