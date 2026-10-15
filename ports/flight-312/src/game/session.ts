import { createLoop, type GameLoop } from '@shared/loop';
import type { Input } from '@shared/input';
import { RadioVoices } from '../audio/radio-voices';
import type { Soundscape, SoundState } from '../audio/soundscape';
import type { CockpitAction, CockpitView } from '../cockpit/actions';
import { Cockpit } from '../cockpit/cockpit';
import { lightingFor, type Lighting } from '../cockpit/palette';
import { cockpitModel } from '../cockpit/view-model';
import { JUMBO } from '../engine/aircraft';
import { answerReadback, type ReadbackChoice } from '../engine/atc';
import {
  allowedTimeScale,
  NO_INPUT,
  STEP_SECONDS,
  stepFlight,
  type Flight,
  type FlightEvent,
  type FlightInput,
  type Outcome,
} from '../engine/flight';
import { flapLeverDegrees, setLevers, setReverse } from '../engine/panel';
import type { Terrain } from '../engine/terrain';
import { skyAt } from '../engine/weather';
import { Hud, type HudHandlers } from '../ui/hud';
import type { Settings } from '../settings';
import { WorldView, type AircraftPose } from '../world/world-view';
import { clockText } from '../world/sun';
import {
  applyAction,
  autoCourse,
  cycleSpeedbrake,
  nextStation,
  stepFlaps,
  stepThrust,
  toggleProgramFlaps,
  turnCourse,
} from './controls';
import { createFlightInput, rebindAll, VIEW_KEYS, type FlightKey } from './input';

/**
 * One flight being flown: the engine stepped at its fixed rate (faster in
 * the cruise when the player asks and the engine allows), the world and
 * the cockpit drawn every frame, the keys, pad and pointer read once a
 * frame, and the engine's events turned into sound, voices, subtitles and
 * hints. It keeps the last minute and a half of the flight for the
 * replay's chase camera.
 */
export interface SessionHooks {
  ended(outcome: Outcome, replay: AircraftPose[]): void;
  pause(): void;
  chart(): void;
  checklist(): void;
  event(event: FlightEvent): void;
}

const LEVEL_NAMES = {
  rules1982: '1982 Rules',
  arcade: 'Arcade',
  pilot: 'Pilot',
  captain: 'Captain',
} as const;
const SCALES = [1, 2, 4, 8, 16];
const REPLAY_SECONDS = 90;
const REPLAY_EVERY = 0.1;
/** How quickly a held key moves the stick, the levers and the knobs. */
const KEY_STICK_RATE = 3.5;
const KEY_LEVER_RATE = 0.35;
const KEY_KNOB_RATE = 12;

export class FlightSession {
  private loop: GameLoop;
  private world: WorldView;
  private cockpit: Cockpit;
  private hud: Hud;
  private sound: Soundscape;
  private voices: RadioVoices;
  private input: Input<FlightKey>;
  private worldCanvas: HTMLCanvasElement;
  private view: CockpitView = 'main';
  private requestedScale = 1;
  private paused = false;
  private presses: FlightInput = { ...NO_INPUT };
  private held = { elevator: 0, aileron: 0, rudder: 0 };
  private stick = { pitch: 0, roll: 0 };
  private knobCarry = 0;
  private replay: AircraftPose[] = [];
  private lastReplayAt = -1;
  private lensKey = '';
  private ended = false;
  private replaying: { frames: AircraftPose[]; time: number } | null = null;
  /** For the screenshot runs: the flight has drawn its first frames. */
  private announced = false;
  /** Whether the gear was travelling last frame, so its lock is heard when it arrives. */
  private gearTravelling = false;
  private size = { width: 1, height: 1, ratio: 1 };

  constructor(
    private root: HTMLElement,
    readonly flight: Flight,
    terrain: Terrain,
    private settings: Settings,
    private hooks: SessionHooks,
    sound: Soundscape,
    private reducedMotion: boolean,
  ) {
    this.sound = sound;
    this.worldCanvas = document.createElement('canvas');
    this.worldCanvas.className = 'world';
    root.append(this.worldCanvas);
    this.world = new WorldView(
      this.worldCanvas,
      flight.world,
      terrain,
      settings.detail,
      flight.setup.level === 'arcade',
    );
    this.cockpit = new Cockpit(root, (action) => this.act(action));
    this.cockpit.onStick = (pitch, roll) => {
      this.stick = { pitch, roll };
    };
    const touch = matchMedia('(pointer: coarse)').matches;
    this.hud = new Hud(
      {
        answer: (choice) => this.answer(choice),
        view: (view) => this.setView(view),
        pause: () => hooks.pause(),
        chart: () => hooks.chart(),
        checklist: () => hooks.checklist(),
        touchThrust: (value) => this.act({ kind: 'levers', value }),
        touchButton: (button) => this.touchButton(button),
      },
      touch,
      flight.rules === 'program',
    );
    root.append(this.hud.element);
    this.voices = new RadioVoices(sound);
    this.voices.onNoVoices = () =>
      this.hud.showNotice(
        'This device has no offline voices, so the radio is shown as subtitles, with the clicks and static.',
        9,
      );
    this.applySettings(settings);
    this.input = createFlightInput(settings.controls, this.cockpit.canvas);
    this.loop = createLoop({
      update: () => this.update(),
      render: (_alpha, frameSeconds) => this.render(frameSeconds),
      stepSeconds: STEP_SECONDS,
      maxFrameSeconds: 0.1,
    });
    addEventListener('resize', this.resize);
    this.resize();
  }

  applySettings(settings: Settings) {
    this.settings = settings;
    this.voices.enabled = settings.atcVoice;
    this.voices.rate = settings.speakingRate;
    this.voices.volume = settings.voiceVolume;
    this.sound.setEffectsVolume(settings.effectsVolume);
    this.hud.subtitlesOn = settings.subtitles;
    this.world.setLivery(settings.livery);
    this.cockpit.showCap = settings.glareshieldCap;
    if (this.input) rebindAll(this.input, settings.controls);
  }

  start() {
    this.loop.start();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.voices.silence();
  }

  get currentView(): CockpitView {
    return this.view;
  }

  setView(view: CockpitView) {
    this.view = view;
    this.cockpit.setView(view, this.reducedMotion);
  }

  private resize = () => {
    const width = this.root.clientWidth || innerWidth;
    const height = this.root.clientHeight || innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, this.settings.detail === 'high' ? 2 : 1.25);
    this.cockpit.resize(width, height, Math.min(devicePixelRatio || 1, 2));
    this.size = { width, height, ratio };
    this.lensKey = '';
  };

  private act(action: CockpitAction) {
    if (action.kind === 'view') {
      this.setView(action.view);
      return;
    }
    if (action.kind === 'checklist') {
      this.hooks.checklist();
      return;
    }
    applyAction(this.flight, action);
    this.sound.play('click');
  }

  private answer(choice: ReadbackChoice['id']) {
    if (!this.flight.atc.pending) return;
    answerReadback(this.flight.atc, this.flight.atcContext, choice, this.flight.time);
  }

  private touchButton(button: Parameters<HudHandlers['touchButton']>[0]) {
    const flight = this.flight;
    switch (button) {
      case 'gear':
        this.act({ kind: 'gear' });
        return;
      case 'flapsDown':
        stepFlaps(flight, 1);
        return;
      case 'flapsUp':
        stepFlaps(flight, -1);
        return;
      case 'brakes':
        flight.panel.parkingBrake = !flight.panel.parkingBrake;
        return;
      case 'reverse':
        setReverse(flight.panel, flight.panel.reverse.some((lever) => lever > 0) ? 0 : 1);
        return;
      case 'speedbrake':
        cycleSpeedbrake(flight, 1);
        return;
      case 'flare':
        this.presses.flare = true;
        return;
    }
  }

  /** Reads the devices once a frame: held keys move sticks and levers, taps become presses and commands. */
  private poll(frameSeconds: number) {
    const input = this.input;
    input.update();
    const flight = this.flight;
    const program = flight.rules === 'program';
    const scheme = this.settings.controls;
    const shift = input.isDown('shift');
    const pressed = (key: FlightKey) => input.wasPressed(key);

    const pitchAxis = input.axis('pitchDown', 'pitchUp') * (this.settings.invertPitch ? -1 : 1);
    const rollAxis = input.axis('rollLeft', 'rollRight');
    const rudderAxis = input.axis('rudderLeft', 'rudderRight');
    const ease = (current: number, target: number) =>
      current + (target - current) * Math.min(1, frameSeconds * KEY_STICK_RATE);
    const programPitchKeys = program && scheme !== 'modern';
    this.held.elevator = ease(this.held.elevator, programPitchKeys ? 0 : pitchAxis);
    this.held.aileron = ease(this.held.aileron, rollAxis);
    this.held.rudder = ease(this.held.rudder, program && scheme !== 'modern' ? 0 : rudderAxis);

    if (scheme !== 'modern') {
      if (pressed('pitchUp')) this.presses.pitchSteps += 1;
      if (pressed('pitchDown')) this.presses.pitchSteps -= 1;
      if (pressed('rudderLeft')) this.presses.rudderSteps -= 1;
      if (pressed('rudderRight')) this.presses.rudderSteps += 1;
      if (pressed('rudderCentre')) this.presses.rudderCentre = true;
      if (pressed('thrustUp')) stepThrust(flight, 1);
      if (pressed('thrustDown')) stepThrust(flight, -1);
      if (pressed('flapsDown')) toggleProgramFlaps(flight.panel);
      if (pressed('nextStation')) nextStation(flight);
      if (pressed('courseUp')) turnCourse(flight, shift ? -10 : 10);
      if (pressed('autoCourse')) autoCourse(flight);
      if (pressed('flare')) this.presses.flare = true;
    } else {
      const thrust = input.value('thrustUp') - input.value('thrustDown');
      if (thrust !== 0) {
        flight.afds.autothrottle = false;
        if (shift) setLevers(flight.panel, thrust > 0 ? 1 : 0);
        else
          setLevers(
            flight.panel,
            (flight.panel.levers[0] ?? 0) + thrust * KEY_LEVER_RATE * frameSeconds,
          );
      }
      if (pressed('flapsDown')) stepFlaps(flight, 1);
      if (pressed('flapsUp')) stepFlaps(flight, -1);
      if (pressed('nextStation')) nextStation(flight);
      if (pressed('commSwap')) this.act({ kind: 'swapComm' });
      if (pressed('flare')) this.presses.flare = true;
    }
    if (pressed('gear')) this.act({ kind: 'gear' });
    if (pressed('speedbrake')) cycleSpeedbrake(flight, shift ? -1 : 1);
    if (pressed('parkingBrake')) this.act({ kind: 'parkingBrake' });
    if (pressed('reverse')) {
      setReverse(flight.panel, flight.panel.reverse.some((lever) => lever > 0) ? 0 : 1);
    }
    if (pressed('goAround')) this.presses.missedApproach = true;
    const buttons: [FlightKey, Parameters<typeof applyAction>[1]][] = [
      ['autopilot', { kind: 'button', button: 'autopilot' }],
      ['autothrottle', { kind: 'button', button: 'autothrottle' }],
      ['flightDirector', { kind: 'button', button: 'flightDirector' }],
      ['headingMode', { kind: 'button', button: 'heading' }],
      ['navMode', { kind: 'button', button: 'navigation' }],
      ['approachMode', { kind: 'button', button: 'approach' }],
      ['altitudeHold', { kind: 'button', button: 'altitudeHold' }],
      ['verticalSpeedMode', { kind: 'button', button: 'verticalSpeed' }],
      ['speedMode', { kind: 'button', button: 'speed' }],
    ];
    for (const [key, action] of buttons) if (pressed(key)) this.act(action);
    // Held knob keys turn their knob a dozen clicks a second; Shift turns them ten times as far.
    const heading = (input.isDown('headingRight') ? 1 : 0) - (input.isDown('headingLeft') ? 1 : 0);
    const altitude = (input.isDown('altitudeUp') ? 1 : 0) - (input.isDown('altitudeDown') ? 1 : 0);
    this.knobCarry += (heading !== 0 || altitude !== 0 ? KEY_KNOB_RATE : 0) * frameSeconds;
    if (
      pressed('headingRight') ||
      pressed('headingLeft') ||
      pressed('altitudeUp') ||
      pressed('altitudeDown')
    )
      this.knobCarry = 1;
    while (this.knobCarry >= 1) {
      this.knobCarry -= 1;
      if (heading !== 0)
        applyAction(flight, { kind: 'knob', knob: 'heading', clicks: heading * (shift ? 10 : 1) });
      if (altitude !== 0)
        applyAction(flight, {
          kind: 'knob',
          knob: 'altitude',
          clicks: altitude * (shift ? 1 : 10),
        });
    }

    if (flight.atc.pending) {
      const choices = flight.atc.pending.choices;
      (['answer1', 'answer2', 'answer3'] as const).forEach((key, index) => {
        const choice = choices[index];
        if (pressed(key) && choice) this.answer(choice.id);
      });
    } else {
      for (const [key, view] of VIEW_KEYS) if (pressed(key)) this.setView(view);
    }
    if (pressed('viewNext')) {
      const order = VIEW_KEYS.map(([, view]) => view);
      this.setView(order[(order.indexOf(this.view) + 1) % order.length] ?? 'main');
    }
    if (pressed('timeFaster'))
      this.requestedScale =
        SCALES[Math.min(SCALES.length - 1, SCALES.indexOf(this.requestedScale) + 1)] ?? 1;
    if (pressed('timeSlower'))
      this.requestedScale = SCALES[Math.max(0, SCALES.indexOf(this.requestedScale) - 1)] ?? 1;
    if (pressed('pause')) this.hooks.pause();
    if (pressed('chart')) this.hooks.chart();
    if (pressed('checklist')) this.hooks.checklist();
  }

  private currentInput(): FlightInput {
    const input = this.input;
    const elevator = Math.max(-1, Math.min(1, this.held.elevator + this.stick.pitch));
    const aileron = Math.max(-1, Math.min(1, this.held.aileron + this.stick.roll));
    return {
      ...this.presses,
      elevator,
      aileron,
      rudder: this.held.rudder,
      brakes: input.value('brakes'),
      trim: (input.isDown('trimUp') ? 1 : 0) - (input.isDown('trimDown') ? 1 : 0),
    };
  }

  private update() {
    if (this.ended) return;
    const events = stepFlight(this.flight, this.currentInput());
    // Presses belong to the frame's first step only.
    this.presses = { ...NO_INPUT };
    for (const event of events) this.handle(event);
    if (this.flight.time - this.lastReplayAt >= REPLAY_EVERY) {
      this.lastReplayAt = this.flight.time;
      const r = this.flight.readout;
      this.replay.push({
        position: r.position,
        altitudeFt: r.altitudeFt,
        headingTrue: r.headingTrue,
        pitchDeg: r.pitchDeg,
        bankDeg: r.bankDeg,
        gear: r.gear,
      });
      if (this.replay.length > REPLAY_SECONDS / REPLAY_EVERY) this.replay.shift();
    }
  }

  private handle(event: FlightEvent) {
    const flight = this.flight;
    switch (event.kind) {
      case 'atc':
        if (event.event.kind === 'transmission') {
          this.voices.say(event.event.transmission);
          this.hud.transmission(event.event.transmission, flight.time);
        }
        break;
      case 'callout':
        this.voices.callout(event.callout);
        break;
      case 'hint':
        if (!this.wantsHints()) break;
        if (this.settings.pauseOnHints && flight.setup.level === 'arcade') {
          this.setPaused(true);
          this.hud.showHint(event.hint, () => this.setPaused(false));
        } else this.hud.showHint(event.hint);
        break;
      case 'touchdown':
        this.sound.play('touchdown');
        break;
      case 'autopilotOff':
        this.sound.play('disconnect');
        break;
      case 'engineFlameout':
        this.hud.showNotice(`Engine ${event.engine + 1} has flamed out: no fuel.`);
        break;
      case 'unstable':
        this.hud.showNotice('First officer: "Not stable at a thousand — go around!"');
        break;
      case 'violation':
        this.hud.showNotice(event.violation.text);
        break;
      case 'ending':
        this.ended = true;
        this.voices.silence();
        this.hooks.ended(event.outcome, [...this.replay]);
        break;
      default:
        break;
    }
    this.hooks.event(event);
  }

  private wantsHints(): boolean {
    const level = this.flight.setup.level;
    if (level === 'arcade') return true;
    if (level === 'captain') return false;
    return this.settings.hints;
  }

  private lighting(): Lighting {
    const choice = this.settings.cockpitLighting;
    return choice === 'auto' ? lightingFor(this.world.night) : choice;
  }

  /** The last minute and a half again, from a chase camera circling slowly round the jumbo. */
  playReplay(frames: AircraftPose[]) {
    if (frames.length < 2) return;
    this.replaying = { frames, time: 0 };
    this.cockpit.canvas.hidden = true;
    this.hud.element.hidden = true;
    this.lensKey = '';
  }

  stopReplay() {
    this.replaying = null;
    this.cockpit.canvas.hidden = false;
    this.hud.element.hidden = false;
    this.lensKey = '';
  }

  private renderReplay(frameSeconds: number) {
    const replay = this.replaying;
    if (!replay) return;
    replay.time = (replay.time + frameSeconds) % ((replay.frames.length - 1) * REPLAY_EVERY);
    const at = replay.time / REPLAY_EVERY;
    const index = Math.floor(at);
    const from = replay.frames[index] as AircraftPose;
    const to = replay.frames[Math.min(index + 1, replay.frames.length - 1)] as AircraftPose;
    const t = at - index;
    const mix = (a: number, b: number) => a + (b - a) * t;
    const turn = ((((to.headingTrue - from.headingTrue) % 360) + 540) % 360) - 180;
    const pose: AircraftPose = {
      position: {
        lat: mix(from.position.lat, to.position.lat),
        lon: mix(from.position.lon, to.position.lon),
      },
      altitudeFt: mix(from.altitudeFt, to.altitudeFt),
      headingTrue: from.headingTrue + turn * t,
      pitchDeg: mix(from.pitchDeg, to.pitchDeg),
      bankDeg: mix(from.bankDeg, to.bankDeg),
      gear: mix(from.gear, to.gear),
    };
    const lensKey = `replay:${this.size.width}x${this.size.height}`;
    if (lensKey !== this.lensKey) {
      this.lensKey = lensKey;
      this.world.setSize(this.size.width, this.size.height, this.size.ratio, {
        horizontalFov: 60,
        boresight: 0.5,
      });
    }
    const orbit = this.reducedMotion ? 25 : 25 + replay.time * 3;
    this.world.render({
      pose,
      view: { kind: 'chase', distanceM: 120, heightM: 24, orbitDeg: orbit },
      clock: this.flight.clockStart + this.flight.time,
      time: this.flight.time,
    });
  }

  private render(frameSeconds: number) {
    if (this.replaying) {
      this.renderReplay(frameSeconds);
      return;
    }
    const flight = this.flight;
    // Read now, flown from the next frame's first step: one frame of latency, never a lost key.
    this.poll(frameSeconds);
    this.loop.timeScale =
      this.paused || this.ended ? 0 : allowedTimeScale(flight, this.requestedScale);
    const eye = this.cockpit.eye(frameSeconds, this.reducedMotion);
    const lensKey = `${eye.horizontalFov}:${eye.boresight.toFixed(3)}:${this.size.width}x${this.size.height}`;
    if (lensKey !== this.lensKey) {
      this.lensKey = lensKey;
      this.world.setSize(this.size.width, this.size.height, this.size.ratio, {
        horizontalFov: eye.horizontalFov,
        boresight: eye.boresight,
      });
    }
    const r = flight.readout;
    const pose: AircraftPose = {
      position: r.position,
      altitudeFt: r.altitudeFt,
      headingTrue: r.headingTrue,
      pitchDeg: r.pitchDeg,
      bankDeg: r.bankDeg,
      gear: r.gear,
    };
    const clock = flight.clockStart + flight.time;
    if (eye.world) {
      this.world.render({
        pose,
        view: { kind: 'cockpit', headYawDeg: eye.headYawDeg, headPitchDeg: eye.headPitchDeg },
        clock,
        time: flight.time,
      });
    }
    const raining = skyAt(flight.world.weather, r.position, r.altitudeFt).rain;
    this.cockpit.draw(
      cockpitModel(flight),
      this.lighting(),
      frameSeconds,
      this.reducedMotion,
      raining,
    );
    this.hud.readback(flight.atc.pending, flight.time);
    const scale = this.loop.timeScale;
    const status = `${clockText(clock)} · ${LEVEL_NAMES[flight.setup.level]}${scale > 1 ? ` · ×${scale}` : this.requestedScale > 1 ? ` · ×${this.requestedScale} held` : ''}${this.paused ? ' · paused' : ''}`;
    this.hud.update(frameSeconds, flight.time, status, this.view);
    const sound = this.soundState();
    if (this.gearTravelling && !sound.gearMoving) this.sound.play('gearLock');
    this.gearTravelling = sound.gearMoving;
    this.sound.update(sound, frameSeconds);
    if (!this.announced && flight.time > 1) {
      this.announced = true;
      document.body.dataset.ready = 'flight';
    }
  }

  private soundState(): SoundState {
    const r = this.flight.readout;
    const warnings = this.flight.warnings;
    const thrust = r.engines.reduce((sum, engine) => sum + Math.max(0, engine.thrust), 0);
    const airframe = this.flight.airframe;
    return {
      n1: r.engines.map((engine) => engine.n1),
      n2: r.engines.map((engine) => engine.n2),
      thrustShare: Math.min(1, thrust / (4 * JUMBO.staticThrustLbf)),
      airspeedKt: r.onGround ? r.iasKt * 0.6 : r.iasKt,
      rollingKt: r.onGround ? r.groundSpeedKt : 0,
      gearMoving: r.gear > 0.01 && r.gear < 0.99,
      flapsMoving: airframe
        ? Math.abs(airframe.flaps - flapLeverDegrees(this.flight.panel)) > 0.05
        : false,
      marker: this.flight.marker,
      stall: warnings.stall,
      gearHorn: warnings.gearHorn,
      takeoffConfig: warnings.takeoffConfig,
      overspeed: warnings.overspeed,
      radioBusy: this.voices.busy || this.flight.time < this.flight.atc.busyUntil,
      trimming: this.currentInput().trim !== 0,
    };
  }

  dispose() {
    this.loop.stop();
    removeEventListener('resize', this.resize);
    this.voices.silence();
    this.input.dispose();
    this.world.dispose();
    this.cockpit.dispose();
    this.hud.element.remove();
    this.worldCanvas.remove();
  }
}
