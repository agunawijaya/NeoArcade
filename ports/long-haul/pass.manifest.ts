import { definePassManifest, glyphs, type EmblemDrawer } from '@shared/pass/manifest';

/**
 * Long Haul on the Arcade Pass: the badges, the rig paints that badges and
 * Pass levels unlock, and the stats on the profile. Imports nothing but the
 * manifest API, so the Hall can bundle it.
 */
const truck: EmblemDrawer = (pen) => {
  pen.rect(6, 22, 32, 20, { radius: 2 });
  pen.path('M38 28h10l8 8v6H38z');
  pen.rect(42, 30, 6, 5, { fill: 'face' });
  pen.circle(14, 46, 5).circle(28, 46, 5).circle(50, 46, 5);
  pen
    .circle(14, 46, 2, { fill: 'face' })
    .circle(28, 46, 2, { fill: 'face' })
    .circle(50, 46, 2, { fill: 'face' });
  pen.path('M10 30h24', { stroke: 'accent', width: 3 });
};

const orange: EmblemDrawer = (pen) => {
  pen.circle(32, 36, 17);
  pen.path('M26 28c3-3 7-4 10-3', { stroke: 'shine', width: 3 });
  pen.path('M32 19c4-8 12-9 16-7-4 6-10 8-16 7z', { fill: 'accent' });
};

const envelope: EmblemDrawer = (pen) => {
  pen.rect(10, 18, 44, 30, { radius: 3 });
  pen.path('M12 21l20 15 20-15', { stroke: 'face', width: 3 });
  pen.rect(42, 22, 8, 8, { fill: 'accent' });
};

const tunnel: EmblemDrawer = (pen) => {
  pen.path('M8 52V30a24 22 0 0 1 48 0v22z');
  pen.path('M18 52V32a14 13 0 0 1 28 0v20z', { fill: 'face' });
  pen.path('M32 52V40', { stroke: 'accent', width: 3 });
};

const cup: EmblemDrawer = (pen) => {
  pen.path('M14 26h30v14a11 11 0 0 1-11 11h-8a11 11 0 0 1-11-11z');
  pen.path('M44 30h4a6 6 0 0 1 0 12h-4', { stroke: 'ink', width: 4 });
  pen.path('M22 20c0-4 4-4 4-8M32 20c0-4 4-4 4-8', { stroke: 'accent', width: 3 });
};

const postcard: EmblemDrawer = (pen) => {
  pen.rect(8, 16, 48, 32, { radius: 2 });
  pen.rect(40, 20, 12, 12, { fill: 'accent' });
  pen.path('M14 24h20M14 31h20M14 38h14', { stroke: 'face', width: 3 });
};

const shield: EmblemDrawer = (pen) => {
  pen.path('M12 14q20-6 40 0v18q-2 18-20 26Q14 50 12 32z');
  pen.path('M12 14q20-6 40 0v8H12z', { fill: 'accent' });
  pen.path('M24 34h16M32 28v14', { stroke: 'face', width: 3 });
};

const snowflake: EmblemDrawer = (pen) => {
  pen.path('M32 10v44M13 21l38 22M13 43l38-22', { stroke: 'ink', width: 5 });
  pen.path('M26 14l6 6 6-6M26 50l6-6 6 6', { stroke: 'shine', width: 3 });
  pen.circle(32, 32, 5, { fill: 'accent' });
};

const tyre: EmblemDrawer = (pen) => {
  pen.circle(32, 32, 22);
  pen.circle(32, 32, 11, { fill: 'face' });
  pen.circle(32, 32, 5, { fill: 'accent' });
  pen.path('M32 10v6M32 48v6M10 32h6M48 32h6', { stroke: 'face', width: 3 });
};

const plate: EmblemDrawer = (pen) => {
  pen.circle(32, 34, 20);
  pen.circle(32, 34, 12, { fill: 'face' });
  pen.path('M18 16c2 4 6 4 8 0M38 16c2 4 6 4 8 0', { stroke: 'accent', width: 3 });
};

const radar: EmblemDrawer = (pen) => {
  pen.rect(10, 28, 24, 14, { radius: 3 });
  pen.path('M20 42l-4 12h8l2-12', { fill: 'ink' });
  pen.path('M40 26a10 10 0 0 1 0 18M46 20a18 18 0 0 1 0 30', { stroke: 'accent', width: 3 });
};

const pump: EmblemDrawer = (pen) => {
  pen.rect(14, 14, 24, 40, { radius: 4 });
  pen.rect(18, 19, 16, 10, { fill: 'face' });
  pen.path('M38 26h6l4 6v16a4 4 0 0 1-8 0v-8', { stroke: 'ink', width: 3 });
  pen.circle(26, 40, 4, { fill: 'accent' });
};

const bed: EmblemDrawer = (pen) => {
  pen.rect(8, 34, 48, 10, { radius: 2 });
  pen.path('M8 30v22M56 38v14', { stroke: 'ink', width: 4 });
  pen.rect(12, 28, 12, 7, { radius: 3, fill: 'accent' });
  pen.path('M38 14h8l-8 8h8M48 6h5l-5 5h5', { stroke: 'shine', width: 2 });
};

const rocks: EmblemDrawer = (pen) => {
  pen.polygon([
    [8, 52],
    [18, 30],
    [28, 36],
    [36, 18],
    [48, 34],
    [56, 52],
  ]);
  pen.circle(22, 46, 4, { fill: 'face' }).circle(40, 44, 5, { fill: 'face' });
  pen.path('M44 14h8M48 10v8', { stroke: 'accent', width: 3 });
};

export default definePassManifest({
  game: 'long-haul',
  badges: [
    {
      id: 'first-load',
      name: 'First Load',
      description: 'Delivered your first load. The dock foreman nodded. Almost a smile.',
      hint: 'Deliver a load in any mode.',
      tier: 'bronze',
      emblem: truck,
    },
    {
      id: 'coast-to-coast',
      name: 'Coast to Coast',
      description: 'Los Angeles to New York, the original run, all the way to the dock.',
      hint: 'Deliver a Single Haul from Los Angeles to New York.',
      tier: 'bronze',
      emblem: glyphs.flag,
    },
    {
      id: 'westbound',
      name: 'Westbound',
      description: 'New York to Los Angeles, chasing the sun and gaining an hour three times.',
      hint: 'Deliver a Single Haul from New York to Los Angeles.',
      tier: 'bronze',
      emblem: glyphs.sun,
    },
    {
      id: 'fresh-squeezed',
      name: 'Fresh Squeezed',
      description: 'A trailer of oranges delivered cold, whole and inside four days.',
      hint: 'Deliver a refrigerated load with no damage and nothing spoiled.',
      tier: 'bronze',
      emblem: orange,
    },
    {
      id: 'neither-snow-nor-rain',
      name: 'Neither Snow nor Rain',
      description: 'The mail got through. The postmaster paid on the spot.',
      hint: 'Deliver a load of U.S. Mail.',
      tier: 'bronze',
      emblem: envelope,
    },
    {
      id: 'good-work',
      name: 'G O O D   W O R K',
      description: 'More than $100 clear on a single trip, and the original’s stamp to prove it.',
      hint: 'Make a net profit over $100 on one trip.',
      tier: 'bronze',
      emblem: glyphs.check,
    },
    {
      id: 'holland-tunnel',
      name: 'Holland Tunnel',
      description: 'Under the Hudson and into Manhattan with a full trailer.',
      hint: 'Deliver a load to New York.',
      tier: 'bronze',
      emblem: tunnel,
    },
    {
      id: 'bottomless-cup',
      name: 'Bottomless Cup',
      description: 'Ten cups of truck-stop coffee. The waitresses know your order.',
      hint: 'Drink coffee at 10 truck stops.',
      tier: 'bronze',
      target: 10,
      emblem: cup,
    },
    {
      id: 'night-owl',
      name: 'Night Owl',
      description: 'Midnight to dawn behind the wheel, with only the CB for company.',
      hint: 'Drive every hour from midnight to 5 AM without stopping.',
      tier: 'bronze',
      emblem: glyphs.moon,
    },
    {
      id: 'daily-driver',
      name: 'Daily Driver',
      description: 'Drove a Daily Haul to the end. Same load as everyone, your own road.',
      hint: 'Finish a Daily Haul.',
      tier: 'bronze',
      emblem: glyphs.calendar,
    },
    {
      id: 'postcard-collector',
      name: 'Postcard Collector',
      description: 'Twenty-five postcards in the album. Wish you were here.',
      hint: 'Collect 25 postcards.',
      tier: 'silver',
      target: 25,
      emblem: postcard,
    },
    {
      id: 'smokeys-best-friend',
      name: 'Smokey’s Best Friend',
      description: 'Ten radar traps, ten friendly waves. Smokey has nothing to write.',
      hint: 'Pass 10 radar traps without a ticket.',
      tier: 'silver',
      target: 10,
      emblem: radar,
    },
    {
      id: 'iron-bladder',
      name: 'Iron Bladder',
      description: 'Six hundred miles without pulling in once. The coffee can wait.',
      hint: 'Drive 600 miles without stopping at a truck stop.',
      tier: 'silver',
      emblem: pump,
    },
    {
      id: 'blizzard-survivor',
      name: 'Blizzard Survivor',
      description: 'Three hours in a whiteout, and the load still arrived.',
      hint: 'Deliver a load after driving 3 hours in blizzards.',
      tier: 'silver',
      emblem: snowflake,
    },
    {
      id: 'rock-slide-napper',
      name: 'Rock Slide Napper',
      description: 'The road was closed, so you closed your eyes. Best sleep of the trip.',
      hint: 'Get two hours of sleep or more while a rock slide blocks the road.',
      tier: 'silver',
      emblem: rocks,
    },
    {
      id: 'right-on-time',
      name: 'Right on Time',
      description: 'Five loads of freight on the dock before they were due.',
      hint: 'Deliver freight on time 5 times.',
      tier: 'silver',
      target: 5,
      emblem: glyphs.clock,
    },
    {
      id: 'clean-run',
      name: 'Clean Run',
      description: 'Coast to coast without a ticket or a blowout. Textbook.',
      hint: 'Deliver a Single Haul with no tickets and no blowouts.',
      tier: 'silver',
      emblem: shield,
    },
    {
      id: 'early-bird',
      name: 'Early Bird',
      description: 'In before the due time, and the shipper added ten percent.',
      hint: 'Earn an early bonus on a Career load.',
      tier: 'silver',
      emblem: glyphs.coin,
    },
    {
      id: 'week-on-the-road',
      name: 'A Week on the Road',
      description: 'Seven Daily Hauls in seven days. Home is where the rig is.',
      hint: 'Reach a Daily Haul streak of 7.',
      tier: 'silver',
      emblem: glyphs.flame,
    },
    {
      id: 'fully-loaded',
      name: 'Fully Loaded',
      description: 'Every upgrade in the garage fitted to one rig.',
      hint: 'Fit all six upgrades in one career.',
      tier: 'gold',
      emblem: tyre,
    },
    {
      id: 'legend-of-the-docks',
      name: 'Legend of the Docks',
      description: 'Shippers ask for you by name. The long runs are all yours.',
      hint: 'Reach a reputation of 85 in a career.',
      tier: 'gold',
      emblem: glyphs.crown,
    },
    {
      id: 'fat-wallet',
      name: 'Fat Wallet',
      description: 'Twenty-five thousand dollars in the bank, in 1982 money.',
      hint: 'Have $25,000 in the bank in a career.',
      tier: 'gold',
      emblem: glyphs.gem,
    },
    {
      id: 'million-mile-club',
      name: 'Million-Mile Club',
      description: 'The old rig’s odometer rolled past a million. Somebody bake a pie.',
      hint: 'Drive the career rig past 1,000,000 miles.',
      tier: 'gold',
      xp: 250,
      emblem: glyphs.trophy,
    },
    {
      id: 'washing-dishes',
      name: 'Washing Dishes',
      description: 'You’d make more money washing dishes! The diner is hiring.',
      tier: 'secret',
      emblem: plate,
    },
    {
      id: 'dummy',
      name: 'DUMMY !!',
      description: 'Ran out of fuel on the highway. The original had a word for that.',
      tier: 'secret',
      emblem: glyphs.question,
    },
    {
      id: 'repossessed',
      name: 'Repossessed',
      description: 'You are bankrupt !!! Your rig has been repossessed. It happens to the best.',
      tier: 'secret',
      emblem: glyphs.key,
    },
    {
      id: 'sound-asleep',
      name: 'Sound Asleep',
      description: 'Eight full hours of sleep in the middle of the day, in your own cab. Bliss.',
      tier: 'secret',
      emblem: bed,
    },
  ],
  cosmetics: [
    { id: 'paint-highway', name: 'Highway green', kind: 'Rig paint', unlock: { level: 3 } },
    {
      id: 'paint-cream',
      name: 'Cream and red',
      kind: 'Rig paint',
      unlock: { badge: 'coast-to-coast' },
    },
    {
      id: 'paint-midnight',
      name: 'Midnight blue',
      kind: 'Rig paint',
      unlock: { badge: 'night-owl' },
    },
    {
      id: 'paint-sunset',
      name: 'Sunset orange',
      kind: 'Rig paint',
      unlock: { badge: 'fresh-squeezed' },
    },
    {
      id: 'paint-chrome',
      name: 'Polished chrome',
      kind: 'Rig paint',
      unlock: { badge: 'million-mile-club' },
    },
  ],
  stats: [
    { key: 'trips', label: 'Trips driven' },
    { key: 'delivered', label: 'Loads delivered' },
    { key: 'miles', label: 'Miles driven', unit: 'mi' },
    { key: 'bestProfit', label: 'Best trip', unit: '$' },
    { key: 'postcards', label: 'Postcards' },
    { key: 'tickets', label: 'Tickets' },
  ],
});
