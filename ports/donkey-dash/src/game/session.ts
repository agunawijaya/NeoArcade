import type { AudioEngine } from '@shared/audio';
import type { DailyDay } from '@shared/daily';
import { playHeeHaw, playHorn, playJingle, playNearMiss, JINGLES, SOUNDS } from '../audio/sounds';
import { songFor, type SongId } from '../audio/music';
import { STEP_SECONDS } from '../engine/constants';
import {
  classicDuel,
  createDuel,
  donkeyPlayer,
  stepDuel,
  versusDuel,
  VERSUS_COMMIT_SECONDS,
  type DuelEvent,
  type DuelState,
} from '../engine/duel';
import type { Drive } from '../engine/drive';
import type { Hazard } from '../engine/hazards';
import { dailyRun, endlessRun } from '../engine/modes';
import type { SignKind } from '../engine/road';
import { legRun, legSeed, ROUTES, type RouteId } from '../engine/routes';
import {
  createRival,
  rivalMatch,
  stepRival,
  type RivalEvent,
  type RivalInput,
  type RivalSide,
  type RivalState,
} from '../engine/rival';
import {
  createRivalDriver,
  CPU_STYLES,
  type CpuLevel,
  type RivalDriver,
} from '../engine/rival-cpu';
import {
  createRun,
  metresDriven,
  progressOf,
  runScore,
  stepRun,
  type RunEvent,
  type RunState,
} from '../engine/run';
import { comboMultiplier } from '../engine/scoring';
import type { Look } from '../garage';
import {
  ENDLESS_LOOKS,
  paletteFor,
  type LookId,
  type Palette,
  type Theme,
} from '../render/palette';
import type { Stage } from '../render/stage';
import type { RoadView } from '../render/view';
import type { Settings } from '../settings';
import type { Hud, SteerLayout } from '../ui/hud';
import { keyLabel } from '../ui/keys';
import type { Controls } from './controls';
import type { PassReporter } from './pass-report';
import { soloCar, Visuals, type SceneCrash, type SceneState } from './visuals';

export type ModeRequest =
  | { kind: 'classic' }
  | { kind: 'versus' }
  | { kind: 'endless' }
  | { kind: 'daily'; day: DailyDay; practice: boolean }
  | { kind: 'trip'; route: RouteId; leg: number }
  | { kind: 'rival'; opponent: 'friend' | 'cpu' };

type Game =
  | { kind: 'duel'; state: DuelState }
  | { kind: 'run'; state: RunState }
  | { kind: 'rival'; state: RivalState; cpu: RivalDriver | null };

export type SessionOutcome =
  | { kind: 'duel'; request: ModeRequest; state: DuelState; lastPoint: 'donkey' | 'driver' | null }
  | { kind: 'run'; request: ModeRequest; state: RunState }
  | {
      kind: 'rival';
      request: ModeRequest;
      state: RivalState;
      cpu: CpuLevel | null;
      names: readonly [string, string];
    };

export interface SessionOptions {
  request: ModeRequest;
  settings: Settings;
  seed: number;
  stage: Stage;
  view: () => RoadView;
  hud: Hud;
  audio: AudioEngine;
  controls: Controls;
  look: Look;
  /** Rival Driver: each driver's car. */
  rivalLooks: readonly [Look, Look];
  theme: () => Theme;
  reducedMotion: () => boolean;
  reporter: PassReporter;
  names: readonly [string, string];
  onPause(): void;
  onPoint?(side: 'donkey' | 'driver'): void;
  onOver(outcome: SessionOutcome): void;
}

type Phase =
  | { kind: 'countdown'; time: number; length: number; beats: number | null }
  | { kind: 'play' }
  | { kind: 'ending'; time: number };

/** The shared audio engine starts a song this long after it is asked to. */
const MUSIC_LEAD = 0.08;
const DUEL_COUNT_SECONDS = 0.55;
/** How long the finish or the last crash plays before the results. */
const ENDING_SECONDS = 2.2;
/** How long a Rival car's crash stays on screen, its halves flying, while the race goes on. */
const RIVAL_CRASH_SECONDS = 2.1;

const SIGN_CAPTIONS: Record<SignKind, string> = {
  carrots: 'Carrots! Grab them for bonus points.',
  pairs: 'Donkey pairs ahead: two in a row, one in each lane.',
  mud: 'Mud ahead: switching lanes is a beat slower in it.',
  wobblers: 'Hesitant donkeys: they wobble, then commit to a lane.',
  'three-lanes': 'The road widens: each press moves one lane right, and wraps round.',
  herd: 'Herd crossing: thread the single gap in each row.',
  boss: 'A stubborn herd blocks the road. Find the gaps!',
  shift: 'The road shifts! When your lane ends, move over before the barrier.',
};

const NO_STEERING: RivalInput = { left: false, right: false };

export class Session {
  paused = false;
  private readonly game: Game;
  private readonly visuals: Visuals;
  private readonly palette: Palette;
  private readonly song: SongId;
  private phase: Phase;
  private lastPoint: 'donkey' | 'driver' | null = null;
  private lastCrash: Hazard | null = null;
  /** Rival Driver: each car's latest crash, while it plays out. */
  private readonly rivalCrashes = new Map<RivalSide, { hazard: Hazard; at: number }>();
  private ended = false;
  private roundBanner = true;

  constructor(private readonly options: SessionOptions) {
    const { request, settings, seed, hud, audio, controls } = options;
    this.game = createGame(request, settings, seed);
    this.visuals = new Visuals(options.reducedMotion);
    this.palette = paletteFor(lookFor(request), options.theme());
    this.song = songOf(request);
    controls.setRivalKeys(settings.rival.keys);
    controls.setMode(
      request.kind === 'versus'
        ? 'versus'
        : request.kind === 'rival'
          ? request.opponent === 'cpu'
            ? 'rival-cpu'
            : 'rival'
          : 'solo',
    );
    hud.layout(this.game.kind, request.kind === 'versus' || isFriendRival(request));
    if (request.kind === 'rival') hud.steering(steerLayout(request, settings, options.names));
    hud.setMuted(audio.mix.muted);
    hud.show(true);
    this.syncHud();
    audio.playMusic(songFor(this.song));
    this.phase = this.countIn(0);
  }

  get drive(): Drive {
    return this.game.state.drive;
  }

  get request(): ModeRequest {
    return this.options.request;
  }

  /** The run, duel or race itself, for the results screen and tests. */
  get state(): RunState | DuelState | RivalState {
    return this.game.state;
  }

  dispose() {
    this.options.hud.show(false);
    this.options.hud.showHint(null);
    this.options.controls.setMode('solo');
    this.options.audio.stopMusic();
  }

  pause() {
    this.paused = true;
    this.options.audio.stopMusic();
  }

  /** Picks up again, counting back in so the donkeys still arrive on the music's beat. */
  resume() {
    this.paused = false;
    if (this.phase.kind === 'ending') return;
    this.options.audio.playMusic(songFor(this.song));
    const beat = this.drive.beatSeconds;
    this.phase = this.countIn(beat === null ? 0 : this.drive.roadTime % beat);
  }

  toggleMute() {
    this.options.audio.toggleMute();
    this.options.hud.setMuted(this.options.audio.mix.muted);
  }

  update() {
    const { controls, audio } = this.options;
    const { input } = controls;
    if (input.wasPressed('mute')) this.toggleMute();
    if (this.paused) return;
    if (input.wasPressed('pause')) {
      this.options.onPause();
      return;
    }
    if (input.wasPressed('horn')) playHorn(audio, this.options.look.horn);
    this.advance();
    // Once the results are up, the page owns data-phase.
    if (this.ended) return;
    // What the page is doing, for anyone watching: tests sync to the engine's step.
    document.body.dataset.phase = this.phase.kind;
    document.body.dataset.step = String(this.drive.steps);
    document.body.dataset.lane = String(this.playerLane());
    if (this.game.kind === 'rival') {
      const { cars } = this.game.state;
      document.body.dataset.lanes = cars.map((car) => car.lane).join(',');
      document.body.dataset.meters = cars.map((car) => car.meter).join(',');
    }
    const scene = this.scene();
    document.body.dataset.moment =
      scene.crashes.length > 0 ? 'crash' : scene.summit !== null ? 'summit' : '';
  }

  /** The lane the (first) player's car is in. */
  private playerLane(): number {
    return this.game.kind === 'rival' ? this.game.state.cars[0].lane : this.drive.car.lane;
  }

  private advance() {
    const phase = this.phase;
    if (phase.kind === 'countdown') {
      this.countDown(phase);
      // Presses during the count-in are dropped; the CPU only drives once the road moves.
      this.readInput(false);
      return;
    }
    if (phase.kind === 'ending') {
      phase.time += STEP_SECONDS;
      this.stepEngine();
      if (phase.time >= ENDING_SECONDS && !this.ended) this.end();
      return;
    }
    this.stepEngine(this.readInput());
  }

  render(alpha: number, frameSeconds: number) {
    const frame = this.visuals.frame(
      this.scene(),
      this.paused ? 0 : alpha,
      this.paused ? 0 : frameSeconds,
    );
    this.options.stage.render(this.options.view(), frame);
  }

  /** Everyone's presses this step: the one button, two players' buttons, or two drivers' steering. */
  private readInput(driving = true): Inputs {
    const { controls } = this.options;
    const { game } = this;
    if (game.kind === 'rival') {
      const second = !game.cpu
        ? controls.steering(1)
        : driving
          ? game.cpu.decide(game.state)
          : NO_STEERING;
      return { kind: 'rival', steering: [controls.steering(0), second] };
    }
    if (game.kind === 'duel' && game.state.config.versus) {
      const state = game.state;
      return {
        kind: 'buttons',
        driver: controls.playerPressed(state.driver),
        donkey: controls.playerPressed(donkeyPlayer(state)),
      };
    }
    return { kind: 'buttons', driver: controls.pressed, donkey: false };
  }

  private countIn(beatPhase: number): Phase {
    const beat = this.drive.beatSeconds;
    if (beat === null)
      return { kind: 'countdown', time: 0, length: DUEL_COUNT_SECONDS * 3, beats: null };
    // The road's next beat must land on one of the song's: three beats in, plus where we were.
    const length = MUSIC_LEAD + (beatPhase === 0 ? 4 : 3) * beat + beatPhase;
    return { kind: 'countdown', time: 0, length, beats: beat };
  }

  private countDown(phase: Extract<Phase, { kind: 'countdown' }>) {
    const { hud, audio } = this.options;
    const before = phase.time;
    phase.time += STEP_SECONDS;
    const left = phase.length - phase.time;
    const unit = phase.beats ?? DUEL_COUNT_SECONDS;
    const count = Math.ceil(left / unit);
    if (Math.ceil((phase.length - before) / unit) !== count && count >= 1 && count <= 3) {
      audio.play(SOUNDS.tick);
    }
    hud.countdown(count >= 1 && count <= 3 ? String(count) : null);
    if (this.roundBanner) {
      this.roundBanner = false;
      this.announceStart();
    }
    if (phase.time >= phase.length) {
      hud.countdown('Go!');
      audio.play(SOUNDS.go);
      setTimeout(() => hud.countdown(null), 450);
      this.phase = { kind: 'play' };
    }
  }

  private announceStart() {
    const { hud, request, names, settings } = this.options;
    const touch = matchMedia('(pointer: coarse)').matches;
    if (request.kind === 'versus') {
      const state = this.game.state as DuelState;
      hud.banner(`${names[state.driver]} drives`, `${names[donkeyPlayer(state)]} is the donkey`, 2);
      hud.showHint(
        touch
          ? 'Each player taps their half of the screen'
          : 'Driver and donkey each press any key on their half of the keyboard',
      );
    } else if (request.kind === 'rival') {
      hud.banner('Round 1', `${names[0]} against ${names[1]}`, 2);
      const [first, second] = settings.rival.keys.map((pair) => pair.map(keyLabel).join(' '));
      hud.showHint(
        touch
          ? request.opponent === 'cpu'
            ? 'Tap the left or right of the screen to steer'
            : 'Each player has a left and a right zone on their half'
          : request.opponent === 'cpu'
            ? `Steer with ${first} or ${second}`
            : `${names[0]}: ${first} · ${names[1]}: ${second}`,
      );
    } else {
      hud.showHint(touch ? 'Tap anywhere to switch lanes' : 'Press any key to switch lanes');
      if (request.kind === 'trip') {
        const route = ROUTES[request.route];
        hud.banner(route.legs[request.leg]?.name ?? route.name, route.name, 2.2);
      }
    }
    setTimeout(() => hud.showHint(null), 3500);
  }

  private stepEngine(inputs: Inputs = IDLE) {
    const { game } = this;
    this.visuals.beforeStep(this.drive);
    let events: (RunEvent | DuelEvent | RivalEvent)[];
    if (game.kind === 'rival') {
      events = stepRival(
        game.state,
        inputs.kind === 'rival' ? inputs.steering : [NO_STEERING, NO_STEERING],
      );
    } else if (game.kind === 'run') {
      events = stepRun(game.state, { driver: inputs.kind === 'buttons' && inputs.driver });
    } else {
      const buttons = inputs.kind === 'buttons' ? inputs : { driver: false, donkey: false };
      events = stepDuel(game.state, buttons);
    }
    this.visuals.afterStep(this.drive);
    for (const event of events) this.react(event);
    this.syncHud();
  }

  private react(event: RunEvent | DuelEvent | RivalEvent) {
    this.visuals.onEvent(event, this.drive);
    if (this.game.kind === 'rival') this.reactInRace(event as RivalEvent, this.game);
    else this.reactOnRoad(event as RunEvent | DuelEvent);
  }

  /** What happens to the one car of a run or a duel. */
  private reactOnRoad(event: RunEvent | DuelEvent) {
    const { audio, hud, reporter } = this.options;
    const drive = this.drive;
    reporter.observe(event, drive.roadTime);
    switch (event.type) {
      case 'switch':
        audio.play(SOUNDS.whoosh, { velocity: 0.8 });
        break;
      case 'stuck':
        audio.play(SOUNDS.squelch);
        break;
      case 'reveal':
        this.maybeBray(event.hazard);
        break;
      case 'hop':
        if (event.hazard.revealed) audio.play(SOUNDS.hop, { velocity: 0.6 });
        break;
      case 'commit':
        if (event.hazard.revealed) audio.play(SOUNDS.commit);
        break;
      case 'crash':
        this.lastCrash = event.hazard;
        this.crashSound(event.hazard);
        break;
      case 'near-miss':
        playNearMiss(audio, event.tier.tier, event.combo);
        hud.popup(
          event.tier.name,
          'near',
          `+${event.points}${event.multiplier > 1 ? ` · ×${event.multiplier}` : ''}`,
        );
        break;
      case 'carrot-points':
        audio.play(SOUNDS.carrot);
        hud.carrot(event.points);
        break;
      case 'rhythm':
        audio.play(SOUNDS.onBeat);
        hud.popup('On the beat', 'beat', `+${event.points}`);
        break;
      case 'beat':
        this.visuals.onBeat();
        break;
      case 'sign':
        audio.play(SOUNDS.sign);
        hud.caption(SIGN_CAPTIONS[event.kind]);
        break;
      case 'milestone':
        hud.popup(`${event.metres.toLocaleString('en')} m`, 'info');
        break;
      case 'finish':
        playJingle(audio, JINGLES.finish);
        this.visuals.finish(drive.car.nose);
        hud.banner('Finish!', '', 2, 'good');
        break;
      case 'run-over':
        if (event.reason === 'crashes') playJingle(audio, JINGLES.gameOver, 0.16, 'triangle');
        this.phase = { kind: 'ending', time: 0 };
        break;
      case 'carrot-boost':
        hud.popup('Carrot boost!', 'carrot', 'one step up the road');
        break;
      case 'point':
        this.onPoint(event.side, event.player);
        break;
      case 'round':
        this.visuals.reset();
        if (this.options.request.kind === 'versus') {
          const state = this.game.state as DuelState;
          hud.banner(`${this.options.names[state.driver]} drives`, 'Roles swap every point', 1.6);
        }
        break;
      case 'match-over':
        this.phase = { kind: 'ending', time: 0 };
        break;
    }
  }

  /** What happens in Rival Driver: to either car, and to the race. */
  private reactInRace(event: RivalEvent, game: Extract<Game, { kind: 'rival' }>) {
    const { audio, hud, reporter, names, rivalLooks } = this.options;
    // A friend's tricks count on this browser's Pass as well; the CPU's do not.
    reporter.observeRace(event, game.cpu ? 1 : null);
    switch (event.type) {
      case 'reveal':
        this.maybeBray(event.hazard);
        break;
      case 'beat':
        this.visuals.onBeat();
        break;
      case 'round':
        this.visuals.reset();
        this.rivalCrashes.clear();
        hud.banner(`Round ${event.round}`, '', 1.4);
        break;
      case 'dead-heat':
        hud.banner('Dead heat!', 'The next crash decides it', 1.8);
        break;
      case 'match-over':
        this.phase = { kind: 'ending', time: 0 };
        break;
      case 'move':
        audio.play(SOUNDS.whoosh, { velocity: 0.7 });
        break;
      case 'bump':
        audio.play(SOUNDS.bump);
        if (event.reason !== 'edge') playHorn(audio, rivalLooks[event.car].horn);
        break;
      case 'crash':
        this.rivalCrashes.set(event.car, { hazard: event.hazard, at: this.drive.roadTime });
        this.crashSound(event.hazard);
        if (event.trapped) hud.popup('Trapped!', 'crash', `by ${names[event.car === 0 ? 1 : 0]}`);
        break;
      case 'escape':
        hud.popup('Slipped out!', 'near', names[event.car]);
        break;
      case 'respawn':
        audio.play(SOUNDS.respawn);
        break;
      case 'round-won':
        playJingle(audio, event.car === 0 || !game.cpu ? JINGLES.driverPoint : JINGLES.donkeyPoint);
        hud.banner(
          `${names[event.car]} takes the round`,
          `${event.rounds[0]} – ${event.rounds[1]}`,
          2,
          event.car === 0 || !game.cpu ? 'good' : 'bad',
        );
        break;
    }
  }

  private crashSound(hazard: Hazard) {
    const { audio } = this.options;
    audio.play(SOUNDS.crash);
    if (hazard.kind === 'barrier') audio.play(SOUNDS.clank);
    else playHeeHaw(audio, 1.05, 0.45);
  }

  private onPoint(side: 'donkey' | 'driver', player: 0 | 1 | null) {
    const { hud, audio, names } = this.options;
    this.lastPoint = side;
    this.options.onPoint?.(side);
    if (side === 'driver') {
      playJingle(audio, JINGLES.driverPoint);
      hud.banner(
        'Donkey loses!',
        player === null ? 'A point to the Driver' : `A point to ${names[player]}`,
        1.8,
        'good',
      );
    } else {
      setTimeout(() => playJingle(audio, JINGLES.donkeyPoint, 0.22, 'triangle'), 900);
      const who = player === null ? 'the Donkey' : names[player];
      setTimeout(() => hud.banner('Point to the Donkey', `A point to ${who}`, 1.6, 'bad'), 1300);
    }
  }

  /** Now and then a donkey announces itself; hesitant ones and herds more often. */
  private maybeBray(hazard: Hazard) {
    if (hazard.kind !== 'donkey') return;
    const chatty = hazard.role === 'wobbler' || hazard.role === 'boss' || hazard.role === 'rival';
    if (hazard.id % (chatty ? 3 : 7) === 0)
      playHeeHaw(this.options.audio, 0.9 + (hazard.id % 5) * 0.06);
  }

  private end() {
    const { onOver, request } = this.options;
    this.ended = true;
    const { game } = this;
    if (game.kind === 'run') onOver({ kind: 'run', request, state: game.state });
    else if (game.kind === 'rival') {
      const cpu = request.kind === 'rival' && request.opponent === 'cpu';
      onOver({
        kind: 'rival',
        request,
        state: game.state,
        cpu: cpu ? this.options.settings.rival.cpu : null,
        names: this.options.names,
      });
    } else onOver({ kind: 'duel', request, state: game.state, lastPoint: this.lastPoint });
  }

  private syncHud() {
    const { hud, names } = this.options;
    const { game } = this;
    if (game.kind === 'run') {
      const state = game.state;
      hud.run({
        score: runScore(state),
        metres: metresDriven(state),
        lives: state.lives,
        combo: state.combo,
        multiplier: comboMultiplier(state.combo),
        progress: progressOf(state),
        kmh: Math.round(state.drive.speed * 3.6),
      });
      return;
    }
    if (game.kind === 'rival') {
      const { state } = game;
      const plate = (side: RivalSide) => {
        const car = state.cars[side];
        return {
          name: names[side],
          rounds: state.rounds[side],
          meter: car.meter,
          state: car.state,
        };
      };
      hud.rival({
        left: plate(0),
        right: plate(1),
        meterTarget: state.config.meterTarget,
        roundsToWin: state.config.roundsToWin,
        round: state.round,
      });
      return;
    }
    const state = game.state;
    if (state.config.versus) {
      const role = (player: 0 | 1) => (player === state.driver ? 'driver' : 'donkey');
      hud.duel({
        left: { name: names[0], role: role(0), score: state.playerScores[0] },
        right: { name: names[1], role: role(1), score: state.playerScores[1] },
        climb: state.drive.climb,
        pointsToWin: state.config.pointsToWin,
      });
    } else {
      hud.duel({
        left: { name: 'Donkey', role: 'donkey', score: state.scores.donkey },
        right: { name: 'Driver', role: 'driver', score: state.scores.driver },
        climb: state.drive.climb,
        pointsToWin: state.config.pointsToWin,
      });
    }
  }

  private scene(): SceneState {
    const { game } = this;
    const { look, rivalLooks } = this.options;
    const drive = this.drive;
    const base = {
      drive,
      summit: null,
      commitGap: null,
      dropLane: null,
      palette: this.palette,
      rivalHat: look.hat,
    };
    if (game.kind === 'rival') {
      const { state } = game;
      const crashes: SceneCrash[] = [];
      for (const [side, crash] of this.rivalCrashes) {
        const age = drive.roadTime - crash.at;
        if (age < RIVAL_CRASH_SECONDS) {
          crashes.push({ hazard: crash.hazard, age, car: side, look: rivalLooks[side] });
        }
      }
      return {
        ...base,
        cars: state.cars.flatMap((car, side) =>
          car.state === 'crashed'
            ? []
            : [
                {
                  id: side,
                  lane: car.lane,
                  ghost: car.state === 'ghost',
                  stuck: false,
                  look: rivalLooks[side as RivalSide],
                  driver: side as RivalSide,
                },
              ],
        ),
        crashes,
        freeze: false,
        twoCars: true,
      };
    }
    let crash: SceneCrash | null = null;
    let summit: number | null = null;
    let commitGap: number | null = null;
    let dropLane: number | null = null;
    if (game.kind === 'run') {
      const phase = game.state.phase;
      if (phase.kind === 'crash') {
        crash = { hazard: phase.hazard, age: phase.steps * STEP_SECONDS, car: 0, look };
      } else if (phase.kind === 'over' && phase.reason === 'crashes' && this.lastCrash) {
        // The last crash keeps playing out while the run winds down.
        if (this.phase.kind === 'ending') {
          crash = { hazard: this.lastCrash, age: this.phase.time, car: 0, look };
        }
      }
    } else {
      const { state } = game;
      if (state.phase.kind === 'crash') {
        crash = { hazard: state.phase.hazard, age: state.phase.time, car: 0, look };
      }
      if (state.phase.kind === 'point') summit = state.phase.time;
      if (state.config.versus) {
        commitGap = state.config.speed * VERSUS_COMMIT_SECONDS;
        const waiting = !state.wave?.donkeys.some((donkey) => donkey.revealed && !donkey.passed);
        dropLane = waiting ? state.dropLane : null;
      }
    }
    return {
      ...base,
      cars: crash ? [] : [soloCar(drive, look)],
      crashes: crash ? [crash] : [],
      freeze: true,
      twoCars: false,
      summit,
      commitGap,
      dropLane,
    };
  }
}

type Inputs =
  | { kind: 'buttons'; driver: boolean; donkey: boolean }
  | { kind: 'rival'; steering: [RivalInput, RivalInput] };

const IDLE: Inputs = { kind: 'buttons', driver: false, donkey: false };

function isFriendRival(request: ModeRequest): boolean {
  return request.kind === 'rival' && request.opponent === 'friend';
}

/** Rival Driver's buttons for the HUD: each driver's own keys, or both pairs for one player. */
function steerLayout(
  request: Extract<ModeRequest, { kind: 'rival' }>,
  settings: Settings,
  names: readonly [string, string],
): SteerLayout {
  const [first, second] = settings.rival.keys;
  if (request.opponent === 'cpu') {
    const both = (side: 0 | 1) => `${keyLabel(first[side])} ${keyLabel(second[side])}`;
    return { drivers: [{ name: names[0], keys: [both(0), both(1)] }] };
  }
  return {
    drivers: [first, second].map((pair, index) => ({
      name: names[index as 0 | 1],
      keys: [keyLabel(pair[0]), keyLabel(pair[1])] as const,
    })),
  };
}

function createGame(request: ModeRequest, settings: Settings, seed: number): Game {
  switch (request.kind) {
    case 'classic':
      return {
        kind: 'duel',
        state: createDuel(classicDuel(seed, settings.points, settings.hazards.classic)),
      };
    case 'versus':
      return {
        kind: 'duel',
        state: createDuel(versusDuel(seed, settings.points, settings.hazards.versus)),
      };
    case 'endless':
      return {
        kind: 'run',
        state: createRun(
          endlessRun(seed, settings.difficulty, settings.hazards.endless, settings.rhythm),
        ),
      };
    case 'daily':
      return {
        kind: 'run',
        state: createRun(
          dailyRun(
            request.day.seed,
            request.practice
              ? {
                  difficulty: settings.difficulty,
                  hazards: settings.hazards.endless,
                  rhythm: settings.rhythm,
                }
              : undefined,
          ),
        ),
      };
    case 'trip':
      return {
        kind: 'run',
        state: createRun(
          legRun(request.route, request.leg, legSeed(request.route, request.leg), settings.rhythm),
        ),
      };
    case 'rival': {
      const { cpu, rounds } = settings.rival;
      return {
        kind: 'rival',
        state: createRival(rivalMatch(seed, rounds)),
        cpu: request.opponent === 'cpu' ? createRivalDriver(CPU_STYLES[cpu], 1, seed + 1) : null,
      };
    }
  }
}

export function lookFor(request: ModeRequest): LookId {
  if (request.kind === 'trip') return request.route;
  if (request.kind === 'daily')
    return ENDLESS_LOOKS[request.day.seed % ENDLESS_LOOKS.length] ?? 'home';
  return 'home';
}

function songOf(request: ModeRequest): SongId {
  if (request.kind === 'trip') return request.route;
  if (request.kind === 'endless') return 'endless';
  if (request.kind === 'daily') return 'daily';
  if (request.kind === 'rival') return 'rival';
  return 'farm';
}
