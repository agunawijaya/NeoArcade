import { botControls, createBotMemory } from '../src/engine/bot';
import { TICKS_PER_SECOND } from '../src/engine/constants';
import { createMatch, matchScore, stepMatch } from '../src/engine/match';
import { SEA_CHAPTERS } from '../src/game/at-sea';
import { planMode, type ModeRequest, type PlanOptions } from '../src/game/modes';
import { SORTIE_MISSIONS } from '../src/game/sortie';
import { RoundTally } from '../src/game/stats';
import type { CpuLevel } from '../src/engine/world';

/**
 * How the scripted pilot gets on at sea, for tuning: every At Sea mission,
 * and a few seeds of every Custom Sortie mission. Prints a line per game.
 *
 *   npx tsx ports/mind-the-ox/dev/sea-balance.ts [missions|sorties] [seeds] [--fights=brutal]
 *     [--only=intercept,the-raid] [--level=normal] [--easy]
 *
 * `--level` is the sorties' difficulty (Easy by default); `--easy` puts
 * green pilots in every enemy seat whatever the difficulty.
 * `--endless` gives the scripted pilot as many planes as it needs: whether
 * the mission can be done at all, when time is against it too (a convoy, a
 * carrier to keep), rather than whether this pilot can do it with five.
 */
const LIMIT = 12 * 60 * TICKS_PER_SECOND;

export interface Flown {
  won: boolean;
  seconds: number;
  score: number;
  planesLost: number;
  ditchings: number;
  traps: number;
  bolters: number;
  shipsSunk: number;
  /** How it ended, for a loss: out of planes, a ship we had to keep lost, the convoy lost, or out of time. */
  ending: string;
  /** What brought each of the pilot's planes down. */
  downed: Record<string, number>;
}

/**
 * Flies a mission with the scripted pilot. `easyEnemies` puts green
 * pilots in every enemy seat: the scripted pilot is no match for hard
 * ones, and the question then is whether the mission itself can be done.
 */
export function flyWithBot(
  request: ModeRequest,
  options: Partial<PlanOptions> = {},
  easyEnemies = false,
  fights: CpuLevel = 'hard',
  luck = 0,
): Flown {
  const plan = planMode(request, {
    seed: 5,
    flight: 'smooth',
    autoRoll: true,
    secretWeapons: false,
    ...options,
  });
  const seats = plan.setup.seats.map((seat, index) => {
    if (index === 0 && endless) return { ...seat, maxCrashes: Number.POSITIVE_INFINITY };
    return easyEnemies && seat.pilot.kind === 'cpu'
      ? { ...seat, pilot: { ...seat.pilot, level: 'easy' as const } }
      : seat;
  });
  // A mission's map and match seed are fixed; `luck` gives the same battle different dice.
  const match = createMatch({ ...plan.setup, seats, seed: plan.setup.seed + luck });
  const memory = createBotMemory(fights);
  const player = match.world.planes[0];
  const tally = new RoundTally(player ? [player.id] : [], new Set());
  let ticks = 0;
  const downed: Record<string, number> = {};
  while (match.phase === 'playing' && ticks < LIMIT) {
    const plane = match.world.planes[0];
    stepMatch(match, [plane ? botControls(match.world, plane, memory) : undefined]);
    tally.absorb(match.world, match.world.events);
    for (const event of match.world.events) {
      if (event.type === 'plane-down' && event.plane === player?.id)
        downed[event.cause] = (downed[event.cause] ?? 0) + 1;
      if (event.type === 'crash' && event.plane === player?.id)
        downed.ground = (downed.ground ?? 0) + 1;
    }
    ticks += 1;
  }
  const pilot = player ? tally.pilot(player.id) : undefined;
  return {
    won: match.phase === 'sun',
    seconds: ticks / TICKS_PER_SECOND,
    score: matchScore(match, 0),
    planesLost: tally.sides[0].planesLost,
    ditchings: pilot?.ditchings ?? 0,
    traps: pilot?.traps ?? 0,
    bolters: pilot?.bolters ?? 0,
    shipsSunk: tally.sides[0].shipsSunk,
    ending: endingOf(match),
    downed,
  };
}

function endingOf(match: ReturnType<typeof createMatch>): string {
  if (match.phase === 'sun') return 'won';
  if (match.phase === 'playing') return 'out of time';
  const world = match.world;
  if (world.ships.some((ship) => ship.side === 0 && ship.protect && ship.state !== 'afloat'))
    return 'lost the ship it had to keep';
  const convoy = world.ships.filter((ship) => ship.side === 0 && ship.convoy);
  if (
    convoy.length > 0 &&
    convoy.filter((ship) => ship.state !== 'afloat').length * 2 > convoy.length
  )
    return 'lost the convoy';
  if (world.planes[0]?.state === 'out') return 'out of planes';
  return 'the end';
}

function line(name: string, flown: Flown): string {
  return [
    name.padEnd(30),
    flown.won ? 'won ' : 'lost',
    `${flown.seconds.toFixed(0).padStart(4)} s`,
    `score ${String(flown.score).padStart(5)}`,
    `crashed ${flown.planesLost}`,
    `ditched ${flown.ditchings}`,
    `traps ${flown.traps}`,
    `bolters ${flown.bolters}`,
    `sunk ${flown.shipsSunk}`,
    flown.won ? '' : `${flown.ending} ${JSON.stringify(flown.downed)}`,
  ].join('  ');
}

const flag = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}`))?.split('=')[1] ?? null;
const fights = (flag('fights') ?? 'hard') as CpuLevel;
const only = flag('only')?.split(',') ?? null;
const easy = process.argv.includes('--easy');
const endless = process.argv.includes('--endless');

function missions(seeds: number) {
  for (const chapter of SEA_CHAPTERS) {
    if (only && !only.includes(chapter.id)) continue;
    const request: ModeRequest = { kind: 'at-sea', chapter: chapter.id };
    let wins = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const flown = flyWithBot(request, {}, easy, fights, seed * 7919);
      if (flown.won) wins += 1;
      process.stdout.write(`${line(`${chapter.id} #${seed}`, flown)}\n`);
    }
    process.stdout.write(`  ${chapter.id}: ${wins} of ${seeds} won\n`);
  }
}

function sorties(seeds: number) {
  for (const mission of SORTIE_MISSIONS) {
    if (only && !only.includes(mission.id)) continue;
    let wins = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const flown = flyWithBot(
        {
          kind: 'sortie',
          options: {
            base: 'carrier',
            mission: mission.id,
            enemy: 'both',
            seaState: 1,
            hour: 'day',
            level: (flag('level') ?? 'easy') as CpuLevel,
            theme: 'great-war',
            seed: seed * 1009,
          },
        },
        {},
        easy,
        fights,
      );
      if (flown.won) wins += 1;
      process.stdout.write(`${line(`${mission.id} #${seed}`, flown)}\n`);
    }
    process.stdout.write(`  ${mission.id}: ${wins} of ${seeds} won\n`);
  }
}

const [what = 'missions', seeds = '3'] = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('--'));
if (what === 'missions') missions(Number(seeds));
else sorties(Number(seeds));
