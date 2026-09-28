# shared/

Small, tested pieces every port can import through the `@shared/*` alias.
Each module's `index.ts` has a usage example at the top.

| Module | Use it for |
|---|---|
| `rng/` | `createRng(seed)` — seeded random numbers for deterministic, testable engines. |
| `loop/` | `createLoop({ update, render })` — fixed-timestep loop with interpolation and `timeScale` for slow motion. |
| `input/` | `createInput({ bindings })` — keyboard, pointer/touch and gamepad mapped to named actions. |
| `audio/` | `createAudio()` — Web Audio synth for effects and step-sequenced music; one master volume and mute for the whole arcade, unlocked on the first gesture. |
| `storage/` | `createStore(namespace)` and `createHighScores(store)` — namespaced `localStorage` that never throws; `set()` and `canPersist()` say whether values really stick. |
| `fx/` | `createPostFx(canvas, options)` — WebGL bloom, grading, vignette and CRT; falls back to Canvas 2D without WebGL. |
| `hall-link/` | `mountHallButton()` — the consistent "back to the Hall" button. |
| `pass/` | `connectPass(manifest)` and `mountUnlockToasts()` — the Arcade Pass: XP, levels, badges and the unlock toast, plus the badge cabinet and the code-drawn avatars, medals and rank emblems ([guide](../docs/ARCADE-PASS.md)). |
| `fonts/` | `tilt-neon.css` — the Hall's neon display font (SIL OFL 1.1). |

Changes here affect every game. Add to `shared/` only what more than one
port needs, and give it tests.
