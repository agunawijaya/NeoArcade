import { formatPlayers, type GameEntry } from './catalog';
import { inkOn } from './colour';
import { playCover, type CoverPlayer } from './cover-player';
import { loadCover } from './covers';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { gameUrl, launchOnClick } from './launch';
import { routeToHash } from './routes';

/** The panel that opens over the lobby when a cabinet is chosen. */
export interface DetailPanel {
  show(game: GameEntry): void;
  hide(): void;
  readonly openSlug: string | null;
  /** Follows the Play button, as if it were clicked. */
  play(): void;
}

const addedDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

export function createDetailPanel(onDismiss: () => void): DetailPanel {
  const dialog = h('dialog', { class: 'detail', 'aria-labelledby': 'detail-title' });
  document.body.append(dialog);

  let openSlug: string | null = null;
  let cover: CoverPlayer | null = null;
  let playLink: HTMLAnchorElement | null = null;

  // Esc and clicks outside the panel ask the router to go back to the lobby,
  // so the URL and the browser history stay the source of truth.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    onDismiss();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) onDismiss();
  });

  const render = (game: GameEntry) => {
    const canvas = h('canvas', { class: 'detail__canvas' });
    const closeButton = h(
      'button',
      { class: 'detail__close', type: 'button', 'aria-label': 'Close' },
      icon(ICONS.close),
    );
    closeButton.addEventListener('click', onDismiss);

    playLink = h(
      'a',
      { class: 'button button--play', href: gameUrl(game) },
      icon(ICONS.play),
      'Play',
    );
    launchOnClick(playLink);

    const { original } = game;
    const origin = [original.author, original.year, original.platform].filter(Boolean).join(' · ');

    dialog.style.setProperty('--accent', game.accent);
    dialog.style.setProperty('--on-accent', inkOn(game.accent));
    dialog.replaceChildren(
      h(
        'div',
        { class: 'detail__panel' },
        closeButton,
        h('div', { class: 'detail__screen' }, canvas, h('span', { class: 'detail__glass' })),
        h(
          'div',
          { class: 'detail__info' },
          h('p', { class: 'detail__eyebrow' }, game.genres.join(' · ')),
          h('h2', { class: 'detail__title', id: 'detail-title' }, game.title),
          h('p', { class: 'detail__tagline' }, game.tagline),
          h(
            'dl',
            { class: 'detail__facts' },
            fact('Based on', h('span', {}, h('strong', {}, original.title), h('br'), origin)),
            fact('Players', formatPlayers(game.players)),
            fact('Added', addedDate.format(new Date(game.added))),
          ),
          h(
            'div',
            { class: 'detail__actions' },
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
              {
                class: 'button',
                href: routeToHash({ view: 'doc', slug: game.slug, doc: 'about' }),
              },
              icon(ICONS.about),
              'About',
            ),
          ),
          h('p', { class: 'detail__hint', 'aria-hidden': 'true' }, 'Enter to play · Esc to close'),
        ),
      ),
    );

    void loadCover(game.cover).then((definition) => {
      if (openSlug !== game.slug) return;
      cover = playCover(canvas, definition, { seed: 1, accent: game.accent, title: game.title });
      cover.setAlive(true);
    });
  };

  return {
    show(game) {
      if (openSlug === game.slug && dialog.open) return;
      cover?.dispose();
      cover = null;
      openSlug = game.slug;
      render(game);
      if (!dialog.open) dialog.showModal();
      playLink?.focus();
    },
    hide() {
      openSlug = null;
      cover?.dispose();
      cover = null;
      if (dialog.open) dialog.close();
    },
    get openSlug() {
      return openSlug;
    },
    play() {
      playLink?.click();
    },
  };
}

function fact(term: string, description: Node | string) {
  return h('div', { class: 'detail__fact' }, h('dt', {}, term), h('dd', {}, description));
}
