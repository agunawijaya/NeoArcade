import { buildMap, type MapSpec } from '../src/engine/map';
import { createMatch, type Match } from '../src/engine/match';
import { MODERN_RULES, type Rules } from '../src/engine/rules';
import { damageShip } from '../src/engine/ships';
import type { Seat } from '../src/engine/sim';
import { LEFT } from '../src/engine/trig';
import type { Plane, Ship } from '../src/engine/world';
import { base, fly, place, type Scene } from './staging';

/**
 * The Carrier Ops test waters and the moments staged in them for the hero
 * frames: a squadron launching at dawn, a torpedo run on a battleship, a
 * night landing on a pitching deck; and for the damage, a battle squadron
 * after a strike and our carrier after a raid.
 */
export const SEA_SCENES = ['launch', 'torpedo', 'trap', 'aftermath', 'deck-hit'] as const;
export type SeaSceneId = (typeof SEA_SCENES)[number];

/**
 * An enemy coast on the left with its airfield, shore guns and airship
 * sheds; open sea to the cliffs on the right; our carrier steaming west
 * into a light westerly with a destroyer for plane guard; their
 * battleship and its screen off the coast.
 */
export const SEA_TRIALS: MapSpec = {
  name: 'Sea Trials',
  seed: 316,
  layout: 'sea',
  ground: [
    [0, 64],
    [300, 72],
    [600, 58],
    [760, 46],
    [3000, 60],
  ],
  sea: { spans: [{ left: 780, right: 2820, kind: 'sea', shores: ['beach', 'cliff'] }] },
  bases: [
    { side: 0, x: 2060, facing: -1, carrier: 0 },
    { side: 1, x: 300, facing: 1 },
  ],
  targets: [
    { kind: 'tank', side: 1, x: 470 },
    { kind: 'hangar', side: 1, x: 560 },
    { kind: 'hangar', side: 1, x: 600 },
    { kind: 'depot', side: 1, x: 690 },
  ],
  oxen: [],
  fleet: [
    { kind: 'carrier', side: 0, x: 2060, direction: -1, patrol: { left: 1750, right: 2300 } },
    { kind: 'destroyer', side: 0, x: 2230, direction: -1, patrol: { left: 1800, right: 2700 } },
    { kind: 'battleship', side: 1, x: 1180, direction: 1, patrol: { left: 980, right: 1500 } },
    { kind: 'destroyer', side: 1, x: 1030, direction: 1, patrol: { left: 900, right: 1550 } },
    { kind: 'destroyer', side: 1, x: 1390, direction: 1, patrol: { left: 900, right: 1600 } },
    { kind: 'supply', side: 1, x: 900, direction: 1, speed: 0.3 },
  ],
};

const WESTERLY: Partial<Rules> = { wind: 0.4 };

function seaMatch(seats: Seat[], rules: Partial<Rules> = {}): Match {
  const map = buildMap(SEA_TRIALS);
  return createMatch({
    rules: { ...MODERN_RULES, ...WESTERLY, ...rules },
    mapFor: () => map,
    seats,
    seed: 316,
    rounds: 1,
    versus: false,
  });
}

const PLAYER: Seat = {
  side: 0,
  pilot: { kind: 'human', level: 'normal', territory: null },
  base: 0,
  maxCrashes: 5,
};

/** A wingman on our carrier who stays on deck until let go. */
function wingman(): Seat {
  return {
    side: 0,
    pilot: { kind: 'cpu', level: 'hard', territory: { left: 0, right: 0 } },
    base: 0,
    maxCrashes: Number.POSITIVE_INFINITY,
  };
}

export function buildSeaScene(id: SeaSceneId, onTick: (match: Match) => void): Scene {
  if (id === 'launch') return launch(onTick);
  if (id === 'torpedo') return torpedoRun(onTick);
  if (id === 'aftermath') return aftermath(onTick);
  if (id === 'deck-hit') return deckHit(onTick);
  return nightTrap(onTick);
}

/**
 * Dawn: the carrier into the wind, the first of the squadron already
 * climbing away off the bow, the second halfway down the deck at full
 * throttle, the player's plane waiting its turn, engine running.
 */
function launch(onTick: (match: Match) => void): Scene {
  const match = seaMatch([PLAYER, wingman(), wingman()]);
  const [player, second, first] = match.world.planes as [Plane, Plane, Plane];
  const carrier = match.world.ships[0] as Ship;
  const letGo = (plane: Plane) => {
    plane.pilot = { ...plane.pilot, territory: null };
  };
  letGo(first);
  fly(match, 36, () => [{}], onTick);
  letGo(second);
  fly(match, 118, () => [{}], onTick);
  return base(
    { match, focus: player, cameraX: carrier.x - 70, sun: null },
    { hour: 'dawn', label: 'Sea Trials', scoreShown: 0 },
  );
}

/**
 * Low over the water, the torpedo away and running for the battleship,
 * its destroyer screen's guns already firing.
 */
function torpedoRun(onTick: (match: Match) => void): Scene {
  const match = seaMatch([{ ...PLAYER, loadout: 'torpedo' }]);
  const player = match.world.planes[0] as Plane;
  const [, , battleship, screenWest, screenEast] = match.world.ships as Ship[];
  fly(match, 240, () => [{}], onTick);
  if (!battleship || !screenWest || !screenEast) throw new Error('Sea Trials lost its battleship.');
  // Staged: the screen ahead of the battleship and far astern, out of the attacker's way.
  screenWest.x = battleship.x - 170;
  screenEast.x = battleship.x + 620;
  const sea = match.world.map.sea?.level ?? 34;
  place(player, battleship.x + 235, sea + 15, LEFT, 4.6);
  player.throttle = 0.6;
  player.torpedoes = 1;
  // Let go, then climb away through the battleship's flak as the torpedo runs in. The
  // flak only bursts around the plane here: the hero frame is not of its pilot's last moment.
  fly(
    match,
    150,
    (tick) => [{ bomb: tick === 4, pitch: tick > 22 && tick < 40 ? 0.6 : 0, throttle: 1 }],
    (flown) => {
      player.wounded = false;
      onTick(flown);
    },
  );
  return base(
    { match, focus: player, cameraX: battleship.x + 100, sun: null },
    { label: 'Sea Trials', scoreShown: 350 },
  );
}

/**
 * Night, a heavy swell and no help: the pilot on the glide path astern of
 * the carrier, the deck lights rising and falling, the signalman's flags
 * level.
 */
function nightTrap(onTick: (match: Match) => void): Scene {
  const match = seaMatch([PLAYER], { seaState: 2, landingAssist: false });
  const player = match.world.planes[0] as Plane;
  const [carrier, guard] = match.world.ships as Ship[];
  if (!carrier || !guard) throw new Error('Sea Trials lost its carrier.');
  fly(match, 30, () => [{}], onTick);
  // The plane guard is off ahead, out of the picture.
  guard.x = carrier.x + carrier.direction * 260;
  // Astern of the carrier is to its east: it steams west.
  const astern = 64;
  const x = carrier.x - carrier.direction * (60 + astern);
  place(player, x, (match.world.map.sea?.level ?? 34) + 12 + 4.5 + astern * 0.13, LEFT + 70, 4.3);
  player.throttle = 0;
  player.homing = true;
  fly(match, 24, () => [{}], onTick);
  return base(
    { match, focus: player, cameraX: carrier.x - carrier.direction * 70, sun: null },
    { hour: 'dusk', label: 'Sea Trials', scoreShown: 1200 },
  );
}

/**
 * A few seconds after a strike: the battleship holed aft by a torpedo and
 * bombed on its bridge, settling by the stern and burning; one of its
 * destroyers ablaze ahead of it.
 */
function aftermath(onTick: (match: Match) => void): Scene {
  const match = seaMatch([PLAYER]);
  const { world } = match;
  const player = world.planes[0] as Plane;
  const [, , battleship, screen] = world.ships as Ship[];
  if (!battleship || !screen) throw new Error('Sea Trials lost its battleship.');
  fly(match, 120, () => [{}], onTick);
  screen.x = battleship.x + battleship.direction * 190;
  const sea = world.map.sea?.level ?? 34;
  damageShip(world, battleship, 'torpedo', 0, battleship.x - battleship.direction * 34, sea);
  damageShip(
    world,
    battleship,
    'bomb',
    0,
    battleship.x + battleship.direction * 8,
    battleship.y + 24,
  );
  damageShip(world, screen, 'bomb', 0, screen.x - screen.direction * 6, screen.y + 7);
  place(player, battleship.x + 260, sea + 120, LEFT, 4.2);
  fly(match, 240, () => [{ throttle: 0.8 }], onTick);
  return base(
    { match, focus: player, cameraX: battleship.x + 60, sun: null },
    { label: 'Sea Trials', scoreShown: 600 },
  );
}

/** Our carrier after a raid got through: two bombs through the flight deck, still steaming. */
function deckHit(onTick: (match: Match) => void): Scene {
  const match = seaMatch([PLAYER]);
  const { world } = match;
  const player = world.planes[0] as Plane;
  const carrier = world.ships[0] as Ship;
  fly(match, 30, () => [{}], onTick);
  const deck = carrier.y + 12;
  damageShip(world, carrier, 'raid', 1, carrier.x + carrier.direction * 22, deck);
  damageShip(world, carrier, 'raid', 1, carrier.x - carrier.direction * 30, deck);
  place(player, carrier.x - carrier.direction * 200, deck + 50, LEFT, 4.2);
  fly(match, 200, () => [{ throttle: 0.8 }], onTick);
  return base(
    { match, focus: player, cameraX: carrier.x - carrier.direction * 40, sun: null },
    { label: 'Sea Trials', scoreShown: 0 },
  );
}
