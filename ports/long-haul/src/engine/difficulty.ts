/**
 * Normal is the original's odds, untouched. Easy makes the road's surprises rarer
 * and the fines gentler; Hard brings worse weather and keener police. Every
 * knob multiplies a probability or an amount in the original formulas, so
 * the shape of the game stays the same.
 */
export type DifficultyId = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_IDS: readonly DifficultyId[] = ['easy', 'normal', 'hard'];

export interface Difficulty {
  id: DifficultyId;
  name: string;
  summary: string;
  /** Odds of construction, radar, scales, rock slides and reefer trouble at waypoints. */
  eventOdds: number;
  /** Odds of a blown tyre in any hour. */
  blowoutOdds: number;
  /** Fines for speeding and for an overweight truck. */
  fineScale: number;
  /** Odds a patrol car pulls you over once you are over its threshold. */
  policeOdds: number;
  /** Miles per hour the patrol threshold drops by (line 1450). */
  policeThresholdDrop: number;
  /** Stretches the weather draw (line 2810); above 1 means more bad weather. */
  weatherScale: number;
}

export const DIFFICULTIES: Readonly<Record<DifficultyId, Difficulty>> = {
  easy: {
    id: 'easy',
    name: 'Easy',
    summary: 'Fewer surprises at the waypoints, fewer blowouts, half the fines.',
    eventOdds: 0.6,
    blowoutOdds: 0.6,
    fineScale: 0.5,
    policeOdds: 1,
    policeThresholdDrop: 0,
    weatherScale: 1,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    summary: 'The original’s odds.',
    eventOdds: 1,
    blowoutOdds: 1,
    fineScale: 1,
    policeOdds: 1,
    policeThresholdDrop: 0,
    weatherScale: 1,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    summary: 'Rougher weather, sharper-eyed police and steeper fines.',
    eventOdds: 1,
    blowoutOdds: 1,
    fineScale: 1.25,
    policeOdds: 1.35,
    policeThresholdDrop: 2,
    weatherScale: 1.1,
  },
};
