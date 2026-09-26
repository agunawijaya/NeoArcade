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
  type MatchState,
  type TurnResult,
} from '../engine/match';
import { POWER_UPS, type Balloon } from '../engine/powerups';
import { CITY_HUM, SOUNDS, VICTORY, playFanfare, type SoundName } from '../audio/sounds';
import { timeOfDayForRound, type Theme } from '../render/palette';
import { Scene, type ThrowPreview } from '../render/scene';
import type { Stage } from '../render/stage';
import { cleanName, isCpu, matchOptionsFrom, type Settings } from '../settings';
import type { Hud } from '../ui/hud';
import { formatAim, type Aim } from './aim';
import { AimGuide } from './aim-guide';
import type { Controls } from './controls';
import { HumanAim } from './human-aim';
import { ShotPlayback } from './playback';
import { reactTo, reactToNearMisses } from './reactions';

export interface MatchSummary {
  names: [string, string];
  scores: [number, number];
  winner: PlayerIndex | null;
}

export interface SessionOptions {
  settings: Settings;
  seed: number;
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
  | { kind: 'settle'; time: number; duration: number }
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
const CELEBRATE_SECONDS = 3;
/** A miss further than this from the target earns a face-palm and a taunt. */
const BAD_MISS = 120;

/**
 * One match from first throw to victory dance: runs the engine turn by turn,
 * lets people aim and the CPU think and wind up, plays every shot back
 * through the scene, and replays the decisive hit in slow motion.
 */
export class Session {
  readonly state: MatchState;
  scene!: Scene;
  paused = false;
  private phase: Phase = { kind: 'intro', time: 0 };
  private readonly names: [string, string];
  private readonly cpuMemories: [CpuMemory, CpuMemory] = [createCpuMemory(), createCpuMemory()];
  private readonly cpuRng: Rng;
  private readonly human = new HumanAim();
  private readonly guide = new AimGuide();
  private readonly aims: [Aim, Aim] = [{ ...DEFAULT_AIM }, { ...DEFAULT_AIM }];
  private readonly lastPaths: [Point[] | null, Point[] | null] = [null, null];
  private armed = false;
  private worldSpeed = 1;
  private throwsThisRound = 0;

  constructor(private readonly options: SessionOptions) {
    const { settings, seed, hud } = options;
    this.state = createMatch(matchOptionsFrom(settings, seed));
    this.cpuRng = createRng(seed ^ 0x5eed);
    this.names = ([0, 1] as const).map((player) =>
      isCpu(settings, player) && settings.names[player] === `Player ${player + 1}`
        ? 'CPU'
        : cleanName(settings.names[player], player),
    ) as [string, string];
    hud.setPlayers(this.names, [isCpu(settings, 0), isCpu(settings, 1)]);
    hud.setScores(this.state.scores, settings.points, settings.format);
    hud.setMuted(options.audio.mix.muted);
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

  private beginRound() {
    const { settings, stage, hud, audio } = this.options;
    const { round } = this.state;
    this.scene = new Scene(round, {
      timeOfDay: timeOfDayForRound(round.number, settings.weather),
      theme: this.options.theme(),
      weather: settings.weather,
      onThunder: () => this.sound('thunder'),
    });
    stage.setScene(this.scene);
    stage.camera.rest(true);
    this.scene.actors.forEach((actor, player) => (actor.shielded = round.shields[player] === true));
    this.lastPaths[0] = null;
    this.lastPaths[1] = null;
    this.throwsThisRound = 0;
    hud.setRound(round.number, round.world.name);
    hud.showBanner(`Round ${round.number}`, `${round.world.name} · ${describeWind(round.wind)}`);
    audio.playMusic(CITY_HUM);
    playFanfare(audio, ['C4', 'Eb4', 'G4', 'C5']);
    this.phase = { kind: 'intro', time: 0 };
    document.body.dataset.round = String(round.number);
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
        phase.time += delta;
        if (phase.time >= phase.duration) this.beginTurn();
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
    if (this.isCpuTurn()) {
      const level = this.options.settings.cpuLevel;
      const plan = planThrow(this.state, this.cpuMemories[player], level, this.cpuRng);
      cpu = {
        plan,
        thinking: thinkingSeconds(level, this.cpuRng),
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
    if (this.options.settings.aiming === 'typed') {
      return 'Type the angle, Enter, then the velocity, Enter';
    }
    return this.options.touch()
      ? 'Drag back from your gorilla to aim, let go to throw'
      : 'Drag back from your gorilla, or use ← → ↑ ↓ and Space';
  }

  private isCpuTurn(): boolean {
    return isCpu(this.options.settings, this.state.turn);
  }

  private humanAim(delta: number) {
    const player = this.state.turn;
    const { input } = this.options.controls;
    if (input.wasPressed('powerUp')) this.togglePowerUp(player);
    if (input.wasPressed('guide')) this.toggleGuide();
    if (this.options.settings.aiming === 'typed') {
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
    if (!isCpu(this.options.settings, otherPlayer(this.state.turn))) return;
    const enabled = this.guide.toggle();
    this.options.hud.toast(enabled ? 'Aim guide on' : 'Aim guide off');
    this.sound('tick');
  }

  /** Aim assist shows the opening of the throw; the hidden guide (C) shows all of it. */
  private showGuide(aim: Aim) {
    const whole = this.guide.enabled;
    if (!whole && !this.options.settings.aimAssist) {
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
    if (this.options.settings.aiming !== 'typed' || this.paused) return;
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
    const aim = { angle: phase.aim.angle, velocity: phase.aim.power, usePowerUp: this.armed };
    const result = takeTurn(this.state, aim);
    if (cpuTurn) observeThrow(this.cpuMemories[player], aim, result.shot, this.state);
    this.throwsThisRound++;
    this.armed = false;

    const actor = this.scene.actors[player];
    actor.holdingBanana = false;
    if (result.usedPowerUp) {
      this.options.hud.toast(
        `${this.names[player]} uses ${POWER_UPS[result.usedPowerUp].name}!`,
        player,
      );
      if (result.usedPowerUp === 'shield') actor.shielded = true;
    }
    this.scene.wind = result.shot.wind;
    const hand = throwingHand(round.gorillas[player], player);
    this.scene.effects.whoosh(hand.x, hand.y);
    this.sound('throw');
    this.lastPaths[player] = result.shot.tracks[0]?.points ?? null;
    this.scene.ghost = null;
    this.scene.clearTrails();
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

    for (const event of events) {
      reactTo(event, {
        scene: this.scene,
        camera,
        gorillas,
        names: this.names,
        thrower: result.shot.input.thrower,
        replaying,
        sound: (name, velocity) => this.sound(name, velocity),
        toast: (text, player) => this.options.hud.toast(text, player),
      });
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

  private settleMiss(result: TurnResult) {
    const thrower = result.shot.input.thrower;
    const target = gorillaCentre(this.state.round.gorillas[otherPlayer(thrower)]);
    const miss = Math.min(
      ...result.shot.tracks.map((track) => {
        const end = track.points.at(-1) ?? target;
        return Math.hypot(end.x - target.x, end.y - target.y);
      }),
    );
    const bad = miss > BAD_MISS;
    this.scene.actors[thrower].setMood(bad ? 'facepalm' : 'idle');
    this.scene.actors[otherPlayer(thrower)].setMood(bad ? 'taunt' : 'idle');
    this.scene.activePlayer = null;
    this.phase = { kind: 'settle', time: 0, duration: bad ? 1.5 : 0.9 };
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
    this.phase = {
      kind: 'replay',
      playback: new ShotPlayback(result.shot, STEPS_PER_SECOND),
      result,
    };
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
    const { hud, settings, stage, audio } = this.options;
    this.scene.actors[scorer].setMood('dance');
    this.scene.activePlayer = null;
    stage.camera.pushIn(gorillaCentre(this.state.round.gorillas[scorer]), 1.12);
    hud.setScores(this.state.scores, settings.points, settings.format);
    const selfHit = result.shot.victim === result.shot.input.thrower;
    hud.toast(
      selfHit ? `Self-hit! Point to ${this.names[scorer]}` : `${this.names[scorer]} scores!`,
      scorer,
    );
    playFanfare(audio, ['G4', 'C5', 'E5', 'G5', 'C6'], 0.08);
    this.phase = { kind: 'celebrate', time: 0, result };
  }

  private afterCelebration() {
    if (this.state.status === 'matchOver') {
      this.phase = { kind: 'over' };
      this.options.audio.playMusic(VICTORY);
      this.options.onMatchOver({
        names: this.names,
        scores: [...this.state.scores],
        winner: this.state.winner,
      });
      return;
    }
    startNextRound(this.state);
    this.beginRound();
  }

  private syncHud() {
    const { hud, stage, settings } = this.options;
    const player = this.state.turn;
    const aiming = this.phase.kind === 'aim';
    const cpuTurn = this.isCpuTurn();
    const cpuThinking =
      this.phase.kind === 'aim' && this.phase.cpu !== null && this.phase.cpu.thinking > 0;
    hud.setTurn(aiming || this.phase.kind === 'throw' ? player : null);
    hud.setWind(this.state.round.wind, aiming && this.armed && this.state.held[player] === 'calm');
    for (const index of [0, 1] as const) {
      const theirs = index === player;
      hud.setHeld(
        index,
        this.state.held[index],
        theirs && this.armed,
        aiming && theirs && !cpuTurn,
      );
    }

    const typing = settings.aiming === 'typed' && aiming && !cpuTurn;
    const { typed } = this.human;
    hud.showTyped(
      typing ? player : null,
      typed.field,
      typed.text,
      typed.angle,
      this.options.touch(),
    );

    const hand = throwingHand(this.state.round.gorillas[player], player);
    const label = stage.camera.toScreen({ x: hand.x + (player === 0 ? -6 : 6), y: hand.y - 10 });
    const showReadout = aiming && !typing && !cpuThinking;
    hud.showAim(showReadout ? label : null, formatAim(this.aims[player]), player);
  }

  private sound(name: SoundName, velocity = 1) {
    this.options.audio.play(SOUNDS[name] as Sound, { velocity });
  }
}

function describeWind(wind: number): string {
  if (wind === 0) return 'no wind';
  return `wind ${Math.abs(wind)} ${wind > 0 ? '→' : '←'}`;
}
