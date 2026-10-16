import { ordinal } from '../engine/police';
import { RULES } from '../engine/rules';
import type { StopFacts } from './police-stop';

/**
 * What gets said at the window, and what the ticket says. Written for the
 * port in the game's own voice; the original only ever printed "Smokey is
 * behind you with his lights on. Pull over!", which the event card keeps.
 * Everything that varies (the trooper, the wording) is picked from a number
 * the session derives from the trip's seed and the hour, never from the
 * engine's dice.
 */
export interface StopLine {
  who: 'officer' | 'driver';
  text: string;
}

export interface Ticket {
  number: string;
  offence: number;
  method: 'Radar' | 'Patrol';
  speed: number;
  limit: number;
  overBy: number;
  /** What the radar read, when it was the radar. */
  reading: number | null;
  baseCents: number;
  perMphCents: number;
  /** The per-mile-an-hour part, times the miles an hour over. */
  overCents: number;
  detectorCents: number;
  totalCents: number;
  officer: string;
  badge: string;
  clock: string;
  court: string;
  waitHours: number;
  /** Shapes the trooper's signature. */
  signature: number;
}

const TROOPERS = [
  'Tpr. R. Dale',
  'Tpr. L. Okafor',
  'Tpr. J. Meeker',
  'Sgt. A. Ruiz',
  'Tpr. D. Whitlock',
  'Tpr. M. Haskins',
  'Tpr. C. Bergstrom',
] as const;

const pick = <T>(items: readonly T[], flavour: number, salt: number): T =>
  items[(flavour * 31 + salt * 17) % items.length] as T;

function greeting(facts: StopFacts): string {
  if (facts.hour < 5 || facts.hour >= 18) return 'Evening.';
  return facts.hour < 12 ? 'Morning.' : 'Afternoon.';
}

export function officerName(facts: StopFacts): string {
  return pick(TROOPERS, facts.flavour, 1);
}

/** The talk at the window, in order: the trooper, a word back from the driver, the trooper again. */
export function stopLines(facts: StopFacts): StopLine[] {
  const { event, speed, limit } = facts;
  const lines: StopLine[] = [];
  const caught =
    event.type === 'pulled-over' && event.byRadar && facts.reading !== null
      ? `Radar had you at ${Math.round(facts.reading)} in a ${limit}.`
      : `I paced you at ${speed} in a ${limit}.`;
  lines.push({
    who: 'officer',
    text: `${greeting(facts)} ${pick(['Licence and logbook, please.', 'Let me see that licence.', 'Logbook and licence, driver.'], facts.flavour, 2)}`,
  });
  lines.push({ who: 'officer', text: caught });
  lines.push({
    who: 'driver',
    text: pick(
      [
        'Trying to make the dock by Thursday, officer.',
        'Must have been the downhill.',
        'Yes, sir. Long night.',
        'The load won’t keep, officer.',
      ],
      facts.flavour,
      3,
    ),
  });
  if (event.type === 'jailed') {
    lines.push({
      who: 'officer',
      text: `That makes ${RULES.offencesToJail} on your record. Step down from the cab, please. You’re coming with me.`,
    });
    return lines;
  }
  if (event.detectorCents)
    lines.push({
      who: 'officer',
      text: 'And that box on your dash is against the law in this state. That’s extra.',
    });
  lines.push({
    who: 'officer',
    text:
      event.offence === 1
        ? `First one on your record. Follow me into ${facts.town}; the justice of the peace will see you.`
        : event.offence === RULES.offencesToJail - 1
          ? `That’s your ${ordinal(event.offence)}. One more and you’ll be riding the bus home.`
          : `Your ${ordinal(event.offence)} offence. The judge in ${facts.town} will want a word.`,
  });
  return lines;
}

/** Said as the ticket is handed through the window. */
export function handOverLine(facts: StopFacts): StopLine {
  return {
    who: 'officer',
    text: `Sign at the bottom. You’ll settle up with the judge in ${facts.town}.`,
  };
}

export function ticketFor(facts: StopFacts): Ticket | null {
  const { event } = facts;
  if (event.type !== 'pulled-over') return null;
  const detectorCents = event.detectorCents ?? 0;
  return {
    number: `No. ${String(10_000 + ((facts.flavour * 7919) % 89_999)).padStart(5, '0')}`,
    offence: event.offence,
    method: event.byRadar ? 'Radar' : 'Patrol',
    speed: facts.speed,
    limit: facts.limit,
    overBy: event.overBy,
    reading: facts.reading,
    baseCents: event.baseCents,
    perMphCents: event.perMphCents,
    overCents: event.cents - event.baseCents,
    detectorCents,
    totalCents: event.cents + detectorCents,
    officer: officerName(facts),
    badge: `#${100 + (facts.flavour % 900)}`,
    clock: facts.clock,
    court: `Justice of the peace, ${facts.town}`,
    waitHours: event.waitHours,
    signature: facts.flavour,
  };
}
