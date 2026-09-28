import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { manifestProblems } from '../shared/pass/manifest';
import { projectRoot } from './vite-shared';

/**
 * Checks every Arcade Pass manifest before the build: each port's
 * `pass.manifest.ts` and the Pass Lab's. A manifest must pass
 * manifestProblems(), name its own port folder as `game`, and import nothing
 * but '@shared/pass/manifest', so the Hall can bundle it without pulling in
 * game code.
 *
 *   npx tsx scripts/check-pass-manifests.ts
 */
const ALLOWED_IMPORT = '@shared/pass/manifest';
const LAB_MANIFEST = join('hall', 'dev', 'pass-lab', 'lab.manifest.ts');

export function manifestFiles(root: string = projectRoot): string[] {
  const portsDir = join(root, 'ports');
  const ports = existsSync(portsDir)
    ? readdirSync(portsDir)
        .map((slug) => join(portsDir, slug, 'pass.manifest.ts'))
        .filter((file) => existsSync(file))
    : [];
  const lab = join(root, LAB_MANIFEST);
  return existsSync(lab) ? [...ports, lab] : ports;
}

/** Every module a manifest imports that it should not. */
export function importProblems(source: string): string[] {
  const imported = [...source.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  return imported
    .filter((module) => module !== ALLOWED_IMPORT)
    .map((module) => `imports "${module}"; a manifest may only import from "${ALLOWED_IMPORT}".`);
}

export async function passManifestProblems(root: string = projectRoot): Promise<string[]> {
  const problems: string[] = [];
  for (const file of manifestFiles(root)) {
    const name = relative(root, file).replaceAll('\\', '/');
    const found = importProblems(readFileSync(file, 'utf8'));
    const module = (await import(pathToFileURL(file).href)) as { default?: unknown };
    found.push(...manifestProblems(module.default));
    const folder = /^ports\/([^/]+)\//.exec(name)?.[1];
    const game = (module.default as { game?: unknown } | undefined)?.game;
    if (folder && game !== folder) found.push(`\`game\` must be "${folder}", the port's folder.`);
    problems.push(...found.map((problem) => `${name}: ${problem}`));
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = await passManifestProblems();
  for (const problem of problems) console.error(problem);
  console.log(`${manifestFiles().length} Arcade Pass manifest(s) checked.`);
  if (problems.length > 0) process.exit(1);
}
