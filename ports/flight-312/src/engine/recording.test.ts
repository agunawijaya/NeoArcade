import { beforeAll, describe, expect, it } from 'vitest';
import { loadTerrainSource } from '../data/unpack';
import { createFlight, NO_INPUT, type Flight, type FlightSetup } from './flight';
import { createPracticePlayer, stepPracticePlayer } from './practice-player';
import {
  FlightRecorder,
  quantiseInput,
  replayRecording,
  ReplayPlayer,
  SNAPSHOT_EVERY,
  type Recording,
} from './recording';
import { decodeRecording, encodeRecording, RecordingError } from './recording-codec';
import { createTerrain, type Terrain } from './terrain';

/**
 * A replay is the setup, the inputs and the commands, flown again: these
 * tests fly an approach the way a player does, record it, and check that
 * flying the recording — from the start, from a snapshot, or after a trip
 * through bytes — comes out the same to the last bit.
 */
let terrain: Terrain;
let flown: { recording: Recording; flight: Flight; recorder: FlightRecorder };

const SETUP: FlightSetup = {
  mode: 'approach',
  level: 'pilot',
  destination: 'bos',
  seed: 77,
  sky: 'low',
  wind: { direction: 70, speedKt: 12, gustKt: 20 },
};

/** Everything a replay must reproduce, written to the last digit. */
function fingerprint(flight: Flight): string {
  const r = flight.readout;
  return JSON.stringify({
    time: flight.time,
    position: r.position,
    altitude: r.altitudeFt,
    ias: r.iasKt,
    heading: r.headingTrue,
    fuel: r.fuelLb,
    touchdown: flight.touchdown && { ...flight.touchdown, runway: flight.touchdown.runway.ident },
    report: flight.outcome?.report ?? null,
    radio: flight.atc.log.map((call) => `${call.at} ${call.text.written}`),
  });
}

beforeAll(async () => {
  terrain = createTerrain(await loadTerrainSource());
  const flight = createFlight(SETUP, terrain);
  const recorder = new FlightRecorder(flight);
  const player = createPracticePlayer(recorder);
  while (!flight.outcome && flight.time < 1500) stepPracticePlayer(player);
  flown = { recording: recorder.recording(), flight, recorder };
});

describe('a recorded approach', { timeout: 60_000 }, () => {
  it('is a whole approach, flown by commands and inputs alone', () => {
    expect(flown.flight.outcome?.ending).toBe('landed');
    const kinds = new Set(
      flown.recording.entries.flatMap((entry) => entry.commands.map((c) => c.kind)),
    );
    for (const kind of [
      'button',
      'knob',
      'gear',
      'flapStep',
      'readback',
      'levers',
      'reverseToggle',
    ])
      expect(kinds.has(kind as never), kind).toBe(true);
  });

  it('flies again from its setup to exactly the same flight', () => {
    const again = replayRecording(flown.recording, terrain);
    expect(fingerprint(again)).toBe(fingerprint(flown.flight));
  });

  it('flies again from a snapshot the recorder kept, to the same end', () => {
    const snapshot = flown.recorder.snapshots.find((one) => one.step >= 3 * SNAPSHOT_EVERY);
    expect(snapshot).toBeDefined();
    const player = new ReplayPlayer(flown.recording, {
      snapshot: snapshot as NonNullable<typeof snapshot>,
      world: flown.flight.world,
    });
    player.advanceTo(flown.recording.steps);
    expect(fingerprint(player.flight)).toBe(fingerprint(flown.flight));
  });

  it('goes through bytes and back unchanged, and is small', () => {
    const bytes = encodeRecording(flown.recording);
    const decoded = decodeRecording(bytes);
    expect(decoded).toEqual(flown.recording);
    expect(fingerprint(replayRecording(decoded, terrain))).toBe(fingerprint(flown.flight));
    // Minutes of flying in a few kilobytes, before the link even deflates it.
    expect(bytes.length).toBeLessThan(20_000);
  });

  it('refuses bytes that were cut short or changed', () => {
    const bytes = encodeRecording(flown.recording);
    expect(() => decodeRecording(bytes.subarray(0, bytes.length - 9))).toThrow(RecordingError);
    const changed = bytes.slice();
    changed[20] = (changed[20] ?? 0) ^ 0x40;
    expect(() => decodeRecording(changed)).toThrow(RecordingError);
    expect(() => decodeRecording(new Uint8Array([1, 2, 3]))).toThrow(RecordingError);
  });
});

describe('the recorder', () => {
  it('writes an input only when it changes, and quantises it', () => {
    const flight = createFlight(SETUP, terrain);
    const recorder = new FlightRecorder(flight);
    recorder.step({ ...NO_INPUT, elevator: 0.3001 });
    recorder.step({ ...NO_INPUT, elevator: 0.3002 });
    recorder.step({ ...NO_INPUT, elevator: 0.5 });
    expect(recorder.entries.map((entry) => entry.step)).toEqual([1, 3]);
    expect(recorder.entries[0]?.input?.elevator).toBe(
      quantiseInput({ ...NO_INPUT, elevator: 0.3 }).elevator,
    );
  });

  it('keeps a command for the step after it, and carries it out at once', () => {
    const flight = createFlight(SETUP, terrain);
    const recorder = new FlightRecorder(flight);
    recorder.step(NO_INPUT);
    const gear = flight.panel.gearDown;
    recorder.command({ kind: 'gear' });
    expect(flight.panel.gearDown).toBe(!gear);
    recorder.step(NO_INPUT);
    expect(recorder.entries).toEqual([{ step: 2, input: null, commands: [{ kind: 'gear' }] }]);
  });
});
