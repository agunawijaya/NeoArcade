import { recentPlays, resumeQuery, type Play } from '@shared/last-played';
import type { GameEntry } from './catalog';
import { mediaUrl } from './docs-source';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { gameUrl, launchOnClick } from './launch';
import { buildScrollRow } from './scroll-row';
import { timeAgo } from './time';

/**
 * "Continue playing": the modes the player was last in, newest first, each
 * one click from where they left off. Hidden until there is history.
 */
export interface ContinueRow {
  element: HTMLElement;
  refresh(): void;
}

const SHOWN = 6;

export function buildContinueRow(games: readonly GameEntry[]): ContinueRow {
  const row = buildScrollRow('Continue playing');
  const element = h(
    'section',
    { class: 'continue', 'aria-labelledby': 'continue-title', hidden: true },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-head__title', id: 'continue-title' }, 'Continue playing'),
      row.buttons,
    ),
    row.element,
  );

  const refresh = () => {
    const now = new Date();
    const tiles = recentPlays()
      .map((play) => ({ play, game: games.find((game) => game.slug === play.game) }))
      .filter((entry): entry is { play: Play; game: GameEntry } => entry.game !== undefined)
      .slice(0, SHOWN)
      .map(({ play, game }) => buildResumeTile(play, game, now));
    element.hidden = tiles.length === 0;
    row.list.replaceChildren(...tiles);
    tiles.forEach((tile, index) => {
      tile
        .querySelector<HTMLElement>('[data-row-item]')
        ?.setAttribute('tabindex', index ? '-1' : '0');
    });
    row.refresh();
  };

  refresh();
  return { element, refresh };
}

function buildResumeTile(play: Play, game: GameEntry, now: Date): HTMLElement {
  const screen = game.screens?.[0];
  const image = screen ? mediaUrl(`ports/${game.slug}/${screen.image}`) : null;
  const link = h(
    'a',
    {
      class: 'resume',
      href: `${gameUrl(game)}${resumeQuery(play)}`,
      style: `--accent: ${game.accent}`,
      'aria-label': `Continue ${game.title}: ${play.label}, played ${timeAgo(play.at, now)}`,
      'data-slug': game.slug,
      'data-row-item': '',
    },
    h(
      'span',
      { class: 'resume__screen' },
      image
        ? h('img', { src: image, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' })
        : null,
      h('span', { class: 'resume__play' }, icon(ICONS.play)),
    ),
    h(
      'span',
      { class: 'resume__body' },
      h('span', { class: 'resume__game' }, game.title),
      h('span', { class: 'resume__label' }, play.label),
      h('span', { class: 'resume__when' }, timeAgo(play.at, now)),
    ),
  );
  launchOnClick(link);
  return h('li', { class: 'resume-slot' }, link);
}
