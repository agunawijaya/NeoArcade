import type { GameEntry } from './catalog';
import type { DocKind } from './routes';
import { routeToHash } from './routes';

// Port docs are bundled into the Hall at build time: Markdown is fetched lazily
// per document, and the screenshots they show get their own hashed URLs.
const markdownFiles = import.meta.glob<string>('../../ports/*/docs/*.md', {
  query: '?raw',
  import: 'default',
});
const mediaFiles = import.meta.glob<string>('../../ports/*/media/*.{png,jpg,jpeg,webp,gif,svg}', {
  query: '?url',
  import: 'default',
  eager: true,
});

const toRepoPath = (globKey: string) => globKey.replace(/^(\.\.\/)+/, '');
const markdownByPath = new Map(
  Object.entries(markdownFiles).map(([key, load]) => [toRepoPath(key), load]),
);
const mediaByPath = new Map(Object.entries(mediaFiles).map(([key, url]) => [toRepoPath(key), url]));

export function docPath(game: GameEntry, doc: DocKind): string {
  const file = doc === 'about' ? game.docs.about : game.docs.howToPlay;
  return `ports/${game.slug}/${file.replace(/^\.\//, '')}`;
}

/** The Markdown of a document, or null if the port has not written it. */
export async function loadDoc(repoPath: string): Promise<string | null> {
  const load = markdownByPath.get(repoPath);
  return load ? load() : null;
}

export function mediaUrl(repoPath: string): string | null {
  return mediaByPath.get(repoPath) ?? null;
}

/** Hall route for any player-facing doc of any game, so docs can link to each other. */
export function docRouteFinder(games: readonly GameEntry[]) {
  const routes = new Map<string, string>();
  for (const game of games) {
    for (const doc of ['how-to-play', 'about'] as const) {
      routes.set(docPath(game, doc), routeToHash({ view: 'doc', slug: game.slug, doc }));
    }
  }
  return (repoPath: string) => routes.get(repoPath) ?? null;
}
