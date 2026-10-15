import type { BadgeTally } from '@shared/pass';
import type { Store } from '@shared/storage';
import { buildCard, type Card } from './card';
import type { CategoryId } from './categories';
import type { GameEntry } from './catalog';
import { buildContinueRow } from './continue-row';
import { h, icon, isVisible } from './dom';
import { buildEmptyState } from './empty-state';
import { ARROW_DIRECTIONS, boxOf, itemsOf, makeTabStop, stepInGrid } from './focus-groups';
import { ICONS } from './icons';
import {
  collectGenres,
  isFiltering,
  selectGames,
  type LibraryQuery,
  type SortOrder,
} from './library';
import { prefersReducedMotion } from './motion';
import { revealInRow } from './scroll-row';
import { buildShelves, type ShelvesView } from './shelves';
import { stepAcrossRows, type Direction } from './spatial-nav';
import { buildSpotlight } from './spotlight';
import { buildTodayPanel } from './today-panel';

export interface Lobby {
  element: HTMLElement;
  /** Screenshot for the page's blurred backdrop, if the featured game has one. */
  backdropImage: string | null;
  /** Whether there is a search box, so the key hints can mention it. */
  searchable: boolean;
  /** Puts keyboard focus back on a game, e.g. after its detail panel closes. */
  focusGame(slug: string): void;
  /** Puts keyboard focus on a shelf's way into its category page, coming back from it. */
  focusCategory(category: CategoryId): void;
  /** Steps through the genre filters; used by gamepad shoulder buttons. */
  stepGenre(delta: number): void;
  /** Launches the featured game; used by the gamepad's Start button. */
  playFeatured(): void;
  /** Shows the player's badge count on every game they have played. */
  showBadges(tallyFor: (slug: string) => BadgeTally | null): void;
  /**
   * Moves focus the way the lobby's rows want it (up and down between
   * shelves, sideways along one). False when focus is somewhere the lobby
   * leaves to the page's own navigation.
   */
  move(direction: Direction): boolean;
  /** Reads the daily logs and the play history again. */
  refresh(): void;
}

/** Below this many games, search and filters are more clutter than help. */
const SEARCH_FROM = 6;

const SORT_LABELS: Partial<Record<SortOrder, string>> = { title: 'A–Z', added: 'Newest' };

export function createLobby(games: readonly GameEntry[], store: Store): Lobby {
  const newest = selectGames(games, { search: '', genre: null, sort: 'added' })[0];
  if (!newest) {
    return {
      element: buildEmptyState(),
      backdropImage: null,
      searchable: false,
      focusGame() {},
      focusCategory() {},
      stepGenre() {},
      playFeatured() {},
      showBadges() {},
      move: () => false,
      refresh() {},
    };
  }

  const spotlight = buildSpotlight(newest);
  const continueRow = buildContinueRow(games);
  const today = buildTodayPanel(games);
  const library = games.length > 1 ? buildLibrary(games, store) : null;
  const element = h(
    'div',
    { class: 'lobby' },
    spotlight.element,
    continueRow.element,
    today?.element,
    library?.element,
    games.length < SEARCH_FROM
      ? h(
          'p',
          { class: 'lobby__soon' },
          'More classics are being rebuilt right now. Each one lands here the day it is ready.',
        )
      : null,
  );

  // The card or tile the player last chose, so focus can come back to that very one.
  let lastChosen: HTMLElement | null = null;
  element.addEventListener('click', (event) => {
    const item = (event.target as Element).closest<HTMLElement>('[data-row-item]');
    if (item) lastChosen = item;
  });
  element.addEventListener('focusin', (event) => {
    const item = event.target as HTMLElement;
    if (!item.matches('[data-row-item]')) return;
    makeTabStop(item);
    revealInRow(item);
  });

  const move = (direction: Direction, from = document.activeElement): boolean => {
    if (!(from instanceof HTMLElement) || !element.contains(from)) return false;
    if (from.closest('.spotlight')) {
      if (direction !== 'down') return false;
      const first = visibleRows()[0]?.find((item) => item.tabIndex === 0);
      if (first) focusItem(first);
      return first !== undefined;
    }
    if (!from.matches('[data-row-item]')) return false;

    const grid = from.closest('[data-grid]');
    if (grid) {
      const next = stepInGrid(grid, from, direction);
      if (next) focusItem(next);
      return next !== null;
    }

    const rows = visibleRows();
    const row = rows.findIndex((items) => items.includes(from));
    if (row === -1) return false;
    const next = stepAcrossRows(
      rows.map((items) => items.map(boxOf)),
      { row, index: rows[row]?.indexOf(from) ?? 0 },
      direction,
    );
    if (next) {
      const target = rows[next.row]?.[next.index];
      if (target) focusItem(target);
    } else if (direction === 'up' && row === 0) {
      spotlight.focusPlay();
      spotlight.element.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
    }
    return true;
  };

  const visibleRows = () =>
    [...element.querySelectorAll<HTMLElement>('[data-row]')]
      .filter(isVisible)
      .map(itemsOf)
      .filter((items) => items.length > 0);

  element.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      if (move(direction, target)) event.preventDefault();
      return;
    }
    if (!target.matches('[data-row-item]')) return;
    if (event.key === ' ') {
      event.preventDefault();
      target.click();
    } else if (event.key === 'Home' || event.key === 'End') {
      const items = itemsOf(target.closest('[data-row], [data-grid]') ?? element);
      const next = event.key === 'Home' ? items[0] : items.at(-1);
      if (next) {
        event.preventDefault();
        focusItem(next);
      }
    }
  });

  return {
    element,
    backdropImage: spotlight.backdropImage,
    searchable: library?.searchable ?? false,
    focusGame(slug) {
      const candidates = [
        lastChosen,
        ...element.querySelectorAll<HTMLElement>('[data-row-item][data-slug]'),
      ];
      const item = candidates.find(
        (candidate): candidate is HTMLElement =>
          candidate !== null && candidate.dataset.slug === slug && isVisible(candidate),
      );
      if (item) focusItem(item);
      else if (slug === spotlight.game.slug) spotlight.focusPlay();
    },
    focusCategory(category) {
      const doorway = element.querySelector<HTMLElement>(
        `.shelf__more[data-category="${category}"]`,
      );
      if (doorway && isVisible(doorway)) focusItem(doorway);
    },
    stepGenre: (delta) => library?.stepGenre(delta),
    playFeatured: () => spotlight.play(),
    showBadges(tallyFor) {
      spotlight.setBadges(tallyFor(spotlight.game.slug));
      library?.showBadges(tallyFor);
    },
    move: (direction) => move(direction),
    refresh() {
      continueRow.refresh();
      today?.refresh();
    },
  };

  function focusItem(item: HTMLElement) {
    makeTabStop(item);
    item.focus({ preventScroll: true });
    revealInRow(item);
    const section = item.closest('section') ?? item;
    section.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

interface Library {
  element: HTMLElement;
  searchable: boolean;
  stepGenre(delta: number): void;
  showBadges(tallyFor: (slug: string) => BadgeTally | null): void;
}

/**
 * The collection: shelves by category, and once there are enough games a
 * toolbar to search, filter by genre and sort. While a search or a genre
 * narrows things down, the shelves give way to one grid of results.
 */
function buildLibrary(games: readonly GameEntry[], store: Store): Library {
  const searchable = games.length >= SEARCH_FROM;
  const query: LibraryQuery = {
    search: '',
    genre: null,
    sort: store.get<SortOrder>('sort', 'added') === 'title' ? 'title' : 'added',
  };
  const genres = collectGenres(games);
  const shelves: ShelvesView = buildShelves(games, query.sort);
  const resultCards = new Map<string, Card>();
  let tallyFor: (slug: string) => BadgeTally | null = () => null;
  // Result cards are only built once a search needs them.
  const resultCard = (game: GameEntry) => {
    let card = resultCards.get(game.slug);
    if (!card) {
      card = buildCard(game, { place: 'results' });
      card.setBadges(tallyFor(game.slug));
      resultCards.set(game.slug, card);
    }
    return card;
  };

  const searchField = h('input', {
    class: 'search__field',
    type: 'search',
    placeholder: 'Search games',
    'aria-label': 'Search games by title',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const genreButtons = [null, ...genres].map((genre) =>
    h(
      'button',
      { class: 'chip', type: 'button', 'data-genre': genre ?? '', 'aria-pressed': 'false' },
      genre ?? 'All',
    ),
  );
  const sortButtons = (Object.keys(SORT_LABELS) as SortOrder[]).map((sort) =>
    h('button', { class: 'segment', type: 'button', 'data-sort': sort }, SORT_LABELS[sort]),
  );
  const count = h('p', { class: 'library__count', role: 'status' });
  const grid = h('ul', { class: 'grid', 'data-grid': '', 'aria-label': 'Results' });
  const clearButton = h(
    'button',
    { class: 'button button--ghost', type: 'button' },
    'Show everything',
  );
  const noResults = h(
    'div',
    { class: 'library__none', hidden: true },
    h('p', {}, 'Nothing matches that yet. Maybe it is still being rebuilt.'),
    clearButton,
  );
  const results = h(
    'section',
    { class: 'library__results', 'aria-labelledby': 'results-title', hidden: true },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-head__title', id: 'results-title' }, 'Results'),
      count,
    ),
    grid,
    noResults,
  );

  const element = h(
    'div',
    { class: 'library' },
    searchable
      ? h(
          'div',
          { class: 'toolbar' },
          h(
            'label',
            { class: 'search' },
            icon(ICONS.search),
            searchField,
            h('kbd', { class: 'search__key', 'aria-hidden': 'true' }, '/'),
          ),
          h(
            'div',
            { class: 'chips', role: 'group', 'aria-label': 'Filter by genre' },
            ...genreButtons,
          ),
          h(
            'div',
            { class: 'segments', role: 'group', 'aria-label': 'Sort order' },
            ...sortButtons,
          ),
        )
      : null,
    results,
    shelves.element,
  );

  const refresh = () => {
    const filtering = isFiltering(query);
    results.hidden = !filtering;
    shelves.element.hidden = filtering;
    if (filtering) {
      const found = selectGames(games, query).map(resultCard);
      grid.replaceChildren(...found.map((card) => card.slot));
      found.forEach((card, index) => (card.link.tabIndex = index === 0 ? 0 : -1));
      count.textContent = `${found.length} of ${games.length} games`;
      noResults.hidden = found.length > 0;
    }
    for (const button of genreButtons) {
      const genre = button.dataset.genre || null;
      button.setAttribute('aria-pressed', String(genre === query.genre));
    }
    for (const button of sortButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.sort === query.sort));
    }
  };

  const firstGame = () =>
    itemsOf(isFiltering(query) ? grid : shelves.element).find((item) => item.tabIndex === 0);

  searchField.addEventListener('input', () => {
    query.search = searchField.value;
    refresh();
  });
  searchField.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && searchField.value) {
      event.stopPropagation();
      searchField.value = '';
      query.search = '';
      refresh();
    } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
      const first = firstGame();
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea');
    if (event.key === '/' && !typing && isVisible(searchField)) {
      event.preventDefault();
      searchField.focus();
    }
  });

  for (const button of genreButtons) {
    button.addEventListener('click', () => {
      query.genre = button.dataset.genre || null;
      refresh();
    });
  }
  for (const button of sortButtons) {
    button.addEventListener('click', () => {
      query.sort = button.dataset.sort === 'title' ? 'title' : 'added';
      store.set('sort', query.sort);
      shelves.sort(query.sort);
      refresh();
    });
  }
  clearButton.addEventListener('click', () => {
    searchField.value = '';
    Object.assign(query, { search: '', genre: null });
    refresh();
    firstGame()?.focus();
  });

  refresh();

  return {
    element,
    searchable,
    stepGenre(delta) {
      if (!searchable) return;
      const options = [null, ...genres];
      const index = options.indexOf(query.genre);
      query.genre = options[(index + delta + options.length) % options.length] ?? null;
      refresh();
    },
    showBadges(next) {
      tallyFor = next;
      for (const card of [...shelves.cards, ...resultCards.values()]) {
        card.setBadges(tallyFor(card.game.slug));
      }
    },
  };
}
