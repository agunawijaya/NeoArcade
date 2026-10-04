import { CARGO_IDS, type CargoId } from '../src/engine/cargo';
import { DIFFICULTY_IDS, type DifficultyId } from '../src/engine/difficulty';
import { ORIGINAL_ROUTE_IDS, type OriginalRouteId } from '../src/engine/original-routes';
import { singleHaulSetup } from '../src/engine/single-haul';
import { startTrip } from '../src/engine/start';
import { DRIVERS, driveTrip, type Driver } from '../src/sim/drivers';

/** Results go to stdout, ready to paste into the docs. */
const print = (text = '') => process.stdout.write(`${text}\n`);

/**
 * Thousands of seeded Single Haul trips with each simple driver, per route,
 * cargo and difficulty. Prints a Markdown table for docs/games/long-haul.md.
 *
 *   npx tsx ports/long-haul/scripts/balance.ts [trips per cell]
 */
const tripsPerCell = Number(process.argv[2] ?? 300);

interface Cell {
  arrived: number;
  crashed: number;
  jailed: number;
  profitCents: number[];
  late: number;
  spoiled: number;
  hours: number[];
}

function run(
  driver: Driver,
  route: OriginalRouteId,
  cargo: CargoId,
  difficulty: DifficultyId,
): Cell {
  const cell: Cell = {
    arrived: 0,
    crashed: 0,
    jailed: 0,
    profitCents: [],
    late: 0,
    spoiled: 0,
    hours: [],
  };
  for (let index = 0; index < tripsPerCell; index++) {
    const seed = 10_000 + index * 7919;
    const { trip } = startTrip(
      singleHaulSetup({
        route,
        direction: 'east',
        cargo,
        load: 39_000,
        tyres: driver.tyres,
        seed,
        difficulty,
        offences: 0,
      }),
    );
    driveTrip(trip, driver);
    if (trip.status === 'arrived' && trip.settlement) {
      cell.arrived++;
      cell.profitCents.push(trip.settlement.profitCents);
      cell.hours.push(trip.settlement.deliveredHr);
      if (trip.settlement.late) cell.late++;
      if (trip.settlement.spoiled) cell.spoiled++;
    } else if (trip.status === 'crashed') cell.crashed++;
    else if (trip.status === 'jailed') cell.jailed++;
  }
  return cell;
}

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const percent = (count: number) => `${Math.round((count / tripsPerCell) * 100)} %`;
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en')}`;

const difficulties =
  (process.env.DIFFICULTY?.split(',') as DifficultyId[] | undefined) ?? DIFFICULTY_IDS;
for (const difficulty of difficulties) {
  print(`\n### ${difficulty}, ${tripsPerCell} trips a cell\n`);
  print(
    '| Driver | Route | Cargo | Arrived | Crashed | Jailed | Late | Spoiled | Median profit | Median HR |',
  );
  print('|---|---|---|---|---|---|---|---|---|---|');
  for (const driver of Object.values(DRIVERS)) {
    for (const route of ORIGINAL_ROUTE_IDS) {
      for (const cargo of CARGO_IDS) {
        const cell = run(driver, route, cargo, difficulty);
        print(
          `| ${driver.name} | ${route} | ${cargo} | ${percent(cell.arrived)} | ${percent(cell.crashed)} | ${percent(cell.jailed)} | ${percent(cell.late)} | ${percent(cell.spoiled)} | ${dollars(median(cell.profitCents))} | ${median(cell.hours)} |`,
        );
      }
    }
  }
}
