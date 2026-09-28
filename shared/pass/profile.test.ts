import { describe, expect, it } from 'vitest';
import { encodeBackupCode, readBackup, backupFileText, summariseProfile } from './backup';
import { migrateProfile, PROFILE_VERSION, type MigrationSteps } from './migrate';
import { cleanName, emptyProfile, loadProfile } from './profile';

const now = new Date('2026-09-28T10:00:00');

describe('migrateProfile', () => {
  it('passes a current profile straight through', () => {
    const profile = emptyProfile(now);
    expect(migrateProfile(profile)).toEqual({
      ok: true,
      data: profile,
      fromVersion: PROFILE_VERSION,
    });
  });

  it('runs every step in order from an old version', () => {
    const steps: MigrationSteps = {
      1: (v1) => ({ ...v1, nickname: v1.name }),
      2: (v2) => ({ ...v2, name: `${String(v2.nickname)}!`, nickname: undefined }),
    };
    const result = migrateProfile({ version: 1, name: 'Ada' }, steps, 3);
    expect(result).toEqual({
      ok: true,
      data: { version: 3, name: 'Ada!', nickname: undefined },
      fromVersion: 1,
    });
  });

  it('refuses a gap in the steps', () => {
    expect(migrateProfile({ version: 1 }, {}, 2)).toEqual({ ok: false, reason: 'missing-step' });
  });

  it('leaves newer versions alone', () => {
    expect(migrateProfile({ version: 7 })).toEqual({
      ok: false,
      reason: 'newer-version',
      version: 7,
    });
  });

  it('recognises things that are not profiles', () => {
    for (const raw of [
      null,
      42,
      'profile',
      [],
      {},
      { version: 'one' },
      { version: 0 },
      { version: 1.5 },
    ]) {
      expect(migrateProfile(raw)).toEqual({ ok: false, reason: 'not-a-profile' });
    }
  });
});

describe('loadProfile', () => {
  it('loads a clean profile without repairs', () => {
    const profile = emptyProfile(now);
    expect(loadProfile(JSON.parse(JSON.stringify(profile)), now)).toEqual({
      status: 'loaded',
      profile,
      repaired: false,
    });
  });

  it('caps the feed and drops unknown look parts', () => {
    const feed = Array.from({ length: 60 }, (_, index) => ({
      at: now.toISOString(),
      kind: 'xp',
      game: 'test-game',
      xp: index,
      text: `Award ${index}`,
      times: 1,
    }));
    const loaded = loadProfile({ ...emptyProfile(now), feed, look: { headwear: 'jetpack' } }, now);
    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.profile.feed).toHaveLength(40);
    expect(loaded.profile.look.headwear).toBe('none');
    expect(loaded.repaired).toBe(true);
  });
});

describe('cleanName', () => {
  it('keeps names short and printable, counting emoji as one', () => {
    expect(cleanName('🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌🍌')).toBe('🍌'.repeat(16));
    expect(cleanName('\tAda\n')).toBe('Ada');
    expect(cleanName(42)).toBe('Player One');
  });
});

describe('backups', () => {
  const profile = {
    ...emptyProfile(now),
    name: 'Grace',
    xp: 1300,
    games: {
      'test-game': {
        xp: 1300,
        firstPlayed: now.toISOString(),
        lastPlayed: now.toISOString(),
        badges: { 'first-win': now.toISOString(), oops: now.toISOString() },
        progress: {},
        stats: { wins: 12 },
        day: '2026-09-28',
        askedToday: 80,
      },
    },
  };

  it('round-trip through a code', () => {
    const code = encodeBackupCode(profile);
    expect(readBackup(code, now)).toEqual({ ok: true, profile, exportedAt: null });
  });

  it('accept a code broken across lines or padded with spaces', () => {
    const code = encodeBackupCode(profile);
    const wrapped = `  ${code.slice(0, 30)}\n${code.slice(30, 90)}\n ${code.slice(90)}  `;
    expect(readBackup(wrapped, now).ok).toBe(true);
  });

  it('round-trip through a file', () => {
    const file = backupFileText(profile, now);
    expect(readBackup(file, now)).toEqual({ ok: true, profile, exportedAt: now.toISOString() });
  });

  it('accept a bare profile pasted as JSON', () => {
    expect(readBackup(JSON.stringify(profile), now).ok).toBe(true);
  });

  it('catch a truncated or altered code', () => {
    const code = encodeBackupCode(profile);
    const truncated = readBackup(code.slice(0, -20) + code.slice(-9), now);
    expect(truncated).toEqual({
      ok: false,
      problem: expect.stringMatching(/incomplete or mistyped/),
    });
    const altered = code.replace(/\.(.)/, (_, first: string) => `.${first === 'a' ? 'b' : 'a'}`);
    expect(readBackup(altered, now).ok).toBe(false);
  });

  it('explain what is wrong in plain words', () => {
    expect(readBackup('   ', now)).toEqual({ ok: false, problem: expect.stringMatching(/^Paste/) });
    expect(readBackup('hello there', now)).toEqual({
      ok: false,
      problem: 'This isn’t an Arcade Pass backup.',
    });
    expect(readBackup('{"format":"something-else"}', now).ok).toBe(false);
    expect(readBackup('{oops', now)).toEqual({
      ok: false,
      problem: expect.stringMatching(/valid JSON/),
    });
    expect(readBackup('NEOPASS9.abc.12345678', now)).toEqual({
      ok: false,
      problem: expect.stringMatching(/newer version/),
    });
    expect(readBackup(JSON.stringify({ version: 3, xp: 1 }), now)).toEqual({
      ok: false,
      problem: expect.stringMatching(/newer version/),
    });
  });

  it('summarise what a backup holds', () => {
    expect(summariseProfile(profile)).toMatchObject({
      name: 'Grace',
      level: 5,
      rank: { name: 'Button Masher' },
      xp: 1300,
      badges: 2,
      games: 1,
    });
  });
});
