import { describe, expect, it } from 'vitest';
import { angleDifference, normaliseDegrees, sinCosDegrees } from './exact-math';
import { advance } from './geo';
import { destinationById, DEPARTURE, STATIONS } from './navdata';
import {
  NO_PROGRAM_INPUT,
  programGate,
  startProgram,
  stepProgram,
  type ProgramContext,
  type ProgramEnding,
  type ProgramInput,
  type ProgramState,
} from './program-model';
import { ilsFor, ilsGeometry, readNav } from './radios';
import { onRunway, runway } from './runways';
import { generateWeather } from './weather';

const DT = 1 / 20;
const destination = destinationById('jfk');
const ils = ilsFor(destination, 'program');
const departureRunway = runway(DEPARTURE.airport, DEPARTURE.runway, true);
const station = STATIONS[destination.station] as (typeof STATIONS)[number];

function context(state: ProgramState, overrides: Partial<ProgramContext> = {}): ProgramContext {
  const weather = generateWeather({
    seed: 7,
    style: 'program',
    departure: { position: departureRunway.threshold, elevationFt: departureRunway.elevationFt },
    destination: { position: ils.runway.threshold, elevationFt: ils.runway.elevationFt },
  });
  return {
    weather: { ...weather, takeoffGustKt: 0, finalDriftKt: 0 },
    departure: departureRunway,
    destination,
    ils,
    gate: programGate(destination, ils),
    nav: readNav(
      { frequency: station.frequency, course: 0 },
      state.position,
      state.altitudeFt,
      'program',
      [ils],
    ),
    groundFt: 0,
    ...overrides,
  };
}

/** Steps the program with an input chosen afresh each step, until it ends or time runs out. */
function fly(
  state: ProgramState,
  pilot: (state: ProgramState, time: number) => Partial<ProgramInput>,
  seconds: number,
  overrides: Partial<ProgramContext> = {},
): ProgramEnding | null {
  let time = 0;
  while (time < seconds && state.phase !== 'ended') {
    stepProgram(
      state,
      { ...NO_PROGRAM_INPUT, ...pilot(state, time) },
      context(state, overrides),
      DT,
    );
    time += DT;
  }
  return state.ending;
}

/**
 * The program's pilot on the takeoff: flaps, brakes, full thrust, a press of
 * rudder whenever a gust swings the nose a degree off, one press of U at 150 kt.
 */
function takeoffPilot(rotateAt = 150, presses = 1) {
  let rotated = false;
  return (state: ProgramState): Partial<ProgramInput> => {
    const error = angleDifference(departureRunway.headingTrue, state.heading);
    const input: Partial<ProgramInput> = {
      flapsDown: true,
      releaseBrakes: true,
      thrustIndex: 1,
      gearDown: true,
      rudderSteps: state.airspeedKt > 50 && Math.abs(error) >= 1 ? Math.sign(error) : 0,
    };
    if (!rotated && state.airspeedKt >= rotateAt) {
      rotated = true;
      input.pitchSteps = presses;
    }
    return input;
  };
}

describe('the 1982 takeoff', () => {
  it('lifts off past 150 kt with flaps and one press of nose up, about 8,000 ft down the runway', () => {
    const state = startProgram(departureRunway);
    const pilot = takeoffPilot();
    let liftoff = null;
    for (let step = 0; step < 2400 && !liftoff; step++) {
      const events = stepProgram(
        state,
        { ...NO_PROGRAM_INPUT, ...pilot(state) },
        context(state),
        DT,
      );
      liftoff = events.find((event) => event.kind === 'liftoff') ?? null;
    }
    expect(liftoff).not.toBeNull();
    expect(state.airspeedKt).toBeGreaterThanOrEqual(150);
    expect(state.pitch).toBe(10);
    const rolled = onRunway(departureRunway, state.position).along;
    expect(rolled).toBeGreaterThan(7000);
    expect(rolled).toBeLessThan(9000);
  });

  it('strikes the tail when rotated too slow or too far', () => {
    expect(fly(startProgram(departureRunway), takeoffPilot(120), 120)).toBe('tailStrike');
    expect(fly(startProgram(departureRunway), takeoffPilot(155, 2), 120)).toBe('tailStrike');
  });

  it('rolls into the marshes without flaps', () => {
    const state = startProgram(departureRunway);
    const pilot = takeoffPilot();
    expect(fly(state, (s) => ({ ...pilot(s), flapsDown: false }), 200)).toBe('marshes');
  });

  it('hits the runway lights when nobody corrects the gusts', () => {
    const state = startProgram(departureRunway);
    const pilot = takeoffPilot(500);
    expect(fly(state, (s) => ({ ...pilot(s), rudderSteps: 0 }), 200)).toBe('runwayLights');
  });

  it('wants gear up, flaps up and climb thrust in that order before 1,200 ft', () => {
    const lazy = startProgram(departureRunway);
    expect(fly(lazy, takeoffPilot(), 200)).toBe('trimSequence');

    const tidy = startProgram(departureRunway);
    const pilot = takeoffPilot();
    fly(
      tidy,
      (s) =>
        s.phase === 'departure' ? { gearDown: false, flapsDown: false, thrustIndex: 4 } : pilot(s),
      300,
    );
    expect(tidy.phase).toBe('cruise');
    // ZS = 800 − 100·4 − 2·10 at the start of the cruise module.
    stepProgram(tidy, { ...NO_PROGRAM_INPUT, gearDown: false, thrustIndex: 4 }, context(tidy), DT);
    expect(tidy.airspeedKt).toBe(380);
  });
});

/** A state on the program's ILS, a little outside the gate, configured to land. */
function onFinal(milesOut = 5.9, thrustIndex = 4): ProgramState {
  const state = startProgram(departureRunway);
  const back = sinCosDegrees(ils.runway.headingTrue + 180);
  const out = milesOut * 6076.115486;
  state.phase = 'ils';
  state.position = advance(ils.runway.threshold, back.cos * out, back.sin * out);
  const slope = sinCosDegrees(ils.glideslopeDeg);
  state.altitudeFt = ils.runway.elevationFt + ((out + ils.glidePointFt) * slope.sin) / slope.cos;
  state.heading = ils.runway.headingTrue;
  state.landingCourse = ils.runway.headingTrue;
  state.flapsDown = true;
  state.gearDown = true;
  state.thrustIndex = thrustIndex;
  state.pitch = -3;
  return state;
}

/** Keeps the crosshair centred as a player did: three degrees down above the slope, two below. */
function glideslopeSteps(state: ProgramState): number {
  const { elevationDeg } = ilsGeometry(ils, state.position, state.altitudeFt);
  const wanted = elevationDeg > ils.glideslopeDeg ? -3 : -2;
  return state.pitch < 0 && !state.flared ? Math.sign(wanted - state.pitch) : 0;
}

const landing = (flareAt: number, extra: Partial<ProgramInput> = {}) => {
  let flared = false;
  return (state: ProgramState): Partial<ProgramInput> => {
    const height = state.altitudeFt - ils.runway.elevationFt;
    const input: Partial<ProgramInput> = {
      flapsDown: true,
      gearDown: true,
      thrustIndex: 4,
      pitchSteps: glideslopeSteps(state),
      ...extra,
    };
    if (!flared && height < flareAt) {
      flared = true;
      input.flare = true;
      input.thrustIndex = 6;
    }
    if (flared) input.thrustIndex = 6;
    if (state.phase === 'rollout') input.reverse = true;
    return input;
  };
};

describe('the 1982 approach and landing', () => {
  it('flies the 2.82° glideslope with three degrees nose down and lands with an idle flare', () => {
    const state = onFinal();
    expect(fly(state, landing(60), 600)).toBe('landed');
    expect(state.touchdown).not.toBeNull();
    expect(state.touchdown?.short).toBeLessThan(0);
  });

  it('crashes a jumbo flown onto the runway nose down, without a flare', () => {
    expect(fly(onFinal(), landing(-1), 600)).toBe('nosedIn');
  });

  it('crashes a flare begun too high, and lands hard from 80 to 100 ft', () => {
    expect(fly(onFinal(), landing(140), 600)).toBe('flaredTooHigh');
    expect(fly(onFinal(), landing(95), 600)).toBe('hardLanding');
  });

  it('lands on its belly with the gear up', () => {
    expect(fly(onFinal(), landing(60, { gearDown: false }), 600)).toBe('gearUp');
  });

  it('stalls a flare made with power on', () => {
    const state = onFinal();
    let flared = false;
    const ending = fly(
      state,
      (s) => {
        const input: Partial<ProgramInput> = {
          flapsDown: true,
          gearDown: true,
          thrustIndex: 4,
          pitchSteps: glideslopeSteps(s),
        };
        if (!flared && s.altitudeFt - ils.runway.elevationFt < 60) {
          flared = true;
          input.pitchSteps = 5;
        }
        return input;
      },
      600,
    );
    expect(ending).toBe('stallOnFinal');
  });

  it('acknowledges a missed approach', () => {
    const state = onFinal();
    expect(
      fly(
        state,
        (s) => ({
          flapsDown: true,
          gearDown: true,
          thrustIndex: 4,
          missedApproach: s.altitudeFt < 900,
        }),
        600,
      ),
    ).toBe('missedApproach');
  });

  it('rolls off the far end without reverse thrust', () => {
    const state = onFinal();
    const pilot = landing(60);
    expect(fly(state, (s) => ({ ...pilot(s), reverse: false }), 900)).toBe('rolledOff');
  });
});

describe('the 1982 cruise', () => {
  it('captures the ILS at the gate on the localizer heading with the rudder centred', () => {
    const state = startProgram(departureRunway);
    const gate = programGate(destination, ils);
    state.phase = 'cruise';
    state.position = gate.position;
    state.altitudeFt = 2000;
    state.heading = normaliseDegrees(ils.runway.headingTrue);
    state.thrustIndex = 4;
    stepProgram(state, { ...NO_PROGRAM_INPUT, thrustIndex: 4, gearDown: true }, context(state), DT);
    expect(state.phase).toBe('ils');
  });

  it('flies into the ground below its own field', () => {
    const state = startProgram(departureRunway);
    state.phase = 'cruise';
    state.altitudeFt = 400;
    state.thrustIndex = 4;
    state.pitch = -10;
    expect(fly(state, () => ({ thrustIndex: 4, pitchSteps: 0 }), 60, { groundFt: 300 })).toBe(
      'flewIntoGround',
    );
  });

  it('turns at the program’s rudder rates and burns 14 − TR pounds a second', () => {
    const state = startProgram(departureRunway);
    state.phase = 'cruise';
    state.altitudeFt = 20_000;
    state.heading = 90;
    const fuel = state.fuelLb;
    fly(state, () => ({ thrustIndex: 4, rudderAxis: 0.5, gearDown: false }), 1);
    expect(state.heading).toBeCloseTo(100, 4);
    expect(fuel - state.fuelLb).toBeCloseTo(10, 4);
  });
});
