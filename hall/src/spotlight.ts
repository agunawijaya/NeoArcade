import type { BadgeTally } from '@shared/pass';
import { badgeCount } from './badge-count';
import { formatPlayers, originalDate, type GameEntry } from './catalog';
import { inkOn } from './colour';
import { mediaUrl } from './docs-source';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { gameUrl, launchOnClick } from './launch';
import { routeToHash } from './routes';
import { buildScreenShow } from './screen-show';

/**
 * The game at the top of the Hall: its screens large, and next to them what
 * makes it worth playing, with Play one click away.
 */
export interface Spotlight {
  element: HTMLElement;
  game: GameEntry;
  /** The first screenshot, which the page borrows for its blurred backdrop. */
  backdropImage: string | null;
  focusPlay(): void;
  play(): void;
  setBadges(tally: BadgeTally | null): void;
}

export function buildSpotlight(game: GameEntry): Spotlight {
  const screens = buildScreenShow(game, { cycle: true, eager: true });
  screens.setPlaying(true);

  const playLink = h(
    'a',
    { class: 'button button--play', href: gameUrl(game), 'aria-label': `Play ${game.title}` },
    icon(ICONS.play),
    'Play',
  );
  launchOnClick(playLink);

  const { original } = game;
  const firstScreen = game.screens?.[0];
  const badges = badgeCount();
  const badgesLink = h(
    'a',
    { class: 'spotlight__badges', href: routeToHash({ view: 'pass' }), hidden: true },
    badges.element,
  );
  const element = h(
    'section',
    {
      class: 'spotlight',
      'aria-labelledby': 'spotlight-title',
      style: `--accent: ${game.accent}; --on-accent: ${inkOn(game.accent)}`,
    },
    h('div', { class: 'spotlight__stage' }, screens.element),
    h(
      'div',
      { class: 'spotlight__info' },
      h(
        'p',
        { class: 'spotlight__eyebrow' },
        [...game.genres, formatPlayers(game.players)].join(' · '),
      ),
      h('h2', { class: 'spotlight__title', id: 'spotlight-title' }, game.title),
      h('p', { class: 'spotlight__tagline' }, game.tagline),
      game.pitch ? h('p', { class: 'spotlight__pitch' }, game.pitch) : null,
      game.highlights?.length
        ? h(
            'ul',
            { class: 'spotlight__highlights' },
            ...game.highlights.map((line) => h('li', {}, line)),
          )
        : null,
      h(
        'div',
        { class: 'spotlight__actions' },
        playLink,
        h(
          'a',
          {
            class: 'button',
            href: routeToHash({ view: 'doc', slug: game.slug, doc: 'how-to-play' }),
          },
          icon(ICONS.guide),
          'How to play',
        ),
        h(
          'a',
          { class: 'button', href: routeToHash({ view: 'doc', slug: game.slug, doc: 'about' }) },
          icon(ICONS.about),
          'About',
        ),
      ),
      h(
        'p',
        { class: 'spotlight__origin' },
        `Inspired by ${original.title} · ${original.author} · ${originalDate(original)}`,
      ),
      badgesLink,
    ),
  );

  return {
    element,
    game,
    backdropImage: firstScreen ? mediaUrl(`ports/${game.slug}/${firstScreen.image}`) : null,
    focusPlay: () => playLink.focus(),
    play: () => playLink.click(),
    setBadges(tally) {
      badges.set(tally);
      badgesLink.hidden = tally === null;
    },
  };
}
