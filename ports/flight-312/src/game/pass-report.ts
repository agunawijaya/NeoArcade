import type { Streak } from '@shared/daily';
import type { GamePass } from '@shared/pass';
import type { Store } from '@shared/storage';
import type manifest from '../../pass.manifest';
import type { DailyApproachResult } from '../engine/daily-approach';
import type { Flight, FlightEvent, Outcome } from '../engine/flight';
import type { Lesson } from '../engine/lesson';
import { sunAt } from '../world/sun';

/**
 * How a flight reports to the Arcade Pass: the badge for the first takeoff
 * the moment the wheels leave, and everything else when the flight ends —
 * XP for the landing and its quality, the badges it earned, the counted
 * badges and the profile's stats. Lessons and the Daily Approach report
 * when they are marked. Toasts are queued; the report screen flushes them.
 */
type Manifest = typeof manifest;
type BadgeOf<M> = M extends { badges: readonly { id: infer Id }[] } ? Id : never;
type CosmeticOf<M> = M extends { cosmetics: readonly { id: infer Id }[] } ? Id : never;
type StatOf<M> = M extends { stats: readonly { key: infer Key }[] } ? Key : never;
export type CosmeticId = CosmeticOf<Manifest> & string;
export type FlightPass = GamePass<
  BadgeOf<Manifest> & string,
  CosmeticOf<Manifest> & string,
  StatOf<Manifest> & string
>;

const SHORT_FIELDS = ['psb', 'ssm'];
/** Crosswind Ace: this much wind across the runway, and this close to the centreline. */
const ACE_CROSSWIND_KT = 15;
const ACE_CENTRELINE_FT = 15;
type SkyKind = 'clear' | 'low' | 'minimums' | 'fog';

/** The weather a landing was made in, by the destination's cloud. */
function skyKind(ceilingFt: number | null): SkyKind {
  if (ceilingFt === null) return 'clear';
  if (ceilingFt <= 100) return 'fog';
  return ceilingFt <= 300 ? 'minimums' : 'low';
}

export function reportEvent(pass: FlightPass, event: FlightEvent) {
  if (event.kind === 'liftoff') pass.unlock('wheels-up');
  if (event.kind === 'goAroundComplete' && event.proper) pass.unlock('go-around');
}

export function reportOutcome(pass: FlightPass, store: Store, flight: Flight, outcome: Outcome) {
  const level = outcome.level;
  pass.stat('flights', { add: 1 });
  pass.stat('minutesFlown', { add: Math.round(outcome.time / 60) });
  if (flight.liftoffAt !== null) pass.award(10, 'Took off from Philadelphia');

  switch (outcome.ending) {
    case 'tailStrike':
      pass.unlock('tail-strike');
      break;
    case 'marshes':
    case 'overrun':
      pass.unlock('marshlands');
      break;
    case 'gearUp':
      pass.unlock('belly-flop');
      break;
    case 'missedApproach':
      pass.unlock('go-around');
      pass.award(15, 'Called the missed approach');
      break;
    case 'climbOut':
      pass.award(20, 'Takeoff practice completed');
      break;
    default:
      break;
  }

  const touchdown = outcome.touchdown;
  if (outcome.ending !== 'landed' || !touchdown) return;
  pass.unlock('down-and-stopped');
  pass.progress('jumbo-pilot', { add: 1 });
  pass.stat('landings', { add: 1 });
  pass.stat('bestTouchdown', { min: Math.round(touchdown.sinkFpm) });
  pass.award(30, 'Landed the jumbo');
  if (touchdown.sinkFpm < 100) {
    pass.unlock('greaser');
    pass.award(15, 'A greaser');
  }
  if (outcome.breakout) {
    pass.unlock('breakout');
    pass.award(15, 'Broke out at minimums');
  }
  const sun = sunAt(flight.readout.position, flight.clockStart + flight.time);
  if (sun.elevation < -6) pass.unlock('night-owl');
  if (touchdown.sinkFpm < 60) pass.unlock('kiss-landing');
  if (
    Math.abs(touchdown.crosswindKt) >= ACE_CROSSWIND_KT &&
    Math.abs(touchdown.across) <= ACE_CENTRELINE_FT
  )
    pass.unlock('crosswind-ace');
  if (touchdown.runway.airport === flight.world.ils.runway.airport) {
    const skies = new Set(store.get<SkyKind[]>('skies', []));
    skies.add(skyKind(flight.world.weather.destination.ceilingFt));
    store.set('skies', [...skies]);
    pass.progress('weather-watcher', skies.size);
  }
  const real = level !== 'rules1982';
  if (real && level !== 'arcade' && SHORT_FIELDS.includes(outcome.destination))
    pass.unlock('short-field');
  if (!outcome.fullFlight) return;

  pass.award(60, 'Flew Flight 312 all the way');
  if (level === 'rules1982') pass.unlock('ace-1982');
  if (flight.deck === 'glass') pass.unlock('glass-act');
  if (level === 'captain' && outcome.violations.length === 0) {
    pass.unlock('captains-hat');
    pass.award(40, 'A clean flight at the Captain level');
  }
  if (
    (level === 'pilot' || level === 'captain') &&
    outcome.readbacks.missed === 0 &&
    outcome.readbacks.wrong === 0
  ) {
    pass.unlock('radio-ace');
  }
  if (Object.values(flight.procedures.completed).every((at) => at !== null))
    pass.unlock('by-the-book');
  const visited = new Set(store.get<string[]>('destinations', []));
  if (!visited.has(outcome.destination)) {
    visited.add(outcome.destination);
    store.set('destinations', [...visited]);
    pass.progress('grand-tour', { add: 1 });
  }
  pass.stat('destinations', { max: visited.size });
}

/** A lesson passed: the school's badges, the stat, and XP the first time it is passed. */
export function reportLesson(
  pass: FlightPass,
  lesson: Lesson,
  stars: number,
  record: Record<string, number>,
  firstPass: boolean,
) {
  pass.stat('lessonsPassed', { max: Object.values(record).filter((best) => best > 0).length });
  pass.award(firstPass ? 40 : 10, `Lesson ${lesson.number} passed, ${stars} of 3 stars`);
  if (lesson.number === 1) pass.unlock('student-pilot');
  if (lesson.tasks.at(-1)?.kind === 'flight') pass.unlock('check-ride');
}

/** The day's scored Daily Approach: XP by the stars, the streak, the best score. */
export function reportDaily(pass: FlightPass, result: DailyApproachResult, streak: Streak) {
  pass.award(20 + result.stars * 10, `Daily Approach, ${result.starsText}`);
  pass.progress('daily-flyer', streak.current);
  if (result.landed) pass.stat('bestDaily', { max: result.points });
}
