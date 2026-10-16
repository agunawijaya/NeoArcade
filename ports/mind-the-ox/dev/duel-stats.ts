import { createBotMemory, botControls } from '../src/engine/bot';
import { TICKS_PER_SECOND } from '../src/engine/constants';
import { LEVEL_STYLES } from '../src/engine/cpu';
import { createMatch, stepMatch } from '../src/engine/match';
import type { CpuLevel } from '../src/engine/world';
import { planMode } from '../src/game/modes';

/**
 * The scripted pilot against each computer level in dogfights, many times
 * over: how often it wins, how long fights last, and how planes go down.
 * The AI's levels are tuned against these numbers (see the diff log).
 *
 *   npx tsx ports/mind-the-ox/dev/duel-stats.ts --seeds=20 --flight=classic --three
 *   npx tsx ports/mind-the-ox/dev/duel-stats.ts --seeds=200 --fights=normal
 */

/** Writes a line of the report. */
function print(...parts: unknown[]) {
  process.stdout.write(`${parts.join(' ')}\n`);
}

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value] as const;
  }),
);
const seeds = Number(args.get('seeds') ?? 12);
const flight = args.get('flight') === 'classic' ? 'classic' : 'smooth';
const opponents = args.has('three') ? 3 : 1;
// Which computer pilot's style the scripted pilot fights in: --fights=normal.
const fights = (args.get('fights') ?? 'hard') as CpuLevel;
// Tuning experiments: --set=brutal.nudges:false,hard.lead:12
for (const change of args.get('set')?.split(',') ?? []) {
  const [path = '', raw = ''] = change.split(':');
  const [level = '', key = ''] = path.split('.');
  const style = LEVEL_STYLES[level as CpuLevel] as unknown as Record<string, unknown>;
  style[key] = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
}
const levels = (args.get('levels')?.split(',') ?? [
  'easy',
  'normal',
  'hard',
  'brutal',
]) as CpuLevel[];

for (const level of levels) {
  let wins = 0;
  let seconds = 0;
  const causes = new Map<string, number>();
  const count = (key: string) => causes.set(key, (causes.get(key) ?? 0) + 1);
  for (let seed = 1; seed <= seeds; seed++) {
    const plan = planMode(
      { kind: 'dogfight', opponents, level },
      { seed: seed * 7919, flight, autoRoll: true, secretWeapons: false },
    );
    const match = createMatch(plan.setup);
    const memory = createBotMemory(fights);
    const falling = new Set<number>();
    let ticks = 0;
    while (match.phase === 'playing' && ticks < 8 * 60 * TICKS_PER_SECOND) {
      const player = match.world.planes[0];
      if (!player) break;
      stepMatch(match, [botControls(match.world, player, memory)]);
      for (const event of match.world.events) {
        const plane =
          'plane' in event
            ? match.world.planes.find((other) => other.id === event.plane)
            : undefined;
        const who = plane?.side === 0 ? 'bot' : 'cpu';
        if (event.type === 'plane-wounded') count(`${who} wounded by ${event.by}`);
        if (event.type === 'plane-down') count(`${who} down by ${event.cause}`);
        if (event.type === 'crash' && event.stalled) count(`${who} stalled into the ground`);
        else if (event.type === 'crash' && !falling.has(event.plane))
          count(`${who} flew into the ground`);
      }
      falling.clear();
      for (const plane of match.world.planes) if (plane.state === 'falling') falling.add(plane.id);
      ticks += 1;
    }
    if (match.phase === 'sun') wins += 1;
    seconds += ticks / TICKS_PER_SECOND;
  }
  print(`${level} · bot wins ${wins}/${seeds} · ${(seconds / seeds).toFixed(0)} s a fight`);
  for (const [key, value] of [...causes].sort()) print(`    ${key}: ${value}`);
}
