# Flight 312 — follow-up ideas

Ideas for after part two, from building and testing it. None of them is
promised; each says why it is worth doing and where in the code it would
start.

**Top picks**, if there is time for only a few:

1. Fly it with real people and real hardware (section 1).
2. VNAV, so the glass deck's descent is the computer's job too (section 2).
3. Lessons for the glass deck's own skills (section 3).

## 1. Check it on real hardware and real players

- **Integrated graphics and phones.** The frame budget was measured on a
  laptop with a discrete GPU, with a CPU throttle standing in for slower
  machines. The glass deck at 1920 × 1080 is the heaviest picture (about
  11 ms there); try it on an integrated GPU and a mid-range phone, and if
  it is short, redraw the six screens at 30 Hz and stamp them in between
  (`DisplayStamp` in `cockpit/glass/glass-kit.ts` already does the stamping).
- **Voices.** The instructor needs a local voice no controller uses. Check
  which voices Windows, macOS, iOS and Android offer, and whether the
  instructor still sounds distinct when the device has only two.
- **Yokes and throttle quadrants.** The browser sees them as gamepads with
  odd axis numbers. A small mapping screen in Settings would let a player
  pick the axes (`game/input.ts`).
- **The share line.** It uses emoji (☁️ 💨 🛬 ★); check it pastes well
  into the usual chat apps.

## 2. The glass deck

- **VNAV.** The button is there and dark. A vertical path from the cruise
  level to the final approach fix's altitude, with the top of descent on
  the ND and the PFD's VNAV PTH, would need a descent profile in `fms.ts`
  and a pitch mode in `afds.ts`. It must stay deterministic and go into the
  trace.
- **More of the CDU.** A HOLD page (published missed approaches end in one), a
  FIX page for range rings round a station, and PERF INIT for the cost
  index. Each is a `CduPage` in `cdu-pages.ts` and, if it changes the
  flight, an `FmsEdit` (and a new `RECORDING_VERSION`).
- **The PLN mode** of the ND, north up, to step through the route.
- **Three autopilots** (CMD L, C, R) and autoland with LAND 3 / LAND 2 on
  the PFD, for the fog: a natural sequel to lesson 12.

## 3. The flight school

- **Glass-deck lessons.** Today every lesson can be flown on either deck,
  but none teaches the glass deck's own skills: programming the route on
  the CDU, a direct-to, LNAV and level change, the approach on the ND's
  APP mode. The format takes them as they are; they need a few new task
  kinds in `lesson-monitor.ts` (a waypoint reached on LNAV, a CDU page
  executed).
- **Emergencies.** An engine failure after V1, a hydraulic failure on the
  approach, a go-around from a gusty flare. The engines and the airframe
  model allow it; the lessons need a way to fail something at a moment.
- **A logbook** of the stars with dates, and a certificate after the
  check-ride (a page drawn by code, to save or share).

## 4. The Daily Approach and replays

- **A weekly challenge** on the Arcade Pass (PASS-01 in the backlog) could
  use the Daily Approach's score directly.
- **Ghosts.** A challenge link already carries a whole recorded flight;
  flying against it would mean drawing the other jumbo in the world while
  the player flies, from the replay player stepping alongside.
- **Shorter links for whole flights.** An approach packs into a few
  hundred characters, but a two-hour flight flown by hand could pass the
  24,000-character limit, and then it is only saved, not linked. Writing
  the stick less often while the autopilot flies would shorten it; that is
  a new `RECORDING_VERSION`.
- **A replay editor**: choose the cameras, trim the start, and save a short
  clip of the touchdown as a still for the share sheet.
