import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCatalog, type GameEntry } from '../hall/src/catalog';
import { projectRoot } from './vite-shared';

/**
 * Checks hall/catalog.json before the build. The Hall would skip a bad entry
 * with a warning at runtime; the build refuses it instead: every field
 * (categories from the fixed list, origin, daily), and every file an entry
 * points at.
 *
 *   npx tsx scripts/check-catalog.ts
 */
export function catalogProblems(root: string = projectRoot): string[] {
  const raw: unknown = JSON.parse(readFileSync(join(root, 'hall', 'catalog.json'), 'utf8'));
  const { games, problems } = parseCatalog(raw);
  for (const game of games) {
    problems.push(...fileProblems(root, game).map((problem) => `${game.slug}: ${problem}`));
  }
  return problems;
}

function fileProblems(root: string, game: GameEntry): string[] {
  const port = join(root, 'ports', game.slug);
  const problems: string[] = [];
  const need = (file: string, what: string) => {
    if (!existsSync(file)) problems.push(`${what} is missing`);
  };
  need(join(port, 'index.html'), `ports/${game.slug}/index.html`);
  need(join(root, 'hall', 'covers', `${game.cover}.ts`), `the cover hall/covers/${game.cover}.ts`);
  need(join(port, game.docs.howToPlay), game.docs.howToPlay);
  need(join(port, game.docs.about), game.docs.about);
  for (const screen of game.screens ?? []) need(join(port, screen.image), screen.image);
  if (game.path !== `${game.slug}/`) problems.push(`path must be "${game.slug}/"`);

  // The Hall numbers each daily itself; a launch date that differs from the
  // game's would show everyone the wrong number.
  if (game.daily && !sourceMentions(join(port, 'src'), `'${game.daily.launch}'`)) {
    problems.push(`daily.launch ${game.daily.launch} does not appear in the game's source`);
  }
  return problems;
}

function sourceMentions(folder: string, text: string): boolean {
  if (!existsSync(folder)) return false;
  return readdirSync(folder, { withFileTypes: true }).some((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sourceMentions(path, text);
    return /(?<!\.test)\.ts$/.test(entry.name) && readFileSync(path, 'utf8').includes(text);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = catalogProblems();
  for (const problem of problems) console.error(`hall/catalog.json: ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log('hall/catalog.json checked.');
}
