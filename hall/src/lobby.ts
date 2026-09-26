import type { Store } from '@shared/storage';
import { buildCard, type Card } from './card';
import type { GameEntry } from './catalog';
import { h, icon, isVisible } from './dom';
import { buildEmptyState } from './empty-state';
import { ICONS } from './icons';
import { collectGenres, selectGames, type LibraryQuery, type SortOrder } from './library';
import { nearestInDirection, type Direction } from './spatial-nav';
import { buildSpotlight } from './spotlight';

export interface Lobby {
  element: HTMLElement;
  /** Screenshot for the page's blurred backdrop, if the featured game has one. */
  backdropImage: string | null;
  /** Whether there is a search box, so the key hints can mention it. */
  searchable: boolean;
  /** Puts keyboard focus back on a game, e.g. after its detail panel closes. */
  focusGame(slug: string): void;
  /** Steps through the genre filters; used by gamepad shoulder buttons. */
  stepGenre(delta: number): void;
  /** Launches the featured game; used by the gamepad's Start button. */
  playFeatured(): void;
}

/** Below this many games, search and filters are more clutter than help. */
const SEARCH_FROM = 6;

const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const SORT_LABELS: Record<SortOrder, string> = { title: 'A–Z', added: 'Newest' };

export function createLobby(games: readonly GameEntry[], store: Store): Lobby {
  const newest = selectGames(games, { search: '', genre: null, sort: 'added' })[0];
  if (!newest) {
    return {
      element: buildEmptyState(),
      backdropImage: null,
      searchable: false,
      focusGame() {},
      stepGenre() {},
      playFeatured() {},
    };
  }

  const spotlight = buildSpotlight(newest);
  const library = games.length > 1 ? buildLibrary(games, store) : null;
  const element = h(
    'div',
    { class: 'lobby' },
    spotlight.element,
    library?.element,
    games.length < SEARCH_FROM
      ? h(
          'p',
          { class: 'lobby__soon' },
          'More classics are being rebuilt right now. Each one lands here the day it is ready.',
        )
      : null,
  );

  return {
    element,
    backdropImage: spotlight.backdropImage,
    searchable: library?.searchable ?? false,
    focusGame(slug) {
      if (library?.focusGame(slug)) return;
      if (slug === spotlight.game.slug) spotlight.focusPlay();
    },
    stepGenre: (delta) => library?.stepGenre(delta),
    playFeatured: () => spotlight.play(),
  };
}

interface Library {
  element: HTMLElement;
  searchable: boolean;
  /** Returns false when the game has no visible card to focus. */
  focusGame(slug: string): boolean;
  stepGenre(delta: number): void;
}

/** Every game as a card, with search, genre filters and sorting once there are enough. */
function buildLibrary(games: readonly GameEntry[], store: Store): Library {
  const searchable = games.length >= SEARCH_FROM;
  const query: LibraryQuery = {
    search: '',
    genre: null,
    sort: store.get<SortOrder>('sort', 'added') === 'title' ? 'title' : 'added',
  };
  const genres = collectGenres(games);
  const cards = games.map(buildCard);

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
  const grid = h('ul', { class: 'grid', id: 'games', 'aria-label': 'Games' });
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

  const element = h(
    'section',
    { class: 'library', 'aria-labelledby': 'library-title' },
    h(
      'div',
      { class: 'library__head' },
      h('h2', { class: 'library__title', id: 'library-title' }, 'All games'),
      count,
    ),
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
    grid,
    noResults,
  );

  const visibleCards = () => cards.filter((card) => isVisible(card.link));

  const refresh = () => {
    const ordered = selectGames(games, query)
      .map((game) => cards.find((card) => card.game.slug === game.slug))
      .filter((card): card is Card => card !== undefined);
    grid.replaceChildren(...ordered.map((card) => card.slot));

    count.textContent =
      ordered.length === games.length
        ? `${games.length} games`
        : `${ordered.length} of ${games.length} games`;
    noResults.hidden = ordered.length > 0;

    for (const button of genreButtons) {
      const genre = button.dataset.genre || null;
      button.setAttribute('aria-pressed', String(genre === query.genre));
    }
    for (const button of sortButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.sort === query.sort));
    }
    keepOneCardTabbable(ordered);
  };

  // Only one card is in the tab order; arrow keys move between them.
  const keepOneCardTabbable = (ordered: Card[]) => {
    const current = ordered.find((card) => card.link.tabIndex === 0) ?? ordered[0];
    for (const card of cards) card.link.tabIndex = card === current ? 0 : -1;
  };

  const moveFocusTo = (card: Card) => {
    for (const other of cards) other.link.tabIndex = other === card ? 0 : -1;
    card.link.focus();
    card.link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  grid.addEventListener('keydown', (event) => {
    const from = cards.find((card) => card.link === event.target);
    if (!from) return;
    const visible = visibleCards();
    let next: Card | null | undefined;

    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      const boxes = visible.map((card) => ({ card, ...boxOf(card.link) }));
      next = nearestInDirection(boxOf(from.link), boxes, direction)?.card;
    } else if (event.key === 'Home') {
      next = visible[0];
    } else if (event.key === 'End') {
      next = visible.at(-1);
    } else if (event.key === ' ') {
      event.preventDefault();
      from.link.click();
      return;
    } else {
      return;
    }
    event.preventDefault();
    if (next) moveFocusTo(next);
  });

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
      const first = visibleCards()[0];
      if (first) {
        event.preventDefault();
        moveFocusTo(first);
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
      refresh();
    });
  }
  clearButton.addEventListener('click', () => {
    searchField.value = '';
    Object.assign(query, { search: '', genre: null });
    refresh();
    visibleCards()[0]?.link.focus();
  });

  refresh();

  return {
    element,
    searchable,
    focusGame(slug) {
      const card = cards.find((candidate) => candidate.game.slug === slug);
      if (!card || !isVisible(card.link)) return false;
      moveFocusTo(card);
      return true;
    },
    stepGenre(delta) {
      if (!searchable) return;
      const options = [null, ...genres];
      const index = options.indexOf(query.genre);
      query.genre = options[(index + delta + options.length) % options.length] ?? null;
      refresh();
    },
  };
}

function boxOf(element: Element) {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}
