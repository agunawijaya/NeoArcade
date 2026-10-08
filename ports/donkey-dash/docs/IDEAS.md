# Donkey Dash — follow-up ideas

Ideas for after the first release, from building and playtesting the port.
None of them is promised; each says why it is worth doing and where in the
code it would start. They are grouped from "check what we have" to "add
something new".

**Top picks**, if there is time for only a few:

1. Play it on real phones and real gamepads (section 1).
2. A ghost car and challenge links, which the deterministic engine makes
   almost free (section 3).
3. A CPU donkey, so one player can try Donkey vs Driver (section 3).

## 1. Check it on real hardware and real players

Everything so far was tested in desktop browsers, in phone-sized emulation
and with a scripted player. That leaves some gaps.

- **Gamepads.** The bindings exist (`game/controls.ts`, `ui/menu-nav.ts`)
  but have not met a real pad. Check one pad for a single player, two pads
  in Donkey vs Driver (the first connected pad is Player 1), menus with the
  D-pad, and plugging a pad in mid-game.
- **Phones.** Try iOS Safari and Android Chrome: sound starting on the
  first tap, the notch and home-bar safe areas, two players sharing an
  upright phone (Player 2 taps the top half), and a steady 60 fps on a
  mid-range phone rather than a desktop GPU.
- **The share text.** The Daily Road result uses emoji (🚗💨 🫏💥 🟩✨💥⬜).
  Headless test browsers have no emoji font and show boxes; check it pastes
  well into WhatsApp, Telegram, X and iMessage.
- **Real players.** The tuning numbers come from a scripted player with a
  0.42 s reaction time (`e2e/drive.playtest.ts`). A few real players on
  phone and keyboard would show whether Normal, the Road Trip curve and the
  Daily Road finish rate feel right. Speeds live in `DIFFICULTY_RULES`
  (`engine/modes.ts`) and in each leg (`engine/routes.ts`).

## 2. Polish

- **Garage preview.** The preview is a flat strip of sky, grass and road.
  Draw it with the look of a route, animate it gently, and show the chosen
  trail streaming behind the car (`ui/garage-screen.ts`).
- **CGA without WebGL.** The four-colour filter is a WebGL shader; the
  Canvas 2D fallback in `shared/fx` ignores it. Either hide the option when
  WebGL is missing, or add a slower CPU version for that case.
- **A quality setting.** The canvas is capped at 2× device pixels
  (`MAX_PIXEL_RATIO` in `render/stage.ts`). On a weak phone, drop to 1×
  and thin out the scenery automatically when frames take too long.
- **Haptics.** A short buzz on a crash and a tick on a near miss, with
  `navigator.vibrate` where it exists (Android), off with reduced motion.
- **The passing donkey in Chase.** A donkey passing beside the car looms
  large at the edge of the screen for a moment. It is kept on purpose (it
  sells the near miss), but it could fade out a little sooner
  (`collectHazards` in `render/chase-view.ts`).

## 3. Features the deterministic engine makes easy

A run is fully described by its seed and the steps on which the player
pressed. The playtests already replay runs this way in the browser, so
these ideas need little new engine work.

- **A ghost car.** Save the presses of your best Endless run, or of today's
  Daily Road, and draw a see-through car driving them alongside you. The
  engine can run the ghost's copy of the road in parallel; only the drawing
  is new.
- **Challenge links.** Put the seed and the presses in a link
  (`?seed=…&run=…`). A friend opens it and races your ghost on the same
  road. No server needed, the same idea as Skyline Showdown's prompt 004.
- **Crash replay.** After a crash, offer a two-second replay from a second
  camera. The Frame is rebuilt from engine state, so any view can replay it.
- **A CPU donkey.** Let one player try Donkey vs Driver against a donkey
  that feints and commits late. The donkey player's input is a single
  button (`steerDonkey` and `toggleDropLane` in `engine/duel.ts`), so a
  small "donkey brain", like the autopilot for the driver, is enough.
- **A gentle mode.** A slower Road Trip for younger or less practised
  players, clearly marked, with its own stars so it does not devalue the
  real ones.

## 4. More game

- **New routes.** A coastal road (sea spray, gulls, a lighthouse sweep at
  dusk) or a festival road with lanterns. "How to extend" in
  [ARCHITECTURE.md](ARCHITECTURE.md) lists every file a route touches.
- **New hazards.** A donkey cart two lanes long for a beat, a gate that
  swings open on the beat, a donkey that turns round halfway. Each one goes
  through the planner's feasibility check (`engine/planner.ts`), so it
  cannot become unfair.
- **A twist per boss.** Every stubborn herd works the same way today. Each
  route's boss could have its own: a herd in fog, a herd on the beat, a
  herd that shuffles once.
- **Music that answers you.** Add layers to the song as the combo grows,
  and drop them on a crash (`audio/music.ts`).
- **More to earn.** Seasonal hats, a badge for each route's boss without a
  crash, and new secret badges (`pass.manifest.ts`).

## 5. Infrastructure

- **Skyline's daily.** Prompt 004 plans a Daily Skyline. It can use
  `shared/daily` (seeds, the first-run log, streaks, the calendar grid,
  sharing) instead of building its own; see ADR 0009.
- **Visual checks in CI.** The `screens` project renders every mode, view
  and route. Comparing those images with approved ones in CI would catch
  art regressions that no unit test sees.
- **All three browsers in CI.** The determinism check passes in Chromium,
  Firefox and WebKit, but only when run by hand. Running it on every change
  keeps the Daily Road and any future challenge links honest.
- **Other languages.** Every word on screen is English. Gathering the
  strings in one place would allow other languages, Indonesian first.
- **Play offline.** A service worker would let the game run on a phone
  without a connection. It would apply to the whole arcade, so it deserves
  its own ADR.
