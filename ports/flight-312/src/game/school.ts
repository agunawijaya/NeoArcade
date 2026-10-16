import type { Store } from '@shared/storage';
import type { Flight, FlightEvent } from '../engine/flight';
import type { Lesson } from '../engine/lesson';
import {
  currentTask,
  startLesson,
  stepLesson,
  type LessonEvent,
  type LessonRun,
} from '../engine/lesson-monitor';
import type { FlightSession } from './session';

/**
 * A lesson in the game: its monitor stepped with the flight, the
 * instructor's words spoken and shown, the lesson's card kept up to date,
 * and the verdict handed on once the last word has had time to land. The
 * school's progress — the best stars of each lesson — lives in the game's
 * store.
 */
export interface LessonVerdict {
  run: LessonRun;
  demo: boolean;
}

/** Seconds between the verdict and the debrief, for the instructor's last words. */
const DEBRIEF_DELAY = 2.5;

export class LessonController {
  readonly run: LessonRun;
  private session: FlightSession | null = null;
  private finishedAt: number | null = null;

  constructor(
    readonly lesson: Lesson,
    flight: Flight,
    readonly demo: boolean,
    private readonly finished: (verdict: LessonVerdict) => void,
  ) {
    this.run = startLesson(lesson, flight);
  }

  attach(session: FlightSession) {
    this.session = session;
    this.updatePanel();
  }

  /** After every step of the flight. */
  stepped(flight: Flight, events: FlightEvent[]) {
    for (const event of stepLesson(this.run, flight, events)) this.handle(event, flight);
    if (this.finishedAt !== null && flight.time - this.finishedAt >= DEBRIEF_DELAY) {
      this.finishedAt = Infinity;
      this.session?.halt();
      this.finished({ run: this.run, demo: this.demo });
    }
  }

  /** The flight ended on its own — a crash, or the takeoff practice's climb-out — before the verdict. */
  flightEnded(flight: Flight) {
    if (this.run.status === 'passed' || this.run.status === 'failed') return;
    for (const event of stepLesson(this.run, flight, [])) this.handle(event, flight);
    if (this.finishedAt === null) {
      this.finishedAt = Infinity;
      this.finished({ run: this.run, demo: this.demo });
    }
  }

  private handle(event: LessonEvent, flight: Flight) {
    switch (event.kind) {
      case 'say':
        this.session?.instructor(event.text);
        break;
      case 'task':
        this.updatePanel();
        break;
      case 'passed':
      case 'failed':
        this.finishedAt = flight.time;
        this.updatePanel();
        break;
    }
  }

  private updatePanel() {
    const task = currentTask(this.run);
    const total = this.lesson.tasks.length;
    const done = this.run.status === 'passed' ? total : Math.max(0, this.run.task);
    this.session?.lessonPanel({
      title: `Lesson ${this.lesson.number} · ${this.lesson.title}`,
      task:
        this.run.status === 'briefing'
          ? 'Listen to the briefing.'
          : this.run.status === 'passed'
            ? 'Lesson complete.'
            : this.run.status === 'failed'
              ? 'Lesson over.'
              : (task?.goal ?? ''),
      done,
      total,
      note: this.demo ? 'Demonstration: the instructor is flying. Watch.' : null,
    });
  }
}

/** The best stars won in each lesson, and the lessons passed. */
export type SchoolRecord = Record<string, number>;

export function schoolRecord(store: Store): SchoolRecord {
  const stored = store.get<unknown>('school', {});
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

export function recordLesson(store: Store, lessonId: string, stars: number): SchoolRecord {
  const record = schoolRecord(store);
  record[lessonId] = Math.max(record[lessonId] ?? 0, stars);
  store.set('school', record);
  return record;
}
