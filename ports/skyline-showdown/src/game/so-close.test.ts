import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import { flatSetup, throwOf } from '../../test/fixtures';
import { gorillaCentre } from '../engine/gorillas';
import { simulateShot, type ShotSetup } from '../engine/shot';
import { commentFor, describeMiss, judgeMiss, METRES_PER_UNIT, type Miss } from './so-close';

function missOf(setup: ShotSetup, angle: number, velocity: number): Miss {
  const shot = simulateShot(setup, throwOf(0, angle, velocity));
  expect(shot.victim).toBeNull();
  return judgeMiss(shot, setup.gorillas, setup.gravity);
}

describe('judgeMiss', () => {
  it('uses a two-metre gorilla as the scale', () => {
    expect(30 * METRES_PER_UNIT).toBeCloseTo(2);
  });

  it('calls a soft throw short and a hard one long', () => {
    const setup = flatSetup();
    const short = missOf(setup, 45, 40);
    expect(short.verdict).toBe('short');
    const long = missOf(setup, 30, 110);
    expect(['long', 'over']).toContain(long.verdict);
  });

  it('says a lob that clears the target went over it', () => {
    const setup = flatSetup();
    const over = missOf(setup, 60, 85);
    expect(over.verdict).toBe('over');
  });

  it('says blocked when a building stopped an arc that was heading for the target', () => {
    const heights = Array.from({ length: 12 }, () => 60);
    heights[6] = 260;
    const setup = flatSetup(heights);
    // Aimed as if the tower were not there.
    const open = flatSetup();
    let aimed: { velocity: number } | null = null;
    for (let velocity = 40; velocity < 120 && !aimed; velocity++) {
      const shot = simulateShot(open, throwOf(0, 40, velocity));
      if (shot.victim === 1) aimed = { velocity };
    }
    if (!aimed) throw new Error('No hit in the open city.');
    const blocked = missOf(setup, 40, aimed.velocity);
    expect(blocked.verdict).toBe('blocked');
  });

  it('measures the nearest pass in metres, and a whisker is tiny', () => {
    const setup = flatSetup();
    const target = gorillaCentre(setup.gorillas[1]);
    let nearest: Miss | null = null;
    for (let velocity = 60; velocity < 80; velocity++) {
      const shot = simulateShot(setup, throwOf(0, 45, velocity));
      if (shot.victim !== null) continue;
      const miss = judgeMiss(shot, setup.gorillas, setup.gravity);
      if (!nearest || miss.metres < nearest.metres) nearest = miss;
    }
    expect(nearest?.metres).toBeLessThan(3);
    expect(Math.abs((nearest?.landing.x ?? 0) - target.x)).toBeLessThan(80);
  });
});

describe('commentFor', () => {
  const close: Miss = { metres: 0.8, verdict: 'short', landing: { x: 0, y: 0 } };

  it('never says the same thing twice in a row', () => {
    const rng = createRng(3);
    let previous: string | null = null;
    for (let turn = 0; turn < 60; turn++) {
      const line = commentFor(close, previous, rng);
      expect(line).not.toBe(previous);
      previous = line;
    }
  });

  it('talks about the building when a banana was blocked', () => {
    const line = commentFor({ ...close, metres: 12, verdict: 'blocked' }, null, createRng(1));
    expect(line).toMatch(/building|Blocked|way/);
  });

  it('labels the marker with the distance and the verdict', () => {
    expect(describeMiss({ metres: 2.35, verdict: 'long', landing: { x: 0, y: 0 } })).toBe(
      '2.4 m long',
    );
  });
});
