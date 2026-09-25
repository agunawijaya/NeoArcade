import { describe, expect, it } from 'vitest';
import {
  cleanName,
  defaultSettings,
  isCpu,
  matchingPreset,
  matchOptionsFrom,
  PRESETS,
  sanitiseSettings,
  withPreset,
} from './settings';

describe('presets', () => {
  it('match the table in the design brief', () => {
    expect(PRESETS.classic).toMatchObject({
      players: 'humanVsHuman',
      world: 'earth',
      points: 3,
      aiming: 'typed',
      powerUps: false,
      weather: false,
      crt: true,
    });
    expect(PRESETS.neo).toMatchObject({
      players: 'humanVsCpu',
      cpuLevel: 'normal',
      points: 3,
      aiming: 'drag',
      powerUps: true,
      weather: true,
      crt: false,
    });
  });

  it('play the original match length in Classic and first-to in NeoArcade', () => {
    expect(PRESETS.classic.format).toBe('total');
    expect(PRESETS.neo.format).toBe('firstTo');
  });

  it('keep the names when switching', () => {
    const settings = { ...defaultSettings(), names: ['Ada', 'Grace'] as [string, string] };
    expect(withPreset(settings, 'classic').names).toEqual(['Ada', 'Grace']);
  });

  it('are recognised, and any change makes the settings custom', () => {
    const neo = defaultSettings();
    expect(matchingPreset(neo)).toBe('neo');
    expect(matchingPreset(withPreset(neo, 'classic'))).toBe('classic');
    expect(matchingPreset({ ...neo, world: 'moon' })).toBeNull();
    expect(matchingPreset({ ...neo, aimAssist: true })).toBeNull();
  });

  it('leave aim assist off, so every throw is judged by eye as in 1990', () => {
    expect(PRESETS.classic.aimAssist).toBe(false);
    expect(PRESETS.neo.aimAssist).toBe(false);
  });

  it('ignore CPU difficulty when nobody is a CPU', () => {
    const classic = withPreset(defaultSettings(), 'classic');
    expect(matchingPreset({ ...classic, cpuLevel: 'brutal' })).toBe('classic');
  });

  it('do not share state between copies', () => {
    const settings = withPreset(defaultSettings(), 'neo');
    settings.powerUpKinds.golden = false;
    expect(PRESETS.neo.powerUpKinds.golden).toBe(true);
  });
});

describe('cleanName', () => {
  it('keeps ten characters and falls back to the default', () => {
    expect(cleanName('  Bartholomew the Great ', 0)).toBe('Bartholome');
    expect(cleanName('   ', 1)).toBe('Player 2');
  });
});

describe('sanitiseSettings', () => {
  it('survives garbage', () => {
    expect(sanitiseSettings(null)).toEqual(defaultSettings());
    expect(sanitiseSettings('nope')).toEqual(defaultSettings());
  });

  it('keeps good fields and repairs bad ones', () => {
    const repaired = sanitiseSettings({
      world: 'mars',
      points: 99,
      format: 'sudden-death',
      names: ['Ada', 42],
      powerUpKinds: { golden: false },
    });
    expect(repaired.world).toBe('mars');
    expect(repaired.points).toBe(20);
    expect(repaired.format).toBe(defaultSettings().format);
    expect(repaired.names).toEqual(['Ada', 'Player 2']);
    expect(repaired.powerUpKinds).toMatchObject({ golden: false, tri: true });
  });

  it('fills in aim assist for settings saved before it existed', () => {
    const older: Record<string, unknown> = { ...defaultSettings() };
    delete older.aimAssist;
    expect(sanitiseSettings(older).aimAssist).toBe(false);
    expect(sanitiseSettings({ ...older, aimAssist: true }).aimAssist).toBe(true);
  });
});

describe('match options', () => {
  it('pass only the enabled power-ups', () => {
    const settings = defaultSettings();
    settings.powerUpKinds.shield = false;
    expect(matchOptionsFrom(settings, 1).powerUps).not.toContain('shield');
    expect(matchOptionsFrom({ ...settings, powerUps: false }, 1).powerUps).toEqual([]);
  });

  it('know who the CPU is', () => {
    const settings = defaultSettings();
    expect([isCpu(settings, 0), isCpu(settings, 1)]).toEqual([false, true]);
    expect(isCpu({ ...settings, players: 'cpuVsCpu' }, 0)).toBe(true);
    expect(isCpu({ ...settings, players: 'humanVsHuman' }, 1)).toBe(false);
  });
});
