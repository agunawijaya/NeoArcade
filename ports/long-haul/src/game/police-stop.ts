import type { EventOf } from '../engine/events';
import type { OfficerPose, PatrolScene } from '../render/scene';
import { SEDAN_LIGHTS_OFF } from '../render/vehicles/sedan/model';
import { handOverLine, stopLines, ticketFor, type StopLine, type Ticket } from './stop-copy';

/**
 * A police stop, played out on the road. The engine has already settled it
 * (who was pulled over, the fine, the hearing, jail); this only stages what
 * it decided, step by step, at its own pace whatever the time warp:
 *
 *   behind → overtake → pull-over → officer → ticket → hearing → leave
 *   behind → overtake → pull-over → officer → jail            (a fourth offence)
 *
 * The short version is overtake → pull-over → ticket → leave. The ticket and
 * the revoked licence wait for the player; everything else runs on a clock.
 * The stop says where the patrol car, the rig and the trooper are, what is
 * said, and which sounds to play; it never touches the trip.
 */
export type StopMode = 'full' | 'short';

export type StopStep =
  | 'behind'
  | 'overtake'
  | 'pull-over'
  | 'officer'
  | 'ticket'
  | 'hearing'
  | 'jail'
  | 'leave'
  | 'done';

/** One-off sounds the stop asks for as it goes. */
export type StopCue = 'air-brake' | 'door' | 'step' | 'pen' | 'bell' | 'signal' | 'cell-door';

export type Siren = 'wail' | 'yelp' | null;

export interface StopFacts {
  event: EventOf<'pulled-over'> | EventOf<'jailed'>;
  /** The speed the rig was driven at, and the limit there. */
  speed: number;
  limit: number;
  /** What the radar read, when the radar caught it. */
  reading: number | null;
  /** The hour of the day, 0–23, and whether it is dark. */
  hour: number;
  night: boolean;
  /** The next town down the road, where the hearing is. */
  town: string;
  /** "MON 9 PM", for the ticket. */
  clock: string;
  /** Picks the trooper, the words and the signature: from the trip's seed and hour, not its luck. */
  flavour: number;
  /** The rig's speed when the cruiser shows up. */
  cruise: number;
}

export type StopOverlay =
  | { kind: 'none' }
  | { kind: 'ticket'; ticket: Ticket }
  | { kind: 'hearing'; progress: number; ticket: Ticket }
  | { kind: 'jail'; progress: number; revoked: boolean };

const PLANS: Readonly<Record<StopMode, Record<'pulled-over' | 'jailed', readonly StopStep[]>>> = {
  full: {
    'pulled-over': ['behind', 'overtake', 'pull-over', 'officer', 'ticket', 'hearing', 'leave'],
    jailed: ['behind', 'overtake', 'pull-over', 'officer', 'jail'],
  },
  short: {
    'pulled-over': ['overtake', 'pull-over', 'ticket', 'leave'],
    jailed: ['overtake', 'pull-over', 'jail'],
  },
};

const SECONDS: Readonly<Record<StopMode, Partial<Record<StopStep, number>>>> = {
  full: { behind: 3.4, overtake: 5, 'pull-over': 5, hearing: 6.5, jail: 3.2, leave: 6.5 },
  short: { overtake: 3, 'pull-over': 2.6, jail: 2.2, leave: 3.4 },
};

/** Seconds each line stays up at the window. */
const LINE_SECONDS = 2.4;
/** How long the officer takes to get out and walk back before speaking. */
const WALK_SECONDS = 4.6;

const CAPTIONS: Readonly<Record<StopStep, string>> = {
  behind: 'Lights in the mirror',
  overtake: 'The patrol car pulls out to pass',
  'pull-over': 'Pulling over',
  officer: 'The trooper walks up',
  ticket: 'Your ticket',
  hearing: 'The hearing in town',
  jail: 'County jail',
  leave: 'Back on the road',
  done: '',
};

/** Feet from the rig's front bumper to the cruiser's once both are pulled over. */
const PARKED_GAP = 38;
/** Feet behind its front bumper where the cruiser's passenger door is. */
const DOOR_FROM_FRONT = 7.8;
/** The rig's passenger window, in feet from its front bumper. */
const WINDOW_AT = -9.6;
const FEET_PER_SECOND_PER_MPH = 5280 / 3600;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Progress through part of a step: 0 before `from`, 1 after `to`. */
const span = (p: number, from: number, to: number) => clamp((p - from) / (to - from));

export class PoliceStop {
  readonly steps: readonly StopStep[];
  readonly lines: readonly StopLine[];
  readonly ticket: Ticket | null;
  step: StopStep;
  /** Seconds into the current step, and into the whole stop. */
  private t = 0;
  private elapsed = 0;
  private index = 0;
  private rolled = 0;
  private lastGap: number;
  private cues: StopCue[] = [];
  private fired = new Set<string>();

  constructor(
    readonly facts: StopFacts,
    readonly mode: StopMode,
    readonly skippable: boolean,
  ) {
    this.steps = PLANS[mode][facts.event.type];
    this.step = this.steps[0] as StopStep;
    this.lines = stopLines(facts);
    this.ticket = ticketFor(facts);
    this.lastGap = this.pose().gap;
  }

  get done(): boolean {
    return this.step === 'done';
  }

  /** Waiting for the player to read the ticket or the revoked licence. */
  get waiting(): boolean {
    return this.step === 'ticket' || (this.step === 'jail' && this.t >= this.duration('jail'));
  }

  get caption(): string {
    return CAPTIONS[this.step];
  }

  /** Seconds the current step lasts; the officer's walk grows with what there is to say. */
  duration(step: StopStep = this.step): number {
    if (step === 'officer') return WALK_SECONDS + this.lines.length * LINE_SECONDS;
    if (step === 'ticket') return Infinity;
    return SECONDS[this.mode][step] ?? 0;
  }

  update(dt: number) {
    if (this.done) return;
    this.elapsed += dt;
    this.t += dt;
    this.queueCues();
    if (!this.waiting && this.t >= this.duration()) this.advance();
    const gap = this.pose().gap;
    // The cruiser's own wheels turn with the road plus whatever it gains on the rig.
    this.rolled += Math.max(
      0,
      this.rigSpeed() * FEET_PER_SECOND_PER_MPH * dt + (gap - this.lastGap),
    );
    this.lastGap = gap;
  }

  /** The player has read the ticket or the licence. */
  proceed() {
    if (this.waiting) this.advance();
  }

  /**
   * Skips ahead to what matters, the ticket or the jail; from there on, to
   * the end. Only after the first stop has been seen through.
   */
  skip() {
    if (!this.skippable || this.done) return;
    const result = this.steps.findIndex((step) => step === 'ticket' || step === 'jail');
    if (this.index < result) {
      this.index = result;
      this.step = this.steps[result] as StopStep;
      this.t = this.step === 'jail' ? this.duration('jail') : 0;
      this.lastGap = this.pose().gap;
      return;
    }
    this.index = this.steps.length;
    this.step = 'done';
  }

  /** Sounds asked for since the last call. */
  takeCues(): StopCue[] {
    const cues = this.cues;
    this.cues = [];
    return cues;
  }

  get siren(): Siren {
    const p = this.progress;
    if (this.step === 'behind') return 'wail';
    if (this.step === 'overtake') return 'yelp';
    if (this.step === 'pull-over' && p < 0.6) return 'wail';
    return null;
  }

  /** The rig's speed in miles an hour, which the scenery rolls by at. */
  rigSpeed(): number {
    const { cruise } = this.facts;
    const p = this.progress;
    switch (this.step) {
      case 'behind':
      case 'overtake':
        return cruise;
      case 'pull-over':
        return cruise * (1 - smooth(span(p, 0.3, 1)));
      case 'leave':
        return cruise * 0.6 * smooth(span(p, 0.5, 1));
      default:
        return 0;
    }
  }

  /** The line being said now, if any. */
  line(): StopLine | null {
    if (this.step === 'officer') {
      const talking = this.t - WALK_SECONDS;
      if (talking < 0) return null;
      return (
        this.lines[Math.min(this.lines.length - 1, Math.floor(talking / LINE_SECONDS))] ?? null
      );
    }
    if (this.step === 'ticket') return handOverLine(this.facts);
    return null;
  }

  overlay(): StopOverlay {
    const p = this.progress;
    if (this.step === 'ticket' && this.ticket) return { kind: 'ticket', ticket: this.ticket };
    if (this.step === 'hearing' && this.ticket)
      return { kind: 'hearing', progress: p, ticket: this.ticket };
    if (this.step === 'jail')
      return { kind: 'jail', progress: Math.min(1, p), revoked: this.waiting };
    return { kind: 'none' };
  }

  /** Where everything is on the road now. */
  pose(): PatrolScene {
    const { night } = this.facts;
    const p = this.progress;
    const blink = Math.floor(this.elapsed * 3) % 2 === 0;
    const lights = { ...SEDAN_LIGHTS_OFF, head: night, markers: night };
    const parked = {
      gap: PARKED_GAP,
      lane: -1,
      rolled: this.rolled,
      lights: { ...lights, bar: true },
      rigLane: -1,
      hazards: true,
      rigSignal: null,
      door: 0,
      officer: null,
      settle: 0,
      rigBrake: false,
    } satisfies PatrolScene;
    switch (this.step) {
      case 'behind':
        return {
          ...parked,
          gap: lerp(-175, -90, 1 - (1 - p) * (1 - p)),
          lane: 0.35,
          rigLane: 0,
          hazards: false,
        };
      case 'overtake': {
        // Up alongside the cab, a moment there while the trooper looks the rig over, then on ahead.
        const from = this.mode === 'short' ? -150 : -90;
        const closing = 1 - (1 - span(p, 0, 0.4)) ** 2;
        const pacing = span(p, 0.4, 0.62);
        const passing = smooth(span(p, 0.62, 1));
        return {
          ...parked,
          gap: lerp(from, -2, closing) + pacing * 4 + passing * 56,
          lane: lerp(this.mode === 'short' ? 0.6 : 0.35, 1, smooth(span(p, 0, 0.3))),
          rigLane: 0,
          hazards: false,
        };
      }
      case 'pull-over': {
        const merged = smooth(span(p, 0, 0.35));
        const over = smooth(span(p, 0.3, 0.8));
        return {
          ...parked,
          gap: lerp(lerp(58, 50, merged), PARKED_GAP, smooth(span(p, 0.3, 1))),
          lane: lerp(lerp(1, 0, merged), -1, smooth(span(p, 0.25, 0.75))),
          lights: { ...lights, bar: true, brake: p > 0.3, right: p < 0.35 && blink },
          rigLane: -over,
          hazards: p > 0.55,
          settle: p > 0.9 ? Math.sin((p - 0.9) * 60) * 0.12 * (1 - (p - 0.9) / 0.1) : 0,
          rigBrake: p > 0.3,
        };
      }
      case 'officer': {
        const walked = span(this.t, 0.5, WALK_SECONDS - 0.6);
        const out = this.t > 0.4;
        return {
          ...parked,
          lights: { ...lights, bar: true, spot: night, driver: false },
          door: smooth(span(this.t, 0, 0.5)),
          officer: out ? this.officerWalking(walked, this.t >= WALK_SECONDS - 0.6) : null,
        };
      }
      case 'ticket':
        return {
          ...parked,
          lights: { ...lights, bar: true, spot: night, driver: false },
          door: 1,
          officer: atWindow(true),
        };
      case 'hearing':
        return { ...parked, lights };
      case 'jail':
        return { ...parked, lights: { ...lights, bar: true, spot: night, driver: false }, door: 1 };
      case 'leave': {
        const going = smooth(span(p, 0.08, 0.6));
        return {
          ...parked,
          gap: lerp(PARKED_GAP, 460, going * going),
          lane: lerp(-1, 0.2, smooth(span(p, 0.1, 0.45))),
          lights: { ...lights, left: p < 0.3 && blink },
          rigLane: -1 + smooth(span(p, 0.55, 0.95)),
          hazards: false,
          rigSignal: p > 0.35 && p < 0.95 && blink ? 'left' : null,
        };
      }
      case 'done':
        return { ...parked, gap: 1000, lane: 0.2, rigLane: 0, hazards: false, lights };
    }
  }

  private officerWalking(walked: number, arrived: boolean): OfficerPose {
    const from = PARKED_GAP - DOOR_FROM_FRONT;
    const along = lerp(from, WINDOW_AT, smooth(walked));
    if (arrived) return atWindow(this.t > WALK_SECONDS + LINE_SECONDS * (this.lines.length - 1));
    return {
      along,
      out: lerp(2.4, 0.6, walked),
      stride: (from - along) / 2.5,
      walking: walked > 0 && walked < 0.9,
      facing: -1,
      // The last steps take him up onto the cab's step.
      atWindow: smooth(span(walked, 0.86, 1)),
      writing: false,
    };
  }

  private get progress(): number {
    const duration = this.duration();
    return Number.isFinite(duration) && duration > 0 ? clamp(this.t / duration) : 0;
  }

  private advance() {
    this.index += 1;
    this.step = this.steps[this.index] ?? 'done';
    this.t = 0;
  }

  /** Sounds tied to moments in each step, each asked for once. */
  private queueCues() {
    const at = (name: StopCue, seconds: number, key = `${name}@${seconds}`) => {
      const id = `${this.index}:${key}`;
      if (this.t >= seconds && !this.fired.has(id)) {
        this.fired.add(id);
        this.cues.push(name);
      }
    };
    const duration = this.duration();
    switch (this.step) {
      case 'pull-over':
        at('air-brake', duration * 0.88);
        break;
      case 'officer':
        at('door', 0.15);
        for (let stride = 0; stride < 8; stride++) at('step', 0.7 + stride * 0.45);
        at('pen', WALK_SECONDS + LINE_SECONDS * (this.lines.length - 1));
        break;
      case 'ticket':
        at('pen', 0.1);
        break;
      case 'hearing':
        at('bell', 0.2);
        at('bell', duration * 0.75);
        break;
      case 'jail':
        at('cell-door', duration * 0.6);
        break;
      case 'leave':
        at('door', 0);
        for (let tick = 0; tick < 6; tick++) at('signal', duration * (0.38 + tick * 0.09));
        break;
      default:
        break;
    }
  }
}

function atWindow(writing: boolean): OfficerPose {
  return {
    along: WINDOW_AT,
    out: 0.6,
    stride: 0,
    walking: false,
    facing: -1,
    atWindow: 1,
    writing,
  };
}

/**
 * A radar trap that let the rig go: the patrol car comes up behind with a
 * blip of its lights and drives on past. Nothing stops; it plays alongside
 * the hour.
 */
export class RadarPass {
  static readonly SECONDS = 5.5;
  private t = 0;
  private rolled = 0;

  constructor(
    private readonly night: boolean,
    private readonly cruise: number,
  ) {}

  get done(): boolean {
    return this.t >= RadarPass.SECONDS;
  }

  update(dt: number) {
    const before = this.gap();
    this.t += dt;
    this.rolled += Math.max(0, this.cruise * FEET_PER_SECOND_PER_MPH * dt + (this.gap() - before));
  }

  private gap(): number {
    return lerp(-170, 260, smooth(this.t / RadarPass.SECONDS));
  }

  pose(): PatrolScene {
    const p = this.t / RadarPass.SECONDS;
    return {
      gap: this.gap(),
      lane: lerp(0.4, 1, smooth(span(p, 0, 0.25))),
      rolled: this.rolled,
      lights: {
        ...SEDAN_LIGHTS_OFF,
        head: this.night,
        markers: this.night,
        bar: p > 0.18 && p < 0.42,
      },
      rigLane: 0,
      hazards: false,
      rigSignal: null,
      door: 0,
      officer: null,
      settle: 0,
      rigBrake: false,
    };
  }
}
