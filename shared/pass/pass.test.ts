import { afterEach, describe, expect, it, vi } from 'vitest';
import { xpForLevel } from './levels';
import { createArcadePass, PROFILE_STORAGE_KEY, type PassEvent, type PassOptions } from './pass';
import {
  BlockedStorage,
  FillableStorage,
  manualClock,
  MemoryStorage,
  testManifest,
} from './test-helpers';

function setUp(options: PassOptions = {}) {
  const backend = options.backend === undefined ? new MemoryStorage() : options.backend;
  const clock = manualClock();
  const pass = createArcadePass({ backend, now: clock.now, watchOtherTabs: false, ...options });
  const events: PassEvent[] = [];
  pass.subscribe((event) => events.push(event));
  return { pass, game: pass.forGame(testManifest), backend, clock, events };
}

function stored(backend: Storage | null) {
  return JSON.parse(backend?.getItem(PROFILE_STORAGE_KEY) ?? 'null');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a fresh Pass', () => {
  it('starts at level 1 with nothing saved until something happens', () => {
    const { pass, backend } = setUp();
    expect(pass.level).toBe(1);
    expect(pass.profile.xp).toBe(0);
    expect(pass.profile.name).toBe('Player One');
    expect(pass.health).toBe('ok');
    expect(pass.notice).toBeNull();
    expect(stored(backend)).toBeNull();
  });
});

describe('award', () => {
  it('adds XP, remembers the game and writes the reason to the feed', () => {
    const { pass, game, backend, events } = setUp();
    const result = game.award(40, 'Won in Jakarta');
    expect(result).toEqual({ granted: 40, asked: 40, reduced: false, level: 1, levelUp: false });
    expect(pass.profile.xp).toBe(40);
    expect(pass.profile.games['test-game']?.xp).toBe(40);
    expect(pass.profile.feed[0]).toMatchObject({
      kind: 'xp',
      game: 'test-game',
      xp: 40,
      text: 'Won in Jakarta',
    });
    expect(events).toContainEqual({
      type: 'xp',
      game: 'test-game',
      granted: 40,
      asked: 40,
      reason: 'Won in Jakarta',
    });
    expect(stored(backend).xp).toBe(40);
  });

  it('announces a level-up with what it unlocks', () => {
    const { game, events } = setUp();
    game.award(100, 'Warm-up');
    const result = game.award(60, 'Won a match');
    expect(result.levelUp).toBe(true);
    const levelUp = events.find((event) => event.type === 'level');
    expect(levelUp).toMatchObject({ type: 'level', level: 2, previousLevel: 1, newRank: false });
    const unlocked = levelUp?.type === 'level' ? levelUp.unlocks : [];
    expect(unlocked).toContainEqual({
      game: null,
      id: 'headphones',
      name: 'Headphones',
      kind: 'Headwear',
    });
    expect(unlocked).toContainEqual({
      game: 'test-game',
      id: 'party-hat',
      name: 'Party hat',
      kind: 'Hat',
    });
  });

  it('marks a new rank', () => {
    const { game, events, clock } = setUp();
    for (let day = 1; day <= 5; day++) {
      clock.set(`2026-10-0${day}T12:00:00`);
      game.award(240, 'Tournament win');
    }
    const levelUps = events.filter((event) => event.type === 'level');
    expect(levelUps.at(-1)).toMatchObject({
      level: 5,
      newRank: true,
      rank: { name: 'Button Masher' },
    });
  });

  it('thins out after the daily threshold and recovers the next day', () => {
    const { pass, game, clock } = setUp();
    const granted = [];
    for (let match = 0; match < 12; match++) granted.push(game.award(100, 'Won a match').granted);
    expect(granted.slice(0, 4)).toEqual([100, 100, 100, 100]);
    expect(granted.slice(4, 8)).toEqual([50, 50, 50, 50]);
    expect(granted[8]).toBe(10);
    expect(pass.profile.xp).toBe(640);

    clock.set('2026-09-29T08:00:00');
    expect(game.award(100, 'Won a match')).toMatchObject({ granted: 100, reduced: false });
  });

  it('caps each game separately', () => {
    const { pass, game } = setUp();
    const other = pass.forGame({ ...testManifest, game: 'other-game' });
    for (let match = 0; match < 8; match++) game.award(100, 'Won a match');
    expect(other.award(100, 'Won a match').granted).toBe(100);
  });

  it('refuses nonsense without throwing, and says so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pass, game } = setUp();
    expect(game.award(-5, 'Oops').granted).toBe(0);
    expect(game.award(Number.NaN, 'Oops').granted).toBe(0);
    expect(game.award(20, '   ').granted).toBe(0);
    expect(game.award(-5, 'Oops').granted).toBe(0);
    expect(pass.profile.xp).toBe(0);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('clamps an absurd award', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { game } = setUp();
    expect(game.award(1_000_000, 'Glitch').asked).toBe(250);
  });

  it('folds repeated awards into one feed line', () => {
    const { pass, game, clock } = setUp();
    game.award(10, 'Played a match');
    clock.advanceMinutes(5);
    game.award(10, 'Played a match');
    game.award(40, 'Won a match');
    game.award(10, 'Played a match');
    expect(pass.profile.feed.map((entry) => [entry.text, entry.xp, entry.times])).toEqual([
      ['Played a match', 10, 1],
      ['Won a match', 40, 1],
      ['Played a match', 20, 2],
    ]);
  });
});

describe('badges', () => {
  it('unlock once, pay their XP past the daily cap, and name what they unlock', () => {
    const { pass, game, events } = setUp();
    for (let match = 0; match < 30; match++) game.award(100, 'Won a match');
    const before = pass.profile.xp;
    expect(game.unlock('champion')).toBe(true);
    expect(game.unlock('champion')).toBe(false);
    expect(pass.profile.xp).toBe(before + 200);
    expect(game.hasBadge('champion')).toBe(true);
    const badgeEvents = events.filter((event) => event.type === 'badge');
    expect(badgeEvents).toHaveLength(1);
    expect(badgeEvents[0]).toMatchObject({
      badge: { id: 'champion' },
      xp: 200,
      unlocks: [
        { game: 'test-game', id: 'golden-banana', name: 'Golden banana', kind: 'Banana skin' },
      ],
    });
    // The badge's XP also crossed a level, which is the newest line.
    expect(pass.profile.feed.slice(0, 2)).toMatchObject([
      { kind: 'level', text: 'Reached level 4' },
      { kind: 'badge', text: 'Champion', xp: 200 },
    ]);
  });

  it('use the tier XP by default', () => {
    const { pass, game } = setUp();
    game.unlock('first-win');
    expect(pass.profile.xp).toBe(25);
  });

  it('ignore ids the manifest does not have', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { game } = setUp();
    expect(game.unlock('typo' as 'oops')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no badge "typo"'));
  });

  it('count up to their target and unlock when they reach it', () => {
    const { game, events } = setUp();
    for (let hit = 0; hit < 9; hit++) expect(game.progress('sun-seeker', { add: 1 })).toBe(false);
    expect(game.progressOf('sun-seeker')).toBe(9);
    expect(game.progress('sun-seeker', { add: 1 })).toBe(true);
    expect(game.hasBadge('sun-seeker')).toBe(true);
    expect(game.progress('sun-seeker', { add: 1 })).toBe(false);
    expect(events.filter((event) => event.type === 'badge')).toHaveLength(1);
  });

  it('take absolute counts that never go backwards', () => {
    const { game } = setUp();
    game.progress('sun-seeker', 6);
    game.progress('sun-seeker', 2);
    expect(game.progressOf('sun-seeker')).toBe(6);
    expect(game.progress('sun-seeker', 12)).toBe(true);
  });

  it('refuse progress on a badge without a target', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { game } = setUp();
    expect(game.progress('first-win', { add: 1 })).toBe(false);
    expect(game.progressOf('first-win')).toBe(0);
  });
});

describe('stats', () => {
  it('set, add, keep the best and keep the lowest', () => {
    const { game } = setUp();
    expect(game.stat('matches', { add: 1 })).toBe(1);
    expect(game.stat('matches', { add: 1 })).toBe(2);
    expect(game.stat('bestStreak', { max: 3 })).toBe(3);
    expect(game.stat('bestStreak', { max: 2 })).toBe(3);
    expect(game.stat('fastestWin', { min: 90 })).toBe(90);
    expect(game.stat('fastestWin', { min: 45 })).toBe(45);
    expect(game.stat('wins', 7)).toBe(7);
    expect(game.statOf('matches')).toBe(2);
  });

  it('only accept keys from the manifest', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { game } = setUp();
    expect(game.stat('secretKey' as 'wins', 5)).toBe(0);
    expect(game.statOf('wins')).toBeUndefined();
  });
});

describe('cosmetics', () => {
  it('unlock by arcade level or by badge', () => {
    const { game } = setUp();
    expect(game.isUnlocked('party-hat')).toBe(false);
    expect(game.isUnlocked('golden-banana')).toBe(false);
    game.award(150, 'Big win');
    expect(game.isUnlocked('party-hat')).toBe(true);
    game.unlock('champion');
    expect(game.isUnlocked('golden-banana')).toBe(true);
  });

  it('let the player wear only what their level has unlocked', () => {
    const { pass, game } = setUp();
    expect(pass.dressUp({ headwear: 'headphones' })).toBe(false);
    expect(pass.profile.look.headwear).toBe('none');
    game.award(150, 'Big win');
    expect(pass.dressUp({ headwear: 'headphones', eyes: 'happy' })).toBe(true);
    expect(pass.profile.look).toMatchObject({ headwear: 'headphones', eyes: 'happy' });
  });
});

describe('the player', () => {
  it('can be renamed, within limits', () => {
    const { pass } = setUp();
    pass.rename('  Grace\u0007  Hopper  the Great ');
    expect(pass.profile.name).toBe('Grace Hopper the');
    pass.rename('   ');
    expect(pass.profile.name).toBe('Player One');
  });
});

describe('storage', () => {
  it('survives a reload', () => {
    const { game, backend } = setUp();
    game.award(40, 'Won');
    game.unlock('first-win');
    const reloaded = createArcadePass({ backend, watchOtherTabs: false });
    expect(reloaded.profile.xp).toBe(65);
    expect(reloaded.forGame(testManifest).hasBadge('first-win')).toBe(true);
  });

  it('keeps progress made in another tab', () => {
    const backend = new MemoryStorage();
    const tabA = createArcadePass({ backend, watchOtherTabs: false }).forGame(testManifest);
    const tabB = createArcadePass({ backend, watchOtherTabs: false }).forGame(testManifest);
    tabA.award(40, 'Won in tab A');
    tabB.award(30, 'Won in tab B');
    expect(stored(backend).xp).toBe(70);
  });

  it('keeps working in memory when storage is unavailable', () => {
    for (const backend of [null, new BlockedStorage()]) {
      const { pass, game } = setUp({ backend });
      expect(pass.health).toBe('unavailable');
      game.award(40, 'Won');
      expect(game.unlock('first-win')).toBe(true);
      expect(pass.profile.xp).toBe(65);
      expect(pass.health).toBe('unavailable');
    }
  });

  it('notices when storage fills up, and when it recovers', () => {
    const backend = new FillableStorage();
    const { pass, game, events } = setUp({ backend });
    game.award(40, 'Won');
    backend.fill();
    game.award(40, 'Won again');
    expect(pass.health).toBe('full');
    expect(pass.profile.xp).toBe(80);
    expect(stored(backend).xp).toBe(40);

    backend.drain();
    game.award(40, 'Won a third time');
    expect(pass.health).toBe('ok');
    expect(stored(backend).xp).toBe(120);
    expect(events.filter((event) => event.type === 'health')).toEqual([
      { type: 'health', health: 'full' },
      { type: 'health', health: 'ok' },
    ]);
  });

  it('sets an unreadable profile aside instead of overwriting it', () => {
    const backend = new MemoryStorage();
    backend.setItem(PROFILE_STORAGE_KEY, '{"version": 1, "xp": 12');
    const { pass, game } = setUp({ backend });
    expect(pass.notice).toBe('set-aside');
    expect(pass.profile.xp).toBe(0);
    expect(JSON.parse(backend.getItem('neoarcade:pass:profile-unreadable') ?? '')).toBe(
      '{"version": 1, "xp": 12',
    );
    game.award(10, 'Fresh start');
    expect(stored(backend).xp).toBe(10);
  });

  it('sets aside JSON that is not a profile', () => {
    const backend = new MemoryStorage();
    backend.setItem(PROFILE_STORAGE_KEY, '["not", "a", "profile"]');
    const { pass } = setUp({ backend });
    expect(pass.notice).toBe('set-aside');
    expect(backend.getItem('neoarcade:pass:profile-unreadable')).toBe('["not","a","profile"]');
  });

  it('repairs damaged fields and keeps the rest', () => {
    const backend = new MemoryStorage();
    backend.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        name: 'Ada',
        xp: 'lots',
        look: { face: 'robot', eyes: 'lasers' },
        games: {
          'test-game': { xp: 25, badges: { 'first-win': '2026-09-01T10:00:00.000Z' } },
          'Bad Slug': {},
        },
        feed: [{ kind: 'nonsense' }],
      }),
    );
    const { pass, game } = setUp({ backend });
    expect(pass.notice).toBe('repaired');
    expect(pass.profile).toMatchObject({ name: 'Ada', xp: 0, feed: [] });
    expect(pass.profile.look).toMatchObject({ face: 'robot', eyes: 'dots' });
    expect(Object.keys(pass.profile.games)).toEqual(['test-game']);
    expect(game.hasBadge('first-win')).toBe(true);
  });

  it('never overwrites a profile saved by a newer version', () => {
    const backend = new MemoryStorage();
    const newer = JSON.stringify({ version: 99, xp: 123456 });
    backend.setItem(PROFILE_STORAGE_KEY, newer);
    const { pass, game } = setUp({ backend });
    expect(pass.health).toBe('newer-version');
    game.award(40, 'Won');
    expect(pass.profile.xp).toBe(40);
    expect(backend.getItem(PROFILE_STORAGE_KEY)).toBe(newer);
  });
});

describe('backup, restore and reset', () => {
  it('restores a profile and resets to a fresh one', () => {
    const { pass, game, events } = setUp();
    game.award(40, 'Won');
    const saved = structuredClone(pass.profile);
    pass.reset();
    expect(pass.profile.xp).toBe(0);
    expect(pass.profile.games).toEqual({});
    pass.restore(saved);
    expect(pass.profile.xp).toBe(40);
    expect(events.filter((event) => event.type === 'change').length).toBeGreaterThanOrEqual(2);
  });

  it('exports a code and a file', () => {
    const { pass, game } = setUp();
    game.award(40, 'Won');
    expect(pass.exportCode()).toMatch(/^NEOPASS1\.[\w-]+\.[0-9a-f]{8}$/);
    expect(JSON.parse(pass.exportFile())).toMatchObject({
      format: 'neoarcade-pass',
      profile: { xp: 40 },
    });
  });
});

describe('listeners', () => {
  it('are isolated from each other', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { pass, game } = setUp();
    const heard: string[] = [];
    pass.subscribe(() => {
      throw new Error('broken listener');
    });
    const stop = pass.subscribe((event) => heard.push(event.type));
    game.award(10, 'One');
    stop();
    game.award(10, 'Two');
    expect(heard).toEqual(['xp']);
  });
});

describe('the level table and the Pass agree', () => {
  it('reaches level 10 at exactly the table total', () => {
    const { pass, game, clock } = setUp();
    let day = 1;
    while (pass.profile.xp < xpForLevel(10)) {
      clock.set(`2026-10-${String(day++).padStart(2, '0')}T12:00:00`);
      for (let award = 0; award < 4; award++) game.award(100, 'Daily session');
    }
    expect(pass.level).toBe(10);
  });
});
