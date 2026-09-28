import { describe, expect, it } from 'vitest';
import { flatSetup, throwOf } from '../../test/fixtures';
import { simulateShot } from '../engine/shot';
import { ShotPlayback } from './playback';

describe('ShotPlayback', () => {
  const record = simulateShot(flatSetup(), throwOf(0, 45, 60));

  it('walks the recorded path at the given pace, smoothing between steps', () => {
    const playback = new ShotPlayback(record, 10);
    playback.advance(0.25);
    expect(playback.clock).toBeCloseTo(2.5);
    const [banana] = playback.bananas;
    const points = record.tracks[0]?.points ?? [];
    expect(banana?.x).toBeCloseTo(((points[2]?.x ?? 0) + (points[3]?.x ?? 0)) / 2);
  });

  it('hands out each event once, when it is reached', () => {
    const playback = new ShotPlayback(record, 28);
    const seen = [];
    while (!playback.done) seen.push(...playback.advance(1 / 60));
    expect(seen).toEqual(record.events);
    expect(playback.bananas).toEqual([]);
  });

  it('can join a flight part-way, handing over the events it skipped', () => {
    const tri = simulateShot(flatSetup(), throwOf(0, 60, 60, 'tri'));
    const split = tri.events.find((event) => event.type === 'split');
    const playback = new ShotPlayback(tri, 28);
    const skipped = playback.skipTo((split?.step ?? 0) + 1);
    expect(skipped).toContainEqual(split);
    const later: unknown[] = [];
    while (!playback.done) later.push(...playback.advance(1 / 60));
    expect([...skipped, ...later]).toEqual(tri.events);
  });

  it('shows all three bananas after a split', () => {
    const tri = simulateShot(flatSetup(), throwOf(0, 60, 60, 'tri'));
    const split = tri.events.find((event) => event.type === 'split');
    const playback = new ShotPlayback(tri, 28);
    playback.advance(((split?.step ?? 0) + 2) / 28);
    expect(playback.bananas.map((banana) => banana.id).sort()).toEqual([1, 2, 3]);
  });
});
