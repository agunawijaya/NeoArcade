import type { GamePass } from '@shared/pass';
import type { Store } from '@shared/storage';
import type manifest from '../../pass.manifest';
import type { Flight, FlightEvent, Outcome } from '../engine/flight';
import { sunAt } from '../world/sun';

/**
 * How a flight reports to the Arcade Pass: the badge for the first takeoff
 * the moment the wheels leave, and everything else when the flight ends —
 * XP for the landing and its quality, the badges it earned, the counted
 * badges and the profile's stats. Toasts are queued; the report screen
 * flushes them.
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
  const real = level !== 'rules1982';
  if (real && level !== 'arcade' && SHORT_FIELDS.includes(outcome.destination))
    pass.unlock('short-field');
  if (!outcome.fullFlight) return;

  pass.award(60, 'Flew Flight 312 all the way');
  if (level === 'rules1982') pass.unlock('ace-1982');
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
