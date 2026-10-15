import { describe, expect, it } from 'vitest';
import {
  describePosition,
  landingGrade,
  SEVERITY,
  writeReport,
  type Ending,
  type ReportFacts,
} from './outcome';

const BOSTON = 'runway 04R at Boston Logan';

function facts(over: Partial<ReportFacts> = {}): ReportFacts {
  return {
    ending: 'landed',
    place: BOSTON,
    airspeedKt: 0,
    pitchDeg: 0,
    bankDeg: 0,
    sinkFpm: 0,
    heightFt: 0,
    headingMagnetic: 35,
    flapsDeg: 30,
    gearDown: true,
    touchdown: { along: 1073, across: 3, sinkFpm: 383, speedKt: 134, crabDeg: 3.3 },
    restingPlace: { along: 3791, across: 3 },
    flareHeightFt: null,
    pastEndFt: null,
    referenceSpeedKt: 132,
    flightMinutes: 6.4,
    fuelLb: 37_426,
    ...over,
  };
}

const value = (report: ReturnType<typeof writeReport>, label: string) =>
  report.numbers.find((line) => line.label === label)?.value;

describe('the flight report', () => {
  it('tells a landing in two lines, with the place said once, under the headline', () => {
    const report = writeReport(facts());
    expect(report.severity).toBe('success');
    expect(report.title).toBe('Flight report');
    expect(report.headline).toBe('Flight completed');
    expect(report.where).toBe(BOSTON);
    expect(report.story).toEqual([
      'Brightwater 312 is down and stopped.',
      'Firm touchdown at 383 fpm.',
    ]);
    expect(report.story.join(' ')).not.toContain(BOSTON);
  });

  it('lists the touchdown and where the aircraft came to rest', () => {
    const report = writeReport(facts());
    expect(value(report, 'Touchdown point')).toBe(
      '1,073 ft past the threshold, 3 ft right of the centreline',
    );
    expect(value(report, 'Touchdown speed')).toBe('134 kt (Vref 132 kt)');
    expect(value(report, 'Came to rest')).toBe(
      '3,791 ft past the threshold, 3 ft right of the centreline',
    );
    expect(value(report, 'Time flown')).toBe('6 min');
    expect(value(report, 'Fuel remaining')).toBe('37,426 lb');
  });

  it('gives the flight numbers instead when there was no touchdown', () => {
    const report = writeReport(
      facts({
        ending: 'flewIntoGround',
        touchdown: null,
        restingPlace: null,
        airspeedKt: 212,
        pitchDeg: -3,
        sinkFpm: 2400,
        headingMagnetic: 359.7,
      }),
    );
    expect(value(report, 'Touchdown')).toBeUndefined();
    expect(value(report, 'Airspeed')).toBe('212 kt');
    expect(value(report, 'Pitch')).toBe('−3.0°');
    expect(value(report, 'Vertical speed')).toBe('−2,400 fpm');
    expect(value(report, 'Heading')).toBe('360');
    expect(report.story[1]).toBe('At impact: 212 kt, pitch −3.0°, sinking at 2,400 fpm.');
  });

  it('files a hard landing as an incident, blaming a high flare when there was one', () => {
    const dropped = writeReport(facts({ ending: 'hardLanding', flareHeightFt: 80 }));
    expect(dropped.severity).toBe('incident');
    expect(dropped.title).toBe('Incident report');
    expect(dropped.story[0]).toBe(
      'The flare began far too high, at 80 ft, and the aircraft dropped onto the runway.',
    );
    const slammed = writeReport(
      facts({ ending: 'hardLanding', touchdown: { ...facts().touchdown!, sinkFpm: 940 } }),
    );
    expect(slammed.story[0]).toBe('The aircraft met the runway at 940 fpm.');
  });

  it('puts a takeoff without flaps into the marshes, and says why', () => {
    const report = writeReport(
      facts({ ending: 'marshes', touchdown: null, flapsDeg: 0, pastEndFt: 1200, place: 'KPHL' }),
    );
    expect(report.severity).toBe('accident');
    expect(report.title).toBe('Accident report');
    expect(report.story).toHaveLength(2);
    expect(report.story[0]).toContain('1,200 ft into the marshland');
    expect(
      writeReport(facts({ ending: 'marshes', flapsDeg: 10, pastEndFt: 1200 })).story,
    ).toHaveLength(1);
  });

  it('reports a belly landing and an overrun', () => {
    const belly = writeReport(facts({ ending: 'gearUp', gearDown: false }));
    expect(belly.severity).toBe('accident');
    expect(belly.story[0]).toContain('on its belly');
    expect(value(belly, 'Flaps and gear')).toBe('30°, gear up');
    const overrun = writeReport(facts({ ending: 'overrun', pastEndFt: 650 }));
    expect(overrun.severity).toBe('incident');
    expect(overrun.story[0]).toContain('came to rest 650 ft past the end of the runway');
  });

  it('has a headline, a story and advice for every ending', () => {
    for (const ending of Object.keys(SEVERITY) as Ending[]) {
      const report = writeReport(facts({ ending, pastEndFt: 500, flareHeightFt: 60 }));
      expect(report.headline.length).toBeGreaterThan(0);
      expect(report.story.length).toBeGreaterThan(0);
      expect(report.story.every((line) => line.length > 0)).toBe(true);
      expect(report.advice.length).toBeGreaterThan(0);
    }
  });
});

describe('the words for a landing', () => {
  it('grades a touchdown the way a training captain would', () => {
    expect(landingGrade(60)).toBe('A greaser');
    expect(landingGrade(100)).toBe('Smooth');
    expect(landingGrade(239)).toBe('Smooth');
    expect(landingGrade(240)).toBe('Firm');
    expect(landingGrade(400)).toBe('Heavy');
    expect(landingGrade(600)).toBe('Hard');
  });

  it('places a point past or short of the threshold, left, right or on the centreline', () => {
    expect(describePosition(1240, -18)).toBe(
      '1,240 ft past the threshold, 18 ft left of the centreline',
    );
    expect(describePosition(-300, 0.4)).toBe('300 ft short of the threshold, on the centreline');
    expect(describePosition(0, 5)).toBe('0 ft past the threshold, 5 ft right of the centreline');
  });
});
