import { definePassManifest, glyphs, type EmblemDrawer } from '@shared/pass/manifest';

/**
 * Skyline Showdown on the Arcade Pass. The badges, the wardrobe items that
 * badges and Pass levels unlock (the rest come from World Tour stars and
 * rivals, and live in the game's own save), and the stats on the profile.
 * Imports nothing but the manifest API, so the Hall can bundle it.
 */
const banana: EmblemDrawer = (pen) => {
  pen.path('M10 38c8 16 34 18 46-4-12 10-32 12-46 4z');
  pen.path('M14 40c10 8 26 8 36-2', { stroke: 'shine', width: 2, opacity: 0.8 });
  pen.path('M54 34l5-5', { stroke: 'ink', width: 4 });
  pen.circle(12, 39, 2.5, { fill: 'accent' });
};

const skyline: EmblemDrawer = (pen) => {
  pen.rect(6, 34, 10, 22).rect(18, 22, 12, 34).rect(32, 28, 10, 28).rect(44, 14, 14, 42);
  pen.rect(47, 19, 3, 4, { fill: 'face' }).rect(52, 19, 3, 4, { fill: 'face' });
  pen.rect(21, 27, 3, 4, { fill: 'face' }).rect(25, 27, 3, 4, { fill: 'face' });
  pen.circle(30, 11, 5, { fill: 'accent' });
};

const drone: EmblemDrawer = (pen) => {
  pen.rect(12, 26, 40, 14, { radius: 3 });
  pen.rect(16, 29, 32, 8, { radius: 2, fill: 'accent' });
  pen.path('M18 26v-6M46 26v-6M10 20h16M38 20h16', { stroke: 'ink', width: 3 });
  pen.path('M32 40v8', { stroke: 'ink', width: 3 });
};

export default definePassManifest({
  game: 'skyline-showdown',
  badges: [
    {
      id: 'first-banana',
      name: 'First Banana',
      description: 'Won your first round. The city will never be the same.',
      hint: 'Win a round.',
      tier: 'bronze',
      emblem: banana,
    },
    {
      id: 'sharpshooter',
      name: 'Sharpshooter',
      description: 'Hit with the very first throw of a round. No warm-up needed.',
      hint: 'Hit your opponent with your first throw of a round.',
      tier: 'bronze',
      emblem: glyphs.target,
    },
    {
      id: 'calm-before-the-storm',
      name: 'Calm Before the Storm',
      description: 'Stilled the air with Calm Air, then won the round with that very throw.',
      hint: 'Win a round with a throw made under Calm Air.',
      tier: 'bronze',
      emblem: glyphs.wind,
    },
    {
      id: 'tri-hard',
      name: 'Tri-Hard',
      description: 'Three bananas, one bullseye.',
      hint: 'Hit your opponent with a Tri-Banana.',
      tier: 'bronze',
      emblem: glyphs.burst,
    },
    {
      id: 'dressed-up',
      name: 'Dressed to Impress',
      description: 'Changed your look in the Wardrobe. Very dapper.',
      hint: 'Change anything in the Wardrobe.',
      tier: 'bronze',
      emblem: glyphs.crown,
    },
    {
      id: 'singing-in-the-rain',
      name: 'Singing in the Rain',
      description: 'Beat the monsoon and Drizzle in Jakarta.',
      hint: 'Win the Jakarta stage of the World Tour.',
      tier: 'bronze',
      emblem: glyphs.wind,
    },
    {
      id: 'hat-trick',
      name: 'Hat Trick',
      description: 'Three rounds in a row, and the city is running out of rooftops.',
      hint: 'Win three rounds in a row in one match.',
      tier: 'bronze',
      emblem: glyphs.flame,
    },
    {
      id: 'old-friends',
      name: 'Old Friends',
      description: 'Beat a tour rival again in a Quick Match. They took it well.',
      hint: 'Win a Quick Match against a rival you have beaten on the World Tour.',
      tier: 'bronze',
      emblem: glyphs.heart,
    },
    {
      id: 'sunburn',
      name: 'Sunburn',
      description: 'Hit the sun ten times. It has stopped smiling at you.',
      hint: 'Hit the sun 10 times.',
      tier: 'silver',
      target: 10,
      emblem: glyphs.sun,
    },
    {
      id: 'demolition',
      name: 'Demolition',
      description: 'A hundred craters carved into skylines. Urban planners weep.',
      hint: 'Blast 100 craters into buildings.',
      tier: 'silver',
      target: 100,
      emblem: skyline,
    },
    {
      id: 'drone-whisperer',
      name: 'Drone Whisperer',
      description: 'Won in Tokyo without ever feeding the drone a banana.',
      hint: 'Win the Tokyo stage without hitting the drone once.',
      tier: 'silver',
      emblem: drone,
    },
    {
      id: 'moonshot',
      name: 'Moonshot',
      description: 'Won a round on the Moon with your very first throw. One small throw…',
      hint: 'On the Moon, win a round with your first throw of it.',
      tier: 'silver',
      emblem: glyphs.moon,
    },
    {
      id: 'uphill-battle',
      name: 'Uphill Battle',
      description: 'Hit a gorilla standing far above you. Gravity was not on your side.',
      hint: 'Hit a gorilla standing at least 5 m higher than you.',
      tier: 'silver',
      emblem: glyphs.mountain,
    },
    {
      id: 'long-distance',
      name: 'Long Distance',
      description: 'Hit from across the widest gap the city allows.',
      hint: 'Hit a gorilla at least 32 m away.',
      tier: 'silver',
      emblem: glyphs.crosshair,
    },
    {
      id: 'bank-shot',
      name: 'Bank Shot',
      description: 'Bounced a banana off a building and still hit. Pure geometry.',
      hint: 'Hit with a banana that bounced first.',
      tier: 'silver',
      emblem: glyphs.loop,
    },
    {
      id: 'comeback-kid',
      name: 'Comeback Kid',
      description: 'Two points down, and you won anyway.',
      hint: 'Win a match after trailing by two points.',
      tier: 'silver',
      emblem: glyphs.bolt,
    },
    {
      id: 'globetrotter',
      name: 'Globetrotter',
      description: 'Finished the Earth chapter of the World Tour. Next stop: space.',
      hint: 'Beat the New York stage.',
      tier: 'silver',
      emblem: glyphs.planet,
    },
    {
      id: 'landlord-evicted',
      name: 'Eviction Notice',
      description: 'Beat The Landlord in New York without taking a single hit.',
      hint: 'Win the New York stage without being hit.',
      tier: 'silver',
      emblem: glyphs.key,
    },
    {
      id: 'red-planet',
      name: 'Red Planet Regular',
      description: 'Finished the Mars chapter. The dust will be in your fur for weeks.',
      hint: 'Beat the Olympus Summit stage.',
      tier: 'silver',
      emblem: glyphs.rocket,
    },
    {
      id: 'rival-collector',
      name: 'Rival Collector',
      description: 'Beat every rival on the World Tour. They have formed a support group.',
      hint: 'Beat all ten World Tour rivals.',
      tier: 'gold',
      emblem: glyphs.medal,
    },
    {
      id: 'three-star-general',
      name: 'Three-Star General',
      description: 'Every star on the World Tour. All forty-five of them.',
      hint: 'Earn all three stars on every World Tour stage.',
      tier: 'gold',
      emblem: glyphs.star,
    },
    {
      id: 'eye-of-the-storm',
      name: 'Eye of the Storm',
      description: 'Beat Colossus at the end of the World Tour. The skyline is yours.',
      hint: 'Finish the World Tour.',
      tier: 'gold',
      xp: 250,
      emblem: glyphs.trophy,
    },
    {
      id: 'brutal-honesty',
      name: 'Brutal Honesty',
      description: 'Beat the CPU on Brutal in a Quick Match. It is re-evaluating its life.',
      hint: 'Win a Quick Match against a Brutal CPU.',
      tier: 'gold',
      emblem: glyphs.skull,
    },
    {
      id: 'untouchable',
      name: 'Untouchable',
      description: 'Won a boss stage without being hit once.',
      hint: 'Win any World Tour boss stage without being hit.',
      tier: 'gold',
      emblem: glyphs.shield,
    },
    {
      id: 'oops',
      name: 'Oops',
      description: 'Hit yourself. Physics sends its regards.',
      tier: 'secret',
      emblem: glyphs.question,
    },
    {
      id: 'butterfingers',
      name: 'Butterfingers',
      description: 'Dropped a banana on your own head. It was slippery. Allegedly.',
      tier: 'secret',
      emblem: glyphs.hourglass,
    },
    {
      id: 'total-eclipse',
      name: 'Total Eclipse',
      description: 'One banana through the sun and into your opponent. The sun saw everything.',
      tier: 'secret',
      emblem: glyphs.eye,
    },
    {
      id: 'drone-delivery',
      name: 'Drone Delivery',
      description: 'Fed the drone three bananas in one match. It thanks you for your business.',
      tier: 'secret',
      emblem: drone,
    },
  ],
  cosmetics: [
    { id: 'dance-jump', name: 'Jump for joy', kind: 'Victory dance', unlock: { level: 2 } },
    { id: 'hat-headphones', name: 'Headphones', kind: 'Headwear', unlock: { level: 3 } },
    { id: 'trail-hearts', name: 'Hearts', kind: 'Trail', unlock: { level: 4 } },
    { id: 'fur-rose', name: 'Rose', kind: 'Fur', unlock: { level: 5 } },
    { id: 'boom-pixel', name: 'Pixel burst', kind: 'Explosion', unlock: { level: 6 } },
    { id: 'eyes-3d', name: '3D glasses', kind: 'Eyewear', unlock: { level: 7 } },
    { id: 'banana-pixel', name: 'Pixel', kind: 'Banana skin', unlock: { level: 8 } },
    { id: 'dance-spin', name: 'Spin', kind: 'Victory dance', unlock: { level: 9 } },
    { id: 'hat-propeller', name: 'Propeller cap', kind: 'Headwear', unlock: { level: 10 } },
    { id: 'trail-neon', name: 'Neon', kind: 'Trail', unlock: { level: 12 } },
    { id: 'banana-candy', name: 'Candy stripe', kind: 'Banana skin', unlock: { level: 15 } },
    { id: 'neck-cape', name: 'Cape', kind: 'Bandana & scarf', unlock: { level: 18 } },
    { id: 'boom-stars', name: 'Starburst', kind: 'Explosion', unlock: { level: 20 } },
    { id: 'hat-party', name: 'Party hat', kind: 'Headwear', unlock: { badge: 'first-banana' } },
    { id: 'banana-fire', name: 'Fire', kind: 'Banana skin', unlock: { badge: 'sunburn' } },
    { id: 'banana-chrome', name: 'Chrome', kind: 'Banana skin', unlock: { badge: 'demolition' } },
    { id: 'eyes-visor', name: 'Neon visor', kind: 'Eyewear', unlock: { badge: 'drone-whisperer' } },
    { id: 'trail-rainbow', name: 'Rainbow', kind: 'Trail', unlock: { badge: 'moonshot' } },
    { id: 'fur-gilded', name: 'Gilded', kind: 'Fur', unlock: { badge: 'globetrotter' } },
    {
      id: 'dance-flex',
      name: 'Flex',
      kind: 'Victory dance',
      unlock: { badge: 'landlord-evicted' },
    },
    { id: 'hat-crown', name: 'Crown', kind: 'Headwear', unlock: { badge: 'rival-collector' } },
    {
      id: 'neck-medal',
      name: 'Gold medal',
      kind: 'Bandana & scarf',
      unlock: { badge: 'three-star-general' },
    },
    { id: 'hat-halo', name: 'Storm halo', kind: 'Headwear', unlock: { badge: 'eye-of-the-storm' } },
  ],
  stats: [
    { key: 'matchesPlayed', label: 'Matches played' },
    { key: 'matchesWon', label: 'Matches won' },
    { key: 'roundsWon', label: 'Rounds won' },
    { key: 'hits', label: 'Direct hits' },
    { key: 'throws', label: 'Bananas thrown' },
    { key: 'longestHit', label: 'Longest hit', unit: 'm' },
    { key: 'sunHits', label: 'Sun hits' },
    { key: 'craters', label: 'Craters carved' },
    { key: 'stars', label: 'Tour stars' },
    { key: 'rivalsBeaten', label: 'Rivals beaten' },
  ],
});
