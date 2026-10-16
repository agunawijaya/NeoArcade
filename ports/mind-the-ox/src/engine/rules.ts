import {
  BASE_BULLET_SPEED,
  BASE_MAX_SPEED,
  BASE_MIN_SPEED,
  MAX_CRASHES,
  TARGET_HIT_DAMAGE,
} from './constants';

/**
 * Classic turns in the original's sixteen steps, one per move; smooth turns
 * through a finer circle with eased starts and stops, at the same top rate.
 */
export type FlightModel = 'classic' | 'smooth';

/** Everything a mode can change about how the world behaves. */
export interface Rules {
  flight: FlightModel;
  /** False is the 1984 novice: no stalls, no fuel or ammunition used, no birds or oxen. */
  expert: boolean;
  /** Missiles and starbursts, which 1984 hid behind an undocumented switch. */
  secretWeapons: boolean;
  maxCrashes: number;
  /** Zero-based; each won round makes everything faster and the targets tougher. */
  round: number;
  /** Smooth flight only: an upside-down plane that is not being steered rolls itself upright. */
  autoRoll: boolean;
  /** Units per move added to everything that flies, from the campaign's crosswind. */
  wind: number;
  /** One-player scoring: a side also pays for its own losses (see scoring.ts). */
  lossPenalties: boolean;
  /**
   * The night raid: the enemy's airfields sweep the sky with searchlights,
   * and in the dark its gunners and pilots only see a plane that is caught
   * in a beam or comes close (see sight.ts).
   */
  searchlights: boolean;
  /** Depots defended by anti-aircraft guns, firing from the first round. */
  antiAir: boolean;
  /**
   * How the targets' gunners shoot. Classic is 1984's: deadly accurate,
   * leading the plane perfectly. Softened (every mode but Classic 1984)
   * reaches a fifth less far, fires every other move until the fourth round
   * and scatters its aim, so a pilot who keeps moving has a chance.
   */
  flak: 'classic' | 'softened';
  /** How rough the sea runs: 0 calm, 1 a swell, 2 heavy. A carrier's deck rises and falls with it. */
  seaState: 0 | 1 | 2;
  /** Carrier landings made kinder: a steady deck, a wider window for the wires, a glide-path guide. */
  landingAssist: boolean;
  /**
   * How well the ships' anti-aircraft gunners shoot, 1 as their class has
   * it: their reach is multiplied by it and their rate of fire too.
   */
  shipGunnery: number;
}

export const CLASSIC_RULES: Rules = {
  flight: 'classic',
  expert: true,
  secretWeapons: false,
  maxCrashes: MAX_CRASHES,
  round: 0,
  autoRoll: false,
  wind: 0,
  lossPenalties: true,
  searchlights: false,
  antiAir: false,
  flak: 'classic',
  seaState: 0,
  landingAssist: true,
  shipGunnery: 1,
};

export const MODERN_RULES: Rules = {
  ...CLASSIC_RULES,
  flight: 'smooth',
  autoRoll: true,
  flak: 'softened',
};

export interface RoundTuning {
  minSpeed: number;
  maxSpeed: number;
  bulletSpeed: number;
  /** A target falls when its damage goes past this; bullets add 10, time heals 1 a move. */
  targetToughness: number;
  /** How far targets shoot at planes, or 0 when they hold fire. */
  targetRange: number;
  /** In the first round they fire back they only manage every other move. */
  targetFiresEveryMove: boolean;
}

/**
 * The 1984 escalation: each won round adds one to the plane's speeds and the
 * bullets', targets need one more hit, and from the second round they fire
 * back over a range that grows until the seventh.
 */
export function roundTuning(round: number): RoundTuning {
  const level = Math.max(0, Math.floor(round));
  return {
    minSpeed: BASE_MIN_SPEED + level,
    maxSpeed: BASE_MAX_SPEED + level,
    bulletSpeed: BASE_BULLET_SPEED + level,
    targetToughness: TARGET_HIT_DAMAGE * (level + 1),
    targetRange: level === 0 ? 0 : 150 - 15 * Math.max(0, 6 - level),
    targetFiresEveryMove: level > 1,
  };
}
