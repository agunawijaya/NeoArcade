# Credits

## The original

*Sopwith*, by **David L. Clark**, BMB Compuscience Canada, 1984 (revised
in 1985, 1987 and 1996). The edition studied for this port calls itself
*SOPWITH (The Author's Edition)*, © 1984–2003 David L. Clark, and was
released by its author under the **GNU General Public License, version 2
or later**, in 2003. Its source is widely mirrored online; the copy we
read is kept, unchanged, in this repository under `sources/Sopwith/`.

Inspired by Sopwith by David L. Clark, BMB Compuscience Canada, 1984.

## This port

Mind the Ox is a **new program**, written from scratch for NeoArcade. The
1984 source was read to understand how the game behaves; that behaviour
was described in our own words
([behaviour notes](../../docs/games/mind-the-ox.md)) and the game was then
written fresh from the notes.

**No code or data was copied** from the original: no source, translated or
otherwise; not its ground table, its target layouts, its sprite or font
bitmaps, its title screen, its sound tables or its random table. Every
battlefield is generated from a seed or drawn by hand for the campaign;
every picture is drawn by code (Canvas 2D and three.js); every sound is
synthesized. See [ADR 0026](../../docs/adr/0026-mind-the-ox-clean-room.md).

"Sopwith" is the original's name and appears here only as a credit.
Aircraft in the Great War theme are described by type ("a Camel-type
scout"), never by a manufacturer's name; all pilots are fictional.

## Built with

- [three.js](https://threejs.org/) (MIT) for the Diorama 3D view.
- NeoArcade's shared library (`shared/`): input, audio, loop, storage,
  post-effects, daily challenges, the Arcade Pass.
