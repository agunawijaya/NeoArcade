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
import type { Hud } from '../ui/hud';
import type { Controls } from './controls';
import type { PassReporter } from './pass-report';
import { Visuals, type SceneState } from './visuals';

export type ModeRequest =
  | { kind: 'classic' }
  | { kind: 'versus' }
  | { kind: 'endless' }
  | { kind: 'daily'; day: DailyDay; practice: boolean }
  | { kind: 'trip'; route: RouteId; leg: number };

type Game = { kind: 'duel'; state: DuelState } | { kind: 'run'; state: RunState };

export type SessionOutcome =
  | { kind: 'duel'; request: ModeRequest; state: DuelState; lastPoint: 'donkey' | 'driver' | null }
  | { kind: 'run'; request: ModeRequest; state: RunState };

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

const SIGN_CAPTIONS: Record<SignKind, string> = {
  carrots: 'Carrots! Grab them for bonus points.',
  pairs: 'Donkey pairs ahead: two in a row, one in each lane.',
  mud: 'Mud ahead: switching lanes is a beat slower in it.',
  wobblers: 'Hesitant donkeys: they wobble, then commit to a lane.',
  'three-lanes': 'The road widens: each press moves one lane right, and wraps round.',
  herd: 'Herd crossing: thread the single gap in each row.',
  boss: 'A stubborn herd blocks the road. Find the gaps!',
};

export class Session {
  paused = false;
  private readonly game: Game;
  private readonly visuals: Visuals;
  private readonly palette: Palette;
  private readonly song: SongId;
  private phase: Phase;
  private lastPoint: 'donkey' | 'driver' | null = null;
  private lastCrash: Hazard | null = null;
  private ended = false;
  private roundBanner = true;

  constructor(private readonly options: SessionOptions) {
    const { request, settings, seed, hud, audio } = options;
    this.game = createGame(request, settings, seed);
    this.visuals = new Visuals(options.reducedMotion);
    this.palette = paletteFor(lookFor(request), options.theme());
    this.song = songOf(request);
    options.controls.setVersus(request.kind === 'versus');
    hud.layout(this.game.kind, request.kind === 'versus');
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

  /** The run or duel itself, for the results screen and tests. */
  get state(): RunState | DuelState {
    return this.game.state;
  }

  dispose() {
    this.options.hud.show(false);
    this.options.hud.showHint(null);
    this.options.controls.setVersus(false);
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
    document.body.dataset.lane = String(this.drive.car.lane);
    const scene = this.scene();
    document.body.dataset.moment = scene.crash ? 'crash' : scene.summit !== null ? 'summit' : '';
  }

  private advance() {
    const phase = this.phase;
    if (phase.kind === 'countdown') {
      this.countDown(phase);
      this.readInput();
      return;
    }
    if (phase.kind === 'ending') {
      phase.time += STEP_SECONDS;
      this.stepEngine(false, false);
      if (phase.time >= ENDING_SECONDS && !this.ended) this.end();
      return;
    }
    const [driver, donkey] = this.readInput();
    this.stepEngine(driver, donkey);
  }

  render(alpha: number, frameSeconds: number) {
    const frame = this.visuals.frame(
      this.scene(),
      this.paused ? 0 : alpha,
      this.paused ? 0 : frameSeconds,
    );
    this.options.stage.render(this.options.view(), frame);
  }

  private readInput(): [boolean, boolean] {
    const { controls } = this.options;
    if (this.game.kind === 'duel' && this.game.state.config.versus) {
      const state = this.game.state;
      return [controls.playerPressed(state.driver), controls.playerPressed(donkeyPlayer(state))];
    }
    return [controls.pressed, false];
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
    const { hud, request } = this.options;
    const touch = matchMedia('(pointer: coarse)').matches;
    if (request.kind === 'versus') {
      const state = this.game.state as DuelState;
      hud.banner(
        `${this.options.names[state.driver]} drives`,
        `${this.options.names[donkeyPlayer(state)]} is the donkey`,
        2,
      );
      hud.showHint(
        touch
          ? 'Each player taps their half of the screen'
          : 'Driver and donkey each press any key on their half of the keyboard',
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

  private stepEngine(driver: boolean, donkey: boolean) {
    const { game } = this;
    this.visuals.beforeStep(this.drive);
    const events: (RunEvent | DuelEvent)[] =
      game.kind === 'run'
        ? stepRun(game.state, { driver })
        : stepDuel(game.state, { driver, donkey });
    this.visuals.afterStep(this.drive);
    for (const event of events) this.react(event);
    this.syncHud();
  }

  private react(event: RunEvent | DuelEvent) {
    const { audio, hud, reporter } = this.options;
    const drive = this.drive;
    this.visuals.onEvent(event, drive);
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
        audio.play(SOUNDS.crash);
        playHeeHaw(audio, 1.05, 0.45);
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
    if (this.game.kind === 'run') onOver({ kind: 'run', request, state: this.game.state });
    else onOver({ kind: 'duel', request, state: this.game.state, lastPoint: this.lastPoint });
  }

  private syncHud() {
    const { hud, names } = this.options;
    if (this.game.kind === 'run') {
      const state = this.game.state;
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
    const state = this.game.state;
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
    const drive = this.drive;
    let crash: SceneState['crash'] = null;
    let summit: number | null = null;
    let commitGap: number | null = null;
    let dropLane: number | null = null;
    if (game.kind === 'run') {
      const phase = game.state.phase;
      if (phase.kind === 'crash') crash = { hazard: phase.hazard, age: phase.steps * STEP_SECONDS };
      else if (phase.kind === 'over' && phase.reason === 'crashes' && this.lastCrash) {
        // The last crash keeps playing out while the run winds down.
        if (this.phase.kind === 'ending') crash = { hazard: this.lastCrash, age: this.phase.time };
      }
    } else {
      const { state } = game;
      if (state.phase.kind === 'crash')
        crash = { hazard: state.phase.hazard, age: state.phase.time };
      if (state.phase.kind === 'point') summit = state.phase.time;
      if (state.config.versus) {
        commitGap = state.config.speed * VERSUS_COMMIT_SECONDS;
        const waiting = !state.wave?.donkeys.some((donkey) => donkey.revealed && !donkey.passed);
        dropLane = waiting ? state.dropLane : null;
      }
    }
    return {
      drive,
      crash,
      summit,
      commitGap,
      dropLane,
      palette: this.palette,
      look: this.options.look,
      rivalHat: this.options.look.hat,
    };
  }
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
  return 'farm';
}
