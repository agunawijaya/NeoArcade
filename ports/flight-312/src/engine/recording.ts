import { applyCommand, type CrewCommand } from './crew';
import {
  createFlight,
  NO_INPUT,
  stepFlight,
  type Flight,
  type FlightEvent,
  type FlightInput,
  type FlightSetup,
} from './flight';
import type { Terrain } from './terrain';
import type { FlightWorld } from './world';

/**
 * A flight written down so it can be flown again exactly: its setup, the
 * stick and pedal inputs whenever they change, and the crew's commands at
 * the steps they came. Replaying them through the engine gives the same
 * flight to the last bit, in every browser, so a replay is a few kilobytes
 * of inputs rather than a video, and the cockpit in it is as alive as it
 * was. The recorder also keeps snapshots of the flight now and then, so the
 * instant replay after a landing starts from a minute before it without
 * flying the whole flight again.
 */
export const RECORDING_VERSION = 1;

export interface RecordedStep {
  /** The step it belongs to: the first step of a flight is 1. */
  step: number;
  /** The input from this step on, written only when it changed. */
  input: FlightInput | null;
  /** Commands carried out just before this step. */
  commands: CrewCommand[];
}

export interface Recording {
  version: number;
  setup: FlightSetup;
  /** How many steps the flight ran. */
  steps: number;
  entries: RecordedStep[];
}

export interface FlightSnapshot {
  /** The flight as it stood after this many steps. */
  step: number;
  state: Omit<Flight, 'world'>;
}

/** Stick, pedals and toe brakes in steps of 1/128: plenty for a hand, and small to keep. */
const AXIS_STEPS = 128;
// Adding zero turns a −0 into a 0, which the bytes of a link cannot tell apart.
const quantiseAxis = (value: number) =>
  Math.round(Math.max(-1, Math.min(1, value)) * AXIS_STEPS) / AXIS_STEPS + 0;

export function quantiseInput(input: FlightInput): FlightInput {
  return {
    elevator: quantiseAxis(input.elevator),
    aileron: quantiseAxis(input.aileron),
    rudder: quantiseAxis(input.rudder),
    brakes: Math.max(0, quantiseAxis(input.brakes)),
    trim: Math.sign(input.trim),
    pitchSteps: Math.round(input.pitchSteps),
    rudderSteps: Math.round(input.rudderSteps),
    rudderCentre: input.rudderCentre,
    flare: input.flare,
    missedApproach: input.missedApproach,
  };
}

export function sameInput(a: FlightInput, b: FlightInput): boolean {
  return (
    a.elevator === b.elevator &&
    a.aileron === b.aileron &&
    a.rudder === b.rudder &&
    a.brakes === b.brakes &&
    a.trim === b.trim &&
    a.pitchSteps === b.pitchSteps &&
    a.rudderSteps === b.rudderSteps &&
    a.rudderCentre === b.rudderCentre &&
    a.flare === b.flare &&
    a.missedApproach === b.missedApproach
  );
}

export function takeSnapshot(flight: Flight, step: number): FlightSnapshot {
  // The world (terrain, weather, runways) never changes in flight; everything else is copied.
  return { step, state: structuredClone(withoutWorld(flight)) };
}

function withoutWorld({ world: _world, ...state }: Flight): Omit<Flight, 'world'> {
  return state;
}

export function restoreSnapshot(snapshot: FlightSnapshot, world: FlightWorld): Flight {
  return { ...structuredClone(snapshot.state), world };
}

/** Steps between snapshots: ten seconds of flight. */
export const SNAPSHOT_EVERY = 600;
/** Snapshots kept: enough to start a replay three minutes back. */
const SNAPSHOTS_KEPT = 20;

export class FlightRecorder {
  readonly entries: RecordedStep[] = [];
  readonly snapshots: FlightSnapshot[] = [];
  steps = 0;
  private pending: CrewCommand[] = [];
  private lastInput: FlightInput = NO_INPUT;

  constructor(readonly flight: Flight) {
    this.snapshots.push(takeSnapshot(flight, 0));
  }

  /** A command from the crew: carried out at once, and written down for the next step. */
  command(command: CrewCommand) {
    applyCommand(this.flight, command);
    this.pending.push(command);
  }

  /** One step of the flight with this input; it is quantised, so the replay gets exactly it. */
  step(input: FlightInput): FlightEvent[] {
    const step = this.steps + 1;
    const flown = quantiseInput(input);
    const changed = !sameInput(flown, this.lastInput);
    if (changed || this.pending.length > 0) {
      this.entries.push({ step, input: changed ? flown : null, commands: this.pending });
      this.pending = [];
    }
    this.lastInput = flown;
    const events = stepFlight(this.flight, flown);
    this.steps = step;
    if (step % SNAPSHOT_EVERY === 0) {
      this.snapshots.push(takeSnapshot(this.flight, step));
      if (this.snapshots.length > SNAPSHOTS_KEPT) this.snapshots.splice(1, 1);
    }
    return events;
  }

  recording(): Recording {
    return {
      version: RECORDING_VERSION,
      setup: this.flight.setup,
      steps: this.steps,
      entries: [...this.entries],
    };
  }
}

/**
 * Flies a recording again: from the start, or from a snapshot the recorder
 * kept. The flight it holds is a live one, so the instruments, the radio
 * and the report all come out as they were.
 */
export class ReplayPlayer {
  flight: Flight;
  step: number;
  private cursor: number;
  private input: FlightInput;

  constructor(
    readonly recording: Recording,
    start: { terrain: Terrain } | { snapshot: FlightSnapshot; world: FlightWorld },
  ) {
    if ('terrain' in start) {
      this.flight = createFlight(recording.setup, start.terrain);
      this.step = 0;
    } else {
      this.flight = restoreSnapshot(start.snapshot, start.world);
      this.step = start.snapshot.step;
    }
    this.cursor = recording.entries.findIndex((entry) => entry.step > this.step);
    if (this.cursor < 0) this.cursor = recording.entries.length;
    this.input = inputInEffect(recording.entries, this.step);
  }

  get finished(): boolean {
    return this.step >= this.recording.steps || this.flight.outcome !== null;
  }

  /** Flies on to the given step, with the recorded commands and inputs. */
  advanceTo(target: number): FlightEvent[] {
    const events: FlightEvent[] = [];
    const last = Math.min(target, this.recording.steps);
    while (this.step < last && !this.flight.outcome) {
      const step = this.step + 1;
      const entry = this.recording.entries[this.cursor];
      if (entry && entry.step === step) {
        for (const command of entry.commands) applyCommand(this.flight, command);
        if (entry.input) this.input = entry.input;
        this.cursor++;
      }
      events.push(...stepFlight(this.flight, this.input));
      this.step = step;
    }
    return events;
  }
}

/**
 * The input the next step flies with when nothing new is written for it:
 * the last one written, as the recorder writes an input only when it changes.
 */
function inputInEffect(entries: readonly RecordedStep[], step: number): FlightInput {
  let input: FlightInput = NO_INPUT;
  for (const entry of entries) {
    if (entry.step > step) break;
    if (entry.input) input = entry.input;
  }
  return input;
}

/** Flies a whole recording from its setup: for tests, and to check a link before it is trusted. */
export function replayRecording(recording: Recording, terrain: Terrain): Flight {
  const player = new ReplayPlayer(recording, { terrain });
  player.advanceTo(recording.steps);
  return player.flight;
}
