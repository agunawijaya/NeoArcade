import { CONDITIONS, FATIGUE } from '../engine/conditions';
import type { CrashCause, TripEvent } from '../engine/events';
import { ordinal } from '../engine/police';
import { RULES } from '../engine/rules';
import type { Units } from '../settings';
import { distance, money, speed } from '../ui/format';

/**
 * The words on each event card. Where the original had a line for the
 * moment it is kept, word for word, as the card's quote; the rest of the
 * card says plainly what it costs.
 */
export type EventArt =
  | 'police'
  | 'radar'
  | 'scale'
  | 'construction'
  | 'toll'
  | 'slide'
  | 'reefer'
  | 'blowout'
  | 'tow'
  | 'dry'
  | 'detour'
  | 'crash'
  | 'jail'
  | 'time-zone'
  | 'arrival'
  | 'warehouse';

export type Tone = 'bad' | 'good' | 'neutral';

export interface EventCopy {
  title: string;
  /** The original's words, when it had any. */
  quote?: string;
  lines: string[];
  /** Short consequences: "−$45.00", "+2 h". */
  costs: string[];
  art: EventArt;
  tone: Tone;
}

const CRASH_LINES: Readonly<Record<CrashCause, string>> = {
  asleep: 'You fell asleep at the wheel.',
  'snow-ditch': 'You drove off the road into a snow filled ditch.',
  pickup: 'You rear-ended a pick-up with no tail lights.',
  speed: 'Speed kills !',
  skid: 'You hit a slick spot and skidded off the road.',
  'drunk-driver': 'A drunk driver rammed your rig. Tough luck !',
};

const CRASH_TITLES: Readonly<Record<CrashCause, string>> = {
  asleep: 'Asleep at the wheel',
  'snow-ditch': 'Into the ditch',
  pickup: 'Out of the fog',
  speed: 'Too fast',
  skid: 'A slick spot',
  'drunk-driver': 'Rammed',
};

const hours = (count: number) => `+${count} h`;

/** The card for an event, or null when it needs none. */
export function copyFor(event: TripEvent, units: Units): EventCopy | null {
  switch (event.type) {
    case 'crash':
      return {
        title: CRASH_TITLES[event.cause],
        quote: `C R A S H !!  ${CRASH_LINES[event.cause]}`,
        lines: ['You lose your truck & profits.'],
        costs: [],
        art: 'crash',
        tone: 'bad',
      };
    case 'blowout':
      return event.spare
        ? {
            title: 'Blowout',
            quote: 'Your just blew a tire !!',
            lines: [
              `It took ${event.hours} hour${event.hours === 1 ? '' : 's'} to change the ${event.tyre ?? 'outside'} tire. The spare is on; there is no other.`,
            ],
            costs: [hours(event.hours)],
            art: 'blowout',
            tone: 'bad',
          }
        : {
            title: 'Blowout, and no spare',
            quote:
              'Since your spare has already been used, you have to call a tow truck from town to deliver a new tire for you.',
            lines: ['This service cost $400.00 and took 4 hours.'],
            costs: [money(-event.cents), hours(event.hours)],
            art: 'tow',
            tone: 'bad',
          };
    case 'pulled-over':
      return {
        title: event.byRadar ? 'Caught on radar' : 'Pulled over',
        quote: event.byRadar ? undefined : 'Smokey is behind you with his lights on.  Pull over!',
        lines: [
          `See the justice of the peace for your ${ordinal(event.offence)} offense. Wait ${event.waitHours} hour${event.waitHours === 1 ? '' : 's'} for your hearing.`,
          `The fine is ${money(event.baseCents)} plus ${money(event.perMphCents)} for each mph over the limit (${event.overBy} over).`,
          ...(event.detectorCents
            ? [
                `And the radar detector on your dash is illegal here: ${money(event.detectorCents)}.`,
              ]
            : []),
          event.offence === RULES.offencesToJail - 1
            ? 'One more and the judge takes your licence.'
            : `${RULES.offencesToJail - event.offence} more offences and you lose your licence.`,
        ],
        costs: [money(-(event.cents + (event.detectorCents ?? 0))), hours(event.waitHours)],
        art: 'police',
        tone: 'bad',
      };
    case 'jailed':
      return {
        title: 'Thirty days',
        quote: 'You are sentenced to 30 days in jail for reckless driving.',
        lines: ["Your I.C.C. driver's license is revoked !"],
        costs: [],
        art: 'jail',
        tone: 'bad',
      };
    case 'out-of-fuel':
      return {
        title: 'Out of diesel',
        quote: event.parked
          ? 'You ran out of gas while waiting.'
          : `After ${event.lastMiles.toFixed(1)} more miles, you ran out of fuel  (DUMMY !!)`,
        lines: [
          'It cost $200 to get a barrel of diesel delivered.',
          `You also wasted ${event.hours} hour${event.hours === 1 ? '' : 's'} by your carelessness.`,
          ...(event.damage > 0 ? ['Sitting with the refer unit off is damaging the oranges.'] : []),
        ],
        costs: [
          money(-event.cents),
          hours(event.hours),
          ...(event.damage > 0 ? [`−${event.damage * 5} % oranges`] : []),
        ],
        art: 'dry',
        tone: 'bad',
      };
    case 'time-zone':
      return {
        title: 'New time zone',
        quote: event.hours > 0 ? 'Time zone changes -- set clock ahead one hour.' : undefined,
        lines: [
          event.hours > 0
            ? 'The clock jumps an hour ahead.'
            : 'Set the clock back an hour: going west, the day gets longer.',
        ],
        costs: [event.hours > 0 ? '+1 h on the clock' : '−1 h on the clock'],
        art: 'time-zone',
        tone: 'neutral',
      };
    case 'toll':
      return {
        title: 'Toll',
        quote: `STOP!   Pay toll of ${money(event.cents)}`,
        lines: [],
        costs: [money(-event.cents)],
        art: 'toll',
        tone: 'neutral',
      };
    case 'construction':
      return {
        title: 'Road work',
        quote: 'Construction ahead !!  Slow down -- speed limit 35 MPH',
        lines: [
          `For the next hour the limit is ${speed(event.limit, units)}, and the rig will not do more than ${speed(Math.floor(event.limit * 1.5), units)}.`,
        ],
        costs: [],
        art: 'construction',
        tone: 'neutral',
      };
    case 'radar':
      return {
        title: event.ticketed ? 'Radar trap' : 'Radar',
        quote: `You were just clocked by radar at ${event.reading.toFixed(1)} MPH.`,
        lines: event.ticketed ? ['Lights in the mirror.'] : ['No ticket this time.'],
        costs: [],
        art: 'radar',
        tone: event.ticketed ? 'bad' : 'good',
      };
    case 'weigh-station':
      return {
        title: event.overBy > 0 ? 'Overweight' : 'Weigh station',
        quote: 'Weighing station open -- trucks must stop.',
        lines: [
          `Scale weighs truck with cargo, fuel & driver: ${event.pounds.toLocaleString('en-US')} pounds.`,
          event.overBy > 0
            ? `That is ${event.overBy.toLocaleString('en-US')} lb over the ${RULES.grossLimitPounds.toLocaleString('en-US')} lb limit: $200 plus ${event.centsPerPound}¢ a pound.`
            : "You're O.K.",
        ],
        costs: event.overBy > 0 ? [money(-event.cents)] : [],
        art: 'scale',
        tone: event.overBy > 0 ? 'bad' : 'good',
      };
    case 'barred':
      return {
        title: `Turned back from ${event.state}`,
        quote: `You are not allowed to enter ${event.state} with that load.`,
        lines: [
          `The scale read ${event.pounds.toLocaleString('en-US')} lb. Take a ${distance(event.detourMiles, units)} detour on ${event.via} with a ${speed(event.limit, units)} limit.`,
        ],
        costs: [`+${distance(event.detourMiles, units)}`],
        art: 'detour',
        tone: 'bad',
      };
    case 'rock-slide':
      return {
        title: 'Rock slide',
        quote: `A rock slide has blocked the ${event.where === 'Allegheny Mountain Tunnel' ? 'Allegheny Tunnel entrance' : `road at ${event.where}`}.`,
        lines: [
          `THE HIGHWAY DEPARTMENT WILL HAVE IT CLEARED IN ${event.hours} HOURS.`,
          event.sleep > 0
            ? `While waiting, you got ${event.sleep} hour${event.sleep === 1 ? '' : 's'} of sleep.`
            : 'No time for a nap.',
        ],
        costs: [hours(event.hours)],
        art: 'slide',
        tone: 'bad',
      };
    case 'reefer-failure':
      return {
        title: 'Reefer trouble',
        quote: 'The trailer refrigeration unit has failed endangering the cargo.',
        lines: [
          'Repairs take 2 hours and cost $100.00.',
          event.damage > 0
            ? `The oranges took ${event.damage * 5} % damage.`
            : 'The oranges stayed cold enough.',
        ],
        costs: [money(-event.cents), hours(event.hours)],
        art: 'reefer',
        tone: 'bad',
      };
    case 'reefer-idle':
      return {
        title: 'Warm oranges',
        quote: 'Sitting with the refer unit off is damaging the oranges.',
        lines: ['The reefer ran the tank dry while you slept.'],
        costs: event.damage > 0 ? [`−${event.damage * 5} % oranges`] : [],
        art: 'reefer',
        tone: 'bad',
      };
    case 'arrived':
      return {
        title: 'Arrived',
        lines: [],
        costs: [],
        art: 'arrival',
        tone: 'good',
      };
    case 'warehouse-closed':
      return {
        title: 'Warehouse closed',
        quote: 'The warehouse is closed for the night.  Come back tomorrow.',
        lines: [`The doors open at 6 AM: a ${event.waitHours}-hour wait.`],
        costs: [hours(event.waitHours)],
        art: 'warehouse',
        tone: 'neutral',
      };
    default:
      return null;
  }
}

/** A line for a change of conditions, for the HUD and the leg planner. */
export function conditionsLine(event: TripEvent): string | null {
  if (event.type === 'weather') return `Weather: ${CONDITIONS[event.to].name.toLowerCase()}`;
  if (event.type === 'fatigue') return `You feel ${FATIGUE[event.to].name.toLowerCase()}`;
  return null;
}
