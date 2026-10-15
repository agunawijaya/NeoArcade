import type { BadgeTally } from '@shared/pass';
import { badgeCount } from './badge-count';
import { categoryById, categoryStyle } from './categories';
import { formatPlayers, type GameEntry } from './catalog';
import { h } from './dom';
import { categoryEmblem } from './emblems';
import { routeToHash } from './routes';
import { buildScreenShow, type ScreenShow } from './screen-show';

/**
 * A game in the collection: its first screen, its name and one line on why
 * it is fun. The whole card is one link to the game's detail panel.
 */
export interface Card {
  game: GameEntry;
  slot: HTMLLIElement;
  link: HTMLAnchorElement;
  screens: ScreenShow;
  /** Shows the player's badge count once they have played the game. */
  setBadges(tally: BadgeTally | null): void;
}

export interface CardOptions {
  /** Where the card sits (a shelf, the results), so a game shown twice keeps unique ids. */
  place: string;
  /** On a game's secondary shelf, a small tag names the shelf it belongs to. */
  visiting?: boolean;
}

export function buildCard(game: GameEntry, { place, visiting = false }: CardOptions): Card {
  const screens = buildScreenShow(game, { cycle: false });
  const titleId = `card-${place}-${game.slug}-title`;
  const aboutId = `card-${place}-${game.slug}-about`;
  const homeId = `card-${place}-${game.slug}-home`;
  const badges = badgeCount();
  const home = categoryById(game.category);

  const link = h(
    'a',
    {
      class: 'card',
      href: routeToHash({ view: 'game', slug: game.slug }),
      style: `--accent: ${game.accent}`,
      'aria-labelledby': titleId,
      'aria-describedby': visiting ? `${aboutId} ${homeId}` : aboutId,
      'data-slug': game.slug,
      'data-row-item': '',
    },
    h(
      'span',
      { class: 'card__screen' },
      screens.element,
      visiting
        ? h(
            'span',
            { class: 'card__home has-category', id: homeId, style: categoryStyle(home) },
            categoryEmblem(home),
            h('span', { class: 'visually-hidden' }, 'Mainly '),
            home.name,
          )
        : null,
    ),
    h(
      'span',
      { class: 'card__body' },
      h('span', { class: 'card__title', id: titleId }, game.title),
      h(
        'span',
        { class: 'card__about', id: aboutId },
        h('span', { class: 'card__tagline' }, game.tagline),
        h(
          'span',
          { class: 'card__meta' },
          [...game.genres.slice(0, 2), formatPlayers(game.players)].join(' · '),
        ),
        badges.element,
      ),
    ),
  );

  // An animated cover (for a game without screenshots) plays while the card has attention.
  let hovered = false;
  let focused = false;
  const update = () => screens.setPlaying(hovered || focused);
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

  return {
    game,
    slot: h('li', { class: 'card-slot' }, link),
    link,
    screens,
    setBadges: badges.set,
  };
}
