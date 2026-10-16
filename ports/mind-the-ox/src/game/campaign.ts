import type { MapSpec, TargetKind, TargetSite } from '../engine/map';
import type { Rules } from '../engine/rules';
import type { ThemeCopy, ThemeId } from '../themes';

/**
 * The campaign: eight chapters, each a hand-drawn battlefield with one
 * twist, escalating the way 1984's rounds did (chapter n is played at
 * round n's speeds, and from the second the targets fire back). The
 * first star is always for winning; the other two are the chapter's own.
 */
export type TwistId =
  'herd' | 'crosswind' | 'fog' | 'night' | 'convoy' | 'anti-air' | 'ace' | 'assault';

export type Goal =
  | { kind: 'no-ox-harmed' }
  | { kind: 'no-planes-lost' }
  | { kind: 'landed-at-home' }
  | { kind: 'convoy-stopped' }
  | { kind: 'ace-downed' }
  | { kind: 'depots-first' }
  | { kind: 'under-time'; seconds: number }
  | { kind: 'lit-under'; seconds: number }
  // At sea.
  | { kind: 'no-bolters' }
  | { kind: 'third-wire' }
  | { kind: 'long-torpedo'; distance: number }
  | { kind: 'no-raider-bombs' }
  | { kind: 'escort-unhurt' }
  | { kind: 'ships-sunk'; count: number }
  | { kind: 'airship-downed' }
  | { kind: 'carrier-first' };

/** What the chapter lists, the briefing and the results card need of any chapter, on land or at sea. */
export interface ChapterCard {
  id: string;
  title: Readonly<Record<ThemeId, string>>;
  /** The twist in a few words, for the chapter list. */
  twistLabel: string;
  /** Read before take-off, in each theme's own voice. */
  briefing: Readonly<Record<ThemeId, string>>;
  /** Flown in the dark whatever the player's light setting. */
  night: boolean;
  /** The second and third stars. */
  stars: readonly [Goal, Goal];
}

export interface Chapter extends ChapterCard {
  twist: TwistId;
  map: MapSpec;
  rules: Partial<Pick<Rules, 'wind' | 'searchlights' | 'antiAir'>>;
  /** An enemy ace hunts from the map's last airfield. */
  ace: boolean;
}

type Placed = readonly [kind: TargetKind, x: number];

function sites(side: 0 | 1, placed: readonly Placed[]): TargetSite[] {
  return placed.map(([kind, x]) => ({ kind, side, x }));
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'ox-pasture',
    title: {
      'great-war': 'The Ox Pasture',
      'cyan-magenta': 'The Ox Pasture',
      airshow: 'The Ox Pasture',
    },
    twist: 'herd',
    twistLabel: 'A protected ox herd',
    briefing: {
      'great-war':
        'The Central Powers have tucked their works in among the finest herd in the valley. Take out every target, and do not touch a single ox: the farmers will know, and so will the Colonel.',
      'cyan-magenta':
        'Magenta has hidden its factories in a cow field, the cads. Flatten the lot, but the oxen are neutral. Very neutral. Extremely large and neutral.',
      airshow:
        "Today's show is over the county fair, and the prize herd is grazing right under the course. Pop, cut and flour every marker the Red Kites have set up, and remember that the judges take a dim view of upset oxen.",
    },
    map: {
      name: 'The Ox Pasture',
      seed: 101,
      ground: [
        [0, 40],
        [400, 48],
        [800, 60],
        [1100, 44],
        [1300, 40],
        [1600, 52],
        [1900, 46],
        [2200, 58],
        [2500, 50],
        [3000, 44],
      ],
      bases: [
        { side: 0, x: 1270, facing: 1 },
        { side: 1, x: 560, facing: 1 },
        { side: 1, x: 1760, facing: -1 },
        { side: 1, x: 2480, facing: -1 },
      ],
      targets: [
        ...sites(0, [
          ['tank', 940],
          ['hangar', 1160],
          ['depot', 1200],
        ]),
        ...sites(1, [
          ['factory', 230],
          ['hangar', 290],
          ['depot', 420],
          ['hangar', 480],
          ['tank', 700],
          ['depot', 820],
          ['hangar', 880],
          ['factory', 1560],
          ['tank', 1620],
          ['hangar', 1840],
          ['depot', 1900],
          ['factory', 2080],
          ['tank', 2270],
          ['hangar', 2330],
          ['depot', 2560],
          ['factory', 2620],
          ['tank', 2690],
        ]),
      ],
      oxen: [1420, 1490, 1960, 2020, 2140, 2200],
    },
    rules: {},
    night: false,
    ace: false,
    stars: [{ kind: 'no-ox-harmed' }, { kind: 'no-planes-lost' }],
  },
  {
    id: 'westerly',
    title: {
      'great-war': 'Westerly',
      'cyan-magenta': 'Westerly',
      airshow: 'Westerly',
    },
    twist: 'crosswind',
    twistLabel: 'A crosswind',
    briefing: {
      'great-war':
        'A gale is blowing from the east and the enemy thinks it will keep us on the ground. Fly into it, bomb into it and bring her home into it. The wind pushes everything west, bombs included.',
      'cyan-magenta':
        'A Magenta weather machine (allegedly) has whipped up a wind from the east. Everything you drop drifts west. Aim upwind and try to look as if you meant it.',
      airshow:
        'Gusty conditions for the afternoon programme, folks: a stiff breeze from the east. Flour bags drift west, so aim upwind, and give the crowd a crosswind landing.',
    },
    map: {
      name: 'Westerly',
      seed: 202,
      ground: [
        [0, 44],
        [500, 58],
        [900, 46],
        [1200, 38],
        [1500, 50],
        [1800, 70],
        [2050, 92],
        [2250, 96],
        [2450, 62],
        [2700, 60],
        [3000, 50],
      ],
      bases: [
        { side: 0, x: 1180, facing: 1 },
        { side: 1, x: 420, facing: 1 },
        { side: 1, x: 1700, facing: -1 },
        { side: 1, x: 2560, facing: -1 },
      ],
      targets: [
        ...sites(0, [
          ['hangar', 900],
          ['factory', 1080],
          ['tank', 1120],
        ]),
        ...sites(1, [
          ['depot', 220],
          ['factory', 280],
          ['hangar', 340],
          ['tank', 570],
          ['hangar', 640],
          ['depot', 710],
          ['factory', 780],
          ['factory', 1480],
          ['tank', 1550],
          ['hangar', 1790],
          ['depot', 1860],
          ['factory', 1940],
          ['tank', 2020],
          ['hangar', 2100],
          ['depot', 2180],
          ['factory', 2260],
          ['tank', 2360],
        ]),
      ],
      oxen: [1330, 1400],
    },
    rules: { wind: -1.1 },
    night: false,
    ace: false,
    stars: [{ kind: 'landed-at-home' }, { kind: 'under-time', seconds: 360 }],
  },
  {
    id: 'pea-soup',
    title: {
      'great-war': 'Pea Soup',
      'cyan-magenta': 'Pea Soup',
      airshow: 'Pea Soup',
    },
    twist: 'fog',
    twistLabel: 'Fog banks',
    briefing: {
      'great-war':
        'Fog lies thick in both river valleys and half their works are hidden in it. Inside the fog nobody can see you, and you cannot see much either. Use it, and be quick about it.',
      'cyan-magenta':
        'Magenta has filled two valleys with fog, or very possibly soup. Inside it nobody can see you, and you cannot see them. Be quick before it goes cold.',
      airshow:
        'Morning mist in the valleys, and half the course is somewhere inside it. In the mist the Red Kites cannot see you, and the spotters can barely see anything. Make it quick.',
    },
    map: {
      name: 'Pea Soup',
      seed: 303,
      ground: [
        [0, 50],
        [400, 64],
        [700, 40],
        [1000, 32],
        [1300, 46],
        [1600, 60],
        [1850, 34],
        [2100, 30],
        [2350, 36],
        [2600, 62],
        [3000, 56],
      ],
      bases: [
        { side: 0, x: 1340, facing: 1 },
        { side: 1, x: 300, facing: 1 },
        { side: 1, x: 1650, facing: -1 },
        { side: 1, x: 2700, facing: -1 },
      ],
      targets: [
        ...sites(0, [
          ['hangar', 1180],
          ['depot', 1230],
          ['factory', 1270],
        ]),
        ...sites(1, [
          ['hangar', 450],
          ['factory', 520],
          ['depot', 640],
          ['tank', 720],
          ['hangar', 800],
          ['depot', 880],
          ['factory', 960],
          ['tank', 1040],
          ['factory', 1740],
          ['hangar', 1830],
          ['depot', 1910],
          ['tank', 1990],
          ['factory', 2070],
          ['hangar', 2150],
          ['tank', 2230],
          ['depot', 2310],
          ['factory', 2390],
        ]),
      ],
      oxen: [1490, 1530],
      fog: [
        { left: 600, right: 1060, top: 92 },
        { left: 1800, right: 2420, top: 98 },
      ],
    },
    rules: {},
    night: false,
    ace: false,
    stars: [{ kind: 'under-time', seconds: 300 }, { kind: 'no-planes-lost' }],
  },
  {
    id: 'lantern-raid',
    title: {
      'great-war': 'Lantern Raid',
      'cyan-magenta': 'Lantern Raid',
      airshow: 'Lantern Raid',
    },
    twist: 'night',
    twistLabel: 'A night raid',
    briefing: {
      'great-war':
        'Tonight we go in under the moon. Their airfields sweep the sky with searchlights, and in the dark their gunners and pilots only see what a beam finds or what comes close. Stay out of the light.',
      'cyan-magenta':
        'Night mission! Magenta has searchlights, and in the dark it only sees what the beams find or what flies right past its nose. Stay in the shadows. Wear black. Hum quietly.',
      airshow:
        "The night show, under the lights! The Red Kites' crews only spot what their searchlights find, or what buzzes right past them. Stay out of the beams for a sneaky score.",
    },
    map: {
      name: 'Lantern Raid',
      seed: 404,
      ground: [
        [0, 46],
        [500, 40],
        [900, 56],
        [1200, 44],
        [1500, 38],
        [1800, 52],
        [2100, 64],
        [2400, 48],
        [3000, 42],
      ],
      bases: [
        { side: 0, x: 1300, facing: 1 },
        { side: 1, x: 520, facing: 1 },
        { side: 1, x: 1900, facing: -1 },
        { side: 1, x: 2500, facing: -1 },
      ],
      targets: [
        ...sites(0, [
          ['hangar', 1000],
          ['tank', 1200],
          ['factory', 1240],
        ]),
        ...sites(1, [
          ['depot', 250],
          ['hangar', 310],
          ['factory', 370],
          ['tank', 430],
          ['hangar', 670],
          ['factory', 740],
          ['depot', 810],
          ['tank', 1600],
          ['hangar', 1670],
          ['factory', 1740],
          ['depot', 1990],
          ['hangar', 2060],
          ['factory', 2130],
          ['tank', 2200],
          ['hangar', 2340],
          ['depot', 2600],
          ['factory', 2680],
        ]),
      ],
      oxen: [1450, 1520],
    },
    rules: { searchlights: true },
    night: true,
    ace: false,
    stars: [{ kind: 'lit-under', seconds: 12 }, { kind: 'no-planes-lost' }],
  },
  {
    id: 'supply-road',
    title: {
      'great-war': 'Supply Road',
      'cyan-magenta': 'Supply Road',
      airshow: 'Parade Route',
    },
    twist: 'convoy',
    twistLabel: 'A convoy on the move',
    briefing: {
      'great-war':
        'A supply column of five lorries is rolling west along the valley road. Stop every one before it reaches their airfield, then finish the job.',
      'cyan-magenta':
        'Five Magenta trucks full of fuel (and, intelligence says, sandwiches) are heading west to their airfield. Stop every one before it gets there, then finish the job.',
      airshow:
        "Five parade floats are rolling west along the show road, and every one that reaches the Red Kites' field wins them a prize. Stop them all, then finish the course.",
    },
    map: {
      name: 'Supply Road',
      seed: 505,
      ground: [
        [0, 44],
        [400, 52],
        [800, 40],
        [1100, 46],
        [1400, 58],
        [1700, 48],
        [2000, 40],
        [2300, 44],
        [2600, 50],
        [3000, 46],
      ],
      bases: [
        { side: 0, x: 1150, facing: 1 },
        { side: 1, x: 450, facing: 1 },
        { side: 1, x: 1650, facing: -1 },
        { side: 1, x: 1960, facing: -1 },
      ],
      targets: [
        ...sites(0, [
          ['hangar', 860],
          ['depot', 1060],
          ['tank', 1100],
        ]),
        ...sites(1, [
          ['factory', 220],
          ['hangar', 290],
          ['depot', 360],
          ['tank', 600],
          ['hangar', 670],
          ['factory', 740],
          ['depot', 800],
          ['factory', 1450],
          ['tank', 1510],
          ['hangar', 1740],
          ['depot', 1810],
          ['factory', 2780],
        ]),
        ...[2560, 2600, 2640, 2680, 2720].map((x) => ({
          kind: 'tank' as const,
          side: 1 as const,
          x,
          drivesTo: x - 510,
        })),
      ],
      oxen: [1300, 1370],
    },
    rules: {},
    night: false,
    ace: false,
    stars: [{ kind: 'convoy-stopped' }, { kind: 'no-planes-lost' }],
  },
  {
    id: 'archie',
    title: {
      'great-war': 'Archie',
      'cyan-magenta': 'Cannon Row',
      airshow: 'Confetti Alley',
    },
    twist: 'anti-air',
    twistLabel: 'Depots with anti-aircraft guns',
    briefing: {
      'great-war':
        'Archie is waiting: six fuel depots, each ringed with anti-aircraft guns that open up the moment you are in range. Knock the depots out first and the sky gets a great deal quieter.',
      'cyan-magenta':
        'Magenta has put cannons on all six fuel depots. Loud, grumpy cannons. Take the depots out first and everything calms down.',
      airshow:
        'Six fireworks stands, each with a confetti cannon that fires the moment you come near. Set off the fireworks first and the sky gets a great deal friendlier.',
    },
    map: {
      name: 'Archie',
      seed: 606,
      ground: [
        [0, 48],
        [450, 60],
        [800, 44],
        [1100, 36],
        [1400, 48],
        [1700, 62],
        [2000, 50],
        [2300, 40],
        [2600, 58],
        [3000, 50],
      ],
      bases: [
        { side: 0, x: 1250, facing: 1 },
        { side: 1, x: 500, facing: 1 },
        { side: 1, x: 1800, facing: -1 },
        { side: 1, x: 2450, facing: -1 },
      ],
      targets: [
        ...sites(0, [
          ['tank', 960],
          ['hangar', 1140],
          ['factory', 1190],
        ]),
        ...sites(1, [
          ['depot', 230],
          ['factory', 300],
          ['depot', 370],
          ['hangar', 430],
          ['tank', 650],
          ['depot', 720],
          ['factory', 800],
          ['hangar', 880],
          ['depot', 1560],
          ['tank', 1640],
          ['factory', 1890],
          ['hangar', 1960],
          ['depot', 2040],
          ['tank', 2120],
          ['factory', 2200],
          ['hangar', 2280],
          ['depot', 2540],
        ]),
      ],
      oxen: [1400, 1470],
    },
    rules: { antiAir: true },
    night: false,
    ace: false,
    stars: [{ kind: 'depots-first' }, { kind: 'no-planes-lost' }],
  },
  {
    id: 'the-ace',
    title: {
      'great-war': 'The Ace',
      'cyan-magenta': 'The Menace',
      airshow: 'The Fandango',
    },
    twist: 'ace',
    twistLabel: 'An enemy ace',
    briefing: {
      'great-war':
        'Our airfield sits up on the plateau now, and they have sent for the Crimson Kestrel. The Kestrel guards nothing: it hunts. Bring it down if you can, and the targets either way.',
      'cyan-magenta':
        'Magenta has called in the Magenta Menace, the most magenta pilot ever painted. The Menace does not guard anything. It hunts. Bring it down if you can.',
      airshow:
        'Our team flies from the plateau today, and the Red Kites have brought in the Flying Fandango, who has never lost a show. Tag the Fandango out if you can, and clear the course either way.',
    },
    map: {
      name: 'The Ace',
      seed: 707,
      ground: [
        [0, 40],
        [500, 44],
        [900, 70],
        [1100, 96],
        [1300, 100],
        [1450, 70],
        [1700, 46],
        [2000, 40],
        [2300, 56],
        [2600, 48],
        [3000, 44],
      ],
      bases: [
        { side: 0, x: 1150, facing: 1 },
        { side: 1, x: 450, facing: 1 },
        { side: 1, x: 1900, facing: -1 },
        { side: 1, x: 2550, facing: -1 },
        { side: 1, x: 2100, facing: 1 },
      ],
      targets: [
        ...sites(0, [
          ['hangar', 850],
          ['tank', 1040],
          ['depot', 1090],
        ]),
        ...sites(1, [
          ['hangar', 220],
          ['factory', 290],
          ['depot', 360],
          ['tank', 600],
          ['hangar', 680],
          ['factory', 760],
          ['depot', 1460],
          ['hangar', 1540],
          ['tank', 1620],
          ['factory', 1700],
          ['depot', 1990],
          ['hangar', 2260],
          ['tank', 2340],
          ['factory', 2400],
          ['depot', 2640],
          ['hangar', 2710],
          ['tank', 2780],
        ]),
      ],
      oxen: [1300, 1370],
    },
    rules: {},
    night: false,
    ace: true,
    stars: [{ kind: 'ace-downed' }, { kind: 'no-planes-lost' }],
  },
  {
    id: 'final-push',
    title: {
      'great-war': 'Final Push',
      'cyan-magenta': 'The Big One',
      airshow: 'Grand Finale',
    },
    twist: 'assault',
    twistLabel: 'The final assault',
    briefing: {
      'great-war':
        'Everything they have left: three airfields, the Kestrel in the air, guns on every depot and a stiff wind off the hills. Win this one and the war is over. Mind the oxen on the way out.',
      'cyan-magenta':
        'Three Magenta airfields, the Menace, cannons on every depot and a wind off the hills. Win this and Cyan wins the war. The oxen would like to be left out of it.',
      airshow:
        'The grand finale: every stand, cannon and float the Red Kites own, the Fandango in the air and a breeze off the hills. Win this and the trophy is ours. Mind the prize oxen on the way out.',
    },
    map: {
      name: 'Final Push',
      seed: 808,
      ground: [
        [0, 52],
        [400, 46],
        [700, 58],
        [1000, 42],
        [1300, 48],
        [1600, 40],
        [1900, 56],
        [2200, 72],
        [2450, 60],
        [2700, 48],
        [3000, 46],
      ],
      bases: [
        { side: 0, x: 1200, facing: 1 },
        { side: 1, x: 520, facing: 1 },
        { side: 1, x: 1750, facing: -1 },
        { side: 1, x: 2550, facing: -1 },
        { side: 1, x: 2150, facing: 1 },
      ],
      targets: [
        ...sites(0, [
          ['hangar', 900],
          ['factory', 1100],
          ['tank', 1140],
        ]),
        ...sites(1, [
          ['depot', 230],
          ['hangar', 300],
          ['factory', 370],
          ['tank', 440],
          ['depot', 670],
          ['hangar', 740],
          ['factory', 810],
          ['tank', 1500],
          ['depot', 1570],
          ['hangar', 1840],
          ['factory', 1910],
          ['tank', 1980],
          ['depot', 2060],
          ['hangar', 2310],
          ['factory', 2390],
          ['depot', 2640],
          ['tank', 2720],
        ]),
      ],
      oxen: [1350, 1420],
    },
    rules: { antiAir: true, wind: -0.6 },
    night: false,
    ace: true,
    stars: [{ kind: 'ace-downed' }, { kind: 'no-ox-harmed' }],
  },
];

export const TOTAL_STARS = CHAPTERS.length * 3;

export function chapterById(id: string): Chapter | undefined {
  return CHAPTERS.find((chapter) => chapter.id === id);
}

/** What a goal asks of the player, in a few words and the theme's own names. */
export function goalLabel(goal: Goal, theme: ThemeCopy): string {
  switch (goal.kind) {
    case 'no-ox-harmed':
      return 'Harm no ox';
    case 'no-planes-lost':
      return 'Lose no planes';
    case 'landed-at-home':
      return 'Land at home at least once';
    case 'convoy-stopped':
      return `Stop the whole ${theme.convoy}`;
    case 'ace-downed':
      return `Bring down ${theme.ace.name}`;
    case 'depots-first':
      return `Destroy the ${theme.targets.depot}s before anything else`;
    case 'under-time':
      return `Win in under ${Math.round(goal.seconds / 60)} minutes`;
    case 'lit-under':
      return `Spend under ${goal.seconds} seconds in the searchlights`;
    case 'no-bolters':
      return 'Catch a wire every time you land';
    case 'third-wire':
      return theme.id === 'airshow' ? 'Land on the spot: the third wire' : 'Catch the third wire';
    case 'long-torpedo':
      return `Hit with a ${theme.torpedo} from long range`;
    case 'no-raider-bombs':
      return `Not one bomb on the ${theme.ships.carrier}`;
    case 'escort-unhurt':
      return `Bring every ${theme.ships.supply} in unhurt`;
    case 'ships-sunk':
      return `Sink ${goal.count} ships`;
    case 'airship-downed':
      return `Bring down the ${theme.raiders.zeppelin}`;
    case 'carrier-first':
      return `Sink their ${theme.ships.carrier} before its escorts`;
  }
}
