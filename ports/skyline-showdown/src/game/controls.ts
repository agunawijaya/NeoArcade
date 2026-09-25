import { createInput, type Input } from '@shared/input';

export type Action =
  'left' | 'right' | 'up' | 'down' | 'fine' | 'fire' | 'powerUp' | 'pause' | 'mute' | 'guide';

const BINDINGS: Record<Action, readonly string[]> = {
  left: ['key:ArrowLeft', 'key:KeyA', 'pad:left', 'pad:leftX-'],
  right: ['key:ArrowRight', 'key:KeyD', 'pad:right', 'pad:leftX+'],
  up: ['key:ArrowUp', 'key:KeyW', 'pad:up', 'pad:leftY-', 'pad:rt'],
  down: ['key:ArrowDown', 'key:KeyS', 'pad:down', 'pad:leftY+', 'pad:lt'],
  fine: ['key:ShiftLeft', 'key:ShiftRight', 'pad:lb'],
  fire: ['key:Space', 'key:Enter', 'key:NumpadEnter', 'pad:a'],
  powerUp: ['key:KeyU', 'pad:y'],
  pause: ['key:Escape', 'key:KeyP', 'pad:start'],
  mute: ['key:KeyM'],
  guide: ['key:KeyC'],
};

/**
 * The game's controls on top of the shared input module. They can be
 * switched off while a menu is open, so Enter and Space go back to pressing
 * buttons instead of throwing bananas.
 */
export class Controls {
  readonly input: Input<Action>;
  private enabled = true;

  constructor(pointerTarget: HTMLElement) {
    this.input = createInput<Action>({ bindings: BINDINGS, pointerTarget });
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    for (const [action, bindings] of Object.entries(BINDINGS) as [Action, string[]][]) {
      this.input.rebind(action, bindings);
    }
  }

  /** Keeps only the gamepad bindings, so a controller can still pause and unpause. */
  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    for (const [action, bindings] of Object.entries(BINDINGS) as [Action, string[]][]) {
      this.input.rebind(
        action,
        action === 'pause' ? bindings.filter((binding) => binding.startsWith('pad:')) : [],
      );
    }
  }
}
