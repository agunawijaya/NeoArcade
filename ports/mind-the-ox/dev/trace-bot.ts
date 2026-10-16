import { createBotMemory, botControls } from '../src/engine/bot';
import { createMatch, stepMatch } from '../src/engine/match';
import { planMode } from '../src/game/modes';

/**
 * The scripted pilot's flight in one chapter, for tuning it: the second
 * before every crash it did not see coming, or every line with --all.
 *
 *   npx tsx ports/mind-the-ox/dev/trace-bot.ts ox-pasture 3600 [--all]
 */

/** Writes a line of the report. */
function print(...parts: unknown[]) {
  process.stdout.write(`${parts.join(' ')}\n`);
}

const chapter = process.argv[2] ?? 'ox-pasture';
const ticks = Number(process.argv[3] ?? 3600);
const everything = process.argv.includes('--all');
const plan = planMode(
  { kind: 'campaign', chapter },
  { seed: 1, flight: 'smooth', autoRoll: true, secretWeapons: false },
);
const match = createMatch(plan.setup);
const memory = createBotMemory();
const recent: string[] = [];
for (let tick = 0; tick < ticks && match.phase === 'playing'; tick++) {
  const plane = match.world.planes[0];
  if (!plane) break;
  const wasFalling = plane.state === 'falling';
  const controls = botControls(match.world, plane, memory);
  stepMatch(match, [controls]);
  const events = match.world.events.filter((event) => 'plane' in event && event.plane === plane.id);
  const line = [
    tick,
    plane.state,
    `x ${plane.x.toFixed(1)} y ${plane.y.toFixed(1)} ground ${match.world.terrain.heightAt(plane.x).toFixed(1)}`,
    `heading ${plane.heading.toFixed(0)} speed ${plane.speed.toFixed(2)}`,
    `pitch ${controls.pitch} throttle ${controls.throttle} bomb ${controls.bomb} home ${plane.homing}`,
    events.map((event) => event.type).join(','),
  ].join(' ');
  if (everything) print(line);
  recent.push(line);
  if (recent.length > 60) recent.shift();
  const rammed = events.find((event) => event.type === 'plane-down' && event.cause === 'rammed');
  if (rammed) {
    const others = match.world.planes
      .filter((other) => other !== plane)
      .map(
        (other) =>
          `${other.pilot.level} ${other.state} x ${other.x.toFixed(0)} y ${other.y.toFixed(0)} heading ${other.heading.toFixed(0)}`,
      );
    print(`--- rammed at ${tick}: ${others.join(' | ')}`);
  }
  const crash = events.find((event) => event.type === 'crash');
  if (crash && !wasFalling && !everything) {
    print(`--- crash at ${tick}`);
    for (const earlier of recent.filter(
      (_, index) => index % 6 === 0 || index === recent.length - 1,
    ))
      print(earlier);
  }
}
