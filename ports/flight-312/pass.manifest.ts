import { definePassManifest, glyphs, type EmblemDrawer } from '@shared/pass/manifest';

/**
 * Flight 312 on the Arcade Pass: badges for the moments of a flight, the
 * liveries and the cap they unlock, and the stats on the profile. Imports
 * nothing but the manifest API, so the Hall can bundle it.
 */
const jumbo: EmblemDrawer = (pen) => {
  pen.path(
    'M32 8c3 0 4 6 4 12v8l18 10v5l-18-5v10l6 5v4l-10-3-10 3v-4l6-5V38l-18 5v-5l18-10v-8c0-6 1-12 4-12z',
  );
  pen.circle(32, 16, 2, { fill: 'accent' });
};

const wheelsUp: EmblemDrawer = (pen) => {
  pen.path('M8 46l46-22', { stroke: 'ink', width: 4 });
  pen.path('M12 52h40', { stroke: 'shine', width: 3 });
  pen.circle(22, 41, 4, { fill: 'accent' });
  pen.circle(34, 35, 4, { fill: 'accent' });
};

const wheel: EmblemDrawer = (pen) => {
  pen.circle(32, 36, 16);
  pen.circle(32, 36, 7, { fill: 'face' });
  pen.path('M10 54h44', { stroke: 'accent', width: 4 });
};

const feather: EmblemDrawer = (pen) => {
  pen.path('M46 10C26 14 16 30 18 50l4-2c0-14 8-26 24-38z');
  pen.path('M20 48C28 40 34 30 40 18', { stroke: 'face', width: 2 });
  pen.path('M10 54h44', { stroke: 'accent', width: 3 });
};

const cloudBreak: EmblemDrawer = (pen) => {
  pen.path('M10 26a10 10 0 0 1 18-6 9 9 0 0 1 16 3 8 8 0 0 1 10 8H10z');
  pen.path('M22 40h20M18 46h28M26 52h12', { stroke: 'accent', width: 3 });
};

const loopAround: EmblemDrawer = (pen) => {
  pen.path('M14 44c0-16 10-26 22-26 8 0 14 6 14 12', { stroke: 'ink', width: 5 });
  pen.path('M44 24l8 6-10 4z', { fill: 'accent' });
  pen.path('M10 52h44', { stroke: 'shine', width: 3 });
};

const disk: EmblemDrawer = (pen) => {
  pen.rect(12, 12, 40, 40, { radius: 3 });
  pen.rect(20, 12, 24, 14, { fill: 'face' });
  pen.rect(36, 15, 5, 8);
  pen.rect(18, 34, 28, 14, { fill: 'accent' });
};

const cap: EmblemDrawer = (pen) => {
  pen.path('M10 36c0-10 10-18 22-18s22 8 22 18z');
  pen.path('M6 40h52l-6 8H12z');
  pen.path('M26 26h12', { stroke: 'accent', width: 4 });
};

const tail: EmblemDrawer = (pen) => {
  pen.path('M16 44L40 18h8L34 44z');
  pen.path('M8 48h48', { stroke: 'ink', width: 4 });
  pen.path('M20 50l6 4 6-4 6 4', { stroke: 'accent', width: 3 });
};

const reeds: EmblemDrawer = (pen) => {
  pen.path('M16 54V26M24 54V18M32 54V30M40 54V22M48 54V28', { stroke: 'ink', width: 3 });
  pen.path('M8 54c8-4 16-4 24 0s16 4 24 0', { stroke: 'accent', width: 4 });
};

const belly: EmblemDrawer = (pen) => {
  pen.path('M8 40c10-8 38-8 48 0v4H8z');
  pen.path('M10 50c6 2 12-2 18 0s12 2 18 0', { stroke: 'accent', width: 3 });
};

const map: EmblemDrawer = (pen) => {
  pen.path('M8 14l14-4 20 6 14-4v38l-14 4-20-6-14 4z');
  pen.path('M22 10v38M42 16v38', { stroke: 'face', width: 2 });
  pen.circle(30, 30, 4, { fill: 'accent' });
};

const checklist: EmblemDrawer = (pen) => {
  pen.rect(14, 8, 36, 48, { radius: 3 });
  pen.path('M20 20l4 4 8-8M20 34l4 4 8-8', { stroke: 'accent', width: 3 });
  pen.path('M36 22h8M36 36h8M20 48h24', { stroke: 'face', width: 3 });
};

const headset: EmblemDrawer = (pen) => {
  pen.path('M12 36a20 20 0 0 1 40 0', { stroke: 'ink', width: 5 });
  pen.rect(8, 34, 10, 16, { radius: 3 });
  pen.rect(46, 34, 10, 16, { radius: 3 });
  pen.path('M50 50c0 6-8 8-14 8', { stroke: 'accent', width: 3 });
};

const shortField: EmblemDrawer = (pen) => {
  pen.rect(22, 8, 20, 48, { radius: 2 });
  pen.path('M32 14v6M32 26v6M32 38v6', { stroke: 'face', width: 3 });
  pen.path('M14 56h36', { stroke: 'accent', width: 4 });
};

export default definePassManifest({
  game: 'flight-312',
  badges: [
    {
      id: 'wheels-up',
      name: 'Wheels Up',
      description: 'Your first takeoff in the jumbo. Philadelphia falls away behind the clouds.',
      hint: 'Take off.',
      tier: 'bronze',
      emblem: wheelsUp,
    },
    {
      id: 'down-and-stopped',
      name: 'Down and Stopped',
      description: 'Landed and brought to a stop on the runway. The cabin applauds, quietly.',
      hint: 'Land and stop on a runway, in any mode.',
      tier: 'bronze',
      emblem: wheel,
    },
    {
      id: 'greaser',
      name: 'Greaser',
      description: 'Touched down at under 100 feet a minute. Somebody in row 40 is still asleep.',
      hint: 'Touch down at less than 100 fpm.',
      tier: 'silver',
      emblem: feather,
    },
    {
      id: 'breakout',
      name: 'Breakout',
      description:
        'Came out of the murk at minimums with the approach lights dead ahead, and landed.',
      hint: 'Land at a field with a ceiling of 300 ft or less.',
      tier: 'silver',
      emblem: cloudBreak,
    },
    {
      id: 'go-around',
      name: 'Go-Around',
      description: 'Went around from a bad approach and climbed away by the book.',
      hint: 'Fly a missed approach from below 1,000 ft without touching the runway.',
      tier: 'bronze',
      emblem: loopAround,
    },
    {
      id: 'ace-1982',
      name: '1982 Ace',
      description:
        'Flew the whole flight under the program’s own rules and landed it. 1982 would be proud.',
      hint: 'Land at your destination on a full flight under 1982 Rules.',
      tier: 'gold',
      emblem: disk,
    },
    {
      id: 'captains-hat',
      name: 'Captain’s Hat',
      description: 'A whole flight at the Captain level without a single entry in the book.',
      hint: 'Land a full flight at the Captain level with no violations.',
      tier: 'gold',
      emblem: cap,
    },
    {
      id: 'tail-strike',
      name: 'Tail Strike',
      description: 'Pulled the nose up too far, too soon. The tail has a souvenir of the runway.',
      hint: 'Strike the tail on rotation or landing.',
      tier: 'bronze',
      emblem: tail,
    },
    {
      id: 'marshlands',
      name: 'Marshlands',
      description: 'Ran out of runway and kept going. The marsh birds have opinions.',
      tier: 'secret',
      emblem: reeds,
    },
    {
      id: 'belly-flop',
      name: 'Belly Flop',
      description: 'Landed without the wheels. The gear lever was right there.',
      tier: 'secret',
      emblem: belly,
    },
    {
      id: 'grand-tour',
      name: 'Grand Tour',
      description: 'Landed a full flight at every one of the program’s six ILS fields.',
      hint: 'Land full flights at all six destinations.',
      tier: 'gold',
      target: 6,
      emblem: map,
    },
    {
      id: 'night-owl',
      name: 'Night Owl',
      description: 'Landed after dark, with the runway lights the only thing in the world.',
      hint: 'Land at night.',
      tier: 'silver',
      emblem: glyphs.moon,
    },
    {
      id: 'by-the-book',
      name: 'By the Book',
      description: 'Called all four checklists complete on one flight.',
      hint: 'Complete the Before Takeoff, After Takeoff, Approach and Landing checklists in one full flight.',
      tier: 'silver',
      emblem: checklist,
    },
    {
      id: 'radio-ace',
      name: 'Radio Ace',
      description: 'Every call answered, every number right, from clearance to the gate.',
      hint: 'Land a full flight at Pilot or Captain without a missed or wrong readback.',
      tier: 'silver',
      emblem: headset,
    },
    {
      id: 'short-field',
      name: 'Short Field',
      description: 'Put a jumbo down on a runway built for much smaller things, and stopped.',
      hint: 'Land at Philipsburg or Sault Ste. Marie at Pilot or Captain.',
      tier: 'silver',
      emblem: shortField,
    },
    {
      id: 'jumbo-pilot',
      name: 'Type Rating',
      description: 'Ten landings in the jumbo. The training captain signs your book.',
      hint: 'Land 10 times.',
      tier: 'silver',
      target: 10,
      emblem: jumbo,
    },
  ],
  cosmetics: [
    { id: 'livery-sunrise', name: 'Sunrise livery', kind: 'Livery', unlock: { badge: 'greaser' } },
    { id: 'livery-silver', name: 'Silver jet livery', kind: 'Livery', unlock: { level: 5 } },
    {
      id: 'livery-night',
      name: 'Night blue livery',
      kind: 'Livery',
      unlock: { badge: 'night-owl' },
    },
    {
      id: 'glareshield-cap',
      name: 'Captain’s cap on the glareshield',
      kind: 'Cockpit',
      unlock: { badge: 'captains-hat' },
    },
  ],
  stats: [
    { key: 'flights', label: 'Flights flown' },
    { key: 'landings', label: 'Landings' },
    { key: 'bestTouchdown', label: 'Softest touchdown', unit: 'fpm' },
    { key: 'minutesFlown', label: 'Time flown', unit: 'min' },
    { key: 'destinations', label: 'Fields landed at' },
  ],
});
