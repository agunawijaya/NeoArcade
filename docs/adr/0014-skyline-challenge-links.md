# ADR 0014 — Challenge links: a shot and its setting in a few dozen bytes

- **Status:** accepted
- **Date:** 2026-09-29
- **Context:** Skyline Showdown, challenge links (prompt 004); relies on
  [ADR 0012](0012-skyline-determinism.md) and
  [ADR 0013](0013-skyline-daily-seeding.md)

## Context

A player who lands a great shot, in any mode, should be able to send it to
a friend as a link. Opening it shows the shot, then gives the friend one
throw from the very same moment: hit what it hit, or land closer. There is
no server, the link must be short enough to paste into a chat, survive
being mangled, and carry nothing personal unless the player asks it to.

## Decision

**What a link carries.** Not the city, the wind or the paths: those are
rebuilt. A link carries where the round came from and every throw of that
round so far, the last one being the shot to match:

| Source | Fields |
|---|---|
| Quick Match | round seed, round number, world choice, power-ups on, who threw first, what each side held |
| World Tour | stage, round seed, round number, who threw first |
| Trick Shot | puzzle |
| Daily Skyline (practice) | day number |

Plus, for every link: the engine version, the wind when the round began
(a check that the round came out the same), the throws (angle in
hundredths of a degree, velocity, whether a held power-up was used), and a
nickname only if the player typed one for this challenge.

Replaying the round's earlier throws rebuilds everything exactly: craters,
the drone's position, gusts, lightning, balloons picked up. A CPU's throws
are recorded as numbers, so its planning never runs again.

**Angles in hundredths.** The engine itself rounds every angle to 0.01°
(velocity was already whole), so the throw a link carries is exactly the
throw that was made. Nothing a player aims by hand is finer than 0.1°.

**Layout** (`src/challenge/link.ts`), big-endian:

```
u8  engine version
u8  kind (bits 0–1) · has nickname (bit 2) · second player threw first (bit 3)
    quick: u32 round seed · u8 round · u8 world choice · u8 power-up mask · u8 held (3 + 3 bits)
    tour:  u8 stage · u32 round seed · u8 round
    trick: u8 puzzle
    daily: u16 day number
i8  wind at the start of the round
u8  throws, then per throw: u16 angle × 100 · u16 velocity (9 bits) + used power-up (bit 9)
    [u8 length + UTF-8 nickname, at most 16 characters]
u32 FNV-1a checksum of everything before it
```

It travels as unpadded base64url after `#c=`: a fragment, so it never
reaches a server, not even the one serving the page. A Trick Shot link is
18 characters; a Quick Match link three throws into a round is 38.

**Checks, in order.** Bad characters, a wrong length, a failed checksum,
unknown kinds, worlds, power-ups, stages or puzzles, anything left over, or
a round whose rebuilt wind differs from the link's: the link is *damaged*,
and the page says so kindly. Only the last throw of a round may end it; an
earlier throw that ends it also means damaged.

**Versions.** `src/engine/version.ts` keeps `ENGINE_VERSION` and, for every
version so far, the *rules* it played by, pinned by the engine fingerprint
(ADR 0012) in a test. A link from:

- this version plays;
- an older version with the same rules plays exactly as it did;
- an older version with other rules is explained: made on an earlier
  version whose bananas flew differently, ask for a fresh link;
- a newer version asks the player to reload the page.

The rules cover everything a link rebuilds: the engine, the stages' twists,
the puzzles and the daily generator. Changing any of them means a new
version with new rules.

**Judging.** Both shots are previews of the same moment, so the match is
never changed. If the challenger hit (for a puzzle: solved it), the friend
must hit too: *matched*. If the challenger missed, the friend wins by
hitting or by coming down strictly closer to the target (the other gorilla,
or the puzzle's last target), compared as squared distances so every
browser agrees: *beaten*. Landing within 1.5 units of the challenger's own
landing is a *copycat*. The friend may try again as often as they like;
the Arcade Pass pays for the first win only. The result screen offers a
reply link: the same round and history, with the friend's shot last.

**Privacy.** Nothing about the player goes into a link unless they type a
nickname for that challenge, and the field says so. A nickname is cleaned
on both ends (no control or formatting characters, spaces collapsed, 16
characters) and always shown as text.

## Consequences

- Links are small because they carry intent, not data. The price is the
  version rule: a change to how bananas fly, to a stage's twists or to a
  puzzle retires old links, gently.
- A link is a spoiler by nature. The game never offers one for a scored
  daily; from practice, sharing is the player's call.
- Anyone can craft a link by hand. That is harmless: every field is
  checked, the nickname is plain text, and a crafted shot only makes a
  challenge harder or easier.
