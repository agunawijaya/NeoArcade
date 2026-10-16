import { createInput, type Input } from '@shared/input';
import type { RivalInput } from '../engine/rival';
import { DEFAULT_RIVAL_KEYS, type DriverKeys, type RivalKeys } from '../settings';

/**
 * One button drives the car. Alone, it is every key worth pressing, a tap
 * anywhere on the road, or a gamepad's A. In Donkey vs Driver each player
 * owns half: the left or right half of the keyboard, the left or right half
 * of the screen, and their own gamepad.
 *
 * Rival Driver is the one mode with more: four buttons, a lane left or right,
 * surge Ahead and drop back. Each driver has a key for each (W A S D, and the
 * arrow keys, unless rebound), a touch pad in their corner of the screen and
 * their own gamepad. Against the CPU the one player gets both sets of keys.
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

/** A Rival driver's four buttons, in the order of their keys. */
export const RIVAL_MOVES = ['left', 'right', 'surge', 'drop'] as const;
export type RivalMove = (typeof RIVAL_MOVES)[number];

const PAD_MOVES: Record<RivalMove, readonly string[]> = {
  left: ['pad:left', 'pad:leftX-', 'pad:lb', 'pad:lt'],
  right: ['pad:right', 'pad:leftX+', 'pad:rb', 'pad:rt'],
  surge: ['pad:up', 'pad:leftY-'],
  drop: ['pad:down', 'pad:leftY+'],
};

const NO_TAPS = (): Record<RivalMove, number> => ({ left: 0, right: 0, surge: 0, drop: 0 });

export class Controls {
  readonly input: Input<Action>;
  private readonly players: [Input<'press'>, Input<'press'>];
  private readonly drivers: [Input<RivalMove>, Input<RivalMove>];
  private readonly taps: [number, number] = [0, 0];
  /** Taps on each Rival driver's touch pad since the last step. */
  private readonly padTaps: [Record<RivalMove, number>, Record<RivalMove, number>] = [
    NO_TAPS(),
    NO_TAPS(),
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
      createInput<RivalMove>({
        bindings: NO_BINDINGS,
        getGamepads: () => [readPad(pad)],
        deadzone: 0.5,
      }),
    ) as [Input<RivalMove>, Input<RivalMove>];
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
    this.padTaps[0] = NO_TAPS();
    this.padTaps[1] = NO_TAPS();
  }

  /** A tap on a Rival driver's touch pad. */
  tap(driver: 0 | 1, move: RivalMove) {
    if (this.enabled) this.padTaps[driver][move] += 1;
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
      // Against the CPU, the one player may use either set of keys.
      const sets = !rival
        ? []
        : this.mode === 'rival-cpu'
          ? index === 0
            ? [...this.rivalKeys]
            : []
          : [this.rivalKeys[index] as DriverKeys];
      RIVAL_MOVES.forEach((move, slot) => {
        const keys = sets.map((codes) => `key:${codes[slot]}`);
        driver.rebind(move, sets.length > 0 ? [...keys, ...PAD_MOVES[move]] : []);
      });
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

  /** A Rival driver's buttons this step: their keys, their touch pad, their gamepad. */
  steering(driver: 0 | 1): RivalInput {
    const taps = this.padTaps[driver];
    const input = this.drivers[driver];
    this.padTaps[driver] = NO_TAPS();
    return {
      left: input.wasPressed('left') || taps.left > 0,
      right: input.wasPressed('right') || taps.right > 0,
      surge: input.wasPressed('surge') || taps.surge > 0,
      drop: input.wasPressed('drop') || taps.drop > 0,
    };
  }

  /** Donkey vs Driver splits the screen in two; Rival Driver has its touch pads instead. */
  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.enabled || this.mode !== 'versus') return;
    const bounds = this.surface.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const portrait = bounds.height > bounds.width;
    // Upright, the phone lies between the players: the far end belongs to player 2.
    const second = portrait ? y < 0.5 : x > 0.5;
    this.taps[second ? 1 : 0] += 1;
  };
}

const NO_BINDINGS: Record<RivalMove, readonly string[]> = {
  left: [],
  right: [],
  surge: [],
  drop: [],
};

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
