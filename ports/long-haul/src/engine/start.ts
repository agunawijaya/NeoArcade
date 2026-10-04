import type { TripEvent } from './events';
import { lookAhead } from './outlook';
import { RULES } from './rules';
import { STOCK_RIG } from './rig';
import { setupProblems, spend, trimLoad, tyrePurchase, type Trip, type TripSetup } from './trip';

/**
 * Leaving the terminal (lines 1000–1600): diesel bought, the truck loaded
 * in an hour, tyres seen to, and a first look at the road.
 */
export function startTrip(setup: TripSetup): { trip: Trip; events: TripEvent[] } {
  const problems = setupProblems(setup);
  if (problems.length > 0) throw new Error(problems.map((problem) => problem.message).join(' '));
  const rig = setup.rig ?? STOCK_RIG;
  const tyres = tyrePurchase(setup.tyres, rig.tyreWear);
  const firstLimit = setup.route.stops[0]?.limit ?? RULES.speedLimit;
  const startFuel = Math.min(setup.startFuel ?? RULES.startFuel, rig.tankGallons);
  const carried = Math.max(0, Math.min(setup.carriedFuel ?? 0, startFuel));

  const trip: Trip = {
    seed: setup.seed >>> 0,
    route: setup.route,
    cargo: setup.cargo,
    load: trimLoad(setup.load),
    difficulty: setup.difficulty,
    rig,
    deadline: setup.deadline,
    startClock: setup.startClock,
    sky: setup.sky ?? [],
    payCents: setup.payCents ?? null,
    earlyBonus: setup.earlyBonus ?? false,
    status: 'driving',
    hr: 0,
    awake: RULES.startAwake,
    slept: RULES.startSlept,
    miles: 0,
    fuel: startFuel,
    tyreWear: tyres.wear,
    spare: tyres.spare,
    limit: firstLimit,
    legLimit: firstLimit,
    next: 0,
    hoursSinceStop: 0,
    speed: 0,
    condition: 'clear',
    fatigue: 'rested',
    damage: 0,
    offences: setup.offences ?? 0,
    zoneShift: 0,
    extraMiles: 0,
    extraFrom: setup.route.stops.length,
    detourRoad: null,
    hourCount: 0,
    stopCount: 0,
    stopOffered: false,
    fuelGauge: startFuel,
    expenses: [],
    events: [],
    trail: [],
    visits: {},
  };

  const bought = Math.round(startFuel - carried);
  if (bought > 0)
    spend(
      trip,
      'fuel',
      bought * 100,
      carried > 0 ? 'topped up at the terminal' : 'a nearly full tank at the terminal',
    );
  spend(trip, 'tyres', tyres.cents, 'tyres at the terminal');
  trip.hr += RULES.loadingHours;
  trip.trail.push({ hr: trip.hr, mile: 0, speed: 0, condition: 'clear' });

  const events: TripEvent[] = [{ type: 'departed', hr: trip.hr, mile: 0 }, ...lookAhead(trip)];
  trip.events.push(...events);
  return { trip, events };
}
