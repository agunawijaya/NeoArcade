import type { CabinetGame, PassManifest } from '@shared/pass';
import { manifestProblems } from '@shared/pass/manifest';
import type { GameEntry } from './catalog';

/**
 * Every port's Arcade Pass manifest, bundled at build time so the Hall can
 * show badges for games the player has not opened yet. A manifest that fails
 * validation is skipped with a warning, like a bad catalog entry; the build
 * and the tests refuse it outright (scripts/check-pass-manifests.ts).
 */
const portManifests = import.meta.glob<PassManifest>('../../ports/*/pass.manifest.ts', {
  eager: true,
  import: 'default',
});

export interface PassShelves {
  manifests: PassManifest[];
  /** Titles and colours for the cabinet's shelves, in catalog order. */
  games: CabinetGame[];
}

export async function loadPassShelves(catalog: readonly GameEntry[]): Promise<PassShelves> {
  const manifests = validManifests(portManifests);
  const games: CabinetGame[] = catalog.map(({ slug, title, accent }) => ({ slug, title, accent }));

  // The dev server adds the Pass Lab's pretend game; production never sees it.
  if (import.meta.env.DEV) {
    const lab = import.meta.glob<PassManifest>('../dev/pass-lab/lab.manifest.ts', {
      import: 'default',
    });
    for (const load of Object.values(lab)) manifests.push(await load());
    games.push({ slug: 'pass-lab', title: 'Pass Lab', accent: '#7cf29c' });
  }
  return { manifests, games };
}

function validManifests(modules: Record<string, PassManifest>): PassManifest[] {
  const valid: PassManifest[] = [];
  for (const [path, manifest] of Object.entries(modules)) {
    const folder = /ports\/([^/]+)\/pass\.manifest\.ts$/.exec(path)?.[1];
    const problems = manifestProblems(manifest);
    if (manifest?.game !== folder) {
      problems.push(`\`game\` must be "${folder}", the port's folder.`);
    }
    if (problems.length > 0) {
      console.warn(`ports/${folder}/pass.manifest.ts is skipped:\n- ${problems.join('\n- ')}`);
      continue;
    }
    valid.push(manifest);
  }
  return valid;
}
