import type { SpeedbrakeLever } from '../engine/panel';

/**
 * Everything the cockpit's switches, knobs and levers can do, as plain
 * values: the panels hand these to the game, which applies them to the
 * flight the same way the keyboard and the gamepad do.
 */
export type CockpitView =
  'main' | 'pedestal' | 'overhead' | 'engineer' | 'left' | 'right' | 'outside';

export type KnobId =
  | 'heading'
  | 'course1'
  | 'course2'
  | 'altitude'
  | 'verticalSpeed'
  | 'speed'
  | 'speedBug'
  | 'altimeter'
  | 'nav1Whole'
  | 'nav1Fraction'
  | 'nav2Whole'
  | 'nav2Fraction'
  | 'commWhole'
  | 'commFraction';

export type McpButton =
  | 'autopilot'
  | 'flightDirector'
  | 'autothrottle'
  | 'heading'
  | 'navigation'
  | 'approach'
  | 'altitudeHold'
  | 'verticalSpeed'
  | 'speed';

export type CockpitAction =
  | { kind: 'knob'; knob: KnobId; clicks: number }
  | { kind: 'button'; button: McpButton }
  | { kind: 'gear' }
  | { kind: 'levers'; value: number }
  | { kind: 'reverse'; value: number }
  | { kind: 'flapLever'; index: number }
  | { kind: 'speedbrake'; lever: SpeedbrakeLever }
  | { kind: 'parkingBrake' }
  | { kind: 'swapComm' }
  | { kind: 'crossfeed' }
  | { kind: 'wipers' }
  | { kind: 'landingLights' }
  | { kind: 'checklist' }
  | { kind: 'view'; view: CockpitView };

/** A clickable place on a panel, laid out in screen pixels as the panel is drawn. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  click?: CockpitAction;
  /** A knob: each wheel notch or dragged step is a click. */
  knob?: KnobId;
  /** A lever dragged up and down: the value at a height, 0 at the bottom of its travel … 1 at the top. */
  drag?: (fraction: number) => CockpitAction;
}
