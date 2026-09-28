/**
 * Saved profiles carry a version number. When the shape changes, bump
 * PROFILE_VERSION and add a step here that turns the previous version into
 * the new one; loading runs every step in order, so a profile from any
 * earlier release arrives in today's shape. Steps receive plain JSON and must
 * not assume anything they did not write themselves, since sanitising only
 * happens once the last step has run.
 *
 *   2: (v1) => ({ ...v1, version: 2, look: { ...v1.look, pet: 'none' } }),
 */
export const PROFILE_VERSION = 1;

type Json = Record<string, unknown>;

/** Step n upgrades a version-n profile to version n + 1. */
export type MigrationSteps = Readonly<Record<number, (older: Json) => Json>>;

export const MIGRATIONS: MigrationSteps = {};

export type MigrationResult =
  | { ok: true; data: Json; fromVersion: number }
  | { ok: false; reason: 'not-a-profile' | 'missing-step' }
  | { ok: false; reason: 'newer-version'; version: number };

export function migrateProfile(
  raw: unknown,
  steps: MigrationSteps = MIGRATIONS,
  targetVersion: number = PROFILE_VERSION,
): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'not-a-profile' };
  }
  const fromVersion = (raw as Json).version;
  if (typeof fromVersion !== 'number' || !Number.isInteger(fromVersion) || fromVersion < 1) {
    return { ok: false, reason: 'not-a-profile' };
  }
  // A profile from a newer release can't be read safely; leave it untouched.
  if (fromVersion > targetVersion) {
    return { ok: false, reason: 'newer-version', version: fromVersion };
  }

  let data = raw as Json;
  for (let version = fromVersion; version < targetVersion; version++) {
    const step = steps[version];
    if (!step) return { ok: false, reason: 'missing-step' };
    data = { ...step(data), version: version + 1 };
  }
  return { ok: true, data, fromVersion };
}
