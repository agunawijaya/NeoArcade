import type { ConditionId, FatigueId } from './conditions';

/**
 * Everything that happens on a trip, in the order it happened. Each event
 * carries the clock (HR) and odometer at that moment. The front ends turn
 * them into cards, sounds, map markers and the original's text; the ledger and the
 * Arcade Pass read them afterwards.
 */
export type CrashCause =
  /** Line 4070. */
  | 'asleep'
  /** Line 4080. */
  | 'snow-ditch'
  /** Line 4090. */
  | 'pickup'
  /** Line 4100. */
  | 'speed'
  /** Line 4110. */
  | 'skid'
  /** Line 4120. */
  | 'drunk-driver';

export type TripEventBody =
  | { type: 'departed' }
  | { type: 'crash'; cause: CrashCause; speed: number }
  | {
      type: 'blowout';
      /** Changed the spare yourself; otherwise a tow truck brought one. */
      spare: boolean;
      hours: number;
      tyre: 'outside' | 'inside' | null;
      cents: number;
    }
  | {
      type: 'pulled-over';
      offence: number;
      waitHours: number;
      /** The fine's two parts (line 2400). */
      baseCents: number;
      perMphCents: number;
      overBy: number;
      cents: number;
      byRadar: boolean;
      /** A radar detector found on the dash where it is banned. */
      detectorCents?: number;
    }
  | { type: 'jailed'; offence: number; waitHours: number }
  | {
      type: 'out-of-fuel';
      /** Miles covered on the last drops (line 2510). */
      lastMiles: number;
      hours: number;
      cents: number;
      damage: number;
      /** While parked, rather than while driving (line 3820). */
      parked: boolean;
    }
  | { type: 'passed'; stop: number; place: string; name: string }
  | { type: 'time-zone'; hours: number }
  | { type: 'toll'; cents: number }
  | { type: 'construction'; limit: number }
  | { type: 'radar'; reading: number; limit: number; ticketed: boolean }
  | { type: 'weigh-station'; pounds: number; overBy: number; cents: number; centsPerPound: number }
  | {
      type: 'barred';
      state: string;
      pounds: number;
      detourMiles: number;
      via: string;
      limit: number;
    }
  | { type: 'rock-slide'; where: string; hours: number; sleep: number }
  | { type: 'reefer-failure'; damage: number; hours: number; cents: number }
  | { type: 'reefer-idle'; damage: number }
  | { type: 'stop-declined' }
  | { type: 'truck-stop'; number: number; dieselCents: number }
  | { type: 'fuel-bought'; gallons: number; cents: number; spilled: number }
  | { type: 'tyre-bought'; kind: 'new' | 'retread'; cents: number }
  | { type: 'coffee'; cents: number }
  | {
      type: 'slept';
      hours: number;
      /** Hours that counted, after daytime noise (line 1970). */
      sleep: number;
      daytime: boolean;
      motel: boolean;
      reeferGallons: number;
    }
  | { type: 'weather'; from: ConditionId; to: ConditionId }
  | { type: 'fatigue'; from: FatigueId; to: FatigueId }
  | { type: 'warehouse-closed'; waitHours: number }
  | { type: 'arrived'; deliveredHr: number };

export type TripEvent = TripEventBody & { hr: number; mile: number };

export type TripEventType = TripEventBody['type'];

export type EventOf<Type extends TripEventType> = Extract<TripEvent, { type: Type }>;

export function eventsOfType<Type extends TripEventType>(
  events: readonly TripEvent[],
  type: Type,
): Extract<TripEvent, { type: Type }>[] {
  return events.filter((event): event is Extract<TripEvent, { type: Type }> => event.type === type);
}
