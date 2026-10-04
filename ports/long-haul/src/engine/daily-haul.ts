import { HUB_IDS } from '../data/places';
import { CARGO, type CargoId } from './cargo';
import { contractPay, dueHoursFor, type Contract } from './contracts';
import { seasonOfMonth, type Season } from './living-weather';
import { shortestMiles } from './network';
import { streamFor } from './streams';

/**
 * The Daily Haul: one contract a day, the same for everyone. The load, the
 * hubs, the weather systems and every roll of the dice come from the day's
 * seed (`@shared/daily`), so two drivers who choose the same road and the
 * same speeds see the same trip. One scored run per day; profit is the score.
 */
export interface DailyHaul {
  contract: Contract;
  season: Season;
  seed: number;
}

/** A haul of a day or three: long enough to plan, short enough for a coffee break. */
const MIN_MILES = 700;
const MAX_MILES = 1900;

export function dailyHaul(seed: number, dateKey: string): DailyHaul {
  const rng = streamFor(seed, 'board', 'daily');
  const month = Number(dateKey.slice(5, 7)) - 1;
  const season = seasonOfMonth(month);
  let from = 'los-angeles';
  let to = 'new-york';
  for (let attempt = 0; attempt < 200; attempt++) {
    from = rng.pick(HUB_IDS);
    to = rng.pick(HUB_IDS);
    const miles = shortestMiles(from, to);
    if (from !== to && miles >= MIN_MILES && miles <= MAX_MILES) break;
  }
  const miles = shortestMiles(from, to);
  const cargo: CargoId = rng.pick(['oranges', 'freight', 'mail'] as const);
  const load = rng.int(30, 40) * 1000;
  const goods =
    cargo === 'mail' ? 'U.S. Mail' : cargo === 'oranges' ? 'oranges' : 'general freight';
  return {
    season,
    seed,
    contract: {
      id: `daily-${dateKey}`,
      from,
      to,
      cargo,
      goods,
      load,
      miles,
      payCents: contractPay(cargo, load, miles, null, 1),
      dueHours: dueHoursFor(miles, null),
      special: null,
      minReputation: 0,
    },
  };
}

export function cargoEmoji(cargo: CargoId): string {
  return cargo === 'oranges' ? '🍊' : cargo === 'mail' ? '✉️' : '📦';
}

export interface DailyResult {
  profitCents: number;
  hours: number;
  delivered: boolean;
  outcome: 'delivered' | 'crashed' | 'jailed';
  tickets: number;
  late: boolean;
}

/** A line to share: the day, the haul and how it went, never the road taken. */
export function dailyShareText(
  number: number,
  haul: DailyHaul,
  result: DailyResult,
  names: { from: string; to: string },
): string {
  const head = `Long Haul · Daily #${number} · ${names.from} → ${names.to} ${cargoEmoji(haul.contract.cargo)}`;
  if (result.outcome !== 'delivered') {
    return `${head}\n${result.outcome === 'crashed' ? '💥 Lost the rig' : '🚓 Licence revoked'} · ${CARGO[haul.contract.cargo].name}`;
  }
  const days = Math.floor(result.hours / 24);
  const hours = result.hours - days * 24;
  const money = `${result.profitCents < 0 ? '−' : ''}$${Math.abs(Math.round(result.profitCents / 100)).toLocaleString('en')}`;
  const road = `${days > 0 ? `${days} d ` : ''}${hours} h on the road`;
  const marks = `${result.late ? '⏰' : '✅'}${result.tickets > 0 ? ` 🚓×${result.tickets}` : ''}`;
  return `${head}\n${money} · ${road} · ${marks}`;
}
