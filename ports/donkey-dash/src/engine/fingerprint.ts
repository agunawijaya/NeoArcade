import { createAutopilot } from './autopilot';
import { classicDuel, createDuel, stepDuel, versusDuel } from './duel';
import type { Drive } from './drive';
import { dailyRun, endlessRun } from './modes';
import { legRun, legSeed } from './routes';
import { createRun, stepRun } from './run';

/**
 * A short digest of everything the engine does for a fixed set of seeds and
 * scripted players: every hazard placed, every position, every event, down
 * to the last bit of each floating-point number. Daily Road only works if
 * this comes out the same in every browser, so the cross-browser test runs
 * it in Chromium, Firefox and WebKit and compares.
 */
export function engineFingerprint(): string {
  const digest = new Digest();
  for (const seed of [1, 20_260_928, 0xdeadbeef]) {
    driveRun(digest, dailyRun(seed), 5_000);
    driveRun(digest, endlessRun(seed, 'frantic', true, true), 5_000);
  }
  driveRun(digest, legRun('desert', 2, legSeed('desert', 2), true), 6_000);
  driveRun(digest, legRun('night', 1, legSeed('night', 1), true), 6_000);
  for (const config of [classicDuel(7, 3, true), versusDuel(9, 3, true)]) {
    const duel = createDuel(config);
    const pilot = createAutopilot({ reactionSeconds: 0.18, pressGap: 0.12 });
    for (let step = 0; step < 6_000 && duel.phase.kind !== 'over'; step++) {
      const driving = duel.phase.kind === 'drive';
      const events = stepDuel(duel, {
        driver: driving && pilot.decide(duel.drive),
        donkey: step % 23 === 0,
      });
      digest.drive(duel.drive);
      for (const event of events) digest.text(event.type);
    }
    digest.number(duel.playerScores[0]).number(duel.scores.donkey);
  }
  return digest.hex();
}

function driveRun(digest: Digest, config: Parameters<typeof createRun>[0], steps: number) {
  const run = createRun(config);
  const pilot = createAutopilot({ reactionSeconds: 0.3, pressGap: 0.15, daring: 0.2 });
  for (let step = 0; step < steps && run.phase.kind !== 'over'; step++) {
    const events = stepRun(run, { driver: run.phase.kind === 'drive' && pilot.decide(run.drive) });
    digest.drive(run.drive);
    for (const event of events) {
      digest.text(event.type);
      if ('hazard' in event) digest.number(event.hazard.id).number(event.hazard.lane);
    }
  }
  digest.number(run.stats.nearMissPoints).number(run.stats.passed);
}

/** FNV-1a over 32-bit words; numbers go in as their exact IEEE 754 bits. */
class Digest {
  private hash = 0x811c9dc5;
  private readonly float = new Float64Array(1);
  private readonly words = new Uint32Array(this.float.buffer);

  number(value: number): this {
    this.float[0] = value;
    this.word(this.words[0] as number);
    this.word(this.words[1] as number);
    return this;
  }

  text(value: string): this {
    for (let i = 0; i < value.length; i++) this.word(value.charCodeAt(i));
    return this;
  }

  drive(drive: Drive): this {
    this.number(drive.car.nose).number(drive.car.lane).number(drive.speed);
    for (const hazard of drive.hazards) this.number(hazard.position).number(hazard.lane);
    return this;
  }

  hex(): string {
    return (this.hash >>> 0).toString(16).padStart(8, '0');
  }

  private word(value: number) {
    this.hash ^= value;
    this.hash = Math.imul(this.hash, 0x01000193);
  }
}
