import { describe, expect, it } from 'vitest';
import {
  altimeter,
  altitude,
  frequency,
  heading,
  phrase,
  readbackFor,
  runwayName,
  wind,
  type PhraseKey,
} from './phraseology';

describe('numbers the aviation way', () => {
  it('says altitudes in thousands and hundreds, and flight levels digit by digit', () => {
    expect(altitude(3000)).toEqual({ written: '3,000', spoken: 'tree thousand' });
    expect(altitude(11_000).spoken).toBe('one one thousand');
    expect(altitude(2500).spoken).toBe('two thousand fife hundred');
    expect(altitude(900).spoken).toBe('niner hundred');
    expect(altitude(35_000)).toEqual({ written: 'FL350', spoken: 'flight level tree fife zero' });
  });

  it('says headings, frequencies, altimeter settings and runways digit by digit', () => {
    expect(heading(75)).toEqual({ written: '075', spoken: 'zero seven fife' });
    expect(heading(0).written).toBe('360');
    expect(frequency(124.35)).toEqual({
      written: '124.35',
      spoken: 'one two four point tree fife',
    });
    expect(frequency(120.6)).toEqual({ written: '120.6', spoken: 'one two zero point six' });
    expect(frequency(118.5).spoken).toBe('one one eight point fife');
    expect(altimeter(29.92).spoken).toBe('two niner niner two');
    expect(runwayName('04R').spoken).toBe('runway four right');
    expect(runwayName('22').spoken).toBe('runway two two');
    expect(runwayName('09R').spoken).toBe('runway niner right');
  });

  it('reads the wind in tens of degrees, with gusts only when they matter', () => {
    expect(wind(74, 12, 20).written).toBe('wind 070 at 12, gusts 20');
    expect(wind(74, 12, 13).written).toBe('wind 070 at 12');
    expect(wind(0, 1).spoken).toBe('wind calm');
  });
});

describe('every transmission', () => {
  const keys: PhraseKey[] = [
    'clearance',
    'programBrief',
    'contactTower',
    'takeoff',
    'contactDeparture',
    'radarContact',
    'contactCenter',
    'centerClimb',
    'descend',
    'contactApproach',
    'vector',
    'turn',
    'approachClearance',
    'contactArrivalTower',
    'landing',
    'goAround',
    'welcome',
    'sayAgain',
    'howDoYouRead',
    'correction',
  ];
  const values = {
    destination: 'Boston Logan',
    facility: 'Boston',
    altitudeFt: 2000,
    heading: 10,
    frequency: 120.6,
    runway: '04R',
    wind: { direction: 40, speedKt: 14, gustKt: 24 },
    altimeter: 30.01,
    squawk: '4632',
  };

  it.each(keys)('%s renders in words for the voice and in figures for the subtitles', (key) => {
    const { written, spoken } = phrase(key, values);
    expect(written.startsWith('Brightwater 312')).toBe(true);
    expect(spoken.startsWith('Brightwater three twelve')).toBe(true);
    // Spoken text carries no figures, so a voice never reads "120.6" as a decimal.
    expect(spoken).not.toMatch(/\d/);
    const readback = readbackFor(key, values);
    if (readback) {
      expect(readback.spoken).not.toMatch(/\d/);
      expect(readback.written.endsWith('Brightwater 312.')).toBe(true);
    }
  });

  it('clears the flight the way the program did, in the controllers’ words', () => {
    expect(phrase('approachClearance', values).written).toBe(
      'Brightwater 312, turn heading 010, maintain 2,000 until established on the localizer, cleared ILS runway 04R approach.',
    );
    expect(
      phrase('takeoff', { runway: '09R', wind: { direction: 70, speedKt: 8, gustKt: 15 } }).spoken,
    ).toBe(
      'Brightwater three twelve, wind zero seven zero at eight, gusts one fife, runway niner right, cleared for takeoff.',
    );
  });
});

describe('the crew checking in', () => {
  it('gives the altitude passing and the one cleared to, or level', () => {
    const climbing = phrase('checkIn', {
      facility: 'Philadelphia Departure',
      passingFt: 1240,
      altitudeFt: 10_000,
    });
    expect(climbing).toEqual({
      written: 'Philadelphia Departure, Brightwater 312, 1,200 climbing 10,000.',
      spoken:
        'Philadelphia Departure, Brightwater three twelve, one thousand two hundred climbing one zero thousand.',
    });
    expect(
      phrase('checkIn', { facility: 'Boston Approach', passingFt: 11_050, altitudeFt: 11_000 })
        .written,
    ).toBe('Boston Approach, Brightwater 312, level 11,000.');
    expect(
      phrase('checkIn', { facility: 'New York Center', passingFt: 35_000, altitudeFt: 35_000 })
        .spoken,
    ).toBe('New York Center, Brightwater three twelve, flight level tree fife zero.');
    expect(
      phrase('checkIn', { facility: 'Cleveland Center', passingFt: 30_000, altitudeFt: 11_000 })
        .written,
    ).toBe('Cleveland Center, Brightwater 312, FL300 descending 11,000.');
  });

  it('reports ready at the runway and established on the ILS', () => {
    expect(phrase('checkInReady', { facility: 'Philadelphia Tower', runway: '09R' }).spoken).toBe(
      'Philadelphia Tower, Brightwater three twelve, runway niner right, ready for departure.',
    );
    expect(phrase('checkInFinal', { facility: 'Kennedy Tower', runway: '04R' }).written).toBe(
      'Kennedy Tower, Brightwater 312, ILS runway 04R.',
    );
  });
});
