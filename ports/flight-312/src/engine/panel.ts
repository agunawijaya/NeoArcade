import { FLAP_DETENTS, JUMBO } from './aircraft';
import { clamp } from './exact-math';
import type { NavTuning } from './radios';

/**
 * The cockpit's levers, switches and radio heads: what the crew has set.
 * The flight reads the panel every step; the cockpit, the keyboard, the
 * gamepad and the scripted test pilot all change it through the functions
 * below, so every way of flying moves the same levers.
 */
export type SpeedbrakeLever = 'down' | 'armed' | 'flight' | 'up';

export interface Panel {
  /** Forward thrust levers, 0 idle … 1 full. */
  levers: number[];
  /** Reverse levers, 0 stowed … 1 full reverse. */
  reverse: number[];
  /** Index into FLAP_DETENTS. */
  flapLever: number;
  gearDown: boolean;
  speedbrake: SpeedbrakeLever;
  parkingBrake: boolean;
  nav: [NavTuning, NavTuning];
  comm: number;
  commStandby: number;
  /** The altimeters' setting window, inches of mercury. */
  altimeterInHg: number;
  /** The heading bug on the HSI, magnetic. */
  headingBug: number;
  /** The airspeed indicator's bug: the speed to fly. */
  speedBugKt: number;
  crossfeed: boolean;
  wipers: 'off' | 'low' | 'high';
  landingLights: boolean;
}

export function startPanel(over: Partial<Panel> = {}): Panel {
  return {
    levers: Array.from({ length: JUMBO.engineCount }, () => 0),
    reverse: Array.from({ length: JUMBO.engineCount }, () => 0),
    flapLever: 0,
    gearDown: true,
    speedbrake: 'down',
    parkingBrake: true,
    nav: [
      { frequency: 112.8, course: 0 },
      { frequency: 113.8, course: 0 },
    ],
    comm: 118.85,
    commStandby: 118.5,
    altimeterInHg: 29.92,
    headingBug: 0,
    speedBugKt: 160,
    crossfeed: false,
    wipers: 'off',
    landingLights: true,
    ...over,
  };
}

/** What the speedbrake lever asks of the panels: 0 down … 1 fully up. */
export function speedbrakeDemand(lever: SpeedbrakeLever): number {
  return { down: 0, armed: 0, flight: 0.5, up: 1 }[lever];
}

export function setLevers(panel: Panel, value: number) {
  panel.levers = panel.levers.map(() => clamp(value, 0, 1));
}

export function nudgeLevers(panel: Panel, delta: number) {
  panel.levers = panel.levers.map((lever) => clamp(lever + delta, 0, 1));
}

/** The reversers come up only with the forward levers closed. */
export function setReverse(panel: Panel, value: number) {
  const wanted = clamp(value, 0, 1);
  if (wanted > 0) setLevers(panel, 0);
  panel.reverse = panel.reverse.map(() => wanted);
}

export function moveFlapLever(panel: Panel, steps: number) {
  panel.flapLever = clamp(panel.flapLever + steps, 0, FLAP_DETENTS.length - 1);
}

export function setFlapDegrees(panel: Panel, degrees: number) {
  const index = FLAP_DETENTS.findIndex((detent) => detent.degrees === degrees);
  if (index >= 0) panel.flapLever = index;
}

export const flapLeverDegrees = (panel: Panel) => FLAP_DETENTS[panel.flapLever]?.degrees ?? 0;

const SPEEDBRAKE_ORDER: SpeedbrakeLever[] = ['down', 'armed', 'flight', 'up'];

export function moveSpeedbrake(panel: Panel, steps: number) {
  const index = SPEEDBRAKE_ORDER.indexOf(panel.speedbrake);
  panel.speedbrake =
    SPEEDBRAKE_ORDER[clamp(index + steps, 0, SPEEDBRAKE_ORDER.length - 1)] ?? 'down';
}

export function swapComm(panel: Panel) {
  [panel.comm, panel.commStandby] = [panel.commStandby, panel.comm];
}

/** A radio knob: whole megahertz on the outer ring, hundredths (in steps of the band) on the inner. */
export function turnFrequency(
  frequency: number,
  low: number,
  high: number,
  step: number,
  clicks: number,
): number {
  const span = Math.round((high - low) / step) + 1;
  const index = Math.round((frequency - low) / step);
  const next = (((index + clicks) % span) + span) % span;
  return Math.round((low + next * step) * 100) / 100;
}

export const NAV_BAND = { low: 108, high: 117.95, step: 0.05 } as const;
export const COMM_BAND = { low: 118, high: 135.95, step: 0.05 } as const;
