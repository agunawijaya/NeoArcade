import { recordEmblem, type EmblemDrawer } from './emblem-pen';
import { isSlug, isStatKey } from './profile';

export { recordEmblem, type EmblemDrawer, type EmblemInk, type EmblemPen } from './emblem-pen';
export type { EmblemShape, EmblemStyle } from './emblem-pen';
export { glyphs } from './glyphs';

/**
 * What a game offers on the Arcade Pass: its badges, the cosmetics those
 * badges or arcade levels unlock, and the stats it keeps. Each port declares
 * one in `ports/<slug>/pass.manifest.ts`; the Hall reads them all at build
 * time, so it can show locked badges without loading the game.
 *
 * A manifest file imports only from '@shared/pass/manifest', which has no
 * DOM or CSS in it, so the build can load and check it in Node.
 */
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'secret';

export const BADGE_TIERS: readonly BadgeTier[] = ['bronze', 'silver', 'gold', 'secret'];

/** XP a badge is worth unless its manifest says otherwise. */
export const TIER_XP: Readonly<Record<BadgeTier, number>> = {
  bronze: 25,
  silver: 60,
  gold: 150,
  secret: 80,
};

export const TIER_NAMES: Readonly<Record<BadgeTier, string>> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  secret: 'Secret',
};

export const MAX_BADGE_XP = 300;
const MAX_TARGET = 1_000_000;
const MAX_LEVEL = 100;

export interface BadgeDefinition<Id extends string = string> {
  /** kebab-case, unique within the game. */
  id: Id;
  name: string;
  /** Shown once unlocked: what the player did, with a line of flavour. */
  description: string;
  /** How to earn it, shown while locked. Required, except for secret badges, which never show it. */
  hint?: string;
  tier: BadgeTier;
  emblem: EmblemDrawer;
  /** Defaults to TIER_XP for the tier. */
  xp?: number;
  /** Makes it a counted badge that unlocks when its progress reaches this number. */
  target?: number;
}

export type CosmeticUnlock<BadgeId extends string = string> =
  { level: number } | { badge: BadgeId };

export interface CosmeticDefinition<Id extends string = string, BadgeId extends string = string> {
  id: Id;
  name: string;
  /** What kind of thing it is in the game, e.g. "Banana skin". */
  kind: string;
  /** An arcade level to reach, or one of this game's badges. */
  unlock: CosmeticUnlock<BadgeId>;
}

export interface StatDefinition<Key extends string = string> {
  key: Key;
  /** How the profile names it, e.g. "Matches won". */
  label: string;
  /** A word shown after the number, e.g. "m" or "throws". */
  unit?: string;
}

export interface PassManifest<
  BadgeId extends string = string,
  CosmeticId extends string = string,
  StatKey extends string = string,
> {
  /** The port's slug. */
  game: string;
  badges: readonly BadgeDefinition<BadgeId>[];
  cosmetics: readonly CosmeticDefinition<CosmeticId, BadgeId>[];
  stats: readonly StatDefinition<StatKey>[];
}

/**
 * Declares a manifest. The ids become literal types, so a game that calls
 * `pass.unlock('sunburm')` gets a type error instead of a silent no-op.
 */
export function definePassManifest<
  const BadgeId extends string,
  const CosmeticId extends string = never,
  const StatKey extends string = never,
>(manifest: {
  game: string;
  badges: readonly BadgeDefinition<BadgeId>[];
  cosmetics?: readonly CosmeticDefinition<CosmeticId, NoInfer<BadgeId>>[];
  stats?: readonly StatDefinition<StatKey>[];
}): PassManifest<BadgeId, CosmeticId, StatKey> {
  return { ...manifest, cosmetics: manifest.cosmetics ?? [], stats: manifest.stats ?? [] };
}

export function badgeXp(badge: BadgeDefinition): number {
  return badge.xp ?? TIER_XP[badge.tier];
}

/** Everything wrong with a manifest, as sentences; empty when it is fine. */
export function manifestProblems(value: unknown): string[] {
  if (!isObject(value)) return ['A manifest must be an object made with definePassManifest().'];
  const problems: string[] = [];
  const game = value.game;
  if (typeof game !== 'string' || !isSlug(game)) problems.push('`game` must be the port slug.');

  const badges = Array.isArray(value.badges) ? value.badges : null;
  if (!badges || badges.length === 0) problems.push('`badges` must list at least one badge.');
  const badgeIds = new Set<string>();
  for (const [index, badge] of (badges ?? []).entries()) {
    const label = isObject(badge) && typeof badge.id === 'string' ? badge.id : `#${index + 1}`;
    for (const problem of badgeProblems(badge)) problems.push(`badge ${label}: ${problem}`);
    if (isObject(badge) && typeof badge.id === 'string') {
      if (badgeIds.has(badge.id)) problems.push(`badge ${label}: the id is used twice.`);
      badgeIds.add(badge.id);
    }
  }

  const cosmeticIds = new Set<string>();
  for (const [index, cosmetic] of listOrEmpty(value.cosmetics, 'cosmetics', problems).entries()) {
    const label =
      isObject(cosmetic) && typeof cosmetic.id === 'string' ? cosmetic.id : `#${index + 1}`;
    for (const problem of cosmeticProblems(cosmetic, badgeIds)) {
      problems.push(`cosmetic ${label}: ${problem}`);
    }
    if (isObject(cosmetic) && typeof cosmetic.id === 'string') {
      if (cosmeticIds.has(cosmetic.id)) problems.push(`cosmetic ${label}: the id is used twice.`);
      cosmeticIds.add(cosmetic.id);
    }
  }

  const statKeys = new Set<string>();
  for (const [index, stat] of listOrEmpty(value.stats, 'stats', problems).entries()) {
    const label = isObject(stat) && typeof stat.key === 'string' ? stat.key : `#${index + 1}`;
    if (!isObject(stat) || typeof stat.key !== 'string' || !isStatKey(stat.key)) {
      problems.push(`stat ${label}: \`key\` must be a camelCase or kebab-case word.`);
      continue;
    }
    if (!isText(stat.label, 40)) problems.push(`stat ${label}: \`label\` is missing or too long.`);
    if (stat.unit !== undefined && !isText(stat.unit, 12)) {
      problems.push(`stat ${label}: \`unit\` must be a short word.`);
    }
    if (statKeys.has(stat.key)) problems.push(`stat ${label}: the key is used twice.`);
    statKeys.add(stat.key);
  }
  return problems;
}

function badgeProblems(badge: unknown): string[] {
  if (!isObject(badge)) return ['must be an object.'];
  const problems: string[] = [];
  if (typeof badge.id !== 'string' || !isSlug(badge.id)) problems.push('`id` must be kebab-case.');
  if (!isText(badge.name, 40)) problems.push('`name` is missing or longer than 40 characters.');
  if (!isText(badge.description, 160)) {
    problems.push('`description` is missing or longer than 160 characters.');
  }
  if (!BADGE_TIERS.includes(badge.tier as BadgeTier)) {
    problems.push(`\`tier\` must be one of ${BADGE_TIERS.join(', ')}.`);
  }
  if (badge.tier !== 'secret' && !isText(badge.hint, 120)) {
    problems.push(
      '`hint` is missing or longer than 120 characters (only secret badges go without).',
    );
  }
  if (badge.xp !== undefined && !isWhole(badge.xp, 0, MAX_BADGE_XP)) {
    problems.push(`\`xp\` must be a whole number from 0 to ${MAX_BADGE_XP}.`);
  }
  if (badge.target !== undefined && !isWhole(badge.target, 2, MAX_TARGET)) {
    problems.push('`target` must be a whole number of 2 or more.');
  }
  problems.push(...emblemProblems(badge.emblem));
  return problems;
}

function emblemProblems(emblem: unknown): string[] {
  if (typeof emblem !== 'function') return ['`emblem` must be a drawing function.'];
  try {
    return recordEmblem(emblem as EmblemDrawer).length > 0 ? [] : ['`emblem` draws nothing.'];
  } catch (error) {
    return [`\`emblem\` throws: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function cosmeticProblems(cosmetic: unknown, badgeIds: Set<string>): string[] {
  if (!isObject(cosmetic)) return ['must be an object.'];
  const problems: string[] = [];
  if (typeof cosmetic.id !== 'string' || !isSlug(cosmetic.id)) {
    problems.push('`id` must be kebab-case.');
  }
  if (!isText(cosmetic.name, 40)) problems.push('`name` is missing or too long.');
  if (!isText(cosmetic.kind, 30)) problems.push('`kind` is missing or too long.');
  const unlock = cosmetic.unlock;
  if (isObject(unlock) && 'level' in unlock) {
    if (!isWhole(unlock.level, 1, MAX_LEVEL)) problems.push('`unlock.level` must be 1 or more.');
  } else if (isObject(unlock) && 'badge' in unlock) {
    if (typeof unlock.badge !== 'string' || !badgeIds.has(unlock.badge)) {
      problems.push('`unlock.badge` must name one of this manifest’s badges.');
    }
  } else {
    problems.push('`unlock` must be { level } or { badge }.');
  }
  return problems;
}

function listOrEmpty(value: unknown, field: string, problems: string[]): unknown[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  problems.push(`\`${field}\` must be a list.`);
  return [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isWhole(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
