import {
  activeOffences,
  careerBoard,
  careerRig,
  careerSeason,
  finishContract,
  newCareer,
  tripSeed,
  waitADay,
  type Career,
} from '../src/engine/career';
import { contractRoutes, contractTrip, legalFuel, type Contract } from '../src/engine/contracts';
import type { DifficultyId } from '../src/engine/difficulty';
import { startTrip } from '../src/engine/start';
import { DRIVERS, driveTrip, type Driver } from '../src/sim/drivers';

/** Results go to stdout, ready to paste into the docs. */
const print = (text = '') => process.stdout.write(`${text}\n`);

/**
 * Whole careers with each simple driver: take the best-paying load per mile
 * on the board (skipping loads the bank cannot afford to lose), drive the
 * shortest road, and keep going for a season or until the career ends.
 * Prints a Markdown table for docs/games/long-haul.md.
 *
 *   npx tsx ports/long-haul/scripts/career-sim.ts [careers per driver]
 */
const careers = Number(process.argv[2] ?? 200);
const difficulty = (process.env.DIFFICULTY ?? 'normal') as DifficultyId;
const SEASON_DAYS = 90;

interface Outcome {
  status: Career['status'];
  loads: number;
  wrecks: number;
  days: number;
  cashCents: number;
  reputation: number;
}

function pickLoad(career: Career): Contract | null {
  const board = careerBoard(career);
  const ranked = [...board].sort((a, b) => b.payCents / b.miles - a.payCents / a.miles);
  return ranked[0] ?? null;
}

/** A driver who keeps the tank light enough for the scales, as the office screen advises. */
function minding(driver: Driver): Driver {
  if (driver.name === 'reckless') return driver;
  return {
    ...driver,
    atStop(trip, visit) {
      const plan = driver.atStop(trip, visit);
      return {
        ...plan,
        gallons: Math.min(plan.gallons, Math.max(0, legalFuel(trip.load) - Math.floor(trip.fuel))),
      };
    },
  };
}

function runCareer(seed: number, driver: Driver): Outcome {
  let career = newCareer(seed, difficulty);
  let loads = 0;
  while (career.status === 'active' && career.day < SEASON_DAYS) {
    const contract = pickLoad(career);
    if (!contract) {
      career = waitADay(career);
      continue;
    }
    const option = contractRoutes(contract)[0];
    if (!option) {
      career = waitADay(career);
      continue;
    }
    const { trip } = startTrip(
      contractTrip({
        contract,
        option,
        // Worn tyres seldom go on a short haul: the risk grows with the miles driven.
        tyres: contract.miles > 1_500 ? driver.tyres : { kind: 'none' },
        seed: tripSeed(career, contract),
        difficulty: career.difficulty,
        season: careerSeason(career.day),
        offences: activeOffences(career),
        rig: careerRig(career),
        weekday: 0,
        carriedFuel: career.fuel ?? 0,
      }),
    );
    driveTrip(trip, driver);
    career = finishContract(career, contract, trip);
    loads++;
  }
  return {
    status: career.status,
    loads,
    wrecks: career.trips.filter((trip) => trip.outcome === 'crashed').length,
    days: career.day,
    cashCents: career.cashCents,
    reputation: career.reputation,
  };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const percent = (count: number) => `${Math.round((count / careers) * 100)} %`;
const dollars = (cents: number) =>
  `${cents < 0 ? '−' : ''}$${Math.abs(Math.round(cents / 100)).toLocaleString('en-US')}`;

print(`Careers of up to ${SEASON_DAYS} days, ${careers} per driver, ${difficulty}.\n`);
print(
  '| Driver | Still trucking | Licence lost | Repossessed | Median loads | Wrecks per career | Median bank at the end | Median reputation |',
);
print('|---|---|---|---|---|---|---|---|');
for (const [name, driver] of Object.entries(DRIVERS)) {
  const outcomes = Array.from({ length: careers }, (_, index) =>
    runCareer(5_000 + index * 104_729, minding(driver)),
  );
  const count = (status: Career['status']) =>
    outcomes.filter((outcome) => outcome.status === status).length;
  print(
    `| ${name} | ${percent(count('active'))} | ${percent(count('jailed'))} | ${percent(count('repossessed'))} | ${median(outcomes.map((outcome) => outcome.loads))} | ${mean(outcomes.map((outcome) => outcome.wrecks)).toFixed(2)} | ${dollars(median(outcomes.map((outcome) => outcome.cashCents)))} | ${median(outcomes.map((outcome) => outcome.reputation))} |`,
  );
}
