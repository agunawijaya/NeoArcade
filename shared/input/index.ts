import { parseBinding, type Binding } from './bindings';

export { PAD_AXES, PAD_BUTTONS, parseBinding, type Binding } from './bindings';

/**
 * One place that turns keyboard, pointer/touch and gamepads into named game
 * actions. A game polls it once per frame (or per fixed step):
 *
 *   const input = createInput({
 *     bindings: { fire: ['key:Space', 'pad:a', 'pointer'], left: ['key:ArrowLeft', 'pad:leftX-'] },
 *     pointerTarget: canvas,
 *   });
 *   input.update();
 *   if (input.wasPressed('fire')) throwBanana();
 */
export interface InputOptions<Action extends string> {
  bindings: Record<Action, readonly string[]>;
  /** Where key presses are heard. Defaults to the window. */
  keyboardTarget?: Window | HTMLElement;
  /** The play area; pointer coordinates are relative to it. */
  pointerTarget?: HTMLElement;
  /** Stick travel below this counts as rest. */
  deadzone?: number;
  getGamepads?: () => readonly (Gamepad | null)[];
}

export type InputDevice = 'keyboard' | 'pointer' | 'gamepad';

export interface PointerState {
  /** Position relative to the pointer target, in CSS pixels. */
  x: number;
  y: number;
  isDown: boolean;
  wasPressed: boolean;
  wasReleased: boolean;
  type: string;
}

export interface Input<Action extends string> {
  /** Takes a snapshot of every device. Call once per frame before reading. */
  update(): void;
  isDown(action: Action): boolean;
  /** Went down since the previous update(), even if already let go again. */
  wasPressed(action: Action): boolean;
  wasReleased(action: Action): boolean;
  /** 0..1; analog for sticks and triggers, 0 or 1 for everything else. */
  value(action: Action): number;
  /** -1..1 from a pair of opposing actions, e.g. axis('left', 'right'). */
  axis(negative: Action, positive: Action): number;
  rebind(action: Action, bindings: readonly string[]): void;
  readonly pointer: Readonly<PointerState>;
  /** The device the player touched last, for showing the right button prompts. */
  readonly lastDevice: InputDevice;
  readonly gamepadConnected: boolean;
  dispose(): void;
}

interface ActionState {
  bindings: Binding[];
  down: boolean;
  pressed: boolean;
  released: boolean;
  value: number;
}

export function createInput<Action extends string>(options: InputOptions<Action>): Input<Action> {
  const keyboardTarget = options.keyboardTarget ?? window;
  const pointerTarget = options.pointerTarget;
  const deadzone = options.deadzone ?? 0.25;
  const getGamepads = options.getGamepads ?? readNavigatorGamepads;

  const actions = new Map<Action, ActionState>();
  for (const [action, texts] of Object.entries(options.bindings) as [Action, string[]][]) {
    actions.set(action, emptyState(texts.map(parseBinding)));
  }
  const boundKeyCodes = () => {
    const codes = new Set<string>();
    for (const state of actions.values()) {
      for (const binding of state.bindings) if (binding.device === 'key') codes.add(binding.code);
    }
    return codes;
  };
  let keyCodesToCapture = boundKeyCodes();

  const keysDown = new Set<string>();
  // Keys pressed since the last update(), so a tap shorter than a frame still counts.
  const keysTapped = new Set<string>();
  let pointerTapped = false;
  let lastDevice: InputDevice = 'keyboard';
  let gamepadConnected = false;
  let activePointerId: number | null = null;

  const pointer: PointerState = {
    x: 0,
    y: 0,
    isDown: false,
    wasPressed: false,
    wasReleased: false,
    type: 'mouse',
  };
  let pointerWasDown = false;

  const onKeyDown = (event: Event) => {
    const { code, repeat } = event as KeyboardEvent;
    if (!keyCodesToCapture.has(code) || isTypingInto(event.target)) return;
    event.preventDefault();
    lastDevice = 'keyboard';
    if (repeat) return;
    keysDown.add(code);
    keysTapped.add(code);
  };
  const onKeyUp = (event: Event) => {
    keysDown.delete((event as KeyboardEvent).code);
  };
  const onBlur = () => {
    keysDown.clear();
    pointer.isDown = false;
    activePointerId = null;
  };

  const movePointer = (event: PointerEvent) => {
    if (!pointerTarget) return;
    const bounds = pointerTarget.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.type = event.pointerType || 'mouse';
  };
  const onPointerDown = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (pointerEvent.isPrimary === false || pointerEvent.button > 0) return;
    activePointerId = pointerEvent.pointerId;
    pointerTarget?.setPointerCapture?.(pointerEvent.pointerId);
    movePointer(pointerEvent);
    pointer.isDown = true;
    pointerTapped = true;
    lastDevice = 'pointer';
  };
  const onPointerMove = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (activePointerId !== null && pointerEvent.pointerId !== activePointerId) return;
    movePointer(pointerEvent);
  };
  const onPointerUp = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (pointerEvent.pointerId !== activePointerId) return;
    movePointer(pointerEvent);
    pointer.isDown = false;
    activePointerId = null;
  };

  keyboardTarget.addEventListener('keydown', onKeyDown);
  keyboardTarget.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  pointerTarget?.addEventListener('pointerdown', onPointerDown);
  pointerTarget?.addEventListener('pointermove', onPointerMove);
  pointerTarget?.addEventListener('pointerup', onPointerUp);
  pointerTarget?.addEventListener('pointercancel', onPointerUp);

  const readBinding = (binding: Binding, pads: readonly Gamepad[]): number => {
    switch (binding.device) {
      case 'key':
        return keysDown.has(binding.code) ? 1 : 0;
      case 'pointer':
        return pointer.isDown ? 1 : 0;
      case 'pad-button':
        return Math.max(0, ...pads.map((pad) => pad.buttons[binding.index]?.value ?? 0));
      case 'pad-axis':
        return Math.max(
          0,
          ...pads.map((pad) => stickTravel((pad.axes[binding.index] ?? 0) * binding.direction)),
        );
    }
  };

  // Rescales the stick so it reads 0 at the edge of the deadzone, not a jump to 0.25.
  const stickTravel = (raw: number) => (raw <= deadzone ? 0 : (raw - deadzone) / (1 - deadzone));

  const wasTapped = (bindings: Binding[]) =>
    bindings.some(
      (binding) =>
        (binding.device === 'key' && keysTapped.has(binding.code)) ||
        (binding.device === 'pointer' && pointerTapped),
    );

  const noteGamepadActivity = (pads: readonly Gamepad[]) => {
    const active = pads.some(
      (pad) =>
        pad.buttons.some((button) => button.pressed) ||
        pad.axes.some((axis) => Math.abs(axis) > deadzone),
    );
    if (active) lastDevice = 'gamepad';
  };

  const stateOf = (action: Action): ActionState => {
    const state = actions.get(action);
    if (!state) throw new Error(`Unknown input action "${action}".`);
    return state;
  };

  return {
    update() {
      const pads = getGamepads().filter((pad): pad is Gamepad => pad?.connected === true);
      gamepadConnected = pads.length > 0;
      noteGamepadActivity(pads);

      for (const state of actions.values()) {
        const wasDown = state.down;
        const tapped = wasTapped(state.bindings);
        state.value = Math.max(0, ...state.bindings.map((binding) => readBinding(binding, pads)));
        state.down = state.value > 0;
        state.pressed = tapped || (state.down && !wasDown);
        state.released = (wasDown && !state.down) || (tapped && !state.down);
      }

      pointer.wasPressed = pointerTapped || (pointer.isDown && !pointerWasDown);
      pointer.wasReleased = pointerWasDown && !pointer.isDown;
      pointerWasDown = pointer.isDown;
      keysTapped.clear();
      pointerTapped = false;
    },
    isDown: (action) => stateOf(action).down,
    wasPressed: (action) => stateOf(action).pressed,
    wasReleased: (action) => stateOf(action).released,
    value: (action) => stateOf(action).value,
    axis: (negative, positive) => stateOf(positive).value - stateOf(negative).value,
    rebind(action, bindings) {
      stateOf(action).bindings = bindings.map(parseBinding);
      keyCodesToCapture = boundKeyCodes();
    },
    pointer,
    get lastDevice() {
      return lastDevice;
    },
    get gamepadConnected() {
      return gamepadConnected;
    },
    dispose() {
      keyboardTarget.removeEventListener('keydown', onKeyDown);
      keyboardTarget.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pointerTarget?.removeEventListener('pointerdown', onPointerDown);
      pointerTarget?.removeEventListener('pointermove', onPointerMove);
      pointerTarget?.removeEventListener('pointerup', onPointerUp);
      pointerTarget?.removeEventListener('pointercancel', onPointerUp);
    },
  };
}

function emptyState(bindings: Binding[]): ActionState {
  return { bindings, down: false, pressed: false, released: false, value: 0 };
}

function readNavigatorGamepads(): readonly (Gamepad | null)[] {
  return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
}

// Typing a player name must not steer the game or get swallowed by preventDefault.
function isTypingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
