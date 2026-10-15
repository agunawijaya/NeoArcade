/** The engine works in feet, seconds, knots, pounds and degrees, as a 1982 flight deck did. */
export const FEET_PER_NM = 6076.115486;
export const FPS_PER_KNOT = 1.6878098571;
export const FPM_PER_FPS = 60;
export const FEET_PER_METRE = 3.280839895;
export const GRAVITY = 32.174049;
/** Mean radius of the Earth, 6,371 km. */
export const EARTH_RADIUS_FT = 20_902_230.97;
export const EARTH_RADIUS_NM = EARTH_RADIUS_FT / FEET_PER_NM;
export const SECONDS_PER_HOUR = 3600;

export const knotsToFps = (knots: number) => knots * FPS_PER_KNOT;
export const fpsToKnots = (fps: number) => fps / FPS_PER_KNOT;
