import type { DonkeyRole, HazardKind } from '../engine/hazards';
import type { Road } from '../engine/road';
import type { HatStyle, Look } from '../garage';
import type { CameraView } from '../settings';
import type { Particle } from './effects';
import type { Palette } from './palette';

/**
 * The one small interface behind the three camera views. Each view is a
 * separate layer over the same engine state: it gets a Frame (everything the
 * engine and the animations say, already interpolated) and paints it. Nothing
 * a view does feeds back into the game, so gameplay, timing and hitboxes are
 * identical in all three.
 */
export interface RoadView {
  readonly camera: CameraView;
  draw(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport): void;
  /** Where things land on screen; pure, so the fairness tests can check it without a canvas. */
  layout(viewport: Viewport, climb: number): ViewLayout;
}

export interface Viewport {
  /** CSS pixels; the context is already scaled for the device. */
  width: number;
  height: number;
  /** Room kept free for the HUD above and below the road ahead. */
  insetTop: number;
  insetBottom: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewLayout {
  /** Metres of road shown ahead of the car's nose: always revealGap(climb). */
  sightAhead: number;
  /** The screen box a donkey covers, standing `gap` metres ahead at `lateral` lane widths from the middle. */
  donkeyBox(gap: number, lateral: number): Box;
  /** The car's screen box, for the crash and the HUD. */
  carBox(lateral: number): Box;
}

export interface CarFrame {
  /** Lane widths from the middle of the road, eased through a lane change. */
  lateral: number;
  /** Lean into a lane change, -1…1. */
  lean: number;
  /** Height of a hop across the road on a wrap-around press, metres. */
  hop: number;
  /** Suspension bounce, metres. */
  bounce: number;
  /** Blinking after a crash, while donkeys wave it through. */
  ghost: boolean;
  /** Wheels spinning in mud. */
  stuck: boolean;
  look: Look;
}

export interface HazardFrame {
  id: number;
  kind: HazardKind;
  role: DonkeyRole | null;
  /** Metres from the car's nose to the near edge. */
  gap: number;
  lateral: number;
  /** 0…1 while hopping to another lane, else 0. */
  hop: number;
  committed: boolean;
  /** Seconds since it came into view. */
  age: number;
  /** A near miss startled it: 0…1, fading. */
  startled: number;
  /** The donkey the car crashed into, sitting dazed afterwards. */
  dazed: boolean;
  /** Back on the road after a crash, still seeing stars. */
  dizzy: boolean;
  /** Which way it faces across the road. */
  facing: 1 | -1;
  seed: number;
  hat: HatStyle | null;
}

export interface CrashFrame {
  /** Seconds since impact. */
  age: number;
  carLateral: number;
  donkeyLateral: number;
  donkeySeed: number;
  donkeyFacing: 1 | -1;
  donkeyHat: HatStyle | null;
}

export interface Frame {
  /** Wall-clock seconds, for idle animation. */
  time: number;
  /** The car's nose on the road, metres. */
  nose: number;
  speed: number;
  /** The duel climb, eased so the car glides up. */
  climb: number;
  road: Road;
  car: CarFrame;
  hazards: HazardFrame[];
  /** Donkey vs Driver: the commit line, metres ahead of the nose. */
  commitGap: number | null;
  /** Donkey vs Driver: where the next donkey will drop, between waves. */
  dropLane: number | null;
  /** 0…1 flash on each beat of the music, 0 without rhythm. */
  beatPulse: number;
  crash: CrashFrame | null;
  /** The Driver has reached the top: seconds since, while the car sails off. */
  summit: number | null;
  palette: Palette;
  particles: readonly Particle[];
  reducedMotion: boolean;
}

/** How far the car has sailed off towards the top after reaching it, 0…1. */
export function summitProgress(frame: Frame): number {
  if (frame.summit === null) return 0;
  const t = Math.min(1, frame.summit / 1.1);
  return t * t * (3 - 2 * t);
}
