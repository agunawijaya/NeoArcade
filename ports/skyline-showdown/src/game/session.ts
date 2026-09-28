import type { AudioEngine, Sound } from '@shared/audio';
import { createRng, type Rng } from '@shared/rng';
import {
  createCpuMemory,
  observeThrow,
  planThrow,
  thinkingSeconds,
  type CpuAim,
  type CpuMemory,
} from '../engine/ai';
import { STEPS_PER_SECOND } from '../engine/constants';
import type { Circle, Point, Rect } from '../engine/geometry';
import { gorillaCentre, otherPlayer, throwingHand, type PlayerIndex } from '../engine/gorillas';
import {
  createMatch,
  startNextRound,
  takeTurn,
  type BetweenThrows,
  type MatchState,
  type TurnResult,
} from '../engine/match';
import { POWER_UPS, type Balloon } from '../engine/powerups';
import { CITY_HUM, SOUNDS, VICTORY, playFanfare, type SoundName } from '../audio/sounds';
import type { Theme } from '../render/palette';
import { Scene, type ThrowPreview } from '../render/scene';
import type { Stage } from '../render/stage';
import type { Rival } from '../tour/rivals';
import type { Hud } from '../ui/hud';
import { formatAim, type Aim } from './aim';
import { AimGuide } from './aim-guide';
import type { Controls } from './controls';
import { HumanAim } from './human-aim';
import type { ThrowReport } from './pass-reporter';
import { ShotPlayback } from './playback';
import { reactTo, reactToNearMisses, type ReactionContext } from './reactions';
import type { MatchSetup } from './setup';
import { commentFor, describeMiss, judgeMiss, type Miss } from './so-close';

export interface MatchSummary {
  names: [string, string];
  accents: [string, string];
  scores: [number, number];
  winner: PlayerIndex | null;
  /** Each player's throws over the whole match. */
  throws: [number, number];
  /** Aim assist or the hidden guide helped at some point. */
  assisted: boolean;
}

export interface SessionOptions {
  setup: MatchSetup;
  stage: Stage;
  hud: Hud;
  audio: AudioEngine;
  controls: Controls;
  reducedMotion: () => boolean;
  touch: () => boolean;
  /** Read at the start of each round, so a change shows from the next city on. */
  theme: () => Theme;
  onMatchOver: (summary: MatchSummary) => void;
  onPause: () => void;
  /** Every throw as it is made, for the Arcade Pass. */
  onThrow?: (report: ThrowReport) => void;
  /** A turn begins: the playfield needs the player's attention. */
  onTurnStart?: () => void;
  /** A point was scored: a good moment for news. */
  onPoint?: () => void;
}

/** The city as it was before a throw, so the replay can rewind to it. */
interface Snapshot {
  craters: Circle[];
  cuts: Rect[];
  windows: boolean[];
  balloon: Balloon | null;
}

interface CpuTurn {
  plan: CpuAim;
  thinking: number;
  windup: number;
  from: Aim;
}

type Phase =
  | { kind: 'intro'; time: number }
  | { kind: 'aim'; time: number; cpu: CpuTurn | null }
  | { kind: 'throw'; time: number; aim: Aim; released: boolean }
  | { kind: 'flight'; playback: ShotPlayback; result: TurnResult; before: Snapshot }
  | { kind: 'settle'; time: number; duration: number; between: BetweenThrows }
  | { kind: 'impact'; time: number; result: TurnResult; before: Snapshot }
  | { kind: 'replay'; playback: ShotPlayback; result: TurnResult }
  | { kind: 'celebrate'; time: number; result: TurnResult }
  | { kind: 'over' };

const DEFAULT_AIM: Aim = { angle: 45, power: 60 };
const INTRO_SECONDS = 2;
const THROW_RELEASE = 0.13;
const WINDUP_SECONDS = 0.9;
const IMPACT_SECONDS = 1.5;
const REPLAY_SPEED = 0.35;
/** The replay shows at most this many seconds of flight before the hit: long lunar arcs join late. */
const REPLAY_WINDOW = 2.5;
const CELEBRATE_SECONDS = 3;
/** A miss further than this earns a face-palm and a taunt. */
const BAD_MISS_METRES = 8;
/** A miss this close gets a rival talking. */
const NEAR_MISS_METRES = 5;
/** Long enough to read "So close!" before the next turn; the CPU's lighter version is quicker. */
const SETTLE_SECONDS = { person: 1.6, cpu: 1.1 };
/** When lightning strikes and a gust arrives, into the pause between throws. */
const STRIKE_AT = 0.45;
const GUST_AT = 0.75;
/** A rival's bubble floats this far above their head. */
const SPEECH_LIFT = 16;

/**
 * One match from first throw to victory dance: runs the engine turn by turn,
 * lets people aim and the CPU think and wind up, plays every shot back
 * through the scene, shows how close each miss came, lets the World Tour's
 * twists act between throws, and replays the decisive hit in slow motion.
 */
export class Session {
  readonly state: MatchState;
  scene!: Scene;
  paused = false;
  private phase: Phase = { kind: 'intro', time: 0 };
  private readonly names: [string, string];
  private readonly accents: [string, string];
  private readonly cpuMemories: [CpuMemory, CpuMemory] = [createCpuMemory(), createCpuMemory()];
  private readonly cpuRng: Rng;
  /** Picks comments and rival lines; kept apart from the CPU's generator so its throws never change. */
  private readonly chatter: Rng;
  private readonly human = new HumanAim();
  private readonly guide = new AimGuide();
  private readonly aims: [Aim, Aim] = [{ ...DEFAULT_AIM }, { ...DEFAULT_AIM }];
  private readonly lastPaths: [Point[] | null, Point[] | null] = [null, null];
  private readonly throwsBy: [number, number] = [0, 0];
  private firstThrow: [boolean, boolean] = [true, true];
  private armed = false;
  private assisted: boolean;
  private worldSpeed = 1;
  private throwsThisRound = 0;
  /** The wind the gauge shows: the throw's own until a gust has been seen to arrive. */
  private shownWind = 0;
  private lastComment: string | null = null;
  private lastLine: string | null = null;
  private speaker: PlayerIndex | null = null;
  /** A rival's jab at a near miss, kept until the pin has faded so the two never overlap. */
  private pendingTaunt = false;
  private missAt: Point | null = null;

  constructor(private readonly options: SessionOptions) {
    const { setup, hud } = options;
    this.state = createMatch(setup.match);
    this.cpuRng = createRng(setup.match.seed ^ 0x5eed);
    this.chatter = createRng(setup.match.seed ^ 0xc4a7);
    this.names = [setup.players[0].name, setup.players[1].name];
    this.accents = [setup.players[0].look.accent, setup.players[1].look.accent];
    this.assisted = setup.aimAssist;
    hud.setPlayers(this.names, [this.isCpu(0), this.isCpu(1)], this.accents);
    hud.setScores(this.state.scores, setup.match.points, setup.match.format);
    hud.setMuted(options.audio.mix.muted);
    hud.setTwist(setup.tourStage?.twist.name ?? null);
    hud.show(true);
    window.addEventListener('keydown', this.onTypedKey);
    this.beginRound();
  }

  dispose() {
    const { hud } = this.options;
    window.removeEventListener('keydown', this.onTypedKey);
    hud.show(false);
    hud.showAim(null, '', 0);
    hud.showTyped(null, 'angle', '', null, false);
    hud.hint(null);
    hud.showReplay(false);
    hud.hush();
    hud.clearMiss();
    hud.setTwist(null);
    hud.setThrows(null, null);
  }

  update(delta: number) {
    const { input } = this.options.controls;
    input.update();
    if (input.wasPressed('mute')) this.toggleMute();
    if (this.paused) return;
    if (input.wasPressed('pause')) {
      this.options.onPause();
      return;
    }

    const worldDelta = delta * this.worldSpeed;
    this.advancePhase(delta, worldDelta);
    this.scene.update(worldDelta, this.options.reducedMotion());
    this.options.stage.camera.update(delta);
    this.syncHud();
    document.body.dataset.phase = this.phase.kind;
  }

  toggleMute() {
    this.options.audio.toggleMute();
    this.options.hud.setMuted(this.options.audio.mix.muted);
  }

  /** Arms or disarms the held power-up for the person whose turn it is. */
  togglePowerUp(player: PlayerIndex) {
    if (this.phase.kind !== 'aim' || player !== this.state.turn || this.isCpuTurn()) return;
    if (!this.state.held[player]) return;
    this.armed = !this.armed;
    this.sound('tick');
  }

  keypad(key: string) {
    this.typeKey(key);
  }

  skipReplay() {
    if (this.phase.kind === 'replay') this.finishReplay(this.phase.result);
  }

  private isCpu(player: PlayerIndex): boolean {
    return this.options.setup.players[player].cpu !== null;
  }

  private isCpuTurn(): boolean {
    return this.isCpu(this.state.turn);
  }

  private beginRound() {
    const { setup, stage, hud, audio } = this.options;
    const { round } = this.state;
    this.scene = new Scene(round, {
      timeOfDay: setup.scenery.timeOfDay(round.number),
      theme: this.options.theme(),
      weather: setup.scenery.weather,
      kit: setup.scenery.kit,
      looks: [setup.players[0].look, setup.players[1].look],
      onThunder: () => this.sound('thunder'),
    });
    stage.setScene(this.scene);
    stage.camera.rest(true);
    this.scene.actors.forEach((actor, player) => (actor.shielded = round.shields[player] === true));
    this.lastPaths[0] = null;
    this.lastPaths[1] = null;
    this.throwsThisRound = 0;
    this.firstThrow = [true, true];
    this.shownWind = round.wind;
    this.missAt = null;
    hud.resetWind();
    hud.clearMiss();
    const place = setup.tourStage?.city ?? round.world.name;
    hud.setRound(round.number, place);
    hud.showBanner(`Round ${round.number}`, `${place} · ${this.describeWind()}`);
    this.showThrowCount();
    audio.playMusic(CITY_HUM);
    playFanfare(audio, ['C4', 'Eb4', 'G4', 'C5']);
    if (round.number === 1) this.rivalSays((rival) => rival.lines.intro);
    this.phase = { kind: 'intro', time: 0 };
    document.body.dataset.round = String(round.number);
  }

  private describeWind(): string {
    const { round } = this.state;
    if (round.twists.includes('hiddenWind')) return 'wind hidden';
    if (round.wind === 0) return 'no wind';
    return `wind ${Math.abs(round.wind)} ${round.wind > 0 ? '→' : '←'}`;
  }

  private showThrowCount() {
    const stage = this.options.setup.tourStage;
    this.options.hud.setThrows(stage ? this.throwsBy[0] : null, stage?.throwBudget ?? null);
  }

  private advancePhase(delta: number, worldDelta: number) {
    const phase = this.phase;
    switch (phase.kind) {
      case 'intro':
        phase.time += delta;
        if (phase.time >= INTRO_SECONDS) this.beginTurn();
        break;
      case 'aim':
        phase.time += delta;
        if (phase.cpu) this.cpuAim(phase.cpu, delta);
        else this.humanAim(delta);
        break;
      case 'throw':
        phase.time += delta;
        if (!phase.released && phase.time >= THROW_RELEASE) this.release(phase);
        break;
      case 'flight':
        this.fly(phase, worldDelta);
        break;
      case 'settle':
        this.settle(phase, delta);
        break;
      case 'impact':
        // Slow motion for the first moments of the blast, easing back to full speed.
        phase.time += delta;
        this.worldSpeed = phase.time < 0.9 ? 0.25 : Math.min(1, 0.25 + (phase.time - 0.9) * 1.5);
        if (phase.time >= IMPACT_SECONDS) this.beginReplay(phase.result, phase.before);
        break;
      case 'replay': {
        this.fly(phase, worldDelta);
        const { input } = this.options.controls;
        if (this.phase === phase && (input.wasPressed('fire') || input.pointer.wasPressed)) {
          this.finishReplay(phase.result);
        }
        break;
      }
      case 'celebrate':
        phase.time += delta;
        if (phase.time >= CELEBRATE_SECONDS) this.afterCelebration();
        break;
      case 'over':
        break;
    }
  }

  private beginTurn() {
    const player = this.state.turn;
    const { scene } = this;
    this.options.onTurnStart?.();
    this.options.hud.showMiss(null);
    this.missAt = null;
    if (this.pendingTaunt) {
      this.pendingTaunt = false;
      this.rivalSays((rival) => this.freshLine(rival.lines.taunt));
    }
    this.armed = false;
    this.human.reset();
    scene.activePlayer = player;
    scene.ghost = this.lastPaths[player];
    this.drawGuide(null);
    scene.balloon = this.state.round.balloon;
    this.guide.reset();
    scene.actors.forEach((actor, index) => {
      actor.setMood(index === player ? 'aim' : 'idle');
      actor.holdingBanana = index === player;
      actor.aimAngle = this.aims[player].angle;
      actor.lookAt = gorillaCentre(this.state.round.gorillas[otherPlayer(index as PlayerIndex)]);
    });
    scene.skyBody.lookAt = null;
    scene.skyBody.calm();
    this.options.stage.camera.rest();

    let cpu: CpuTurn | null = null;
    const brain = this.options.setup.players[player].cpu;
    if (brain) {
      const plan = planThrow(
        this.state,
        this.cpuMemories[player],
        brain.level,
        this.cpuRng,
        brain.style,
      );
      cpu = {
        plan,
        thinking: thinkingSeconds(brain.level, this.cpuRng),
        windup: 0,
        from: { ...this.aims[player] },
      };
      scene.actors[player].setMood('idle');
    }
    this.phase = { kind: 'aim', time: 0, cpu };
    this.options.hud.hint(cpu ? null : this.aimHint());
    document.body.dataset.turn = String(player);
  }

  private aimHint(): string | null {
    if (this.throwsThisRound > 1 && this.state.round.number > 1) return null;
    if (this.options.setup.aiming === 'typed') {
      return 'Type the angle, Enter, then the velocity, Enter';
    }
    return this.options.touch()
      ? 'Drag back from your gorilla to aim, let go to throw'
      : 'Drag back from your gorilla, or use ← → ↑ ↓ and Space';
  }

  private humanAim(delta: number) {
    const player = this.state.turn;
    const { input } = this.options.controls;
    if (input.wasPressed('powerUp')) this.togglePowerUp(player);
    if (input.wasPressed('guide')) this.toggleGuide();
    if (this.options.setup.aiming === 'typed') {
      this.showGuide(this.typedAim(player));
      return;
    }

    const gorilla = this.state.round.gorillas[player];
    const step = this.human.update(
      delta,
      player,
      this.aims[player],
      input,
      this.options.stage.camera,
      gorilla,
    );
    if (step.ticked) this.sound('tick', 0.5);
    this.aims[player] = step.aim;
    this.scene.aimLine = step.band;
    this.scene.actors[player].aimAngle = step.aim.angle;
    this.showGuide(step.aim);
    if (step.throwNow) this.beginThrow(step.aim);
  }

  private toggleGuide() {
    if (!this.isCpu(otherPlayer(this.state.turn))) return;
    const enabled = this.guide.toggle();
    if (enabled) this.assisted = true;
    this.options.hud.toast(enabled ? 'Aim guide on' : 'Aim guide off');
    this.sound('tick');
  }

  /** Aim assist shows the opening of the throw; the hidden guide (C) shows all of it. */
  private showGuide(aim: Aim) {
    const whole = this.guide.enabled;
    if (!whole && !this.options.setup.aimAssist) {
      this.drawGuide(null);
      return;
    }
    const shot = this.guide.predict(this.state, {
      angle: aim.angle,
      velocity: aim.power,
      usePowerUp: this.armed,
    });
    this.drawGuide({ shot, whole });
  }

  private drawGuide(preview: ThrowPreview | null) {
    this.scene.guide = preview;
    document.body.dataset.guide = preview ? this.guideOutcome(preview) : 'off';
  }

  private guideOutcome({ shot, whole }: ThrowPreview): string {
    if (!whole) return 'assist';
    if (shot.victim === null) return 'miss';
    return shot.victim === this.state.turn ? 'self' : 'hit';
  }

  /** The throw as typed so far, with last throw's numbers filling any gap. */
  private typedAim(player: PlayerIndex): Aim {
    const { typed } = this.human;
    const value = Number.parseFloat(typed.text);
    const last = this.aims[player];
    if (typed.field === 'angle') {
      return { angle: Number.isFinite(value) ? value : last.angle, power: last.power };
    }
    return { angle: typed.angle ?? last.angle, power: Number.isFinite(value) ? value : last.power };
  }

  private readonly onTypedKey = (event: KeyboardEvent) => {
    if (this.options.setup.aiming !== 'typed' || this.paused) return;
    if (!/^([0-9.,]|Backspace|Enter)$/.test(event.key)) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return;
    this.typeKey(event.key);
  };

  private typeKey(key: string) {
    if (this.phase.kind !== 'aim' || this.phase.cpu) return;
    const result = this.human.typeKey(key);
    this.sound(result.kind === 'rejected' ? 'beep' : 'tick', result.kind === 'rejected' ? 1 : 0.6);
    if (result.kind === 'done') {
      const aim = { angle: result.angle, power: result.velocity };
      this.aims[this.state.turn] = aim;
      this.beginThrow(aim);
    }
  }

  private cpuAim(turn: CpuTurn, delta: number) {
    const player = this.state.turn;
    if (turn.thinking > 0) {
      turn.thinking -= delta;
      if (turn.thinking <= 0) {
        this.scene.actors[player].setMood('aim');
        if (turn.plan.usePowerUp && this.state.held[player]) this.armed = true;
      }
      return;
    }
    // The wind-up: the arm swings to the chosen aim so players can see it coming.
    turn.windup = Math.min(1, turn.windup + delta / WINDUP_SECONDS);
    const ease = 1 - (1 - turn.windup) ** 3;
    this.aims[player] = {
      angle: turn.from.angle + (turn.plan.angle - turn.from.angle) * ease,
      power: turn.from.power + (turn.plan.velocity - turn.from.power) * ease,
    };
    this.scene.actors[player].aimAngle = this.aims[player].angle;
    if (turn.windup >= 1) this.beginThrow({ angle: turn.plan.angle, power: turn.plan.velocity });
  }

  private beginThrow(aim: Aim) {
    this.drawGuide(null);
    this.scene.actors[this.state.turn].setMood('throw');
    this.options.hud.hint(null);
    this.phase = { kind: 'throw', time: 0, aim, released: false };
  }

  private release(phase: Extract<Phase, { kind: 'throw' }>) {
    phase.released = true;
    const player = this.state.turn;
    const cpuTurn = this.isCpuTurn();
    const { round } = this.state;
    const before: Snapshot = {
      craters: [...round.terrain.craters],
      cuts: [...round.terrain.cuts],
      windows: this.scene.city.snapshot(),
      balloon: round.balloon,
    };
    const lightningTarget = round.lightningTarget;
    const aim = { angle: phase.aim.angle, velocity: phase.aim.power, usePowerUp: this.armed };
    const result = takeTurn(this.state, aim);
    if (cpuTurn) observeThrow(this.cpuMemories[player], aim, result.shot, this.state);
    this.options.onThrow?.({ result, round, firstThrow: this.firstThrow[player] });
    this.firstThrow[player] = false;
    this.throwsBy[player]++;
    this.throwsThisRound++;
    this.armed = false;
    this.showThrowCount();

    const { scene } = this;
    const actor = scene.actors[player];
    actor.holdingBanana = false;
    if (result.usedPowerUp) {
      this.options.hud.toast(
        `${this.names[player]} uses ${POWER_UPS[result.usedPowerUp].name}!`,
        this.accents[player],
      );
      if (result.usedPowerUp === 'shield') actor.shielded = true;
    }
    scene.wind = result.shot.wind;
    scene.thrower = player;
    // The hazards as they were for this throw; the lightning mark stays until it strikes.
    scene.hazards.show(result.hazards, lightningTarget);
    scene.hazards.droneStep = 0;
    const hand = throwingHand(round.gorillas[player], player);
    scene.effects.whoosh(hand.x, hand.y);
    this.sound('throw');
    this.lastPaths[player] = result.shot.tracks[0]?.points ?? null;
    scene.ghost = null;
    scene.clearTrails();
    this.phase = {
      kind: 'flight',
      playback: new ShotPlayback(result.shot, STEPS_PER_SECOND),
      result,
      before,
    };
  }

  private fly(phase: Extract<Phase, { kind: 'flight' | 'replay' }>, worldDelta: number) {
    const replaying = phase.kind === 'replay';
    const { result } = phase;
    const { gorillas } = this.state.round;
    const { camera } = this.options.stage;
    const events = phase.playback.advance(worldDelta * (replaying ? REPLAY_SPEED : 1));
    const bananas = phase.playback.bananas;
    this.scene.bananas = bananas;
    this.scene.hazards.droneStep = phase.playback.clock;

    for (const event of events) {
      reactTo(event, this.reactionContext(result, replaying));
      if (event.type === 'gorilla' && phase.kind === 'flight') {
        this.phase = { kind: 'impact', time: 0, result, before: phase.before };
        return;
      }
    }

    const lead = bananas[0];
    if (lead) {
      this.scene.skyBody.lookAt = lead;
      this.scene.actors.forEach((actor) => (actor.lookAt = lead));
      if (!replaying) camera.follow(lead);
      reactToNearMisses(
        this.scene,
        gorillas,
        bananas,
        result.shot.input.thrower,
        phase.playback.clock,
      );
    }
    if (replaying && result.shot.victim !== null) {
      // Push in on the moment it lands, keeping both banana and victim in shot.
      const victim = gorillaCentre(gorillas[result.shot.victim]);
      const focus = lead
        ? { x: (lead.x + victim.x * 2) / 3, y: (lead.y + victim.y * 2) / 3 }
        : victim;
      camera.pushIn(focus, 1.4);
    }

    if (!phase.playback.done) return;
    this.scene.bananas = [];
    if (replaying) this.finishReplay(result);
    else this.settleMiss(result);
  }

  private reactionContext(result: TurnResult, replaying: boolean): ReactionContext {
    return {
      scene: this.scene,
      camera: this.options.stage.camera,
      gorillas: this.state.round.gorillas,
      names: this.names,
      thrower: result.shot.input.thrower,
      replaying,
      sound: (name, velocity) => this.sound(name, velocity),
      toast: (text, player) =>
        this.options.hud.toast(text, player === null ? null : this.accents[player]),
    };
  }

  /** After a miss: how close it came, a reaction from both gorillas, and the world moving on. */
  private settleMiss(result: TurnResult) {
    const thrower = result.shot.input.thrower;
    const { gorillas, world } = this.state.round;
    const miss = judgeMiss(result.shot, gorillas, world.gravity);
    const person = !this.isCpu(thrower);
    this.showSoClose(miss, thrower, person);

    const bad = miss.metres > BAD_MISS_METRES;
    this.scene.actors[thrower].setMood(bad ? 'facepalm' : 'idle');
    this.scene.actors[otherPlayer(thrower)].setMood(bad ? 'taunt' : 'idle');
    this.scene.activePlayer = null;
    this.pendingTaunt = person && miss.metres <= NEAR_MISS_METRES;

    // The drone flies on and the dust devil wanders; lightning and gusts wait a moment.
    this.scene.hazards.show(this.state.round.hazards, this.scene.hazards.lightningTarget);
    const { between } = result;
    const events = Math.max(between.strike ? STRIKE_AT : 0, between.wind !== null ? GUST_AT : 0);
    const base = person ? SETTLE_SECONDS.person : SETTLE_SECONDS.cpu;
    const duration = Math.max(base + (bad ? 0.3 : 0), events > 0 ? events + 0.8 : 0);
    this.phase = { kind: 'settle', time: 0, duration, between };
  }

  private showSoClose(miss: Miss, thrower: PlayerIndex, person: boolean) {
    const comment = person ? commentFor(miss, this.lastComment, this.chatter) : null;
    if (comment) this.lastComment = comment;
    this.missAt = miss.landing;
    this.options.hud.showMiss({
      label: describeMiss(miss),
      comment,
      accent: this.accents[thrower],
    });
    document.body.dataset.miss = miss.verdict;
  }

  private settle(phase: Extract<Phase, { kind: 'settle' }>, delta: number) {
    const before = phase.time;
    phase.time += delta;
    const reached = (moment: number) => before < moment && phase.time >= moment;
    const { strike, wind } = phase.between;
    if (strike && reached(STRIKE_AT)) this.playStrike(strike.building, strike.crater);
    if (wind !== null && reached(GUST_AT)) {
      this.shownWind = wind;
      this.scene.wind = wind;
      this.options.hud.toast('A gust! The wind has changed');
      this.sound('tick');
    }
    if (phase.time >= phase.duration) this.beginTurn();
  }

  /** Lightning hits the marked roof, then the next one is marked. */
  private playStrike(building: number, crater: Circle) {
    const { scene } = this;
    scene.hazards.strike(building, crater);
    scene.city.carve(crater);
    scene.city.darkenAround(crater.x, crater.y, crater.radius * 2.5);
    scene.effects.explode(crater.x, crater.y, 9, scene.city.facadeAt(building), true);
    this.options.stage.camera.shake(0.45, 6);
    this.sound('thunder');
    this.sound('bigBoom', 0.7);
    scene.hazards.lightningTarget = this.state.round.lightningTarget;
  }

  private beginReplay(result: TurnResult, before: Snapshot) {
    this.worldSpeed = 1;
    if (this.options.reducedMotion()) {
      this.celebrate(result);
      return;
    }
    const { scene } = this;
    scene.city.restore(before.craters, before.cuts, before.windows);
    scene.balloon = before.balloon;
    scene.effects.clear();
    scene.clearTrails();
    const victim = result.shot.victim;
    if (victim !== null) scene.actors[victim].setMood('panic');
    scene.skyBody.calm();
    this.options.hud.showReplay(true);
    const playback = new ShotPlayback(result.shot, STEPS_PER_SECOND);
    const hit = result.shot.events.find((event) => event.type === 'gorilla');
    const start = (hit?.step ?? 0) - REPLAY_WINDOW * STEPS_PER_SECOND;
    if (start > 0) {
      for (const event of playback.skipTo(start)) {
        reactTo(event, this.reactionContext(result, true));
      }
    }
    this.phase = { kind: 'replay', playback, result };
  }

  private finishReplay(result: TurnResult) {
    const { scene } = this;
    const { terrain, balloon } = this.state.round;
    scene.city.restore(terrain.craters, terrain.cuts, scene.city.snapshot());
    scene.bananas = [];
    if (result.shot.victim !== null) scene.actors[result.shot.victim].setMood('gone');
    scene.balloon = balloon;
    this.options.hud.showReplay(false);
    this.celebrate(result);
  }

  private celebrate(result: TurnResult) {
    const scorer = result.scorer ?? 0;
    const { hud, setup, stage, audio } = this.options;
    this.scene.actors[scorer].setMood('dance');
    this.scene.activePlayer = null;
    stage.camera.pushIn(gorillaCentre(this.state.round.gorillas[scorer]), 1.12);
    hud.setScores(this.state.scores, setup.match.points, setup.match.format);
    const selfHit = result.shot.victim === result.shot.input.thrower;
    hud.toast(scoreLine(this.names[scorer], selfHit), this.accents[scorer]);
    // A rival who is hit says so; one who scores rubs it in.
    const rivalSide = setup.players[scorer].rival ? scorer : otherPlayer(scorer);
    this.rivalSays((rival) =>
      this.freshLine(rivalSide === scorer ? rival.lines.taunt : rival.lines.hit),
    );
    playFanfare(audio, ['G4', 'C5', 'E5', 'G5', 'C6'], 0.08);
    this.options.onPoint?.();
    this.phase = { kind: 'celebrate', time: 0, result };
  }

  private afterCelebration() {
    if (this.state.status === 'matchOver') {
      this.phase = { kind: 'over' };
      this.options.hud.hush();
      this.options.audio.playMusic(VICTORY);
      this.options.onMatchOver({
        names: this.names,
        accents: this.accents,
        scores: [...this.state.scores],
        winner: this.state.winner,
        throws: [...this.throwsBy],
        assisted: this.assisted,
      });
      return;
    }
    startNextRound(this.state);
    this.beginRound();
  }

  /** Lets whichever side is a rival say something. */
  private rivalSays(line: (rival: Rival) => string) {
    const side = ([1, 0] as const).find((player) => this.options.setup.players[player].rival);
    if (side === undefined) return;
    const rival = this.options.setup.players[side].rival;
    if (!rival) return;
    this.speaker = side;
    this.options.hud.say(line(rival), this.accents[side], side);
  }

  /** A line from a set, never the one said last. */
  private freshLine(lines: readonly string[]): string {
    const fresh = lines.filter((line) => line !== this.lastLine);
    const line = this.chatter.pick(fresh.length > 0 ? fresh : lines);
    this.lastLine = line;
    return line;
  }

  private syncHud() {
    const { hud, stage, setup } = this.options;
    const player = this.state.turn;
    const aiming = this.phase.kind === 'aim';
    const cpuTurn = this.isCpuTurn();
    const cpuThinking =
      this.phase.kind === 'aim' && this.phase.cpu !== null && this.phase.cpu.thinking > 0;
    hud.setTurn(aiming || this.phase.kind === 'throw' ? player : null);
    hud.setWind(
      this.shownWind,
      aiming && this.armed && this.state.held[player] === 'calm',
      this.state.round.twists.includes('hiddenWind'),
    );
    for (const index of [0, 1] as const) {
      const theirs = index === player;
      hud.setHeld(
        index,
        this.state.held[index],
        theirs && this.armed,
        aiming && theirs && !cpuTurn,
      );
    }

    const typing = setup.aiming === 'typed' && aiming && !cpuTurn;
    const { typed } = this.human;
    hud.showTyped(
      typing ? player : null,
      typed.field,
      typed.text,
      typed.angle,
      this.options.touch(),
    );

    const { camera } = stage;
    const hand = throwingHand(this.state.round.gorillas[player], player);
    const label = camera.toScreen({ x: hand.x + (player === 0 ? -6 : 6), y: hand.y - 10 });
    const showReadout = aiming && !typing && !cpuThinking;
    hud.showAim(showReadout ? label : null, formatAim(this.aims[player]), player);

    const bounds = { width: stage.surface.clientWidth, height: stage.surface.clientHeight };
    if (this.speaker !== null) {
      const gorilla = this.state.round.gorillas[this.speaker];
      hud.placeSpeech(camera.toScreen({ x: gorilla.x + 15, y: gorilla.y - SPEECH_LIFT }), bounds);
    }
    hud.placeMiss(this.missAt ? camera.toScreen(this.missAt) : null, bounds);
  }

  private sound(name: SoundName, velocity = 1) {
    this.options.audio.play(SOUNDS[name] as Sound, { velocity });
  }
}

/** "Ada scores!", or on the tour, where you are "You", "You score!". */
function scoreLine(name: string, selfHit: boolean): string {
  const you = name === 'You';
  if (selfHit) return you ? 'Self-hit! Your point' : `Self-hit! Point to ${name}`;
  return you ? 'You score!' : `${name} scores!`;
}
