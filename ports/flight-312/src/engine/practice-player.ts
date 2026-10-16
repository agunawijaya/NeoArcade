import { FLAP_DETENTS } from './aircraft';
import { angleDifference, clamp } from './exact-math';
import { referenceSpeedNow } from './finish';
import { NO_INPUT, type Flight, type FlightInput } from './flight-state';
import type { FlightRecorder } from './recording';
import { onRunway } from './runways';

/**
 * A player flying an approach practice the way a person does at the
 * keyboard: every switch, knob and lever through the crew's commands, the
 * stick and pedals as inputs, so the whole flight is in its recording. The
 * recording's tests and the determinism trace fly it, record it, and fly
 * the recording again.
 */
export interface PracticePlayer {
  recorder: FlightRecorder;
  answeredAt: number;
  autopilotOff: boolean;
  reversed: boolean;
}

export function createPracticePlayer(recorder: FlightRecorder): PracticePlayer {
  return { recorder, answeredAt: -10, autopilotOff: false, reversed: false };
}

/** One step: what the hands do now, then the step itself. */
export function stepPracticePlayer(player: PracticePlayer) {
  const { recorder } = player;
  const flight = recorder.flight;
  const input = handsFor(player, flight);
  return recorder.step(input);
}

function handsFor(player: PracticePlayer, flight: Flight): FlightInput {
  const command = player.recorder.command.bind(player.recorder);
  const r = flight.readout;
  const afds = flight.afds;
  const panel = flight.panel;
  const atc = flight.atc;
  if (atc.pending && flight.time - player.answeredAt > 2 && flight.time > atc.busyUntil + 1) {
    command({ kind: 'readback', choice: 'correct' });
    player.answeredAt = flight.time;
  }
  if (
    flight.time > 2 &&
    !afds.armedGlideslope &&
    afds.pitchMode !== 'glideslope' &&
    !player.autopilotOff
  )
    command({ kind: 'button', button: 'approach' });
  // Follow the controller's headings with the knob, a few degrees a step.
  const wanted = atc.cleared.heading;
  if (wanted !== null && afds.rollMode === 'heading') {
    const turn = Math.round(angleDifference(wanted, panel.headingBug));
    if (turn !== 0) command({ kind: 'knob', knob: 'heading', clicks: clamp(turn, -5, 5) });
  }
  const slope = flight.nav[0].glideslope;
  if (!panel.gearDown && slope !== null && slope > -0.5) command({ kind: 'gear' });
  if (
    afds.pitchMode === 'glideslope' &&
    panel.flapLever < FLAP_DETENTS.length - 1 &&
    Math.round(flight.time * 60) % 240 === 0
  )
    command({ kind: 'flapStep', direction: 1 });
  const vref = referenceSpeedNow(flight);
  if (afds.pitchMode === 'glideslope' && Math.round(afds.speedKt) !== vref + 5)
    command({ kind: 'knob', knob: 'speed', clicks: vref + 5 - Math.round(afds.speedKt) });

  const radio = flight.radioAltitudeFt ?? r.heightFt;
  if (!player.autopilotOff && radio < 150 && !r.onGround && flight.approach.active) {
    player.autopilotOff = true;
    command({ kind: 'button', button: 'autopilot' });
    command({ kind: 'button', button: 'autothrottle' });
  }
  if (!player.autopilotOff) return { ...NO_INPUT };
  if (r.onGround) {
    if (!player.reversed && flight.touchdown) {
      player.reversed = true;
      command({ kind: 'reverseToggle' });
    }
    if (player.reversed && r.iasKt < 60 && panel.reverse.some((lever) => lever > 0))
      command({ kind: 'reverseToggle' });
    // Rudder on the centreline: against the heading error and the drift from it.
    const strip = flight.touchdown?.runway ?? flight.world.ils.runway;
    const { across } = onRunway(strip, r.position);
    return {
      ...NO_INPUT,
      brakes: flight.touchdown ? 0.8 : 0,
      elevator: -0.2,
      rudder: clamp(
        angleDifference(strip.headingTrue, r.headingTrue) * 0.3 - across * 0.006,
        -1,
        1,
      ),
    };
  }
  if (radio < 25 && (panel.levers[0] ?? 0) > 0) command({ kind: 'levers', value: 0 });
  // Down the slope to thirty feet, then a flare of a couple of degrees, wings level.
  const pitch = radio < 30 ? 2.5 : -1.5;
  const rate = flight.airframe?.pitchRate ?? 0;
  return {
    ...NO_INPUT,
    elevator: clamp((pitch - r.pitchDeg) * 0.3 - rate * 0.25, -1, 1),
    aileron: clamp(-r.bankDeg * 0.06, -1, 1),
  };
}
