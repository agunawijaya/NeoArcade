# Mind the Ox — follow-up ideas

Ideas for after the first release, from building and playtesting the port.
None of them is promised; each says why it is worth doing and where in the
code it would start.

**Top picks**, if there is time for only a few:

1. Have real people play the campaign and tune it on what they say
   (section 1).
2. Teach the scripted pilot to win every chapter, so a test can prove each
   one is winnable and the title demo looks like a good pilot (section 2).
3. Ghosts and challenge links for the Daily Sortie, which the deterministic
   engine makes almost free (section 4).

## 1. Check it on real players and real hardware

Everything so far was tested in desktop browsers, in phone-sized emulation
and with a scripted pilot. That leaves gaps.

- **Campaign difficulty.** The scripted pilot loses most chapters: it rams
  computer planes, flies into birds and is caught by flak and wreckage
  (`npx tsx ports/mind-the-ox/dev/fly-bot.ts` prints the causes). That says
  more about the bot than about the game, but nobody has yet flown all
  eight chapters by hand. Watch a few players; if the later chapters are a
  wall, the levers are in `game/campaign.ts` (each chapter's defenders,
  twist and goals) and `game/modes.ts` (`CHAPTER_DEFENDERS`), not in the
  engine.
- **Dogfight levels.** Easy to Brutal were tuned against the scripted
  pilot (ADR 0032). Check that Normal feels fair and Brutal sharp to a
  person with a keyboard and to one with a gamepad.
- **Gamepads.** The bindings exist (`game/controls.ts`, `ui/menu-nav.ts`)
  but have not met a real pad. Check one pad alone, two pads in a split
  screen, menus with the D-pad, and a pad plugged in mid-game.
- **Phones.** Try iOS Safari and Android Chrome: sound starting on the first
  tap, the safe areas, the size of the on-screen buttons (`game/touch.ts`)
  on a small phone, and a steady frame rate in Diorama 3D.
- **Split screen on small screens.** At 1280 × 720 each half is under 300
  pixels tall and the planes are small. A closer camera per half
  (`render/side/camera.ts`) may read better.

## 2. A better test pilot

`engine/bot.ts` flies well enough to bomb, refuel and fight, and it now
turns back over the top instead of diving. It still:

- flies straight through computer planes it has not seen coming; borrowing
  the computer pilots' ram check (`wouldRam` in `engine/cpu.ts`) would help;
- ignores flocks; a bird-avoiding nudge, like the oxen clearance it has for
  bombs, would cut most of its splats;
- has no plan for flak beyond flying above the guns' reach.

Once it wins every chapter on some seeds, `e2e/campaign.playtest.ts` can
assert that, and `engine/map.ts`'s `mapProblems` gains a second line of
defence: not just "every target is reachable" but "a pilot reached them".

## 3. Classic 1984

- **CGA palette 0.** 1984's PCs could also show green, red and brown. A
  second four-colour palette is one more `Palette` in `render/palette.ts`
  and a choice in Settings.
- **CGA in Diorama 3D.** The four-colour picture is drawn by the side view;
  the diorama only filters its painted scene. A flat diorama palette, like
  the side view's black screen and white ground line, would match.

## 4. Daily Sortie

- **Ghosts.** The engine is deterministic and the Daily Sortie's seed is the
  same for everyone, so a run is just its controls. Recording them would
  let a player race yesterday's best, or a friend's.
- **Challenge links.** The same recording, packed into a URL, as Skyline
  Showdown does with its shots.

## 5. Something new

- **Weather.** Rain that cuts visibility and slicks the runway, alongside
  the fog banks and the crosswind the campaign already has.
- **A second campaign** per theme, written in each theme's voice like the
  first (`game/campaign.ts`), now that the twists exist.
- **Colour-blind liveries.** The two sides are told apart by colour and
  insignia; a high-contrast pair in `render/liveries.ts` would make them
  easier to tell apart for everyone.

## 6. Carrier Ops

- **A scripted pilot that fights at sea.** The test pilot wins Deck Trials,
  Coastal Strike, Convoy Escort and every dogfight and intercept sortie,
  but loses the anti-ship, raid and carrier missions to flak and to flying
  into ships. Teaching it to stand off from a battleship's guns, drop from
  further out and break away low would let the playtest prove every
  mission winnable by flying, not only by the generator's checks.
- **Fore-and-aft wires.** *Furious*'s 1918 deck had wires running along
  it, not across, to hold a landed plane straight rather than stop it. A
  "1918 deck" setting could fly that way, for the curious.
- **A flying-off platform on a battleship's turret**, as some ships
  carried in 1918: one launch, no way back but to ditch.
- **Seaplanes.** Floats, a take-off from the water and a crane to hoist
  them back aboard a seaplane carrier.
- **A second At Sea campaign** in the Cyan vs Magenta and Airshow voices,
  as the land campaign could have.
