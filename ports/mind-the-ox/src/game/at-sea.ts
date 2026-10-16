import type { MapSpec } from '../engine/map';
import type { Objective } from '../engine/objectives';
import type { Rules } from '../engine/rules';
import type { CpuLevel, Loadout } from '../engine/world';
import type { ChapterCard } from './campaign';

/**
 * At Sea: eight missions flown off a carrier, from the first take-off and
 * landing in a calm sea to a duel with the enemy's own carrier. Each is a
 * hand-drawn coast with its own objectives (see engine/objectives.ts);
 * the first star is for completing it, the other two are its own.
 */
export interface SeaChapter extends ChapterCard {
  map: MapSpec;
  objectives: readonly Objective[];
  rules: Partial<Pick<Rules, 'wind' | 'seaState' | 'antiAir'>>;
  /**
   * The computer pilots, each flying from one of the map's airfields or
   * decks: guarding the coast and water round it, or hunting the player
   * anywhere, as a raid's escorts do; with planes to lose, or 1984's
   * endless supply of them.
   */
  enemies: readonly { base: number; level: CpuLevel; hunts?: boolean; lives?: number }[];
  /** How hard it is: it sets the ships' gunnery and, left to itself, the landing assist. */
  difficulty: CpuLevel;
  /** Flown at this round's speeds. */
  round: number;
  /** What the briefing suggests carrying; the player can swap on deck. */
  loadout: Loadout;
}

/** Our carrier, the first base of every mission, steaming west into the westerly. */
const westbound = (x: number, left: number, right: number) => ({
  kind: 'carrier' as const,
  side: 0 as const,
  x,
  direction: -1 as const,
  patrol: { left, right },
});

/** Their torpedo boats: patrolling between `left` and `right`, quick and hard to hit. */
const torpedoBoat = (x: number, left: number, right: number, direction: 1 | -1) => ({
  kind: 'torpedo-boat' as const,
  side: 1 as const,
  x,
  direction,
  patrol: { left, right },
});

const planeGuard = (x: number, left: number, right: number) => ({
  kind: 'destroyer' as const,
  side: 0 as const,
  x,
  direction: -1 as const,
  patrol: { left, right },
});

export const SEA_CHAPTERS: readonly SeaChapter[] = [
  {
    id: 'deck-trials',
    title: {
      'great-war': 'Deck Trials',
      'cyan-magenta': 'Deck Trials',
      airshow: 'Spot Landing',
    },
    twistLabel: 'Off the deck, a touch-and-go, back aboard',
    briefing: {
      'great-war':
        'Calm water and a light westerly: as good as it gets. Run her off the bow at full throttle and fly through both marker gates. Then one touch-and-go: down on the deck with the throttle wide open, and off the bow again. Last, come in from astern, slow and level, and let the wires catch you. The third wire is the one to take.',
      'cyan-magenta':
        'The flat-top is very flat and the sea is very calm. Zoom off the front and through both gates. Then bounce once: touch the deck with the engine roaring and zoom off again. Then sneak back on from behind, slowly, and let the wires grab your tail. Wire three is the comfy one.',
      airshow:
        'The landing contest opens the regatta. Off the bow and through both ring buoys, then a touch-and-go for the judges: wheels on the deck at full throttle and away. Last, back aboard from astern on the spot, the third wire, for top marks.',
    },
    night: false,
    stars: [{ kind: 'no-bolters' }, { kind: 'third-wire' }],
    map: {
      name: 'Deck Trials',
      seed: 1601,
      layout: 'sea',
      ground: [
        [0, 58],
        [400, 64],
        [640, 52],
        [700, 40],
        [2780, 48],
        [3000, 60],
      ],
      sea: { spans: [{ left: 720, right: 2760, kind: 'sea', shores: ['beach', 'cliff'] }] },
      // Their airfield is quiet today: nobody flies from it.
      bases: [
        { side: 0, x: 1800, facing: -1, carrier: 0 },
        { side: 1, x: 380, facing: 1 },
      ],
      targets: [],
      oxen: [520],
      fleet: [westbound(1800, 1350, 2250), planeGuard(2050, 1500, 2500)],
      gates: [
        { x: 1100, bottom: 70, top: 110 },
        { x: 2450, bottom: 90, top: 130 },
      ],
    },
    objectives: ['gates', 'touch-and-go', 'land-aboard'],
    rules: { wind: 0.3, seaState: 0 },
    enemies: [],
    difficulty: 'easy',
    round: 0,
    loadout: 'bombs',
  },
  {
    id: 'coastal-strike',
    title: {
      'great-war': 'Coastal Strike',
      'cyan-magenta': 'Beach Party',
      airshow: 'Beach Flour Run',
    },
    twistLabel: 'A coast with guns on its depots',
    briefing: {
      'great-war':
        'Their fuel depots on the coast are ringed with guns, and a works and a hangar stand behind them. Knock the depots out first, then the rest, and bring her back aboard.',
      'cyan-magenta':
        'Magenta has built a beach party of fuel depots, each with a grumpy cannon. Pop the depots first, then the factory and the hangar, then come home to the flat-top for tea.',
      airshow:
        'Fireworks stands with confetti cannons line the beach, with a stunt marker and a balloon stand behind. Flour the fireworks first, then the rest, and land back aboard to a round of applause.',
    },
    night: false,
    stars: [{ kind: 'depots-first' }, { kind: 'no-planes-lost' }],
    map: {
      name: 'Coastal Strike',
      seed: 1602,
      layout: 'sea',
      ground: [
        [0, 60],
        [300, 70],
        [520, 58],
        [800, 64],
        [900, 46],
        [2780, 50],
        [3000, 60],
      ],
      sea: { spans: [{ left: 960, right: 2760, kind: 'sea', shores: ['beach', 'cliff'] }] },
      bases: [
        { side: 0, x: 2000, facing: -1, carrier: 0 },
        { side: 1, x: 380, facing: 1 },
      ],
      targets: [
        { kind: 'hangar', side: 1, x: 570 },
        { kind: 'depot', side: 1, x: 635 },
        { kind: 'factory', side: 1, x: 700 },
        { kind: 'depot', side: 1, x: 770 },
        { kind: 'depot', side: 1, x: 840 },
      ],
      oxen: [505],
      fleet: [westbound(2000, 1550, 2250), planeGuard(2280, 1650, 2600)],
    },
    objectives: ['targets', 'land-aboard'],
    rules: { wind: 0.3, seaState: 0, antiAir: true },
    enemies: [{ base: 1, level: 'easy' }],
    difficulty: 'easy',
    round: 0,
    loadout: 'bombs',
  },
  {
    id: 'convoy-escort',
    title: {
      'great-war': 'Convoy Escort',
      'cyan-magenta': 'Convoy Escort',
      airshow: 'Ferry Escort',
    },
    twistLabel: 'Supply ships to see home',
    briefing: {
      'great-war':
        'Three supply ships are making for the harbour in the west, and torpedo boats are lying in wait off the coast, with fighters from the headland above them. Sink the boats before they get their torpedoes away.',
      'cyan-magenta':
        'Three supply boats full of cake are sailing west, and Magenta’s zippy boats want that cake. Sink the zippy boats before they launch their fish, and keep their fighters busy.',
      airshow:
        'Three ferries full of spectators are crossing to the harbour, and the Red Kites’ speedboats will try to cut across their bows with skimmers. Flour the speedboats before they get close, and keep the ferries clean.',
    },
    night: false,
    stars: [{ kind: 'escort-unhurt' }, { kind: 'ships-sunk', count: 3 }],
    map: {
      name: 'Convoy Escort',
      seed: 1603,
      layout: 'sea',
      ground: [
        [0, 60],
        [350, 66],
        [600, 54],
        [700, 44],
        [2780, 52],
        [3000, 62],
      ],
      sea: { spans: [{ left: 740, right: 2760, kind: 'sea', shores: ['beach', 'cliff'] }] },
      // The carrier keeps east of the torpedo boats' reach; the convoy has to sail through it.
      bases: [
        { side: 0, x: 2100, facing: -1, carrier: 0 },
        { side: 1, x: 380, facing: 1 },
      ],
      targets: [],
      oxen: [560],
      fleet: [
        westbound(2100, 1850, 2250),
        planeGuard(2250, 1900, 2500),
        { kind: 'supply', side: 0, x: 2300, direction: -1, speed: 0.6, bound: 1000, convoy: true },
        { kind: 'supply', side: 0, x: 2420, direction: -1, speed: 0.6, bound: 1100, convoy: true },
        { kind: 'supply', side: 0, x: 2540, direction: -1, speed: 0.6, bound: 1200, convoy: true },
        torpedoBoat(1000, 850, 1300, -1),
        torpedoBoat(1100, 850, 1350, -1),
        torpedoBoat(1200, 900, 1400, -1),
      ],
    },
    objectives: ['escort'],
    rules: { wind: 0.3, seaState: 1 },
    enemies: [{ base: 1, level: 'easy' }],
    difficulty: 'normal',
    round: 1,
    loadout: 'bombs',
  },
  {
    id: 'shipping-strike',
    title: {
      'great-war': 'Shipping Strike',
      'cyan-magenta': 'Big Boat Hunt',
      airshow: 'Target Barges',
    },
    twistLabel: 'A battle fleet',
    briefing: {
      'great-war':
        'Their dreadnought is out with a cruiser and two destroyers. A torpedo is the thing: come down low and level, slow right down, let it go a good way out and turn away. The destroyers will try to turn end-on to it.',
      'cyan-magenta':
        'Magenta’s big boat is out with its friends. Drop a fish: low, level, slow, and from far enough away that you are not in the way when it arrives. The little boats wriggle out of the way if they see it coming.',
      airshow:
        'The target barges are out with their safety boats. Skimmers score best: low, level and slow, let go well out and break away. The safety boats will dodge if they can.',
    },
    night: false,
    stars: [{ kind: 'long-torpedo', distance: 300 }, { kind: 'no-planes-lost' }],
    map: {
      name: 'Shipping Strike',
      seed: 1604,
      layout: 'sea',
      ground: [
        [0, 60],
        [300, 72],
        [560, 60],
        [660, 46],
        [2780, 50],
        [3000, 58],
      ],
      sea: { spans: [{ left: 700, right: 2760, kind: 'sea', shores: ['beach', 'cliff'] }] },
      bases: [
        { side: 0, x: 2150, facing: -1, carrier: 0 },
        { side: 1, x: 360, facing: 1 },
      ],
      targets: [],
      oxen: [540],
      fleet: [
        westbound(2150, 1850, 2250),
        planeGuard(2500, 2000, 2650),
        { kind: 'battleship', side: 1, x: 1200, direction: 1, patrol: { left: 950, right: 1500 } },
        { kind: 'destroyer', side: 1, x: 1000, direction: 1, patrol: { left: 850, right: 1600 } },
        { kind: 'destroyer', side: 1, x: 1420, direction: 1, patrol: { left: 900, right: 1700 } },
        { kind: 'cruiser', side: 1, x: 1600, direction: -1, patrol: { left: 1100, right: 1850 } },
      ],
    },
    objectives: ['targets'],
    rules: { wind: 0.3, seaState: 1 },
    enemies: [{ base: 1, level: 'normal' }],
    difficulty: 'normal',
    round: 1,
    loadout: 'torpedo',
  },
  {
    id: 'the-raid',
    title: {
      'great-war': 'The Raid',
      'cyan-magenta': 'The Raid',
      airshow: 'The Long Hop',
    },
    twistLabel: 'A long way to the target',
    briefing: {
      'great-war':
        'Their airship sheds are far along the coast, guarded by guns and a fighter field. Hit the sheds and get back. It is a long way home: if the tank runs low, ditch beside the picket destroyer and they will fish you out. A Zeppelin may be out already.',
      'cyan-magenta':
        'Magenta keeps its blimps in two enormous hangars at the far end of the coast. Flatten them and come home. It is a long way: if you run out, splash down by our destroyer and they will fish you out. Watch for a blimp heading our way.',
      airshow:
        'The long hop: two blimp hangars at the far end of the course, with fireworks stands to guard them. Flour the hangars and fly home. If the tank runs dry, splash down by the safety boat. A Red Kites blimp is already on its way to us.',
    },
    night: false,
    stars: [{ kind: 'airship-downed' }, { kind: 'no-planes-lost' }],
    map: {
      name: 'The Raid',
      seed: 1605,
      layout: 'sea',
      ground: [
        [0, 62],
        [260, 70],
        [520, 62],
        [720, 54],
        [860, 44],
        [2780, 52],
        [3000, 60],
      ],
      sea: { spans: [{ left: 900, right: 2760, kind: 'sea', shores: ['beach', 'cliff'] }] },
      bases: [
        { side: 0, x: 2200, facing: -1, carrier: 0 },
        { side: 1, x: 660, facing: -1 },
      ],
      targets: [
        // Clear of the mountains behind, room to come round after a run on them.
        { kind: 'shed', side: 1, x: 400 },
        { kind: 'shed', side: 1, x: 450 },
        { kind: 'depot', side: 1, x: 505 },
        { kind: 'depot', side: 1, x: 550 },
      ],
      oxen: [230, 760],
      fleet: [
        westbound(2200, 2000, 2250),
        { kind: 'destroyer', side: 0, x: 1700, direction: -1, patrol: { left: 1300, right: 2200 } },
      ],
      raids: [{ kind: 'zeppelin', side: 1, at: 480, x: 260, altitude: 160, count: 1, target: 0 }],
    },
    objectives: ['targets', 'land-aboard'],
    rules: { wind: 0.3, seaState: 1, antiAir: true },
    // An airship station's last few scouts, not an endless stream of them.
    enemies: [{ base: 1, level: 'normal', lives: 3 }],
    difficulty: 'normal',
    round: 1,
    loadout: 'bombs',
  },
  {
    id: 'intercept',
    title: {
      'great-war': 'Intercept',
      'cyan-magenta': 'Blimp Alert',
      airshow: 'Banner Chase',
    },
    twistLabel: 'Bombers on the way',
    briefing: {
      'great-war':
        'Bombers are coming for the carrier, three waves of them with fighters for escort, and a Zeppelin in between. Get up there and stop every one before it is over the deck. Lose the carrier and we lose the day.',
      'cyan-magenta':
        'Magenta’s bombers want to drop things on our flat-top: three waves, a blimp, and fighters to look after them. Stop every single one. If the flat-top sinks, we all get wet.',
      airshow:
        'The Red Kites are sending banner planes over our show carrier in three waves, a blimp in the middle, fighters as escort. Tag every one before it is over the deck. If they flour the carrier, the show is theirs.',
    },
    night: false,
    stars: [{ kind: 'no-raider-bombs' }, { kind: 'no-planes-lost' }],
    map: {
      name: 'Intercept',
      seed: 1606,
      layout: 'sea',
      ground: [
        [0, 60],
        [300, 64],
        [540, 52],
        [620, 44],
        [2780, 50],
        [3000, 60],
      ],
      sea: { spans: [{ left: 660, right: 2760, kind: 'sea', shores: ['beach', 'cliff'] }] },
      bases: [
        { side: 0, x: 2050, facing: -1, carrier: 0 },
        { side: 1, x: 250, facing: 1 },
        { side: 1, x: 470, facing: 1 },
      ],
      targets: [],
      oxen: [580],
      fleet: [
        { ...westbound(2050, 1700, 2250), protect: true },
        planeGuard(2300, 1800, 2600),
        { kind: 'cruiser', side: 0, x: 1900, direction: -1, patrol: { left: 1500, right: 2400 } },
      ],
      raids: [
        { kind: 'bomber', side: 1, at: 200, x: 250, altitude: 150, count: 3, target: 0 },
        { kind: 'zeppelin', side: 1, at: 700, x: 250, altitude: 170, count: 1, target: 0 },
        { kind: 'bomber', side: 1, at: 1300, x: 250, altitude: 130, count: 4, target: 0 },
      ],
    },
    objectives: ['raiders'],
    rules: { wind: 0.3, seaState: 1 },
    // One fighter rides with the bombers; the other guards its airfield.
    enemies: [
      { base: 1, level: 'normal', hunts: true },
      { base: 2, level: 'hard' },
    ],
    difficulty: 'hard',
    round: 2,
    loadout: 'bombs',
  },
  {
    id: 'night-recovery',
    title: {
      'great-war': 'Night Recovery',
      'cyan-magenta': 'Night Landing',
      airshow: 'Night Lights',
    },
    twistLabel: 'Home by the deck lights, in a swell',
    briefing: {
      'great-war':
        'Torpedo boats and a monitor are sheltering under the coast tonight, with a depot behind them. Find them in the dark, sink them, and come home to a pitching deck by its lights alone. The swell is getting up.',
      'cyan-magenta':
        'It is dark, it is wavy, and Magenta’s zippy boats are hiding by the beach with a gun barge. Sink them and then land on a flat-top that is going up and down like a trampoline. Only its little lights to go by.',
      airshow:
        'The night show: speedboats and a float barge lit up off the beach, and a fireworks stand ashore. Flour the lot, then land back aboard by the deck lights in a lively swell.',
    },
    night: true,
    stars: [{ kind: 'no-bolters' }, { kind: 'under-time', seconds: 360 }],
    map: {
      name: 'Night Recovery',
      seed: 1607,
      layout: 'sea',
      ground: [
        [0, 58],
        [320, 66],
        [560, 56],
        [680, 44],
        [2780, 50],
        [3000, 60],
      ],
      sea: { spans: [{ left: 720, right: 2760, kind: 'sea', shores: ['beach', 'cliff'] }] },
      // The carrier stands off beyond the torpedo boats' reach.
      bases: [
        { side: 0, x: 2100, facing: -1, carrier: 0 },
        { side: 1, x: 400, facing: 1 },
      ],
      targets: [
        { kind: 'depot', side: 1, x: 560 },
        { kind: 'tank', side: 1, x: 620 },
      ],
      oxen: [300],
      fleet: [
        westbound(2100, 1850, 2250),
        planeGuard(2350, 1950, 2620),
        torpedoBoat(1000, 850, 1400, 1),
        torpedoBoat(1150, 850, 1400, -1),
        { kind: 'monitor', side: 1, x: 1300, direction: 1, patrol: { left: 1000, right: 1500 } },
      ],
    },
    objectives: ['targets', 'land-aboard'],
    rules: { wind: 0.3, seaState: 2, antiAir: true },
    enemies: [{ base: 1, level: 'normal' }],
    difficulty: 'hard',
    round: 2,
    loadout: 'bombs',
  },
  {
    id: 'carrier-duel',
    title: {
      'great-war': 'Carrier Duel',
      'cyan-magenta': 'Flat-top Duel',
      airshow: 'Grand Regatta',
    },
    twistLabel: 'Their carrier against ours',
    briefing: {
      'great-war':
        'Their carrier is at sea with a cruiser and a destroyer, and its fighters are already on deck. Sink it and nothing more can come off it. Then hold on: their last strike is on its way to us.',
      'cyan-magenta':
        'Magenta has a flat-top too, the copycats, with a cruiser and a destroyer. Sink it before its fighters swarm you, then look up: their bombers are coming for ours.',
      airshow:
        'The grand regatta: the Red Kites’ own show carrier with its launch and safety boat, fighters ready on its deck. Flour it out of the show first, then stop their last banner run on ours.',
    },
    night: false,
    stars: [{ kind: 'carrier-first' }, { kind: 'no-raider-bombs' }],
    map: {
      name: 'Carrier Duel',
      seed: 1608,
      layout: 'sea',
      ground: [
        [0, 60],
        [300, 66],
        [420, 48],
        [2780, 50],
        [3000, 60],
      ],
      sea: { spans: [{ left: 460, right: 2760, kind: 'sea', shores: ['beach', 'cliff'] }] },
      bases: [
        { side: 0, x: 2150, facing: -1, carrier: 0 },
        { side: 1, x: 1100, facing: 1, carrier: 2 },
      ],
      targets: [],
      oxen: [300],
      fleet: [
        { ...westbound(2150, 1900, 2250), protect: true },
        planeGuard(2500, 2000, 2650),
        { kind: 'carrier', side: 1, x: 1100, direction: 1, patrol: { left: 1000, right: 1450 } },
        { kind: 'cruiser', side: 1, x: 1100, direction: 1, patrol: { left: 700, right: 1400 } },
        { kind: 'destroyer', side: 1, x: 700, direction: 1, patrol: { left: 600, right: 1300 } },
      ],
      // Their last strike comes from their carrier's side of the sea, not from beyond their coast.
      raids: [
        { kind: 'bomber', side: 1, at: 1100, x: 700, altitude: 150, count: 3, target: 0 },
        { kind: 'zeppelin', side: 1, at: 1500, x: 700, altitude: 170, count: 1, target: 0 },
      ],
    },
    objectives: ['targets', 'raiders'],
    rules: { wind: 0.3, seaState: 1 },
    // A carrier's flight of eight: sink her and no more come; shoot down enough and none are left.
    enemies: [
      { base: 1, level: 'hard', lives: 4 },
      { base: 1, level: 'normal', lives: 4 },
    ],
    difficulty: 'hard',
    round: 1,
    loadout: 'torpedo',
  },
];

export const SEA_TOTAL_STARS = SEA_CHAPTERS.length * 3;

export function seaChapterById(id: string): SeaChapter | undefined {
  return SEA_CHAPTERS.find((chapter) => chapter.id === id);
}
