import { resumeQuery } from '@shared/last-played';
import type { GameEntry } from './catalog';
import { inkOn } from './colour';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { gameUrl, launchOnClick } from './launch';
import { nextDaily, readDailies, type DailyStatus } from './today';

/**
 * "Today in NeoArcade": every game's daily challenge in one place, with
 * today's number, whether it is done and how it went, the streak, and the
 * wait until the next one. One click opens the game on its daily.
 */
export interface TodayPanel {
  element: HTMLElement;
  /** Reads the logs again, e.g. after a game was played in another tab. */
  refresh(): void;
}

const localTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function buildTodayPanel(games: readonly GameEntry[]): TodayPanel | null {
  if (!games.some((game) => game.daily)) return null;

  const next = h('p', { class: 'today__next' });
  const list = h('ul', { class: 'today__list', 'data-row': '', 'aria-label': 'Daily challenges' });
  const element = h(
    'section',
    { class: 'today', 'aria-labelledby': 'today-title' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-head__title', id: 'today-title' }, 'Today in NeoArcade'),
      next,
    ),
    list,
  );
  let day = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const showCountdown = (now: Date) => {
    const { wait, at } = nextDaily(now);
    next.replaceChildren(
      icon(ICONS.clock),
      h(
        'span',
        {},
        'New dailies in ',
        h('strong', {}, wait),
        h('span', { class: 'today__at' }, `, at ${localTime.format(at)} your time`),
      ),
    );
  };

  const render = () => {
    const now = new Date();
    day = now.toISOString().slice(0, 10);
    const focusedSlug = list.querySelector<HTMLElement>(':focus')?.dataset.slug;
    list.replaceChildren(...readDailies(games, now).map(buildTile));
    showCountdown(now);
    const tiles = [...list.querySelectorAll<HTMLAnchorElement>('.daily-tile')];
    const current = tiles.find((tile) => tile.dataset.slug === focusedSlug);
    for (const tile of tiles) tile.tabIndex = tile === (current ?? tiles[0]) ? 0 : -1;
    current?.focus({ preventScroll: true });
  };

  // The countdown ticks once a minute; a new UTC day redraws everything.
  const tick = () => {
    const now = new Date();
    if (now.toISOString().slice(0, 10) !== day) render();
    else showCountdown(now);
    timer = setTimeout(tick, 60_000 - (now.getTime() % 60_000) + 50);
  };

  render();
  tick();
  document.addEventListener('visibilitychange', () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!document.hidden) tick();
  });

  return { element, refresh: render };
}

function buildTile(status: DailyStatus): HTMLElement {
  const { game, daily, number, played, result, streak } = status;
  const link = h(
    'a',
    {
      class: `daily-tile${played ? ' is-done' : ''}`,
      href: `${gameUrl(game)}${resumeQuery({ mode: daily.mode })}`,
      style: `--accent: ${game.accent}; --on-accent: ${inkOn(game.accent)}`,
      'data-slug': game.slug,
      'data-row-item': '',
    },
    h(
      'span',
      { class: 'daily-tile__mark', 'aria-hidden': 'true' },
      played ? icon(ICONS.check) : h('span', { class: 'daily-tile__dot' }),
    ),
    h(
      'span',
      { class: 'daily-tile__body' },
      h('span', { class: 'daily-tile__game' }, game.title),
      h(
        'span',
        { class: 'daily-tile__name' },
        daily.name,
        ' ',
        h('span', { class: 'daily-tile__number' }, `#${number}`),
      ),
      h(
        'span',
        { class: 'daily-tile__status' },
        played ? (result ?? 'Played today') : 'Not played yet',
      ),
      streak > 0
        ? h('span', { class: 'daily-tile__streak' }, icon(ICONS.flame), `${streak}-day streak`)
        : null,
    ),
    h(
      'span',
      { class: 'daily-tile__action' },
      h('span', { class: 'daily-tile__action-text' }, played ? 'See today’s' : 'Play today’s'),
      icon(played ? ICONS.forward : ICONS.play),
    ),
  );
  launchOnClick(link);
  return h('li', { class: 'today__item' }, link);
}
