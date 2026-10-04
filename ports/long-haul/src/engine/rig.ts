import { RULES } from './rules';

/**
 * The truck itself. In Single Haul it is the original rig, exactly; in Career
 * the player can spend profits on it. Every upgrade changes one number in
 * the original's rules, and costs real money to fit.
 */
export interface RigSpec {
  tankGallons: number;
  /** Multiplies fuel burn (line 1490). */
  economy: number;
  /** A bunk wakes you at the slightest daytime noise (line 1970); a proper sleeper cab does not. */
  sleeper: 'bunk' | 'sleeper-cab';
  /** Multiplies the odds of a reefer failure (line 3870). */
  reeferOdds: number;
  /** TC at the start of each trip, before any new tyres (line 1190). */
  tyreWear: number;
  /** Beeps before a radar trap; illegal in Virginia and Washington, D.C. */
  radarDetector: boolean;
}

export const STOCK_RIG: RigSpec = {
  tankGallons: RULES.tankGallons,
  economy: 1,
  sleeper: 'bunk',
  reeferOdds: 1,
  tyreWear: RULES.tyreWear,
  radarDetector: false,
};

/** Where a radar detector is against the law, and what being caught with one costs. */
export const DETECTOR_BANNED_STATES: readonly string[] = ['VA', 'DC'];
export const DETECTOR_FINE_CENTS = 7_500;
