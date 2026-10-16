import type { RegionId } from '../data/regions';
import type { ConditionId } from '../engine/conditions';
import type { Season } from '../engine/living-weather';
import type { Landmark } from './landmarks';
import type { RigLights, RigModel } from './vehicles/rig/model';
import type { SedanLights } from './vehicles/sedan/model';

/**
 * Everything a driving view needs to paint one frame. The session builds it
 * from the trip and the playback; the cab view and the side view each draw
 * it their own way, so switching views never changes what the player knows.
 */
export interface DriveScene {
  /** Real seconds, for things that move on their own. */
  time: number;
  /** Pixels of road passed: the near scenery's position. */
  scroll: number;
  /** Mph on the speedometer. */
  speed: number;
  region: RegionId;
  /** The landscape being left, and how far into the new one we are (0 → 1). */
  previousRegion: RegionId;
  regionBlend: number;
  season: Season;
  /** Snow lying on the ground. */
  snow: boolean;
  condition: ConditionId;
  sunAltitude: number;
  sunArc: number;
  /** 0 rested … 5 exhausted. */
  fatigue: number;
  /** The rig as it looks on this trip: paint, lettering, the parts a career bought, its grime. */
  rig: RigModel;
  landmarks: readonly Landmark[];
  /** 0–1: how close a big city is, for a skyline on the horizon. */
  city: number;
  /** A patrol car on the scene, and the rig pulled over for it. */
  patrol: PatrolScene | null;
  braking: boolean;
  /** Parked: at a stop, a toll booth, a closed road. */
  stopped: boolean;
  reducedMotion: boolean;
  /** Dashboard readings for the cab view. */
  dash: DashReadings;
}

export interface PatrolScene {
  /** Feet from the rig's front bumper to the cruiser's; negative is behind the rig. */
  gap: number;
  /** Across the road: 1 the passing lane, 0 the rig's lane, −1 the shoulder; between while changing. */
  lane: number;
  /** Feet the cruiser has rolled, to turn its wheels. */
  rolled: number;
  lights: SedanLights;
  /** The rig's own place across the road, 0 its lane … −1 the shoulder, and its hazard lights. */
  rigLane: number;
  hazards: boolean;
  /** The rig's turn signal while it pulls back onto the road, on its blink. */
  rigSignal: 'left' | null;
  /** The rig braking for the stop. */
  rigBrake: boolean;
  /** Feet the trailer dips as it settles on its springs. */
  settle: number;
  /** The cruiser's passenger door, 0 shut … 1 open. */
  door: number;
  officer: OfficerPose | null;
}

/** The trooper on foot. */
export interface OfficerPose {
  /** Feet along the road from the rig's front bumper (negative is beside or behind the rig). */
  along: number;
  /** Feet out from the rig's right-hand side, on the shoulder. */
  out: number;
  /** Strides taken, to swing the legs; whether walking at all. */
  stride: number;
  walking: boolean;
  /** −1 facing the back of the rig, 1 facing forward. */
  facing: -1 | 1;
  /** 0 on the ground … 1 up on the step, at the window. */
  atWindow: number;
  writing: boolean;
}

export interface DashReadings {
  fuel: number;
  tank: number;
  odometer: number;
  /** "THU 4:30 PM". */
  clock: string;
  /** Minutes past midnight, for the analogue clock. */
  minutes: number;
  /** The CB's display: the channel and the last voice. */
  cbChannel: number;
  cbLine: string;
  cbSpeaker: string;
  units: 'mi' | 'km';
  /** The speed the throttle is set to. */
  setSpeed: number;
  limit: number;
  /** A radar detector's light, when one is fitted. */
  detector: 'off' | 'quiet' | 'alert';
}

/**
 * The rig's lamps for a moment on the road: markers from dusk, headlights
 * after dark, brake lights while slowing, hazards when pulled over for the
 * patrol and the left signal pulling out again, someone always at the wheel.
 */
export function rigLightsFor(scene: DriveScene, night: number): RigLights {
  const patrol = scene.patrol;
  const blink =
    Boolean(patrol?.hazards) && (scene.reducedMotion || Math.floor(scene.time * 3) % 2 === 0);
  return {
    head: night > 0.3,
    markers: night > 0.15,
    brake: scene.braking || Boolean(patrol?.rigBrake),
    left: blink || patrol?.rigSignal === 'left',
    right: blink,
    cab: night > 0.45 ? 0.3 : 0,
    driver: true,
    bunk: false,
  };
}
