import { isCategoryId, type CategoryId } from './categories';

/**
 * The Hall keeps its state in the URL hash so the back button, reloads and
 * shared links all land in the right place:
 *
 *   #/                             the lobby
 *   #/games/<slug>                 a game's detail panel, over the page it was opened from
 *   #/games/<slug>/how-to-play     a game's player guide
 *   #/games/<slug>/about           a game's brochure
 *   #/category/<id>                every game in one category
 *   #/timeline                     the Origins timeline
 *   #/timeline/<slug>              the timeline with one original picked
 *   #/pass                         the player's Arcade Pass
 */
export type DocKind = 'how-to-play' | 'about';

export type Route =
  | { view: 'lobby' }
  | { view: 'pass' }
  | { view: 'game'; slug: string }
  | { view: 'doc'; slug: string; doc: DocKind }
  | { view: 'category'; category: CategoryId }
  | { view: 'timeline'; slug?: string };

const DOC_KINDS: readonly DocKind[] = ['how-to-play', 'about'];

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [section, slug, doc] = parts;
  if (section === 'pass') return { view: 'pass' };
  if (section === 'timeline') return slug ? { view: 'timeline', slug } : { view: 'timeline' };
  if (section === 'category' && isCategoryId(slug)) return { view: 'category', category: slug };
  if (section !== 'games' || !slug) return { view: 'lobby' };
  if (doc === undefined) return { view: 'game', slug };
  if ((DOC_KINDS as readonly string[]).includes(doc) && parts.length === 3) {
    return { view: 'doc', slug, doc: doc as DocKind };
  }
  return { view: 'game', slug };
}

export function routeToHash(route: Route): string {
  switch (route.view) {
    case 'lobby':
      return '#/';
    case 'pass':
      return '#/pass';
    case 'game':
      return `#/games/${encodeURIComponent(route.slug)}`;
    case 'doc':
      return `#/games/${encodeURIComponent(route.slug)}/${route.doc}`;
    case 'category':
      return `#/category/${route.category}`;
    case 'timeline':
      return route.slug ? `#/timeline/${encodeURIComponent(route.slug)}` : '#/timeline';
  }
}
