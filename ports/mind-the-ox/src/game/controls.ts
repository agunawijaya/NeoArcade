import { createInput, type Input } from '@shared/input';
import { IDLE_CONTROLS, type Controls } from '../engine/world';
import { FLYING_ACTIONS, type FlyingAction } from '../settings';

/** A gamepad's part in flying: the left stick, triggers for the throttle, face buttons for weapons. */
const PAD: Readonly<Record<FlyingAction, readonly string[]>> = {
  pull: ['pad:leftY+', 'pad:down'],
  push: ['pad:leftY-', 'pad:up'],
  faster: ['pad:rt', 'pad:right'],
  slower: ['pad:lt', 'pad:left'],
  flip: ['pad:y'],
  fire: ['pad:a'],
  bomb: ['pad:x'],
  missile: ['pad:rb'],
  starburst: ['pad:lb'],
  home: ['pad:b'],
  loadout: ['pad:rs'],
};

/** Which gamepads a pilot listens to: any of them alone, or one each when two share a screen. */
export type PadChoice = 'any' | 0 | 1;

/**
 * One pilot's keys and gamepad, turned into what they ask of the plane.
 * Taps (flip, home) are remembered until the engine has had a tick to see
 * them, so a tap shorter than a frame still counts, and only once.
 */
export class PilotInput {
  private readonly input: Input<FlyingAction>;
  private pendingFlip = false;
  private pendingHome = false;
  private pendingSwap = false;

  constructor(
    keys: Readonly<Record<FlyingAction, string>>,
    pad: PadChoice,
    spareKeys: Readonly<Partial<Record<FlyingAction, string>>> = {},
  ) {
    const bindings = {} as Record<FlyingAction, readonly string[]>;
    for (const action of FLYING_ACTIONS) {
      const spare = spareKeys[action];
      bindings[action] = [
        `key:${keys[action]}`,
        ...(spare ? [`key:${spare}`] : []),
        ...PAD[action],
      ];
    }
    this.input = createInput({
      bindings,
      getGamepads:
        pad === 'any'
          ? undefined
          : () => {
              const pads = navigator.getGamepads?.() ?? [];
              return [pads[pad] ?? null];
            },
    });
  }

  /** Call once per display frame. */
  poll() {
    this.input.update();
    this.pendingFlip ||= this.input.wasPressed('flip');
    this.pendingHome ||= this.input.wasPressed('home');
    this.pendingSwap ||= this.input.wasPressed('loadout');
  }

  /**
   * Whether the pilot asked to swap bombs for a torpedo (or back) since the
   * last time this was asked. The page turns it into the loadout wanted,
   * as only it knows what the plane carries now.
   */
  takeSwap(): boolean {
    const swap = this.pendingSwap;
    this.pendingSwap = false;
    return swap;
  }

  /** What the pilot asks for this tick; a tap is used up by the first tick that reads it. */
  controls(): Controls {
    const input = this.input;
    const controls: Controls = {
      ...IDLE_CONTROLS,
      // W, the up arrow and the stick pulled back all bring the nose up, as in a real aeroplane.
      pitch: input.axis('push', 'pull'),
      throttle: input.axis('slower', 'faster'),
      flip: this.pendingFlip,
      fire: input.isDown('fire'),
      bomb: input.isDown('bomb'),
      missile: input.isDown('missile'),
      starburst: input.isDown('starburst'),
      home: this.pendingHome,
    };
    this.pendingFlip = false;
    this.pendingHome = false;
    return controls;
  }

  get usingGamepad(): boolean {
    return this.input.lastDevice === 'gamepad';
  }

  dispose() {
    this.input.dispose();
  }
}

/** Pause and camera: anyone may press them, on any keyboard or pad. */
export class GameKeys {
  private readonly input = createInput<'pause' | 'camera'>({
    bindings: {
      pause: ['key:Escape', 'key:KeyP', 'pad:start'],
      camera: ['key:Tab', 'pad:back'],
    },
  });

  poll() {
    this.input.update();
  }

  pausePressed(): boolean {
    return this.input.wasPressed('pause');
  }

  cameraPressed(): boolean {
    return this.input.wasPressed('camera');
  }

  dispose() {
    this.input.dispose();
  }
}

/** Two sets of controls asked at once: the keyboard or pad, then the touch screen on top. */
export function combine(first: Controls, second: Controls | null): Controls {
  if (!second) return first;
  return {
    pitch: second.pitch !== 0 ? second.pitch : first.pitch,
    throttle: second.throttle !== 0 ? second.throttle : first.throttle,
    flip: first.flip || second.flip,
    fire: first.fire || second.fire,
    bomb: first.bomb || second.bomb,
    missile: first.missile || second.missile,
    starburst: first.starburst || second.starburst,
    home: first.home || second.home,
  };
}
