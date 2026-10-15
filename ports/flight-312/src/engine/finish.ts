import { referenceSpeeds } from './aircraft';
import {
  destinationRunway,
  magneticHeading,
  placeName,
  type Flight,
  type FlightEvent,
} from './flight-state';
import { writeReport, type Ending, type ReportFacts } from './outcome';

/** The landing speed for the weight now: Vref with flaps 30. */
export const referenceSpeedNow = (flight: Flight) =>
  referenceSpeeds(flight.readout.weightLb, 10).vref;

/** The minimum-ceiling murk that makes a landing a breakout: 300 ft or lower. */
const BREAKOUT_CEILING_FT = 300;

/** Ends the flight with the report its ending earns. */
export function finish(
  flight: Flight,
  ending: Ending,
  events: FlightEvent[],
  detail: Partial<ReportFacts> = {},
) {
  if (flight.outcome) return;
  const r = flight.readout;
  const touchdown = flight.touchdown;
  const facts: ReportFacts = {
    ending,
    place: placeName(flight),
    airspeedKt: r.iasKt,
    pitchDeg: r.pitchDeg,
    bankDeg: r.bankDeg,
    sinkFpm: -r.verticalSpeedFpm,
    heightFt: r.heightFt,
    headingMagnetic: magneticHeading(flight),
    flapsDeg: r.flapsDeg,
    gearDown: r.gear > 0.99,
    touchdown: touchdown
      ? {
          along: touchdown.along,
          across: touchdown.across,
          sinkFpm: touchdown.sinkFpm,
          speedKt: touchdown.speedKt,
          crabDeg: touchdown.crabDeg,
        }
      : null,
    restingPlace: null,
    flareHeightFt: null,
    pastEndFt: null,
    referenceSpeedKt: referenceSpeedNow(flight),
    flightMinutes: flight.time / 60,
    fuelLb: r.fuelLb,
    ...detail,
  };
  const ceiling = flight.world.weather.destination.ceilingFt;
  const onDestination =
    touchdown !== null && touchdown.runway.airport === destinationRunway(flight).airport;
  flight.outcome = {
    ending,
    report: writeReport(facts),
    level: flight.setup.level,
    mode: flight.setup.mode,
    destination: flight.setup.destination,
    time: flight.time,
    touchdown,
    violations: flight.procedures.violations,
    readbacks: { missed: flight.atc.missedReadbacks, wrong: flight.atc.wrongReadbacks },
    breakout:
      ending === 'landed' && onDestination && ceiling !== null && ceiling <= BREAKOUT_CEILING_FT,
    fullFlight: flight.setup.mode === 'flight' && ending === 'landed' && onDestination,
    properGoArounds: flight.approach.properGoArounds,
  };
  events.push({ kind: 'ending', outcome: flight.outcome });
}
