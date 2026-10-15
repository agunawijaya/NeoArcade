/**
 * What controllers and crews say, as data, and how to say it. Every phrase
 * renders twice: written, for the subtitles ("climb and maintain 3,000"),
 * and spoken, for the voice ("climb and maintain tree thousand"). Numbers
 * follow the U.S. controller's handbook (FAA Order JO 7110.65, chapter 2):
 * altitudes in thousands and hundreds, flight levels and headings digit by
 * digit, frequencies with "point", and "tree", "fife" and "niner" so that
 * nobody mishears a three, a five or a nine on a noisy radio.
 */
export const CALLSIGN = { written: 'Brightwater 312', spoken: 'Brightwater three twelve' } as const;

export interface Spoken {
  written: string;
  spoken: string;
}

const DIGITS = ['zero', 'one', 'two', 'tree', 'four', 'fife', 'six', 'seven', 'eight', 'niner'];

export function digits(value: string): string {
  return [...value]
    .filter((char) => /\d/.test(char))
    .map((char) => DIGITS[Number(char)] as string)
    .join(' ');
}

/** 3,000 → "tree thousand"; 11,000 → "one one thousand"; 2,500 → "two thousand fife hundred". */
export function altitude(feet: number): Spoken {
  const rounded = Math.round(feet / 100) * 100;
  if (rounded >= 18_000) {
    const level = String(Math.round(rounded / 100)).padStart(3, '0');
    return { written: `FL${level}`, spoken: `flight level ${digits(level)}` };
  }
  const thousands = Math.floor(rounded / 1000);
  const hundreds = (rounded % 1000) / 100;
  const parts: string[] = [];
  if (thousands > 0) parts.push(`${digits(String(thousands))} thousand`);
  if (hundreds > 0) parts.push(`${DIGITS[hundreds]} hundred`);
  return { written: rounded.toLocaleString('en-US'), spoken: parts.join(' ') || 'zero' };
}

/** 75 → "zero seven fife". */
export function heading(degrees: number): Spoken {
  let value = Math.round(degrees) % 360;
  if (value <= 0) value += 360;
  const text = String(value).padStart(3, '0');
  return { written: text, spoken: digits(text) };
}

/** 124.35 → "one two four point tree fife". */
export function frequency(megahertz: number): Spoken {
  const hundredths = Math.round(megahertz * 100);
  const text = (hundredths / 100).toFixed(hundredths % 10 === 0 ? 1 : 2);
  const [whole = '', part = ''] = text.split('.');
  return { written: text, spoken: `${digits(whole)} point ${digits(part)}` };
}

/** 29.92 → "two niner niner two". */
export function altimeter(inches: number): Spoken {
  const text = inches.toFixed(2);
  return { written: text, spoken: digits(text) };
}

/** "04R" → "runway four right", "22" → "runway two two". */
export function runwayName(ident: string): Spoken {
  const match = /^0?(\d{1,2})([LRC]?)$/.exec(ident);
  const number = match?.[1] ?? ident;
  const side = { L: ' left', R: ' right', C: ' center', '': '' }[match?.[2] ?? ''] ?? '';
  return { written: `runway ${ident}`, spoken: `runway ${digits(number)}${side}` };
}

/** The surface wind as a tower reads it. */
export function wind(direction: number, speedKt: number, gustKt = 0): Spoken {
  const speed = Math.round(speedKt);
  if (speed < 3) return { written: 'wind calm', spoken: 'wind calm' };
  const from = heading(Math.round(direction / 10) * 10);
  const gust = Math.round(gustKt) > speed + 3 ? Math.round(gustKt) : 0;
  return {
    written: `wind ${from.written} at ${speed}${gust ? `, gusts ${gust}` : ''}`,
    spoken: `wind ${from.spoken} at ${digits(String(speed))}${gust ? `, gusts ${digits(String(gust))}` : ''}`,
  };
}

export const squawk = (code: string): Spoken => ({
  written: `squawk ${code}`,
  spoken: `squawk ${digits(code)}`,
});

/** Joins pieces into one transmission. */
export function say(...pieces: (string | Spoken)[]): Spoken {
  const written = pieces
    .map((piece) => (typeof piece === 'string' ? piece : piece.written))
    .join('');
  const spoken = pieces.map((piece) => (typeof piece === 'string' ? piece : piece.spoken)).join('');
  return { written, spoken };
}

/** The controllers of a flight, and how each answers the radio. */
export type Controller =
  | 'clearance'
  | 'tower'
  | 'departure'
  | 'center'
  | 'approach'
  | 'arrivalTower'
  | 'firstOfficer'
  | 'captain';

/**
 * The transmissions of a flight. Each takes the values it needs and gives
 * the words, and the readback a crew owes for it, when it owes one.
 */
export interface PhraseValues {
  destination?: string;
  facility?: string;
  altitudeFt?: number;
  /** For a check-in: the altitude the flight is passing. */
  passingFt?: number;
  /** Which way a turn goes. */
  turn?: 'left' | 'right';
  heading?: number;
  frequency?: number;
  runway?: string;
  wind?: { direction: number; speedKt: number; gustKt: number };
  altimeter?: number;
  squawk?: string;
}

export type PhraseKey =
  | 'clearance'
  | 'programBrief'
  | 'contactTower'
  | 'takeoff'
  | 'contactDeparture'
  | 'radarContact'
  | 'contactCenter'
  | 'centerClimb'
  | 'descend'
  | 'contactApproach'
  | 'vector'
  | 'turn'
  | 'approachClearance'
  | 'contactArrivalTower'
  | 'landing'
  | 'goAround'
  | 'welcome'
  | 'sayAgain'
  | 'howDoYouRead'
  | 'correction'
  | 'checkIn'
  | 'checkInReady'
  | 'checkInFinal';

const sayFacility = (name = '') => ({ written: name, spoken: name });

export function phrase(key: PhraseKey, values: PhraseValues): Spoken {
  const v = values;
  const c = CALLSIGN;
  switch (key) {
    case 'clearance':
      return say(
        c,
        ', cleared to ',
        sayFacility(v.destination),
        ' as filed. Maintain heading ',
        heading(v.heading ?? 75),
        ' to ',
        altitude(3000),
        ', then proceed as filed. Departure frequency ',
        frequency(v.frequency ?? 124.35),
        ', ',
        squawk(v.squawk ?? '4612'),
        '.',
      );
    case 'programBrief':
      return say(
        c,
        ', cleared as filed. Surface winds variable, gusting to one fife. Minimum ceiling conditions are in effect. Sky conditions at two zero thousand scattered, at tree zero thousand broken.',
      );
    case 'contactTower':
      return say(
        c,
        ', contact ',
        sayFacility(v.facility),
        ' tower ',
        frequency(v.frequency ?? 118.5),
        '.',
      );
    case 'takeoff':
      return say(
        c,
        ', ',
        wind(v.wind?.direction ?? 0, v.wind?.speedKt ?? 0, v.wind?.gustKt ?? 0),
        ', ',
        runwayName(v.runway ?? '09R'),
        ', cleared for takeoff.',
      );
    case 'contactDeparture':
      return say(c, ', contact departure ', frequency(v.frequency ?? 124.35), '. Good day.');
    case 'radarContact':
      return say(
        c,
        ', ',
        sayFacility(v.facility),
        ' departure, radar contact. Climb and maintain ',
        altitude(v.altitudeFt ?? 10_000),
        '.',
      );
    case 'contactCenter':
      return say(
        c,
        ', contact ',
        sayFacility(v.facility),
        ' Center ',
        frequency(v.frequency ?? 128.5),
        '.',
      );
    case 'centerClimb':
      return say(
        c,
        ', ',
        sayFacility(v.facility),
        ' Center, climb and maintain ',
        altitude(v.altitudeFt ?? 35_000),
        '.',
      );
    case 'descend':
      return say(
        c,
        ', descend and maintain ',
        altitude(v.altitudeFt ?? 11_000),
        '. ',
        sayFacility(v.facility),
        ' altimeter ',
        altimeter(v.altimeter ?? 29.92),
        '.',
      );
    case 'contactApproach':
      return say(
        c,
        ', contact ',
        sayFacility(v.facility),
        ' Approach ',
        frequency(v.frequency ?? 120.6),
        '.',
      );
    case 'vector':
      return say(
        c,
        ', ',
        sayFacility(v.facility),
        ' Approach, fly heading ',
        heading(v.heading ?? 0),
        ', descend and maintain ',
        altitude(v.altitudeFt ?? 3000),
        ', vectors ILS ',
        runwayName(v.runway ?? ''),
        '.',
      );
    case 'turn':
      return say(c, ', turn ', v.turn ?? 'left', ' heading ', heading(v.heading ?? 0), '.');
    case 'approachClearance':
      return say(
        c,
        ', turn heading ',
        heading(v.heading ?? 0),
        ', maintain ',
        altitude(v.altitudeFt ?? 2000),
        ' until established on the localizer, cleared ILS ',
        runwayName(v.runway ?? ''),
        ' approach.',
      );
    case 'contactArrivalTower':
      return say(
        c,
        ', contact ',
        sayFacility(v.facility),
        ' tower ',
        frequency(v.frequency ?? 119.1),
        '.',
      );
    case 'landing':
      return say(
        c,
        ', ',
        wind(v.wind?.direction ?? 0, v.wind?.speedKt ?? 0, v.wind?.gustKt ?? 0),
        ', ',
        runwayName(v.runway ?? ''),
        ', cleared to land.',
      );
    case 'goAround':
      return say(
        c,
        ', go around. Fly runway heading, climb and maintain ',
        altitude(v.altitudeFt ?? 3000),
        '.',
      );
    case 'welcome':
      return say(c, ', welcome to ', sayFacility(v.destination), '. Turn off when able.');
    case 'sayAgain':
      return say(c, ', say again.');
    case 'howDoYouRead':
      return say(c, ', how do you read?');
    case 'correction':
      return say(c, ', negative.');
    case 'checkIn':
      return checkIn(v);
    case 'checkInReady':
      return say(
        sayFacility(v.facility),
        ', ',
        c,
        ', ',
        runwayName(v.runway ?? ''),
        ', ready for departure.',
      );
    case 'checkInFinal':
      return say(sayFacility(v.facility), ', ', c, ', ILS ', runwayName(v.runway ?? ''), '.');
  }
}

/** "Philadelphia Departure, Brightwater 312, 1,200 climbing 3,000." */
function checkIn(v: PhraseValues): Spoken {
  const passing = v.passingFt ?? 0;
  const target = v.altitudeFt ?? passing;
  const opening = say(sayFacility(v.facility), ', ', CALLSIGN, ', ');
  if (target - passing > 300)
    return say(opening, altitude(passing), ' climbing ', altitude(target), '.');
  if (passing - target > 300)
    return say(opening, altitude(passing), ' descending ', altitude(target), '.');
  return say(opening, target >= 18_000 ? '' : 'level ', altitude(target), '.');
}

/** What the crew reads back for a transmission, if anything: the numbers that matter, then the callsign. */
export function readbackFor(key: PhraseKey, values: PhraseValues): Spoken | null {
  const end = say(', ', CALLSIGN, '.');
  switch (key) {
    case 'clearance':
      return say(
        'Cleared as filed, heading ',
        heading(values.heading ?? 75),
        ', ',
        altitude(3000),
        ', ',
        squawk(values.squawk ?? '4612'),
        end,
      );
    case 'programBrief':
      return say('Cleared as filed', end);
    case 'takeoff':
      return say('Cleared for takeoff ', runwayName(values.runway ?? ''), end);
    case 'contactTower':
    case 'contactDeparture':
    case 'contactCenter':
    case 'contactApproach':
    case 'contactArrivalTower':
      return say(frequency(values.frequency ?? 0), end);
    case 'radarContact':
    case 'centerClimb':
      return say('Climb and maintain ', altitude(values.altitudeFt ?? 0), end);
    case 'descend':
      return say(
        'Descend and maintain ',
        altitude(values.altitudeFt ?? 0),
        ', ',
        altimeter(values.altimeter ?? 29.92),
        end,
      );
    case 'vector':
      return say(
        'Heading ',
        heading(values.heading ?? 0),
        ', down to ',
        altitude(values.altitudeFt ?? 0),
        end,
      );
    case 'turn':
      return say(
        values.turn === 'right' ? 'Right' : 'Left',
        ' heading ',
        heading(values.heading ?? 0),
        end,
      );
    case 'approachClearance':
      return say(
        'Heading ',
        heading(values.heading ?? 0),
        ', ',
        altitude(values.altitudeFt ?? 0),
        ' until established, cleared ILS ',
        runwayName(values.runway ?? ''),
        end,
      );
    case 'landing':
      return say('Cleared to land ', runwayName(values.runway ?? ''), end);
    case 'goAround':
      return say('Going around, runway heading, ', altitude(values.altitudeFt ?? 3000), end);
    default:
      return null;
  }
}
