import { SUN_MOVES, THE_END_MOVES, TICKS_PER_MOVE, movesToTicks } from '../engine/constants';
import type { GameEvent } from '../engine/events';
import type { Side } from '../engine/map';
import { createMatch, matchScore, stepMatch, type Match } from '../engine/match';
import { convoyCount, type Objective } from '../engine/objectives';
import type { Controls, Plane, World } from '../engine/world';
import type { HudState } from '../render/hud';
import { CONTRAILS, liveryFor, type PaintJob } from '../render/liveries';
import {
  cgaPalette,
  goldenHour,
  paletteFor,
  type Lighting,
  type Livery,
  type Palette,
} from '../render/palette';
import type { Frame, WorldWindow } from '../render/view';
import { capitalised, THEMES, type ThemeCopy, type ThemeId } from '../themes';
import type { ModePlan } from './modes';
import { RoundTally } from './stats';
import { Visuals } from './visuals';

/** "1 ferry", "2 ferries": as much English as the themes' words need. */
function counted(count: number, word: string): string {
  if (count === 1) return `1 ${word}`;
  return `${count} ${/[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ie` : word}s`;
}

/** How long a call from the deck stays on the panel's paper, ticks. */
const DECK_CALL_TICKS = 150;

/** What the deck crew calls out when a person's plane comes aboard, misses the wires or goes round. */
function deckCall(event: GameEvent, theme: ThemeCopy): string | null {
  switch (event.type) {
    case 'trap':
      if (event.wire !== 3) return `Trap, wire ${event.wire}`;
      return theme.id === 'airshow' ? 'On the spot: the third wire!' : 'Trap: the third wire!';
    case 'bolter':
      return 'Bolter: round again';
    case 'touch-and-go':
      return 'Touch-and-go';
    default:
      return null;
  }
}

/**
 * A mission's objectives as they stand, in a few words for the panel:
 * what is left to do first, then whatever comes after it.
 */
export function objectiveStatus(
  world: World,
  objectives: readonly Objective[],
  theme: ThemeCopy,
): string | null {
  if (objectives.length === 0) return null;
  const parts = objectives.map((objective) => {
    switch (objective) {
      case 'targets':
      case 'shore':
      case 'ships': {
        const ashore =
          objective === 'ships'
            ? 0
            : world.targets.filter((target) => target.side === 1 && target.standing).length;
        const afloat =
          objective === 'shore'
            ? 0
            : world.ships.filter(
                (ship) => ship.side === 1 && ship.state === 'afloat' && !ship.escaped,
              ).length;
        return ashore + afloat === 0 ? 'targets done' : `${ashore + afloat} to go`;
      }
      case 'boats': {
        const boats = world.ships.filter(
          (ship) => ship.side === 1 && ship.kind === 'torpedo-boat' && ship.state === 'afloat',
        ).length;
        return boats === 0
          ? `${theme.ships['torpedo-boat']}s sunk`
          : `${counted(boats, theme.ships['torpedo-boat'])} to sink`;
      }
      case 'planes':
        return counted(
          world.planes.filter((plane) => plane.side === 1 && plane.state !== 'out').length,
          'fighter',
        );
      case 'raiders': {
        const coming = world.map.raids.filter(
          (raid) => raid.at * TICKS_PER_MOVE > world.tick,
        ).length;
        const inAir = world.raiders.filter((raider) => raider.state !== 'falling');
        if (coming + inAir.length === 0) return 'raids stopped';
        const word = inAir.every((raider) => raider.kind === 'zeppelin')
          ? theme.raiders.zeppelin
          : theme.raiders.bomber;
        return `${counted(inAir.length, word)} in, ${counted(coming, 'raid')} to come`;
      }
      case 'escort': {
        const { arrived, total } = convoyCount(world);
        return `${arrived} of ${counted(total, theme.ships.supply)} in`;
      }
      case 'gates':
        return `gate ${Math.min(world.gatesPassed + 1, world.map.gates.length)} of ${world.map.gates.length}`;
      case 'touch-and-go':
        return world.touchAndGoes > 0 ? 'touch-and-go done' : 'a touch-and-go';
      case 'land-aboard':
        return 'then land aboard';
    }
  });
  return capitalised(parts.join(' · '));
}

/** How one round went: who won it, and what everyone did. */
export interface RoundRecord {
  round: number;
  /** The side that won it, or null for a lost round in a one-player game. */
  winner: Side | null;
  tally: RoundTally;
  /** Each side's points in the round, before the bonus. */
  score: [number, number];
  bonus: number;
}

export interface SessionOutcome {
  plan: ModePlan;
  rounds: readonly RoundRecord[];
  scores: [number, number];
  roundsWon: [number, number];
}

export interface SessionOptions {
  plan: ModePlan;
  theme: ThemeId;
  /** The first player's cosmetics; nobody else's plane wears them. */
  paintJob: PaintJob;
  reducedMotion: boolean;
  /** Classic 1984's four-colour picture: its own palette, and no cosmetics. */
  cga: boolean;
}

/**
 * One game in progress: the match from a mode's plan, the tally of every
 * round, and the visuals each player's view is drawn from. It knows
 * nothing of the DOM: the page feeds it controls and display frames, and
 * hears what happened through `onEvents`, `onRoundEnd` and `onOver`.
 */
export class Session {
  readonly match: Match;
  readonly plan: ModePlan;
  readonly visuals = new Visuals();
  readonly rounds: RoundRecord[] = [];
  onEvents: (events: readonly GameEvent[], world: World) => void = () => {};
  onRoundEnd: (record: RoundRecord) => void = () => {};
  onOver: (outcome: SessionOutcome) => void = () => {};
  private tally: RoundTally;
  private lastWorld: World;
  private lastPhase: Match['phase'];
  private liveryCache: { palette: Palette; liveries: Map<number, Livery> } | null = null;
  private readonly splatsFor = new Set<number>();
  private time = 0;
  private duskPalette: Palette | null = null;
  /** The deck's last call for each person's plane, by plane id, and the tick it is cleared. */
  private readonly deckCalls = new Map<number, { text: string; until: number }>();

  constructor(private readonly options: SessionOptions) {
    this.plan = options.plan;
    this.match = createMatch(options.plan.setup);
    this.lastWorld = this.match.world;
    this.lastPhase = this.match.phase;
    this.tally = this.newTally();
  }

  get theme(): ThemeId {
    return this.options.theme;
  }

  get phase(): Match['phase'] {
    return this.match.phase;
  }

  get world(): World {
    return this.match.world;
  }

  /** The plane the nth person is flying. */
  humanPlane(player: number): Plane | null {
    const seat = this.plan.humans[player];
    return this.match.world.planes.find((plane) => plane.seat === seat) ?? null;
  }

  private newTally(): RoundTally {
    const world = this.match.world;
    const humans = world.planes.filter((plane) => plane.pilot.kind === 'human');
    const aces = world.planes.filter((plane) => this.plan.seats[plane.seat]?.look === 'ace');
    this.splatsFor.clear();
    for (const plane of humans) this.splatsFor.add(plane.id);
    return new RoundTally(
      humans.map((plane) => plane.id),
      new Set(aces.map((plane) => plane.id)),
    );
  }

  /** One engine tick, with what each seat asks for (by seat number). */
  step(controls: readonly (Controls | undefined)[]) {
    if (this.match.phase === 'over') return;
    const playing = this.match.phase === 'playing';
    stepMatch(this.match, controls);
    const world = this.match.world;
    if (world !== this.lastWorld) {
      // A new round on a fresh field: fresh smoke, a fresh tally.
      this.lastWorld = world;
      this.visuals.reset();
      this.tally = this.newTally();
    }
    if (playing) this.tally.absorb(world, world.events);
    this.hearTheDeck(world);
    this.visuals.absorb(world.events, world, this.time, {
      splatsFor: this.splatsFor,
      downed: THEMES[this.options.theme].downed,
      festive: this.options.theme === 'airshow',
      cheerful: this.options.theme === 'cyan-magenta',
    });
    this.onEvents(world.events, world);
    this.watchPhase();
  }

  private hearTheDeck(world: World) {
    for (const event of world.events) {
      if (!('plane' in event) || event.plane === null || !this.splatsFor.has(event.plane)) continue;
      const text = deckCall(event, THEMES[this.options.theme]);
      if (text) this.deckCalls.set(event.plane, { text, until: world.tick + DECK_CALL_TICKS });
    }
  }

  private watchPhase() {
    const { match } = this;
    if (match.phase === this.lastPhase) return;
    const from = this.lastPhase;
    this.lastPhase = match.phase;
    if (from === 'playing' && (match.phase === 'sun' || match.phase === 'the-end')) {
      const winner = match.phase === 'sun' ? match.lastWinner : null;
      const record: RoundRecord = {
        round: match.round,
        winner,
        tally: this.tally,
        score: [...match.world.score],
        bonus: match.phase === 'sun' ? match.bonus : 0,
      };
      this.rounds.push(record);
      this.onRoundEnd(record);
    }
    if (match.phase === 'over') this.onOver(this.outcome());
  }

  outcome(): SessionOutcome {
    return {
      plan: this.plan,
      rounds: this.rounds,
      scores: [matchScore(this.match, 0), matchScore(this.match, 1)],
      roundsWon: [...this.match.roundsWon],
    };
  }

  palette(lighting: Lighting): Palette {
    if (this.options.cga) return cgaPalette();
    if (this.plan.hour === 'dusk') return this.dusk();
    return paletteFor(this.options.theme, this.plan.night ? 'night' : lighting);
  }

  /** A sortie at dusk: the day's palette with the sun low and the light gone gold, worked out once. */
  private dusk(): Palette {
    this.duskPalette ??= goldenHour(paletteFor(this.options.theme, 'day'), 0.9);
    return this.duskPalette;
  }

  /** Every plane's paint job for a palette, worked out once per palette. */
  private liveries(palette: Palette): Map<number, Livery> {
    if (this.liveryCache?.palette === palette) return this.liveryCache.liveries;
    const liveries = new Map<number, Livery>();
    for (const plane of this.match.world.planes) {
      const look = this.plan.seats[plane.seat]?.look ?? 'normal';
      liveries.set(
        plane.id,
        this.options.cga
          ? palette.liveries[plane.side]
          : liveryFor(palette, plane.side, look, this.options.paintJob),
      );
    }
    this.liveryCache = { palette, liveries };
    return liveries;
  }

  private contrails(): Map<number, string> {
    const colour = CONTRAILS[this.options.paintJob.contrail];
    const trails = new Map<number, string>();
    const player = this.humanPlane(0);
    if (colour && player) trails.set(player.id, colour);
    return trails;
  }

  /** Moves the visuals on by one display frame. Call once per frame, before any frame(). */
  advance(time: number) {
    this.time = time;
    this.visuals.advance(this.match.world, time, this.contrails());
  }

  /** The picture for one player's view: their camera, their goggles. */
  frame(player: number, lighting: Lighting, halfWidth: number): Frame {
    const { match } = this;
    const palette = this.palette(lighting);
    const focus = this.humanPlane(player);
    const winnerFlies =
      match.phase === 'sun' && focus !== null && focus.state === 'victory' ? focus : null;
    return this.visuals.frame({
      world: match.world,
      palette,
      theme: this.options.theme,
      time: this.time,
      focus,
      view: player,
      halfWidth,
      sun:
        match.phase === 'sun' && (winnerFlies || this.plan.humans.length === 1)
          ? match.phaseTicks / movesToTicks(SUN_MOVES)
          : null,
      theEnd: match.phase === 'the-end' ? match.phaseTicks / movesToTicks(THE_END_MOVES) : null,
      reducedMotion: this.options.reducedMotion,
      liveries: this.liveries(palette),
    });
  }

  /** The deck's call for a while after one, otherwise how the objectives stand. */
  private objectiveLine(plane: Plane | null): string | null {
    const call = plane ? this.deckCalls.get(plane.id) : undefined;
    if (call && this.match.world.tick < call.until) return call.text;
    return objectiveStatus(
      this.match.world,
      this.plan.setup.objectives ?? [],
      THEMES[this.options.theme],
    );
  }

  hud(player: number, frame: Frame, window: WorldWindow): HudState {
    const plane = this.humanPlane(player);
    const side = plane?.side ?? 0;
    const chapter = this.plan.chapter;
    return {
      world: this.match.world,
      plane,
      score: matchScore(this.match, side),
      round: this.match.round,
      roundLabel: chapter
        ? chapter.title[this.options.theme]
        : this.plan.request.kind === 'two-player' && this.plan.request.style === 'versus'
          ? `Round ${this.match.round + 1} · ${this.match.roundsWon[0]}–${this.match.roundsWon[1]}`
          : `Round ${this.match.round + 1}`,
      secretWeapons: this.match.world.rules.secretWeapons,
      window,
      palette: frame.palette,
      time: frame.time,
      friendlySide: side,
      objective: this.objectiveLine(plane),
    };
  }
}
