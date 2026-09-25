/**
 * The Hall keeps its state in the URL hash so the back button, reloads and
 * shared links all land in the right place:
 *
 *   #/                             the lobby
 *   #/games/<slug>                 the lobby with a game's detail panel open
 *   #/games/<slug>/how-to-play     a game's player guide
 *   #/games/<slug>/about           a game's brochure
 */
export type DocKind = 'how-to-play' | 'about';

export type Route =
  { view: 'lobby' } | { view: 'game'; slug: string } | { view: 'doc'; slug: string; doc: DocKind };

const DOC_KINDS: readonly DocKind[] = ['how-to-play', 'about'];

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [section, slug, doc] = parts;
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
    case 'game':
      return `#/games/${encodeURIComponent(route.slug)}`;
    case 'doc':
      return `#/games/${encodeURIComponent(route.slug)}/${route.doc}`;
  }
}
