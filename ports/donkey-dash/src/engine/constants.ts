/**
 * The numbers the whole engine is built on. Distances are road metres,
 * times are seconds, lanes are counted from the left, starting at 0.
 */

/** The engine advances in equal steps, so a run plays the same at any frame rate. */
export const STEPS_PER_SECOND = 60;
export const STEP_SECONDS = 1 / STEPS_PER_SECOND;

/**
 * The fairness constant. Every camera view shows exactly this much road ahead
 * of the car's nose, and a hazard comes into view when its near edge crosses
 * that line. The reaction window at a given speed is this distance divided by
 * the speed (less the Classic climb, see sight.ts); views are tested to match.
 */
export const SIGHT_DISTANCE = 16;

/** Hitboxes along the road. The car's nose is its front bumper. */
export const CAR_LENGTH = 4.5;
export const DONKEY_DEPTH = 1.2;
export const CARROT_DEPTH = 0.5;

/** How long mud holds a lane switch back. */
export const MUD_DELAY = 0.15;

/**
 * What the road planner assumes about people, so every pattern it builds can
 * be driven: a press takes this long when several are needed in a row, and
 * nobody reacts faster than REACTION_SECONDS after something comes into view.
 */
export const PRESS_SECONDS = 0.14;
export const REACTION_SECONDS = 0.3;

/** How long a crashed car is waved through untouched once it is back on the road. */
export const GRACE_SECONDS = 1.4;

export const STARTING_LIVES = 3;

/**
 * The original, in its own units: a 320 × 200 CGA screen and the PC's timer,
 * which ticked 18.2 times a second (1,193,182 Hz / 65,536). DONKEY.BAS paced
 * itself with `SOUND 20000,1`, one tick per step of the falling donkey.
 */
export const ORIGINAL = {
  ticksPerSecond: 1_193_182 / 65_536,
  /** The donkey falls 6 pixels a tick (`FOR Y = … TO 124 STEP 6`). */
  donkeyStepPx: 6,
  /** Each dodge moves the car 4 pixels up the screen (`CY = CY - 4`). */
  climbPx: 4,
  /** The car's top edge before the first wave (`CY = 105`). */
  carStartY: 105,
  /** The donkey is only drawn once its top edge is at y 3 or lower (`IF Y => 3`). */
  revealY: 3,
  /** Its bottom edge is 25 pixels below its top (`Y + 25 >= CY` is the collision). */
  donkeyHeightPx: 25,
  /** A wave ends when the donkey's top edge reaches y 124. */
  waveEndY: 124,
  /** The driver wins when the car's top edge would pass above y 60. */
  winAboveY: 60,
  /** A new donkey starts between 32 pixels above the screen and its top edge. */
  spawnHighestY: -32,
} as const;

/**
 * One CGA pixel in road metres, chosen so that the original's view ahead of
 * the car at the start (77 pixels between the car's roof and the line where
 * donkeys appeared) is exactly SIGHT_DISTANCE. Classic Duel keeps every
 * original timing through this scale.
 */
export const PIXEL =
  SIGHT_DISTANCE / (ORIGINAL.carStartY - (ORIGINAL.revealY + ORIGINAL.donkeyHeightPx));

/** The original's donkey speed: 6 pixels a tick, about 22.7 m/s on this scale. */
export const CLASSIC_SPEED = ORIGINAL.donkeyStepPx * PIXEL * ORIGINAL.ticksPerSecond;

/** How far one dodge moves the car up the road in the duel modes. */
export const CLIMB_STEP = ORIGINAL.climbPx * PIXEL;

/**
 * The climb at which the driver wins: the car starts at y 105, climbs 4 per
 * wave and wins once it would be above y 60, which is the twelfth climb. So
 * eleven donkeys dodged in a row win the point.
 */
export const WINNING_CLIMB = Math.ceil(
  (ORIGINAL.carStartY - ORIGINAL.winAboveY + 1) / ORIGINAL.climbPx,
);
