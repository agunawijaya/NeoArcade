import type { ProgramEnding } from './program-model';

/**
 * How a flight ends, and the report it earns. The program printed a few
 * terse lines for each of its endings ("A CRASH HAS OCCURED …"); the port
 * keeps the endings and the spirit of those reports — what happened, where,
 * the numbers at that moment and what to do next time — in its own words.
 */
export type Ending =
  | ProgramEnding
  | 'climbOut'
  | 'rejectedTakeoff'
  | 'overrun'
  | 'impact'
  | 'ditched'
  | 'offRunway'
  | 'wingStrike';

export type Severity = 'success' | 'practice' | 'incident' | 'accident';

export const SEVERITY: Record<Ending, Severity> = {
  landed: 'success',
  climbOut: 'success',
  missedApproach: 'success',
  rejectedTakeoff: 'practice',
  tailStrike: 'incident',
  runwayLights: 'incident',
  trimSequence: 'incident',
  noFlare: 'incident',
  rolledOff: 'incident',
  hardLanding: 'incident',
  overrun: 'incident',
  nosedIn: 'accident',
  marshes: 'accident',
  flewIntoGround: 'accident',
  stallOnFinal: 'accident',
  flaredTooHigh: 'accident',
  gearUp: 'accident',
  missedRunway: 'accident',
  impact: 'accident',
  ditched: 'accident',
  offRunway: 'accident',
  wingStrike: 'accident',
};

export interface ReportLine {
  label: string;
  value: string;
}

export interface Report {
  ending: Ending;
  severity: Severity;
  title: string;
  headline: string;
  story: string[];
  where: string;
  numbers: ReportLine[];
  advice: string;
}

export interface ReportFacts {
  ending: Ending;
  /** "runway 04R at Boston Logan", or a place along the route. */
  place: string;
  airspeedKt: number;
  pitchDeg: number;
  bankDeg: number;
  sinkFpm: number;
  heightFt: number;
  headingMagnetic: number;
  flapsDeg: number;
  gearDown: boolean;
  /** For a touchdown: feet past the threshold (− short of it) and right of the centreline (− left). */
  touchdown: {
    along: number;
    across: number;
    sinkFpm: number;
    speedKt: number;
    crabDeg: number;
  } | null;
  /** Where the aircraft stopped: feet past the threshold and right of the centreline. */
  restingPlace: { along: number; across: number } | null;
  /** Height the flare began at, under the 1982 rules. */
  flareHeightFt: number | null;
  /** Feet past the far end of the runway, for an overrun. */
  pastEndFt: number | null;
  referenceSpeedKt: number;
  flightMinutes: number;
  fuelLb: number;
}

const feet = (value: number) => `${Math.round(Math.abs(value)).toLocaleString('en-US')} ft`;
const knots = (value: number) => `${Math.round(value)} kt`;
const degrees = (value: number) => `${value >= 0 ? '' : '−'}${Math.abs(value).toFixed(1)}°`;
const fpm = (value: number) =>
  `${Math.round(value) < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString('en-US')} fpm`;

/** "1,240 ft past the threshold, 18 ft left of the centreline." */
export function describePosition(along: number, across: number): string {
  const lengthwise =
    along >= 0 ? `${feet(along)} past the threshold` : `${feet(along)} short of the threshold`;
  const sideways =
    Math.abs(across) < 1
      ? 'on the centreline'
      : `${feet(across)} ${across > 0 ? 'right' : 'left'} of the centreline`;
  return `${lengthwise}, ${sideways}`;
}

/** The touchdown, graded the way a training captain would put it. */
export function landingGrade(sinkFpm: number): string {
  if (sinkFpm < 100) return 'A greaser';
  if (sinkFpm < 240) return 'Smooth';
  if (sinkFpm < 400) return 'Firm';
  if (sinkFpm < 600) return 'Heavy';
  return 'Hard';
}

const TEXT: Record<
  Ending,
  { headline: string; story: (facts: ReportFacts) => string[]; advice: string }
> = {
  landed: {
    headline: 'Flight completed',
    story: (facts) => [
      'Brightwater 312 is down and stopped.',
      facts.touchdown
        ? `${landingGrade(facts.touchdown.sinkFpm)} touchdown at ${fpm(facts.touchdown.sinkFpm)}.`
        : '',
    ],
    advice: 'Same again tomorrow: fly the numbers and the jumbo flies itself onto the runway.',
  },
  climbOut: {
    headline: 'Takeoff and climb-out completed',
    story: () => [
      'Off the ground cleanly, cleaned up on schedule and level at 3,000 ft with departure control.',
    ],
    advice:
      'Try the whole flight next: the clearance, the cruise and an ILS in the murk at the far end.',
  },
  missedApproach: {
    headline: 'Missed approach acknowledged',
    story: () => ['You called the missed approach and went around: by the book.'],
    advice: 'A go-around is always the right answer when the approach is not right.',
  },
  rejectedTakeoff: {
    headline: 'Takeoff rejected',
    story: () => ['The takeoff was abandoned and the aircraft brought to a stop on the runway.'],
    advice:
      'Below V1 a reject is the safe choice; above it, keep going and sort it out in the air.',
  },
  tailStrike: {
    headline: 'Tail strike on rotation',
    story: () => [
      'The tail scraped the runway: the nose came up too early, too far, or both.',
      'The rear fuselage is damaged and the aircraft is going nowhere today.',
    ],
    advice: 'Rotate at VR, smoothly, toward about 10° — and let the wing do the lifting.',
  },
  runwayLights: {
    headline: 'Off the side of the runway',
    story: () => [
      'The aircraft wandered off the edge of the runway and ran through the edge lights.',
    ],
    advice:
      'Keep the nose on the centreline with small, early rudder; the gusts always push the same way.',
  },
  marshes: {
    headline: 'Into the marshes',
    story: (facts) => [
      `The runway ran out before the wing would fly, and the jumbo rolled ${feet(facts.pastEndFt ?? 0)} into the marshland past its end.`,
      facts.flapsDeg < 1
        ? 'The flaps were never set: without them the wing could not make enough lift.'
        : '',
    ],
    advice: 'Flaps for takeoff, full power, and rotate as the speed comes through VR.',
  },
  trimSequence: {
    headline: 'Clean-up not completed',
    story: () => [
      'Passing 1,200 ft the aircraft was still dirty. The clean-up after takeoff, in order:',
      '1 — gear up.  2 — flaps up.  3 — reduce to climb thrust.',
    ],
    advice:
      'Positive climb, gear up; then the flaps; then the thrust. Each one waits for the one before.',
  },
  noFlare: {
    headline: 'Landed without a flare',
    story: () => [
      'The aircraft was flown onto the runway without a flare, against company procedures.',
      'Nobody was hurt and nothing was damaged, but the chief pilot would like a word.',
    ],
    advice: 'At about 30 ft, raise the nose a couple of degrees and close the thrust levers.',
  },
  rolledOff: {
    headline: 'Rolled off the runway',
    story: () => ['After touching down the aircraft left the runway. No damage, no injuries.'],
    advice: 'Reversers and brakes right after touchdown, and the rudder to hold the centreline.',
  },
  hardLanding: {
    headline: 'Hard landing',
    story: (facts) => [
      facts.flareHeightFt !== null
        ? `The flare began far too high, at ${feet(facts.flareHeightFt)}, and the aircraft dropped onto the runway.`
        : `The aircraft met the runway at ${fpm(facts.touchdown?.sinkFpm ?? facts.sinkFpm)}.`,
      'The landing gear is damaged; everyone left by the slides, unhurt.',
    ],
    advice: 'Hold the glidepath down to about 30 ft and flare gently from there.',
  },
  overrun: {
    headline: 'Ran off the end of the runway',
    story: (facts) => [
      `The aircraft could not stop in time and came to rest ${feet(facts.pastEndFt ?? 0)} past the end of the runway.`,
    ],
    advice:
      'Touch down in the first third, then reversers, spoilers and firm braking straight away.',
  },
  nosedIn: {
    headline: 'Flown into the runway nose first',
    story: () => [
      'The aircraft met the runway nose-low: the nose gear took the landing and collapsed.',
    ],
    advice: 'Never push the nose down near the ground; flare a little instead.',
  },
  flewIntoGround: {
    headline: 'Flight into terrain',
    story: (facts) => [
      'The aircraft flew into the ground.',
      `At impact: ${knots(facts.airspeedKt)}, pitch ${degrees(facts.pitchDeg)}, sinking at ${fpm(facts.sinkFpm)}.`,
    ],
    advice:
      'Watch the altimeter against the minimum altitude, and believe the ground proximity warning.',
  },
  stallOnFinal: {
    headline: 'Stall on final approach',
    story: (facts) => [
      `The aircraft stalled close to the ground${facts.flareHeightFt !== null ? `, at ${feet(facts.flareHeightFt)}` : ''}, and struck the runway nose-high.`,
      'The impact broke open the tail section.',
    ],
    advice:
      'Flare by a couple of degrees, not more: the jumbo’s tail is closer to the ground than you think.',
  },
  flaredTooHigh: {
    headline: 'Flared far too high',
    story: (facts) => [
      `The flare began at ${feet(facts.flareHeightFt ?? facts.heightFt)}; the aircraft ran out of speed and fell onto the runway.`,
      'The impact broke the fuselage.',
    ],
    advice: 'The flare starts at about 30 ft over the threshold, not at the top of the approach.',
  },
  gearUp: {
    headline: 'Landed with the gear up',
    story: () => [
      'The landing gear was never lowered: the aircraft slid down the runway on its belly.',
      'Moderate damage; everyone left by the slides, unhurt.',
    ],
    advice: 'Gear down with the glideslope coming alive, and three green lights before 1,000 ft.',
  },
  missedRunway: {
    headline: 'Touched down outside the runway',
    story: () => ['The aircraft landed off the concrete.'],
    advice: 'Hold the localizer to the threshold and look up for the approach lights at minimums.',
  },
  impact: {
    headline: 'Struck the runway',
    story: (facts) => [
      `The aircraft hit the runway at ${fpm(facts.touchdown?.sinkFpm ?? facts.sinkFpm)}, far beyond what the gear can take.`,
    ],
    advice: 'Stabilised by 1,000 ft, on the glideslope, on speed; anything else, go around.',
  },
  ditched: {
    headline: 'Ditched',
    story: () => ['The aircraft came down in the water.'],
    advice: 'Keep the fuel, the altitude and the ILS where they belong, and the water stays below.',
  },
  offRunway: {
    headline: 'Landed beside the runway',
    story: () => ['The aircraft touched down on open ground away from the runway.'],
    advice:
      'Hold the localizer to the threshold; if the runway is not where it should be at minimums, go around.',
  },
  wingStrike: {
    headline: 'Wing and engine strike',
    story: (facts) => [
      `The aircraft touched down banked ${degrees(Math.abs(facts.bankDeg))}: an outboard engine and the wingtip struck the runway.`,
    ],
    advice: 'Wings level for the touchdown; take out the crosswind with rudder in the flare.',
  },
};

const TITLES: Record<Severity, string> = {
  success: 'Flight report',
  practice: 'Flight report',
  incident: 'Incident report',
  accident: 'Accident report',
};

export function writeReport(facts: ReportFacts): Report {
  const text = TEXT[facts.ending];
  const severity = SEVERITY[facts.ending];
  const numbers: ReportLine[] = [];
  if (facts.touchdown) {
    numbers.push(
      { label: 'Touchdown', value: fpm(facts.touchdown.sinkFpm) },
      {
        label: 'Touchdown point',
        value: describePosition(facts.touchdown.along, facts.touchdown.across),
      },
      {
        label: 'Touchdown speed',
        value: `${knots(facts.touchdown.speedKt)} (Vref ${knots(facts.referenceSpeedKt)})`,
      },
      { label: 'Crab at touchdown', value: degrees(facts.touchdown.crabDeg) },
    );
  } else {
    numbers.push(
      { label: 'Airspeed', value: knots(facts.airspeedKt) },
      { label: 'Pitch', value: degrees(facts.pitchDeg) },
      { label: 'Bank', value: degrees(facts.bankDeg) },
      { label: 'Vertical speed', value: fpm(-facts.sinkFpm) },
      {
        label: 'Heading',
        value: String(Math.round(facts.headingMagnetic) % 360 || 360).padStart(3, '0'),
      },
    );
  }
  if (facts.restingPlace) {
    numbers.push({
      label: 'Came to rest',
      value: describePosition(facts.restingPlace.along, facts.restingPlace.across),
    });
  }
  numbers.push(
    {
      label: 'Flaps and gear',
      value: `${Math.round(facts.flapsDeg)}°, gear ${facts.gearDown ? 'down' : 'up'}`,
    },
    { label: 'Time flown', value: `${Math.floor(facts.flightMinutes)} min` },
    { label: 'Fuel remaining', value: `${Math.round(facts.fuelLb).toLocaleString('en-US')} lb` },
  );
  return {
    ending: facts.ending,
    severity,
    title: TITLES[severity],
    headline: text.headline,
    story: text.story(facts).filter(Boolean),
    where: facts.place,
    numbers,
    advice: text.advice,
  };
}
