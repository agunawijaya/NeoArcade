import { clearPlays, recentPlays } from '@shared/last-played';
import { buildBadgeCabinet, type ArcadePass, type BadgeCabinet } from '@shared/pass';
import type { Store } from '@shared/storage';
import type { GameEntry } from './catalog';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { buildFeed, buildGameStats, buildRewards, buildStorageNotice } from './pass-activity';
import type { PassShelves } from './pass-manifests';
import { buildHero, buildRankRoad } from './pass-profile';
import { routeToHash } from './routes';

/** Things the page asks the Hall to open; `from` names the button to return focus to. */
export interface PassPageActions {
  editProfile(from: string): void;
  backUp(tab: 'export' | 'import', from: string): void;
  startOver(from: string): void;
}

export interface PassPage {
  element: HTMLElement;
  show(): void;
  hide(): void;
  /** Says something at the top of the page, e.g. after a restore. */
  announce(message: string): void;
  /** Puts focus back on one of the page's buttons by its action name, after a rebuild. */
  focusAction(action: string): void;
}

const SEEN_KEY = 'pass-seen';

/**
 * The Arcade Pass page: the player's profile, the rank road, the badge
 * cabinet, per-game stats, recent activity and backups. Everything but the
 * cabinet is rebuilt whenever the Pass changes; the cabinet updates itself.
 */
export function createPassPage(
  pass: ArcadePass,
  shelves: PassShelves,
  store: Store,
  games: readonly GameEntry[],
  actions: PassPageActions,
): PassPage {
  const status = h('p', { class: 'pass__status', role: 'status' });
  const top = h('div', { class: 'pass__top' });
  const cabinetSlot = h('div', { class: 'pass-cabinet__shelves' });
  const cabinetCount = h('p', { class: 'pass-section__note' });
  const columns = h('div', { class: 'pass__columns' });
  let cabinet: BadgeCabinet | null = null;
  let visible = false;
  const history = buildPlayHistory(games, (message) => (status.textContent = message));

  const element = h(
    'section',
    { class: 'pass', hidden: true, tabindex: -1, 'aria-label': 'Arcade Pass' },
    h(
      'div',
      { class: 'pass__bar' },
      h(
        'a',
        { class: 'pass__back', href: routeToHash({ view: 'lobby' }) },
        icon(ICONS.back),
        'The Hall',
      ),
    ),
    status,
    top,
    h(
      'section',
      { class: 'pass-section pass-cabinet', 'aria-labelledby': 'pass-cabinet-title' },
      h(
        'div',
        { class: 'pass-section__head' },
        h('h2', { class: 'pass-section__title', id: 'pass-cabinet-title' }, 'Badge cabinet'),
        cabinetCount,
      ),
      cabinetSlot,
    ),
    columns,
    buildSafekeeping(actions),
    history.element,
  );

  const render = () => {
    top.replaceChildren(
      ...[
        buildStorageNotice(pass),
        buildHero(pass, shelves.manifests, {
          editProfile: () => actions.editProfile('edit'),
          backUp: () => actions.backUp('export', 'backup'),
        }),
        buildRankRoad(pass.level),
      ].filter((node): node is HTMLElement => node !== null),
    );
    columns.replaceChildren(
      h(
        'div',
        { class: 'pass__column' },
        buildGameStats(pass, shelves),
        buildRewards(pass, shelves),
      ),
      buildFeed(pass, shelves),
    );
    const earned = shelves.manifests.reduce(
      (total, manifest) =>
        total + Object.keys(pass.profile.games[manifest.game]?.badges ?? {}).length,
      0,
    );
    const total = shelves.manifests.reduce((sum, manifest) => sum + manifest.badges.length, 0);
    cabinetCount.textContent = total > 0 ? `${earned} of ${total} earned` : '';
  };

  pass.subscribe(() => {
    if (visible) render();
  });

  return {
    element,
    show() {
      if (visible) return;
      visible = true;
      element.hidden = false;
      document.title = 'Arcade Pass · NeoArcade';
      render();
      history.refresh();
      cabinet = buildBadgeCabinet({
        pass,
        manifests: shelves.manifests,
        games: shelves.games,
        newSince: store.get<string | null>(SEEN_KEY, null),
      });
      cabinetSlot.replaceChildren(cabinet.element);
      window.scrollTo({ top: 0 });
    },
    hide() {
      if (!visible) return;
      visible = false;
      element.hidden = true;
      status.textContent = '';
      // Badges earned from now on count as new on the next visit.
      store.set(SEEN_KEY, new Date().toISOString());
      cabinet?.dispose();
      cabinet = null;
    },
    announce(message) {
      status.textContent = message;
    },
    focusAction(action) {
      element.querySelector<HTMLElement>(`[data-pass-action="${action}"]`)?.focus();
    },
  };
}

function buildSafekeeping(actions: PassPageActions): HTMLElement {
  const button = (label: string, iconMarkup: string, action: string, onClick: () => void) => {
    const element = h(
      'button',
      { class: 'button', type: 'button', 'data-pass-action': action },
      icon(iconMarkup),
      label,
    );
    element.addEventListener('click', onClick);
    return element;
  };
  return h(
    'section',
    { class: 'pass-section pass-safe', 'aria-labelledby': 'pass-safe-title' },
    h(
      'div',
      { class: 'pass-safe__text' },
      h('h2', { class: 'pass-section__title', id: 'pass-safe-title' }, 'Keep your Pass safe'),
      h(
        'p',
        {},
        'Your Pass lives only in this browser: no account, nothing sent anywhere. Back it up as a code or a file to move it to another device, or to keep it safe before clearing your browser.',
      ),
    ),
    h(
      'div',
      { class: 'pass-safe__actions' },
      button('Back up', ICONS.download, 'safe-backup', () =>
        actions.backUp('export', 'safe-backup'),
      ),
      button('Restore', ICONS.restore, 'safe-restore', () =>
        actions.backUp('import', 'safe-restore'),
      ),
      button('Start over', ICONS.erase, 'safe-reset', () => actions.startOver('safe-reset')),
    ),
  );
}

/** What the Hall remembers for its "Continue playing" row, and the way to forget it. */
function buildPlayHistory(games: readonly GameEntry[], announce: (message: string) => void) {
  const summary = h('p', {});
  const clear = h(
    'button',
    { class: 'button', type: 'button', 'data-pass-action': 'clear-history' },
    icon(ICONS.erase),
    'Clear history',
  );
  const element = h(
    'section',
    { class: 'pass-section pass-safe pass-history', 'aria-labelledby': 'pass-history-title' },
    h(
      'div',
      { class: 'pass-safe__text' },
      h('h2', { class: 'pass-section__title', id: 'pass-history-title' }, 'Play history'),
      summary,
    ),
    h('div', { class: 'pass-safe__actions' }, clear),
  );

  const refresh = () => {
    const plays = recentPlays().filter((play) => games.some((game) => game.slug === play.game));
    clear.disabled = plays.length === 0;
    summary.textContent =
      plays.length === 0
        ? 'Nothing to remember yet. The modes you play show up in the lobby under Continue playing, one click from where you left off.'
        : `The lobby remembers the last ${plays.length === 1 ? 'mode' : `${plays.length} modes`} you played, so Continue playing can take you straight back, and counts your games for the ‘Most played’ order. Clearing it leaves your Pass and your daily results as they are.`;
  };

  clear.addEventListener('click', () => {
    clearPlays();
    refresh();
    announce('Your play history is cleared. Continue playing fills up again as you play.');
  });

  return { element, refresh };
}
