/**
 * The Arcade Pass: one player profile across every NeoArcade game. Games
 * report what the player did; the Pass turns it into XP, levels, ranks and
 * badges, and the Hall shows it off. Everything stays in this browser.
 *
 *   import manifest from '../pass.manifest';
 *   import { connectPass, mountUnlockToasts } from '@shared/pass';
 *
 *   const pass = connectPass(manifest);
 *   const toasts = mountUnlockToasts(pass, { accent: '#ff8a3d' });
 *   pass.award(40, 'Won in Jakarta');
 *   if (sunHits >= 1) pass.progress('sunburn', { add: 1 });
 *   toasts.flush(); // between turns
 *
 * The integration guide is docs/ARCADE-PASS.md.
 */
export {
  connectPass,
  createArcadePass,
  openArcadePass,
  PROFILE_STORAGE_KEY,
  type ArcadePass,
  type AwardResult,
  type CosmeticUnlocked,
  type GamePass,
  type PassEvent,
  type PassHealth,
  type PassListener,
  type PassNotice,
  type PassOptions,
  type StatUpdate,
} from './pass';
export {
  badgeXp,
  BADGE_TIERS,
  definePassManifest,
  glyphs,
  manifestProblems,
  TIER_NAMES,
  TIER_XP,
  type BadgeDefinition,
  type BadgeTier,
  type CosmeticDefinition,
  type EmblemDrawer,
  type EmblemPen,
  type PassManifest,
  type StatDefinition,
} from './manifest';
export {
  levelForXp,
  levelProgress,
  nextRank,
  RANKS,
  rankForLevel,
  xpForLevel,
  type LevelProgress,
  type Rank,
  type RankId,
} from './levels';
export { cappedXp, DAILY_XP_BANDS, MAX_AWARD } from './daily-cap';
export * from './arcade-cosmetics';
export {
  cleanName,
  NAME_MAX_LENGTH,
  type FeedEntry,
  type GameRecord,
  type Profile,
} from './profile';
export { backupFileName, readBackup, summariseProfile, type BackupSummary } from './backup';
export { badgeStandings, playedTally, tallyBadges, type BadgeTally } from './tally';
export { drawAvatar } from './art/avatar';
export { drawBadge } from './art/badge';
export { drawRankEmblem } from './art/rank';
export { mountUnlockToasts, type UnlockToastOptions, type UnlockToasts } from './ui/toast';
export { buildBadgeCabinet, type BadgeCabinet, type CabinetGame } from './ui/cabinet';
