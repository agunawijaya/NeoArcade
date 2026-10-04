/**
 * The road and the driver, as the original measured them. Each has a risk
 * weight that multiplies into the crash check: CR for the road (lines
 * 2960–2985) and CD for the driver (lines 3010–3060).
 */
export type ConditionId = 'clear' | 'wet' | 'rain' | 'light-snow' | 'fog' | 'blizzard';

export interface Condition {
  id: ConditionId;
  name: string;
  /** CR in the original. */
  risk: number;
  /** What the original printed after "Current weather: ". */
  original: string;
}

export const CONDITIONS: Readonly<Record<ConditionId, Condition>> = {
  clear: { id: 'clear', name: 'Clear and dry', risk: 1, original: 'clear & dry' },
  wet: { id: 'wet', name: 'Wet road', risk: 3, original: 'clear, but roadway is wet' },
  rain: { id: 'rain', name: 'Rain', risk: 5, original: 'rain' },
  'light-snow': { id: 'light-snow', name: 'Light snow', risk: 5, original: 'light snow' },
  fog: { id: 'fog', name: 'Fog', risk: 10, original: 'fog -- limited visibility' },
  blizzard: { id: 'blizzard', name: 'Blizzard', risk: 50, original: 'B-L-I-Z-Z-A-R-D  !!' },
};

export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];

export type FatigueId = 'rested' | 'fine' | 'bored' | 'tired' | 'fatigued' | 'exhausted';

export interface FatigueLevel {
  id: FatigueId;
  name: string;
  /** CD in the original. */
  risk: number;
  /** What the original printed after "You are feeling ". */
  original: string;
  /** 0 for rested up to 5 for exhausted, for drawing heavy eyelids. */
  severity: number;
}

export const FATIGUE: Readonly<Record<FatigueId, FatigueLevel>> = {
  rested: {
    id: 'rested',
    name: 'Rested',
    risk: 1,
    original: 'rested & rearing to go.',
    severity: 0,
  },
  fine: { id: 'fine', name: 'Fine', risk: 2, original: 'fine', severity: 1 },
  bored: { id: 'bored', name: 'Bored', risk: 4, original: '  b o r e d', severity: 2 },
  tired: { id: 'tired', name: 'Tired', risk: 8, original: '  t i r e d  !!', severity: 3 },
  fatigued: {
    id: 'fatigued',
    name: 'Fatigued',
    risk: 25,
    original: "fatigued...you're getting sleepy",
    severity: 4,
  },
  exhausted: {
    id: 'exhausted',
    name: 'Exhausted',
    risk: 100,
    original: '..E.X.H.A.U.S.T.E.D..',
    severity: 5,
  },
};

/**
 * How the driver feels (line 3000). `awake` is HL, hours since real sleep;
 * `clockHours` is HR and `slept` is HS, all the sleep since the trip began
 * plus the seven hours before it. The ratio HR/HS is how much of the trip
 * was spent awake.
 *
 * The original tested `COS(HR/HS) < 2.3` and `COS(HR/HS) < 2.5`, which a
 * cosine can never fail, so only HL mattered for the two best states. The
 * neighbouring lines compare HR/HS itself with 3 and 4, so the intended test
 * was surely the ratio: here it is.
 */
export function fatigueOf(awake: number, clockHours: number, slept: number): FatigueId {
  const ratio = clockHours / Math.max(1, slept);
  if (awake > 19 || ratio > 4) return 'exhausted';
  if (awake < 4 && ratio < 2.3) return 'rested';
  if (awake < 8 && ratio < 2.5) return 'fine';
  if (awake < 12 && ratio <= 3) return 'bored';
  if (awake < 16 && ratio <= 3) return 'tired';
  return 'fatigued';
}

/** The same states as the original computed them, cosine and all, for the docs and tests. */
export function originalFatigueOf(awake: number, clockHours: number, slept: number): FatigueId {
  const ratio = clockHours / Math.max(1, slept);
  if (awake > 19 || ratio > 4) return 'exhausted';
  if (awake < 4) return 'rested';
  if (awake < 8) return 'fine';
  if (awake < 12 && ratio <= 3) return 'bored';
  if (awake < 16 && ratio <= 3) return 'tired';
  return 'fatigued';
}
