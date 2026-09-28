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
