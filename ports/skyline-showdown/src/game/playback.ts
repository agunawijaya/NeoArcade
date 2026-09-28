import type { Point } from '../engine/geometry';
import type { ShotEvent, ShotRecord } from '../engine/shot';

export interface BananaInFlight extends Point {
  id: number;
  golden: boolean;
}

/**
 * Plays a finished shot back in time. The engine has already decided
 * everything; this only walks along the recorded path at a steady number of
 * steps per second, smoothing between steps, and hands out events as they
 * are reached.
 */
export class ShotPlayback {
  /** Position in simulation steps; fractional between steps. */
  clock = 0;
  private nextEvent = 0;

  constructor(
    readonly record: ShotRecord,
    private readonly stepsPerSecond: number,
  ) {}

  /**
   * Starts the playback part-way through, as the instant replay does for a
   * long flight. Events before that point are handed back, so their marks on
   * the city can still be made.
   */
  skipTo(step: number): ShotEvent[] {
    this.clock = Math.max(0, Math.min(this.record.steps, step));
    return this.advance(0);
  }

  /** Moves the clock forward and returns the events it passed. */
  advance(seconds: number): ShotEvent[] {
    this.clock = Math.min(this.record.steps, this.clock + seconds * this.stepsPerSecond);
    const passed: ShotEvent[] = [];
    while (this.nextEvent < this.record.events.length) {
      const event = this.record.events[this.nextEvent] as ShotEvent;
      if (event.step > this.clock) break;
      passed.push(event);
      this.nextEvent++;
    }
    return passed;
  }

  get done(): boolean {
    return this.clock >= this.record.steps && this.nextEvent >= this.record.events.length;
  }

  /** Every banana still in the air right now. */
  get bananas(): BananaInFlight[] {
    const flying: BananaInFlight[] = [];
    for (const track of this.record.tracks) {
      const local = this.clock - track.startStep;
      const last = track.points.length - 1;
      if (local < 0 || local >= last) continue;
      const index = Math.floor(local);
      const from = track.points[index] as Point;
      const to = track.points[index + 1] as Point;
      const share = local - index;
      flying.push({
        id: track.id,
        golden: track.golden,
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share,
      });
    }
    return flying;
  }
}
