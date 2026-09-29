import type { AudioEngine, Sound } from '@shared/audio';
import { CITY_HUM, SOUNDS, type SoundName } from '../audio/sounds';
import { STEPS_PER_SECOND } from '../engine/constants';
import type { Point } from '../engine/geometry';
import { isOffstage, otherPlayer, throwingHand, type PlayerIndex } from '../engine/gorillas';
import { previewTurn, type MatchState, type TurnAim } from '../engine/match';
import type { ShotRecord } from '../engine/shot';
import type { GorillaLook } from '../render/gorilla';
import { Scene, type SceneLook } from '../render/scene';
import type { Stage } from '../render/stage';
import { TargetView, type TargetMark } from '../render/targets';
import type { AimingMode } from '../settings';
import type { Hud } from '../ui/hud';
import { formatAim, type Aim } from './aim';
import type { Controls } from './controls';
import { HumanAim } from './human-aim';
import { ShotPlayback } from './playback';
import { reactTo, reactToNearMisses, type ReactionContext } from './reactions';

/**
 * One throw at a time from a fixed moment: a Trick Shot attempt, or a
 * challenge, where the challenger's shot is shown first. The match itself
 * is never changed (every throw is a preview of it), so a retry is instant:
 * the city is put back as it was and you aim again.
 */
export interface ShotSessionOptions {
  stage: Stage;
  hud: Hud;
  audio: AudioEngine;
  controls: Controls;
  reducedMotion: () => boolean;
  touch: () => boolean;
  /** The moment every attempt starts from. */
  state: MatchState;
  thrower: PlayerIndex;
  look: Omit<SceneLook, 'onThunder'>;
  names: [string, string];
  aiming: AimingMode;
  /** What the banner says as the scene opens, and the corner label. */
  banner: { title: string; subtitle: string };
  label: string;
  /** A rule to name beside the wind, if the attempt has one. */
  rule: string | null;
  marks: readonly TargetMark[];
  /** A gorilla to mark as the one to hit. */
  markedTarget: PlayerIndex | null;
  /** A shot to play before the first turn, from the same moment: the challenger's. */
  watch: { record: ShotRecord; look: GorillaLook; label: string; banner: string } | null;
  onPause(): void;
  /** Judges an attempt as its flight ends: retry at once, or wait for the page to decide. */
  onAttempt(record: ShotRecord, aim: TurnAim, attempt: number): AttemptReaction;
  onTurnStart?(): void;
  /** The player asked for another go; anything showing the last verdict should close. */
  onRetry?(): void;
}

export type AttemptReaction =
  | { kind: 'retry'; miss: { label: string; comment: string | null; landing: Point } | null }
  | { kind: 'wait' };

type Phase =
  | { kind: 'intro'; time: number }
  | { kind: 'watch'; playback: ShotPlayback; after: number }
  | { kind: 'aim' }
  | { kind: 'throw'; time: number; aim: Aim }
  | { kind: 'flight'; playback: ShotPlayback; aim: TurnAim; impact: number | null }
  | { kind: 'missed'; time: number }
  | { kind: 'waiting' };

const INTRO_SECONDS = 1.3;
const THROW_RELEASE = 0.13;
/** How long the challenger's shot lingers before your turn. */
const WATCHED_SECONDS = 1.2;
/** A miss shows how close it came for this long, unless the player retries sooner. */
const MISS_SECONDS = 1.4;
/** Slow motion when a gorilla is hit, then the verdict. */
const IMPACT_SECONDS = 1.1;
const DEFAULT_AIM: Aim = { angle: 45, power: 60 };

export class ShotSession {
  readonly scene: Scene;
  paused = false;
  private attempts = 0;
  private phase: Phase = { kind: 'intro', time: 0 };
  private readonly human = new HumanAim();
  private aim: Aim = { ...DEFAULT_AIM };
  /** Which windows were lit before any throw, to put the city back exactly. */
  private readonly pristineWindows: boolean[];
  private readonly ownLook: GorillaLook;
  private lastPath: Point[] | null = null;
  private missAt: Point | null = null;
  private worldSpeed = 1;

  constructor(private readonly options: ShotSessionOptions) {
    const { state, hud, stage, thrower } = options;
    this.scene = new Scene(state.round, {
      ...options.look,
      onThunder: () => this.sound('thunder'),
    });
    this.scene.targets = new TargetView(options.marks);
    this.scene.markedTarget = options.markedTarget;
    this.ownLook = this.scene.actors[thrower].look;
    stage.setScene(this.scene);
    stage.camera.rest(true);
    this.pristineWindows = this.scene.city.snapshot();

    const other = otherPlayer(thrower);
    hud.setPlayers(
      options.names,
      [false, false],
      [this.scene.actors[0].look.accent, this.scene.actors[1].look.accent],
    );
    hud.showPlate(other, !isOffstage(state.round.gorillas[other]));
    hud.showPlate(thrower, true);
    hud.setScores(null);
    hud.setTwist(options.rule);
    hud.setLabel(options.label);
    hud.setCounter(null);
    hud.resetWind();
    hud.clearMiss();
    hud.setMuted(options.audio.mix.muted);
    hud.show(true);
    hud.showBanner(options.banner.title, options.banner.subtitle);
    options.audio.playMusic(CITY_HUM);
    window.addEventListener('keydown', this.onTypedKey);
    if (options.watch) this.scene.actors[thrower].look = options.watch.look;
  }

  dispose() {
    const { hud } = this.options;
    window.removeEventListener('keydown', this.onTypedKey);
    hud.show(false);
    hud.showAim(null, '', 0);
    hud.showTyped(null, 'angle', '', null, false);
    hud.hint(null);
    hud.clearMiss();
    hud.setTwist(null);
    hud.setCounter(null);
    hud.showReplay(false);
    hud.showPlate(0, true);
    hud.showPlate(1, true);
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
    if (input.wasPressed('retry') && this.canRetry()) this.retry();
    this.advance(delta);
    this.scene.update(delta * this.worldSpeed, this.options.reducedMotion());
    this.options.stage.camera.update(delta);
    this.syncHud();
    document.body.dataset.phase = this.phase.kind;
  }

  toggleMute() {
    this.options.audio.toggleMute();
    this.options.hud.setMuted(this.options.audio.mix.muted);
  }

  keypad(key: string) {
    this.typeKey(key);
  }

  /** Straight back to aiming, with the city as it was: the single-key retry. */
  retry() {
    this.options.onRetry?.();
    this.restore();
    this.beginAim();
  }

  private canRetry(): boolean {
    return ['flight', 'missed', 'waiting', 'aim'].includes(this.phase.kind) && this.attempts > 0;
  }

  private advance(delta: number) {
    const phase = this.phase;
    switch (phase.kind) {
      case 'intro':
        phase.time += delta;
        if (phase.time < INTRO_SECONDS) break;
        if (this.options.watch) this.beginWatch(this.options.watch.record);
        else this.beginAim();
        break;
      case 'watch':
        this.watch(phase, delta);
        break;
      case 'aim':
        this.humanAim(delta);
        break;
      case 'throw':
        phase.time += delta;
        if (phase.time >= THROW_RELEASE) this.release(phase.aim);
        break;
      case 'flight':
        this.fly(phase, delta);
        break;
      case 'missed': {
        phase.time += delta;
        const { input } = this.options.controls;
        const skip = input.wasPressed('fire') || input.pointer.wasPressed;
        if (phase.time >= MISS_SECONDS || (skip && phase.time > 0.3)) this.retry();
        break;
      }
      case 'waiting':
        break;
    }
  }

  private beginWatch(record: ShotRecord) {
    const playback = new ShotPlayback(record, STEPS_PER_SECOND);
    this.scene.thrower = this.options.thrower;
    this.scene.actors[this.options.thrower].setMood('throw');
    this.sound('throw');
    this.options.hud.showReplay(true, this.options.watch?.label);
    this.phase = { kind: 'watch', playback, after: 0 };
  }

  private watch(phase: Extract<Phase, { kind: 'watch' }>, delta: number) {
    const { input } = this.options.controls;
    if (input.wasPressed('fire') || input.pointer.wasPressed) phase.after = WATCHED_SECONDS;
    else if (!phase.playback.done) {
      this.playEvents(phase.playback, delta, true);
      return;
    }
    this.scene.bananas = [];
    phase.after += delta;
    if (phase.after < WATCHED_SECONDS) return;
    this.options.hud.showReplay(false);
    this.lastPath = phase.playback.record.tracks[0]?.points ?? null;
    this.restore();
    this.scene.actors[this.options.thrower].look = this.ownLook;
    this.options.hud.showBanner('Your turn', this.options.watch?.banner ?? 'Match it or beat it');
    this.beginAim();
  }

  private beginAim() {
    const { thrower } = this.options;
    this.options.onTurnStart?.();
    this.human.reset();
    this.scene.activePlayer = thrower;
    this.scene.ghost = this.lastPath;
    this.scene.actors[thrower].setMood('aim');
    this.scene.actors[thrower].holdingBanana = true;
    this.scene.actors[thrower].aimAngle = this.aim.angle;
    this.options.stage.camera.rest();
    this.options.hud.hint(this.attempts === 0 ? this.aimHint() : null);
    this.phase = { kind: 'aim' };
    document.body.dataset.turn = String(thrower);
  }

  private aimHint(): string {
    if (this.options.aiming === 'typed') return 'Type the angle, Enter, then the velocity, Enter';
    return this.options.touch()
      ? 'Drag back from your gorilla to aim, let go to throw'
      : 'Drag back from your gorilla, or use ← → ↑ ↓ and Space · R retries';
  }

  private humanAim(delta: number) {
    const { thrower, controls, stage, state } = this.options;
    if (this.options.aiming === 'typed') return;
    const step = this.human.update(
      delta,
      thrower,
      this.aim,
      controls.input,
      stage.camera,
      state.round.gorillas[thrower],
    );
    if (step.ticked) this.sound('tick', 0.5);
    this.aim = step.aim;
    this.scene.aimLine = step.band;
    this.scene.actors[thrower].aimAngle = step.aim.angle;
    if (step.throwNow) this.beginThrow(step.aim);
  }

  private readonly onTypedKey = (event: KeyboardEvent) => {
    if (this.options.aiming !== 'typed' || this.paused) return;
    if (!/^([0-9.,]|Backspace|Enter)$/.test(event.key)) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return;
    this.typeKey(event.key);
  };

  private typeKey(key: string) {
    if (this.phase.kind !== 'aim') return;
    const result = this.human.typeKey(key);
    this.sound(result.kind === 'rejected' ? 'beep' : 'tick', result.kind === 'rejected' ? 1 : 0.6);
    if (result.kind === 'done') {
      this.aim = { angle: result.angle, power: result.velocity };
      this.beginThrow(this.aim);
    }
  }

  private beginThrow(aim: Aim) {
    this.scene.aimLine = null;
    this.scene.actors[this.options.thrower].setMood('throw');
    this.options.hud.hint(null);
    this.phase = { kind: 'throw', time: 0, aim };
  }

  private release(aim: Aim) {
    const { thrower, state } = this.options;
    const turnAim: TurnAim = { angle: aim.angle, velocity: aim.power, usePowerUp: true };
    const shot = previewTurn(state, turnAim);
    this.attempts++;
    const actor = this.scene.actors[thrower];
    actor.holdingBanana = false;
    const hand = throwingHand(state.round.gorillas[thrower], thrower);
    this.scene.effects.whoosh(hand.x, hand.y);
    this.scene.thrower = thrower;
    this.scene.ghost = null;
    this.scene.clearTrails();
    this.lastPath = shot.tracks[0]?.points ?? null;
    this.sound('throw');
    this.phase = {
      kind: 'flight',
      playback: new ShotPlayback(shot, STEPS_PER_SECOND),
      aim: turnAim,
      impact: null,
    };
  }

  private fly(phase: Extract<Phase, { kind: 'flight' }>, delta: number) {
    if (phase.impact !== null) {
      phase.impact += delta;
      this.worldSpeed = phase.impact < 0.8 ? 0.25 : 1;
      if (phase.impact >= IMPACT_SECONDS) this.judge(phase);
      return;
    }
    const hit = this.playEvents(phase.playback, delta, false);
    if (hit) {
      phase.impact = 0;
      return;
    }
    if (phase.playback.done) this.judge(phase);
  }

  /** Moves a playback on, reacting to what it passes; true once a gorilla is hit. */
  private playEvents(playback: ShotPlayback, delta: number, replaying: boolean): boolean {
    const shot = playback.record;
    const events = playback.advance(delta * this.worldSpeed);
    const bananas = playback.bananas;
    this.scene.bananas = bananas;
    this.scene.hazards.droneStep = playback.clock;
    let gorillaHit = false;
    for (const event of events) {
      reactTo(event, this.reactionContext(shot, replaying));
      if (event.type === 'gorilla') gorillaHit = true;
    }
    const lead = bananas[0];
    if (lead) {
      this.scene.skyBody.lookAt = lead;
      this.options.stage.camera.follow(lead);
      reactToNearMisses(
        this.scene,
        this.options.state.round.gorillas,
        bananas,
        shot.input.thrower,
        playback.clock,
      );
    }
    return gorillaHit && !replaying;
  }

  private judge(phase: Extract<Phase, { kind: 'flight' }>) {
    this.worldSpeed = 1;
    this.scene.bananas = [];
    const shot = phase.playback.record;
    const reaction = this.options.onAttempt(shot, phase.aim, this.attempts);
    if (reaction.kind === 'wait') {
      this.scene.activePlayer = null;
      this.phase = { kind: 'waiting' };
      return;
    }
    const { miss } = reaction;
    this.missAt = miss?.landing ?? null;
    this.options.hud.showMiss(
      miss ? { label: miss.label, comment: miss.comment, accent: this.ownLook.accent } : null,
    );
    this.scene.actors[this.options.thrower].setMood('facepalm');
    this.phase = { kind: 'missed', time: 0 };
  }

  /** The scene back to the moment every attempt starts from. */
  private restore() {
    const { state, thrower } = this.options;
    const { scene } = this;
    scene.city.restore(state.round.terrain.craters, state.round.terrain.cuts, this.pristineWindows);
    scene.targets?.reset();
    scene.effects.clear();
    scene.clearTrails();
    scene.bananas = [];
    scene.balloon = state.round.balloon;
    scene.hazards.droneStep = 0;
    scene.actors.forEach((actor, index) => actor.setMood(index === thrower ? 'aim' : 'idle'));
    this.worldSpeed = 1;
    this.missAt = null;
    this.options.hud.showMiss(null);
    this.options.hud.showReplay(false);
  }

  private reactionContext(shot: ShotRecord, replaying: boolean): ReactionContext {
    return {
      scene: this.scene,
      camera: this.options.stage.camera,
      gorillas: this.options.state.round.gorillas,
      names: this.options.names,
      thrower: shot.input.thrower,
      replaying,
      sound: (name, velocity) => this.sound(name, velocity),
      toast: (text) => this.options.hud.toast(text),
    };
  }

  private syncHud() {
    const { hud, stage, thrower, state } = this.options;
    const aiming = this.phase.kind === 'aim';
    hud.setTurn(aiming || this.phase.kind === 'throw' ? thrower : null);
    hud.setWind(state.round.wind, false, state.round.twists.includes('hiddenWind'));
    const typing = this.options.aiming === 'typed' && aiming;
    const { typed } = this.human;
    hud.showTyped(
      typing ? thrower : null,
      typed.field,
      typed.text,
      typed.angle,
      this.options.touch(),
    );
    const hand = throwingHand(state.round.gorillas[thrower], thrower);
    const label = stage.camera.toScreen({ x: hand.x + (thrower === 0 ? -6 : 6), y: hand.y - 10 });
    hud.showAim(aiming && !typing ? label : null, formatAim(this.aim), thrower);
    const bounds = { width: stage.surface.clientWidth, height: stage.surface.clientHeight };
    hud.placeMiss(this.missAt ? stage.camera.toScreen(this.missAt) : null, bounds);
    hud.setCounter(this.attempts > 0 ? `Attempt ${this.attempts + (aiming ? 1 : 0)}` : null);
  }

  private sound(name: SoundName, velocity = 1) {
    this.options.audio.play(SOUNDS[name] as Sound, { velocity });
  }
}
