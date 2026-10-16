import { referenceSpeedNow } from './finish';
import type { Flight } from './flight-state';
import { ilsGeometry } from './radios';

/**
 * How the last approach of a flight was flown, kept at every level so a
 * landing can be scored: the stabilised-approach checks at 1,000 and
 * 500 ft, the worst excursions from the beams below 1,000 ft, and the sink
 * rate passing 50 ft for the flare. The beams are measured from the ILS's
 * own geometry, whatever the crew has tuned, so the 1982 Rules are judged
 * by the same yardstick. A go-around starts the log afresh: it is the
 * approach that ends in the landing that counts.
 */
export interface GateCheck {
  configured: boolean;
  onSpeed: boolean;
  sinkOk: boolean;
  onLocalizer: boolean;
  onGlideslope: boolean;
}

export interface ApproachLog {
  gate1000: GateCheck | null;
  gate500: GateCheck | null;
  /** Worst deviations from 1,000 ft down to 100 ft, in dots. */
  maxLocalizerDots: number;
  maxGlideslopeDots: number;
  sinkAt50Fpm: number | null;
  goArounds: number;
}

/** Dots of deflection: 1.25° of localizer, 0.35° of glideslope. */
const LOCALIZER_DOT_DEG = 1.25;
const GLIDESLOPE_DOT_DEG = 0.35;

export function startApproachLog(): ApproachLog {
  return {
    gate1000: null,
    gate500: null,
    maxLocalizerDots: 0,
    maxGlideslopeDots: 0,
    sinkAt50Fpm: null,
    goArounds: 0,
  };
}

export const gatePassed = (gate: GateCheck) =>
  gate.configured && gate.onSpeed && gate.sinkOk && gate.onLocalizer && gate.onGlideslope;

export function beamDots(flight: Flight): { localizer: number; glideslope: number } {
  const r = flight.readout;
  const ils = flight.world.ils;
  const geometry = ilsGeometry(ils, r.position, r.altitudeFt);
  return {
    localizer: geometry.localizerDeg / LOCALIZER_DOT_DEG,
    glideslope: (geometry.elevationDeg - ils.glideslopeDeg) / GLIDESLOPE_DOT_DEG,
  };
}

function checkGate(flight: Flight): GateCheck {
  const r = flight.readout;
  const dots = beamDots(flight);
  const vref = referenceSpeedNow(flight);
  return {
    configured: r.gear > 0.99 && r.flapsDeg >= 24,
    // The program's model flies its own approach speed, so the 1982 Rules are not held to Vref.
    onSpeed: flight.rules === 'program' || (r.iasKt >= vref - 5 && r.iasKt <= vref + 20),
    sinkOk: -r.verticalSpeedFpm <= 1000,
    onLocalizer: Math.abs(dots.localizer) <= 1,
    onGlideslope: Math.abs(dots.glideslope) <= 1,
  };
}

export function stepApproachLog(log: ApproachLog, flight: Flight, goAroundCompleted: boolean) {
  if (goAroundCompleted) {
    Object.assign(log, startApproachLog(), { goArounds: log.goArounds + 1 });
    return;
  }
  const r = flight.readout;
  if (!flight.approach.active || flight.approach.goingAround || r.onGround) return;
  if (flight.touchdown) return;
  const height = r.altitudeFt - flight.world.ils.runway.elevationFt;
  if (log.gate1000 === null && height < 1000) log.gate1000 = checkGate(flight);
  if (log.gate500 === null && height < 500) log.gate500 = checkGate(flight);
  if (height < 1000 && height > 100) {
    const dots = beamDots(flight);
    log.maxLocalizerDots = Math.max(log.maxLocalizerDots, Math.abs(dots.localizer));
    log.maxGlideslopeDots = Math.max(log.maxGlideslopeDots, Math.abs(dots.glideslope));
  }
  const radio = flight.radioAltitudeFt;
  if (log.sinkAt50Fpm === null && radio !== null && radio < 50)
    log.sinkAt50Fpm = Math.max(0, -r.verticalSpeedFpm);
}
