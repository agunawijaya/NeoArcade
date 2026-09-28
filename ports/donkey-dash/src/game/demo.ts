import { createAutopilot, type Autopilot } from '../engine/autopilot';
import { STEP_SECONDS } from '../engine/constants';
import { endlessRun } from '../engine/modes';
import { createRun, stepRun, type RunState } from '../engine/run';
import type { Look } from '../garage';
import type { Palette } from '../render/palette';
import type { Stage } from '../render/stage';
import type { RoadView } from '../render/view';
import { Visuals } from './visuals';

/**
 * The attract mode behind the title and menus: a car on autopilot driving
 * an Endless road, dodging donkeys by itself. Silent, and it starts over
 * whenever it crashes out.
 */
export class Demo {
  private run!: RunState;
  private pilot!: Autopilot;
  private visuals!: Visuals;
  private seed: number;

  constructor(
    seed: number,
    private readonly reducedMotion: () => boolean,
  ) {
    this.seed = seed;
    this.restart();
  }

  update() {
    if (this.run.phase.kind === 'over' || this.run.drive.car.nose > 4000) {
      this.seed += 1;
      this.restart();
    }
    this.visuals.beforeStep(this.run.drive);
    const driving = this.run.phase.kind === 'drive';
    const events = stepRun(this.run, { driver: driving && this.pilot.decide(this.run.drive) });
    this.visuals.afterStep(this.run.drive);
    for (const event of events) {
      this.visuals.onEvent(event, this.run.drive);
      if (event.type === 'beat') this.visuals.onBeat();
    }
  }

  render(
    stage: Stage,
    view: RoadView,
    palette: Palette,
    look: Look,
    alpha: number,
    frameSeconds: number,
  ) {
    const crashPhase = this.run.phase.kind === 'crash' ? this.run.phase : null;
    const frame = this.visuals.frame(
      {
        drive: this.run.drive,
        crash: crashPhase
          ? { hazard: crashPhase.hazard, age: crashPhase.steps * STEP_SECONDS }
          : null,
        summit: null,
        commitGap: null,
        dropLane: null,
        palette,
        look,
        rivalHat: null,
      },
      this.reducedMotion() ? 0 : alpha,
      this.reducedMotion() ? 0 : frameSeconds,
    );
    stage.render(view, frame);
  }

  private restart() {
    this.run = createRun(endlessRun(this.seed, 'normal', true, false));
    // A good driver who shows off a little, so the title has near misses in it.
    this.pilot = createAutopilot({ reactionSeconds: 0.28, pressGap: 0.16, daring: 0.22 });
    this.visuals = new Visuals(this.reducedMotion);
  }
}
