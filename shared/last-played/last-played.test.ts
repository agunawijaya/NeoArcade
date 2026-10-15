import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../storage';
import {
  clearPlays,
  HISTORY_LENGTH,
  isHistoryKey,
  parseResumeRequest,
  playCounts,
  recentPlays,
  reportPlay,
  resumeQuery,
  takeResumeRequest,
} from './index';

const memory = () => createStore('test-last-played', null);
const at = (minute: number) => new Date(Date.UTC(2026, 9, 15, 12, minute));

describe('reportPlay', () => {
  it('keeps the newest play first, one per game and mode', () => {
    const store = memory();
    reportPlay({ game: 'long-haul', mode: 'career', label: 'Career · Denver' }, store, at(1));
    reportPlay(
      { game: 'skyline-showdown', mode: 'tour', item: 'tokyo', label: 'World Tour · Tokyo' },
      store,
      at(2),
    );
    reportPlay({ game: 'long-haul', mode: 'career', label: 'Career · Chicago' }, store, at(3));
    expect(recentPlays(store)).toEqual([
      { game: 'long-haul', mode: 'career', label: 'Career · Chicago', at: at(3).toISOString() },
      {
        game: 'skyline-showdown',
        mode: 'tour',
        item: 'tokyo',
        label: 'World Tour · Tokyo',
        at: at(2).toISOString(),
      },
    ]);
  });

  it('counts every start of a game, and forgets everything on clear', () => {
    const store = memory();
    reportPlay({ game: 'donkey-dash', mode: 'endless', label: 'Endless' }, store, at(1));
    reportPlay({ game: 'donkey-dash', mode: 'daily', label: 'Daily Road #18' }, store, at(2));
    reportPlay({ game: 'donkey-dash', mode: 'endless', label: 'Endless' }, store, at(3));
    expect(playCounts(store)).toEqual({ 'donkey-dash': 3 });
    clearPlays(store);
    expect(recentPlays(store)).toEqual([]);
    expect(playCounts(store)).toEqual({});
  });

  it('keeps a bounded history', () => {
    const store = memory();
    for (let index = 0; index < HISTORY_LENGTH + 5; index++) {
      reportPlay({ game: `game-${index}`, mode: 'play', label: 'Played' }, store, at(index));
    }
    const plays = recentPlays(store);
    expect(plays).toHaveLength(HISTORY_LENGTH);
    expect(plays[0]?.game).toBe(`game-${HISTORY_LENGTH + 4}`);
  });

  it('refuses plays that do not fit, with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memory();
    reportPlay({ game: 'Long Haul', mode: 'career', label: 'Career' }, store);
    reportPlay({ game: 'long-haul', mode: 'career', label: '   ' }, store);
    expect(recentPlays(store)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('survives damaged storage and trims long labels', () => {
    const store = memory();
    store.set('history', [
      'junk',
      { game: 'x', mode: 'y', label: 'A'.repeat(200), at: at(1).toISOString() },
      { game: 'x', mode: 'z', label: 'ok', at: 'not a date' },
    ]);
    store.set('counts', { x: 2, 'Bad Slug': 3, y: -1 });
    expect(recentPlays(store).map((play) => play.label.length)).toEqual([60]);
    expect(playCounts(store)).toEqual({ x: 2 });
  });
});

describe('resume links', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips a mode and an item through the address', () => {
    expect(resumeQuery({ mode: 'daily' })).toBe('?play=daily');
    expect(resumeQuery({ mode: 'tour', item: 'new-york' })).toBe('?play=tour&item=new-york');
    expect(parseResumeRequest('?seed=4&play=tour&item=new-york')).toEqual({
      mode: 'tour',
      item: 'new-york',
    });
    expect(parseResumeRequest('?play=daily&item=<script>')).toEqual({ mode: 'daily' });
    expect(parseResumeRequest('?play=Daily Mode')).toBeNull();
    expect(parseResumeRequest('')).toBeNull();
  });

  it('takes the request out of the address so a reload stays put', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', {
      href: 'http://localhost/skyline-showdown/?seed=7&play=tricks&item=bank-shot#top',
      search: '?seed=7&play=tricks&item=bank-shot',
    });
    vi.stubGlobal('history', { state: null, replaceState });
    expect(takeResumeRequest()).toEqual({ mode: 'tricks', item: 'bank-shot' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/skyline-showdown/?seed=7#top');
  });

  it('tells its own storage keys apart from others', () => {
    expect(isHistoryKey('neoarcade:last-played:history')).toBe(true);
    expect(isHistoryKey('neoarcade:pass:profile')).toBe(false);
    expect(isHistoryKey(null)).toBe(true);
  });
});
