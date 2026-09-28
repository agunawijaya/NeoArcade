import { BADGE_TIERS, type BadgeDefinition, type BadgeTier, type PassManifest } from './manifest';
import type { GameRecord, Profile } from './profile';

export interface BadgeTally {
  unlocked: number;
  total: number;
  byTier: Record<BadgeTier, { unlocked: number; total: number }>;
}

/** How much of a game's cabinet the player has filled. */
export function tallyBadges(manifest: PassManifest, record: GameRecord | undefined): BadgeTally {
  const byTier = Object.fromEntries(
    BADGE_TIERS.map((tier) => [tier, { unlocked: 0, total: 0 }]),
  ) as BadgeTally['byTier'];
  let unlocked = 0;
  for (const badge of manifest.badges) {
    byTier[badge.tier].total += 1;
    if (record?.badges[badge.id]) {
      byTier[badge.tier].unlocked += 1;
      unlocked += 1;
    }
  }
  return { unlocked, total: manifest.badges.length, byTier };
}

/** A game's badge count once the player has played it, e.g. for "7 / 24" on its card. */
export function playedTally(
  profile: Profile,
  manifest: PassManifest | undefined,
): BadgeTally | null {
  const record = profile.games[manifest?.game ?? ''];
  return manifest && record ? tallyBadges(manifest, record) : null;
}

export interface BadgeStanding {
  badge: BadgeDefinition;
  unlockedAt: string | null;
  /** Count so far, for badges with a target. */
  progress: number;
}

export function badgeStandings(
  manifest: PassManifest,
  record: GameRecord | undefined,
): BadgeStanding[] {
  return manifest.badges.map((badge) => ({
    badge,
    unlockedAt: record?.badges[badge.id] ?? null,
    progress: Math.min(badge.target ?? 0, record?.progress[badge.id] ?? 0),
  }));
}
