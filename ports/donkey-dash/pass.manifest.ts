import { definePassManifest, glyphs, type EmblemPen } from '@shared/pass/manifest';

/** A donkey's head in profile: long face, two tall ears, one unbothered eye. */
function donkeyHead(pen: EmblemPen) {
  pen.path('M24 12c-3 7-3 14 1 19M31 10c1 8 0 15-3 20', { stroke: 'ink', width: 5 });
  pen.path('M20 30c6-6 18-5 24 3l8 12c3 5-1 10-7 9l-15-2c-7-1-12-8-10-22z');
  pen.circle(33, 36, 2.6, { fill: 'face' });
  pen.circle(46, 50, 1.8, { fill: 'face' });
}

function carrot(pen: EmblemPen) {
  pen.path('M22 44 44 22c4 4 4 9 0 13L29 50c-4 2-9-1-7-6z', { fill: 'accent' });
  pen.path('M43 21c1-6 5-9 10-9-1 5-4 9-10 9zM43 21c-2-5 0-10 4-13 2 5 0 10-4 13z');
  pen.path('M30 36l4 4M26 42l3 3', { stroke: 'face', width: 2 });
}

function car(pen: EmblemPen) {
  pen.path('M12 40l4-12c1-3 3-5 7-5h18c4 0 6 2 7 5l4 12v8H12z');
  pen.path('M20 30l2-4h20l2 4z', { fill: 'face' });
  pen.circle(20, 48, 5, { fill: 'accent' });
  pen.circle(44, 48, 5, { fill: 'accent' });
}

export default definePassManifest({
  game: 'donkey-dash',
  badges: [
    {
      id: 'donkey-loses',
      name: 'Donkey Loses!',
      description: 'Reached the top of the road in Classic Duel. Just like 1981, only shinier.',
      hint: 'Dodge eleven donkeys in a row in Classic Duel.',
      tier: 'bronze',
      emblem: glyphs.flag,
    },
    {
      id: 'close-shave',
      name: 'Close Shave',
      description: 'Left a donkey’s lane at the very last moment. It did not blink.',
      hint: 'Stay in a donkey’s lane until the last moment, then switch.',
      tier: 'bronze',
      emblem: glyphs.wind,
    },
    {
      id: 'hee-haw-hundred',
      name: 'Hee-Haw Hundred',
      description: 'A hundred donkeys dodged, and not one of them looked impressed.',
      hint: 'Dodge 100 donkeys, in any mode.',
      tier: 'bronze',
      target: 100,
      emblem: donkeyHead,
    },
    {
      id: 'carrot-cake',
      name: 'Carrot Cake',
      description: 'Fifty carrots collected. The donkeys have noticed.',
      hint: 'Collect 50 carrots.',
      tier: 'bronze',
      target: 50,
      emblem: carrot,
    },
    {
      id: 'mud-bath',
      name: 'Mud Bath',
      description: 'Dodged a donkey with your wheels deep in the mud. Splendid, and filthy.',
      hint: 'Dodge a donkey while your car is in a mud patch.',
      tier: 'bronze',
      emblem: (pen) => {
        pen.path('M10 42c6-6 12 2 18-2s10-8 16-3 8 5 10 3v10H10z');
        pen.circle(22, 30, 4, { fill: 'accent' });
        pen.circle(36, 24, 3, { fill: 'accent' });
        pen.circle(46, 32, 2.5, { fill: 'accent' });
      },
    },
    {
      id: 'mind-made-up',
      name: 'Make Up Your Mind',
      description: 'Ten hesitant donkeys dodged. They are still thinking about it.',
      hint: 'Dodge 10 hesitant donkeys, the ones that wobble between lanes.',
      tier: 'bronze',
      target: 10,
      emblem: glyphs.question,
    },
    {
      id: 'three-lanes',
      name: 'Three’s a Crowd',
      description: 'Got through a three-lane stretch without a scratch. One button, three lanes.',
      hint: 'Drive through a three-lane stretch without crashing.',
      tier: 'bronze',
      emblem: (pen) => {
        pen.rect(12, 10, 40, 44, { radius: 4 });
        pen.path('M25 14v8M25 28v8M25 42v8M39 14v8M39 28v8M39 42v8', {
          stroke: 'face',
          width: 3,
        });
        pen.circle(32, 46, 4, { fill: 'accent' });
      },
    },
    {
      id: 'first-leg',
      name: 'Learner’s Permit',
      description: 'Finished your first Road Trip leg. The open road is yours.',
      hint: 'Finish any leg of Road Trip.',
      tier: 'bronze',
      emblem: car,
    },
    {
      id: 'early-bird',
      name: 'Early Bird',
      description: 'Drove your first Daily Road. Same road as everyone, all day long.',
      hint: 'Drive a scored Daily Road.',
      tier: 'bronze',
      emblem: glyphs.calendar,
    },
    {
      id: 'on-the-beat',
      name: 'On the Beat',
      description: 'Twenty-five lane switches right on the beat. The donkeys tapped a hoof.',
      hint: 'Switch lanes on the beat 25 times, with the rhythm bonus on.',
      tier: 'bronze',
      target: 25,
      emblem: (pen) => {
        pen.path('M24 46V16l22-5v29', { stroke: 'ink', width: 4 });
        pen.circle(19, 46, 6);
        pen.circle(41, 40, 6, { fill: 'accent' });
      },
    },
    {
      id: 'whisker-master',
      name: 'Whisker Master',
      description: 'Fifty near misses of Whisker or closer. Your nerves are made of carrots.',
      hint: 'Make 50 near misses rated Whisker! or Hee-haw-some!',
      tier: 'silver',
      target: 50,
      emblem: (pen) => {
        glyphs.wind(pen);
        pen.star(46, 16, 7, 3, 4, { fill: 'accent' });
      },
    },
    {
      id: 'combo-five',
      name: 'Hee-Haw-Some Streak',
      description: 'Built a ×5 combo of near misses in a row. Showing off, and it worked.',
      hint: 'Chain near misses until the combo reaches ×5.',
      tier: 'silver',
      emblem: glyphs.flame,
    },
    {
      id: 'herd-immunity',
      name: 'Herd Immunity',
      description: 'Threaded a stubborn herd from first donkey to last.',
      hint: 'Finish the third leg of any Road Trip route.',
      tier: 'silver',
      emblem: glyphs.shield,
    },
    {
      id: 'zero-harmed',
      name: 'Zero Donkeys Harmed',
      description: 'A whole route without a single crash. Every donkey went home happy.',
      hint: 'Earn the no-crash star on all three legs of a Road Trip route.',
      tier: 'silver',
      emblem: glyphs.heart,
    },
    {
      id: 'daily-driver',
      name: 'Daily Driver',
      description: 'Seven Daily Roads in a row. The donkeys set their clocks by you.',
      hint: 'Drive the Daily Road seven days in a row.',
      tier: 'silver',
      emblem: glyphs.clock,
    },
    {
      id: 'long-haul',
      name: 'Long Haul',
      description: 'Three kilometres in a single Endless run, and still not tired.',
      hint: 'Drive 3,000 m in one Endless run.',
      tier: 'silver',
      emblem: glyphs.mountain,
    },
    {
      id: 'clean-daily',
      name: 'Clean Sheet',
      description: 'Finished a Daily Road without one crash. Frame it.',
      hint: 'Reach the finish of a scored Daily Road without crashing.',
      tier: 'silver',
      emblem: glyphs.check,
    },
    {
      id: 'donkey-supreme',
      name: 'Donkey Supreme',
      description: 'Won Donkey vs Driver with the final point scored as the donkey. Hee-haw.',
      hint: 'In Donkey vs Driver, win the match with a crash while you play the donkey.',
      tier: 'silver',
      emblem: glyphs.crown,
    },
    {
      id: 'road-tripper',
      name: 'Road Tripper',
      description: 'All five routes driven, from the farm to the summit. What a trip.',
      hint: 'Finish every leg of all five Road Trip routes.',
      tier: 'gold',
      emblem: glyphs.trophy,
    },
    {
      id: 'all-stars',
      name: 'Forty-Five Stars',
      description: 'Every star on every leg. The donkeys have started a fan club.',
      hint: 'Earn all three stars on all fifteen Road Trip legs.',
      tier: 'gold',
      emblem: glyphs.star,
    },
    {
      id: 'flawless-duel',
      name: 'Donkey Whisperer',
      description: 'Won Classic Duel without giving the Donkey a single point.',
      hint: 'Win a Classic Duel match without a crash.',
      tier: 'gold',
      emblem: glyphs.medal,
    },
    {
      id: 'stubborn',
      name: 'Stubborn',
      description: 'Lost ten points in a row to the Donkey. It admires your persistence.',
      tier: 'secret',
      emblem: donkeyHead,
    },
    {
      id: 'retro-rig',
      name: 'Retro Rig',
      description: 'Played a whole Classic Duel in four colours. Cyan, magenta and nostalgia.',
      tier: 'secret',
      emblem: glyphs.gamepad,
    },
    {
      id: 'worth-it',
      name: 'Worth It',
      description: 'Crashed moments after grabbing a carrot. It was a very good carrot.',
      tier: 'secret',
      emblem: carrot,
    },
    {
      id: 'photo-finish',
      name: 'Photo Finish',
      description: 'Crossed a finish line on your very last life. The donkeys demand a recount.',
      tier: 'secret',
      emblem: glyphs.burst,
    },
  ],
  cosmetics: [
    { id: 'body-beetle', name: 'Bubble Beetle', kind: 'Car body', unlock: { level: 2 } },
    { id: 'paint-mint', name: 'Mint', kind: 'Paint', unlock: { level: 3 } },
    { id: 'hat-cowboy', name: 'Cowboy hat', kind: 'Donkey hat', unlock: { level: 4 } },
    { id: 'trail-hearts', name: 'Hearts', kind: 'Trail', unlock: { level: 5 } },
    { id: 'horn-bell', name: 'Bicycle bell', kind: 'Horn', unlock: { level: 6 } },
    { id: 'body-pickup', name: 'Farm Pickup', kind: 'Car body', unlock: { level: 7 } },
    { id: 'paint-cherry', name: 'Cherry', kind: 'Paint', unlock: { level: 8 } },
    { id: 'hat-party', name: 'Party hat', kind: 'Donkey hat', unlock: { level: 10 } },
    { id: 'body-camper', name: 'Camper Van', kind: 'Car body', unlock: { level: 12 } },
    { id: 'paint-lilac', name: 'Lilac', kind: 'Paint', unlock: { level: 14 } },
    { id: 'trail-notes', name: 'Music notes', kind: 'Trail', unlock: { level: 16 } },
    { id: 'body-roadster', name: 'Roadster', kind: 'Car body', unlock: { level: 20 } },
    { id: 'paint-butter', name: 'Butter', kind: 'Paint', unlock: { badge: 'carrot-cake' } },
    { id: 'horn-toot', name: 'Toot-toot', kind: 'Horn', unlock: { badge: 'first-leg' } },
    { id: 'trail-sparkles', name: 'Sparkles', kind: 'Trail', unlock: { badge: 'combo-five' } },
    {
      id: 'hat-flower',
      name: 'Flower crown',
      kind: 'Donkey hat',
      unlock: { badge: 'zero-harmed' },
    },
    { id: 'hat-top', name: 'Top hat', kind: 'Donkey hat', unlock: { badge: 'donkey-supreme' } },
    { id: 'horn-air', name: 'Air horn', kind: 'Horn', unlock: { badge: 'long-haul' } },
    { id: 'paint-midnight', name: 'Midnight', kind: 'Paint', unlock: { badge: 'daily-driver' } },
    { id: 'trail-rainbow', name: 'Rainbow', kind: 'Trail', unlock: { badge: 'whisker-master' } },
    { id: 'horn-hee-haw', name: 'Hee-haw horn', kind: 'Horn', unlock: { badge: 'stubborn' } },
    { id: 'paint-chrome', name: 'Chrome', kind: 'Paint', unlock: { badge: 'road-tripper' } },
    { id: 'hat-crown', name: 'Golden crown', kind: 'Donkey hat', unlock: { badge: 'all-stars' } },
  ],
  stats: [
    { key: 'runs', label: 'Runs and duels played' },
    { key: 'dodged', label: 'Donkeys dodged' },
    { key: 'nearMisses', label: 'Near misses' },
    { key: 'carrots', label: 'Carrots collected' },
    { key: 'bestEndless', label: 'Longest Endless run', unit: 'm' },
    { key: 'bestCombo', label: 'Best near-miss combo' },
    { key: 'stars', label: 'Road Trip stars', unit: '/ 45' },
    { key: 'bestStreak', label: 'Best Daily streak', unit: 'days' },
  ],
});
