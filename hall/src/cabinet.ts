import { formatPlayers, type GameEntry } from './catalog';
import { h } from './dom';
import { routeToHash } from './routes';

/**
 * A game shown as an arcade cabinet seen from the front: lit marquee,
 * screen, control deck with a stick and buttons, and a coin door. The whole
 * cabinet is one link to the game's detail panel.
 */
export interface Cabinet {
  game: GameEntry;
  slot: HTMLLIElement;
  link: HTMLAnchorElement;
  canvas: HTMLCanvasElement;
}

export function buildCabinet(game: GameEntry): Cabinet {
  const canvas = h('canvas', { class: 'cabinet__canvas' });
  const titleId = `cabinet-${game.slug}-title`;
  const plaqueId = `cabinet-${game.slug}-plaque`;

  const link = h(
    'a',
    {
      class: 'cabinet',
      href: routeToHash({ view: 'game', slug: game.slug }),
      style: `--accent: ${game.accent}`,
      'aria-labelledby': titleId,
      'aria-describedby': plaqueId,
      'data-slug': game.slug,
    },
    buildMachine(game.title, canvas, titleId),
    h(
      'span',
      { class: 'cabinet__plaque', id: plaqueId },
      h('span', { class: 'cabinet__tagline' }, game.tagline),
      h(
        'span',
        { class: 'cabinet__meta' },
        [...game.genres.slice(0, 2), formatPlayers(game.players)].join(' · '),
      ),
      h(
        'span',
        { class: 'cabinet__origin' },
        `Based on ${game.original.title} (${game.original.year})`,
      ),
    ),
  );

  return { game, slot: h('li', { class: 'cabinet-slot' }, link), link, canvas };
}

/** The machine on its own, also used for the dormant cabinets of the empty Hall. */
export function buildMachine(title: string, canvas: HTMLCanvasElement, titleId?: string) {
  return h(
    'span',
    { class: 'cabinet__machine' },
    h(
      'span',
      { class: 'cabinet__marquee' },
      h('span', { class: 'cabinet__title', id: titleId }, title),
    ),
    h('span', { class: 'cabinet__screen' }, canvas, h('span', { class: 'cabinet__glass' })),
    h(
      'span',
      { class: 'cabinet__deck', 'aria-hidden': 'true' },
      h('span', { class: 'cabinet__stick' }),
      h('span', { class: 'cabinet__button' }),
      h('span', { class: 'cabinet__button' }),
    ),
    h(
      'span',
      { class: 'cabinet__door', 'aria-hidden': 'true' },
      h('span', { class: 'cabinet__coin' }),
      h('span', { class: 'cabinet__coin' }),
    ),
  );
}
