import type { GameEntry } from './catalog';
import { inkOn } from './colour';
import { renderDiagrams } from './diagrams';
import { docPath, docRouteFinder, loadDoc, mediaUrl } from './docs-source';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { gameUrl, launchOnClick } from './launch';
import { renderMarkdown } from './markdown';
import { routeToHash, type DocKind } from './routes';

/** A game's player guide or brochure, rendered as a page inside the Hall. */
export interface DocsView {
  element: HTMLElement;
  show(game: GameEntry, doc: DocKind): Promise<void>;
  hide(): void;
  /** Draws the open page again, e.g. so its diagrams follow a theme change. */
  redraw(): void;
}

const DOC_LABELS: Record<DocKind, string> = { 'how-to-play': 'How to play', about: 'About' };

export function createDocsView(
  games: readonly GameEntry[],
  theme: () => 'light' | 'dark',
): DocsView {
  const findDocRoute = docRouteFinder(games);
  const bar = h('div', { class: 'docs__bar-inner' });
  const article = h('article', { class: 'prose' });
  const element = h(
    'section',
    { class: 'docs', hidden: true, 'aria-live': 'polite' },
    h('header', { class: 'docs__bar' }, bar),
    article,
  );
  let showing = '';
  let current: { game: GameEntry; doc: DocKind } | null = null;

  // In-page anchors can't use the URL hash, which the router owns; scroll instead.
  article.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-anchor]');
    if (!link) return;
    event.preventDefault();
    const target = article.querySelector(`[id="${CSS.escape(link.dataset.anchor ?? '')}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const renderBar = (game: GameEntry, doc: DocKind) => {
    const tabs = (Object.keys(DOC_LABELS) as DocKind[]).map((kind) =>
      h(
        'a',
        {
          class: 'docs__tab',
          href: routeToHash({ view: 'doc', slug: game.slug, doc: kind }),
          'aria-current': kind === doc ? 'page' : false,
        },
        DOC_LABELS[kind],
      ),
    );
    const play = h(
      'a',
      { class: 'button button--play button--small', href: gameUrl(game) },
      icon(ICONS.play),
      'Play',
    );
    launchOnClick(play);
    bar.replaceChildren(
      h(
        'a',
        { class: 'docs__back', href: routeToHash({ view: 'game', slug: game.slug }) },
        icon(ICONS.back),
        h('span', { class: 'docs__game' }, game.title),
      ),
      h('nav', { class: 'docs__tabs', 'aria-label': 'Guides' }, ...tabs),
      play,
    );
  };

  return {
    element,
    async show(game, doc) {
      const key = `${game.slug}/${doc}`;
      current = { game, doc };
      element.style.setProperty('--accent', game.accent);
      element.style.setProperty('--on-accent', inkOn(game.accent));
      element.hidden = false;
      document.title = `${DOC_LABELS[doc]} · ${game.title} · NeoArcade`;
      if (showing === key) return;
      showing = key;

      renderBar(game, doc);
      article.replaceChildren(h('p', { class: 'prose__loading' }, 'Loading…'));
      window.scrollTo({ top: 0 });

      const path = docPath(game, doc);
      const markdown = await loadDoc(path);
      if (showing !== key) return;
      if (markdown === null) {
        article.replaceChildren(
          h('h1', {}, DOC_LABELS[doc]),
          h(
            'p',
            {},
            'This page has not been written yet. The game itself is ready to play, though.',
          ),
        );
        return;
      }
      article.innerHTML = renderMarkdown(markdown, {
        docPath: path,
        selfHref: routeToHash({ view: 'doc', slug: game.slug, doc }),
        imageUrl: mediaUrl,
        docHref: findDocRoute,
      });
      await renderDiagrams(article, game.accent, theme());
    },
    hide() {
      element.hidden = true;
      showing = '';
      current = null;
    },
    redraw() {
      if (!current || element.hidden) return;
      const scrolled = window.scrollY;
      showing = '';
      void this.show(current.game, current.doc).then(() => window.scrollTo({ top: scrolled }));
    },
  };
}
