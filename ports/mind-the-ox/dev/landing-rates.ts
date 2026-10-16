import { createRng } from '@shared/rng';
import { TICKS_PER_SECOND } from '../src/engine/constants';
import { MODERN_RULES, type Rules } from '../src/engine/rules';
import { step } from '../src/engine/sim';
import { HUMAN, airborne, controls, flatSea, testWorld } from '../src/engine/test-worlds';
import { TURN } from '../src/engine/trig';
import type { Plane } from '../src/engine/world';

/**
 * How often the autopilot (the H key) gets a plane down on a carrier's
 * wires, by sea state, landing assist and round: forty approaches each,
 * from seeded starts all round the ship, at any height and heading. A
 * person flying by hand does worse or better; this is the floor the
 * deck model guarantees.
 *
 *   npx tsx ports/mind-the-ox/dev/landing-rates.ts
 */
const APPROACHES = 40;
const LIMIT = 90 * TICKS_PER_SECOND;

function approach(rules: Partial<Rules>, seed: number) {
  const world = testWorld(flatSea(), { ...MODERN_RULES, ...rules }, [HUMAN], seed);
  const plane = world.planes[0] as Plane;
  const rng = createRng(`landing:${seed}`);
  airborne(
    world,
    plane,
    rng.float(700, 1900),
    rng.float(70, 170),
    rng.chance(0.5) ? 0 : TURN / 2,
    world.tuning.minSpeed + rng.float(0.5, 2),
  );
  plane.homing = true;
  let bolters = 0;
  for (let tick = 0; tick < LIMIT; tick++) {
    step(world, [controls()]);
    for (const event of world.events) {
      if (!('plane' in event) || event.plane !== plane.id) continue;
      if (event.type === 'trap') return { result: 'trap' as const, bolters, seconds: tick / 60 };
      if (event.type === 'bolter') bolters += 1;
      if (event.type === 'ditched' || event.type === 'crash')
        return { result: 'lost' as const, bolters, seconds: tick / 60 };
    }
  }
  return { result: 'none' as const, bolters, seconds: LIMIT / 60 };
}

const print = (text: string) => process.stdout.write(`${text}\n`);
print('sea  assist  round  trapped  lost  none  bolters  mean time');
for (const seaState of [0, 1, 2] as const)
  for (const landingAssist of [true, false])
    for (const round of [0, 2]) {
      const results = Array.from({ length: APPROACHES }, (_, seed) =>
        approach({ seaState, landingAssist, round }, seed + 1),
      );
      const trapped = results.filter((run) => run.result === 'trap');
      const mean = trapped.reduce((sum, run) => sum + run.seconds, 0) / Math.max(1, trapped.length);
      print(
        [
          String(seaState).padEnd(4),
          (landingAssist ? 'on' : 'off').padEnd(7),
          String(round).padEnd(6),
          `${trapped.length}/${APPROACHES}`.padEnd(8),
          String(results.filter((run) => run.result === 'lost').length).padEnd(5),
          String(results.filter((run) => run.result === 'none').length).padEnd(5),
          String(results.reduce((sum, run) => sum + run.bolters, 0)).padEnd(8),
          `${mean.toFixed(1)} s`,
        ].join(' '),
      );
    }
