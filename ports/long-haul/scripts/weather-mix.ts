import type { ConditionId } from '../src/engine/conditions';
import { contractTrip, type Contract } from '../src/engine/contracts';
import { SEASONS, type Season } from '../src/engine/living-weather';
import { routeOptions, shortestMiles } from '../src/engine/network';
import { ORIGINAL_ROUTE_IDS } from '../src/engine/original-routes';
import { singleHaulSetup } from '../src/engine/single-haul';
import { startTrip } from '../src/engine/start';
import { STOCK_RIG } from '../src/engine/rig';
import { balanced, driveTrip } from '../src/sim/drivers';

/** Results go to stdout, ready to paste into the docs. */
const print = (text = '') => process.stdout.write(`${text}\n`);

/**
 * How often each road condition comes up, per season on the corridor
 * network and on the original routes, so the living weather can be held to the
 * original's mix.
 *
 *   npx tsx ports/long-haul/scripts/weather-mix.ts [trips]
 */
const trips = Number(process.argv[2] ?? 60);
const PAIRS: [string, string][] = [
  ['los-angeles', 'new-york'],
  ['seattle', 'miami'],
  ['chicago', 'dallas'],
  ['denver', 'atlanta'],
  ['boston', 'phoenix'],
  ['minneapolis', 'houston'],
];
const ORDER: ConditionId[] = ['clear', 'wet', 'rain', 'light-snow', 'fog', 'blizzard'];

function tally(counts: Map<ConditionId, number>): string {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return ORDER.map((id) => `${id} ${(((counts.get(id) ?? 0) / total) * 100).toFixed(1)}%`).join(
    ' · ',
  );
}

const original = new Map<ConditionId, number>();
for (const id of ORIGINAL_ROUTE_IDS) {
  for (let seed = 1; seed <= trips; seed++) {
    const { trip } = startTrip(
      singleHaulSetup({
        route: id,
        direction: 'east',
        cargo: 'mail',
        load: 35_000,
        tyres: { kind: 'none' },
        seed,
        difficulty: 'normal',
        offences: 0,
      }),
    );
    driveTrip(trip, balanced);
    for (const point of trip.trail)
      original.set(point.condition, (original.get(point.condition) ?? 0) + 1);
  }
}
print(`original routes      ${tally(original)}`);

for (const season of SEASONS as readonly Season[]) {
  const counts = new Map<ConditionId, number>();
  let crashes = 0;
  let runs = 0;
  for (const [from, to] of PAIRS) {
    const [option] = routeOptions(from, to);
    if (!option) continue;
    for (let seed = 1; seed <= trips; seed++) {
      const contract: Contract = {
        id: 'mix',
        from,
        to,
        cargo: 'mail',
        goods: 'mail',
        load: 35_000,
        miles: shortestMiles(from, to),
        payCents: 100_000,
        dueHours: 90,
        special: null,
        minReputation: 0,
      };
      const { trip } = startTrip(
        contractTrip({
          contract,
          option,
          tyres: { kind: 'none' },
          seed: seed * 977,
          difficulty: 'normal',
          season,
          offences: 0,
          rig: STOCK_RIG,
        }),
      );
      driveTrip(trip, balanced);
      runs++;
      if (trip.status === 'crashed') crashes++;
      for (const point of trip.trail)
        counts.set(point.condition, (counts.get(point.condition) ?? 0) + 1);
    }
  }
  print(`${season.padEnd(16)} ${tally(counts)} · crashes ${((crashes / runs) * 100).toFixed(1)}%`);
}
