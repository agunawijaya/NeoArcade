import { beforeAll, describe, expect, it } from 'vitest';
import { loadTerrainSource } from '../data/unpack';
import { createFlight } from '../engine/flight';
import { createPracticePlayer, stepPracticePlayer } from '../engine/practice-player';
import { FlightRecorder, RECORDING_VERSION, type Recording } from '../engine/recording';
import { RecordingError } from '../engine/recording-codec';
import { createTerrain } from '../engine/terrain';
import { cleanNickname, LINK_LIMIT, NICKNAME_LIMIT, packReplay, unpackReplay } from './replay-link';

/**
 * A challenge link carries a recorded approach in a few hundred
 * characters, gives back exactly what went in, and refuses what it
 * cannot trust: damaged text, another version's recording, and a nickname
 * that would hide or reorder the words around it.
 */
let recording: Recording;

beforeAll(async () => {
  const flight = createFlight(
    { mode: 'approach', level: 'pilot', destination: 'bos', seed: 77, sky: 'low' },
    createTerrain(await loadTerrainSource()),
  );
  const recorder = new FlightRecorder(flight);
  const player = createPracticePlayer(recorder);
  while (!flight.outcome && flight.time < 1500) stepPracticePlayer(player);
  recording = recorder.recording();
});

describe('a challenge link', { timeout: 60_000 }, () => {
  it('carries a whole approach in a short line of URL-safe text', async () => {
    const text = await packReplay({ meta: { kind: 'approach' }, recording });
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(text.length).toBeLessThan(2_000);
    expect(text.length).toBeLessThan(LINK_LIMIT);
  });

  it('gives back the same recording and the words about it', async () => {
    const text = await packReplay({
      meta: { kind: 'daily', daily: 12, nickname: 'Ace' },
      recording,
    });
    const back = await unpackReplay(text);
    expect(back.meta).toEqual({ kind: 'daily', daily: 12, nickname: 'Ace' });
    expect(back.recording).toEqual(recording);
  });

  it('keeps only what it is meant to carry', async () => {
    const text = await packReplay({
      meta: {
        kind: 'stunt' as 'approach',
        lesson: '../../etc',
        nickname: '‮evil\u0000 name that runs on and on',
      },
      recording,
    });
    const { meta } = await unpackReplay(text);
    expect(meta.kind).toBe('approach');
    expect(meta.lesson).toBeUndefined();
    expect(meta.nickname).toBe('evil name that r');
  });

  it('refuses a damaged link', async () => {
    await expect(unpackReplay('not*base64')).rejects.toThrow(RecordingError);
    await expect(unpackReplay('AAAA')).rejects.toThrow('damaged');
    const text = await packReplay({ meta: { kind: 'approach' }, recording });
    await expect(unpackReplay(text.slice(0, -40))).rejects.toThrow(RecordingError);
  });

  it('refuses a flight recorded by another version', async () => {
    const text = await packReplay({
      meta: { kind: 'approach' },
      recording: { ...recording, version: RECORDING_VERSION + 1 },
    });
    await expect(unpackReplay(text)).rejects.toThrow('another version');
  });
});

describe('a nickname', () => {
  it('is printable, one line and short', () => {
    expect(cleanNickname('  Captain\n  Kirk  ')).toBe('Captain Kirk');
    expect(cleanNickname('​‏')).toBeNull();
    expect(cleanNickname(null)).toBeNull();
    expect([...(cleanNickname('✈️'.repeat(40)) ?? '')].length).toBeLessThanOrEqual(NICKNAME_LIMIT);
  });
});
