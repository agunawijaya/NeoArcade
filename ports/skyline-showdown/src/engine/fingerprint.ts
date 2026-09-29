import { createRng } from '@shared/rng';
import { createMatch, startNextRound, takeTurn, type MatchOptions, type MatchState } from './match';
import { POWER_UP_KINDS } from './powerups';
import type { ShotRecord } from './shot';
import type { TwistKind } from './twists';

/**
 * A fingerprint of the engine: a set of seeded matches on every world, with
 * every twist and power-up, hashed down to the last bit of every point and
 * event. Two JavaScript engines that compute the same fingerprint throw
 * every banana the same way, which is what a Daily Skyline or a challenge
 * link needs (ADR 0012). One hash per throw, so a disagreement can be
 * pinned to the throw where it starts.
 */
interface Scenario {
  name: string;
  options: MatchOptions;
}

const THROWS_PER_SCENARIO = 24;

const scenario = (
  name: string,
  seed: number,
  world: MatchOptions['world'],
  twists: TwistKind[] = [],
): Scenario => ({
  name,
  options: { seed, world, points: 20, format: 'total', powerUps: POWER_UP_KINDS, twists },
});

const SCENARIOS: readonly Scenario[] = [
  scenario('earth', 11, 'earth'),
  scenario('moon', 12, 'moon'),
  scenario('mars', 13, 'mars'),
  scenario('jupiter', 14, 'jupiter'),
  scenario('random worlds', 15, 'random'),
  scenario('gusts and drone', 16, 'earth', ['gusts', 'drone']),
  scenario('supertall and jet stream', 17, 'earth', ['supertall', 'jetStream']),
  scenario('hidden wind on a hillside', 18, 'mars', ['hiddenWind', 'hillside']),
  scenario('springy ground and drone', 19, 'moon', ['bouncy', 'drone']),
  scenario('dust devil', 20, 'mars', ['dustDevil']),
  scenario('lightning in a storm', 21, 'jupiter', ['lightning', 'gusts', 'jetStream']),
];

/** One line per scenario: its name, then a hash for each throw. */
export function engineTrace(): string[] {
  return SCENARIOS.map(({ name, options }) => {
    const state = createMatch(options);
    // The throws themselves come from integer-only randomness, so they are the same everywhere.
    const hands = createRng(options.seed ^ 0xf1a9);
    const hashes: string[] = [];
    for (let turn = 0; turn < THROWS_PER_SCENARIO; turn++) {
      if (statusOf(state) === 'roundOver') startNextRound(state);
      if (statusOf(state) === 'matchOver') break;
      const result = takeTurn(state, {
        angle: hands.float(8, 82),
        velocity: hands.int(12, 130),
        usePowerUp: hands.chance(0.5),
      });
      hashes.push(hashOf(result.shot, state));
    }
    return `${name}: ${hashes.join(' ')}`;
  });
}

/** The whole trace as one short hash. */
export function engineFingerprint(): string {
  const hash = new BitHash();
  for (const line of engineTrace()) hash.text(line);
  return hash.hex();
}

function hashOf(shot: ShotRecord, state: MatchState): string {
  const hash = new BitHash();
  hashShot(hash, shot);
  for (const crater of state.round.terrain.craters) {
    hash.number(crater.x);
    hash.number(crater.y);
    hash.number(crater.radius);
  }
  hash.number(state.round.wind);
  return hash.hex();
}

/** A hash of every point and event of one shot, to the last bit. */
export function shotFingerprint(shot: ShotRecord): string {
  const hash = new BitHash();
  hashShot(hash, shot);
  return hash.hex();
}

function hashShot(hash: BitHash, shot: ShotRecord) {
  for (const track of shot.tracks) {
    hash.number(track.id);
    hash.number(track.startStep);
    for (const point of track.points) {
      hash.number(point.x);
      hash.number(point.y);
    }
  }
  for (const event of shot.events) {
    hash.text(event.type);
    hash.number(event.step);
    hash.number(event.x);
    hash.number(event.y);
  }
  hash.number(shot.steps);
  hash.number(shot.victim ?? -1);
}

function statusOf(state: MatchState): MatchState['status'] {
  return state.status;
}

/** FNV-1a over the exact bytes of each number, so the last bit counts. */
class BitHash {
  private hash = 0x811c9dc5;
  private readonly view = new DataView(new ArrayBuffer(8));

  number(value: number) {
    this.view.setFloat64(0, value);
    for (let index = 0; index < 8; index++) this.byte(this.view.getUint8(index));
  }

  text(value: string) {
    for (let index = 0; index < value.length; index++) this.byte(value.charCodeAt(index) & 0xff);
  }

  hex(): string {
    return (this.hash >>> 0).toString(16).padStart(8, '0');
  }

  private byte(value: number) {
    this.hash ^= value;
    this.hash = Math.imul(this.hash, 0x01000193);
  }
}
