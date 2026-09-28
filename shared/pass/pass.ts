import { browserStorage, canPersist, createStore } from '../storage';
import {
  arcadeUnlocksBetween,
  isLookUnlocked,
  LOOK_OPTIONS,
  LOOK_SLOT_NAMES,
  type LookSlot,
  type PlayerLook,
} from './arcade-cosmetics';
import { backupFileText, encodeBackupCode } from './backup';
import { cappedXp, localDay, MAX_AWARD } from './daily-cap';
import { levelForXp, rankForLevel, type Rank } from './levels';
import { badgeXp, type BadgeDefinition, type PassManifest } from './manifest';
import {
  cleanName,
  cleanReason,
  emptyGameRecord,
  emptyProfile,
  FEED_LENGTH,
  loadProfile,
  type FeedEntry,
  type GameRecord,
  type Profile,
} from './profile';

export const PASS_NAMESPACE = 'pass';
const PROFILE_KEY = 'profile';
/** Where an unreadable profile is kept instead of being overwritten. */
const SET_ASIDE_KEY = 'profile-unreadable';
export const PROFILE_STORAGE_KEY = `neoarcade:${PASS_NAMESPACE}:${PROFILE_KEY}`;

/** Identical awards within this window share one line in the activity feed. */
const FEED_FOLD_MS = 2 * 60 * 60 * 1000;
const MAX_COUNT = 1_000_000_000;

/**
 * Whether progress is being saved:
 * - `unavailable`: the browser gives us no storage (private mode, blocked site data);
 * - `full`: storage refused the last write;
 * - `newer-version`: the saved profile comes from a newer NeoArcade, so it is left alone.
 * In every case the Pass keeps working in memory for this page.
 */
export type PassHealth = 'ok' | 'unavailable' | 'full' | 'newer-version';

/**
 * Something about the stored profile the player should hear about once:
 * `repaired` means damaged fields were reset; `set-aside` means the profile
 * could not be read at all and was kept under another key.
 */
export type PassNotice = 'repaired' | 'set-aside' | null;

export interface CosmeticUnlocked {
  /** The game offering it, or null for arcade-wide cosmetics. */
  game: string | null;
  id: string;
  name: string;
  /** "Headwear", "Banana skin"… */
  kind: string;
}

export type PassEvent =
  | { type: 'xp'; game: string; granted: number; asked: number; reason: string }
  | {
      type: 'badge';
      game: string;
      badge: BadgeDefinition;
      xp: number;
      /** Cosmetics this badge unlocks. */
      unlocks: CosmeticUnlocked[];
    }
  | {
      type: 'level';
      level: number;
      previousLevel: number;
      rank: Rank;
      /** True when this level-up also reached a new rank. */
      newRank: boolean;
      unlocks: CosmeticUnlocked[];
    }
  /** Saving started or stopped working. */
  | { type: 'health'; health: PassHealth }
  /** Anything else: a stat, a rename, an import, or a change made in another tab. */
  | { type: 'change' };

export type PassListener = (event: PassEvent) => void;

export interface AwardResult {
  /** XP added to the profile after the daily cap. */
  granted: number;
  asked: number;
  /** True once the game has passed today's full-rate XP. */
  reduced: boolean;
  level: number;
  levelUp: boolean;
}

export type StatUpdate = number | { add: number } | { max: number } | { min: number };

/** What a game uses: its own slice of the Pass, checked against its manifest. */
export interface GamePass<
  BadgeId extends string = string,
  CosmeticId extends string = string,
  StatKey extends string = string,
> {
  readonly game: string;
  readonly manifest: PassManifest<BadgeId, CosmeticId, StatKey>;
  /** The arcade level; games may use it to unlock their own cosmetics. */
  readonly level: number;
  /** Whether progress is being saved; the unlock toasts tell the player when it is not. */
  readonly health: PassHealth;
  /** XP for something the player did, with the reason shown in the activity feed. */
  award(xp: number, reason: string): AwardResult;
  /** Returns true only the first time. */
  unlock(badgeId: BadgeId): boolean;
  /**
   * Moves a counted badge towards its target: a number sets the count (it
   * never goes down), `{ add }` adds to it. Returns true if this unlocked it.
   */
  progress(badgeId: BadgeId, value: number | { add: number }): boolean;
  /** Sets or updates a stat for the profile; returns the new value. */
  stat(key: StatKey, update: StatUpdate): number;
  hasBadge(badgeId: BadgeId): boolean;
  progressOf(badgeId: BadgeId): number;
  statOf(key: StatKey): number | undefined;
  isUnlocked(cosmeticId: CosmeticId): boolean;
  subscribe(listener: PassListener): () => void;
}

/** The whole profile, as the Hall sees it. */
export interface ArcadePass {
  /** A snapshot; replaced (never mutated) on every change. */
  readonly profile: Readonly<Profile>;
  readonly level: number;
  readonly health: PassHealth;
  readonly notice: PassNotice;
  forGame<BadgeId extends string, CosmeticId extends string, StatKey extends string>(
    manifest: PassManifest<BadgeId, CosmeticId, StatKey>,
  ): GamePass<BadgeId, CosmeticId, StatKey>;
  subscribe(listener: PassListener): () => void;
  rename(name: string): void;
  /** Applies every unlocked choice in `look`; returns false if anything was locked or unknown. */
  dressUp(look: Partial<PlayerLook>): boolean;
  exportCode(): string;
  exportFile(): string;
  /** Replaces the profile, e.g. with one read by readBackup(). */
  restore(profile: Profile): void;
  reset(): void;
  dispose(): void;
}

export interface PassOptions {
  backend?: Storage | null;
  now?: () => Date;
  /** Follows changes made in other tabs through the `storage` event. */
  watchOtherTabs?: boolean;
}

export function createArcadePass({
  backend = browserStorage(),
  now = () => new Date(),
  watchOtherTabs = typeof window !== 'undefined',
}: PassOptions = {}): ArcadePass {
  const store = createStore(PASS_NAMESPACE, backend);
  const listeners = new Set<PassListener>();
  const manifests = new Map<string, PassManifest>();
  const warned = new Set<string>();
  let health: PassHealth = canPersist(backend) ? 'ok' : 'unavailable';
  let notice: PassNotice = null;
  let profile: Profile = readStoredProfile(true);

  function readStoredProfile(firstRead: boolean): Profile {
    const raw = store.get<unknown>(PROFILE_KEY, undefined);
    if (raw === undefined) {
      const damagedText = store.raw(PROFILE_KEY);
      if (damagedText === null) return emptyProfile(now());
      return setAside(damagedText);
    }
    const loaded = loadProfile(raw, now());
    if (loaded.status === 'loaded') {
      if (loaded.repaired && firstRead) notice = 'repaired';
      return loaded.profile;
    }
    if (loaded.status === 'newer-version') {
      health = 'newer-version';
      return firstRead ? emptyProfile(now()) : profile;
    }
    return setAside(raw);
  }

  // Nothing is ever silently thrown away: an unreadable profile moves aside first.
  function setAside(damaged: unknown): Profile {
    store.set(SET_ASIDE_KEY, damaged);
    notice = 'set-aside';
    return emptyProfile(now());
  }

  function save(next: Profile) {
    profile = next;
    if (health === 'newer-version') return;
    const before = health;
    const saved = store.set(PROFILE_KEY, next);
    if (saved) health = 'ok';
    else if (health === 'ok') health = 'full';
    if (health !== before) emit({ type: 'health', health });
  }

  /**
   * Re-reads storage first, so progress made in another tab is kept. While
   * saving fails, the copy in memory is the only complete one, so it wins.
   */
  function change(mutate: (draft: Profile) => void) {
    const latest = health === 'ok' ? readStoredProfile(false) : profile;
    const draft = structuredClone(latest);
    mutate(draft);
    save(draft);
  }

  function emit(event: PassEvent) {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('An Arcade Pass listener failed:', error);
      }
    }
  }

  function misuse(message: string) {
    if (warned.has(message)) return;
    warned.add(message);
    console.warn(`Arcade Pass: ${message}`);
  }

  function gainXp(draft: Profile, xp: number): { before: number; after: number } {
    const before = levelForXp(draft.xp);
    draft.xp = Math.min(MAX_COUNT, draft.xp + xp);
    const after = levelForXp(draft.xp);
    if (after > before) {
      const rank = rankForLevel(after);
      const text =
        rank !== rankForLevel(before)
          ? `Reached level ${after} and the rank of ${rank.name}`
          : `Reached level ${after}`;
      addToFeed(draft, {
        at: now().toISOString(),
        kind: 'level',
        game: null,
        xp: 0,
        text,
        times: 1,
      });
    }
    return { before, after };
  }

  function announceLevels({ before, after }: { before: number; after: number }) {
    if (after <= before) return;
    const rank = rankForLevel(after);
    const gameUnlocks = [...manifests.values()].flatMap((manifest) =>
      manifest.cosmetics
        .filter(
          (cosmetic) =>
            'level' in cosmetic.unlock &&
            cosmetic.unlock.level > before &&
            cosmetic.unlock.level <= after,
        )
        .map((cosmetic) => ({
          game: manifest.game,
          id: cosmetic.id,
          name: cosmetic.name,
          kind: cosmetic.kind,
        })),
    );
    emit({
      type: 'level',
      level: after,
      previousLevel: before,
      rank,
      newRank: rank !== rankForLevel(before),
      unlocks: [
        ...arcadeUnlocksBetween(before, after).map((unlock) => ({
          game: null,
          id: unlock.id,
          name: unlock.name,
          kind: LOOK_SLOT_NAMES[unlock.slot],
        })),
        ...gameUnlocks,
      ],
    });
  }

  function recordFor(draft: Profile, game: string): GameRecord {
    const at = now();
    const today = localDay(at);
    const record = (draft.games[game] ??= emptyGameRecord(at, today));
    record.lastPlayed = at.toISOString();
    if (record.day !== today) {
      record.day = today;
      record.askedToday = 0;
    }
    return record;
  }

  function forGame<BadgeId extends string, CosmeticId extends string, StatKey extends string>(
    manifest: PassManifest<BadgeId, CosmeticId, StatKey>,
  ): GamePass<BadgeId, CosmeticId, StatKey> {
    const game = manifest.game;
    manifests.set(game, manifest as unknown as PassManifest);

    const badgeNamed = (id: string) => {
      const badge = manifest.badges.find((candidate) => candidate.id === id);
      if (!badge) misuse(`${game} has no badge "${id}" in its manifest.`);
      return badge;
    };
    const recordNow = () => profile.games[game];

    const unlock = (badgeId: BadgeId): boolean => {
      const badge = badgeNamed(badgeId);
      if (!badge) return false;
      if (recordNow()?.badges[badge.id]) return false;
      const xp = badgeXp(badge);
      let isNew = false;
      let levels = { before: 0, after: 0 };
      change((draft) => {
        const record = recordFor(draft, game);
        if (record.badges[badge.id]) return;
        isNew = true;
        const at = now().toISOString();
        record.badges[badge.id] = at;
        if (badge.target) {
          record.progress[badge.id] = Math.max(record.progress[badge.id] ?? 0, badge.target);
        }
        record.xp += xp;
        addToFeed(draft, {
          at,
          kind: 'badge',
          game,
          xp,
          text: badge.name,
          times: 1,
          badge: badge.id,
        });
        levels = gainXp(draft, xp);
      });
      if (!isNew) return false;
      emit({
        type: 'badge',
        game,
        badge,
        xp,
        unlocks: manifest.cosmetics
          .filter((cosmetic) => 'badge' in cosmetic.unlock && cosmetic.unlock.badge === badge.id)
          .map((cosmetic) => ({ game, id: cosmetic.id, name: cosmetic.name, kind: cosmetic.kind })),
      });
      announceLevels(levels);
      return true;
    };

    return {
      game,
      manifest,
      get level() {
        return levelForXp(profile.xp);
      },
      get health() {
        return health;
      },
      award(xp, reason) {
        const text = cleanReason(reason);
        const level = levelForXp(profile.xp);
        if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0) {
          misuse(`award() needs a positive number of XP, not ${String(xp)}.`);
          return { granted: 0, asked: 0, reduced: false, level, levelUp: false };
        }
        if (!text) {
          misuse('award() needs a reason for the activity feed.');
          return { granted: 0, asked: 0, reduced: false, level, levelUp: false };
        }
        if (xp > MAX_AWARD)
          misuse(`award() was asked for ${xp} XP; one award is capped at ${MAX_AWARD}.`);
        const asked = Math.min(MAX_AWARD, Math.round(xp));
        let granted = 0;
        let levels = { before: level, after: level };
        change((draft) => {
          const record = recordFor(draft, game);
          granted = cappedXp(record.askedToday, asked);
          record.askedToday += asked;
          record.xp += granted;
          if (granted > 0) {
            addToFeed(draft, {
              at: now().toISOString(),
              kind: 'xp',
              game,
              xp: granted,
              text,
              times: 1,
            });
          }
          levels = gainXp(draft, granted);
        });
        emit({ type: 'xp', game, granted, asked, reason: text });
        announceLevels(levels);
        return {
          granted,
          asked,
          reduced: granted < asked,
          level: levels.after,
          levelUp: levels.after > levels.before,
        };
      },
      unlock,
      progress(badgeId, value) {
        const badge = badgeNamed(badgeId);
        if (!badge) return false;
        if (!badge.target) {
          misuse(`${game}'s badge "${badge.id}" has no target, so it can't take progress.`);
          return false;
        }
        const amount = typeof value === 'number' ? value : value?.add;
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
          misuse(`progress() for "${badge.id}" needs a count of 0 or more.`);
          return false;
        }
        const target = badge.target;
        let reached = false;
        change((draft) => {
          const record = recordFor(draft, game);
          const current = record.progress[badge.id] ?? 0;
          const next = typeof value === 'number' ? Math.max(current, amount) : current + amount;
          const count = Math.min(MAX_COUNT, Math.floor(next));
          record.progress[badge.id] = count;
          reached = count >= target && !record.badges[badge.id];
        });
        if (reached) return unlock(badgeId);
        emit({ type: 'change' });
        return false;
      },
      stat(key, update) {
        if (!manifest.stats.some((stat) => stat.key === key)) {
          misuse(`${game} has no stat "${key}" in its manifest.`);
          return profile.games[game]?.stats[key] ?? 0;
        }
        if (!Number.isFinite(statAmount(update))) {
          misuse(`stat() for "${key}" needs a number.`);
          return profile.games[game]?.stats[key] ?? 0;
        }
        let value = 0;
        change((draft) => {
          const stats = recordFor(draft, game).stats;
          value = nextStatValue(stats[key], update);
          stats[key] = value;
        });
        emit({ type: 'change' });
        return value;
      },
      hasBadge: (badgeId) => Boolean(recordNow()?.badges[badgeId]),
      progressOf: (badgeId) => recordNow()?.progress[badgeId] ?? 0,
      statOf: (key) => recordNow()?.stats[key],
      isUnlocked(cosmeticId) {
        const cosmetic = manifest.cosmetics.find((candidate) => candidate.id === cosmeticId);
        if (!cosmetic) {
          misuse(`${game} has no cosmetic "${cosmeticId}" in its manifest.`);
          return false;
        }
        return 'level' in cosmetic.unlock
          ? levelForXp(profile.xp) >= cosmetic.unlock.level
          : Boolean(recordNow()?.badges[cosmetic.unlock.badge]);
      },
      subscribe,
    };
  }

  function subscribe(listener: PassListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== PROFILE_STORAGE_KEY && event.key !== null) return;
    profile = readStoredProfile(false);
    emit({ type: 'change' });
  };
  if (watchOtherTabs) window.addEventListener('storage', onStorage);

  return {
    get profile() {
      return profile;
    },
    get level() {
      return levelForXp(profile.xp);
    },
    get health() {
      return health;
    },
    get notice() {
      return notice;
    },
    forGame,
    subscribe,
    rename(name) {
      change((draft) => {
        draft.name = cleanName(name);
      });
      emit({ type: 'change' });
    },
    dressUp(look) {
      let everythingFitted = true;
      change((draft) => {
        const level = levelForXp(draft.xp);
        for (const [slot, id] of Object.entries(look) as [LookSlot, string | undefined][]) {
          if (id === undefined) continue;
          if (slot in LOOK_OPTIONS && isLookUnlocked(slot, id, level)) {
            (draft.look as Record<LookSlot, string>)[slot] = id;
          } else {
            everythingFitted = false;
          }
        }
      });
      emit({ type: 'change' });
      return everythingFitted;
    },
    exportCode: () => encodeBackupCode(profile),
    exportFile: () => backupFileText(profile, now()),
    restore(next) {
      save(structuredClone(next));
      emit({ type: 'change' });
    },
    reset() {
      save(emptyProfile(now()));
      emit({ type: 'change' });
    },
    dispose() {
      listeners.clear();
      if (watchOtherTabs) window.removeEventListener('storage', onStorage);
    },
  };
}

function statAmount(update: StatUpdate): number {
  if (typeof update === 'number') return update;
  if (typeof update !== 'object' || update === null) return Number.NaN;
  if ('add' in update) return update.add;
  if ('max' in update) return update.max;
  if ('min' in update) return update.min;
  return Number.NaN;
}

function nextStatValue(current: number | undefined, update: StatUpdate): number {
  if (typeof update === 'number') return update;
  if ('add' in update) return (current ?? 0) + update.add;
  if ('max' in update) return current === undefined ? update.max : Math.max(current, update.max);
  return current === undefined ? update.min : Math.min(current, update.min);
}

function addToFeed(draft: Profile, entry: FeedEntry) {
  const latest = draft.feed[0];
  const foldable =
    entry.kind === 'xp' &&
    latest?.kind === 'xp' &&
    latest.game === entry.game &&
    latest.text === entry.text &&
    Date.parse(entry.at) - Date.parse(latest.at) < FEED_FOLD_MS;
  if (foldable) {
    latest.xp += entry.xp;
    latest.times += 1;
    latest.at = entry.at;
    return;
  }
  draft.feed.unshift(entry);
  draft.feed.length = Math.min(draft.feed.length, FEED_LENGTH);
}

let pagePass: ArcadePass | null = null;

/** The page's one Arcade Pass, shared by the game, its toasts and anything else on the page. */
export function openArcadePass(): ArcadePass {
  pagePass ??= createArcadePass();
  return pagePass;
}

/**
 * What a game calls once at start-up:
 *
 *   import manifest from '../pass.manifest';
 *   const pass = connectPass(manifest);
 *   pass.award(40, 'Won in Jakarta');
 */
export function connectPass<
  BadgeId extends string,
  CosmeticId extends string,
  StatKey extends string,
>(manifest: PassManifest<BadgeId, CosmeticId, StatKey>): GamePass<BadgeId, CosmeticId, StatKey> {
  return openArcadePass().forGame(manifest);
}
