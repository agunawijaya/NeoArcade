import { startAfds } from './afds';
import { startApproachLog, stepApproachLog } from './approach-log';
import { JUMBO, loadFuel, referenceSpeeds } from './aircraft';
import { startInFlight, startOnRunway } from './airframe';
import { startAtc } from './atc';
import { tasFromCas, airAt } from './atmosphere';
import { RADIANS_PER_DEGREE, tan } from './exact-math';
import { checklistReady, type ChecklistId, type ChecklistView } from './checklists';
import { leverForN1 } from './engines';
import { finish, referenceSpeedNow } from './finish';
import {
  distanceFromDeparture,
  distanceToDestination,
  NO_INPUT,
  RESERVE_FUEL_LB,
  STEP_SECONDS,
  type AirStart,
  type Flight,
  type FlightEvent,
  type FlightInput,
  type FlightSetup,
  type HintId,
  type TimeOfDay,
} from './flight-state';
import { flyAirframe, takeoffSpeedsNow } from './fly-airframe';
import { flyProgram } from './fly-program';
import { skipPassedFixes, startFms } from './fms';
import { destination as alongBearing, type LatLon } from './geo';
import { toMagnetic, toTrue, variationAt } from './magnetic';
import { DEPARTURE, destinationById, STATIONS } from './navdata';
import { flapLeverDegrees, setFlapDegrees, setLevers, startPanel, type Panel } from './panel';
import { facilitiesFor, planFlight, type Facilities, type FlightPlan } from './plan';
import { startProcedures, stepProcedures } from './procedures';
import { programGate, startProgram, type ProgramState } from './program-model';
import { ilsFor, NO_READING, readMarker, readNav, readRadarAltitude } from './radios';
import { atcContextFor, stepRadio } from './radio-calls';
import { PROGRAM_LEVERS, readAirframe, readProgram, startProgramLook } from './readout';
import { onRunway, runway, runwayPoint, type Runway } from './runways';
import type { Terrain } from './terrain';
import { FEET_PER_NM } from './units';
import { startWarnings, stepWarnings } from './warnings';
import { generateWeather, nearestField, PROGRAM_SEED } from './weather';
import { createWorld, groundAt, type FlightWorld } from './world';

export * from './flight-state';

/** 07:59 on the morning of the flight, a minute before the takeoff clearance; the takeoff practice starts later. */
const CLOCK_AT_START = { flight: 7 * 3600 + 59 * 60, takeoff: 7 * 3600 + 59 * 60 + 40 } as const;
const PRACTICE_CLOCK: Record<TimeOfDay, number> = {
  morning: 9 * 3600 + 20 * 60,
  dusk: 17 * 3600 + 35 * 60,
  night: 20 * 3600 + 15 * 60,
};

/** The program's load: 200,000 lb of fuel. */
const PROGRAM_FUEL_LB = 200_000;
const TAKEOFF_PRACTICE_FUEL_LB = 120_000;
const APPROACH_PRACTICE_FUEL_LB = 40_000;
/** The approach practice starts this far out, and this far to the right of the centreline. */
const PRACTICE_OUT_NM = 15;
const PRACTICE_OFFSET_NM = 2.5;
const PRACTICE_SPEED_KT = 180;

export function createFlight(setup: FlightSetup, terrain: Terrain): Flight {
  const rules = setup.level === 'rules1982' ? 'program' : 'real';
  const destination = destinationById(setup.destination);
  const departure = runway(DEPARTURE.airport, DEPARTURE.runway, rules === 'program');
  const arrival = ilsFor(destination, rules).runway;
  const practiceWind = setup.mode === 'approach' ? setup.wind : undefined;
  const weather = generateWeather({
    seed: rules === 'program' && setup.programSky ? PROGRAM_SEED : setup.seed,
    style: rules === 'program' ? 'program' : 'realistic',
    departure: { position: departure.threshold, elevationFt: departure.elevationFt },
    destination: { position: arrival.threshold, elevationFt: arrival.elevationFt },
    destinationSky: setup.mode === 'approach' ? setup.sky : undefined,
    destinationWind: practiceWind && {
      ...practiceWind,
      direction: toTrue(practiceWind.direction, variationAt(arrival.threshold)),
    },
  });
  const world = createWorld(rules, terrain, weather, departure, destination);
  const plan = planFlight(departure.threshold, destination, weather);
  const facilities = facilitiesFor(destination.id);
  const fuelLb = startingFuel(setup, plan.blockFuelLb);
  const speeds = referenceSpeeds(JUMBO.emptyWeightLb + JUMBO.payloadLb + fuelLb, 10);
  const departureHeading =
    rules === 'program'
      ? 75
      : Math.round(toMagnetic(departure.headingTrue, variationAt(departure.threshold)));
  const atcContext = atcContextFor(setup, world, facilities, plan, departureHeading);
  const deck = rules === 'program' ? 'classic' : (setup.deck ?? 'classic');
  const start = setup.start
    ? startInAir(world, facilities, setup.start, fuelLb)
    : setup.mode === 'approach'
      ? startOnApproach(world, facilities, fuelLb)
      : startAtPhiladelphia(setup, world, facilities, plan, fuelLb, departureHeading, speeds.v2);
  const procedures = startProcedures();
  if (setup.mode === 'approach' || setup.start) {
    // The crew briefed the approach before the practice begins.
    procedures.completed = { beforeTakeoff: 0, afterTakeoff: 0, approach: 0, landing: null };
  }

  const flight: Flight = {
    setup,
    rules,
    deck,
    world,
    plan,
    facilities,
    speeds,
    time: 0,
    clockStart:
      setup.mode === 'approach'
        ? PRACTICE_CLOCK[setup.timeOfDay ?? 'morning']
        : CLOCK_AT_START[setup.mode],
    ...start,
    fms:
      deck === 'glass'
        ? startFms(
            setup.mode === 'flight' && !setup.start
              ? plan.legs.map((leg) => leg.station.index)
              : [],
            setup.mode === 'flight' && !setup.start ? runwayEnd(departure) : start.readout.position,
          )
        : null,
    director: null,
    pitchPresses: 0,
    controls: { elevator: 0, aileron: 0, rudder: 0 },
    nav: [NO_READING, NO_READING],
    marker: null,
    radioAltitudeFt: null,
    atc: startAtc(atcContext),
    atcContext,
    warnings: startWarnings(),
    procedures,
    approach: {
      active: setup.mode === 'approach' && (!setup.start || setup.start.place.kind === 'final'),
      lowestFt: Infinity,
      goingAround: false,
      properGoArounds: 0,
    },
    approachLog: startApproachLog(),
    hintsGiven: [],
    brakesReleasedAt: null,
    liftoffAt: null,
    maxRollSpeedKt: 0,
    touchdown: null,
    outcome: null,
    track: [],
  };
  readRadios(flight);
  if (flight.fms && (setup.mode !== 'flight' || setup.start))
    skipPassedFixes(flight.fms, world, flight.readout.position);
  return flight;
}

function startingFuel(setup: FlightSetup, blockFuelLb: number): number {
  if (setup.start) return setup.start.fuelLb ?? APPROACH_PRACTICE_FUEL_LB;
  if (setup.level === 'rules1982' && setup.mode !== 'approach') return PROGRAM_FUEL_LB;
  if (setup.mode === 'approach') return APPROACH_PRACTICE_FUEL_LB;
  if (setup.mode === 'takeoff') return setup.fuelLb ?? TAKEOFF_PRACTICE_FUEL_LB;
  return setup.fuelLb ?? blockFuelLb;
}

/** Where a flight begins: the cockpit as set, the autopilot, and the model that flies it. */
type Start = Pick<
  Flight,
  'panel' | 'afds' | 'program' | 'programLook' | 'programGate' | 'airframe' | 'readout'
>;

/** Lined up on 09R at Philadelphia, parking brake set, engines idling, the clearance a moment away. */
function startAtPhiladelphia(
  setup: FlightSetup,
  world: FlightWorld,
  facilities: Facilities,
  plan: FlightPlan,
  fuelLb: number,
  departureHeading: number,
  v2: number,
): Start {
  const departure = world.departure;
  const program = world.style === 'program';
  const [first, second = first] = plan.legs;
  // The program flew true courses; the real levels set the magnetic ones.
  const course = (leg: typeof first) => Math.round((program ? leg?.courseTrue : leg?.course) ?? 0);
  const panel = startPanel({
    comm: setup.mode === 'takeoff' ? facilities.tower : facilities.clearance,
    commStandby: setup.mode === 'takeoff' ? facilities.departure : facilities.tower,
    altimeterInHg: setup.level === 'captain' ? 29.92 : world.weather.departure.qnh,
    headingBug: departureHeading,
    speedBugKt: v2,
    nav: [
      { frequency: first?.station.frequency ?? 112.8, course: course(first) },
      { frequency: second?.station.frequency ?? 113.8, course: course(second) },
    ],
  });
  if (program) {
    const state = startProgram(departure, fuelLb);
    const look = startProgramLook();
    return {
      panel,
      afds: { ...startAfds(), flightDirector: false },
      program: state,
      programLook: look,
      programGate: programGate(world.destination, world.ils),
      airframe: null,
      readout: readProgram(state, look, departure.elevationFt, 0),
    };
  }
  if (setup.level === 'arcade') setFlapDegrees(panel, 10);
  const aircraft = startOnRunway(
    departure.start,
    departure.elevationFt,
    departure.headingTrue,
    loadFuel(fuelLb),
  );
  aircraft.flaps = flapLeverDegrees(panel);
  return {
    panel,
    afds: {
      ...startAfds(),
      rollMode: 'heading',
      pitchMode: 'takeoff',
      altitude: 3000,
      speedKt: v2 + 10,
    },
    program: null,
    programLook: null,
    programGate: null,
    airframe: aircraft,
    readout: readAirframe(aircraft, departure.elevationFt),
  };
}

/** Fifteen miles out on a 30° intercept to the localizer, the autopilot holding the altitude. */
function startOnApproach(world: FlightWorld, facilities: Facilities, fuelLb: number): Start {
  const strip = world.ils.runway;
  const destination = world.destination;
  const station = STATIONS[destination.station];
  const variation = variationAt(strip.threshold);
  const altitudeFt = destination.interceptAltitudeFt;
  const courseMagnetic = Math.round(toMagnetic(strip.headingTrue, variation));
  const radios = {
    comm: facilities.approach,
    commStandby: facilities.arrivalTower,
    altimeterInHg: world.weather.destination.qnh,
    parkingBrake: false,
  };

  if (world.style === 'program') {
    // The program's own approach: on the centreline, flaps and gear down, the destination's VOR tuned.
    const position = runwayPoint(strip, -PRACTICE_OUT_NM * FEET_PER_NM, 0);
    const state: ProgramState = {
      ...startProgram(world.departure, fuelLb),
      phase: 'cruise',
      position,
      altitudeFt,
      heading: strip.headingTrue,
      thrustIndex: 5,
      flapsDown: true,
      gearDown: true,
      flapsSetForTakeoff: true,
      airspeedKt: 120,
      fieldElevationFt: strip.elevationFt,
    };
    const look = { ...startProgramLook(), flapsDeg: 25 };
    const panel = startPanel({
      ...radios,
      flapLever: 1,
      headingBug: courseMagnetic,
      nav: [
        {
          frequency: station?.frequency ?? 112.8,
          course: Math.round(destination.program.landingCourse),
        },
        {
          frequency: station?.frequency ?? 112.8,
          course: Math.round(destination.program.markerRadial),
        },
      ],
    });
    setLevers(panel, PROGRAM_LEVERS[4]);
    return {
      panel,
      afds: { ...startAfds(), flightDirector: false },
      program: state,
      programLook: look,
      programGate: programGate(destination, world.ils),
      airframe: null,
      readout: readProgram(state, look, groundAt(world, position), 0),
    };
  }

  const position = runwayPoint(
    strip,
    -PRACTICE_OUT_NM * FEET_PER_NM,
    PRACTICE_OFFSET_NM * FEET_PER_NM,
  );
  const headingTrue = strip.headingTrue - 30;
  const tas = tasFromCas(PRACTICE_SPEED_KT, airAt(altitudeFt));
  const aircraft = startInFlight(
    position,
    altitudeFt,
    headingTrue,
    tas,
    loadFuel(fuelLb),
    10,
    false,
  );
  const lever = leverForN1(aircraft.engines[0]?.n1 ?? 60);
  const panel = startPanel({
    ...radios,
    gearDown: false,
    headingBug: Math.round(toMagnetic(headingTrue, variation)),
    speedBugKt: referenceSpeeds(aircraft.weightLb, 10).vref,
    nav: [
      { frequency: destination.localizer, course: courseMagnetic },
      { frequency: station?.frequency ?? 112.8, course: courseMagnetic },
    ],
  });
  setFlapDegrees(panel, 10);
  setLevers(panel, lever);
  return {
    panel,
    afds: {
      ...startAfds(),
      autopilot: true,
      autothrottle: true,
      rollMode: 'heading',
      pitchMode: 'altitudeHold',
      altitude: altitudeFt,
      speedKt: PRACTICE_SPEED_KT,
      leverTrim: lever,
    },
    program: null,
    programLook: null,
    programGate: null,
    airframe: aircraft,
    readout: readAirframe(aircraft, groundAt(world, position)),
  };
}

/** The far end of a runway, where the route's first leg begins. */
const runwayEnd = (strip: Runway): LatLon => runwayPoint(strip, strip.landingLengthFt, 0);

/**
 * A lesson's start in the air: on a station's radial at a distance, or on
 * the destination's final, trimmed for level flight at the speed asked
 * for, the radios on the station or the localizer, the autopilot holding
 * the heading and altitude if the lesson wants it.
 */
function startInAir(
  world: FlightWorld,
  facilities: Facilities,
  start: AirStart,
  fuelLb: number,
): Start {
  const strip = world.ils.runway;
  const destination = world.destination;
  const landingCourse = Math.round(toMagnetic(strip.headingTrue, variationAt(strip.threshold)));
  let position: LatLon;
  let altitudeFt: number;
  let nav1: { frequency: number; course: number };
  let pathDeg = 0;
  if (start.place.kind === 'final') {
    const outFt = start.place.outNm * FEET_PER_NM;
    position = runwayPoint(strip, -outFt, start.place.offsetNm * FEET_PER_NM);
    // On the glideslope unless the lesson says otherwise: three degrees up from the glide point.
    const onSlope =
      (outFt + world.ils.glidePointFt) * tan(world.ils.glideslopeDeg * RADIANS_PER_DEGREE);
    altitudeFt = strip.elevationFt + (start.altitudeFt ?? onSlope);
    if (start.altitudeFt === undefined) pathDeg = -world.ils.glideslopeDeg;
    nav1 = { frequency: destination.localizer, course: landingCourse };
  } else {
    const place = start.place;
    const station = STATIONS.find((candidate) => candidate.ident === place.station);
    if (!station) throw new Error(`A lesson starts on an unknown station, ${place.station}.`);
    position = alongBearing(station.position, toTrue(place.radial, station.variation), place.dmeNm);
    altitudeFt = start.altitudeFt ?? 5000;
    nav1 = { frequency: station.frequency, course: place.radial };
  }
  const heading = start.heading ?? landingCourse;
  const headingTrue = toTrue(heading, variationAt(position));
  const tas = tasFromCas(start.speedKt, airAt(altitudeFt));
  const aircraft = startInFlight(
    position,
    altitudeFt,
    headingTrue,
    tas,
    loadFuel(fuelLb),
    start.flaps,
    start.gearDown,
    pathDeg,
  );
  const lever = leverForN1(aircraft.engines[0]?.n1 ?? 60);
  const station = STATIONS[destination.station];
  const panel = startPanel({
    comm: facilities.approach,
    commStandby: facilities.arrivalTower,
    altimeterInHg: nearestField(world.weather, position)?.qnh ?? 29.92,
    parkingBrake: false,
    gearDown: start.gearDown,
    headingBug: Math.round(heading),
    speedBugKt: referenceSpeeds(aircraft.weightLb, 10).vref,
    nav: [nav1, { frequency: station?.frequency ?? 112.8, course: landingCourse }],
  });
  setFlapDegrees(panel, start.flaps);
  setLevers(panel, lever);
  return {
    panel,
    afds: {
      ...startAfds(),
      autopilot: start.autopilot,
      autothrottle: start.autopilot,
      rollMode: 'heading',
      pitchMode: 'altitudeHold',
      altitude: Math.round(altitudeFt / 100) * 100,
      speedKt: start.speedKt,
      leverTrim: lever,
    },
    program: null,
    programLook: null,
    programGate: null,
    airframe: aircraft,
    readout: readAirframe(aircraft, groundAt(world, position)),
  };
}

function readRadios(flight: Flight) {
  const r = flight.readout;
  const { style, ilsList, terrain, ils } = flight.world;
  flight.nav = [
    readNav(flight.panel.nav[0], r.position, r.altitudeFt, style, ilsList),
    readNav(flight.panel.nav[1], r.position, r.altitudeFt, style, ilsList),
  ];
  flight.marker = flight.program
    ? flight.program.markerLit
      ? 'outer'
      : null
    : readMarker(ils, r.position, r.altitudeFt);
  flight.radioAltitudeFt = readRadarAltitude(terrain, r.position, r.altitudeFt);
}

/** One fixed step of the whole flight. */
export function stepFlight(flight: Flight, input: FlightInput = NO_INPUT): FlightEvent[] {
  const events: FlightEvent[] = [];
  if (flight.outcome) return events;
  flight.time += STEP_SECONDS;
  flight.controls = { elevator: input.elevator, aileron: input.aileron, rudder: input.rudder };
  readRadios(flight);
  if (input.missedApproach && flight.airframe) pressGoAround(flight, events);
  if (flight.program) flyProgram(flight, input, events);
  else flyAirframe(flight, input, events);
  if (flight.outcome) return events;
  watchApproach(flight, events);
  stepApproachLog(
    flight.approachLog,
    flight,
    events.some((event) => event.kind === 'goAroundComplete'),
  );
  for (const callout of stepWarnings(flight.warnings, warningContext(flight), STEP_SECONDS)) {
    events.push({ kind: 'callout', callout });
  }
  if (flight.setup.level === 'captain') watchProcedures(flight, events);
  giveHints(flight, events);
  stepRadio(flight, events);
  if (flight.setup.mode === 'takeoff' && flight.airframe && takeoffPracticeDone(flight))
    finish(flight, 'climbOut', events);
  recordTrack(flight);
  return events;
}

const takeoffPracticeDone = (flight: Flight) =>
  flight.liftoffAt !== null && flight.readout.altitudeFt >= 2900 && !flight.panel.gearDown;

const maxLever = (panel: Panel) => Math.max(...panel.levers);
const glideslopeDots = (flight: Flight) =>
  flight.nav[0].glideslope === null ? null : flight.nav[0].glideslope / 0.35;
const localizerDots = (flight: Flight) =>
  flight.nav[0].kind === 'localizer'
    ? flight.nav[0].deviation / (flight.nav[0].fullScale / 2)
    : null;

function takeoffConfigured(flight: Flight): boolean {
  const panel = flight.panel;
  if (flight.program) return panel.flapLever >= 1 && !panel.parkingBrake;
  const flaps = flapLeverDegrees(panel);
  return flaps >= 10 && flaps <= 20 && panel.speedbrake === 'down' && !panel.parkingBrake;
}

function warningContext(flight: Flight) {
  return {
    time: flight.time,
    readout: flight.readout,
    radioFt: flight.radioAltitudeFt,
    gearLeverDown: flight.panel.gearDown,
    leversIdle: maxLever(flight.panel) < 0.05,
    takeoffConfigured: takeoffConfigured(flight),
    glideslopeDots: glideslopeDots(flight),
    approaching: flight.approach.active,
    vmoKt: JUMBO.vmoKt,
    mmo: JUMBO.mmo,
    lowFuelLb: RESERVE_FUEL_LB * 0.75,
  };
}

/** The TO/GA switches: go-around thrust and pitch, and the approach abandoned. */
function pressGoAround(flight: Flight, events: FlightEvent[]) {
  const r = flight.readout;
  if (r.onGround || flight.approach.goingAround) return;
  const afds = flight.afds;
  afds.pitchMode = 'takeoff';
  afds.speedKt = referenceSpeedNow(flight) + 25;
  afds.rollMode = 'heading';
  afds.armedGlideslope = false;
  afds.armedNavigation = false;
  flight.panel.headingBug = Math.round(toMagnetic(r.headingTrue, variationAt(r.position)));
  if (afds.autothrottle) {
    afds.autothrottle = false;
    setLevers(flight.panel, 0.95);
  }
  if (flight.approach.active) startGoAround(flight, events);
}

function startGoAround(flight: Flight, events: FlightEvent[]) {
  flight.approach.goingAround = true;
  events.push({ kind: 'goAround' });
}

/** When the flight is on its approach, and whether it is going around. */
function watchApproach(flight: Flight, events: FlightEvent[]) {
  const watch = flight.approach;
  const r = flight.readout;
  if (!watch.active) {
    const leftHome =
      distanceFromDeparture(flight) > 25 ||
      (flight.liftoffAt !== null && flight.time - flight.liftoffAt > 600);
    watch.active = !r.onGround && leftHome && distanceToDestination(flight) < 35;
  }
  if (!watch.active || flight.program) return;
  const strip = flight.world.ils.runway;
  const height = r.altitudeFt - strip.elevationFt;
  if (!r.onGround) watch.lowestFt = Math.min(watch.lowestFt, height);
  const climbingAway =
    watch.lowestFt < 1000 && height > watch.lowestFt + 300 && r.verticalSpeedFpm > 500;
  // Flown on past the runway without landing: that approach is over, whatever the crew meant.
  const overflown =
    height > 200 && height < 1000 && onRunway(strip, r.position).along > strip.landingLengthFt / 2;
  if (
    !watch.goingAround &&
    !r.onGround &&
    flight.touchdown === null &&
    (climbingAway || overflown)
  ) {
    startGoAround(flight, events);
  }
  if (watch.goingAround && height > 1500 && r.verticalSpeedFpm > 0) {
    const proper = flight.touchdown === null && watch.lowestFt < 1000;
    if (proper) watch.properGoArounds++;
    events.push({ kind: 'goAroundComplete', proper });
    watch.goingAround = false;
    watch.lowestFt = Infinity;
    flight.procedures.stableAtGate = null;
    flight.warnings.called = [];
  }
}

function watchProcedures(flight: Flight, events: FlightEvent[]) {
  const procedures = flight.procedures;
  const before = procedures.violations.length;
  const wasStable = procedures.stableAtGate;
  stepProcedures(procedures, {
    time: flight.time,
    readout: flight.readout,
    cleared: flight.atc.cleared,
    approaching: flight.approach.active,
    heightAboveFieldFt: flight.readout.altitudeFt - flight.world.ils.runway.elevationFt,
    toDestinationNm: distanceToDestination(flight),
    referenceSpeedKt: referenceSpeedNow(flight),
    localizerDots: localizerDots(flight),
    glideslopeDots: glideslopeDots(flight),
    goingAround: flight.approach.goingAround,
    cruiseAboveTenThousand: flight.setup.mode === 'flight' && flight.plan.cruiseAltitudeFt > 10_000,
  });
  for (const violation of procedures.violations.slice(before))
    events.push({ kind: 'violation', violation });
  if (wasStable === null && procedures.stableAtGate === false) events.push({ kind: 'unstable' });
}

/** Below the glideslope by less than this, its needle is coming off the stop. */
const GLIDESLOPE_ALIVE_DEG = 0.5;

/** Coaching for the moment, each said once a flight; the screen shows them at the levels that want them. */
function giveHints(flight: Flight, events: FlightEvent[]) {
  const r = flight.readout;
  const panel = flight.panel;
  const program = flight.program;
  const approaching = flight.approach.active;
  const radio = flight.radioAltitudeFt;
  const rolling = r.onGround && flight.touchdown === null && flight.brakesReleasedAt !== null;
  const airborneAfterTakeoff = !r.onGround && flight.liftoffAt !== null && !approaching;
  const rotateKt = program ? 150 : takeoffSpeedsNow(flight).vr;
  const hint = (id: HintId, condition: boolean) => {
    if (!condition || flight.hintsGiven.includes(id)) return;
    flight.hintsGiven.push(id);
    events.push({ kind: 'hint', hint: id });
  };
  hint(
    'releaseBrakes',
    flight.atc.cleared.takeoff && panel.parkingBrake && r.onGround && flight.touchdown === null,
  );
  hint(
    'setFlaps',
    flight.warnings.takeoffConfig ||
      (r.onGround && !approaching && maxLever(panel) > 0.5 && panel.flapLever === 0),
  );
  hint('rotate', rolling && r.iasKt >= rotateKt);
  hint(
    'gearUp',
    airborneAfterTakeoff && r.verticalSpeedFpm > 300 && r.heightFt > 100 && panel.gearDown,
  );
  hint(
    'climbThrust',
    airborneAfterTakeoff && r.heightFt > 1000 && maxLever(panel) > 0.95 && !panel.gearDown,
  );
  hint(
    'tuneComm',
    flight.atcContext.crew !== 'firstOfficer' &&
      flight.atc.handedTo !== null &&
      flight.time - flight.atc.handedAt > 20,
  );
  hint(
    'armApproach',
    !program &&
      flight.atc.cleared.approach &&
      flight.afds.autopilot &&
      flight.afds.rollMode !== 'localizer' &&
      !flight.afds.armedNavigation,
  );
  // "Alive" is the needle coming off its stop: within about a dot and a half below the slope.
  const slope = flight.nav[0].glideslope;
  const slopeAlive = slope !== null && slope > -GLIDESLOPE_ALIVE_DEG;
  hint(
    'gearDown',
    approaching && !panel.gearDown && ((radio !== null && radio < 1500) || slopeAlive),
  );
  hint('landingFlaps', approaching && slopeAlive && flapLeverDegrees(panel) < 25 && r.iasKt < 200);
  hint(
    'flare',
    approaching && radio !== null && radio < 50 && !r.onGround && flight.touchdown === null,
  );
  hint(
    'idle',
    approaching &&
      radio !== null &&
      radio < 25 &&
      maxLever(panel) > 0.1 &&
      !flight.approach.goingAround,
  );
  hint(
    'reverse',
    flight.touchdown !== null &&
      r.onGround &&
      r.iasKt > 60 &&
      panel.reverse.every((value) => value === 0),
  );
  hint('stall', flight.warnings.stall);
  hint('pullUp', flight.warnings.gpws === 'pullUp' || flight.warnings.gpws === 'terrain');
}

const TRACK_EVERY_SECONDS = 4;

function recordTrack(flight: Flight) {
  const last = flight.track.at(-1);
  if (last && flight.time - last.time < TRACK_EVERY_SECONDS) return;
  flight.track.push({
    time: flight.time,
    position: flight.readout.position,
    altitudeFt: flight.readout.altitudeFt,
  });
}

/**
 * How much faster than real time the flight may run: up to 16× in the
 * cruise, never within 2,000 ft of the ground, near the destination, while
 * the radio is busy or a warning sounds.
 */
export function allowedTimeScale(flight: Flight, requested: number): number {
  if (requested <= 1 || flight.outcome) return 1;
  const r = flight.readout;
  const warnings = flight.warnings;
  const radioBusy =
    flight.atc.pending !== null ||
    flight.atc.queue.length > 0 ||
    flight.time < flight.atc.busyUntil;
  const alarm = warnings.stall || warnings.overspeed || warnings.gpws !== null || warnings.gearHorn;
  if (r.onGround || r.heightFt < 2000 || flight.approach.active || radioBusy || alarm) return 1;
  return Math.min(Math.floor(requested), 16);
}

/** The view a checklist reads its items from. */
export function checklistView(flight: Flight): ChecklistView {
  const strip = flight.world.ils.runway;
  return {
    panel: flight.panel,
    readout: flight.readout,
    cleared: flight.atc.cleared,
    departureQnh: flight.world.weather.departure.qnh,
    arrivalQnh: flight.world.weather.destination.qnh,
    localizer: flight.world.destination.localizer,
    runwayCourse: Math.round(toMagnetic(strip.headingTrue, variationAt(strip.threshold))),
    referenceSpeedKt: referenceSpeedNow(flight),
    navTuned:
      STATIONS.some(
        (station) => Math.abs(station.frequency - flight.panel.nav[0].frequency) < 0.005,
      ) ||
      flight.world.ilsList.some(
        (ils) => Math.abs(ils.destination.localizer - flight.panel.nav[0].frequency) < 0.005,
      ),
  };
}

/** The crew calls a checklist complete: it counts only when every item is set. */
export function completeChecklist(flight: Flight, id: ChecklistId): boolean {
  if (flight.procedures.completed[id] !== null) return true;
  if (!checklistReady(id, checklistView(flight))) return false;
  flight.procedures.completed[id] = flight.time;
  return true;
}
