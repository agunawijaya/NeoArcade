import { describe, expect, it } from 'vitest';
import { createStore } from '@shared/storage';
import { CHAPTERS } from './game/campaign';
import {
  emptyProgress,
  isChapterOpen,
  loadProgress,
  recordChapter,
  saveProgress,
  totalStars,
} from './progress';
import { defaultKeys, defaultSettings, keysFor, sanitiseSettings, spareKeysFor } from './settings';

describe('settings', () => {
  it('fall back field by field on anything unexpected', () => {
    const settings = sanitiseSettings({
      theme: 'airshow',
      camera: 'fisheye',
      flight: 'classic',
      dogfight: { opponents: 7, level: 'brutal' },
      keys: { solo: { fire: 'KeyJ', bomb: '<script>' } },
    });
    expect(settings.theme).toBe('airshow');
    expect(settings.camera).toBe('side');
    expect(settings.flight).toBe('classic');
    expect(settings.dogfight).toEqual({ opponents: 1, level: 'brutal' });
    expect(settings.keys.solo).toEqual({ fire: 'KeyJ' });
    expect(sanitiseSettings(null)).toEqual(defaultSettings());
  });

  it('start a new player on the Great War, in smooth flight, with the modern keys', () => {
    expect(defaultSettings()).toMatchObject({
      theme: 'great-war',
      flight: 'smooth',
      layout: 'modern',
    });
  });

  it('keep 1984’s own key table for the classic layout', () => {
    expect(defaultKeys('solo', 'classic')).toMatchObject({
      faster: 'KeyX',
      slower: 'KeyZ',
      pull: 'Comma',
      push: 'Slash',
      flip: 'Period',
      fire: 'Space',
      bomb: 'KeyB',
      home: 'KeyH',
      missile: 'KeyV',
      starburst: 'KeyC',
    });
  });

  it('lay the player’s own keys over the defaults, and give the two halves of the keyboard no key in common', () => {
    const settings = {
      ...defaultSettings(),
      keys: { solo: { fire: 'KeyJ' }, left: {}, right: {} },
    };
    expect(keysFor(settings, 'solo').fire).toBe('KeyJ');
    expect(keysFor(settings, 'solo').bomb).toBe('KeyB');
    const left = Object.values(defaultKeys('left', 'modern'));
    const right = Object.values(defaultKeys('right', 'modern'));
    expect(left.filter((code) => right.includes(code))).toEqual([]);
  });

  it('let the arrows fly the plane too, alone with the modern keys, unless they have another job', () => {
    const settings = defaultSettings();
    expect(spareKeysFor(settings, 'solo')).toEqual({
      pull: 'ArrowUp',
      push: 'ArrowDown',
      faster: 'ArrowRight',
      slower: 'ArrowLeft',
    });
    const fireOnUp = { ...settings, keys: { solo: { fire: 'ArrowUp' }, left: {}, right: {} } };
    expect(spareKeysFor(fireOnUp, 'solo').pull).toBeUndefined();
    expect(spareKeysFor({ ...settings, layout: 'classic' }, 'solo')).toEqual({});
    expect(spareKeysFor(settings, 'left')).toEqual({});
  });
});

describe('progress', () => {
  it('opens the chapters one after another and keeps every star ever earned', () => {
    const progress = emptyProgress();
    expect(isChapterOpen(progress, 0)).toBe(true);
    expect(isChapterOpen(progress, 1)).toBe(false);
    const first = CHAPTERS[0]?.id ?? '';
    expect(recordChapter(progress, first, [true, false, true], 1200)).toBe(2);
    expect(recordChapter(progress, first, [true, true, false], 900)).toBe(1);
    expect(progress.chapters[first]).toEqual({ stars: [true, true, true], bestScore: 1200 });
    expect(isChapterOpen(progress, 1)).toBe(true);
    expect(totalStars(progress)).toBe(3);
  });

  it('survives a round trip through storage, and ignores rubbish in it', () => {
    const store = createStore('mind-the-ox-test', null);
    const progress = emptyProgress();
    progress.hangarFound = true;
    progress.dogfightWins.hard = 2;
    saveProgress(store, progress);
    expect(loadProgress(store)).toEqual(progress);
    store.set('progress', { chapters: { 'ox-pasture': { stars: 'yes' } }, classicBest: 'lots' });
    expect(loadProgress(store)).toEqual(emptyProgress());
  });
});
