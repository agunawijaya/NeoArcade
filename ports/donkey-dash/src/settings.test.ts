import { describe, expect, it } from 'vitest';
import { defaultSettings, POINTS_RANGE, sanitiseSettings } from './settings';

describe('settings', () => {
  it('start with Road Trip in the Chase view, and Classic Duel without the modern hazards', () => {
    const settings = defaultSettings();
    expect(settings.mode).toBe('trip');
    expect(settings.camera).toBe('chase');
    expect(settings.points).toBe(5);
    expect(settings.hazards).toEqual({ classic: false, versus: false, endless: true });
    expect(settings.filter).toBe('none');
  });

  it('survive anything storage hands back, field by field', () => {
    expect(sanitiseSettings(null)).toEqual(defaultSettings());
    expect(sanitiseSettings('nonsense')).toEqual(defaultSettings());
    const mixed = sanitiseSettings({
      mode: 'versus',
      camera: 'fisheye',
      difficulty: 'frantic',
      points: 99,
      rhythm: 'yes',
      hazards: { classic: true, versus: 'no' },
      filter: 'cga',
    });
    expect(mixed).toEqual({
      ...defaultSettings(),
      mode: 'versus',
      difficulty: 'frantic',
      points: POINTS_RANGE.max,
      hazards: { classic: true, versus: false, endless: true },
      filter: 'cga',
    });
    expect(sanitiseSettings({ points: 0 }).points).toBe(POINTS_RANGE.min);
    expect(sanitiseSettings({ points: 2.5 }).points).toBe(5);
  });
});

describe('Rival Driver settings', () => {
  it('start against a Normal CPU, first to three, with A and D against the arrow keys', () => {
    expect(defaultSettings().rival).toEqual({
      opponent: 'cpu',
      cpu: 'normal',
      rounds: 3,
      keys: [
        ['KeyA', 'KeyD'],
        ['ArrowLeft', 'ArrowRight'],
      ],
    });
  });

  it('keep rebound keys only when they are four different keys', () => {
    const keys = [
      ['KeyJ', 'KeyL'],
      ['Numpad4', 'Numpad6'],
    ];
    expect(sanitiseSettings({ rival: { keys } }).rival.keys).toEqual(keys);
    for (const broken of [
      [
        ['KeyA', 'KeyA'],
        ['KeyJ', 'KeyL'],
      ],
      [['KeyA', 'KeyD']],
      [
        ['KeyA', 'KeyD'],
        ['Key A', 'KeyL'],
      ],
      'KeyA',
    ]) {
      expect(sanitiseSettings({ rival: { keys: broken } }).rival.keys).toEqual(
        defaultSettings().rival.keys,
      );
    }
    expect(sanitiseSettings({ rival: { cpu: 'impossible', rounds: 12 } }).rival).toMatchObject({
      cpu: 'normal',
      rounds: 9,
    });
  });
});
