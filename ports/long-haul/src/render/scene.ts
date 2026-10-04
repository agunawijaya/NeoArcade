import type { RegionId } from '../data/regions';
import type { CargoId } from '../engine/cargo';
import type { ConditionId } from '../engine/conditions';
import type { Season } from '../engine/living-weather';
import type { Landmark } from './landmarks';
import type { RigPaint } from './rig';

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
  cargo: CargoId;
  paint: RigPaint;
  landmarks: readonly Landmark[];
  /** 0–1: how close a big city is, for a skyline on the horizon. */
  city: number;
  /** A patrol car behind the trailer, lights going. */
  police: boolean;
  braking: boolean;
  /** Parked: at a stop, a toll booth, a closed road. */
  stopped: boolean;
  reducedMotion: boolean;
  /** Dashboard readings for the cab view. */
  dash: DashReadings;
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
