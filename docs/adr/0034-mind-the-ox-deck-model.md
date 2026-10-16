# ADR 0034 — Mind the Ox's carrier deck: a moving runway measured from the stern

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Mind the Ox, Carrier Ops (prompt 016); follows
  [ADR 0033](0033-mind-the-ox-sea-and-ships.md)

## Context

A carrier is a home base that moves: it steams, turns at the ends of its
patrol, rises and falls on the swell, and can be hit and sunk. Planes must
take off down its deck, land on it from astern and be caught by arresting
wires, be refuelled and rearmed on it, and be pushed to a parking spot.
The model had to be simple enough to explain to players, deterministic,
and the same for people, the computer's pilots and the autopilot.

## Decision

1. **Everything on deck is measured from the stern**, along the ship's
   heading: the wires 12–30 units from the stern (9–38 with the landing
   assist), the first parking spot at 44 and one every 12 behind it. A
   plane on deck keeps an offset and a speed over the deck; the ship
   carries it as it steams, turns and heaves (`engine/deck.ts`).
2. **Take-off** is a roll down the deck at full throttle, the wind over the
   deck (the ship's own way plus a headwind) added to the plane's own
   speed; off the bow a plane settles a little, more the slower it is, and
   one too slow or pushed nose down goes into the sea.
3. **Landing** is decided in one place, `landOnDeck`: lined up, hook over
   the deck, closing on the ship no faster than a window and sinking no
   faster than another. Inside both, a wire catches it (or the first wire,
   for a plane down short). Past the wires, or on a deck fouled by damage
   or the ship turning, it is a bolter: full throttle and off the bow again.
   Too hard, the plane is wounded; much too hard, or misaligned, it goes
   over the side. The closure window is for the first round's planes; later
   rounds' faster planes get a window as much wider. A plane that touches
   down with the throttle wide open takes no wire at any pace: a
   **touch-and-go**, off the bow under power. It is the pilot's own choice,
   made with the throttle they already have, so no new control is needed;
   the trap names its wire, and the third is the one a good landing takes
   (the Airshow's spot landing).
4. **The landing assist** (on by default for Easy and Normal missions)
   holds the deck steady, widens the wires and the sink window, and lights
   the wires green. Without it the deck rises and falls with the sea state.
   A map is only offered if its deck can be landed on in that sea
   (`deckLandable`).
5. **The autopilot flies a circuit**: downwind past the ship at circuit
   height, out to the end of the downwind leg, round over the top onto the
   ship's heading, down a glide path to the middle of the wires holding a
   steady closure, and never opening the throttle to the stop, so it never
   touches and goes by accident. Missed, too high or with the deck closed,
   it flies on past the bow and round again. Its downwind leg ends short of
   a coast rising astern, and every leg keeps clear of the ground ahead, so
   the H key never flies a plane into a cliff. The same code lands the
   computer's pilots.
5a. **A fouled deck is patched.** A carrier that has lost 60 % of its hit
   points takes no plane and launches none; its crew patch it, slowly,
   until it can again, and no further. Before, a deck fouled with planes
   parked on it was shut for good: a mission that could no longer end.
6. **The island is scenery.** The carrier's bridge, funnel and mast stand
   on the starboard edge, clear of the centreline the planes use; they are
   drawn, not collided with. In the diorama the island fades while a plane
   is behind it, so a plane is never hidden.
7. **A carrier's patrol keeps room to launch**: its ends lie at least 520
   units from the mountains, so a plane launched as the ship comes to the
   end of its run can climb away (`mapProblems`).

## Consequences

- Land airfields are untouched: their runways, parking and the 1984
  autopilot snap are the same code as before.
- Measured with `dev/landing-rates.ts` (forty autopilot approaches per
  case from seeded starts): 87–100 % trapped across every sea state, with
  and without the assist, at the first and third rounds' speeds, before
  and after the touch-and-go rule.
- The deck model is in the HOW-TO-PLAY guide in players' words, and in the
  architecture with its numbers.
