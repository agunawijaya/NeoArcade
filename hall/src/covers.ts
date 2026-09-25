import type { CoverDefinition } from './cover-api';
import { fallbackCover } from './fallback-cover';

// Every file in hall/covers/ is a cover, loaded only when a cabinet shows it.
const coverModules = import.meta.glob<{ default: CoverDefinition }>('../covers/*.ts');

const coversById = new Map(
  Object.entries(coverModules).map(([path, load]) => [coverIdFromPath(path), load]),
);

export function coverIdFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.ts$/, '');
}

/** The registered cover, or the generic attract-mode screen if it is missing or broken. */
export async function loadCover(id: string): Promise<CoverDefinition> {
  const load = coversById.get(id);
  if (!load) return fallbackCover;
  try {
    const module = await load();
    return typeof module.default?.create === 'function' ? module.default : fallbackCover;
  } catch (error) {
    console.error(`Cover "${id}" failed to load; showing the generic one.`, error);
    return fallbackCover;
  }
}
