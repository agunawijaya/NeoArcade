import type { CargoId } from '../../../engine/cargo';
import { CARGO } from '../../../engine/cargo';
import type { RigSpec } from '../../../engine/rig';

/**
 * The rig as a set of choices: its paint, what the trailer is lettered
 * for, and the parts a career buys. Every view draws from this one model,
 * so a longer fuel tank bought in Amarillo is on the side view, the card
 * pictures and the garage alike.
 *
 * The rig is laid out in feet, x forward from the trailer's back doors, y up
 * from the road, z to the rig's right. Its proportions are those of an
 * early-eighties long-nose conventional with a 45-foot refrigerated
 * trailer: 65½ feet bumper to doors, 13½ feet tall, wheels 41 inches across.
 */
export interface RigPaint {
  body: string;
  trim: string;
  stripe: string;
}

export const RIG_PAINTS = {
  classic: { body: '#b8312a', trim: '#e2e2de', stripe: '#f2c14e' },
  highway: { body: '#1f7a4a', trim: '#e2e2de', stripe: '#f4f1e6' },
  midnight: { body: '#222b40', trim: '#cfd3da', stripe: '#4fa3d8' },
  cream: { body: '#e9dfc4', trim: '#c9a86a', stripe: '#7a3a2a' },
  sunset: { body: '#e0662b', trim: '#ece6d6', stripe: '#6b2a5a' },
  chrome: { body: '#a3abb4', trim: '#f4f6f8', stripe: '#2b2b2b' },
} as const satisfies Record<string, RigPaint>;

export type RigPaintId = keyof typeof RIG_PAINTS;

export interface RigModel {
  paint: RigPaint;
  /** What the trailer carries: a refrigerated load gets the reefer unit and its lettering. */
  cargo: CargoId;
  /** Saddle tanks: the stock pair, or the long ones a career can buy. */
  tanks: 'stock' | 'long';
  /** The stock bunk box, or the taller sleeper cab. */
  sleeper: 'bunk' | 'sleeper-cab';
  /** The trailer's refrigeration unit: the old one, or the reliable new one. */
  reefer: 'classic' | 'reliable';
  /** A radar detector on the dash. */
  detector: boolean;
  /** Road grime, 0 just washed … 1 after days of rain and salt. */
  dirt: number;
}

export function rigModel(options: {
  paint: RigPaint;
  cargo: CargoId;
  rig?: RigSpec;
  dirt?: number;
}): RigModel {
  const { rig } = options;
  return {
    paint: options.paint,
    cargo: options.cargo,
    tanks: rig && rig.tankGallons > 200 ? 'long' : 'stock',
    sleeper: rig?.sleeper ?? 'bunk',
    reefer: rig && rig.reeferOdds < 1 ? 'reliable' : 'classic',
    detector: rig?.radarDetector ?? false,
    dirt: options.dirt ?? 0,
  };
}

export function refrigerated(model: RigModel): boolean {
  return CARGO[model.cargo].refrigerated;
}

/** Where things are, in feet along the rig from the trailer's back doors. */
export const RIG = {
  length: 65.5,
  height: 13.5,
  tyreRadius: 1.72,
  trailer: { length: 45, floor: 4.15, roof: 13.5, halfWidth: 4, axles: [4.6, 8.7] },
  kingpin: 42,
  driveAxles: [38.85, 43.15],
  steerAxle: 62,
  bumper: 65.5,
  /** The back of the cab, and the tops of the stacks behind it. */
  cabBack: 53.5,
  stackTop: 13,
  /** The driver's eyes, for the view from the cab. */
  eye: [55.9, 9, -1.4] as const,
} as const;

/** The sleeper's back and roof for the chosen box. */
export function sleeperOf(model: RigModel): { back: number; roof: number } {
  return model.sleeper === 'sleeper-cab' ? { back: 48.6, roof: 10.15 } : { back: 50.3, roof: 9.35 };
}

/** Which lamps are lit, and whether anyone is aboard. */
export interface RigLights {
  head: boolean;
  markers: boolean;
  brake: boolean;
  /** Hazards and turn signals: true while the blink is on. */
  left: boolean;
  right: boolean;
  /** The cab light, 0 … 1, and someone at the wheel. */
  cab: number;
  driver: boolean;
  /** Parked for the night: the bunk lamp is on. */
  bunk: boolean;
}

export const RIG_LIGHTS_OFF: RigLights = {
  head: false,
  markers: false,
  brake: false,
  left: false,
  right: false,
  cab: 0,
  driver: true,
  bunk: false,
};
