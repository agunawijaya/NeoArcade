import { beforeAll, describe, expect, it } from 'vitest';
import { loadTerrainSource } from '../data/unpack';
import { LESSONS } from '../lessons';
import { createFlight, stepFlight, type Deck } from './flight';
import { LessonError, parseLesson, type Lesson } from './lesson';
import { createLessonPilot, lessonPilotInput } from './lesson-pilot';
import { startLesson, stepLesson, type LessonEvent } from './lesson-monitor';
import { createTerrain, type Terrain } from './terrain';

/**
 * The flight school: every lesson's data file checked, and every lesson
 * flown from its briefing to its debrief by the instructor's demonstration,
 * on both flight decks. A lesson the test pilot cannot pass is a lesson a
 * player should not be given.
 */
let terrain: Terrain;

beforeAll(async () => {
  terrain = createTerrain(await loadTerrainSource());
});

function fly(lesson: Lesson, deck: Deck) {
  const flight = createFlight({ ...lesson.setup, deck }, terrain);
  const run = startLesson(lesson, flight);
  const pilot = createLessonPilot(flight, run);
  const events: LessonEvent[] = [];
  const over = () => run.status === 'passed' || run.status === 'failed';
  while (!over() && flight.time < 3 * 3600) {
    const flightEvents = stepFlight(flight, lessonPilotInput(pilot));
    events.push(...stepLesson(run, flight, flightEvents));
    if (flight.outcome && !over()) break;
  }
  return { run, events, flight };
}

describe('the lessons’ data', () => {
  it('are numbered in order, with distinct ids, about a dozen of them', () => {
    expect(LESSONS.map((lesson) => lesson.number)).toEqual(LESSONS.map((_, index) => index + 1));
    expect(new Set(LESSONS.map((lesson) => lesson.id)).size).toBe(LESSONS.length);
    expect(LESSONS.length).toBeGreaterThanOrEqual(12);
  });

  it('go from the cockpit tour to the check-ride', () => {
    expect(LESSONS[0]?.id).toBe('cockpit-tour');
    expect(LESSONS.at(-1)?.tasks.at(-1)?.kind).toBe('flight');
  });

  it('say what is wrong with a broken lesson', () => {
    const good = JSON.parse(JSON.stringify(LESSONS[1])) as Record<string, unknown>;
    expect(() => parseLesson({ ...good, tasks: [] })).toThrow(LessonError);
    expect(() => parseLesson({ ...good, level: 'ace' })).toThrow(/level/);
    expect(() =>
      parseLesson({ ...good, tasks: [{ kind: 'heading', say: 'Turn.', goal: 'Turn.' }] }),
    ).toThrow(/needs "heading"/);
    expect(() =>
      parseLesson({ ...good, grade: { measure: 'centrelineFt', three: 30, two: 10 } }),
    ).toThrow(/harder/);
  });
});

describe('every lesson, flown by the instructor', { timeout: 120_000 }, () => {
  it.each(LESSONS.map((lesson) => [lesson.number, lesson.title, lesson] as const))(
    '%i. %s passes on both decks',
    (_number, _title, lesson) => {
      for (const deck of ['classic', 'glass'] as const) {
        const { run, events } = fly(lesson, deck);
        expect(run.status, `${deck}: ${run.reason ?? ''}`).toBe('passed');
        expect(run.stars).toBeGreaterThanOrEqual(2);
        // The instructor says each task's words as it begins, and a debrief at the end.
        const said = events.flatMap((event) => (event.kind === 'say' ? [event.text] : []));
        expect(said.length).toBeGreaterThanOrEqual(lesson.tasks.length + 1);
      }
    },
  );
});
