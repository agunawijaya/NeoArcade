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
  it('start against a Normal CPU, first to three, with W A S D against the arrow keys', () => {
    expect(defaultSettings().rival).toEqual({
      opponent: 'cpu',
      cpu: 'normal',
      rounds: 3,
      keys: [
        ['KeyA', 'KeyD', 'KeyW', 'KeyS'],
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
      ],
    });
  });

  it('keep rebound keys only when they are eight different keys', () => {
    const keys = [
      ['KeyJ', 'KeyL', 'KeyI', 'KeyK'],
      ['Numpad4', 'Numpad6', 'Numpad8', 'Numpad5'],
    ];
    expect(sanitiseSettings({ rival: { keys } }).rival.keys).toEqual(keys);
    for (const broken of [
      [
        ['KeyA', 'KeyA', 'KeyW', 'KeyS'],
        ['KeyJ', 'KeyL', 'KeyI', 'KeyK'],
      ],
      [['KeyA', 'KeyD', 'KeyW', 'KeyS']],
      [
        ['KeyA', 'KeyD', 'KeyW', 'KeyS'],
        ['Key A', 'KeyL', 'KeyI', 'KeyK'],
      ],
      [
        ['KeyA', 'KeyD', 'KeyW'],
        ['KeyJ', 'KeyL', 'KeyI', 'KeyK'],
      ],
      'KeyA',
    ]) {
      expect(sanitiseSettings({ rival: { keys: broken } }).rival.keys).toEqual(
        defaultSettings().rival.keys,
      );
    }
    // Kept from before the surge: a left and a right each, completed with the default surge keys.
    expect(
      sanitiseSettings({
        rival: {
          keys: [
            ['KeyJ', 'KeyL'],
            ['Numpad4', 'Numpad6'],
          ],
        },
      }).rival.keys,
    ).toEqual([
      ['KeyJ', 'KeyL', 'KeyW', 'KeyS'],
      ['Numpad4', 'Numpad6', 'ArrowUp', 'ArrowDown'],
    ]);
    // ...unless that would give one key two jobs.
    expect(
      sanitiseSettings({
        rival: {
          keys: [
            ['KeyW', 'KeyD'],
            ['ArrowLeft', 'ArrowRight'],
          ],
        },
      }).rival.keys,
    ).toEqual(defaultSettings().rival.keys);
    expect(sanitiseSettings({ rival: { cpu: 'impossible', rounds: 12 } }).rival).toMatchObject({
      cpu: 'normal',
      rounds: 9,
    });
  });
});
