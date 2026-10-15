import { finish } from './finish';
import { STEP_SECONDS, type Flight, type FlightEvent, type FlightInput } from './flight-state';
import { stepProgram, type ProgramEnding, type ProgramInput } from './program-model';
import { ilsGeometry } from './radios';
import { PROGRAM_LEVERS, readProgram } from './readout';
import { onRunway } from './runways';
import { groundAt } from './world';

/** Presses of pitch a second with the stick held fully back or forward. */
const STICK_PRESSES_PER_SECOND = 1.5;

/** The program's thrust index for where the levers sit: the nearest of its six detents. */
export function programThrustIndex(levers: readonly number[]): number {
  const lever = levers.reduce((sum, value) => sum + value, 0) / (levers.length || 1);
  let best = 6;
  PROGRAM_LEVERS.forEach((detent, index) => {
    if (Math.abs(detent - lever) < Math.abs((PROGRAM_LEVERS[best - 1] ?? 0) - lever))
      best = index + 1;
  });
  return best;
}

/** The 1982 rules: the panel and the keys become the program's input, its state becomes the readout. */
export function flyProgram(flight: Flight, input: FlightInput, events: FlightEvent[]) {
  const program = flight.program;
  const look = flight.programLook;
  if (!program || !look) return;
  const panel = flight.panel;
  const world = flight.world;

  flight.pitchPresses += input.elevator * STICK_PRESSES_PER_SECOND * STEP_SECONDS;
  let pitchSteps = input.pitchSteps;
  while (Math.abs(flight.pitchPresses) >= 1) {
    const press = Math.sign(flight.pitchPresses);
    pitchSteps += press;
    flight.pitchPresses -= press;
  }
  const programInput: ProgramInput = {
    thrustIndex: programThrustIndex(panel.levers),
    pitchSteps,
    rudderSteps: input.rudderSteps,
    rudderCentre: input.rudderCentre,
    rudderAxis: input.rudder,
    flapsDown: panel.flapLever >= 1,
    gearDown: panel.gearDown,
    releaseBrakes: !panel.parkingBrake,
    flare: input.flare,
    missedApproach: input.missedApproach,
    reverse: panel.reverse.some((lever) => lever > 0.5),
  };
  const groundFt = groundAt(world, program.position);
  const programEvents = stepProgram(
    program,
    programInput,
    {
      weather: world.weather,
      departure: world.departure,
      destination: world.destination,
      ils: world.ils,
      gate: flight.programGate ?? { radial: 0, dmeNm: 0, position: world.ils.runway.threshold },
      nav: flight.nav[0],
      groundFt,
    },
    STEP_SECONDS,
  );
  flight.readout = readProgram(program, look, groundFt, STEP_SECONDS);

  for (const event of programEvents) {
    switch (event.kind) {
      case 'brakesReleased':
        flight.brakesReleasedAt = flight.time;
        events.push({ kind: 'brakesReleased' });
        break;
      case 'liftoff':
        flight.liftoffAt = flight.time;
        events.push({ kind: 'liftoff' });
        break;
      case 'touchdown':
        recordTouchdown(flight);
        events.push({ kind: 'touchdown', sinkFpm: flight.touchdown?.sinkFpm ?? 0 });
        break;
      case 'reverse':
        events.push({ kind: 'reversers' });
        break;
      case 'ending':
        if (event.ending) endProgram(flight, event.ending, events);
        break;
      default:
        break;
    }
  }
  // Takeoff practice ends where the program's cruise module would begin.
  if (flight.setup.mode === 'takeoff' && program.phase === 'cruise')
    finish(flight, 'climbOut', events);
}

function recordTouchdown(flight: Flight) {
  const program = flight.program;
  if (!program?.touchdown) return;
  const strip = flight.world.ils.runway;
  flight.touchdown = {
    at: flight.time,
    sinkFpm: -program.climbRateFpm,
    along: -program.touchdown.short,
    across: program.touchdown.right,
    speedKt: program.airspeedKt,
    crabDeg: 0,
    runway: strip,
    hard: program.flareHeightFt > 80,
    crosswindKt: flight.world.weather.finalDriftKt,
  };
}

function endProgram(flight: Flight, ending: ProgramEnding, events: FlightEvent[]) {
  const program = flight.program;
  if (!program) return;
  const strip =
    ending === 'marshes' || ending === 'runwayLights' || ending === 'tailStrike'
      ? flight.world.departure
      : flight.world.ils.runway;
  const resting = ilsGeometry(flight.world.ils, program.position, program.altitudeFt);
  const fromStart = onRunway(strip, program.position).along + strip.displacedFt;
  finish(flight, ending, events, {
    flareHeightFt: program.flared ? program.flareHeightFt : null,
    restingPlace:
      ending === 'landed' || ending === 'rolledOff'
        ? { along: resting.along, across: resting.across }
        : null,
    pastEndFt: ending === 'marshes' ? fromStart - strip.lengthFt : null,
    flapsDeg: program.flapsDown ? flight.readout.flapsDeg : 0,
  });
}
