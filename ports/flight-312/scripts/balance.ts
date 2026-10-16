import { loadTerrainSource } from '../src/data/unpack';
import { createFlight, type Deck, type Level, type Mode } from '../src/engine/flight';
import { DESTINATIONS, type DestinationId } from '../src/engine/navdata';
import { createTerrain } from '../src/engine/terrain';
import { flyWithTestPilot } from '../src/engine/test-pilot';

/**
 * Flies the scripted test pilot to every destination at every level and
 * prints what happened: the numbers behind "Balance" in
 * docs/games/flight-312.md. "all" stands for every level or destination;
 * the 1982 Rules always fly the classic deck.
 *
 *   npx tsx ports/flight-312/scripts/balance.ts [level|all] [destination|all] [mode] [deck]
 */
const [onlyLevel, onlyDestination, mode = 'flight', deck = 'classic'] = process.argv
  .slice(2)
  .map((arg) => (arg === 'all' ? undefined : arg));
const levels: Level[] = onlyLevel
  ? [onlyLevel as Level]
  : deck === 'glass'
    ? ['arcade', 'pilot', 'captain']
    : ['rules1982', 'arcade', 'pilot', 'captain'];
const destinations = onlyDestination
  ? [onlyDestination as DestinationId]
  : DESTINATIONS.map((d) => d.id);
const terrain = createTerrain(await loadTerrainSource());

for (const level of levels) {
  for (const destination of destinations) {
    const started = performance.now();
    const flight = createFlight(
      { mode: mode as Mode, level, destination, seed: 312, deck: deck as Deck },
      terrain,
    );
    const outcome = flyWithTestPilot(flight);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const touchdown = outcome?.touchdown;
    const r = flight.readout;
    process.stdout.write(
      [
        level.padEnd(9),
        destination,
        (outcome?.ending ?? 'unfinished').padEnd(16),
        `${Math.round(flight.time / 60)} min`.padStart(7),
        touchdown
          ? `${Math.round(touchdown.sinkFpm)} fpm at ${Math.round(touchdown.along)} ft, ${Math.round(touchdown.across)} ft`
          : '',
        `fuel ${Math.round(r.fuelLb)}`,
        `violations ${outcome?.violations.length ?? 0}`,
        outcome?.violations.map((v) => v.id).join(',') ?? '',
        `(${seconds} s)`,
      ].join('  ') + '\n',
    );
    if (!outcome || outcome.report.severity !== 'success') {
      process.stdout.write(
        `    at ${r.position.lat.toFixed(3)},${r.position.lon.toFixed(3)} alt ${Math.round(r.altitudeFt)} ias ${Math.round(r.iasKt)} atc ${flight.atc.stage} ${flight.atc.workingWith}\n`,
      );
    }
  }
}
