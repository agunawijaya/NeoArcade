/**
 * A full-size sedan of the early eighties: the highway patrol's cruiser in
 * its black-and-white, or a family car in the traffic. Laid out in feet,
 * x forward from the rear bumper, y up, z to the car's right; 17½ feet long,
 * 6¼ wide, 4⅔ tall, on a 9¾-foot wheelbase.
 */
export interface SedanModel {
  /** The patrol's black-and-white with its light bar, or a civilian car. */
  kind: 'patrol' | 'civilian';
  /** Body colour; on the cruiser the doors and roof are white over it. */
  paint: string;
  /** Road grime, 0 … 1. */
  dirt: number;
}

export const PATROL: SedanModel = { kind: 'patrol', paint: '#16171a', dirt: 0.1 };

/** Colours the family cars of 1982 came in. */
export const CIVILIAN_PAINTS = [
  '#6b2a2a',
  '#c9b48a',
  '#2f4f6f',
  '#d9d4c4',
  '#3d5a3a',
  '#8a8f96',
  '#5a3a26',
] as const;

export const SEDAN = {
  length: 17.6,
  halfWidth: 3.15,
  height: 4.7,
  tyreRadius: 1.14,
  frontAxle: 14.25,
  rearAxle: 4.55,
  track: 2.62,
} as const;

/** What the cruiser is doing with its lamps and its people. */
export interface SedanLights {
  head: boolean;
  markers: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  /** The light bar turning, and the A-pillar spotlight on the rig. */
  bar: boolean;
  spot: boolean;
  /** Someone at the wheel. */
  driver: boolean;
}

export const SEDAN_LIGHTS_OFF: SedanLights = {
  head: false,
  markers: false,
  brake: false,
  left: false,
  right: false,
  bar: false,
  spot: false,
  driver: true,
};
