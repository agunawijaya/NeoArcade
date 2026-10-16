/**
 * The numbers that make the 1984 game feel the way it does, measured from
 * its behaviour (see docs/games/mind-the-ox.md) and restated in this port's
 * units. Distances are world units: the original's pixels, with y pointing
 * up from the bottom of the world. Speeds are world units per "move".
 *
 * The original advanced everything about twelve times a second. This engine
 * ticks sixty times a second and calls five ticks a move, so the pacing
 * players remember carries over while motion stays smooth.
 */
export const TICKS_PER_SECOND = 60;
export const TICKS_PER_MOVE = 5;

/** Flying at or above this height stalls the plane. */
export const CEILING = 200;
/** The width of the 1984 world, which Classic keeps. */
export const CLASSIC_WORLD_WIDTH = 3000;

export const BASE_MIN_SPEED = 4;
export const BASE_MAX_SPEED = 8;
export const MAX_THROTTLE = 4;
/** Speed gained diving straight down, or lost climbing straight up. */
export const GRAVITY_SPEED = 4;
/** Speed creeps towards its target by one unit every four moves. */
export const SPEED_STEP_MOVES = 4;

/** A full tank lasts three times the width of the world at speed one. */
export const MAX_FUEL = 9000;
export const MAX_ROUNDS = 200;
export const MAX_BOMBS = 5;
/** A torpedo is the whole load: one. */
export const MAX_TORPEDOES = 1;
export const MAX_MISSILES = 5;
export const MAX_BURSTS = 5;
/** Five planes a round; the fifth crash is the end. */
export const MAX_CRASHES = 5;

export const BASE_BULLET_SPEED = 10;
export const BULLET_LIFE_MOVES = 10;
export const GUN_INTERVAL_MOVES = 1;
export const BOMB_INTERVAL_MOVES = 10;
export const MISSILE_INTERVAL_MOVES = 5;
export const BURST_INTERVAL_MOVES = 5;
export const MISSILE_LIFE_MOVES = 50;
export const BURST_LIFE_MOVES = 20;

/** Falling things gain one unit of downward speed every so many moves, up to a limit. */
export const BOMB_DRAG_MOVES = 5;
export const FALL_DRAG_MOVES = 5;
export const DEBRIS_DRAG_MOVES = 3;
export const TERMINAL_FALL_SPEED = 10;

/** A stalled plane tumbles over every six moves until its nose points down. */
export const STALL_TUMBLE_MOVES = 6;
/** How long the wreck sits before the next plane is wheeled out; longer when it crashed at home. */
export const CRASH_MOVES = 10;
export const CRASH_AT_HOME_MOVES = 20;
export const NEAR_HOME = 32;

/** Each bullet adds this to a target's damage, which heals by one a move. */
export const TARGET_HIT_DAMAGE = 10;
export const TARGETS_PER_WORLD = 20;
export const OWN_TARGETS = 3;

export const SCORE_TARGET = 100;
export const SCORE_DEPOT = 200;
export const SCORE_PLANE = 50;
export const PENALTY_BIRD = 25;
export const PENALTY_OX = 200;
/** The win bonus counts up the planes left: +25, +50, +75 … */
export const LIFE_BONUS_STEP = 25;

/** Landing at home tops up one percent of the tank a move, two rounds a move, and a store every 20 moves. */
export const REFUEL_PER_MOVE = MAX_FUEL / 100;
export const REARM_ROUNDS_PER_MOVE = 2;
export const REARM_STORE_MOVES = 20;

/** The winner's flight into the sun, and the loser's THE END, in moves. */
export const SUN_MOVES = 72;
export const THE_END_MOVES = 20;

export const FLOCKS_PER_WORLD = 4;
export const OXEN_PER_WORLD = 2;
export const BIRDS_IN_A_FLOCK = 8;
export const FLOCK_SPEED = 2;

/** World units per tick for a speed in world units per move. */
export function perTick(speedPerMove: number): number {
  return speedPerMove / TICKS_PER_MOVE;
}

export function movesToTicks(moves: number): number {
  return moves * TICKS_PER_MOVE;
}
