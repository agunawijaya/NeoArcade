/**
 * Every number the original's rules are made of, with the line it comes
 * from. Money is in cents throughout the engine, so sums never drift.
 */
export const RULES = {
  /** Line 1000: HL, hours since the driver last slept, at the terminal. */
  startAwake: 3,
  /** Line 1000: HS, the night's sleep before the trip. */
  startSlept: 7,
  /** Line 1220: loading the truck takes an hour. */
  loadingHours: 1,
  /** Lines 1000 and 1190: 190 gallons bought for $190, a dollar a gallon. */
  startFuel: 190,
  /** Line 1790. */
  tankGallons: 200,
  /** Line 1110. */
  minLoad: 25_000,
  /** Line 1200: a full trailer. */
  maxLoad: 50_000,
  /** Line 1190: TC, how worn the tyres are. */
  tyreWear: 10,
  retreadWear: 3,
  newTyreWear: 4,
  newTyreCents: 20_000,
  retreadCents: 10_000,
  /** The 55 mph national limit of the day, and the reduced limits of line 3380 and 3660. */
  speedLimit: 55,
  constructionLimit: 35,
  minSpeed: 20,
  /** Line 1660: the old rig manages one and a half times the limit. */
  speedCapFactor: 1.5,
  /** Line 1630: a stop is offered once more than three hours have passed since the last. */
  hoursBetweenStops: 3,
  /** Line 1420: the crash check divides by ten million. */
  crashScale: 10_000_000,
  /** Line 1440. */
  blowoutScale: 25_000,
  /** Line 2720. */
  towCents: 40_000,
  towHours: 4,
  /** Lines 2540–2550: a barrel of diesel delivered to the roadside. */
  barrelCents: 20_000,
  barrelGallons: 55,
  /** Line 5180: truck payment, insurance and taxes, per day started. */
  truckDayCents: 8_500,
  /** Lines 1960 and 3750: a parked reefer unit burns this much diesel an hour. */
  reeferGallonsPerHour: 7,
  /** Line 3540: the scale reads rig + cargo + 7 lb per gallon + up to 225 lb of driver and gear. */
  rigPounds: 19_000,
  fuelPoundsPerGallon: 7,
  grossLimitPounds: 60_000,
  overweightBaseCents: 20_000,
  /** Lines 3650–3680. */
  detourMiles: 200,
  detourLimit: 45,
  /** Line 3890. */
  reeferRepairCents: 10_000,
  reeferRepairHours: 2,
  /** Line 5230: dumping a spoiled load. */
  dumpCents: 5_000,
  /** Line 5340, and the penalty the original printed but never took. */
  latePenalty: 0.1,
  /**
   * Line 5110, as it was meant: the warehouse is shut from 6 PM to 6 AM. The
   * original's wait ran to 8 AM, two hours after the doors open; waiting for 6 AM
   * is what makes the cutoff of HR 95 (Friday 7 AM) mean anything.
   */
  dockOpensHour: 6,
  dockClosesHour: 18,
  /** Line 2430: the fourth offence is jail. */
  offencesToJail: 4,
} as const;

/** The fastest the rig will go under a limit (line 1660). */
export function speedCap(limit: number): number {
  return Math.floor(RULES.speedCapFactor * limit);
}

/** Miles per gallon at a speed: 4.5 at 55 mph, falling to 2 when 13 or more mph away (line 1480). */
export function milesPerGallon(speed: number): number {
  let away = Math.abs(55 - speed);
  if (away > 12) away = 12.5;
  return 4.5 - 0.2 * away;
}

/** Gallons burned in an hour at a speed (line 1490). */
export function gallonsPerHour(speed: number, economy = 1): number {
  return (speed / milesPerGallon(speed)) * economy;
}
