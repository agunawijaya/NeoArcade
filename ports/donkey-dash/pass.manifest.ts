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

/** Two lanes, the right one bending into the left: the shifting road. */
function merge(pen: EmblemPen) {
  pen.path('M22 54V10', { stroke: 'ink', width: 5 });
  pen.path('M42 54V38c0-9-5-14-13-18', { stroke: 'ink', width: 5 });
  pen.polygon(
    [
      [22, 16],
      [34, 14],
      [28, 25],
    ],
    { fill: 'accent' },
  );
}

/** A traffic cone, with its white band. */
function cone(pen: EmblemPen) {
  pen.rect(14, 47, 34, 6, { radius: 2 });
  pen.polygon(
    [
      [20, 47],
      [42, 47],
      [33, 12],
      [29, 12],
    ],
    { fill: 'accent' },
  );
  pen.polygon(
    [
      [25, 35],
      [37, 35],
      [35, 26],
      [27, 26],
    ],
    { fill: 'face' },
  );
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
      id: 'lane-changer',
      name: 'Lane Changer',
      description:
        'Got out of twenty-five closing lanes before their barriers. The cones thank you.',
      hint: 'Move out of a lane that is ending, before its barrier, 25 times.',
      tier: 'bronze',
      target: 25,
      emblem: merge,
    },
    {
      id: 'gotcha',
      name: 'Gotcha!',
      description: 'Boxed your rival in, right in front of trouble. Nothing personal.',
      hint: 'In Rival Driver, make the other car crash by blocking its way out.',
      tier: 'bronze',
      emblem: glyphs.target,
    },
    {
      id: 'slip-through',
      name: 'Slip Through',
      description: 'Surged Ahead and cut across your rival’s bonnet. Excuse me, coming through.',
      hint: 'In Rival Driver, surge Ahead and change lanes in front of the other car.',
      tier: 'bronze',
      emblem: (pen) => {
        car(pen);
        pen.path('M8 14h20M14 22h14', { stroke: 'accent', width: 3 });
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
      id: 'merge-master',
      name: 'Merge Master',
      description: 'Ten merges in the last fifth of a second before a barrier. Zip!',
      hint: 'Leave a closing lane within 0.2 s of its barrier, 10 times.',
      tier: 'silver',
      target: 10,
      emblem: (pen) => {
        cone(pen);
        pen.star(49, 16, 9, 3.5, 4, { fill: 'shine' });
      },
    },
    {
      id: 'slippery',
      name: 'Slippery',
      description: 'Slipped out of three traps in one Rival match. Butter would be proud.',
      hint: 'In one Rival Driver match, get away three times after the other car blocks you.',
      tier: 'silver',
      emblem: (pen) => {
        pen.path('M32 9c11 15 17 23 17 31a17 17 0 0 1-34 0c0-8 6-16 17-31z');
        pen.path('M24 41a8 8 0 0 0 8 8', { stroke: 'face', width: 3 });
      },
    },
    {
      id: 'door-shut',
      name: 'Door Shut',
      description: 'Sat in your rival’s Level slot as trouble came. No way back, no hard feelings.',
      hint: 'In Rival Driver, take the Level slot behind a car riding Ahead, and make it crash.',
      tier: 'silver',
      emblem: (pen) => {
        pen.rect(18, 10, 28, 44, { fill: 'accent' });
        pen.rect(23, 15, 18, 34, { fill: 'face' });
        pen.circle(36, 33, 2.5);
      },
    },
    {
      id: 'front-runner',
      name: 'Front Runner',
      description: 'Ten rows passed riding Ahead in one round. Less road, more nerve.',
      hint: 'In one round of Rival Driver, pass 10 rows of donkeys while riding Ahead.',
      tier: 'silver',
      emblem: (pen) => {
        pen.path('M32 8 50 30H40v26H24V30H14z');
        pen.path('M24 46h16', { stroke: 'accent', width: 4 });
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
      id: 'rival-ready',
      name: 'Rival Ready',
      description: 'Beat the CPU on Hard. Vera Vroom has already asked for a rematch.',
      hint: 'Win a Rival Driver match against the CPU on Hard or Brutal.',
      tier: 'gold',
      emblem: (pen) => {
        car(pen);
        pen.path('M46 6v20', { stroke: 'ink', width: 3 });
        pen.rect(46, 6, 12, 9, { fill: 'accent' });
      },
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
      id: 'road-rage',
      name: 'Road Rage',
      description: 'Lost a Rival match to Dotty Dawdle on Easy. She waved the whole way.',
      tier: 'secret',
      emblem: glyphs.bolt,
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
    { id: 'trail-cones', name: 'Traffic cones', kind: 'Trail', unlock: { badge: 'merge-master' } },
    { id: 'paint-racing', name: 'Racing green', kind: 'Paint', unlock: { badge: 'rival-ready' } },
    { id: 'paint-lime', name: 'Turbo lime', kind: 'Paint', unlock: { badge: 'front-runner' } },
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
    { key: 'merges', label: 'Closing lanes left in time' },
    { key: 'traps', label: 'Rival traps sprung' },
    { key: 'aheadRows', label: 'Rows passed riding Ahead' },
    { key: 'rivalWins', label: 'Rival Driver wins' },
  ],
});
