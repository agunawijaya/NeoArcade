import { autopilotControls } from './autopilot';
import { homeX } from './deck';
import { BULLET_LIFE_MOVES, CEILING, MAX_THROTTLE, TICKS_PER_MOVE } from './constants';
import { isAirborne } from './damage';
import { MAX_TURN_RATE } from './flight';
import { weightedRangeSquared } from './geometry';
import { isSpotted } from './sight';
import { pitchToward, wantsToRollUpright } from './steering';
import { CLASSIC_STEP, DOWN, HALF_TURN, cosine, headingDelta, headingOf, sine } from './trig';
import { IDLE_CONTROLS, type Controls, type CpuLevel, type Plane, type World } from './world';

/**
 * The computer pilots, rebuilt from how the 1984 ones behave. Each move a
 * CPU picks one of three stick positions (centre, push, pull) by trying
 * each a move ahead: the one that ends nearest its aim point without
 * running into the ground, a target or an ox wins. It fires when a bullet
 * it imagines firing would hit, and when nothing is near it cruises high
 * over its own stretch of the world. The levels change how often it
 * thinks, how far ahead it looks and how well it aims (see ADR 0032).
 */

/** Beyond this, a CPU turns back towards its aim point the long way round. */
const FAR_AWAY = 160;
/** Heights of the plane's middle over the ground: above SAFE nothing is checked, below DANGER is too low. */
const SAFE_ALTITUDE = 42;
const DANGER_ALTITUDE = 14;
/** How far ahead along its heading a pilot who minds the ground looks for rising land … */
const LOOKOUT = 64;
/** … when this close to either end of the world, where the mountains are. */
const END_ZONE = 240;
/** How wide a berth a pilot who sees birds gives a flock, and a single bird. */
const FLOCK_CLEARANCE = 14;
const BIRD_CLEARANCE = 7;
/** Keeping this far under the ceiling stops a chase from ending in a stall. */
const CEILING_MARGIN = 8;
/** Climbing out of an airfield or away from the ground, at about twenty degrees. */
const CLIMB_OUT = 230;
/** 1984 measured "near" within a 125-unit box and ranked everything farther by a rough distance. */
const NEAR_BOX = 125;
/** Ending a move this close to another plane is a collision waiting to happen. */
const RAM_DISTANCE = 18;

interface LevelStyle {
  /** Ticks between decisions: a move (five ticks) is 1984's pace. */
  thinkTicks: number;
  /** Misjudges where its quarry will be by a few units each time it thinks. */
  wobbles: boolean;
  /** Breaks away when an enemy gets onto its tail with its guns lined up. */
  evades: boolean;
  /** Moves of look-ahead when choosing the stick. */
  lookAhead: 1 | 2;
  /** Ticks of the enemy's motion to lead the aim point by. */
  lead: number;
  /** Chance of pulling the trigger when a shot would land. */
  trigger: number;
  /** Only takes shots that land within the first third of a bullet's life. */
  shortShotsOnly: boolean;
  maxThrottle: number;
  /** Heads home to heal a wound when nobody is close. */
  healsWounds: boolean;
  /** 1984's computer nudged its own position a unit to line up a shot; only the Brutal pilot still does. */
  nudges: boolean;
  /** Answers a missile on its tail with a starburst. */
  usesStarbursts: boolean;
  /** Only goes after enemies within this horizontal distance. */
  attackRange: number;
  /** Moves ahead it checks, stick held, for running into another plane. */
  ramHorizon: number;
  /** In smooth flight, tries half a pull and half a push as well as the full ones: finer aim. */
  fineStick: boolean;
  /** How far behind its quarry it tries to sit: closer is deadlier, and riskier. */
  tailDistance: number;
  /** Knows how much height a dive needs to pull out of; 1984's pilots, and Easy, did not. */
  minds: boolean;
  /** Steers round birds and flocks instead of flying through them. */
  seesBirds: boolean;
}

export const LEVEL_STYLES: Readonly<Record<CpuLevel, LevelStyle>> = {
  easy: {
    thinkTicks: 2 * TICKS_PER_MOVE,
    wobbles: true,
    evades: false,
    lookAhead: 1,
    lead: 0,
    trigger: 0.35,
    shortShotsOnly: true,
    maxThrottle: 3,
    healsWounds: false,
    nudges: false,
    usesStarbursts: false,
    attackRange: 240,
    ramHorizon: 3,
    fineStick: false,
    tailDistance: 32,
    minds: false,
    seesBirds: false,
  },
  normal: {
    thinkTicks: TICKS_PER_MOVE,
    wobbles: false,
    evades: false,
    lookAhead: 1,
    lead: 0,
    trigger: 0.55,
    shortShotsOnly: false,
    maxThrottle: MAX_THROTTLE,
    healsWounds: false,
    nudges: false,
    usesStarbursts: false,
    attackRange: Number.POSITIVE_INFINITY,
    ramHorizon: 3,
    fineStick: false,
    tailDistance: 32,
    minds: true,
    seesBirds: false,
  },
  hard: {
    thinkTicks: TICKS_PER_MOVE,
    wobbles: false,
    evades: true,
    lookAhead: 2,
    lead: 10,
    trigger: 1,
    shortShotsOnly: false,
    maxThrottle: MAX_THROTTLE,
    healsWounds: true,
    nudges: false,
    usesStarbursts: true,
    attackRange: Number.POSITIVE_INFINITY,
    ramHorizon: 5,
    fineStick: false,
    tailDistance: 24,
    minds: true,
    seesBirds: false,
  },
  brutal: {
    thinkTicks: 2,
    wobbles: false,
    evades: true,
    lookAhead: 2,
    lead: 10,
    trigger: 1,
    shortShotsOnly: false,
    maxThrottle: MAX_THROTTLE,
    healsWounds: true,
    nudges: true,
    usesStarbursts: true,
    attackRange: Number.POSITIVE_INFINITY,
    ramHorizon: 6,
    fineStick: true,
    tailDistance: 14,
    minds: true,
    seesBirds: true,
  },
};

/** What a computer pilot does this tick; `level` lets the scripted pilot borrow a style. */
export function cpuControls(
  world: World,
  plane: Plane,
  level: CpuLevel = plane.pilot.level,
): Controls {
  const style = LEVEL_STYLES[level];
  if (world.tick % style.thinkTicks !== 0) return holdFor(plane);
  plane.cpu.held = decide(world, plane, style);
  return plane.cpu.held;
}

/** Between decisions the stick stays where it was; the trigger is only pulled on a decision. */
function holdFor(plane: Plane): Controls {
  return {
    ...plane.cpu.held,
    fire: false,
    bomb: false,
    missile: false,
    starburst: false,
    flip: false,
  };
}

function decide(world: World, plane: Plane, style: LevelStyle): Controls {
  const quarry =
    isAirborne(plane) || plane.state === 'parked' ? findQuarry(world, plane, style) : null;
  plane.cpu.quarry = quarry ? quarry.id : null;

  // A defender with its own stretch of the world waits on the ground, as in 1984; a free hunter patrols.
  if (plane.state === 'parked' && !quarry && plane.pilot.territory) return { ...IDLE_CONTROLS };
  // Being wheeled along a deck after landing: nothing to do but wait.
  if (plane.state === 'rolling' && plane.base.carrier !== undefined) return { ...IDLE_CONTROLS };
  // A wounded pilot goes home to be patched up: the sharp ones always, and anyone flying off a carrier.
  const heals = style.healsWounds || plane.base.carrier !== undefined;
  if (plane.wounded && heals && (!quarry || distanceTo(plane, quarry) > 100)) {
    return autopilotControls(world, plane);
  }

  const controls: Controls = { ...IDLE_CONTROLS };
  if (plane.state === 'stalled' && plane.heading !== DOWN) {
    controls.pitch = pitchToward(plane, DOWN, 0);
    controls.throttle = 1;
    return controls;
  }
  const onTheGround = plane.state === 'parked' || plane.state === 'launching';
  if (onTheGround || plane.y - world.terrain.heightAt(plane.x) < DANGER_ALTITUDE) {
    climbOut(plane, controls);
    return controls;
  }

  const courseShift = (world.tick / TICKS_PER_MOVE) % 32 < 16 ? 16 : 0;
  let aimX: number;
  let aimY: number;
  if (quarry) {
    if (quarry.speed > 0) {
      aimX = quarry.x + quarry.vx * style.lead - cosine(quarry.heading) * style.tailDistance;
      aimY = quarry.y + quarry.vy * style.lead - sine(quarry.heading) * style.tailDistance;
    } else {
      aimX = quarry.x;
      aimY = quarry.y + 4;
    }
    if (style.wobbles) {
      aimX += world.rng.float(-20, 20);
      aimY += world.rng.float(-12, 12);
    }
  } else {
    const third = world.map.width / 3;
    aimX = Math.min(2 * third, Math.max(third, homeX(world, plane))) + courseShift;
    aimY = CEILING - 50 - courseShift / 2;
  }

  const threat = style.evades ? threatTo(world, plane) : null;
  if (threat) breakAway(world, plane, style, threat, controls);
  else steer(world, plane, style, aimX, aimY, courseShift, controls);
  if (quarry) pullTrigger(world, plane, quarry, style, controls);
  if (style.usesStarbursts && world.rules.secretWeapons && isChased(world, plane))
    controls.starburst = true;
  return controls;
}

/** An enemy close behind with its nose on this plane: the moment to break. */
const THREAT_RANGE = 90;
const THREAT_CONE = CLASSIC_STEP / 2;

function threatTo(world: World, plane: Plane): Plane | null {
  for (const other of world.planes) {
    if (other.side === plane.side || other.ghost || !isAirborne(other)) continue;
    const dx = plane.x - other.x;
    const dy = plane.y - other.y;
    if (dx * dx + dy * dy > THREAT_RANGE * THREAT_RANGE) continue;
    if (!isSpotted(world, other, plane.x, plane.y)) continue;
    if (Math.abs(headingDelta(other.heading, headingOf(dx, dy))) <= THREAT_CONE) return other;
  }
  return null;
}

/**
 * Turns hard out of the enemy's line of fire: of the safe stick positions,
 * the one that ends furthest off the line its guns point along.
 */
function breakAway(
  world: World,
  plane: Plane,
  style: LevelStyle,
  threat: Plane,
  controls: Controls,
) {
  const lineX = cosine(threat.heading);
  const lineY = sine(threat.heading);
  let best: { pitch: number; offset: number } | null = null;
  for (const pitch of [1, -1, 0]) {
    const option = evaluate(world, plane, style, pitch, plane.x, plane.y);
    if (option.crash) continue;
    const ahead = oneMoveAhead(
      world,
      plane,
      { x: plane.x, y: plane.y, heading: plane.heading, speed: plane.speed },
      pitch,
    );
    const offset = Math.abs((ahead.x - threat.x) * lineY - (ahead.y - threat.y) * lineX);
    if (!best || offset > best.offset) best = { pitch, offset };
  }
  controls.pitch = best ? best.pitch : 1;
  controls.throttle = 1;
}

/** Full throttle and a steady climb, the right way up, until there is room to manoeuvre. */
function climbOut(plane: Plane, controls: Controls) {
  controls.throttle = 1;
  const facingRight = cosine(plane.heading) >= 0;
  controls.pitch = pitchToward(plane, facingRight ? CLIMB_OUT : HALF_TURN - CLIMB_OUT, 0);
  // Down a deck the stick stays forward until the bow: a carrier take-off is all the speed there is.
  if (plane.state === 'parked' || plane.state === 'launching') controls.pitch = 0;
  if (wantsToRollUpright(plane)) controls.flip = true;
}

/** In 1984 a CPU only went after the player inside its own stretch of the world. */
function findQuarry(world: World, plane: Plane, style: LevelStyle): Plane | null {
  let best: Plane | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const other of world.planes) {
    if (other.side === plane.side || other.ghost || !isAirborne(other)) continue;
    if (!isSpotted(world, other, plane.x, plane.y)) continue;
    const territory = plane.pilot.territory;
    if (territory && (other.x < territory.left || other.x > territory.right)) continue;
    const distance = Math.abs(other.x - plane.x);
    if (distance > style.attackRange || distance >= bestDistance) continue;
    best = other;
    bestDistance = distance;
  }
  return best;
}

function distanceTo(plane: Plane, other: Plane): number {
  return Math.abs(other.x - plane.x) + Math.abs(other.y - plane.y);
}

function steer(
  world: World,
  plane: Plane,
  style: LevelStyle,
  aimX: number,
  aimY: number,
  courseShift: number,
  controls: Controls,
) {
  const dx = plane.x - aimX;
  if (Math.abs(dx) > FAR_AWAY) {
    const awayFromAim = plane.vx !== 0 && dx < 0 === plane.vx < 0;
    if (awayFromAim) {
      if (plane.cpu.longWay === 0) plane.cpu.longWay = plane.y > CEILING - 50 ? 2 : 1;
      chooseStick(
        world,
        plane,
        style,
        plane.x,
        plane.y + (plane.cpu.longWay === 1 ? 25 : -25),
        controls,
      );
    } else {
      plane.cpu.longWay = 0;
      const cruise = Math.min(plane.y + 100, CEILING - 50 - courseShift);
      chooseStick(world, plane, style, plane.x + (dx < 0 ? 150 : -150), cruise, controls);
    }
    return;
  }
  plane.cpu.longWay = 0;
  if (style.nudges && plane.speed > 0) nudge(plane, aimX, aimY);
  chooseStick(world, plane, style, aimX, aimY, controls);
}

/** The Brutal pilot's old trick: slide a unit towards the line of fire. */
function nudge(plane: Plane, aimX: number, aimY: number) {
  const dy = plane.y - aimY;
  const dx = plane.x - aimX;
  if (dy !== 0 && Math.abs(dy) < 6)
    plane.y = Math.min(CEILING - CEILING_MARGIN, plane.y + (dy < 0 ? 1 : -1));
  else if (dx !== 0 && Math.abs(dx) < 6) plane.x += dx < 0 ? 1 : -1;
}

interface Option {
  pitch: number;
  range: number;
  crash: boolean;
  /** The danger is another plane, not the ground. */
  rams: boolean;
  /** Height at the end of the look-ahead. */
  endY: number;
  /** Room to spare: to the ground below or the ceiling above, whichever is nearer. */
  clearance: number;
}

/**
 * Tries centre, push and pull a move (or two) ahead and keeps the one that
 * gets nearest without danger; if every choice is dangerous it takes
 * whichever leaves the most room, throttling back unless that room is
 * below the ceiling.
 */
function chooseStick(
  world: World,
  plane: Plane,
  style: LevelStyle,
  aimX: number,
  aimY: number,
  controls: Controls,
) {
  const fine = style.fineStick && world.rules.flight === 'smooth';
  const sticks = fine ? [0, -1, 1, -0.5, 0.5] : [0, -1, 1];
  const options = sticks.map((pitch) => evaluate(world, plane, style, pitch, aimX, aimY));
  const threat = options.some((option) => option.rams) ? closestPlane(world, plane) : null;
  if (threat) {
    // Two planes both swerving the same way would meet anyway: the higher one
    // climbs and the lower one dives, so they always part.
    const up = plane.y > threat.y || (plane.y === threat.y && plane.id > threat.id);
    const parted = options
      .filter((option) => option.clearance >= DANGER_ALTITUDE)
      .reduce<Option | null>(
        (best, option) =>
          !best || (up ? option.endY > best.endY : option.endY < best.endY) ? option : best,
        null,
      );
    if (parted) {
      controls.pitch = parted.pitch;
      controls.throttle = 1;
      return;
    }
  }
  const safe = options.filter((option) => !option.crash);
  const near = safe.filter((option) => option.range >= 0);
  let chosen: Option | undefined;
  if (near.length > 0)
    chosen = near.reduce((best, option) => (option.range < best.range ? option : best));
  else if (safe.length > 0)
    chosen = safe.reduce((best, option) => (option.range > best.range ? option : best));

  if (chosen) {
    controls.throttle = plane.throttle < style.maxThrottle ? 1 : 0;
  } else {
    chosen = options.reduce((best, option) => (option.clearance > best.clearance ? option : best));
    controls.throttle = plane.y > CEILING - 40 ? 1 : -1;
  }
  if (plane.speed < world.tuning.minSpeed && plane.throttle < style.maxThrottle)
    controls.throttle = 1;
  controls.pitch = chosen.pitch;
  if (chosen.pitch === 0 && wantsToRollUpright(plane)) controls.flip = true;
}

function evaluate(
  world: World,
  plane: Plane,
  style: LevelStyle,
  pitch: number,
  aimX: number,
  aimY: number,
): Option {
  let state = { x: plane.x, y: plane.y, heading: plane.heading, speed: plane.speed };
  let crash = false;
  let clearance = Number.POSITIVE_INFINITY;
  for (let step = 0; step < style.lookAhead; step++) {
    // The second move ahead holds the stick centred: a plan, not a dance.
    state = oneMoveAhead(world, plane, state, step === 0 ? pitch : 0);
    const altitude = state.y - world.terrain.heightAt(state.x);
    clearance = Math.min(clearance, altitude, CEILING - state.y);
    if (isDangerous(world, state.x, state.y, altitude)) crash = true;
    if (style.seesBirds && meetsBird(world, state.x, state.y, (step + 1) * TICKS_PER_MOVE))
      crash = true;
  }
  if (style.minds) {
    if (pullOutLoss(world, state) > state.y - world.terrain.heightAt(state.x) - DANGER_ALTITUDE)
      crash = true;
    // Near the world's ends the land rises in a wall to the sky: see it coming, turn back in time.
    if (state.x < END_ZONE || state.x > world.map.width - END_ZONE) {
      const wall = clearanceAhead(world, state);
      clearance = Math.min(clearance, wall);
      if (wall < DANGER_ALTITUDE) crash = true;
    }
  }
  // Holding the stick where it is, would this run into another plane?
  let probe = { x: plane.x, y: plane.y, heading: plane.heading, speed: plane.speed };
  let rams = false;
  for (let step = 0; step < style.ramHorizon && !rams; step++) {
    probe = oneMoveAhead(world, plane, probe, pitch);
    if (wouldRam(world, plane, probe.x, probe.y, step + 1)) rams = true;
  }
  return {
    pitch,
    range: rangeTo(state.x, state.y, aimX, aimY),
    crash: crash || rams,
    rams,
    endY: state.y,
    clearance,
  };
}

function oneMoveAhead(
  world: World,
  plane: Plane,
  from: { x: number; y: number; heading: number; speed: number },
  pitch: number,
) {
  const turn = world.rules.flight === 'classic' ? CLASSIC_STEP : MAX_TURN_RATE * TICKS_PER_MOVE;
  const heading = from.heading + pitch * turn * (plane.inverted ? -1 : 1);
  // 1984's planner assumed the plane would be a little faster next move.
  const speed = Math.min(world.tuning.maxSpeed, Math.max(world.tuning.minSpeed, from.speed + 1));
  return { x: from.x + cosine(heading) * speed, y: from.y + sine(heading) * speed, heading, speed };
}

/** Close range ranks by squared distance; far away by a rough straight-line guess, negated. */
function rangeTo(x: number, y: number, aimX: number, aimY: number): number {
  const dx = Math.abs(x - aimX);
  const dy = Math.abs(y - aimY) * 1.5;
  if (dx < NEAR_BOX && dy < NEAR_BOX) return dx * dx + dy * dy;
  const long = Math.max(dx, dy);
  const short = Math.min(dx, dy);
  return -((7 * long + 4 * short) / 8);
}

/** The nearest other plane in the air, the one a ram would be with. */
function closestPlane(world: World, plane: Plane): Plane | null {
  let best: Plane | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const other of world.planes) {
    if (other === plane || other.ghost || !isAirborne(other)) continue;
    const distance =
      (other.x - plane.x) * (other.x - plane.x) + (other.y - plane.y) * (other.y - plane.y);
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Whether being at (x, y) a few moves from now would put this plane into
 * another one, flying on as it is. 1984's pilots never looked; these do,
 * so a chase ends in a shot rather than both planes going down together.
 */
function wouldRam(world: World, plane: Plane, x: number, y: number, moves: number): boolean {
  return world.planes.some((other) => {
    if (other === plane || other.ghost || !isAirborne(other)) return false;
    const ahead = moves * TICKS_PER_MOVE;
    const dx = other.x + other.vx * ahead - x;
    const dy = other.y + other.vy * ahead - y;
    return dx * dx + dy * dy < RAM_DISTANCE * RAM_DISTANCE;
  });
}

/**
 * The height a dive loses before the nose comes back to level, pulling
 * hard all the way: a move at a time, a sixteenth of a turn a move.
 */
function pullOutLoss(world: World, state: { heading: number; speed: number }): number {
  const step = world.rules.flight === 'classic' ? CLASSIC_STEP : MAX_TURN_RATE * TICKS_PER_MOVE;
  let heading = state.heading;
  let loss = 0;
  for (let move = 0; move < 8 && sine(heading) < 0; move++) {
    loss -= sine(heading) * state.speed;
    const level = cosine(heading) >= 0 ? 0 : HALF_TURN;
    heading += Math.sign(headingDelta(heading, level)) * step;
  }
  return loss;
}

/**
 * The least height the plane would have over the land ahead, flying on at
 * its heading for a few moves: low when a slope rises faster than it climbs.
 */
function clearanceAhead(world: World, state: { x: number; y: number; heading: number }): number {
  const across = cosine(state.heading);
  const direction = across >= 0 ? 1 : -1;
  const climb = sine(state.heading) / Math.max(0.2, Math.abs(across));
  let least = Number.POSITIVE_INFINITY;
  for (let ahead = 8; ahead <= LOOKOUT; ahead += 8) {
    const ground = world.terrain.heightAt(state.x + direction * ahead);
    least = Math.min(least, state.y + climb * ahead - ground);
  }
  return least;
}

/** Whether a bird or a flock, flying on as it is, will be within reach of (x, y) in `ticks`. */
function meetsBird(world: World, x: number, y: number, ticks: number): boolean {
  const near = (otherX: number, otherY: number, reach: number) =>
    (otherX - x) * (otherX - x) + (otherY - y) * (otherY - y) < reach * reach;
  return (
    world.flocks.some((flock) => near(flock.x + flock.vx * ticks, flock.y, FLOCK_CLEARANCE)) ||
    world.birds.some((bird) =>
      near(bird.x + bird.vx * ticks, bird.y + bird.vy * ticks, BIRD_CLEARANCE),
    )
  );
}

/** Brushing the ceiling (a stall), too low over open ground, or low over a target or an ox. */
function isDangerous(world: World, x: number, y: number, altitude: number): boolean {
  if (y > CEILING - CEILING_MARGIN) return true;
  if (altitude > SAFE_ALTITUDE) return false;
  if (altitude < DANGER_ALTITUDE) return true;
  for (const target of world.targets) {
    if (Math.abs(target.x - x) > 32) continue;
    if (y <= target.y + (target.standing ? target.height + 12 : 6)) return true;
  }
  for (const ox of world.oxen) {
    if (Math.abs(ox.x - x) <= 32 && y <= ox.y + 20) return true;
  }
  return false;
}

/**
 * Imagines a bullet fired now and the enemy flying on as it is, move by
 * move for a bullet's life: if they meet, fire (or launch a missile at a
 * long shot, when there are missiles).
 */
function pullTrigger(
  world: World,
  plane: Plane,
  quarry: Plane,
  style: LevelStyle,
  controls: Controls,
) {
  const verdict = wouldHit(world, plane, quarry);
  if (verdict === 'miss') return;
  if (verdict === 'long' && style.shortShotsOnly) return;
  if (style.trigger < 1 && !world.rng.chance(style.trigger)) return;
  if (
    verdict === 'long' &&
    world.rules.secretWeapons &&
    plane.missiles > 0 &&
    plane.missileCooldown === 0
  ) {
    controls.missile = true;
    return;
  }
  controls.fire = true;
}

function wouldHit(world: World, plane: Plane, quarry: Plane): 'miss' | 'short' | 'long' {
  const bulletSpeed = plane.speed + world.tuning.bulletSpeed;
  let bulletX = plane.x;
  let bulletY = plane.y;
  const bulletDx = cosine(plane.heading) * bulletSpeed;
  const bulletDy = sine(plane.heading) * bulletSpeed;
  let quarryX = quarry.x;
  let quarryY = quarry.y;
  const quarryDx = quarry.vx * TICKS_PER_MOVE;
  const quarryDy = quarry.vy * TICKS_PER_MOVE;
  let previous = Number.POSITIVE_INFINITY;
  for (let move = 0; move < BULLET_LIFE_MOVES; move++) {
    bulletX += bulletDx;
    bulletY += bulletDy;
    quarryX += quarryDx;
    quarryY += quarryDy;
    const range = weightedRangeSquared(bulletX - quarryX, bulletY - quarryY);
    if (range > previous) return 'miss';
    previous = range;
    if (Math.abs(bulletX - quarryX) <= 8 && Math.abs(bulletY - quarryY) <= 5) {
      return move > BULLET_LIFE_MOVES / 3 ? 'long' : 'short';
    }
  }
  return 'miss';
}

function isChased(world: World, plane: Plane): boolean {
  return world.missiles.some(
    (missile) =>
      missile.quarry === plane.id &&
      !missile.burnedOut &&
      Math.abs(missile.x - plane.x) < 90 &&
      Math.abs(missile.y - plane.y) < 60,
  );
}
