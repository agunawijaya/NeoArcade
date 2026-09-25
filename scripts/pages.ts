import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Page {
  /** Folder name; for a port this is also its slug and its URL segment. */
  name: string;
  /** Folder holding the page's index.html. */
  root: string;
  /** Where the built page goes. */
  outDir: string;
}

// Folder names the Hall's own build writes into dist/, so no port may use them.
const RESERVED_SLUGS = new Set(['assets', 'fonts', 'index.html']);

export function discoverPages(projectRoot: string): Page[] {
  const distDir = join(projectRoot, 'dist');
  const hall: Page = { name: 'hall', root: join(projectRoot, 'hall'), outDir: distDir };
  const portsDir = join(projectRoot, 'ports');
  if (!existsSync(portsDir)) return [hall];

  const ports = readdirSync(portsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(portsDir, entry.name, 'index.html')))
    .map((entry) => {
      if (RESERVED_SLUGS.has(entry.name)) {
        throw new Error(`ports/${entry.name} clashes with a folder the Hall build needs.`);
      }
      return {
        name: entry.name,
        root: join(portsDir, entry.name),
        outDir: join(distDir, entry.name),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return [hall, ...ports];
}
