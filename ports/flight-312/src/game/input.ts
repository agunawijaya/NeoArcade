import { createInput, type Input } from '@shared/input';
import type { CockpitView } from '../cockpit/actions';

/**
 * The keyboard, the gamepad and a joystick or yoke, mapped to the crew's
 * actions. Three keyboard layouts: the modern one, and the program's own
 * "1982 keys" in its two editions — the single-file listing's U and D for
 * pitch and C for the flare, and the IBM PC conversion's numeric keypad 2
 * and 8 for pitch and 6 for the flare. Every layout keeps the views, the
 * radio answers and the pause on the same keys. The digit keys pick a
 * view, or a readback while the controller is waiting for one.
 */
export type ControlScheme = 'modern' | 'singleFile' | 'ibm';

export type FlightKey =
  | 'pitchDown'
  | 'pitchUp'
  | 'rollLeft'
  | 'rollRight'
  | 'rudderLeft'
  | 'rudderRight'
  | 'rudderCentre'
  | 'thrustUp'
  | 'thrustDown'
  | 'reverse'
  | 'flapsDown'
  | 'flapsUp'
  | 'gear'
  | 'speedbrake'
  | 'brakes'
  | 'parkingBrake'
  | 'trimDown'
  | 'trimUp'
  | 'autopilot'
  | 'autothrottle'
  | 'flightDirector'
  | 'headingMode'
  | 'navMode'
  | 'approachMode'
  | 'altitudeHold'
  | 'verticalSpeedMode'
  | 'speedMode'
  | 'headingLeft'
  | 'headingRight'
  | 'altitudeUp'
  | 'altitudeDown'
  | 'goAround'
  | 'flare'
  | 'commSwap'
  | 'nextStation'
  | 'courseUp'
  | 'autoCourse'
  | 'shift'
  | 'chart'
  | 'checklist'
  | 'pause'
  | 'timeFaster'
  | 'timeSlower'
  | 'answer1'
  | 'answer2'
  | 'answer3'
  | 'viewMain'
  | 'viewPedestal'
  | 'viewOverhead'
  | 'viewEngineer'
  | 'viewLeft'
  | 'viewRight'
  | 'viewOutside'
  | 'viewNext';

type Bindings = Record<FlightKey, string[]>;

const PAD: Partial<Bindings> = {
  pitchDown: ['pad:leftY-'],
  pitchUp: ['pad:leftY+'],
  rollLeft: ['pad:leftX-'],
  rollRight: ['pad:leftX+'],
  rudderLeft: ['pad:rightX-'],
  rudderRight: ['pad:rightX+'],
  thrustUp: ['pad:rt'],
  thrustDown: ['pad:lt'],
  gear: ['pad:a'],
  speedbrake: ['pad:b'],
  brakes: ['pad:x'],
  autopilot: ['pad:y'],
  flapsDown: ['pad:rb'],
  flapsUp: ['pad:lb'],
  trimDown: ['pad:up'],
  trimUp: ['pad:down'],
  viewNext: ['pad:right'],
  viewMain: ['pad:left'],
  pause: ['pad:start'],
  chart: ['pad:back'],
};

const SHARED: Partial<Bindings> = {
  shift: ['key:ShiftLeft', 'key:ShiftRight'],
  chart: ['key:KeyM'],
  checklist: ['key:KeyK'],
  pause: ['key:Escape', 'key:KeyP'],
  timeFaster: ['key:BracketRight'],
  timeSlower: ['key:BracketLeft'],
  answer1: ['key:Digit1'],
  answer2: ['key:Digit2'],
  answer3: ['key:Digit3'],
  viewMain: ['key:Digit1'],
  viewPedestal: ['key:Digit2'],
  viewOverhead: ['key:Digit3'],
  viewEngineer: ['key:Digit4'],
  viewLeft: ['key:Digit5'],
  viewRight: ['key:Digit6'],
  viewOutside: ['key:Digit7'],
  viewNext: ['key:Tab'],
};

const MODERN: Partial<Bindings> = {
  pitchDown: ['key:ArrowUp', 'key:KeyW'],
  pitchUp: ['key:ArrowDown', 'key:KeyS'],
  rollLeft: ['key:ArrowLeft', 'key:KeyA'],
  rollRight: ['key:ArrowRight', 'key:KeyD'],
  rudderLeft: ['key:KeyZ', 'key:Comma'],
  rudderRight: ['key:KeyX', 'key:Period'],
  thrustUp: ['key:Equal', 'key:NumpadAdd', 'key:PageUp'],
  thrustDown: ['key:Minus', 'key:NumpadSubtract', 'key:PageDown'],
  reverse: ['key:KeyR'],
  flapsDown: ['key:KeyF'],
  flapsUp: ['key:KeyV'],
  gear: ['key:KeyG'],
  speedbrake: ['key:Slash'],
  brakes: ['key:Space'],
  parkingBrake: ['key:KeyB'],
  trimDown: ['key:Home', 'key:Numpad7'],
  trimUp: ['key:End', 'key:Numpad1'],
  autopilot: ['key:KeyQ'],
  autothrottle: ['key:KeyE'],
  flightDirector: ['key:KeyO'],
  headingMode: ['key:KeyH'],
  navMode: ['key:KeyN'],
  approachMode: ['key:KeyI'],
  altitudeHold: ['key:KeyU'],
  verticalSpeedMode: ['key:KeyY'],
  speedMode: ['key:KeyJ'],
  headingLeft: ['key:Semicolon'],
  headingRight: ['key:Quote'],
  altitudeUp: ['key:Insert'],
  altitudeDown: ['key:Delete'],
  goAround: ['key:KeyT'],
  commSwap: ['key:KeyC'],
  nextStation: ['key:KeyL'],
  // Only the 1982 Rules have a flare key: in the real model the flare is the pitch.
  flare: ['key:Enter', 'key:NumpadEnter'],
};

/** The program's keys, as both editions share them. */
const PROGRAM: Partial<Bindings> = {
  thrustUp: ['key:KeyF'],
  thrustDown: ['key:KeyS'],
  rudderLeft: ['key:Comma'],
  rudderRight: ['key:Period'],
  rudderCentre: ['key:Slash'],
  gear: ['key:KeyW'],
  flapsDown: ['key:KeyL'],
  nextStation: ['key:KeyV'],
  courseUp: ['key:KeyR'],
  autoCourse: ['key:KeyA'],
  reverse: ['key:KeyQ'],
  goAround: ['key:KeyM'],
  parkingBrake: ['key:KeyB'],
  rollLeft: ['key:ArrowLeft'],
  rollRight: ['key:ArrowRight'],
};

/** JETSET.BAS, the single-file listing: U and D for pitch, C for the flare. */
const SINGLE_FILE: Partial<Bindings> = {
  ...PROGRAM,
  pitchUp: ['key:KeyU'],
  pitchDown: ['key:KeyD'],
  flare: ['key:KeyC'],
};

/** The IBM PC conversion of 10-30-82 (AJETOFF and AJETCRUZ): the keypad's 2 (nose up) and 8 for pitch, 6 for the flare. */
const IBM: Partial<Bindings> = {
  ...PROGRAM,
  pitchUp: ['key:Numpad2', 'key:Digit2'],
  pitchDown: ['key:Numpad8', 'key:Digit8'],
  flare: ['key:Numpad6', 'key:Digit6'],
};

const ALL_KEYS: FlightKey[] = [
  ...new Set([
    ...Object.keys(PAD),
    ...Object.keys(SHARED),
    ...Object.keys(MODERN),
    ...Object.keys(SINGLE_FILE),
    ...Object.keys(IBM),
  ]),
] as FlightKey[];

export function bindingsFor(scheme: ControlScheme): Bindings {
  const keys = scheme === 'modern' ? MODERN : scheme === 'singleFile' ? SINGLE_FILE : IBM;
  const bindings = {} as Bindings;
  for (const action of ALL_KEYS) {
    bindings[action] = [...(SHARED[action] ?? []), ...(keys[action] ?? []), ...(PAD[action] ?? [])];
  }
  // The program's M is the missed approach, so its layouts open the chart with N.
  if (scheme !== 'modern') bindings.chart = ['key:KeyN', ...(PAD.chart ?? [])];
  // In the IBM layout 2, 6 and 8 are pitch and the flare: those views are reached with Tab instead.
  if (scheme === 'ibm') {
    bindings.viewPedestal = [];
    bindings.viewRight = [];
    bindings.answer2 = ['key:Digit9'];
  }
  return bindings;
}

export const VIEW_KEYS: [FlightKey, CockpitView][] = [
  ['viewMain', 'main'],
  ['viewPedestal', 'pedestal'],
  ['viewOverhead', 'overhead'],
  ['viewEngineer', 'engineer'],
  ['viewLeft', 'left'],
  ['viewRight', 'right'],
  ['viewOutside', 'outside'],
];

export function createFlightInput(
  scheme: ControlScheme,
  pointerTarget: HTMLElement,
): Input<FlightKey> {
  return createInput<FlightKey>({ bindings: bindingsFor(scheme), pointerTarget, deadzone: 0.12 });
}

export function rebindAll(input: Input<FlightKey>, scheme: ControlScheme) {
  const bindings = bindingsFor(scheme);
  for (const action of ALL_KEYS) input.rebind(action, bindings[action]);
}
