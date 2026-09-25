import type { Store } from '@shared/storage';
import { buildCabinet, type Cabinet } from './cabinet';
import type { GameEntry } from './catalog';
import { playCover, type CoverPlayer } from './cover-player';
import { loadCover } from './covers';
import { h, icon, isVisible } from './dom';
import { buildEmptyState } from './empty-state';
import { ICONS } from './icons';
import { collectGenres, selectGames, type LibraryQuery, type SortOrder } from './library';
import { nearestInDirection, type Direction } from './spatial-nav';

export interface Lobby {
  element: HTMLElement;
  /** Puts keyboard focus back on a cabinet, e.g. after its detail panel closes. */
  focusGame(slug: string): void;
  /** Steps through the genre filters; used by gamepad shoulder buttons. */
  stepGenre(delta: number): void;
}

const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const SORT_LABELS: Record<SortOrder, string> = { title: 'A–Z', added: 'Newest' };

export function createLobby(games: readonly GameEntry[], store: Store): Lobby {
  if (games.length === 0) {
    return { element: buildEmptyState(), focusGame() {}, stepGenre() {} };
  }

  const query: LibraryQuery = {
    search: '',
    genre: null,
    sort: store.get<SortOrder>('sort', 'added') === 'title' ? 'title' : 'added',
  };
  const genres = collectGenres(games);
  const cabinets = games.map(buildCabinet);
  const covers = new Map<string, CoverPlayer>();

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
  const count = h('p', { class: 'lobby__count', role: 'status' });
  const grid = h('ul', { class: 'grid', id: 'games', 'aria-label': 'Games' });
  const clearButton = h(
    'button',
    { class: 'button button--ghost', type: 'button' },
    'Show everything',
  );
  const noResults = h(
    'div',
    { class: 'lobby__none', hidden: true },
    h('p', {}, 'No machine matches that. Maybe it is still being wired up.'),
    clearButton,
  );

  const element = h(
    'section',
    { class: 'lobby', 'aria-label': 'Games' },
    h(
      'div',
      { class: 'toolbar' },
      h(
        'label',
        { class: 'search' },
        icon(ICONS.search),
        searchField,
        h('kbd', { class: 'search__key', 'aria-hidden': 'true' }, '/'),
      ),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by genre' }, ...genreButtons),
      h('div', { class: 'segments', role: 'group', 'aria-label': 'Sort order' }, ...sortButtons),
    ),
    count,
    grid,
    noResults,
  );

  const visibleCabinets = () => cabinets.filter((cabinet) => isVisible(cabinet.link));

  const refresh = () => {
    const ordered = selectGames(games, query)
      .map((game) => cabinets.find((cabinet) => cabinet.game.slug === game.slug))
      .filter((cabinet): cabinet is Cabinet => cabinet !== undefined);
    grid.replaceChildren(...ordered.map((cabinet) => cabinet.slot));

    const machines = (total: number) => `${total === 1 ? 'machine' : 'machines'}`;
    count.textContent =
      ordered.length === games.length
        ? `${games.length} ${machines(games.length)} on the floor`
        : `${ordered.length} of ${games.length} ${machines(games.length)}`;
    noResults.hidden = ordered.length > 0;

    for (const button of genreButtons) {
      const genre = button.dataset.genre || null;
      button.setAttribute('aria-pressed', String(genre === query.genre));
    }
    for (const button of sortButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.sort === query.sort));
    }
    keepOneCabinetTabbable(ordered);
  };

  // Only one cabinet is in the tab order; arrow keys move between them.
  const keepOneCabinetTabbable = (ordered: Cabinet[]) => {
    const current = ordered.find((cabinet) => cabinet.link.tabIndex === 0) ?? ordered[0];
    for (const cabinet of cabinets) cabinet.link.tabIndex = cabinet === current ? 0 : -1;
  };

  const moveFocusTo = (cabinet: Cabinet) => {
    for (const other of cabinets) other.link.tabIndex = other === cabinet ? 0 : -1;
    cabinet.link.focus();
    cabinet.link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  grid.addEventListener('keydown', (event) => {
    const from = cabinets.find((cabinet) => cabinet.link === event.target);
    if (!from) return;
    const visible = visibleCabinets();
    let next: Cabinet | null | undefined;

    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      const boxes = visible.map((cabinet) => ({ cabinet, ...boxOf(cabinet.link) }));
      next = nearestInDirection(boxOf(from.link), boxes, direction)?.cabinet;
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
      const first = visibleCabinets()[0];
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
    visibleCabinets()[0]?.link.focus();
  });

  for (const cabinet of cabinets) wakeOnAttention(cabinet, covers);
  refresh();

  return {
    element,
    focusGame(slug) {
      const cabinet = cabinets.find((candidate) => candidate.game.slug === slug);
      if (cabinet && isVisible(cabinet.link)) moveFocusTo(cabinet);
    },
    stepGenre(delta) {
      const options = [null, ...genres];
      const index = options.indexOf(query.genre);
      query.genre = options[(index + delta + options.length) % options.length] ?? null;
      refresh();
    },
  };
}

/** The cover comes alive while the cabinet is hovered or focused. */
function wakeOnAttention(cabinet: Cabinet, covers: Map<string, CoverPlayer>) {
  const { game, link, canvas } = cabinet;
  let hovered = false;
  let focused = false;
  const update = () => covers.get(game.slug)?.setAlive(hovered || focused);

  void loadCover(game.cover).then((definition) => {
    const seed = [...game.slug].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
    covers.set(
      game.slug,
      playCover(canvas, definition, { seed, accent: game.accent, title: game.title }),
    );
    update();
  });

  link.addEventListener('pointerenter', () => {
    hovered = true;
    update();
  });
  link.addEventListener('pointerleave', () => {
    hovered = false;
    update();
  });
  link.addEventListener('focus', () => {
    focused = true;
    update();
  });
  link.addEventListener('blur', () => {
    focused = false;
    update();
  });
}

function boxOf(element: Element) {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}
