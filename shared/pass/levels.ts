/**
 * The XP curve, in one table: row n is the XP needed to go from level n to
 * level n + 1. Early levels come fast (level 2 inside one good session), each
 * step grows a little until level 20, and from there every level costs the
 * same, so long-term progress stays steady instead of grinding to a halt.
 */
export const XP_TO_NEXT_LEVEL: readonly number[] = [
  150, // 1 → 2
  250,
  350,
  450,
  550, // 5 → 6
  650,
  750,
  850,
  950,
  1000, // 10 → 11
  1050,
  1100,
  1150,
  1200,
  1250, // 15 → 16
  1300,
  1350,
  1400,
  1450, // 19 → 20
];

/** Every level from 20 on costs this much. */
export const STEADY_XP_PER_LEVEL = 1500;

export function xpToNextLevel(level: number): number {
  return XP_TO_NEXT_LEVEL[level - 1] ?? STEADY_XP_PER_LEVEL;
}

/** Total XP a player needs to reach a level; level 1 needs none. */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let from = 1; from < level; from++) total += xpToNextLevel(from);
  return total;
}

export function levelForXp(xp: number): number {
  let level = 1;
  let needed = xpToNextLevel(1);
  let remaining = Math.max(0, xp);
  while (remaining >= needed) {
    remaining -= needed;
    level++;
    needed = xpToNextLevel(level);
  }
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP earned since the current level began. */
  xpIntoLevel: number;
  /** XP the current level takes in total. */
  xpForNextLevel: number;
  /** 0..1 of the way to the next level. */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const xpIntoLevel = Math.max(0, xp) - xpForLevel(level);
  const xpForNextLevel = xpToNextLevel(level);
  return { level, xpIntoLevel, xpForNextLevel, fraction: xpIntoLevel / xpForNextLevel };
}

export type RankId =
  | 'coin-slot'
  | 'button-masher'
  | 'joystick-jockey'
  | 'high-scorer'
  | 'cabinet-champion'
  | 'arcade-legend';

export interface Rank {
  id: RankId;
  name: string;
  /** The level at which the rank is reached. */
  fromLevel: number;
  /** One line for the profile and the level-up toast. */
  motto: string;
}

export const RANKS: readonly Rank[] = [
  {
    id: 'coin-slot',
    name: 'Coin Slot',
    fromLevel: 1,
    motto: 'Insert coin. Every legend starts here.',
  },
  {
    id: 'button-masher',
    name: 'Button Masher',
    fromLevel: 5,
    motto: 'Enthusiasm first, technique later.',
  },
  {
    id: 'joystick-jockey',
    name: 'Joystick Jockey',
    fromLevel: 10,
    motto: 'You ride the stick like you mean it.',
  },
  {
    id: 'high-scorer',
    name: 'High Scorer',
    fromLevel: 15,
    motto: 'Three letters on the table, and they are yours.',
  },
  {
    id: 'cabinet-champion',
    name: 'Cabinet Champion',
    fromLevel: 20,
    motto: 'Regulars step aside when you walk in.',
  },
  {
    id: 'arcade-legend',
    name: 'Arcade Legend',
    fromLevel: 30,
    motto: 'They will tell stories about this run.',
  },
];

export function rankForLevel(level: number): Rank {
  let found = RANKS[0] as Rank;
  for (const rank of RANKS) if (level >= rank.fromLevel) found = rank;
  return found;
}

export function nextRank(level: number): Rank | null {
  return RANKS.find((rank) => rank.fromLevel > level) ?? null;
}
