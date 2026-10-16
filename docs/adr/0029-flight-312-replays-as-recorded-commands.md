# ADR 0029 — Flight 312: replays are recorded commands, flown again

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Flight 312 part 2 (prompt 010)

## Context

Prompt 010 asks for landing replays from several cameras — tower, beside
the runway, chase, the cockpit — with a slow-motion touchdown, the last ten
replays kept on the device "as engine inputs and a seed, not video", and a
challenge link that carries a replay the way Skyline Showdown's links carry
a shot (ADR 0014). The cockpit camera means the instruments must move in the
replay as they did. Part 1 already made the engine deterministic to the bit
in every browser (ADR 0023): a flight is a function of its setup and of what
the crew did.

What the crew did, though, was scattered: the keyboard, the gamepad, the
cockpit's clicks, the touch buttons, the readback buttons and the checklist
screen each changed the flight directly, between steps, from different
places in the game.

## Decision

- **Every hand on the flight is a command.** `src/engine/crew.ts` defines
  `CrewCommand` — a knob turned so many clicks, a button pressed, the levers
  set to a value, a readback chosen, a checklist called, a CDU edit — and
  `applyCommand` is the only code that carries one out. The session, the
  cockpit, the HUD, the checklists and the glass deck's CDU all produce
  commands; the old `game/controls.ts` moved into the engine. Values are
  rounded where a replay must keep them exactly (levers to 1/1024, knobs to
  whole clicks, frequencies to the hundredth).
- **A recording is the setup, the inputs that changed and the commands at
  their steps.** `FlightRecorder` (`src/engine/recording.ts`) wraps the
  step: it quantises the stick and pedals to 1/128, writes an input only
  when it changes, and writes the commands given before each step.
  `ReplayPlayer` flies a recording again, from the setup or from a snapshot.
- **Snapshots make the instant replay instant.** Every ten seconds of
  flight the recorder keeps a `structuredClone` of the flight without its
  world (terrain, weather and runways never change in flight), the last
  twenty of them. The replay after a landing starts from the snapshot
  nearest a minute before the touchdown; a saved replay or a link has none
  and flies from the start, in slices, with a progress line.
- **Bytes for links.** `recording-codec.ts` writes the setup as JSON, then
  each entry as the steps since the last (LEB128), a flag byte, the axes as
  zigzag differences in 1/128ths and the commands as a byte each plus what
  they carry; an FNV-1a checksum closes it. `game/replay-link.ts` prefixes
  a few words of where it came from (approach, daily, lesson, an optional
  nickname, cleaned as Skyline Showdown's are), deflates it and writes it
  in base64url after `#r=`. A six-minute approach is under 1 KB raw and
  about 400 bytes deflated. Links longer than 24,000 characters are not
  offered; that flight stays in the saved list.
- **The challenger's score is worked out on the receiver's machine.** The
  link carries no score: the receiver flies the recording again and marks
  it with the same landing score (`landing-score.ts`), so the number
  cannot be edited in the link.
- **The cameras are a renderer.** `game/replay-director.ts` flies the replay
  once to find the touchdown and the path, then plays it at real time (a
  quarter speed around the touchdown), choosing the camera like a film
  crew, or the one the player picks. `world/replay-overlay.ts` draws the
  flown path, the glideslope's one-dot corridor and the touchdown ring.

## Consequences

- A replay is exact: the cockpit camera's instruments, the radio and the
  report come out as they were, and the determinism trace checks a
  recorded approach flown again in Chromium, Firefox and WebKit.
- A recording belongs to the engine version that made it: links carry
  `RECORDING_VERSION`, and one from another version is refused politely
  rather than flown wrong.
- The stick and pedals are quantised in play too, at 1/128 of their travel,
  so the flight flown and the flight replayed are the same flight; nobody
  can feel half a percent of stick on a jumbo.
- Scripted crews (the test pilot, a lesson's demonstration) still set the
  panel directly and are not recorded; their flights are reproduced by
  flying the script again.
