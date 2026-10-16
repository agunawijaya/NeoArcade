# ADR 0031 — Flight 312: lessons are data files, marked by the engine and flown by the test pilot

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Flight 312 part 2 (prompt 010)

## Context

Prompt 010 asks for a flight school of about twelve lessons, from a cockpit
tour to a check-ride, each with a goal, a demonstration by the test pilot,
live coaching by an instructor who speaks, and a one-to-three-star debrief;
"lessons are data files, validated by tests and flown by the test pilot in
CI".

## Decision

- **A lesson is JSON** in `src/lessons/`, one file per lesson: where it
  starts (a mode and, for air work, an `AirStart` on a station's radial or
  out on the final, trimmed for level flight or for the glideslope), the
  radio (quiet, or the first officer), the briefing's lines, the tasks in
  order, the cues for each task, the one measure it is graded on with its
  three- and two-star limits, and the debrief's words.
- **A small vocabulary of tasks and cues.** Tasks: set a control, the
  takeoff roll, liftoff, the climb-out, hold a heading or an altitude,
  track a radial, reach a DME fix, cross a fix at an altitude, capture the
  localizer or the glideslope, fly the glidepath to a height, land, go
  around, fly the whole flight. Cues: off the centreline, off the altitude
  or heading, too much bank, too slow or too fast, above or below the
  glideslope, the course to the left or right, sinking too fast, too much
  pitch, gear up low. `parseLesson` (`src/engine/lesson.ts`) checks a file
  and says exactly what is missing or wrong.
- **The monitor is engine code.** `lesson-monitor.ts` steps alongside the
  flight and only reads it: it speaks the briefing on a timetable, starts
  and judges each task, says a cue at most every few seconds, keeps the
  worst value of the graded measure, and ends with stars or a reason. The
  same monitor marks the player and the demonstration.
- **The test pilot flies every lesson.** `lesson-pilot.ts` gives the
  scripted crew a hand for each task kind: the test pilot's own takeoffs,
  approaches and landings, and the autopilot set for the air work. A test
  flies all thirteen lessons on both decks and requires at least two stars,
  and the determinism trace includes two.
- **The instructor speaks through the radio's speech, as a different
  voice.** `RadioVoices.instructor` uses the same local-only voices, a voice
  none of the controllers use, no radio clicks, and its words are always on
  screen, whatever the subtitles setting.

## Consequences

- A new lesson is a JSON file and a line in `src/lessons/index.ts`; the
  tests reject it until it parses and until the test pilot can pass it.
- The vocabulary limits what a lesson can ask; a new kind of task means
  code in the monitor and in the lesson pilot, which keeps the two honest.
- Lessons fly at the Pilot level; their radio is the instructor's unless
  the lesson wants a controller (the check-ride).
