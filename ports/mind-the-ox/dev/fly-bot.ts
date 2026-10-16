import { createBotMemory, botControls } from '../src/engine/bot';
import { TICKS_PER_SECOND } from '../src/engine/constants';
import { createMatch, matchScore, stepMatch } from '../src/engine/match';
import { CHAPTERS } from '../src/game/campaign';
import { planMode, type ModeRequest } from '../src/game/modes';

/**
 * Flies the scripted pilot through a mode and prints how it went: the
 * campaign's chapters by default, or `--daily`, `--classic`, `--dogfight=level`.
 *
 *   npx tsx ports/mind-the-ox/dev/fly-bot.ts
 *   npx tsx ports/mind-the-ox/dev/fly-bot.ts --dogfight=brutal --flight=classic
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
const flight = args.get('flight') === 'classic' ? 'classic' : 'smooth';
const minutes = Number(args.get('minutes') ?? 12);
const seeds = Number(args.get('seeds') ?? 1);

function requests(): ModeRequest[] {
  const level = args.get('dogfight');
  if (level === 'easy' || level === 'normal' || level === 'hard' || level === 'brutal')
    return [{ kind: 'dogfight', opponents: args.get('three') ? 3 : 1, level }];
  if (args.has('classic')) return [{ kind: 'classic' }];
  if (args.has('daily'))
    return [{ kind: 'daily', day: { key: '2026-10-16', number: 2, seed: 4242 }, practice: false }];
  return CHAPTERS.map((chapter) => ({ kind: 'campaign', chapter: chapter.id }));
}

for (const request of requests()) {
  for (let seed = 1; seed <= seeds; seed++) {
    const plan = planMode(request, { seed, flight, autoRoll: true, secretWeapons: false });
    // --endless gives the pilot planes without end: proof every target can be reached and destroyed.
    if (args.has('endless'))
      plan.setup.seats = plan.setup.seats.map((seat, index) =>
        index === 0 ? { ...seat, maxCrashes: Number.POSITIVE_INFINITY } : seat,
      );
    const match = createMatch(plan.setup);
    const memory = createBotMemory();
    let ticks = 0;
    const limit = minutes * 60 * TICKS_PER_SECOND;
    let crashes = 0;
    let lost = 0;
    const causes = new Map<string, number>();
    const note = (key: string) => causes.set(key, (causes.get(key) ?? 0) + 1);
    let falling = false;
    while (match.phase === 'playing' && ticks < limit) {
      const player = match.world.planes[0];
      if (!player) break;
      stepMatch(match, [botControls(match.world, player, memory)]);
      for (const event of match.world.events) {
        if (event.type === 'crash' && event.plane === player.id) {
          crashes += 1;
          if (!falling) note(event.stalled ? 'stalled into the ground' : 'flew into the ground');
        }
        if (event.type === 'plane-down' && event.plane === player.id) {
          lost += 1;
          note(event.cause);
        }
        if (event.type === 'plane-wounded' && event.plane === player.id)
          note(`wounded by ${event.by}`);
      }
      falling = player.state === 'falling';
      ticks += 1;
    }
    const standing = match.world.targets.filter(
      (target) => target.side === 1 && target.standing,
    ).length;
    print(
      [
        plan.label.padEnd(22),
        `seed ${seed}`,
        match.phase === 'sun' ? 'WON ' : match.phase === 'the-end' ? 'LOST' : 'TIME',
        `${(ticks / TICKS_PER_SECOND).toFixed(0).padStart(4)} s`,
        `crashes ${crashes}`,
        `shot down ${lost}`,
        `targets left ${standing}`,
        `score ${matchScore(match, 0)}`,
        [...causes].map(([key, value]) => `${key} ${value}`).join(', '),
      ].join(' · '),
    );
  }
}
