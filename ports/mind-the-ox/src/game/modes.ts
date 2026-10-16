import type { DailyDay } from '@shared/daily';
import { MAX_CRASHES } from '../engine/constants';
import { buildMap, generateMap, type WorldMap } from '../engine/map';
import type { MatchSetup } from '../engine/match';
import { CLASSIC_RULES, MODERN_RULES, type FlightModel, type Rules } from '../engine/rules';
import type { Seat } from '../engine/sim';
import type { CpuLevel, Loadout } from '../engine/world';
import type { PlaneLook } from '../render/liveries';
import type { ThemeId } from '../themes';
import { SEA_CHAPTERS, seaChapterById, type SeaChapter } from './at-sea';
import { chapterById, CHAPTERS, type Chapter, type ChapterCard } from './campaign';
import { dailySortieOptions, isNavalDay } from './daily';
import { buildSortie, type Sortie, type SortieOptions } from './sortie';

export type ModeId =
  'classic' | 'campaign' | 'at-sea' | 'sortie' | 'dogfight' | 'two-player' | 'daily';

export type ModeRequest =
  | { kind: 'classic' }
  | { kind: 'campaign'; chapter: string }
  | { kind: 'at-sea'; chapter: string }
  | { kind: 'sortie'; options: SortieOptions }
  | { kind: 'dogfight'; opponents: 1 | 3; level: CpuLevel }
  | { kind: 'two-player'; style: 'coop' | 'versus' }
  | { kind: 'daily'; day: DailyDay; practice: boolean };

export interface SeatPlan extends Seat {
  look: PlaneLook;
}

/** Everything needed to start a game: the match, who sits where, and how it is described. */
export interface ModePlan {
  request: ModeRequest;
  setup: MatchSetup;
  seats: readonly SeatPlan[];
  /** Seat numbers flown by people, in player order. */
  humans: readonly number[];
  /** Forced darkness, for the night raid. */
  night: boolean;
  /** A low sun, for a sortie flown at dusk. */
  hour: 'dusk' | null;
  chapter: ChapterCard | null;
  /** The mission built for a Custom Sortie or a naval Daily Sortie. */
  sortie: Sortie | null;
  /** The theme a shared sortie asks for, over the player's own. */
  theme: ThemeId | null;
  /** A few words for the Hall's Continue playing row and the pause card. */
  label: string;
}

export interface PlanOptions {
  seed: number;
  flight: FlightModel;
  autoRoll: boolean;
  /** Missiles and starbursts, once the Secret Hangar has been found and they are switched on. */
  secretWeapons: boolean;
  /** At sea: the steadier deck and wider wires, or "auto" (the default) to follow the mission's difficulty. */
  landingAssist?: 'auto' | 'on' | 'off';
  /** What to start a sea mission carrying: as its briefing suggests (the default), or always the same. */
  loadout?: 'briefing' | Loadout;
}

/**
 * The campaign's defenders grow up with it: green pilots over the first
 * fields, 1984's own by the middle, sharp ones for the end.
 */
const CHAPTER_DEFENDERS: readonly CpuLevel[] = [
  'easy',
  'easy',
  'normal',
  'normal',
  'normal',
  'hard',
  'hard',
  'hard',
];

/** Computer pilots in Dogfight carry this many planes each: five alone, two each in a three. */
const DOGFIGHT_LIVES: Readonly<Record<1 | 3, number>> = { 1: MAX_CRASHES, 3: 2 };

export const DOGFIGHT_LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard', 'brutal'];

/** The ships' anti-aircraft gunners, by how hard the mission is. */
const SHIP_GUNNERY: Readonly<Record<CpuLevel, number>> = {
  easy: 0.6,
  normal: 0.85,
  hard: 1,
  brutal: 1.15,
};

export function planMode(request: ModeRequest, options: PlanOptions): ModePlan {
  switch (request.kind) {
    case 'classic':
      return planClassic(request, options);
    case 'campaign':
      return planChapter(request, options);
    case 'at-sea':
      return planSeaChapter(request, options);
    case 'sortie':
      return planSortie(request, options);
    case 'dogfight':
      return planDogfight(request, options);
    case 'two-player':
      return request.style === 'coop' ? planCoop(request, options) : planVersus(request, options);
    case 'daily':
      return isNavalDay(request.day) ? planNavalDaily(request) : planDaily(request);
  }
}

/** What a plan is when nothing about it is at sea or out of the ordinary. */
const PLAIN: Pick<ModePlan, 'hour' | 'sortie' | 'theme'> = {
  hour: null,
  sortie: null,
  theme: null,
};

function modernRules(options: PlanOptions): Rules {
  return {
    ...MODERN_RULES,
    flight: options.flight,
    autoRoll: options.autoRoll && options.flight === 'smooth',
    secretWeapons: options.secretWeapons,
  };
}

function humanSeat(
  base: number,
  side: 0 | 1 = 0,
  look: PlaneLook = 'player',
  loadout?: Loadout,
): SeatPlan {
  return {
    side,
    pilot: { kind: 'human', level: 'normal', territory: null },
    base,
    maxCrashes: MAX_CRASHES,
    look,
    loadout,
  };
}

/**
 * 1984's defenders: a computer pilot at each enemy airfield, guarding the
 * third of the world its airfield stands in and coming back after every
 * crash.
 */
function defenders(map: WorldMap, level: CpuLevel = 'normal', count = 3): SeatPlan[] {
  const thirds = [0, map.width * 0.385, map.width * 0.696, map.width];
  const territory = (x: number) => {
    const zone = thirds.findIndex(
      (edge, index) => x >= edge && x < (thirds[index + 1] ?? Infinity),
    );
    return { left: thirds[zone] ?? 0, right: thirds[zone + 1] ?? map.width };
  };
  return map.bases
    .map((base, index) => ({ base, index }))
    .filter(({ base }) => base.side === 1)
    .slice(0, count)
    .map(({ base, index }) => ({
      side: 1 as const,
      pilot: { kind: 'cpu' as const, level, territory: territory(base.x) },
      base: index,
      maxCrashes: Number.POSITIVE_INFINITY,
      look: level,
    }));
}

function oneRound(
  map: WorldMap,
  rules: Rules,
  seats: SeatPlan[],
  seed: number,
  extra: Partial<MatchSetup> = {},
): MatchSetup {
  return { rules, mapFor: () => map, seats, seed, rounds: 1, versus: false, ...extra };
}

function planClassic(request: ModeRequest, options: PlanOptions): ModePlan {
  const map = generateMap({ seed: options.seed });
  const seats = [humanSeat(0), ...defenders(map)];
  return {
    request,
    // 1984 played on until the last plane, on the same ground every round.
    setup: oneRound(
      map,
      { ...CLASSIC_RULES, secretWeapons: options.secretWeapons },
      seats,
      options.seed,
      {
        rounds: Number.POSITIVE_INFINITY,
      },
    ),
    seats,
    humans: [0],
    night: false,
    chapter: null,
    ...PLAIN,
    label: 'Classic 1984',
  };
}

function planChapter(
  request: Extract<ModeRequest, { kind: 'campaign' }>,
  options: PlanOptions,
): ModePlan {
  const chapter = chapterById(request.chapter) ?? (CHAPTERS[0] as Chapter);
  const map = buildMap(chapter.map);
  const index = CHAPTERS.indexOf(chapter);
  const seats = [humanSeat(0), ...defenders(map, CHAPTER_DEFENDERS[index] ?? 'normal')];
  if (chapter.ace) {
    const aceBase = map.bases.length - 1;
    seats.push({
      side: 1,
      pilot: { kind: 'cpu', level: 'brutal', territory: null },
      base: aceBase,
      maxCrashes: 3,
      look: 'ace',
    });
  }
  return {
    request,
    setup: oneRound(map, { ...modernRules(options), ...chapter.rules }, seats, chapter.map.seed, {
      firstRound: index,
    }),
    seats,
    humans: [0],
    night: chapter.night,
    chapter,
    ...PLAIN,
    label: `Campaign · ${index + 1}`,
  };
}

function planDogfight(
  request: Extract<ModeRequest, { kind: 'dogfight' }>,
  options: PlanOptions,
): ModePlan {
  const map = generateMap({ seed: options.seed, layout: 'dogfight' });
  const enemyBases = map.bases
    .map((base, index) => ({ base, index }))
    .filter(({ base }) => base.side === 1)
    .slice(0, request.opponents);
  const seats: SeatPlan[] = [
    humanSeat(0),
    ...enemyBases.map(({ index }) => ({
      side: 1 as const,
      pilot: { kind: 'cpu' as const, level: request.level, territory: null },
      base: index,
      maxCrashes: DOGFIGHT_LIVES[request.opponents],
      look: request.level,
    })),
  ];
  return {
    request,
    setup: oneRound(map, modernRules(options), seats, options.seed, { goal: 'planes' }),
    seats,
    humans: [0],
    night: false,
    chapter: null,
    ...PLAIN,
    label: `Dogfight · 1 vs ${request.opponents}`,
  };
}

function planCoop(request: ModeRequest, options: PlanOptions): ModePlan {
  const map = generateMap({ seed: options.seed, layout: 'coop' });
  const seats: SeatPlan[] = [
    { ...humanSeat(0), ghostWhenOut: true },
    { ...humanSeat(1, 0, 'wingman'), ghostWhenOut: true },
    ...defenders(map),
  ];
  return {
    request,
    setup: oneRound(map, modernRules(options), seats, options.seed, {
      rounds: Number.POSITIVE_INFINITY,
    }),
    seats,
    humans: [0, 1],
    night: false,
    chapter: null,
    ...PLAIN,
    label: 'Two players · Co-op',
  };
}

function planVersus(request: ModeRequest, options: PlanOptions): ModePlan {
  const map = generateMap({ seed: options.seed, layout: 'versus' });
  const seats = [humanSeat(0), humanSeat(1, 1, 'opponent')];
  return {
    request,
    setup: oneRound(map, { ...modernRules(options), lossPenalties: false }, seats, options.seed, {
      versus: true,
      rounds: 3,
      roundsToWin: 2,
    }),
    seats,
    humans: [0, 1],
    night: false,
    chapter: null,
    ...PLAIN,
    label: 'Two players · Versus',
  };
}

/**
 * The Daily Sortie: today's battlefield from the date's seed, one round of
 * 1984's battle in smooth flight, the same for everyone whatever their
 * settings, secret weapons off.
 */
function planDaily(request: Extract<ModeRequest, { kind: 'daily' }>): ModePlan {
  const map = generateMap({ seed: request.day.seed, name: `Daily #${request.day.number}` });
  const seats = [humanSeat(0), ...defenders(map)];
  return {
    request,
    setup: oneRound(map, MODERN_RULES, seats, request.day.seed),
    seats,
    humans: [0],
    night: false,
    chapter: null,
    ...PLAIN,
    label: `Daily Sortie #${request.day.number}`,
  };
}

/** The landing assist a sea mission is flown with: the player's choice, or by its difficulty. */
function assistFor(choice: PlanOptions['landingAssist'], difficulty: CpuLevel): boolean {
  if (choice === 'on' || choice === 'off') return choice === 'on';
  return difficulty === 'easy' || difficulty === 'normal';
}

/** The computer pilots of a sea mission, each from its airfield or deck. */
function navalEnemies(
  map: WorldMap,
  enemies: readonly { base: number; level: CpuLevel; lives: number; hunts?: boolean }[],
): SeatPlan[] {
  return enemies.map((enemy) => ({
    side: 1 as const,
    pilot: {
      kind: 'cpu' as const,
      level: enemy.level,
      territory: enemy.hunts ? null : guarded(map, enemy.base),
    },
    base: enemy.base,
    maxCrashes: enemy.lives,
    look: enemy.level,
  }));
}

/** Guarding their airfield or carrier: the water and the coast for a long way round it. */
const GUARD_REACH = 700;

function guarded(map: WorldMap, baseIndex: number): { left: number; right: number } {
  const base = map.bases[baseIndex];
  const ship = base?.carrier === undefined ? undefined : map.fleet[base.carrier];
  const left = (ship?.patrol?.left ?? base?.x ?? 0) - GUARD_REACH;
  const right = (ship?.patrol?.right ?? base?.x ?? 0) + GUARD_REACH;
  return { left: Math.max(0, left), right: Math.min(map.width, right) };
}

/** At night at sea, as on the night raid, the enemy sees only what its searchlights find or what comes close. */
function seaRules(
  options: PlanOptions,
  difficulty: CpuLevel,
  rules: Partial<Rules>,
  night: boolean,
): Rules {
  return {
    ...modernRules(options),
    ...rules,
    searchlights: night,
    landingAssist: assistFor(options.landingAssist, difficulty),
    shipGunnery: SHIP_GUNNERY[difficulty],
  };
}

function planSeaChapter(
  request: Extract<ModeRequest, { kind: 'at-sea' }>,
  options: PlanOptions,
): ModePlan {
  const chapter = seaChapterById(request.chapter) ?? (SEA_CHAPTERS[0] as SeaChapter);
  const map = buildMap(chapter.map);
  const loadout =
    !options.loadout || options.loadout === 'briefing' ? chapter.loadout : options.loadout;
  const seats = [
    humanSeat(0, 0, 'player', loadout),
    ...navalEnemies(
      map,
      chapter.enemies.map((enemy) => ({
        ...enemy,
        lives: enemy.lives ?? Number.POSITIVE_INFINITY,
      })),
    ),
  ];
  return {
    request,
    setup: oneRound(
      map,
      seaRules(options, chapter.difficulty, chapter.rules, chapter.night),
      seats,
      chapter.map.seed,
      {
        firstRound: chapter.round,
        objectives: chapter.objectives,
      },
    ),
    seats,
    humans: [0],
    night: chapter.night,
    hour: null,
    chapter,
    sortie: null,
    theme: null,
    label: `At Sea · ${SEA_CHAPTERS.indexOf(chapter) + 1}`,
  };
}

function sortiePlan(
  request: ModeRequest,
  sortie: Sortie,
  rules: Rules,
  loadout: Loadout,
  label: string,
  theme: ThemeId | null,
): ModePlan {
  const map = buildMap(sortie.map);
  const seats = [humanSeat(0, 0, 'player', loadout), ...navalEnemies(map, sortie.enemies)];
  return {
    request,
    setup: oneRound(map, rules, seats, sortie.options.seed, {
      firstRound: sortie.round,
      objectives: sortie.objectives,
    }),
    seats,
    humans: [0],
    night: sortie.night,
    hour: sortie.hour,
    chapter: null,
    sortie,
    theme,
    label,
  };
}

function planSortie(
  request: Extract<ModeRequest, { kind: 'sortie' }>,
  options: PlanOptions,
): ModePlan {
  const sortie = buildSortie(request.options);
  const loadout =
    !options.loadout || options.loadout === 'briefing' ? sortie.loadout : options.loadout;
  return sortiePlan(
    request,
    sortie,
    seaRules(options, sortie.options.level, sortie.rules, sortie.night),
    loadout,
    `Custom Sortie · ${sortie.title}`,
    sortie.options.theme,
  );
}

/**
 * A naval Daily Sortie: the day's sortie under the same rules for
 * everyone, whatever their settings: smooth flight, the landing assist on,
 * secret weapons off, carrying what the briefing suggests.
 */
function planNavalDaily(request: Extract<ModeRequest, { kind: 'daily' }>): ModePlan {
  const sortie = buildSortie(dailySortieOptions(request.day));
  const rules: Rules = {
    ...MODERN_RULES,
    ...sortie.rules,
    searchlights: sortie.night,
    landingAssist: true,
    shipGunnery: SHIP_GUNNERY[sortie.options.level],
  };
  return sortiePlan(
    request,
    sortie,
    rules,
    sortie.loadout,
    `Daily Sortie #${request.day.number}`,
    null,
  );
}

/**
 * Behind the title: 1984's battle with nobody at the controls, a computer
 * pilot flying the home plane and the camera riding along with it.
 */
export function planDemo(seed: number): ModePlan {
  const map = generateMap({ seed, name: 'The front' });
  const seats: SeatPlan[] = [
    {
      side: 0,
      pilot: { kind: 'cpu', level: 'hard', territory: null },
      base: 0,
      maxCrashes: Number.POSITIVE_INFINITY,
      look: 'player',
    },
    ...defenders(map),
  ];
  return {
    request: { kind: 'classic' },
    setup: oneRound(map, MODERN_RULES, seats, seed, { rounds: Number.POSITIVE_INFINITY }),
    seats,
    humans: [0],
    night: false,
    chapter: null,
    ...PLAIN,
    label: 'Demo',
  };
}
