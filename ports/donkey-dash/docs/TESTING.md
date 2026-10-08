# Testing Donkey Dash

Two ways to check the game: play it yourself in a browser, and run the
automated tests. Run every command from the repository root. Examples are
for PowerShell; in bash, set environment variables with `NAME=value` before
the command instead of `$env:NAME = 'value'`.

## 1. Play it

### Development server

```powershell
npm run dev
```

Open **http://localhost:5173/ports/donkey-dash/**. The Hall is at
http://localhost:5173/hall/. Code changes reload the page as you save.

### The production build

To play exactly what gets shipped, including the Donkey Dash card in the
Arcade Hall:

```powershell
npm run build
npm run preview
```

- The Hall: **http://localhost:4173/**
- The game: **http://localhost:4173/donkey-dash/**

### On a phone

```powershell
npm run dev -- --host
```

Open the "Network" address it prints, from a phone on the same Wi-Fi, and
add `ports/donkey-dash/` to the end. Try it upright and sideways.

### What to try

- **Controls.** Space or any other key switches lanes. So does a click or tap
  on the road, or A on a gamepad. Esc pauses.
- **Cameras.** Switch between Chase, Classic and Isometric from the pause
  menu. A donkey should come into view at the same moment in all three.
- **Classic Duel.** Dodge eleven donkeys in a row to reach the top. Crash on
  purpose to see the four-corner crash and BOOM!.
- **Road Trip.** Start with Farm Lanes, then Morning Chores. Finish a leg
  and check its stars and that the next leg opens.
- **Endless.** Play until all three cars are gone. Your run should appear in
  the best scores.
- **Daily Road.** Drive today's road, then check the share text, the streak
  and the calendar. A second run is only practice.
- **Donkey vs Driver.** Player 1 uses the left half of the keyboard (for
  example A), Player 2 the right half (for example L). Player 2 moves the pink
  drop marker, then the donkey, until it reaches the pink commit line. P, M
  and H belong to Player 2 here, so they must not pause, mute or honk.
- **Settings.** Try the CGA and CRT screen filters, the Daylight and Golden
  hour themes, Relaxed and Frantic, and points to win.
- **Garage.** Locked parts say how to earn them. Fitted parts show on the
  car and on the Player 2 donkey.
- **Reduced motion.** Turn on "reduce motion" in your system settings. The
  title should appear without animation and the demo road should stay still.

### Handy tricks

- **The same road every time.** Add a seed to the address, such as
  `?seed=42`. Endless and both duels then play out the same way for the same
  presses.
- **Everything is saved in localStorage.** In DevTools, open Application,
  then Local Storage. The game's keys start with `neoarcade:donkey-dash:`:

  | Key | Holds |
  |---|---|
  | `settings` | Every setting |
  | `theme` | The chosen theme |
  | `progress` | Road Trip stars and bests |
  | `daily` | Daily Road results, one per day |
  | `garage` | The fitted parts |
  | `endless-relaxed`, `endless-normal`, `endless-frantic` | Endless best scores |

  Delete `daily` to drive today's Daily Road again as a scored run. Delete
  every key to start from scratch. The Arcade Pass (XP, levels, badges) is
  `neoarcade:pass:profile`, shared by every game in the arcade.
- **Open every route.** Paste this in the DevTools console, then reload. It
  marks every leg as finished:

  ```js
  const legs = {};
  for (const route of ['farm', 'mountain', 'desert', 'night', 'snow']) {
    for (let leg = 0; leg < 3; leg++) {
      legs[`${route}-${leg}`] = { stars: [true, leg !== 1, leg === 0], bestScore: 1000 };
    }
  }
  localStorage.setItem(
    'neoarcade:donkey-dash:progress',
    JSON.stringify({ version: 1, legs, donkeyStreak: 0 }),
  );
  ```

## 2. Automated tests

| Command | What it checks | Time |
|---|---|---|
| `npm test` | Every unit test in the repository: the engine, the fairness of the three views, settings, progress, daily sharing, the Arcade Pass reporter, music | Under a minute |
| `npx playwright test -c ports/donkey-dash --project=smoke --project=phone` | The game in a desktop browser and a phone-sized one: start-up, input, pause, the Daily Road, the duels, two players, locked routes and garage parts, themes | 3 to 4 minutes |
| `npx playwright test -c ports/donkey-dash --project=determinism-chromium` | The engine computes the same runs in the browser as in Node, bit for bit | Seconds |
| `npx playwright test -c ports/donkey-dash --project=playtest` | A scripted player with a phone player's reactions: survival times, finish rates, and taps and keys on the real page ending exactly where Node says | About a minute |
| `npm run lint` | ESLint and Prettier over the whole repository | Under a minute |
| `npm run docs:check` | Every Mermaid diagram in the docs renders | About a minute |

The Playwright tests build the game and start a preview server by
themselves. They reuse a server that is already running on port 4173, so if
you have `npm run preview` open from an older build, run `npm run build`
first or stop that server.

### Firefox and WebKit

The determinism check also runs in Firefox and WebKit. If Playwright's
browsers live in their own folder (on this machine Firefox and WebKit are in
`E:\Applications\playwright`), point Playwright at it:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'E:\Applications\playwright'
npx playwright test -c ports/donkey-dash --project=determinism-firefox --project=determinism-webkit
Remove-Item Env:PLAYWRIGHT_BROWSERS_PATH
```

### The playtest numbers

The playtests note their results (median Endless run per difficulty, Daily
Road finish rate, Road Trip finishes per leg) as annotations. To read them,
use the HTML report:

```powershell
npx playwright test -c ports/donkey-dash --project=playtest --reporter=html
npx playwright show-report
```

### Screenshots of everything

Every mode, camera, route and screen size, reached by really playing, in
about 2 minutes:

```powershell
$env:SCREENSHOT_DIR = 'E:\Projects\NeoArcade\screens-check'
npx playwright test -c ports/donkey-dash --project=screens
Remove-Item Env:SCREENSHOT_DIR
```

The JPEGs land in that folder. Without `SCREENSHOT_DIR` they go to
`ports/donkey-dash/test-results/screens/`.

## When something fails

- Playwright keeps a trace of every failed test. Open it with the command
  it prints, `npx playwright show-trace <path to trace.zip>`, to step
  through the page frame by frame.
- "Executable doesn't exist" means Playwright cannot find a browser. Set
  `PLAYWRIGHT_BROWSERS_PATH` as in Firefox and WebKit above, or install the
  missing one with `npx playwright install <browser>` (with that variable
  set, if you keep browsers in their own folder).
- If a browser test fails but the game looks fine, check that the preview
  server on port 4173 is serving a fresh build.
