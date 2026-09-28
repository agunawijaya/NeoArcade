# ADR 0008 — Rivals are a CPU level plus a play style

- **Status:** accepted
- **Date:** 2026-09-28
- **Context:** Skyline Showdown, World Tour (prompt 003)

## Context

The World Tour has ten rivals. Each needs a personality that shows in how
it plays (high lobs, flat and fast, wild overcorrection, nerves that crack
when hit) as well as in what it says, and the tour must get harder towards
a Brutal final boss. The existing CPU (ADR 0004) already plays like a
person at four levels. The brief asks that styles be expressed through
`CPU_LEVELS` plus style parameters, and that tests show each style really
behaves differently.

## Decision

A rival is a `CpuLevel` plus a `PlayStyle` (`src/engine/ai.ts`), both data:

| Style field | Default | What it changes |
|---|---|---|
| `angle` | 45 | The launch angle it reaches for when nothing forces another. A tall building in between still lifts it. |
| `angleSpread` | 4 | Degrees of variety around that angle. |
| `correction` | 1 | Multiplies its level's correction. Above 1 it overshoots and swings back and forth; below 1 it creeps. |
| `rattle` | 0 | How much each point against it widens its hand shake. |
| `windSense` | 1 | Multiplies its level's feel for the wind. |

`DEFAULT_STYLE` reproduces the Quick Match CPU exactly (tested), so
nothing changed for existing players. A stage may set `rivalLevel` to bring
a rival back sharper (or gentler) than their Quick Match self: Tempo is
Easy in Rio and Normal on the Moon; Mirage is Easy in Cairo and Hard on
Mars.

`src/engine/ai-styles.test.ts` plays each signature style on many cities
and checks the behaviour a player would notice: lobbers throw higher and
flat-throwers lower than the default, overcorrectors swing past the target
more often, rattled rivals get shakier after being hit, and the default
style is untouched.

Two AI changes came out of the World Tour:

- **Hidden wind.** When the gauge is hidden the CPU reads only 40 % of the
  wind (`HIDDEN_WIND_SENSE`), as a person reading flags and smoke would.
- **Gusts.** After the wind changes between throws, the CPU still learns
  from its last throw but allows for the change: it estimates how much the
  new wind would have moved that banana (½·Δa·t² over the last flight
  time, times its feel for the wind) and corrects from there. Its short
  and long bracket is forgotten, since it was measured in another wind.

Personalities never come from nationality or ethnicity: a rival is
defined by a playing habit, a colour, an outfit from the wardrobe and a
few lines about rain, rooftops, orbit or storms.

## Consequences

- A new rival is a record in `src/tour/rivals.ts`; no AI code.
- Difficulty tuning happens in data: levels per stage, style numbers,
  and the stage's throw budget. `src/tour/tuning.test.ts` guards the
  result against a stand-in "decent human" (see ARCHITECTURE.md).
- Rivals beaten on the tour become opponents in Quick Match at their own
  level and style.
