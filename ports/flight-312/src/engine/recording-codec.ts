import type { ReadbackChoice } from './atc';
import { CHECKLISTS, type ChecklistId } from './checklists';
import type { CrewCommand, KnobId, McpButton } from './crew';
import type { FlightInput, FlightSetup } from './flight-state';
import type { FmsEdit } from './fms';
import type { SpeedbrakeLever } from './panel';
import type { RecordedStep, Recording } from './recording';

/**
 * A recording as bytes: small enough for a link. The setup travels as
 * JSON; then each written step as the steps since the last one, a byte of
 * flags for what changed, the stick and pedals as small differences in
 * 1/128ths, and the commands as a byte each plus what they carry. A
 * checksum at the end catches a link cut short or mistyped. The bytes are
 * deflated and put in base64url by the game (`game/replay-link.ts`).
 */
const MAGIC = [0x46, 0x33]; // "F3"
const CHECKSUM_BYTES = 4;

const KNOBS: readonly KnobId[] = [
  'heading',
  'course1',
  'course2',
  'altitude',
  'verticalSpeed',
  'speed',
  'speedBug',
  'altimeter',
  'nav1Whole',
  'nav1Fraction',
  'nav2Whole',
  'nav2Fraction',
  'commWhole',
  'commFraction',
];
const BUTTONS: readonly McpButton[] = [
  'autopilot',
  'flightDirector',
  'autothrottle',
  'heading',
  'navigation',
  'approach',
  'altitudeHold',
  'verticalSpeed',
  'speed',
  'lnav',
  'levelChange',
  'speedHold',
];
const SPEEDBRAKES: readonly SpeedbrakeLever[] = ['down', 'armed', 'flight', 'up'];
const READBACKS: readonly ReadbackChoice['id'][] = ['correct', 'wrong', 'sayAgain'];
const CHECKLIST_IDS: readonly ChecklistId[] = CHECKLISTS.map((list) => list.id);
const COMMANDS: readonly CrewCommand['kind'][] = [
  'knob',
  'button',
  'gear',
  'levers',
  'reverse',
  'flapLever',
  'speedbrake',
  'parkingBrake',
  'swapComm',
  'crossfeed',
  'wipers',
  'landingLights',
  'thrustStep',
  'flapStep',
  'programFlaps',
  'speedbrakeStep',
  'reverseToggle',
  'nextStation',
  'autoCourse',
  'tuneNav',
  'readback',
  'completeChecklist',
  'fms',
];

const AXIS = 128;
const LEVER = 1024;
const FLAG = {
  elevator: 1,
  aileron: 2,
  rudder: 4,
  brakes: 8,
  trim: 16,
  presses: 32,
  commands: 64,
  sameInput: 128,
} as const;

export class RecordingError extends Error {}

class Writer {
  private chunks: number[] = [];
  byte(value: number) {
    this.chunks.push(value & 0xff);
  }
  /** Unsigned LEB128. */
  unsigned(value: number) {
    let rest = Math.max(0, Math.floor(value));
    do {
      let byte = rest % 128;
      rest = Math.floor(rest / 128);
      if (rest > 0) byte |= 0x80;
      this.byte(byte);
    } while (rest > 0);
  }
  /** ZigZag, then LEB128. */
  signed(value: number) {
    const whole = Math.round(value);
    this.unsigned(whole >= 0 ? whole * 2 : -whole * 2 - 1);
  }
  text(value: string) {
    const bytes = new TextEncoder().encode(value);
    this.unsigned(bytes.length);
    for (const byte of bytes) this.byte(byte);
  }
  get bytes(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

/** The scale of a number's eighth byte, 128 to the seventh: no number the recording writes runs longer. */
const LONGEST_SCALE = 562_949_953_421_312;

class Reader {
  private at = 0;
  constructor(private readonly bytes: Uint8Array) {}
  byte(): number {
    const value = this.bytes[this.at++];
    if (value === undefined) throw new RecordingError('The recording ends too soon.');
    return value;
  }
  unsigned(): number {
    let value = 0;
    let scale = 1;
    for (;;) {
      const byte = this.byte();
      value += (byte & 0x7f) * scale;
      if ((byte & 0x80) === 0) return value;
      scale *= 128;
      if (scale > LONGEST_SCALE) throw new RecordingError('A number in the recording is too long.');
    }
  }
  signed(): number {
    const raw = this.unsigned();
    return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
  }
  text(): string {
    const length = this.unsigned();
    if (this.at + length > this.bytes.length)
      throw new RecordingError('The recording ends too soon.');
    const slice = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    return new TextDecoder('utf-8', { fatal: true }).decode(slice);
  }
  get done(): boolean {
    return this.at === this.bytes.length;
  }
}

function indexOf<T>(list: readonly T[], value: T): number {
  const index = list.indexOf(value);
  if (index < 0) throw new RecordingError(`Nothing to write for ${String(value)}.`);
  return index;
}

function pick<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new RecordingError('The recording names something unknown.');
  return value;
}

function writeCommand(out: Writer, command: CrewCommand) {
  out.byte(indexOf(COMMANDS, command.kind));
  switch (command.kind) {
    case 'knob':
      out.byte(indexOf(KNOBS, command.knob));
      out.signed(command.clicks);
      return;
    case 'button':
      out.byte(indexOf(BUTTONS, command.button));
      return;
    case 'levers':
    case 'reverse':
      out.unsigned(Math.round(Math.min(1, Math.max(0, command.value)) * LEVER));
      return;
    case 'flapLever':
      out.unsigned(command.index);
      return;
    case 'speedbrake':
      out.byte(indexOf(SPEEDBRAKES, command.lever));
      return;
    case 'thrustStep':
    case 'flapStep':
    case 'speedbrakeStep':
      out.signed(command.direction);
      return;
    case 'tuneNav':
      out.byte(command.radio);
      out.unsigned(Math.round(command.frequency * 100));
      out.unsigned(Math.round(command.course));
      return;
    case 'readback':
      out.byte(indexOf(READBACKS, command.choice));
      return;
    case 'completeChecklist':
      out.byte(indexOf(CHECKLIST_IDS, command.id));
      return;
    case 'fms':
      out.text(JSON.stringify(command.edit));
      return;
    default:
      return;
  }
}

function readCommand(input: Reader): CrewCommand {
  const kind = pick(COMMANDS, input.byte());
  switch (kind) {
    case 'knob':
      return { kind, knob: pick(KNOBS, input.byte()), clicks: input.signed() };
    case 'button':
      return { kind, button: pick(BUTTONS, input.byte()) };
    case 'levers':
    case 'reverse':
      return { kind, value: input.unsigned() / LEVER };
    case 'flapLever':
      return { kind, index: input.unsigned() };
    case 'speedbrake':
      return { kind, lever: pick(SPEEDBRAKES, input.byte()) };
    case 'thrustStep':
    case 'flapStep':
    case 'speedbrakeStep':
      return { kind, direction: input.signed() < 0 ? -1 : 1 };
    case 'tuneNav': {
      const radio = input.byte() === 1 ? 1 : 0;
      return { kind, radio, frequency: input.unsigned() / 100, course: input.unsigned() };
    }
    case 'readback':
      return { kind, choice: pick(READBACKS, input.byte()) };
    case 'completeChecklist':
      return { kind, id: pick(CHECKLIST_IDS, input.byte()) };
    case 'fms':
      return { kind, edit: JSON.parse(input.text()) as FmsEdit };
    default:
      return { kind } as CrewCommand;
  }
}

const AXES = ['elevator', 'aileron', 'rudder', 'brakes'] as const;

export function encodeRecording(recording: Recording): Uint8Array {
  const out = new Writer();
  for (const byte of MAGIC) out.byte(byte);
  out.byte(recording.version);
  out.text(JSON.stringify(recording.setup));
  out.unsigned(recording.steps);
  out.unsigned(recording.entries.length);
  let lastStep = 0;
  let last: FlightInput = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    brakes: 0,
    trim: 0,
    pitchSteps: 0,
    rudderSteps: 0,
    rudderCentre: false,
    flare: false,
    missedApproach: false,
  };
  for (const entry of recording.entries) {
    out.unsigned(entry.step - lastStep);
    lastStep = entry.step;
    const input = entry.input;
    let flags = entry.commands.length > 0 ? FLAG.commands : 0;
    if (!input) flags |= FLAG.sameInput;
    else {
      for (const axis of AXES) if (input[axis] !== last[axis]) flags |= FLAG[axis];
      if (input.trim !== last.trim) flags |= FLAG.trim;
      if (
        input.pitchSteps !== 0 ||
        input.rudderSteps !== 0 ||
        input.rudderCentre ||
        input.flare ||
        input.missedApproach
      )
        flags |= FLAG.presses;
    }
    out.byte(flags);
    if (input) {
      for (const axis of AXES)
        if (flags & FLAG[axis]) out.signed((input[axis] - last[axis]) * AXIS);
      if (flags & FLAG.trim) out.signed(input.trim);
      if (flags & FLAG.presses) {
        out.signed(input.pitchSteps);
        out.signed(input.rudderSteps);
        out.byte(
          (input.rudderCentre ? 1 : 0) | (input.flare ? 2 : 0) | (input.missedApproach ? 4 : 0),
        );
      }
      last = input;
    }
    if (flags & FLAG.commands) {
      out.unsigned(entry.commands.length);
      for (const command of entry.commands) writeCommand(out, command);
    }
  }
  const body = out.bytes;
  const sum = checksum(body);
  const whole = new Uint8Array(body.length + CHECKSUM_BYTES);
  whole.set(body);
  new DataView(whole.buffer).setUint32(body.length, sum);
  return whole;
}

export function decodeRecording(bytes: Uint8Array): Recording {
  if (bytes.length < MAGIC.length + 1 + CHECKSUM_BYTES)
    throw new RecordingError('That is not a Flight 312 recording.');
  const body = bytes.subarray(0, bytes.length - CHECKSUM_BYTES);
  const stored = new DataView(bytes.buffer, bytes.byteOffset).getUint32(body.length);
  if (stored !== checksum(body)) throw new RecordingError('The recording is damaged.');
  const input = new Reader(body);
  if (input.byte() !== MAGIC[0] || input.byte() !== MAGIC[1])
    throw new RecordingError('That is not a Flight 312 recording.');
  const version = input.byte();
  const setup = JSON.parse(input.text()) as FlightSetup;
  const steps = input.unsigned();
  const count = input.unsigned();
  const entries: RecordedStep[] = [];
  let step = 0;
  let last: FlightInput = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    brakes: 0,
    trim: 0,
    pitchSteps: 0,
    rudderSteps: 0,
    rudderCentre: false,
    flare: false,
    missedApproach: false,
  };
  for (let index = 0; index < count; index++) {
    step += input.unsigned();
    const flags = input.byte();
    let flown: FlightInput | null = null;
    if (!(flags & FLAG.sameInput)) {
      const next = { ...last, pitchSteps: 0, rudderSteps: 0 };
      for (const axis of AXES)
        if (flags & FLAG[axis]) next[axis] = last[axis] + input.signed() / AXIS;
      if (flags & FLAG.trim) next.trim = input.signed();
      if (flags & FLAG.presses) {
        next.pitchSteps = input.signed();
        next.rudderSteps = input.signed();
        const bits = input.byte();
        next.rudderCentre = (bits & 1) !== 0;
        next.flare = (bits & 2) !== 0;
        next.missedApproach = (bits & 4) !== 0;
      } else {
        next.rudderCentre = false;
        next.flare = false;
        next.missedApproach = false;
      }
      flown = next;
      last = next;
    }
    const commands: CrewCommand[] = [];
    if (flags & FLAG.commands) {
      const many = input.unsigned();
      for (let command = 0; command < many; command++) commands.push(readCommand(input));
    }
    entries.push({ step, input: flown, commands });
  }
  if (!input.done) throw new RecordingError('The recording has bytes left over.');
  return { version, setup, steps, entries };
}

/** FNV-1a over the bytes. */
function checksum(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
