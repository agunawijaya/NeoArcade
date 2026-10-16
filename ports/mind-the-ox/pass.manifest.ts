import { definePassManifest, glyphs, type EmblemPen } from '@shared/pass/manifest';

/** A biplane head on: two wings, struts, the round cowling and a propeller. */
function biplane(pen: EmblemPen) {
  pen.rect(10, 22, 44, 5, { radius: 2 });
  pen.rect(13, 38, 38, 5, { radius: 2 });
  pen.path('M20 27v11M44 27v11', { stroke: 'ink', width: 3 });
  pen.circle(32, 33, 7);
  pen.circle(32, 33, 3, { fill: 'accent' });
  pen.path('M32 18v30', { stroke: 'shine', width: 2 });
}

/** The ox, side on, head down to the grass: square body, short horns, a swishing tail. */
function ox(pen: EmblemPen) {
  pen.path('M14 30c0-5 4-8 9-8h16c6 0 10 3 11 8l2 10-4 1-2-7v12h-5V36H24v10h-5V34l-3 8-3-1z');
  pen.path('M50 28c3-1 6 1 6 4l-1 6c-1 3-4 3-6 1z');
  pen.path('M52 26l4-4M50 25l-2-4', { stroke: 'ink', width: 2.5 });
  pen.path('M14 30c-3 2-4 6-3 10', { stroke: 'ink', width: 2 });
  pen.circle(54, 31, 1.4, { fill: 'face' });
  pen.circle(18, 40, 2.2, { fill: 'accent' });
}

/** A bird's splat on round goggles. */
function goggles(pen: EmblemPen) {
  pen.circle(22, 34, 11);
  pen.circle(42, 34, 11);
  pen.path('M33 33h-2', { stroke: 'ink', width: 4 });
  pen.circle(22, 34, 7, { fill: 'face' });
  pen.circle(42, 34, 7, { fill: 'face' });
  pen.path('M38 28c3-3 8-2 9 2 3 1 3 5 0 6 0 4-5 5-7 2-4 1-6-3-4-5-2-2-1-5 2-5z', {
    fill: 'accent',
  });
}

/** A fuel gauge with its needle on empty. */
function fuelGauge(pen: EmblemPen) {
  pen.circle(32, 34, 19, { stroke: 'ink', width: 4 });
  pen.path('M17 40a16 16 0 0 1 30 0', { stroke: 'shine', width: 2 });
  pen.path('M32 34l-12 6', { stroke: 'accent', width: 4 });
  pen.circle(32, 34, 3);
}

/** A round fuel tank with its danger band, and a burst behind it. */
function depot(pen: EmblemPen) {
  pen.star(32, 30, 22, 12, 9, { fill: 'accent' });
  pen.rect(20, 26, 24, 22, { radius: 5 });
  pen.rect(20, 34, 24, 4, { fill: 'face' });
}

/** A loop drawn in the sky with a little plane at the top. */
function loop(pen: EmblemPen) {
  pen.path('M14 48c10 0 18-6 18-16a10 10 0 1 0-10 10h28', { stroke: 'ink', width: 4 });
  pen.polygon(
    [
      [46, 38],
      [54, 42],
      [46, 46],
    ],
    { fill: 'accent' },
  );
}

/** A searchlight beam with a crescent moon. */
function searchlight(pen: EmblemPen) {
  pen.polygon(
    [
      [30, 54],
      [36, 54],
      [54, 12],
      [40, 10],
    ],
    { fill: 'shine' },
  );
  pen.rect(26, 50, 14, 6, { radius: 2 });
  pen.path('M18 12a9 9 0 1 0 9 13 7 7 0 1 1-9-13z', { fill: 'accent' });
}

/** A carrier's flight deck seen a little from above, with the island and a wire across it. */
function deck(pen: EmblemPen) {
  pen.polygon(
    [
      [8, 40],
      [56, 40],
      [52, 48],
      [12, 48],
    ],
    { fill: 'ink' },
  );
  pen.rect(38, 26, 8, 14, { radius: 1 });
  pen.rect(41, 18, 3, 8);
  pen.path('M18 40l4-6M26 40l4-6', { stroke: 'shine', width: 2 });
}

/** A plane's hook on a wire, the wire bowed back by the catch. */
function trap(pen: EmblemPen) {
  deck(pen);
  pen.path('M10 36c8 6 14 6 22 0', { stroke: 'accent', width: 3 });
}

/** Round again: an arrow looping off the bow. */
function bolter(pen: EmblemPen) {
  deck(pen);
  pen.path('M50 36c8-12 2-24-12-24S16 20 16 28', { stroke: 'accent', width: 3 });
  pen.polygon(
    [
      [11, 26],
      [21, 26],
      [16, 33],
    ],
    { fill: 'accent' },
  );
}

/** A life ring on the waves. */
function lifeRing(pen: EmblemPen) {
  pen.path('M6 46c6-4 10-4 16 0s10 4 16 0 10-4 16 0', { stroke: 'shine', width: 3 });
  pen.circle(32, 32, 14, { stroke: 'ink', width: 7 });
  pen.path('M32 18v6M32 40v6M18 32h6M40 32h6', { stroke: 'accent', width: 4 });
}

/** A torpedo running, its wake behind it. */
function torpedo(pen: EmblemPen) {
  pen.rect(20, 28, 30, 8, { radius: 4 });
  pen.polygon([
    [20, 32],
    [12, 26],
    [12, 38],
  ]);
  pen.path('M8 44h44', { stroke: 'shine', width: 3 });
  pen.circle(52, 32, 3, { fill: 'accent' });
}

/** A crescent over a deck lit at its edges. */
function nightDeck(pen: EmblemPen) {
  pen.path('M24 10a10 10 0 1 0 10 15 8 8 0 1 1-10-15z', { fill: 'shine' });
  deck(pen);
  for (const x of [14, 24, 34, 44, 52]) pen.circle(x, 44, 1.6, { fill: 'accent' });
}

/** An airship's shed, its doors open on the long envelope inside. */
function shed(pen: EmblemPen) {
  pen.path('M8 50V30c0-10 10-16 24-16s24 6 24 16v20z');
  pen.path('M14 50V32c0-6 8-10 18-10s18 4 18 10v18', { fill: 'face' });
  pen.rect(18, 30, 28, 10, { radius: 5, fill: 'accent' });
}

/** A carrier going down by the bow. */
function sinking(pen: EmblemPen) {
  pen.path('M6 48c6-4 10-4 16 0s10 4 16 0 10-4 16 0', { stroke: 'shine', width: 3 });
  pen.polygon([
    [10, 30],
    [52, 40],
    [50, 46],
    [12, 38],
  ]);
  pen.rect(36, 24, 6, 10, { fill: 'accent' });
}

/** A shield over the deck. */
function deckShield(pen: EmblemPen) {
  deck(pen);
  pen.path('M32 8l14 5v9c0 8-6 13-14 16-8-3-14-8-14-16v-9z', { fill: 'accent' });
}

/** An anchor with a crown over it. */
function anchor(pen: EmblemPen) {
  pen.path('M32 20v30M24 26h16', { stroke: 'ink', width: 4 });
  pen.path('M16 40c2 8 8 11 16 11s14-3 16-11', { stroke: 'ink', width: 4 });
  pen.circle(32, 17, 4, { stroke: 'ink', width: 3 });
  pen.polygon(
    [
      [22, 12],
      [26, 4],
      [32, 10],
      [38, 4],
      [42, 12],
    ],
    { fill: 'accent' },
  );
}

export default definePassManifest({
  game: 'mind-the-ox',
  badges: [
    {
      id: 'into-the-sun',
      name: 'Into the Sun',
      description:
        'Won a round and flew off into the sun. Somewhere, a band should have been playing.',
      hint: 'Win a round in any mode.',
      tier: 'bronze',
      emblem: glyphs.sun,
    },
    {
      id: 'splat',
      name: 'Splat!',
      description: 'A bird met your goggles at ninety miles an hour. Neither of you enjoyed it.',
      hint: 'Fly into a bird.',
      tier: 'bronze',
      emblem: goggles,
    },
    {
      id: 'wheels-down',
      name: 'Wheels Down',
      description: 'Brought her down on your own runway, rolled to a stop and taxied in. Textbook.',
      hint: 'Land on your own runway: level, throttle closed, not too fast.',
      tier: 'bronze',
      emblem: biplane,
    },
    {
      id: 'loop-the-loop',
      name: 'Loop the Loop',
      description: 'Took the nose all the way round and came out the right way up.',
      hint: 'Fly a full loop in under six seconds.',
      tier: 'bronze',
      emblem: loop,
    },
    {
      id: 'scattershot',
      name: 'Scattershot',
      description: 'Flew through a whole flock. Eight very cross birds in every direction.',
      hint: 'Break up a flock of birds.',
      tier: 'bronze',
      emblem: glyphs.burst,
    },
    {
      id: 'daily-sortie',
      name: 'Daily Sortie',
      description: 'Flew the same battlefield as everyone else today. Compare notes.',
      hint: 'Fly a Daily Sortie.',
      tier: 'bronze',
      emblem: glyphs.calendar,
    },
    {
      id: 'wingman',
      name: 'Wingman',
      description: 'Won a round side by side with a friend. Share the sun.',
      hint: 'Win a co-op round in Two players.',
      tier: 'bronze',
      emblem: glyphs.heart,
    },
    {
      id: 'mind-the-ox',
      name: 'Mind the Ox',
      description: 'A whole campaign chapter and not one ox was harmed. They did not notice.',
      hint: 'Win a campaign chapter without harming an ox.',
      tier: 'silver',
      emblem: ox,
    },
    {
      id: 'running-on-fumes',
      name: 'Running on Fumes',
      description: 'Landed at home with the tank all but dry. The mechanics went pale.',
      hint: 'Land on your own runway with under 2% fuel left.',
      tier: 'silver',
      emblem: fuelGauge,
    },
    {
      id: 'depot-buster',
      name: 'Depot Buster',
      description: 'Twenty-five fuel depots, twenty-five very large bangs.',
      hint: 'Destroy 25 fuel depots.',
      tier: 'silver',
      target: 25,
      emblem: depot,
    },
    {
      id: 'sharpshooter',
      name: 'Sharpshooter',
      description: 'Fifty enemy planes brought down. They talk about you in their mess.',
      hint: 'Bring down 50 enemy planes.',
      tier: 'silver',
      target: 50,
      emblem: glyphs.crosshair,
    },
    {
      id: 'crater-maker',
      name: 'Crater Maker',
      description: 'A hundred craters dug with bombs. The farmers have opinions.',
      hint: 'Dig 100 craters with your bombs.',
      tier: 'silver',
      target: 100,
      emblem: glyphs.target,
    },
    {
      id: 'like-1984',
      name: 'Like It’s 1984',
      description: 'Won a round of Classic 1984 on sixteen headings. The CGA monitor approves.',
      hint: 'Win a round of Classic 1984.',
      tier: 'silver',
      emblem: glyphs.star,
    },
    {
      id: 'lantern-dodger',
      name: 'Lantern Dodger',
      description: 'Won the night raid without a searchlight ever finding you.',
      hint: 'Win Lantern Raid without being caught in a searchlight.',
      tier: 'silver',
      emblem: searchlight,
    },
    {
      id: 'daily-streak',
      name: 'Dawn Patrol',
      description: 'A Daily Sortie seven days running. Up with the larks, and the oxen.',
      hint: 'Fly the Daily Sortie 7 days in a row.',
      tier: 'silver',
      target: 7,
      emblem: glyphs.clock,
    },
    {
      id: 'head-to-head',
      name: 'Head to Head',
      description: 'Beat a friend in Versus. Be gracious about it. Or not.',
      hint: 'Win a Versus match in Two players.',
      tier: 'silver',
      emblem: glyphs.flag,
    },
    {
      id: 'ace',
      name: 'Ace',
      description: 'Beat a Brutal pilot in a dogfight. The old one-pixel trick did not save them.',
      hint: 'Win a Dogfight against a Brutal pilot.',
      tier: 'gold',
      emblem: glyphs.medal,
    },
    {
      id: 'last-chapter',
      name: 'Last Chapter',
      description: 'Won all eight chapters of the campaign. The war, or the show, is over.',
      hint: 'Win every campaign chapter.',
      tier: 'gold',
      emblem: glyphs.trophy,
    },
    {
      id: 'full-marks',
      name: 'Full Marks',
      description: 'Every star in the campaign, all twenty-four of them.',
      hint: 'Earn all 24 campaign stars.',
      tier: 'gold',
      emblem: glyphs.crown,
    },
    {
      id: 'trap',
      name: 'Trap!',
      description:
        'Caught a wire on a carrier’s deck. The deck crew cheered, then got on with the next one.',
      hint: 'Land on a carrier and catch an arresting wire.',
      tier: 'bronze',
      emblem: trap,
    },
    {
      id: 'bolter',
      name: 'Bolter',
      description:
        'Missed every wire and went round again, full throttle off the bow. Happens to the best.',
      hint: 'Touch down on a carrier past the wires and go round again.',
      tier: 'bronze',
      emblem: bolter,
    },
    {
      id: 'wet-feet',
      name: 'Wet Feet',
      description:
        'Ditched beside a destroyer and was fished out by its boat. A blanket and a hot drink.',
      hint: 'Ditch near one of our destroyers and get picked up.',
      tier: 'bronze',
      emblem: lifeRing,
    },
    {
      id: 'fish-in-the-water',
      name: 'Fish in the Water',
      description:
        'A torpedo of yours ran true and found a ship. They saw the column from the bridge.',
      hint: 'Hit a ship with a torpedo.',
      tier: 'silver',
      emblem: torpedo,
    },
    {
      id: 'night-owl-at-sea',
      name: 'Night Owl at Sea',
      description: 'Came aboard at night with nothing but the deck lights to go by.',
      hint: 'Catch a wire on a carrier at night.',
      tier: 'silver',
      emblem: nightDeck,
    },
    {
      id: 'tondern',
      name: 'Tondern',
      description:
        'Burned the airship sheds at the far end of the coast, as Furious’s Camels did in July 1918.',
      hint: 'Complete The Raid in At Sea.',
      tier: 'silver',
      emblem: shed,
    },
    {
      id: 'carrier-killer',
      name: 'Carrier Killer',
      description: 'Sank the enemy carrier. Its fighters have nowhere left to land.',
      hint: 'Sink an enemy carrier.',
      tier: 'gold',
      emblem: sinking,
    },
    {
      id: 'not-on-my-deck',
      name: 'Not On My Deck',
      description: 'Stopped every bomber of a raid. Not one bomb on the carrier.',
      hint: 'Win an intercept without a single bomb landing on our ships.',
      tier: 'gold',
      emblem: deckShield,
    },
    {
      id: 'fleet-admiral',
      name: 'Fleet Admiral',
      description: 'Completed all eight At Sea missions, from deck trials to the carrier duel.',
      hint: 'Complete every At Sea mission.',
      tier: 'gold',
      emblem: anchor,
    },
    {
      id: 'option-x',
      name: 'Option X',
      description:
        'Found the switch that 1984 left out of its help screen. Missiles and starbursts are yours.',
      tier: 'secret',
      emblem: glyphs.key,
    },
    {
      id: 'grounded',
      name: 'Grounded',
      description: 'Stalled straight into your own airfield. The ground crew applauded, slowly.',
      tier: 'secret',
      emblem: glyphs.skull,
    },
    {
      id: 'moo',
      name: 'Moo',
      description: 'You hit an ox. It will not forget, and neither will your score.',
      tier: 'secret',
      emblem: ox,
    },
  ],
  cosmetics: [
    { id: 'paint-racing-green', name: 'Racing green', kind: 'Paint', unlock: { level: 2 } },
    { id: 'scarf-crimson', name: 'Crimson scarf', kind: 'Scarf', unlock: { level: 3 } },
    { id: 'paint-sky-blue', name: 'Sky blue', kind: 'Paint', unlock: { level: 4 } },
    { id: 'scarf-sky', name: 'Sky scarf', kind: 'Scarf', unlock: { level: 5 } },
    { id: 'motif-stripes', name: 'Stripes', kind: 'Wing motif', unlock: { level: 6 } },
    { id: 'contrail-white', name: 'White', kind: 'Contrail', unlock: { level: 7 } },
    { id: 'paint-sunflower', name: 'Sunflower', kind: 'Paint', unlock: { level: 8 } },
    { id: 'motif-chevrons', name: 'Chevrons', kind: 'Wing motif', unlock: { level: 10 } },
    { id: 'scarf-violet', name: 'Violet scarf', kind: 'Scarf', unlock: { level: 12 } },
    { id: 'contrail-crimson', name: 'Crimson', kind: 'Contrail', unlock: { level: 14 } },
    { id: 'scarf-gold', name: 'Gold scarf', kind: 'Scarf', unlock: { badge: 'into-the-sun' } },
    { id: 'scarf-emerald', name: 'Emerald scarf', kind: 'Scarf', unlock: { badge: 'mind-the-ox' } },
    { id: 'paint-crimson', name: 'Crimson', kind: 'Paint', unlock: { badge: 'ace' } },
    { id: 'paint-midnight', name: 'Midnight', kind: 'Paint', unlock: { badge: 'lantern-dodger' } },
    { id: 'paint-silver', name: 'Silver dope', kind: 'Paint', unlock: { badge: 'last-chapter' } },
    { id: 'motif-checks', name: 'Checks', kind: 'Wing motif', unlock: { badge: 'sharpshooter' } },
    { id: 'motif-sunburst', name: 'Sunburst', kind: 'Wing motif', unlock: { badge: 'full-marks' } },
    { id: 'contrail-sky', name: 'Sky', kind: 'Contrail', unlock: { badge: 'daily-streak' } },
    { id: 'contrail-gold', name: 'Gold', kind: 'Contrail', unlock: { badge: 'depot-buster' } },
    { id: 'contrail-rainbow', name: 'Rainbow', kind: 'Contrail', unlock: { badge: 'option-x' } },
    { id: 'scarf-navy', name: 'Navy scarf', kind: 'Scarf', unlock: { badge: 'trap' } },
    { id: 'paint-sea-grey', name: 'Sea grey', kind: 'Paint', unlock: { badge: 'fleet-admiral' } },
  ],
  stats: [
    { key: 'rounds', label: 'Rounds flown' },
    { key: 'roundsWon', label: 'Rounds won' },
    { key: 'planesDowned', label: 'Enemy planes brought down' },
    { key: 'targets', label: 'Targets destroyed' },
    { key: 'depots', label: 'Fuel depots destroyed' },
    { key: 'landings', label: 'Landings at home' },
    { key: 'oxen', label: 'Oxen harmed' },
    { key: 'stars', label: 'Campaign stars', unit: '/ 24' },
    { key: 'traps', label: 'Deck landings' },
    { key: 'shipsSunk', label: 'Ships sunk' },
    { key: 'seaStars', label: 'At Sea stars', unit: '/ 24' },
    { key: 'classicBest', label: 'Best Classic 1984 score' },
    { key: 'bestStreak', label: 'Best Daily streak', unit: 'days' },
  ],
});
