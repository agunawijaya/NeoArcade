import { gatePassed, type GateCheck } from './approach-log';
import type { Flight } from './flight-state';

/**
 * A landing in points, the way a check captain would mark it: stabilised
 * at 1,000 and 500 ft, a touchdown that is firm but kind, in the
 * touchdown zone, on the centreline, after a flare that took the sink out.
 * A thousand points for the perfect one; the stars follow from the points.
 * The Daily Approach and the challenge links are scored with it.
 */
export interface LandingScore {
  points: number;
  stars: 0 | 1 | 2 | 3;
  landed: boolean;
  parts: { label: string; points: number; of: number }[];
}

const STABLE_POINTS = 150;
const RATE_POINTS = 250;
const POINT_POINTS = 250;
const CENTRELINE_POINTS = 150;
const FLARE_POINTS = 50;
const GO_AROUND_PENALTY = 50;

/** The touchdown zone's sweet spot, feet past the threshold: around the aiming point. */
const ZONE_FROM_FT = 750;
const ZONE_TO_FT = 1750;
const ZONE_EDGE_FT = 3000;

const linear = (value: number, full: number, none: number) =>
  Math.max(0, Math.min(1, (none - value) / (none - full)));

function gatePoints(gate: GateCheck | null): number {
  if (!gate) return 0;
  if (gatePassed(gate)) return STABLE_POINTS;
  const met = [gate.configured, gate.onSpeed, gate.sinkOk, gate.onLocalizer, gate.onGlideslope];
  return Math.round((STABLE_POINTS * met.filter(Boolean).length) / met.length / 2);
}

function zonePoints(along: number): number {
  if (along < 0) return 0;
  if (along < ZONE_FROM_FT) return Math.round(POINT_POINTS * (along / ZONE_FROM_FT));
  if (along <= ZONE_TO_FT) return POINT_POINTS;
  return Math.round(POINT_POINTS * linear(along, ZONE_TO_FT, ZONE_EDGE_FT));
}

export function scoreLanding(flight: Flight): LandingScore {
  const outcome = flight.outcome;
  const touchdown = flight.touchdown;
  const onDestination =
    touchdown !== null && touchdown.runway.airport === flight.world.ils.runway.airport;
  const landed =
    outcome !== null &&
    (outcome.ending === 'landed' || outcome.ending === 'hardLanding') &&
    onDestination;
  if (!landed || !touchdown) return { points: 0, stars: 0, landed: false, parts: [] };
  const log = flight.approachLog;
  const flare =
    log.sinkAt50Fpm !== null && log.sinkAt50Fpm > 0
      ? Math.round(FLARE_POINTS * linear(touchdown.sinkFpm / log.sinkAt50Fpm, 0.45, 1))
      : Math.round(FLARE_POINTS / 2);
  const parts = [
    { label: 'Stable at 1,000 ft', points: gatePoints(log.gate1000), of: STABLE_POINTS },
    { label: 'Stable at 500 ft', points: gatePoints(log.gate500), of: STABLE_POINTS },
    {
      label: 'Touchdown rate',
      points: Math.round(RATE_POINTS * linear(touchdown.sinkFpm, 240, 650)),
      of: RATE_POINTS,
    },
    { label: 'Touchdown zone', points: zonePoints(touchdown.along), of: POINT_POINTS },
    {
      label: 'Centreline',
      points: Math.round(CENTRELINE_POINTS * linear(Math.abs(touchdown.across), 6, 60)),
      of: CENTRELINE_POINTS,
    },
    { label: 'Flare', points: flare, of: FLARE_POINTS },
  ];
  const penalty = log.goArounds * GO_AROUND_PENALTY;
  const points = Math.max(0, parts.reduce((sum, part) => sum + part.points, 0) - penalty);
  if (penalty > 0) parts.push({ label: `Go-arounds (${log.goArounds})`, points: -penalty, of: 0 });
  const hard = outcome?.ending === 'hardLanding';
  const stars = hard ? 1 : points >= 850 ? 3 : points >= 650 ? 2 : 1;
  return { points, stars, landed: true, parts };
}

/** ★★☆ */
export const starsText = (stars: number) => '★'.repeat(stars) + '☆'.repeat(3 - stars);
