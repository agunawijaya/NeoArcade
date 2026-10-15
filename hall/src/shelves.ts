import { buildCard, type Card } from './card';
import { categoryStyle, type CategoryId } from './categories';
import type { GameEntry } from './catalog';
import { h, icon } from './dom';
import { categoryEmblem } from './emblems';
import { ICONS } from './icons';
import { shelvesOf, type SortOrder } from './library';
import { routeToHash } from './routes';
import { buildScrollRow, type ScrollRow } from './scroll-row';

/**
 * The collection as shelves: one per category that has games, in the fixed
 * category order (ADR 0018), each a row of cards that scrolls sideways and
 * ends in a doorway to the full category page.
 */
export interface ShelvesView {
  element: HTMLElement;
  cards: readonly Card[];
  /** Reorders the games on every shelf. */
  sort(order: SortOrder): void;
}

interface BuiltShelf {
  category: CategoryId;
  element: HTMLElement;
  row: ScrollRow;
  cards: Map<string, Card>;
  more: HTMLElement;
}

export function buildShelves(games: readonly GameEntry[], order: SortOrder): ShelvesView {
  const built: BuiltShelf[] = shelvesOf(games, order).map(({ category, games: entries }) => {
    const row = buildScrollRow(`${category.name} games`);
    const cards = new Map(
      entries.map(({ game, secondary }) => [
        game.slug,
        buildCard(game, { place: category.id, visiting: secondary }),
      ]),
    );
    const count = `${entries.length} game${entries.length === 1 ? '' : 's'}`;
    const href = routeToHash({ view: 'category', category: category.id });
    const more = h(
      'li',
      { class: 'shelf__more-slot' },
      h(
        'a',
        {
          class: 'shelf__more',
          href,
          'aria-label': `All ${category.name} games`,
          'data-row-item': '',
          'data-category': category.id,
        },
        h('span', { class: 'shelf__more-ring' }, categoryEmblem(category)),
        h('span', { class: 'shelf__more-text' }, 'See all'),
        h('span', { class: 'shelf__more-count' }, count),
      ),
    );
    const titleId = `shelf-${category.id}-title`;
    const element = h(
      'section',
      {
        class: 'shelf has-category',
        style: categoryStyle(category),
        'aria-labelledby': titleId,
        'data-category': category.id,
      },
      h(
        'div',
        { class: 'shelf__head' },
        h(
          'a',
          { class: 'shelf__title-link', href },
          h('span', { class: 'shelf__emblem' }, categoryEmblem(category)),
          h('h2', { class: 'shelf__title', id: titleId }, category.name),
          h('span', { class: 'shelf__count' }, count),
          icon(ICONS.forward),
        ),
        row.buttons,
      ),
      row.element,
    );
    row.list.append(...[...cards.values()].map((card) => card.slot), more);
    return { category: category.id, element, row, cards, more };
  });

  const element = h('div', { class: 'shelves' }, ...built.map((shelf) => shelf.element));

  const arrange = (sort: SortOrder) => {
    for (const { games: entries, category } of shelvesOf(games, sort)) {
      const shelf = built.find((candidate) => candidate.category === category.id);
      if (!shelf) continue;
      const slots = entries
        .map(({ game }) => shelf.cards.get(game.slug)?.slot)
        .filter((slot): slot is HTMLLIElement => slot !== undefined);
      shelf.row.list.replaceChildren(...slots, shelf.more);
      const items = [...shelf.row.list.querySelectorAll<HTMLElement>('[data-row-item]')];
      items.forEach((item, index) => (item.tabIndex = index === 0 ? 0 : -1));
      shelf.row.element.scrollLeft = 0;
    }
  };
  arrange(order);

  return {
    element,
    cards: built.flatMap((shelf) => [...shelf.cards.values()]),
    sort: arrange,
  };
}
