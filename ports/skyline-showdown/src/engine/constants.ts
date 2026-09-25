/**
 * The playfield keeps the original's EGA geometry (640 × 350, y pointing
 * down) so every throw travels exactly as it did in 1990. The renderer
 * scales this world to the screen.
 */
export const WORLD_WIDTH = 640;
export const WORLD_HEIGHT = 350;

/** Where the buildings stand; below it is the street. */
export const STREET_Y = 335;

/** Simulation time added per step, as in the original's `t# = t# + .1`. */
export const STEP_TIME = 0.1;

/**
 * Steps played per wall-clock second. On period hardware each step waited on
 * a 55 ms timer tick plus drawing, about 25–35 steps a second; a typical
 * throw then took two to three seconds, which this reproduces.
 */
export const STEPS_PER_SECOND = 28;

/** Radius of the hole a banana punches into a building (ScrHeight / 50). */
export const EXPLOSION_RADIUS = 7;

/** A banana is treated as a small disc this wide around its centre. */
export const BANANA_RADIUS = 3;

/** Width and height of the box a gorilla occupies. */
export const GORILLA_SIZE = 30;

/** Throws slower than this fumble and land on the thrower's own head. */
export const FUMBLE_VELOCITY = 2;

/** Highest angle or velocity the original accepted as input. */
export const MAX_INPUT = 360;

/** The sun (or the world's stand-in) sits at the top centre and can be hit harmlessly. */
export const SUN = { x: 320, y: 25, radius: 14, reach: 39 } as const;

/** Safety net so a banana circling above the screen can never hang the game. */
export const MAX_SHOT_STEPS = 6000;
