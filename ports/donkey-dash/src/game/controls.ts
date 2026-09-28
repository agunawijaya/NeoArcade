import { createInput, type Input } from '@shared/input';

/**
 * One button drives the car. Alone, it is every key worth pressing, a tap
 * anywhere on the road, or a gamepad's A. In Donkey vs Driver each player
 * owns half: the left or right half of the keyboard, the left or right half
 * of the screen, and their own gamepad.
 */
export type Action = 'press' | 'pause' | 'mute' | 'horn';

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

export class Controls {
  readonly input: Input<Action>;
  private readonly players: [Input<'press'>, Input<'press'>];
  private readonly taps: [number, number] = [0, 0];
  private versus = false;
  private enabled = true;

  constructor(private readonly surface: HTMLElement) {
    this.input = createInput<Action>({ bindings: SOLO, pointerTarget: surface });
    this.players = [0, 1].map((pad) =>
      createInput<'press'>({
        bindings: { press: pressBindings(pad) },
        getGamepads: () => [readPad(pad)],
      }),
    ) as [Input<'press'>, Input<'press'>];
    surface.addEventListener('pointerdown', this.onPointerDown);
    this.setVersus(false);
  }

  /** Splits the keyboard, the screen and the pads between two players. */
  setVersus(on: boolean) {
    this.versus = on;
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
    this.taps[0] = 0;
    this.taps[1] = 0;
  }

  private bind() {
    const table = !this.enabled ? MENU_ONLY : this.versus ? VERSUS : SOLO;
    for (const action of Object.keys(table) as Action[]) this.input.rebind(action, table[action]);
    this.players.forEach((player, index) => {
      player.rebind('press', this.versus && this.enabled ? pressBindings(index) : []);
    });
  }

  update() {
    this.input.update();
    for (const player of this.players) player.update();
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

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.versus || !this.enabled) return;
    const bounds = this.surface.getBoundingClientRect();
    const portrait = bounds.height > bounds.width;
    // Upright, the phone lies between the players: the far end belongs to player 2.
    const second = portrait
      ? event.clientY - bounds.top < bounds.height / 2
      : event.clientX - bounds.left > bounds.width / 2;
    this.taps[second ? 1 : 0] += 1;
  };
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
