import { createInput, type Input } from '@shared/input';
import type { RivalInput } from '../engine/rival';
import { DEFAULT_RIVAL_KEYS, type RivalKeys } from '../settings';

/**
 * One button drives the car. Alone, it is every key worth pressing, a tap
 * anywhere on the road, or a gamepad's A. In Donkey vs Driver each player
 * owns half: the left or right half of the keyboard, the left or right half
 * of the screen, and their own gamepad.
 *
 * Rival Driver is the one mode with two buttons: left and right. Each driver
 * has a key for each (A and D, and the arrow keys, unless rebound), a pair of
 * touch zones on their own half of the screen and their own gamepad. Against
 * the CPU the one player gets both key pairs and the whole screen.
 */
export type Action = 'press' | 'pause' | 'mute' | 'horn';
export type PlayMode = 'solo' | 'versus' | 'rival' | 'rival-cpu';

const keys = (rows: string) => rows.trim().split(/\s+/);

const SOLO_KEYS = keys(`
  Space Enter NumpadEnter ArrowLeft ArrowRight ArrowUp ArrowDown
  KeyZ KeyX KeyA KeyD KeyW KeyS KeyJ KeyK
`);

/** Player 1's half of a QWERTY keyboard, row by row, and Space for their thumb. */
const LEFT_KEYS = keys(`
  Digit1 Digit2 Digit3 Digit4 Digit5
  KeyQ KeyW KeyE KeyR KeyT
  KeyA KeyS KeyD KeyF KeyG
  ShiftLeft KeyZ KeyX KeyC KeyV KeyB
  Space
`);

const RIGHT_KEYS = keys(`
  Digit6 Digit7 Digit8 Digit9 Digit0
  KeyY KeyU KeyI KeyO KeyP
  KeyH KeyJ KeyK KeyL Semicolon Enter NumpadEnter
  KeyN KeyM Comma Period Slash ShiftRight
  ArrowLeft ArrowRight ArrowUp ArrowDown
`);

const SOLO: Record<Action, readonly string[]> = {
  press: [
    ...SOLO_KEYS.map((code) => `key:${code}`),
    'pointer',
    'pad:a',
    'pad:x',
    'pad:lb',
    'pad:rb',
    'pad:lt',
    'pad:rt',
  ],
  pause: ['key:Escape', 'key:KeyP', 'pad:start'],
  mute: ['key:KeyM'],
  horn: ['key:KeyH', 'pad:y'],
};

/** Two players own every letter between them, so only Escape and Start are left to pause. */
const VERSUS: Record<Action, readonly string[]> = {
  press: [],
  pause: ['key:Escape', 'pad:start'],
  mute: [],
  horn: [],
};

const MENU_ONLY: Record<Action, readonly string[]> = {
  press: [],
  pause: ['pad:start'],
  mute: [],
  horn: [],
};

const PAD_LEFT = ['pad:left', 'pad:leftX-', 'pad:lb', 'pad:lt'];
const PAD_RIGHT = ['pad:right', 'pad:leftX+', 'pad:rb', 'pad:rt'];

type Steer = 'left' | 'right';

export class Controls {
  readonly input: Input<Action>;
  private readonly players: [Input<'press'>, Input<'press'>];
  private readonly drivers: [Input<Steer>, Input<Steer>];
  private readonly taps: [number, number] = [0, 0];
  private readonly steerTaps: [Record<Steer, number>, Record<Steer, number>] = [
    { left: 0, right: 0 },
    { left: 0, right: 0 },
  ];
  private mode: PlayMode = 'solo';
  private rivalKeys: RivalKeys = DEFAULT_RIVAL_KEYS;
  private enabled = true;

  constructor(private readonly surface: HTMLElement) {
    this.input = createInput<Action>({ bindings: SOLO, pointerTarget: surface });
    this.players = [0, 1].map((pad) =>
      createInput<'press'>({
        bindings: { press: [] },
        getGamepads: () => [readPad(pad)],
      }),
    ) as [Input<'press'>, Input<'press'>];
    this.drivers = [0, 1].map((pad) =>
      createInput<Steer>({
        bindings: { left: [], right: [] },
        getGamepads: () => [readPad(pad)],
        deadzone: 0.5,
      }),
    ) as [Input<Steer>, Input<Steer>];
    surface.addEventListener('pointerdown', this.onPointerDown);
    this.bind();
  }

  /** Splits the keyboard, the screen and the pads the way the mode needs. */
  setMode(mode: PlayMode) {
    this.mode = mode;
    this.bind();
  }

  setRivalKeys(keys: RivalKeys) {
    this.rivalKeys = keys;
    this.bind();
  }

  enable() {
    this.enabled = true;
    this.bind();
  }

  /** While a menu is open, keys go back to pressing buttons; a pad can still pause. */
  disable() {
    this.enabled = false;
    this.bind();
    this.taps.fill(0);
    for (const taps of this.steerTaps) {
      taps.left = 0;
      taps.right = 0;
    }
  }

  private bind() {
    const playing = this.enabled;
    const table = !playing ? MENU_ONLY : this.mode === 'solo' ? SOLO : this.rivalOrVersus();
    for (const action of Object.keys(table) as Action[]) this.input.rebind(action, table[action]);
    this.players.forEach((player, index) => {
      player.rebind('press', this.mode === 'versus' && playing ? pressBindings(index) : []);
    });
    const rival = playing && (this.mode === 'rival' || this.mode === 'rival-cpu');
    this.drivers.forEach((driver, index) => {
      // Against the CPU, the one player may use either pair of keys.
      const pairs = !rival
        ? []
        : this.mode === 'rival-cpu'
          ? index === 0
            ? [...this.rivalKeys]
            : []
          : [this.rivalKeys[index] as readonly [string, string]];
      const keysFor = (side: 0 | 1) => pairs.map((pair) => `key:${pair[side]}`);
      driver.rebind('left', pairs.length > 0 ? [...keysFor(0), ...PAD_LEFT] : []);
      driver.rebind('right', pairs.length > 0 ? [...keysFor(1), ...PAD_RIGHT] : []);
    });
  }

  /** In the two-player modes only Escape and Start pause, and in Rival Driver P and M too, if free. */
  private rivalOrVersus(): Record<Action, readonly string[]> {
    if (this.mode === 'versus') return VERSUS;
    const taken = new Set(this.rivalKeys.flat());
    const free = (code: string) => (taken.has(code) ? [] : [`key:${code}`]);
    return {
      press: [],
      pause: ['key:Escape', ...free('KeyP'), 'pad:start'],
      mute: free('KeyM'),
      horn: [],
    };
  }

  update() {
    this.input.update();
    for (const player of this.players) player.update();
    for (const driver of this.drivers) driver.update();
  }

  /** The one-button press, playing alone. */
  get pressed(): boolean {
    return this.input.wasPressed('press');
  }

  /** A player's press in Donkey vs Driver: their keys, their half of the screen, their pad. */
  playerPressed(player: 0 | 1): boolean {
    const tapped = this.taps[player] > 0;
    this.taps[player] = 0;
    return this.players[player].wasPressed('press') || tapped;
  }

  /** A Rival driver's left and right this step: their keys, their touch zones, their pad. */
  steering(driver: 0 | 1): RivalInput {
    const taps = this.steerTaps[driver];
    const input = this.drivers[driver];
    const steer = {
      left: input.wasPressed('left') || taps.left > 0,
      right: input.wasPressed('right') || taps.right > 0,
    };
    taps.left = 0;
    taps.right = 0;
    return steer;
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.enabled || this.mode === 'solo') return;
    const bounds = this.surface.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const portrait = bounds.height > bounds.width;
    if (this.mode === 'versus') {
      // Upright, the phone lies between the players: the far end belongs to player 2.
      const second = portrait ? y < 0.5 : x > 0.5;
      this.taps[second ? 1 : 0] += 1;
      return;
    }
    const zone = rivalZone(this.mode, portrait, x, y);
    this.steerTaps[zone.driver][zone.steer] += 1;
  };
}

/**
 * Which driver a touch belongs to and which way it steers. Against the CPU the
 * whole screen is one player's: left half, right half. Two players share it
 * like Donkey vs Driver, and each half is split again into left and right.
 */
export function rivalZone(
  mode: 'rival' | 'rival-cpu',
  portrait: boolean,
  x: number,
  y: number,
): { driver: 0 | 1; steer: Steer } {
  if (mode === 'rival-cpu') return { driver: 0, steer: x < 0.5 ? 'left' : 'right' };
  if (portrait) return { driver: y < 0.5 ? 1 : 0, steer: x < 0.5 ? 'left' : 'right' };
  const driver = x < 0.5 ? 0 : 1;
  const within = driver === 0 ? x * 2 : (x - 0.5) * 2;
  return { driver, steer: within < 0.5 ? 'left' : 'right' };
}

function pressBindings(player: number): string[] {
  const keys = player === 0 ? LEFT_KEYS : RIGHT_KEYS;
  return [...keys.map((code) => `key:${code}`), 'pad:a', 'pad:x', 'pad:rb', 'pad:rt'];
}

function readPad(index: number): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  return (
    [...navigator.getGamepads()].filter((pad): pad is Gamepad => pad?.connected === true)[index] ??
    null
  );
}
