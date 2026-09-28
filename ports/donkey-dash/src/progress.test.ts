import { createStore } from '@shared/storage';
import { describe, expect, it } from 'vitest';
import { ROUTE_IDS } from './engine/routes';
import {
  allRoutesFinished,
  allStars,
  emptyProgress,
  isLegOpen,
  loadProgress,
  recordLeg,
  routeStars,
  saveProgress,
  totalStars,
} from './progress';

describe('Road Trip progress', () => {
  it('opens the first leg of Farm Lanes, and each next leg once the one before is finished', () => {
    const progress = emptyProgress();
    expect(isLegOpen(progress, 'farm', 0)).toBe(true);
    expect(isLegOpen(progress, 'farm', 1)).toBe(false);
    expect(isLegOpen(progress, 'mountain', 0)).toBe(false);
    recordLeg(progress, 'farm', 0, [true, false, false], 900);
    expect(isLegOpen(progress, 'farm', 1)).toBe(true);
  });

  it('keeps stars once earned and opens routes by the total', () => {
    const progress = emptyProgress();
    recordLeg(progress, 'farm', 0, [true, true, false], 900);
    const second = recordLeg(progress, 'farm', 0, [true, false, true], 700);
    expect(second.newStars).toBe(1);
    expect(second.bestScore).toBe(false);
    expect(routeStars(progress, 'farm')).toBe(3);
    const opening = recordLeg(progress, 'farm', 1, [true, false, false], 500);
    expect(opening.opened).toEqual(['mountain']);
    expect(isLegOpen(progress, 'mountain', 0)).toBe(true);
  });

  it('knows when a route is finished and clean, and when everything is done', () => {
    const progress = emptyProgress();
    recordLeg(progress, 'farm', 0, [true, true, false], 1);
    recordLeg(progress, 'farm', 1, [true, true, false], 1);
    const last = recordLeg(progress, 'farm', 2, [true, true, false], 1);
    expect(last).toMatchObject({ routeFinished: true, routeClean: true, firstFinish: true });
    for (const route of ROUTE_IDS) {
      for (let leg = 0; leg < 3; leg++) recordLeg(progress, route, leg, [true, true, true], 1);
    }
    expect(allRoutesFinished(progress)).toBe(true);
    expect(allStars(progress)).toBe(true);
    expect(totalStars(progress)).toBe(45);
  });

  it('round-trips through storage and ignores what it does not recognise', () => {
    const store = createStore('test-progress', null);
    const progress = emptyProgress();
    recordLeg(progress, 'desert', 1, [true, false, true], 1234);
    progress.donkeyStreak = 4;
    saveProgress(store, progress);
    expect(loadProgress(store)).toEqual(progress);
    store.set('progress', {
      legs: { 'moon-0': { stars: [true] }, 'farm-0': 'bad' },
      donkeyStreak: -3,
    });
    expect(loadProgress(store)).toEqual(emptyProgress());
  });
});
