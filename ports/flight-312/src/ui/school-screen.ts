import type { Deck } from '../engine/flight';
import { HIGHER_IS_BETTER, type Lesson, type Measure } from '../engine/lesson';
import type { LessonRun } from '../engine/lesson-monitor';
import { starsText } from '../engine/landing-score';
import type { SchoolRecord } from '../game/school';
import { h } from './dom';

/**
 * The flight school: the lessons in order as a path, each with its stars
 * so far, the flight deck to learn on, and for every lesson the choice of
 * flying it or watching the instructor fly it first. After a lesson, its
 * debrief: the stars, the number they came from, the instructor's words.
 */
const MEASURE_WORDS: Record<Measure, (value: number) => string> = {
  centrelineFt: (value) => `${Math.round(value)} ft from the centreline at most`,
  altitudeErrorFt: (value) => `${Math.round(value)} ft off the altitude at most`,
  headingErrorDeg: (value) => `${Math.round(value)}° off the heading at most`,
  needleDots: (value) => `the needle ${value.toFixed(1)} dots off at most`,
  fixErrorNm: (value) => `${value.toFixed(1)} nm from the fix`,
  crossingErrorFt: (value) => `${Math.round(value)} ft off the altitude at the fix`,
  beamDots: (value) => `${value.toFixed(1)} dots off the beams at most`,
  speedErrorKt: (value) => `${Math.round(value)} kt off V2 + 10 at most`,
  belowMinimumsFt: (value) =>
    value < 1 ? 'went around right at minimums' : `${Math.round(value)} ft below minimums`,
  sinkFpm: (value) => `touched down at ${Math.round(value)} fpm`,
  landingPoints: (value) => `${Math.round(value)} of 1,000 landing points`,
  seconds: (value) =>
    `${Math.floor(value / 60)} min ${String(Math.round(value % 60)).padStart(2, '0')} s`,
};

export function measureWords(measure: Measure, value: number): string {
  return MEASURE_WORDS[measure](value);
}

/** "Three stars: within 150 ft." */
function starTerms(lesson: Lesson): string {
  const { measure, three, two } = lesson.grade;
  const verb = HIGHER_IS_BETTER.includes(measure) ? 'at least' : 'within';
  const value = (limit: number) => MEASURE_WORDS[measure](limit).replace(/ at most$/, '');
  return `★★★ ${verb} ${value(three)} · ★★ ${verb} ${value(two)}`;
}

export interface SchoolActions {
  fly(lesson: Lesson, demo: boolean): void;
  chooseDeck(deck: Deck): void;
  back(): void;
}

export function schoolScreen(
  lessons: readonly Lesson[],
  record: SchoolRecord,
  deck: Deck,
  actions: SchoolActions,
): HTMLElement {
  const next = lessons.find((lesson) => (record[lesson.id] ?? 0) === 0);
  const passed = lessons.filter((lesson) => (record[lesson.id] ?? 0) > 0).length;
  const deckChoice = h(
    'div',
    { class: 'brief-options deck-choice', role: 'radiogroup', 'aria-label': 'Flight deck' },
    ...(['classic', 'glass'] as const).map((choice) => {
      const input = h('input', {
        type: 'radio',
        name: 'school-deck',
        value: choice,
        checked: choice === deck,
      });
      input.addEventListener('change', () => actions.chooseDeck(choice));
      return h(
        'label',
        { class: 'brief-option' },
        input,
        h('strong', {}, choice === 'classic' ? 'Classic deck' : 'Glass deck'),
        h(
          'span',
          {},
          choice === 'classic'
            ? 'Dials and needles, three crew: the jumbo of 1982.'
            : 'Screens and a flight management computer: the later jumbo.',
        ),
      );
    }),
  );
  return h(
    'section',
    { class: 'screen school', 'aria-labelledby': 'school-title' },
    h(
      'header',
      { class: 'screen-header' },
      h('button', { type: 'button', class: 'menu-link', onclick: actions.back }, '← Back'),
      h('h2', { id: 'school-title' }, 'Flight school'),
      h('p', { class: 'school-progress' }, `${passed} of ${lessons.length} lessons passed`),
    ),
    h(
      'p',
      { class: 'school-intro' },
      'Thirteen lessons from the first look round the flight deck to a check-ride on the whole flight. An instructor talks you through each one; watch them fly it first if you like.',
    ),
    deckChoice,
    h(
      'ol',
      { class: 'school-path' },
      ...lessons.map((lesson) => {
        const stars = record[lesson.id] ?? 0;
        return h(
          'li',
          {
            class: `school-lesson${stars > 0 ? ' passed' : ''}${lesson === next ? ' next' : ''}`,
          },
          h('span', { class: 'school-number', 'aria-hidden': 'true' }, String(lesson.number)),
          h(
            'div',
            { class: 'school-body' },
            h('h3', {}, lesson.title),
            h('p', {}, lesson.summary),
            h(
              'p',
              { class: 'school-stars', 'aria-label': `${stars} of 3 stars` },
              stars > 0 ? starsText(stars) : lesson === next ? 'Next up' : 'Not flown yet',
            ),
          ),
          h(
            'div',
            { class: 'school-actions' },
            h(
              'button',
              {
                type: 'button',
                class: lesson === next ? 'primary' : 'menu-link',
                onclick: () => actions.fly(lesson, false),
              },
              stars > 0 ? 'Fly again' : 'Fly it',
            ),
            h(
              'button',
              { type: 'button', class: 'menu-link', onclick: () => actions.fly(lesson, true) },
              'Watch first',
            ),
          ),
        );
      }),
    ),
  );
}

export interface DebriefActions {
  again(): void;
  demo(): void;
  next: (() => void) | null;
  replay: (() => void) | null;
  school(): void;
}

export function lessonDebrief(
  lesson: Lesson,
  run: LessonRun,
  demo: boolean,
  actions: DebriefActions,
): HTMLElement {
  const passed = run.status === 'passed';
  const words = passed
    ? run.stars === 3
      ? lesson.debrief.three
      : run.stars === 2
        ? lesson.debrief.two
        : lesson.debrief.one
    : lesson.debrief.failed;
  const measured =
    passed && run.measure !== null ? measureWords(lesson.grade.measure, run.measure) : null;
  const button = (label: string, run: (() => void) | null, primary = false) =>
    run
      ? h(
          'button',
          { type: 'button', class: primary ? 'primary' : 'menu-link', onclick: run },
          label,
        )
      : null;
  return h(
    'div',
    { class: 'overlay debrief', role: 'dialog', 'aria-labelledby': 'debrief-title' },
    h(
      'div',
      { class: 'overlay-card report-card' },
      h('p', { class: 'report-kind' }, demo ? 'Demonstration' : `Lesson ${lesson.number}`),
      h('h2', { id: 'debrief-title' }, lesson.title),
      h(
        'p',
        {
          class: `debrief-stars${passed ? '' : ' failed'}`,
          'aria-label': passed ? `${run.stars} of 3 stars` : 'Not passed',
        },
        passed ? starsText(run.stars) : 'Not passed',
      ),
      measured
        ? h('p', { class: 'debrief-measure' }, measured[0]?.toUpperCase() + measured.slice(1) + '.')
        : null,
      !passed && run.reason ? h('p', { class: 'debrief-measure' }, run.reason) : null,
      h('blockquote', { class: 'debrief-words' }, words),
      h('p', { class: 'debrief-terms' }, starTerms(lesson)),
      h(
        'div',
        { class: 'report-actions' },
        button(demo ? 'Now you fly it' : 'Try again', actions.again, !passed || demo),
        button('Next lesson', passed && !demo ? actions.next : null, passed && !demo),
        button('Watch the instructor', demo ? null : actions.demo),
        button('Watch the replay', actions.replay),
        button('Flight school', actions.school),
      ),
    ),
  );
}
