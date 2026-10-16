import { botControls, createBotMemory } from '../src/engine/bot';
import { createMatch, stepMatch } from '../src/engine/match';
import { planMode, type ModeRequest } from '../src/game/modes';
import { objectiveStatus } from '../src/game/session';
import { parseSortieCode } from '../src/game/sortie';
import { THEMES } from '../src/themes';

/**
 * Follows the scripted pilot through one mission and prints what went
 * wrong: every time it was hit, ditched or caught a wire, every ship
 * lost, and how things stood at the end.
 *
 *   npx tsx ports/mind-the-ox/dev/trace-sea.ts <at-sea mission id | sortie code> [all]
 */
const which = process.argv[2] ?? 'deck-trials';
const verbose = process.argv[3] === 'all';
const sortie = parseSortieCode(which);
const request: ModeRequest = sortie
  ? { kind: 'sortie', options: sortie }
  : { kind: 'at-sea', chapter: which };
const plan = planMode(request, { seed: 5, flight: 'smooth', autoRoll: true, secretWeapons: false });
const match = createMatch(plan.setup);
const memory = createBotMemory();
const print = (text: string) => process.stdout.write(`${text}\n`);
const PILOT_EVENTS = [
  'ditched',
  'plane-down',
  'trap',
  'bolter',
  'touch-and-go',
  'out',
  'crash',
  'plane-wounded',
];
const SHIP_EVENTS = [
  'ship-sinking',
  'torpedo-hit',
  'raider-bombs',
  'torpedo-away',
  'torpedo-broke',
];
let tick = 0;
for (; tick < 60 * 720 && match.phase === 'playing'; tick++) {
  const plane = match.world.planes[0];
  stepMatch(match, [plane ? botControls(match.world, plane, memory) : undefined]);
  for (const event of match.world.events) {
    const mine = 'plane' in event && event.plane === plane?.id;
    if (
      (mine && (verbose || PILOT_EVENTS.includes(event.type))) ||
      SHIP_EVENTS.includes(event.type)
    )
      print(
        `${(tick / 60).toFixed(1)}s ${JSON.stringify(event)} plane ${plane?.state} x ${plane?.x.toFixed(0)} y ${plane?.y.toFixed(0)}`,
      );
  }
}
const world = match.world;
const status = objectiveStatus(world, plan.setup.objectives ?? [], THEMES['great-war']);
print(`${which}: ${match.phase} at ${(tick / 60).toFixed(0)} s; ${status}`);
print(`  pilot crashes ${world.planes[0]?.crashes} state ${world.planes[0]?.state}`);
for (const ship of world.ships)
  print(
    `  ${ship.side} ${ship.kind} ${ship.state} hp ${ship.hitPoints.toFixed(0)} x ${ship.x.toFixed(0)} escaped ${ship.escaped}`,
  );
